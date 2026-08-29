# The Butler's AoE, and the instrument that could not see it

2026-08-28. Two halves: make the Butler dangerous through AoE rather than a
bigger Courage pool (HANDOFF §9 decision 4), and fix the flagged bugs. The
first half could not be measured honestly until the second half had already
started, which is most of this note.

---

## 1. The instrument was broken, and the co-op curve rests on it

The job says **MEASURE IT. Do not ship a guess.** So the first thing built was
a boss harness that can seat a party — `bench()` is solo-only and
`tests/coop/balance.py` fights bosses with 10-card starting decks, which
against 941 Courage measures a floor rather than a change.

Building it meant reading the harness that already existed, and it did not
survive the reading. **Three defects, each of which alone invalidates the
co-op Courage curve.**

### Two enemy phases every round

`tests/coop/balance.html` closed each round like this:

```js
for (const pl of e.livingPlayers()) { …; await e.endTurn(pl); }
if (!e.over && !e.tableReady && e.phase === 'player') await e.endTurn();
```

`endTurn(seat)` runs the enemy phase the moment the LAST seat ends, and then
opens the next player turn. So by the time the loop finished, `tableReady` was
false again and `phase` was `'player'` again — **for the new round**. The
trailing line ended a turn nobody had played.

Measured rather than argued: counting `phase:'enemy'` emissions per round reads

```
1p  with the trailing endTurn(): [2, 2, 2, 2]      without it: [1, 1, 1, 1]
2p                               [2, 2, 2, 2]                   [1, 1, 1, 1]
4p                               [2, 2, 2, 2]                   [1, 1, 1, 1]
```

Guarded on `e.turn`, which `_beginPlayerTurn` increments — that is the one
reading that separates "the round never resolved" from "the next one has begun".

### The bot scored clones while reading the real board

```js
const seatOf = (e, seat) => seat || e.players[0];
```

`seat` is an actor belonging to whichever engine the CALLER was driving. The
beam search evaluates CLONES. So `options()` enumerated a hand that never
emptied however many cards the line played, and `endTurnValue`'s `guarded` was
the Guard standing BEFORE the turn rather than after it. The bot could not see
its own plan, so it never valued Guard — **and only when a seat was passed,
which is to say only in co-op.**

The number: one Kid took 41 Courage of damage where the same loadout on the
same seed took 10 through the solo path.

### Half the scoring function never took a seat at all

`residual`, `projectedValue` and most of `staticScore` read `s.player` — seat 0
— while `balance.html` disarmed the dev guard that would have thrown. Every
seat's plan was scored against seat 0's Courage, Guard, Nerve and hand. `bot.js`
is fully seat-resolved now, and `seatOf` resolves by id inside the engine it is
handed.

### What the curve actually reads

| party | win% | turns | Courage left | falls |
|---|---|---|---|---|
| 1p | 100% | 5.6 | 61% | 0.00 |
| 2p | 100% | 6.5 | 75% | 0.00 |
| 3p | 100% | 7.0 | 81% | 0.00 |
| 4p | 100% | 8.2 | 83% | 0.00 |

Stable at a second seed (58 / 76 / 78 / 83% Courage left). Against the
79 / 75 / 96 / 96% the broken harness reported. **The Foyer standard tier is a
non-event at every party size**, and `[1, 2.2, 4.0, 5.7]` was tuned to a game
hitting twice as often as the real one.

The open finding from the party-of-four round survives in sharper form: the gap
is in **cost**, not win rate. A standard Scuffle costs a solo Kid **39%** of
their Courage and a party of four **17%**.

### And the suite could not run at all

```
$ python tests/coop/balance.py --n 24
usage: balance.py [-h] [--party PARTY]
balance.py: error: unrecognized arguments: --n 24
```

`tests/coop/select.py` **was** the `select` module for everything run from that
directory — Python puts a script's own directory first on `sys.path`,
`balance.py` imports `asyncio`, `asyncio` imports `select`, and the test
script's own argparse then ran against `balance.py`'s argv. All six scripts in
`tests/coop/` were affected, and the two that take no arguments were quietly
running the select-screen test before their own. Renamed `selectscreen.py`;
`tests/stdlib-shadow/check.py` is the gate, and it was verified to fail on a
planted collision before being trusted.

### The anchor

