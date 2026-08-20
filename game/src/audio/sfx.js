/**
 * SFX cue library + voice engine.  OWNER: audio agent.
 *
 * There are no sound files in this game. Every cue below is synthesised at play
 * time from the toolkit in `dsp.js`, which means:
 *   - zero download cost and zero decode stall,
 *   - every repeat is subtly different (pitch +/-3%, level +/-1.5 dB),
 *   - the same code renders inside an OfflineAudioContext, so tests/audio can
 *     assert on the actual samples.
 *
 * Palette (from the design brief): wooden knocks, music-box tines, small bells,
 * paper, cat-ish chirrups, low wooden groans, glassy spectral shimmers.
 * Explicitly NOT horror stings and NOT chiptune.
 *
 * A cue is `{ family, dur, gain, minGap?, build(P) }` where P is
 *   { ac, out, rev, t, rng, h }   h(hz) applies the per-play pitch variation.
 */

import {
  noise, struck, fmBell, tine, woodKnock, paperGrain, riffle, whoosh, thump,
  chirrup, groan, shimmer, scrape, impact, createPlate, gain as mkGain,
  filt, saturator, silentBuffer, src, mulberry32, dbToGain, clamp, ENV, shape, note,
} from './dsp.js';

// ── musical helpers (everything stays in one cute-spooky mode) ──────────────
// D minor-ish with a raised 6th: the "friendly haunted" colour.
const D4 = note(62), F4 = note(65), A4 = note(69), C5 = note(72);
const D5 = note(74), E5 = note(76), F5 = note(77), G5 = note(79);
const A5 = note(81), Bb5 = note(82), C6 = note(84), D6 = note(86), F6 = note(89);

// ═══════════════════════════════════════════════════════════════════════════
//  CUES
// ═══════════════════════════════════════════════════════════════════════════

