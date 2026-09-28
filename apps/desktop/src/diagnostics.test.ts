import { describe, expect, it } from "vitest";

import { replayEvents, type StatusEvent } from "../../../packages/status/src/index.js";
import type { CollectorRuntimeDiagnostics } from "../../../packages/collectors/src/live-collector.js";
import { createDiagnosticsSnapshot, formatDiagnosticsReport } from "./diagnostics.js";

describe("privacy-safe desktop diagnostics", () => {
  it("summarizes collector and provider health without agent metadata", () => {
    const events: StatusEvent[] = [
      {
        type: "collector.connected",
        eventId: "collector:1",
        collectorId: "wsl:Private-Distro:codex",
        sequence: 1,
        observedAt: "2026-09-27T10:00:00.000Z",
        capabilities: ["filesystem-recovery", "lifecycle-hooks"]
      },
      {
        type: "agent.started",
        eventId: "collector:2",
        collectorId: "wsl:Private-Distro:codex",
        sequence: 2,
        observedAt: "2026-09-27T10:00:01.000Z",
        turnId: "PRIVATE_TURN",
        identity: {
          provider: "codex",
          collectorId: "wsl:Private-Distro:codex",
          sessionId: "PRIVATE_SESSION",
          agentId: "root",
          displayName: "PRIVATE_DISPLAY",
          project: "PRIVATE_PROJECT"
        }
      }
    ];
    const collector: CollectorRuntimeDiagnostics = {
      observedAt: "2026-09-27T10:00:02.000Z",
      transcriptFallback: true,
      providers: [
        {
          provider: "codex",
          version: "codex-cli 0.155.0",
          hookConfiguration: "configured",
          hookEventsObserved: true
        },
        {
          provider: "claude-code",
          version: null,
          hookConfiguration: "invalid",
          hookEventsObserved: false
        }
      ]
    };

    const snapshot = createDiagnosticsSnapshot({
      generatedAt: "2026-09-27T10:00:03.000Z",
      applicationVersion: "0.0.0",
      electronVersion: "44.4.5",
      platform: "win32",
      runtime: "native",
      collectorState: "connected",
      collector,
      lastEvent: { type: "agent.started", observedAt: "2026-09-27T10:00:01.000Z" },
      status: replayEvents(events)
    });

    expect(snapshot).toMatchObject({
      collector: {
        state: "connected",
        lastSnapshotAt: "2026-09-27T10:00:02.000Z",
        transcriptFallback: true,
        lastEventType: "agent.started"
      },
      counts: { working: 1, needsYou: 0, resultsReady: 0 },
      providers: [
        {
          provider: "codex",
          version: "codex-cli 0.155.0",
          hookConfiguration: "configured",
          hookEventsObserved: true,
          capabilities: ["filesystem-recovery", "lifecycle-hooks"]
        },
        {
          provider: "claude-code",
          version: null,
          hookConfiguration: "invalid",
          hookEventsObserved: false,
          capabilities: []
        }
      ]
    });

    const report = formatDiagnosticsReport(snapshot);
    expect(report).toContain("Collector: connected");
    expect(report).toContain("Codex version: codex-cli 0.155.0");
    expect(report).toContain("Claude Code hooks: invalid");
    expect(report).not.toMatch(/PRIVATE_|Private-Distro/);
  });
});
