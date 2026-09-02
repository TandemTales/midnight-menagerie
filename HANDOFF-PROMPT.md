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
ever see is touched by this." **Nothing checked that.** Across 559 real fights
in fifty seeded expeditions:

    longest fight        57 turns   graveyard/boss
    past 24 turns        13
    past 30 turns         5   <- _losePatience fired, in ordinary play

All ten of the longest are BOSSES and six of the eight were LOST. The
termination guarantee is doing the killing.

**AND MOST OF IT IS THE BOT, NOT THE GAME. Read this before you retune
anything.** In the 57-turn attic-observatory fight the bot held `nerve 3`,
`hand 5` and `legal 4.3` — four playable cards every turn — and played 0.2 a
turn. The same companion in the fight it WON: identical Nerve, hand and legal
count, `cpt 2.4`. Nothing was denied; it passed.

Controlled A/B, one variable: play only that boss with `naiveTurn` and leave
everything upstream to the competent bot, so the same deck meets the same
board. Seed 379133, bones:

    competent   57 turns, 95% of the board alive, LOST, run ends there
    naive       under 30 turns, and the run continues to hedge-maze wing 4

With that boss naive the new longest is hedge-maze at 63 turns — `cpt 0.6`,
`legal 4.4`, same signature. The pathology follows the bot, not the boss.

**FOUND AND FIXED.** `residual()` paid `34 * kills` and NOTHING for damage that
does not drop a body, and the projection's only other route for damage —
`turnsLeft = (pool.hp + block*0.6) / dps` — is capped at 28, so against a boss
whose pool exceeds ~28*dps that cap is SATURATED and chipping it moves no term
either. Both channels dead at once, and only for big-pool bosses, which is why
all ten longest fights are bosses. The bot was not malfunctioning: it correctly
computed that attacking a boss was worth zero and held its hand.

One term, `+0.15` per point of damage:

    fights reached  491 -> 559      past 30            8 -> 5
    past 24          14 -> 13       board >40% alive   5 -> 1
    victories         3 -> 4        foyer defeats     32 -> 28

It plays better AND survives better, which is why this one is not confounded.
All integrity checks still pass; `anchor.py` still agrees 5/5.

**The gate still exits 1**: five fights past 30, longest 57. Exactly one ends
with the board over 40% alive — and it is the GREENHOUSE at 50% with
`summoned 212`, which is the Head Gardener treadmill this repo already
established as working as designed. **So after the fix there is no
Guard-stall-shaped fight left in the sample at all.** What remains is one
grind, two long fights the deck WON, and two treadmills.

**What that invalidates, measured rather than assumed.** Three tiers re-run at
the same config and seed. The degeneracy needs `turnsLeft` to SATURATE at its
28 cap, so it must scale with the Courage pool and vanish on small ones:

    standard   small pool   win 99% -> 99%    turns  6.6 -> 6.4   (-0.2)
    elite      pool 205     win 79% -> 83%    turns 14.8 -> 14.2  (-0.6)
    boss       large pool   win 26% -> 30%    turns 25.7 -> 23.9  (-1.8)

That gradient was predicted by the mechanism and not fitted to it, which is
better evidence than the fix working — a wrong cause produces that too.

So: **re-measure BOSS and ELITE baselines before tuning against them; the
ordinary-content tables stand.** `ladder-*-dmgterm.json` are the new ones, kept
beside the originals. Party sweeps and the Butler curve are boss-tier and have
NOT been re-run.

**One content finding survived every re-measurement:** `hedge-maze` ELITE wins
19% at 108% of the Courage pool — the only tier row in the game that costs more
than the pool it fights, and the bot fix barely moved it.

━━ AND IT IS FIVE MECHANISMS, NOT ONE ━━

The ledger prints `wing`, `left`, `wall`, `land`, `swing`, `abs`, `cpt`,
`summoned` and `pierce` now, and they separate things `turns` cannot:

    turns  who      region        left  wall  land  swing  abs   cpt  summoned
      57   bones    graveyard      27%   3.2   6.4    7.5   14%  1.3      107   grind
      45   mossbit  lampworks       0%   3.6  11.6   14.6   21%  1.9       78   won
      40   bones    greenhouse     50%   2.2   9.5   10.7   11%  1.8      212   treadmill
      40   mossbit  hedge-maze     30%   4.4  14.3   16.0   10%  2.4      272   treadmill
      36   pudding  graveyard       0%   3.4  12.3   14.4   15%  1.9      111   won

`cpt` is 1.3-2.4 across all of them now. Before the bot fix the same table's
top two rows were `cpt 0.2` / `abs 0%` and `cpt 1.0` / `swing 0.4` — the deck
standing still. Those two fights no longer exist.

**Read `abs` before `wall`.** A high `wall` beside a low `land` looks like a
board out-raising a deck, and for the two worst fights in the game it is not:
`abs 0%` means the board absorbed NOTHING, because the deck put out 0.3 a turn.
An earlier version of this document called the attic-observatory row "the purest
GUARD STALL in the game" on `wall > land` alone. It was never a Guard stall.

    stuck loop    cpt near 0                  the deck never acts
    inert deck    cpt normal, swing near 0    it acts and cannot hurt anything
    guard stall   abs high, swing > 0         the board really is eating it
    treadmill     summoned high               it gets through; more keeps arriving
    grind         left near 0                 a long fight the deck is winning

Healthy fights run `cpt` 1.5-2.6. `bones` lands 15.3 a turn in kitchens-cellars
and 0.3 against the Watcher, so neither top row is "the bot cannot play bones".
**The two longest fights in the game are the first two kinds, and no Courage
pool cut, route change, wall cap or piercing card reaches either.** Cause is
NOT established - `web()` takes `cap = 4`, so the Watcher inflating card costs
cannot price out a deck on its own. Start with `trace` on the seed.

