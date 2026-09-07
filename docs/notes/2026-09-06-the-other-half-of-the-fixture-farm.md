# The other half of the fixture farm

2026-09-06. Continues `2026-09-01-the-guard-axis.md`, whose last section names
this fix and marks it *"Not yet done, and deliberately"*. Half of it had since
been built; this is the half that had not.

---

## What was already fixed

`residual()` paid a flat **34 for every body that stopped being alive**, so the
bot farmed the Drowned Matron's Drain — one move, `Intent.SLEEP`, `effect(){}`,
re-summoned whenever it repairs:

    kill the 18-Courage Drain     34 + 0.15 x 18  =  36.7
    hit the Matron for 18          0.15 x 18      =   2.7

`canHurt()` and `pool.threats` fixed that: the kill bonus is paid on bodies with
a damaging move only, `becomes` counts (a seed is a threat — the Greenhouse
regression proved it), and unknown shapes count as threats so the predicate can
only ever remove credit.

## What was left

The **damage** term still summed the whole board:

    v += 0.15 * Math.max(0, before.enemyHp - pool.hp);

`pool.hp` is every living body, fixtures included. So the ten-to-one farm became
a one-to-one farm — and one-to-one is not neutral, because **Guard comes off the
pool before Courage does**. The Drowned Matron raises 9.1 Guard a turn; her
fixtures carry none. Per point of damage the sleeping grate was strictly better
value than the boss standing behind it.

## Measured before building, and it was not close

Seed 572058, `competentTurn`, the boss the run gate reported at 51 turns.
Damage that reached Courage, by target:

    deck        turns   bath-drain        drowned-matron
    truffle       42     113  (48%)         123  (52%)
    marmalade     46     130  (60%)          85  (40%)
    bones         54     117  (51%)         112  (49%)

**About half of the deck's entire output, across three companions, went into an
18-Courage grate that does nothing and repairs itself.**

## The fix

`enemyPool` tracks `threatHp` beside `hp`; the damage term pays on `threatHp`.
`hp` and `living` keep their meanings — `living` is the win check and `hp` feeds
`projectedValue`'s `turnsLeft`, which asks "how long until everything is dead",
and everything really does have to die.

Same fight, after:

    deck        turns   bath-drain        drowned-matron
    truffle       45      141 (39%)         218 (61%)
    marmalade     45       11  (8%)         127 (92%)
    bones         45       65 (29%)         157 (71%)

## A prediction made before the run, and it held

The `canHurt` header records that nine summon-only non-damaging bodies respawn,
including **the Secret Passages' doorframes** — and the run gate's three longest
fights were `secret-passages/boss` with `summoned` 78-196. So those specific
fights should shorten. Stating it first matters: a prediction the mechanism
makes in advance is much stronger than a table fitted afterwards.

    n=200                            before      after
    fights                            2454        2430
    longest fight                    65 turns    49 turns
    past 24                             35          32
    past 30 (`_losePatience`)           17          15

    seed 379133  secret-passages   60t summoned 196  ->  44t summoned  36
    seed 8717    secret-passages   56t              ->  49t
    seed 572058  bathhouse         51t left 62%     ->  40t left 17%
                                      summoned 763  ->      summoned 299
    seed 1243437 ballroom          65t              ->  off the top ten

**A caveat I expected to bite and did not.** The Whisper Warden's Latches are
sleeping fixtures too, and §35 makes destroying them the intended way to finish
that fight — so removing the chip incentive could have made it *longer*, the
way the Greenhouse got worse when seeds stopped counting. It did not: those are
the fights that improved most, because the bot now spends the turn on the Warden
instead of chipping a Latch it was never going to finish. Worth writing down
that the risk was real and the direction was checked rather than assumed.

## What it did to the balance, which is the thing to be careful about

Changing the bot changes every number measured with it. n=200, same seeds, only
this term moving — every region inside noise:

    defeat/bathhouse   11 -> 8     the region the farm was worst in
    defeat/foyer       73 -> 73    no fixtures, so nothing should move: nothing did
    victories          14 -> 13
    boss door          every region within 3pp of pool except crypt (n=4) and
                       pumpkin-grounds (n=3), both too small to read

`anchor.py` still agrees 5/5 — `partyBench(size 1)` reproduces `bench()` fight
for fight — and determinism, resume, localStorage and mid-fight resume all pass.

## It is an improvement, not a cure

**The gate still exits 1.** Fifteen fights of 2430 still pass turn 30 and the
longest is 49. What is left is not this farm:

- `957908 greenhouse/scuffle`, **38 turns, unchanged** — `wall 10.3` against
  `land 3.3` at `abs 40%`. That is a genuine Guard wall, in ORDINARY content
  rather than a boss, and no fixture change reaches it. It is the cleanest
  wall-shaped fight left in the game and the next thing worth pulling.
- The rest are treadmills the deck is winning (`left 0%`) with high `summoned` —
  the shape the guard-axis note established as working as designed for the Head
  Gardener, now visible on the Matron and the Warden too.

`engine.js`'s claim that `PATIENCE = 30` is "deliberately far outside reachable
play … nothing a player will ever see is touched by this" remains **false**, and
is worth correcting or re-deciding rather than leaving as a comment the gate
contradicts on every run.
