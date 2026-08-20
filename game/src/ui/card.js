/**
 * CardView — one card, rendered from a CardDef + runtime state.
 * OWNER: card-feel agent.  See docs/STS2-REFERENCE.md §2 and §3.
 *
 *   const v = new CardView(def, { uid, upgraded, cost, playable });
 *   parent.appendChild(v.el);
 *   v.setTransform({ x: 400, y: 900, rot: -3, scale: 1, z: 4 });
 *   v.setPreviewNumbers({ d: 12, wasD: 9 });   // live green/red recolour
 *
 * The card is BUILT at CARD_SS x its display size and only ever scaled DOWN,
 * so it stays crisp at the 1.35x inspect scale and text can never reflow
 * while it moves (every size change is a transform, never a layout change).
 */
import { clock as defaultClock, Clock } from '../core/clock.js';
import { cardArt, onArtReady } from './cardart.js';

/** Must match `--ss` in card.css. */
export const CARD_SS = 1.4;

const TYPE_LABEL = { attack: 'Attack', skill: 'Skill', power: 'Power', status: 'Status', curse: 'Curse' };
const TARGET_SUB = { allEnemies: 'All', self: 'Self', randomEnemy: 'Random', ally: 'Ally' };
const KEYWORD_LABEL = {}; // filled by keywords.js consumers via CardView.registerKeywords()

let SEQ = 0;

export class CardView {
  /**
   * @param {object} def   CardDef
   * @param {object} [o]   { uid, upgraded, cost, playable, energy, largeText,
   *                         reduceMotion, clock, artSize }
   */
  constructor(def, o = {}) {
    this.def = def;
    this.uid = o.uid ?? `${def.id}#${++SEQ}`;
    this.clock = o.clock || defaultClock;
    this.reduceMotion = !!o.reduceMotion;

    this.state = {
      upgraded: !!o.upgraded,
      cost: o.cost,                 // undefined = use def.cost
      playable: o.playable !== false,
      selected: false,
      hover: false,
      dragging: false,
      ghost: false,
      disabled: false,
      largeText: !!o.largeText,
    };

    this._t = { x: 0, y: 0, rot: 0, scale: 1, z: 0 };
    this._shake = { x: 0, y: 0, r: 0 };
    this._extraScale = 1;
    this._dead = false;

    this._build();
    this._offArt = onArtReady(() => this._paintArt());
  }

  // ── build ────────────────────────────────────────────────────────────────
  _build() {
    const def = this.def;
    const el = document.createElement('div');
    el.className = 'mm-card';
    el.dataset.type = def.type || 'skill';
    el.dataset.rarity = def.rarity || 'common';
    el.dataset.uid = this.uid;
    el.dataset.cardId = def.id;
    el.setAttribute('role', 'button');

    el.innerHTML = `
      <div class="mm-card__ring"></div>
      <div class="mm-card__crest"></div>
      <div class="mm-card__pip mm-card__pip--l"></div>
      <div class="mm-card__pip mm-card__pip--r"></div>
      <div class="mm-card__pip mm-card__pip2 mm-card__pip--l"></div>
      <div class="mm-card__pip mm-card__pip2 mm-card__pip--r"></div>
      <div class="mm-card__frame">
        <div class="mm-card__face">
          <div class="mm-card__art"></div>
          <div class="mm-card__artline"></div>
          <div class="mm-card__banner"><div class="mm-card__name"></div></div>
          <div class="mm-card__type">
            <span class="mm-card__typeicon"></span><span class="mm-card__typelabel"></span>
          </div>
          <div class="mm-card__rules"></div>
          <div class="mm-card__badges"></div>
        </div>
        <div class="mm-card__rivets"><i></i><i></i><i></i><i></i></div>
        <div class="mm-card__flourish"><i></i><i></i><i></i><i></i></div>
        <div class="mm-card__setgem"></div>
        <div class="mm-card__shimmer"></div>
        <div class="mm-card__sheen"></div>
        <div class="mm-card__flash"></div>
      </div>
      <div class="mm-card__cost"></div>
      <div class="mm-card__embers"></div>`;

    this.el = el;
    this.$art = el.querySelector('.mm-card__art');
    this.$name = el.querySelector('.mm-card__name');
    this.$type = el.querySelector('.mm-card__typelabel');
    this.$rules = el.querySelector('.mm-card__rules');
    this.$cost = el.querySelector('.mm-card__cost');
    this.$badges = el.querySelector('.mm-card__badges');
    this.$flash = el.querySelector('.mm-card__flash');
    this.$embers = el.querySelector('.mm-card__embers');

    this._paintArt();
    this._renderName();
    this._renderType();
    this._renderRules();
    this._renderCost();
    this._renderBadges();
    this._applyClasses();
    this._apply();
  }

