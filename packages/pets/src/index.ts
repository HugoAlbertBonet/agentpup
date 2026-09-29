import { createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { randomUUID } from "node:crypto";

import yauzl, { type Entry, type ZipFile } from "yauzl";

export {
  resolvePetAnimation,
  resolvePetVisualState,
  type PetAnimation,
  type PetVisualState
} from "./animation.js";
export {
  defaultPetPreferences,
  maxFinishedAgentsMaximum,
  maxFinishedAgentsMinimum,
  normalizePetPreferences,
  petScaleMaximum,
  petScaleMinimum,
  validatePetPreferencesPatch,
  type PetPreferences,
  type PetPreferencesPatch
} from "./preferences.js";

export const openPetsGalleryUrl = "https://openpets.dev/#pets";
export const builtInPetId = "builtin";

const maxMetadataBytes = 128 * 1024;
const maxSpritesheetBytes = 100 * 1024 * 1024;
const maxZipBytes = 50 * 1024 * 1024;
const maxExtractedBytes = 110 * 1024 * 1024;
const maxZipEntries = 12;

export interface OpenPetsMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly spritesheetPath: "spritesheet.webp";
  readonly spriteVersionNumber?: 2;
}

export interface OpenPetsLayout {
  readonly version: 1 | 2;
  readonly frameWidth: 192;
  readonly frameHeight: 208;
  readonly columns: 8;
  readonly rows: 9 | 11;
}

export interface InstalledPet {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly spritesheetPath: string;
  readonly layout: OpenPetsLayout;
}

export function validateOpenPetsMetadata(value: unknown): OpenPetsMetadata {
  if (!isRecord(value)) throw new Error("pet.json must be an object.");
  if (typeof value.id !== "string" || !isSafePetId(value.id)) {
    throw new Error("OpenPets pet id is invalid.");
  }
  if (
    typeof value.displayName !== "string" ||
    value.displayName.trim().length === 0 ||
    value.displayName.length > 120
  ) {
    throw new Error("OpenPets displayName is invalid.");
  }
  if (
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    value.description.length > 500
  ) {
    throw new Error("OpenPets description is invalid.");
  }
  if (value.spritesheetPath !== "spritesheet.webp") {
    throw new Error("OpenPets spritesheetPath must be spritesheet.webp.");
  }
  if (value.spriteVersionNumber !== undefined && value.spriteVersionNumber !== 2) {
    throw new Error("OpenPets spriteVersionNumber must be 2 when provided.");
  }
  return {
    id: value.id,
    displayName: value.displayName.trim(),
    description: value.description.trim(),
    spritesheetPath: "spritesheet.webp",
    ...(value.spriteVersionNumber === 2 ? { spriteVersionNumber: 2 as const } : {})
  };
}

export function getOpenPetsLayout(metadata: Pick<OpenPetsMetadata, "spriteVersionNumber">): OpenPetsLayout {
  return metadata.spriteVersionNumber === 2
    ? { version: 2, frameWidth: 192, frameHeight: 208, columns: 8, rows: 11 }
    : { version: 1, frameWidth: 192, frameHeight: 208, columns: 8, rows: 9 };
}

export function parseWebpDimensions(data: Uint8Array): { readonly width: number; readonly height: number } {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Spritesheet is not a valid WebP file.");
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (size > buffer.length - dataOffset) throw new Error("WebP chunk is truncated.");

    if (kind === "VP8X" && size >= 10) {
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1
      };
    }
    if (
      kind === "VP8 " &&
      size >= 10 &&
      buffer[dataOffset + 3] === 0x9d &&
      buffer[dataOffset + 4] === 0x01 &&
      buffer[dataOffset + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff
      };
    }
    if (kind === "VP8L" && size >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1
      };
    }
    offset = dataOffset + size + (size % 2);
  }
  throw new Error("WebP dimensions are unavailable.");
}

