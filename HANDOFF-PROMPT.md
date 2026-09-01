Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ START HERE, 2026-08-31 ━━ THE LADDER HAS A SHAPE NOW ━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All seventeen regions ship rosters, and every one of them now has a real-engine
gate of its own. The previous handoff carried one enormous finding: **ten of the
seventeen wings killed nobody.** Everything that survived the Study and Library
won the game.

That is CLOSED. Ten of the seventeen kill somebody now, against the same
content, unchanged — and the content was never the cause.

    where fifty seeded expeditions END
    before                          after
    defeat/foyer            28      defeat/foyer            28
    defeat/nursery          10      victory                  7
    victory                  8      defeat/greenhouse        4
    defeat/graveyard         3      defeat/study-library     2
    defeat/greenhouse        1      defeat/hedge-maze        2
                                    defeat/nursery           2
                                    defeat/graveyard         2
                                    defeat/lampworks         1
                                    defeat/sleeping-quarters 1
                                    defeat/kitchens-cellars  1

Back-half fights run 4 to 7 turns instead of 1.8 to 2.5. Boss draws: 4 → 0.

── HOW IT WAS FOUND, WHICH MATTERS MORE THAN THE FIX ────────────────────────

"Regions reached" says where runs STOP. It cannot say why, and at seventeen
wings it was a flat line that could equally have meant "the back half is
underpriced" or "the bot is simply good by then".

`tests/run/run.py` prints two new tables that CAN. The first is what a fight
costs, region by region, as a share of the pool it comes out of — the only
cross-region comparison that survives the pool growing:

    region              cost per fight   turns   deck   keepsakes
    foyer                 24.6% of pool    6.7     12       2.2
    nursery                8.4%            6.1     18       6.8
    sleeping-quarters      1.7%            4.6     23      11.8
    ...
    crypt                  0.6%            2.6     33      50.6
    heart                  1.7%            2.4     33      55.0

Fights past the second wing cost one to four per cent and ended in two turns;
four bosses cost 0.0. And the last column is the cause: a run ended holding
FIFTY-FIVE Keepsakes, which is every Keepsake in the game. The pool was not
generous, it was EXHAUSTED — and nothing can be priced against a player holding
every relic that exists.

The second table is where those came from, and it named a defect rather than a
balance opinion: **a Curiosity paid 0.97 Keepsakes per visit** across 273 of
them, more than every boss in the run put together, on the second most common
room in the game.

── THE THREE THINGS THAT FIXED IT ───────────────────────────────────────────

1. **A Curiosity is a bet again.** `data/events.js`'s own header cites Slay the
   Spire's `?` rooms — "always tell you the shape of the bet" — and the `risk`
   and `reward` lines were prose typed beside the outcomes rather than derived
   from them, so they said untrue things: THE COLLAR advertised `RISK You walk
   away empty-handed` on an option whose only outcome handed over a Keepsake,
   and EIGHT options read `RISK Nothing` and paid a GUARANTEED one.
   `tests/events/check.py` derives the line from the outcomes now. Named story
   Keepsakes kept and priced; generic "and also, have an uncommon relic" grants
   became the currencies the file's own vocabulary already names.
   17 of 17 events could pay one → 11. 24 of 54 options → 16, 8 of them certain.

2. **An expedition is a ROUTE, not the ladder.** The Foyer, the Heart, and four
   wings drawn from the middle fifteen IN LADDER ORDER, seeded off the run seed
   so a seed is still an expedition. `EXPEDITION_WINGS = 6`, and the number is a
   measurement — the sweep is in
   `docs/notes/2026-08-31-how-long-is-an-expedition.md`.

   This is what the design has always said. `docs/design/01-mansion-structure.md`:
   "Entire wings disappear." "Not all are usable every expedition." "What
   changes is what the mansion is willing to let them reach." `RUN_REGIONS` grew
   2 → 4 → 17 as regions shipped and its own comment says every move was about
   making finished content REACHABLE. Nobody ever decided seventeen; it is what
   "all of them" happens to equal.

   `RUN_REGIONS` is still the MANSION. `run.route` is tonight's way through it,
   saved and restored, and the harness FAILS if any wing is never routed
   through across the fifty seeds.

3. **A fight that cannot end is now impossible.** `CombatEngine._losePatience`:
   past turn 30 every living enemy gains a stack of Strength at each player turn
   start, announced as THE HOUSE LOSES PATIENCE. Strength is a pipeline status
   that `previewDamageValue` also applies, so the number rises ON THE INTENT
   before it rises on the hit. Unbounded, so termination is guaranteed. Far
   outside reachable play — the longest fight any region gate produces is 24
   turns. The boss-draw exemption in `tests/run/index.html` is CLOSED: a draw is
   a failure now, because it can only mean this did not run.

━━ WHAT ELSE MOVED THIS SESSION ━━

