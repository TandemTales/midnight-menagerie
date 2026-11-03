/**
 * The Steam wire, end to end, with Steam played by a fake.
 *
 *     node tests/shell/steam.test.cjs        (or python tests/shell/check.py)
 *
 * WHY A FAKE: the real App ID needs a Steamworks partner account, and the wire
 * should not get its first test run on the day that account is approved. Every
 * layer here is the REAL file except steamworks.js itself:
 *
 *   SteamTransport (game/src/net/transport.js)     the game's side
 *     -> preload.js  (shell/, with `electron` mocked: contextBridge + IPC)
 *     -> SteamHost   (shell/steam.js)               lobbies, P2P, tokens
 *     -> FAKE steamworks.js: lobbies, member lists and P2P queues shared by
 *        several "players" in this one process, with Steam's session-request
 *        handshake (packets wait until the receiver accepts).
 *
 * IPC is asynchronous and structured-cloned in both directions, as in
 * Electron, so a message that is not JSON-able or a race that depends on
 * synchronous delivery fails here rather than on a real wire.
 *
 * Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
 */
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const SHELL = path.join(ROOT, 'shell');

let passed = 0, failed = 0;
function check(ok, name, detail) {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail !== undefined ? `  (${detail})` : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 1500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await sleep(5); }
  return !!fn();
}

/* ══ the fake Steam ═════════════════════════════════════════════════════════ */

class FakeSteam {
  constructor() {
    this.lobbies = new Map();     // id(bigint) -> { id, members:[string], data:{}, limit }
    this.players = new Map();     // steamId(string) -> player state
    this.nextLobby = 109775240000000001n;
    this.created = 0;
  }

  player(id, name) {
    const p = {
      id: String(id), name, inbox: [], pending: new Map(), accepted: new Set(), requested: new Set(),
      cbs: new Map(), presence: {}, achievements: new Set(), stats: {}, owns: true,
    };
    this.players.set(p.id, p);
    return p;
  }

  view(rec, p) {
    const steam = this;
    return {
      id: rec.id,
      async join() { return steam.join(rec.id, p); },
      leave() { rec.members = rec.members.filter(m => m !== p.id); },
      openInviteDialog() {},
      getMemberCount() { return BigInt(rec.members.length); },
      getMemberLimit() { return BigInt(rec.limit); },
      getMembers() { return rec.members.map(m => ({ steamId64: BigInt(m), steamId32: '', accountId: 0 })); },
      getOwner() { return { steamId64: BigInt(rec.members[0] || 0) }; },
      setJoinable() { return true; },
      getData(k) { return k in rec.data ? rec.data[k] : null; },
      setData(k, v) { rec.data[k] = String(v); return true; },
      deleteData(k) { delete rec.data[k]; return true; },
      getFullData() { return { ...rec.data }; },
      mergeFullData(o) { Object.assign(rec.data, o); return true; },
    };
  }

  async join(id, p) {
    await sleep(2);
    const rec = this.lobbies.get(BigInt(id));
    if (!rec) throw new Error('no such lobby');
    if (rec.members.length >= rec.limit && !rec.members.includes(p.id)) throw new Error('lobby full');
    if (!rec.members.includes(p.id)) rec.members.push(p.id);
    return this.view(rec, p);
  }

  /** The steamworks.js module as one player's process would see it. */
  module(p) {
    const steam = this;
    const SteamCallback = { P2PSessionRequest: 6, GameLobbyJoinRequested: 8 };
    const client = {
      localplayer: {
        getSteamId: () => ({ steamId64: BigInt(p.id), steamId32: '', accountId: 0 }),
        getName: () => p.name,
        setRichPresence: (k, v) => { if (v === undefined) delete p.presence[k]; else p.presence[k] = v; },
      },
      matchmaking: {
        async createLobby(_type, max) {
          await sleep(2);
          const rec = { id: steam.nextLobby++, members: [p.id], data: {}, limit: max };
          steam.lobbies.set(rec.id, rec);
          steam.created++;
          return steam.view(rec, p);
        },
        joinLobby: (id) => steam.join(id, p),
        async getLobbies() {
          await sleep(2);
          return [...steam.lobbies.values()].filter(r => r.members.length > 0).map(r => steam.view(r, p));
        },
      },
      networking: {
        sendP2PPacket(to, _type, buf) {
          const q = steam.players.get(to.toString());
          if (!q) return false;
          const pkt = { data: Buffer.from(buf), size: buf.length, steamId: { steamId64: BigInt(p.id) } };
          if (q.accepted.has(p.id)) { q.inbox.push(pkt); return true; }
          // Steam holds packets from a stranger until the receiver accepts the session.
          if (!q.pending.has(p.id)) q.pending.set(p.id, []);
          q.pending.get(p.id).push(pkt);
          if (!q.requested.has(p.id)) {
            q.requested.add(p.id);
            setTimeout(() => { const fn = q.cbs.get(6); fn && fn({ remote: BigInt(p.id) }); }, 1);
          }
          return true;
        },
        isP2PPacketAvailable: () => (p.inbox.length ? p.inbox[0].size : 0),
        readP2PPacket: () => p.inbox.shift(),
        acceptP2PSession(remote) {
          const id = remote.toString();
          p.accepted.add(id);
          for (const pkt of p.pending.get(id) || []) p.inbox.push(pkt);
          p.pending.delete(id);
        },
      },
      callback: {
        SteamCallback,
        register(k, fn) { p.cbs.set(k, fn); return { disconnect() { p.cbs.delete(k); } }; },
      },
      utils: { isSteamRunningOnSteamDeck: () => false, showGamepadTextInput: async () => 'typed' },
      achievement: {
        activate: (id) => { p.achievements.add(id); return true; },
        clear: (id) => { p.achievements.delete(id); return true; },
        isActivated: (id) => p.achievements.has(id),
      },
      stats: { setInt: (k, v) => { p.stats[k] = v; return true; }, store: () => true },
    };
    return {
      SteamCallback,
      init(appId) {
        if (!p.owns) throw new Error(`Steam: app ${appId} is not owned`);
        return client;
      },
    };
  }

