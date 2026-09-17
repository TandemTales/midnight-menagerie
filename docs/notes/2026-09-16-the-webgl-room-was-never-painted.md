# The WebGL room was never painted

2026-09-16. Josh: *"continue looping to perfect the backgrounds and be sure that
all of the other 'parts' to the background (pillars, etc) are being revised too.
it must look as good as the UI image examples in the UI folder and match them
perfectly."*

Seven UI rounds had stalled on one sentence, worded almost identically by every
blind judge: **the room behind the board is a render, not a painting.** Two of its
causes were found earlier the same day by measuring rather than by taste — the
black floor (`57da26a`) and the tooth (`cc59d6e`, `16e608d`) — and the handoff
recorded the procedural half as DONE.

It was not. Both of those fixes were made in `tools/prep_ui_paint.py`, which
paints the **CSS** room: `room.webp` and the plates that stand on it. That room
is what shows behind the six boards and round the dialogs, and it is now
thoroughly painted — a flocked damask hung in wandering strips, soot over the
chair rail, hand-drawn rails, a wobbling flagstone floor.

**Combat does not use it.** The room behind a fight is the WebGL stage —
`game/src/fx/backdrop.js` and `game/src/fx/shaders/backdrop.js`, seventeen
authored regions, six architecture modes, nine floor treatments — and none of
the ground pass reached it. It is also the one screen where a large area of
*room* is visible: the six boards cover theirs almost completely, and the map is
a blueprint sheet over it.

## What the measurement said

`tools/bgmetrics.py` is new and kept. It scores a capture against `UI/*.png` on
the axes that separate a render from a painting, every image scaled to a common
height first because tooth and edge width are both measured in pixels.

The Foyer, per surface, against the samples' own room patches:

| | wall | floor | a prop | kid-floor | kid-wall | menu-court | mainMenu |
|---|---|---|---|---|---|---|---|
| tooth | 0.038 | 0.079 | 0.162 | 0.536 | 0.911 | 0.409 | 0.226 |
| tooth, 0.8 px octave | **0.022** | 0.049 | 0.069 | 0.282 | 0.477 | 0.214 | 0.124 |
| ink depth | 0.108 | 0.014 | **0.000** | 0.081 | 0.042 | 0.393 | 0.248 |
| ink share | 0.585 | 0.352 | 0.152 | 0.553 | 0.437 | 0.736 | 0.674 |
| edge width, px | 2.36 | 2.20 | 2.47 | 2.21 | 2.27 | 2.59 | 2.52 |
| mid hue | 11° | **233°** | 25° | 25° | 22° | 25° | 22° |

Three findings, and the third is the one worth carrying:

1. **No tooth.** An order of magnitude short at every octave, and worst at the
   fine end. Same defect the CSS room had, in a different file.
2. **No ink.** Not one prop edge in the house carried a line darker than both
   sides. The samples outline *everything*: 44–74% of their strong edges do.
3. **Josh's tooth is white noise, not 1/f.** Read through the same cumulative
   high-pass, the samples run 0.41 0.67 0.83 0.94 1.00 across the 0.8–12 px
   octaves — almost exactly flat weights (0.50 0.67 0.81 0.92 1.00), and nothing
   like the 1/f^1.1 the painted room's ground uses, which gives 0.06 0.14 0.30
   0.60 1.00 and leaves the fine end empty. The first attempt here copied the
   painted room's spectrum and moved the needle 0.038 → 0.038.

## What changed

**The canvas is in the grade** (`shaders/grade.js`). Six octaves of value noise
on cells of 1 to 21 *pixels*, flat weights, normalised to unit standard
deviation, applied multiplicatively in display space after the tone map — so it
scales what is there and can never lift pure black off zero, which is what the
black-floor pass bought and this must not spend. It belongs in screen space
because paint texture lives on the picture plane: a tooth authored in world
metres is 4 px on a prop and a fifth of a pixel on the wall behind it, which is
exactly the spectrum the measurement found.

**The drawn line is in the surfaces** (`mmDrawn`), because it has to know where
the relief steps. Width in PIXELS is the whole point: a 4 cm chair rail across a
19 m room is a fifth of a pixel of relief, so lighting alone can only ever draw
it as a hairline, and a painter gives it the same two-pixel line wherever it is.
The screen-space derivative of the height field is metres of relief per pixel, so
a threshold on it is a line of constant width at any depth — and it is free,
because the shader already takes those derivatives for its normal.

Then, part by part, in the order a judge's eye lands on them:

