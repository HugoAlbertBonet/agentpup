import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  applyAgentDismissals,
  canDismissAgent,
  dismissAllDismissibleAgents,
  limitFinishedAgents,
  providerPresentation,
  groupSessionAgents,
  aggregateSessionStatus
} from "./agent-view.js";
import { aggregateStatus, createStatusState, type AgentStatus } from "../../../packages/status/src/index.js";

function agent(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    identity: {
      provider: "claude-code",
      collectorId: "wsl:test:claude-code",
      sessionId: "session-1",
      agentId: "root",
      displayName: "Session session-",
      project: "project"
    },
    activity: "completed",
    lastKnownActivity: "completed",
    currentTurnId: "turn-1",
    requests: {},
    resultReady: true,
    sourceConnected: true,
    lastObservedAt: "2026-09-28T02:00:00.000Z",
    activityUpdatedSequence: 1,
    ...overrides
  };
}

describe("agent activity presentation", () => {
  it("counts each working or ready session once regardless of its number of agents", () => {
    const state = createStatusState();
    const root = agent({ activity: "working", resultReady: false });
    state.agents.root = root;
    state.agents.child = agent({ ...root, identity: { ...root.identity, agentId: "child", parentAgentId: "root" } });
    state.agents.other = agent({ identity: { ...root.identity, sessionId: "session-two" } });
    state.agents.otherChild = agent({ identity: { ...root.identity, sessionId: "session-two", agentId: "other-child", parentAgentId: "root" } });
    expect(aggregateStatus(state)).toMatchObject({ working: 2, resultsReady: 2 });
    expect(aggregateSessionStatus(state)).toEqual({ working: 1, needsYou: 0, resultsReady: 1 });
    state.agents.native = agent({ ...root, identity: { ...root.identity, collectorId: "native:win32:claude-code" } });
    expect(aggregateSessionStatus(state).working).toBe(2);
  });

  it("counts a session with multiple pending agent requests once and preserves simultaneous work", () => {
    const state = createStatusState();
    const root = agent({ activity: "working", resultReady: false });
    const pending = { requestId: "question", kind: "question" as const, blocking: false,
      confidence: "confirmed" as const, evidence: "test", openedAt: root.lastObservedAt,
      updatedAt: root.lastObservedAt, updatedSequence: 1, resolution: null, resolved: false };
    state.agents.root = { ...root, requests: { question: pending } };
    state.agents.child = { ...root, identity: { ...root.identity, agentId: "child", parentAgentId: "root" }, requests: { question: { ...pending } } };
    expect(aggregateSessionStatus(state)).toEqual({ working: 1, needsYou: 1, resultsReady: 0 });
    state.agents.root.requests.question!.confidence = "provisional";
    expect(aggregateSessionStatus(state).needsYou).toBe(1);
    state.agents.child.requests.question!.resolved = true;
    expect(aggregateSessionStatus(state).needsYou).toBe(0);
  });
  it("groups parent and children by provider, collector, and session, with hidden children counted", () => {
    const root = agent();
    root.identity.displayName = "Improve search";
    const child = agent({ identity: { ...root.identity, agentId: "child", parentAgentId: "root", displayName: "Reviewer" }, activity: "working", resultReady: false });
    const other = agent({ identity: { ...root.identity, collectorId: "native:win32:claude-code" } });
    const groups = groupSessionAgents([["child", child], ["root", root], ["other", other]]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ title: "Improve search", project: "project", count: 2 });
    expect(groups[0]!.agents.map(([key]) => key)).toEqual(["root", "child"]);
    expect(groups[0]!.summary.working).toBe(1);
    expect(groups[0]!.key).not.toBe(groups[1]!.key);
  });

  it("keeps an orphan child visible without presenting its name as a session title", () => {
    const child = agent({ identity: { ...agent().identity, agentId: "child", parentAgentId: "root", displayName: "Reviewer" } });
    expect(groupSessionAgents([["child", child]])[0]).toMatchObject({ title: "Untitled session", count: 1 });
  });
  it("provides distinct visual identities for Codex and Claude Code", () => {
    expect(providerPresentation("codex")).toEqual({ label: "Codex", icon: "codex" });
    expect(providerPresentation("claude-code")).toEqual({
      label: "Claude Code",
      icon: "claude"
    });
  });

  it("bundles static provider logos and references them from the renderer", async () => {
    const [openai, claude, renderer] = await Promise.all([
      readFile(new URL("../renderer/assets/openai-logo.svg", import.meta.url), "utf8"),
      readFile(new URL("../renderer/assets/claude-logo.svg", import.meta.url), "utf8"),
      readFile(new URL("./renderer.ts", import.meta.url), "utf8")
    ]);

    for (const asset of [openai, claude]) {
      expect(asset).toContain("<svg");
      expect(asset).not.toMatch(/<script|<foreignObject|<image|\shref=/i);
    }
    expect(renderer).toContain('"assets/openai-logo.svg"');
    expect(renderer).toContain('"assets/claude-logo.svg"');
  });

  it("allows terminal agents and ready results to be dismissed", () => {
    expect(canDismissAgent(agent())).toBe(true);
    expect(canDismissAgent(agent({ activity: "ended", resultReady: false }))).toBe(true);
    expect(canDismissAgent(agent({ activity: "interrupted", resultReady: false }))).toBe(true);
    expect(canDismissAgent(agent({ activity: "failed", resultReady: false }))).toBe(true);
    expect(canDismissAgent(agent({ activity: "working", resultReady: false }))).toBe(false);
    expect(canDismissAgent(agent({ activity: "idle", resultReady: false }))).toBe(false);
  });

  it("hides the dismissed observation from both the list and aggregate counts", () => {
    const state = createStatusState();
    state.agents.ready = agent();

    const visible = applyAgentDismissals(
      state,
      new Map([["ready", "2026-09-28T02:00:00.000Z"]])
    );

    expect(visible.agents).toEqual({});
    expect(aggregateStatus(visible).resultsReady).toBe(0);
  });

  it("shows the same agent again when a newer lifecycle observation arrives", () => {
    const state = createStatusState();
    state.agents.ready = agent({
      activity: "working",
      resultReady: false,
      lastObservedAt: "2026-09-28T02:01:00.000Z"
    });

    const visible = applyAgentDismissals(
      state,
      new Map([["ready", "2026-09-28T02:00:00.000Z"]])
    );

    expect(visible.agents.ready).toBeDefined();
    expect(aggregateStatus(visible).working).toBe(1);
  });

  it("dismisses every removable entry while keeping live agents", () => {
    const state = createStatusState();
    state.agents.ready = agent();
    state.agents.ended = agent({ activity: "ended", resultReady: false });
    state.agents.interrupted = agent({ activity: "interrupted", resultReady: false });
    state.agents.working = agent({ activity: "working", resultReady: false });
    state.agents.waiting = agent({ activity: "idle", resultReady: false });
    const dismissals = new Map<string, string>();

    expect(dismissAllDismissibleAgents(state, dismissals)).toBe(3);
    expect(Object.keys(applyAgentDismissals(state, dismissals).agents).sort()).toEqual([
      "waiting",
      "working"
    ]);
  });

  it("keeps only the most recently observed finished results", () => {
    const state = createStatusState();
    state.agents.oldest = agent({
      lastObservedAt: "2026-09-28T02:00:00.000Z",
      activityUpdatedSequence: 9
    });
    state.agents.middle = agent({
      lastObservedAt: "2026-09-28T02:01:00.000Z",
      activityUpdatedSequence: 10
    });
    state.agents.newest = agent({
      lastObservedAt: "2026-09-28T02:02:00.000Z",
      activityUpdatedSequence: 11
    });
    state.agents.working = agent({
      activity: "working",
      resultReady: false,
      lastObservedAt: "2026-09-28T01:00:00.000Z"
    });

    const visible = limitFinishedAgents(state, 2);

    expect(Object.keys(visible.agents).sort()).toEqual(["middle", "newest", "working"]);
    expect(aggregateStatus(visible)).toMatchObject({ resultsReady: 2, working: 1 });
    expect(Object.keys(limitFinishedAgents(state, 0).agents)).toEqual(["working"]);
  });
});
