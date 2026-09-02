/**
 * CombatFX — damage numbers, impact particles, shatters, deaths.
 * OWNER: combat-scene.  Spec: docs/STS2-REFERENCE.md §4.
 *
 * Two surfaces, both inside the combat scene root:
 *   • one <canvas> for particles (struct-of-arrays pool, zero per-frame alloc)
 *   • one <div> for floating numbers (DOM so they inherit the type tokens and
 *     stay crisp and legible over any background — §4 "numbers stay legible
 *     during shake and particles")
 *
 * Every colour comes from ui/tokens.css, read once at construction.
 *
 *   const fx = new CombatFX(ctx, root);
 *   fx.number(x, y, 12, { kind: 'damage', mag: 12 });
 *   fx.burst(x, y, { color: fx.col.threat, count: 18, speed: 320 });
 *   fx.shatter(x, y); fx.shimmer(x, y); fx.death(x, y, ['#8c8375', ...]);
 *   fx.update(dt);  fx.resize();  fx.destroy();
 */

const MAX_P = 1100;
const MAX_N = 28;
const TAU = Math.PI * 2;

/* particle kinds */
const K_SPARK = 0;   // small, gravity, additive
const K_SHARD = 1;   // rotating quad — block shatter
const K_MOTE = 2;    // slow riser — death
const K_RING = 3;    // expanding stroked circle
const K_DUST = 4;    // soft round puff, no additive
/* A WEAPON TRAIL. px,py = pivot, pw = radius, pr = start angle, pg = sweep.
   STS2-REFERENCE §4 asks for a strike that swings something, and a burst at
   the point of contact has no travel in it — this is the travel. */
const K_ARC = 5;

export class CombatFX {
  /**
   * @param {object} ctx  scene ctx ({ clock, Save, atmosphere, audio })
   * @param {HTMLElement} root  the combat scene root
   */
  constructor(ctx, root) {
    this.ctx = ctx || {};
    this.clock = this.ctx.clock || null;
    this.reduceMotion = !!this.ctx.Save?.settings?.reduceMotion;
    /* THE FLASHES SLIDER IS A 0..1 RANGE, not a boolean (`ui/settings.js`
       declares it `type:'range', min:0, max:1, step:0.1`). Round 4 read it as
       `!== 0`, so 10% and 100% were the same picture and the only value that
       did anything was exactly zero. `glow` is the additive gain every
       lit particle is drawn through; `setFlashes` keeps it live when the
       player moves the slider mid-fight. */
    this.flashes = 1;
    this.glow = 1;
    this.setFlashes(this.ctx.Save?.settings?.flashes, this.reduceMotion);
    this.showNumbers = this.ctx.Save?.settings?.showDamageNumbers !== false;

    const layer = document.createElement('div');
    layer.className = 'cb-fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<canvas class="cb-fx__c"></canvas><div class="cb-fx__nums"></div>`;
    root.appendChild(layer);
    this.el = layer;
    this.canvas = layer.querySelector('canvas');
    this.$nums = layer.querySelector('.cb-fx__nums');
    /* NO `desynchronized: true` HERE. It is the low-latency hint, and it lets
       this canvas present OUTSIDE the page's compositing sync — which on
       Windows/Chromium tears and flickers when the layer sits on top of the
       WebGL canvas, as this one does. Observed 2026-09-01 as a constant
       full-screen flicker in combat that briefly stopped on every `impact()`
       (the hit flash forces a full composite) and resumed immediately after.
       The latency this buys is worth nothing to particles and damage numbers. */
    this.g = this.canvas.getContext('2d', { alpha: true });

    // ── pools ────────────────────────────────────────────────────────────
    this.n = 0;
    this.px = new Float32Array(MAX_P); this.py = new Float32Array(MAX_P);
    this.vx = new Float32Array(MAX_P); this.vy = new Float32Array(MAX_P);
    this.pl = new Float32Array(MAX_P); this.pL = new Float32Array(MAX_P);
    this.ps = new Float32Array(MAX_P); this.pr = new Float32Array(MAX_P);
    this.pw = new Float32Array(MAX_P); this.pg = new Float32Array(MAX_P);
    this.pk = new Uint8Array(MAX_P);
    this.pc = new Array(MAX_P).fill('#fff');

    this.nums = [];
    for (let i = 0; i < MAX_N; i++) {
      const d = document.createElement('div');
      d.className = 'cb-num';
      d.style.display = 'none';
      this.$nums.appendChild(d);
      this.nums.push({ el: d, live: 0, t: 0, dur: 1, x: 0, y: 0, rise: 0, drift: 0, scale: 1 });
    }

    this.col = readTokens(root);
    // 1.5 is the point past which extra particle resolution stops being visible
    // and starts costing frames on a full-screen surface.
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this._painted = false;
    this.resize();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.left = r.left; this.top = r.top;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return this;
  }

