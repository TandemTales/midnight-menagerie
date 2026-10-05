/**
 * Steam, on the shell's side of the bridge.
 *
 * Everything that touches steamworks.js lives here, in the MAIN process. The
 * renderer never sees a bigint, a Lobby object or a Buffer: it asks over IPC
 * and hears back plain JSON (`preload.js` is the other half).
 *
 * ── HOW A ROOM BECOMES A STEAM LOBBY ────────────────────────────────────────
 *
 * The game's co-op door is a password (`scenes/lobby.js`), and the password is
 * ALSO the seed, so both ends must type the same words. Over Steam that becomes:
 *
 *   open(room)   search the app's lobbies for one tagged `mm_room = room`;
 *                join it if there is one with a free seat, else create it.
 *
 *   two people pressing "Climb up" in the same second both find nothing and
 *   both create, so a lobby that is still alone keeps looking, and the HIGHER
 *   id moves into the LOWER one. Both sides apply the same rule, so they cannot
 *   swap past each other.
 *
 *   Steam "Join Game" / an accepted invite arrives as GameLobbyJoinRequested
 *   (or `+connect_lobby <id>` on the command line when the game was not
 *   running). The shell joins that lobby, reads its room, and tells the game,
 *   which opens the lobby scene on that room. Lobby SEARCH only reaches
 *   players in nearby regions; invites reach everyone, so they are the path
 *   that always works.
 *
 * ── THE WIRE ────────────────────────────────────────────────────────────────
 *
 * ISteamNetworking P2P, `Reliable`: ordered per sender, relayed through Valve
 * when NAT gets in the way, never delivered to its sender. That is exactly the
 * two rules in `game/src/net/transport.js`. Every packet carries its room so a
 * straggler from the lobby somebody just left cannot land in the next one.
 *
 * ── TOKENS ──────────────────────────────────────────────────────────────────
 *
 * The renderer can close one transport and open the next faster than a lobby
 * join resolves. Every open carries a token; anything that finishes under a
 * stale token is undone, and a close under a stale token is ignored. Without
 * that, the old transport's close() leaves the lobby the invite just joined.
 */
const V = '1';                         // bump when the wire changes: old builds stop matching
const POLL_MS = 8;
const MEMBERS_MS = 250;
const DEDUPE_MS = 2000;
const BUFFER_CAP = 512;

class SteamHost {
  /**
   * @param {object} o
   * @param {number} o.appId           0 = no Steam
   * @param {(ch:string, payload:any) => void} o.send   to the renderer
   * @param {object} [o.sw]            the steamworks.js module; injected by tests
   * @param {(fn:Function, ms:number) => any} [o.every]  setInterval; injected by tests
   */
  constructor(o) {
    this.appId = o.appId | 0;
    this._send = o.send;
    this._sw = o.sw || null;
    this._every = o.every || setInterval;
    this.client = null;
    this.me = '';
    this.name = '';
    this.reason = this.appId ? 'not started' : 'no App ID (shell/steam_appid.txt is empty)';
    this.token = null;          // the renderer's live transport
    this.cur = null;            // { lobby, room, token, known:Set, created, buf:[] }
    this._invite = null;        // a room waiting for the renderer to be ready
    this._inviteReady = false;
    this._timers = [];
    this._handles = [];
    this._busy = false;
  }

  /* ── lifecycle ────────────────────────────────────────────────────────── */

  start() {
    if (!this.appId) { console.warn(`[steam] ${this.reason}`); return false; }
    try {
      const sw = this._sw || (this._sw = require('steamworks.js'));
      this.client = sw.init(this.appId);
      const id = this.client.localplayer.getSteamId();
      this.me = id.steamId64.toString();
      this.name = this.client.localplayer.getName();
      this.reason = '';
    } catch (e) {
      this.client = null;
      this.reason = `Steam did not start: ${e && e.message || e}. Is the Steam client running, and does this account have app ${this.appId}?`;
      console.warn(`[steam] ${this.reason}`);
      return false;
    }
    const cb = this._sw.SteamCallback || this.client.callback.SteamCallback;
    const on = (k, fn) => { try { this._handles.push(this.client.callback.register(cb[k], fn)); } catch (e) { console.warn(`[steam] ${k}`, e); } };
    on('P2PSessionRequest', ({ remote }) => this._onSessionRequest(remote));
    on('GameLobbyJoinRequested', ({ lobby_steam_id }) => this.joinById(lobby_steam_id));
    this._timers.push(this._every(() => this._pump(), POLL_MS));
    this._timers.push(this._every(() => this._members(), MEMBERS_MS));
    this._timers.push(this._every(() => this._dedupe(), DEDUPE_MS));
    console.log(`[steam] up: app ${this.appId}, ${this.name} (${this.me})`);
    return true;
  }

