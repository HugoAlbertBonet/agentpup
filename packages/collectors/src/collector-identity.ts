export function collectorPrefixForEnvironment(
  platform: NodeJS.Platform,
  wslDistro: string | undefined
): string {
  return wslDistro === undefined ? `native:${platform}` : `wsl:${wslDistro}`;
}
