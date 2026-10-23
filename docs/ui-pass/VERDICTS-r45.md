# Round 45 — verdicts: the props in the Lampworks, Kitchens, Bathhouse and Hedge

Base `69298dfb`. CREPE is the baseline. Builders: HOWLITE (`ui/r45-rooms-a`,
LITERAL), LARIMAR (`-b`, MATERIAL FIRST), AXINITE (`-c`, GROUND THE ROOM).
All finished in one run; two blind judges (`wf_66d89c85-d13`), both chose
AXINITE.

## Scores (mean of two judges; the fight at both sizes)

| screen | AXINITE | LARIMAR | HOWLITE | CREPE | winner |
|---|---|---|---|---|---|
| sheet-lampworks | 6.85 | 6.25 | 6.45 | 5.10 | AXINITE (2 of 2) |
| sheet-kitchens | 5.90 | 6.60 | 6.15 | 4.80 | LARIMAR (2 of 2) |
| sheet-bathhouse | 5.70 | 6.05 | 5.75 | 5.40 | LARIMAR (2 of 2) |
| sheet-hedge | 6.50 | 5.90 | 6.15 | 5.35 | AXINITE (2 of 2) |
| fight-lampworks | 7.05 | 6.75 | 6.75 | 6.20 | AXINITE (2 of 2) |
| **mean** | **6.40** | 6.31 | 6.25 | **5.37** | |

**AXINITE wins, 2 of 2 judges, +1.03**, the three within 0.15: "Its
Lampworks crates are the only ones with real side faces, nails and slats, its
lantern has a globe and a flame, and its hedge walls hold their leaf texture
on the oblique faces" (J2). AXINITE found the Hedge's streaks were a
projection fault: the leaf, crown and twigs were laid in the side wall's own
metres, so each spray stretched into a vertical streak toward the far end;
the coordinate along a side wall is now `d*(1+ln(s/d))`. CREPE "is the
pale-placeholder build: flat crates, a blown-out lantern and grey sacks".

## AXINITE's defects

- **The Kitchens** (both): "the tall right flour sack is drawn
  semi-transparent: the sack behind and the floor show through"; the spilt
  vegetables lie "in a single straight caterpillar row"; the near-right floor
  empty.
- **The Bathhouse** (both): "the near-right tubs are a pale milky tan with the
  towel drawn see-through over the tub wall"; the green capsule tub behind the
  bench still a capsule (LARIMAR's too).
- **The Lampworks** (both): the crates "look freshly built" -- no straw, the
  stencils crisp and new; at 1280 the crates behind Bones need light.
- **The Hedge** (both): the lamp-lit near left wall washes "to yellow-olive" /
  "a pale beige wash" -- keep its dark green.

## THE GRAFT — what the judges ask for

1. **The Kitchens -- LARIMAR's sacks** (both): opaque burlap with a tied neck,
   spilling flour and a wheat-sheaf roundel (fixes the see-through sack);
   HOWLITE's burlap weave, XXX stencil, the crock with a painted '3' and the
   dark glazed jug; LARIMAR's crate of apples and spilt potatoes, the
   vegetables in a loose fan; the near-right floor dressed (HOWLITE's apple
   crate); a contact shadow under each.
2. **The Bathhouse -- LARIMAR's copper** (both): warm lit hammered copper with
   a thick rolled rim and a hard specular line; towels opaque, draped over the
   rim with a fold and shadow; the green capsule tub drawn with a rim, claw
   feet and a contact shadow; HOWLITE's towel on the pool's lone tub; no milky
   smear on the steam room's green tub.
3. **The Lampworks -- HOWLITE's packing** (both): straw poking from the crate
   tops, a paper shipping label, the stencils worn; HOWLITE's lantern wire cage
   and flame; the crates lit enough to read at 1280, deeper contact shadows.
4. **The Hedge:** the near lamp-lit wall back to dark green; HOWLITE's dead
   twigs standing from the right wall's torn crowns.

## Builders' notes, in short

- **AXINITE** (`03b262f8`, 7 commits): the Hedge projection
  (`hedgeWallH`, MM_ROOMS 8); the crates with side faces, nails, slat gaps,
  contact shadows, one crate painted per pixel (the Lampworks prop link 14.2
  -> 8.2 s). Perf: hm-1 -0.04, lw-1 about +0.5 (~14.5, the last commit
  unmeasured), kc-1 about 0, bh-1 about +0.3 ms. Did not read program logs
  directly.
- **LARIMAR** (`61c9ec87`, 4 commits): deal crates, burlap sacks, copper
  gloss; lw-1 +0.1, bh-1 +0.3, hm-1 +0.13 (noise).
- **HOWLITE** (`00e47348`, 6 commits): built crates (`wgLcFace`) with straw in
  the gaps; lw-1 +0.36, the rest about 0.
