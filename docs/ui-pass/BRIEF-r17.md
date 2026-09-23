# Round 17 — the people in the house, and nothing repeated without variation

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r9.md` for
the standing priorities, `BRIEF-r10.md` for the instrument traps, and
`BRIEF-r11.md` for the machinery, the budget and the traps. **Your rubric is
`RUBRIC-r11.md` as amended by `RUBRIC-r17.md`.** The unit is a contact sheet
of three rooms of one wing, and a sheet must still win both questions —
different rooms, same wing.

## WHERE ROUND 16 LEFT IT

CINNABAR won (`84d61d1`), 2 of 2 judges, 6.70 against 4.70, four of five
screens: coffered ceilings with a moulded panel inside each coffer, leaves
with midribs and pinnate margins, a mansion with unequal bays and dark windows
among the lit, and **the black inset margins finally gone** (66px → 3px,
64px → 2px). Round 15's regression is fixed — the wall behind the pale Dust
Bunny is dark again and the board reads at 1280.

**It lost exactly one sheet, and to one object.**

Two standing rules, neither negotiable:

- **Light the OBJECT, never the room.** The darks are where this house keeps
  its colour; a candidate whose darkest corners go pale, milky or grey scores
  below a darker one, and the judges measure it.
- **Do not FLATTEN an object to fix something else.** Two of round 16's
  candidates smoothed away the ballroom's coffered ceiling while working
  elsewhere, and both judges marked it a loss against the baseline.

## THE FIX LIST, from both round-16 judges

### 1. THE SITTERS — both judges' first instruction, and the graft is on a branch

> "The five canvases have lost their sitters to a pale two-lobed lozenge
> floating on a dark mass — it reads as a light switch screwed to the canvas."
> · "A small pale vertical lozenge with no shoulders — at 1:1 it reads as a
> candlestick or a vase standing on the canvas, not a person."

**VERDACCIO built the only finished canvas interior in the round on
`ui/r16-rooms-c`** and won `sheet-foyer` 2 of 2 with it: a dark hair mass with
a centre parting, a pale face, a white collar, a shoulder line widening into a
bodice. Read it and bring it in. **But bring it in with the fault the same
judges named**: "it is the SAME sitter in the parlor overmantel and in all
three landing canvases at the same scale, so the landing wall reads as four
prints of one plate; and every face is still a blank pale oval." So:

- **vary the sitter** — sex, age, pose, scale, the direction they face, a
  seated half-length against a standing three-quarter;
- **give the face its three marks** — a brow, a nose line, one dark eye
  socket. `mainMenu.png` carries that at 60 px;
- the parlor overmantel wants "a seated half-length lit from the fire below,
  so the brightest-framed object on the wall is not the emptiest";
- MINIUM's thin lit gold slip between moulding and canvas is a small named
  graft that separates a picture from its frame at a distance.

**The same fault, elsewhere, and it is the same fix:** the gallery arcade's
busts are "smooth white ovoids with no face, shoulders or drapery at 40 px" —
give them a brow, a nose line and a draped shoulder, or make them urns with a
rim and a foot. And in combat, "six empty gilt rectangles sit at exactly the
height the eye lands after reading the card row": fill three with dark
half-length sitters and leave the rest in shadow.

### 2. NOTHING REPEATED WITHOUT VARIATION — both judges, on four different objects

Round 16 proved the house can do this (the mansion's unequal bays, its dark
windows, its ragged conifer tiers). These four did not get it:

- **the landing wall**: "nine frames, all the same rectangle at three sizes.
  Vary the aspect, add an oval and a small tondo, and leave one frame empty
  with a lighter unfaded patch of damask behind it — a removed picture is a
  drawn thing";
- **the palmhouse clump**: "one pinnate frond duplicated eight times at one
  size, and the venation stamped at the same density on every blade" — two or
  three blade shapes, and taper the laterals out with distance;
- **the conifer belt** in the gate and yard panels: "a row of solid trunkless
  cones at an even pitch" — the nearest six want a visible trunk below the
  skirt, an irregular pitch and half again the height variation;
- **the dais wall's orchestra gallery**: a lit horizontal band — real
  balusters at a regular pitch, two dark instrument silhouettes and a music
  stand behind it.

### 3. THREE THINGS STILL UNFINISHED, each named twice or more

- **The suite panel still carries a black band across its TOP edge** while its
  neighbours bleed. Push the room out and raise the vantage so the
  proscenium's head is inside the frame. The proscenium itself is "a smooth
  gold field — it needs an archivolt, imposts and a keystone", and the grand
  piano under it "is a black silhouette with no lid prop, no legs and no
  keyboard".
- **The chapel** has been asked for three rounds running: stepped buttresses
  between the lancets, a chamfered plinth at the ground line, an eaves line
  against the sky.
- **The glasshouse roof**: "the panes are an even checker whose unit never
  shrinks toward the far wall and there is no ridge. Draw glazing bars that
  converge on the room's vanishing point, add purlins and a ridge beam."

### 4. MEASURE THE PARQUET BEFORE YOU BELIEVE EITHER SIDE

Round 16 settled one half of this and left the other open. It proved the
herringbone is a rigid 45° rotation of world metres over a constant block
width, and that the arcs a judge sees are correct perspective across a wide
field of view with elliptical light pools over it. **But a round-16 judge then
said something different and testable**: "the herringbone parquet unit is the
same size at the front of the frame as it is at the far wall, so the floor
reads as patterned paper rather than a receding plane." A pattern constant in
METRES must shrink in PIXELS with distance. **Measure it**: crop the mirror
hall floor near and far, count the block period in pixels in each, and put
both numbers in your notes. If the ratio is near 1, that is a real projection
bug and it is the most valuable thing in this round; if it shrinks properly,
say so and leave the floor alone.

### 5. SMALLER, one judge each

- the conservatory fountain: a basin with a rim that has thickness, a moulded
  foot, and a lip of water breaking over one side;
- combat's right-hand wall past the Calling Bell: empty dark picture frames —
  fill them or swap them for a pier and a lit sconce, as the rest of that wall
  already has;
- the mansion's window glass in the yard and plots panels is "a blurred pale
  smear with no glazing bars" at the size it is drawn.

## WHO OWNS WHAT THIS ROUND

**Yours:** `fx/atmosphere.js`, `fx/backdrop.js`, `fx/shaders/backdrop.js`, and
`fx/shaders/grade.js` only if a fix truly needs it.

**NOT yours:** the Bathhouse and the Lampworks (grafted in round 14 and not
judged since — prove you left them alone by photographing both sheets and
comparing content, not hashes); the enemy and Companion sprites, the HUD, the
card kit, the plates, the type, the dialog controls, the web chrome, gameplay,
and the region palettes.

**What must not vary**, as `BRIEF-r11.md`: the palette and the arch mode hold
across a wing's rooms, a wing's material vocabulary holds, and every kind must
be a room that wing really has.

## PERFORMANCE, TRAPS, DELIVERABLES

Exactly as `BRIEF-r16.md`: both frames against BASE, interleaved, three runs
each, **always `--wait 40`** (the default 5 s wait measures ANGLE linking, not
the frame); 15.5 ms hard on both; report link times. Stop only the processes
you started, by PID. Run tests from your worktree through
`python tools/on_port.py PORT <test>` with your own dev server up. An unwritten
uniform is `(0,0,0,1)`, not zero. **Say in your notes what you did NOT do.**

```
cd "WT" && python tools/variant_sheet.py foyer      --port PORT --seeds parlor,gallery,landing       --out JUDGING/CODE/sheet-foyer.png
cd "WT" && python tools/variant_sheet.py ballroom   --port PORT --seeds ballroom,mirrorhall,suite    --out JUDGING/CODE/sheet-ballroom.png
cd "WT" && python tools/variant_sheet.py greenhouse --port PORT --seeds conservatory,palmhouse,vinery --out JUDGING/CODE/sheet-greenhouse.png
cd "WT" && python tools/variant_sheet.py graveyard  --port PORT --seeds yard,plots,gate              --out JUDGING/CODE/sheet-graveyard.png
cd "WT" && python tools/shot.py CODE-combat --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
```

`combat` also at `--w 1280 --h 800` as `combat-1280.png`; check its `perf.band`
(29-36). Plus `ENDINGS OK`, `tests/shader-literals/check.py` green, `glStd` per
panel, a seventeen-wing sweep looked at, the bathhouse/lampworks comparison,
**your two parquet numbers**, and `notes_for_merger` with both perf deltas,
link times, every number you added, and what you did not do.
