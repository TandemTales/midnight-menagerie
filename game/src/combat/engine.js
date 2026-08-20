/**
 * CombatEngine. OWNER: combat-engine.
 *
 * Headless and deterministic. No DOM, no THREE, no Math.random, no setTimeout.
 * `src/scenes/combat.js` renders what this reports and never decides a rule.
 *
 * Public API (CONTRACTS.md §"Combat engine public API"):
 *   new CombatEngine({ player, enemies, rng, relics, hooks })
 *   engine.state                                  plain serialisable snapshot
 *   engine.startCombat()      -> Promise<void>
 *   engine.canPlay(uid, tid)  -> { ok, reason }
 *   engine.playCard(uid, tid) -> Promise<Event[]>
 *   engine.endTurn()          -> Promise<Event[]>
 *   engine.preview(uid, tid)  -> { damage, block, statuses, killsTarget, … }
 *   engine.on(event, fn)      -> unsubscribe fn
 *
 * ── TURN ORDER (authoritative; docs/NOTES.md repeats it) ────────────────────
 *
 * startCombat()
 *   1  combat:start
 *   2  relic/power onCombatStart hooks
 *   3  deck shuffled into draw (rng), Innate cards lifted to the top
 *   4  enemies roll Courage, onSpawn, choose their first move → intent
 *   5  beginPlayerTurn(1)
 *
 * beginPlayerTurn()
 *   1  turn++ ; phase='player' ; turn:start {actor:'player'}
 *   2  Guard wiped (keepBlock survives)                     → block:lose
 *   3  START-OF-TURN STATUSES: 'turnStart' decay, then onTurnStart hooks
 *      (Dread ticks here: lose Courage, then lose 1 Dread)
 *   4  countdown timers tick, fire at 0                     → timer / timer:fire
 *   5  DRAW to hand (drawPerTurn + modifyDraw)              → draw / shuffle
 *   6  ENERGY refilled to max (+ modifyEnergyGain)          → energy
 *   7  INTENTS refreshed for every living enemy             → intent
 *
 * endTurn()
 *   1  turn:end {actor:'player'}
 *   2  HAND RESOLUTION in hand order: Ethereal → exhaust, Retain → stays,
 *      everything else → discard
 *   3  END-OF-TURN STATUSES for the player: onTurnEnd hooks (Regen heals),
 *      then 'turnEnd' decay (Weak/Vulnerable/Frail/Faint lose a stack)
 *   4  playerTurnEnd timers tick
 *   5  ENEMY ACTIONS IN SLOT ORDER, one enemy at a time:
 *        a turn:start {actor:enemyId}
 *        b that enemy's Guard wiped
 *        c its start-of-turn statuses tick (its own Dread)
 *        d its move resolves
 *        e turn:end {actor:enemyId}
 *   6  ENEMY END-OF-TURN STATUSES: onTurnEnd hooks then 'turnEnd' decay,
 *      for every living enemy, in slot order
 *   7  every living enemy chooses its next move          → intent
 *   8  beginPlayerTurn()
 *
 * Nothing in here is time-based. The renderer consumes the returned Event[] and
 * animates at whatever pace it likes; the engine has already finished.
 */

import { RNG } from '../core/rng.js';
import { EV } from './events.js';
import { Hooks } from './hooks.js';
import { Player, Enemy } from './actor.js';
import { Card, Piles } from './piles.js';
import { applyDamage, previewDamageValue } from './damage.js';
import { getStatus, FRAIL_MULT } from './statuses.js';
import { buildIntent, chooseMove, refreshIntents, intentFamily } from './intents.js';
import { previewCard } from './preview.js';
import { Pile, CardType, Target } from '../data/schema.js';

const MAX_LOG = 400;

export class CombatEngine {
  /**
   * @param {Object} cfg
   * @param {Object} cfg.player   { name, maxHp, hp, energyMax, drawPerTurn, handCap, companion, kid, deck:[CardDef|{def,upgraded}] }
   * @param {Array}  cfg.enemies  EnemyDef[] | [{def, hp, slot}]
   * @param {RNG}    cfg.rng      REQUIRED for determinism. Never defaulted to a clock seed silently.
   * @param {Array}  [cfg.relics] RelicDef[]
   * @param {Array}  [cfg.hooks]  [{name, fn}] extra hooks registered at construction
   * @param {Object} [cfg.bus]    optional core/bus.js — events mirror as `combat:<type>`
   */
  constructor(cfg = {}) {
    this._cfg = cfg;
    this.rng = cfg.rng instanceof RNG ? cfg.rng : new RNG(cfg.seed ?? 1);
    this.seed = this.rng.seed;
    this.relics = (cfg.relics || []).slice();
    this.bus = cfg.bus || null;
    this.isPreview = !!cfg.isPreview;

    this.hooks = new Hooks(this);
    for (const h of (cfg.hooks || [])) this.hooks.add(h.name, h.fn, h);

    this.turn = 0;
    this.phase = 'setup';          // 'setup' | 'player' | 'enemy' | 'over'
    this.over = false;
    this.victory = false;
    this.started = false;

    /** @type {Map<string, Object>} per-combat resource tracks */
    this.counters = new Map();
    /** @type {Object[]} countdown triggers */
    this.timers = [];
    /** @type {Object[]} board objects (Plants, Plots, Pumpkins, Graves) */
    this.objects = [];
    /** @type {Enemy[]} */
    this.allies = [];

    this.stats = {
      cardsPlayedThisTurn: 0,
      cardsPlayedThisCombat: 0,
      attacksPlayedThisTurn: 0,
      skillsPlayedThisTurn: 0,
      cardsDiscardedThisTurn: 0,
      cardsExhaustedThisTurn: 0,
      cardsExhaustedThisCombat: 0,
      damageDealtThisTurn: 0,
      damageTakenThisTurn: 0,
      damageTakenLastEnemyTurn: 0,
      turnsTaken: 0,
      livesSpentThisTurn: 0,
    };

    this._listeners = new Map();
    this._seq = 0;
    this._collect = null;
    this._dirty = true;
    this._stateCache = null;
    this.log = [];
    this._entityUid = 0;
    this._objectUid = 0;
    this._timerUid = 0;

    this.piles = new Piles(this);

    if (!cfg._bare) this._build(cfg);
  }

  // ── construction ──────────────────────────────────────────────────────────

  _build(cfg) {
    const p = cfg.player || {};
    this.player = new Player({
      id: p.id || 'player',
      name: p.name || 'Kid',
      maxHp: p.maxHp ?? 70,
      hp: p.hp ?? p.maxHp ?? 70,
      energyMax: p.energyMax ?? 3,
      drawPerTurn: p.drawPerTurn ?? 5,
      handCap: p.handCap ?? 10,
      companion: p.companion || 'neutral',
      kid: p.kid || null,
    });

    /** @type {Enemy[]} */
    this.enemies = [];
    let slot = 0;
    for (const raw of (cfg.enemies || [])) {
      this.enemies.push(this._makeEnemy(raw, slot++));
    }

    // Build the runtime deck. Deck order is irrelevant — startCombat shuffles.
    this._deckSource = (p.deck || cfg.deck || []);
    for (const entry of this._deckSource) {
      const def = entry.def || entry;
      const card = new Card(def, { upgraded: !!entry.upgraded, meta: entry.meta });
      this.piles.draw.push(card);
      card.pile = Pile.DRAW;
    }
  }

