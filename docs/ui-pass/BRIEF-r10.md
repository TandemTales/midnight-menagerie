# Round 10 — the objects again, and every one of these was checked before it was written down

Read `BRIEF-r0.md` and `BRIEF-r1.md` for how a round runs, `BRIEF-r8.md` for the
two rooms and the traps, and `BRIEF-r9.md` for the standing priorities, which do
not change: **readable objects that make sense, accurately presented, drawn with
care, appropriate to the setting — and colour is NOT a target.** The Greenhouse
is allowed to be green and the Ballroom plum. Where any earlier brief disagrees
with this one, this one wins.

## WHERE ROUND 9 GOT TO

**+2.71, the largest gain of the pass**, and the round props stopped being
coverage masks: `reliefH()` gives all twenty silhouettes metres of relief inside
their outline, so a prop has an interior that lights, occludes and inks. Josh's
two rooms went from **2/10** to 7 and 6.5. Verified across all seventeen rooms:
ink depth 0.097 → 0.106, tooth 0.299 → 0.310, void 11.38% → 11.25%. Frame
13.5–14.2 ms against the 15.5 budget, and props got *cheaper*.

**`fits_between_samples` is still FALSE on every candidate on every screen, and
the best room scored 7.**

## EVERY ITEM BELOW WAS VERIFIED AGAINST THE MERGED BUILD FIRST

Round 9's two judges both opened with the same blocking item: *"at 1280x800
GALLNUT draws no room at all — a flat plum plane where the 1600 capture has
damask paper, a panelled dado, a glazed cabinet and a stair. The room disappears
at that aspect and must be restored before anything else."*

**It is not true, and it is not in this brief.** A fresh capture at the same
size, encounter and seed shows the Foyer in full. The builder's own state file
for the capture the judges were shown reads a healthy ANGLE context, **zero
console errors, 41 fps — and no backdrop**: the UI is a DOM layer over the `#gl`
canvas, so a frame whose 3D layer never drew still looks busy and passed every
check. Three builders would have spent this round on a bug that does not exist.

`tools/shot.py` now records `perf.glStd`, the standard deviation of the `#gl`
canvas alone — a healthy combat frame reads 43.7, a blank layer ~0. **Check it
on your own captures before you report anything, and re-take a capture whose
backdrop did not draw.**

## THE FIX LIST

### 1. EVERY PRACTICAL LIGHT DRAWS A FLAME WITH NO FITTING UNDER IT

Both judges, in two rooms each, and it is one root cause: *"the white ovals
hovering at head height have no chain, no ceiling rose and no fitting, so they
are unnameable objects in otherwise built rooms"* and *"three pale ovals float
in front of the wall attached to nothing"*.

`Backdrop` draws a visible flame sprite at every practical light — correctly, so
that the flicker driving the illumination also drives the source you can see.
But nothing draws the **fitting**. Verified: the Ballroom's three lights sit at
`x −6.5, +6.5, 0.0` and `y 5.40, 5.40, 6.20`, and its capture contains **exactly
three** bright blobs, at x 30.0%, 70.8% and 50.6%, all at y ≈ 41%. The symmetry
and the count match the data exactly.

Do what judge 1 asked: **give each one a body** — a chandelier with arms, candle
cups and a visible chain to a ceiling rose; a sconce with a backplate and an arm
— **or stop drawing a flame for a light that has no fitting.** A light source
you can see is right; a floating flame is not.

**This is very likely the Graveyard's "two moons" as well.** Judge 1: *"there
are two moons — a small bright one at top left and the full moon at centre."*
Measured: a 3424 px disc and a 323 px one, and the small one has a mottled face
and a halo. The Graveyard's one cold practical sits at `y 8.00`, high in open
air. Ruled out already: it is not the motes and not the shafts (`motes=0` and
`shafts=0` leave both discs untouched), and it is deterministic. Confirm it
before you fix it.

### 2. THE GREENHOUSE'S POTS

Both judges. *"every container under the agaves is a dark rimless tub with no
rolled lip, no foot and no soil line, so a 2 m specimen appears to grow out of a
shadow on the brick"*, and: give each *"a rolled rim with a visible inner
ellipse, a foot, and a soil line at the crown of the plant, and split the run
between terracotta and lead cisterns so they are not all one silhouette."*

