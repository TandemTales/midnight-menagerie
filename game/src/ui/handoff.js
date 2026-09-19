/**
 * "Pass it over." OWNER: ui-chrome.
 *
 * Two Kids, one screen. Between one Kid finishing and the next one starting,
 * something has to cover the board — not for ceremony, but because a hand of
 * Tricks is the one genuinely private thing in this game and the player about
 * to pick up the controller must not be looking at it.
 *
 *   await passTo({ name: 'Eli Rosen', companion: 'bones', line: 'Your turn.' });
 *
 * It resolves when the next player says they are ready. There is no way to
 * dismiss it by accident: no Escape, no backdrop click, and the scrim is
 * opaque rather than a tint.
 *
 * ── It is a board, not a black screen (round 12, CHROME) ───────────────────
 * The cover is one of the house's staged boards, built of the kit's own
 * pieces (ui/kit.css) the way the Safe Room and Expedition Over are: the lit
 * room (`.kit-board`, `.kit-ground`) with the corner candles, cobwebs, vines
 * and gilt rule every board wears (`.kit-dress`), the words on title.png's
 * cartouche (`.kit-titleblock`), the next Kid in the Kid board's portrait
 * frame over a nameplate (`.kit-frame`, `.kit-plate`) with their Companion
 * beside them, both standing on the boards' carved ledge (`.kit-ledge`) by a
 * candle (`.kit-prop--candle`, `.kit-light`) in the alcove a board's choice
 * is made in, its moon crest on the rule (`.kit-stage`), and I'M READY the boards' lit
 * nameplate with its ENTER keycap and the Kid board's round confirm medallion
 * (`.kit-btn`, `.kit-medallion--ornate`). The room is opaque paint over an
 * opaque scrim: nothing of the fight shows through any of it.
 *
 * ── This is the seam a transport replaces ───────────────────────────────────
 * With a wire, each client owns one seat for the whole expedition and never
 * hands it anywhere; the other Kid's turn happens on their own screen and this
 * never opens. `shouldHandOff()` is the single place that decides, so switching
 * to a networked session means making it answer false.
 */

import { Modal, DIALOG_GLYPH } from './modal.js';
import { COMPANIONS, KIDS } from '../data/schema.js';
import { kidImg, companionPortrait, ensureCss as ensureSheet } from './portrait.js';

const CSS = new URL('./handoff.css', import.meta.url).href;
const PORTRAIT_CSS = new URL('./portrait.css', import.meta.url).href;

let cssReady = null;
function ensureCss() {
  if (cssReady) return cssReady;
  cssReady = Promise.all([
    new Promise((res) => {
      if (document.querySelector(`link[href="${CSS}"]`)) return res();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = CSS;
      l.onload = () => res();
      l.onerror = () => res();          // a missing sheet must not wedge the game
      document.head.appendChild(l);
    }),
    // the Companion's portrait plate (`.pf`) is drawn by ui/portrait.css
    ensureSheet(PORTRAIT_CSS),
  ]);
  return cssReady;
}

/* The board's paintings, fetched when this module loads — every scene that
   can hand over imports it, long before a turn ends — so the first veil of a
   game goes up painted, not as a plum field with the hall filling in behind
   the words. The room's three layers are 1920x1080 each and a fight never
   loads them itself. The veil NEVER waits for them: it has to be up the
   moment a turn ends, because the board under it is the last Kid's hand. */
const KIT = new URL('../../assets/ui/kit/', import.meta.url).href;
const PAINTINGS = ['room.webp', 'room-warm.webp', 'room-moon.webp', 'pool.webp', 'beam.webp', 'beam-r.webp',
  'damask.webp', 'flock.webp', 'panel.webp', 'frame.webp', 'plate-lit.webp', 'ledge.webp', 'medal-moon.webp',
  'corner-l.webp', 'corner-r.webp', 'vine-l.webp', 'vine-r.webp', 'footscroll.webp', 'candle.webp', 'skull.webp',
  'button-ornate.webp', 'keycap.webp', 'cart-cap-l.webp', 'cart-cap-r.webp', 'cart-band.webp', 'cart-crest.webp',
  'marble.webp', 'grain.webp'].map((f) => KIT + f);
const warmed = [];
function warmPaintings() {
  if (warmed.length || typeof Image === 'undefined') return;
  for (const src of PAINTINGS) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    warmed.push(img);
  }
}
if (typeof window !== 'undefined') {
  if (window.requestIdleCallback) window.requestIdleCallback(warmPaintings, { timeout: 4000 });
  else setTimeout(warmPaintings, 1200);
}

