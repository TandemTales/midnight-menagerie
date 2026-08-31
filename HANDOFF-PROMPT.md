Midnight Menagerie — a cute-spooky deckbuilding roguelike (Three.js + plain ES
modules, no build step) at
C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━ START HERE, 2026-08-30 (evening) ━━ TEN REGIONS LEFT, AND A TEMPLATE ━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The owner asked for every remaining area. SEVEN of the seventeen regions now
ship rosters. Ten are left, and they are ordinary engineering: the design
chapters are written, the art, room names, blueprints and music already exist,
and this session established a template that three regions have now been built
against without a surprise in the last two.

    BUILT      foyer · nursery · sleeping-quarters · kitchens-cellars ·
               greenhouse · graveyard · heart
    LEFT       study-library · attic-observatory · lampworks · ballroom ·
               crypt · hedge-maze · secret-passages · bathhouse · kennels ·
               pumpkin-grounds

Build them IN THAT ORDER — it is `REGION_ORDER`'s order, and `RUN_REGIONS` in
`state/run.js` is the ladder the run actually walks. Adding a region is one
string in that array, in the right place, with `'heart'` staying last. The
Heart is the ENDING and must remain the final wing.

Budget one region per session. The Greenhouse and the Graveyard each took about
a third of this one, and the Graveyard's boss alone took four separate
measurements before it stopped being able to draw.

── THE TEMPLATE, IN ORDER ───────────────────────────────────────────────────

1. Read the whole design chapter first. `docs/design/regions/NN-name.md`.
   They run 900-1200 lines. Outline it with a heading grep, then read it whole.

2. Three files, copying the freshest worked examples:
     `data/enemies/<region>.js`        statuses + the ordinary roster
     `data/enemies/<region>-scares.js` the Big Scares
     `data/bosses/<boss>.js`           the boss and its parts
   The Graveyard is the newest and cleanest of the three built this session.

3. Wire FIVE places, and all five matter:
     `data/enemies/index.js`     imports, ALL, ENEMY_STATUSES, IMPLEMENTED_REGIONS
     `data/encounters.js`        the formation block, REGION_RULES, ALL_ENCOUNTERS
     `state/run.js`              RUN_REGIONS
     `tests/enemies/engine-audit.html`  a BATCH per Big Scare and boss — see below
     `tests/status-names/index.html`    a layer probe naming one of its statuses

4. `tests/<region>/check.py`, driving the REAL `CombatEngine`. Copy
   `tests/graveyard/check.py`. Every claim about a board two turns from now gets
   a CONTROL that runs the same board without the thing.

5. `python tools/shot.py <name> --scene combat --encounter <boss-id> --wait 5`
   and LOOK at it.

6. Run the battery. Commit with explicit paths and `git commit -F`.

── THE FOUR INSTRUMENTS, AND WHY EACH ONE EXISTS ────────────────────────────

`tests/enemies/run.py` is a STRUCTURAL checker with a mocked context. It stayed
green through every one of the bugs below. It cannot see them and it never will.

  * `tests/<region>/check.py` — the real engine. The Kitchens' Divide, Bake and
    Recipe summoned NOTHING on their first real run with the structural suite
    green throughout.
  * `tests/enemies/engine-audit.html` — ITS BATCH LIST IS HARDCODED. It stopped
    at region 3 and printed a healthy "2085 enemy turns audited" while the whole
    Kitchens had never had one intent checked. Extended, it immediately found 40
    lies. It is at 7530 turns and zero now. ADD YOUR REGION'S BATCHES.
  * A SCREENSHOT. It found the final boss pushed off the left edge of its own
    fight by a five-body row, and five House Rule cards burying the portrait.
    No suite measures how much of the screen a thing eats.
  * `tests/status-names/check.py` — add a layer probe naming one status id from
    the new region, or it goes quietly blind to it. It reported the same 268
    statuses across two entire regions of new ones.

**Check that each gate's NUMBER MOVED.** A count that did not change when
twenty-five enemies arrived is the finding.

── WHAT THE ENEMY CTX CAN DO, INCLUDING FIVE THINGS THAT ARE NEW ────────────

`data/enemies/_lib.js`'s header documents the surface. Added this session, all
mirrored in the mock and all gated:

    c.cardsIn(pile)        snapshots of a seat's hand/draw/discard
    c.moveCardTo(uid, pile, {top|bottom})
    c.playerDraw(n)
    c.schedule({turns, label, run, when})   a countdown the player can SEE
    c.adjustTimer / c.cancelTimer / c.timers()
    c.reveal(n)            show n more future intents (Epitaph Spirit)
    onPlayerReady(c)       a NEW def hook, the only moment an enemy can read
                           the hand the player is about to play with

FOUR SEAMS WERE DEAD WHEN THE HEART NEEDED THEM. All four had been declared for
months, two with comments asserting the engine read them:

    EnemyDef.damageTakenMul    the Sugar Golem's third layer was not a layer
    EnemyDef.isTargetable      the Wardrobe was never shut behind its Doors
    Hooks.removeByOwner        `addHook` said "removed with the enemy" and had
                               no callers at all
    data/keywords.js loader    imported `enemies/_lib.js` rather than the
                               registry, so two regions of statuses had no
                               keyword tooltips

