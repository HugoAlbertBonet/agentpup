import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLinuxAutostartEntry,
  configureLinuxAutostart,
  createLoginItemSettings,
  isLinuxAutostartEnabled,
  linuxAutostartFilePath,
  resolveLinuxAutostartExecutable,
  resolveWslDistro
} from "./login-item.js";

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

  it("uses the packaged executable directly", () => {
  });

  it("uses Electron's main app login service on macOS", () => {
    expect(
      createLoginItemSettings({
        platform: "darwin",
        enabled: true,
        isPackaged: true,
        executablePath: "/Applications/AgentPup.app/Contents/MacOS/AgentPup",
        applicationPath: "ignored",
        wslDistro: undefined
      })
    ).toEqual({ openAtLogin: true });
    expect(
      createLoginItemSettings({
        platform: "darwin",
        enabled: false,
        isPackaged: true,
        executablePath: "/Applications/AgentPup.app/Contents/MacOS/AgentPup",
        applicationPath: "ignored",
        wslDistro: undefined
      })
    ).toEqual({ openAtLogin: false });
  });

  it("can remove the Windows login item with the same bounded registration", () => {
    expect(
      createLoginItemSettings({
        platform: "win32",
        enabled: false,
        isPackaged: true,
        executablePath: "C:\\Program Files\\AgentPup\\AgentPup.exe",
        applicationPath: "ignored",
        wslDistro: undefined
      })
    ).toEqual({
      openAtLogin: false,
      path: "C:\\Program Files\\AgentPup\\AgentPup.exe",
      args: []
    });
  });

  it("leaves Linux startup to the freedesktop autostart adapter", () => {
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

  it("builds a bounded Linux autostart entry using the stable AppImage path", () => {
    expect(
      resolveLinuxAutostartExecutable("/tmp/.mount_Agent/agentpup", "/home/me/Agent Pup.AppImage")
    ).toBe("/home/me/Agent Pup.AppImage");
    expect(resolveLinuxAutostartExecutable("/usr/bin/agentpup", undefined)).toBe(
      "/usr/bin/agentpup"
    );
    expect(linuxAutostartFilePath("/home/me", undefined)).toBe(
      "/home/me/.config/autostart/dev.agentpup.desktop"
    );
    expect(linuxAutostartFilePath("/home/me", "/custom/config")).toBe(
      "/custom/config/autostart/dev.agentpup.desktop"
    );

    expect(
      createLinuxAutostartEntry({
        executablePath: "/home/me/Agent Pup.AppImage",
        applicationPath: undefined
      })
    ).toContain('Exec="/home/me/Agent Pup.AppImage"');
    expect(
      createLinuxAutostartEntry({
        executablePath: "/usr/bin/electron",
        applicationPath: "/home/me/agent$pup"
      })
    ).toContain('Exec="/usr/bin/electron" "/home/me/agent\\$pup"');
  });

  it("atomically enables and removes only AgentPup's Linux autostart file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentpup-autostart-"));
    const filePath = path.join(root, "autostart", "dev.agentpup.desktop");
    const entry = createLinuxAutostartEntry({
      executablePath: "/opt/AgentPup.AppImage",
      applicationPath: undefined
    });
    try {
      expect(await isLinuxAutostartEnabled(filePath, entry)).toBe(false);
      await configureLinuxAutostart(filePath, entry, true);
      expect(await readFile(filePath, "utf8")).toBe(entry);
      expect(await isLinuxAutostartEnabled(filePath, entry)).toBe(true);
      await configureLinuxAutostart(filePath, entry, false);
      expect(await isLinuxAutostartEnabled(filePath, entry)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
