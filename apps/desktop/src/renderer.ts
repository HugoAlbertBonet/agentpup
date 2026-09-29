import {
  aggregateStatus,
  type AgentStatus,
  type PendingRequest,
  type StatusState
} from "../../../packages/status/src/index.js";
import {
  resolvePetAnimation,
  resolvePetVisualState,
  type PetVisualState
} from "../../../packages/pets/src/animation.js";
import type { PetPreferences, PetPreferencesPatch } from "../../../packages/pets/src/preferences.js";
import type { ClaudepetApi, PetPresentation, StartupPreference } from "./preload.js";
import type { OverlayCorner, Rectangle } from "./window-policy.js";
import type { DiagnosticsSnapshot } from "./diagnostics.js";
import {
  shouldOpenIntegrationSetup,
  type IntegrationStatus
} from "./integration-control.js";
import {
  applyAgentDismissals,
  canDismissAgent,
  dismissAllDismissibleAgents,
  limitFinishedAgents,
  providerPresentation
} from "./agent-view.js";

declare global {
  interface Window {
    claudepet: ClaudepetApi;
  }
}

const byId = <ElementType extends HTMLElement>(id: string): ElementType => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as ElementType;
};

const workingCount = byId<HTMLElement>("working-count");
const needsCount = byId<HTMLElement>("needs-count");
const readyCount = byId<HTMLElement>("ready-count");
const workingMetric = byId<HTMLElement>("working-metric");
const needsMetric = byId<HTMLElement>("needs-metric");
const readyMetric = byId<HTMLElement>("ready-metric");
const panel = byId<HTMLElement>("agent-panel");
const panelClose = byId<HTMLButtonElement>("panel-close");
const panelTitle = byId<HTMLHeadingElement>("panel-title");
const activityView = byId<HTMLElement>("activity-view");
const settingsView = byId<HTMLElement>("settings-view");
const diagnosticsView = byId<HTMLElement>("diagnostics-view");
const settingsOpen = byId<HTMLButtonElement>("settings-open");
const settingsBack = byId<HTMLButtonElement>("settings-back");
const diagnosticsOpen = byId<HTMLButtonElement>("diagnostics-open");
const diagnosticsBack = byId<HTMLButtonElement>("diagnostics-back");
const diagnosticsCollector = byId<HTMLElement>("diagnostics-collector");
const diagnosticsLastSnapshot = byId<HTMLElement>("diagnostics-last-snapshot");
const diagnosticsCodex = byId<HTMLElement>("diagnostics-codex");
const diagnosticsClaude = byId<HTMLElement>("diagnostics-claude");
const diagnosticsLastEvent = byId<HTMLElement>("diagnostics-last-event");
const diagnosticsCopy = byId<HTMLButtonElement>("diagnostics-copy");
const diagnosticsMessage = byId<HTMLElement>("diagnostics-message");
const integrationsOpen = byId<HTMLButtonElement>("integrations-open");
const integrationsBack = byId<HTMLButtonElement>("integrations-back");
const integrationEnvironment = byId<HTMLElement>("integration-environment");
const integrationCodex = byId<HTMLElement>("integration-codex");
const integrationClaude = byId<HTMLElement>("integration-claude");
const integrationInstall = byId<HTMLButtonElement>("integration-install");
const integrationUninstall = byId<HTMLButtonElement>("integration-uninstall");
const integrationMessage = byId<HTMLElement>("integration-message");
const agentList = byId<HTMLUListElement>("agent-list");
const agentClear = byId<HTMLButtonElement>("agent-clear");
const toggle = byId<HTMLButtonElement>("pet-toggle");
const statusToggle = byId<HTMLButtonElement>("status-toggle");
const statusControls = byId<HTMLElement>("status-controls");
const cornerMove = byId<HTMLButtonElement>("corner-move");
const shell = byId<HTMLElement>("pet-shell");
const sprite = byId<HTMLElement>("pet-sprite");
const previewSprites = [
  ...document.querySelectorAll<HTMLElement>("[data-preview-state]")
];
const petContainer = byId<HTMLElement>("pet-container");
const petName = byId<HTMLElement>("pet-name");
const petMessage = byId<HTMLElement>("pet-message");
const petCycle = byId<HTMLButtonElement>("pet-cycle");
const petGallery = byId<HTMLButtonElement>("pet-gallery");
const petImport = byId<HTMLButtonElement>("pet-import");
const petEnabled = byId<HTMLInputElement>("pet-enabled");
const petSize = byId<HTMLInputElement>("pet-size");
const petSizeValue = byId<HTMLOutputElement>("pet-size-value");
const petAnimations = byId<HTMLInputElement>("pet-animations");
const startupEnabled = byId<HTMLInputElement>("startup-enabled");
const startupLabel = byId<HTMLElement>("startup-label");
const statusSize = byId<HTMLInputElement>("status-size");
const statusSizeValue = byId<HTMLOutputElement>("status-size-value");
const statusFontSize = byId<HTMLInputElement>("status-font-size");
const statusFontSizeValue = byId<HTMLOutputElement>("status-font-size-value");
const statusLineGap = byId<HTMLInputElement>("status-line-gap");
const statusLineGapValue = byId<HTMLOutputElement>("status-line-gap-value");
const maxFinishedAgents = byId<HTMLInputElement>("max-finished-agents");
const maxFinishedAgentsValue = byId<HTMLOutputElement>("max-finished-agents-value");

