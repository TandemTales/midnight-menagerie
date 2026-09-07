# Handoff — the house is built; what is left is one Guard wall

Paste this whole file into a new conversation. Branch `dev`, everything below is
committed **and pushed** (`02bf87b`). `python tools/devserver.py 8777` is
expected to be running at the repo root; every test drives the real game at
`http://localhost:8777/game/index.html`.

**The previous ask is finished.** All three parts of the last handoff shipped,
plus the routing it raised. This file is mostly about what to do next and what
NOT to re-derive.

---

## WHAT SHIPPED, 2026-09-06

Seven commits, `c40b500..02bf87b`. Each has a full note under `docs/notes/`.

1. **The atlas** (`scenes/atlas.js`) — the whole estate on one sheet. Hover a
   wing, select it to zoom, and that wing's own traced section is re-inked over
   the exact rectangle it was cut from, so the house goes soft and the wing goes
   hard. `ui/plan.js` is the one inker `map.js` and the atlas share.
2. **The opening** (`scenes/tutorial.js` + `ui/coach.js`) — Kid first, then the
   story, then a coached fight on the REAL `CombatScene`, then the expedition.
3. **Difficulty by run depth** — was already done before this session.
4. **The route is walked, not dealt** — the party chooses each crossing off the
   design doc's adjacency graph. This is the big one; see below.
5. **Two bosses whose phase one never ran** — a real, weeks-old content bug.
6. **Three gates that were crying wolf**, and one that promised something it
   could not keep.
7. **The other half of the fixture farm** — the bot was spending half its damage
   on a sleeping grate.

---

## DO NOT RE-DERIVE THESE. They are measured and they cost a round each.

1. **Every region is GENTLER as an early wing, not harder.** `runDepthDamageScale`
   climbs 1.2 → 1.8 across wings 2..5 and swamps the authored difference:
   pumpkin-grounds wins 25% at wing 2 and 13% at wing 5. **So do not add a depth
   floor to the route.** It was built, measured and deleted — it would push the
   five hardest wings to exactly the slots where they cost most. Two weaker
   variants were also measured and thrown away (a floor alone starved the far
   end, Kennels 2.9%; a strict band was worse, 0.3%, *and* took the manifested
   share to 59%, which makes the graph decoration).
   Measure with `python tests/critic-design/ladder.py --wing N` — added for this,
   it pins the bench's route slot instead of the region's ladder slot. Series in
   `tests/critic-design/ladder-by-wing.json`.
2. **The routing change is difficulty-neutral.** 50 seeded expeditions, dealt
   route vs chosen route: 4 victories each, 19 Foyer defeats each, deck/purse/
   Keepsakes inside noise.
3. **`ladder.py` with NO `--wing` prices every region at its own ladder slot**,
   which for anything at slot six or later is the depth term's ×2.0 endpoint.
   Its "x10.75 ladder" headline is partly that term, not authored content.
4. **The run gate's 1 error is expected.** See the next section.
5. **The route distribution is gated, not eyeballed**: 4000 routes, min 12% /
   median 24.7% / max 53%, 71% of offered doors architectural. A 7% floor per
   wing is asserted in `tests/run/index.html`.

---

## THE ONE RED THING, AND IT IS HALF-CLOSED

`tests/run/index.html` exits 1 on `_losePatience` firing past turn 30. **Not a
regression, not a mystery.** Read `docs/notes/2026-09-01-the-guard-axis.md` then
`docs/notes/2026-09-06-the-other-half-of-the-fixture-farm.md` first.

Two harness defects caused most of the tail and are fixed, both in
`tests/critic-design/lib/bot.js` `residual()`: it valued damage to a surviving
enemy at zero, and then paid for damage to summon-only fixtures that repair
themselves. n=200: longest **65 → 49 turns**, past-30 17 → 15.

**Caveat against that headline:** at the shipping n=50 the past-30 *count* went
UP, 3 of 625 → 5 of 652, while the longest fell 60 → 49. The count at fifty is
noise; read n=200.

### The next thing to pull, with its seed

    957908  greenhouse/SCUFFLE  38 turns  wall 10.3  land 3.3  abs 40%  cpt 1.4

A genuine Guard wall in **ordinary content** — not a boss — and untouched by
everything above. It is the cleanest wall-shaped fight left in the game. The
greenhouse roster is full of Guard (Leafy Shell 14, Refract 10, Take Root 9,
Puff Up 8, plus two `onTurnStart` grants), and `swing 5.5` against a healthy
12–16 says the deck is also under-performing, so **get a discriminator before
naming a cause** — this investigation has produced four confident wrong causes
already (route depth, `staticScore`'s energy term, the Matron's phase
thresholds, and my own depth floor).

