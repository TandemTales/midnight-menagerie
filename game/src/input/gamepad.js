/**
 * Gamepad.  OWNER: platform.
 *
 *   const pad = new Gamepad(ctx);   // polls itself off the clock
 *   ctx.bus.on('pad:action', ({ action, repeat }) => …);
 *
 * ── WHY A GAME THAT IS ALREADY KEYBOARD-PLAYABLE STILL NEEDS THIS ──────────
 *
 * A Steam Deck has no keyboard. It has a gamepad and two trackpads, and Valve's
 * Deck Verified bar starts at "the game is fully playable with the controller".
 * The mouse half is covered — the trackpads emulate one — but a player is not
 * going to fight the Butler by dragging a virtual cursor across a fan of cards.
 *
 * ── WHAT THIS FILE IS AND IS NOT ───────────────────────────────────────────
 *
 * It reads pads and emits ACTIONS. It knows nothing about cards, scenes or
 * focus. `input/navigation.js` decides what an action means where — because the
 * same stick flick is "next card" in a Scuffle and "next button" on the title,
 * and putting that decision here would drag the whole UI into a polling loop.
 *
 * ── STEAM INPUT ────────────────────────────────────────────────────────────
 *
 * On Steam, the client can present ANY controller to the game as a virtual
 * Xbox pad, which is why this reads the plain W3C Gamepad API rather than
 * anything Steam-specific: a DualSense, a Switch Pro controller and the Deck's
 * own inputs all arrive here already normalised, and the same code works in a
 * browser with no Steam at all. The one thing Steam adds that this cannot see
 * is a player's custom binding, and that is handled where it should be — in the
 * client, against the default layout an App ID lets us publish.
 */

/** The semantic vocabulary. Everything downstream speaks only these. */
export const ACTIONS = [
  'up', 'down', 'left', 'right',
  'confirm', 'cancel', 'alt', 'menu',
  'prev', 'next',            // shoulders — cycle targets / tabs
  'page-prev', 'page-next',  // triggers — jump between groups
  'start', 'select',
];

/**
 * Standard-mapping button indices.
 * https://w3c.github.io/gamepad/#remapping — the Deck, an Xbox pad and a
 * DualSense all report `mapping: 'standard'` and land on this layout.
 */
