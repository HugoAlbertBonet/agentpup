import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { createWindowsLaunch } from "./windows-interop.mjs";

describe("WSL Windows process launch", () => {
  it("uses normal interop when the binfmt handler is registered", () => {
    expect(createWindowsLaunch(true, "powershell.exe", ["-NoProfile"])).toEqual({
      executable: "powershell.exe",
      arguments: ["-NoProfile"]
    });
  });

  it("uses /init directly when the WSLInterop binfmt handler is missing", () => {
    expect(
      createWindowsLaunch(
        false,
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        ["-NoProfile"]
      )
    ).toEqual({
      executable: "/init",
      arguments: [
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        "-NoProfile"
      ]
    });
  });

  it("waits for the previous Electron process before restarting", async () => {
    const launcher = await readFile(new URL("./start-windows.mjs", import.meta.url), "utf8");

    expect(launcher).toContain("taskkill.exe");
    expect(launcher).toContain("$shutdownDeadline");
    expect(launcher).toContain("AgentPup did not stop before restart");
  });

  it("also retires the legacy LocalAppData development runtime", async () => {
    const launcher = await readFile(new URL("./start-windows.mjs", import.meta.url), "utf8");

    expect(launcher).toContain('$legacyDevelopmentRoot = Join-Path $env:LOCALAPPDATA "Claudepet\\development"');
    expect(launcher).toContain("$_.ExecutablePath.StartsWith($legacyDevelopmentRoot");
  });

  it("forwards the non-persistent animation benchmark override", async () => {
    const launcher = await readFile(new URL("./start-windows.mjs", import.meta.url), "utf8");

    expect(launcher).toContain("--benchmark-animations=off");
    expect(launcher).toContain("--benchmark-idle");
    expect(launcher).toContain("AGENTPUP_BENCHMARK_ARGUMENT");
  });
});
