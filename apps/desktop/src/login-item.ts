import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LoginItemOptions {
  readonly platform: NodeJS.Platform;
  readonly enabled: boolean;
  readonly isPackaged: boolean;
  readonly executablePath: string;
  readonly applicationPath: string;
  readonly wslDistro: string | undefined;
}

export interface LoginItemSettings {
  readonly openAtLogin: boolean;
  readonly path?: string;
  readonly args?: string[];
}

export interface LinuxAutostartEntryOptions {
  readonly executablePath: string;
  readonly applicationPath: string | undefined;
}

const validWslDistro = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveWslDistro(
  argv: readonly string[],
  environmentValue: string | undefined
): string | undefined {
  if (environmentValue !== undefined && validWslDistro.test(environmentValue)) {
    return environmentValue;
  }
  const prefixes = ["--agentpup-wsl-distro=", "--claudepet-wsl-distro="];
  const prefix = prefixes.find((candidate) => argv.some((value) => value.startsWith(candidate)));
  const argument = prefix === undefined ? undefined : argv.find((value) => value.startsWith(prefix));
  const value = prefix === undefined ? undefined : argument?.slice(prefix.length);
  return value !== undefined && validWslDistro.test(value) ? value : undefined;
}

export function createLoginItemSettings(
  options: LoginItemOptions
): LoginItemSettings | null {
  if (options.platform === "darwin") return { openAtLogin: options.enabled };
  if (options.platform !== "win32") return null;
  const args = options.isPackaged ? [] : [options.applicationPath];
  if (options.wslDistro !== undefined) {
    args.push(`--agentpup-wsl-distro=${options.wslDistro}`);
  }
  return {
    openAtLogin: options.enabled,
    path: options.executablePath,
    args
  };
}

export function resolveLinuxAutostartExecutable(
  executablePath: string,
  appImagePath: string | undefined
): string {
  return appImagePath !== undefined && path.posix.isAbsolute(appImagePath)
    ? appImagePath
    : executablePath;
}

export function linuxAutostartFilePath(
  homeDirectory: string,
  xdgConfigHome: string | undefined
): string {
  const configHome =
    xdgConfigHome !== undefined && path.posix.isAbsolute(xdgConfigHome)
      ? xdgConfigHome
      : path.posix.join(homeDirectory, ".config");
  return path.posix.join(configHome, "autostart", "dev.agentpup.desktop");
}

function quoteDesktopExecArgument(value: string): string {
  if (value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new Error("Linux autostart paths must be non-empty single-line values.");
  }
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/%/g, "%%")}"`;
}

export function createLinuxAutostartEntry(options: LinuxAutostartEntryOptions): string {
  const arguments_ = [options.executablePath];
  if (options.applicationPath !== undefined) arguments_.push(options.applicationPath);
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=AgentPup",
    "Comment=Desktop companion for local coding agents",
    `Exec=${arguments_.map(quoteDesktopExecArgument).join(" ")}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "X-AgentPup-Autostart=true",
    ""
  ].join("\n");
}

function assertAgentPupAutostartPath(filePath: string): void {
  if (path.basename(filePath) !== "dev.agentpup.desktop") {
    throw new Error("Refusing to modify an autostart file not owned by AgentPup.");
  }
}

export async function isLinuxAutostartEnabled(
  filePath: string,
  expectedEntry: string
): Promise<boolean> {
  assertAgentPupAutostartPath(filePath);
  try {
    return (await readFile(filePath, "utf8")) === expectedEntry;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function configureLinuxAutostart(
  filePath: string,
  entry: string,
  enabled: boolean
): Promise<void> {
  assertAgentPupAutostartPath(filePath);
  if (!enabled) {
    await rm(filePath, { force: true });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, entry, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
