/**
 * IntentView — the single most important read in the game.
 * OWNER: combat-scene.  Spec: docs/STS2-REFERENCE.md §1 and §2.
 *
 *   const iv = new IntentView();
 *   host.appendChild(iv.el);
 *   iv.set(intent, { playerHp: 62, def, mods });   // animates a number flip
 *   ctx.tooltip.attach(iv.el, () => iv.describe());
 *   iv.destroy();
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE GRAMMAR, applied to all sixteen intent types. Round 1 shipped three
 * different presentations on one screen (a shield badge plus a separate `🛡5`
 * pill; a hexagon plus a dim word plus a 4-character chip reading "ROUS"; a
 * named pill above a shield). Every intent now renders exactly this stack and
 * nothing else:
 *
 *      ┌───────────────┐
 *      │  FRAME+GLYPH  │   family shape (4) × type glyph (16). Colour is a
 *      └───────────────┘   third, redundant channel — never the only one.
 *       [ 7 ×3 ][ 🛡 5 ]   VALUE CHIPS: one row, same chip, same order.
 *                          damage · guard · word (only when there is no number)
 *       [☠2][💧1]          STATUS PIPS: icon + stacks. NEVER a clipped name.
 *
 * Attack chips print the exact post-modifier per-hit damage and ×N for
 * multi-hits. `set()` is called from the engine's `intent` event, which fires
 * only when the rendered intent actually changed — so every call animates.
 *
 * The tooltip is `describe()`, a Tooltip DESCRIPTOR (not an HTML string — the
 * shared Tooltip escapes strings, which is why round 1's intent tooltip
 * rendered as literal `<div class="cb-tip__title">` markup on screen). It
 * carries the engine's own `intent.tooltip` sentence, the `tell`, and — the
 * lesson round 1 never told anyone — WHY the number is what it is.
 */

import { Intent } from '../data/schema.js';
import { intentFamily } from '../combat/intents.js';
import { getStatus } from '../combat/statuses.js';
import { iconSvg, hasIcon } from './icons.js';

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

