import { describe, expect, it } from "vitest";

import {
  AGENTPUP_HOOK_MARKER,
  buildProviderHooks,
  hasAgentPupHooks,
  mergeProviderHooks,
  removeAgentPupHooks
} from "./config.js";

describe("hook configuration merging", () => {
  const existing = {
    theme: "dark",
    hooks: {
      SessionStart: [
        {
          matcher: "startup",
          hooks: [{ type: "command", command: "existing-hook", timeout: 3 }]
        }
      ]
    }
  };

  it("preserves existing hooks and installs each provider idempotently", () => {
    const additions = buildProviderHooks("claude-code", "/usr/bin/node", "/repo/dist/hook.cjs");
    const once = mergeProviderHooks(existing, additions);
    const twice = mergeProviderHooks(once, additions);

    expect(once.theme).toBe("dark");
    expect(once.hooks?.SessionStart?.[0]).toEqual(existing.hooks.SessionStart[0]);
    expect(twice).toEqual(once);
    expect(hasAgentPupHooks(twice)).toBe(true);
    expect(JSON.stringify(twice)).toContain(AGENTPUP_HOOK_MARKER);
  });

  it("removes only AgentPup-owned entries", () => {
    const additions = buildProviderHooks("codex", "/usr/bin/node", "/repo/dist/hook.cjs");
    const installed = mergeProviderHooks(existing, additions);
    const removed = removeAgentPupHooks(installed);

    expect(removed).toEqual(existing);
    expect(hasAgentPupHooks(removed)).toBe(false);
  });

  it("replaces legacy Claudepet hooks without disturbing unrelated hooks", () => {
    const legacy = structuredClone(existing);
    legacy.hooks.SessionStart.push({
      matcher: "",
      hooks: [{
        type: "command",
        command: "'/usr/bin/node' '/home/me/.claudepet/runtime/hook.cjs' --claudepet-hook-v1 --provider=codex",
        timeout: 5
      }]
    });

    const additions = buildProviderHooks("codex", "/usr/bin/node", "/home/me/.agentpup/runtime/hook.cjs");
    const migrated = mergeProviderHooks(legacy, additions);

    expect(hasAgentPupHooks(legacy)).toBe(true);
    expect(JSON.stringify(migrated)).not.toContain("--claudepet-hook-v1");
    expect(JSON.stringify(migrated)).toContain(AGENTPUP_HOOK_MARKER);
    expect(migrated.hooks?.SessionStart?.[0]).toEqual(existing.hooks.SessionStart[0]);
  });

  it("uses Codex's three-second limit for terminal lifecycle hooks", () => {
    const additions = buildProviderHooks("codex", "/usr/bin/node", "/repo/dist/hook.cjs");

    expect(additions.hooks?.SessionEnd?.[0]?.hooks[0]?.timeout).toBe(3);
    expect(additions.hooks?.Interrupt?.[0]?.hooks[0]?.timeout).toBe(3);
    expect(additions.hooks?.SessionStart?.[0]?.hooks[0]?.timeout).toBe(5);
  });
});
