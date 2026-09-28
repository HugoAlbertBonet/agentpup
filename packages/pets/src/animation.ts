export type PetVisualState = "idle" | "working" | "needs-you" | "ready" | "unknown";

export interface PetAnimation {
  readonly row: number;
  readonly frames: number;
  readonly durationMs: number;
  readonly iterations: number | "infinite";
}

const animations: Record<PetVisualState, PetAnimation> = {
  idle: { row: 0, frames: 6, durationMs: 5_500, iterations: "infinite" },
  working: { row: 7, frames: 6, durationMs: 820, iterations: "infinite" },
  "needs-you": { row: 3, frames: 4, durationMs: 700, iterations: 2 },
  ready: { row: 4, frames: 5, durationMs: 840, iterations: 2 },
  unknown: { row: 0, frames: 6, durationMs: 5_500, iterations: "infinite" }
};

export function resolvePetAnimation(state: PetVisualState): PetAnimation {
  return animations[state];
}

export function resolvePetVisualState(summary: {
  readonly working: number;
  readonly needsYou: number;
  readonly resultsReady: number;
  readonly unknown: number;
}): PetVisualState {
  if (summary.needsYou > 0) return "needs-you";
  if (summary.working > 0) return "working";
  if (summary.resultsReady > 0) return "ready";
  if (summary.unknown > 0) return "unknown";
  return "idle";
}
