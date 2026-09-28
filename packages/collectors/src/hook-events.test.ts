import { describe, expect, it } from "vitest";

import { normalizeHookPayload, reconcileHookSnapshots } from "./hook-events.js";

describe("provider hook normalization", () => {
  it("does not treat opening a Claude session as submitted work", () => {
    const opened = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "SessionStart",
        session_id: "session-opened",
        cwd: "/workspace/api"
      },
      "2026-09-25T12:00:00.000Z"
    );
    const submitted = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "UserPromptSubmit",
        session_id: "session-opened",
        cwd: "/workspace/api"
      },
      "2026-09-25T12:00:01.000Z"
    );

    expect(opened).toBeNull();
    expect(submitted).toMatchObject({ event: "agent.started", sessionId: "session-opened" });
  });

  it("turns a Codex permission request into metadata-only evidence", () => {
    const event = normalizeHookPayload(
      "codex",
      {
        hook_event_name: "PermissionRequest",
        session_id: "session-1",
        turn_id: "turn-1",
        cwd: "/workspace/payments",
        tool_name: "exec_command",
        tool_input: { command: "PRIVATE_COMMAND" }
      },
      "2026-09-25T12:00:00.000Z"
    );

    expect(event).toMatchObject({
      provider: "codex",
      event: "request.opened",
      sessionId: "session-1",
      turnId: "turn-1",
      project: "payments",
      requestKind: "approval"
    });
    expect(JSON.stringify(event)).not.toContain("PRIVATE_COMMAND");
  });

  it("tracks Claude questions, subagents, and resolution without their content", () => {
    const question = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "PreToolUse",
        session_id: "session-2",
        cwd: "/workspace/api",
        tool_name: "AskUserQuestion",
        tool_use_id: "tool-1",
        tool_input: { questions: ["PRIVATE_QUESTION"] }
      },
      "2026-09-25T12:00:00.000Z"
    );
    const resolved = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "PostToolUse",
        session_id: "session-2",
        cwd: "/workspace/api",
        tool_name: "AskUserQuestion",
        tool_use_id: "tool-1",
        tool_response: "PRIVATE_ANSWER"
      },
      "2026-09-25T12:00:01.000Z"
    );
    const helper = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "SubagentStart",
        session_id: "session-2",
        cwd: "/workspace/api",
        agent_id: "helper-1",
        agent_type: "reviewer"
      },
      "2026-09-25T12:00:02.000Z"
    );

    expect(question).toMatchObject({
      event: "request.opened",
      requestId: "question:tool-1",
      requestKind: "question"
    });
    expect(resolved).toMatchObject({
      event: "request.resolved",
      requestId: "question:tool-1"
    });
    expect(helper).toMatchObject({
      event: "agent.started",
      agentId: "helper-1",
      parentAgentId: "root"
    });
    expect(JSON.stringify([question, resolved, helper])).not.toContain("PRIVATE_");
  });

  it("does not duplicate a Claude structured question as an approval", () => {
    const duplicatePermission = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "PermissionRequest",
        session_id: "session-2",
        cwd: "/workspace/api",
        tool_name: "AskUserQuestion",
        tool_use_id: "tool-1"
      },
      "2026-09-25T12:00:01.000Z"
    );

    expect(duplicatePermission).toBeNull();
  });

  it("ends a stopped Claude subagent without publishing a user-facing result", () => {
    const helperStopped = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "SubagentStop",
        session_id: "session-2",
        cwd: "/workspace/api",
        agent_id: "helper-1",
        agent_type: "reviewer",
        last_assistant_message: "PRIVATE_HELPER_RESULT"
      },
      "2026-09-25T12:00:03.000Z"
    );
    const rootStopped = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "Stop",
        session_id: "session-2",
        cwd: "/workspace/api",
        last_assistant_message: "PRIVATE_ROOT_RESULT"
      },
      "2026-09-25T12:00:04.000Z"
    );

    expect(helperStopped).toMatchObject({
      event: "agent.ended",
      agentId: "helper-1",
      parentAgentId: "root"
    });
    expect(rootStopped).toMatchObject({ event: "result.ready", agentId: "root" });
    expect(JSON.stringify([helperStopped, rootStopped])).not.toContain("PRIVATE_");
  });

  it("ends a Claude helper when it hands its result back", () => {
    const handback = normalizeHookPayload(
      "claude-code",
      {
        hook_event_name: "PostToolUse",
        session_id: "session-2",
        cwd: "/workspace/api",
        agent_id: "helper-1",
        tool_name: "SubagentHandback",
        tool_response: "PRIVATE_HELPER_RESULT"
      },
      "2026-09-25T12:00:03.000Z"
    );

    expect(handback).toMatchObject({
      event: "agent.ended",
      agentId: "helper-1",
      parentAgentId: "root"
    });
    expect(JSON.stringify(handback)).not.toContain("PRIVATE_HELPER_RESULT");
  });

  it("ignores malformed and unsupported hook payloads", () => {
    expect(normalizeHookPayload("codex", { hook_event_name: "Stop" }, "now")).toBeNull();
    expect(
      normalizeHookPayload(
        "codex",
        { hook_event_name: "Unknown", session_id: "session" },
        "2026-09-25T12:00:00.000Z"
      )
    ).toBeNull();
  });

  it("reconciles hook evidence over transcript recovery state", () => {
    const base = {
      provider: "codex" as const,
      collectorId: "wsl:Ubuntu:codex",
      sessionId: "session-1",
      agentId: "root",
      displayName: "Session session-1",
      project: "payments",
      observedAt: "2026-09-25T12:00:00.000Z",
      activity: "working" as const,
      turnId: "turn-1",
      resultReady: false,
      requests: []
    };
    const opened = normalizeHookPayload(
      "codex",
      {
        hook_event_name: "PermissionRequest",
        session_id: "session-1",
        turn_id: "turn-1",
        cwd: "/workspace/payments",
        tool_name: "exec"
      },
      "2026-09-25T12:00:01.000Z"
    )!;
    const waiting = reconcileHookSnapshots([base], [opened], "wsl:Ubuntu");
    expect(waiting[0]).toMatchObject({ activity: "working", requests: [{ kind: "approval" }] });

    const resolved = normalizeHookPayload(
      "codex",
      {
        hook_event_name: "PostToolUse",
        session_id: "session-1",
        turn_id: "turn-1",
        cwd: "/workspace/payments",
        tool_name: "exec",
        tool_use_id: "tool-1"
      },
      "2026-09-25T12:00:02.000Z"
    )!;
    expect(reconcileHookSnapshots(waiting, [resolved], "wsl:Ubuntu")[0]!.requests).toEqual([]);
  });

  it("ignores retained SessionStart events created by older hook versions", () => {
    const completed = {
      provider: "claude-code" as const,
      collectorId: "wsl:Ubuntu:claude-code",
      sessionId: "session-opened",
      agentId: "root",
      displayName: "Session session-",
      project: "api",
      observedAt: "2026-09-25T12:00:00.000Z",
      activity: "completed" as const,
      turnId: "turn-1",
      resultReady: true,
      requests: []
    };
    const retainedSessionStart = {
      protocolVersion: 1 as const,
      provider: "claude-code" as const,
      event: "agent.started" as const,
      eventId:
        "claude-code:session-opened:SessionStart:session-opened:root:2026-09-25T12:01:00.000Z",
      observedAt: "2026-09-25T12:01:00.000Z",
      sessionId: "session-opened",
      turnId: "session-opened",
      agentId: "root",
      project: "api"
    };

    expect(
      reconcileHookSnapshots([completed], [retainedSessionStart], "wsl:Ubuntu")[0]
    ).toMatchObject({ activity: "completed", resultReady: true });
  });

  it("reinterprets retained SubagentStop results as ended helpers", () => {
    const retainedSubagentStop = {
      protocolVersion: 1 as const,
      provider: "claude-code" as const,
      event: "result.ready" as const,
      eventId:
        "claude-code:session-2:SubagentStop:session-2:helper-1:2026-09-25T12:00:03.000Z",
      observedAt: "2026-09-25T12:00:03.000Z",
      sessionId: "session-2",
      turnId: "session-2",
      agentId: "helper-1",
      parentAgentId: "root",
      project: "api"
    };

    expect(reconcileHookSnapshots([], [retainedSubagentStop], "wsl:Ubuntu")[0]).toMatchObject({
      agentId: "helper-1",
      activity: "ended",
      resultReady: false
    });
  });

  it("reinterprets retained SubagentHandback resolutions as ended helpers", () => {
    const retainedHandback = {
      protocolVersion: 1 as const,
      provider: "claude-code" as const,
      event: "request.resolved" as const,
      eventId:
        "claude-code:session-2:PostToolUse:session-2:helper-1:2026-09-25T12:00:03.000Z",
      observedAt: "2026-09-25T12:00:03.000Z",
      sessionId: "session-2",
      turnId: "session-2",
      agentId: "helper-1",
      parentAgentId: "root",
      project: "api",
      requestId: "approval:session-2:helper-1:SubagentHandback",
      requestKind: "approval" as const,
      resolution: "approved" as const
    };

    expect(reconcileHookSnapshots([], [retainedHandback], "wsl:Ubuntu")[0]).toMatchObject({
      agentId: "helper-1",
      activity: "ended",
      resultReady: false
    });
  });
});
