import { describe, expect, it } from "vitest";

import { validateMacOverlayReport } from "./verify-macos-overlay.mjs";

const validReport = {
  schemaVersion: 1,
  platform: "darwin",
  runtime: "native",
  corner: "bottom-right",
  trayCreated: true,
  startupControlSupported: true,
  window: {
    bounds: { x: 964, y: 204, width: 460, height: 680 },
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
    visible: true,
    focused: false,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false
  }
};

describe("packaged macOS overlay acceptance", () => {
  it("accepts the actual bottom-right, nonactivating overlay policy", () => {
    expect(() => validateMacOverlayReport(validReport)).not.toThrow();
  });

  it.each([
    ["focused", { window: { ...validReport.window, focused: true } }],
    ["focusable", { window: { ...validReport.window, focusable: true } }],
    ["not topmost", { window: { ...validReport.window, alwaysOnTop: false } }],
    ["shadowed", { window: { ...validReport.window, hasShadow: true } }],
    ["misplaced", { window: { ...validReport.window, bounds: { x: 0, y: 0, width: 460, height: 680 } } }]
  ])("rejects a %s packaged window", (_name, patch) => {
    expect(() =>
      validateMacOverlayReport({
        ...validReport,
        ...patch
      })
    ).toThrow("Invalid packaged macOS overlay");
  });
});
