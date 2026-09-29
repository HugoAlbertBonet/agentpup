# Desktop agent pet: research and implementation plan

Research date: 2026-09-25; implementation status updated 2026-09-28. Status: working native-Windows release candidate with cross-platform packaging underway. The repository contains a tested status engine, hardened Electron overlay with tray-controlled runtime stop/start and login startup controls on Windows, macOS, and Linux, explicit Linux X11/Wayland runtime policy, configurable newest-result retention, privacy-safe Codex/Claude discovery and lifecycle recovery, supervised versioned WSL-to-Windows and native collector streams, backup-safe provider hook setup/doctor/uninstall commands and first-run UI, diagnostics, an OpenPets-compatible sprite runtime with safe ZIP import, an unsigned NSIS target, fresh-runner Windows install/launch/uninstall validation, and native macOS/Linux artifact workflows with packaged-launch smoke gates. The selected continuation order is Windows packaging and a clean-machine trial, cross-platform support, an original default AgentPup design, then performance measurement. See [VALIDATION.md](VALIDATION.md) for measured checks and remaining work. Signed releases, real-desktop macOS/Linux validation, automatic roaming validation, and an original AgentPup design have not been implemented.

### Implemented live collector slice

The first live slice combines optional lifecycle hooks with a read-only recovery source. A collector inside WSL reads bounded transcript head/tail slices and sanitized hook events, normalizes lifecycle and structured-question evidence, and sends versioned NDJSON snapshots over `wsl.exe` stdio. The Windows host validates each message before replaying it through the status reducer and sending the resulting metadata-only state to the sandboxed renderer. A settings diagnostics view reports collector health, provider versions, hook configuration and observed delivery, transcript recovery, capabilities, and the last sanitized lifecycle event; its copy action excludes distro, project, session, turn, prompt, tool, and filesystem data. Prompt text, answers, tool arguments, and tool output are not included in the protocol.

The desktop host now supervises the collector process. Process exits and startup failures trigger retries after 1, 2, 4, and subsequently bounded delays up to 30 seconds. A valid protocol snapshot resets the delay. Disconnects mark the previous snapshot uncertain, while the next snapshot replaces that source atomically so reconnects do not accumulate duplicate agents. App shutdown cancels pending retries and stops the active child without scheduling another attempt.

Windows release preparation now uses version 0.1.0, embeds the watchdog
application icon, and verifies that an NSIS executable contains a real payload
plus the collector, hook, and integration runtimes. A repository-independent
LocalAppData smoke test passed, including packaged collector startup and the
integration doctor. GitHub CI still requires connecting this workspace to a Git
repository, and the clean-machine trial requires another Windows machine or VM.

The public product name is **AgentPup**. Its initial position is the reliable
ambient attention layer for concurrent local coding agents, with particular
strength on Windows plus WSL. OpenPets is the stronger general pet platform and
gallery ecosystem; close agent-pet projects support wider provider lists.
AgentPup should compete on tested status semantics, parent/subagent identity,
request resolution and recovery, privacy-safe observe-only hooks, and an
unobtrusive overlay. Provider breadth, cross-platform releases, and a large pet
catalog remain goals rather than current advantages.

The adapters recognize Codex `task_started`, `task_complete`, `turn_aborted`, and structured input call/output records. They recognize Claude user/assistant turn direction, tool execution, `AskUserQuestion`, `ExitPlanMode`, and matching tool results. Unfinished transcript evidence older than 30 minutes is downgraded to unknown and omitted from the visible live-agent list; this is recovery behavior rather than proof that work stopped.

The optional hook layer observes SessionStart/End, prompts, permission requests, relevant tool lifecycle events, stop/interruption, and subagent lifecycle events. SessionStart is deliberately ignored as activity evidence because opening or resuming the Claude Code VS Code chat emits it before a user submits work; UserPromptSubmit and SubagentStart establish working state. Each invocation discards prompt and tool bodies, stores a bounded metadata envelope under the user's AgentPup data directory, emits the provider's neutral `{}` response, and exits successfully even when monitoring storage is unavailable. It does not make permission decisions or inject model-visible context. Setup merges AgentPup-owned command handlers into user-level provider configuration, backs up before every edit, detects concurrent edits, supports read-only preview/doctor checks, and removes only its own handlers. Codex trust review remains a required provider-controlled step.