export function validatePackEntryPath(name: string):
  | { readonly isDirectory: true }
  | { readonly isDirectory: false; readonly outputName: "pet.json" | "spritesheet.webp" } {
  if (
    name.length === 0 ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[a-zA-Z]:/.test(name)
  ) {
    throw new Error("Zip contains an unsafe path.");
  }
  const directory = name.endsWith("/");
  const parts = name.split("/").filter((part) => part.length > 0);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Zip contains an unsafe path.");
  }
  if (directory) {
    if (parts.length !== 1 || !isSafePetId(parts[0]!)) {
      throw new Error("Zip wrapper directory is invalid.");
    }
    return { isDirectory: true };
  }
  if (parts.length < 1 || parts.length > 2) {
    throw new Error("Pack files must be at the zip root or one wrapper directory below it.");
  }
  if (parts.length === 2 && !isSafePetId(parts[0]!)) {
    throw new Error("Zip wrapper directory is invalid.");
  }
  const leaf = parts.at(-1);
  if (leaf !== "pet.json" && leaf !== "spritesheet.webp") {
    throw new Error(`Zip contains an unexpected file: ${leaf ?? name}`);
  }
  return { isDirectory: false, outputName: leaf };
}

export async function readInstalledPet(directory: string, expectedId?: string): Promise<InstalledPet> {
  const petJsonPath = path.join(directory, "pet.json");
  const spritesheetPath = path.join(directory, "spritesheet.webp");
  const [metadataStat, spritesheetStat] = await Promise.all([
    lstat(petJsonPath),
    lstat(spritesheetPath)
  ]);
  if (!metadataStat.isFile() || metadataStat.isSymbolicLink() || metadataStat.size > maxMetadataBytes) {
    throw new Error("pet.json must be a small regular file.");
  }
  if (
    !spritesheetStat.isFile() ||
    spritesheetStat.isSymbolicLink() ||
    spritesheetStat.size <= 0 ||
    spritesheetStat.size > maxSpritesheetBytes
  ) {
    throw new Error("spritesheet.webp must be a bounded regular file.");
  }
  const metadata = validateOpenPetsMetadata(
    JSON.parse(await readFile(petJsonPath, "utf8")) as unknown
  );
  if (expectedId !== undefined && metadata.id !== expectedId) {
    throw new Error("OpenPets pet id must match its directory name.");
  }
  const layout = getOpenPetsLayout(metadata);
  const dimensions = parseWebpDimensions(await readFile(spritesheetPath));
  const expectedWidth = layout.frameWidth * layout.columns;
  const expectedHeight = layout.frameHeight * layout.rows;
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(`OpenPets spritesheet must be exactly ${expectedWidth}x${expectedHeight}.`);
  }
  return {
    id: metadata.id,
    displayName: metadata.displayName,
    description: metadata.description,
    spritesheetPath,
    layout
  };
}

