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
 * NOT built: a transport that reaches another machine. Steam P2P per the
 * designer's decision, which needs a wrapper shell and ends the no-build rule —
 * one file implementing the five methods in `net/transport.js`.
 * See `docs/notes/2026-08-29-the-wire-reaches-the-screens.md`.
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
});

export class Session {
  /**
   * @param {object}  o
   * @param {object}  o.transport  see net/transport.js
   * @param {number}  o.seat       which seat THIS client owns
   * @param {number}  o.seats      how many seats the party has
   * @param {number}  o.seed       the expedition seed, identical on every client
   * @param {boolean} [o.host]     one client resolves rejoin requests
   */
  constructor(o = {}) {
    this.transport = o.transport;
    this.seat = o.seat | 0;
    this.seats = Math.max(1, o.seats | 0 || 1);
    this.seed = o.seed | 0;
    this.host = !!o.host;

    /** The thing `shouldHandOff()` reads: a wire owns the seats, so no veil. */
    this.remote = true;

    /** Every input, in the total order every client agrees on. */
    this.log = [];
    /** Inputs that arrived for a turn we have not reached yet. */
    this._pending = [];
    /** Our own monotonic counter, so our inputs have a stable order. */
    this._seq = 0;
    /** Digests other peers reported, by `${turn}:${peerSeat}`. */
    this._digests = new Map();

    this.run = null;
    this.peers = new Set();
    this.divergedAt = null;
    this._offs = [];
    this._listeners = { input: new Set(), diverge: new Set(), peer: new Set(), answer: new Set() };

    if (this.transport) {
      this._offs.push(this.transport.onMessage((m, from) => this._onWire(m, from)));
      this._offs.push(this.transport.onPeer((p) => this._onPeer(p)));
      this.transport.send({ k: WIRE.HELLO, seat: this.seat, seed: this.seed });
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
   * cannot be put back in its place — the board has moved. That is a genuine
   * divergence and `_accept` reports it as one rather than applying it out of
   * order and leaving the digest to notice a turn later, a long way from the
   * cause. Closing that needs a turn barrier and idle heartbeats, which is a
   * protocol decision belonging with the transport work.
   */
  /** One message, out of band, because the cursor has already passed it. */
  _runOne(msg) {
    this._chain = (this._chain || Promise.resolve()).then(async () => {
      for (const fn of this._listeners.input) {
        try { await fn(msg); } catch (err) { console.error('[net] applying input', msg, err); }
      }
    });
    return this._chain;
  }

  _pump() {
    this._chain = (this._chain || Promise.resolve()).then(async () => {
      while (this._applied < this.log.length) {
        const msg = this.log[this._applied++];
        // A CHOICE is delivered out of band by `_accept`; it is in the log so a
        // rejoin replays it, and it must not be applied as an input here.
        if (msg.t === INPUT.CHOICE) continue;
        for (const fn of this._listeners.input) {
          try { await fn(msg); } catch (err) { console.error('[net] applying input', msg, err); }
        }
      }
    });
    return this._chain;
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
    };
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
    switch (m.k) {
      case WIRE.HELLO:
        if (m.seed !== this.seed) {
          // Different seed means different everything. Say so at once rather
          // than letting two people play two games that look like one.
          this._diverge({ reason: 'seed', theirs: m.seed, ours: this.seed, from });
        }
        break;
      case WIRE.INPUT: this._accept(m.i, from); break;
      case WIRE.DIGEST: this._checkDigest(m, from); break;
      case WIRE.REJOIN:
        if (this.host) this.transport?.send({ k: WIRE.LOG, to: from, log: this.log.slice(m.from | 0) });
        break;
      case WIRE.LOG:
        if (m.to === this.transport?.id) this.absorb(m.log || []);
        break;
      default: break;
    }
  }

  _onPeer(p) {
    if (p.joined) this.peers.add(p.id); else this.peers.delete(p.id);
    this._emit('peer', p);
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
   * Closing even that needs a turn barrier and idle heartbeats so a client
   * knows when it is safe to advance — a protocol decision that belongs with
   * the transport work, and there is no transport yet.
   */
  _accept(msg, from) {
    if (!msg) return;
    if (msg.seat === this.seat && from) return;   // our own, echoed: rule 2
    const at = this._insertAt(msg);
    this.log.splice(at, 0, msg);
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
    const key = (m) => [m.turn | 0, m.seat | 0, m.seq | 0];
    const k = key(msg);
    for (let i = this.log.length - 1; i >= 0; i--) {
      const o = key(this.log[i]);
      if (o[0] < k[0] || (o[0] === k[0] && (o[1] < k[1] || (o[1] === k[1] && o[2] <= k[2])))) {
        return i + 1;
      }
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
        if (this.log.some(x => x.seat === msg.seat && x.seq === msg.seq)) continue;
        this._accept(msg);
        taken++;
      }
    } finally {
      this.absorbing = false;
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
    const turn = this.turn();
    this._digests.set(`${turn}:${this.seat}`, digest);
    this.transport?.send({ k: WIRE.DIGEST, turn, seat: this.seat, digest });
    return digest;
  }

  _checkDigest(m, from) {
    const mine = this._digests.get(`${m.turn}:${this.seat}`);
    this._digests.set(`${m.turn}:${m.seat}`, m.digest);
    if (!mine || !m.digest) return;
    if (mine !== m.digest) {
      this._diverge({ reason: 'digest', turn: m.turn, ours: mine, theirs: m.digest, from });
    }
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
