import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  screen,
  shell,
  Tray,
  type Display,
  type MenuItemConstructorOptions
} from "electron";

import {
  applyEvent,
  createDemoEvents,
  createStatusState,
  replayEvents,
  type StatusEvent,
  type StatusState
} from "../../../packages/status/src/index.js";
import {
  discoverLocalSessions,
  discoveredSessionsToEvents
} from "../../../packages/collectors/src/local-discovery.js";
import { parseCollectorMessage } from "../../../packages/collectors/src/live-collector.js";
import type { CollectorRuntimeDiagnostics } from "../../../packages/collectors/src/live-collector.js";
import {
  startCollectorBridge,
  type CollectorBridge
} from "./collector-bridge.js";
import {
  detectOverlayRuntime,
  getDefaultCorner,
  getCornerPosition,
  getNextCorner,
  getOverlayWindowPolicy,
  selectDisplayForWindow,
  type OverlayCorner,
  type OverlayRuntime
} from "./window-policy.js";
import { normalizeWindowShape } from "./window-shape.js";
import { desktopAcceptanceReportPath } from "./desktop-acceptance.js";
import {
  advanceMotion,
  chooseEdgeTarget,
  clampToWorkArea,
  isRoamingEnabled
} from "./motion.js";
import {
  builtInPetId,
  defaultPetPreferences,
  installOpenPetsZip,
  listInstalledPets,
  normalizePetPreferences,
  openPetsGalleryUrl,
  validatePetPreferencesPatch,
  type InstalledPet,
  type OpenPetsLayout,
  type PetPreferences
} from "../../../packages/pets/src/index.js";
import {
  createDiagnosticsSnapshot,
  formatDiagnosticsReport,
  type CollectorConnectionState,
  type DiagnosticsSnapshot,
  type SanitizedEventReference
} from "./diagnostics.js";
import {
  parseIntegrationStatus,
  type IntegrationActionResult,
  type IntegrationStatus
} from "./integration-control.js";
import {
  createScriptLaunch,
  runtimeAssetPath,
  wslPathConversionLaunch
} from "./runtime-launch.js";
import {
  autostartTrayPresentation,
  supportsSystemTray,
  supportsStartupControl,
  toggleTrayRuntime,
  trayIconSize,
  trayPresentation
} from "./tray-control.js";
import {
  configureLinuxAutostart,
  createLinuxAutostartEntry,
  createLoginItemSettings,
  isLinuxAutostartEnabled,
  linuxAutostartFilePath,
  resolveLinuxAutostartExecutable,
  resolveWslDistro
} from "./login-item.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "agentpup-pet",
    privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false }
  }
]);

const WINDOW_WIDTH = 460;
const WINDOW_HEIGHT = 680;
const WINDOW_MARGIN = 16;
const runtime: OverlayRuntime = detectOverlayRuntime(process.platform, process.env, process.argv);
const roamingEnabled = isRoamingEnabled(process.argv);
const acceptanceReportPath = desktopAcceptanceReportPath(process.argv);
const configuredWslDistro = resolveWslDistro(
  process.argv,
  process.env.AGENTPUP_WSL_DISTRO ?? process.env.CLAUDEPET_WSL_DISTRO
);
let currentCorner: OverlayCorner = getDefaultCorner(runtime);
let currentDisplayId: number | undefined;

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let startupEnabled = false;
let status: StatusState = createStatusState();
const eventSnapshots = new Map<string, StatusEvent[]>();
let collectorBridge: CollectorBridge | null = null;
let collectorState: CollectorConnectionState = process.argv.includes("--demo") ? "demo" : "waiting";
let collectorDiagnostics: CollectorRuntimeDiagnostics | null = null;
let lastCollectorEvent: SanitizedEventReference | null = null;
let quitting = false;
let interactionActive = false;
let panelOpen = false;
let roamingTarget: { x: number; y: number } | null = null;
let nextRoamingChoiceAt = 0;
let lastMotionAt = Date.now();
let roamingTimer: NodeJS.Timeout | null = null;
let installedPets: readonly InstalledPet[] = [];
let selectedPetId = builtInPetId;
let petPreferences: PetPreferences = defaultPetPreferences;
let petSettingsWriteQueue: Promise<void> = Promise.resolve();

