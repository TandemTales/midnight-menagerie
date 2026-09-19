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
 * ── IT IS A NAMEPLATE CAST IN THE TIER'S METAL (round 12, CHROME) ──────────
 *
 * The kit's own plate (`.kit-plate`: the Companion tiles' nameplate, the name
 * over a small italic epithet — here the achievement over what it was for),
 * with a struck medal seated on its end the way the boards seat a medallion
 * on a button. Plate rim and medal are cast in the tier's metal — bronze,
 * silver or gold, re-cast from the kit's own gilt by tools/prep_chrome.py —
 * and the tier is lettered on it too, so it reads at a glance and never by
 * colour alone.
 *
 * It hangs from the foot of the HUD at the top right, over the board's corner
 * candle, which is dressing on every board and in every fight. It used to sit
 * bottom-left, on top of the Companion's portrait and the Nerve.
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
    /* gold is the kit's own brass; the two lesser tiers are its re-cast plate
       and medal (ui/kit.css, the coach, the veil and the toast) */
    const metal = tier === 'gold' ? '' : ` kit-plate--${tier}`;
    card.className = `mm-ach__card mm-ach__card--${tier} kit-plate${metal}`;
    if (reduce) card.classList.add('is-still');
    card.innerHTML =
      `<i class="mm-ach__sigil kit-medal${tier === 'gold' ? '' : ` kit-medal--${tier}`}" aria-hidden="true"></i>` +
      `<div class="mm-ach__body">` +
      `<span class="mm-ach__kind"><i class="mm-ach__tier"></i> <b class="mm-ach__lbl">Achievement</b></span>` +
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
   * Hang it from the HUD's foot. The HUD is one rail at 1600 and wraps to two
   * at the Deck's 1280, and the Title and the select boards have none, so the
   * foot is measured each time rather than assumed.
   */
  _seat(host) {
    let foot = 0;
    for (const n of document.querySelectorAll('.mm-hud')) {
      const b = n.getBoundingClientRect();
      if (b.width && b.height && b.top < window.innerHeight * 0.25) foot = Math.max(foot, b.bottom);
    }
    host.style.setProperty('--ach-top', `${Math.round(foot)}px`);
    /* A party's fight docks its House Rules under the HUD at the top right,
       where this hangs, and a rule is what decides the fight: so the plate
       hangs beside that rail, never over it. */
    let clear = 0;
    for (const n of document.querySelectorAll('.cb-rules:not([hidden]) > *')) {
      const b = n.getBoundingClientRect();
      if (b.width && b.height && b.left > window.innerWidth / 2 && b.top < foot + 160) {
        clear = Math.max(clear, window.innerWidth - b.left);
      }
    }
    host.style.setProperty('--ach-clear', `${Math.round(clear)}px`);
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
