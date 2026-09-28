import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  applyAgentDismissals,
  canDismissAgent,
  dismissAllDismissibleAgents,
  providerPresentation
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
});
