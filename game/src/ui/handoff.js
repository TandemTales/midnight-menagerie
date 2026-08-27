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
import { COMPANIONS } from '../data/schema.js';

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

/**
 * Cover the screen and wait for the next player.
 *
 * @param {{name:string, companion?:string, line?:string, sub?:string}} o
 * @returns {Promise<void>}
 */
export async function passTo(o = {}) {
  await ensureCss();
  const name = o.name || 'the other Kid';
  const first = String(name).split(' ')[0];
  const comp = COMPANIONS.find(c => c.slug === o.companion);

  const m = new Modal({
    size: 'full',
    dismissible: false,
    className: 'mm-handoff',
    labelledBy: 'mm-handoff-title',
  });

  const wrap = document.createElement('div');
  wrap.className = 'hoff';
  wrap.innerHTML =
    `<p class="hoff__k">Pass it over</p>`
    + `<h2 class="hoff__name" id="mm-handoff-title">${esc(first)}</h2>`
    + (comp ? `<p class="hoff__comp">with ${esc(comp.name)}</p>` : '')
    + `<p class="hoff__line">${esc(o.line || 'Your turn.')}</p>`
    + (o.sub ? `<p class="hoff__sub">${esc(o.sub)}</p>` : '')
    + `<button type="button" class="hoff__go">I'm ready<span class="hoff__key">Enter</span></button>`;

  m.body.appendChild(wrap);
  const go = wrap.querySelector('.hoff__go');
  go.addEventListener('click', () => m.close());

  // Enter and Space, because this is the one screen where a player is looking
  // away from the mouse while they hand the machine across.
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.close(); }
  };
  document.addEventListener('keydown', onKey);

  const p = m.open();
  requestAnimationFrame(() => go.focus());
  try { await p; } finally { document.removeEventListener('keydown', onKey); }
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

export default passTo;
