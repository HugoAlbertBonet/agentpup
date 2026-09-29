import { describe, expect, it } from "vitest";

import { desktopAcceptanceReportPath } from "./desktop-acceptance.js";

describe("desktop acceptance report argument", () => {
  it("accepts one bounded absolute report path", () => {
    expect(
      desktopAcceptanceReportPath([
        "AgentPup",
        "--desktop-acceptance-report=/tmp/agentpup-macos.json"
      ])
    ).toBe("/tmp/agentpup-macos.json");
    expect(desktopAcceptanceReportPath(["AgentPup", "--demo"])).toBeUndefined();
  });

  it.each([
    ["--desktop-acceptance-report="],
    ["--desktop-acceptance-report=relative.json"],
    ["--desktop-acceptance-report=/tmp/a\n.json"],
    ["--desktop-acceptance-report=/tmp/one.json", "--desktop-acceptance-report=/tmp/two.json"]
  ])("rejects ambiguous or unsafe report paths", (...arguments_) => {
    expect(() => desktopAcceptanceReportPath(["AgentPup", ...arguments_])).toThrow(
      "Invalid desktop acceptance report path"
    );
  });
});
