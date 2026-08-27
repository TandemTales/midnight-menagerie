# Pass-and-play — two Kids, one machine

2026-08-27. Two people can now play the whole game on one screen. Networking is
the only item left on HANDOFF §9, and it has a smaller job than it had.

Companion notes: `2026-08-26-multiplayer-engine.md` (the engine),
`2026-08-26-multiplayer-bosses.md` (the content and the five dead mechanics).

---

## 1. What was actually missing

Every gap left in the co-op build was one shape, and HANDOFF said so:

> the DATA is per Kid and correct, and one screen shows one seat.

Deck, Courage, Keepsakes, Backpack, card offer, Keepsake offer, shop shelf,
Safe Room options — all per Kid, all right, all invisible to the second player
because the screen only ever belonged to seat 0. So the missing half was not
more per-Kid data. It was **the seat being able to move**.

---

## 2. The whole mechanism

```js
run.setLocalSeat(1);      // and every per-Kid thing follows
```

`run.local` is the one hop between "the Run" and "this Kid", and the ~14
properties in `PER_KID` are accessors over it. Moving `localSeat` therefore
moves the deck, the purse, the Keepsakes, the Backpack, the pending offer and
the shop shelf in one assignment — nothing is copied, so nothing can go stale.

That call is exactly what a transport deletes. With a wire, each client sets its
seat once at the start of the expedition and never moves it again.

## 3. The veil

`ui/handoff.js passTo()` covers the board between one Kid and the next. Built on
the existing `Modal`, with two deliberate departures:

- **The scrim is opaque, not a tint.** `--scrim` is translucent and would leave
  the outgoing player's hand legible through it, which defeats the entire point
  of the screen. A hand of Tricks is the one genuinely private thing in this
  game; everything else — Courage, Guard, statuses, which enemy is winding up —
  is already on the teammate panel by design.
- **It cannot be dismissed by accident.** No Escape, no backdrop click. Enter or
  Space, because the player is looking away from the mouse while they hand the
  machine over.

`shouldHandOff(run)` is the single place that decides whether any of this
happens. Nothing tests `run.partySize` itself, so a session that owns one seat
switches all of it off by answering false, in one place.

---

## 4. Combat

`endTurn(seat)` has always closed one seat and left the enemy phase waiting for
the last one — that was built with the engine. Pass-and-play just uses it:

```
seat 0 plans → END TURN → veil → seat 1 plans → END TURN → enemy phase → veil → seat 0
```

`_takeSeat()` is the list of things a screen built once at `enter()` does not
pick up from `this.me` on its own: the Companion's portrait, the name under it,
the body on the board, the accessible label. `PlayerView.setCompanion()` rebuilds
the body in place — leaving Marmalade's silhouette standing there while Bones
takes his turn is the kind of wrong nobody reports and everybody notices.

### A round starts with seat 0

The first version kept the screen if the local seat had not gone yet. That is
right mid-round and wrong at the top of one: when the last seat ends, the enemy
phase runs and a fresh turn opens with **every** seat waiting again, so whoever
happened to end last kept the machine and the two of them swapped who went first
every single round. The rule is now the lowest living seat that has not ended,
always — the same tie-break every seat choice in combat uses.

Found by driving it, not by reading it. `tests/coop/hotseat.py`.

---

## 5. The rooms

The reward screen, Mr. Moth's, the Safe Room and Curiosities are all per Kid,
and all four had `_leave` wired straight to the button — so whichever Kid pressed
it closed the room on everybody, taking the other's three Tricks and their
Keepsake with it.

`_leaveRoom()` on `RoomScene`, shared by all of them: mark this Kid done, find
the next one still owed a turn, cover the screen, hand it over, and open the room
again as theirs. The last one out closes it. `claimReward({ close: false })`
takes only the local Kid's half.

**"Had their turn" is marked on LEAVING, not on using it.** A Kid is allowed to
look at Mr. Moth's shelf and buy nothing, and must not then be handed the screen
forever. The marker is the node id and it rides on the seat, so it survives a
save.

**A room starts with seat 0**, for the same reason a round does. Without it the
seat stayed wherever the last room left it, and whoever went last at the shop
went first in the Safe Room. Nobody gains anything by the order — the shelves and
the offers are separate — but it should not be something the players work out
fresh at every door.

### A Curiosity is one room, answered twice

Settled against Slay the Spire 2, which shares the map and the node in co-op and
lets *"individual choices within events differ"*. It was one room the first Kid
answered FOR both: `pendingEvent.resolved` was run-level, so seat 1 walked in and
saw seat 0's outcome with no options, while the effect had landed on seat 0's
Courage, deck and purse alone.

`resolvedBy` is per seat now, and the roll is **forked per seat** as well as per
option — two Kids picking the same option must not get the same roll off the same
stream, or the second one is watching a replay of the first.

### A Rescue is not

One pet comes home. `perKid: false`, or the second Kid gets a screen showing an
animal already rescued and nothing to do about it.

---

## 6. The bug that was hiding under all of it

`engine.localSeat` decides whether a seat-addressed choice reaches the picker or
resolves from its `prefer` rule. It was set once when the fight was built and
never moved.

So after a handoff, a Trick played by seat 1 that asks **seat 0** to choose would
have opened the picker in front of seat 1 — one player rummaging through the
other Kid's hand, which is the exact thing the seat addressing was built to
prevent. `_takeSeat()` moves it.

---

## 7. How it was checked

Three new suites, all of which drive the real screens, because every bug above
was invisible to an object test:

| | |
|---|---|
| `tests/coop/hotseat.py` | click END TURN, expect the veil, click through, and check the screen really is the other Kid's — their Companion named under the painting, their hand in the fan |
| `tests/coop/rooms.py` | all four rooms hand over: seat 1's reward is a different Keepsake and Bones Tricks, seat 1's shelf is a different shelf, seat 1's Safe Room offers to Mend Maya, seat 1's Curiosity is unanswered — and a Rescue does NOT hand over |
| `tests/coop/playthrough.py` | a two-Kid expedition walked the way two people would: map nodes, fights with both hands, every veil, every room |

The pattern this project keeps re-learning holds again: `run.localSeat` moving is
one line and was right immediately; the screen following it was a dozen places
each set once at entry, and every one of them had to be driven to be believed.
