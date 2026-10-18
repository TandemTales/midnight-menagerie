# Round 35's graft — onto ANTHRACITE's near floor

Round 35 merged ANTHRACITE (`315f052e`, +1.73 over the rooms before, 2 of 2
judges). SCHEELITE was a close second (6.21 against 6.28) and won the
Sleeping Quarters and the Crypt outright; SODALITE split the Graveyard. All
judges' fixes and grafts are in `VERDICTS-r35.md`; read it, `BRIEF-r35.md`
(ownership, performance, traps) and the three builds' notes.

Losers' branches: `ui/r35-rooms-a` (SCHEELITE: the lit ribbed vault in the
crypt, the dormitory's tall iron bedheads with ring motifs and ball finials
and triangle-pieced quilts, skeleton grave mounds and a near candelabra, the
attic's near floor with a trunk left and a crate and armchair right, the
toy chest and teddy) and `ui/r35-rooms-c` (SODALITE: the chapel's gabled
timber porch with a lantern, buttresses with set-offs, hood mould and quoins;
the carved, grimed sarcophagi with quatrefoils; the greener, darker turf).
PORT ideas onto dev's tip; do not merge either.

## 0. FIRST: the frame budget

Measured on the winner before the merge: `tools/gpuprof.py --wait 40 --settle
6` through `tools/on_port.py`, medium tier, three interleaved pairs, BASE
`46c95755` vs ANTHRACITE `7e221984`, a QUIET machine (every page drew at 1280,
the pairs agree), T_full median ms:

| wing | BASE | HEAD | pairs |
|---|---|---|---|
| Graveyard (gy-1) | 15.13 | **15.51** | +0.27, +0.49, +0.39 -- **at the 15.5 line** |
| Sleeping (sq-1) | 11.16 | 13.95 | +2.60, +2.91, +2.51 |
| Crypt (cr-1) | 9.17 | 11.13 | +2.33, +2.03, +1.88 |
| Attic (ao-1) | 10.76 | 12.15 | +1.22, +1.52, +1.40 |

Bring the Graveyard back to at most BASE (15.13), keeping the look. Check
first whether work is done where it is thrown away (round 34's Hedge: the
painted sky ran the whole yew face only to be mixed away by `mix(sky, col,
0)`; `tools/shapeprof.py` hides one prop group at a time inside one page).
The other three stay under 15.5 with what you add: re-measure all four at
the end. gpuprof does not pin the render-scale governor: check `drawW` in
its output and drop pages it shrank.

## The graft, in order (both judges agree on 1-5)

1. **The Crypt -- SCHEELITE's lit ribbed vault** in all three rooms, in place
   of the black ceiling band (both judges' first graft); SODALITE's darker,
   grimed sarcophagi with carved quatrefoil panels (both); SCHEELITE's
   skeleton grave mounds and near candelabra in place of the "flat
   stick-bones" (J1); the sepia-orange / ochre haze pulled off the near flags
   so the stone reads dark and crisp under the candle pools (both).
2. **The Sleeping Quarters -- SCHEELITE's iron beds:** tall bedheads with
   ring motifs and ball finials, inked crisp, and triangle-pieced quilts with
   folds (both), in place of the "thin, soft, barely inked" rails and "flat
   checker squares"; the toy chest and teddy at the bedroom bed's foot
   (both); the cold blue wash on the dormitory's right near floor cut (both).
3. **The Graveyard -- SODALITE's chapel:** the gabled timber porch with a
   hanging lantern, darker stone, the eaves line and buttresses (both); drawn
   ivy leaves, not "dotted green ivy noise" (J2); the greener, darker turf
   with a warm lamp pool by the cross tomb (J2); the lower-right near turf
   given a lit path edge, inked kerbs and a turf lip -- dark green with an
   edge, not black (both); the pale left table tomb carved and grimed (J2).
   Within item 0's budget.
4. **The Attic:** one warm candle pool or a hard-edged cool moon pool in
   place of the blue / purple / orange wash lying across the near boards
   (both); a strapped trunk or slatted crate in the bottom fifth (J1;
   SCHEELITE's trunk left, crate and armchair right); the library's dust
   sheet given folds, a draped hem and a darker tone (J2).
5. **The fight (both):** a lit turf edge either side of the path behind the
   hand and a few fallen leaves where the path meets it, so the near
   headstones and the Celtic cross sit on lit ground.

## Proof

- Before/after contact sheets of the four wings and the fight at both sizes
  (BRIEF-r35's commands, into C:/UILOOP/r35/graft/), LOOKED at beside
  UI/mainMenu.png.
- The other thirteen wings unchanged: a SEEDED room_batch of them before and
  after, back to back (runs of one build hours apart can differ by
  thousands of px; a back-to-back pair is the proof).
- Performance: item 0's table re-measured on your tip against `315f052e`
  and `46c95755`, three pairs, all four wings.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals, link-queue,
  combat-scene/seam, chrome, steam-deck and the four region gates
  (attic-observatory, sleeping-quarters, graveyard, crypt). `python
  tools/endings_guard.py --base <your base>` prints ENDINGS OK. Commit after
  every item; stop only your own processes, by PID; captures in `timeout
  600`.
- Say in your notes what you did NOT do.
