/**
 * Companion sprite animation: atlas discovery, clip timing, frame selection.
 * OWNER: frontend agent (pairs with ui/enemy.js, which mounts what this drives).
 *
 * `tools/prep_sprites.py` turns the authored sheets in `animations/` into one
 * atlas per clip plus an index.json describing them. This file is the runtime
 * half: it loads that index, keeps the clock, and answers "which cell of which
 * atlas, at what opacity, right now". It draws nothing and touches no DOM, so
 * the same player can drive an SVG <image> (which is what PlayerView does), a
 * canvas, or a CSS background-position without changing.
 *
 * ── what the index gives us, and why each field is there ───────────────────
 *   fw, fh, cols     the frame grid inside the atlas
 *   anchor [x, y]    the subject's FEET inside a frame, in frame pixels. Clips
 *                    have different frame sizes -- `attack` is a lunge and
 *                    needs a bigger box than `idle` -- so lining clips up by
 *                    their frame corner makes the Companion hop every time one
 *                    ends. Lining them up by this point does not.
 *   loop             `idle` and `caution` cycle; everything else is a beat.
 *   hold             `defeat` stops on its last frame. The brief: "The final
 *                    frame should be a stable defeated pose and should not
 *                    return to idle."
 *   fade[]           per-frame opacity for the clips that defocus mid-way
 *                    (`spectral`, `zoomies`). Measured, not authored -- see the
 *                    dissolve section of prep_sprites.py.
 *
 * Everything else in this file follows one rule from the brief: every clip but
 * `defeat` "must return precisely to the normal idle position", so a one-shot
 * that runs out hands back to `idle` on its own and callers never have to.
 */

import { assets } from '../core/assets.js';

const SPRITES = new URL('../../assets/sprites/', import.meta.url).href;

/** The clip every one-shot falls back to when it finishes. */
export const REST_CLIP = 'idle';

/**
 * Loaded eagerly when a Companion mounts. `idle` is what is on screen the
 * moment combat starts; the other two are the clips a fight reaches soonest,
 * and a one-shot that has to wait for a download has already missed its beat.
 * Everything else loads the first time it is asked for.
 */
const WARM = ['idle', 'attack', 'hurt'];

/**
 * Where a Companion's slug and its still's filename disagree. One entry, and it
 * is a naming difference in the source art rather than anything meaningful:
 * the game calls him `crumbula` and the sprite arrived as `countCrumbula`.
 */
const STILL_ALIAS = { crumbula: 'countCrumbula' };

let _manifest = null;

