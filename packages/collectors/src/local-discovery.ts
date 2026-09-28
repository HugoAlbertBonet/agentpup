import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { AgentIdentity, Provider, StatusEvent } from "../../status/src/index.js";

export interface DiscoveryOptions {
  codexHome: string;
  claudeHome: string;
  limitPerProvider: number;
}

export interface DiscoveredSession {
  provider: Provider;
  collectorId: string;
  sessionId: string;
  project: string;
  displayName: string;
  observedAt: string;
}

interface FileCandidate {
  filePath: string;
  modifiedAt: Date;
}

export async function findRecentLocalJsonlFiles(
  root: string,
  limit: number,
  maxVisitedEntries = 10_000
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries) {
      visited += 1;
      if (visited >= maxVisitedEntries) break;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const metadata = await stat(entryPath);
        candidates.push({ filePath: entryPath, modifiedAt: metadata.mtime });
      }
    }
  }

  return candidates
    .sort((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime())
    .slice(0, Math.max(0, limit));
}

async function readPrefix(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(128 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function readJsonString(source: string, key: string): string | undefined {
  const expression = new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`);
  const match = expression.exec(source);
  if (match?.[1] === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(match[1]);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function projectName(cwd: string | undefined): string {
  if (cwd === undefined || cwd.length === 0) return "Unknown project";
  const name = path.basename(path.normalize(cwd));
  return name.length > 0 && name !== path.sep ? name : "Unknown project";
}

async function readCodexSession(candidate: FileCandidate): Promise<DiscoveredSession | null> {
  const prefix = await readPrefix(candidate.filePath);
  if (!/"type"\s*:\s*"session_meta"/.test(prefix)) return null;
  const sessionId = readJsonString(prefix, "id");
  if (sessionId === undefined) return null;
  const cwd = readJsonString(prefix, "cwd");

  return {
    provider: "codex",
    collectorId: "local-codex",
    sessionId,
    project: projectName(cwd),
    displayName: `Session ${sessionId.slice(0, 8)}`,
    observedAt: candidate.modifiedAt.toISOString()
  };
}

async function readClaudeSession(candidate: FileCandidate): Promise<DiscoveredSession | null> {
  const prefix = await readPrefix(candidate.filePath);
  const sessionId = readJsonString(prefix, "sessionId");
  if (sessionId === undefined) return null;
  const cwd = readJsonString(prefix, "cwd");

  return {
    provider: "claude-code",
    collectorId: "local-claude-code",
    sessionId,
    project: projectName(cwd),
    displayName: `Session ${sessionId.slice(0, 8)}`,
    observedAt: candidate.modifiedAt.toISOString()
  };
}

export async function discoverLocalSessions(
  options: DiscoveryOptions
): Promise<DiscoveredSession[]> {
  const [codexFiles, claudeFiles] = await Promise.all([
    findRecentLocalJsonlFiles(path.join(options.codexHome, "sessions"), options.limitPerProvider),
    findRecentLocalJsonlFiles(path.join(options.claudeHome, "projects"), options.limitPerProvider)
  ]);
  const discovered = await Promise.all([
    ...codexFiles.map(readCodexSession),
    ...claudeFiles.map(readClaudeSession)
  ]);
  const unique = new Map<string, DiscoveredSession>();

  for (const session of discovered) {
    if (session === null) continue;
    const key = `${session.provider}:${session.sessionId}`;
    if (!unique.has(key)) unique.set(key, session);
  }

  return [...unique.values()].sort((left, right) =>
    right.observedAt.localeCompare(left.observedAt)
  );
}

export function discoveredSessionsToEvents(sessions: readonly DiscoveredSession[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  const sequenceByCollector = new Map<string, number>();
  const connectedCollectors = new Set<string>();

  for (const session of sessions) {
    if (!connectedCollectors.has(session.collectorId)) {
      events.push({
        type: "collector.connected",
        eventId: `${session.collectorId}:discovery-connected`,
        collectorId: session.collectorId,
        sequence: 1,
        observedAt: session.observedAt,
        capabilities: ["filesystem-discovery"]
      });
      connectedCollectors.add(session.collectorId);
      sequenceByCollector.set(session.collectorId, 1);
    }

    const sequence = (sequenceByCollector.get(session.collectorId) ?? 1) + 1;
    sequenceByCollector.set(session.collectorId, sequence);
    const identity: AgentIdentity = {
      provider: session.provider,
      collectorId: session.collectorId,
      sessionId: session.sessionId,
      agentId: "root",
      displayName: session.displayName,
      project: session.project
    };
    events.push({
      type: "agent.discovered",
      eventId: `${session.collectorId}:${session.sessionId}:discovered`,
      collectorId: session.collectorId,
      sequence,
      observedAt: session.observedAt,
      identity
    });
  }

  return events;
}
