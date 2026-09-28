import { describe, expect, it } from "vitest";

import {
  aggregateStatus,
  applyEvent,
  createStatusState,
  createDemoEvents,
  replayEvents,
  type AgentIdentity,
  type StatusEvent
} from "./index.js";

const root: AgentIdentity = {
  provider: "codex",
  collectorId: "wsl-ubuntu",
  sessionId: "session-1",
  agentId: "root",
  displayName: "Implement checkout",
  project: "Website"
};

const helper: AgentIdentity = {
  ...root,
  agentId: "helper-1",
  parentAgentId: "root",
  displayName: "Review tests"
};

type EventValue = StatusEvent extends infer Event
  ? Event extends StatusEvent
    ? Omit<Event, "eventId" | "sequence" | "observedAt" | "collectorId">
    : never
  : never;

function event(
  sequence: number,
  value: EventValue
): StatusEvent {
  return {
    ...value,
    eventId: `event-${sequence}`,
    collectorId: "wsl-ubuntu",
    sequence,
    observedAt: `2026-09-25T12:00:${String(sequence).padStart(2, "0")}.000Z`
  } as StatusEvent;
}

describe("status reducer", () => {
  it("keeps activity separate from an unresolved human request", () => {
    const state = replayEvents([
      event(1, { type: "collector.connected", capabilities: ["requests", "subagents"] }),
      event(2, { type: "agent.started", identity: root, turnId: "turn-1" }),
      event(3, {
        type: "request.opened",
        identity: root,
        turnId: "turn-1",
        request: {
          requestId: "question-1",
          kind: "question",
          blocking: false,
          confidence: "confirmed",
          evidence: "Structured input request"
        }
      })
    ]);

    expect(aggregateStatus(state)).toMatchObject({
      working: 1,
      needsYou: 1,
      resultsReady: 0,
      rootSessions: 1
    });
  });

  it("counts each agent once when it has several pending requests", () => {
    const state = replayEvents([
      event(1, { type: "agent.started", identity: root, turnId: "turn-1" }),
      event(2, {
        type: "request.opened",
        identity: root,
        request: {
          requestId: "approval-1",
          kind: "approval",
          blocking: true,
          confidence: "provisional",
          evidence: "Permission hook observed"
        }
      }),
      event(3, {
        type: "request.opened",
        identity: root,
        request: {
          requestId: "question-1",
          kind: "question",
          blocking: false,
          confidence: "confirmed",
          evidence: "Structured input request"
        }
      })
    ]);

    expect(aggregateStatus(state).needsYou).toBe(1);
    expect(Object.keys(state.agents["codex:wsl-ubuntu:session-1:root"]!.requests)).toHaveLength(2);
  });

  it("ignores duplicate and out-of-order transitions", () => {
    const started = event(2, { type: "agent.started", identity: root, turnId: "turn-2" });
    const staleStop = event(1, {
      type: "agent.activity",
      identity: root,
      turnId: "turn-1",
      activity: "completed"
    });

    let state = createStatusState();
    state = applyEvent(state, started);
    state = applyEvent(state, started);
    state = applyEvent(state, staleStop);

    const agent = state.agents["codex:wsl-ubuntu:session-1:root"]!;
    expect(agent.activity).toBe("working");
    expect(agent.currentTurnId).toBe("turn-2");
    expect(Object.keys(state.seenEventIds)).toHaveLength(1);
  });

  it("tracks helpers without inflating the root-session count", () => {
    const state = replayEvents([
      event(1, { type: "agent.started", identity: root, turnId: "turn-1" }),
      event(2, { type: "agent.started", identity: helper, turnId: "helper-turn-1" })
    ]);

    expect(aggregateStatus(state)).toMatchObject({
      agents: 2,
      working: 2,
      rootSessions: 1
    });
  });

  it("retains a completed result until it is acknowledged", () => {
    const ready = replayEvents([
      event(1, { type: "agent.started", identity: root, turnId: "turn-1" }),
      event(2, { type: "result.ready", identity: root, turnId: "turn-1" })
    ]);

    expect(aggregateStatus(ready).resultsReady).toBe(1);

    const acknowledged = applyEvent(
      ready,
      event(3, { type: "result.acknowledged", identity: root })
    );
    expect(aggregateStatus(acknowledged).resultsReady).toBe(0);
  });

  it("marks a disconnected collector unknown without erasing pending requests", () => {
    const state = replayEvents([
      event(1, { type: "collector.connected", capabilities: ["requests"] }),
      event(2, { type: "agent.started", identity: root, turnId: "turn-1" }),
      event(3, {
        type: "request.opened",
        identity: root,
        request: {
          requestId: "approval-1",
          kind: "approval",
          blocking: true,
          confidence: "confirmed",
          evidence: "App-server request"
        }
      }),
      event(4, { type: "collector.disconnected", reason: "Bridge closed" })
    ]);

    expect(aggregateStatus(state)).toMatchObject({
      working: 0,
      needsYou: 1,
      unknown: 1,
      disconnectedCollectors: 1
    });
  });

  it("ships a deterministic mixed-workload demo without provider data", () => {
    const state = replayEvents(createDemoEvents());

    expect(aggregateStatus(state)).toEqual({
      agents: 5,
      working: 3,
      needsYou: 2,
      resultsReady: 1,
      unknown: 0,
      rootSessions: 4,
      disconnectedCollectors: 0
    });
  });
});
