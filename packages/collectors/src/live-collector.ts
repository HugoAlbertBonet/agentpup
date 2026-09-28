import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  Activity,
  AgentIdentity,
  Provider,
  RequestKind,
  StatusEvent
} from "../../status/src/index.js";
import {
  parseClaudeTranscript,
  parseCodexTranscript,
  type LiveSessionSnapshot
} from "./transcript-adapters.js";

const READ_SLICE_BYTES = 128 * 1024;
const MAX_VISITED_ENTRIES = 20_000;

interface FileCandidate {
  filePath: string;
  modifiedAt: number;
  size: number;
}

export interface TranscriptScanOptions {
  codexHome: string;
  claudeHome: string;
  collectorPrefix: string;
  limitPerProvider: number;
  now: number;
}

export interface CollectorSnapshotMessage {
  protocolVersion: 1;
  type: "snapshot";
  events: StatusEvent[];
  diagnostics?: CollectorRuntimeDiagnostics;
}

export type HookConfiguration = "configured" | "not-configured" | "invalid" | "unknown";

export interface CollectorProviderDiagnostics {
  provider: Provider;
  version: string | null;
  hookConfiguration: HookConfiguration;
  hookEventsObserved: boolean;
}

export interface CollectorRuntimeDiagnostics {
  observedAt: string;
  transcriptFallback: boolean;
  providers: CollectorProviderDiagnostics[];
}

type EventValue = StatusEvent extends infer Event
  ? Event extends StatusEvent
    ? Omit<Event, "eventId" | "collectorId" | "sequence" | "observedAt">
    : never
  : never;

export async function findRecentJsonlFiles(
  root: string,
  limit: number,
  maxVisitedEntries = MAX_VISITED_ENTRIES
): Promise<FileCandidate[]> {
  const pending = [root];
  let nextDirectory = 0;
  const candidates: FileCandidate[] = [];
  let visited = 0;

  while (nextDirectory < pending.length && visited < maxVisitedEntries) {
    const directory = pending[nextDirectory++]!;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (["ENOENT", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
      throw error;
    }

    for (const entry of entries) {
      visited += 1;
      if (visited >= maxVisitedEntries) break;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const metadata = await stat(entryPath);
          candidates.push({
            filePath: entryPath,
            modifiedAt: metadata.mtimeMs,
            size: metadata.size
          });
        } catch {
          // A transcript can rotate between the directory read and stat.
        }
      }
    }
  }

  return candidates
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(0, Math.max(0, limit));
}

function parseLines(source: string, skipFirstPartialLine: boolean): unknown[] {
  const lines = source.split("\n");
  if (skipFirstPartialLine) lines.shift();
  const records: unknown[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Partial writes and a truncated final record are retried on the next scan.
    }
  }
  return records;
}

async function readTranscriptRecords(candidate: FileCandidate): Promise<unknown[]> {
  const handle = await open(candidate.filePath, "r");
  try {
    if (candidate.size <= READ_SLICE_BYTES * 2) {
      const buffer = Buffer.alloc(candidate.size);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return parseLines(buffer.subarray(0, bytesRead).toString("utf8"), false);
    }

    const head = Buffer.alloc(READ_SLICE_BYTES);
    const tail = Buffer.alloc(READ_SLICE_BYTES);
    const [headRead, tailRead] = await Promise.all([
      handle.read(head, 0, head.length, 0),
      handle.read(tail, 0, tail.length, candidate.size - tail.length)
    ]);
    return [
      ...parseLines(head.subarray(0, headRead.bytesRead).toString("utf8"), false),
      ...parseLines(tail.subarray(0, tailRead.bytesRead).toString("utf8"), true)
    ];
  } finally {
    await handle.close();
  }
}

