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
import { CardView } from './card.js';

/** Every tuned number in one place. Milliseconds are seconds here. */
export const TUNE = {
  // hover — the single most-felt interaction. STS2 §1: "under 120ms".
  hoverIn: 0.105, hoverOut: 0.090,
  hoverLift: 46, hoverScale: 1.19, hoverNudge: 30,
  // fan
  refan: 0.30, refanStagger: 0.010,
  rotPerCard: 3.1, maxFanDeg: 15,
  stepRatio: 0.82, spreadRatio: 0.80, arcDip: 5.4, arcDipMax: 62,
  unplayableDrop: 24, unplayableScale: 0.965,
  bottomPad: 20,
  // draw / discard / exhaust — three different signatures
  drawIn: 0.34, drawStagger: 0.055, drawFlick: 18,
  discard: 0.40, discardStagger: 0.035,
  exhaust: 0.62, exhaustRise: 96,
  // play
  playTo: 0.26, playHold: 0.17, playArc: 0.44, playScale: 1.22, playY: 0.66,
  // drag
  dragFollow: 0.075, dragScale: 1.10, dragTiltMax: 14, dragTiltGain: 0.85,
  parkScale: 1.06, snapPad: 26,
  thresholdFrac: 0.54,
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
    this.baseY = this.h - TUNE.bottomPad;
    this.thresholdY = this.h * TUNE.thresholdFrac;
    this.parkY = this.h - 150;   // held card floats above the hand, enemies stay visible
    this.piles = this.piles || {};
    this.piles.draw = this.piles.draw || { x: 96, y: this.h + 40 };
    this.piles.discard = this.piles.discard || { x: this.w - 96, y: this.h + 40 };
    this.$thresh.style.top = this.thresholdY + 'px';
    this.hit.style.top = Math.max(0, this.h - 460) + 'px';
    this.$arrow.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
  }

  /** Where cards fly to/from. Combat scene should call this with real pile positions. */
  setPiles(p) { this.piles = Object.assign(this.piles || {}, p); return this; }

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
    const start = entering
      ? { x: this.piles.draw.x, y: this.piles.draw.y, rot: -26, scale: 0.52, z: 0 }
      : { x: this.w / 2, y: this.baseY + 60, rot: 0, scale: 0.9, z: 0 };
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
    for (const dead of keep.values()) { dead.view.destroy(); }
    this.slots = out;
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
        x: c.x, y: c.y - TUNE.exhaustRise * p,
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
    for (const s of this.slots) {
      const ok = !!this.playableFn(s.card, this.energy);
      if (s.playable !== ok) { s.playable = ok; s.view.setState({ playable: ok }); }
    }
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
  /** Fan geometry for n cards. Shared by layout and hit-testing so they agree. */
  _fan(n) {
    const T = TUNE;
    const c = (n - 1) / 2;
    const maxSpread = Math.min(this.w * T.spreadRatio, 1240);
    const f = this._fanTmp || (this._fanTmp = {});
    f.c = c;
    f.step = Math.min(224 * T.stepRatio, n > 1 ? maxSpread / (n - 1) : 0);
    f.rotPer = n <= 1 ? 0 : Math.min(T.rotPerCard, T.maxFanDeg / c);
    f.dip = Math.min(T.arcDipMax, 6 + n * T.arcDip);
    // Anchor so the LOWEST card in the arc sits on the bottom pad: the fan
    // rises as it widens instead of sliding off the bottom of the screen.
    f.baseY = this.h - TUNE.bottomPad - f.dip;
    f.cx = this.w / 2;
    return f;
  }

  _layout(o = {}) {
    const n = this.slots.length;
    if (!n) return;
    const T = TUNE;
    const F = this._fan(n);
    const c = F.c, step = F.step, rotPer = F.rotPer, dip = F.dip, cx = F.cx;
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
      let scale = 1;
      let z = 20 + i;

      if (!s.playable) { y += T.unplayableDrop; scale = T.unplayableScale; }

      if (hoverIdx >= 0 && i !== hoverIdx) {
        const dd = i - hoverIdx;
        const fall = Math.abs(dd) === 1 ? 1 : Math.abs(dd) === 2 ? 0.42 : Math.abs(dd) === 3 ? 0.16 : 0;
        x += Math.sign(dd) * T.hoverNudge * fall;
        y += 4 * fall;
      }
      if (i === hoverIdx) {
        y = F.baseY - T.hoverLift;
        rot = 0; scale = T.hoverScale; z = 500;
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
      const hw = 112 * geo.scale, hh = 312 * geo.scale;
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
    g.y = F.baseY + Math.pow(norm, 1.85) * F.dip + (this.slots[i].playable === false ? TUNE.unplayableDrop : 0);
    g.rot = d * F.rotPer; g.scale = 1;
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

    if (d.needsTarget && above) {
      // Card parks; the arrow does the aiming.
      const parkX = lerp(this.w / 2, p.x, 0.18);
      this._goal(s, parkX, this.parkY, 0, TUNE.parkScale, 600, this._d(0.16), 0, Clock.easeOutCubic);
      this._updateSnap(p.x, p.y);
      this.aim = { slot: s, x: p.x, y: p.y, snap: d.snap, valid: !!d.snap };
      this._showArrow(true);
    } else {
      // Card follows the cursor with lag + tilt toward motion.
      this._goal(s, p.x, p.y + 312 * TUNE.dragScale * 0.5, d.tilt, TUNE.dragScale, 600,
        this._d(TUNE.dragFollow), 0, Clock.easeOutCubic);
      if (d.needsTarget) { this._showArrow(false); this.aim = null; d.snap = null; this._clearPreview(s); }
      else {
        this.$thresh.classList.toggle('is-armed', above);
        if (above !== d.wasAbove) { d.wasAbove = above; if (above) s.view.pulse('var(--flame-glow)', 0.3); }
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
    this.$thresh.classList.remove('is-on', 'is-armed');
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

  _drawArrow() {
    const a = this.aim;
    if (!a) return;
    const v = a.slot.view.transform;
    const x0 = v.x, y0 = v.y - 312 * v.scale * 0.72;
    const snap = a.snap;
    const x3 = snap ? snap.cx : a.x;
    const y3 = snap ? snap.cy : a.y;

    const dist = Math.hypot(x3 - x0, y3 - y0);
    const bow = clamp(dist * 0.42, 60, 230);
    const x1 = x0, y1 = y0 - bow;
    const x2 = lerp(x0, x3, 0.55), y2 = y3 - bow * 0.55;

    const N = 22;
    const L = [], Rr = [];
    let ex = 0, ey = 0, etx = 0, ety = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const px = bez(x0, x1, x2, x3, t);
      const py = bez(y0, y1, y2, y3, t);
      const t2 = Math.min(1, t + 0.01);
      const tx = bez(x0, x1, x2, x3, t2) - px;
      const ty = bez(y0, y1, y2, y3, t2) - py;
      const m = Math.hypot(tx, ty) || 1;
      const nx = -ty / m, ny = tx / m;
      const wdt = lerp(4, 17, Math.pow(t, 0.85)) * (1 - Math.pow(t, 8) * 0.9);
      L.push((px + nx * wdt).toFixed(1) + ',' + (py + ny * wdt).toFixed(1));
      Rr.push((px - nx * wdt).toFixed(1) + ',' + (py - ny * wdt).toFixed(1));
      if (i === N) { ex = px; ey = py; etx = tx / m; ety = ty / m; }
    }
    Rr.reverse();
    const d = 'M' + L.join(' L') + ' L' + Rr.join(' L') + ' Z';
    this.$body.setAttribute('d', d);
    this.$glow.setAttribute('d',
      `M${x0.toFixed(1)},${y0.toFixed(1)} C${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}`);

    // head
    const hs = 30;
    const hx = ex + etx * hs * 0.55, hy = ey + ety * hs * 0.55;
    const px1 = ex - etx * hs * 0.5 - ety * hs * 0.62, py1 = ey - ety * hs * 0.5 + etx * hs * 0.62;
    const px2 = ex - etx * hs * 0.5 + ety * hs * 0.62, py2 = ey - ety * hs * 0.5 - etx * hs * 0.62;
    this.$head.setAttribute('d',
      `M${hx.toFixed(1)},${hy.toFixed(1)} L${px1.toFixed(1)},${py1.toFixed(1)} ` +
      `L${(ex - etx * hs * 0.16).toFixed(1)},${(ey - ety * hs * 0.16).toFixed(1)} ` +
      `L${px2.toFixed(1)},${py2.toFixed(1)} Z`);

    if (snap) {
      const s = 1 + (this._snapPulse || 0) * 0.42;
      this.$ret.setAttribute('transform',
        `translate(${snap.cx.toFixed(1)},${snap.cy.toFixed(1)}) scale(${s.toFixed(3)}) rotate(${(this.clock.t * 26 % 360).toFixed(1)})`);
    }
    this.$arrow.classList.toggle('is-snapped', !!snap);
    this.$arrow.classList.toggle('is-invalid', !snap);
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
    this.selIdx = Math.min(this.selIdx, this.slots.length - 1);
    this._layout();                                  // the rest re-fans at once
    this.flying.add(slot);

    const v = slot.view;
    v.setPreviewNumbers(null);
    const a = { ...v.transform };
    const pX = this.w / 2, pY = this.h * TUNE.playY, pS = TUNE.playScale;

    if (this.reduceMotion) {
      v.destroy(); this.flying.delete(slot); return;
    }

    await this.clock.ramp(TUNE.playTo, (k) => {
      v.setTransform({
        x: lerp(a.x, pX, k),
        y: lerp(a.y, pY, k) - Math.sin(k * Math.PI) * 46,
        rot: lerp(a.rot, 0, k),
        scale: lerp(a.scale, pS, k),
        z: 900,
      });
    }, Clock.easeOutCubic);

    v.flash(0.5, 0.2);
    await this.clock.ramp(TUNE.playHold, (k) => {
      v.setTransform({ scale: pS + Math.sin(k * Math.PI) * 0.055 });
    });

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
    if (e.key === 'Tab' && this.aim) {
      e.preventDefault();
      this._cycleTarget(e.shiftKey ? -1 : 1);
      return;
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

  _selectIdx(i) {
    this.selIdx = i;
    for (let k = 0; k < this.slots.length; k++) this.slots[k].view.setState({ selected: k === i });
    this._setHover(i >= 0 ? this.slots[i] : null);
    if (i >= 0) this.slots[i].view.el.focus?.({ preventScroll: true });
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
      this._goal(s, lerp(this.w / 2, s.cur.x, 0.3), this.parkY, 0, TUNE.parkScale, 600, this._d(0.18));
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
