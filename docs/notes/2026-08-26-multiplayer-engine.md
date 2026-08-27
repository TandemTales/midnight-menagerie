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

## 5b. Two Kids, and the curve that took three measurements

**The party caps at two** (`MAX_PARTY`), by the designer's decision. The engine
is written for N and the Courage table keeps the designed 3p/4p rows, so lifting
the cap is one line plus a re-measure — but nothing above the engine is balanced
for more, and a party of three would silently draw on numbers nobody has played.

### The number

Slay the Spire 2 is the model, and its STRUCTURE was adopted wholesale: enemy
Courage scales, enemy **damage never does**, and the extra threat comes from
targeting. The number took three measurements, because the sources disagree
wildly and two of them are wrong for this game.

| | source | measured here |
|---|---|---|
| **1.60x** | our own `regions/01-foyer.md` §26 | duo wins 92% vs solo 80%, ends on 64% Courage vs 22%. Far too easy. |
| **2.50x** | what StS2 actually uses — two independent Steam threads agree on "1p 1x, 2p 2.5x, 3p 3.5x, 4p 4.5x" | duo wins 60% vs solo 80%, four times the falls. Faithfully reproduces StS2's own signature ("2 player is the hardest way to play the game") — which is the exact thing their players complain about at length. |
| **2.20x** | measured parity | **Scuffles 73% solo vs 77% duo (+3, n=30). Elites 55% vs 55% (+0, n=20).** Falls roughly double, 0.27 -> 0.57 a fight. |

Falls doubling is the point, not a problem: a Kid going down is a co-op moment,
and they get back up at 1 Courage when the team wins the fight they fell in.

The guide sites claiming 1.5–1.8x for 2p are simply wrong — they match neither
play reports nor this engine.

### The threat side, which the first pass was missing entirely

Both StS2's guides and our own design doc say the same thing, and it is the
half that actually matters:

> Damage values normally remain unchanged. Enemy effects gain multiplayer
> targeting logic instead. — `regions/01-foyer.md` §26

> Attack damage does NOT scale with player count. AoE enemy attacks hit all
> players. This is the primary danger in co-op. — StS2 co-op guide

Scaling Courage scales fight LENGTH, and length is what decides total incoming
damage; enemy output does not scale at all. Without a threat side, a short fight
ends before attrition matters and the party's extra action economy wins
outright, while a long one runs many more enemy turns against a pool that grew
far less. That is why the first pass made Scuffles easier AND Elites unwinnable
with one constant.

Built:

```
partyTarget: 'all' | 'two' | fn(enemy, engine)   AoE and split attacks
partyPick:   'lowestGuard' | 'lowestCourage' | 'fewestDraw' | 'mostDraw' | ...
engine.perPlayer(n)                              "N damage times players"
```

Wired from the region chapters — Dust Bunny's Tumble takes the least Guard, Lost
Luggage's Pack Wrong the thinnest draw pile, Red Carpet Runner's Run the Hall and
House Bell's Midnight Toll hit EVERY Kid, Jack in the Box's POP! the lowest
Courage, Rocking Horse's Gallop everyone at 2+ Excitement, Porcelain Doll's Sharp
Little Hands splits once Shattered, Pillow Puff's Feather Cloud takes the fattest
draw pile, Thing Beneath's UNDER THE BED hits the team, the Hydra's Biting Head
takes the least Guard.

Seat choice **always ties on seat index, never the RNG**: the target is shown
before the players act, so it has to survive both the preview and a replay.

`hitPlayer` no longer names a target, so a move's own `partyTarget` decides —
which is what let AoE exist without touching a single effect body.

Re-measure with `python tests/coop/balance.py` after any change to enemy damage,
starting decks or the co-op pool.

## 6. What is NOT done

**Superseded — read HANDOFF §9 for the live list.** Everything numbered here on
2026-08-26 has since been built except the first item:

1. **Networking.** Still deferred with the Steam wrapper, and now the only thing
   outstanding. Two people can play the whole game on one machine —
   `docs/notes/2026-08-27-pass-and-play.md`.
2. ~~Cards that ask a TEAMMATE to choose~~ — choice requests are addressed to a
   seat now (`ask({ seat })`).
3. ~~Per-Kid shops~~ — `shopStock(node, kid)`.
4. **The other 11 Companions' co-op pools** — they are unbuilt Companions.
5. Per-enemy `partyHp` overrides: the engine supports them and the Governess's
   Favorite Doll now uses one (80 Courage at 2p, per the Nursery chapter).
6. ~~Boss multiplayer adjustments~~ — all three bosses, and the Big Scares —
   `docs/notes/2026-08-26-multiplayer-bosses.md`.

## 7. Tests

```
tests/coop/run.py          401 assertions, real party engines, no mocks
tests/coop/select.py       the entry point, driven as a player drives it
tests/coop/balance.py      party balance, 1p vs 2p, real fights
tests/hook-names/check.py  90 files, 39 listeners, 0 unknown hook names
tests/turn-events/check.py 78 files, 0 unguarded turn listeners
tests/combat/run.py        651 (unchanged through the whole refactor)
tests/cards/run.py         470 cards, 0 errors, 0 warnings
```
