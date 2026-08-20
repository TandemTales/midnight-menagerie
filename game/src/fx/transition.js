/**
 * Authored screen transitions. OWNER: atmosphere agent.
 *
 * Contract used by core/scenes.js:
 *   await transition.cover(kind, opts)   // screen is fully hidden when this resolves
 *   await transition.reveal()            // uses the same kind it covered with
 *
 * Kinds: 'veil' (default), 'doorway', 'blueprint', 'candle-out', 'dawn'.
 * Budget: <= 500 ms in, <= 400 ms out. StS never makes you wait for a curtain.
 * Everything is CSS transform/opacity on composited layers — no per-frame layout.
 * reduceMotion collapses every kind to a 110 ms cross-fade.
 */
import { clock } from '../core/clock.js';
import { Save } from '../core/save.js';

const EASE_IN = (x) => x * x * x;                       // easeInCubic
const EASE_OUT = (x) => 1 - Math.pow(1 - x, 4);         // easeOutQuart
const EASE_SOFT = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/** Ragged ink edge, as an SVG mask reused by every curtain. */
const INK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">
<filter id="mm-ink"><feTurbulence type="fractalNoise" baseFrequency="0.011 0.05" numOctaves="3" seed="7"/>
<feDisplacementMap in="SourceGraphic" scale="46" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="mm-ink2"><feTurbulence type="fractalNoise" baseFrequency="0.016 0.04" numOctaves="3" seed="21"/>
<feDisplacementMap in="SourceGraphic" scale="38" xChannelSelector="R" yChannelSelector="G"/></filter>
</svg>`;

export class Transition {
  constructor(ctx) {
    this.ctx = ctx;
    this.kind = 'veil';
    this.busy = false;

    if (!document.getElementById('mm-ink-defs')) {
      const holder = document.createElement('div');
      holder.id = 'mm-ink-defs';
      holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      holder.innerHTML = INK_SVG;
      document.body.appendChild(holder);
    }

    // Root layer. Kept `display:none` when idle so it can never eat a click.
    this.el = document.createElement('div');
    this.el.className = 'transition';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.cssText =
      'position:absolute;inset:0;pointer-events:none;display:none;overflow:hidden;' +
      'z-index:var(--z-transition);contain:strict';
    ctx.fx.appendChild(this.el);

    this._parts = {};
    this._build();
  }

  /* ------------------------------------------------------------------ setup */

  _part(name, css) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;will-change:transform,opacity;' + css;
    this.el.appendChild(d);
    this._parts[name] = d;
    return d;
  }

  _build() {
    // --- veil: two inky curtains with a ragged, faintly lit meeting edge -----
    this._part('veilTop',
      'left:-6%;width:112%;height:62%;top:-62%;background:' +
      'linear-gradient(to bottom, var(--ink-900) 0%, var(--ink-900) 78%, var(--ink-800) 100%);' +
      'filter:url(#mm-ink)');
    this._part('veilBot',
      'left:-6%;width:112%;height:62%;bottom:-62%;background:' +
      'linear-gradient(to top, var(--ink-900) 0%, var(--ink-900) 78%, var(--ink-800) 100%);' +
      'filter:url(#mm-ink2)');
    this._part('veilGlow',
      'left:0;right:0;top:50%;height:3px;opacity:0;transform:translateY(-50%);' +
      'background:linear-gradient(90deg,transparent,var(--flame-glow),transparent);' +
      'box-shadow:0 0 26px 8px rgba(255,182,74,.35)');

    // --- doorway: two panelled leaves swinging shut --------------------------
    const leaf = (side) =>
      `top:-2%;height:104%;width:52%;${side}:-52%;background:` +
      'linear-gradient(90deg, #0a0710 0%, #171021 38%, #120c1b 62%, #05040a 100%);' +
      'box-shadow:inset 0 0 90px rgba(0,0,0,.95)';
    const dl = this._part('doorL', leaf('left'));
    const dr = this._part('doorR', leaf('right'));
    for (const [d, dir] of [[dl, 1], [dr, -1]]) {
      d.innerHTML =
        `<div style="position:absolute;inset:9% 12%;border:2px solid rgba(255,182,74,.10);border-radius:3px"></div>` +
        `<div style="position:absolute;inset:14% 18% 52% 18%;border:2px solid rgba(255,182,74,.07);border-radius:2px;
          background:linear-gradient(160deg,rgba(255,182,74,.030),transparent 60%)"></div>` +
        `<div style="position:absolute;inset:52% 18% 14% 18%;border:2px solid rgba(255,182,74,.07);border-radius:2px;
          background:linear-gradient(160deg,rgba(255,182,74,.022),transparent 60%)"></div>` +
        `<div style="position:absolute;top:48%;${dir > 0 ? 'right' : 'left'}:7%;width:16px;height:16px;border-radius:50%;
          background:radial-gradient(circle at 35% 30%, #e0b060, #6b4a18 70%, #201404);
          box-shadow:0 0 12px rgba(255,182,74,.35)"></div>`;
    }
    this._part('doorSeam',
      'left:50%;top:0;bottom:0;width:2px;transform:translateX(-50%);opacity:0;' +
      'background:linear-gradient(to bottom,transparent,var(--flame-200),transparent);' +
      'box-shadow:0 0 30px 10px rgba(255,214,150,.35)');

    // --- blueprint: the frame folds into drafting linework -------------------
    const bp = this._part('bp',
      'inset:0;opacity:0;background:' +
      'repeating-linear-gradient(0deg, rgba(45,74,122,.30) 0 1px, transparent 1px 34px),' +
      'repeating-linear-gradient(90deg, rgba(45,74,122,.30) 0 1px, transparent 1px 34px),' +
      'radial-gradient(120% 90% at 50% 45%, #efe3c6 0%, #ddcda8 55%, #bda87f 100%)');
    bp.innerHTML =
      '<div style="position:absolute;inset:3.5%;border:2px solid rgba(45,74,122,.55)"></div>' +
      '<div style="position:absolute;inset:4.6%;border:1px solid rgba(45,74,122,.30)"></div>';
    this._part('bpFoldT',
      'left:0;right:0;top:0;height:50%;transform-origin:50% 100%;opacity:0;' +
      'background:linear-gradient(to bottom, rgba(6,5,12,.0), rgba(6,5,12,.55))');
    this._part('bpFoldB',
      'left:0;right:0;bottom:0;height:50%;transform-origin:50% 0%;opacity:0;' +
      'background:linear-gradient(to top, rgba(6,5,12,.0), rgba(6,5,12,.55))');

    // --- candle-out: the light closes to a point, gutters, then smoke --------
    this._part('candle',
      'inset:0;opacity:0;background:radial-gradient(circle at 50% 52%,' +
      'transparent 0%, transparent var(--mm-hole,60%), var(--ink-900) calc(var(--mm-hole,60%) + 16%))');
    this._part('smoke',
      'left:50%;bottom:34%;width:150px;height:260px;margin-left:-75px;opacity:0;' +
      'background:radial-gradient(60% 40% at 50% 100%, rgba(190,180,200,.30), transparent 70%);' +
      'filter:blur(14px)');

    // --- dawn: warm light floods in from above -------------------------------
    this._part('dawn',
      'inset:0;opacity:0;background:' +
      'radial-gradient(130% 95% at 50% -18%, #fff6e0 0%, #ffd88a 26%, #e0932c 52%, #4a1f10 82%, #07060d 100%)');

    // --- plain fade used for reduceMotion and as the safety floor ------------
    this._part('fade', 'inset:0;opacity:0;background:var(--ink-900)');
  }

  _hideAll() {
    for (const k in this._parts) {
      const p = this._parts[k];
      p.style.opacity = '0';
      p.style.transform = '';
    }
    // Panels are parked just outside the frame by their own offsets, so the
    // "open" state is transform:none and "closed" is a full self-width slide.
    this._parts.veilTop.style.transform = 'translateY(0%)';
    this._parts.veilBot.style.transform = 'translateY(0%)';
    this._parts.doorL.style.transform = 'translateX(0%)';
    this._parts.doorR.style.transform = 'translateX(0%)';
    this.el.style.setProperty('--mm-hole', '60%');
  }

  /* ----------------------------------------------------------------- public */

  async cover(kind = 'veil', opts = {}) {
    this.kind = TRANSITIONS[kind] ? kind : 'veil';
    this.el.style.display = 'block';
    this.el.style.pointerEvents = 'auto';
    this._hideAll();
    if (Save.settings?.reduceMotion) {
      await clock.ramp(0.11, (v) => { this._parts.fade.style.opacity = v; });
      return;
    }
    await TRANSITIONS[this.kind].in(this, opts);
  }

  async reveal(opts = {}) {
    if (Save.settings?.reduceMotion) {
      await clock.ramp(0.11, (v) => { this._parts.fade.style.opacity = 1 - v; });
    } else {
      await TRANSITIONS[this.kind].out(this, opts);
    }
    this.el.style.pointerEvents = 'none';
    this.el.style.display = 'none';
  }

  /** Run a full cover -> fn() -> reveal without going through the scene manager. */
  async wipe(kind, fn) {
    await this.cover(kind);
    try { await fn?.(); } finally { await this.reveal(); }
  }
}