  /** Viewport px -> layer px. */
  toLocal(x, y, out) {
    const o = out || { x: 0, y: 0 };
    o.x = x - this.left; o.y = y - this.top;
    return o;
  }

  /* ── particles ──────────────────────────────────────────────────────────── */
  _spawn(kind, x, y, vx, vy, life, size, color, grav, spin) {
    if (this.n >= MAX_P) return -1;
    const i = this.n++;
    this.pk[i] = kind;
    this.px[i] = x; this.py[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.pl[i] = life; this.pL[i] = life;
    this.ps[i] = size; this.pc[i] = color;
    this.pg[i] = grav; this.pr[i] = 0; this.pw[i] = spin || 0;
    return i;
  }

  /** An impact: a hot spark burst plus a shock ring. */
  burst(x, y, o = {}) {
    if (this.reduceMotion) return this;
    const n = Math.round((o.count ?? 16) * (0.4 + 0.6 * this.flashes));
    const sp = o.speed ?? 300;
    const col = o.color || this.col.flame;
    const spread = o.spread ?? TAU;
    const a0 = o.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + (Math.random() - 0.5) * spread;
      const s = sp * (0.35 + Math.random() * 0.9);
      this._spawn(K_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.28 + Math.random() * 0.38, 1.6 + Math.random() * 3.1, col, 820, 0);
    }
    if (o.ring !== false) this.ring(x, y, col, o.ringR ?? (34 + (o.count ?? 16) * 1.6));
    return this;
  }

  ring(x, y, color, r = 46, life = 0.34) {
    if (this.reduceMotion) return this;
    const i = this._spawn(K_RING, x, y, 0, 0, life, 6, color || this.col.flame, 0, 0);
    if (i >= 0) this.pw[i] = r;
    return this;
  }

