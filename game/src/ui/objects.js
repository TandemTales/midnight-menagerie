/**
 * The house's small painted objects (round 19, BICE: "one house's hardware").
 *
 * A Keepsake, a Snack or one of the Safe Room's things used to be an icon-font
 * line drawing in an empty ring — and three Snacks shared one glyph. Each is a
 * small painted object now, painted by tools/prep_ui_hardware.py into
 * game/assets/ui/objects/<key>.webp and set in the kit's velvet well
 * (.kit-hw-well > .kit-obj, ui/kit.css). Presentation only: which object a
 * Keepsake is comes from its `icon` in data/relics.js, which this reads.
 *
 * A key with no painting falls back to whatever the caller drew before, so a
 * new Keepsake never renders as a hole.
 */
import { relicById } from '../data/relics.js';

const BASE = new URL('../../assets/ui/objects/', import.meta.url).href;

/* every picture tools/prep_ui_hardware.py paints (its OBJECTS table) */
export const OBJECT_KEYS = new Set([
  // Keepsakes, by their data/relics.js `icon`
  'torch', 'battery', 'knot', 'mat', 'slipper', 'bell', 'ball', 'jar', 'net', 'hand',
  'button', 'chalk', 'thermos', 'mouse', 'monocle', 'nightlight', 'quill', 'ticket',
  'key', 'knot2', 'tin', 'charm', 'bag', 'watch', 'quilt', 'cage', 'shadow', 'collar',
  'bookmark', 'stamp', 'lens', 'orrery', 'smokedglass', 'trimmer', 'dancecard', 'goblet',
  'rib', 'crooked', 'brush', 'fork', 'duck', 'tag', 'frog', 'sickle', 'leash', 'slippers',
  'ribbon', 'glove', 'handbell', 'splinter', 'wick', 'ledger', 'buttons', 'lantern',
  'bowl', 'photo', 'scratch', 'keepsake',
  // Snacks, by their state/run.js SNACKS id
  'snack-gummy-bat', 'snack-liquorice', 'snack-cold-milk', 'snack-popping-candy',
  'snack-jawbreaker', 'snack-sherbet', 'snack-toffee', 'snack',
  // the Safe Room's four things, and a candle stub for a ladder's rung
  'pillow', 'whetstone', 'forge-candle', 'teacup', 'mend', 'clone', 'candle-unlit', 'candle-lit',
  // Gear, by its data/backpack.js `icon`
  'gear-whistle', 'gear-treats', 'gear-camera', 'gear-toy', 'gear-tag', 'gear-flashlight',
  'gear-radio', 'gear-mirror', 'gear-tool', 'gear-rope', 'gear-chalkbox', 'gear-glow',
  'gear-compass', 'gear-notebook', 'gear-blanket', 'gear-thermos2', 'gear-battery2', 'gear-tin2',
]);

export function objectUrl(key) {
  return OBJECT_KEYS.has(key) ? `${BASE}${key}.webp` : null;
}

/** The painted object for a Keepsake id (always a picture: the default is a charm). */
export function keepsakeKey(id) {
  const icon = relicById(id)?.icon || id;
  return OBJECT_KEYS.has(icon) ? icon : 'keepsake';
}

/** The painted object for a piece of Gear, by its data/backpack.js icon. */
export function gearKey(icon) {
  const k = `gear-${icon}`;
  return OBJECT_KEYS.has(k) ? k : null;
}

/** The painted object for a Snack id. */
export function snackKey(id) {
  const k = `snack-${id}`;
  return OBJECT_KEYS.has(k) ? k : 'snack';
}

/** `<i class="kit-obj">` for a key; inside a velvet well unless `well: false`. */
export function objectHtml(key, { well = true, cls = '' } = {}) {
  const url = objectUrl(key);
  if (!url) return '';
  const obj = `<i class="kit-obj" style="--obj:url('${url}')" aria-hidden="true"></i>`;
  return well ? `<span class="kit-hw-well${cls ? ' ' + cls : ''}" aria-hidden="true">${obj}</span>` : obj;
}
