/**
 * The lobby: who is here, who is seat 0, and what seed we are all playing.
 * OWNER: netcode.
 *
 *   const l = new Lobby({ transport, room: 'mm-parlour' });
 *   l.setChoice({ companion: 'marmalade', kid: 'maya' });
 *   l.setReady(true);
 *   l.on('change', render);
 *   …when everyone is ready…
 *   const { seat, seats, seed, host, party } = l.start();
 *   const session = new Session({ transport, seat, seats, seed, host });
 *
 * `net/session.js` takes `seat`, `seats`, `seed` and `host` as constructor
 * arguments and has no opinion about where they come from. This is where they
 * come from. It is separate because the SESSION is lockstep and the LOBBY is
 * not — before the first input there is no shared clock to be in step with, so
 * the lobby has to agree on everything by construction rather than by ordering.
 *
 * ── The three decisions, and why none of them needs an election ─────────────
 *
 * 1. SEAT IS POSITION IN THE SORTED PEER-ID LIST. Every client sees the same
 *    set of ids and sorts it the same way, so every client computes the same
 *    seat for every player with no message, no round trip and no tiebreak.
 *
 *    Assigning by arrival — "first to connect is seat 0" — is the obvious
 *    alternative and it is the one thing lockstep cannot use: arrival order is
 *    exactly what differs between machines. It is the same reason
 *    `session._insertAt` orders inputs by `(turn, seat, seq)` and never by when
 *    they landed.
 *
 *    Compared by CODE UNIT (`a < b`), never `localeCompare`, which is
 *    locale-dependent and would seat two players differently on two machines
 *    with different language settings. That would be an invisible desync from
 *    the very first card.
 *
 * 2. THE HOST IS SEAT 0. It falls out of (1), so there is nothing to elect. The
 *    host's only job is answering `WIRE.REJOIN` with the input log, and any seat
 *    can do it — what matters is that everybody names the SAME one.
 *
 * 3. THE SEED IS A HASH OF THE ROOM CODE. Not proposed by the host and agreed
 *    by the rest: derived, identically, by everyone, from the string they all
 *    typed to get here. `Session` already detects a seed mismatch at hello and
 *    reports DESYNC — this makes the mismatch impossible instead. It also means
 *    sharing a room code shares a run, which is a feature rather than a leak:
 *    a seed is not a secret in this game, it is the map.
 *
 * ── The roster FREEZES at start ─────────────────────────────────────────────
 *
 * Seats renumber freely while people are still arriving — that is what (1) is
 * for. The moment `start()` is called they stop, because a seat index is what
 * every input is stamped with and what every tie breaks on. A player who joins
 * after that is not a fifth Kid; they are a spectator or a rejoin, and rejoin is
 * `session.rejoin()`, which replays the log against the seat they already had.
 */

// The engine's own constant, never a literal — `scenes/select.js` generates its
// party-size control from the same one so a screen can never offer a party the
// engine refuses. CONTRACTS, "Co-op: up to four Kids".
import { MAX_PARTY } from '../combat/engine.js';

/** Lobby messages. Deliberately not `WIRE.*` — this is a different protocol. */
const LOBBY = Object.freeze({
  HERE: 'lobby:here',      // { companion, kid, name, ready }  I am here, this is me
  ASK: 'lobby:ask',        // {}                               who is here?
  GO: 'lobby:go',          // { at }                           everyone start
});

/**
 * A stable 32-bit hash of a string, identical in every JS engine.
 *
 * FNV-1a, `>>> 0` at every step so it never touches the float path. `Math.imul`
 * because a plain `*` on two 32-bit values overflows into doubles and loses the
 * low bits — which would still be deterministic, but only until one engine
 * optimises it differently. This has to be exact on four machines.
 */
