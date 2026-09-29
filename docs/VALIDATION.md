# Validation status

Last updated: 2026-09-28.

This ledger records measured behavior separately from targets in
[PLAN.md](PLAN.md). It is the continuation point for manual acceptance work.
Do not mark a scenario complete based only on similar automated coverage.

## Current reference environment

- Native Windows Electron host launched from WSL with npm run dev:windows
- Electron 44.4.5
- Codex CLI 0.157.1
- Claude Code CLI 2.1.161; the affected VS Code transcript reports frontend
  version 2.1.283
- Persistent collector running inside WSL and streaming metadata-only snapshots
- Latest full npm run check: 33 test files and 162 tests passed, followed by a successful build

Provider prompts, answers, tool arguments, and tool output were not copied into
the validation notes. Diagnostics and inspection scripts used only sanitized
lifecycle structure or aggregate counts.

## Manually verified in the reference environment

### Agent status and requests

- Opening or typing in an empty Claude Code VS Code chat does not create a false
  working state.
- Claude Code Auto mode can end a turn after ten consecutive server-side safety
  classifier responses return no verdict. AgentPup's observer hook returns only
  neutral `{}` and does not participate in that classifier. A sanitized
  regression fixture now maps `automode-unavailable` with
  `toolDenialEndsTurn: true` to a failed, result-ready entry instead of leaving
  the session working. A live metadata-only collector snapshot after the fix
  emitted the affected session as result ready.
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
- Retained events produced by the legacy helper do not contain enough evidence
  to distinguish an auto-approved command from a visible prompt. They now remain
  provisional instead of producing false needs-you alerts; new Codex sessions
  use the repaired hook configuration and retain confirmed approval alerts.
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

- The original built-in AgentPup design exports as a valid OpenPets V2 atlas at
  1536 by 2288 pixels with transparency. The runtime and desktop-bundled sheets
  are byte-identical with SHA-256
  `f3c628bcda3db5572c0bf32eebceb996819de4a3b7cef2ec9320adbf3f5d0a9e`.
  The checked-in source handoff includes transparent pose masters, generation
  disclosure, design notes, an MIT license, a deterministic FFmpeg exporter,
  and a review board inspected on light and dark backgrounds. The full suite
  passed with 160 tests after integration. Native Windows animation and sizing
  with this exact sheet still require a user-visible acceptance check.
- Windows workflow run 36531876598 (`v0.1.0-rc.21`) reached the full test suite
  and exposed a test-only URL conversion that duplicated the drive prefix on
  native Windows. The asset reader itself was unchanged; the test now uses
  Node's cross-platform `fileURLToPath`. A corrected candidate is required.
- Windows workflow run 36532152280 (`v0.1.0-rc.22`) passed all 160 tests on
  native Windows, built and verified the NSIS installer, completed the clean
  install/launch/shutdown/uninstall cycle, and uploaded
  `AgentPup-Windows-unsigned` (113,224,715 bytes; GitHub artifact digest
  `sha256:f9230860c492a4bcf4f22905ad57aa533370a1373c1b5ea727dd297988a45f9e`).
- Cross-platform workflow run 36532152377 (`v0.1.0-rc.22`) passed the macOS
  policy gate plus Linux X11 and headless Wayland policy gates, then uploaded
  `AgentPup-macOS-unsigned` (130,772,575 bytes; GitHub artifact digest
  `sha256:cacd06ddeeb0816684de0d09db80ff7fd17af75debc127038203ba1993509fe9`)
  and `AgentPup-Linux-AppImage` (126,839,154 bytes; GitHub artifact digest
  `sha256:913e50fe3334f791e6527fc254d0c60c3a174b2c66b35ee02f530665d0b81f3d`).

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
- Cross-platform workflow run 36485750161 (`v0.1.0-rc.10`) introduced an
  eight-second packaged-app launch gate. macOS passed; Linux failed without a
  useful public log, so the workflow now emits an explicit annotation and
  uploads its bounded launch log on failure.