interface PetPresentation {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly layout: OpenPetsLayout;
}

interface PetImportResult {
  readonly cancelled: boolean;
  readonly pet?: PetPresentation;
  readonly error?: string;
}

const builtInLayout: OpenPetsLayout = {
  version: 2,
  frameWidth: 192,
  frameHeight: 208,
  columns: 8,
  rows: 11
};

function petsRoot(): string {
  return path.join(app.getPath("userData"), "pets");
}

function petSettingsPath(): string {
  return path.join(app.getPath("userData"), "selected-pet.json");
}

function currentPet(): PetPresentation {
  const installed = installedPets.find((pet) => pet.id === selectedPetId);
  if (installed === undefined) {
    return {
      id: builtInPetId,
      displayName: "AgentPup",
      description: "An attentive AI companion for local coding agents.",
      imageUrl: "assets/default-pet-spritesheet.webp",
      layout: builtInLayout
    };
  }
  return {
    id: installed.id,
    displayName: installed.displayName,
    description: installed.description,
    imageUrl: `agentpup-pet://spritesheet/${encodeURIComponent(installed.id)}`,
    layout: installed.layout
  };
}

async function refreshPetLibrary(): Promise<void> {
  installedPets = await listInstalledPets(petsRoot());
  try {
    const settings = JSON.parse(await readFile(petSettingsPath(), "utf8")) as unknown;
    petPreferences = normalizePetPreferences(settings);
    if (
      typeof settings === "object" &&
      settings !== null &&
      "selectedPetId" in settings &&
      typeof settings.selectedPetId === "string" &&
      (settings.selectedPetId === builtInPetId ||
        installedPets.some((pet) => pet.id === settings.selectedPetId))
    ) {
      selectedPetId = settings.selectedPetId;
    }
  } catch (error) {
    petPreferences = defaultPetPreferences;
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      console.warn("[agentpup] Could not read selected pet preference:", error);
    }
  }
}

async function persistPetSettings(): Promise<void> {
  const settingsPath = petSettingsPath();
  const serialized = `${JSON.stringify({ selectedPetId, ...petPreferences }, null, 2)}\n`;
  petSettingsWriteQueue = petSettingsWriteQueue.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, serialized, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporaryPath, settingsPath);
  });
  await petSettingsWriteQueue;
}

async function chooseNextPet(): Promise<PetPresentation> {
  const ids = [builtInPetId, ...installedPets.map((pet) => pet.id)];
  const currentIndex = Math.max(0, ids.indexOf(selectedPetId));
  selectedPetId = ids[(currentIndex + 1) % ids.length]!;
  await persistPetSettings();
  const pet = currentPet();
  overlay?.webContents.send("pet:changed", pet);
  return pet;
}