- **The floor** was a smooth haze with one horizontal line in it. Five of nine
  patterns drew joints and nothing else, so every board and pane was the same
  value as its neighbour; the joints were authored in metres and fell below a
  pixel at the back of the room; the grain did too. Now: a cell identity per
  stone, board and pane, in value *and* hue; joints at a bounded width in
  pixels; a screen-space grain; boards of unequal width laid with a wandering
  joint; flags at 0.95 × 0.70 m on a warped grid instead of 1.45 × 1.00 on a
  straight one. And the wet-floor smear — a vertical mirror of every lamp at
  `uGloss * 3.4`, the loudest thing on a Foyer floor and nothing any sample does
  — is down to a quarter, behind `uWet`.
- **The wall** got relief occlusion. Its panels were hairline rectangles because
  the flat floor of a 42 cm recess has the same normal as the wall face it is cut
  into, so lighting gave them exactly the same value and only the one-pixel walls
  of the recess differed. One term, and every panel, rail, cornice and picture
  frame in six modes gets its value. The framed portraits repeated at 6.2 m
  against the panels' 2.6, so a frame landed on a stile as often as on a field:
  they hang in a panel now.
- **The wall got its ornament.** The samples' interiors are near-black with
  purple *scrollwork* over them; ours was near-black with one octave of fbm. A
  damask, drawn with a pen — a fleur on a brick offset inside a continuous ogee
  lattice. Two rules, both learned by drawing it wrong first: every element is a
  STROKE, and the lattice must be a continuous function of position, or it tears
  at the cell edge.
- **The doorway** was a flat slab of saturated cyan: `uOpenGlow` painted over the
  whole opening at `uGain * 1.15`. A doorway is a hole — darkness, a strip of lit
  floor a few metres beyond it, the jamb's own shadow, and a little of that light
  on the arch moulding outside.
- **The pillars.** Shape 6 was three boxes and a sine on the shaft's width, which
  reads as a capital-T on a kerb — and in the Foyer and the Ballroom it is what
  the eye lands on. It has a profile now: plinth, torus, apophyge, a shaft with
  entasis, an astragal at the neck, an echinus flaring into a square abacus. Plus
  twenty flutes, drawn on the shaft at a width in pixels.
- **The props' edges are in pixels.** The silhouette's antialias was 0.014 of
  local uv, so a prop 40 px wide got half a pixel of edge and one 400 px wide got
  five — hence the stair-stepped capitals in every capture of this pass. The rim
  was in the same units for the same reason, and the joints were 0.06 of a cycle,
  so at the back of the room they vanished and the far props read as smooth
  slabs. All three are pixels now, and there is an outline under the rim.
- **A chroma ceiling on the props**, the twin of the luminance ceiling round 3
  added for the same kind of reason. A prop takes the region's accent as its
  albedo and the region's key as its light, so the Ballroom's plum settles under
  a gold lamp at exposure 3.55 arrive as a colonnade of hot pink blobs and the
  Foyer's warm brown cabinets under a `#79afce` fill arrive as blue tin. The
  samples' own props measure 0.19–0.43 mean saturation; ours measured 0.75.
- **Every practical light stopped being a white blob.** Not the halo curve — the
  SIZE. The billboard is sized `(0.16 + 0.030*radius) * glowSize` metres, so a
  Foyer lamp of radius 6.9 was drawing a **73-centimetre flame**, and at 16 m
  that is the 25 px white disc in every capture. A flame and its glow are not the
  same size and they were sharing one number. The quad stays as big as it was —
  that is the halo, and what the bloom pass legitimately feeds on — and the flame
  is nine centimetres of world space wherever it is.
- **The shafts** were three even cones with one fbm across them. A shaft arrives
  striped by whatever it came past, and its edge is eaten where the dust is thin.
- **The contact shadows** were `1 - smoothstep(0.15, 1.0, r)`: a perfect radial
  ellipse with one even falloff doing both the core and the penumbra. They have
  both now, and an edge broken per prop.
- **Open air.** Five regions are open to the sky, and that branch drew a smooth
  gradient, one hard-edged black hill where the mansion should be, a treeline
  that did not survive its own noise, and a moon that clipped to a white hole
  with a halo a third of the frame wide. `mainMenu.png` is unambiguous: cloud
  banks and stars, a silhouette of towers and spires with lit windows, and a
  treeline of individual firs. The skyline is drawn as towers with caps and
  finials now, the treeline as firs with trunks and pointed crowns, the sky has
  cloud banks, and the moon has a limb and a halo three times its own width.
