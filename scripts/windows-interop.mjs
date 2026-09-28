import { constants, accessSync } from "node:fs";
import path from "node:path";

export function createWindowsLaunch(interopRegistered, executablePath, arguments_) {
  return interopRegistered
    ? { executable: executablePath, arguments: [...arguments_] }
    : { executable: "/init", arguments: [executablePath, ...arguments_] };
}

export function resolveWindowsExecutable(name, pathValue = process.env.PATH ?? "") {
  for (const directory of pathValue.split(path.delimiter)) {
    if (directory.length === 0) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH.
    }
  }
  return null;
}
