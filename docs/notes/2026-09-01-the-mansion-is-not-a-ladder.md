# The mansion is not a ladder

2026-09-01. Seventeen regions are described everywhere in this project as a
ladder — `REGION_ORDER`, "in ladder order", "the back half". Measured against a
constant player, **they are not ordered by difficulty at all.** Region 2 is the
second-hardest ordinary pool in the game; region 16 is the same as region 1; the
final region's Big Scares are easier than the first region's.

## The control that was missing

`tests/run/run.py`'s cost ledger prices a wing against the player who actually
reaches it. That cannot separate two very different sentences:

* this wing is gentle
* the player who gets here is strong

and by the fifth wing that player holds 23 to 32 of the game's 58 Keepsakes, so
the second reading is always available. Every "the back half is free" finding in
this project has been ambiguous for that reason.

`tests/critic-design/ladder.py` holds the player still. One `loadoutAtBoss`
captured at the end of the **Foyer** — about 14 cards and 4 Keepsakes — walks
into every region's pool at full Courage. `bench()` already supported it: its
`region` argument moves the Run up the ladder and leaves the loadout alone.

Eleven loadouts, sixteen fights per region, 272 fights per tier.

## First: can this gate see?

A new instrument that indicts fifteen of seventeen regions is more likely to be
broken than to be right — CONTRACTS 57 was written after `tests/boss-haunt/`
reported all seventeen bosses failing before it applied the Haunt envelope the
way the run layer does. So before any of the numbers below are worth reading,
the gate has to demonstrate it responds to content strength at all.

`bench()` already accepted an `hpScale` lever and this harness was not passing
it. `--hpscale 2` now does. Every one of the seventeen rows must move:

    region              x1     x2        region              x1     x2
    foyer                7%    37%       ballroom            12%    49%
    nursery             38%    86%       crypt               15%    37%
    sleeping-quarters   17%    51%       hedge-maze          31%    56%
    kitchens-cellars    27%    73%       secret-passages     33%    77%
    greenhouse          13%    38%       bathhouse            9%    35%
    graveyard           12%    45%       kennels              8%    20%
    study-library       11%    27%       pumpkin-grounds      7%    45%
    attic-observatory   13%    48%       heart               30%    66%
    lampworks           12%    28%

**All seventeen moved, all upward**, win rates fell where they should
(secret-passages 75% → 37.5%, hedge-maze 100% → 62.5%, heart 100% → 62.5%), and
the measured enemy Courage doubled with the lever. The gate sees.

It also shows the disorder is a property of the CONTENT and not of the
measurement: at double Courage the ordering barely changes, and kennels is still
the easiest region in the game.

Shipping numbers are always `hpScale 1`. Everything below is.

## The ordinary pool: thirteen regions are the first region

    #   region              % of pool   win%      enemy Courage
    1   foyer                  13%      100.0%       68
    2   nursery                39%      100.0%      119
    3   sleeping-quarters      16%      100.0%       74
    4   kitchens-cellars       23%      100.0%      100
    5   greenhouse             14%      100.0%       71
    6   graveyard              13%      100.0%       84
    7   study-library          13%      100.0%       75
    8   attic-observatory      15%      100.0%       75
    9   lampworks              11%      100.0%       73
    10  ballroom               17%      100.0%       79
    11  crypt                  15%      100.0%       96
    12  hedge-maze             36%       93.8%       89
    13  secret-passages        32%       87.5%       86
    14  bathhouse              13%      100.0%       94
    15  kennels                 9%      100.0%       96
    16  pumpkin-grounds        13%      100.0%       82
    17  heart                  30%      100.0%      128

**A wing-one deck wins every ordinary fight in fifteen of the seventeen
regions**, and 93.8% / 87.5% in the other two.

There is no curve. There are four spikes — nursery 39%, hedge-maze 36%,
secret-passages 32%, heart 30% — and **thirteen regions sitting in an 9–17% band
that includes the first wing.** Region 15 is the easiest content in the game.
Region 16 is exactly region 1.

## The elite pool: harder, and just as unordered

    #   region              % of pool   win%      enemy Courage   turns
    1   foyer                  41%       93.8%      116            8.4
    2   nursery                80%       62.5%      176           12.7
    3   sleeping-quarters      34%       93.8%      206           13.1
    4   kitchens-cellars       88%       50.0%      198           13.2
    5   greenhouse             59%       87.5%      298           20.3
    6   graveyard              27%      100.0%      139           11.3
    7   study-library          36%       87.5%      133           11.2
    8   attic-observatory      48%       68.8%      157           10.9
    9   lampworks              40%       87.5%      146           11.4
    10  ballroom               37%       93.8%      147           10.9
    11  crypt                  66%       75.0%      235           15.1
    12  hedge-maze            110%       12.5%      337           15.5
    13  secret-passages        19%      100.0%      149           18.3
    14  bathhouse              39%       93.8%      153           14.8
    15  kennels                87%       56.3%      489           32.3
    16  pumpkin-grounds        68%       87.5%      188           14.1
    17  heart                  24%      100.0%      224           18.6

Big Scares are properly harder than Scuffles — that part works. But the ordering
is absent again, and two entries are outright wrong:

* **hedge-maze (12) costs 110% of the pool at a 12.5% win rate**, four times the
  region beside it. It is the only content in the game a constant player loses
  to outright.
