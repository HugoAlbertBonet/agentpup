import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findPackagedExecutable } from "./smoke-unix-release.mjs";

function invalid(message) {
  throw new Error(`Invalid packaged Wayland overlay: ${message}`);
}

export function validateWaylandOverlayReport(report) {
  if (
    report?.schemaVersion !== 1 ||
    report.platform !== "linux" ||
    report.runtime !== "linux-wayland" ||
    report.corner !== "bottom-right" ||
    typeof report.trayCreated !== "boolean" ||
    report.startupControlSupported !== true
  ) {
    invalid("runtime or desktop controller was not initialized");
  }
  const policy = report.policy;
  if (
    policy?.alwaysOnTopSupported !== false ||
    policy.clickThrough !== false ||
    policy.shapedClickThrough !== false ||
    policy.focusable !== false
  ) {
    invalid("unsupported native Wayland capabilities were claimed");
  }
  const window = report.window;
  const bounds = window?.bounds;
  const workArea = window?.workArea;
  if (
    window?.visible !== true ||
    window.focused !== false ||
    window.focusable !== false ||
    window.alwaysOnTop !== false ||
    window.hasShadow !== false
  ) {
    invalid("window activation, topmost, or shadow state differs");
  }
  if (
    bounds?.width !== 460 ||
    bounds?.height !== 680 ||
    ![bounds.x, bounds.y, workArea?.x, workArea?.y, workArea?.width, workArea?.height].every(
      Number.isFinite
    )
  ) {
    invalid("window or compositor work-area geometry is malformed");
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(description, operation, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result !== undefined && result !== false) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}: ${lastError?.message ?? "unknown error"}`);
}

function startProcess(command, arguments_, options) {
  const child = spawn(command, arguments_, {
    cwd: options.root,
    env: options.environment,
    detached: true,
    stdio: ["ignore", "ignore", "pipe"]
  });
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-12_000);
  });
  child.on("error", (error) => {
    errors = `${errors}\n${error.message}`.slice(-12_000);
  });
  return { child, errors: () => errors };
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
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agentpup-wayland-"));
  await chmod(temporaryRoot, 0o700);
  const socketName = "agentpup-ci-wayland";
  const socketPath = path.join(temporaryRoot, socketName);
  const reportPath = path.join(temporaryRoot, "overlay-report.json");
  const baseEnvironment = {
    ...process.env,
    XDG_RUNTIME_DIR: temporaryRoot,
    XDG_SESSION_TYPE: "wayland",
    WAYLAND_DISPLAY: socketName
  };
  delete baseEnvironment.ELECTRON_RUN_AS_NODE;
  delete baseEnvironment.DISPLAY;
  const weston = startProcess(
    "weston",
    [
      "--backend=headless-backend.so",
      `--socket=${socketName}`,
      "--idle-time=0",
      "--width=1280",
      "--height=1024"
    ],
    { root, environment: baseEnvironment }
  );
  let agentpup;
  try {
    await waitFor("the headless Wayland compositor", async () => {
      try {
        return (await stat(socketPath)).isSocket();
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
    });
    const executable = await findPackagedExecutable(root, "linux");
    agentpup = startProcess(
      executable,
      [
        "--demo",
        "--ozone-platform=wayland",
        `--desktop-acceptance-report=${reportPath}`
      ],
      { root, environment: baseEnvironment }
    );
    const report = await waitFor("the packaged native Wayland overlay report", async () => {
      try {
        return JSON.parse(await readFile(reportPath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return false;
        throw error;
      }
    });
    validateWaylandOverlayReport(report);
    console.log("Packaged native Wayland limited-policy acceptance test passed.");
  } catch (error) {
    const details = [weston.errors(), agentpup?.errors()].filter(Boolean).join("\n");
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${details}`);
  } finally {
    if (agentpup !== undefined) stopProcess(agentpup.child);
    stopProcess(weston.child);
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
    console.error(`::error title=Wayland overlay acceptance failed::${message}`);
    process.exitCode = 1;
  }
}