── AND THE ONE THAT COST THE MOST ───────────────────────────────────────────

`tests/enemies/index.html` named its actors `id: def.id`. The ENGINE names them
`e0`, `e1`, `e2` and puts the definition's id on `defId`. So
`allies(c).find(a => a.id === 'the-wardrobe')` resolved in the harness and
returned null in every real fight — and FOUR multi-body enemies were written
against it. The Governess could never see her Doll, each Porcelain Twin believed
it was alone, a Hydra Head could not find its body, and the Wardrobe's
`doorsBroken` never left zero.

The first two were found and fixed one at a time, each with a comment naming the
trap, and the other two sat broken underneath them for months.
`tests/part-lookups/check.py` gates the class now, and the mock names actors the
way the engine does. **A mock that drifts does not merely test nothing — it
certifies the wrong code.**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read `HANDOFF.md` next — it opens with "Where it stands" and a numbered open
list. Then `CONTRACTS.md`, at 55 traps. Then, for context:

  docs/notes/2026-08-30-the-unreachable-sweep.md   111 findings, 24 verified
  docs/STEAM-DECK.md · docs/COMMERCIAL-USE.md
  docs/STS2-REFERENCE.md §8 — it carries its OWN "For us:" verdicts and nothing
  syncs them to HANDOFF's list.

STATE: branch `dev`, tree clean, **everything pushed** — `origin/dev` is at
`1c5a4c7`. Do not trust a hash written here; run
`git rev-list --count origin/dev..dev`. Pushing to origin/dev is authorised and
was exercised four times today.

Dev server, and it does not survive a restart:

  python tools/devserver.py 8777

━━ THE BATTERY ━━

ONE Playwright run at a time, always (CONTRACTS trap 7). Every number below was
RUN on 2026-08-30 after the Graveyard landed, not copied forward. If one
differs, that is the finding.

  python tests/cards/run.py               1470 cards, 0 errors, 0 warnings
  python tests/combat/run.py              694
  python tests/enemies/run.py             114 enemies, 0 errors
                                          (130 encounters, 39 statuses, 3 Tricks)
  python tests/enemies/audit.py           7530 turns, 0 errors  ← 2085 before
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
    tests/kitchens/check.py     16
    tests/greenhouse/check.py   33
    tests/graveyard/check.py    35
    tests/heart/check.py        41

  FOURTEEN GATES, each must stay at zero:
    tests/seams/check.py          6793 call sites, 0 problems
    tests/hook-names/check.py     110 declared, 0 unknown
    tests/bus-names/check.py      0 dead subscriptions
    tests/status-names/check.py   295 statuses, 0 unwaived collisions
    tests/part-lookups/check.py   0 actor lookups by def id      ← NEW
    tests/snapshot-cards/check.py 0 snapshot-as-runtime-card     ← NEW
    tests/party-tells/check.py    0 tells that address one Kid
    tests/licences/check.py       21 ok, 0 problems
    tests/audio/cues.py           46 cues, 1 known-silent
    dup-keys · scene-css · css-tokens · turn-events · stdlib-shadow

  fourteen effect-asserting Companion suites:
    boggle 31 · mopsy 28 · wisp 25 · crumbula 25 · hush 17 · wink 16
    truffle 27 · drizzle 70 · pudding 46 · mossbit 55 · brambleboo 52
    crinkle 44 · pipkin 18 · taffy 8      plus butler 38 · governess 56

  SIX co-op screens, all "0 failures, 0 console errors":
    selectscreen · hotseat · rooms · playthrough · lobby 20 · matedeck 11

━━ WHAT IS OPEN ━━

1. **THE DIFFICULTY CURVE FLATTENS AFTER THE NURSERY, and this is the best-
   evidenced balance finding available.** Measured over 50 seeded expeditions
   with a competent bot and real drafting:

       reach the Foyer          40 / 40 unaided
       reach the Nursery        16
       reach the Sleeping Q.    11
       reach the Kitchens       11
       reach the Greenhouse     11
       reach the Graveyard      11
       reach the Heart           9

   Sixteen runs become eleven at the Nursery boss, and then almost nothing dies
   for four whole wings. A deck that survives region two snowballs past
   everything until the Keeper. The later regions are not pricing the deck the
   player actually brings, and no win rate on any single fight shows it —
   `tests/run/run.py`'s "regions reached" table is the instrument.

2. **TWO BOSSES DRAW OR NEARLY DRAW, and both are authored for a longer run.**
   Same competent bot, same drafted deck, 170 Courage pool:

       the Butler            100% win   11 turns median   (authored band 8-12)
       the Confectioner       83%       26
       the Head Gardener      —         not yet measured this way
       the Groundskeeper      25%       29
       the Keeper              8%       36

   540 and 330 Courage are the design's numbers for the end of a SEVENTEEN-wing
   expedition. This ladder is seven wings long. **Do not fit these to a ladder
   that is about to grow by ten regions** — that is the curve-to-a-broken-
   instrument mistake CONTRACTS 47 is about. Measure again when the ladder is
   whole.

   Two expeditions in fifty still DRAW against the Groundskeeper.
   `tests/run/run.py` reports those under "BOSS DRAWS", named, with what was
   still standing. A draw against anything that is NOT a boss is a hard failure
   — an ordinary formation that cannot end is a bug in the enemy.