  /** Steam telling a running game that its player clicked "Join Game". */
  fireJoinRequested(p, lobbyId) {
    const fn = p.cbs.get(8);
    fn && fn({ lobby_steam_id: BigInt(lobbyId), friend_steam_id: 0n });
  }

  liveLobbies() { return [...this.lobbies.values()].filter(r => r.members.length > 0); }
}

/* ══ one player's process: SteamHost + preload.js over mocked Electron IPC ═══ */

const { SteamHost } = require(path.join(SHELL, 'steam.js'));
const clone = (v) => (v === undefined ? v : structuredClone(v));

function launch(steam, p, appId = 4242) {
  const handlers = new Map(), invokes = new Map(), rendererOn = new Map();
  const ipcMain = {
    on: (ch, fn) => handlers.set(ch, fn),
    handle: (ch, fn) => invokes.set(ch, fn),
  };
  const toRenderer = (ch, payload) => {
    const v = clone(payload);
    setTimeout(() => { for (const fn of rendererOn.get(ch) || []) fn({}, v); }, 0);
  };
  // `every` at a tenth of the real intervals so the dedupe pass runs in 200ms, not 2s.
  const host = new SteamHost({
    appId, send: toRenderer, sw: steam.module(p),
    every: (fn, ms) => setInterval(fn, Math.max(1, Math.round(ms / 10))),
  });
  host.start();
  host.wire(ipcMain);

  let exposed = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (_k, v) => { exposed = v; } },
    ipcRenderer: {
      sendSync(ch) { const e = {}; handlers.get(ch)(e); return clone(e.returnValue); },
      send(ch, payload) { const v = clone(payload); setTimeout(() => { const h = handlers.get(ch); h && h({}, v); }, 0); },
      invoke(ch, ...args) { return Promise.resolve(invokes.get(ch)({}, ...args.map(clone))).then(clone); },
      on(ch, fn) { if (!rendererOn.has(ch)) rendererOn.set(ch, []); rendererOn.get(ch).push(fn); },
    },
  };
  const load = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? electron : load.call(this, req, ...rest); };
  const file = require.resolve(path.join(SHELL, 'preload.js'));
  delete require.cache[file];
  try { require(file); } finally { Module._load = load; }
  return { host, bridge: exposed, p };
}

/* ══ the checks ═════════════════════════════════════════════════════════════ */

