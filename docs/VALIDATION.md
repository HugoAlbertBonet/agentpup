# Validation status

Last updated: 2026-09-28.

This ledger records measured behavior separately from targets in
[PLAN.md](PLAN.md). It is the continuation point for manual acceptance work.
Do not mark a scenario complete based only on similar automated coverage.

## Current reference environment

- Native Windows Electron host launched from WSL with npm run dev:windows
- Electron 44.4.5
- Codex CLI 0.157.1
- Claude Code 2.1.161, including its VS Code frontend
- Persistent collector running inside WSL and streaming metadata-only snapshots
- Latest full npm run check: 26 test files and 109 tests passed, followed by a successful build

Provider prompts, answers, tool arguments, and tool output were not copied into
the validation notes. Diagnostics and inspection scripts used only sanitized
lifecycle structure or aggregate counts.

## Manually verified in the reference environment

### Agent status and requests

- Opening or typing in an empty Claude Code VS Code chat does not create a false
  working state.
- A normal Claude Code turn becomes working and then result ready.
- Claude Code AskUserQuestion creates needs-you state and clears after an answer.
- Two independent Claude Code questions can remain pending simultaneously;
  resolving either one decrements only its own request.
- Claude Code permission requests appear while pending and clear after allow or
  deny without monitoring making the decision.
- Claude Code cancellation during a running Bash tool becomes interrupted. The
  transcript fallback recognizes the structured user-rejected tool result and
  ignores its linked synthetic trailing user record.
- Codex permission requests appear and clear after one-time approval.
- Codex `PermissionRequest` lifecycle hooks begin as provisional because they
  run before Codex combines policy and hook decisions. An ordinary `PreToolUse`
  clears an automatically approved request; one that remains blocked beyond the
  two-second grace period becomes confirmed and triggers needs-you. Existing
  installations must repair hooks once to add ordinary Codex pre-tool coverage.
- Codex structured questions create exactly one needs-you entry. Answering or
  cancelling the question clears it without leaving a duplicate request.
- Codex turn cancellation becomes interrupted and does not create a ready result.
- A Claude Code root plus one subagent counts as two working agents. SubagentStop
  ends the helper without creating a second user-facing ready result; only the
  root result remains ready.
- Claude Code SubagentHandback ends the helper. Interrupting the parent after
  handback marks the root interrupted and does not leave either identity working.
- Resuming the same Claude Code subagent reactivates the existing helper without
  creating a duplicate; handback ends it and only the root publishes a ready result.
- A silent 45-second tool run remains working for its full duration and becomes
  ready only after the final response.
- Ready, ended, interrupted, and failed rows can be dismissed independently.
  Repeated collector snapshots do not restore the same observation; a newer turn
  for that identity makes it visible again.

### Collector and desktop behavior

- Killing the active WSL collector causes the Windows host to start one
  replacement collector. State recovers without duplicate agents, and
  diagnostics returns to connected.
- Integration setup migrated both providers to the self-contained
  `~/.claudepet/runtime/hook.cjs`; existing settings were backed up and the hook
  delivery doctor passed.
- The built integration status command detects the installed Codex and Claude
  Code versions when launched with a restricted non-login WSL PATH; provider
  discovery covers common PATH, local-bin, Volta, Claude-local, and NVM locations.
- After a Windows restart, the tray icon was absent because the development host
  had no login registration. The new autostart command installed and read back a
  `dev.claudepet.desktop` Windows Run entry targeting the stable LocalAppData app,
  Electron runtime, and selected WSL distro. A subsequent reboot is still needed
  to validate execution of that entry.
- The unpacked Windows artifact builds successfully from WSL and contains the
  collector, integration CLI, and hook helper as unpacked runtime resources.
- The 0.1.0 unpacked artifact was copied to LocalAppData and launched without
  repository runtime paths. Four packaged Electron processes and the bundled WSL
  collector remained active; the packaged integration doctor detected both
  providers and hooks and passed delivery. A binary/path scan found no embedded
  `/home/hugo/claudepet` reference.
