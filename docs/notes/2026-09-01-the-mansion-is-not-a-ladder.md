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

## The cause I first wrote here was wrong, and measuring it took one field

I blamed the route. Boss pools are authored against **ladder position**, and
`EXPEDITION_WINGS = 6` (2026-08-31) drew route position apart from it, so a
464-Courage boss authored for wing five could turn up at wing two. It is a tidy
story, it fits, and **I committed it into a failure message and both handoffs
without measuring it** — on a ledger that did not record the route slot, so
nothing in the repo could have joined the claim to the data.

Two fields settled it. `wing` is the route slot the fight happened at; `left` is
the board's Courage still standing when it ended, because a forty-turn GRIND
(boss nearly dead) and a forty-turn STALL (boss near full) are the same number
in the `turns` column and completely different defects.

    turns  wing  region             left    turns  wing  region             left
      87     3   graveyard           64%      52     3   greenhouse           0%  won
      69     4   graveyard           27%      44     2   greenhouse          33%
      56     2   greenhouse          68%      37     3   study-library       33%
      55     2   greenhouse          69%      28     4   hedge-maze          22%
      55     2   lampworks           21%
      54     3   attic-observatory   66%

**The route claim predicted at least seven of the nine over-30 fights at wing
two. There are four.** The rest are wings three and four, including the 87-turn
worst case. The route is not what is long about these fights.

**And the four LONGEST ended with the boss 64–69% alive.** That is the other
prediction, and it is `_losePatience`'s own note (`engine.js` ~2918) which had
already diagnosed this with numbers before I started:

> An enemy's Guard is wiped at the start of its own turn and re-granted every
> turn, so what the player must beat is its Guard PER TURN, not its Courage. The
> Groundskeeper can raise 46 in a turn … a deck that deals less than that can
> never move its Courage bar at all, however long the fight runs.

It even names the boss: the Groundskeeper "sat at 203 of 350 Courage for the
last hundred and forty" turns. The graveyard boss **is** the Groundskeeper, and
it is the 87 and the 69 in that table.

## Which disqualifies all three of the fixes I was choosing between

Scaling the pool by route position, constraining the route, and re-authoring
seventeen pools all move **Courage**. Not one of them can move a Courage bar the
deck cannot dent, and the four worst fights in the game are exactly that. A pool
cut reaches the five grinds in the table and leaves the four stalls untouched —
and the stalls are the 87, the 56, the 55 and the 54.

So the real finding is smaller than the one I wrote and worse than it:

**`_losePatience` is not a safety net that never fires.** It is the resolution
mechanism for a Guard-wall stall the game still has, it fires in nine of 535
ordinary fights, and it resolves them against the player — eight of the nine
were lost. The termination guarantee is doing the killing.

The axis that can reach it is Guard-per-turn: what a boss can raise in a turn
against what a deck at that depth can put out. Nothing in the repo measures that
yet, and it is the next instrument rather than the next fix.

The gate is red on purpose and now names the measured cause.

`python tests/critic-design/ladder.py [--tier elite|boss]`, results committed as
`ladder-result.json`, `ladder-elite.json` and `ladder-boss.json`.

## 2026-09-02 — the flatness is AUTHORED, and depth-scaling Courage does not fix it

### Where the flatness comes from

Mean normal-tier enemy Courage, per region, straight out of the implementation
(and therefore out of the chapters, since `tests/design-courage` is green):

    foyer 28.8 · nursery 33.8 · sleeping-quarters 32.2 · kitchens 34.2
    greenhouse 28.4 · graveyard 30.3 · study-library 32.7 · attic 30.6
    lampworks 32.2 · ballroom 33.0 · crypt 27.0 · hedge-maze 37.3
    secret-passages 30.7 · bathhouse 32.5 · kennels 30.4 · pumpkin 35.3
    heart 38.1

**Slope +0.21 Courage per region step. First six mean 31.3, last six 34.1 — a 9%
rise across the whole game.** Meanwhile the player goes from a ten-card deck
holding one Keepsake to thirty cards holding twenty-nine, and finishes holding
**29 of the game's 58 Keepsakes**.

So the mansion is not a ladder because the seventeen chapters authored it at
PARITY. No amount of moving numbers inside the 25-45 band makes a curve out of
it, and that is why this note's per-region list never resolved into one.

### The obvious fix, built and measured and REVERTED

A single depth multiplier on enemy Courage — 1.00 at the Foyer rising linearly
to 2.20 at the Heart, applied in `_makeEnemy` beside `partyHpScale` so summons
scale with their parent, passed in by `state/run.js` so unit-test engines stay
at 1.00 and every region gate keeps asserting authored numbers. Clean to build.
It does not work:

    fights reached   570 -> 488      runs die EARLIER
    past 24 turns     14 -> 23
    past 30 turns      6 -> 13       twice as many _losePatience failures
    attic / bathhouse / heart cost   0.0% / 0.0% / 1.4%  ->  0.0% / 0.0% / 1.1%

**The late game did not move at all.** More Courage on an enemy that cannot get
through the player's Guard does not create threat; it creates a longer fight.
The cost column at depth stayed at zero and the only thing that grew was turns.

Reverted in full. Recorded because the next person to look at this note will
have the same idea, and it costs an afternoon.

