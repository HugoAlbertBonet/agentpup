import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { readHookInbox } from "../../../packages/collectors/src/hook-inbox.js";
import {
  inspectIntegration,
  installIntegration,
  uninstallIntegration
} from "../../../packages/integration/src/installer.js";
import { resolveAgentPupHome } from "../../../packages/integration/src/product-paths.js";
import { AGENTPUP_HOOK_MARKER } from "../../../packages/integration/src/config.js";
import { providerVersion } from "../../../packages/integration/src/provider-command.js";

const command = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const home = os.homedir();
const hookSourcePath = path.join(__dirname, "hook.cjs");
const agentPupHome = resolveAgentPupHome(home, process.env);
const deployedHookPath = path.join(agentPupHome, "runtime", "hook.cjs");
const integrationLocations = {
  home,
  ...(process.env.CODEX_HOME === undefined ? {} : { codexHome: process.env.CODEX_HOME }),
  ...(process.env.CLAUDE_CONFIG_DIR === undefined
    ? {}
    : { claudeHome: process.env.CLAUDE_CONFIG_DIR })
};

function printTargets(): void {
  console.log("AgentPup will add metadata-only command hooks to:");
  console.log(`  Claude Code: ${process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude")}/settings.json`);
  console.log(`  Codex:       ${process.env.CODEX_HOME ?? path.join(home, ".codex")}/hooks.json`);
  console.log(`  Hook helper: ${deployedHookPath}`);
  console.log("Existing hook entries are preserved; prompt and tool bodies are discarded.");
}

async function doctor(): Promise<boolean> {
  const inspections = await inspectIntegration(integrationLocations);
  let healthy = true;
  console.log(`Claude Code: ${providerVersion("claude") ?? "not found"}`);
  console.log(`Codex:       ${providerVersion("codex") ?? "not found"}`);
  for (const inspection of inspections) {
    const label = inspection.provider === "claude-code" ? "Claude hooks" : "Codex hooks";
    const state = !inspection.valid
      ? `invalid (${inspection.error ?? "unknown error"})`
      : inspection.installed
        ? "installed"
        : "not installed";
    console.log(`${label}: ${state} at ${inspection.filePath}`);
    if (!inspection.valid || !inspection.installed) healthy = false;
  }

  try {
    await access(deployedHookPath);
    const temporaryHome = await mkdtemp(path.join(os.tmpdir(), "agentpup-doctor-"));
    try {
      const test = spawnSync(
        process.execPath,
        [deployedHookPath, AGENTPUP_HOOK_MARKER, "--provider=codex"],
        {
          encoding: "utf8",
          timeout: 5_000,
          input: JSON.stringify({
            hook_event_name: "UserPromptSubmit",
            session_id: "doctor-session",
            cwd: "/doctor"
          }),
          env: { ...process.env, AGENTPUP_HOME: temporaryHome }
        }
      );
      const events = await readHookInbox(temporaryHome);
      const helperHealthy = test.status === 0 && test.stdout.trim() === "{}" && events.length === 1;
      console.log(`Hook delivery self-test: ${helperHealthy ? "passed" : "failed"}`);
      if (!helperHealthy) healthy = false;
    } finally {
      await rm(temporaryHome, { recursive: true, force: true });
    }
  } catch {
    console.log(`Hook helper: missing at ${deployedHookPath}`);
    healthy = false;
  }
  console.log("Codex requires reviewing and trusting the installed user hook in /hooks.");
  return healthy;
}

async function main(): Promise<void> {
  switch (command) {
    case "status": {
      const inspections = await inspectIntegration(integrationLocations);
      console.log(
        JSON.stringify({
          protocolVersion: 1,
          environment: process.env.WSL_DISTRO_NAME === undefined ? "native" : "wsl",
          providers: inspections.map((inspection) => ({
            provider: inspection.provider,
            version: providerVersion(inspection.provider === "codex" ? "codex" : "claude"),
            installed: inspection.installed,
            valid: inspection.valid
          }))
        })
      );
      return;
    }
    case "setup": {
      printTargets();
      if (dryRun) {
        console.log("Dry run complete; no files were changed.");
        return;
      }
      await access(hookSourcePath);
      const report = await installIntegration({
        home,
        ...(integrationLocations.codexHome === undefined
          ? {}
          : { codexHome: integrationLocations.codexHome }),
        ...(integrationLocations.claudeHome === undefined
          ? {}
          : { claudeHome: integrationLocations.claudeHome }),
        nodePath: process.execPath,
        hookPath: hookSourcePath,
        deployedHookPath
      });
      console.log(
        report.changed.length === 0
          ? "AgentPup hooks were already up to date."
          : `Updated: ${report.changed.join(", ")}`
      );
      for (const backup of report.backups) console.log(`Backup: ${backup}`);
      console.log("In Codex, open /hooks and trust the AgentPup user hook when prompted.");
      return;
    }
    case "doctor":
      if (!(await doctor())) process.exitCode = 1;
      return;
    case "uninstall": {
      const report = await uninstallIntegration(integrationLocations, deployedHookPath);
      console.log(
        report.changed.length === 0
          ? "No AgentPup hooks were installed."
          : `Removed AgentPup hooks from: ${report.changed.join(", ")}`
      );
      for (const backup of report.backups) console.log(`Backup: ${backup}`);
      return;
    }
    default:
      console.error("Usage: integration.cjs <status | setup [--dry-run] | doctor | uninstall>");
      process.exitCode = 2;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Integration command failed");
  process.exitCode = 1;
});
