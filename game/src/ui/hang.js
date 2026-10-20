/**
 * The house's pictures, hung on its walls (round 26, SANGUINE).
 *
 * The boards' wall used to have three portraits painted INTO the room
 * (tools/prep_ui_paint.py), small, fused by the room's own paint and lit at its
 * 0.2 ambient, all at one height behind wherever a board put its ribbon or its
 * parchment -- and both survey judges read every one of them as "grey smeared
 * noise with no drawn subject". So the room is bare now, and a board HANGS its
 * pictures here instead, where its own wall actually shows: each one the whole
 * Companion tile off UI/selectCompanion.png (its gilt edge and the painting;
 * since the round 26 graft its painted nameplate is cut off and the name and
 * epithet LETTERED on a brass plate under the frame, below) or the mansion off
 * UI/mainMenu.png, at the sample's own resolution (tools/prep_ui_kit.py --only
 * hang), in the Kid board's carved gilt frame on a cord from a cast brass boss
 * (.kit-hang, ui/kit.css). Decoration only: every picture is aria-hidden.
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

/* ── THE HOUSE'S OWN PICTURES (Josh, 2026-10-09 and 10-13) ───────────────
   "There shouldn't be pictures of pets when it doesn't pertain specifically
   to their role or room ... make a haunted house portrait that would fit in
   this place." So the boards that are no Companion's room -- the reward
   alcove, an event's hall, the rest fort, game over -- hang the house's own
   paintings: the family who lived here, each with the ORDINARY pet the
   Drawing Room's photographs keep showing (docs/design/01-mansion-structure.md),
   and the house's own rooms and still lifes. Josh painted all twenty
   (game/assets/portrait paintings/); `python tools/prep_ui_kit.py --only
   paintings` sets each 600 px tall as kit/hang-art-<file>.webp. The family
   has no name in the design, so its plates name places in the house, not a
   surname. `ar` is each painting's own width / height. */
export const PAINTINGS = [
  // the family
  { id: 'lady',     file: 'ladyofthehouse',    ar: '1122 / 1402', name: 'The Lady of the House',   title: 'and her cat, 1826' },
  { id: 'master',   file: 'masterofthehouse',  ar: '1122 / 1402', name: 'The Master of the House', title: 'and his hound, 1824' },
  { id: 'dowager',  file: 'dowager',           ar: '1024 / 1536', name: 'The Dowager',             title: 'and her parrot, 1811' },
  { id: 'children', file: 'children',          ar: '1122 / 1402', name: 'The Children',            title: 'and the nursery rabbit, 1838' },
  { id: 'gardener', file: 'gardener',          ar: '1122 / 1402', name: 'The Gardener',            title: 'and the stable cat, 1833' },
  { id: 'son',      file: 'son',               ar: '1122 / 1402', name: 'The Younger Son',         title: 'at his studies, 1849' },
  // the house
  { id: 'ball',       file: 'ball',        ar: '1024 / 1536', name: 'The Midwinter Ball' },
  { id: 'dining',     file: 'diningroom',  ar: '1122 / 1402', name: 'The Dining Room' },
  { id: 'music',      file: 'piano',       ar: '1122 / 1402', name: 'The Music Room' },
  { id: 'fireside',   file: 'fireplace',   ar: '1024 / 1536', name: 'The Drawing Room Fire' },
  { id: 'bedroom',    file: 'bedroom',     ar: '948 / 1659',  name: 'The Blue Bedroom' },
  { id: 'nursery',    file: 'toys',        ar: '1024 / 1536', name: 'The Nursery Shelf' },
  { id: 'hound',      file: 'dog',         ar: '1024 / 1536', name: 'The Hound at Rest' },
  { id: 'fountain',   file: 'fountain',    ar: '1024 / 1536', name: 'The Fountain Court' },
  { id: 'garden',     file: 'garden01',    ar: '1122 / 1402', name: 'The Moon Garden' },
  { id: 'glasshouse', file: 'greenhouse',  ar: '1122 / 1402', name: 'The Conservatory' },
  { id: 'ship',       file: 'ship',        ar: '1024 / 1536', name: 'The Homeward Ship' },
  { id: 'crow',       file: 'crow',        ar: '1024 / 1536', name: 'Still Life with Crow' },
  { id: 'candle',     file: 'stilllife01', ar: '1024 / 1280', name: 'Still Life with Candle' },
  { id: 'keepsake',   file: 'stilllife02', ar: '1024 / 1280', name: 'Still Life with a Keepsake Box' },
];
const ART = Object.fromEntries(PAINTINGS.map(p => [p.id, p]));