The native Windows development launcher successfully starts the bundled collector in the selected WSL distribution. Manual validation now covers common Claude Code and Codex start, completion, approval, denial, interruption, structured-question, simultaneous-request, subagent, silent-work, and collector-process restart paths. It also covers transparent-area click-through and focus preservation on the reference desktop. These checks establish the tested paths only; they do not establish every provider frontend/version, measured latency, full WSL restart, mixed-DPI behavior, or clean-machine packaging. Exact results and gaps are maintained in [VALIDATION.md](VALIDATION.md).

### OpenPets evaluation and appearance decision

On 2026-09-26 the OpenPets website, documentation, and MIT-licensed repository were inspected. Its desktop product is substantially more mature in pet presentation: it provides a fixed sprite-sheet convention, a gallery with 1,304 catalog entries at the time checked, local ZIP installation, pet selection, reaction mapping, a motion engine, and packaged desktop releases. Its wider application also includes plugins, an assistant, voice features, teams, and its own optional agent integrations.

AgentPup will **adopt the OpenPets V1/V2 pet package as its implemented compatibility format without replacing the existing application with an OpenPets fork**. A wholesale migration would replace the tested multi-agent identity, deduplication, request, Claude Code/Codex, and WSL boundaries with a much broader platform whose agent layer solves a different problem. The narrow format integration gives users immediate gallery compatibility while keeping status correctness independent of appearance.

The first compatibility slice is implemented: the CSS placeholder was replaced by the OpenPets 8-column WebP renderer; working, needs-you, ready, idle, and unknown states select fixed semantic rows; the bundled MIT Hoodie Cat is the offline fallback; a dedicated settings section controls pet visibility, pet scale, animation, status-bar scale, number size, row spacing, gallery access, ZIP import, and installed-pet cycling; preferences persist in OS application data; imported archives are bounded and reject traversal, symlinks, special files, unsupported compression, unexpected files, invalid metadata, and incorrect dimensions. The status bar remains nearest the screen edge when the overlay changes corners. OpenPets attribution is recorded in `THIRD_PARTY_NOTICES.md`. Gallery packs remain explicit user imports because the gallery warns that some entries are unofficial fan-made content.

## Recommendation

Build a native desktop companion using **Electron + TypeScript + a small 2D sprite renderer**, with independent local collectors feeding a deterministic status engine. Start with **Windows and WSL**, as confirmed by the user: the pet runs on the Windows desktop and monitors agents inside WSL as well as Windows. Cross-platform support comes later. Keep boundaries suitable for macOS and Linux adapters without making their implementation a first-release requirement.

Use **lifecycle hooks for existing Claude Code/Codex sessions**, a persistent local event connection, and filesystem watching for recovery and compatibility. Where an existing integration exposes the actual running Codex app-server stream, use that stronger source. Do not require users to replace their normal terminal or editor workflow.

Build **one expressive pet with consistent status badges** and interchangeable appearance packs. Use the implemented OpenPets V1/V2 layout for the baseline and gallery compatibility. A richer AgentPup-native atlas or rig can follow only with a versioned renderer boundary and a concrete benefit.

The three highest-risk questions to prove first are transparent click-through without focus theft, smooth movement across mixed-DPI monitors, and accurate request/resolution coverage in the installed agent versions. Framework selection is provisional until those checks pass.

## What the existing project establishes

I inspected the local `bot-crossing` source, particularly `server/harnesses/{claude-code,codex}.mjs`, the adapter contract, `src/main.js`, `src/game/colony.js`, and navigation code.

