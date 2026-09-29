import type {
  Activity,
  EvidenceConfidence,
  Provider,
  RequestKind
} from "../../status/src/index.js";

const ACTIVE_EVIDENCE_MS = 30 * 60_000;

type JsonObject = Record<string, unknown>;

export interface TranscriptAdapterContext {
  collectorId: string;
  modifiedAt: number;
  now: number;
}

export interface LiveRequestSnapshot {
  requestId: string;
  kind: RequestKind;
  blocking: boolean;
  confidence: EvidenceConfidence;
  evidence: string;
}

export interface LiveSessionSnapshot {
  provider: Provider;
  collectorId: string;
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  displayName: string;
  project: string;
  observedAt: string;
  activity: Activity;
  turnId: string;
  resultReady: boolean;
  requests: LiveRequestSnapshot[];
}

function object(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function projectName(cwd: string | undefined): string {
  if (cwd === undefined) return "Unknown project";
  const parts = cwd.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts.at(-1) || "Unknown project";
}

function timestamp(record: JsonObject, fallback: number): string {
  const value = string(record.timestamp);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date(fallback).toISOString();
}

function isFresh(context: TranscriptAdapterContext): boolean {
  return context.now - context.modifiedAt <= ACTIVE_EVIDENCE_MS;
}

function isUnfinishedActivity(activity: Activity): boolean {
  return activity === "working" || activity === "idle";
}

function isClaudeInterruptionMarker(content: readonly unknown[]): boolean {
  return content.some((value) => {
    const item = object(value);
    return item?.type === "text" && item.text === "[Request interrupted by user]";
  });
}

export function parseCodexTranscript(
  records: readonly unknown[],
  context: TranscriptAdapterContext
): LiveSessionSnapshot | null {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let activity: Activity = "unknown";
  let turnId = "unknown-turn";
  let resultReady = false;
  let observedAt = new Date(context.modifiedAt).toISOString();
  const pending = new Map<string, LiveRequestSnapshot>();

  for (const value of records) {
    const record = object(value);
    if (record === undefined) continue;
    const payload = object(record.payload);
    const recordType = string(record.type);
    observedAt = timestamp(record, context.modifiedAt);

    if (recordType === "session_meta" && payload !== undefined) {
      sessionId ??= string(payload.id);
      cwd ??= string(payload.cwd);
      continue;
    }
    if (recordType === "turn_context" && payload !== undefined) {
      cwd = string(payload.cwd) ?? cwd;
      continue;
    }
    if (recordType === "event_msg" && payload !== undefined) {
      const lifecycle = string(payload.type);
      const lifecycleTurn = string(payload.turn_id) ?? string(payload.root_turn_id);
      if (lifecycleTurn !== undefined) turnId = lifecycleTurn;
      if (lifecycle === "task_started") {
        activity = "working";
        resultReady = false;
      } else if (lifecycle === "task_complete") {
        activity = payload.error ? "failed" : "completed";
        resultReady = !payload.error;
      } else if (lifecycle === "turn_aborted") {
        activity = "interrupted";
        resultReady = false;
      }
      continue;
    }
    if (recordType !== "response_item" || payload === undefined) continue;

    const itemType = string(payload.type);
    const callId = string(payload.call_id) ?? string(payload.id);
    if (
      itemType === "function_call" &&
      callId !== undefined &&
      ["request_user_input", "request_user_input_async"].includes(string(payload.name) ?? "")
    ) {
      const asynchronous = payload.name === "request_user_input_async";
      pending.set(callId, {
        requestId: callId,
        kind: "question",
        blocking: !asynchronous,
        confidence: "confirmed",
        evidence: "Codex structured input request"
      });
    } else if (
      ["function_call_output", "custom_tool_call_output"].includes(itemType ?? "") &&
      callId !== undefined
    ) {
      pending.delete(callId);
    }
  }

  if (sessionId === undefined) return null;
  if (
    !isFresh(context) &&
    pending.size === 0 &&
    isUnfinishedActivity(activity)
  ) {
    activity = "unknown";
    resultReady = false;
  }

  return {
    provider: "codex",
    collectorId: context.collectorId,
    sessionId,
    agentId: "root",
    displayName: `Session ${sessionId.slice(0, 8)}`,
    project: projectName(cwd),
    observedAt,
    activity,
    turnId,
    resultReady,
    requests: [...pending.values()]
  };
}

export function parseClaudeTranscript(
  records: readonly unknown[],
  context: TranscriptAdapterContext
): LiveSessionSnapshot | null {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let activity: Activity = "unknown";
  let turnId = "unknown-turn";
  let resultReady = false;
  let observedAt = new Date(context.modifiedAt).toISOString();
  let rejectedToolResultId: string | undefined;
  const pending = new Map<string, LiveRequestSnapshot>();

  for (const value of records) {
    const record = object(value);
    if (record === undefined) continue;
    sessionId ??= string(record.sessionId);
    cwd = string(record.cwd) ?? cwd;
    observedAt = timestamp(record, context.modifiedAt);
    const recordType = string(record.type);
    const message = object(record.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const origin = object(record.origin);

    if (
      rejectedToolResultId !== undefined &&
      string(record.parentUuid) === rejectedToolResultId &&
      origin?.kind !== "human"
    ) {
      rejectedToolResultId = string(record.uuid) ?? rejectedToolResultId;
      continue;
    }

    if (recordType === "user") {
      if (
        string(record.userType) === "external" &&
        origin?.kind !== "human" &&
        isClaudeInterruptionMarker(content)
      ) {
        activity = "interrupted";
        resultReady = false;
        pending.clear();
        rejectedToolResultId = undefined;
        continue;
      }
      const userTurn = string(record.uuid) ?? string(message?.id) ?? string(record.timestamp);
      if (userTurn !== undefined) turnId = userTurn;
      let hasToolResult = false;
      let hasRejectedToolResult = false;
      for (const itemValue of content) {
        const item = object(itemValue);
        if (item?.type !== "tool_result") continue;
        hasToolResult = true;
        if (item.is_error === true && record.toolDenialKind === "user-rejected") {
          hasRejectedToolResult = true;
        }
        const toolUseId = string(item.tool_use_id);
        if (toolUseId !== undefined) pending.delete(toolUseId);
      }

      if (
        record.toolDenialKind === "automode-unavailable" &&
        record.toolDenialEndsTurn === true
      ) {
        activity = "failed";
        resultReady = true;
        pending.clear();
        rejectedToolResultId = string(record.uuid);
        continue;
      }

      if (hasRejectedToolResult) {
        activity = "interrupted";
        resultReady = false;
        rejectedToolResultId = string(record.uuid);
        continue;
      }

      rejectedToolResultId = undefined;
      activity = "working";
      resultReady = false;
      if (hasToolResult) continue;
    }

    if (recordType !== "assistant") continue;
    const messageId = string(message?.id);
    if (messageId !== undefined) turnId = messageId;
    let hasToolUse = false;
    let hasText = false;
    let openedBlockingRequest = false;
    for (const itemValue of content) {
      const item = object(itemValue);
      if (item?.type === "text") hasText = true;
      if (item?.type !== "tool_use") continue;
      hasToolUse = true;
      const toolName = string(item.name);
      const toolUseId = string(item.id);
      if (
        toolUseId !== undefined &&
        (toolName === "AskUserQuestion" || toolName === "ExitPlanMode")
      ) {
        const kind: RequestKind = toolName === "ExitPlanMode" ? "plan" : "question";
        pending.set(toolUseId, {
          requestId: toolUseId,
          kind,
          blocking: true,
          confidence: "confirmed",
          evidence: `Claude Code ${toolName} request`
        });
        openedBlockingRequest = true;
      }
    }

    if (openedBlockingRequest) {
      activity = "idle";
      resultReady = false;
    } else if (hasToolUse) {
      activity = "working";
      resultReady = false;
    } else if (hasText) {
      activity = "completed";
      resultReady = true;
    }
  }

  if (sessionId === undefined) return null;
  if (
    !isFresh(context) &&
    pending.size === 0 &&
    isUnfinishedActivity(activity)
  ) {
    activity = "unknown";
    resultReady = false;
  }

  return {
    provider: "claude-code",
    collectorId: context.collectorId,
    sessionId,
    agentId: "root",
    displayName: `Session ${sessionId.slice(0, 8)}`,
    project: projectName(cwd),
    observedAt,
    activity,
    turnId,
    resultReady,
    requests: [...pending.values()]
  };
}
