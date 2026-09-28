import {
  aggregateStatus,
  type Provider,
  type StatusState
} from "../../../packages/status/src/index.js";
import type {
  CollectorRuntimeDiagnostics,
  HookConfiguration
} from "../../../packages/collectors/src/live-collector.js";
import type { OverlayRuntime } from "./window-policy.js";

export type CollectorConnectionState =
  | "connected"
  | "disconnected"
  | "waiting"
  | "unavailable"
  | "demo";

export interface SanitizedEventReference {
  readonly type: string;
  readonly observedAt: string;
}

export interface ProviderDiagnosticsSnapshot {
  readonly provider: Provider;
  readonly version: string | null;
  readonly hookConfiguration: HookConfiguration;
  readonly hookEventsObserved: boolean;
  readonly capabilities: readonly string[];
}

export interface DiagnosticsSnapshot {
  readonly generatedAt: string;
  readonly application: {
    readonly version: string;
    readonly electronVersion: string;
    readonly platform: NodeJS.Platform;
    readonly runtime: OverlayRuntime;
  };
  readonly collector: {
    readonly state: CollectorConnectionState;
    readonly lastSnapshotAt: string | null;
    readonly transcriptFallback: boolean;
    readonly lastEventType: string | null;
    readonly lastEventAt: string | null;
  };
  readonly providers: readonly ProviderDiagnosticsSnapshot[];
  readonly counts: {
    readonly working: number;
    readonly needsYou: number;
    readonly resultsReady: number;
  };
}

export interface CreateDiagnosticsInput {
  readonly generatedAt: string;
  readonly applicationVersion: string;
  readonly electronVersion: string;
  readonly platform: NodeJS.Platform;
  readonly runtime: OverlayRuntime;
  readonly collectorState: CollectorConnectionState;
  readonly collector: CollectorRuntimeDiagnostics | null;
  readonly lastEvent: SanitizedEventReference | null;
  readonly status: StatusState;
}

const providers: readonly Provider[] = ["codex", "claude-code"];

export function createDiagnosticsSnapshot(input: CreateDiagnosticsInput): DiagnosticsSnapshot {
  const summary = aggregateStatus(input.status);
  return {
    generatedAt: input.generatedAt,
    application: {
      version: input.applicationVersion,
      electronVersion: input.electronVersion,
      platform: input.platform,
      runtime: input.runtime
    },
    collector: {
      state: input.collectorState,
      lastSnapshotAt: input.collector?.observedAt ?? null,
      transcriptFallback: input.collector?.transcriptFallback ?? false,
      lastEventType: input.lastEvent?.type ?? null,
      lastEventAt: input.lastEvent?.observedAt ?? null
    },
    providers: providers.map((provider) => {
      const runtime = input.collector?.providers.find((value) => value.provider === provider);
      const capabilities = new Set<string>();
      for (const collector of Object.values(input.status.collectors)) {
        if (!collector.collectorId.endsWith(provider)) continue;
        for (const capability of collector.capabilities) capabilities.add(capability);
      }
      return {
        provider,
        version: runtime?.version ?? null,
        hookConfiguration: runtime?.hookConfiguration ?? "unknown",
        hookEventsObserved: runtime?.hookEventsObserved ?? false,
        capabilities: [...capabilities].sort()
      };
    }),
    counts: {
      working: summary.working,
      needsYou: summary.needsYou,
      resultsReady: summary.resultsReady
    }
  };
}

export function formatDiagnosticsReport(snapshot: DiagnosticsSnapshot): string {
  const lines = [
    "AgentPup diagnostics",
    `Generated: ${snapshot.generatedAt}`,
    `Application: ${snapshot.application.version}`,
    `Electron: ${snapshot.application.electronVersion}`,
    `Platform: ${snapshot.application.platform} (${snapshot.application.runtime})`,
    `Collector: ${snapshot.collector.state}`,
    `Last snapshot: ${snapshot.collector.lastSnapshotAt ?? "none"}`,
    `Transcript fallback: ${snapshot.collector.transcriptFallback ? "active" : "inactive"}`,
    `Last event: ${snapshot.collector.lastEventType ?? "none"}${
      snapshot.collector.lastEventAt === null ? "" : ` at ${snapshot.collector.lastEventAt}`
    }`,
    `Counts: ${snapshot.counts.working} working, ${snapshot.counts.needsYou} need you, ${snapshot.counts.resultsReady} ready`
  ];
  for (const provider of snapshot.providers) {
    const label = provider.provider === "codex" ? "Codex" : "Claude Code";
    lines.push(`${label} version: ${provider.version ?? "not detected"}`);
    lines.push(`${label} hooks: ${provider.hookConfiguration}`);
    lines.push(`${label} hook events observed: ${provider.hookEventsObserved ? "yes" : "no"}`);
    lines.push(
      `${label} capabilities: ${provider.capabilities.length === 0 ? "none" : provider.capabilities.join(", ")}`
    );
  }
  return `${lines.join("\n")}\n`;
}
