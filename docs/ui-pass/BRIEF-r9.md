# Round 9 — the room, drawn accurately: real objects, real dimensions, straight lines

Read `BRIEF-r0.md` and `BRIEF-r1.md` first for how a round runs. Read
`BRIEF-r8.md` for the two rooms, the instruments and the traps, which are all
still current. **This brief changes what the round is judged on**, so where it
disagrees with any earlier brief, this one wins.

## WHAT JOSH ASKED FOR, and it is a re-weighting

2026-09-17, after seeing the palette comparison:

> *"dont limit yourself to the colors of the UI image examples for the
> background so closely. it is way more important that it just look appropriate
> for the setting and as accurately presented with readable objects that make
> sense and are drawn with care and attention (straight lines, appropriate
> scale, etc) ... and as accurately presented as possible"*

So the order of what matters, and it is not the order the last four rounds used:

1. **READABLE OBJECTS THAT MAKE SENSE.** A thing in the room must be
   recognisable as that thing. Not suggestive of it — recognisable.
2. **ACCURATELY PRESENTED, as accurately as possible.** It must be built the way
   the real object is built, at the real object's proportions. A staircase has
   treads and risers of a fixed size, a stringer carrying them, balusters at a
   regular pitch and a handrail at a constant height above the pitch line. Get
   those right and it reads as a stair from any distance.
3. **DRAWN WITH CARE AND ATTENTION.** Straight lines where the thing is
   straight. Regular spacing where it is regular. Square corners where it is
   square. Appropriate scale everywhere.
4. **APPROPRIATE FOR THE SETTING.** A decayed Victorian house at night.

**And explicitly demoted: matching the samples' colour.** Do not pull a region
toward `UI/*.png`'s palette. The Impossible Greenhouse is allowed to be green,
the Ballroom is allowed to be plum, the Secret Passages is allowed to be
magenta. Josh has ruled on this and the old fix-8 question is closed. A colour
needs to suit the setting and nothing more.

`UI/*.png` remain the reference for **craft** — the density of drawn detail, the
line round a form, the way a candle falls off, how black the darks go. They are
no longer the reference for hue or saturation on a background.

## WHERE ROUND 8 GOT TO

Round 8's winner gave every region a **subject** drawn into the wall's relief
rather than its colour: a stair in the Foyer, ossuary niches in the Crypt, a
bookcase in the Study, a fence in the Graveyard, seventeen in all. +1.58 over
the baseline, winning all six screens, at no frame cost. Then the four
ceiling-less regions got a real sky.

So the rooms now have subjects. **What they do not have is accuracy**, and both
judges said so in their own words without being asked to:

- *"the twin stair flights and the landing balustrade are single-weight
  hairlines... the stairs read as a wireframe laid over the wallpaper rather
  than stairs standing in the hall"*
- *"the roof behind the main block is a pale soft triangle with no ridge, no
  tile courses and no edge against the sky"*
- *"the shelving that runs the length of both side walls is a mat of thin dark
  horizontal bars with nothing standing on it — it reads as scaffolding rather
  than an ossuary"*
- *"the lumpy white mound in the right foreground... reads as a cauliflower
  rather than a broken tomb or a pile of bones"*
- *"the row of solid black cones along the top of the boundary wall reads as a
  line of traffic cones"*
- *"the chest, armchair and wardrobe are pale grey slabs with no contour and no
  contents"*

Every one of those is an accuracy failure, not a colour failure.

## THE FIX LIST

### 1. DIMENSIONS. Build to these, and check them.

The height field is in **metres**, so this is checkable rather than a matter of
taste. A form whose measurements are wrong reads wrong however well it is lit,
and it is the fastest way to make an object stop being recognisable.

| thing | real dimension |
|---|---|
| stair riser / going | 0.17–0.19 m / 0.25–0.30 m — so the rake is ~33°, and it is CONSTANT |
| tread nosing projection | 0.025 m, with a shadow line under it |
| handrail above the pitch line | 0.90–1.00 m, parallel to the rake |
| baluster gap | ≤ 0.10 m; newel 0.10–0.15 m square |
| balustrade / landing rail height | 0.90–1.10 m |
| door | 2.00 m × 0.80 m domestic; a hall's principal door 2.4–3.0 m |
| window sill / head | 0.85 m / 2.10 m |
| brick course | 0.075 m (a 65 mm brick + a 10 mm joint) — 13 courses per metre |
| ashlar block | 0.30–0.60 m high, laid in courses, joints aligned vertically only at the perpends |
| flagstone | 0.45–0.90 m across |
| skirting / dado rail / picture rail | 0.15–0.25 m / 0.85–1.00 m / 1.80–2.00 m |
| cornice projection | 0.15–0.30 m |
| chair seat / back | 0.45 m / 0.85–1.00 m overall |
| table | 0.73–0.76 m |
| bookshelf pitch / board thickness | 0.30–0.35 m / 0.025 m |
| headstone | 0.60–0.90 m above ground, 0.45–0.60 m wide, 0.075–0.10 m thick |
| spearhead railing | 1.20–1.80 m, palings at a 0.10–0.15 m pitch |
| maze hedge | 1.50–2.00 m |
| loculus opening | 0.60 m wide × 0.40 m high |
| candle sconce | 1.60–1.80 m above the floor |
| classical column | diameter = height / 8 to height / 10 |
| ceiling | 2.4–3.0 m domestic, 4–6 m for a hall |

