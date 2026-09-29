# AgentPup

AgentPup is an early Windows desktop companion for seeing local Claude Code and Codex activity. It combines a transparent Electron overlay and deterministic provider-independent status engine with OpenPets-compatible animated designs.

Its focus is trustworthy attention state for concurrent coding agents:
distinguishing work, unresolved human input, finished results, interruptions,
and disconnected collectors without reading prompt or tool bodies. The first
supported setup is a native Windows overlay monitoring agents in Windows and WSL.

Agent monitoring stays local and omits prompt and tool bodies. Pet gallery access is optional; imported designs are stored in the operating system's application-data directory and require no AI subscription or API key.

## Development setup

Requirements:

- Node.js 24 (the pinned major is in `.node-version`)
- npm 11 or the npm version bundled with Node 24
- Windows for validating native overlay behavior

From a fresh checkout:

```sh
npm ci
npm run check
```

Run local metadata discovery from a native Windows terminal:

```sh
npm run dev
```

This discovers recent Codex and Claude Code sessions from their configured homes. It reads only session IDs, project names, and file timestamps; prompt and tool bodies are neither retained nor sent to the renderer. Sessions remain explicitly unknown until lifecycle hooks provide trustworthy live state.

Run the fully synthetic mixed-workload scenario with:

```sh
npm run demo
```

From WSL, build and launch the native Windows development app with:

```sh
npm run dev:windows
```

This reuses Electron's signed Windows runtime from the local cache, starts a persistent metadata-only collector inside the current WSL distribution, and streams live Codex and Claude Code transcript lifecycle updates to the Windows overlay. Run `npm run package:windows` once first if the runtime has not been downloaded yet.

Use `npm run demo:windows` when you want the synthetic mixed-workload scenario instead of local agent data.

Install the optional low-latency provider hooks with:

```sh
npm run integration:preview
npm run integration:setup
npm run integration:doctor
```

The preview is read-only. Setup builds the local helper, backs up existing files, and merges AgentPup-owned command hooks into the configured Claude Code and Codex homes. Re-running setup is idempotent. Codex keeps its normal trust control: open `/hooks` in Codex and approve the new user hook before it can run. Remove only AgentPup-owned entries with `npm run integration:uninstall`; unrelated hooks and settings remain intact.

The same controls are available in **Pet settings → Agent integrations**. On a
first run with missing or invalid hooks, AgentPup opens that page automatically.
Install or repair deploys the helper to `~/.agentpup/runtime/`, so monitoring
does not depend on keeping the cloned repository in its original location. The
provider check also discovers common NVM, Volta, local-bin, and Claude-local
installations when the desktop process has a restricted non-login PATH.

The hook helper writes sanitized lifecycle metadata to `~/.agentpup/events/` and immediately returns a neutral `{}` response. It never approves or denies a request, modifies tool input, adds model context, or calls an AI service, so monitoring consumes no model tokens. Hook failures are swallowed so the coding agent does not depend on AgentPup being available. During migration, the collector also reads the legacy `~/.claudepet/events/` inbox and installation replaces legacy owned hooks safely.

Automatic roaming is disabled in the default Windows run while mixed-DPI and multi-monitor positioning is being validated. Use the round-arrow button beside the pet to move it clockwise to the next corner of its current display. The vertical status bar stays nearest the screen edge, with the pet positioned inward from it.

Finished, interrupted, and failed entries have an individual X in Agent
activity. **Clear inactive** removes all currently removable entries at once and
leaves working or waiting entries visible.

For the native Windows development host, register the stable LocalAppData copy
to start when Windows signs in with:

```sh
npm run autostart:windows
```

Remove that login registration with `npm run autostart:windows:disable`. The
launcher preserves the selected WSL distribution and can recover when WSL's
Windows-executable binfmt registration is temporarily unavailable.

Pet settings and the tray menu provide **Start with Windows** on Windows and
**Start at login** on macOS and Linux. Fresh installs leave it disabled. Either
checkbox can enable or disable it later, and both stay synchronized. Windows
and macOS use Electron's native login-item service;
Linux uses an AgentPup-owned freedesktop entry at
`$XDG_CONFIG_HOME/autostart/dev.agentpup.desktop` (or
`~/.config/autostart/dev.agentpup.desktop`). On unsigned macOS development and
release-candidate builds, the operating system may not honor the login item
until the app is signed and notarized. On every platform, clicking the tray icon
stops the pet window and collector
while retaining the small controller; clicking it again starts a fresh pet
runtime at the default bottom-right corner of the primary display. Native macOS
and Linux tray behavior remains experimental until it is checked on real
desktops.

## Pet designs

Click the pet to open agent activity, then choose the gear button to open **Pet settings**. Settings let you hide the character while retaining the status bar, resize the pet, disable sprite animation, adjust the status bar's overall size, number font size, and row spacing, and keep only the newest 0–20 finished-result entries. The default is five; active agents and pending requests are never removed by this limit. The design controls provide three actions:

