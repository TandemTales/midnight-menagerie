/**
 * Reward — the room after the fight.  OWNER: meta-run.
 *
 * STS2-REFERENCE §6: "Card reward after combat: 3 cards, take one or skip;
 * rarity odds shift with luck."  So:
 *
 *   · three real `CardView`s, full hover and inspect, laid out on an arc
 *   · one pick, or none, and the screen says out loud what "none" buys you —
 *     Lost Things now and a permanent bump to the luck that decides how often
 *     a Rare turns up.  Skipping is a play, not a mistake.
 *   · the spoils (Lost Things, a Keepsake after a Big Scare, Clues) are listed
 *     before you choose, so the choice is made with everything on the table.
 *
 * This file also carries the **shared room chrome** every node scene uses
 * (`RoomScene`, the HUD, the plaque, the picker overlay).  main.js imports this
 * module at boot, so putting it here means `state/run.js` is evaluated — and
 * therefore the run layer installs itself — before anything can be clicked.
 * shop.js / rest.js / event.js import the kit from here.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { passTo, shouldHandOff } from '../ui/handoff.js';
import { TERMS, NodeType } from '../data/schema.js';
import { cardById } from '../data/cards.js';
import { relicById, relicSigil } from '../data/relics.js';
import { Run } from '../state/run.js';
import { regionMeta } from '../state/mapgen.js';
import { el, ensureCss, rovingFocus, reduceMotion as prefersReduced } from '../ui/portrait.js';
import { plural, word } from '../util/plural.js';
import { HUD } from '../ui/hud.js';
import { pauseStageFor } from './_stage.js';
import { fitCardToSlot } from './_cardfit.js';

const CSS_KIT  = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_CARD = new URL('../ui/card.css', import.meta.url).href;
const CSS_ROOM = new URL('./reward.css', import.meta.url).href;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ═══════════════════════════════════════════════════════════════════════════
//  Shared room chrome
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The common shell for the four node scenes: ground, vignette, a header that
 * names the room, a live HUD (Courage / Lost Things / Keepsakes), a body slot
 * and a footer slot.  Handles CSS loading, accessibility settings, a teardown
 * registry, and the standalone mock run.
 */
export class RoomScene extends Scene {
  constructor(ctx, opts = {}) {
    super(ctx);
    this.kind = opts.kind || 'room';
    this._off = [];            // teardown callbacks
    this._views = [];          // CardViews to destroy
    this._dead = false;
  }

  /** Settings, re-read whenever ui-chrome says they changed. */
  _readSettings() {
    const s = this.ctx.Save?.settings || {};
    this.reduceMotion = !!s.reduceMotion || prefersReduced();
    this.largeText = !!s.largeText;
    this.speed = s.fastMode ? 1.7 : (s.speed || 1);
  }
  _d(sec) { return this.reduceMotion ? 0.001 : sec / this.speed; }
  _wait(sec) { return clock.wait(this._d(sec)); }

  /** Register anything that must be undone in exit(). */
  _own(offFn) { if (typeof offFn === 'function') this._off.push(offFn); return offFn; }
  _on(target, ev, fn, opts) {
    target.addEventListener(ev, fn, opts);
    this._own(() => target.removeEventListener(ev, fn, opts));
  }

  /**
   * The run this screen is about.  A real `ctx.run` when there is one; a real,
   * fully-walked `Run.mock()` when the screen was deep-linked for review.
   */
  _resolveRun(params, mockNodeType = null) {
    const real = this.ctx.run;
    if (real instanceof Run) { this.mock = false; return real; }
    if (real && typeof real === 'object' && real.deck) { this.mock = false; return real; }
    this.mock = true;
    return Run.mock({
      seed: Number(params.seed) || 20260820,
      companion: params.companion || 'marmalade',
      kid: params.kid || 'maya',
      node: mockNodeType,
    });
  }

