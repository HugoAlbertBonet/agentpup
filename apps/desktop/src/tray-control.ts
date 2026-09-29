export type TrayToggleResult = "started" | "stopped";

export function supportsSystemTray(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "darwin" || platform === "linux";
}

export function trayIconSize(platform: NodeJS.Platform): number {
  return platform === "darwin" ? 22 : 32;
}

export function supportsStartupControl(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "darwin" || platform === "linux";
}

export function toggleTrayRuntime(
  running: boolean,
  start: () => void,
  stop: () => void
): TrayToggleResult {
  if (running) {
    stop();
    return "stopped";
  }
  start();
  return "started";
}

export function trayPresentation(running: boolean): {
  readonly toggleLabel: string;
  readonly tooltip: string;
} {
  return running
    ? { toggleLabel: "Stop AgentPup", tooltip: "AgentPup — running" }
    : { toggleLabel: "Start AgentPup", tooltip: "AgentPup — stopped" };
}

export function autostartTrayPresentation(platform: NodeJS.Platform, enabled: boolean): {
  readonly label: string;
  readonly checked: boolean;
} {
  return {
    label: platform === "win32" ? "Start with Windows" : "Start at login",
    checked: enabled
  };
}
