# The Guard axis, and three defects that look identical in `turns`

2026-09-01. Nine of 535 fights run past turn 30, where `_losePatience` starts
escalating to guarantee termination. Yesterday I blamed route depth and was
wrong. The Guard axis says what they actually are — and they are not one defect
but **three**, which the `turns` column cannot tell apart.

## The axis nothing was printing

`fight()` in `tests/critic-design/lib/expedition.js` has summed `dmgDealt`,
`dmgBlockedByEnemies` and `enemyGuard` since it was written, and `bench()` has
returned all three. **Nothing ever printed them.** So the mechanism
`combat/engine.js` ~2918 names as the cause of an unfinishable fight has never
been measured:

> An enemy's Guard is wiped at the start of its own turn and re-granted every
> turn, so what the player must beat is its Guard PER TURN, not its Courage … a
> deck that deals less than that can never move its Courage bar at all, however
> long the fight runs.

Both harnesses report it now. `ladder.py` adds **wall** (Guard raised per turn),
**swing** (damage put out per turn, landed plus absorbed) and **absorbed**.
`run.py` adds **wall**, **land** (damage that actually reached Courage per turn)
and **summoned**.

## Every boss, against a constant wing-one deck

    #   region              wall  swing  absorbed      #   region            wall  swing  absorbed
    1   foyer                6.0   16.2    20%        10   ballroom           4.8   10.9    10%
    2   nursery              4.0   14.9     4%        11   crypt              4.2   12.7     7%
    3   sleeping-quarters    2.8   16.5     8%        12   hedge-maze         4.1   12.3     6%
    4   kitchens-cellars     5.9   10.5     6%        13   secret-passages    2.9    8.6    18%
    5   greenhouse           2.7   11.8     7%        14   bathhouse          9.6    7.7    20%
    6   graveyard            3.7    9.8    22%        15   kennels            3.9   15.5     7%
    7   study-library        6.5    7.1    18%        16   pumpkin-grounds    3.4   12.1     6%
    8   attic-observatory    3.1   10.7    15%        17   heart             15.7   11.2    12%
    9   lampworks            2.5   16.0     9%

Three bosses raise a wall at or above the deck's entire output — **study-library
0.92× the swing, bathhouse 1.25×, heart 1.40×** — where the other fourteen sit
between 0.16 and 0.56. The Heart is the ending of the game and it is the
highest wall in it.

## The nine real over-30 fights, and they are three different things

    turns  wing  region             left  wall  land  summoned
      87     3   graveyard           64%   3.2   2.2      72     GUARD STALL
      54     3   attic-observatory   66%   3.1   2.5       0     GUARD STALL
      37     3   study-library       33%   6.0   6.6       0     GUARD STALL
      56     2   greenhouse          68%   2.1   7.5     314     TREADMILL
      55     2   greenhouse          69%   2.4   5.5     201     TREADMILL
      52     3   greenhouse           0%   2.6  13.2     346     TREADMILL (won)
      44     2   greenhouse          33%   2.7   9.9     210     TREADMILL
      69     4   graveyard           27%   3.1   5.8     142     GRIND
      55     2   lampworks           21%   1.4   9.5     122     GRIND

**A Guard stall** is `wall` at or above `land` with nothing summoned: the board
re-raises faster than the deck gets through. The attic-observatory row is the
purest in the game — 3.1 against 2.5, **summoned 0**, two thirds of its Courage
still standing after 54 turns.

**A treadmill** is the opposite reading and it looks the same in `turns`. The
greenhouse boss lands *7.5 a turn for 56 turns* — 420 damage into a 464 board —
and still faces 68% of it, because the Head Gardener keeps planting. That one is
**working as designed**: `plant()` caps concurrent bodies at three Beds and
`sow` becomes `water-the-beds` when they are full, so the fight is a garden you
keep clearing. It is long because the player is killing plants instead of the
gardener.

**A grind** is just a long fight the deck is winning slowly.

They need three different fixes, and **a Courage pool cut reaches only the
grinds.** That is the second reason yesterday's route-scaling plan was wrong.

## One repair: the Watcher printed a rule it did not enforce

`bosses/watcher.js` announces Grounded to the player:

> It takes 25% more damage and **cannot gain Guard until it climbs back.** This
> is your window.

`damageTakenMul` enforced the first half. **Nothing enforced the second** — all
three `c.block(c.self, …)` sites were unconditional — so the window the rule
promises did nothing to the wall, which is this fight's whole defence. Same
shape as the Keeper's Belonging: a boss with a rule it cannot apply.

Gated now in `blockFn` **as well as** in the effect at both sites that declare
Guard on their intent. Gating only the effect would leave Skitter Above
promising 13 Guard on the rail and granting none, which is an intent that lies.
`buildIntent` prefers `blockFn` over the static `block`, so the rail follows.
Timing is safe: Grounded is set during the Watcher's own turn and cleared at its
next `onTurnEnd`, so it is already true when `refreshIntents` draws at
player-turn start.

`tests/attic-observatory/check.py` gates it with the control pair the suite's
own header demands — the same ten turns of the same board, once Grounded and
once not. 48 checks → 53. Proved it can see: with the fix removed both
assertions go red at `maxBlock 13` and `maxIntentBlock 13`.

## What the repair did NOT do, stated plainly

**It did not clear the stall.** The run harness is unchanged: 535 fights,
longest 87, past-24 13, past-30 9, and the attic-observatory fight is still 54
turns at wall 3.1 / land 2.5 / left 66%.

Grounded is set by the Watcher's *own* Great Descent, so the window opens about
one turn in five and only suppresses Guard if that turn happened to be a Guard
move. Meanwhile `wall 3.1 > land 2.5` does not mean the bar never moves — it
moves at 2.5 a turn, which is 142 turns for a 356 pool. So the Watcher is a
Guard **tax** on top of a pool too large for a wing-three deck, not a hard wall.

The repair is worth keeping because an unenforced printed rule is a defect on
its own terms. It is not the fix for the stall, and calling it one would be the
same mistake as yesterday's.

## What would reach the stalls

The axis is now measured, so the question is answerable rather than guessable:
a boss whose wall approaches a plausible deck's swing needs either a cap on what
it can raise per turn, or a reliable answer in the player's deck (pierce, Guard
removal), or a smaller pool so the tax is survivable. Which one is a design
call, and it should be taken against this table rather than against a feeling.
