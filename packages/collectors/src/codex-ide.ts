import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import path from "node:path";
import type { LiveSessionSnapshot } from "./transcript-adapters.js";
import { sessionTitle } from "./session-names.js";

// Versioned, fallible IDE IPC adapter, verified against extension 26.1106.51428.
// Keep only status/title/request identifiers; never retain streamed turns or tool data.
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
const text = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const approvalMethods = new Set([
  "item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval"
]);
interface IdeRequest { id: string | number; method: string; turnId?: string }
export interface CodexIdeThread {
  id: string;
  sourceClientId?: string;
  revision: number;
  title?: string;
  cwd?: string;
  runtime: { type: string; activeFlags: string[] };
  requests: Array<IdeRequest | null>;
  observedAt: string;
}

function requestMetadata(value: unknown): IdeRequest | null {
  const request = object(value);
  if (!request || !approvalMethods.has(String(request.method)) ||
      !(typeof request.id === "string" || typeof request.id === "number")) return null;
  const turnId = text(object(request.params)?.turnId) ?? text(request.turnId);
  return { id: request.id, method: String(request.method), ...(turnId ? { turnId } : {}) };
}

function runtimeMetadata(value: unknown): CodexIdeThread["runtime"] {
  const status = object(value);
  return { type: text(status?.type) ?? "unknown", activeFlags: Array.isArray(status?.activeFlags)
    ? status.activeFlags.filter((flag): flag is string => flag === "waitingOnApproval" || flag === "waitingOnUserInput") : [] };
}

export function encodeIdeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

export function createIdeFrameDecoder(onMessage: (message: unknown) => void) {
  let buffer = Buffer.alloc(0);
  return { push(chunk: Buffer) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE(0);
      if (size === 0 || size > 32 * 1024 * 1024) throw new Error("Invalid IDE frame size");
      if (buffer.length < size + 4) return;
      const body = buffer.subarray(4, size + 4);
      buffer = buffer.subarray(size + 4);
      onMessage(JSON.parse(body.toString("utf8")));
    }
  } };
}

