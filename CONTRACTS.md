# Midnight Menagerie — build contracts

Read this before touching anything. Many agents work on this repo in parallel.
Violating file ownership destroys other agents' work.

## Run it

Dev server is already running: **http://localhost:8777/game/index.html**
It sends `no-store`, so a plain reload always shows your current code. If it is down:

```bash
python tools/devserver.py 8777
```

Deep-link straight to a screen: `#scene=combat&seed=42&companion=marmalade`
Debug handle in the page: `window.MM` → `{ ctx, bus, clock, Save, goto(scene, params), state() }`

## Non-negotiables

1. **No build step.** Plain ES modules. `three` and `three/addons/` resolve via the
   import map in `game/index.html`. Never add a bundler, npm, or a CDN `<script src>`
   (CSP + offline). New third-party code must be vendored into `game/vendor/`.
2. **All colour, type, spacing, and motion constants come from `game/src/ui/tokens.css`.**
   No hex literals in component CSS. If you need a new token, add it there and say so
   in your report. JS that needs a token reads it via `getComputedStyle`.
3. **60 fps at 1920x1080 is a hard requirement.** No per-frame allocation in hot paths,
   no layout thrash, no `innerHTML` inside the frame loop.
4. **Determinism.** Every random draw goes through `ctx.run.rng` (`core/rng.js`).
   Never call `Math.random()` in game logic. A seed must reproduce a run exactly.
5. **Combat rules live only in `src/combat/`** and must run headless (no DOM, no THREE).
   `src/scenes/combat.js` renders what the engine reports; it never decides rules.
6. **Accessibility.** Keyboard path for every action. Respect
   `Save.settings.reduceMotion`, `screenShake`, `flashes`, `largeText`, `colorblind`.
7. **Never leak listeners.** `Scene.exit()` must remove everything it added.
8. **Optional chaining is for genuinely optional systems only.** Earlier guidance to "guard
   cross-system calls with `?.`" was too broad and it cost us real bugs: Marmalade's signature
   keyword called `ctx.loseHp?.()`, the hook payload never provided `loseHp`, and Haunt silently
   dealt zero damage for the entire build. "Ignores Guard" passed `{pierceBlock:true}` while the
   damage pipeline read `pierce || ignoreBlock`, so it never ignored Guard.

   The rule now:
   - `?.` is allowed for **presentation niceties** whose absence is harmless: `ctx.audio?.play`,
     `ctx.atmosphere?.impact`, `ctx.tooltip?.show`.
   - `?.` is **forbidden on contract APIs** — anything in `combat/engine.js`, the `ctx` helper
     surface, `state/run.js`, or a documented module API. Call them directly. If the method is
     missing you want a loud `TypeError` in a test, not a silent no-op in someone's run.
   - If you must call something that may legitimately not exist yet, assert it at module load:
     `assertApi(ctx, ['damage','block','loseHp'])` — fail at boot, not at the moment it matters.
9. **Test across the seam, not just inside your module.** Every module in this build passed its
   own harness while silently no-opping at the join. A test that mocks the thing it is testing
   proves nothing — an enemy suite whose mock implemented multi-hit hid a bug where every
   multi-hit attack dealt damage `hits²` times. If your module calls another module's API, your
   tests must exercise it against the **real** implementation at least once.
8. Design source of truth: `docs/design/`. Read only the files you need — the full
   design doc is 1.6M characters. Deviating from the doc is allowed only when the doc
   is silent or when a rule actively harms play; say so explicitly in your report.

## Traps this codebase has already fallen into

Each of these cost a round to diagnose. They are written down so they cost nobody another one.

1. **A backtick inside a template literal takes the whole app down.** Twice now, an HTML comment
   written inside a `` const X = `…` `` block contained a backtick (e.g. referring to `` `setRule` ``)
   and silently ended the template. Chrome reports the syntax error *hundreds of lines* from the
   cause, and because `main.js` statically imports the scenes, `window.MM` never exists and every
   screen is blank. If the app is dead with a weird parse error, grep your recent diff for
   backticks inside template literals first.
2. **`gl.finish()` is not a fence under ANGLE.** It reported 0.217 ms for a frame that timer
   queries measured at 24.1 ms. Use `EXT_disjoint_timer_query_webgl2`, or rAF for closed loops.
3. **`page.evaluate` awaits a returned promise.** Kicking off an animation with `--script` or a
   `jsawait:` step means every later frame in a motion strip lands on the end state — which reads
   as "the animation is instant" and has already fooled a reviewer. `tools/shot.py` has a
   fire-and-forget `js:` step for this.
4. **`Scene.enter()` is awaited before the transition veil lifts.** Anything you await there
   happens behind a black screen. Combat awaited its whole opening and cost 1.8s of black.
5. **A mock that implements the mechanic it is testing proves nothing.** An enemy suite whose mock
   applied multi-hit itself hid a bug where every multi-hit attack dealt `hits²` damage — and the
   suite was green. Test against the real implementation at least once (rule 9).
5b. **A duplicate key in an object literal silently wins, and a def method with no caller
   is not a mechanic.** `butler.js` declared `onTurnEnd` twice and lost the half that
   expires Discomposed; the Governess's `redirect()`, her `advancePatch()` and the
   Bedframe Beast's `modifyIncoming()` were finished-looking def methods that nothing in
   the engine ever called, so two bosses shipped without the defensive mechanic their
   whole fight is built on. `tests/dup-keys/check.py` gates the first. For the second:
   when you add a method to a def, grep for its caller before you call it done.
5c. **A GATE can be a def method with no caller too.** `tests/seams/check.py`
   located each API's body as `src.index("{", m.end())` — the first brace after
   the signature. Every API it guards ends its parameter list with a DEFAULT of
   `{}` (`addCard(def, pile = Pile.HAND, opts = {})`), so that brace was the
   default, the extracted "body" was the two characters `{}`, the allowed-key
   set came back EMPTY, and `if not allowed: continue` skipped the API in
   silence — while the run printed `3829 call sites checked, 0 problems`. Four
   of its five option-key APIs were unchecked from the day it was written; only
   the damage family, built by a separate regex, was ever really examined.

   **A gate that reports a large confident number is not evidence it looked at
   anything.** The control that matters is not "does it pass" but "does it
   FAIL when I break something": injecting one bogus option key gives
   `UNKNOWN-OPTION (1)` on the repaired gate and `0 problems` on the old one.
   Run that control whenever a checker's scope is in doubt.

   Repairing it found three real reports immediately, and one of them opened
   trap 5b's fourth and fifth instances — see `engine.boardEvent()`.

6. **`--wait 4.5` can catch the map mid-draw.** Its entrance sweep runs ~800 ms; use `--wait 9`.
   **Superseded 2026-08-29 — see trap 43.** A bigger number was the wrong
   treatment: `--wait` now waits for the stage to finish warming FIRST, so it is
   a settle rather than a race, and small values are correct again.
7. **fps collapses when two Playwright runs overlap on this machine.** Re-measure in isolation
   before believing a low number. `tools/shot.py` prints the GL renderer so you can also confirm
   you are on the real GPU and not a software rasteriser.

8. **A `fetch()` that 404s is a console error, even if you handle it.** Playwright's
   `page.on("console")` reports "Failed to load resource: 404" as type `error` for a GET *or* a
   HEAD, so any probe-until-404 asset discovery trips the zero-console-errors gate on every load.
   Ship a generated manifest instead. Measured while building soundtrack discovery; applies to
   any future asset-discovery work here.
