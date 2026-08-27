/**
 * Synthesis toolkit for Midnight Menagerie.  OWNER: audio agent.
 *
 * Everything here is *pure scheduling*: a generator takes an AudioContext, a
 * destination node and an absolute start time, wires up some nodes and returns.
 * Nothing reads `ac.currentTime`, nothing uses timers. That is what lets the
 * exact same code render live and inside an OfflineAudioContext for the
 * automated self-test.
 *
 * House rules, enforced by tests/audio:
 *   - every amplitude envelope starts at 0 and ends at exactly 0  (no clicks)
 *   - nothing is a raw sine beep: every voice has a transient, a body and a tail
 *   - a 28 Hz high-pass sits on the bus, so no generator may leave DC behind
 */

// ── maths / helpers ─────────────────────────────────────────────────────────

export const TAU = Math.PI * 2;

/** MIDI note number -> Hz. */
export function note(n) { return 440 * Math.pow(2, (n - 69) / 12); }

/** dB -> linear gain. */
export function dbToGain(db) { return Math.pow(10, db / 20); }

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Small fast deterministic PRNG. Audio jitter must never touch ctx.run.rng. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── per-context caches (noise beds, silent buffer, shaper curves) ───────────

const CACHE = new WeakMap();
function bank(ac) {
  let b = CACHE.get(ac);
  if (!b) { b = Object.create(null); CACHE.set(ac, b); }
  return b;
}

/**
 * Cached noise bed. Zero-mean and peak-normalised so a burst of it can never
 * push DC into the bus.
 *   white  — flat, for ticks and clicks
 *   pink   — 1/f, for paper and air
 *   brown  — 1/f^2, for puffs, groans and low rumble
 *   crackle— sparse impulses, for paper crinkle and debris
 */
export function noiseBuffer(ac, type = 'white', seconds = 2.4) {
  const b = bank(ac);
  const key = 'nz:' + type;
  if (b[key]) return b[key];

  const n = Math.max(1024, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  const r = mulberry32(0x51ed270b + type.charCodeAt(0) * 7919);

  if (type === 'white') {
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  } else if (type === 'pink') {
    // Paul Kellet's economy pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;   // leaky integrator: no DC runaway
      d[i] = last;
    }
  } else if (type === 'crackle') {
    // sparse bipolar impulses with short exponential tails -> paper / debris
    let tail = 0;
    for (let i = 0; i < n; i++) {
      if (r() < 0.0022) tail = (r() * 2 - 1);
      d[i] = tail;
      tail *= 0.986;
    }
  }

  // zero-mean, then peak normalise
  let mean = 0;
  for (let i = 0; i < n; i++) mean += d[i];
  mean /= n;
  let peak = 1e-9;
  for (let i = 0; i < n; i++) { d[i] -= mean; const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const k = 0.92 / peak;
  for (let i = 0; i < n; i++) d[i] *= k;

  b[key] = buf;
  return buf;
}

/** 250 ms of silence, used as a lifetime marker so voices can self-retire. */
export function silentBuffer(ac) {
  const b = bank(ac);
  if (!b.silent) {
    b.silent = ac.createBuffer(1, Math.max(256, (ac.sampleRate * 0.25) | 0), ac.sampleRate);
  }
  return b.silent;
}

// ── envelopes ───────────────────────────────────────────────────────────────

/**
 * Envelope shape factory. Returns f(u) for u in [0,1].
 *  a     attack fraction of the total duration (0..1)
 *  hold  fraction held at peak after the attack
 *  k     decay steepness — 1 is nearly linear, 12 is a hard percussive snap
 *  tail  final fraction forced to fade to exactly 0 (kills the end click)
 *  curveA attack curvature: 1 linear-ish (smoothstep), >1 slower start
 */
export function shape({ a = 0.01, hold = 0, k = 5, tail = 0.06, curveA = 1 } = {}) {
  const atk = clamp(a, 0.0005, 0.95);
  const hld = clamp(hold, 0, 0.9 - atk);
  const decayStart = atk + hld;
  const span = Math.max(1e-4, 1 - decayStart);
  const tl = clamp(tail, 0.005, 0.9);
  return (u) => {
    if (u <= 0 || u >= 1) return 0;
    let v;
    if (u < atk) {
      const x = u / atk;
      v = x * x * (3 - 2 * x);               // smoothstep in — no DC step
      if (curveA !== 1) v = Math.pow(v, curveA);
    } else if (u < decayStart) {
      v = 1;
    } else {
      v = Math.exp(-k * ((u - decayStart) / span));
    }
    if (u > 1 - tl) {                        // cosine fade to exactly zero
      const x = (1 - u) / tl;
      v *= 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
    }
    return v;
  };
}

export const ENV = {
  tick:   shape({ a: 0.02, k: 11, tail: 0.18 }),
  pluck:  shape({ a: 0.006, k: 6.5, tail: 0.10 }),
  hit:    shape({ a: 0.004, k: 8, tail: 0.12 }),
  body:   shape({ a: 0.03, k: 4.2, tail: 0.12 }),
  puff:   shape({ a: 0.13, k: 3.4, tail: 0.22, curveA: 1.6 }),
  swell:  shape({ a: 0.34, hold: 0.06, k: 3.0, tail: 0.26, curveA: 1.5 }),
  bloom:  shape({ a: 0.55, k: 2.2, tail: 0.34, curveA: 2 }),
  ring:   shape({ a: 0.002, k: 3.6, tail: 0.16 }),
  breath: shape({ a: 0.22, hold: 0.1, k: 2.6, tail: 0.3, curveA: 1.3 }),
};

/**
 * Write an amplitude curve onto an AudioParam. Always begins and ends at 0,
 * which is the whole reason no cue in this game clicks.
 */
export function env(param, t0, dur, fn = ENV.pluck, peak = 1, n = 192) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1)) * peak;
  c[0] = 0; c[n - 1] = 0;
  param.setValueCurveAtTime(c, Math.max(0, t0), Math.max(0.004, dur));
  return c;
}