  /**
   * `raw` is either an EnemyDef itself or a wrapper `{ def, hp?, id? }`.
   * Only the wrapper form may override hp/id — an EnemyDef's own `hp` is the
   * inclusive ROLL RANGE `[min,max]`, never a value.
   */
  _makeEnemy(raw, slot) {
    const def = raw.def || raw;
    const wrapped = raw !== def;
    const range = def.hp || [10, 10];
    const hp = (wrapped && typeof raw.hp === 'number')
      ? raw.hp
      : (Array.isArray(range) ? this.rng.range(range[0], range[1]) : (range | 0));
    return new Enemy({
      id: (wrapped && raw.id) || `e${slot}`,
      name: def.name || 'Something',
      def, slot,
      maxHp: hp, hp,
      tier: def.tier || 'normal',
      side: 'enemy',
    });
  }

  // ── events ────────────────────────────────────────────────────────────────

  /** @returns {() => void} unsubscribe */
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }
  off(type, fn) { this._listeners.get(type)?.delete(fn); }

  _emit(type, payload) {
    const ev = { type, seq: ++this._seq, turn: this.turn, ...payload };
    this._dirty = true;
    if (this._collect) this._collect.push(ev);
    if (!this.isPreview) {
      this.log.push(ev);
      if (this.log.length > MAX_LOG) this.log.shift();
    }
    const s = this._listeners.get(type);
    if (s) for (const fn of [...s]) { try { fn(ev); } catch (e) { console.error(`[combat:${type}]`, e); } }
    const w = this._listeners.get('*');
    if (w) for (const fn of [...w]) { try { fn(ev); } catch (e) { console.error('[combat:*]', e); } }
    if (this.bus && !this.isPreview) this.bus.emit(`combat:${type}`, ev);
    return ev;
  }

  /** Run `fn` while capturing every event it causes. Returns the events. */
  _capture(fn) {
    const prev = this._collect;
    const list = [];
    this._collect = list;
    try { fn(); } finally { this._collect = prev; }
    if (prev) prev.push(...list);
    return list;
  }

  say(text, tone = 'info') { this._emit(EV.LOG, { text, tone }); }

  // ── state snapshot ────────────────────────────────────────────────────────

  /**
   * Plain, structuredClone-able snapshot. The renderer reads ONLY this and the
   * event stream. Rebuilt lazily — reading it every frame with no state change
   * allocates nothing.
   */
  get state() {
    if (!this._dirty && this._stateCache) return this._stateCache;
    const s = {
      turn: this.turn,
      phase: this.phase,
      over: this.over,
      victory: this.victory,
      seed: this.seed,
      player: {
        ...this.player.snapshot(),
        statuses: this.statusList(this.player),
      },
      enemies: this.enemies.map(e => ({ ...e.snapshot(), statuses: this.statusList(e) })),
      allies: this.allies.map(a => ({ ...a.snapshot(), statuses: this.statusList(a) })),
      piles: {
        draw: this.piles.draw.map(c => this.cardSnap(c)),
        hand: this.piles.hand.map(c => this.cardSnap(c)),
        discard: this.piles.discard.map(c => this.cardSnap(c)),
        exhaust: this.piles.exhaust.map(c => this.cardSnap(c)),
        limbo: this.piles.limbo.map(c => this.cardSnap(c)),
        stash: this.piles.stash.map(c => this.cardSnap(c)),
      },
      counts: this.piles.snapshotCounts(),
      stashCap: this.piles.stashCap,
      counters: [...this.counters.values()].map(c => ({
        id: c.id, name: c.name, value: c.value, min: c.min, max: c.max,
        ownerId: c.ownerId, icon: c.icon, desc: c.desc, focusable: !!c.focusable,
      })),
      timers: this.timers.map(t => ({
        id: t.id, label: t.label, turnsLeft: t.turnsLeft, ownerId: t.ownerId, when: t.when,
      })),
      objects: this.objects.map(o => ({
        id: o.id, kind: o.kind, slot: o.slot, name: o.name,
        data: JSON.parse(JSON.stringify(o.data || {})),
      })),
      relics: this.relics.map(r => ({ id: r.id, name: r.name, counter: r.counter ?? null, icon: r.icon || r.id })),
      stats: { ...this.stats },
    };
    this._stateCache = s;
    this._dirty = false;
    return s;
  }

  statusList(actor) {
    const out = [];
    for (const [id, stacks] of actor.statuses) {
      if (stacks === 0) continue;
      const d = getStatus(id);
      out.push({
        id, stacks, name: d.name, kind: d.kind, icon: d.icon || id,
        desc: String(d.desc || '').replace(/\{n\}/g, String(stacks)),
        decay: d.decay, showStacks: d.stacks !== false,
      });
    }
    for (const [id, p] of actor.powers) {
      out.push({
        id, stacks: p.stacks ?? 1, name: p.name || id, kind: 'buff',
        icon: p.icon || id, desc: p.desc || '', decay: 'never', power: true, showStacks: (p.stacks ?? 1) > 1,
      });
    }
    return out;
  }

  /**
   * Plain snapshot of a runtime card.
   * `display` carries the live-modified numbers so card text can be recoloured:
   * `{ value, base, dir:'up'|'down'|'same' }`.
   */
  cardSnap(card, targetId = null) {
    const cost = this.costOf(card);
    const target = targetId ? this.actor(targetId) : this.firstLivingEnemy();
    const display = {};
    if (card.nums) {
      for (const k of Object.keys(card.nums)) {
        const base = card.nums[k];
        if (typeof base !== 'number') { display[k] = { value: base, base, dir: 'same' }; continue; }
        let value = base;
        if (k === 'd') value = previewDamageValue(this, this.player, target, base, { kind: 'attack' });
        else if (k === 'b') value = this.previewBlockValue(this.player, base);
        display[k] = { value, base, dir: value > base ? 'up' : value < base ? 'down' : 'same' };
      }
    }
    return {
      uid: card.uid, id: card.id, name: card.name, type: card.type, rarity: card.rarity,
      companion: card.companion, target: card.target, text: card.text, flavor: card.flavor,
      art: card.art, keywords: card.keywords.slice(),
      cost, baseCost: card.baseCost, costModified: cost !== Math.max(0, card.baseCost) && card.baseCost >= 0,
      upgraded: card.upgraded, nums: { ...card.nums }, display,
      exhaust: card.exhaust, ethereal: card.ethereal, innate: card.innate,
      retain: card.retain || card.retainThisTurn, unplayable: card.unplayable,
      pile: card.pile, meta: JSON.parse(JSON.stringify(card.meta || {})),
      playable: (card.pile === Pile.HAND || card.pile === Pile.STASH)
        ? this.canPlay(card.uid, targetId).ok : false,
    };
  }

  // ── lookups ───────────────────────────────────────────────────────────────

  actor(id) {
    if (!id) return null;
    if (this.player && this.player.id === id) return this.player;
    return this.enemies.find(e => e.id === id) || this.allies.find(a => a.id === id) || null;
  }
  card(uid) { return this.piles.find(uid); }
  statusDef(id) { return getStatus(id); }
  livingEnemies() { return this.enemies.filter(e => e.alive); }
  firstLivingEnemy() { return this.enemies.find(e => e.alive) || null; }
  randomEnemy() {
    const alive = this.livingEnemies();
    return alive.length ? alive[this.rng.int(alive.length)] : null;
  }
  handCap() { return this.hooks.reduce('modifyHandCap', this.player.handCap, {}, this.hooks.actorHooks(this.player, 'modifyHandCap')); }

  /** Who an enemy is aiming at. Ally summons can pull aggro by setting `taunt`. */
  intentTargetFor(enemy) {
    const taunting = this.allies.find(a => a.alive && a.flags.taunt);
    return taunting || this.player;
  }

  // ── cost ──────────────────────────────────────────────────────────────────

  /** Effective cost after dynamicCost and modifyCardCost hooks. -1 = X, -2 = unplayable. */
  costOf(card) {
    if (card.unplayable) return -2;
    if (typeof card.def.dynamicCost === 'function') {
      const c = card.def.dynamicCost(this.ctxFor(card, null));
      if (typeof c === 'number') return Math.max(0, c);
    }
    const raw = card.rawCost();
    if (raw < 0) return raw;
    return Math.max(0, this.hooks.reduce('modifyCardCost', raw, { card }, this.hooks.actorHooks(this.player, 'modifyCardCost')));
  }

  /**
   * @param {'turn'|'combat'|'permanent'} scope
   * `turn` overrides clear at the start of your next turn; `combat` lasts the fight.
   */
  setCardCost(card, value, scope = 'turn', reason = 'effect') {
    const before = this.costOf(card);
    if (scope === 'turn') card.costOverrideTurn = value;
    else { card.costOverrideCombat = value; card.costOverrideTurn = null; }
    const after = this.costOf(card);
    if (after !== before) this._emit(EV.CARD_COST, { cardUid: card.uid, before, after, scope, reason });
    return after;
  }

  modifyCardCost(card, delta, scope = 'turn', reason = 'effect') {
    const before = this.costOf(card);
    if (scope === 'turn') card.costTurnDelta += delta;
    else card.costCombatDelta += delta;
    const after = this.costOf(card);
    if (after !== before) this._emit(EV.CARD_COST, { cardUid: card.uid, before, after, scope, reason });
    return after;
  }

  /** Per-card metadata that survives shuffles (Stretch, Enchantments, Slobbered). */
  setCardMeta(card, key, value) {
    const before = card.meta[key];
    card.meta[key] = value;
    this._emit(EV.CARD_META, { cardUid: card.uid, key, before: before ?? null, after: value });
    return value;
  }

  // ── resources: Courage, Guard, Pluck ──────────────────────────────────────

  /** Post-Dexterity, post-Frail Guard value. Pure; used by previews and intents. */
  previewBlockValue(actor, amount, opts = {}) {
    if (amount <= 0) return 0;
    let v = amount;
    // block.step1 — Dexterity, additive
    if (opts.fromCard !== false) v += actor.status('dexterity') || 0;
    // block.step2 — Frail, ×0.75 floored
    if (opts.fromCard !== false && actor.status('frail') > 0) v = Math.floor(v * FRAIL_MULT);
    // step3 — everything else
    v = this.hooks.reduce('modifyBlockGain', v, { actor, source: opts.source || null, fromCard: opts.fromCard !== false },
      this.hooks.actorHooks(actor, 'modifyBlockGain'));
    return Math.max(0, Math.floor(v));
  }

  gainBlock(actor, amount, opts = {}) {
    if (!actor || !actor.alive) return 0;
    const gain = this.previewBlockValue(actor, amount, opts);
    if (gain <= 0 && amount > 0) {
      this._emit(EV.BLOCK, { actorId: actor.id, amount: 0, before: actor.block, after: actor.block, reason: opts.reason || 'card' });
      return 0;
    }
    const before = actor.block;
    actor.block += gain;
    this._emit(EV.BLOCK, { actorId: actor.id, amount: gain, before, after: actor.block, reason: opts.reason || 'card' });
    this.hooks.dispatch('onBlockGained', { actor, amount: gain }, this.hooks.actorHooks(actor, 'onBlockGained'));
    return gain;
  }

  loseBlock(actor, amount, reason = 'effect') {
    const before = actor.block;
    actor.block = Math.max(0, actor.block - amount);
    if (actor.block !== before) this._emit(EV.BLOCK_LOSE, { actorId: actor.id, before, after: actor.block, reason });
    return before - actor.block;
  }

  /** The one entry point for damage. See damage.js for the ordered pipeline. */
  dealDamage(o) { return applyDamage(this, o); }

  /** Direct Courage loss — ignores Guard and every attack modifier. */
  loseHp(actor, amount, reason = 'effect') {
    if (!actor || !actor.alive || amount <= 0) return 0;
    return applyDamage(this, {
      attacker: null, defender: actor, amount, kind: 'loss',
      ignoreBlock: true, skipModifiers: true, cause: reason,
    })?.hpLoss ?? 0;
  }

  heal(actor, amount, reason = 'effect') {
    if (!actor || !actor.alive || amount <= 0) return 0;
    const before = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(amount));
    const healed = actor.hp - before;
    if (healed > 0) {
      this._emit(EV.HEAL, { actorId: actor.id, amount: healed, before, after: actor.hp, reason });
      this.hooks.dispatch('onHeal', { actor, amount: healed }, this.hooks.actorHooks(actor, 'onHeal'));
    }
    return healed;
  }

  addMaxHp(actor, delta) {
    const before = actor.maxHp;
    actor.maxHp = Math.max(1, actor.maxHp + delta);
    if (delta > 0) actor.hp += delta;
    actor.hp = Math.min(actor.hp, actor.maxHp);
    this._emit(EV.HP_MAX, { actorId: actor.id, before, after: actor.maxHp, delta });
  }

  gainEnergy(n, reason = 'effect') {
    if (n === 0) return 0;
    const add = n > 0
      ? this.hooks.reduce('modifyEnergyGain', n, { reason }, this.hooks.actorHooks(this.player, 'modifyEnergyGain'))
      : n;
    const before = this.player.energy;
    this.player.energy = Math.max(0, this.player.energy + add);
    this._emit(EV.ENERGY, {
      before, after: this.player.energy, delta: this.player.energy - before,
      max: this.player.energyMax, reason,
    });
    return this.player.energy - before;
  }
  loseEnergy(n, reason = 'effect') { return this.gainEnergy(-Math.abs(n), reason); }

  setEnergy(v, reason = 'refill') {
    const before = this.player.energy;
    this.player.energy = Math.max(0, v | 0);
    this._emit(EV.ENERGY, { before, after: this.player.energy, delta: this.player.energy - before, max: this.player.energyMax, reason });
  }

  // ── statuses ──────────────────────────────────────────────────────────────

  /**
   * Apply (delta>0) or strip (delta<0) stacks.
   * Charm eats one incoming debuff application per stack — that check lives here
   * rather than in a hook because a hook cannot cleanly veto.
   */
  applyStatus(actor, id, delta = 1, opts = {}) {
    if (!actor || delta === 0) return 0;
    if (!actor.alive && delta > 0) return 0;
    const def = getStatus(id);

    if (delta > 0 && def.kind === 'debuff' && !opts.ignoreCharm && actor.status('charm') > 0) {
      this.applyStatus(actor, 'charm', -1, { reason: 'consumed', ignoreCharm: true });
      this._statusTrigger(actor, 'charm', actor.status('charm'), 'blocked');
      return 0;
    }

    const before = actor.status(id);
    let after = before + delta;
    if (def.max != null) after = Math.min(after, def.max);
    if (def.stacks === false && after > 1) after = 1;
    after = Math.max(0, after);
    if (after === before) return 0;

    actor._setStatus(id, after);
    this._emit(EV.STATUS, {
      actorId: actor.id, id, name: def.name, kind: def.kind, icon: def.icon || id,
      before, after, delta: after - before,
      sourceId: opts.sourceId || null, reason: opts.reason || 'effect',
      desc: String(def.desc || '').replace(/\{n\}/g, String(after)),
    });

    const payload = { actor, id, delta: after - before, stacks: after, def };
    if (after > before) {
      def.hooks?.onApply?.({ ...payload, e: this, engine: this, owner: actor });
      this.hooks.dispatch('onStatusApplied', payload);
    } else if (after === 0) {
      def.hooks?.onRemove?.({ ...payload, e: this, engine: this, owner: actor });
    }

    this.refreshIntents('status');
    return after - before;
  }

  removeStatus(actor, id, reason = 'effect') {
    const cur = actor.status(id);
    if (cur) this.applyStatus(actor, id, -cur, { reason });
  }

  /** Remove every debuff (Midnight Grooming, boss phase transitions). */
  cleanse(actor, reason = 'cleanse') {
    for (const id of [...actor.statuses.keys()]) {
      if (getStatus(id).kind === 'debuff') this.removeStatus(actor, id, reason);
    }
  }

  _statusTrigger(actor, id, stacks, effect, amount = 0) {
    this._emit(EV.STATUS_TRIGGER, { actorId: actor.id, id, name: getStatus(id).name, stacks, effect, amount });
  }

  addPower(actor, power) {
    const existing = actor.powers.get(power.id);
    if (existing) { existing.stacks = (existing.stacks || 1) + (power.stacks || 1); }
    else actor.powers.set(power.id, { stacks: 1, ...power });
    this._emit(EV.STATUS, {
      actorId: actor.id, id: power.id, name: power.name || power.id, kind: 'buff',
      icon: power.icon || power.id, before: existing ? existing.stacks - (power.stacks || 1) : 0,
      after: actor.powers.get(power.id).stacks, delta: power.stacks || 1,
      reason: 'power', desc: power.desc || '', power: true,
    });
    this.refreshIntents('power');
    return actor.powers.get(power.id);
  }

  // ── counters (companion resource tracks) ──────────────────────────────────

  /**
   * Declare a per-combat resource track. Nine Lives, Glow, Height, Loose Bones,
   * Globs, Loyalty, Compost, Web, Open Eyes, Plump… all use this.
   * `focusable:true` makes Focus boost gains to it.
   */
  defineCounter(o) {
    const c = {
      id: o.id, name: o.name || o.id, icon: o.icon || o.id, desc: o.desc || '',
      min: o.min ?? 0, max: o.max ?? 99, value: o.start ?? 0,
      ownerId: o.ownerId || this.player.id, focusable: !!o.focusable,
      onChange: o.onChange || null, resetEachTurn: !!o.resetEachTurn,
    };
    c.value = Math.max(c.min, Math.min(c.max, c.value));
    this.counters.set(c.id, c);
    this._dirty = true;
    return c;
  }

  counter(id) { return this.counters.get(id)?.value ?? 0; }
  counterDef(id) { return this.counters.get(id) || null; }
  counterMax(id) { return this.counters.get(id)?.max ?? 0; }
  /** True if `n` can actually be spent — used by `canPlay` for Life costs. */
  canSpend(id, n) { return this.counter(id) >= n; }

  /** @returns {number} the actual delta applied (0 if capped/floored) */
  addCounter(id, delta, reason = 'effect') {
    const c = this.counters.get(id);
    if (!c || delta === 0) return 0;
    let d = delta;
    if (d > 0) {
      d = this.hooks.reduce('modifyCounterGain', d, { id, owner: c.ownerId, focusable: c.focusable },
        this.hooks.actorHooks(this.actor(c.ownerId) || this.player, 'modifyCounterGain'));
    }
    const before = c.value;
    c.value = Math.max(c.min, Math.min(c.max, c.value + d));
    const applied = c.value - before;
    if (applied === 0) { this._dirty = true; return 0; }
    this._emit(EV.COUNTER, {
      ownerId: c.ownerId, id, name: c.name, before, after: c.value,
      delta: applied, min: c.min, max: c.max, reason,
    });
    c.onChange?.({ e: this, engine: this, counter: c, delta: applied, before, after: c.value });
    this.hooks.dispatch('onCounterChanged', { id, delta: applied, value: c.value, counter: c });
    return applied;
  }

  setCounter(id, value, reason = 'effect') {
    const c = this.counters.get(id);
    if (!c) return 0;
    return this.addCounter(id, Math.max(c.min, Math.min(c.max, value)) - c.value, reason);
  }

  /** Spend from a counter. Returns false and changes nothing if there isn't enough. */
  spendCounter(id, n, reason = 'spend') {
    if (!this.canSpend(id, n)) return false;
    this.addCounter(id, -n, reason);
    return true;
  }

  // ── countdown triggers ────────────────────────────────────────────────────

  /**
   * Fire `run(ctx)` after `turns` of the given phase.
   * @param {Object} o { turns, run, label, ownerId, when:'playerTurnStart'|'playerTurnEnd'|'enemyTurnEnd', repeat }
   * Wisp's Linger, Wink's Set Tricks, "at the start of your 3rd turn" all use this.
   */
  schedule(o) {
    const t = {
      id: o.id || `t${++this._timerUid}`,
      label: o.label || o.id || 'countdown',
      turnsLeft: Math.max(0, o.turns ?? 1),
      when: o.when || 'playerTurnStart',
      ownerId: o.ownerId || this.player.id,
      run: o.run,
      repeat: o.repeat ?? 0,
      data: o.data || {},
      cardUid: o.cardUid || null,
    };
    this.timers.push(t);
    this._emit(EV.TIMER, { id: t.id, label: t.label, ownerId: t.ownerId, before: null, after: t.turnsLeft, reason: 'scheduled' });
    return t;
  }

  /** "At the start of your Nth turn" — absolute turn number. */
  at(turnNumber, run, label = 'scheduled') {
    return this.schedule({ turns: Math.max(1, turnNumber - this.turn), run, label, when: 'playerTurnStart' });
  }

  /** Change a timer's remaining count (Wisp's Hasten / Delay). */
  adjustTimer(id, delta, reason = 'hasten') {
    const t = this.timers.find(x => x.id === id);
    if (!t) return null;
    const before = t.turnsLeft;
    t.turnsLeft = Math.max(0, t.turnsLeft + delta);
    this._emit(EV.TIMER, { id, label: t.label, ownerId: t.ownerId, before, after: t.turnsLeft, reason });
    if (t.turnsLeft === 0) this._fireTimers([t], reason);
    return t;
  }

  cancelTimer(id) {
    const i = this.timers.findIndex(t => t.id === id);
    if (i >= 0) this.timers.splice(i, 1);
  }

  _tickTimers(when) {
    const due = [];
    for (const t of this.timers) {
      if (t.when !== when) continue;
      const before = t.turnsLeft;
      t.turnsLeft = Math.max(0, t.turnsLeft - 1);
      this._emit(EV.TIMER, { id: t.id, label: t.label, ownerId: t.ownerId, before, after: t.turnsLeft, reason: 'tick' });
      if (t.turnsLeft === 0) due.push(t);
    }
    // All timers that hit 0 on the same tick resolve as one batch — Wisp's
    // Convergence depends on that being true.
    if (due.length) this._fireTimers(due, 'tick');
  }

  _fireTimers(due, reason) {
    const batch = due.slice();
    for (const t of batch) {
      const i = this.timers.indexOf(t);
      if (i < 0) continue;
      if (t.repeat > 0) { t.turnsLeft = t.repeat; }
      else this.timers.splice(i, 1);
      this._emit(EV.TIMER_FIRE, { id: t.id, label: t.label, ownerId: t.ownerId, batchSize: batch.length, reason });
      try {
        t.run?.({ e: this, engine: this, timer: t, batch, batchSize: batch.length, data: t.data });
      } catch (err) { console.error(`[combat] timer ${t.id} threw`, err); }
    }
  }

  // ── board objects (Patch, Garden, Plots, Graves) ──────────────────────────

  addObject(o) {
    const obj = {
      id: o.id || `o${++this._objectUid}`,
      kind: o.kind, name: o.name || o.kind, slot: o.slot ?? this.objects.length,
      data: o.data || {}, hooks: o.hooks || null, stacks: o.stacks ?? 1,
    };
    this.objects.push(obj);
    this._emit(EV.OBJECT_ADD, { id: obj.id, kind: obj.kind, slot: obj.slot, name: obj.name, data: { ...obj.data } });
    return obj;
  }
  updateObject(id, patch) {
    const o = this.objects.find(x => x.id === id);
    if (!o) return null;
    const before = { ...o.data };
    Object.assign(o.data, patch);
    this._emit(EV.OBJECT_UPDATE, { id, kind: o.kind, slot: o.slot, data: { ...o.data }, before });
    return o;
  }
  removeObject(id, reason = 'effect') {
    const i = this.objects.findIndex(x => x.id === id);
    if (i < 0) return false;
    const o = this.objects[i];
    this.objects.splice(i, 1);
    this._emit(EV.OBJECT_REMOVE, { id, kind: o.kind, slot: o.slot, reason });
    return true;
  }
  objectsOfKind(kind) { return this.objects.filter(o => o.kind === kind); }

  // ── summons ───────────────────────────────────────────────────────────────

  /**
   * Put a new actor into an enemy-like slot. `side:'ally'` gives the player a
   * minion the enemies can hit; `side:'enemy'` reinforces the other team.
   */
  summon(def, o = {}) {
    const side = o.side || 'enemy';
    const list = side === 'ally' ? this.allies : this.enemies;
    const slot = o.slot ?? list.length;
    const id = o.id || `${side === 'ally' ? 'a' : 's'}${++this._entityUid}`;
    const e = this._makeEnemy({ def, hp: o.hp, id }, slot);
    e.side = side;
    e.summoned = true;
    if (o.maxSlots && list.length >= o.maxSlots) return null;
    list.push(e);
    this._emit(EV.SUMMON, {
      entity: { id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, slot: e.slot, side, tier: e.tier, silhouette: e.silhouette },
      sourceId: o.sourceId || null,
    });
    def.onSpawn?.(this.enemyCtx(e, null));
    if (side === 'enemy') chooseMove(this, e, 'summon');
    return e;
  }

  removeEntity(actor, reason = 'effect') {
    const list = actor.side === 'ally' ? this.allies : this.enemies;
    const i = list.indexOf(actor);
    if (i < 0) return false;
    list.splice(i, 1);
    this._emit(EV.ENTITY_REMOVE, { id: actor.id, side: actor.side, slot: actor.slot, reason });
    return true;
  }

  // ── death ─────────────────────────────────────────────────────────────────

  _checkDeath(actor, killerId) {
    if (!actor.alive || actor.hp > 0) return false;
    actor.alive = false;
    actor.hp = 0;
    actor.block = 0;
    actor.intent = null;
    this._emit(EV.DEATH, { actorId: actor.id, name: actor.name, killerId: killerId || null, side: actor.side, slot: actor.slot });
    this.hooks.dispatch('onDeath', { actor, killerId });
    if (actor.def?.onDeath) { try { actor.def.onDeath(this.enemyCtx(actor, null)); } catch (e) { console.error(e); } }
    if (actor === this.player) this._endCombat(false);
    else if (actor.side === 'enemy' && this.livingEnemies().length === 0) this._endCombat(true);
    return true;
  }

  _endCombat(victory) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    this.phase = 'over';
    this.hooks.dispatch('onCombatEnd', { victory });
    this._emit(EV.COMBAT_END, { victory, turn: this.turn, playerHp: this.player.hp });
  }

  // ── intents ───────────────────────────────────────────────────────────────

  refreshIntents(reason = 'refresh') { if (this.started && !this.over) refreshIntents(this, reason); }

  /** EnemyCtx handed to nextMove / effect / onSpawn / onDeath. */
  enemyCtx(enemy, move) {
    const e = this;
    return {
      e, engine: e, self: enemy, enemy, move,
      rng: e.rng, turn: e.turn,
      player: e.player, target: e.intentTargetFor(enemy),
      enemies: e.enemies, allies: e.allies,
      history: enemy.history, lastMove: enemy.lastMove,
      timesUsed: (id) => enemy.timesUsed(id),
      usedInARow: (id, n) => enemy.usedInARow(id, n),
      livingEnemies: () => e.livingEnemies(),
      damage: (amount, opts = {}) => e.dealDamage({
        attacker: enemy, defender: opts.target || e.intentTargetFor(enemy),
        amount, kind: 'attack', ...opts,
      }),
      damageMulti: (amount, hits, opts = {}) => {
        for (let i = 0; i < hits; i++) {
          if (e.over) break;
          e.dealDamage({
            attacker: enemy, defender: opts.target || e.intentTargetFor(enemy),
            amount, kind: 'attack', hits, hitIndex: i, ...opts,
          });
        }
      },
      block: (amount, who) => e.gainBlock(who || enemy, amount, { fromCard: false, reason: 'enemy' }),
      applyStatus: (who, id, n) => e.applyStatus(who || e.player, id, n, { sourceId: enemy.id }),
      buff: (id, n) => e.applyStatus(enemy, id, n, { sourceId: enemy.id }),
      debuff: (id, n) => e.applyStatus(e.intentTargetFor(enemy), id, n, { sourceId: enemy.id }),
      heal: (amount, who) => e.heal(who || enemy, amount, 'enemy'),
      addCard: (def, pile, opts) => e.addCard(def, pile, opts),
      summon: (def, opts) => e.summon(def, { ...opts, sourceId: enemy.id }),
      count: (id, who) => (who || enemy).status(id),
      has: (id, who) => (who || enemy).hasStatus(id),
      say: (text, tone) => e.say(text, tone),
    };
  }

  // ── card helpers ──────────────────────────────────────────────────────────

  /** Create a new card instance and put it somewhere. Returns the Card(s). */
  addCard(def, pile = Pile.HAND, opts = {}) {
    const n = opts.count ?? 1;
    const made = [];
    for (let i = 0; i < n; i++) {
      const card = new Card(def, { upgraded: !!opts.upgraded, meta: opts.meta });
      if (opts.cost !== undefined) card.costOverrideCombat = opts.cost;
      if (opts.exhaust) card.exhaust = true;
      if (opts.ethereal) card.ethereal = true;
      if (opts.retain) card.retain = true;
      let dest = pile;
      if (dest === Pile.HAND && this.piles.hand.length >= this.handCap()) dest = Pile.DISCARD;
      const idx = this.piles._push(card, dest, opts.position ?? (dest === Pile.DRAW ? 'top' : 'bottom'));
      this._emit(EV.CARD_ADD, {
        cardUid: card.uid, card: this.cardSnap(card), pile: dest,
        position: idx, reason: opts.reason || 'effect',
      });
      made.push(card);
    }
    return n === 1 ? made[0] : made;
  }

  moveCard(card, pile, opts = {}) { return this.piles.move(card, pile, opts); }

  drawCards(n, reason = 'draw') {
    const want = this.hooks.reduce('modifyDraw', n, { reason }, this.hooks.actorHooks(this.player, 'modifyDraw'));
    return this.piles.drawN(Math.max(0, want), reason);
  }

  discardCard(card, reason = 'effect') {
    const from = this.piles._pull(card);
    this.piles._push(card, Pile.DISCARD, 'bottom');
    this.stats.cardsDiscardedThisTurn++;
    this._emit(EV.DISCARD, {
      cardUid: card.uid, card: this.cardSnap(card), from, to: Pile.DISCARD, reason,
      handSize: this.piles.hand.length, discardCount: this.piles.discard.length,
    });
    this.hooks.dispatch('onCardDiscarded', { card, reason });
    return card;
  }

  exhaustCard(card, reason = 'effect') {
    const from = this.piles._pull(card);
    this.piles._push(card, Pile.EXHAUST, 'bottom');
    this.stats.cardsExhaustedThisTurn++;
    this.stats.cardsExhaustedThisCombat++;
    this._emit(EV.EXHAUST, {
      cardUid: card.uid, card: this.cardSnap(card), from, reason,
      exhaustCount: this.piles.exhaust.length,
    });
    this.hooks.dispatch('onCardExhausted', { card, reason });
    return card;
  }

  /** Discard n cards from hand. Deterministic: random picks come from engine.rng. */
  discardRandom(n, reason = 'effect', exclude = null) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const pool = this.piles.hand.filter(c => c !== exclude);
      if (!pool.length) break;
      out.push(this.discardCard(pool[this.rng.int(pool.length)], reason));
    }
    return out;
  }

  // ── ctx handed to card effects (schema.js §Ctx — exact) ───────────────────

  ctxFor(card, target, x = 0) {
    const e = this;
    const self = this.player;
    return {
      e, engine: e, self, player: self, target, card, x,
      rng: e.rng, turn: e.turn,

      // damage / health
      damage: (t, amount, opts = {}) => {
        const d = t || target;
        if (!d || !d.alive) return null;
        const hits = opts.hits ?? 1;
        let last = null;
        for (let i = 0; i < hits; i++) {
          if (!d.alive || e.over) break;
          last = e.dealDamage({ attacker: self, defender: d, amount, kind: 'attack', card, hits, hitIndex: i, ...opts });
        }
        return last;
      },
      damageAll: (amount, opts = {}) => {
        const hits = opts.hits ?? 1;
        for (let i = 0; i < hits; i++) {
          for (const en of e.livingEnemies()) {
            if (e.over) break;
            e.dealDamage({ attacker: self, defender: en, amount, kind: 'attack', card, hits, hitIndex: i, ...opts });
          }
        }
      },
      loseHp: (t, amount) => e.loseHp(t || self, amount, card ? card.id : 'effect'),
      block: (actor, amount) => e.gainBlock(actor || self, amount, { source: card, reason: 'card' }),
      heal: (actor, amount) => e.heal(actor || self, amount, card ? card.id : 'effect'),
      applyStatus: (actor, id, stacks) => e.applyStatus(actor || self, id, stacks, { sourceId: self.id, reason: card ? card.id : 'effect' }),
      removeStatus: (actor, id) => e.removeStatus(actor || self, id),

      // cards
      draw: (n) => e.drawCards(n, card ? card.id : 'effect'),
      discard: (n, opts = {}) => {
        if (opts.cards) return opts.cards.map(c => e.discardCard(c, card ? card.id : 'effect'));
        if (opts.all) return e.piles.hand.slice().map(c => e.discardCard(c, card ? card.id : 'effect'));
        return e.discardRandom(n, card ? card.id : 'effect', card);
      },
      exhaust: (c) => e.exhaustCard(c || card, card ? card.id : 'effect'),
      addCard: (def, pile, opts) => e.addCard(def, pile || Pile.HAND, opts),
      moveCard: (c, pile, opts) => e.moveCard(c, pile, opts),
      setCost: (c, v, scope) => e.setCardCost(c || card, v, scope || 'turn'),
      modifyCost: (c, d, scope) => e.modifyCardCost(c || card, d, scope || 'turn'),
      meta: (key, value) => value === undefined ? card.meta[key] : e.setCardMeta(card, key, value),
      retainCard: (c) => { (c || card).retainThisTurn = true; e._dirty = true; },

      // energy
      gainEnergy: (n) => e.gainEnergy(n, card ? card.id : 'effect'),
      loseEnergy: (n) => e.loseEnergy(n, card ? card.id : 'effect'),

      // queries
      count: (statusId, actor) => (actor || self).status(statusId),
      has: (statusId, actor) => (actor || self).hasStatus(statusId),
      forEachEnemy: (fn) => e.livingEnemies().forEach((en, i) => fn(en, i)),
      randomEnemy: () => e.randomEnemy(),
      livingEnemies: () => e.livingEnemies(),
      enemies: e.enemies,
      allies: e.allies,
      hand: e.piles.hand,
      drawPile: e.piles.draw,
      discardPile: e.piles.discard,
      exhaustPile: e.piles.exhaust,
      limbo: e.piles.limbo,
      stash: e.piles.stash,

      // companion systems
      counter: (id) => e.counter(id),
      addCounter: (id, n) => e.addCounter(id, n, card ? card.id : 'effect'),
      spendCounter: (id, n) => e.spendCounter(id, n, card ? card.id : 'effect'),
      canSpend: (id, n) => e.canSpend(id, n),
      defineCounter: (o) => e.defineCounter(o),
      schedule: (o) => e.schedule({ ...o, cardUid: card?.uid }),
      adjustTimer: (id, d) => e.adjustTimer(id, d),
      addObject: (o) => e.addObject(o),
      updateObject: (id, patch) => e.updateObject(id, patch),
      removeObject: (id) => e.removeObject(id),
      objectsOfKind: (kind) => e.objectsOfKind(kind),
      summon: (def, opts) => e.summon(def, { ...opts, sourceId: self.id }),
      addPower: (p, actor) => e.addPower(actor || self, p),
      addHook: (name, fn, opts) => e.hooks.add(name, fn, opts),

      // stats the Companions read
      cardsPlayedThisTurn: () => e.stats.cardsPlayedThisTurn,
      cardsPlayedThisCombat: () => e.stats.cardsPlayedThisCombat,
      exhaustedThisCombat: () => e.stats.cardsExhaustedThisCombat,
      damageTakenLastEnemyTurn: () => e.stats.damageTakenLastEnemyTurn,
      untouched: () => e.stats.damageTakenLastEnemyTurn === 0,
      n: (key) => card?.nums?.[key] ?? 0,
      upgraded: !!card?.upgraded,
      say: (text, tone) => e.say(text, tone),
    };
  }

  // ── the public API ────────────────────────────────────────────────────────

  /** @returns {Promise<void>} */
  async startCombat() { this._startCombat(); }

  _startCombat() {
    if (this.started) return [];
    return this._capture(() => {
      this.started = true;
      this.phase = 'setup';
      this._emit(EV.COMBAT_START, {
        seed: this.seed, playerId: this.player.id,
        enemies: this.enemies.map(e => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, slot: e.slot, tier: e.tier })),
      });

      this.hooks.dispatch('onCombatStart', {});

      // shuffle, then lift Innate cards to the top in deck order
      this.piles.draw = this.rng.shuffle(this.piles.draw);
      const innate = this.piles.draw.filter(c => c.innate);
      if (innate.length) {
        this.piles.draw = innate.concat(this.piles.draw.filter(c => !c.innate));
      }
      this._emit(EV.SHUFFLE, {
        into: Pile.DRAW, from: 'deck', count: this.piles.draw.length,
        order: this.piles.draw.map(c => c.uid), reason: 'combatStart',
      });

      for (const en of this.enemies) {
        en.def?.onSpawn?.(this.enemyCtx(en, null));
      }
      for (const en of this.enemies) {
        if (en.alive) chooseMove(this, en, 'combatStart');
      }

      this._beginPlayerTurn();
    });
  }

  _beginPlayerTurn() {
    if (this.over) return;
    this.turn++;
    this.phase = 'player';
    this.stats.turnsTaken = this.turn;
    this.stats.cardsPlayedThisTurn = 0;
    this.stats.attacksPlayedThisTurn = 0;
    this.stats.skillsPlayedThisTurn = 0;
    this.stats.cardsDiscardedThisTurn = 0;
    this.stats.cardsExhaustedThisTurn = 0;
    this.stats.damageDealtThisTurn = 0;
    this.stats.damageTakenThisTurn = 0;
    this.stats.livesSpentThisTurn = 0;
    this.player.damageTakenLastTurn = this.player.damageTakenThisTurn;
    this.player.damageTakenThisTurn = 0;
    this.player.hitsTakenThisTurn = 0;
    this.player.unblockedHitsThisTurn = 0;

    // turn-scoped card cost changes expire
    for (const c of this.piles.all()) { c.costTurnDelta = 0; c.costOverrideTurn = null; }

    this._emit(EV.PHASE, { phase: 'player', turn: this.turn });
    this._emit(EV.TURN_START, { actor: 'player', actorId: this.player.id, turn: this.turn, side: 'player' });

    // 2 — Guard wipe
    const keep = Math.min(this.player.keepBlock, this.player.block);
    if (this.player.block > keep) {
      const before = this.player.block;
      this.player.block = keep;
      this._emit(EV.BLOCK_LOSE, { actorId: this.player.id, before, after: keep, reason: 'turnStart' });
    }
    this.player.keepBlock = 0;

    // 3 — start-of-turn statuses
    this._tickStatuses(this.player, 'turnStart');

    // 4 — countdowns
    this._tickTimers('playerTurnStart');
    for (const c of this.counters.values()) if (c.resetEachTurn) this.setCounter(c.id, c.min, 'turnStart');

    if (this.over) return;

    // 5 — draw
    this.drawCards(this.player.drawPerTurn, 'turnStart');

    // 6 — energy
    this.setEnergy(this.player.energyMax, 'turnStart');

    // 7 — intents
    this.refreshIntents('turnStart');
  }

  /**
   * Statuses tick for `actor`.
   * phase 'turnStart': onTurnStart hooks (Dread), then 'turnStart' decay.
   * phase 'turnEnd':   onTurnEnd hooks (Regen), then 'turnEnd' decay.
   */
  _tickStatuses(actor, phase) {
    const hookName = phase === 'turnStart' ? 'onTurnStart' : 'onTurnEnd';
    this.hooks.dispatch(hookName, { actor, turn: this.turn, side: actor.side },
      this.hooks.actorHooks(actor, hookName));
    if (!actor.alive) return;
    for (const [id, stacks] of [...actor.statuses]) {
      if (stacks <= 0) continue;
      const def = getStatus(id);
      if (def.decay === phase) this.applyStatus(actor, id, -1, { reason: 'decay', ignoreCharm: true });
    }
  }

  /** @returns {{ok:boolean, reason:string}} */
  canPlay(cardUid, targetId = null) {
    if (this.over) return { ok: false, reason: 'Combat is over.' };
    if (this.phase !== 'player') return { ok: false, reason: 'Not your turn.' };
    const card = this.card(cardUid);
    if (!card) return { ok: false, reason: 'No such Trick.' };
    if (card.pile !== Pile.HAND && card.pile !== Pile.STASH) return { ok: false, reason: 'That Trick is not in your hand.' };
    if (card.unplayable) return { ok: false, reason: 'This Trick cannot be played.' };

    if (card.type === CardType.ATTACK && this.player.hasStatus('entangle')) {
      return { ok: false, reason: 'Entangled — you cannot play Attacks this turn.' };
    }

    const cost = this.costOf(card);
    const need = cost === -1 ? 0 : cost;
    if (this.player.energy < need) return { ok: false, reason: `Not enough Pluck (needs ${need}).` };

    if (card.target === Target.ENEMY) {
      const t = this.actor(targetId);
      if (targetId !== null && (!t || !t.alive || t.side === 'player')) return { ok: false, reason: 'Choose a target.' };
      if (targetId === null && this.livingEnemies().length === 0) return { ok: false, reason: 'Nothing to target.' };
    }
    if (card.target === Target.ALL_ENEMIES && this.livingEnemies().length === 0) {
      return { ok: false, reason: 'Nothing to target.' };
    }

    if (typeof card.def.playable === 'function') {
      const t = this.actor(targetId) || this.firstLivingEnemy();
      if (!card.def.playable(this.ctxFor(card, t))) return { ok: false, reason: card.def.playableReason || 'Conditions are not met.' };
    }

    if (this.hooks.any('vetoPlay', { card }, this.hooks.actorHooks(this.player, 'vetoPlay'))) {
      return { ok: false, reason: 'Something is stopping you.' };
    }
    return { ok: true, reason: '' };
  }

  /** @returns {Promise<Event[]>} */
  async playCard(cardUid, targetId = null, opts = {}) {
    const r = this._playCard(cardUid, targetId, opts);
    if (r.pending) { await r.pending; }
    return r.events;
  }

  /**
   * Synchronous core so preview.js can replay it exactly. Returns
   * `{ events, pending }` — `pending` is only set when a card effect returned
   * a promise (discouraged; such a card cannot be fully previewed).
   */
  _playCard(cardUid, targetId = null, opts = {}) {
    const check = this.canPlay(cardUid, targetId);
    if (!check.ok) {
      const events = this._capture(() => this._emit(EV.CARD_INVALID, { cardUid, targetId, reason: check.reason }));
      return { events, pending: null };
    }
    const card = this.card(cardUid);
    const target = this.actor(targetId) || (card.target === Target.ENEMY ? this.firstLivingEnemy() : null);

    let pending = null;
    const events = this._capture(() => {
      const cost = this.costOf(card);
      const x = cost === -1 ? this.player.energy : 0;
      const spend = cost === -1 ? this.player.energy : cost;
      const energyBefore = this.player.energy;

      // 1. leave the hand immediately so effects that look at the hand are right
      this.piles._pull(card);
      this.piles._push(card, Pile.LIMBO, 'bottom');

      // 2. pay
      if (spend > 0) this.gainEnergy(-spend, 'play');

      // 3. announce
      this.stats.cardsPlayedThisTurn++;
      this.stats.cardsPlayedThisCombat++;
      if (card.type === CardType.ATTACK) this.stats.attacksPlayedThisTurn++;
      if (card.type === CardType.SKILL) this.stats.skillsPlayedThisTurn++;
      this._emit(EV.CARD_PLAY, {
        cardUid: card.uid, card: this.cardSnap(card, targetId), targetId: target ? target.id : null,
        cost: spend, energyBefore, energyAfter: this.player.energy,
        cardsPlayedThisTurn: this.stats.cardsPlayedThisTurn,
      });

      // 4. resolve
      const ctx = this.ctxFor(card, target, x);
      ctx.exhaustSelf = () => { card._exhaustAfterPlay = true; };
      let ret = null;
      try { ret = card.def.effect?.(ctx); }
      catch (err) { console.error(`[combat] card ${card.id} effect threw`, err); }

      const finish = () => {
        this.hooks.dispatch('onCardPlayed', { card, target, index: this.stats.cardsPlayedThisTurn });
        if (card.type === CardType.POWER) {
          // Powers leave play entirely once resolved. They are parked in limbo
          // tagged `meta.zone='power'` rather than in exhaust, so effects that
          // count Vanished Tricks do not silently count every Power too.
          this.piles._pull(card);
          card.meta.zone = 'power';
          this.piles._push(card, Pile.LIMBO, 'bottom');
          this._emit(EV.CARD_RESOLVED, { cardUid: card.uid, card: this.cardSnap(card), destination: 'power' });
        } else if (this.piles.pileOf(card) === Pile.LIMBO) {
          const toExhaust = card.exhaust || card._exhaustAfterPlay || opts.exhaust;
          this.piles._pull(card);
          if (toExhaust) {
            this.piles._push(card, Pile.EXHAUST, 'bottom');
            this.stats.cardsExhaustedThisTurn++;
            this.stats.cardsExhaustedThisCombat++;
            this._emit(EV.EXHAUST, {
              cardUid: card.uid, card: this.cardSnap(card), from: Pile.LIMBO,
              reason: 'played', exhaustCount: this.piles.exhaust.length,
            });
            this.hooks.dispatch('onCardExhausted', { card, reason: 'played' });
          } else {
            this.piles._push(card, Pile.DISCARD, 'bottom');
            this._emit(EV.DISCARD, {
              cardUid: card.uid, card: this.cardSnap(card), from: Pile.LIMBO, to: Pile.DISCARD,
              reason: 'played', handSize: this.piles.hand.length, discardCount: this.piles.discard.length,
            });
          }
          this._emit(EV.CARD_RESOLVED, { cardUid: card.uid, card: this.cardSnap(card), destination: card.pile });
        } else {
          // an effect moved the card somewhere itself (Stash, draw pile, hand)
          this._emit(EV.CARD_RESOLVED, { cardUid: card.uid, card: this.cardSnap(card), destination: this.piles.pileOf(card) });
        }
        card._exhaustAfterPlay = false;
        this.refreshIntents('cardPlayed');
        if (!this.over && this.livingEnemies().length === 0) this._endCombat(true);
      };

      if (ret && typeof ret.then === 'function') {
        pending = ret.then(() => this._capture(finish));
      } else {
        finish();
      }
    });
    return { events, pending };
  }

  /** @returns {Promise<Event[]>} */
  async endTurn() { return this._endTurn(); }

  _endTurn() {
    if (this.over || this.phase !== 'player') return [];
    return this._capture(() => {
      // 1
      this._emit(EV.TURN_END, { actor: 'player', actorId: this.player.id, turn: this.turn, side: 'player' });

      // 2 — hand resolution
      for (const card of [...this.piles.hand]) {
        if (card.ethereal) { this.exhaustCard(card, 'ethereal'); continue; }
        if (card.retain || card.retainThisTurn) { card.retainThisTurn = false; continue; }
        this.discardCard(card, 'endTurn');
      }

      // 3 — player end-of-turn statuses
      this._tickStatuses(this.player, 'turnEnd');
      if (this.over) return;

      // 4 — timers
      this._tickTimers('playerTurnEnd');
      if (this.over) return;

      // 5 — enemy actions, slot order
      this.phase = 'enemy';
      this._emit(EV.PHASE, { phase: 'enemy', turn: this.turn });
      const before = this.player.damageTakenThisTurn;

      for (const en of [...this.enemies]) {
        if (this.over) break;
        if (!en.alive) continue;
        en.turnsAlive++;
        this._emit(EV.TURN_START, { actor: en.id, actorId: en.id, turn: this.turn, side: 'enemy' });

        if (en.block > 0) {
          const b = en.block;
          en.block = 0;
          this._emit(EV.BLOCK_LOSE, { actorId: en.id, before: b, after: 0, reason: 'turnStart' });
        }
        en.damageTakenLastTurn = en.damageTakenThisTurn;
        en.damageTakenThisTurn = 0;
        en.hitsTakenThisTurn = 0;

        this._tickStatuses(en, 'turnStart');
        if (!en.alive || this.over) { if (en.alive) this._emit(EV.TURN_END, { actor: en.id, actorId: en.id, turn: this.turn, side: 'enemy' }); continue; }

        const move = en.pendingMove;
        if (move) {
          en.history.push(move.id);
          try { move.effect?.(this.enemyCtx(en, move)); }
          catch (err) { console.error(`[combat] enemy ${en.defId} move ${move.id} threw`, err); }
        }
        this._emit(EV.TURN_END, { actor: en.id, actorId: en.id, turn: this.turn, side: 'enemy' });
      }

      this.stats.damageTakenLastEnemyTurn = this.player.damageTakenThisTurn - before;
      if (this.over) return;

      // 6 — enemy end-of-turn statuses
      for (const en of [...this.enemies]) {
        if (!en.alive) continue;
        this._tickStatuses(en, 'turnEnd');
      }
      this._tickTimers('enemyTurnEnd');
      if (this.over) return;

      // 7 — next intents
      for (const en of this.enemies) if (en.alive) chooseMove(this, en, 'turnEnd');

      // 8
      this._beginPlayerTurn();
    });
  }

  /**
   * Exactly what will happen if this card is played right now.
   * Implemented by replaying the card on a full clone of the engine seeded with
   * the identical RNG state, so it cannot drift from resolution.
   */
  preview(cardUid, targetId = null, opts = undefined) { return previewCard(this, cardUid, targetId, opts); }

  /** Post-modifier damage this card would do to this target, per hit. */
  cardDamageFor(cardUid, targetId, key = 'd') {
    const card = this.card(cardUid);
    if (!card) return 0;
    const t = this.actor(targetId) || this.firstLivingEnemy();
    return previewDamageValue(this, this.player, t, card.nums?.[key] ?? 0, { kind: 'attack' });
  }

  // ── cloning (for preview) ─────────────────────────────────────────────────

  snapshotRuntime() {
    return {
      turn: this.turn, phase: this.phase, over: this.over, victory: this.victory,
      started: this.started, seq: this._seq,
      stats: { ...this.stats },
      rng: this.rng.snapshot(),
      player: this.player,
      enemies: this.enemies,
      allies: this.allies,
      piles: {
        draw: this.piles.draw, hand: this.piles.hand, discard: this.piles.discard,
        exhaust: this.piles.exhaust, limbo: this.piles.limbo, stash: this.piles.stash,
      },
      stashCap: this.piles.stashCap,
      counters: this.counters,
      timers: this.timers,
      objects: this.objects,
      hooks: this.hooks.snapshot(),
      entityUid: this._entityUid, objectUid: this._objectUid, timerUid: this._timerUid,
    };
  }

  /** Deep-ish clone: runtime state copied, definitions shared by reference. */
  clone() {
    const c = new CombatEngine({ ..._cfgLite(this._cfg), _bare: true, rng: new RNG(this.seed), isPreview: true });
    c.relics = this.relics;
    const s = this.snapshotRuntime();
    c.turn = s.turn; c.phase = s.phase; c.over = s.over; c.victory = s.victory;
    c.started = s.started; c._seq = s.seq;
    c.stats = { ...s.stats };
    c.rng = new RNG(this.seed);
    c.rng.restore(s.rng);
    c.player = s.player.clone();
    c.enemies = s.enemies.map(e => e.clone());
    c.allies = s.allies.map(e => e.clone());

    const map = new Map();
    const cloneList = (arr, pile) => arr.map(card => {
      const cc = card.clone();
      cc.pile = pile;
      map.set(card.uid, cc);
      return cc;
    });
    c.piles.draw = cloneList(s.piles.draw, Pile.DRAW);
    c.piles.hand = cloneList(s.piles.hand, Pile.HAND);
    c.piles.discard = cloneList(s.piles.discard, Pile.DISCARD);
    c.piles.exhaust = cloneList(s.piles.exhaust, Pile.EXHAUST);
    c.piles.limbo = cloneList(s.piles.limbo, Pile.LIMBO);
    c.piles.stash = cloneList(s.piles.stash, Pile.STASH);
    c.piles.stashCap = s.stashCap;

    c.counters = new Map();
    for (const [k, v] of s.counters) c.counters.set(k, { ...v });
    c.timers = s.timers.map(t => ({ ...t, data: { ...t.data } }));
    c.objects = s.objects.map(o => ({ ...o, data: JSON.parse(JSON.stringify(o.data || {})) }));
    c.hooks.restore(s.hooks);
    c._entityUid = s.entityUid; c._objectUid = s.objectUid; c._timerUid = s.timerUid;
    c.bus = null;
    return c;
  }
}

function _cfgLite(cfg) {
  // Strip everything the clone rebuilds itself; keeping cfg.hooks would register
  // every ad-hoc hook twice.
  const { player, enemies, deck, hooks, bus, relics, rng, ...rest } = cfg || {};
  return rest;
}

export { EV, intentFamily, buildIntent };
export default CombatEngine;