9. **`turn:start` and `turn:end` fire for EVERY ENEMY too, not just the player.**
   Every Companion tracker in this build listened to the raw event, so with two enemies on
   the board each one ran three times a round. Marmalade's Untouched was decided by whichever
   enemy swung LAST — take 9 from the first and have the second merely block, and you were
   still "Untouched"; the archetype did nothing in any fight with more than one enemy. Bones'
   Buried countdown, Pipkin's Patch growth and Taffy's Stretch all ticked at ~3x. No console
   error, no failing test, no symptom except wrong numbers. Use
   `U.onPlayerTurn(e, 'start'|'end', fn, seat)`. Gated by `tests/turn-events/check.py`.

10. **A hook registered under a name nothing dispatches is completely silent.** The card
   plays, the events come out, the suite goes green, and the effect never happens — rule 8's
   shape with a hook name instead of a `?.`. Four cards shipped or nearly shipped this way,
   including `bones/tail-a-mile-a-minute`, a Rare Power whose whole implementation was an
   EMPTY handler on `'retrieved'`, a hook that does not exist. There are two registries:
   engine hooks (`engine.hooks.add`) must match a `hooks.dispatch/reduce/any` name; companion
   hooks (`U.onHook`) must match a `U.fire` name. Gated by `tests/hook-names/check.py`.

   **THERE IS A THIRD REGISTRY, and it went ungated until 2026-08-29: the
   BUS.** `ui/tooltip.js` subscribed to `scene:enter` and `scene:exit`;
   `core/scenes.js` emits `scene:leaving` and `scene:entered`. Neither
   subscribed name is emitted anywhere in the repo, so the shared tooltip's
   ONLY cross-scene teardown had never once run — and the panel lives in
   `#tooltip-layer`, a sibling of `#dom-layer`, so it is not carried away with
   the scene root either. `ui/hud.js` carried the same dead name.

   A mouse player was covered by accident (the capturing `pointerdown` hides
   it, and any click that navigates is a pointerdown). A keyboard player was
   not: `focusin` opens the panel at zero delay and removing a focused element
   fires no `focusout`, so Tab to a HUD chip on the map, press Enter, and the
   tooltip sits over the combat board until the next pointer move.

   Gated by `tests/bus-names/check.py`. Its fatal half is literal
   `bus.on('x')` with no emitter; names reached through a variable are
   reported as ADVISORY and never fail, because a checker that fails on a
   guess trains people to ignore it.

11. **Read the event payload before reading a field off it.** `card:play` carries `card`,
   `actorId` and `seat` — there is no `ev.type`. `onIncomingHit` carries `defender`, not
   `actor`. Both mistakes are silent: the listener runs and returns early forever.

12. **A card that "resolves without throwing" is not a card that works.** A smoke test that
   plays every card and checks for exceptions passed all four dead cards above. Assert the
   EFFECT — the teammate's Guard went up, the enemy got Webbed — or you have tested nothing.

13. **Two Claude SESSIONS in one repo destroy each other's work, not just two agents.** Trap
   9 below is about agents inside one session; on 2026-08-26 a second interactive session
   committed while this one was mid-edit and swallowed two in-flight files. Run `ListAgents`
   and check for a live peer before committing. Measurements are worse: half a run's samples
   were of different code than the other half, and the A/B silently became meaningless.

14. **An A/B across two filesystems is not an A/B.** Comparing the OneDrive working tree
   against a git worktree on local Temp reported a 330 ms "win" for byte-identical code. Both
   sides must sit on the same disk, and an identical-code control must run alongside the real
   comparison every time.

16. **A played Trick is already in LIMBO, so moving it there from inside the effect
   does nothing.** The engine pulls a Trick into `Pile.LIMBO` while it resolves and,
   the moment the effect returns, checks whether it is still there and pushes it to
   the discard pile. So `U.moveCard(c, c.card, 'limbo', …)` inside an effect is a
   no-op the engine immediately undoes. **Wink's Sets shipped this way** — a Set is
   specified as "placed face up outside your deck" and the card was sitting in the
   discard pile, reshufflable and replayable while the Set was still armed. Wisp's
   Linger had it too. Finish the move on `card:resolved`, which is emitted after the
   engine's own placement. Gated by `tests/wink/run.py` and `tests/wisp/run.py`.

17. **`Pile.STASH` is PLAYABLE.** `canPlay` accepts hand and stash, because the zone
   exists for Hush's Shadow Pocket — a second hand you play out of. Mopsy's Torn pile
   reuses the same pile for the OPPOSITE purpose, so every Trick she Tore was still
   fully playable out of the Torn pile until it was flagged `unplayable`. If you put
   cards somewhere they are not meant to come back from, say so explicitly.

18. **A tracker's `seat` is an ACTOR; `ev.seat` is a NUMBER.** `installTrackers` passes
   the seat's actor as the third argument, the way `U.onPlayerTurn` takes it. A
   listener written `if (ev.seat !== seat) return;` is therefore never equal and
   returns on its first line, every time, in silence. **Every Mopsy Patch was inert
   this way**, and Boggle's "playable only if you have played no Attack this turn" was
   permanently true. Compare `ev.actorId` against `seat.id`.

19. **`card:play` carries a SNAPSHOT in `ev.card`.** Anything you stored on the runtime
   card — flags, counters, Patches — is not on it. Look the card up with
   `e.card(ev.cardUid)`. This is trap 11 wearing a different hat.

20. **`U.addRes`'s `min`/`max` are ignored for counter-backed resources.** When the
   resource has an engine counter track, the whole delta goes to `addCounter` and only
   the counter's OWN declared max applies. Boggle's Lurk reached 6 against a cap of 5.
   If the effective cap can move during a fight, declare the counter at the HIGHER
   value and clamp at the call site.

21. **The Nerve refill SETS Nerve, so nothing can spend it beforehand.** `turn:start`
   is emitted before the refill; `onTurnStart` status hooks also run before it; and
   `_dealSeatTurn` then calls `setEnergy(energyMax)`. Crumbula's Queasy was wiped by
   this three times over. A status that means "start your turn with less Nerve"
   declares `StatusDef.energyDelta`, the twin of the existing `drawDelta`.

22. **A counter's band label is DECLARED, not parsed.** `defineCounter` takes
   `states: [{at|from|to, label}]`. Before this round the renderer regexed the counter's
   own description instead, and printed **STARTS** on Crumbula's gauge because his
   description begins "Starts at 2". Declare the bands; the regex survives only as a
   fallback for counters that predate them.

23. **A test that names a slug goes stale the moment that Companion is built.**
   `tests/backpack` used 'mopsy', then 'wink', then 'hush' as its example of an unbuilt
   Companion, and broke each time. Derive the built and unbuilt sets from the registry.

