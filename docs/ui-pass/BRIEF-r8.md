# Round 8 — BACKGROUNDS, and there will be no art

Read this whole file before you touch anything, and read `RUBRIC-r8.md`.

## Why this round exists, in Josh's words

> "no more background art. i wanted to start the loop to perfect backgrounds and
> see how good they could possibly be with just procedural generation only.
> there will be no background art. make it as good as it can be without it. now
> finish the loop with this in mind." — 2026-09-17

Seven rounds have said the same thing in every judge's words: *the room behind
the board is a render, not a painting.* Seven rounds also recorded that this
could not be fixed until Josh's paintings landed, that
`docs/art/background-prompts.md` was the list he would paint from, and that
builders should NOT spend a round painting rooms.

**All of that is retired.** No art is coming. `animations/backgrounds/` will
never exist. The procedural room is the finished article, and this round's job —
the first BACKGROUNDS round of the pass — is to take it as far as procedure
goes. The room is the deliverable.

The four samples are still the reference. `tools/bgmetrics.py` is still the
instrument. "As good as it can be" has to be measured against something.

## THE TWO ROOMS. Know which one your screen shows.

| | the files | shows on |
|---|---|---|
| **the CSS room** | `tools/prep_ui_paint.py`, `tools/prep_ui_materials.py` → `game/assets/ui/kit/room*.webp` | the six boards, and round every dialog |
| **the WebGL room** | `game/src/fx/backdrop.js`, `fx/shaders/backdrop.js`, `fx/atmosphere.js`, `fx/shaders/grade.js` | **COMBAT**, and the showcase |

They share nothing. A fix to one is invisible in the other. This cost a whole
pass once: the ground work of 2026-09-16 painted the CSS room and the handoff
recorded "the procedural half is DONE" while combat — the one screen where a
large area of *room* is visible — had never been touched.

If you change a `prep_*.py`, you must run it and commit the rebuilt `.webp`.

## FIVE THINGS ALREADY ESTABLISHED. Do not re-derive them.

1. **Josh's tooth is WHITE NOISE, not 1/f.** Read through the cumulative
   high-pass `bgmetrics` uses, the samples run `0.41 0.67 0.83 0.94 1.00` across
   the 0.8–12 px octaves. The 1/f^1.1 the CSS ground uses gives
   `0.06 0.14 0.30 0.60 1.00` and leaves the fine end empty — copying it to the
   WebGL room moved the measurement **0.038 → 0.038**. Canvas tooth lives in the
   POST GRADE, in display space, multiplicative so pure black stays black, on
   cells measured in PIXELS. It is there now at `uTooth = 0.097`, three taps.
2. **A drawn line's width is in PIXELS.** A 4 cm chair rail across a 19 m room is
   a fifth of a pixel of relief, so lighting can only ever draw it as a hairline
   — which is why every moulding, joint and prop silhouette in the house used to
   read as a wireframe. `length(vec2(dFdx(h), dFdy(h)))` is metres of relief per
   pixel; a threshold on it is a constant-width line at any depth, and it is
   free because the shader already takes those derivatives for its normal. Gate
   it on resolvability or it draws BANDS instead of joints. The same applies to
   antialias widths, joint widths and rim widths.
3. **A recess is darker than the face it is cut into.** The wall's panels were
   hairlines because the flat floor of a 42 cm recess has the same NORMAL as the
   wall. One occlusion term off the height field gave six architecture modes
   their joinery.
4. **A flame and its glow are not the same size.** The billboard is sized to the
   light's RADIUS; when the flame was drawn at that size the Foyer's lamps were
   73-centimetre teardrops, i.e. the white discs in every earlier capture. The
   flame is 9 cm of world space now and the quad is still the halo.
5. **MEASURE WHAT IT COSTS.** The first version of the canvas tooth was
   **+3.75 ms of an 11.2 ms frame**, 2.14 ms of it in the post grade: six octaves
   of value noise is 24 hash calls on 921,600 pixels, and "the post chain is
   bandwidth-bound" is only true for the taps it was measured with. See the
   budget below.

## WHERE IT IS NOW, MEASURED, AND THE ONE AXIS THAT IS SHORT

`python tools/bgmetrics.py --samples --patches` prints the targets.

| | combat's room band | an isolated room | `mainMenu.png` |
|---|---|---|---|
| tooth | 0.150 | 0.246–0.317 | 0.226 |
| tooth, 0.8 px octave | 0.086 | 0.151–0.192 | 0.124 |
| min channel, darkest tenth | 3.30 | 0.00 | 2.32 |
| edge width, px | 2.51 | 1.85–2.26 | 2.52 |
| ink share | — | 0.35–0.53 | 0.674 |
| **ink DEPTH** | — | **0.009–0.080** | **0.248** |
| tile spread | 0.790 | 0.99–1.52 | 0.540 |