/** Which pictures a board chooses among. A rest fort is a cosy place; the
 *  reward alcove and the event's hall are the house's grand rooms. */
export const PICTURE_POOLS = {
  grand: ['lady', 'master', 'dowager', 'son', 'gardener', 'children', 'ball', 'dining', 'music',
          'fountain', 'garden', 'glasshouse', 'ship', 'crow'],
  cosy:  ['fireside', 'nursery', 'hound', 'bedroom', 'children', 'candle', 'keepsake', 'gardener'],
  family: ['lady', 'master', 'dowager', 'son', 'children', 'gardener'],
};

/** One of the house's paintings, in the Kid board's carved frame and a brass plate. */
export function paintingHtml(id, cls = '') {
  const p = ART[id];
  if (!p) return '';
  const plate = `<span class="kit-hang__plate"><b>${p.name}</b>${p.title ? `<em>${p.title}</em>` : ''}</span>`;
  const long = p.name.length > 24 ? ' kit-hang--longname' : '';
  return `<figure class="kit-hang kit-hang--named kit-hang--painting${long}${cls ? ' ' + cls : ''}" data-art="art-${id}" aria-hidden="true">`
    + '<i class="kit-hang__cord"></i>'
    + `<span class="kit-hang__frame"><img class="kit-hang__pic" src="${KIT}hang-art-${p.file}.webp" alt="" decoding="async" draggable="false" style="--pic-ar:${p.ar}"></span>`
    + plate
    + '</figure>';
}

/**
 * A board's pictures: one per class, DIFFERENT paintings drawn from `pool`.
 * RANDOM every time the board is shown (Josh, 2026-10-13: "I'd like the
 * paintings to change randomly each time"). Pictures are decoration, never
 * game state, so they may differ between co-op clients and between visits.
 * A `seed` still fixes the choice, for a test or a capture that must repeat.
 */
export function houseGallery(pool, classes, { seed = null } = {}) {
  const ids = (Array.isArray(pool) ? pool : (PICTURE_POOLS[pool] || PICTURE_POOLS.grand)).filter(id => ART[id]);
  let h = 2166136261;
  /* `#...&pics=<anything>` in the URL fixes the choice for a judged capture:
     builds compared side by side must hang the same pictures, or the judges
     score the paintings instead of the board. Players never set it. */
  if (seed == null && typeof location !== 'undefined') {
    const fixed = new URLSearchParams(location.hash.slice(1)).get('pics');
    if (fixed) seed = `${fixed}|${classes.join(' ')}`;
  }
  if (seed == null) h = (Math.random() * 4294967296) >>> 0;
  else for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const left = ids.slice();
  return classes.map((cls) => {
    if (!left.length) return '';
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const [id] = left.splice(h % left.length, 1);
    return paintingHtml(id, cls);
  }).join('');
}

/**
 * Fit each hung painting to the wall it has (survey 5, both judges: on the
 * event, rest, reward and game-over walls a sconce, a panel or a card stood
 * over a painting's nameplate). The boards were laid out for the Companions'
 * portraits, which share one shape; Josh's paintings run from 1024x1280 to
 * 948x1659, so at a board's --hang-w a tall one dropped its plate onto
 * whatever stands below it. Each picture keeps its board's width when it
 * clears and is otherwise narrowed -- never moved -- until its frame (with the
 * moulding outside it) and its plate clear every `obstacles` box by `gap` px.
 * A painting that cannot clear at `min` px wide gives its place to the first
 * painting of `pool` not already hung that can (at the Deck's 1280 the tallest
 * canvases do not fit over the event hall's sconces); a picture with no such
 * stand-in does not hang. Measured on screen, so call it once the board has
 * laid out, and again on resize. Returns the pictures as hung.
 */
/**
 * One or two lines on a plate, never three (round 40 graft, IOLITE's
 * `settlePlate`): a name that has to wrap at the plate's width keeps the
 * plate to itself and drops its epithet ("and her cat, 1826"); a name that
 * still runs to three lines sets a point closer. Call it whenever the
 * frame's width changes; fitHung does. Returns the plate's height.
 */
