# Round 22 — four wings that are not yet their name

Read `BRIEF-r0.md` in full — its **The style, in rules**, **Hard rules** and
**Your sandbox** sections apply word for word — then `BRIEF-r1.md`'s **What
round 0 decided** (the kit), `BRIEF-r11.md`'s **what must not vary** (a
wing's palette and arch mode hold across its rooms; every kind is a room that
wing really has), `BRIEF-r16.md`'s **performance** rules, and `BRIEF-r21.md`
in full: it is the round this one builds on. This file wins wherever they
disagree. **Your rubric is `RUBRIC.md` as amended by `RUBRIC-r22.md`.**

## WHY THESE FOUR

A survey on 2026-09-30 (`SURVEY-2026-09-30.md`) photographed every screen
and all seventeen fight rooms at the Steam Deck's tier. The screens sit at
6-7.5. The rooms sit at 2-5, and two blind judges, viewing in opposite orders,
put the same four wings at the head of their HEADROOM lists:

| wing | judge 1 | judge 2 | what both said |
|---|---|---|---|
| **Hedge Maze** | 2, +3 | 2, +3 | "there is no maze; a flat paved plaza with knee-high noise-speckled shrub lumps along the horizon" |
| **Kitchens & Cellars** | 3, +2.5 | 3, +3 | "a pale silver foil sheet, and the ovens and range across it are flat outline circles and rectangles — a wireframe on foil" |
| **Secret Passages** | 3, +2 | 2, +3 | "pale, milky lilac cloud texture with thin outline rectangles standing in for panels — the brightest and least-dark thing in any room" |
| **Pumpkin Grounds** | 2, +3 | 3, +2 | "orange cubes of speckled noise with no round, ribbed pumpkin shape, and the mansion behind is a flat teal block" |