  get available() { return !!this.client; }

  info() {
    let deck = false;
    try { deck = !!this.client?.utils.isSteamRunningOnSteamDeck(); } catch { /* old client */ }
    return { available: this.available, appId: this.appId, me: this.me, name: this.name, deck, reason: this.reason };
  }

  shutdown() {
    this._leave();
    for (const t of this._timers) clearInterval(t);
    for (const h of this._handles) { try { h.disconnect(); } catch { /* gone */ } }
    this._timers = []; this._handles = [];
  }

  /* ── IPC ──────────────────────────────────────────────────────────────── */

  wire(ipc) {
    ipc.on('mm:steam-info', (e) => { e.returnValue = this.info(); });
    ipc.handle('mm:steam-call', (_e, op, a, b) => this.call(op, a, b));
    ipc.on('mm:net-open', (_e, o) => { this.open(o).catch(err => console.warn('[steam] open', err)); });
    ipc.on('mm:net-send', (_e, o) => { this.sendAll(o.token, o.msg); });
    ipc.on('mm:net-close', (_e, o) => { this.close(o.token); });
    ipc.on('mm:invite-ready', () => { this._inviteReady = true; this._flushInvite(); });
  }

  /** Achievements, stats and the Deck keyboard: the `steam` half of the host contract. */
  async call(op, a, b) {
    const c = this.client;
    if (!c) return op === 'showKeyboard' ? null : false;
    switch (op) {
      case 'setAchievement': return c.achievement.activate(String(a));
      case 'clearAchievement': return c.achievement.clear(String(a));
      case 'getAchievement': return c.achievement.isActivated(String(a));
      case 'setStat': return c.stats.setInt(String(a), b | 0);
      case 'storeStats': return c.stats.store();
      case 'showKeyboard': {
        const o = a || {};
        return c.utils.showGamepadTextInput(0, 0, String(o.description || ''), o.max | 0 || 40, o.text || '');
      }
      default: return false;
    }
  }

  /* ── the room ─────────────────────────────────────────────────────────── */

  async open({ room, seats, token }) {
    room = String(room || '');
    this.token = token;
    if (!this.client || !room) return;

    // An invite already put us in this room: adopt it rather than search.
    if (this.cur && this.cur.room === room && this.cur.token == null) {
      this.cur.token = token;
      this._invite = null;
      for (const id of this.cur.known) this._emit('peer', { id, joined: true });
      for (const m of this.cur.buf.splice(0)) this._emit('msg', m);
      this._members();
      return;
    }
    this._leave();

    const mm = this.client.matchmaking;
    let lobby = null, created = false;
    try {
      const all = await mm.getLobbies();
      if (this.token !== token) return;
      const fit = all
        .filter(l => this._isRoom(l, room) && this._hasSeat(l))
        .sort((x, y) => (x.id < y.id ? -1 : 1))[0];
      if (fit) lobby = await fit.join();
    } catch (e) { console.warn('[steam] search', e); }
    if (this.token !== token) { try { lobby?.leave(); } catch {} return; }

    if (!lobby) {
      lobby = await mm.createLobby(2 /* Public: the password is the way in */, Math.max(2, seats | 0 || 4));
      created = true;
      if (this.token !== token) { try { lobby.leave(); } catch {} return; }
      lobby.mergeFullData({ mm_room: room, mm_v: V });
    }
    this.cur = { lobby, room, token, known: new Set(), created, buf: [] };
    this._presence();
    this._members();
  }

  close(token) {
    if (token !== this.token) return;     // a stale transport closing late
    this.token = null;
    if (this.cur && this.cur.token === token) this._leave();
  }

  sendAll(token, msg) {
    const c = this.cur;
    if (!this.client || !c || token !== c.token) return false;
    const buf = Buffer.from(JSON.stringify({ r: c.room, m: msg }));
    let ok = true;
    for (const id of this._memberIds()) {
      ok = this.client.networking.sendP2PPacket(BigInt(id), 2 /* Reliable */, buf) && ok;
    }
    return ok;
  }

