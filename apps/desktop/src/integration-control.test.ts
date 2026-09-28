import { describe, expect, it } from "vitest";

import { parseIntegrationStatus, shouldOpenIntegrationSetup } from "./integration-control.js";

describe("desktop integration status protocol", () => {
  it("accepts the metadata-only versioned status shape", () => {
    const source = JSON.stringify({
      protocolVersion: 1,
      environment: "wsl",
      providers: [
        {
          provider: "codex",
          version: "codex-cli 0.157.1",
          installed: true,
          valid: true
        },
        {
          provider: "claude-code",
          version: null,
          installed: false,
          valid: true
        }
      ]
    });

    expect(parseIntegrationStatus(source)).toMatchObject({
      protocolVersion: 1,
      environment: "wsl",
      providers: [
        { provider: "codex", installed: true },
        { provider: "claude-code", installed: false }
      ]
    });
  });

  it("rejects invalid protocol output", () => {
    expect(parseIntegrationStatus("not json")).toBeNull();
    expect(
      parseIntegrationStatus(
        JSON.stringify({ protocolVersion: 2, environment: "wsl", providers: [] })
      )
    ).toBeNull();
    expect(
      parseIntegrationStatus(
        JSON.stringify({
          protocolVersion: 1,
          environment: "wsl",
          providers: [{ provider: "unknown", version: null, installed: true, valid: true }]
        })
      )
    ).toBeNull();
  });

  it("opens first-run setup only when provider hooks need attention", () => {
    const healthy = parseIntegrationStatus(
      JSON.stringify({
        protocolVersion: 1,
        environment: "wsl",
        providers: [
          { provider: "codex", version: "installed", installed: true, valid: true },
          { provider: "claude-code", version: "installed", installed: true, valid: true }
        ]
      })
    )!;
    expect(shouldOpenIntegrationSetup(healthy)).toBe(false);
    expect(
      shouldOpenIntegrationSetup({
        ...healthy,
        providers: healthy.providers.map((provider) =>
          provider.provider === "codex" ? { ...provider, installed: false } : provider
        )
      })
    ).toBe(true);
    expect(
      shouldOpenIntegrationSetup({
        ...healthy,
        providers: healthy.providers.map((provider) =>
          provider.provider === "claude-code" ? { ...provider, valid: false } : provider
        )
      })
    ).toBe(true);
  });
});
