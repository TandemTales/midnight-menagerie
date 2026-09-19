/**
 * The coach — a walkthrough laid OVER a real fight, never inside one.
 *
 * `scenes/tutorial.js` deep-links the ordinary `CombatScene` at `foyer-1` and
 * mounts this on top of it. Everything here is presentation: it points at
 * things that are already on screen, reads engine events to know when the
 * player has done the thing, and gets out of the way. It never touches the
 * hand, the deck, the targets or the rules.
 *
 * THAT IS THE WHOLE DESIGN DECISION. The alternative — a tutorial mode inside
 * the engine with a fixed opening hand and gated legality — teaches in a
 * tighter order and costs a second set of combat rules living beside a
 * 3,858-line scene and a 2,000-line engine, free to drift from the real ones
 * without anything failing. A fight the engine cannot tell from any other fight
 * cannot teach the player something the real game will contradict.
 *
 * Consequences worth knowing, rather than discovering:
 *   - The player can ignore a step. Every step that WAITS on an action waits
 *     for the CLASS of action ("a Trick was played"), not a particular card, so
 *     there is no way to get stuck by doing something sensible.
 *   - The overlay takes no pointer events except on its own two buttons, so the
 *     fight underneath stays completely playable while a card is on screen.
 *   - It can be dismissed at any point and never comes back.
 *
 * A step:
 *   { text, at, place, wait, when, after, hint }
 *     at     CSS selector to spotlight, or null for a card with no target
 *     all    spotlight the UNION of every match, not the first one
 *     place  'above' | 'below' — which side of the target the card prefers
 *     wait   engine event id to advance on ('card:play'), or null for "press on"
 *     when   predicate on that event, for the ones that fire more than once
 *     after  seconds to let the action land before the next card (default 0.7)
 *     hint   what to do, shown instead of the button while waiting
 */
import { el } from './portrait.js';

const CSS = new URL('./coach.css', import.meta.url).href;

/* The spotlight is the Kid board's portrait frame (frame.webp, 9-sliced by
   `.kit-railframe--ornate`) drawn at SPOT_FK of its size: its gilt rail starts
   ON the box's edge and runs 7px of the painting inward, and the painting
   stands FRAME_OUT outside the box. So the box is SPOT_M clear of the target
   on every side, and the rail never crosses what it frames. coach.css sets
   the same --fk. */
const SPOT_FK = 0.66;
const SPOT_M = Math.round(8 * SPOT_FK + 4);
const FRAME_OUT = 12 * SPOT_FK;
/* the note's painted rail (and the paw on it) stand outside its box by this
   much, and it keeps this much air between itself and the frame */
const NOTE_HALO = 12;
const NOTE_GAP = 10;

/* What the note must never lie over, and how much each matters. Everything
   weighing HARD or more it may not cover at all: the hand and End Turn, the
   HUD's rail, the Nerve and the piles, the Companion's portrait. The rest a
   player reads mid-turn: a note will cover a creature's toe before it covers
   a card, but it would rather cover neither. Document-wide on purpose: the
   HUD is not in the scene root. */
const HARD = 40;
const KEEP_CLEAR = [
  ['.mm-hand__cards .mm-card', 60],
  ['#end-turn', 60],
  ['.mm-hud', 60],
  ['.cb-bl', 40],
  ['.cb-br', 40],
  ['.cb-player', 40],
  ['.cb-mates > .cb-mate:not([hidden])', 30],
  ['.cb-rules:not([hidden]) > *', 30],
  ['.cb-enemy', 8],
  ['.cb-enemy__intent', 12],
  ['.cb-hero', 1],
];
/* the parts of a target that stand outside its box but are part of it */
const FRAME_WITH = '.cb-enemy__intent';

/** Area two boxes share. */
function overlap(a, b) {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}

export class Coach {
  /**
   * @param {object} ctx        the scene context (audio, clock)
   * @param {HTMLElement} host  where the overlay mounts — the combat root
   * @param {object} engine     CombatEngine, for the `wait` subscriptions
   * @param {object[]} steps
   * @param {() => void} [onDone]
   */
  constructor(ctx, host, engine, steps, onDone) {
    this.ctx = ctx;
    this.host = host;
    this.engine = engine;
    this.steps = steps.slice();
    this.onDone = onDone || (() => {});
    this.i = -1;
    this._offs = [];
    this._live = false;
  }