/** Same idea for a frequency/pitch sweep — endpoints must stay positive. */
export function sweep(param, t0, dur, from, to, curve = 2.2, n = 96) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    c[i] = from * Math.pow(to / from, Math.pow(u, curve));
  }
  param.setValueCurveAtTime(c, Math.max(0, t0), Math.max(0.004, dur));
}

// ── node sugar ──────────────────────────────────────────────────────────────

export function gain(ac, v = 0) { const g = ac.createGain(); g.gain.value = v; return g; }

export function filt(ac, type, freq, q = 1, gainDb = 0) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = clamp(freq, 10, ac.sampleRate * 0.48);
  f.Q.value = q;
  if (gainDb) f.gain.value = gainDb;
  return f;
}

export function pan(ac, p = 0) {
  if (!ac.createStereoPanner) return gain(ac, 1);
  const n = ac.createStereoPanner();
  n.pan.value = clamp(p, -1, 1);
  return n;
}

export function osc(ac, type, freq, detune = 0) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = clamp(freq, 0.01, ac.sampleRate * 0.49);
  if (detune) o.detune.value = detune;
  return o;
}

export function src(ac, buffer, rate = 1, offset = 0, loop = false) {
  const s = ac.createBufferSource();
  s.buffer = buffer;
  s.playbackRate.value = rate;
  s.loop = loop;
  s._offset = offset;
  return s;
}

/**
 * Soft saturation curve with **unity slope at zero** — quiet signals pass
 * through untouched and only peaks bend. (A plain `tanh(d*x)/tanh(d)` curve
 * would put 2x makeup gain on everything quiet, which is not saturation.)
 */
export function shaperCurve(drive = 2, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / drive;
  }
  return c;
}

export function saturator(ac, drive = 2, oversample = 'none') {
  const b = bank(ac);
  const key = `sh:${drive}`;
  if (!b[key]) b[key] = shaperCurve(drive);
  const w = ac.createWaveShaper();
  w.curve = b[key];
  w.oversample = oversample;
  return w;
}

/**
 * Final safety limiter. Transparent below the knee, and mathematically unable
 * to emit a sample larger than `ceil` — the WaveShaper clamps to its curve
 * endpoints and the curve is monotone concave, so linear interpolation between
 * points cannot overshoot either.
 *   input gain 1/range maps +/- `range` of headroom onto the curve domain.
 */
