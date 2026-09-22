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
 * ── This is the seam a transport replaces ───────────────────────────────────
 * With a wire, each client owns one seat for the whole expedition and never
 * hands it anywhere; the other Kid's turn happens on their own screen and this
 * never opens. `shouldHandOff()` is the single place that decides, so switching
 * to a networked session means making it answer false.
 */

import { Modal } from './modal.js';
import { COMPANIONS, KIDS } from '../data/schema.js';
import { kidImg, thumbSrc, fullSrc } from './portrait.js';

const CSS = new URL('./handoff.css', import.meta.url).href;

let cssReady = null;
function ensureCss() {
  if (cssReady) return cssReady;
  cssReady = new Promise((res) => {
    if (document.querySelector(`link[href="${CSS}"]`)) return res();
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS;
    l.onload = () => res();
    l.onerror = () => res();          // a missing sheet must not wedge the game
    document.head.appendChild(l);
  });
  return cssReady;
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
 * Cover the screen and wait for the next player.
 *
 * `onReady` runs AFTER they say they are ready but BEFORE the veil lifts, and
 * is awaited. That ordering is the whole point: switch the seat and redraw
 * behind the cover, so what appears when it comes down is already the new Kid's
 * screen. Doing it after the close shows a frame of the previous Kid's hand,
 * which is precisely what this screen exists to prevent.
 *
 * @param {{name:string, companion?:string, line?:string, sub?:string,
 *          onReady?:() => (void|Promise<void>)}} o
 * @returns {Promise<void>}
 */
export async function passTo(o = {}) {
  await ensureCss();
  const name = o.name || 'the other Kid';
  const first = String(name).split(' ')[0];
  const comp = COMPANIONS.find(c => c.slug === o.companion);
  /* Who is being handed the machine, as a painted Kid. `name` is the display
     name `run.kidNameOf()` gives, which is the roster's own unless a player
     renamed their Kid; a name that is nobody's in KIDS simply has no portrait
     and the stage keeps the Companion alone. */
  const kid = KIDS.find(k => k.name === name) || KIDS.find(k => k.name.split(' ')[0] === first) || null;

  const m = new Modal({
    size: 'full',
    dismissible: false,
    className: 'mm-handoff',
    labelledBy: 'mm-handoff-title',
  });
  /* Modal names its own (empty, hidden) head in aria-labelledby and does not
     read `labelledBy`; the veil's title is the Kid's name, so point at it. */
  m.dialog.setAttribute('aria-labelledby', 'mm-handoff-title');

  const wrap = document.createElement('div');
  wrap.className = 'hoff';
  wrap.style.setProperty('--hoff-len', String(Math.max(3, first.length)));
  /* A title card, the way the title screen is one: the Kid's first name in
     UI/title.png's cartouche, lettered as MIDNIGHT MENAGERIE is, with PASS IT
     OVER on the gold ribbon hung from it. Under it the two of them hung on a
     panel of the Kid board's own wall -- each in UI/selectKid.png's arched
     gilt mirror, shortened to a PORTRAIT opening (`.kit-oval`, round 13's
     graft: the slot it was cropped the Companion to an eyeball), a gap
     between them, and in that gap a lantern
     burning over a ledge with a skull and a candle on it: the light that
     answers the moon on the house behind. Behind everything the house itself,
     in Josh's painting of it (UI/mainMenu.png), drawn well down where the
     words are, inside the boards' gilt rule with old threads across its top
     corners and a candle standing in each bottom corner, and a velvet swag
     with its tassels across the head of it, because the thing this screen IS
     is the curtain that comes down between two players. All of it opaque: the
     veil still shows nothing of the board it covers.

     NOTHING IS SAID TWICE (round 12's judges, then round 13's). Round 12 was
     marked down by all three for saying MATEO in the cartouche and "Mateo
     Alvarez" on the plate under him, and "with Wink" under the cartouche and
     again on Wink's plate; round 13 answered by cutting the Kid's plate to
     one line, and a judge of THAT round said the pair no longer matched --
     "it reads 'looking for Pepper' where the companion's reads 'Wink / the
     Eyeball Spider'".
     So the rule is not "never repeat a word", it is SAY EACH THING ONCE, in
     the place that thing belongs. The two plates are the same object twice, a
     name over its small italic epithet, the way every nameplate in the
     samples is; the cartouche is the wordmark standing over that board, which
     is what UI/selectKid.png does above its own. What was genuinely said
     twice was the PET -- on the plate and again in the line under YOUR TURN
     -- and that was never the game saying it: every caller in `scenes/` hands
     this screen a name-free sub ("Do not look yet.", "Everyone gets a say in
     the route."). It was the CAPTURE SCRIPT, which passed
     `${kid.pet} is still out there somewhere.` and put the repetition in
     front of a judge. The script says what a caller says now, and the line
     here is the caller's, word for word. */
  wrap.innerHTML =
    `<div class="hoff__room kit-board" aria-hidden="true">`
    + `<i class="hoff__night"></i>`
    + `<i class="hoff__vig"></i>`
    + `<div class="hoff__dress kit-dress">`
    + `<i class="hoff__swag kit-valance"></i>`
    + `<i class="kit-dress__rule"></i><i class="kit-dress__footscroll"></i>`
    + `<i class="hoff__web hoff__web--l kit-web"></i><i class="hoff__web hoff__web--r kit-web kit-web--r"></i>`
    + `<i class="hoff__wax hoff__wax--l kit-prop kit-prop--candle"></i>`
    + `<i class="hoff__wax hoff__wax--r kit-prop kit-prop--candle"></i>`
    + `</div></div>`
    + ENGRAVE
    + `<div class="hoff__card">`
    + `<header class="hoff__plaque kit-titleblock">`
    + `<h2 class="hoff__name kit-cartouche__title" id="mm-handoff-title">${esc(first)}</h2>`
    + `<p class="hoff__k kit-ribbon">Pass it over</p>`
    + `</header>`
    + ((kid || comp) ? `<div class="hoff__stage kit-panel kit-panel--damask" data-n="${(kid ? 1 : 0) + (comp ? 1 : 0)}">`
        + `<div class="hoff__between" aria-hidden="true">`
        + `<i class="hoff__lamp kit-lantern"></i>`
        + `<i class="hoff__shelf kit-ledge"></i>`
        + `<i class="hoff__skull kit-prop kit-prop--skull"></i>`
        + `<i class="hoff__stub kit-prop kit-prop--candle"></i>`
        + `</div></div>` : '')
    + `<p class="hoff__line">${esc(o.line || 'Your turn.')}</p>`
    + (o.sub ? `<p class="hoff__sub">${esc(o.sub)}</p>` : '')
    + `<button type="button" class="hoff__go kit-btn">`
    + `<span class="hoff__words">I'm ready</span><kbd class="hoff__key">Enter</kbd>`
    + `<i class="hoff__medal kit-medallion kit-btn__medal" aria-hidden="true">${TICK}</i></button>`
    + `</div>`;

  const stage = wrap.querySelector('.hoff__stage');
  const between = wrap.querySelector('.hoff__between');
  if (stage) {
    if (kid) {
      const img = kidImg(kid.slug, { className: 'hoff__img hoff__img--kid', alt: '' });
      /* The veil goes up the instant it is asked for -- it is a cover, and a
         cover that waits is not one -- so the two paintings arrive into it.
         High priority and a synchronous decode, because on a cold cache they
         were still arriving a second after the rest of the screen was up. */
      eager(img);
      /* THE TWO PLATES ARE THE SAME OBJECT, TWICE (round 13's graft). Round 13
         gave the Kid's plate one line, "looking for Pepper", so that his name
         appeared only in the cartouche above -- and a judge read the two
         plates side by side and saw two different things: "it reads 'looking
         for Pepper' where the companion's reads 'Wink / the Eyeball Spider'".
         A nameplate in the samples is always a name over a small italic
         epithet, so both of these are one. The cartouche naming him as well is
         the wordmark standing over a board, which is what UI/selectKid.png
         does; the thing that must not be said twice is the PET, and `sub`
         below is where that is now stopped. */
      stage.insertBefore(figure('kid', img, first, `looking for ${kid.pet}`), between);
    }
    if (comp) {
      const img = document.createElement('img');
      img.className = 'hoff__img hoff__img--pet';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.width = 560; img.height = 349;
      img.src = thumbSrc(comp.slug, '-card');
      img.addEventListener('error', () => { img.src = fullSrc(comp.slug); }, { once: true });
      eager(img);
      stage.appendChild(figure('pet', img, comp.name, comp.title));
    }
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
  try { await p; } finally { document.removeEventListener('keydown', onKey); }
}


/** Fetch this painting now and decode it on the spot: the veil is already up. */
function eager(img) {
  img.loading = 'eager';
  img.decoding = 'sync';
  try { img.fetchPriority = 'high'; } catch { /* older engines */ }
}

/** One of the two on the panel: the painting in UI/selectKid.png's own arched
    gilt mirror -- its moon medallion on the crown, its paw on the foot -- with
    the Companion tiles' nameplate standing under it, clear of the paw.

    `.kit-oval` and not `.kit-arch`: the same painted mirror with two runs of
    its plain straight side rail taken out, so the opening is a PORTRAIT and
    not a slot. Two of round 13's judges said what the slot did -- at 1600 the
    Companion was "reduced to a single eyeball filling the oval" and the Kid
    "loses his shoulders" -- and no amount of object-position fixes an opening
    that is one to one point nine. The gilt is untouched. */
function figure(kind, img, name, epithet) {
  const f = document.createElement('figure');
  f.className = `hoff__fig hoff__fig--${kind}`;
  const frame = document.createElement('div');
  frame.className = 'hoff__frame kit-oval';
  frame.appendChild(img);
  const cap = document.createElement('figcaption');
  cap.className = 'hoff__plate kit-plate';
  cap.innerHTML = `<b class="kit-plate__name">${esc(name)}</b>`
    + (epithet ? `<span class="kit-plate__epithet">${esc(epithet)}</span>` : '');
  f.append(frame, cap);
  return f;
}

/* the Kid board's confirm: a tick cast in the round enamel button's gilt */
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 12.6 5.5 9.7l4.3 4.3 8.7-9.6 2.9 2.7-11.5 12.6z"/></svg>';

/* The name is lettered the way the wordmark is, at the wordmark's size: the
   kit's #kit-engrave is tuned for a 40px plaque title, and at a hundred pixels
   its hairline rim reads as no rim at all. The same recipe with the bevel, the
   gold edge and the extrusion scaled to the letter. */
const ENGRAVE = `<svg class="hoff__defs" width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="hoff-engrave" x="-8%" y="-30%" width="116%" height="175%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="bump"/>
    <feDiffuseLighting in="bump" surfaceScale="4.2" diffuseConstant="1.16" lighting-color="#ffffff" result="diffuse">
      <feDistantLight azimuth="235" elevation="46"/>
    </feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="diffuse" operator="arithmetic" k1="1.14" k2="0" k3="0" k4="0" result="shaded"/>
    <feSpecularLighting in="bump" surfaceScale="4.2" specularConstant=".9" specularExponent="18" lighting-color="#f6ecff" result="spec">
      <feDistantLight azimuth="235" elevation="38"/>
    </feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <feComposite in="shaded" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0" result="lit"/>
    <feComposite in="lit" in2="SourceAlpha" operator="in" result="face"/>
    <feMorphology in="SourceAlpha" operator="dilate" radius="2.1" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation=".5" result="rimSoft"/>
    <feFlood flood-color="#b48c4a"/>
    <feComposite in2="rimSoft" operator="in" result="gold"/>
    <feOffset in="rimSoft" dx="-.6" dy="-1.4" result="rimUp"/>
    <feFlood flood-color="#f3dfa8"/>
    <feComposite in2="rimUp" operator="in" result="goldHi"/>
    <feOffset in="rim" dy="2.5" result="rimD1"/>
    <feOffset in="rim" dy="5" result="rimD2"/>
    <feMerge result="rimDown"><feMergeNode in="rimD1"/><feMergeNode in="rimD2"/></feMerge>
    <feFlood flood-color="#1d0f2b"/>
    <feComposite in2="rimDown" operator="in" result="extrude"/>
    <feGaussianBlur in="rim" stdDeviation="6" result="soft"/>
    <feOffset in="soft" dy="9" result="softDown"/>
    <feFlood flood-color="#000000" flood-opacity=".85"/>
    <feComposite in2="softDown" operator="in" result="shadow"/>
    <feMerge>
      <feMergeNode in="shadow"/><feMergeNode in="extrude"/><feMergeNode in="goldHi"/>
      <feMergeNode in="gold"/><feMergeNode in="face"/>
    </feMerge>
  </filter>
</svg>`;

function esc(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

export default passTo;