- **Gallery ↗** opens the [OpenPets gallery](https://openpets.dev/#pets) in the default browser.
- **Import .zip** opens a native file picker. Download a gallery pet's `.zip`, then select it here; the imported pet becomes active immediately.
- **Next pet** cycles through the original bundled AgentPup and every imported design.

AgentPup accepts OpenPets V1 and V2 packs containing `pet.json` and `spritesheet.webp`. Imports validate archive paths, file types, metadata, byte limits, and the fixed sprite dimensions before an asset reaches the renderer. The selected design persists across restarts. The built-in AgentPup source art, export script, design notes, and MIT license are kept in `pets/agentpup`. Individual gallery entries can have separate rights or attribution requirements; see the pack's gallery information before redistributing it.

**Diagnostics** in Pet settings shows the collector connection, last valid snapshot, detected Codex and Claude Code versions, hook configuration and observed delivery, transcript recovery, capabilities, and the last sanitized lifecycle event. **Copy diagnostic report** copies only those fields and aggregate counts; it excludes prompts, tool data, project names, session and turn identifiers, distro names, and file paths.

Build an unpacked native Windows app from WSL with:

```sh
npm run package:windows:dir
```

The executable is written to `release/win-unpacked/AgentPup.exe`. Launch it with `--demo` to validate the native Win32 overlay before live WSL collection is connected.

Build the unsigned NSIS installer from native Windows with:

```sh
npm run package:windows
```

The installer is written to `release/AgentPup-Setup-<version>.exe`. Building
that NSIS target from Linux or WSL requires Wine; the repository's Windows CI
workflow builds it on `windows-latest` and uploads it as an unsigned artifact.
Windows may display an unrecognized-publisher warning until code signing is
configured.

Cross-platform packaging has begun with unsigned artifacts built on native CI
runners:

```sh
npm run package:mac
npm run package:linux
```

The macOS command produces a ZIP and the Linux command produces an AppImage.
Both packages run the bundled local collector through Electron and do not
require a separate Node.js installation. These artifacts are experimental until
their overlay, tray, focus, fullscreen, and compositor behavior is validated on
real macOS, Linux X11, and supported Wayland desktops. Linux CI also launches
the packaged app in a virtual X11 desktop and checks that an empty overlay area
passes a click to a background window while the visible rotate control retains
its click. macOS CI reads the packaged window's native state after it is shown
and checks bottom-right placement, visibility, nonactivation, topmost behavior,
and shadow removal.

On Linux, diagnostics distinguish X11, native Wayland, WSLg, and an unknown
display backend. X11 is the current overlay target. Electron does not support
programmatic positioning, moving, or always-on-top windows on native Wayland,
so that mode is reported as limited rather than presented as equivalent. On a
Wayland desktop with Xwayland installed, launch AgentPup with
`--ozone-platform=x11` to select the current positioning path. On X11/Xwayland,
AgentPup limits its native input shape to the visible pet, status controls, and
open activity panel so the rest of the transparent window passes clicks to the
application below. This behavior still requires real-desktop X11 validation.
Linux CI also launches the packaged AppImage in a headless native Wayland
compositor and verifies that AgentPup detects Wayland, shows a nonactivating
window, and does not claim unsupported topmost or shaped-click-through support.

Before publishing a final release, follow the
[clean-machine Windows checklist](docs/WINDOWS_RELEASE_CHECKLIST.md).

The demo shows five fictional agents, including simultaneous work and a nonblocking question, a provisional approval request, one helper result, and parent/helper grouping. Click the pet or badge to open the detail panel. Use the round-arrow button to move the overlay to another corner. The overlay is configured to pass clicks through transparent areas; this behavior still needs the native-Windows feasibility checks in the plan.

The live transcript adapter reports lifecycle transitions and structured questions without retaining prompt, answer, or tool bodies. Installed hooks add immediate permission, resolution, interruption, and subagent events. Opening or resuming a Claude Code session does not count as work; AgentPup waits for a submitted prompt or subagent start. Transcript scanning remains the recovery path when hooks are absent or an installed version does not emit an event. If the collector exits or WSL restarts, the desktop host marks its last snapshot disconnected and restarts the collector with bounded exponential backoff. A valid recovered snapshot restores live state without accumulating duplicate agents.

Running Electron from inside WSL opens a surfaced WSLg preview at the top-right of the desktop. It is useful for UI development, but it does not validate the native Windows overlay promised by this project. Install Node 24 on Windows and run the commands from PowerShell or Windows Terminal for the platform feasibility check.

## Implemented boundaries

- `packages/status`: JSON-serializable event types, identity namespacing, ordering and deduplication, request tracking, collector disconnect behavior, aggregate counts, and demo events.
- `packages/collectors`: bounded Codex and Claude Code transcript adapters, metadata-only discovery, and a versioned WSL snapshot protocol.
- `packages/integration`: idempotent hook configuration merging, backup-safe writes, inspection, and selective uninstall.
- `packages/pets`: OpenPets V1/V2 validation, bounded ZIP import, fixed animation semantics, and installed-pet discovery.
- `apps/desktop`: hardened Electron window, cross-platform tray runtime controls, narrow preload bridge, compact status UI, OpenPets sprite renderer/library controls, reduced-motion styling, and synthetic demo mode.
- `scripts/build.mjs`: reproducible local bundling into `dist/` with no global build utility.

Common Claude Code and Codex lifecycle paths, collector-process recovery, and
single-display click-through/focus behavior have been manually exercised on the
reference Windows/WSL setup. Cross-frontend coverage, mixed-DPI and monitor
lifecycle checks, polished roaming, signing, and clean-machine
release validation remain. See [docs/VALIDATION.md](docs/VALIDATION.md) for the measured
handoff and [docs/PLAN.md](docs/PLAN.md) for the implementation sequence.

## License

AgentPup is available under the [MIT License](LICENSE). Third-party assets and
dependencies retain their respective terms; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
