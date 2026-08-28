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
6. **`--wait 4.5` can catch the map mid-draw.** Its entrance sweep runs ~800 ms; use `--wait 9`.
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

### Co-op: two Kids

`engine.players[]` and `run.kids[]` are the sources of truth and **solo is a party of one**, so
there is no separate single-player path below construction. `MAX_PARTY` is **2**.

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
- Enemy Courage at 2p is 220%, and it is MEASURED (`tests/coop/balance.py`), not quoted. The
  design doc's 160% is far too easy and StS2's own 250% is the mode their players call
  overtuned. Re-measure after any change to enemy damage, starting decks or the co-op pool.
- A screen renders ONE seat's view. `scenes/combat.js` reads `this.me` / `this.mePiles`, never
  `engine.player`. The seat comes from `run.localSeat`.
- Per Kid: deck, Courage, Nerve, Keepsakes, Backpack, Snacks, trackers, counters, card
  rewards, and Mr. Moth's shelf (`shopStock(node, kid)`, forked per seat; seat 0's fork
  key is unchanged so no existing seed moved). Shared: the route, the rooms, the enemies,
  the Haunt level, the seed.

See `docs/notes/2026-08-26-multiplayer-engine.md`.
