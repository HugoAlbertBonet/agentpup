import type { PetAnimation } from "./animation.js";

export interface AnimationCursor {
  readonly frame: number;
  readonly iteration: number;
}

export function animationFrameDelay(animation: PetAnimation): number {
  return animation.durationMs / animation.frames;
}

export function advanceAnimationCursor(
  cursor: AnimationCursor,
  animation: PetAnimation
): AnimationCursor | null {
  if (cursor.frame + 1 < animation.frames) {
    return { frame: cursor.frame + 1, iteration: cursor.iteration };
  }
  const nextIteration = cursor.iteration + 1;
  if (animation.iterations !== "infinite" && nextIteration >= animation.iterations) return null;
  return { frame: 0, iteration: nextIteration };
}