function registerPetProtocol(): void {
  protocol.handle("agentpup-pet", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "spritesheet" || url.search !== "" || url.hash !== "") {
      return new Response("Not found", { status: 404 });
    }
    const id = decodeURIComponent(url.pathname.slice(1));
    const pet = installedPets.find((candidate) => candidate.id === id);
    if (pet === undefined) return new Response("Not found", { status: 404 });
    try {
      return new Response(await readFile(pet.spritesheetPath), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function publishStatus(): void {
  status = replayEvents([...eventSnapshots.values()].flat());
  if (overlay !== null && !overlay.isDestroyed()) {
    overlay.webContents.send("status:changed", status);
  }
}

function diagnosticsSnapshot(): DiagnosticsSnapshot {
  return createDiagnosticsSnapshot({
    generatedAt: new Date().toISOString(),
    applicationVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? "unknown",
    platform: process.platform,
    runtime,
    collectorState,
    collector: collectorDiagnostics,
    lastEvent: lastCollectorEvent,
    status
  });
}

function replaceEventSnapshot(source: string, events: StatusEvent[]): void {
  eventSnapshots.set(source, events);
  publishStatus();
}

function markSnapshotDisconnected(source: string, reason: string): void {
  const events = eventSnapshots.get(source);
  if (events === undefined) return;
  let snapshotState = replayEvents(events);
  const observedAt = new Date().toISOString();
  for (const collector of Object.values(snapshotState.collectors)) {
    snapshotState = applyEvent(snapshotState, {
      type: "collector.disconnected",
      eventId: `${collector.collectorId}:bridge-disconnected:${observedAt}`,
      collectorId: collector.collectorId,
      sequence: (snapshotState.lastSequenceByCollector[collector.collectorId] ?? 0) + 1,
      observedAt,
      reason
    });
  }
  eventSnapshots.set(source, [
    ...events,
    ...Object.values(snapshotState.collectors)
      .filter((collector) => !collector.connected)
      .map((collector) => ({
        type: "collector.disconnected" as const,
        eventId: `${collector.collectorId}:bridge-disconnected:${observedAt}`,
        collectorId: collector.collectorId,
        sequence: snapshotState.lastSequenceByCollector[collector.collectorId]!,
        observedAt,
        reason
      }))
  ]);
  publishStatus();
}

function bundledRuntimePath(name: string): string {
  return runtimeAssetPath(
    {
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      moduleDirectory: __dirname
    },
    name
  );
}

function resolveWslRuntimePath(name: string, override: string | undefined): string | null {
  if (override !== undefined && override.length > 0) return override;
  const conversion = wslPathConversionLaunch(
    bundledRuntimePath(name),
    configuredWslDistro
  );
  const result = spawnSync(conversion.executable, conversion.arguments, {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true
  });
  if (result.error !== undefined || result.status !== 0) return null;
  const converted = result.stdout.trim();
  return converted.length > 0 ? converted : null;
}

function runtimeScriptPath(name: string, override: string | undefined): string | null {
  return process.platform === "win32"
    ? resolveWslRuntimePath(name, override)
    : bundledRuntimePath(name);
}

function executeIntegrationCommand(command: "status" | "setup" | "uninstall"): Promise<string> {
  const scriptPath = runtimeScriptPath(
    "integration.cjs",
    process.env.AGENTPUP_WSL_INTEGRATION_PATH ?? process.env.CLAUDEPET_WSL_INTEGRATION_PATH
  );
  if (scriptPath === null) {
    return Promise.reject(new Error("The WSL integration runtime is unavailable."));
  }
  const launch = createScriptLaunch(
    process.platform,
    process.execPath,
    scriptPath,
    configuredWslDistro,
    [command]
  );
  return new Promise((resolve, reject) => {
    const child = spawn(launch.executable, launch.arguments, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) reject(error);
      else resolve(stdout);
    };
    const append = (current: string, chunk: string): string =>
      (current + chunk).slice(-64 * 1024);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `Integration command exited with code ${code}`));
    });
    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("Integration command timed out."));
    }, 30_000);
  });
}

async function integrationStatus(): Promise<IntegrationStatus> {
  const parsed = parseIntegrationStatus(await executeIntegrationCommand("status"));
  if (parsed === null) throw new Error("The integration runtime returned invalid status data.");
  return parsed;
}

async function changeIntegration(
  command: "setup" | "uninstall"
): Promise<IntegrationActionResult> {
  await executeIntegrationCommand(command);
  return {
    message:
      command === "setup"
        ? "Monitoring hooks installed. Review and trust the AgentPup hook in Codex /hooks."
        : "AgentPup monitoring hooks removed.",
    status: await integrationStatus()
  };
}

