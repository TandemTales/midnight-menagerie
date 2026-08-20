/**
 * A Curiosity.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §26.  Question-mark rooms are
 * strange discoveries that lean into the missing-animal mystery — Scratching
 * Behind the Wall, The Collar, The Feeding Room, The Photograph.
 *
 * The screen is prose first.  A wide vignette of the room, the authored text
 * set like a page, and then the options as full-width doors, each one naming
 * its risk and its reward *before* you take it.  Options the Backpack does not
 * satisfy stay visible and locked, with the exact thing you would have needed —
 * that is what makes loadout choices feel real at the headquarters.
 *
 * Nothing here is a slot machine.  The outcome inside an option is authored and
 * weighted, rolled from the run's own seeded fork, so replaying the same seed
 * gives the same night.
 */
import { bus } from '../core/bus.js';
import { TERMS, NodeType, COMPANIONS } from '../data/schema.js';
import { cardById } from '../data/cards.js';
import { relicById, relicSigil } from '../data/relics.js';
import { satisfyingItem, itemById } from '../data/backpack.js';
import { RoomScene, esc, chip } from './reward.js';
import { el, ensureCss, rovingFocus } from '../ui/portrait.js';

const CSS_EVENT = new URL('./event.css', import.meta.url).href;

/* ── the vignette ──────────────────────────────────────────────────────────
   One parametric room band — back wall, a lit opening, a floor — with a large
   subject glyph chosen by the Curiosity's `mood`. Cheap, coherent, and every
   Curiosity looks like its own room.                                        */
const SUBJECT = {
  listen: `<path class="ev-sub" d="M150 96h100v128H150Z"/>
           <path class="ev-line" d="M150 128h100M150 160h100M150 192h100M200 96v128"/>
           <path class="ev-mark" d="M262 118c14 10 14 22 0 32m14-48c24 18 24 42 0 60"/>
           <path class="ev-mark" d="M126 140l-16-12m16 34h-20m20 26-16 12"/>`,
  sad: `<ellipse class="ev-sub" cx="200" cy="196" rx="58" ry="20"/>
        <path class="ev-line" d="M158 190c14-8 70-8 84 0"/>
        <path class="ev-mark" d="M200 214v18m0 22a10 10 0 1 1 0-.02"/>`,
  unsettling: `<path class="ev-sub" d="M96 200h56l-6 22H102ZM172 200h56l-6 22h-44ZM248 200h56l-6 22h-44Z
                 M134 168h48l-5 20h-38ZM210 168h48l-5 20h-38Z"/>
               <path class="ev-line" d="M104 208h44M180 208h44M256 208h44"/>`,
  revelation: `<path class="ev-sub" d="M132 92h136v112H132Z"/>
               <path class="ev-line" d="M144 176l32-40 26 26 20-18 34 32M172 122a10 10 0 1 1 0-.02"/>
               <path class="ev-mark" d="M212 176c0-12 8-20 16-20s16 8 16 20Zm10-22-3-9m14 8 4-9"/>`,
  investigation: `<path class="ev-sub" d="M120 96h140l20 18v112H120Z"/>
                  <path class="ev-line" d="M140 132h100M140 156h100M140 180h64"/>
                  <path class="ev-mark" d="M232 190a20 20 0 1 1 0-.02M248 206l18 18"/>`,
  mischief: `<path class="ev-line" d="M92 104h216"/>
             <path class="ev-sub" d="M118 104c0 34 12 54 12 96h-32c0-42 10-62 10-96Z
               M170 104c0 34 12 54 12 96h-32c0-42 10-62 10-96Z
               M222 104c0 34 12 54 12 96h-32c0-42 10-62 10-96Z
               M274 104c0 34 12 54 12 96h-32c0-42 10-62 10-96Z"/>
             <path class="ev-mark" d="M244 148a5 5 0 1 1 0-.02M244 170a5 5 0 1 1 0-.02"/>`,
  warm: `<path class="ev-sub" d="M92 226h60v-30h60v-30h60v-30h60v90Z"/>
         <path class="ev-line" d="M92 226h240M152 196h180M212 166h120M272 136h60"/>
         <path class="ev-mark" d="M186 196c0-16 9-26 20-26s20 10 20 26Zm11-27-4-13m22 12 6-13"/>`,
  curious: `<path class="ev-sub" d="M120 84h160v148H120Z"/>
            <path class="ev-line" d="M120 84v148"/>
            <path class="ev-mark" d="M186 232v-40h44v40Z"/>
            <path class="ev-glowbox" d="M188 230v-36h40v36Z"/>`,
  trade: `<path class="ev-sub" d="M108 176h184v14H108ZM126 190v42M274 190v42"/>
          <path class="ev-mark" d="M232 128h30l6 46h-42ZM247 116v12M228 174h38l4 12h-46Z"/>
          <path class="ev-line" d="M132 158c0-14 12-24 26-24s26 10 26 24Z"/>`,
  greedy: `<path class="ev-sub" d="M104 88h192v144H104Z"/>
           <path class="ev-line" d="M104 136h192M104 184h192M152 88v144M200 88v144M248 88v144"/>
           <path class="ev-mark" d="M118 112h20M166 160h20M262 208h20"/>`,
  escape: `<path class="ev-sub" d="M136 76h128v152H136Z"/>
           <path class="ev-glowbox" d="M144 84h112v136H144Z"/>
           <path class="ev-line" d="M200 84v136M144 152h112"/>
           <path class="ev-mark" d="M164 236a7 7 0 1 1 0-.02M186 244a7 7 0 1 1 0-.02M208 236a7 7 0 1 1 0-.02"/>`,
};
const DEFAULT_SUBJECT = SUBJECT.curious;

