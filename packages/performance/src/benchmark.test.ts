import { describe, expect, it } from "vitest";

import { createReducerEvents, parseBenchmarkOptions } from "./benchmark.js";

describe("parseBenchmarkOptions", () => {
  it("uses bounded defaults", () => {
    expect(parseBenchmarkOptions([])).toEqual({
      durationMs: 10_000,
      iterations: 50,
      label: "current",
      output: null
    });
  });

  it("accepts explicit benchmark settings", () => {
    expect(
      parseBenchmarkOptions([
        "--duration=2500",
        "--iterations=12",
        "--label=animations-off",
        "--output=/tmp/result.json"
      ])
    ).toEqual({
      durationMs: 2_500,
      iterations: 12,
      label: "animations-off",
      output: "/tmp/result.json"
    });
  });

  it("rejects unsafe or invalid values", () => {
    expect(() => parseBenchmarkOptions(["--duration=99"])).toThrow();
    expect(() => parseBenchmarkOptions(["--iterations=0"])).toThrow();
    expect(() => parseBenchmarkOptions(["--label=contains spaces"])).toThrow();
  });
});

describe("createReducerEvents", () => {
  it("creates a complete synthetic lifecycle without private context", () => {
    const events = createReducerEvents();

    expect(events.map((event) => event.type)).toEqual([
      "collector.connected",
      "agent.started",
      "request.opened",
      "request.resolved",
      "result.ready"
    ]);
    expect(JSON.stringify(events)).not.toMatch(/hugo|claudepet|agentpup|\.codex|\.claude/i);
  });
});
