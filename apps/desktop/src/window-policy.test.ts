import { describe, expect, it } from "vitest";

import {
  detectOverlayRuntime,
  getDefaultCorner,
  getCornerPosition,
  getNextCorner,
  getOverlayPosition,
  getOverlayWindowPolicy,
  selectDisplayForWindow
} from "./window-policy.js";

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe("overlay window policy", () => {
  it("detects WSLg before the underlying Linux display backend", () => {
    expect(
      detectOverlayRuntime("linux", {
        WSL_DISTRO_NAME: "Ubuntu",
        WAYLAND_DISPLAY: "wayland-0"
      })
    ).toBe("wslg");
  });

  it("distinguishes native Linux X11, Wayland, and unknown sessions", () => {
    expect(detectOverlayRuntime("linux", { XDG_SESSION_TYPE: "x11" })).toBe("linux-x11");
    expect(detectOverlayRuntime("linux", { WAYLAND_DISPLAY: "wayland-0" })).toBe(
      "linux-wayland"
    );
    expect(detectOverlayRuntime("linux", {})).toBe("linux-unknown");
    expect(detectOverlayRuntime("darwin", { XDG_SESSION_TYPE: "wayland" })).toBe("native");
    expect(
      detectOverlayRuntime(
        "linux",
        { XDG_SESSION_TYPE: "wayland" },
        ["agentpup", "--ozone-platform=x11"]
      )
    ).toBe("linux-x11");
  });

  it("resets every normal desktop runtime to the bottom-right corner", () => {
    expect(getDefaultCorner("native")).toBe("bottom-right");
    expect(getDefaultCorner("linux-x11")).toBe("bottom-right");
    expect(getDefaultCorner("linux-wayland")).toBe("bottom-right");
    expect(getDefaultCorner("linux-unknown")).toBe("bottom-right");
    expect(getDefaultCorner("wslg")).toBe("top-right");
  });

  it("keeps the native overlay out of the taskbar and away from focus", () => {
    expect(getOverlayWindowPolicy("native")).toEqual({
      alwaysOnTopSupported: true,
      clickThrough: true,
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
      alwaysOnTopSupported: false,
      clickThrough: false,
      focusable: true,
      skipTaskbar: true,
      windowType: "notification"
    });
    expect(getOverlayPosition(workArea, { width: 460, height: 380 }, "wslg", 16)).toEqual({
      x: 1444,
      y: 16
    });
  });

  it("uses an X11 notification window for the current Linux positioning path", () => {
    expect(getOverlayWindowPolicy("linux-x11")).toEqual({
      alwaysOnTopSupported: true,
      clickThrough: false,
      focusable: false,
      skipTaskbar: true,
      windowType: "notification"
    });
  });

  it("does not promise unsupported topmost or selective click-through behavior on Wayland", () => {
    expect(getOverlayWindowPolicy("linux-wayland")).toEqual({
      alwaysOnTopSupported: false,
      clickThrough: false,
      focusable: false,
      skipTaskbar: true,
      windowType: "notification"
    });
    expect(getOverlayWindowPolicy("linux-unknown")).toEqual(
      getOverlayWindowPolicy("linux-wayland")
    );
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
