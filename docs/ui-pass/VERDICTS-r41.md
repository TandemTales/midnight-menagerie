# Round 41 — verdicts: the Hedge, the Kennels, the Sleeping Quarters, the Passages

Base `1271452b`. POPLIN is the baseline. Builders: ZIRCON (`ui/r41-rooms-a`,
LITERAL), LABRADORITE (`-b`, THE PEN FIRST), AMETHYST (`-c`, EACH ROOM ITS
OWN THINGS). All finished in one run; three blind judges (`wf_cf0b20a9-cde`):
J2 and J3 chose AMETHYST, J1 LABRADORITE.

## Scores (mean of three judges; the fight at both sizes)

| screen | AMETHYST | LABRADORITE | ZIRCON | POPLIN | winner |
|---|---|---|---|---|---|
| sheet-hedge | 5.23 | 5.33 | 5.70 | 4.07 | ZIRCON (2 of 3) |
| sheet-kennels | 5.70 | 5.00 | 4.93 | 3.50 | AMETHYST (3 of 3) |
| sheet-sleeping | 5.67 | 5.77 | 4.83 | 3.67 | LABRADORITE (3 of 3) |
| sheet-passages | 5.70 | 4.77 | 4.83 | 3.90 | AMETHYST (3 of 3) |
| fight-hedge | 5.27 | 5.30 | 5.50 | 4.50 | ZIRCON (2 of 3) |
| **mean** | **5.51** | 5.23 | 5.16 | **3.93** | |

**AMETHYST wins, 2 of 3 judges, +1.59** -- "the only candidate that gives each
room its own floor: a herringbone runner in the passage, a paper-strewn bare
floor in the library, a rag runner in the closet, red tile in the wash house
and a lattice rug in the bedroom. Its doghouses are weathered and muted, and
its hedges are clipped" (J3). POPLIN last on every screen from every judge:
"each listed trap: lumpy blob hedges, toy-colour doghouses over confetti
straw, the nursery's rocking horse and toy chest, and the red medallion runner
in all three passages". No candidate fits between the samples: "still evenly
lit 3D rooms with props in them, not paintings" (J1).

## AMETHYST's defects -- all three judges

- **The Hedge path** (J1, J2, J3, both sheets and the fight): "a smooth
  tarmac strip with no flags, and two bright white kerb lines run the length
  of it like road markings" / "a flat dark plane with no flagstones or inked
  joints" / "the one untextured surface in the room". At 1280 "the hedges go
  grey-milky" (J2).
- **The Passages' walls** (all three): "still one stretched wood-panel grain
  repeated down both walls with no varied doors or sconces in the near bays"
  -- AMETHYST's notes claim bay-by-bay wainscot; the judges do not see it.
- **The dormitory runner** (all three): "a flat olive smear with two thin red
  borders, a soft, patternless strip".
- **The wash house tile** (all three): "big soft black blotches" (J1); "a hard
  regular grid that goes orange and stair-steps across the near third" (J2);
  the near-left corner "pure black" and the right half "cold milky blue" (J3).

## THE GRAFT — what the judges ask for

1. **The Hedge path -- ZIRCON's / LABRADORITE's laid flags** (all three):
   dark flagstones with inked joints shrinking toward the fountain, a
   stone-coloured kerb in place of the pale edge strips; the hedges' green and
   the lawn's dark held at 1280 (J1, J2).
2. **The Hedge walls -- LABRADORITE's top and root line** (J1, J2): the
   hard clipped top with sprigs (ZIRCON's too), a dark inked root line and
   contact shadow where yew meets lawn, the face darkening toward the ground;
   ZIRCON's spiral topiary in the fountain room (J2); the lawn's leaf litter
   in inked clumps, kept dark.
3. **The dormitory -- LABRADORITE's striped rag runner and its inked trunk
   with a bedroll** (all three); the bedroom's near planks dressed (a light
   pool, a dropped slipper).
4. **The Kennels -- straw in inked clumps** (all three: ZIRCON's drifts at
   clump scale, crisp, against the doghouse footings, bare flags between); the
   wash house's tile muted and wet-dark with grout wear and inked puddle
   edges, its near-left corner lit, no milky blue.
5. **The Passages' walls** (all three): varied bays with inked doors,
   recesses and sconce plates between the panels (ZIRCON's per-panel figure
   and value is the closest attempt).
6. **The pen -- LABRADORITE's prop outline** (J1, J3), applied lightly to the
   winner's props. LABRADORITE made it a UNIFORM (`uPropPen`); port it as a
   `#define` per the fx/ rule.

## Builders' notes, in short

- **AMETHYST** (`4e739b9a`, self 7.3): floor define `MM_RUGK` (pal.floorK, 0
  elsewhere) with six new floors; the Sleeping Quarters' own trunk, coffer and
  chair in shape 52 (seed > 40) instead of the Nursery's 46/47; the Passages'
  deal table with lantern and ledgers, the library's book piles; the clipped
  hedge line; muted inked doghouses with name boards and a feed corner.
  Perf (gpuprof, one pair for three wings): hm-1 +0.07, kn-1 +1.3 (13.94),
  sq-1 -0.9, sp-1 -0.4 ms. Did NOT read getProgramInfoLog, no linkprof or
  coldstart, an 8-room sweep only.
- **LABRADORITE** (`8971b25c`, self 7.1): the pen (`uPropPen`, a uniform);
  `yewCutR` clipped crown, sheared face, top and root pen lines; warm umber
  walk flags with inked joints (`r41Walk`); round 35's grass verge on the
  maze lawn; straw only round the doghouses; the elm blanket chest; a
  17-room seeded sweep: the other 13 identical. No gpuprof (Unreal ran).
- **ZIRCON** (`f34c7079`, self 7.0): `yewRagW`/`yewRagP` clipped cut; root
  line; dark laid walk flags (`r41Joint`); straw heaps; boarder's trunks
  (wfChest seed > 20); per-panel figure in the Passages; a ceiling program
  that drew the clear colour from an undefined `MM_RUGO`, found and guarded.
  Perf: hm-1 about +0.1 ms; every program in its wings links under 2 s.
