# The 44-turn grind was the instrument

2026-08-29, second session. Branch `dev`.

Two things were wrong and both were in the test harness rather than the game.
One had been red since the day it was written while printing that it passed; the
other had been believed, written into three documents as a fact about the game,
and scoped as the next piece of work.

---

## 1. `tests/net/run.py` had never once exited 0

The suite fails on any console error, which is right — a 404, a `TypeError`
inside a listener, a `[net] unknown input kind` — that is the silent breakage it
exists to catch. But three of its own checks provoke a console error on purpose:

- a board drifted behind the other client's back (`reason: digest`),
- a peer arriving on a different seed (`reason: seed`),
- a client trying to issue an input for somebody else's seat (trap 36).

`session.js` shouting about all three is the product working. So the runner
returned 1 from `4a33115` onward while its last line read

```
RESULT: 128 passed, 0 failed
```

and that line is what a human reads. HANDOFF recorded the suite as green. So did
the handoff prompt for this session. The exit code was checked by nobody until
the battery was run by a script that collected exit codes instead of eyeballing
tails.

**The fix is a declaration, not a mute.** The page calls `expectError(substr,
why)` next to the check that provokes each one, and the runner partitions the
console against those declarations. Two ways to fail instead of one:

| | |
|---|---|
| an error nobody declared | `UNEXPECTED CONSOLE ERRORS` |
| a declaration that never fired | `DECLARED BUT NEVER REPORTED` |

The second half is the point. A whitelist that can only mute is trap 12 wearing
a different hat: the day divergence stops being reported at all, a gate with
only the first half goes quiet along with it.

Verified in both directions rather than assumed. With an undeclared
`console.error` and a declaration whose substring nothing emits both injected
into the page, the runner exits 1 and names both. Control reverted.

**A third deliberate error was invisible until the other two were named.** The
blanket gate printed the two DESYNC lines and stopped, so the seat-spoofing
refusal at line 167 had never appeared in any output.

---

## 2. Four Kids were not grinding. Four Kids were turtling.

HANDOFF carried this as the largest open item in the game:

> the ELITE tier at three and four Kids is a 44-turn grind … the cause is the
> global `PARTY_HP_SCALE` … the seam is per-enemy `EnemyDef.partyHp`, nine elite
> encounters, each wanting its own bracketing sweep.

The first move was to measure ONE encounter instead of the tier, because an
aggregate cannot say which enemy is at fault and nine curves off one aggregate
reading would be nine guesses. The Grand Coatcheck alone, n=12:

```
party    n   aimed  landed  %blocked  partyGuard  turns  left%
1p      12    67.3    32.0      52.5        49.2    6.9     70
2p      12    80.5    20.4      74.7       144.6    8.3     80
3p      12   272.2    31.6      88.4       577.7   23.3     80
4p      12   596.7   113.3      81.0      1993.2   49.7     90
```

**Four Kids raised 1993 Guard to stop 483 damage.** They finished holding 90% of
their Courage. That is not a party being ground down by too much enemy Courage;
that is a party refusing to attack.

The arithmetic says the same thing. The Coatcheck's pool is 104 solo and 592 at
four Kids. Solo kills it in 6.9 turns — 15 damage a turn. Four Kids take 49.7 —
11.9 a turn between them, **3.0 each, against 15 alone.**

### The line

`lib/bot.js projectedValue()`:

```js
const turnsLeft = Math.min(28, (pool.hp + pool.block * 0.6) / dps);
```

`dps` is one seat's damage rate. `pool.hp` is the whole board's Courage, and the
whole board's Courage is party-scaled. So the expression asks *how long until I
kill a 5.7x pool by myself*, and at four Kids the answer is the 28-turn cap — on
every seat, in every fight, from the first turn.

`turnsLeft` then multiplies the Guard term:

```js
const lossPerTurn = Math.max(0, threat - sustain);
let v = me.hp - turnsLeft * lossPerTurn;
```

So four Kids valued Guard four times as highly as one Kid, while the damage
actually aimed at each of them had fallen fourfold. Both errors point the same
way and they compound.

The fix divides by the table:

```js
const standing = t.players
  ? Math.max(1, t.players.filter(p => p.alive && !p.fallen).length)
  : 1;
const turnsLeft = Math.min(28, (pool.hp + pool.block * 0.6) / (dps * standing));
```

At one standing seat this is the expression it has always been, which is the
control: `anchor.py` still reads 6/6, and every 1p row below is unchanged to the
decimal.

### What changed

Grand Coatcheck, same seed, same captured loadouts:

| party | turns | partyGuard | landed |
|---|---|---|---|
| 1p | 6.9 → **6.9** | 49.2 → **49.2** | 32.0 → 32.0 |
| 2p | 8.3 → 8.4 | 144.6 → 149.4 | 20.4 → 19.7 |
| 3p | 23.3 → **8.8** | 577.7 → 217.3 | 31.6 → 15.7 |
| 4p | 49.7 → **8.6** | 1993.2 → 475.3 | 113.3 → 17.4 |

