export type Provider = "claude-code" | "codex";

export type Activity =
  | "working"
  | "idle"
  | "completed"
  | "failed"
  | "interrupted"
  | "ended"
  | "unknown";

export type RequestKind = "approval" | "question" | "plan" | "mcp-input";
export type EvidenceConfidence = "provisional" | "confirmed";

export interface AgentIdentity {
  provider: Provider;
  collectorId: string;
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  displayName: string;
  project: string;
}

export interface RequestInput {
  requestId: string;
  kind: RequestKind;
  blocking: boolean;
  confidence: EvidenceConfidence;
  evidence: string;
}

interface EventBase {
  eventId: string;
  collectorId: string;
  sequence: number;
  observedAt: string;
}

export type StatusEvent =
  | (EventBase & {
      type: "collector.connected";
      capabilities: string[];
    })
  | (EventBase & {
      type: "collector.disconnected";
      reason: string;
    })
  | (EventBase & {
      type: "agent.started";
      identity: AgentIdentity;
      turnId: string;
    })
  | (EventBase & {
      type: "agent.discovered";
      identity: AgentIdentity;
    })
  | (EventBase & {
      type: "agent.activity";
      identity: AgentIdentity;
      turnId: string;
      activity: Exclude<Activity, "unknown">;
    })
  | (EventBase & {
      type: "request.opened";
      identity: AgentIdentity;
      turnId?: string;
      request: RequestInput;
    })
  | (EventBase & {
      type: "request.resolved";
      identity: AgentIdentity;
      requestId: string;
      resolution: "approved" | "answered" | "denied" | "cancelled" | "unknown";
    })
  | (EventBase & {
      type: "result.ready";
      identity: AgentIdentity;
      turnId: string;
    })
  | (EventBase & {
      type: "result.acknowledged";
      identity: AgentIdentity;
    });

export interface PendingRequest extends RequestInput {
  openedAt: string;
  updatedAt: string;
  updatedSequence: number;
  resolved: boolean;
  resolution: "approved" | "answered" | "denied" | "cancelled" | "unknown" | null;
}

export interface AgentStatus {
  identity: AgentIdentity;
  activity: Activity;
  lastKnownActivity: Activity | null;
  currentTurnId: string | null;
  requests: Record<string, PendingRequest>;
  resultReady: boolean;
  sourceConnected: boolean;
  lastObservedAt: string;
  activityUpdatedSequence: number;
}

export interface CollectorStatus {
  collectorId: string;
  connected: boolean;
  capabilities: string[];
  lastSeenAt: string;
  reason: string | null;
}

export interface StatusState {
  agents: Record<string, AgentStatus>;
  collectors: Record<string, CollectorStatus>;
  lastSequenceByCollector: Record<string, number>;
  seenEventIds: Record<string, true>;
}

export interface StatusSummary {
  agents: number;
  working: number;
  needsYou: number;
  resultsReady: number;
  unknown: number;
  rootSessions: number;
  disconnectedCollectors: number;
}

export function agentKey(identity: AgentIdentity): string {
  return [identity.provider, identity.collectorId, identity.sessionId, identity.agentId].join(":");
}

export function createStatusState(): StatusState {
  return {
    agents: {},
    collectors: {},
    lastSequenceByCollector: {},
    seenEventIds: {}
  };
}

function copyAgent(agent: AgentStatus): AgentStatus {
  return {
    ...agent,
    identity: { ...agent.identity },
    requests: { ...agent.requests }
  };
}

function createAgent(identity: AgentIdentity, event: StatusEvent): AgentStatus {
  return {
    identity: { ...identity },
    activity: "unknown",
    lastKnownActivity: null,
    currentTurnId: null,
    requests: {},
    resultReady: false,
    sourceConnected: true,
    lastObservedAt: event.observedAt,
    activityUpdatedSequence: event.sequence
  };
}

function ensureCollector(state: StatusState, event: StatusEvent): CollectorStatus {
  return (
    state.collectors[event.collectorId] ?? {
      collectorId: event.collectorId,
      connected: true,
      capabilities: [],
      lastSeenAt: event.observedAt,
      reason: null
    }
  );
}