export function createLimiter(ac, { ceil = 0.94, range = 4, n = 4096 } = {}) {
  const input = gain(ac, 1 / range);
  const ws = ac.createWaveShaper();
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    c[i] = ceil * Math.tanh((u * range) / ceil);
  }
  ws.curve = c;
  ws.oversample = 'none';
  input.connect(ws);
  return { input, output: ws, ceil };
}

/**
 * The one and only output chain, shared by the game and by tests/audio so the
 * test measures exactly what a player hears.
 *
 *   sfxIn ─┐
 *          ├─► mix ─► master ─► dcBlock ─► comp ─► limiter ─► analyser ─► out
 *  musicIn ┘
 */
export function createMasterBus(ac, o = {}) {
  const mix = gain(ac, 1);
  const sfxIn = gain(ac, o.sfx ?? 0.8);
  const musicIn = gain(ac, 1);
  sfxIn.connect(mix);
  musicIn.connect(mix);

  const master = gain(ac, o.master ?? 0.9);
  const dcBlock = filt(ac, 'highpass', 28, 0.707);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -9;
  comp.knee.value = 9;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;

  const lim = createLimiter(ac, { ceil: o.ceil ?? 0.94, range: 4 });
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;

  mix.connect(master);
  master.connect(dcBlock);
  dcBlock.connect(comp);
  comp.connect(lim.input);
  lim.output.connect(analyser);
  analyser.connect(o.destination || ac.destination);

  return { mix, sfxIn, musicIn, master, dcBlock, comp, limiter: lim, analyser };
}

// ── the plate: a 4x4 feedback delay network, no impulse response needed ─────

/**
 * Short, dense, dark plate-ish reverb. Four delay lines cross-fed through a
 * normalised Hadamard matrix, damped in the loop. RT60 is short on purpose:
 * every SFX in this game has to be finished inside 1.2 s.
 */
export function createPlate(ac, { rt60 = 0.5, damp = 3600, preDelay = 0.006, hp = 220 } = {}) {
  const input = gain(ac, 1);
  const output = gain(ac, 1);

  const pre = ac.createDelay(0.2);
  pre.delayTime.value = preDelay;
  input.connect(pre);

  // input diffusion — 2nd-order allpasses smear the transient before the tank
  let node = pre;
  for (const [f, q] of [[380, 0.6], [900, 0.5], [1900, 0.55], [3400, 0.6]]) {
    const ap = filt(ac, 'allpass', f, q);
    node.connect(ap);
    node = ap;
  }

  const times = [0.0297, 0.0371, 0.0411, 0.0437];
  const H = [
    [0.5, 0.5, 0.5, 0.5],
    [0.5, -0.5, 0.5, -0.5],
    [0.5, 0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5, 0.5],
  ];
  const ins = [], delays = [], taps = [];
  for (let i = 0; i < 4; i++) {
    const gi = gain(ac, 1);
    const d = ac.createDelay(0.25);
    d.delayTime.value = times[i];
    gi.connect(d);
    node.connect(gi);                        // dry injection into every line
    ins.push(gi); delays.push(d);
  }
  for (let i = 0; i < 4; i++) {
    const lp = filt(ac, 'lowpass', damp, 0.5);
    const fb = gain(ac, Math.pow(10, (-3 * times[i]) / Math.max(0.05, rt60)));
    delays[i].connect(lp); lp.connect(fb);
    for (let j = 0; j < 4; j++) {
      const m = gain(ac, H[i][j]);
      fb.connect(m); m.connect(ins[j]);
    }
    taps.push(delays[i]);
  }

  const sum = gain(ac, 0.42);
  taps[0].connect(sum); taps[1].connect(sum);
  const inv = gain(ac, -0.42);               // decorrelate a touch
  taps[2].connect(inv); taps[3].connect(inv);
  const hpf = filt(ac, 'highpass', hp, 0.7);
  const tone = filt(ac, 'highshelf', 6000, 0.7, -6);
  sum.connect(hpf); inv.connect(hpf);
  hpf.connect(tone); tone.connect(output);

  return { input, output };
}

/**
 * Start/stop a source with the start time clamped into the future. Scheduling
 * even a fraction of a millisecond in the past is a RangeError, and jittered
 * grain times land there constantly at t == 0 inside an OfflineAudioContext.
 */
