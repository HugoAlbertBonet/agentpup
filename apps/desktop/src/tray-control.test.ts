import { describe, expect, it, vi } from "vitest";

import {
  autostartTrayPresentation,
  toggleTrayOverlay,
  trayPresentation
} from "./tray-control.js";

function overlay(visible: boolean) {
  return {
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    showInactive: vi.fn()
  };
}

describe("Windows tray control", () => {
  it("hides a visible pet and offers to show it again", () => {
    const window = overlay(true);

    expect(toggleTrayOverlay(window)).toBe("hidden");
    expect(window.hide).toHaveBeenCalledOnce();
    expect(window.showInactive).not.toHaveBeenCalled();
    expect(trayPresentation(false)).toEqual({
      toggleLabel: "Show pet",
      tooltip: "AgentPup — pet hidden"
    });
  });

  it("shows a hidden pet without taking keyboard focus", () => {
    const window = overlay(false);

    expect(toggleTrayOverlay(window)).toBe("shown");
    expect(window.showInactive).toHaveBeenCalledOnce();
    expect(window.hide).not.toHaveBeenCalled();
    expect(trayPresentation(true)).toEqual({
      toggleLabel: "Hide pet",
      tooltip: "AgentPup — pet visible"
    });
  });

  it("does nothing when the overlay has already been destroyed", () => {
    const window = overlay(true);
    window.isDestroyed.mockReturnValue(true);

    expect(toggleTrayOverlay(window)).toBe("unavailable");
    expect(window.hide).not.toHaveBeenCalled();
    expect(window.showInactive).not.toHaveBeenCalled();
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
