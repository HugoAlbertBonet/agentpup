import { randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  buildProviderHooks,
  hasAgentPupHooks,
  mergeProviderHooks,
  removeAgentPupHooks,
  type HookGroup,
  type HookProvider,
  type HookSettings
} from "./config.js";

interface ProviderFile {
  provider: HookProvider;
  filePath: string;
  defaultSettings: HookSettings;
}

export interface InstallOptions {
  home: string;
  codexHome?: string;
  claudeHome?: string;
  nodePath: string;
  hookPath: string;
  deployedHookPath?: string;
  backupStamp?: string;
}

export interface IntegrationChangeReport {
  changed: HookProvider[];
  backups: string[];
}

export interface IntegrationInspection {
  provider: HookProvider;
  filePath: string;
  exists: boolean;
  installed: boolean;
  valid: boolean;
  error?: string;
}

export interface IntegrationLocations {
  home: string;
  codexHome?: string;
  claudeHome?: string;
}

function locations(value: string | IntegrationLocations): IntegrationLocations {
  return typeof value === "string" ? { home: value } : value;
}

function providerFiles(value: string | IntegrationLocations): ProviderFile[] {
  const location = locations(value);
  return [
    {
      provider: "claude-code",
      filePath: path.join(location.claudeHome ?? path.join(location.home, ".claude"), "settings.json"),
      defaultSettings: {}
    },
    {
      provider: "codex",
      filePath: path.join(location.codexHome ?? path.join(location.home, ".codex"), "hooks.json"),
      defaultSettings: { description: "AgentPup local activity observer" }
    }
  ];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseSettings(source: string): HookSettings {
  const value: unknown = JSON.parse(source);
  const settings = object(value);
  if (settings === undefined) throw new Error("Settings root must be a JSON object");
  if (settings.hooks === undefined) return settings;
  const hooks = object(settings.hooks);
  if (hooks === undefined) throw new Error("The hooks field must be a JSON object");
  for (const [event, groupsValue] of Object.entries(hooks)) {
    if (!Array.isArray(groupsValue)) throw new Error(`${event} hooks must be an array`);
    for (const groupValue of groupsValue) {
      const group = object(groupValue);
      if (group === undefined || !Array.isArray(group.hooks)) {
        throw new Error(`${event} contains an invalid hook group`);
      }
      for (const handlerValue of group.hooks) {
        const handler = object(handlerValue);
        if (handler === undefined || typeof handler.type !== "string") {
          throw new Error(`${event} contains an invalid hook handler`);
        }
      }
    }
  }
  return settings as HookSettings;
}

async function readSettings(file: ProviderFile): Promise<{
  source: string | null;
  settings: HookSettings;
}> {
  try {
    const source = await readFile(file.filePath, "utf8");
    return { source, settings: parseSettings(source) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { source: null, settings: structuredClone(file.defaultSettings) };
    }
    throw error;
  }
}

function serialize(settings: HookSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

async function nextBackupPath(filePath: string, stamp: string): Promise<string> {
  let suffix = 0;
  while (true) {
    const candidate = `${filePath}.agentpup-backup-${stamp}${suffix === 0 ? "" : `-${suffix}`}`;
    try {
      await access(candidate);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

async function writeSettings(
  file: ProviderFile,
  previousSource: string | null,
  settings: HookSettings,
  backupStamp: string
): Promise<string | null> {
  await mkdir(path.dirname(file.filePath), { recursive: true, mode: 0o700 });
  const current = await readSettings(file);
  if (current.source !== previousSource) {
    throw new Error(`${file.filePath} changed while AgentPup was preparing the update`);
  }
  let backup: string | null = null;
  if (previousSource !== null) {
    backup = await nextBackupPath(file.filePath, backupStamp);
    await copyFile(file.filePath, backup);
  }
  const temporary = `${file.filePath}.agentpup-${process.pid}-${randomUUID()}.tmp`;
  await writeFile(temporary, serialize(settings), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, file.filePath);
  return backup;
}

function stampNow(): string {
  return new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function deployHookRuntime(sourcePath: string, destinationPath: string): Promise<void> {
  const source = await readFile(sourcePath);
  try {
    const current = await readFile(destinationPath);
    if (current.equals(source)) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const temporary = `${destinationPath}.agentpup-${process.pid}-${randomUUID()}.tmp`;
  await writeFile(temporary, source, { mode: 0o700, flag: "wx" });
  await rename(temporary, destinationPath);
}

export async function installIntegration(
  options: InstallOptions
): Promise<IntegrationChangeReport> {
  const report: IntegrationChangeReport = { changed: [], backups: [] };
  const backupStamp = options.backupStamp ?? stampNow();
  const installedHookPath = options.deployedHookPath ?? options.hookPath;
  if (options.deployedHookPath !== undefined) {
    await deployHookRuntime(options.hookPath, options.deployedHookPath);
  }
  for (const file of providerFiles(options)) {
    const current = await readSettings(file);
    const additions = buildProviderHooks(file.provider, options.nodePath, installedHookPath);
    const next = mergeProviderHooks(current.settings, additions);
    if (serialize(next) === serialize(current.settings)) continue;
    const backup = await writeSettings(file, current.source, next, backupStamp);
    report.changed.push(file.provider);
    if (backup !== null) report.backups.push(backup);
  }
  return report;
}

export async function uninstallIntegration(
  location: string | IntegrationLocations,
  deployedHookPath?: string
): Promise<IntegrationChangeReport> {
  const report: IntegrationChangeReport = { changed: [], backups: [] };
  const backupStamp = stampNow();
  for (const file of providerFiles(location)) {
    const current = await readSettings(file);
    if (!hasAgentPupHooks(current.settings)) continue;
    const next = removeAgentPupHooks(current.settings);
    const backup = await writeSettings(file, current.source, next, backupStamp);
    report.changed.push(file.provider);
    if (backup !== null) report.backups.push(backup);
  }
  if (deployedHookPath !== undefined) {
    try {
      await unlink(deployedHookPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return report;
}

export async function inspectIntegration(
  location: string | IntegrationLocations
): Promise<IntegrationInspection[]> {
  const inspections: IntegrationInspection[] = [];
  for (const file of providerFiles(location)) {
    try {
      const current = await readSettings(file);
      inspections.push({
        provider: file.provider,
        filePath: file.filePath,
        exists: current.source !== null,
        installed: hasAgentPupHooks(current.settings),
        valid: true
      });
    } catch (error) {
      inspections.push({
        provider: file.provider,
        filePath: file.filePath,
        exists: true,
        installed: false,
        valid: false,
        error: error instanceof Error ? error.message : "Invalid settings"
      });
    }
  }
  return inspections;
}