export function applyEvent(state: StatusState, event: StatusEvent): StatusState {
  if (state.seenEventIds[event.eventId]) {
    return state;
  }

  const lastSequence = state.lastSequenceByCollector[event.collectorId] ?? 0;
  if (!Number.isSafeInteger(event.sequence) || event.sequence <= lastSequence) {
    return state;
  }

  const next: StatusState = {
    agents: { ...state.agents },
    collectors: { ...state.collectors },
    lastSequenceByCollector: {
      ...state.lastSequenceByCollector,
      [event.collectorId]: event.sequence
    },
    seenEventIds: { ...state.seenEventIds, [event.eventId]: true }
  };

  const collector = ensureCollector(state, event);
  next.collectors[event.collectorId] = {
    ...collector,
    connected: true,
    lastSeenAt: event.observedAt,
    reason: null
  };

  if (event.type === "collector.connected") {
    next.collectors[event.collectorId] = {
      collectorId: event.collectorId,
      connected: true,
      capabilities: [...event.capabilities],
      lastSeenAt: event.observedAt,
      reason: null
    };
    return next;
  }

  if (event.type === "collector.disconnected") {
    next.collectors[event.collectorId] = {
      ...collector,
      connected: false,
      lastSeenAt: event.observedAt,
      reason: event.reason
    };

    for (const [key, current] of Object.entries(next.agents)) {
      if (current.identity.collectorId !== event.collectorId) continue;
      const agent = copyAgent(current);
      if (agent.activity !== "unknown") agent.lastKnownActivity = agent.activity;
      agent.activity = "unknown";
      agent.sourceConnected = false;
      agent.lastObservedAt = event.observedAt;
      next.agents[key] = agent;
    }
    return next;
  }

  const key = agentKey(event.identity);
  const agent = copyAgent(next.agents[key] ?? createAgent(event.identity, event));
  agent.identity = { ...event.identity };
  agent.sourceConnected = true;
  agent.lastObservedAt = event.observedAt;

  switch (event.type) {
    case "agent.discovered":
      agent.activity = "unknown";
      agent.lastKnownActivity = null;
      agent.activityUpdatedSequence = event.sequence;
      break;

    case "agent.started":
      agent.activity = "working";
      agent.lastKnownActivity = "working";
      agent.currentTurnId = event.turnId;
      agent.resultReady = false;
      agent.activityUpdatedSequence = event.sequence;
      break;

    case "agent.activity":
      if (agent.currentTurnId !== null && event.turnId !== agent.currentTurnId) return next;
      agent.activity = event.activity;
      agent.lastKnownActivity = event.activity;
      agent.currentTurnId = event.turnId;
      agent.activityUpdatedSequence = event.sequence;
      break;

    case "request.opened":
      agent.requests[event.request.requestId] = {
        ...event.request,
        openedAt: event.observedAt,
        updatedAt: event.observedAt,
        updatedSequence: event.sequence,
        resolved: false,
        resolution: null
      };
      break;

    case "request.resolved": {
      const request = agent.requests[event.requestId];
      if (request && event.sequence > request.updatedSequence) {
        agent.requests[event.requestId] = {
          ...request,
          resolved: true,
          resolution: event.resolution,
          updatedAt: event.observedAt,
          updatedSequence: event.sequence
        };
      }
      break;
    }

    case "result.ready":
      if (agent.currentTurnId !== null && event.turnId !== agent.currentTurnId) return next;
      agent.activity = "completed";
      agent.lastKnownActivity = "completed";
      agent.resultReady = true;
      agent.activityUpdatedSequence = event.sequence;
      break;

    case "result.acknowledged":
      agent.resultReady = false;
      break;
  }

  next.agents[key] = agent;
  return next;
}

export function replayEvents(events: readonly StatusEvent[]): StatusState {
  return events.reduce(applyEvent, createStatusState());
}

export function aggregateStatus(state: StatusState): StatusSummary {
  const agents = Object.values(state.agents);
  const rootSessions = new Set<string>();
  let working = 0;
  let needsYou = 0;
  let resultsReady = 0;
  let unknown = 0;

  for (const agent of agents) {
    if (agent.activity === "working" && agent.sourceConnected) working += 1;
    if (
      Object.values(agent.requests).some(
        (request) => !request.resolved && request.confidence === "confirmed"
      )
    ) {
      needsYou += 1;
    }
    if (agent.resultReady) resultsReady += 1;
    if (!agent.sourceConnected || agent.activity === "unknown") unknown += 1;

    if (agent.identity.parentAgentId === undefined) {
      rootSessions.add(
        [agent.identity.provider, agent.identity.collectorId, agent.identity.sessionId].join(":")
      );
    }
  }

  return {
    agents: agents.length,
    working,
    needsYou,
    resultsReady,
    unknown,
    rootSessions: rootSessions.size,
    disconnectedCollectors: Object.values(state.collectors).filter(
      (collector) => !collector.connected
    ).length
  };
}