`tests/critic-design/anchor.py`: with ONE Kid, `partyBench()` must reproduce
`bench()` fight for fight. 5/5 exact — win, turn count and damage taken.
Everything the party rows claim rests on that row agreeing, and getting there
also caught the third defect: `run.buildCombat` seeds the fight from
`fork('combat:' + node.id)`, so two harnesses that name their bench node
differently play different fights and look like they disagree.

---

## 2. Why the Butler was long, in numbers

`tests/critic-design/butler-ledger.html`, 24 fights over 8 real pre-boss
loadouts:

```
  his Courage pool           165
  Guard he GAINED            85.2
  damage that Guard ATE      35.8
  effective pool             201   = 1.22x the printed 165

  one-at-a-time          1.75 breaks/fight   pays him GUARD 8/10
  no-roughhousing        0.92 breaks/fight   pays him damage rider +5/7
  keep-the-hall-clear    0.42 breaks/fight   pays him GUARD 10/12
  no-running             0.13 breaks/fight   pays him damage 6/8

  Reprimands paid in GUARD: 68% of all breaks
```

That is the whole of "he is not dangerous, he is long". The fight's central
mechanic — the one the player is invited to trip on purpose — was paying him in
LENGTH. Two of his four Reprimands hand him Guard, and the most-broken rule in
the fight is one of them.

## 3. What was built

