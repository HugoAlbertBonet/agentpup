# AgentPup

## Main objective

Build a delightful desktop virtual pet that moves naturally above ordinary application windows and gives an immediate, trustworthy view of Claude Code and Codex activity. At a glance, users should know how many agents are working, which need human input, and which have finished. The pet must remain useful while the user works in other applications.

The project must be easy to clone from GitHub and start on a new computer. A fresh checkout must not depend on the original author's paths, installed sibling projects, private assets, secrets, or local configuration. Provide a short, reproducible development setup and packaged releases for non-developers. The pet itself must not require an AI subscription, API key, or cloud service to run; monitoring uses agents the user already runs.

## Test-Driven Development
Follow a Test-Driven Development philosophy where accurate tests are built before introducing a new feature so they can be used after any change or new implementation to ensure the everything works properly.

## Project status and decisions

- This repository contains a working Electron/TypeScript implementation, automated tests, native Windows development launcher, Windows tray show/hide controls, WSL collector, self-contained provider-hook integration with first-run controls, diagnostics, an OpenPets-compatible appearance runtime, an unsigned NSIS target, and a Windows artifact workflow. Inspect existing code before treating anything in the plan as merely proposed.
- Read [README.md](README.md), [docs/PLAN.md](docs/PLAN.md), and [docs/VALIDATION.md](docs/VALIDATION.md) before architecture or release work. The validation ledger separates measured results from remaining acceptance work and is the primary continuation handoff.
- The confirmed first platform is native Windows with native and WSL agent collection. The pet appears on the Windows desktop while monitoring agents inside WSL as well as Windows. Cross-platform support comes later; keep boundaries suitable for macOS and Linux without making their implementation a first-release requirement.
- The adopted stack is Electron, TypeScript, and the OpenPets-compatible 2D sprite renderer. Changes to this architecture should explain the concrete benefit and update the plan.
- `/home/hugo/bot-crossing` was a research reference, not a runtime dependency. Preserve applicable MIT attribution if any of its code is reused. Do not copy user data or assume that directory exists on another machine.

## Product principles

- Status correctness and reliable attention signals come first. A cute animation must never delay or obscure an input request.
- Distinguish active work, pending human input, a finished result, idle sessions, errors, and unknown/disconnected status. Lack of recent output does not prove an agent stopped working.
- Keep activity and pending requests separate: an agent can ask a nonblocking question while other work continues.
- Track parent sessions and subagents with stable identities. Never count the same agent twice because multiple adapters observed it. Make the counting unit explicit in the UI.
- Keep the pet small, readable, expressive, and unobtrusive. It must not steal keyboard focus or intercept clicks outside its intended interaction area.
- Provide pause roaming, reduced motion, hide/show, and a persistent attention indicator. Do not rely on color or sound alone.
- “Always on top” means supported ordinary desktop windows. Do not promise visibility above secure desktops, lock screens, exclusive fullscreen applications, or every compositor.
- Default to one pet summarizing all agents. Keep the status model independent of appearance and animation.

## Architecture boundaries

- Provider adapters own discovery, capability/version checks, source event interpretation, and provider-specific session links.
- A renderer-independent status engine owns identity, deduplication, event ordering, reconciliation, pending requests, and aggregate counts.
- Collectors run in the environment where agents run; WSL collection is separate from the native Windows overlay.
- The desktop host owns windows, monitors, tray, lifecycle, settings, and narrowly scoped IPC.
- Pet behavior chooses intentions and motion. Appearance packs supply assets and declarative animation metadata.
- Renderers consume normalized snapshots/deltas. They must not parse transcripts or know Claude/Codex storage formats.
- Keep optional native platform integrations behind small interfaces. Verify platform capabilities instead of assuming equivalent APIs behave identically.

## Agent integration rules

- Prefer documented runtime events and lifecycle hooks. Use watched transcripts or read-only metadata only for discovery, recovery, and explicitly labeled fallback behavior.
- Check installed versions and actual hook/event coverage. Current web documentation can describe features absent from an installed binary.
- Hooks must observe without changing the agent's prompt, tool arguments, permissions, output, or decisions. Use the provider's valid neutral response; some events require JSON even for a successful observer.
- Hook delivery must be bounded and must not make agent work depend on the pet being available. Avoid starting heavyweight runtimes for every event when a supported direct transport is available.
- Do not treat a permission hook as proof that a human-facing dialog remained open: other policies/hooks can resolve the request. Record evidence and confidence, and reconcile resolution.
- Never modify provider transcripts, session databases, or approval records. Never approve, deny, resume, or send prompts on the user's behalf as part of monitoring.
- Integration installation must preserve existing configuration, be idempotent, show what it adds, and support uninstalling only its own entries. Respect provider trust controls and managed policies.
- Do not claim that starting a new Codex app-server attaches to every existing CLI or desktop session. Use a stream only when access to the relevant running session is established.
- Keep transcript parsers versioned and test them with sanitized fixtures. Treat undocumented formats as fallible.

