## 2026-09-11 — the dead-effects round

The card cost pass (`7cd3de3`, recorded in `2026-09-11-card-cost-pass.md`) left a
list behind: roughly 150 pre-existing effects and upgrades that do nothing,
catalogued deck by deck by reading the code. This round repaired the three worst
decks, built the gate that can see the whole class, and fixed two gates that
were blind.

### Three decks

| deck | suite before | after | what was actually wrong |
|---|---:|---:|---|
| Truffle | 27 | 107 | Nothing watched the enemy turn |
| Wisp | 25 | 128 | Every delayed effect resolved with no card attached |
| Wink | 16 | 86 | Reads resolved on any intent update, and eleven Powers hardcoded their numbers |

- **Truffle.** One `damage` listener in the tracker now drives what four cards
  needed and never had: `lostCourageThisEnemyTurn` and `bristledThisEnemyTurn`
  were never set. Bend Don't Break, Roll With It, Built Wrong, Dead Hedgehog
  Theory, Bite Back First, Comfortable in Pieces and Double Barbed all did
  nothing; they do now. Two borrowed statuses became his own: Play Dead-ish
  applied Bones' `play-dead`, which HALVES a hit rather than capping it, and
  Refuse to Stay Down applied Marmalade's `not-dead-yet`, which spends Lives
  Truffle does not have. Eight Power hooks hardcoded their values.
  Its agent proved the control: disabling the one listener turns 26 of the new
  checks red.
- **Wisp.** All sixteen Linger Tricks resolved their Afterglow from a tracker
  ctx, so `N(c)` was empty, all sixteen upgrades were dead, and two cards
  printed numbers the code never used. `linger()` now captures the playing
  card's resolved nums, the way Mossbit's `inscribe()` does. It also found a
  trap 24 case nobody had reported: the Afterglow tick ran on `turn:start`,
  BEFORE the Guard wipe, so every defensive Afterglow left the player on 0.
- **Wink.** Threadbare Pounce priced itself with no target, so it read Wink's
  own Web (0), charged full price and ate the Web anyway. Probability Collapse
  called `forceIntentFamily`, a function that exists nowhere. House Spider's
  re-Sets never fired and blocked slots. Eleven Powers hardcoded numbers.

### Ten Powers that fired once per enemy

`tests/turn-events/check.py` matched a literal `.on(` and was blind to
`?.on?.(`, the spelling `tests/snapshot-cards/check.py` had already been bitten
by. Behind that hole sat ten raw turn listeners, every one of them inside a
Power's install callback, every one firing on each enemy's turn as well as the
player's (trap 9):

- **Bones:** Every Bone Knows the Way Home (both halves), Best Dog in the House
  — which fetched once per enemy, every turn.
- **Marmalade:** Ghost in the Rafters, Predator's Patience, Zoomies at Midnight,
  Untouchable, Queen of the Rafters.
- **Pipkin:** Elastic Legs. **Taffy:** Surface Tension.

All ten now go through `U.onPlayerTurn(e, when, fn, seat)`, which filters side
and seat. The gate reads both spellings, and its RESULT line prints how many
listeners it SAW as well as how many were unguarded — a scan that suddenly sees
nothing is a broken pattern, not a clean tree (trap 54).

### The gate that can see the class: `tests/upgrade-effects/check.py`

Plays every playable Trick twice from the same seed onto the same seeded board,
once base and once upgraded, and compares what the two fights did. Building it
was mostly learning what a fair comparison needs, and each lesson is a comment
in the page:

| the draft | what it called dead | why it was wrong |
|---|---:|---|
| board read after two turns | 600 | Guard is wiped and the hand re-dealt at turn start, so Curl Up's 5→8 Guard vanished |
| + read at the moment of the play, + a tally of what the fight emitted | 396 | a Trick the board cannot play at all looks identical either way |
| + skip those, + seed every declared counter, + play two Tricks after the card | 293 | a Power buffs what you play NEXT, and an empty track hides its payoff |
| + bucket party cards and choice cards apart | **218** | a friend-facing card cannot show anything on a solo board, and the resolver always takes the first branch of a choice |

It reports 218 upgrades that moved nothing, 28 Tricks this board cannot play, 54
that need a friend, and 72 that hinge on a choice. It is REPORT-ONLY: the exit
code is about the gate's own health (a card it cannot instantiate, a stale
waiver), because a red nobody can clear is a red nobody believes. When the list
is burned down, make the list itself fail.

### One runner for every gate: `tools/gates.py`

The handoff's sweep was `for f in tests/*/check.py`. There are also 43
`tests/*/run.py` gates that nothing ran as a set, and eleven entry points named
neither — which is why `tests/seams/proof.py` sat red for a day, and why
`tests/coop/rooms.py` and `playthrough.py` sat red since 2026-08-29. All 97 now
run from one place, one at a time.

`EXTRAS` is hand-written, so it comes with the checker trap 60 asks for: every
run scans `tests/*/*.py` for entry points that print a RESULT line and reports
any that no list reaches. Dropping one entry from the list makes the scan name
it, so the control can fail.

### The two co-op scripts

Both picked Companions by slug (`bones`), and Companions are DISCOVERED — a save
that has not rescued that one times out on the tile. Both now take what the
board offers and name each seat's Companion in their own assertions. `rooms.py`
also pressed room exits by label, and a room foot says what pressing it will do
("Take Hairball and go", "Leave the room"), so it presses the scene's primary
button by class instead.

### Still open

- **Wisp:** Too Bright for Bedtime reads the hand at `turn:start`, before the
  deal, so it only ever discounts retained cards. Doing it properly needs a
  "next two Tricks played" discount status through `discountHooks`.
- **Wink:** `readSuccess` lives in `turnFlags` and cannot survive the enemy
  phase, so Gotcha!, Skitter's Guard, Wrong Answer and Closed Loop only see
  Reads that resolved during your own turn. Loom Logic fires on any Reorder.
- **Truffle:** the chapter gives Bend Don't Break and Quill Tax damage
  mitigation the card text prints no number for; unprinted mitigation was not
  invented.
- **The other thirteen decks' lists** in the cost-pass note, and the 218 the new
  gate names.
