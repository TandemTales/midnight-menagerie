/**
 * The networked session. OWNER: foundation.
 *
 * One expedition, several machines, one shared board. This is the layer between
 * a `Transport` (which moves bytes and knows nothing about the game) and the
 * `Run` / `CombatEngine` (which know nothing about the wire).
 *
 *   const s = new Session({ transport, seat: 0, seats: 4, seed });
 *   s.attach(run);
 *   s.input({ t: 'play', seat: 0, uid: 'c3', target: 'e1' });
 *
 * ── Why this is small ───────────────────────────────────────────────────────
 *
 * Because the hard part was already built. This engine is deterministic by
 * construction: every random draw goes through `ctx.run.rng`, a seed reproduces
 * a run exactly, `engine.choiceLog` records every choice a player made, and
 * `setChoiceScript` replays them. `run._combatDigest()` already fingerprints
 * every seat's board because a local resume needed it.
 *
 * So the wire carries **INPUTS, NEVER STATE**. Nobody sends a board. Each client
 * applies the same ordered list of inputs to the same seed and computes the
 * same board, which is why a Trick with a random effect works over the wire at
 * all. Sending state instead would be simpler for about a week and then every
 * Companion with an RNG call would desync.
 *
 * ── The three things that go wrong, and what catches each ───────────────────
 *
 * 1. ORDER. Two players act at the same moment and the two clients apply their
 *    inputs in different orders. Every input is stamped `(turn, seq)` by its
 *    author and applied in a total order sorted by `(turn, seat, seq)` — seat
 *    index breaks the tie, never arrival time, because arrival time is exactly
 *    the thing that differs between machines.
 *
 * 2. DIVERGENCE. Something non-deterministic slipped in — a `Math.random()`, a
 *    `Date.now()`, an iteration over an object's keys. The board digest is
 *    exchanged at every turn boundary and a mismatch is reported LOUDLY rather
 *    than papered over, because a silently divergent lockstep game is two people
 *    playing two different games while both screens look fine.
 *
 * 3. DISCONNECTION. Mid-run disconnects are StS2's loudest complaint and the
 *    designer asked for reconnection to shape the protocol rather than be
 *    retrofitted. It does: because the wire is an ordered input log, a rejoining
 *    client asks for the log from wherever it got to, replays it against the
 *    seed, and checks the digest — which is precisely what `run._resumeCombat()`
 *    already does for a player who quit and came back.
 *
 * ── Where the rest of it lives ──────────────────────────────────────────────
 *
 * This file moves inputs and orders them and has no idea what any of them MEAN.
 * The other halves, as of 2026-08-29:
 *
 *   `net/actions.js`  the applier every screen calls, and the choice bridge
 *   `net/lobby.js`    where `seat`, `seats`, `seed` and `host` come from
 *
 *   `ui/netplate.js`  what the table is told when a seat drops or the boards split
 *
 * The transport that reaches another machine is `SteamTransport`, through the
 * desktop shell (`shell/steam.js`). See
 * `docs/notes/2026-08-29-the-wire-reaches-the-screens.md` and
 * `docs/notes/2026-11-03-co-op-on-a-real-wire.md`.
 */

/** Input kinds the session understands. Anything else is rejected loudly. */
export const INPUT = Object.freeze({
  PLAY: 'play',        // { pile, index, target }  a Trick played
  END: 'end',          // {}                       that seat ends its turn
  CHOICE: 'choice',    // { seq2, forSeat, picked } an answer to engine.choices.ask
  SNACK: 'snack',      // { index, target }
  READY: 'ready',      // {}                       past a room / screen
  ROOM: 'room',        // { act, ... }             a Kid acted in a room
});

/**
 * A card, in words every client agrees on.
 *
 * **A card's `uid` IS NOT A NETWORK IDENTITY.** Uids come from a counter that
 * runs per page, not per game: two clients building their own engine from the
 * same seed produce the same CARDS in the same ORDER with entirely different
 * uids. Putting a uid on the wire looks correct — it is unique, it is stable
 * locally, it round-trips — and the remote client simply fails to find the card
 * and silently does nothing, which is what happened the first time this was
 * written. The board then drifts by exactly one Trick and the digest catches it
 * a turn later, a long way from the cause.
 *
 * Position is the identity that survives the wire: both clients hold the same
 * piles in the same order, because that is the whole lockstep premise. If the
 * two ever disagree about position, they have already desynced and the digest
 * is the thing that should say so — not a card lookup quietly missing.
 */
export function cardRef(engine, card) {
  if (!engine || !card) return null;
  for (const pl of engine.players) {
    const pile = pl.piles.pileOf(card);
    if (!pile) continue;
    return { seat: pl.seat, pile, index: pl.piles.list(pile).indexOf(card) };
  }
  return null;
}

/** The card a {@link cardRef} names, on THIS client. */
export function refCard(engine, ref) {
  if (!engine || !ref) return null;
  const pl = engine.players[ref.seat | 0];
  if (!pl) return null;
  return pl.piles.list(ref.pile)[ref.index | 0] || null;
}

