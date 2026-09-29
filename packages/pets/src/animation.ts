export type PetVisualState = "idle" | "working" | "needs-you" | "ready" | "unknown";

export interface PetAnimation {
  readonly row: number;
  readonly frames: number;
  readonly durationMs: number;
  readonly iterations: number | "infinite";
}

const idleAnimation: PetAnimation = {
  row: 0,
  frames: 6,
  durationMs: 5_500,
  iterations: "infinite"
};

const animations: Record<PetVisualState, PetAnimation> = {
  idle: idleAnimation,
  working: { row: 7, frames: 6, durationMs: 1_200, iterations: "infinite" },
  "needs-you": { row: 3, frames: 4, durationMs: 1_000, iterations: 2 },
  ready: idleAnimation,
  unknown: idleAnimation
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