24. **`turn:start` fires BEFORE Guard is wiped and BEFORE Nerve is refilled, so
   anything banked "for next turn" is deleted seconds later.** The order in
   `_startPlayerTurn` is: emit `turn:start` → `_openSeatTurn` wipes Guard →
   timers tick → `_dealSeatTurn` deals the hand and SETS Nerve to maximum. A
   turn-start listener handing out Guard is undone by the wipe; one handing out
   Nerve is undone by the refill. **Truffle shipped FIVE cards on that path** —
   Hard to Finish, Refuse to Stay Down, Carpet Check, Sweep the Floor, Still
   Wiggling — all delivering nothing, in silence, with a green suite. Measured,
   not argued: 40 banked Guard arrives as 0.
   Use `U.guardNextTurn(c, n)` (a scheduled `playerTurnStart` timer, which ticks
   after the wipe) and `U.energyNextTurn(c, n)` (`ctx.bankEnergy`, which rides
   the refill itself — a timer is not enough). And if you need the moment the
   turn has ACTUALLY opened, with the hand dealt, listen for
   `phase: 'playerReady'`.

25. **`costMod` on a CardDef is read by nothing.** Two Drizzle cards were written
   with it and would have been silently uncosted. The engine's one
   conditional-cost seam is `CardDef.dynamicCost(ctx)`, which computes the
   PRINTED cost and still lets discounts compose on top (`costOf` step 1).

26. **The `damage` event carries `sourceId` and `targetId`, NOT `attacker` and
   `defender`.** Those names belong to the `onCourageLoss` / `onIncomingHit`
   HOOK payloads, which is what makes the mistake so easy. Two listeners were
   written the wrong way in one session; `tests/seams/check.py` caught both, and
   it is the reason that gate exists.

27. **A counter's DECLARED max is what the HUD prints, so trap 20 has a cost.**
   Declaring a track at its highest reachable value stops gains being lost and
   shows the player a ceiling they do not have: "LURK 0/7" against a real cap of
   5, "FORECAST 0/5" against 3, "LOYALTY 0/8" against 5. Declare it at the REAL
   current cap and have the Power that widens it **redefine** the counter,
   passing the banked value as `start`. Every suite is green while that is on
   screen; only a screenshot finds it.

28. **Keyword ids are GLOBAL while Companions are not.** By the sixteenth
   Companion there were real collisions: Mossbit's chapter calls its mechanics
   "Weather" and "Bury", both already taken by Drizzle and Pudding, so `[Bury]`
   on a Mossbit card would have opened Pudding's tooltip. Check
   `companions/keywords.js` before naming one, and prefer folding related verbs
   into one good entry (Mossbit's Advance / Delay / Erase all live inside
   `[Epitaph]`) over minting three thin ones.

29. **An event a consumer has to filter on must CARRY the field.** `piles.js`
   emitted `draw`, `discard`, `shuffle`, `card:move` and `hand:full` with no
   owner, though `Piles` has known its seat since it stopped being a singleton.
   `scenes/combat.js` renders one seat's view and consumed all of them, so a
   four-Kid fight opened with the local Kid's fan holding cards belonging to
   three different seats. Invisible at two seats. They carry `seatId` now. This
   is rule 8's shape with a missing field instead of a `?.`.

30. **A card's `uid` is NOT a network identity.** Uids come from a counter that
   runs per PAGE, not per game: two clients building their own engine from the
   same seed produce the same cards in the same order with different uids. A
   uid on the wire looks correct and makes the remote client silently fail to
   find the card. Use `cardRef` / `refCard` from `net/session.js`, which name a
   card by `{ seat, pile, index }`.

31. **`CardView.get nums` used to return `def.nums` BY REFERENCE.** Anything that
   "updated a card's numbers" by mutating what it returned was editing the
   shared definition and changing every copy of that Trick in the game. It
   returns a copy now and honours `state.nums`; use `setBaseNumbers(nums)`.
   Its `setState({ nums })` branch had been dead since it was written, for the
   same reason — it re-rendered and then read the def again.

32. **A measurement harness is CODE, and nobody had ever measured it.** Three
   separate defects in `tests/coop/balance.html` + `lib/bot.js` meant the co-op
   Courage curve — recorded here and in HANDOFF as "MEASURED, not quoted" — was
   measured against a game that does not exist:

   - **Two enemy phases every round.** The loop called `e.endTurn(pl)` for each
     seat and then closed the table again with `if (!e.tableReady && e.phase ===
     'player') await e.endTurn()`. But `endTurn(seat)` runs the enemy phase the
     moment the LAST seat ends and then OPENS THE NEXT TURN, so by the time the
     loop finished, `tableReady` was false again and `phase` was `'player'`
     again — for the new round. The trailing line ended a turn nobody had
     played. Counting `phase:'enemy'` per round: **[2,2,2,2] against [1,1,1,1]**
     once guarded on `e.turn`, at 1p, 2p and 4p alike.
   - **The bot scored clones while reading the real board.** `seatOf(e, seat)`
     was `seat || e.players[0]` — an actor belonging to whichever engine the
     CALLER was driving. The beam search evaluates clones, so `options()`
     enumerated a hand that never emptied and `endTurnValue`'s `guarded` was the
     Guard standing BEFORE the turn. The bot could not see its own plan, so it
     never valued Guard — and only when a seat was passed, which is to say only
     in co-op. Measured: one Kid took 41 Courage of damage where the same
     loadout on the same seed took 10 through the solo path.
   - **Half the scoring function never took a seat at all.** `residual`,
     `projectedValue` and most of `staticScore` read `s.player` — seat 0 —
     while `balance.html` disarmed the dev guard that would have thrown. Every
     seat's plan was scored against seat 0's Courage, Guard, Nerve and hand.

   Fixed, and `tests/critic-design/anchor.py` now holds the line: with ONE Kid,
   `partyBench()` must reproduce `bench()` fight for fight. **Re-measured, the
   Foyer standard tier reads 100% at every party size with zero falls**, against
   the 79 / 75 / 96 / 96% the broken harness reported. The curve
   `[1, 2.2, 4.0, 5.7]` was tuned to that harness and is not defensible as it
   stands.

33. **A script named after a stdlib module becomes that module.** Python puts a
   script's own directory at the front of `sys.path`, so `tests/coop/select.py`
   WAS the `select` module for everything run from `tests/coop/`. `balance.py`
   imports `asyncio`, `asyncio` imports `select`, and the test script's own
   argparse then ran against `balance.py`'s argv:

   ```
   $ python tests/coop/balance.py --n 24
   usage: balance.py [-h] [--party PARTY]
   balance.py: error: unrecognized arguments: --n 24
   ```

   **All six scripts in `tests/coop/` were affected**, and the two that take no
   arguments were quietly running the select-screen test before their own. The
   command HANDOFF documents could not run at all. Renamed to `selectscreen.py`;
   gated by `tests/stdlib-shadow/check.py`.

34. **`run.buildCombat` seeds the fight from the NODE ID.** It forks the run RNG
   on `combat:<node.id>`, and that fork decides the shuffle, the opening hand
   and every enemy roll — so two harnesses that name their bench node
   differently play different
   fights from the same seed and the same loadout — which reads as the two
   harnesses disagreeing. If you are comparing two instruments, the node id is
   part of the experiment.

35. **A perf baseline measured once, at the start, is not a baseline.** fps on
   this machine keeps drifting for several seconds past the nominal settle. In
   a CSS A/B on the combat screen the FIRST baseline read **52** and the SAME
   baseline, re-measured four cases later, read **56** — so every variant in
   between looked 4 fps better than it was, and `box-shadow` appeared to be
   worth 4 fps when it is worth about one. Re-measure the baseline at the END
   of the sweep and compare like with like. Trap 7 is the same lesson about
   overlapping runs; this is the version that bites a single run.

   The rest of that measurement is worth keeping too: the 3D scene graph is
   **identical** in title, map and combat (14 drawables, 26 programs, 3 composer
   passes — it is a shared backdrop), and hiding one layer at a time gives DOM
   60 / canvas 57 / both 53. The missing frames are DOM compositing, spread
   across 739 elements, with no single property worth more than about one.

