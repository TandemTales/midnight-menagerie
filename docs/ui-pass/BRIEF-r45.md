# Round 45 — the props: the Hedge, the Bathhouse, the Lampworks, the Kitchens

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md`,
`BRIEF-r35.md`, `BRIEF-r37.md`, `BRIEF-r39.md`, `BRIEF-r41.md`,
`REPAIR-r41.md`, `BRIEF-r43.md` and `BRIEF-r44.md` in full. Read
`VERDICTS-r39.md` (the Bathhouse, Lampworks, Kitchens), `VERDICTS-r41.md` and
`VERDICTS-r43.md` (the Hedge, the Bathhouse) and the README rows 41-44 (what
the paired tests found). This file wins wherever they disagree. **Your
rubric is `RUBRIC.md` as amended by `RUBRIC-r45.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py` (12 s budget; the Hedge prop
program is already 9-13 s: it must NOT grow). **A good link can be an empty
program:** read `gl.getProgramInfoLog` for every program you change.

## THE RULE THIS ROUND IS BUILT ON

Four times this week a pass removed, muted, dimmed, smoothed or TIDIED
something a judge named, and a paired blind test found it worse (README rows
41r-44). **A drawn object beats an empty, dimmed, muted, smoothed or tidied
surface.** "Pale" below does not mean "make it dark and dull": it means the
object is a flat placeholder -- give it material, ink and light so it belongs
in the room. Never fewer objects; never move an object out of frame to hide
it; keep each room's character (the Hedge's torn withered crowns won 4 of 4
against a smoothed version: keep them).

## WHY THESE FOUR

Survey 9 (`SURVEY-2026-10-22.md`): its paired test found every room rounds
41-44 touched better; its two independent judges share one family defect --
pale, flat primitive props without contact shadows, and milky haze on the
floors -- and these four wings carry it worst.

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Hedge** | 4, +2.5 | 3, +2 | "the hedge walls' leaf texture is stretched into vertical streaks on the left wall's oblique face and along its jagged top edge"; "the lawn is a milky flat green" (both) |
| **Bathhouse** | 4, +2 | 4, +1.5 | "the bathtubs are toy-simple shapes with flat colour fills (one is a teal capsule), and the floor tiles break into milky grey patches under the moon"; "draw the tiles crisp with real grout lines and lit tubs" |
| **Lampworks** | 5, +1.5 | 4, +1.5 | "the two LAMPS crates in the left and right foreground are pale, flat-shaded plywood boxes with stair-stepped diagonal edges, the palest and largest objects in the room"; "the lantern in front-left is a blown-out lozenge" |
| **Kitchens** | 5, +1.5 | 4, +1.5 | "the two sacks and crocks at the right are pale grey, untextured blobs, and the butcher's block at the left is a flat box"; "the front half of the floor is empty" |

## THE FIX LIST

### 1. EACH WING'S PROPS, DRAWN -- both judges

- **The Lampworks:** the LAMPS crates as real crates -- slats, nails,
  stencilled letters worn, straw spilling, grain, an inked edge with no
  stair-steps, a contact shadow -- warm in the forge's light, kept where they
  are; the front-left lantern a lit glass with a visible flame and frame,
  not a blown-out lozenge.
- **The Kitchens:** the sacks in burlap weave with ties, seams and flour
  dust, the crocks glazed with a lit rim, the butcher's block end-grain with
  knife scars and a worn top -- all in the range's warm light; the front
  floor dressed (crates, spilt vegetables, a basket), never empty.
- **The Bathhouse:** the tubs enamelled and modelled -- highlights, rims,
  claw feet, rust streaks, towels -- no flat capsule fills; the tile floor
  dark blue-black with crisp grout and wet reflections, never milky grey
  patches.
- **The Hedge:** FIX THE PROJECTION -- the leaf texture must not stretch into
  vertical streaks on the side walls' oblique faces (judge 2's finding; three
  judges named streaks last round); keep the torn withered crowns with dead
  twigs; the lawn a deep green with leaf litter and roots, not a milky flat
  plane.

### 2. NOTHING FLOATS -- J1's SYSTEM

Every object that stands on the floor in your four wings has a contact shadow
under it (round 28's contact-shadow rule, `propShadow`), sized to its foot --
not overlapping its neighbours into a band (round 44 found the Pumpkin
Grounds' "void band" was exactly that).

### 3. NO MILK ON THE DARKS -- both

The floors' darks stay dark and coloured in your four wings: no grey or
lavender wash, no haze cone over the near floor. A dark is where this house
keeps its colour.

### 4. INK, NOT GRAIN

Edges that matter crisp; soft or hazy is worse than stepped.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark is
too pale (say so); `tools/` prep scripts, extended. A shared rule (e.g. the
contact shadow) that lifts other wings too is welcome ONLY with the
seventeen-room sweep, SEEDED (the list in `docs/ui-pass/survey-2026-10-22.sh`),
proving none got worse -- and a shared change is judged in those wings too.

**Not yours:** the other thirteen wings (unchanged); the Hedge's withered
crowns (keep them); round 28's painted house; the pen and floor camera from
round 21; `ui/*`, `core/renderer.js` (keep its render-scale governor: Josh's
standing rule), the boards, the cards, the sprites, the paintings, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Disk:** everything on D:/UILOOP (C: filled up on 10-21).
- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6` (lw-1 / lampworks, kc-1 / kitchens-cellars, bh-1 /
  bathhouse, hm-1 / hedge-maze) against BASE, interleaved, three pairs; check
  `size.drawW`. 15.5 ms hard. **The Hedge fight is ~14.9-15.2 -- the closest
  to the line: what you add there must be paid for in the same wing.** The
  Lampworks fight is the round's. Measure only when `tasklist` shows no
  UnrealEditor or UnrealBuildTool.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py`, `tests/link-queue`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and the
  region gates `tests/lampworks`, `tests/kitchens`, `tests/bathhouse`,
  `tests/hedge-maze`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py lampworks --port PORT --tier medium --seeds lampworks,wax,boiler   --out JUDGING/CODE/sheet-lampworks.png
cd "WT" && timeout 1500 python tools/variant_sheet.py kitchens  --port PORT --tier medium --seeds kitchen,scullery       --out JUDGING/CODE/sheet-kitchens.png
cd "WT" && timeout 1500 python tools/variant_sheet.py bathhouse --port PORT --tier medium --seeds bathhouse,steam,pool    --out JUDGING/CODE/sheet-bathhouse.png
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge     --port PORT --tier medium --seeds hedge,fountain,walk     --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-lampworks --port PORT --scene combat --region lampworks --encounter lw-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-lampworks-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