/**
 * Does this client need to hand the screen over at all?
 *
 * False in solo, and false the moment a real session owns one seat — which is
 * why every caller asks here rather than testing `run.partySize` itself.
 *
 * @param {import('../state/run.js').Run} run
 */
export function shouldHandOff(run) {
  if (!run || run.partySize < 2) return false;
  if (run.session && run.session.remote) return false;   // a wire owns the seats
  return true;
}
/* `Run.resetSeat()` asks the same question for the same reason — a wire means
   `localSeat` is "which Kid I am" rather than "who has the controller" — and
   repeats the condition rather than importing it, because state/ must not
   depend on ui/. If you change one, change the other. */

/**
 * Which of the eight Kids is being handed the screen, for their portrait.
 *
 * The callers pass a display NAME, which a party can set to anything, so the
 * name is not trusted to be one of KIDS': the seat in the live run that
 * carries that name and Companion is asked first, then the roster by full
 * name, then by first name. A Kid nobody can place gets no portrait — the
 * nameplate still names them — rather than somebody else's face.
 */
function kidOf(o, first) {
  if (o.kid) return KIDS.find((k) => k.slug === o.kid) || null;
  const run = typeof window !== 'undefined' ? window.MM?.ctx?.run : null;
  try {
    const seat = run?.kids?.find?.((k) => run.kidNameOf(k) === o.name
      && (!o.companion || k.companion === o.companion));
    if (seat) return KIDS.find((k) => k.slug === seat.kid) || null;
  } catch { /* a run mid-teardown answers nothing; the roster still can */ }
  const name = String(o.name || '');
  return KIDS.find((k) => k.name === name)
    || KIDS.find((k) => k.name.split(' ')[0] === first) || null;
}

/**
 * Cover the screen and wait for the next player.
 *
 * `onReady` runs AFTER they say they are ready but BEFORE the veil lifts, and
 * is awaited. That ordering is the whole point: switch the seat and redraw
 * behind the cover, so what appears when it comes down is already the new Kid's
 * screen. Doing it after the close shows a frame of the previous Kid's hand,
 * which is precisely what this screen exists to prevent.
 *
 * @param {{name:string, companion?:string, kid?:string, line?:string, sub?:string,
 *          onReady?:() => (void|Promise<void>)}} o
 *   `kid` (a KIDS slug) is optional: without it the Kid is found by name.
 * @returns {Promise<void>}
 */