36. **`seat` on a net input means WHO ACTED, and nothing else may use it.**
   `session.input()` rejects any message whose `seat` is not the sending
   client's, because a client may only speak for itself — so an action aimed at
   somebody ELSE (Mend a friend, Clone their Trick) names them with `to`, the
   field `useSnack(snack, targetId, { to: seat })` already uses. Reusing `seat`
   for the target makes the wire silently refuse the message and the action
   never happens on any machine.

37. **A test that clicks by LABEL and matches nothing is silent, and the
   failure it produces belongs to somebody else.** `tests/coop/rooms.py` rolled
   its own Curiosity off an unseeded run and pressed the one button label it
   knew; `event.js _syncFoot` puts three others on that button ("Face it",
   "Choose a Trick to give up", "Choose what gets mended"), one per follow-up
   `_continue()` has. On any launch that rolled a room with a follow-up, no
   click was made and the missing veil printed as
   `FAIL and it passes to the other Kid rather than closing` — word for word the
   co-op handoff regression the file exists to catch. Its `press()` helper
   RAISES now and names every button that was on screen. Content a test walks
   into must be NAMED, not rolled.

38. **An enemy with no `partyPick` picks one Kid and keeps them.**
   `intentTargetFor` rolls a seat once and holds it in `enemy.targetSeatId`
   until that Kid falls. That is fine for one enemy in a scuffle and it is a
   whole missing fight for a BOSS: the Governess declared no `partyTarget`, no
   `partyPick` and no `splash` on any of her five attacks, so at four Kids she
   fought one Kid for eighteen turns while three stood untouched and hit her
   freely — measured at 100% player wins, nobody ever falling, 90% of the
   party's Courage left. When you write a boss, its targeting is content, and
   `tests/enemies/audit.py` is SOLO so it cannot see any of it.

