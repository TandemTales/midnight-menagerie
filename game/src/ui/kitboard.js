/**
 * A kit board for a scene that is not a RoomScene.
 *
 * The four node rooms get their board from `RoomScene._shell` (scenes/reward.js):
 * the painted ground with its backdrop slot, and the select boards' candles,
 * cobwebs, vines and rule at the edges. The Map and Game Over are scenes of
 * their own, so they build the same board from here and stay in step with it:
 * the same classes (ui/kit.css), the same manifest of Josh's paintings.
 */

const BACKDROPS = new URL('../../assets/backgrounds/', import.meta.url).href;

/**
 * Which painted backgrounds exist (tools/prep_backgrounds.py writes the list).
 * Asked once per session; a board only requests the painting its manifest
 * lists, so a screen whose painting has not been made yet never 404s.
 */
let listed = null;
function paintedBackdrops() {
  if (!listed) {
    listed = fetch(`${BACKDROPS}index.json`)
      .then((r) => (r.ok ? r.json() : { available: [] }))
      .then((j) => new Set(Array.isArray(j.available) ? j.available : []))
      .catch(() => new Set());
  }
  return listed;
}

/**
 * Hang `game/assets/backgrounds/<name>.webp` behind a `.kit-board` once it has
 * decoded. The placeholder ground stays underneath and the kit's vignette and
 * candle light go over it, so a painting arriving changes the wall and not the
 * composition. `alive()` says whether the scene that asked is still up.
 */
export async function paintBackdrop(board, name, alive = () => true) {
  if (!board) return false;
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

/**
 * The board's dressing, as `RoomScene._shell` lays it: the floor, the outer
 * gold rule, the purple vines down both sides, the candle-and-cobweb corners
 * and the breathing glow on their two flames. All decoration.
 * `parts` drops pieces a board has no room for (e.g. `{ corners: false }`).
 */
export function kitDressMarkup({ floor = true, rule = true, vines = true, corners = true } = {}) {
  return `<div class="kit-dress" aria-hidden="true">`
    + (floor ? '<i class="kit-dress__floor"></i>' : '')
    + (rule ? '<i class="kit-dress__rule"></i>' : '')
    + (vines ? '<i class="kit-dress__vine kit-dress__vine--l"></i><i class="kit-dress__vine kit-dress__vine--r"></i>' : '')
    + (corners ? '<i class="kit-dress__corner kit-dress__corner--l"></i><i class="kit-dress__corner kit-dress__corner--r"></i>'
      + '<i class="kit-dress__flame kit-dress__flame--l"></i><i class="kit-dress__flame kit-dress__flame--r"></i>' : '')
    + '</div>';
}
