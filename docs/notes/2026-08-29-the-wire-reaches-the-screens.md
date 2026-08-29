# The wire reaches the screens, and the Governess gets a party to fight

2026-08-29. Three halves, which is one too many but that is how the round went:
a flaky suite that was lying about a co-op regression, the netcode's missing
game-side half, and the second of three bosses measured at a party size for the
first time.

---

## 1. `tests/coop/rooms.py` was rolling its own Curiosity

The battery opened green everywhere except `tests/chrome`'s known fps check —
and `tests/coop/rooms.py`, which reported

```
  FAIL  and it passes to the other Kid rather than closing
```

followed by a 30-second timeout waiting for `.hoff__go`. That is word for word
the co-op handoff regression the file exists to catch, and it was not one.

The Curiosity step took whatever `_prepareEvent` rolled off an unseeded run and
then pressed the one button whose label it recognised — "back to the blueprint",
"leave", "go on" or "move on". `event.js _syncFoot` puts three other labels on
that button, one for each follow-up `_continue()` has before the way out:

```js
const label = p.combat ? 'Face it'
  : p.removeCard ? `Choose a ${TERMS.card} to give up`
    : p.upgradeCard ? `Choose what gets mended`
      : this._answered ? 'Go on' : 'Leave it be';
```

So on any launch that rolled a room whose first option grants a mend, a removal
or a fight, the matcher found nothing, NO CLICK WAS MADE, and the missing veil
read as the game failing to hand the room over. Reproduced by forcing
`the-umbrella-fort`, whose first option is `upgradeCard: 1`.

The game was never wrong. The screenshot of that handoff shows the veil opaque
and correct, with the picker's grid safely behind it.

Three changes, and the first is the one that generalises:

- **`press(page, *starts)` RAISES when nothing matched**, and names every button
  that was on screen instead. A click that lands on nothing is silent, and the
  failure it produces two lines later always belongs to somebody else.
- `open_curiosity(page, ev_id)` names the room instead of rolling it.
- a second case on the follow-up path, which until now was only ever visited by
  accident: the mend picker opens, the Kid's turn is NOT over while it is open,
  the Trick comes back mended in THEIR deck and not their friend's, and only
  then does the room pass over.

Negative-controlled three ways: `c.upgraded = true` removed (the mend assertion
fails, `[0,0] -> [0,0]`), the mend redirected to seat 1 (both deck assertions
fail, `[0,0] -> [0,1]`), and `_continue()` made to leave before the follow-ups
resolve (the picker offers 0 of 11 cards).

---

## 2. Nothing in the game had ever called `session.input()`

HANDOFF and `docs/notes/2026-08-28-netcode.md` both say combat is exercised and
only the rooms remain. That is true of the TEST — `tests/net/index.html` wires
`session.on('input')` to `e.playCard` inside its own harness — and it hid the
real shape of the work:

```
$ grep -rn "net/session" game/src/ | grep -v "^game/src/net/"
game/src/ui/handoff.js:52:  if (run.session && run.session.remote) return false;
```

One line, and it only asks whether a wire exists. **No screen in `game/src/`
called `session.input()` at all**, combat included. So the missing piece was
never four call sites; it was the applier they call into.

### `game/src/net/actions.js`

One `ACT` verb per thing the run layer can be asked to do, one `applyInput()`
that turns an ordered input into a change to the Run, and `act(run, input)` as
the seam a screen calls instead of touching `run.takeRewardCard()` directly.

With no session it applies straight through and returns the run layer's own
answer SYNCHRONOUSLY, so solo and pass-and-play keep the timing they had. With a
session it goes out on the wire and comes back through the same applier. One
path for both, which is what `net/session.js` already argues for about its own
queue: an ordering bug then shows up in a one-machine test instead of only over
a real wire, where it would look like latency.

**Nothing puts a uid on the wire** (CONTRACTS trap 30). A card is named by an
index into an offer, a shelf or a Kid's deck, or by an authored id. The suite
measures why rather than asserting it: two real `Run`s on one seed hold the same
cards under uids `cb,cc,cd…` and `c17,c18,c19…`, because `nextUid()` counts per
PAGE.

### `run.asSeat(seat, fn)`

The run-layer twin of `engine._asSeat`. Every room action acts on `this.local`,
so a remote Kid's action has to be applied to THEIR Kid — and `setLocalSeat` is
the wrong tool because it emits `run:seat`, which is how a pass-and-play handoff
redresses the whole screen. It would have repainted one player's HUD as their
friend every time their friend bought a Snack.

