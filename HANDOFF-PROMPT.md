Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ START HERE, 2026-09-04 ━━ ONE GATE IS RED AND IT IS SUPPOSED TO BE ━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`python tests/run/run.py` EXITS 1. You did not break it. Every other gate in
the battery is green.

`combat/engine.js`'s `_losePatience` escalates every enemy past turn 30 so a
fight cannot fail to end, and its comment claims that is "far outside reachable
play". It is not:

    2026-09-04, 400 expeditions, 5687 fights
      longest fight      65 turns   bathhouse/boss
      past 24 turns      69         1.21%
      past 30 turns      32         0.56%

**READ IT AS A RATE.** `--runs` exists now; a measurement pass is ~5700 fights
where the shipping default is ~560. "Past-30 went from 5 to 32" is ten times the
sample, not ten times the defect. Before deciding it is a defect at all, know
that some of it is bought deliberately: making the last four wings survive a
player who deals ~90 a turn costs fight LENGTH, and length is what this gate
measures.

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Everything below was
run on 2026-09-04 against this tree.

  python tests/run/run.py                   50 runs, **1 ERROR — ON PURPOSE**
  python tests/run/run.py --runs 400        the measurement pass, ~13 min
  python tests/cards/run.py                 1470 cards, 0 errors, 0 warnings
  python tests/enemies/run.py               275 enemies, 0 errors
  python tests/enemies/audit.py             19574 turns, 0 errors
  python tests/combat/run.py                694 passed, 0 failed
  python tests/coop/run.py                  645
  python tests/teaching/check.py            7
  python tests/design-courage/check.py      129 checked, 0 failures      ← NEW
  python tests/design-damage/check.py       118 compared, 0 failures     ← NEW
  python tests/phase-thresholds/check.py    17 boss files, 0 failures    ← NEW
  python tests/critic-design/ladder.py      17 regions, 0 errors
  python tests/critic-design/anchor.py      5/5 agree

  REGION GATES touched recently: foyer 66 · nursery 71 · sleeping-quarters 62
  (the other fourteen were not re-run)

━━ NODE IS INSTALLED, AND THE DATA LAYER LOADS HEADLESSLY ━━

node v24.19.0 at `C:/Program Files/nodejs/`. A shell started before the install
does not have it on PATH - call it by full path or restart the host.

**`data/schema.js` and `data/cards.js` import cleanly under node**, which means
any question about content is a one-liner instead of a Playwright page:

    node -e "import('./game/src/data/cards.js').then(m=>console.log(m.allCards().length))"

`allCards()` returns every Trick with `id, name, companion, type, rarity, cost,
text, nums, upgrade`; resolve the `{d}` placeholders from `nums` yourself.
`companions()`, `companionSlugs()`, `KIDS`, `TERMS`, `REGION_ORDER` are all
there too. `state/run.js` is headless by design and loads as well - that is how
`expeditionRoute` was measured over 4000 seeds in seconds.

**What does NOT load**: anything reaching `combat/` through an absolute
`/game/src/...` path, `lib/bot.js` among them. Those need the dev server.

A full card reference built this way is published at
claude.ai/code/artifact/fa284580-04fb-4b56-81ff-8ab221020455 - all 1470 Tricks
with numbers resolved, searchable, grouped by Companion. Regenerate rather than
hand-edit it.
━━ THE THREE NEW GATES, AND WHY THEY EXIST ━━

All three read the DESIGN CHAPTER as the authority and the implementation as the
thing under test. That direction matters: the opposite is fitting the doc to the
code afterwards, which proves nothing.

**`design-courage`** — every enemy's Courage against its chapter. Exists because
the Nursery shipped all nine of its enemies ~1.44x over their authored pools and
nothing said so; the region read as the most expensive content in the game and
it was blamed on its BOSS for two sessions. Divergence is allowed and must be
DECLARED in `ALLOWED` with its measurement (currently: House Bell, Butler,
Governess, Groundskeeper, Archivist).

**`design-damage`** — the same for move damage. The Nursery's damage was
inflated by the same hand and the same factor. Matching is on **(region, name)**,
never name alone: two moves are called "Lid Slam". Per-stack moves are skipped
and COUNTED OUT LOUD — "Open the Lantern" reads chapter 8 against impl 40 and
both are right, because the chapter says "8 damage PER CHARGE".

