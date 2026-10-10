# Round 29 — the next four rooms: the Hedge Maze, the Sleeping Quarters, the Heart, the Greenhouse

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary** (a
wing's palette and arch mode hold across its rooms; every kind is a room that
wing really has), `BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md`
to `BRIEF-r25.md` and `BRIEF-r28.md` in full: round 28 is the round this one
repeats, for the next four wings. This file wins wherever they disagree.
**Your rubric is `RUBRIC.md` as amended by `RUBRIC-r29.md`.**

## WHY THESE FOUR

Survey 3 (`SURVEY-2026-10-04.md`) named one shared room defect -- flat prop
primitives with no contact shadow, and haze lifting the darks -- and round 28
fixed it in five wings (+2.39). Round 28 also found that every prop's contact
shadow had been back-face culled since round 2: the shadows draw in all
seventeen wings now, so build ON them. These four are next on both judges'
headroom lists:

| wing | J1 | J2 | what they said |
|---|---|---|---|
| **Hedge Maze** | 4 | 4, +2 | "the hedge walls are one stamped leaf-blob texture repeated, and the path and lawn are milky grey under a grain wash"; "stamped lumpy-sphere pattern in a healthy bright green" |
| **Sleeping Quarters** | 3 | 4, +2 | "a near-empty dark box with two tiny beds at the edges and nightgowns as flat cards along the back wall"; "the far wall is a milky grey-brown haze, and the beds and washstands are tiny, flat-lit and lost against it" |
| **Heart** | 4 | 5, +1.5 | "the statues left and right are soft grey blobs, the back wall's portraits are lost under shafts of haze, and the floor's right third is a milky blue-grey" |
| **Greenhouse** | 4 | 5, +1.5 | "the glass wall is a uniform grid of identical square panes in teal haze, the planters are flat salmon boxes"; "a flat graph-paper grid with no glazing bars, frames or reflections" |

## THE FIX LIST

### 1. EACH WING IS ITS NAME, BUILT AND DRAWN

- **The Hedge Maze:** clipped yew walls that are WITHERED and DARK -- deep
  green going to brown, with gaps, dead branches and crisp clipped tops lit
  along their edge -- not a stamped repeat of bright-green lumps. The path
  and lawn go to a true dark (no grey haze); the fountain court and the walk
  each read as a place inside the maze.
- **The Sleeping Quarters:** a DORMITORY -- rows of iron beds in perspective
  down BOTH side walls toward the stage, brought forward and up in scale, with
  blankets, pillows and washstands; the far wall a deep saturated dark with
  the moonlit window as its one cold light. The nightgowns on the back wall
  are hanging cloth with folds, not flat cards. The bedroom is a different
  room from the dormitory.
- **The Heart:** the statues are carved -- drapery, faces, edges -- with
  contact shadows on the floor; the portraits sit in a DEEP dark wall, legible,
  not lost under shafts of haze; the floor keeps its dark (no milky blue-grey
  third).
- **The Greenhouse:** a glasshouse BUILT of cast-iron ribs and arched bays
  with ornament, moonlit panes with reflections and varied glazing -- not a
  uniform graph-paper grid; the planters moulded (lips, soil, shadow on the
  floor), overgrown hanging and potted plants crowding the midground on both
  sides; the right half of the floor is not black.

### 2. EVERY HERO PROP HAS A FINISH AND A SHADOW

As round 28: beds, washstands, statues, planters, the fountain -- drawn
objects with their material, their own shading and a contact shadow. Round
28's shared contact-shadow rule already runs in these wings; tune it where a
prop still floats.

### 3. THE DARKS STAY DOWN, NO HAZE

The Hedge's grey lawn, the Sleeping Quarters' milky far wall, the Heart's
hazy shafts and blue-grey floor, the Greenhouse's teal haze: all go. Keep the
light where the fighters stand. Soft or hazy is worse than stepped. Say in
your notes if you change a palette COLOUR, and why.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js` (the
four wings' rooms, kinds and props); palette COLOURS only where a dark is too
pale (say so); `fx/shaders/grade.js` only if a fix truly needs it; `tools/`
prep scripts, extended rather than duplicated.

**Not yours:** the other thirteen wings (prove them unchanged with the
seventeen-room sweep: compare content, not hashes); round 28's five wings,
its painted house, its shared contact-shadow fix and rule; the pen and floor
camera from round 21; `ui/enemy.js`, the stand-in room, `core/renderer.js`
(keep its render-scale governor: Josh's standing rule), the run rail, the
hand, the cards, the hung pictures (`ui/hang.js`), the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** as `BRIEF-r16.md`, at the MEDIUM (Deck) tier, with
  `tools/gpuprof.py --wait 40 --settle 6` (round 28 found that without
  `--settle`, the first number can land in the 2-3 s after an in-line shader
  link and read up to 10 ms slow on ANY build). A fight in each of your four
  wings against BASE, interleaved, three runs. 15.5 ms hard; the Greenhouse
  is already at ~15.9: do not make it worse.
- **BASE's server goes on YOUR port + 100** (9141 -> 9241 and so on).
- **Pin the tier in every capture** (`BRIEF-r21.md`'s DECK step). Hold the GPU
  slot (`tools/gpu_slot.py`) for a batch of captures.
- **Do the deliverables EARLY, then refine.** Round 28's builders were stopped
  three times by usage limits; the ones with captures, tests and the endings
  guard already done were the ones the round could judge. Commit as you go.
- Tests via `python tools/on_port.py PORT <test>` with your own server up:
  `tests/dup-keys/check.py`, `tests/shader-literals/check.py`,
  `tests/combat-scene/seam.py`, `tests/chrome`, `tests/steam-deck`, and the
  region gates `tests/hedge-maze`, `tests/sleeping-quarters`, `tests/heart`,
  `tests/greenhouse`.
- Stop ONLY the processes you started, BY PID. `python tools/endings_guard.py
  --base BASE` must print ENDINGS OK. **Say in your notes what you did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && timeout 1500 python tools/variant_sheet.py hedge      --port PORT --tier medium --seeds hedge,fountain,walk           --out JUDGING/CODE/sheet-hedge.png
cd "WT" && timeout 1500 python tools/variant_sheet.py sleeping   --port PORT --tier medium --seeds dormitory,bedroom             --out JUDGING/CODE/sheet-sleeping.png
cd "WT" && timeout 1500 python tools/variant_sheet.py heart      --port PORT --tier medium --seeds heart                         --out JUDGING/CODE/sheet-heart.png
cd "WT" && timeout 1500 python tools/variant_sheet.py greenhouse --port PORT --tier medium --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && timeout 180 python tools/shot.py CODE-fight-sleeping --port PORT --scene combat --region sleeping-quarters --encounter sq-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

(`variant_sheet.py` gets 1500 s: round 28's graft measured a sheet's warm-up
alone at 75 s or more, and `timeout 180` killed them.) The fight also at
`--w 1280 --h 800` as `fight-sleeping-1280.png`. Copy the fight's PNGs to
`JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed. Check
`perf.band` on the fight and LOOK at every frame.