export class CodexIdeState {
  private readonly values = new Map<string, CodexIdeThread>();
  threads(): CodexIdeThread[] { return [...this.values.values()]; }
  clear(): void { this.values.clear(); }
  /** Return a session ID when a fresh snapshot is required. */
  receive(value: unknown, observedAt: string): string | undefined {
    const message = object(value);
    if (message?.type === "broadcast" && message.method === "client-status-changed") {
      const client = object(message.params);
      if (client?.status === "disconnected") {
        for (const [id, thread] of this.values) if (thread.sourceClientId === client.clientId) this.values.delete(id);
      }
      return;
    }
    if (message?.type !== "broadcast" || message.method !== "thread-stream-state-changed") return;
    const params = object(message.params);
    const id = text(params?.conversationId);
    if (!id || params?.hostId !== "local") return;
    if (message.version !== 11) { this.values.delete(id); return; }
    const change = object(params.change);
    if (!change || !Number.isSafeInteger(change.revision)) return;
    const previous = this.values.get(id);
    const sourceClientId = text(message.sourceClientId);
    if (change.type === "snapshot") {
      const state = object(change.conversationState);
      if (!state || state.id !== id || !Array.isArray(state.requests) || state.requests.length > 200) {
        this.values.delete(id); return;
      }
      if (!previous && this.values.size >= 200) return;
      if (previous && sourceClientId === previous.sourceClientId && (change.revision as number) < previous.revision) return;
      this.values.set(id, {
        id, revision: change.revision as number,
        ...(sourceClientId ? { sourceClientId } : {}),
        ...(sessionTitle(state.title) ? { title: sessionTitle(state.title)! } : {}),
        ...(text(state.cwd) ? { cwd: text(state.cwd)! } : {}),
        runtime: runtimeMetadata(state.threadRuntimeStatus),
        requests: state.requests.map(requestMetadata), observedAt
      });
      return;
    }
    if (change.type !== "patches" || !Array.isArray(change.patches)) return;
    if (previous && sourceClientId !== previous.sourceClientId) return;
    if (previous && (change.revision as number) <= previous.revision) return;
    if (!previous || change.baseRevision !== previous.revision) { this.values.delete(id); return id; }
    for (const value of change.patches) {
      const patch = object(value);
      const keys = patch?.path;
      if (!patch || !Array.isArray(keys) || !["add", "replace", "remove"].includes(String(patch.op))) continue;
      const [field, index, nested, last] = keys;
      const removed = patch.op === "remove";
      if (field === "title" && keys.length === 1) {
        const title = removed ? undefined : sessionTitle(patch.value);
        if (title) previous.title = title; else delete previous.title;
      } else if (field === "cwd" && keys.length === 1) {
        const cwd = removed ? undefined : text(patch.value);
        if (cwd) previous.cwd = cwd; else delete previous.cwd;
      } else if (field === "threadRuntimeStatus") {
        if (keys.length === 1) previous.runtime = runtimeMetadata(removed ? null : patch.value);
        else if (index === "type" && keys.length === 2) previous.runtime.type = text(patch.value) ?? "unknown";
        else if (index === "activeFlags") {
          // Nested flag edits require a fresh snapshot; never retain a stale wait flag.
          if (keys.length !== 2) { this.values.delete(id); return id; }
          previous.runtime = runtimeMetadata({ ...previous.runtime, activeFlags: removed ? [] : patch.value });
        }
      } else if (field === "requests") {
        if (keys.length === 1 && (removed || Array.isArray(patch.value))) {
          if (!removed && (patch.value as unknown[]).length > 200) { this.values.delete(id); return; }
          previous.requests = removed ? [] : (patch.value as unknown[]).map(requestMetadata);
        } else if (Number.isSafeInteger(index) && Number(index) >= 0 && Number(index) < 200) {
          const slot = Number(index);
          if (keys.length === 2) {
            if (removed) previous.requests.splice(slot, 1);
            else previous.requests[slot] = requestMetadata(patch.value);
          } else if (keys.length >= 3 && (nested === "id" || nested === "method" ||
              (nested === "params" && last === "turnId"))) {
            // Request metadata edits are rare; resync rather than reconstructing private objects.
            this.values.delete(id); return id;
          }
        } else if (index === "length") {
          if (!Number.isSafeInteger(patch.value) || Number(patch.value) > 200 || Number(patch.value) < 0) {
            this.values.delete(id); return;
          }
          previous.requests.length = Number(patch.value);
        }
      }
    }
    previous.revision = change.revision as number;
    previous.observedAt = observedAt;
  }
}

export function applyCodexIdeState(
  sessions: readonly LiveSessionSnapshot[], threads: readonly CodexIdeThread[], prefix: string, now: string
): LiveSessionSnapshot[] {
  const output = sessions.map(session => ({ ...session, requests: session.requests.filter(request =>
    session.provider !== "codex" || !request.requestId.startsWith("codex-ide:")) }));
  for (const thread of threads) {
    let session = output.find(value => value.provider === "codex" && value.sessionId === thread.id && value.agentId === "root");
    const requests = thread.runtime.type === "active" && thread.runtime.activeFlags.includes("waitingOnApproval")
      ? thread.requests.filter((value): value is IdeRequest => value !== null && value !== undefined) : [];
    if (!session && requests.length === 0) continue;
    if (!session) {
      session = { provider: "codex", collectorId: `${prefix}:codex`, sessionId: thread.id, agentId: "root",
        displayName: thread.title ?? "Untitled session", project: thread.cwd?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || "Unknown project",
        observedAt: thread.observedAt, activity: "working", turnId: requests[0]?.turnId ?? thread.id,
        resultReady: false, requests: [] };
      output.push(session);
    }
    if (thread.title) session.displayName = thread.title;
    if (requests.length > 0) {
      session.activity = "working";
      session.resultReady = false;
      session.observedAt = now;
      session.requests = session.requests.filter(request => request.kind !== "approval");
      session.requests.push(...requests.map(request => ({ requestId: `codex-ide:${request.id}`, kind: "approval" as const,
        blocking: true, confidence: "confirmed" as const, evidence: "Codex IDE pending approval request" })));
    }
  }
  return output;
}

