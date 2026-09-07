# The Guard wall that was a bot passing its turn

2026-09-06. Continues `2026-09-06-the-other-half-of-the-fixture-farm.md`, whose
closing section names `957908 greenhouse/scuffle` — *"a genuine Guard wall, in
ORDINARY content rather than a boss … the cleanest wall-shaped fight left in the
game and the next thing worth pulling"* — and attaches a warning: four confident
wrong causes so far, so **get a discriminator before naming a cause.**

The discriminator says it is not a Guard wall. It is the bot declining to play.

---

## `wall` counts Guard GRANTED, not Guard that stopped anything

That is the whole reason the fight reads as a wall. An enemy's Guard is wiped at
its own turn start and re-granted, so Guard the deck never tests adds to `wall`
exactly as much as Guard that ate a hit. A board carrying one big idle body
reads as a wall whether or not anything was ever swung at it.

`tests/run/probe.py` (new) replays ONE seeded expedition through the same
`simulate()` the gate runs and splits that one column into three, per body:

    body            maxHp   raised   consumed   wasted   landed   hits
    Glassvine        34      365        75       290       62      17
    Creeping Ivy     29       27         9        18       31       6
    Potling          23        0         0         0       25       3
    Seedling          6        0         0         0        6       1
    TOTAL                    392        84       308      124

**79% of the Guard this board raised was never tested by a hit.** `wall 10.3`
against `land 3.3` is not a board out-raising a deck; it is a board raising
Guard into a deck that mostly was not swinging.

## What the deck was doing instead: nothing, with a full hand

Per round, sampled BEFORE the bot acts:

    turn  bodies  hp   nerve  hand  legal  onBoard  played  landed
      6      1     34    3      7     7      15        0       0
      7      1     34    3      7     7      10        1       0
      8      1     34    3      7     7       5        0       0
      9      1     34    3      7     7      15        0       0
     ...                                                (eleven turns)
     16      1     34    3      7     7      10        1       0

Three Nerve, seven cards, **all seven legal**, and nothing played, while the
Glassvine sat at full Courage. `cpt 1.4` against a healthy 1.5–2.6.

## The bot's own numbers say the pass won

`planTurn` seeds `best` with the EMPTY sequence and replaces it only on
`score > best.score`, so a pass is the incumbent and wins every tie. Its own
debug trace, on the turns it passed:

    turn 6    (pass) 51.6    Share the Blanket+ 51.6    Bury This! 51.6
    turn 9    (pass) 43.7    Good Dog Emergency 43.7    Cemetery Map 43.7
    turn 11   (pass) 42.9    Little Chomp+ 42.1         Little Chomp+ x2 41.7
    turn 14   (pass) 42.0    Little Chomp+ 41.5         + Protective Nip 41.6

Two separate things. Several candidates tie *exactly* and lose to the incumbent.
And **attacking scores strictly worse than doing nothing** — and worse again for
a second attack.

## Why attacking prices as a loss, and it is not Guard

`glassvine` is not a wall enemy. It is a **one-turn damage threshold** (§8):

    onDamaged      every Attack that damages it costs the player 2 Courage,
                   up to three times a turn
    onPlayerTurnEnd  15 Attack damage IN ONE TURN shatters the coating

The cost of attacking lands in `me.hp`, which `projectedValue` reads directly.
The payoff is `mem(c).shattered` — a memory flag — plus an `exposed-sap` status
that `residual()` does not count, since it scores `haunt`, `weak` and
`vulnerable` by name and nothing else. **The cost is visible to the scorer and
the payoff is invisible, so the bot correctly computes that attacking is pure
loss.** It took 34 of its 43 Courage that fight from its own attacks' thorns.

A deck swinging 5.5 a turn can never reach 15 in one turn, and the bot has no
reason to try. It is self-fulfilling: one card gets absorbed, scores zero, so it
plays fewer cards, so it swings less.

**This is a class, not one vine.** Twenty-seven one-turn `dmgTaken` thresholds
ship across eight regions and six bosses, at 10, 12, 14, 15, 16, 18, 20, 22 and
25 — against a bot whose measured swing in ordinary content is 5–16.

## The controlled test

Play *only* `gh-12` naively; leave the whole expedition to the competent bot, so
the same deck arrives at the same board and exactly one variable moves. Every
fight before it is identical in both runs.

    gh-12          turns  cost  swing  land  wall   abs   cpt
    competent        38    37    5.5   3.3   10.3   40%   1.4
    naive            13    31   15.8   9.3    9.4   41%   3.2

**`wall` barely moved and `abs` did not move at all.** The wall is the board's
and was measured correctly all along; `swing` was measuring the bot — the same
sentence the guard-axis note ended up writing about the boss table. The naive
line also took LESS Courage, so the turtling was not buying survival.

