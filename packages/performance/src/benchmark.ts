import type { AgentIdentity, StatusEvent } from "../../status/src/index.js";

export interface BenchmarkOptions {
  durationMs: number;
  iterations: number;
  label: string;
  output: string | null;
}

function option(arguments_: string[], name: string): string | undefined {
  return arguments_.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function parseBenchmarkOptions(arguments_: string[]): BenchmarkOptions {
  const durationMs = Number(option(arguments_, "duration") ?? "10000");
  const iterations = Number(option(arguments_, "iterations") ?? "50");
  const label = option(arguments_, "label") ?? "current";
  const output = option(arguments_, "output") ?? null;

  if (!Number.isSafeInteger(durationMs) || durationMs < 1_000 || durationMs > 300_000) {
    throw new Error("--duration must be an integer from 1000 to 300000 milliseconds");
  }
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1_000) {
    throw new Error("--iterations must be an integer from 1 to 1000");
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(label)) {
    throw new Error("--label must contain only letters, digits, underscores, or hyphens");
  }

  return { durationMs, iterations, label, output };
}

export function createReducerEvents(): StatusEvent[] {
  const identity: AgentIdentity = {
    provider: "codex",
    collectorId: "benchmark",
    sessionId: "synthetic",
    agentId: "root",
    displayName: "Synthetic benchmark",
    project: "Synthetic"
  };
  const observedAt = "2000-01-01T00:00:00.000Z";
  return [
    {
      type: "collector.connected",
      eventId: "benchmark-1",
      collectorId: "benchmark",
      sequence: 1,
      observedAt,
      capabilities: []
    },
    {
      type: "agent.started",
      eventId: "benchmark-2",
      collectorId: "benchmark",
      sequence: 2,
      observedAt,
      identity,
      turnId: "synthetic-turn"
    },
    {
      type: "request.opened",
      eventId: "benchmark-3",
      collectorId: "benchmark",
      sequence: 3,
      observedAt,
      identity,
      turnId: "synthetic-turn",
      request: {
        requestId: "synthetic-request",
        kind: "question",
        blocking: true,
        confidence: "confirmed",
        evidence: "synthetic"
      }
    },
    {
      type: "request.resolved",
      eventId: "benchmark-4",
      collectorId: "benchmark",
      sequence: 4,
      observedAt,
      identity,
      requestId: "synthetic-request",
      resolution: "answered"
    },
    {
      type: "result.ready",
      eventId: "benchmark-5",
      collectorId: "benchmark",
      sequence: 5,
      observedAt,
      identity,
      turnId: "synthetic-turn"
    }
  ];
}
