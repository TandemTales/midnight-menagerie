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

    const root = this.root = el('div', 'coach');
    root.innerHTML = `
      <div class="coach__spot" aria-hidden="true"></div>
      <div class="coach__card" role="status" aria-live="polite">
        <p class="coach__text"></p>
        <!-- The way out lives IN the card, in its row. Parked at the bottom of
             the screen it sat on the lowest 28px of the middle card in the fan
             and ate that click, which is the one thing this overlay promises
             not to do; hung under the card it lands in the same place, because
             every step puts the card just above the hand. -->
        <div class="coach__row">
          <span class="coach__hint"></span>
          <button class="coach__skip" type="button">Skip</button>
          <button class="coach__next" type="button">Got it</button>
        </div>
      </div>`;
    this.host.appendChild(root);

    this.$spot = root.querySelector('.coach__spot');
    this.$card = root.querySelector('.coach__card');
    this.$text = root.querySelector('.coach__text');
    this.$hint = root.querySelector('.coach__hint');
    this.$next = root.querySelector('.coach__next');

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

    this._sel = s.at || null;
    this._all = !!s.all;
    this.root.classList.toggle('has-spot', !!this._sel);
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
    if (!this._all) {
      const n = this.host.querySelector(this._sel);
      if (!n || !n.isConnected) return null;
      const b = n.getBoundingClientRect();
      return (b.width || b.height) ? b : null;
    }
    let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
    for (const n of this.host.querySelectorAll(this._sel)) {
      const b = n.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      l = Math.min(l, b.left); t = Math.min(t, b.top);
      rr = Math.max(rr, b.right); bb = Math.max(bb, b.bottom);
    }
    if (!(rr > l)) return null;
    return { left: l, top: t, right: rr, bottom: bb, width: rr - l, height: bb - t };
  }

  /**
   * Put the spotlight on the target and the card somewhere it does not cover it.
   *
   * The card goes to whichever side of the target has room, preferring above /
   * below — a fight is laid out in bands (enemies, hand, the two corners) so
   * vertical displacement almost always keeps the thing being pointed at and
   * the sentence about it in the same glance.
   */
  _place() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const card = this.$card;
    const cw = card.offsetWidth || 340, ch = card.offsetHeight || 120;
    const pad = 18;

    const r = this._rect();
    if (!r) {
      this.$spot.style.opacity = '0';
      card.style.left = `${Math.round((vw - cw) / 2)}px`;
      card.style.top = `${Math.round(vh * 0.34)}px`;
      return;
    }

    const m = 10;
    this.$spot.style.opacity = '1';
    this.$spot.style.left = `${Math.round(r.left - m)}px`;
    this.$spot.style.top = `${Math.round(r.top - m)}px`;
    this.$spot.style.width = `${Math.round(r.width + m * 2)}px`;
    this.$spot.style.height = `${Math.round(r.height + m * 2)}px`;

    const below = vh - r.bottom, above = r.top;
    const want = this.steps[this.i]?.place;
    let x = r.left + r.width / 2 - cw / 2;
    let y;
    /* A step may ASK for a side. The board is banded — enemies across the
       middle, the hand along the bottom, Nerve and End Turn in the corners —
       and "whichever side has room" put the card over the top edge of the hand
       for every step above it. Asking is one word per step and needs no
       knowledge of the fight's DOM in here. */
    if (want === 'above' && above >= ch + pad * 2) y = r.top - ch - pad;
    else if (want === 'below' && below >= ch + pad * 2) y = r.bottom + pad;
    else if (below >= ch + pad * 2) y = r.bottom + pad;
    else if (above >= ch + pad * 2) y = r.top - ch - pad;
    else {
      // no room either way: put it beside, on the emptier side
      y = Math.max(pad, Math.min(vh - ch - pad, r.top + r.height / 2 - ch / 2));
      x = (r.left > vw - r.right) ? r.left - cw - pad : r.right + pad;
    }
    card.style.left = `${Math.round(Math.max(pad, Math.min(vw - cw - pad, x)))}px`;
    card.style.top = `${Math.round(Math.max(pad, Math.min(vh - ch - pad, y)))}px`;
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
