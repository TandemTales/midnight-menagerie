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
8. Design source of truth: `docs/design/`. Read only the files you need — the full
   design doc is 1.6M characters. Deviating from the doc is allowed only when the doc
   is silent or when a rule actively harms play; say so explicitly in your report.

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
| frontend | `src/scenes/title.js`, `src/scenes/select.js`, `src/scenes/clubhouse.js`, `src/scenes/gameover.js`, and their `.css` |
| audio | `src/audio/**`, `game/assets/audio/**` |
| atmosphere | `src/fx/atmosphere.js`, `src/fx/transition.js`, `src/fx/shaders/**`, `src/core/renderer.js` (co-owned with lead — coordinate) |
| ui-chrome | `src/ui/tooltip.js`, `src/ui/hud.js`, `src/ui/modal.js`, `src/ui/settings.js`, `src/ui/deckview.js`, `src/ui/base.css`, `src/ui/tokens.css` |

Shared, append-only: `docs/NOTES.md` (one dated section per agent, never edit others').

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
