# Round 29's graft — onto VIRIDIAN's rooms

Round 29 merged VIRIDIAN (`d6e73e3f`, +1.75, 2 of 2). Both judges' fixes and
grafts are in `VERDICTS-r29.md` in full; read it, `BRIEF-r29.md` (ownership,
performance, traps) and the three builds' notes at its end.

The losers' branches are `ui/r29-rooms-b` (GRISAILLE: the best sculpture and
fountain) and `ui/r29-rooms-c` (BOLUS: won the Hedge Maze 2 of 2 on its dark,
withered maze). PORT ideas from them onto dev's tip; do not merge either.

## 0. FIRST: the Greenhouse over the Deck budget

Measured after the merge, `tools/gpuprof.py --wait 40 --settle 6`, medium tier,
three interleaved runs, `078e50a3` (BASE) vs `d6e73e3f` (HEAD), T_full median:

| wing | BASE | HEAD | delta |
|---|---|---|---|
| Greenhouse (gh-1) | 15.11 | 15.78 | +0.67 -- **over the 15.5 ms budget** |
| Sleeping Quarters (sq-1) | 10.72 | 11.86 | +1.14 |
| Heart (ht-1) | 12.45 | 12.53 | +0.08 |
| Hedge Maze (hm-1) | 14.10 | 15.07 | +0.97 |

Bring the Greenhouse back UNDER 15.5 ms (settled) keeping the look; the
specimen palms (shape 74, `hM`) and the night-glass reflection are the new
cost. Do not let the Hedge Maze cross 15.5 with the grafts below.

## The graft, in order

1. **The Hedge Maze (BOLUS's darks, GRISAILLE's props; both judges):** the
   lawn and walk near-black like BOLUS's ground, not milky blue-grey; the
   hedges darker and more withered toward BOLUS's browns with crisp lit
   clipped tops and leaf clusters across the WHOLE wall face (no flat
   brown-black slabs) and visible gaps; GRISAILLE's round tiered marble
   fountain with drawn water arcs and a contact shadow in place of the jagged
   basin; GRISAILLE's draped carved figures (heads, arms, plinths) in the
   court's niches in place of the grey keyhole pegs; path edging or stepping
   stones in the lower half.
2. **The Sleeping Quarters:** thicker iron bed frames with a contact shadow
   under every bed; the near-left bed row and washstands a stop darker behind
   the Kid (or the nearest bed moved aside) and the bright red blankets muted,
   so the Kid and the enemy own the contrast; BOLUS's hanging nightgowns in
   mixed blues, reds and whites high on the far rails. The bedroom: fold lines
   in the canopy curtains, contact shadows under the bed, wardrobe, washstand.
3. **The Heart:** GRISAILLE's front statue (drapery, wreath, clean plinth); the
   second and third statues along each wall lit enough to read as carved; the
   back-gallery portraits larger or lit so their faces read; the cold blue
   pool on the right floor removed; the lower half of the hall given drawn
   content (a long rug, an inlaid medallion, or the moon on polished boards).
4. **The Greenhouse:** the vinery's espaliers varied (sizes, gaps, some dead
   brown vines), darker, casting shadow on the brick; the milky overhead
   garlands darkened; the palm house and vinery's blue moonlight floor pool
   darkened, with planters or pots in the bare front slabs; BOLUS's fluted
   green iron columns framing the conservatory's bays.

## Proof

- Before/after contact sheets of the four wings (BRIEF-r29's commands, written
  to C:/UILOOP/r29/graft/), LOOKED at beside UI/mainMenu.png.
- The seventeen-room sweep (`tools/room_batch.py --regions all --tier medium`)
  before and after: the other thirteen wings unchanged.
- Performance: `tools/gpuprof.py --wait 40 --settle 6`, interleaved against
  `d6e73e3f`, three runs, Greenhouse and Hedge Maze at least.
- Tests: dup-keys, shader-literals, combat-scene/seam, chrome, steam-deck and
  the four region gates. `python tools/endings_guard.py --base d6e73e3f`
  prints ENDINGS OK. Commit as you go; stop only your own processes, by PID.