export async function passTo(o = {}) {
  const name = o.name || 'the other Kid';
  const first = String(name).split(' ')[0];
  const comp = COMPANIONS.find(c => c.slug === o.companion);
  const kid = kidOf(o, first);
  warmPaintings();                          // already done, unless this is very early
  await ensureCss();

  const m = new Modal({
    size: 'full',
    dismissible: false,
    className: 'mm-handoff',
    labelledBy: 'mm-handoff-title',
  });
  /* Modal labels every dialog by its own head's title, which the veil leaves
     empty and hidden, and does not read `labelledBy`: so the veil points its
     dialog at the name itself, and a screen reader says whose turn it is. */
  m.dialog.setAttribute('aria-labelledby', 'mm-handoff-title');

  /* The room the veil is painted as: decoration only, and opaque. It stands
     over the scrim and under the dialog, full-bleed, and it has no transition
     of its own, so the very first frame of the veil already hides the board. */
  const board = document.createElement('div');
  board.className = 'hoff-board kit-board';
  board.setAttribute('aria-hidden', 'true');
  board.innerHTML =
    '<div class="hoff-board__ground kit-ground"><i class="kit-ground__warm"></i><i class="kit-ground__moon"></i></div>'
    + '<div class="hoff-board__vig"></div>'
    + '<div class="hoff-board__dress kit-dress">'
    + '<i class="kit-dress__floor"></i><i class="kit-dress__rule"></i><i class="kit-dress__footscroll"></i>'
    + '<i class="kit-dress__vine kit-dress__vine--l"></i><i class="kit-dress__vine kit-dress__vine--r"></i>'
    + '<i class="kit-dress__corner kit-dress__corner--l"></i><i class="kit-dress__corner kit-dress__corner--r"></i>'
    + '<i class="kit-dress__flame kit-dress__flame--l"></i><i class="kit-dress__flame kit-dress__flame--r"></i>'
    + '</div>';
  m.el.insertBefore(board, m.dialog);

  const wrap = document.createElement('div');
  wrap.className = 'hoff' + (kid ? '' : ' hoff--nokid') + (comp ? '' : ' hoff--nopet');
  wrap.innerHTML =
    `<header class="hoff__plaque kit-titleblock">`
    + `<p class="hoff__k kit-cartouche__title">Pass it over</p>`
    + (o.sub ? `<p class="hoff__sub kit-cartouche__sub">${esc(o.sub)}</p>` : '')
    + `</header>`
    + `<div class="hoff__stage kit-stage">`
    /* the alcove's back wall, hung with the Companion board's flocked damask
       and lit by the candle on the ledge (.kit-mat), and that candle's light */
    + `<i class="hoff__wall kit-mat kit-mat--flock" aria-hidden="true"></i>`
    + `<i class="hoff__glow kit-light kit-light--candle" aria-hidden="true"></i>`
    + `<i class="hoff__ledge kit-ledge" aria-hidden="true"></i>`
    + `<figure class="hoff__who hoff__who--kid">`
    + (kid ? `<div class="hoff__pic hoff__pic--kid kit-frame kit-frame--over"><div class="hoff__art"></div></div>` : '')
    + `<figcaption class="hoff__plate kit-plate">`
    + `<h2 class="hoff__name kit-plate__name" id="mm-handoff-title">${esc(first)}</h2>`
    + `<span class="hoff__line kit-plate__epithet">${esc(o.line || 'Your turn.')}</span>`
    + `</figcaption></figure>`
    + (comp
      /* between the two of them, under the crest: the Kid board's still
         life, a skull on its books and a candle burning beside it */
      ? `<span class="hoff__still" aria-hidden="true">`
        + `<i class="hoff__skull kit-prop kit-prop--skull"></i>`
        + `<span class="hoff__candle"><i class="hoff__flame kit-prop kit-prop--candle"></i></span>`
        + `</span>`
        + `<figure class="hoff__who hoff__who--pet">`
        + `<div class="hoff__pic hoff__pic--pet kit-frame kit-frame--over"><div class="hoff__art"></div></div>`
        + `<figcaption class="hoff__plate hoff__plate--pet kit-plate">`
        + `<b class="hoff__comp kit-plate__name">with ${esc(comp.name)}</b>`
        + `<span class="hoff__title kit-plate__epithet">${esc(comp.title || '')}</span>`
        + `</figcaption></figure>`
      : '')
    + `</div>`
    + `<button type="button" class="hoff__go kit-btn"><span class="hoff__go-words">I'm ready</span>`
    + `<kbd class="hoff__key">Enter</kbd>`
    + `<i class="hoff__medal kit-medallion kit-medallion--ornate kit-btn__medal" aria-hidden="true">${DIALOG_GLYPH.done}</i>`
    + `</button>`;

  /* the two of them, drawn by ui/portrait.js as every other board draws them */
  let pet = null;
  if (kid) {
    wrap.querySelector('.hoff__pic--kid .hoff__art')
      .appendChild(kidImg(kid.slug, { className: 'kidpf hoff__kidimg', alt: '' }));
  }
  if (comp) {
    pet = companionPortrait({ slug: comp.slug, variant: '-card', parallax: 0, shimmer: false, alt: '' });
    wrap.querySelector('.hoff__pic--pet .hoff__art').appendChild(pet.el);
  }

  m.body.appendChild(wrap);
  const go = wrap.querySelector('.hoff__go');
  let handing = false;
  const ready = async () => {
    if (handing) return;
    handing = true;
    // `handing` is the guard, NOT `disabled`. A disabled button is one a player
    // cannot press again if `onReady` somehow never settles, and it is one
    // Playwright waits on forever rather than reporting. The class is for the
    // look of it.
    go.classList.add('is-going');
    try { if (typeof o.onReady === 'function') await o.onReady(); }
    catch (err) { console.error('[handoff] onReady threw', err); }
    finally { m.close(); }
  };
  go.addEventListener('click', ready);

  // Enter and Space, because this is the one screen where a player is looking
  // away from the mouse while they hand the machine across.
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ready(); }
  };
  document.addEventListener('keydown', onKey);

  const p = m.open();
  requestAnimationFrame(() => go.focus());
  /* The board is up, and opaque, from the veil's first frame. The two of them
     are shown the moment their pictures are in hand — never more than half a
     second — so the veil never shows an empty frame where a face should be. */
  const pics = [...wrap.querySelectorAll('img')];
  Promise.race([
    Promise.all(pics.map((img) => (img.decode ? img.decode().catch(() => {}) : null))),
    new Promise((r) => setTimeout(r, 500)),
  ]).then(() => m.el.classList.add('is-painted'));
  try { await p; } finally {
    document.removeEventListener('keydown', onKey);
    pet?.destroy();
  }
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

export default passTo;