const WIRE = Object.freeze({
  INPUT: 'i',
  DIGEST: 'd',
  REJOIN: 'r',         // "I am back, send me everything from n"
  LOG: 'l',            // the answer to a REJOIN
  HELLO: 'h',
  BEAT: 'b',           // "I am at (turn, seq) and nothing older is coming"
  RESEND: 'g',         // "I have a gap in this seat's inputs"
  STATE_ASK: 'sa',     // "I am back with nothing: where is everybody?"
  STATE: 's',          // one chunk of the answer
});

/** How long a seat may say nothing at all before the table is told. Beats run every 250 ms,
 *  so this is generous on purpose: a page linking shaders can stop for seconds at a time. */
const LOST_MS = 15000;
/** A beat naming an input we never received: how long to let it arrive by itself. */
const GAP_MS = 1500;
/** Steam's Reliable channel carries 1 MB a message. Stay well clear of it. */
const CHUNK_CHARS = 180 * 1024;
const LOG_PAGE = 256;

const ms = () => ((typeof performance === 'object' && performance.now) ? performance.now() : Date.now());

/**
 * The inputs that DO NOT COMMUTE, and so are the only ones worth a barrier.
 *
 * Every room input acts on the sender's own Kid or adds to a shared counter,
 * and `map.vote` writes one seat's slot in a ballot whose resolution sorts the
 * seats itself — apply them in either order and both boards land in the same
 * state. Gating them would buy nothing and would stall a reward screen behind
 * a peer who is reading a Curiosity.
 */
const COMBAT_INPUT = new Set(['play', 'snack', 'end']);

export class Session {
  /**
   * @param {object}  o
   * @param {object}  o.transport  see net/transport.js
   * @param {number}  o.seat       which seat THIS client owns
   * @param {number}  o.seats      how many seats the party has
   * @param {number}  o.seed       the expedition seed, identical on every client
   * @param {boolean} [o.host]     one client resolves rejoin requests
   * @param {object}  [o.roster]   the lobby's frozen roster; it maps a transport
   *                               id to a seat and answers somebody arriving late
   * @param {string}  [o.room]     the password, for the save and for a rejoin
   * @param {boolean} [o.rejoining] hold every input until `adopt()`
   */
  constructor(o = {}) {
    this.transport = o.transport;
    this.seat = o.seat | 0;
    this.seats = Math.max(1, o.seats | 0 || 1);
    this.seed = o.seed | 0;
    this.host = !!o.host;
    this.roster = o.roster || null;
    this.room = o.room || '';

    /** (seat, seq) of everything accepted: a resend must not apply twice. */
    this._seen = new Set();
    /** Inputs per seat, against the seq that seat has announced. A short count is a lost message. */
    this._count = new Map();
    this._gapSince = new Map();
    /** When each seat last said anything, and who has gone quiet or left. */
    this._heardAt = new Map();
    this._startedAt = ms();
    /** Seats the table has noticed are missing, and seats it has agreed to play on without. */
    this.lost = new Set();
    this.gone = new Set();
    /** Every CHOICE answer by `${fight}:${seq}`: one can arrive before its fight has been built. */
    this._answers = new Map();
    this._frozen = !!o.rejoining;
    this._buffered = [];
    this._stateParts = new Map();
    this._applying = false;
    /** The agreed order's clock; see `_heldByBarrier`. */
    this._clock = 0;
    /** Local callers waiting for their own input to have been applied. */
    this._waiters = new Map();

    /** The thing `shouldHandOff()` reads: a wire owns the seats, so no veil. */
    this.remote = true;

    /** Every input, in the total order every client agrees on. */
    this.log = [];
    /** Our own monotonic counter, so our inputs have a stable order. */
    this._seq = 0;
    /** Digests other peers reported, by `${turn}:${peerSeat}`. */
    this._digests = new Map();

    /**
     * How far each OTHER seat has promised it will not speak before, by seat.
     *
     * An input carries the promise implicitly: `seq` is monotonic per author,
     * so hearing `(T, n)` from a seat means nothing older is still in flight
     * from it. That is enough while a seat is ACTING and useless the moment it
     * stops — a player staring at their hand sends nothing at all, and silence
     * is indistinguishable from a packet still on the way. The beat is that
     * same promise made out loud, which is the half a barrier cannot work
     * without and the reason this was never buildable as "just a barrier".
     */
    this._horizon = new Map();
    /** When the pump first held something, so a missing beat is visible. */
    this._heldSince = 0;
    this._heldWarned = false;
    /** The turn our last beat announced, so a turn change beats immediately. */
    this._beatTurn = -1;
    this._beatMs = o.beatMs === undefined ? 250 : (o.beatMs | 0);
    this._beatTimer = null;

    this.run = null;
    this.peers = new Set();
    this.divergedAt = null;
    this._offs = [];
    this._listeners = {
      input: new Set(), diverge: new Set(), peer: new Set(), answer: new Set(),
      presence: new Set(), gone: new Set(), back: new Set(), state: new Set(), desync: new Set(),
    };

    if (this.transport) {
      this._offs.push(this.transport.onMessage((m, from) => this._onWire(m, from)));
      this._offs.push(this.transport.onPeer((p) => this._onPeer(p)));
      this.transport.send({ k: WIRE.HELLO, seat: this.seat, seed: this.seed });
      this.beat();
      /* The IDLE half. Acting beats for itself; this covers the peer who is
         thinking, and it is what stops a barrier turning a long deliberation
         into a freeze on somebody else's screen. */
      if (this._beatMs > 0 && typeof setInterval === 'function') {
        this._beatTimer = setInterval(() => { this.beat(); this._tick(); }, this._beatMs);
      }
    }
  }

