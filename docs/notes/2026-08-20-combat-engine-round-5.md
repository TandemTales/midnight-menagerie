## 2026-08-20 — combat-engine (round 5)

**590 assertions, 0 failures** (`tests/combat/run.py`). `tests/seams/check.py`
1568 checked / 0 problems. `tests/seams/proof.py` 52/52.

### `engine.stats` — full audit

Nine of twelve counters were live. Three were declared, zeroed every turn, and
**never written by anything**. A counter in that state is worse than a missing
one: content reads it, gets 0 forever, and the mechanic reads as "the designer
wanted nothing to happen".

| counter | was | now |
|---|---|---|
| `cardsPlayedThisTurn` | live | live |
| `cardsPlayedThisCombat` | live | live |
| `attacksPlayedThisTurn` | live | live |
| `skillsPlayedThisTurn` | live | live |
| `cardsDiscardedThisTurn` | live | live |
| `cardsExhaustedThisTurn` | live | live |
| `cardsExhaustedThisCombat` | live | live |
| `damageTakenLastEnemyTurn` | live | live |
| `turnsTaken` | live | live |
| `damageDealtThisTurn` | **DEAD** — zeroed only | **maintained** |
| `damageTakenThisTurn` | **DEAD** — zeroed only | **maintained** |
| `livesSpentThisTurn` | **DEAD** — zeroed only, nothing read it | **DELETED** |
| `damageDealtThisCombat` | — | **added, maintained** |
| `damageTakenThisCombat` | — | **added, maintained** |

`livesSpentThisTurn` is deleted rather than fixed because the engine has no
concept of a Life — Nine Lives is a companion `defineCounter('lives')`, so the
engine could never have written it. Leaving it would keep inviting content to
read a permanently-zero field. Nothing in the repo referenced it. A companion
that wants it should add `defineCounter({ id:'livesSpentThisTurn', resetEachTurn:true })`
or track it in `ctx.meta`.

`damageDealtThisCombat` / `damageTakenThisCombat` were added because the totals
were the thing two different layers actually wanted and both were hand-rolling
them from the event stream.

### What "damage" counts as

Incremented in `damage.js` `applyDamage`, next to the existing per-actor
bookkeeping:

- **`damageDealt*`** — Courage actually removed from a non-player actor by the
  player. Guard absorbing a swing is **not** damage dealt. Multi-hit counts per
  hit. Bristle retaliation and Snack damage count (the player is the attacker).
- **`damageTaken*`** — Courage actually removed from the player, by anything,
  including Dread ticks and self-inflicted `loseHp`.
- A hit negated by `onIncomingHit` counts as nothing, because it returns before
  any of this.

That is the same definition the run layer's end screen uses (`ev.hpLoss`), so the
two can never disagree.

### Lifecycles

`*ThisTurn` counters reset at the **start of the player turn**, so they span the
player turn *and the enemy phase that follows it* — deliberately the same
lifecycle as `actor.damageTakenThisTurn`, which the enemies contract depends on.
`*ThisCombat` never reset.

This matters for the Butler: his rule is `when: 'turnEnd'`, and the end-of-turn
rule sweep runs in `endTurn` step 3, long before the next turn's reset. Tested
explicitly — the sweep sees the full turn total and the counter only zeroes
afterwards.

### The Butler's Roughhousing rule

`RuleCtx.damageDealtThisTurn` is now real, so
**`no-roughhousing` fires at its authored threshold.** Tested end to end at the
real configuration: Scratch (6) + Flurry (3×3) = 15, `when:'turnEnd'`, rule
breaks once.

`data/bosses/butler.js` can drop its `roughhousingThisTurn` workaround and the
`Math.max(...)`; `broken: (rc) => (rc.damageDealtThisTurn || 0) >= 15` is enough.
Note the semantics widen slightly in the boss's favour: the workaround counted
only damage done **to the Butler**, the engine counts damage dealt to **any**
enemy that turn. That is the correct reading of "dealing 15 or more damage this
turn", but it does mean the rule is now easier to break in a fight with minions —
worth a balance glance.

### The trap can't come back

`tests/combat/suite.js` now carries a `STAT_CONTRACT` list and two sweeps:

1. the declared key set must equal the contract exactly — a new counter that is
   added without being documented fails, and so does a documented one that is
   removed;
2. a scripted fight must **move every single counter**; any counter left at 0
   is named in the failure message.

Adding a counter to `engine.stats` now means adding it to `STAT_CONTRACT` and
making a real fight write it, or the suite goes red.

### "DAMAGE DEALT 0" — not this root cause, already fixed run-side

Checked: `state/run.js` does not read `engine.stats` for that number. It
accumulates from the `damage` event stream (`run.js:752`, filtered to
`sourceId === player && targetId !== player`, summing `hpLoss`), and the run-layer
agent has already fixed it — there is a comment there naming the old bug. Nothing
for me to change, and the fix is independent of this one.

If that agent would rather not maintain a parallel accumulator, they can now read
`engine.stats.damageDealtThisCombat` at `combat:end` instead — it is the same
number by the same definition. Their current approach also survives a mid-combat
save/resume, which reading the engine at the end may not, so this is their call,
not a bug.