export const CUES = {

  // ── cards ────────────────────────────────────────────────────────────────
  'card:hover': {
    family: 'card', dur: 0.14, gain: 4.02, minGap: 45,
    build({ ac, out, t, rng, h }) {
      riffle(ac, out, t, { n: 2, dur: 0.05, gain: 0.1, lo: h(1900), hi: h(5200), rng, spread: 0.25 });
      fmBell(ac, out, t + 0.004, {
        freq: h(2650), ratio: 4.1, index: 1.6, indexDecay: 0.02,
        dur: 0.1, gain: 0.035, envFn: ENV.pluck, rng, pan: 0.05,
      });
    },
  },

  'card:pickUp': {
    family: 'card', dur: 0.28, gain: 2.34,
    build({ ac, out, rev, t, rng, h }) {
      riffle(ac, out, t, { n: 5, dur: 0.13, gain: 0.15, lo: h(900), hi: h(3800), accel: 0.7, rng });
      whoosh(ac, out, t, { dur: 0.16, gain: 0.055, f0: h(700), f1: h(2400), q: 1.4, rng });
      woodKnock(ac, out, t + 0.008, { freq: h(430), dur: 0.075, gain: 0.09, hard: 0.35, rng });
      shimmer(ac, out, t + 0.02, { base: h(2100), n: 3, dur: 0.2, gain: 0.014, rise: true, rev, send: 0.1, rng });
    },
  },

  'card:drop': {
    family: 'card', dur: 0.3, gain: 0.665,
    build({ ac, out, t, rng, h }) {
      riffle(ac, out, t, { n: 5, dur: 0.11, gain: 0.14, lo: h(2600), hi: h(950), accel: 1.5, rng });
      woodKnock(ac, out, t + 0.045, { freq: h(196), dur: 0.16, gain: 0.2, hard: 0.5, rng });
      thump(ac, out, t + 0.045, { f0: h(130), f1: h(58), dur: 0.11, gain: 0.1 });
    },
  },

  'card:play-attack': {
    family: 'card', dur: 0.42, gain: 0.896,
    build({ ac, out, rev, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.13, gain: 0.13, f0: h(3400), f1: h(620), q: 1.6, type: 'pink', rng, pan: -0.08 });
      woodKnock(ac, out, t + 0.1, { freq: h(300), dur: 0.2, gain: 0.28, hard: 0.85, rng, rev, send: 0.09 });
      thump(ac, out, t + 0.1, { f0: h(150), f1: h(52), dur: 0.16, gain: 0.24 });
      struck(ac, out, t + 0.1, {
        freq: h(660), dur: 0.2, gain: 0.045, partials: [[1, 1, 0.4], [2.4, 0.4, 0.3]],
        envFn: ENV.hit, rng, rev, send: 0.1,
      });
    },
  },

  'card:play-skill': {
    family: 'card', dur: 0.55, gain: 1.72,
    build({ ac, out, rev, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.2, gain: 0.075, f0: h(900), f1: h(3600), q: 1.1, rng });
      fmBell(ac, out, t + 0.012, {
        freq: h(A5), ratio: 2.02, index: 2.4, indexDecay: 0.07,
        dur: 0.42, gain: 0.11, envFn: ENV.pluck, rng, rev, send: 0.22, pan: 0.06,
      });
      fmBell(ac, out, t + 0.05, {
        freq: h(E5 * 2), ratio: 2.02, index: 1.6, indexDecay: 0.05,
        dur: 0.3, gain: 0.05, envFn: ENV.pluck, rng, rev, send: 0.22, pan: -0.1,
      });
      shimmer(ac, out, t + 0.02, { base: h(1760), n: 4, dur: 0.4, gain: 0.026, rise: true, rev, send: 0.3, rng });
    },
  },

  'card:play-power': {
    family: 'card', dur: 0.95, gain: 1.41,
    build({ ac, out, rev, t, rng, h }) {
      groan(ac, out, t, { f0: h(74), f1: h(96), dur: 0.5, gain: 0.09, rough: 0.28, flutter: 4.5, rng });
      whoosh(ac, out, t, { dur: 0.34, gain: 0.07, f0: h(500), f1: h(3000), q: 1.0, rng });
      const chord = [D4, A4, D5];
      chord.forEach((f, i) => {
        fmBell(ac, out, t + 0.05 + i * 0.055, {
          freq: h(f * 2), ratio: 3.01, index: 2.6, indexDecay: 0.09,
          dur: 0.62 - i * 0.08, gain: 0.085 - i * 0.012, envFn: ENV.pluck,
          rng, rev, send: 0.26, pan: (i - 1) * 0.22,
        });
      });
      shimmer(ac, out, t + 0.14, { base: h(1174), n: 6, dur: 0.66, gain: 0.03, rise: true, rev, send: 0.34, rng });
      thump(ac, out, t + 0.05, { f0: h(120), f1: h(46), dur: 0.28, gain: 0.16 });
    },
  },

  'card:draw': {
    family: 'card', dur: 0.3, gain: 3.76,
    build({ ac, out, t, rng, h }) {
      riffle(ac, out, t, { n: 6, dur: 0.16, gain: 0.15, lo: h(1500), hi: h(5200), accel: 0.62, spread: 0.6, rng });
      noise(ac, out, t + 0.015, {
        type: 'pink', dur: 0.13, gain: 0.05, envFn: ENV.puff,
        filter: 'bandpass', f0: h(1500), f1: h(3400), q: 1.2, hp: 800, rng,
      });
      fmBell(ac, out, t + 0.14, {
        freq: h(C6), ratio: 3.5, index: 1.3, indexDecay: 0.02,
        dur: 0.11, gain: 0.028, envFn: ENV.pluck, rng, pan: 0.12,
      });
    },
  },

  'card:shuffle': {
    family: 'card', dur: 0.72, gain: 2.43,
    build({ ac, out, t, rng, h }) {
      riffle(ac, out, t, { n: 18, dur: 0.42, gain: 0.16, lo: h(1200), hi: h(5000), accel: 0.9, spread: 0.85, rng });
      riffle(ac, out, t + 0.05, { n: 11, dur: 0.36, gain: 0.1, lo: h(2200), hi: h(3200), accel: 1.2, spread: 0.7, rng });
      scrape(ac, out, t + 0.02, { n: 12, dur: 0.36, gain: 0.04, f0: h(700), f1: h(1500), q: 3, rng });
      // the deck squared off against the table — punctuation, not the headline
      woodKnock(ac, out, t + 0.5, { freq: h(240), dur: 0.13, gain: 0.1, hard: 0.5, rng });
      woodKnock(ac, out, t + 0.575, { freq: h(252), dur: 0.11, gain: 0.065, hard: 0.4, rng, pan: 0.1 });
    },
  },

  'card:discard': {
    family: 'card', dur: 0.3, gain: 2.77,
    build({ ac, out, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.17, gain: 0.075, f0: h(2600), f1: h(700), q: 1.5, rng, pan: 0.14 });
      riffle(ac, out, t + 0.01, { n: 4, dur: 0.13, gain: 0.1, lo: h(2400), hi: h(1100), accel: 1.4, rng });
      woodKnock(ac, out, t + 0.15, { freq: h(180), dur: 0.11, gain: 0.09, hard: 0.3, rng });
    },
  },

  'card:exhaust': {
    family: 'card', dur: 0.75, gain: 1.21,
    build({ ac, out, rev, t, rng, h }) {
      noise(ac, out, t, {                                  // the puff itself
        type: 'brown', dur: 0.34, gain: 0.17, envFn: ENV.puff,
        filter: 'lowpass', f0: h(2200), f1: h(420), q: 0.8, hp: 130, rng, rev, send: 0.12,
      });
      noise(ac, out, t + 0.006, {
        type: 'pink', dur: 0.2, gain: 0.06, envFn: ENV.puff,
        filter: 'bandpass', f0: h(1800), f1: h(5200), q: 0.9, hp: 900, rng,
      });
      // the wisp of it leaving
      shimmer(ac, out, t + 0.1, { base: h(1480), n: 5, dur: 0.5, gain: 0.022, rise: true, rev, send: 0.36, rng });
      chirrup(ac, out, t + 0.05, {
        f0: h(520), f1: h(880), f2: h(1500), dur: 0.22, gain: 0.03,
        form1: h(1100), form2: h(2700), vib: 0.5, rng, rev, send: 0.2,
      });
    },
  },

  'card:retain': {
    family: 'card', dur: 0.45, gain: 2.53,
    build({ ac, out, rev, t, rng, h }) {
      paperGrain(ac, out, t, { dur: 0.05, gain: 0.15, lo: h(1500), hi: h(4400), rng });
      paperGrain(ac, out, t + 0.035, { dur: 0.04, gain: 0.09, lo: h(2400), hi: h(3200), rng, pan: -0.12 });
      tine(ac, out, t + 0.01, { freq: h(D6), dur: 0.36, gain: 0.085, rng, rev, send: 0.2, pan: 0.08 });
      struck(ac, out, t + 0.01, {
        freq: h(D5), dur: 0.22, gain: 0.028,
        partials: [[1, 1, 0.6], [2.43, 0.4, 0.42], [2.98, 0.3, 0.4], [4.61, 0.14, 0.24]],
        envFn: ENV.ring, rng, rev, send: 0.2,
      });
    },
  },

  'card:upgrade': {
    family: 'card', dur: 0.9, gain: 1.43,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(360), dur: 0.1, gain: 0.1, hard: 0.6, rng });
      tine(ac, out, t + 0.01, { freq: h(A5), dur: 0.45, gain: 0.1, rng, rev, send: 0.24, pan: -0.14 });
      tine(ac, out, t + 0.13, { freq: h(D6), dur: 0.52, gain: 0.105, rng, rev, send: 0.26, pan: 0.14 });
      tine(ac, out, t + 0.25, { freq: h(F6), dur: 0.5, gain: 0.075, rng, rev, send: 0.3 });
      shimmer(ac, out, t + 0.18, { base: h(2350), n: 6, dur: 0.62, gain: 0.024, rise: true, rev, send: 0.4, rng });
      // sparkle dust
      for (let i = 0; i < 5; i++) {
        const at = t + 0.2 + rng() * 0.36;
        fmBell(ac, out, at, {
          freq: h(2600 + rng() * 2400), ratio: 4.7, index: 1.1, indexDecay: 0.015,
          dur: 0.09 + rng() * 0.07, gain: 0.014, envFn: ENV.pluck,
          rng, pan: (rng() - 0.5) * 1.1, rev, send: 0.3,
        });
      }
    },
  },

  // ── combat ───────────────────────────────────────────────────────────────
  'combat:hit-light': {
    family: 'combat', dur: 0.3, gain: 2.7,
    build({ ac, out, rev, t, rng, h }) {
      impact(ac, out, t, { weight: 0.22, gain: 0.42, tone: h(1150), rng, rev, send: 0.06 });
      struck(ac, out, t, {
        freq: h(880), dur: 0.1, gain: 0.03, partials: [[1, 1, 0.4], [2.7, 0.35, 0.28]],
        envFn: ENV.hit, rng,
      });
    },
  },

  'combat:hit-heavy': {
    family: 'combat', dur: 0.55, gain: 1.24,
    build({ ac, out, rev, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.07, gain: 0.07, f0: h(2600), f1: h(800), q: 2.0, rng });
      impact(ac, out, t + 0.055, {
        weight: 0.86, gain: 0.5, tone: h(620), crunch: 0.4, rng, rev, send: 0.16,
      });
      groan(ac, out, t + 0.07, { f0: h(96), f1: h(66), dur: 0.3, gain: 0.05, rough: 0.7, flutter: 12, rng });
      scrape(ac, out, t + 0.07, { n: 7, dur: 0.16, gain: 0.03, f0: h(900), f1: h(340), q: 5, rng });
    },
  },

  'combat:crit': {
    family: 'combat', dur: 0.8, gain: 1.29,
    build({ ac, out, rev, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.1, gain: 0.1, f0: h(900), f1: h(4200), q: 1.7, rng, pan: -0.15 });
      impact(ac, out, t + 0.085, {
        weight: 1.0, gain: 0.52, tone: h(700), crunch: 0.55, rng, rev, send: 0.2,
      });
      // glass shards flying off
      for (let i = 0; i < 7; i++) {
        const at = t + 0.09 + rng() * 0.22;
        struck(ac, out, at, {
          freq: h(1600 + rng() * 2600), dur: 0.12 + rng() * 0.16, gain: 0.022,
          partials: [[1, 1, 0.7], [2.41, 0.4, 0.4], [4.2, 0.15, 0.25]],
          envFn: ENV.ring, rng, pan: (rng() - 0.5) * 1.3, rev, send: 0.28,
        });
      }
      struck(ac, out, t + 0.09, {
        freq: h(D5), dur: 0.5, gain: 0.05,
        partials: [[1, 1], [1.5, 0.5, 0.6], [2.98, 0.28, 0.4]],
        envFn: ENV.ring, rng, rev, send: 0.3,
      });
    },
  },

  'combat:block-gain': {
    family: 'combat', dur: 0.52, gain: 2.06,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(220), dur: 0.16, gain: 0.16, hard: 0.4, rng });
      noise(ac, out, t + 0.004, {
        type: 'pink', dur: 0.16, gain: 0.05, envFn: ENV.puff,
        filter: 'lowpass', f0: h(2600), f1: h(900), q: 0.8, hp: 200, rng,
      });
      struck(ac, out, t + 0.02, {                          // protective fifth
        freq: h(D5), dur: 0.4, gain: 0.062,
        partials: [[1, 1], [1.5, 0.62, 0.85], [2.0, 0.3, 0.6], [3.02, 0.12, 0.4]],
        envFn: shape({ a: 0.09, k: 3.6, tail: 0.2 }), rng, rev, send: 0.2,
      });
      thump(ac, out, t, { f0: h(120), f1: h(62), dur: 0.14, gain: 0.12 });
    },
  },

  'combat:block-break': {
    family: 'combat', dur: 0.6, gain: 3.15,
    build({ ac, out, rev, t, rng, h }) {
      noise(ac, out, t, {                                  // the crack
        type: 'white', dur: 0.018, gain: 0.34, envFn: ENV.tick,
        filter: 'highpass', f0: h(1800), q: 0.7, rng,
      });
      struck(ac, out, t, {
        freq: h(1240), dur: 0.26, gain: 0.075,
        partials: [[1, 1, 0.55], [1.51, 0.7, 0.42], [2.04, 0.45, 0.3], [3.14, 0.22, 0.22]],
        envFn: ENV.hit, click: 0.5, clickF: h(5200), rng, rev, send: 0.18,
      });
      thump(ac, out, t, { f0: h(190), f1: h(58), dur: 0.16, gain: 0.2 });
      // debris skittering away — well under the crack, or it reads as stuttering
      scrape(ac, out, t + 0.03, { n: 20, dur: 0.34, gain: 0.018, f0: h(2400), f1: h(900), q: 6, spread: 1.1, rng });
      for (let i = 0; i < 6; i++) {
        const at = t + 0.05 + rng() * 0.26;
        struck(ac, out, at, {
          freq: h(1100 + rng() * 1900), dur: 0.06 + rng() * 0.07, gain: 0.0065,
          partials: [[1, 1, 0.6], [2.2, 0.3, 0.3]], envFn: ENV.hit,
          rng, pan: (rng() - 0.5) * 1.3, rev, send: 0.16,
        });
      }
    },
  },

  'combat:heal': {
    family: 'combat', dur: 0.95, gain: 1.2,
    build({ ac, out, rev, t, rng, h }) {
      noise(ac, out, t, {
        type: 'pink', dur: 0.42, gain: 0.045, envFn: ENV.swell,
        filter: 'bandpass', f0: h(700), f1: h(2400), q: 0.8, hp: 400, rng, rev, send: 0.2,
      });
      [C5, E5, G5].forEach((f, i) => {
        tine(ac, out, t + 0.02 + i * 0.1, {
          freq: h(f * 2), dur: 0.55 - i * 0.05, gain: 0.078 - i * 0.008,
          rng, rev, send: 0.28, pan: (i - 1) * 0.16,
        });
      });
      shimmer(ac, out, t + 0.14, { base: h(1046), n: 5, dur: 0.68, gain: 0.026, rise: true, rev, send: 0.36, rng });
      struck(ac, out, t + 0.02, {
        freq: h(C5), dur: 0.6, gain: 0.026,
        partials: [[1, 1], [2, 0.4, 0.7], [3, 0.16, 0.5]],
        envFn: shape({ a: 0.3, k: 2.6, tail: 0.3 }), rng, rev, send: 0.3,
      });
    },
  },

  'combat:status-apply-buff': {
    family: 'combat', dur: 0.55, gain: 1.91,
    build({ ac, out, rev, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.22, gain: 0.05, f0: h(800), f1: h(3200), q: 1.1, rng });
      fmBell(ac, out, t + 0.01, {
        freq: h(D5 * 2), ratio: 2.0, index: 1.8, indexDecay: 0.05,
        dur: 0.4, gain: 0.085, envFn: ENV.pluck, rng, rev, send: 0.24,
      });
      fmBell(ac, out, t + 0.1, {
        freq: h(A5 * 2), ratio: 2.0, index: 1.4, indexDecay: 0.04,
        dur: 0.32, gain: 0.055, envFn: ENV.pluck, rng, rev, send: 0.24, pan: 0.16,
      });
      shimmer(ac, out, t + 0.04, { base: h(1975), n: 4, dur: 0.4, gain: 0.02, rise: true, rev, send: 0.3, rng });
    },
  },

  'combat:status-apply-debuff': {
    family: 'combat', dur: 0.6, gain: 1.15,
    build({ ac, out, rev, t, rng, h }) {
      noise(ac, out, t, {
        type: 'brown', dur: 0.34, gain: 0.09, envFn: ENV.puff,
        filter: 'lowpass', f0: h(2000), f1: h(320), q: 1.2, hp: 90, rng, rev, send: 0.14,
      });
      // a bell that sags out of tune as it lands
      const b = fmBell(ac, out, t + 0.01, {
        freq: h(F4 * 2), ratio: 2.41, index: 3.4, indexDecay: 0.16,
        dur: 0.46, gain: 0.08, envFn: shape({ a: 0.02, k: 3.4, tail: 0.22 }),
        rng, rev, send: 0.26, pan: -0.1,
      });
      fmBell(ac, out, t + 0.06, {
        freq: h(F4 * 2 * 0.945), ratio: 2.41, index: 2.6, indexDecay: 0.14,
        dur: 0.4, gain: 0.05, envFn: shape({ a: 0.03, k: 3.6, tail: 0.24 }),
        rng, rev, send: 0.26, pan: 0.14,
      });
      groan(ac, out, t + 0.02, { f0: h(88), f1: h(58), dur: 0.36, gain: 0.05, rough: 0.5, flutter: 6, rng });
      void b;
    },
  },

  'combat:enemy-death': {
    family: 'combat', dur: 1.0, gain: 1.71,
    build({ ac, out, rev, t, rng, h }) {
      impact(ac, out, t, { weight: 0.35, gain: 0.2, tone: h(700), rng });
      noise(ac, out, t + 0.01, {                            // the poof
        type: 'brown', dur: 0.4, gain: 0.15, envFn: ENV.puff,
        filter: 'lowpass', f0: h(2600), f1: h(380), q: 0.8, hp: 110, rng, rev, send: 0.16,
      });
      chirrup(ac, out, t + 0.03, {                          // a small startled "boo"
        f0: h(760), f1: h(430), f2: h(300), dur: 0.3, gain: 0.055,
        form1: h(760), form2: h(2000), vib: 0.8, rng, rev, send: 0.2,
      });
      shimmer(ac, out, t + 0.18, { base: h(1320), n: 6, dur: 0.6, gain: 0.024, rise: true, rev, send: 0.4, rng });
      tine(ac, out, t + 0.34, { freq: h(D6), dur: 0.42, gain: 0.05, rng, rev, send: 0.34, pan: 0.1 });
    },
  },

  'combat:player-hurt': {
    family: 'combat', dur: 0.65, gain: 3.33,
    build({ ac, out, rev, t, rng, h }) {
      impact(ac, out, t, { weight: 0.7, gain: 0.4, tone: h(480), crunch: 0.25, rng, rev, send: 0.1 });
      groan(ac, out, t + 0.02, { f0: h(104), f1: h(74), dur: 0.36, gain: 0.075, rough: 0.65, flutter: 9, rng });
      chirrup(ac, out, t + 0.045, {                         // small "eek"
        f0: h(680), f1: h(1180), f2: h(760), dur: 0.19, gain: 0.045,
        form1: h(1000), form2: h(2600), vib: 0.9, rng,
      });
      noise(ac, out, t + 0.01, {
        type: 'pink', dur: 0.22, gain: 0.04, envFn: ENV.puff,
        filter: 'lowpass', f0: h(1400), f1: h(500), q: 0.7, hp: 150, rng,
      });
    },
  },

  'combat:turn-start': {
    family: 'combat', dur: 0.62, gain: 1.5,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(280), dur: 0.13, gain: 0.13, hard: 0.55, rng });
      tine(ac, out, t + 0.015, { freq: h(A5), dur: 0.42, gain: 0.075, rng, rev, send: 0.22, pan: -0.1 });
      tine(ac, out, t + 0.115, { freq: h(D6), dur: 0.44, gain: 0.07, rng, rev, send: 0.24, pan: 0.12 });
      noise(ac, out, t, {
        type: 'pink', dur: 0.2, gain: 0.035, envFn: ENV.puff,
        filter: 'bandpass', f0: h(1200), f1: h(3000), q: 0.9, hp: 600, rng,
      });
    },
  },

  'combat:turn-end': {
    family: 'combat', dur: 0.55, gain: 1.01,
    build({ ac, out, rev, t, rng, h }) {
      tine(ac, out, t, { freq: h(D6), dur: 0.34, gain: 0.06, rng, rev, send: 0.2, pan: 0.1 });
      tine(ac, out, t + 0.1, { freq: h(A5), dur: 0.4, gain: 0.07, rng, rev, send: 0.22, pan: -0.1 });
      woodKnock(ac, out, t + 0.1, { freq: h(200), dur: 0.14, gain: 0.1, hard: 0.35, rng });
      noise(ac, out, t + 0.02, {
        type: 'brown', dur: 0.24, gain: 0.045, envFn: ENV.puff,
        filter: 'lowpass', f0: h(1600), f1: h(500), q: 0.7, hp: 120, rng,
      });
    },
  },

  // ── ui ───────────────────────────────────────────────────────────────────
  'ui:click': {
    family: 'ui', dur: 0.16, gain: 3.01, minGap: 30,
    build({ ac, out, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(760), dur: 0.075, gain: 0.17, hard: 0.75, rng });
      fmBell(ac, out, t + 0.002, {
        freq: h(2100), ratio: 3.9, index: 1.4, indexDecay: 0.015,
        dur: 0.09, gain: 0.035, envFn: ENV.pluck, rng,
      });
    },
  },

  'ui:hover': {
    family: 'ui', dur: 0.12, gain: 2.16, minGap: 40,
    build({ ac, out, t, rng, h }) {
      // mostly air: a breath of filtered noise with the faintest tine on top
      noise(ac, out, t, {
        type: 'white', dur: 0.026, gain: 0.16, envFn: ENV.tick,
        filter: 'bandpass', f0: h(3400), f1: h(5200), q: 1.3, hp: 1400, rng,
      });
      noise(ac, out, t + 0.002, {
        type: 'pink', dur: 0.05, gain: 0.055, envFn: ENV.hit,
        filter: 'bandpass', f0: h(1900), q: 0.9, hp: 800, rng,
      });
      fmBell(ac, out, t + 0.001, {
        freq: h(3150), ratio: 4.3, index: 1.4, indexDecay: 0.014,
        dur: 0.08, gain: 0.05, envFn: ENV.pluck, rng, pan: 0.08,
      });
    },
  },

  'ui:back': {
    family: 'ui', dur: 0.32, gain: 1.19,
    build({ ac, out, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(520), dur: 0.09, gain: 0.13, hard: 0.6, rng });
      woodKnock(ac, out, t + 0.075, { freq: h(340), dur: 0.13, gain: 0.13, hard: 0.5, rng, pan: -0.12 });
      noise(ac, out, t + 0.01, {
        type: 'pink', dur: 0.16, gain: 0.035, envFn: ENV.puff,
        filter: 'lowpass', f0: h(2200), f1: h(700), q: 0.7, hp: 300, rng,
      });
    },
  },

  'ui:confirm': {
    family: 'ui', dur: 0.5, gain: 1.79,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(600), dur: 0.08, gain: 0.12, hard: 0.7, rng });
      tine(ac, out, t + 0.005, { freq: h(D6), dur: 0.34, gain: 0.075, rng, rev, send: 0.2 });
      tine(ac, out, t + 0.085, { freq: h(A5 * 2), dur: 0.36, gain: 0.06, rng, rev, send: 0.22, pan: 0.14 });
      shimmer(ac, out, t + 0.05, { base: h(2350), n: 3, dur: 0.3, gain: 0.014, rise: true, rev, send: 0.3, rng });
    },
  },

  'ui:deny': {
    family: 'ui', dur: 0.38, gain: 1.26,
    build({ ac, out, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(180), dur: 0.13, gain: 0.16, hard: 0.35, rng });
      woodKnock(ac, out, t + 0.085, { freq: h(168), dur: 0.15, gain: 0.13, hard: 0.3, rng, pan: -0.1 });
      // a dull, slightly-wrong minor second: reads as "no" without being harsh
      struck(ac, out, t + 0.005, {
        freq: h(233), dur: 0.24, gain: 0.038,
        partials: [[1, 1, 0.6], [1.06, 0.8, 0.55], [2.04, 0.2, 0.3]],
        envFn: shape({ a: 0.02, k: 5, tail: 0.2 }), rng,
      });
      noise(ac, out, t, {
        type: 'brown', dur: 0.18, gain: 0.05, envFn: ENV.hit,
        filter: 'lowpass', f0: h(900), f1: h(300), q: 0.8, hp: 90, rng,
      });
    },
  },

  'ui:open-panel': {
    family: 'ui', dur: 0.48, gain: 1.46,
    build({ ac, out, rev, t, rng, h }) {
      riffle(ac, out, t, { n: 6, dur: 0.2, gain: 0.1, lo: h(900), hi: h(4000), accel: 0.7, spread: 0.7, rng });
      whoosh(ac, out, t, { dur: 0.26, gain: 0.07, f0: h(600), f1: h(2600), q: 1.0, rng });
      woodKnock(ac, out, t + 0.2, { freq: h(300), dur: 0.12, gain: 0.09, hard: 0.4, rng });
      shimmer(ac, out, t + 0.06, { base: h(1760), n: 3, dur: 0.3, gain: 0.014, rise: true, rev, send: 0.24, rng });
    },
  },

  'ui:close-panel': {
    family: 'ui', dur: 0.42, gain: 1.59,
    build({ ac, out, t, rng, h }) {
      whoosh(ac, out, t, { dur: 0.22, gain: 0.075, f0: h(2600), f1: h(560), q: 1.1, rng });
      riffle(ac, out, t, { n: 5, dur: 0.16, gain: 0.09, lo: h(3200), hi: h(1000), accel: 1.4, spread: 0.6, rng });
      woodKnock(ac, out, t + 0.19, { freq: h(210), dur: 0.13, gain: 0.11, hard: 0.45, rng });
    },
  },

  'ui:tooltip': {
    family: 'ui', dur: 0.24, gain: 2.17, minGap: 60,
    build({ ac, out, rev, t, rng, h }) {
      // glassy, inharmonic — deliberately not a clean interval
      struck(ac, out, t, {
        freq: h(2640), dur: 0.16, gain: 0.05,
        partials: [[1, 1, 0.6], [2.43, 0.5, 0.4], [3.86, 0.22, 0.26]],
        envFn: ENV.pluck, rng, rev, send: 0.14, pan: 0.1,
      });
      fmBell(ac, out, t + 0.006, {
        freq: h(1760), ratio: 3.71, index: 2.4, indexDecay: 0.024,
        dur: 0.15, gain: 0.03, envFn: ENV.pluck, rng, rev, send: 0.14, pan: -0.08,
      });
      noise(ac, out, t, {
        type: 'white', dur: 0.016, gain: 0.06, envFn: ENV.tick,
        filter: 'highpass', f0: h(4200), q: 0.7, rng,
      });
    },
  },

  // ── world ────────────────────────────────────────────────────────────────
  'world:door-open': {
    family: 'world', dur: 1.15, gain: 2.77,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(150), dur: 0.16, gain: 0.13, hard: 0.5, rng, rev, send: 0.12 });
      // the creak is the sound; the latch at either end is punctuation
      groan(ac, out, t + 0.09, {
        f0: h(112), f1: h(158), dur: 0.72, gain: 0.26, rough: 0.85,
        form: [h(230), h(520), h(1150)], flutter: 8.5, rng, rev, send: 0.18,
      });
      scrape(ac, out, t + 0.12, { n: 22, dur: 0.62, gain: 0.05, f0: h(600), f1: h(1700), q: 6, spread: 0.5, rng });
      noise(ac, out, t + 0.12, {
        type: 'brown', dur: 0.62, gain: 0.07, envFn: ENV.breath,
        filter: 'lowpass', f0: h(700), f1: h(1500), q: 0.7, hp: 80, rng, rev, send: 0.2,
      });
      woodKnock(ac, out, t + 0.86, { freq: h(126), dur: 0.18, gain: 0.085, hard: 0.35, rng, rev, send: 0.16 });
    },
  },

  'world:candle-light': {
    family: 'world', dur: 0.8, gain: 1.84,
    build({ ac, out, rev, t, rng, h }) {
      noise(ac, out, t, {                                    // strike
        type: 'white', dur: 0.05, gain: 0.13, envFn: ENV.hit,
        filter: 'bandpass', f0: h(3800), f1: h(1600), q: 1.1, hp: 1200, rng,
      });
      noise(ac, out, t + 0.03, {                             // whoomph
        type: 'brown', dur: 0.3, gain: 0.13, envFn: ENV.puff,
        filter: 'lowpass', f0: h(1400), f1: h(420), q: 0.9, hp: 90, rng, rev, send: 0.1,
      });
      // the flame settling: slow filtered flicker
      noise(ac, out, t + 0.1, {
        type: 'brown', dur: 0.46, gain: 0.035, envFn: shape({ a: 0.2, hold: 0.2, k: 3.0, tail: 0.3 }),
        filter: 'bandpass', f0: h(520), f1: h(760), q: 1.4, hp: 120, rng,
      });
      tine(ac, out, t + 0.09, { freq: h(D6), dur: 0.42, gain: 0.05, rng, rev, send: 0.24, pan: 0.1 });
      shimmer(ac, out, t + 0.12, { base: h(1046), n: 4, dur: 0.4, gain: 0.018, rise: true, rev, send: 0.28, rng });
    },
  },

  'world:blueprint-unfold': {
    family: 'world', dur: 0.95, gain: 2.87,
    build({ ac, out, rev, t, rng, h }) {
      riffle(ac, out, t, { n: 9, dur: 0.34, gain: 0.13, lo: h(700), hi: h(3400), accel: 0.8, spread: 1.0, rng });
      whoosh(ac, out, t, { dur: 0.42, gain: 0.07, f0: h(420), f1: h(2400), q: 0.9, rng, rev, send: 0.12 });
      riffle(ac, out, t + 0.34, { n: 7, dur: 0.24, gain: 0.1, lo: h(1400), hi: h(4800), accel: 1.1, spread: 0.9, rng });
      noise(ac, out, t + 0.6, {                              // the final snap flat
        type: 'white', dur: 0.045, gain: 0.15, envFn: ENV.hit,
        filter: 'bandpass', f0: h(2600), f1: h(900), q: 1.0, hp: 500, rng, rev, send: 0.1,
      });
      woodKnock(ac, out, t + 0.61, { freq: h(240), dur: 0.14, gain: 0.1, hard: 0.5, rng });
      shimmer(ac, out, t + 0.63, { base: h(1568), n: 3, dur: 0.24, gain: 0.012, rise: true, rev, send: 0.24, rng });
    },
  },

  'world:rescue-chime': {
    family: 'world', dur: 1.15, gain: 1.49,
    build({ ac, out, rev, t, rng, h }) {
      const arp = [D5, F5, A5, D6];
      arp.forEach((f, i) => {
        tine(ac, out, t + i * 0.085, {
          freq: h(f * 2), dur: 0.62 - i * 0.05, gain: 0.088 - i * 0.008,
          rng, rev, send: 0.3, pan: (i / 3 - 0.5) * 0.5,
        });
      });
      struck(ac, out, t + 0.34, {
        freq: h(D5), dur: 0.72, gain: 0.045,
        partials: [[1, 1], [1.5, 0.5, 0.8], [2, 0.32, 0.6], [3.01, 0.14, 0.4]],
        envFn: shape({ a: 0.16, k: 2.6, tail: 0.3 }), rng, rev, send: 0.36,
      });
      shimmer(ac, out, t + 0.16, { base: h(1174), n: 6, dur: 0.8, gain: 0.026, rise: true, rev, send: 0.42, rng });
      chirrup(ac, out, t + 0.42, {                           // a happy little chirp
        f0: h(700), f1: h(1500), f2: h(1320), dur: 0.2, gain: 0.038,
        form1: h(1100), form2: h(2900), vib: 0.7, rng, rev, send: 0.24,
      });
    },
  },

  'world:treasure': {
    family: 'world', dur: 1.15, gain: 1.22,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(160), dur: 0.16, gain: 0.15, hard: 0.45, rng });
      groan(ac, out, t + 0.04, {
        f0: h(130), f1: h(180), dur: 0.34, gain: 0.07, rough: 0.7,
        form: [h(260), h(560)], flutter: 9, rng,
      });
      for (let i = 0; i < 9; i++) {                          // coins tumbling
        const at = t + 0.24 + rng() * 0.42;
        struck(ac, out, at, {
          freq: h(1500 + rng() * 2200), dur: 0.13 + rng() * 0.14, gain: 0.02,
          partials: [[1, 1, 0.75], [2.76, 0.42, 0.45], [5.4, 0.14, 0.25]],
          envFn: ENV.ring, click: 0.4, clickF: h(6000),
          rng, pan: (rng() - 0.5) * 1.2, rev, send: 0.26,
        });
      }
      tine(ac, out, t + 0.5, { freq: h(D6), dur: 0.5, gain: 0.06, rng, rev, send: 0.32 });
      tine(ac, out, t + 0.6, { freq: h(A5 * 2), dur: 0.48, gain: 0.05, rng, rev, send: 0.34, pan: 0.16 });
      shimmer(ac, out, t + 0.42, { base: h(1760), n: 5, dur: 0.6, gain: 0.02, rise: true, rev, send: 0.4, rng });
    },
  },

  'world:coin': {
    family: 'world', dur: 0.5, gain: 1.65,
    build({ ac, out, rev, t, rng, h }) {
      for (let i = 0; i < 3; i++) {
        const at = t + i * (0.045 + rng() * 0.04);
        struck(ac, out, at, {
          freq: h(1900 + rng() * 1400), dur: 0.16 + rng() * 0.12, gain: 0.038 - i * 0.006,
          partials: [[1, 1, 0.8], [2.76, 0.45, 0.5], [5.4, 0.16, 0.28]],
          envFn: ENV.ring, click: 0.55, clickF: h(6500),
          rng, pan: (rng() - 0.5) * 0.9, rev, send: 0.22,
        });
      }
    },
  },

  'world:boss-roar': {
    family: 'world', dur: 1.1, gain: 3.49,
    build({ ac, out, rev, t, rng, h }) {
      thump(ac, out, t, { f0: h(90), f1: h(34), dur: 0.36, gain: 0.4 });
      // the growl: detuned saws through a moving formant, gently saturated
      groan(ac, out, t + 0.01, {
        f0: h(66), f1: h(52), dur: 0.52, gain: 0.2, rough: 0.95,
        form: [h(240), h(620), h(1250)], flutter: 14, rng, rev, send: 0.12,
      });
      groan(ac, out, t + 0.05, {
        f0: h(99), f1: h(78), dur: 0.44, gain: 0.1, rough: 0.8,
        form: [h(380), h(900)], flutter: 19, rng, pan: -0.2,
      });
      noise(ac, out, t + 0.02, {
        type: 'brown', dur: 0.42, gain: 0.09, envFn: ENV.breath,
        filter: 'bandpass', f0: h(320), f1: h(900), q: 1.1, hp: 70, rng, rev, send: 0.14,
      });
      // ...and then it is only a big silly ghost saying boo
      chirrup(ac, out, t + 0.48, {
        f0: h(300), f1: h(210), f2: h(340), dur: 0.3, gain: 0.085,
        form1: h(520), form2: h(1400), vib: 1.0, rng, rev, send: 0.18,
      });
      shimmer(ac, out, t + 0.52, { base: h(880), n: 5, dur: 0.34, gain: 0.018, rise: false, rev, send: 0.3, rng });
      scrape(ac, out, t + 0.05, { n: 14, dur: 0.4, gain: 0.025, f0: h(400), f1: h(1200), q: 7, spread: 0.8, rng });
    },
  },

  'world:heartbeat': {
    family: 'world', dur: 0.78, gain: 0.796,
    build({ ac, out, t, rng, h }) {
      // Two thuds with a chest-cavity body. The noise layer is deliberately
      // loud relative to the sine so this reads as a muffled impact, not a tone.
      const beat = (at, g, f) => {
        thump(ac, out, at, {
          f0: h(f), f1: h(f * 0.44), dur: 0.19, gain: g,
          envFn: shape({ a: 0.05, k: 5.6, tail: 0.2 }),
        });
        noise(ac, out, at, {
          type: 'brown', dur: 0.15, gain: g * 0.5, envFn: shape({ a: 0.03, k: 6, tail: 0.18 }),
          filter: 'lowpass', f0: h(300), f1: h(95), q: 1.1, hp: 34, rng,
        });
        noise(ac, out, at + 0.004, {                       // muscle / cloth texture
          type: 'pink', dur: 0.09, gain: g * 0.09, envFn: ENV.hit,
          filter: 'bandpass', f0: h(430), f1: h(190), q: 1.4, hp: 120, rng,
        });
      };
      beat(t, 0.46, 78);
      beat(t + 0.25, 0.34, 68);
    },
  },

  // ── stingers (musical accents over the music; longer by design) ──────────
  'sting:reward': {
    family: 'sting', dur: 1.5, gain: 1.1,
    build({ ac, out, rev, t, rng, h }) {
      [D5, A5, D6].forEach((f, i) => {
        tine(ac, out, t + i * 0.07, { freq: h(f * (i === 0 ? 2 : 1)), dur: 0.8, gain: 0.075, rng, rev, send: 0.34, pan: (i - 1) * 0.2 });
      });
      struck(ac, out, t + 0.24, {
        freq: h(F5), dur: 1.0, gain: 0.05,
        partials: [[1, 1], [1.5, 0.5, 0.8], [2.51, 0.24, 0.5]],
        envFn: shape({ a: 0.2, k: 2.4, tail: 0.3 }), rng, rev, send: 0.4,
      });
      shimmer(ac, out, t + 0.1, { base: h(1174), n: 6, dur: 0.9, gain: 0.022, rise: true, rev, send: 0.44, rng });
    },
  },

  'sting:rescue': {
    family: 'sting', dur: 2.2, gain: 1.37,
    build({ ac, out, rev, t, rng, h }) {
      const phrase = [[D5, 0], [F5, 0.13], [A5, 0.26], [D6, 0.39], [C6, 0.62]];
      for (const [f, dt] of phrase) {
        tine(ac, out, t + dt, { freq: h(f * 2), dur: 1.0, gain: 0.08, rng, rev, send: 0.36, pan: (dt - 0.3) * 0.8 });
      }
      struck(ac, out, t + 0.62, {
        freq: h(D4), dur: 1.5, gain: 0.05,
        partials: [[1, 1], [2, 0.5, 0.8], [3, 0.28, 0.6], [4.02, 0.12, 0.4]],
        envFn: shape({ a: 0.14, k: 2.0, tail: 0.3 }), rng, rev, send: 0.42,
      });
      shimmer(ac, out, t + 0.3, { base: h(1174), n: 6, dur: 1.3, gain: 0.024, rise: true, rev, send: 0.46, rng });
      chirrup(ac, out, t + 0.9, {
        f0: h(760), f1: h(1600), f2: h(1400), dur: 0.24, gain: 0.04,
        form1: h(1150), form2: h(3000), vib: 0.7, rng, rev, send: 0.3,
      });
    },
  },

  'sting:elite': {
    family: 'sting', dur: 1.8, gain: 1.43,
    build({ ac, out, rev, t, rng, h }) {
      woodKnock(ac, out, t, { freq: h(140), dur: 0.22, gain: 0.2, hard: 0.6, rng, rev, send: 0.2 });
      [A4, F4, D4].forEach((f, i) => {
        struck(ac, out, t + i * 0.19, {
          freq: h(f), dur: 1.1 - i * 0.1, gain: 0.058,
          partials: [[1, 1], [2.01, 0.42, 0.7], [3.02, 0.2, 0.5], [4.7, 0.08, 0.3]],
          envFn: shape({ a: 0.02, k: 2.6, tail: 0.26 }), rng, rev, send: 0.36, pan: (i - 1) * 0.2,
        });
      });
      groan(ac, out, t + 0.05, { f0: h(74), f1: h(58), dur: 0.9, gain: 0.09, rough: 0.6, flutter: 5, rng, rev, send: 0.2 });
    },
  },

  'sting:boss': {
    family: 'sting', dur: 2.4, gain: 1.47,
    build({ ac, out, rev, t, rng, h }) {
      thump(ac, out, t, { f0: h(78), f1: h(31), dur: 0.6, gain: 0.42 });
      groan(ac, out, t, {
        f0: h(58), f1: h(49), dur: 1.3, gain: 0.15, rough: 0.75,
        form: [h(210), h(540), h(1100)], flutter: 6, rng, rev, send: 0.22,
      });
      struck(ac, out, t + 0.06, {                             // the toll
        freq: h(D4 * 0.5), dur: 2.0, gain: 0.075,
        partials: [[1, 1], [2.01, 0.6, 0.8], [2.99, 0.32, 0.6], [4.24, 0.18, 0.4], [5.98, 0.08, 0.28]],
        envFn: shape({ a: 0.012, k: 2.1, tail: 0.24 }), rng, rev, send: 0.42,
      });
      struck(ac, out, t + 0.72, {
        freq: h(F4 * 0.5), dur: 1.5, gain: 0.05,
        partials: [[1, 1], [2.01, 0.5, 0.8], [3.01, 0.24, 0.5]],
        envFn: shape({ a: 0.012, k: 2.3, tail: 0.26 }), rng, rev, send: 0.44, pan: -0.2,
      });
      shimmer(ac, out, t + 1.0, { base: h(587), n: 5, dur: 1.1, gain: 0.02, rise: false, rev, send: 0.46, rng });
    },
  },

  'sting:victory': {
    family: 'sting', dur: 2.2, gain: 1.3,
    build({ ac, out, rev, t, rng, h }) {
      const arp = [D5, F5, A5, C6, D6];
      arp.forEach((f, i) => {
        tine(ac, out, t + i * 0.1, { freq: h(f * 2), dur: 0.9 - i * 0.06, gain: 0.085 - i * 0.006, rng, rev, send: 0.34, pan: (i / 4 - 0.5) * 0.6 });
      });
      struck(ac, out, t + 0.4, {
        freq: h(D4), dur: 1.6, gain: 0.06,
        partials: [[1, 1], [1.5, 0.46, 0.85], [2, 0.34, 0.7], [3.01, 0.16, 0.5]],
        envFn: shape({ a: 0.1, k: 1.9, tail: 0.3 }), rng, rev, send: 0.42,
      });
      shimmer(ac, out, t + 0.2, { base: h(1174), n: 6, dur: 1.3, gain: 0.024, rise: true, rev, send: 0.46, rng });
      woodKnock(ac, out, t, { freq: h(300), dur: 0.14, gain: 0.1, hard: 0.6, rng });
    },
  },

  'sting:defeat': {
    family: 'sting', dur: 2.6, gain: 1.45,
    build({ ac, out, rev, t, rng, h }) {
      const fall = [D5, C5, A4, F4];
      fall.forEach((f, i) => {
        struck(ac, out, t + i * 0.26, {
          freq: h(f), dur: 1.5 - i * 0.12, gain: 0.055 - i * 0.005,
          partials: [[1, 1], [2.01, 0.4, 0.8], [3.0, 0.18, 0.55], [4.6, 0.07, 0.3]],
          envFn: shape({ a: 0.03, k: 2.1, tail: 0.28 }), rng, rev, send: 0.4, pan: (i / 3 - 0.5) * 0.5,
        });
      });
      groan(ac, out, t + 0.2, {
        f0: h(62), f1: h(48), dur: 1.4, gain: 0.1, rough: 0.5,
        form: [h(180), h(430)], flutter: 4, rng, rev, send: 0.22,
      });
      shimmer(ac, out, t + 1.0, { base: h(698), n: 5, dur: 1.2, gain: 0.018, rise: false, rev, send: 0.46, rng });
    },
  },
};