function startLiveCollector(): void {
  if (process.argv.includes("--demo")) return;
  const source = process.platform === "win32" ? "wsl-live" : `native-${process.platform}`;
  const collectorPath = runtimeScriptPath(
    "collector.cjs",
    process.env.AGENTPUP_WSL_COLLECTOR_PATH ?? process.env.CLAUDEPET_WSL_COLLECTOR_PATH
  );
  if (collectorPath === null || collectorPath.length === 0) {
    collectorState = "unavailable";
    console.error("[agentpup] Collector path is unavailable; using discovery only.");
    return;
  }
  let disconnected = false;
  collectorBridge = startCollectorBridge({
    platform: process.platform,
    collectorPath,
    ...(configuredWslDistro === undefined
      ? {}
      : { wslDistro: configuredWslDistro }),
    onLine(line) {
      const message = parseCollectorMessage(line);
      if (message === null) {
        console.error("[agentpup] Ignored an invalid collector message.");
        return false;
      }
      collectorState = "connected";
      collectorDiagnostics = message.diagnostics ?? collectorDiagnostics;
      const latestEvent = message.events
        .filter((event) => event.type !== "collector.connected" && event.type !== "collector.disconnected")
        .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
      if (latestEvent !== undefined) {
        lastCollectorEvent = { type: latestEvent.type, observedAt: latestEvent.observedAt };
      }
      disconnected = false;
      replaceEventSnapshot(source, message.events);
      return true;
    },
    onDisconnect(reason, retryDelayMs) {
      if (quitting) return;
      collectorState = "disconnected";
      if (!disconnected) {
        disconnected = true;
        markSnapshotDisconnected(source, reason);
      }
      console.warn(
        `[agentpup] Collector disconnected (${reason}); retrying in ${retryDelayMs}ms.`
      );
    }
  });
}

function displayForWindow(window: BrowserWindow): Display {
  const displays = screen.getAllDisplays();
  const selected = selectDisplayForWindow(
    displays,
    window.getBounds(),
    currentDisplayId
  );
  return displays.find((display) => display.id === selected?.id) ?? screen.getPrimaryDisplay();
}

function placeOverlay(window: BrowserWindow, display: Display): void {
  const bounds = window.getBounds();
  const position = getCornerPosition(
    display.workArea,
    { width: bounds.width, height: bounds.height },
    currentCorner,
    WINDOW_MARGIN
  );
  currentDisplayId = display.id;
  roamingTarget = null;
  window.setPosition(position.x, position.y, false);
}

function ensureTopmost(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (!getOverlayWindowPolicy(runtime).alwaysOnTopSupported) return;
  if (process.platform === "win32") window.setAlwaysOnTop(true, "screen-saver");
  else window.setAlwaysOnTop(true);
  window.moveTop();
}

function petRuntimeRunning(): boolean {
  return overlay !== null && !overlay.isDestroyed();
}

function loginItemSettings(enabled: boolean) {
  return createLoginItemSettings({
    platform: process.platform,
    enabled,
    isPackaged: app.isPackaged,
    executablePath: process.execPath,
    applicationPath: path.resolve(__dirname, ".."),
    wslDistro: configuredWslDistro
  });
}

function linuxAutostartConfiguration(): { filePath: string; entry: string } {
  const executablePath = resolveLinuxAutostartExecutable(
    process.execPath,
    process.env.APPIMAGE
  );
  return {
    filePath: linuxAutostartFilePath(app.getPath("home"), process.env.XDG_CONFIG_HOME),
    entry: createLinuxAutostartEntry({
      executablePath,
      applicationPath: app.isPackaged ? undefined : path.resolve(__dirname, "..")
    })
  };
}

async function readStartupEnabled(): Promise<boolean> {
  if (process.platform === "linux") {
    const configuration = linuxAutostartConfiguration();
    return isLinuxAutostartEnabled(configuration.filePath, configuration.entry);
  }
  const loginItem = loginItemSettings(true);
  if (loginItem === null) return false;
  if (process.platform === "win32") {
    if (loginItem.path === undefined || loginItem.args === undefined) return false;
    return app.getLoginItemSettings({ path: loginItem.path, args: loginItem.args }).openAtLogin;
  }
  return app.getLoginItemSettings().openAtLogin;
}

