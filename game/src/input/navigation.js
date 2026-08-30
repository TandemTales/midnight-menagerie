/**
 * What a controller action MEANS, per screen.  OWNER: platform.
 *
 *   new Navigator(ctx).start();     // once, from main.js
 *
 * ── THE STRATEGY, AND WHY IT IS NOT ELEVEN BESPOKE BINDINGS ────────────────
 *
 * This game is already keyboard-complete. `ui/hand.js` has arrow selection, Tab
 * target-cycling and a confirm; every panel is real focusable DOM with roving
 * focus and modal focus traps; `scenes/combat.js` binds E, Q, W, R, T and
 * Escape. Writing a second, parallel input model for the pad would mean two
 * implementations of "play the selected card" that drift, and the pad's copy
 * would be the one nobody plays with day to day.
 *
 * So there are exactly two mechanisms here and both reuse what exists:
 *
 *   SPATIAL FOCUS   for menus. Real DOM focus moved geometrically, then a click
 *                   on confirm. Every screen gets controller support the moment
 *                   its buttons are focusable, which they already are because
 *                   the keyboard needed that first.
 *
 *   KEY FORWARDING  for screens with a bespoke keyboard model — combat. The pad
 *                   dispatches the keydown the scene already handles, so
 *                   `hand.js` stays the single implementation of aiming and
 *                   there is no second code path to keep correct.
 *
 * Forwarding synthetic keys is the kind of thing that deserves suspicion, so:
 * the events are dispatched on `window`, which is where `hand.js` and
 * `combat.js` both listen, they carry `key` and `code`, and nothing anywhere
 * inspects `isTrusted`. The alternative — exporting a public method per
 * gesture from `hand.js` — means widening a module this agent does not own to
 * expose internals that are currently private for good reasons.
 */

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '.mm-deck__cell',           // roving-focus grid cells, tabindex -1 by design
  '.cb-choice',               // the combat chooser
].join(',');

/** Keyboard events the pad sends, per action, for scenes with their own model. */
const COMBAT_KEYS = {
  left: { key: 'ArrowLeft', code: 'ArrowLeft' },
  right: { key: 'ArrowRight', code: 'ArrowRight' },
  confirm: { key: 'ArrowUp', code: 'ArrowUp' },
  cancel: { key: 'Escape', code: 'Escape' },
  next: { key: 'Tab', code: 'Tab' },
  prev: { key: 'Tab', code: 'Tab', shiftKey: true },
  alt: { key: 'e', code: 'KeyE' },
  menu: { key: 'd', code: 'KeyD' },
  'page-prev': { key: 'q', code: 'KeyQ' },
  'page-next': { key: 'w', code: 'KeyW' },
  start: { key: 'Escape', code: 'Escape' },
  select: { key: 'r', code: 'KeyR' },
};

function visible(el) {
  if (!el || !el.isConnected) return false;
  if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
}

/** Centre of an element, in viewport space. */
function centre(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}