export function run(node, ac, tStart, tStop, offset) {
  const s = tStart < ac.currentTime ? ac.currentTime : tStart;
  if (offset == null) node.start(s);
  else node.start(s, offset < 0 ? 0 : offset);
  node.stop(Math.max(s + 0.006, tStop));
}

// ── generators ──────────────────────────────────────────────────────────────
// Every generator signature is (ac, dest, t, opts). `opts.send` (0..1) plus
// `opts.rev` (a node) adds reverb; `opts.pan` places it.

function outChain(ac, dest, o) {
  const g = gain(ac, 1);
  const p = pan(ac, o.pan || 0);
  g.connect(p);
  p.connect(dest);
  if (o.rev && o.send) {
    const s = gain(ac, o.send);
    p.connect(s); s.connect(o.rev);
  }
  return g;
}

/** Enveloped, filtered noise. The workhorse behind paper, air, puffs, hits. */
export function noise(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    type = 'white', dur = 0.12, gain: g0 = 0.3, envFn = ENV.hit,
    filter = 'bandpass', f0 = 1400, f1 = null, q = 1.1, hp = 0, rate = 1,
    offset = null, rng = Math.random,
  } = o;
  const buf = noiseBuffer(ac, type);
  const s = src(ac, buf, rate);
  const off = offset == null ? rng() * (buf.duration - dur - 0.05) : offset;

  let node = s;
  if (hp) { const h = filt(ac, 'highpass', hp, 0.7); node.connect(h); node = h; }
  let bq = null;
  if (filter) {
    bq = filt(ac, filter, f0, q);
    node.connect(bq); node = bq;
  }
  const out = outChain(ac, dest, o);
  const vg = gain(ac, 0);
  node.connect(vg); vg.connect(out);

  env(vg.gain, t, dur, envFn, g0);
  if (bq && f1 && f1 !== f0) sweep(bq.frequency, t, dur, f0, f1);
  run(s, ac, t, t + dur + 0.02, off);
  return s;
}

/**
 * Modal resonator bank driven by sine partials. This is the bell / tine /
 * glass engine — precise decays, no filter-stability risk, no aliasing.
 * partials: [ratio, amp, decayMul?] — higher partials decay faster by default.
 */
export function struck(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    freq = 660, dur = 0.6, gain: g0 = 0.25, detune = 0,
    partials = [[1, 1], [2.76, 0.42], [5.4, 0.18], [8.9, 0.07]],
    envFn = ENV.ring, click = 0, clickF = 4200, rng = Math.random,
  } = o;
  const out = outChain(ac, dest, o);

  for (const [ratio, amp, dm] of partials) {
    const f = freq * ratio;
    if (f > ac.sampleRate * 0.46) continue;
    const d = Math.max(0.045, dur * (dm != null ? dm : 1 / (1 + 0.55 * (ratio - 1))));
    const o1 = osc(ac, 'sine', f, detune + (rng() * 2 - 1) * 3);
    const g1 = gain(ac, 0);
    o1.connect(g1); g1.connect(out);
    env(g1.gain, t, d, envFn, g0 * amp);
    run(o1, ac, t, t + d + 0.02);
  }
  if (click > 0) {
    noise(ac, out, t, {
      type: 'white', dur: 0.012, gain: g0 * click, envFn: ENV.tick,
      filter: 'highpass', f0: clickF, q: 0.7, rng,
    });
  }
  return out;
}

/**
 * Two-operator FM. Inharmonic ratios give the music-box tine and the small
 * bells that carry this game's palette.
 */
