Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ START HERE, 2026-08-30 (late) ━━ NINE REGIONS LEFT, AND A TEMPLATE ━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The owner asked for every remaining area. EIGHT of the seventeen regions now
ship rosters. Nine are left, and they are ordinary engineering: the design
chapters are written, the art, room names, blueprints and music already exist,
and four regions have now been built against the template below without a
surprise in the last two.

    BUILT      foyer · nursery · sleeping-quarters · kitchens-cellars ·
               greenhouse · graveyard · study-library · heart
    LEFT       attic-observatory · lampworks · ballroom · crypt · hedge-maze ·
               secret-passages · bathhouse · kennels · pumpkin-grounds

Build them IN THAT ORDER — it is `REGION_ORDER`'s order, and `RUN_REGIONS` in
`state/run.js` is the ladder the run actually walks. Adding a region is one
string in that array, in the right place, with `'heart'` staying last. The
Heart is the ENDING and must remain the final wing.

Budget one region per session. The Study and Library took about a third of one,
and roughly half of that third went on ONE discovery — see THE HAND, below.

── THE TEMPLATE, IN ORDER ───────────────────────────────────────────────────

1. Read the whole design chapter first. `docs/design/regions/NN-name.md`.
   They run 900-1200 lines. Outline it with a heading grep, then read it whole.

2. Three files, copying the freshest worked examples:
     `data/enemies/<region>.js`        statuses + the ordinary roster
     `data/enemies/<region>-scares.js` the Big Scares
     `data/bosses/<boss>.js`           the boss and its parts
   The Study and Library is the newest and the one with the most comments about
   engine TIMING, which is where all four of this session's bugs lived.

3. Wire FIVE places, and all five matter:
     `data/enemies/index.js`     imports, ALL, ENEMY_STATUSES, IMPLEMENTED_REGIONS
     `data/encounters.js`        the formation block, REGION_RULES, ALL_ENCOUNTERS
     `state/run.js`              RUN_REGIONS
     `tests/enemies/engine-audit.html`  a BATCH per Big Scare and boss — see below
     `tests/status-names/index.html`    a layer probe naming one of its statuses
   And a SIXTH worth ten lines: `ui/enemy.js`'s `MOTIF` map. Unlisted
   silhouettes fall back to their body archetype, and half a roster is usually
   `sprawling`, which makes every one of them ripple. A paper knight that
   ripples reads as a rug.

4. `tests/<region>/check.py`, driving the REAL `CombatEngine`. Copy
   `tests/study-library/check.py`. Every claim about a board two turns from now
   gets a CONTROL that runs the same board without the thing.

5. `python tools/shot.py <name> --scene combat --encounter <boss-id> --wait 5`
   and LOOK at it. Then shoot the heaviest ordinary formation too.

6. Run the battery. Commit with explicit paths and `git commit -F`.

── THE HAND, AND WHY IT COST HALF A REGION ──────────────────────────────────

**THERE IS NO HAND DURING THE ENEMY PHASE.** The engine closes every seat's
hand at step 2 of `endTurn`, three steps before any enemy acts. Measured: at
the `enemy` phase the hand holds 0 cards and the discard holds all five.

So a MOVE EFFECT that reads `c.cardsIn('hand')` gets an empty array, takes its
guard clause, and does nothing. Silently. Forever. With `tests/enemies/run.py`
green throughout, because the mock hands out a hand at every moment of its
fake turn.

Six of the Library's moves were written that way. So were TWO THAT SHIPPED:
the Name Gnawer's Nibble the Name and the Mausoleum Mouth's Crypt Breath, both
in the Graveyard, both of which had marked NOTHING, ever. An enemy whose entire
authored mechanic is eating the names off your Tricks had never eaten one.

`_lib.js` now carries `whenHandArrives(c, fn)` and `runHandOps(c)`: a move
QUEUES its hand work and the def's `onPlayerReady` runs it against a real hand.
`tests/study-library/check.py` gates the class both ways — no def may queue
without declaring the hook, and no move effect may read the hand directly.

**`bosses/keeper.js`'s Belonging still has the bug** ("end the turn holding 2 or
more and the Keeper gains 8 Guard", from `onPlayerTurnEnd`, when the hand is
already closed). It is REPORTED, NOT FIXED: fixing it makes a boss that already
wins 8% stronger, and item 2 below says not to tune the Keeper.

── THE FOUR INSTRUMENTS, AND WHY EACH ONE EXISTS ────────────────────────────

