import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "renderer"), { recursive: true });

await Promise.all([
  build({
    entryPoints: [path.join(root, "apps/desktop/src/main.ts")],
    outfile: path.join(output, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron"],
    sourcemap: true,
    logLevel: "info"
  }),
  build({
    entryPoints: [path.join(root, "apps/desktop/src/preload.ts")],
    outfile: path.join(output, "preload.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron"],
    sourcemap: true,
    logLevel: "info"
  }),
  build({
    entryPoints: [path.join(root, "apps/collector/src/main.ts")],
    outfile: path.join(output, "collector.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    sourcemap: true,
    logLevel: "info"
  }),
  build({
    entryPoints: [path.join(root, "apps/hook/src/main.ts")],
    outfile: path.join(output, "hook.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    sourcemap: true,
    logLevel: "info"
  }),
  build({
    entryPoints: [path.join(root, "apps/integration/src/main.ts")],
    outfile: path.join(output, "integration.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    sourcemap: true,
    logLevel: "info"
  }),
  build({
    entryPoints: [path.join(root, "apps/desktop/src/renderer.ts")],
    outfile: path.join(output, "renderer/renderer.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "chrome142",
    sourcemap: true,
    logLevel: "info"
  }),
  cp(
    path.join(root, "apps/desktop/renderer/index.html"),
    path.join(output, "renderer/index.html")
  ),
  cp(
    path.join(root, "apps/desktop/renderer/styles.css"),
    path.join(output, "renderer/styles.css")
  ),
  cp(
    path.join(root, "apps/desktop/renderer/assets"),
    path.join(output, "renderer/assets"),
    { recursive: true }
  )
]);
