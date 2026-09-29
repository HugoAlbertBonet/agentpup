import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import electronExecutable from "electron";

import { findPackagedExecutable } from "./smoke-unix-release.mjs";

const executeFile = promisify(execFile);
const overlayWidth = 460;
const overlayHeight = 680;

export function parseWindowGeometries(output) {
  const geometries = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (key === "WINDOW") {
      if (current !== null) geometries.push(current);
      current = { windowId: value };
    } else if (current !== null && ["X", "Y", "WIDTH", "HEIGHT"].includes(key)) {
      current[key.toLowerCase()] = Number(value);
    }
  }
  if (current !== null) geometries.push(current);
  return geometries.filter(
    (geometry) =>
      typeof geometry.windowId === "string" &&
      [geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite)
  );
}

export function transparentTestPoint(overlay) {
  return { x: overlay.x + 10, y: overlay.y + 10 };
}

export function interactiveTestPoint(overlay) {
  return {
    x: overlay.x + overlay.width - 23,
    y: overlay.y + overlay.height - 17
  };
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(description, operation, timeoutMs = 10_000) {
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
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

function startProcess(command, args, root) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    detached: true,
    stdio: ["ignore", "ignore", "pipe"]
  });
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-8_000);
  });
  child.on("error", (error) => {
    errors = `${errors}\n${error.message}`.slice(-8_000);
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

async function click(point) {
  await executeFile("xdotool", ["mousemove", "--sync", String(point.x), String(point.y), "click", "1"]);
}

async function readClicks(clickPath) {
  try {
    return JSON.parse(await readFile(clickPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function verify(root) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "agentpup-x11-"));
  const readyPath = path.join(temporaryRoot, "probe-ready");
  const clickPath = path.join(temporaryRoot, "probe-clicks.json");
  const probePath = path.join(root, "scripts", "x11-click-probe.cjs");
  const executable = await findPackagedExecutable(root, "linux");
  const probe = startProcess(electronExecutable, [probePath, readyPath, clickPath], root);
  let agentpup;
  try {
    await waitFor("the X11 click probe", async () => {
      try {
        return (await readFile(readyPath, "utf8")) === "ready";
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
    });
    agentpup = startProcess(executable, ["--demo", "--ozone-platform=x11"], root);
    const overlay = await waitFor("the packaged AgentPup X11 window", async () => {
      const { stdout } = await executeFile("xdotool", [
        "search",
        "--onlyvisible",
        "--name",
        "^AgentPup$",
        "getwindowgeometry",
        "--shell"
      ]);
      return parseWindowGeometries(stdout).find(
        (geometry) => geometry.width === overlayWidth && geometry.height === overlayHeight
      );
    });
    await delay(1_000);

    await click(transparentTestPoint(overlay));
    await waitFor("an empty-overlay click to reach the background", async () =>
      (await readClicks(clickPath)).length === 1
    );

    await click(interactiveTestPoint(overlay));
    await delay(750);
    const clicks = await readClicks(clickPath);
    if (clicks.length !== 1) {
      throw new Error("The visible rotate control allowed its click to reach the background.");
    }
    console.log("Packaged Linux X11 shape and click-through acceptance test passed.");
  } catch (error) {
    const details = [probe.errors(), agentpup?.errors()].filter(Boolean).join("\n");
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${details}`);
  } finally {
    if (agentpup !== undefined) stopProcess(agentpup.child);
    stopProcess(probe.child);
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
    console.error(`::error title=Linux X11 overlay acceptance failed::${message}`);
    process.exitCode = 1;
  }
}
