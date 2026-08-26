/**
 * A bootable combat with no content dependencies. OWNER: combat-engine.
 *
 * Exists so the scene, card-feel, enemy and FX agents can run a real fight
 * before any authored Companion or region content lands. Everything here is
 * deliberately generic — real content replaces it wholesale.
 *
 *   import { makeDummyCombat } from '../combat/dummy.js';
 *   const engine = makeDummyCombat(new RNG(42));
 *   await engine.startCombat();
 */

import { CombatEngine } from './engine.js';
import { RNG } from '../core/rng.js';
import { CardType, Rarity, Target, Intent, Pile } from '../data/schema.js';

// ── Tricks ──────────────────────────────────────────────────────────────────

/** @type {import('../data/schema.js').CardDef} */
export const SCRATCH = {
  id: 'neutral/scratch', name: 'Scratch', companion: 'neutral',
  type: CardType.ATTACK, rarity: Rarity.BASIC, cost: 1, target: Target.ENEMY,
  text: 'Deal {d} damage.', nums: { d: 6 },
  upgrade: { nums: { d: 9 } },
  keywords: [],
  effect: (c) => { c.damage(c.target, c.card.nums.d); },
};

export const CURL_UP = {
  id: 'neutral/curl-up', name: 'Curl Up', companion: 'neutral',
  type: CardType.SKILL, rarity: Rarity.BASIC, cost: 1, target: Target.SELF,
  text: 'Gain {b} Guard.', nums: { b: 5 },
  upgrade: { nums: { b: 8 } },
  effect: (c) => { c.block(c.self, c.card.nums.b); },
};

export const BOO = {
  id: 'neutral/boo', name: 'Boo!', companion: 'neutral',
  type: CardType.SKILL, rarity: Rarity.BASIC, cost: 1, target: Target.ENEMY,
  text: 'Apply {n} [Weak] and {n} [Vulnerable].', nums: { n: 1 },
  effect: (c) => {
    c.applyStatus(c.target, 'weak', c.card.nums.n);
    c.applyStatus(c.target, 'vulnerable', c.card.nums.n);
  },
};

export const FLURRY = {
  id: 'neutral/flurry', name: 'Flurry', companion: 'neutral',
  type: CardType.ATTACK, rarity: Rarity.COMMON, cost: 1, target: Target.ENEMY,
  text: 'Deal {d} damage {m0} times.', nums: { d: 3, m0: 3 },
  effect: (c) => { c.damage(c.target, c.card.nums.d, { hits: c.card.nums.m0 }); },
};

export const RATTLE = {
  id: 'neutral/rattle', name: 'Rattle the Room', companion: 'neutral',
  type: CardType.ATTACK, rarity: Rarity.COMMON, cost: 2, target: Target.ALL_ENEMIES,
  text: 'Deal {d} damage to ALL enemies.', nums: { d: 7 },
  effect: (c) => { c.damageAll(c.card.nums.d); },
};

export const SECOND_WIND = {
  id: 'neutral/second-wind', name: 'Second Wind', companion: 'neutral',
  type: CardType.SKILL, rarity: Rarity.COMMON, cost: 0, target: Target.NONE,
  text: 'Draw {n} Tricks. [Vanish].', nums: { n: 2 }, exhaust: true,
  effect: (c) => { c.draw(c.card.nums.n); },
};

export const BRACE = {
  id: 'neutral/brace', name: 'Brace', companion: 'neutral',
  type: CardType.POWER, rarity: Rarity.COMMON, cost: 1, target: Target.SELF,
  text: 'Gain {n} Strength.', nums: { n: 2 },
  effect: (c) => { c.applyStatus(c.self, 'strength', c.card.nums.n); },
};

export const DUMMY_CARDS = { SCRATCH, CURL_UP, BOO, FLURRY, RATTLE, SECOND_WIND, BRACE };

// ── Enemies ─────────────────────────────────────────────────────────────────

