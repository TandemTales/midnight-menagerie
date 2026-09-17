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
  graveyard). Stars scattered on zero. Measured against `mainMenu`'s own clean
  sky, which is the next section.
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

## The sky, measured, and it is far plainer than it looks

Written after the above, because "give it a painted sky" is not a specification
and the first two attempts at one were both wrong.

Sky band of each open-sky room against `mainMenu.png`'s clean sky:

| | sky level | pure black | stars >110 |
|---|---|---|---|
| mainMenu (x400-1300, y0-150) | **16.5** | **0.0%** | 0.01% |
| hedge | 0.8 | 72.2% | **0.11%** |
| heart | 4.1 | 25.0% | 0.02% |
| pumpkin | 2.6 | 30.5% | 0.00% |
| graveyard | 2.0 | 34.6% | 0.02% |

**Ours is 4x to 20x too dark AND its stars are up to 11x too hot.** A void with
hot points, where his is a bright navy field with faint ones. That second half
is the part an eye does not catch: the instinct is to add bright accents, and
the measurement says remove them.

**It took three passes to get an honest measurement of his sky, and the first
two both lied.**

1. Patch `x1180-1420 y0-320` gave "cloud variation 34.4% of level, p99 80".
2. The bright tail turned out to be 106 blobs of MEDIAN SIZE 3 px, 8 of them
   over 20 px -- stars, not cloud masses. So a "lit cloud mass" term built on
   reading 1 was deleted.
3. **The patch was contaminated.** Its lower half holds the right-hand towers'
   spires and roof detail. The same sky above the roofline reads `>30: 0.07%`
   against the patch's `5.60%`.

Clean sky, `x400-1300 y0-150`, with the vertical ramp removed:

    ramp, y0 -> y330      luma 13 15 17 19 21 23 26 28 32   (near linear)
    top / roofline rgb    (3, 11, 26) -> (13, 24, 44)        sat 0.89 -> 0.71
    low-frequency var     std 0.60 = 3.4% of level
    high-frequency        std 1.85 = 10.6%  (the canvas tooth, already built)
    p1 / p50 / p99        13 / 17 / 23
    stars                 >110: 0.01% of area
    PURE BLACK            0.00%

**His night sky is a nearly pure linear navy ramp.** Remarkably plain: its
quality is that it is a smooth, saturated, non-zero field, not that it has
weather in it. Adding clouds would be inventing drama he does not have.

A CPU prototype (`sky_proto.py`, this session's scratchpad) hits every axis:

    level 16.4 (17.4)   black 0.00 (0.00)   cloud 3.9% (3.4%)   sat 0.83 (0.80)
    p1 12.7 (13)        p99 19.7 (23)       >30 0.03% (0.07%)   >110 0.01% (0.01%)

    TOP (3,11,26)  HORIZON (13,24,44)  CLOUD_AMP 0.034
    STAR_FRAC 0.0008  STAR_GAIN 7.0  STAR_POW 3.2

**And the trap it nearly walked into:** fitting the contaminated numbers gave
`CLOUD_AMP 0.44`, which drives 0.61% of the sky to PURE BLACK at the low end of
its own modulation -- reintroducing the exact defect being fixed. Any variation
term here is bounded by "never reaches zero"; at this ramp that bound is about
0.34, and the honest value is 0.034.

The same navy field is wanted in two places, which is why this is one fix and
not two: the open-sky shell, and the **glass ceilings** -- the Impossible
Greenhouse has a glass roof with a void above it, and a glasshouse at night
should show that sky through the mullions.

The seventeen-room sweep is byte-identical on a re-shoot (0 differing pixels,
greenhouse, with the phase pinned), so it is a valid before/after baseline for
this pass.

## What the void costs, and one hypothesis that failed

**The void is most of the exteriors' bad numbers.** Measure the same capture
with the sky excluded (`--box 0,380,1600,900`) and the tooth more than doubles:

| tooth | whole frame | below the sky | mainMenu |
|---|---|---|---|
| graveyard | 0.140 | **0.331** | 0.226 |
| pumpkin | 0.127 | **0.314** | 0.226 |
| crypt (interior control) | 0.268 | 0.443 | 0.226 |

So the two rooms that looked like the tooth pass had missed them were never
short of tooth: **below the horizon they are at the top of the range and above
his figure.** The ground work landed; a third of the frame being zero was
dividing it away. The control rises too -- every room has a dark upper band --
but the exteriors rise twice as far.

A caveat this also exposes: **stars on black inflate `inkDepth`**, because a
bright point on a zero field is an edge. Graveyard reads 0.032 whole-frame and
0.018 below the sky. The exteriors' ink is therefore *worse* than the first
table said, not better.

**And one hypothesis that failed, recorded because it was convincing.** The
Secret Passages has the best masonry in the sweep by eye -- coursed blocks,
dark joints, a mottled face -- and the LOWEST ink depth of seventeen (0.011). The
obvious reading is that the mottle competes with the drawn line and buries it.
Tested across all seventeen rooms, that is not what is happening:

    inkDepth vs tileSpread   r = -0.158      (the mottle hypothesis)
    inkDepth vs colSpread    r = +0.053      (   "          "      )
    inkDepth vs inkShare     r = +0.896
    inkDepth vs tooth        r = +0.476

Ink depth tracks how MUCH line a room carries, not how well a line survives its
surface. The low-ink rooms have fewer drawn lines, not buried ones -- which is
the same fix the round is already briefed for, and not a new one.

## And the OTHER room: the ground pass fixed one of its three passes

Measured with the new axis, the CSS room behind the boards and dialogs
(`game/assets/ui/kit/room*.webp`, built by `tools/prep_ui_paint.py`):

| | minCh | inkDp | spread | void% | skyLvl |
|---|---|---|---|---|---|
| `room.webp` | 0.69 | **0.337** | 0.449 | 0.99 | 2.4 |
| `room-warm.webp` | **10.16** | 0.117 | 0.217 | 0.00 | 36.0 |
| `room-moon.webp` | **11.03** | 0.096 | 0.199 | 0.03 | 35.3 |
| the samples | 0.00-2.32 | 0.010-0.248 | 0.54 avg | 1.5-9.1 | 8.5-29.8 |

Two things fall out.

**`room.webp` has the highest ink depth of any surface in the project, 0.337
against mainMenu.png's 0.248.** The CSS room's base painting is not the weak
part of this game.

**Its two LIT variants never reach black, and that is a leftover.** `lit()`
computes `col = alb * c * (amb + gain * lam)`, so `amb` is a hard floor: where
the lambert term is zero the surface cannot go below `alb * c * amb`. The
variants run `amb` 0.66 (warm) and 0.52 (moon), which is exactly the minCh
10.16 / 11.03 above. The black-floor pass (`57da26a`) lowered the ambient on the
UNLIT pass -- 0.32 to 0.20, and that is `room.webp`, which now reads 0.69 -- and
never touched the two lit passes. So the defect that pass was written to fix
still stands in the two assets that actually show behind a board.

Fix 4 of `BRIEF-r8.md` attributes "tile spread 0.20 against 0.54" to "the CSS
room". That is these two variants; `room.webp` itself is 0.449.

**But do not set this one by the number.** These three are seen THROUGH boards
and dialogs, not as pictures, and the samples reaching 0.00 are whole
compositions with a lit subject in them. Lowering `amb` darkens everything the
plates sit on, and Settings already scores 3-4 on background -- the lowest in
the pass -- partly for being hard to read. The amount belongs to a 1:1 look with
a board in front of it, which is the standing lesson of this pass.