  /** Guard gained: a cool upward shimmer. */
  shimmer(x, y, color) {
    if (this.reduceMotion) return this;
    const col = color || this.col.guard;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
      const s = 70 + Math.random() * 130;
      this._spawn(K_MOTE, x + (Math.random() - 0.5) * 54, y + (Math.random() - 0.5) * 30,
        Math.cos(a) * s * 0.4, Math.sin(a) * s, 0.5 + Math.random() * 0.4,
        1.6 + Math.random() * 2.4, col, -30, 0);
    }
    this.ring(x, y, col, 40, 0.4);
    return this;
  }

  /** Guard broken: hard shards fly off. */
  shatter(x, y, color) {
    const col = color || this.col.guard;
    if (this.reduceMotion) return this;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.random() * 0.4;
      const s = 180 + Math.random() * 260;
      this._spawn(K_SHARD, x, y, Math.cos(a) * s, Math.sin(a) * s - 60,
        0.5 + Math.random() * 0.34, 4 + Math.random() * 7, col, 1100,
        (Math.random() - 0.5) * 22);
    }
    this.ring(x, y, col, 76, 0.3);
    return this;
  }

  /** Death: a slow, sad bloom of motes plus a puff of the creature's own colour. */
  death(x, y, palette) {
    const p = palette && palette.length ? palette : [this.col.spectre, this.col.text, this.col.ink];
    for (let i = 0; i < (this.reduceMotion ? 8 : 44); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 30 + Math.random() * 130;
      this._spawn(K_MOTE, x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 80,
        Math.cos(a) * s * 0.55, Math.sin(a) * s, 0.9 + Math.random() * 1.0,
        2 + Math.random() * 4, p[i % p.length], -34, 0);
    }
    for (let i = 0; i < (this.reduceMotion ? 4 : 22); i++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 150;
      this._spawn(K_DUST, x, y, Math.cos(a) * s, Math.sin(a) * s * 0.5,
        0.6 + Math.random() * 0.6, 9 + Math.random() * 18, p[2] || p[0], 120, 0);
    }
    this.ring(x, y, this.col.spectre, 130, 0.6);
    return this;
  }

  /** A quick directional claw-mark at the point of contact. */
  slash(x, y, angle = -0.5, color) {
    if (this.reduceMotion) return this;
    this.burst(x, y, {
      color: color || this.col.threat, count: 13, speed: 420,
      angle, spread: 0.85, ring: false,
    });
    this.ring(x, y, color || this.col.threat, 30, 0.22);
    return this;
  }

  /**
   * A WEAPON TRAIL: a crescent that sweeps through an arc and fades from the
   * tail. STS2-REFERENCE §4 — "a strike swings a weapon" — is about the swing
   * having a PATH, not about a burst appearing at the end of one. `slash` marks
   * the contact; this is the travel that caused it.
   *
   * @param {number} x @param {number} y  centre of the arc, layer-local px
   * @param {number} r      radius of the swing
   * @param {number} a0     start angle, radians
   * @param {number} sweep  signed sweep, radians
   */
  swing(x, y, r = 90, a0 = -1.2, sweep = 1.9, color, life = 0.26) {
    if (this.reduceMotion) return this;
    const i = this._spawn(K_ARC, x, y, 0, 0, life, 7, color || this.col.flame, 0, 0);
    if (i >= 0) { this.pw[i] = r; this.pr[i] = a0; this.pg[i] = sweep; }
    return this;
  }

  /* ── floating numbers ───────────────────────────────────────────────────── */
  /**
   * @param {number} x @param {number} y  layer-local px
   * @param {string|number} text
   * @param {object} o { kind:'damage'|'blocked'|'block'|'heal'|'crit'|'status'|'miss',
   *                     mag, delay, rise }
   *   `rise` caps how far the numeral climbs, in px. The caller needs it because
   *   the default 62-100px carried a damage number off the top of a short rig
   *   and straight onto that enemy's intent chip — every hit briefly replaced
   *   the intent's value with the damage value, in the same spot.
   */
  number(x, y, text, o = {}) {
    if (!this.showNumbers && o.kind !== 'status') return this;
    const s = this.nums.find(n => !n.live);
    if (!s) return this;
    const mag = o.mag ?? (typeof text === 'number' ? text : 6);
    // scaled by magnitude — a 30 must not look like a 3
    const scale = clamp(0.82 + Math.log(1 + Math.max(0, mag)) * 0.30, 0.82, 2.15);
    s.live = 1; s.t = -(o.delay || 0);
    s.dur = 0.72 + scale * 0.24;
    s.x = x + (Math.random() - 0.5) * 26;
    s.y = y;
    s.rise = o.rise > 0 ? Math.min(o.rise, 62 + scale * 26) : 62 + scale * 26;
    s.drift = (Math.random() - 0.5) * 34;
    s.scale = scale;
    const el = s.el;
    el.textContent = String(text);
    el.dataset.kind = o.kind || 'damage';
    el.classList.toggle('is-big', scale > 1.5);
    el.style.display = '';
    el.style.opacity = '0';
    el.style.transform = `translate3d(${x}px,${y}px,0) scale(0.4)`;
    return this;
  }

  /** A word, not a number: "LETHAL", "BLOCKED", "Weak". */
  word(x, y, text, kind = 'status') {
    return this.number(x, y, text, { kind, mag: 4 });
  }

  /* ── frame ──────────────────────────────────────────────────────────────── */
  update(dt) {
    // particles — an idle board must not repaint a full-screen surface
    const g = this.g;
    if (this.n === 0 && !this._painted) { this._updateNumbers(dt); return this; }
    g.clearRect(0, 0, this.w, this.h);
    this._painted = this.n > 0;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.pl[i] -= dt;
      if (this.pl[i] <= 0) {
        // swap-remove
        n--;
        if (i !== n) {
          this.px[i] = this.px[n]; this.py[i] = this.py[n];
          this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n];
          this.pl[i] = this.pl[n]; this.pL[i] = this.pL[n];
          this.ps[i] = this.ps[n]; this.pr[i] = this.pr[n];
          this.pw[i] = this.pw[n]; this.pg[i] = this.pg[n];
          this.pk[i] = this.pk[n]; this.pc[i] = this.pc[n];
        }
        i--; continue;
      }
      const k = this.pk[i];
      if (k !== K_RING && k !== K_ARC) {
        this.vy[i] += this.pg[i] * dt;
        this.vx[i] *= 1 - Math.min(1, dt * (k === K_MOTE ? 1.2 : 2.4));
        this.px[i] += this.vx[i] * dt;
        this.py[i] += this.vy[i] * dt;
        this.pr[i] += this.pw[i] * dt;
      }
    }
    this.n = n;

    /* draw — grouped by blend mode to keep state changes down.
       `glow` is the Flashes slider: additive particles are the part of a hit
       that actually raises room luminance, so the slider scales their alpha
       rather than removing them. At 0% the sparks are still there, they just
       stop washing the frame. */
    const glow = this.glow;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const k = this.pk[i];
      if (k === K_DUST) continue;
      const a = this.pl[i] / this.pL[i];
      g.globalAlpha = glow * (k === K_RING ? a * a * 0.65 : Math.min(1, a * 1.5));
      g.fillStyle = this.pc[i];
      const x = this.px[i], y = this.py[i];
      if (k === K_RING) {
        const r = this.pw[i] * (1 - a * a);
        g.strokeStyle = this.pc[i];
        g.lineWidth = Math.max(1, this.ps[i] * a);
        g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.stroke();
      } else if (k === K_ARC) {
        /* The crescent leads with its head and dissolves from the tail: the
           swept fraction grows with time while the drawn tail shortens, which
           is what makes it read as a moving edge and not a static arc. */
        const p = 1 - a;
        const sweep = this.pg[i];
        const head = this.pr[i] + sweep * Math.min(1, p * 1.35);
        const tail = this.pr[i] + sweep * Math.max(0, p * 1.35 - 0.55);
        g.strokeStyle = this.pc[i];
        g.lineCap = 'round';
        g.lineWidth = Math.max(1, this.ps[i] * (0.4 + a * 0.9));
        g.beginPath();
        g.arc(x, y, Math.max(1, this.pw[i]), tail, head, sweep < 0);
        g.stroke();
        g.lineCap = 'butt';
      } else if (k === K_SHARD) {
        const s = this.ps[i];
        g.save(); g.translate(x, y); g.rotate(this.pr[i]);
        g.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
        g.restore();
      } else {
        const s = this.ps[i] * (k === K_MOTE ? a * 0.6 + 0.4 : a);
        g.beginPath(); g.arc(x, y, Math.max(0.4, s), 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < n; i++) {
      if (this.pk[i] !== K_DUST) continue;
      const a = this.pl[i] / this.pL[i];
      g.globalAlpha = a * a * 0.5;
      g.fillStyle = this.pc[i];
      g.beginPath(); g.arc(this.px[i], this.py[i], this.ps[i] * (1.4 - a * 0.5), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    this._updateNumbers(dt);
    return this;
  }

  _updateNumbers(dt) {
    for (const s of this.nums) {
      if (!s.live) continue;
      s.t += dt;
      if (s.t < 0) continue;
      const p = s.t / s.dur;
      if (p >= 1) { s.live = 0; s.el.style.display = 'none'; continue; }
      // pop in fast, drift up, fade late
      const pop = p < 0.16 ? easeOutBack(p / 0.16) : 1;
      const rise = easeOutCubic(Math.min(1, p * 1.25));
      const fade = p < 0.62 ? 1 : 1 - (p - 0.62) / 0.38;
      const sc = s.scale * (0.4 + 0.6 * pop) * (1 + (1 - fade) * 0.12);
      s.el.style.opacity = String(Math.max(0, fade));
      s.el.style.transform =
        `translate3d(${(s.x + s.drift * rise).toFixed(1)}px,${(s.y - s.rise * rise).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
    }
    return this;
  }

  /**
   * Live update from `settings:changed`. Reduced motion's own hint promises it
   * "Overrides the settings above", so it pins the gain to zero regardless of
   * where the Flashes slider is sitting.
   */
  setFlashes(v, reduceMotion) {
    if (reduceMotion !== undefined) this.reduceMotion = !!reduceMotion;
    const n = Number(v);
    const g = this.reduceMotion ? 0 : (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1);
    this.flashes = g;
    // Never fully dark: a spark you cannot see is not an accessibility win,
    // it is a missing hit. 0.22 keeps the shape and drops the bloom.
    this.glow = 0.22 + 0.78 * g;
    return this;
  }

  clear() {
    this.n = 0;
    for (const s of this.nums) { s.live = 0; s.el.style.display = 'none'; }
    this.g.clearRect(0, 0, this.w, this.h);
    return this;
  }

  destroy() { this.clear(); this.el.remove(); }
}

/* ── helpers ────────────────────────────────────────────────────────────────*/
function readTokens(root) {
  const cs = getComputedStyle(root);
  const v = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
  return {
    threat: v('--threat-300', '#f2654c'),
    threatHi: v('--threat-200', '#ff9c8a'),
    courage: v('--courage-300', '#f26d78'),
    guard: v('--guard-300', '#8fb7d9'),
    guardHi: v('--spectre-200', '#a8ecf7'),
    flame: v('--flame-300', '#f8c96b'),
    flameHi: v('--flame-100', '#fff4d6'),
    spectre: v('--spectre-300', '#6fd9ec'),
    pluck: v('--pluck-300', '#ffd75e'),
    text: v('--text-hi', '#f4efe4'),
    ink: v('--ink-500', '#2a2442'),
    power: v('--type-power', '#b071d6'),
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
function easeOutBack(x) { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

export default CombatFX;