39. **`c.player` in an enemy ctx is the AIMED seat, and it is fixed when the
   ctx is built.** Which is correct and deliberate (`engine.js`: "reading seat 0
   here would make every enemy debuff land on the host"), and it means a move
   flagged `partyTarget: 'all'` sends its DAMAGE to everybody while a status
   hung on `c.player` lands on one Kid. Use `c.targets()` — the seats this move
   actually lands on — for anything that must follow the damage.

40. **A per-head cut is not automatically the right trade for an AoE.** The
   Butler's Dust Them Off buys coverage with damage (5x2 -> 3x2) because it
   fires every third turn and the full number measured 0% wins. The Governess's
   Mind Your Seams fires once in four and only in phase one, and the same cut
   measured NOTHING — 100% -> 93.8% wins, 90% -> 87% Courage left, because the
   cut number was small enough that four Kids' Guard ate it. Cadence decides it,
   and the doc's default is that the number does not move (nursery §27).

41. **A warning that only reaches the page reaches nobody.**
   `tests/critic-design/party-boss.py` re-renders its table from
   `window.__PARTY__` and never echoes the page's own `say()` header, so a
   PROXY-decks banner printed in the browser was invisible in the terminal that
   reads the numbers. If a harness has two output paths, the warning goes on the
   one a human actually looks at.

42. **`RUN_LENGTH_REGIONS` is 2, so the Sleeping Quarters never ships.** An
   expedition is the Foyer and the Nursery and stops at `isLastRegion`. Asking
   `party-boss.py --region sleeping-quarters` for loadouts answers "no loadouts
   for 1p" four times, which reads as a broken harness and is really the game's
   own length — `--lregion nursery` measures that content against what a party
   carries when the run currently ends, and says PROXY. Do not tune region 3
   against decks no player will have.

43. **Every deep-linked combat and map screenshot was of a BLACK VOID, and that
   is what critics were judging.** `core/renderer.js` renders nothing while it
   warms — `_warming` is set before its first await on purpose, so frame 1
   cannot pay the whole shader-link cost — and phase A takes about ten seconds
   cold on this GPU. `tools/shot.py --wait` was a fixed sleep after `load`, so
   the documented `--wait 9` fired while the stage was still dark and produced
   a screenshot of the HUD floating on nothing. It waits for
   `stage.warmStage === 'done'` first now.

   **No player ever sees it** — the warm-up finishes while they read the title
   menu, and walking into combat from a settled title is lit in four seconds —
   which is exactly why it survived: the game is fine and only the instrument
   was wrong. Trap 6 ("`--wait 4.5` can catch the map mid-draw, use `--wait 9`")
   was this same bug being treated with a bigger number. Wait for a signal.

44. **A threshold expressed as an ABSOLUTE Courage number shrinks to nothing as
   the party grows.** Every boss turned to phase two at a fixed number — 100,
   92, 160 — while their pools are multiplied by the party curve, so phase two
   went from ~55% of the fight solo to 10-17% at four Kids on all three at once.
   A party of four fought a one-phase boss with a coda: the Governess's three
   Repair Patches, her Emergency Repair and her whole second move cycle were
   authored content nobody in a party ever saw. The doc already prescribes the
   fix and it is worth quoting because it generalises — *"Courage thresholds
   remain PROPORTIONAL to maximum Courage… This keeps the mechanic stable
   regardless of party size"* (nursery §34). `phaseAt(c, soloAt, soloMax)` in
   `enemies/_lib.js`. The same shrink was happening under Haunt, which is ×1.06
   on boss Courage. **When you write a number against a pool, write it as a
   share of that pool.**

45. **A boss whose damage can be BLOCKED cannot threaten a party, however much
   of it there is.** `tests/critic-design/party-ledger.py` measures what a boss
   aimed against what landed. At four Kids the Governess aims 565 and lands 94,
   because party Guard reaches 2275 — it scales per seat AND with the length of
   the fight, so it grows far faster than any enemy output. The Butler aims 404
   and lands 173 on the same instrument, and the only relevant difference is
   that two of his Reprimands bypass or remove Guard.

   So the design doc's stated compensation for damage not scaling — *"enemy
   effects gain multiplayer targeting logic instead"* (foyer §26) — is necessary
   and NOT sufficient: targeting is answered by Guard. Adding AoE or raising a
   number is measured, twice, to do nothing to the leftover-Courage gap.

   **Resolved for the Governess on 2026-08-29, and the shape generalises.** Her
   Sharp Correction ignores Guard in a party — the move that already picks the
   Kid closest to breaking, so the party's decision becomes "nobody may be the
   lowest" rather than "stack Guard". At four Kids: win 100% → 75% (solo 62.5),
   turns 18.4 → 12.4 (solo 11.0), falls 0.0 → 1.0, cost 17 → 93, and `%blocked`
   FLAT across party size instead of climbing to 84. Solo byte-identical.
   **A boss needs at least one move a party's Guard cannot answer**, and the
   elite tier has the same untested shape.

   If you author one: `pierceFn(c)` on the move, and the player must be TOLD.
   The intent carries `pierce` and the widget draws a THROUGH GUARD chip; the
   incoming rail counts it in `through` and excludes it from what more Guard
   would help with. Getting the damage right and the readouts wrong is worse
   than not shipping it — see trap 46.

   **QUANTIFIED 2026-08-29, and the ratio is the point.** Against the arithmetic
   baseline for four Kids (`cost4 = costSolo x (poolScale/4) / 4`, no content at
   all), the two levers were run one rung at a time on two encounters:

   | | Toy Chest | Patchwork Giant |
   |---|---|---|
   | no targeting | -3.9 | -9.9 |
   | + `partyPick` | | -7.3 |
   | + full-number AoE | -2.6 | -2.0 |
   | + **pierce** on the focused attack | **+2.1** | **+7.5** |

   Coverage bought 1.3 and 7.9 points and reached the baseline on neither;
   pierce bought 4.7 and 9.5 and flipped the sign on both. `%blocked` says why:
   the Chest's AoE took `aimed` from 53.8 to 96.1 and `%blocked` from 70.4 to
   78.8, so the party blocked the addition. **A pick SPREADS damage, AoE ADDS
   damage a party's Guard then absorbs, and only pierce is KEPT.**

46. **A new kind of damage needs a new READOUT, and there are three of them.**
   Sharp Correction was given `pierce` in a party and the intent chip was
   updated with it — and the incoming rail still read
   `INCOMING 24 − 9 Guard → 15` and *"15 more Guard to stop it all"*: two false
   statements at once, on the one widget whose entire job is to be believed,
   with every suite green. A SCREENSHOT is what found it.

   The three that must agree: `buildIntent` (what the enemy is about to do),
   `previewIncoming` (what reaches THIS seat, and what Guard would help with),
   and the chip that names it. The second draft then printed
   `24 − 9 Guard → 24` — a subtraction whose answer is the number it started
   from — so the arithmetic is suppressed when Guard cannot be spent at all,
   which is the file's own existing rule meeting a second cause.

   Assert the two halves SEPARATELY. `tests/governess` checks the intent/preview
   and the damage independently, so an intent that promises what the effect does
   not deliver fails either way round.

47. **A ONE-SEAT rate divided into a WHOLE-TABLE pool is a party-size bug, and
   it reads as a fact about the game.** `lib/bot.js projectedValue()` estimated
   the rest of a fight as `enemy Courage remaining / MY damage rate` — the
   Courage party-scaled, the rate belonging to one seat. At four Kids that asks
   "how long until I kill a 5.7x pool by myself?", and the answer is the
   28-turn cap, on every seat, in every fight, from turn one. `turnsLeft`
   multiplies the Guard term, so four Kids valued Guard FOUR TIMES as highly as
   one Kid while the damage aimed at each of them had fallen fourfold.

   Measured on the Grand Coatcheck at n=12, one line changed:

   | party | turns | partyGuard |
   |---|---|---|
   | 1p | 6.9 → 6.9 | 49 → 49 |
   | 3p | 23.3 → 8.8 | 578 → 217 |
   | 4p | 49.7 → 8.6 | 1993 → 475 |

   Four Kids were raising 1993 Guard to stop 483 damage. **What makes this the
   expensive kind of instrument bug is that it was believed rather than
   measured**: "party damage output does not scale with party size the way the
   Courage pool does" is written into two session notes, HANDOFF and the
   Butler's own source comment as a STRUCTURAL fact that no constant could fix,
   and the elite tier's 43.7 turns was carried as the worst player experience in
   the measured set. Both were this. The next scoped piece — nine per-enemy
   `partyHp` curves — would have been nine curves fitted to a bot that turtles.

   The general shape: **any quantity that scales with party size, divided by one
   that does not, is a bug that only appears above two seats** — and two seats is
   where a co-op harness is usually eyeballed. `anchor.py` cannot see it, because
   at one Kid the expression is unchanged, which is exactly why it passed
   throughout. `tests/critic-design/party-turns.py` is the gate that can: four
   Kids finish within 2.0x solo's turns and raise under 20x solo's Guard
   (measured 1.49x / 15.08x with the fix, 7.94x / 60.07x without).

48. **A TARGET LIST that can hold the same seat twice deals the move twice, and
   the incoming rail cannot see it.** `partyTargets()` for `partyTarget: 'two'`
   fell back to `living.find(p => p !== first) || first`, so a party reduced to
   ONE Kid got `[first, first]`. The enemy ctx's damage loop runs the move's
   full `hits` count once per ENTRY, so the last Kid standing took the whole
   move twice — **double what they would have taken with a friend beside them**,
   in the one moment the fight is already going badly.

   `previewIncoming` could not report it, because it asks `aimed.includes(me)`
   — a boolean — and then counts `damage × hits` once. So the rail read exactly
   HALF of what was about to land and its `lethal` flag was computed from the
   half: Sharp Little Hands showed 8 and dealt 16. Trap 46's shape on the same
   widget, and fatal here rather than merely wrong.

   Two rules from it. **A list of targets is a SET** — if the same actor can
   appear twice, the damage loop multiplies. And **anything that counts targets
   with `includes()` is assuming that set**; the moment a list can repeat, every
   consumer that asks "am I in it?" instead of "how many times?" understates.
   The chapter had already settled it — *"If only one player remains available,
   both hits target that player"* (nursery §33) — both hits, which is one move.
   Gated by three checks in `tests/coop/suite.js`, and the effect and the
   readout are asserted SEPARATELY.

49. **An accumulator passed as an OPTIONAL parameter is rebuilt every call by
   whoever forgets it, and the code still runs.** `bot.js` takes a per-fight
   `fc` — `{dps, threat, guard, peak, turns}` — and does
   `const F = fc || { …defaults… }`. `tests/coop/balance.html` never passed
   one, in any commit it has ever had, so `F.turns` was 0 on every call of
   every seat and `bookkeep`'s updated copy was thrown away. The bot had NO
   memory of the fight it was in: `dps` pinned at its opening guess of 10,
   `guard` at 4, `threat` reduced to this turn's telegraph, and the
   `0.65 * peak` spike term provably dead because `0.65·shown <= max(4,shown)`.
   Turn 6 was planned exactly like turn 1.

   It matters because `engine.js` names THAT file as the instrument to
   re-measure `PARTY_HP_SCALE` against, so the shipped co-op Courage curve
   was validated by a structurally different bot from the one every other
   harness runs. `expedition.js` and `partybench.js` both do it correctly and
   both say why — which is the tell: **when two of three callers document a
   parameter and the third omits it silently, the third is the bug.** A
   defaulted accumulator cannot announce that nobody is accumulating it.
   Re-measured after repair: 100% wins at every party size, turns
   5.4 / 5.9 / 6.9 / 7.2, Courage left 61 / 78 / 83 / 86.

50. **A mechanic can be dead in more than one way AT ONCE, and fixing one layer
   changes nothing.** The Porcelain Twins' Joined and the Rocking Horse's
   Excitement-from-support were each broken FOUR independent ways, any one of
   which was sufficient on its own:

   1. `engine.boardEvent()` had **no callers** anywhere in `game/src/`.
   2. It passed the event as `(event, data)` while every def is written
      `onBoardEvent(c, ev)`, so a caller would have handed them `undefined`.
   3. `twinOf()` matched `a.id === 'porcelain-twin-proper'` — the ACTOR id,
      which `buildEncounter` never sets and `_makeEnemy` defaults to `e0`/`e1`.
      Each Twin believed it was alone.
   4. The enemy ctx's `block: (a, n)` **dropped its third argument**, so the
      `{ source }` and `{ noJoin }` written at four nursery call sites never
      reached `gainBlock`.

   And a fifth appeared the moment the other four were fixed: the Guard mirror
   did not mark itself `noJoin`, so the Twins bounced a halving grant off each
   other and Good Posture paid **15 each** — worse than the 12 its own comment
   warned about, and terminating rather than hanging, which is the version
   nothing notices.

   **The lesson is about evidence, not about these enemies.** A single fix here
   moves no number, so "I changed it and nothing happened" is not evidence the
   diagnosis was wrong — it is what a stack of independent breakages feels like.
   Fix layers until a test that asserts the EFFECT goes green, and write one
   test per layer: the four here fail under four different controls.

   The tell that should have caught it years earlier: `boardEvent`'s only caller
   in the whole repo was `tests/combat/suite.js`, which invented an event
   (`e.boardEvent('lightsOut', { level: 2 })`) that the game does not have. So
   the hook was PROVED TO FIRE while nothing in the game had ever fired it —
   rule 9's shape, where driving another module's API yourself demonstrates the
   API works rather than that the game uses it. **If a test is the only caller
   of a production API, that is the finding.**

51. **A statistic conditioned on WINNING is survivorship, and it moves the wrong
   way as the fight gets deadlier.** `party-ledger.py`'s `left%` is the mean
   leftover Courage over WINS ONLY, and the table printed no win rate beside it.
   So the Porcelain Twins read `left% 96` against the Toy Chest's 81.2 and were
   written up as the softest encounter in the game. They win **9 fights in 12**
   at one Kid — the same as the Patchwork Giant, which reads 72.6 off the same
   9-in-12 — and their three losses are cut from the mean. A bimodal fight (the
   puzzle works and you cruise, or it does not and you die) reports as a
   pushover, and the more it kills, the softer it looks.

   Compounding it, `left` went through a `mean()` that rounds to one decimal
   before the multiply. Right for Courage totals, fatal for a 0..1 FRACTION:
   the column was quantised to multiples of TEN, so 0.849 and 0.851 printed as
   80 and 90.

   Both fixed, and `win%` prints beside `left%` now so they cannot be read
   apart. **Never quote a conditioned mean without the condition next to it** —
   the previous session's handoff already said this about the Governess ("left%
   is wins-only... the win rate, turns and falls are the better readings") and
   it still cost a round, because the table did not carry the warning where the
   number was.

52. **An ASSIGNMENT to shared state has no verb to be missing, so no seam can
   see it.** Every screen in this game reaches the run layer through
   `act(run, {...})` in `net/actions.js`, and the reason that works as a gate is
   that a call whose verb is absent SHOUTS — `_room`'s default arm logs
   `unknown room act` and the suite goes red. `scenes/map.js` did not call
   anything. It wrote `run.currentNodeId = id` and `run.pathIds = m.path.slice()`
   and emitted a bus name, `map:choose`, that `state/run.js` listened for and
   turned into `enterNode`. So the ONE screen that decides where the whole party
   goes was the one screen not on the wire, and nothing could have noticed: there
   was no missing verb, no optional call, no unknown option key.

   Two things made it invisible for months rather than obvious:

   - It also called `run.chooseNode(node)`, so the source read as if it went
     through the run layer's API. But it wrote `currentNodeId` FIRST, which made
     `chooseNode`'s own `id === this.currentNodeId` guard true — the call moved
     nothing on any click ever measured, and `chooseNode`'s doc comment ("the
     map screen calls this directly") described a guaranteed no-op. **A call
     that is present is not a call that does anything.**
   - The screen's route array was assigned back onto the Run whole, including
     `__in`, the drawing's own pseudo-node for the doorway. A node id that
     `nodeById` cannot resolve was in `run.pathIds` and in every save.

   Gated now by `tests/seams/check.py` SHARED-WRITE, which flags any assignment
   to a `Run` field from `game/src/scenes/` or `game/src/ui/`. The field list is
   read out of `state/run.js`'s constructor plus `PER_KID` rather than
   hardcoded — and the FIRST version of that extractor indexed to the `{}` in
   `constructor(cfg = {})` and returned an empty set, passing the whole check
   against nothing (rule 5c again). It now reports its own surface collapsing.

   **And the guard for it needed two tries.** Applying a whole-party act through
   `asSeat` looked obviously wrong, so `PARTY_ACTS` was added with a test that
   both clients end on the same `localSeat`. That test passed with the guard
   DELETED: `asSeat` restores the applying client's own seat, which
   `enterNode`'s `resetSeat()` had just chosen anyway. The observable difference
   is who PAYS — `enterNode` calls `this.hurt(3)` on a sagging wing and
   `courage` is a PER_KID accessor, so borrowing the sender's seat moves the
   damage onto whoever clicked, identically on all four clients, where no digest
   will ever report it. `tests/net/index.html` asserts the Kid, not the seat.

15. **The integrator must not `git add -A` while agents are editing.** Four separate agents have
   now reported their in-flight work being swallowed by an unrelated commit — one had a whole
   `music.js` rewrite land inside a commit titled "Pronouns per the designer", which then made a
   later revert restore the wrong version. Commit **explicit paths** for your own work. If you
   genuinely need to checkpoint everything, title the commit as a checkpoint so nobody reads it
   as authorship, and never do it while a rewrite is mid-flight.

## Quality bar

Slay the Spire 2. Not "a good web game" — that specific bar. Concretely:
- **Tactical clarity:** the player can always see exactly what will happen before it
  happens. Intents, damage previews after modifiers, block math, status durations.
- **Card feel:** hover lift is instant and readable; drag has weight; a played card
  has a distinct arc, impact and settle; the hand re-fans with easing, never snaps.
- **Readability under motion:** numbers stay legible during shake and particles.
- **Atmosphere:** a cute-spooky haunted mansion. Warm candlelight against cold
  spectral light. Charm first, then eeriness underneath.
- **No placeholder anything** in your area when you report done.

## File ownership

An agent may **edit only files it owns**. To change a file it does not own,
report the request instead — the integrator applies it.

| Area | Owns |
|---|---|
| foundation (lead) | `game/index.html`, `src/main.js`, `src/core/**`, `CONTRACTS.md`, `tools/**` |
| combat-engine | `src/combat/**`, `src/data/keywords.js`, `src/data/statuses.js` |
| card-feel | `src/ui/card.js`, `src/ui/card.css`, `src/ui/hand.js`, `src/ui/hand.css` |
| combat-scene | `src/scenes/combat.js`, `src/scenes/combat.css`, `src/ui/enemy.js`, `src/ui/intent.js`, `src/fx/combatfx.js` |
| map | `src/scenes/map.js`, `src/scenes/map.css`, `src/state/mapgen.js` |
| companion-cards | `src/data/companions/**`, `src/data/cards.js` |
| enemies | `src/data/enemies/**`, `src/data/encounters.js` |
| meta-run | `src/state/run.js`, `src/scenes/reward.js`, `src/scenes/shop.js`, `src/scenes/rest.js`, `src/scenes/event.js`, `src/data/relics.js`, `src/data/events.js`, `src/data/backpack.js`, and their `.css` |
| frontend | `src/scenes/title.js`, `src/scenes/select.js`, `src/scenes/clubhouse.js`, `src/scenes/gameover.js`, and their `.css`, `src/ui/portrait.js`, `src/ui/petart.js` |
| audio | `src/audio/**`, `game/assets/audio/**` |
| atmosphere | `src/fx/atmosphere.js`, `src/fx/transition.js`, `src/fx/shaders/**`, `src/core/renderer.js` (co-owned with lead — coordinate) |
| ui-chrome | `src/ui/tooltip.js`, `src/ui/hud.js`, `src/ui/modal.js`, `src/ui/settings.js`, `src/ui/deckview.js`, `src/ui/base.css`, `src/ui/tokens.css` |
| netcode | `src/net/**` (`session.js`, `transport.js`, `actions.js`) |

**`src/net/actions.js` is the ONE way a screen changes the run.** A scene calls
`act(run, { t: INPUT.ROOM, act: ACT.…, … })`, never `run.takeRewardCard()` or
`engine.playCard()` directly, because every client simulates the whole
expedition and `_combatDigest` fingerprints every seat. With no session it
applies straight through and returns the run layer's own answer synchronously,
so solo and pass-and-play are unchanged; with one it goes out on the wire and
comes back through the same applier. If you add a screen action, add a verb.

Notes: write **your own file** at `docs/notes/<date>-<your-area>.md`, then add one row to the
table in `docs/NOTES.md`. Never write to another agent's note file. A single shared append-only
file was tried first; two agents lost their sections to concurrent whole-file writes, because
"append-only" is a convention and `git restore`, a stale read, or a scripted rewrite all break it
silently. One file per agent makes the collision structurally impossible.

## Module seams

```js
// Anything can listen. Emit sparingly and name events `domain:verb`.
import { bus } from './core/bus.js';

// Animation timing. Never use setTimeout for anything visual.
import { clock } from './core/clock.js';
await clock.tween(obj, { x: 4 }, 0.3, Clock.easeOutCubic);
await clock.ramp(0.4, v => { el.style.opacity = v; });

// Scenes get `ctx` with: THREE, bus, clock, assets, Save, RNG, stage, input,
// transition, audio, tooltip, atmosphere, scenes, run, dom, fx, tipLayer.
```

### Combat engine public API (`src/combat/engine.js`)
```
new CombatEngine({ player, enemies, rng, relics, hooks })
engine.state            // plain serialisable snapshot; render from this only
engine.startCombat()    -> Promise<void>
engine.canPlay(cardUid, targetId) -> { ok, reason }
engine.playCard(cardUid, targetId) -> Promise<Event[]>
engine.endTurn()        -> Promise<Event[]>
engine.preview(cardUid, targetId) -> { damage, block, statuses, killsTarget }
engine.on(event, fn)    // 'damage','block','status','draw','discard','death',
                        // 'turn:start','turn:end','intent','shuffle','energy'
```
Events are the *only* thing the renderer reacts to. Every event carries enough
data to animate it without querying engine internals.

### Engine surface added for Companions, 2026-08-27

Each of these exists because a designed card could not otherwise be written. If
you are about to add another, check the card genuinely cannot be expressed first.

| | |
|---|---|
| `engine.overrideIntent(enemy, move)` | Replace an enemy's CURRENT action with a supplied move object. The original is spent, as `deleteIntent` spends it. Boggle's Search, which belongs to no enemy's `def.moves`. `clearIntentOverride` drops one unresolved. |
| `onCourageLoss` hook | A damage-pipeline step AFTER Guard and BEFORE `onLethal`, with a mutable `amount`. `onIncomingHit` fires before Guard is consulted, so nothing could see the number Mopsy's Cushion is defined against. |
| `StatusDef.energyDelta` | Reduces the start-of-turn Nerve refill, measured with the draw penalties. See trap 21. |
| `ctx.playedFrom` | Which pile a Trick was played out of, `'hand'` or `'stash'`. By the time an effect runs the card is in LIMBO, so Hush's Ambush had no way to ask. |

### Added for the last five Companions, 2026-08-28

| | |
|---|---|
| `defineCounter({ shared: true })` | A counter that belongs to the TABLE, not a seat: `_ckey` does not prefix it and every seat's HUD shows it. Drizzle's Weather is one global state acting on the shared enemies, so a per-seat counter gave two Drizzles two Weathers. `_clone` copies the shared-id set or a preview engine loses the counter entirely. |
| `ctx.bankEnergy(n, seat)` | Nerve at the start of a LATER turn. `_dealSeatTurn` SETS Nerve, so a gain from a listener, a hook or a timer is all wiped. Twin of `StatusDef.energyDelta`, pointing the other way. See trap 24. |
| timer `run({ reason })` | Whether a countdown ran out on its own (`'tick'`) or was forced to zero. `TIMER_FIRE` always carried it and the handler never received it, which made "resolved naturally" unaskable — and that is the whole of Mossbit's Patience. |
| `phase: 'playerReady'` | Emitted after the turn-start deal: the only moment at which the turn has ACTUALLY opened. `turn:start` is before the Guard wipe and before the hand exists. A new PHASE value rather than a new event, because every existing listener tests for `'player'` or `'enemy'` and falls through it. |
| `ctx.allyMoveCard(pl, card, pile, opts)` | Move a card a TEAMMATE already owns between their own piles. `moveCard` acts on the acting seat's piles and silently moves nothing; `giveCard` is no help because the card exists already. |
| `CardView.setBaseNumbers(nums)` | Rewrite a card's printed numbers mid-combat, so the text says what it will do. Crinkle's Creases permanently double a Trick's damage; computing that at read time works and is invisible. See trap 31. |
| `engine.objects` **is rendered now** | It documented itself as the home for "Plants, Plots, Pumpkins, Graves" and nothing had ever drawn it — Pipkin's Patch has been invisible since it shipped. `_renderPlayerCounters` walks it beside the counters. |

### Co-op: up to four Kids

`engine.players[]` and `run.kids[]` are the sources of truth and **solo is a party of one**, so
there is no separate single-player path below construction. `MAX_PARTY` is **4** as of
2026-08-28. `scenes/select.js` reads that constant and generates its party-size control from
it, so the screen can never offer a party the engine refuses or refuse one it accepts —
**never write a party-size literal anywhere.**

- `engine.player` / `.piles` / `.relics` are SEAT 0. In a party with the dev guard armed they
  **throw** and name the fix, rather than quietly resolving to seat 0 — which is how a
  teammate's Curl Up would silently guard the host. A shipped build degrades to seat 0 rather
  than throwing at a player mid-run.
- `engine._asSeat(seat, fn)` sets the acting seat for a scope and restores the previous one.
  Card resolution runs as the card's owner; every cross-player helper resolves inside the
  RECIPIENT's seat, so their Dexterity, their deck and their hooks respond.
- `ctx.self` is whoever HOLDS the card, not seat 0.
- Cross-player surface, and the only sanctioned way to act on a teammate: `c.party()`,
  `c.teammates()`, `c.isParty()`, `await c.chooseAlly()`, `c.giveBlock/giveDraw/giveEnergy/
  giveStatus/giveHeal/allyCards/giveCard`. `chooseAlly` returns **null** in solo.
- Per seat: deck, all six piles, Nerve, Courage, Guard, statuses, Keepsakes, Companion
  trackers and counters (two Marmalades get two independent Lives tracks), and the
  per-turn counters. `engine.stats` / `engine.playedThisTurn` are the TEAM mirror and
  stay team-wide on purpose — an elite threshold worded "16 damage per player, all team
  damage during the round contributes" wants the table. Anything a Kid's own Trick,
  Keepsake or House Rule reads comes from `e.seatStats(seat)` / `e.seatPlayed(seat)`, or
  one Kid's turn spends another Kid's resources. Zoomies and Untouched both did.
- **House Rules are judged seat by seat**, `once` is per seat, and a Reprimand resolves
  inside the breaker's seat and aimed at them. "One player's actions do not punish
  another player." (foyer §26.)
- **Deck pollution takes a seat.** `addCard(def, pile, { to })` — nothing is acting
  during the enemy phase, so without `to` it all lands on seat 0.
- **"The first N damage from each player"** is the chapters' recurring shape (nursery
  §32, sq §38, and both bosses). Key the allowance with `seatKey(attacker)` from
  `enemies/_lib.js`. **"N per player"** thresholds use `c.perPlayer(n)`.