(async () => {
  const { SteamTransport, steamNet } = await import(pathToFileURL(path.join(ROOT, 'game/src/net/transport.js')).href);
  const { Lobby } = await import(pathToFileURL(path.join(ROOT, 'game/src/net/lobby.js')).href);
  const all = [];
  const up = (steam, id, name, appId) => { const l = launch(steam, steam.player(id, name), appId); all.push(l); return l; };
  const peersOf = (t) => { const s = new Set(); t.onPeer(e => { if (e.joined) s.add(e.id); else s.delete(e.id); }); return s; };

  console.log('§1 the bridge');
  {
    const steam = new FakeSteam();
    const a = up(steam, '76561190000000001', 'Josh');
    check(a.bridge && a.bridge.name === 'electron', 'preload installs a host named electron');
    check(a.bridge.steam && a.bridge.steam.available() === true && a.bridge.steam.appId === 4242,
      'steam is available with the App ID from steam_appid.txt');
    check(a.bridge.net && a.bridge.net.me === '76561190000000001', 'net.me is the SteamID64 as a string', a.bridge.net && a.bridge.net.me);
    check(await a.bridge.steam.setAchievement('first-win') === true && a.p.achievements.has('first-win'),
      'an achievement crosses IPC and reaches Steam');
    check(await a.bridge.steam.getAchievement('first-win') === true, 'and reads back');

    globalThis.window = { __MM_HOST__: a.bridge };
    check(steamNet() === a.bridge.net, 'steamNet() finds the bridge');
    globalThis.window = { __MM_HOST__: { name: 'electron' } };
    check(steamNet() === null, 'and is null without one');
    delete globalThis.window;

    const none = up(steam, '76561190000000002', 'NoId', 0);
    check(none.host.available === false && !none.bridge.net && !none.bridge.steam,
      'NO App ID: no Steam, no net, and the game keeps its two-tab wire');
    check(/steam_appid\.txt/.test(none.bridge.steamReason), 'and says why', none.bridge.steamReason);

    const p = steam.player('76561190000000003', 'NotOwned'); p.owns = false;
    const bad = launch(steam, p); all.push(bad);
    check(bad.host.available === false && !bad.bridge.net && /not owned|does this account have/.test(bad.bridge.steamReason),
      'an account that does not own the app gets no net, and a reason', bad.bridge.steamReason);
  }

  console.log('§2 the transport contract (same checks as tests/net WIRES)');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000011', 'A'), B = up(steam, '76561190000000012', 'B');
    const a = new SteamTransport('knotted-ladder', { net: A.bridge.net, seats: 4 });
    const pa = peersOf(a);
    await until(() => steam.liveLobbies().length === 1);
    const b = new SteamTransport('knotted-ladder', { net: B.bridge.net, seats: 4 });
    const pb = peersOf(b);
    check(await until(() => pa.has(b.id) && pb.has(a.id)), 'each side hears the other JOIN', `${[...pa]} / ${[...pb]}`);
    check(steam.liveLobbies().length === 1 && steam.created === 1, 'the second player JOINED the first lobby rather than making one');
    check(a.id !== b.id && typeof a.id === 'string', 'every peer has its own stable id');

    const want = (i) => ({ k: 'seq', i, deep: { n: [i, i + 1], s: 'x' + i } });
    const got = [], mine = [];
    const offB = b.onMessage((m, from) => got.push({ m, from }));
    const offA = a.onMessage((m) => mine.push(m));
    for (let i = 0; i < 10; i++) a.send(want(i));
    check(await until(() => got.length === 10), 'every message arrives', `${got.length}/10`);
    check(got.map(g => g.m.i).join(',') === '0,1,2,3,4,5,6,7,8,9', 'ORDER IS PRESERVED per sender - lockstep rule 1', got.map(g => g.m.i).join(','));
    await sleep(30);
    check(mine.length === 0, 'NOTHING IS DELIVERED TO ITSELF - lockstep rule 2', mine.length);
    check(got.every((g, i) => JSON.stringify(g.m) === JSON.stringify(want(i))), 'a message crosses UNCHANGED, nesting and all');
    check(got.every(g => g.from === a.id), 'and names its sender by SteamID');

    offB(); a.send({ k: 'after-unsub' }); await sleep(40);
    check(got.length === 10, "onMessage's unsubscribe actually unsubscribes", got.length);
    offA();

    const back = [];
    a.onMessage(m => back.push(m));
    b.send({ k: 'reply' });
    check(await until(() => back.length === 1), 'and the other direction works too');

    const late = [];
    b.onMessage(m => late.push(m));
    a.close(); a.close(); a.send({ k: 'after-close' });
    check(await until(() => !pb.has(a.id)), 'closing LEAVES the lobby and the other side hears it');
    check(late.length === 0, 'close() stops delivery and is safe twice', late.length);
    b.close();
    check(await until(() => steam.liveLobbies().length === 0), 'nobody left: no lobby left');
    check(!A.p.presence.connect, 'leaving clears the "Join Game" presence');
  }

  console.log('§3 two people press "Climb up" in the same instant');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000021', 'A'), B = up(steam, '76561190000000022', 'B');
    const a = new SteamTransport('mossy-den', { net: A.bridge.net, seats: 4 });
    const b = new SteamTransport('mossy-den', { net: B.bridge.net, seats: 4 });
    const pa = peersOf(a), pb = peersOf(b);
    await until(() => steam.created === 2, 500);
    check(steam.created === 2, 'both searched, found nothing, and created (the race is real)', steam.created);
    check(await until(() => pa.has(b.id) && pb.has(a.id), 3000), 'the lone lobby moves into its twin and they meet');
    check(steam.liveLobbies().length === 1, 'one lobby left', steam.liveLobbies().length);
    const got = [];
    b.onMessage(m => got.push(m.i));
    for (let i = 0; i < 5; i++) a.send({ i });
    check(await until(() => got.length === 5) && got.join() === '0,1,2,3,4', 'and the wire works after the move', got.join());
    a.close(); b.close();
  }

  console.log('§4 rooms are separate, strangers are dropped');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000031', 'A'), B = up(steam, '76561190000000032', 'B'), C = up(steam, '76561190000000033', 'C');
    const a = new SteamTransport('tin-camp', { net: A.bridge.net });
    const b = new SteamTransport('rope-swing', { net: B.bridge.net });
    const pa = peersOf(a);
    await sleep(80);
    check(pa.size === 0 && steam.liveLobbies().length === 2, 'two passwords, two lobbies, nobody meets');

    const got = [];
    a.onMessage(m => got.push(m));
    // C is in no lobby and sends straight at A; then B sends with the WRONG room on it.
    C.host.client.networking.sendP2PPacket(BigInt(A.p.id), 2, Buffer.from(JSON.stringify({ r: 'tin-camp', m: { k: 'stranger' } })));
    B.host.client.networking.sendP2PPacket(BigInt(A.p.id), 2, Buffer.from(JSON.stringify({ r: 'rope-swing', m: { k: 'wrong room' } })));
    await sleep(80);
    check(got.length === 0, 'a non-member and a straggler from another room are both dropped', JSON.stringify(got));
    check(pa.size === 0, 'and neither becomes a peer');
    a.close(); b.close();
  }

  console.log('§5 joining a friend through Steam (invite / "Join Game")');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000041', 'Josh'), B = up(steam, '76561190000000042', 'shoejunk');
    const a = new SteamTransport('secret-hollow', { net: A.bridge.net, seats: 4 });
    const pa = peersOf(a);
    const leftA = [];
    a.onPeer(e => { if (!e.joined) leftA.push(e.id); });
    await until(() => steam.liveLobbies().length === 1);
    check(/^\+connect_lobby \d+$/.test(A.p.presence.connect || ''), 'the host advertises +connect_lobby for "Join Game"', A.p.presence.connect);

    // shoejunk is sitting in a DIFFERENT room when the invite is accepted.
    const old = new SteamTransport('somewhere-else', { net: B.bridge.net, seats: 4 });
    await until(() => steam.liveLobbies().length === 2);

    const invited = [];
    B.bridge.net.onInvite(room => invited.push(room));
    const lobbyId = steam.liveLobbies().find(r => r.data.mm_room === 'secret-hollow').id;
    steam.fireJoinRequested(B.p, lobbyId);
    check(await until(() => invited.length === 1), 'the game is told which room to open');
    check(invited[0] === 'secret-hollow', 'and it is the inviter\'s room', invited[0]);
    check(await until(() => pa.has(B.p.id)), 'the host sees the friend arrive at once');

    // What scenes/lobby.js does next: exit() closes the old transport, enter() opens the room.
    old.close();
    const created = steam.created;
    const b = new SteamTransport('secret-hollow', { net: B.bridge.net, seats: 4 });
    const pb = peersOf(b);
    check(await until(() => pb.has(a.id)), 'the friend\'s new transport ADOPTS the joined lobby');
    await sleep(60);
    check(steam.created === created, 'no extra lobby was made');
    check(steam.lobbies.get(lobbyId).members.includes(B.p.id), 'and the OLD transport\'s late close did not pull them out of it');
    check(!steam.liveLobbies().some(r => r.data.mm_room === 'somewhere-else'), 'the room they were in is gone');
    check(leftA.length === 0, 'the host never saw them LEAVE in between (no drop-and-rejoin blip)', leftA.join());

    const got = [];
    a.onMessage(m => got.push(m));
    b.send({ k: 'hi from the invite' });
    check(await until(() => got.length === 1), 'and the wire works');

    // An invite into a lobby that is not ours is refused.
    const C = up(steam, '76561190000000043', 'C');
    const foreign = await C.host.client.matchmaking.createLobby(2, 4);
    foreign.mergeFullData({ some_other_game: '1' });
    const D = up(steam, '76561190000000044', 'D');
    const dInv = [];
    D.bridge.net.onInvite(r => dInv.push(r));
    steam.fireJoinRequested(D.p, foreign.id);
    await sleep(60);
    check(dInv.length === 0 && !steam.lobbies.get(foreign.id).members.includes(D.p.id),
      'a lobby with no Midnight Menagerie room on it is refused and left');
    a.close(); b.close(); foreign.leave();
  }

  console.log('§6 tokens: a transport that closes before its lobby exists');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000051', 'A');
    const t = new SteamTransport('crooked-branch', { net: A.bridge.net });
    t.close();
    await sleep(60);
    check(!steam.liveLobbies().some(r => r.members.includes(A.p.id)), 'closing mid-search leaves no lobby behind');
    const t2 = new SteamTransport('crooked-branch', { net: A.bridge.net });
    await until(() => steam.liveLobbies().length === 1);
    check(steam.liveLobbies().length === 1, 'and the next open still works');
    t2.close();
  }

  console.log('§7 a full room');
  {
    const steam = new FakeSteam();
    const ps = [1, 2, 3].map(i => up(steam, `7656119000000006${i}`, 'P' + i));
    const a = new SteamTransport('lantern-lookout', { net: ps[0].bridge.net, seats: 2 });
    await until(() => steam.liveLobbies().length === 1);
    const b = new SteamTransport('lantern-lookout', { net: ps[1].bridge.net, seats: 2 });
    const pa = peersOf(a);
    await until(() => pa.size === 1);
    const c = new SteamTransport('lantern-lookout', { net: ps[2].bridge.net, seats: 2 });
    const pc = peersOf(c);
    await sleep(120);
    check(pa.size === 1 && pc.size === 0, 'a third player cannot squeeze into a full two-seat room', `${pa.size}/${pc.size}`);
    a.close(); b.close(); c.close();
  }

  console.log('§8 the real Lobby (net/lobby.js) over Steam');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000071', 'Josh'), B = up(steam, '76561190000000072', 'shoejunk');
    const ta = new SteamTransport('owlish-signal', { net: A.bridge.net, seats: 4 });
    const la = new Lobby({ transport: ta, room: 'owlish-signal', companion: 'marmalade', kid: 'maya', name: 'Josh' });
    await until(() => steam.liveLobbies().length === 1);
    const tb = new SteamTransport('owlish-signal', { net: B.bridge.net, seats: 4 });
    const lb = new Lobby({ transport: tb, room: 'owlish-signal', companion: 'bones', kid: 'eli', name: 'shoejunk' });
    check(await until(() => la.players.length === 2 && lb.players.length === 2), 'both lobbies list both players',
      `${la.players.length}/${lb.players.length}`);
    const names = (l) => l.players.map(p => p.name).sort().join(',');
    check(names(la) === 'Josh,shoejunk' && names(lb) === 'Josh,shoejunk', 'with each other\'s choices', names(la) + ' | ' + names(lb));
    check(la.players.map(p => p.id).join() === lb.players.map(p => p.id).join(), 'and in the SAME seat order on both machines');
    check(la.seed === lb.seed, 'same password, same seed', `${la.seed}/${lb.seed}`);
    tb.close();
    check(await until(() => la.players.length === 1), 'a player who leaves drops off the other\'s list');
    la.close(); lb.close(); ta.close();
  }

  const { Session } = await import(pathToFileURL(path.join(ROOT, 'game/src/net/session.js')).href);
  const threeInARoom = async (room, base) => {
    const steam = new FakeSteam();
    const ps = [1, 2, 3].map(i => up(steam, `${base}${i}`, `P${i}`));
    const ts = [];
    for (const p of ps) {
      ts.push(new SteamTransport(room, { net: p.bridge.net, seats: 4 }));
      await until(() => steam.liveLobbies().length === 1);
    }
    await until(() => ts.every(t => t.known.size === 2));
    return { steam, ps, ts };
  };

  console.log('§9 the host\'s GO carries the table');
  {
    const { ts } = await threeInARoom('rope-lookout', '7656119000000008');
    const ls = ts.map((t, i) => new Lobby({ transport: t, room: 'rope-lookout', companion: 'marmalade', kid: 'maya', name: `P${i + 1}` }));
    await until(() => ls.every(l => l.players.length === 3));
    // A row the third player has not heard yet. Messages are ordered per sender,
    // not across senders, so they can hear the host's GO first.
    const stale = ls[2]._peers.get(ts[1].id);
    ls[1].setChoice({ companion: 'bones', kid: 'eli' });
    ls[1].setReady(true);
    await until(() => ls[0]._peers.get(ts[1].id).companion === 'bones');
    ls[2]._peers.set(ts[1].id, { ...stale, companion: 'marmalade' });
    const dropHere = ls[2].transport.onMessage(() => {});
    const r0 = ls[0].go();
    await until(() => ls.every(l => l.roster));
    dropHere();
    check(ls.every(l => l.roster), 'everyone started');
    const party = (l) => l.roster.party.map(p => p.companion).join();
    check(party(ls[2]) === party(ls[0]), 'a client with a stale row still freezes the host\'s party', `${party(ls[2])} vs ${party(ls[0])}`);
    check(ls[2].roster.ids.join() === r0.ids.join(), 'and the same seats');
    check(ls[2].roster.seat === r0.ids.indexOf(ts[2].id), 'and knows its own seat');
    ls.forEach(l => l.close()); ts.forEach(t => t.close());
  }

  console.log('§10 somebody climbs up after the party went in');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000091', 'A'), B = up(steam, '76561190000000092', 'B'), C = up(steam, '76561190000000093', 'C');
    const ta = new SteamTransport('tin-camp', { net: A.bridge.net, seats: 4 });
    const roster = { room: 'tin-camp', seed: 77, seats: 2, ids: ['76561190000000091', '76561190000000092'], names: ['A', 'B'] };
    const sa = new Session({ transport: ta, seat: 0, seats: 2, seed: 77, host: true, roster, room: 'tin-camp', beatMs: 0 });
    await until(() => steam.liveLobbies().length === 1);

    const tb = new SteamTransport('tin-camp', { net: B.bridge.net, seats: 4 });
    const lb = new Lobby({ transport: tb, room: 'tin-camp', companion: 'bones', kid: 'eli' });
    let back = null;
    lb.on('late', r => { back = r; });
    check(await until(() => back), 'a player the roster names is told the expedition is under way');
    check(back && back.ids.indexOf(tb.id) === 1, 'and can find their seat in it', back && back.ids.join());
    lb.close(); tb.close();
    await until(() => sa.lost.has(1));

    const tc = new SteamTransport('tin-camp', { net: C.bridge.net, seats: 4 });
    const lc = new Lobby({ transport: tc, room: 'tin-camp', companion: 'bones', kid: 'eli' });
    let late = null;
    lc.on('late', r => { late = r; });
    check(await until(() => late), 'a stranger is told too, rather than left waiting in an empty treehouse');
    check(late && late.ids.indexOf(tc.id) === -1, 'and has no seat');
    lc.close(); tc.close(); sa.close();
  }

  console.log('§11 coming back to a lobby search cannot see');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000101', 'A'), B = up(steam, '76561190000000102', 'B');
    const ta = new SteamTransport('far-away', { net: A.bridge.net, seats: 4 });
    await until(() => ta.lobbyId);
    check(!!ta.lobbyId, 'a transport learns which Steam lobby it is in', ta.lobbyId);
    const search = steam.module;
    // Search only reaches nearby regions; the other side of the world finds nothing.
    const hidden = B.host.client.matchmaking.getLobbies;
    B.host.client.matchmaking.getLobbies = async () => [];
    const pa = peersOf(ta);
    const tb = new SteamTransport('far-away', { net: B.bridge.net, seats: 4, lobby: ta.lobbyId });
    check(await until(() => pa.size === 1), 'the remembered lobby id still gets them in');
    check(steam.liveLobbies().length === 1, 'with no twin room made', steam.liveLobbies().length);
    B.host.client.matchmaking.getLobbies = hidden;
    void search;
    ta.close(); tb.close();
  }

  console.log('§12 a packet that beats the member list');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000111', 'A'), B = up(steam, '76561190000000112', 'B');
    const ta = new SteamTransport('race-den', { net: A.bridge.net, seats: 4 });
    await until(() => ta.lobbyId);
    let got = 0;
    ta.onMessage(() => { got++; });
    // Steam asks about the session before A's member list has B on it.
    A.host._onSessionRequest(BigInt(B.p.id));
    check(!A.p.accepted.has(B.p.id), 'a session from somebody not in the room is not taken yet');
    const tb = new SteamTransport('race-den', { net: B.bridge.net, seats: 4 });
    await until(() => tb.known.size === 1);
    check(await until(() => A.p.accepted.has(B.p.id)), 'and IS taken once they turn up, since Steam only asks once');
    tb.send({ hello: 1 });
    check(await until(() => got === 1), 'so their first message arrives');
    ta.close(); tb.close();
  }

  console.log('§13 a player drops out from under a running expedition');
  {
    const { ts } = await threeInARoom('owl-swing', '7656119000000012');
    const ids = ts.map(t => t.id).sort();
    const roster = { room: 'owl-swing', seed: 5, seats: 3, ids, names: ['P1', 'P2', 'P3'] };
    const bySeat = ids.map(id => ts.find(t => t.id === id));
    const ss = bySeat.map((t, seat) => new Session({ transport: t, seat, seats: 3, seed: 5, host: seat === 0, roster, room: 'owl-swing', beatMs: 0 }));
    const seen = [];
    ss[0].on('presence', e => seen.push(e));
    let gone = null;
    ss[2].on('gone', e => { gone = e; });
    // Seat 2 is on turn 4 and seat 1 was last seen on turn 3, which holds the barrier.
    ss[0]._note(1, 3, 0);
    ss[0]._note(2, 4, 0);
    ss[0].run = { combat: { turn: 4 } };
    check(ss[0]._barrierTurn() === 3, 'a seat a turn behind holds the barrier', ss[0]._barrierTurn());
    bySeat[1].close();
    check(await until(() => ss[0].lost.has(1)), 'leaving the Steam lobby reaches the table at once');
    check(seen.some(e => e.seat === 1 && e.here === false), 'and is announced');
    check(ss[0]._barrierTurn() === 3, 'noticing does not move the barrier: the table may still choose to wait');
    ss[0].dropSeat(1);
    check(ss[0].gone.has(1) && ss[0]._barrierTurn() === 4, 'choosing to play on lifts it', ss[0]._barrierTurn());
    check(await until(() => gone && gone.seat === 1 && ss[2].gone.has(1)), 'on the other machine too');
    ss[0].dropSeat(1);
    check(ss[0].log.filter(m => m.act === 'seat.gone').length === 1, 'asking twice says it once');

    // Silence, as opposed to leaving: a machine that froze stays in the lobby.
    ss[2]._heardAt.set(0, -1e9);
    ss[2]._tick();
    check(ss[2].lost.has(0), 'a seat silent for too long is reported too');
    ss[2]._heard(0);
    check(!ss[2].lost.has(0), 'and clears the moment it speaks');
    ss[0].close(); ss[2].close();
  }

  console.log('§14 a lost message is asked for again');
  {
    const { ts } = await threeInARoom('moss-hollow', '7656119000000013');
    const ids = ts.map(t => t.id).sort();
    const roster = { room: 'moss-hollow', seed: 6, seats: 3, ids, names: [] };
    const bySeat = ids.map(id => ts.find(t => t.id === id));
    const ss = bySeat.map((t, seat) => new Session({ transport: t, seat, seats: 3, seed: 6, roster, room: 'moss-hollow', beatMs: 0 }));
    const applied = [];
    ss[2].on('input', m => { applied.push(m.seq); });
    const m1 = ss[0].input({ t: 'room', act: 'room.done' });
    await until(() => ss[2].log.length === 1);
    // Steam lost the next one on its way to seat 2, only.
    const lost = { ...m1, seq: 2 };
    ss[0]._seq = 2;
    ss[0]._accept(lost);
    ss[0].beat();
    await until(() => (ss[2]._horizon.get(0) || {}).seq === 2);
    check(ss[2].log.length === 1, 'the beat says seat 2 is missing an input', ss[2].log.length);
    ss[2]._tick();
    ss[2]._gapSince.set(0, -1e9);
    ss[2]._tick();
    check(await until(() => ss[2].log.length === 2), 'it asks, and the table sends it again');
    await until(() => applied.length === 2);
    check(applied.join() === '1,2', 'applied once each, in order', applied.join());
    ss[1]._sendLog(ss[1].log, null);
    await sleep(40);
    check(ss[2].log.length === 2, 'and a second copy changes nothing', ss[2].log.length);
    ss.forEach(s => s.close());
  }

  console.log('§15 climbing back in');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000141', 'A'), B = up(steam, '76561190000000142', 'B');
    const ta = new SteamTransport('acorn-den', { net: A.bridge.net, seats: 4 });
    await until(() => ta.lobbyId);
    const roster = { room: 'acorn-den', seed: 9, seats: 2, ids: [A.p.id, B.p.id], names: ['A', 'B'] };
    const big = 'x'.repeat(600 * 1024);          // past a chunk, past what one message should carry
    const sa = new Session({ transport: ta, seat: 0, seats: 2, seed: 9, host: true, roster, room: 'acorn-den', beatMs: 0 });
    sa.run = { snapshot: () => ({ seed: 9, big }), pendingVote: { nodeId: 'n1', votes: { 0: 'n2' } } };
    sa.input({ t: 'room', act: 'room.done' });
    await sa.settled();
    const tb = new SteamTransport('acorn-den', { net: B.bridge.net, seats: 4, lobby: ta.lobbyId });
    await until(() => tb.known.size === 1);
    const sb = new Session({ transport: tb, seat: 1, seats: 2, seed: 9, roster, room: 'acorn-den', rejoining: true, beatMs: 0 });
    let pack = null;
    sb.on('state', p => { pack = p; });
    sb.requestState();
    check(await until(() => pack, 3000), 'the table answers with the expedition, in chunks');
    check(pack && pack.snapshot.big.length === big.length, 'whole', pack && pack.snapshot.big.length);
    check(pack && pack.pendingVote.votes[0] === 'n2', 'with the open ballot a save leaves out');
    // Something happens at the table while the answer is on its way.
    const applied = [];
    sb.on('input', m => { applied.push(m.act); });
    sa.input({ t: 'room', act: 'map.vote', id: 'n2' });
    await until(() => sb._buffered.length === 1);
    check(applied.length === 0, 'an input arriving before the answer waits');
    sb.adopt(pack);
    await sb.settled();
    check(applied.join() === 'map.vote', 'and is applied after it, once', applied.join());
    check(sb.log.length === 2 && sb._applied === 2, 'the log is the table\'s', `${sb.log.length}/${sb._applied}`);
    check(sb.input({ t: 'room', act: 'seat.back' }).seq === 1, 'and their own next input carries on their own count');
    sa.close(); sb.close();
  }

  console.log('§16 the out-of-sync check');
  {
    const steam = new FakeSteam();
    const A = up(steam, '76561190000000151', 'A'), B = up(steam, '76561190000000152', 'B');
    const ta = new SteamTransport('swing-den', { net: A.bridge.net, seats: 4 });
    await until(() => ta.lobbyId);
    const tb = new SteamTransport('swing-den', { net: B.bridge.net, seats: 4 });
    await until(() => ta.known.size === 1 && tb.known.size === 1);
    const sa = new Session({ transport: ta, seat: 0, seats: 2, seed: 1, beatMs: 0 });
    const sb = new Session({ transport: tb, seat: 1, seats: 2, seed: 1, beatMs: 0 });
    const rooms = { a: 'same', b: 'same' };
    sa.run = { _partyDigest: () => rooms.a };
    sb.run = { _partyDigest: () => rooms.b };
    sa.publishRoomDigest('n1');
    await until(() => sb._digests.has('room:n1:0'));
    sb.publishRoomDigest('n1');
    await sleep(30);
    check(sa.inSync && sb.inSync, 'two machines that agree stay quiet');
    rooms.b = 'different';
    // Whichever machine gets there second makes the comparison.
    sa.publishRoomDigest('n2');
    await until(() => sb._digests.has('room:n2:0'));
    let told = 0;
    sb.on('diverge', () => { told++; });
    sb.publishRoomDigest('n2');
    check(!sb.inSync && told === 1, 'two that do not are told, on the slower machine');
    check(await until(() => !sa.inSync), 'and on the faster one');
    sa.close(); sb.close();
  }

  console.log('§17 two players act at the same moment');
  {
    const { ts } = await threeInARoom('torch-swing', '7656119000000016');
    const ids = ts.map(t => t.id).sort();
    const bySeat = ids.map(id => ts.find(t => t.id === id));
    const combat = { turn: 1 };
    const ss = bySeat.map((t, seat) => {
      const s = new Session({ transport: t, seat, seats: 3, seed: 3, roster: { ids }, room: 'torch-swing', beatMs: 0 });
      s.run = { combat };
      return s;
    });
    await sleep(30);
    ss.forEach(s => s.beat());
    await sleep(30);
    const orders = ss.map(() => []);
    ss.forEach((s, i) => s.on('input', m => { orders[i].push(`${m.seat}.${m.seq}`); }));
    const name = (o) => o.join(' ');

    // All three let go of a Trick before any of them has heard the others.
    const issued = ss.map(s => s.input({ t: 'play', pile: 'hand', index: 0 }));
    check(orders.every(o => o.length === 0), 'nobody applies their own Trick the instant they play it');
    let landed = false;
    ss[2].whenApplied(issued[2]).then(() => { landed = true; });
    await until(() => orders.every(o => o.length === 3));
    check(orders.every(o => o.length === 3), 'all three land everywhere', orders.map(name).join(' / '));
    check(new Set(orders.map(name)).size === 1, 'in the SAME order on every machine', orders.map(name).join(' / '));
    await until(() => landed);
    check(landed, 'and a player\'s own screen is told when theirs has landed');

    // A later Trick by the same people, overlapping differently.
    orders.forEach(o => { o.length = 0; });
    ss[2].input({ t: 'play', pile: 'hand', index: 0 });
    await sleep(1);
    ss[0].input({ t: 'play', pile: 'hand', index: 0 });
    ss[1].input({ t: 'play', pile: 'hand', index: 0 });
    await until(() => orders.every(o => o.length === 3));
    check(new Set(orders.map(name)).size === 1, 'whatever the arrival order', orders.map(name).join(' / '));
    const clean = ss.every(s => !s.log.some(m => m.t === 'play' && s.log.indexOf(m) >= s._applied));
    check(clean, 'with nothing left behind');

    // A silent seat holds this up, and the table can decide to stop waiting.
    orders.forEach(o => { o.length = 0; });
    bySeat[2].close();
    const held = ss[0].input({ t: 'play', pile: 'hand', index: 0 });
    ss[1].beat();
    await sleep(60);
    check(orders[0].length === 0, 'a Trick waits on a seat that has stopped answering');
    ss[0].dropSeat(2);
    await ss[0].whenApplied(held);
    check(orders[0].length >= 1, 'until the table plays on without them', name(orders[0]));
    ss[0].close(); ss[1].close();
  }

  for (const l of all) l.host.shutdown();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`\nRESULT: ${passed} passed, ${failed + 1} failed`); process.exit(1); });
