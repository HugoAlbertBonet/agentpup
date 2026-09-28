import { describe, expect, it } from "vitest";

import {
  getCornerPosition,
  getNextCorner,
  getOverlayPosition,
  getOverlayWindowPolicy,
  selectDisplayForWindow
} from "./window-policy.js";

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe("overlay window policy", () => {
  it("keeps the native overlay out of the taskbar and away from focus", () => {
    expect(getOverlayWindowPolicy("native")).toEqual({
      focusable: false,
      skipTaskbar: true,
      windowType: undefined
    });
    expect(getOverlayPosition(workArea, { width: 460, height: 380 }, "native", 16)).toEqual({
      x: 1444,
      y: 684
    });
  });

  it("surfaces the WSLg preview as a regular top-right window", () => {
    expect(getOverlayWindowPolicy("wslg")).toEqual({
      focusable: true,
      skipTaskbar: true,
      windowType: "notification"
    });
    expect(getOverlayPosition(workArea, { width: 460, height: 380 }, "wslg", 16)).toEqual({
      x: 1444,
      y: 16
    });
  });

  it("cycles clockwise through safe display corners", () => {
    expect(getNextCorner("bottom-right")).toBe("bottom-left");
    expect(getNextCorner("bottom-left")).toBe("top-left");
    expect(getNextCorner("top-left")).toBe("top-right");
    expect(getNextCorner("top-right")).toBe("bottom-right");

    expect(
      getCornerPosition(
        { x: -1920, y: -80, width: 1920, height: 1080 },
        { width: 460, height: 380 },
        "bottom-left",
        16
      )
    ).toEqual({ x: -1904, y: 604 });
  });

  it("uses work-area coordinates for negative displays and non-default taskbars", () => {
    expect(
      getCornerPosition(
        { x: -1536, y: 48, width: 1536, height: 816 },
        { width: 500, height: 680 },
        "bottom-right",
        16
      )
    ).toEqual({ x: -516, y: 168 });
  });

  it("maximizes visibility when the overlay is larger than the work area", () => {
    expect(
      getCornerPosition(
        { x: 0, y: 20, width: 800, height: 640 },
        { width: 500, height: 680 },
        "bottom-right",
        16
      )
    ).toEqual({ x: 284, y: 20 });
  });

  it("keeps a window on its preferred display across work-area and DPI changes", () => {
    const displays = [
      { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
      { id: 2, workArea: { x: -1536, y: 48, width: 1536, height: 816 } }
    ];

    expect(
      selectDisplayForWindow(
        displays,
        { x: -1200, y: 180, width: 500, height: 680 },
        2
      )?.id
    ).toBe(2);
  });

  it("chooses the nearest remaining display after the active display is removed", () => {
    const displays = [
      { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
      { id: 3, workArea: { x: 1920, y: -200, width: 2560, height: 1400 } }
    ];

    expect(
      selectDisplayForWindow(
        displays,
        { x: -1500, y: 100, width: 500, height: 680 },
        2
      )?.id
    ).toBe(1);
  });
});