- A move whose main number belongs to ONE Kid while other seats also take damage must
  declare `splash` / `splashFn(c)`, or the intent is lying to the seats with no arrow.
- **Pass-and-play.** `run.setLocalSeat(n)` moves which Kid this screen belongs to, and
  every per-Kid thing follows because they are all reached through `run.local`. Between
  Kids, `ui/handoff.js passTo()` covers the board with an OPAQUE scrim — a hand of Tricks
  is the one private thing in this game. `shouldHandOff(run)` is the ONE place that
  decides whether to hand over at all, so a networked session turns all of it off by
  answering false: never test `run.partySize` yourself.
  - A round, and a room, starts with the lowest living seat. Not "whoever has not gone
    yet": the Kid who ended last would keep the screen into the next round and the two of
    them would swap who goes first every turn.
  - A screen built once at `enter()` from `run.local` must redress itself on a handoff —
    the Companion's portrait, their name, the body on the board. `_takeSeat()` in
    combat.js is the list.
  - `engine.localSeat` has to move with the Run's, or a seat-addressed choice opens the
    picker in front of the wrong player.
  - A per-Kid room hands over and the LAST Kid out closes it (`_leaveRoom`); a room there
    is only one of passes `perKid: false`. "Had their turn" is marked on leaving, not on
    using it — a Kid may look at the shelf and buy nothing.
