import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Windows release configuration", () => {
  it("builds an NSIS installer with unpacked WSL runtime assets", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8")
    ) as Record<string, any>;

    expect(packageJson.scripts["package:windows"]).not.toContain("--dir");
    expect(packageJson.scripts["package:windows"]).toContain("verify-windows-release.mjs");
    expect(packageJson.scripts["package:windows"]).toContain("--publish never");
    expect(packageJson.scripts["package:windows:dir"]).toContain("--dir");
    expect(packageJson.version).toBe("0.1.0");
    expect(packageJson.author).toBe("AgentPup contributors");
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.build.appId).toBe("dev.agentpup.desktop");
    expect(packageJson.build.productName).toBe("AgentPup");
    expect(packageJson.build.win.target).toContain("nsis");
    expect(packageJson.build.win.icon).toBe(
      "apps/desktop/renderer/assets/tray-icon.png"
    );
    expect(packageJson.build.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "dist/collector.cjs", to: "runtime/collector.cjs" }),
        expect.objectContaining({ from: "dist/hook.cjs", to: "runtime/hook.cjs" }),
        expect.objectContaining({ from: "dist/integration.cjs", to: "runtime/integration.cjs" })
      ])
    );
  });

  it("publishes the source under the MIT license", async () => {
    const license = await readFile(
      new URL("../../../LICENSE", import.meta.url),
      "utf8"
    );

    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 Hugo Albert Bonet");
    expect(license).toContain("Permission is hereby granted, free of charge");
  });

  it("checks and packages on a native Windows CI runner", async () => {
    const workflow = await readFile(
      new URL("../../../.github/workflows/windows-release.yml", import.meta.url),
      "utf8"
    );

    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm run package:windows");
    expect(workflow).toContain("scripts/smoke-windows-installer.ps1");
    expect(workflow).toContain("Tee-Object -FilePath package-windows.log");
    expect(workflow).toContain("name: AgentPup-Windows-package-log");
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("actions/upload-artifact@v4");
  });

  it("builds unsigned macOS and Linux artifacts on native CI runners", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8")
    ) as Record<string, any>;
    const workflow = await readFile(
      new URL("../../../.github/workflows/cross-platform.yml", import.meta.url),
      "utf8"
    );

    expect(packageJson.scripts["package:mac"]).toContain("--mac zip");
    expect(packageJson.scripts["package:linux"]).toContain("--linux AppImage");
    expect(packageJson.build.mac.target).toContain("zip");
    expect(packageJson.build.linux.target).toContain("AppImage");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("scripts/smoke-unix-release.mjs");
    expect(workflow).toContain("actions/upload-artifact@v4");
  });
});
