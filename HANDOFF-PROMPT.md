Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ START HERE, 2026-09-01 ━━ THE BATTERY IS RED ON PURPOSE ━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`python tests/run/run.py` EXITS 1. You did not break it. It is a real defect,
found by a gate added yesterday, and it is the one open thing in the game layer.

`combat/engine.js`'s `_losePatience` escalates every enemy past turn 30 so a
fight cannot fail to end, and its comment claims it is "far outside reachable
play … the longest fight any region gate produces is 24. Nothing a player will
ever see is touched by this." **Nothing checked that.** Across 535 real fights
in fifty seeded expeditions:

    longest fight        87 turns   graveyard/boss
    past 24 turns        13
    past 30 turns         9   <- _losePatience fired, in ordinary play

All ten of the longest are BOSSES and eight of the nine were LOST. The
termination guarantee is doing the killing.

━━ AND IT IS THREE DEFECTS, NOT ONE ━━

The run ledger prints `wing`, `left`, `wall`, `land` and `summoned` now, and
they separate three things the `turns` column cannot:

    turns  wing  region             left  wall  land  summoned
      87     3   graveyard           64%   3.2   2.2      72   GUARD STALL
      54     3   attic-observatory   66%   3.1   2.5       0   GUARD STALL
      37     3   study-library       33%   6.0   6.6       0   GUARD STALL
      56     2   greenhouse          68%   2.1   7.5     314   TREADMILL
      55     2   greenhouse          69%   2.4   5.5     201   TREADMILL
      52     3   greenhouse           0%   2.6  13.2     346   TREADMILL (won)
      44     2   greenhouse          33%   2.7   9.9     210   TREADMILL
      69     4   graveyard           27%   3.1   5.8     142   GRIND
      55     2   lampworks           21%   1.4   9.5     122   GRIND

A **STALL** is `wall` at or above `land` with nothing summoned — the board
re-raises Guard faster than the deck gets through, so the Courage bar cannot
move. `engine.js` ~2918 already diagnosed this with numbers before anyone
measured it: Guard is wiped and re-granted every turn, so what the player must
beat is Guard PER TURN, and the Groundskeeper "sat at 203 of 350 Courage for the
last hundred and forty" turns. The graveyard boss IS the Groundskeeper.

A **TREADMILL** is the opposite reading and identical in `turns`: the greenhouse
boss lands 7.5 a turn for 56 turns — 420 damage into a 464 board — and still
faces 68% of it, because the Head Gardener keeps planting. That one is WORKING
AS DESIGNED (three Beds, `sow` becomes `water` when they are full).

A **GRIND** is just a long fight the deck is winning slowly.

**A Courage pool cut reaches only the grinds.** Anything that moves Courage —
scaling pools by route position, constraining the route, re-authoring seventeen
pools — cannot move a bar the deck cannot dent, and the four worst fights are
exactly that.

**The remaining lever is Guard-per-turn against deck output at depth. That is a
DESIGN call and it is the one thing this session deliberately did not take.**

━━ HOW THAT WAS FOUND, WHICH MATTERS MORE THAN THE FINDING ━━

I got it wrong first, and expensively, so do not repeat it.

I blamed the ROUTE: boss pools scale 137 → 695 and are authored against LADDER
position, and `EXPEDITION_WINGS = 6` (2026-08-31) draws route position apart
from it, so a 464-Courage wing-five boss can appear at wing two. It is a tidy
story, it fits, and **I committed it into a failure message and both handoffs
without measuring it** — onto a ledger that did not even record the route slot,
so nothing in the repo could have joined the claim to the data. That is the
CONTRACTS 47 shape, written by someone who had spent the day citing CONTRACTS 47.

Two ledger fields refuted it. The route claim predicted at least seven of the
nine over-30 fights at wing two; **there are four**, and the 87-turn worst case
is wing THREE. Meanwhile the four longest ended with the boss 64–69% ALIVE,
which is the Guard reading, and the diagnosis was already sitting three lines
above the mechanism I was instrumenting.

**Measure the cause before you name it, even when the story is good.**

━━ THE INSTRUMENTS, AND WHAT EACH ONE CAN SEE ━━

`tests/run/run.py` — 50 seeded expeditions, competent bot, real drafting, ~75s.
Seven tables now. Cost per fight BY REGION; what each ROOM KIND hands over; the
first wing BY DEPTH; what the player brings to each BOSS DOOR; which TIER the
fights came from; which authored formations a run NEVER rolls; and what the
first wing actually TEACHES. **`hpBefore` sat on that ledger unprinted for two
sessions** — it is the whole difference between "the boss costs too much" and
"the player arrives broke".

