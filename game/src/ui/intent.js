/**
 * IntentView — the single most important read in the game.
 * OWNER: combat-scene.  Spec: docs/STS2-REFERENCE.md §1 and §2.
 *
 *   const iv = new IntentView();
 *   host.appendChild(iv.el);
 *   iv.set(intent, { playerHp: 62 });     // animates a number flip when it changes
 *   iv.destroy();
 *
 * Two independent visual channels so the read never depends on colour:
 *   1. FRAME shape  — one per intent *family*:
 *        attack  = downward shard        defense = shield
 *        scheme  = hexagon               special = circle
 *   2. GLYPH        — one per intent *type*, 15 distinct silhouettes.
 * Colour is a third, redundant channel only.
 *
 * Attack intents print the exact post-modifier per-hit damage and `xN` for
 * multi-hits. `set()` is called from the engine's `intent` event, which fires
 * only when the rendered intent actually changed — so every call animates.
 */

import { Intent } from '../data/schema.js';
import { intentFamily } from '../combat/intents.js';

const NS = 'http://www.w3.org/2000/svg';

/** Frame outline per family, on a 100x100 box. Drawn as a filled + stroked path. */
const FRAMES = {
  // a downward shard — reads as "something is coming at you"
  attack: 'M50 4 L92 26 L88 62 L50 96 L12 62 L8 26 Z',
  // a shield
  defense: 'M50 5 C68 12 82 14 92 14 C92 52 80 80 50 96 C20 80 8 52 8 14 C18 14 32 12 50 5 Z',
  // a hexagon, flat top
  scheme: 'M24 8 L76 8 L96 50 L76 92 L24 92 L4 50 Z',
  // a circle
  special: 'M50 4 A46 46 0 1 1 49.9 4 Z',
};

/**
 * Glyph paths, 100x100, designed to be legible at 34px and unmistakable in
 * pure silhouette. Each entry is { d, stroke?, extra? }.
 */
