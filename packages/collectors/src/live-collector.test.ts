import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { aggregateStatus, replayEvents } from "../../status/src/index.js";
import { normalizeHookPayload, reconcileHookSnapshots } from "./hook-events.js";
import {
  createSnapshotEvents,
  findRecentJsonlFiles,
  parseCollectorMessage,
  scanTranscriptSessions
} from "./live-collector.js";

describe("live transcript collector", () => {
  it("recovers both parent and child quota stops over older working hooks", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "pup-limit-"));
    const project = path.join(home, "projects", "project");
    const children = path.join(project, "session-one", "subagents");
    await mkdir(children, { recursive: true });
    const now = Date.now();
    const record = { type: "assistant", sessionId: "session-one", timestamp: new Date(now).toISOString(),
      isApiErrorMessage: true, error: "rate_limit", message: { content: [{ type: "text", text: "PRIVATE_LIMIT" }] } };
    await writeFile(path.join(project, "session-one.jsonl"), JSON.stringify(record) + "\n");
    await writeFile(path.join(children, "agent-helper.jsonl"), JSON.stringify({ ...record, isSidechain: true, agentId: "helper" }) + "\n");
    const sessions = await scanTranscriptSessions({ codexHome: path.join(home, "missing"), claudeHome: home,
      collectorPrefix: "test", limitPerProvider: 20, now });
    const started = normalizeHookPayload("claude-code", { hook_event_name: "SubagentStart", session_id: "session-one", agent_id: "helper" }, new Date(now - 1000).toISOString())!;
    const reconciled = reconcileHookSnapshots(sessions, [started], "test", now);
    expect(reconciled).toHaveLength(2);
    expect(aggregateStatus(replayEvents(createSnapshotEvents(reconciled, ["test:claude-code"], new Date(now).toISOString()))))
      .toMatchObject({ working: 0, needsYou: 0, resultsReady: 1 });
  });
  it("does not let a deep project tree starve a sibling transcript", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claudepet-walk-"));
    await mkdir(path.join(root, "project-one"));
    await mkdir(path.join(root, "project-two"));
    const directories = await readdir(root);
    const targetDirectory = path.join(root, directories[0]!);
    const noisyDirectory = path.join(root, directories[1]!);
    await writeFile(path.join(targetDirectory, "target.jsonl"), "{}\n");
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        writeFile(path.join(noisyDirectory, `noise-${index}.jsonl`), "{}\n")
      )
    );

    const files = await findRecentJsonlFiles(root, 10, 6);

    expect(files.some((file) => file.filePath.endsWith("target.jsonl"))).toBe(true);
  });

  it("scans both providers and emits replayable metadata-only events", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claudepet-live-"));
    const codexHome = path.join(root, ".codex");
    const claudeHome = path.join(root, ".claude");
    const codexDirectory = path.join(codexHome, "sessions", "2026", "09", "25");
    const claudeDirectory = path.join(claudeHome, "projects", "-workspace-api");
    await mkdir(codexDirectory, { recursive: true });
    await mkdir(claudeDirectory, { recursive: true });

    await writeFile(
      path.join(codexDirectory, "rollout-codex.jsonl"),
      [
        { type: "session_meta", payload: { id: "codex-live", cwd: "/workspace/web" } },
        { type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } }
      ].map((value) => JSON.stringify(value)).join("\n")
    );
    await writeFile(
      path.join(claudeDirectory, "claude.jsonl"),
      [
        {
          type: "user",
          sessionId: "claude-live",
          cwd: "/workspace/api",
          message: { content: "PRIVATE_PROMPT" }
        },
        {
          type: "assistant",
          sessionId: "claude-live",
          cwd: "/workspace/api",
          message: {
            content: [
              {
                type: "tool_use",
                id: "question-1",
                name: "AskUserQuestion",
                input: { question: "PRIVATE_QUESTION" }
              }
            ]
          }
        }
      ].map((value) => JSON.stringify(value)).join("\n")
    );

    const now = Date.now();
    const sessions = await scanTranscriptSessions({
      codexHome,
      claudeHome,
      collectorPrefix: "wsl:Ubuntu",
      limitPerProvider: 10,
      now
    });
    const events = createSnapshotEvents(
      sessions,
      ["wsl:Ubuntu:codex", "wsl:Ubuntu:claude-code"],
      new Date(now).toISOString()
    );
    const state = replayEvents(events);

    expect(aggregateStatus(state)).toMatchObject({ working: 1, needsYou: 1 });
    expect(JSON.stringify(events)).not.toContain("PRIVATE_");
  });

  it("accepts all three provider diagnostics without dropping agent activity", () => {
    const observedAt = "2026-10-10T10:00:00.000Z";
    const events = createSnapshotEvents([], ["wsl:Ubuntu:codex", "wsl:Ubuntu:claude-code", "wsl:Ubuntu:cursor"], observedAt);
    const providers = ["codex", "claude-code", "cursor"].map(provider => ({
      provider,
      version: null,
      hookConfiguration: "configured",
      hookEventsObserved: true
    }));
    const message = {
      protocolVersion: 1,
      type: "snapshot",
      events,
      diagnostics: { observedAt, transcriptFallback: true, providers }
    };

    expect(parseCollectorMessage(JSON.stringify(message))).toEqual(message);
    for (const provider of [providers[0], { ...providers[0], provider: "unsupported" }]) {
      expect(parseCollectorMessage(JSON.stringify({
        ...message,
        diagnostics: { ...message.diagnostics, providers: [providers[0], provider] }
      }))).toBeNull();
    }
  });

  it("accepts only versioned snapshot protocol messages", () => {
    const diagnostics = {
      observedAt: "2026-09-27T10:00:00.000Z",
      transcriptFallback: true,
      providers: [
        {
          provider: "codex",
          version: "codex-cli 0.155.0",
          hookConfiguration: "configured",
          hookEventsObserved: true
        },
        {
          provider: "claude-code",
          version: null,
          hookConfiguration: "not-configured",
          hookEventsObserved: false
        }
      ]
    };
    const valid = JSON.stringify({
      protocolVersion: 1,
      type: "snapshot",
      events: [],
      diagnostics
    });
    expect(parseCollectorMessage(valid)).toEqual({
      protocolVersion: 1,
      type: "snapshot",
      events: [],
      diagnostics
    });
    expect(parseCollectorMessage("not json")).toBeNull();
    expect(
      parseCollectorMessage(
        JSON.stringify({ protocolVersion: 1, type: "snapshot", events: [{ type: "oops" }] })
      )
    ).toBeNull();
    expect(
      parseCollectorMessage(
        JSON.stringify({
          protocolVersion: 1,
          type: "snapshot",
          events: [],
          diagnostics: { ...diagnostics, providers: [{ provider: "codex", version: {} }] }
        })
      )
    ).toBeNull();
  });
});