  /* ── who is still here ──────────────────────────────────────────────────── */

  /** What a save needs to find this expedition again. See `Run.snapshot`. */
  netInfo() {
    return {
      room: this.room, seat: this.seat, id: this.transport?.id || null,
      lobby: this.transport?.lobbyId || null, seats: this.seats,
      roster: this.roster,
    };
  }

  /** The seat behind a transport id, from the frozen roster. */
  _seatOfId(id) {
    const ids = this.roster?.ids;
    const i = ids ? ids.indexOf(id) : -1;
    return i >= 0 ? i : null;
  }

  _heard(seat) {
    if (seat == null) return;
    const s = seat | 0;
    this._heardAt.set(s, ms());
    if (this.lost.delete(s)) this._emit('presence', { seat: s, here: true });
  }

  _markLost(seat) {
    const s = seat | 0;
    if (s === this.seat || this.gone.has(s) || this.lost.has(s)) return;
    this.lost.add(s);
    this._emit('presence', { seat: s, here: false });
    /* Reliable is per receiver, so an input they sent as they dropped can have
       reached us and not a third player. Everyone passes on what they hold. */
    if (this.seats > 2) this._forward(s);
  }

  _forward(seat) {
    const mine = this.log.filter(m => (m.seat | 0) === seat);
    this._sendLog(mine, null);
  }

  /** Beat-driven housekeeping: a silent seat, and a gap in what a seat has sent. */
  _tick() {
    const now = ms();
    for (let s = 0; s < this.seats; s++) {
      if (s === this.seat || this.gone.has(s)) continue;
      const last = this._heardAt.get(s) ?? this._startedAt;
      if (now - last > LOST_MS) this._markLost(s);
    }
    for (const [s, h] of this._horizon) {
      const have = this._count.get(s) || 0;
      if (have >= (h.seq | 0)) { this._gapSince.delete(s); continue; }
      const since = this._gapSince.get(s);
      if (since == null) { this._gapSince.set(s, now); continue; }
      if (now - since < GAP_MS) continue;
      this._gapSince.set(s, now);
      this.transport?.send({ k: WIRE.RESEND, seat: s });
    }
  }

  /** Answer with log pages. `to` null reaches everybody and is taken by whoever lacks them. */
  _sendLog(log, to) {
    for (let i = 0; i < log.length; i += LOG_PAGE) {
      this.transport?.send({ k: WIRE.LOG, to, log: log.slice(i, i + LOG_PAGE) });
    }
  }

  /**
   * Play on without a seat. Anybody at the table can ask, and two people asking
   * at once is harmless: `run.dropSeat` only acts once.
   */
  dropSeat(seat) {
    const s = seat | 0;
    if (s === this.seat || this.gone.has(s)) return null;
    return this.input({ t: INPUT.ROOM, act: 'seat.gone', to: s });
  }

  /* ── climbing back in ───────────────────────────────────────────────────── */

  /**
   * Back with an empty page: ask the table for the expedition.
   *
   * The answer is a SAVE, not the whole log replayed from the seed. Each client
   * leaves a room in its own time and that walk is not an input, so a log alone
   * cannot rebuild where a run stands; a snapshot can, and `Run.resume` already
   * knows how to stand a run back up from one, in the middle of a fight included.
   */
  requestState() { this.transport?.send({ k: WIRE.STATE_ASK, seat: this.seat }); }

  async _answerState(from) {
    const run = this.run;
    if (!run || typeof run.snapshot !== 'function') return;
    /* Between inputs if we can get there. A table stuck on a question only the
       returning player can answer never will, so that wait is bounded. */
    await Promise.race([this.settled(), new Promise(r => setTimeout(r, 1500))]);
    if (run.pendingCombat) { try { run._combatSave(); } catch { /* the snapshot below still stands */ } }
    const body = JSON.stringify({
      snapshot: run.snapshot(), pendingVote: run.pendingVote || null,
      log: this.log, applied: this._applied - (this._applying ? 1 : 0),
    });
    const id = `${this.seat}-${Math.floor(ms())}`;
    const of = Math.max(1, Math.ceil(body.length / CHUNK_CHARS));
    for (let n = 0; n < of; n++) {
      this.transport?.send({ k: WIRE.STATE, to: from, id, n, of,
                             part: body.slice(n * CHUNK_CHARS, (n + 1) * CHUNK_CHARS) });
    }
  }