The plants themselves are now good — this is the container they stand in.

### 3. THE GREENHOUSE'S MID-GROUND MASSES

Both judges: they *"are mottled lumps with no leaf edges and read as moss
boulders"*. Give them the construction the potted fans now have — overlapping
blades, each with a midrib and a lighter tip — or replace them with a coursed
brick planting bed holding more fans. Judge 2 adds: clip the hedge masses to a
defined box silhouette with individual leaf marks along the lit edge.

**And the leaves themselves**: *"flat cut-paper with a uniform fill, so the
plants read as one plane at 1:1"* — add a specular roll along each midrib, let
outer leaves curl over and overlap their neighbours, and give each species its
own edge (entire, serrated, spined tip).

### 4. THE GRAVEYARD'S MONUMENTS

Both judges, and this is the statue shape again — shared with the Ballroom, the
Crypt and the Heart, so it pays four times. *"each is a ball head on a banded
cylinder above a flared skirt, with no face, no wings, no folded arm and no
vertical drapery"*; *"the arms end as truncated cylinders where hands should be
and the face is a noise-pitted oval."* Carve a brow and nose plane, add hands
(clasped, or holding a wreath), and replace the vertical striations with three
or four drawn robe folds that follow the body. Round 9 gave the statue an
interior; this is what to put in it.

### 5. THE GRAVEYARD IS PAVED WALL TO WALL

Both judges: *"a graveyard is paved wall-to-wall in brick courses, which makes
the headstones read as bollards on a cathedral forecourt."* Lay turf and earth
with kerbed plots and a settled mound with a disturbed edge round each stone,
and keep paving only for a gravel path running back to the railings.

### 6. THE FOYER IS FURNISHED BUT STILL EMPTY BELOW THE DADO

Both judges. *"the lower 40% of the frame is unlit floor carrying one small
bench, with no console table, rug, hall chair or vitrine anywhere in the
entrance hall."* Judge 2 names the graft: **UMBER's glazed vitrines with glazing
bars and a cornice, its torchere, its buttoned hall chair** — `ui/r9-bg2-b` is
still there — plus a stair runner up the axis.

**And its handrails**: *"both raking handrails and the landing balustrade are
drawn as one-pixel stepped diagonals, so at 1:1 the rail reads as an aliased
staircase icon rather than a moulded timber rail with a thickness."* UMBER fixed
exactly this and won the screen at 7.

### 7. THE BALLROOM'S SEATING IS MIS-SCALED

*"five diamond-tufted chairs whose backs measure about 0.6 m against the column
plinths"* — a chair back is 0.85–1.00 m. The piano and pier glass are already
in (grafted from CARMINE after round 9); a chandelier over the middle of the
dance floor is still wanted, which is fix 1's work.

### 8. THE GRAVEYARD'S HOUSE

*"the coursing is a stack of uniform full-width horizontal stripes and the
arched windows are glowing bread-loaf shapes."* Stagger the joints into
individual stones with a header course, and give each window a mullion and a
sill drip. Judge 1 also wants the roof's ridge, tile courses and a hard edge
against the sky, and offers CARMINE's four spired towers as a more Victorian
silhouette.

### 9. SMALLER, EACH ON A CAPTURE

- The Foyer's curtain head hangs from nothing — give the drape a pole with
  finials and rings; and the fluted drum beneath it needs a rim, a lid or
  handles, or to become a named object (an umbrella stand, a plinth with a cap).
- The Greenhouse's ceiling is a flat black band. A glasshouse roof is GLAZED:
  carry the glazing bars over the top in perspective to a ridge, so the shafts
  in the room have a source.
- `rest`: carry the fan damask down from the picture rail to the dado at reduced
  contrast instead of stopping in a band at the top.

### 10. NOT YOURS

The enemy and Companion sprites, the HUD, the card kit, the plates, the type,
the dialog controls, gameplay, and **the region palettes** — colour is settled.

## THE INSTRUMENTS, and what each lies about

