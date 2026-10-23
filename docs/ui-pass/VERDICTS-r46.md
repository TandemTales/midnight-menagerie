# Round 46 — verdicts: the boards (the run strip, the last web controls, the atlas, rest, event, gameover)

Base `2fb1dc4f`. MOIRE is the baseline. Builders: CHAROITE
(`ui/r46-boards-a`, LITERAL), SUGILITE (`-b`, THE OBJECTS FIRST), KUNZITE
(`-c`, READ IT ON THE DECK). All finished in one run; three blind judges
(`wf_058db8f8-9ab`), each a different winner (J1 CHAROITE, J2 KUNZITE, J3
SUGILITE); SUGILITE on head-to-head and Borda (44 / 41 / 37).

## Scores (mean of three judges, each screen at both sizes)

| screen | SUGILITE | CHAROITE | KUNZITE | MOIRE | winner |
|---|---|---|---|---|---|
| hud-late | 6.27 | 6.70 | 7.00 | 5.53 | KUNZITE (2 of 3) |
| settings | 7.30 | 7.30 | 6.90 | 6.67 | SUGILITE (no majority) |
| piles | 7.53 | 6.97 | 7.13 | 6.23 | SUGILITE (3 of 3) |
| atlas | 7.27 | 7.73 | 6.40 | 6.20 | CHAROITE (3 of 3) |
| rest | 7.07 | 7.47 | 7.20 | 5.83 | CHAROITE (2 of 3) |
| event | 7.23 | 6.80 | 7.40 | 5.93 | KUNZITE (2 of 3) |
| gameover | 7.43 | 7.17 | 7.33 | 6.13 | SUGILITE (3 of 3) |
| **mean** | **7.16** | 7.16 | 7.05 | **6.08** | |

**SUGILITE merged, +1.08** (no majority; CHAROITE equal on mean): "the most
material in the settings and piles interiors, brass and enamel controls in
place of the old web widgets, the crispest inked blanket fort, clean event
slips and a readable gameover ledger" (J3). Every build shows all ten
Keepsakes and eight Gear at 1280 now.

## SUGILITE's defects

- **hud-late** (all three): the medallions "piled into a two-row overlapping
  clump ... that pokes above and below the strip".
- **rest at the default size** (J3): "the 'Sit with your Companion' row's
  bottom frame runs under the 'Pack up and go on' bar" -- a collision.
- **settings** (all three): the palette names "little flat tab chips under
  the enamel medallions".
- **atlas** (J1, J3): the ghost plans "so faint ... labels float over what
  looks like empty brown".
- **gameover at 1280:** the Final Tricks ledger's two-line names break row
  height (J2); no ruled gutters (J3).

## THE GRAFT — what the judges ask for

1. **The run strip -- KUNZITE's:** one row of full-size, slightly overlapped
   Keepsake and Gear medallions inside the rails (each face at least 70%
   visible), the stat labels as engraved small caps on the strip (no ruled
   boxes), "THE FOYER · WING 1" on one line.
2. **rest -- CHAROITE's:** the option rows framed by filigree medallion
   niches, no collision with the footer bar at either size; both blankets of
   the fort inked and opaque where the moonbeam crosses.
3. **The atlas -- CHAROITE's:** dense inked ghost floor plans (room grids
   visible through the hatch) in every unsurveyed wing, darker than the paper
   and finer, the surveyed Foyer still the brightest thing.
4. **event:** CHAROITE's torn parchment edge and a cast shadow on each choice
   slip, KUNZITE's larger risk/gain words and its moonlight as window-pane
   patches on the floor (not CHAROITE's crossed V bands).
5. **gameover:** KUNZITE's "As far as we got" strip as the six wings I-VI
   with the reached wing ringed (drawn in SUGILITE's style); SUGILITE's larger
   left-column lists kept; the ledger with ruled gutters and fixed row heights.
6. **settings:** each palette medallion joined to a gold-edged cartouche
   nameplate (MOIRE's), the chosen one a filled enamel plate with a gold pip;
   CHAROITE's damask in every panel interior.
7. **piles:** the brass search plate with an engraved bevel and an inset slot
   for the text; the 'Sorted alphabetically' note readable at 1280.

## Builders' notes, in short

- **SUGILITE** (`32451ba6`, 9 commits): two staggered rows of tinted
  medallions; brass and enamel controls; damask interiors.
- **CHAROITE** (`684b5af9`, 4 commits): fanned medallions at 25 px / 16 px
  step, word-over-figure cells; ghost plans; filigree niches.
- **KUNZITE** (`0363dd1d`): one row of medallions, stacked labels; the I-VI
  wing strip; pane-shaped moonlight.
