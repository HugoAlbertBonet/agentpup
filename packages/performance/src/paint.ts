import path from "node:path";

import { replayEvents, type StatusState } from "../../status/src/index.js";
import { createReducerEvents } from "./benchmark.js";

const reportPrefix = "--paint-benchmark-report=";

export class PaintLatencyTracker {
  readonly #pending = new Map<string, number>();

  sent(id: string, now: number): void {
    if (!/^paint-[0-9]+$/.test(id) || !Number.isFinite(now)) {
      throw new Error("Invalid paint benchmark sample");
    }
    this.#pending.set(id, now);
  }

  acknowledged(id: string, now: number): number | null {
    const sentAt = this.#pending.get(id);
    if (sentAt === undefined || !Number.isFinite(now) || now < sentAt) return null;
    this.#pending.delete(id);
    return now - sentAt;
  }
}

export function createPaintBenchmarkStates(): StatusState[] {
  const events = createReducerEvents();
  return [
    replayEvents(events.slice(0, 2)),
    replayEvents(events.slice(0, 3)),
    replayEvents(events),
    replayEvents([])
  ];
}

export function paintBenchmarkReportPath(arguments_: readonly string[]): string | undefined {
  const matches = arguments_.filter((argument) => argument.startsWith(reportPrefix));
  if (matches.length === 0) return undefined;
  const value = matches[0]!.slice(reportPrefix.length);
  if (
    matches.length !== 1 ||
    value.length === 0 ||
    value.length > 4_096 ||
    /[\0\r\n]/.test(value) ||
    !path.isAbsolute(value)
  ) {
    throw new Error("Invalid paint benchmark report path");
  }
  return path.normalize(value);
}