export function fmBell(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    freq = 880, ratio = 3.51, index = 5, dur = 0.55, gain: g0 = 0.22,
    envFn = ENV.pluck, indexDecay = 0.28, indexEnd = 0.12, rng = Math.random,
  } = o;
  const out = outChain(ac, dest, o);

  const car = osc(ac, 'sine', freq, (rng() * 2 - 1) * 4);
  const mod = osc(ac, 'sine', freq * ratio);
  const mg = gain(ac, 0);
  mod.connect(mg); mg.connect(car.frequency);

  const vg = gain(ac, 0);
  car.connect(vg); vg.connect(out);

  // modulation index collapses fast -> bright strike, pure tail
  const idur = Math.min(dur, Math.max(0.03, indexDecay));
  const n = 64, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    c[i] = freq * (index * Math.exp(-4.5 * u) + indexEnd * 0.0);
  }
  c[n - 1] = freq * indexEnd;
  mg.gain.setValueCurveAtTime(c, t, idur);
  /**
   * Clear of the curve by a whole RENDER QUANTUM, not 2 ms.
   *
   * `setValueCurveAtTime` does not start where you asked: the implementation
   * quantises the start to a 128-sample block, so the curve really occupies
   * [ceil(t), ceil(t) + idur] and can end AFTER `t + idur`. A 2 ms guard is
   * smaller than one block at any sample rate this runs at (2.67 ms at 48 kHz),
   * so a cue triggered at the wrong moment threw
   * `setTargetAtTime(0, 3.048, …) overlaps setValueCurveAtTime(…, 3.0213, 0.03)`
   * and the whole cue failed to build — measured on a real ui:hover.
   */
  const quantum = 128 / (ac.sampleRate || 48000);
  mg.gain.setTargetAtTime(0, t + idur + quantum * 2, Math.max(0.02, dur * 0.25));

  env(vg.gain, t, dur, envFn, g0);
  run(car, ac, t, t + dur + 0.02);
  run(mod, ac, t, t + dur + 0.02);
  return out;
}

/** A music-box tine: FM strike plus the tiny mechanical pluck of the comb. */
export function tine(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const { freq = 1046, dur = 0.62, gain: g0 = 0.2, rng = Math.random } = o;
  fmBell(ac, dest, t, {
    ...o, freq, dur, gain: g0, ratio: 3.51, index: 3.1,
    indexDecay: 0.055, envFn: ENV.pluck, rng,
  });
  // wooden comb pluck + a whisper of the case resonating
  noise(ac, dest, t, {
    ...o, type: 'white', dur: 0.02, gain: g0 * 0.45, envFn: ENV.tick,
    filter: 'bandpass', f0: freq * 2.4, f1: freq * 1.3, q: 1.4, rng, send: 0,
  });
  struck(ac, dest, t, {
    ...o, freq: freq * 0.5, dur: dur * 0.35, gain: g0 * 0.1,
    partials: [[1, 0.6], [2.02, 0.3]], envFn: ENV.pluck, rng, send: (o.send || 0) * 0.5,
  });
}

/** Wooden knock: short noise burst through wood modes plus a body thump. */
export function woodKnock(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    freq = 320, dur = 0.16, gain: g0 = 0.3, hard = 0.5, rng = Math.random,
  } = o;
  const out = outChain(ac, dest, { ...o, send: 0 });
  if (o.rev && o.send) {
    const s = gain(ac, o.send); out.connect(s); s.connect(o.rev);
  }

  const modes = [[1, 1, 40], [1.71, 0.55, 34], [2.63, 0.32, 28], [4.1, 0.16, 22]];
  const buf = noiseBuffer(ac, 'white');
  const s = src(ac, buf, 1);
  const exG = gain(ac, 0);
  s.connect(exG);
  env(exG.gain, t, 0.007 + 0.01 * (1 - hard), ENV.tick, 1);
  run(s, ac, t, t + 0.05, rng() * 1.5);

  for (const [ratio, amp, q] of modes) {
    const f = freq * ratio;
    if (f > ac.sampleRate * 0.45) continue;
    const bp = filt(ac, 'bandpass', f, q);
    const g1 = gain(ac, 0);
    exG.connect(bp); bp.connect(g1); g1.connect(out);
    env(g1.gain, t, dur * (1 / (1 + 0.5 * (ratio - 1))), ENV.hit, g0 * amp * 2.6);
  }
  // low body so a knock has weight on small speakers
  const th = osc(ac, 'sine', freq * 0.52);
  const tg = gain(ac, 0);
  th.connect(tg); tg.connect(out);
  sweep(th.frequency, t, dur * 0.5, freq * 0.62, freq * 0.42);
  env(tg.gain, t, dur * 0.55, ENV.hit, g0 * 0.5);
  run(th, ac, t, t + dur + 0.02);
  // dry attack click for definition
  noise(ac, out, t, {
    type: 'white', dur: 0.008, gain: g0 * 0.35 * hard, envFn: ENV.tick,
    filter: 'highpass', f0: 2600, q: 0.7, rng,
  });
}