- **A choice belongs to a seat.** `engine.choices.ask({ seat })` reaches the picker only
  when the seat is `engine.localSeat`; every other seat's request resolves from its own
  `prefer` rule and is logged with the seat so a replay can tell two Kids apart. Cards
  say `c.askAlly(ally, { pool, prefer })` — never hand-roll "the teammate would pick the
  cheapest" inside an effect. Local play always takes the fallback branch ON PURPOSE:
  putting one player in charge of the other Kid's deck is worse than a stable rule.
- **A number a player is scored against must not be computed from the answer.** Wink's
  Call It Out did `currentFamily(c,t) === currentFamily(c,t)`, so a card whose text reads
  "Right: … / Wrong: …" could never be wrong and half of it was unreachable.
- Anything a screen shows about "what is coming at me" is per seat:
  `previewIncoming(engine, seat)`, never `engine.player`.
- Turns are SIMULTANEOUS. `endTurn(seat)` closes one seat; `endTurn()` closes the table.
- Multiplayer-only Tricks live in `def.coopCards`, OUTSIDE the 80, and are never drafted solo.
- Enemy **damage never scales** with party size. The extra threat is TARGETING: a move declares
  `partyTarget: 'all' | 'two' | fn(enemy, engine)` for AoE, and `partyPick: 'lowestGuard' |
  'lowestCourage' | 'fewestDraw' | 'mostDraw'` for who it singles out. Both are authored per
  enemy in the region chapters. Seat choice ALWAYS ties on seat index, never the RNG — the
  target is shown before the players act and has to survive a replay.
