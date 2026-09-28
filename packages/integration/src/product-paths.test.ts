import path from "node:path";

import { describe, expect, it } from "vitest";

import { agentPupDataHomes, resolveAgentPupHome } from "./product-paths.js";

describe("AgentPup data paths", () => {
  it("prefers the new environment override and accepts the legacy override", () => {
    expect(resolveAgentPupHome("/home/me", {
      AGENTPUP_HOME: "/new",
      CLAUDEPET_HOME: "/legacy"
    })).toBe("/new");
    expect(resolveAgentPupHome("/home/me", { CLAUDEPET_HOME: "/legacy" })).toBe("/legacy");
  });

  it("uses the AgentPup directory and includes the legacy inbox for migration", () => {
    expect(resolveAgentPupHome("/home/me", {})).toBe(path.join("/home/me", ".agentpup"));
    expect(agentPupDataHomes("/home/me", {})).toEqual([
      path.join("/home/me", ".agentpup"),
      path.join("/home/me", ".claudepet")
    ]);
  });

  it("does not add a second directory when a home override is explicit", () => {
    expect(agentPupDataHomes("/home/me", { AGENTPUP_HOME: "/custom" })).toEqual(["/custom"]);
  });
});
