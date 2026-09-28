export const AGENTPUP_HOOK_MARKER = "--agentpup-hook-v1";
export const LEGACY_CLAUDEPET_HOOK_MARKER = "--claudepet-hook-v1";

export type HookProvider = "codex" | "claude-code";

export interface HookHandler {
  [key: string]: unknown;
  type: string;
  command?: string;
  timeout?: number;
}

export interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
}

export interface HookSettings {
  [key: string]: unknown;
  hooks?: Record<string, HookGroup[]>;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function owned(handler: HookHandler): boolean {
  return (
    handler.type === "command" &&
    typeof handler.command === "string" &&
    [AGENTPUP_HOOK_MARKER, LEGACY_CLAUDEPET_HOOK_MARKER].some((marker) =>
      handler.command!.includes(marker)
    )
  );
}

const commonEvents: ReadonlyArray<{ event: string; matcher?: string }> = [
  { event: "SessionStart" },
  { event: "SessionEnd" },
  { event: "UserPromptSubmit" },
  { event: "PermissionRequest" },
  { event: "PreToolUse", matcher: "AskUserQuestion|ExitPlanMode" },
  { event: "PostToolUse" },
  { event: "Stop" },
  { event: "SubagentStart" },
  { event: "SubagentStop" }
];

export function buildProviderHooks(
  provider: HookProvider,
  nodePath: string,
  hookPath: string
): HookSettings {
  const command = `${shellQuote(nodePath)} ${shellQuote(hookPath)} ${AGENTPUP_HOOK_MARKER} --provider=${provider}`;
  const eventSpecs = [
    ...commonEvents,
    ...(provider === "codex"
      ? [{ event: "Interrupt" }]
      : [{ event: "PostToolUseFailure" }])
  ];
  const hooks: Record<string, HookGroup[]> = {};
  for (const spec of eventSpecs) {
    const timeout =
      provider === "codex" && (spec.event === "SessionEnd" || spec.event === "Interrupt")
        ? 3
        : 5;
    hooks[spec.event] = [
      {
        ...(spec.matcher === undefined ? {} : { matcher: spec.matcher }),
        hooks: [{ type: "command", command, timeout }]
      }
    ];
  }
  return { hooks };
}

export function removeAgentPupHooks(settings: HookSettings): HookSettings {
  const next = structuredClone(settings);
  if (next.hooks === undefined) return next;
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(next.hooks)) {
    const remaining = groups
      .map((group) => ({ ...group, hooks: group.hooks.filter((handler) => !owned(handler)) }))
      .filter((group) => group.hooks.length > 0);
    if (remaining.length > 0) hooks[event] = remaining;
  }
  next.hooks = hooks;
  return next;
}

export function mergeProviderHooks(
  settings: HookSettings,
  additions: HookSettings
): HookSettings {
  const next = removeAgentPupHooks(settings);
  const hooks = next.hooks ?? {};
  for (const [event, groups] of Object.entries(additions.hooks ?? {})) {
    hooks[event] = [...(hooks[event] ?? []), ...structuredClone(groups)];
  }
  next.hooks = hooks;
  return next;
}

export function hasAgentPupHooks(settings: HookSettings): boolean {
  return Object.values(settings.hooks ?? {}).some((groups) =>
    groups.some((group) => group.hooks.some(owned))
  );
}

/** Compatibility aliases for callers compiled before the product rename. */
export const removeClaudepetHooks = removeAgentPupHooks;
export const hasClaudepetHooks = hasAgentPupHooks;
