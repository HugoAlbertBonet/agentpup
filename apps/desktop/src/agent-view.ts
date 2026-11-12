import type {
  AgentStatus,
  Provider,
  StatusState
} from "../../../packages/status/src/index.js";
import { aggregateStatus, createStatusState } from "../../../packages/status/src/index.js";

export interface SessionAgentGroup {
  key: string;
  title: string;
  project: string;
  count: number;
  agents: Array<[string, AgentStatus]>;
  summary: ReturnType<typeof aggregateStatus>;
}

export function groupSessionAgents(entries: Array<[string, AgentStatus]>): SessionAgentGroup[] {
  const grouped = new Map<string, Array<[string, AgentStatus]>>();
  for (const entry of entries) {
    const identity = entry[1].identity;
    const key = JSON.stringify([identity.provider, identity.collectorId, identity.sessionId]);
    const members = grouped.get(key) ?? [];
    members.push(entry);
    grouped.set(key, members);
  }
  return [...grouped].map(([key, members]) => {
    members.sort(([, left], [, right]) => Number(left.identity.parentAgentId !== undefined) - Number(right.identity.parentAgentId !== undefined));
    const root = members.find(([, value]) => value.identity.parentAgentId === undefined)?.[1];
    const first = members[0]![1];
    const state = createStatusState();
    state.agents = Object.fromEntries(members);
    return {
      key,
      title: root?.identity.displayName ?? "Untitled session",
      project: (root ?? first).identity.project,
      count: members.length,
      agents: members,
      summary: aggregateStatus(state)
    };
  });
}

/** Badge counts use sessions; individual-agent state remains available in groups. */
export function aggregateSessionStatus(state: StatusState): {
  working: number; needsYou: number; resultsReady: number;
} {
  const summary = { working: 0, needsYou: 0, resultsReady: 0 };
  for (const group of groupSessionAgents(Object.entries(state.agents))) {
    summary.working += Number(group.summary.working > 0);
    summary.needsYou += Number(group.summary.needsYou > 0);
    summary.resultsReady += Number(group.summary.resultsReady > 0);
  }
  return summary;
}

export interface ProviderPresentation {
  label: string;
  icon: "claude" | "codex" | "cursor";
}

export function providerPresentation(provider: Provider): ProviderPresentation {
  if (provider === "cursor") return { label: "Cursor", icon: "cursor" };
  return provider === "claude-code"
    ? { label: "Claude Code", icon: "claude" }
    : { label: "Codex", icon: "codex" };
}

export function canDismissAgent(agent: AgentStatus): boolean {
  return (
    agent.resultReady ||
    agent.activity === "ended" ||
    agent.activity === "interrupted" ||
    agent.activity === "failed"
  );
}

export function dismissAllDismissibleAgents(
  state: StatusState,
  dismissals: Map<string, string>
): number {
  let dismissed = 0;
  for (const [key, agent] of Object.entries(state.agents)) {
    if (!canDismissAgent(agent)) continue;
    dismissals.set(key, agent.lastObservedAt);
    dismissed += 1;
  }
  return dismissed;
}

export function applyAgentDismissals(
  state: StatusState,
  dismissals: ReadonlyMap<string, string>
): StatusState {
  const agents: Record<string, AgentStatus> = {};
  for (const [key, agent] of Object.entries(state.agents)) {
    const dismissedAt = dismissals.get(key);
    if (
      dismissedAt !== undefined &&
      canDismissAgent(agent) &&
      agent.lastObservedAt <= dismissedAt
    ) {
      continue;
    }
    agents[key] = agent;
  }
  return { ...state, agents };
}

export function limitFinishedAgents(state: StatusState, maximum: number): StatusState {
  const limit = Math.max(0, Math.floor(maximum));
  const finished = Object.entries(state.agents).filter(([, agent]) => agent.resultReady);
  if (finished.length <= limit) return state;

  const retained = new Set(
    finished
      .sort(([leftKey, left], [rightKey, right]) => {
        const observed = right.lastObservedAt.localeCompare(left.lastObservedAt);
        if (observed !== 0) return observed;
        const sequence = right.activityUpdatedSequence - left.activityUpdatedSequence;
        return sequence !== 0 ? sequence : leftKey.localeCompare(rightKey);
      })
      .slice(0, limit)
      .map(([key]) => key)
  );
  const agents: Record<string, AgentStatus> = {};
  for (const [key, agent] of Object.entries(state.agents)) {
    if (!agent.resultReady || retained.has(key)) agents[key] = agent;
  }
  return { ...state, agents };
}