export class Navigator {
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.bus = ctx.bus || null;
    this._offs = [];
    this.enabled = true;
    /** Scenes that own their own keyboard model and get forwarded keys. */
    this.keyScenes = new Set(['combat']);
  }

  start() {
    if (!this.bus) return this;
    this._offs.push(this.bus.on('pad:action', (p) => this.handle(p)));
    // A pad waking up mid-scene has nothing focused, so the first direction
    // would go nowhere. Put focus somewhere sensible the moment it appears.
    this._offs.push(this.bus.on('pad:active', () => this._ensureFocusSoon()));
    this._offs.push(this.bus.on('scene:entered', () => {
      if (this.ctx.gamepad && this.ctx.gamepad.active) this._ensureFocusSoon();
    }));
    return this;
  }

  stop() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    if (this._soonT) { clearTimeout(this._soonT); this._soonT = 0; }
    return this;
  }

  /**
   * Focus something, once there is something to focus.
   *
   * Scenes fade in. The title's buttons spend the first second of their
   * entrance at opacity 0, which `visible()` correctly refuses to focus — and a
   * single attempt on `scene:entered` therefore found nothing and gave up, so a
   * player who pressed down during the fade got silence and had to press again.
   * On a handheld that reads as a dropped input, which is the specific thing
   * Deck players complain about.
   *
   * Retries on a frame cadence for a bounded window, and stops the moment it
   * succeeds or the player takes over with a mouse.
   */
  _ensureFocusSoon(tries = 24) {
    if (this._soonT) { clearTimeout(this._soonT); this._soonT = 0; }
    const attempt = (left) => {
      this._soonT = 0;
      const active = document.activeElement;
      if (active && active !== document.body && visible(active)) return;   // someone else got there
      if (this.candidates().length || this.keyScenes.has(this.sceneName)) { this._ensureFocus(); return; }
      if (left > 0) this._soonT = setTimeout(() => attempt(left - 1), 50);
    };
    attempt(tries);
  }

  get sceneName() { return this.ctx.scenes ? this.ctx.scenes.currentName : null; }

  /** The container navigation is confined to: the top modal, else the scene. */
  get root() {
    const modal = [...document.querySelectorAll('.mm-modal')].filter(visible).pop();
    if (modal) return modal;
    const chooser = document.querySelector('.cb-chooser:not([hidden])');
    if (chooser && visible(chooser)) return chooser;
    return (this.ctx.scenes && this.ctx.scenes.current && this.ctx.scenes.current.root)
      || document.getElementById('dom-layer') || document.body;
  }

  handle({ action }) {
    if (!this.enabled) return;
    // A modal always wins, whatever scene is behind it — a pile viewer over a
    // Scuffle is a menu, and forwarding ArrowLeft to the hand underneath it
    // would move a selection the player cannot see.
    const inModal = this.root !== ((this.ctx.scenes && this.ctx.scenes.current && this.ctx.scenes.current.root) || null);
    if (!inModal && this.keyScenes.has(this.sceneName)) return this._forwardKey(action);
    return this._navigate(action);
  }

  _forwardKey(action) {
    const spec = COMBAT_KEYS[action];
    if (!spec) return;
    const ev = new KeyboardEvent('keydown', {
      key: spec.key, code: spec.code,
      shiftKey: !!spec.shiftKey, bubbles: true, cancelable: true,
    });
    window.dispatchEvent(ev);
    // `hand.js` listens on window and reads `document.activeElement` to decide
    // whether the keyboard is "inside" the hand. A pad player never tabbed in,
    // so put them in.
    if (action === 'left' || action === 'right') this.ctx.scenes?.current?.focusHand?.();
  }

  /* ── spatial focus ─────────────────────────────────────────────────────── */

  candidates() {
    return [...this.root.querySelectorAll(FOCUSABLE)].filter(visible);
  }

  _ensureFocus() {
    const active = document.activeElement;
    if (active && active !== document.body && this.root.contains(active) && visible(active)) return;
    if (this.keyScenes.has(this.sceneName)) { this.ctx.scenes?.current?.focusHand?.(); return; }
    const first = this.candidates()[0];
    if (first) this._focus(first);
  }

  _navigate(action) {
    if (action === 'confirm') return this._activate();
    if (action === 'cancel' || action === 'start') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      return;
    }
    if (action === 'prev' || action === 'next') return this._cycle(action === 'next' ? 1 : -1);
    if (!['up', 'down', 'left', 'right'].includes(action)) return;

    /* A slider eats left and right. Without this the Settings panel is
     * unreachable on a Deck in the way that matters: a player can FOCUS the
     * music volume and can never change it, because left and right are busy
     * moving focus to the next control. Volume, animation speed, screen shake
     * and flashes are all ranges, which is half the panel. */
    const focused = document.activeElement;
    if (focused && focused.type === 'range' && (action === 'left' || action === 'right')) {
      return this._nudgeRange(focused, action === 'right' ? 1 : -1);
    }

    const list = this.candidates();
    if (!list.length) return;
    const active = document.activeElement;
    if (!active || !list.includes(active)) { this._focus(list[0]); return; }

    const best = this._bestInDirection(active, list, action);
    if (best) this._focus(best);
  }

  /**
   * Focus, and bring it into view if the scene scrolls.
   *
   * `preventScroll: true` everywhere else in this file is deliberate — focusing
   * a card in the hand must not jerk the board. But short viewports let four
   * scenes scroll (see the media query in `ui/base.css`), and on those a pad
   * player would otherwise walk the focus ring off the bottom of the panel and
   * lose track of where they were. `block: 'nearest'` scrolls the minimum
   * distance, so a control already on screen does not move at all.
   */
  _focus(el) {
    el.focus({ preventScroll: true });
    const sc = el.closest('.scene');
    if (sc && sc.scrollHeight > sc.clientHeight + 2) {
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* older engines */ }
    }
  }

  /**
   * The nearest element in a direction.
   *
   * Scored, not sorted by raw distance: a button directly below at 300px is a
   * better "down" than one 40px below and 600px to the left, and raw distance
   * picks the second. The perpendicular offset is weighted three times the
   * along-axis distance, which is the ratio that makes a grid behave like a grid
   * and a toolbar behave like a toolbar without either needing to declare which
   * it is.
   */
  _bestInDirection(from, list, dir) {
    const a = centre(from);
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const b = centre(el);
      const dx = b.x - a.x, dy = b.y - a.y;
      let along, across;
      if (dir === 'left') { along = -dx; across = Math.abs(dy); }
      else if (dir === 'right') { along = dx; across = Math.abs(dy); }
      else if (dir === 'up') { along = -dy; across = Math.abs(dx); }
      else { along = dy; across = Math.abs(dx); }
      if (along <= 2) continue;                     // behind us, or level
      const score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  /**
   * Move a slider by one step and tell the page, the way the browser's own
   * arrow-key handling would. `input` then `change`, in that order and both of
   * them, because `ui/settings.js` listens on `input` for the live preview and
   * the panel's own persistence runs off the same handler — firing only
   * `change` would move the thumb and save nothing.
   */
  _nudgeRange(el, dir) {
    const step = Number(el.step) || 1;
    const min = el.min === '' ? 0 : Number(el.min);
    const max = el.max === '' ? 100 : Number(el.max);
    const now = Number(el.value);
    const next = Math.min(max, Math.max(min, now + step * dir));
    if (next === now) return;
    el.value = String(next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Shoulders walk the list in DOM order, which is reading order. */
  _cycle(step) {
    const list = this.candidates();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = list[(i < 0 ? 0 : i + step + list.length) % list.length];
    if (next) this._focus(next);
  }

  /**
   * Text entry on a machine with no keyboard.
   *
   * The Treehouse asks for a room code. A player HOSTING can press the dice
   * button and never type anything, but a player JOINING has been given a code
   * by a friend and has to enter it — and on a Deck in gamepad mode there is
   * nothing to enter it with. Valve's own requirement is that the game invoke
   * the Steam on-screen keyboard for text fields, which is what this does.
   *
   * `showKeyboard` resolves null when there is no bridge (a browser tab, a
   * desktop build with no Steam). The fallback is to focus the field and let the
   * player type, which is correct everywhere that has a keyboard — and a Deck
   * always has the bridge, because a Deck runs the Steam build. Deliberately NOT
   * building a second in-game key grid: it would be a worse keyboard than the
   * one the platform already provides, on the one platform that provides it.
   */
  async _textEntry(el) {
    const { Platform } = await import('../platform/index.js');
    const typed = await Platform.steam.showKeyboard({
      text: el.value || '',
      max: el.maxLength > 0 ? el.maxLength : 64,
      description: el.getAttribute('aria-label') || el.placeholder || 'Enter text',
    });
    if (typeof typed !== 'string') { el.focus({ preventScroll: true }); return; }
    el.value = typed;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _activate() {
    const el = document.activeElement;
    if (!el || el === document.body) { this._ensureFocus(); return; }
    if (el.tagName === 'INPUT' && ['text', 'search', 'email', 'url'].includes(el.type)) {
      this._textEntry(el);
      return;
    }
    // A select needs a real menu, not a click: clicking it on a pad opens a
    // native dropdown the pad cannot then drive. Step the value instead.
    if (el.tagName === 'SELECT') {
      el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (el.type === 'range') {
      // Same reasoning: confirm on a slider is meaningless, so left/right
      // already move it via the browser's own key handling. Do nothing.
      return;
    }
    el.click();
  }
}

export default Navigator;