/** The manifest of everything prep_sprites.py built. Never rejects. */
export function spriteManifest() {
  if (!_manifest) {
    _manifest = fetch(`${SPRITES}index.json`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(m => m || { animated: {}, stills: {} });
  }
  return _manifest;
}

/** URL of a repaired still, or null if that name has none. */
export async function stillSrc(name) {
  const m = await spriteManifest();
  const e = m.stills?.[name];
  return e ? `${SPRITES}stills/${e.file}` : null;
}

/** Does this Companion have animation built for it? */
export async function hasAnimation(slug) {
  const m = await spriteManifest();
  return !!m.animated?.[slug];
}

const _indexes = new Map();

/**
 * One Companion's clip index, or null if it has none.
 *
 * ASKS THE MANIFEST FIRST, and that is not an optimisation. Fifteen of the
 * sixteen Companions have no atlas yet, and requesting their index directly
 * meant fifteen 404s in the console of every fight — which `tests/combat-scene`
 * rightly fails on, and which would have buried a real load error in noise.
 * The manifest is one request that always exists and already lists exactly who
 * has been built.
 */
function clipIndex(slug) {
  if (!_indexes.has(slug)) {
    _indexes.set(slug, spriteManifest().then((m) => (
      m.animated?.[slug]
        ? fetch(`${SPRITES}${slug}/index.json`).then(r => (r.ok ? r.json() : null))
        : null
    )).catch(() => null));
  }
  return _indexes.get(slug);
}

/**
 * One Companion's animation state.
 *
 * Timing is accumulated in SECONDS and converted to a frame index on read,
 * rather than counting frames per tick. A 60fps clip stepped once per rendered
 * frame runs at whatever rate the display happens to be, which is a different
 * animation on a 144Hz monitor; this way the clip lasts as long as it says it
 * does and a slow frame drops a frame instead of stretching the beat.
 */
export class ClipPlayer {
  constructor(slug) {
    this.slug = String(slug);
    this.clips = null;
    this.scale = 1;
    this.name = null;
    this.t = 0;
    this.done = false;
    /** Set while a requested clip is still downloading, so we can snap to it. */
    this._pending = null;
    /* TWO maps, deliberately. `_loading` holds the in-flight promise so a clip
       is only ever fetched once; `_ready` holds the DECODED image. Keeping one
       map of promises made every clip look loaded the instant it was requested
       -- a promise is truthy -- so the first frame of a cold clip was drawn
       against an atlas the browser did not have yet. */
    this._loading = new Map();
    this._ready = new Map();
    this.ready = this._load();
  }

  async _load() {
    const idx = await clipIndex(this.slug);
    if (!idx || !idx.clips) return this._loadStill();
    this.clips = idx.clips;
    this.scale = idx.scale || 1;
    /* The subject's height in frame pixels, so the mount can size a Companion
       without knowing which pipeline produced it. Animated clips are all built
       to the same figure (prep_sprites.TARGET_CONTENT_H, republished in the
       manifest so it is never duplicated as a constant over here); a still is
       trimmed to its content, so its own height IS the figure. */
    this.unit = (await spriteManifest()).targetContentH || 128;
    await Promise.all(WARM.filter(n => this.clips[n]).map(n => this._atlas(n)));
    /* MOUNTING IS ENTERING COMBAT. The brief's `ready` clip begins "in a
       relaxed neutral pose and ending in the Companion's standard combat idle
       pose", which is exactly this moment, and it needs no trigger of its own
       because a one-shot hands back to idle when it runs out. Falls straight to
       idle for a Companion that has no `ready` built. */
    if (!this.name) {
      const opening = this.clips.ready ? 'ready' : REST_CLIP;
      if (this.clips[opening]) { await this._atlas(opening); this.play(opening); }
    }
    return true;
  }

  /**
   * FALLBACK FOR THE FIFTEEN. Only Marmalade has animation built; the rest have
   * a single repaired still, and a still is just a clip with one frame. Dressing
   * it as one means `PlayerView` has no second code path and no second set of
   * bugs — the Companion that cannot move is drawn by exactly the machinery that
   * draws the one that can, and the flat `PAL_ART` glyph is replaced either way.
   */
  async _loadStill() {
    const m = await spriteManifest();
    const key = STILL_ALIAS[this.slug] || this.slug;
    const e = m.stills?.[key];
    if (!e) return false;
    this.clips = {
      idle: {
        url: `stills/${e.file}`, frames: 1, cols: 1, rows: 1,
        fw: e.w, fh: e.h, anchor: [e.w / 2, e.h], loop: true, fps: 1,
      },
    };
    this.scale = 1;
    this.unit = e.h;
    await this._atlas(REST_CLIP);
    this.play(REST_CLIP);
    return true;
  }

  /** Where one clip's image lives, relative to the sprites root. */
  _url(c) { return c.url || `${this.slug}/${c.file}`; }

  /** Ensure one clip's atlas is decoded. Resolves to the Image, or null. */
  _atlas(name) {
    if (this._loading.has(name)) return this._loading.get(name);
    const c = this.clips?.[name];
    if (!c) return Promise.resolve(null);
    const p = assets.image(`${SPRITES}${this._url(c)}`)
      .then((img) => { this._ready.set(name, img); return img; })
      .catch(() => null);
    this._loading.set(name, p);
    return p;
  }

  /** Has this clip's atlas actually finished decoding? */
  isReady(name) { return this._ready.has(name); }

  has(name) { return !!this.clips?.[name]; }

  /**
   * Start a clip. Restarts it if it is already playing unless `keep` is set,
   * which is what an idle wants -- re-asserting the rest pose every time a beat
   * ends should not jump the loop back to frame zero.
   */
  play(name, { keep = false } = {}) {
    if (!this.has(name)) return false;
    if (keep && this.name === name) return true;
    if (!this._ready.has(name)) {
      // Not downloaded yet. Keep drawing whatever is on screen and switch the
      // moment it lands, so a cold clip degrades to "late" rather than "blank".
      this._pending = name;
      this._atlas(name).then(() => {
        if (this._pending === name) { this._pending = null; this._start(name); }
      });
      return true;
    }
    this._start(name);
    return true;
  }

  _start(name) {
    this.name = name;
    this.t = 0;
    this.done = false;
  }

  advance(dt) {
    if (!this.name || this.done) return;
    this.t += Math.max(0, dt);
    const c = this.clips[this.name];
    const dur = c.frames / (c.fps || 24);
    if (this.t < dur || c.loop) return;
    // A one-shot has run out. `hold` stays on its last frame; everything else
    // hands back to the rest pose, which the brief guarantees it already
    // matches -- "End exactly in the pose used by the normal combat idle".
    if (c.hold) { this.done = true; this.t = dur; return; }
    if (this.has(REST_CLIP)) this._start(REST_CLIP);
    else this.done = true;
  }

  /**
   * What to draw now, or null before the index has loaded.
   * `still` freezes on frame 0 for reduced-motion without unmounting anything.
   */
  frame({ still = false } = {}) {
    if (!this.name || !this.clips) return null;
    const c = this.clips[this.name];
    const fps = c.fps || 24;
    let i = still ? 0 : Math.floor(this.t * fps);
    if (c.loop) i %= c.frames;
    else i = Math.min(i, c.frames - 1);
    return {
      clip: this.name,
      index: i,
      col: i % c.cols,
      row: Math.floor(i / c.cols),
      fw: c.fw, fh: c.fh,
      atlasW: c.cols * c.fw, atlasH: c.rows * c.fh,
      anchor: c.anchor || [c.fw / 2, c.fh],
      unit: this.unit || c.fh,
      opacity: c.fade ? (c.fade[i] ?? 1) : 1,
      src: `${SPRITES}${this._url(c)}`,
      loaded: this._ready.has(this.name),
    };
  }

  destroy() { this._loading.clear(); this._ready.clear(); }
}
