/**
 * The card registry.  OWNER: companion-cards.
 *
 * Every CardDef in the game is reachable from here.  Companion modules are
 * self-describing (see data/companions/marmalade.js for the shape) and are
 * registered at import time.
 *
 *   allCards()                     -> CardDef[]  every card, all sources
 *   cardById(id)                   -> CardDef | undefined
 *   poolFor(slug, rarity)          -> CardDef[]  reward pool, Basic excluded
 *   startingDeckFor(slug)          -> CardDef[]  the exact starting multiset
 *   registerCompanion(def)         -> def        add a companion at runtime
 *   companion(slug) / companions() -> the companion definitions
 */
import { Rarity, CardType } from './schema.js';
import { NEUTRAL_CARDS, STATUS_CARDS, CURSE_CARDS, SHARED_CARDS } from './neutral.js';

import marmalade from './companions/marmalade.js';
import bones from './companions/bones.js';
import pipkin from './companions/pipkin.js';
import taffy from './companions/taffy.js';
import wink from './companions/wink.js';

// ── registry ────────────────────────────────────────────────────────────────
const COMPANIONS = new Map();
const BY_ID = new Map();
const REGISTER_ERRORS = [];

/** Register a companion definition and index every card it owns. */
export function registerCompanion(def) {
  if (!def || !def.slug) { REGISTER_ERRORS.push('companion definition without a slug'); return def; }
  COMPANIONS.set(def.slug, def);
  for (const card of def.cards || []) {
    if (BY_ID.has(card.id)) REGISTER_ERRORS.push(`duplicate card id: ${card.id}`);
    BY_ID.set(card.id, card);
  }
  return def;
}

/** Register loose cards that belong to no companion (statuses, curses, shared). */
export function registerCards(list) {
  for (const card of list || []) {
    if (BY_ID.has(card.id)) REGISTER_ERRORS.push(`duplicate card id: ${card.id}`);
    BY_ID.set(card.id, card);
  }
  return list;
}

[marmalade, bones, pipkin, taffy, wink].forEach(registerCompanion);
registerCards(NEUTRAL_CARDS);

// ── lookups ─────────────────────────────────────────────────────────────────
export function allCards() { return [...BY_ID.values()]; }
export function cardById(id) { return BY_ID.get(id); }
export function companions() { return [...COMPANIONS.values()]; }
export function companion(slug) { return COMPANIONS.get(slug); }
export function companionSlugs() { return [...COMPANIONS.keys()]; }
export function registryErrors() { return REGISTER_ERRORS.slice(); }

/**
 * The reward pool for a companion.  Basic cards never appear as rewards, so they
 * are excluded unless the rarity is explicitly asked for.
 * `rarity` may be omitted to get the whole 80-card pool.
 */
export function poolFor(slug, rarity) {
  const def = COMPANIONS.get(slug);
  if (!def) return [];
  const cards = def.cards || [];
  if (rarity) return cards.filter(c => c.rarity === rarity);
  return cards.filter(c => c.rarity === Rarity.COMMON || c.rarity === Rarity.UNCOMMON || c.rarity === Rarity.RARE);
}

/** Cards a companion owns at a given rarity, including Basic and Special. */
export function cardsOf(slug) { return (COMPANIONS.get(slug)?.cards) || []; }

/** The exact starting deck, as CardDefs, in the order the companion declares. */
export function startingDeckFor(slug) {
  const def = COMPANIONS.get(slug);
  if (!def) return [];
  return (def.startingDeck || []).map(id => BY_ID.get(id)).filter(Boolean);
}

/** Everything that is not a companion card. */
export function neutralCards() { return NEUTRAL_CARDS; }
export function statusCards() { return STATUS_CARDS; }
export function curseCards() { return CURSE_CARDS; }
export function sharedCards() { return SHARED_CARDS; }

/** Cards eligible for a colourless / shared reward at a rarity. */
export function sharedPool(rarity) { return rarity ? SHARED_CARDS.filter(c => c.rarity === rarity) : SHARED_CARDS.slice(); }

/** Convenience for the reward screen: n distinct cards from a pool, via ctx.run.rng. */
export function rollRewards(rng, slug, rarities) {
  const out = [];
  const seen = new Set();
  for (const r of rarities) {
    const pool = poolFor(slug, r).filter(c => !seen.has(c.id));
    if (!pool.length) continue;
    const pick = pool[rng.int(pool.length)];
    seen.add(pick.id);
    out.push(pick);
  }
  return out;
}

export { Rarity, CardType };
export default { allCards, cardById, poolFor, startingDeckFor, registerCompanion, companions, companion };
