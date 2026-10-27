# Round 47 — the four bottom rooms: the Kennels, the Hedge, the Attic, the Bathhouse

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md`,
`BRIEF-r35.md`, `BRIEF-r39.md`, `BRIEF-r41.md`, `REPAIR-r41.md`,
`BRIEF-r43.md` and `BRIEF-r45.md` in full. Read `VERDICTS-r34.md` and
`VERDICTS-r41.md` (the last two times the Kennels and the Hedge were rebuilt),
`VERDICTS-r35.md` (the Attic), `VERDICTS-r43.md` and `VERDICTS-r45.md` (the
Bathhouse, the Hedge) and README rows 41-46 (what the paired tests found).
This file wins wherever they disagree. **Your rubric is `RUBRIC.md` as
amended by `RUBRIC-r47.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py` (12 s budget; the Hedge prop
program is already 9-13 s: it must NOT grow). **A good link can be an empty
program:** read `gl.getProgramInfoLog` for every program you change.

## THE RULE THIS ROUND IS BUILT ON

Five times in two weeks a pass removed, muted, dimmed, smoothed or TIDIED
something a judge named, and a paired blind test found it worse (README rows
40r-46). **A drawn object beats an empty, dimmed, muted, smoothed or tidied
surface.** "Flat" and "toy-like" below do not mean "make it dull": they mean
the object is a placeholder. Give it material, ink and light so it belongs in
the room. Never fewer objects; never move an object out of frame to hide it;
keep each room's character. The Hedge's torn withered crowns won 4 of 4
against a smoothed version, and survey 10's paired test preferred round 45's
Hedge (its leaf texture no longer streaks) and Bathhouse (tubs with sheen).
Build ON them.

## WHY THESE FOUR

Survey 10 (`SURVEY-2026-10-23.md`): its paired test found 11 of 12 changed
pairs better than survey 9. These four rooms are the bottom four on BOTH
independent judges' sheets and the top four of both HEADROOM lists. The
Kennels and the Hedge were also the bottom pair in rounds 34 and 41: each
round moved them, and they are still last. So this round goes further than
dressing.

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Kennels** | 5, +2 | 4, +2.5 | "the bottom 45% of the frame is empty straw-strewn floor while the doghouses are toy-like flat-colour boxes along the back wall"; "toy boxes in flat primary green, red and blue with soft edges ... an empty floor scattered with flat orange straw strokes" -- "bring two kennels and a feeding trough forward into the mid-floor"; "weathered boards in muted colours with shingle roofs ... bowls, leashes and straw bales" |
| **Hedge** | 5, +2 | 4, +2.5 | "a soft repeating blob-noise texture with stepped silhouette tops, and the lawn is a flat green wash"; "flat planes wrapped in a tiled noise texture with a cut-out top" -- "clipped leaf masses with crisp, smooth tops and inked shadow lines"; "clumped, gapped, withered foliage with dead brown patches ... leaf litter and edging" |
| **Attic** | 5, +2 | 5, +2 | "the trunks at the left and right foreground have low-res blocky textures and stair-stepped bottom edges, and a purple moonlight smear washes across the floor"; "milky lilac moonlight that greys the darks ... low-poly boxes with stretched plaid textures" -- "one hard-edged window shaft on dark boards"; "bevelled lids, straps and brass corners" |
| **Bathhouse** | 5, +1.5 | 5, +2 | "the right third and the lower foreground are black void, and the tubs are low-poly with stepped rims, the floor tiles stair-stepping"; "flat-coloured low-poly bowls (salmon, mint, pink) with no enamel sheen, the sheet at left a grey blob, the blue tile floor centre-left milky" -- "light the right side and the foreground"; "enamel and copper with highlights and water reflections" |

## THE FIX LIST

### 1. HERO PROPS AS INKED OBJECTS, NOT PRIMITIVES -- both judges' SYSTEM #1

"Hero props are untextured or low-poly primitives with soft blob shadows ...
one prop pass of carved, inked, shadow-seated props touches eight wings" (J1).
In your four wings, each prop below gets an inked, broken silhouette (round
21's pen), a real material, a contact shadow sized to its foot and light from
the room's own source:

- **The Kennels:** the doghouses as weathered painted boards in muted colours
  (worn paint over grain, shingle roofs, a name board over each door, inked
  edges). Do NOT make them grey: muted means aged, not drained.
- **The Hedge:** the yew walls as clumped leaf masses with gaps and withered
  brown patches, an inked shadow line under each clump and a dark root line
  at the ground, the crowns still torn and withered. The lawn with an edge
  and leaf litter.
- **The Attic:** the steamer trunks with bevelled lids, straps, brass corners
  and a texture at full resolution (no stretched plaid, no stair-stepped
  bottom edge).
- **The Bathhouse:** the tubs as enamel (or copper) with a rim highlight, a
  water surface that reflects the windows, claw feet; the sheet at the left a
  draped cloth with folds, not a grey blob.

### 2. THE NEAR FLOOR DRESSED AND LIT -- both judges' SYSTEM #2

No near floor left empty or black. A light pool from a source the room has,
and objects standing IN it above the hand's top edge (round 31's
`nearFloor` rule as rounds 34-45 extended it: `clean`, `dye`, `rug`,
`pool2`, `pool.abs`, props placed in eye metres with `ahead` / `across`,
`cineFloor`):

- **The Kennels:** two kennels and a feeding trough brought forward into the
  mid-floor; bowls, a leash on a peg, straw bales and drifts where dogs drag
  it (not confetti over the whole floor).
- **The Bathhouse:** the right third and the foreground lit (a lamp, a
  window's spill on wet tile) and dressed (a stool, towels, a bucket).
- **The Hedge** and **the Attic:** whatever their near floor lacks, from the
  room's own world (a fallen urn, leaf drifts; a hatbox, a dressmaker's
  form, a rolled rug).

### 3. DARK, NOT MILKY; INK, NOT SMEAR -- both judges' SYSTEM #3

- **The Attic's moonlight:** one hard-edged window shaft on dark boards, not
  a lilac wash over the whole floor. The darks stay dark and coloured.
- **The Bathhouse's tiles:** no milky patch centre-left; tile joints inked and
  smooth, not stair-stepped.
- Soft or hazy is worse than stepped. A line should be crisp AND smooth, like
  ink.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark is
too pale (say so); `tools/` prep scripts, extended. A shared rule that lifts
other wings too is welcome ONLY with the seventeen-room sweep, SEEDED (the
list in `docs/ui-pass/survey-2026-10-23.sh`), proving none got worse, and a
shared change is judged in those wings too.

**Not yours:** the other thirteen wings (unchanged); `fx/shaders/grade.js`
(its edge aberration is being tested separately this round -- do not touch
it); the Hedge's withered crowns (keep them); round 28's painted house; the
pen and floor camera from round 21; `ui/*`, `core/renderer.js` (keep its
render-scale governor: Josh's standing rule), the boards, the cards, the
sprites, the paintings, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Disk:** everything on D:/UILOOP.
- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6` (kn-1 / kennels, hm-1 / hedge-maze, ao-1 /
  attic-observatory, bh-1 / bathhouse) against BASE, interleaved, three
  pairs; check `size.drawW`. 15.5 ms hard. **The Hedge fight is the closest
  to the line: what you add there must be paid for in the same wing.** The
  Kennels fight is the round's. Measure only when `tasklist` shows no
  UnrealEditor or UnrealBuildTool.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`. Commit after
  every step that works.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py`, `tests/link-queue`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and the
  region gates `tests/kennels`, `tests/hedge-maze`, `tests/attic-observatory`,
  `tests/bathhouse` (any that exists; name in your notes any that does not).
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py kennels   --port PORT --tier medium --seeds kennels,wash            --out JUDGING/CODE/sheet-kennels.png
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge     --port PORT --tier medium --seeds hedge,fountain,walk     --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 1500 python tools/variant_sheet.py attic     --port PORT --tier medium --seeds attic,library           --out JUDGING/CODE/sheet-attic.png
cd "WT" && timeout 1500 python tools/variant_sheet.py bathhouse --port PORT --tier medium --seeds bathhouse,steam,pool    --out JUDGING/CODE/sheet-bathhouse.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-kennels --port PORT --scene combat --region kennels --encounter kn-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-kennels-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
