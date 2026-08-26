/**
 * Music engine.  OWNER: audio agent.
 *
 * The soundtrack lives in audio/soundtrack/ and is copied to
 * game/assets/audio/track###.mp3 by tools/prep_assets.py. Tracks are streamed
 * through <audio> elements (preload="none") into MediaElementAudioSourceNodes,
 * so a 7 MB file never blocks a frame and nothing is decoded up front.
 *
 *   decks ─┬─► deckGain ─┐
 *          └─► deckGain ─┴─► sum ─► tensionLP ─► tensionShelf ─► duck ─► vol ─► out
 *
 * Cue changes are a 2.5 s equal-power crossfade (cos/sin, so the sum holds
 * unity power through the middle instead of dipping).
 * Loops are the same crossfade against a second deck on the same file, which
 * is what makes them gapless even when the master has a fade-out on the tail.
 *
 * ── Which track plays ───────────────────────────────────────────────────────
 * A cue no longer owns a track. Every cue draws from a SHUFFLE BAG over the
 * whole discovered pool: a track cannot repeat until every other track has
 * played, and never plays twice in a row across a bag refill. Within the bag
 * the draw is WEIGHTED by how well a track fits the cue (see MUSIC_FIT), so a
 * boss fight leans dark and a shop leans bright without any track becoming
 * impossible. Weighting can only reorder a cycle, never change how often a
 * track plays: over a full cycle every track plays exactly once.
 *
 * The pool is DISCOVERED AT RUNTIME (see `_discover`) — nothing here is a count
 * of ten. Dropping track011.mp3 in and re-running prep_assets.py is the whole
 * job; an unmeasured track plays with neutral weighting and estimated loop
 * points rather than being skipped.
 *
 * Loop points and per-track level trims below were MEASURED, not guessed — see
 * game/src/audio/analyze.py and docs/AUDIO-MAP.md. They are properties of the
 * FILE, so they survived the move to random selection unchanged.
 */

const BASE = 'assets/audio/';

/**
 * How hard a cue steers its random draw.  ← ONE-LINE SWITCH, designer's call.
 *
 *   0.00  uniform: every track equally likely for every cue (literal "random").
 *   0.25  a nudge — best-fitting track ~2.6x likelier than the worst-fitting.
 *   0.50  DEFAULT — ~7x. Cue character is audible; nothing is ever excluded.
 *   0.75  ~18x. Close to the old fixed mapping most of the time.
 *   1.00  ~48x. Effectively the old mapping, with rare surprises.
 *
 * Because selection is a bag, this changes WHICH cue a track lands under, not
 * how often it is heard. Every value above still plays every track once a cycle.
 */
export const MUSIC_FIT = 0.5;

/**
 * Per-FILE measured properties. Keyed by filename, because that is what they
 * describe.
 *
 *   loopStart/loopEnd  the measured "body window" — a loop never returns into a
 *                      master fade-out (track003 has a 9 s fade-in, track002 a
 *                      2.5 s fade-out).
 *   trimDb             level match to a -15.7 dB reference, i.e. -15.7 - rms.
 *                      The cue adds its own mix-role offset on top.
 *   f                  spectral features, used only to weight the draw.
 *
 * A file that is not in this table still plays: neutral weighting, and a loop
 * window estimated from the real duration once the stream reports it.
 */
