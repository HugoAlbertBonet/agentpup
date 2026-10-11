import { describe, expect, it } from "vitest";
import { mergeCollectorDiagnostics } from "./diagnostics-merge.js";
import type { CollectorRuntimeDiagnostics } from "./live-collector.js";

describe("native and WSL diagnostics", () => {
  it("retains installed native Cursor configuration when WSL has none", () => {
    const input = (installed: boolean): CollectorRuntimeDiagnostics => ({ observedAt: "2026-10-10T12:00:00.000Z", transcriptFallback: true, providers: [{ provider: "cursor", version: null, hookConfiguration: installed ? "configured" : "not-configured", hookEventsObserved: false }] });
    expect(mergeCollectorDiagnostics([input(true), input(false)])?.providers[0]?.hookConfiguration).toBe("configured");
    expect(mergeCollectorDiagnostics([])).toBeNull();
  });
});
