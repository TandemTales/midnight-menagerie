# Round 31 — the four weakest rooms, and the near floor: the Passages, the Hedge Maze, the Kitchens, the Graveyard

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md` and `BRIEF-r29.md` in full: rounds 28 and 29 are the rounds
this one repeats. This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r31.md`.**

## WHY THESE FOUR

Survey 4 (`SURVEY-2026-10-12.md`) photographed every room AS PLAYED (seeded
-- see its note: the bare base shell a seedless capture draws is never seen)
and two blind judges put the rooms at 3-6 against the boards' 6-7. Both
judges' headroom lists open with the same four wings:

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Secret Passages** | 4, +2.5 | 3, +3 | "panel and light both corridor walls, and light the near floor"; "re-model the corridor wainscot with crisp panels and lit edges, and bring the lamp light onto the black near floor" |
| **Hedge Maze** | 4, +3 | 4, +3 | "the hedge texture is wrong outright"; "replace the repeated scallop tile with drawn clipped hedges and remove the floating gold lattice" |
| **Kitchens** | 4, +2.5 | 4, +2.5 | "draw the plate dresser and grain the tables, and calm the floor to stone flags"; "untangle the interpenetrating tables into one clear table each side with benches and shadows" |
| **Graveyard** | 5, +2 | 5, +2 | "repaint the scan-lined chapel wall as crisp masonry, and give the lawn tone and edges"; "re-texture the chapel gable at full resolution and bring large headstones into the near ground" |

## THE FIX LIST

### 1. THE NEAR FLOOR — both judges' first shared defect

"Every room puts its horizon at y≈320-400 and leaves 50-60% of the frame as
undressed floor fading to black." In your four wings, the floor nearest the
camera is DRESSED and LIT: a rug, a runner or flags; a pool of lamp light on
it; one or two props standing in it (the Passages' crates and a lantern; the
maze's stone edging, a bench, an urn; the Kitchens' flags, a bench, a basket;
the Graveyard's large headstones in the near ground). In a fight the lower
third is under the hand, so dress the band ABOVE the hand's top edge first.

### 2. EACH WING'S OWN DEFECT

- **The Passages:** a crisp panelled wainscot with lit edges down BOTH walls
  (no soft panel edges, no black void at the sides), sconces lighting each
  wall, the light carried onto the near floor.
- **The Hedge Maze:** drawn, clipped hedge walls -- leaf mass with lit tops
  and dark undersides -- in place of the repeated scallop tile; remove the
  stray gold lattice floating on the back wall; the lawn with tone and edges,
  dark but not flat.
- **The Kitchens:** ONE clear table each side with benches and contact
  shadows -- no tables interpenetrating each other or the range; grained
  wood; the plate dresser drawn; the floor stone flags, calm.
- **The Graveyard:** the chapel's gable and coursing as crisp masonry (no
  scan-lines); large headstones in the near ground; the lawn with tone and
  edges.

### 3. INK, NOT GRAIN — both judges' second shared defect

"Every room wears the same grain and soft bloom with no ink line, so at the
Deck's 1280 edges dissolve." In your four wings, edges that matter (panel
mouldings, hedge tops, table edges, masonry joints) are inked crisp with
round 21's pen; fine tracery does not stair-step. Soft or hazy is still worse
than stepped.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark
is too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/`
prep scripts, extended. A shared near-floor rule that lifts other wings too is
welcome ONLY with the seventeen-room sweep, SEEDED (`room_batch --rooms
wing:kind,...`, the list in `docs/ui-pass/survey-2026-10-12.sh`), proving
none got worse.

**Not yours:** the other thirteen wings (otherwise unchanged); round 28's
painted house and shared contact-shadow rule; the pen and floor camera from
round 21; `ui/enemy.js`, the stand-in room, `core/renderer.js` (keep its
render-scale governor: Josh's standing rule), the boards, the run strip, the
cards, the hand, `ui/hang.js`, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** at the MEDIUM tier with `tools/gpuprof.py --wait 40
  --settle 6` (without `--settle` the first number can be up to 10 ms of
  post-link stall), a fight in each of your four wings against BASE,
  interleaved, three runs. 15.5 ms hard.
- **BASE's server goes on YOUR port + 100** (9181 -> 9281 and so on).
- **Do the deliverables EARLY, then refine.** Commit as you go.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py`, `tests/combat-scene/seam.py`,
  `tests/chrome`, `tests/steam-deck`, and the region gates
  `tests/secret-passages`, `tests/hedge-maze`, `tests/kitchens`,
  `tests/graveyard`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py passages  --port PORT --tier medium --seeds passage,library,closet --out JUDGING/CODE/sheet-passages.png
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge     --port PORT --tier medium --seeds hedge,fountain,walk    --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 1500 python tools/variant_sheet.py kitchens  --port PORT --tier medium --seeds kitchen,scullery       --out JUDGING/CODE/sheet-kitchens.png
cd "WT" && timeout 1500 python tools/variant_sheet.py graveyard --port PORT --tier medium --seeds yard,plots,gate        --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && timeout 180 python tools/shot.py CODE-fight-kitchens --port PORT --scene combat --region kitchens-cellars --encounter kc-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-kitchens-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
