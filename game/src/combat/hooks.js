/**
 * Hook dispatch. OWNER: combat-engine.
 *
 * Statuses, relics, powers, summoned entities and board objects all expose the
 * same hook names (see schema.js StatusDef.hooks / RelicDef.hooks). This module
 * is the single place that decides WHO gets asked and IN WHAT ORDER — the answer
 * has to be identical every run or determinism is gone.
 *
 * ── Provider order (deterministic, always) ──────────────────────────────────
 *   1. relics                (engine.relics, array order)
 *   2. the relevant actor's statuses  (Map insertion order)
 *   3. the relevant actor's powers    (Map insertion order)
 *   4. board objects         (engine.objects, insertion order)
 *   5. engine.addHook(...)   registrations (insertion order)
 *
 * Scoped dispatch (`actorHooks`) only asks the one actor plus relics — used for
 * modifyDamageDealt (attacker), modifyDamageTaken (defender), modifyBlockGain,
 * onTurnStart/onTurnEnd. Global dispatch (`globalHooks`) asks every actor —
 * used for card events, deaths, shuffles, status application.
 *
 * Relics only apply to the player side. An enemy relic makes no sense and an
 * enemy inheriting the player's Keepsakes would be a bug factory.
 *
 * ── Hook names ──────────────────────────────────────────────────────────────
 * Void dispatch:
 *   onCombatStart(h)  onCombatEnd(h)
 *   onTurnStart(h)    onTurnEnd(h)          h.actor, h.turn, h.side
 *   onApply(h)        onRemove(h)           h.actor, h.id, h.delta
 *   onCardPlayed(h)   h.card, h.target, h.index
 *   onCardDrawn(h)    onCardDiscarded(h)    onCardExhausted(h)   h.card, h.reason
 *   onShuffle(h)      h.pile, h.count
 *   onAttacked(h)     h.attacker, h.defender, h.hpLoss, h.blocked, h.kind
 *   onDamaged(h)      same payload, fires for every damage kind
 *   onBlockGained(h)  h.actor, h.amount
 *   onHeal(h)         h.actor, h.amount
 *   onDeath(h)        h.actor, h.killerId
 *   onStatusApplied(h) h.actor, h.id, h.delta
 *   onCounterChanged(h) h.id, h.delta, h.value
 *   onIntentChosen(h) h.enemy, h.move
 *   onAttack(h)       an ENEMY finished a damaging move.  h.attacker, h.defender, h.hpLoss
 *   onAttackDealt(h)  the PLAYER finished resolving an Attack card. h.card, h.target
 *   onIncomingHit(h)  per individual hit against h.defender, BEFORE mitigation.
 *                     Mutable: set h.amount to change it, call h.prevent() to negate.
 *   onLethal(h)       a hit is about to reduce h.defender to 0 Courage.
 *                     Call h.prevent() to survive; set h.setHp(n) to survive at n.
 *   onDebuffIncoming(h) a debuff is about to land. h.id, h.stacks, h.actor.
 *                     Call h.prevent() to refuse it.
 *   onBoardEvent(h)   a generic broadcast: h.event, h.data
 *   onEnemyPhaseEnd(h) every enemy has acted and the decay buckets have run, but
 *                     intents have NOT been redrawn yet. Arm ally buffs here so
 *                     the intent the player reads afterwards is the true number.
 *
 * EVERY hook payload also carries:
 *   h.e / h.engine   the engine        h.stacks   the provider's stack count
 *   h.owner          the actor/relic that owns the hook
 *   h.actor          alias of h.owner when the owner is an actor
 *   h.remove()       strip this status from its owner (self-consuming statuses)
 *   h.block(a, n)    grant Guard without going through a card
 *   h.card           the card in play, when there is one
 *
 * Value reducers (must return a number):
 *   modifyDamageDealt(amount, h)   h.attacker, h.defender, h.card, h.kind, h.stacks
 *   modifyDamageTaken(amount, h)   same
 *   modifyBlockGain(amount, h)     h.actor, h.source
 *   modifyCardCost(cost, h)        h.card
 *   modifyDraw(n, h)               h.reason
 *   modifyEnergyGain(n, h)
 *   modifyCounterGain(n, h)        h.id, h.owner
 *   modifyHandCap(n, h)
 */

const NOOP_LIST = Object.freeze([]);

export class Hooks {
  constructor(engine) {
    this.e = engine;
    /** @type {{name:string, fn:Function, owner:any, source:string, id:string}[]} */
    this.extra = [];
    this._uid = 0;
  }

  /** Register an ad-hoc hook (used by cards that install one-combat behaviour). */
  add(name, fn, opts = {}) {
    const rec = {
      name, fn,
      owner: opts.owner ?? null,
      source: opts.source ?? 'effect',
      id: opts.id ?? `hook${++this._uid}`,
      once: !!opts.once,
    };
    this.extra.push(rec);
    return () => this.remove(rec.id);
  }

