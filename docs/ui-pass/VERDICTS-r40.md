# Round 40 — verdicts: the boards (type at 1280, the hand, the paintings, the map)

Base `06d2a982`. BATISTE is the baseline. Builders: SPINEL (`ui/r40-boards-a`,
LITERAL), IOLITE (`-b`, THE PAINTINGS AND THE HAND FIRST), AVENTURINE (`-c`,
LESS ON EACH BOARD, LARGER). All finished in one run; three blind judges
(`wf_1d3a08db-686`): J1 and J3 chose SPINEL, J2 AVENTURINE.

## Scores (mean of three judges, each screen at both sizes)

| screen | SPINEL | AVENTURINE | IOLITE | BATISTE | winner |
|---|---|---|---|---|---|
| shop | 7.37 | 7.40 | 7.03 | 6.30 | SPINEL (2 of 3) |
| combat-crowd | 7.33 | 6.73 | 6.93 | 6.30 | SPINEL (3 of 3) |
| gameover | 7.27 | 7.70 | 7.27 | 6.50 | AVENTURINE (3 of 3) |
| hud-late | 7.27 | 7.40 | 6.93 | 5.73 | SPINEL (2 of 3) |
| map | 7.23 | 7.47 | 7.53 | 5.60 | AVENTURINE (2 of 3) |
| reward | 7.37 | 7.07 | 7.77 | 6.53 | IOLITE (2 of 3) |
| **mean** | **7.31** | 7.29 | 7.24 | **6.16** | |

**SPINEL wins, 2 of 3 judges, +1.14** -- the three builds within 0.07 of each
other, the boards now at 7-7.8. "The most consistent system": a low, narrow
hand with duplicates stacked, objects on the shop's shelves each with its own
plate and description, labelled Keepsake and Gear groups, regions drawn as
shapes (J1, J3). Its small-text probe: 0 runs under 12 px on all six screens at
1280 and 1600 -- yet all three judges still read the longest hand cards' rules
(Put Yourself Back Together, Go Get It!) at about 9-10 px at 1280.

## THE GRAFT — what the judges ask for

1. **Reward -- IOLITE's wall** (all three): the paintings hung high on the
   upper wall either side of the title, on cords, plates below, never in the
   gutter against the cards at 1280; the moonlit gothic windows dropped into
   the side bays beside the cards as dressing.
2. **The boss's medallions -- IOLITE's** (J2, J3): his three effect medallions
   set either side of the crescent on his nameplate, by him, where the hand can
   never cover them.
3. **The hand's longest cards** (all three): Put Yourself Back Together and Go
   Get It! at 1280 -- the rules text at 12 px+ (widen the card slightly, wrap
   less, or let the title condense) and the SKILL ribbon clear of the first
   word; measure the RENDERED px of those two cards in the crowded hand, not
   the probe's average.
4. **Gameover -- AVENTURINE's hang** (J1, J3): both paintings on cords inside
   the centre frame flanking the Worked Hardest card, each with its plate
   below; the "Every expedition ends up leaning on one Trick" line under the
   card; the mansion painting its own cord and a gap above the HOW FAR plaque
   with a nameplate like the Dowager's; the Dowager's plate fully below her
   frame.
5. **The map's regions -- AVENTURINE's tight shapes** (J1), with IOLITE's
   soft tint and stipple across the whole shape (J3): each region one convex
   district hugging its rooms (no U-shaped notch or tongue between them), its
   label off the outline.
6. **The run strip** (all three): the counts back in the cartouches --
   KEEPSAKES 10, GEAR 8 -- with the "+7"/"+5" badges inside the strip, not
   hanging below it; colour-coded rings on each coin; "Wing 1" back on the
   location plate (J2).
7. **The shop:** AVENTURINE's Keepsakes and Snacks on raised plinths with the
   plate and tag hanging below (J1), each item's rule under its own jar (J2),
   and the Coatcheck Ticket's five-line description capped at three lines or a
   wider column at 1280 (J1).

## Builders' notes, in short

- **SPINEL** (`48c6dfe3`, self 7.8): a small-text probe through the whole
  transform chain (`C:/UILOOP/r40/spinel/smalltext.py`) -- BASE had 75 runs
  under 12 px at 1280, the tip 0; the map's canvas lettering at 12.6 px; board
  cards fit their rules in SCREEN px (`_cardfit.js rulesPx`); the hand's TUNE
  floors at 12; a stacked hand of 8+ at three-quarter card size, no spread air.
  Outside its six: combat foyer-14's enemy HP "/29" 11.1 px and the title,
  clubhouse and select screens at 9.5-10 px (not touched).
- **IOLITE** (`a3cee42f`, self 7.6): every plate on its own brass plate below
  the frame, one or two lines (`hang.js settlePlate()`), fitHung checking it;
  reward's paintings on the upper wall in the bays between sconce and plaque;
  gameover's regression undone (both pictures on cords at 1600 and 1280); the
  boss's medallions by his nameplate.
- **AVENTURINE** (`13ddd89d`, self 7.6): each map region ONE irregular
  boundary pulled round its rooms (`regionShape()`), hatch/stipple clipped to
  it; the strip's groups as three 35 px objects with coloured rims and a count
  medallion; Forgetting moved off the Tricks shelf; gameover's centre as one
  shrine.
