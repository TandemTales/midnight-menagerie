# Round 15 — every object is nameable, and the room fills its frame

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r9.md` for
the standing priorities (readable objects, accurately built, colour is not a
target), `BRIEF-r10.md` for the instrument traps, and `BRIEF-r11.md` for the
machinery, the performance budget and the traps — all of that holds. **Your
rubric is `RUBRIC-r11.md` as amended by `RUBRIC-r15.md`**: the unit is a
contact sheet of three rooms of one wing, and a sheet must still win both
questions — different rooms, same wing. This file wins where they disagree.

## WHERE ROUND 14 LEFT IT

ORPIMENT won round 14 (`c1c32a5`), 2 of 2 judges, **7.07 against a 3.43
baseline — the largest gain of the pass**, on six of seven sheets. Its
Graveyard is the third sheet in fifteen rounds marked
`fits_between_samples`. What it built, and what you build on:

- **A kind carries a VANTAGE**, not just a back wall: `view: {at: square |
  threshold | along | above | among | corner | stair}` per kind, built from
  the region's authored camera. The Foyer is now a frontal parlor, a corner
  gallery and an oblique landing.
- **A wing's MAIN room keeps its authored shell, walk, layout and camera** — a
  room named for its wing resolving to `kinds[0]` ignores `kind.room` and
  `kind.view`. That is not a detail: before the last commit of round 14 a
  landing kind's room scale had leaked into the canonical Foyer fight. **Do
  not undo it.**
- **All seventeen wings have `ROOM_KINDS`**, the six that had none included,
  and each wing's new subjects compile only into its own `MM_ROOMS` variant.

**The Bathhouse and the Lampworks were grafted after that round and are NOT
yours this round** — see "Who owns what".

## THE FIX LIST, from both round-14 judges, in order

Every item below was written by a judge about ORPIMENT, the build you are
starting from. Where both judges named the same thing it says so, and those
come first.

### 1. THE HOUSE BEYOND THE ROOM IS UNDRAWN — both judges, all three Graveyard panels

> "The mansion behind the railing is a flat slab of one repeated arched window
> in two even rows." · "A flat clapboard box with identical arched windows
> pasted on."

Break the elevation: a projecting gabled bay, a roof plane with a ridge and
eaves, two or three window sizes with reveals and sills, **one dark window
among the lit**. The bar is already on the same sheet — round 14's own chapel,
which both judges praised for coursed stone, a shadowed side and real tracery.
The house must be built to the standard of the tombs in front of it, and it
must scale and move with the vantage rather than sitting at one size on one
horizon in all three panels.

### 2. A ROOM MUST FILL ITS OWN PANEL — both judges, the Ballroom suite

> "The suite panel is inset inside a black margin on three sides — the room
> stops short of its own frame." · "Letterboxed inside its tile with black
> margins left and right while the other two panels fill the frame; match the
> framing so the set reads as three rooms, not two rooms and a photograph of
> one."

This is a framing bug, not a taste question: find why that vantage renders
short of the panel and fix it there. Check every kind in every wing for the
same fault, not only the one the judges happened to see.

### 3. THE EDGES GO BLACK AND SWALLOW NAMEABLE THINGS — both judges

> "Both flanks fall to near-black and swallow the cabinets and chairs standing
> there. Lift them until every object at the frame edge is nameable." · "Both
> lose their whole upper half to flat black above the fixture line. Carry the
> tiling and the wall treatment up into the ceiling zone at low value so the
> rooms have a top, rather than ending in a void."

**AND HERE IS THE TRAP, WHICH IS THE MOST IMPORTANT PARAGRAPH IN THIS BRIEF.**
Do not answer this by lifting the blacks. The pass spent a whole day
(2026-09-16) proving that **nothing in this game was ever black** and that the
samples' colour lives in their darks: every screen sat about five levels off
the floor, which also capped saturation, because saturation is (max-min)/max.
Raising ambient would undo `prep_ui_paint`'s unlit pass, `--kit-void`, the
deepened falloffs and the whole black floor, and a judge will mark a washed-out
room DOWN. **Light the OBJECT, not the room**: give the cabinet a candle near
it, a lit rim, a reflected highlight, a lighter material, a place under a lamp.
A dark room with nameable things in it is the target; a grey room is a
regression.

### 4. THE PLACEHOLDERS INSIDE GOOD ROOMS — both judges on the Foyer landing

> "The tall wall hangings flanking the stair are undrawn dark rectangles with a
> faint edge — no pole, no heading, no fold — the only blocked-in placeholder
> on an otherwise well-staged oblique." · "Four blank rounded rectangles stand
> in for pictures. Either frame them with mouldings and put a dark painted
> field inside, or replace them with panelling and a chair rail."

A hanging has a pole, a gathered heading, two or three folds catching the lamp
and a hem with weight. A picture has a moulding and a field. **Sweep for the
rest of them**: any shape that is a rounded rectangle with a faint edge is one
of these, in any wing.

### 5. THE VINERY IS WIRED, NOT PLANTED — both judges

> "The upper half is bare glazing bars and dark roof while the brick below
> carries only thin trained stems." · "The cordons are thin strings on bare
> glazing. Thicken them to woody stems with spurs and rod supports, and hang
> enough leaf and fruit that the wall reads as planted rather than wired."

Bring the vines up onto the lower roof bars. The leaf standard is set on the
same sheet: round 14's own rosettes, which judge 2 called the only plants in
the round with midribs and petioles in pots with rims. Judge 1 adds that the
palmhouse's mid-distance beds "fall back to flat lobed cut-outs at about a
third of the depth" — the near planting is right and the middle distance is
not.

### 6. ONE TRUE PERSPECTIVE ERROR — judge 2, the Mirror Hall floor

> "The herringbone parquet bends in a long arc across the centre-left; make the
> blocks run straight and converge on the vanishing point, and keep the block
> size constant with distance."

A floor pattern that curves is drawn wrong, not styled differently. Fix the
projection, then check every other patterned floor the same way — turf, tile,
chevron, the pool deck — and say in your notes which ones you checked.

### 7. COMBAT'S LEFT WALL — judge 1

> "The run of flat door panels behind the Kid has no handles, architraves or
> skirting. Add a moulded architrave, a plinth block and one visible handle per
> door, and let the floor line read across — it is the one stretch of the
> combat room you cannot describe."

The fight is judged at both sizes. Round 14 quieted the landing balustrade
behind the enemy nameplates; do not undo that.

## WHO OWNS WHAT THIS ROUND

**Yours:** the WebGL room — `fx/atmosphere.js`, `fx/backdrop.js`,
`fx/shaders/backdrop.js`, and `core/renderer.js`'s camera rig only if a fix
truly needs it.

**NOT yours:** the Bathhouse and the Lampworks, which were grafted from round
14's judges' first instruction after that round merged — leave `ROOM_KINDS`,
the subjects, the floor patterns and the shaders of those two wings exactly as
you found them, and **prove it**: photograph `sheet-bathhouse` and
`sheet-lampworks` on your port and compare them with the merged captures,
content not hashes (mean absolute difference ~0.00). Also not yours: the enemy
and Companion sprites, the HUD, the card kit, the plates, the type, the dialog
controls, the web chrome (the coach, the veil and the toast — round 13's, and
rebuilt again since), gameplay, and the region palettes.

**What must not vary**, as `BRIEF-r11.md`: the palette and the arch mode hold
across a wing's rooms, a wing's material vocabulary holds, and every kind must
be a room that wing really has (the names are in `state/mapgen.js` `ROOMS`).

## PERFORMANCE — both frames, against BASE

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900 --wait 40
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900 --wait 40 --hash "encounter=gh-14&region=greenhouse"
```

