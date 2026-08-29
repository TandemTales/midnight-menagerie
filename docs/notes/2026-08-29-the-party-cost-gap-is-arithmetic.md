# The party-cost gap is arithmetic, and one move in the game beats it

2026-08-29, third session block. Branch `dev`.

HANDOFF has carried "a party finishes too comfortable" as the standing balance
item for two sessions. It is not a mystery and it is not per-encounter. It is a
identity, and every encounter in the game sits within a few points of it.

---

## 1. The model

At four Kids the party's Courage pool is about 4x and its damage output is about
4x, so a fight runs `poolScale / 4` as long as a solo one and the enemy delivers
that share of its solo total into four times the pool:

```
cost4  =  costSolo  x  (poolScale / 4)  /  4
```

with **no multiplayer content at all**. Whatever an encounter actually costs
BELOW that prediction is exactly what its targeting, splash and pierce buy.

Measured against the un-conditioned `courageLeft` in the saved ledger rows —
not `left%`, which is wins-only (CONTRACTS 51):

| encounter | solo left | 4p predicted | 4p measured | content buys |
|---|---|---|---|---|
| Foyer elite tier | 49.5% | 82.0% | 82.8% | **−0.8** |
| Butler | 15.7% | 83.1% | 82.8% | **+0.3** |
| **Governess** | 41.0% | 81.6% | 76.2% | **+5.3** |
| Toy Chest | 74.5% | 90.9% | 94.8% | **−3.9** |
| Patchwork Giant | 54.5% | 83.8% | 93.7% | **−9.9** |
| Porcelain Twins | 72.0% | 90.0% | 93.7% | **−3.6** |

The prediction lands within a point on two of the six with no fitting at all.

**Only the Governess beats it**, and the reason is one move: Sharp Correction
ignores Guard in a party. Toggling that pierce off and re-measuring with the
repaired bot moves her 4p Courage-left 78% → 87% and her cost 61.6 → 21.6 —
nearly a third of the bill, from one flag on one attack.

## 2. Why targeting is not enough, demonstrated

The doc's stated compensation for "damage values normally remain unchanged" is
that "enemy effects gain multiplayer targeting logic instead" (foyer §26).
CONTRACTS 45 already said that is necessary and not sufficient. Here is the
quantity.

The Patchwork Giant declared no `partyTarget`, no `partyPick` and no `splash` on
either attack, so `intentTargetFor` rolled ONE seat and held it (trap 38). Three
fixes, measured one at a time, solo byte-identical at every step:

| | 4p left | buys |
|---|---|---|
| no targeting at all | 93.7% | −9.9 |
| `partyPick: 'lowestCourage'` (§29) | 91.0% | −7.3 |
| **+ Wild Flail `partyTarget: 'all'`** at the full number (§27) | 85.8% | **−2.0** |

**A pick SPREADS damage; AoE and pierce ADD it.** Rotating the target recovered
2.6 points, because the same output landed somewhere less wasteful. Making one
of two attacks hit everybody recovered 5.3 more, because at four Kids it is
four times the output. That is the whole of the difference between the two
levers, and it is why no amount of `partyPick` closes the gap.

`aimed` at four Kids goes 79.8 → 194.9 on that one change; `%blocked` climbs
68 → 77.4, which is the party's Guard doing its job, and `landed` still rises
25.5 → 44.1.

## 2b. Pierce is the lever; coverage is not

The Giant's ladder above stopped at −2.0 with coverage alone. Running the same
experiment on a SECOND encounter, and then adding the third rung to both,
settles which lever does the work:

| | Toy Chest | Patchwork Giant |
|---|---|---|
| no targeting | −3.9 | −9.9 |
| + `partyPick` | | −7.3 |
| + full-number AoE | −2.6 | −2.0 |
| **+ pierce on the focused attack** | **+2.1** | **+7.5** |

Coverage bought 1.3 points on the Chest and 7.9 on the Giant, and neither
reached the baseline. **Pierce bought 4.7 and 9.5 and flipped the sign on
both.** Solo is byte-identical at every rung of both ladders.

The reason is visible in `%blocked`. Adding a full-number AoE to the Chest took
`aimed` at four Kids from 53.8 to 96.1 — and `%blocked` from 70.4 to 78.8, so
the party simply blocked the extra. Adding pierce took `%blocked` back down to
64.3 and `landed` from 20.4 to 35.3. **A party's Guard budget scales with the
party and with the length of the fight, so any output you add to a blockable
move is absorbed; only damage Guard cannot touch is kept.**

This is CONTRACTS 45 with a quantity attached, and it now rests on three
independent encounters — the Governess's pierce toggle (+5.3 with, ~0 without),
the Chest and the Giant.

## 3. What this means for the standing item

- The gap is **not** an encounter-by-encounter mystery. It is one identity plus
  whatever each fight's multiplayer content is worth, and most of it is worth
  nothing or less than nothing.
- **Negative is possible and common.** An enemy that holds one Kid is WORSE
  against a party than an enemy with no multiplayer logic at all, because its
  output lands on a seat that is already over-Guarded or already down while the
  rest of the table swings freely.
- To make a four-Kid fight cost what a solo fight costs, an encounter needs
  roughly **four times its solo output**, which means most of its damage AoE, or
  pierce on enough of it that the party's Guard stops mattering. Nursery §27 is
  explicit that the per-head number should NOT be cut to pay for coverage
  ("individual enemy attack damage generally remains close to solo values"), so
  the full-number sweep is the doc's own default and it is what was used here.

The remaining targets, in the order the table ranks them: the Toy Chest (−3.9)
and the Porcelain Twins (−3.6) both declare no targeting on their attacks
either. The Butler is at par and the Foyer elite tier is at par; neither is
cheap to move, and both would need pierce rather than more coverage.

## 4. Instrument notes

`tests/critic-design/party-ledger.py` prints `win%` beside `left%` now. Two
defects in that one column were fixed on the way here — it was quantised to
multiples of ten by a `mean()` that rounds before the multiply, and it is
wins-only, which inverted the ranking of the three Nursery elites. CONTRACTS 51.

The model in §1 should be re-derived, not trusted, whenever `PARTY_HP_SCALE` or
a per-enemy `partyHp` changes: `poolScale` is the only free parameter in it.
