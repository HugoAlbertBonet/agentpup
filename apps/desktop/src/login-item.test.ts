import { describe, expect, it } from "vitest";

import { createLoginItemSettings, resolveWslDistro } from "./login-item.js";

describe("Windows login item", () => {
  it("registers the deployed development app and selected WSL distro", () => {
    expect(
      createLoginItemSettings({
        platform: "win32",
        enabled: true,
        isPackaged: false,
        executablePath: "C:\\AgentPup\\electron.exe",
        applicationPath: "C:\\AgentPup\\app",
        wslDistro: "Ubuntu"
      })
    ).toEqual({
      openAtLogin: true,
      path: "C:\\AgentPup\\electron.exe",
      args: ["C:\\AgentPup\\app", "--agentpup-wsl-distro=Ubuntu"]
    });
  });

  it("uses the packaged executable directly and ignores unsupported platforms", () => {
    expect(
      createLoginItemSettings({
        platform: "win32",
        enabled: true,
        isPackaged: true,
        executablePath: "C:\\Program Files\\AgentPup\\AgentPup.exe",
        applicationPath: "ignored",
        wslDistro: undefined
      })
    ).toEqual({
      openAtLogin: true,
      path: "C:\\Program Files\\AgentPup\\AgentPup.exe",
      args: []
    });
    expect(
      createLoginItemSettings({
        platform: "linux",
        enabled: true,
        isPackaged: false,
        executablePath: "/usr/bin/electron",
        applicationPath: "/app",
        wslDistro: undefined
      })
    ).toBeNull();
  });

  it("restores the WSL distro from a login argument", () => {
    expect(
      resolveWslDistro(["electron.exe", "app", "--agentpup-wsl-distro=Ubuntu-24.04"], undefined)
    ).toBe("Ubuntu-24.04");
    expect(resolveWslDistro([], "Ubuntu")).toBe("Ubuntu");
    expect(resolveWslDistro(["--agentpup-wsl-distro=bad name"], undefined)).toBeUndefined();
    expect(resolveWslDistro(["--claudepet-wsl-distro=Ubuntu-Legacy"], undefined)).toBe("Ubuntu-Legacy");
  });
});