  _paintArt() {
    if (this._dead) return;
    // Art box is 224x172 design px; render at the on-screen size the card can
    // reach so it never upscales.
    const url = cardArt(this.def, 224 * CARD_SS, 172 * CARD_SS, { upgraded: this.state.upgraded });
    this.$art.style.backgroundImage = `url("${url}")`;
  }

  _renderName() {
    const n = this.def.name || this.def.id;
    this.$name.textContent = n;
    if (this.state.upgraded) {
      const s = document.createElement('span');
      s.className = 'mm-card__plus';
      s.textContent = '+';
      this.$name.appendChild(s);
    }
    const len = n.length + (this.state.upgraded ? 1 : 0);
    this.el.classList.toggle('is-name-long', len > 14 && len <= 19);
    this.el.classList.toggle('is-name-xlong', len > 19);
    this.el.setAttribute('aria-label', this._ariaLabel());
  }

  _renderType() {
    const t = this.def.type || 'skill';
    const sub = TARGET_SUB[this.def.target];
    this.$type.innerHTML = '';
    this.$type.append(document.createTextNode(TYPE_LABEL[t] || t));
    if (sub) {
      const s = document.createElement('span');
      s.className = 'mm-card__typesub';
      s.textContent = ' · ' + sub;
      this.$type.appendChild(s);
    }
  }

  /** Values the text placeholders resolve to right now (base, pre-preview). */
  get nums() {
    const base = this.def.nums || {};
    if (this.state.upgraded && this.def.upgrade && this.def.upgrade.nums) {
      return Object.assign({}, base, this.def.upgrade.nums);
    }
    return base;
  }

  get text() {
    if (this.state.upgraded && this.def.upgrade && this.def.upgrade.text) return this.def.upgrade.text;
    return this.def.text || '';
  }

  get cost() {
    if (this.state.cost !== undefined && this.state.cost !== null) return this.state.cost;
    if (this.state.upgraded && this.def.upgrade && this.def.upgrade.cost !== undefined) return this.def.upgrade.cost;
    return this.def.cost ?? 1;
  }