**Tooth and edge width are already at his figures. Ink depth is short by an
order of magnitude, and it is the axis this round should move.**

And understand *why* his is high before you raise a knob: `uInk` is already
0.80, set by eye — at 1.00 the lines read as black wire. His depth does not come
from a heavier line. It comes from **drawn subject matter**: masonry courses,
window tracery, ironwork, panel mouldings with real profiles, book spines, the
carved things a hand put there. Every one of those is a value darker than both
its sides, and there are thousands of them per frame.

That is what "as good as it can be without art" has to mean: **procedure has to
draw the subject.**

## THE FIX LIST

Work it in order. It is what the measurements and the captures actually say.

1. **Drawn subject on the wall modes.** Six modes in `wallH()`: PANEL (wainscot,
   chair rail, stiles, crown, arched doorway, hung portraits), GLASS (mullions,
   sill, condensation), STONE (coursed blocks, recessed niches), FOLIAGE (a
   ridged noise mass — the weakest), INDUSTRIAL (three rails and a pipe — the
   second weakest), EXTERIOR (a skyline of towers and a fir treeline). FOLIAGE
   and INDUSTRIAL carry the Hedge Maze, the Greenhouse, the Kitchens, the
   Lampworks and the Attic between them and neither has anything a hand drew.
2. **The wallpaper is three papers** (`mmDamask`, chosen per region off its
   LABEL) on panelling, a trace on stone, nothing elsewhere. `uDamask` 0.55 by
   eye. A papered wall is the one part of the room that already carries drawn
   subject; more rooms could have ornament, and it need not be wallpaper — a
   stencilled frieze, a tiled dado, a painted border.
3. **The props: 15 of the 20 silhouettes have never had a pass.** By prop
   instance across the seventeen palettes: shrub 61, cabinet 58, column 51,
   headstone 44, plant 43, chair 35, drape 33, crates 30, candelabra 25,
   statue 23, then nothing above 17. Done: plant, shrub, column, statue,
   cabinet (contents). **A prop CAN be A/B'd now** — see the instrument note.
   Two warnings, both paid for: at the ~30 px a prop occupies the recognisable
   CUE beats the parts (a fuller headstone read as a block with a hat and was
   reverted), and `max()` applied to an ACCUMULATED SDF subtracts from
   everything already in it — shape the primitive, then `min()` it in.
4. **The CSS room is uniform across the frame.** Measured on the asset: tooth
   0.172 against mainMenu's 0.226, which is fine — but tile spread **0.20
   against 0.54**. It is the same everywhere. It shows behind six boards and
   round every dialog, and Settings scores 3–4 on background, the lowest of
   anything in the pass.
5. **Two regions sharing an arch mode and a floor pattern are the same room
   recoloured.** 17 regions over 6 modes, 9 floor patterns and 3 papers. Round 2
   measured structural cross-correlation at 0.63 mean and treated it as the
   defect; `python tools/lookmetrics.py --tag r8 --tier high` measures it again.
6. **The ceiling is deliberately the darkest part of the frame now** (all four
   samples go near-black at the top) and it still costs ~1.5 ms of an 8.8 ms
   backdrop. Patterns 3/6/7/8 are only ever seen at a grazing angle. Check
   whether each earns its cost.
7. **The statue, the Greenhouse planting and the chair are better than they were
   rather than right.** The statue reads as a figure; the planting has mass and
   a leaf edge; the chair is still three rounded boxes.
8. **Not yours to decide: the region palettes.** The Ballroom is plum and
   magenta at exposure 3.55, the Greenhouse acid green — both far outside the
   samples' saturation. Props are capped per material (`PROP_MATERIAL.sat`);
   walls and floors are as authored. **Josh has not ruled on this.** If you
   think a palette is the problem, say so in `notes_for_merger` and leave it.

## THE INSTRUMENT

- `python tools/bgmetrics.py --samples --patches` — the targets.
  `python tools/bgmetrics.py shots/x.png --box x0,y0,x1,y1 --octaves` — one
  capture, or one surface of it. Every image is scaled to a common height, and a
  CROP's scale comes from the FULL image's height (a 200 px patch upscaled to
  900 reads 0.018 of fine tooth where it should read 0.28).
- `python tools/shot.py NAME --region foyer --scene title --wait 5 --script
  @tools/shot-scripts/backdrop-room.js` photographs one room ON ITS OWN, no HUD,
  no board, no cards. Fragment toggles: `region=`, `tier=`, `seed=`, `props=0`,
  `actor=0`, `frames=0`, `shafts=0`, `motes=0`, and one-knob overrides
  `tooth=`, `damask=`, `ink=`, `lip=`, `wet=`, `propsat=`.