export function settlePlate(f) {
  const p = f?.querySelector('.kit-hang__plate');
  if (!p) return 0;
  f.classList.remove('kit-hang--terse', 'kit-hang--tight');
  const b = p.querySelector('b');
  if (!b) return p.offsetHeight;
  const lines = () => b.offsetHeight / (parseFloat(getComputedStyle(b).lineHeight) || 14);
  if (p.querySelector('em') && lines() > 1.5) f.classList.add('kit-hang--terse');
  if (lines() > 2.5) f.classList.add('kit-hang--tight');
  return p.offsetHeight;
}

export function fitHung(figs, obstacles, { gap = 8, min = 72, pool = null } = {}) {
  const boxes = obstacles.filter(o => o && !o.hidden && o.getClientRects().length)
    .map(o => o.getBoundingClientRect()).filter(r => r.width && r.height);
  const hit = (a, b) => a.left < b.right + gap && a.right > b.left - gap
    && a.top < b.bottom + gap && a.bottom > b.top - gap;
  const clear = (f) => {
    settlePlate(f);
    const a = f.querySelector('.kit-hang__frame')?.getBoundingClientRect();
    if (!a) return true;
    const rim = a.width * .085;
    const u = { left: a.left - rim, right: a.right + rim, top: a.top - rim, bottom: a.bottom + rim };
    const p = f.querySelector('.kit-hang__plate')?.getBoundingClientRect();
    if (p && p.width) {
      u.left = Math.min(u.left, p.left); u.right = Math.max(u.right, p.right);
      u.bottom = Math.max(u.bottom, p.bottom);
    }
    return !boxes.some(b => hit(u, b));
  };
  // the widest width up to the board's own at which `f` clears, set on it; false if none
  const fit = (f) => {
    f.style.removeProperty('--hang-w');
    f.hidden = false;
    const W0 = f.offsetWidth;
    if (!W0 || clear(f)) return true;
    const set = (w) => f.style.setProperty('--hang-w', `${w.toFixed(1)}px`);
    let lo = min, hi = W0;
    set(lo);
    if (!clear(f)) { f.style.removeProperty('--hang-w'); return false; }
    for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; set(m); if (clear(f)) lo = m; else hi = m; }
    set(lo);
    return true;
  };
  const spares = (Array.isArray(pool) ? pool : PICTURE_POOLS[pool] || []).filter(id => ART[id]);
  const hung = figs.filter(Boolean);
  return hung.map((f, i) => {
    if (fit(f)) return f;
    if (f.classList.contains('kit-hang--painting')) {
      const cls = [...f.classList].filter(c => !c.startsWith('kit-hang')).join(' ');
      const taken = new Set(hung.map(g => g.dataset.art));
      // the pool read on from the painting it stands in for, so the stand-ins vary
      const at = spares.indexOf(String(f.dataset.art).slice(4)) + 1;
      for (const id of [...spares.slice(at), ...spares.slice(0, at)]) {
        if (taken.has(`art-${id}`)) continue;
        const t = document.createElement('div');
        t.innerHTML = paintingHtml(id, cls);
        const n = t.firstElementChild;
        f.replaceWith(n);
        if (fit(n)) { hung[i] = n; return n; }
        n.replaceWith(f);
      }
    }
    f.hidden = true;
    return f;
  });
}

/**
 * The room behind a dialog (round 26, both survey judges: Settings and the pile
 * viewer stood "on a flat black void"). Round 26 graft (VERMEILLE's; both
 * judges asked for it in effect): the dialog stands over the ACTUAL screen it
 * was opened from -- the map or the fight the pile belongs to, the run rail,
 * the room's candles -- turned down and cooled under a scrim
 * (.kit-scrim--dim, ui/kit.css), only the strip behind the dialog's own
 * plaque put out so no second title reads through. SANGUINE's round painted
 * the boards' room into the scrim instead; that read as a wainscot under a
 * flat dark. The name is kept for its callers. Idempotent.
 */
export function roomBehind(modal) {
  const scrim = modal?.el?.querySelector('.mm-modal__scrim');
  if (!scrim || scrim.classList.contains('kit-scrim--dim')) return;
  scrim.classList.add('kit-scrim--dim');
}
