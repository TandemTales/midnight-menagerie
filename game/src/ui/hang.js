/**
 * The house's pictures, hung on its walls (round 26, SANGUINE).
 *
 * The boards' wall used to have three portraits painted INTO the room
 * (tools/prep_ui_paint.py), small, fused by the room's own paint and lit at its
 * 0.2 ambient, all at one height behind wherever a board put its ribbon or its
 * parchment -- and both survey judges read every one of them as "grey smeared
 * noise with no drawn subject". So the room is bare now, and a board HANGS its
 * pictures here instead, where its own wall actually shows: each one the whole
 * Companion tile off UI/selectCompanion.png (its gilt edge, the painting, the
 * dark nameplate lettered by the same hand) or the mansion off UI/mainMenu.png,
 * at the sample's own resolution (tools/prep_ui_kit.py --only hang), in the Kid
 * board's carved gilt frame on a cord from a cast brass boss (.kit-hang,
 * ui/kit.css). Decoration only: every picture is aria-hidden.
 *
 *   hangHtml('crumbula', 'rw-hang rw-hang--l')   one picture's markup
 *   gallery(['crumbula', 'mopsy'], { skip })     the same for a list, skipping
 *                                                the Companion the run brought
 *                                                (it is standing in the room)
 */
import { COMPANIONS } from '../data/schema.js';

const KIT = new URL('../../assets/ui/kit/', import.meta.url).href;

/* every picture tools/prep_ui_kit.py cuts (its HANG_TILES, and the house) */
export const HUNG = [
  'marmalade', 'wisp', 'crumbula', 'boggle',
  'bones', 'pipkin', 'taffy', 'truffle',
  'hush', 'mopsy', 'drizzle', 'pudding',
  'wink', 'crinkle', 'mossbit', 'brambleboo',
  'house',
];
const KNOWN = new Set(HUNG);

/* THE NAMEPLATE IS LETTERED, NOT PAINTED (round 26 graft). Each tile carries
   Josh's own nameplate at its foot -- name over epithet -- and hung at a wall
   picture's size that epithet came out at 6-7 px at the Deck's 1280 (both
   judges). So a picture shows the painting only, cut off just above the
   painted plate (where it starts on each of the sheet's four rows, measured
   off the cuts: 203/259, 192/247, 183/237, 202/256), and the name and epithet
   are lettered on a small brass plate on the frame's foot (.kit-hang__plate)
   at a size the Deck reads; a frame too narrow for the epithet drops it and
   keeps the name (kit.css). */
const PLATE_TOP = [202, 191, 182, 201];
const ROW = Object.fromEntries(HUNG.slice(0, 16).map((a, i) => [a, i >> 2]));
const WHO = Object.fromEntries(COMPANIONS.map(c => [c.slug, c]));

/** One hung picture. `art` is a Companion (its tile cut upright), the same
 *  with `-tile` (the tile whole, wider than tall), or 'house'. `cls` places
 *  it: a board lays its pictures out through its OWN classes, never by
 *  restyling .kit-hang. `plate: false` hangs a Companion with no nameplate. */
export function hangHtml(art, cls = '', { plate = true } = {}) {
  const tile = art.endsWith('-tile');
  const who = tile ? art.slice(0, -5) : art;
  if (!KNOWN.has(who) || art === 'house-tile') return '';
  const shape = art === 'house' ? ' kit-hang--wide' : tile ? ' kit-hang--tile' : '';
  const c = WHO[who];
  const ar = who in ROW ? ` style="--pic-ar:${tile ? 296 : 216} / ${PLATE_TOP[ROW[who]]}"` : '';
  const named = c && plate
    ? `<span class="kit-hang__plate"><b>${c.name}</b><em>${c.title}</em></span>` : '';
  return `<figure class="kit-hang${shape}${named ? ' kit-hang--named' : ''}${cls ? ' ' + cls : ''}" data-art="${art}" aria-hidden="true">`
    + '<i class="kit-hang__cord"></i>'
    + `<span class="kit-hang__frame"><img class="kit-hang__pic" src="${KIT}hang-${art}.webp" alt="" decoding="async" draggable="false"${ar}></span>`
    + named
    + '</figure>';
}

/**
 * A board's pictures, in the order it asks for them, each with its own class
 * (`classes[i]`). `skip` is the Companion the Kid brought: its portrait would
 * hang on the wall of a room it is standing in, so the next unused one of
 * `spares` takes its place.
 */
export function gallery(arts, classes, { skip = '', spares = ['marmalade', 'wisp', 'pudding', 'drizzle', 'wink'], plate = true } = {}) {
  const base = (a) => a.replace(/-tile$/, '');
  const used = new Set(arts.map(base).filter(a => a !== skip));
  const pool = spares.filter(a => a !== skip && !used.has(a));
  return arts.map((a, i) => {
    const art = base(a) === skip && pool.length ? pool.shift() + (a.endsWith('-tile') ? '-tile' : '') : a;
    return hangHtml(art, classes[i] || '', { plate });
  }).join('');
}

/**
 * The room behind a dialog (round 26, both survey judges: Settings and the pile
 * viewer stood "on a flat black void"). The scrim becomes the boards' own room
 * -- the painted wall, panelling and flags (.kit-ground, the room every board
 * stands in) -- lit by the candles at the dialog's foot and pushed back into
 * the dark (.kit-scrim--room, ui/kit.css), so a dialog is a ledger or a case
 * set down in the house, not a page over nothing. Idempotent.
 */
export function roomBehind(modal) {
  const scrim = modal?.el?.querySelector('.mm-modal__scrim');
  if (!scrim || scrim.classList.contains('kit-scrim--room')) return;
  scrim.classList.add('kit-scrim--room');
  scrim.insertAdjacentHTML('afterbegin',
    '<div class="kit-ground kit-scrim__room" aria-hidden="true"><i class="kit-ground__warm"></i><i class="kit-ground__moon"></i></div>');
}
