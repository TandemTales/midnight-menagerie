Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ START HERE, 2026-08-31 ━━ ALL SEVENTEEN REGIONS ARE BUILT ━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The owner asked for every remaining area. There are none left. `RUN_REGIONS` in
`state/run.js` walks all seventeen, each with six ordinary enemies, three Big
Scares, a two-phase boss, fourteen Scuffles, its own statuses, its own
real-engine gate and two Keepsakes from its chapter's own list.

    foyer · nursery · sleeping-quarters · kitchens-cellars · greenhouse ·
    graveyard · study-library · attic-observatory · lampworks · ballroom ·
    crypt · hedge-maze · secret-passages · bathhouse · kennels ·
    pumpkin-grounds · heart

275 enemies, 310 encounters, 106 statuses, 24 status Tricks, 20530 audited
enemy turns at zero errors, 64/64 suites green. Every number in THE BATTERY
below was run on 2026-08-31 against this tree. None is copied forward.

**So the content job is done and the BALANCE job has not started.** Read item 1
under WHAT IS OPEN before doing anything else. It is not a small finding and it
is the natural next piece of work.

── WHAT I WOULD DO FIRST ────────────────────────────────────────────────────

Measure the ladder that now exists, then price it. `tests/run/run.py` already
prints the table and it says this:

    regions reached (of 50; every 5th run is shepherded)
      region                 unaided   shepherded
      1  foyer               40        10
      2  nursery             15        7
      3  sleeping-quarters   10        2
      4  kitchens-cellars    10        2
      5  greenhouse          10        2
      6  graveyard            9        2
      7  study-library        6        2
      8  attic-observatory    6        2
      9  lampworks            6        2
      10 ballroom             6        2
      11 crypt                6        2
      12 hedge-maze           6        2
      13 secret-passages      6        2
      14 bathhouse            6        2
      15 kennels              6        2
      16 pumpkin-grounds      6        2
      17 heart                6        2
      victories: 6/40 unaided, 2/10 shepherded

**TEN OF THE SEVENTEEN WINGS KILL NOBODY.** Everything that survives the Study
and Library wins the game. The Foyer alone ends 25 of 40 unaided runs; four more
die by the Graveyard; three at the Library; and then regions 8 through 17 —
ten wings, thirty Big Scares, ten bosses, a hundred and eighty enemies — take
nobody at all.

That is the same finding the previous handoff carried, and building nine more
regions has sharpened it from "the curve flattens" to something unambiguous:
the front of the run is the entire difficulty, and the back two thirds is a
victory lap. The regions are not mispriced against each other. They are
mispriced against THE DECK THAT ARRIVES — by region 8 the player has 30+ cards,
15 Keepsakes and a mean purse of 500, and nothing in the back half prices that.

The instrument to use is the one that found it: `tests/run/run.py`, 50 seeded
expeditions with a competent bot and real drafting. It is 4 minutes. Everything
it prints is a measurement, not an opinion.

**Do not fix this by nudging Courage numbers.** CONTRACTS 47 exists because of
exactly this temptation, and the honest options are structural: Haunt levels
that actually bite (the scaling hooks are written for all seventeen regions and
nothing exercises them above Haunt 0 in the run harness), a deck-size or
Keepsake pressure the back half applies, or a shorter authored expedition with
the rest as a longer mode. That is a design decision and it belongs to Josh.

── THE SECOND THING ─────────────────────────────────────────────────────────

**Four expeditions in fifty now DRAW.** It was two. `tests/run/run.py` names
them:

      The Groundskeeper of Names   200 turns, still standing at 203/350   ×3
      The Head Gardener            200 turns, still standing at 181/320   ×1

A draw is a fight neither side can finish inside the turn budget, and it is a
defect rather than a hard fight — it means an enemy's Guard generation is
unbounded against a deck whose damage is fully blockable. Every boss in this
game escalates for that reason and these two do not escalate enough. It is the
same measurement pass as item 1 and should be done in the same sitting.

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
a heal thirty-three times. It was then found by inspection in the Kennels (a
Leashed stack that would have turned a committed three-hit sweep into two) and
in the Pumpkin Grounds (a Loose Buckle worth +2 on a number already on screen).

