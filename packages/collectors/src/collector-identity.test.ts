import { describe, expect, it } from "vitest";

import { collectorPrefixForEnvironment } from "./collector-identity.js";

describe("collector environment identity", () => {
  it("names Windows-hosted WSL collectors by distribution", () => {
    expect(collectorPrefixForEnvironment("linux", "Ubuntu-24.04")).toBe(
      "wsl:Ubuntu-24.04"
    );
  });

  it("uses stable native identities on macOS and Linux", () => {
    expect(collectorPrefixForEnvironment("darwin", undefined)).toBe("native:darwin");
    expect(collectorPrefixForEnvironment("linux", undefined)).toBe("native:linux");
  });
});