`tests/critic-design/ladder.py` — NEW. Prices content against a player held
CONSTANT: one wing-one loadout through every region at full Courage. This is the
control the cost ledger never had, because that one prices a wing against the
player who actually reaches it and cannot separate "this wing is gentle" from
"the player who gets here is strong". Flags: `--tier standard|elite|boss`,
`--benchhaunt N` (separate from `--haunt`, which also hardens the expeditions
that GENERATE the constant player and so un-constants it), `--hpscale N`.

  Its headline: **a wing-one deck wins every ordinary fight in fifteen of the
  seventeen regions.** Region 15 is the easiest content in the game, region 16
  is exactly region 1, and the FINAL region's Big Scares are easier than the
  Foyer's. The mansion is not a ladder. Only the boss tier climbs, 137 → 695.

`tools/deadflags.py` — NEW. Sweeps content for state that is written and never
read (`--reads` for the opposite, more expensive shape). An AUDIT, not a gate.

`tests/teaching/check.py` — NEW, 7 checks. The tooltip registry IS the tutorial
(see below) and nothing protected it.

`tests/enemies/audit.py` — the only thing that finds a lying intent. Runs at
HAUNT 0, which is why it cannot see a Haunt bug of any kind.

━━ WHAT MOVED THIS SESSION ━━

**THE FOYER QUESTION IS ANSWERED AND IT WAS NEITHER OPTION.** The previous
handoff asked whether the twelve early Foyer deaths were the CONTENT or the
opening DECK. Winners and losers arrive at the Butler's door with the SAME DECK
— 14.2 cards against 14.6 — and different Courage, 95% of pool against 76%. It
is ATTRITION. And the ceiling is arithmetic: margin (arrival minus price)
predicts the boss loss rate across every wing, and arrival cannot exceed 100%,
so while the Butler costs 64% of the pool the Foyer's margin can never exceed
+36pp however well it is played.

**THE ADVANCED POOL WAS ONE ROW DEEP.** `tierFor` asked for `advanced` only on
row `rows - 2`, which is the boss's DOOR row — 26% Safe Room, 11% Scuffle — so
**102 authored formations, the largest tier in the game, were drawn from 1.7% of
the time.** Now the last four walkable rows: 10 fights → 96, every Foyer
formation rolls, and it cost nothing (defeats 28 → 28). It had a rule dead
underneath it: `minScuffle: { 'red-carpet-runner': 2 }` implemented §10
correctly and could never bind because the tier gate was stricter everywhere.

**THE ROLLER COVERS ITS ROSTER.** §10 says outright "the procedural system
should not treat all formations equally" and §33 states the teaching as an
OUTCOME. One soft rule: prefer a formation carrying a body this run has not met.
Coverage 3.2 → 4.3 of six teachers, **eight runs in forty now meet the whole
roster where none ever had**, and it is CHEAPER (24.7% → 23.2% of pool).

**THE BUTLER'S POOL WENT 149 → 134, AND IT IS A WASH.** Asked for; measured;
recorded honestly as +4.2 points at the boss and no difference across whole
runs. The lesson is the `--scales` trap: `scaleHp` multiplies maxHp at fight
time and leaves `BASE_HP` alone, so `phaseAt` drags the phase-two threshold down
with it and a `x0.9` row measures a Butler whose DANGEROUS half was also cut.
**Never quote a `--scales` row as a forecast of a pool edit on a phased boss.**

**A THIRD OF THE HAUNT LADDER IS ABOVE THE CEILING.** 129 of 366 authored Haunt
behaviours are gated at levels 6–10; `MAX_HAUNT` is 5. Sixty sit at Haunt 9
alone, across sixteen regions, each with its player-facing sentence already
written. `_lib.js` line 318 records the audit that set the shape — dated
2026-08-20, when THREE regions shipped. Fourteen more arrived and nobody
re-counted. The good half: Haunt DOES reach ordinary enemies, measured for the
first time (+15% enemy Courage at Haunt 5, cost up in 16 of 17 regions).

**FIVE MORE DEAD SEAMS, PLUS TWO FOUND AND DELIBERATELY NOT FIXED.** See below.

━━ THE TUTORIAL, BECAUSE IT WILL BE ASKED AGAIN ━━

