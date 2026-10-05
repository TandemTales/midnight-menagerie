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

  for (const l of all) l.host.shutdown();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`\nRESULT: ${passed} passed, ${failed + 1} failed`); process.exit(1); });
