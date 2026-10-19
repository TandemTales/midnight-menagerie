# Round 39 — verdicts: the four rooms the near floor never reached

Base `8b813845`. ORGANDY is the baseline. Builders: CHALCEDONY
(`ui/r39-rooms-a`, LITERAL), PERIDOT (`-b`, THE NEAR FLOOR FIRST), RHODONITE
(`-c`, THE OBJECT DRAWN). All finished in one run; three blind judges
(`wf_fa07c8d6-151`): J1 and J3 chose RHODONITE, J2 CHALCEDONY.

## A BUG ALL THREE BUILDERS FOUND: THE VELVET SUITE HAD NO WALLS

Since the shader-compile fix (`af440e48`, 10-16) the Ballroom's velvet suite
(`ballroom:suite`, wall program MM_ROOMS 2 / MM_R25W 2 / MM_SUBJ 21) drew its
back and side walls as the clear colour -- "a starry purple void with the
stage floating in it". FXC aborts compiling that program when MM_SUBJ folds to
the constant 21 ("internal error: compilation aborted unexpectedly", ps_5_0,
every retry flag), yet **ANGLE still reports LINK_STATUS true**, so three.js
raised nothing and the walls drew nothing. Each builder found it with
`gl.getProgramInfoLog` and fixed it differently (CHALCEDONY maps 21 to 121;
PERIDOT writes the dais branch branch-free; RHODONITE keeps the number unfolded,
`float(MM_SUBJ) + 0.0*uSeed`, for 21 only). The winner carries its fix.
**A "good" link on ANGLE can be an empty program: check the info log.**

## Scores (mean of three judges)

| screen | RHODONITE | CHALCEDONY | PERIDOT | ORGANDY | winner |
|---|---|---|---|---|---|
| sheet-bathhouse | 6.40 | 6.27 | 6.83 | 4.80 | PERIDOT (3 of 3) |
| sheet-lampworks | 6.67 | 6.67 | 5.97 | 4.60 | CHALCEDONY (2 of 3) |
| sheet-kitchens | 6.47 | 6.83 | 6.37 | 4.23 | CHALCEDONY (3 of 3) |
| sheet-ballroom | 7.00 | 6.13 | 6.23 | 4.03 | RHODONITE (3 of 3) |
| fight-bathhouse | 6.40 | 6.57 | 6.90 | 5.70 | PERIDOT (3 of 3) |
| **mean** | **6.59** | 6.49 | 6.46 | **4.67** | |

**RHODONITE wins, 2 of 3 judges, +1.91** -- the closest field yet (6.59,
6.49, 6.46), each builder winning screens: "its darks stay deep and inky, its
edges stay crisp, and it is the only build whose velvet suite has real damask
panels" (J3). So the graft carries more than usual.

## THE GRAFT — what the judges ask for

1. **The Bathhouse -- PERIDOT's wet tile** (all three, first): the crisp
   mirrored reflections of the window arches, tubs and plants in the wet
   checker tile, keeping RHODONITE's finer, darker tile tooth (J3);
   PERIDOT's pool room with a warm-lit near apron and a towel bench in it
   (J1); CHALCEDONY's bench with stacked towels and a pail as a near prop in
   all three bath rooms (J3); RHODONITE's duckboard mats (J2); a bench or tub
   in the empty near centre, not a lone drain (J2).
2. **The Kitchens -- CHALCEDONY's flags and composition** (all three):
   smaller, worn, chipped-edge flagstones (J3); a chopping block and basket
   forward at left, sacks at right, the centre kept open for the fight (J1);
   PERIDOT's patterned rug enlarged and brought to the mid-floor in both rooms
   (J2, J3); the sacks given lit volume, a burlap weave, a tie and crisp seams
   -- not flat screen-toned cut-outs (all three).
3. **The Lampworks -- CHALCEDONY's bench** (all three): the workbench brought
   forward with a drawered base, oil lamps and glassware, its lamplight on the
   floor; PERIDOT's tall candle-drying rack in the wax room (J1, J2); the
   lampworks room's bare left near floor dressed (a second bench, a stool, a
   lamp crate); the boiler house's near band given a bench or crate pile; the
   wax room's light pool feathered, not a stamped disc; the crate stencils
   inked as letters, not black blobs (J1).
4. **The Ballroom -- keep RHODONITE's** (3 of 3 won it): the carved,
   damasked panels with oval medallions and the lit balcony; PERIDOT's
   scattered petals and dropped fans; a candelabrum or chair group with a warm
   pool in the near checker's centre (J2, J3); the salon's violet haze pool
   gone and one more near prop at lower left (J2, J3).
5. **The fight:** the Bathhouse fight in PERIDOT's wet-tile light (it won the
   fight 3 of 3).

## Builders' notes, in short

- **RHODONITE** (`ff5598a0`, self 7.2): the suite's walls back (`50c572bf`);
  glazed bottle-green tiles with standing-water puddles that reflect the
  windows and globes (`uMirror` for 'baths'); a teak duckboard and brass
  drain; baths forward with towels; carved damask ballroom panels.
- **CHALCEDONY** (`bbaf4ccc`, self 7): the suite fixed by mapping 21 to 121;
  glazed teal tiles box-filtered far off; worn chipped kitchen flags; a
  massive lampworks bench forward.
- **PERIDOT** (`ac7e24c3`, self 6.8): the suite fixed branch-free (guarded
  `#if MM_SUBJ == 21`); black-and-cream bath tiles with the end-wall windows
  ray-cast into the floor; props in eye metres in their pools; scanned 14
  rooms' consoles for other FXC errors and found none in its four wings.
