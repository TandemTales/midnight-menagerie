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

  /** Lowest indices first — stable, seed-independent, and never surprising in a test. */
  auto(req) {
    const n = Math.min(req.count, req.pool.length);
    const out = [];
    for (let i = 0; i < n; i++) out.push(i);
    return out;
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
    };
    if (req.pool.length === 0 || req.count === 0) return [];

    this.e._emit(EV.CHOICE, {
      requestId: req.id, kind: req.kind, prompt: req.prompt,
      count: req.count, optional: req.optional,
      pool: req.pool.map((p, i) => describe(this.e, req.kind, p, i)),
      cardUid: req.meta.cardUid || null, cardId: req.meta.cardId || null,
      pile: req.meta.pile || null,
    });

    let picked;
    if (this.script && this.scriptPos < this.script.length) {
      picked = this.script[this.scriptPos++].picked;
    } else if (this.resolver && !this.autoOnly) {
      this.pending++;
      try { picked = await this.resolver(req); }
      finally { this.pending--; }
    } else {
      picked = this.auto(req);
    }

    picked = sanitise(picked, req);
    this.log.push({ seq: this.e._seq, kind: req.kind, cardId: req.meta.cardId || null, picked: picked.slice() });

    this.e._emit(EV.CHOICE_RESOLVED, {
      requestId: req.id, kind: req.kind, picked: picked.slice(),
      chosen: picked.map(i => describe(this.e, req.kind, req.pool[i], i)),
      cardUid: req.meta.cardUid || null,
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
