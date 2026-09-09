# Handoff — the route is a system now; one wing still cannot be entered

Paste this whole file into a new conversation. Branch `dev`, everything below is
committed **and pushed** (`0075d7f`). `python tools/devserver.py 8777` is
expected to be running at the repo root; every test drives the real game at
`http://localhost:8777/game/index.html`.

**The previous ask is finished.** The greenhouse Guard wall turned out not to be
a wall, and the work that followed rebuilt how difficulty is priced.

---

## FIRST, BEFORE ANYTHING: run the whole sweep — and it is 39 now, not 38

    for f in tests/*/check.py; do python "$f"; done

**`tests/room-mood/check.py` is UNTRACKED and prints `PASS`, not `RESULT:`.**
Somebody wrote it and never committed it, and every sweep in this repo greps for
`RESULT:` — so it has been silently skipped by every gate run ever done. It
passes today (19/20 heart, seven relocated rooms). Decide whether to commit it
and make it print `RESULT:` like the other 38. This is trap 54 again: a gate
nobody can see is not a gate.

---

## WHAT SHIPPED, 2026-09-07/08

Seventeen commits, `53f3c8e..0075d7f`, plus Josh's `eff0c22` (narration audio)
which landed mid-session — I rebased onto it, his 73 voiceover files are intact.
Notes under `docs/notes/2026-09-06-the-wall-that-was-a-bot-passing.md`,
`2026-09-07-two-players-one-house.md`,
`2026-09-07-difficulty-by-where-you-met-it.md`.

1. **The "cleanest Guard wall left in the game" was the bot passing its turn.**
2. **Every wing is reachable from every fork**, and the way in is a **party vote**.
3. **Difficulty is priced by ROUTE position**, normalised against what a wing is
   authored at — the system this project needed for a chosen route.
4. **Three co-op desyncs fixed** and the Transport contract made executable.
5. **The Kid select screen is its painting**; the atmosphere bench is reachable.
6. **1447 of 1447 companion cards have art**, and some of it was the wrong art.

---

## DO NOT RE-DERIVE THESE. Each cost a round or more.

1. **`wall` counts Guard GRANTED, not Guard that stopped anything.** Guard is
   wiped and re-granted each turn, so Guard the deck never tests inflates `wall`
   exactly as much as Guard that ate a hit. Seed 957908's greenhouse Scuffle —
   handed over last time as "a genuine Guard wall" — raised 392 Guard of which
   **84 was ever consumed**, while the bot held 3 Nerve, 7 cards and **7 LEGAL
   cards** and played nothing for eleven straight turns. Read `raised` against
   `consumed` with `tests/run/probe.py` before calling anything a wall.
2. **Ladder index does not predict difficulty**, and neither does static content
   weight. The enemies are nearly flat across the house (0.92–1.46 by
   `hp × damage`) and the **Bathhouse — slot fourteen — is the LOWEST**.
   Formation weight (`pool × dps`) spreads only 0.97–2.49 and under-predicts the
   deep wings ~1.6×, because deep content is **mechanically** harder, not
   numerically bigger. `REGION_FIGHT_WEIGHT` is measured as what a wing COSTS a
   reference deck. Both failed proxies are recorded in `schema.js`.
3. **Lowering enemy DAMAGE breaks the harness bot.** It removes the pressure
   that makes it act: past-30 went 3 → 13 and a Dough Blob sat at **47/47 for
   200 turns**. A difficulty knob must not reach into that. Too hard for a slot
   cuts the POOL; too easy raises DAMAGE, capped at 2.5.
4. **A co-op run must be a pure function of the roster and the seed.** Anything
   read from `Save.data` while building a run is a divergence vector. Two were
   live: Haunt (4 vs 0 — different enemies from the first fight) and the rescue
   pool (9 vs 15 — a different Companion freed by the same boss).
5. **Extra tiles on a card sheet are the POINT.** `mopsy_cards1-20a` really does
   carry 22 for a 20-card range with two named by hand in `OVERRIDE`. Only a
   SHORT read is broken; never re-derive a grid over a sheet with spares.

---

## THE ONE RED THING, AND IT IS THE SAME ONE

`tests/run/index.html` exits 1 on `_losePatience` past turn 30. **Not a
regression.** 7 of ~600 fights at n=50, past-24 15.

The number is not comparable to the "3" in the last handoff: those 50
expeditions all started at the Foyer, and a third of them now begin anywhere, so
they meet far more content. What is left is boss treadmills the deck is WINNING
(`left 0%`, high `summoned`) — the shape two prior notes established as working
as designed. **No bot change reaches those.** The open decision is unchanged and
is a design call: shorten those fights, or decide what `PATIENCE` should be.

### The next thing to pull

**The Crypt is the only wing that cannot be begun in: 14/14 dead at wing one**,
at an ordinary 17.5% cost per fight, mean wings crossed 1.0.

Its structure is the Graveyard's twin — 14 rows, 64 nodes, 30.4 fights against
63.8 and 30.7 — and the Graveyard clears 10/14. So it is neither fight cost nor
wing shape. It is the roster, and the encounter table says so in its own
`teaches` lines: *"it leaves, and comes back, and you cannot hit it in between"*,
*"kill it and it collapses into a Pile"*. **Every early Crypt fight is a
resurrection fight**, so its difficulty is in BODIES TO KILL.

`summonFix` (the route ratio applied a second time to anything `summon()`
created) moved it 0 → 1 of 14 and **did not move its first-fight cost at all**,
which says its returns are not what its first fight is made of. Something else
in that wing is doing the killing and I did not find it. Measure with
`python tests/run/run.py --runs 4 --startsweep 14 --wait 1300`.

---

## OPEN, NAMED, NOT STARTED

- **Steam still needs an App ID**, which only Josh can get. `SteamTransport` is
  one line in `WIRES` in `tests/net/index.html` when it exists, and the contract
  it must satisfy is executable there now. **The wire format is already
  Steam-safe** — measured, 7 messages, three shapes, all identical after a JSON
  round trip.
- **Co-op cannot choose a Kid on the painted board** — that board is the
  first-run opening; co-op picks in the lobby. Not a bug, a gap.
- **§29 of the Groundskeeper is still unimplemented**; the `dup-keys` brace
  walker still misclassifies a function body as an object literal.
- **Three card sheets have a width outlier** (`bones_81onA`, `taffy_21-40a`,
  `wink_61-80a`). All three have the CORRECT tile count, so they are uneven by
  design and the mapping is right. Left alone deliberately.
- **`art/` composites are ~110 MB and untracked.** `game/assets/cards` is now
  43 MB of tracked webp — plain git objects, matching the existing precedent,
  not LFS.

---

## TRAPS THIS SESSION HIT

- **A `goto` that differs only by the URL hash is a SAME-DOCUMENT navigation**,
  so `main.js` never re-runs and the scene never changes. This made a working
  feature look broken twice. Reload, or use a distinct path.
- **`VOTE_BEAT` is 3 seconds and `get ctx()` falls back to `window.MM.ctx`**, so
  a page-hosted harness really does wait it out when the roulette overrode
  somebody. Reading a vote result at 120 ms reports "everyone is still in the
  Foyer" and looks exactly like a broken vote.
- **A determinism assertion cannot see a feature gap.** "Both tabs agree" passed
  happily while both machines got the default Backpack. Assert that the thing
  ARRIVED, not just that two clients match.
- **A way-in fork is also `choosing`.** Asking `choosing` first plaqued it "The
  Way On" and printed "1 of 6 wings crossed" on a run that had crossed nothing.
  Ask `entering` first — it bit three times.
- **`resolveWingVote` nulls `pendingWing` before it crosses**, so validating
  against it made every entry vote fall back to the Foyer.
- **Line endings are per file and mixed. Check, never assume.** CRLF: `run.js`,
  `engine.js`, `schema.js`, `keywords.js`, `tests/net/index.html`,
  `tests/pudding/index.html`, `HANDOFF.md`, `lib/bot.js`, `cut_card_art.py`.
  LF: `atlas.js`, `select.js`, `scenes/lobby.js`, `net/lobby.js`,
  `tests/run/index.html`, `tests/coop/lobby.py`. Write a patcher that counts
  terminators before and after and REFUSES on a mismatch.
- **Prove a new gate can SEE.** Every gate added this session was verified by
  deliberately regressing the code — and that is how I found the Backpack
  assertion was blind.

---

## GATES

    39 × tests/*/check.py       38 green; room-mood passes but prints PASS
    tests/run/run.py            50 runs, 1 error (the documented one)
                                determinism 5/5 · resume 3/3 · mid-fight 3/3
    tests/net/run.py            190 passed
    tests/coop/run.py           645 passed
    tests/coop/lobby.py         27 passed
    tests/vote/run.py           35 passed
    tests/pudding/run.py        52 passed
    tests/cards/run.py          1470 cards, 0 errors
    1447 of 1447 companion cards painted, 0 missing

`--startsweep N` on `tests/run/run.py` is the difficulty instrument; `probe.py`
is the single-expedition one. Neither runs by default.
