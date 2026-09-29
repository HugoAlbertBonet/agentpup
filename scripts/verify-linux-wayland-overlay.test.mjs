import { describe, expect, it } from "vitest";

import { validateWaylandOverlayReport } from "./verify-linux-wayland-overlay.mjs";

const validReport = {
  schemaVersion: 1,
  platform: "linux",
  runtime: "linux-wayland",
  corner: "bottom-right",
  trayCreated: false,
  startupControlSupported: true,
  policy: {
    alwaysOnTopSupported: false,
    clickThrough: false,
    shapedClickThrough: false,
    focusable: false,
    skipTaskbar: true,
    windowType: "notification"
  },
  window: {
    bounds: { x: 0, y: 0, width: 460, height: 680 },
    workArea: { x: 0, y: 0, width: 1280, height: 1024 },
    visible: true,
    focused: false,
    focusable: false,
    alwaysOnTop: false,
    hasShadow: false
  }
};

describe("packaged native Wayland acceptance", () => {
  it("accepts the explicit limited overlay policy", () => {
    expect(() => validateWaylandOverlayReport(validReport)).not.toThrow();
  });

  it.each([
    ["wrong runtime", { runtime: "linux-x11" }],
    ["topmost claim", { policy: { ...validReport.policy, alwaysOnTopSupported: true } }],
    ["shape claim", { policy: { ...validReport.policy, shapedClickThrough: true } }],
    ["focused window", { window: { ...validReport.window, focused: true } }],
    ["actual topmost window", { window: { ...validReport.window, alwaysOnTop: true } }],
    ["hidden window", { window: { ...validReport.window, visible: false } }]
  ])("rejects a %s report", (_name, patch) => {
    expect(() => validateWaylandOverlayReport({ ...validReport, ...patch })).toThrow(
      "Invalid packaged Wayland overlay"
    );
  });
});
