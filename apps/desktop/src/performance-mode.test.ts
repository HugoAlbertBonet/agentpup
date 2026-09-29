import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("performance comparison mode", () => {
  it("overrides animation preferences in memory without persisting them", async () => {
    const main = await readFile(new URL("./main.ts", import.meta.url), "utf8");

    expect(main).toContain('process.argv.includes("--benchmark-animations=off")');
    expect(main).toContain("petPreferences = { ...petPreferences, animationsEnabled: false }");
    expect(main).toContain('process.argv.includes("--benchmark-idle")');
    expect(main).toContain('process.argv.includes("--benchmark-working")');
    expect(main).toContain('ipcMain.on("benchmark:paint-ack"');

    const renderer = await readFile(new URL("./renderer.ts", import.meta.url), "utf8");
    expect(renderer).toContain("onPaintBenchmark");
    expect(renderer).toMatch(/requestAnimationFrame\(\(\) =>\s*requestAnimationFrame/s);
  });
});