  async mount() {
    if (document.querySelector(`link[href="${CSS}"]`)) { /* already */ } else {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = CSS;
      document.head.appendChild(link);
      await new Promise((r) => { link.onload = r; link.onerror = r; setTimeout(r, 600); });
    }

    /* THE NOTE IS CUT FROM THE BOARDS' OWN PIECES (ui/kit.css), the way the
       story's pages in scenes/tutorial.js are: a `.kit-panel` (the Kid board's
       painted gold rail round dark damask, its inner double rule and brass
       fleurons) with the Kid board's paw medallion seated on its top rail, a
       `.kit-heading` in spaced gold small caps, the pages as the wordmark's
       gold stars on a gilt thread (`.kit-stars`), and the two ways on as the
       boards' nameplates (`.kit-btn`, `.kit-btn--quiet`). The spotlight is the
       Kid board's portrait frame (`.kit-railframe--ornate`) hung round the
       thing being taught, and the light on it is a candle's (`.kit-light`),
       never a box-shadow. */
    const root = this.root = el('div', 'coach');
    const stars = this.steps.map(() => '<i class="kit-stars__star coach__star"></i>').join('');
    root.innerHTML = `
      <i class="coach__glow kit-light kit-light--candle" aria-hidden="true"></i>
      <div class="coach__spot kit-railframe kit-railframe--ornate" aria-hidden="true"></div>
      <div class="coach__card kit-panel kit-panel--damask" data-medal="paw" role="status" aria-live="polite">
        <p class="coach__head kit-heading" aria-hidden="true">The First Scuffle</p>
        <p class="coach__text"></p>
        <!-- The way out lives IN the card, in its row. Parked at the bottom of
             the screen it sat on the lowest 28px of the middle card in the fan
             and ate that click, which is the one thing this overlay promises
             not to do; in the card it goes wherever the card goes, and the
             card is never placed over the hand. -->
        <div class="coach__row">
          <span class="coach__steps kit-stars" aria-hidden="true">${stars}</span>
          <span class="coach__hint"></span>
          <button class="coach__skip kit-btn kit-btn--quiet" type="button">Skip</button>
          <button class="coach__next kit-btn" type="button">Got it<kbd class="coach__key" aria-hidden="true">Enter</kbd></button>
        </div>
      </div>`;
    this.host.appendChild(root);

    this.$spot = root.querySelector('.coach__spot');
    this.$glow = root.querySelector('.coach__glow');
    this.$card = root.querySelector('.coach__card');
    this.$text = root.querySelector('.coach__text');
    this.$hint = root.querySelector('.coach__hint');
    this.$next = root.querySelector('.coach__next');
    this.$stars = [...root.querySelectorAll('.coach__star')];

    const on = (n, ev, fn) => { n.addEventListener(ev, fn); this._offs.push(() => n.removeEventListener(ev, fn)); };
    on(this.$next, 'click', () => this._next());
    on(root.querySelector('.coach__skip'), 'click', () => this.dismiss());
    on(window, 'keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); this.dismiss(); return; }
      /* Enter turns the page ONLY on a step that is waiting for nothing. On a
         step that wants a card played, Enter belongs to `ui/hand.js`. */
      if (e.key === 'Enter' && !this.$next.hidden) { e.preventDefault(); this._next(); }
    });
    on(window, 'resize', () => this._place());

    /* The spotlight follows a live board: the hand re-fans, an enemy dies, the
       Nerve ring moves. One rAF-driven reposition off the shared clock, only
       while a step with a target is showing. */
    this._offFrame = this.ctx.clock.onFrame(() => { if (this._live) this._place(); });