  async _boot(params, mockNodeType) {
    /* Reward, Event, Shop and Rest all paint an opaque room screen over the
       canvas — every one of them measures 0.00% of canvas pixels visible. One
       pause here covers all four; RoomScene.exit() below is the matching
       unpause, and none of the four overrides it. */
    this._unpauseStage = pauseStageFor(this.ctx);

    this._readSettings();
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_ROOM), ensureCss(CSS_CARD)]);
    this.run = this._resolveRun(params, mockNodeType);
    this.root.dataset.kind = this.kind;
    this.root.classList.toggle('is-large', this.largeText);
    this.root.classList.toggle('is-still', this.reduceMotion);
    this._own(bus.on('settings:changed', () => {
      this._readSettings();
      this.root?.classList.toggle('is-large', this.largeText);
      this.root?.classList.toggle('is-still', this.reduceMotion);
    }));
  }

  /** Ground + vignette + the room header + HUD + body + footer. */
  _shell({ eyebrow, title, sub }) {
    const region = regionMeta(this.run.region);
    const node = this.run.currentNode;
    this.root.innerHTML = `
      <div class="rm rm--${this.kind}">
        <div class="rm-ground" aria-hidden="true"></div>
        <div class="rm-vig" aria-hidden="true"></div>
        <div class="rm-motes" aria-hidden="true"></div>

        <div class="rm-hudhost" data-hud></div>

        <header class="rm-head">
          <div class="rm-where">
            <span class="rm-eyebrow">${esc(eyebrow || region.name)}</span>
            <h1 class="rm-title">${esc(title)}</h1>
            ${sub ? `<p class="rm-sub">${esc(sub)}</p>` : ''}
            ${node?.roomName ? `<p class="rm-room">${esc(node.roomName)} &middot; ${esc(region.name)}</p>` : ''}
          </div>
        </header>

        <main class="rm-body" data-body></main>
        <footer class="rm-foot" data-foot></footer>
        ${this.mock ? '<div class="rm-mockflag" role="note">Standalone preview &middot; no expedition in progress</div>' : ''}
      </div>`;
    this.$body = this.root.querySelector('[data-body]');
    this.$foot = this.root.querySelector('[data-foot]');
    this.$hud = this.root.querySelector('[data-hud]');
    this._syncHud();
  }

  /**
   * The four node rooms all show the same thing the map and the Scuffle show,
   * so they show it with the same component: `ui/hud.js`, pinned to the top
   * edge. This used to be a hand-rolled Courage chip, a hand-rolled purse and
   * a torch glyph that appeared nowhere else in the game.
   *
   * The HUD is event-driven; `_syncHud()` stays as the explicit poke the room
   * scenes already call after a purchase or a heal.
   */
  _syncHud() {
    if (!this.$hud) return;
    if (!this.hud) {
      // In flow, not pinned: these screens are a grid and the strip is its
      // first row, so a wrapped HUD under largeText pushes the room down
      // instead of sitting on top of the title.
      this.hud = new HUD(this.ctx, {
        mount: this.$hud, run: this.run, fixed: false, escape: true, useSnacks: false,
      });
      this._own(() => { this.hud?.destroy(); this.hud = null; });
      this._buildHudExtras();
    }
    this.hud.refresh();
    this._syncHudExtras();
  }

  /**
   * Clues and Luck, in the status strip.
   *
   * The run awards both — a Curiosity hands out +3 Clues, skipping a reward
   * buys +2 Luck — and until now neither appeared anywhere the player could
   * see, so both were invisible currencies. `ui/hud.js` belongs to ui-chrome
   * and does not carry them yet, but it publishes `addChip()` for exactly this,
   * so the four room screens can at least tell the truth today. (The ask to put
   * them in the shared HUD, so the map and a Scuffle show them too, is in
   * docs/NOTES.md.)
   */
  _buildHudExtras() {
    const mk = (cls, kw, title) => {
      const n = el('div', `mm-hud__chip rm-hudx rm-hudx--${cls}`);
      n.tabIndex = 0;
      n.dataset.kw = kw;
      n.dataset.tipTitle = title;
      this.hud.addChip(n);
      return n;
    };
    this.$clues = mk('clue', 'clue',
      'Clues — what you have worked out about where the animals went. They carry over to the investigation board at the clubhouse.');
    this.$luck = mk('luck', 'luck',
      'Luck — how much more likely a Rare Trick is to turn up in a reward. Keepsakes raise it, and so does taking none of the three.');
  }

  _syncHudExtras() {
    if (!this.$clues) return;
    const clues = Number(this.run.cluesFound) || 0;
    const luck = Number(this.run.flags?.luck) || 0;
    this.$clues.textContent = `${clues} ${word(clues, 'Clue')}`;
    this.$clues.setAttribute('aria-label', `${plural(clues, 'Clue')} found`);
    this.$luck.textContent = `Luck +${luck}`;
    this.$luck.setAttribute('aria-label', `Luck plus ${luck}`);
    this.$luck.hidden = luck <= 0;
  }

  /** The one large action at the bottom right. */
  _primary(label, onGo, { hint = '', key = 'Enter' } = {}) {
    const b = el('button', 'rm-go');
    b.type = 'button';
    b.innerHTML = `<span>${esc(label)}</span>${hint ? `<em>${esc(hint)}</em>` : ''}<kbd>${esc(key)}</kbd>`;
    b.addEventListener('click', () => { this.ctx.audio?.play?.('ui:confirm'); onGo(); });
    this.$foot.appendChild(b);
    this.$go = b;
    return b;
  }

  /** Standard exit: back to the blueprint, or nowhere at all when mocked. */
  _leave() {
    if (this.mock) { this.ctx.scenes?.go?.('map', { region: this.run.region, seed: this.run.seed }); return; }
    this.run.leaveNode?.();
  }

  /**
   * Leave a per-Kid room — but only once every Kid has had their turn in it.
   *
   * Mr. Moth stocks a shelf each and the Safe Room offers each Kid their own
   * night, so one Kid walking out would take the room with them. "Had their
   * turn" is marked when they leave, not when they use it: a Kid is allowed to
   * look at the shelf and buy nothing.
   */
  async _leaveRoom({ perKid = true } = {}) {
    if (this._leaving) return;
    const run = this.run;
    if (run && !this.mock) run.markRoomDone();
    // `perKid: false` for a room there is only one of. A Rescue is one pet
    // coming home — handing the screen on would show the second Kid a
    // Companion already rescued and nothing to do about it.
    const next = perKid ? this._seatStillOwed(k => !run.roomDoneBy(k)) : -1;
    if (next >= 0) {
      this._leaving = true;
      const done = await this._passRoomTo(next, 'Your turn in here.',
        'The room is yours for a moment.');
      if (done) return;
      this._leaving = false;
    }
    this._leaving = true;
    this._leave();
  }

  /**
   * Is another Kid still owed a turn in THIS room?
   *
   * Every room that is per Kid asks the same question — the reward's offer,
   * Mr. Moth's shelf, the Safe Room's night. `needs(kid)` says what "owed"
   * means here. Returns the seat, or -1.
   */
  _seatStillOwed(needs) {
    const run = this.run;
    if (!run || this.mock || !shouldHandOff(run)) return -1;
    return run.nextSeatNeeding(needs);
  }

  /**
   * Cover the screen, give it to that Kid, and open this room again as theirs.
   *
   * Re-entering rather than re-rendering in place: a room screen is built once
   * from `run.local` at `enter()`, and there are a dozen places that read it.
   * The veil is already covering everything, so the rebuild is free.
   */
  async _passRoomTo(seat, line, sub) {
    const run = this.run;
    const kid = run.kids[seat];
    if (!kid) return false;
    const name = this.ctx.scenes.currentName;
    await passTo({
      name: run.kidNameOf(kid), companion: kid.companion, line, sub,
      // The room is rebuilt as theirs while the veil is still down, so what
      // lifts is their screen and never a frame of the last Kid's.
      onReady: async () => {
        run.setLocalSeat(seat);
        await this.ctx.scenes.go(name, {
          node: run.currentNodeId, region: run.region, seed: run.seed,
        }, { instant: true });
      },
    });
    return true;
  }

  /**
   * A modal picker over real CardViews.  Used by the Safe Room (upgrade), the
   * shop (removal) and Curiosities (forget / mend).  Resolves with the chosen
   * uid, or null when dismissed.
   *
   * @param {{title, sub, cards:{uid,def,upgraded}[], preview?:'upgrade',
   *          confirmLabel?:string, allowCancel?:boolean}} o
   */
  async pickCard(o) {
    const { CardView } = await import('../ui/card.js');
    if (this._dead) return null;
    return new Promise((resolve) => {
      const ov = el('div', 'rm-picker');
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', o.title || 'Choose');
      ov.innerHTML = `
        <div class="rm-picker__scrim"></div>
        <div class="rm-picker__panel">
          <h2>${esc(o.title || 'Choose')}</h2>
          ${o.sub ? `<p class="rm-picker__sub">${esc(o.sub)}</p>` : ''}
          <div class="rm-picker__grid" role="listbox" aria-label="${esc(o.title || 'Choose')}"></div>
          <div class="rm-picker__foot">
            <p class="rm-picker__read" aria-live="polite"></p>
            ${o.allowCancel === false ? '' : '<button type="button" class="rm-btn rm-btn--ghost" data-cancel>Not this time <kbd>Esc</kbd></button>'}
            <button type="button" class="rm-btn rm-btn--go" data-ok disabled>${esc(o.confirmLabel || 'Confirm')}</button>
          </div>
        </div>`;
      const grid = ov.querySelector('.rm-picker__grid');
      const read = ov.querySelector('.rm-picker__read');
      const ok = ov.querySelector('[data-ok]');
      const views = [];
      let chosen = null;

      const layout = () => {
        for (const { slot, view } of views) fitCardToSlot(view, slot);
      };

      /* ── the upgrade preview ──────────────────────────────────────────────
         Exactly ONE card may wear its upgraded face at a time, plus whichever
         one is actually chosen. Round 3 hung the preview off each slot's own
         enter/leave AND focus/blur, so opening the picker focused slot 0 (which
         showed `Scratch+`), and then hovering `Boo!` showed `Boo!+` without ever
         blurring slot 0 — two `+` cards on screen with nothing selected.
         Pointer beats focus; focus is what is left when the pointer leaves. */
      let hoverEntry = null;
      let focusEntry = null;
      const paint = () => {
        if (o.preview !== 'upgrade') return;
        const active = hoverEntry || focusEntry;
        for (const v of views) {
          const want = (v === active || v.c.uid === chosen) ? true : !!v.c.upgraded;
          if (v.shown === want) continue;
          v.shown = want;
          try { v.view.setState({ upgraded: want }); } catch { /* card-feel owns the face */ }
        }
      };

      for (const c of o.cards) {
        const slot = el('div', 'rm-slot');
        slot.setAttribute('role', 'option');
        slot.setAttribute('aria-selected', 'false');
        slot.tabIndex = 0;
        slot.dataset.uid = c.uid;
        const view = new CardView(c.def, {
          uid: `pick-${c.uid}`, upgraded: c.upgraded,
          largeText: this.largeText, reduceMotion: this.reduceMotion,
        });
        slot.appendChild(view.el);
        const entry = { slot, view, c, shown: !!c.upgraded };
        views.push(entry);

        // Before / after on the real card: the Trick under the pointer (or, with
        // no pointer, under the focus ring) shows the upgraded face in place, so
        // the change is read on the card itself.
        slot.addEventListener('pointerenter', () => {
          hoverEntry = entry; read.textContent = this._pickerRead(c, o); paint();
        });
        slot.addEventListener('pointerleave', () => {
          if (hoverEntry === entry) hoverEntry = null;
          paint();
        });
        slot.addEventListener('focus', () => {
          focusEntry = entry; read.textContent = this._pickerRead(c, o); paint();
        });
        slot.addEventListener('blur', () => {
          if (focusEntry === entry) focusEntry = null;
          paint();
        });
        const choose = () => {
          chosen = c.uid;
          for (const v of views) v.slot.classList.toggle('is-chosen', v.c.uid === chosen);
          for (const v of views) v.slot.setAttribute('aria-selected', String(v.c.uid === chosen));
          paint();
          ok.disabled = false;
          this.ctx.audio?.play?.('ui:tick');
        };
        slot.addEventListener('click', choose);
        slot.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
        });
        grid.appendChild(slot);
      }

      const done = (val) => {
        offRove?.();
        window.removeEventListener('resize', layout);
        for (const v of views) v.view.destroy?.();
        ov.remove();
        resolve(val);
      };
      const offRove = rovingFocus(grid, '.rm-slot', { cols: Math.min(6, Math.max(1, o.cards.length)) });
      ov.querySelector('[data-cancel]')?.addEventListener('click', () => done(null));
      ok.addEventListener('click', () => chosen && done(chosen));
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && o.allowCancel !== false) { e.preventDefault(); done(null); }
        if (e.key === 'Enter' && chosen && document.activeElement === ok) { e.preventDefault(); done(chosen); }
      });

      this.root.appendChild(ov);
      this._own(() => { for (const v of views) v.view.destroy?.(); ov.remove(); });
      requestAnimationFrame(() => { layout(); grid.querySelector('.rm-slot')?.focus(); });
      window.addEventListener('resize', layout);
      this._own(() => window.removeEventListener('resize', layout));
    });
  }

  _pickerRead(c, o) {
    if (o.preview === 'upgrade') return `${c.def.name} becomes ${c.def.name}+.`;
    return c.def.name;
  }

  async exit() {
    this._dead = true;
    this._unpauseStage?.();
    this._unpauseStage = null;
    for (const off of this._off.splice(0)) { try { off(); } catch { /* teardown */ } }
    for (const v of this._views.splice(0)) { try { v.destroy?.(); } catch { /* teardown */ } }
    this.$body = this.$foot = this.$hud = this.$go = null;
    this.$clues = this.$luck = null;
    this.run = null;
  }
}

