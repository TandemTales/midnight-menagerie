/**
 * A kit board for a scene that is not a RoomScene.
 *
 * The four node rooms get their board from `RoomScene._shell` (scenes/reward.js):
 * the painted ground with its backdrop slot, and the select boards' candles,
 * cobwebs, vines and rule at the edges. Game Over is a scene of its own, so it
 * builds the same board's dressing from here and stays in step with it: the
 * same classes (ui/kit.css). Its painting hangs from ui/backdrop.js, as every
 * board's does.
 */

/* The painting slot is `ui/backdrop.js`, the one module every board hangs its
   painting from. Re-exported here only so an import written against this file
   before the two were unified keeps working; new code imports backdrop.js. */
export { paintBackdrop } from './backdrop.js';

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
