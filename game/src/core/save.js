/**
 * Persistent meta-progression + run autosave.  OWNER: platform.
 *
 * NOT "in localStorage" any more, which is what the old first line of this file
 * said. Everything goes through `core/storage.js`, which picks a backend: a
 * host's file storage when the game is running inside a wrapper (the only shape
 * Steam Cloud can sync — Auto-Cloud syncs a DIRECTORY, and localStorage lives in
 * a Chromium profile it cannot see), and localStorage otherwise. The API here is
 * unchanged and still synchronous, because `setSetting` is called from a
 * slider's input handler and `saveRun` from inside run mutations.
 *
 * ── VERSIONS ───────────────────────────────────────────────────────────────
 *
 * `deepMerge(DEFAULT, parsed)` was the whole migration story, and it is a good
 * default for ADDING a key: a save from before `partyHauntLevel` existed gets
 * one, at 0, and nothing breaks. It has no answer for two harder cases, and
 * both of them arrive the moment there is a Steam build:
 *
 *   OLD -> NEW  a key changed meaning or moved. `MIGRATIONS` runs in order.
 *   NEW -> OLD  a save from a LATER build. This is not hypothetical the moment
 *               Cloud is on: play on the desktop, then launch the Deck before
 *               it has updated. The old code would deepMerge whatever it did not
 *               understand, drop the rest, and write the result back over the
 *               newer save on the first setting change. That is a player's
 *               entire history gone, silently, from turning down the music.
 *               `load()` now REFUSES a future save, leaves the bytes alone, and
 *               sets `Save.blocked` for the UI to explain.
 */
import { storage } from './storage.js';

const KEY = 'mm.save.v1';
const RUN = 'mm.run.v1';

/**
 * Bump when a migration is added below, never otherwise.
 *
 * 1 -> 2: `achievements` was added. deepMerge covers it, so the bump exists to
 *         give the future-save refusal something to compare against — a build
 *         that writes achievements must not have its saves silently accepted and
 *         re-written by a build that would drop them.
 */
export const SAVE_VERSION = 2;

/**
 * version -> a function taking the parsed save at that version and returning it
 * at version+1. Run in order by `migrate()`. Each is handed a structuredClone,
 * so a throw leaves the original untouched.
 */
export const MIGRATIONS = {
  1: (d) => {
    if (!d.achievements) d.achievements = { unlocked: {}, counters: {}, seen: {} };
    d.version = 2;
    return d;
  },
};

/**
 * @returns {{ok:true, data:object} | {ok:false, reason:string, future?:boolean}}
 */
export function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not an object' };
  let v = Number(parsed.version);
  if (!Number.isFinite(v) || v < 1) v = 1;
  if (v > SAVE_VERSION) {
    return { ok: false, future: true, reason: `save is version ${v}, this build reads ${SAVE_VERSION}` };
  }
  let d = structuredClone(parsed);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, reason: `no migration from version ${v}` };
    try { d = step(d); } catch (e) { return { ok: false, reason: `migration ${v} threw: ${e && e.message}` }; }
    const next = Number(d.version);
    if (!(next > v)) return { ok: false, reason: `migration ${v} did not advance the version` };
    v = next;
  }
  return { ok: true, data: d };
}

/**
 * The highest Haunt the game offers.
 *
 * `scenes/clubhouse.js` and `scenes/select.js` each carry their own DISPLAY
 * table of Haunt names — two copies, which is a drift waiting to happen and is
 * not made worse here. This is the only number PROGRESSION reads, and it lives
 * with the save because the save is what it bounds.
 */
export const MAX_HAUNT = 5;

const DEFAULT = {
  version: SAVE_VERSION,
  createdAt: null,
  companionsRescued: [],       // slugs
  kidsUnlocked: ['maya'],
  petsRescued: [],
  clues: {},                   // kid slug -> [clue ids]
  blueprint: { revealed: ['foyer'] },
  hauntLevel: 0,               // ascension analogue — the SOLO ladder
  partyHauntLevel: 0,          // and the party one, climbed separately
  stats: { runs: 0, wins: 0, cardsPlayed: 0, damageDealt: 0, bestFloor: 0 },
  settings: {
    music: 0.6, sfx: 0.8, master: 0.9,
    screenShake: 1, flashes: 1, speed: 1,
    fastMode: false, colorblind: 'off', reduceMotion: false,
    quality: 'auto',            // 'auto' | 'high' | 'medium' | 'low' — see Stage.setTier
    showDamageNumbers: true, autoEndTurn: false, confirmSingleTarget: false,
    largeText: false,
  },
  seenTutorials: [],
  /** Set once on a Steam Deck, so the first-run defaults are never re-applied. */
  deckDefaults: null,
  /** Filled by `core/achievements.js`. Lives here so a save backup carries it. */
  achievements: { unlocked: {}, counters: {}, seen: {} },
};

function deepMerge(base, over) {
  if (over === undefined || over === null) return structuredClone(base);
  if (typeof base !== 'object' || Array.isArray(base)) return over;
  const out = structuredClone(base);
  for (const k in over) out[k] = deepMerge(base[k], over[k]);
  return out;
}

