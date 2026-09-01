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

`python tests/critic-design/ladder.py [--tier elite]`, results committed as
`ladder-result.json` and `ladder-elite.json`.