async function parseCandidate(
  candidate: FileCandidate,
  provider: "codex" | "claude-code",
  options: TranscriptScanOptions
): Promise<LiveSessionSnapshot | null> {
  try {
    const records = await readTranscriptRecords(candidate);
    const context = {
      collectorId: `${options.collectorPrefix}:${provider}`,
      modifiedAt: candidate.modifiedAt,
      now: options.now
    };
    return provider === "codex"
      ? parseCodexTranscript(records, context)
      : parseClaudeTranscript(records, context);
  } catch {
    return null;
  }
}

export async function scanTranscriptSessions(
  options: TranscriptScanOptions
): Promise<LiveSessionSnapshot[]> {
  const [codexFiles, claudeFiles] = await Promise.all([
    findRecentJsonlFiles(path.join(options.codexHome, "sessions"), options.limitPerProvider),
    findRecentJsonlFiles(path.join(options.claudeHome, "projects"), options.limitPerProvider)
  ]);
  const snapshots = await Promise.all([
    ...codexFiles.map((candidate) => parseCandidate(candidate, "codex", options)),
    ...claudeFiles.map((candidate) => parseCandidate(candidate, "claude-code", options))
  ]);
  const unique = new Map<string, LiveSessionSnapshot>();
  for (const snapshot of snapshots) {
    if (snapshot === null) continue;
    if (snapshot.activity === "unknown" && snapshot.requests.length === 0) continue;
    const key = `${snapshot.provider}:${snapshot.sessionId}:${snapshot.agentId}`;
    const existing = unique.get(key);
    if (existing === undefined || snapshot.observedAt > existing.observedAt) {
      unique.set(key, snapshot);
    }
  }
  return [...unique.values()].sort((left, right) =>
    right.observedAt.localeCompare(left.observedAt)
  );
}