function vignette(mood) {
  return `
  <svg class="ev-art" viewBox="0 0 400 260" role="img" aria-hidden="true" data-mood="${esc(mood || 'curious')}">
    <defs>
      <radialGradient id="evPool" cx="50%" cy="70%">
        <stop offset="0%" class="ev-pool-a"/><stop offset="100%" class="ev-pool-b"/>
      </radialGradient>
    </defs>
    <rect class="ev-wall" x="0" y="0" width="400" height="228"/>
    <path class="ev-paper" d="M28 0v228M84 0v228M140 0v228M196 0v228M252 0v228M308 0v228M364 0v228"/>
    <ellipse cx="200" cy="212" rx="190" ry="62" fill="url(#evPool)"/>
    <g transform="translate(200 132) scale(1.14) translate(-200 -132)">
      ${SUBJECT[mood] || DEFAULT_SUBJECT}
    </g>
    <path class="ev-rail" d="M0 214h400"/>
    <path class="ev-skirt" d="M0 228h400v14H0Z"/>
    <path class="ev-floor" d="M0 244h400M0 254h400"/>
  </svg>`;
}

export class EventScene extends RoomScene {
  constructor(ctx) { super(ctx, { kind: 'event' }); }

  async enter(params = {}) {
    await this._boot(params, NodeType.CURIOSITY);
    if (this._dead) return;
    await ensureCss(CSS_EVENT);
    if (this._dead) return;

    const r = this.run;
    if (!r.pendingEvent && r.currentNode) r._prepareEvent?.(r.currentNode, r.effectiveType(r.currentNode));
    if (params.event && r.pendingEvent) r.pendingEvent.id = params.event;   // deep link: &event=the-collar

    this.rescue = !!r.pendingEvent?.rescue;
    this.def = this.rescue ? null : r.currentEvent();

    if (!this.def && !this.rescue) {
      // Should not happen, but a Curiosity node must never be an empty screen.
      r._prepareEvent?.(r.currentNode || r.map.nodes[0], NodeType.CURIOSITY);
      this.def = r.currentEvent();
    }

    if (this.rescue) return this._enterRescue();

    this._shell({
      eyebrow: TERMS.event,
      title: this.def.name,
      sub: this.def.room || '',
    });
    this._buildPage();
    this._buildFoot();
    this._bindKeys();

    // Resuming into an already-answered Curiosity: show what happened.
    if (r.pendingEvent?.resolved) this._showOutcome(r.pendingEvent.resolved, r.pendingEvent.pending, false);
    bus.emit('event:ready', { id: this.def.id });
  }

