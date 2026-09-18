# Round 9 — THE THINGS IN THE ROOMS. Highest priority, and nothing else comes first.

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, and `BRIEF-r8.md`
for the two rooms, the instruments and the traps, which are all still current.
**Where any earlier brief disagrees with this one, this one wins.**

## WHAT JOSH ASKED FOR, and he set the priority himself

2026-09-17:

> *"colors are fine but im very concerned that nothing in the greenhouse looks
> like plants, and the ballroom seems to be occupied by statues or oversized
> oscar awards or something. this needs to be fixed at the **highest priority**.
> dont stop until each room makes sense with what it has inside and those things
> look as well painted/detailed as the characters and mansion in the UI example
> images and are up to the standards of a modern steam game."*

And from the same day, still in force:

> *"dont limit yourself to the colors of the UI image examples for the
> background so closely ... it is way more important that it just look
> appropriate for the setting and as accurately presented with readable objects
> that make sense and are drawn with care and attention (straight lines,
> appropriate scale, etc)"*

So: **colour is settled and is not this round's work.** The Greenhouse stays
green, the Ballroom plum. `midHue` and `midSat` are not targets. What this round
is judged on, in order:

1. **Does the room make sense with what it has INSIDE it?** The right objects
   for that room, in the right quantity.
2. **Is each object recognisable as itself**, drawn and detailed to the standard
   of the mansion and the characters in `UI/*.png` — a modern Steam game's bar.
3. **Is it accurately built and sized?** Real proportions, straight lines where
   the thing is straight, regular rhythms where it is regular.

## THE CAUSE, and it is one thing

**A prop has no interior. It is a flat quad with a coverage mask on it.**

`shapeField(uv, shape, seed)` returns a 2D signed distance to the silhouette —
that is all it returns. The fragment shader then builds its normal from the
*coverage gradient*:

```glsl
vec2  g  = gr / glen;                       // points inward
float edge = 1.0 - smoothstep(0.0, 0.085, f);
vec3  N  = normalize(vec3(-g * edge * 1.75, 0.62 + 0.38*(1.0 - edge)));
N = normalize(N + vec3(fbm..., fbm..., 0.0));   // generic break-up
```

That is a **rounded slab**: it turns away at the outline and faces the camera in
the middle, with one fbm wobble on top and four bands of material noise (grain,
blotch, joints, speckle) that know nothing about the object's form.

**A smooth, featureless, correctly-shaped standing figure with a uniform
metallic surface is an award statuette.** That is not a coincidence or a taste
problem — it is the only thing this shader can currently draw. The same cause
makes thirty separate plant fronds shade as one lobed blob, and the cabinet a
grey slab.

Round 8 solved exactly this problem for the WALL. Subjects stopped being drawn
in *colour* and were drawn into **relief**, so they arrived with recess
occlusion, ink in their hollows, a lip on their crests and the room's own
candlelight for free. **Props never got that.** They are the last surface in the
house still lit as a silhouette.

**So fix 1 is: give a prop an interior relief field.** A companion to
`shapeField` — call it what you like — that returns height INSIDE the outline:
the channels of a drapery fold, the brow and nose of a face, the midrib of a
leaf, the panel recesses of a cabinet door, the flutes of a plinth. Build `N`
from coverage *and* relief, and let `mmDrawn` ink the interior lines the way it
inks the wall's. `vSize` is already in metres on the prop, so author the relief
in metres exactly as `wallH` does.

Two rules that survive from round 8 and will bite otherwise:

- **You cannot light a prop that is at its luminance ceiling.** A near prop's
  output is mostly the additive rim and ambient terms plus a knee at
  `propCeil` — a highlight added as a highlight executes in the right shape and
  changes nothing on screen. **Marks on a prop must be DARK.**
