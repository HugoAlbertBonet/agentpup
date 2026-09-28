export interface TrayOverlay {
  hide(): void;
  isDestroyed(): boolean;
  isVisible(): boolean;
  showInactive(): void;
}

export type TrayToggleResult = "shown" | "hidden" | "unavailable";

export function toggleTrayOverlay(overlay: TrayOverlay | null): TrayToggleResult {
  if (overlay === null || overlay.isDestroyed()) return "unavailable";
  if (overlay.isVisible()) {
    overlay.hide();
    return "hidden";
  }
  overlay.showInactive();
  return "shown";
}

export function trayPresentation(visible: boolean): {
  readonly toggleLabel: string;
  readonly tooltip: string;
} {
  return visible
    ? { toggleLabel: "Hide pet", tooltip: "AgentPup — pet visible" }
    : { toggleLabel: "Show pet", tooltip: "AgentPup — pet hidden" };
}