  _takeState(m) {
    if (!this._frozen || m.to !== this.transport?.id) return;
    const parts = this._stateParts.get(m.id) || new Array(m.of);
    parts[m.n] = m.part;
    this._stateParts.set(m.id, parts);
    for (let n = 0; n < m.of; n++) if (parts[n] == null) return;
    this._stateParts.clear();
    try { this._emit('state', JSON.parse(parts.join(''))); }
    catch (err) { console.error('[net] a rejoin answer would not parse', err); }
  }

  /** Take on the log a rejoin answer carries, then whatever arrived while it was on its way. */
  adopt(pack) {
    this._frozen = false;
    this.log = (pack.log || []).slice();
    this._seen = new Set();
    this._count = new Map();
    this._answers = new Map();
    for (const m of this.log) {
      this._record(m);
      this._clock = Math.max(this._clock, m.clk | 0);
      this._note(m.seat, m.turn, m.seq, m.clk);
    }
    this._applied = Math.max(0, Math.min(this.log.length, pack.applied | 0));
    this._seq = this.log.reduce((n, m) => ((m.seat | 0) === this.seat ? Math.max(n, m.seq | 0) : n), 0);
    for (const m of this._buffered.splice(0)) this._accept(m, 'wire');
    this._pump();
  }

  _record(msg) {
    this._seen.add(`${msg.seat | 0}:${msg.turn | 0}:${msg.seq | 0}`);
    this._count.set(msg.seat | 0, (this._count.get(msg.seat | 0) || 0) + 1);
    if (msg.t === INPUT.CHOICE && msg.fight) this._answers.set(`${msg.fight}:${msg.seq2 | 0}`, msg.picked || []);
    if (msg.act === 'seat.gone') {
      const s = msg.to | 0;
      this.gone.add(s);
      this.lost.delete(s);
      this._horizon.delete(s);
    } else if (msg.act === 'seat.back') {
      this.gone.delete(msg.seat | 0);
    }
  }

  /** Wire this session to a Run. The Run owns exactly one seat from now on. */
  attach(run) {
    this.run = run;
    if (run) {
      run.session = this;
      run.localSeat = this.seat;
    }
    return this;
  }

  on(kind, fn) {
    const set = this._listeners[kind];
    if (!set) return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }
  _emit(kind, payload) { for (const fn of this._listeners[kind] || []) { try { fn(payload); } catch (err) { console.error('[net]', err); } } }

  /**
   * Apply inputs to the game STRICTLY ONE AT A TIME.
   *
   * `playCard` and `endTurn` are async — they animate, they await choices, they
   * run whole enemy phases. Firing input handlers as the messages arrive lets
   * two of them interleave, and two clients that interleave differently compute
   * different boards from the same log. That is not a race that shows up as a
   * crash; it shows up as a desync several turns later.
   *
   * So every input, local and remote alike, is queued behind the last one. The
   * queue is the reason `input()` does not apply anything itself: there is one
   * path into the game and it is ordered.
   */
  /**
   * Apply everything in the log that has not been applied yet, IN LOG ORDER.
   *
   * This used to be `_run(msg)`, which applied the message that had just
   * arrived. The log was sorted and the board was not: two clients receiving
   * the same two inputs in opposite orders held identical logs and had applied
   * them differently — measured, `tests/net` §4b.
   *
   * ── Why a microtask fixes it ────────────────────────────────────────────
   *
   * The link below runs as a microtask, so every `_accept` that happens in the
   * SAME task has already inserted its message by the time the first link
   * drains. A transport read that delivers two frames in one turn of the event
   * loop — which is what a socket read, a BroadcastChannel batch and the
   * loopback all do — therefore gets sorted before anything is applied. Each
   * later `_accept` still appends its own link; it just finds the cursor has
   * already passed its message, and does nothing.
   *
   * ── What it does NOT fix ────────────────────────────────────────────────
   *
   * An input that arrives in a LATER task, sorting before one already applied,
   * cannot be put back in its place — the board has moved.
   *
   * For a COMBAT input that is closed: `_heldByBarrier` will not apply one until
   * nothing that sorts before it can still arrive. `_accept` still reports the
   * case if it ever happens, rather than leaving the digest to notice a turn
   * later, a long way from the cause.
   */
  /** One message, out of band, because the cursor has already passed it. */
  _runOne(msg) {
    this._chain = (this._chain || Promise.resolve()).then(async () => {
      for (const fn of this._listeners.input) {
        try { await fn(msg); } catch (err) { console.error('[net] applying input', msg, err); }
      }
      this._landed(msg);
    });
    return this._chain;
  }

  /** Resolves when this input has really been applied, whatever it had to wait for. */
  whenApplied(msg) {
    return new Promise((resolve) => {
      if (this.log.indexOf(msg) < this._applied) { resolve(); return; }
      this._waiters.set(msg, resolve);
    });
  }

  _landed(msg) {
    const w = this._waiters.get(msg);
    if (w) { this._waiters.delete(msg); w(); }
  }