**15.5 ms is hard on both.** Two things round 14 learned the expensive way:

- **`gpuprof`'s default 5 s wait measures ANGLE LINKING, not the frame.** Its
  window sits inside the ~35 s warm-up, so a build that adds shader variants
  reads about +0.5 ms that is the compiler threads taking GPU time from the
  stage. **Always `--wait 40`**, interleaved with BASE, three runs each, and
  report deltas — this machine has read BASE itself ~0.9 ms above the figure
  in an earlier brief.
- **A big new variant is a stall the first time its room is shown.** Round
  14's `stones` variant links in ~15 s on this iGPU, behind the game; a room
  shown before the background queue drains stalls on first show, and one batch
  capture VOIDed that way. Report your link times.

## THE TRAPS

All of `BRIEF-r11.md`'s, and these two, which are new:

- **Stop only the processes you started, by the PID you recorded.** Never kill
  by name or command-line pattern (`python`, `perf.sh`, `gpuprof`,
  `on_port.py`): the other builders run the same tools at the same time, and a
  round-14 builder that killed by pattern took three of its fellows' processes
  with it.
- **Tests hard-code `:8777`, which is the MAIN checkout.** Run every test from
  your worktree as `python tools/on_port.py PORT <test>`, and start your own
  dev server first — `on_port.py` rewrites the port, it does not start a
  server.

## DELIVERABLES

```
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --seeds parlor,gallery,landing       --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --seeds ballroom,mirrorhall,suite    --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --seeds yard,plots,gate              --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/shot.py CODE-combat --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
```

`combat` also at `--w 1280 --h 800` as `combat-1280.png`; check its `perf.band`
(29-36 with a room behind it). Plus: the endings guard printing `ENDINGS OK`;
`tests/shader-literals/check.py` green; `glStd` for every panel; a
seventeen-wing sweep looked at, with a sentence on any wing still reading as
one room; the bathhouse and lampworks comparison above; and
`notes_for_merger` with both perf deltas, your link times, and every number
(subject, floor pattern, variant) you added.
