import { describe, expect, it } from "vitest";

import { normalizeWindowShape } from "./window-shape.js";

const bounds = { width: 460, height: 680 };

describe("overlay window shape", () => {
  it("accepts a bounded set of integer rectangles", () => {
    expect(
      normalizeWindowShape(
        [
          { x: 6, y: 500, width: 48, height: 150 },
          { x: 80, y: 460, width: 130, height: 200 }
        ],
        bounds
      )
    ).toEqual([
      { x: 6, y: 500, width: 48, height: 150 },
      { x: 80, y: 460, width: 130, height: 200 }
    ]);
  });

  it.each([
    null,
    {},
    [{ x: 0, y: 0, width: 0, height: 1 }],
    [{ x: -1, y: 0, width: 1, height: 1 }],
    [{ x: 0.5, y: 0, width: 1, height: 1 }],
    [{ x: 459, y: 0, width: 2, height: 1 }],
    [{ x: 0, y: 679, width: 1, height: 2 }],
    Array.from({ length: 9 }, () => ({ x: 0, y: 0, width: 1, height: 1 }))
  ])("rejects malformed or out-of-window geometry", (value) => {
    expect(() => normalizeWindowShape(value, bounds)).toThrow("Invalid overlay window shape");
  });
});
