import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoverLocalSessions, findRecentLocalJsonlFiles } from "./local-discovery.js";

describe("local session discovery", () => {
  it("does not let a deep project tree starve a sibling transcript", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claudepet-local-walk-"));
    await mkdir(path.join(root, "project-one"));
    await mkdir(path.join(root, "project-two"));
    const directories = await readdir(root);
    const targetDirectory = path.join(root, directories[0]!);
    const noisyDirectory = path.join(root, directories[1]!);
    await writeFile(path.join(targetDirectory, "target.jsonl"), "{}\n");
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        writeFile(path.join(noisyDirectory, `noise-${index}.jsonl`), "{}\n")
      )
    );

    const files = await findRecentLocalJsonlFiles(root, 10, 6);

    expect(files.some((file) => file.filePath.endsWith("target.jsonl"))).toBe(true);
  });

  it("extracts only safe Codex and Claude metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claudepet-discovery-"));
    const codexHome = path.join(root, ".codex");
    const claudeHome = path.join(root, ".claude");
    const codexSessions = path.join(codexHome, "sessions", "2026", "09", "25");
    const claudeProjects = path.join(claudeHome, "projects", "-workspace-checkout");
    await mkdir(codexSessions, { recursive: true });
    await mkdir(claudeProjects, { recursive: true });

    await writeFile(
      path.join(codexSessions, "rollout-codex-session.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: "codex-session",
            cwd: "/workspace/checkout",
            timestamp: "2026-09-25T12:00:00.000Z"
          }
        }),
        JSON.stringify({ type: "event_msg", payload: { message: "CODEX_PRIVATE_PROMPT" } })
      ].join("\n")
    );
    await writeFile(
      path.join(claudeProjects, "claude-session.jsonl"),
      JSON.stringify({
        type: "user",
        sessionId: "claude-session",
        cwd: "/workspace/api",
        message: { content: "CLAUDE_PRIVATE_PROMPT" }
      })
    );

    const sessions = await discoverLocalSessions({ codexHome, claudeHome, limitPerProvider: 5 });

    expect(sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "codex",
          sessionId: "codex-session",
          project: "checkout"
        }),
        expect.objectContaining({
          provider: "claude-code",
          sessionId: "claude-session",
          project: "api"
        })
      ])
    );
    expect(JSON.stringify(sessions)).not.toContain("PRIVATE_PROMPT");
    expect(sessions.every((session) => !("sourcePath" in session))).toBe(true);
  });

  it("treats missing provider homes as no discovered sessions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "claudepet-empty-discovery-"));

    await expect(
      discoverLocalSessions({
        codexHome: path.join(root, "missing-codex"),
        claudeHome: path.join(root, "missing-claude"),
        limitPerProvider: 5
      })
    ).resolves.toEqual([]);
  });
});
