import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const macDirectories = ["mac", "mac-arm64", "mac-x64", "mac-universal"];
const linuxDirectories = ["linux-unpacked", "linux-arm64-unpacked"];

async function firstFile(paths) {
  for (const candidate of paths) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

export async function findPackagedExecutable(root, platform) {
  const release = path.join(root, "release");
  const candidates =
    platform === "mac"
      ? macDirectories.map((directory) =>
          path.join(release, directory, "AgentPup.app", "Contents", "MacOS", "AgentPup")
        )
      : platform === "linux"
        ? linuxDirectories.map((directory) => path.join(release, directory, "agentpup"))
        : [];
  const executable = await firstFile(candidates);
  if (executable === undefined) {
    throw new Error(`The unpacked ${platform} AgentPup executable was not found.`);
  }
  return executable;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function smoke(root, platform) {
  const executable = await findPackagedExecutable(root, platform);
  const command = platform === "linux" ? "xvfb-run" : executable;
  const args = platform === "linux" ? ["-a", executable, "--demo"] : ["--demo"];
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
  const exit = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const early = await Promise.race([exit, delay(8_000).then(() => null)]);
  if (early !== null) {
    const reason = "error" in early
      ? early.error.message
      : `exit code ${early.code ?? "unknown"}${early.signal === null ? "" : ` (${early.signal})`}`;
    throw new Error(`The packaged ${platform} app stopped during launch: ${reason}\n${errors}`);
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  await Promise.race([exit, delay(5_000)]);
  console.log(`Packaged ${platform} AgentPup launch smoke test passed.`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === scriptPath) {
  const platform = process.argv[2];
  if (platform !== "mac" && platform !== "linux") {
    throw new Error("Usage: node scripts/smoke-unix-release.mjs <mac|linux>");
  }
  await smoke(path.resolve(path.dirname(scriptPath), ".."), platform);
}
