import { describe, expect, it } from "vitest";

import { advanceAnimationCursor, animationFrameDelay } from "./frame-player.js";

describe("discrete sprite frame playback", () => {
  it("uses one timer interval per visible frame", () => {
    expect(animationFrameDelay({ row: 0, frames: 6, durationMs: 1_200, iterations: 1 })).toBe(200);
  });

  it("stops after the requested finite iterations", () => {
    const animation = { row: 0, frames: 3, durationMs: 600, iterations: 2 } as const;
    let cursor = { frame: 0, iteration: 0 };
    const frames = [cursor.frame];
    while (true) {
      const next = advanceAnimationCursor(cursor, animation);
      if (next === null) break;
      cursor = next;
      frames.push(cursor.frame);
    }

    expect(frames).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("wraps infinite animations without completing", () => {
    const animation = { row: 0, frames: 2, durationMs: 400, iterations: "infinite" } as const;

    expect(advanceAnimationCursor({ frame: 1, iteration: 12 }, animation)).toEqual({
      frame: 0,
      iteration: 13
    });
  });
});
