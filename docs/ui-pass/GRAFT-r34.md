# Round 34's graft — onto CELESTINE's drawn silhouettes

Round 34 merged CELESTINE (`8d00791f`, +1.28 over the rooms before) -- with
NO majority: each of the three judges named a different winner, and CELESTINE
took it head-to-head (3-2-1) and on Borda (34-30-26). So this graft matters
more than most: the two losers each won screens. All three judges' fixes and
grafts are in `VERDICTS-r34.md`; read it, `BRIEF-r34.md` (ownership,
performance, traps) and the three builds' notes at its end.

Losers' branches: `ui/r34-rooms-a` (VIVIANITE: won the HEDGE -- its rounder,
lumpy clipped leaf mass with lit domes and shadowed undercuts and its big
foreground topiary; the potting table with pots and a watering can in the
Greenhouse; the doghouses in their painted red / green / blue) and
`ui/r34-rooms-b` (GLAUCONITE: won the GREENHOUSE and the FIGHT -- tall drawn
ferns in urns in the conservatory's near corners and the fountain at its
back; the green chairs in the parlour's near corners and the warm pool along
its runner; glowing eyes in the kennels' dark stall gates). PORT ideas onto
dev's tip; do not merge either. GLAUCONITE's shared near floor (Study,
Ballroom, Heart) is NOT part of this graft.

## 0. FIRST: the frame budget

Measured on the winner before the merge, `tools/gpuprof.py --wait 40 --settle
6`, medium tier, three interleaved runs, BASE `39768613` vs CELESTINE
`ef9c37bb`, T_full median (ms). The machine was slow that day -- BASE itself
read over its recorded figures (Foyer 16.3, Hedge 15.47 after round 31) and
drifted upward over the hour -- so read the DELTAS:

| wing | BASE | HEAD | delta |
|---|---|---|---|
| Greenhouse (gh-1) | 16.42 | 18.83 | **+2.41 -- in every pair (2.4, 2.3, 2.8)** |
| Kennels (kn-1) | 13.94 | 15.84 | +1.91 median; pairs +0.1, +1.9, -0.5 |
| Hedge Maze (hm-1) | 18.00 | 18.45 | +0.45; pairs -1.0, +1.4, +1.7 |
| Foyer (foyer-14) | 17.05 | 17.10 | +0.05 |

The Greenhouse's cost is real (CELESTINE's own note: "36 dealt in the
glasshouse", the planting's fans). Bring the Greenhouse back to at most BASE,
keeping the planted look; re-measure the Kennels and Hedge interleaved and
leave neither worse than BASE. Check `tasklist` for games first (Josh plays
on this machine), and measure all four wings again at the end.

## The graft, in order

1. **The Hedge -- VIVIANITE's leaf mass** (it won the Hedge 2 of 3, and J3's
   first graft): its rounder, lumpy clipped tops with lit domes and shadowed
   undercuts in all three Hedge rooms, in place of CELESTINE's tall pointed
   mounds ("crags or a mountain range", J1; "flame/stalagmite spikes", J2) --
   keeping CELESTINE's stronger lit-top / dark-base split (J1) and its dark
   feet. VIVIANITE's big foreground topiary at the maze's near right; the
   topiary as leaf clumps, not stacked discs (J2). **All three judges:** light
   and dress the near lawn either side of the path in all three rooms -- a
   lantern pool or moonlit turf, a clipped turf edge along the path, a prop in
   each near corner; the bottom third is "still a dark empty field". Break the
   maze back hedge's long straight lower edge with a root shadow and gaps (J1).
2. **The Kennels -- keep CELESTINE's, coloured** (it won 3 of 3): its row of
   doghouses, crisp boarding, lit straw and haze-free stall wall, but with
   VIVIANITE's painted red / green / blue on the doghouses (ALL THREE judges:
   desaturated, they "read as one repeated prop"). Clear the haze from the
   upper back wall up to the windows (J1, J2). GLAUCONITE's glowing eyes in
   the dark stall gates (J2). The trestle wash tub out of the kennel room
   (J1); the wash room's cut-off easel staged or gone (J2); a bed or bowl in
   the centre foreground (J3).
3. **The Greenhouse** (GLAUCONITE won it): GLAUCONITE's tall drawn ferns in
   urns in the conservatory's near corners and the fountain at its back (J1,
   J2); VIVIANITE's potting table with pots and a watering can in the near
   floor of the conservatory and the palm house (J2, J3); the conservatory's
   back beds raised into a full, lit mass (J1); the palm house's black
   near-left carried into the light, a pot or watering can in it (J2). Within
   item 0's budget.
4. **The Foyer** (CELESTINE won it): keep its inked diamond-and-ring runner
   (all three); GLAUCONITE's green chairs in the parlour's near corners and
   the warmer pool along the runner (J1, J2), each chair on contact shadows
   under its legs, not a detached puddle (J3); a light or a prop in the
   gallery's near-left black hole (J1); the parlour's open door leaf given
   mouldings and lit edges and cropping less of the room (J2).
5. **The fight (all three):** a warm light pool on the floor between the Kid
   and the enemies, so they stand on a lit stage; the runner's pattern
   reading at 1280 between the nameplates and the hand, quieter behind the
   nameplates (J2, J3); any foreground chair clear of the Companion panel and
   the filigree (J3).

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r34's commands, into C:/UILOOP/r34/graft/), LOOKED at beside
  UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them before and
  after (the list in `docs/ui-pass/survey-2026-10-16.sh` minus your four).
- Performance: item 0's table re-measured on your tip, interleaved against
  `8d00791f` AND `39768613`, three runs, all four wings.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates (foyer,
  greenhouse, kennels, hedge-maze). `python tools/endings_guard.py --base
  <your base>` prints ENDINGS OK. Commit as you go; stop only your own
  processes, by PID.
- Captures while anything else holds the GPU slot need `timeout 600` (the
  builders lost fights to "Target crashed" at 180).
- Say in your notes what you did NOT do.
