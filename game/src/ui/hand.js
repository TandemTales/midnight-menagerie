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
 *   await hand.add(card);  // moved in from the discard pile — see Hand#add
 *   hand.exhaust(uid);     hand.setEnergy(3); hand.lock(); hand.unlock();
 *
 * Pointer model: the HOST element the hand is mounted into is made inert
 * (`.mm-hand-host`), the cards are ordinary hit targets, and `.mm-hand__hit`
 * is a backstop sized to the fan that catches the gaps between them. Which
 * card is under the cursor is still decided in JS against the BASE fan
 * geometry (`_hitTest`), which is what makes hover unflickerable.
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
  /* ── hover: the single most-felt interaction ────────────────────────────
     STS2 §1: "raises the card ~40–60px, scales it ~1.15–1.25x … in under
     120ms … snappy, not floaty."

     TIMING. Round 3 measured 82 ms *from the pointermove event to settled* and
     called it done. A reviewer measured the thing a player actually feels —
     from the mouse moving — and got 168 ms, of which 67 ms passed before the
     first pixel moved. Three changes close that:
       1. `_setHover` now applies the first `kick` of the tween SYNCHRONOUSLY,
          inside the event handler, instead of waiting for the next frame.
       2. the `card:hover` bus event is emitted AFTER the motion is committed,
          so no subscriber (tooltip, preview, keyword panel) can sit between
          the pointer moving and the card moving.
       3. the tween itself is shorter — with (1) landing 1/60 s of easeOutCubic
          in the same task, `hoverIn` is the budget for the remaining ~78 %.

     GEOMETRY. `hoverLift` is the rise of the card's own anchor. The card is
     anchored at its BOTTOM CENTRE, so a bottom-anchored 1.19x also pushed the
     top edge up by the full 0.19·height — 59 px on top of the 46 px lift, and
     the reviewer measured the resulting 116 px against StS2's 40–60. The
     growth is now centred on the card (`grow`, applied in `_layout`), so the
     measured rise is `hoverLift + height·(scale-1)/2` ≈ 50 px at 1.18x. */
  hoverIn: 0.078, hoverOut: 0.070,
  hoverLift: 26, hoverScale: 1.18, hoverNudge: 30,
  kick: 1 / 60,          // sub-frame advance applied in the event handler
  // fan
  refan: 0.30, refanStagger: 0.010,
  rotPerCard: 3.1, maxFanDeg: 15,
  stepRatio: 0.82, arcDip: 5.4, arcDipMax: 62,
  unplayableDrop: 24, unplayableScale: 0.965,
  bottomPad: 20,

  /* ── spread: the hand must not eat its own rules text ───────────────────
     STS2 §1: "With few cards the arc flattens; with many, cards overlap and
     the arc tightens."  Round 3 spaced every hand at a flat `stepRatio` of a
     card width, so a five-card hand on a 1920 screen overlapped 44 px, hid a
     slice of every neighbour's rules text, and left 1136 px of empty table.

     `textClearFrac` and `textTiltFrac` come straight out of the card anatomy
     in card.css: the rules box spans 12u..212u of the 224u grid and sits
     15u..126u above the card's bottom edge, and a card rotates about that
     bottom edge — so a tilt of θ slides the far corner of the text box
     sideways 111u·sinθ further than it slides the neighbour's edge. The step
     that clears the text is therefore
         cw · (textClearFrac·cosθ + textTiltFrac·|sinθ|)
     `spreadAir` is the extra breathing room taken when the band allows it, so
     a small hand reads as separate cards rather than as cards that just touch.
     Everything here is a TARGET: the safe-band cap still wins, which is why
     n >= 8 is byte-identical to round 3. */
  /* Hands up to this size open up for text clearance. SIX, not seven, and the
     reason is the frame after: at seven cards with the largest card width the
     band cannot hold both the clearance and the bend, so the solver below
     would flatten the fan to ±0.5° — and then an eighth card, which cannot be
     cleared at any angle, would snap it straight back to ±10.9°. A fan that
     collapses when you draw and springs open when you draw again is worse
     than either state. At six the solver never has to fire on any viewport
     this game supports, so every rotation from n=1 to n=12 stays monotone and
     identical to round 3, and seven still gains the widest step the band
     allows (1920: 184 → 202 px). "Below about 7 cards" — the review's words. */
  spreadMax: 6,
  textClearFrac: 214 / 224,
  textTiltFrac: 111 / 224,
  spreadAir: 0.10,        // extra gap, in card widths, when there is room
  flatFrom: 4,            // rotation reaches full strength at n = flatFrom + 1

  // ── fit: how the hand stays on screen ──────────────────────────────────
  // StS shrinks the cards as the hand grows. A fixed 224x312 box never fit:
  // at n=12/1600x900 it overlapped 171px of 224 (76%) and hung 32px below the
  // viewport. These three numbers are the contract:
  maxCardHFrac: 0.30,   // a card is never taller than 30% of the viewport
  maxOverlap: 0.45,     // a card never hides more than 45% of its neighbour
  sideMarginFrac: 0.10, // free gutter each side (energy orb, draw/discard piles)
  sideMarginMin: 150,
  minFit: 0.625,        // never shrink past this fraction of the CSS card size
  fitSteps: 8,          // fit is quantised to 1/8ths — see Hand#_fit

  // draw / add / discard / exhaust — four different signatures
  drawIn: 0.34, drawStagger: 0.055, drawFlick: 18,
  // `add` (a card moved INTO hand from the discard pile — Hand#add). It must
  // not read as a draw, so every knob differs: the other pile, the other spin
  // direction, a slower flight, and — the part you actually see — a real ARC.
  // A draw riffles straight up out of the deck; an add is LOBBED back over the
  // table, so its y is non-monotonic where a draw's is monotonic.
  addIn: 0.46, addStagger: 0.075, addArc: 150, addSpin: 34, addFromScale: 0.30,
  discard: 0.40, discardStagger: 0.035,
  exhaust: 0.38, exhaustRise: 96,
  // play
  playTo: 0.26, playHold: 0.20, playArc: 0.44, playScale: 1.30, playY: 0.84,   /* was 0.62: the played card covered 58% of the creature it was hitting */
  playOvershoot: 0.11,
  // drag
  dragFollow: 0.075, dragScale: 1.10, dragTiltMax: 14, dragTiltGain: 0.85,
  parkScale: 1.06, snapPad: 26,
  // ── while aiming AT something ──────────────────────────────────────────
  // The held card used to sit full-size and fully opaque right on top of the
  // enemy it was aimed at, hiding its HP bar, its Guard badge and the damage
  // preview — you could not see the thing you were about to hit. Once a target
  // is snapped the card gets out of the way: smaller, translucent, and slid
  // clear of the target's box if it would still overlap it.
  /* …but it must still be the card you are HOLDING. Parked at `parkY` it sat
     with its top edge level with its neighbours' and, at 42 % opacity, read as
     "I dropped it" — the reviewer's words — with two fan cards visible through
     it. It now floats `aimLift` card-heights clear of the fan's base line at
     `aimZ`, above every card in the hand, and it only goes translucent when it
     would genuinely cover the target (`_aimPark` reports that). */
  parkScaleAimed: 0.86, aimClear: 22,
  aimLift: 0.40,        // card-heights the held card floats above the fan line
                        // (was 0.55: at 1600x900 the held card still clipped 14% of the
                        //  target's Courage bar. Held high enough to read as held, low
                        //  enough to leave the thing you are aiming at visible.)
  aimMinY: 0.42,        // never higher than this fraction of the host
  aimZ: 700,            // above hover (500) and every fan card (20..~40)
  // fan hit backstop: slack around the fan's own bounding box, px
  hitPad: 22,
  // ── the commit threshold ───────────────────────────────────────────────
  // The line is ANCHORED TO THE FAN, not to the host: it sits `thresholdLift`
  // card-heights above the top edge of the resting fan, so the gesture is the
  // same reach at every viewport and every hand size. `thresholdFrac` is only
  // the fallback for a hand that has not laid out yet, and the clamp keeps the
  // band off the enemies at extreme aspect ratios.
  thresholdFrac: 0.54,
  thresholdLift: 0.66,   // card-heights between the fan's top edge and the line
  thresholdBand: 0.40,   // band depth, in card-heights, ABOVE the line
  thresholdMinY: 0.20,   // never higher than this fraction of the host
  // tap-to-play: pointerdown and pointerup in the same spot, quickly
  tapTime: 0.42, tapSlop: 12,
  // arrow
  arrowHead: 36,        // solid triangle, px
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
    // `.is-band` turns the hairline into the soft commit field. Its styling
    // used to be injected from here as a <style> tag because hand.css was
    // another agent's file; it now lives in ui/hand.css beside the hairline.
    this.$thresh.classList.add('is-band');
    if (this.reduceMotion) el.classList.add('mm-reduce');

    if (root) { root.appendChild(el); this.mount(root); }
  }

  /**
   * Mount into `parent` and take responsibility for its hit surface.
   *
   * A Hand is always mounted into a full-bleed container so it can fly cards
   * to the pile markers in the screen corners. That container defaults to
   * `pointer-events:auto`, which made an empty div at z-index 200 hit-test
   * over the whole board and eat every mouse event aimed at an enemy — no
   * intent, enemy or enemy-status tooltip was reachable at all. `.mm-hand-host`
   * (styled in ui/hand.css) makes the host inert; the cards and the fan-sized
   * `.mm-hand__hit` backstop are the only things that take pointer events back.
   * `destroy()` removes the class again.
   */
  mount(parent) {
    if (this.el.parentNode !== parent) parent.appendChild(this.el);
    this._host = parent;
    parent.classList.add('mm-hand-host');
    this._measure();
    this._ro = new ResizeObserver(() => { this._measure(); this._layout(); });
    this._ro.observe(this.el);
    return this;
  }

  _measure() {
    this.w = this.el.clientWidth || this.el.parentNode?.clientWidth || 1600;
    this.h = this.el.clientHeight || this.el.parentNode?.clientHeight || 900;
    this._rect = null;               // pointer coords are relative to this box

    // The CSS card size is responsive (`--mm-card-w` in card.css), so read it
    // rather than assuming 224x312. The probe is built at CARD_SS; divide it
    // back out to get the size a card occupies on screen at transform scale 1.
    const pw = this._probe?.offsetWidth || 224 * CARD_SS;
    const ph = this._probe?.offsetHeight || 312 * CARD_SS;
    this.cw = pw / CARD_SS;
    this.chh = ph / CARD_SS;

    this.baseY = this.h - TUNE.bottomPad;
    this.thresholdY = this.h * TUNE.thresholdFrac;   // replaced by _syncThreshold
    // held card floats above the hand; enemies stay visible above it
    this.parkY = Math.round(this.h - Math.max(96, this.chh * 0.42));
    this.piles = this.piles || {};
    this.piles.draw = this.piles.draw || { x: 96, y: this.h + 40 };
    this.piles.discard = this.piles.discard || { x: this.w - 96, y: this.h + 40 };
    this._syncThreshold();
    this._syncHitBox();
    this.$arrow.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
  }

  /**
   * Size `.mm-hand__hit` to the FAN — not to the viewport, and not to a
   * fraction of it.
   *
   * The element is a BACKSTOP that sits *behind* the cards (z-index 1 against
   * their 20..900): the cards themselves are the hit targets now, and this
   * only has to catch the places inside the fan where there is no card under
   * the cursor — the gaps between two rotated cards, the strip below them,
   * and the hole a hovered card leaves behind when it lifts. That last one is
   * the anti-oscillation case and it is why the box is measured from the
   * *base* (unlifted) fan: the lifted card is its own hit target up there, the
   * hole it left is inside this box, and `_hitTest` answers "still card i" for
   * both. Zero flips, and not one pixel of the enemy field is covered by
   * anything except an actual card.
   *
   * @param {object} [F] fan geometry, when the caller already computed it.
   */
  _syncHitBox(F) {
    const n = this.slots.length;
    if (!n) {                       // no cards: no surface at all
      if (this._hitBox !== 'off') { this._hitBox = 'off'; this.hit.style.display = 'none'; }
      return;
    }
    const fan = F || this._fan(n);
    const pad = TUNE.hitPad;
    const half = (n > 1 ? fan.c * fan.step : 0) + fan.overhang + pad;
    const left = Math.max(0, Math.round(fan.cx - half));
    const right = Math.min(this.w, Math.round(fan.cx + half));
    // + the unplayable drop, which pushes individual cards below `baseY`.
    const top = Math.max(0, Math.round(fan.baseY - fan.ch - pad));
    const key = left + ':' + right + ':' + top;
    if (this._hitBox === key) return;      // `_layout` runs on every hover
    this._hitBox = key;
    const s = this.hit.style;
    s.display = '';
    s.left = left + 'px';
    s.width = (right - left) + 'px';
    s.top = top + 'px';
    s.bottom = '0px';
  }

  /**
   * Place the commit band. ANCHORED TO THE FAN: the line sits
   * `thresholdLift` card-heights above the top edge of the resting fan, so
   * "lift it clear of your hand" is the same gesture whatever the viewport and
   * however many cards are in it. Anchored to the host (`h * 0.54`) it drifted
   * — at a short viewport with a big hand the line fell inside the fan itself.
   *
   * The band is drawn ABOVE the line and its BOTTOM EDGE is the line, so what
   * the player sees is exactly what `_pointerUp` measures.
   *
   * @param {object} [F] the fan geometry, when the caller already has it.
   */
  _syncThreshold(F) {
    const ch = F ? F.ch : this.chh * (this.fit || 1);
    const baseY = F ? F.baseY : this.baseY;
    const y = baseY - ch * (1 + TUNE.thresholdLift);
    this.thresholdY = Math.round(clamp(y, this.h * TUNE.thresholdMinY, this.h - 40));
    const band = Math.round(clamp(ch * TUNE.thresholdBand, 44, this.h * 0.26));
    // `_layout` runs on every hover; only touch the DOM when it actually moved.
    if (this._threshTop === this.thresholdY && this._threshBand === band) return;
    this._threshTop = this.thresholdY;
    this._threshBand = band;
    this.$thresh.style.top = (this.thresholdY - band) + 'px';
    this.$thresh.style.height = band + 'px';
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
    // QUANTISED, and this matters more than it looks. The compositor rasters a
    // card at its current transform scale; a scale it has not seen before is a
    // cold raster of every card in the hand. A continuous fit meant literally
    // every hand size produced a new raster scale — drawing 5 into 12 cost one
    // 290 ms frame purely re-rastering at a scale that had never been used.
    // Snapping to eighths leaves four possible scales (0.625/0.75/0.875/1),
    // all four of which `warmRaster()` rehearses on scene entry. Measured:
    // 45.9 fps -> 60.3 fps on the same action.
    s = Math.floor(clamp(s, TUNE.minFit, 1) * TUNE.fitSteps) / TUNE.fitSteps;
    return clamp(s, TUNE.minFit, 1);
  }

  /** Every fit scale this hand can produce at the current viewport. */
  _fitScales() {
    const out = [];
    for (let q = TUNE.fitSteps; q >= Math.round(TUNE.minFit * TUNE.fitSteps); q--) out.push(q / TUNE.fitSteps);
    return out;
  }

  /**
   * How hard the arc is allowed to bend at this hand size. STS2 §1: "With few
   * cards the arc flattens." Round 3 used a constant 3.1°/card, so a hand of
   * three sat at ±3.1° with a 22 px dip and read as a tight little clump
   * rather than a flat spread. Full strength from n = flatFrom + 1 (5) up, so
   * every rotation the critic has measured at n >= 5 is unchanged.
   */
  _flat(n) { return n <= 1 ? 0 : Math.min(1, (n - 1) / TUNE.flatFrom); }

  /** Fan half-angle in radians for n cards. */
  _fanTh(n) {
    if (n <= 1) return 0;
    const c = (n - 1) / 2;
    return Math.min(TUNE.rotPerCard * this._flat(n) * c, TUNE.maxFanDeg) * Math.PI / 180;
  }

  /** Horizontal reach of a card tilted `th` past its anchor. */
  _overhangAt(th, cw, ch) { return cw * Math.cos(th) / 2 + ch * Math.sin(th); }

  /** Horizontal reach of the outermost card past its anchor, at scale `s`. */
  _overhang(n, s) {
    return this._overhangAt(this._fanTh(n), this.cw * s, this.chh * s);
  }

  /**
   * The anchor-to-anchor step at which card i+1 stops covering card i's RULES
   * TEXT. Derived from the card anatomy, not tuned by eye — see the
   * `textClearFrac` / `textTiltFrac` note in TUNE.
   */
  _clearStep(cw, th) {
    return cw * (TUNE.textClearFrac * Math.cos(th) + TUNE.textTiltFrac * Math.abs(Math.sin(th)));
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
   * This paints `count` throwaway cards for a few frames one viewport below
   * the fold — inside the compositor's raster interest rect, so the work is
   * genuinely done, but never on screen — covering the hover, unplayable,
   * selected and hero variants too, then discards them.
   *
   * @param {object[]} defs   CardDefs to rehearse with (the deck)
   * @param {number} count    how many cards to paint at once
   * @returns {Promise<number>}
   */
  warmRaster(defs, count = 8, o = {}) {
    const list = (defs || []).filter(Boolean);
    if (!list.length || typeof document === 'undefined') return Promise.resolve(0);
    // Prefer to rehearse with the real webfonts loaded, but never wait long
    // for them — a slow font CDN would push the rehearsal past the first draw,
    // which is the one thing it exists to cover.
    const fonts = document.fonts && document.fonts.status !== 'loaded'
      ? Promise.race([document.fonts.ready.catch(() => {}),
                      new Promise((r) => setTimeout(r, 600))])
      : Promise.resolve();
    // And wait for the page to settle. Rehearsing 200 ms into a cold load
    // warms nothing measurable (213 ms hitch); the compositor deprioritises
    // off-screen tiles while it is still busy. At ~600 ms it is a clean 18 ms.
    const settled = Promise.all([
      new Promise((r) => setTimeout(r, 260)),
      new Promise((r) => (typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => r(), { timeout: 400 })
        : setTimeout(r, 260))),
    ]);
    // ONE WAVE PER FIT SCALE. Raster caches are per-scale, so rehearsing at a
    // single size warms only the hand sizes that happen to use that size.
    const scales = o.scales || this._fitScales();
    const run = (i) => this._warmRasterNow(list, count, scales[i]).then((worst) => {
      this._warmWorst = Math.max(this._warmWorst || 0, worst);
      if (i + 1 >= scales.length) return scales.length * count;
      return new Promise((r) => setTimeout(r, 60)).then(() => run(i + 1));
    });
    /**
     * `warming` is the signal for "the rehearsal is still going".
     *
     * There is a 60 ms gap between waves where the `.mm-hand__warm` host does
     * not exist, so its ABSENCE does not mean the rehearsal has finished —
     * anything watching the DOM for it sees the gap, decides the coast is
     * clear, and then counts the next wave's throwaway cards along with the
     * real hand. That made `tests/combat-scene/seam.py` fail two runs in three
     * with a consistent 11 cards where 5 were expected.
     */
    this.warming = true;
    return fonts.then(() => settled).then(() => run(0))
      .finally(() => { this.warming = false; });
  }

  /** Paints one throwaway wave. Resolves with its worst frame time in ms. */
  _warmRasterNow(list, count, scale) {
    this._measure();          // the probe has laid out by now; use real metrics
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
      // Bottom edge kept close under the fold so every card lands inside the
      // compositor's raster interest rect (~viewport + 300px).
      v.setTransform({
        x: (i % cols) * this.cw + this.cw * 0.6,
        y: Math.min(this.chh, 200) + (Math.floor(i / cols) % 2) * 10,
        rot: (i % 5) - 2, scale: scale || 1, z: i,
      });
      host.appendChild(v.el);
      views.push(v);
    }
    if (views[0]) views[0].setState({ hover: true });
    if (views[1]) views[1].setState({ playable: false });
    if (views[2]) views[2].hero(true);
    if (views[3]) views[3].setState({ selected: true });
    return new Promise((res) => {
      let f = 0, worst = 0, prev = performance.now();
      const tick = () => {
        const now = performance.now();
        if (f > 0) worst = Math.max(worst, now - prev);
        prev = now;
        if (++f < 6) { requestAnimationFrame(tick); return; }
        for (const v of views) v.destroy();
        host.remove();
        res(worst);
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

  /**
   * @param {object} card            normalised card
   * @param {object} [o]
   * @param {'draw'|'add'|false} [o.entering]  which entry signature to play
   * @param {number} [o.delay]        seconds before the entry tween starts
   * @param {number} [o.attachFrame]  frames to wait before DOM insertion
   */
  _makeSlot(card, o = {}) {
    const entering = o.entering || false;
    const delay = o.delay || 0;
    const attachFrame = o.attachFrame || 0;
    const view = new CardView(card.def, {
      uid: card.uid, upgraded: card.upgraded, cost: card.cost,
      largeText: this.largeText, reduceMotion: this.reduceMotion, clock: this.clock,
    });
    // Attaching five fresh cards in ONE frame makes the compositor rasterise
    // five new layers in that frame. The cards are staggered visually anyway
    // (drawStagger), so stagger the DOM insertion too and the raster cost is
    // spread over five frames instead of stalling one.
    if (attachFrame > 0 && !this.reduceMotion) {
      let f = 0;
      const put = () => {
        if (view._dead) return;
        if (++f >= attachFrame) { this.layer.appendChild(view.el); return; }
        requestAnimationFrame(put);
      };
      requestAnimationFrame(put);
    } else {
      this.layer.appendChild(view.el);
    }
    const f = this.fit || 1;
    // Three distinct entry signatures. `_layout` reads enterDur/enterEase/
    // enterArc off the slot, so the difference is data, not branches.
    const T = TUNE;
    const start = entering === 'draw'
      ? { x: this.piles.draw.x, y: this.piles.draw.y, rot: -26, scale: 0.52 * f, z: 0 }
      : entering === 'add'
        ? { x: this.piles.discard.x, y: this.piles.discard.y, rot: T.addSpin, scale: T.addFromScale * f, z: 0 }
        : { x: this.w / 2, y: this.baseY + 60, rot: 0, scale: 0.9 * f, z: 0 };
    const slot = {
      card, view,
      cur: { ...start }, from: { ...start }, to: { ...start },
      e: 1, dur: 1, delay: 0, ease: Clock.easeOutCubic, flick: 0, arc: 0,
      entering: !!entering, enterDelay: delay || 0,
      enterDur: entering === 'add' ? T.addIn : T.drawIn,
      // A draw snaps into the fan with a little overshoot; an add settles out
      // of a lob, where an overshoot would read as a bounce off the table.
      enterEase: entering === 'add' ? Clock.easeOutCubic : Clock.easeOutBack,
      enterArc: entering === 'add' && !this.reduceMotion ? T.addArc : 0,
    };
    view.setTransform(slot.cur);
    // In transit from a pile, so not a hit target yet: an arriving card crosses
    // the board (an `add` lobs 150px above the fan, right through the enemy
    // row) and must not steal a tooltip on the way in. `_tick` clears it the
    // frame the card lands in the fan.
    if (entering) { slot.airborne = true; view.el.classList.add('is-flying'); }
    if (entering === 'add') {
      // Distinct arrival read: a cold spectral ring, not the draw's warm swell.
      view.materialize(this._d(0.30));
      view.pulse('var(--spectre-300)', this._d(0.5));
    } else if (entering) {
      view.materialize(this._d(0.24));
    }
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
      else out.push(this._makeSlot(c));
    }
    for (const dead of keep.values()) {
      if (document.activeElement === dead.view.el) {
        this._quietFocus = true;
        this.el.focus?.({ preventScroll: true });
        this._quietFocus = false;
      }
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
    const list = (Array.isArray(cards) ? cards : [cards]).filter(Boolean).map(c => this._norm(c));
    list.forEach((c, i) => {
      const s = this._makeSlot(c, {
        entering: 'draw', delay: i * this._d(TUNE.drawStagger), attachFrame: i * 2,
      });
      s.flick = TUNE.drawFlick * (i % 2 ? 1 : -1);
      this.slots.push(s);
    });
    this._refreshPlayable(true);
    return this;
  }

  /**
   * PUBLIC. A card is MOVED INTO the hand from somewhere that is not the draw
   * pile — `card:move` with `to:'hand'`, e.g. a Trick fished back out of the
   * discard, a card conjured by a relic, a returning Echo.
   *
   *     await hand.add(card)                       // one card
   *     await hand.add([cardA, cardB])             // several, staggered
   *     await hand.add(card, { from: 'draw' })     // override the origin pile
   *
   * @param {object|object[]} cards  `{ uid?, def, upgraded?, cost? }`, or a bare
   *   CardDef, or an array of either. `uid` is generated if omitted; pass the
   *   engine's uid if you want `discard()`/`exhaust()`/`playCard()` to find it.
   * @param {object} [o]
   * @param {'discard'|'draw'} [o.from='discard']  which pile it flies out of.
   * @returns {Promise<Hand>} resolves when the arrival has settled into the fan.
   *
   * MOTION SIGNATURE — deliberately not a draw (STS2-REFERENCE §1: "Draw/
   * discard/exhaust each have a *different* motion signature"). A draw riffles
   * straight up out of the deck in the bottom-LEFT corner, spinning
   * anticlockwise, in 340 ms, with a little easeOutBack snap. An add is LOBBED
   * back over the table from the discard pile in the bottom-RIGHT corner:
   * clockwise spin, 460 ms, a 150px arc so its path rises above the fan and
   * comes down into the gap, no overshoot, and a cold spectral ring pulse on
   * arrival instead of the draw's warm swell. The two are distinguishable from
   * a single frame of a motion strip, let alone in play.
   *
   * The rest of the fan opens its gap immediately — the arriving card is a
   * real slot from the first frame, so `count`, `cards()` and playability are
   * correct before the animation finishes.
   */
  async add(cards, o = {}) {
    const list = (Array.isArray(cards) ? cards : [cards]).filter(Boolean).map(c => this._norm(c));
    if (!list.length) return this;
    const from = o.from === 'draw' ? 'draw' : 'discard';
    const stagger = this._d(TUNE.addStagger);
    const fresh = list.map((c, i) => {
      const s = this._makeSlot(c, {
        entering: from === 'draw' ? 'draw' : 'add', delay: i * stagger, attachFrame: i * 2,
      });
      this.slots.push(s);
      return s;
    });
    this._refreshPlayable(true);            // lays the fan out, gap included
    const last = fresh[fresh.length - 1];
    await this.clock.wait(this._d(TUNE.addIn) + (last ? last.enterDelay : 0));
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
    this._takeOff(slot);
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

  /**
   * A card has left the fan and is flying (play arc / discard tumble / exhaust
   * rise). `is-flying` takes it out of hit testing for the duration: its path
   * crosses the enemy field at z 600–900 and it must not steal an enemy's
   * hover on the way past. `view.destroy()` removes the element, so there is
   * nothing to clean up on the way out.
   */
  _takeOff(slot) {
    // A card that has left the fan cannot still be the card you are aiming.
    // `_layout` now re-parks `this.aim.slot` on every pass, so a stale aim
    // left pointing at a played/discarded/exhausted card would have `_goal`
    // and `_drawArrow` working on a view that is on its way to the bin.
    if (this.aim && this.aim.slot === slot) { this.aim = null; this._showArrow(false); }
    this.flying.add(slot);
    slot.view.el.classList.add('is-flying');
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
    // `_baseGeo` calls this once per card on every hit test, and the spread
    // solver below runs a bisection, so memoise on everything it depends on.
    const key = n + '|' + this.w + '|' + this.h + '|' + this.cw + '|' + this.chh
              + '|' + (this._anyUnplayable ? 1 : 0);
    if (this._fanKey === key && this._fanTmp) { this.fit = this._fanTmp.fit; return this._fanTmp; }

    const c = (n - 1) / 2;
    const fit = this._fit(n);
    const cw = this.cw * fit, ch = this.chh * fit;
    const band = Math.max(cw, this.w - this._sideMargin() * 2);

    const f = this._fanTmp || (this._fanTmp = {});
    f.fit = fit; f.cw = cw; f.ch = ch; f.c = c;

    /* ── how wide, and how bent ────────────────────────────────────────────
       Two wants, in priority order:
         1. no card covers a neighbour's rules text  (`_clearStep`)
         2. the arc keeps its ±3.1°/card bend
       and one hard constraint: the whole fan, rotated bounding boxes and all,
       stays inside the safe band. Where all three fit, take all three. Where
       they cannot, give up the BEND before the text — a flatter fan you can
       read beats a prettier one you cannot. Where even a dead-flat fan cannot
       clear the text (any hand of 8+, and the biggest cards at 7), keep the
       full arc and take the widest step the band allows: that is round 3's
       behaviour exactly, which is why nothing at n >= 8 moves. */
    let th = this._fanTh(n);
    const roomFor = (t) => (band - 2 * this._overhangAt(t, cw, ch)) / (n - 1);
    if (n > 1 && n <= T.spreadMax
        && roomFor(th) < this._clearStep(cw, th)
        && roomFor(0) >= this._clearStep(cw, 0)) {
      let lo = 0, hi = th;                       // both sides monotone in θ
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (roomFor(mid) >= this._clearStep(cw, mid)) lo = mid; else hi = mid;
      }
      th = lo;
    }
    f.rotPer = c ? th * 180 / Math.PI / c : 0;
    f.overhang = this._overhangAt(th, cw, ch);
    if (n > 1) {
      const want = this._clearStep(cw, th) + (n <= T.spreadMax ? cw * T.spreadAir : 0);
      f.step = Math.max(8, Math.min(Math.max(want, cw * T.stepRatio), roomFor(th)));
    } else f.step = 0;

    f.dip = Math.min(T.arcDipMax, 6 + n * T.arcDip) * fit * this._flat(n);
    // A rotated card's bounding box hangs (w/2)·sin(rot) below its anchor, and
    // an unaffordable one drops another 24px. Both are reserved here, so
    // max(card.bottom) == h - bottomPad for EVERY n. Nothing is ever clipped.
    f.sag = Math.abs(Math.sin(th)) * cw / 2;
    f.drop = this._anyUnplayable ? T.unplayableDrop * fit : 0;
    f.baseY = this.h - T.bottomPad - f.dip - f.sag - f.drop;
    f.cx = this.w / 2;
    f.lift = T.hoverLift * fit;
    // Hover growth is centred on the card, not on its bottom edge: see the
    // GEOMETRY note in TUNE. `_layout` pushes the anchor back down by this so
    // the card grows equally in both directions.
    f.grow = ch * (T.hoverScale - 1) / 2;
    f.nudge = T.hoverNudge * fit;
    this.fit = fit;
    this._fanKey = key;
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
    if (!n) { this._syncHitBox(); return; }
    const T = TUNE;
    const F = this._fan(n);
    const c = F.c, step = F.step, rotPer = F.rotPer, dip = F.dip, cx = F.cx, fit = F.fit;
    this.baseY = F.baseY;
    this._syncThreshold(F);
    this._syncHitBox(F);

    const hover = this.hoverSlot;
    const hoverIdx = hover ? this.slots.indexOf(hover) : -1;
    const dragSlot = this.drag ? this.drag.slot : null;
    /* A card that is being AIMED is not part of the fan any more. `_layout`
       had no idea the aim existed, so on the keyboard path every relayout —
       a target cycle, a playability refresh, a settings change, a resize —
       dropped the held card straight back into its fan slot at z 20+i, behind
       two of its neighbours, in the middle of the decision. It read as "I
       dropped it". The aim owns this slot until the aim ends. */
    const aimSlot = this.aim ? this.aim.slot : null;

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
        // + F.grow: the card grows about its own CENTRE, not its bottom edge.
        // Bottom-anchored, a 1.18x card pushes its top edge up by the whole
        // 0.18·height on top of the lift, and a 26 px lift measures as 82.
        y = F.baseY - F.lift + F.grow;
        rot = 0; scale = fit * T.hoverScale; z = 500;
      }

      if (s === dragSlot) continue;               // drag owns its own goal
      if (s === aimSlot) { this._reparkAim(); continue; }   // the aim owns it

      let dur = o.dur ?? this._d(TUNE.refan);
      let delay = 0;
      if (s.entering) {
        dur = this._d(s.enterDur || TUNE.drawIn);
        delay = s.enterDelay;
        s.entering = false;
        s.ease = s.enterEase || Clock.easeOutBack;
        s.arc = s.enterArc || 0;       // consumed by _tick, cleared when it lands
      }
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
    this._stepSlots(dt);
    if (this.aim) this._drawArrow();
  }

  /**
   * Integrate every slot's tween by `dt`.
   *
   * Split out of `_tick` so `_setHover` can run ONE sub-frame step
   * synchronously, inside the pointer event handler. Without it the earliest
   * a hovered card can move is the next animation frame — and the frame the
   * event lands in has already run its callbacks about half the time, so the
   * lift began up to a frame and a half after the mouse did. Now the first
   * ~22 % of the lift (easeOutCubic of 1/60 s against a 78 ms tween) is on
   * screen in the same task as the event, and the tween carries the rest.
   * Called exactly once per hover change, never per pointermove, so it cannot
   * make in-flight animations run fast.
   */
  _stepSlots(dt) {
    const slots = this.slots;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.delay > 0) { s.delay -= dt; if (s.delay > 0) continue; }
      if (s.e >= s.dur) { this._landed(s); continue; }
      s.e += dt;
      const p = s.e >= s.dur ? 1 : s.e / s.dur;
      const k = s.ease(p);
      const cu = s.cur, f = s.from, t = s.to;
      cu.x = lerp(f.x, t.x, k);
      // `arc` lifts the path off the straight line between from and to, so a
      // card that is LOBBED (Hand#add) rises above the fan and drops into it
      // instead of sliding. Retargetable like everything else here.
      cu.y = lerp(f.y, t.y, k) - (s.arc ? Math.sin(p * Math.PI) * s.arc : 0);
      cu.rot = lerp(f.rot, t.rot, k) + (s.flick ? Math.sin(p * Math.PI) * s.flick : 0);
      cu.scale = lerp(f.scale, t.scale, k);
      cu.z = t.z > f.z ? t.z : (p >= 1 ? t.z : f.z);
      s.view.setTransform(cu);
      if (p >= 1) { s.flick = 0; s.arc = 0; this._landed(s); }
    }
  }

  /** An arriving card has reached the fan: it becomes a hit target again. */
  _landed(s) {
    if (!s.airborne) return;
    s.airborne = false;
    s.view.el.classList.remove('is-flying');
  }

  // ── pointer ──────────────────────────────────────────────────────────────
  /**
   * Pointer events are handled on `.mm-hand` — the common ancestor of the
   * cards and the backstop — not on the backstop itself, because the cards are
   * hit targets in their own right now and their events must reach the same
   * handler. `.mm-hand` is `pointer-events:none`, which stops it being a hit
   * target but does not stop its descendants' events bubbling through it.
   *
   * `pointerleave` on `.mm-hand` is chain-based, not geometric: it fires the
   * moment the element under the pointer stops being inside the hand, whether
   * that is a card, the backstop, or nothing. That is exactly "the pointer has
   * left the fan", which is the only time hover should clear.
   */
  _bind() {
    const el = this.el;
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    this._onLeave = () => { if (!this.drag) this._setHover(null); };
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerup', this._onUp);
    el.addEventListener('pointercancel', this._onUp);
    el.addEventListener('pointerleave', this._onLeave);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    // Tabbing into the hand puts you on a card immediately — the keyboard path
    // must be discoverable, not a secret set of shortcuts.
    this._onFocusIn = (e) => {
      // `_quiet` means WE moved focus here (Escape releasing, or a played card
      // handing focus back). Auto-selecting then would undo the release.
      if (this._quietFocus) return;
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

  /**
   * MOTION FIRST, EVENTS SECOND — and the first frame of it right now.
   *
   * The old order was: set state, shout on the bus, then lay out. Every
   * `card:hover` subscriber in the game (tooltip, damage preview, keyword
   * panel) therefore ran BEFORE the card was told where to go, and the lift
   * waited on all of them and then on the next animation frame. Measured
   * mousemove-to-settled was 168 ms, 67 ms of which was over before a single
   * pixel moved. The layout is committed first, one sub-frame of it is applied
   * synchronously (`_stepSlots`), and only then does anyone else get told.
   */
  _setHover(slot) {
    if (this.locked || this.drag) return;
    if (slot === this.hoverSlot) return;
    const prev = this.hoverSlot;
    this.hoverSlot = slot;
    if (prev) prev.view.setState({ hover: false });
    if (slot) {
      slot.view.setState({ hover: true });
      this.selIdx = this.slots.indexOf(slot);
    }
    this._layout({ dur: this._d(slot ? TUNE.hoverIn : TUNE.hoverOut) });
    if (!this.reduceMotion) this._stepSlots(TUNE.kick);

    if (prev) this.bus.emit('card:unhover', { uid: prev.card.uid, cardId: prev.card.def.id });
    if (slot) this.bus.emit('card:hover', { uid: slot.card.uid, cardId: slot.card.def.id, view: slot.view });
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
      // where and when the gesture started — a tap is judged against these,
      // not against `moved`, which is a path length and grows on a jitter.
      sx: p.x, sy: p.y, t0: performance.now(),
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
    // Targets are live at ANY height. They used to only be read once the
    // cursor crossed the commit line, so dragging a targeted card straight at
    // an enemy left it in follow-the-cursor mode — and the card, at full size
    // and full opacity, parked itself squarely over the enemy's sprite, HP bar,
    // Guard badge and damage preview. You could not see the thing you were
    // about to hit. Snapping onto a target is now enough to enter aim mode.
    if (d.needsTarget) this._updateSnap(p.x, p.y);
    if (d.needsTarget && (above || d.snap)) {
      // Card parks out of the way; the arrow does the aiming.
      const g = this._aimPark(p.x, d.snap, fit);
      this._setAimGhost(s, true, g.over);
      this._goal(s, g.x, g.y, 0, g.scale, TUNE.aimZ, this._d(0.16), 0, Clock.easeOutCubic);
      this.aim = { slot: s, x: p.x, y: p.y, snap: d.snap, valid: !!d.snap && s.playable !== false };
      this._showArrow(true);
    } else {
      // Card follows the cursor with lag + tilt toward motion.
      const y = Math.min(this.h - 6, p.y + this.chh * fit * TUNE.dragScale * 0.5);
      this._goal(s, p.x, y, d.tilt, fit * TUNE.dragScale, 600,
        this._d(TUNE.dragFollow), 0, Clock.easeOutCubic);
      if (d.needsTarget) { this._showArrow(false); this.aim = null; this._setAimGhost(s, false); this._clearPreview(s); }
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
    this._setAimGhost(s, false);
    this._clearPreview(s);
    this.bus.emit('card:drop', { uid: s.card.uid, cardId: s.card.def.id });

    const above = d.py < this.thresholdY;
    /* A CLICK IS A PLAY. A non-targeted Trick used to need a drag across the
     * line and nothing else worked, so a click on a self-targeted card did
     * literally nothing. Pointerdown and pointerup in the same place, quickly,
     * is a tap and commits exactly as a drop above the line does — including
     * the shake when the card is unaffordable. A pointercancel is the browser
     * taking the gesture away (touch-scroll), never a tap. Targeted cards are
     * deliberately excluded: the Hand cannot know which enemy was meant, so
     * the aim arrow (or the scene) still resolves those.
     */
    const held = (performance.now() - d.t0) / 1000;
    const slip = Math.hypot(d.px - d.sx, d.py - d.sy);
    const tap = !d.needsTarget && e && e.type !== 'pointercancel'
      && held <= TUNE.tapTime && slip <= TUNE.tapSlop;
    const commit = d.cancelled ? false : (d.needsTarget ? !!d.snap : (above || tap));
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

  /**
   * Where the held card sits while you aim, and how solid it is.
   *
   * STS2-REFERENCE §2: "Hovering a target while holding a card previews the
   * outcome on that target" — which requires being able to SEE the target. The
   * held card is the least important thing on screen at that moment (you have
   * already chosen it; its rules text is what you read a second ago), so once
   * a target is locked it shrinks, goes translucent, and slides clear of the
   * target's box if it would otherwise overlap it. Un-snap and it comes back.
   *
   * @returns {{x:number,y:number,scale:number}} reused object — do not retain.
   */
  _aimPark(px, snap, fit) {
    const g = this._parkTmp || (this._parkTmp = { x: 0, y: 0, scale: 1, over: false });
    g.scale = fit * (snap ? TUNE.parkScaleAimed : TUNE.parkScale);
    /* OUT OF THE FAN. `parkY` put the held card's top edge level with its
       neighbours', so a translucent card sitting between two solid ones read
       as dropped rather than held. It now floats `aimLift` fan-card-heights
       above the fan's base line — high enough that its whole body is clear of
       every card in the hand, low enough that it stays under the enemy row. */
    const fanH = this.chh * (this.fit || 1);
    g.y = Math.round(clamp(this.baseY - fanH * TUNE.aimLift,
                           this.h * TUNE.aimMinY, this.parkY));
    g.x = lerp(this.w / 2, px, 0.18);
    g.over = false;
    if (!snap) return g;
    const hw = this.cw * g.scale / 2;
    const ch = this.chh * g.scale;
    const hits = () => g.y > snap.y && g.y - ch < snap.y + snap.h
                    && g.x + hw > snap.x && g.x - hw < snap.x + snap.w;
    // Only dodge if the parked card would actually sit over the target's box.
    if (hits()) {
      const pad = TUNE.aimClear;
      const lx = snap.x - pad - hw, rx = snap.x + snap.w + pad + hw;
      const lo = hw + 8, hi = this.w - hw - 8;
      const okL = lx >= lo, okR = rx <= hi;
      if (okL && okR) g.x = Math.abs(lx - g.x) <= Math.abs(rx - g.x) ? lx : rx;
      else if (okL) g.x = lx;
      else if (okR) g.x = rx;
      // Neither side has room (a very wide target): the fade and the shrink
      // are what keep the enemy readable, so leave x alone.
      g.over = hits();
    }
    return g;
  }

  /**
   * The held card while a target is locked.
   *
   * `is-aiming` is now the *held* state — full opacity, a lifted shadow, the
   * card you are clearly still holding. `is-over-target` is the part that
   * fades it, and it is only set when the park could NOT slide the card clear
   * of the thing you are aiming at; that is the case round 3 added the fade
   * for (STS2 §2 — you have to be able to see the target you are previewing).
   * Fading it in the common case, where it is nowhere near the enemy, is what
   * made it look like a card lying in the hand.
   */
  _setAimGhost(slot, on, over) {
    if (!slot) return;
    const cl = slot.view.el.classList;
    cl.toggle('is-aiming', !!on);
    cl.toggle('is-over-target', !!on && !!over);
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
      const wdt = lerp(4.5, 11, Math.pow(k, 0.8));    // monotonic: thin → thick
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
    this.bus.emit('card:play', {
      cardUid: slot.card.uid, cardId: slot.card.def.id,
      // `type` matters: the audio bus picks attack/skill/power from it, and without
      // it every card played the skill cue.
      type: slot.card.def.type, targetId,
    });
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
    this._setAimGhost(slot, false);

    /* ── ROVING FOCUS ──────────────────────────────────────────────────────
       A card that resolves used to hand focus back to the hand CONTAINER, so
       `document.activeElement` became `DIV.mm-hand`: a dead end, not a roving
       focus model. You had to press an arrow to get back onto a card before
       Enter did anything again, which is two keystrokes of nothing after
       every single play. Focus now lands on a REAL card — the one that slid
       into the gap the played card left — so Enter → Enter → Enter plays your
       way along the hand exactly as it reads.

       Only when the keyboard was already in the hand: a mouse drag must not
       silently lift a neighbour under the cursor. */
    const keyboardWasHere = this._focusInHand();
    if (this.slots.length && keyboardWasHere) {
      this._selectIdx(clamp(i < 0 ? this.selIdx : i, 0, this.slots.length - 1));
    } else {
      this.selIdx = -1;
      if (keyboardWasHere) this._releaseFocusToHand();   // hand is empty now
    }
    this._layout();                                  // the rest re-fans at once
    this._takeOff(slot);

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
    v.impact(0.82);
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
    this._takeOff(slot);
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
  /** Keep the keyboard in the hand after a card leaves it, without re-selecting. */
  _releaseFocusToHand() {
    if (!this._focusInHand()) return;
    this._quietFocus = true;
    this.el.focus?.({ preventScroll: true });
    this._quietFocus = false;
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
      // `_animatePlay` owns where the selection lands next — see the roving
      // focus block there. Blanket-clearing it here is what dropped the
      // keyboard onto the hand CONTAINER after every play.
      this._commit(s, id);
      return;
    }
    if (this._needsTarget(s.card.def)) {
      this._readTargets();
      if (!this.targets.length) { s.view.shake(8, 0.28); return; }
      this.aim = { slot: s, x: s.cur.x, y: 0, snap: this.targets[0], valid: true, key: true };
      this._applyPreview(this.targets[0].id);
      this.bus.emit('card:target', { uid: s.card.uid, targetId: this.targets[0].id });
      this._showArrow(true);
      this._reparkAim();               // same clear-of-the-target park as the mouse
      s.view.pulse('var(--flame-glow)', 0.3);
      return;
    }
    this._commit(s, undefined);
  }

  /**
   * Put the held card back where the aim wants it: lifted clear of the fan,
   * rotation zeroed, above every other card, and slid clear of the target.
   *
   * Called both from the keyboard path (Enter / Tab / arrow target cycling)
   * and from `_layout`, so a relayout that happens mid-aim cannot drop the
   * card back into the hand. The mouse path re-parks itself on every
   * pointermove and its slot is skipped by `_layout` before this is reached.
   */
  _reparkAim() {
    if (!this.aim) return;
    const s = this.aim.slot;
    // `aim.x` is fixed for the life of the aim. Re-reading `s.cur.x` here made
    // the park chase the card it was moving, so every relayout nudged it a
    // little further toward centre.
    const g = this._aimPark(this.aim.x, this.aim.snap, this.fit);
    this._setAimGhost(s, true, g.over);
    this._goal(s, g.x, g.y, 0, g.scale, TUNE.aimZ, this._d(0.18), 0, Clock.easeOutCubic);
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
    this._reparkAim();
  }

  _cancelAim() {
    if (!this.aim) return;
    const s = this.aim.slot;
    this.aim = null;
    // If the pointer is still down, cancelling the aim cancels the DRAG too.
    // Otherwise `_pointerUp` still saw a live snap target and played the card
    // on release — Escape looked like it worked and then the card went anyway.
    if (this.drag) { this.drag.snap = null; this.drag.cancelled = true; }
    this._showArrow(false);
    this._setAimGhost(s, false);
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
    this.el.removeEventListener('pointerdown', this._onDown);
    this.el.removeEventListener('pointermove', this._onMove);
    this.el.removeEventListener('pointerup', this._onUp);
    this.el.removeEventListener('pointercancel', this._onUp);
    this.el.removeEventListener('pointerleave', this._onLeave);
    this._host?.classList.remove('mm-hand-host');
    this._host = null;
    for (const s of this.slots) s.view.destroy();
    for (const s of this.flying) s.view.destroy();
    this.slots.length = 0; this.flying.clear();
    this.el.remove();
  }
}

export default Hand;
