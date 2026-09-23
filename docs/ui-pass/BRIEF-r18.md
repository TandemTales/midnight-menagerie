# Round 18 — the garden and the horizon, and faces at the size they are drawn

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r9.md` for
the standing priorities, `BRIEF-r10.md` for the instrument traps, and
`BRIEF-r11.md` for the machinery, the budget and the traps. **Your rubric is
`RUBRIC-r11.md` as amended by `RUBRIC-r18.md`.** The unit is a contact sheet
of three rooms of one wing, and a sheet must still win both questions —
different rooms, same wing.

## WHERE ROUND 17 LEFT IT

LITHARGE won (`44b37fe`), 2 of 2 judges, 6.65 against 5.40, three of five
screens. For sixteen rounds the house was painted and unpeopled; it is
peopled now, and with variety — sitters that differ in sex, dress, pose and
scale; musicians behind the ballroom's gallery rail; dancing couples in the
mirror-hall glass; a veiled mourner in the graveyard; a figure in a lit
window.

**It left two wings untouched, and there the round's best work is on the two
branches that lost.** Both judges named the same grafts. That is item 1.

Three standing rules, none negotiable:

- **Light the OBJECT, never the room.** A candidate whose darkest corners go
  pale, milky or grey scores below a darker one.
- **Do not FLATTEN a drawn object to fix something else.** Round 16 lost a
  coffered ceiling that way; round 17 lost a glass roof.
- **Measure before you believe a judge about geometry.** The mirror hall
  parquet was reported bent (round 15) and then unshrinking (round 16), and
  both times the measurement showed the drawing was right. It is 21 px near
  and 12 px far; leave it alone.

## THE FIX LIST, from both round-17 judges

### 1. THE GRAFTS — both judges, and the work is on two branches

Read them with `git log 650ce93..ui/r17-rooms-c` (FOLIUM) and
`git log 650ce93..ui/r17-rooms-a` (SIENNA), and `git show <branch>:<path>`.
They rewrote the same shader file as the winner, so REBUILD these inside the
merged tree rather than cherry-picking.

- **The graveyard treeline — FOLIUM**, both judges: ragged-tier conifers of
  unequal height, jittered in their slots with both neighbours evaluated,
  limbed up above a tapering trunk, with broadleaf trees among them on the
  gate panel, and the far band drawn lighter than the near. Replace the row of
  identical smooth cones in all three panels, including "the tall pale cone
  behind the moon in the plots panel". **Do NOT bring FOLIUM's stray thin
  dark diagonal lines** across the mausolea and the chapel gable — a judge
  read them as "the tree drawing leaking over the masonry, not cracks".
- **The glasshouse roof — both builders, and take the right half of each.**
  FOLIUM made the ceiling PITCHED geometry, two slopes to a ridge, so the
  bars, purlins and ridge converge in true perspective. SIENNA made it
  ridge-and-furrow in bays with glazing that is broken, missing and replaced
  in panes of unequal size. Judge 2 wants the rake, judge 1 wants the broken
  panes; **have both**. **But FOLIUM's palmhouse lost its glazed roof over the
  whole centre bay to a starry black void** — judge 1 called it a flattening
  regression and scored the sheet below the baseline for it. The palmhouse
  must be roofed.
- **The arched proscenium** in the ballroom suite — both builders built one,
  and both judges asked for it: pilasters with bases and capitals, an arch
  cut in voussoirs as a three-fascia archivolt, imposts, a keystone, roundels
  or rosettes in the spandrels, and the curtains and valance cut to the arch.
  The flat box pelmet reads as "a puppet-theatre cut-out beside the
  ballroom's carved gallery and fluted columns".
- **The pinnate fern — FOLIUM**, both judges: a second plant species among
  the palmhouse's one repeated rosette. And SIENNA's **fountain basin** — a
  widened basin with a raised lip — under LITHARGE's water-carrier figure.

### 2. FACES AT THE SIZE THEY ARE DRAWN — both judges

LITHARGE's people are right at the scale of a figure and blank at the scale
of a face:

- the landing sitters' faces "are pale ovals" at the ~20 px they are drawn:
  give each its three marks — a brow, a nose line, one dark eye socket;
- **the gallery busts, asked for three rounds running**: "the busts on
  pedestals in the right-hand arcade niches are still small pale blobs with
  no brow, nose or eye socket, while the parlor and landing canvases now hold
  real, varied sitters" — the gallery is "the one Foyer room still unpeopled".
  Vary head direction as well;
- the parlor's two small canvases either side of the overmantel are "dim
  blank fields" — sitters in a different pose and scale from the central
  woman in blue;
- combat's right-wall portraits behind the Calling Bell read as guesswork at
  1280: lift them to the level the oval over the Dust Bunny already reaches —
  by lighting the portrait, not the wall.

### 3. NOTHING REPEATED WITHOUT VARIATION — both judges

- **the vinery's espalier**: "one espalier unit — same stem, same leaf spray,
  same two grape bunches — at an even pitch around the whole room". Vary stem
  height, spread and bunch count; leave some bays bare or dead;
- **the troughs**: "one broad rosette repeated in every trough" — mix
  pinnate, spiky and trailing forms;
- **the musicians**: "one row of equal black cut-outs at one height" — one
  seated, one standing behind the rail, one half-hidden by a stand;
- the landing's right bay: the empty oval frame behind the chandelier wants a
  sitter or an unfaded patch of paper behind it (SIENNA's `gUnfade` is how).

### 4. SMALLER

- a figure at the suite's piano, or on its stage;
- the chapel's buttresses, where the merged tree still lacks them — both
  losing branches drew them, with lit faces and cast shadows.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/atmosphere.js`, `fx/backdrop.js`, `fx/shaders/backdrop.js`, and
`fx/shaders/grade.js` only if a fix truly needs it.

**NOT yours:** the Bathhouse and the Lampworks — prove you left them alone by
photographing both sheets and comparing content, not hashes (round 17's
SIENNA found the Bathhouse shares plant crowns with the greenhouse and had to
pin them: check yours). Also not yours: the enemy and Companion sprites, the
HUD, the card kit, the plates, the type, the dialog controls, the web chrome,
gameplay, and the region palettes.

**What must not vary**, as `BRIEF-r11.md`: palette and arch mode hold across
a wing's rooms, material vocabulary holds, and every kind is a room that wing
really has.

## PERFORMANCE, TRAPS, DELIVERABLES

Exactly as `BRIEF-r16.md`: both frames against BASE, interleaved, three runs
each, **always `--wait 40`**; 15.5 ms hard on both; report link times. Stop
only the processes you started, by PID. **Your dev server can die mid-round
and another builder's server can take its port** — round 17's winner lost its
server and found a BASE server on its port; if a capture looks like BASE,
check what is listening before you believe it. Run tests through
`python tools/on_port.py PORT <test>` with your own server up. An unwritten
uniform is `(0,0,0,1)`, not zero. **Say in your notes what you did NOT do.**

```
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --seeds parlor,gallery,landing       --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --seeds ballroom,mirrorhall,suite    --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --seeds yard,plots,gate              --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/shot.py CODE-combat --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
```

`combat` also at `--w 1280 --h 800` as `combat-1280.png`; check its
`perf.band` (29-36). Plus `ENDINGS OK`, `tests/shader-literals/check.py`
green, `glStd` per panel, a seventeen-wing sweep looked at, the
bathhouse/lampworks comparison, and `notes_for_merger` with both perf deltas,
link times, every number you added, and what you did not do.