**THE FIRST THREE REGIONS GOT THE GATE THE OTHER FOURTEEN HAD.**
`tests/foyer/` 66, `tests/nursery/` 64, `tests/sleeping-quarters/` 62. All
seventeen now have one. The Foyer's found `actor.summonedBy` on its first run.

**FIVE MORE DEAD SEAMS. THAT MAKES FIFTEEN.** A seam is dead when it is
written, documented, and read by nothing.

| what was dead | how long | found by |
|---|---|---|
| `actor.summonedBy` — read by 5 content sites in 3 regions, written by nothing | always | `tests/foyer/` |
| boss Haunt `dmgBonus` — 5 of 17 bosses applied it in neither half | always | `tests/boss-haunt/` |
| the Haunt envelope's `moves` / `moveOverrides` — produced, documented, consumed by nothing | always | a grep for its consumers |
| `ANIMATED_EVENTS` — exported, and imported by nothing | always | `tests/animated-events/` |
| `BUILT_REGIONS` said THREE regions while seventeen shipped, withholding two gold achievements | two sessions | reading a comment that named a suite which did not exist |

`summonedBy` cost the House Bell's Resonance lever (the player's only way to
delay MIDNIGHT TOLL — repaired ONCE already in the `onAllyDeath` signature, and
the field it then read was still never written), the Toy Chest's summon cap, its
Tidy Up, and The Wardrobe's despawn-on-death.

**AND THE TITLE ACHIEVEMENT WAS BEING WITHHELD FOR A REASON THAT HAD STOPPED
BEING TRUE.** `core/achievements.js` gates achievements on `BUILT_REGIONS`, so a
Steam page never lists one nobody can earn. The list said three regions. Its own
comment said "`tests/achievements/run.py` asserts the list matches the enemy
pools that really exist, so it cannot rot silently" — and there was no
`tests/achievements/`. So `rescue-all`, the game's own title achievement, and
`reach-heart`, the one for finishing it, were written, tested and invisible. The
suite exists now (10 checks) and reads `IMPLEMENTED_REGIONS` and the boss
formations, in both directions. CONTRACTS 60.

**AND THE FINAL BOSS HAD A RULE IT COULD NOT ENFORCE, TWICE OVER.** The Keeper's
Belonging is printed on screen — "End the turn holding 2 or more and the Keeper
gains 8 Guard" — and read `cardsIn('hand')` from `onPlayerTurnEnd`, which is
step 3 of `_endTurn`, while `_closeSeatHand` empties the hand at step 1. Fixing
only that would not have been enough: Guard granted from `onPlayerTurnEnd` is
wiped by the enemy's own start-of-turn Guard wipe. It is armed at the player's
turn end and PAID at the Keeper's turn start now. `_closeSeatHand` latches
`handAtTurnEnd` and `energyAtTurnEnd` per seat, because there is no hook between
the player pressing the button and the hand being emptied.

**THE TWO STARTERS THAT HAD NO SUITE NOW HAVE ONE.** `tests/marmalade/` 19,
`tests/bones/` 23 — fifteen Companions had one and two of the four STARTERS did
not. Both are named in CONTRACTS 9 and 10, so both suites run every scenario on
the TWO-ENEMY board, which is where a per-actor tick looks correct. The Bones
suite found `bones/tail-a-mile-a-minute` still half-dead: repaired onto `dugUp`,
which only two multiplayer cards fire, while the ordinary `digUp()` every solo
player uses fires `digUp`. `hook-names` balanced because both spellings existed
somewhere.

━━ AND THE ADVANCED POOL WAS ONE ROW DEEP ━━

**102 AUTHORED FORMATIONS — THE LARGEST TIER IN THE GAME — WERE DRAWN FROM 1.7%
OF THE TIME.** `tierFor` asked for `advanced` only on row `rows - 2`, which is
`lastWalk`, the boss's DOOR row — 26% Safe Room, 13% shop, 13% treasure, **11%
Scuffle**, and `pickNode` scores a deep Safe Room at 400 so the router walks past
what is left. One row, one room in nine, and the bot takes the rest.

    tier         before          after `rows - 5`
    early        194  33.9%      189  34.3%     69 authored
    standard     248  43.4%      150  27.2%     70
    advanced      10   1.7%       96  17.4%    102   <-- ten fights to ninety-six
    elite         28   4.9%       28   5.1%     52
    boss          92  16.1%       88  16.0%     17

It cost NOTHING: Foyer defeats 28 → 28, cost per fight 24.0% → 24.5%, arrival
85% → 84%, boss losses 15 → 14. The back half prices at 0.0–0.6% of pool per
fight, so a harder formation there troubles nobody. The deep content was not
withheld for balance, it was withheld by an off-by-three.

It also had a rule dead underneath it. `REGION_RULES.foyer` carries
`minScuffle: { 'red-carpet-runner': 2 }` — §10 of the chapter, implemented
correctly and consulted by `rollEncounter` — which could never bind, because the
tier gate was strictly more restrictive everywhere. A floor turned into an
unreachable ceiling.

