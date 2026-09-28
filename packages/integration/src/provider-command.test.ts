import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { providerVersion, resolveProviderExecutable } from "./provider-command.js";

describe("provider executable discovery", () => {
  it("finds the newest NVM provider when a non-login PATH omits it", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "claudepet-provider-"));
    const older = path.join(home, ".nvm", "versions", "node", "v20.1.0", "bin");
    const newer = path.join(home, ".nvm", "versions", "node", "v24.16.0", "bin");
    await mkdir(older, { recursive: true });
    await mkdir(newer, { recursive: true });
    await writeFile(path.join(older, "codex"), "#!/bin/sh\necho old\n");
    await writeFile(path.join(newer, "codex"), "#!/bin/sh\necho codex-cli 1.2.3\n");
    await chmod(path.join(older, "codex"), 0o700);
    await chmod(path.join(newer, "codex"), 0o700);

    expect(resolveProviderExecutable("codex", home, "/usr/bin")).toBe(
      path.join(newer, "codex")
    );
    expect(providerVersion("codex", home, "/usr/bin")).toBe("codex-cli 1.2.3");
  });

  it("prefers an executable already available on PATH", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "claudepet-provider-path-"));
    const bin = path.join(home, "bin");
    await mkdir(bin);
    await writeFile(path.join(bin, "claude"), "#!/bin/sh\necho 2.1.0 Claude Code\n");
    await chmod(path.join(bin, "claude"), 0o700);

    expect(resolveProviderExecutable("claude", home, bin)).toBe(path.join(bin, "claude"));
    expect(providerVersion("claude", home, bin)).toBe("2.1.0 Claude Code");
  });
});