  /**
   * Renders rules text once. Placeholders become live nodes:
   *   {d} {b} {n} {m0}…  ->  <b class="mm-card__num" data-key="d">9</b>
   *   [Keyword]          ->  <span class="mm-card__kw" data-kw="ghoststep">Keyword</span>
   *   \n                 ->  line break
   *   *italic*           ->  <em>
   */
  _renderRules() {
    const txt = this.text;
    const nums = this.nums;
    this.$rules.textContent = '';
    this._numEls = new Map();

    const frag = document.createDocumentFragment();
    let plain = 0;

    for (const line of String(txt).split('\n')) {
      const row = document.createElement('div');
      const re = /\{(\w+)\}|\[([^\]]+)\]|\*([^*]+)\*/g;
      let last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) { row.appendChild(document.createTextNode(line.slice(last, m.index))); plain += m.index - last; }
        if (m[1]) {
          const b = document.createElement('b');
          b.className = 'mm-card__num';
          b.dataset.key = m[1];
          const v = nums[m[1]];
          b.textContent = v === undefined ? '?' : String(v);
          plain += b.textContent.length;
          if (!this._numEls.has(m[1])) this._numEls.set(m[1], []);
          this._numEls.get(m[1]).push(b);
          row.appendChild(b);
        } else if (m[2]) {
          const s = document.createElement('span');
          s.className = 'mm-card__kw';
          s.dataset.kw = m[2].toLowerCase().replace(/\s+/g, '-');
          s.textContent = KEYWORD_LABEL[s.dataset.kw] || m[2];
          plain += s.textContent.length;
          row.appendChild(s);
        } else {
          const e = document.createElement('em');
          e.textContent = m[3];
          plain += m[3].length;
          row.appendChild(e);
        }
        last = re.lastIndex;
      }
      if (last < line.length) { row.appendChild(document.createTextNode(line.slice(last))); plain += line.length - last; }
      frag.appendChild(row);
    }
    this.$rules.appendChild(frag);
    this.el.classList.toggle('is-text-long', plain > 62 && plain <= 104);
    this.el.classList.toggle('is-text-xlong', plain > 104);
    this._preview = null;
  }

  _renderCost() {
    const c = this.cost;
    this.$cost.textContent = c === -1 ? 'X' : c === -2 ? '–' : String(c);
    const baseCost = this.def.cost ?? 1;
    this.el.classList.toggle('is-cost-reduced', c >= 0 && c < baseCost);
    this.el.classList.toggle('is-cost-raised', c > baseCost);
  }

  _renderBadges() {
    const d = this.def, out = [];
    if (d.exhaust) out.push(['exhaust', 'Exhaust']);
    if (d.ethereal) out.push(['ethereal', 'Ethereal']);
    if (d.innate) out.push(['innate', 'Innate']);
    if (d.retain) out.push(['retain', 'Retain']);
    this.$badges.textContent = '';
    for (const [k, label] of out) {
      const s = document.createElement('span');
      s.className = `mm-card__badge mm-card__badge--${k}`;
      s.textContent = label;
      this.$badges.appendChild(s);
    }
  }

  _ariaLabel() {
    const s = this.state;
    return [
      this.def.name + (s.upgraded ? ' plus' : ''),
      `${this.cost} Nerve`,
      TYPE_LABEL[this.def.type] || this.def.type,
      this.def.rarity,
      String(this.text).replace(/[{}\[\]*]/g, ''),
      s.playable ? '' : 'unplayable',
    ].filter(Boolean).join(', ');
  }

  _applyClasses() {
    const s = this.state, cl = this.el.classList;
    cl.toggle('is-upgraded', s.upgraded);
    cl.toggle('is-unplayable', !s.playable);
    cl.toggle('is-unaffordable', !s.playable);
    cl.toggle('is-selected', s.selected);
    cl.toggle('is-hover', s.hover);
    cl.toggle('is-dragging', s.dragging);
    cl.toggle('is-ghost', s.ghost);
    cl.toggle('is-largetext', s.largeText);
    this.el.setAttribute('aria-disabled', String(!!s.disabled));
  }

  // ── public API ───────────────────────────────────────────────────────────
  /** Merge runtime state and re-render only what changed. */
  setState(patch = {}) {
    const s = this.state;
    const before = { upgraded: s.upgraded, cost: this.cost, largeText: s.largeText };
    Object.assign(s, patch);

    if ('upgraded' in patch && patch.upgraded !== before.upgraded) {
      this._renderName();
      this._renderRules();
      this._renderCost();
      this._paintArt();
    } else if (this.cost !== before.cost) {
      this._renderCost();
    }
    if ('nums' in patch) this._renderRules();
    this._applyClasses();
    return this;
  }

  /**
   * Live-recolour the numbers in the rules text.  STS2-REFERENCE §2:
   * "Card damage numbers in the card text update live … and are recoloured
   *  (green = boosted, red = reduced)."
   *
   *   setPreviewNumbers({ d: 12, wasD: 9 })   // 12 in green
   *   setPreviewNumbers({ b: 3 })             // compared against the base value
   *   setPreviewNumbers(null)                 // back to base
   */
  setPreviewNumbers(p) {
    if (!this._numEls) return this;
    this._preview = p || null;
    const base = this.nums;
    for (const [key, els] of this._numEls) {
      let val = base[key];
      let was = base[key];
      if (p) {
        if (p[key] !== undefined) val = p[key];
        const wk = 'was' + key.charAt(0).toUpperCase() + key.slice(1);
        if (p[wk] !== undefined) was = p[wk];
      }
      const up = typeof val === 'number' && typeof was === 'number' && val > was;
      const down = typeof val === 'number' && typeof was === 'number' && val < was;
      for (const e of els) {
        if (e.textContent !== String(val)) e.textContent = String(val === undefined ? '?' : val);
        e.classList.toggle('is-up', up);
        e.classList.toggle('is-down', down);
      }
    }
    return this;
  }

  /** Position in the parent's coordinate space. (x,y) is the card's BOTTOM CENTRE. */
  setTransform(t) {
    const c = this._t;
    if (t.x !== undefined) c.x = t.x;
    if (t.y !== undefined) c.y = t.y;
    if (t.rot !== undefined) c.rot = t.rot;
    if (t.scale !== undefined) c.scale = t.scale;
    if (t.z !== undefined) c.z = t.z;
    this._apply();
    return this;
  }
  get transform() { return this._t; }

  _apply() {
    const t = this._t, s = this._shake;
    const scale = (t.scale * this._extraScale) / CARD_SS;
    this.el.style.transform =
      `translate3d(${(t.x + s.x).toFixed(2)}px, ${(t.y + s.y).toFixed(2)}px, 0) ` +
      `translate(-50%, -100%) rotate(${(t.rot + s.r).toFixed(3)}deg) scale(${scale.toFixed(5)})`;
    this.el.style.zIndex = String(t.z | 0);
  }

  /** A single bright pop — used on play and on buff. */
  flash(strength = 0.9, dur = 0.2) {
    if (this.reduceMotion) return Promise.resolve();
    const f = this.$flash;
    return this.clock.ramp(dur, (v) => {
      f.style.opacity = String(Math.sin(v * Math.PI) * strength);
    });
  }

  /** Decaying shake, composed on top of whatever setTransform is doing. */
  shake(mag = 10, dur = 0.34) {
    if (this.reduceMotion) return Promise.resolve();
    const s = this._shake;
    return this.clock.ramp(dur, (v) => {
      const d = (1 - v) * (1 - v);
      s.x = Math.sin(v * 46) * mag * d;
      s.y = Math.cos(v * 37) * mag * 0.45 * d;
      s.r = Math.sin(v * 52) * mag * 0.28 * d;
      this._apply();
    }).then(() => { s.x = s.y = s.r = 0; this._apply(); });
  }

  /** Exhaust: burns away bottom-to-top into rising embers. */
  dissolve(dur = 0.62) {
    const el = this.el;
    if (this.reduceMotion) { el.style.opacity = '0'; return Promise.resolve(); }
    const embers = this.$embers;
    const N = 16;
    embers.textContent = '';
    const parts = [];
    for (let i = 0; i < N; i++) {
      const b = document.createElement('i');
      const px = 6 + (i * 37 % 88);
      const py = 30 + (i * 53 % 68);
      b.style.left = px + '%';
      b.style.top = py + '%';
      embers.appendChild(b);
      parts.push({ el: b, dx: ((i * 29 % 40) - 20), dy: -70 - (i * 17 % 90), sw: 0.5 + (i % 5) * 0.22, ph: (i % 7) / 7 });
    }
    embers.style.opacity = '1';
    return this.clock.ramp(dur, (v) => {
      const cut = v * 132 - 16;
      el.style.webkitMaskImage = `linear-gradient(to top, transparent ${cut}%, rgba(0,0,0,.4) ${cut + 7}%, black ${cut + 16}%)`;
      el.style.maskImage = el.style.webkitMaskImage;
      for (const p of parts) {
        const t = Math.min(1, Math.max(0, (v - p.ph * 0.35) / 0.65));
        p.el.style.transform = `translate3d(${p.dx * t}px, ${p.dy * t}px, 0) scale(${p.sw * (1 - t * 0.7)})`;
        p.el.style.opacity = String(Math.sin(t * Math.PI) * 0.95);
      }
    }, Clock.easeOutCubic).then(() => {
      el.style.webkitMaskImage = ''; el.style.maskImage = '';
      embers.style.opacity = '0'; embers.textContent = '';
    });
  }

  /** Draw: fades and swells in. Pairs with the hand's riffle. */
  materialize(dur = 0.24) {
    const el = this.el;
    if (this.reduceMotion) { el.style.opacity = '1'; this._extraScale = 1; this._apply(); return Promise.resolve(); }
    el.style.opacity = '0';
    return this.clock.ramp(dur, (v) => {
      el.style.opacity = String(Math.min(1, v * 1.6));
      this._extraScale = 0.84 + 0.16 * v;
      this._apply();
    }, Clock.easeOutCubic).then(() => { el.style.opacity = '1'; this._extraScale = 1; this._apply(); });
  }

  /** Persistent glow. `glow(null)` turns it off. */
  glow(color, amount = 1) {
    if (!color) { this.el.style.setProperty('--glow-amt', '0'); return this; }
    this.el.style.setProperty('--glow-color', color);
    this.el.style.setProperty('--glow-amt', String(amount));
    return this;
  }

  /** One-shot pulse of the glow ring — the "tick" of feedback on snap. */
  pulse(color, dur = 0.36) {
    if (this.reduceMotion) return Promise.resolve();
    if (color) this.el.style.setProperty('--glow-color', color);
    const el = this.el;
    return this.clock.ramp(dur, (v) => {
      el.style.setProperty('--glow-amt', String(Math.sin(v * Math.PI)));
    });
  }

  destroy() {
    this._dead = true;
    this._offArt?.();
    this.el.remove();
  }

  /** Register plain-language keyword display names (from data/keywords.js). */
  static registerKeywords(map) { Object.assign(KEYWORD_LABEL, map); }
}

export default CardView;
