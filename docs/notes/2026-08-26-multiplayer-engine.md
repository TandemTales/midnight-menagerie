# Multiplayer: one player to N — integrator, 2026-08-26

The engine, the co-op rules and the authored multiplayer content. The designer
deferred the Steam wrapper decision, so everything here is transport-independent
(HANDOFF.md §9 workstreams 1–4).

---

## 1. The shape

`engine.players[]` is the source of truth. **Solo is a party of one**, so there
is no separate single-player path anywhere below construction — which is why the
solo suite is unchanged at 651 assertions through the whole refactor.

What made a refactor of this size safe was making the unported seams **loud**.
In a party with the dev guard armed, `engine.player`, `engine.piles` and
`engine.relics` throw and name the fix instead of quietly resolving to seat 0.
Running a real 2-player fight then produced the port list one throw at a time,
in dependency order. A shipped build still degrades to seat 0 rather than
throwing at a player mid-run.

That is the whole method, and it is worth reusing: **the alternative to a loud
seam is not a caught bug, it is a teammate's Curl Up silently guarding the host
for a whole build.**

### Threading: `_asSeat`

~90 helpers on the engine (`drawCards`, `gainEnergy`, `costOf`, the piles) are
implicitly about "the player doing this". Rather than give all of them a seat
argument, `_asSeat(seat, fn)` sets the acting seat for a scope and restores the
previous one. Card resolution runs as the card's owner, each seat's turn opening
and end run as that seat, and every cross-player helper resolves inside the
RECIPIENT's seat.

It is a stack discipline, not a mode — a card that makes a teammate draw nests
correctly instead of leaving the engine pointed at the wrong Kid.

`ctx.self` is now **whoever holds the card**, not seat 0. That one line is the
difference between a co-op build that works and one that looks like it does.

### Rules in

| | |
|---|---|
| per seat | deck, hand, all six piles, Nerve, Courage, Guard, statuses, Keepsakes, Companion trackers, Companion counters |
| shared | the board, enemies, House Rules, timers, the RNG |
| enemy Courage | 1p 100% · 2p 220% · 3p 360% · 4p 520%, plus a per-enemy `EnemyDef.partyHp` override for the region chapters |
| targeting | an enemy MARKS a seat and holds that mark across intent refreshes, so the arrow read while planning is the one that resolves |
| Racket | the co-op taunt, fourteenth universal status |
| turns | simultaneous — every seat plans in one window and ends its own turn; the enemy phase waits for the last living seat |
| fallen | at 0 Courage a seat keeps its place, drops its hand, takes no turn, is not targetable; back at 1 Courage if the team wins; all fallen = run over |
| Snacks | `useSnack(snack, targetId, { to: seat })` throws one to a teammate |

Two Kids on the same Companion get two independent Lives tracks and two Patches:
counters are keyed by seat in a party (`_ckey`), and the `__mm` scratch lives on
the seat rather than the engine.

### The cross-player surface

One place where "act on someone else" is implemented: `party`, `teammates`,
`isParty`, `chooseAlly`, `giveBlock`, `giveDraw`, `giveEnergy`, `giveStatus`,
`giveHeal`, `allyCards`, `giveCard`. A test proves `giveBlock` uses the
RECIPIENT's Dexterity — the kind of difference that is invisible until someone
notices the numbers are wrong.

`chooseAlly` returns **null** in solo rather than handing back the caller, so a
card can decline to do anything instead of pretending to help.

---

## 2. The content

All five built Companions have their 3 Uncommon + 2 Rare pool from their own
design chapter, in `coopCards` — **outside the 80**. Per-companion pool counts
are unchanged (83/86/86/84/85) and a solo run can never draft one;
`poolWithCoop(slug, rarity, { coop: true })` folds them in.

**Every one of the 25 is played in a real 2-seat fight by the suite.** That is
not ceremony. Three of them resolved cleanly and did nothing.

### Cards that need something that does not exist yet