- Cross-platform workflow run 36486420645 (`v0.1.0-rc.11`) passed all 111
  tests, packaging, packaged-app launch, and artifact upload on both native
  runners. The macOS ZIP is 132,417,431 bytes with digest
  `sha256:31b6ccd1a283756aabb5832412f8144768d5985e74cd2f9d0b60da24e25ce718`;
  the Linux AppImage is 128,485,761 bytes with digest
  `sha256:fb1d0f2de6fc71873d2bd5b46db8d99b5692ae3fc280060fcf98263a84657e0a`.
- Windows workflow run 36486420707 (`v0.1.0-rc.11`) passed all 111 tests,
  NSIS verification, clean install, installed-app launch, shutdown, uninstall,
  and artifact upload. The artifact is 114,877,773 bytes with digest
  `sha256:dfd9967cfa338a87dfa7270e58431547c0b7774e556307f076ac346b9160d643`.
- Release candidate 12 passed the macOS/Linux packaging and packaged-launch
  workflow (run 36487622926) and the Windows test, NSIS, clean-install, launch,
  shutdown, uninstall, and upload workflow (run 36487622932). The Windows
  artifact is 114,877,923 bytes with digest
  `sha256:ed7dba42ff8d12a5bad9b3daf8ff76d0e8178e3e3ea01e776ca7cc9576a51fd9`.
- Release candidate 13 passed the macOS/Linux packaging and packaged-launch
  workflow (run 36520868874) after native tray creation was enabled. The Linux
  AppImage artifact is 128,485,943 bytes with digest
  `sha256:43478d48571c732ee97a74725d41e89b3b0223a4f14623e551c75c200c7bc02e`;
  the unsigned macOS ZIP is 132,417,684 bytes with digest
  `sha256:37b577f6bfbb6c0e1e64c9235f805a7a9cc334f53eb2dbaf1ba2c24c38098d1d`.
  The Windows workflow (run 36520868886) also passed tests, NSIS verification,
  clean install, installed-app launch, shutdown, uninstall, and upload. Its
  artifact is 114,878,281 bytes with digest
  `sha256:8e97651bb76b2a4457d300d204dfa1405b55ccdebaae0524aa05b6cb53f27e79`.
- Release candidate 14 passed the macOS/Linux packaging and packaged-launch
  workflow (run 36522472901) with explicit Linux backend detection and window
  policy. The Linux AppImage artifact is 128,487,311 bytes with digest
  `sha256:8c228e892249c39f5519a4cd12086b248a3f7b78ef6b6e7f42a98e408f812dc0`;
  the unsigned macOS ZIP is 132,418,772 bytes with digest
  `sha256:274059ee81f5190a2618de94d812d117450327a596186d70dfaff90bdfe5fab4`.
  The Windows workflow (run 36522472837) passed tests, NSIS verification, clean
  install, installed-app launch, shutdown, uninstall, and upload after the tray
  restart placement fix. Its artifact is 114,878,746 bytes with digest
  `sha256:98f8b34ef647e37629d6195b901da55e0212d4cf804efd1560834a714e31479e`.
- Release candidate 15 passed the macOS/Linux packaging and packaged-launch
  workflow (run 36524436033) with login-startup state initialization and the
  finished-result retention setting. The Linux AppImage artifact is 128,491,738
  bytes with digest
  `sha256:0329a5c48f3b3f0e032edb34409bd204806985d25b52bc3df364297084193627`;
  the unsigned macOS ZIP is 132,421,418 bytes with digest
  `sha256:928f82ff7ce6ae42c963c527b7898060ca928e0a6633913b07a0048d67c68261`.
  The Windows workflow (run 36524436027) passed tests, NSIS verification, clean
  install, installed-app launch, shutdown, uninstall, and upload. Its artifact
  is 114,881,863 bytes with digest
  `sha256:13131264e3f4ad63888b8c15144ed5d781936da3929ce92d241aaaf6a9868680`.
