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
import { fixNumberedNouns } from '../util/plural.js';

/** Must match `--ss` in card.css. */
export const CARD_SS = 1.4;

/**
 * Art window, in design-grid units. The name banner used to sit ON the
 * illustration and 90%-black covered 20% of it; it is now a plate BELOW the
 * art (126u..160u), so the art box shrank to a clean, fully-visible 224x126.
 * Must match `.mm-card__art` in card.css.
 */
export const ART_W = 224;
export const ART_H = 126;

const TYPE_LABEL = { attack: 'Attack', skill: 'Skill', power: 'Power', status: 'Status', curse: 'Curse' };
const TARGET_SUB = { allEnemies: 'All', self: 'Self', randomEnemy: 'Random', ally: 'Ally' };
const KEYWORD_LABEL = {}; // filled by keywords.js consumers via CardView.registerKeywords()

/**
 * The game's word for a mechanic, when content still writes the placeholder
 * name. `data/companions/keywords.js` defines the shared vocabulary and the
 * word for "remove this card from the combat" is **Vanish** — but the enemy
 * status Tricks in `data/enemies/_lib.js` still author `[Exhaust]` into their
 * rules text, so "Good Boy!" read "… Vanish." over a badge saying EXHAUST and
 * Clutter read "Does nothing. Exhaust." One card, two names for one rule.
 *
 * The badge row is fixed at source (see `_renderBadges`). This map covers the
 * text placeholders we do not own. REPORTED: `data/enemies/_lib.js:234,242`
 * should say `[Vanish]`; the day it does, this entry is a harmless no-op.
 */
const KEYWORD_ALIAS = { exhaust: 'vanish' };

