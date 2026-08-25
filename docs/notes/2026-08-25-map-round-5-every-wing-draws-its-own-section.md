# Map round 5 — every wing draws its own section

**Owner:** map agent · `src/scenes/map.js`, `src/scenes/map.css`, `src/state/mapgen.js`,
`src/ui/mapnode.js` · new one-off `tools/blueprint_trace.py` and its committed output under
`game/assets/blueprint/`.

## The instruction

> "the mansion blueprint levels are supposed to be based on the blueprint section images located
> in the art folder (section 01 through section 17)."

They were not. `mapgen.js` had `blueprintSectionUrl()` returning `section01.png` … `section17.png`
and nothing called it: the map cropped `mansion.png`, the master estate drawing, around an authored
centre per region. Every one of the seventeen sheets was a different rectangle of the same picture.

The reason was written down at `mapgen.js:214` and it was a real one —

> "the map screen crops here rather than blowing the 273px sections up 7x, which turns the
> linework to mush"

— but it answered the wrong question. The sections *are* small (165x470 up to 713x237 against a
1882x776 plan window, a 3.5x to 7.8x blow-up) and a smooth upscale of one *is* mush. The fix is not
a different source. It is to stop resampling a bitmap.

## What the section drawings actually are

Two marks. That is the whole vocabulary:

- **wall runs** — thin, overwhelmingly orthogonal, ~2px wide at native size
- **pier dots** — round blobs, r ≈ 1.0–2.5px, strung along the walls and at every junction