**HOW IT WAS FOUND, which is the reusable part.** `docs/design/regions/01-foyer.md`
§33 says the player is taught ten lessons "PRIMARILY THROUGH COMBAT RATHER THAN
POP UP TUTORIALS" — so the encounter ladder IS the onboarding, and a lesson only
lands if the player MEETS the body carrying it. That is checkable, and the answer
was that **the Red Carpet Runner was never met once in forty expeditions.**

**AND THE ROLLER COVERS NOW, 2026-09-01.** I first called this a design call and
that was a misreading: §10 says outright "the procedural system **should not
treat all formations equally**", and §33 states the teaching as an OUTCOME — "by
the time they defeat The Butler, the player HAS BEEN taught" — not an intention.
Covering implements two things the chapter already says.

One soft rule in `rollEncounter`, after every hard rule and before the weighted
pick: prefer a formation carrying a body this run has not met IN THIS REGION.
It is a `soften`, so it vanishes the moment there is nobody left to introduce.

    the enemy            before   after        a run meets   3.5 -> 4.3 of six
    coatrack-crawler       60%      88%        met ALL six     0 -> 8 runs
    calling-bell           40%      65%
    red-carpet-runner      15%      33%

**Eight runs in forty now meet the whole roster, where none ever had** — and it
is slightly CHEAPER, not dearer: Foyer cost per fight 24.7% → 23.2%, the
ordinary Scuffle 11.9 → 10.7, arrival 84% → 86%, defeats 31 → 31. Covering means
fewer repeat fights against the same escalating body, which is why the design
wanted it.

Still short of the contract at 4.3 of six: a run fights ~4.7 times and two of
those are the forced opening pair. Closing the rest means more fights in the
first wing or fewer teachers in it, and both are design calls.

━━ THE BATTERY IS RED ON PURPOSE, AND HERE IS WHY ━━

**`tests/run/run.py` FAILS with 1 error, and the error is a real defect.** Do not
spend a round deciding whether you broke it — the failure message names its own
cause and this section is the long version.

`combat/engine.js`'s `_losePatience` escalates every enemy past turn 30, and its
comment claims: "PATIENCE is deliberately far outside reachable play ... the
longest fight any region gate produces is 24. Nothing a player will ever see is
touched by this." **Nothing checked it.** The run harness does now, and across
535 real fights in fifty expeditions:

    longest fight        87 turns   graveyard/boss
    past 24 turns        13
    past 30 turns         9   <- _losePatience fired, in ordinary play

All ten longest fights are BOSSES and NINE OF TEN WERE LOST. An 87-turn fight
means the termination guarantee ran for 57 turns, stacking 57 Strength, before
the fight ended. THE HOUSE LOSES PATIENCE is on screen as though it were
designed content.

**THE CAUSE IS ONE DAY OLD AND IT IS OURS.** Boss pools scale 137 → 695 across
the ladder — the boss tier is the only place this mansion IS a ladder — and they
were authored against LADDER position. `EXPEDITION_WINGS = 6` drew route
position apart from ladder position on 2026-08-31, and nothing re-measured the
bosses after it. The harness's own `reach` table lists the wings that can be
WING TWO: attic-observatory, graveyard, greenhouse, kitchens-cellars, lampworks,
nursery, sleeping-quarters, study-library. Every long-fight region is on it. A
345–474 Courage boss authored for wing five, met with a wing-two deck, is a
thirty-to-eighty-turn grind the player loses.

**The fix is a FORK, which is why it is not taken:**
  * scale the boss pool by ROUTE position rather than ladder position — small,
    principled, and it changes what a wing IS;
  * or constrain the route so a wing cannot appear far from its ladder index;
  * or re-author seventeen pools against the six-wing route.

Full working, with the ordinary and elite tiers measured the same way, in
`docs/notes/2026-09-01-the-mansion-is-not-a-ladder.md`.

━━ WHAT I WOULD DO FIRST ━━

**THE FOYER QUESTION IS ANSWERED, AND THE ANSWER WAS NEITHER OPTION.** The
previous handoff asked whether the twelve early Foyer deaths were the CONTENT or
the opening DECK. The ledger could not say, because it priced a fight by REGION —
averaging a row-0 Scuffle together with the Butler on row 12, which are exactly
the two halves of the finding. It has `row` now, and it prints two new tables.
The full working is `docs/notes/2026-08-31-the-foyer-is-attrition-not-the-boss.md`.

    region   bosses  arrives at  boss costs  margin  lost   won hp/deck   lost hp/deck
    foyer      29       85%         64%       21pp    15    95% / 14.2    76% / 14.6

**Winners and losers arrive at the Butler's door with the SAME DECK** — 14.2
cards against 14.6 — and different Courage, 95% against 76%. It is ATTRITION.
Not the deck, and not the content either: the ordinary rooms cost 7-22% of the
pool and the bot only meets about four of them.