export const TRACKS = {
  'track001.mp3': {
    duration: 313.92, loopStart: 0.0, loopEnd: 313.6, trimDb: 0.17,
    f: { bright: 863, lowend: 0.342, air: 0.111, loud: -15.87, crest: 14.14, tempo: 123.6, dyn: 9.82 },
    note: 'By far the darkest: centroid 863 Hz vs a ~1700 Hz set average, 85% rolloff at 1.5 kHz, 34% of energy below 250 Hz. Second-longest.',
  },
  'track002.mp3': {
    duration: 176.1, loopStart: 0.0, loopEnd: 173.6, trimDb: -0.47,
    f: { bright: 2713, lowend: 0.221, air: 0.453, loud: -15.23, crest: 12.74, tempo: 130.8, dyn: 7.92 },
    note: 'Brightest of the set by a wide margin (centroid 2713 Hz, 45% above 2 kHz). 2.5 s fade-out, so the loop turns at 173.6 s.',
  },
  'track003.mp3': {
    duration: 219.36, loopStart: 9.6, loopEnd: 218.4, trimDb: 0.25,
    f: { bright: 2074, lowend: 0.261, air: 0.380, loud: -15.95, crest: 13.58, tempo: 114.8, dyn: 9.12 },
    note: 'Airy (38% above 2 kHz). 9 s fade-in, so the loop re-enters at 9.6 s and only the first pass hears the fade.',
  },
  'track004.mp3': {
    duration: 479.2, loopStart: 0.0, loopEnd: 479.0, trimDb: -0.53,
    f: { bright: 2410, lowend: 0.332, air: 0.383, loud: -15.17, crest: 14.91, tempo: 132.4, dyn: 7.49 },
    note: 'Longest by far (8 min) and the loudest. No fades at either end.',
  },
  'track005.mp3': {
    duration: 153.76, loopStart: 0.0, loopEnd: 153.6, trimDb: -0.87,
    f: { bright: 1852, lowend: 0.323, air: 0.337, loud: -14.83, crest: 13.71, tempo: 106.1, dyn: 8.19 },
    note: 'Warm and open, slowest of the set (~106 bpm), no fades — loops natively.',
  },
  'track006.mp3': {
    duration: 182.32, loopStart: 0.46, loopEnd: 181.2, trimDb: 0.06,
    f: { bright: 1548, lowend: 0.312, air: 0.303, loud: -15.76, crest: 14.21, tempo: 126.4, dyn: 11.92 },
    note: 'Widest dynamic range of the set (11.9 dB) — it breathes.',
  },
  'track007.mp3': {
    duration: 165.16, loopStart: 0.0, loopEnd: 164.0, trimDb: 0.87,
    f: { bright: 2094, lowend: 0.311, air: 0.382, loud: -16.57, crest: 13.88, tempo: 125.0, dyn: 8.42 },
    note: 'Quietest track (-16.6 dB rms) with a high crest.',
  },
  'track008.mp3': {
    duration: 144.0, loopStart: 0.0, loopEnd: 140.4, trimDb: -0.63,
    f: { bright: 1483, lowend: 0.364, air: 0.255, loud: -15.07, crest: 14.59, tempo: 119.7, dyn: 12.6 },
    note: 'Loud (-15.1 dB) with the largest dynamic range of the set (12.6 dB). 2.6 s fade-out.',
  },
  'track009.mp3': {
    duration: 136.76, loopStart: 0.0, loopEnd: 134.4, trimDb: -0.21,
    f: { bright: 1317, lowend: 0.379, air: 0.221, loud: -15.49, crest: 14.88, tempo: 140.6, dyn: 10.68 },
    note: 'Fastest of the set at ~141 bpm, and low-heavy.',
  },
  'track010.mp3': {
    duration: 166.72, loopStart: 0.0, loopEnd: 165.2, trimDb: 0.39,
    f: { bright: 1523, lowend: 0.308, air: 0.252, loud: -16.09, crest: 13.96, tempo: 123.6, dyn: 9.82 },
    note: 'Dark and mid-heavy (44% mids) without being ugly.',
  },
};

/** Features a cue may weight. `longer` is the track duration. */
const FEATURES = ['bright', 'lowend', 'air', 'loud', 'crest', 'tempo', 'dyn', 'longer'];

/**
 * Per-CUE properties. No track — a cue is a *taste*, expressed as weights over
 * the z-scored features above, plus its mix role.
 *
 *   trimDb   mix-role offset, added to the track's own level match. A shop bed
 *            sits 2 dB under a victory sting whatever file is playing.
 *   tension  how far `tension(0..1)` is allowed to darken this cue.
 *   w        draw weights. Same coefficients as `assign()` in analyze.py, so
 *            the reasoning in docs/AUDIO-MAP.md still describes the behaviour —
 *            it is now a preference instead of a hard assignment.
 *            `absX` weights |z| (used to avoid extremes rather than seek them).
 */
