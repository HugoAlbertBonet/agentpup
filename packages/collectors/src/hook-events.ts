import type {
  EvidenceConfidence,
  Provider,
  RequestKind
} from "../../status/src/index.js";
import type {
  LiveRequestSnapshot,
  LiveSessionSnapshot
} from "./transcript-adapters.js";

type JsonObject = Record<string, unknown>;
const CODEX_APPROVAL_CONFIRMATION_GRACE_MS = 2_000;

export type HookEventKind =
  | "agent.started"
  | "agent.interrupted"
  | "agent.ended"
  | "request.opened"
  | "request.resolved"
  | "result.ready";

export interface HookEnvelope {
  protocolVersion: 1;
  provider: Provider;
  event: HookEventKind;
  eventId: string;
  observedAt: string;
  sessionId: string;
  turnId: string;
  agentId: string;
  parentAgentId?: string;
  project: string;
  requestId?: string;
  requestKind?: RequestKind;
  blocking?: boolean;
  confidence?: EvidenceConfidence;
  resolution?: "approved" | "answered" | "denied" | "cancelled" | "unknown";
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
  return cwd.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || "Unknown project";
}

function requestId(
  kind: "approval" | "question" | "plan",
  payload: JsonObject,
  turnId: string,
  agentId: string
): string {
  if (kind !== "approval") {
    const toolUseId = string(payload.tool_use_id) ?? string(payload.toolUseId);
    if (toolUseId !== undefined) return `${kind}:${toolUseId}`;
  }
  return `${kind}:${turnId}:${agentId}:${string(payload.tool_name) ?? "tool"}`;
}

export function normalizeHookPayload(
  provider: Provider,
  value: unknown,
  observedAt = new Date().toISOString()
): HookEnvelope | null {
  const payload = object(value);
  if (payload === undefined) return null;
  const hookName = string(payload.hook_event_name) ?? string(payload.hookEventName);
  const sessionId = string(payload.session_id) ?? string(payload.sessionId);
  if (hookName === undefined || sessionId === undefined) return null;
  const turnId = string(payload.turn_id) ?? string(payload.turnId) ?? sessionId;
  const agentId = string(payload.agent_id) ?? string(payload.agentId) ?? "root";
  const parentAgentId = agentId === "root" ? undefined : "root";
  const base = {
    protocolVersion: 1 as const,
    provider,
    eventId: `${provider}:${sessionId}:${hookName}:${turnId}:${agentId}:${observedAt}`,
    observedAt,
    sessionId,
    turnId,
    agentId,
    ...(parentAgentId === undefined ? {} : { parentAgentId }),
    project: projectName(string(payload.cwd))
  };

  switch (hookName) {
    case "SessionStart":
      return null;
    case "UserPromptSubmit":
    case "SubagentStart":
      return { ...base, event: "agent.started" };
    case "SessionEnd":
      return { ...base, event: "agent.ended" };
    case "Interrupt":
      return { ...base, event: "agent.interrupted" };
    case "Stop":
      return { ...base, event: "result.ready" };
    case "SubagentStop":
      return { ...base, event: "agent.ended" };
    case "PermissionRequest": {
      const toolName = string(payload.tool_name) ?? string(payload.toolName);
      if (
        provider === "claude-code" &&
        (toolName === "AskUserQuestion" || toolName === "ExitPlanMode")
      ) {
        return null;
      }
      const id = requestId("approval", payload, turnId, agentId);
      return {
        ...base,
        event: "request.opened",
        requestId: id,
        requestKind: "approval",
        blocking: true,
        ...(provider === "codex" ? { confidence: "provisional" as const } : {})
      };
    }
    case "PreToolUse": {
      const toolName = string(payload.tool_name) ?? string(payload.toolName);
      if (toolName !== "AskUserQuestion" && toolName !== "ExitPlanMode") {
        if (provider !== "codex") return null;
        return {
          ...base,
          event: "request.resolved",
          requestId: requestId("approval", payload, turnId, agentId),
          requestKind: "approval",
          resolution: "approved"
        };
      }
      const kind = toolName === "ExitPlanMode" ? "plan" : "question";
      return {
        ...base,
        event: "request.opened",
        requestId: requestId(kind, payload, turnId, agentId),
        requestKind: kind,
        blocking: true
      };
    }
    case "PostToolUse":
    case "PostToolUseFailure": {
      const toolName = string(payload.tool_name) ?? string(payload.toolName);
      if (
        provider === "claude-code" &&
        agentId !== "root" &&
        toolName === "SubagentHandback"
      ) {
        return { ...base, event: "agent.ended" };
      }
      const kind =
        toolName === "AskUserQuestion"
          ? "question"
          : toolName === "ExitPlanMode"
            ? "plan"
            : "approval";
      return {
        ...base,
        event: "request.resolved",
        requestId: requestId(kind, payload, turnId, agentId),
        requestKind: kind,
        resolution:
          hookName === "PostToolUseFailure"
            ? "cancelled"
            : kind === "approval"
              ? "approved"
              : "answered"
      };
    }
    default:
      return null;
  }
}

