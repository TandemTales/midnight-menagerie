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

/** One hung picture. `art` is a Companion (its tile cut upright), the same
 *  with `-tile` (the tile whole, wider than tall), or 'house'. `cls` places
 *  it: a board lays its pictures out through its OWN classes, never by
 *  restyling .kit-hang. */
export function hangHtml(art, cls = '') {
  const tile = art.endsWith('-tile');
  if (!KNOWN.has(tile ? art.slice(0, -5) : art) || art === 'house-tile') return '';
  const shape = art === 'house' ? ' kit-hang--wide' : tile ? ' kit-hang--tile' : '';
  return `<figure class="kit-hang${shape}${cls ? ' ' + cls : ''}" data-art="${art}" aria-hidden="true">`
    + '<i class="kit-hang__cord"></i>'
    + `<span class="kit-hang__frame"><img class="kit-hang__pic" src="${KIT}hang-${art}.webp" alt="" decoding="async" draggable="false"></span>`
    + '</figure>';
}

/**
 * A board's pictures, in the order it asks for them, each with its own class
 * (`classes[i]`). `skip` is the Companion the Kid brought: its portrait would
 * hang on the wall of a room it is standing in, so the next unused one of
 * `spares` takes its place.
 */
export function gallery(arts, classes, { skip = '', spares = ['marmalade', 'wisp', 'pudding', 'drizzle', 'wink'] } = {}) {
  const base = (a) => a.replace(/-tile$/, '');
  const used = new Set(arts.map(base).filter(a => a !== skip));
  const pool = spares.filter(a => a !== skip && !used.has(a));
  return arts.map((a, i) => {
    const art = base(a) === skip && pool.length ? pool.shift() + (a.endsWith('-tile') ? '-tile' : '') : a;
    return hangHtml(art, classes[i] || '');
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