- **The stars were EIGHT-PIXEL GREY SQUARES**, and had been since the mode was
  written: a cell hash through a smoothstep fills its whole cell. Each cell
  places one round point somewhere inside itself now, at its own size, and the
  brightest get the small cross a lens leaves.
- **The sky plane was 17 m** and stopped 78 px short of the top of the
  Graveyard's frame, with the renderer's clear colour showing above it as a
  violet band *brighter than the sky beneath it*. It is 30 m now, and the sky's
  gradient and the moon's height are anchored in metres rather than in fractions
  of the plane, so a taller plane cannot change the look.
- **The ceiling is the darkest part of the frame in all four samples.** The far
  end of ours reached 0.85 of its own gain and in the Kitchens and the Secret
  Passages that made the ceiling the brightest band on screen, which pulls the
  eye straight up and off the board.
- **A wisp is not a flame.** The kind travels with each light instance, and the
  cold ones -- will-o'-the-wisps, moon spill -- were being drawn with a candle's
  teardrop and a white-hot tip. They are round, even cores in their own colour
  now; one program still draws both.
- **The planting.** The Greenhouse's thirty plants were a pot plus seven discs
  blended at 0.13, which fuses into one lobed ball, and the shrub was five
  circles at 0.16. Fronds and tighter blends now -- and the first attempt at
  that made them thin, which emptied the room, so the strokes are broad and the
  fronds long enough to fill the quad they are sized into. Two passes, both
  settled by looking.

## What it measures now

The combat screen's room band (y 40..430 of a 1600x900 capture, which is the
part of the frame that is room rather than board), before and after, against
`mainMenu.png`:

| | before | after | mainMenu |
|---|---|---|---|
| tooth | 0.076 | **0.145** | 0.226 |
| tooth, 0.8 px octave | 0.050 | **0.081** | 0.124 |
| min channel, darkest tenth | 5.49 | **3.32** | 2.32 |
| edge width, px | 2.54 | 2.55 | 2.52 |
| tile spread | 0.636 | **0.784** | 0.540 |

Tooth lands at 64% of his and the fine octave at 65% -- almost exactly where the
CSS ground settled (0.139 against 0.185, or 75%), and for the same reason: the
last quarter is drawn subject matter, not noise. Per surface in the showcase, the
Foyer's floor went 0.079 -> 0.270 and the Ballroom's 0.334, both with ink shares
of 0.59-0.82 where they had 0.35.

`ink` is not readable on a full screen, by the way: the crop is full of DOM
plates whose edges are hard CSS steps, and they dilute the share. Measure ink on
a showcase capture (`tools/shot-scripts/backdrop-room.js`) or on a surface crop.

## What it costs

`tools/gpuprof.py --scene combat`, tier medium, Intel UHD at 1600x900: frame
15.1 ms (58 fps observed), backdrop 8.84 ms of it -- wall 2.31, floor 2.04,
ceiling 1.56, props 1.00, sides 0.91, near frame 0.63, shafts 0.37, flames 0.05
-- and the grade 4.4 ms (T_full 15.13 against T_noGrade 10.74).

**And the A/B said the reasoning was wrong.** Against the commit before this
one, same machine, same scene, three runs each:

| | before | first version | shipped |
|---|---|---|---|
| frame | 11.23 ms | 14.98 ms | **13.79 ms** |
| the grade | 2.33 | 4.47 | 3.39 |
| the backdrop | 7.22 | 8.85 | 8.77 |
| observed fps | 58 | 58 | 58 |

The round-2 perf note says the post chain is bandwidth-bound, and it is -- for
the taps it was measured with. **Six fresh octaves of value noise is twenty-four
hash calls on 921,600 pixels, and it cost 2.14 ms of an 11.2 ms frame.** Two
cuts, neither of which changes the spectrum:

- **the finest octave is white noise, so it is not interpolated at all** -- one
  hash instead of four. Three taps at 1.0 / 3.2 / 11.0 px weighted
  0.85 / 1.00 / 1.15 measure 0.522 0.680 0.801 0.914 1.00 through the same
  high-pass against the six-tap field's 0.496 0.674 0.806 0.919 1.00. Same
  paper, nine hashes instead of twenty-four;
- **the wear field was an fbm3** -- twelve more hashes for a field whose
  features are 180 px across. One tap.

Plus `MM_TOOTH`, off at tier `low`, so the weakest GPU the game supports pays
nothing; and the ceiling no longer computes a floor's grit or ink, because it is
the darkest part of the frame by design now.

What is left is **+2.56 ms, a 23% GPU cost for a 0% frame-rate cost** on this
laptop: 58 fps before and after, because the observed rate is not GPU-bound
here. That is the honest shape of it -- headroom spent, not frames.

