/**
 * Drafting, pathing and spending policies. OWNER: balance.
 *
 * A balance number is only meaningful against a deck a player would actually
 * bring. The old sim brought the unmodified 10-card starter to the region boss,
 * which is not a build; it is the tutorial. These policies build real ones.
 *
 * Archetype policies are driven off the *content*, not off a hardcoded list:
 * every companion def carries `archetypes[].coreCards` (see
 * data/companions/marmalade.js:989), which is the design's own statement of
 * what the deck is trying to be.
 */
import { cardById, companion as companionDef } from '/game/src/data/cards.js';
import { NodeType } from '/game/src/data/schema.js';

export const POLICIES = ['greedy-damage', 'defensive', 'archetype-haunt', 'archetype-ghoststep', 'balanced'];

/** Total printed damage a card def puts out, AoE weighted. */
function damageOf(def) {
  const n = def.nums || {};
  const d = (n.d || 0) * (n.hits || 1) + (n.m0 || 0) * 0.5;
  return def.target === 'allEnemies' ? d * 1.6 : d;
}
function blockOf(def) {
  const n = def.nums || {};
  return (n.b || 0) + (n.m0 && /Guard/.test(def.text || '') ? n.m0 * 0.5 : 0);
}
const costOf = (def) => (typeof def.cost === 'number' ? def.cost : 2);
const RARITY_BONUS = { basic: -6, common: 0, uncommon: 5, rare: 11, special: -20, curse: -60 };

function coreSets(slug) {
  const comp = companionDef(slug);
  const out = {};
  for (const a of comp?.archetypes || []) out[a.name] = new Set(a.coreCards);
  return out;
}

/**
 * A plausible value for one card, under one policy, for the deck we already
 * have. Deliberately crude — a drafting policy has to be *plausible*, not
 * optimal, and the measurement that matters is what the resulting deck does.
 */
export function cardValue(def, policy, ctx) {
  if (!def) return -999;
  const eff = Math.max(0.6, costOf(def));
  const dmg = damageOf(def), blk = blockOf(def);
  let v = RARITY_BONUS[def.rarity] ?? 0;
  v += dmg / eff * 1.0;
  v += blk / eff * 0.85;
  if (def.type === 'power') v += 6;                      // pays back over a fight
  if (costOf(def) === 0) v += 3;                         // cheap Tricks chain
  const kw = new Set(def.keywords || []);
  if (kw.has('vanish')) v -= 2;
  if (/Draw \d/.test(def.text || '')) v += 3;

  switch (policy) {
    case 'greedy-damage':
      v += dmg / eff * 1.4;
      v -= blk / eff * 0.5;
      break;
    case 'defensive':
      v += blk / eff * 1.4;
      if (/Guard|Ghoststep/.test(def.text || '')) v += 3;
      v -= dmg / eff * 0.25;
      break;
    case 'archetype-haunt':
      if (ctx.core['Haunt']?.has(def.id)) v += 14;
      if (kw.has('haunt') || /Haunt/.test(def.text || '')) v += 6;
      break;
    case 'archetype-ghoststep':
      if (ctx.core['Ghoststep & Untouched']?.has(def.id)) v += 14;
      if (kw.has('ghoststep') || /Ghoststep|Untouched/.test(def.text || '')) v += 6;
      break;
    default: break;                                       // balanced: the base curve
  }

  // A big deck dilutes. Past ~16 Tricks only a genuinely strong card is worth
  // the draw it displaces — this is the instinct that stops decks bloating.
  const size = ctx.deckSize || 10;
  if (size > 15) v -= (size - 15) * 1.1;
  return v;
}

/** Which of the three offered Tricks to take, or null to skip. */
export function draft(offered, policy, ctx) {
  let best = null;
  for (const o of offered) {
    const def = cardById(o.id);
    const v = cardValue(def, policy, ctx);
    if (!best || v > best.v) best = { id: o.id, v, def };
  }
  if (!best) return null;
  // Skipping is a real choice: it buys luck and pocket money. A card that is
  // worse than the average card already in the deck is not worth the dilution.
  return best.v > ctx.skipFloor ? best.id : null;
}

/**
 * Safe Room: heal, or upgrade? StS heuristic — heal when hurt, else upgrade,
 * and *always* heal at the last Safe Room before the boss unless nearly full.
 * A competent player treats the pre-boss campfire as non-negotiable.
 */
export function restChoice(run) {
  const frac = run.courage / run.maxCourage;
  const upgradeable = run.upgradeableCards();
  if (!upgradeable.length) return { kind: 'rest' };
  const rowsLeft = (run.map?.rows ?? 13) - 1 - (run.currentNode?.row ?? 0);
  if (rowsLeft <= 3 && frac < 0.9) return { kind: 'rest' };
  if (frac < 0.7) return { kind: 'rest' };
  return { kind: 'upgrade' };
}