function startupPreference(): { supported: boolean; label: string; enabled: boolean } {
  const supported = supportsStartupControl(process.platform);
  const presentation = autostartTrayPresentation(process.platform, startupEnabled);
  return {
    supported,
    label: presentation.label,
    enabled: supported && startupEnabled
  };
}

function publishStartupPreference(): void {
  updateTrayPresentation();
  if (overlay !== null && !overlay.isDestroyed()) {
    overlay.webContents.send("startup:changed", startupPreference());
  }
}

async function setStartupEnabled(enabled: boolean): Promise<void> {
  if (process.platform === "linux") {
    const configuration = linuxAutostartConfiguration();
    await configureLinuxAutostart(configuration.filePath, configuration.entry, enabled);
  } else {
    const loginItem = loginItemSettings(enabled);
    if (loginItem === null) return;
    app.setLoginItemSettings(loginItem);
  }
  startupEnabled = await readStartupEnabled();
  console.info(
    `[agentpup] ${process.platform} login startup ${startupEnabled ? "enabled" : "disabled"}.`
  );
  publishStartupPreference();
}

function updateTrayPresentation(): void {
  if (tray === null || tray.isDestroyed()) return;
  const presentation = trayPresentation(petRuntimeRunning());
  const template: MenuItemConstructorOptions[] = [
    {
      label: presentation.toggleLabel,
      click: () => togglePetFromTray()
    }
  ];
  if (supportsStartupControl(process.platform)) {
    const autostart = autostartTrayPresentation(process.platform, startupEnabled);
    template.push({
      label: autostart.label,
      type: "checkbox",
      checked: autostart.checked,
      click: (menuItem) => {
        void setStartupEnabled(menuItem.checked)
          .catch((error: unknown) => {
            console.error("[agentpup] Could not update login startup:", error);
            publishStartupPreference();
          });
      }
    });
  }
  template.push(
    { type: "separator" },
    {
      label: "Quit AgentPup",
      click: () => app.quit()
    }
  );
  tray.setToolTip(presentation.tooltip);
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function stopPetRuntime(): void {
  collectorBridge?.stop();
  collectorBridge = null;
  collectorState = process.argv.includes("--demo") ? "demo" : "waiting";
  if (overlay !== null && !overlay.isDestroyed()) overlay.destroy();
  overlay = null;
}

function startPetRuntime(resetPlacement = false): void {
  if (petRuntimeRunning()) return;
  if (resetPlacement) {
    currentCorner = getDefaultCorner(runtime);
    currentDisplayId = undefined;
    roamingTarget = null;
  }
  overlay = createOverlay();
  startLiveCollector();
}

function togglePetFromTray(): void {
  toggleTrayRuntime(petRuntimeRunning(), () => startPetRuntime(true), stopPetRuntime);
  updateTrayPresentation();
}

function createSystemTray(): void {
  if (!supportsSystemTray(process.platform)) return;
  const iconSize = trayIconSize(process.platform);
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "renderer", "assets", "tray-icon.png"))
    .resize({ width: iconSize, height: iconSize, quality: "best" });
  if (icon.isEmpty()) {
    console.error("[agentpup] Tray icon could not be loaded.");
    return;
  }
  tray = new Tray(icon);
  tray.on("click", togglePetFromTray);
  updateTrayPresentation();
}