`tests/enemies/run.py` is a STRUCTURAL checker with a mocked context. It stayed
green through every one of the bugs above and below. It cannot see them.

  * `tests/<region>/check.py` — the real engine. It is the only thing that
    found the empty hand, and the only thing that could have.
  * `tests/enemies/engine-audit.html` — ITS BATCH LIST IS HARDCODED. It once
    stopped at region 3 and printed a healthy "2085 enemy turns audited" while
    the whole Kitchens had never had one intent checked. It is at 8783 turns
    and zero now. ADD YOUR REGION'S BATCHES.
  * A SCREENSHOT. It found the final boss pushed off the left edge of its own
    fight, and five House Rule cards burying the portrait.
  * `tests/status-names/check.py` — add a layer probe naming one status id from
    the new region, or it goes quietly blind to it.

**Check that each gate's NUMBER MOVED.** A count that did not change when
twenty-five enemies arrived is the finding.

── INTENT TIMING, WHICH IS WHERE THE BUGS ARE ───────────────────────────────

Every enemy's move and its intent are chosen at PLAYER-TURN START (engine step
7, `refreshIntents('turnStart')`) and HELD until the move resolves. Four things
follow, and three of them were violated this session:

  * **A buff gained during the enemy phase cannot be in that turn's intent.**
    The Archivist's Offensive Works and the Living Index's Violence both
    sharpened an attack from the enemy's own `onTurnStart`, after the intent
    was committed. The audit caught it 80 times across four moves. Both process
    at `onPlayerReady` now.
  * **State recorded at `onPlayerTurnEnd` belongs to the NEXT turn's intent.**
    The Inkblot Oracle recorded its Reflection there and read it from
    `damageFn`, so it showed 5 and hit for 8. It is double-buffered now —
    `pending` at turn end, promoted at turn start — which is also exactly what
    the chapter's "next turn" says.
  * **`onPlayerTurnStart` fires BEFORE the hand is dealt.** `onPlayerReady`
    (step 6c) is after the deal and before the intents, which makes it the only
    hook that can both read the hand and be inside the number the player reads.
  * **Enemy Guard is wiped at the start of that enemy's own turn.** Guard
    granted from `onPlayerTurnEnd` is erased before it can stop anything — the
    Bookmark Imp's 7 Guard was. Pay it from `onTurnStart`, just after the wipe.

USE `damageFn`/`blockFn` READING A COUNTER for anything that scales. The
Groundskeeper's `punch()` is the pattern. A `modifyDamageDealt` status cannot
say "+4 to this move" honestly when the move is multi-hit — `damage x hits` is
the whole vocabulary, so +4 on a 4x3 becomes +12 — and cannot be gained by the
move that spends it.

── WHAT THE ENEMY CTX CAN DO ────────────────────────────────────────────────

`data/enemies/_lib.js`'s header documents the surface. Beyond the basics:

    c.cardsIn(pile)        snapshots of a seat's hand/draw/discard (uid, cost)
    c.moveCardTo(uid, pile, {top|bottom})     c.returnToHand(ref)
    c.playerDraw(n)        c.takeFromDraw(which)
    c.schedule({turns, label, run, when})   a countdown the player can SEE
    c.adjustTimer / c.cancelTimer / c.timers()
    c.reveal(n)            show n more future intents
    c.announceRule(rule)   the ONLY surface that can name a Trick on screen
    whenHandArrives / runHandOps            see THE HAND above
    onPlayerReady(c)       the only moment an enemy can read the hand

`playCard` records the PRINTED cost of each Trick on `cardsPlayedThisTurn`
(added this session for the Inkblot Oracle: it echoes "the highest printed
Nerve cost Trick played", and the effective cost would let a Quill Clerk's
Correction inflate the echo into a number the player cannot derive).

FIVE SEAMS HAVE BEEN FOUND DEAD SO FAR — `damageTakenMul`, `isTargetable`,
`Hooks.removeByOwner`, the `data/keywords.js` loader, and the hand. Assume the
next one exists. **A mock that drifts does not merely test nothing — it
certifies the wrong code.**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read `HANDOFF.md` next — it opens with "Where it stands" and a numbered open
list. Then `CONTRACTS.md`, at 55 traps. Then, for context:

  docs/notes/2026-08-30-the-unreachable-sweep.md   111 findings, 24 verified
  docs/STEAM-DECK.md · docs/COMMERCIAL-USE.md
  docs/STS2-REFERENCE.md §8 — it carries its OWN "For us:" verdicts and nothing
  syncs them to HANDOFF's list.

STATE: branch `dev`, tree clean, committed at `6190e13`. Do not trust a hash
written here; run `git rev-list --count origin/dev..dev`. Pushing to origin/dev
is authorised and was exercised four times on 2026-08-30.

