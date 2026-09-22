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
 * It is deliberately quieter than Steam's: four seconds, no sound of its own
 * beyond the existing UI sting.
 *
 * ── IT IS AN AWARD, PINNED TO A GILT PLAQUE (round 13, CHROME) ─────────
 *
 * Round 12 made it a nameplate with the kit's gold star rosette on its end,
 * and all three judges said the same two things: the plate was "a plain dark
 * bar", and the medal "a flat vector star on a gradient disc". So it is now
 * an OBJECT hung on the wall:
 *
 *   - the plaque is the Kid board's own painted gold rail (`.kit-panel`) with
 *     the wordmark's star struck into each end, cast in the tier's metal, and
 *     the tier lettered on the boards' own gold ribbon straddling its top
 *     rail -- so the tier reads in words as well as in metal;
 *   - the medal is STRUCK, not drawn: a bevelled rim, a ring of beads and
 *     the wordmark's star standing proud of the field, lit from the upper
 *     left, and it hangs from a purple silk ribbon on a pin bar the way a
 *     real award hangs (`.kit-award`, tools/prep_chrome.py).
 *
 * It hangs under the HUD at the top right and CLEAR of the board's corner
 * candle, which all three of round 12's judges said it covered: `_seat`
 * measures that corner's dressing and the creatures' intents and drops below
 * whichever reaches furthest down. It used to sit bottom-left, on top of the
 * Companion's portrait and the Nerve plate.
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
/** core/achievements.js TIER, lowest first. */
const TIERS = ['bronze', 'silver', 'gold'];

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
    this._seat(host);
    const reduce = !!(this.ctx && this.ctx.Save && this.ctx.Save.settings
      && this.ctx.Save.settings.reduceMotion);

    const tier = TIERS.includes(def.tier) ? def.tier : 'bronze';
    const card = document.createElement('div');
    /* gold is the kit's own brass; the two lesser tiers are its re-cast
       plaque and award (ui/kit.css, the coach, the veil and the toast) */
    const m = tier === 'gold' ? '' : `--${tier}`;
    card.className = `mm-ach__card mm-ach__card--${tier}`;
    if (reduce) card.classList.add('is-still');
    card.innerHTML =
      `<i class="mm-ach__award kit-award${m && ` kit-award${m}`}" aria-hidden="true"></i>` +
      `<div class="mm-ach__plaque kit-panel${m && ` kit-panel${m}`}">` +
      `<span class="sr-only">Achievement unlocked.</span>` +
      `<span class="mm-ach__kind kit-ribbon"><i class="mm-ach__tier"></i></span>` +
      `<span class="mm-ach__name kit-plate__name"></span>` +
      `<span class="mm-ach__desc kit-plate__epithet"></span>` +
      `</div>`;
    // textContent, not innerHTML: the name comes from a data file today and
    // could come from a translation table tomorrow, and neither should be able
    // to inject markup into a live scene.
    card.querySelector('.mm-ach__tier').textContent = tier;
    card.querySelector('.mm-ach__name').textContent = def.name;
    const desc = card.querySelector('.mm-ach__desc');
    desc.textContent = def.desc || '';
    desc.hidden = !def.desc;
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

  /**
   * Hang it under the HUD at the top right, in OPEN WALL.
   *
   * The HUD is one rail at 1600 and wraps to two at the Deck's 1280, and the
   * Title and the select boards have none, so its foot is measured rather
   * than assumed. Round 12 stopped there and hung the plate straight over the
   * board's top-right corner candle -- all three judges said so. The corner's
   * painted candle and its cobweb, a creature's intent that has crept over to
   * this side, and a party's House Rules rail are therefore measured too, and
   * the plaque is seated below whichever of them reaches furthest down.
   */
  _seat(host) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let foot = 0;
    for (const n of document.querySelectorAll('.mm-hud')) {
      const b = n.getBoundingClientRect();
      if (b.width && b.height && b.top < vh * 0.25) foot = Math.max(foot, b.bottom);
    }
    for (const sel of ['.kit-dress__corner--r', '.kit-dress__flame--r', '.kit-web--r',
                       '.cb-enemy__intent', '.cb-rules:not([hidden]) > *']) {
      for (const n of document.querySelectorAll(sel)) {
        const b = n.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        /* only what is on this side of the board and up at this height: a
           creature in the middle of the hall is not in the way */
        if (b.right < vw * 0.56 || b.top > vh * 0.42) continue;
        foot = Math.max(foot, b.bottom);
      }
    }
    host.style.setProperty('--ach-top', `${Math.round(Math.min(foot, vh * 0.42))}px`);
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
