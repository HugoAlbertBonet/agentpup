# Performance benchmark

AgentPup includes a privacy-safe benchmark for the Windows/WSL reference path. It
measures synthetic status reduction, hook-helper process startup, collector time
to its first snapshot with empty temporary provider homes, and aggregate native
Windows Electron process CPU and memory. Reports contain only aggregate timing
and resource values; they do not contain provider events, session identifiers,
projects, prompts, tool data, or filesystem paths.

Start the native Windows development app, then run:

```bash
npm run benchmark -- --label=current --output=performance-results/current.json
```

The default run uses 50 reducer and hook samples, five cold collector samples,
and a 10-second process sample. `performance-results/` is ignored by Git. The
optional `--duration=<milliseconds>` (1,000–300,000) and `--iterations=<count>`
(1–1,000) arguments change those bounds. GPU and battery remain `null` when no
dependable counter is available; the benchmark never substitutes an estimate.

For controlled development comparisons, `scripts/start-windows.mjs` accepts
`--benchmark-idle` to suppress real discovery and collection, and
`--benchmark-animations=off` to override animation preferences in memory. These
flags do not write the user's settings. Restart without the flags after a run.

## Reference result: 2026-09-29

The reference computer ran Windows 11 Home build 26200 on an Intel Core 7 240H
with 16 logical processors and 34,046,783,488 bytes of visible memory. AgentPup
used Electron 44.4.5 and four native Electron processes. Each process sample was
10 seconds. The idle samples were taken after the finite 5.5-second idle loop
settled.

| State | One-core CPU | Machine CPU | RSS | Private memory |
| --- | ---: | ---: | ---: | ---: |
| Idle, animations enabled | 0.16% | 0.010% | 400,941,056 B | 247,619,584 B |
| Idle, animations disabled | 0.31% | 0.019% | 395,857,920 B | 242,823,168 B |
| Active working animation | 17.02% | 1.064% | 456,712,192 B | 271,654,912 B |

The two idle CPU values are both below the initial 1%-of-one-core target; their
ordering is sampling noise at this duration. The working sprite animation has a
material active cost and remains an optimization candidate.

Across the final active run, synthetic reducer latency was 0.003 ms p95, hook
helper startup was 28.439 ms p95, and cold collector first-snapshot latency was
133.507 ms p95. Helper process startup is reported separately from the plan's
direct/persistent transport target, as required by that target.

GPU use, battery effect, source-to-first-painted-badge latency, and long-duration
resource stability were not measured in this run.
