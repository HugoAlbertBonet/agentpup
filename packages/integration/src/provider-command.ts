import { constants, accessSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function executable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveProviderExecutable(
  name: "codex" | "claude",
  home = os.homedir(),
  pathValue = process.env.PATH ?? ""
): string | null {
  const fromPath = pathValue
    .split(path.delimiter)
    .filter((directory) => directory.length > 0)
    .map((directory) => path.join(directory, name));
  const candidates = [
    ...fromPath,
    path.join(home, ".local", "bin", name),
    path.join(home, ".claude", "local", name),
    path.join(home, ".volta", "bin", name)
  ];
  const nvmRoot = path.join(home, ".nvm", "versions", "node");
  try {
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    const versions = readdirSync(nvmRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => collator.compare(right, left));
    candidates.push(...versions.map((version) => path.join(nvmRoot, version, "bin", name)));
  } catch {
    // NVM is optional.
  }
  return candidates.find(executable) ?? null;
}

export function providerVersion(
  name: "codex" | "claude",
  home = os.homedir(),
  pathValue = process.env.PATH ?? ""
): string | null {
  const command = resolveProviderExecutable(name, home, pathValue);
  if (command === null) return null;
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true
  });
  if (result.error !== undefined || result.status !== 0) return null;
  const value = `${result.stdout}\n${result.stderr}`.trim().replaceAll(/\s+/g, " ");
  return value.length === 0 ? "installed" : value.slice(0, 160);
}
