/**
 * Midnight Menagerie — bootstrap.
 * Builds the shared context every scene receives, registers scenes, starts the loop.
 */
import * as THREE from 'three';
import { bus } from './core/bus.js';
import { clock } from './core/clock.js';
import { Stage } from './core/renderer.js';
import { SceneManager } from './core/scenes.js';
import { Input } from './core/input.js';
import { assets } from './core/assets.js';
import { Save } from './core/save.js';
import { RNG } from './core/rng.js';
import { Transition } from './fx/transition.js';
import { Audio } from './audio/audio.js';
import { Tooltip } from './ui/tooltip.js';
import { Atmosphere } from './fx/atmosphere.js';

import { TitleScene } from './scenes/title.js';
import { ClubhouseScene } from './scenes/clubhouse.js';
import { SelectScene } from './scenes/select.js';
import { LobbyScene } from './scenes/lobby.js';
import { MapScene } from './scenes/map.js';
import { CombatScene } from './scenes/combat.js';
import { RewardScene } from './scenes/reward.js';
import { EventScene } from './scenes/event.js';
import { ShopScene } from './scenes/shop.js';
import { RestScene } from './scenes/rest.js';
import { GameOverScene } from './scenes/gameover.js';

Save.load();

const ctx = {
  THREE, bus, clock, assets, Save, RNG,
  canvas: document.getElementById('gl'),
  dom: document.getElementById('dom-layer'),
  fx: document.getElementById('fx-layer'),
  tipLayer: document.getElementById('tooltip-layer'),
  run: null,              // set when a run starts (state/run.js)
  meta: Save.data,
};

ctx.stage = new Stage(ctx.canvas);
ctx.input = new Input();
ctx.transition = new Transition(ctx);
ctx.audio = new Audio(ctx);
ctx.tooltip = new Tooltip(ctx);
ctx.atmosphere = new Atmosphere(ctx);
ctx.scenes = new SceneManager(ctx);

ctx.scenes
  .register('title',      (c) => new TitleScene(c))
  .register('clubhouse',  (c) => new ClubhouseScene(c))
  .register('select',     (c) => new SelectScene(c))
  .register('lobby',      (c) => new LobbyScene(c))
  .register('map',        (c) => new MapScene(c))
  .register('combat',     (c) => new CombatScene(c))
  .register('reward',     (c) => new RewardScene(c))
  .register('event',      (c) => new EventScene(c))
  .register('shop',       (c) => new ShopScene(c))
  .register('rest',       (c) => new RestScene(c))
  .register('gameover',   (c) => new GameOverScene(c));

clock.start();
ctx.atmosphere.init();

// Deep-link for automated inspection: #scene=combat&seed=123&companion=marmalade
const hash = new URLSearchParams(location.hash.slice(1));
const startScene = hash.get('scene') || 'title';
const startParams = Object.fromEntries(hash.entries());

// Debug surface (used by automated critics + the dev overlay).
//
// Assigned BEFORE the first scene opens, because `run:start` reaches the ctx
// through `window.MM.ctx` — starting an expedition before this line attaches
// the Run to nothing, and the screen then quietly falls back to its standalone
// mock. Nothing here needs a scene to exist.
window.MM = {
  ctx, bus, clock, Save,
  version: '0.1.0',
  goto: (s, p) => ctx.scenes.go(s, p || {}),
  state: () => ({ scene: ctx.scenes.currentName, run: ctx.run ? ctx.run.snapshot() : null }),
};

// `&kids=2` stands up a two-Kid expedition before the scene opens, so every
// screen can be deep-linked in co-op exactly the way it can in solo. Review
// only — the real path is the Companion/Kid select emitting `run:start`.
if (startParams.kids === '2' && startScene !== 'title') {
  bus.emit('run:start', {
    seed: Number(startParams.seed) || 20260826,
    kids: [
      { companion: startParams.companion || 'marmalade', kid: startParams.kid || 'maya' },
      { companion: startParams.companion2 || 'bones', kid: startParams.kid2 || 'eli' },
    ],
  });
}

ctx.scenes.go(startScene, startParams, { instant: true });
bus.emit('boot');
