/**
 * Where saves live.  OWNER: platform.
 *
 *   import { storage } from './storage.js';
 *   await storage.open();          // once, at boot, before the first scene
 *   storage.get('mm.save.v1');     // synchronous from here on
 *   storage.set('mm.save.v1', json);
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Steam Cloud's simplest and most reliable mode is Auto-Cloud, which syncs a
 * DIRECTORY OF FILES. It cannot see `localStorage`: that lives inside the
 * wrapper's own Chromium profile, under a path Steam has no reason to know
 * about, in a format (LevelDB) that would be actively hostile to sync even if it
 * did. So "add Cloud saves" is not a Steamworks checkbox on top of the current
 * code — it is a storage rewrite, and this is it.
 *
 * ── THE API STAYS SYNCHRONOUS, DELIBERATELY ────────────────────────────────
 *
 * `Save.setSetting()` is called from a slider's `input` handler. `Save.saveRun()`
 * is called from inside run mutations, in loops, mid-combat. Making those async
 * would put an `await` in ~40 call sites and an unhandled rejection in every one
 * somebody missed, to buy nothing a player can see.
 *
 * So: read everything ONCE into memory at boot (async, behind the loading
 * screen, where waiting is free), serve every read from the cache, and write
 * through to the backend on a debounced flush plus an unconditional flush on
 * `pagehide`. The cache is the truth the game runs on; the backend is where it
 * survives. `flush()` is exposed for the two places that must not be lazy —
 * quitting, and the moment a run ends.
 *
 * ── CORRUPTION ─────────────────────────────────────────────────────────────
 *
 * Every slot is written twice: `name` and `name.bak`. A read that fails to parse
 * falls back to `.bak`, and a read where BOTH fail returns null rather than
 * throwing, so a mangled file costs a player their save and not their ability to
 * launch the game. This is not hypothetical — the old code's `loadRun()` was a
 * bare `JSON.parse` in a try/catch that returned null, which meant a
 * half-written run save was indistinguishable from no run at all, and
 * `hasRun()` did not even parse: it checked the KEY existed, so a corrupt run
 * put a Continue button on the title screen that led nowhere.
 */

import { Platform } from '../platform/index.js';

const BAK = '.bak';

/** Slots this game owns. `list()` on a host may return other files; we ignore them. */
export const SLOTS = ['mm.save.v1', 'mm.run.v1'];

