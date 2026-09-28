import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyWindowsRelease } from "./verify-windows-release.mjs";

async function fixture(installerBytes) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentpup-release-"));
  const release = path.join(root, "release");
  await mkdir(path.join(release, "win-unpacked", "resources", "runtime"), {
    recursive: true
  });
  const installer = Buffer.alloc(installerBytes);
  installer.write("MZ");
  await writeFile(path.join(release, "AgentPup-Setup-0.1.0.exe"), installer);
  for (const relative of [
    "win-unpacked/AgentPup.exe",
    "win-unpacked/resources/app.asar",
    "win-unpacked/resources/runtime/collector.cjs",
    "win-unpacked/resources/runtime/hook.cjs",
    "win-unpacked/resources/runtime/integration.cjs"
  ]) {
    await writeFile(path.join(release, relative), "present");
  }
  return root;
}

describe("Windows release artifact verification", () => {
  it("accepts an installer with an embedded payload and required runtime files", async () => {
    const root = await fixture(32);

    await expect(
      verifyWindowsRelease({ root, version: "0.1.0", minimumInstallerBytes: 32 })
    ).resolves.toMatchObject({ installerBytes: 32, version: "0.1.0" });
  });

  it("rejects an incomplete NSIS stub", async () => {
    const root = await fixture(31);

    await expect(
      verifyWindowsRelease({ root, version: "0.1.0", minimumInstallerBytes: 32 })
    ).rejects.toThrow("too small");
  });
});