  /* ── the page ─────────────────────────────────────────────────────────── */
  _buildPage() {
    const d = this.def;
    const page = el('article', 'ev-page');
    page.innerHTML = `
      <div class="ev-plate">${vignette(d.mood)}</div>
      <div class="ev-prose">
        ${d.text.map(p => `<p>${esc(p)}</p>`).join('')}
      </div>
      <div class="ev-options" role="group" aria-label="What do you do?"></div>
      <div class="ev-outcome" hidden aria-live="polite"></div>`;
    this.$body.appendChild(page);
    this.$options = page.querySelector('.ev-options');
    this.$outcome = page.querySelector('.ev-outcome');
    this.$page = page;

    for (const o of d.options) {
      const open = this.run.optionOpen(o);
      const b = el('button', 'ev-opt');
      b.type = 'button';
      b.dataset.opt = o.id;
      b.disabled = !open;
      const gate = !open ? this._gateLine(o) : '';
      const held = open && o.requires ? satisfyingItem(this.run.backpack, o.requires) : null;
      const cost = o.cost?.lostThings;
      const poor = cost != null && this.run.lostThings < cost;
      if (poor) b.disabled = true;
      b.innerHTML = `
        <span class="ev-opt__label">${esc(o.label)}</span>
        <span class="ev-opt__meta">
          ${o.risk ? `<span class="ev-tag ev-tag--risk"><i>risk</i>${esc(o.risk)}</span>` : ''}
          ${o.reward ? `<span class="ev-tag ev-tag--gain"><i>gain</i>${esc(o.reward)}</span>` : ''}
          ${cost != null ? `<span class="ev-tag ev-tag--cost"><i>cost</i>${cost} ${esc(TERMS.gold)}</span>` : ''}
          ${held ? `<span class="ev-tag ev-tag--gear"><i>gear</i>${esc(held.name)}</span>` : ''}
        </span>
        ${gate ? `<span class="ev-opt__gate">${esc(gate)}</span>` : ''}
        ${poor ? `<span class="ev-opt__gate">You are ${cost - this.run.lostThings} ${esc(TERMS.gold)} short.</span>` : ''}`;
      b.addEventListener('click', () => this._choose(o));
      this.$options.appendChild(b);
    }
    this._own(rovingFocus(this.$options, '.ev-opt', { cols: 0 }));
    requestAnimationFrame(() => this.$options.querySelector('.ev-opt:not(:disabled)')?.focus());
  }

  /** Say exactly what would have opened this door. */
  _gateLine(o) {
    if (o.gateText) {
      const names = (Array.isArray(o.requires) ? o.requires : [o.requires])
        .map(k => itemById(k)?.name).filter(Boolean);
      return names.length ? `${o.gateText} (${names.join(' or ')})` : o.gateText;
    }
    return 'You did not bring what this needs.';
  }

  /* ── choosing ─────────────────────────────────────────────────────────── */
  _choose(o) {
    if (this._answered) return;
    const res = this.run.chooseEventOption(o.id);
    if (!res) return;
    this._answered = true;
    this.ctx.audio?.play?.('ui/confirm');
    this._showOutcome({ option: o.id, ...res.outcome }, res.pending, true);
    this._syncHud();
  }

  _showOutcome(outcome, pending, animate) {
    this._answered = true;
    this.pending = pending || {};
    for (const b of this.$options.querySelectorAll('.ev-opt')) {
      b.disabled = true;
      b.classList.toggle('is-chosen', b.dataset.opt === outcome.option);
      b.classList.toggle('is-faded', b.dataset.opt !== outcome.option);
    }
    const gained = (pending?.gained || []).map(g => this._gainChip(g)).join('');
    this.$outcome.hidden = false;
    this.$outcome.innerHTML = `
      ${outcome.title ? `<h2 class="ev-out__t">${esc(outcome.title)}</h2>` : ''}
      <p class="ev-out__p">${esc(outcome.text || '')}</p>
      ${gained ? `<div class="ev-out__chips">${gained}</div>` : ''}
      ${this._pendingLine()}`;
    if (animate && !this.reduceMotion) {
      this.$outcome.classList.remove('is-in'); void this.$outcome.offsetWidth;
      this.$outcome.classList.add('is-in');
    }
    this.$page.classList.add('is-answered');
    this._syncFoot();
    this.$go?.focus();
  }