export const Save = {
  data: structuredClone(DEFAULT),

  /**
   * Set when `load()` found a save it must not touch. Truthy means the game is
   * running on defaults and MUST NOT write: `save()` is a no-op while it is set,
   * so nothing the player does in this session can destroy the real save.
   * `scenes/title.js` is where a player would be told.
   * @type {null|{reason:string, future:boolean}}
   */
  blocked: null,

  /** Async, once, at boot: pick a backend and fill its cache. Then `load()`. */
  async open() {
    await storage.open();
    return this.load();
  },

  load() {
    this.blocked = null;
    let raw = null;
    try { raw = storage.get(KEY); } catch { raw = null; }
    if (!raw) {
      this.data = structuredClone(DEFAULT);
      if (!this.data.createdAt) this.data.createdAt = Date.now();
      return this.data;
    }
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      // Unreadable and storage could not recover it from the backup either.
      // Start fresh rather than refusing to boot, but do NOT block writes:
      // there is nothing left to protect.
      this.data = structuredClone(DEFAULT);
      this.data.createdAt = Date.now();
      return this.data;
    }
    const m = migrate(parsed);
    if (!m.ok) {
      this.blocked = { reason: m.reason, future: !!m.future };
      console.warn(`[save] refusing to load: ${m.reason}`);
      this.data = structuredClone(DEFAULT);
      this.data.createdAt = Date.now();
      return this.data;
    }
    this.data = deepMerge(DEFAULT, m.data);
    this.data.version = SAVE_VERSION;
    if (!this.data.createdAt) this.data.createdAt = Date.now();
    return this.data;
  },

  save() {
    if (this.blocked) return false;
    try { storage.set(KEY, JSON.stringify(this.data)); return true; } catch { return false; }
  },

  /** Get it on disk NOW — quitting, and the moment a run ends. */
  flush() { return storage.flush(); },

  reset() {
    this.blocked = null;
    this.data = structuredClone(DEFAULT);
    this.data.createdAt = Date.now();
    this.save();
    this.clearRun();
  },

  get settings() { return this.data.settings; },
  setSetting(k, v) { this.data.settings[k] = v; this.save(); },

  saveRun(state) {
    if (this.blocked) return false;
    try { storage.set(RUN, JSON.stringify(state)); return true; } catch { return false; }
  },
  loadRun() {
    try { const r = storage.get(RUN); return r ? JSON.parse(r) : null; } catch { return null; }
  },
  clearRun() { try { storage.remove(RUN); } catch {} },

  /**
   * Is there a run to continue?
   *
   * This used to be `!!localStorage.getItem(RUN)` — the KEY existing, not the
   * VALUE parsing. A half-written run save is a string, so it was truthy, so the
   * title screen offered Continue and `loadRun()` then returned null and the
   * button led nowhere. It parses now, which is the same question `loadRun` asks
   * and therefore the same answer.
   */
  hasRun() {
    const r = this.loadRun();
    return !!(r && typeof r === 'object');
  },

  /* ── backup, and the Cloud conflict a player can actually fix ──────────── */

  /** Everything this game owns, as one JSON string the player can keep. */
  exportAll() { return storage.export(); },
  /** @returns {{ok:boolean, reason?:string, slots?:string[]}} */
  importAll(text) {
    const r = storage.import(text);
    if (r.ok) this.load();
    return r;
  },

  /** One line for a bug report. */
  describe() {
    return `save v${this.data.version} · ${storage.describe()}` + (this.blocked ? ` · BLOCKED(${this.blocked.reason})` : '');
  },

  /* ── The Haunt ladder ─────────────────────────────────────────────────────
   *
   * TWO ladders, and a party does not climb the solo one.
   *
   * `docs/STS2-REFERENCE.md` §8.1 is unusually direct about this and we had no
   * answer at all: Multiplayer Ascension is tracked SEPARATELY from
   * single-player, it is gated by the weakest player in the lobby, and on a won
   * run the ENTIRE lobby earns the next level. Nothing in this project keyed
   * Haunt progression to party size — and the ladder did not move on a win
   * either, for anyone, so `hauntLevel` was a number that could only ever be 0.
   *
   * Separate is the part that matters. A Haunt cleared by four Kids is not
   * evidence that one Kid can clear it: the party curve multiplies enemy
   * Courage but never enemy damage, and four decks draw four times as many
   * answers. One ladder would let a group unlock Haunt 5 and then hand a solo
   * player a fight nothing in their history says they can take.
   *
   * "Credited to everyone" falls out rather than being built: every client
   * advances its OWN save on a shared win, so all four earn it at once without
   * anybody owning the ladder. "Gated by the weakest" needs the lobby to
   * compare saves and is therefore transport work — `hauntLevelFor` is the
   * seam it will call, with the lobby taking the MIN across peers.
   */

  /** Which ladder a run of this size climbs. */
  hauntKey(partySize = 1) {
    return (partySize | 0) > 1 ? 'partyHauntLevel' : 'hauntLevel';
  },

  /** The highest Haunt unlocked for a party of this size. */
  hauntLevelFor(partySize = 1) {
    const raw = Number(this.data[this.hauntKey(partySize)] ?? 0) || 0;
    return Math.max(0, Math.min(MAX_HAUNT, raw));
  },

  /**
   * A won run unlocks the next Haunt on ITS OWN ladder.
   *
   * Keyed off the Haunt the run was PLAYED at, not the unlocked maximum, so
   * clearing Haunt 1 while 3 is unlocked cannot walk the ladder backwards and
   * cannot be farmed for a level you already have.
   */
  advanceHaunt(partySize = 1, clearedAt = 0) {
    const key = this.hauntKey(partySize);
    const now = Math.max(0, Number(this.data[key] ?? 0) || 0);
    const want = Math.min(MAX_HAUNT, Math.max(0, clearedAt | 0) + 1);
    if (want <= now) return now;
    this.data[key] = want;
    this.save();
    return want;
  },
};