  remove(id) {
    const i = this.extra.findIndex(r => r.id === id);
    if (i >= 0) this.extra.splice(i, 1);
  }

  removeByOwner(owner) {
    for (let i = this.extra.length - 1; i >= 0; i--) {
      if (this.extra[i].owner === owner) this.extra.splice(i, 1);
    }
  }

  // ── provider collection ───────────────────────────────────────────────────

  _relicProviders(name, out) {
    const relics = this.e.relics;
    if (!relics) return;
    for (const r of relics) {
      const fn = r?.hooks?.[name];
      if (fn) out.push({ fn, owner: r, source: 'relic', stacks: r.counter ?? 0, id: r.id });
    }
  }

  _actorProviders(actor, name, out) {
    if (!actor) return;
    for (const [id, stacks] of actor.statuses) {
      if (stacks === 0) continue;
      const def = this.e.statusDef(id);
      const fn = def?.hooks?.[name];
      if (fn) out.push({ fn, owner: actor, source: 'status', stacks, id, def });
    }
    for (const [id, power] of actor.powers) {
      const fn = power?.hooks?.[name];
      if (fn) out.push({ fn, owner: actor, source: 'power', stacks: power.stacks ?? 1, id, def: power });
    }
  }

  _objectProviders(name, out) {
    for (const o of this.e.objects) {
      const fn = o?.hooks?.[name];
      if (fn) out.push({ fn, owner: o, source: 'object', stacks: o.stacks ?? 1, id: o.id });
    }
  }

  _extraProviders(name, out) {
    for (const r of this.extra) {
      if (r.name === name) out.push({ fn: r.fn, owner: r.owner, source: r.source, stacks: 1, id: r.id, rec: r });
    }
  }

  /** Relics (player side only) + this actor's statuses/powers + objects + extras. */
  actorHooks(actor, name) {
    const out = [];
    if (actor && actor.side === 'player') this._relicProviders(name, out);
    this._actorProviders(actor, name, out);
    this._objectProviders(name, out);
    this._extraProviders(name, out);
    return out;
  }

  /** Everybody, in slot order. */
  globalHooks(name) {
    const out = [];
    this._relicProviders(name, out);
    this._actorProviders(this.e.player, name, out);
    for (const a of this.e.allies) this._actorProviders(a, name, out);
    for (const en of this.e.enemies) this._actorProviders(en, name, out);
    this._objectProviders(name, out);
    this._extraProviders(name, out);
    return out;
  }

  // ── dispatch ──────────────────────────────────────────────────────────────

  /** Fire-and-forget. `providers` defaults to global. */
  dispatch(name, payload = {}, providers = null) {
    const list = providers || this.globalHooks(name);
    if (list === NOOP_LIST || list.length === 0) return;
    for (const p of list) {
      p.fn(this._payload(p, payload));
      if (p.rec?.once) this.remove(p.id);
    }
  }

  /** Build the shared hook payload. Kept in one place so every hook gets the same tools. */
  _payload(p, payload) {
    const e = this.e;
    const owner = p.owner;
    return {
      ...payload,
      e, engine: e,
      stacks: p.stacks, owner, hookId: p.id, source: p.source, def: p.def,
      actor: payload.actor ?? (owner && owner.statuses ? owner : undefined),
      remove: () => {
        if (p.source === 'status' && owner && owner.statuses) e.removeStatus(owner, p.id, 'consumed');
        else if (p.source === 'effect') e.hooks.remove(p.id);
      },
      consume: (n = 1) => {
        if (p.source === 'status' && owner && owner.statuses) e.applyStatus(owner, p.id, -n, { reason: 'consumed', ignoreCharm: true });
      },
      block: (a, n) => e.gainBlock(a || owner, n, { fromCard: false, reason: p.id }),
      damage: (target, n, opts) => e.dealDamage({ attacker: owner, defender: target, amount: n, kind: 'attack', ...(opts || {}) }),
    };
  }

  /** Chain a number through every modifier. Always returns a finite number. */
  reduce(name, value, payload = {}, providers = null) {
    const list = providers || this.globalHooks(name);
    let v = value;
    for (const p of list) {
      const next = p.fn(v, this._payload(p, payload));
      if (typeof next === 'number' && Number.isFinite(next)) v = next;
    }
    return v;
  }

  /** True if any provider answers truthy — used for veto-style hooks. */
  any(name, payload = {}, providers = null) {
    const list = providers || this.globalHooks(name);
    for (const p of list) {
      if (p.fn(this._payload(p, payload))) return true;
    }
    return false;
  }

  /** Snapshot for engine cloning — extras hold live fn refs so we copy the list. */
  snapshot() { return this.extra.slice(); }
  restore(list) { this.extra = list.slice(); }
}