**AND THE CEILING IS ARITHMETIC.** Margin — arrival minus price, in points of
the pool — predicts the boss loss rate across every wing monotonically (0pp →
2/2 lost, 20pp → 4/5, 21pp → 15/29, 35pp → 1/3, 75pp → 1/5). Arrival cannot
exceed 100%, so while the Butler costs 64% of the pool **the Foyer's margin can
never exceed +36pp however well the wing is played.**

**THE BUTLER HAS NOT DRIFTED.** Re-measured at 24 generations / 22 loadouts:
62.5%, which is within noise of the committed 68.8% — and that anchor was taken
on EIGHT loadouts, which cannot resolve six points. The replacement is
`sweep-butler-2026-08-31-powered.json`, with the what-if beside it: `x0.9` on the
Butler's pool buys 62.5% → 77.1%, `x0.8` buys 81.3%.

**AND THE POOL WAS CUT, 2026-09-01: 149 → 134. IT IS A WASH, AND THE WHY IS THE
REUSABLE PART.**

`sweep.py --scales` IS NOT A POOL EDIT. `scaleHp` multiplies the actor's maxHp
at fight time and leaves `BASE_HP` alone, so `phaseAt` drags the phase-two
threshold down with it — the `x0.9` row above measured a Butler whose DANGEROUS
half was ALSO cut a tenth. The real edit pins `BASE_HP` (the file says why, at
length) so PHASE2_AT stays an absolute 92 and the whole cut comes out of the
preamble. **Never quote a `--scales` row as a forecast of a pool edit on a
phased boss.** A true A/B, n=96 over 22 loadouts, both on current tier bands:

    149   58.3% win   11.41 turns   cost 50.9   winners keep 33.4
    134   62.5% win   10.09 turns   cost 49.0   winners keep 30.8

+4.2 points, not the +14.6 the `--scales` row promised — and winners come out
**2.6 Courage POORER**, because a cut that can only come from phase one makes
him shorter without making him softer (phase two goes 62% → 69% of the pool).
Across whole expeditions: Foyer defeats 28 → 31, victories 6 → 5, at n=50 where
the sd is ~3.5. The boss instrument and the run instrument disagree and neither
is decisive; the change is kept because it was asked for and it is not harmful.

**THE ROUTER IS NOT THE CAUSE — that question is CLOSED.** Control run with
`pickNode`'s shallow Safe Room raised 40 → 120 so it outranks Treasure: arrival
at the Butler's door moved **84% → 85%**. The wing's attrition is real and is
not a bot artifact, so CONTRACTS 47 does not apply here.

**So the remaining lever is phase two's DAMAGE, not the pool** — which is the
sentence the 2026-08-29 pass ended on, now measured true at 134 as well as 149.
That is a DESIGN call: is the first wing meant to end half the runs that reach
its door? Do not take it by feel, but it can be taken against numbers.

**WHAT IS ALREADY RULED OUT, so it is not re-run:** the map is not rest-starved
(a Safe Room is reachable behind 1.98 fights, measured over 5100 sheets), and
moving `NodeType.SAFE`'s floor from row 4 to row 3 leaves Foyer defeats at
exactly 28 — it converts corridor deaths into boss deaths one for one.

━━ HOW A REGION WAS BUILT, IF ONE IS EVER ADDED ━━

Nine regions were built to this template in two sessions and it did not need
changing. Kept because the same six steps are what any new CONTENT needs.

1. Read the whole design chapter first. `docs/design/regions/NN-name.md`, 900
   to 1200 lines. Outline it with a heading grep, then read it whole.

2. Three files, copying the freshest worked examples:
     `data/enemies/<region>.js`        statuses + the ordinary roster
     `data/enemies/<region>-scares.js` the Big Scares
     `data/bosses/<boss>.js`           the boss and its parts
   `enemies/bathhouse.js` is the one to copy for a region with a global
   battlefield state; `enemies/kennels.js` for one with neutral bodies;
   `enemies/pumpkin-grounds.js` for one with a shared factory across files.

3. Wire SIX places, and all six matter:
     `data/enemies/index.js`     imports, ALL, ENEMY_STATUSES, IMPLEMENTED_REGIONS
     `data/encounters.js`        the formation block, REGION_RULES, ALL_ENCOUNTERS
     `state/run.js`              RUN_REGIONS — `'heart'` stays last, it is the ENDING
     `tests/enemies/engine-audit.html`  a BATCH per Big Scare and boss
     `tests/status-names/index.html`    a layer probe naming one of its statuses
     `ui/enemy.js`'s MOTIF map   unlisted silhouettes fall back to their body
                                 archetype, and half a roster is usually
                                 `sprawling`, which makes every one of them
                                 ripple. A paper knight that ripples reads as a rug.

4. `tests/<region>/check.py`, driving the REAL `CombatEngine`. Copy
   `tests/bathhouse/check.py` — it is the longest and the one whose every claim
   is checked on BOTH sides. Every claim about a board two turns from now gets a
   CONTROL that runs the same board without the thing.

