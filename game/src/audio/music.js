/**
 * Music engine.  OWNER: audio agent.
 *
 * Ten licensed tracks live in game/assets/audio. They are streamed through
 * <audio> elements (preload="none") into MediaElementAudioSourceNodes, so a
 * 7 MB file never blocks a frame and nothing is decoded into memory up front.
 *
 * Every number in MUSIC_CUES below was measured, not guessed — see
 * game/src/audio/analyze.py and docs/AUDIO-MAP.md.
 *
 *   decks ─┬─► deckGain ─┐
 *          └─► deckGain ─┴─► sum ─► tensionLP ─► tensionShelf ─► duck ─► vol ─► out
 *
 * Cue changes are a 2.5 s equal-power crossfade (cos/sin, so the sum holds
 * unity power through the middle instead of dipping).
 * Loops are the same crossfade against a second deck on the same file, which
 * is what makes them gapless even when the master has a fade-out on the tail.
 */

const BASE = 'assets/audio/';

/**
 * trimDb = (level match to a -15.7 dB reference) + (mix role offset).
 * loopStart / loopEnd are inside the measured "body" window, so a loop never
 * returns into the master fade-out.
 */
export const MUSIC_CUES = {
  title: {
    track: 'track006.mp3', duration: 182.32, loopStart: 0.46, loopEnd: 181.2,
    trimDb: 0.1, tension: 0.35,
    note: '182 s, centroid 1548 Hz, widest dynamic range of the set (11.9 dB) — it breathes, which a menu bed must.',
  },
  map: {
    track: 'track003.mp3', duration: 219.36, loopStart: 9.6, loopEnd: 218.4,
    trimDb: -1.3, tension: 0.5,
    note: '219 s, airy (38% above 2 kHz), 9 s fade-in so the loop re-enters at 9.6 s.',
  },
  combat: {
    track: 'track004.mp3', duration: 479.2, loopStart: 0.0, loopEnd: 479.0,
    trimDb: -2.5, tension: 1.0,
    note: 'Longest track by far (8 min) and the loudest — a fight can run long without repeating.',
  },
  combatAlt: {
    track: 'track009.mp3', duration: 136.76, loopStart: 0.0, loopEnd: 134.4,
    trimDb: -2.2, tension: 1.0,
    note: 'Fastest of the set at ~141 bpm; alternates with `combat` so back-to-back Scuffles differ.',
  },
  boss: {
    track: 'track001.mp3', duration: 313.92, loopStart: 0.0, loopEnd: 313.6,
    trimDb: -0.8, tension: 1.0,
    note: 'By far the darkest: centroid 863 Hz vs a 1700 Hz set average, 85% rolloff at 1.5 kHz, 34% of energy below 250 Hz. Also the second-longest.',
  },
  safe: {
    track: 'track007.mp3', duration: 165.16, loopStart: 0.0, loopEnd: 164.0,
    trimDb: -1.6, tension: 0.25,
    note: 'Quietest track (-16.6 dB rms) with a high crest — the Safe Room bed.',
  },
  shop: {
    track: 'track002.mp3', duration: 176.1, loopStart: 0.0, loopEnd: 173.6,
    trimDb: -2.5, tension: 0.2,
    note: 'Brightest track by a wide margin (centroid 2713 Hz, 45% above 2 kHz) — Lost Things should sparkle.',
  },
  rescue: {
    track: 'track005.mp3', duration: 153.76, loopStart: 0.0, loopEnd: 153.6,
    trimDb: -1.4, tension: 0.15,
    note: 'Warm and open, no fades at either end, loops natively.',
  },
  victory: {
    track: 'track008.mp3', duration: 144.0, loopStart: 0.0, loopEnd: 140.4,
    trimDb: -0.6, tension: 0.1,
    note: 'Loud (-15.1 dB) with the largest dynamic range of the set (12.6 dB).',
  },
  defeat: {
    track: 'track010.mp3', duration: 166.72, loopStart: 0.0, loopEnd: 165.2,
    trimDb: -0.1, tension: 0.1,
    note: 'Dark and mid-heavy (44% mids, centroid 1523 Hz) without being ugly.',
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

function dbToGain(db) { return Math.pow(10, db / 20); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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
   * @param {object} [o]  { base, volume }
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
    this.active = null;        // { cue, deck, slot }
    this.retiring = [];
    this.pending = null;       // cue queued behind the autoplay gate
    this.current = null;       // cue name
    this._used = new Set();
    this._combatFlip = 0;
    this._tension = 0;
    this._tensionCap = 1;
    this._preloaded = new Set();
    this._playSince = 0;
    this._unlocked = false;
    this._blocked = false;
  }

  // ── public ───────────────────────────────────────────────────────────────

  url(cue) {
    const c = MUSIC_CUES[cue];
    return c ? this.base + c.track : null;
  }

  /** Start (or crossfade to) a cue. Safe to call before the autoplay gesture. */
  play(cue, opts = {}) {
    if (!this.enabled) return;
    let name = cue;
    if (name === 'combat') {
      // alternate the two Scuffle beds so consecutive fights do not repeat
      name = (this._combatFlip++ % 2 === 0) ? 'combat' : 'combatAlt';
    }
    const def = MUSIC_CUES[name];
    if (!def) { console.warn('[audio] unknown music cue:', cue); return; }
    if (this.current === name && this.active && this.active.deck.playing) return;

    if (!this._unlocked) { this.pending = { cue, opts }; this.current = name; return; }

    const fade = opts.fade == null ? XFADE : opts.fade;
    const url = this.base + def.track;
    const slot = this._freeSlot(url);
    const deck = this._deck(url, slot);

    const first = !this._used.has(name);
    this._used.add(name);
    const startAt = opts.from != null ? opts.from : (first ? 0 : def.loopStart);

    deck.el.preload = 'auto';
    deck.el.loop = this._native(def);
    try { deck.el.currentTime = startAt; } catch { /* not seekable yet; fixed on canplay */ }
    if (deck.el.readyState < 1 && startAt > 0) {
      deck.el.addEventListener('loadedmetadata', () => {
        try { deck.el.currentTime = startAt; } catch {}
      }, { once: true });
    }

    const prev = this.active;
    this.active = { cue: name, deck, slot, def };
    this.current = name;
    this._playSince = this.ac.currentTime;
    this._nextWarmed = false;          // re-arm the look-ahead for the new cue
    deck.lastUsed = this._playSince;

    this._start(deck);
    this._fadeIn(deck.gain.gain, this._cueLevel(def), fade);
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

  /** Warm a cue's stream without playing it. Only ever one at a time. */
  preload(cue) {
    if (!this.enabled) return;
    const def = MUSIC_CUES[cue];
    if (!def) return;
    const url = this.base + def.track;
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
    const def = a.def;

    if (!this._native(def)) {
      const ct = a.deck.el.currentTime;
      if (ct > 0 && ct >= def.loopEnd - LOOP_XFADE && !a.looping) {
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
   * A run can touch every cue, and each buffered <audio> holds a few MB. Keep
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
      cue: this.active.cue, track: this.active.def.track,
      time: this.active.deck.el.currentTime,
      duration: this.active.def.duration,
      level: this.active.deck.gain.gain.value,
      blocked: this._blocked,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  _cueLevel(def) { return dbToGain(def.trimDb); }

  _native(def) {
    return def.loopStart < 0.15 && (def.duration - def.loopEnd) < 0.4;
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
    const def = a.def;
    const url = this.base + def.track;
    const nextSlot = a.slot === 0 ? 1 : 0;
    const nd = this._deck(url, nextSlot);
    nd.el.preload = 'auto';
    nd.lastUsed = this.ac.currentTime;
    nd.el.loop = false;
    try { nd.el.currentTime = def.loopStart; } catch {}
    this._start(nd);
    this._fadeIn(nd.gain.gain, this._cueLevel(def), LOOP_XFADE);
    this._retire(a.deck, LOOP_XFADE);
    this.active = { cue: a.cue, deck: nd, slot: nextSlot, def, looping: false };
  }

  _applyTension() {
    const t = this.ac.currentTime;
    const cap = this.active ? (this.active.def.tension ?? 1) : 1;
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
