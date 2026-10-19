# Round 39 — the four rooms the near floor never reached: the Bathhouse, the Lampworks, the Kitchens, the Ballroom

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md`, `BRIEF-r35.md` and `BRIEF-r37.md` in
full: rounds 31, 34, 35 and 37 are the rounds this one repeats, for four more
wings. Read `VERDICTS-r34.md`, `VERDICTS-r35.md` and `VERDICTS-r37.md` too: what its judges rewarded (a drawn, broken silhouette;
an object standing IN the near floor) and punished (spiky "crags", props
washed to one grey). This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r39.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py`; keep each link under 12 s.

## WHY THESE FOUR

Survey 6 (`SURVEY-2026-10-19.md`) ran a PAIRED blind test against survey 5:
the version after rounds 34-38 won 24 and 23 of 32 pairs. The pairs judged
"equal" were exactly what no round had touched -- and four of them are these
rooms, byte-identical between the surveys. Both judges put them high on their
headroom lists, and both paired judges name what decides a room: "drawn
objects standing on the near floor beat lit empty space".

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Bathhouse** | 4.5, +1.6 | 4, +2.5 | "the tubs are small and pushed to the back, and the tile floor across the lower 60% is a hazy grey-blue empty plane"; "the bottom 60% of the frame is an empty mottled tile field, and every tub is a tiny prop stranded against the back wall" |
| **Lampworks** | 4.5, +1.8 | 6, +1.5 | "the workbenches are thin sparse frames and the floor plane is a huge dark tile grid filling 60% of the frame"; "the bottom half is an empty dark flagstone field, and the workbenches are spindly stick frames carrying flat coloured squares" |
| **Kitchens** | 4.5, +1.8 | 5, +2 | "the bottom 55% is an empty flagstone floor blown orange by the range, with a purple/orange colour split and nothing on it"; "the floor's huge flagstones are smooth flat polygons washed in a saturated orange-to-violet gradient that reads as lighting on blank geometry" |
| **Ballroom** | 5, +1.3 | 6, +1 | "the checker floor is an empty plane across the lower 55% under a purple haze, and the musicians' balcony is tiny"; "the back wall above the minstrel gallery is a flat grid of identical red panels outlined by thin gold rectangles, like a CSS box grid" |

## THE FIX LIST

### 1. THE NEAR FLOOR

In your four wings the floor nearest the camera is DRESSED and LIT: tiles,
flags or boards with tone and edges; a pool of light on it from a source the
room has; objects standing IN it, not against the back wall (the Bathhouse: a
sunken bath or a row of tubs brought into the midground, towels, a drain
pool, wet-tile highlights under the rain windows; the Lampworks: one
workbench brought forward with modelled glass lamps and tools, crates of
lamps, coiled wick, its lamplight pooled on the floor; the Kitchens: work
tables, sacks and a butcher block on the floor, flour or straw dust; the
Ballroom: chairs, a dropped fan fully in frame, petals). In a fight the lower
third is under the hand, so dress the band ABOVE the hand's top edge first.
Reuse round 31's `nearFloor` rule as rounds 34, 35 and 37 extended it
(`clean`, `dye`, `rug`, `pool2`, `pool.abs`, props placed in eye metres with
`ahead` / `across`, `cineFloor`).

### 2. EACH WING'S OWN DEFECT

- **The Bathhouse:** the floor's milky grey-blue darks deepened -- wet,
  dark tile with crisp reflections, not haze.
- **The Lampworks:** the workbenches given mass and clutter (glass chimneys,
  wicks, tools), not stick frames carrying flat squares.
- **The Kitchens:** smaller, worn flagstones with chipped edges, not huge
  flat polygons; the range's orange glare tamed and the violet side cooled
  to a natural shadow, so the darks hold.
- **The Ballroom:** the back wall's panels carved -- damask, raised mouldings,
  light falloff from the chandeliers -- not a grid of gold rectangles; the
  musicians' balcony a lit focal point; the purple haze off the floor.

### 3. INK, NOT GRAIN; DARK, NOT MILKY

Edges that matter (tub rims, bench legs and glass, flag joints, panel
mouldings) are inked crisp with round 21's pen. Soft or hazy is still worse
than stepped. A dark washed pale or milky is a defect, not a fix.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark
is too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/`
prep scripts, extended. A shared near-floor rule that lifts other wings too
is welcome ONLY with the seventeen-room sweep, SEEDED (`room_batch --rooms
wing:kind,...`, the list in `docs/ui-pass/survey-2026-10-16.sh`), proving
none got worse.

**Not yours:** the other thirteen wings (otherwise unchanged) -- the twelve
wings rounds 31-37 rebuilt above all; round 28's painted house and shared contact-shadow rule; the
pen and floor camera from round 21; `ui/enemy.js`, the stand-in room,
`core/renderer.js` (keep its render-scale governor: Josh's standing rule),
the boards, the run strip, the cards, the hand, `ui/hang.js`, the sprites,
gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** at the MEDIUM tier: `python tools/on_port.py PORT
  tools/gpuprof.py --scene combat --hash "encounter=<id>&region=<wing>"
  --wait 40 --settle 6`, a fight in each of your four wings against BASE,
  interleaved, three pairs; read the DELTAS (round 34 found T_full bimodal
  page to page while the machine settled; `tools/shapeprof.py` isolates a
  cost inside one page). 15.5 ms hard; the Bathhouse's fight is the one the round
  is judged on -- leave it no worse than BASE. Cold-start time
  (`tools/coldstart.py`) in the perf report. Check `tasklist` for games.
- **A server started for a worktree must be started FROM that worktree.**
  BASE's server goes on YOUR port + 100.
- Three builders share one GPU: wrap captures in `timeout 600`, not 180
  (round 34 lost fights to "Target crashed" and "never finished warming").
- **Commit after every step that works.** Round 34's builders were stopped
  twice by usage limits; whatever is committed survives.
- Tests via `python tools/on_port.py PORT <test>`: `tests/dup-keys/check.py`,
  `tests/shader-literals/check.py` (directly if on_port says it never names
  8777), `tests/link-queue`, `tests/combat-scene/seam.py`, `tests/chrome`,
  `tests/steam-deck`, and the region gates `tests/bathhouse`, `tests/lampworks`,
  `tests/kitchens`, `tests/ballroom`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py bathhouse --port PORT --tier medium --seeds bathhouse,steam,pool    --out JUDGING/CODE/sheet-bathhouse.png
cd "WT" && timeout 1500 python tools/variant_sheet.py lampworks --port PORT --tier medium --seeds lampworks,wax,boiler   --out JUDGING/CODE/sheet-lampworks.png
cd "WT" && timeout 1500 python tools/variant_sheet.py kitchens  --port PORT --tier medium --seeds kitchen,scullery       --out JUDGING/CODE/sheet-kitchens.png
cd "WT" && timeout 1500 python tools/variant_sheet.py ballroom  --port PORT --tier medium --seeds ballroom,suite,salon   --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-bathhouse --port PORT --scene combat --region bathhouse --encounter bh-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-bathhouse-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame. Measure performance
only when `tasklist` shows no UnrealEditor or game: under them, half of
gpuprof's pages time nothing.
