/**
 * The painted-background slot, for a board that is not a RoomScene.
 *
 * `RoomScene._paintBackdrop` (scenes/reward.js) hangs a room's painting behind
 * its `.kit-board`; the Map and Expedition Over are boards too but are not
 * rooms, so they ask here instead. Same contract, same manifest:
 *
 *   tools/prep_backgrounds.py writes game/assets/backgrounds/<name>.webp and
 *   lists it in index.json. A board only requests a painting that is listed,
 *   so a screen whose painting has not been made yet never 404s.
 *
 * When the painting has loaded, the board gets `--kit-backdrop` and
 * `.has-backdrop`, and `.kit-ground::after` (ui/kit.css) lays it over the
 * placeholder wall under the same candle light and vignette.
 */
const BACKDROPS = new URL('../../assets/backgrounds/', import.meta.url).href;

let listed = null;
function paintedBackdrops() {
  if (!listed) {
    listed = fetch(`${BACKDROPS}index.json`)
      .then(r => (r.ok ? r.json() : { available: [] }))
      .then(j => new Set(Array.isArray(j.available) ? j.available : []))
      .catch(() => new Set());
  }
  return listed;
}

/**
 * Hang `name`'s painting on `board` once it exists and has decoded.
 * `alive()` is asked before touching the DOM, so a screen that has already
 * been left is never written to.
 */
export async function hangBackdrop(board, name, alive = () => true) {
  if (!board || !name) return false;
  const have = await paintedBackdrops();
  if (!alive() || !board.isConnected || !have.has(name)) return false;
  const url = `${BACKDROPS}${name}.webp`;
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => {
      if (!alive() || !board.isConnected) { resolve(false); return; }
      board.style.setProperty('--kit-backdrop', `url("${url}")`);
      board.classList.add('has-backdrop');
      resolve(true);
    }, { once: true });
    img.addEventListener('error', () => resolve(false), { once: true });
    img.src = url;
  });
}