- **A prop is GREY BY CONSTRUCTION.** It takes the key and the fill at the same
  `CINE_PROP = 0.26`, and in most palettes those are equal-and-opposite hues
  (the Foyer's warm `#e2b271` key against its cold `#79afce` fill). No chroma
  cap fixes that, because a cap changes saturation and not hue. `lights.js` has
  `kind` on the light object but does not publish it in the packed payload;
  publish it and let a prop take the fill at about a third of the key.

## FIX 2 — THE TWO ROOMS JOSH NAMED. Do these before anything else.

### 2a. The Impossible Greenhouse: nothing in it looks like plants

The prop SET is right — `[tall potted plant, shrub/hedge, tall potted plant,
lamp post, column]`, thirty of them on a `terrace` layout. So this is purely a
drawing failure, and the code comments show round 8 attacked the silhouette
three times and stopped there. The silhouette is not the problem; the interior
is.

What a potted plant needs to read as one:

- **a pot that is a pot** — a rim that oversails, a belly, a foot, soil visible
  at the top, and a saucer under it. Terracotta has a thrown-rib surface.
- **leaves that turn individually.** One rounded-slab normal across a whole
  frond mass is the blob. Each leaf wants its own midrib as relief, so it
  catches the light on one side of the rib and loses it on the other, and a
  curl so not every leaf faces the camera.
- **occlusion between leaves.** A leaf crossing in front of another must be
  DARKER where it covers it — the same recess-occlusion insight the wall got.
- **a ragged edge at leaf scale**, not at mass scale. This is already noted in
  the code as what tells foliage from stone.
- **a few dead fronds**, hanging, browner. A greenhouse in this house is
  neglected.

The Hedge Maze has the same `foliage` material and the same failure — its hedges
read as mossy sarcophagi — and round 8's winner calls it *"the one room of
seventeen I would not defend"*. Its recorded failure modes: even discs on a
lattice read as chain mail, and a hollow all the way round every clump reads as
a dry stone wall. **Check anything you add to a foliage mass against masonry
first.**

### 2b. The Ballroom: it is occupied by oversized Oscar awards

This one is a **CONTENT** failure as well as a drawing one, and the content half
is the faster fix.

Its prop set is `[statue on a plinth, chandelier, drape on a rail, column,
armchair/settle]`, **thirty props on a `colonnade` layout**, and the statue is
tall and narrow (`SHAPE_H` 1.10, `SHAPE_W` 0.60). A colonnade of thirty tall
narrow figures on plinths is, quite literally, a row of award statuettes — and
the room is called **"The Ballroom and Velvet Suites"**. Its own wall subject is
already `mirrors`.

A ballroom has: **pier mirrors and their frames, gilt chairs and settles round
the walls, chandeliers, candelabra, a piano, a curtained dais.** It does not
have a colonnade of statuary. Change what is in the room — and if any statue
stays, it needs carved detail under fix 1, not just a better outline.

**The statue shape is used by the Ballroom, the Graveyard, the Crypt and the
Heart**, so whatever you do to it pays four times. A figure needs, as relief:
brow, nose and chin; the channels of drapery falling vertically; a base with a
moulding; and the material said in its surface — marble with a vein and a
chipped edge reads as carved, a smooth gradient reads as plastic.

## FIX 3 — THE BAR: as detailed as the mansion and the characters

Open `UI/mainMenu.png` and `UI/selectKid.png` at 1:1 and look at what carries
detail at what size:

- the **two cat statues** flanking mainMenu's steps are perhaps 60 px tall and
  they have ears, a seated pose, a tail, a carved plinth with a moulding, and a
  dark line all the way round;
- its **windows** have tracery, glazing bars and a reveal — at 30 px;
- its **ivy** is individual leaves, not a green mass;
- its **railings** have spearheads, a top rail and a bottom rail;
- `selectKid`'s **skull and book stack** are separate objects with separate
  contours, and the books have visible boards and spines.

That is the standard. **Every one of those is achieved with interior drawn
detail plus a contour**, which is precisely what fix 1 makes possible.

Check the size a prop actually renders at before deciding how much to draw: at
~30 px the recognisable CUE beats the parts, and a fuller headstone that read as
"a block with a hat" was correctly reverted in round 8. But the Foyer's cabinet
and clock occupy ~180 px, and the Ballroom's statues more — parts DO read there,
and at that size a featureless form is the defect.

## FIX 4 — DOES EACH ROOM MAKE SENSE WITH WHAT IT HAS INSIDE?

Every region's prop set, audited. Ask of each: would a person walking into that
room find these things in it, in this quantity?

| region | material | layout | n | its prop set |
|---|---|---|---|---|
| foyer | wood | perimeter | 26 | clock, armchair, column, chandelier, cabinet, candelabra, drape |
| nursery | paint | clutter | 24 | cot, rocking horse, cabinet, plant, drape |
| sleeping | cloth | nook | 20 | four-poster, cabinet, drape, armchair, plant |
| kitchens | metal | aisle | 22 | range, crates, cabinet, candelabra, crates |
| **greenhouse** | foliage | terrace | 30 | **plant, shrub, plant, lamp post, column** |
| graveyard | stone | rows | 34 | headstone, headstone, sarcophagus, statue, headstone |
| study | wood | perimeter | 26 | cabinet, cabinet, clock, armchair, column, candelabra |
| attic | wood | hang | 26 | crates, drape, cabinet, cot, clock |
| lampworks | metal | colonnade | 28 | lamp post, crates, column, candelabra, cabinet |
| **ballroom** | cloth | colonnade | 30 | **statue, chandelier, drape, column, armchair** |
| crypt | stone | perimeter | 26 | sarcophagus, headstone, column, sarcophagus, statue |
| hedge | foliage | clutter | 32 | shrub, shrub, plant, **headstone**, shrub |
| passages | wood | aisle | 18 | crates, cabinet, drape, column |
| bathhouse | tile | nook | 22 | bath, column, drape, bath, plant |
| kennels | wood | rows | 28 | lamp post, crates, **armchair, cabinet**, shrub |
| pumpkin | foliage | clutter | 32 | shrub, plant, headstone, lamp post, shrub |
| heart | stone | colonnade | 24 | statue, column, chandelier, armchair, cabinet |
| title | stone | rows | 26 | shrub, headstone, plant, lamp post, shrub |

The bolded ones are the ones I would question. The Ballroom is the clear one.
An **armchair and a bookcase in the kennels** and a **headstone in a hedge
maze** are the others — defensible in a haunted house, but check them by eye.
**Twenty prop silhouettes cover seventeen rooms, so a missing object type is a
legitimate finding**: say so in `notes_for_merger` if a room needs a thing that
does not exist yet, and add it if it is the difference between the room making
sense and not.

## FIX 5 — the rest, still worth doing but AFTER fixes 1 to 4

- **An ink contour round every form.** Both judges raised it on every screen and
  one called it *"the single cheapest thing that would move these from render to
  painting"*. We ink the HOLLOWS of relief steps and nothing else, so a form in
  FRONT of another has no line between them. Hierarchy matters: `mmDrawn`
  saturates at 0.26 of height per pixel, so repeating joints belong at
  0.10–0.21 and big forms at 0.5–0.9.
- **The staircase is a wireframe on wallpaper** — treads and risers of one
  repeated size (riser 0.17–0.19 m, going 0.25–0.30 m, so the rake is constant),
  a stringer carrying them, balusters at a regular pitch with gaps under 0.10 m,
  a handrail 0.90–1.00 m above the pitch line.
- **One pitch is a stamped tile** — the Crypt's loculi and the Graveyard's
  palings are identical bays at an even pitch. Break them with a name plaque, a
  cracked arch head, a leaning slab; a gate, a missing spike, ivy over two bays.
- **The room must sit BEHIND the board on `combat`** — the balustrade's
  hairlines cross behind DOOR GREETER, DUST BUNNY and CALLING BELL.
- **A room nobody can see the objects in fails fix 1 by another route.** Our
  rooms run two to three times darker in the median than the samples, with half
  the lit area and light MORE concentrated, so a few small pools carry
  everything and the rest is unlit rather than dim.

### Dimensions, for fix 3's accuracy half

| thing | real dimension |
|---|---|
| stair riser / going | 0.17–0.19 m / 0.25–0.30 m, rake constant |
| handrail above the pitch line / baluster gap | 0.90–1.00 m / ≤ 0.10 m |
| door / window sill / head | 2.00 m / 0.85 m / 2.10 m |
| brick course / ashlar block | 0.075 m / 0.30–0.60 m |
| skirting / dado rail / picture rail | 0.15–0.25 / 0.85–1.00 / 1.80–2.00 m |
| chair seat / back | 0.45 m / 0.85–1.00 m overall |
| table / bookshelf pitch / board thickness | 0.75 m / 0.30–0.35 m / 0.025 m |
| headstone | 0.60–0.90 m tall, 0.45–0.60 wide, 0.075–0.10 thick |
| spearhead railing / paling pitch | 1.20–1.80 m / 0.10–0.15 m |
| maze hedge / loculus opening | 1.50–2.00 m / 0.60 × 0.40 m |
| terracotta pot | 0.25–0.40 m tall, rim oversailing by 0.02 m |
| a standing figure | 1.6–1.9 m, on a plinth 0.3–0.6 m |
| classical column | diameter = height / 8 to height / 10 |

## THE INSTRUMENTS, and what each lies about

`bgmetrics.py` and `valuemetrics.py` print the targets; `--samples` on either.
**But this round's headline has no metric at all.** "Does this read as a
potted plant" is answered by opening the capture at 1:1 and looking, and by
nothing else. Every caveat below was paid for in round 8:

- **`inkDepth` is a MEDIAN over the top 3% of gradients** and can fall while a
  wall improves. Read `inkShare` and `tooth` beside it.
- **On a very dark wall the ink axis is blind** — `_edge_profile`'s threshold is
  the 97th percentile INSIDE the crop, so the masonry never enters the sample.
- **`tooth` is measured on FLAT TILES only**, so dense new relief leaves fewer
  flat tiles and can read lower while looking better.
- **`midHue` / `midSat` are not targets.** Josh has closed that question.
- **Check which population you measured.** Twice in one day a confident number
  came from the wrong pixels.
- **A sweep of all seventeen rooms is worth running and not worth obeying.** Its
  job is to name the room to go and look at.
- **Measure to FIND the defect, LOOK to set the amount.** Every amount shipped
  in rounds 7 and 8 that was set by a metric alone was wrong.

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

**Through `on_port.py`, always** — `gpuprof.py` hard-codes `localhost:8777`, the
main checkout's server, so from your worktree it profiles `dev` and not you.

Current, with nothing else on the GPU: **13.14 / 13.35 / 13.52 ms**,
`ALL_BACKDROP` 8.81–8.83. **Stay at or under 15.5 ms and report three runs in a
quiet window** — a capture sweep beside the profiler moved the same build from
13.5 to 16.8. Props are currently 1.19–1.25 ms of the backdrop, so there is
room to spend there, and `shapeField` already has twenty branches: if the
program grows, note the shot-to-shot time, which is where round 8 saw it.

## THE TRAPS

- **A BACKTICK IN A GLSL COMMENT TAKES THE WHOLE GAME DOWN** — page error
  naming a GLSL local, black frame, `state: no MM`, 0-byte `.console.txt`. This
  codebase quotes identifiers in backticks everywhere else. **Run
  `python tests/shader-literals/check.py` after every shader edit**, not at the
  end. It also catches `${...}` splices the file does not import and an
  unterminated `/* */` — the one fault here that does NOT break the page: the
  module parses, the room draws with the last program that linked, and the
  capture looks plausible.
- **`max()` on an ACCUMULATED SDF** subtracts from everything already in it.
  Shape the primitive, then `min()` it in. This cost round 8 two prop shapes.
- **A drawn line's width is in PIXELS**, via screen-space derivatives, and joint
  width must be PER AXIS.
- **Line endings** — run `python tools/endings_guard.py --base <base>` before
  committing, in your worktree and never in the main checkout.
- **Pin the phase**: `ctx.clock.t = 120` before and after the clock scale goes
  to zero gives two byte-identical captures, props included, **so a single prop
  CAN be A/B'd now** — which is how this round should work.

## WHAT IS NOT YOURS THIS ROUND

The enemy and Companion sprites, the HUD, the card kit, the plates, the type,
the dialog controls, gameplay, and **the region palettes** — colour is settled.

## DELIVERABLES

- the endings guard printing `ENDINGS OK`;
- your commits on your branch;
- `tools/gpuprof.py` three times via `on_port.py`, quiet window, in
  `notes_for_merger`;
- `python tests/shader-literals/check.py` green;
- **2× CROPS OF EVERY PROP YOU TOUCHED, before and after**, at the size it
  actually renders, named in `notes_for_merger`. This round's subject is not
  measurable, so the evidence is the crop.
- the canonical screenshots in `JUDGING/CODE/`, under exactly these names, each
  also at `--w 1280 --h 800` as `<name>-1280.png`.

```
cd "WT" && python tools/shot.py CODE-combat        --port PORT --scene combat --encounter foyer-14   --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-rest          --port PORT --scene rest    --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-room-greenhouse --port PORT --hash "region=greenhouse&tier=high&actor=0" --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-ballroom   --port PORT --hash "region=ballroom&tier=high&actor=0"   --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-foyer      --port PORT --hash "region=foyer&tier=high&actor=0"      --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-graveyard  --port PORT --hash "region=graveyard&tier=high&actor=0"  --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
```

`tools/shot.py` writes into `WT/shots/`; copy each PNG to `JUDGING/CODE/<name>.png`
with the `CODE-` prefix removed.

Before you finish, sweep all seventeen rooms and **open every one at 1:1 and
look at every object in it** — that is the only instrument that measures this
round's subject. Photograph a board and a dialog too. Stop your dev server when
you are done.
