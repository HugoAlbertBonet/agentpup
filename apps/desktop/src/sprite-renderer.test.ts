import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("sprite renderer CSS", () => {
  it("does not ask Chromium to continuously sample sprite animations", async () => {
    const css = await readFile(new URL("../renderer/styles.css", import.meta.url), "utf8");
    const spriteRule = css.match(/\.pet-sprite\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body;

    expect(spriteRule).toBeDefined();
    expect(spriteRule).not.toContain("animation:");
    expect(css).not.toContain("@keyframes pet-frames");
  });
});