function startRoaming(window: BrowserWindow): void {
  if (roamingTimer !== null) clearInterval(roamingTimer);
  lastMotionAt = Date.now();
  nextRoamingChoiceAt = lastMotionAt + 1_000;
  roamingTimer = setInterval(() => {
    if (window.isDestroyed()) return;
    const now = Date.now();
    const elapsedSeconds = Math.min(0.1, (now - lastMotionAt) / 1_000);
    lastMotionAt = now;
    if (!petPreferences.petEnabled || interactionActive || panelOpen || now < nextRoamingChoiceAt) {
      return;
    }

    const currentPosition = window.getPosition();
    const current = { x: currentPosition[0]!, y: currentPosition[1]! };
    if (roamingTarget === null) {
      const display = displayForWindow(window);
      roamingTarget = chooseEdgeTarget(
        display.workArea,
        { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
        WINDOW_MARGIN,
        Math.random(),
        Math.random()
      );
    }

    const next = advanceMotion(current, roamingTarget, 72 * elapsedSeconds);
    const bounded = clampToWorkArea(
      next,
      displayForWindow(window).workArea,
      { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
      WINDOW_MARGIN
    );
    window.setPosition(bounded.x, bounded.y, false);
    if (Math.hypot(next.x - roamingTarget.x, next.y - roamingTarget.y) < 1) {
      roamingTarget = null;
      nextRoamingChoiceAt = now + 4_000 + Math.random() * 5_000;
    }
  }, 33);
}

function createOverlay(): BrowserWindow {
  const windowPolicy = getOverlayWindowPolicy(runtime);
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: windowPolicy.focusable,
    alwaysOnTop: windowPolicy.alwaysOnTopSupported,
    skipTaskbar: windowPolicy.skipTaskbar,
    ...(windowPolicy.windowType === undefined ? {} : { type: windowPolicy.windowType }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  placeOverlay(window, screen.getPrimaryDisplay());
  if (windowPolicy.clickThrough) window.setIgnoreMouseEvents(true, { forward: true });
  else window.setIgnoreMouseEvents(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (navigationEvent) => navigationEvent.preventDefault());
  window.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`[agentpup] Renderer load failed (${code}): ${description}`);
  });
  void window.loadFile(path.join(__dirname, "renderer", "index.html"));
  window.once("ready-to-show", () => {
    window.showInactive();
    window.setHasShadow(false);
    ensureTopmost(window);
    updateTrayPresentation();
    if (acceptanceReportPath !== undefined) {
      const display = displayForWindow(window);
      const report = {
        schemaVersion: 1,
        platform: process.platform,
        runtime,
        corner: currentCorner,
        trayCreated: tray !== null && !tray.isDestroyed(),
        startupControlSupported: supportsStartupControl(process.platform),
        policy: getOverlayWindowPolicy(runtime),
        window: {
          bounds: window.getBounds(),
          workArea: display.workArea,
          visible: window.isVisible(),
          focused: window.isFocused(),
          focusable: window.isFocusable(),
          alwaysOnTop: window.isAlwaysOnTop(),
          hasShadow: window.hasShadow()
        }
      };
      void writeFile(acceptanceReportPath, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
      }).catch((error: unknown) => {
        console.error("[agentpup] Could not write desktop acceptance report:", error);
      });
    }
    if (roamingEnabled) startRoaming(window);

    if (process.argv.includes("--capture-diagnostics")) {
      void window.webContents.executeJavaScript(
        'document.getElementById("pet-toggle")?.click(); document.getElementById("settings-open")?.click(); document.getElementById("diagnostics-open")?.click();'
      );
    } else if (process.argv.includes("--capture-settings")) {
      void window.webContents.executeJavaScript(
        'document.getElementById("pet-toggle")?.click(); document.getElementById("settings-open")?.click();'
      );
    }

    if (runtime === "wslg") {
      console.info("[agentpup] WSLg preview shown at the top-right of the desktop.");
    }

    const captureArgument = process.argv.find((argument) => argument.startsWith("--capture="));
    const capturePath = captureArgument?.slice("--capture=".length);
    if (capturePath !== undefined && capturePath.length > 0) {
      const captureDelayArgument = process.argv.find((argument) =>
        argument.startsWith("--capture-delay=")
      );
      const requestedDelay = Number(captureDelayArgument?.slice("--capture-delay=".length));
      const captureDelay =
        Number.isFinite(requestedDelay) && requestedDelay >= 100 && requestedDelay <= 10_000
          ? requestedDelay
          : 500;
      setTimeout(() => {
        void window.webContents
          .capturePage()
          .then((image) => writeFile(capturePath, image.toPNG()))
          .then(() => console.info(`[agentpup] Captured overlay to ${capturePath}`))
          .catch((error: unknown) => console.error("[agentpup] Capture failed", error));
      }, captureDelay);
    }
  });
  window.on("blur", () => ensureTopmost(window));
  window.on("always-on-top-changed", (_event, isAlwaysOnTop) => {
    if (!isAlwaysOnTop) setTimeout(() => ensureTopmost(window), 0);
  });
  window.on("closed", () => {
    if (roamingTimer !== null) {
      clearInterval(roamingTimer);
      roamingTimer = null;
    }
    if (overlay === window) overlay = null;
  });

  return window;
}

