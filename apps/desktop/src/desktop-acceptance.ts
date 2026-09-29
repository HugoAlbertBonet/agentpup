import path from "node:path";

const reportPrefix = "--desktop-acceptance-report=";

export function desktopAcceptanceReportPath(
  arguments_: readonly string[]
): string | undefined {
  const matches = arguments_.filter((argument) => argument.startsWith(reportPrefix));
  if (matches.length === 0) return undefined;
  const value = matches[0]!.slice(reportPrefix.length);
  if (
    matches.length !== 1 ||
    value.length === 0 ||
    value.length > 4096 ||
    /[\0\r\n]/.test(value) ||
    !path.isAbsolute(value)
  ) {
    throw new Error("Invalid desktop acceptance report path");
  }
  return path.normalize(value);
}
