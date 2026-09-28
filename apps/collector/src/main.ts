import os from "node:os";
import path from "node:path";

import {
  createSnapshotEvents,
  scanTranscriptSessions,
  type CollectorProviderDiagnostics,
  type CollectorSnapshotMessage
} from "../../../packages/collectors/src/live-collector.js";
import { readHookInbox } from "../../../packages/collectors/src/hook-inbox.js";
import { reconcileHookSnapshots } from "../../../packages/collectors/src/hook-events.js";
import { inspectIntegration } from "../../../packages/integration/src/installer.js";
import { providerVersion } from "../../../packages/integration/src/provider-command.js";
import { agentPupDataHomes } from "../../../packages/integration/src/product-paths.js";

const home = os.homedir();
const distro = process.env.WSL_DISTRO_NAME ?? os.hostname();
const collectorPrefix = `wsl:${distro}`;
const collectorIds = [`${collectorPrefix}:codex`, `${collectorPrefix}:claude-code`];
const agentPupHomes = agentPupDataHomes(home, process.env);
const scanIntervalMs = 1_500;
const heartbeatIntervalMs = 15_000;
let previousFingerprint = "";
let lastPublishedAt = 0;
let scanInProgress = false;
let stopped = false;

const versions = {
  codex: providerVersion("codex"),
  "claude-code": providerVersion("claude")
};

async function providerDiagnostics(
  hookEvents: Awaited<ReturnType<typeof readHookInbox>>
): Promise<CollectorProviderDiagnostics[]> {
  const inspections = await inspectIntegration({
    home,
    ...(process.env.CODEX_HOME === undefined ? {} : { codexHome: process.env.CODEX_HOME }),
    ...(process.env.CLAUDE_CONFIG_DIR === undefined
      ? {}
      : { claudeHome: process.env.CLAUDE_CONFIG_DIR })
  });
  return (["codex", "claude-code"] as const).map((provider) => {
    const inspection = inspections.find((value) => value.provider === provider);
    return {
      provider,
      version: versions[provider],
      hookConfiguration:
        inspection === undefined
          ? "unknown"
          : !inspection.valid
            ? "invalid"
            : inspection.installed
              ? "configured"
              : "not-configured",
      hookEventsObserved: hookEvents.some((event) => event.provider === provider)
    };
  });
}

async function scanOnce(): Promise<void> {
  if (scanInProgress || stopped) return;
  scanInProgress = true;
  try {
    const now = Date.now();
    const [transcriptSessions, hookInboxes] = await Promise.all([
      scanTranscriptSessions({
        codexHome: process.env.CODEX_HOME ?? path.join(home, ".codex"),
        claudeHome: process.env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"),
        collectorPrefix,
        limitPerProvider: 20,
        now
      }),
      Promise.all(agentPupHomes.map((dataHome) => readHookInbox(dataHome, now)))
    ]);
    const hookEvents = hookInboxes.flat();
    const providers = await providerDiagnostics(hookEvents);
    const sessions = reconcileHookSnapshots(
      transcriptSessions,
      hookEvents,
      collectorPrefix,
      now
    ).filter(
      (session) =>
        session.requests.length > 0 || now - Date.parse(session.observedAt) <= 30 * 60_000
    );
    const fingerprint = JSON.stringify({ sessions, providers });
    if (fingerprint === previousFingerprint && now - lastPublishedAt < heartbeatIntervalMs) return;
    previousFingerprint = fingerprint;
    lastPublishedAt = now;
    const message: CollectorSnapshotMessage = {
      protocolVersion: 1,
      type: "snapshot",
      events: createSnapshotEvents(sessions, collectorIds, new Date(now).toISOString()),
      diagnostics: {
        observedAt: new Date(now).toISOString(),
        transcriptFallback: true,
        providers
      }
    };
    process.stdout.write(`${JSON.stringify(message)}\n`);
  } catch (error) {
    const description = error instanceof Error ? error.message : "unknown collector failure";
    process.stderr.write(`[agentpup-collector] ${description}\n`);
  } finally {
    scanInProgress = false;
  }
}

const interval = setInterval(() => void scanOnce(), scanIntervalMs);
void scanOnce();

function stop(): void {
  stopped = true;
  clearInterval(interval);
  process.exit(0);
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
