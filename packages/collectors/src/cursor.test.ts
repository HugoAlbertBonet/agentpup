import { describe, expect, it } from "vitest";
import { normalizeHookPayload, reconcileHookSnapshots } from "./hook-events.js";
import { createSnapshotEvents, parseCollectorMessage } from "./live-collector.js";
import { aggregateStatus, replayEvents } from "../../status/src/index.js";

const payload = { conversation_id: "cursor-conversation", generation_id: "turn-1", workspace_roots: ["/work/demo"], prompt: "PRIVATE", user_email: "PRIVATE", tool_input: { secret: "PRIVATE" } };
const at = "2026-10-10T12:00:00.000Z";
describe("Cursor hook monitoring", () => {
  it("ignores opening a conversation and ordinary tool execution", () => {
    for (const hook_event_name of ["sessionStart", "preToolUse", "beforeShellExecution", "afterAgentResponse"]) {
      expect(normalizeHookPayload("cursor", { ...payload, hook_event_name }, at)).toBeNull();
    }
  });
  it("preserves conversation and generation identity while stripping private bodies", () => {
    const event = normalizeHookPayload("cursor", { ...payload, hook_event_name: "beforeSubmitPrompt" }, at);
    expect(event).toMatchObject({ provider: "cursor", sessionId: "cursor-conversation", turnId: "turn-1", agentId: "root", project: "demo", event: "agent.started" });
    expect(JSON.stringify(event)).not.toContain("PRIVATE");
  });
  it.each([["completed", "result.ready"], ["aborted", "agent.interrupted"], ["error", "agent.failed"]])("maps stop %s correctly", (status, event) => {
    expect(normalizeHookPayload("cursor", { ...payload, hook_event_name: "stop", status }, at)?.event).toBe(event);
  });
  it("refuses a subagent stop without a stable child identity", () => {
    expect(normalizeHookPayload("cursor", { ...payload, hook_event_name: "subagentStop", status: "completed" }, at)).toBeNull();
  });
  it("does not let a delayed stop end a newer generation", () => {
    const events = [
      normalizeHookPayload("cursor", { ...payload, hook_event_name: "beforeSubmitPrompt" }, at)!,
      normalizeHookPayload("cursor", { ...payload, generation_id: "turn-2", hook_event_name: "beforeSubmitPrompt" }, "2026-10-10T12:00:01.000Z")!,
      normalizeHookPayload("cursor", { ...payload, hook_event_name: "stop", status: "completed" }, "2026-10-10T12:00:02.000Z")!
    ];
    expect(reconcileHookSnapshots([], events, "native")[0]).toMatchObject({ turnId: "turn-2", activity: "working", resultReady: false });
  });
  it("counts parent and child separately and only keeps the parent's completed result", () => {
    const events = [
      { hook_event_name: "beforeSubmitPrompt" },
      { hook_event_name: "subagentStart", subagent_id: "child", parent_conversation_id: payload.conversation_id },
      { hook_event_name: "subagentStop", subagent_id: "child", status: "completed" },
      { hook_event_name: "stop", status: "completed" }
    ].map((extra, index) => normalizeHookPayload("cursor", { ...payload, ...extra }, `2026-10-10T12:00:0${index}.000Z`)!);
    const snapshots = reconcileHookSnapshots([], events, "native", Date.parse(at));
    const message = { protocolVersion: 1, type: "snapshot", events: createSnapshotEvents(snapshots, ["native:cursor"], at) };
    expect(parseCollectorMessage(JSON.stringify(message))).not.toBeNull();
    expect(aggregateStatus(replayEvents(message.events))).toMatchObject({ working: 0, resultsReady: 1, agents: 2 });
  });
});
