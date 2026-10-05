/**
 * The desktop shell: Midnight Menagerie in a window, with Steam attached.
 *
 * Three jobs and nothing else:
 *
 *   1. SERVE the repo the way `tools/devserver.py` does: no-cache, correct
 *      module MIME types, Range for <audio>. The game uses absolute
 *      `/game/src/...` imports, so `file://` cannot load it. The port is FIXED
 *      because localStorage is per-origin, and a random port would hand the
 *      player an empty save every launch.
 *   2. OPEN one window on it, with `preload.js` installing `window.__MM_HOST__`
 *      (the contract in `game/src/platform/index.js`).
 *   3. RUN Steam in this process (steamworks.js is native and stays out of the
 *      renderer) and answer the bridge over IPC — see `steam.js`.
 *
 * The App ID comes from `steam_appid.txt` beside this file. Empty or missing
 * means no Steam: the game still runs, co-op falls back to two tabs on one
 * machine, and `Platform.steam.available` says false.
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SteamHost } = require('./steam');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8790;          // not 8777: the dev server and the tests own that one
const PORTS_TO_TRY = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function readAppId() {
  try {
    const n = parseInt(fs.readFileSync(path.join(__dirname, 'steam_appid.txt'), 'utf8').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

function serve(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { rel = '/'; }
  const file = path.resolve(ROOT, '.' + rel);
  // Never outside the repo.
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    const head = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Accept-Ranges': 'bytes',
    };
    const rng = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rng) {
      const size = st.size;
      let start = rng[1] ? +rng[1] : Math.max(0, size - +rng[2]);
      let end = rng[1] && rng[2] ? Math.min(+rng[2], size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return;
      }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

function listen(port, tries) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(serve);
    srv.once('error', (e) => {
      if (e.code === 'EADDRINUSE' && tries > 1) resolve(listen(port + 1, tries - 1));
      else reject(e);
    });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, port }));
  });
}

/** `+connect_lobby <id>`: how Steam launches a game the player is joining a friend in. */
function lobbyFromArgv(argv) {
  const i = argv.indexOf('+connect_lobby');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

/** `--smoke`: boot hidden, report what the game sees, quit. Used to check a shell build. */
const SMOKE = process.argv.includes('--smoke');

let win = null;
const steam = new SteamHost({ appId: readAppId(), send: (ch, payload) => win?.webContents.send(ch, payload) });

// One window. A second launch (Steam "Join Game" while we are already up)
// hands its arguments here instead of opening another copy of the game.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const lobby = lobbyFromArgv(argv);
    if (lobby) steam.joinById(lobby);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    steam.start();
    steam.wire(ipcMain);

    const { port } = await listen(PORT, PORTS_TO_TRY);
    if (port !== PORT) console.warn(`[shell] port ${PORT} busy, using ${port}: this origin has its own save`);

    win = new BrowserWindow({
      width: 1280, height: 800, minWidth: 960, minHeight: 600,
      show: !SMOKE,
      backgroundColor: '#0b0912',
      title: 'Midnight Menagerie',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        autoplayPolicy: 'no-user-gesture-required',
        backgroundThrottling: false,
      },
    });
    // Links out of the game open in the real browser, never in this window.
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    win.on('closed', () => { win = null; });
    await win.loadURL(`http://127.0.0.1:${port}/game/index.html`);

    if (SMOKE) { await smoke(win); return; }

    const lobby = lobbyFromArgv(process.argv);
    if (lobby) steam.joinById(lobby);
  });

  app.on('window-all-closed', () => { steam.shutdown(); app.quit(); });
}

async function smoke(w) {
  const errors = [];
  w.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
  let seen = null;
  for (let i = 0; i < 100 && !seen; i++) {
    await new Promise(r => setTimeout(r, 200));
    seen = await w.webContents.executeJavaScript(`(() => {
      if (!window.MM || !window.MM.ctx || !window.MM.ctx.scenes.currentName) return null;
      return { scene: window.MM.ctx.scenes.currentName, platform: window.MM.Platform.describe(),
               net: !!(window.__MM_HOST__ && window.__MM_HOST__.net),
               reason: (window.__MM_HOST__ && window.__MM_HOST__.steamReason) || '' };
    })()`).catch(() => null);
  }
  const shot = (process.argv.find(a => a.startsWith('--smoke-shot=')) || '').slice(13);
  if (shot && seen) {
    await new Promise(r => setTimeout(r, 4000));      // let the title's room draw
    fs.writeFileSync(shot, (await w.webContents.capturePage()).toPNG());
  }
  console.log('SMOKE ' + JSON.stringify({ ok: !!seen, ...(seen || {}), steam: steam.info().available, errors }));
  steam.shutdown();
  app.exit(seen ? 0 : 1);
}
