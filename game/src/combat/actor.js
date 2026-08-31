/**
 * Actor model. OWNER: combat-engine.
 *
 * In-fiction naming (schema.js TERMS): hp = "Courage", block = "Guard",
 * energy = "Nerve". The engine keeps the mechanical field names so the code
 * stays readable; the UI is responsible for showing the in-fiction words.
 *
 * Statuses and powers are Maps so iteration order is insertion order — which
 * makes hook dispatch deterministic without sorting.
 */

export class Actor {
  /**
   * @param {Object} o
   * @param {string} o.id
   * @param {string} o.name
   * @param {'player'|'enemy'|'ally'} o.side
   * @param {number} o.maxHp
   * @param {number} [o.hp]
   * @param {number} [o.slot]
   */
  constructor(o) {
    this.id = o.id;
    /** Alias — enemy content reads either. */
    this.uid = o.id;
    this.name = o.name;
    this.side = o.side;
    this.slot = o.slot ?? 0;
    this.maxHp = o.maxHp | 0;
    this.hp = Math.min(o.hp ?? o.maxHp, this.maxHp) | 0;
    this.block = o.block | 0;
    /** @type {Map<string, number>} statusId → stacks */
    this.statuses = new Map();
    /** Content data a status was applied with, keyed by status id. Plain data only. */
    this.statusMeta = {};
    /**
     * Statuses applied DURING this actor's own end-of-turn step, which must not
     * spend a turn they have not had yet. See `CombatEngine._decayBucket`.
     * Always empty outside that step, which is why it is not serialised.
     * @type {Set<string>}
     */
    this.freshStatuses = new Set();
    /** @type {Map<string, Object>} powerId → { id, name, stacks, hooks } */
    this.powers = new Map();
    this.alive = this.hp > 0;
    this.summoned = !!o.summoned;
    /** Actor id of whatever called this one up, or null. Set by `engine.summon`. */
    this.summonedBy = o.summonedBy || null;
    this.tier = o.tier || 'normal';
    /** Free-form per-combat scratch space for companion mechanics. Plain data only. */
    this.flags = {};
    /** Per-actor scratch memory for enemy definitions. Survives the whole combat. */
    this.mem = {};
    /** Displayed per-enemy counters (Dust, Momentum, Scare, Resonance…). Plain numbers. */
    this.counters = {};
    /** Damage bookkeeping the UI and several companions read. */
    this.damageTakenThisTurn = 0;
    this.damageTakenLastTurn = 0;
    this.hitsTakenThisTurn = 0;
    this.unblockedHitsThisTurn = 0;
  }

  get dead() { return !this.alive; }
  get hpFrac() { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }

  status(id) { return this.statuses.get(id) || 0; }
  hasStatus(id) { return (this.statuses.get(id) || 0) !== 0; }

  /** Raw setter. Always go through engine.applyStatus so events fire. */
  _setStatus(id, stacks) {
    if (stacks === 0) this.statuses.delete(id);
    else this.statuses.set(id, stacks);
  }

  power(id) { return this.powers.get(id) || null; }

  clone() {
    const a = new Actor({
      id: this.id, name: this.name, side: this.side, slot: this.slot,
      maxHp: this.maxHp, hp: this.hp, summoned: this.summoned, tier: this.tier,
      summonedBy: this.summonedBy,
    });
    a.block = this.block;
    a.alive = this.alive;
    a.statuses = new Map(this.statuses);
    a.statusMeta = JSON.parse(JSON.stringify(this.statusMeta));
    a.freshStatuses = new Set(this.freshStatuses);
    a.powers = new Map();
    for (const [k, v] of this.powers) a.powers.set(k, { ...v });
    a.flags = JSON.parse(JSON.stringify(this.flags));
    a.mem = JSON.parse(JSON.stringify(this.mem));
    a.counters = { ...this.counters };
    a.damageTakenThisTurn = this.damageTakenThisTurn;
    a.damageTakenLastTurn = this.damageTakenLastTurn;
    a.hitsTakenThisTurn = this.hitsTakenThisTurn;
    a.unblockedHitsThisTurn = this.unblockedHitsThisTurn;
    return a;
  }

  snapshot() {
    return {
      id: this.id, name: this.name, side: this.side, slot: this.slot,
      hp: this.hp, maxHp: this.maxHp, block: this.block, alive: this.alive,
      tier: this.tier, summoned: this.summoned, summonedBy: this.summonedBy,
      damageTakenThisTurn: this.damageTakenThisTurn,
      damageTakenLastTurn: this.damageTakenLastTurn,
      flags: JSON.parse(JSON.stringify(this.flags)),
      counters: { ...this.counters },
    };
  }
}