Several say "that player chooses a Trick from their hand". The choice broker
raises one request to whoever is driving the engine, and there is no client
routing to put a request in front of a *different* player. Those picks resolve
deterministically and are marked `// TEAMMATE PICK` in the source. The effect is
right; **who makes the decision is not**, and it is a networking task.

One deliberate reading, flagged in the source: Marmalade's *Who Did That?* says
"trigger the Haunt twice"; it doubles the stack instead, which is the same burst
on the swing and reads on the card face without a second rule.

---

## 3. Four dead cards, and the gate that found them

Three of mine, and one that was already shipping. All four **resolved cleanly,
emitted events, and did nothing** — CONTRACTS rule 8's shape, with a hook name
in place of a `?.`.

| card | what was wrong |
|---|---|
| `pipkin/community-garden` | `hooks.add('harvested')` — companion Powers fire through `U.fire(c, 'harvest')` |
| `wink/silk-lifeline` | `beforeDamaged` is dispatched by nothing; the hook is `onIncomingHit`. Also read `h.actor`; the payload carries `defender` |
| `wink/everyone-duck` | same two mistakes |
| **`bones/tail-a-mile-a-minute`** | **already shipping.** A Rare Power whose entire implementation was an EMPTY handler on `'retrieved'`, a hook name that does not exist. It cost 1 Nerve and did nothing at all. |

And two that read a field off `card:play` that it does not carry: the event has
`card`, `actorId` and `seat` — there is no `ev.type`.

**`tests/hook-names/check.py`** now fails the build on any listener naming a hook
nothing dispatches, engine-side or companion-side. It found the Bones one within
a minute of existing.

---

## 4. Bugs in the engine that the co-op work surfaced

### Companion trackers fired on every enemy turn (SOLO bug, was shipping)

The engine emits `turn:start` and `turn:end` for the player **and for every
enemy**. Every Companion tracker listened to the raw event, so with two enemies
each ran three times a round.

- **Marmalade's Untouched was decided by whichever enemy swung LAST**, because
  the baseline Courage was overwritten mid-enemy-phase. Verified against the
  real game: solo Marmalade, first enemy hits for 9, second only blocks — she
  ends on 61 Courage and is still "Untouched". Her whole Untouched archetype did
  nothing in any fight with more than one enemy, which is most fights.
- Bones' Buried countdown ticked once per enemy, so cards resurfaced in about a
  third of the intended turns.
- Pipkin's Patch ran a growth step per enemy and zeroed Height repeatedly.
- Taffy's Stretch climbed on every enemy turn end.
- `U.nextTurn()` fired during the enemy phase.

`state/run.js` had it right all along (`if (ev.side !== 'player') return`), which
is what made the pattern findable. Fixed with `U.onPlayerTurn(e, when, fn, seat)`
and gated by **`tests/turn-events/check.py`**.

### `onIncomingHit` could not gain the defender Guard

`computeDamage` runs BEFORE the dispatch, and `blocked`/`hpLoss` were only
recomputed if the hook changed the *amount*. So a hook that gains the defender
Guard — which is what "immediately before the damage" means — was ignored. Now
always recomputed against current Guard. With no hook touching anything the
numbers are identical; solo unchanged at 651.

### Two stale test lists

- `tests/cards` `ENGINE_KEYWORDS` was hand-written and still held the pre-rename
  names (poison/artifact/thorns/intangible), never gaining the Menagerie ones.
  No card could write `[Dread]`, `[Charm]`, `[Bristle]` or `[Faint]` without a
  false failure. Generated from `UNIVERSAL_STATUSES` now.
- `tests/seams`' inert-status rule did not know `onHook(evt, id, fn)` gates on
  that status, so a status read only that way looked inert. Confirmed it still
  catches a genuinely unread one.

---

## 5. Balance after the tracker fix

30 expeditions per bot. Marmalade's Untouched archetype started working, and
Bones/Pipkin/Taffy stopped getting free value from over-fast ticking.

