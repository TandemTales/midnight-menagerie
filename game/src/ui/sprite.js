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
 *   ping             a beat that does NOT end where it began. The brief asks
 *                    every clip to finish on the idle pose; the pipeline checks
 *                    (first-vs-last silhouette overlap, prep_sprites.PING_IOU),
 *                    and one that missed plays forward and then back, so it
 *                    still lands on idle instead of popping to it.
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
const STILL_ALIAS = {
  crumbula: 'countCrumbula',
  /* The eight Kids, same shape. Their stills came back from the art pass under
     full names -- and one typo, `pryaSHah` for Priya -- while the game has keyed
     them by first name since data/schema.js was written. Aliasing here rather
     than renaming eight files keeps the art as it was delivered, and means a Kid
     resolves through exactly the path a Companion does: no animation index, so
     `_loadStill` picks up the still. When Kid clips ARE built, `clipIndex(slug)`
     finds them first and they animate with nothing else to change. */
  maya: 'mayaChen', mateo: 'mateoAlvarez', amina: 'aminaOkafor', eli: 'eliRosen',
  priya: 'pryaSHah', jordan: 'jordanBrooks', lena: 'lenaYazzie', samir: 'samirHaddad',
};

let _manifest = null;
/** The same manifest once it has arrived, for a caller that has to decide now. */
let _manifestNow = null;

/** The manifest of everything prep_sprites.py built. Never rejects. */
export function spriteManifest() {
  if (!_manifest) {
    _manifest = fetch(`${SPRITES}index.json`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(m => (_manifestNow = m || { animated: {}, stills: {} }));
  }
  return _manifest;
}

/**
 * An enemy's built still by EnemyDef id -- `{ file, w, h }` -- or null.
 *
 * SYNCHRONOUS, because `EnemyView` has to decide in its constructor whether to
 * stand its drawn rig up at all: showing the rig for a frame and then swapping
 * in the painting is a visible flash of a different creature. Null means "no
 * still" only once `manifestReady()` is true; before that it means "not known
 * yet", which is why the combat scene awaits the manifest before it builds.
 */
export function enemyStill(id) {
  return _manifestNow?.enemies?.[id] || null;
}

/** Has the manifest arrived, so that `enemyStill` returning null is an answer? */
export function manifestReady() { return !!_manifestNow; }

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
  /**
   * `opening` is the clip to play on mount and `warm` the clips to fetch up
   * front. Both default to the fight, because that is where a Companion mostly
   * stands -- but the Safe Room mounts one too, and there `ready` ("notices the
   * threat, becomes alert, prepares for action") is the wrong first thing a Kid
   * sees inside a blanket fort, and `attack`/`hurt` are two atlases downloaded
   * for a screen that cannot play either.
   */
  constructor(slug, { opening = 'ready', warm = WARM, enemy = false } = {}) {
    this.slug = String(slug);
    this._opening = opening;
    this._warm = warm;
    /** An enemy, keyed by EnemyDef id: its art is in its own manifest section. */
    this._enemy = !!enemy;
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
    /* AN ENEMY HAS A STILL AND NO CLIPS, and it never asks `animated`: enemy ids
       and Companion slugs are two namespaces, and a lookup that crossed them
       would one day hand a creature a Companion's atlases. */
    if (this._enemy) return this._loadStill();
    const idx = await clipIndex(this.slug);
    if (!idx || !idx.clips) return this._loadStill();
    this.clips = idx.clips;
    this.scale = idx.scale || 1;
    /* The subject's height in frame pixels, so the mount can size a Companion
       without knowing which pipeline produced it. Each slug publishes its own
       `unit`, because a Kid is drawn at `KID_RIG_H` and builds far bigger than
       a Companion; the manifest's single number is the fallback for atlases
       built before that existed. A still is trimmed to its content, so its own
       height IS the figure. */
    this.unit = idx.unit || (await spriteManifest()).targetContentH || 128;
    await Promise.all(this._warm.filter(n => this.clips[n]).map(n => this._atlas(n)));
    /* MOUNTING INTO A FIGHT IS ENTERING COMBAT. The brief's `ready` clip begins
       "in a relaxed neutral pose and ending in the Companion's standard combat
       idle pose", which is exactly that moment, and it needs no trigger of its
       own because a one-shot hands back to idle when it runs out. Falls to idle
       for a Companion with no `ready` built, and for any mount that asked for a
       different opening. */
    if (!this.name) {
      const opening = this.clips[this._opening] ? this._opening : REST_CLIP;
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
    const e = this._enemy
      ? m.enemies?.[this.slug]
      : m.stills?.[STILL_ALIAS[this.slug] || this.slug];
    if (!e) return false;
    this.clips = {
      idle: {
        url: `${this._enemy ? 'enemies' : 'stills'}/${e.file}`, frames: 1, cols: 1, rows: 1,
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
   * Mid-beat: a one-shot is playing, or one is still downloading to play.
   *
   * What an AMBIENT trigger asks before starting a clip of its own. A payoff
   * that lands outside a play -- Cushion spending Stuffing in the enemy phase,
   * Patience paid at the start of a turn -- should animate, but never by
   * cutting off the hit reaction or the Trick the Kid just played. Idle, the
   * loops and a held `defeat` all count as free.
   */
  get busy() {
    if (this._pending) return true;
    if (!this.name || !this.clips || this.done) return false;
    const c = this.clips[this.name];
    return !!c && !c.loop && this.name !== REST_CLIP;
  }

  /** Seconds one play of a clip lasts; a `ping` runs its frames twice. */
  duration(name) {
    const c = this.clips?.[name];
    return c ? (c.ping ? 2 : 1) * (c.frames || 1) / (c.fps || 24) : 0;
  }

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
    const dur = this.duration(this.name);
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
    else if (c.ping) {
      // There and back -- 0..n-1, then n-1..0 -- so the frame a finished ping
      // leaves on screen is the one it started from, not the one it reached.
      i = Math.min(i, 2 * c.frames - 1);
      if (i >= c.frames) i = 2 * c.frames - 1 - i;
    } else i = Math.min(i, c.frames - 1);
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
