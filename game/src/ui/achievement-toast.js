/**
 * The thing a player actually sees when an achievement pops.  OWNER: platform.
 *
 *   new AchievementToast(ctx);      // once, from main.js. Wires itself to the bus.
 *
 * ── WHY THE GAME DRAWS ITS OWN ─────────────────────────────────────────────
 *
 * Steam shows a notification of its own, so drawing a second one looks like
 * duplication until you list the cases where Steam's does not appear: the
 * browser build, the desktop build with no Steam client, a player who turned
 * Steam notifications off, Big Picture with the overlay disabled, and — the one
 * that matters most — every achievement that is content-gated and therefore not
 * registered with Steam at all. In all of those the player earns something and
 * is told nothing.
 *
 * So this is the primary notification and Steam's is the incidental duplicate.
 * It is deliberately quieter than Steam's: one line, bottom-left, four seconds,
 * no sound of its own beyond the existing UI sting.
 *
 * ── IT OBEYS THE ACCESSIBILITY SETTINGS ────────────────────────────────────
 *
 * Reduced motion removes the slide and shortens nothing else — a player who
 * asked for less movement still wants to READ it, so the dwell is untouched.
 * Large text is inherited from the `.mm-large-text` root class the same way
 * every other panel gets it. `aria-live="polite"` rather than `assertive`:
 * earning something is good news and must not interrupt a screen reader
 * mid-sentence during a fight.
 */

const CSS = new URL('./achievement-toast.css', import.meta.url).href;
const DWELL = 4.2;
const MAX_QUEUED = 4;

function ensureCss() {
  if (document.querySelector(`link[href="${CSS}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = CSS;
  document.head.appendChild(l);
}

export class AchievementToast {
  constructor(ctx) {
    this.ctx = ctx;
    this.host = null;
    this.queue = [];
    this.showing = false;
    this._offs = [];
    ensureCss();
    if (ctx && ctx.bus) {
      this._offs.push(ctx.bus.on('achievement:unlocked', (p) => this.push(p.def)));
    }
  }

  _ensureHost() {
    if (this.host && this.host.isConnected) return this.host;
    const parent = (this.ctx && this.ctx.tipLayer) || document.body;
    const el = document.createElement('div');
    el.className = 'mm-ach';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    parent.appendChild(el);
    this.host = el;
    return el;
  }

  /**
   * Queue one. Several can land at once — finishing a run unlocks the win, the
   * Haunt tier and a counter in the same tick — so they are shown in sequence
   * rather than on top of each other, and the queue is capped so a save import
   * cannot start a two-minute parade.
   */
  push(def) {
    if (!def) return;
    if (this.queue.length >= MAX_QUEUED) return;
    this.queue.push(def);
    if (!this.showing) this._next();
  }

  async _next() {
    const def = this.queue.shift();
    if (!def) { this.showing = false; return; }
    this.showing = true;

    const host = this._ensureHost();
    const reduce = !!(this.ctx && this.ctx.Save && this.ctx.Save.settings
      && this.ctx.Save.settings.reduceMotion);

    const card = document.createElement('div');
    card.className = `mm-ach__card mm-ach__card--${def.tier || 'bronze'}`;
    if (reduce) card.classList.add('is-still');
    card.innerHTML =
      `<i class="mm-ach__sigil" aria-hidden="true"></i>` +
      `<div class="mm-ach__body">` +
      `<b class="mm-ach__lbl">Achievement</b>` +
      `<span class="mm-ach__name"></span>` +
      `</div>`;
    // textContent, not innerHTML: the name comes from a data file today and
    // could come from a translation table tomorrow, and neither should be able
    // to inject markup into a live scene.
    card.querySelector('.mm-ach__name').textContent = def.name;
    host.appendChild(card);

    this.ctx?.audio?.play?.('ui:confirm');

    // Two frames before the class, so the browser has a layout to animate FROM.
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-in')));

    const wait = (s) => (this.ctx && this.ctx.clock
      ? this.ctx.clock.wait(s)
      : new Promise((r) => setTimeout(r, s * 1000)));

    await wait(DWELL);
    card.classList.remove('is-in');
    card.classList.add('is-out');
    await wait(reduce ? 0.01 : 0.34);
    card.remove();
    this._next();
  }

  destroy() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this.queue.length = 0;
    this.host?.remove();
    this.host = null;
  }
}

export default AchievementToast;