const BUTTON = {
  0: 'confirm',      // A / Cross
  1: 'cancel',       // B / Circle
  2: 'alt',          // X / Square
  3: 'menu',         // Y / Triangle
  4: 'prev',         // L1
  5: 'next',         // R1
  6: 'page-prev',    // L2
  7: 'page-next',    // R2
  8: 'select',       // View / Share
  9: 'start',        // Menu / Options
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

const AXIS_DEADZONE = 0.55;   // generous: a stick resting at 0.2 must not scroll a menu
const AXIS_RELEASE = 0.35;    // hysteresis, so a stick hovering at the edge does not chatter
const REPEAT_DELAY = 0.42;    // seconds before a held direction starts repeating
const REPEAT_RATE = 0.11;     // and how fast it repeats after that

/** Which glyph set to draw. Derived from the pad id, which is all we get. */
export function familyOf(id = '') {
  const s = String(id).toLowerCase();
  if (s.includes('steam deck') || s.includes('neptune')) return 'deck';
  if (s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation') || s.includes('054c')) return 'playstation';
  if (s.includes('nintendo') || s.includes('switch') || s.includes('057e')) return 'nintendo';
  return 'xbox';
}

export class Gamepad {
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.bus = ctx.bus || null;
    /** True once any pad has sent anything. Drives whether hints are drawn. */
    this.active = false;
    this.family = 'xbox';
    this.padId = null;
    this.enabled = true;

    /** action -> { down:boolean, t:number } */
    this._state = new Map();
    for (const a of ACTIONS) this._state.set(a, { down: false, t: 0 });
    this._off = null;
    this._onConnect = null;
    this._onDisconnect = null;
  }

  get available() {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  }

  start() {
    if (!this.available || this._off) return this;
    this._onConnect = (e) => {
      this.padId = e.gamepad && e.gamepad.id;
      this.family = familyOf(this.padId);
      this.bus?.emit('pad:connected', { id: this.padId, family: this.family });
    };
    this._onDisconnect = () => {
      if (!this._firstPad()) {
        this.active = false;
        this.bus?.emit('pad:disconnected', {});
      }
    };
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);

    // Polled off the clock, so it stops with the game: no pad input is read
    // while the Steam overlay is up, which is what stops a stick flick behind
    // the overlay from selecting a card the player cannot see.
    if (ctxHasClock(this.ctx)) this._off = this.ctx.clock.onFrame((dt) => this.poll(dt));
    return this;
  }

  stop() {
    if (this._off) { this._off(); this._off = null; }
    if (this._onConnect) window.removeEventListener('gamepadconnected', this._onConnect);
    if (this._onDisconnect) window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    this._onConnect = this._onDisconnect = null;
    return this;
  }

  _firstPad() {
    if (!this.available) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /**
   * One frame. Reads the first connected pad and turns it into action edges.
   *
   * Only the FIRST pad, deliberately. This is a co-op game, but co-op here is
   * one player per machine — `Run.localSeat` is a seat on a network session, not
   * a second controller in the same room. Reading pad 2 as a second player would
   * be a whole other feature, and reading it as MORE INPUT FOR PLAYER ONE is
   * worse: a controller left face-down on a sofa with a sticky stick would drive
   * the menu forever.
   */
  poll(dt = 0.016) {
    if (!this.enabled || !this.available) return;
    const pad = this._firstPad();
    if (!pad) return;

    if (this.padId !== pad.id) {
      this.padId = pad.id;
      this.family = familyOf(pad.id);
    }

    const now = Object.create(null);
    for (const a of ACTIONS) now[a] = false;

    const buttons = pad.buttons || [];
    for (const idx in BUTTON) {
      const b = buttons[idx];
      if (b && (b.pressed || b.value > 0.5)) now[BUTTON[idx]] = true;
    }

    // Left stick doubles as the d-pad. Hysteresis on the release edge: a stick
    // resting just under the press threshold would otherwise chatter an edge
    // every frame and scroll a menu at 60 items a second.
    const ax = (pad.axes && pad.axes[0]) || 0;
    const ay = (pad.axes && pad.axes[1]) || 0;
    now.left = now.left || this._axis('left', ax < 0 ? -ax : 0);
    now.right = now.right || this._axis('right', ax > 0 ? ax : 0);
    now.up = now.up || this._axis('up', ay < 0 ? -ay : 0);
    now.down = now.down || this._axis('down', ay > 0 ? ay : 0);

    for (const action of ACTIONS) {
      const s = this._state.get(action);
      const isDown = !!now[action];
      if (isDown && !s.down) {
        s.down = true; s.t = 0;
        this._fire(action, false);
      } else if (isDown && s.down) {
        // Repeat only the things it makes sense to hold.
        if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
          s.t += dt;
          const threshold = s.repeating ? REPEAT_RATE : REPEAT_DELAY;
          if (s.t >= threshold) { s.t = 0; s.repeating = true; this._fire(action, true); }
        }
      } else if (!isDown && s.down) {
        s.down = false; s.t = 0; s.repeating = false;
        this.bus?.emit('pad:release', { action });
      }
    }
  }

  _axis(name, mag) {
    const s = this._state.get(name);
    const wasDown = s && s.down;
    return mag > (wasDown ? AXIS_RELEASE : AXIS_DEADZONE);
  }

  _fire(action, repeat) {
    if (!this.active) {
      this.active = true;
      this.bus?.emit('pad:active', { family: this.family, id: this.padId });
    }
    this.bus?.emit('pad:action', { action, repeat, family: this.family });
  }

  /** For a hint line: 'Ⓐ Play'. */
  glyph(action) { return glyphFor(this.family, action); }
}

function ctxHasClock(ctx) { return !!(ctx && ctx.clock && typeof ctx.clock.onFrame === 'function'); }

/* ── glyphs ────────────────────────────────────────────────────────────────
 * Text, not images. Four families times fourteen actions is fifty-six sprites
 * to draw, licence, load and keep in sync with a palette, to communicate what a
 * circled letter already communicates. Steam's own Deck guidance asks that a
 * game show the RIGHT face button for the pad in hand, and that is the part
 * that actually matters — a PlayStation player told to press A looks for an A.
 */
const GLYPHS = {
  xbox: { confirm: 'Ⓐ', cancel: 'Ⓑ', alt: 'Ⓧ', menu: 'Ⓨ', prev: 'LB', next: 'RB', 'page-prev': 'LT', 'page-next': 'RT', start: '☰', select: '⧉' },
  playstation: { confirm: '✕', cancel: '◯', alt: '□', menu: '△', prev: 'L1', next: 'R1', 'page-prev': 'L2', 'page-next': 'R2', start: '☰', select: '⧉' },
  nintendo: { confirm: 'Ⓑ', cancel: 'Ⓐ', alt: 'Ⓨ', menu: 'Ⓧ', prev: 'L', next: 'R', 'page-prev': 'ZL', 'page-next': 'ZR', start: '＋', select: '－' },
  deck: { confirm: 'Ⓐ', cancel: 'Ⓑ', alt: 'Ⓧ', menu: 'Ⓨ', prev: 'L1', next: 'R1', 'page-prev': 'L2', 'page-next': 'R2', start: '☰', select: '⧉' },
};
const DIR_GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };

export function glyphFor(family, action) {
  if (DIR_GLYPH[action]) return DIR_GLYPH[action];
  const set = GLYPHS[family] || GLYPHS.xbox;
  return set[action] || '·';
}

export default Gamepad;
