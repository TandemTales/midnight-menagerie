/**
 * Hand — the arc fan and every interaction that happens on it.
 * OWNER: card-feel agent.  Spec: docs/STS2-REFERENCE.md §1.
 *
 * A pure view. It never decides rules: it asks `getTargets()` who can be hit,
 * asks `setPlayable(fn)` what is affordable, calls `onPlay()` when the player
 * commits, and shouts on the bus. Everything else is motion.
 *
 *   const hand = new Hand(ctx, { root, onPlay, onPreview, getTargets });
 *   hand.setCards(cards);  hand.draw(cards);  hand.discardAll();
 *   hand.exhaust(uid);     hand.setEnergy(3); hand.lock(); hand.unlock();
 *
 * Bus: card:hover, card:unhover, card:pickup, card:drop, card:target,
 *      card:play {cardUid,targetId}, card:cancel
 *
 * Motion model: one frame loop (clock.onFrame) drives every card through a
 * duration-based tween that can be retargeted mid-flight (from = current), so
 * the fan re-lays out with easing and never snaps. One-shot flights (play,
 * discard, exhaust) leave the layout and run on clock.ramp beziers.
 */
import { clock as defaultClock, Clock } from '../core/clock.js';
import { bus as defaultBus } from '../core/bus.js';
import { CardView, CARD_SS } from './card.js';

