import { describe, expect, it } from "vitest";

import {
  createPerformanceReport,
  summarizeSamples,
  type ProcessSample
} from "./index.js";

describe("performance reporting", () => {
  it("summarizes sorted percentiles without retaining raw samples", () => {
    expect(summarizeSamples([10, 2, 8, 4, 6])).toEqual({
      count: 5,
      minimum: 2,
      median: 6,
      p95: 10,
      maximum: 10,
      mean: 6
    });
  });

  it("rejects empty and non-finite sample sets", () => {
    expect(() => summarizeSamples([])).toThrow(/sample/i);
    expect(() => summarizeSamples([1, Number.NaN])).toThrow(/finite/i);
  });

  it("builds an aggregate-only report with explicit unavailable metrics", () => {
    const processSample: ProcessSample = {
      processCount: 4,
      durationMs: 10_000,
      cpuOneCorePercent: 0.75,
      cpuMachinePercent: 0.05,
      rssBytes: 210_000_000,
      privateBytes: 180_000_000,
      gpuPercent: null,
      battery: null
    };
    const report = createPerformanceReport({
      generatedAt: "2026-09-29T00:00:00.000Z",
      platform: "win32-via-wsl",
      label: "animations-on",
      reducerMs: [0.01, 0.02],
      hookStartupMs: [18, 20],
      collectorFirstSnapshotMs: [320, 360],
      processSample
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.metrics.reducerMs.count).toBe(2);
    expect(report.metrics.process).toEqual(processSample);
    expect(JSON.stringify(report)).not.toMatch(/session|project|prompt|path/i);
  });
});