export function seedFromRoom(room) {
  let h = 0x811c9dc5;
  const s = String(room || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 0 is a legal seed but reads as "unset" in a dozen places; nudge it.
  return h === 0 ? 1 : h;
}

/** Code-unit order. Never `localeCompare` — see the header. */
const bySeat = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class Lobby {
  /**
   * @param {object} o
   * @param {object} o.transport  see net/transport.js
   * @param {string} o.room       the code every player in this expedition typed
   * @param {number} [o.seats]    cap; defaults to MAX_PARTY
   */
  constructor(o = {}) {
    this.transport = o.transport;
    this.room = String(o.room || '');
    this.seed = o.seed != null ? (o.seed | 0) : seedFromRoom(this.room);
    this.cap = Math.max(1, Math.min(MAX_PARTY, o.seats | 0 || MAX_PARTY));
    this.started = false;
    /** Frozen at `start()`: the roster every client agreed on. */
    this.roster = null;

    this.me = {
      id: this.transport ? this.transport.id : 'local',
      companion: o.companion || null,
      kid: o.kid || null,
      name: o.name || '',
      ready: false,
    };
    /** id -> { id, companion, kid, name, ready } */
    this._peers = new Map([[this.me.id, this.me]]);
    this._listeners = { change: new Set(), start: new Set() };
    this._offs = [];

    if (this.transport) {
      this._offs.push(this.transport.onMessage((m, from) => this._onWire(m, from)));
      this._offs.push(this.transport.onPeer((p) => this._onPeer(p)));
      // Announce, and ask: a peer that arrives second has to learn about the
      // one already sitting there, and a peer that arrives first has to hear
      // about the newcomer. One message each way covers both.
      this._say(LOBBY.ASK, {});
      this._announce();
    }
  }

  /* ── who is here ──────────────────────────────────────────────────────── */

  /** Everyone in the room, in SEAT ORDER. */
  get players() {
    return [...this._peers.values()].sort(bySeat);
  }

  /** This client's seat, or -1 if the room is over capacity and we are out. */
  get seat() {
    const i = this.players.findIndex(p => p.id === this.me.id);
    return i < this.cap ? i : -1;
  }

  /** How many seats this expedition will have. */
  get seats() { return Math.min(this.cap, this._peers.size); }

  /** True when this client is the one that answers rejoin requests. */
  get isHost() { return this.seat === 0; }

  /** The id of whoever seat 0 is, on every client alike. */
  get hostId() { return (this.players[0] || {}).id || null; }

  /** Everyone has chosen a Companion and a Kid, and said they are ready. */
  get allReady() {
    const p = this.players.slice(0, this.cap);
    return p.length > 0 && p.every(x => x.ready && x.companion && x.kid);
  }

  /** Is the room full? */
  get isFull() { return this._peers.size >= this.cap; }

  /* ── my own choices ───────────────────────────────────────────────────── */

  setChoice({ companion, kid, name } = {}) {
    if (companion !== undefined) this.me.companion = companion;
    if (kid !== undefined) this.me.kid = kid;
    if (name !== undefined) this.me.name = name;
    // Changing your Kid un-readies you. Otherwise a player can lock in, swap to
    // somebody else's Kid, and the roster that starts is not the one anybody
    // agreed to.
    this.me.ready = false;
    this._announce();
    this._emit('change');
    return this.me;
  }

  setReady(v = true) {
    this.me.ready = !!v;
    this._announce();
    this._emit('change');
    return this.me.ready;
  }

  /* ── starting ─────────────────────────────────────────────────────────── */

  /**
   * Freeze the roster and hand back everything `Session` and `startRun` need.
   *
   * Every client calls this and every client computes the same answer, because
   * every field of it is derived from the sorted peer list and the room code.
   * Nothing is sent to agree it; `LOBBY.GO` only tells the others to call this
   * too, and a client that starts a beat later gets the identical roster.
   */
  start() {
    if (this.roster) return this.roster;
    const players = this.players.slice(0, this.cap);
    this.roster = {
      seat: players.findIndex(p => p.id === this.me.id),
      seats: players.length,
      seed: this.seed,
      host: players.length > 0 && players[0].id === this.me.id,
      hostId: (players[0] || {}).id || null,
      // What `ctx.startRun({ party })` wants, in seat order.
      party: players.map(p => ({ companion: p.companion, kid: p.kid })),
      ids: players.map(p => p.id),
    };
    this.started = true;
    this._emit('start', this.roster);
    this._emit('change');
    return this.roster;
  }

  /** Tell the room to start, and start. Only meaningful from the host. */
  go() {
    this._say(LOBBY.GO, { at: Date.now() });
    return this.start();
  }

  /* ── wire ─────────────────────────────────────────────────────────────── */

  _say(k, body) { this.transport?.send({ k, ...body, id: this.me.id }); }

  _announce() {
    this._say(LOBBY.HERE, {
      companion: this.me.companion, kid: this.me.kid,
      name: this.me.name, ready: this.me.ready,
    });
  }

  _onWire(m, from) {
    if (!m || !m.k || this.started) return;
    const id = m.id || from;
    switch (m.k) {
      case LOBBY.HERE: {
        this._peers.set(id, {
          id, companion: m.companion || null, kid: m.kid || null,
          name: m.name || '', ready: !!m.ready,
        });
        this._emit('change');
        break;
      }
      case LOBBY.ASK:
        // Somebody just arrived and wants the room. Answering with our own row
        // is enough — theirs reached us as the HERE that came with it.
        this._announce();
        break;
      case LOBBY.GO:
        this.start();
        break;
      default: break;
    }
  }

  _onPeer(p) {
    if (this.started) return;
    if (p.joined) this._announce();
    else { this._peers.delete(p.id); this._emit('change'); }
  }

  /* ── plumbing ─────────────────────────────────────────────────────────── */

  on(kind, fn) {
    const set = this._listeners[kind];
    if (!set) return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }
  _emit(kind, payload) {
    for (const fn of this._listeners[kind] || []) {
      try { fn(payload); } catch (err) { console.error('[lobby]', err); }
    }
  }

  close() {
    for (const off of this._offs) { try { off(); } catch { /* already gone */ } }
    this._offs.length = 0;
    for (const s of Object.values(this._listeners)) s.clear();
  }
}

export default { Lobby, seedFromRoom };
