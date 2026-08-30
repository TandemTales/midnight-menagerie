/**
 * The platform seam.  OWNER: platform.
 *
 *   import { Platform } from './platform/index.js';
 *   if (Platform.steam.available) await Platform.steam.setAchievement('first-win');
 *
 * The game runs in three places and the rest of the codebase must not care which:
 *
 *   browser   a tab. No wrapper, no overlay, no Steam. Saves in localStorage.
 *   desktop   a wrapper (Electron / Tauri / a native webview) with no Steam client.
 *   steam     a wrapper with the Steamworks bridge attached.
 *
 * EVERY capability degrades. There is no branch anywhere else in `game/src` that
 * asks "are we on Steam"; callers ask this module for a capability and get a
 * working object either way. That is deliberate: the Steam build does not exist
 * yet (it needs an App ID, which needs a partner account and a fee, and only the
 * owner can get one), so if the game only worked correctly *with* Steam we would
 * have no way to know whether any of it was right until the day the App ID
 * arrived. Everything below is exercised today by `tests/platform/run.py`
 * against the local backends and against a FAKE host bridge.
 *
 * ── THE HOST BRIDGE CONTRACT ────────────────────────────────────────────────
 *
 * A wrapper sets `window.__MM_HOST__` BEFORE the game's first module evaluates
 * (Electron: a preload script with contextBridge; Tauri: an init script). Every
 * member is optional and every one has a local fallback, so a partial bridge is
 * a supported state rather than a crash. The shape:
 *
 *   name       string    'electron' | 'tauri' | 'webview' | anything
 *   version    string    the WRAPPER's version, not the game's
 *
 *   steam: {
 *     appId            number
 *     available()      -> boolean            client running AND SteamAPI_Init succeeded
 *     setAchievement(id)   -> Promise<boolean>
 *     clearAchievement(id) -> Promise<boolean>     (dev/reset only)
 *     getAchievement(id)   -> Promise<boolean>
 *     setStat(id, value)   -> Promise<boolean>
 *     storeStats()         -> Promise<boolean>     flush to the Steam backend
 *     onOverlay(cb)        -> () => void           cb(open:boolean)
 *     isDeck()         -> boolean
 *     showKeyboard({ text, max, description }) -> Promise<string|null>
 *   }
 *
 *   storage: {
 *     read(name)          -> Promise<string|null>
 *     write(name, text)   -> Promise<void>
 *     remove(name)        -> Promise<void>
 *     list()              -> Promise<string[]>
 *     dir()               -> string            absolute path, for diagnostics
 *   }
 *
 * `storage` is the one that matters most and is the least obvious. Steam Cloud's
 * simplest mode ("Auto-Cloud") syncs a DIRECTORY of files; it cannot see
 * localStorage, which lives inside the wrapper's own Chromium profile. So a
 * wrapper that wants Cloud saves must expose a file-backed storage and point
 * Auto-Cloud at `dir()`. `core/storage.js` is written against exactly this
 * interface and uses localStorage when it is absent.
 *
 * ── WHY A FAKE HOST IS PART OF THE SHIPPED CODE ─────────────────────────────
 *
 * `installFakeHost()` is exported and used by `tests/platform/run.py`. It is not
 * dev-only scaffolding hidden behind a flag: a bridge nobody can stand up is a
 * bridge nobody can test, and the whole reason this file exists is that the real
 * one is months of someone else's work away.
 */

/** Names the bridge may take. Anything else is still accepted, as `'unknown'`. */
export const HOSTS = ['electron', 'tauri', 'webview', 'browser'];

function hostObject() {
  if (typeof window === 'undefined') return null;
  const h = window.__MM_HOST__;
  return (h && typeof h === 'object') ? h : null;
}

/** Never let a bridge method's throw reach a caller. A wrapper is a foreign process. */
async function guard(fn, fallback, label) {
  if (typeof fn !== 'function') return fallback;
  try {
    const v = await fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    console.warn(`[platform] host.${label} threw`, e);
    return fallback;
  }
}

function guardSync(fn, fallback, label) {
  if (typeof fn !== 'function') return fallback;
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    console.warn(`[platform] host.${label} threw`, e);
    return fallback;
  }
}

/* ══ overlay ═══════════════════════════════════════════════════════════════
 * The Steam overlay is a separate compositor layer the client draws OVER the
 * game window. The game never draws it and cannot style it. What the game MUST
 * do is stop being a game while it is up: the player pressed Shift+Tab to read
 * a guide, and an enemy turn resolving behind the overlay is a lost run they
 * did not get to see.
 *
 * Two signals, because they are different events and a build gets both:
 *   overlay   Steam told us. Only ever fires under a Steam host.
 *   focus     the window lost focus for ANY reason — alt-tab, a notification,
 *             the player clicking their second monitor. This one works today,
 *             in a browser tab, and is what `tests/platform/run.py` drives.
 *
 * `Platform.paused` is the OR of the two, and `platform:pause` carries the
 * reason so a scene can tell "Steam is up" from "you tabbed away" if it ever
 * needs to. Nothing currently does, and that is fine — the reason is in the
 * payload so the first thing that needs it does not have to re-plumb it.
 */
