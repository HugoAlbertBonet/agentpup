import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isHookEnvelope, type HookEnvelope } from "./hook-events.js";

const RETENTION_MS = 24 * 60 * 60_000;
const MAX_EVENTS = 2_000;

function eventsDirectory(home: string): string {
  return path.join(home, "events");
}

export async function writeHookEnvelope(home: string, event: HookEnvelope): Promise<string> {
  const directory = eventsDirectory(home);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `${Date.now().toString().padStart(13, "0")}-${process.pid}-${randomUUID()}.json`;
  const destination = path.join(directory, name);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(event), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporary, destination);
  return destination;
}

export async function readHookInbox(home: string, now = Date.now()): Promise<HookEnvelope[]> {
  const directory = eventsDirectory(home);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const selected = new Set(files.slice(-MAX_EVENTS));
  const events: HookEnvelope[] = [];

  await Promise.all(
    files.map(async (name) => {
      const filePath = path.join(directory, name);
      try {
        const metadata = await stat(filePath);
        if (now - metadata.mtimeMs > RETENTION_MS || !selected.has(name)) {
          await unlink(filePath);
          return;
        }
        const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
        if (isHookEnvelope(value)) events.push(value);
      } catch {
        // A concurrent hook write or cleanup is retried on the next scan.
      }
    })
  );
  return events.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}
