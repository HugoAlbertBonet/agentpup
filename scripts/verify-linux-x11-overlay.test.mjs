import { describe, expect, it } from "vitest";

import {
  interactiveTestPoint,
  parseWindowGeometries,
  transparentTestPoint
} from "./verify-linux-x11-overlay.mjs";

describe("Linux X11 overlay acceptance harness", () => {
  it("parses xdotool geometry and selects the AgentPup-sized window", () => {
    expect(
      parseWindowGeometries(`WINDOW=41\nX=0\nY=0\nWIDTH=1280\nHEIGHT=1024\nSCREEN=0\nWINDOW=52\nX=804\nY=328\nWIDTH=460\nHEIGHT=680\nSCREEN=0\n`)
    ).toEqual([
      { windowId: "41", x: 0, y: 0, width: 1280, height: 1024 },
      { windowId: "52", x: 804, y: 328, width: 460, height: 680 }
    ]);
  });

  it("clicks an empty corner and the center of the rotate control", () => {
    const overlay = { windowId: "52", x: 804, y: 328, width: 460, height: 680 };
    expect(transparentTestPoint(overlay)).toEqual({ x: 814, y: 338 });
    expect(interactiveTestPoint(overlay)).toEqual({ x: 1241, y: 991 });
  });
});
