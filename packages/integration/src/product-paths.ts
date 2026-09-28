import path from "node:path";

export interface AgentPupEnvironment {
  readonly AGENTPUP_HOME?: string;
  readonly CLAUDEPET_HOME?: string;
}

export function resolveAgentPupHome(
  userHome: string,
  environment: AgentPupEnvironment
): string {
  return environment.AGENTPUP_HOME ??
    environment.CLAUDEPET_HOME ??
    path.join(userHome, ".agentpup");
}

export function agentPupDataHomes(
  userHome: string,
  environment: AgentPupEnvironment
): readonly string[] {
  if (environment.AGENTPUP_HOME !== undefined || environment.CLAUDEPET_HOME !== undefined) {
    return [resolveAgentPupHome(userHome, environment)];
  }
  return [
    path.join(userHome, ".agentpup"),
    path.join(userHome, ".claudepet")
  ];
}