* **secret-passages (13) costs 19% and heart (17) costs 24%** — the two easiest
  elite tiers in the mansion are regions thirteen and seventeen. **The final
  region's Big Scares are easier than the Foyer's** (24% against 41%).
* **kennels (15) is a slog rather than a spike**: 489 enemy Courage over **32.3
  turns**, which is three times the median fight length and nearly the 30-turn
  mark where `_losePatience` starts firing. That is a pacing defect wearing a
  difficulty number.

## What this does and does not say

It measures **relative content difficulty**, not the player's experience. A real
player meets the hedge-maze at wing four with a far better deck than this one, so
"12.5% win" is not a prediction that they will die — it is a statement that the
hedge-maze elite is four times the Foyer elite while sitting two wings after it
in a route that is drawn in ladder order.

The finding is the **ordering and the spread**, and both are actionable per
region without touching a single balance philosophy:

| region | tier | reading | direction |
|---|---|---|---|
| hedge-maze | elite | 110% of pool, 12.5% win | far too expensive |
| kennels | elite | 489 Courage, 32.3 turns | too long, not too hard |
| nursery | ordinary | 39%, the wing-two pool | too expensive for wing two |
| secret-passages | elite | 19%, 100% win | too cheap |
| heart | elite | 24%, 100% win | too cheap, and it is the ENDING |
| kennels · pumpkin-grounds | ordinary | 9% and 13% | regions 15 and 16 are wing one |

## Why the back half reads as free

Both halves of it are now measured, and they compound. The player arrives at
wing five holding 23–32 of 58 Keepsakes and a 29-card deck — and the content
they meet there is, on this instrument, the same difficulty as wing one. The
snowball was only ever half the story; the other half is that **nothing was
waiting for it.**

## The bosses DO scale — and that is the bug

Same instrument, `--tier boss`. This is the one tier with a real ladder in it:

    #   region              pool   turns   win%        #   region            pool   turns   win%
    1   foyer                137    10.4   75.0%      10   ballroom           419    27.5   33.3%
    2   nursery              247     9.2    0.0%      11   crypt              548    24.2    0.0%
    3   sleeping-quarters    297    19.1   75.0%      12   hedge-maze         504    20.4    8.3%
    4   kitchens-cellars     358    21.2   41.7%      13   secret-passages    464    33.8   16.7%
    5   greenhouse           464    29.0    8.3%      14   bathhouse          692    43.8    0.0%
    6   graveyard            378    21.2    8.3%      15   kennels            515    31.4   50.0%
    7   study-library        345    29.0    8.3%      16   pumpkin-grounds    695    39.9   16.7%
    8   attic-observatory    356    25.4   25.0%      17   heart              645    20.2    0.0%
    9   lampworks            474    31.2   75.0%

**137 → 695, a five-fold rise.** The boss tier is the only place the mansion is
actually a ladder — and the turn count climbs with it, 10.4 → 43.8.

## Which is why the safety net is now firing in real play

`combat/engine.js`'s `_losePatience` escalates every enemy past turn 30, and its
comment makes a measured claim: *"PATIENCE is deliberately far outside reachable
play … the longest fight any region gate produces is 24. Nothing a player will
ever see is touched by this."* **Nothing checked it.** `tests/run/run.py` does
now, and across 535 real fights in fifty expeditions:

    longest fight        87 turns   graveyard/boss
    past 24 turns        13
    past 30 turns         9   <- _losePatience fired

All ten of the longest fights are **bosses**, and **nine of the ten were lost**:

    87  graveyard/boss    LOST      55  lampworks/boss           LOST
    69  graveyard/boss    LOST      54  attic-observatory/boss   LOST
    56  greenhouse/boss   LOST      52  greenhouse/boss          won
    55  greenhouse/boss   LOST      44  greenhouse/boss          LOST
                                    37  study-library/boss       LOST

An 87-turn fight means `_losePatience` ran for **57 turns**, stacking 57
Strength on the boss before it ended. THE HOUSE LOSES PATIENCE is being shown to
players as though it were designed content. It is the termination guarantee, and
it is deciding real fights.

## The cause, and it is one day old

Boss pools were authored against **ladder position**: the greenhouse boss's 464
Courage assumes a player who has cleared four wings before arriving.
`EXPEDITION_WINGS = 6` (2026-08-31) draws four wings from the middle fifteen, so
**ladder position and route position came apart** — and nothing re-measured the
bosses afterwards.

The run harness's own `reach` table names the regions that can be **wing two**:
attic-observatory, graveyard, greenhouse, kitchens-cellars, lampworks, nursery,
sleeping-quarters, study-library. Every region in the long-fight list above is on
it. A 345–474 Courage boss authored for wing five, met with a wing-two deck, is
a thirty-to-eighty-turn grind that the player loses.

That is the whole of it, and it makes the fix a fork rather than a repair:

* **scale the boss pool by ROUTE position** rather than ladder position — the
  mansion adapts to how deep tonight's expedition is;
* **or constrain the route** so a wing cannot appear far from its ladder index;
* **or re-author seventeen pools** against the six-wing route.

The first is small and principled and changes what a wing *is*. None of them is
taken here. The gate is red on purpose and names its own cause, so nobody spends
a round deciding whether they broke it.

`python tests/critic-design/ladder.py [--tier elite|boss]`, results committed as
`ladder-result.json`, `ladder-elite.json` and `ladder-boss.json`.
