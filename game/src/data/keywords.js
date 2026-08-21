/**
 * Keyword registry — what the tooltip system reads. OWNER: combat-engine.
 *
 * id → { id, name, desc, color, category, companion? }
 *
 * `desc` is plain language, no jargon, and never assumes the player has read a
 * wiki. `color` is always a CSS custom-property reference from ui/tokens.css —
 * there are no hex literals in this file and there must never be.
 *
 * Companion signature mechanics (Ghoststep, Haunt, Glow, Loose Bones, Globs,
 * Height, Web, Vines…) are declared by the companion-cards agent in
 * `data/companions/keywords.js` and merged in here:
 *
 *     import { COMPANION_KEYWORDS } from './companions/keywords.js';
 *     registerKeywords(COMPANION_KEYWORDS);
 *
 * or, without a hard import dependency:
 *
 *     await loadCompanionKeywords();
 */

import { UNIVERSAL_STATUSES } from '../combat/statuses.js';
import { TERMS } from './schema.js';

/** Category → token colour. Add a category, add a line here, nothing else. */
export const KEYWORD_COLORS = Object.freeze({
  core: 'var(--text-hi)',
  resource: 'var(--pluck-300)',
  buff: 'var(--spectre-300)',
  debuff: 'var(--threat-300)',
  card: 'var(--flame-200)',
  zone: 'var(--rarity-curse)',
  intent: 'var(--threat-200)',
  companion: 'var(--rarity-rare)',
});

const K = (id, name, desc, category = 'card', extra = {}) => ({
  id, name, desc, category, color: KEYWORD_COLORS[category] || KEYWORD_COLORS.card, ...extra,
});

// ── the words the whole game is written in ──────────────────────────────────
const CORE = [
  K('courage', TERMS.hp, 'Your health. At 0 Courage the expedition ends and you are put back where you belong.', 'core'),
  K('guard', TERMS.block, 'Temporary protection. Damage removes Guard before it removes Courage. All Guard is lost at the start of your turn unless a Trick says otherwise.', 'core'),
  K('nerve', TERMS.energy, 'Your energy for the turn. It refills to full at the start of every turn and unspent Nerve is lost.', 'resource'),
  K('trick', TERMS.card, 'A card. Your deck is your Tricks.', 'core'),
  K('keepsake', TERMS.relic, 'A small found object with a permanent passive effect for the rest of the run.', 'core'),
  K('snack', TERMS.potion, 'A one-use item you can eat at any point during a Scuffle. You can carry three.', 'core'),
  K('lost-things', TERMS.gold, "Currency. Spend it at Mr. Moth's.", 'core'),
];

// ── card-flow vocabulary ────────────────────────────────────────────────────
const CARD_FLOW = [
  K('vanish', 'Vanish', 'Remove this Trick from the Scuffle entirely. It comes back for the next fight.', 'card'),
  K('exhaust', 'Exhaust', 'Same as Vanish — the Trick leaves the Scuffle after it resolves.', 'card'),
  K('retain', 'Retain', 'This Trick is not discarded at the end of your turn.', 'card'),
  K('innate', 'Innate', 'This Trick is always in your opening hand.', 'card'),
  K('ethereal', 'Ethereal', 'If this Trick is still in your hand at the end of your turn, it Vanishes.', 'card'),
  K('unplayable', 'Unplayable', 'This Trick cannot be played. Get rid of it another way.', 'card'),
  K('x-cost', 'X', 'Spend all your remaining Nerve. X is however much you spent.', 'resource'),
  K('shuffle', 'Shuffle', 'When your draw pile runs out, your discard pile is shuffled and becomes the new draw pile.', 'card'),
  K('hand-size', 'Hand Size', 'You can hold 10 Tricks. A Trick drawn into a full hand goes straight to the discard pile.', 'card'),
  K('upgrade', 'Upgraded', 'A permanently improved Trick, marked with a +.', 'card'),
];

