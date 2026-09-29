# Creating a pet design for AgentPup

Status: **implemented OpenPets V1/V2 compatibility contract**.

This guide is the complete brief for a designer or agent with no previous
project context. It describes the format AgentPup imports today, the product
states the artwork must support, the review materials expected for designs
contributed to this repository, and the checks applied to untrusted packs.

## Product purpose

AgentPup is a small animated desktop companion that tells a person what their
local Claude Code and Codex coding agents are doing. The first supported host is
native Windows. Collectors can run on Windows and inside WSL while the pet stays
on the Windows desktop above ordinary application windows.

One pet summarizes all monitored agents. The shared UI, rather than the pet
art, displays three counts:

- **Working**: an agent is actively doing work.
- **Needs you**: an agent has an unresolved question, approval, or other human
  action. An agent can still be working while a nonblocking question is open.
- **Ready**: an agent has a finished result available to review.

Unknown or disconnected coverage has a separate `?` marker. Silence does not
prove that an agent stopped. The renderer never asks the artwork to calculate
these states, and counts or words must not be painted into a sprite sheet.

Clicking the pet opens an application-owned panel. It identifies individual
agents, their provider and project, parent/helper relationships, and pending
request kinds. The panel does not approve, deny, answer, resume, or prompt an
agent; the user responds in the original coding session.

## Current runtime format

AgentPup directly supports the package layout used by the OpenPets gallery:

```text
pet.json
spritesheet.webp
```

A ZIP may contain those files at its root or inside one lowercase safe-ID
wrapper directory. It cannot mix the two layouts. No JavaScript, HTML, SVG,
plugin, font, remote URL, executable, or additional runtime file is accepted.

This compatibility choice gives designers access to the existing OpenPets
tooling and lets users download a gallery ZIP and import it without conversion.
AgentPup's provider adapters and status engine remain independent of the pet
format.

### `pet.json`

`pet.json` is UTF-8 JSON without comments. The supported fields are:

| Field | Required | Contract |
| --- | --- | --- |
| `id` | Yes | Lowercase letters, digits, `_`, or `-`; starts with a letter or digit; 1–64 characters; cannot be `builtin`. It must match the installed directory name. |
| `displayName` | Yes | Nonempty display name, at most 120 characters. |
| `description` | Yes | Nonempty description, at most 500 characters. |
| `spritesheetPath` | Yes | Exactly `spritesheet.webp`. Remote or nested paths are rejected. |
| `spriteVersionNumber` | No | Omit for V1 or set to integer `2` for V2. No other value is accepted. |

Example V2 metadata:

```json
{
  "id": "cloud-cat",
  "displayName": "Cloud Cat",
  "description": "A relaxed, curious cloud cat.",
  "spritesheetPath": "spritesheet.webp",
  "spriteVersionNumber": 2
}
```

The compatibility manifest has no license or author field. Put attribution and
redistribution terms on the gallery entry and in the editable-source handoff.
Do not assume the OpenPets application license covers every gallery design.

### `spritesheet.webp`

The sheet is a fixed grid of 192 × 208 pixel cells with eight columns. Export
one static WebP image with transparency and consistent character scale, root,
and padding across every cell.

| Format | Grid | Exact image size | Use |
| --- | --- | --- | --- |
| V1 | 8 columns × 9 rows | 1536 × 1872 | Basic animations. Omit `spriteVersionNumber`. |
| V2 | 8 columns × 11 rows | 1536 × 2288 | Basic animations plus two optional gaze rows. Set `spriteVersionNumber` to `2`. |

Rows use this shared semantic layout:

| Row | State | Used cells | AgentPup behavior |
| --- | --- | --- | --- |
| 0 | Idle | 0–5 | Quiet/unknown animation. V2 cell 6 should also be a good neutral pose for compatible hosts. |
| 1 | Run right | 0–7 | Reserved for locomotion. |
| 2 | Run left | 0–7 | Reserved for locomotion. |
| 3 | Wave/attention | 0–3 | Plays when at least one agent needs the user. |
| 4 | Jump/success | 0–4 | Plays for a newly ready result. |
| 5 | Failed/concern | 0–7 | Available for a future explicit error reaction. |
| 6 | Waiting | 0–5 | Compatible waiting/permission animation. |
| 7 | Running/working | 0–5 | Loops while one or more agents work. |
| 8 | Review/thinking | 0–5 | Compatible thinking/review animation. |
| 9–10 | Cursor gaze | 0–7 each | V2 compatibility cells. AgentPup currently leaves gaze tracking unused. |