  _pump() {
    if (this._frozen) return this.settled();
    this._chain = (this._chain || Promise.resolve()).then(async () => {
      while (this._applied < this.log.length) {
        const msg = this.log[this._applied];
        if (this._heldByBarrier(msg)) { this._noteHold(msg); break; }
        this._applied++;
        // A CHOICE is delivered out of band by `_accept`; it is in the log so a
        // rejoin replays it, and it must not be applied as an input here.
        if (msg.t === INPUT.CHOICE) { this._landed(msg); continue; }
        this._applying = true;
        for (const fn of this._listeners.input) {
          try { await fn(msg); } catch (err) { console.error('[net] applying input', msg, err); }
        }
        this._applying = false;
        this._landed(msg);
        this._maybeBeat();
      }
      if (this._applied >= this.log.length) { this._heldSince = 0; this._heldWarned = false; }
    });
    return this._chain;
  }

  /**
   * Tell every peer where this client is.
   *
   * Safe to call as often as you like: it is a statement of position, carries
   * no game state, never enters the log and is never replayed.
   */
  beat() {
    if (!this.transport) return null;
    this._beatTurn = this.turn();
    const b = { k: WIRE.BEAT, seat: this.seat, turn: this._beatTurn, seq: this._seq, clk: this._clock };
    this.transport.send(b);
    return b;
  }

  /** Beat the moment the turn moves, so a barrier costs a message and not a
   *  timer interval. The idle timer is for the case where nothing moves. */
  _maybeBeat() {
    if (this.transport && this.turn() !== this._beatTurn) this.beat();
  }

  /**
   * Record how far a seat has promised not to speak before.
   *
   * Never moves a horizon BACKWARDS: beats and inputs race each other, and a
   * beat that set out before an input but arrived after it would otherwise
   * un-promise something already promised, which reopens the barrier under an
   * input that has already been cleared to apply.
   */
  _note(seat, turn, seq, clk = 0) {
    const s = seat | 0;
    if (s === this.seat) return;
    const t = turn | 0, q = seq | 0, c = clk | 0;
    const h = this._horizon.get(s);
    if (h && (h.turn > t || (h.turn === t && h.seq >= q))) {
      if (c > (h.clk | 0)) h.clk = c;
      return;
    }
    this._horizon.set(s, { turn: t, seq: q, clk: Math.max(c, h ? h.clk | 0 : 0) });
  }

  /**
   * The lowest combat turn any other seat might still be issuing input for.
   *
   * A seat at turn 0 is NOT IN THIS FIGHT — it is on a map, in a shop, or has
   * not started — and cannot be about to send a combat input for a turn it is
   * not in, so it does not hold the barrier. A seat never heard from is the
   * same case. Holding for either would freeze a two-Kid game the moment one
   * of them opened a Curiosity, which is the failure a naive barrier ships.
   */
  _barrierTurn() {
    let low = Infinity;
    /* OUR OWN POSITION COUNTS. A client still in turn 1 that applies a peer's
       turn 2 input has the identical bug mirrored: its own turn 1 inputs are
       still to come and every one of them sorts before what it just applied.
       It cannot deadlock on itself — our turn N inputs are never held by our
       own turn N, so a seat can always finish the turn it is in and advance. */
    const own = this.turn() | 0;
    if (own >= 1) low = own;
    for (const [s, h] of this._horizon) {
      if (s === this.seat || this.gone.has(s)) continue;
      if (h.turn >= 1 && h.turn < low) low = h.turn;
    }
    return low;
  }

  /**
   * Whether an input must wait for the rest of the table.
   *
   * ── WHAT THIS CLOSES ───────────────────────────────────────────────────
   *
   * A turn T-1 input sorts before EVERY turn T input, whatever the seats are.
   * So a client that reaches turn T while a peer is still acting in T-1 is
   * GUARANTEED to receive that straggler late and guaranteed to apply it out
   * of order — not a race that might happen, a divergence that must. That is
   * the compounding case, and this closes it: no combat input for turn T is
   * applied until every seat in the fight has reported reaching turn T.
   *
   * Note it gates this client's OWN input too. That is the cost and it is the
   * point — a barrier one seat may walk through is not a barrier.
   *
   * ── AND THE SAME TURN: THE AGREED ORDER ─────────────────────────────────
   *
   * Two seats act at once and their inputs cross. On one machine A's Trick lands
   * first, on the other B's, and if A's kills what B's was aimed at those are
   * different boards. Over a real wire that is not rare: anything inside one
   * network delay crosses, and turns are simultaneous on purpose.
   *
   * So every input carries a logical clock (Lamport's): one past anything its
   * author has seen. The log sorts on it, seat breaking a tie. A combat input is
   * applied only once every other seat has promised it will never send a lower
   * one, which is what `clk` on a beat means, and since messages are ordered per
   * sender that promise also says nothing older is still on the way. A seat acks
   * every combat input it hears, so the wait is one round trip and not a beat
   * interval. Every machine therefore applies the same inputs in the same order,
   * with no host and nothing to fail over; a player's own Trick lands one round
   * trip after they let go of it. Only a seat that has really stopped answering
   * can hold this up, and the table is told about that and can play on without it.
   */
  _heldByBarrier(msg) {
    if (!msg) return false;
    if (this.absorbing) return false;              // settled history, replaying
    if (this.seats <= 1) return false;             // nobody to wait for
    if (!COMBAT_INPUT.has(msg.t)) return false;    // room inputs commute
    const t = msg.turn | 0;
    if (t < 1) return false;
    if (t > this._barrierTurn()) return true;
    if (msg.node && this.run?.readyForCombatInput && !this.run.readyForCombatInput(msg)) return true;
    const c = msg.clk | 0;
    if (!c) return false;                          // a hand-made input in a harness
    for (const [s, h] of this._horizon) {
      if (s === this.seat || this.gone.has(s)) continue;
      if ((h.clk | 0) < c) return true;
    }
    return false;
  }