Round 21 (`d49b788`, graft `18ea11e`) inked the rooms' lines with **the pen**
(`mmPen`, `mmInk`, `mmRamp`, `mmLod` in the backdrop shader's LIGHT_LIB) and
brought every fight's floor up to where the fighters stand. It fixed HOW the
rooms are drawn. This round is WHAT is in them.

## THE FIX LIST

### 1. EACH WING IS ITS NAME — both judges, all four wings

- **The Hedge Maze is a maze.** Clipped yew walls TALLER than the Kid, dark
  leaf masses with lit top edges, forming corridors that recede left and
  right, with a gap to the moonlit sky. Not lumps, not a plaza. Its four
  rooms (the maze, the fountain court, the gate, the walk) each read as a
  place inside the maze.
- **The Kitchens have a kitchen.** A dark cast-iron range with glowing
  fireboxes, copper pans and hooks, against soot-dark brick. The scullery
  has its sinks, racks and crockery. No foil, no outline drawing on a sheet.
- **The Secret Passages are dark panelling with hidden doors.** Near-black
  wood with real raised mouldings and door seams, lit only in pools by the
  lanterns, darkening into the vanishing point. The library passage, the
  closet and the crawlspace each read as that.
- **The Pumpkin Grounds grow pumpkins.** Round, ribbed pumpkins with stems,
  some carved and lit from inside, on vines, in rows; the mansion behind
  drawn with the detail of `UI/mainMenu.png`'s house, not a teal block. The
  patch, the pond and the moon gate each read as that.

### 2. A WALL IS BUILT, NOT A TEXTURE — both judges

The worst material in all four wings is a mottled cloud/noise texture with
outline drawing laid on it in place of a built surface. Every wall, hedge and
facade this round is BUILT: courses, panels, mouldings, leaves, joints, with
relief and light, drawn with round 21's pen where it is a line. **And the
darks stay dark**: a pale, milky or grey dark is a defect, and Passages' walls
are currently the palest dark in the game.

### 3. OBJECTS ARE DRAWN, NOT NOISE

"Noise blobs standing in for the wing's signature object" was both judges'
system defect. A pumpkin, a hedge, a pan, a door must have a SILHOUETTE a
viewer names at a glance, with its own shading and a contact shadow on the
floor. Speckle is not texture.

### 4. THE HEART'S FLOOR SEAM — a bug, both judges

"A hard, straight lighting seam cuts across the whole floor at y≈620" in the
Heart. Find the cause (measure: which term steps there), fix it, and prove
the Heart's floor falls off smoothly. It is not one of your four wings: touch
only what the seam needs.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/shaders/backdrop.js`, `fx/backdrop.js`, `fx/atmosphere.js`
(the four wings' rooms, their kinds and props; the palette's COLOURS only
where a wall is too pale a dark, and say so in your notes), and
`fx/shaders/grade.js` only if a fix truly needs it. `tools/` prep scripts if
you make art, extended rather than duplicated.

**Not yours:** the other thirteen wings (prove you left them alone: sweep
all seventeen before and after, and compare content, not hashes; shared code
paths are the trap — round 17 found the Bathhouse sharing plant crowns with
the Greenhouse); the pen and the floor camera from round 21 (use them, do not
rewrite them); `ui/enemy.js`, the stand-in room, `core/renderer.js`, the run
rail, the hand, the cards, the sprites, gameplay.

## PERFORMANCE, TRAPS, DELIVERABLES

- **Performance** as `BRIEF-r16.md`, at the MEDIUM (Deck) tier: a fight in
  each of your four wings against BASE, interleaved, three runs, `--wait 40`,
  15.5 ms hard. The Greenhouse and Foyer frames are the reference and are at
  the budget already; a new wing's fight must not be the next one over.
- **Pin the tier in every capture** (`BRIEF-r21.md`'s DECK step); the sheets
  below pass `--tier medium`.
- Tests via `python tools/on_port.py PORT <test>` with your own server up: at
  least `tests/shader-literals/check.py`, `tests/combat-scene/seam.py`,
  `tests/chrome`, `tests/steam-deck` (the Map boss row is a known race), and
  every region gate for your four wings (`tests/hedge-maze`,
  `tests/kitchens`, `tests/secret-passages`, `tests/pumpkin-grounds`
  and `tests/heart`).
- Stop ONLY the processes you started, BY PID. Commit as you go (round 21
  lost a day to a usage limit mid-round; the commits are what resumed it).
  `python tools/endings_guard.py --base BASE` must print ENDINGS OK. An
  unwritten uniform is `(0,0,0,1)`, not zero. **Say in your notes what you
  did NOT do.**

```
DECK="js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
cd "WT" && python tools/variant_sheet.py hedge    --port PORT --tier medium --seeds hedge,fountain,walk      --out JUDGING/CODE/sheet-hedge.png
cd "WT" && python tools/variant_sheet.py kitchens --port PORT --tier medium --seeds kitchen,scullery         --out JUDGING/CODE/sheet-kitchens.png
cd "WT" && python tools/variant_sheet.py passages --port PORT --tier medium --seeds passage,library,closet   --out JUDGING/CODE/sheet-passages.png
cd "WT" && python tools/variant_sheet.py pumpkin  --port PORT --tier medium --seeds courtyard,patch,pond    --out JUDGING/CODE/sheet-pumpkin.png
cd "WT" && python tools/variant_sheet.py heart    --port PORT --tier medium --seeds heart                    --out JUDGING/CODE/sheet-heart.png
cd "WT" && python tools/shot.py CODE-fight-hedge   --port PORT --scene combat --region hedge-maze      --encounter hm-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
cd "WT" && python tools/shot.py CODE-fight-pumpkin --port PORT --scene combat --region pumpkin-grounds --encounter pk-1 --seed 7 --companion bones --kid maya --wait 8 --steps "$DECK|wait:3"
```

The two fights also at `--w 1280 --h 800` as `<screen>-1280.png`. Copy the
fights' PNGs to `JUDGING/CODE/<screen>.png` with the `CODE-` prefix removed.
Check `perf.band` on the fights and LOOK at every frame.