- Release candidate 16 passed the macOS/Linux packaging and packaged-launch
  workflow (run 36525608167) with the Settings startup control and bounded X11
  window shape. The Linux AppImage artifact is 128,494,591 bytes with digest
  `sha256:e37730d7a99bf074c3a6b0e5944b09ca780422f861077e88b01289f6a997585d`;
  the unsigned macOS ZIP is 132,427,272 bytes with digest
  `sha256:34c7e56cd55d3fc3e7973b9ded666faeaf1fb6a94a15d328f1851e843fd851fa`.
  The Windows workflow (run 36525608275) passed tests, NSIS verification, clean
  install, installed-app launch, shutdown, uninstall, and upload. Its artifact
  is 114,883,835 bytes with digest
  `sha256:f34be3e4aca234142219cfd39611b30f620f43dd90b801e0c588d231cad7dd7d`.
- Release candidate 17 passed the macOS/Linux workflow (run 36526494436),
  including the packaged virtual-X11 behavior check: a click in an excluded
  transparent region reached the background probe, while a click in the shaped
  rotate control did not. The Linux AppImage is 128,494,619 bytes with digest
  `sha256:d4785bec32dde742f0dbeac23618400a6ec40a401a79a6b38eb05c01218adb8f`;
  the unsigned macOS ZIP is 132,427,268 bytes with digest
  `sha256:1ae5e65ddbcab81389beb45a67cedc217d65e97c6047966a7685247a677dd79e`.
  The Windows workflow (run 36526494494) also passed tests, NSIS verification,
  clean install, launch, shutdown, uninstall, and upload. Its artifact is
  114,883,672 bytes with digest
  `sha256:e0387fbddeaf44ad0a5eedef806060ea67840fc9cc2655a7a35d8d90229a14e4`.
- Release candidate 18 passed the macOS/Linux workflow (run 36527672814),
  including both the packaged macOS native-window policy check and the Linux
  X11 click-through check. The unsigned macOS ZIP is 132,428,051 bytes with
  digest `sha256:5e37859e5ca2c9f251cd1d43669c6dc8bf7e935ffa2ae252ef83e0aa647f0fd7`;
  the Linux AppImage is 128,495,059 bytes with digest
  `sha256:e93747fa73ada7877eeb4054c9440199b3353f25d7a692dea192500d2aa2b283`.
  The Windows workflow (run 36527672753) failed in `npm run check` because the
  new report-path unit test used a POSIX absolute path on the Windows runner.
  The test now constructs its input with the host path module; a corrected
  native Windows run remains required.
- Release candidate 19 passed the macOS/Linux workflow (run 36528032023),
  repeating both packaged desktop acceptance checks after the test-path fix.
  The unsigned macOS ZIP is 132,427,918 bytes with digest
  `sha256:c269c782424fba6e837b7a53764fa2cd96c6a0a7f6b83a4ecdabf7d4554be7a6`;
  the Linux AppImage is 128,495,038 bytes with digest
  `sha256:e8c73e97cc431767539036643ec73cd948d398792761d535619a8c64ecaf3c60`.
  The Windows workflow (run 36528032066) passed all 150 tests, NSIS
  verification, clean install, installed-app launch, shutdown, uninstall, and
  upload. Its artifact is 114,884,638 bytes with digest
  `sha256:5aaa316f4fe8b24974e3e749b3035dd34aa150fcc09cc91bd176a6367f1062e7`.
- Release candidate 20 passed the macOS/Linux workflow (run 36529601889),
  including packaged macOS policy, Linux X11 input-shape, and headless native
  Wayland limited-policy acceptance. The unsigned macOS ZIP is 132,428,059
  bytes with digest
  `sha256:3257d032d74278166def30473b61ef9653e6815edae48ba151d1a436e99c53f5`;
  the Linux AppImage is 128,495,269 bytes with digest
  `sha256:8bbef9117912de40804aed4b3d56fe684bf0d02139c32d4b44d93b0a706d723e`.
  The Windows workflow (run 36529601910) passed all 157 tests, NSIS
  verification, clean install, installed-app launch, shutdown, uninstall, and
  upload. Its artifact is 114,884,391 bytes with digest
  `sha256:fdb1cfe1a7d9573e1d9cefdfb4dfcd5e7d1644bf50ade0dcc65d8df0afcfd649`.

## Still requiring manual or release validation

