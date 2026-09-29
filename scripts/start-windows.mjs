import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createWindowsLaunch,
  resolveWindowsExecutable
} from "./windows-interop.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "linux" || process.env.WSL_DISTRO_NAME === undefined) {
  console.error("dev:windows must be run inside WSL.");
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const electronVersion = packageJson.devDependencies?.electron;
if (typeof electronVersion !== "string") {
  console.error("The pinned Electron version is missing from package.json.");
  process.exit(1);
}

async function findArchive(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }

  const expectedName = `electron-v${electronVersion}-win32-x64.zip`;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === expectedName) return entryPath;
    if (entry.isDirectory()) {
      const found = await findArchive(entryPath);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const archive = await findArchive(path.join(os.homedir(), ".cache", "electron"));
if (archive === undefined) {
  console.error("The signed Windows Electron runtime is not cached.");
  console.error("Run `npm run package:windows` once, then retry `npm run dev:windows`.");
  process.exit(1);
}

function toWindowsPath(linuxPath) {
  const result = spawnSync("wslpath", ["-w", linuxPath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "wslpath failed");
  return result.stdout.trim();
}

const windowsArchive = toWindowsPath(archive);
const windowsRoot = toWindowsPath(root);
const demoArgument = process.argv.includes("--demo") ? "--demo" : "";
const autostartArgument = process.argv.includes("--install-autostart")
  ? "--enable-autostart"
  : process.argv.includes("--remove-autostart")
    ? "--disable-autostart"
    : "";
const benchmarkArgument = process.argv.includes("--benchmark-animations=off")
  ? "--benchmark-animations=off"
  : "";
const benchmarkIdleArgument = process.argv.includes("--benchmark-idle")
  ? "--benchmark-idle"
  : "";
const forwardedVariables = [
  "AGENTPUP_WINDOWS_ARCHIVE",
  "AGENTPUP_WINDOWS_SOURCE",
  "AGENTPUP_ELECTRON_VERSION",
  "AGENTPUP_APP_ARGUMENT",
  "AGENTPUP_AUTOSTART_ARGUMENT",
  "AGENTPUP_BENCHMARK_ARGUMENT",
  "AGENTPUP_BENCHMARK_IDLE_ARGUMENT",
  "AGENTPUP_WSL_COLLECTOR_PATH",
  "AGENTPUP_WSL_INTEGRATION_PATH",
  "AGENTPUP_WSL_DISTRO"
].join(":");

const powershell = String.raw`
$ErrorActionPreference = "Stop"
$archive = $env:AGENTPUP_WINDOWS_ARCHIVE
$sourceRoot = $env:AGENTPUP_WINDOWS_SOURCE
$electronVersion = $env:AGENTPUP_ELECTRON_VERSION
$appArgument = $env:AGENTPUP_APP_ARGUMENT
$autostartArgument = $env:AGENTPUP_AUTOSTART_ARGUMENT
$benchmarkArgument = $env:AGENTPUP_BENCHMARK_ARGUMENT
$benchmarkIdleArgument = $env:AGENTPUP_BENCHMARK_IDLE_ARGUMENT
$developmentRoot = Join-Path $env:LOCALAPPDATA "AgentPup\development"
$legacyDevelopmentRoot = Join-Path $env:LOCALAPPDATA "Claudepet\development"
$runtimeRoot = Join-Path $developmentRoot ("electron-" + $electronVersion)
$applicationRoot = Join-Path $developmentRoot "app"
$legacyRuntimePrefix = Join-Path $env:TEMP "Claudepet-electron-"

$agentPupProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.ExecutablePath -and
    ($_.ExecutablePath.StartsWith($runtimeRoot, [StringComparison]::OrdinalIgnoreCase) -or
     $_.ExecutablePath.StartsWith($legacyDevelopmentRoot, [StringComparison]::OrdinalIgnoreCase) -or
     $_.ExecutablePath.StartsWith($legacyRuntimePrefix, [StringComparison]::OrdinalIgnoreCase))
  })
$agentPupProcesses |
  Where-Object { $_.CommandLine -notmatch "--type=" } |
  ForEach-Object { & taskkill.exe /PID $_.ProcessId /T /F | Out-Null }
$shutdownDeadline = (Get-Date).AddSeconds(10)
do {
  $remainingAgentPupProcesses = @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.ExecutablePath -and
      ($_.ExecutablePath.StartsWith($runtimeRoot, [StringComparison]::OrdinalIgnoreCase) -or
       $_.ExecutablePath.StartsWith($legacyDevelopmentRoot, [StringComparison]::OrdinalIgnoreCase) -or
       $_.ExecutablePath.StartsWith($legacyRuntimePrefix, [StringComparison]::OrdinalIgnoreCase))
    })
  if ($remainingAgentPupProcesses.Count -eq 0) { break }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $shutdownDeadline)
if ($remainingAgentPupProcesses.Count -ne 0) {
  $remainingIds = ($remainingAgentPupProcesses | ForEach-Object { $_.ProcessId }) -join ", "
  throw "AgentPup did not stop before restart (processes $remainingIds)."
}

if (-not (Test-Path (Join-Path $runtimeRoot "electron.exe"))) {
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
}

if (Test-Path $applicationRoot) {
  Remove-Item -Path $applicationRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $applicationRoot | Out-Null
Copy-Item -Path (Join-Path $sourceRoot "dist") -Destination $applicationRoot -Recurse
Copy-Item -Path (Join-Path $sourceRoot "package.json") -Destination $applicationRoot

$arguments = @($applicationRoot)
if ($appArgument) { $arguments += $appArgument }
if ($autostartArgument) { $arguments += $autostartArgument }
if ($benchmarkArgument) { $arguments += $benchmarkArgument }
if ($benchmarkIdleArgument) { $arguments += $benchmarkIdleArgument }
Start-Process -FilePath (Join-Path $runtimeRoot "electron.exe") -ArgumentList $arguments
Write-Output "AgentPup started as a native Windows development app."
`;

const interopRegistered = existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");
const powershellExecutable = interopRegistered
  ? "powershell.exe"
  : resolveWindowsExecutable("powershell.exe");
if (powershellExecutable === null) {
  console.error("Windows PowerShell could not be found on PATH.");
  process.exit(1);
}
const windowsLaunch = createWindowsLaunch(interopRegistered, powershellExecutable, [
  "-NoProfile",
  "-Command",
  powershell
]);

const child = spawn(
  windowsLaunch.executable,
  windowsLaunch.arguments,
  {
    stdio: "inherit",
    env: {
      ...process.env,
      AGENTPUP_WINDOWS_ARCHIVE: windowsArchive,
      AGENTPUP_WINDOWS_SOURCE: windowsRoot,
      AGENTPUP_ELECTRON_VERSION: electronVersion,
      AGENTPUP_APP_ARGUMENT: demoArgument,
      AGENTPUP_AUTOSTART_ARGUMENT: autostartArgument,
      AGENTPUP_BENCHMARK_ARGUMENT: benchmarkArgument,
      AGENTPUP_BENCHMARK_IDLE_ARGUMENT: benchmarkIdleArgument,
      AGENTPUP_WSL_COLLECTOR_PATH: path.join(root, "dist", "collector.cjs"),
      AGENTPUP_WSL_INTEGRATION_PATH: path.join(root, "dist", "integration.cjs"),
      AGENTPUP_WSL_DISTRO: process.env.WSL_DISTRO_NAME,
      WSLENV:
        process.env.WSLENV === undefined || process.env.WSLENV.length === 0
          ? forwardedVariables
          : `${process.env.WSLENV}:${forwardedVariables}`
    }
  }
);

child.on("error", (error) => {
  console.error(`Unable to start the Windows development app: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
