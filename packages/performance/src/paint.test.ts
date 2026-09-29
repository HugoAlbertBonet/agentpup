import { describe, expect, it } from "vitest";

import {
  PaintLatencyTracker,
  createPaintBenchmarkStates,
  paintBenchmarkReportPath
} from "./paint.js";
import { aggregateStatus } from "../../status/src/index.js";

describe("paint latency benchmark", () => {
  it("records only acknowledgements for pending sample ids", () => {
    const tracker = new PaintLatencyTracker();
    tracker.sent("paint-1", 100);

    expect(tracker.acknowledged("unknown", 120)).toBeNull();
    expect(tracker.acknowledged("paint-1", 125)).toBe(25);
    expect(tracker.acknowledged("paint-1", 130)).toBeNull();
  });

  it("creates synthetic states that exercise every visible badge", () => {
    const summaries = createPaintBenchmarkStates().map(aggregateStatus);

    expect(summaries.some((summary) => summary.working > 0)).toBe(true);
    expect(summaries.some((summary) => summary.needsYou > 0)).toBe(true);
    expect(summaries.some((summary) => summary.resultsReady > 0)).toBe(true);
  });

  it("accepts one absolute report path and rejects unsafe values", () => {
    expect(paintBenchmarkReportPath(["--paint-benchmark-report=/tmp/paint.json"])).toBe(
      "/tmp/paint.json"
    );
    expect(() => paintBenchmarkReportPath(["--paint-benchmark-report=relative.json"])).toThrow();
    expect(() => paintBenchmarkReportPath([
      "--paint-benchmark-report=/tmp/a.json",
      "--paint-benchmark-report=/tmp/b.json"
    ])).toThrow();
  });
});
