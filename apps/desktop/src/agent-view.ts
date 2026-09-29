import type {
  AgentStatus,
  Provider,
  StatusState
} from "../../../packages/status/src/index.js";

export interface ProviderPresentation {
  label: string;
  icon: "claude" | "codex";
}

export function providerPresentation(provider: Provider): ProviderPresentation {
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