export function createDemoEvents(): StatusEvent[] {
  const codexRoot: AgentIdentity = {
    provider: "codex",
    collectorId: "wsl-ubuntu",
    sessionId: "codex-checkout",
    agentId: "root",
    displayName: "Implement checkout",
    project: "Website"
  };
  const codexHelper: AgentIdentity = {
    ...codexRoot,
    agentId: "tests",
    parentAgentId: "root",
    displayName: "Review test coverage"
  };
  const claudeApi: AgentIdentity = {
    provider: "claude-code",
    collectorId: "windows-native",
    sessionId: "claude-api",
    agentId: "root",
    displayName: "Refactor authentication",
    project: "API"
  };
  const claudeDocs: AgentIdentity = {
    ...claudeApi,
    sessionId: "claude-docs",
    displayName: "Publish migration guide",
    project: "Docs"
  };
  const claudeDesktop: AgentIdentity = {
    ...claudeApi,
    sessionId: "claude-desktop",
    displayName: "Polish settings panel",
    project: "Desktop"
  };

  return [
    {
      type: "collector.connected",
      eventId: "demo-codex-connected",
      collectorId: "wsl-ubuntu",
      sequence: 1,
      observedAt: "2026-09-25T12:00:00.000Z",
      capabilities: ["requests", "subagents", "results"]
    },
    {
      type: "agent.started",
      eventId: "demo-codex-root-started",
      collectorId: "wsl-ubuntu",
      sequence: 2,
      observedAt: "2026-09-25T12:00:01.000Z",
      identity: codexRoot,
      turnId: "turn-checkout"
    },
    {
      type: "request.opened",
      eventId: "demo-codex-question",
      collectorId: "wsl-ubuntu",
      sequence: 3,
      observedAt: "2026-09-25T12:00:02.000Z",
      identity: codexRoot,
      turnId: "turn-checkout",
      request: {
        requestId: "question-tax-region",
        kind: "question",
        blocking: false,
        confidence: "confirmed",
        evidence: "Synthetic structured input request"
      }
    },
    {
      type: "agent.started",
      eventId: "demo-codex-helper-started",
      collectorId: "wsl-ubuntu",
      sequence: 4,
      observedAt: "2026-09-25T12:00:03.000Z",
      identity: codexHelper,
      turnId: "turn-tests"
    },
    {
      type: "result.ready",
      eventId: "demo-codex-helper-result",
      collectorId: "wsl-ubuntu",
      sequence: 5,
      observedAt: "2026-09-25T12:00:04.000Z",
      identity: codexHelper,
      turnId: "turn-tests"
    },
    {
      type: "collector.connected",
      eventId: "demo-claude-connected",
      collectorId: "windows-native",
      sequence: 1,
      observedAt: "2026-09-25T12:00:00.000Z",
      capabilities: ["requests", "results"]
    },
    {
      type: "agent.started",
      eventId: "demo-claude-api-started",
      collectorId: "windows-native",
      sequence: 2,
      observedAt: "2026-09-25T12:00:01.000Z",
      identity: claudeApi,
      turnId: "turn-auth"
    },
    {
      type: "agent.started",
      eventId: "demo-claude-docs-started",
      collectorId: "windows-native",
      sequence: 3,
      observedAt: "2026-09-25T12:00:02.000Z",
      identity: claudeDocs,
      turnId: "turn-docs"
    },
    {
      type: "request.opened",
      eventId: "demo-claude-approval",
      collectorId: "windows-native",
      sequence: 4,
      observedAt: "2026-09-25T12:00:03.000Z",
      identity: claudeDocs,
      turnId: "turn-docs",
      request: {
        requestId: "approval-publish",
        kind: "approval",
        blocking: true,
        confidence: "confirmed",
        evidence: "Synthetic visible approval prompt"
      }
    },
    {
      type: "agent.activity",
      eventId: "demo-claude-docs-idle",
      collectorId: "windows-native",
      sequence: 5,
      observedAt: "2026-09-25T12:00:04.000Z",
      identity: claudeDocs,
      turnId: "turn-docs",
      activity: "idle"
    },
    {
      type: "agent.started",
      eventId: "demo-claude-desktop-started",
      collectorId: "windows-native",
      sequence: 6,
      observedAt: "2026-09-25T12:00:05.000Z",
      identity: claudeDesktop,
      turnId: "turn-settings"
    }
  ];
}
