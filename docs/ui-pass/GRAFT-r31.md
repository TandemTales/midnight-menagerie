# Round 31's graft — onto HEMATITE's near floor

Round 31 merged HEMATITE (`9bba05dc`, +1.70, 2 of 3). All three judges'
fixes and grafts are in `VERDICTS-r31.md`; read it, `BRIEF-r31.md`
(ownership, performance, traps) and the three builds' notes at its end. The
other thirteen wings were proven pixel-identical after the merge (seeded
sweep, max difference 1): keep them so.

Losers' branches: `ui/r31-rooms-c` (SAFFLOWER: won the Passages and the Hedge
Maze -- its fine clipped hedge, benches and urns, the closet lit both sides,
the kitchen's baskets, the passage runner's lozenge border) and
`ui/r31-rooms-a` (MANGANESE: the cleanest passage panel moulding, ball
topiaries in square planters, the cleanest chapel masonry). PORT ideas onto
dev's tip; do not merge either.

## 0. FIRST: the frame budget

Measured after the merge, `tools/gpuprof.py --wait 40 --settle 6`, medium tier,
three interleaved runs, `dd58f1f2` (BASE) vs `9bba05dc` (HEAD), T_full median:

| wing | BASE | HEAD | delta |
|---|---|---|---|
| Hedge Maze (hm-1) | 15.75 | 17.38 | **+1.62** -- well over 15.5 |
| Kitchens (kc-1) | 14.24 | 15.75 | **+1.51** -- over 15.5 |
| Passages (sp-1) | 10.01 | 10.86 | +0.85 |
| Graveyard (gy-1) | 16.45 | 16.77 | +0.32 (over at BASE already) |

HEMATITE's own note names the hedge cost: a second `wLobes` tap per hedge
pixel and a leaf tap near the camera. SAFFLOWER's hedge replaces it (item 1):
bring the Hedge Maze back to at most its BASE 15.75 ms, the Kitchens under
15.5 ms, and leave the Graveyard no worse than BASE -- keeping the look.

## The graft, in order (all three judges agree on 1-3)

1. **The Hedge Maze -- SAFFLOWER's hedge, wholesale.** Fine, small-leaf
   clipped leaf mass with lit tops and shadowed undersides, in place of
   HEMATITE's oversized chunky scales; close the black holes torn through the
   fountain court's back hedge (one swallows a statue niche) and the notches
   along the walk's left hedge top; remove the brown blotch on the maze's back
   wall. Dress the near lawn of all three rooms: SAFFLOWER's stone benches and
   urns on plinths, MANGANESE's ball topiaries in square planters; lift the
   near path out of black with a lantern spill.
2. **The Kitchens' floor.** Calm the heavy mottled grain on the lit flags so
   they read as worn, inked stone -- keep the warm/cool split, keep the darks
   deep. Carry the light through the lower third (a second warm pool or a
   near rug), light the scullery's near-left corner, and bring SAFFLOWER's
   wicker baskets of produce onto the near floor in front of the tables. In
   the fight, move the rug a touch upstage so its border clears the imp's
   nameplate, and keep the left basket clear of the hand at 1280.
3. **The Passages.** Light the LEFT panelled wall to match the right (a
   sconce or lantern pool, MANGANESE's crisp moulding); light the closet on
   both walls so its hanging coats read with colour and folds (SAFFLOWER);
   reduce the milky, blotchy grain on the lit planks either side of the
   runner so they read as crisp inked boards over a warm dark; SAFFLOWER's
   lozenge border on the runner; one prop (a side table or chest) each side
   of the near floor.
4. **The Graveyard.** Dress the bottom band below the near headstones in the
   plots and gate (a near stone, a flagged path end, a lantern pool with
   leaves); a near table tomb or cluster on the yard's empty near-left lawn;
   the chapel gable in crisp coursed masonry (MANGANESE's).

## Proof

- Before/after contact sheets of the four wings (BRIEF-r31's commands, into
  C:/UILOOP/r31/graft/), LOOKED at beside UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them before and
  after (the list in `docs/ui-pass/survey-2026-10-12.sh` minus your four).
- Performance: `tools/gpuprof.py --wait 40 --settle 6`, interleaved against
  `9bba05dc`, three runs, all four wings; none crosses 15.5 ms.
- Tests: dup-keys, shader-literals, combat-scene/seam, chrome, steam-deck and
  the four region gates. `python tools/endings_guard.py --base <your base>`
  prints ENDINGS OK. Commit as you go; stop only your own processes, by PID.
