import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultMinimumInstallerBytes = 20 * 1024 * 1024;
const requiredFiles = [
  "win-unpacked/AgentPup.exe",
  "win-unpacked/resources/app.asar",
  "win-unpacked/resources/runtime/collector.cjs",
  "win-unpacked/resources/runtime/hook.cjs",
  "win-unpacked/resources/runtime/integration.cjs"
];

export async function verifyWindowsRelease({
  root,
  version,
  minimumInstallerBytes = defaultMinimumInstallerBytes
}) {
  const releaseRoot = path.join(root, "release");
  const installerPath = path.join(releaseRoot, `AgentPup-Setup-${version}.exe`);
  const installer = await stat(installerPath);
  if (!installer.isFile() || installer.size < minimumInstallerBytes) {
    throw new Error(
      `Windows installer is too small (${installer.size} bytes); the NSIS payload is incomplete.`
    );
  }
  const header = await readFile(installerPath, { encoding: null, flag: "r" });
  if (header[0] !== 0x4d || header[1] !== 0x5a) {
    throw new Error("Windows installer does not have an MZ executable header.");
  }
  for (const relative of requiredFiles) {
    const entry = await stat(path.join(releaseRoot, relative));
    if (!entry.isFile() || entry.size === 0) {
      throw new Error(`Windows release is missing required file: ${relative}`);
    }
  }
  return { version, installerPath, installerBytes: installer.size };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === scriptPath) {
  const root = path.resolve(path.dirname(scriptPath), "..");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const result = await verifyWindowsRelease({ root, version: packageJson.version });
  console.log(
    `Verified AgentPup ${result.version} Windows installer (${result.installerBytes} bytes).`
  );
}