  /** A barrier that never lifts is a freeze. Say so rather than hang quietly. */
  _noteHold(msg) {
    const now = (typeof performance === 'object' && performance.now)
      ? performance.now() : Date.now();
    if (!this._heldSince) { this._heldSince = now; return; }
    if (this._heldWarned || now - this._heldSince < 5000) return;
    this._heldWarned = true;
    console.warn('[net] the turn barrier has held for 5s — a seat has stopped '
      + 'beating, or is still in an earlier turn',
      { waitingFor: msg.turn, barrier: this._barrierTurn(),
        horizon: [...this._horizon].map(([s, h]) => `${s}@${h.turn}`) });
  }

  /** Resolves when every input accepted so far has finished being applied. */
  settled() { return this._chain || Promise.resolve(); }

  /* ── issuing input ──────────────────────────────────────────────────────── */

  /**
   * Issue an input from THIS client and put it on the wire.
   *
   * The local board is not advanced here. The caller applies it, or waits for
   * `on('input')` like every remote input does — one path for both, so a bug in
   * ordering shows up locally instead of only over a real wire.
   *
   * @returns {object|null} the stamped input
   */
  input(o = {}) {
    if (!o || !o.t) { console.error('[net] input with no kind', o); return null; }
    if (o.seat !== undefined && o.seat !== this.seat) {
      // A client may only speak for its own seat. Anything else is a bug here,
      // not a hostile peer — but it would desync exactly like one.
      console.error(`[net] seat ${this.seat} tried to act for seat ${o.seat}`);
      return null;
    }
    const msg = {
      ...o,
      seat: this.seat,
      turn: this.turn(),
      seq: ++this._seq,
      clk: ++this._clock,
    };
    if (COMBAT_INPUT.has(o.t) && this.run?.currentNodeId) msg.node = this.run.currentNodeId;
    this._accept(msg);
    this.transport?.send({ k: WIRE.INPUT, i: msg });
    return msg;
  }

  /** The turn number every input is stamped with. */
  turn() {
    const e = this.run?.combat;
    return e && typeof e.turn === 'number' ? e.turn : 0;
  }

  /* ── receiving ──────────────────────────────────────────────────────────── */

  _onWire(m, from) {
    if (!m || !m.k) return;
    const speaker = m.k === WIRE.INPUT ? m.i?.seat : m.seat;
    if (speaker !== undefined) this._heard(speaker);
    else this._heard(this._seatOfId(from));
    switch (m.k) {
      case WIRE.HELLO:
        if (m.seed !== this.seed) {
          // Different seed means different everything. Say so at once rather
          // than letting two people play two games that look like one.
          this._diverge({ reason: 'seed', theirs: m.seed, ours: this.seed, from });
        }
        break;
      case WIRE.INPUT:
        if (m.i) this._clock = Math.max(this._clock, m.i.clk | 0);
        if (this._frozen) { this._buffered.push(m.i); this.beat(); break; }
        this._accept(m.i, from);
        /* The ack that makes the agreed order cost a round trip rather than a beat. */
        if (m.i && COMBAT_INPUT.has(m.i.t)) this.beat();
        break;
      case WIRE.BEAT:
        this._note(m.seat, m.turn, m.seq, m.clk);
        this._pump();          // a beat can release what the barrier was holding
        break;
      case WIRE.DIGEST: this._checkDigest(m, from); break;
      /* Everybody answers these, not only seat 0. The host is a player like any
         other and may be the very one who has just dropped. */
      case WIRE.REJOIN:
        this._sendLog(this.log.slice(m.from | 0), from);
        break;
      case WIRE.RESEND:
        this._sendLog(this.log.filter(x => (x.seat | 0) === (m.seat | 0)), from);
        break;
      case WIRE.LOG:
        if (!m.to || m.to === this.transport?.id) {
          if (this._frozen) this._buffered.push(...(m.log || []));
          else if (m.to) this.absorb(m.log || []);
          else for (const x of m.log || []) this._accept(x, 'wire');
        }
        break;
      case WIRE.STATE_ASK: this._answerState(from); break;
      case WIRE.STATE: this._takeState(m); break;
      /* A lobby is talking to us: somebody has climbed the ladder after the party
         went in, or is coming back. The seat, if they have one, is theirs to claim. */
      case 'lobby:ask':
      case 'lobby:here':
        if (this.roster) this.transport?.send({ k: 'lobby:started', to: m.id || from, roster: this.roster });
        break;
      default: break;
    }
  }