/** Which Trick to upgrade: the one we most often draw and most rely on. */
export function pickUpgrade(run, policy) {
  const ctx = { core: coreSets(run.companion), deckSize: run.deck.length, skipFloor: 0 };
  const counts = new Map();
  for (const c of run.deck) counts.set(c.id, (counts.get(c.id) || 0) + 1);
  let best = null;
  for (const c of run.upgradeableCards()) {
    const def = cardById(c.id);
    if (!def) continue;
    // copies matter: upgrading one of five Scratches is a fifth of a card
    const v = cardValue(def, policy, ctx) + 2.5 * Math.min(3, counts.get(c.id) || 1);
    if (!best || v > best.v) best = { uid: c.uid, v };
  }
  return best?.uid || null;
}

/**
 * Shop. Snacks first (they are the cheapest survival per Lost Thing), then a
 * Keepsake we can afford, then a card that beats the draft floor, then removal
 * of a basic once the deck is thick.
 */
export function shopPlan(run, policy) {
  const stock = run.shopStock();
  const ctx = { core: coreSets(run.companion), deckSize: run.deck.length, skipFloor: 6 };
  const buys = [];
  const sortedSnacks = stock.snacks.slice().sort((a, b) => a.price - b.price);
  for (const s of sortedSnacks) {
    if (run.snacks.length + buys.filter(b => b.kind === 'snack').length >= run.snackCap) break;
    buys.push({ kind: 'snack', snack: s, price: s.price });
  }
  for (const k of stock.keepsakes) buys.push({ kind: 'keepsake', id: k.id, price: k.price, v: 40 });
  for (const c of stock.cards) {
    const v = cardValue(cardById(c.id), policy, ctx);
    if (v > ctx.skipFloor) buys.push({ kind: 'card', id: c.id, price: c.price, v });
  }
  return { stock, buys };
}

/**
 * Route. A real player paths deliberately: through Safe Rooms and shops when
 * hurt or poor, through Big Scares when healthy (the Keepsake is worth it), and
 * never into an elite at low Courage.
 */
export function pickNode(run, candidates, { greedElites = true } = {}) {
  const frac = run.courage / run.maxCourage;
  const rows = run.map?.rows ?? 13;
  const score = (n) => {
    const t = run.effectiveType(n);
    // Deep in the region every point of Courage is boss fuel: a Safe Room in
    // the last three rows outranks anything else on the board.
    const deep = n.row >= rows - 4;
    switch (t) {
      case NodeType.SAFE: return deep ? 400 : (frac < 0.75 ? 100 : 40);
      case NodeType.TREASURE: return 70;
      case NodeType.SHOP: return run.lostThings > 130 ? 65 : 30;
      case NodeType.BIG_SCARE: return (greedElites && frac > 0.82 && !deep) ? 55 : -40;
      case NodeType.CURIOSITY: return deep ? 55 : 45;
      case NodeType.UNKNOWN: return 42;
      case NodeType.RESCUE: return 60;
      case NodeType.SCUFFLE: return deep ? 20 : 35;
      case NodeType.BOSS: return 1000;
      default: return 20;
    }
  };
  let best = null;
  for (const n of candidates) {
    const s = score(n);
    if (!best || s > best.s) best = { n, s };
  }
  return best?.n || candidates[0] || null;
}

/**
 * Curiosity. Score each open option by the expected value of its authored
 * outcomes — the risk and the reward are both printed on the button, so a
 * competent player really can reason about this before pressing it.
 */
export function pickEventOption(run, def, { cautious = false } = {}) {
  const frac = run.courage / run.maxCourage;
  const val = (fx = {}) => {
    let v = 0;
    v += (fx.heal || 0) * 0.9;
    v += (fx.hp || 0) * (fx.hp < 0 ? (cautious || frac < 0.5 ? 2.2 : 1.2) : 1.0);
    v += (fx.maxHp || 0) * 2.0;
    v += (fx.lostThings || 0) * 0.09;
    v += (fx.snacks || 0) * 8;
    v += (fx.clues || 0) * 2;
    v += fx.relic ? 30 : 0;
    v += fx.card ? 6 * (fx.card.count || 1) : 0;
    v += fx.curse ? -25 : 0;
    v += (fx.removeCard || 0) * 10;
    v += (fx.upgradeCard || 0) * 12;
    v += fx.combat === 'elite' ? (frac > 0.75 ? 5 : -40) : fx.combat ? -8 : 0;
    return v;
  };
  let best = null;
  for (const o of def.options || []) {
    if (!run.optionOpen(o)) continue;
    let v;
    if (o.outcomes?.length) {
      const tw = o.outcomes.reduce((s, x) => s + (x.w ?? 1), 0);
      v = o.outcomes.reduce((s, x) => s + (x.w ?? 1) * val(x.effects), 0) / (tw || 1);
    } else v = val(o.effects);
    if (!best || v > best.v) best = { id: o.id, v };
  }
  return best?.id || (def.options || []).find(o => run.optionOpen(o))?.id || null;
}

export { coreSets };
export default { draft, cardValue, restChoice, pickUpgrade, shopPlan, pickNode, pickEventOption, POLICIES };