export const MUSIC_CUES = {
  title: {
    trimDb: 0.0, tension: 0.35,
    w: { longer: 1.2, crest: 0.9, bright: 0.5, absTempo: -0.6 },
    note: 'Menu bed, the first thing anyone hears — long, breathing, mid-bright, not fast.',
  },
  map: {
    trimDb: -1.5, tension: 0.5,
    w: { crest: 1.0, longer: 0.8, loud: -0.9, air: 0.4 },
    note: 'Blueprint navigation — sparse, curious, low pressure.',
  },
  combat: {
    trimDb: -2.0, tension: 1.0,
    w: { tempo: 1.3, loud: 1.0, longer: 0.8, absBright: -0.3 },
    note: 'The default Scuffle — driving and long, avoiding either brightness extreme.',
  },
  combatAlt: {
    trimDb: -2.0, tension: 1.0,
    w: { tempo: 1.1, loud: 0.9, longer: 0.6, bright: 0.3 },
    note: 'A brighter second Scuffle colour. Nothing routes here by default any more — the shuffle bag already guarantees back-to-back fights differ — but it stays available for an encounter type that wants it.',
  },
  boss: {
    trimDb: -1.0, tension: 1.0,
    w: { lowend: 1.5, longer: 1.2, loud: 0.8, bright: -1.4 },
    note: 'Big Scare — the darkest, heaviest, longest bed available when the draw is made.',
  },
  safe: {
    trimDb: -2.5, tension: 0.25,
    w: { crest: 1.4, loud: -1.2, dyn: 0.6, tempo: -0.4 },
    note: 'Safe Room — quiet, high crest, breathing.',
  },
  shop: {
    trimDb: -2.0, tension: 0.2,
    w: { bright: 1.2, tempo: 0.9, lowend: -0.5 },
    note: 'Lost Things — bright and a bit jaunty; it should sparkle.',
  },
  rescue: {
    trimDb: -0.5, tension: 0.15,
    w: { air: 1.6, bright: 1.1, longer: -0.6 },
    note: 'Companion rescue — air and sparkle; short is fine.',
  },
  victory: {
    trimDb: 0.0, tension: 0.1,
    w: { bright: 1.2, loud: 1.0, longer: -0.4 },
    note: 'Run won — big and bright.',
  },
  defeat: {
    trimDb: -0.5, tension: 0.1,
    w: { lowend: 1.3, tempo: -1.1, bright: -0.8, crest: 0.5 },
    note: 'Run lost — dark and slow, but not ugly.',
  },
};

/** Cue the player is most likely to need next — that one, and only that one, preloads. */
export const NEXT_LIKELY = {
  title: 'map', map: 'combat', combat: 'map', combatAlt: 'map', boss: 'victory',
  safe: 'map', shop: 'map', rescue: 'map', victory: 'title', defeat: 'title',
};

export const MUSIC_IDS = Object.keys(MUSIC_CUES);

const MAX_DECKS = 6;       // buffered <audio> elements kept alive at once
const XFADE = 2.5;         // cue-to-cue crossfade, seconds
const LOOP_XFADE = 2.2;    // loop crossfade, seconds
const DUCK_DB = 6;         // full duck depth at amount = 1
const FIT_SCALE = 1.1;     // MUSIC_FIT 1.0 -> exp(±2.5 * 1.1) odds spread
const FIT_CLAMP = 2.5;     // cap a standardised fit score, so one outlier cannot own a cue
const FADE_GUARD = 2.6;    // s of tail an unmeasured track is assumed to fade out over
const PROBE_MAX = 400;     // hard stop for the fallback probe