## What a prop pass needs that this instrument cannot give

After the above shipped, the next increment was the rest of the prop
vocabulary: five of the twenty silhouettes had been done (plant, shrub, column,
statue, cabinet) and, counted by prop instance across the seventeen palettes,
the unimproved ones still carry a lot -- headstone 44, chair 35, drape 33,
crates 30, candelabra 25.

**Written blind, that batch regressed and was reverted.** A fuller headstone --
plinth, tapered die, shoulder moulding, three heads -- came back SHORTER and
read as a block with a hat, and one of its variants rendered as a pyramid; the
chair came out a spindle. At the thirty pixels a prop occupies, the
recognisable CUE beats the parts, and two of the clips were the classic SDF
error: a `max()` applied to the ACCUMULATED distance rather than to the
primitive it was shaping, which subtracts from everything already in it.

What survived, because each was verified at the size it renders:
- the headstone LEANS (one hash, does not touch the silhouette's shape, and is
  most of why a churchyard reads as one rather than a row);
- the bookcase's spines are drawn at all. The shipped version tested
  `gap = 1.0 - smoothstep(...)`, which is 1 at a spine's CENTRE and 0 at its
  edge, so `1.0 - gap` drew a hairline down each joint and nothing else. Found
  by looking at the Foyer's props at 2x, not by reading the code; proved by
  flooding the term red and counting pixels (62-69k, round the perimeter where
  the five cabinets stand) before touching a number.

**And the instrument was broken, but not for the reason I first wrote down.**
Two mounts of one region differed over **17% of their pixels**, and the first
diagnosis here blamed the prop layout reshuffling and the particle field
spawning from an unrewindable stream. Both were wrong. `build()` is
deterministic per region already, and particle positions are a pure function of
time.

It was the **PHASE**. `clock.t` accumulates scaled dt, and setting `clock.scale`
to 0 stops it at whatever value the page happened to reach while booting --
while everything time-driven in the room reads it: props SWAY on
`sin(uTime*0.55 + seed)`, stars twinkle on `sin(uTime*1.7 + seed)`, clouds
drift on `uTime*0.004`, flames flicker. Pinning `clock.t` to a constant before
the capture makes two captures of one region **byte-identical -- 0 pixels
differing, motes and props and all**. One line in
`tools/shot-scripts/backdrop-room.js`.

So a prop CAN be A/B'd, and the prop pass that was deferred for want of an
instrument is unblocked. The lesson is the old one from
[[diagnose-with-a-discriminator]] and I re-learned it the slow way: I had two
candidate causes (layout, particles), measured a discriminator that separated
them from each other (props hidden: 13.4 of 17 points remained), and concluded
"mostly particles" -- without ever testing the cause that was neither.

## The trap, for the fifth and sixth time

The handoff's own warning is the thing to carry: **measure to find the defect,
LOOK to set the amount.** Twice more today the metric pointed past the right
answer:

- the canvas tooth reaches `mainMenu.png`'s measured 0.226 at a one-sigma
  modulation of 0.22, and at 0.22 it reads as film grain on dirty glass. At 0.10
  it reads as plaster. **0.10 is what shipped** — and the rest of the samples'
  number is not noise at all, it is drawn detail, stone by stone and moulding by
  moulding, bought in the surface shaders.
- the shaft stripes at 0.030 of the beam's width and full strength measured
  better and read as three parallel searchlight lines drawn across the room.

And one new trap of its own kind: **a single number for the whole house is not a
rule.** The prop chroma ceiling was set at 0.14 by eye on the Ballroom's
statuary, and the seventeen-region sweep immediately showed the Greenhouse's
planting going grey — a bank of grey blobs reads as boulders. `PROP_MATERIAL`
carries a per-material `sat` now: 0.11 for stone, 0.34 for foliage. This is the
same shape of mistake as `DIP_THRESHOLD` tuned in the gap Marmalade's twelve
clips left.

## A gate for the afternoon's other cost

Four of the debugging cycles in this session were one bug: **a backtick inside a
GLSL template literal ends it**, and what you get is a page error naming a GLSL
local (`Unexpected identifier 'cellv'`), a black frame, `state: no MM`, and a
0-byte `.console.txt`. It is easy to do, because this codebase's comment style
quotes identifiers in backticks everywhere else — every commit message this note
draws on does it. `tests/shader-literals/check.py` is new: it finds any glsl
literal that ends mid-shader and any stray `${`, in 40 ms, and it fails both ways
round.
