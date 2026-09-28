import { describe, expect, it } from "vitest";

import { parseClaudeTranscript, parseCodexTranscript } from "./transcript-adapters.js";

const now = Date.parse("2026-09-25T12:05:00.000Z");

describe("transcript lifecycle adapters", () => {
  it("maps Codex lifecycle and structured questions without retaining private content", () => {
    const records = [
      {
        timestamp: "2026-09-25T12:00:00.000Z",
        type: "session_meta",
        payload: { id: "codex-session", cwd: "/workspace/checkout" }
      },
      {
        timestamp: "2026-09-25T12:01:00.000Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-1" }
      },
      {
        timestamp: "2026-09-25T12:02:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "request_user_input_async",
          call_id: "question-1",
          arguments: "CODEX_PRIVATE_QUESTION"
        }
      }
    ];

    const snapshot = parseCodexTranscript(records, {
      collectorId: "wsl:Ubuntu:codex",
      modifiedAt: now - 1_000,
      now
    });

    expect(snapshot).toMatchObject({
      provider: "codex",
      sessionId: "codex-session",
      project: "checkout",
      activity: "working",
      turnId: "turn-1",
      resultReady: false,
      requests: [
        {
          requestId: "question-1",
          kind: "question",
          blocking: false,
          confidence: "confirmed"
        }
      ]
    });
    expect(JSON.stringify(snapshot)).not.toContain("CODEX_PRIVATE_QUESTION");

    const completed = parseCodexTranscript(
      [
        ...records,
        {
          type: "response_item",
          payload: {
            type: "function_call_output",
            call_id: "question-1",
            output: "CODEX_PRIVATE_ANSWER"
          }
        },
        {
          timestamp: "2026-09-25T12:04:00.000Z",
          type: "event_msg",
          payload: { type: "task_complete", turn_id: "turn-1" }
        }
      ],
      { collectorId: "wsl:Ubuntu:codex", modifiedAt: now - 1_000, now }
    );

    expect(completed).toMatchObject({ activity: "completed", resultReady: true, requests: [] });
    expect(JSON.stringify(completed)).not.toContain("CODEX_PRIVATE_ANSWER");
  });

  it("maps Claude structured questions and their resolution without retaining messages", () => {
    const records = [
      {
        type: "user",
        sessionId: "claude-session",
        cwd: "/workspace/api",
        timestamp: "2026-09-25T12:00:00.000Z",
        message: { content: "CLAUDE_PRIVATE_PROMPT" }
      },
      {
        type: "assistant",
        sessionId: "claude-session",
        cwd: "/workspace/api",
        timestamp: "2026-09-25T12:01:00.000Z",
        message: {
          id: "message-1",
          content: [
            {
              type: "tool_use",
              id: "question-1",
              name: "AskUserQuestion",
              input: { question: "CLAUDE_PRIVATE_QUESTION" }
            }
          ]
        }
      }
    ];

    const snapshot = parseClaudeTranscript(records, {
      collectorId: "wsl:Ubuntu:claude-code",
      modifiedAt: now - 1_000,
      now
    });

    expect(snapshot).toMatchObject({
      provider: "claude-code",
      sessionId: "claude-session",
      project: "api",
      activity: "idle",
      resultReady: false,
      requests: [
        {
          requestId: "question-1",
          kind: "question",
          blocking: true,
          confidence: "confirmed"
        }
      ]
    });
    expect(JSON.stringify(snapshot)).not.toContain("CLAUDE_PRIVATE");

    const completed = parseClaudeTranscript(
      [
        ...records,
        {
          type: "user",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:02:00.000Z",
          message: {
            content: [{ type: "tool_result", tool_use_id: "question-1", content: "secret" }]
          }
        },
        {
          type: "assistant",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:03:00.000Z",
          message: { id: "message-2", content: [{ type: "text", text: "PRIVATE_RESULT" }] }
        }
      ],
      { collectorId: "wsl:Ubuntu:claude-code", modifiedAt: now - 1_000, now }
    );

    expect(completed).toMatchObject({ activity: "completed", resultReady: true, requests: [] });
    expect(JSON.stringify(completed)).not.toContain("PRIVATE_RESULT");
  });

  it("marks a rejected Claude tool as interrupted and ignores its synthetic trailing user record", () => {
    const snapshot = parseClaudeTranscript(
      [
        {
          type: "user",
          uuid: "prompt-1",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:00:00.000Z",
          origin: { kind: "human" },
          message: { content: [{ type: "text", text: "PRIVATE_PROMPT" }] }
        },
        {
          type: "assistant",
          uuid: "tool-message-1",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:01:00.000Z",
          message: {
            id: "message-1",
            content: [{ type: "tool_use", id: "tool-1", name: "Bash", input: {} }]
          }
        },
        {
          type: "user",
          uuid: "rejection-1",
          parentUuid: "tool-message-1",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:01:02.000Z",
          toolDenialKind: "user-rejected",
          toolUseResult: "PRIVATE_INTERRUPTION_MESSAGE",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                is_error: true,
                content: "PRIVATE_TOOL_RESULT"
              }
            ]
          }
        },
        {
          type: "user",
          uuid: "synthetic-1",
          parentUuid: "rejection-1",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:01:02.001Z",
          message: { content: [{ type: "text", text: "PRIVATE_SYNTHETIC_MESSAGE" }] }
        }
      ],
      { collectorId: "wsl:Ubuntu:claude-code", modifiedAt: now - 1_000, now }
    );

    expect(snapshot).toMatchObject({ activity: "interrupted", resultReady: false });
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE");
  });

  it("retains an explicit Claude rejection after active evidence becomes stale", () => {
    const snapshot = parseClaudeTranscript(
      [
        {
          type: "assistant",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:00:00.000Z",
          message: {
            content: [
              { type: "tool_use", id: "question-1", name: "AskUserQuestion", input: {} }
            ]
          }
        },
        {
          type: "user",
          uuid: "rejection-1",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:01:00.000Z",
          toolDenialKind: "user-rejected",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "question-1",
                is_error: true,
                content: "PRIVATE_REJECTION"
              }
            ]
          }
        },
        {
          type: "attachment",
          uuid: "attachment-1",
          parentUuid: "rejection-1",
          sessionId: "claude-session",
          timestamp: "2026-09-25T12:01:00.001Z"
        },
        {
          type: "user",
          uuid: "synthetic-1",
          parentUuid: "attachment-1",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:01:00.002Z",
          message: { content: [{ type: "text", text: "PRIVATE_SYNTHETIC_MESSAGE" }] }
        }
      ],
      { collectorId: "wsl:Ubuntu:claude-code", modifiedAt: now - 31 * 60_000, now }
    );

    expect(snapshot).toMatchObject({ activity: "interrupted", resultReady: false, requests: [] });
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_REJECTION");
  });

  it("maps Claude's synthetic request interruption marker to interrupted", () => {
    const snapshot = parseClaudeTranscript(
      [
        {
          type: "user",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:00:00.000Z",
          origin: { kind: "human" },
          message: { content: [{ type: "text", text: "PRIVATE_PROMPT" }] }
        },
        {
          type: "assistant",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:01:00.000Z",
          message: { content: [{ type: "text", text: "PRIVATE_RESULT" }] }
        },
        {
          type: "user",
          sessionId: "claude-session",
          cwd: "/workspace/api",
          timestamp: "2026-09-25T12:02:00.000Z",
          userType: "external",
          message: { content: [{ type: "text", text: "[Request interrupted by user]" }] }
        }
      ],
      { collectorId: "wsl:Ubuntu:claude-code", modifiedAt: now - 1_000, now }
    );

    expect(snapshot).toMatchObject({ activity: "interrupted", resultReady: false, requests: [] });
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE");
  });

  it("downgrades stale unfinished transcript evidence to unknown", () => {
    const snapshot = parseCodexTranscript(
      [
        { type: "session_meta", payload: { id: "stale", cwd: "/workspace/stale" } },
        { type: "event_msg", payload: { type: "task_started", turn_id: "old-turn" } }
      ],
      { collectorId: "wsl:Ubuntu:codex", modifiedAt: now - 31 * 60_000, now }
    );

    expect(snapshot).toMatchObject({ activity: "unknown", resultReady: false });
  });
});