**It deliberately does NOT move `engine.localSeat`.** CONTRACTS says the
engine's seat follows the Run's, and that is right for a HANDOFF, where the
screen has genuinely changed hands. Applying a remote input is the opposite
case: the screen still belongs to whoever is looking at it. `choices.ask({seat})`
opens the picker when the seat matches `engine.localSeat`, so moving it would
pop a choice for their Trick in front of me — on every client at once, each
answering it separately, which is a desync rather than merely a wrong screen.

### The screens

| screen | on the wire |
|---|---|
| the reward | take, skip, claim |
| Mr. Moth's | a Trick, a Keepsake, a Snack, the removal service |
| the Safe Room | sleep, sharpen, forge, sit, Mend a friend, Clone their Trick |
| a Curiosity | an option, the mend and forget follow-ups, a Rescue, the tidy pile |
| every per-Kid room | `markRoomDone` |
| combat | play, end turn, a Snack |

`_take` now sets `resolved` BEFORE anything can await, or a second click while
the input is on the wire takes a second Trick.

### Three things the wiring found

**`seat` on an input means who ACTED, so a target seat cannot use it.**
`session.input()` rejects any message whose `seat` is not the sending client's.
Mending a friend and Cloning their Trick both name the other Kid, and the first
version used `seat` for it, which the wire refuses. They use `to` now — the
field `useSnack(snack, targetId, { to: seat })` already uses.

**A Snack cannot be found by re-rolling the shelf.** `shopStock` reads the Kid's
keepsakes to decide what to offer, so recomputing it after a purchase answers a
DIFFERENT shelf. The buyer names the Snack by its authored id and the price it
was standing under.

**Ending a turn over a wire used to close the TABLE.** `_endTurn` read

> SOLO, and any client that owns its seat over a wire, ends the table: there is
> nobody else here to wait for.

and did exactly that. Over a wire there are three other Kids and they are on
other machines, so one client pressing END TURN would have closed all four turns
from one keyboard. Each client ends its own seat and sends it; every client
applies all four ENDs in the one agreed order; the enemy phase falls out of the
last of them on every machine at the same point in the log.

### `INPUT.CHOICE` is left unbuilt, LOUDLY

`ChoiceBroker` has `ask`, `setResolver` and `setScript` and no way to be
answered from outside, because local play resolves another seat's request from
its own `prefer` rule on purpose. That is netcode item 3 and it needs a broker
change, not a call site. The applier says so with a `console.error` rather than
a `?.` that returns null — a choice silently answered as null would desync the
two clients by one answer and the digest would report it a turn later, a long
way from the cause.

### Verification

`tests/net/run.py`, **33 -> 79 checks**, driving two REAL `Run`s (rule 9: no
mock of the thing under test) and, for combat, two clients through
`attachActions` rather than the harness's hand-rolled listener.

Negative-controlled by making `act()` apply locally with a session attached —
the state HANDOFF describes as "still act locally". **18 checks go red** across
all four rooms: the decks stop matching, the purse reads 999 against 945, a
friend is healed on one machine and not the other, the Keepsake a Curiosity paid
out exists on one client only, and neither client learns the other has finished
with the room. `INPUT.END` made to close the table takes out one more; `asSeat`
made to move the engine's seat takes out another.

**Two instrument errors found on the way, both in my own new tests.** The first
version of the pity check read `run.pity` off two clients sitting on two
different seats — `pity` is a PER_KID accessor, so it compared two different
Kids and reported a desync that was entirely in the test. And §11's run
stand-in had `asSeat: (s, fn) => fn()`, so its seat check could not have failed
however wrong `asSeat` was; it uses `Run.prototype.asSeat` now.

---

## 3. The Governess had no multiplayer targeting at all

`party-boss.py --region nursery`, n=16, real pre-boss decks, the shipped pool:

| party | win% | turns | left% | fallen | spread |
|---|---|---|---|---|---|
| 1p | 62.5 | 11.0 | 56 | 0.38 | 1.00 |
| 2p | 87.5 | 14.1 | 76 | 0.25 | 0.32 |
| 3p | 87.5 | 15.7 | 84 | 0.38 | 0.40 |
| 4p | **100** | 18.4 | **90** | **0.00** | 0.39 |

Four Kids won every fight, nobody ever fell, and the party finished holding 90%
of its Courage. Solo is 62.5% at 11 turns — inside the 45-65% and 8-12 bands,
and untouched by any of this.