| | recorded before | now |
|---|---|---|
| competent whole-run survival | 50–58% | **60%** |
| naive whole-run survival | (gap ~33 pts) | **36.7%** (gap 23) |
| Foyer boss, competent, when reached | ~82% | **82.8%** |
| Governess when reached | ~74% | **75%** |

Bosses are unchanged. **The skill gap narrowed from ~33 to ~23 points** — that
is the tracked metric that moved, and it is worth a designer's eye: the naive
bot benefited more from correct trackers than the competent one did.

---

## 5b. MEASURED: the party Courage curve is wrong, and not by a constant

`tests/coop/balance.py` plays real fights at every party size with the competent
bot driving every seat independently, each ending its own turn. Foyer, starting
decks, no Keepsakes, no Snacks.

**Standard Scuffles (n=25 per size)**

| party | win% | Courage left after a win | fallen/fight | enemy Courage |
|---|---|---|---|---|
| 1p | 80% | 22% | 0.20 | 51 |
| 2p | 80% | 46% | 0.48 | 113 |
| 3p | 92% | 57% | 0.24 | 184 |
| 4p | **100%** | **63%** | 0.00 | 266 |

**Elites (n=15 per size)**

| party | win% | Courage left after a win | fallen/fight | enemy Courage |
|---|---|---|---|---|
| 1p | 53% | 40% | 0.47 | 95 |
| 2p | 53% | 60% | 0.93 | 210 |
| 3p | 33% | 70% | 2.00 | 343 |
| 4p | **0%** | — | **4.00** | 496 |

Scuffles get EASIER with more Kids; elites become unwinnable. A single scalar
cannot fix both, because the two are the same mechanism seen from opposite ends.

**Why.** Scaling enemy Courage scales fight LENGTH, and length is what decides
total incoming damage. Enemy *output* does not scale at all: each enemy marks
one seat and swings at it, so a 4-player party faces the same damage per turn as
a solo Kid while holding 4x the Courage and taking 4x the actions.

- A short fight ends before attrition matters, so the party's 4x action economy
  wins outright and everyone walks away healthy.
- A long fight (5.2x Courage on an elite) runs ~5x as many enemy turns, so the
  party absorbs ~5x the total damage against only 4x the pool — and the damage
  concentrates, because each enemy keeps its mark. Seats fall one at a time.

HANDOFF §9 records the StS2 rule as "**enemies threaten all players at all
times**". The Courage curve is implemented; **the threat side is not**. That is
the actual gap, and it is a design decision, so it is written down rather than
quietly tuned. The three obvious levers:

1. scale enemy COUNT with party size (StS2 adds bodies, not just Courage),
2. give each enemy extra targets or extra attacks in a party,
3. lower the Courage curve and raise per-turn threat instead.

**Caveats, so nobody over-reads this.** One bot drives every seat, so there is no
coordination cost and no human error. The decks are starting decks — the co-op
Tricks are not in them, and those are all party-force-multipliers, which would
push the Scuffle numbers further toward "too easy". Every seat starts on a fresh
70 Courage; a real run carries damage forward, and solo carrying 22% into the
next room is far worse off than a party carrying 63%.

## 6. What is NOT done

- **No co-op run layer or UI.** `state/run.js` is single-player; there is no way
  to start a 2-player game from the game itself. The engine is ready; nothing
  above it is.
- **No networking**, by the designer's decision to defer the wrapper.
- Per-player gold, card rewards and shop inventory are specified in HANDOFF §9
  but live in the run layer, not the engine, so they are untouched.
- Mend and Clone at the Safe Room are not built.
- The other 11 Companions' co-op pools are unwritten (they are unbuilt companions).
- Per-enemy `partyHp` overrides from the region chapters are supported by the
  engine but not authored.

## 7. Tests

```
tests/coop/run.py          324 assertions, real party engines, no mocks
tests/hook-names/check.py  90 files, 39 listeners, 0 unknown hook names
tests/turn-events/check.py 78 files, 0 unguarded turn listeners
tests/combat/run.py        651 (unchanged through the whole refactor)
tests/cards/run.py         470 cards, 0 errors, 0 warnings
```