5. `python tools/shot.py <name> --scene combat --encounter <boss-id> --wait 7`
   and LOOK at it. `--wait 7`, not 3: at 3 the House Rule announcement animation
   is still crossing the screen and the hand is still being dealt.

6. Run the battery. Commit with `git commit -F`.

━━ THE RULES THAT COST THE MOST TIME ━━

── AN INTENT MAY NEVER LIE, AND THE TIMING IS WHERE IT BREAKS ───────────────

Every enemy's move and its intent are chosen at PLAYER-TURN START (engine step
7, `refreshIntents('turnStart')`) and HELD until the move resolves.

**THE SINGLE MOST EXPENSIVE MISTAKE IN THIS CODEBASE:** a meter the player's
damage moves, settled in `onPlayerTurnEnd`.

That hook fires at step 3 of `endTurn` — after the intent was drawn and before
the enemy acts — so a meter that drops there drops underneath a number the
player has already committed against. Written that way it looks perfect and
reads perfectly and `tests/enemies/run.py` stays green.

`tests/enemies/audit.py` found it forty-six times in the Bathhouse across three
moves, including a Calm meter that rerouted a promised 12-damage Towel Snap into
a heal thirty-three times. **Settle at `onPlayerTurnStart` instead.**
`enemies/bathhouse.js`'s `settleLedger` is the shared form.

Four more, all violated at least once:

  * **A buff gained during the enemy phase cannot be in that turn's intent.**
    Mark the recipient during the phase and GRANT it at `onPlayerTurnStart`.
  * **`onPlayerTurnStart` fires BEFORE the hand is dealt.** `onPlayerReady`
    (step 6c) is after the deal and before the intents.
  * **Enemy Guard is wiped at the start of that enemy's own turn.** Guard
    granted from `onPlayerTurnEnd` is erased before it can stop anything — this
    is half of why the Keeper's Belonging was dead.
  * **The HAND IS ALREADY EMPTY at `onPlayerTurnEnd`.** `_closeSeatHand` runs at
    step 1. Anything that wants to price what the player did NOT spend reads
    `c.handAtTurnEnd()` / `c.energyAtTurnEnd()`, which the engine latches.

A status decay bucket has the same trap in it. A player's `turnEnd` decay runs
BEFORE the enemy phase, so a status applied at turn start is gone by the time
anything can hit you for it.

USE `damageFn`/`blockFn`/`hitsFn` READING A COUNTER for anything that scales,
and write a COUNTER rather than a `mem` field when the player should see the
number move: writing a counter calls `refreshIntents`, writing `mem` does not.

── AND TWO PRESENTATION LIMITS THAT ARE REAL ────────────────────────────────

  * **THREE HOUSE RULE CARDS FIT. THE FOURTH LANDS ON THE KID'S PORTRAIT.**
    One rule per fight-shaped thing, not one per body.
  * **SIX BODIES IS THE LAYOUT'S CEILING** and every count from 4 up needs its
    own rule in `scenes/combat.css`. `data-n="4"` goes the OPPOSITE way to 5 and
    6: those overflow and need the left padding removed, while four bodies FIT
    and merely start too far left, so that one pushes right.

━━ THE INSTRUMENTS, AND WHY EACH ONE EXISTS ━━

`tests/enemies/run.py` is a STRUCTURAL checker with a mocked context. It stayed
green through every bug above. It cannot see them.

  * `tests/<region>/check.py` — the real engine, SEVENTEEN of them now. The only
    thing that finds an empty hand or a body that cannot be hurt.
  * `tests/enemies/audit.py` — ITS BATCH LIST IS HARDCODED in
    `tests/enemies/engine-audit.html`. It once stopped at region 3 and printed a
    healthy number while the whole Kitchens had never had one intent checked.
    **It runs at HAUNT 0**, which is why it cannot see a Haunt bug of any kind.
  * `tests/run/run.py` — 50 seeded expeditions with a competent bot and real
    drafting, 4 minutes. Its four tables are the only thing in the project that
    can price the ladder rather than describe it: cost per fight BY REGION, what
    each ROOM KIND hands over, the first wing BY DEPTH, and what the player
    brings to each BOSS DOOR, which TIER the fights came from, which authored
    formations a run NEVER rolls, and what the first wing actually TEACHES.
    The last five are new, and the depth one exists
    because a region average hides a wing's own shape — the Foyer's 28 defeats
    are 16 at row 12 and 12 before it, and one number cannot hold both.
    **`hpBefore` was recorded for every fight from the day the ledger existed
    and printed by nothing for two sessions**, which is why "the boss costs too
    much" and "the player arrives broke" could not be told apart.
  * `tests/boss-haunt/check.py` — every boss at two Haunt levels, on the intent
    AND on the hit. The only thing that can see a Haunt bug at all.
  * A SCREENSHOT. It found a final boss pushed off the left edge of its own
    fight, five House Rule cards burying the portrait, a boss whose Courage bar
    sat behind the card hand, and this session a map header promising eleven
    wings the house was not going to open.
  * `tests/status-names/check.py` — display-name collisions, two chips reading
    the same word on one portrait meaning two things.

