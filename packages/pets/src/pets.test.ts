import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getOpenPetsLayout,
  installOpenPetsZip,
  normalizePetPreferences,
  parseWebpDimensions,
  resolvePetAnimation,
  resolvePetVisualState,
  validateOpenPetsMetadata,
  validatePetPreferencesPatch,
  validatePackEntryPath
} from "./index.js";

const minimalPack = "UEsDBBQAAAAIALBaOl22alSAbgAAAJIAAAARAAAAdGVzdC1wZXQvcGV0Lmpzb25NzLEKg0AQhOFXObY2Fil9AxuxCOnPOMEFT5fdlUQk7+4dBJJ2vp85iEdqAjnMLwKnKtDIJnPcu5hQ6JYp9F+CPZTFeV0KtUlWdWh48ts3RV0aE+V8NwHeR59K9zfVLwzyy+5Qy2fdlgZoTq+fE1BLAwQUAAAACACwWjpd38jDERsAAAAeAAAAGQAAAHRlc3QtcGV0L3Nwcml0ZXNoZWV0LndlYnAL8nRzE2NgYAh3dQoIC7CI4GKAgP+sDO85GABQSwECFAMUAAAACACwWjpdtmpUgG4AAACSAAAAEQAAAAAAAAAAAAAAgAEAAAAAdGVzdC1wZXQvcGV0Lmpzb25QSwECFAMUAAAACACwWjpd38jDERsAAAAeAAAAGQAAAAAAAAAAAAAAgAGdAAAAdGVzdC1wZXQvc3ByaXRlc2hlZXQud2VicFBLBQYAAAAAAgACAIYAAADvAAAAAAA=";