3. **Steam P2P is APPROVED and BLOCKED, and only Josh can unblock it.** It needs
   a Steam App ID, which needs a Steamworks partner account, a fee and a
   registered app. `net/transport.js` is ready — five members, two working
   implementations. It also ends the no-build rule. The Treehouse
   (`scenes/lobby.js`) works today over `ChannelTransport`: two tabs are two
   Sessions, two Runs and two boards from one seed. Steam is one constructor.

4. **The same-turn netcode race.** The cross-turn half is CLOSED. What remains
   is two seats acting at once with their inputs crossing; closing it needs
   ROLLBACK or a SEQUENCER, and the transport decides the latency budget that
   picks between them. Genuinely waits on item 3.

5. **ONE KID TAKES THE FIGHT AND THE REST WATCH.** `spreadOf` is 0 when one seat
   takes all the damage and 1 when it is shared: elite 2p 0.181 / 3p 0.163 /
   4p 0.259, standard 2p 0.144 / 3p 0.198 / 4p 0.278. Three Kids in four are
   spectators as far as incoming threat goes. It reframes AoE: its value here is
   PARTICIPATION, not difficulty. `spread` is in every ledger row and was never
   printed.

6. **The entry stall is REAL and the cause is found.** Six `toDataURL` calls,
   274 ms, from `cardart.js render()` line 352 — a synchronous PNG encode. Not
   JS, not shader linking, not texture upload. Pre-warming was tried and
   REJECTED. The fix is `toBlob` plus object URLs, scoped in
   `docs/notes/2026-08-30-the-card-art-hitch-is-real.md`. fps is CLOSED: eleven
   of eleven readings at 61.

7. **`combat:crit` is known-silent** and wiring it means designing critical hits,
   which nobody has asked for.

8. **`ANIMATED_EVENTS` is exported and read by nothing** (5 of its 23 events have
   no animator case), plus the other ~100 sweep findings. The sweep returned 111
   and its log claims all 111 survived the skeptics — that was an orchestration
   bug, not a result. 24 are verified; the other 87 are leads worth reading and
   not worth trusting unread.

9. **Enemy silhouettes for the three new regions are generic.** 39 new defs use
   silhouette keys `ui/enemy.js` does not know, so they render as coloured blobs
   with the right palette and the right motif. That is the documented fallback
   and nothing is broken; it is an art pass, not a bug.

━━ THINGS THAT WILL SAVE YOU A ROUND ━━

- **An intent may never lie.** `damage x hits` is the whole vocabulary, so a
  move that adds damage on one hit adds it to BOTH — the Whisk, Stay Where I
  Can See You and Rake the Floor all made that call. If a buff must be inside a
  number the player reads, it has to land BEFORE the intent is drawn:
  `onEnemyPhaseEnd` or `onPlayerReady`, never `onPlayerTurnEnd`. Three separate
  enemies got that wrong this session and the audit caught all three.
- **A COUNTDOWN IS NOT AN INTENT.** Scheduled damage (`c.schedule`, tagged
  `cause: 'timer'`) is excluded from the intent comparison and COUNTED
  SEPARATELY in the audit's report, because a labelled timer the player has
  watched tick for two turns is its own promise. Do not widen that exemption.
- **A fight that cannot END is a defect, and it is not the same as a hard
  fight.** It comes from an enemy whose Guard generation is unbounded and whose
  damage is fully blockable. Every boss in this game escalates for that reason.
- **ROOM inputs COMMUTE; COMBAT inputs do not.** Only `play` and `snack`
  reorder the board.
- **The route is VOTED.** Any harness that clicks a map node with a PARTY needs
  one vote per Kid with `.hoff__go` between them.
- Scripted edits: this repo is MIXED per file. Read with `newline=''`, convert
  to LF, patch, convert back, and check `git diff --stat`. **Heredocs in the
  Bash tool eat backslash escapes and backticks** — that cost four broken
  patches today. Write patch scripts with the Write tool and run them with
  `python <path>`, or use the Edit tool for anything with a template literal.

━━ NOT THE JOB ━━

- Do not tune the Keeper or the Groundskeeper to this ladder. See item 2.
- Do not change `PARTY_HP_SCALE`; it was re-measured on a repaired harness.
- Do not chase fps on this machine as it currently is.
- Do not re-open the card-art encoder question — pre-warming does not work.
- Do not re-wire audio's dead bus names. `scenes/combat.js` plays thirteen of
  those cues directly, timed to its FX.
- Do not redesign Crinkle — his chapter is accepted, checked against the build.
- Do not start Steam P2P until Josh has a Steam App ID.
- Do not tune the Butler or the Foyer elites by feel. Both have a committed
  before/after in `tests/critic-design/`.
- Do not build AoE for the ELITE tier. Measured: AoE is added damage a party
  then blocks, and only pierce is kept.

Start by telling me what you'd do first and why.