  _pendingLine() {
    const p = this.pending || {};
    if (p.combat) return `<p class="ev-out__next">Something in the room has decided against you.</p>`;
    if (p.removeCard) return `<p class="ev-out__next">You will have to choose what to give up.</p>`;
    if (p.upgradeCard) return `<p class="ev-out__next">Choose what gets mended.</p>`;
    return '';
  }

  _gainChip(g) {
    switch (g.kind) {
      case 'hp': return chip(g.n < 0 ? 'cost' : 'hp', TERMS.hp, `${g.n > 0 ? '+' : ''}${g.n}`);
      case 'heal': return chip('hp', TERMS.hp, `+${g.n}`);
      case 'maxHp': return chip(g.n < 0 ? 'cost' : 'hp', `max ${TERMS.hp}`, `${g.n > 0 ? '+' : ''}${g.n}`);
      case 'lostThings': return chip('gold', TERMS.gold, `${g.n > 0 ? '+' : ''}${g.n}`);
      case 'clues': return chip('clue', g.n === 1 ? 'Clue' : 'Clues', `+${g.n}`);
      case 'snack': return chip('gold', TERMS.potion, esc(g.name));
      case 'keepsake': return chip('luck', TERMS.relic, esc(g.name));
      case 'card': return chip('luck', TERMS.card, esc(g.name));
      case 'curse': return chip('cost', 'Curse', esc(g.name));
      default: return '';
    }
  }

  /* ── the way out, including the two follow-ups ────────────────────────── */
  _buildFoot() {
    this._primary('Leave it be', () => this._continue(), { hint: 'you have not decided yet' });
    this._syncFoot();
  }

  _syncFoot() {
    if (!this.$go) return;
    const p = this.pending || {};
    const label = p.combat ? 'Face it'
      : p.removeCard ? `Choose a ${TERMS.card} to give up`
        : p.upgradeCard ? `Choose what gets mended`
          : this._answered ? 'Go on' : 'Leave it be';
    this.$go.querySelector('span').textContent = label;
    const hint = this.$go.querySelector('em');
    if (hint) hint.textContent = this._answered ? '' : 'you have not decided yet';
    this.$go.classList.toggle('is-ready', !!this._answered);
  }

  async _continue() {
    if (this._leaving) return;
    const p = this.pending || {};

    if (p.upgradeCard) {
      const cards = this.run.upgradeableCards().map(c => ({ uid: c.uid, def: cardById(c.id), upgraded: c.upgraded }))
        .filter(c => c.def);
      if (cards.length) {
        const uid = await this.pickCard({
          title: `What gets mended?`, sub: 'It comes back stronger and slightly wrong.',
          cards, preview: 'upgrade', confirmLabel: 'Mend it', allowCancel: false,
        });
        if (uid) this.run.upgradeCard(uid);
      }
      p.upgradeCard = Math.max(0, p.upgradeCard - 1);
      this._syncHud(); this._syncFoot();
      if (p.upgradeCard > 0) return;
    }

    if (p.removeCard) {
      const cards = this.run.removableCards().map(c => ({ uid: c.uid, def: cardById(c.id), upgraded: c.upgraded }))
        .filter(c => c.def);
      if (cards.length) {
        const uid = await this.pickCard({
          title: `Which ${TERMS.card} goes?`, sub: 'You will not remember it afterwards.',
          cards, confirmLabel: 'Let it go', allowCancel: false,
        });
        if (uid) this.run.removeCard(uid);
      }
      p.removeCard = Math.max(0, p.removeCard - 1);
      this._syncHud(); this._syncFoot();
      if (p.removeCard > 0) return;
    }

    if (p.combat) {
      this._leaving = true;
      const kind = p.combat;
      p.combat = null;
      if (this.mock) { this.ctx.scenes?.go?.('map', { region: this.run.region, seed: this.run.seed }); return; }
      await this.run.eventCombat?.(kind);
      return;
    }

    this._leaving = true;
    this._leave();
  }

