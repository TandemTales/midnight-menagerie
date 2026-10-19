# Round 39's graft — onto RHODONITE's drawn objects

Round 39 merged RHODONITE (`ffacfa10`, +1.91 over the rooms before, 2 of 3
judges; J2 chose CHALCEDONY). The closest field yet: RHODONITE 6.59,
CHALCEDONY 6.49, PERIDOT 6.46, and every builder won screens -- PERIDOT the
Bathhouse and the fight 3 of 3, CHALCEDONY the Kitchens 3 of 3 and the
Lampworks. All judges' fixes and grafts are in `VERDICTS-r39.md`; read it,
`BRIEF-r39.md` (ownership, performance, traps) and the three builds' notes.
The merge also restored the velvet suite's walls (FXC had aborted that
program while ANGLE reported the link good): keep RHODONITE's fix for it.

Losers' branches: `ui/r39-rooms-b` (PERIDOT: the Bathhouse's crisp mirrored
reflections of the window arches, tubs and plants in the wet checker tile; the
pool room's warm-lit near apron with a towel bench; the wax room's tall
candle-drying rack; the kitchens' patterned rug; the ballroom's petals and
dropped fans) and `ui/r39-rooms-a` (CHALCEDONY: the kitchens' smaller, worn,
chipped-edge flags and its composition -- block and basket left, sacks right,
the centre open; the lampworks' massive drawered bench with lamps and
glassware; the bath bench with towels and a pail). PORT ideas onto dev's tip;
do not merge either.

## 0. FIRST: the frame budget -- MEASURE IT

The merge's A/B (a quiet machine, three pairs, BASE `8b813845` vs RHODONITE
`ff5598a0`, T_full ms): Lampworks 11.24 -> 13.00 (+1.6, +1.67, +1.77);
Ballroom 13.70 -> 14.61 (+0.91, one pair); Kitchens 10.95 -> 11.15 (+0.3, one
pair). **The Bathhouse could not be measured: BASE returned T_full None on
3 of 3 pages** (no UnrealEditor running) -- find out why before trusting any
number there (a GPU timer query failing on one program? check the program
info logs too). Measure all four wings against BASE on a quiet machine with
`drawW` checked, and keep every fight under 15.5 ms with what you add.

## The graft, in order

1. **The Bathhouse -- PERIDOT's wet tile** (all three judges, first): the
   crisp mirrored reflections of the window arches, tubs and plants in the wet
   checker tile, keeping RHODONITE's finer, darker tile tooth; PERIDOT's pool
   room with a warm-lit near apron and a towel bench in it; CHALCEDONY's bench
   with stacked towels and a pail as a near prop in all three rooms;
   RHODONITE's duckboards kept; a bench or tub in the near centre, not a lone
   drain.
2. **The Kitchens -- CHALCEDONY's flags and composition** (all three):
   smaller, worn, chipped-edge flags; a chopping block and basket forward at
   left, sacks at right, the centre kept open for the fight; PERIDOT's
   patterned rug enlarged to the mid-floor in both rooms; the sacks with lit
   volume, burlap weave, a tie and crisp seams -- not flat cut-outs.
3. **The Lampworks -- CHALCEDONY's bench** (all three): the workbench forward
   with a drawered base, oil lamps and glassware, its lamplight on the floor;
   PERIDOT's tall candle-drying rack in the wax room; the lampworks room's bare
   left near floor dressed; the boiler house's near band given a bench or
   crate pile; the wax room's light pool feathered; crate stencils inked as
   letters, not black blobs.
4. **The Ballroom -- keep RHODONITE's** (3 of 3 won it): its carved, damasked
   panels with oval medallions and the lit balcony; PERIDOT's scattered petals
   and dropped fans; a candelabrum or chair group with a warm pool in the near
   checker's centre; the salon's violet haze pool gone and one more near prop
   at lower left.
5. **The fight:** the Bathhouse fight in PERIDOT's wet-tile light (it won the
   fight 3 of 3).

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r39's commands, into C:/UILOOP/r39/graft/), LOOKED at beside
  UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them, before and
  after, back to back (twice if a wing differs: one build can differ from
  itself between runs).
- Performance: item 0's table re-measured on your tip against `ffacfa10` and
  `8b813845`, three pairs, all four wings, on a quiet machine.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates (bathhouse,
  lampworks, kitchens, ballroom). Read `gl.getProgramInfoLog` for the
  programs you change -- a good link can be an empty program.
  `python tools/endings_guard.py --base <your base>` prints ENDINGS OK. Commit
  after every item; stop only your own processes, by PID; captures in
  `timeout 600`.
- Say in your notes what you did NOT do.