**Audit what is already built against this table before adding anything.** If
the Crypt's loculi are 1.35 m recesses, they are not loculi. If a headstone is
1.6 m tall it is a monument. If a brick course is 0.15 m the wall is at half
scale and every other object in the room is now lying about its size too.

### 2. STRAIGHT LINES, AND REGULAR SPACING

A drawn line that should be straight must be straight for its whole length, and
a rhythm that should be regular must be regular. Specific places this fails
today:

- **the Graveyard's roof** is two smoothstep humps: it needs a ridge, straight
  eaves, a constant pitch and a hard verge against the sky;
- **the Hedge Maze's hedges** are ridged noise and read as mossy sarcophagi —
  a hedge is a mass with a scalloped top and a flat-ish face, and it is 1.8 m;
- **the Greenhouse's planting** reads as cauliflower: no leaf, no stem, no rim;
- **the Study's shelving** is a mat of horizontal bars — shelves have board
  thickness, uprights, and things standing on them at different heights;
- **the fence's palings** are solid black cones. A spearhead paling is a bar
  with a cast head, seen against the sky.

**But do not make everything rigid.** This is a *decayed* house: a leaning
headstone, a sagging gutter, a cracked arch and a missing paling are all correct
and all still DRAWN — a deliberate, constructed irregularity, not noise. The
test is whether a viewer can tell the difference between a thing that is bent
and a thing that is badly drawn.

### 3. ONE PITCH IS A STAMPED TILE

Both judges, on the Crypt's loculi and the Graveyard's palings. A run of
identical bays at an even pitch reads as wallpaper however well each bay is
drawn. Break it with things that belong: a name plaque, a broken grille, a
cracked arch head, an empty niche with its slab leaning against it; a gate, a
leaning section, a missing spike, ivy over two bays.

### 4. AN INK CONTOUR ROUND EVERY FORM

Both judges raised this on every screen, and one called it *"the single cheapest
thing that would move these from render to painting"*. We ink the HOLLOWS of
relief steps (`mmDrawn`) and nothing else, so a form standing in FRONT of
another form has no line between them. Prop silhouettes, arch mouldings, the
stair, railings, headstones, and the junction where a floor meets a wall.

Mind the ink HIERARCHY: `mmDrawn` saturates at 0.26 of height per pixel, so a
fine repeating joint authored at 0.34 gets exactly the same full ink as a
doorway edge. Repeating joints belong at 0.10–0.21, big forms at 0.5–0.9.
Setting them equal is what made one round-8 capture read as scaffolding.

### 5. THE PROPS ARE PALE GREY SLABS

Both judges, on the Foyer's chest, armchair and wardrobe: blank faces, no
contour, no contents, *"a soft blob on top"*. Three findings from round 8 to
start from, all already paid for:

- **You cannot light a prop that is at its ceiling.** A near prop's output is
  mostly the additive rim and ambient terms plus a luminance knee, and it
  already sits at `propCeil` — so drawn marks on props must be DARK. A
  highlight added as a highlight executes in the right shape and changes
  nothing on screen.