Unused cells stay transparent. Keep the character inside one cell; pixels that
cross a cell boundary will leak into another frame. Anchor the feet or body root
at the same location throughout. Use coherent proportions and silhouette, and
avoid per-frame auto-cropping.

AgentPup currently renders the sheet at roughly two-thirds scale, producing a
pet about 128 × 138 logical pixels. Check the artwork at this actual desktop
size. A detailed large illustration that becomes muddy at this size is not a
finished pet design.

## Status and animation behavior

The app owns the meaning and priority of status. The current mapping is:

| Product situation | Shared UI | Sprite response |
| --- | --- | --- |
| Quiet | Counts remain visible; distinguish zero activity from lost coverage. | Row 0 loops slowly. |
| Working | Green working dot and count. | Row 7 loops. |
| Needs user | Red needs-you dot and count; pending agents are first in the panel. | Row 3 plays twice, then holds. This takes priority over working. |
| Result ready | Orange ready dot and count. | Row 4 plays twice, unless needs-you has priority. |
| Unknown/disconnected | `?` coverage marker; known counts remain visible. | Row 0; artwork must not falsely celebrate. |

Status and badges update immediately. A long animation cannot delay a request.
Color reinforces the shared indicators but is not their only signal: the count,
tooltip, accessible label, and expanded agent text carry the meaning.

With the operating system's reduced-motion preference enabled, autonomous
sprite animation stops on the first frame of the selected row. Make that first
frame a readable pose for every semantic row.

## Desktop interaction requirements

Design for a transparent window over both bright and dark applications.
AgentPup keeps transparent areas click-through and makes only visible controls
interactive. The pet must remain easy to click at its rendered size.

The user can move the overlay to the next screen corner with the round-arrow
control. The open panel and active interaction pause roaming. A help request
must remain visible and must not cause the pet to run away. Future motion can
use rows 1 and 2, but the current Windows default keeps roaming disabled while
mixed-DPI and multi-monitor behavior is validated.

“Always on top” means ordinary supported desktop windows. Artwork and review
notes must not promise visibility over lock screens, secure desktops, exclusive
fullscreen applications, or every compositor.

The agent panel has a gear button leading to a dedicated settings section. It
contains character visibility, size, and animation controls; status-bar size,
number-font, and row-spacing controls; plus these application-owned design
actions:

- **Gallery ↗** opens the OpenPets gallery in the default browser.
- **Import .zip** asks the user to select a downloaded pack and activates it.
- **Next pet** cycles the bundled fallback and imported packs.

Do not draw these controls into the sprite.

## Import and safety limits

Packs are untrusted input. The implemented importer applies these limits:

- ZIP file at most 50 MiB.
- At most 12 archive entries and 110 MiB expanded total.
- `pet.json` at most 128 KiB.
- `spritesheet.webp` at most 100 MiB and exactly the dimensions for its version.
- Stored or deflate compression only; encrypted entries are rejected.
- No absolute paths, drive paths, backslashes, `.`/`..`, traversal, symlinks,
  devices, duplicate required files, case collisions, or unexpected files.
- Metadata and file names are parsed as data. Imported content is never run.
- Installation uses a private candidate directory and atomic replacement. A
  failed import does not replace the active copy.
- The renderer can request only a validated installed pet ID through a scoped
  local protocol. It receives no general filesystem path or Node access.

