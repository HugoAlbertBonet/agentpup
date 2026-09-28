import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readHookInbox, writeHookEnvelope } from "./hook-inbox.js";
import { normalizeHookPayload } from "./hook-events.js";

describe("hook inbox", () => {
  it("persists and reloads only sanitized hook envelopes", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "claudepet-hooks-"));
    const event = normalizeHookPayload(
      "codex",
      {
        hook_event_name: "PermissionRequest",
        session_id: "session-1",
        turn_id: "turn-1",
        cwd: "/workspace/app",
        tool_name: "exec",
        tool_input: { command: "PRIVATE_COMMAND" }
      },
      "2026-09-25T12:00:00.000Z"
    )!;

    const eventPath = await writeHookEnvelope(home, event);
    const stored = await readFile(eventPath, "utf8");
    const loaded = await readHookInbox(home, Date.parse("2026-09-25T12:01:00.000Z"));

    expect(loaded).toEqual([event]);
    expect(stored).not.toContain("PRIVATE_COMMAND");
  });
});
