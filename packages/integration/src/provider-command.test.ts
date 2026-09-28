import { link, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { providerVersion, resolveProviderExecutable } from "./provider-command.js";

describe("provider executable discovery", () => {
  const executableName = (name: string): string =>
    process.platform === "win32" ? `${name}.exe` : name;

  it("finds the newest NVM provider when a non-login PATH omits it", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "claudepet-provider-"));
    const older = path.join(home, ".nvm", "versions", "node", "v20.1.0", "bin");
    const newer = path.join(home, ".nvm", "versions", "node", "v24.16.0", "bin");
    await mkdir(older, { recursive: true });
    await mkdir(newer, { recursive: true });
    await link(process.execPath, path.join(older, executableName("codex")));
    await link(process.execPath, path.join(newer, executableName("codex")));

    expect(resolveProviderExecutable("codex", home, "/usr/bin")).toBe(
      path.join(newer, executableName("codex"))
    );
    expect(providerVersion("codex", home, "/usr/bin")).toBe(process.version);
  });

  it("prefers an executable already available on PATH", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "claudepet-provider-path-"));
    const bin = path.join(home, "bin");
    await mkdir(bin);
    await link(process.execPath, path.join(bin, executableName("claude")));

    expect(resolveProviderExecutable("claude", home, bin)).toBe(
      path.join(bin, executableName("claude"))
    );
    expect(providerVersion("claude", home, bin)).toBe(process.version);
  });
});