Everything in `BRIEF-r9.md`'s instrument section still applies: `inkDepth` is a
median and can fall while a wall improves; the ink axis is blind on a dark wall;
`tooth` is measured on flat tiles only; `midHue`/`midSat` are not targets; check
which population you measured. Plus, new and paid for this round:

- **`perf.glStd`** — the `#gl` canvas's own standard deviation. ~0 means the
  backdrop did not draw and the capture is not evidence.
- **A void capture is not a regression.** A capture with `gl: none`, or a frame
  flatter than std 8, is the harness failing, not the art. `shot.py` exits 2.
  This machine's GPU degrades across a few hundred browser launches in a session
  and **recovers when left to idle**; a sweep that returned 17 dead frames one
  evening returned 17 of 17 live the next morning on the same commit.
- **Bisect with the layer toggles** before theorising: `motes=0`, `shafts=0`,
  `props=0`, `frames=0`, `actor=0` on the backdrop-room hash. That is how fix
  1's cause was found and how two wrong guesses were killed.
- **The standing rule: measure to FIND the defect, LOOK to set the amount** —
  and this round adds: **check the capture a finding was written about.**

## THE PERFORMANCE BUDGET — a hard limit

```
python tools/on_port.py PORT tools/gpuprof.py --scene combat --w 1600 --h 900
```

Through `on_port.py` always. Current, in a quiet window: **13.5–14.2 ms**,
`ALL_BACKDROP` 9.0–9.1, props 1.04–1.17. **Stay at or under 15.5 ms, report
three runs, and take them with nothing else on the GPU.**

## THE TRAPS

All of `BRIEF-r8.md`'s still apply. The ones that bit hardest:

- **A BACKTICK IN A GLSL COMMENT TAKES THE GAME DOWN.** Run
  `python tests/shader-literals/check.py` after every shader edit, not at the
  end. It also catches an unterminated `/* */`, the one fault here that does not
  break the page.
- **`max()` on an ACCUMULATED SDF** subtracts from everything already in it.
  Shape the primitive, then `min()` it in.
- **Recess occlusion darkens NEGATIVE relief only** — a shape built entirely
  from positive height gets a normal and an ink line and no shadow at all, which
  is "a cauliflower with veins on it". Subtract the shape's own mid-height.
- **You cannot light a prop at its luminance ceiling**: marks must be DARK.
- **Two systems inking one line** crushed a 180 px cabinet to black when relief
  joined albedo joinery. Check whether relief already draws a thing before
  drawing it again.
- **Line endings**: `python tools/endings_guard.py --base <base>`, in your
  worktree, never in the main checkout.

## DELIVERABLES

- the endings guard printing `ENDINGS OK`; commits on your branch;
- `tools/gpuprof.py` three times via `on_port.py`, quiet window;
- `tests/shader-literals/check.py` green;
- **`perf.glStd` from each canonical capture in `notes_for_merger`** — proof the
  backdrop drew;
- **2× crops of every object you touched, before and after**, at the size it
  renders;
- the canonical screenshots in `JUDGING/CODE/`, each also at `--w 1280 --h 800`
  as `<name>-1280.png`.

```
cd "WT" && python tools/shot.py CODE-combat        --port PORT --scene combat --encounter foyer-14 --seed 7 --companion bones --kid maya --wait 5
cd "WT" && python tools/shot.py CODE-rest          --port PORT --scene rest    --seed 7 --companion bones --kid maya --wait 3
cd "WT" && python tools/shot.py CODE-room-greenhouse --port PORT --hash "region=greenhouse&tier=high&actor=0" --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-ballroom   --port PORT --hash "region=ballroom&tier=high&actor=0"   --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-foyer      --port PORT --hash "region=foyer&tier=high&actor=0"      --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
cd "WT" && python tools/shot.py CODE-room-graveyard  --port PORT --hash "region=graveyard&tier=high&actor=0"  --scene title --wait 5 --script @tools/shot-scripts/backdrop-room.js
```

Copy each PNG to `JUDGING/CODE/<name>.png` with the `CODE-` prefix removed.

Before you finish, sweep all seventeen rooms, **open every one at 1:1 and look at
every object in it**, and check `glStd` on each. Photograph a board and a dialog
too. Stop your dev server when you are done.
