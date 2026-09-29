import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findPackagedExecutable } from "./smoke-unix-release.mjs";

const windowMargin = 16;

function invalid(message) {
  throw new Error(`Invalid packaged macOS overlay: ${message}`);
}

export function validateMacOverlayReport(report) {
  if (
    report?.schemaVersion !== 1 ||
    report.platform !== "darwin" ||
    report.runtime !== "native" ||
    report.corner !== "bottom-right" ||
    report.trayCreated !== true ||
    report.startupControlSupported !== true
  ) {
    invalid("platform policy or desktop controller was not initialized");
  }
  const window = report.window;
  const bounds = window?.bounds;
  const workArea = window?.workArea;
  if (
    window?.visible !== true ||
    window.focused !== false ||
    window.focusable !== false ||
    window.alwaysOnTop !== true ||
    window.hasShadow !== false
  ) {
    invalid("window activation, topmost, or shadow policy differs");
  }
  if (
    bounds?.width !== 460 ||
    bounds?.height !== 680 ||
    ![bounds.x, bounds.y, workArea?.x, workArea?.y, workArea?.width, workArea?.height].every(
      Number.isFinite
    )
  ) {
    invalid("window or work-area geometry is malformed");
  }
  const expectedX = workArea.x + workArea.width - bounds.width - windowMargin;
  const expectedY = workArea.y + workArea.height - bounds.height - windowMargin;
  if (bounds.x !== expectedX || bounds.y !== expectedY) {
    invalid("window is not at the work area's bottom-right corner");
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForReport(reportPath, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(reportPath, "utf8"));
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }
  throw new Error(`Timed out waiting for the macOS overlay report: ${lastError?.message ?? "unknown error"}`);
}

function stopProcess(child) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function verify(root) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agentpup-macos-"));
  const reportPath = path.join(temporaryRoot, "overlay-report.json");
  const executable = await findPackagedExecutable(root, "mac");
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    ["--demo", `--desktop-acceptance-report=${reportPath}`],
    {
      cwd: root,
      env: environment,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"]
    }
  );
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-8_000);
  });
  child.on("error", (error) => {
    errors = `${errors}\n${error.message}`.slice(-8_000);
  });
  try {
    validateMacOverlayReport(await waitForReport(reportPath));
    console.log("Packaged macOS overlay policy acceptance test passed.");
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${errors}`);
  } finally {
    stopProcess(child);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await verify(path.resolve(path.dirname(scriptPath), ".."));
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error))
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    console.error(`::error title=macOS overlay acceptance failed::${message}`);
    process.exitCode = 1;
  }
}
