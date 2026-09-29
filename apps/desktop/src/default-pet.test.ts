import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { readInstalledPet } from "../../../packages/pets/src/index.js";

const runtime = new URL("../../../pets/agentpup/runtime/", import.meta.url);

describe("original bundled AgentPup design", () => {
  it("is a valid self-contained V2 appearance pack", async () => {
    const pet = await readInstalledPet(runtime.pathname, "agentpup");

    expect(pet.displayName).toBe("AgentPup");
    expect(pet.description).toMatch(/attention/i);
    expect(pet.layout).toEqual({
      version: 2,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 11
    });
  });

  it("bundles the reviewed runtime sheet without a divergent copy", async () => {
    const [runtimeSheet, bundledSheet] = await Promise.all([
      readFile(new URL("spritesheet.webp", runtime)),
      readFile(new URL("../renderer/assets/default-pet-spritesheet.webp", import.meta.url))
    ]);

    expect(bundledSheet.equals(runtimeSheet)).toBe(true);
  });

  it("keeps editable source, generation disclosure, export steps, and license", async () => {
    const [sourceReadme, notes, license, main, html, notices] = await Promise.all([
      readFile(new URL("../../../pets/agentpup/source/README.md", import.meta.url), "utf8"),
      readFile(new URL("../../../pets/agentpup/source/design-notes.md", import.meta.url), "utf8"),
      readFile(new URL("../../../pets/agentpup/source/LICENSE", import.meta.url), "utf8"),
      readFile(new URL("./main.ts", import.meta.url), "utf8"),
      readFile(new URL("../renderer/index.html", import.meta.url), "utf8"),
      readFile(new URL("../../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8")
    ]);

    expect(sourceReadme).toContain("OpenAI image generation");
    expect(sourceReadme).toContain("export.mjs");
    expect(notes).toContain("Needs you");
    expect(license).toContain("MIT License");
    expect(main).toContain('displayName: "AgentPup"');
    expect(main).not.toContain("Hoodie Cat");
    expect(html).toContain('<span id="pet-name" class="pet-name">AgentPup</span>');
    expect(notices).not.toContain("Hoodie Cat");
  });
});
