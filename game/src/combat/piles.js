/**
 * Card instances and the six combat zones. OWNER: combat-engine.
 *
 * Zones (schema.js Pile):
 *   draw    index 0 is the TOP of the pile — the next card drawn
 *   hand
 *   discard
 *   exhaust "Vanished" in fiction
 *   limbo   a card that is mid-resolution, or parked by an effect (Wisp's Gloaming,
 *           Wink's Set Tricks, Pudding's Plots and Bones' Buried all live here with
 *           a `meta.zone` tag so each Companion can keep its own sub-zone)
 *   stash   Hush's Shadow Pocket. Capacity-limited (default 3), never auto-discarded.
 *
 * A Card is a *runtime instance* of a CardDef. Two copies of Scratch are two Cards
 * with different `uid`s sharing one frozen def. Everything mutable — cost deltas,
 * upgrade state, `meta` — lives on the instance, and `meta` survives every shuffle
 * and every zone move, which is what Stretch counters and Enchantments need.
 */

import { EV } from './events.js';
import { Pile } from '../data/schema.js';

let UID = 0;
/** Reset only from tests — uids must be stable within a run for replay to work. */
export function _resetUid(n = 0) { UID = n; }

export class Card {
  /**
   * @param {import('../data/schema.js').CardDef} def
   * @param {Object} [o] { upgraded, uid, meta }
   */
  constructor(def, o = {}) {
    this.uid = o.uid || `c${++UID}`;
    this.def = def;
    this.id = def.id;
    this.upgraded = !!o.upgraded;

    const up = this.upgraded ? (def.upgrade || {}) : null;
    this.name = (up && up.name) || def.name + (this.upgraded ? '+' : '');
    this.type = (up && up.type) || def.type;
    this.rarity = def.rarity;
    this.companion = def.companion || 'neutral';
    this.target = (up && up.target) || def.target;
    this.text = (up && up.text) || def.text || '';
    this.flavor = def.flavor || '';
    this.art = def.art || def.id;
    this.keywords = (up && up.keywords) || def.keywords || [];

    /** Printed cost. -1 = X cost, -2 = unplayable. */
    this.baseCost = (up && up.cost !== undefined) ? up.cost : def.cost;
    /** Cost changes that expire at end of turn (Hide Under Something). */
    this.costTurnDelta = 0;
    /** Cost changes that last the whole fight (Taffy's card shaping). */
    this.costCombatDelta = 0;
    /** Hard override, e.g. "this costs 0 this turn". null = none. */
    this.costOverrideTurn = null;
    this.costOverrideCombat = null;

    /** Numbers the rules text interpolates. Cloned so upgrades never touch the def. */
    this.nums = { ...(def.nums || {}), ...((up && up.nums) || {}) };

    this.exhaust = pick(up, def, 'exhaust', false);
    this.ethereal = pick(up, def, 'ethereal', false);
    this.innate = pick(up, def, 'innate', false);
    this.retain = pick(up, def, 'retain', false);
    this.unplayable = pick(up, def, 'unplayable', false) || this.baseCost === -2;

    /** One-turn retain granted by an effect; cleared when the hand is resolved. */
    this.retainThisTurn = false;
    /** Per-card metadata that survives shuffles and zone moves. Plain data only. */
    this.meta = { ...(o.meta || {}) };
    /** Which zone the card is currently in (kept in sync by Piles). */
    this.pile = o.pile || Pile.DRAW;
  }

  get isX() { return this.baseCost === -1; }