/** One grain of paper. Several of these in a row make a riffle or a rustle. */
export function paperGrain(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    dur = 0.045, gain: g0 = 0.18, lo = 1200, hi = 4200, rng = Math.random,
  } = o;
  noise(ac, dest, t, {
    ...o, type: 'crackle', dur, gain: g0 * 1.35, envFn: ENV.tick,
    filter: 'bandpass', f0: lo, f1: hi, q: 0.85, hp: 480, rng,
    rate: 0.8 + rng() * 0.6,
  });
  noise(ac, dest, t, {
    ...o, type: 'pink', dur: dur * 1.5, gain: g0 * 0.5, envFn: ENV.hit,
    filter: 'bandpass', f0: (lo + hi) * 0.5, q: 0.7, hp: 700, rng, send: 0,
  });
}

/** Paper riffle / rustle: n grains scattered with a shaped density. */
export function riffle(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    n = 7, dur = 0.22, gain: g0 = 0.16, lo = 1300, hi = 4600,
    accel = 1, spread = 0.5, rng = Math.random,
  } = o;
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const at = Math.max(t, t + dur * Math.pow(u, accel) + (rng() - 0.5) * (dur / n) * 0.6);
    const fall = 0.55 + 0.45 * Math.cos(Math.PI * u * 0.8);
    paperGrain(ac, dest, at, {
      ...o,
      dur: 0.022 + rng() * 0.03,
      gain: g0 * fall * (0.7 + rng() * 0.6),
      lo: lo * (0.8 + rng() * 0.5),
      hi: hi * (0.8 + rng() * 0.5),
      pan: (o.pan || 0) + (rng() - 0.5) * spread,
      rng,
    });
  }
}

/** Filtered-noise gust. Direction comes from f0 -> f1. */
export function whoosh(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    dur = 0.28, gain: g0 = 0.2, f0 = 2600, f1 = 500, q = 1.3,
    type = 'pink', envFn = ENV.puff, rng = Math.random,
  } = o;
  noise(ac, dest, t, { ...o, type, dur, gain: g0, envFn, filter: 'bandpass', f0, f1, q, rng });
  noise(ac, dest, t, {
    ...o, type: 'brown', dur: dur * 1.1, gain: g0 * 0.35, envFn,
    filter: 'lowpass', f0: Math.max(f0, f1) * 0.6, q: 0.6, rng, send: 0,
  });
}

/** Sine thump with a pitch drop — the low half of any impact. */
export function thump(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const { f0 = 150, f1 = 48, dur = 0.18, gain: g0 = 0.45, envFn = ENV.hit } = o;
  const out = outChain(ac, dest, { ...o, send: (o.send || 0) * 0.3 });
  const o1 = osc(ac, 'sine', f0);
  const g1 = gain(ac, 0);
  o1.connect(g1); g1.connect(out);
  sweep(o1.frequency, t, dur, f0, Math.max(20, f1), 1.6);
  env(g1.gain, t, dur, envFn, g0);
  run(o1, ac, t, t + dur + 0.02);
  // a little 2nd harmonic keeps it audible on laptop speakers
  const o2 = osc(ac, 'triangle', f0 * 2);
  const g2 = gain(ac, 0);
  o2.connect(g2); g2.connect(out);
  sweep(o2.frequency, t, dur * 0.7, f0 * 2, Math.max(40, f1 * 2), 1.6);
  env(g2.gain, t, dur * 0.7, ENV.hit, g0 * 0.22);
  run(o2, ac, t, t + dur + 0.02);
}

