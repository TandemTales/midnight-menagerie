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
import { storage } from './core/storage.js';
import { RNG } from './core/rng.js';
import { Platform } from './platform/index.js';
import { achievements } from './core/achievements.js';
import { AchievementToast } from './ui/achievement-toast.js';
import { Gamepad } from './input/gamepad.js';
import { Navigator } from './input/navigation.js';
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

/* ── boot order matters here ───────────────────────────────────────────────
 * Platform first: it reads `window.__MM_HOST__`, which decides whether
 * `storage` writes files (a wrapper, and therefore Steam Cloud) or localStorage
 * (a browser tab). `Save.open()` then picks that backend and fills its cache,
 * and is the ONLY await in the boot path — everything downstream stays
 * synchronous, which is what lets `setSetting` keep being callable from a
 * slider's input handler.
 *
 * A save that cannot be read is not a reason to refuse to boot: `Save.open()`
 * falls back to defaults and sets `Save.blocked` when it found something it must
 * not overwrite. */
Platform.init({ bus });
await Save.open();

/* ── the one thing that is different on a Steam Deck ───────────────────────
 * `tests/steam-deck/run.py` measures the smallest text this game renders at
 * 1280x800 and it is 9px — on the Clubhouse, in a Scuffle, on events and in the
 * Shop. That clears the floor the suite asserts and it is small on a
 * seven-inch panel held at arm's length, which is not the same reading distance
 * a 27-inch monitor gets.
 *
 * So Large Text starts ON there, ONCE, on a save that has never expressed a
 * preference. A player who turns it off is never overridden — `deckDefaults`
 * records that the question was asked, not what the answer was — and a save
 * carried to a desktop keeps whatever the player chose. Nothing else about the
 * game changes on a Deck.
 *
 * This is also the only consumer of `steam.isDeck()`. An accessor with no
 * reader is the CONTRACTS 54 class, and shipping the seam without the decision
 * would have been exactly that. */
if (Platform.steam.onDeck && !Save.data.deckDefaults) {
  Save.data.deckDefaults = { at: Date.now(), applied: ['largeText'] };
  Save.data.settings.largeText = true;
  Save.save();
}

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
ctx.platform = Platform;
ctx.storage = storage;
ctx.transition = new Transition(ctx);
ctx.audio = new Audio(ctx);
ctx.tooltip = new Tooltip(ctx);
ctx.atmosphere = new Atmosphere(ctx);
ctx.scenes = new SceneManager(ctx);

/* ── the overlay, and every other reason to stop being a game ──────────────
 * `platform:pause` fires for the Steam overlay AND for the window losing focus,
 * which is the same requirement reached two ways. Stopping the clock freezes
 * every tween, timer and scene update; suspending the AudioContext stops the
 * music. Both are reversible and neither tears anything down.
 *
 * The flush is the part that is easy to leave out: a Deck going to sleep gets
 * `visibilitychange` and may never get another frame, so the moment we are told
 * to pause is the last guaranteed moment to get the save onto disk. */
ctx.achievements = achievements.wire(ctx);
ctx.achievementToast = new AchievementToast(ctx);

/* A Steam Deck has no keyboard, and Deck Verified starts at "fully playable
   with the controller". `Gamepad` reads pads and emits actions; `Navigator`
   decides what an action means on the screen in front of you. Both are inert
   until a pad sends something, so a mouse-and-keyboard player never knows they
   are there. Polling hangs off the clock, so it stops with the game — no stick
   flick is read while the Steam overlay is up. */
ctx.gamepad = new Gamepad(ctx).start();
ctx.navigator = new Navigator(ctx).start();

bus.on('platform:pause', ({ paused }) => {
  if (paused) { clock.pause(); storage.flush(); } else { clock.resume(); }
  ctx.audio?.setPaused?.(paused);
});

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
  ctx, bus, clock, Save, Platform, storage, achievements,
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

/* Anything the player earned offline, or on another machine, or in the browser
   build. No await: a Steam round-trip must not sit in front of the title
   screen, and nothing on screen depends on the answer. */
achievements.reconcile().then((r) => {
  if (r.pushed || r.pulled) console.info(`[achievements] synced +${r.pushed} to Steam, +${r.pulled} from it`);
});
