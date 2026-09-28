import { describe, expect, it, vi } from "vitest";

import {
  autostartTrayPresentation,
  toggleTrayRuntime,
  trayPresentation
} from "./tray-control.js";

describe("Windows tray control", () => {
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

  it("shows whether AgentPup will start with Windows", () => {
    expect(autostartTrayPresentation(true)).toEqual({
      label: "Start with Windows",
      checked: true
    });
    expect(autostartTrayPresentation(false)).toEqual({
      label: "Start with Windows",
      checked: false
    });
  });
});
