/**
 * Actor model. OWNER: combat-engine.
 *
 * In-fiction naming (schema.js TERMS): hp = "Courage", block = "Guard",
 * energy = "Pluck". The engine keeps the mechanical field names so the code
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
    this.name = o.name;
    this.side = o.side;
    this.slot = o.slot ?? 0;
    this.maxHp = o.maxHp | 0;
    this.hp = Math.min(o.hp ?? o.maxHp, this.maxHp) | 0;
    this.block = o.block | 0;
    /** @type {Map<string, number>} statusId → stacks */
    this.statuses = new Map();
    /** @type {Map<string, Object>} powerId → { id, name, stacks, hooks } */
    this.powers = new Map();
    this.alive = this.hp > 0;
    this.summoned = !!o.summoned;
    this.tier = o.tier || 'normal';
    /** Free-form per-combat scratch space for companion mechanics. Plain data only. */
    this.flags = {};
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
    });
    a.block = this.block;
    a.alive = this.alive;
    a.statuses = new Map(this.statuses);
    a.powers = new Map();
    for (const [k, v] of this.powers) a.powers.set(k, { ...v });
    a.flags = JSON.parse(JSON.stringify(this.flags));
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
      tier: this.tier, summoned: this.summoned,
      damageTakenThisTurn: this.damageTakenThisTurn,
      damageTakenLastTurn: this.damageTakenLastTurn,
      flags: JSON.parse(JSON.stringify(this.flags)),
    };
  }
}

export class Player extends Actor {
  constructor(o) {
    super({ ...o, side: 'player', id: o.id || 'player', slot: 0 });
    this.companion = o.companion || 'neutral';
    this.kid = o.kid || null;
    this.energy = o.energy ?? 0;
    this.energyMax = o.energyMax ?? 3;
    this.drawPerTurn = o.drawPerTurn ?? 5;
    this.handCap = o.handCap ?? 10;
    /** Guard that survives the start-of-turn wipe (Grave Moss Harvest, Barricade shapes). */
    this.keepBlock = 0;
  }

  clone() {
    const p = new Player({
      id: this.id, name: this.name, maxHp: this.maxHp, hp: this.hp,
      companion: this.companion, kid: this.kid, energy: this.energy,
      energyMax: this.energyMax, drawPerTurn: this.drawPerTurn, handCap: this.handCap,
    });
    p.block = this.block;
    p.keepBlock = this.keepBlock;
    p.alive = this.alive;
    p.statuses = new Map(this.statuses);
    p.powers = new Map();
    for (const [k, v] of this.powers) p.powers.set(k, { ...v });
    p.flags = JSON.parse(JSON.stringify(this.flags));
    p.damageTakenThisTurn = this.damageTakenThisTurn;
    p.damageTakenLastTurn = this.damageTakenLastTurn;
    p.hitsTakenThisTurn = this.hitsTakenThisTurn;
    p.unblockedHitsThisTurn = this.unblockedHitsThisTurn;
    return p;
  }

  snapshot() {
    return {
      ...super.snapshot(),
      companion: this.companion, kid: this.kid,
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
    this.turnsAlive = 0;
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
      summoned: this.summoned,
    });
    e.block = this.block;
    e.alive = this.alive;
    e.statuses = new Map(this.statuses);
    e.powers = new Map();
    for (const [k, v] of this.powers) e.powers.set(k, { ...v });
    e.flags = JSON.parse(JSON.stringify(this.flags));
    e.history = this.history.slice();
    e.pendingMove = this.pendingMove;
    e.intent = this.intent ? { ...this.intent } : null;
    e.turnsAlive = this.turnsAlive;
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
      moveId: this.pendingMove?.id || null,
      history: this.history.slice(),
      turnsAlive: this.turnsAlive,
      lore: this.def?.lore || '',
    };
  }
}