Everything else on the sheet (door swings, dashes, hatch ticks, the greenhouse's planting) is small
change. A drawing made of two marks does not need to be resampled; it needs to be *read*, and then
inked again at whatever size the sheet is.

## The tracer — `tools/blueprint_trace.py`

One-off. It runs on a developer's machine and commits `sectionNN.plan.json` beside each PNG. The
game has no build step (CONTRACTS non-negotiable #1) and never runs it; the map `fetch`es exactly
one JSON per region, 17–160 KB, cached across scene entries.

1. **ink field** — the same blue-against-warm-paper extraction the map used to do at runtime, so
   the ink we keep is the ink it kept.
2. **hysteresis**, seed 0.34 / grow 0.14. A flat threshold either drops the faint connective lines
   between piers — walls come apart into beads — or picks up paper grain. Hysteresis keeps faint
   ink only where it continues real ink.
3. **piers**, measured on the RAW mask. Anything with half-width ≥ 1.05px is a pier, recorded as a
   centre and a radius.
4. **closing**, r = 2.5 supersampled px, and only for the walls. The source is a printed drawing
   photographed small: its walls are *beaded*, and a 1px gap the eye integrates at 1x is an 8px
   hole at 8x. Closing knits the beads back into runs. It also swallows the drawing's dot rhythm if
   you let it — 443 piers down to 113 on the Foyer — which is why step 3 measures the mask before
   this one touches it. That split is most of why the plan reads as a drawing and not as a diagram.
5. **thinning** (Zhang-Suen) to the centreline, split at junctions, then **chained** back together
   by direction, so a wall crossed by three others stays one polyline instead of four stubs.
   2,946 raw runs → 358 strokes on the Foyer.
6. **simplify** — Douglas-Peucker at 0.32px, then near-axis runs (within 9° and 1.4px) snap flat.
   Architecture is orthogonal; the wobble is the pixel grid, not the draughtsman. This is where the
   razor edges come from: a wall that snaps to exactly horizontal has no stair-stepping to
   antialias at any magnification.
7. **bridge** — join stroke ends facing each other across < 2.2px. Closing gets most breaks; this
   gets the rest without fattening the ink.
8. **fine marks** — rasterise everything above, diff it against the source mask. Walls and piers
   account for **89–90%** of the source ink (measured on sections 01, 07 and 13). The remaining
   10% is 120–260 small marks a sheet, kept as dots the map inks lighter. Without them the plan
   looks swept clean.

Also baked in: total line length and the ink's bounding box, which the map needs (below).

## What the map does with it

`_layPlan()` builds the drawing on one offscreen canvas and composites it once, with `multiply`, at
`PLAN.ink`. One composite is not a detail — every stroke overlaps its neighbours at the piers, and
multiplying six hundred translucent strokes straight onto the paper turns every junction into a
black knot. Drawn opaque and composited once, the plan holds a single even weight the way printed
ink does.

Three passes inside it: the **wash** (the source PNG with its paper dissolved away, very faint —
tone and the ornament the trace flattens, never linework), the **bleed** (the vectors again, offset
1.6px and pale: ink soaking into paper), and the **line**.

Two decisions carry the quality:

### The pen is solved, not authored

Line weight is deliberately *not* proportional to the blow-up. A draughtsman does not change pens
when the scale changes; 8x a 2px line is a 16px pipe, and a wing drawn in pipes is not a survey.

But one authored weight does not work either, because the seventeen drawings are not alike. Per
unit of paper the Impossible Greenhouse carries three times the line length of the Grand Study, and
it is shown at half the magnification. A weight that suits the Study makes the Greenhouse a solid
blue field. So the sheet asks for an **ink-to-paper coverage** (3.4%) and works back:

```
pen = cover · area · scale / length      clamped to [1.35, 5.20] sheet px
```

Cover-fitting means the window *is* the visible plan, so drawn-line area over window area reduces
to exactly that, in the section's own units. Solved pens across the seventeen: 1.35 (greenhouse,
clamped) to 5.20 (study-library, clamped), most between 2.4 and 5.1. Each stroke then departs from
the pen by its own traced weight, held inside ±52% so the source's hierarchy survives — an envelope
wall stays heavier than a partition — without any one line running away with the sheet.

### Six wings are drawn turned

The plan window is 2.43:1. Seven sections are portrait — the bathhouse is 165x470, the secret
passages 230x570. Cover-fitting a 0.35 plan into a 2.43 window shows a seventh of the wing;
contain-fitting it leaves five sixths of the paper blank and two thirds of the route floating over
nothing. Neither is a survey of that wing.

So the sheet turns the plan, the way a real drawing does when the building does not suit the paper,
and says so: the compass rose turns with it and the sheet prints **PLAN TURNED 90°** under it. The
bathhouse then reads 470x165 — 90% of the wing on the sheet instead of 15% of it, at 4.9x
instead of 11.8x. `rot` is computed from the window's aspect, not authored, with a margin so a
wing only turns when turning is clearly better and never on a coin toss. Six of the seven
portrait sections turn — the nursery's 273x292 is too near square to be worth it: crypt, secret
passages, bathhouse, kennels, pumpkin grounds, heart.

The fit also uses the **ink's** bounding box, not the file's. Every section PNG carries 3–20% blank
parchment around its plan, and fitting the file frames that margin instead of the wing — most
visibly on the secret passages, where it left a band of bare paper along the foot of the sheet.

## Measured

`shots/sharp-before*.png` is the master-crop build (HEAD at the start of the round) and
`shots/sharp-after*.png` is this one, same seed, same region, same viewport, 1600x900. "Plan only"
hides `.map-ink` and `.map-nodes` so the number is the drawing and not the route.

| | edge energy | acutance | crispness | ink mass |
|---|---|---|---|---|
| **plan only, plan window** — before | 8.413 | 26.76 | 0.522 | 0.155 |
| **plan only, plan window** — after | 6.370 | **31.55** | **0.608** | 0.138 |
| ratio | 0.76x | **1.18x** | **1.17x** | 0.89x |
| **full screen, whole sheet** — before | 11.828 | 33.56 | 0.487 | 0.239 |
| **full screen, whole sheet** — after | 10.942 | **36.78** | **0.500** | 0.233 |
| ratio | 0.93x | **1.10x** | **1.03x** | 0.97x |

- **edge energy** — mean ∇ over the region. The brief's headline metric.
- **acutance** — mean ∇ over pixels that are actually on an edge (∇ > 10). How steep a real
  transition is: this is sharpness with detail count divided out.
- **crispness** — mean ∇ at 1px spacing over mean ∇ at 3px spacing. 1.0 would be a step edge
  resolved in a single pixel; lower means the step is smeared over several, i.e. mush.

**Read it honestly.** Edges are 10–18% steeper and resolved in 3–17% fewer pixels: the section
build is sharper, and the mush the old comment feared is not there. Raw edge energy is 7–24%
*lower*, and that is a content difference, not a blur. The Foyer's own drawing is 242x173px of ink
shown at 7.8x; the master crop was 800px of the estate shown at 2.35x. Per unit of paper the wing's
own plan simply has 2.4x fewer marks on it — which is what "draw this wing at 1:96" means. The
trace is not the cause: it reconstructs 90% of the source ink, measured.

I could close the edge-energy gap by darkening the print (`PLAN.ink` 0.74 → ~0.90). I have not,
because round 4 fought hard to get the architecture to sit BACK so the graphite route wins, and
buying a proxy metric by undoing that is a bad trade. Total ink mass is 0.97x of the old sheet, so
the plan's weight against the paper is unchanged; it is distributed over fewer, cleaner marks.

## Kept

Everything the reviews liked is untouched: the 1:96 conceit, the compass rose (now honest about
rotation), the scale bar, the title block with SHEET / SCALE / SURVEY REF, hazard zones as hatched
regions with keyed roundels, the KEY legend, the west-to-east ink draw-in on entry (probed:
`is-armed` → `is-drawing` at 3867ms → `is-drawn` at 4829ms, a 960ms sweep), the node hover cards,
and the graphite-over-print route.

`blueprintPlan()` and `MASTER` are left exactly as they were. The map no longer calls them, but
`scenes/gameover.js` (meta-run's file) shows the estate as a whole at run end and still crops the
master, which is right for that screen.

## Cost

- Paper + plan repaint, measured in-page: **6–12 ms** on the Foyer, **14–22 ms** on the Impossible
  Greenhouse (4,233 strokes, 2,772 piers). Once per scene entry, behind the transition veil.
- 60–61 fps on all seventeen wings at 1600x900, and at 1920x1080 on the heaviest.
- 722 KB of JSON committed across seventeen files; a region loads one.

## Green

`tests/map/run.py` 23/23 · `tests/run/run.py` 50 runs 0 errors · `tests/seams/check.py` 1606 call
sites, 0 problems · `tests/scene-css/check.py` 870 classes, 0 conflicts. No console errors on any
of the seventeen wings (`shots/wing-*.state.json`).

## Known limits / next

- **Zoomed in past ~2x the plan softens**, because the plan is baked into the parchment canvas at
  q≈1.1 like everything else on the sheet. It is strictly better than the old build at the same
  zoom, and it is not a regression, but it is the one place the vectors are not being used for what
  they are good at. The fix is a separate plan layer re-rasterised for the visible viewport on
  zoom-settle; it costs a full-screen blended layer, which CONTRACTS rule 3 is rightly nervous
  about, so it wants its own round with its own frame measurements.
- **The Grand Study and Library (wing 7) is the sparsest sheet.** Its section is genuinely open on
  the west side — the trace is faithful, there is just less drawing there. It reads fine; it is
  simply the quietest of the seventeen.
- If the plan window's aspect ever changes, re-check `blueprintSection` — `rot` is computed against
  it, so the turned set will follow, which is the point, but the seven turned wings will want a
  look.

## Note for the integrator

Another agent's commit (`0c973a1`, the companion-select round) swept my in-progress files in with
`git commit -a` before I had finished. Nothing is lost — `map.js`, `mapgen.js`, the seventeen
`.plan.json` files and `tools/blueprint_trace.py` are all in the tree and correct — but this
round's work is recorded under that commit's message rather than its own.
