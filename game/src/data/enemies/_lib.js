/**
 * Shared helpers for enemy definitions. OWNER: enemies.
 *
 * Everything in `data/enemies/**` and `data/bosses/**` conforms to the EnemyDef /
 * MoveDef / Intent shapes in `data/schema.js`. This module adds the small amount of
 * connective tissue those shapes deliberately leave open:
 *
 *   • pure accessors over EnemyCtx that tolerate a partially-implemented engine,
 *   • the enemy-side statuses this content needs (drop-in StatusDefs),
 *   • the two enemy-generated status Tricks (Clutter, Drowsy),
 *   • the House Rule contract used by Door Greeter and The Butler.
 *
 * ── EnemyCtx surface these files depend on ────────────────────────────────────
 * Read-only:
 *   c.self      actor { id,uid,name,hp,maxHp,block,alive,mem,counters,damageTakenThisTurn }
 *   c.player    actor { hp,maxHp,block }
 *   c.rng       core/rng.js RNG (the ONLY randomness source)
 *   c.history   string[] of move ids this enemy has already resolved, oldest first
 *   c.turn      combat turn number (1-based)
 *   c.field     per-combat shared scratch object (persisted by the engine)
 *   c.cardsPlayedThisTurn  [{id,type}] for the player turn in progress / just ended
 *   c.enemies() living enemies including self      c.allies() living enemies excluding self
 * Mutating (all emit engine events):
 *   c.damage(target,n,{hits})  c.block(actor,n)  c.heal(actor,n)  c.loseHp(actor,n)
 *   c.applyStatus(actor,id,n)  c.removeStatus(actor,id)  c.count(id,actor)  c.has(id,actor)
 *   c.addCard(cardId,pile)     c.summon(enemyId,{hpMul,hp})      c.despawn(actor)
 *   c.setCounter(name,n)       c.counter(name)
 *   c.announceRule(rule)       c.clearRules(sourceId)
 *
 * `damageTakenThisTurn` resets at the START of each player turn, accumulates through it,
 * and is STILL READABLE during the enemy turn that follows. Several enemies key their
 * whole design off that ("was I hit last turn?").
 *
 * ── nextMove purity ───────────────────────────────────────────────────────────
 * `nextMove(c)` MUST be pure: the engine may call it repeatedly to re-render a dynamic
 * intent. Never mutate in nextMove — derive sub-cycle position from `c.history`.
 *
 * ── Dynamic intents ───────────────────────────────────────────────────────────
 * A MoveDef may carry `damageFn(c)`, `hitsFn(c)`, `blockFn(c)`, `intentFn(c)` and
 * `alternatives(c)`. When present the engine MUST prefer them over the static
 * `damage`/`hits`/`block`/`intent` when drawing the intent, and MUST re-render whenever
 * board state changes. That is what makes "hit it now and the big number drops" legible.
 */

import { Intent } from '../schema.js';

// ── pure accessors ───────────────────────────────────────────────────────────

/** Per-enemy-instance scratch memory. Survives the whole combat. */
export function mem(c) {
  const s = c.self || (c.self = {});
  return (s.mem ||= {});
}

/** Read a displayed enemy counter (Dust, Momentum, Scare, Resonance…). */
export function cnt(c, key, dflt = 0) {
  if (typeof c.counter === 'function') { const v = c.counter(key); if (v != null) return v; }
  const s = c.self || {};
  return (s.counters && s.counters[key] != null) ? s.counters[key] : dflt;
}

/** Write a displayed enemy counter. The engine renders these under the HP bar. */
export function setCnt(c, key, v) {
  const s = c.self || (c.self = {});
  (s.counters ||= {})[key] = v;
  if (typeof c.setCounter === 'function') c.setCounter(key, v);
  return v;
}

/** Add to a counter with clamping. Returns the new value. */
export function addCnt(c, key, n, max = Infinity, min = 0) {
  return setCnt(c, key, Math.max(min, Math.min(max, cnt(c, key) + n)));
}

export function isAlive(a) {
  return !!a && a.alive !== false && (a.hp == null || a.hp > 0);
}

/** Living enemies other than self. */
export function allies(c) {
  if (typeof c.allies === 'function') return (c.allies() || []).filter(isAlive);
  const all = typeof c.enemies === 'function' ? (c.enemies() || []) : [];
  return all.filter(e => e !== c.self && isAlive(e));
}

/** Living enemies including self. */
export function board(c) {
  if (typeof c.enemies === 'function') return (c.enemies() || []).filter(isAlive);
  return [c.self].filter(isAlive);
}

/** Damage this actor absorbed during the player turn in progress / just ended. */
export function dmgTaken(c, actor) {
  const a = actor || c.self || {};
  return a.damageTakenThisTurn || 0;
}

/** True if the player hit this enemy at all during the player turn that just ended. */
export function wasHit(c, actor) { return dmgTaken(c, actor) > 0; }

/** Cards the player has played this turn, as [{id,type}]. */
export function played(c) { return c.cardsPlayedThisTurn || []; }

