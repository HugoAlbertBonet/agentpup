import type { HookEnvelope } from "./hook-events.js";

/** Cursor metadata only. Permission hooks are deliberately not registered. */
export function normalizeCursorHook(payload: Record<string, unknown>, observedAt: string): HookEnvelope | null {
  const text = (key: string): string | undefined =>
    typeof payload[key] === "string" && payload[key].length > 0 ? payload[key] as string : undefined;
  const hook = text("hook_event_name");
  const childHook = hook === "subagentStart" || hook === "subagentStop";
  const sessionId = (childHook ? text("parent_conversation_id") : undefined) ?? text("conversation_id");
  const turnId = text("generation_id");
  const childId = text("subagent_id");
  if (!sessionId || !turnId || (childHook && !childId)) return null;
  const agentId = childHook ? childId! : "root";
  const roots = Array.isArray(payload.workspace_roots) ? payload.workspace_roots : [];
  const cwd = text("cwd") ?? (typeof roots[0] === "string" ? roots[0] : undefined);
  const base = {
    protocolVersion: 1 as const, provider: "cursor" as const,
    eventId: `cursor:${sessionId}:${hook}:${turnId}:${agentId}:${observedAt}`,
    sessionId, turnId, agentId, observedAt,
    ...(childHook ? { parentAgentId: "root" } : {}),
    project: cwd?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || "Unknown project"
  };
  switch (hook) {
    case "beforeSubmitPrompt":
    case "subagentStart": return { ...base, event: "agent.started" };
    case "sessionEnd": return { ...base, event: "agent.ended" };
    case "stop":
    case "subagentStop":
      if (payload.status === "aborted") return { ...base, event: "agent.interrupted" };
      if (payload.status === "error") return { ...base, event: "agent.failed" };
      if (payload.status === "completed") return { ...base, event: childHook ? "agent.ended" : "result.ready" };
      return null;
    default: return null;
  }
}
