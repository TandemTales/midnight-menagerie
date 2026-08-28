/**
 * Transports. OWNER: foundation.
 *
 * A Transport is the only thing that knows HOW bytes move. It has no opinion
 * about the game and the game has no opinion about it, which is the whole
 * point: the designer chose Steam P2P, that needs a wrapper shell, and a
 * wrapper shell cannot exist inside a no-build browser project. So the wire is
 * defined here as an interface, two transports that DO work today implement it,
 * and Steam becomes a third file rather than a rewrite.
 *
 *   const t = new LoopbackTransport();          // in one page, for tests
 *   const t = new ChannelTransport('mm:abc');   // two tabs on one machine
 *   const t = new SteamTransport(lobby);        // does not exist yet
 *
 * The contract, in full:
 *
 *   id                    string, stable for the life of this peer
 *   send(msg)             deliver a plain JSON-able object to every OTHER peer
 *   onMessage(fn)         fn(msg, fromId); returns an unsubscribe
 *   onPeer(fn)            fn({ id, joined }); returns an unsubscribe
 *   close()               release everything; safe to call twice
 *
 * Two rules a transport must honour, because `net/session.js` is lockstep and
 * cannot recover from either being broken:
 *
 *   1. ORDER IS PRESERVED per sender. Lockstep replays inputs in the order they
 *      were issued; a transport that reorders one peer's messages produces two
 *      different boards from the same seed.
 *   2. NOTHING IS DELIVERED TO ITSELF. The sender has already applied its own
 *      input locally — echoing it back would apply it twice, which the session
 *      would see as a divergence rather than as a duplicate.
 *
 * Neither is guaranteed by every real transport. Steam's P2P has reliable and
 * unreliable channels; the session's traffic must go on a reliable, ordered
 * one. Say so here so nobody has to rediscover it.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   LOOPBACK — several peers in one page.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A transport with no wire at all.
 *
 * Peers created from the same `LoopbackHub` deliver to each other synchronously.
 * This is what makes the netcode testable without a network, a build step or a
 * second machine: `tests/net/` runs two full Sessions in one page and asserts
 * they compute identical boards.
 *
 * It is deliberately synchronous. A real transport is not, and the session is
 * written to tolerate that (it applies remote input when it arrives rather than
 * assuming it already has); an asynchronous loopback is available through
 * `new LoopbackHub({ async: true })` and the tests use both.
 */
export class LoopbackHub {
  constructor(o = {}) {
    this.peers = new Map();
    this.async = !!o.async;
    this._seq = 0;
    /** Every message that has crossed, for a test to inspect. */
    this.traffic = [];
  }

  peer(id) {
    const p = new LoopbackTransport(this, id || `p${++this._seq}`);
    this.peers.set(p.id, p);
    for (const other of this.peers.values()) {
      if (other !== p) { other._peerJoined(p.id); p._peerJoined(other.id); }
    }
    return p;
  }

  _deliver(from, msg) {
    this.traffic.push({ from, msg });
    for (const p of this.peers.values()) {
      if (p.id === from) continue;            // rule 2: never to itself
      if (this.async) Promise.resolve().then(() => p._receive(msg, from));
      else p._receive(msg, from);
    }
  }

  close() { for (const p of [...this.peers.values()]) p.close(); }
}

export class LoopbackTransport {
  constructor(hub, id) {
    this.hub = hub;
    this.id = id;
    this._msg = new Set();
    this._peer = new Set();
    this.closed = false;
  }

  send(msg) {
    if (this.closed) return false;
    this.hub._deliver(this.id, msg);
    return true;
  }

  onMessage(fn) { this._msg.add(fn); return () => this._msg.delete(fn); }
  onPeer(fn) { this._peer.add(fn); return () => this._peer.delete(fn); }

  _receive(msg, from) { for (const fn of this._msg) fn(msg, from); }
  _peerJoined(id) { for (const fn of this._peer) fn({ id, joined: true }); }
  _peerLeft(id) { for (const fn of this._peer) fn({ id, joined: false }); }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.hub.peers.delete(this.id);
    for (const p of this.hub.peers.values()) p._peerLeft(this.id);
    this._msg.clear();
    this._peer.clear();
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   BROADCAST CHANNEL — two browser tabs on one machine.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A real transport, built on a browser primitive, with no dependencies and no
 * build step.
 *
 * It only connects tabs of the same origin on the same machine, so it is not
 * the shipping answer — but it IS a genuine asynchronous wire between two
 * independent game instances, which is the thing that finds bugs a loopback
 * cannot: real message latency, real event-loop interleaving, and each side
 * genuinely owning only its own seat.
 *
 * `BroadcastChannel` never delivers to the posting context, which satisfies
 * rule 2 for free, and it is ordered per sender, which satisfies rule 1.
 */
export class ChannelTransport {
  /**
   * @param {string} room  every peer in the same expedition uses the same name
   * @param {string} [id]  this peer's id; generated if absent
   */
  constructor(room, id) {
    this.id = id || `p${Math.random().toString(36).slice(2, 10)}`;
    this.room = room;
    this._msg = new Set();
    this._peer = new Set();
    this.closed = false;
    this.known = new Set();

    this.ch = new BroadcastChannel(room);
    this.ch.onmessage = (ev) => {
      const { from, kind, msg } = ev.data || {};
      if (!from || from === this.id) return;
      if (!this.known.has(from)) {
        this.known.add(from);
        for (const fn of this._peer) fn({ id: from, joined: true });
        // Answer a hello so the newcomer learns about us too.
        if (kind === 'hello') this.ch.postMessage({ from: this.id, kind: 'hi' });
      }
      if (kind === 'msg') for (const fn of this._msg) fn(msg, from);
      if (kind === 'bye') {
        this.known.delete(from);
        for (const fn of this._peer) fn({ id: from, joined: false });
      }
    };
    this.ch.postMessage({ from: this.id, kind: 'hello' });
  }

  send(msg) {
    if (this.closed) return false;
    this.ch.postMessage({ from: this.id, kind: 'msg', msg });
    return true;
  }

  onMessage(fn) { this._msg.add(fn); return () => this._msg.delete(fn); }
  onPeer(fn) { this._peer.add(fn); return () => this._peer.delete(fn); }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.ch.postMessage({ from: this.id, kind: 'bye' }); } catch { /* closing */ }
    try { this.ch.close(); } catch { /* already gone */ }
    this._msg.clear();
    this._peer.clear();
  }
}

/** Is a two-tab wire available in this environment at all? */
export const canChannel = () => typeof BroadcastChannel === 'function';