/** Alternates a small attack and a Guard-up. Utterly predictable on purpose. */
export const DUST_BUNNY = {
  id: 'dummy/dust-bunny', name: 'Dust Bunny', region: 'foyer', tier: 'normal',
  hp: [24, 28], silhouette: 'bunny',
  lore: 'It has been under the settee since 1911 and it has opinions.',
  moves: {
    puff: {
      id: 'puff', name: 'Puff', intent: Intent.ATTACK, damage: 6,
      tell: 'It swells up, shedding lint.',
      effect: (c) => c.damage(6),
    },
    settle: {
      id: 'settle', name: 'Settle', intent: Intent.DEFEND, block: 6,
      tell: 'It packs itself denser.',
      effect: (c) => c.block(6),
    },
    scatter: {
      id: 'scatter', name: 'Scatter', intent: Intent.ATTACK, damage: 3, hits: 3,
      tell: 'Dust everywhere.',
      effect: (c) => c.damageMulti(3, 3),
    },
  },
  nextMove: (c) => {
    // Deterministic given (turn, history): the cycle is fixed, no rng at all.
    const n = c.history.length;
    return ['puff', 'settle', 'scatter'][n % 3];
  },
};

/** Applies Weak, then hits. Gives the preview and intent systems something to chew. */
export const COATRACK = {
  id: 'dummy/coatrack', name: 'Coatrack Crawler', region: 'foyer', tier: 'normal',
  hp: [32, 36], silhouette: 'spindly',
  lore: 'Too many legs for a piece of furniture.',
  moves: {
    lunge: {
      id: 'lunge', name: 'Lunge', intent: Intent.ATTACK_BIG, damage: 11,
      tell: 'It leans back on three legs.',
      effect: (c) => c.damage(11),
    },
    drape: {
      id: 'drape', name: 'Drape', intent: Intent.DEBUFF,
      applies: [{ id: 'weak', stacks: 2, to: 'player' }],
      tell: 'A damp coat lands over your head.',
      effect: (c) => c.debuff('weak', 2),
    },
    brace: {
      id: 'brace', name: 'Brace', intent: Intent.DEFEND_BUFF, block: 8,
      applies: [{ id: 'strength', stacks: 1, to: 'self' }],
      effect: (c) => { c.block(8); c.buff('strength', 1); },
    },
  },
  nextMove: (c) => {
    if (c.history.length === 0) return 'drape';
    if (c.usedInARow('lunge', 2)) return 'brace';
    return c.rng.chance(0.6) ? 'lunge' : 'brace';
  },
};

export const DUMMY_ENEMIES = { DUST_BUNNY, COATRACK };

// ── the scenario ────────────────────────────────────────────────────────────

/** The 10-card starter: 5 Scratch, 4 Curl Up, 1 Boo!. */
export function makeDummyDeck() {
  const deck = [];
  for (let i = 0; i < 5; i++) deck.push(SCRATCH);
  for (let i = 0; i < 4; i++) deck.push(CURL_UP);
  deck.push(BOO);
  return deck;
}

/** Raw config, if you want to build the engine yourself. */
export function makeDummySetup(rng = new RNG(1), o = {}) {
  return {
    rng,
    player: {
      name: o.name || 'Samir',
      companion: o.companion || 'neutral',
      maxHp: o.maxHp ?? 70,
      hp: o.hp ?? o.maxHp ?? 70,
      energyMax: o.energyMax ?? 3,
      drawPerTurn: o.drawPerTurn ?? 5,
      deck: o.deck || makeDummyDeck(),
    },
    enemies: o.enemies || [DUST_BUNNY, COATRACK],
    relics: o.relics || [],
  };
}

/**
 * A ready-to-start CombatEngine. Call `await engine.startCombat()` yourself so
 * you can attach listeners first.
 * @param {RNG} rng
 * @returns {CombatEngine}
 */
export function makeDummyCombat(rng = new RNG(1), o = {}) {
  return new CombatEngine({ ...makeDummySetup(rng, o), bus: o.bus || null });
}

/** Convenience for smoke tests: build + start in one call. */
export async function startDummyCombat(rng = new RNG(1), o = {}) {
  const e = makeDummyCombat(rng, o);
  await e.startCombat();
  return e;
}

export { Pile };
export default makeDummyCombat;