    this._live = true;
    this._next();
    return this;
  }

  /* ── stepping ───────────────────────────────────────────────────────────── */
  _next() {
    this._unwait();
    this.i++;
    if (this.i >= this.steps.length) return this.dismiss();
    const s = this.steps[this.i];

    this.$text.textContent = s.text;
    this.$hint.textContent = s.wait ? (s.hint || '') : '';
    this.$hint.hidden = !s.wait;
    this.$next.hidden = !!s.wait;
    this.root.dataset.step = String(this.i);
    /* where you are in the lesson: the pages behind you gilt, this one burning */
    this.$stars.forEach((star, k) => {
      star.classList.toggle('is-past', k < this.i);
      star.classList.toggle('is-on', k === this.i);
    });

    this._sel = s.at || null;
    this._all = !!s.all;
    this.root.classList.toggle('has-spot', !!this._sel);
    this._pos = null;                     // a new step finds its own place
    this._sig = '';
    this._place();

    if (s.wait) {
      /* One-shot. `engine.on` returns its own disposer, which is the contract
         `state/run.js` uses too. */
      const off = this.engine.on(s.wait, (ev) => {
        if (s.when && !s.when(ev)) return;
        /* A beat, so the player sees what they did before being talked at
           about it. `clock.wait` and not setTimeout: the fight pauses with the
           Steam overlay and so must this. */
        this.ctx.clock.wait(s.after ?? 0.7).then(() => { if (this._live) this._next(); });
        this._unwait();
      });
      this._waitOff = off;
    }

    try { this.ctx.audio?.play?.('ui:tooltip'); } catch {}
  }

  _unwait() {
    if (this._waitOff) { try { this._waitOff(); } catch {} this._waitOff = null; }
  }

  /**
   * What to ring, resolved fresh every frame.
   *
   * `all` unions every match, which is the only honest way to point at THE HAND:
   * `.cb-handhost` and `.mm-hand` are both `inset: 0` over the whole board — a
   * ring round either is a ring round the screen — so the hand is its cards, and
   * the cards move every time the fan re-lays. Anything with no box at all
   * (a pile that is hidden, an enemy that has just died) yields null and the
   * card falls back to the middle of the screen rather than ringing nothing.
   */
  _rect() {
    if (!this._sel) return null;
    const nodes = this._all
      ? [...this.host.querySelectorAll(this._sel)]
      : [this.host.querySelector(this._sel)].filter((n) => n && n.isConnected);
    let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
    const add = (b) => {
      if (!b.width && !b.height) return;
      l = Math.min(l, b.left); t = Math.min(t, b.top);
      rr = Math.max(rr, b.right); bb = Math.max(bb, b.bottom);
    };
    for (const n of nodes) {
      add(n.getBoundingClientRect());
      /* a creature's intent hangs ABOVE its box: frame the creature as it is
         drawn, or the gilt rail runs straight through the number it shows */
      for (const part of n.querySelectorAll(FRAME_WITH)) add(part.getBoundingClientRect());
    }
    if (!(rr > l)) return null;
    return { left: l, top: t, right: rr, bottom: bb, width: rr - l, height: bb - t };
  }

  /**
   * Hang the frame round the target and stand the note where it covers nothing
   * the player is reading.
   *
   * The note may never lie over the thing its spotlight names, the hand or End
   * Turn, and a player mid-turn also reads the HUD's rail, the Nerve and the
   * piles, the Companion's portrait and the creatures. "Whichever side of the
   * target has room" put the Nerve's note over two cards of the hand and the
   * Companion at the Deck's 1280, and the intent's note over the very creature
   * it was about. So the note is PLACED: every spot on the board it could
   * stand in is scored by what it would cover, weighted by how much that thing
   * matters (KEEP_CLEAR), and by how far it would stand from what it is talking
   * about, and it takes the cheapest. A step's `place` is still honoured, as a
   * preference: the board is banded — creatures across the middle, the hand
   * along the bottom, Nerve and End Turn in the corners — so the side a step
   * asks for is usually the right one when it is free.
   *
   * The search runs only when something it depends on has moved, and a note
   * already standing somewhere good stays there rather than chasing the fan
   * every time it re-lays.
   */
  _place() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const card = this.$card;
    const cw = card.offsetWidth || 340, ch = card.offsetHeight || 120;
    const r = this._rect();

    let frame = null;
    if (r) {
      /* the portrait frame's gilt rail runs from the box's edge inward, so the
         box stands SPOT_M clear of the target and the rail never crosses it */
      const sl = r.left - SPOT_M, st = r.top - SPOT_M;
      const sw = r.width + SPOT_M * 2, sh = r.height + SPOT_M * 2;
      const s = this.$spot.style;
      s.opacity = '1';
      s.left = `${Math.round(sl)}px`; s.top = `${Math.round(st)}px`;
      s.width = `${Math.round(sw)}px`; s.height = `${Math.round(sh)}px`;
      /* the candle's light falls on the thing, a pool as wide as it is */
      const g = this.$glow.style;
      g.opacity = '1';
      g.left = `${Math.round(r.left + r.width / 2)}px`;
      g.top = `${Math.round(r.top + r.height / 2)}px`;
      g.width = `${Math.round(r.width * 1.25 + 150)}px`;
      g.height = `${Math.round(r.height * 1.3 + 150)}px`;
      const out = FRAME_OUT + NOTE_GAP;
      frame = { l: sl - out, t: st - out, r: sl + sw + out, b: st + sh + out };
    } else {
      this.$spot.style.opacity = '0';
      this.$glow.style.opacity = '0';
    }

    const keep = this._keepOut();
    const want = this.steps[this.i]?.place || null;
    const sig = [vw, vh, cw, ch, want, frame && [frame.l, frame.t, frame.r, frame.b].map((v) => Math.round(v / 4)).join(','),
      keep.map((k) => [k.l, k.t, k.r, k.b].map((v) => Math.round(v / 8)).join(',')).join(';')].join('|');
    if (sig !== this._sig || !this._pos) {
      this._sig = sig;
      const ctx = { vw, vh, cw, ch, frame, keep, want, ceil: this._ceiling() };
      const best = this._search(ctx);
      /* stay put while the old spot is nearly as good: a note that hops
         whenever a card lifts in the fan is harder to read than one that
         stands a little further off */
      if (this._pos && best) {
        const was = this._cost(this._pos.x, this._pos.y, ctx);
        if (was.hard === 0 && was.cost <= best.cost * 1.12 + 900) { this._apply(this._pos); return; }
      }
      this._pos = best;
    }
    if (this._pos) this._apply(this._pos);
  }

  _apply(p) {
    this.$card.style.left = `${Math.round(p.x)}px`;
    this.$card.style.top = `${Math.round(p.y)}px`;
  }

  /** The HUD's foot: nothing of the note goes above it. */
  _ceiling() {
    let y = 0;
    for (const sel of ['.mm-hud', '.cb-top']) {
      for (const n of document.querySelectorAll(sel)) {
        const b = n.getBoundingClientRect();
        if (b.width && b.height && b.top < window.innerHeight * 0.25) y = Math.max(y, b.bottom);
      }
    }
    return y;
  }

  /** What the note must stand clear of, as boxes with a weight each. */
  _keepOut() {
    const out = [];
    for (const [sel, w] of KEEP_CLEAR) {
      for (const n of document.querySelectorAll(sel)) {
        if (n.closest('.coach')) continue;
        const b = n.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        out.push({ l: b.left, t: b.top, r: b.right, b: b.bottom, w });
      }
    }
    return out;
  }

  /** What standing the note's box at (x, y) would cost. */
  _cost(x, y, c) {
    const b = { l: x - NOTE_HALO, t: y - NOTE_HALO, r: x + c.cw + NOTE_HALO, b: y + c.ch + NOTE_HALO };
    let hard = 0, cost = 0;
    if (c.frame) hard += overlap(b, c.frame);
    for (const k of c.keep) {
      const o = overlap(b, k);
      if (!o) continue;
      if (k.w >= HARD) hard += o;
      cost += o * k.w;
    }
    cost += hard * 400;
    /* how far from what it is about: a note is read WITH its target */
    const T = c.frame || { l: c.vw / 2, r: c.vw / 2, t: c.vh * 0.38, b: c.vh * 0.38 };
    const dx = Math.max(0, T.l - b.r, b.l - T.r), dy = Math.max(0, T.t - b.b, b.t - T.b);
    const d = Math.hypot(dx, dy);
    cost += d * 16 + Math.max(0, d - 120) * 26;
    if (c.frame) {
      const side = b.b <= T.t + 1 ? 'above' : b.t >= T.b - 1 ? 'below'
        : (b.r <= T.l + 1 || b.l >= T.r - 1) ? 'beside' : 'over';
      if (c.want && side !== c.want) cost += side === 'beside' ? 700 : 2200;
      /* squarely above, below or beside it, not hanging off one corner */
      if (side === 'above' || side === 'below') cost += Math.abs((b.l + b.r - T.l - T.r) / 2) * 1.5;
      else if (side === 'beside') cost += Math.abs((b.t + b.b - T.t - T.b) / 2) * 1.5;
    } else {
      cost += Math.abs((b.l + b.r) / 2 - c.vw / 2) * 1.5;
    }
    return { hard, cost };
  }

  _search(c) {
    const pad = 12;
    const x0 = pad + NOTE_HALO, x1 = Math.max(x0, c.vw - c.cw - pad - NOTE_HALO);
    const y0 = Math.max(pad, c.ceil + 6) + NOTE_HALO, y1 = Math.max(y0, c.vh - c.ch - pad - NOTE_HALO);
    let best = null;
    const probe = (x, y) => {
      const k = this._cost(x, y, c);
      if (!best || k.cost < best.cost) best = { x, y, cost: k.cost };
    };
    /* every 12px, and the far edges themselves: a note that only fits flush
       against the screen's edge must still be tried there */
    const steps = (a, b) => { const out = []; for (let v = a; v < b; v += 12) out.push(v); out.push(b); return out; };
    const ys = steps(y0, y1), xs = steps(x0, x1);
    for (const y of ys) for (const x of xs) probe(x, y);
    if (!best) return null;
    /* then settle it to the pixel round the best of the grid */
    const bx = best.x, by = best.y;
    for (let y = Math.max(y0, by - 12); y <= Math.min(y1, by + 12); y += 3) {
      for (let x = Math.max(x0, bx - 12); x <= Math.min(x1, bx + 12); x += 3) probe(x, y);
    }
    return best;
  }

  /** Done, or dismissed. Either way it never comes back this fight. */
  dismiss() {
    if (!this._live) return;
    this._live = false;
    this._unwait();
    this.root.classList.add('is-out');
    const kill = () => this.destroy();
    if (this.ctx.clock) this.ctx.clock.wait(0.28).then(kill); else kill();
    try { this.onDone(); } catch (e) { console.error('[coach] onDone', e); }
  }

  destroy() {
    this._live = false;
    this._unwait();
    this._offFrame?.();
    this._offFrame = null;
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this.root?.remove();
    this.root = null;
  }
}

