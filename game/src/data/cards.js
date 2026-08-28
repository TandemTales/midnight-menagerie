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

// Registers COMPANION_STATUSES with the combat status registry on import. This
// has to be eager and it has to live here: nothing else in the companion graph
// imports it, so any consumer that did not separately call
// `loadContentRegistries()` — the balance sim, any headless harness — got the
// placeholder StatusDef for `haunt`, `ghoststep` and the rest. A placeholder has
// no `hooks`, so every Companion signature status silently did nothing.
import './companions/keywords.js';

import marmalade from './companions/marmalade.js';
import bones from './companions/bones.js';
import pipkin from './companions/pipkin.js';
import taffy from './companions/taffy.js';
import wink from './companions/wink.js';
import boggle from './companions/boggle.js';
import mopsy from './companions/mopsy.js';
import wisp from './companions/wisp.js';
import crumbula from './companions/crumbula.js';

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
  // Multiplayer-only Tricks are indexed by id — a save, a replay or a deck view
  // has to be able to look one up — but they are NOT in `def.cards`, so they
  // never reach a solo reward roll and the 80-card pool counts are untouched.
  for (const card of def.coopCards || []) {
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

[marmalade, bones, pipkin, taffy, wink, boggle, mopsy, wisp, crumbula].forEach(registerCompanion);
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

/**
 * A companion's multiplayer-only Tricks — three Uncommon and two Rare, outside
 * the 80, mirroring what Slay the Spire 2 does. Empty for a companion that has
 * not had its pool authored yet, which is deliberate: a missing pool should
 * mean "no co-op cards from this Kid yet", not a crash mid-draft.
 */
export function coopCardsOf(slug) { return (COMPANIONS.get(slug)?.coopCards) || []; }

/**
 * The draft pool for a rarity.
 *
 * `opts.coop` folds in the multiplayer-only Tricks. It is OFF by default so
 * every existing solo caller — reward rolls, the shop, the balance sim — keeps
 * exactly the pool it had.
 */
export function poolWithCoop(slug, rarity, opts = {}) {
  const base = poolFor(slug, rarity);
  if (!opts.coop) return base;
  const extra = coopCardsOf(slug).filter(c => !rarity || c.rarity === rarity);
  return base.concat(extra);
}

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
