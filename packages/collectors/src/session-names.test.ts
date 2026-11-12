import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCodexSessionNames, sessionTitle } from "./session-names.js";
import { parseClaudeTranscript, parseCodexTranscript } from "./transcript-adapters.js";

const context = { collectorId: "test", modifiedAt: Date.now(), now: Date.now() };

describe("session names", () => {
  it("reads explicit Codex names and follows renames without taking prompt bodies", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "agentpup-names-"));
    await writeFile(path.join(home, "session_index.jsonl"), [
      { id: "one", thread_name: "Old name", updated_at: "2026-11-10T00:00:00Z" },
      { id: "one", thread_name: "Fix search", updated_at: "2026-11-11T00:00:00Z", prompt: "PRIVATE" },
      { id: "one", thread_name: "Stale name", updated_at: "2026-11-09T00:00:00Z" },
      { id: "two", first_user_message: "PRIVATE" }
    ].map(value => JSON.stringify(value)).join("\n") + "\n{partial");
    expect([...await readCodexSessionNames(home)]).toEqual([["one", "Fix search"]]);
    expect(await readCodexSessionNames(path.join(home, "missing"))).toEqual(new Map());
  });

  it("uses Claude custom titles and safe neutral fallbacks", () => {
    expect(parseClaudeTranscript([
      { type: "custom-title", sessionId: "claude-one", customTitle: "Review API" }
    ], context)?.displayName).toBe("Review API");
    expect(parseCodexTranscript([{ type: "session_meta", payload: { id: "one" } }], context)?.displayName).toBe("Untitled session");
    expect(sessionTitle("Hello\nworld\u202e")).toBe("Hello world");
    expect(sessionTitle("x".repeat(300))).toHaveLength(160);
  });

  it("uses Claude generated titles and tracks updated generated names", () => {
    const session = parseClaudeTranscript([
      { type: "ai-title", sessionId: "claude-one", aiTitle: "Initial title" },
      { type: "ai-title", sessionId: "claude-one", aiTitle: "Review API\nchanges" },
      { type: "last-prompt", sessionId: "claude-one", lastPrompt: "PRIVATE_PROMPT" }
    ], context);
    expect(session?.displayName).toBe("Review API changes");
    expect(JSON.stringify(session)).not.toContain("PRIVATE_PROMPT");
  });

  it("prefers a manual Claude rename over generated titles regardless of record order", () => {
    const custom = { type: "custom-title", sessionId: "claude-one", customTitle: "My API review" };
    const generated = { type: "ai-title", sessionId: "claude-one", aiTitle: "Generated name" };
    for (const records of [[custom, generated], [generated, custom]]) {
      expect(parseClaudeTranscript(records, context)?.displayName).toBe("My API review");
    }
    expect(parseClaudeTranscript([
      generated, { type: "ai-title", sessionId: "claude-one", aiTitle: { invalid: true } }
    ], context)?.displayName).toBe("Generated name");
  });

  it("identifies persisted Codex children as members of their parent session", () => {
    const child = parseCodexTranscript([
      { type: "session_meta", payload: { id: "child-one", parent_thread_id: "parent-one", source: { subagent: { other: "worker" } }, cwd: "/work/project" } },
      { type: "event_msg", payload: { type: "task_complete", turn_id: "child-turn" } }
    ], context);
    expect(child).toMatchObject({ sessionId: "parent-one", agentId: "child-one", parentAgentId: "root", resultReady: false, activity: "ended" });
  });

  it("keeps user-created forks as independent sessions", () => {
    expect(parseCodexTranscript([{ type: "session_meta", payload: {
      id: "fork-one", parent_thread_id: "original", source: "cli"
    } }], context)).toMatchObject({ sessionId: "fork-one", agentId: "root" });
  });
});