function registerIpc(): void {
  ipcMain.handle("status:get", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted status request");
    return status;
  });

  ipcMain.handle("diagnostics:get", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted diagnostics request");
    return diagnosticsSnapshot();
  });

  ipcMain.handle("diagnostics:copy", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted diagnostics request");
    clipboard.writeText(formatDiagnosticsReport(diagnosticsSnapshot()));
  });

  ipcMain.handle("integration:get-status", async (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted integration request");
    return await integrationStatus();
  });

  ipcMain.handle("integration:setup", async (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted integration request");
    return await changeIntegration("setup");
  });

  ipcMain.handle("integration:uninstall", async (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted integration request");
    return await changeIntegration("uninstall");
  });

  ipcMain.handle("overlay:get-corner", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted corner request");
    return currentCorner;
  });

  ipcMain.handle("startup:get", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted startup request");
    return startupPreference();
  });

  ipcMain.handle("startup:set", async (event, enabled: unknown) => {
    if (event.sender !== overlay?.webContents || typeof enabled !== "boolean") {
      throw new Error("Untrusted startup request");
    }
    await setStartupEnabled(enabled);
    return startupPreference();
  });

  ipcMain.handle("overlay:move-next-corner", (event) => {
    if (event.sender !== overlay?.webContents || overlay === null) {
      throw new Error("Untrusted corner move request");
    }
    const bounds = overlay.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    });
    currentCorner = getNextCorner(currentCorner);
    placeOverlay(overlay, display);
    ensureTopmost(overlay);
    return currentCorner;
  });

  ipcMain.handle("pet:get-current", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted pet request");
    return currentPet();
  });

  ipcMain.handle("pet:get-preferences", (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted pet request");
    return petPreferences;
  });

  ipcMain.handle("pet:update-preferences", async (event, value: unknown) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted pet request");
    const patch = validatePetPreferencesPatch(value);
    petPreferences = { ...petPreferences, ...patch };
    await persistPetSettings();
    overlay?.webContents.send("pet:preferences-changed", petPreferences);
    return petPreferences;
  });

  ipcMain.handle("pet:cycle", async (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted pet request");
    return await chooseNextPet();
  });

  ipcMain.handle("pet:open-gallery", async (event) => {
    if (event.sender !== overlay?.webContents) throw new Error("Untrusted pet request");
    await shell.openExternal(openPetsGalleryUrl);
  });

  ipcMain.handle("pet:import", async (event): Promise<PetImportResult> => {
    if (event.sender !== overlay?.webContents || overlay === null) {
      throw new Error("Untrusted pet request");
    }
    const selection = await dialog.showOpenDialog(overlay, {
      title: "Import an OpenPets pet",
      buttonLabel: "Import pet",
      properties: ["openFile"],
      filters: [{ name: "OpenPets pack", extensions: ["zip"] }]
    });
    const zipPath = selection.filePaths[0];
    if (selection.canceled || zipPath === undefined) return { cancelled: true };
    try {
      const installed = await installOpenPetsZip(zipPath, petsRoot());
      installedPets = await listInstalledPets(petsRoot());
      selectedPetId = installed.id;
      await persistPetSettings();
      const pet = currentPet();
      overlay.webContents.send("pet:changed", pet);
      return { cancelled: false, pet };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pet import failed.";
      console.error("[agentpup] Pet import failed:", error);
      return { cancelled: false, error: message };
    }
  });

  ipcMain.on("overlay:set-interactive", (event, interactive: unknown) => {
    if (event.sender !== overlay?.webContents || typeof interactive !== "boolean") return;
    interactionActive = interactive;
    if (getOverlayWindowPolicy(runtime).clickThrough) {
      overlay.setIgnoreMouseEvents(!interactive, interactive ? undefined : { forward: true });
    }
  });

  ipcMain.on("overlay:set-panel-open", (event, open: unknown) => {
    if (event.sender !== overlay?.webContents || typeof open !== "boolean") return;
    panelOpen = open;
  });

  ipcMain.on("overlay:set-shape", (event, value: unknown) => {
    if (event.sender !== overlay?.webContents || overlay === null) return;
    let rectangles;
    try {
      rectangles = normalizeWindowShape(value, {
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT
      });
    } catch {
      console.warn("[agentpup] Ignored an invalid overlay window shape.");
      return;
    }
    if (getOverlayWindowPolicy(runtime).shapedClickThrough) {
      overlay.setShape(rectangles);
    }
  });
}