/** Friendly short names other agents can use. */
export const ALIASES = {
  click: 'ui:click', hover: 'ui:hover', back: 'ui:back', confirm: 'ui:confirm',
  deny: 'ui:deny', tooltip: 'ui:tooltip',
  hit: 'combat:hit-light', bigHit: 'combat:hit-heavy', crit: 'combat:crit',
  block: 'combat:block-gain', blockBreak: 'combat:block-break', heal: 'combat:heal',
  buff: 'combat:status-apply-buff', debuff: 'combat:status-apply-debuff',
  death: 'combat:enemy-death', hurt: 'combat:player-hurt',
  draw: 'card:draw', shuffle: 'card:shuffle', discard: 'card:discard',
  exhaust: 'card:exhaust', upgrade: 'card:upgrade', retain: 'card:retain',
  coin: 'world:coin', treasure: 'world:treasure', chime: 'world:rescue-chime',
  door: 'world:door-open', candle: 'world:candle-light', roar: 'world:boss-roar',
  heartbeat: 'world:heartbeat', blueprint: 'world:blueprint-unfold',
};

export const SFX_IDS = Object.keys(CUES);

/**
 * Cue ids are `family:name`, but callers reasonably write `family/name` too
 * (scenes/title.js already does), and short aliases exist for the common ones.
 * All three forms resolve; anything else returns null and warns once.
 */
