# Multiplayer bosses — and the three mechanics that were never wired

2026-08-26. Picks up HANDOFF §9 "NOT built" item 5: the boss multiplayer
adjustments from the region chapters. It turned into something bigger, because
two of the three built bosses had signature mechanics that did nothing at all.

Companion note: `2026-08-26-multiplayer-engine.md` (the co-op engine itself).

---

## 1. What was asked for, and what was in the way

§9 listed *"the Butler's per-Kid House Rules and Flustered thresholds, the
Governess's per-Kid Stitched Together and repair windows"*. Both needed
groundwork that did not exist:

| Wanted | Blocked by |
|---|---|
| Butler: rules judged per Kid | every field a House Rule reads was the TABLE's |
| Governess: per-Kid Stitched Together | Stitched Together did nothing in any fight |

So the order was: per-seat counters, then the Butler, then repair the Governess,
then her co-op half.

---

## 2. Per-seat turn counters

`engine.stats` and `engine.playedThisTurn` count the whole party. Everything
that reads "how much have you done this turn" was therefore reading the table.

**Measured before the fix**, two Kids playing two Tricks each against the real
Butler with GUESTS DO NOT RUSH standing ("playing a fourth Trick breaks the
rule"):

```
plays                0:curl-up  1:boo  0:scratch  1:scratch
rule broken          1                     <- neither Kid played four
seat 1 Courage       76 / 80               <- and it hit the wrong Kid
playedThisTurn as seat 0 sees it   4       <- their own count says 2
```

The chapter is explicit that this must not happen: *"Player A can play six
Tricks and receive their Reprimand. Player B can still play three Tricks without
consequence… One player's actions do not punish another player. This prevents
multiplayer resentment."* (regions/01-foyer.md §26, §28.)

Each seat now carries its own copy of the per-turn counters (`actor.js
newTurnStats()`), and `engine.stats` stays the team mirror on purpose — an elite
threshold worded *"16 damage per player, all team damage during the round
contributes"* wants the table, and a Kid's own card never does. Content reads
`e.seatStats(seat)` / `e.seatPlayed(seat)`; `ctx.cardsPlayedThisTurn()` and
friends route to the acting seat automatically.

Two Companion mechanics were quietly wrong for the same reason:

- **Zoomies** ("the third or later Trick you have played this turn") switched on
  because your *friend* played three.
- **Untouched** ("you lost no Courage during the previous enemy turn") switched
  OFF because your friend took a hit. The team sum is still kept — several
  enemies genuinely mean the whole table — but the card-facing read is the seat.

`_checkRules` now walks seats in seat order, `once` is per seat, and `onBreak`
resolves inside the breaker's seat *and* aimed at them, so a Reprimand's Clutter
reaches their discard pile and its damage reaches their Courage. The preview
clone deep-copies the per-seat fired map, or previewing a card that trips a rule
would mark it fired and the real play would escape its Reprimand.

---

## 3. The Butler (foyer §28)

- **Thresholds** are `2 + players` in phase one and `1 + players` in phase two.
  At one player that is 3 and 2 — the printed solo numbers — so there is no
  separate single-player branch to drift.
- **One Flustered per Kid per round.** Phase two stands two rules at once, so
  without the cap a duo hands him four in a single careless turn and forces
  Discomposed every round, which is exactly what the raised thresholds exist to
  prevent, arriving by the other door. The cap is not party-only: solo is a
  party of one everywhere else in this build. It does change the solo boss —
  measured both ways, see §7.
- The Reprimand itself is **not** capped. Break three rules, take three
  consequences; you just do not get three Flustered for it.

### The duplicate key

`butler.js` declared **`onTurnEnd` twice**. In a JS object literal the second
key silently replaces the first, with no error and no warning. The half that
expires Discomposed was dead for the entire build — and `discomposed` is
`decay: 'never'`, so the first time a player earned the window he stayed
Discomposed **forever**: permanently taking 25% more, and permanently unable to
announce another House Rule (`announceNext` refuses while Discomposed), which
shuts down the Flustered economy the whole boss is built on.

Nothing caught it. The enemy suite was green, the audit was green, the fight
"worked". `tests/dup-keys/check.py` now scans every object literal in
`game/src/` for a repeated key; it found this one and nothing else across 90
files, and it was verified by putting the duplicate back and watching it fail.

---

## 4. The Governess — three dead mechanics

Probed against a real fight before touching anything:

```
30 damage aimed at her  ->  30 to her, 0 to Favorite Doll
governess.doll(ctx)     ->  null
mend-my-darling         ->  never selected once in a 12-turn fight
repair-patch counter    ->  0 at the end of the fight
```

Three separate faults, stacked:

1. **`doll()` looked up `a.id === 'favorite-doll'`.** An actor's `id` is its
   board slot — `e1` — and `favorite-doll` is its `defId`. She could never see
   her own Doll. It also searched `allies()`, which is *living* enemies, so it
   could never have found a Torn Doll to mend either.
2. **`redirect()` had no caller.** Stitched Together — the mechanic the Doll
   exists for, and the whole of her phase one — was a def method the engine
   never invoked. Same for `modifyIncoming()` (the Reinforced Patch).
3. **`advancePatch()` had no caller**, so the phase-two Repair Patch cycle sat
   on index 0 for the whole fight.

This is the exact shape of the silent-no-op class CONTRACTS rule 8 exists for,
and it explains a measurement nobody could make sense of at the time: her
Courage sweep read **95% player wins at x1.0, x0.8, x0.7, x0.6 and x0.5**. A
boss with no defensive mechanic is not hard at any Courage total — she was only
ever long.

Stitched Together is now a **Power with an `onIncomingHit` hook**, which is how
the rest of the codebase does this (Blanket Blob's Cover is a status of the same
shape), so `hooks.actorHooks(defender)` finds it with no new engine surface.
`addPower` was missing from the enemy ctx entirely — the strict seam guard threw
and named it, which is the guard doing precisely its job.

### Her co-op half (nursery §35)

- **Per-Kid allowance.** Each Kid's first 10 damage goes into the Doll. A single
  shared 10 would mean whoever swings second hits her directly, so the correct
  play would be "wait for your friend to go first" — *"This prevents player
  order from determining who gets punished by the mechanic."*
- **Repair windows.** Mend My Darling waits until every Kid has had a turn they
  could act in with the Doll down. Turns here are simultaneous, so one turn *is*
  everybody's turn — unless a teammate had already ended theirs when it tore, in
  which case the window owes them one more round. Solo always takes the first
  branch, which is the `turn > tornOnTurn` it used to be.
- **Patch tearing** is 20 per Kid across the team round, and the Stuffed Patch's
  "too gentle" heal scales with it, or two Kids doing 8 each would count as
  gentle.
- **Favorite Doll is 80 Courage at 2p**, from the chapter, not the party curve's
  110. It is a timer on a window the team is trying to open, and scaling it like
  an enemy would make the window arrive *later* with more Kids.

---

## 5. The Bedframe Beast (sleeping quarters §46)

**The One Looking Under the Bed** is picked the moment it hides — the
least-guarded Kid — and frozen there, because a mark that re-evaluates as the
team plays would make *"this encourages teammates to protect the threatened
player"* impossible to act on. It rides on `enemy.targetSeatId`, the engine's
own held mark, so the arrow the scene draws and the seat the ambush lands on are
the same field.

| Move | Marked Kid | Everyone else |
|---|---|---|
| BOO | the full 9 + 7/Scare | 4 + 3/Scare |
| Claw Ambush (left) | two of the three sets of claws | one each |
| Giant Scare (center) | the whole hit | — |
| Grab and Drag (right) | damage + Frightened | 1 Drowsy each |

Its **Covered** state was the Governess bug again: `modifyIncoming` was a def
method nothing called, so one of the three exposure states the boss's entire
loop is built on did nothing, and Pull the Covers Up was 10 Guard and a label.
Now a Power, with a per-Kid allowance following the Nursery's ruling on the same
shape (§32).

### `splash` on the intent

BOO cannot be expressed by one `damage` and one `targetId`, and a move that
quietly hits a seat with no arrow on it breaks the promise the whole intent
system exists to keep. Moves may now declare `splash` / `splashFn(c)` — what
every *other* seat takes. It is absent from the intent in solo and on every move
that does not declare it, so nothing that reads an intent today sees a new
field unless a party is on the board.

**Open**: the combat scene does not render `splash` yet. The other Kid's arrow
shows the mark, not their own smaller number. The data is there for whoever
picks the scene up.

---

## 6. Balance

**Co-op is unmoved.** Re-measured after every change above, same seed, same
harness (`python tests/coop/balance.py`):

| | 1p | 2p | recorded before |
|---|---|---|---|
| Scuffles, n=30 | 73% | **77%** | 73 / 77 |
| Elites, n=20 | 55% | **55%** | 55 / 55 |

The 220% Courage parity point still holds.

**Solo did move, and it had to.** Three bosses got defensive mechanics they were
designed with and had never had. See §7.

---

## 7. Sweep at x1.0 — the solo cost

`python tests/critic-design/sweep.py --tier boss --region <r> --n 24 --scales 1`,
competent bot, rolled loadouts, haunt 0. The Butler is a true A/B: the same
command against `butler.js` at `ab80893` and at this commit, nothing else
changed.

### The Butler

| | before | after |
|---|---|---|
| win% | 75.0 | **66.7** |
| turns, mean / median | 12.42 / 13 | **13.54 / 15** |
| Courage cost | 40.25 | **48.75** |
| Courage left on a win | 41.44 | 35.06 |

Harder by 8 points and 8 Courage, and one turn longer. That is the Discomposed
fix: a permanently-Discomposed Butler was handing the player +25% damage for the
rest of the fight, free, from the third turn a good player has. The extra turn
is the Flustered cap — windows are earned one Kid at a time now.

**For the designer, not decided here.** The brief asks for 8–12 turns and
45–65%. He was outside both before (75%, 12.4/13) and he is outside both after
(66.7%, 13.5/15) — closer on win%, further on length. "He is not dangerous, he
is long" was the finding that set his Courage at 165, and it is still true. The
lever is his Courage pool, and it is a balance decision rather than a
correctness one, so it has been left alone.

### The Butler: Courage is the wrong lever, and here is the proof

The obvious next move after the A/B was "bring his Courage down until the length
lands in the 8-12 band". Swept it, 24 fights a step, same harness:

| scale | Courage | win% | turns mean | median |
|---|---|---|---|---|
| 1.00 | 165 | 66.7 | 13.54 | 15 |
| 0.90 | 149 | 75.0 | 11.25 | 11 |
| 0.80 | 132 | 70.8 | 10.33 | 10 |
| 0.72 | 119 | 79.2 | 9.92 | 10 |
| 0.65 | 107 | 75.0 | 8.50 | 8 |

**No Courage total satisfies both bands.** Every cut that pulls the length into
8-12 pushes the win rate UP, out of 45-65 the other way — 0.9x is 11.25 turns
and 75%, 0.65x is 8.5 turns and 75%. He is closest to the win-rate band at the
Courage he already has, and furthest from the length band there.

That is the same finding as 2026-08-20, arriving with better evidence: *"he is
not dangerous, he is long"*. A boss you cannot lose to does not become
threatening by ending sooner; it just ends sooner. The lever that reaches both
bands is **damage per turn** — more of it, with the Courage pool coming down to
hold the length — and that is a redesign of his phase-two numbers rather than a
tuning nudge, so it has not been made here.

The one thing that DID move the win rate in the right direction this round was
giving him a mechanic back: closing the Discomposed window took 75% to 66.7%.
The remaining gap is likelier to be found the same way than in the pool.

### The Governess

| | before | after |
|---|---|---|
| win% at x1.0 | 95 | **54.2** |
| turns, mean / median | 15.2 (at 280 Courage) | **10.08 / 9** |

Her "before" is the sweep recorded in her own file header: x1.0 / 0.8 / 0.7 /
0.6 / 0.5 all measured **95%**, a flat line that made no sense at the time and
was written up as "her Courage was buying LENGTH and nothing else". It was not
her Courage. She had no defence at all, at any pool size, and a flat sweep is
what that looks like.

With Stitched Together actually running she lands at 54.2% and 10.1 turns —
**inside the 45–65% / 8–12 band for the first time**, at the Courage she already
had.

---

## 8. Per-player thresholds and per-Kid allowances

Everything in the three built chapters that is worded "N per player" or "the
first N from each player":

| Enemy | Rule | Chapter |
|---|---|---|
| Grand Coatcheck | Snag: 18 damage × players | foyer §27 |
| Unwelcome Guest | Familiarity tracked per Kid; Too Familiar aims at whoever leaned hardest | foyer §27 |
| Toy Chest | Slam the Lid: 16 × players | nursery §34 |
| Blanket Blob | Cover: an allowance per Kid | nursery §32 |
| Blanket Creeper | Layers: 10 × players | sq §40 |
| Slipper Skitter | Scurry: each Kid's first Attack, and it ends only once everyone has swung | sq §38 |
| Thing Beneath | Scare interrupt: 15 × players | not in the chapter — see below |

Thing Beneath's interrupt is the one addition. §42 does not mention it, but a
duo would otherwise strip a Scare every single round and UNDER THE BED would
never reach 3 — the threshold would be load-bearing in solo and decorative in
co-op.

Scurry books its spend in `onAttacked` rather than in the damage calculation:
`modifyDamageTaken` also runs for the live numbers on a card in hand, so a Kid
hovering a Trick would otherwise use up their own halving.

### Deck pollution was landing on the host

`engine.addCard` used `engine.current`, and **nothing is acting during the enemy
phase**, so `current` fell back to seat 0. Lost Luggage's Pack Wrong picks the
Kid with the thinnest draw pile (`partyPick: 'fewestDraw'`) — and then handed
the Clutter to the host regardless. Every enemy that pollutes a deck had this.
`addCard` now takes a seat, defaulting to the one the move is aimed at.

**Lead, not fixed:** `computeDamage` runs the `modifyDamageTaken` hooks, and it
is also called by `previewDamageValue` for the live numbers on a card in hand.
Any hook that mutates state there — `covered` books its allowance this way —
spends it on a preview. Scurry now avoids it; Cover does not. Worth a look.

---

## 9. Second pass — the rest of the list

### Cover was disarmed by hovering your hand

Recorded in §8 as a lead. Measured, and worse than the lead said:
`computeDamage` runs the `modifyDamageTaken` hooks for the live number on a card
in the player's HAND as well as for a real hit, and Cover did its bookkeeping
there. Reading one Scratch twice:

```
previewed        0      then 4
allowance        {s0: 8}          <- spent, by looking
_coverPending    8                <- the Blob billed for damage it never ate
real swing       8 Courage        <- and the swing lands in full
```

Cover works the way Scurry does now: `modifyDamageTaken` is pure and parks the
absorption, `onIncomingHit` books it, and that only ever runs on a hit that is
really landing. The Ghoststep note in `companions/keywords.js` already described
this exact trap — worth reading before writing any hook that consumes something.

The enemy harness had to learn step 6b to see it at all; it stopped at
`modifyDamageTaken`, which reads the reduction and never the spend. While in
there, the harness's direct call to `target.def.redirect(...)` came out: nothing
in the real engine ever made that call, so the harness was the ONLY place
Stitched Together ran. A mock inventing a call site is how a dead mechanic looks
tested.

### `Incoming` was the whole board, measured against seat 0

`previewIncoming` read `engine.player` and summed every intent, so the swing
aimed at your teammate counted as coming at you. In a party with the dev guard
armed it threw — and the scene swallows that throw, so the readout simply
vanished instead of being loudly wrong. It answers for one seat now, including
anything splashing off a move aimed at the other Kid, which is what closes the
`splash` gap §5 opened.

### Mr. Moth stocks a shelf each

Prices and pity were already per Kid; the shelf was not, so two Kids looked at
one list rolled off the host's Companion, and one of them buying the last
Keepsake struck it off the other's shop. `shopStock(node, kid)` rolls that Kid's
pool, skips what they own, uses their flags and their removal price, and forks
per seat so two Kids on the same Companion do not race for one card. Seat 0's
fork key is deliberately unchanged, asserted against a solo Run — no existing
seed moved.

### A choice knows whose it is

`ask({ seat })` reaches the picker only for `engine.localSeat`; anyone else's
resolves from the request's `prefer` rule, and the seat goes in `choiceLog` so a
replay can tell two Kids apart. The fifteen `// TEAMMATE PICK` comments and
their five files of slightly different inline sorts are gone; cards say
`c.askAlly(ally, { pool, prefer })`.

**Local play always takes the fallback branch, and that is the right answer, not
a stopgap.** Putting one player in charge of the other Kid's deck would be worse
than a stable rule. Networking replaces the branch, not the mechanism.

### Wink's calls could not be wrong

Two of the `// TEAMMATE PICK` sites were not deterministic picks at all. `Call
It Out` computed the guess FROM the answer:

```js
const guess  = currentFamily(c, t) || FAMILIES[0];
const actual = currentFamily(c, t);
if (guess === actual) { …open an eye… } else { …closeEye… }   // unreachable
```

A card whose entire text is "Right: … / Wrong: …" had one half. It also scored
against the enemy's CURRENT intent while the card says *next* Intent Family. The
call is the friend's now, taken against `intentFamily(t, 1)`, with a fallible
fallback — the family it is showing right now, which is right when it repeats
and wrong when it turns. Spider Conference keeps calling itself (it ticks every
round for every friend; a modal each time would be miserable) but is scored the
same way, so it can miss too.

The co-op suite proves it behaviourally rather than by reading the source: a
Dust Bunny attacks then defends, so calling what it shows on turn 1 is wrong,
and Wink loses an eye for it.

---

## 10. What is still not built

1. **Networking**, per the deferred wrapper. Two seams wait for it and nothing
   else does: the two-Kid select, and the choice broker's seat routing.
2. **The other 11 Companions' co-op pools** — they are unbuilt Companions.
3. The combat scene does not draw a second number on an enemy's intent chip for
   a seat that is only splashed. That seat IS told (`Incoming` counts it, the
   teammate line says "catches them too"); the chip itself has one number.
4. A Big Scare's **Keepsake** reward is rolled once, off the local Kid's luck,
   while the cards beside it are drafted per Kid. Possibly the intent; never
   decided.

~~Boss multiplayer adjustments~~, ~~per-Kid shop inventory~~, ~~teammate
choices~~ and ~~summon caps~~ are built — §1–§9 above.