**Settle at `onPlayerTurnStart` instead.** Measure the turn that just finished,
pay out, reopen the ledger — all before this turn's intents exist. The player
watches the meter move at the top of their own turn, which is when they are
reading the board anyway. `enemies/bathhouse.js`'s `settleLedger` is the shared
form and its comment is the long version.

The ONE exception in the whole codebase is the Scarecrow Sprout's delay in
`enemies/pumpkin-grounds.js`, and its comment says exactly why it is allowed:
it moves no number that has already been shown.

Three more, all violated at least once:

  * **A buff gained during the enemy phase cannot be in that turn's intent.**
    If an enemy hands an ALLY damage, mark the recipient during the enemy phase
    and GRANT it at `onPlayerTurnStart`. The Peephole's Told On, the Feeding
    Cart's Energy Treat and the Leash Hand's Pull Back all do this.
  * **`onPlayerTurnStart` fires BEFORE the hand is dealt.** `onPlayerReady`
    (step 6c) is after the deal and before the intents — the only hook that can
    both read the hand and be inside the number the player reads.
  * **Enemy Guard is wiped at the start of that enemy's own turn.** Guard
    granted from `onPlayerTurnEnd` is erased before it can stop anything.

A status decay bucket has the same trap in it. A player's `turnEnd` decay runs
BEFORE the enemy phase, so a status applied at turn start is gone by the time
anything can hit you for it — the Bathhouse's Wet promised 14 and delivered 10
until it moved to `enemyTurnEnd`, and the Secret Passages' Seen could never be
read by any committed intent at all.

USE `damageFn`/`blockFn`/`hitsFn` READING A COUNTER for anything that scales,
and write a COUNTER rather than a `mem` field when the player should see the
number move: writing a counter calls `refreshIntents`, writing `mem` does not.
The Crawlspace Thing's ambush was correct and invisible in `mem` for exactly
one commit.

── FIVE MORE DEAD SEAMS WERE FOUND THIS SESSION ─────────────────────────────

That makes TEN. A seam is dead when it is written, documented, and read by
nothing:

  * `drawCards` had `modifyDraw` and no way to react to WHICH cards arrived.
    `onCardsDrawn` now dispatches, and four separate pieces of content use it.
  * `boardEvent` only ever asked ENEMY defs, so a Keepsake with an
    `onBoardEvent` hook did nothing. The Bent Garden Fork had never fired once.
  * enemy death did not refresh intents. The `cardPlayed` refresh a few lines
    later covered it in ordinary play, which is exactly why nobody noticed:
    anything that killed outside a card left the promise wrong.
  * `hpBefore` went into the damage EVENT and not into the hook payload, so a
    hook could see how much damage landed and never how much Courage there was
    to land it on. Overkill was unmeasurable.
  * `tests/enemies/index.html` had no `engine.stats`, so `c.e.stats.*` threw in
    the harness and resolved perfectly against the real engine.

Earlier ones: `damageTakenMul`, `isTargetable`, `Hooks.removeByOwner`, the
`data/keywords.js` loader, and the hand. **Assume the next one exists.**

── AND TWO PRESENTATION LIMITS THAT ARE REAL ────────────────────────────────

  * **THREE HOUSE RULE CARDS FIT. THE FOURTH LANDS ON THE KID'S PORTRAIT.**
    One rule per fight-shaped thing, not one per body: parts say what they do in
    their `tell`, which is where a player looks when they hover the thing they
    are about to hit, and the body's rule names them all. Both the Kennels and
    the Pumpkin Grounds had to be cut back to this after a screenshot.
  * **SIX BODIES IS THE LAYOUT'S CEILING** and every count from 4 up needs its
    own rule in `scenes/combat.css`. `data/n="4"` goes the OPPOSITE way to 5 and
    6: those overflow and need the left padding removed, while four bodies FIT
    and merely start too far left, so that one pushes right. The comment in the
    CSS says so.

━━ THE INSTRUMENTS, AND WHY EACH ONE EXISTS ━━