  /**
   * Cost before engine hooks. `engine.costOf()` applies `dynamicCost` and the
   * `modifyCardCost` hooks on top — see the composition order documented there.
   * @param {number|null} printed  the printed cost to compose from. Pass the
   *   result of `CardDef.dynamicCost(ctx)` to have it stand in for `baseCost`.
   */
  rawCost(printed = null) {
    if (this.unplayable) return -2;
    const base = (printed === null || printed === undefined) ? this.baseCost : printed;
    if (base === -1) return -1;
    // A hard override is a statement about the whole card ("this costs 0 this
    // turn") and outranks both the printed and the dynamic cost.
    if (this.costOverrideTurn !== null) return Math.max(0, this.costOverrideTurn);
    if (this.costOverrideCombat !== null) return Math.max(0, this.costOverrideCombat);
    return Math.max(0, base + this.costCombatDelta + this.costTurnDelta);
  }

  clone() {
    const c = new Card(this.def, { uid: this.uid, upgraded: this.upgraded, meta: this.meta, pile: this.pile });
    c.costTurnDelta = this.costTurnDelta;
    c.costCombatDelta = this.costCombatDelta;
    c.costOverrideTurn = this.costOverrideTurn;
    c.costOverrideCombat = this.costOverrideCombat;
    c.nums = { ...this.nums };
    c.exhaust = this.exhaust; c.ethereal = this.ethereal;
    c.innate = this.innate; c.retain = this.retain;
    c.unplayable = this.unplayable; c.retainThisTurn = this.retainThisTurn;
    c.meta = JSON.parse(JSON.stringify(this.meta));
    return c;
  }
}

function pick(up, def, key, dflt) {
  if (up && up[key] !== undefined) return up[key];
  if (def[key] !== undefined) return def[key];
  return dflt;
}

export class Piles {
  /** @param {import('./engine.js').CombatEngine} engine */
  constructor(engine) {
    this.e = engine;
    /** @type {Card[]} index 0 = top of the draw pile */
    this.draw = [];
    /** @type {Card[]} */
    this.hand = [];
    /** @type {Card[]} */
    this.discard = [];
    /** @type {Card[]} */
    this.exhaust = [];
    /** @type {Card[]} */
    this.limbo = [];
    /** @type {Card[]} Hush's Shadow Pocket */
    this.stash = [];
    this.stashCap = 3;
  }

  list(name) { return this[name] || []; }
  all() { return [...this.draw, ...this.hand, ...this.discard, ...this.exhaust, ...this.limbo, ...this.stash]; }
  find(uid) {
    for (const p of [Pile.HAND, Pile.DRAW, Pile.DISCARD, Pile.EXHAUST, Pile.LIMBO, Pile.STASH]) {
      const arr = this[p];
      for (let i = 0; i < arr.length; i++) if (arr[i].uid === uid) return arr[i];
    }
    return null;
  }
  pileOf(card) {
    for (const p of [Pile.DRAW, Pile.HAND, Pile.DISCARD, Pile.EXHAUST, Pile.LIMBO, Pile.STASH]) {
      if (this[p].includes(card)) return p;
    }
    return null;
  }
  get handCount() { return this.hand.length; }

  /** Remove a card from whatever zone holds it. Returns the zone name or null. */
  _pull(card) {
    for (const p of [Pile.DRAW, Pile.HAND, Pile.DISCARD, Pile.EXHAUST, Pile.LIMBO, Pile.STASH]) {
      const i = this[p].indexOf(card);
      if (i >= 0) { this[p].splice(i, 1); return p; }
    }
    return null;
  }

  /**
   * Insert into a zone.
   * @param {'top'|'bottom'|'random'|number} position for the draw pile, 'top' = index 0
   */
  _push(card, pile, position = 'bottom') {
    const arr = this[pile];
    if (!arr) throw new Error(`unknown pile "${pile}"`);
    let idx;
    if (position === 'top') idx = 0;
    else if (position === 'random') idx = this.e.rng.int(arr.length + 1);
    else if (typeof position === 'number') idx = Math.max(0, Math.min(arr.length, position | 0));
    else idx = arr.length;
    arr.splice(idx, 0, card);
    card.pile = pile;
    return idx;
  }