- The frontend normally polls every **15 seconds** (`src/main.js:31,747`). That alone is too slow for immediate attention signals.
- Codex reads session metadata and JSONL lifecycle records. A `task_started` record remains considered active within a **30-minute** freshness window (`server/harnesses/codex.mjs:34-35,291`). A crashed process can therefore appear active; a quiet long-running task can age out.
- Claude combines live-process evidence, transcript freshness, and a last-message heuristic (`server/harnesses/claude-code.mjs:211,473-478`). Its UI maps unread results to waiting (`src/game/colony.js:67-71`). That is useful for a colony dashboard but insufficient to prove an agent is blocked on a human.
- Reuse the architectural ideas: isolated provider adapters, namespaced identities, opaque session references, and read-only provider storage. Do not reuse polling/freshness as the primary truth model.
- Its 3D scene and grid navigation solve a different environment. A small desktop pet does not initially need that world renderer or pathfinding system.
- The inspected license is MIT, copyright 2026 Jarren Rocks. Preserve attribution if copying source. This plan does not copy application code.

The current reference checks use Codex CLI **0.157.1**, with hooks configured and observed, and Claude Code **2.1.161**. This does not prove every documented hook fires in every frontend. No provider conversation content is retained by the monitoring protocol or validation ledger.

There is also an existing OpenAI desktop pet: the official documentation describes floating pets on Windows/macOS and activity controls. It is worth studying as an interaction reference, but those docs do not establish a public integration for independent Claude Code sessions or this project's agent-counting requirements. Our proposed distinction is provider-neutral monitoring, natural roaming, and an open appearance format. [OpenAI Pets](https://learn.chatgpt.com/docs/pets)

## Desktop host choice

| Approach | Assessment for this project |
| --- | --- |
| Electron + TypeScript | Recommended starting point. Documented overlay controls, a consistent Chromium renderer, and one main language for UI, collection, and status logic. Accept a larger runtime in exchange for simpler development and packaging. Measure background cost before committing. |
| Tauri 2 + Rust + web UI | Strong alternative if measured Electron resource use is unacceptable. Adds Rust/native prerequisites and platform webview differences. Transparent macOS windows require the documented private-API configuration. |
| Separate native UI per OS | Maximum platform control, but multiplies implementation and contributor setup work. Reserve small native helpers for demonstrated gaps. |
| Browser/PWA | Not a suitable desktop-overlay host: the app needs native window positioning, topmost behavior, tray access, and local process integration. A browser preview is still valuable for design work. |

Electron documents always-on-top, mouse-event ignoring, focus controls, and window positioning. Transparency alone **does not** make the empty area click-through. These APIs need a real interaction test, not just a screenshot. Tauri's prerequisites include platform tooling and Rust; its transparency configuration carries a macOS-specific caveat. [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [transparent-window limitations](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [Tauri configuration](https://v2.tauri.app/reference/config/#appconfig)

### Overlay design