/** Cat-ish chirrup / small creature vocal: glide + two formants + breath. */
export function chirrup(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    f0 = 620, f1 = 1500, f2 = null, dur = 0.19, gain: g0 = 0.16,
    form1 = 900, form2 = 2400, vib = 0.35, rng = Math.random,
  } = o;
  const out = outChain(ac, dest, o);

  const src1 = osc(ac, 'triangle', f0);
  const sawy = osc(ac, 'sawtooth', f0);
  const sg = gain(ac, 0.18);
  sawy.connect(sg);

  const mix = gain(ac, 1);
  src1.connect(mix); sg.connect(mix);

  const b1 = filt(ac, 'bandpass', form1, 3.2);
  const b2 = filt(ac, 'bandpass', form2, 5.0);
  const b2g = gain(ac, 0.4);
  const vg = gain(ac, 0);
  mix.connect(b1); b1.connect(vg);
  mix.connect(b2); b2.connect(b2g); b2g.connect(vg);
  vg.connect(out);

  const n = 80, c = new Float32Array(n), c2 = new Float32Array(n);
  const mid = f1, end = f2 == null ? f1 * 0.82 : f2;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const base = u < 0.55
      ? f0 * Math.pow(mid / f0, Math.pow(u / 0.55, 0.7))
      : mid * Math.pow(end / mid, (u - 0.55) / 0.45);
    const v = 1 + vib * 0.04 * Math.sin(u * TAU * 7);
    c[i] = base * v; c2[i] = base * v;
  }
  src1.frequency.setValueCurveAtTime(c, t, dur);
  sawy.frequency.setValueCurveAtTime(c2, t, dur);
  env(vg.gain, t, dur, shape({ a: 0.09, k: 4.2, tail: 0.24 }), g0 * 2.2);

  run(src1, ac, t, t + dur + 0.02);
  run(sawy, ac, t, t + dur + 0.02);

  noise(ac, out, t, {
    type: 'pink', dur: dur * 0.6, gain: g0 * 0.22, envFn: ENV.puff,
    filter: 'bandpass', f0: form2 * 1.2, q: 1.0, hp: 900, rng,
  });
}

/** Low wooden groan / creak. Detuned saws, formants, and a flutter. */
export function groan(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    f0 = 78, f1 = 62, dur = 0.85, gain: g0 = 0.2, rough = 0.5,
    form = [190, 430, 900], flutter = 7.5, rng = Math.random,
  } = o;
  const out = outChain(ac, dest, o);
  const bus = gain(ac, 1);

  for (let i = 0; i < 3; i++) {
    const oi = osc(ac, 'sawtooth', f0, (i - 1) * 7 * rough);
    const gi = gain(ac, i === 1 ? 0.5 : 0.28);
    oi.connect(gi); gi.connect(bus);
    sweep(oi.frequency, t, dur, f0 * (1 + (i - 1) * 0.004), Math.max(20, f1), 1.4);
    run(oi, ac, t, t + dur + 0.02);
  }

  const lp = filt(ac, 'lowpass', 1400, 0.6);
  bus.connect(lp);
  const sum = gain(ac, 0);
  for (let i = 0; i < form.length; i++) {
    const bp = filt(ac, 'bandpass', form[i], 4.5 + i * 2);
    const bg = gain(ac, [0.9, 0.55, 0.3][i] ?? 0.3);
    lp.connect(bp); bp.connect(bg); bg.connect(sum);
  }
  const dry = gain(ac, 0.35);
  lp.connect(dry); dry.connect(sum);

  // flutter: creaking wood is amplitude-modulated stick-slip, not smooth
  const trem = gain(ac, 1);
  const lfo = osc(ac, 'sine', flutter);
  const lg = gain(ac, 0.42 * rough);
  lfo.connect(lg); lg.connect(trem.gain);
  sweep(lfo.frequency, t, dur, flutter, flutter * 2.4, 1.5);
  run(lfo, ac, t, t + dur + 0.02);

  const vg = gain(ac, 0);
  sum.connect(trem); trem.connect(vg); vg.connect(out);
  env(vg.gain, t, dur, shape({ a: 0.16, hold: 0.12, k: 3.1, tail: 0.26 }), g0 * 2.4);
}