// ── zones ───────────────────────────────────────────────────────────────────
const ZONES = [
  K('draw-pile', 'Draw Pile', 'The face-down pile you draw from. Its order is hidden.', 'zone'),
  K('discard-pile', 'Discard Pile', 'Where played and discarded Tricks go. It becomes your draw pile when the draw pile empties.', 'zone'),
  K('vanished-pile', 'Vanished', 'Tricks removed from this Scuffle. A few effects can reach in and pull them back.', 'zone'),
  K('top-of-draw', 'Top of Draw Pile', 'The very next Trick you would draw.', 'zone'),
  K('bottom-of-draw', 'Bottom of Draw Pile', 'The last Trick you would draw before a shuffle.', 'zone'),
];

// ── intents ─────────────────────────────────────────────────────────────────
const INTENTS = [
  K('intent', 'Intent', 'What an enemy will do on its next turn. Attack intents always show the exact damage after every modifier, and the number updates the moment anything changes it.', 'intent'),
  K('intent-attack', 'Attacking', 'This enemy will deal damage. The number shown is per hit, after every modifier.', 'intent'),
  K('intent-defend', 'Defending', 'This enemy will gain Guard.', 'intent'),
  K('intent-buff', 'Scheming', 'This enemy will strengthen itself or its allies.', 'intent'),
  K('intent-debuff', 'Scheming', 'This enemy will weaken you.', 'intent'),
  K('intent-unknown', 'Unknown', 'You cannot tell what this one is planning.', 'intent'),
  K('intent-family', 'Intent Family', 'Every enemy action is one of four families: Attack, Defense, Scheme or Special.', 'intent'),
];

// ── universal statuses, generated from the single source of truth ───────────
const STATUS_KEYWORDS = Object.values(UNIVERSAL_STATUSES).map(s => K(
  s.id, s.name,
  String(s.desc || '').replace(/\{n\}/g, 'X') + decayNote(s),
  s.kind === 'debuff' ? 'debuff' : 'buff',
  { status: true, icon: s.icon },
));

function decayNote(s) {
  switch (s.decay) {
    case 'turnEnd': return ' Loses 1 stack at the end of its owner\'s turn.';
    case 'turnStart': return ' Loses 1 stack at the start of its owner\'s turn.';
    default: return ' Lasts for the rest of the Scuffle.';
  }
}

// ── registry ────────────────────────────────────────────────────────────────

const REGISTRY = new Map();
function seed(list) { for (const k of list) REGISTRY.set(k.id, k); }
seed(CORE); seed(CARD_FLOW); seed(ZONES); seed(INTENTS); seed(STATUS_KEYWORDS);

/** Register or replace keyword entries. Accepts an array or an id-keyed object. */
export function registerKeywords(defs) {
  const list = Array.isArray(defs) ? defs : Object.values(defs || {});
  for (const raw of list) {
    if (!raw || !raw.id) continue;
    const category = raw.category || (raw.companion ? 'companion' : 'card');
    REGISTRY.set(raw.id, {
      category,
      color: raw.color || KEYWORD_COLORS[category] || KEYWORD_COLORS.companion,
      ...raw,
    });
  }
  return REGISTRY.size;
}

export function getKeyword(id) {
  if (!id) return null;
  return REGISTRY.get(id) || REGISTRY.get(slug(id)) || null;
}
export function hasKeyword(id) { return !!getKeyword(id); }
export function allKeywords() { return [...REGISTRY.values()]; }
export function keywordsByCategory(cat) { return allKeywords().filter(k => k.category === cat); }

