# Round 37's graft — onto BERYL's near floor

Round 37 merged BERYL (`15d72d5c`, +2.21 over the rooms before, 2 of 3
judges; J2 chose CARNELIAN). TOURMALINE won the Heart sheet and CARNELIAN the
Study 3 of 3. All judges' fixes and grafts are in `VERDICTS-r37.md`; read it,
`BRIEF-r37.md` (ownership, performance, traps) and the three builds' notes.

Losers' branches: `ui/r37-rooms-a` (TOURMALINE: shape 85 hcCandles -- tall
brass candelabras with burning candles and their pools -- the runner red to
the frame's foot, the right bay lamp moved to light the right wall, the
wardrobe's toy chest, teddy and dress form) and `ui/r37-rooms-c` (CARNELIAN:
the Study's even warm floor with a wingback and book stacks flanking a
centred rug; stone urns and a bench as the Heart's near props; the braided
oval rag rug; the courtyard's brighter lit niches and a jack-o'-lantern
repoussoir). PORT ideas onto dev's tip; do not merge either.

## 0. FIRST: the frame budget -- MEASURE IT

The merge's perf A/B ran while UnrealEditor held the GPU: about half the
pages timed nothing (`T_full` None), BASE itself swung 9.5-13 ms on the Study.
Valid pairs only (BERYL `338abae1` - BASE `f138b951`, ms):

| wing | valid pairs | BASE on a quiet machine |
|---|---|---|
| Pumpkin (pk-1) | +1.7, +1.6 | 14.15 -- **so ~15.8, over 15.5** |
| Study (sl-1) | +1.85 (one +6.0 against a BASE outlier) | 9.5 |
| Nursery (nursery-1) | +1.6, +1.5 | 10.2 |
| Heart (ht-1) | +0.9 | -- |

Check `tasklist` FIRST (UnrealEditor, games): measure only on a quiet
machine, and if it is not quiet, wait or say so in your notes. Then
re-measure all four wings against BASE (three pairs, `drawW` checked) and
bring the Pumpkin Grounds under 15.5 ms -- at most BASE if you can -- keeping
the look. Look first for work done where it is thrown away (round 34's Hedge:
the painted sky ran the whole yew face only to be mixed away); `tools/
shapeprof.py` hides one prop group at a time inside one page.

## The graft, in order

1. **The Heart -- TOURMALINE's candlelit floor** (all three judges): its tall
   tiered candelabras (shape 85) on the near floor, each casting a warm pool;
   the runner bright red to the bottom edge in all three rooms; the light
   reaching the near edge of the frame -- the candelabras kept inside the
   1280x800 frame and out from behind the Bones panel and the discard pile in
   the fight. CARNELIAN's stone urns on plinths and a CARVED stone bench as
   near props. The statues: carved folds, faces, a dark shaded side and cast
   shadows on the plinths (BERYL's `statueModel` and CARNELIAN's veiled
   modelling are the starts) -- all three judges still call them "pale and
   flat-shaded".
2. **The Study -- CARNELIAN's composition** (3 of 3 won it): the even warm
   floor light across library and fireplace, a wingback and book stacks
   flanking a centred rug, the floor lit to the bottom edge -- the wingback
   scaled so it does not crowd the frame edge; BERYL's filled diamond-lattice
   rug in place of the plain red field; the black stripe between the shelves
   and the rug lit; the cold blue-grey wash behind the desk warmed from the
   green lamp.
3. **The Nursery -- keep BERYL's toy scene:** the patterned rug, blocks, ball,
   toy chest and teddy, the big rocking horse (whole, not cut by the frame);
   CARNELIAN's braided oval rug in the WARDROBE so the two rooms do not share
   the study's rug; TOURMALINE's toy chest and teddy at the wardrobe's
   near-left and a dress form at right; the fire's glow carried below the rug
   and one more toy in the bottom quarter.
4. **The Pumpkin Grounds -- keep BERYL's courtyard:** the bare, inked,
   branching trees and the ivy swags between lit niches; CARNELIAN's brighter
   niches and a big jack-o'-lantern cropped at the frame edge; the pond's
   moonlight carried to the near flags and across the water; the near-left
   flags deep blue-black with a highlight on their edges only. Within item
   0's budget.
5. **The fight:** a warm pool on the floor between the Kid and the hand and
   right of the Memory Animal; the runner's contrast and warmth up under the
   creatures.

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r37's commands, into C:/UILOOP/r37/graft/), LOOKED at beside
  UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them, before and
  after, back to back. On the merge all are identical but the ATTIC: a 4 px
  strip at y 316-319, x 863-1268 (1280x800) differs by up to 4 levels -- a
  shader-compile side effect like round 35's (its graft fixed the Hedge's by
  keeping a branch inert in the text). Make the attic identical too if you can.
- Performance: item 0's table re-measured on your tip against `15d72d5c`
  and `f138b951`, three pairs, all four wings, on a quiet machine.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates (heart,
  nursery, study-library, pumpkin-grounds). `python tools/endings_guard.py
  --base <your base>` prints ENDINGS OK. Commit after every item; stop only
  your own processes, by PID; captures in `timeout 600`.
- Say in your notes what you did NOT do.
