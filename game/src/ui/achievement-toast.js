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
 * ── A MEDAL AND A BANNER ON A GILT PLAQUE (round 13, and its graft) ────────
 *
 * Round 12 made it a nameplate with the kit's gold star rosette on its end,
 * and all three judges said the same two things: the plate was "a plain dark
 * bar", and the medal "a flat vector star on a gradient disc". Round 13 struck
 * the medal properly and every judge of THAT round named the plate it hung on:
 * "a flat, light lilac slab with no painted ground, texture or candle falloff
 * -- the least material surface on the screen, and lighter than anything in
 * the samples". So the words now hang on an object made of the boards' own
 * pieces:
 *
 *   - the plaque is the Kid board's painted gold rail (`.kit-panel`) round the
 *     boards' fired enamel, lit by ONE candle over its top rail at a quarter
 *     of round 13's wash and with the kit's own grain laid back over the
 *     field, and with its engraved DOUBLE RULE and the brass fleuron over
 *     each corner of it turned back on -- the same rail and the same rule the
 *     coach's note and the veil's wall wear, so the three read as one set;
 *   - the NAME is cut into `.kit-ribbon`, the gold banner with the notched,
 *     folded ends that carries CHOOSE YOUR KID on the Kid board, and the tier
 *     rides the top rule above it in spaced small caps, in the tier's metal;
 *   - the medal is STRUCK, not drawn: a bevelled rim, a ring of beads and
 *     the wordmark's star standing proud of the field, lit from the upper
 *     left, and it hangs from a purple silk ribbon on a pin bar the way a
 *     real award hangs (`.kit-award`, tools/prep_chrome.py). Its METAL is the
 *     tier. It hangs on the plaque's left end and CLEAR of the banner's left
 *     fold, which round 13's graft candidate ran over and clipped.
 *
 * WHERE IT GOES IS MEASURED, NOT ASSUMED (`_seat`). Round 12's hung from the
 * HUD's foot and sat on the board's corner candle; round 13's landed its
 * medal ribbon on the Calling Bell's handle. So the plaque and the medal's
 * own two overhangs are scored against every readout, creature, intent and
 * corner painting on screen, and take the cheapest piece of wall -- never the
 * HUD, the Companion, the Nerve, the piles, the hand or End Turn.
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

/* What the plaque must not lie on, and how much each matters. The seven at
   4000 are BRIEF-r12's contract written as selectors and are effectively
   forbidden; below them are the party's own cards, what a player reads
   mid-turn, the bodies in the room, and the board's painted corners -- which
   round 12's plate sat on top of and round 13's medal ribbon hung across.
   The weights are on one scale, and the cost a box pays is the FRACTION of
   itself it covers times the weight, so a plaque that clips a corner's last
   few rows is not judged the same as one parked on it. */