`abs` holding at ~40% across both is what killed my own leading hypothesis
before I built on it. I had reasoned the fix was "credit damage the Guard
absorbs". If Guard absorption were the mechanism, it would have separated the
two runs. It does not. That would have been wrong cause number five.

## The fix

One clause in `competentTurn`. The naive floor already exists for exactly this —
*"so the competent bot is never worse than the naive one by construction"* — but
was taken only on `heur.score > baseline.score`, judged by **the same scorer the
floor exists to correct**, so wherever that scorer is blind the floor loses to
the pass. The promise in its own comment was false; the controlled test above is
the counterexample.

    if (heur && (heur.score > baseline.score
                 || (!baseline.seq.length && heur.score > -1e5))) baseline = heur;

The beam may still choose to pass — but not while a plain "block the telegraph
and swing the rest" turn exists that does not get the seat killed.

## Measured, n=200, same seeds, only that clause moving

Five predictions were written down before the run
(`predictions.md`, reproduced in the commit). Three held, one held trivially,
**one failed**.

    the target fight       38 turns -> 11      (naive line was 13)
    past 30                     15 -> 12
    past 24                     32 -> 30
    longest fight               49 -> 51       WORSE
    victories                   13 -> 13       unchanged
    fights                    2430 -> 2415
    board >40% alive at n=50     1 -> 0

Downstream of the target fight the run gets further: `gh-14` flips from a
run-ending defeat to a win and the expedition reaches the greenhouse boss.

### The prediction that failed, and I am not burying it

I predicted the blast radius would track the mechanism — regions carrying
one-turn thresholds moving most, regions without them unchanged. That is the
test I called "the strongest, the one a merely-plausible cause would not make".

**It did not show.**

    mean turn change, regions WITH a one-turn threshold   -0.10  (n=9)
    mean turn change, regions WITHOUT                     +0.05  (n=8)

Greenhouse (−0.6) and graveyard (−0.5) are the two largest movers and both carry
thresholds, but at 35 and 31 fights that is two small samples, not a gradient.
The foyer carries a threshold (Snag at 18) and moved 0.0 across 864 fights.

The honest reading is that **the clause fires rarely** — it only engages when the
beam chose to play nothing at all, which healthy fights never do. That is
prediction 2 confirming (nothing else moves) at the cost of prediction 4. It
means the fix is narrow and cheap, and it also means **I have not shown that the
27 thresholds are a live problem in aggregate.** One fight is measured. The
class is real in the source; its cost across the game is not measured, and the
next person should not quote it as though it were.

### And the longest fight got longer

49 → 51, `bones` seed 8717, secret-passages boss — a summon treadmill at
`left 0%`, the shape both prior notes established as working as designed. The
tail as a whole is shorter (past-24 and past-30 both down); the single longest
is two turns longer. One seed, and the same small-sample caveat the fixture-farm
note attached to its own headline applies here in the other direction.

## What is NOT claimed

- Not that the greenhouse is fixed content-side. Nothing in the region moved.
- Not that `_losePatience` is solved. **The gate still exits 1** — 12 of 2415
  past turn 30 at n=200, 5 of 643 at the shipping n=50.
- Not that the 27 thresholds cost the game anything in aggregate. Unmeasured.
- Not that this reaches the remaining tail. It does not: every other fight in
  the top ten runs `cpt 2.4–3.8` at `left 0%` with high `summoned`, which is the
  treadmill both prior notes describe, and no bot change reaches those.

## Gates

    38 × tests/*/check.py       all green
    tests/run/run.py            50 runs, 1 error (the documented one)
    tests/run/run.py --runs 200 2415 fights, 1 error
    tests/coop/run.py           645 passed
    tests/critic-design/anchor.py  5/5 agree
    tests/vote/run.py           35 passed
    tests/cards/run.py          1470 cards, 0 errors
    tests/combat-scene/seam.py  22 passed
    tests/sprites/clips.py      28 passed
    determinism 5/5 · resume 3/3 · localStorage 3/3 · mid-fight 3/3

## The instrument

`tests/run/probe.py` + a `?probe=` mode in `tests/run/index.html`, off unless
asked for. It replays one seeded expedition through the gate's own `simulate()`
— not a reconstruction, which would give a different deck and a different RNG
stream — and prints Guard per body split into raised / consumed / wasted, the
per-round table above, what the deck played against what it held, and with
`--why` the bot's own candidate scores on the turns it passed. `--naive <encId>`
runs the controlled test on one encounter.

Proof it is neutral when off: the n=200 baseline was run with all of it already
in the file and reproduced the previous session's numbers exactly — 2430 fights,
longest 49, past-24 32, past-30 15.

**Read `raised` against `consumed` before calling anything a wall.**