- The previous 0.0.0 NSIS output was an incomplete 185 KB stub beside a 108 MB
  payload archive. Release verification now rejects installers smaller than the
  embedded application payload and checks every required runtime file.
- The Windows release workflow now installs each NSIS candidate into a fresh
  temporary directory on a GitHub-hosted Windows runner, launches the installed
  app for a bounded smoke test, and silently uninstalls it. Visual overlay and
  real-provider behavior remain manual checks on the reference computer.
- The settings and diagnostics views scroll to their full contents.
- Transparent overlay regions pass clicks through to the application below.
- Hovering the overlay and opening/closing the activity panel preserve keyboard
  focus in the underlying application in the tested single-display setup.
- The overlay stays above ordinary tested windows, has no native window shadow,
  and can rotate among screen corners without leaving the work area.
- Changing the reference display scale from 100% to 125% and back while the app
  was running kept the overlay visible and correctly placed within the work area.
- The status panel stays nearer the selected screen edge than the pet.
- OpenPets V1/V2 animation, local ZIP import, pet selection, visibility, scale,
  animation preference, and status-panel sizing controls work in the native
  Windows development host.
- Agent rows display locally bundled OpenAI and Claude provider marks alongside
  the provider name.

## Release automation observations

- The public repository is connected at
  `github.com/HugoAlbertBonet/agentpup`; `main` and the release-candidate tag
  workflow are active.
- Windows workflow run 36475245001 (`v0.1.0-rc.1`) completed checkout, Node 24
  setup, and `npm ci`, then failed in `npm run check`. It exposed extensionless
  provider discovery and POSIX-only path assertions. Provider discovery now
  checks native Windows `.exe`, `.cmd`, and `.bat` names, and the affected
  tests use platform-native paths. The corrected suite passes locally; a native
  Windows rerun remains required before marking the CI/NSIS check successful.
- Windows workflow run 36475782698 (`v0.1.0-rc.2`) confirmed provider discovery
  and hook serialization now pass on Windows. One remaining development-runtime
  assertion embedded a POSIX path; it now constructs both the input and expected
  value with the host path module. A further native Windows rerun is required.
- Windows workflow run 36476024260 (`v0.1.0-rc.3`) passed `npm ci` and all
  checks on native Windows, then failed in the NSIS packaging step. The original
  workflow exposed only an exit code through the public check API and skipped
  artifact upload, so package-log capture is being added before diagnosing the
  builder or verifier failure.
- Windows workflow run 36476506979 (`v0.1.0-rc.4`) passed native Windows
  checks and built `AgentPup-Setup-0.1.0.exe` plus its block map. The step then
  failed because electron-builder implicitly attempted GitHub publication for
  the tag without a `GH_TOKEN`. Packaging now passes `--publish never`; the
  workflow remains responsible for uploading the verified unsigned artifact.
- Windows workflow run 36476977238 (`v0.1.0-rc.5`) passed `npm ci`, all 99
  tests, the native NSIS build, installer payload verification, and artifact
  upload. Artifact `AgentPup-Windows-unsigned` is 114,875,830 bytes with
  GitHub artifact digest
  `sha256:6b9442ac67bc935b12d26622c8612d0abc36c8a65395e51eb8d227468e95378e`.
  A newer candidate is required for the packaged tray autostart control before
  the clean-machine trial.
- Windows workflow run 36477664888 (`v0.1.0-rc.6`) passed `npm ci`, all 100
  tests, the native NSIS build, installer payload verification, and artifact
  upload with packaged tray autostart included. Artifact
  `AgentPup-Windows-unsigned` is 114,876,544 bytes with GitHub artifact digest
  `sha256:4e3701418c56b9c1567b0a3186175194432cf64ab3128fa390d12ab22991ab96`.
  This was the candidate before automated clean-install coverage was added.
- Windows workflow run 36478879228 (`v0.1.0-rc.7`) passed `npm ci`, all 101
  tests, the native NSIS build, installer payload verification, clean install
  into an empty directory on a fresh GitHub-hosted Windows runner, launch of the
  installed app, process shutdown, silent uninstall, and artifact upload.
  Artifact `AgentPup-Windows-unsigned` is 114,877,110 bytes with GitHub artifact
  digest
  `sha256:eb59bbd586a2146cac8db912218add40ffa89dc6b9261534d6facb7d207364f7`.