**`phase-thresholds`** — no boss may compare `hp` to a raw number. Five did.
They are shares of an authored pool written as absolutes, so any multiplier
moves how much of the fight each phase covers — and `PARTY_HP_SCALE` is **x5.7
at four Kids**, which put the Kennelmaster's phase two at 1425 damage and the
Harvest King's phase three at 542. Those fights were broken in co-op since they
were built. Use `phaseAt(c, N, BASE_HP)`.

━━ WHERE THE BALANCE IS ━━

The number that predicts a boss loss rate is **MARGIN** — arrival minus price,
in points of the Courage pool. See
`docs/notes/2026-08-31-the-foyer-is-attrition-not-the-boss.md`. n=400:

    region              cost   margin   lost      was
    foyer                45%    36pp    82/279    61% / 15pp, ending 44% of runs
    nursery              47%    39pp    22/55     64% / 25pp
    sleeping-quarters    50%    39pp    12/58
    kitchens-cellars     51%    35pp    26/61
    greenhouse           69%    22pp    15/27     <- OPEN
    graveyard            34%    61pp     7/31     77% / 14pp
    study-library        65%    27pp    18/31     <- OPEN
    attic-observatory    49%    46pp     7/25      3% (free)
    lampworks            27%    71pp     2/16      1% (free)
    ballroom             43%    52pp     3/19
    crypt                53%    38pp    10/19
    hedge-maze           51%    36pp     5/11
    secret-passages      42%    55pp     4/17      2% (free)
    bathhouse            37%    49pp     4/12      4% (free), and UNWINNABLE
    kennels              23%    62pp     2/6
    pumpkin-grounds      18%    53pp     0/4
    heart                28%    67pp     5/29      3%, NEVER LOST (0 of 8)

WHAT MOVED, all measured:

  * **The route was not a ladder.** `expeditionRoute` drew 4 of the middle 15
    uniformly and sorted them, so wing 2 spanned regions 2..13 — content priced
    for depth 12 meeting a depth-2 deck. It draws one per BAND now; spread
    11 -> 2-3.
  * **Enemy damage never rose.** 10.9 a move in the Foyer, 9.0 in the Heart,
    slope -0.03 a region: the finale hit SOFTER than the tutorial.
    `depthDamageScale` is the ladder and it took the Heart 3% -> 43%.
  * **The last four wings** carry a per-region Courage AND damage correction
    (`REGION_CONTENT_FIX` in data/schema.js). Courage alone only bought length.
    It is a TABLE not a curve so it deletes in one line.
  * Butler 134 -> 86. Governess damage 22.2 -> 14.6 a move. Groundskeeper
    330 -> 165. Archivist 345 -> 200 and his Corrections capped at 4.

━━ THE PATTERN THAT COST THE MOST TIME ━━

**Three separate bot defects this week each read as a content problem.** Price
the bot before re-authoring a wing.

  1. `residual()` valued damage to a surviving enemy at **zero**, so the beam
     held a full hand against a boss it could not one-shot. Read as "the Guard
     axis is a design call" for two sessions.
  2. The beam passed with **four legal cards in hand** (`nerve 3, hand 5, legal
     4.3, cpt 0.2`). Read as "bosses are overtuned".
  3. `residual()` paid a flat **34 per body killed**, and `enemyPool()` counts
     summon-only parts. The Drowned Matron's Drain has one move — `Intent.SLEEP`,
     `effect() {}` — and she re-summons it: killing it scored 37.75 against 3.75
     for hitting HER for the same damage. She was reported twice at **595/595,
     full health after 200 turns**. Read as "the Bathhouse is broken" AND as
     "the Greenhouse is long by design" — both wrong.

Thirteen summon-only bodies carry no damaging move and nine respawn. The bonus
is paid on THREATS now (`pool.living` is untouched; it is also the win check),
and **a seed counts as a threat** — the first version read only current moves,
so the bot stopped clearing the Greenhouse and it went 63% -> 79%. `def.becomes`
is the field that separates a Drain that sleeps forever from a seed three turns
from blooming.

━━ WHAT IS OPEN ━━

