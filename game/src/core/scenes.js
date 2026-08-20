/**
 * Scene manager. A Scene owns a DOM root + optional THREE.Group.
 * Transitions are authored (see fx/transition.js) so every screen change is deliberate.
 */
import { bus } from './bus.js';

export class Scene {
  constructor(ctx) { this.ctx = ctx; this.root = null; this.group = null; }
  /** Build DOM/3D. Return a promise if async assets are needed. */
  async enter(params) {}
  /** Called every frame while active. */
  update(dt, t) {}
  /** Tear down. Must remove all listeners and 3D objects. */
  async exit() {}
}

export class SceneManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.registry = new Map();
    this.current = null;
    this.currentName = null;
    this.busy = false;
    this.history = [];
    ctx.clock.onFrame((dt, t) => this.current?.update?.(dt, t));
  }
  register(name, factory) { this.registry.set(name, factory); return this; }

  async go(name, params = {}, opts = {}) {
    if (this.busy) { console.warn('[scenes] busy, queued drop:', name); return; }
    const factory = this.registry.get(name);
    if (!factory) throw new Error(`Unknown scene: ${name}`);
    this.busy = true;
    bus.emit('scene:leaving', { from: this.currentName, to: name });

    const trans = this.ctx.transition;
    if (trans && !opts.instant) await trans.cover(opts.transition || 'veil', { to: name, ...opts });

    if (this.current) {
      try { await this.current.exit(); } catch (e) { console.error('[scene exit]', e); }
      this.current.root?.remove();
      if (this.current.group) this.ctx.stage.scene.remove(this.current.group);
    }

    const scene = await factory(this.ctx);
    scene.root = document.createElement('div');
    scene.root.className = `scene scene--${name}`;
    scene.root.dataset.scene = name;
    this.ctx.dom.appendChild(scene.root);
    this.current = scene;
    this.currentName = name;
    this.history.push(name);
    if (this.history.length > 24) this.history.shift();

    try { await scene.enter(params); } catch (e) { console.error('[scene enter]', e); }
    if (scene.group) this.ctx.stage.scene.add(scene.group);

    bus.emit('scene:entered', { name, params });
    if (trans && !opts.instant) await trans.reveal();
    this.busy = false;
    // expose for automated inspection
    document.body.dataset.scene = name;
  }
}