The genuinely wall-shaped row is pudding/study-library - `wall 7.0`, `abs 28%` -
and that deck got through to 6% left.

━━ CAN ANYONE ANSWER A GUARD WALL? 2% OF FIGHTS ━━

`pierce` counts cards in the deck whose TEXT ignores Guard. **11 of 491 fights
(2%) held one.** `marmalade` 11/41 (27%) is the only nonzero row in the whole
roster; `hush` holds two of the game's four piercing cards and drew neither in
17 fights, because both are RARE. `rescueCompanion()` adds clues and Courage but
NO CARDS, so a run's answer to Guard is fixed at companion select and cannot
change afterwards.

StS2's answer to enemy Block is not a cap. It flattens Block's GROWTH - co-op
Block was deliberately decoupled from the HP curve to a flat x2 while every
other defensive buff kept a rising curve - and answers it with channels that
never touch Block at all: Poison and Doom. We have `dread` in
`combat/statuses.js` at exact StS-poison parity (`ignoreBlock`, stacks, ticks
at turn start) with an icon drawn for it, no tooltip, no `docs/design/` entry,
and NOTHING anywhere that applies it.

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

**And then I did it again, one layer down.** "The four longest ended with the
boss 64-69% ALIVE, which is the Guard reading" is the same move: a number that
FITS the Guard story, named as the Guard story, without the one field that
could refute it. `abs` refuted it - the board absorbed 0% of those fights,
because the deck put out 0.3 a turn. Two sessions, two confident causes, both
wrong, both from a metric that could not tell the difference.

**Measure the cause before you name it, even when the story is good — and
especially when you have just been burned for naming one.**

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
  python tests/teaching/check.py     7
  python tests/design-courage/check.py  120 checked, 0 failures   ← NEW
  python tests/critic-design/ladder.py  17 regions, 0 errors   ← NEW
  python tests/critic-design/anchor.py  5/5 agree
  python tools/deadflags.py [--reads]   audit, not a gate      ← NEW

  REGION GATES, the ones touched today:
    foyer 66 · nursery 71 (re-run after the Courage fix) · sleeping-quarters 62 · kitchens 20 ·
    greenhouse 37 · attic-observatory 53 · heart 44
    (the other ten were not re-run this session)

━━ THE NURSERY WAS 44% HEAVIER THAN ITS OWN CHAPTER ━━

Chasing "the Governess is a difficulty regression" found she was never the
problem — she costs 63% of the player's pool, and the Butler costs 61%. The
player was ARRIVING at her door on 62% Courage, the lowest in the game.

Every one of the nine Nursery enemies shipped above its authored Courage, a
uniform ~1.44x on normals and ~1.19x on Big Scares. Regions 1 and 3 match their
chapters byte for byte; the Nursery was the only region in the game that did
not, and nothing justified it. The Patchwork Giant's own code gives the game
away — it scales its 90/60/30 Patch tears by `maxHp / 126`, the chapter value,
so at 150 the tears silently drifted to 107/71/36.

    standard ladder   nursery 39% -> 21% of pool, rank 1 -> 5 of 17
    elite ladder      82% -> 68%, win 69% -> 75%
    boss door         arrives at 62% -> 83%, margin 9pp -> 19pp
    Governess bench   solo 12.5% -> 25.0%, 4p 93.8% -> 100% at fallen 0.00

No other region moved by more than 2pp at either tier. `tests/design-courage/
check.py` now gates the class: 120 enemies checked against their chapters, 3
declared divergences (House Bell, Butler, Governess — bosses are tuned against
measurement and their chapters are opening bids), 0 failures.

**The ladder had been reporting this since August** — nursery 39% against a 15%
median, rank 1 of 17 — and it was read as a boss problem every time. The number
was never wrong; nobody asked which room it was pointing at.
  GATES THAT MUST STAY AT ZERO:
    seams 7892 sites / 0 · hook-names 201 declared / 0 unknown ·
    bus-names 0 dead · status-names 22 / 0 · part-lookups 0 ·
    party-tells 0 · events 8 · achievements 10 · boss-haunt 6

  map 30 · wings 44 · backpack 80 · haunt 21 · gameover-keeps 16 ·
  governess 56 · butler 38

━━ WHAT IS OPEN ━━

1. **THE OVER-30 GATE.** Top of this document. NOT one defect, NOT a Guard
   problem, and mostly NOT a game defect: a controlled A/B shows the longest
   fight in the game is `competentTurn` passing with four legal cards in hand.
   Fix the bot's stop decision, or stop reading over-30 as a statement about
   bosses. `bench()` in critic-design/lib/expedition.js runs the repeat trial.
2. **NO APPLICATION EXISTS.** No `package.json`, no Electron, no Tauri. The game
   is a folder of ES modules served by `tools/devserver.py`. `platform/index.js`
   specifies the host bridge carefully and `tests/platform/run.py` exercises all
   of it — against `installFakeHost()`. **There is nothing to put in a depot.**
   **NO LONGER BLOCKED ON THE TOOLCHAIN (2026-09-02).** `winget install
   OpenJS.NodeJS.LTS` has been run: **node v24.19.0, npm 11.17.0**, at
   `C:\Program Files
odejs\`. A shell started before the install will not
   have it on PATH — call it by full path or restart the host.
   Still no cargo/rustc, so ELECTRON is available today and TAURI would need
   `winget install Rustlang.Rustup` first. That choice is unmade and it is the
   next real decision: it sets bundle size, the Steam overlay path, and how
   `platform/index.js`'s host bridge gets implemented for real instead of
   against `installFakeHost()`.
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