0. **IN FLIGHT, HANDED OVER MID-INVESTIGATION: MARMALADE'S SPRITE SCALE.**
   Josh: "just changed marmalade's original sprite size, resize/reorganize
   animations to match new sprite size." I had gathered facts and written NO
   code. What is established:

     - `animations/sprites/sprite_marmalade.png` is now **256x256**, matching
       every other Companion still (the Kids' are 512x512 - a different class).
       It is UNTRACKED, so git has no before-size to diff against.
     - The twelve `animations/SS_marmalade_*.png` sheets are UNCHANGED
       (3924-5616px, 13-19MB each). The still moved; the sheets did not.
     - `tools/prep_sprites.py` is the whole pipeline and it is careful - read
       its header before touching it. It fits the matte per file, recovers the
       row count by autocorrelation because the grids are 9-wide but ragged
       (attack is 9x8 with 65 frames, not 81), and de-jitters the centre track.
     - **THERE ARE TWO DIFFERENT SCALE TARGETS, and this is the likely crux.**
       Animations use `TARGET_CONTENT_H = 128` with ONE scale per Companion
       (`scale = TARGET_CONTENT_H / median content height across all clips`).
       Stills use `build_still(..., target_h=256)`. So a still renders at
       roughly twice the content height of the animation frames, by design or
       by drift - I did not establish which.
     - Current outputs: `stills/marmalade.webp` is 253x230; the clip frames are
       `fw/fh` 169x132 (affection), 188x169 (attack), 169x142 (caution).

   THE QUESTION I HAD NOT ANSWERED: what "match" means here. Either the
   animations should be re-scaled so the creature matches the new still, or the
   still's `target_h` is what should move. Both are one number in
   prep_sprites.py, and the two targets differing 2:1 is suspicious enough that
   it should be ASKED rather than guessed. `python tools/prep_sprites.py
   --report` measures without writing anything - start there.
1. **THE TWO LONG BOSSES.** study-library 65%/27pp and greenhouse 69%/22pp.
   The Archivist runs 24.3 turns against the Butler's 9.8. FOUR levers on him
   (Courage, damage, Catalogue Guard, the Corrections cap) bought 7pp between
   them. His `swing` is 8.96 against a ~15 median, so the player's OUTPUT is
   suppressed and I eliminated the two mechanics I assumed were doing it —
   Corrections are capped now, and `Misfiled` is explicitly "still performs its
   normal effect". Unchased hypothesis: whether `sl-boss` includes the Paper
   Knight, whose "first Attack Trick that damages it each turn deals 5 less"
   would suppress exactly that. MEASURE IT BEFORE STATING IT.
2. **THE ECONOMY, and it is a design call nobody has taken.** Capping Keepsakes
   at 12 (a finishing run holds ~29 of 58) leaves the first four wings BYTE
   IDENTICAL and moves the late game 10-23pp — the most surgical result in the
   whole investigation. But treasure, boss and Big Scare drops are all sourced
   to STS2-REFERENCE and ~29 sits beside Slay the Spire's own ~25, so a cap is a
   deliberate divergence from our own yardstick.
3. **NO APPLICATION EXISTS.** No `package.json`, no Electron, no Tauri. The game
   is ES modules served by `tools/devserver.py`. `platform/index.js` specifies
   the host bridge and `tests/platform/run.py` exercises all of it — against
   `installFakeHost()`. **NO LONGER BLOCKED ON THE TOOLCHAIN:** node v24.19.0
   and npm 11.17.0 are installed at `C:/Program Files/nodejs/`. Still no
   cargo/rustc, so ELECTRON is available today and TAURI needs
   `winget install Rustlang.Rustup` first. That choice is unmade and it is the
   next real decision.
4. **STEAM APP ID.** Josh only. Gates achievements, Cloud, controller layout,
   P2P, Deck Verified.
5. **ART.** 1470 cards with zero illustrations; 189 silhouette keys, 177
   unlayered. Needs a person.
6. **THE ELITE TIER**, which the balance pass never touched: hedge-maze elite at
   108% of pool, kennels elite at 489 Courage over 32 turns.
7. **THE HAUNT CEILING.** Raise `MAX_HAUNT` (129 behaviours become reachable and
   `data/haunts.js` must name the new rungs) or re-tier 6-10 down.
8. **FIRST-RUN ORIENTATION.** The vocabulary teaching is COMPLETE and gated —
   498 keywords, 362 statuses, 0 gaps — but nothing explains what Nerve is or
   how a turn ends. `seenTutorials` is dead in the save schema. **Do not build a
   pop-up tutorial**; the design rejects it in three places (§33, Amina's
   chapter, the Foyer as tutorial region).
9. **`spreadOf` unmeasured for nine regions · the entry stall (274 ms of
   `toDataURL`) · `combat:crit` known-silent · 11 write-only mem flags from
   tools/deadflags.py, unconfirmed.**

━━ THINGS THAT WILL COST YOU A ROUND ━━

**AN INTENT MAY NEVER LIE.** `damageFn` is what the intent PRINTS and the
`effect` body is what actually lands — they are separate numbers. Changing one
is a boss that advertises 16 and hits for 24. I did exactly that this week and
it took a refusing measurement to notice. `tests/enemies/audit.py` is the gate
that catches it; run THAT after touching enemy damage, not `enemies/run.py`.

Moves and intents are chosen at PLAYER-TURN START and held. A meter settled in
`onPlayerTurnEnd` moves a number the player already committed against. Use
`damageFn`/`blockFn`/`hitsFn` reading a COUNTER: **writing a counter calls
`refreshIntents`, writing `mem` does not**.

**SCOPE EVERY REPLACEMENT TO ITS BLOCK.** `registry-slam` shares
`8 + recognizedBonus(c)` with `i-know-you` verbatim; two secret-passages moves
deal 9; two moves are called "Lid Slam". A global string replace silently hits
the wrong one. Find the `id:` line, then edit the following lines.

**LINE ENDINGS ARE MIXED PER FILE AND VARY INSIDE ONE DIRECTORY.**
`enemies/nursery.js` is CRLF; `enemies/heart.js` and `enemies/greenhouse.js` are
LF; `tests/enemies/index.html` is MIXED (1801 lines, 1798 CR) — do not normalise
that one, edit it line-wise. After ANY scripted write, check
`tr -dc '\r' < f | wc -c` against `wc -l`. `git diff --stat` will NOT catch a
script that inserts lines with the wrong ending.

**HEREDOCS IN THE BASH TOOL EAT BACKSLASHES.** `C:\Program Files\nodejs\` went
through a non-raw Python string and `\n` became a real newline, splitting a path
across two lines mid-word. Write paths with forward slashes, or use the Write
tool for patch scripts.

**`tools/devserver.py` DIES UNDER A LONG PASS** and every gate then hangs on
"navigating to… waiting until load". Restart it before diagnosing a broken
suite. It is single-threaded: a game open in the browser pane can also block it.

**A GATE THAT CANNOT FAIL IS A STORY.** Every gate here ships with a
demonstration that removing the fix turns it red (CONTRACTS 54). And a gate that
SKIPS is worse than no gate: `design-courage` reported "0 failures" while
silently skipping 16 of 136 authored values, because it keyed on a display name
and every boss declares `hp: [SOLO_MAX, SOLO_MAX]`. It prints its skip count now.

━━ NOT THE JOB ━━

- Do not repeat these; they are all measured and recorded in
  `docs/notes/2026-09-01-the-mansion-is-not-a-ladder.md`: scaling enemy COURAGE
  by depth (longer fights, no threat), squaring the damage curve (buys the tail,
  breaks the Heart, at three ceilings), partial PIERCE by depth (no measurable
  effect — they are not blocking, the bodies never live to act), lowering the
  Head Gardener (the Greenhouse got HARDER, twice), cutting event relic supply
  (29.0 -> 28.7 Keepsakes, no cost change).
- Do not change `PARTY_HP_SCALE`.
- Do not tune the Foyer or the Butler by feel — both have committed
  before/afters in `tests/critic-design/`.
- Do not build a pop-up tutorial.
- Do not start Steam P2P until Josh has an App ID.
- Do not chase fps on this machine; do not re-open the card-art encoder question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read `HANDOFF.md` next ("Where it stands"), then `CONTRACTS.md` at 60 traps.
Then, for the recent working:

  docs/notes/2026-08-31-the-foyer-is-attrition-not-the-boss.md
  docs/notes/2026-09-01-the-mansion-is-not-a-ladder.md
  docs/notes/2026-09-01-the-guard-axis.md
  docs/notes/2026-09-01-a-third-of-the-haunt-ladder-is-above-the-ceiling.md

STATE: branch `dev`, committed and pushed. Do not trust a hash written here; run
`git rev-list --count origin/dev..dev`. Pushing to origin/dev is authorised.

Dev server, and it does not survive a restart:

  python tools/devserver.py 8777

Start by telling me what you'd do first and why.
