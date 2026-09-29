import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { replayEvents } from "../../../packages/status/src/index.js";
import {
  createReducerEvents,
  parseBenchmarkOptions
} from "../../../packages/performance/src/benchmark.js";
import {
  createPerformanceReport,
  type ProcessSample
} from "../../../packages/performance/src/index.js";

const distribution = __dirname;
const options = parseBenchmarkOptions(process.argv.slice(2));

function runProcess(executable: string, arguments_: string[], environment = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = spawn(executable, arguments_, { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    started.stdout.on("data", (chunk) => { stdout += String(chunk); });
    started.stderr.on("data", (chunk) => { stderr += String(chunk); });
    started.once("error", reject);
    started.once("exit", (code) => {
      if (code === 0 && stdout.trim() === "{}") resolve();
      else reject(new Error(stderr.trim() || `Process exited with ${code}`));
    });
  });
}

async function measureHookStartup(): Promise<number> {
  const startedAt = performance.now();
  await runProcess(process.execPath, [path.join(distribution, "hook.cjs"), "--self-test"]);
  return performance.now() - startedAt;
}

async function measureCollectorFirstSnapshot(environment: NodeJS.ProcessEnv): Promise<number> {
  return await new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const collector = spawn(process.execPath, [path.join(distribution, "collector.cjs")], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    let timeout: NodeJS.Timeout;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      collector.kill("SIGTERM");
      if (error) reject(error);
      else resolve(performance.now() - startedAt);
    };
    timeout = setTimeout(() => finish(new Error("Collector did not publish within 15 seconds")), 15_000);
    collector.once("error", (error) => finish(error));
    collector.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes("\n")) finish();
    });
  });
}

function resolvePowerShell(): { executable: string; prefix: string[] } | null {
  const direct = spawnSync("which", ["powershell.exe"], { encoding: "utf8" });
  if (direct.status === 0 && direct.stdout.trim()) {
    return { executable: direct.stdout.trim(), prefix: [] };
  }
  const windowsPath = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  if (process.env.WSL_DISTRO_NAME) return { executable: "/init", prefix: [windowsPath] };
  return null;
}

function measureWindowsProcesses(durationMs: number): ProcessSample {
  const powershell = resolvePowerShell();
  if (powershell === null) {
    throw new Error("Native Windows PowerShell is unavailable; start AgentPup on the current platform");
  }
  const script = String.raw`
$ErrorActionPreference = "Stop"
$durationMs = ${durationMs}
$developmentRoot = Join-Path $env:LOCALAPPDATA "AgentPup\development"
$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.StartsWith($developmentRoot, [StringComparison]::OrdinalIgnoreCase)
})
if ($processes.Count -eq 0) { throw "No running native Windows AgentPup processes were found." }
$ids = @($processes | ForEach-Object { [int]$_.ProcessId })
$before = @{}
foreach ($processId in $ids) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) { $before[$processId] = $process.TotalProcessorTime.TotalMilliseconds }
}
Start-Sleep -Milliseconds $durationMs
$cpuDeltaMs = 0.0
$rssBytes = 0.0
$privateBytes = 0.0
$count = 0
foreach ($processId in $ids) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process -and $before.ContainsKey($processId)) {
    $cpuDeltaMs += [Math]::Max(0, $process.TotalProcessorTime.TotalMilliseconds - $before[$processId])
    $rssBytes += $process.WorkingSet64
    $privateBytes += $process.PrivateMemorySize64
    $count += 1
  }
}
if ($count -eq 0) { throw "AgentPup exited during the process sample." }
$oneCore = 100.0 * $cpuDeltaMs / $durationMs
[ordered]@{
  processCount = $count
  durationMs = $durationMs
  cpuOneCorePercent = $oneCore
  cpuMachinePercent = $oneCore / [Environment]::ProcessorCount
  rssBytes = [long]$rssBytes
  privateBytes = [long]$privateBytes
  gpuPercent = $null
  battery = $null
} | ConvertTo-Json -Compress
`;
  const result = spawnSync(
    powershell.executable,
    [...powershell.prefix, "-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      env: process.env,
      timeout: durationMs + 30_000
    }
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Windows process sampling failed");
  return JSON.parse(result.stdout.trim()) as ProcessSample;
}

async function main(): Promise<void> {
  const reducerEvents = createReducerEvents();
  replayEvents(reducerEvents);
  const reducerMs: number[] = [];
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const startedAt = performance.now();
    for (let replay = 0; replay < 1_000; replay += 1) replayEvents(reducerEvents);
    reducerMs.push((performance.now() - startedAt) / 1_000);
  }

  const hookStartupMs: number[] = [];
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    hookStartupMs.push(await measureHookStartup());
  }

  const temporaryHome = await mkdtemp(path.join(os.tmpdir(), "agentpup-benchmark-"));
  const collectorFirstSnapshotMs: number[] = [];
  try {
    const environment = {
      ...process.env,
      AGENTPUP_HOME: path.join(temporaryHome, "agentpup"),
      CODEX_HOME: path.join(temporaryHome, "codex"),
      CLAUDE_CONFIG_DIR: path.join(temporaryHome, "claude")
    };
    await Promise.all([
      mkdir(environment.AGENTPUP_HOME, { recursive: true }),
      mkdir(environment.CODEX_HOME, { recursive: true }),
      mkdir(environment.CLAUDE_CONFIG_DIR, { recursive: true })
    ]);
    const collectorIterations = Math.min(options.iterations, 5);
    for (let iteration = 0; iteration < collectorIterations; iteration += 1) {
      collectorFirstSnapshotMs.push(await measureCollectorFirstSnapshot(environment));
    }
  } finally {
    await rm(temporaryHome, { recursive: true, force: true });
  }

  const processSample = measureWindowsProcesses(options.durationMs);
  const report = createPerformanceReport({
    generatedAt: new Date().toISOString(),
    platform: process.env.WSL_DISTRO_NAME ? "win32-via-wsl" : process.platform,
    label: options.label,
    reducerMs,
    hookStartupMs,
    collectorFirstSnapshotMs,
    processSample
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output !== null) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await writeFile(options.output, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
