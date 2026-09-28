import { describe, expect, it } from "vitest";

import {
  advanceMotion,
  chooseEdgeTarget,
  clampToWorkArea,
  isRoamingEnabled
} from "./motion.js";

describe("overlay roaming motion", () => {
  it("keeps autonomous roaming disabled unless explicitly requested", () => {
    expect(isRoamingEnabled(["electron", "app"])).toBe(false);
    expect(isRoamingEnabled(["electron", "app", "--demo"])).toBe(false);
    expect(isRoamingEnabled(["electron", "app", "--roam"])).toBe(true);
  });

  it("moves toward a destination without overshooting", () => {
    expect(advanceMotion({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)).toEqual({ x: 6, y: 8 });
    expect(advanceMotion({ x: 25, y: 35 }, { x: 30, y: 40 }, 20)).toEqual({ x: 30, y: 40 });
  });

  it("chooses an on-screen edge perch", () => {
    expect(
      chooseEdgeTarget(
        { x: 0, y: 0, width: 1920, height: 1080 },
        { width: 460, height: 380 },
        16,
        0.1,
        0.5
      )
    ).toEqual({ x: 730, y: 16 });
    expect(
      chooseEdgeTarget(
        { x: -1920, y: 0, width: 1920, height: 1080 },
        { width: 460, height: 380 },
        16,
        0.8,
        0.25
      )
    ).toEqual({ x: -1904, y: 108 });
  });

  it("clamps every autonomous position inside the work area", () => {
    expect(
      clampToWorkArea(
        { x: 3000, y: 2000 },
        { x: 0, y: 0, width: 1920, height: 1040 },
        { width: 460, height: 380 },
        16
      )
    ).toEqual({ x: 1444, y: 644 });
  });
});