const FAMILY_WORD = {
  attack: 'Attack', defense: 'Defend', scheme: 'Scheme', special: 'Special',
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
    case Intent.DEFEND_DEBUFF:
      // shield with a FALLING chevron — the mirror of DEFEND_BUFF, so the two
      // are told apart by direction alone, with no colour involved
      return [
        { d: 'M50 12 C64 19 76 21 86 21 C86 54 74 76 50 88 C26 76 14 54 14 21 C24 21 36 19 50 12 Z', hollow: 1 },
        { d: 'M28 34 L40 34 L50 47 L60 34 L72 34 L50 62 Z' },
        { d: 'M36 62 L44 62 L50 70 L56 62 L64 62 L50 80 Z' },
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

/** Short plain-language label for an intent that has no number to show. */
const WORD = {
  [Intent.DEFEND]: 'Guard', [Intent.DEFEND_BUFF]: 'Guard', [Intent.DEFEND_DEBUFF]: 'Guard',
  [Intent.BUFF]: 'Buff', [Intent.DEBUFF]: 'Debuff', [Intent.STRONG_DEBUFF]: 'Debuff',
  [Intent.SUMMON]: 'Summon', [Intent.SLEEP]: 'Asleep', [Intent.STUN]: 'Stunned',
  [Intent.ESCAPE]: 'Fleeing', [Intent.UNKNOWN]: 'Unknown',
  [Intent.ATTACK]: 'Attack', [Intent.ATTACK_BIG]: 'Big Attack',
  [Intent.ATTACK_DEFEND]: 'Attack', [Intent.ATTACK_BUFF]: 'Attack',
  [Intent.ATTACK_DEBUFF]: 'Attack',
};

/** Plain sentence for an intent that carries no numbers at all. */
const NO_NUMBER_LINE = {
  [Intent.SLEEP]: 'Asleep. It does nothing this turn.',
  [Intent.STUN]: 'Stunned. It does nothing this turn.',
  [Intent.ESCAPE]: 'Preparing to flee the room.',
  [Intent.SUMMON]: 'Calling something else into the fight.',
  [Intent.UNKNOWN]: 'You cannot tell what it is about to do.',
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
    this.info = {};
    this._t = 0;
    this._flip = 0;
    this._heavyPhase = Math.random() * 6.283;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.className = 'cb-intent';
    el.setAttribute('role', 'img');
    // The intent is THE read of the genre, so it is a real tab stop, not a
    // decoration. Its tooltip is reachable with the keyboard for free.
    el.tabIndex = 0;
    el.innerHTML = `
      <div class="cb-intent__halo"></div>
      <svg class="cb-intent__art" viewBox="0 0 100 100" aria-hidden="true">
        <path class="cb-intent__frame" d=""></path>
        <path class="cb-intent__frameline" d=""></path>
        <g class="cb-intent__glyph" transform="translate(50 50) scale(0.56) translate(-50 -50)"></g>
      </svg>
      <div class="cb-intent__vals"></div>
      <div class="cb-intent__pips"></div>`;
    this.el = el;
    this.$frame = el.querySelector('.cb-intent__frame');
    this.$frameline = el.querySelector('.cb-intent__frameline');
    this.$glyph = el.querySelector('.cb-intent__glyph');
    this.$vals = el.querySelector('.cb-intent__vals');
    this.$pips = el.querySelector('.cb-intent__pips');
    this.$halo = el.querySelector('.cb-intent__halo');
  }

  /**
   * @param {object|null} intent  the engine's Intent object
   * @param {object} [o] extra render context, all optional:
   *        { playerHp, playerBlock, def, selfName, mods:[{name,kind}] }
   *        `def` is the EnemyDef — used to explain a number that changed
   *        because of the enemy's own state (Brace broken: 12 becomes 7).
   */
  set(intent, o = {}) {
    const prev = this.intent;
    this.intent = intent;
    this.info = o || {};
    if (!intent) { this.el.classList.add('is-empty'); return this; }
    this.el.classList.remove('is-empty');

    const type = intent.type || Intent.UNKNOWN;
    // DEFEND_DEBUFF postdates combat/intents.js's family map — it is a defense
    // read, not a "special" one. Remove this line once the engine agrees.
    const fam = type === Intent.DEFEND_DEBUFF ? 'defense' : (intent.family || intentFamily(type));
    this.family = fam;

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

    // ── ONE row of value chips, same order, every type ─────────────────────
    const dmg = intent.damage | 0;
    const hits = intent.hits | 0;
    const blk = intent.block | 0;
    const hasDmg = dmg > 0 && hits > 0;
    const hasBlk = blk > 0;
    const key = `${hasDmg ? dmg + 'x' + hits : ''}|${hasBlk ? blk : ''}|${type}`;
    if (key !== this._valKey) {
      this._valKey = key;
      this.$vals.textContent = '';
      if (hasDmg) this.$vals.appendChild(this._chip('damage', String(dmg), hits > 1 ? `×${hits}` : ''));
      if (hasBlk) this.$vals.appendChild(this._chip('guard', String(blk), ''));
      if (!hasDmg && !hasBlk) this.$vals.appendChild(this._chip('word', WORD[type] || FAMILY_WORD[fam] || 'Acts', ''));
    }
    this.el.classList.toggle('has-num', hasDmg || hasBlk);
    this.el.classList.toggle('is-multi', hasDmg && hits > 1);

    // the flip animation fires on whichever number actually moved
    if (prev) {
      if (hasDmg && (prev.damage !== dmg || prev.hits !== hits)) this._flipNumber(dmg > (prev.damage ?? 0));
      else if (!hasDmg && hasBlk && prev.block !== blk) this._flipNumber(blk > (prev.block ?? 0));
    }

    // ── status pips: ICONS with stacks. A name is never clipped. ───────────
    const pips = intent.statuses || [];
    if (this._pipKey !== pipKey(pips)) {
      this._pipKey = pipKey(pips);
      this.$pips.textContent = '';
      for (const s of pips.slice(0, 4)) {
        const d = document.createElement('span');
        d.className = 'cb-intent__pip';
        d.dataset.kind = s.kind || 'debuff';
        d.tabIndex = 0;
        const who = s.to === 'self' ? 'itself' : s.to === 'allEnemies' || s.to === 'allies' ? 'its allies' : 'you';
        d.dataset.tipTitle = s.name || s.id;
        d.dataset.tip = `${s.stacks} ${s.name} on ${who} when this resolves.`;
        d.setAttribute('aria-label', `${s.stacks} ${s.name} to ${who}`);
        d.innerHTML = statusPipIcon(s) + `<b>${s.stacks}</b>`;
        this.$pips.appendChild(d);
      }
      this.el.classList.toggle('has-pips', pips.length > 0);
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

    this.el.setAttribute('aria-label', this._ariaLabel(intent));
    return this;
  }

  _chip(role, value, sub) {
    const d = document.createElement('span');
    d.className = 'cb-intent__chip';
    d.dataset.role = role;
    if (role === 'guard') d.innerHTML = iconSvg('res.guard', { cls: 'cb-intent__chipicon' });
    const b = document.createElement('b');
    b.textContent = value;
    d.appendChild(b);
    if (sub) {
      const s = document.createElement('span');
      s.textContent = sub;
      d.appendChild(s);
    }
    return d;
  }

  _ariaLabel(i) {
    const bits = [i.name || 'Intent'];
    if (i.damage > 0) bits.push(i.hits > 1 ? `${i.damage} damage, ${i.hits} times` : `${i.damage} damage`);
    if (i.block > 0) bits.push(`${i.block} Guard`);
    for (const s of i.statuses || []) bits.push(`${s.stacks} ${s.name}`);
    return bits.join('. ') + '.';
  }

  _flipNumber(up) {
    this.el.classList.remove('is-flip-up', 'is-flip-down');
    // force reflow so the animation restarts even on a rapid second change
    void this.el.offsetWidth;
    this.el.classList.add(up ? 'is-flip-up' : 'is-flip-down');
  }

  /**
   * The tooltip, as a Tooltip DESCRIPTOR.
   *
   * `ui/tooltip.js` renders a descriptor object; handed a raw string it treats
   * it as literal text and escapes it, which is exactly how round 1 put
   * `<div class="cb-tip__title">Pack Wrong</div>` on screen as visible markup.
   *
   * Four things go in, in this order, because that is the order a player asks
   * them: what it does · why that number · what it feels like · the tell.
   */
  describe() {
    const i = this.intent;
    if (!i) return null;
    const o = this.info || {};
    const lines = [];

    // PLAIN TEXT ONLY. `tooltip._linkKeywords` escapes every line before it
    // links the keywords in it, so markup here prints as literal characters —
    // which is exactly what round 1 put on screen.  Emphasis lives in `rows`
    // below, which the tooltip renders as a real definition list.
    if (i.damage > 0 && i.hits > 1) {
      lines.push(`Attacks ${i.hits} times for ${i.damage} damage each — ${i.totalDamage} in total.`);
    } else if (i.damage > 0) {
      lines.push(`Attacks for ${i.damage} damage.`);
    }
    if (i.block > 0) lines.push(`Gains ${i.block} Guard.`);
    for (const s of i.statuses || []) {
      const who = s.to === 'self' ? (o.selfName || 'itself')
        : (s.to === 'allEnemies' || s.to === 'allies') ? 'its allies' : 'you';
      lines.push(`Applies ${s.stacks} ${s.name} to ${who}.`);
    }
    if (!lines.length) lines.push(NO_NUMBER_LINE[i.type] || i.name || 'It is planning something.');
    if (i.anchored) lines.push('Anchored — this action cannot be rearranged.');

    // ── why is the number what it is? ────────────────────────────────────
    const rows = this._breakdown();

    return {
      kind: 'intent',
      id: i.type,
      icon: hasIcon(`intent.${i.type}`) ? `intent.${i.type}` : 'intent.unknown',
      color: `var(--frame-c-${this.family || 'special'}, var(--flame-200))`,
      title: i.name || 'Intent',
      subtitle: i.familyLabel || FAMILY_WORD[this.family] || 'Intent',
      lines,
      rows: rows.length ? rows : null,
      footer: i.tell || (i.damage > 0
        ? 'This number is exact — every modifier is already counted.' : null),
    };
  }

  /**
   * The damage arithmetic, spelled out.
   *
   * Two different things can move an attack number and the player deserves to
   * see both, because one of them is a lesson:
   *
   *   • the enemy's own state — the Coatrack Crawler's Umbrella Jab is 12
   *     while its Brace stands and 7 once you break it. `def.moves[id].damage`
   *     is the number the move declares; `intent.baseDamage` is what its
   *     `damageFn` returned this turn. When they disagree, something you did
   *     changed the future, and this row is the only place the game says so.
   *   • Strength / Weak / Vulnerable — `baseDamage` -> `damage`.
   */
  _breakdown() {
    const i = this.intent;
    const rows = [];
    if (!i || !(i.damage > 0)) return rows;
    const base = Number.isFinite(i.baseDamage) ? i.baseDamage : i.damage;
    const declared = this._declaredDamage();

    if (declared != null && declared !== base) {
      rows.push(['Normally', String(declared)]);
      rows.push(['Right now', String(base)]);
    } else {
      rows.push(['Base', String(base)]);
    }
    if (base !== i.damage) {
      const mods = (this.info.mods || []).map(m => m.name).filter(Boolean);
      rows.push([mods.length ? mods.join(' · ') : 'Modifiers',
        `${base} → ${i.damage}`]);
    }
    if (i.hits > 1) rows.push(['Hits', `×${i.hits} = ${i.totalDamage}`]);
    return rows;
  }

  /** What the EnemyDef's move statically declares, if the scene handed us one. */
  _declaredDamage() {
    const m = this.info.def?.moves?.[this.intent?.moveId];
    return m && typeof m.damage === 'number' ? m.damage : null;
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

/**
 * The icon id for a status, from `ui/icons.js` (118 glyphs, the status set
 * included). Shared with `ui/enemy.js` so the intent pip, the enemy row and
 * the player row can never disagree about what Haunt looks like.
 *
 * Two lookups, because the two callers carry different shapes: `engine.state`
 * status snapshots include `icon`, but the status objects on an `Intent` do
 * not — `combat/intents.js#buildIntent` copies only id/stacks/to/name/kind —
 * so the definition is consulted directly. Without that, Roused (whose icon is
 * `bell-small`) rendered as a question mark, which on an intent reads as
 * "unknown intent" and is worse than no pip at all.
 *
 * The last resort is a buff/debuff arrow, never a `?`.
 */
export function statusIconId(s) {
  if (!s) return 'status.unknown';
  const def = s.icon ? null : safeStatus(s.id);
  const id = s.icon || (def && def.icon) || s.id;
  if (hasIcon(`status.${id}`)) return `status.${id}`;
  if (hasIcon(`status.${s.id}`)) return `status.${s.id}`;
  const kind = s.kind || (def && def.kind);
  return kind === 'buff' ? 'intent.buff' : kind === 'debuff' ? 'intent.debuff' : 'status.unknown';
}

function safeStatus(id) {
  try { const d = getStatus(id); return d && !d._missing ? d : null; } catch { return null; }
}

function statusPipIcon(s) {
  return iconSvg(statusIconId(s), { cls: 'cb-intent__pipicon' });
}

export default IntentView;
