# Round 28's graft — onto MAUVEINE's rooms

Round 28 merged MAUVEINE (`cad57a30`, +2.39, 2 of 2). Both judges named the
same grafts and fixes; they are in `VERDICTS-r28.md` in full. Read that file,
`BRIEF-r28.md` (its ownership, performance and traps sections hold), and the
three builds' notes at the end of `VERDICTS-r28.md`.

The losers' branches are `ui/r28-rooms-a` (NAPLES) and `ui/r28-rooms-c`
(TERREVERTE). PORT ideas from them onto dev's tip; do not merge either
branch. MAUVEINE's systems stay: the shared contact-shadow fix (DoubleSide)
and rule, the painted mansion from `house-still.webp`, its Passages far end.

## 0. FIRST: the Graveyard's frame (a regression the round introduced)

Measured after the merge, `tools/gpuprof.py --wait 40` at the Deck's medium
tier, interleaved, three runs, `71146686` (BASE) vs `cad57a30` (HEAD):

| wing | BASE T_full | HEAD T_full | delta |
|---|---|---|---|
| Graveyard (gy-1) | 17.3, 16.1, 16.6 | 25.4, 26.5, 26.9 | **+9.9 ms** |
| Pumpkin Grounds (pk-1) | 15.1, 17.2, 15.6 | 18.0, 18.1, 18.2 | **+2.5 ms** |
| Passages, Kitchens, Kennels, Study, Bathhouse | | | within noise |

The live rAF rate still reads ~60 because the render-scale governor (keep
it: Josh's rule) drops resolution to hold it -- so on the Deck the Graveyard
simply goes soft. Odd and worth reading first: on HEAD the Graveyard's
`T_noBloom` (15-20) and `T_noGrade` (14-19) are each ~10 ms under `T_full`,
while on BASE they sit within ~1 ms of it; and the wall piece grew 5.3 -> 7.5
ms. Suspects: the painted house's texture sampling and the inverse grade
(`mmGradeInv`), MAUVEINE's shared prop/shadow pass, or an interaction with
bloom+grade. Bisect with the piece toggles and the house uniform
(`uHouseTexOn`), on an idle GPU. Bring the Graveyard back to within 1 ms of
BASE and the Pumpkin Grounds to within 0.5 ms, keeping the look.

## The graft, in order

1. **The Passages (NAPLES, both judges):** ceiling beams receding to the far
   wall (NAPLES's ceilPattern 16 and its MM_FLOORX 2 ceil variant), and brass
   candle sconces repeated down BOTH side walls (NAPLES's `uSconce` / `pal.sconce`)
   so the walls stay lit to the far end. Remove the thin blue wire-like lines
   that run diagonally from the crates across the floor (judge 2). The far
   crates and lamp posts in the fight get value contrast and a contact shadow.
   The closet must be a different room from the passage: narrow, coats on
   hooks, shelving close in (judge 2).
2. **The Kennels (TERREVERTE, both judges):** shingled, weathered doghouse
   roofs; pet beds in different colours (green, red, pink); straw over the
   bare lower floor; contact shadows under every doghouse and bed; a shadow
   under each wash-room tub trestle; NAPLES's lit doghouse interior as a warm
   pool on the floor in front of it.
3. **The Kitchens (TERREVERTE + NAPLES):** warmer scrubbed-wood prep tables
   with a dark contact shadow under every leg and under the range; copper pans
   on the rail; the cold moonlit window and its blue pool on the floor against
   the range's fire (keep the walls dark, not lifted).
4. **The mansion (both judges):** sharpen its silhouette against the sky
   (roof lines, finials and turret tips crisp, not softened -- check the mip
   and filtering before redrawing anything); relight it into the moonlight in
   the Graveyard (cool stone, warm windows only) so it stops reading as a warm
   sticker; in the Graveyard's yard room bring it forward and larger so it
   holds the skyline as it does in the plots room; remove the hard-edged blue
   blotch right of it in the plots room.
5. **The Graveyard and Pumpkin Grounds' props (TERREVERTE):** moss and grime on
   the foreground headstones and crosses, each seated with a ground shadow;
   fallen leaves on the plots lawn; on the Pumpkin patch replace the faint
   green ring lines on the black lawn with a drawn dark turf, and ink the blobby
   lollipop trees beside the mansion into crisp silhouettes.

## Proof

- Before/after contact sheets of all five wings (the BRIEF-r28 commands,
  `--tier medium`), LOOKED at beside `UI/mainMenu.png`.
- The seventeen-room sweep (`tools/room_batch.py --regions all --tier medium`)
  before and after: the other twelve wings must be unchanged or better.
- Performance: `tools/gpuprof.py --wait 40`, interleaved against `cad57a30`,
  three runs, on the Graveyard, the Kitchens and the Passages. The graft must
  not make any of them slower by more than 0.5 ms.
- Tests: dup-keys, shader-literals, combat-scene/seam, chrome, steam-deck and
  the five wings' region gates plus tests/heart. `python tools/endings_guard.py
  --base cad57a30` prints ENDINGS OK.
- Wrap every capture in `timeout 180`. Commit as you go. Stop only the
  processes you started, by PID.