**AoE, authored where the chapter is silent.** §28 covers his House Rules and
Flustered thresholds and says nothing about targeting, so this follows §26's
precedent (Red Carpet Runner's Run the Hall) and his own tells:

| move | change | why |
|---|---|---|
| Dust Them Off 5×2 | `partyTarget: 'all'` | he tidies EVERY guest; per-Kid damage unchanged |
| Enough of This 15 | `splashFn` 6 | a shout is aimed at one and heard by all — and DECLARED, so the seats with no arrow are told |
| Remove the Intruder 7×3 | `partyPick: 'highestCourage'` | stays single-target on purpose; picks the healthiest rather than executing the weakest |
| Walking Stick 10 | `partyPick: 'lowestGuard'` | the Kid who is not braced |

One AoE per phase and one move that is genuinely one Kid's problem.

**Reprimands that threaten instead of protecting him.** Both are deviations
from foyer §17 and §18, recorded in the def:

- GUESTS WAIT THEIR TURN: +8/10 Guard → **5/7 damage that ignores Guard**.
  Ignoring Guard is what makes it distinct from GUESTS DO NOT RUSH: the deck
  that shrugs off a flat 6 is exactly the defensive deck that breaks this rule.
- GUESTS DO NOT CLUTTER THE HALL: +10/12 Guard → **he tidies 10/12 of YOUR
  Guard away**. Damage is the wrong answer to a player sitting behind 12+ Guard;
  removing it is the same threat against the deck that actually breaks it. It
  is also the more faithful reading of the name.

## 4. Measured

Party A/B, same loadouts and seeds, matched metrics, n=10 a size:

| | spread | turns | cost | falls |
|---|---|---|---|---|
| 2p | 0.69 → **0.80** | 23.6 → **21.0** | 93 → **116** | 1.0 → 1.6 |
| 3p | 0.76 → **0.89** | 34.4 → **27.2** | 150 → **185** | 2.1 → 3.0 |
| 4p | 0.65 → **0.90** | 42.1 → **36.4** | 169 → **253** | 1.2 → 4.0 |
| 1p | 1.00 | 13.1 → 13.4 | 44 → 48 | 0.5 → 0.5 |

Shorter and more dangerous at every party size, with the damage genuinely
shared rather than piled on one seat.

**Solo got harder, and here is the number rather than a shrug.** n=48, same
loadouts and seed as the recorded baseline: **66.7% → 60.4%** win,
13.5 → 13.1 turns (median 14 → 13), Courage cost 46.7 → 51.8, Courage left on a
win 37.7 → 32.8. Still inside the brief's 45-65% band, and better centred than
66.7% was. The length barely moved, exactly as the ledger predicts: the
converted Reprimands are worth roughly 8 of the 201 effective pool. **The
remaining length is the Courage pool**, which is off the table by decision.

## 5. Other bugs found and fixed

- **`preview.js` computed every preview against SEAT 0.** `sim.player` all
  through — the id it credits Guard and healing to, the Nerve it reports left,
  `playerDies`. In a party the preview a Kid saw for their own Trick was the
  host's board, and a teammate's Curl Up previewed as **0 Guard** while really
  granting 5. `_playCard` has used `seatOfCard` since co-op landed; the preview,
  whose whole job is to say what `_playCard` will do, never did. Two assertions
  in `tests/coop/suite.js`, both of which fail without the fix.

- **Pipkin's Patch is visible for the first time since he shipped**, as one chip
  reading `PATCH 3/6 · 1 ripe`. A plot per object was the first shape and the
  screenshot killed it — three chips already covered his portrait against a cap
  of six, and his Tricks all read counts anyway.

- **`engine.objects` changes never triggered a redraw.** Nothing listened to
  `object:add/update/remove`, so a plot only refreshed when an unrelated player
  event happened to run the sync: the rail printed `SEED 0/2` over three
  objects the engine had already advanced to Sprouts. Brambleboo's Garden had
  the same staleness the day it shipped. Every suite green for both; the
  screenshot is what found it, again.

- **`ctx.loseBlock`**, the twin of `block`, added to the enemy ctx. Reaching
  `c.e.loseBlock` resolves against the real engine and throws against the
  enemies harness, which builds its own ctx.

- **`state.stashCap` was seat 0** in a snapshot that is otherwise per seat, with
  no reader anywhere in the build. Pudding widens that cap per Kid.

- **`DeckView._schedulePlace`** documents itself as one read pass then one write
  pass, and then read `offsetTop` after the writes.

## 6. Two flagged bugs that were already fixed

Both verified before touching anything, which is what the brief asks for.

- **The audio cue race does not reproduce.** The quoted error is the one the
  render-quantum guard in `fmBell` was written for, and `git log -S` dates that
  guard to 2026-08-27. `selectscreen.py --party 4` and `hotseat.py --party 4`
  are green with 0 console errors, and a new `tests/audio/hoverstorm.html`
  fires 240 cues under a blocked main thread for 0 failures. Hardened anyway:
  `fmBell` clamped `t` on entry and then allocated a dozen nodes before
  scheduling, so the clock could pass it again in between.

- **`tests/map/run.py` is not timing-flaky.** It already waits for
  `.map-screen.is-drawn`. 23/23 twice, back to back.

## 7. fps: still failing, now diagnosed

54 and 51 in isolation before, **56 and 53** after the DeckView fix, against a
threshold of 58. What is new:

- A blank page and a bare served page both measure **61-62** with the same
  flags. The shortfall is the app, not the machine — which the previous round
  could not rule out.
- Sampling once a second for 12 s, the harness settles to 59-62 with a hard dip
  at 3-4 s, and a `PerformanceObserver` puts **923 ms of blocked main thread at
  5.0-6.3 s after load**, the largest single task **676 ms**.
- Wrapping `requestAnimationFrame` and `setTimeout` attributes only **141 ms**
  of that, all to `DeckView._schedulePlace`. The 676 ms task is neither, so it
  is synchronous work in a promise or an event — most likely the 60-card deck
  grid and its art.

A CPU profile then named the 676 ms task outright: **`render` in
`ui/cardart.js:336`, 735 ms of self time across the load and 500 ms of it inside
the window.** `render` paints a canvas and calls `toDataURL('image/png')`, and
`paint` itself samples at 10 ms — so essentially all of it is PNG encoding, 60
cards at roughly 12 ms each, all in one task because `DeckView` mounts them
synchronously while the incremental `warmArt` queue sits unused beside it.

### …and then the fixture turned out to be the smaller half

The obvious next question is whether the GAME holds 60, and it does not.

`tools/shot.py` reads one 1-second sample per process launch, and three launches
at 1920x1080 gave **48, 38 and 17** — a spread that describes launching
Chromium, not the scene. One browser, one load, six samples says:

| scene (1920x1080) | samples | median |
|---|---|---|
| title | 61 61 60 60 61 | **61** |
| gameover | 57 58 55 59 59 | 58 |
| map | 53 47 55 49 52 | **52** |
| combat | 52 44 52 52 56 | **52** |

A blank page and a bare served page both measure 61-62 with the same flags, and
the title scene reaches 61 — so the browser, the machine and the compositor can
all do 60. **Combat and the map cannot**, at the exact resolution CONTRACTS
non-negotiable 3 names.

And it is not JS. Profiling six seconds of a settled, idle combat scene:
**665 ms of JavaScript in six seconds** — about 1.85 ms per frame — against
5592 ms of idle and program. Nor is it fill rate: 1280x720, 1600x900 and
1920x1080 measure 55, 56 and 52, nearly flat across 2.25x the pixels.

Nor is it the quality tiers. Auto-detection picks **medium** on this GPU
(renderScale 0.8, dprCap 1.5, bloomScale 0.5, 6 halation taps, 1100 particles),
which is the right call, and forcing each tier gives:

```
  high    [49, 50, 45, 45, 28]   median 45
  medium  [54, 54, 56, 55, 60]   median 55
  low     [ 1, 53, 55, 57, 57]   median 55
```

**Low buys nothing over medium.** Everything the tiers scale — render scale,
bloom, halation taps, particle count — is already off the critical path at
medium, so the remaining cost is fixed per frame and lives in the combat and map
SCENE GRAPHS: draw calls and GL state changes, on an ANGLE/D3D11 Intel UHD stack
this project has already caught being pathological about program switching
(§8 of the round-6 note, `getProgramInfoLog` at 400-750 ms per program).

That is where a graphics round should start, and it is not a guess I should make
from here. What is now excluded, with numbers: JS per-frame cost, resolution,
the post chain, the quality tiers, and the machine.

## 8. The party curve, swept — and why one number cannot fix it

`party-boss.py --sizes 1,4 --scales 1,0.7,0.55,0.45`, n=8 a cell, one set of
captured loadouts across all four scales. The anchor is **solo at the shipped
pool**: 50% win, 13.4 turns, 27% Courage left.

| xHP | effective 4p mult | win% | turns | med | left% | falls | spread |
|---|---|---|---|---|---|---|---|
| 1 | 5.70 | 0 | 49.5 | 50 | — | 4.0 | 0.89 |
| 0.7 | **3.99** | **50** | 42.0 | 49 | 32 | 2.0 | 0.78 |
| 0.55 | 3.14 | 87.5 | 29.4 | 31 | 42 | 0.5 | 0.68 |
| 0.45 | 2.57 | 87.5 | 18.6 | 16 | 66 | 0.5 | 0.51 |

**There is a multiplier that matches the win rate: 4.0, not 5.7.** And it does
not fix the fight, because at 4.0 the boss still takes **42 turns** against
solo's 13.4. Matching the length instead would need roughly 2.2, where four
Kids win 88% and walk out with two thirds of their Courage.

So the curve is not one number away from right, and shipping 4.0 would trade one
wrong number for another while hiding the reason. The reason is a **death
spiral driven by length**:

- Four Kids at the shipped pool deal about **20 damage a turn between them**
  against a single Kid's 15. Four times the bodies, 1.3x the output.
- `falls` runs 4.0 / 2.0 / 0.5 / 0.5 down that table. In the long fights half
  the party is down for most of it, and a fallen Kid contributes nothing.
- The Butler's own Guard is per TURN — Formal Welcome 12, Collect Himself 6,
  Restore Order 14, This Is Most Irregular 16 — so a fight that runs three times
  as long hands him roughly three times the Guard to absorb with. A bigger pool
  therefore costs **super-linearly**, not linearly.

Each of those feeds the next: more Courage, more turns, more AoE landing, more
Kids down, less output, more turns.

**Not changed, deliberately.** `PARTY_HP_SCALE` governs every enemy in the game
and this is one tier at one party size at n=8. The standard tier says something
different again — win% is already FLAT at 100% across all four sizes, so there
the curve is doing its job on win rate and only the leftover-Courage gap
(61% solo → 83% at 4p) is open. A single constant is being asked to serve a
5-turn Scuffle and a 40-turn boss, and the measurement says it cannot. That is a
designer's call about SHAPE, not a number to nudge, and it wants the recommended
4.0 checked at 2p and 3p and against the standard tier before anything ships.

## 9. What is open

1. **The party Courage curve.** §8: 4.0 matches the win rate at four Kids, no
   multiplier matches the length, and the constant is shared with every other
   enemy. Recommend deriving it per tier, or shortening long fights by capping
   what a boss's per-turn Guard can absorb.
2. **The Butler's solo length is the Courage pool.** The sweep on record puts
   him in the 8-12 turn band at 0.65x. Off the table by decision.
3. **fps**, per §7.
