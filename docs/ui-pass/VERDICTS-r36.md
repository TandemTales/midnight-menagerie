# Round 36 — verdicts: the last web controls and the crowded hand

Base `b3cccaad`. SATEEN is the baseline. Builders: SAPPHIRINE
(`ui/r36-controls-a`, LITERAL), KYANITE (`-b`, THE HAND FIRST), OBSIDIAN
(`-c`, OBJECTS, NOT WIDGETS). All finished in one run; two blind judges agreed
on the winner (`wf_409a68b6-0be`), no tiebreak.

## Scores (mean of two judges, each screen at both sizes)

| screen | KYANITE | OBSIDIAN | SAPPHIRINE | SATEEN | winner |
|---|---|---|---|---|---|
| settings | 7.50 | 7.40 | 7.00 | 6.00 | KYANITE (no majority; head-to-head) |
| lobby | 7.90 | 7.50 | 7.10 | 6.20 | KYANITE (2 of 2) |
| shop | 6.85 | 7.65 | 7.15 | 5.40 | OBSIDIAN (2 of 2) |
| piles | 7.25 | 7.55 | 7.15 | 5.50 | OBSIDIAN (2 of 2) |
| combat-crowd | 7.90 | 6.90 | 6.75 | 5.85 | KYANITE (2 of 2) |
| **mean** | **7.48** | 7.40 | 7.03 | **5.79** | |

**KYANITE wins, 2 of 2 judges, +1.69.** Both: "the only consistent stacking
of duplicates in the nine-card hand, with every title readable at 1280 and the
fan clear of the Companion panel and the Nerve dial" (J1); J2 chose it over
OBSIDIAN (which won three screens) "because its weak spot, the shop's missing
press point, is a small graft, while OBSIDIAN's weak spot is the core fight
screen: inconsistent stacking and clipped rules text."

## THE GRAFT — what both judges ask for

1. **The shop's press point (both, first):** KYANITE shows BUY only on the
   ware under the pointer or holding focus, so a board nobody has touched --
   every still capture, and a pad player's first look -- shows price tags and
   no way to buy. Take OBSIDIAN's rule: one ware is always "in hand" (the
   first affordable Trick until the pointer or focus moves) and its BUY plate
   sits BESIDE its hanging tag, never over the price (SAPPHIRINE's medallion
   hid half of a "62"). OBSIDIAN's tags on strings.
2. **The shop's Keepsakes and Snacks (both):** out of the ruled list boxes --
   each dome and jar on its own small plate or shelf lip with the name
   engraved beneath and the tag hung from it; SAPPHIRINE's clear glass domes on
   turned wooden bases and its larger, lidded jars (both); SAPPHIRINE's
   scalloped, lit valance with swags over the Tricks row (both).
3. **The piles (both):** OBSIDIAN's reset-curl glyph for CLEAR (it now shares
   the X medallion with CLOSE, so the dialog shows two closes) and the small
   lit pip under any active filter.
4. **Settings (both):** the SEED wells' contents ("none yet", "left to
   chance") upright and larger -- lavender, 12 px+ at 1280, not ~10 px grey
   italic; SAVE AND QUIT a FILLED aubergine enamel plate with a lit gold rim
   (SAPPHIRINE's), not an outlined pill; SAPPHIRINE's colour-palette choices as
   framed enamel plates with the selected one lit; OBSIDIAN's brass seed plates
   with a recessed bevel are J2's alternative.
5. **The lobby (both):** the captions under The House and CLIMB UP from ~9 px
   faint italic to 11-12 px and brighter; the rope ladder pulled up so it is not
   cut off behind CLIMB UP; OBSIDIAN's chest (J1) / toy chest and rope ladder
   (J2) with KYANITE's trapdoor, warmed and rimmed; the password plate's
   PASSWORD label thicker and the well given a candle-warm inner glow (J1).
   Keep KYANITE's serif-caps password, NOT OBSIDIAN's chalkboard (J1).
6. **The hand (both):** the stack-count badges larger, gold-rimmed and set fully
   on each stack's top edge; the cards behind fanned out a little more so
   their cost coins show and a stack reads as several cards at a glance.

## Builders' notes, in short

- **KYANITE** (`ccb48929`, self 8.2): copies of one Trick (same id, upgrade,
  cost) regrouped and, in a hand of 7+, dealt as ONE place with the copies
  behind (7 px up, 3 px left, 2.2 degrees) and a "x3" medallion; each copy
  still its own slot for hover, keyboard, pad and drag; the crowded arc's dip
  capped at 12 px; a 12 px gutter from the furniture; the hovered card at 8+
  scaled 1.24. Shop: the whole ware presses its `.sh-buy`; tags on cords; a
  runtime-painted velvet curtain (`paintDrape`, seeded); the room line on the
  TRICKS ribbon. Settings: seed read-out and inlay well; the seal on RESET.
- **OBSIDIAN** (`7bf332bd`, self 7.8): seed fields as vellum cards in brass
  holders; the seal pressed onto RESET; palette swatches as jewels in bezels;
  the password chalked on a slate; one ware "in hand" with BUY unfolding;
  Keepsakes under cloches and Snacks in jars on hw-tray plates; lit drape and
  pelmet; the cloakroom line on the TRICKS ribbon.
- **SAPPHIRINE** (`c00423a7`, self 8.3): `.kit-hw-inset` for every input
  (Cinzel values, house-voice placeholders); one lit BUY at a time; glass
  bells and jars on walnut stands; `curtain-folds.webp` and a valance (new
  assets via `tools/prep_ui_stall.py`); duplicates stacked as slivers with a
  count; long names condensed only to 0.86, then two lines.