class Overlay {
  constructor() {
    this.open = false;
    this.focused = true;
    this._subs = new Set();
    this._offHost = null;
    this._wired = false;
  }

  get paused() { return this.open || !this.focused; }

  /** @param {(state:{paused:boolean, open:boolean, focused:boolean, reason:string}) => void} fn */
  on(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  _emit(reason) {
    const state = { paused: this.paused, open: this.open, focused: this.focused, reason };
    for (const fn of [...this._subs]) {
      try { fn(state); } catch (e) { console.error('[platform:overlay]', e); }
    }
    return state;
  }

  _set(k, v, reason) {
    if (this[k] === v) return;
    this[k] = v;
    this._emit(reason);
  }

  /**
   * Called by `Platform.init`, which is called more than once.
   *
   * THE TWO HALVES HAVE DIFFERENT LIFETIMES and collapsing them into one
   * `if (this._wired) return;` was a bug the suite caught before any of this
   * ran on a real machine. The window listeners must be attached exactly once
   * or a re-init stacks duplicates. The HOST subscription must be re-attached
   * every time, because the host is what changes: the game boots in a wrapper
   * that has not finished initialising Steam, or a test swaps the bridge, and
   * with a single guard the second init silently subscribed to nothing. The
   * overlay would then never pause the game — which is precisely the failure
   * this class exists to prevent, arriving through the door it was watching.
   */
  wire(host) {
    if (typeof window === 'undefined') return;

    if (!this._wired) {
      this._wired = true;
      // Window focus works everywhere, including a plain browser tab.
      window.addEventListener('blur', () => this._set('focused', false, 'blur'));
      window.addEventListener('focus', () => this._set('focused', true, 'focus'));
      // `visibilitychange` catches a minimised window, a backgrounded tab and a
      // Deck going to sleep, none of which reliably fire blur.
      document.addEventListener('visibilitychange', () => {
        this._set('focused', document.visibilityState === 'visible', 'visibility');
      });
      // Start honest rather than optimistic: a game booted into a background
      // tab should not think it has focus.
      this.focused = document.visibilityState !== 'hidden';
    }

    this._wireHost(host);
  }

  _wireHost(host) {
    if (this._offHost) { try { this._offHost(); } catch {} this._offHost = null; }
    const onOverlay = host && host.steam && host.steam.onOverlay;
    if (typeof onOverlay !== 'function') {
      // The bridge went away while the overlay was up. Nothing will ever tell
      // us it closed, so an `open` left true here freezes the game forever.
      this._set('open', false, 'host-gone');
      return;
    }
    try {
      this._offHost = onOverlay((open) => this._set('open', !!open, 'overlay'));
    } catch (e) {
      console.warn('[platform] host.steam.onOverlay threw', e);
    }
  }
}

/* ══ Steam ═════════════════════════════════════════════════════════════════ */
class SteamFacade {
  constructor(host) {
    this._s = (host && host.steam) || null;
    this.appId = this._s ? (Number(this._s.appId) || 0) : 0;
  }

  /** True only when a bridge is present AND it says the client initialised. */
  get available() {
    if (!this._s) return false;
    return guardSync(this._s.available && this._s.available.bind(this._s), false, 'steam.available') === true;
  }

  /** True on Steam Deck hardware. Distinct from `available` — a Deck can run the non-Steam build. */
  get onDeck() {
    if (!this._s) return false;
    return guardSync(this._s.isDeck && this._s.isDeck.bind(this._s), false, 'steam.isDeck') === true;
  }

  setAchievement(id) {
    if (!this._s) return Promise.resolve(false);
    return guard(() => this._s.setAchievement(id), false, 'steam.setAchievement');
  }
  clearAchievement(id) {
    if (!this._s) return Promise.resolve(false);
    return guard(() => this._s.clearAchievement(id), false, 'steam.clearAchievement');
  }
  getAchievement(id) {
    if (!this._s) return Promise.resolve(false);
    return guard(() => this._s.getAchievement(id), false, 'steam.getAchievement');
  }
  setStat(id, value) {
    if (!this._s) return Promise.resolve(false);
    return guard(() => this._s.setStat(id, value), false, 'steam.setStat');
  }
  storeStats() {
    if (!this._s) return Promise.resolve(false);
    return guard(() => this._s.storeStats(), false, 'steam.storeStats');
  }