- **A prop is GREY BY CONSTRUCTION.** It takes the key and the fill at the same
  `CINE_PROP = 0.26`, and in most palettes those are equal-and-opposite hues
  (the Foyer's warm `#e2b271` key against its cold `#79afce` fill). Lighting a
  near form 50/50 from two opposite colours cannot be fixed by a chroma cap,
  which changes saturation and not hue. `lights.js` has `kind` on the light
  object but does not publish it in the packed payload; publish it and let a
  prop take the fill at about a third of the key.
- **At ~30 px the recognisable CUE beats the parts** — a fuller headstone read
  as "a block with a hat" and was reverted. But the Foyer's cabinet and clock
  occupy ~180 px, so parts DO read there. Check the size a prop actually
  renders at before deciding how much to draw.

### 6. THE SIDE WALLS ARE STILL EMPTY

Round 8's winner says so itself: *"the Foyer's SIDE walls carry the PANEL mode
and nothing else — bare wainscot, chair rail and a hung portrait. `subjectH`
gates the staircase on `uFar` (a room has one staircase), and I did not write a
side-wall subject."* Judge 2 names where to get it: SOOT's double-moulded panel
courses, its dado of small raised panels and its bracketed cornice, run down the
sides in perspective. `ui/r8-background-a` is still there.

### 7. THE ROOM MUST SIT BEHIND THE BOARD ON `combat`

Both judges. The balustrade and stair diagonals run straight across the enemy
row, so hairlines cross behind DOOR GREETER, DUST BUNNY and CALLING BELL. Drop
the stair two stops in value behind the nameplate band, or move the flights
outward. **A room that wins `room-foyer` and loses `combat` has not won.**

### 8. LIGHT AND VALUE, as craft rather than as colour-matching

`tools/valuemetrics.py` measures where the light IS. Measured on the merged
build, five horizontal bands top to bottom, with median and lit-area beside:

| | median L | lit area | focus | band0 | band1 | band2 | band3 | band4 |
|---|---|---|---|---|---|---|---|---|
| `mainMenu.png` | 21.1 | 24.7 | 0.223 | 14.9 | 28.7 | 29.8 | 29.6 | **39.6** |
| `selectKid.png` | 11.5 | 12.5 | 0.282 | 25.5 | 22.1 | 20.3 | 20.4 | 18.6 |
| `room-foyer` | 9.2 | 12.3 | 0.411 | 7.2 | 13.7 | **39.8** | 19.9 | 21.0 |
| `room-crypt` | 7.2 | 10.8 | 0.324 | 8.2 | 19.9 | 17.9 | 14.5 | 9.6 |
| `room-graveyard` | 6.4 | 11.5 | 0.404 | 7.0 | 22.9 | 26.2 | 10.8 | 18.8 |

Read this as craft, not as a target to match: **a floor is nearer the light,
flatter, and catches more of it than a wall does** — that is why every one of
his pictures is brightest at the bottom and ours are brightest across the middle.
Our rooms are also two to three times darker in the median, with half his lit
area and light MORE concentrated than his, which means a few small pools carry
everything and the rest of the room is unlit rather than dim. **A room nobody
can see the objects in fails item 1.**

### 9. SMALLER, NAMED, EACH ON A CAPTURE

- `room-graveyard`: an empty black band the full width of the frame between the
  railing and the front row of graves.
- `room-crypt`: the far wall is the darkest band of its frame and none of its
  ashlar or loculi reads; the vault over the upper third wants transverse ribs.
- `room-foyer`: the arched window above the landing has tracery but no glass and
  no light — glaze it and put cold moonlight through it onto the landing. The
  floor is a large empty plank field through the middle third.
- `rest`: carry the fan damask down from the picture rail to the dado for the
  full width at reduced contrast instead of stopping in a band at the top.
- **FOLIAGE is still the weakest of the six wall modes** and round 8's winner
  calls the Hedge Maze *"the one room of seventeen I would not defend"*. Its
  recorded failure modes: even discs on a lattice read as chain mail, and a
  hollow all the way round every clump reads as a dry stone wall. What worked
  was an anisotropic asymmetric clump with the hollow BELOW a leaf mass and a
  hard scalloped silhouette against the sky. Check anything you add to a foliage
  mass against masonry first.
- **The motes**: an even scatter of bright points over the whole frame, dimmed
  by a third last round and still there. No sample contains a single one, and
  they are the brightest thing in several frames. Consider removing them.

### 10. NOT YOURS: the region palettes are now SETTLED, not deferred

Josh has ruled: a region's colour needs to suit its setting and is not held to
`UI/*.png`. **Do not desaturate or hue-shift a region**, and do not raise it in
`notes_for_merger` as a defect. If a colour actively stops an object being
readable — an acid floor washing out the thing standing on it — that is an item
1 problem and you fix the readability, not the hue.

## THE INSTRUMENTS, and what each one lies about

`python tools/bgmetrics.py --samples --patches --octaves` and
`python tools/valuemetrics.py --samples` print the targets. Every caveat below
was paid for in round 8.

- **`inkDepth` is a MEDIAN over the top 3% of gradients.** Adding forty
  mid-strength drawn lines to a bare wall can move it DOWN. Read `inkShare` and
  `tooth` beside it.
- **On a very dark wall the ink axis is blind.** `_edge_profile` takes the 97th
  percentile of gradient INSIDE the crop, so in the Crypt the "strong edges" it
  samples are the sconce and the shaft in both captures and the masonry never
  enters the sample. A number that does not move is not proof nothing changed.
- **`tooth` is measured on FLAT TILES only**, so replacing bare wall with dense
  relief leaves fewer flat tiles and can read lower while looking better.
- **`midHue` and `midSat` are NOT targets this round.** They were the axis of
  the palette question and Josh has closed it.
- **A pure-black pixel carries nothing** and divides the other axes away.
  `void%` / `voidT%` / `skyLvl` are the columns.
- **Check which population you measured.** Twice in one day a confident
  measurement came from the wrong pixels: a "34% cloud variation" in
  `mainMenu.png` that was the tower spires inside the crop, and a CSS-room
  defect that vanished once `kit.css` showed those two assets are masked to the
  candle pools. Crop deliberately and say what is in the crop.
- **A sweep of all seventeen rooms is worth running and not worth obeying.** Its
  job is to name the room to go and LOOK at.
- **The standing rule: measure to FIND the defect, LOOK to set the amount.**
  Every amount shipped in rounds 7 and 8 that was set by a metric alone was
  wrong. This round, LOOKING matters more than ever, because "does this read as
  a staircase" has no metric at all.

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

**Through `on_port.py`, always** — `gpuprof.py` hard-codes `localhost:8777`,
which is the main checkout's server, so run from your worktree it profiles `dev`
and not your branch.

Current, measured with nothing else on the GPU: **13.14 / 13.35 / 13.52 ms**,
`ALL_BACKDROP` 8.81–8.83. **Stay at or under 15.5 ms and report three runs.**
Take the reading in a quiet window: three builders share this machine and a
capture sweep running beside the profiler moved the same build from 13.5 to
16.8 ms. `ALL_BACKDROP` is the more comparable number.

## THE TRAPS

- **A BACKTICK IN A GLSL COMMENT TAKES THE WHOLE GAME DOWN**, with a page error
  naming a GLSL local, a black frame, `state: no MM` and a 0-byte
  `.console.txt`. This codebase quotes identifiers in backticks everywhere else,
  so it is very easy to do. **Run `python tests/shader-literals/check.py` after
  every shader edit**, not at the end. It also catches `${...}` splices the file
  does not import, and an unterminated `/* */` — the one fault in this family
  that does NOT break the page: the module parses, the page renders, the room
  draws with the last program that linked, and the capture looks plausible.
- **`max()` on an ACCUMULATED SDF** subtracts from everything already in it.
  Shape the primitive, then `min()` it in.
- **A drawn line's width is in PIXELS.** Use screen-space derivatives of the
  height field, and note that joint width must be PER AXIS: `max()` of the two
  makes every bed joint on a side wall hit its clamp and draws long black bars
  down the wall, which the far wall hides completely.
- **Line endings.** The edit tools normalise a MIXED file on write. Run
  `python tools/endings_guard.py --base <base>` before committing, in your
  worktree and never in the main checkout.
- **Anything run from a worktree drives `dev`.** All 102 test scripts hard-code
  `:8777`, and so does `gpuprof.py`.
- **Pin the phase for a reproducible capture.** `showcase.steady()` stops the
  clock wherever it happens to be; `ctx.clock.t = 120` before and after the
  scale goes to zero gives two byte-identical captures, props and particles
  included, so a single small prop CAN be A/B'd.

## WHAT IS NOT YOURS THIS ROUND

The enemy and Companion sprites, the HUD, the card kit, the plates, the type,
the dialog controls, gameplay, and the region palettes (item 10).

## DELIVERABLES

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- `tools/gpuprof.py` three times **via `on_port.py` on your own port**, in a
  quiet window, the three numbers in `notes_for_merger`;
- `python tests/shader-literals/check.py` green;
- **a DIMENSION AUDIT in `notes_for_merger`:** for every object you built or
  corrected, the metre figure you used and the item-1 table's figure beside it;
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  one also taken with `--w 1280 --h 800` and saved as `<name>-1280.png`.

```
cd "WT" && python tools/shot.py CODE-combat        --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-combat-boss   --port PORT --scene combat --encounter foyer-boss --seed 7 --companion bones --kid maya --wait 8
cd "WT" && python tools/shot.py CODE-rest          --port PORT --scene rest    --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-room-foyer     --port PORT --hash "region=foyer&tier=high&actor=0"     --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-crypt     --port PORT --hash "region=crypt&tier=high&actor=0"     --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-graveyard --port PORT --hash "region=graveyard&tier=high&actor=0" --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
```

`tools/shot.py` writes into `WT/shots/`; copy each PNG to `JUDGING/CODE/<name>.png`
with the `CODE-` prefix removed.

Before you finish, sweep all seventeen rooms with the backdrop-room script and
**open every one at 1:1 and look at it** — that is the only instrument that
measures this round's actual subject. Photograph two screens outside your six, a
board and a dialog, and look at those too. Stop your dev server when you are
done.