export function createSnapshotEvents(
  snapshots: readonly LiveSessionSnapshot[],
  collectorIds: readonly string[],
  observedAt: string
): StatusEvent[] {
  const events: StatusEvent[] = [];
  const sequenceByCollector = new Map<string, number>();
  const nextSequence = (collectorId: string): number => {
    const sequence = (sequenceByCollector.get(collectorId) ?? 0) + 1;
    sequenceByCollector.set(collectorId, sequence);
    return sequence;
  };
  const add = (
    collectorId: string,
    value: EventValue,
    eventObservedAt = observedAt
  ): void => {
    const sequence = nextSequence(collectorId);
    events.push({
      ...value,
      eventId: `${collectorId}:${sequence}:${value.type}`,
      collectorId,
      sequence,
      observedAt: eventObservedAt
    } as StatusEvent);
  };

  for (const collectorId of collectorIds) {
    add(collectorId, {
      type: "collector.connected",
      capabilities: [
        "filesystem-recovery",
        "lifecycle-hooks",
        "permissions",
        "structured-questions",
        "subagents"
      ]
    });
  }

  for (const snapshot of snapshots) {
    const identity: AgentIdentity = {
      provider: snapshot.provider,
      collectorId: snapshot.collectorId,
      sessionId: snapshot.sessionId,
      agentId: snapshot.agentId,
      ...(snapshot.parentAgentId === undefined
        ? {}
        : { parentAgentId: snapshot.parentAgentId }),
      displayName: snapshot.displayName,
      project: snapshot.project
    };
    add(snapshot.collectorId, { type: "agent.discovered", identity }, snapshot.observedAt);

    if (snapshot.activity !== "unknown") {
      add(
        snapshot.collectorId,
        { type: "agent.started", identity, turnId: snapshot.turnId },
        snapshot.observedAt
      );
      if (snapshot.resultReady) {
        add(
          snapshot.collectorId,
          { type: "result.ready", identity, turnId: snapshot.turnId },
          snapshot.observedAt
        );
      } else if (snapshot.activity !== "working") {
        add(
          snapshot.collectorId,
          {
            type: "agent.activity",
            identity,
            turnId: snapshot.turnId,
            activity: snapshot.activity
          },
          snapshot.observedAt
        );
      }
    }

    for (const request of snapshot.requests) {
      add(
        snapshot.collectorId,
        {
          type: "request.opened",
          identity,
          turnId: snapshot.turnId,
          request
        },
        snapshot.observedAt
      );
    }
  }
  return events;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validIdentity(value: unknown): boolean {
  const identity = object(value);
  if (identity === undefined) return false;
  return (
    ["claude-code", "codex"].includes(String(identity.provider)) &&
    ["collectorId", "sessionId", "agentId", "displayName", "project"].every(
      (key) => typeof identity[key] === "string"
    ) &&
    (identity.parentAgentId === undefined || typeof identity.parentAgentId === "string")
  );
}

function validStatusEvent(value: unknown): value is StatusEvent {
  const event = object(value);
  if (
    event === undefined ||
    typeof event.type !== "string" ||
    typeof event.eventId !== "string" ||
    typeof event.collectorId !== "string" ||
    !Number.isSafeInteger(event.sequence) ||
    typeof event.observedAt !== "string"
  ) {
    return false;
  }
  switch (event.type) {
    case "collector.connected":
      return strings(event.capabilities);
    case "collector.disconnected":
      return typeof event.reason === "string";
    case "agent.discovered":
      return validIdentity(event.identity);
    case "agent.started":
    case "result.ready":
      return validIdentity(event.identity) && typeof event.turnId === "string";
    case "agent.activity": {
      const activities: Activity[] = [
        "working",
        "idle",
        "completed",
        "failed",
        "interrupted",
        "ended"
      ];
      return (
        validIdentity(event.identity) &&
        typeof event.turnId === "string" &&
        activities.includes(event.activity as Activity)
      );
    }
    case "request.opened": {
      const request = object(event.request);
      const kinds: RequestKind[] = ["approval", "question", "plan", "mcp-input"];
      return (
        validIdentity(event.identity) &&
        request !== undefined &&
        typeof request.requestId === "string" &&
        kinds.includes(request.kind as RequestKind) &&
        typeof request.blocking === "boolean" &&
        ["provisional", "confirmed"].includes(String(request.confidence)) &&
        typeof request.evidence === "string"
      );
    }
    case "request.resolved":
      return (
        validIdentity(event.identity) &&
        typeof event.requestId === "string" &&
        ["approved", "answered", "denied", "cancelled", "unknown"].includes(
          String(event.resolution)
        )
      );
    case "result.acknowledged":
      return validIdentity(event.identity);
    default:
      return false;
  }
}

function validCollectorDiagnostics(value: unknown): value is CollectorRuntimeDiagnostics {
  const diagnostics = object(value);
  if (
    diagnostics === undefined ||
    typeof diagnostics.observedAt !== "string" ||
    Number.isNaN(Date.parse(diagnostics.observedAt)) ||
    typeof diagnostics.transcriptFallback !== "boolean" ||
    !Array.isArray(diagnostics.providers) ||
    diagnostics.providers.length > 2
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (const value of diagnostics.providers) {
    const provider = object(value);
    if (provider === undefined || !["codex", "claude-code"].includes(String(provider.provider))) {
      return false;
    }
    if (seen.has(String(provider.provider))) return false;
    seen.add(String(provider.provider));
    if (
      !(
        provider.version === null ||
        (typeof provider.version === "string" &&
          provider.version.length > 0 &&
          provider.version.length <= 160 &&
          !/[\r\n]/.test(provider.version))
      ) ||
      !["configured", "not-configured", "invalid", "unknown"].includes(
        String(provider.hookConfiguration)
      ) ||
      typeof provider.hookEventsObserved !== "boolean"
    ) {
      return false;
    }
  }
  return true;
}

export function parseCollectorMessage(line: string): CollectorSnapshotMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const message = object(value);
  if (
    message?.protocolVersion !== 1 ||
    message.type !== "snapshot" ||
    !Array.isArray(message.events) ||
    !message.events.every(validStatusEvent) ||
    (message.diagnostics !== undefined && !validCollectorDiagnostics(message.diagnostics))
  ) {
    return null;
  }
  return message as unknown as CollectorSnapshotMessage;
}
