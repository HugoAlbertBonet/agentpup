import { describe, expect, it, vi } from "vitest";

import {
  autostartTrayPresentation,
  supportsSystemTray,
  supportsStartupControl,
  toggleTrayRuntime,
  trayIconSize,
  trayPresentation
} from "./tray-control.js";

describe("system tray control", () => {
  it("stops a running pet runtime and offers to start it again", () => {
    const start = vi.fn();
    const stop = vi.fn();

    expect(toggleTrayRuntime(true, start, stop)).toBe("stopped");
    expect(stop).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(trayPresentation(false)).toEqual({
      toggleLabel: "Start AgentPup",
      tooltip: "AgentPup — stopped"
    });
  });

  it("starts a stopped pet runtime", () => {
    const start = vi.fn();
    const stop = vi.fn();

    expect(toggleTrayRuntime(false, start, stop)).toBe("started");
    expect(start).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    expect(trayPresentation(true)).toEqual({
      toggleLabel: "Stop AgentPup",
      tooltip: "AgentPup — running"
    });
  });

  it("shows platform-appropriate startup labels", () => {
    expect(autostartTrayPresentation("win32", true)).toEqual({
      label: "Start with Windows",
      checked: true
    });
    expect(autostartTrayPresentation("darwin", false)).toEqual({
      label: "Start at login",
      checked: false
    });
  });

  it.each([
    ["win32", true],
    ["darwin", true],
    ["linux", true],
    ["aix", false]
  ] as const)("reports tray support on %s", (platform, expected) => {
    expect(supportsSystemTray(platform)).toBe(expected);
  });

  it("uses the native menu-bar icon size on macOS", () => {
    expect(trayIconSize("darwin")).toBe(22);
    expect(trayIconSize("win32")).toBe(32);
    expect(trayIconSize("linux")).toBe(32);
  });

  it("offers startup controls on every supported desktop platform", () => {
    expect(supportsStartupControl("win32")).toBe(true);
    expect(supportsStartupControl("darwin")).toBe(true);
    expect(supportsStartupControl("linux")).toBe(true);
    expect(supportsStartupControl("aix")).toBe(false);
  });
});