/** Every tuned number in one place. Milliseconds are seconds here. */
export const TUNE = {
  // hover — the single most-felt interaction. STS2 §1: "under 120ms".
  hoverIn: 0.105, hoverOut: 0.090,
  hoverLift: 46, hoverScale: 1.19, hoverNudge: 30,
  // fan
  refan: 0.30, refanStagger: 0.010,
  rotPerCard: 3.1, maxFanDeg: 15,
  stepRatio: 0.82, arcDip: 5.4, arcDipMax: 62,
  unplayableDrop: 24, unplayableScale: 0.965,
  bottomPad: 20,

  // ── fit: how the hand stays on screen ──────────────────────────────────
  // StS shrinks the cards as the hand grows. A fixed 224x312 box never fit:
  // at n=12/1600x900 it overlapped 171px of 224 (76%) and hung 32px below the
  // viewport. These three numbers are the contract:
  maxCardHFrac: 0.30,   // a card is never taller than 30% of the viewport
  maxOverlap: 0.45,     // a card never hides more than 45% of its neighbour
  sideMarginFrac: 0.10, // free gutter each side (energy orb, draw/discard piles)
  sideMarginMin: 150,
  minFit: 0.62,         // never shrink past this fraction of the CSS card size

  // draw / discard / exhaust — three different signatures
  drawIn: 0.34, drawStagger: 0.055, drawFlick: 18,
  discard: 0.40, discardStagger: 0.035,
  exhaust: 0.38, exhaustRise: 96,
  // play
  playTo: 0.26, playHold: 0.20, playArc: 0.44, playScale: 1.30, playY: 0.62,
  playOvershoot: 0.11,
  // drag
  dragFollow: 0.075, dragScale: 1.10, dragTiltMax: 14, dragTiltGain: 0.85,
  parkScale: 1.06, snapPad: 26,
  thresholdFrac: 0.54,
  // arrow
  arrowHead: 30,        // solid triangle, px
  arrowReticleR: 46,    // the tip stops on the reticle, never in the sprite
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function bez(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

let UID = 0;

export class Hand {
  /**
   * @param {object} ctx  { bus, clock, Save } — all optional, falls back to singletons
   * @param {object} opts { root, onPlay, onPreview, getTargets, bottom }
   */
  constructor(ctx = {}, opts = {}) {
    this.ctx = ctx;
    this.bus = opts.bus || ctx.bus || defaultBus;
    this.clock = opts.clock || ctx.clock || defaultClock;
    this.Save = opts.Save || ctx.Save || null;

    this.onPlay = opts.onPlay || null;
    this.onPreview = opts.onPreview || null;
    this.getTargets = opts.getTargets || (() => []);

    this.slots = [];
    this.flying = new Set();
    this.energy = 3;
    this.locked = false;
    this.hoverSlot = null;
    this.selIdx = -1;
    this.drag = null;
    this.aim = null;
    this.targets = [];
    this.w = 1600; this.h = 900;
    this.cw = 224; this.chh = 312;   // on-screen card size at fit 1 (measured)
    this.fit = 1;                    // current per-hand size multiplier
    this._anyUnplayable = false;

    this.playableFn = (card) => {
      const c = card.cost ?? card.def.cost ?? 1;
      return c !== -2 && (c < 0 || c <= this.energy);
    };

    this._readSettings();
    this._buildDom(opts.root);
    this._bind();

    this._offFrame = this.clock.onFrame((dt) => this._tick(dt));
    this._offSettings = this.bus.on('settings:changed', () => {
      this._readSettings();
      for (const s of this.slots) s.view.setState({ largeText: this.largeText });
      this._layout();
    });
  }

  // ── setup ────────────────────────────────────────────────────────────────
  _readSettings() {
    const st = this.Save?.settings || this.Save?.data?.settings || {};
    this.reduceMotion = !!st.reduceMotion;
    this.largeText = !!st.largeText;
  }
  /** Every duration passes through here so reduceMotion is one switch. */
  _d(sec) { return this.reduceMotion ? 0.001 : sec; }

  _buildDom(root) {
    const el = document.createElement('div');
    el.className = 'mm-hand';
    el.innerHTML = `
      <div class="mm-hand__threshold" data-label="Release to play"></div>
      <div class="mm-hand__cards"></div>
      <div class="mm-hand__hit"></div>
      <svg class="mm-hand__arrow" xmlns="http://www.w3.org/2000/svg">
        <path class="mm-arrow__glow"  d=""></path>
        <path class="mm-arrow__body"  d=""></path>
        <path class="mm-arrow__head"  d=""></path>
        <g class="mm-arrow__reticle">
          <circle r="46" cx="0" cy="0"></circle>
          <path d="M-46,-28 L-46,-46 L-28,-46 M28,-46 L46,-46 L46,-28
                   M46,28 L46,46 L28,46 M-28,46 L-46,46 L-46,28"></path>
        </g>
      </svg>`;
    this.el = el;
    // The hand is the single Tab stop for the whole hand; individual cards are
    // tabindex="-1" and get roving focus. See `_key` — Tab is trapped here
    // while a card is selected so focus can never escape mid-decision.
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Your hand');
    // A hidden card used only to measure the CSS card size (which is now
    // responsive) without depending on a real card existing.
    const probe = document.createElement('div');
    probe.className = 'mm-card mm-hand__probe';
    probe.setAttribute('aria-hidden', 'true');
    el.appendChild(probe);
    this._probe = probe;
    this.layer = el.querySelector('.mm-hand__cards');
    this.hit = el.querySelector('.mm-hand__hit');
    this.$arrow = el.querySelector('.mm-hand__arrow');
    this.$glow = el.querySelector('.mm-arrow__glow');
    this.$body = el.querySelector('.mm-arrow__body');
    this.$head = el.querySelector('.mm-arrow__head');
    this.$ret = el.querySelector('.mm-arrow__reticle');
    this.$thresh = el.querySelector('.mm-hand__threshold');
    if (this.reduceMotion) el.classList.add('mm-reduce');

    if (root) { root.appendChild(el); this.mount(root); }
  }

  mount(parent) {
    if (this.el.parentNode !== parent) parent.appendChild(this.el);
    this._measure();
    this._ro = new ResizeObserver(() => { this._measure(); this._layout(); });
    this._ro.observe(this.el);
    return this;
  }

  _measure() {
    this.w = this.el.clientWidth || this.el.parentNode?.clientWidth || 1600;
    this.h = this.el.clientHeight || this.el.parentNode?.clientHeight || 900;

    // The CSS card size is responsive (`--mm-card-w` in card.css), so read it
    // rather than assuming 224x312. The probe is built at CARD_SS; divide it
    // back out to get the size a card occupies on screen at transform scale 1.
    const pw = this._probe?.offsetWidth || 224 * CARD_SS;
    const ph = this._probe?.offsetHeight || 312 * CARD_SS;
    this.cw = pw / CARD_SS;
    this.chh = ph / CARD_SS;

    this.baseY = this.h - TUNE.bottomPad;
    this.thresholdY = this.h * TUNE.thresholdFrac;
    // held card floats above the hand; enemies stay visible above it
    this.parkY = Math.round(this.h - Math.max(96, this.chh * 0.42));
    this.piles = this.piles || {};
    this.piles.draw = this.piles.draw || { x: 96, y: this.h + 40 };
    this.piles.discard = this.piles.discard || { x: this.w - 96, y: this.h + 40 };
    this.$thresh.style.top = this.thresholdY + 'px';
    this.hit.style.top = Math.round(Math.max(0, this.h - (this.chh * 1.5 + 90))) + 'px';
    this.$arrow.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
  }

  /** Gutter each side that the fan must never enter (energy orb, piles). */
  _sideMargin() { return Math.max(TUNE.sideMarginMin, this.w * TUNE.sideMarginFrac); }

  /**
   * The per-hand size multiplier. Driven by BOTH the viewport and the hand
   * size, exactly as StS does it: a big hand of small cards beats a small hand
   * of clipped ones.
   *
   *   1. a card is never taller than `maxCardHFrac` of the viewport;
   *   2. laid out at the widest allowed overlap the whole fan still fits
   *      inside the safe band (viewport minus both gutters).
   */
  _fit(n) {
    const ch = this.chh, cw = this.cw;
    let s = Math.min(1, (this.h * TUNE.maxCardHFrac) / (ch || 1));
    if (n > 1) {
      const band = Math.max(cw * 0.8, this.w - this._sideMargin() * 2);
      // The outer card is ROTATED about its bottom centre, so it reaches
      // cw·cosθ/2 + ch·sinθ past its anchor — far more than half a card width.
      // Budgeting only cw/2 is what let the fan run to x = -9 at n=12.
      const A = this._overhang(n, 1);
      const need = s * ((n - 1) * cw * (1 - TUNE.maxOverlap) + 2 * A);
      if (need > band) s *= band / need;
    }
    return clamp(s, TUNE.minFit, 1);
  }

  /** Horizontal reach of the outermost card past its anchor, at scale `s`. */
  _overhang(n, s) {
    const th = (n <= 1 ? 0 : Math.min(TUNE.rotPerCard * (n - 1) / 2, TUNE.maxFanDeg)) * Math.PI / 180;
    return s * (this.cw * Math.cos(th) / 2 + this.chh * Math.sin(th));
  }

  /** Where cards fly to/from. Combat scene should call this with real pile positions. */
  setPiles(p) { this.piles = Object.assign(this.piles || {}, p); return this; }

  /**
   * Rehearsal. Call once on scene entry, together with `warmArt()`.
   *
   * The FIRST time a card is rasterised the compositor pays for shader
   * compilation, shadow-blur caches and glyph atlases; measured cold, drawing
   * five cards into a hand of twelve cost a single 280 ms frame (45 fps over
   * the second) and the same action a moment later cost 18 ms. That is a
   * warm-up cost, not a per-frame cost, and the place to pay it is scene
   * entry — not the first attack of the fight.
   *
   * This paints `count` throwaway cards for a few frames at 2% opacity behind
   * the hand (nothing legible, but the compositor does real work on them),
   * covering the hover, unplayable and hero variants too, then discards them.
   *
   * @param {object[]} defs   CardDefs to rehearse with (the deck)
   * @param {number} count    how many cards to paint at once
   * @returns {Promise<number>}
   */
  warmRaster(defs, count = 8) {
    const list = (defs || []).filter(Boolean);
    if (!list.length || typeof document === 'undefined') return Promise.resolve(0);
    const host = document.createElement('div');
    host.className = 'mm-hand__warm';
    host.setAttribute('aria-hidden', 'true');
    this.el.appendChild(host);
    const views = [];
    const cols = Math.max(1, Math.floor(this.w / Math.max(120, this.cw)) || 4);
    for (let i = 0; i < count; i++) {
      const v = new CardView(list[i % list.length], {
        uid: 'warm#' + i, clock: this.clock, reduceMotion: true,
        upgraded: i % 3 === 2,
      });
      v.setTransform({
        x: (i % cols) * this.cw + this.cw * 0.6,
        y: Math.floor(i / cols) * this.chh + this.chh,
        rot: (i % 5) - 2, scale: 1, z: i,
      });
      host.appendChild(v.el);
      views.push(v);
    }
    if (views[0]) views[0].setState({ hover: true });
    if (views[1]) views[1].setState({ playable: false });
    if (views[2]) views[2].hero(true);
    if (views[3]) views[3].setState({ selected: true });
    return new Promise((res) => {
      let f = 0;
      const tick = () => {
        if (++f < 5) { requestAnimationFrame(tick); return; }
        for (const v of views) v.destroy();
        host.remove();
        res(views.length);
      };
      requestAnimationFrame(tick);
    });
  }

  // ── card list ────────────────────────────────────────────────────────────
  _norm(c) {
    const def = c.def || c;
    return {
      uid: c.uid || `${def.id}#${++UID}`,
      def, upgraded: !!c.upgraded,
      cost: c.cost !== undefined ? c.cost : undefined,
      src: c,
    };
  }

  _makeSlot(card, entering, delay) {
    const view = new CardView(card.def, {
      uid: card.uid, upgraded: card.upgraded, cost: card.cost,
      largeText: this.largeText, reduceMotion: this.reduceMotion, clock: this.clock,
    });
    this.layer.appendChild(view.el);
    const f = this.fit || 1;
    const start = entering
      ? { x: this.piles.draw.x, y: this.piles.draw.y, rot: -26, scale: 0.52 * f, z: 0 }
      : { x: this.w / 2, y: this.baseY + 60, rot: 0, scale: 0.9 * f, z: 0 };
    const slot = {
      card, view,
      cur: { ...start }, from: { ...start }, to: { ...start },
      e: 1, dur: 1, delay: 0, ease: Clock.easeOutCubic, flick: 0,
      entering: !!entering, enterDelay: delay || 0,
    };
    view.setTransform(slot.cur);
    if (entering) view.materialize(this._d(0.24));
    return slot;
  }

  /** Replace the whole hand (no draw animation for cards already present). */
  setCards(cards) {
    const next = cards.map(c => this._norm(c));
    const keep = new Map(this.slots.map(s => [s.card.uid, s]));
    const out = [];
    for (const c of next) {
      const ex = keep.get(c.uid);
      if (ex) { keep.delete(c.uid); ex.card = c; out.push(ex); }
      else out.push(this._makeSlot(c, false, 0));
    }
    for (const dead of keep.values()) {
      if (document.activeElement === dead.view.el) this.el.focus?.({ preventScroll: true });
      dead.view.destroy();
    }
    this.slots = out;
    this.selIdx = -1;            // the hand changed; no stale keyboard selection
    this._clearHover();
    this._refreshPlayable(true);
    return this;
  }

  /** Draw: cards riffle up from the draw pile, staggered. */
  draw(cards) {
    const list = (Array.isArray(cards) ? cards : [cards]).map(c => this._norm(c));
    list.forEach((c, i) => {
      const s = this._makeSlot(c, true, i * this._d(TUNE.drawStagger));
      s.flick = TUNE.drawFlick * (i % 2 ? 1 : -1);
      this.slots.push(s);
    });
    this._refreshPlayable(true);
    return this;
  }

  /** Discard: every card tumbles away to the discard pile. */
  async discardAll() {
    const going = this.slots.slice();
    this.slots = [];
    this._clearHover();
    this._layout();
    await Promise.all(going.map((s, i) => this._flyToPile(s, {
      pile: this.piles.discard,
      dur: this._d(TUNE.discard),
      delay: this._d(i * TUNE.discardStagger),
      tumble: true,
    })));
    return this;
  }

  /** Discard specific uids (tumble). */
  async discard(uids) {
    const set = new Set(Array.isArray(uids) ? uids : [uids]);
    const going = this.slots.filter(s => set.has(s.card.uid));
    this.slots = this.slots.filter(s => !set.has(s.card.uid));
    if (this.hoverSlot && set.has(this.hoverSlot.card.uid)) this._clearHover();
    this._layout();
    await Promise.all(going.map((s, i) => this._flyToPile(s, {
      pile: this.piles.discard, dur: this._d(TUNE.discard),
      delay: this._d(i * TUNE.discardStagger), tumble: true,
    })));
    return this;
  }

  /** Exhaust: rises and burns away into embers. */
  async exhaust(uid) {
    const i = this.slots.findIndex(s => s.card.uid === uid);
    if (i < 0) return this;
    const slot = this.slots[i];
    this.slots.splice(i, 1);
    if (this.hoverSlot === slot) this._clearHover();
    this._layout();
    this.flying.add(slot);
    const c = { ...slot.view.transform };
    const dur = this._d(TUNE.exhaust);
    const rise = this.clock.ramp(dur, (p) => {
      slot.view.setTransform({
        x: c.x, y: c.y - TUNE.exhaustRise * this.fit * p,
        rot: c.rot * (1 - p), scale: c.scale * (1 + 0.08 * p), z: 900,
      });
    }, Clock.easeOutCubic);
    await Promise.all([rise, slot.view.dissolve(dur)]);
    slot.view.destroy();
    this.flying.delete(slot);
    return this;
  }

  cards() { return this.slots.map(s => s.card); }
  viewOf(uid) { return this.slots.find(s => s.card.uid === uid)?.view || null; }
  get count() { return this.slots.length; }

  // ── playability ──────────────────────────────────────────────────────────
  setPlayable(fn) { this.playableFn = fn || this.playableFn; this._refreshPlayable(true); return this; }
  setEnergy(n) { this.energy = n; this._refreshPlayable(true); return this; }

  _refreshPlayable(relayout) {
    let any = false;
    for (const s of this.slots) {
      const ok = !!this.playableFn(s.card, this.energy);
      if (s.playable !== ok) { s.playable = ok; s.view.setState({ playable: ok }); }
      if (!ok) any = true;
    }
    this._anyUnplayable = any;   // the fan reserves the 24px drop only if needed
    if (relayout) this._layout();
  }

  lock() { this.locked = true; this.el.classList.add('is-locked'); this._cancelAim(); this._clearHover(); return this; }
  unlock() { this.locked = false; this.el.classList.remove('is-locked'); return this; }

  // ── layout: the arc fan ──────────────────────────────────────────────────
  /**
   * STS2 §1: "Cards rotate along the arc (roughly ±3° per card from centre),
   * and their vertical position follows the arc too — outer cards sit lower.
   * With few cards the arc flattens; with many, cards overlap and the arc
   * tightens." Recomputed with easing on every change — never a teleport.
   */
  /**
   * Fan geometry for n cards. Shared by layout and hit-testing so they agree.
   * Everything here is in real screen px at the CURRENT fit scale.
   */
  _fan(n) {
    const T = TUNE;
    const c = (n - 1) / 2;
    const fit = this._fit(n);
    const cw = this.cw * fit, ch = this.chh * fit;
    const band = Math.max(cw, this.w - this._sideMargin() * 2);

    const f = this._fanTmp || (this._fanTmp = {});
    f.fit = fit; f.cw = cw; f.ch = ch; f.c = c;
    f.overhang = this._overhang(n, fit);
    // The widest step the safe band allows, capped so cards never separate.
    f.step = n > 1 ? Math.max(8, Math.min(cw * T.stepRatio, (band - 2 * f.overhang) / (n - 1))) : 0;
    f.rotPer = n <= 1 ? 0 : Math.min(T.rotPerCard, T.maxFanDeg / c);
    f.dip = Math.min(T.arcDipMax, 6 + n * T.arcDip) * fit;
    // A rotated card's bounding box hangs (w/2)·sin(rot) below its anchor, and
    // an unaffordable one drops another 24px. Both are reserved here, so
    // max(card.bottom) == h - bottomPad for EVERY n. Nothing is ever clipped.
    f.sag = Math.abs(Math.sin(f.rotPer * c * Math.PI / 180)) * cw / 2;
    f.drop = this._anyUnplayable ? T.unplayableDrop * fit : 0;
    f.baseY = this.h - T.bottomPad - f.dip - f.sag - f.drop;
    f.cx = this.w / 2;
    f.lift = T.hoverLift * fit;
    f.nudge = T.hoverNudge * fit;
    this.fit = fit;
    return f;
  }

  /** What the critic's assertion measures: the lowest pixel any card reaches. */
  maxBottom() {
    let m = -Infinity;
    for (const s of this.slots) {
      const c = s.cur;
      const hw = this.cw * c.scale / 2;
      m = Math.max(m, c.y + Math.abs(Math.sin(c.rot * Math.PI / 180)) * hw);
    }
    return m === -Infinity ? 0 : m;
  }

  _layout(o = {}) {
    const n = this.slots.length;
    if (!n) return;
    const T = TUNE;
    const F = this._fan(n);
    const c = F.c, step = F.step, rotPer = F.rotPer, dip = F.dip, cx = F.cx, fit = F.fit;
    this.baseY = F.baseY;

    const hover = this.hoverSlot;
    const hoverIdx = hover ? this.slots.indexOf(hover) : -1;
    const dragSlot = this.drag ? this.drag.slot : null;

    for (let i = 0; i < n; i++) {
      const s = this.slots[i];
      const d = i - c;
      const norm = c ? Math.abs(d) / c : 0;

      let x = cx + d * step;
      let y = F.baseY + Math.pow(norm, 1.85) * dip;
      let rot = d * rotPer;
      let scale = fit;
      let z = 20 + i;

      if (!s.playable) { y += T.unplayableDrop * fit; scale = fit * T.unplayableScale; }

      if (hoverIdx >= 0 && i !== hoverIdx) {
        const dd = i - hoverIdx;
        const fall = Math.abs(dd) === 1 ? 1 : Math.abs(dd) === 2 ? 0.42 : Math.abs(dd) === 3 ? 0.16 : 0;
        x += Math.sign(dd) * F.nudge * fall;
        y += 4 * fall;
      }
      if (i === hoverIdx) {
        y = F.baseY - F.lift;
        rot = 0; scale = fit * T.hoverScale; z = 500;
      }

      if (s === dragSlot) continue;               // drag owns its own goal

      let dur = o.dur ?? this._d(TUNE.refan);
      let delay = 0;
      if (s.entering) { dur = this._d(TUNE.drawIn); delay = s.enterDelay; s.entering = false; s.ease = Clock.easeOutBack; }
      else if (o.stagger) delay = Math.abs(d) * this._d(TUNE.refanStagger);
      else s.ease = Clock.easeOutCubic;

      this._goal(s, x, y, rot, scale, z, dur, delay);
    }
  }

  _goal(s, x, y, rot, scale, z, dur, delay = 0, ease) {
    const t = s.to;
    if (t.x === x && t.y === y && t.rot === rot && t.scale === scale && t.z === z && s.e >= s.dur) return;
    s.from.x = s.cur.x; s.from.y = s.cur.y; s.from.rot = s.cur.rot;
    s.from.scale = s.cur.scale; s.from.z = s.cur.z;
    t.x = x; t.y = y; t.rot = rot; t.scale = scale; t.z = z;
    s.e = 0; s.dur = Math.max(dur, 0.001); s.delay = delay;
    if (ease) s.ease = ease;
  }

  // ── frame loop ───────────────────────────────────────────────────────────
  _tick(dt) {
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.delay > 0) { s.delay -= dt; if (s.delay > 0) continue; }
      if (s.e >= s.dur) continue;
      s.e += dt;
      const p = s.e >= s.dur ? 1 : s.e / s.dur;
      const k = s.ease(p);
      const cu = s.cur, f = s.from, t = s.to;
      cu.x = lerp(f.x, t.x, k);
      cu.y = lerp(f.y, t.y, k);
      cu.rot = lerp(f.rot, t.rot, k) + (s.flick ? Math.sin(p * Math.PI) * s.flick : 0);
      cu.scale = lerp(f.scale, t.scale, k);
      cu.z = t.z > f.z ? t.z : (p >= 1 ? t.z : f.z);
      s.view.setTransform(cu);
      if (p >= 1) s.flick = 0;
    }
    if (this.aim) this._drawArrow();
  }

  // ── pointer ──────────────────────────────────────────────────────────────
  _bind() {
    const hit = this.hit;
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    this._onLeave = () => { if (!this.drag) this._setHover(null); };
    hit.addEventListener('pointerdown', this._onDown);
    hit.addEventListener('pointermove', this._onMove);
    hit.addEventListener('pointerup', this._onUp);
    hit.addEventListener('pointercancel', this._onUp);
    hit.addEventListener('pointerleave', this._onLeave);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    // Tabbing into the hand puts you on a card immediately — the keyboard path
    // must be discoverable, not a secret set of shortcuts.
    this._onFocusIn = (e) => {
      if (e.target === this.el && !this.locked && this.selIdx < 0 && this.slots.length) {
        this._selectIdx(Math.floor(this.slots.length / 2));
      }
    };
    this.el.addEventListener('focusin', this._onFocusIn);
  }

  _local(e) {
    const r = this._rect || (this._rect = this.el.getBoundingClientRect());
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * Hit test against the *base* fan geometry, so a card that lifts under the
   * cursor can never oscillate. The currently hovered card also keeps its
   * lifted body as a hit region, so moving up onto it stays hovered.
   */
  _hitTest(px, py) {
    const inside = (s, geo) => {
      const dx = px - geo.x, dy = py - geo.y;
      const a = -geo.rot * Math.PI / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      const hw = this.cw * geo.scale / 2, hh = this.chh * geo.scale;
      return lx >= -hw && lx <= hw && ly >= -hh && ly <= 0;
    };
    if (this.hoverSlot && inside(this.hoverSlot, this.hoverSlot.cur)) return this.hoverSlot;
    const n = this.slots.length, c = (n - 1) / 2;
    for (let i = n - 1; i >= 0; i--) {
      const s = this.slots[i];
      const base = this._baseGeo(i, c, n);
      if (inside(s, base)) return s;
    }
    return null;
  }
  _baseGeo(i, c, n) {
    const F = this._fan(n);
    const d = i - c, norm = c ? Math.abs(d) / c : 0;
    const g = this._geoTmp || (this._geoTmp = {});
    g.x = F.cx + d * F.step;
    g.y = F.baseY + Math.pow(norm, 1.85) * F.dip
        + (this.slots[i].playable === false ? TUNE.unplayableDrop * F.fit : 0);
    g.rot = d * F.rotPer;
    g.scale = F.fit * (this.slots[i].playable === false ? TUNE.unplayableScale : 1);
    return g;
  }

  _setHover(slot) {
    if (this.locked || this.drag) return;
    if (slot === this.hoverSlot) return;
    const prev = this.hoverSlot;
    this.hoverSlot = slot;
    if (prev) {
      prev.view.setState({ hover: false });
      this.bus.emit('card:unhover', { uid: prev.card.uid, cardId: prev.card.def.id });
    }
    if (slot) {
      slot.view.setState({ hover: true });
      this.selIdx = this.slots.indexOf(slot);
      this.bus.emit('card:hover', { uid: slot.card.uid, cardId: slot.card.def.id, view: slot.view });
    }
    this._layout({ dur: this._d(slot ? TUNE.hoverIn : TUNE.hoverOut) });
  }
  _clearHover() {
    if (this.hoverSlot) { this.hoverSlot.view.setState({ hover: false }); this.hoverSlot = null; }
  }

  _pointerDown(e) {
    if (this.locked) return;
    this._rect = this.el.getBoundingClientRect();
    const p = this._local(e);
    const slot = this._hitTest(p.x, p.y);
    if (!slot) return;
    e.preventDefault();
    this.hit.setPointerCapture(e.pointerId);
    this._setHover(slot);
    this._readTargets();
    this.drag = {
      slot, px: p.x, py: p.y, lastX: p.x, tilt: 0, moved: 0,
      needsTarget: this._needsTarget(slot.card.def),
      snap: null, committed: false, pointerId: e.pointerId,
    };
    slot.view.setState({ dragging: true });
    this.bus.emit('card:pickup', { uid: slot.card.uid, cardId: slot.card.def.id });
    if (!this.drag.needsTarget) this.$thresh.classList.add('is-on');
  }

  _needsTarget(def) { return def.target === 'enemy' || def.target === 'ally'; }

  _pointerMove(e) {
    const p = this._local(e);
    if (!this.drag) { this._setHover(this._hitTest(p.x, p.y)); return; }
    const d = this.drag;
    const dx = p.x - d.px;
    d.moved += Math.abs(dx) + Math.abs(p.y - d.py);
    d.px = p.x; d.py = p.y;

    const tiltTarget = clamp(dx * TUNE.dragTiltGain, -TUNE.dragTiltMax, TUNE.dragTiltMax);
    d.tilt += (tiltTarget - d.tilt) * 0.35;
    d.tilt *= 0.86;

    const above = p.y < this.thresholdY;
    const s = d.slot;

    const fit = this.fit;
    if (d.needsTarget && above) {
      // Card parks; the arrow does the aiming.
      const parkX = lerp(this.w / 2, p.x, 0.18);
      this._goal(s, parkX, this.parkY, 0, fit * TUNE.parkScale, 600, this._d(0.16), 0, Clock.easeOutCubic);
      this._updateSnap(p.x, p.y);
      this.aim = { slot: s, x: p.x, y: p.y, snap: d.snap, valid: !!d.snap && s.playable !== false };
      this._showArrow(true);
    } else {
      // Card follows the cursor with lag + tilt toward motion.
      const y = Math.min(this.h - 6, p.y + this.chh * fit * TUNE.dragScale * 0.5);
      this._goal(s, p.x, y, d.tilt, fit * TUNE.dragScale, 600,
        this._d(TUNE.dragFollow), 0, Clock.easeOutCubic);
      if (d.needsTarget) { this._showArrow(false); this.aim = null; d.snap = null; this._clearPreview(s); }
      else {
        // The threshold only ARMS for a card that can actually be played.
        // Amber "RELEASE TO PLAY" over a card that will be refused is a lie.
        const ok = s.playable !== false;
        this.$thresh.classList.toggle('is-armed', above && ok);
        this.$thresh.classList.toggle('is-blocked', above && !ok);
        if (above !== d.wasAbove) {
          d.wasAbove = above;
          if (above && ok) s.view.pulse('var(--flame-glow)', 0.3);
        }
      }
    }
  }

  _pointerUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try { this.hit.releasePointerCapture(d.pointerId); } catch { /* already gone */ }
    const s = d.slot;
    s.view.setState({ dragging: false });
    this.$thresh.classList.remove('is-on', 'is-armed', 'is-blocked');
    this._showArrow(false);
    this.aim = null;
    this._clearPreview(s);
    this.bus.emit('card:drop', { uid: s.card.uid, cardId: s.card.def.id });

    const above = d.py < this.thresholdY;
    const commit = d.needsTarget ? !!d.snap : above;
    if (commit && s.playable) {
      this._commit(s, d.snap ? d.snap.id : undefined);
    } else {
      if (commit && !s.playable) s.view.shake(9, 0.3);
      this.bus.emit('card:cancel', { uid: s.card.uid, cardId: s.card.def.id });
      this._clearHover();
      this._layout({ dur: this._d(0.26) });
    }
  }

  // ── targets, snapping, preview ───────────────────────────────────────────
  _readTargets() {
    this._rect = this.el.getBoundingClientRect();
    const r = this._rect;
    const list = this.getTargets() || [];
    this.targets = list.map((t) => {
      const b = t.el ? t.el.getBoundingClientRect() : null;
      return b
        ? { id: t.id, el: t.el, x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height,
            cx: b.left - r.left + b.width / 2, cy: b.top - r.top + b.height / 2 }
        : { id: t.id, el: null, x: t.x || 0, y: t.y || 0, w: 0, h: 0, cx: t.x || 0, cy: t.y || 0 };
    });
  }

  _updateSnap(px, py) {
    const pad = TUNE.snapPad;
    let hitT = null, bestD = Infinity;
    for (const t of this.targets) {
      if (px >= t.x - pad && px <= t.x + t.w + pad && py >= t.y - pad && py <= t.y + t.h + pad) { hitT = t; break; }
      const dx = px - t.cx, dy = py - t.cy, dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; }
    }
    const d = this.drag;
    const prev = d.snap ? d.snap.id : null;
    d.snap = hitT;
    if ((hitT ? hitT.id : null) !== prev) {
      if (hitT) {
        this._snapPulse = 0;
        this.clock.ramp(this._d(0.22), (v) => { this._snapPulse = 1 - v; });
        d.slot.view.pulse('var(--flame-glow)', this._d(0.3));
        this.bus.emit('card:target', { uid: d.slot.card.uid, targetId: hitT.id });
        this._applyPreview(hitT.id);
      } else {
        this._applyPreview(null);
      }
    }
  }

  /** Put the card's numbers back to their printed values. */
  _clearPreview(slot) {
    this._previewFor = null;
    slot?.view.setPreviewNumbers(null);
  }

  _applyPreview(targetId) {
    if (!this.onPreview) return;
    const slot = (this.drag && this.drag.slot) || (this.aim && this.aim.slot) || null;
    if (!slot) return;
    if (this._previewFor === (targetId || '') + slot.card.uid) return;
    this._previewFor = (targetId || '') + slot.card.uid;
    let res = null;
    try { res = this.onPreview({ card: slot.card, uid: slot.card.uid, targetId }); } catch (err) { console.error(err); }
    slot.view.setPreviewNumbers(res || null);
  }

  // ── the arrow ────────────────────────────────────────────────────────────
  _showArrow(on) {
    this.$arrow.classList.toggle('is-on', !!on);
    if (!on) { this.$arrow.classList.remove('is-snapped', 'is-invalid'); }
  }

  /**
   * The targeting arrow. STS2-REFERENCE §1: "a curved arrow springs from the
   * card to the cursor and snaps onto the hovered enemy with a distinct click
   * of feedback and a target reticle."
   *
   * Two things were wrong before and both are fixed here:
   *  - the head had ZERO AREA. The terminal tangent was taken from t → t+0.01
   *    clamped to 1, which at the last sample is t → t, so the direction was
   *    (0,0) and the head path collapsed to `M x,y L x,y L x,y Z`. The tangent
   *    is now taken BACKWARDS (t-δ → t), which is always defined, and the head
   *    is a solid 30px triangle.
   *  - with the body's `(1 - t^8·0.9)` taper the ribbon pinched to nothing at
   *    the target and bulged in the middle: a comet with its fat end at the
   *    enemy, so which way it pointed was ambiguous. The ribbon now widens
   *    monotonically toward the target and stops at the base of the head.
   *
   * The tip stops on the reticle ring instead of piercing the sprite, and the
   * whole thing stays grey when the card cannot actually be paid for.
   */
  _drawArrow() {
    const a = this.aim;
    if (!a) return;
    const T = TUNE;
    const slot = a.slot;
    const v = slot.view.transform;
    const playable = slot.playable !== false;
    const snap = a.snap;
    const live = !!snap && playable;

    const x0 = v.x, y0 = v.y - this.chh * v.scale * 0.72;
    const tgx = snap ? snap.cx : a.x;
    const tgy = snap ? snap.cy : a.y;

    const dist = Math.hypot(tgx - x0, tgy - y0);
    const bow = clamp(dist * 0.42, 60, 230);

    // Terminal tangent of a cubic bezier is P3 - P2. Use it to back the tip
    // off to the reticle edge, then rebuild the curve on the new endpoint.
    const g2x = lerp(x0, tgx, 0.55), g2y = tgy - bow * 0.55;
    let ax = tgx - g2x, ay = tgy - g2y;
    const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const back = snap ? Math.min(T.arrowReticleR, dist * 0.45) : 0;
    const x3 = tgx - ax * back, y3 = tgy - ay * back;

    const x1 = x0, y1 = y0 - bow;
    const x2 = lerp(x0, x3, 0.55), y2 = y3 - bow * 0.55;

    // sample + cumulative arc length so the ribbon can stop exactly at the
    // base of the head no matter how long or short the throw is
    const N = 26;
    const P = this._arrowPts || (this._arrowPts = []);
    P.length = 0;
    let total = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const px = bez(x0, x1, x2, x3, t), py = bez(y0, y1, y2, y3, t);
      if (i) total += Math.hypot(px - P[i - 1][0], py - P[i - 1][1]);
      P.push([px, py, total]);
    }

    const head = T.arrowHead;
    const stop = Math.max(total * 0.12, total - head * 0.82);

    const L = [], Rr = [];
    for (let i = 0; i <= N; i++) {
      if (P[i][2] > stop) break;
      const px = P[i][0], py = P[i][1];
      // tangent from the PREVIOUS sample (never degenerate, including i === N)
      const q = i > 0 ? P[i - 1] : P[1];
      const tx = i > 0 ? px - q[0] : q[0] - px;
      const ty = i > 0 ? py - q[1] : q[1] - py;
      const m = Math.hypot(tx, ty) || 1;
      const nx = -ty / m, ny = tx / m;
      const k = total ? P[i][2] / total : 0;
      const wdt = lerp(4.5, 12.5, Math.pow(k, 0.8));    // monotonic: thin → thick
      L.push((px + nx * wdt).toFixed(1) + ',' + (py + ny * wdt).toFixed(1));
      Rr.push((px - nx * wdt).toFixed(1) + ',' + (py - ny * wdt).toFixed(1));
    }
    Rr.reverse();
    this.$body.setAttribute('d', 'M' + L.join(' L') + ' L' + Rr.join(' L') + ' Z');
    this.$glow.setAttribute('d',
      `M${x0.toFixed(1)},${y0.toFixed(1)} C${x1.toFixed(1)},${y1.toFixed(1)} ` +
      `${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}`);

    // ── head: a solid triangle, tip on the reticle, pointing at the target ──
    const pen = P[N - 1];
    let hx = x3 - pen[0], hy = y3 - pen[1];
    const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
    const nx = -hy, ny = hx;
    const hw = head * 0.5;
    const bx = x3 - hx * head, by = y3 - hy * head;          // base centre
    const notchX = bx + hx * head * 0.26, notchY = by + hy * head * 0.26;
    this.$head.setAttribute('d',
      `M${x3.toFixed(1)},${y3.toFixed(1)} ` +
      `L${(bx + nx * hw).toFixed(1)},${(by + ny * hw).toFixed(1)} ` +
      `L${notchX.toFixed(1)},${notchY.toFixed(1)} ` +
      `L${(bx - nx * hw).toFixed(1)},${(by - ny * hw).toFixed(1)} Z`);

    if (live) {
      const s = 1 + (this._snapPulse || 0) * 0.42;
      this.$ret.setAttribute('transform',
        `translate(${snap.cx.toFixed(1)},${snap.cy.toFixed(1)}) scale(${s.toFixed(3)}) rotate(${(this.clock.t * 26 % 360).toFixed(1)})`);
    }
    this.$arrow.classList.toggle('is-snapped', live);
    this.$arrow.classList.toggle('is-invalid', !live);
  }

  // ── commit + play motion ─────────────────────────────────────────────────
  /** Public: play a card by uid (used by the keyboard path and by scenes). */
  playCard(uid, targetId) {
    const s = this.slots.find(x => x.card.uid === uid);
    if (s) this._commit(s, targetId);
    return this;
  }

  _commit(slot, targetId) {
    if (this.onPlay) {
      let res;
      try { res = this.onPlay({ uid: slot.card.uid, cardUid: slot.card.uid, card: slot.card, targetId, view: slot.view }); }
      catch (err) { console.error(err); }
      if (res === false) {
        slot.view.shake(10, 0.32);
        this.bus.emit('card:cancel', { uid: slot.card.uid });
        this._layout({ dur: this._d(0.26) });
        return;
      }
    }
    this.bus.emit('card:play', { cardUid: slot.card.uid, cardId: slot.card.def.id, targetId });
    this._animatePlay(slot, targetId);
  }

  /**
   * STS2 §1: "card flies to a play position, the effect resolves, then the
   * card arcs to the discard pile."  Three beats: strike, hold, throw.
   */
  async _animatePlay(slot) {
    const i = this.slots.indexOf(slot);
    if (i >= 0) this.slots.splice(i, 1);
    if (this.hoverSlot === slot) this._clearHover();
    // the card is leaving; the keyboard stays in the hand
    if (document.activeElement === slot.view.el) this.el.focus?.({ preventScroll: true });
    this.selIdx = Math.min(this.selIdx, this.slots.length - 1);
    this._layout();                                  // the rest re-fans at once
    this.flying.add(slot);

    const v = slot.view;
    v.setPreviewNumbers(null);
    // The card is out of the hand now: nothing about the hand's state may dim
    // it. (Paying for it drops energy to 0, which used to repaint the card as
    // `is-unplayable` a frame before it reached the play position — the hero
    // frame arrived as a flat grey ghost.)
    v.setState({ playable: true, hover: false, selected: false, dragging: false });
    v.hero(true);

    const a = { ...v.transform };
    const pX = this.w / 2, pY = this.h * TUNE.playY;
    const pS = TUNE.playScale * this.fit;

    if (this.reduceMotion) {
      v.hero(false); v.destroy(); this.flying.delete(slot); return;
    }

    // beat 1 — the strike. Scale overshoots past the play size and the card
    // rises on a short arc; easeOutBack gives it weight arriving.
    const over = 1 + TUNE.playOvershoot;
    await this.clock.ramp(TUNE.playTo, (k, raw) => {
      v.setTransform({
        x: lerp(a.x, pX, k),
        y: lerp(a.y, pY, k) - Math.sin(k * Math.PI) * 46,
        rot: lerp(a.rot, 0, k),
        scale: lerp(a.scale, pS * over, k),
        z: 900,
      });
    }, Clock.easeOutCubic);

    // beat 2 — contact. A hard white pop, then settle back from the overshoot.
    v.impact(1);
    await this.clock.ramp(TUNE.playHold, (k) => {
      v.setTransform({ scale: pS * lerp(over, 1, k) + Math.sin(k * Math.PI) * 0.06 * pS });
    }, Clock.easeOutBack);
    v.hero(false);

    const pile = this.piles.discard;
    const c1x = lerp(pX, pile.x, 0.35), c1y = pY - 120;
    const c2x = lerp(pX, pile.x, 0.82), c2y = lerp(pY, pile.y, 0.35);
    const spin = 200 + (hash(slot.card.uid) % 180);
    await this.clock.ramp(TUNE.playArc, (k) => {
      v.setTransform({
        x: bez(pX, c1x, c2x, pile.x, k),
        y: bez(pY, c1y, c2y, pile.y, k),
        rot: spin * k,
        scale: lerp(pS, 0.34, k),
      });
      v.el.style.opacity = String(1 - Math.max(0, k - 0.72) / 0.28);
    }, Clock.easeInCubic);

    v.destroy();
    this.flying.delete(slot);
  }

  /** Discard signature: a tumble, not a flight. */
  async _flyToPile(slot, o) {
    this.flying.add(slot);
    const v = slot.view;
    const a = { ...v.transform };
    const pile = o.pile;
    if (o.delay > 0) await this.clock.wait(o.delay);
    if (this.reduceMotion) { v.destroy(); this.flying.delete(slot); return; }
    const h = hash(slot.card.uid);
    const spin = (o.tumble ? 1 : 0) * ((h % 2 ? 1 : -1) * (220 + (h % 300)));
    const c1x = lerp(a.x, pile.x, 0.3), c1y = a.y - 90 - (h % 70);
    const c2x = lerp(a.x, pile.x, 0.75), c2y = lerp(a.y, pile.y, 0.4);
    await this.clock.ramp(o.dur, (k) => {
      v.setTransform({
        x: bez(a.x, c1x, c2x, pile.x, k),
        y: bez(a.y, c1y, c2y, pile.y, k),
        rot: a.rot + spin * k,
        scale: lerp(a.scale, 0.3, k),
        z: 800,
      });
      v.el.style.opacity = String(1 - Math.max(0, k - 0.7) / 0.3);
    }, Clock.easeInOut);
    v.destroy();
    this.flying.delete(slot);
  }

  // ── keyboard: full parity with the mouse ─────────────────────────────────
  _key(e) {
    if (this.locked) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = this.slots.length;

    if (e.key === 'Escape') {
      if (this.aim || this.selIdx >= 0) { e.preventDefault(); this._cancelAim(); this._selectIdx(-1); }
      return;
    }
    // Tab is TRAPPED inside the hand for as long as a decision is open: while
    // aiming it cycles targets, while a card is selected it walks the hand.
    // It only escapes to the page when nothing is selected.
    if (e.key === 'Tab') {
      if (this.aim) { e.preventDefault(); this._cycleTarget(e.shiftKey ? -1 : 1); return; }
      if (n && (this.selIdx >= 0 || this._focusInHand())) {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const from = this.selIdx < 0 ? (dir > 0 ? -1 : 0) : this.selIdx;
        this._selectIdx(((from + dir) % n + n) % n);
        return;
      }
      return;   // nothing open: Tab belongs to the page
    }
    if (!n) return;

    if (e.key >= '1' && e.key <= '9') {
      const i = +e.key - 1;
      if (i < n) {
        e.preventDefault();
        if (i === this.selIdx) this._confirm();
        else { this._cancelAim(); this._selectIdx(i); }
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (this.aim) { this._cycleTarget(dir); return; }
      const i = this.selIdx < 0 ? (dir > 0 ? 0 : n - 1) : clamp(this.selIdx + dir, 0, n - 1);
      this._selectIdx(i);
      return;
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (this.selIdx >= 0) this._confirm(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this._cancelAim(); this._selectIdx(-1); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this.selIdx < 0) this._selectIdx(Math.floor(n / 2));
      else this._confirm();
    }
  }

  /** Is the keyboard currently "inside" the hand? Drives the Tab trap. */
  _focusInHand() {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    return !!a && this.el.contains(a);
  }
  /** Keep the keyboard in the hand after a card leaves it. */
  _releaseFocusToHand() {
    if (this._focusInHand()) this.el.focus?.({ preventScroll: true });
  }

  _selectIdx(i) {
    this.selIdx = i;
    for (let k = 0; k < this.slots.length; k++) this.slots[k].view.setState({ selected: k === i });
    this._setHover(i >= 0 ? this.slots[i] : null);
    if (i >= 0) this.slots[i].view.el.focus?.({ preventScroll: true });
    else this._releaseFocusToHand();
  }

  _confirm() {
    const s = this.slots[this.selIdx];
    if (!s) return;
    if (!s.playable) { s.view.shake(8, 0.28); return; }
    if (this.aim) {
      const id = this.aim.snap ? this.aim.snap.id : undefined;
      this._cancelAim();
      this._commit(s, id);
      this._selectIdx(-1);
      return;
    }
    if (this._needsTarget(s.card.def)) {
      this._readTargets();
      if (!this.targets.length) { s.view.shake(8, 0.28); return; }
      this._goal(s, lerp(this.w / 2, s.cur.x, 0.3), this.parkY, 0, this.fit * TUNE.parkScale, 600, this._d(0.18));
      this.aim = { slot: s, x: 0, y: 0, snap: this.targets[0], valid: true, key: true };
      this._applyPreview(this.targets[0].id);
      this.bus.emit('card:target', { uid: s.card.uid, targetId: this.targets[0].id });
      this._showArrow(true);
      s.view.pulse('var(--flame-glow)', 0.3);
      return;
    }
    this._commit(s, undefined);
    this._selectIdx(-1);
  }

  _cycleTarget(dir) {
    if (!this.aim || !this.targets.length) return;
    const cur = this.targets.findIndex(t => this.aim.snap && t.id === this.aim.snap.id);
    const next = ((cur + dir) % this.targets.length + this.targets.length) % this.targets.length;
    this.aim.snap = this.targets[next];
    this._snapPulse = 1;
    this.clock.ramp(this._d(0.22), (v) => { this._snapPulse = 1 - v; });
    this.aim.slot.view.pulse('var(--flame-glow)', 0.3);
    this.bus.emit('card:target', { uid: this.aim.slot.card.uid, targetId: this.aim.snap.id });
    this._applyPreview(this.aim.snap.id);
  }

  _cancelAim() {
    if (!this.aim) return;
    const s = this.aim.slot;
    this.aim = null;
    this._showArrow(false);
    this._clearPreview(s);
    this.bus.emit('card:cancel', { uid: s.card.uid });
    this._layout({ dur: this._d(0.24) });
  }

  // ── teardown ─────────────────────────────────────────────────────────────
  destroy() {
    this._offFrame?.();
    this._offSettings?.();
    this._ro?.disconnect();
    window.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('focusin', this._onFocusIn);
    this.hit.removeEventListener('pointerdown', this._onDown);
    this.hit.removeEventListener('pointermove', this._onMove);
    this.hit.removeEventListener('pointerup', this._onUp);
    this.hit.removeEventListener('pointercancel', this._onUp);
    this.hit.removeEventListener('pointerleave', this._onLeave);
    for (const s of this.slots) s.view.destroy();
    for (const s of this.flying) s.view.destroy();
    this.slots.length = 0; this.flying.clear();
    this.el.remove();
  }
}

export default Hand;
