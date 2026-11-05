/**
 * Saves as files: the real shell/saves.js, the real preload.js over a mocked Electron,
 * and the real core/storage.js on top, in a temporary folder.
 *
 *     node tests/shell/saves.test.cjs        (or python tests/shell/check.py)
 *
 * Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..', '..');
const { SaveFiles } = require(path.join(REPO, 'shell', 'saves.js'));

let passed = 0, failed = 0;
function check(ok, name, detail) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

/** preload.js with `electron` mocked, answering over a real `SaveFiles`. Returns its bridge. */
function bridge(saves) {
  const handlers = new Map();
  const ipc = { on: (ch, fn) => handlers.set(ch, fn), handle() {} };
  saves.wire(ipc);
  let host = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (_k, v) => { host = v; } },
    ipcRenderer: {
      sendSync(ch, ...a) {
        if (ch === 'mm:steam-info') return {};
        const e = {};
        handlers.get(ch)(e, ...a);
        return JSON.parse(JSON.stringify(e.returnValue));
      },
      send() {}, invoke: async () => null, on() {},
    },
  };
  const load = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? electron : load.call(this, req, ...rest); };
  const file = path.join(REPO, 'shell', 'preload.js');
  delete require.cache[file];
  try { require(file); } finally { Module._load = load; }
  return host;
}

(async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mm-saves-')), 'saves');
  const saves = new SaveFiles(dir);
  const host = bridge(saves).storage;

  check(await host.read('mm.save.v1') === null, 'a slot nobody has written reads as null, and the folder need not exist');
  check((await host.list()).length === 0, 'and the list is empty');
  await host.write('mm.save.v1', '{"a":1}');
  check(await host.read('mm.save.v1') === '{"a":1}', 'a write reads back');
  check(fs.readFileSync(path.join(dir, 'mm.save.v1'), 'utf8') === '{"a":1}', 'and it is a plain file in the folder');
  check(host.dir() === dir, 'dir() names that folder');
  check(fs.readdirSync(dir).join() === 'mm.save.v1', 'and nothing half-written is left in it');
  await host.remove('mm.save.v1');
  await host.remove('mm.save.v1');
  check(await host.read('mm.save.v1') === null, 'remove removes, twice is fine');

  for (const bad of ['../evil', '..\\evil', 'a/b', 'C:\\x', '']) {
    let threw = false;
    try { await host.write(bad, 'x'); } catch { threw = true; }
    check(threw, `the page cannot write outside the folder: ${JSON.stringify(bad)}`);
  }
  check(!fs.existsSync(path.join(dir, '..', 'evil')), 'and nothing landed there');

  /* The real storage layer on top. It imports the platform module, which has no `window` here. */
  const { Storage, SLOTS } = await import(pathToFileURL(path.join(REPO, 'game/src/core/storage.js')).href);
  const open = async () => { const s = new Storage(); await s.open({ host }); return s; };

  const a = await open();
  check(a.backend === 'host', 'core/storage.js takes the files as its backend');
  a.set(SLOTS[0], '{"gen":1}');
  await a.flush();
  a.set(SLOTS[0], '{"gen":2}');
  await a.flush();
  check(await host.read(SLOTS[0]) === '{"gen":2}', 'a flush writes the slot');
  check(await host.read(SLOTS[0] + '.bak') === '{"gen":1}', 'and keeps the one before as its backup');
  fs.writeFileSync(path.join(dir, SLOTS[0]), '{"gen":2', 'utf8');
  const b = await open();
  check(b.get(SLOTS[0]) === '{"gen":1}', 'a torn file falls back to the backup');
  await a.wipe();

  /* Moving in from localStorage, once. */
  const ls = new Map([[SLOTS[0], '{"old":true}'], [SLOTS[1], '{"run":1}']]);
  globalThis.localStorage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k),
  };
  const c = await open();
  check(c.get(SLOTS[0]) === '{"old":true}', 'the first launch with files brings the old save along');
  await c.flush();
  check(await host.read(SLOTS[1]) === '{"run":1}', 'and writes it to the folder');
  c.remove(SLOTS[1]);
  await c.flush();
  const d = await open();
  check(!d.has(SLOTS[1]), 'a finished run does not come back from the old copy on the next launch');
  check(d.get(SLOTS[0]) === '{"old":true}', 'and the save stays');
  check(ls.has(SLOTS[0]), 'the old copy is left where it was');

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`\nRESULT: ${passed} passed, ${failed + 1} failed`); process.exit(1); });