`tests/enemies/run.py` is a STRUCTURAL checker with a mocked context. It stayed
green through every bug above. It cannot see them.

  * `tests/<region>/check.py` — the real engine, seventeen of them now. The
    only thing that finds an empty hand or a body that cannot be hurt.
  * `tests/enemies/audit.py` — ITS BATCH LIST IS HARDCODED in
    `tests/enemies/engine-audit.html`. It once stopped at region 3 and printed a
    healthy "2085 enemy turns audited" while the whole Kitchens had never had
    one intent checked. 20530 turns and zero now.
  * A SCREENSHOT. It found a final boss pushed off the left edge of its own
    fight, five House Rule cards burying the portrait, and a boss whose Courage
    bar sat behind the card hand.
  * `tests/status-names/check.py` — it catches display-name collisions, which
    are two chips reading the same word on one portrait meaning two things. It
    caught four this session.

**Check that each gate's NUMBER MOVED.** A count that did not change when
twenty-five enemies arrived is the finding.

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Every number was RUN on
2026-08-31 against commit `5cfadb5`. If one differs, that is the finding.

  python tests/cards/run.py               1470 cards, 0 errors, 0 warnings
  python tests/combat/run.py              694
  python tests/enemies/run.py             275 enemies, 0 errors
                                          (310 encounters, 106 statuses, 24 Tricks)
  python tests/enemies/audit.py           20530 turns, 0 errors
  python tests/run/run.py                 50 runs, 0 errors, 4 boss DRAWS  ← was 2
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
  python tests/platform/run.py            52
  python tests/gamepad/run.py             23
  python tests/steam-deck/run.py           6
  python tests/audio/run.py               46 cues, 0 errors  ← see the note below
  python tests/chrome/run.py              27
  python tests/cards-feel/run.py          exit 0
  python tests/critic-design/anchor.py    6/6 agree

  SEVENTEEN REAL-ENGINE REGION GATES — one per region:
    kitchens 16 · greenhouse 33 · graveyard 35 · study-library 50 ·
    attic-observatory 48 · lampworks 45 · ballroom 46 · crypt 41 ·
    hedge-maze 42 · secret-passages 74 · bathhouse 81 · kennels 69 ·
    pumpkin-grounds 70 · heart 41
  (foyer, nursery and sleeping-quarters predate the per-region gate and are
   covered by `tests/combat/run.py` and the companion suites. Writing gates for
   those three is a real and small piece of work.)

  FOURTEEN GATES, each must stay at zero:
    tests/seams/check.py          7883 call sites, 0 problems
    tests/hook-names/check.py     201 declared, 0 unknown
    tests/bus-names/check.py      0 dead subscriptions
    tests/status-names/check.py   362 statuses, 0 unwaived collisions
    tests/part-lookups/check.py   0 actor lookups by def id
    tests/snapshot-cards/check.py 0 snapshot-as-runtime-card
    tests/party-tells/check.py    0 tells that address one Kid
    tests/licences/check.py       21 ok, 0 problems
    tests/audio/cues.py           46 cues, 1 known-silent
    dup-keys · scene-css · css-tokens · turn-events · stdlib-shadow

  sixteen effect-asserting Companion suites:
    boggle 31 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 16
    truffle 27 · drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52
    crinkle 44 · pipkin 18 · taffy 8      plus butler 38 · governess 56

  SIX co-op screens (they live in `tests/coop/`, NOT `tests/playthrough*/`,
  which are interactive drivers and not pass/fail suites):
    selectscreen · hotseat · rooms · playthrough · lobby · matedeck

**`tests/audio/run.py` IS INTERMITTENT.** It reported "46 cues, 1 errors" on
roughly one run in six with no cue flagged in its own table, then went ten
consecutive runs clean while being chased. Nothing in this session touched
audio. It is recorded here as an open flake rather than as green — if it fails
for you, run it twice before believing it.

━━ WHAT IS OPEN ━━

1. **THE DIFFICULTY CURVE. TEN OF SEVENTEEN WINGS KILL NOBODY.** The table is at
   the top of this document. This is the biggest open thing in the project and
   the natural next piece of work. Measure with `tests/run/run.py`; do not fix
   it by nudging Courage numbers (CONTRACTS 47).

