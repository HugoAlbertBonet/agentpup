export type IntegrationEnvironment = "wsl" | "native";
export type IntegrationProvider = "codex" | "claude-code";

export interface ProviderIntegrationStatus {
  readonly provider: IntegrationProvider;
  readonly version: string | null;
  readonly installed: boolean;
  readonly valid: boolean;
}

export interface IntegrationStatus {
  readonly protocolVersion: 1;
  readonly environment: IntegrationEnvironment;
  readonly providers: ProviderIntegrationStatus[];
}

export interface IntegrationActionResult {
  readonly message: string;
  readonly status: IntegrationStatus;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseIntegrationStatus(source: string): IntegrationStatus | null {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  const status = object(value);
  if (
    status?.protocolVersion !== 1 ||
    (status.environment !== "wsl" && status.environment !== "native") ||
    !Array.isArray(status.providers)
  ) {
    return null;
  }
  const providers: ProviderIntegrationStatus[] = [];
  for (const candidate of status.providers) {
    const provider = object(candidate);
    if (
      provider === undefined ||
      (provider.provider !== "codex" && provider.provider !== "claude-code") ||
      (provider.version !== null && typeof provider.version !== "string") ||
      typeof provider.installed !== "boolean" ||
      typeof provider.valid !== "boolean"
    ) {
      return null;
    }
    providers.push({
      provider: provider.provider,
      version: provider.version,
      installed: provider.installed,
      valid: provider.valid
    });
  }
  return {
    protocolVersion: 1,
    environment: status.environment,
    providers
  };
}

export function shouldOpenIntegrationSetup(status: IntegrationStatus): boolean {
  return status.providers.some((provider) => !provider.valid || !provider.installed);
}