**LINE ENDINGS ARE MIXED PER FILE AND BOTH KINDS ARE LOAD-BEARING.**
`combat/engine.js` and `_lib.js` are CRLF; every region roster, every boss and
every `tests/<region>/check.py` is LF; `tests/enemies/index.html` is MIXED with
exactly three bare-LF lines. A scripted normalise-and-rewrite turned two
Graveyard files into a 1819-line diff for 43 lines of change. Read with
`newline=''`, patch, write back the SAME bytes, and check `git diff --stat`
against `git diff --ignore-cr-at-eol --stat`. **Heredocs in the Bash tool eat
backslash escapes and backticks** — use the Write tool and run with `python`,
or the Edit tool, which preserves surrounding endings.

Dev server, and it does not survive a restart:

  python tools/devserver.py 8777

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Every number below was
RUN on 2026-08-30 after the Study and Library landed, not copied forward. If
one differs, that is the finding.

  python tests/cards/run.py               1470 cards, 0 errors, 0 warnings
  python tests/combat/run.py              694
  python tests/enemies/run.py             124 enemies, 0 errors
                                          (148 encounters, 43 statuses, 3 Tricks)
  python tests/enemies/audit.py           8783 turns, 0 errors  ← 7530 before
  python tests/run/run.py                 50 runs, 0 errors, 2 boss DRAWS
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
  python tests/audio/run.py               46 cues, 0 errors
  python tests/chrome/run.py              27
  python tests/cards-feel/run.py          exit 0
  python tests/critic-design/anchor.py    6/6 agree

  REAL-ENGINE REGION GATES — one per region, and each region needs its own:
    tests/kitchens/check.py        16
    tests/greenhouse/check.py      33
    tests/graveyard/check.py       35
    tests/study-library/check.py   50      ← NEW
    tests/heart/check.py           41

  FOURTEEN GATES, each must stay at zero:
    tests/seams/check.py          6869 call sites, 0 problems
    tests/hook-names/check.py     114 declared, 0 unknown
    tests/bus-names/check.py      0 dead subscriptions
    tests/status-names/check.py   299 statuses, 0 unwaived collisions
    tests/part-lookups/check.py   0 actor lookups by def id
    tests/snapshot-cards/check.py 0 snapshot-as-runtime-card
    tests/party-tells/check.py    0 tells that address one Kid
    tests/licences/check.py       21 ok, 0 problems
    tests/audio/cues.py           46 cues, 1 known-silent
    dup-keys · scene-css · css-tokens · turn-events · stdlib-shadow

  fourteen effect-asserting Companion suites:
    boggle 31 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 16
    truffle 27 · drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52
    crinkle 44 · pipkin 18 · taffy 8      plus butler 38 · governess 56

  SIX co-op screens (they live in `tests/coop/`, NOT `tests/playthrough*/`,
  which are interactive drivers and not pass/fail suites):
    python tests/coop/selectscreen.py     0 failures, 0 console errors
    python tests/coop/hotseat.py          0 failures
    python tests/coop/rooms.py            0 failures
    python tests/coop/playthrough.py      5 handoffs
    python tests/coop/lobby.py            20 passed
    python tests/coop/matedeck.py         11 passed

━━ WHAT IS OPEN ━━

1. **THE DIFFICULTY CURVE STILL FLATTENS AFTER THE NURSERY, and the Library is
   the first wing since region 2 to change that.** 50 seeded expeditions,
   competent bot, real drafting (`tests/run/run.py` prints this table):

       region                 unaided   shepherded
       1 foyer                40        10
       2 nursery              16        7
       3 sleeping-quarters    11        3
       4 kitchens-cellars     11        3
       5 greenhouse           11        3
       6 graveyard            11        3
       7 study-library        9         3      ← the first attrition since 2
       8 heart                9         3
       victories: 9/40 unaided, 3/10 shepherded

   Sixteen runs become eleven at the Nursery boss; four whole wings then kill
   nobody; the Library takes two. **Everyone who reaches the Heart still wins**,
   which is the sharper half of this finding — the Keeper wins 8% in isolation
   (item 2) and 0% against the deck that actually arrives. The later regions are
   not pricing the deck the player brings.

2. **TWO BOSSES DRAW OR NEARLY DRAW, and both are authored for a longer run.**
   Same competent bot, 170 Courage pool:

       the Butler            100% win   11 turns median   (authored band 8-12)
       the Confectioner       83%       26
       the Head Gardener      —         not yet measured this way
       the Groundskeeper      25%       29
       the Archivist          —         not yet measured this way
       the Keeper              8%       36

   540 and 330 Courage are the design's numbers for the end of a SEVENTEEN-wing
   expedition. This ladder is eight wings long. **Do not fit these to a ladder
   that is about to grow by nine regions** — CONTRACTS 47. Measure again when
   the ladder is whole.

   Two expeditions in fifty still DRAW against the Groundskeeper.
   `tests/run/run.py` reports those under "BOSS DRAWS", named, with what was
   still standing. A draw against anything that is NOT a boss is a hard failure.

