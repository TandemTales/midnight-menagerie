# Blind style judgment — rubric, round 12: THE LAST WEB CHROME

Read `RUBRIC.md` first: the eight dimensions, the 0–10 scale and the blindness
rules. 9 is "a viewer could not tell this was not made by the same hand as the
samples". Then read `RUBRIC-r1.md` for its EXPAND section. Where they disagree
with this file, this file wins.

**This track follows the EXPAND rule.** The three screens are three separate
pieces of the game, and each may be merged from a different candidate:
`screen_winners` decide what merges, one screen at a time; `winner` is for the
record.

## What you are looking at

Three small pieces of interface, each photographed over a live fight. Judge
the PIECE and how it sits in the painted game around it — not the fight, the
HUD, the cards or the creatures, which are identical in every candidate (the
creatures are animated, so their pose differs from capture to capture: that
is not evidence about anyone).

- **`coach`** — the note a tutorial lays over the player's first fight,
  pointing at one thing on the board. The fight underneath is still being
  played. Judge the note, what it points with, and whether it belongs to the
  painted world or is a browser tooltip laid on top of one.
- **`handoff`** — the full-screen cover a two-player game raises between the
  Kids' turns, naming whose turn it is. Its one job is that the player who
  receives the machine cannot see the previous player's hand.
- **`toast`** — the small notice that slides in when an achievement is earned:
  its name, and a tier (bronze, silver or gold).

## Three things a still CAN show, and each is a readability failure

- **A veil that shows the board.** If any card, the hand or an enemy can be
  made out through the `handoff` cover, it has failed at the only thing it is
  for: score its `readability` 0–2 however handsome it is.
- **A coach note that hides what it is teaching.** If the note covers the
  thing its spotlight names, the hand, or the End Turn control, it fails
  `readability`.
- **A toast that sits on the HUD.** If it covers the Companion's portrait, its
  Nerve, the piles, the hand, End Turn or the top rail's readouts, it fails
  `readability`.

## The dimensions on pieces this small

- `background` here means what the piece sits ON: for the veil, the whole of
  what it shows (a flat black field is a void, 0–2); for the coach and the
  toast, whether the piece has a ground of its own that belongs to the house,
  or is a flat panel.
- `typography` matters more than usual: these are mostly words. Engraved
  serif display, spaced small caps, the samples' hierarchy — not a system
  font at 12 px.
- `material`: what the plate, the button and the frame are MADE of. A CSS
  box-shadow standing in for a candle glow, or a 1 px border standing in for a
  gilt edge, scores low.

`fits_between_samples` keeps its meaning: could this piece sit in a trailer
beside the samples without looking like another game's UI?