function lsAvailable() {
  try {
    const k = '__mm_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

export class Storage {
  constructor() {
    /** @type {Map<string,string>} the truth the game runs on */
    this.cache = new Map();
    /** @type {Set<string>} slots changed since the last flush */
    this.dirty = new Set();
    /** 'host' | 'localStorage' | 'memory' */
    this.backend = 'memory';
    this.opened = false;
    /** Set when the backend refused a write. The UI surfaces this once. */
    this.degraded = null;
    this._flushT = 0;
    this._flushing = null;
    this._host = null;
    this.flushMs = 400;
    /** Counts, for tests and the diagnostics line. */
    this.stats = { reads: 0, writes: 0, flushes: 0, recovered: 0, failures: 0 };
  }

  /* ── backend selection ─────────────────────────────────────────────────── */

  /**
   * Choose a backend and fill the cache. Idempotent; safe to await twice.
   * @param {{host?:object, slots?:string[]}} [o] `host` overrides Platform's, for tests.
   */
  async open(o = {}) {
    if (this.opened) return this;
    const host = o.host !== undefined ? o.host : (Platform.host && Platform.host.storage);
    const slots = o.slots || SLOTS;

    if (host && typeof host.read === 'function' && typeof host.write === 'function') {
      this._host = host;
      this.backend = 'host';
    } else if (typeof localStorage !== 'undefined' && lsAvailable()) {
      this.backend = 'localStorage';
    } else {
      this.backend = 'memory';
      this.degraded = 'This device is not letting the game save. Progress will be lost when you quit.';
    }

    for (const name of slots) {
      const v = await this._readSlot(name);
      if (v !== null) this.cache.set(name, v);
    }
    this.opened = true;
    this._wireFlushOnExit();
    return this;
  }

  /** Read one slot, preferring the primary and falling back to the backup. */
  async _readSlot(name) {
    this.stats.reads++;
    const primary = await this._rawRead(name);
    if (primary !== null && looksLikeJson(primary)) return primary;
    const backup = await this._rawRead(name + BAK);
    if (backup !== null && looksLikeJson(backup)) {
      // A primary that exists but does not parse is the interesting case: the
      // process died mid-write, or the file came back mangled from a sync.
      if (primary !== null) {
        this.stats.recovered++;
        console.warn(`[storage] ${name} did not parse; recovered from ${name}${BAK}`);
      }
      return backup;
    }
    if (primary !== null) {
      this.stats.failures++;
      console.warn(`[storage] ${name} is unreadable and has no usable backup`);
    }
    return null;
  }

  async _rawRead(name) {
    try {
      if (this.backend === 'host') {
        const v = await this._host.read(name);
        return v === undefined ? null : v;
      }
      if (this.backend === 'localStorage') return localStorage.getItem(name);
      return this.cache.has(name) ? this.cache.get(name) : null;
    } catch (e) {
      console.warn(`[storage] read ${name} failed`, e);
      return null;
    }
  }

  async _rawWrite(name, text) {
    if (this.backend === 'host') return this._host.write(name, text);
    if (this.backend === 'localStorage') { localStorage.setItem(name, text); return; }
    /* memory: the cache IS the backend */
  }

  async _rawRemove(name) {
    try {
      if (this.backend === 'host') return await this._host.remove(name);
      if (this.backend === 'localStorage') { localStorage.removeItem(name); return; }
    } catch (e) { console.warn(`[storage] remove ${name} failed`, e); }
  }

  /* ── the synchronous surface everything else uses ──────────────────────── */

  /**
   * NOT-YET-OPENED IS A SUPPORTED STATE, and it is most of the test suite.
   *
   * Eight harness pages under `tests/` import `core/save.js` and call
   * `Save.load()` with no boot sequence at all — no `main.js`, no Platform, no
   * `storage.open()`. If an unopened cache answered null, every one of them
   * would read a fresh save and quietly stop testing what it was written to
   * test. So before `open()` this passes straight through to localStorage,
   * which is exactly what the old code did, and the behaviour those pages were
   * written against is unchanged.
   */
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    if (!this.opened) { try { return localStorage.getItem(name); } catch { return null; } }
    return null;
  }
  has(name) { return this.get(name) !== null; }
  keys() { return [...this.cache.keys()]; }

  set(name, text) {
    this.cache.set(name, String(text));
    this.dirty.add(name);
    this.stats.writes++;
    if (!this.opened) { try { localStorage.setItem(name, String(text)); } catch {} return; }
    this._schedule();
  }

  remove(name) {
    this.cache.delete(name);
    this.dirty.add(name);
    if (!this.opened) { try { localStorage.removeItem(name); } catch {} return; }
    this._schedule();
  }

  _schedule() {
    if (this._flushT || typeof setTimeout !== 'function') return;
    this._flushT = setTimeout(() => { this._flushT = 0; this.flush(); }, this.flushMs);
  }

  /**
   * Push every dirty slot to the backend. Backup first, then primary — that
   * order is the whole point: if the process dies between the two writes, the
   * backup holds the PREVIOUS good state and the primary is untouched. The
   * reverse order would leave both halves torn.
   */
  async flush() {
    if (this._flushing) return this._flushing;
    if (!this.dirty.size) return;
    const names = [...this.dirty];
    this.dirty.clear();
    this.stats.flushes++;
    this._flushing = (async () => {
      for (const name of names) {
        try {
          if (!this.cache.has(name)) {
            await this._rawRemove(name);
            await this._rawRemove(name + BAK);
            continue;
          }
          const text = this.cache.get(name);
          const prior = await this._rawRead(name);
          if (prior !== null && prior !== text) await this._rawWrite(name + BAK, prior);
          await this._rawWrite(name, text);
        } catch (e) {
          this.stats.failures++;
          this.dirty.add(name);              // try again on the next flush
          this.degraded = 'The game could not write its save file. Check disk space.';
          console.error(`[storage] flush ${name} failed`, e);
        }
      }
    })();
    try { await this._flushing; } finally { this._flushing = null; }
  }

  /**
   * `pagehide` rather than `beforeunload`: the latter is unreliable on mobile
   * and is ignored outright by some wrappers, and `pagehide` also fires when the
   * page goes into the back/forward cache. `visibilitychange` catches the Deck
   * suspending, which is the one that matters for a handheld — a player closes
   * the lid mid-run and the process is frozen where it stands.
   */
  _wireFlushOnExit() {
    if (typeof window === 'undefined' || this._exitWired) return;
    this._exitWired = true;
    const go = () => { if (this._flushT) { clearTimeout(this._flushT); this._flushT = 0; } this.flush(); };
    window.addEventListener('pagehide', go);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') go(); });
  }

  /* ── export / import ──────────────────────────────────────────────────── */

  /**
   * Everything this game owns, as one JSON string.
   *
   * Two jobs. It is the player's manual backup — which matters more than it
   * sounds when the alternative is "your Cloud save and your local save
   * disagreed and Steam picked the wrong one". And it is how a support request
   * gets a reproducible bug: "send me your save" is otherwise "go find your
   * Chromium profile".
   */
  export() {
    const out = { kind: 'midnight-menagerie/save-bundle', at: Date.now(), slots: {} };
    for (const name of SLOTS) if (this.cache.has(name)) out.slots[name] = this.cache.get(name);
    return JSON.stringify(out);
  }

  /** @returns {{ok:boolean, reason?:string, slots?:string[]}} */
  import(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return { ok: false, reason: 'That file is not readable.' }; }
    if (!parsed || parsed.kind !== 'midnight-menagerie/save-bundle' || typeof parsed.slots !== 'object') {
      return { ok: false, reason: 'That is not a Midnight Menagerie save.' };
    }
    const written = [];
    for (const name of SLOTS) {
      const v = parsed.slots[name];
      if (typeof v !== 'string') continue;
      if (!looksLikeJson(v)) return { ok: false, reason: `The ${name} section is damaged.` };
      this.set(name, v);
      written.push(name);
    }
    if (!written.length) return { ok: false, reason: 'That save is empty.' };
    return { ok: true, slots: written };
  }

  /** For tests and a fresh-start button. */
  async wipe() {
    for (const name of SLOTS) { this.cache.delete(name); this.dirty.add(name); }
    await this.flush();
  }

  describe() {
    return `backend=${this.backend} slots=${this.cache.size} ` +
      `w=${this.stats.writes} f=${this.stats.flushes} recovered=${this.stats.recovered} fail=${this.stats.failures}` +
      (this.degraded ? ` DEGRADED(${this.degraded})` : '');
  }
}

/**
 * Is this slot worth trusting?
 *
 * The bracket check first and the parse second, in that order and not the other
 * way round: a torn write — `{"seed":123,"deck":[` — is the shape this exists to
 * catch, and it is rejected without ever entering the parser. A slot that passes
 * the brackets is parsed for real, because "starts with { and ends with }" is
 * not a guarantee of anything and returning true on it would hand the caller a
 * string that throws two lines later.
 *
 * The parse is not free on a 200 KB run snapshot. It runs on open and on flush,
 * which is a handful of times a minute, and buying certainty there is the right
 * trade — the alternative is discovering the damage at `Run.resume`, past the
 * point where the backup could have been used instead.
 */
export function looksLikeJson(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 2) return false;
  const a = t[0], z = t[t.length - 1];
  if (!((a === '{' && z === '}') || (a === '[' && z === ']'))) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

export const storage = new Storage();
export default storage;
