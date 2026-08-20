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

ctx.scenes.go(startScene, startParams, { instant: true });

// Debug surface (used by automated critics + the dev overlay)
window.MM = {
  ctx, bus, clock, Save,
  version: '0.1.0',
  goto: (s, p) => ctx.scenes.go(s, p || {}),
  state: () => ({ scene: ctx.scenes.currentName, run: ctx.run ? ctx.run.snapshot() : null }),
};
bus.emit('boot');