## Appearance packs and design work

- Maintain [docs/ASSET_PACK_GUIDE.md](docs/ASSET_PACK_GUIDE.md) as the complete authoring contract: every required/optional file, its purpose, format, requirements, animation expectations, and export/validation steps. Update the guide, examples, and eventual schema together when the format changes.
- The asset guide must stand alone for a designer or agent with zero project context. Include the product purpose, Windows/WSL scope, working/needs-help/result/unknown meanings, aggregate badges, individual-agent panel, interaction/accessibility rules, and required design-review scenarios. Do not leave essential design requirements only in the project plan or conversation history.
- Electron must not dictate the pet's visual style. Preserve a renderer boundary so richer rigs or 3D can be added later; distinguish baseline sprite-pack limitations from desktop-host limitations.
- The baseline pack is data plus local assets, with a versioned manifest, author/license information, common animation states, anchors, bounds, and fallbacks.
- Adding or switching a standard pet design must not require editing agent adapters, the status engine, or native window code.
- Keep badges and status labels in shared UI so all designs communicate the same facts.
- Include editable source assets and a documented export workflow. Claude Design may assist design and prototyping, but must not be required to run or contribute to the app.
- Evaluate animation at actual desktop size: grounded feet, consistent proportions, readable silhouettes, smooth turns, and coherent transitions matter more than a large static illustration.
- Treat imported packs as untrusted data. Validate paths, dimensions, resource limits, schemas, and file types. Do not execute downloaded JavaScript, HTML, SVG scripts, or arbitrary pack code.

## Privacy and security

- Process status locally by default. Do not upload prompts, code, terminal contents, or transcripts.
- Store only the metadata needed for status and diagnostics; omit prompt/tool bodies from logs and renderer messages by default.
- Use OS application-data directories and environment-aware path discovery. Respect configured provider homes without reassigning system environment variables.
- Use authenticated, scoped local IPC. Any optional network bridge must validate clients, reject arbitrary browser origins, and avoid LAN exposure by default.
- Keep Electron renderer sandboxing and context isolation enabled, Node integration disabled, and a narrow validated preload interface. Load packaged application resources.
- Opening a session must be an explicit user action with a validated target. Do not feed provider data into shell command strings.

## Working on the repository

- Follow applicable user and local environment instructions. In the original environment, `/home/hugo/.codex/RTK.md` requires shell commands to be prefixed with `rtk`; read it when present. This machine-specific helper must not become an application or contributor prerequisite.
- Inspect existing files and preserve unrelated changes before editing. Use `rg` for searches when available and `apply_patch` for file edits.
- Keep changes focused on the requested task. A research request authorizes documentation, not application implementation or installation of global hooks.
- Record material architecture decisions and verified platform/version limits in the documentation. Separate measured results from targets and assumptions.
- Update [docs/VALIDATION.md](docs/VALIDATION.md) when a manual acceptance check passes, fails, or reveals a frontend/version-specific limitation. Do not infer untested platform coverage from automated tests.
- Pin dependencies, commit the lockfile, document supported toolchain versions, and avoid undocumented global utilities. Do not invent working setup/test commands before their scripts exist.
- Provide a demo mode with synthetic agent events so a contributor can run and test the pet without Claude Code, Codex, or private session data.
- Verify changes in proportion to risk. State what was tested and any remaining limitations; do not report planned checks as passing checks.

## Required validation as implementation develops

- Status replay: start/stop, approval request/resolution/denial, structured questions, nonblocking questions, simultaneous requests, continued stop hooks, errors, interruption, subagent restart, duplicate/out-of-order events, crashes, and reconnects.
- Recovery: partial/truncated/rotated transcripts, missed watcher events, collector restarts, WSL shutdown, suspend/resume, stale metadata, and PID reuse.
- Desktop behavior: focus preservation, transparent-area click-through, dragging, mixed DPI, monitor removal, negative coordinates, fullscreen policies, virtual desktops, reduced motion, and idle resource use.
- Packaging: clean-machine installation and fresh-clone development startup on every claimed supported platform, including verified WSL integration when offered.
- Appearance packs: malformed archives, path traversal, missing animations, oversized textures, fallback behavior, and an independent second design installed without core code changes.