  /** Move a card between zones and emit `card:move`. Stash capacity is enforced. */
  move(card, toPile, opts = {}) {
    if (toPile === Pile.STASH && this.stash.length >= this.stashCap && !this.stash.includes(card)) {
      return false;
    }
    // `{top:true}` / `{bottom:true}` are what the content helpers write.
    let position = opts.position;
    if (position === undefined) position = opts.top ? 'top' : opts.bottom ? 'bottom' : (toPile === Pile.DRAW ? 'top' : 'bottom');
    const from = this._pull(card);
    const idx = this._push(card, toPile, position);
    this.e._emit(EV.CARD_MOVE, {
      cardUid: card.uid, card: this.e.cardSnap(card),
      from, to: toPile, position: idx, reason: opts.reason || 'effect',
    });
    return true;
  }

  /** Shuffle the discard pile back into the draw pile. Deterministic via engine.rng. */
  reshuffle(reason = 'empty') {
    if (this.discard.length === 0) return 0;
    const pool = this.draw.concat(this.discard);
    this.discard.length = 0;
    const shuffled = this.e.rng.shuffle(pool);
    this.draw = shuffled;
    for (const c of this.draw) c.pile = Pile.DRAW;
    this.e._emit(EV.SHUFFLE, {
      into: Pile.DRAW, from: Pile.DISCARD, count: this.draw.length,
      order: this.draw.map(c => c.uid), reason,
    });
    this.e.hooks.dispatch('onShuffle', { pile: Pile.DRAW, count: this.draw.length });
    return this.draw.length;
  }

  /** Shuffle the draw pile in place (Bones, Taffy). */
  shuffleDraw(reason = 'effect') {
    this.draw = this.e.rng.shuffle(this.draw);
    this.e._emit(EV.SHUFFLE, {
      into: Pile.DRAW, from: Pile.DRAW, count: this.draw.length,
      order: this.draw.map(c => c.uid), reason,
    });
    this.e.hooks.dispatch('onShuffle', { pile: Pile.DRAW, count: this.draw.length });
  }

  /**
   * Draw one card. Reshuffles the discard pile if the draw pile is empty.
   * A card drawn into a full hand goes straight to the discard pile (StS rule)
   * and emits `hand:full` so the renderer can play the bounce.
   * @returns {Card|null}
   */
  drawOne(reason = 'draw') {
    if (this.draw.length === 0) this.reshuffle('empty');
    if (this.draw.length === 0) return null;      // deck genuinely exhausted

    const cap = this.e.handCap();
    const card = this.draw.shift();

    if (this.hand.length >= cap) {
      this._push(card, Pile.DISCARD, 'bottom');
      this.e._emit(EV.HAND_FULL, { cardUid: card.uid, card: this.e.cardSnap(card), cap });
      this.e._emit(EV.DISCARD, {
        cardUid: card.uid, card: this.e.cardSnap(card), from: Pile.DRAW, to: Pile.DISCARD,
        reason: 'handFull', handSize: this.hand.length, discardCount: this.discard.length,
      });
      return null;
    }

    this._push(card, Pile.HAND, 'bottom');
    this.e._emit(EV.DRAW, {
      cardUid: card.uid, card: this.e.cardSnap(card), from: Pile.DRAW, to: Pile.HAND,
      handSize: this.hand.length, drawCount: this.draw.length,
      discardCount: this.discard.length, reason,
    });
    this.e.hooks.dispatch('onCardDrawn', { card, reason });
    return card;
  }

  /** @returns {Card[]} the cards actually drawn */
  drawN(n, reason = 'draw') {
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = this.drawOne(reason);
      if (c) out.push(c);
      else if (this.draw.length === 0 && this.discard.length === 0 && this.hand.length < this.e.handCap()) break;
    }
    return out;
  }

  snapshotCounts() {
    return {
      draw: this.draw.length, hand: this.hand.length, discard: this.discard.length,
      exhaust: this.exhaust.length, limbo: this.limbo.length, stash: this.stash.length,
    };
  }
}
