# Round 43 — verdicts: the Hedge, the Attic, the Crypt, the Bathhouse

Base `b0ca54da`. TARLATAN is the baseline. Builders: ZINCITE
(`ui/r43-rooms-a`, LITERAL), BENITOITE (`-b`, THE OBJECT DRAWN), CUPRITE
(`-c`, LIGHT THE FLOOR, THEN FILL IT). All finished in one run; three blind
judges (`wf_52b6773a-ba9`): J1 and J3 chose CUPRITE, J2 BENITOITE.

## Scores (mean of three judges; the fight at both sizes)

| screen | CUPRITE | BENITOITE | ZINCITE | TARLATAN | winner |
|---|---|---|---|---|---|
| sheet-hedge | 5.67 | 6.10 | 6.13 | 4.60 | BENITOITE (2 of 3) |
| sheet-attic | 6.67 | 6.13 | 6.10 | 4.57 | CUPRITE (3 of 3) |
| sheet-crypt | 6.13 | 5.93 | 6.23 | 4.27 | ZINCITE (2 of 3) |
| sheet-bathhouse | 6.47 | 6.27 | 5.60 | 4.63 | CUPRITE (3 of 3) |
| fight-crypt | 6.53 | 6.57 | 6.20 | 5.23 | CUPRITE (2 of 3) |
| **mean** | **6.29** | 6.20 | 6.05 | **4.66** | |

**CUPRITE wins, 2 of 3 judges, +1.63** -- "the most drawn objects and the
best-lit near floors: the moon-window shadow in the attic, pane-shaped window
light and varied tubs (one green tub overturned) in the bathhouse, and
headstones, skulls and candle ledges in the crypt" (J1); "its own moon-phase
rug, and moonlight through the round window throwing mullion shadows across a
lit near floor" (J3). TARLATAN "fell into every trap the brief names" (J2).
No candidate fits between the samples.

## CUPRITE's defects

- **The Hedge's back wall** (all three): "still ruler-straight; only the near
  end walls are ragged"; the fountain court's whole back wall too (J3).
- **The Crypt's grave kerbs** (J1, J3): "glow an even cream like lightboxes"
  / "a flat emissive yellow strip"; the headstones "lean as flat tilted
  tablets"; the three crypt rooms repeat the same two graves (J3); the
  skeletons are flat sticker outlines (J3); the catacomb vault's crown black
  (J1).
- **fight-crypt** (J1, J3): the two broken headstones crowd the Loose
  Tibia's lane and nameplate at 1280.
- **The Attic** (J1, J3): the moon shadow goes flat lavender and milky at the
  far left; the main trunk too small for the moonlit boards.
- **The Bathhouse** (all three): the sheeted tub a pale blob; the pool's near
  floor and left edge fall to black; the near tiles a busy patchwork (J3).

## THE GRAFT — what the judges ask for

1. **The Hedge -- BENITOITE's tops with ZINCITE's withered gaps** (all
   three): BENITOITE's undulating leafy profile along EVERY wall incl. the
   back walls and the fountain court's (without its topiary stripe
   artifacts), ZINCITE's withered notches with bare dead twigs.
2. **The Crypt -- ZINCITE's graves and headstones** (all three): upright
   broken headstones with carved inscriptions on bases, a skull at the kerb;
   kerbs as lit stone (light top, dark inner face), never emissive; each room
   its own layout -- BENITOITE's slid-off slab with a carved cross in one,
   sarcophagi forward in the family vault, bone-filled pits in the ossuary;
   shaded bones with volume; the vault's crown lifted so its ribs read; keep
   CUPRITE's skull-and-candle ledges.
3. **fight-crypt:** the headstones out of the enemy's lane (at least one
   enemy-width), the graves' insides lifted so they read as graves (J2).
4. **The Attic:** BENITOITE's crisp teal strapped trunk and ZINCITE's second
   blue-strapped trunk, whole, at more than one depth, the main trunk larger;
   warm lamp light at the left breaking the moon shadow; BENITOITE's larger,
   nearer moon-border rug in the library; the draped chair given a silhouette
   and contact shadow, an object on the library's near-right floor.
5. **The Bathhouse:** BENITOITE's long traceried window shafts and hammered
   copper tubs and a tipped white tub, with CUPRITE's metals and overturned
   tub; the sheeted tub with feet, rim and drape folds; the pool's near floor
   lit and dressed (towel rack, a second tub, a bucket); the near tiles one
   laid pattern.

## Builders' notes, in short

- **CUPRITE** (`5ab0304f`, 7 commits): the graves cut into the floor as kerbed
  cists (`MM_FLAGK 2`, `grvFloor`, `uGrave[2]` fed from near items' `grave`
  key); shape 59.25 as a broken carved ledger. Perf, 3 pairs, cr-1 +0.06
  (10.28 vs 10.11-10.47); hm-1 about +0.2 (14.55); ao-1 +0.5; bh-1 +0.5 ms
  (one pair each). Every program in its wings under 12 s; every log read.
- **BENITOITE** (`900255ea`, 7 commits): ray-traced graves (`MM_RUGK 8`), the
  nearer slab lifted askew with a cross; the vault BUILT as a barrel; the
  turf mixed deeper green. hm-1 15.21-15.48 (closest to the line; it removed a
  lawn-wide leaf scatter for it).
- **ZINCITE** (`750bc766`, 4 commits): `MM_GRAVE` with dressed kerbs and an
  inked skeleton; the ledger stone propped at the head. cr-1 +0.43 ms.

Note: every builder added a `uGrave[2]` UNIFORM for grave positions --
positions, not a room or shape choice, so the #define rule is kept.