- Windows workflow run 36479747284 (`v0.1.0-rc.8`) passed `npm ci`, all 103
  tests, the native NSIS build, installer payload verification, fresh-runner
  install, installed-app launch, shutdown, silent uninstall, and artifact
  upload with the complete Codex approval distinction. Artifact
  `AgentPup-Windows-unsigned` is 114,877,467 bytes with GitHub artifact digest
  `sha256:aeef485f37935d58278be9046eb34772ec4b911efbd4e0eb243b9bfdaf7f5695`.
- Cross-platform workflow run 36482859316 (`v0.1.0-rc.9`) passed `npm ci`, all
  109 tests, native packaging, and artifact upload on both `macos-latest` and
  `ubuntu-latest`. The unsigned macOS ZIP artifact is 132,417,787 bytes with
  digest `sha256:0e2a126419374af3e6aeef5784909e9730f3ef698f1a9cb026b77cb90d9ada4a`;
  the Linux AppImage artifact is 128,486,011 bytes with digest
  `sha256:876bde4255e73f333089cbc8254156b36b8e778e7b34132b4c7eee9d77264cb6`.
  Packaging success does not establish overlay behavior on a real desktop.
- Windows workflow run 36482859324 (`v0.1.0-rc.9`) also passed all 109 tests,
  NSIS verification, clean install, installed-app launch, shutdown, uninstall,
  and artifact upload after the shared collector changes. The Windows artifact
  is 114,877,845 bytes with digest
  `sha256:9014bbc6b408c0ba0b093cbaef024006beff361377570c345dcbada8344cde92`.

## Still requiring manual or release validation

- Native macOS and Linux packaging workflows, direct bundled collector launch,
  and platform-specific identities are implemented and covered by automated
  tests. Native CI packaging passes; installed-app launch and real-desktop
  overlay behavior have not yet been measured on those platforms.

- A true mixed-DPI multi-display setup, negative desktop coordinates, taskbars
  on non-default edges, monitor unplug/replug, and moving the host between displays
- Suspend/resume, a complete WSL shutdown/restart, stale PID reuse, transcript
  rotation during activity, and recovery after a partially written record
- Borderless and exclusive fullscreen behavior, Windows virtual desktops, lock
  and secure desktops, and presentation-mode policy
- Rapid alternating clicks across interactive and transparent regions, touch
  input, and leaving the overlay during an interaction
- Live validation of permission requests automatically resolved by another
  policy or hook after repairing the integration, continued stop hooks,
  foreground/background subagent combinations, and Codex structured questions
  in other supported frontends
- Long-duration idle CPU, RSS/GPU, battery, hook latency, snapshot latency, and
  first-painted-badge measurements against the targets in the plan
- Pet-offline behavior while an agent continues, full application crash
  recovery, native Windows tray icon visibility/click behavior, and successful
  autostart after another Windows reboot
- Live validation of the packaged first-run integration page, code signing,
  startup registration across reboot, and interactive removal of provider hooks
  without the original repository path
- Visual overlay checks and native/WSL provider integration remain manual on the
  reference computer. A second physical computer is no longer required for the
  self-contained installer check.
- macOS, Linux X11, and Linux Wayland support; these remain outside the first
  Windows release claim

## Recommended continuation order

The user selected this product order on 2026-09-28. Outstanding reliability
checks above remain release criteria and must not be inferred complete.

1. Finish the Windows visual, provider setup, autostart-after-reboot, and
   integration-removal checks using the CI-verified NSIS artifact.
2. Add verified macOS and Linux support, treating Linux X11 and each supported
   Wayland environment separately.
3. Replace the bundled placeholder with an original default AgentPup design;
   imported gallery pets remain optional additions chosen afterward.
4. Measure latency and idle CPU, memory, GPU, and battery use on named reference
   machines.
