import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("sprite renderer CSS", () => {
  it("does not hold the transparent cell after a finite OpenPets animation", async () => {
    const css = await readFile(new URL("../renderer/styles.css", import.meta.url), "utf8");
    const spriteRule = css.match(/\.pet-sprite\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body;

    expect(spriteRule).toBeDefined();
    expect(spriteRule).toContain("animation-fill-mode: none");
    expect(spriteRule).not.toMatch(/animation:[^;]*\bforwards\b/);
  });
});