/**
 * A seat's own per-turn bookkeeping.
 *
 * `engine.stats` is the TEAM mirror and stays team-wide on purpose: several
 * enemies key off the whole table ("all team damage during the round
 * contributes" — Nursery §34, Foyer §27). Anything a Kid's own Tricks,
 * Keepsakes or a House Rule reads must come from HERE instead, or one Kid's
 * turn quietly spends another Kid's resources — which is precisely what the
 * Butler's GUESTS DO NOT RUSH did before this existed: two Tricks each and the
 * team was Reprimanded for a rule neither Kid broke.
 *
 * ThisTurn fields reset at the top of each player turn and stay readable
 * through the enemy phase that follows — the same lifecycle as
 * `damageTakenThisTurn`. ThisCombat fields never reset.
 */
export function newTurnStats() {
  return {
    cardsPlayedThisTurn: 0,
    cardsPlayedThisCombat: 0,
    attacksPlayedThisTurn: 0,
    skillsPlayedThisTurn: 0,
    cardsDiscardedThisTurn: 0,
    cardsExhaustedThisTurn: 0,
    cardsExhaustedThisCombat: 0,
    damageDealtThisTurn: 0,
    damageDealtThisCombat: 0,
    damageTakenThisTurn: 0,
    damageTakenThisCombat: 0,
    damageTakenLastEnemyTurn: 0,
  };
}

export class Player extends Actor {
  constructor(o) {
    const seat = o.seat | 0;
    super({ ...o, side: 'player', id: o.id || (seat ? `player${seat}` : 'player'), slot: seat });
    /**
     * Which seat at the table, 0-based. Solo is always seat 0, so nothing about
     * the single-player game changes. In a party the seat is the stable
     * identity: it orders simultaneous resolution, it is what a thrown Snack
     * and a Taunt name, and it is what the network layer will address.
     */
    this.seat = seat;
    /**
     * A fallen player is at 0 Courage: still at the table, still targetable by
     * nothing, unable to act for the rest of the fight, and back at 1 Courage
     * if the team wins. Distinct from `alive` because a fallen player is NOT
     * removed from the party — `players` keeps its length for the whole fight.
     */
    this.fallen = false;
    /**
     * Has this seat ended its turn? Turns are SIMULTANEOUS: everyone plans in
     * the same window and the enemy phase waits for the last seat to be ready.
     * Reset for every seat at the start of each player turn.
     */
    this.ended = false;
    /** @type {Piles|null} this seat's own draw/hand/discard. Set by the engine. */
    this.piles = null;
    this.companion = o.companion || 'neutral';
    this.kid = o.kid || null;
    this.energy = o.energy ?? 0;
    this.energyMax = o.energyMax ?? 3;
    this.drawPerTurn = o.drawPerTurn ?? 5;
    this.handCap = o.handCap ?? 10;
    /** Guard that survives the start-of-turn wipe (Grave Moss Harvest, Barricade shapes). */
    this.keepBlock = 0;
    /** This seat's OWN turn bookkeeping — see newTurnStats(). */
    this.stats = newTurnStats();
    /** {id,type,uid,name}[] — the Tricks THIS seat played this turn, in order. */
    this.playedThisTurn = [];
  }

  clone() {
    const p = new Player({
      id: this.id, name: this.name, maxHp: this.maxHp, hp: this.hp, seat: this.seat,
      companion: this.companion, kid: this.kid, energy: this.energy,
      energyMax: this.energyMax, drawPerTurn: this.drawPerTurn, handCap: this.handCap,
    });
    p.fallen = this.fallen;
    p.ended = this.ended;
    p.block = this.block;
    p.keepBlock = this.keepBlock;
    p.alive = this.alive;
    p.statuses = new Map(this.statuses);
    p.statusMeta = JSON.parse(JSON.stringify(this.statusMeta));
    p.freshStatuses = new Set(this.freshStatuses);
    p.powers = new Map();
    for (const [k, v] of this.powers) p.powers.set(k, { ...v });
    p.flags = JSON.parse(JSON.stringify(this.flags));
    p.mem = JSON.parse(JSON.stringify(this.mem));
    p.counters = { ...this.counters };
    p.damageTakenThisTurn = this.damageTakenThisTurn;
    p.damageTakenLastTurn = this.damageTakenLastTurn;
    p.hitsTakenThisTurn = this.hitsTakenThisTurn;
    p.unblockedHitsThisTurn = this.unblockedHitsThisTurn;
    // The preview clones the engine to resolve a card without committing it, so
    // a seat's own counters have to come along or "your third Trick this turn"
    // previews as your first.
    p.stats = { ...this.stats };
    p.playedThisTurn = this.playedThisTurn.map(x => ({ ...x }));
    return p;
  }

