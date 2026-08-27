/**
 * Player choice requests. OWNER: combat-engine.
 *
 * ~70 Tricks say "choose a Trick" / "choose one". Auto-picking silently deletes
 * player agency from a big slice of the game, so choice is a first-class engine
 * concept: the engine RAISES a request and AWAITS a resolution. Who supplies the
 * resolution depends on who is driving:
 *
 *   • the combat scene   → registers a resolver that opens the picker UI
 *   • tests / balance sim → the default deterministic auto-resolver
 *   • replays            → a recorded choice script
 *
 * ── Determinism ─────────────────────────────────────────────────────────────
 * A seed alone no longer reproduces a fight, because a human made decisions. A
 * seed PLUS the choice log does. Every resolution is appended to
 * `engine.choiceLog` as `{ seq, kind, cardId, picked }` where `picked` is an
 * array of stable indices into the offered pool. `engine.setChoiceScript(log)`
 * replays it. With no resolver and no script the auto-resolver is used, which is
 * itself deterministic (lowest indices first), so headless runs stay reproducible
 * from the seed alone.
 *
 * ── Preview ─────────────────────────────────────────────────────────────────
 * A card whose outcome depends on an unmade choice cannot be previewed exactly.
 * The rule the engine follows, and the UI must communicate:
 *
 *   `engine.preview()`      synchronous. Reports everything that resolved BEFORE
 *                           the first choice, sets `partial:true`,
 *                           `pendingChoices >= 1` and `uncertain:true`.
 *   `engine.previewAsync()` awaits the whole effect using the AUTO resolver, and
 *                           returns the full outcome with `uncertain:true`.
 *
 * `uncertain` means "this is one possible outcome, not a promise". The card face
 * should show the number with a trailing `?` rather than a hard prediction —
 * lying is worse than admitting the number depends on what you pick.
 *
 * ── Whose choice is it? ─────────────────────────────────────────────────────
 * A request may name a SEAT (`ask({ seat })`). ~15 multiplayer-only Tricks say
 * "that player chooses a Trick from their hand", and the decision belongs to
 * the Kid holding the cards, not to whoever happens to be driving the engine.
 *
 *   seat is this client's (`engine.localSeat`) → the resolver, i.e. the picker UI
 *   seat is somebody else's                    → resolved WITHOUT asking, using
 *                                                the request's own `prefer` rule
 *
 * That second branch is the seam a transport replaces: today it resolves
 * deterministically rather than putting a request in front of a player who is
 * not at this screen, and every resolution — including who it was for — is
 * appended to `choiceLog`, so a replay reconstructs the fight whichever way it
 * was answered. Handing one player control of another Kid's deck would be worse
 * than a deterministic pick, not better, so the fallback is not a bug to be
 * suffered until the wire exists; it is the correct local behaviour.
 */

import { EV } from './events.js';

let REQ = 0;

/**
 * @typedef {Object} ChoiceRequest
 * @property {number} id
 * @property {'card'|'option'|'enemy'} kind
 * @property {string} prompt
 * @property {number} count      how many to pick
 * @property {boolean} optional  may resolve with fewer (or zero)
 * @property {Array}  pool       cards | option labels | enemies
 * @property {Object} meta       { pile, cardId, cardUid }
 */

export class ChoiceBroker {
  /** @param {import('./engine.js').CombatEngine} engine */
  constructor(engine) {
    this.e = engine;
    /** @type {((req:ChoiceRequest)=>number[]|Promise<number[]>)|null} */
    this.resolver = null;
    /** @type {Array<{seq:number,kind:string,cardId:string,picked:number[]}>} */
    this.log = [];
    /** @type {Array|null} a recorded log being replayed */
    this.script = null;
    this.scriptPos = 0;
    /** Set while previewing — always auto-resolve, never ask a human. */
    this.autoOnly = false;
    this.pending = 0;
  }

  /** The renderer calls this once. `fn(req) -> Promise<number[]>` (indices into req.pool). */
  setResolver(fn) { this.resolver = fn || null; }

  /** Replay a recorded `engine.choiceLog`. */
  setScript(log) { this.script = log ? log.slice() : null; this.scriptPos = 0; }