  /* ── a Companion rescue ───────────────────────────────────────────────── */
  _enterRescue() {
    const slug = this.run.pendingEvent?.companion || this.run.meta.companion;
    const c = COMPANIONS.find(x => x.slug === slug);
    const already = this.run.rescued.includes(slug);
    this._shell({
      eyebrow: 'Rescue',
      title: already ? 'Somebody Has Been Here' : `${c?.name || 'Somebody'} Is In Here`,
      sub: c ? c.title : '',
    });
    const page = el('article', 'ev-page');
    page.innerHTML = `
      <div class="ev-plate">${vignette('warm')}</div>
      <div class="ev-prose">
        <p>${already
    ? 'The door is already open and the room is already empty, and there is a small tidy pile in the corner of things somebody decided not to take with them.'
    : `The door is wedged from the outside with a chair, which tells you everything about who put it there. ${esc(c?.name || 'They')} has been in this room a long time — long enough to have arranged it, long enough to have stopped expecting the door to open.`}</p>
        <p>${already
    ? 'You leave the door open anyway.'
    : 'You move the chair. It takes both hands and it is the easiest thing you have done all night.'}</p>
      </div>
      <div class="ev-options" role="group" aria-label="What do you do?"></div>
      <div class="ev-outcome" hidden aria-live="polite"></div>`;
    this.$body.appendChild(page);
    this.$page = page;
    this.$options = page.querySelector('.ev-options');
    this.$outcome = page.querySelector('.ev-outcome');

    const b = el('button', 'ev-opt');
    b.type = 'button';
    b.dataset.opt = 'free';
    b.innerHTML = `<span class="ev-opt__label">${already ? 'Take what they left.' : 'Open the door.'}</span>
      <span class="ev-opt__meta">
        <span class="ev-tag ev-tag--gain"><i>gain</i>${already ? `${TERMS.gold} and a Clue` : 'A Companion goes free'}</span>
      </span>`;
    b.addEventListener('click', () => {
      if (this._answered) return;
      if (already) {
        this.run.addLostThings(60);
        this.run.addClues(1);
        this._showOutcome({ option: 'free', title: 'A tidy pile', text: 'Buttons, a bent spoon, a photograph of a door. Somebody meant these to be found.' },
          { gained: [{ kind: 'lostThings', n: 60 }, { kind: 'clues', n: 1 }] }, true);
      } else {
        this.run.rescueCompanion(slug);
        this._showOutcome({
          option: 'free', title: `${c?.name || 'They'} come out`,
          text: `${c?.name || 'They'} does not run. ${c?.name || 'They'} walks out slowly, looks both ways down the corridor like somebody checking a road, and then sits down next to your Companion as though they have been introduced. You will see them again at the clubhouse.`,
        }, { gained: [{ kind: 'clues', n: 2 }] }, true);
      }
      this._syncHud();
    });
    this.$options.appendChild(b);
    this._own(rovingFocus(this.$options, '.ev-opt', { cols: 0 }));
    this._buildFoot();
    this._bindKeys();
    requestAnimationFrame(() => b.focus());
  }

  _bindKeys() {
    this._on(window, 'keydown', (e) => {
      if (e.defaultPrevented || this.root.querySelector('.rm-picker')) return;
      if (e.key === 'Enter' && this._answered && document.activeElement !== this.$go) {
        e.preventDefault(); this._continue(); return;
      }
      if (e.key >= '1' && e.key <= '9') {
        const list = [...this.$options.querySelectorAll('.ev-opt')];
        const b = list[Number(e.key) - 1];
        if (b && !b.disabled) { e.preventDefault(); b.focus(); }
      }
    });
  }
}

export default EventScene;
