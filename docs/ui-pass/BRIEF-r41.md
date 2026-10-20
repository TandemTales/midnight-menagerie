# Round 41 — the four lowest rooms: the Hedge, the Kennels, the Sleeping Quarters, the Passages

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md`,
`BRIEF-r35.md`, `BRIEF-r37.md` and `BRIEF-r39.md` in full. Read
`VERDICTS-r34.md` (the last time the Hedge and the Kennels were rebuilt -- and
they are still the bottom of both lists), `VERDICTS-r35.md` (the Sleeping
Quarters) and `VERDICTS-r39.md`: what judges rewarded (a drawn, broken
silhouette; an object standing IN the near floor) and punished (spiky
"crags", props washed to one grey, soft render-box props). This file wins
wherever they disagree. **Your rubric is `RUBRIC.md` as amended by
`RUBRIC-r41.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py`; keep each link under 12 s.
**A good link can be an empty program:** read `gl.getProgramInfoLog` for every
program you change (round 39 found the velvet suite drawing no walls for four
days while LINK_STATUS said true).

## WHY THESE FOUR

Survey 7 (`SURVEY-2026-10-20.md`): the rooms (4-6) are still the weakest part
of the game, and these four are the lowest on BOTH judges' sheets outside the
wings round 39 just rebuilt (which a paired test confirmed better).

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Hedge** | 4, +2.0 | 4, +2.5 | "the hedge walls are lumpy smeared blobs with no clipped top line, and the path is a milky grey slab"; "paint the hedges as clipped leaf masses with an inked silhouette and a dark root line, and give the lawn an edge and leaf drifts" |
| **Kennels** | 4, +2.0 | 4, +2.5 | "the doghouses are flat primary-colour toy boxes (green, red, blue), and the straw is yellow line-segment confetti over the whole floor"; "replace the stick-confetti straw with painted drifts, and desaturate and ink the doghouses" |
| **Sleeping Quarters** | 4, +1.8 | 5, +1.5 | "the right third of the floor falls to black, the nursery's rocking horse and toy chest are reused and cropped at both frame edges"; "paint the rocking horse, and give the room its own rug" |
| **Passages** | 4.5, +1.3 | 5, +1.0 | "the wainscot panels repeat one stretched wood-grain texture down both walls, and the vases' flowers on the side tables are stair-stepped"; "vary and ink the panelling, and add candle pools on the floor" |

Both judges' SYSTEM sections name the same three family defects, and these
four wings carry all three.

## THE FIX LIST

### 1. INKED OBJECTS, NOT RENDERED PRIMITIVES -- both judges

"The props are low-poly, flat-shaded objects ... standing in a well-lit
render" (J1); "soft edges and no line, so they read as a render, not the
samples' inked painting. This is the material defect behind most rooms' 4-5"
(J2). In your four wings every object that matters has an inked, broken
silhouette (round 21's pen), material (grain, wear, leaf mass, weave), a
contact shadow and light from the room's own source:

- **The Hedge:** clipped yew walls as leaf masses -- a hard, clipped top line,
  an inked silhouette, a dark root line where they meet the ground; the path
  darker gravel or flags, not a milky slab; the lawn with an edge and leaf
  drifts.
- **The Kennels:** the doghouses weathered and muted (painted boards with
  wear, name boards over the doors), inked; the straw in clumps and drifts
  where dogs would drag it, not confetti over the whole floor.
- **The Sleeping Quarters:** its OWN props -- iron beds, a trunk at a bed's
  foot, a washstand -- not the Nursery's rocking horse and toy chest; nothing
  cropped at both frame edges.
- **The Passages:** panelling varied and inked (doors, sconces, panel
  mouldings), not one stretched wood grain; the side tables' flowers crisp.

### 2. EACH WING ITS OWN FLOOR -- both judges

"A single rug/runner asset with flat vector medallions appears in seven
rooms" (J2); "the same red medallion runner in foyer, sleeping, passages and
heart" (J1). The Sleeping Quarters and the Passages each get a floor covering
of their own (a rag rug, a worn hall carpet, bare boards with a strip of
drugget -- your call), not the Foyer's red runner. Do NOT change the Foyer's
or the Heart's.

### 3. THE NEAR FLOOR LIT AND DRESSED -- both judges

No part of the near floor falls to black or empty mottle (J1: the Sleeping
Quarters' right third; J2: the Hedge, the Kennels, the Passages). A light pool
from a source the room has, objects standing IN it above the hand's top edge.
Reuse round 31's `nearFloor` rule as rounds 34-39 extended it (`clean`, `dye`,
`rug`, `pool2`, `pool.abs`, props placed in eye metres with `ahead` /
`across`, `cineFloor`).

### 4. INK, NOT GRAIN; DARK, NOT MILKY

Soft or hazy is worse than stepped; a dark washed pale or milky is a defect,
not a fix. The middle distance crisp (J2: "soft distance ... in almost every
room").

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark is
too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/` prep
scripts, extended. A shared rule that lifts other wings too is welcome ONLY
with the seventeen-room sweep, SEEDED (`room_batch --rooms wing:kind,...`, the
list in `docs/ui-pass/survey-2026-10-20.sh`), proving none got worse.

**Not yours:** the other thirteen wings (unchanged) -- round 39's four above
all, which a paired test just confirmed; the Foyer's and the Heart's runner;
round 28's painted house and shared contact-shadow rule; the pen and floor
camera from round 21; `ui/enemy.js`, the stand-in room, `core/renderer.js`
(keep its render-scale governor: Josh's standing rule), the boards, the run
strip, the cards, the hand, `ui/hang.js`, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6` (hm-1 / hedge-maze, kn-1 / kennels, sq-1 /
  sleeping-quarters, sp-1 / secret-passages) against BASE, interleaved, three
  pairs; read the DELTAS and check `size.drawW` (gpuprof does not pin the
  render-scale governor). 15.5 ms hard; leave the Hedge's fight no worse than
  BASE (`46c95755` fixed it once: the maze's painted sky ran under the whole
  yew face only to be mixed away). Cold-start time (`tools/coldstart.py`) in
  the perf report. Measure only when `tasklist` shows no UnrealEditor or game:
  under them half of gpuprof's pages time nothing.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`.
- **Commit after every step that works**; whatever is committed survives.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py` (directly if on_port says it never names
  8777), `tests/link-queue`, `tests/combat-scene/seam.py`, `tests/chrome`,
  `tests/steam-deck`, and the region gates `tests/hedge-maze`,
  `tests/kennels`, `tests/sleeping-quarters`, `tests/secret-passages`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge    --port PORT --tier medium --seeds hedge,fountain,walk      --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 1500 python tools/variant_sheet.py kennels  --port PORT --tier medium --seeds kennels,wash             --out JUDGING/CODE/sheet-kennels.png
cd "WT" && timeout 1500 python tools/variant_sheet.py sleeping --port PORT --tier medium --seeds dormitory,bedroom        --out JUDGING/CODE/sheet-sleeping.png
cd "WT" && timeout 1500 python tools/variant_sheet.py passages --port PORT --tier medium --seeds passage,library,closet   --out JUDGING/CODE/sheet-passages.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-hedge --port PORT --scene combat --region hedge-maze --encounter hm-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-hedge-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