/**
 * The opening fight's script.
 *
 * Eight beats, in the order the first turn actually happens in: what is in the
 * room, what it will do, what you have, what it costs, do one, what it cost
 * you, end the turn, and then the loop named out loud once so it is a rule and
 * not a coincidence.
 *
 * Terms are the game's own (`data/schema.js` TERMS) — Courage, Guard, Nerve,
 * Trick, Scuffle — because every tooltip, card and status in the game uses them
 * and a tutorial that says "energy" teaches a word the game never says again.
 */
/**
 * The hand, as a selector.
 *
 * SCOPED, and it has to be: `ui/hand.js` keeps a hidden `.mm-card` probe — it
 * measures the responsive card size without needing a real card — parked far
 * off-screen. Unioning bare `.mm-card` therefore produced a spotlight 101,059
 * pixels wide. Only `.mm-hand__cards` holds the fan.
 */
const HAND = '.mm-hand__cards .mm-card';

export function openingSteps(TERMS) {
  return [
    {
      at: '.cb-enemy', place: 'above',
      text: `That is a Dust Bunny. Everything in this house was something else `
        + `once, and it has had a long time to stop being it.`,
    },
    {
      at: '.cb-enemy__intent', place: 'above',
      text: `Above it is what it will do on its turn, and exactly how much. `
        + `The house is never coy about that number — read it before you spend anything.`,
    },
    {
      at: HAND, all: true, place: 'above',
      text: `Marmalade's ${TERMS.deck}. Click one to play it, or drag it onto `
        + `what you want it to happen to.`,
    },
    {
      at: '.cb-nerve', place: 'above',
      text: `${TERMS.energy} is what a ${TERMS.card} costs. You get three a turn `
        + `and it refills every turn — so ${TERMS.energy} you did not spend is ${TERMS.energy} you wasted.`,
    },
    {
      at: HAND, all: true, place: 'above',
      text: `Your turn. Play one.`,
      hint: `Play a ${TERMS.card}`,
      wait: 'card:play',
    },
    {
      at: '.cb-player', place: 'above',
      text: `${TERMS.hp} is how much fright is left in you; at nothing you are out `
        + `of the Scuffle. ${TERMS.block} soaks damage before ${TERMS.hp} does — and it is `
        + `gone by your next turn, so raise it for what is coming, never for later.`,
    },
    {
      at: '#end-turn', place: 'above',
      text: `When you have spent what you mean to spend, hand the turn over.`,
      hint: 'End your turn',
      wait: 'turn:end',
      /* CONTRACTS trap 9: `turn:end` fires for EVERY ENEMY too, not just the
         player. Without this filter the step would also be satisfied by the
         Dust Bunny finishing its turn — which is not the thing being taught. */
      when: (ev) => ev.side === 'player',
      after: 0.2,
    },
    {
      at: null,
      text: `That is the whole of it: read what it is about to do, spend every `
        + `point of ${TERMS.energy} answering it, end the turn. Marmalade will handle the rest.`,
    },
  ];
}

export default Coach;