export async function listInstalledPets(root: string): Promise<readonly InstalledPet[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const pets: InstalledPet[] = [];
  for (const entry of entries.slice(0, 100)) {
    if (!entry.isDirectory() || !isSafePetId(entry.name)) continue;
    try {
      pets.push(await readInstalledPet(path.join(root, entry.name), entry.name));
    } catch (error) {
      console.warn(`[agentpup] Ignoring invalid pet ${entry.name}:`, error);
    }
  }
  return pets.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function installOpenPetsZip(zipPath: string, petsRoot: string): Promise<InstalledPet> {
  const zipStat = await lstat(zipPath);
  if (!zipStat.isFile() || zipStat.isSymbolicLink() || zipStat.size <= 0 || zipStat.size > maxZipBytes) {
    throw new Error("Pet zip must be a regular file no larger than 50 MiB.");
  }
  await mkdir(petsRoot, { recursive: true, mode: 0o700 });
  const candidate = path.join(petsRoot, `.import-${randomUUID()}`);
  await mkdir(candidate, { mode: 0o700 });
  try {
    await extractPack(zipPath, candidate);
    const pet = await readInstalledPet(candidate);
    const finalPath = path.join(petsRoot, pet.id);
    const backup = path.join(petsRoot, `.backup-${pet.id}-${randomUUID()}`);
    let hadPrevious = false;
    try {
      await rename(finalPath, backup);
      hadPrevious = true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
    }
    try {
      await rename(candidate, finalPath);
    } catch (error) {
      if (hadPrevious) await rename(backup, finalPath).catch(() => undefined);
      throw error;
    }
    if (hadPrevious) {
      await rm(backup, { recursive: true, force: true }).catch((error: unknown) => {
        console.warn(`[agentpup] Could not remove replaced pet backup ${backup}:`, error);
      });
    }
    return await readInstalledPet(finalPath, pet.id);
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}

async function extractPack(zipPath: string, output: string): Promise<void> {
  const zipFile = await openZip(zipPath);
  const seen = new Set<string>();
  let wrapper: string | null | undefined;
  let entryCount = 0;
  let extractedBytes = 0;
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      const reject = (error: unknown): void => {
        if (settled) return;
        settled = true;
        rejectPromise(error instanceof Error ? error : new Error("Pet zip extraction failed."));
      };
      zipFile.on("error", reject);
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolvePromise();
      };
      zipFile.on("end", finish);
      zipFile.on("close", finish);
      zipFile.on("entry", (entry) => {
        void processEntry(entry).then(() => {
          if (!settled) zipFile.readEntry();
        }, reject);
      });

      async function processEntry(entry: Entry): Promise<void> {
        entryCount += 1;
        if (entryCount > maxZipEntries) throw new Error("Pet zip contains too many entries.");
        validateZipEntryMetadata(entry);
        const safe = validatePackEntryPath(entry.fileName);
        const parts = entry.fileName.split("/").filter(Boolean);
        const entryWrapper = parts.length === 2 ? parts[0]! : null;
        if (!safe.isDirectory) {
          if (wrapper === undefined) wrapper = entryWrapper;
          else if (wrapper !== entryWrapper) throw new Error("Pet zip mixes root and wrapped files.");
          const key = safe.outputName.toLowerCase();
          if (seen.has(key)) throw new Error(`Pet zip contains duplicate ${safe.outputName}.`);
          seen.add(key);
          extractedBytes += entry.uncompressedSize;
          if (extractedBytes > maxExtractedBytes) throw new Error("Pet zip expands beyond its size limit.");
          const destination = path.join(output, safe.outputName);
          await writeZipEntry(zipFile, entry, destination);
        }
      }
      zipFile.readEntry();
    });
  } finally {
    zipFile.close();
  }
  if (!seen.has("pet.json") || !seen.has("spritesheet.webp")) {
    throw new Error("Pet zip must contain pet.json and spritesheet.webp.");
  }
}

async function openZip(zipPath: string): Promise<ZipFile> {
  const zip = await readFile(zipPath);
  return await new Promise((resolvePromise, rejectPromise) => {
    yauzl.fromBuffer(
      zip,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zipFile) => {
        if (error) rejectPromise(error);
        else if (zipFile === undefined) rejectPromise(new Error("Pet zip could not be opened."));
        else resolvePromise(zipFile);
      }
    );
  });
}

function validateZipEntryMetadata(entry: Entry): void {
  if (entry.isEncrypted()) throw new Error("Encrypted pet zip entries are unsupported.");
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error("Pet zip uses an unsupported compression method.");
  }
  if (entry.uncompressedSize > maxSpritesheetBytes) {
    throw new Error("Pet zip entry exceeds its size limit.");
  }
  const unixMode =
    entry.versionMadeBy >> 8 === 3 ? (entry.externalFileAttributes >> 16) & 0o177777 : null;
  if (unixMode === null) return;
  const type = unixMode & 0o170000;
  if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
    throw new Error("Pet zip contains a special file or symbolic link.");
  }
}

function writeZipEntry(zipFile: ZipFile, entry: Entry, destination: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error !== null) {
        rejectPromise(error);
        return;
      }
      if (stream === undefined) {
        rejectPromise(new Error("Pet zip entry stream is unavailable."));
        return;
      }
      let bytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.byteLength;
          callback(bytes > maxSpritesheetBytes ? new Error("Pet zip entry exceeded its size limit.") : null, chunk);
        }
      });
      void pipeline(stream, limiter, createWriteStream(destination, { flags: "wx", mode: 0o600 }))
        .then(() => {
          if (bytes !== entry.uncompressedSize) {
            rejectPromise(new Error("Pet zip entry size did not match its metadata."));
          } else {
            resolvePromise();
          }
        }, rejectPromise);
    });
  });
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16);
}

function isSafePetId(value: string): boolean {
  return value !== builtInPetId && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