2. **FOUR BOSS DRAWS, up from two.** The Groundskeeper of Names three times and
   the Head Gardener once, all at 200 turns. Named in `tests/run/run.py`'s
   output with what was still standing. A draw against anything that is NOT a
   boss is a hard failure; against a boss it is a balance finding, and it is the
   same measurement pass as item 1.

3. **HAUNT SCALING IS WRITTEN FOR ALL SEVENTEEN REGIONS AND NOTHING EXERCISES
   IT.** Every def carries a `hauntScaling(level)` with real flags and notes up
   to Haunt 10, and `tests/haunt/run.py` checks the SHAPE of those objects
   rather than playing a fight at Haunt 6. It is the most likely place the
   answer to item 1 already lives.

4. **`bosses/keeper.js`'s Belonging can never fire.** "End the turn holding 2 or
   more and the Keeper gains 8 Guard", evaluated from `onPlayerTurnEnd`, where
   the hand has already been closed. Same class as the two Graveyard enemies
   fixed earlier; left alone because it makes a boss stronger and item 1 says
   not to tune anything by feel yet. Fix it as part of the measurement pass.

5. **Steam P2P is APPROVED and BLOCKED, and only Josh can unblock it.** It needs
   a Steam App ID, which needs a Steamworks partner account, a fee and a
   registered app. `net/transport.js` is ready — five members, two working
   implementations. It also ends the no-build rule. The Treehouse
   (`scenes/lobby.js`) works today over `ChannelTransport`.

6. **The same-turn netcode race.** The cross-turn half is CLOSED. What remains
   is two seats acting at once with their inputs crossing; closing it needs
   ROLLBACK or a SEQUENCER, and the transport decides which. Waits on item 5.

7. **ONE KID TAKES THE FIGHT AND THE REST WATCH.** `spreadOf` is 0 when one seat
   takes all the damage and 1 when it is shared: elite 2p 0.181 / 3p 0.163 /
   4p 0.259, standard 2p 0.144 / 3p 0.198 / 4p 0.278. It reframes AoE: its value
   here is PARTICIPATION, not difficulty. Nine new regions have not been
   measured this way.

8. **The entry stall is REAL and the cause is found.** Six `toDataURL` calls,
   274 ms, from `cardart.js render()` line 352 — a synchronous PNG encode. The
   fix is `toBlob` plus object URLs, scoped in
   `docs/notes/2026-08-30-the-card-art-hitch-is-real.md`. Pre-warming was tried
   and REJECTED. fps is CLOSED: eleven of eleven readings at 61.

9. **`combat:crit` is known-silent** and wiring it means designing critical hits,
   which nobody has asked for.

10. **ENEMY SILHOUETTES FOR THIRTEEN REGIONS ARE GENERIC.** Roughly 190 defs use
    silhouette keys `ui/enemy.js` has no prop layer for, so they render as
    coloured blobs with the right palette and the right MOTIF. That is the
    documented fallback and nothing is broken; it is the largest single art pass
    left in the project. Every new region got its MOTIF entries, so at least
    everything moves like what it is.

11. **`ANIMATED_EVENTS` is exported and read by nothing** (5 of its 23 events
    have no animator case), plus the other ~100 sweep findings in
    `docs/notes/2026-08-30-the-unreachable-sweep.md`. 24 are verified; the other
    87 are leads worth reading and not worth trusting unread.

12. **`tests/audio/run.py`'s intermittent failure.** See the note under THE
    BATTERY. Not caused by anything in this session and not chased to ground.

━━ THINGS THAT WILL SAVE YOU A ROUND ━━

- **An intent may never lie.** See the timing section above; it is the single
  richest source of bugs in this codebase and the audit is the only thing that
  finds them.
- **A COUNTDOWN IS NOT AN INTENT.** Scheduled damage (`c.schedule`, tagged
  `cause: 'timer'`) is excluded from the intent comparison and COUNTED
  SEPARATELY in the audit's report. Do not widen that exemption.
- **RETALIATION IS NOT AN INTENT EITHER**, and does not need to be — it lands
  during the PLAYER's turn in answer to a card. What it needs is to be READABLE
  BEFORE THE SWING, so every retaliation number in the Hedge Maze is a displayed
  counter with a House Rule beside it.