export function resolveId(id) {
  if (typeof id !== 'string') return null;
  if (CUES[id]) return id;
  if (ALIASES[id]) return ALIASES[id];
  const slash = id.replace(/\//g, ':');
  if (CUES[slash]) return slash;
  if (ALIASES[slash]) return ALIASES[slash];
  // last resort: match on the bare name across families ('crit', 'door-open')
  const bare = slash.includes(':') ? slash.slice(slash.indexOf(':') + 1) : slash;
  for (const k of SFX_IDS) if (k.slice(k.indexOf(':') + 1) === bare) return k;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VOICE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const MAX_VOICES = 12;

export class SfxEngine {
  /**
   * @param {BaseAudioContext} ac
   * @param {AudioNode} dest          the sfx bus input (already volume-controlled)
   * @param {object} [o]
   * @param {boolean} [o.deterministic] freeze the per-play variation (tests)
   */
  constructor(ac, dest, o = {}) {
    this.ac = ac;
    this.dest = dest;
    this.offline = typeof ac.startRendering === 'function';
    this.deterministic = !!o.deterministic;
    this._seed = (o.seed ?? 0x1a2b3c4d) >>> 0;
    this._n = 0;
    this.voices = [];
    this._last = Object.create(null);
    this.muted = false;

    // shared plate — one instance for every voice, tapped by `send`
    this.plate = createPlate(ac, { rt60: o.rt60 ?? 0.46, damp: 3400, preDelay: 0.006, hp: 240 });
    this.revSend = mkGain(ac, 1);
    this.revReturn = mkGain(ac, 0.9);
    this.revSend.connect(this.plate.input);
    this.plate.output.connect(this.revReturn);
    this.revReturn.connect(dest);
  }

  setReverb(v) { this.revReturn.gain.value = clamp(v, 0, 2); }

  /** Schedule a cue. Returns the voice, or null if it was skipped. */
  play(id, opts = {}) {
    const key = resolveId(id);
    if (!key) {
      if (!this._warned) this._warned = new Set();
      if (!this._warned.has(id)) { this._warned.add(id); console.warn('[audio] unknown sfx id:', id); }
      return null;
    }
    const cue = CUES[key];
    const ac = this.ac;
    const now = ac.currentTime;

    if (!this.offline && cue.minGap) {
      const prev = this._last[key] || -1;
      if ((now - prev) * 1000 < cue.minGap) return null;
    }
    this._last[key] = now;

    const rng = this.deterministic
      ? mulberry32(this._seed ^ (hashStr(key) >>> 0))
      : mulberry32((this._seed + (this._n++) * 0x9e3779b1 + ((now * 48000) | 0)) >>> 0);

    // per-play variation: pitch +/-3%, level +/-1.5 dB (skipped in tests)
    const jp = this.deterministic ? 1 : 1 + (rng() * 2 - 1) * 0.03;
    const jg = this.deterministic ? 1 : dbToGain((rng() * 2 - 1) * 1.5);

    const rate = opts.rate == null ? 1 : opts.rate;
    const pitch = jp * rate;
    const level = clamp((opts.vol == null ? 1 : opts.vol) * cue.gain * jg, 0, 4);
    // 20 ms of lead so a heavy frame cannot schedule a layer into the past
    const t = now + Math.max(0, opts.delay || 0) + (this.offline ? 0 : 0.02);

    const vGain = mkGain(ac, this.muted ? 0 : level);
    const vPan = opts.pan ? panNode(ac, opts.pan) : null;
    if (vPan) { vGain.connect(vPan); vPan.connect(this.dest); }
    else vGain.connect(this.dest);

    const voice = {
      id: key, gain: vGain, pan: vPan, level, start: t,
      end: t + cue.dur + 0.6, dead: false,
    };

    try {
      cue.build({
        ac, out: vGain, rev: this.revSend, t, rng,
        h: (hz) => hz * pitch,
        pitch,
      });
    } catch (e) {
      console.error('[audio] cue build failed:', key, e);
      try { vGain.disconnect(); } catch {}
      return null;
    }

    this._register(voice, cue.dur);
    return voice;
  }

  _register(voice, dur) {
    this.voices.push(voice);
    // `voices` holds live voices only — a stolen one is spliced out at once
    // rather than waiting for its `ended` callback, or a burst of 60 plays in
    // one frame would let the array run far past the cap.
    while (this.voices.length > MAX_VOICES && this._steal());

    if (!this.offline) {
      // lifetime marker: silent source whose `ended` retires the voice, so no
      // timers and no per-frame bookkeeping.
      const life = this.ac.createBufferSource();
      life.buffer = silentBuffer(this.ac);
      life.loop = true;
      life.connect(voice.gain);
      life.start(voice.start);
      life.stop(voice.start + dur + 0.55);
      life.onended = () => this._retire(voice);
      voice._life = life;
    }
  }

  /** Oldest-quietest first: score = level / (1 + age). Returns true if one went. */
  _steal() {
    let worst = null, worstIdx = -1, worstScore = Infinity;
    const now = this.ac.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.dead) continue;
      const score = v.level / (1 + Math.max(0, now - v.start) * 3);
      if (score < worstScore) { worstScore = score; worst = v; worstIdx = i; }
    }
    if (!worst) return false;
    const g = worst.gain.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.035);
    } catch {}
    worst.dead = true;
    this.voices.splice(worstIdx, 1);          // gone from the cap immediately
    if (this.offline) { this._retire(worst); return true; }
    try { worst._life?.stop(now + 0.05); } catch {}   // `ended` disconnects it
    return true;
  }

  _retire(voice) {
    const i = this.voices.indexOf(voice);
    if (i >= 0) this.voices.splice(i, 1);
    voice.dead = true;
    try { voice.gain.disconnect(); } catch {}
    try { voice.pan?.disconnect(); } catch {}
  }

  stopAll() {
    const now = this.ac.currentTime;
    for (const v of [...this.voices]) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0, now + 0.05);
        v._life?.stop(now + 0.08);
      } catch {}
      v.dead = true;
    }
    this.voices.length = 0;
  }

  get activeCount() { return this.voices.length; }
}

function panNode(ac, p) {
  if (!ac.createStereoPanner) return mkGain(ac, 1);
  const n = ac.createStereoPanner();
  n.pan.value = clamp(p, -1, 1);
  return n;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// re-exported so the test page can build an identical bus without duplicating it
export { filt, saturator, mkGain, src, silentBuffer };