describe("OpenPets compatibility", () => {
  it("accepts the documented V2 metadata and fixed sprite layout", () => {
    const metadata = validateOpenPetsMetadata({
      id: "desk-otter",
      displayName: "Desk Otter",
      description: "A small desktop companion.",
      spritesheetPath: "spritesheet.webp",
      spriteVersionNumber: 2
    });

    expect(metadata.id).toBe("desk-otter");
    expect(getOpenPetsLayout(metadata)).toEqual({
      version: 2,
      frameWidth: 192,
      frameHeight: 208,
      columns: 8,
      rows: 11
    });
  });

  it("rejects executable, remote, and mismatched metadata", () => {
    expect(() =>
      validateOpenPetsMetadata({
        id: "bad pet",
        displayName: "Bad",
        description: "Bad pack",
        spritesheetPath: "https://example.test/pet.webp"
      })
    ).toThrow(/id/i);
    expect(() =>
      validateOpenPetsMetadata({
        id: "safe-pet",
        displayName: "Safe",
        description: "Bad pack",
        spritesheetPath: "sprite.svg"
      })
    ).toThrow(/spritesheetPath/i);
  });

  it("maps aggregate agent state to OpenPets animation rows", () => {
    expect(resolvePetAnimation("idle")).toMatchObject({ row: 0, frames: 6 });
    expect(resolvePetAnimation("working")).toMatchObject({
      row: 7,
      frames: 6,
      iterations: "infinite"
    });
    expect(resolvePetAnimation("needs-you")).toMatchObject({ row: 3, frames: 4 });
    expect(resolvePetAnimation("ready")).toEqual(resolvePetAnimation("idle"));
  });

  it("gives human requests priority and still shows an otherwise ready result", () => {
    expect(resolvePetVisualState({ working: 2, needsYou: 1, resultsReady: 3, unknown: 1 })).toBe("needs-you");
    expect(resolvePetVisualState({ working: 2, needsYou: 0, resultsReady: 3, unknown: 1 })).toBe("working");
    expect(resolvePetVisualState({ working: 0, needsYou: 0, resultsReady: 3, unknown: 1 })).toBe("ready");
    expect(resolvePetVisualState({ working: 0, needsYou: 0, resultsReady: 0, unknown: 1 })).toBe("unknown");
    expect(resolvePetVisualState({ working: 0, needsYou: 0, resultsReady: 0, unknown: 0 })).toBe("idle");
  });

  it("normalizes only the two files allowed in an OpenPets zip", () => {
    expect(validatePackEntryPath("pet.json")).toEqual({
      isDirectory: false,
      outputName: "pet.json"
    });
    expect(validatePackEntryPath("desk-otter/spritesheet.webp")).toEqual({
      isDirectory: false,
      outputName: "spritesheet.webp"
    });
    expect(validatePackEntryPath("desk-otter/")).toEqual({
      isDirectory: true
    });
    expect(() => validatePackEntryPath("../pet.json")).toThrow(/unsafe/i);
    expect(() => validatePackEntryPath("desk-otter/script.js")).toThrow(/unexpected/i);
    expect(() => validatePackEntryPath("a/b/pet.json")).toThrow(/root/i);
  });

  it("reads bounded V2 spritesheet dimensions from WebP metadata", () => {
    const data = Buffer.alloc(30);
    data.write("RIFF", 0, "ascii");
    data.writeUInt32LE(22, 4);
    data.write("WEBP", 8, "ascii");
    data.write("VP8X", 12, "ascii");
    data.writeUInt32LE(10, 16);
    data[24] = 0xff;
    data[25] = 0x05;
    data[27] = 0xef;
    data[28] = 0x08;

    expect(parseWebpDimensions(data)).toEqual({ width: 1536, height: 2288 });
    expect(() => parseWebpDimensions(Buffer.from("not a webp"))).toThrow(/WebP/i);
  });

  it("installs and atomically replaces a wrapped OpenPets zip", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claudepet-pets-"));
    const zipPath = path.join(root, "pet.zip");
    const libraryPath = path.join(root, "library");
    try {
      await writeFile(zipPath, Buffer.from(minimalPack, "base64"));
      const first = await installOpenPetsZip(zipPath, libraryPath);
      const replacement = await installOpenPetsZip(zipPath, libraryPath);
      expect(first.id).toBe("test-pet");
      expect(replacement.layout.version).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("normalizes persisted pet display preferences", () => {
    expect(normalizePetPreferences(undefined)).toEqual({
      petEnabled: true,
      petScale: 0.67,
      animationsEnabled: true,
      statusScale: 1,
      statusFontSize: 13,
      statusLineGap: 9,
      maxFinishedAgents: 5
    });
    expect(normalizePetPreferences({
      petEnabled: false,
      petScale: 0.82,
      animationsEnabled: false,
      statusScale: 1.2,
      statusFontSize: 16,
      statusLineGap: 12,
      maxFinishedAgents: 3
    })).toEqual({
      petEnabled: false,
      petScale: 0.82,
      animationsEnabled: false,
      statusScale: 1.2,
      statusFontSize: 16,
      statusLineGap: 12,
      maxFinishedAgents: 3
    });
    expect(normalizePetPreferences({ petScale: 12 })).toMatchObject({ petScale: 0.67 });
  });

  it("accepts only bounded pet preference updates from renderer IPC", () => {
    expect(validatePetPreferencesPatch({ petScale: 1, petEnabled: false })).toEqual({
      petScale: 1,
      petEnabled: false
    });
    expect(() => validatePetPreferencesPatch({ petScale: 1.01 })).toThrow(/scale/i);
    expect(() => validatePetPreferencesPatch({ animationsEnabled: "yes" })).toThrow(/animations/i);
    expect(() => validatePetPreferencesPatch({ unexpected: true })).toThrow(/unexpected/i);
    expect(validatePetPreferencesPatch({
      statusScale: 1.5,
      statusFontSize: 20,
      statusLineGap: 18
    })).toEqual({ statusScale: 1.5, statusFontSize: 20, statusLineGap: 18 });
    expect(() => validatePetPreferencesPatch({ statusScale: 1.51 })).toThrow(/bar size/i);
    expect(() => validatePetPreferencesPatch({ statusFontSize: 9 })).toThrow(/font/i);
    expect(() => validatePetPreferencesPatch({ statusLineGap: 19 })).toThrow(/spacing/i);
    expect(validatePetPreferencesPatch({ maxFinishedAgents: 0 })).toEqual({ maxFinishedAgents: 0 });
    expect(validatePetPreferencesPatch({ maxFinishedAgents: 20 })).toEqual({ maxFinishedAgents: 20 });
    expect(() => validatePetPreferencesPatch({ maxFinishedAgents: 21 })).toThrow(/finished/i);
    expect(() => validatePetPreferencesPatch({ maxFinishedAgents: 1.5 })).toThrow(/finished/i);
  });
});
