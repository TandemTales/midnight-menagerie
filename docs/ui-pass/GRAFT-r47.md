# Round 47's graft — onto RUTILE's rooms

Round 47 merged RUTILE (2 of 2 judges, +1.01; `4c91190d`). TANZANITE won the
Kennels and the Bathhouse sheets on near-floor dressing; SPESSARTINE won the
fight on its weathered doghouses. All the judges' fixes and grafts are in
`VERDICTS-r47.md`. Read it, `BRIEF-r47.md` (ownership, traps, the five
screens' capture commands) and `BRIEF-r45.md`'s rule (**never fewer objects;
never a smoother or tidier surface**).

Losers' branches: `ui/r47-rooms-a` (SPESSARTINE: the flaked doghouse paint
over grey timber, the bathhouse's inked grout and window-pane moon grids, the
hedge's russet dead patches and gaps, the attic hatboxes and rolled rug) and
`ui/r47-rooms-c` (TANZANITE: `wgYardSD`/`wgYardPaint` -- the trough, the
bales, the wash corner; the attic's hatboxes and rolled rug on shape 36; the
hedge's leaf-litter verges on MM_PAT 13; the urn on the near lawn; the
bathhouse wash corners). PORT ideas onto dev's tip; do not merge either.

## The graft, in order (VERDICTS-r47's list)

1. **TANZANITE's near floors in every room**, each object standing in a lit
   pool with a contact shadow:
   - the kennel range: the trough on trestles, the bales and the hay fork;
   - the wash room: a stool with towels, a pail and bales;
   - the Bathhouse: the towel rack, a stool and a bucket in the hall and the
     steam room, the stool at the pool's near rail;
   - the Attic: the hatboxes and the rolled rug, below the rug;
   - the Hedge: the urn on the near-left lawn, and the leaf-litter verges
     along the path in all three hedge rooms.
   RUTILE already placed a trough and bale. Keep the better drawn of the two,
   not both in one spot. The bales need drawn straw ends and twine. The
   hatboxes and rug need inked texture, NOT TANZANITE's low-res plaid.
2. **SPESSARTINE's weathered doghouses:** flaked paint over bare grey boards,
   worn edges, darker shingles, layered on RUTILE's muted oxblood, bottle and
   Prussian. Tone it down so it reads as worn paint, "not camouflage blotches".
3. **The Bathhouse floor:** SPESSARTINE's dark inked grout and its moonlight
   as hard window-pane grids on the tiles, and the steam room's lower third
   crisp. Also a moon glint on the water and the rim highlight on EVERY tub,
   not only the nearest.
4. **The Hedge:** SPESSARTINE's russet dead patches and gaps layered onto
   RUTILE's clumps (following the clumps), plus a dark inked line where each
   hedge meets the lawn. **The hedge prop program must not grow** (its link
   is ~14-15 s on this machine in BASE already). Put new hedge work in the
   wall program or on the floor (MM_PAT 13), as SPESSARTINE and TANZANITE did.
5. **The Attic library:** its moon rectangle a hard shaft with mullion
   shadows on dark boards.
6. **fight-kennels:** the green doghouse behind the Kid sharpened at fight
   scale (board lines and edges, not a soft green mass).

## Proof

- Before/after captures of BRIEF-r47's five screens at both sizes (its
  commands, into D:/UILOOP/r47/graft/), LOOKED at.
- **Frame budget:** every new near-floor piece in the hand band is
  `hand: true` (culled in fights) as RUTILE and TANZANITE did, unless it
  stands above the hand's top edge. Run linkprof `--only prop` interleaved
  against `4c91190d` (two pairs) for the four wings. gpuprof kn-1 / hm-1
  interleaved against `4c91190d` ONLY when `tasklist` shows no UnrealEditor;
  if Unreal is up, say so and do not report numbers as real.
- Tests (via `tools/on_port.py PORT`): dup-keys, shader-literals,
  link-queue, combat-scene/seam, chrome, steam-deck, kennels, hedge-maze,
  attic-observatory, bathhouse. Read `gl.getProgramInfoLog` for every program
  you change. `python tools/endings_guard.py --base 4c91190d` prints ENDINGS
  OK. Commit after every item; stop only your own processes, by PID; captures
  in `timeout 600`.
- Say in your notes what you did NOT do.