function dbToGain(db) { return Math.pow(10, db / 20); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function pad3(n) { return String(n).padStart(3, '0'); }

/** Mean and (population) standard deviation, sd never 0. */
function meanSd(xs) {
  const n = xs.length;
  if (!n) return { m: 0, sd: 1 };
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / n;
  return { m, sd: Math.sqrt(v) || 1 };
}

/** Feature vector for a file, or null when it has never been analysed. */
function featuresOf(file) {
  const t = TRACKS[file];
  if (!t || !t.f) return null;
  return { ...t.f, longer: t.duration };
}

/**
 * Fit weights for every (track, cue) pair over one pool.
 *
 * Features are z-scored across the ANALYSED tracks in the pool, so adding a
 * track re-normalises everything automatically. Each cue's raw score is then
 * standardised against that same analysed set and clamped, which makes
 * MUSIC_FIT mean the same thing for every cue however discriminating its
 * weights happen to be. An unanalysed track scores 0 on every feature, which
 * lands it in the middle of the pack — never favoured, never skipped.
 */
export function fitTable(pool, fit = MUSIC_FIT) {
  const analysed = pool.filter((f) => featuresOf(f));
  const z = {};
  for (const key of FEATURES) {
    const vals = analysed.map((f) => featuresOf(f)[key]);
    const { m, sd } = meanSd(vals);
    z[key] = {};
    analysed.forEach((f, i) => { z[key][f] = (vals[i] - m) / sd; });
  }
  const raw = (file, cue) => {
    const zf = (k) => (z[k] && z[k][file] != null ? z[k][file] : 0);
    let s = 0;
    for (const [k, w] of Object.entries(MUSIC_CUES[cue].w || {})) {
      if (k.startsWith('abs')) {
        const base = k.slice(3, 4).toLowerCase() + k.slice(4);
        s += w * Math.abs(zf(base));
      } else s += w * zf(k);
    }
    return s;
  };

  const out = {};
  for (const cue of MUSIC_IDS) {
    const { m, sd } = meanSd(analysed.map((f) => raw(f, cue)));
    out[cue] = {};
    for (const file of pool) {
      const s = clamp((raw(file, cue) - m) / sd, -FIT_CLAMP, FIT_CLAMP);
      out[cue][file] = Math.exp(s * fit * FIT_SCALE);
    }
  }
  return out;
}

class Deck {
  constructor(ac, url, out) {
    this.url = url;
    this.el = document.createElement('audio');
    this.el.preload = 'none';
    this.el.loop = false;
    this.el.playsInline = true;
    this.el.src = url;
    this.node = ac.createMediaElementSource(this.el);
    this.gain = ac.createGain();
    this.gain.gain.value = 0;
    this.node.connect(this.gain);
    this.gain.connect(out);
    this.stopAt = 0;
    this.playing = false;
    this.lastUsed = 0;
  }
  get ready() { return this.el.readyState >= 3; }
}

export class MusicPlayer {
  /**
   * @param {BaseAudioContext} ac
   * @param {AudioNode} out
   * @param {object} [o]  { base, volume, fit, rng, pool }
   */
  constructor(ac, out, o = {}) {
    this.ac = ac;
    this.base = o.base ?? BASE;
    this.enabled = typeof document !== 'undefined' && typeof ac.createMediaElementSource === 'function';

    this.sum = ac.createGain(); this.sum.gain.value = 1;

    this.tensionLP = ac.createBiquadFilter();
    this.tensionLP.type = 'lowpass';
    this.tensionLP.frequency.value = 20000;
    this.tensionLP.Q.value = 0.4;

    this.tensionShelf = ac.createBiquadFilter();
    this.tensionShelf.type = 'lowshelf';
    this.tensionShelf.frequency.value = 160;
    this.tensionShelf.gain.value = 0;

    this.duck = ac.createGain(); this.duck.gain.value = 1;
    this.vol = ac.createGain(); this.vol.gain.value = o.volume ?? 0.6;

    this.sum.connect(this.tensionLP);
    this.tensionLP.connect(this.tensionShelf);
    this.tensionShelf.connect(this.duck);
    this.duck.connect(this.vol);
    this.vol.connect(out);

    /** @type {Map<string, Deck>} */
    this.decks = new Map();
    this.active = null;        // { cue, deck, slot, rec }
    this.retiring = [];
    this.pending = null;       // cue queued behind the autoplay gate
    this.current = null;       // cue name
    this._used = new Set();    // files whose intro has already been heard
    this._tension = 0;
    this._preloaded = new Set();
    this._playSince = 0;
    this._unlocked = false;
    this._blocked = false;

    // ── selection ──────────────────────────────────────────────────────────
    this.fit = o.fit == null ? MUSIC_FIT : o.fit;
    this._rng = o.rng || Math.random;
    this._est = new Map();     // filename -> estimated record, for unmeasured files
    /** Every draw this session: { cue, track, estimated }. Read by tests/audio. */
    this.history = [];
    this.poolSource = 'builtin';
    this._bag = [];
    this._lastTrack = null;
    // Provisional pool so the very first cue never waits on the network; the
    // real pool lands a few ms later and is merged in without a hiccup.
    this._setPool(o.pool || Object.keys(TRACKS), 'builtin');
    if (!o.pool) this._discover();
  }

  // ── pool ─────────────────────────────────────────────────────────────────

  /** Files currently in rotation. */
  get pool() { return this._pool.slice(); }
  /** What is left of the current cycle. */
  get bag() { return this._bag.slice(); }

  _setPool(list, source) {
    const next = Array.from(new Set(list)).filter((f) => /\.mp3$/i.test(f)).sort();
    if (!next.length) return;
    const prev = this._pool || [];
    if (prev.length === next.length && prev.every((f, i) => f === next[i])) {
      this.poolSource = source;
      return;
    }
    this._pool = next;
    this._fit = fitTable(next, this.fit);
    this.poolSource = source;
    // Keep the cycle honest across a pool change: drop files that vanished,
    // keep files still owed a play, and add arrivals. Anything already heard
    // this cycle stays spent, so a mid-cycle pool change cannot cause a repeat.
    const spent = new Set(prev.filter((f) => !this._bag.includes(f)));
    const keep = this._bag.filter((f) => next.includes(f));
    for (const f of next) {
      if (!keep.includes(f) && !spent.has(f)) keep.push(f);
    }
    this._bag = keep;
  }

  /**
   * Find every soundtrack file without hardcoding a count.
   *
   * 1. `assets/audio/manifest.json`, written by tools/prep_assets.py when it
   *    copies the mp3s. Authoritative, one small request, no 404s.
   * 2. If there is no manifest, probe track001.mp3, track002.mp3 … with HEAD
   *    until one misses. Correct, but the miss is a real 404 the browser logs
   *    to the console, so it is the fallback rather than the mechanism.
   * 3. Failing both, the measured table above — the game is never silent.
   */
  async _discover() {
    if (typeof fetch !== 'function') return;
    try {
      const r = await fetch(this.base + 'manifest.json', { cache: 'no-store' });
      if (r.ok) {
        const m = await r.json();
        const list = Array.isArray(m) ? m : (m.tracks || []);
        if (list.length) { this._setPool(list, 'manifest'); return; }
      }
    } catch { /* no manifest — fall through to the probe */ }

    const found = [];
    for (let i = 1; i <= PROBE_MAX; i++) {
      const name = `track${pad3(i)}.mp3`;
      let ok = false;
      try {
        const r = await fetch(this.base + name, { method: 'HEAD', cache: 'no-store' });
        ok = r.ok;
      } catch { ok = false; }
      if (!ok) break;
      found.push(name);
    }
    if (found.length) this._setPool(found, 'probe');
  }

  // ── selection ────────────────────────────────────────────────────────────

  /** Measured record for a file, or a safe estimate for one we have never analysed. */
  _rec(file) {
    const t = TRACKS[file];
    if (t) return t;
    let e = this._est.get(file);
    if (!e) {
      // Nothing is known yet — native-loop it until the stream reports its
      // duration, at which point `_adopt` installs a guarded loop window.
      e = { duration: 0, loopStart: 0, loopEnd: 0, trimDb: 0, estimated: true, note: 'not analysed' };
      this._est.set(file, e);
    }
    return e;
  }

  /** Real duration arrived: keep the loop clear of any fade-out we cannot see. */
  _adopt(file, duration) {
    const e = this._est.get(file);
    if (!e || !(duration > 0) || e.duration === duration) return;
    e.duration = duration;
    e.loopStart = 0;
    e.loopEnd = Math.max(duration * 0.6, duration - FADE_GUARD);
    if (this.active && this.active.rec === e) {
      this.active.deck.el.loop = this._native(e);
    }
  }

  _weight(file, cue) {
    const row = this._fit[cue];
    const w = row ? row[file] : 1;
    return w > 0 && isFinite(w) ? w : 1;
  }

  /** Candidates for the next draw: the bag, minus the track just heard. */
  _candidates() {
    if (!this._bag.length) this._bag = this._pool.slice();
    if (this._bag.length > 1 && this._lastTrack) {
      const f = this._bag.filter((t) => t !== this._lastTrack);
      if (f.length) return f;
    }
    return this._bag;
  }

  /** Weighted draw WITHOUT replacement — the bag is what guarantees rotation. */
  _draw(cue) {
    const cand = this._candidates();
    const ws = cand.map((f) => this._weight(f, cue));
    let r = this._rng() * ws.reduce((s, w) => s + w, 0);
    let pick = cand[cand.length - 1];
    for (let i = 0; i < cand.length; i++) {
      r -= ws[i];
      if (r <= 0) { pick = cand[i]; break; }
    }
    this._take(pick);
    return pick;
  }

  /** The likeliest draw for a cue, WITHOUT touching the bag. Used by preload. */
  _peek(cue) {
    const cand = this._candidates();
    let best = cand[0], bw = -Infinity;
    for (const f of cand) {
      const w = this._weight(f, cue);
      if (w > bw) { bw = w; best = f; }
    }
    return best;
  }

  _take(file) {
    const i = this._bag.indexOf(file);
    if (i >= 0) this._bag.splice(i, 1);
    this._lastTrack = file;
  }

  // ── public ───────────────────────────────────────────────────────────────

  /** The track a cue is currently on, if any. Selection is per-play, not fixed. */
  url(cue) {
    if (this.active && this.active.cue === cue) return this.base + this.active.track;
    return null;
  }

  /**
   * Start (or crossfade to) a cue. Safe to call before the autoplay gesture.
   *
   * @param {string} cue
   * @param {object} [opts]  { fade, from, reroll, track }
   *   reroll  draw a new track even though this cue is already playing
   *   track   force a specific file (test harness / designer audition)
   */
  play(cue, opts = {}) {
    if (!this.enabled) return;
    const def = MUSIC_CUES[cue];
    if (!def) { console.warn('[audio] unknown music cue:', cue); return; }
    if (this.current === cue && this.active && this.active.deck.playing && !opts.reroll && !opts.track) return;

    if (!this._unlocked) { this.pending = { cue, opts }; this.current = cue; return; }

    const file = opts.track || this._draw(cue);
    if (opts.track) this._take(opts.track);
    const rec = this._rec(file);
    this.history.push({ cue, track: file, estimated: !!rec.estimated });
    if (this.history.length > 400) this.history.splice(0, this.history.length - 400);

    const fade = opts.fade == null ? XFADE : opts.fade;
    const url = this.base + file;
    const slot = this._freeSlot(url);
    const deck = this._deck(url, slot);

    const first = !this._used.has(file);
    this._used.add(file);
    const startAt = opts.from != null ? opts.from : (first ? 0 : rec.loopStart);

    deck.el.preload = 'auto';
    deck.el.loop = this._native(rec);
    try { deck.el.currentTime = startAt; } catch { /* not seekable yet; fixed on canplay */ }
    if (deck.el.readyState < 1) {
      deck.el.addEventListener('loadedmetadata', () => {
        if (rec.estimated) this._adopt(file, deck.el.duration);
        if (startAt > 0) { try { deck.el.currentTime = startAt; } catch {} }
      }, { once: true });
    } else if (rec.estimated) {
      this._adopt(file, deck.el.duration);
    }

    const prev = this.active;
    this.active = { cue, track: file, deck, slot, rec };
    this.current = cue;
    this._playSince = this.ac.currentTime;
    this._nextWarmed = false;          // re-arm the look-ahead for the new cue
    deck.lastUsed = this._playSince;

    this._start(deck);
    this._fadeIn(deck.gain.gain, this._cueLevel(cue, rec), fade);
    if (prev && prev.deck !== deck) this._retire(prev.deck, fade);

    this._applyTension();
  }

  stop(opts = {}) {
    const fade = opts.fade == null ? 1.4 : opts.fade;
    this.pending = null;
    if (this.active) { this._retire(this.active.deck, fade); this.active = null; }
    for (const d of this.decks.values()) if (d.playing) this._retire(d, fade);
    this.current = null;
  }

  /** Called once on the first user gesture. Idempotent. */
  unlock() {
    this._unlocked = true;
    if (this.pending) {
      const p = this.pending; this.pending = null;
      this.current = null;
      this.play(p.cue, p.opts);
    } else if (this.active && !this.active.deck.playing) {
      this._start(this.active.deck);
    }
  }

  setVolume(v) {
    const t = this.ac.currentTime;
    this.vol.gain.cancelScheduledValues(t);
    this.vol.gain.setTargetAtTime(clamp(v, 0, 1), t, 0.05);
  }

  /**
   * 0 = clear, 1 = the walls are closing in. Sweeps a lowpass from 20 kHz down
   * to ~700 Hz, adds low-end weight and trims level, all smoothed.
   */
  tension(v) {
    this._tension = clamp(v, 0, 1);
    this._applyTension();
  }

  /** amount 1 == -6 dB. Recovers smoothly `ms` after it lands. */
  duckBy(amount = 1, ms = 260) {
    const g = this.duck.gain;
    const t = this.ac.currentTime;
    const target = dbToGain(-DUCK_DB * clamp(amount, 0, 3));
    const cur = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    if (target < cur) g.linearRampToValueAtTime(target, t + 0.05);
    else g.setValueAtTime(target, t);
    const hold = t + 0.05 + Math.max(0, ms) / 1000;
    g.setValueAtTime(target, hold);
    g.setTargetAtTime(1, hold, 0.13);
  }

  /**
   * Warm the stream a cue will most likely want next, without playing it and
   * without consuming a bag entry. Only ever one at a time.
   */
  preload(cue) {
    if (!this.enabled) return;
    if (!MUSIC_CUES[cue]) return;
    const file = this._peek(cue);
    if (!file) return;
    const url = this.base + file;
    if (this._preloaded.has(url)) return;
    this._preloaded.add(url);
    const deck = this._deck(url, this._freeSlot(url));
    if (deck.playing) return;
    deck.el.preload = 'auto';
    deck.lastUsed = this.ac.currentTime;
    this._warmDeck = deck;
    try { deck.el.load(); } catch {}
  }

  /** Drive from the game clock. Handles loop crossfades and deck retirement. */
  update() {
    if (!this.enabled) return;
    const now = this.ac.currentTime;

    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const d = this.retiring[i];
      if (now >= d.stopAt) {
        try { d.el.pause(); } catch {}
        d.playing = false;
        d.gain.gain.cancelScheduledValues(now);
        d.gain.gain.setValueAtTime(0, now);
        this.retiring.splice(i, 1);
      }
    }

    const a = this.active;
    if (!a || !a.deck.playing) return;
    const rec = a.rec;

    if (rec.estimated && !(rec.duration > 0)) this._adopt(a.track, a.deck.el.duration);

    if (!this._native(rec)) {
      const ct = a.deck.el.currentTime;
      if (ct > 0 && ct >= rec.loopEnd - LOOP_XFADE && !a.looping) {
        a.looping = true;
        this._loopSwap(a);
      }
    }

    // once the active stream is comfortably buffered, warm the likely next cue
    if (!this._nextWarmed && now - this._playSince > 4 && a.deck.ready) {
      this._nextWarmed = true;
      const nxt = NEXT_LIKELY[a.cue];
      if (nxt) this.preload(nxt);
    }
    a.deck.lastUsed = now;
    this._evict(now);
  }

  /**
   * A run can touch every track, and each buffered <audio> holds a few MB. Keep
   * the most recent MAX_DECKS and tear the rest down (the active deck, its loop
   * sibling and the warmed next cue are never candidates).
   */
  _evict(now) {
    if (this.decks.size <= MAX_DECKS) return;
    const keep = new Set([this.active?.deck, this._warmDeck, ...this.retiring]);
    const idle = [];
    for (const [key, d] of this.decks) {
      if (keep.has(d) || d.playing) continue;
      idle.push([key, d]);
    }
    idle.sort((x, y) => (x[1].lastUsed || 0) - (y[1].lastUsed || 0));
    let over = this.decks.size - MAX_DECKS;
    for (const [key, d] of idle) {
      if (over-- <= 0) break;
      try { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); } catch {}
      try { d.node.disconnect(); d.gain.disconnect(); } catch {}
      this.decks.delete(key);
      this._preloaded.delete(d.url);
    }
  }

  nowPlaying() {
    if (!this.active) return null;
    return {
      cue: this.active.cue, track: this.active.track,
      time: this.active.deck.el.currentTime,
      duration: this.active.rec.duration,
      level: this.active.deck.gain.gain.value,
      estimated: !!this.active.rec.estimated,
      blocked: this._blocked,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** Track level match + the cue's mix role. */
  _cueLevel(cue, rec) {
    return dbToGain((rec.trimDb || 0) + (MUSIC_CUES[cue]?.trimDb || 0));
  }

  _native(rec) {
    return rec.loopStart < 0.15 && (rec.duration - rec.loopEnd) < 0.4;
  }

  _deck(url, slot) {
    const key = url + '#' + slot;
    let d = this.decks.get(key);
    if (!d) { d = new Deck(this.ac, url, this.sum); this.decks.set(key, d); }
    return d;
  }

  _freeSlot(url) {
    const a = this.decks.get(url + '#0');
    if (!a || !a.playing) return 0;
    return 1;
  }

  _start(deck) {
    deck.playing = true;
    const p = deck.el.play();
    if (p && p.catch) {
      p.catch((e) => {
        // autoplay gate, or a stream that has not buffered yet
        deck.playing = false;
        this._blocked = true;
        if (!this._unlocked) this.pending = this.pending || { cue: this.current, opts: {} };
        if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
          console.warn('[audio] music play failed:', e.name, deck.url);
        }
      });
    }
  }

  /** 32-segment cos/sin ramp: equal power, and safe to interrupt at any point. */
  _ramp(param, dir, peak, dur) {
    const t = this.ac.currentTime;
    const v0 = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v0, t);
    const N = 32;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const w = dir === 'in' ? Math.sin(u * Math.PI / 2) : Math.cos(u * Math.PI / 2);
      const val = dir === 'in' ? v0 + (peak - v0) * w : v0 * w;
      param.linearRampToValueAtTime(Math.max(0, val), t + Math.max(0.01, dur) * u);
    }
  }

  _fadeIn(param, peak, dur) { this._ramp(param, 'in', peak, dur); }

  _retire(deck, dur) {
    if (!deck.playing) { try { deck.el.pause(); } catch {} return; }
    this._ramp(deck.gain.gain, 'out', 0, dur);
    deck.stopAt = this.ac.currentTime + Math.max(0.05, dur) + 0.05;
    if (!this.retiring.includes(deck)) this.retiring.push(deck);
  }

  /** Seamless loop: bring up the sibling deck at loopStart, fade this one out. */
  _loopSwap(a) {
    const rec = a.rec;
    const url = this.base + a.track;
    const nextSlot = a.slot === 0 ? 1 : 0;
    const nd = this._deck(url, nextSlot);
    nd.el.preload = 'auto';
    nd.lastUsed = this.ac.currentTime;
    nd.el.loop = false;
    try { nd.el.currentTime = rec.loopStart; } catch {}
    this._start(nd);
    this._fadeIn(nd.gain.gain, this._cueLevel(a.cue, rec), LOOP_XFADE);
    this._retire(a.deck, LOOP_XFADE);
    this.active = { cue: a.cue, track: a.track, deck: nd, slot: nextSlot, rec, looping: false };
  }

  _applyTension() {
    const t = this.ac.currentTime;
    const cap = this.active ? (MUSIC_CUES[this.active.cue]?.tension ?? 1) : 1;
    const v = this._tension * cap;
    // exponential sweep 20 kHz -> 700 Hz reads as linear "darkening" to the ear
    const f = 20000 * Math.pow(700 / 20000, v);
    this.tensionLP.frequency.cancelScheduledValues(t);
    this.tensionLP.frequency.setTargetAtTime(f, t, 0.35);
    this.tensionShelf.gain.cancelScheduledValues(t);
    this.tensionShelf.gain.setTargetAtTime(v * 2.5, t, 0.4);
    this.sum.gain.cancelScheduledValues(t);
    this.sum.gain.setTargetAtTime(dbToGain(-3 * v), t, 0.4);
  }

  dispose() {
    for (const d of this.decks.values()) {
      try { d.el.pause(); d.el.removeAttribute('src'); d.el.load(); } catch {}
      try { d.node.disconnect(); d.gain.disconnect(); } catch {}
    }
    this.decks.clear();
    this.active = null;
  }
}