function glyph(type) {
  switch (type) {
    case Intent.ATTACK:
      // a single hooked claw / blade sweeping down-right
      return [
        { d: 'M22 20 C46 26 66 42 78 74 L62 70 L70 84 L48 80 L56 68 C46 46 34 32 22 20 Z' },
      ];
    case Intent.ATTACK_BIG:
      // three heavy claws — visibly more mass than ATTACK
      return [
        { d: 'M14 16 C34 26 48 44 54 76 L42 70 L46 84 L28 76 L36 66 C30 44 24 30 14 16 Z' },
        { d: 'M40 12 C60 24 74 44 80 78 L68 72 L72 86 L54 78 L62 68 C56 44 50 28 40 12 Z' },
        { d: 'M66 20 C82 34 90 52 92 74 L84 68 L86 80 L74 72 L80 64 C78 48 74 32 66 20 Z', o: 0.75 },
      ];
    case Intent.ATTACK_DEFEND:
      // blade on the left, shield half on the right
      return [
        { d: 'M14 18 C34 26 48 44 54 76 L42 70 L46 84 L28 76 L36 66 C30 44 24 30 14 18 Z' },
        { d: 'M62 22 C72 26 80 27 86 27 C86 52 78 70 62 80 Z' },
      ];
    case Intent.ATTACK_BUFF:
      // blade with a rising double chevron behind it
      return [
        { d: 'M16 22 C36 30 50 48 56 80 L44 74 L48 88 L30 80 L38 70 C32 48 26 34 16 22 Z' },
        { d: 'M58 44 L76 22 L94 44 L84 44 L76 34 L68 44 Z' },
        { d: 'M58 68 L76 46 L94 68 L84 68 L76 58 L68 68 Z' },
      ];
    case Intent.ATTACK_DEBUFF:
      // blade with a falling double chevron (mirror of ATTACK_BUFF)
      return [
        { d: 'M16 22 C36 30 50 48 56 80 L44 74 L48 88 L30 80 L38 70 C32 48 26 34 16 22 Z' },
        { d: 'M58 26 L68 26 L76 36 L84 26 L94 26 L76 48 Z' },
        { d: 'M58 50 L68 50 L76 60 L84 50 L94 50 L76 72 Z' },
      ];
    case Intent.DEFEND:
      // a solid shield with a boss
      return [
        { d: 'M50 12 C64 19 76 21 86 21 C86 54 74 76 50 88 C26 76 14 54 14 21 C24 21 36 19 50 12 Z', hollow: 1 },
        { d: 'M50 34 C57 38 63 39 68 39 C68 55 62 66 50 72 C38 66 32 55 32 39 C37 39 43 38 50 34 Z' },
      ];
    case Intent.DEFEND_BUFF:
      // shield with a rising chevron cut through it
      return [
        { d: 'M50 12 C64 19 76 21 86 21 C86 54 74 76 50 88 C26 76 14 54 14 21 C24 21 36 19 50 12 Z', hollow: 1 },
        { d: 'M28 62 L50 34 L72 62 L60 62 L50 49 L40 62 Z' },
        { d: 'M36 76 L50 58 L64 76 L56 76 L50 68 L44 76 Z' },
      ];
    case Intent.BUFF:
      // a triple rising chevron with a spark above
      return [
        { d: 'M22 74 L50 38 L78 74 L62 74 L50 58 L38 74 Z' },
        { d: 'M30 90 L50 64 L70 90 L58 90 L50 79 L42 90 Z' },
        { d: 'M50 6 L56 24 L74 30 L56 36 L50 54 L44 36 L26 30 L44 24 Z' },
      ];
    case Intent.DEBUFF:
      // a barbed falling arrow
      return [
        { d: 'M44 8 L56 8 L56 56 L74 56 L50 92 L26 56 L44 56 Z' },
        { d: 'M18 26 L30 22 L34 44 L22 46 Z', o: 0.8 },
        { d: 'M82 26 L70 22 L66 44 L78 46 Z', o: 0.8 },
      ];
    case Intent.STRONG_DEBUFF:
      // a barbed falling arrow doubled, with a cracked ring — visibly worse
      return [
        { d: 'M32 6 L44 6 L44 46 L58 46 L38 82 L18 46 L32 46 Z' },
        { d: 'M58 18 L70 18 L70 54 L84 54 L64 92 L44 54 L58 54 Z' },
        { d: 'M6 60 L18 54 L24 78 L12 82 Z', o: 0.7 },
        { d: 'M94 34 L84 28 L78 50 L88 54 Z', o: 0.7 },
      ];
    case Intent.SUMMON:
      // an arch with two small shapes stepping out of it
      return [
        { d: 'M18 88 L18 40 A32 32 0 0 1 82 40 L82 88 L68 88 L68 42 A18 18 0 0 0 32 42 L32 88 Z' },
        { d: 'M36 88 A11 11 0 0 1 58 88 Z' },
        { d: 'M56 88 A9 9 0 0 1 74 88 Z', o: 0.8 },
      ];
    case Intent.SLEEP:
      // three Zs, stepping up
      return [
        { d: 'M14 62 L46 62 L46 70 L28 86 L46 86 L46 94 L14 94 L14 86 L32 70 L14 70 Z' },
        { d: 'M46 30 L76 30 L76 38 L58 54 L76 54 L76 62 L46 62 L46 54 L64 38 L46 38 Z' },
        { d: 'M68 6 L94 6 L94 13 L79 27 L94 27 L94 34 L68 34 L68 27 L83 13 L68 13 Z', o: 0.8 },
      ];
    case Intent.STUN:
      // a ring of orbiting stars around a hollow centre
      return [
        { d: 'M50 4 L56 20 L72 14 L64 30 L80 34 L64 42 L72 58 L56 50 L50 66 L44 50 L28 58 L36 42 L20 34 L36 30 L28 14 L44 20 Z', o: 0.9 },
        { d: 'M22 74 A9 9 0 1 1 21.9 74 Z' },
        { d: 'M78 74 A9 9 0 1 1 77.9 74 Z' },
        { d: 'M50 90 A7 7 0 1 1 49.9 90 Z', o: 0.8 },
      ];
    case Intent.ESCAPE:
      // a doorway with an arrow leaving it
      return [
        { d: 'M14 8 L52 8 L52 92 L14 92 L14 82 L42 82 L42 18 L14 18 Z' },
        { d: 'M56 44 L78 44 L78 30 L98 50 L78 70 L78 56 L56 56 Z' },
      ];
    case Intent.UNKNOWN:
    default:
      // a bold question mark
      return [
        { d: 'M34 30 C34 16 42 6 54 6 C68 6 76 15 76 28 C76 40 68 44 60 50 C55 54 54 58 54 66 L42 66 C42 54 44 48 52 42 C59 37 64 34 64 27 C64 21 60 17 53 17 C46 17 45 22 45 30 Z' },
        { d: 'M40 78 A8 8 0 1 1 39.9 78 Z' },
      ];
  }
}