  _onPeer(p) {
    if (p.joined) this.peers.add(p.id); else this.peers.delete(p.id);
    this._emit('peer', p);
    if (p.joined) { this.beat(); return; }
    const seat = this._seatOfId(p.id);
    if (seat != null) this._markLost(seat);
  }

  /**
   * Put an input into the total order and hand it to the game.
   *
   * The order is `(turn, seat, seq)`. Seat index is the tiebreaker and arrival
   * time is never consulted — arrival time is the one thing guaranteed to
   * differ between two machines, so ordering by it is ordering by nothing.
   *
   * ── AND THAT IS TRUE OF THE BOARD, NOT ONLY THE LOG ─────────────────────
   *
   * It was not, until 2026-08-29. `this.log` was sorted and `_run(msg)` applied
   * the message that had just ARRIVED, so two clients receiving the same two
   * inputs in opposite orders held identical logs and different boards. `_pump`
   * drains the log in order instead, one microtask later, so everything that
   * arrives in the same turn of the event loop is sorted before any of it is
   * applied. `tests/net` §4b measures both halves.
   *
   * An input arriving in a LATER task, sorting before one already applied, is
   * the case a microtask cannot reach — and it is ROUTINE, because both clients
   * apply their own input as they issue it. It is applied anyway and reported
   * only when it is a COMBAT input, because room inputs commute and combat
   * inputs do not. See `_accept`.
   *
   * Combat inputs no longer get that far — see `_heldByBarrier`, and `beat()`,
   * which is how a seat that is thinking says where it is.
   */
  _accept(msg, from) {
    if (!msg) return;
    if (msg.seat === this.seat && from) return;   // our own, echoed: rule 2
    /* Already have it: a resend, or the same page answered by two players. */
    if (this._seen.has(`${msg.seat | 0}:${msg.turn | 0}:${msg.seq | 0}`)) return;
    /* An input is itself a promise: `seq` is monotonic per author, so nothing
       older is still coming from that seat. Recorded before anything is
       applied, so an input can release the barrier it is itself queued behind. */
    this._note(msg.seat, msg.turn, msg.seq, msg.clk);
    this._clock = Math.max(this._clock, msg.clk | 0);
    const at = this._insertAt(msg);
    this.log.splice(at, 0, msg);
    this._record(msg);
    /* Out of band for the same reason as a CHOICE just below: the queue may be
       stopped on a question this seat will now never answer. The input itself
       still takes its place in the log and reaches `run.dropSeat` in order. */
    if (msg.act === 'seat.gone') this._emit('gone', { seat: msg.to | 0 });
    if (msg.act === 'seat.back') this._emit('back', { seat: msg.seat | 0 });
    /**
     * A CHOICE answer is delivered OUT OF BAND, and it has to be.
     *
     * `engine.choices.ask()` is awaited from inside a card effect, which is
     * inside an input the queue below is currently applying. Queue the answer
     * behind that input and the two wait for each other forever: the play
     * cannot finish until the choice arrives, and the choice cannot be applied
     * until the play finishes. It is a deadlock, not a slow frame.
     *
     * Ordering survives anyway, which is the part that matters: an answer is
     * not a new action in the sequence, it is the continuation of the one every
     * client is already blocked on, at the same point in the same input. It
     * still goes in the log, in its place, because a rejoin replays the log.
     */
    if (msg.t === INPUT.CHOICE) { this._emit('answer', msg); return; }
    /**
     * An input that sorts BEFORE one already applied, arriving in a later task
     * than the one it should have been sorted with.
     *
     * ── This is NORMAL, and for most inputs it is harmless ──────────────────
     *
     * Both clients apply their OWN input the moment they issue it, so whichever
     * seat acts second always sees the other's arrive "late" — seat index is
     * the tiebreaker and `turn` is 0 for every input outside combat. The first
     * version of this guard treated that as a desync and shouted six times
     * during an ordinary two-Kid reward screen.
     *
     * It is harmless because ROOM inputs COMMUTE. Every one of them acts on the
     * sender's own Kid — their deck, their purse, their Keepsakes — or adds to
     * a shared counter, and addition commutes. `map.vote` writes one seat's
     * slot in a ballot whose resolution sorts the seats itself. Apply them in
     * either order and both boards land in the same state, which is why this
     * has been silently fine for the whole life of the wire.
     *
     * COMBAT inputs do not commute. Playing a Trick changes the board every
     * other seat is about to read, so applying two of them in different orders
     * on two machines is a real divergence — and THAT is worth reporting at the
     * moment it happens, rather than leaving the digest to notice a turn later,
     * "a long way from the cause".
     *
     * Either way the input is APPLIED: the cursor has already passed its slot,
     * so the pump will not, and dropping it would turn a possible divergence
     * into a certain one.
     */
    if (at < this._applied) {
      this._applied++;
      /* PLAY and SNACK only. An END commutes as well: `endTurn(seat)` closes
         one seat and the enemy phase falls out of the LAST one to close,
         whichever that is, so two ENDs in either order leave the same board
         — and two Kids ending their turns at once is the most ordinary
         thing that happens in a co-op fight, which is what a first version
         of this shouted about twice per round. */
      if (msg.t === INPUT.PLAY || msg.t === INPUT.SNACK) {
        console.error('[net] DESYNC {reason: late-input} a COMBAT input arrived '
          + 'after one that sorts after it; the board has already moved',
          { turn: msg.turn, seat: msg.seat, seq: msg.seq, t: msg.t });
        this._emit('desync', { reason: 'late-input', msg });
      }
      this._runOne(msg);
      return;
    }
    this._pump();
  }

