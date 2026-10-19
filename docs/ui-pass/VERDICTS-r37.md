# Round 37 — verdicts: the last four rooms and their near floor

Base `f138b951`. TULLE is the baseline. Builders: TOURMALINE
(`ui/r37-rooms-a`, LITERAL), BERYL (`-b`, THE NEAR FLOOR FIRST), CARNELIAN
(`-c`, THE OBJECT DRAWN). All finished in one run; three blind judges
(`wf_9d1cae89-c9a`): J1 and J3 chose BERYL, J2 CARNELIAN.

## Scores (mean of three judges)

| screen | BERYL | CARNELIAN | TOURMALINE | TULLE | winner |
|---|---|---|---|---|---|
| sheet-heart | 5.93 | 6.13 | 6.20 | 3.83 | TOURMALINE (2 of 3) |
| sheet-nursery | 6.47 | 6.00 | 5.67 | 3.73 | BERYL (3 of 3) |
| sheet-study | 6.17 | 6.53 | 5.70 | 3.80 | CARNELIAN (3 of 3) |
| sheet-pumpkin | 6.33 | 5.93 | 4.93 | 3.70 | BERYL (2 of 3) |
| fight-heart | 6.50 | 5.97 | 6.60 | 5.27 | BERYL (2 of 3) |
| **mean** | **6.28** | 6.11 | 5.82 | **4.07** | |

**BERYL wins, 2 of 3 judges, +2.21 over the rooms before** -- the largest
gain of the rooms rounds. "It dresses its near floors more than the others
(candle clusters, toys on the rug, jack-o-lanterns on lit flagstones, a lit
courtyard wall with ivy and niches) and keeps its darks rich, not milky"
(J1). Its defect, all three: "black bands keep cutting its floors between
the back wall and the near dressing" (J2). Everyone's statues are still
"pale and flat-shaded".

## THE GRAFT — what the judges ask for

1. **The Heart -- TOURMALINE's candlelit floor** (all three): its tall tiered
   candelabras on the near floor each casting a warm pool, the runner bright
   red to the bottom edge in all three rooms, the light reaching the near
   edge of the frame; kept inside the 1280x800 frame and out from behind the
   Bones panel and the discard pile in the fight (J1). CARNELIAN's stone urns
   on plinths and a stone bench as near props (J3), the bench carved, not a
   flat slab (J2). The statues (all three): carved folds, faces, a dark shaded
   side and cast shadows on the plinths -- not pale grey cutouts (BERYL's
   `statueModel` and CARNELIAN's veiled modelling are the two starts).
2. **The Study -- CARNELIAN's composition** (all three): the even warm floor
   light across library and fireplace, a wingback and book stacks flanking a
   centred rug, the floor lit to the bottom edge -- scaled so the wingback does
   not crowd the frame edge (J3); BERYL's filled diamond-lattice rug pattern
   in place of CARNELIAN's plain red field (J2); the black stripe between the
   shelves and the rug lit, and the cold blue-grey wash behind the desk
   warmed from the green lamp (J1, J2, J3).
3. **The Nursery -- keep BERYL's toy scene** (J2): the patterned rug with
   blocks, a ball, the toy chest and teddy, the big foreground rocking horse;
   CARNELIAN's braided oval rug in the WARDROBE at least, so the two rooms do
   not share the study's rug (J1); TOURMALINE's toy chest and teddy at the
   wardrobe's near-left and a dress form at right (J1, J3); the fire's glow
   carried below the rug, one more toy in the bottom quarter (J1).
4. **The Pumpkin Grounds -- keep BERYL's courtyard** (J2): the bare, inked,
   branching trees and the ivy swags between lit niches; CARNELIAN's brighter
   niches and a big jack-o'-lantern cropped at the frame edge as a repoussoir
   (J3); the pond's moonlight carried to the near flags and across the water
   (J1, J3); the courtyard's near-left flags kept deep blue-black, a highlight
   on their edges only (J2).
5. **The fight (all three):** a warm pool on the floor between the Kid and the
   hand and right of the Memory Animal; the runner's contrast and warmth up
   under the creatures.

## Builders' notes, in short

- **BERYL** (`338abae1`, self 7): round 31's nearFloor rule in all four
  wings; props placeable in eye metres (`ahead`, `across`) so they stay in
  their pools; `pal.cineFloor` (how much the cinematic key reaches the floor:
  the Nursery's lavender haze, the courtyard's milky moon wash);
  `nearFloor.rugGain` / `rugGul` (a lattice rug); `pal.statueModel` (Heart
  only); `pal.fitGain` (the Study's chandeliers); `props.shapeW`. Each applies
  only where a room writes it.
- **TOURMALINE** (`61bdb57a`, self 7.2): a dyed runner to the frame's foot;
  shape 85 hcCandles, brass prickets with eight burning candles and their
  pools (Heart only); statues carved deeper with `stCarve()`; the right bay
  lamp moved to light the right wall; shape 86 wfBlocks, a second rocking
  horse; the wardrobe given its own dressing. 13-wing sweep 0 px.
- **CARNELIAN** (`569dd786`, self 7): the statues as veiled mourners with
  modelling after the prop ceiling (Heart only); an oval braided rag rug (new
  floor branch); the courtyard wall's lit brick, coping, niches and ivy,
  branching crowns; the study's even warm floor with a wingback and book
  stacks.

Performance, the seventeen-room sweep and the battery: see `GRAFT-r37.md`.