/** Short plain-language label under the glyph when there is no number to show. */
const WORD = {
  [Intent.DEFEND]: 'Guard', [Intent.DEFEND_BUFF]: 'Guard',
  [Intent.BUFF]: 'Buff', [Intent.DEBUFF]: 'Debuff', [Intent.STRONG_DEBUFF]: 'Debuff',
  [Intent.SUMMON]: 'Summon', [Intent.SLEEP]: 'Asleep', [Intent.STUN]: 'Stunned',
  [Intent.ESCAPE]: 'Fleeing', [Intent.UNKNOWN]: '?',
};

function svg(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

export class IntentView {
  /** @param {object} [o] { clock, reduceMotion } */
  constructor(o = {}) {
    this.clock = o.clock || null;
    this.reduceMotion = !!o.reduceMotion;
    this.intent = null;
    this._t = 0;
    this._flip = 0;
    this._heavyPhase = Math.random() * 6.283;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.className = 'cb-intent';
    el.setAttribute('role', 'img');
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="cb-intent__halo"></div>
      <svg class="cb-intent__art" viewBox="0 0 100 100" aria-hidden="true">
        <path class="cb-intent__frame" d=""></path>
        <path class="cb-intent__frameline" d=""></path>
        <g class="cb-intent__glyph" transform="translate(50 50) scale(0.56) translate(-50 -50)"></g>
      </svg>
      <div class="cb-intent__num"><span class="cb-intent__d"></span><span class="cb-intent__x"></span></div>
      <div class="cb-intent__word"></div>
      <div class="cb-intent__pips"></div>`;
    this.el = el;
    this.$frame = el.querySelector('.cb-intent__frame');
    this.$frameline = el.querySelector('.cb-intent__frameline');
    this.$glyph = el.querySelector('.cb-intent__glyph');
    this.$num = el.querySelector('.cb-intent__num');
    this.$d = el.querySelector('.cb-intent__d');
    this.$x = el.querySelector('.cb-intent__x');
    this.$word = el.querySelector('.cb-intent__word');
    this.$pips = el.querySelector('.cb-intent__pips');
    this.$halo = el.querySelector('.cb-intent__halo');
  }

  /**
   * @param {object|null} intent  the engine's Intent object
   * @param {object} [o] { playerHp, playerBlock } — used to decide "this will hurt"
   */
  set(intent, o = {}) {
    const prev = this.intent;
    this.intent = intent;
    if (!intent) { this.el.classList.add('is-empty'); return this; }
    this.el.classList.remove('is-empty');

    const fam = intent.family || intentFamily(intent.type);
    const type = intent.type || Intent.UNKNOWN;

    if (this._type !== type) {
      this._type = type;
      this.el.dataset.family = fam;
      this.el.dataset.type = type;
      this.$frame.setAttribute('d', FRAMES[fam] || FRAMES.special);
      this.$frameline.setAttribute('d', FRAMES[fam] || FRAMES.special);
      // rebuild the glyph
      while (this.$glyph.firstChild) this.$glyph.removeChild(this.$glyph.firstChild);
      for (const g of glyph(type)) {
        const p = svg('path', { d: g.d, class: 'cb-intent__gp' });
        if (g.o) p.setAttribute('opacity', String(g.o));
        if (g.hollow) p.setAttribute('class', 'cb-intent__gp is-hollow');
        this.$glyph.appendChild(p);
      }
    }

    // ── the number: exact post-modifier damage, xN for multi-hits ──────────
    const dmg = intent.damage | 0;
    const hits = intent.hits | 0;
    const showNum = dmg > 0 && hits > 0;
    this.el.classList.toggle('has-num', showNum);
    if (showNum) {
      const changed = prev && (prev.damage !== intent.damage || prev.hits !== intent.hits);
      this.$d.textContent = String(dmg);
      this.$x.textContent = hits > 1 ? `×${hits}` : '';
      this.el.classList.toggle('is-multi', hits > 1);
      if (changed) this._flipNumber(intent.damage > (prev.damage ?? 0));
    } else if (intent.block > 0) {
      this.$d.textContent = String(intent.block);
      this.$x.textContent = '';
      this.el.classList.add('has-num');
      this.el.classList.remove('is-multi');
      if (prev && prev.block !== intent.block) this._flipNumber(intent.block > (prev.block ?? 0));
    } else {
      this.$d.textContent = '';
      this.$x.textContent = '';
    }

    // ── word label for non-numeric intents ─────────────────────────────────
    const word = (!showNum && !(intent.block > 0)) ? (WORD[type] || '') : '';
    this.$word.textContent = word;
    this.el.classList.toggle('has-word', !!word);

    // ── status pips: what it will apply, without needing the tooltip ───────
    const pips = intent.statuses || [];
    if (this._pipKey !== pipKey(pips)) {
      this._pipKey = pipKey(pips);
      this.$pips.textContent = '';
      for (const s of pips.slice(0, 3)) {
        const d = document.createElement('span');
        d.className = 'cb-intent__pip';
        d.dataset.kind = s.kind || 'debuff';
        d.textContent = (s.stacks > 1 ? s.stacks : '') + shortName(s.name || s.id);
        this.$pips.appendChild(d);
      }
    }

    // ── "a big incoming hit should be felt" ────────────────────────────────
    const total = intent.totalDamage || dmg * Math.max(1, hits);
    const hp = o.playerHp || 0;
    const heavy = type === Intent.ATTACK_BIG
      || (hp > 0 && total >= Math.max(12, hp * 0.34))
      || total >= 18;
    const lethal = hp > 0 && total - (o.playerBlock || 0) >= hp;
    this.el.classList.toggle('is-heavy', !!heavy);
    this.el.classList.toggle('is-lethal', !!lethal);

    this.el.setAttribute('aria-label', intent.tooltip || intent.name || 'intent');
    return this;
  }

  _flipNumber(up) {
    this.el.classList.remove('is-flip-up', 'is-flip-down');
    // force reflow so the animation restarts even on a rapid second change
    void this.el.offsetWidth;
    this.el.classList.add(up ? 'is-flip-up' : 'is-flip-down');
  }

  /** Rich tooltip HTML: the move name, plain language, then the tell. */
  tooltipHTML() {
    const i = this.intent;
    if (!i) return '';
    const lines = [];
    if (i.damage > 0 && i.hits > 1) {
      lines.push(`Attacks <b>${i.hits}</b> times for <b>${i.damage}</b> damage each &mdash; <b>${i.totalDamage}</b> total.`);
    } else if (i.damage > 0) {
      lines.push(`Attacks for <b>${i.damage}</b> damage.`);
    }
    if (i.block > 0) lines.push(`Gains <b>${i.block}</b> Guard.`);
    for (const s of i.statuses || []) {
      const who = s.to === 'self' ? 'itself' : s.to === 'allEnemies' ? 'its allies' : 'you';
      lines.push(`Applies <b>${s.stacks} ${s.name}</b> to ${who}.`);
    }
    if (!lines.length) {
      const fallback = {
        [Intent.SLEEP]: 'Asleep. It does nothing this turn.',
        [Intent.STUN]: 'Stunned. It does nothing this turn.',
        [Intent.ESCAPE]: 'Preparing to flee the room.',
        [Intent.SUMMON]: 'Calling something else into the fight.',
        [Intent.UNKNOWN]: 'You cannot tell what it is about to do.',
      };
      lines.push(fallback[i.type] || i.name || 'It is planning something.');
    }
    const damageNote = i.damage > 0
      ? `<div class="cb-tip__note">This number is exact &mdash; every modifier is already counted.</div>` : '';
    return `<div class="cb-tip__title">${esc(i.name || 'Intent')}</div>
      <div class="cb-tip__body">${lines.join('<br>')}</div>
      ${i.tell ? `<div class="cb-tip__tell">${esc(i.tell)}</div>` : ''}
      ${damageNote}`;
  }

  /** Called once per frame by the scene. Only touches transforms. */
  update(dt, t) {
    if (this.reduceMotion) return;
    if (this.el.classList.contains('is-heavy')) {
      const k = 1 + Math.sin(t * 3.1 + this._heavyPhase) * 0.045;
      this.$halo.style.transform = `scale(${k.toFixed(4)})`;
    } else if (this.$halo.style.transform) {
      this.$halo.style.transform = '';
    }
  }

  destroy() { this.el.remove(); this.intent = null; }
}

function pipKey(list) { return (list || []).map(s => s.id + ':' + s.stacks).join('|'); }
function shortName(n) { return String(n).slice(0, 4); }
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

export default IntentView;
