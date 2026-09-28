import { describe, expect, it } from "vitest";
import path from "node:path";

import { createScriptLaunch, runtimeAssetPath, wslPathConversionLaunch } from "./runtime-launch.js";

describe("packaged runtime launch policy", () => {
  it("loads packaged runtime scripts from Electron resources", () => {
    const resourcesPath = "C:\\Program Files\\AgentPup\\resources";
    expect(runtimeAssetPath({ isPackaged: true, resourcesPath, moduleDirectory: "ignored" }, "collector.cjs")).toBe(path.join(resourcesPath, "runtime", "collector.cjs"));
    expect(runtimeAssetPath({ isPackaged: false, resourcesPath: "ignored", moduleDirectory: "/repo/dist" }, "collector.cjs")).toBe("/repo/dist/collector.cjs");
  });

  it("launches packaged scripts through a selected WSL distribution without a shell", () => {
    expect(createScriptLaunch("win32", "C:\\node.exe", "/mnt/c/runtime/integration.cjs", "Ubuntu", ["setup"])).toEqual({
      executable: "wsl.exe",
      arguments: ["--distribution", "Ubuntu", "--exec", "node", "/mnt/c/runtime/integration.cjs", "setup"]
    });
    expect(createScriptLaunch("linux", "/usr/bin/node", "/opt/claudepet/integration.cjs", undefined, ["doctor"])).toEqual({
      executable: "/usr/bin/node",
      arguments: ["/opt/claudepet/integration.cjs", "doctor"]
    });
  });

  it("builds a shell-free WSL path conversion command", () => {
    expect(wslPathConversionLaunch("C:\\Program Files\\Claudepet\\resources\\runtime\\collector.cjs", "Ubuntu")).toEqual({
      executable: "wsl.exe",
      arguments: ["--distribution", "Ubuntu", "--exec", "wslpath", "-u", "C:\\Program Files\\Claudepet\\resources\\runtime\\collector.cjs"]
    });
  });
});
