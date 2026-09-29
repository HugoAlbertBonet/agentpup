import { contextBridge, ipcRenderer } from "electron";

import type { StatusState } from "../../../packages/status/src/index.js";
import type { OverlayCorner, Rectangle } from "./window-policy.js";
import type { OpenPetsLayout } from "../../../packages/pets/src/index.js";
import type {
  PetPreferences,
  PetPreferencesPatch
} from "../../../packages/pets/src/preferences.js";
import type { DiagnosticsSnapshot } from "./diagnostics.js";
import type {
  IntegrationActionResult,
  IntegrationStatus
} from "./integration-control.js";

export interface PetPresentation {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly layout: OpenPetsLayout;
}

export interface PetImportResult {
  readonly cancelled: boolean;
  readonly pet?: PetPresentation;
  readonly error?: string;
}

export interface StartupPreference {
  readonly supported: boolean;
  readonly label: string;
  readonly enabled: boolean;
}

export interface ClaudepetApi {
  getStatus(): Promise<StatusState>;
  onStatus(callback: (status: StatusState) => void): void;
  getDiagnostics(): Promise<DiagnosticsSnapshot>;
  copyDiagnostics(): Promise<void>;
  getIntegrationStatus(): Promise<IntegrationStatus>;
  setupIntegration(): Promise<IntegrationActionResult>;
  uninstallIntegration(): Promise<IntegrationActionResult>;
  getCorner(): Promise<OverlayCorner>;
  moveToNextCorner(): Promise<OverlayCorner>;
  getCurrentPet(): Promise<PetPresentation>;
  getPetPreferences(): Promise<PetPreferences>;
  updatePetPreferences(patch: PetPreferencesPatch): Promise<PetPreferences>;
  cyclePet(): Promise<PetPresentation>;
  importPet(): Promise<PetImportResult>;
  openPetGallery(): Promise<void>;
  onPetChanged(callback: (pet: PetPresentation) => void): void;
  onPetPreferencesChanged(callback: (preferences: PetPreferences) => void): void;
  getStartupPreference(): Promise<StartupPreference>;
  setStartupPreference(enabled: boolean): Promise<StartupPreference>;
  onStartupPreferenceChanged(callback: (preference: StartupPreference) => void): void;
  setWindowShape(rectangles: readonly Rectangle[]): void;
  setInteractive(interactive: boolean): void;
  setPanelOpen(open: boolean): void;
}

const api: ClaudepetApi = {
  getStatus: () => ipcRenderer.invoke("status:get") as Promise<StatusState>,
  onStatus: (callback) => {
    ipcRenderer.on("status:changed", (_event, nextStatus: StatusState) => callback(nextStatus));
  },
  getDiagnostics: () => ipcRenderer.invoke("diagnostics:get") as Promise<DiagnosticsSnapshot>,
  copyDiagnostics: () => ipcRenderer.invoke("diagnostics:copy") as Promise<void>,
  getIntegrationStatus: () =>
    ipcRenderer.invoke("integration:get-status") as Promise<IntegrationStatus>,
  setupIntegration: () =>
    ipcRenderer.invoke("integration:setup") as Promise<IntegrationActionResult>,
  uninstallIntegration: () =>
    ipcRenderer.invoke("integration:uninstall") as Promise<IntegrationActionResult>,
  getCorner: () => ipcRenderer.invoke("overlay:get-corner") as Promise<OverlayCorner>,
  moveToNextCorner: () =>
    ipcRenderer.invoke("overlay:move-next-corner") as Promise<OverlayCorner>,
  getCurrentPet: () => ipcRenderer.invoke("pet:get-current") as Promise<PetPresentation>,
  getPetPreferences: () =>
    ipcRenderer.invoke("pet:get-preferences") as Promise<PetPreferences>,
  updatePetPreferences: (patch) =>
    ipcRenderer.invoke("pet:update-preferences", patch) as Promise<PetPreferences>,
  cyclePet: () => ipcRenderer.invoke("pet:cycle") as Promise<PetPresentation>,
  importPet: () => ipcRenderer.invoke("pet:import") as Promise<PetImportResult>,
  openPetGallery: () => ipcRenderer.invoke("pet:open-gallery") as Promise<void>,
  onPetChanged: (callback) => {
    ipcRenderer.on("pet:changed", (_event, pet: PetPresentation) => callback(pet));
  },
  onPetPreferencesChanged: (callback) => {
    ipcRenderer.on(
      "pet:preferences-changed",
      (_event, preferences: PetPreferences) => callback(preferences)
    );
  },
  getStartupPreference: () =>
    ipcRenderer.invoke("startup:get") as Promise<StartupPreference>,
  setStartupPreference: (enabled) =>
    ipcRenderer.invoke("startup:set", enabled) as Promise<StartupPreference>,
  onStartupPreferenceChanged: (callback) => {
    ipcRenderer.on("startup:changed", (_event, preference: StartupPreference) =>
      callback(preference)
    );
  },
  setWindowShape: (rectangles) => ipcRenderer.send("overlay:set-shape", rectangles),
  setInteractive: (interactive) => ipcRenderer.send("overlay:set-interactive", interactive),
  setPanelOpen: (open) => ipcRenderer.send("overlay:set-panel-open", open)
};

contextBridge.exposeInMainWorld("claudepet", api);