/** Count of player cards of a type played this turn. */
export function playedOfType(c, type) { return played(c).filter(p => p && p.type === type).length; }

/** The move id this enemy resolved most recently, or null. */
export function lastMove(c) { const h = c.history || []; return h.length ? h[h.length - 1] : null; }

/** Cycle helper: element i of list, wrapping. */
export function cyc(list, i) { return list[((i % list.length) + list.length) % list.length]; }

/** How many of the given move ids appear in history — used for pure sub-cycle indexing. */
export function countMoves(c, ids) {
  const set = new Set([].concat(ids));
  return (c.history || []).filter(m => set.has(m)).length;
}

/** Percentage of a damage value, never below 1. Used by Spring Button / Spring Patch. */
export function pct(n, p) { return Math.max(1, Math.round(n * p)); }

/** Fraction of current/max Courage, 0..1. */
export function hpFrac(a) { return (a && a.maxHp) ? (a.hp || 0) / a.maxHp : 1; }

/**
 * Hit the player for `n` damage, `hits` times.
 *
 * The engine's `ctx.damage(target, amount, {hits})` ALREADY loops `hits` times internally
 * (combat/engine.js:1061). Loop here as well and every multi-hit attack resolves hits²
 * times — a 7x3 intent silently dealing 63. Hand the count to the engine exactly once.
 * The intent number is the contract; this function is the only place enemies can break it.
 */
export function hitPlayer(c, n, hits = 1) {
  c.damage?.(c.player, n, { hits });
}

/** Shared per-combat scratch (Darkness, Bed Positions, House Rules…). */
export function field(c) { return (c.field ||= {}); }

/** The intent silhouettes that mean "this is going to hurt". */
export const ATTACK_INTENTS = new Set([
  Intent.ATTACK, Intent.ATTACK_BIG, Intent.ATTACK_DEFEND, Intent.ATTACK_BUFF, Intent.ATTACK_DEBUFF,
]);

/**
 * The intent another enemy is currently telegraphing, as an Intent value.
 * Button Baby and the Patchwork Giant both need to read the board's plans.
 * The engine already computes this to draw the intent widget; the fallback recomputes it
 * from that enemy's own (pure) nextMove, which is exactly how the engine derives it.
 */
export function intentOf(c, actor) {
  if (!actor) return null;
  if (typeof c.intentOf === 'function') return c.intentOf(actor);
  if (actor.intent) return actor.intent.type || actor.intent;
  return null;
}

/** Standard Haunt scaling envelope. Every EnemyDef.hauntScaling(level) returns this shape. */
export function hauntBase(level, tierClass = 'normal') {
  const l = Math.max(0, level | 0);
  return {
    level: l,
    // Haunt 1: ordinary +8% Courage, Big Scares and bosses +6%. It does not compound.
    hpMul: l >= 1 ? (tierClass === 'normal' ? 1.08 : 1.06) : 1,
    counters: {},                       // starting counters, always applied
    flags: {},                          // behavioural switches, read via flag(c,'key')
    moves: {},                          // per-move stat overrides merged into the MoveDef
    advanced: { counters: {}, flags: {} }, // applied ONLY in advanced-pool encounters
    notes: [],
  };
}

/** Read a Haunt behavioural flag the engine merged onto the actor at spawn. */
export function flag(c, key, dflt = undefined) {
  const s = c.self || {};
  if (s.flags && s.flags[key] !== undefined) return s.flags[key];
  return dflt;
}

// ── enemy-generated status Tricks ────────────────────────────────────────────
/**
 * Provided here so the enemy content is drop-in: `data/cards.js` may re-export these,
 * but nothing about the Foyer/Nursery/Sleeping Quarters rosters requires it to.
 */
export const STATUS_TRICK_DEFS = [
  {
    id: 'clutter', name: 'Clutter', companion: 'status', type: 'status', rarity: 'special',
    cost: 0, target: 'none', exhaust: true,
    text: 'Does nothing. [Exhaust]',
    flavor: 'Someone packed this. Nobody knows why.',
    keywords: ['exhaust'],
    effect() { /* deliberately nothing — it costs a draw, not a Nerve */ },
  },
  {
    id: 'drowsy', name: 'Drowsy', companion: 'status', type: 'status', rarity: 'special',
    cost: 1, target: 'self', exhaust: true, nums: { b: 4 },
    text: 'Gain {b} Guard. [Exhaust]',
    flavor: 'Five more minutes.',
    keywords: ['exhaust'],
    effect(ctx) { ctx.block(ctx.self, ctx.card?.nums?.b ?? 4); },
  },
];

// ── statuses this content needs ──────────────────────────────────────────────
/**
 * Drop-in StatusDefs conforming to schema.js. Register with
 * `registerStatuses(ENEMY_STATUSES)` from `data/statuses.js`.
 *
 * RULE OF THUMB used throughout this roster: cross-actor modifiers are statuses
 * (so the engine's pipeline shows them in intents automatically); self-state
 * modifiers (Dust, Momentum, Scare, Cracked, Uncovered…) are computed inside the
 * owning enemy's own `damageFn`, so they need nothing from the engine.
 */
