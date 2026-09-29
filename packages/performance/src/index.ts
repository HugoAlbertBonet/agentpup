export interface SampleSummary {
  count: number;
  minimum: number;
  median: number;
  p95: number;
  maximum: number;
  mean: number;
}

export interface ProcessSample {
  processCount: number;
  durationMs: number;
  cpuOneCorePercent: number;
  cpuMachinePercent: number;
  rssBytes: number;
  privateBytes: number;
  gpuPercent: number | null;
  battery: string | null;
}

export interface PerformanceReportInput {
  generatedAt: string;
  platform: string;
  label: string;
  reducerMs: number[];
  hookStartupMs: number[];
  collectorFirstSnapshotMs: number[];
  processSample: ProcessSample;
}

export interface PerformanceReport {
  schemaVersion: 1;
  generatedAt: string;
  platform: string;
  label: string;
  metrics: {
    reducerMs: SampleSummary;
    hookStartupMs: SampleSummary;
    collectorFirstSnapshotMs: SampleSummary;
    process: ProcessSample;
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

export function summarizeSamples(samples: number[]): SampleSummary {
  if (
    samples.length === 0 ||
    samples.some((sample) => !Number.isFinite(sample) || sample < 0)
  ) {
    throw new Error("Performance samples must be non-empty, finite, and non-negative");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);

  return {
    count: sorted.length,
    minimum: round(sorted[0]!),
    median: round(median),
    p95: round(sorted[p95Index]!),
    maximum: round(sorted.at(-1)!),
    mean: round(total / sorted.length)
  };
}

export function createPerformanceReport(input: PerformanceReportInput): PerformanceReport {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    platform: input.platform,
    label: input.label,
    metrics: {
      reducerMs: summarizeSamples(input.reducerMs),
      hookStartupMs: summarizeSamples(input.hookStartupMs),
      collectorFirstSnapshotMs: summarizeSamples(input.collectorFirstSnapshotMs),
      process: { ...input.processSample }
    }
  };
}