  snapshot() {
    return {
      ...super.snapshot(),
      companion: this.companion, kid: this.kid, seat: this.seat, fallen: this.fallen, ended: this.ended,
      energy: this.energy, energyMax: this.energyMax,
      drawPerTurn: this.drawPerTurn, handCap: this.handCap,
      keepBlock: this.keepBlock,
    };
  }
}

export class Enemy extends Actor {
  /**
   * @param {Object} o
   * @param {import('../data/schema.js').EnemyDef} o.def
   */
  constructor(o) {
    super({ ...o, side: o.side || 'enemy' });
    this.def = o.def;
    this.defId = o.def?.id || o.defId || 'unknown';
    this.silhouette = o.def?.silhouette || o.silhouette || 'blob';
    this.scale = o.def?.scale ?? 1;
    /** @type {string[]} move ids used, oldest first */
    this.history = [];
    /** @type {Object|null} the MoveDef chosen for the coming enemy turn */
    this.pendingMove = null;
    /** @type {Object|null} the display intent derived from pendingMove */
    this.intent = null;
    /** @type {(string|null)[]} the intent queue: plan[0] is the move resolving next */
    this.plan = [];
    /** Positions 0..planLocked-1 were set by the player (Wink) and are not re-derived. */
    this.planLocked = 0;
    /** How many FUTURE positions the player has revealed (0..3). */
    this.previewDepth = 0;
    /** @type {Object[]} plain snapshot of the revealed queue, for the renderer */
    this.queue = [];
    this.turnsAlive = 0;
    /**
     * The seat this enemy has marked, in a party. Held across intent refreshes
     * so the arrow the player reads while planning is the one that resolves;
     * cleared when that seat falls. Always null in solo.
     * @type {string|null}
     */
    this.targetSeatId = null;
  }

  timesUsed(moveId) {
    let n = 0;
    for (const m of this.history) if (m === moveId) n++;
    return n;
  }

  /** True if the enemy just used this move id `n` times in a row. */
  usedInARow(moveId, n) {
    if (this.history.length < n) return false;
    for (let i = 1; i <= n; i++) if (this.history[this.history.length - i] !== moveId) return false;
    return true;
  }

  get lastMove() { return this.history.length ? this.history[this.history.length - 1] : null; }

  clone() {
    const e = new Enemy({
      id: this.id, name: this.name, side: this.side, slot: this.slot,
      maxHp: this.maxHp, hp: this.hp, def: this.def, tier: this.tier,
      summoned: this.summoned, summonedBy: this.summonedBy,
    });
    e.block = this.block;
    e.alive = this.alive;
    e.statuses = new Map(this.statuses);
    e.statusMeta = JSON.parse(JSON.stringify(this.statusMeta));
    e.freshStatuses = new Set(this.freshStatuses);
    e.powers = new Map();
    for (const [k, v] of this.powers) e.powers.set(k, { ...v });
    e.flags = JSON.parse(JSON.stringify(this.flags));
    e.mem = JSON.parse(JSON.stringify(this.mem));
    e.counters = { ...this.counters };
    e.history = this.history.slice();
    e.pendingMove = this.pendingMove;
    e.intent = this.intent ? { ...this.intent } : null;
    e.plan = this.plan.slice();
    e.planLocked = this.planLocked;
    e.previewDepth = this.previewDepth;
    e.queue = this.queue.map(q => ({ ...q }));
    e.turnsAlive = this.turnsAlive;
    e.targetSeatId = this.targetSeatId;
    e.damageTakenThisTurn = this.damageTakenThisTurn;
    e.damageTakenLastTurn = this.damageTakenLastTurn;
    e.hitsTakenThisTurn = this.hitsTakenThisTurn;
    e.unblockedHitsThisTurn = this.unblockedHitsThisTurn;
    return e;
  }

  snapshot() {
    return {
      ...super.snapshot(),
      defId: this.defId,
      silhouette: this.silhouette,
      scale: this.scale,
      intent: this.intent ? { ...this.intent } : null,
      queue: this.queue.map(q => ({ ...q })),
      previewDepth: this.previewDepth,
      moveId: this.pendingMove?.id || null,
      history: this.history.slice(),
      turnsAlive: this.turnsAlive,
      targetSeatId: this.targetSeatId,
      lore: this.def?.lore || '',
    };
  }
}
