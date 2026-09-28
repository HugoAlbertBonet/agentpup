import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronExecutable from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const childEnvironment = { ...process.env };

// Some agent hosts set this for their own Electron subprocesses. It must not leak
// into AgentPup or Electron will execute the app as a plain Node.js program.
delete childEnvironment.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExecutable, [root, ...process.argv.slice(2)], {
  cwd: root,
  env: childEnvironment,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(`Unable to start Electron: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`Electron stopped after receiving ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
