# AgentPup source art

This directory is the reproducible handoff for AgentPup's original built-in
pet. The character was developed with OpenAI image generation in built-in mode,
then assembled locally into the documented OpenPets-compatible V2 atlas. No
OpenPets gallery artwork is included in this design.

The `masters` directory contains the generated transparent PNG pose masters and
the concept model sheet. The `animation-sheets` directory contains six-frame
generated source grids for resting idle, laptop work, and the needs-you paw
raise. `design-notes.md` records the visual intent and review scenarios.
`design-review.png` is rebuilt from representative exported frames. The
distributable files live in `../runtime`.

## Export

Install Node.js 22 or newer and FFmpeg 7 or newer, then run from the repository
root:

```sh
node pets/agentpup/source/export.mjs
```

`export.mjs` crops the generated animation grids, scales and positions the
remaining pose masters, constructs the 1536 by 2288 pixel atlas, writes a
lossless WebP runtime sheet, creates the review board, and copies the exact
runtime sheet into the desktop application's bundled assets.
The generated images are deterministic for a fixed FFmpeg build and the checked
in masters. FFmpeg is an authoring tool only; users do not need it to run the
packaged application.

## Generation prompts

The concept prompt requested a crisp 2D model sheet for a compact deep-navy and
warm-cream puppy with a short forehead antenna and glowing mint collar tag,
shown in idle, working, waving for attention, celebrating, concerned, and
walking poses. Follow-up image-edit prompts isolated consistent transparent
pose masters while preserving the same proportions, palette, face, antenna,
collar, and tag. The refined animation prompts requested a six-frame laptop
typing and blinking loop, a seated paw-raise attention loop, and a patiently
resting breathing/blinking loop. The ready pose hops, the concern pose lowers
its ears, and the walking pose faces right.

The source and exported AgentPup artwork are available under `LICENSE`.