  /**
   * The Steam on-screen keyboard.
   *
   * This is not a nicety. The Treehouse asks for a room code, and a Deck in
   * gamepad mode has no keyboard — without this the co-op join screen is a dead
   * end on the platform Valve most wants you to support. Resolves null when
   * there is no bridge, and the caller falls back to the in-game key grid.
   */
  showKeyboard(opts = {}) {
    if (!this._s) return Promise.resolve(null);
    return guard(() => this._s.showKeyboard(opts), null, 'steam.showKeyboard');
  }
}

/* ══ the façade ════════════════════════════════════════════════════════════ */
export const Platform = {
  /** 'browser' | 'electron' | 'tauri' | 'webview' | 'unknown' */
  name: 'browser',
  /** The wrapper's own version string, or null in a tab. */
  hostVersion: null,
  /** True when a host bridge is present at all. */
  wrapped: false,
  /** @type {SteamFacade} */
  steam: new SteamFacade(null),
  /** @type {Overlay} */
  overlay: new Overlay(),
  /** The raw bridge, for `core/storage.js`. Nothing else should read it. */
  host: null,
  _inited: false,

  /**
   * Read the bridge and wire the overlay. Called once from `main.js`, before
   * the first scene. Safe to call again — tests call it after swapping the host.
   * @param {{bus?:object}} [ctx]
   */
  init(ctx = {}) {
    const host = hostObject();
    this.host = host;
    this.wrapped = !!host;
    this.name = host ? (typeof host.name === 'string' ? host.name : 'unknown') : 'browser';
    this.hostVersion = host && typeof host.version === 'string' ? host.version : null;
    this.steam = new SteamFacade(host);

    // A fresh Overlay on re-init would drop existing subscribers, so the object
    // is kept and only re-wired. `wire` is idempotent.
    this.overlay.wire(host);
    if (ctx.bus && !this._busBridged) {
      this._busBridged = true;
      this.overlay.on((s) => ctx.bus.emit('platform:pause', s));
    }
    this._inited = true;
    return this;
  },

  /** True when the game should not be advancing: overlay up, or window unfocused. */
  get paused() { return this.overlay.paused; },

  /** One line for a bug report or the settings panel footer. */
  describe() {
    const bits = [`host=${this.name}`];
    if (this.hostVersion) bits.push(`hostVersion=${this.hostVersion}`);
    bits.push(`steam=${this.steam.available ? `yes(app ${this.steam.appId || '?'})` : 'no'}`);
    if (this.steam.onDeck) bits.push('deck=yes');
    bits.push(`storage=${this.host && this.host.storage ? 'host' : 'localStorage'}`);
    return bits.join(' · ');
  },
};

/* ══ the fake host ═════════════════════════════════════════════════════════
 * Everything above is unreachable in a browser without this. It is exported
 * rather than hidden because the alternative is a Steam integration whose first
 * test run is the day the App ID arrives.
 */

/**
 * Install a fake `window.__MM_HOST__` and return a handle for driving it.
 * @param {{steam?:boolean, deck?:boolean, storage?:boolean, appId?:number,
 *          failEvery?:number}} [o]
 */
export function installFakeHost(o = {}) {
  const achievements = new Map();
  const stats = new Map();
  const files = new Map();
  const overlaySubs = new Set();
  let stored = 0, calls = 0;
  const fail = () => o.failEvery ? (++calls % o.failEvery === 0) : false;

  const steam = o.steam === false ? undefined : {
    appId: o.appId || 480,
    available: () => o.steam !== false,
    isDeck: () => !!o.deck,
    setAchievement: async (id) => { if (fail()) throw new Error('fake steam failure'); achievements.set(id, true); return true; },
    clearAchievement: async (id) => { achievements.delete(id); return true; },
    getAchievement: async (id) => !!achievements.get(id),
    setStat: async (id, v) => { stats.set(id, v); return true; },
    storeStats: async () => { stored++; return true; },
    onOverlay: (cb) => { overlaySubs.add(cb); return () => overlaySubs.delete(cb); },
    showKeyboard: async () => (o.keyboardText === undefined ? null : o.keyboardText),
  };

  const storage = o.storage === false ? undefined : {
    read: async (name) => (files.has(name) ? files.get(name) : null),
    write: async (name, text) => { if (fail()) throw new Error('fake write failure'); files.set(name, String(text)); },
    remove: async (name) => { files.delete(name); },
    list: async () => [...files.keys()],
    dir: () => 'C:/fake/steam/userdata/000/mm/remote',
  };

  const prev = typeof window !== 'undefined' ? window.__MM_HOST__ : undefined;
  if (typeof window !== 'undefined') {
    window.__MM_HOST__ = { name: o.name || 'electron', version: o.version || '0.0.0-fake', steam, storage };
  }

  return {
    achievements, stats, files,
    get stored() { return stored; },
    /** Drive the overlay the way Steam would. */
    setOverlay(open) { for (const cb of [...overlaySubs]) cb(!!open); },
    /** Put the bridge back the way it was. */
    uninstall() {
      if (typeof window === 'undefined') return;
      if (prev === undefined) delete window.__MM_HOST__; else window.__MM_HOST__ = prev;
    },
  };
}

export default Platform;
