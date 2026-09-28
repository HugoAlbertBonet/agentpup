export type TrayToggleResult = "started" | "stopped";

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

export function autostartTrayPresentation(enabled: boolean): {
  readonly label: string;
  readonly checked: boolean;
} {
  return { label: "Start with Windows", checked: enabled };
}