/** Glassy spectral shimmer — staggered high partials, rising or falling. */
export function shimmer(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    base = 1320, n = 6, dur = 0.7, gain: g0 = 0.06, rise = true,
    ratios = [1, 1.5, 2.02, 2.99, 4.03, 5.05], rng = Math.random,
  } = o;
  const out = outChain(ac, dest, o);
  for (let i = 0; i < Math.min(n, ratios.length); i++) {
    const u = i / Math.max(1, n - 1);
    const f = base * ratios[i] * (1 + (rng() - 0.5) * 0.012);
    if (f > ac.sampleRate * 0.45) continue;
    const at = t + (rise ? u : 1 - u) * dur * 0.32;
    const d = Math.max(0.12, dur * (1 - u * 0.42));
    const o1 = osc(ac, 'sine', f);
    const g1 = gain(ac, 0);
    o1.connect(g1); g1.connect(out);
    env(g1.gain, at, d, shape({ a: 0.24, k: 3.4, tail: 0.3, curveA: 1.4 }), g0 * (1 - u * 0.55));
    run(o1, ac, at, at + d + 0.02);
  }
  // a breath of air so it is not just tones
  noise(ac, out, t, {
    type: 'pink', dur: dur * 0.85, gain: g0 * 1.1, envFn: ENV.swell,
    filter: 'bandpass', f0: rise ? base * 1.6 : base * 3.2,
    f1: rise ? base * 3.4 : base * 1.4, q: 1.0, hp: 900, rng,
  });
}

/** Granular scrape — many pitched grains from the noise bed. */
export function scrape(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    n = 16, dur = 0.35, gain: g0 = 0.1, f0 = 700, f1 = 2200,
    q = 4, spread = 0.4, rng = Math.random,
  } = o;
  const buf = noiseBuffer(ac, 'brown');
  const out = outChain(ac, dest, o);
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const at = Math.max(t, t + u * dur + (rng() - 0.5) * (dur / n));
    const gd = 0.014 + rng() * 0.022;
    const s = src(ac, buf, 0.5 + rng() * 2.2);
    const bp = filt(ac, 'bandpass', f0 * Math.pow(f1 / f0, u) * (0.85 + rng() * 0.3), q);
    const g1 = gain(ac, 0);
    const p1 = pan(ac, (o.pan || 0) + (rng() - 0.5) * spread);
    s.connect(bp); bp.connect(g1); g1.connect(p1); p1.connect(out);
    env(g1.gain, at, gd, ENV.tick, g0 * (0.6 + rng() * 0.8));
    run(s, ac, at, at + gd + 0.02, rng() * 2);
  }
}

/** Impact: transient click + filtered body + low thump. */
export function impact(ac, dest, t, o = {}) {
  // If building this cue overran the scheduling lead time, every automation
  // below must agree on the same start: Chrome silently clamps a value curve
  // to currentTime, and a later event computed from the unclamped `t` then
  // lands inside it and throws.
  t = t < ac.currentTime ? ac.currentTime : t;
  const {
    weight = 0.5, gain: g0 = 0.5, dur = null, tone = 900, rng = Math.random,
    crunch = 0,
  } = o;
  const w = clamp(weight, 0, 1);
  const d = dur || (0.10 + w * 0.24);
  const out = outChain(ac, dest, { ...o, send: 0 });
  if (o.rev && o.send) { const s = gain(ac, o.send); out.connect(s); s.connect(o.rev); }

  let body = out;
  if (crunch > 0) {
    const sat = saturator(ac, 1 + crunch * 3);
    const pre = gain(ac, 1 + crunch * 1.6);
    const post = gain(ac, 1 / (1 + crunch * 0.8));
    pre.connect(sat); sat.connect(post); post.connect(out);
    body = pre;
  }

  noise(ac, out, t, {                                  // contact click
    type: 'white', dur: 0.009 + w * 0.006, gain: g0 * (0.34 - w * 0.1),
    envFn: ENV.tick, filter: 'highpass', f0: 3200 - w * 900, q: 0.7, rng,
  });
  noise(ac, body, t, {                                 // body
    type: 'white', dur: d * 0.7, gain: g0 * 0.55, envFn: ENV.hit,
    filter: 'bandpass', f0: tone * (1.5 - w * 0.5), f1: tone * (0.45 + w * 0.1),
    q: 0.9 + w, hp: 120, rng,
  });
  thump(ac, out, t, {                                  // low end
    f0: 175 - w * 70, f1: 62 - w * 24, dur: d * (0.7 + w * 0.5),
    gain: g0 * (0.42 + w * 0.42),
  });
  if (w > 0.55) {                                      // wood shell cracking
    struck(ac, out, t, {
      freq: 210 + rng() * 40, dur: d * 0.8, gain: g0 * 0.12,
      partials: [[1, 1, 0.5], [1.83, 0.5, 0.35], [3.1, 0.22, 0.25]],
      envFn: ENV.hit, rng,
    });
  }
}
