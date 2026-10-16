# Round 34 — four rooms both judges rank high, and their near floor: the Hedge Maze, the Foyer, the Greenhouse, the Kennels

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md` and `BRIEF-r31.md` in full: round 31 is the
round this one repeats, for four more wings. This file wins wherever they
disagree. **Your rubric is `RUBRIC.md` as amended by `RUBRIC-r34.md`.**

**Rule for fx/ (2026-10-16, `af440e48`): a room or shape choice is a
`#define`, never a uniform.** A uniform makes FXC compile every room a program
can draw: warm-up went to 80-111 s and the map lost its context. Time any
program you grow with `tools/linkprof.py`.

## WHY THESE FOUR

Survey 5 (`SURVEY-2026-10-16.md`) photographed every room as played, seeded,
at the Deck's tier. The rooms sit at 4-6.5 against the boards' 6-7.5. Each of
these four has ONE defect both blind judges name in nearly the same words,
and each is high on both headroom lists:

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Hedge Maze** | 4, +2 | 4.5, +2 | "the hedge walls are flat noise-textured slabs with straight cardboard edges -- give the hedges ragged leafy tops, depth and shadowed bases"; "flat boxes with a noise texture cut perfectly square at the top, and the topiary at left is stacked discs" |
| **Foyer** | 5, +1.5 | 5, +1.5 | "flat untextured grey slabs frame the left, right and top edges (a door-flap at left, blue strips at both bottom corners), and the lower half is an empty plank floor"; "untextured grey slabs ... reading as a 3D scene's bounding box -- remove them, or make them drapes or carved door jambs" |
| **Greenhouse** | 4, +2 | 5.5, +1.2 | "a blown-out white smear sits on the raised paving at centre, and the 'greenhouse' holds a handful of small plants"; "a blown white light smear on the raised walkway reads as a rendering fault, and the beds hold a few tiny plants" |
| **Kennels** | 4, +1.5 | 5.5, +1.3 | "the back stall wall is muddy and indistinct under an overall brown-grey haze"; "the rear stall boarding behind the doghouses is a blurred band, and the floor below the doghouses (the lower 55%) is empty dim brown" |

Survey 4's judges named the Foyer's edge band too ("an undrawn band round its
edges"); round 31 did not own it.

## THE FIX LIST

### 1. THE NEAR FLOOR — both judges' first shared defect, again

Round 31 wrote the near-floor rule for ITS four wings only, and both judges
now find "the lower half of the frame an empty, soft, unlit floor plane
falling to black, with every object lined up along one back wall" in twelve
of the other thirteen. In your four wings the floor nearest the camera is
DRESSED and LIT: a rug, a runner, flags or turf with tone and edges; a pool of
light on it from a source the room has; one or two props standing IN it, not
against the back wall (the maze: stone edging, a bench, an urn or a fallen
topiary ball; the Foyer: the runner's border, a candle pool, a hall chair or
an umbrella stand; the Greenhouse: a potting bench, terracotta pots, a
watering can; the Kennels: straw piles, bowls, a lead rope, a water trough).
In a fight the lower third is under the hand, so dress the band ABOVE the
hand's top edge first. Read how round 31 did it in its four wings
(`VERDICTS-r31.md`, `GRAFT-r31.md`) and reuse the mechanism; if you make it a
shared rule, the seventeen-room sweep below must prove no other wing got worse.

### 2. EACH WING'S OWN DEFECT

- **The Hedge Maze:** hedge walls DRAWN as clipped leaf mass with depth --
  broken, leafy top silhouettes (not a ruler-straight top edge), lit leaf
  clusters on top, dark shadowed undersides and bases where they meet the
  lawn, no flat noise slab. The topiary as clipped foliage, not stacked discs.
  (Round 31 replaced the scallop tile; both judges still read the result as a
  box with a texture. The SILHOUETTE is what reads.)
- **The Foyer:** no flat grey slab anywhere at the frame's left, right or top
  edge, and no blue strip at the lower corners -- the room's own wall,
  carved door jambs, a lintel or drapes carry to the frame. Check it at BOTH
  1600x900 and 1280x800, and in a FIGHT (the board's chrome covers ~20 px of
  each edge, not 80). J1 also: the glass cabinet left of the fireplace drawn
  see-through over the arch (survey 4), the arch pediments stair-stepping.
- **The Greenhouse:** no blown-out white hotspot on the walkway -- a soft lit
  pool whose brightest point keeps texture; the beds and benches FULL of
  dense, inked foliage (ferns, palms, trailing vines) at several heights.
- **The Kennels:** the back stall wall CRISP -- boards, gates and name plaques
  with inked edges -- and the brown-grey haze lifted off it, so the darks
  keep their colour.

### 3. INK, NOT GRAIN; DARK, NOT MILKY

Edges that matter (hedge tops, door jambs, stall boards, glazing bars, leaf
edges) are inked crisp with round 21's pen. Soft or hazy is still worse than
stepped. A dark washed pale or milky is a defect, not a fix.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark
is too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/`
prep scripts, extended. A shared near-floor rule that lifts other wings too
is welcome ONLY with the seventeen-room sweep, SEEDED (`room_batch --rooms
wing:kind,...`, the list in `docs/ui-pass/survey-2026-10-16.sh`), proving
none got worse.

**Not yours:** the other thirteen wings (otherwise unchanged); round 28's
painted house and shared contact-shadow rule; the pen and floor camera from
round 21; round 31's four wings except through a shared rule as above;
`ui/enemy.js`, the stand-in room, `core/renderer.js` (keep its render-scale
governor: Josh's standing rule), the boards, the run strip, the cards, the
hand, `ui/hang.js`, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** at the MEDIUM tier with `tools/gpuprof.py --wait 40
  --settle 6`, a fight in each of your four wings against BASE, interleaved,
  three runs. 15.5 ms hard. The Foyer (16.3 ms) and Greenhouse (15.9 ms) were
  over budget before this round (HANDOFF, OPEN): do not make them worse, and
  say what they measure. Cold-start time (`tools/coldstart.py`) in the perf
  report.
- **A server started for a worktree must be started FROM that worktree** (it
  serves its own folder). BASE's server goes on YOUR port + 100.
- Warm-up is 12-21 s since the compile fix. If captures void or a map loses
  its context, time the warm-up (`tools/linkprof.py`) before blaming the
  machine.
- **Do the deliverables EARLY, then refine.** Commit as you go.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py`, `tests/link-queue`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and the
  region gates `tests/foyer`, `tests/greenhouse`, `tests/kennels`,
  `tests/hedge-maze`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge      --port PORT --tier medium --seeds hedge,fountain,walk            --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 1500 python tools/variant_sheet.py foyer      --port PORT --tier medium --seeds parlor,gallery,landing        --out JUDGING/CODE/sheet-foyer.png
cd "WT" && timeout 1500 python tools/variant_sheet.py greenhouse --port PORT --tier medium --seeds conservatory,palm,overgrown  --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && timeout 1500 python tools/variant_sheet.py kennels    --port PORT --tier medium --seeds kennels,wash                  --out JUDGING/CODE/sheet-kennels.png
cd "WT" && timeout 180 python tools/shot.py CODE-fight-foyer --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-foyer-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame -- at the edges of the
Foyer above all.
