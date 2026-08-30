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

/**
 * Which Kid an allowance belongs to.
 *
 * Several enemy mechanics are worded "the first N damage from EACH player" —
 * Blanket Blob's Cover (nursery §32), Slipper Skitter's Scurry (sleeping
 * quarters §38), the Bedframe Beast under the covers. The chapters give the
 * same reason every time: "This prevents one player from trivially clearing the
 * entire protection mechanic for everyone else." A shared allowance also makes
 * the correct play "let your friend swing first", which is not a decision
 * anybody should be making.
 *
 * `'x'` covers damage with no player behind it (a status, the house itself), so
 * those share one allowance rather than getting a free one each.
 */
export function seatKey(actor) {
  return (actor && actor.side === 'player') ? `s${actor.seat}` : 'x';
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
/**
 * Hit the player this move is aimed at.
 *
 * Deliberately does NOT pass an explicit target: the move's own `partyTarget`
 * decides who it lands on, so a move flagged `partyTarget: 'all'` becomes real
 * co-op AoE without its effect body changing at all. In solo, and for any move
 * that declares nothing, this is exactly the single aimed seat it always was.
 *
 * Enemy attack damage is NOT scaled by party size anywhere — that is the
 * design doc's rule ("Damage values normally remain unchanged. Enemy effects
 * gain multiplayer targeting logic instead.", regions/01-foyer.md §26) and it
 * matches Slay the Spire 2, whose co-op guides say attack damage does not scale
 * and name AoE as the primary co-op danger.
 */
/**
 * Damage the seat(s) this move is aimed at.
 *
 * `opts` is forwarded, so `{ pierce: true }` reaches the damage pipeline. It
 * used to take only `(c, n, hits)` and a fourth argument was dropped in
 * silence — the same shape as the enemy ctx's `block` helper, which swallowed
 * `{ source }` and `{ noJoin }` at four call sites for as long as it existed.
 */
export function hitPlayer(c, n, hits = 1, opts = {}) {
  c.damage(n, { hits, ...opts });
}

/**
 * A phase threshold that means the same thing at every party size.
 *
 * Every boss in this game turned to phase two at an ABSOLUTE Courage number —
 * 100 for the Governess, 92 for the Butler, 160 for the Bedframe Beast — while
 * their POOLS are multiplied by the party curve. So the share of the fight
 * spent in phase two collapsed as the party grew:
 *
 *   share of the pool that is phase two    1p      2p      3p      4p
 *     Governess                          57.1%   26.0%   14.3%   10.0%
 *     Butler                             55.8%   25.3%   19.9%   17.4%
 *     Bedframe Beast                     54.2%   24.7%   13.6%    9.5%
 *
 * At four Kids a two-phase boss is a one-phase boss with a coda: the Governess's
 * three Repair Patches, her Emergency Repair and her entire second move cycle
 * are authored content a party of four essentially never sees. All three read
 * ~55% solo, which is the doc's own shape ("From 280 through 151 Courage" is
 * 46% of the Governess's phase one, nursery §21), so solo was right and only the
 * party was wrong.
 *
 * The doc prescribes exactly this fix, in the same chapter, for a Big Scare with
 * the same problem: *"Courage thresholds remain PROPORTIONAL to maximum Courage.
 * Players therefore tear Patches at 75 / 50 / 25 percent. This keeps the
 * mechanic stable regardless of party size."* (regions/02-nursery.md §34.)
 *
 * Pure, and safe to call from `nextMove`: it reads `maxHp`, which the party
 * curve and the Haunt ladder both set before the first turn and no boss changes
 * afterwards. Passing the solo pair keeps the def readable — "phase two at 100
 * of 175" is still what the file says.
 *
 * @param {object} c        enemy ctx
 * @param {number} soloAt   the authored threshold, at the authored pool
 * @param {number} soloMax  the authored pool
 */
export function phaseAt(c, soloAt, soloMax) {
  const max = (c && c.self && c.self.maxHp) || soloMax;
  if (!soloMax) return soloAt;
  return Math.round(soloAt * (max / soloMax));
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
  // BALANCE 2026-08-20 (round 2): the ladder now has a continuous axis.
  //
  // `hpMul` used to be a flat +8% / +6% applied at level 1 and never again, so
  // Haunt 20 fielded exactly the same Courage as Haunt 1. Everything else in the
  // ladder is per-enemy flags, and counting them across the whole roster there
  // are 35 hooks at `level >= 1`, 13 at `>= 9`, 4 at `>= 10` — and three in
  // total anywhere between 2 and 8. Levels 2 to 8 did essentially nothing.
  // Measured: Haunt 0 -> 5 moved a competent player's region survival only
  // 70% -> 65% and the boss 82.5% -> 76.7%, and even Haunt 10 left the boss at
  // 70%, above the 45-65% band asked of high Haunt.
  //
  // The ramp below is deliberately the gentlest thing that makes every level
  // mean something: +2.5% (ordinary) / +2.7% (Big Scare and boss) per level
  // past the first, uncapped growth capped at double Courage. Courage is only
  // one axis — the per-enemy behavioural flags remain the interesting half.
  // BALANCE 2026-08-20 (round 4): bosses come off the Courage ramp entirely.
  //
  // The round-2 ramp did its job — every level means something now — but for bosses it
  // bought difficulty in the one currency that also buys LENGTH. Measured at Haunt 10 the
  // Butler ran 15.5 turns against an 8-12 band while winning 64.3%: not harder so much as
  // longer. Boss Courage at Haunt 10 was 1.24x, and boss turns track Courage almost
  // linearly, so the ramp alone accounted for the entire overrun.
  //
  // Bosses now hold flat at the design doc's Haunt 1 value (+6%) and never grow again.
  // The difficulty they lose is bought back through `dmgBonus` below, which is
  // Courage-neutral: it makes each boss turn hurt more instead of adding more turns.
  // Ordinary enemies and Big Scares keep their ramp — neither was measured as too long,
  // and their Courage is what wears the player down on the way to the door.
  const RAMP = {
    normal: { base: 1.08, step: 0.022 },
    elite:  { base: 1.06, step: 0.020 },
    boss:   { base: 1.06, step: 0 },
  };
  const { base, step } = RAMP[tierClass] || RAMP.normal;

  // Boss pressure: +1 damage per hit every third Haunt level, applied by each boss's own
  // damage path so it shows up in the intent as well as the hit. Deliberately per-hit, so
  // a multi-hit finisher scales with its own shape.
  const dmgBonus = tierClass === 'boss' ? Math.floor(l / 3) : 0;

  return {
    level: l,
    hpMul: l >= 1 ? Math.min(2, base + step * (l - 1)) : 1,
    counters: {},                       // starting counters, always applied
    flags: dmgBonus ? { dmgBonus } : {}, // behavioural switches, read via flag(c,'key')
    moves: {},                          // per-move stat overrides merged into the MoveDef
    advanced: { counters: {}, flags: {} }, // applied ONLY in advanced-pool encounters
    notes: dmgBonus ? [`Haunt ${l}: every boss attack hits for ${dmgBonus} more per hit.`] : [],
  };
}

/**
 * Per-hit damage a boss adds at this Haunt level. Bosses must apply this in BOTH their
 * `damageFn` and their `effect`, or the intent stops telling the truth.
 */
export function bossDmg(c) { return flag(c, 'dmgBonus', 0) || 0; }

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
    text: 'Does nothing. [Vanish].',
    flavor: 'Someone packed this. Nobody knows why.',
    keywords: ['exhaust'],
    effect() { /* deliberately nothing — it costs a draw, not a Nerve */ },
  },
  {
    /**
     * The Graveyard's Stone of Silence (regions/06 §14).
     *
     * The chapter calls this card "Hush", and Hush is a Companion — CONTRACTS
     * 55, the id namespace is not what the player reads. It is the same card
     * with a surname, which costs nothing and stops a Shadow Ferret player
     * finding their own name on a Status Trick a gravestone handed them.
     */
    id: 'status/graveside-hush', name: 'Graveside Hush', companion: 'status',
    type: 'status', rarity: 'special',
    cost: 1, target: 'self', exhaust: true, nums: { b: 3 },
    text: 'Gain {b} Guard. [Vanish].',
    flavor: 'Nobody has spoken here in a very long time, and the habit is catching.',
    keywords: ['exhaust'],
    effect(ctx) { ctx.block(ctx.self, ctx.card?.nums?.b ?? 3); },
  },
  {
    id: 'drowsy', name: 'Drowsy', companion: 'status', type: 'status', rarity: 'special',
    cost: 1, target: 'self', exhaust: true, nums: { b: 4 },
    text: 'Gain {b} Guard. [Vanish].',
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
    /**
     * BALANCE 2026-08-20: `decay: 'turnEnd'` meant this expired at the end of
     * the very enemy turn it was applied on, so the +25% covered no player turn
     * at all — the boss's advertised "this is your window" was worth nothing,
     * measurably (0.46 Discomposed per Butler fight, and each one blank).
     * It is now cleared by its owner instead, on the turn after the wasted one,
     * so the window is exactly one full player turn. See bosses/butler.js.
     */
    id: 'discomposed', name: 'Discomposed', kind: 'debuff', icon: 'fluster',
    desc: 'Takes 25% more damage and cannot enforce a House Rule.',
    decay: 'never', stacks: false, max: 1,
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
    /**
     * Redirect, done entirely data-side.
     *
     * A status hook cannot reach another actor — `modifyDamageTaken` is handed
     * {attacker, defender, self} and no engine handle — so this cannot deal the damage to
     * the Blob itself. Instead it absorbs on the covered ally and books the absorbed total
     * on that actor; Blanket Blob settles the tab against its own Courage on its next
     * hook (see blanketBlob.settleCover). Net effect matches the design doc: the first N
     * damage each player turn comes off the Blob rather than the ally.
     *
     * `_coverAmount` and the per-turn allowance are stamped by Tuck In.
     */
    hooks: {
      /**
       * PURE. It works out the absorption and parks it; it must not write the
       * allowance.
       *
       * `computeDamage` runs `modifyDamageTaken` for the live number on a Trick
       * in the player's HAND as well as for a real hit — the same trap the
       * Ghoststep note in companions/keywords.js describes. Measured with the
       * spend in here: looking at one Scratch twice showed 0 and then 4, spent
       * the whole 8-point allowance, and billed the Blob 8 Courage it had never
       * absorbed. Then the real swing landed in full.
       *
       * The parked value is consumed by `onIncomingHit` below, which only ever
       * runs on a hit that is really landing. `computeDamage` is called
       * immediately before that dispatch for the same hit, so the last thing
       * parked is always this hit's.
       */
      modifyDamageTaken: (amt, ctx) => {
        const a = ctx && ctx.self;
        if (!a || amt <= 0) return amt;
        const cap = a._coverAmount || 8;
        // Per Kid — nursery §32. Solo is one seat and therefore one allowance,
        // which is the printed rule.
        const key = seatKey(ctx.attacker);
        const used = (a._coverUsedBySeat || {})[key] || 0;
        const take = Math.max(0, Math.min(amt, cap - used));
        a._coverTake = take > 0 ? { key, take } : null;
        return amt - take;
      },
      /** The booking half. The amount has already been reduced above. */
      onIncomingHit: (ctx) => {
        const a = ctx.defender || ctx.owner;
        const pending = a && a._coverTake;
        if (a) a._coverTake = null;
        if (!pending) return;
        const spent = a._coverUsedBySeat || (a._coverUsedBySeat = {});
        spent[pending.key] = (spent[pending.key] || 0) + pending.take;
        a._coverPending = (a._coverPending || 0) + pending.take;
      },
    },
  },
  {
    id: 'scurry', name: 'Scurry', kind: 'buff', icon: 'scurry',
    desc: 'The first Attack from each Kid deals 50% damage. Scurry ends once everyone has swung.',
    decay: 'never', stacks: false, max: 1,
    /**
     * "Scurry applies separately to each player. The first Attack from each
     * player is reduced by 50 percent. One player cannot remove Scurry for the
     * entire team." (docs/design/regions/03-sleeping-quarters.md §38.)
     *
     * The spend is booked in `onAttacked`, which only fires on real resolution
     * — `modifyDamageTaken` also runs for the live numbers on a card in hand,
     * and a Kid hovering a Trick must not use up their halving.
     */
    hooks: {
      modifyDamageTaken: (amt, ctx) => {
        if (ctx.card?.type !== 'attack') return amt;
        const a = ctx.self;
        const spent = (a && a._scurrySpent) || {};
        return spent[seatKey(ctx.attacker)] ? amt : Math.ceil(amt * 0.5);
      },
      onAttacked: (ctx) => {
        if (ctx.card?.type !== 'attack') return;
        const a = ctx.self || ctx.defender;
        if (!a) return;
        const spent = a._scurrySpent || (a._scurrySpent = {});
        spent[seatKey(ctx.attacker)] = true;
        const seats = ctx.e.livingPlayers();
        if (seats.every(pl => spent[seatKey(pl)])) { a._scurrySpent = {}; ctx.remove(); }
      },
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
