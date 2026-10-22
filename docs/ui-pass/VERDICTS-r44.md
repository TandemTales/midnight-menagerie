# Round 44 — verdicts: the Pumpkin Grounds, the Greenhouse, the Graveyard, the Nursery

Base `297c0545`. ORGANZA is the baseline. Builders: SPHENE (`ui/r44-rooms-a`,
LITERAL), EUCLASE (`-b`, THE GROUND FIRST), PYRITE (`-c`, THE OBJECT
DRAWN). All finished in one run; two blind judges (`wf_5107680e-a55`), both
chose PYRITE, so no tiebreak.

## Scores (mean of two judges; the fight at both sizes)

| screen | PYRITE | SPHENE | EUCLASE | ORGANZA | winner |
|---|---|---|---|---|---|
| sheet-pumpkin | 6.5 | 6.0 | 4.5 | 3.5 | PYRITE (2 of 2) |
| sheet-greenhouse | 5.0 | 6.5 | 5.5 | 4.0 | SPHENE (2 of 2) |
| sheet-graveyard | 6.0 | 6.5 | 5.0 | 4.0 | SPHENE (2 of 2) |
| sheet-nursery | 6.5 | 6.0 | 6.5 | 4.0 | PYRITE (2 of 2) |
| fight-pumpkin | 6.5 | 6.0 | 6.0 | 4.5 | PYRITE (2 of 2) |
| **mean** | 6.10 | **6.20** | 5.50 | **4.00** | |

**PYRITE wins, 2 of 2 judges, +2.10**, though SPHENE's mean is a hair
higher: "the most coherent system. It gives the Pumpkin Grounds a continuous
lit floor with no void band in any of the three rooms or in the fight, and its
pond has coping and lily pads. Its Nursery has its own moon-and-ABC rug and a
dappled horse" (J2). PYRITE found the Pumpkin Grounds' black band was not a
floor fault: the crop's contact shadows overlapped edge to edge across the
court. "SPHENE wins the Greenhouse and the Graveyard outright: rusted
verdigris columns, a reflecting pool, a path with roots and clustered stones.
Those pieces should be grafted into PYRITE" (J2). ORGANZA fails worst.

## PYRITE's defects

- **The Greenhouse** (both): "its columns are grey stone where the brief asks
  for verdigris iron"; the puddles carry black ink outlines that read as
  holes (J2); a dark band below the planter rail (J2); the palm house's cold
  front-left quarter (J1).
- **The Graveyard** (both): "long soft shadow streaks that smear rather than
  read as inked grass"; the front stones on a dark featureless band; too few
  stones right of the path.
- **The Pumpkin Grounds** (both): the near flagstones in the lower third fade
  to a dull grey smear -- hold the joints inked to the front; the pond's water
  a dark plane without reflections (J2).
- **The Nursery:** a black floor strip between the back wall and the rug
  (J1); a tumbling block not set down, the rug's back-edge letters upside
  down (J2).

## THE GRAFT — what the judges ask for

1. **The Greenhouse -- SPHENE's** (both): verdigris iron columns with
   blue-green patina, rust runs from the riveted collar bands; SPHENE's round
   reflecting pool in the conservatory floor; moss in the overgrown house's
   tiles; EUCLASE's moonlit mullion shafts carrying light from back to front;
   PYRITE's puddles WITHOUT black outlines; the band under the planter rail
   lifted.
2. **The Graveyard -- SPHENE's** (both): the winding dirt path, red-brown
   surface roots, headstones and Celtic crosses clustered in threes with
   grass tufts at their feet, MORE stones right of the path, each with a cast
   shadow; the smeared lawn shadows replaced with crisp tree shadows or inked
   grass.
3. **The Pumpkin Grounds:** the near flags' joints inked into the lower third;
   moon and lantern reflections on the pond; SPHENE's grass verge at the
   wall's foot and extra pumpkins mid-floor in the patch.
4. **The Nursery:** the floor strip behind the rug lit (drawn boards); the
   tumbling block set on the rug; the rug's letters facing the player;
   EUCLASE's darker dapples and striped mane on the horse.

## Builders' notes, in short

- **PYRITE** (`fbf2c29b`, 6 commits): `MM_FLAGK 4` for the Pumpkin Grounds;
  shape 27's contact shadow 1.35 x 0.62 -> 1.12 x 0.40 at 0.90 (the black
  band). pk-1 +0.14 ms (15.04 vs 14.90, three pairs, before its last trims);
  gh-1, gy-1, nursery-1 NOT measured; the pumpkin floor and greenhouse prop
  programs grew -- linkprof not run.
- **SPHENE** (`7127ce65`, 7 commits): `MM_RUGK 10` turf verge; pk-1 +0.23 ms
  after cuts.
- **EUCLASE** (`efc5e7c5`, 6 commits): `MM_RUGK 9`; pk-1 no worse than BASE
  after cutting +2.4 ms of floor cost.
