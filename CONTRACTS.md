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
6. **`--wait 4.5` can catch the map mid-draw.** Its entrance sweep runs ~800 ms; use `--wait 9`.
7. **fps collapses when two Playwright runs overlap on this machine.** Re-measure in isolation
   before believing a low number. `tools/shot.py` prints the GL renderer so you can also confirm
   you are on the real GPU and not a software rasteriser.

8. **A `fetch()` that 404s is a console error, even if you handle it.** Playwright's
   `page.on("console")` reports "Failed to load resource: 404" as type `error` for a GET *or* a
   HEAD, so any probe-until-404 asset discovery trips the zero-console-errors gate on every load.
   Ship a generated manifest instead. Measured while building soundtrack discovery; applies to
   any future asset-discovery work here.
9. **The integrator must not `git add -A` while agents are editing.** Four separate agents have
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
