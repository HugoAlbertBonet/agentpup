import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findPackagedExecutable } from "./smoke-unix-release.mjs";

describe("Unix packaged application smoke test", () => {
  it("finds macOS application executables for either runner architecture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentpup-mac-release-"));
    const executable = path.join(
      root,
      "release",
      "mac-arm64",
      "AgentPup.app",
      "Contents",
      "MacOS",
      "AgentPup"
    );
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, "present");

    await expect(findPackagedExecutable(root, "mac")).resolves.toBe(executable);
  });

  it("finds the Linux unpacked executable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentpup-linux-release-"));
    const executable = path.join(root, "release", "linux-unpacked", "agentpup");
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, "present");

    await expect(findPackagedExecutable(root, "linux")).resolves.toBe(executable);
  });
});