Electron does not impose a pixel-art style, a fixed pet shape, or a simple-animation ceiling. Its Chromium renderer can host web graphics; a pet can use detailed hand-drawn sprites, vector animation, a rig with expressions and secondary motion, or a WebGL 3D renderer. Rive and Three.js illustrate richer animation options. These require the appropriate renderer and assets; they do not come automatically with Electron. [Electron renderer model](https://www.electronjs.org/docs/latest/tutorial/process-model#the-renderer-process), [Rive runtime](https://rive.app/docs/runtimes/web/web-js), [Three.js animation APIs](https://threejs.org/docs/)

The practical limits are texture/GPU memory, rendering cost, display scaling, and the overlay's native window boundaries. A large tail, glow, or particle effect needs enough transparent canvas padding or it will be clipped. Transparent-window resizing and click-through require platform testing; CSS blur does not blur other applications behind the pet. Start with sprites for an approachable authoring workflow, while preserving an interface for future rigs/3D. The baseline pack's lack of live bone animation, arbitrary scripts, or independent accessory layers is a deliberate first-version format choice, not an Electron restriction. [Electron transparent-window limitations](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations)

Use a **small, fixed-size, frameless, transparent pet window** with enough padding for its largest animation and badge. Make it topmost over ordinary windows, skip the taskbar, suppress shadows, and keep it non-focusable during ambient use. Use a separate focusable popover for the agent list and settings, opened by an intentional click or shortcut.

Move the native window along a smooth path; render body animation inside it. Keep one authoritative pose/clock, coalesce movement updates, and preserve fractional motion in the renderer when the native window position rounds to device-independent integer coordinates. Do not resize the window every animation frame.

Use a deliberately forgiving hit shape for the pet and badge. Outside that shape, ignore mouse events. On Windows/macOS, prototype Electron's mouse-move forwarding while ignored so hover can enable interaction. Test rapid clicks, touch, leaving the window, and drag completion: a stale hit-test must not eat a click intended for another app. A fully click-through pet with tray/shortcut access is the recovery mode if selective interaction fails.

Benchmark the small moving window against a stationary transparent canvas covering one monitor. The latter simplifies continuous motion but may increase compositing cost and creates a much larger input surface. Choose it only if it materially improves measured motion and passes click-through/resource tests. Never assume a transparent full-monitor window is harmless.

Use logical desktop coordinates, work areas, and per-monitor scale factors. Handle negative coordinates, taskbars on different edges, monitor removal, and display changes while dragging. Initially keep the pet on the chosen monitor unless the user moves it; seamless autonomous monitor crossings can follow after validation.

Visibility above secure desktops, lock screens, and exclusive fullscreen applications is outside the promise. Offer hide-during-fullscreen and presentation modes. All-virtual-desktop behavior is a separate capability: Electron's all-workspaces API does not implement it on Windows. Do not equate topmost with visible on every desktop. [Electron window controls](https://www.electronjs.org/docs/latest/api/browser-window)

### Platform rollout

- **Windows:** run the overlay as a Windows application even when agents run in WSL. Verify ordinary apps, borderless fullscreen, virtual desktops, taskbars, and mixed display scaling.
- **macOS:** validate Spaces, fullscreen Spaces, menu-bar behavior, and nonactivating interaction. Use standard overlay capabilities before introducing accessibility permissions.
- **Linux X11:** validate the supported window managers and compositors explicitly.
- **Linux Wayland:** treat as a separate integration. Electron documents restrictions on global positioning and topmost windows. Layer-shell can support overlays on compositors such as KDE and wlroots, but GTK4 Layer Shell explicitly does not support GNOME-on-Wayland. A GNOME extension or another shell-specific approach would be separate work. [Electron Wayland limitations](https://www.electronjs.org/docs/latest/api/browser-window), [GTK4 Layer Shell supported desktops](https://github.com/wmww/gtk4-layer-shell#supported-desktops)

## Making the pet feel alive

The important separation is **intent → locomotion → pose**, with agent status supplying context rather than directly moving the sprite.

Use a small behavior state machine with weighted choices and minimum dwell times. The pet rests, looks around, walks to an intentional destination, settles, and occasionally stretches or hops. Choose destinations every few seconds rather than adding random motion every frame. Keep a home perch and prefer screen edges so it spends most of its time outside the user's work area.

For walking, use acceleration and braking, turn anticipation, and a stride cycle driven by distance traveled. Feet should appear planted during contact rather than slide across the screen. For hops, use anticipation, an arc, landing compression, and a short settle. Let ears/tail lag the body, and let the head look toward a destination before movement begins. Small asymmetries and varied blink timing make repeated loops less mechanical.

Initial art direction: roughly 80–140 logical pixels tall, a clear silhouette, expressive eyes, and restrained secondary motion. These are tuning starting points, not measured requirements. The pet should be readable against both dark editors and bright web pages. Render sprite poses at their authored cadence while moving smoothly at the display cadence; a 12-frame-per-second walk can still move smoothly across a 60 Hz display.

| Situation | Intended behavior |
| --- | --- |
| No active work | Rest, blink, occasionally wander or nap. |
| Agents working | Alert posture, gentle walking or a quiet work loop. Avoid frantic motion as counts increase. |
| Human input requested | Immediately update the badge; orient toward the user, stop roaming, and play one short attention gesture. |
| Result ready | A brief pleased reaction, then a persistent result marker until acknowledged. |
| Connection uncertain | A neutral disconnected/unknown marker; retain the last observation with its age in the detail view. |

Do not make an alert wait for the current animation to finish. Change the badge immediately, then blend or interrupt the pose at a sensible point. Batch bursts of requests into one attention gesture; keep the count visible. Acknowledging a gesture silences animation, but does not resolve the agent's outstanding question.

Allow drag-and-drop repositioning, pause roaming, reduced motion, size adjustment, and mute. While hovered or while its menu is open, the pet stays still. A cursor exclusion zone can make it politely move away from the immediate work area without reading keystrokes or screen content.

Walking on the borders of actual application windows is an optional later feature. It requires platform-specific window geometry, occlusion, minimized-window handling, and permission/compositor work. The first version should roam its desktop work area and edge perches convincingly without this dependency.

### Appearance format and Claude Design workflow

The implemented baseline uses the OpenPets two-file package: `pet.json` plus a fixed 8-column `spritesheet.webp`. V1 has nine 192 × 208 rows; V2 has eleven. The full field, row, safety, attribution, source-handoff, and review contract is in [ASSET_PACK_GUIDE.md](ASSET_PACK_GUIDE.md). Keep that guide synchronized with validator behavior and the renderer.

The fixed layout is less expressive than the previously proposed arbitrary PNG atlas, but it has a decisive present benefit: a working ecosystem and direct access to the OpenPets gallery. It already covers idle, directional running, attention, success, failure, waiting, working, review, and optional gaze poses. The runtime owns status meaning and movement, so a pet cannot redefine what “needs you” means.

Add a dedicated preview route with synthetic events and controls for scale, backgrounds, reduced motion, and each semantic row. The importer already checks ZIP paths, sizes, compression, file inventory, metadata, and image dimensions; full decoded-image verification and a public standalone validator remain follow-up work. Imported packs contain no executable code.

The asset guide remains a standalone product/design brief. Each complete design contribution includes editable sources, license and attribution, `source/design-review.png` showing working/needs-you/result/unknown scenarios and the individual-agent panel, and `source/design-notes.md` explaining interactions and accessibility. These materials stay outside the two-file compatibility ZIP because the OpenPets runtime format accepts only its manifest and WebP.

For Claude Design, use a fixed brief to compare several silhouettes and motion concepts at actual desktop size. Request a transparent background, stable proportions, consistent root position, front/side references, and the same four baseline loops for every candidate. Ask for editable sources and a motion specification; then convert the selected design into the pack format and clean up frame continuity and foot contact. AI-generated individual frames often need that consistency pass.

Claude Design documents folder/HTML export and developer handoff, which supports this concept-and-prototype workflow. It does not establish an automatic production sprite-rig export. Treat generated HTML as a design reference, not an executable community skin. [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs)

Rive is a good optional follow-up for a selected design that benefits from a rig, smooth blending, or gaze controls. Its web runtime supports state machines and bundled `.riv` assets. Keep that behind the same semantic animation interface; require neither Rive authoring nor a commercial tool for baseline contributions. Review scripting/resource capabilities before accepting third-party `.riv` packs. [Rive web runtime](https://rive.app/docs/runtimes/web/web-js)

## Accurate agent status with low latency

### Model facts separately from presentation

Each entity needs a namespaced identity including provider, collector/environment, session, and agent ID, plus parent ID, current turn/run, source capability, timestamps, and evidence. Record activity separately from a set of unresolved requests. A nonblocking question and active computation can coexist.

Suggested activity values: working, idle, completed, failed, interrupted, ended, unknown. Each pending request has an ID when available, kind (approval/question/plan/MCP input), blocking or nonblocking status, evidence/confidence, and a resolution marker. Keep local “result acknowledged” separate from provider state.

The main badges read **“N working · M need you”**, with a separate result-ready marker. Count unique runnable agents for work, with parent/child breakdown in the popover. Exclude a parent from the worker count only when reliable evidence says it is merely waiting for children; otherwise show it as an active parent. Count each attention-requiring agent once even if it has several requests. Counts can overlap when that agent continues working while a question is open. Never sum working and needs-you as a total.

The popover shows provider, project, session/subagent, request type, freshness, and a user-triggered way to return to the session. Show root-session count separately so “5 agents across 2 sessions” is understandable. Missing subagent visibility is a capability limitation, not a zero count. Unknown sources must remain visible rather than silently disappearing.

### Source priority

1. A documented event stream for the **actual running session**, when available.
2. Supported lifecycle/tool hooks in the user's normal agent environment.
3. Incremental transcript watching and read-only metadata for recovery and older versions.
4. Infrequent liveness/discovery reconciliation, never output-age guessing as the main state machine.

This hierarchy is per fact and per session. A source might identify a session reliably while being unable to resolve its approval state. Store that distinction.

### Claude Code adapter

Use capability-tested `SessionStart/End`, `UserPromptSubmit`, `Stop`, `SubagentStart/Stop`, and tool lifecycle hooks. Detect structured questions through `PreToolUse` for `AskUserQuestion`/`ExitPlanMode`; use `PermissionRequest` and supported `Elicitation/ElicitationResult` events for attention. Correlate subsequent tool results/failures and prompts to clear requests. `Stop` is a completion candidate because another stop hook can continue work.

Do not rely on notification delivery for minimum latency: current docs describe roughly six-second gating for permission notifications and roughly 60 seconds for idle notifications. Newer `agent_needs_input` notifications require a later version than the locally installed 2.1.161. Supported HTTP hooks can post directly to a local collector and avoid spawning a process; respond neutrally and immediately. [Claude Code hooks](https://code.claude.com/docs/en/hooks)

### Codex adapter

Current documentation provides session, prompt, tool, permission, subagent, stop, and interrupt hooks. The original 0.155.0 research check and the current 0.157.1 reference installation both report hooks enabled. Use these after a compatibility test. Preserve `turn_id` and `agent_id`: documented subagent hook `session_id` refers to the parent. Tool-hook coverage has exceptions, so test structured questions rather than assuming every frontend/tool path fires. Observer responses must satisfy each event's schema; `Stop`/`SubagentStop` require JSON. [Codex hooks](https://learn.chatgpt.com/docs/hooks)

Where a supported connection exists to the running app-server, consume `thread/status/changed`, turn/item lifecycle events, request events, and `serverRequest/resolved`. The documented status includes `waitingOnApproval`; request events cover structured input. This provides stronger resolution evidence than inferring it from a later tool result. However, **launching another app-server is not a global observer attachment** to independently running CLIs or the desktop app. Do not resume threads merely to inspect them. An optional client/broker integration is later work for users who want the fullest stream coverage. [Codex app-server](https://learn.chatgpt.com/docs/app-server)

### Accuracy limits to expose

- A permission hook fires before the overall approval flow finishes. Another hook, auto-review, or policy may resolve or deny it without a lasting human prompt. Mark the initial fact as “approval requested”; promote it to confirmed blocking only with appropriate evidence. If resolution cannot be observed until tool completion, expose that limitation instead of promising exact state during the gap.
- An arbitrary assistant sentence asking a question is not a universal structured event. A finished reply can be shown immediately as a result ready for review; semantic “needs an answer” is not guaranteed without structured evidence. Do not add an LLM classifier to this critical path.
- Hooks can be disabled, untrusted, unavailable in a frontend, or missing at the time a session started. Show a coverage warning and support reconnect/restart instructions. Do not imply a retroactive hook stream exists.
- A living CLI process is not proof of work, and a quiet transcript is not proof of idleness. A collector heartbeat proves collector health, not agent progress.
- Read-only monitoring cannot universally focus the exact terminal tab. Use verified links/integrations where available; otherwise show a copyable session reference and a documented resume option, without automatically launching a competing session.

### Transport, ordering, and recovery

Keep a persistent collector in each execution environment. Normalize events there, then send snapshots/deltas to the desktop host. A local Unix socket/named pipe is preferred for command-hook shims; supported Claude HTTP hooks can use an authenticated loopback endpoint. Strip prompts and tool bodies before storing or forwarding data. Keep hook responses neutral: no permission decisions, injected context, or agent-visible logging.

For the initial command shim, use a packaged, bounded helper and measure startup cost. Prefer a small executable if repeated interpreter startup breaches the latency budget. Avoid adding a native build-tool requirement to a fresh clone without providing a reproducible distribution path. Hook failure must never depend on a remote service; use bounded local buffering and an explicit dropped-event/coverage indicator if delivery fails.

Assign collector instance IDs and monotonic ingestion sequences. Preserve provider turn/request IDs and source timestamps where present. A collector sequence orders receipt, not necessarily occurrence: late concurrent hook invocations still require correlation and reconciliation. Ignore duplicate transitions, prevent an old turn's stop from ending a newer turn, and retain unresolved requests independently of unrelated tool activity.

On reconnect, replace state from an authoritative snapshot and replay deltas after its watermark. Mark restored state uncertain until reconciled. For fallback files, watch directories plus active files, read only appended bytes, buffer partial JSONL records, handle replacement/truncation/rotation, and perform a slower safety scan to recover missed watch events. Do not re-read every transcript for every update.

Use process exit where correlated safely (PID plus process start identity), session-end events, and collector health to handle crashes. A lost collector becomes disconnected promptly; it must not turn all agents into idle or retain an unqualified working badge forever.

### Windows + WSL connection

Run collection **inside WSL**, where agent hooks and filesystem events occur. Do not continuously scan Linux transcripts through a Windows UNC share.

Preferred bridge: the native Windows host launches one persistent `wsl.exe --distribution <chosen distro> --exec <collector>` process and consumes a framed stdio channel. The Linux collector accepts local hook events; the bridge stays alive across many events. Bundle/install its compatible runtime or self-contained artifact so a new WSL environment does not need an undocumented Node/Python installation. Use one selected distro initially; namespace multiple distros when added. Do not start every installed distro at login.

This bridge is a proposed architecture to validate, not a benchmarked guarantee. It avoids relying on symmetric localhost networking: Microsoft's docs distinguish Windows-to-WSL forwarding from WSL-to-Windows access in NAT mode, with different behavior under mirrored networking. An authenticated loopback WebSocket is an alternative after an explicit connectivity check. No broad firewall opening or `0.0.0.0` listener should be necessary for the default design. [WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands), [WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking)

### Performance acceptance targets

These are **proposed targets, not measured results**:

| Metric | Initial target |
| --- | --- |
| Supported hook/event emission to visible badge | p95 under 200 ms locally; under 300 ms across WSL |
| Additional synchronous observer time | p95 under 20 ms with direct/persistent local transport; measure helper startup separately |
| Collector disconnect indication | Within 3 seconds of a broken bridge or missed health deadline |
| Fallback transcript update | Normally under 1 second after a record is flushed; actual source buffering remains outside our control |
| Motion | Smooth on a 60 Hz display, with no visible foot sliding or DPI-boundary jumps |
| Resting cost | Target under 1% of one CPU core averaged at rest on a named reference machine; profile total RSS/GPU cost and battery effect |

Measure source emission, ingestion, reducer update, and first painted badge separately. Cross-OS wall clocks must not be subtracted blindly: use a calibrated offset/round-trip estimate and report uncertainty. Measure both warm and cold paths. Longer decorative animation can follow the immediate badge.

## Installation and GitHub readiness

Plan two paths: a packaged desktop release with a short integration wizard, and a fresh clone with a pinned Node toolchain, lockfile, documented install/start commands, and demo mode. The initial developer experience is now `npm ci` followed by `npm run dev`, with `npm run check` for validation. Native Windows development is documented explicitly so WSLg is not mistaken for a native-Windows overlay test.

The first-run wizard detects providers, versions, configured homes, and selected WSL distro; explains available coverage; installs only the chosen monitoring entries; and runs an event-delivery check. Preserve existing configuration and comments where practical, back up before edits, detect concurrent edits, and remove only our entries on uninstall. Respect Codex hook trust and managed policies. This planning task does not install anything.

Ship a default licensed pet, example pack, sanitized event fixtures, offline demo mode, integration diagnostics, and a clean uninstall path. Autostart is optional. Put personal settings and event caches in OS app-data locations, not the repository. Pin and bundle runtime assets rather than depending on a CDN.

Keep packaged renderer content isolated and sandboxed, validate all IPC, and allow only narrow actions such as reading status, changing pet settings, or explicitly opening a validated session target. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

Build releases in platform CI. Document unsigned-build warnings honestly until signing/notarization is configured. Test installation in clean environments without the original machine's paths or agent history. Choose a repository license before distributing copied source/assets, and document asset provenance separately.

Proposed module boundaries, not an instruction to scaffold them now:

```text
apps/desktop/          windows, tray, preload, pet view, settings
packages/status/       event schema, reducer, counts, replay
packages/collectors/   provider adapters, watches, local transport, WSL bridge
packages/pet/          behavior, motion, renderer contract, pack validation
pets/                  bundled example appearances and editable sources
fixtures/              sanitized provider events and demo scenarios
docs/                  setup, architecture, pack authoring, compatibility
```

## Implementation sequence and decision gates

1. **Prove the two hard foundations.** After implementation is authorized, test a minimal Windows overlay and a metadata-only event tracer against the installed agents. Validate transparency, click-through, focus, smooth motion, mixed DPI, request/resolution, questions, subagents, and WSL reconnection. Record exact version/OS results. Switch host strategy only if evidence requires it.
2. **Build status before detailed art.** Implement identities, a pure reducer, snapshot/replay, capability reporting, and synthetic scenarios. Verify duplicate/out-of-order events, multiple pending requests, crash recovery, and long quiet turns. Make the working/needs-you counts dependable.
3. **Ship a useful vertical slice.** Connect both providers, the Windows/WSL bridge, a placeholder pet, badges, a session popover, hide/show, and reduced motion. Measure end-to-end latency and test long tool runs and automatic approval resolution.
4. **Develop personality and the pack contract.** Build one coherent motion system, compare Claude Design candidates through the same preview, finish the first appearance, then install a second independently authored pack without changing core code.
5. **Make it reproducible.** Implement the integration wizard/doctor/uninstaller, demo mode, pinned development setup, CI checks, packaged Windows release, documentation, and a clean-machine trial. Remove all assumptions about the original home directory.
6. **Expand only with verified support.** Add macOS, named Linux environments, optional Rive rendering, richer terminal navigation, or window-edge perching after the Windows experience meets its criteria. Keep the same status and appearance contracts.

Release acceptance must include a real keyboard/mouse session, monitor unplug/replug, suspend/resume, WSL shutdown/restart, denied and canceled approvals, a permission automatically resolved by another mechanism, foreground/background subagents, resumed subagents, concurrent nonblocking questions, continued stop hooks, long silent work, and a pet-offline scenario that leaves the coding agent usable.

Platform priority is confirmed: Windows + WSL first, cross-platform later. The unresolved technical promises are exact passive resolution coverage in each provider/frontend/version, selective click-through under rapid input, and movement/resource behavior on the target displays. Those are explicit first-phase measurements, not reasons to build the rest on assumptions.
