export interface LoginItemOptions {
  readonly platform: NodeJS.Platform;
  readonly enabled: boolean;
  readonly isPackaged: boolean;
  readonly executablePath: string;
  readonly applicationPath: string;
  readonly wslDistro: string | undefined;
}

export interface LoginItemSettings {
  readonly openAtLogin: boolean;
  readonly path: string;
  readonly args: string[];
}

const validWslDistro = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveWslDistro(
  argv: readonly string[],
  environmentValue: string | undefined
): string | undefined {
  if (environmentValue !== undefined && validWslDistro.test(environmentValue)) {
    return environmentValue;
  }
  const prefixes = ["--agentpup-wsl-distro=", "--claudepet-wsl-distro="];
  const prefix = prefixes.find((candidate) => argv.some((value) => value.startsWith(candidate)));
  const argument = prefix === undefined ? undefined : argv.find((value) => value.startsWith(prefix));
  const value = prefix === undefined ? undefined : argument?.slice(prefix.length);
  return value !== undefined && validWslDistro.test(value) ? value : undefined;
}

export function createLoginItemSettings(
  options: LoginItemOptions
): LoginItemSettings | null {
  if (options.platform !== "win32") return null;
  const args = options.isPackaged ? [] : [options.applicationPath];
  if (options.wslDistro !== undefined) {
    args.push(`--agentpup-wsl-distro=${options.wslDistro}`);
  }
  return {
    openAtLogin: options.enabled,
    path: options.executablePath,
    args
  };
}
