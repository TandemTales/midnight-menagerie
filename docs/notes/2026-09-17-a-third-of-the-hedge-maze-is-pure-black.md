# A third of the Hedge Maze is pure black

*2026-09-17, while round 8 was building.*

Round 8 photographs three rooms of seventeen. A candidate could improve those
three and wreck the other fourteen and nothing in the round would notice, so
all seventeen were swept at BASE (`27f7028`) with
`tools/shot-scripts/backdrop-room.js` at `tier=high&actor=0` and measured with
`tools/bgmetrics.py`. The captures and their metrics are in
`C:/UILOOP/r8/sweep-TALLOW/` (`_bgmetrics.json`).

Two findings came out of it that the round's own brief had wrong.

## 1. Ink depth is not uniformly short. It is BIMODAL, and the round's three captures straddle it

The brief opens on "ink depth 0.009-0.080 against mainMenu's 0.248, short by an
order of magnitude". Across all seventeen rooms it is not one population:

    bathhouse 0.346   lampworks 0.157   hedge 0.149   foyer 0.149
    ballroom  0.115   greenhouse 0.101  attic 0.060   crypt 0.035
    heart     0.035   graveyard 0.032   kennels 0.025  sleeping 0.024
    kitchens  0.023   nursery 0.017     pumpkin 0.016  study 0.013
    passages  0.011

Six rooms carry real ink (0.10-0.35); eleven carry almost none (0.011-0.060).
And the samples are not one number either -- measured on their own room patches:
`menu-court` 0.393, `menu-wall` 0.211, `kid-floor` 0.081, `kid-wall` 0.042,
`comp-cell` 0.000.

So against the fair comparison the rubric names for each capture:

| capture | ink depth | its sample patch | verdict |
|---|---|---|---|
| room-foyer | 0.149 | kid-floor 0.081 / menu-wall 0.211 | in range |
| room-crypt | 0.035 | kid-wall 0.042 | at it |
| room-graveyard | 0.032 | menu-court 0.393 | **12x short** |

The gap is not the house. It is the EXTERIOR, and `passages`, `study`,
`pumpkin`, `nursery`, `kitchens`, `sleeping` and `kennels` -- none of which
round 8 photographs.

## 2. The top of the frame is not dark, it is ZERO

Fix list item 6 read: *"the ceiling is deliberately the darkest part of the
frame now (all four samples go near-black at the top)"*. That sentence made a
defect sound like a decision. Share of pixels at **pure** black, `max(r,g,b)==0`,
in the upper 30% of the frame (whole frame in brackets):

    hedge      71.5 (31.6)    passages   31.6 (13.2)    nursery    13.3 ( 9.1)
    heart      56.0 (28.7)    kitchens   29.2 (11.7)    lampworks  11.6 ( 8.2)
    greenhouse 43.4 (17.7)    pumpkin    28.9 (19.3)    crypt      10.3 (12.3)
    ballroom   19.8 (13.0)    graveyard  19.7 (16.4)

    SAMPLES    mainMenu 0.0 (1.6)   title 1.7 (2.2)
               selectCompanion 3.0 (1.5)   selectKid 7.3 (9.2)

**`mainMenu.png` is a night sky and has no pure black anywhere in its top
third.** Ours hands away up to 71.5% of it. Eleven of seventeen rooms are above
the darkest sample's 7.3%.

This matters to round 8 specifically, not as a general taste note: **a pure-black
pixel cannot carry tooth, a drawn line, or ink depth.** The round's target axis
is capped by it. In the Hedge Maze, 31.6% of the frame is incapable of showing
any drawn subject whatever, which is also the literal answer to the sentence
seven rounds of judges have written -- "the left wall has nothing on it".

Looking at the capture rather than the number separates two causes:

- **The open-sky shell has a void where a sky goes** (hedge, heart, pumpkin,
  graveyard). Stars scattered on zero. `mainMenu`'s night sky is clouded, graded
  and lit from the house it stands in front of.
- **Several interior ceilings clip to zero** (greenhouse 43.4, passages 31.6,
  kitchens 29.2), while six rooms already sit inside the samples' range -- foyer
  7.5, kennels 7.5, study 6.3, bathhouse 5.5, attic 4.7, sleeping 3.8. So it is
  not a global exposure question. It is those ceilings.

It is also, in part, an over-correction. The black-floor pass (`57da26a`) found
that *nothing in the game was ever black* and pushed the floor down, correctly.
The WebGL room then went past it.

## And the Hedge Maze does not read as a hedge

Worth recording because it is what the picture shows rather than what a number
says: the hedge is a grey-green fog bank in the middle distance, and the
foreground "hedges" are low mossy blocks that read as sarcophagi. FOLIAGE is the
wall mode the brief already calls the weakest, and this is what that looks like
at full size.

## What was done with this

Item 6 of `BRIEF-r8.md` was rewritten on these numbers. Nothing else: three
builders were already an hour into the round with those files checked out, and
the two structural fixes -- a painted sky on the open-sky shell, and the
ceilings that clip -- are one file pair, not fifteen screens. They belong in a
measured pass **after** the merge, the way the ground pass and the WebGL room
pass were both done directly rather than as a round.

At merge, check each candidate's pure-black share against this table. A
candidate that gives the frame back is worth more than its mean says.