**The opposite failure from the Butler's**, and not the Courage curve. She
declares no `partyTarget`, no `partyPick` and no `splash` on any of her five
attacks, and `engine.intentTargetFor` rolls ONE seat at the start of a fight and
holds it in `targetSeatId` until that Kid falls:

```js
const held = enemy.targetSeatId && living.find(pl => pl.id === enemy.targetSeatId);
if (held) return held;
const rolled = living[this.rng.int(living.length)];
enemy.targetSeatId = rolled.id;
```

So at four Kids she fought one Kid for eighteen turns while three stood
untouched and hit her freely. Read off the code, not inferred from the spread —
but spread 0.39 is the same fact from the other end.

### Authored to the region's own precedents

§35 covers the Doll's Courage, Stitched Together and the repair windows and says
nothing about where her attacks land. §27 does: *"Individual enemy attack damage
generally remains close to solo values. Mechanics change to account for multiple
players."*

| move | change | precedent |
|---|---|---|
| Mind Your Seams 12x2 | `partyTarget: 'all'`, and the Pinched Seam on every seat | §31, Gallop hits all players |
| Sharp Correction 24 | `partyPick: 'lowestCourage'` | §29, "prefers the player with the lowest percentage Courage… shown clearly before players act" |
| Tighten the Stitch 17 | `splashFn` 10, DECLARED | phase two's only AoE |
| Snip Snip 11x3 | `partyTarget: 'two'` | §33, Sharp Little Hands |
| Needle Point 13 | unchanged | one move stays one Kid's problem |

**`lowestCourage` is also the honest answer to the open `partyPick` question.**
CONTRACTS records that a preference computed from state the player controls
cannot both track that state and stay still, and that anything telegraphed a
turn ahead probably wants something the player cannot game inside the turn.
Courage is exactly that, and §29 already chose it for this region — so the
question has an authored answer here rather than needing an engine change.

### Damage does NOT come down per head, and that is measured

The Butler's Dust Them Off trades per-head damage for coverage (5x2 to 3x2) and
that is right for him: it fires every third turn of phase one, so the full
number put a party under pressure every round and measured 0% wins. Hers fires
once in four turns and only in phase one. The reduced version was built and
measured FIRST:

| 4p | win% | turns | left% | spread | cost |
|---|---|---|---|---|---|
| no targeting | 100 | 18.4 | 90 | 0.39 | 17.2 |
| cut per head (8x2, 8x3) | 93.8 | 15.4 | 87 | 0.42 | 30.4 |
| at full (12x2, 11x3, splash 10) | 87.5 | 18.6 | 89 | 0.46 | 46.4 |

The cut version did nothing: the number after the cut was small enough that four
Kids' Guard ate it. At full value the cost has nearly tripled and the damage is
genuinely shared.

**What is still open, plainly: four Kids still finish her holding 89%.** That is
the same structural ceiling the Butler round hit and recorded — party output
does not scale with the pool the way its Courage does, and no multiplier fixes
it. Her damage and her Courage were both left alone to chase it: the first is
against the doc's rule and the second makes the fight longer rather than harder.

### `tests/governess/` — the suite she never had

25 effect assertions. With the four declarations stripped, **11 go red**: Mind
Your Seams reaches one seat of three, only that seat is Pinched, the splash
reads `undefined` to the seats with no arrow, and Snip Snip cuts one child.

Two of them passed by luck at first, because the default held roll landed on the
same seat the preference wants. They pin `targetSeatId` to seat 0 now, so the
preference is the only thing that can move the arrow.

Two seams it found:

- **`c.targets()` was missing from the enemies harness ctx.** A def method
  calling a ctx member the harness does not have throws THERE while resolving
  perfectly against the real engine — the same seam `loseBlock` was added for.
- **Mind Your Seams applies its status through `c.targets()`, not `c.player`.**
  `c.player` is the aim and it is fixed when the ctx is built, so on an AoE move
  the damage goes to everybody and a status hung on it Pinches one child.

---

## 4. The Bedframe Beast is not reachable

`--region sleeping-quarters` answers "no loadouts for 1p" four times, and that
is not a broken harness. **`RUN_LENGTH_REGIONS` is 2** — an expedition is the
Foyer and the Nursery and stops at `isLastRegion` — so no run ever reaches the
third wing and there are no loadouts to capture.

`--lregion` measures it against what a party carries when the run currently
ends. The table says **PROXY in the terminal**, because `party-boss.py`
re-renders from `window.__PARTY__` and never echoes the page's own header, so a
warning that only reaches the page reaches nobody.