**Check that each gate's NUMBER MOVED.** A count that did not change when
something arrived is the finding. And a gate whose first run indicts EVERYTHING
is more likely to be broken than to be right — `tests/boss-haunt/` reported all
seventeen bosses failing before it applied the Haunt envelope the way the run
layer does. See CONTRACTS 57.

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Every number below was
RUN on 2026-08-31 against this tree. If one differs, that is the finding.

  python tests/cards/run.py               1470 cards, 0 errors, 0 warnings
  python tests/combat/run.py              694
  python tests/enemies/run.py             275 enemies, 0 errors
                                          (310 encounters, 106 statuses, 24 Tricks)
  python tests/enemies/audit.py           19803 turns, 0 errors
  python tests/run/run.py                 50 runs, **1 ERROR** — ON PURPOSE,
                                          see THE BATTERY IS RED section
  python tests/coop/run.py                645
  python tests/net/run.py                 158
  python tests/backpack/run.py            80
  python tests/map/run.py                 30
  python tests/vote/run.py                35
  python tests/wings/run.py               44
  python tests/haunt/run.py               21
  python tests/combat-scene/seam.py       22
  python tests/hand-cards/run.py          40
  python tests/piles-reachable/run.py     24
  python tests/settings-play/run.py       19
  python tests/gameover-keeps/run.py      16
  python tests/platform/run.py            54   ← was 52
  python tests/gamepad/run.py             23
  python tests/steam-deck/run.py           6
  python tests/audio/run.py               46 cues, 0 errors
  python tests/chrome/run.py              27
  python tests/cards-feel/run.py          exit 0
  python tests/critic-design/anchor.py    5/5 agree
  python tests/critic-design/ladder.py    17 regions, 0 errors  <- NEW

  SEVENTEEN REAL-ENGINE REGION GATES — one per region, at last:
    foyer 66 · nursery 64 · sleeping-quarters 62 · kitchens 16 ·
    greenhouse 33 · graveyard 35 · study-library 50 · attic-observatory 48 ·
    lampworks 45 · ballroom 46 · crypt 41 · hedge-maze 42 ·
    secret-passages 74 · bathhouse 81 · kennels 69 · pumpkin-grounds 70 ·
    heart 44

  EIGHTEEN GATES, each must stay at zero:
    tests/seams/check.py          0 problems
    tests/hook-names/check.py     201 declared, 0 unknown
    tests/bus-names/check.py      0 dead subscriptions
    tests/status-names/check.py   0 unwaived collisions
    tests/part-lookups/check.py   0 actor lookups by def id
    tests/snapshot-cards/check.py 0 snapshot-as-runtime-card
    tests/party-tells/check.py    0 tells that address one Kid
    tests/licences/check.py       21 ok
    tests/audio/cues.py           46 cues, 1 known-silent
    tests/events/check.py         8            ← NEW
    tests/boss-haunt/check.py     6            ← NEW
    tests/animated-events/check.py 7           ← NEW
    tests/achievements/run.py     10           ← NEW (the one its own comment
                                                claimed already existed)
    dup-keys · scene-css · css-tokens · turn-events · stdlib-shadow

  SIXTEEN effect-asserting Companion suites, plus two boss suites:
    boggle 31 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 16
    truffle 27 · drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52
    crinkle 44 · pipkin 18 · taffy 8 · marmalade 19 · bones 23
    plus butler 38 · governess 56
  (every Companion has one now.)

  SIX co-op screens (they live in `tests/coop/`, NOT `tests/playthrough*/`,
  which are interactive drivers and not pass/fail suites):
    selectscreen · hotseat · rooms · playthrough · lobby · matedeck

`tests/audio/run.py` was recorded as an intermittent flake by the previous
handoff. It was clean on every run this session. Left recorded rather than
declared fixed.

━━ WHAT IS OPEN ━━

1. **THE FOYER IS 28 OF 43 DEFEATS, AND IT IS ATTRITION.** See WHAT I WOULD DO
   FIRST — the question is answered and what remains is a design call on the
   Butler's price, costed. Two things came off this while it was measured: the
   Curiosity fix cost ~4.4 Courage of arrival at the Butler's door (measured by
   A/B against `24cf02c^`), and it did NOT move the number it was named for —
   a Curiosity still pays **0.92** Keepsakes per visit against the 0.97 that was
   the defect. What changed the end-state distribution was the ROUTE change
   alone; HANDOFF credits both.

2. **HAUNT SCALING IS EXERCISED AT ONE TIER.** `tests/boss-haunt/check.py`
   proves every BOSS really hits harder at higher Haunt, on the intent and on
   the hit — it found five that applied the bonus in neither half. Nothing does
   the same for ordinary enemies or Big Scares, whose envelopes carry ~35
   behavioural flags at level ≥1 and 13 at ≥9, and `tests/run/run.py` still
   plays every expedition at Haunt 0. The same suite, pointed at a roster
   instead of a boss list, is the obvious next instrument.

