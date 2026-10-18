# Round 37 — the last four rooms with an empty near floor: the Heart, the Nursery, the Study, the Pumpkin Grounds

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary**,
`BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md` to `BRIEF-r25.md`,
`BRIEF-r28.md`, `BRIEF-r29.md`, `BRIEF-r31.md`, `BRIEF-r34.md` and `BRIEF-r35.md` in
full: rounds 31, 34 and 35 are the rounds this one repeats, for four more
wings. Read `VERDICTS-r34.md` and `VERDICTS-r35.md` too: what its judges rewarded (a drawn, broken silhouette;
an object standing IN the near floor) and punished (spiky "crags", props
washed to one grey). This file wins wherever they disagree. **Your rubric is
`RUBRIC.md` as amended by `RUBRIC-r37.md`.**

**Rule for fx/: a room or shape choice is a `#define`, never a uniform.** Time
any program you grow with `tools/linkprof.py`; keep each link under 12 s.

## WHY THESE FOUR

Survey 5 (`SURVEY-2026-10-16.md`) put the rooms at 4-6.5 against the boards'
6-7.5; rounds 34 and 35 did eight wings. These four are the rest of both
judges' first shared defect, "the lower half of the frame an empty, soft,
unlit floor plane falling to black, with every object lined up along one back
wall":

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Heart** | 5, +1 | 5.5, +1.3 | "the statues are pale, flat forms and the near floor is an empty dark expanse"; "the lower 45% of the frame is a soft repeated-plank floor falling into black, and the right wall beyond the far statue dissolves into void" |
| **Nursery** | 5, +1 | 6, +1 | "the lower 55% of the frame is an empty dark plank floor under a well-dressed back wall"; "the floor below the fireplace wall (the lower 60%) is near black and empty" |
| **Study** | 5, +1 | 6, +1 | "the lower 60% is an empty dark floor under strong shelves, and the chandeliers are blown white blobs"; "a near-black plank field under a smeared vignette, and the book spines on the shelves stair-step at 1280" |
| **Pumpkin Grounds** | 5, +1 | 6, +1 | "the courtyard wall is a flat dark band, the trees are cardboard silhouettes, and the near paving is empty grey"; "the tree silhouettes at upper left are flat lollipop blobs, and the lower half of the courtyard is an unlit blue-black flagstone smear" |

## THE FIX LIST

### 1. THE NEAR FLOOR

In your four wings the floor nearest the camera is DRESSED and LIT: boards,
flags or turf with tone and edges; a pool of light on it from a source the
room has; one or two props standing IN it, not against the back wall (the
Heart: a ceremonial carpet, candles, a second candle pool; the Nursery: the
fire's light on a rug, scattered blocks, a rocking horse or a toy brought
forward; the Study: a rug, a reading table or chair with a lamp's pool,
stacked books; the Pumpkin Grounds: crisp flagstones lit by a jack-o'-lantern
cluster near the camera, straw, pumpkins). In a fight the lower third is
under the hand, so dress the band ABOVE the hand's top edge first. Reuse
round 31's `nearFloor` rule as rounds 34 and 35 extended it (`clean`, `dye`,
`rug`, `pool2`, `pool.abs`); round 34's GLAUCONITE carried it into the Study
and the Heart on its branch `ui/r34-rooms-b` -- read what it found.

### 2. EACH WING'S OWN DEFECT

- **The Heart:** the statues carved and shaded, not pale flat forms; the
  right wall beyond the far statue lit, so the hall has two sides.
- **The Nursery:** the near floor IS the defect: the back wall is already
  "well dressed" (J1) -- bring its warmth and its toys forward.
- **The Study:** the chandeliers' bloom tamed (no blown white blobs); the book
  spines crisp at 1280, not stair-stepped; the vignette not smeared.
- **The Pumpkin Grounds:** the courtyard wall given coping, ivy and lit
  niches, not a flat dark band; the trees drawn with broken, inked
  silhouettes, not cardboard lollipops.

### 3. INK, NOT GRAIN; DARK, NOT MILKY

Edges that matter (statue drapery, toy blocks, book spines, coping, tree
crowns) are inked crisp with round 21's pen. Soft or hazy is still worse than
stepped. A dark washed pale or milky is a defect, not a fix.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, kinds and props); palette COLOURS only where a dark
is too pale (say so); `fx/shaders/grade.js` only if truly needed; `tools/`
prep scripts, extended. A shared near-floor rule that lifts other wings too
is welcome ONLY with the seventeen-room sweep, SEEDED (`room_batch --rooms
wing:kind,...`, the list in `docs/ui-pass/survey-2026-10-16.sh`), proving
none got worse.

**Not yours:** the other thirteen wings (otherwise unchanged) -- rounds 34's
and 35's eight above all; round 28's painted house and shared contact-shadow rule; the
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
  cost inside one page). 15.5 ms hard; the Heart's fight is the one the round
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
  `tests/steam-deck`, and the region gates `tests/heart`, `tests/nursery`,
  `tests/study-library`, `tests/pumpkin-grounds`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py heart   --port PORT --tier medium --seeds heart,gallery,memory --out JUDGING/CODE/sheet-heart.png
cd "WT" && timeout 1500 python tools/variant_sheet.py nursery --port PORT --tier medium --seeds nursery,wardrobe     --out JUDGING/CODE/sheet-nursery.png
cd "WT" && timeout 1500 python tools/variant_sheet.py study   --port PORT --tier medium --seeds library,fireplace    --out JUDGING/CODE/sheet-study.png
cd "WT" && timeout 1500 python tools/variant_sheet.py pumpkin --port PORT --tier medium --seeds courtyard,patch,pond --out JUDGING/CODE/sheet-pumpkin.png
cd "WT" && timeout 600 python tools/shot.py CODE-fight-heart --port PORT --scene combat --region heart --encounter ht-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The fight also at `--w 1280 --h 800` as `fight-heart-1280.png`. Copy the
fight's PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fight and LOOK at every frame.
