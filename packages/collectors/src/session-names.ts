import { open } from "node:fs/promises";
import path from "node:path";

/** Explicit provider titles only; never derive labels from prompt/tool bodies. */
export function sessionTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const title = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
  return title || undefined;
}

export async function readCodexSessionNames(codexHome: string): Promise<Map<string, string>> {
  const names = new Map<string, { name: string; updated: number }>();
  try {
    const handle = await open(path.join(codexHome, "session_index.jsonl"), "r");
    try {
      const size = (await handle.stat()).size;
      const start = Math.max(0, size - 512 * 1024);
      const buffer = Buffer.alloc(size - start);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
      if (start > 0) lines.shift();
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          const name = sessionTitle(value?.thread_name);
          if (typeof value?.id !== "string" || !name) continue;
          const updated = Date.parse(value.updated_at) || 0;
          if (updated < (names.get(value.id)?.updated ?? 0)) continue;
          names.set(value.id, { name, updated });
        } catch { /* Partial records are retried on the next scan. */ }
      }
    } finally { await handle.close(); }
  } catch { /* Missing/unreadable metadata leaves a neutral session label. */ }
  return new Map([...names].map(([id, value]) => [id, value.name]));
}