3. **Steam P2P is APPROVED and BLOCKED, and only Josh can unblock it.** It needs
   a Steam App ID, which needs a Steamworks partner account, a fee and a
   registered app. `net/transport.js` is ready — five members, two working
   implementations. It also ends the no-build rule. The Treehouse
   (`scenes/lobby.js`) works today over `ChannelTransport`.

4. **The same-turn netcode race.** The cross-turn half is CLOSED. What remains
   is two seats acting at once with their inputs crossing; closing it needs
   ROLLBACK or a SEQUENCER, and the transport decides which. Waits on item 3.

5. **ONE KID TAKES THE FIGHT AND THE REST WATCH.** `spreadOf` is 0 when one seat
   takes all the damage and 1 when it is shared: elite 2p 0.181 / 3p 0.163 /
   4p 0.259, standard 2p 0.144 / 3p 0.198 / 4p 0.278. It reframes AoE: its value
   here is PARTICIPATION, not difficulty. Nine of the seventeen regions have
   never been measured this way.

6. **The entry stall is REAL and the cause is found.** Six `toDataURL` calls,
   274 ms, from `cardart.js render()` line 352 — a synchronous PNG encode. The
   fix is `toBlob` plus object URLs, scoped in
   `docs/notes/2026-08-30-the-card-art-hitch-is-real.md`. Pre-warming was tried
   and REJECTED. fps is CLOSED: eleven of eleven readings at 61.

7. **ENEMY SILHOUETTES ARE GENERIC FOR ALMOST EVERYTHING.** Counted this
   session: **189 distinct silhouette keys in use, 12 with a prop layer, 191
   defs across 177 unlayered keys.** There is no leverage in it — the commonest
   unlayered key is used four times — so it is 177 bespoke drawings and the
   largest single piece of work left in the project. Nothing is broken:
   `ui/enemy.js` documents the fallback and every region got its MOTIF entries,
   so everything at least MOVES like what it is.

8. **`combat:crit` is known-silent** and wiring it means designing critical hits,
   which nobody has asked for.

9. **The ~100 remaining sweep findings** in
   `docs/notes/2026-08-30-the-unreachable-sweep.md`. 24 verified; the rest are
   leads worth reading and not worth trusting unread. `ANIMATED_EVENTS` came off
   that list today — three of its five unanimated events were real holes (a Kid
   falling, a Kid getting back up, a countdown reaching zero) and two were met
   elsewhere on purpose.

   **A blanket "unused export" sweep is not worth running.** Counted today: 281
   exported symbols in `game/src` are named nowhere else, and nearly all are
   false positives — every enemy def is `export const x = {…}` referenced only
   by its own file's roster array, which is exactly right. What separates a
   defect from dead weight is whether the export makes a CLAIM.
   `ANIMATED_EVENTS` said "the renderer MUST animate these"; `keywordsByCategory`
   says nothing. Chase the ones that assert something.

━━ THINGS THAT WILL SAVE YOU A ROUND ━━

- **An intent may never lie.** See the timing section above; it is the single
  richest source of bugs in this codebase and the audit is the only thing that
  finds them — at Haunt 0.
- **A COUNTDOWN IS NOT AN INTENT.** Scheduled damage (`c.schedule`, tagged
  `cause: 'timer'`) is excluded from the intent comparison and COUNTED
  SEPARATELY in the audit's report. Do not widen that exemption. It has its own
  banner now, because it is the one kind of incoming the intent rail never
  showed.
- **RETALIATION IS NOT AN INTENT EITHER**, and does not need to be — it lands
  during the PLAYER's turn in answer to a card. What it needs is to be READABLE
  BEFORE THE SWING.
- **A fight that cannot END is a defect.** It is now impossible; a draw in
  `tests/run/run.py` is a hard failure and means `_losePatience` did not run.
- **`announceRule` is the only way to name a Trick on screen**, and it is also
  how you bury a portrait. Key every announcement `<kind>:<self.id>` so an enemy
  REPLACES its own card instead of adding a fourth.
- **THERE IS NO ENGINE SURFACE FOR AN ENEMY TO STOP THE FIGHT AND ASK A
  QUESTION.** The Ballroom settled it: an offer is a CARD in the player's hand,
  playing it is yes and letting it expire is no, and the terms are the card
  text. They live in `data/invitations.js`.
- **`mem` IS JSON ROUND-TRIPPED.** Plain data only. A function stored there
  comes back as null on resume, and it took a boss crash to find that.
- **`buildEncounter` RETURNS the Haunt counters and flags and APPLIES neither.**
  `state/run.js` copies them onto the built actors after construction. A probe
  that builds from `getEnemy(id)` measures Haunt 0 whatever level it asked for.
- **ROOM inputs COMMUTE; COMBAT inputs do not.** Only `play` and `snack`
  reorder the board.
