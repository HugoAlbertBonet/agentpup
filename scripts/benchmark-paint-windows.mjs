import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "performance-results", "windows-paint-ready.json");

function runLauncher(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "start-windows.mjs"), ...arguments_], {
      cwd: root,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Windows launcher exited with ${code}`));
    });
  });
}

async function waitForReport() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      return await readFile(reportPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Paint benchmark did not finish within 30 seconds");
}

try {
  await rm(reportPath, { force: true });
  await runLauncher([
    "--benchmark-idle",
    `--paint-benchmark-report=${reportPath}`
  ]);
  process.stdout.write(await waitForReport());
} finally {
  await runLauncher([]);
}
