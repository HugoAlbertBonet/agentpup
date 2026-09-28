import os from "node:os";

import type { Provider } from "../../../packages/status/src/index.js";
import { normalizeHookPayload } from "../../../packages/collectors/src/hook-events.js";
import { writeHookEnvelope } from "../../../packages/collectors/src/hook-inbox.js";
import { resolveAgentPupHome } from "../../../packages/integration/src/product-paths.js";

const MAX_INPUT_BYTES = 1024 * 1024;

function providerArgument(): Provider | undefined {
  const argument = process.argv.find((value) => value.startsWith("--provider="));
  const provider = argument?.slice("--provider=".length);
  return provider === "codex" || provider === "claude-code" ? provider : undefined;
}

async function readInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunkValue of process.stdin) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(String(chunkValue));
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--self-test")) {
    process.stdout.write("{}\n");
    return;
  }
  const provider = providerArgument();
  if (provider !== undefined) {
    const payload = await readInput();
    const event = normalizeHookPayload(provider, payload);
    if (event !== null) {
      const home = resolveAgentPupHome(os.homedir(), process.env);
      try {
        await writeHookEnvelope(home, event);
      } catch {
        // Observation must never block or fail the coding agent.
      }
    }
  }
  process.stdout.write("{}\n");
}

void main().catch(() => {
  process.stdout.write("{}\n");
});
