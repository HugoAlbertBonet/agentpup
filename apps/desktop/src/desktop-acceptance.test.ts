import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { desktopAcceptanceReportPath } from "./desktop-acceptance.js";

describe("desktop acceptance report argument", () => {
  const absolutePath = path.join(os.tmpdir(), "agentpup-macos.json");

  it("accepts one bounded absolute report path", () => {
    expect(
      desktopAcceptanceReportPath([
        "AgentPup",
        `--desktop-acceptance-report=${absolutePath}`
      ])
    ).toBe(absolutePath);
    expect(desktopAcceptanceReportPath(["AgentPup", "--demo"])).toBeUndefined();
  });

  it.each([
    ["--desktop-acceptance-report="],
    ["--desktop-acceptance-report=relative.json"],
    [`--desktop-acceptance-report=${absolutePath}\ninvalid`],
    [`--desktop-acceptance-report=${absolutePath}`, `--desktop-acceptance-report=${absolutePath}.two`]
  ])("rejects ambiguous or unsafe report paths", (...arguments_) => {
    expect(() => desktopAcceptanceReportPath(["AgentPup", ...arguments_])).toThrow(
      "Invalid desktop acceptance report path"
    );
  });
});