/** Canonical display word for a `[Bracketed]` keyword in rules text. */
function keywordLabel(raw) {
  const key = raw.toLowerCase().replace(/\s+/g, '-');
  const id = KEYWORD_ALIAS[key] || key;
  return { id, text: KEYWORD_LABEL[id] || (KEYWORD_ALIAS[key] ? capitalise(id) : raw) };
}
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
    // Focusable so `view.el.focus()` is not a no-op and the hand can run a
    // roving-focus model. -1: reachable programmatically, never by raw Tab
    // (the hand itself is the single tab stop and traps Tab while selecting).
    el.setAttribute('tabindex', '-1');

    // Everything visible lives inside __body so `dissolve()` can mask ONE node
    // and still leave the ember layer (a sibling) outside the mask.
    // NOTE ON ORDER: `__face` is a SIBLING of `__frame`, not a child. The
    // unplayable treatment desaturates the frame with a CSS filter, and a
    // filter applies to the whole subtree — with the face nested inside, that
    // filter was dimming the rules text as well and dropped Curse contrast to
    // 1.22:1. Frame material and card contents are now filtered separately.
    el.innerHTML = `
      <div class="mm-card__body">
        <div class="mm-card__ring"></div>
        <div class="mm-card__crest"><i></i></div>
        <div class="mm-card__pip mm-card__pip--l"></div>
        <div class="mm-card__pip mm-card__pip--r"></div>
        <div class="mm-card__pip mm-card__pip2 mm-card__pip--l"></div>
        <div class="mm-card__pip mm-card__pip2 mm-card__pip--r"></div>
        <div class="mm-card__frame">
          <div class="mm-card__lift"></div>
          <div class="mm-card__rivets"><i></i><i></i><i></i><i></i></div>
          <div class="mm-card__flourish"><i></i><i></i><i></i><i></i></div>
          <div class="mm-card__setgem"></div>
        </div>
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
        <div class="mm-card__shimmer"></div>
        <div class="mm-card__sheen"></div>
        <div class="mm-card__flash"></div>
        <div class="mm-card__cost"></div>
      </div>
      <div class="mm-card__embers"></div>`;

    this.el = el;
    this.$body = el.querySelector('.mm-card__body');
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
    // Rastered at a FIXED size (never the live display size) so the cache key
    // is viewport-independent and `warmArt()` can pre-generate every card in
    // the deck before combat starts. CSS scales the bitmap down, never up.
    const url = cardArt(this.def, ART_W * CARD_SS, ART_H * CARD_SS, { upgraded: this.state.upgraded });
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
    this.el.classList.toggle('is-name-long', len > 13 && len <= 18);
    this.el.classList.toggle('is-name-xlong', len > 18);
    this._updateAria();
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
    this._nounNodes = [];

    for (const line of String(txt).split('\n')) {
      const row = document.createElement('div');
      const re = /\{(\w+)\}|\[([^\]]+)\]|\*([^*]+)\*/g;
      let last = 0, m, lastNum = null;
      const addText = (str) => {
        const t = document.createTextNode(str);
        this._nounNodes.push({ node: t, orig: str, num: lastNum });
        row.appendChild(t);
        plain += str.length;
        lastNum = null;
      };
      while ((m = re.exec(line))) {
        if (m.index > last) addText(line.slice(last, m.index));
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
          lastNum = b;
        } else if (m[2]) {
          const s = document.createElement('span');
          s.className = 'mm-card__kw';
          const kw = keywordLabel(m[2]);
          s.dataset.kw = kw.id;
          s.textContent = kw.text;
          plain += s.textContent.length;
          row.appendChild(s);
          lastNum = null;
        } else {
          const e = document.createElement('em');
          e.textContent = m[3];
          plain += m[3].length;
          row.appendChild(e);
          lastNum = null;
        }
        last = re.lastIndex;
      }
      if (last < line.length) addText(line.slice(last));
      frag.appendChild(row);
    }
    plain += this._repairNouns();
    this.$rules.appendChild(frag);
    this.el.classList.toggle('is-text-long', plain > 62 && plain <= 104);
    this.el.classList.toggle('is-text-xlong', plain > 104);
    this._preview = null;
    this._updateAria();
  }

  /**
   * "Draw {n} Tricks" with n=1 printed "Draw 1 Tricks".
   *
   * The authored string cannot fix this: the noun is written before the number
   * exists, and the number is substituted here. 46 lines across five content
   * files say "Tricks" because they are usually right — so repair the finished
   * line instead of editing content. Only the TEXT nodes are rewritten, so the
   * live `<b class="mm-card__num">` elements keep their identity (and their
   * green/red preview classes) across the repair.
   *
   * `orig` is always the authored, plural form, so a preview that pushes a 1 up
   * to a 2 restores "Tricks" as cleanly as it singularised it.
   * Returns the character delta, for the is-text-long thresholds.
   */
  _repairNouns() {
    if (!this._nounNodes) return 0;
    let delta = 0;
    for (const e of this._nounNodes) {
      // The count lives in the preceding <b>; give the repair that context.
      const lead = e.num ? (/(\d+)\s*$/.exec(e.num.textContent) || ['', ''])[1] : '';
      const out = fixNumberedNouns(lead + e.orig).slice(lead.length);
      if (out !== e.node.nodeValue) {
        delta += out.length - e.node.nodeValue.length;
        e.node.nodeValue = out;
      }
    }
    return delta;
  }

  _renderCost() {
    const c = this.cost;
    this.$cost.textContent = c === -1 ? 'X' : c === -2 ? '–' : String(c);
    const baseCost = this.def.cost ?? 1;
    this.el.classList.toggle('is-cost-reduced', c >= 0 && c < baseCost);
    this.el.classList.toggle('is-cost-raised', c > baseCost);
  }

  /**
   * The badge row. The word for `def.exhaust` is **Vanish** — that is what
   * `data/companions/keywords.js` defines and what the rules text prints. The
   * badge said EXHAUST, so "Good Boy!" read "Gain 1 Nerve. Vanish." directly
   * above a chip reading EXHAUST: two names for one rule on one card face.
   * The CSS modifier stays `--exhaust` (it names the card *flag*, not the word).
   */
  _renderBadges() {
    const d = this.def, out = [];
    if (d.exhaust) out.push(['exhaust', 'Vanish']);
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

  /**
   * The rules text as a screen reader should hear it: placeholders replaced by
   * the numbers actually on the card RIGHT NOW (including any live preview
   * adjustment), keywords spoken as their plain-language label, emphasis and
   * line breaks flattened. Never "Deal d damage."
   */
  _spokenText() {
    const base = this.nums, p = this._preview;
    return fixNumberedNouns(String(this.text)
      .replace(/\{(\w+)\}|\[([^\]]+)\]|\*([^*]+)\*/g, (m, key, kw, em) => {
        if (key) {
          let v = base[key];
          if (p && p[key] !== undefined) v = p[key];
          return v === undefined ? 'some' : String(v);
        }
        if (kw) return keywordLabel(kw).text;
        return em;
      })
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim());
  }

  _ariaLabel() {
    const s = this.state;
    const c = this.cost;
    const costWord = c === -1 ? 'X Nerve' : c === -2 ? 'unplayable' : `${c} Nerve`;
    const extra = [];
    if (this.def.exhaust) extra.push('Vanish');
    if (this.def.ethereal) extra.push('Ethereal');
    if (this.def.innate) extra.push('Innate');
    if (this.def.retain) extra.push('Retain');
    return [
      this.def.name + (s.upgraded ? ' plus' : ''),
      costWord,
      TYPE_LABEL[this.def.type] || this.def.type,
      this.def.rarity,
      this._spokenText(),
      extra.join(' '),
      s.playable ? '' : 'cannot be played right now',
    ].filter(Boolean).join(', ');
  }

  _updateAria() { this.el.setAttribute('aria-label', this._ariaLabel()); }

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
    /* `aria-disabled` follows PLAYABILITY, not just the explicit `disabled`
       flag. `disabled` is never set by the Hand — it tracks `playable` — so an
       unaffordable card carrying `is-unaffordable is-unplayable`, desaturated,
       dropped 24px and shaking when you try to play it, was still announcing
       `aria-disabled="false"`. Everything a sighted player can see said "no";
       the accessibility tree said "yes". The visible state and the announced
       state are now the same state. (The label also ends with "cannot be
       played right now" — see `_ariaLabel` — so the reason is spoken too.) */
    this.el.setAttribute('aria-disabled', String(!s.playable || !!s.disabled));
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
    if ('playable' in patch || this.cost !== before.cost) this._updateAria();
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
    // A preview can move a count across 1 in either direction ("Draw 1 Trick"
    // -> "Draw 2 Tricks"), so the nouns follow the numbers.
    this._repairNouns();
    this._updateAria();
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

  /**
   * The hero frame. STS2-REFERENCE §4: "combat effects pop off the screen".
   * A played card must be the most SOLID thing on screen at the instant it
   * resolves — full saturation, a hard rim of light, and a bloom that reads
   * even over a bright background. `is-hero` kills every dimming filter.
   */
  hero(on = true) {
    this.el.classList.toggle('is-hero', !!on);
    return this;
  }

  /** Wind-up → contact: a hard white pop with a bloom ring behind it. */
  impact(strength = 1) {
    if (this.reduceMotion) return Promise.resolve();
    const f = this.$flash, el = this.el;
    return this.clock.ramp(0.26, (v) => {
      // fast attack, slow release — reads as a strike, not a fade
      const a = v < 0.16 ? v / 0.16 : Math.pow(1 - (v - 0.16) / 0.84, 2.2);
      f.style.opacity = String(a * strength);
      el.style.setProperty('--glow-amt', String(a * 0.9 * strength));
    }).then(() => { f.style.opacity = '0'; el.style.setProperty('--glow-amt', '0'); });
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

  /**
   * Exhaust: the card burns away bottom-to-top and the ash rises as embers.
   *
   * The mask goes on `__body` (frame + face + crest + cost gem), NOT on the
   * card root — the ember layer is a sibling of `__body`, so the embers drift
   * up through the region the mask has already erased instead of being erased
   * with it. The mask box is stretched 30u above the card so the crest and the
   * cost gem burn with everything else rather than floating on as solid gold.
   *
   * Timing: the burn front clears the top of the card by ~250 ms; the embers
   * finish by `dur`. (Was 615 ms of nothing visible.)
   */
  dissolve(dur = 0.38) {
    const el = this.el, body = this.$body;
    if (this.reduceMotion) { el.style.opacity = '0'; return Promise.resolve(); }

    const u = (el.offsetWidth || 224) / 224;      // design unit in CSS px
    const over = 30 * u;                          // mask box overhang above the card
    const cardH = el.offsetHeight || 312 * u;
    const maskH = cardH + over;

    const embers = this.$embers;
    const N = 14;
    embers.textContent = '';
    const parts = [];
    for (let i = 0; i < N; i++) {
      const b = document.createElement('i');
      b.style.left = (5 + (i * 37 % 90)) + '%';
      b.style.top = (24 + (i * 53 % 72)) + '%';
      // Promoted only for the life of this one animation — a permanent
      // will-change here would give every card in the hand 14 extra
      // composited layers and cost ~8 fps on a draw.
      b.style.willChange = 'transform, opacity';
      embers.appendChild(b);
      parts.push({
        el: b,
        dx: ((i * 29 % 40) - 20) * u * 1.6,
        dy: (-80 - (i * 17 % 90)) * u * 1.6,
        sw: 0.55 + (i % 5) * 0.24,
        ph: (i % 7) / 9,                          // embers lead the burn front
      });
    }
    embers.style.opacity = '1';

    body.style.webkitMaskRepeat = body.style.maskRepeat = 'no-repeat';
    body.style.webkitMaskSize = body.style.maskSize = `100% ${maskH.toFixed(1)}px`;
    body.style.webkitMaskPosition = body.style.maskPosition = `0 ${(-over).toFixed(1)}px`;

    return this.clock.ramp(dur, (v) => {
      // `cut` measured from the BOTTOM of the mask box, in px.
      const cut = v * (maskH + 44 * u) - 14 * u;
      const g = `linear-gradient(to top,` +
        ` transparent ${cut.toFixed(1)}px,` +
        ` rgba(0,0,0,.35) ${(cut + 12 * u).toFixed(1)}px,` +
        ` rgba(0,0,0,.85) ${(cut + 24 * u).toFixed(1)}px,` +
        ` black ${(cut + 40 * u).toFixed(1)}px)`;
      body.style.webkitMaskImage = g;
      body.style.maskImage = g;
      for (const p of parts) {
        const t = Math.min(1, Math.max(0, (v - p.ph * 0.3) / 0.7));
        p.el.style.transform = `translate3d(${(p.dx * t).toFixed(1)}px, ${(p.dy * t).toFixed(1)}px, 0) scale(${(p.sw * (1 - t * 0.65)).toFixed(3)})`;
        p.el.style.opacity = String(Math.sin(t * Math.PI) * 0.98);
      }
    }, Clock.easeOutCubic).then(() => {
      body.style.webkitMaskImage = ''; body.style.maskImage = '';
      body.style.webkitMaskSize = ''; body.style.maskSize = '';
      body.style.webkitMaskPosition = ''; body.style.maskPosition = '';
      embers.style.opacity = '0'; embers.textContent = '';
    });
  }

  /**
   * Draw: fades and swells in. Pairs with the hand's riffle.
   *
   * Ends by CLEARING the inline opacity rather than pinning it to 1. An inline
   * `opacity:1` outranks every stylesheet rule, so a card that had ever been
   * materialised could not be faded by a class again — which is how the
   * aiming fade (`.mm-card.is-aiming`) silently did nothing on any card that
   * arrived by a draw. A finished fade-in must leave no override behind.
   */
  materialize(dur = 0.24) {
    const el = this.el;
    if (this.reduceMotion) { el.style.opacity = ''; this._extraScale = 1; this._apply(); return Promise.resolve(); }
    el.style.opacity = '0';
    return this.clock.ramp(dur, (v) => {
      el.style.opacity = String(Math.min(1, v * 1.6));
      this._extraScale = 0.84 + 0.16 * v;
      this._apply();
    }, Clock.easeOutCubic).then(() => { el.style.opacity = ''; this._extraScale = 1; this._apply(); });
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
