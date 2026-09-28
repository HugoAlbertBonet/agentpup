import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLineDecoder,
  startCollectorSupervisor,
  type CollectorConnectionCallbacks
} from "./collector-bridge.js";

describe("collector bridge framing", () => {
  it("reassembles split NDJSON messages and skips blank lines", () => {
    const lines: string[] = [];
    const decoder = createLineDecoder((line) => lines.push(line));

    decoder.push('{"type":"snap');
    decoder.push('shot"}\n\n{"type":"next"}\n');

    expect(lines).toEqual(['{"type":"snapshot"}', '{"type":"next"}']);
  });

  it("drops an oversized unterminated frame", () => {
    const lines: string[] = [];
    const decoder = createLineDecoder((line) => lines.push(line), 16);
    decoder.push("x".repeat(17));
    decoder.push('\n{"ok":true}\n');

    expect(lines).toEqual(['{"ok":true}']);
  });
});

describe("collector reconnect supervision", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reconnects with capped exponential backoff", () => {
    const harness = createSupervisorHarness();

    expect(harness.attempts).toHaveLength(1);
    harness.attempts[0]!.callbacks.onDisconnect("first failure");
    expect(harness.disconnects).toEqual([{ reason: "first failure", retryDelayMs: 1_000 }]);
    vi.advanceTimersByTime(999);
    expect(harness.attempts).toHaveLength(1);
    vi.advanceTimersByTime(1);

    harness.attempts[1]!.callbacks.onDisconnect("second failure");
    expect(harness.disconnects[1]).toEqual({ reason: "second failure", retryDelayMs: 2_000 });
    vi.advanceTimersByTime(2_000);
    harness.attempts[2]!.callbacks.onDisconnect("third failure");
    expect(harness.disconnects[2]).toEqual({ reason: "third failure", retryDelayMs: 4_000 });
    vi.advanceTimersByTime(4_000);
    harness.attempts[3]!.callbacks.onDisconnect("fourth failure");
    expect(harness.disconnects[3]).toEqual({ reason: "fourth failure", retryDelayMs: 4_000 });
  });

  it("resets backoff only after a valid collector message", () => {
    const harness = createSupervisorHarness();
    harness.attempts[0]!.callbacks.onDisconnect("first failure");
    vi.advanceTimersByTime(1_000);

    harness.validMessage = false;
    harness.attempts[1]!.callbacks.onLine("invalid");
    harness.attempts[1]!.callbacks.onDisconnect("still failing");
    expect(harness.disconnects[1]!.retryDelayMs).toBe(2_000);
    vi.advanceTimersByTime(2_000);

    harness.validMessage = true;
    harness.attempts[2]!.callbacks.onLine("snapshot");
    harness.attempts[2]!.callbacks.onDisconnect("failed after recovery");
    expect(harness.disconnects[2]!.retryDelayMs).toBe(1_000);
  });

  it("ignores duplicate disconnect notifications from one attempt", () => {
    const harness = createSupervisorHarness();
    harness.attempts[0]!.callbacks.onDisconnect("spawn error");
    harness.attempts[0]!.callbacks.onDisconnect("close after error");

    expect(harness.disconnects).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(harness.attempts).toHaveLength(2);
  });

  it("retries when starting the collector throws", () => {
    const disconnects: Array<{ reason: string; retryDelayMs: number }> = [];
    let connectCalls = 0;
    const supervisor = startCollectorSupervisor({
      connect() {
        connectCalls += 1;
        if (connectCalls === 1) throw new Error("collector executable unavailable");
        return { stop() {} };
      },
      onLine: () => true,
      onDisconnect(reason, retryDelayMs) {
        disconnects.push({ reason, retryDelayMs });
      }
    });

    expect(disconnects).toEqual([
      { reason: "collector executable unavailable", retryDelayMs: 1_000 }
    ]);
    vi.advanceTimersByTime(1_000);
    expect(connectCalls).toBe(2);
    supervisor.stop();
  });

  it("cancels pending and active connections when stopped", () => {
    const pending = createSupervisorHarness();
    pending.attempts[0]!.callbacks.onDisconnect("failure");
    pending.supervisor.stop();
    vi.advanceTimersByTime(10_000);
    expect(pending.attempts).toHaveLength(1);

    const active = createSupervisorHarness();
    active.supervisor.stop();
    expect(active.attempts[0]!.stopped).toBe(true);
    active.attempts[0]!.callbacks.onDisconnect("closed during shutdown");
    vi.advanceTimersByTime(10_000);
    expect(active.disconnects).toEqual([]);
    expect(active.attempts).toHaveLength(1);
  });
});

function createSupervisorHarness() {
  const attempts: Array<{
    callbacks: CollectorConnectionCallbacks;
    stopped: boolean;
  }> = [];
  const disconnects: Array<{ reason: string; retryDelayMs: number }> = [];
  let validMessage = true;
  const supervisor = startCollectorSupervisor({
    connect(callbacks) {
      const attempt = { callbacks, stopped: false };
      attempts.push(attempt);
      return {
        stop() {
          attempt.stopped = true;
        }
      };
    },
    onLine() {
      return validMessage;
    },
    onDisconnect(reason, retryDelayMs) {
      disconnects.push({ reason, retryDelayMs });
    },
    initialRetryDelayMs: 1_000,
    maximumRetryDelayMs: 4_000
  });
  return {
    attempts,
    disconnects,
    supervisor,
    get validMessage() {
      return validMessage;
    },
    set validMessage(value: boolean) {
      validMessage = value;
    }
  };
}
