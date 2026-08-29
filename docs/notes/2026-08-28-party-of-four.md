# A party of four

2026-08-28. `MAX_PARTY` is **4**. It was 2, deliberately, and the reason it was
2 is the whole shape of this round.

---

## Why it was held at two

From HANDOFF §9, written when the designer chose a party of four on 2026-08-27:

> `scenes/select.js` is hard-wired to exactly two. `state.party.length === 0` is
> what puts it in "waiting for the other Kid", and the second pick launches the
> run. It needs a party-size choice and a loop, not a bigger constant.
> **Flipping `MAX_PARTY` on its own would let a run start that the select screen
> cannot set up. Do the screen first.**

That was exactly right, and it is what was done. The screen first, then the
constant, then the measurement — and then two real bugs that only a party of
four could show.

## 1. The screen

The "Go in together" checkbox is now a segmented count, 1 to `MAX_PARTY`. The
buttons are **generated from the engine's constant**, not from a literal of
their own, so the screen and the engine cannot drift apart in either direction:
it can never offer a party the engine would refuse, and it can never fail to
offer one the engine would accept. `select.js` imports `MAX_PARTY` for this and
nothing else.

The flow generalises rather than branching. `_begin()` used to read

```js
if (this.state.coop && this.state.party.length === 0)   // FIRST of two
```

and now reads `if (this.state.party.length < want - 1)`. That is the entire
change to the launch path: the same screen, once per Kid, with the go button
saying "Lock in & pass it over" until the last one. The footer names who is
already in and counts down — *"Maya, Eli, Priya in — 1 to go"*.

## 2. The curve, measured for the first time

`PARTY_HP_SCALE` read `[1, 2.2, 3.1, 4.0]`, and the comment beside it said
honestly that 3p and 4p were "extrapolated, not measured". They were also
badly wrong. First measurement, Foyer, standard tier, 24 fights a size:

| party | win% | Courage left | falls/fight |
|---|---|---|---|
| 1p | 79% | 22% | 0.21 |
| 2p | 75% | 46% | 0.58 |
| **3p** | **96%** | 64% | 0.13 |
| **4p** | **96%** | 73% | 0.25 |

Seventeen points of free win rate for bringing friends. The curve is meant to be
FLAT; that is a rising line and it is rising hard.

**Why the extrapolation failed.** Enemy DAMAGE never scales, by design. Adding a
Kid therefore multiplies the party's output AND its total Courage while the
incoming damage per Kid falls — both halves of the ledger improve at once, so
the Courage multiplier has to grow *faster* than the party does. StS2's own
formula is linear in player count and would give 3.3 / 4.4 here; measured
against this engine, linear is nowhere near enough. `[1, 2.2, 3.1, 4.0]` was a
guess at a shape the game does not have.

Four passes to find the parity points:

```
3p:  3.1 -> 96%    4.2 -> 71%    4.0 -> 75%     (2p reads 75%)
4p:  4.0 -> 96%    6.2 -> 54%    5.3 -> 88%     5.7 -> 72%
```

Locked at **`[1, 2.2, 4.0, 5.7]`** and confirmed at a fresh seed with n=36:
1p 64% · 2p 78% · 3p 67% · 4p 72% — a ~14-point spread where the noise on n=36
is about ±8 points each. Falls per fight go 0.39 / 0.44 / 1.00 / 1.11, which is
the intended co-op texture: more Kids go down in a bigger party, and they come
back at 1 Courage when the team wins.

`tests/coop/balance.html` looped `for (const size of [1, 2])` with a comment
saying two was the cap. It reads `MAX_PARTY` now — that literal would have left
the measurement silently covering half the range the moment the cap moved,
which is the same class of bug as the constant it was describing.

**Still open, and a designer's call.** Even at matched win rates, bigger parties
finish with far more Courage left (26% solo → 62% at 4p). Raising Courage
further fixes the number and makes fights long rather than dangerous — 4p at 6.2
already ran 7.7 turns. The real lever is **AoE coverage**: the compensation for
"damage never scales" is supposed to be targeting, and the Foyer's standard tier
is thin on moves that hit everybody. That is enemy content, not a constant.

## 3. Two bugs only a party of four could show

### Every seat's cards were dealt into the local Kid's hand

Driving a four-Kid fight, the opening fan held **seven cards belonging to three
different seats**. `piles.js` emits `draw`, `discard`, `shuffle`, `card:move`
and `hand:full` — and **not one of them carried an owner**. `Piles` has known
which seat it belongs to since the day it stopped being a singleton on the
engine (`this.owner`), and never said so. `scenes/combat.js` renders ONE seat's
view and consumed all of them, because it had nothing to filter on.

Every pile event now carries `seatId`, and `_animate` drops pile events that are
not the local seat's (still syncing the counts, which are everybody's business).
It was invisible at two seats because the fan is rebuilt on the first handoff,
and `tests/coop/hotseat.py` at `--party 4` is what caught it.

### The screen showed one friend of three

```js
get mate() { return e.players[1 - this.seatIndex]; }
```

"The other one of two", written as arithmetic. At four it answered seat 1 and
the screen never mentioned seats 2 and 3 — in the fight, being attacked, and
invisible. There is a panel per teammate now, cloned from the one in the markup,
in a column that holds the position the single panel used to hold itself. At
three or more they lose their padding and their Companion sub-label; the name
and the Courage bar are what a teammate panel is for.

### And one self-inflicted, straight out of CONTRACTS trap 1

The comment introducing those panels contained backticks, inside an HTML comment,
inside a template literal. It ended the template, `main.js` statically imports
the scenes, and **every screen in the game went blank** with `Unexpected token
'get'` reported hundreds of lines from the cause — which is precisely what trap 1
says happens, in the words it uses. Ten minutes. The comment now says so.

## 4. Verification

- `tests/coop/selectscreen.py --party 4` — drives four Kids through the real screen:
  four separate ten-card decks, **no card instance in two decks**, four
  Backpacks, one shared route, and the count control offering exactly what
  `MAX_PARTY` allows. Companions are discovered from the board rather than
  named, because only rescued ones are selectable and a hard-coded list of four
  times out on the third in a fresh save.
- `tests/coop/hotseat.py --party N` — was written for exactly two (one END TURN,
  one veil, one more END TURN, enemy phase). It loops over seats now, so at four
  it asserts all four veils, all four hands being nobody else's, that the
  enemies do not move until every seat has ended, and that the new round comes
  back to seat 0.
- `tests/coop/suite.js` — asserts the whole curve rather than one point: 3p is
  really 400%, 4p really 570%, the curve is really monotonic, and a party of six
  is really capped to four.
- `tests/coop/rooms.py`, `playthrough.py` — unchanged behaviour at two.

cards 1468/0/0 · combat 677 · coop 594 · run 50 · backpack 80 · enemies 37 ·
six gates · combat-scene 22 · crinkle 44 · brambleboo 52 · drizzle 70.

`tests/chrome` fails its 60fps check at 54. Measured against this session's
starting commit on the same filesystem it read **47**, so the shortfall predates
this work; re-measured in isolation twice before saying so (trap 7).

## 5. What is left

**Networking, and only networking.** Everything above is playable at one screen.
`shouldHandOff()` is still the single switch: a session that owns one seat
answers false and every handoff stops happening. The transport is the deferred
Steam P2P wrapper, which ends the no-build rule and is the one thing that cannot
be built inside this repo as it stands.