/* ---------------------------------------------------------------- the set */

const TRANSITIONS = {
  /** Default. An inky curtain closes from both edges with a ragged meeting line. */
  veil: {
    in(t) {
      const { veilTop, veilBot, veilGlow } = t._parts;
      veilTop.style.opacity = veilBot.style.opacity = '1';
      veilGlow.style.opacity = '1';
      return clock.ramp(0.30, (v) => {
        veilTop.style.transform = `translateY(${101 * v}%)`;
        veilBot.style.transform = `translateY(${-101 * v}%)`;
        veilGlow.style.opacity = String(Math.sin(Math.PI * v) * 0.9);
      }, EASE_IN);
    },
    out(t) {
      const { veilTop, veilBot, veilGlow } = t._parts;
      return clock.ramp(0.32, (v) => {
        veilTop.style.transform = `translateY(${101 * (1 - v)}%)`;
        veilBot.style.transform = `translateY(${-101 * (1 - v)}%)`;
        veilGlow.style.opacity = String((1 - v) * 0.8);
      }, EASE_OUT);
    },
  },

  /** The mansion swallowing the screen: two heavy leaves slam shut. */
  doorway: {
    async in(t) {
      const { doorL, doorR, doorSeam } = t._parts;
      doorL.style.opacity = doorR.style.opacity = '1';
      doorSeam.style.opacity = '1';
      await clock.ramp(0.34, (v) => {
        doorL.style.transform = `translateX(${101 * v}%)`;
        doorR.style.transform = `translateX(${-101 * v}%)`;
        doorSeam.style.opacity = String(Math.min(1, v * 1.4) * 0.85);
      }, EASE_IN);
      t.ctx.stage?.shake(0.20, 13);
      await clock.ramp(0.09, (v) => { doorSeam.style.opacity = String(0.85 * (1 - v)); });
    },
    out(t) {
      const { doorL, doorR, doorSeam } = t._parts;
      return clock.ramp(0.36, (v) => {
        doorL.style.transform = `translateX(${101 * (1 - v)}%)`;
        doorR.style.transform = `translateX(${-101 * (1 - v)}%)`;
        doorSeam.style.opacity = String((1 - v) * 0.5);
      }, EASE_OUT);
    },
  },

  /** Map <-> room. The frame folds shut and reopens as blueprint linework. */
  blueprint: {
    async in(t) {
      const { bp, bpFoldT, bpFoldB } = t._parts;
      bpFoldT.style.opacity = bpFoldB.style.opacity = '1';
      await clock.ramp(0.30, (v) => {
        bp.style.opacity = String(Math.min(1, v * 1.5));
        bpFoldT.style.transform = `perspective(1100px) rotateX(${-88 * (1 - v)}deg)`;
        bpFoldB.style.transform = `perspective(1100px) rotateX(${88 * (1 - v)}deg)`;
      }, EASE_SOFT);
      bpFoldT.style.opacity = bpFoldB.style.opacity = '0';
    },
    out(t) {
      const { bp } = t._parts;
      return clock.ramp(0.34, (v) => {
        bp.style.opacity = String(1 - v);
        bp.style.transform = `scale(${1 + v * 0.06})`;
      }, EASE_OUT);
    },
  },

  /** Death. The visible world closes to a guttering point, then smoke. */
  'candle-out': {
    async in(t) {
      const { candle, smoke } = t._parts;
      candle.style.opacity = '1';
      await clock.ramp(0.34, (v) => {
        const flick = 1 + Math.sin(v * 47) * 0.06 * (1 - v);
        t.el.style.setProperty('--mm-hole', `${Math.max(0, (60 - 60 * v) * flick)}%`);
      }, EASE_IN);
      smoke.style.opacity = '1';
      await clock.ramp(0.14, (v) => {
        smoke.style.transform = `translateY(${-70 * v}px) scale(${1 + v * 0.7})`;
        smoke.style.opacity = String(0.85 * (1 - v));
        t.el.style.setProperty('--mm-hole', '0%');
      });
    },
    out(t) {
      const { candle } = t._parts;
      return clock.ramp(0.38, (v) => {
        t.el.style.setProperty('--mm-hole', `${68 * v}%`);
        candle.style.opacity = String(1 - v * 0.25);
      }, EASE_OUT);
    },
  },

  /** Victory. Warm light floods down and washes the screen out. */
  dawn: {
    in(t) {
      const { dawn } = t._parts;
      return clock.ramp(0.36, (v) => {
        dawn.style.opacity = String(v);
        dawn.style.transform = `scale(${1.12 - v * 0.12})`;
      }, EASE_SOFT);
    },
    out(t) {
      const { dawn } = t._parts;
      return clock.ramp(0.40, (v) => {
        dawn.style.opacity = String(1 - v);
        dawn.style.transform = `scale(${1 + v * 0.10})`;
      }, EASE_OUT);
    },
  },
};

export const TRANSITION_KINDS = Object.keys(TRANSITIONS);