The original AgentPup design is bundled under the MIT license and works offline.
Its editable pose masters, generation disclosure, review board, design notes,
generated animation source sheets, and deterministic atlas exporter live in
`pets/agentpup/source`; its importable runtime pair lives in
`pets/agentpup/runtime`. The Pet settings animation preview plays the exact
idle, working, needs-you, and ready rows of the currently selected pack.
Downloaded gallery pets remain
opt-in and local. Check each selected design's provenance and rights before
redistribution; the gallery itself notes that some entries may be unofficial
fan-made content.

## Creating and exporting a design

1. Choose a safe stable ID, readable name, description, author, and license.
2. Create an editable 192 × 208 cell template with a consistent root and safe
   transparent padding.
3. Animate all nine required compatibility rows. V2 designs also fill the two
   gaze rows and use the neutral idle cell.
4. Arrange frames into an 8 × 9 or 8 × 11 sheet without trimming or rotation.
5. Export a single static `spritesheet.webp` at its exact required size.
6. Write `pet.json`, then ZIP the two runtime files at the root or under one
   directory named with the same safe ID.
7. Download or copy the ZIP, open AgentPup's panel, choose **Import .zip**, and
   inspect every status in demo mode.
8. Keep license, attribution, editable source, and review material alongside
   the distributable pack even though the two-file compatibility ZIP cannot
   carry additional files.

For a repository contribution, provide this source handoff outside the runtime
ZIP:

```text
pets/cloud-cat/
├── runtime/
│   ├── pet.json
│   └── spritesheet.webp
└── source/
    ├── README.md
    ├── LICENSE
    ├── design-review.png
    ├── design-notes.md
    └── <editable artwork and dependencies>
```

`source/README.md` lists the art tool and version, canvas/color settings, frame
order, export settings, dependencies, credits, any AI-assisted steps, and exact
reproduction steps. Include the actual editable files; an online-project link
alone is insufficient.

## Required design review

`source/design-review.png` is a labeled contact sheet. It may contain mock
counts and panel text because it is review material, not a runtime sprite. Show
the character at its intended desktop size as well as enlarged motion details.

Use these fixed fictional scenarios:

| Scenario | Required evidence |
| --- | --- |
| Quiet | `0 working`, `0 need you`, `0 ready`, and an empty/no-active-agents panel. |
| Work in progress | `3 working`, no help requests, row 7 pose, and identifiable agent rows. |
| Mixed workload | `3 working`, `2 need you`; the panel identifies one approval and one question. |
| Nonblocking question | The same agent is represented in both working and needs-you counts. |
| Completion | `1 ready` is visibly separate from a help request and uses row 4. |
| Incomplete coverage | One known working agent plus the `?` coverage marker. |
| Error and uncertainty | A failed row and a separate provisional request; neither silently becomes a confirmed question. |
| Crowded display | Multi-digit counts, a long project name, and parent/helper rows remain readable. |

Include light and dark desktop backgrounds, reduced motion, the closed badge,
the open panel, and placement near at least two screen corners. Confirm that the
pet silhouette and shared UI do not cover one another.

`source/design-notes.md` explains the pet's personality, status hierarchy,
first-frame reduced-motion poses, transitions and loop seams, panel placement,
contrast, long-label behavior, and which checks were completed. Make clear that
opening or petting the character does not resolve an agent request.

## Acceptance checklist

- The ZIP imports without changing TypeScript or application configuration.
- `pet.json` uses only the supported OpenPets fields and matches the pack ID.
- The WebP has the exact V1 or V2 dimensions and a transparent background.
- Idle, working, attention, and completion are distinguishable at actual size.
- Row 3 reads as a short request for attention rather than endless alarm motion.
- The character does not jump in scale or root position between frames/rows.
- The first frame of each row works with reduced motion.
- Bright and dark backgrounds, every corner, and the open panel were reviewed.
- No status counts, provider logos, words, executable code, or remote resources
  are baked into the runtime asset.
- Attribution, editable sources, and redistribution terms accompany a design
  contribution even though they stay outside the two-file runtime ZIP.

Future renderer contracts may add a richer AgentPup-native atlas, Rive, or 3D
assets. They are not supported runtime formats today. Any future format must be
versioned, documented here, validated as untrusted data, and remain independent
of provider adapters, the status engine, and desktop window code.