3. **`bosses/keeper.js`'s Belonging can never fire.** "End the turn holding 2 or
   more and the Keeper gains 8 Guard", evaluated from `onPlayerTurnEnd`, where
   the hand has already been closed. Same class as the two Graveyard enemies
   fixed this session; left alone because it makes an 8%-win boss stronger and
   item 2 says not to tune the Keeper. Fix it as part of a measurement pass.

4. **Steam P2P is APPROVED and BLOCKED, and only Josh can unblock it.** It needs
   a Steam App ID, which needs a Steamworks partner account, a fee and a
   registered app. `net/transport.js` is ready — five members, two working
   implementations. It also ends the no-build rule. The Treehouse
   (`scenes/lobby.js`) works today over `ChannelTransport`.

5. **The same-turn netcode race.** The cross-turn half is CLOSED. What remains
   is two seats acting at once with their inputs crossing; closing it needs
   ROLLBACK or a SEQUENCER, and the transport decides which. Waits on item 4.

6. **ONE KID TAKES THE FIGHT AND THE REST WATCH.** `spreadOf` is 0 when one seat
   takes all the damage and 1 when it is shared: elite 2p 0.181 / 3p 0.163 /
   4p 0.259, standard 2p 0.144 / 3p 0.198 / 4p 0.278. It reframes AoE: its value
   here is PARTICIPATION, not difficulty.

7. **The entry stall is REAL and the cause is found.** Six `toDataURL` calls,
   274 ms, from `cardart.js render()` line 352 — a synchronous PNG encode. The
   fix is `toBlob` plus object URLs, scoped in
   `docs/notes/2026-08-30-the-card-art-hitch-is-real.md`. Pre-warming was tried
   and REJECTED. fps is CLOSED: eleven of eleven readings at 61.

8. **`combat:crit` is known-silent** and wiring it means designing critical hits,
   which nobody has asked for.

9. **`ANIMATED_EVENTS` is exported and read by nothing** (5 of its 23 events have
   no animator case), plus the other ~100 sweep findings. 24 are verified; the
   other 87 are leads worth reading and not worth trusting unread.

10. **Enemy silhouettes for the four new regions are generic.** 49 defs use
    silhouette keys `ui/enemy.js` has no prop layer for, so they render as
    coloured blobs with the right palette and motif. That is the documented
    fallback and nothing is broken; it is an art pass, not a bug. The Library's
    ten now have MOTIFs, so at least they move like what they are.

━━ THINGS THAT WILL SAVE YOU A ROUND ━━

- **An intent may never lie.** See INTENT TIMING above; it is the single richest
  source of bugs in this codebase and the audit is the only thing that finds them.
- **A COUNTDOWN IS NOT AN INTENT.** Scheduled damage (`c.schedule`, tagged
  `cause: 'timer'`) is excluded from the intent comparison and COUNTED
  SEPARATELY in the audit's report. Do not widen that exemption.
- **A fight that cannot END is a defect, and it is not the same as a hard
  fight.** It comes from an enemy whose Guard generation is unbounded and whose
  damage is fully blockable. Every boss in this game escalates for that reason.
- **`announceRule` is the only way to name a Trick on screen**, and it is also
  how you bury a portrait. Key every announcement `<kind>:<self.id>` so an
  enemy REPLACES its own card instead of adding a sixth; the Library asserts
  `maxRules <= 4` in its own gate because it marks Tricks constantly.
- **ROOM inputs COMMUTE; COMBAT inputs do not.** Only `play` and `snack`
  reorder the board.
- **The route is VOTED.** Any harness that clicks a map node with a PARTY needs
  one vote per Kid with `.hoff__go` between them.

━━ NOT THE JOB ━━

- Do not tune the Keeper, the Groundskeeper or the Archivist to this ladder.
- Do not change `PARTY_HP_SCALE`; it was re-measured on a repaired harness.
- Do not chase fps on this machine as it currently is.
- Do not re-open the card-art encoder question — pre-warming does not work.
- Do not re-wire audio's dead bus names. `scenes/combat.js` plays thirteen of
  those cues directly, timed to its FX.
- Do not redesign Crinkle — his chapter is accepted, checked against the build.
  (The Library is HIS region, and §33-§34 of its chapter are implemented:
  Catalogue type is read at the moment a Trick RESOLVES, so a transformed
  Trick files as what it became.)
- Do not start Steam P2P until Josh has a Steam App ID.
- Do not tune the Butler or the Foyer elites by feel. Both have a committed
  before/after in `tests/critic-design/`.
- Do not build AoE for the ELITE tier. Measured: AoE is added damage a party
  then blocks, and only pierce is kept.

Start by telling me what you'd do first and why.