export function isHookEnvelope(value: unknown): value is HookEnvelope {
  const event = object(value);
  if (event === undefined) return false;
  return (
    event.protocolVersion === 1 &&
    ["codex", "claude-code"].includes(String(event.provider)) &&
    [
      "agent.started",
      "agent.interrupted",
      "agent.ended",
      "request.opened",
      "request.resolved",
      "result.ready"
    ].includes(String(event.event)) &&
    ["eventId", "observedAt", "sessionId", "turnId", "agentId", "project"].every(
      (key) => typeof event[key] === "string"
    )
  );
}

export function reconcileHookSnapshots(
  transcriptSnapshots: readonly LiveSessionSnapshot[],
  hookEvents: readonly HookEnvelope[],
  collectorPrefix: string,
  now = Date.now()
): LiveSessionSnapshot[] {
  const snapshots = new Map<string, LiveSessionSnapshot>();
  const keyOf = (provider: Provider, sessionId: string, agentId: string): string =>
    `${provider}:${sessionId}:${agentId}`;
  for (const snapshot of transcriptSnapshots) {
    snapshots.set(keyOf(snapshot.provider, snapshot.sessionId, snapshot.agentId), {
      ...snapshot,
      requests: snapshot.requests.map((request) => ({ ...request }))
    });
  }

  const ordered = hookEvents
    .filter(
      (event) =>
        !(event.event === "agent.started" && event.eventId.includes(":SessionStart:"))
    )
    .map((event) => {
      if (event.event === "result.ready" && event.eventId.includes(":SubagentStop:")) {
        return { ...event, event: "agent.ended" as const };
      }
      if (
        event.provider === "claude-code" &&
        event.agentId !== "root" &&
        event.event === "request.resolved" &&
        event.requestId?.endsWith(":SubagentHandback")
      ) {
        return { ...event, event: "agent.ended" as const };
      }
      return event;
    })
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  for (const event of ordered) {
    const key = keyOf(event.provider, event.sessionId, event.agentId);
    const existing = snapshots.get(key);
    const snapshot: LiveSessionSnapshot =
      existing ?? {
        provider: event.provider,
        collectorId: `${collectorPrefix}:${event.provider}`,
        sessionId: event.sessionId,
        agentId: event.agentId,
        ...(event.parentAgentId === undefined ? {} : { parentAgentId: event.parentAgentId }),
        displayName:
          event.agentId === "root"
            ? `Session ${event.sessionId.slice(0, 8)}`
            : `Agent ${event.agentId.slice(0, 8)}`,
        project: event.project,
        observedAt: "1970-01-01T00:00:00.000Z",
        activity: "unknown",
        turnId: event.turnId,
        resultReady: false,
        requests: []
      };
    if (event.observedAt < snapshot.observedAt) continue;
    snapshot.observedAt = event.observedAt;
    snapshot.turnId = event.turnId;
    if (event.project !== "Unknown project") snapshot.project = event.project;

    switch (event.event) {
      case "agent.started":
        snapshot.activity = "working";
        snapshot.resultReady = false;
        snapshot.requests = [];
        break;
      case "agent.interrupted":
        snapshot.activity = "interrupted";
        snapshot.resultReady = false;
        snapshot.requests = [];
        break;
      case "agent.ended":
        snapshot.activity = "ended";
        snapshot.resultReady = false;
        snapshot.requests = [];
        break;
      case "result.ready":
        snapshot.activity = "completed";
        snapshot.resultReady = true;
        snapshot.requests = [];
        break;
      case "request.opened": {
        if (event.requestId === undefined || event.requestKind === undefined) break;
        const existingRequest = snapshot.requests.find(
          (current) => current.requestId === event.requestId
        );
        const rawEventConfidence =
          event.confidence ??
          (event.provider === "codex" && event.eventId.includes(":PermissionRequest:")
            ? "provisional"
            : "confirmed");
        const eventConfidence =
          event.confidence === "provisional" &&
          now - Date.parse(event.observedAt) >= CODEX_APPROVAL_CONFIRMATION_GRACE_MS
            ? "confirmed"
            : rawEventConfidence;
        const request: LiveRequestSnapshot = {
          requestId: event.requestId,
          kind: event.requestKind,
          blocking: event.blocking ?? true,
          confidence:
            existingRequest?.confidence === "confirmed" ? "confirmed" : eventConfidence,
          evidence: `${event.provider === "codex" ? "Codex" : "Claude Code"} lifecycle hook`
        };
        snapshot.requests = [
          ...snapshot.requests.filter((current) => current.requestId !== event.requestId),
          request
        ];
        break;
      }
      case "request.resolved":
        if (event.requestId !== undefined) {
          snapshot.requests = snapshot.requests.filter(
            (request) => request.requestId !== event.requestId
          );
        }
        break;
    }
    snapshots.set(key, snapshot);
  }
  return [...snapshots.values()].sort((left, right) =>
    right.observedAt.localeCompare(left.observedAt)
  );
}
