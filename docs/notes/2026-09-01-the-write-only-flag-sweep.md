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

### The full verdict list, so the pass is not repeated

A tool that prints candidates is worth nothing until somebody confirms them. All
twelve survivors, checked against their region's design chapter:

| flag | verdict |
|---|---|
| `ballroom.guarding`, `crypt.caging` | the protection really runs on `_curtain` and a status |
| `kennels.tuckedId` | mirrors a `tucked` status the untuck loop scans directly |
| `greenhouse.attackDamage` | zeroed each turn, never incremented |
| `foyer.calledService` | looks like a summon cap that is already `board(c).length < 3` |
| `heart.damageDone` | superseded by the engine's `damageTakenThisTurn`, which `nextMove` reads |
| `heart.restUntil` | the effect is a `costRule`, which carries its own duration |
| `ballroom.drank`, `ballroom.offerId` | the invitation card does the work |
| `harvest-king.markWas`, `governess.lastEmergencyCycle`, `kennelmaster.thought` | records of something already handled |

**All dead weight.** Checking the last one is what turned up something else.

## The Patchwork Giant models its design perfectly and never said any of it

`nursery.lastTorn` records the Patch that just tore off the Patchwork Giant.
Chasing why nothing read it: `docs/design/regions/02-nursery.md` §13 gives the
Giant three **named** Patches, each with its own ability — Bear (+3 damage),
Pillow (6 Guard at the start of its turn), Spring (its first attack each cycle
splits into two at 60%) — and states the identity outright:

> The player feels like they are literally dismantling it.

The code is faithful to all of it: `damageFn` and `hitsFn` on both attacks,
`atkBonus` folding Bear and Loose Stuffing and Coming Apart together, `springs()`
splitting the cycle's first attack, thresholds at 90 / 60 / 30 scaled to `maxHp`.
Every number is right.

**What it never did was say any of it.** `nursery.js` contained no
`announceRule` and no `c.say` at all, so three distinct named abilities reached
the player as a counter reading `patches 2`. Which two, and what the Giant had
just lost, were not readable anywhere. You cannot feel like you are dismantling
something if you cannot see which pieces have come off.

So `lastTorn` finally has the job it was written for: it names the loss. One
card, keyed `patch:<self.id>` so the Giant replaces its own announcement rather
than adding one per tear — three House Rule cards fit and the fourth lands on
the Kid's portrait. The Giant is solo in its only formation, so this is the only
card on the board.

`tests/nursery/check.py` 64 → 71, proved to see: with the announcement removed
all seven go red. The control line is the useful part — it reports
`left ['spring']`, so two Patches genuinely tore and only the **display** was
missing. This mechanic was never broken. It was invisible, which on the quality
bar this project holds is the same thing.

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

## The other shape: read, never written

`--reads` sweeps the opposite direction, which is the more expensive bug. A
field written and never read means a rule the author never finished. A field
**read and never written** means a guard clause that is always false, so a
finished-looking rule silently does nothing — and that is what `summonedBy`
was, across five content sites in three regions.

Getting the signal down to something readable took four passes, and every
false-positive class is worth naming because they are all idioms this codebase
uses constantly:

| pass | candidates | what was wrong |
|---|---|---|
| 1 | 76 | module `export const NAME = …` is not a property write |
| 2 | 76 | object **method shorthand** `springs(c, moveId) {` — how every enemy def declares its helpers |
| 3 | 9 | **logical assignment** `(mem(c).costRules ||= {})` — used constantly for lazy init |
| 4 | **2** | named function parameters with defaults |

**Two survive, and only one is a defect.** `butler.js`'s `removeWorstStatus` is
an optional ctx API called behind `typeof … === 'function'` with a working
`else` branch — defensive by design, though it does mean the richer behaviour
its comment describes has never once run.

## The Bedframe Beast: two dead rules that are one defect

`indirectDamageThisTurn` appears **exactly once in the whole repository** — the
read itself, in `bosses/bedframe-beast.js`:

```js
if (bedframeBeast.isUnderneath(c) && (c.self.indirectDamageThisTurn || 0) >= 18)
```

It is assigned nowhere, so `|| 0` makes it 0 and `0 >= 18` is never true. That
is §23, *"Pulling the Beast out early"* — 18 indirect damage while it is
Underneath drags it into the open, costs it a Scare and makes its next action
Disoriented. **The consequence is fully coded. Only the trigger is dead.**

Chasing why nobody wired it found the larger one. §21:

> While Underneath: **Attack Tricks cannot target the Beast.** Area effects and
> effects that explicitly reach Hidden enemies may still affect it.

The def has **no `isTargetable` at all**, so Underneath hides nothing and you
simply keep attacking it. And that is exactly why §23 could not be written:
with the Beast targetable, "indirect damage" is not a distinction the engine can
make — there is no marker separating a player AoE that splashed onto an actor
from a card aimed at it.

The two are one defect, and fixing §21 makes §23 a one-word change: once an
Attack Trick cannot be aimed at the Beast, every point that reaches it there is
indirect *by construction*, and `damageTakenThisTurn` is the right field.

### Measured, and not shipped

`EnemyDef.isTargetable` is a supported seam with three precedents. So I wired
both and ran it — and HANDOFF's warning about the Wardrobe (wiring
`isTargetable` once produced a Big Scare that could not end) turned out to
apply here too. The Beast is **solo** in its only formation and its cycle is
covers → retreat → scratching → footsteps → BOO, so §21 makes it untargetable
**three turns in five**, against a 297-Courage pool:

    past 24 turns    13 -> 15
    past 30 turns     9 -> 11

**Reverted.** It moves the open defect in the wrong direction. §21 is real and
authored and the fight is genuinely missing its signature mechanic — but it
cannot be shipped without the pool and pacing work that has to come with it,
and that is the same design call the over-30 gate is already waiting on. This
is recorded rather than fixed so the next person does not wire it naively and
discover the same thing.

## What this does not touch

Nothing about the nine over-30 fights. The Topiary Beast is an ordinary
Greenhouse body, not the boss, and `tests/run/run.py` is unchanged at 535 / 87 /
13 / 9. This is a repair to authored content that never ran, not a balance
change.
