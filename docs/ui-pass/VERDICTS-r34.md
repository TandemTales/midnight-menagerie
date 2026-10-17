# Round 34 — verdicts: four rooms and their near floor

Base `39768613`. CHAMOIS is the baseline. Builders: VIVIANITE (`ui/r34-rooms-a`,
LITERAL), GLAUCONITE (`-b`, THE NEAR FLOOR FIRST), CELESTINE (`-c`, THE
SILHOUETTE DRAWN). The builders ran three times: the first two runs were
stopped by usage limits after doing the whole build; the third only re-took
the six captures from each branch tip and ran the endings guard,
`tests/link-queue` and `tests/shader-literals` (all green, no void, no
error). Three blind judges (`wf_2882a800-2fa`): the first two disagreed, so a
tiebreak ran.

## Scores (mean of three judges)

| screen | CELESTINE | GLAUCONITE | VIVIANITE | CHAMOIS | winner |
|---|---|---|---|---|---|
| sheet-hedge | 6.17 | 5.37 | 6.17 | 4.50 | VIVIANITE (2 of 3) |
| sheet-foyer | 6.67 | 6.53 | 6.23 | 5.37 | CELESTINE (2 of 3) |
| sheet-greenhouse | 5.97 | 6.20 | 6.07 | 4.47 | GLAUCONITE (no majority; head-to-head) |
| sheet-kennels | 6.37 | 5.93 | 5.80 | 4.73 | CELESTINE (3 of 3) |
| fight-foyer | 6.93 | 7.03 | 6.77 | 6.63 | GLAUCONITE (3 of 3) |
| **mean** | **6.42** | 6.21 | 6.21 | **5.14** | |

**CELESTINE wins, +1.28 over the rooms before** -- but with NO majority:
each judge named a different winner (J1 VIVIANITE, J2 CELESTINE, J3
GLAUCONITE). It wins on head-to-head (CELESTINE 3, GLAUCONITE 2, VIVIANITE 1)
and Borda (34 · 30 · 26). It is the only build no judge ranked last on any
screen it did not win. `fits_between_samples` false everywhere: "still
textured 3D sets at 6-7, not paintings" (J2).

## What each judge said

- **J1 (VIVIANITE):** VIVIANITE "the most even system: the best hedge
  silhouette (rounded, clipped, leafy tops), the fullest greenhouse beds with
  near-floor props ... doghouses that keep their colour"; CELESTINE wins the
  foyer and kennels "on crisp, dressed near floors". All three "still leave
  the hedge's near lawn and the fight's stage floor dark".
- **J2 (CELESTINE):** "the only candidate that makes real progress on every
  wing's own defect": broken leafy hedge tops with lit tops and dark bases,
  the Foyer's edge drawn as a carved doorway, patterned runners, the
  Greenhouse full of drawn ferns with no smear, a lit straw kennel floor.
  VIVIANITE's foliage "reads as blobs".
- **J3 (GLAUCONITE):** the best Foyer (no slab, a rich runner, chairs standing
  in the near floor) and Greenhouse (dense ferns, an urn and lantern in the
  foreground); "its weak wing is the Hedge, which is still boxy. VIVIANITE drew
  the best hedges, CELESTINE the best Kennels."

## THE GRAFT — what the judges agree on

1. **The Hedge:** VIVIANITE's rounder clipped leaf mass, lumpy tops with lit
   domes and shadowed undercuts (J1 winner, J3's first graft), with
   CELESTINE's stronger lit-top / dark-base split (J1) -- NOT CELESTINE's
   pointed "crags or a mountain range" (J1) / "flame/stalagmite spikes" (J2).
   VIVIANITE's big foreground topiary at the maze's near right (J3). The
   topiary as leaf clumps, not stacked discs (J2). **All three:** light and
   dress the near lawn either side of the path (a lantern pool, a turf edge,
   a prop in each near corner).
2. **The Foyer:** CELESTINE's inked diamond-and-ring runner in the parlour and
   gallery (all three), quieter behind the nameplates in the fight (J3);
   GLAUCONITE's green chairs standing in the parlour's near corners and its
   warmer runner pool (J1, J2), each chair grounded with contact shadows under
   its legs (J3); a light or prop in the gallery's near-left black hole (J1);
   the parlour's open door leaf given mouldings and lit edges, cropping less
   (J2).
3. **The Greenhouse:** GLAUCONITE's tall drawn ferns in urns in the
   conservatory's near corners and the fountain at the back (J1, J2);
   VIVIANITE's potting table with pots and a watering can in the near floor of
   the conservatory and palm house (J2, J3); CELESTINE's foreground fern bed in
   the overgrown house (J3); the conservatory's back beds raised into a full,
   lit mass (J1); the palm house's black near-left carried into the light
   (J2).
4. **The Kennels:** keep CELESTINE's row of doghouses, lit straw and haze-free
   stall wall, but with VIVIANITE's painted red / green / blue (all three: on
   CELESTINE and GLAUCONITE they wash to grey-blue and read as one repeated
   prop); clear the haze from the upper back wall up to the windows (J1, J2);
   GLAUCONITE's glowing eyes in the dark stall gates (J2); the trestle wash tub
   out of the kennel room (J1); the wash room's cut-off easel staged or gone
   (J2).
5. **The fight (all three):** a warm light pool on the floor between the Kid
   and the enemies so they stand on a lit stage, the runner's pattern reading
   at 1280 between the nameplates and the hand (J2); any foreground chair
   clear of the Companion panel and the filigree (J3).

## Not measured by any builder — the merger must

No builder ran `gpuprof` against BASE or `coldstart`, the seventeen-room sweep
(no shared rule was added except GLAUCONITE's near floor in the Study,
Ballroom and Heart -- not in the winner), or `tests/combat-scene/seam.py`,
`chrome`, `steam-deck`, `dup-keys` and the region gates. The Foyer (16.3 ms)
and Greenhouse (15.9 ms) were over the 15.5 ms budget before this round;
CELESTINE's commits spend effort on the frame budget ("the side hedges stop
at their crown, the runs' quads 1/0.80").

## Builders' own notes, in short

- **VIVIANITE** (`d625fa77`, self 7.5): Hedge ragged crowns, clumped faces,
  dark feet, pom-pom topiary, a lit near lawn; parlour doorcase carved to the
  frame; no hotspot, fuller beds, potting benches; crisp stall wall, straw and
  a trough. Kind-scoped, no shared rule. Fight captures need timeout 600
  while three builders share the GPU slot.
- **GLAUCONITE** (`ad48f721`, self 7): the near floor in its four wings and,
  where its sweep showed it lifting, the Study, Ballroom and Heart; the
  Greenhouse planted at three heights; the wash room's cold fill down; the
  doorcase portal variant dropped from the Foyer's link queue.
- **CELESTINE** (`ef9c37bb`, self 7): a carved parlour doorcase, a grown-out
  hedge crown and dark foot, the glasshouse beds planted solid, the kennels'
  haze and slabs off, near floors dressed and lit; frame-budget work. Its own
  weak spots: the walk's far hedge still fairly level; the conservatory's
  front beds sparse and low; the kennels' near floor busy with straw strokes.
