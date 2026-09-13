/**
 * The painted-background slot. ONE module for every board.
 *
 * Josh paints a background per screen (`docs/art/background-prompts.md`);
 * `tools/prep_backgrounds.py` writes each one to
 * `game/assets/backgrounds/<name>.webp` and lists it in `index.json`. A board
 * hangs its painting from here, whatever kind of scene it is:
 *
 *   RoomScene._shell (scenes/reward.js)   the Shop, the Reward, a Curiosity,
 *                                         the Safe Room — `name` is the room kind
 *   scenes/map.js                         the desk the survey lies on ('map')
 *   scenes/gameover.js                    the memorial board ('gameover')
 *
 * This used to be three copies of the same fifteen lines — `_paintBackdrop` in
 * the room shell, `paintBackdrop` in ui/kitboard.js and `hangBackdrop` here —
 * each with its own cache of the manifest. They are one function now.
 *
 * Contract: a board only requests a painting its manifest lists, so a screen
 * whose painting has not been made yet never 404s. When the painting has
 * DECODED the board gets `--kit-backdrop` and `.has-backdrop`, and
 * `.kit-ground::after` (ui/kit.css) lays it over the placeholder wall under the
 * same candle light and vignette — a painting arriving changes the wall, not
 * the composition.
 */
const BACKDROPS = new URL('../../assets/backgrounds/', import.meta.url).href;

let listed = null;
/** The set of painted backgrounds that exist. Asked once per session. */
export function paintedBackdrops() {
  if (!listed) {
    listed = fetch(`${BACKDROPS}index.json`)
      .then((r) => (r.ok ? r.json() : { available: [] }))
      .then((j) => new Set(Array.isArray(j.available) ? j.available : []))
      .catch(() => new Set());
  }
  return listed;
}

/**
 * Hang `name`'s painting on `board` (a `.kit-board`) once it exists and has
 * decoded. `alive()` is asked before touching the DOM, so a screen that has
 * already been left is never written to. Resolves true when it was hung.
 */
export async function paintBackdrop(board, name, alive = () => true) {
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

/** The Map's name for the same call, kept so nothing that says it breaks. */
export const hangBackdrop = paintBackdrop;