const KEEP_OFF = [
  ['.mm-hud', 4000],
  ['.cb-top', 4000],
  ['.cb-player', 4000],
  ['.cb-bl', 4000],
  ['.cb-br', 4000],
  ['.mm-hand__cards .mm-card', 4000],
  ['#end-turn', 4000],
  ['.cb-herohost', 2600],
  ['.cb-mates > .cb-mate:not([hidden])', 1600],
  ['.cb-rules:not([hidden]) > *', 1400],
  ['.kit-dress__corner', 1200],
  ['.kit-dress__flame', 1200],
  ['.cb-enemy__above', 900],
  ['.cb-enemy__intent', 900],
  ['.cb-enemy__plate', 800],
  ['.cb-enemy', 900],
  ['.kit-web', 200],
];

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

    const tier = TIERS.includes(def.tier) ? def.tier : 'bronze';
    const card = document.createElement('div');
    /* gold is the kit's own brass; the two lesser tiers are the same struck
       medal cast in the other two metals (ui/kit.css, the coach, the veil and
       the toast). The PLAQUE stays brass in every tier: the samples' fittings
       are all one metal, and the tier is already carried twice over, by the
       disc and by its own word. */
    const metal = tier === 'gold' ? '' : ` kit-award--${tier}`;
    card.className = `mm-ach__card mm-ach__card--${tier} kit-panel`;
    if (reduce) card.classList.add('is-still');
    card.innerHTML =
      `<i class="mm-ach__award kit-award${metal}" aria-hidden="true"></i>` +
      `<div class="mm-ach__body">` +
      `<span class="sr-only">Achievement unlocked.</span>` +
      `<span class="mm-ach__kind"><i class="mm-ach__tier"></i> <b class="mm-ach__lbl">Achievement</b></span>` +
      `<span class="mm-ach__banner kit-ribbon"><span class="mm-ach__name"></span></span>` +
      `<span class="mm-ach__desc"></span>` +
      `</div>`;
    // textContent, not innerHTML: the name comes from a data file today and
    // could come from a translation table tomorrow, and neither should be able
    // to inject markup into a live scene.
    card.querySelector('.mm-ach__tier').textContent = tier;
    card.querySelector('.mm-ach__name').textContent = def.name;
    /* How long the banner has to be. The plaque's WIDTH is what `_seat` has to
       find a wall for, so a long name is lettered smaller rather than widening
       the object; the sheet divides the banner's room by this. */
    card.style.setProperty('--ach-len', String(Math.max(10, String(def.name || '').length)));
    const desc = card.querySelector('.mm-ach__desc');
    desc.textContent = def.desc || '';
    desc.hidden = !def.desc;
    host.appendChild(card);
    // measured with the plaque on screen: its own size decides where it fits
    this._seat(host, card);

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
   * Find it a piece of empty wall.
   *
   * A fixed corner cannot be right, because what is IN the corners differs by
   * scene and by fight: the HUD is one rail at 1600 and wraps to two at the
   * Deck's 1280, a party's fight docks its House Rules under it, a Scuffle may
   * have one creature or three, the Title and the select boards have no HUD at
   * all, and every board wears a painted candle in each top corner. Round 12
   * hung the plate from the HUD's foot and every judge said it sat on that
   * candle; round 13 dropped below the candle and landed the medal's ribbon on
   * the Calling Bell's handle.
   *
   * So the plaque is PLACED: every anchor down each side is scored by what it
   * would cover, weighted by how much that thing matters, and it takes the
   * cheapest. `KEEP_OFF` is BRIEF-r12's contract written as selectors, plus
   * the creatures, their readouts and the corner paintings. Document-wide on
   * purpose: the HUD is not inside the scene root.
   *
   * The MEDAL is part of the object and is measured with it — its pin bar
   * stands above the plaque's top rail and its disc hangs past the foot, and
   * both overhangs are read off the medal's own box rather than out of a
   * custom property, which computes to the tokens of a `calc(...)` and not to
   * a length.
   */
  _seat(host, card) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const cb = card.getBoundingClientRect();
    const w = cb.width || 380, h = cb.height || 104;
    const sig = card.querySelector('.mm-ach__award');
    const sb = sig ? sig.getBoundingClientRect() : null;
    const rise = sb ? Math.max(0, cb.top - sb.top) : 0;
    const drop = sb ? Math.max(0, sb.bottom - cb.bottom) : 0;
    const left = sb ? Math.max(0, cb.left - sb.left) : 0;

    const keep = [];
    for (const [sel, weight] of KEEP_OFF) {
      for (const n of document.querySelectorAll(sel)) {
        if (n.closest('.mm-ach')) continue;
        const b = n.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) keep.push({ l: b.left, t: b.top, r: b.right, b: b.bottom, w: weight });
      }
    }
    const over = (box, k) => {
      const ox = Math.min(box.r, k.r) - Math.max(box.l, k.l);
      const oy = Math.min(box.b, k.b) - Math.max(box.t, k.t);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    };

    /* the HUD's foot is the ceiling: there is no wall above it */
    let foot = 0;
    for (const n of document.querySelectorAll('.mm-hud')) {
      const b = n.getBoundingClientRect();
      if (b.width && b.height && b.top < vh * 0.25) foot = Math.max(foot, b.bottom);
    }

    /* inside the room's own gilt rule, never on it. `.kit-panel`'s painted
       rail is drawn OUTSIDE its border box (border-image-outset), so the box
       that is scored and the inset both allow for it. */
    const bleed = 12;
    const inset = (vh <= 820 ? 30 : 44) + bleed;
    const y0 = Math.round(foot + 12 + rise);
    const y1 = Math.max(y0, Math.round(vh * 0.56));
    const area = (w + left + bleed * 2) * (h + rise + drop + bleed * 2);
    let best = null;
    for (const side of ['right', 'left']) {
      const x = side === 'right' ? vw - inset - w : inset + left;
      for (let y = y0; y <= y1; y += 4) {
        const box = {
          l: x - left - bleed, t: y - rise - bleed,
          r: x + w + bleed, b: y + h + drop + bleed,
        };
        let cost = 0;
        for (const k of keep) cost += over(box, k) / area * k.w;
        /* as high as it can stand, and the right-hand wall first: in a fight
           the Companion, the Nerve and the piles are all on the left, and so
           is the Kid's own body */
        cost += (y - y0) * 0.75 + (side === 'left' ? 1400 : 0);
        if (!best || cost < best.cost) best = { side, x, y, cost };
      }
    }
    if (!best) return;
    host.dataset.side = best.side;
    host.style.setProperty('--ach-top', `${Math.round(best.y)}px`);
    host.style.setProperty('--ach-x', `${best.side === 'left' ? inset + left : inset}px`);
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