export interface CodexIdeObserver {
  state: CodexIdeState;
  follow(sessionIds: readonly string[]): void;
  stop(): void;
}

/** Passive follower only. No request/decision/control methods can be sent here. */
export function startCodexIdeObserver(codexHome: string, onChange: () => void): CodexIdeObserver {
  const state = new CodexIdeState();
  const socketPath = path.join(codexHome, "ipc", "ipc.sock");
  let socket: Socket | undefined;
  let stopped = false;
  let initialized = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const wanted = new Set<string>();
  const followed = new Set<string>();
  const initializeId = randomUUID();
  const send = (value: unknown): void => { if (socket?.writable) socket.write(encodeIdeFrame(value)); };
  const follow = (id: string, resync = false): void => {
    if (!initialized || (followed.has(id) && !resync) || id.length > 160 ||
        (!followed.has(id) && followed.size >= 200)) return;
    followed.add(id);
    if (resync) send({ type: "broadcast", method: "thread-stream-following-changed", version: 1,
      params: { conversationId: id, hostId: "local", following: false } });
    send({ type: "broadcast", method: "thread-stream-following-changed", version: 1,
      params: { conversationId: id, hostId: "local", following: true } });
  };
  const connect = async (): Promise<void> => {
    if (stopped || process.platform === "win32") return;
    try {
      const [directory, metadata] = await Promise.all([lstat(path.dirname(socketPath)), lstat(socketPath)]);
      const uid = process.getuid?.();
      if (uid === undefined || !directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o022) !== 0 ||
          !metadata.isSocket() || metadata.uid !== uid) throw new Error("Untrusted IDE socket");
      if (stopped) return;
      const connection = createConnection(socketPath);
      connection.setTimeout(5000, () => connection.destroy());
      socket = connection;
      const decoder = createIdeFrameDecoder(value => {
        const message = object(value);
        if (message?.type === "response" && message.requestId === initializeId && message.resultType === "success") {
          initialized = true;
          connection.setTimeout(0);
          for (const id of wanted) follow(id);
        } else if (message?.type === "broadcast" && message.method === "thread-stream-following-changed") {
          const params = object(message.params);
          if (params?.hostId === "local" && text(params.conversationId) && followed.size < 200) follow(String(params.conversationId));
        } else if (message?.type === "client-discovery-request") {
          // Explicitly decline all requests: this client never controls any agent.
          send({ type: "client-discovery-response", requestId: message.requestId, response: { canHandle: false } });
        }
        const resync = state.receive(value, new Date().toISOString());
        if (message?.type === "broadcast" && message.method === "client-status-changed") {
          followed.clear();
          for (const id of wanted) follow(id);
        }
        if (resync) follow(resync, true);
        onChange();
      });
      connection.on("connect", () => send({ type: "request", requestId: initializeId, method: "initialize", params: { clientType: "agentpup" } }));
      connection.on("data", chunk => { try { decoder.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk); } catch { connection.destroy(); } });
      connection.on("error", () => connection.destroy());
      connection.once("close", () => {
        initialized = false; followed.clear(); state.clear(); onChange();
        if (!stopped) reconnect = setTimeout(() => void connect(), 5000);
      });
    } catch {
      if (!stopped) reconnect = setTimeout(() => void connect(), 5000);
    }
  };
  void connect();
  return { state, follow(ids) {
    const next = new Set(ids.slice(0, 200));
    for (const id of wanted) if (!next.has(id)) {
      wanted.delete(id); followed.delete(id);
      if (initialized) send({ type: "broadcast", method: "thread-stream-following-changed", version: 1,
        params: { conversationId: id, hostId: "local", following: false } });
    }
    for (const id of next) { wanted.add(id); follow(id); }
  }, stop() { stopped = true; if (reconnect) clearTimeout(reconnect); socket?.destroy(); state.clear(); } };
}