export const ENEMY_STATUSES = [
  {
    id: 'roused', name: 'Roused', kind: 'buff', icon: 'bell-small',
    desc: 'Next damaging attack deals {n} more damage, then Roused is spent.',
    decay: 'never', stacks: true, consumeAfterAttack: true,
    hooks: {
      modifyDamageDealt: (amt, ctx) => amt + 2 * (ctx.stacks || 1),
      onDealtDamage: (ctx) => ctx.remove(),
    },
  },
  {
    id: 'frightened', name: 'Frightened', kind: 'debuff', icon: 'fright',
    desc: 'The next Attack you play deals 25% less damage, then Frightened is removed.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, ctx) => (ctx.card?.type === 'attack' ? Math.floor(amt * 0.75) : amt),
      onCardPlayed: (ctx) => { if (ctx.card?.type === 'attack') ctx.remove(); },
    },
  },
  {
    id: 'discomposed', name: 'Discomposed', kind: 'debuff', icon: 'fluster',
    desc: 'Takes 25% more damage and cannot enforce a House Rule.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.25) },
  },
  {
    id: 'button-brass', name: 'Brass Button', kind: 'buff', icon: 'button-brass',
    desc: 'Damaging attacks deal 2 additional damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageDealt: (amt) => amt + 2 },
  },
  {
    id: 'button-pillow', name: 'Pillow Button', kind: 'buff', icon: 'button-pillow',
    desc: 'Gains 4 Guard at the beginning of its turn.',
    decay: 'never', stacks: false, max: 1,
    hooks: { onTurnStart: (ctx) => ctx.block(ctx.actor, 4) },
  },
  {
    id: 'button-spring', name: 'Spring Button', kind: 'buff', icon: 'button-spring',
    desc: 'Its next attack occurs twice at 60% damage each, then the Button falls off.',
    decay: 'never', stacks: false, max: 1,
    // Split is applied by the attacking enemy's own move resolution (see splitAttack()).
  },
  {
    id: 'covered', name: 'Covered', kind: 'buff', icon: 'blanket',
    desc: 'The first {n} damage this enemy would take each turn hits its Blanket Blob instead.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    id: 'scurry', name: 'Scurry', kind: 'buff', icon: 'scurry',
    desc: 'The first Attack targeting it this turn deals 50% damage, then Scurry ends.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, ctx) => (ctx.card?.type === 'attack' ? Math.ceil(amt * 0.5) : amt),
      onAttacked: (ctx) => { if (ctx.card?.type === 'attack') ctx.remove(); },
    },
  },
  {
    id: 'hidden', name: 'Hidden', kind: 'buff', icon: 'hidden',
    desc: 'Cannot be targeted by Attack Tricks. Area damage and effects that reach Hidden enemies still work.',
    decay: 'never', stacks: false, max: 1,
    untargetableBy: ['attack'],
  },
  {
    id: 'darkness', name: 'Darkness', kind: 'buff', icon: 'darkness',
    desc: 'The room is dark. This enemy deals {n} additional attack damage.',
    decay: 'never', stacks: true,
    hooks: { modifyDamageDealt: (amt, ctx) => amt + (ctx.stacks || 2) },
  },
  {
    id: 'seam-pinch', name: 'Pinched Seam', kind: 'debuff', icon: 'needle',
    desc: 'The next time you gain Guard, you gain 3 less. Then this is removed.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, ctx) => { ctx.remove(); return Math.max(0, amt - 3); },
    },
  },
  {
    id: 'smothered', name: 'Smothered', kind: 'debuff', icon: 'smother',
    desc: 'Draw {n} fewer Tricks next turn. Your draw never falls below 3.',
    decay: 'turnStart', stacks: true,
  },
];

/**
 * Spring Button / Spring Patch split. Returns [perHitDamage, hits] for an attack that
 * would otherwise deal `dmg` in `hits` hits. Applied AFTER flat damage bonuses.
 */
export function splitAttack(dmg, hits, split) {
  return split ? [pct(dmg, 0.6), hits * 2] : [dmg, hits];
}

// ── House Rules (Door Greeter → The Butler) ──────────────────────────────────
/**
 * A House Rule never forbids an action. It attaches a consequence.
 *
 * @typedef {Object} HouseRule
 * @property {string}  id, name, text
 * @property {'cardPlayed'|'turnEnd'} when   which engine hook evaluates `broken`
 * @property {boolean} once                  at most one Reprimand per player turn
 * @property {(rc:RuleCtx)=>boolean} broken  RuleCtx: {cardsPlayedThisTurn, card, prevCard,
 *                                           playerBlock, damageDealtThisTurn}
 * @property {(c:EnemyCtx)=>void} onBreak    the Reprimand
 */
export function announce(c, rule) {
  if (typeof c.announceRule === 'function') c.announceRule(rule);
  field(c).activeRule = rule;         // mirrored so the renderer can always find it
  mem(c).rule = rule.id;
}

export { Intent };