- **PIN THE PHASE — this is how you A/B anything.** The script sets
  `ctx.clock.t = 120` before the shot. Two captures of one region are then
  **byte-identical, 0 pixels differing, motes and props and all.** Without it
  they differ over 17% of their pixels, because props sway on
  `sin(uTime*0.55 + seed)`, stars twinkle, clouds drift and flames flicker off a
  `clock.t` that stops wherever page-load left it. Do not remove that line, and
  do not trust an A/B taken without it.
- `frames=0` / `shafts=0` / `props=0` is how you find out which LAYER a mark
  belongs to. The Graveyard's dark band across the sky was pinned on the near
  frame's lintel that way, after two wrong guesses by eye.
- **`python tests/shader-literals/check.py` before every shader commit.** A
  backtick inside a `/* glsl */` template literal ENDS it, and what you get is
  `PAGEERROR Unexpected identifier '<some GLSL local>'`, a black frame,
  `state: no MM` and an empty `.console.txt`. It cost four debugging cycles in
  one afternoon, because this codebase quotes identifiers in backticks
  everywhere else. The gate also checks every `${SPLICE}` against what the file
  imports.

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

**Through `on_port.py`, always.** `gpuprof.py` hard-codes `localhost:8777`, which
is the MAIN checkout's server, so run directly from your worktree it profiles
`dev` and not your branch -- three builders would report the same number and the
budget below would measure nothing. `on_port.py` rewrites the port in memory and
works on any script that names 8777, gpuprof included.

On the target GPU that currently reads **13.95 ms / 59 fps** at tier medium, the
backdrop 8.8 ms of it and the grade 3.4 ms.

**Your build must stay at or under 15.5 ms, and you must report the number**
(three runs; it moves ~1 ms between calls). A background that costs the fight
its frame rate is not an improvement. If something you want is expensive, put it
behind the quality tier the way `MM_TOOTH` is (off at `low`).

## THE TRAPS

- **Measure to find the defect; LOOK to set the amount.** This has now cost six
  wrong answers. The canvas tooth reaches mainMenu's own 0.226 at a one-sigma
  modulation of 0.22 — and at 0.22 it reads as film grain on dirty glass; 0.10
  reads as plaster. Shaft stripes measured better at full strength and read as
  three searchlights. Cutting combat's violet wash gave the best black-floor
  number of the whole pass and turned the fight sepia. **Put the crop beside the
  old one at 1:1 before you keep a number.**
- **One number for the whole house is not a rule.** The prop chroma ceiling was
  set by eye at 0.14 on the Ballroom's statuary; the 17-region sweep immediately
  showed the Greenhouse's planting going grey. It is per material now.
- **Do not judge a backdrop change on one region.** Sweep all seventeen. That
  sweep is what caught the per-material chroma, the Kitchens' inked rafters, the
  damask printing on brick, the sky plane's missing 78 px and 10 m, and the
  Greenhouse losing its mass.
- **Line endings.** The edit tools normalise a MIXED file on write and the
  working tree can hold CRLF where git holds LF without `git status` noticing.
  Run `python tools/endings_guard.py --base <base>` before committing.
- **Anything run from a worktree drives `dev`, not your branch.** All 102 test
  scripts hard-code `:8777`, and so does `tools/gpuprof.py`. Use
  `python tools/on_port.py <your port> <script> [args]` for every one of them.
  A green test or a 13.95 ms reading obtained without it tells you nothing about
  your own work.

## WHAT IS NOT YOURS THIS ROUND

The enemy and Companion sprites, the HUD, the card kit, the plates, the type,
the dialogs' controls, and gameplay. This is a background round. If a background
change breaks a screen outside your track, that is still your bug.

## DELIVERABLES

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- `tools/gpuprof.py` three times **via `on_port.py` on your own port**, the
  three numbers in `notes_for_merger`;
- `python tests/shader-literals/check.py` green;
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  one also taken with `--w 1280 --h 800` and saved as `<name>-1280.png`.

```
cd "WT" && python tools/shot.py CODE-combat        --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss   --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && python tools/shot.py CODE-rest          --port PORT --scene rest    --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-room-foyer     --port PORT --hash "region=foyer&tier=high&actor=0"     --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-crypt     --port PORT --hash "region=crypt&tier=high&actor=0"     --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-graveyard --port PORT --hash "region=graveyard&tier=high&actor=0" --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
```

`tools/shot.py` writes into `WT/shots/`; copy each PNG to `JUDGING/CODE/<name>.png`
with the `CODE-` prefix removed.

Before you finish, sweep all seventeen rooms with the backdrop-room script and
look at them, and photograph two screens outside this round's six — a board and
a dialog — and look at those too. Stop your dev server when you are done.