  /**
   * Nobody is answering this one. Stable, seed-independent, and never
   * surprising in a test.
   *
   * `req.prefer` lets the card say which end it wants when the pick is not its
   * player's to make — "cheapest", "priciest", or a comparator. Without it the
   * rule is lowest index first, which is what every request used before seats
   * existed and what the replay log is full of.
   */
  auto(req) {
    const n = Math.min(req.count, req.pool.length);
    let order = req.pool.map((_, i) => i);
    const p = req.prefer;
    if (p === 'cheapest' || p === 'priciest') {
      const cost = (i) => (req.pool[i] && req.pool[i].baseCost != null) ? req.pool[i].baseCost : 99;
      const dir = p === 'cheapest' ? 1 : -1;
      order = order.sort((x, y) => (cost(x) - cost(y)) * dir || (x - y));
    } else if (typeof p === 'function') {
      try { order = order.sort((x, y) => p(req.pool[x], req.pool[y]) || (x - y)); }
      catch { order = req.pool.map((_, i) => i); }
    }
    return order.slice(0, n);
  }

  /**
   * Raise a request and await its resolution.
   * @returns {Promise<number[]>} indices into `req.pool`
   */
  async ask(o) {
    const req = {
      id: ++REQ,
      kind: o.kind || 'card',
      prompt: o.prompt || '',
      count: Math.max(0, o.count ?? 1),
      optional: !!o.optional,
      pool: o.pool || [],
      meta: o.meta || {},
      /** The Player this decision belongs to, or null for "whoever is driving". */
      seat: o.seat || null,
      prefer: o.prefer || null,
    };
    if (req.pool.length === 0 || req.count === 0) return [];
    // Whose call is it? A request addressed to a seat that is not this client's
    // is never put in front of the person sitting here.
    const seatIndex = req.seat ? (req.seat.seat | 0) : null;
    const mine = seatIndex == null || seatIndex === (this.e.localSeat | 0);

    this.e._emit(EV.CHOICE, {
      requestId: req.id, kind: req.kind, prompt: req.prompt,
      count: req.count, optional: req.optional,
      pool: req.pool.map((p, i) => describe(this.e, req.kind, p, i)),
      cardUid: req.meta.cardUid || null, cardId: req.meta.cardId || null,
      pile: req.meta.pile || null,
      seat: seatIndex, forMe: mine,
    });

    let picked;
    if (this.script && this.scriptPos < this.script.length) {
      picked = this.script[this.scriptPos++].picked;
    } else if (this.resolver && !this.autoOnly && mine) {
      this.pending++;
      try { picked = await this.resolver(req); }
      finally { this.pending--; }
    } else {
      picked = this.auto(req);
    }

    picked = sanitise(picked, req);
    // The seat goes in the log: a replay has to reconstruct WHOSE decision this
    // was, not only what was decided, or a two-Kid fight replays with both
    // seats' picks attributed to one of them.
    this.log.push({
      seq: this.e._seq, kind: req.kind, cardId: req.meta.cardId || null,
      seat: seatIndex, picked: picked.slice(),
    });

    this.e._emit(EV.CHOICE_RESOLVED, {
      requestId: req.id, kind: req.kind, picked: picked.slice(),
      chosen: picked.map(i => describe(this.e, req.kind, req.pool[i], i)),
      cardUid: req.meta.cardUid || null, seat: seatIndex, forMe: mine,
    });
    return picked;
  }
}

function sanitise(picked, req) {
  if (typeof picked === 'number') picked = [picked];
  if (!Array.isArray(picked)) picked = [];
  const seen = new Set();
  const out = [];
  for (const raw of picked) {
    const i = raw | 0;
    if (i < 0 || i >= req.pool.length || seen.has(i)) continue;
    seen.add(i);
    out.push(i);
    if (out.length >= req.count) break;
  }
  // A non-optional request must produce something, or the card silently fizzles.
  if (out.length === 0 && !req.optional) out.push(0);
  return out;
}

/** Plain, serialisable description of one pool entry — this is what the UI renders. */
function describe(engine, kind, item, index) {
  if (!item) return { index, label: '—' };
  if (kind === 'option') return { index, label: String(item.label ?? item) , disabled: !!item.disabled };
  if (kind === 'enemy') return { index, id: item.id, label: item.name, hp: item.hp, maxHp: item.maxHp };
  return { index, cardUid: item.uid, label: item.name, card: engine.cardSnap(item) };
}
