import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const packDirectory = path.dirname(sourceDirectory);
const repositoryRoot = path.resolve(packDirectory, "../..");
const mastersDirectory = path.join(sourceDirectory, "masters");
const runtimeDirectory = path.join(packDirectory, "runtime");
const bundledSheet = path.join(
  repositoryRoot,
  "apps/desktop/renderer/assets/default-pet-spritesheet.webp"
);
const workDirectory = mkdtempSync(path.join(tmpdir(), "agentpup-export-"));
const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

function runFfmpeg(arguments_) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...arguments_], {
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `ffmpeg exited with ${result.status}`);
  }
}

const poses = {
  neutral: "neutral.png",
  walk: "walk-right.png",
  attention: "attention.png",
  ready: "ready.png",
  concern: "concern.png",
  working: "working.png"
};

for (const filename of Object.values(poses)) {
  const input = path.join(mastersDirectory, filename);
  if (!existsSync(input)) {
    throw new Error(`Missing pose master: ${input}`);
  }
}

const rows = [
  ["neutral", [0, -1, -2, -1, 0, 1, 0, 0]],
  ["walk", [0, -2, -4, -2, 0, -2, -4, -2]],
  ["walk-left", [0, -2, -4, -2, 0, -2, -4, -2]],
  ["attention", [0, -2, 0, -1, 0, 0, 0, 0]],
  ["ready", [8, 0, -10, 0, 8, 8, 8, 8]],
  ["concern", [0, 1, 2, 1, 0, 1, 2, 1]],
  ["concern", [0, 1, 0, 1, 0, 1, 0, 1]],
  ["working", [0, -1, -2, -1, 0, 1, 0, -1]],
  ["working", [0, -1, 0, -1, 0, -1, 0, -1]],
  ["neutral", [0, -1, 0, 1, 0, -1, 0, 1]],
  ["neutral", [1, 0, -1, 0, 1, 0, -1, 0]]
];

try {
  mkdirSync(runtimeDirectory, { recursive: true });

  let frameIndex = 0;
  for (const [pose, verticalOffsets] of rows) {
    const mirrored = pose === "walk-left";
    const masterName = mirrored ? poses.walk : poses[pose];
    for (const verticalOffset of verticalOffsets) {
      const output = path.join(workDirectory, `frame-${String(frameIndex).padStart(3, "0")}.png`);
      const transform = mirrored
        ? `scale=172:190:force_original_aspect_ratio=decrease,hflip[pet]`
        : `scale=172:190:force_original_aspect_ratio=decrease[pet]`;
      runFfmpeg([
        "-i",
        path.join(mastersDirectory, masterName),
        "-filter_complex",
        `[0:v]${transform};color=c=black@0:s=192x208,format=rgba[bg];` +
          `[bg][pet]overlay=x=(W-w)/2:y=H-h-5+${verticalOffset}:format=auto`,
        "-frames:v",
        "1",
        output
      ]);
      frameIndex += 1;
    }
  }

  const atlasPng = path.join(workDirectory, "spritesheet.png");
  runFfmpeg([
    "-framerate",
    "1",
    "-i",
    path.join(workDirectory, "frame-%03d.png"),
    "-vf",
    "tile=8x11:nb_frames=88:padding=0:margin=0",
    "-frames:v",
    "1",
    atlasPng
  ]);

  const runtimeSheet = path.join(runtimeDirectory, "spritesheet.webp");
  runFfmpeg([
    "-i",
    atlasPng,
    "-c:v",
    "libwebp",
    "-lossless",
    "1",
    "-compression_level",
    "6",
    "-pix_fmt",
    "yuva420p",
    "-frames:v",
    "1",
    runtimeSheet
  ]);

  const reviewFrames = [0, 8, 24, 32, 40, 56];
  const labels = ["Idle", "Walk", "Needs you", "Ready", "Concern", "Working"];
  const reviewInputs = reviewFrames.flatMap((index) => [
    "-i",
    path.join(workDirectory, `frame-${String(index).padStart(3, "0")}.png`)
  ]);
  const splits = labels.map((_, index) =>
    `[${index}:v]format=rgba,split=2[s${index}l][s${index}d]`
  );
  const panels = labels.flatMap((label, index) => {
    const lightLabel = existsSync(font)
      ? `,drawtext=fontfile=${font}:text='${label}':fontcolor=0x17233D:fontsize=18:x=(w-text_w)/2:y=8`
      : "";
    const darkLabel = existsSync(font)
      ? `,drawtext=fontfile=${font}:text='${label}':fontcolor=0xF6F0E7:fontsize=18:x=(w-text_w)/2:y=8`
      : "";
    return [
      `color=c=0xF6F0E7:s=220x250[bl${index}];` +
        `[bl${index}][s${index}l]overlay=14:34:format=auto${lightLabel}[pl${index}]`,
      `color=c=0x17233D:s=220x250[bd${index}];` +
        `[bd${index}][s${index}d]overlay=14:34:format=auto${darkLabel}[pd${index}]`
    ];
  });
  runFfmpeg([
    ...reviewInputs,
    "-filter_complex",
    `${splits.join(";")};${panels.join(";")};` +
      `[pl0][pl1][pl2]hstack=inputs=3[lightTop];` +
      `[pl3][pl4][pl5]hstack=inputs=3[lightBottom];` +
      `[pd0][pd1][pd2]hstack=inputs=3[darkTop];` +
      `[pd3][pd4][pd5]hstack=inputs=3[darkBottom];` +
      `[lightTop][lightBottom][darkTop][darkBottom]vstack=inputs=4`,
    "-frames:v",
    "1",
    path.join(sourceDirectory, "design-review.png")
  ]);

  copyFileSync(runtimeSheet, bundledSheet);
  console.log(`Exported ${runtimeSheet}`);
  console.log(`Updated ${bundledSheet}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
