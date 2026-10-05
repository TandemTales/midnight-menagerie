/**
 * Installs `window.__MM_HOST__` before the game's first module runs.
 *
 * The `name` / `version` / `steam` members are the contract written in
 * `game/src/platform/index.js`. `net` is new, and is what
 * `SteamTransport` in `game/src/net/transport.js` is written against:
 *
 *   net.me                    this player's SteamID64, as a string
 *   net.open(room, seats)     -> token; find or create the Steam lobby for `room`
 *   net.send(token, msg)      a JSON-able object to every other member, reliable + ordered
 *   net.close(token)          leave; a stale token is ignored
 *   net.on(token, cb)         cb({type:'msg', from, msg} | {type:'peer', id, joined}) -> off
 *   net.onInvite(cb)          cb(room) when the player joined a friend through Steam -> off
 *
 * Absent entirely when Steam did not start, so the game falls back to
 * same-machine tabs rather than offering a door that leads nowhere.
 */
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('mm:steam-info') || {};
const call = (op, a, b) => ipcRenderer.invoke('mm:steam-call', op, a, b);

const listeners = new Map();          // token -> Set<cb>
ipcRenderer.on('mm:net', (_e, ev) => {
  const set = listeners.get(ev && ev.token);
  if (!set) return;
  for (const cb of [...set]) { try { cb(ev); } catch (err) { console.error('[host.net]', err); } }
});

const invites = new Set();
let pendingInvite = null;
ipcRenderer.on('mm:invite', (_e, ev) => {
  const room = ev && ev.room;
  if (!room) return;
  if (!invites.size) { pendingInvite = room; return; }
  for (const cb of [...invites]) { try { cb(room); } catch (err) { console.error('[host.invite]', err); } }
});

let seq = 0;

const host = {
  name: 'electron',
  version: process.versions.electron || '',
  steam: info.available ? {
    appId: info.appId,
    available: () => true,
    isDeck: () => !!info.deck,
    setAchievement: (id) => call('setAchievement', id),
    clearAchievement: (id) => call('clearAchievement', id),
    getAchievement: (id) => call('getAchievement', id),
    setStat: (id, v) => call('setStat', id, v),
    storeStats: () => call('storeStats'),
    showKeyboard: (o) => call('showKeyboard', o || {}),
  } : undefined,
  net: info.available ? {
    me: info.me,
    name: info.name,
    open(room, seats) {
      const token = `t${++seq}-${Date.now().toString(36)}`;
      listeners.set(token, new Set());
      ipcRenderer.send('mm:net-open', { room: String(room), seats: seats | 0, token });
      return token;
    },
    send(token, msg) { ipcRenderer.send('mm:net-send', { token, msg }); return true; },
    close(token) { listeners.delete(token); ipcRenderer.send('mm:net-close', { token }); },
    on(token, cb) {
      const set = listeners.get(token);
      if (!set) return () => {};
      set.add(cb);
      return () => set.delete(cb);
    },
    onInvite(cb) {
      invites.add(cb);
      ipcRenderer.send('mm:invite-ready');
      if (pendingInvite) { const r = pendingInvite; pendingInvite = null; setTimeout(() => cb(r), 0); }
      return () => invites.delete(cb);
    },
  } : undefined,
  /** Why Steam is not here, for the settings footer and bug reports. */
  steamReason: info.reason || '',
};

contextBridge.exposeInMainWorld('__MM_HOST__', host);
