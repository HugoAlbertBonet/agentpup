import { describe, expect, it } from "vitest";

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
});