**There is no tutorial and the design does not want one.** Three files say so
consistently: `01-foyer.md` §33 ("primarily through combat rather than pop up
tutorials"), `kids/03-amina-mochi.md` ("without requiring a tutorial lecture"),
`01-mansion-structure.md` (the Foyer IS the tutorial region). There is no
tutorial spec anywhere in `docs/design/`. That is a position, not an omission.

So all the teaching happens where the player meets the thing, and the tooltip
registry is the tutorial. Measured: **498 keywords with 0 blank and 0 stubs, 362
statuses with 0 missing an entry, 1470 cards with 0 unresolved bracketed
terms.** The vocabulary teaching is COMPLETE.

`tests/teaching/check.py` gates it, because it has already rotted once —
`keywords.js` records that its loader imported `enemies/_lib.js` (core statuses
only) instead of `enemies/index.js`, so every status added after the Foyer had
no tooltip and the count sat at 268 "through two whole regions of new ones".
Nothing failed; a number stopped moving. The gate asserts the COUNTS as well as
the gaps for that reason.

**Still open:** first-run ORIENTATION — what Nerve is, how a turn ends, what a
Curiosity or Safe Room does. `seenTutorials` sits in the save schema written and
read by nothing. Choosing between "leave it, the Foyer teaches it" and "build
something that is not a lecture" is a design call.

━━ TWENTY-TWO DEAD SEAMS. THE LAST FIVE WERE FIXED, TWO WERE NOT ━━

A seam is dead when it is written, documented, and read by nothing.

| what was dead | found by |
|---|---|
| the `advanced` tier — 102 formations at 1.7% of fights | the tier census |
| `minScuffle: { 'red-carpet-runner': 2 }` — §10, unable to bind | the same census |
| 129 of 366 Haunt hooks, gated above `MAX_HAUNT = 5` | counting `level >= N` |
| the Watcher's Grounded — "cannot gain Guard until it climbs back", printed and unenforced | reading the rule against its code |
| the Topiary Beast's Leafy Shell — §7's "+4 to its next attack", plus a Haunt-8 `shellBonus` with no consumer | `tools/deadflags.py` |
| the Oven Maw's Preheat — §12's "the next baked enemy emerges one turn earlier", discounting a bake that had already finished | `tools/deadflags.py` |
| the Patchwork Giant's three NAMED Patches, reaching the player as a bare counter | `tools/deadflags.py` |

**FOUND AND DELIBERATELY NOT FIXED — the Bedframe Beast.** §21: "While
Underneath: **Attack Tricks cannot target the Beast.**" The def has no
`isTargetable` at all. §23's trigger reads `c.self.indirectDamageThisTurn`, a
field that appears EXACTLY ONCE in this repository — that read — and is assigned
nowhere. They are ONE defect: with the Beast targetable, "indirect damage" is
not a distinction the engine can make. Wired and measured: **past-24 13 → 15,
past-30 9 → 11**, because the Beast is solo and §21 makes it untargetable three
turns in five against a 297-Courage pool. Reverted. It moves the open defect the
wrong way, exactly as the Wardrobe note warns about wiring `isTargetable`.

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Everything below was
RUN on 2026-09-01 against this tree.

  python tests/run/run.py            50 runs, **1 ERROR — ON PURPOSE**, see top
  python tests/cards/run.py          1470 cards, 0 errors, 0 warnings
  python tests/enemies/run.py        275 enemies, 0 errors
  python tests/enemies/audit.py      19819 turns, 0 errors
  python tests/coop/run.py           645
  python tests/combat/run.py         694
  python tests/teaching/check.py     7            ← NEW
  python tests/critic-design/ladder.py  17 regions, 0 errors   ← NEW
  python tests/critic-design/anchor.py  5/5 agree
  python tools/deadflags.py [--reads]   audit, not a gate      ← NEW

  REGION GATES, the ones touched today:
    foyer 66 · nursery 71 · sleeping-quarters 62 · kitchens 20 ·
    greenhouse 37 · attic-observatory 53 · heart 44
    (the other ten were not re-run this session)

  GATES THAT MUST STAY AT ZERO:
    seams 7892 sites / 0 · hook-names 201 declared / 0 unknown ·
    bus-names 0 dead · status-names 22 / 0 · part-lookups 0 ·
    party-tells 0 · events 8 · achievements 10 · boss-haunt 6

  map 30 · wings 44 · backpack 80 · haunt 21 · gameover-keeps 16 ·
  governess 56 · butler 38

━━ WHAT IS OPEN ━━

1. **THE OVER-30 GATE.** Top of this document. The only open defect in the game
   layer, and its fix is a design call on the Guard axis.
2. **NO APPLICATION EXISTS.** No `package.json`, no Electron, no Tauri. The game
   is a folder of ES modules served by `tools/devserver.py`. `platform/index.js`
   specifies the host bridge carefully and `tests/platform/run.py` exercises all
   of it — against `installFakeHost()`. **There is nothing to put in a depot.**
   Blocked on a toolchain: this machine has no node, npm, cargo or rustc.
   `winget install OpenJS.NodeJS.LTS` unblocks it and is Josh's to run.
3. **STEAM APP ID.** Josh only. Gates achievements, Cloud, the controller
   layout, P2P and Deck Verified.
4. **ART.** 1470 cards with zero illustrations (`ui/cardart.js` generates them
   from the card id); 189 silhouette keys, 12 with a prop layer, 177 unlayered.
   This is the schedule, and it needs a person.
5. **THE MANSION IS NOT A LADDER.** Per-region list in
   `docs/notes/2026-09-01-the-mansion-is-not-a-ladder.md`: hedge-maze elite at
   110% of pool and 12.5% win, kennels elite at 489 Courage over 32 turns,
   secret-passages and heart elites at 19% and 24%.
6. **THE HAUNT CEILING.** Raise `MAX_HAUNT` (129 behaviours become reachable and
   `data/haunts.js` must name the new rungs) or re-tier 6–10 down.
7. **THE RELIC ECONOMY.** A run holds 23–32 of the game's 58 Keepsakes by the
   fifth wing.
8. **THE TEACHING CONTRACT.** 4.3 of six after the roller fix; a run fights ~4.7
   times in the Foyer against six teachers.
9. **`spreadOf` unmeasured for nine regions · the entry stall (274 ms of
   `toDataURL`, fix scoped) · `combat:crit` known-silent · the ~100 remaining
   sweep findings.**

━━ THINGS THAT WILL COST YOU A ROUND ━━

**AN INTENT MAY NEVER LIE.** Moves and intents are chosen at PLAYER-TURN START
and held. A meter the player's damage moves, settled in `onPlayerTurnEnd`, is
the single most expensive mistake in this codebase — that hook fires after the
intent was drawn. Settle at `onPlayerTurnStart`. And use
`damageFn`/`blockFn`/`hitsFn` reading a COUNTER for anything that scales:
**writing a counter calls `refreshIntents`, writing `mem` does not**, which is
half of why the Topiary Beast's shell bonus could hide.

**LINE ENDINGS ARE MIXED PER FILE, AND THEY VARY INSIDE ONE DIRECTORY.**
`enemies/greenhouse.js` and `enemies/kitchens-cellars.js` are LF;
`enemies/nursery.js` is CRLF. A patch script authored with `\n` matched ZERO
anchors there. Make every patch script ENDING-AWARE: read the bytes, set
`EOL = "\r\n" if raw.count(b"\r\n") else "\n"`, translate each pattern, and
assert every anchor matches exactly once BEFORE writing anything.

**`grep -c $'\r$'` DOES NOT WORK IN THE BASH TOOL.** The escape is eaten, the
pattern collapses to `$`, and it matches EVERY line — so every file reads as
100% CRLF. Count bytes instead. The tell: every file reporting crlf == total.

**`pathlib.write_text()` WITHOUT `newline=""` CONVERTS LF TO CRLF ON WINDOWS.**
That flipped `tools/deadflags.py` whole-file this session.

**`git diff --stat` vs `git diff --ignore-cr-at-eol --stat` HAS A HOLE.** It
catches a script that CONVERTS lines. It does NOT catch one that INSERTS lines
with the wrong ending — both forms count the same added lines and agree while
the file quietly goes MIXED. Count bytes after any scripted insert.

**HEREDOCS IN THE BASH TOOL EAT BACKSLASHES.** Use the Write tool for patch
scripts and run them with `python <path>`. I violated this three times today and
paid for it three times.

**A GATE THAT CANNOT FAIL IS A STORY.** Every fix this session ships with its
gate and a demonstration that removing the fix turns it red (CONTRACTS 54). Two
of those gates were worthless on their first draft — one read `w.intent` without
refreshing and reported a stale number; one called `e.ctxFor`, which does not
exist, so it compared two empty runs. `e.enemyCtx(actor, null)` is the real one.

━━ NOT THE JOB ━━

- Do not tune the Foyer, the Butler or the Foyer elites by feel — all three have
  committed before/afters in `tests/critic-design/`.
- Do not quote `sweep.py --scales` as a forecast for a pool edit on a phased boss.
- Do not change `PARTY_HP_SCALE`.
- Do not wire the Bedframe Beast's `isTargetable` without the pacing work — it
  is measured and it makes the open defect worse.
- Do not build a pop-up tutorial. The design rejects it in three places.
- Do not start Steam P2P until Josh has an App ID.
- Do not chase fps on this machine; do not re-open the card-art encoder question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read `HANDOFF.md` next ("Where it stands"), then `CONTRACTS.md` at 60 traps.
Then, for this session's working:

  docs/notes/2026-08-31-the-foyer-is-attrition-not-the-boss.md
  docs/notes/2026-08-31-the-advanced-pool-was-one-row-deep.md
  docs/notes/2026-09-01-the-mansion-is-not-a-ladder.md
  docs/notes/2026-09-01-the-guard-axis.md
  docs/notes/2026-09-01-a-third-of-the-haunt-ladder-is-above-the-ceiling.md
  docs/notes/2026-09-01-the-write-only-flag-sweep.md

STATE: branch `dev`, committed and pushed. Do not trust a hash written here; run
`git rev-list --count origin/dev..dev`. Pushing to origin/dev is authorised.

Dev server, and it does not survive a restart:

  python tools/devserver.py 8777

Start by telling me what you'd do first and why.
