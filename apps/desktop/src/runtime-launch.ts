import path from "node:path";

export interface RuntimeAssetContext {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly moduleDirectory: string;
}

export interface ScriptLaunch {
  readonly executable: string;
  readonly arguments: string[];
}

export function runtimeAssetPath(context: RuntimeAssetContext, name: string): string {
  return context.isPackaged
    ? path.join(context.resourcesPath, "runtime", name)
    : path.join(context.moduleDirectory, name);
}

export function createScriptLaunch(
  platform: NodeJS.Platform,
  nodePath: string,
  scriptPath: string,
  wslDistro: string | undefined,
  scriptArguments: readonly string[] = []
): ScriptLaunch {
  if (platform !== "win32") {
    return { executable: nodePath, arguments: [scriptPath, ...scriptArguments] };
  }
  return {
    executable: "wsl.exe",
    arguments: [
      ...(wslDistro === undefined ? [] : ["--distribution", wslDistro]),
      "--exec",
      "node",
      scriptPath,
      ...scriptArguments
    ]
  };
}

export function wslPathConversionLaunch(
  windowsPath: string,
  wslDistro: string | undefined
): ScriptLaunch {
  return {
    executable: "wsl.exe",
    arguments: [
      ...(wslDistro === undefined ? [] : ["--distribution", wslDistro]),
      "--exec",
      "wslpath",
      "-u",
      windowsPath
    ]
  };
}