  /** How far through `this.log` the board has been advanced. */
  _applied = 0;

  _insertAt(msg) {
    const key = (m) => [m.turn | 0, m.clk | 0, m.seat | 0, m.seq | 0];
    const k = key(msg);
    const notAfter = (o) => {
      for (let n = 0; n < k.length; n++) if (o[n] !== k[n]) return o[n] < k[n];
      return true;
    };
    for (let i = this.log.length - 1; i >= 0; i--) {
      if (notAfter(key(this.log[i]))) return i + 1;
    }
    return 0;
  }

  /**
   * Take a log from a peer after a rejoin and play the parts we are missing.
   *
   * `absorbing` is true for the duration, and it is not bookkeeping: the game
   * layer has beats that exist to be WATCHED — `run._walkAfterVote` holds for
   * a second and a half so the party can read which room the roulette chose —
   * and a client catching up on twenty rooms must not sit through them. There
   * is nobody watching a replay; that is what makes it a replay.
   */
  absorb(log) {
    let taken = 0;
    this.absorbing = true;
    try {
      for (const msg of log) {
        if (this._seen.has(`${msg.seat | 0}:${msg.turn | 0}:${msg.seq | 0}`)) continue;
        this._accept(msg);
        taken++;
      }
    } finally {
      /* NOT cleared here. `_accept` only queues; the inputs are applied a
         microtask later, by which time a flag cleared on this line says "live"
         for every one of them and the replay sits through every beat. */
      const done = () => { this.absorbing = false; };
      this.settled().then(done, done);
    }
    return taken;
  }

  /** Ask the host for everything after what we already have. */
  rejoin() {
    const mine = this.log.length;
    this.transport?.send({ k: WIRE.REJOIN, from: mine, seat: this.seat });
    return mine;
  }

  /* ── divergence ─────────────────────────────────────────────────────────── */

  /**
   * Publish this client's board fingerprint. Called at every turn boundary.
   *
   * The digest is `run._combatDigest()` — the same function a local resume
   * already trusts, which covers every seat's Courage, Guard, Nerve, hand
   * contents and pile sizes as well as the enemies.
   */
  publishDigest() {
    const run = this.run;
    if (!run || !run.combat || typeof run._combatDigest !== 'function') return null;
    const digest = run._combatDigest(run.combat);
    const turn = `${run.currentNodeId || ''}#${this.turn()}`;
    this._publish(turn, digest);
    return digest;
  }

  /** The same, for a stretch outside a fight: `at` names the room being walked into. */
  publishRoomDigest(at) {
    const run = this.run;
    if (!run || typeof run._partyDigest !== 'function') return null;
    const digest = run._partyDigest();
    this._publish(`room:${at}`, digest);
    return digest;
  }

  _publish(turn, digest) {
    /* Theirs may be in already: whoever gets here second makes the comparison,
       or a fast peer's digest would only ever be compared by the fast peer. */
    this._compare(turn, digest, this._digests.get(`${turn}:peer`), null);
    this._digests.set(`${turn}:${this.seat}`, digest);
    this.transport?.send({ k: WIRE.DIGEST, turn, seat: this.seat, digest });
  }

  _checkDigest(m, from) {
    const mine = this._digests.get(`${m.turn}:${this.seat}`);
    this._digests.set(`${m.turn}:${m.seat}`, m.digest);
    if (!this._digests.has(`${m.turn}:peer`)) this._digests.set(`${m.turn}:peer`, m.digest);
    this._compare(m.turn, mine, m.digest, from);
  }

  _compare(turn, ours, theirs, from) {
    if (!ours || !theirs || ours === theirs) return;
    this._diverge({ reason: 'digest', turn, ours, theirs, from });
  }

  _diverge(info) {
    if (this.divergedAt) return;              // report once, not once per event
    this.divergedAt = info;
    console.error('[net] DESYNC', info);
    this._emit('diverge', info);
  }

  /** True while every client that has reported agrees with us. */
  get inSync() { return !this.divergedAt; }

  close() {
    if (this._beatTimer) { clearInterval(this._beatTimer); this._beatTimer = null; }
    for (const off of this._offs) { try { off(); } catch { /* already gone */ } }
    this._offs.length = 0;
    for (const s of Object.values(this._listeners)) s.clear();
    this.transport?.close();
    if (this.run && this.run.session === this) this.run.session = null;
  }
}

/**
 * A session for a game that is NOT networked.
 *
 * Solo and pass-and-play both run without one, and `shouldHandOff()` reads
 * `run.session && run.session.remote` — so the absence of a session means "this
 * screen is shared" and its presence means "this client owns one seat". Nothing
 * needs a null check for the local case; that is why this is not the default.
 */
export const LOCAL_SESSION = null;