- **A fight that cannot END is a defect, and it is not the same as a hard
  fight.** It comes from an enemy whose Guard generation is unbounded and whose
  damage is fully blockable. See item 2.
- **`announceRule` is the only way to name a Trick on screen**, and it is also
  how you bury a portrait. Key every announcement `<kind>:<self.id>` so an enemy
  REPLACES its own card instead of adding a fourth.
- **THERE IS NO ENGINE SURFACE FOR AN ENEMY TO STOP THE FIGHT AND ASK A
  QUESTION.** The Ballroom settled what to do about that and four regions have
  used it since: an offer is a CARD in the player's hand, playing it is yes and
  letting it expire is no, and the terms are the card text. They live in
  `data/invitations.js`, which is whitelisted in `tests/seams/check.py` as card
  ctx — a card def inside `data/enemies/` is a file whose ownership cannot be
  read off its path.
- **`mem` IS JSON ROUND-TRIPPED.** Plain data only. A function stored there
  comes back as null on resume, and it took a boss crash to find that.
- **ROOM inputs COMMUTE; COMBAT inputs do not.** Only `play` and `snack`
  reorder the board.
- **The route is VOTED.** Any harness that clicks a map node with a PARTY needs
  one vote per Kid with `.hoff__go` between them.

━━ NOT THE JOB ━━

- Do not tune any boss to this ladder by feel. Measure first — item 1.
- Do not change `PARTY_HP_SCALE`; it was re-measured on a repaired harness.
- Do not chase fps on this machine as it currently is.
- Do not re-open the card-art encoder question — pre-warming does not work.
- Do not re-wire audio's dead bus names. `scenes/combat.js` plays thirteen of
  those cues directly, timed to its FX.
- Do not redesign Crinkle — his chapter is accepted, checked against the build,
  and the Study and Library implements it.
- Do not start Steam P2P until Josh has a Steam App ID.
- Do not tune the Butler or the Foyer elites by feel. Both have a committed
  before/after in `tests/critic-design/`.
- Do not build AoE for the ELITE tier. Measured: AoE is added damage a party
  then blocks, and only pierce is kept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read `HANDOFF.md` next — it opens with "Where it stands" and carries the long
version of everything above. Then `CONTRACTS.md`, at 55 traps. Then, for
context:

  docs/notes/2026-08-30-the-unreachable-sweep.md   111 findings, 24 verified
  docs/STEAM-DECK.md · docs/COMMERCIAL-USE.md
  docs/STS2-REFERENCE.md §8 — it carries its OWN "For us:" verdicts and nothing
  syncs them to HANDOFF's list.

STATE: branch `dev`, tree clean, committed and pushed at `5cfadb5`. Do not trust
a hash written here; run `git rev-list --count origin/dev..dev`. Pushing to
origin/dev is authorised and was exercised nine times across 2026-08-30 and 31.

**LINE ENDINGS ARE MIXED PER FILE AND BOTH KINDS ARE LOAD-BEARING.**
`combat/engine.js`, `combat/damage.js`, `_lib.js`, `encounters.js`,
`state/run.js`, `relics.js`, `combat.css`, `engine-audit.html` and both HANDOFF
files are CRLF; every region roster, every boss, `invitations.js`,
`enemies/index.js`, `ui/enemy.js`, `status-names/index.html` and every
`tests/<region>/check.py` is LF; `tests/enemies/index.html` is MIXED with
exactly three bare-LF lines. A scripted normalise-and-rewrite once turned two
Graveyard files into a 1819-line diff for 43 lines of change. Read with
`newline=''`, patch, write back the SAME bytes, and check `git diff --stat`
against `git diff --ignore-cr-at-eol --stat`.

**Heredocs in the Bash tool eat backslash escapes, backticks and the section
sign** — a `§` inside one comes through mangled and a patch script silently
fails to match. Use the Write tool for any patch script and run it with
`python <path>`, or use the Edit tool, which preserves surrounding endings.

Dev server, and it does not survive a restart:

  python tools/devserver.py 8777

Start by telling me what you'd do first and why.
