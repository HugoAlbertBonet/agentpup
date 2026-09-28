import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectIntegration,
  installIntegration,
  uninstallIntegration
} from "./installer.js";

describe("provider integration installer", () => {
  it("backs up, merges, reinstalls idempotently, and removes only its own hooks", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "claudepet-integration-"));
    await mkdir(path.join(home, ".claude"), { recursive: true });
    await mkdir(path.join(home, ".codex"), { recursive: true });
    const claudeSettings = {
      theme: "dark",
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "existing-claude", timeout: 2 }] }]
      }
    };
    const codexSettings = {
      description: "Existing hooks",
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "existing-codex", timeout: 2 }] }]
      }
    };
    await writeFile(
      path.join(home, ".claude", "settings.json"),
      JSON.stringify(claudeSettings, null, 2)
    );
    await writeFile(
      path.join(home, ".codex", "hooks.json"),
      JSON.stringify(codexSettings, null, 2)
    );
    const hookSourcePath = path.join(home, "source-hook.cjs");
    const deployedHookPath = path.join(home, ".claudepet", "runtime", "hook.cjs");
    await writeFile(hookSourcePath, "HOOK_RUNTIME");

    const options = {
      home,
      nodePath: "/usr/bin/node",
      hookPath: hookSourcePath,
      deployedHookPath,
      backupStamp: "20260925-120000"
    };
    const first = await installIntegration(options);
    const second = await installIntegration(options);

    expect(first.changed).toEqual(["claude-code", "codex"]);
    expect(first.backups).toHaveLength(2);
    expect(second.changed).toEqual([]);
    expect((await inspectIntegration(home)).every((item) => item.installed)).toBe(true);
    expect(await readFile(deployedHookPath, "utf8")).toBe("HOOK_RUNTIME");
    expect(await readFile(path.join(home, ".claude", "settings.json"), "utf8")).toContain(
      deployedHookPath
    );

    await uninstallIntegration(home, deployedHookPath);
    expect(JSON.parse(await readFile(path.join(home, ".claude", "settings.json"), "utf8"))).toEqual(
      claudeSettings
    );
    expect(JSON.parse(await readFile(path.join(home, ".codex", "hooks.json"), "utf8"))).toEqual(
      codexSettings
    );
    await expect(access(deployedHookPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