It is also NOT untargeted, which the `partyTarget`/`partyPick` grep suggested and
reading the file disproved: it implements §46's marked Kid with its own held
`markedSeat` plus declared splash, because §46 wants the mark shown a full round
ahead and a `partyPick` tracks. That is the CONTRACTS §3 tension, already solved
once in content.

Left alone. It is content that does not ship at this run length, and retuning it
would be tuning against decks no player will ever have.

---

## 5. The lobby, the choice broker, and a black void

Three more pieces landed after the sections above.

### `net/lobby.js` — nothing is elected

`Session` takes `seat`, `seats`, `seed` and `host` as constructor arguments.
This is where they come from, and the design is that none of them is negotiated:

- **Seat is position in the sorted peer-id list.** Every client sees the same
  set of ids and sorts it the same way. "First to connect is seat 0" is the
  obvious alternative and it is the one thing lockstep cannot use, for the same
  reason `_insertAt` orders by `(turn, seat, seq)` and never by arrival.
  Compared by CODE UNIT, never `localeCompare` — that is locale-dependent and
  would seat two players differently on two machines with different language
  settings.
- **The host is seat 0**, so there is nothing to elect.
- **The seed is a hash of the room code.** `Session` already reports a seed
  mismatch at hello; this makes the mismatch impossible instead.
- **The roster freezes at `start()`**, because a seat index is what every input
  is stamped with.

Negative-controlled: seats made arrival-ordered gives `zoe=0 amir=0 kit=0
bea=0`, every client believing it is seat 0. The freeze control found a hole in
my own test first — it used a late id of 'zzz', which sorts last and therefore
cannot renumber anybody.

### The choice broker over a wire, and the deadlock

`ChoiceBroker.setRemote()`. The local fallback is untouched. Two things are
load-bearing:

**The answer is delivered OUT OF BAND.** `ask()` is awaited from inside a card
effect, which is inside an input the session's queue is applying. Queue the
answer too and the play cannot finish until the answer arrives and the answer
cannot be applied until the play finishes. Ordering survives anyway: an answer
is not a new action in the sequence, it is the continuation of the one every
client is already blocked on.

**A request naming NO seat still belongs to one.** "Whoever is driving" is
unambiguous with one engine and a silent desync with four. `engine.acting` is
who is really driving. Control: both clients open a picker and answer
differently (`2 / 0`).

A request is named by its SEQUENCE, never `req.id` — `REQ` is a module-level
counter shared with every preview, so one player hovering a card bumps their
numbering. Answers are kept by seq because one can arrive before its question: a
fast peer, or a rejoining client absorbing a log of answers before it replays
the plays that ask them. Without that store the suite does not fail, **the page
hangs**.

### `tools/shot.py` was screenshotting a black void

The tool whose own docstring says "this is how every critic SEES the real game".
`--wait` was a fixed sleep after `load`, and `core/renderer.js` renders nothing
while it warms — `_warming` is set before its first await on purpose — which on
this GPU is about ten seconds cold. So the documented `--wait 9` produced a
picture of the HUD floating on black with no room behind it. Measured: `--wait
9` black, `--wait 12` a fully lit Foyer.

**No player has ever seen it.** They boot to the title and the warm-up finishes
while they read the menu; walking into combat from a settled title is lit in
four seconds. That is the control that says the game is fine and the instrument
was wrong, and it is why it survived — there was nothing broken to find.

It waits for `stage.warmStage === 'done'` now. `--wait 2` gives what `--wait 9`
could not. Trap 6 — "`--wait 4.5` can catch the map mid-draw, use `--wait 9`" —
was this same bug being treated with a bigger number, and is marked superseded.

## 6. What is open

1. **Four Kids still finish the Governess holding 89%.** Structural, shared with
   the Butler: party output does not scale with the pool.
2. **Netcode: only the TRANSPORT is left.** Items 2, 3 and 4 are done. Steam P2P
   is one file implementing the five methods in `net/transport.js`, it needs a
   wrapper shell, and it ends the no-build rule — the designer's call. The
   **lobby SCREEN** is the other unbuilt half, and that is a design question:
   what it looks like, how a code is shared, whether joining is a Steam invite
   or a typed room name.
3. **fps**, unchanged: the DOM's aggregate compositing cost, no single culprit.
4. **The cold card-art stall**, unchanged: a feel decision for card-feel.
5. **Crinkle's design chapter** is still an unreviewed reconstruction.
