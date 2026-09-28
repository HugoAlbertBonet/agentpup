# Windows release-candidate checklist

The release workflow installs, launches, and uninstalls every candidate on a
fresh GitHub-hosted Windows runner. This proves that the installer is
self-contained without requiring a second physical computer. Use the remaining
visual and provider checks on the available Windows computer. Record the Windows
version, WSL distribution, display scaling, installed Codex and Claude Code
versions, and the release-candidate tag.

## Install

The workflow must pass **Smoke-test clean install, launch, and uninstall** before
the artifact is accepted. The following manual checks cover Windows UI behavior
that a headless assertion cannot establish.

1. Open the successful **Windows release artifact** workflow run on GitHub.
2. Download **AgentPup-Windows-unsigned** and extract the ZIP.
3. Record the SHA-256 value of `AgentPup-Setup-0.1.0.exe` with:

   ```powershell
   Get-FileHash .\AgentPup-Setup-0.1.0.exe -Algorithm SHA256
   ```

4. Run the installer. Windows may show an unrecognized-publisher warning
   because this release candidate is unsigned.
5. Confirm installation succeeds. The fresh-runner smoke test separately checks
   installation without Node.js, npm, prior AgentPup data, or the original
   author's home directory.

## Desktop behavior

1. Launch AgentPup from the installed shortcut.
2. Confirm the pet and vertical status bar appear above ordinary windows.
3. Confirm transparent space does not consume clicks and opening the panel does
   not steal focus until an intentional control is selected.
4. Move the pet through all four corners and confirm it remains in the current
   display's work area.
5. Open settings, scroll through the full panel, change pet and status sizes,
   disable animation, hide/show the pet, and restore the desired values.
6. Left-click the tray icon to stop the pet window and collector, then click it
   again to start a fresh runtime. Confirm **Quit AgentPup** exits the tray
   controller too.

## Windows startup

1. Right-click the tray icon and enable **Start with Windows**.
2. Sign out and back in, or reboot Windows.
3. Confirm AgentPup starts once, the tray icon works, and the overlay remains
   inside the work area.
4. Disable **Start with Windows**, sign out and back in again, and confirm it
   does not start.

## Agent integration

1. Open **Pet settings → Agent integrations**.
2. Install or repair the Codex and Claude Code hooks. Existing provider
   settings must be preserved and backed up.
3. In Codex, open `/hooks` and trust the AgentPup user hook when prompted.
4. Run **Diagnostics** and confirm the collector connects, provider hook
   configuration is reported, and hook events become observed.
5. Exercise one working, one structured question or permission request, one
   completion, one interruption, and one subagent lifecycle. Confirm the
   working, needs-you, and result-ready indicators clear at the right times.
6. Quit AgentPup during agent work, restart it, and confirm recovery does not
   duplicate entries.

## Removal

1. Use the integration control to uninstall AgentPup hooks and confirm unrelated
   provider hooks remain.
2. Uninstall AgentPup from Windows settings.
3. Confirm the application shortcut and login entry are removed.
4. Record whether application preferences remain. The current installer keeps
   application data intentionally so an upgrade or reinstall preserves settings.

Report each item as pass, fail, or not tested. Include diagnostic metadata and
error text, but do not attach private transcripts, prompts, tool bodies, project
paths, session IDs, or hook configuration files.
