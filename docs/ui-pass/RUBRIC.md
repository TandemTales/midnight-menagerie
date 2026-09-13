# Blind style judgment — rubric

You are one of several independent judges. You decide which build of Midnight
Menagerie's screens looks most like it belongs with Josh's four sample images,
and exactly what still stops it.

## Blindness is the whole point

- Look ONLY at the PNG files named in your prompt, with the Read tool.
- Do not read code, git history, branch names, worktrees, notes, logs, or any
  other file. Do not run the game. Do not guess who built what.
- Candidates are named by neutral codes. One of them may be the game as it is
  today; you are not told which, and you do not need to know.
- View the candidates in the order your prompt gives.

## The reference

`UI/title.png`, `UI/mainMenu.png`, `UI/selectCompanion.png`, `UI/selectKid.png`.
Study all four before scoring: gold filigree frames and double rules, cartouche
nameplates, gold ribbon banners with star glyphs, round purple enamel buttons
with gold rims, purple damask and scrollwork grounds, candles and cobwebs as
dressing, engraved serif caps, lavender display type, painted texture and
candlelight everywhere, and backgrounds that are paintings.

## Score each candidate on each screen, 0–10

| key | dimension | what a 9 looks like |
|---|---|---|
| ornament | ornament language | frames, cartouches, ribbons, medallions used the way the samples use them — not web borders |
| palette | palette | aubergine/near-black grounds, antique gold, lavender accents, warm candle vs cold moonlight |
| typography | type | engraved serif display, spaced small-caps labels, the samples' hierarchy |
| material | material and depth | painted, textured, lit; nothing reads as a flat CSS box or gradient |
| background | background | a painting at `mainMenu.png`'s level; a textured, lit placeholder can reach 5; a flat void is 0–2 |
| composition | composition | staged and framed like the sample boards, clear focal hierarchy |
| readability | readability and function | every label legible, nothing clipped or overlapping, controls obviously controls |
| coherence | coherence | could sit between the samples in a trailer without looking like another game |

- `overall` is your holistic judgment, not an average. **9 = in style, a viewer
  could not tell this screen was not painted by the same hand as the samples.
  10 = an art director would ship it.** 5 = a styled web page. 2 = default web UI.
- `fits_between_samples` is true only if coherence ≥ 9 AND nothing on the screen
  looks like default web UI.
- `worst_problem`: the single most damaging thing, in one sentence a builder can
  act on, naming the region of the screen ("the BUY buttons under the cards are
  plain rectangles").

## Then decide

- `ranking` per screen, best first.
- `winner`: the ONE candidate whose look should become the language of the whole
  game, judged across all screens together — the most coherent system, not the
  single prettiest screenshot.
- `winner_fixes`: 5–10 concrete, visual fixes for the winner, each naming a
  screen and a region, ordered by impact.
- `grafts`: specific ideas from the other candidates worth moving into the
  winner, each with the candidate code it comes from.

Be severe. The samples are the bar, not the current game. "Better than before"
is not a 9; "comparable" is a loss.