- **The route is VOTED.** Any harness that clicks a map node with a PARTY needs
  one vote per Kid with `.hoff__go` between them.

━━ NOT THE JOB ━━

- Do not tune the Foyer, the Butler or the Foyer elites by feel — item 1, and
  all three have a committed before/after in `tests/critic-design/`.
- Do not change `PARTY_HP_SCALE`; it was re-measured on a repaired harness.
- Do not chase fps on this machine as it currently is.
- Do not re-open the card-art encoder question — pre-warming does not work.
- Do not re-wire audio's dead bus names. `scenes/combat.js` plays thirteen of
  those cues directly, timed to its FX.
- Do not redesign Crinkle — his chapter is accepted, checked against the build,
  and the Study and Library implements it.
- Do not start Steam P2P until Josh has a Steam App ID.
- Do not build AoE for the ELITE tier. Measured: AoE is added damage a party
  then blocks, and only pierce is kept.
- Do not wire `ANIMATED_EVENTS` into the combat scene's dispatch. It was
  considered and rejected in its own comment: it replaces a working switch with
  a table lookup on the surface a player watches for a whole fight, and buys
  nothing the gate does not.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read `HANDOFF.md` next — it opens with "Where it stands" and carries the long
version of everything above. Then `CONTRACTS.md`, at 60 traps. Then, for
context:

  docs/notes/2026-08-31-how-long-is-an-expedition.md   the ladder, priced
  docs/notes/2026-08-30-the-unreachable-sweep.md       111 findings, 24 verified
  docs/STEAM-DECK.md · docs/COMMERCIAL-USE.md
  docs/STS2-REFERENCE.md §8 — it carries its OWN "For us:" verdicts and nothing
  syncs them to HANDOFF's list.

STATE: branch `dev`, committed and pushed. Do not trust a hash written here; run
`git rev-list --count origin/dev..dev`. Pushing to origin/dev is authorised and
was exercised twelve times across 2026-08-30 and 31.

**LINE ENDINGS ARE MIXED PER FILE AND BOTH KINDS ARE LOAD-BEARING.**
`combat/engine.js`, `combat/damage.js`, `combat/actor.js`, `_lib.js`,
`encounters.js`, `state/run.js`, `scenes/map.js`, `data/enemies/foyer.js`,
`relics.js`, `combat.css`, `engine-audit.html`, `tests/net/index.html` and both
HANDOFF files are CRLF; `scenes/gameover.js`, `ui/hud.js`, `data/events.js`,
every boss file, `enemies/index.js`, `ui/enemy.js`, `status-names/index.html`,
`tests/run/index.html` and every `tests/<region>/check.py` is LF;
`tests/enemies/index.html`, `enemies/sleeping-quarters.js` and `CONTRACTS.md`
are MIXED. A scripted normalise-and-rewrite once turned two Graveyard files into
a 1819-line diff for 43 lines of change.

**`grep -c $'\r$'` DOES NOT WORK IN THE BASH TOOL** and it fails in the worst
possible way: the `\r` is eaten before grep sees it, the pattern collapses to
`$`, and it matches EVERY line — so every file reads as 100% CRLF and the count
is just the line count. Checked that way the list above looks wrong on three
files. It is not; the tool is. Count bytes instead (`raw.count(b"\r\n")` against
`raw.count(b"\n")`). The census of this tree is **1750 CRLF, 377 LF, 10 mixed**;
everything under `docs/notes/` is LF.

**Read with `newline=''`, translate your patterns to the file's own ending, and
check `git diff --stat` against `git diff --ignore-cr-at-eol --stat`** — they
must be identical. That check is independent of the shell and stayed right when
the grep above did not.

**BUT THAT CHECK HAS A HOLE, and it was fallen into on 2026-09-01.** It catches
a script that CONVERTS existing lines. It does NOT catch a script that INSERTS
new lines with the wrong ending: both stat forms count the same added lines, so
they agree while the file quietly goes MIXED. `HANDOFF-PROMPT.md` went 640/0 to
640 CRLF + 41 LF with both stats identical. **Count the bytes on the file itself
after any scripted insert** — `raw.count(b"\r\n")` against `raw.count(b"\n")` —
and repair with `re.sub(rb"(?<!\r)\n", b"\r\n", raw)`. The Edit tool does not
have this problem; it preserves the surrounding endings. A patch script that writes `\n` into a CRLF file will either
match nothing or quietly convert the lines it touches.

**Heredocs in the Bash tool eat backslash escapes, backticks and the section
sign** — a `§` inside one comes through mangled and a patch script silently
fails to match. Use the Write tool for any patch script and run it with
`python <path>`, or use the Edit tool, which preserves surrounding endings.
Make the script ALL-OR-NOTHING: check every pattern matches exactly once before
writing anything, or a crash halfway leaves the tree half-patched.

Dev server, and it does not survive a restart:

  python tools/devserver.py 8777

Start by telling me what you'd do first and why.
