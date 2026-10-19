# Round 38 — verdicts: the map's stamps and regions, and the atlas

Base `4f844251`. VOILE is the baseline. Builders: SARD (`ui/r38-parchment-a`,
LITERAL), MORION (`-b`, THE ATLAS FIRST), HELIOTROPE (`-c`, A SURVEYOR'S
DRAWING). All finished in one run; two blind judges agreed
(`wf_7a46d72d-ca2`), no tiebreak.

## Scores (mean of two judges, each screen at both sizes)

| screen | MORION | SARD | HELIOTROPE | VOILE | winner |
|---|---|---|---|---|---|
| map | 6.75 | 6.25 | 7.00 | 4.75 | HELIOTROPE (2 of 2) |
| atlas | 7.00 | 6.25 | 5.75 | 3.50 | MORION (2 of 2) |
| atlas-house | 7.00 | 6.25 | 5.00 | 1.75 | MORION (2 of 2) |
| **mean** | **6.92** | 6.25 | 5.92 | **3.33** | |

**MORION wins, 2 of 2 judges, +3.58** -- inflated by the baseline's
all-surveyed atlas (1.75: seventeen black nameplates piled on one another
over a dark tangle). "Its atlas language is the clearest: pale pencil
outlines with engraved labels for unsurveyed wings, and the surveyed wings as
cream inked islands. That holds up with one wing surveyed and with all
seventeen, at both sizes" (J1). Its weak screen is the map: "every stamp is
the same dark disc, with no next-row focus". HELIOTROPE "has the best map"
(both) but a faint atlas and a "pastel choropleth over a dark tangle".

## THE GRAFT — what both judges ask for

1. **The map's stamps -- HELIOTROPE's (and SARD's) hierarchy** (both, first):
   only the reachable next row keeps the heavy dark gold-rimmed disc; rows
   passed and far rows fade to a lighter ink ghost (a thin ring, a pale fill,
   a faded glyph), so the next choice is the focal point.
2. **The map's regions -- HELIOTROPE's ink** (both): a dash-dot surveyor's
   line with small corner crosses, red diagonal hatching for one region and
   blue stipple for the other, NO translucent tint under the hatching, the
   label engraved straight onto the paper at the region's corner in place of
   MORION's bright ribbon chips (J2), or seated on the region's top edge off
   the route lines (J1).
3. **The map's boss plate at 1280 -- HELIOTROPE's** (both): compact
   (RECEIVING / CHAMBER on two lines) beside the boss, covering no region and
   no node.
4. **The atlas -- SARD's focus and tags** (both): gold corner brackets around
   the surveyed wing, which is darkened and crisped into the lit focal point
   with its cartouche attached, not floating; small paper label tags (styled
   as engraved plates) with the wing's numeral above, so names stay legible
   over dense ink in `atlas-house` (the Lampworks, Ballroom and Hedge Maze
   labels now collide with wall ink); the densest wings' interior ink thinned.
5. **The atlas's smaller items:** the roman numerals over each name at 11 px+
   with more contrast at 1280 (both); in `atlas-house` the flat bright cream of
   seventeen plates toned to a warm aged vellum with tooth and a candle falloff
   (J2); each unsurveyed outline a darker pencil edge so neighbours separate
   (J2).
6. **The map's KEY:** the floating KEY ribbon dropped and the label seated
   inside the plate (both).

## Builders' notes, in short

- **MORION** (`a5933b80`, self 8): `tools/blueprint_locate.py --wings` (an
  extension, not a second tool) writes each wing's closed footprint, label
  pole and span into `game/assets/blueprint/sections.json`; `atlas.js`
  `_paintSurvey` draws every wing by its footprint -- unsurveyed a crisp pale
  pencil outline with its walls as a ghost; surveyed a gilt wash with a
  tide-mark edge and its own drawing inked over in iron-gall; with all
  seventeen surveyed, three wash tints alternate.
- **HELIOTROPE** (`e31a84bf`, self 8.1): the house cut into non-overlapping
  PARCELS once per page (the seventeen section rectangles overlap on the
  master -- the cause of both the blot and the tangle); a light trace pen
  clipped to each parcel; the map's stamps ghosted by row; hatched and
  stippled regions with dash-dot lines and corner stations.
- **SARD** (`409b51f8`, self 8): `data-ahead` on every node (1, 2, 3, mid,
  far, past) driving stamp strength and size; regions as close hatches with a
  ruled dash-and-dot boundary, corner crosses and a pasted name slip; paper
  tags and gold brackets on the atlas.
