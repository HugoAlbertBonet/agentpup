import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installIntegration, inspectIntegration, uninstallIntegration } from "./installer.js";
import { buildProviderHooks, hasAgentPupHooks } from "./config.js";

describe("Cursor integration", () => {
  it("keeps Windows executable paths literal and marks encoded commands as owned", () => {
    const hooks = buildProviderHooks("cursor", "C:\\Program Files\\AgentPup\\AgentPup.exe", "C:\\Users\\O'Brien\\hook.cjs", "win32");
    const command = hooks.hooks?.stop?.[0]?.hooks[0]?.command!;
    const encoded = command.split("-EncodedCommand ")[1]!;
    const script = Buffer.from(encoded, "base64").toString("utf16le");
    expect(script).toContain("$env:ELECTRON_RUN_AS_NODE='1'");
    expect(script).toContain("O''Brien");
    expect(script).toContain("--provider=cursor");
    expect(hasAgentPupHooks(hooks)).toBe(true);
  });
  it("can install only Cursor without creating other provider configurations", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "agentpup-cursor-only-"));
    try {
      const report = await installIntegration({ home, providers: ["cursor"], nodePath: "/usr/bin/node", hookPath: "/runtime/hook.cjs" });
      expect(report.changed).toEqual(["cursor"]);
      await expect(readFile(path.join(home, ".codex", "hooks.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(home, { recursive: true, force: true }); }
  });
  it("backs up and preserves flat Cursor hooks, installs idempotently, and removes only owned handlers", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "agentpup-cursor-"));
    try {
      await mkdir(path.join(home, ".cursor"));
      const file = path.join(home, ".cursor", "hooks.json");
      const original = { version: 1, custom: "preserve", hooks: { stop: [{ command: "other-observer", loop_limit: 2 }] } };
      await writeFile(file, JSON.stringify(original));
      const options = { home, nodePath: "/usr/bin/node", hookPath: "/runtime/hook.cjs" };
      await installIntegration(options);
      const installed = JSON.parse(await readFile(file, "utf8"));
      expect(installed.version).toBe(1);
      expect(installed.hooks.stop[0]).toEqual(original.hooks.stop[0]);
      expect(installed.hooks.beforeSubmitPrompt[0].command).toContain("--provider=cursor");
      expect(installed.hooks.beforeShellExecution).toBeUndefined();
      expect(installed.hooks.subagentStart).toBeUndefined();
      expect((await installIntegration(options)).changed).toEqual([]);
      expect((await inspectIntegration(home)).find(p => p.provider === "cursor")?.installed).toBe(true);
      await uninstallIntegration(home);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual(original);
    } finally { await rm(home, { recursive: true, force: true }); }
  });
});