Everything else past turn 30 is a treadmill the deck is WINNING (`left 0%`,
high `summoned`), which the guard-axis note established as working as designed.

**`engine.js` no longer promises PATIENCE is unreachable** — it records the
measurement. The open decision is: shorten those fights, or decide what the
number should now be. That is a design call, not a comment's job.

---

## OPEN, NAMED, NOT STARTED

- **§29 of the Groundskeeper is not implemented at all** — "At 70 Courage or
  less: Nothing Leaves Unremembered". It would be a third share of
  `AUTHORED_MAX` (21%, so 35 of the 165 he has). Noted in the source. Authoring
  boss content is the enemies owner's call.
- **`scenes/atmostest.js` is registered nowhere**, so the atmosphere bench its
  own header documents cannot be reached. One line in `main.js`; do it as a
  lazy `import()` in the factory so it costs nothing at boot.
- **`tests/dup-keys`'s brace walker misclassifies a function body as an object
  literal** in `clubhouse.js#_wire`. I fixed the symptom precisely (a method
  shorthand must be followed by `{`) and left the scanner bug, because it is a
  heuristic parser I would have to re-prove.
- **Card art**: marmalade, mopsy, boggle, taffy have sheets (358 of 359 Tricks).
  The twelve other Companions render procedural art, which is the designed
  fallback.
- **`art/` composites are ~110 MB and untracked.** The LFS sprite sheets ARE
  pushed now (273 MB, inside GitHub's free 1 GB, but a quarter of it spent).

---

## TRAPS THIS SESSION HIT. They are written down so they cost nobody another one.

- **CONTRACTS trap 1, for the THIRD time.** A backtick inside an HTML comment
  inside a template literal in `map.js` killed the whole app with a syntax error
  reported hundreds of lines away. Do not put backticks in comments inside
  template literals.
- **Line endings are per file and mixed. Check, never assume.** CRLF:
  `run.js`, `map.js`, `combat.js`, `select.js`, `main.js`, `engine.js`,
  `lib/bot.js`, `dup-keys/check.py`, `HANDOFF.md`. LF: `mapgen.js`,
  `clubhouse.js`, `title.js`, `atlas.js`, `seams/check.py`, `lib/expedition.js`.
  Scripted edits flip them and blow up the diff. Write yourself a patcher that
  counts the terminators before and after and REFUSES on a mismatch; mine lived
  in the scratchpad and caught three near-misses.
- **Anything pinned inside `.at-plate` is magnified by the atlas zoom.** Labels,
  the ruled box and the vote pins divide by `--k`, which `_layout()` publishes.
  A 13px label at 4.6× is a 60px banner across the plan.
- **`ui/hand.js` keeps a hidden `.mm-card` measuring probe** parked far
  off-screen. Unioning bare `.mm-card` produced a spotlight 101,059 px wide.
  The hand is `.mm-hand__cards .mm-card`.
- **`.cb-handhost` and `.mm-hand` are both `inset: 0`** over the whole board, so
  a ring on either is a ring round the screen.
- **CONTRACTS trap 9** bit the coach: `turn:end` fires for every enemy too.
- **`phaseAt(c, at, max)`'s third argument must be the AUTHORED max**, not the
  shipped one. Cutting a boss's Courage and reusing the same constant moved two
  bosses' phase gates — one of them above its own pool.
- **Two Playwright runs overlapping wedge the machine** (CONTRACTS trap 7 in a
  new form): a 200-run measurement sat at 0.5 s of CPU for 20 minutes with 23
  stray chromium processes alive. Kill strays between long runs.

---

## GATES — all green except the one above

    38 × tests/*/check.py            all green (sweep them: they all print RESULT:)
    tests/run/index.html             50 runs, 1 error (_losePatience, above)
    tests/coop/run.py                645 passed
    tests/vote/run.py                35 passed
    tests/cards/run.py               1470 cards, 0 errors
    tests/backpack/index.html        72 checks, 0 failures
    tests/combat-scene/seam.py       22 passed
    tests/sprites/{check,clips}.py   22 clips / 24 stills / 28 passed
    tests/critic-design/anchor.py    5/5 agree

Browser-page suites (`tests/run`, `tests/backpack`) have no runner; load them in
Playwright and read `RESULT:` off `document.body.innerText`.

**Run the whole `check.py` sweep before starting anything.** Doing that is how
this session found the two bosses and the three broken gates — I had been
running the six gates I was touching.