### What the measurement actually points at

Cost at depth is **zero**, not small. A wing-five player is not being *lightly*
threatened, they are being missed entirely, so no multiplier on enemy Courage
can reach them. The lever has to be one of:

- **enemy DAMAGE by depth** — the engine has no damage scaling at all today
  (there is no `partyDmg`/`damageScale`; StS2 deliberately does not scale attack
  damage either, and gets its co-op threat from AoE breadth instead), or
- **the Keepsake economy** — 29 of 58 in a finishing run, with treasure, boss,
  Big Scare and Curiosity rooms each handing over ~1.0 per visit, or
- **the player's Guard generation at depth**, which is what is actually
  absorbing everything.

All three are design calls with no authored target in `docs/design/`, which is
the same wall this note hit the first time. The difference now is that the
FLATNESS has a number (+0.21/region) and the obvious fix has been eliminated.

## 2026-09-02, later — the convex curve, tried and reverted

The linear depth-damage curve (1.0 at the Foyer to 2.0 at the Heart) fixed the
finale but left four regions free: at n=200 the Secret Passages cost **0.9% of
the player's pool across the whole wing**, and the Bathhouse 0.7%. Meanwhile the
middle was over-taxed. Squaring the position looked obviously right — take the
tax off the middle, put it on the end — so it was built and measured at three
ceilings:

    curve            heart cost / lost      past-24   past-30   bathhouse   kennels
    linear 2.0       43% /  7 of 20 (35%)     27        13         4%        16%
    convex 3.0       52% / 11 of 19 (58%)     29        12        34%        50%
    convex 2.5       60% / 15 of 24 (62%)     38        17        46%        43%
    convex 2.2       55% / 15 of 28 (54%)     39        18        42%        19%

**It buys the dead tail and pays for it with the finale and with stalled
fights.** Every convex setting more than doubled the Heart's loss rate and the
two gentler ones drove past-30 from 13 to 18 — because more enemy damage makes
the bot block instead of attack, which makes fights LONGER, which is the defect
the whole `_losePatience` gate exists to catch.

Reverted to linear 2.0. The four free regions — secret-passages 2%, bathhouse
4%, pumpkin-grounds 4%, kennels 16% — are still open, and the lesson is that a
single depth curve cannot serve both them and the Heart, because the Heart is
already the one late fight that works.

## The Nursery resists every lever

Its boss is the most stubborn number in the game. At n=200 it sits at 64-65% of
the pool, 23-25pp margin, losing 15 of 23 — and:

  * Courage 175 -> 130 moved the price **62% -> 60%**, and broke her phase-two
    test (`phaseAt` scales the threshold with the pool). Reverted.
  * Damage 22.2 -> 14.6 mean per move moved it **65% -> 64%**.

Her damage WAS a genuine outlier and the cut is kept — 22.2 mean with a 33 max
in region TWO, against the Butler's 14.0 and the Groundskeeper's 11.2 — but it
is not what makes the fight expensive. Neither pool nor damage is the lever, so
the cost lives in her mechanics: the Favorite Doll's redirect, Button Patch
feeding her Guard off it, or the phase-two Repair cycle. That is where the next
attempt has to go, and it should start by instrumenting WHICH of the three the
Courage actually goes to.

## 2026-09-02 — two bosses that no number reaches

The Archivist and the Head Gardener are the last two regions out of band
(study-library 65% of the pool at a 26pp margin, greenhouse 61% at 27pp, against
a band of 37-51%). Every lever was tried on them and measured at n=200:

    THE ARCHIVIST                          cost of pool
      Courage    345 -> 200                72% -> 71%
      damage     12.0 -> 10.0 per move     71% -> 67%
      Catalogue Guard  16/18 -> 10/12      67% -> 65%
      cumulative                           72% -> 65%, 11 of 16 lost -> 8 of 14

    THE HEAD GARDENER                      cost of pool
      Courage    320 -> 225                68% -> 81%   WORSE
      Courage    320 -> 230                68% -> 79%   WORSE
      mature plant Courage 16 -> 10        62% -> 61%
      (all reverted except nothing; he sits at his chapter's 320)

Three levers on one, three on the other, and the best single move was worth
4pp. **Their cost is not in any number; it is in how long they keep the player
there.** The boss ladder says it plainly: the Archivist runs **24.3 turns** and
the Head Gardener **19.7**, against the Butler's 9.8 and the Groundskeeper's
19.6-at-37%-cost.

  * The Archivist Files a tab every four Tricks and hands himself 16 Guard for
    it, so the player's own attacks build his wall, and `Misfiled` interferes
    with their deck every single player turn. Cutting the Guard helped least of
    the three, which says the Corrections and the deck interference are doing
    more than the wall.
  * The Head Gardener's length is the three Beds, and he gets HARDER when he is
    weakened, twice measured - a lower pool does not shorten a fight whose clock
    is the garden, it only moves his phase thresholds.

**So this is a design question, not a tuning one**, and it is the same question
in both cases: is a boss allowed to be twice as long as its neighbours? If yes,
they are correctly priced and the band should have a second tier in it. If no,
the fix is fewer Catalogue consequences and fewer Beds - content edits, not
constants. Nothing here should be tuned further until that is decided, because
six measured attempts have bought 11pp between them.