async function loadInitialEvents(): Promise<StatusEvent[]> {
  if (process.argv.includes("--demo")) return createDemoEvents();

  const userHome = os.homedir();
  const sessions = await discoverLocalSessions({
    codexHome: process.env.CODEX_HOME ?? path.join(userHome, ".codex"),
    claudeHome: process.env.CLAUDE_CONFIG_DIR ?? path.join(userHome, ".claude"),
    limitPerProvider: 12
  });
  return discoveredSessionsToEvents(sessions);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!petRuntimeRunning()) startPetRuntime();
    overlay?.showInactive();
    if (overlay !== null) ensureTopmost(overlay);
    updateTrayPresentation();
  });
  app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("dev.agentpup.desktop");
    if (runtime === "linux-wayland") {
      console.warn(
        "[agentpup] Native Wayland cannot guarantee overlay position or always-on-top behavior. " +
          "Launch with --ozone-platform=x11 to use the current X11/Xwayland path."
      );
    } else if (runtime === "linux-unknown") {
      console.warn("[agentpup] Could not identify the Linux display backend; overlay guarantees are limited.");
    }
    const requestedAutostart = process.argv.includes("--enable-autostart")
      ? true
      : process.argv.includes("--disable-autostart")
        ? false
        : undefined;
    if (requestedAutostart !== undefined) {
      try {
        await setStartupEnabled(requestedAutostart);
      } catch (error) {
        console.error("[agentpup] Could not update login startup:", error);
        startupEnabled = false;
      }
    } else {
      try {
        startupEnabled = await readStartupEnabled();
      } catch (error) {
        console.error("[agentpup] Could not read login startup:", error);
        startupEnabled = false;
      }
    }
    await refreshPetLibrary();
    registerPetProtocol();
    eventSnapshots.set("initial", await loadInitialEvents());
    publishStatus();
    registerIpc();
    createSystemTray();
    startPetRuntime();

    screen.on("display-metrics-changed", (_event, display) => {
      if (
        overlay === null ||
        overlay.isDestroyed() ||
        (currentDisplayId !== undefined && currentDisplayId !== display.id)
      ) {
        return;
      }
      placeOverlay(overlay, display);
      ensureTopmost(overlay);
    });
    screen.on("display-removed", (_event, removedDisplay) => {
      if (
        overlay === null ||
        overlay.isDestroyed() ||
        (currentDisplayId !== undefined && currentDisplayId !== removedDisplay.id)
      ) {
        return;
      }
      currentDisplayId = undefined;
      placeOverlay(overlay, displayForWindow(overlay));
      ensureTopmost(overlay);
    });
  });
}

app.on("before-quit", () => {
  quitting = true;
  tray?.destroy();
  tray = null;
  collectorBridge?.stop();
  collectorBridge = null;
});
app.on("window-all-closed", () => {
  if (tray === null || tray.isDestroyed()) app.quit();
});
