import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { CodexIdeState, createIdeFrameDecoder, encodeIdeFrame, applyCodexIdeState, startCodexIdeObserver } from "./codex-ide.js";

const now = "2026-11-11T12:00:00.000Z";
function snapshot(requests: unknown[] = [], flags: string[] = []) {
  return { type: "broadcast", method: "thread-stream-state-changed", version: 11, params: {
    conversationId: "session-one", hostId: "local", change: { type: "snapshot", revision: 1, conversationState: {
      id: "session-one", title: "Fix search", cwd: "/work/project", turns: ["PRIVATE_PROMPT"],
      threadRuntimeStatus: { type: "active", activeFlags: flags }, requests
    } }
  } };
}
const approval = { id: 42, method: "item/commandExecution/requestApproval", params: { threadId: "session-one", turnId: "turn-one", command: "PRIVATE_COMMAND" } };

describe("Codex IDE passive status", () => {
  it("confirms actual UI requests without retaining command or conversation bodies", () => {
    const state = new CodexIdeState();
    state.receive(snapshot([approval], ["waitingOnApproval"]), now);
    const sessions = applyCodexIdeState([], state.threads(), "wsl:test", now);
    expect(sessions[0]).toMatchObject({ displayName: "Fix search", project: "project", requests: [
      { requestId: "codex-ide:42", kind: "approval", confidence: "confirmed" }
    ] });
    expect(JSON.stringify(state.threads()) + JSON.stringify(sessions)).not.toContain("PRIVATE");
  });

  it("does not alert for automatic reviews without a UI approval request", () => {
    const state = new CodexIdeState();
    state.receive(snapshot([], ["waitingOnApproval"]), now);
    expect(applyCodexIdeState([], state.threads(), "wsl:test", now)).toEqual([]);
  });

  it("applies request resolution and title patches, and drops uncertain revision gaps", () => {
    const state = new CodexIdeState();
    state.receive(snapshot([approval], ["waitingOnApproval"]), now);
    const waiting = applyCodexIdeState([], state.threads(), "wsl:test", now);
    const patch = (baseRevision: number, revision: number, patches: unknown[]) => ({
      type: "broadcast", method: "thread-stream-state-changed", version: 11,
      params: { conversationId: "session-one", hostId: "local", change: { type: "patches", baseRevision, revision, patches } }
    });
    state.receive(patch(1, 2, [{ op: "replace", path: ["title"], value: "New name" },
      { op: "remove", path: ["requests", 0] }]), now);
    expect(state.threads()[0]).toMatchObject({ title: "New name", requests: [] });
    expect(applyCodexIdeState([], state.threads(), "wsl:test", now)).toEqual([]);
    expect(applyCodexIdeState(waiting, state.threads(), "wsl:test", now)[0]!.requests).toEqual([]);
    state.receive(patch(0, 1, []), now); // Out-of-order old patches cannot undo current state.
    expect(state.threads()).toHaveLength(1);
    state.receive(patch(3, 4, []), now);
    expect(state.threads()).toHaveLength(0);
  });

  it("ignores remote hosts, unknown protocol versions and prototype paths", () => {
    const state = new CodexIdeState();
    const remote = snapshot([approval], ["waitingOnApproval"]);
    remote.params.hostId = "remote";
    state.receive(remote, now);
    state.receive({ ...snapshot([approval]), version: 12 }, now);
    expect(state.threads()).toEqual([]);
    state.receive(snapshot([approval], ["waitingOnApproval"]), now);
    state.receive({ type: "broadcast", method: "thread-stream-state-changed", version: 11, params: {
      conversationId: "session-one", hostId: "local", change: { type: "patches", baseRevision: 1, revision: 2,
        patches: [{ op: "replace", path: ["__proto__", "polluted"], value: true }] }
    } }, now);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("drops pending requests when their owning IDE client disconnects", () => {
    const state = new CodexIdeState();
    state.receive({ ...snapshot([approval], ["waitingOnApproval"]), sourceClientId: "ide-owner" }, now);
    expect(state.threads()).toHaveLength(1);
    state.receive({ type: "broadcast", method: "client-status-changed", params: { clientId: "ide-owner", status: "disconnected" } }, now);
    expect(state.threads()).toEqual([]);
  });

  it("decodes split and coalesced frames with a strict size bound", () => {
    const messages: unknown[] = [];
    const decoder = createIdeFrameDecoder(value => messages.push(value));
    const frame = encodeIdeFrame({ title: "Pup 🐶" });
    decoder.push(frame.subarray(0, 2));
    decoder.push(frame.subarray(2, 9));
    decoder.push(Buffer.concat([frame.subarray(9), frame]));
    expect(messages).toEqual([{ title: "Pup 🐶" }, { title: "Pup 🐶" }]);
    expect(() => decoder.push(Buffer.from([255, 255, 255, 127]))).toThrow();
  });

  it("subscribes through existing IPC, declines control requests and clears on disconnect", async () => {
    if (process.platform === "win32") return;
    const home = await mkdtemp(path.join(os.tmpdir(), "pup-ide-"));
    await mkdir(path.join(home, "ipc"), { mode: 0o700 });
    const server = createServer();
    const outgoing: Array<Record<string, unknown>> = [];
    let peer: Socket | undefined;
    let observed!: () => void;
    let disconnected!: () => void;
    const ready = new Promise<void>(resolve => { observed = resolve; });
    const gone = new Promise<void>(resolve => { disconnected = resolve; });
    server.on("connection", socket => {
      peer = socket;
      const decoder = createIdeFrameDecoder(value => {
        const message = value as Record<string, unknown>;
        outgoing.push(message);
        if (message.method === "initialize") socket.write(encodeIdeFrame({ type: "response", requestId: message.requestId, resultType: "success" }));
        if (message.method === "thread-stream-following-changed") {
          socket.write(encodeIdeFrame(snapshot([approval], ["waitingOnApproval"])));
          socket.write(encodeIdeFrame({ type: "client-discovery-request", requestId: "control-request" }));
        }
        if (message.type === "client-discovery-response") observed();
      });
      socket.on("data", data => decoder.push(Buffer.from(data)));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(path.join(home, "ipc", "ipc.sock"), resolve);
    });
    let hadState = false;
    const observer = startCodexIdeObserver(home, () => {
      if (observer.state.threads().length) hadState = true;
      else if (hadState) disconnected();
    });
    try {
      observer.follow(["session-one"]);
      await ready;
      expect(observer.state.threads()).toHaveLength(1);
      expect(outgoing.every(value => value.method === "initialize" || value.method === "thread-stream-following-changed" ||
        (value.type === "client-discovery-response" && (value.response as { canHandle: boolean }).canHandle === false))).toBe(true);
      peer!.destroy();
      await gone;
      expect(observer.state.threads()).toEqual([]);
    } finally {
      observer.stop(); peer?.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    }
  });
});
