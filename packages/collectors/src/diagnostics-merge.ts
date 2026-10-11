import type { CollectorProviderDiagnostics, CollectorRuntimeDiagnostics } from "./live-collector.js";

/** Summarize observed coverage across native and WSL without claiming both match. */
export function mergeCollectorDiagnostics(inputs: readonly CollectorRuntimeDiagnostics[]): CollectorRuntimeDiagnostics | null {
  if (inputs.length === 0) return null;
  const providers = new Map<string, CollectorProviderDiagnostics>();
  for (const input of inputs) {
    for (const candidate of input.providers) {
      const existing = providers.get(candidate.provider);
      const score = (value: CollectorProviderDiagnostics): number =>
        (value.hookEventsObserved ? 4 : 0) + (value.hookConfiguration === "configured" ? 2 : 0) + (value.version !== null ? 1 : 0);
      if (existing === undefined || score(candidate) > score(existing)) providers.set(candidate.provider, candidate);
    }
  }
  return {
    observedAt: inputs.map(input => input.observedAt).sort().at(-1)!,
    transcriptFallback: inputs.some(input => input.transcriptFallback),
    providers: [...providers.values()]
  };
}
