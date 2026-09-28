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

function executableNames(name: "codex" | "claude"): readonly string[] {
  return process.platform === "win32"
    ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name]
    : [name];
}

export function resolveProviderExecutable(
  name: "codex" | "claude",
  home = os.homedir(),
  pathValue = process.env.PATH ?? ""
): string | null {
  const names = executableNames(name);
  const fromPath = pathValue
    .split(path.delimiter)
    .filter((directory) => directory.length > 0)
    .flatMap((directory) => names.map((candidate) => path.join(directory, candidate)));
  const candidates = [
    ...fromPath,
    ...names.map((candidate) => path.join(home, ".local", "bin", candidate)),
    ...names.map((candidate) => path.join(home, ".claude", "local", candidate)),
    ...names.map((candidate) => path.join(home, ".volta", "bin", candidate))
  ];
  const nvmRoot = path.join(home, ".nvm", "versions", "node");
  try {
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    const versions = readdirSync(nvmRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => collator.compare(right, left));
    candidates.push(
      ...versions.flatMap((version) =>
        names.map((candidate) => path.join(nvmRoot, version, "bin", candidate))
      )
    );
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