/** Small labelled chip used for spoils, prices and outcome deltas. */
export function chip(kind, label, value, title = '') {
  return `<span class="rm-spoil rm-spoil--${kind}"${title ? ` title="${esc(title)}"` : ''}>
    <b>${esc(value)}</b><span>${esc(label)}</span></span>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  The reward scene
// ═══════════════════════════════════════════════════════════════════════════

export class RewardScene extends RoomScene {
  constructor(ctx) { super(ctx, { kind: 'reward' }); }

  async enter(params = {}) {
    await this._boot(params, NodeType.SCUFFLE);
    if (this._dead) return;

    // A deep link with no run: fabricate the spoils the same way the run does.
    let reward = this.run.pendingReward;
    if (!reward) {
      const node = this.run.currentNode || this.run.map.nodes[0];
      reward = this.run._prepareReward(node, params.kind === 'bigScare'
        ? NodeType.BIG_SCARE : NodeType.SCUFFLE, { navigate: false });
    }
    this.reward = reward;
    this.picked = reward.taken?.length ? reward.taken[0] : null;
    this.resolved = !!this.picked;

    const big = reward.kind === 'bigScare' || reward.kind === 'boss';
    this._shell({
      eyebrow: reward.kind === 'boss' ? 'The way onward is open'
        : big ? `${TERMS.elite} cleared` : 'Room cleared',
      title: reward.kind === 'treasure' ? 'Something Left Behind'
        : reward.kind === 'boss' ? 'The Keeper Is Down'
          : big ? 'You Were Not Ready For That' : 'Nothing Left Standing',
      sub: reward.encounter ? `${reward.encounter}` : '',
    });

    this._buildSpoils();
    await this._buildCards();
    this._buildFoot();
    this._bindKeys();
    bus.emit('reward:ready', { kind: reward.kind, cards: reward.cards.length });
  }

  /* ── the spoils, stated before you choose ─────────────────────────────── */
  _buildSpoils() {
    const r = this.reward;
    const k = r.keepsake ? relicById(r.keepsake) : null;
    const wrap = el('section', 'rw-spoils');
    wrap.setAttribute('aria-label', 'What this room gave you');
    wrap.innerHTML = `
      <div class="rw-spoils__row">
        ${chip('gold', TERMS.gold, `+${r.lostThings}`)}
        ${r.clues ? chip('clue', word(r.clues, 'Clue'), `+${r.clues}`) : ''}
        ${chip('luck', 'Luck', `+${this.run.flags.luck}`,
    'Raises the chance a Rare Trick appears in a reward. Skipping a reward raises it further.')}
      </div>
      ${k ? `
      <div class="rw-keepsake" data-rarity="${esc(k.rarity)}">
        <span class="rw-keepsake__sig"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${relicSigil(k.id)}"/></svg></span>
        <div>
          <span class="rw-keepsake__k">${esc(TERMS.relic)} &middot; ${esc(k.rarity)}</span>
          <b>${esc(k.name)}</b>
          <em>${esc(k.desc)}</em>
          ${k.flavor ? `<i>${esc(k.flavor)}</i>` : ''}
        </div>
      </div>` : ''}`;
    this.$body.appendChild(wrap);
  }

  /* ── three Tricks, take one or skip ───────────────────────────────────── */
  async _buildCards() {
    const r = this.reward;
    if (!r.cards.length) return;
    const { CardView } = await import('../ui/card.js');
    if (this._dead) return;

    const sec = el('section', 'rw-cards');
    sec.innerHTML = `
      <div class="rw-cards__head">
        <h2>Choose one ${esc(TERMS.card)}</h2>
        <p>Or take none — and be luckier next time.</p>
      </div>
      <div class="rw-fan" role="listbox" aria-label="Three ${esc(TERMS.card)}s. Choose one, or skip."></div>`;
    this.$body.appendChild(sec);
    const fan = sec.querySelector('.rw-fan');
    this.$fan = fan;
    this._slots = [];

    r.cards.forEach((c, i) => {
      const def = cardById(c.id);
      if (!def) return;
      const slot = el('div', 'rw-slot');
      slot.setAttribute('role', 'option');
      slot.setAttribute('aria-selected', 'false');
      slot.tabIndex = 0;
      slot.dataset.cardId = c.id;
      const off = i - (r.cards.length - 1) / 2;
      slot.style.setProperty('--i', String(off));
      slot.style.setProperty('--ia', String(Math.abs(off)));
      const view = new CardView(def, {
        uid: `rw-${c.id}`, largeText: this.largeText, reduceMotion: this.reduceMotion,
      });
      slot.appendChild(view.el);
      const tag = el('span', 'rw-slot__rarity', esc(def.rarity));
      tag.dataset.rarity = def.rarity;
      slot.appendChild(tag);
      fan.appendChild(slot);
      this._views.push(view);
      this._slots.push({ slot, view, def });

      slot.addEventListener('click', () => this._take(c.id));
      slot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._take(c.id); }
      });
      slot.addEventListener('pointerenter', () => slot.classList.add('is-hot'));
      slot.addEventListener('pointerleave', () => slot.classList.remove('is-hot'));
      slot.addEventListener('focus', () => slot.classList.add('is-hot'));
      slot.addEventListener('blur', () => slot.classList.remove('is-hot'));
    });

    this._own(rovingFocus(fan, '.rw-slot', { cols: Math.max(1, r.cards.length) }));
    this._layout();
    const onResize = () => this._layout();
    window.addEventListener('resize', onResize);
    this._own(() => window.removeEventListener('resize', onResize));

    if (this.resolved) this._markTaken(this.picked, false);
    else requestAnimationFrame(() => this._slots[0]?.slot.focus());
  }

  _layout() {
    for (const { slot, view } of this._slots || []) fitCardToSlot(view, slot);
  }

  /* ── footer: skip, and the way out ────────────────────────────────────── */
  _buildFoot() {
    const r = this.reward;
    if (r.cards.length) {
      const skip = el('button', 'rm-btn rm-btn--ghost rw-skip');
      skip.type = 'button';
      skip.innerHTML = `<span>Take none</span><em>+12 ${esc(TERMS.gold)} &middot; Luck +2</em><kbd>S</kbd>`;
      skip.addEventListener('click', () => this._skip());
      this.$foot.appendChild(skip);
      this.$skip = skip;
    }
    this._primary(r.cards.length ? 'Leave the room' : 'Take it and go',
      () => this._finish(), { hint: this._footHint() });
    this._syncFoot();
  }

  _footHint() {
    if (!this.reward.cards.length) return '';
    return this.resolved ? '' : 'you have not chosen a Trick';
  }

  _syncFoot() {
    if (!this.$go) return;
    this.$go.classList.toggle('is-ready', this.resolved || !this.reward.cards.length);
    const hint = this.$go.querySelector('em');
    if (hint) hint.textContent = this._footHint();
    if (this.$skip) this.$skip.disabled = this.resolved;
  }

  /* ── actions ──────────────────────────────────────────────────────────── */
  _take(cardId) {
    if (this.resolved) return;
    this.run.takeRewardCard?.(cardId);
    this.picked = cardId;
    this.resolved = true;
    this.ctx.audio?.play?.('card:pick');
    this._markTaken(cardId, true);
    this._syncFoot();
    this._syncHud();
    this._say(`${cardById(cardId)?.name} added to your ${TERMS.deck}.`);
  }

  _markTaken(cardId, animate) {
    for (const { slot, view } of this._slots || []) {
      const mine = slot.dataset.cardId === cardId;
      slot.classList.toggle('is-taken', mine);
      slot.classList.toggle('is-gone', !mine);
      slot.setAttribute('aria-selected', String(mine));
      slot.tabIndex = -1;
      if (!animate) continue;
      if (mine) view.flash?.(0.8, 0.22);
      else if (!this.reduceMotion) view.dissolve?.(0.4);
    }
    this.$fan?.classList.add('is-resolved');
    this.$go?.focus();
  }

  _skip() {
    if (this.resolved) return;
    this.run.skipRewardCards?.();
    this.resolved = true;
    this.ctx.audio?.play?.('ui:back');
    for (const { slot, view } of this._slots || []) {
      slot.classList.add('is-gone');
      slot.tabIndex = -1;
      if (!this.reduceMotion) view.dissolve?.(0.45);
    }
    this.$fan?.classList.add('is-resolved');
    this._syncFoot();
    this._syncHud();
    this._say(`Nothing taken. Luck is up, and you are 12 ${TERMS.gold} better off.`);
    this.$go?.focus();
  }

  _say(text) {
    let live = this.root.querySelector('.rm-live');
    if (!live) {
      live = el('p', 'rm-live');
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      this.$body.appendChild(live);
    }
    live.textContent = text;
  }

  /**
   * Take the spoils.
   *
   * In a party the room stays open until every Kid has taken theirs — the
   * offers were all rolled when the fight ended, and one Kid leaving with the
   * Lost Things would strand the other's three Tricks.
   */
  async _finish() {
    if (this._leaving) return;
    const run = this.run;
    const next = this._seatStillOwed(k => k !== run.local && !!k.pendingReward);
    if (next >= 0) {
      this._leaving = true;                 // no double-claim while the veil is up
      run.claimReward({ close: false });
      const done = await this._passRoomTo(next, 'Your spoils.', 'Take a Trick, or take none.');
      if (done) return;                     // the room is theirs now
      this._leaving = false;
    }
    this._leaving = true;
    this.run.claimReward ? this.run.claimReward() : this._leave();
    if (this.mock) this.ctx.scenes?.go?.('map', { region: this.run.region, seed: this.run.seed });
  }

  _bindKeys() {
    const onKey = (e) => {
      if (e.defaultPrevented || this.root.querySelector('.rm-picker')) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); this._skip(); }
      else if (e.key === 'Enter' && (this.resolved || !this.reward.cards.length)
               && document.activeElement !== this.$skip) { e.preventDefault(); this._finish(); }
      else if (e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1;
        const s = this._slots?.[i];
        if (s) { e.preventDefault(); s.slot.focus(); }
      }
    };
    this._on(window, 'keydown', onKey);
  }
}

export default RewardScene;
