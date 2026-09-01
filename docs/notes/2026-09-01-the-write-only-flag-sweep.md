# The write-only flag sweep

2026-09-01. Every dead seam this project has found has the same shape: a field
that is written and never read, or read and never written. `actor.summonedBy`
was read by five content sites and written by nothing. The Watcher's `grounded`
was written, and read only by the half of its own rule that worked.

So: scan every file in `data/bosses/` and `data/enemies/` for `mem` keys that are
assigned and never consulted, and check the candidates by hand.

## The instrument, and the mistake in its first version

The first pass looked for reads **inside the same file** and reported 26
candidates. That is wrong, and this codebase says so out loud —
`enemies/heart.js` documents `remnant: true` as "what the Housekeeper's Tidy Up
looks for", a flag written in one file and read in another. A within-file scan
turns every cross-file convention into a false positive.

Re-checked repo-wide across `game/src`, **14 keys are genuinely never read
anywhere**:

    preheated  thought  calledService  damageDone  caging  tuckedId  shelled
    drank  offerId  markWas  restUntil  lastEmergencyCycle  lastTorn  attackDamage

## Thirteen of them are dead weight, and that is the useful half of the answer

The handoff's own test is whether the thing makes a CLAIM. Almost none of these
do — they are bookkeeping that a working mechanism made redundant:

* `ballroom.guarding` and `crypt.caging` track which ally is being protected,
  but the protection actually runs on `pick._curtain` and a status, both of
  which **are** read. The rule works; the field is spare.
* `foyer.calledService` records that the Calling Bell rang, but the summon cap
  it looks like it should enforce is already `board(c).length < 3`.
* `heart.damageDone` is zeroed in two places and never incremented — superseded
  by the engine's own `c.self.damageTakenThisTurn`, which `nextMove` reads.

None of those cost the player anything. **There was no second Watcher among
them**, and that is worth recording so nobody runs this sweep again expecting
one.

## The fourteenth was real: the Topiary Beast never got its shell bonus

`docs/design/regions/05-greenhouse.md` §7 authors the Tortoise form in two
sentences:

> **Leafy Shell** — Gain 14 Guard. **Its next attack deals 4 additional damage.**

The implementation was `effect(c) { c.block(c.self, 14); mem(c).shelled = true; }`
and **nothing read `shelled`**. The second sentence never happened, in any
fight, ever.

It is dead twice over. The Haunt envelope carries `h.flags.shellBonus = 6` at
level ≥ 8 for a consumer that does not exist either — and its own printed note,
*"Haunt 8: a shelled Tortoise adds 6 to its next attack, **not 4**"*, asserts
the base 4 that is also missing. Two layers of authored content and a sentence
shown to the player, resting on one unread flag. (And ≥ 8 is above
`MAX_HAUNT = 5` regardless — see the Haunt ceiling note.)

### Why it was invisible

`mem` is the wrong container and this file's own header says so: *"each enemy's
is its own displayed **counter**, read by its own `damageFn`."* HANDOFF gives
the mechanism — **writing a counter calls `refreshIntents`; writing `mem` does
not.** A `mem` flag cannot move the intent rail, so even a correct
implementation hung off `mem` would have surprised the player when the attack
landed. The counter form is both the fix and the reason the bug could hide.

### The fix

`setCnt(c, 'shell', flag(c, 'shellBonus', 4))`, read by `damageFn` **and** by
the effect from the same counter so the rail and the hit cannot disagree, and
spent on use.

The bonus is on the **attack**, so a two-hit attack splits it rather than
doubling it. Measured by the new gate:

    plain     Hedge Hop  4 x 2  =  8
    shelled   Hedge Hop  6 x 2  = 12      +4 on the attack, as authored

`tests/greenhouse/check.py` 33 → 37, with the control pair the suite uses
everywhere. Proved it can see: with the fix removed the rail reads `4 vs 4`, the
total `8 vs 8`, and the counter is left unspent at 4.

`tests/enemies/audit.py` stays at 19808 turns / 0 errors, which is what says the
new `damageFn` and the effect agree — an intent that promised 6 and hit for 4
would be the expensive version of this fix.

## What this does not touch

Nothing about the nine over-30 fights. The Topiary Beast is an ordinary
Greenhouse body, not the boss, and `tests/run/run.py` is unchanged at 535 / 87 /
13 / 9. This is a repair to authored content that never ran, not a balance
change.