- Native macOS and Linux packaging workflows, direct bundled collector launch,
  and platform-specific identities are implemented and covered by automated
  tests. The desktop host now also creates a platform-sized tray controller on
  both systems with stop/start and quit actions. macOS uses Electron's native
  main-app login service, while Linux atomically manages only its own
  freedesktop autostart file and uses the stable AppImage path when available.
  The same opt-in setting is now exposed inside Pet settings on all three
  platforms and synchronized with the tray checkbox; fresh installs remain
  disabled and either control can remove an existing registration.
  The macOS control may not take effect for unsigned/unnotarized builds. Linux
  runtime diagnostics and policies distinguish X11,
  native Wayland, WSLg, and an unknown backend. Native Wayland is explicitly
  limited because Electron does not support the required positioning, movement,
  or always-on-top APIs there; X11/Xwayland is the current implementation
  target. Native CI packaging passes; installed-app launch and real-desktop
  overlay/tray behavior have not yet been measured on those platforms.
- Linux X11/Xwayland now uses Electron's native window shape to retain input on
  the visible pet, status controls, and open panel while excluding the remaining
  transparent canvas. Automated coverage validates runtime policy and rejects
  empty, oversized, fractional, negative, excessive, or out-of-window shape
  messages. Real X11 click-through and interaction behavior is still unmeasured.
  The native Linux workflow includes a packaged virtual-X11 acceptance test
  that clicks both an excluded transparent point and the included rotate control.
  RC17 passed this check; real window-manager and compositor coverage remains
  unmeasured.
- The native macOS workflow now launches the packaged application with a bounded
  acceptance-report path and validates its actual BrowserWindow state: visible,
  unfocused, non-focusable, topmost, shadowless, 460×680, and at the bottom-right
  of the reported work area. RC18 passed this check on `macos-latest`; physical
  Spaces, fullscreen, and multi-display behavior remains unmeasured.
- The native Linux workflow now starts a headless Weston compositor and launches
  the packaged AppImage with native Wayland selected. Its acceptance contract
  requires `linux-wayland` detection, a visible nonactivating window, and an
  explicit policy with no always-on-top, global click-through, or shaped
  click-through claim. RC20 passed this check. Compositor-specific behavior on
  GNOME, KDE, and wlroots desktops remains unmeasured.
- Finished-result retention is persisted as a whole-number limit from 0 through
  20, defaulting to five. Automated coverage verifies that only the newest
  result-ready agents contribute orange entries and counts, while working agents
  remain visible. The settings control and behavior await manual UI validation.
- The WSL-to-Windows development launcher now terminates the previous Electron
  process tree and waits for all runtime children before relaunching. The
  reference desktop reported exactly one AgentPup main process after restart;
  packaged-versus-development coexistence still needs an explicit manual check.
- A legacy `Claudepet.exe` package-test process and its WSL collector were found
  running beside AgentPup and were terminated. The reference desktop then
  reported zero legacy main processes and exactly one AgentPup main process.
- A later restart exposed a separate legacy LocalAppData development controller
  launched by the old `dev.claudepet.desktop` Windows Run entry. Its process tree
  was stopped, the old entry was removed, and `dev.agentpup.desktop` was
  registered with the current runtime and WSL distro. Read-back reported one
  AgentPup root process, no legacy entry, and the current AgentPup entry. The
  development launcher now also retires legacy `Claudepet\development` process
  trees automatically, with regression coverage.
- The Windows tray icon now stops the overlay and collector runtime instead of
  hiding the window. Its controller remains available in the tray so the next
  click creates a new overlay and collector at the default bottom-right corner
  of the primary display; full-process **Quit AgentPup** remains a separate menu
  action. The user observed that the previous implementation retained the last
  selected corner, which established that the controller process persisted;
  the corner reset now has automated coverage and awaits manual revalidation.

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

The original default AgentPup design is now complete. Cross-platform packaged
policy checks are automated, while physical macOS/Linux desktop acceptance
remains unavailable in the current environment.

1. Measure latency and idle CPU, memory, GPU, and battery use on the named
   Windows/WSL reference machine.
2. Finish the remaining Windows autostart-after-reboot and packaged interactive
   checks using a current CI-verified NSIS artifact.
3. Run physical macOS, Linux X11, and supported Wayland desktop acceptance when
   those environments become available.