/** 'Loose Bones' → 'loose-bones'. Card text writes `[Loose Bones]`. */
export function slug(s) {
  return String(s).trim().toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Merge every content registry the engine knows about, without hard import
 * dependencies on files owned by other agents. Safe to call repeatedly, and safe
 * to call before any of those files exist.
 *
 *   await loadContentRegistries(engine)
 *
 * Registers: companion keywords + statuses, enemy statuses, and (if an engine is
 * passed) the enemy-generated status Tricks so `ctx.addCard('clutter')` resolves.
 */
export async function loadContentRegistries(engine = null) {
  const done = { companions: false, enemies: false, trackers: false };
  done.companions = await loadCompanionKeywords();
  // Companion per-combat trackers. The engine installs them at startCombat, but
  // it will not statically import another agent's module to find them.
  try {
    const { preloadCompanionTrackers } = await import('../combat/engine.js');
    done.trackers = await preloadCompanionTrackers();
  } catch (e) {
    console.warn('[keywords] tracker preload failed', e && e.message);
  }
  try {
    const m = await import('./enemies/_lib.js');
    const { registerStatuses } = await import('../combat/statuses.js');
    if (m.ENEMY_STATUSES) {
      registerStatuses(m.ENEMY_STATUSES);
      registerKeywords(m.ENEMY_STATUSES.map(s2 => ({
        id: s2.id, name: s2.name, desc: String(s2.desc || '').replace(/\{n\}/g, 'X'),
        category: s2.kind === 'debuff' ? 'debuff' : 'buff', status: true, icon: s2.icon,
      })));
    }
    if (engine && m.STATUS_TRICK_DEFS) engine.registerCards(m.STATUS_TRICK_DEFS);
    done.enemies = true;
  } catch (e) {
    console.warn('[keywords] enemy library not available yet', e?.message || e);
  }
  return done;
}

/**
 * Merge the companion-cards agent's registry without a hard import dependency.
 * Safe to call more than once; safe to call before that file exists.
 */
export async function loadCompanionKeywords() {
  try {
    const m = await import('./companions/keywords.js');
    if (m.COMPANION_KEYWORDS) registerKeywords(m.COMPANION_KEYWORDS);
    if (m.COMPANION_STATUSES) {
      const { registerStatuses } = await import('../combat/statuses.js');
      registerStatuses(m.COMPANION_STATUSES);
      registerKeywords(m.COMPANION_STATUSES.map(s => ({
        id: s.id, name: s.name, desc: String(s.desc || '').replace(/\{n\}/g, 'X'),
        category: s.kind === 'debuff' ? 'debuff' : 'buff', status: true, icon: s.icon,
        companion: s.companion,
      })));
    }
    return true;
  } catch (e) {
    console.warn('[keywords] companion keywords not available yet', e?.message || e);
    return false;
  }
}

/**
 * Tokenise card rules text for the card renderer.
 * Input: the raw `text` plus the `display` map from `engine.cardSnap()`.
 * Output: [{t:'text', v}] | [{t:'num', key, value, base, dir}] | [{t:'kw', id, name, color}]
 *
 * `{d}` / `{b}` resolve to the LIVE modified number and carry `dir` so the
 * renderer can tint boosted numbers green and reduced ones red.
 * `[Keyword]` becomes a hoverable chip.
 */
export function renderCardText(text, display = {}, nums = {}) {
  const out = [];
  const re = /\{([a-z][a-z0-9]*)\}|\[([^\]]+)\]/gi;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1]) {
      const key = m[1];
      const d = display[key];
      out.push({
        t: 'num', key,
        value: d ? d.value : (nums[key] ?? 0),
        base: d ? d.base : (nums[key] ?? 0),
        dir: d ? d.dir : 'same',
      });
    } else {
      const label = m[2];
      const kw = getKeyword(slug(label));
      out.push({ t: 'kw', id: kw ? kw.id : slug(label), name: label, color: kw ? kw.color : KEYWORD_COLORS.card, known: !!kw });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/** Plain string version, for the deck view, search and accessibility labels. */
export function plainCardText(text, display = {}, nums = {}) {
  return renderCardText(text, display, nums)
    .map(p => p.t === 'text' ? p.v : p.t === 'num' ? String(p.value) : p.name)
    .join('');
}

export default { getKeyword, allKeywords, registerKeywords, renderCardText, KEYWORD_COLORS };