  /** Steam "Join Game", an accepted invite, or `+connect_lobby <id>`. */
  async joinById(id) {
    if (!this.client) return;
    let lobby;
    try {
      lobby = await this.client.matchmaking.joinLobby(BigInt(id));
    } catch (e) { console.warn('[steam] join', id, e); return; }
    const room = lobby.getData('mm_room');
    if (!room || lobby.getData('mm_v') !== V) {
      console.warn(`[steam] lobby ${id} is not a Midnight Menagerie room of this version`);
      try { lobby.leave(); } catch {}
      return;
    }
    if (this.cur && this.cur.lobby.id === lobby.id) return;
    this._leave();
    // No token yet: the game opens the lobby scene on this room and adopts it.
    this.token = null;
    this.cur = { lobby, room, token: null, known: new Set(), created: false, buf: [] };
    this._presence();
    this._members();
    this._invite = room;
    this._flushInvite();
  }

  /* ── plumbing ─────────────────────────────────────────────────────────── */

  _isRoom(l, room) {
    try { return l.getData('mm_room') === room && l.getData('mm_v') === V; } catch { return false; }
  }
  _hasSeat(l) {
    try {
      const n = Number(l.getMemberCount()), cap = l.getMemberLimit();
      return n > 0 && (cap == null || n < Number(cap));
    } catch { return false; }
  }

  _memberIds() {
    if (!this.cur) return [];
    try {
      return this.cur.lobby.getMembers().map(p => p.steamId64.toString()).filter(id => id !== this.me);
    } catch { return []; }
  }

  _emit(type, body) {
    const c = this.cur;
    if (!c) return;
    if (c.token == null) {
      // Joined by invite, game not caught up yet: hold messages, re-announce peers on adopt.
      if (type === 'msg' && c.buf.length < BUFFER_CAP) c.buf.push(body);
      return;
    }
    this._send('mm:net', { token: c.token, type, ...body });
  }

  _members() {
    const c = this.cur;
    if (!c) return;
    const now = new Set(this._memberIds());
    for (const id of now) if (!c.known.has(id)) { c.known.add(id); this._emit('peer', { id, joined: true }); }
    for (const id of [...c.known]) if (!now.has(id)) { c.known.delete(id); this._emit('peer', { id, joined: false }); }
  }

  _pump() {
    if (!this.client) return;
    const net = this.client.networking;
    for (let n = net.isP2PPacketAvailable(), guard = 0; n > 0 && guard < 256; n = net.isP2PPacketAvailable(), guard++) {
      let p;
      try { p = net.readP2PPacket(n); } catch { break; }
      const c = this.cur;
      if (!c) continue;
      let env;
      try { env = JSON.parse(p.data.toString('utf8')); } catch { continue; }
      if (!env || env.r !== c.room) continue;          // a straggler from another room
      const from = p.steamId.steamId64.toString();
      if (!c.known.has(from)) {
        // A packet can beat the member list. Only a real member gets in.
        if (!this._memberIds().includes(from)) continue;
        c.known.add(from);
        this._emit('peer', { id: from, joined: true });
      }
      this._emit('msg', { from, msg: env.m });
    }
  }

  _onSessionRequest(remote) {
    const id = remote.toString();
    if (this._memberIds().includes(id)) this.client.networking.acceptP2PSession(BigInt(id));
  }

  /** A lobby we created that is still alone looks for a lower-id twin and moves in. */
  async _dedupe() {
    const c = this.cur;
    if (!this.client || !c || !c.created || this._busy || c.known.size > 0) return;
    this._busy = true;
    try {
      const all = await this.client.matchmaking.getLobbies();
      if (this.cur !== c || c.known.size > 0) return;
      const twin = all
        .filter(l => l.id !== c.lobby.id && l.id < c.lobby.id && this._isRoom(l, c.room) && this._hasSeat(l))
        .sort((x, y) => (x.id < y.id ? -1 : 1))[0];
      if (!twin) return;
      const joined = await twin.join();
      if (this.cur !== c) { try { joined.leave(); } catch {} return; }
      try { c.lobby.leave(); } catch {}
      c.lobby = joined;
      c.created = false;
      this._presence();
      this._members();
    } catch (e) {
      console.warn('[steam] dedupe', e);
    } finally { this._busy = false; }
  }

  /** "Join Game" in a friend's Steam list launches us with this. */
  _presence() {
    try {
      const lp = this.client.localplayer;
      if (this.cur) {
        lp.setRichPresence('connect', `+connect_lobby ${this.cur.lobby.id}`);
        lp.setRichPresence('steam_player_group', String(this.cur.lobby.id));
      } else {
        lp.setRichPresence('connect');
        lp.setRichPresence('steam_player_group');
      }
    } catch { /* presence is a nicety */ }
  }

  _leave() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    try { c.lobby.leave(); } catch { /* already gone */ }
    this._presence();
  }

  _flushInvite() {
    if (this._invite && this._inviteReady) this._send('mm:invite', { room: this._invite });
  }
}

module.exports = { SteamHost, V };