let visualState: PetVisualState = "idle";
let activityPanelTitle = "No monitored agents";
let panelView: "activity" | "settings" | "diagnostics" | "integrations" = "activity";
let currentStatus: StatusState | null = null;
const dismissedAgents = new Map<string, string>();
let preferences: PetPreferences = {
  petEnabled: true,
  petScale: 0.67,
  animationsEnabled: true,
  statusScale: 1,
  statusFontSize: 13,
  statusLineGap: 9,
  maxFinishedAgents: 5
};

let shapeFrame: number | null = null;

function visibleRectangle(element: HTMLElement): Rectangle | null {
  const bounds = element.getBoundingClientRect();
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const right = Math.min(window.innerWidth, Math.ceil(bounds.right));
  const bottom = Math.min(window.innerHeight, Math.ceil(bounds.bottom));
  if (element.hidden || right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function publishWindowShape(): void {
  shapeFrame = null;
  const rectangles = [panel, toggle, statusControls]
    .map(visibleRectangle)
    .filter((rectangle): rectangle is Rectangle => rectangle !== null);
  if (rectangles.length > 0) window.claudepet.setWindowShape(rectangles);
}

function scheduleWindowShape(): void {
  if (shapeFrame !== null) cancelAnimationFrame(shapeFrame);
  shapeFrame = requestAnimationFrame(publishWindowShape);
}

function renderStartupPreference(preference: StartupPreference): void {
  startupLabel.textContent = preference.label;
  startupEnabled.checked = preference.enabled;
  startupEnabled.disabled = !preference.supported;
}

function configureSpriteAnimation(
  target: HTMLElement,
  state: PetVisualState,
  preview: boolean
): void {
  const animation = resolvePetAnimation(state);
  target.style.setProperty("--sprite-row-y", `${-animation.row * 208}px`);
  target.style.setProperty("--sprite-end-x", `${-animation.frames * 192}px`);
  target.style.setProperty("--sprite-frames", String(animation.frames));
  target.style.setProperty("--sprite-duration", `${animation.durationMs}ms`);
  target.style.setProperty(
    "--sprite-iterations",
    preview ? "infinite" : String(animation.iterations)
  );
  target.style.animationName = "none";
  void target.offsetWidth;
  target.style.animationName = "";
}

function applyPreviewAnimations(): void {
  for (const previewSprite of previewSprites) {
    const state = previewSprite.dataset.previewState as PetVisualState;
    configureSpriteAnimation(previewSprite, state, true);
  }
}

function applyPetAnimation(state: PetVisualState, restart = false): void {
  if (!restart && state === visualState) return;
  visualState = state;
  configureSpriteAnimation(sprite, state, false);
}

function showPet(pet: PetPresentation): void {
  petName.textContent = pet.displayName;
  petName.title = pet.description;
  for (const petSprite of [sprite, ...previewSprites]) {
    petSprite.style.backgroundImage = `url("${pet.imageUrl}")`;
    petSprite.style.backgroundSize = `${pet.layout.frameWidth * pet.layout.columns}px ${pet.layout.frameHeight * pet.layout.rows}px`;
  }
  applyPetAnimation(visualState, true);
  applyPreviewAnimations();
}

function applyPetPreferences(next: PetPreferences, restartAnimation = false): void {
  const animationsChanged = preferences.animationsEnabled !== next.animationsEnabled;
  preferences = next;
  const width = Math.round(192 * next.petScale);
  const height = Math.round(208 * next.petScale);
  const visibleWidth = next.petEnabled ? width : 0;
  const visibleHeight = next.petEnabled ? height : 0;
  const statusDotSize = Math.round(9 * next.statusScale);
  const statusWidth = Math.max(
    Math.round(42 * next.statusScale),
    next.statusFontSize + statusDotSize + 18
  );
  const cornerSize = Math.round(34 * next.statusScale);
  const statusControlWidth = Math.max(statusWidth, cornerSize);

  shell.dataset.petEnabled = String(next.petEnabled);
  shell.dataset.animationsEnabled = String(next.animationsEnabled);
  shell.style.setProperty("--pet-width", `${visibleWidth}px`);
  shell.style.setProperty("--pet-height", `${visibleHeight}px`);
  shell.style.setProperty("--status-width", `${statusWidth}px`);
  shell.style.setProperty("--status-control-width", `${statusControlWidth}px`);
  shell.style.setProperty("--status-padding-y", `${Math.round(9 * next.statusScale)}px`);
  shell.style.setProperty("--status-padding-x", `${Math.round(8 * next.statusScale)}px`);
  shell.style.setProperty("--status-dot-size", `${statusDotSize}px`);
  shell.style.setProperty("--status-font-size", `${next.statusFontSize}px`);
  shell.style.setProperty("--status-line-gap", `${next.statusLineGap}px`);
  shell.style.setProperty("--corner-size", `${cornerSize}px`);
  shell.style.setProperty("--corner-font-size", `${Math.round(20 * next.statusScale)}px`);
  sprite.style.setProperty("--pet-scale", String(next.petScale));
  petContainer.style.width = `${width}px`;
  petContainer.style.height = `${height}px`;

  petEnabled.checked = next.petEnabled;
  petAnimations.checked = next.animationsEnabled;
  petSize.value = String(next.petScale);
  petSizeValue.value = `${Math.round(next.petScale * 100)}%`;
  petSizeValue.textContent = petSizeValue.value;
  statusSize.value = String(next.statusScale);
  statusSizeValue.value = `${Math.round(next.statusScale * 100)}%`;
  statusSizeValue.textContent = statusSizeValue.value;
  statusFontSize.value = String(next.statusFontSize);
  statusFontSizeValue.value = `${next.statusFontSize}px`;
  statusFontSizeValue.textContent = statusFontSizeValue.value;
  statusLineGap.value = String(next.statusLineGap);
  statusLineGapValue.value = `${next.statusLineGap}px`;
  statusLineGapValue.textContent = statusLineGapValue.value;
  maxFinishedAgents.value = String(next.maxFinishedAgents);
  maxFinishedAgentsValue.value = String(next.maxFinishedAgents);
  maxFinishedAgentsValue.textContent = maxFinishedAgentsValue.value;

  if (next.animationsEnabled && (animationsChanged || restartAnimation)) {
    applyPetAnimation(visualState, true);
    applyPreviewAnimations();
  }
  if (currentStatus !== null) render(currentStatus);
  scheduleWindowShape();
}

function showPanelView(view: "activity" | "settings" | "diagnostics" | "integrations"): void {
  panelView = view;
  activityView.hidden = view !== "activity";
  settingsView.hidden = view !== "settings";
  diagnosticsView.hidden = view !== "diagnostics";
  byId<HTMLElement>("integrations-view").hidden = view !== "integrations";
  settingsOpen.hidden = view !== "activity";
  panelTitle.textContent =
    view === "activity"
      ? activityPanelTitle
      : view === "settings"
        ? "Pet settings"
        : view === "diagnostics"
          ? "Diagnostics"
      : "Agent integrations";
  if (view === "settings" && preferences.animationsEnabled) applyPreviewAnimations();
  panel.setAttribute(
    "aria-label",
    view === "activity"
      ? "Agent activity"
      : view === "settings"
        ? "Pet settings"
        : view === "diagnostics"
          ? "Diagnostics"
          : "Agent integrations"
  );
  if (view === "settings") settingsView.scrollTop = 0;
  if (view === "diagnostics") diagnosticsView.scrollTop = 0;
  if (view === "diagnostics") void refreshDiagnostics();
  if (view === "integrations") void refreshIntegrationStatus();
  scheduleWindowShape();
}

function timestampLabel(value: string | null): string {
  if (value === null) return "Not received";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Invalid timestamp" : parsed.toLocaleString();
}

function providerDiagnosticsLabel(
  snapshot: DiagnosticsSnapshot,
  provider: "codex" | "claude-code"
): string {
  const diagnostics = snapshot.providers.find((value) => value.provider === provider);
  if (diagnostics === undefined) return "Not detected";
  const version = diagnostics.version ?? "version not detected";
  const hooks = diagnostics.hookConfiguration.replaceAll("-", " ");
  const observed = diagnostics.hookEventsObserved ? "events seen" : "no events seen";
  return `${version} · hooks ${hooks} · ${observed}`;
}

function renderDiagnostics(snapshot: DiagnosticsSnapshot): void {
  const fallback = snapshot.collector.transcriptFallback ? "transcript recovery active" : "no transcript recovery";
  diagnosticsCollector.textContent = `${snapshot.collector.state} · ${fallback}`;
  diagnosticsLastSnapshot.textContent = timestampLabel(snapshot.collector.lastSnapshotAt);
  diagnosticsCodex.textContent = providerDiagnosticsLabel(snapshot, "codex");
  diagnosticsClaude.textContent = providerDiagnosticsLabel(snapshot, "claude-code");
  diagnosticsLastEvent.textContent =
    snapshot.collector.lastEventType === null
      ? "No lifecycle event received"
      : `${snapshot.collector.lastEventType} · ${timestampLabel(snapshot.collector.lastEventAt)}`;
  for (const [element, provider] of [
    [diagnosticsCodex, "codex"],
    [diagnosticsClaude, "claude-code"]
  ] as const) {
    const value = snapshot.providers.find((candidate) => candidate.provider === provider);
    element.title = value?.capabilities.length
      ? `Capabilities: ${value.capabilities.join(", ")}`
      : "No capabilities reported";
  }
}

async function refreshDiagnostics(): Promise<void> {
  try {
    renderDiagnostics(await window.claudepet.getDiagnostics());
  } catch {
    diagnosticsCollector.textContent = "Diagnostics unavailable";
  }
}

function providerIntegrationLabel(
  status: IntegrationStatus,
  provider: "codex" | "claude-code"
): string {
  const value = status.providers.find((candidate) => candidate.provider === provider);
  if (value === undefined) return "Not detected";
  const version = value.version ?? "version not detected";
  const state = !value.valid ? "settings invalid" : value.installed ? "hooks installed" : "hooks not installed";
  return `${version} · ${state}`;
}

function renderIntegrationStatus(status: IntegrationStatus): void {
  integrationEnvironment.textContent = status.environment === "wsl" ? "Windows overlay · WSL agents" : "Native";
  integrationCodex.textContent = providerIntegrationLabel(status, "codex");
  integrationClaude.textContent = providerIntegrationLabel(status, "claude-code");
  integrationUninstall.disabled = !status.providers.some((provider) => provider.installed);
}

async function refreshIntegrationStatus(): Promise<IntegrationStatus | null> {
  try {
    const status = await window.claudepet.getIntegrationStatus();
    renderIntegrationStatus(status);
    return status;
  } catch {
    integrationEnvironment.textContent = "Integration runtime unavailable";
    integrationCodex.textContent = "Could not inspect Codex";
    integrationClaude.textContent = "Could not inspect Claude Code";
    return null;
  }
}

function setIntegrationBusy(busy: boolean): void {
  integrationInstall.disabled = busy;
  integrationUninstall.disabled = busy;
}

function runIntegrationAction(action: "setup" | "uninstall"): void {
  integrationMessage.textContent = "";
  setIntegrationBusy(true);
  const operation =
    action === "setup"
      ? window.claudepet.setupIntegration()
      : window.claudepet.uninstallIntegration();
  operation
    .then((result) => {
      renderIntegrationStatus(result.status);
      integrationMessage.textContent = result.message;
    })
    .catch((error: unknown) => {
      integrationMessage.textContent =
        error instanceof Error ? error.message : "Could not update integrations.";
    })
    .finally(() => {
      setIntegrationBusy(false);
    });
}

function savePetPreferences(patch: PetPreferencesPatch): void {
  petMessage.textContent = "";
  void window.claudepet
    .updatePetPreferences(patch)
    .then((next) => applyPetPreferences(next))
    .catch((error: unknown) => {
      petMessage.textContent = error instanceof Error ? error.message : "Could not save settings.";
      applyPetPreferences(preferences);
    });
}

function showCorner(corner: OverlayCorner): void {
  shell.dataset.corner = corner;
  scheduleWindowShape();
}

function unresolvedRequests(agent: AgentStatus): PendingRequest[] {
  return Object.values(agent.requests).filter((request) => !request.resolved);
}

function stateLabel(agent: AgentStatus): string {
  const requests = unresolvedRequests(agent);
  if (requests.length > 0) {
    const request = requests[0]!;
    const kind = request.kind === "approval" ? "approval" : request.kind;
    const uncertainty = request.confidence === "provisional" ? " — unconfirmed" : "";
    return agent.activity === "working"
      ? `Working · ${kind} pending${uncertainty}`
      : `Needs ${kind}${uncertainty}`;
  }
  if (!agent.sourceConnected) return "Collector disconnected";
  if (agent.activity === "unknown") return "Discovered · live status unavailable";
  if (agent.activity === "failed") return "Failed · result ready";
  if (agent.resultReady) return "Result ready";
  return agent.activity[0]!.toUpperCase() + agent.activity.slice(1);
}

function sortRank(agent: AgentStatus): number {
  if (unresolvedRequests(agent).length > 0) return 0;
  if (agent.activity === "working") return 1;
  if (agent.resultReady) return 2;
  return 3;
}

function createProviderIcon(agent: AgentStatus): HTMLSpanElement {
  const presentation = providerPresentation(agent.identity.provider);
  const container = document.createElement("span");
  container.className = "agent-provider-icon " + presentation.icon + "-icon";
  container.title = presentation.label;
  container.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.alt = "";
  image.src =
    presentation.icon === "claude"
      ? "assets/claude-logo.svg"
      : "assets/openai-logo.svg";
  image.decoding = "async";
  container.append(image);
  return container;
}

function renderAgent(key: string, agent: AgentStatus): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "agent-row";

  const icon = createProviderIcon(agent);

  const heading = document.createElement("span");
  heading.className = "agent-heading";
  const relationship = agent.identity.parentAgentId === undefined ? "" : "↳ ";
  heading.textContent = `${relationship}${agent.identity.project} / ${agent.identity.displayName}`;

  const provider = document.createElement("span");
  provider.className = "agent-provider";
  provider.textContent = providerPresentation(agent.identity.provider).label;

  const state = document.createElement("span");
  state.className = "agent-state";
  state.textContent = stateLabel(agent);

  row.append(icon, heading, provider, state);
  if (canDismissAgent(agent)) {
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "agent-dismiss";
    dismiss.textContent = "×";
    dismiss.title = "Remove from live agents";
    dismiss.setAttribute(
      "aria-label",
      "Remove " + providerPresentation(agent.identity.provider).label + " " + agent.identity.displayName
    );
    dismiss.addEventListener("click", (event) => {
      event.stopPropagation();
      dismissedAgents.set(key, agent.lastObservedAt);
      if (currentStatus !== null) render(currentStatus);
    });
    row.append(dismiss);
  }
  return row;
}

function render(nextState: StatusState): void {
  currentStatus = nextState;
  const state = limitFinishedAgents(
    applyAgentDismissals(nextState, dismissedAgents),
    preferences.maxFinishedAgents
  );
  const summary = aggregateStatus(state);
  workingCount.textContent = String(summary.working);
  needsCount.textContent = String(summary.needsYou);
  readyCount.textContent = String(summary.resultsReady);
  workingMetric.setAttribute("aria-label", `${summary.working} working`);
  needsMetric.setAttribute("aria-label", `${summary.needsYou} need you`);
  readyMetric.setAttribute("aria-label", `${summary.resultsReady} ready`);
  const statusLabel = `Show monitored agents: ${summary.working} working, ${summary.needsYou} need you, ${summary.resultsReady} ready`;
  toggle.setAttribute("aria-label", statusLabel);
  statusToggle.setAttribute("aria-label", statusLabel);

  const displayState: PetVisualState = resolvePetVisualState(summary);
  shell.dataset.state = displayState;
  applyPetAnimation(displayState);

  const visibleAgents = Object.entries(state.agents).filter(
    ([, agent]) => agent.activity !== "unknown" || unresolvedRequests(agent).length > 0
  );
  agentClear.hidden = !visibleAgents.some(([, agent]) => canDismissAgent(agent));
  activityPanelTitle =
    visibleAgents.length === 0 ? "No live agent activity" : `${visibleAgents.length} live agents`;
  if (panelView === "activity") panelTitle.textContent = activityPanelTitle;
  agentList.replaceChildren(
    ...visibleAgents
      .sort(([, left], [, right]) => sortRank(left) - sortRank(right))
      .map(([key, agent]) => renderAgent(key, agent))
  );
  if (panelView === "diagnostics") void refreshDiagnostics();
}

agentClear.addEventListener("click", () => {
  if (currentStatus === null) return;
  dismissAllDismissibleAgents(currentStatus, dismissedAgents);
  render(currentStatus);
});

let interactive = false;
function updateInteraction(next: boolean): void {
  if (next === interactive) return;
  interactive = next;
  window.claudepet.setInteractive(next);
}

document.addEventListener("pointermove", (event) => {
  const target = event.target;
  updateInteraction(target instanceof Element && target.closest(".interactive") !== null);
});
document.addEventListener("pointerleave", () => updateInteraction(false));

function setPanelOpen(open: boolean): void {
  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  statusToggle.setAttribute("aria-expanded", String(open));
  if (!open) {
    agentList.scrollTop = 0;
    showPanelView("activity");
  }
  window.claudepet.setPanelOpen(open);
  scheduleWindowShape();
}

toggle.addEventListener("click", () => {
  const willOpen = panel.hasAttribute("hidden");
  setPanelOpen(willOpen);
});
statusToggle.addEventListener("click", () => {
  const willOpen = panel.hasAttribute("hidden");
  setPanelOpen(willOpen);
});

panelClose.addEventListener("click", () => setPanelOpen(false));
settingsOpen.addEventListener("click", () => showPanelView("settings"));
settingsBack.addEventListener("click", () => showPanelView("activity"));
diagnosticsOpen.addEventListener("click", () => showPanelView("diagnostics"));
diagnosticsBack.addEventListener("click", () => showPanelView("settings"));
integrationsOpen.addEventListener("click", () => showPanelView("integrations"));
integrationsBack.addEventListener("click", () => showPanelView("settings"));
integrationInstall.addEventListener("click", () => runIntegrationAction("setup"));
integrationUninstall.addEventListener("click", () => runIntegrationAction("uninstall"));
diagnosticsCopy.addEventListener("click", () => {
  diagnosticsMessage.textContent = "";
  diagnosticsCopy.disabled = true;
  window.claudepet
    .copyDiagnostics()
    .then(() => {
      diagnosticsMessage.textContent = "Diagnostic report copied.";
    })
    .catch(() => {
      diagnosticsMessage.textContent = "Could not copy the diagnostic report.";
    })
    .finally(() => {
      diagnosticsCopy.disabled = false;
    });
});
cornerMove.addEventListener("click", () => {
  cornerMove.disabled = true;
  window.claudepet
    .moveToNextCorner()
    .then(showCorner)
    .finally(() => {
      cornerMove.disabled = false;
    });
});
petCycle.addEventListener("click", () => {
  petMessage.textContent = "";
  petCycle.disabled = true;
  window.claudepet
    .cyclePet()
    .then(showPet)
    .catch((error: unknown) => {
      petMessage.textContent = error instanceof Error ? error.message : "Could not change pet.";
    })
    .finally(() => {
      petCycle.disabled = false;
    });
});
petGallery.addEventListener("click", () => {
  petMessage.textContent = "";
  void window.claudepet.openPetGallery().catch(() => {
    petMessage.textContent = "Could not open the OpenPets gallery.";
  });
});
petImport.addEventListener("click", () => {
  petMessage.textContent = "";
  petImport.disabled = true;
  window.claudepet
    .importPet()
    .then((result) => {
      if (result.pet !== undefined) showPet(result.pet);
      if (result.error !== undefined) petMessage.textContent = result.error;
    })
    .catch((error: unknown) => {
      petMessage.textContent = error instanceof Error ? error.message : "Could not import pet.";
    })
    .finally(() => {
      petImport.disabled = false;
    });
});
petEnabled.addEventListener("change", () => {
  const next = { ...preferences, petEnabled: petEnabled.checked };
  applyPetPreferences(next);
  savePetPreferences({ petEnabled: petEnabled.checked });
});
petAnimations.addEventListener("change", () => {
  const next = { ...preferences, animationsEnabled: petAnimations.checked };
  applyPetPreferences(next);
  savePetPreferences({ animationsEnabled: petAnimations.checked });
});
startupEnabled.addEventListener("change", () => {
  const requested = startupEnabled.checked;
  startupEnabled.disabled = true;
  petMessage.textContent = "";
  window.claudepet
    .setStartupPreference(requested)
    .then(renderStartupPreference)
    .catch(() => {
      petMessage.textContent = "Could not update automatic startup.";
      return window.claudepet.getStartupPreference().then(renderStartupPreference);
    });
});
petSize.addEventListener("input", () => {
  applyPetPreferences({ ...preferences, petScale: Number(petSize.value) });
});
petSize.addEventListener("change", () => {
  savePetPreferences({ petScale: Number(petSize.value) });
});
statusSize.addEventListener("input", () => {
  applyPetPreferences({ ...preferences, statusScale: Number(statusSize.value) });
});
statusSize.addEventListener("change", () => {
  savePetPreferences({ statusScale: Number(statusSize.value) });
});
statusFontSize.addEventListener("input", () => {
  applyPetPreferences({ ...preferences, statusFontSize: Number(statusFontSize.value) });
});
statusFontSize.addEventListener("change", () => {
  savePetPreferences({ statusFontSize: Number(statusFontSize.value) });
});
statusLineGap.addEventListener("input", () => {
  applyPetPreferences({ ...preferences, statusLineGap: Number(statusLineGap.value) });
});
statusLineGap.addEventListener("change", () => {
  savePetPreferences({ statusLineGap: Number(statusLineGap.value) });
});
maxFinishedAgents.addEventListener("input", () => {
  applyPetPreferences({
    ...preferences,
    maxFinishedAgents: Number(maxFinishedAgents.value)
  });
});
maxFinishedAgents.addEventListener("change", () => {
  savePetPreferences({ maxFinishedAgents: Number(maxFinishedAgents.value) });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (panelView === "diagnostics" || panelView === "integrations") showPanelView("settings");
  else if (panelView === "settings") showPanelView("activity");
  else setPanelOpen(false);
});
agentList.addEventListener(
  "wheel",
  (event) => {
    agentList.scrollTop += event.deltaY;
    event.preventDefault();
  },
  { passive: false }
);

window.claudepet
  .getStatus()
  .then(render)
  .catch(() => {
    shell.dataset.state = "unknown";
    workingCount.textContent = "?";
    needsCount.textContent = "?";
    readyCount.textContent = "?";
  });
window.claudepet.onStatus(render);

window.claudepet.getCurrentPet().then(showPet).catch(() => {
  petMessage.textContent = "Could not load the selected pet.";
});
window.claudepet.onPetChanged(showPet);

window.claudepet.getPetPreferences().then((next) => applyPetPreferences(next, true)).catch(() => {
  petMessage.textContent = "Could not load pet settings.";
});
window.claudepet.onPetPreferencesChanged((next) => applyPetPreferences(next));

window.claudepet.getCorner().then(showCorner).catch(() => undefined);

window.claudepet.getStartupPreference().then(renderStartupPreference).catch(() => {
  startupEnabled.disabled = true;
});
window.claudepet.onStartupPreferenceChanged(renderStartupPreference);

const shapeObserver = new ResizeObserver(scheduleWindowShape);
shapeObserver.observe(panel);
shapeObserver.observe(toggle);
shapeObserver.observe(statusControls);
new MutationObserver(scheduleWindowShape).observe(shell, {
  attributes: true,
  subtree: true,
  attributeFilter: ["hidden", "style", "data-corner", "data-pet-enabled"]
});
scheduleWindowShape();

window.claudepet
  .getIntegrationStatus()
  .then((status) => {
    renderIntegrationStatus(status);
    if (shouldOpenIntegrationSetup(status)) {
      setPanelOpen(true);
      showPanelView("integrations");
    }
  })
  .catch(() => undefined);