- **A `partyPick` TRACKS the board, and that fights the rule above it. Do not "fix" it
  without reading this.** `pickSeat` reads live state, so the arrow moves when a Kid
  reacts to it: Walking Stick prefers `lowestGuard`, its target raises Guard, stops being
  lowest, and the swing transfers to their friend. Holding the pick was tried on
  2026-08-28 and REVERTED, because (1) player Guard is wiped at the start of the turn,
  after `chooseMove`, so a held pick sees every seat on 0, ties, and resolves to seat 0
  forever — `lowestGuard` stops meaning anything; (2) it measured worse, four Kids at
  0.6x going 33% -> 17%; and (3) six assertions in `tests/coop/suite.js` encode the
  tracking behaviour deliberately. A preference computed from state the player controls
  cannot both track that state and stay still. The real answer is probably that anything
  telegraphed a turn ahead should prefer something the player cannot game inside the turn
  (`lowestCourage`, `fewestDraw`); that is a design decision, not a bug fix.
  **2026-08-29: the Nursery already made that decision and it is authored.**
  §29 gives Jack in the Box "the player with the lowest percentage Courage. The
  target is shown clearly before players act", and `nursery.js` implements it as
  `partyPick: 'lowestCourage'`. Courage is not something a Kid can move inside
  the turn they are shown the arrow, so the pick holds still by itself with no
  engine change. The Governess's Sharp Correction uses it, and
  `tests/governess/run.py` asserts the arrow does NOT move when that Kid raises
  40 Guard. `lowestGuard` remains the tracking one, on purpose, where the
  chapter asks for it.
- Enemy Courage is `[1, 2.2, 4.0, 5.7]`, and **it was derived from the STANDARD TIER
  only** — `tests/coop/balance.py` fights scuffles — then applied to every enemy in the
  game including bosses, which were never measured at any party size until 2026-08-28.
  When they were, the Foyer boss read **0% at 3p and 4p**. A scuffle lasts five turns
  and a boss forty, and a boss's Guard is per TURN, so the same multiplier does not mean
  the same thing to both. Re-measure after any change to enemy damage, starting decks or
  the co-op pool — and re-measure BOSSES with `tests/critic-design/party-boss.py`, which
  is the only harness that fights them with real pre-boss decks.
- **A per-enemy curve is the sanctioned override, and it is barely known.**
  `EnemyDef.partyHp(n)` returns a multiplier that REPLACES the global curve for that
  enemy (`_makeEnemy`), and `favoriteDoll` is the only user — the Doll is a timer, not a
  health bar, so scaling it like an enemy would make the window the party is trying to
  open arrive LATER with more Kids. It is also how a boss escapes a curve fitted to
  scuffles. The design doc asks for exactly this: *"I would avoid simply multiplying
  every enemy's Courage. The cooperative version should change tactical relationships"*
  (regions/01-foyer.md §26), with a baseline of 160% / 210% / 255% and "enemy effects
  gain multiplayer targeting logic instead".
- A screen renders ONE seat's view. `scenes/combat.js` reads `this.me` / `this.mePiles`, never
  `engine.player`. The seat comes from `run.localSeat`.
- Per Kid: deck, Courage, Nerve, Keepsakes, Backpack, Snacks, trackers, counters, card
  rewards, and Mr. Moth's shelf (`shopStock(node, kid)`, forked per seat; seat 0's fork
  key is unchanged so no existing seed moved). Shared: the route, the rooms, the enemies,
  the Haunt level, the seed.

See `docs/notes/2026-08-26-multiplayer-engine.md`.