The whole Foyer elite tier, which is the table HANDOFF quoted:

| party | turns | %blocked | partyGuard | left% |
|---|---|---|---|---|
| 1p | 9.4 → **9.4** | 57.6 → 57.6 | 63.8 → 63.8 | 60 → 60 |
| 2p | 13.3 → 11.3 | 68.3 → 66.9 | 221 → 204 | 70 → 70 |
| 3p | 35.5 → **12.5** | 73.7 → 66.7 | 796 → 308 | 60 → 80 |
| 4p | 43.7 → **13.0** | 74.7 → 68.8 | 1943 → 733 | 60 → 80 |

Standard tier, `tests/coop/balance.py --n 24`: 100% wins at every party size,
turns 5.6 / 6.6 / 7.7 / 8.1, zero falls. **The global `PARTY_HP_SCALE` is
defensible as it stands** and the brief's instruction to leave it alone survives
the re-measurement.

### What this was also the cause of

> Party damage output does not scale with party size the way the Courage pool
> does, and no multiplier fixes that; it is the same structural point as the
> cliff above.
> — `docs/notes/2026-08-28-butler-aoe-and-a-broken-instrument.md` §8

That sentence, or a paraphrase of it, appears in that note, in the 2026-08-29
note, in HANDOFF and in `butler.js`'s own source comment above its `partyHp`
override. It was not structural. It was this line.

It is the third defect of its kind in `bot.js`, after the whole-board
`shownIncoming` and the clone-scoring `seatOf`, and the only one that had been
promoted from a measurement to a belief.

### The gate that was missing

`anchor.py` proves `partyBench()` at ONE Kid reproduces `bench()` fight for
fight. It passed throughout, and it could not have failed: at one standing seat
the broken expression and the fixed one are identical. Nothing checked the
harness above one seat, which is where a co-op bug lives by definition.

`tests/critic-design/party-turns.py` is its sibling. Two bounds, deliberately
independent, because one number moving is a story and two moving together is a
mechanism:

- four Kids finish within **2.0x** solo's turns,
- and raise under **20x** solo's Guard doing it.

```
with the fix     turns 1.49x   guard 15.08x   PASSED
without it       turns 7.94x   guard 60.07x   FAILED (both)
```

and the 1p row is 6.7 turns / 38.2 Guard in both runs — the control inside the
control. The bounds are generous on purpose: this is a gate against a bug class,
not a balance target, and it should fire only when the harness has stopped
describing a game anybody would play.

---

## 3. What is now the honest open item

Length is fixed. **Cost is not.** A party still finishes far too comfortable:

| | solo | 4 Kids |
|---|---|---|
| Foyer elite `left%` | 60 | 80 |
| Foyer standard `left%` | 61 | 84 |

This is trap 45's shape and it now has nothing to hide behind: Guard scales with
the party and per-seat, enemy damage deliberately does not, so the lever is
TARGETING and not Courage. The Governess round proved a bigger printed number
does nothing and one move a party's Guard cannot answer does.

The Foyer's three elites divide cleanly on exactly that:

| elite | its §27 multiplayer content | targeting on its attacks |
|---|---|---|
| Unwelcome Guest | per-Kid Familiarity, Too Familiar aims at the most Familiar Kid | implemented in full |
| House Bell | shared summons, any Kid's kill drops Resonance, MIDNIGHT TOLL hits all | implemented in full |
| **Grand Coatcheck** | Snag threshold ×players — and that is all §27 gives it | **none: no `partyTarget`, no `partyPick`, no `splash` on any of its three attacks** |

So the Coatcheck picks one Kid on turn one and keeps them for the whole fight
(trap 38), while three Kids hit it for free. The doc is SILENT on its targeting
— every other Foyer enemy got an explicit rule in §26/§27 and it did not — which
under non-negotiable 8 makes authoring one legitimate, and its three tells
already describe wide attacks ("a single wide arc", "a stinging, chattering
wave", "all lean toward you together"). Measured and pointed at, not authored:
that is a design decision and trap 40 is explicit that cadence, not instinct,
decides what a per-head cut should be.

The nursery elites are not in the same position — the Toy Chest implements its
per-player Slam threshold and its 2/3 summon cap, and the Patchwork Giant's Patch
thresholds are already proportional to `maxHp`, so they hold their shares at
every party size.

---

## 4. Scope correction

The brief scoped "nine elite encounters, each wanting its own bracketing sweep".
There are nine in `encounters.js`, but `RUN_LENGTH_REGIONS` is 2, so the three
Sleeping Quarters elites do not ship — the same reason the Bedframe Beast was
left alone. The shipping set is six: three in the Foyer, three in the Nursery.

None of them need a `partyHp` curve now.
