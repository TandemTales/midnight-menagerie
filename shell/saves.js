/**
 * Saves, as files. The `storage` half of the host contract in
 * `game/src/platform/index.js`, and the reason Steam Cloud can work at all: Auto-Cloud
 * syncs a directory, and it cannot see localStorage, which lives in Chromium's own
 * profile as a LevelDB nobody should be syncing. `docs/RELEASE.md` has the setting.
 *
 * A write goes to a file beside the folder and is renamed in, so nothing Cloud or a
 * crash can see is ever half a save, and the temporary file is never in the folder
 * Cloud is watching. `core/storage.js` keeps its own `.bak` of every slot on top.
 *
 * Synchronous over IPC, on purpose. The last flush happens in `pagehide`, as the window
 * closes, and an answer the page would have to wait a turn for may never come.
 */
const fs = require('fs');
const path = require('path');

/** A slot's name, never a path: nothing the page sends can leave the folder. */
const NAME = /^[a-z0-9][a-z0-9._-]*$/i;

class SaveFiles {
  constructor(dir) {
    this.dir = dir;
  }

  _file(name) {
    if (!NAME.test(String(name))) throw new Error(`not a save slot: ${name}`);
    return path.join(this.dir, String(name));
  }

  read(name) {
    try { return fs.readFileSync(this._file(name), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }

  write(name, text) {
    const file = this._file(name);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.dir}.${name}.tmp`;
    fs.writeFileSync(tmp, String(text), 'utf8');
    fs.renameSync(tmp, file);
  }

  remove(name) {
    try { fs.unlinkSync(this._file(name)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  list() {
    try { return fs.readdirSync(this.dir).filter(n => NAME.test(n)); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }

  wire(ipc) {
    ipc.on('mm:save-dir', (e) => { e.returnValue = this.dir; });
    ipc.on('mm:save', (e, op, name, text) => {
      if (!['read', 'write', 'remove', 'list'].includes(op)) { e.returnValue = { error: `no such call: ${op}` }; return; }
      try { e.returnValue = { value: this[op](name, text) ?? null }; }
      catch (err) {
        const error = String(err && err.message || err);
        console.warn(`[saves] ${op}: ${error}`);
        e.returnValue = { error };
      }
    });
  }
}

module.exports = { SaveFiles };
