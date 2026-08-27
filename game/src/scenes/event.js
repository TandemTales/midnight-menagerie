/**
 * A Curiosity.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §26.  Question-mark rooms are
 * strange discoveries that lean into the missing-animal mystery — Scratching
 * Behind the Wall, The Collar, The Feeding Room, The Photograph.
 *
 * The screen is prose, and only prose.  The authored text set like a printed
 * page, and then the options as full-width doors, each one naming
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
import { satisfyingItem, itemsSatisfying } from '../data/backpack.js';
import { RoomScene, esc, chip } from './reward.js';
import {
  el, ensureCss, rovingFocus, fullSrc, thumbSrc, freedCompanions,
  PORTRAIT_W, PORTRAIT_H,
} from '../ui/portrait.js';
import { word } from '../util/plural.js';

const CSS_EVENT = new URL('./event.css', import.meta.url).href;

/* ── mood ──────────────────────────────────────────────────────────────────
   Every Curiosity in data/events.js declares a `mood`. Round 3 turned it into a
   parametric cyan wireframe of a room — an arch, two rectangles, a glyph —
   pinned beside the best writing in the build, where it read as placeholder art
   and cheapened the prose. The drawing is gone; the mood survives as the ground
   temperature of the page, keyed in event.css off `.ev-page[data-mood]`.

   Authored moods: listen · sad · unsettling · revelation · investigation ·
   mischief · warm · curious · trade · greedy · escape                        */

/**
 * Swap a companion's `-card` thumbnail for the full 828x516 painting once it has
 * decoded, so the Rescue plate is never a grey box and never a soft upscale.
 * Returns a disposer — if the scene leaves mid-download nothing touches the DOM.
 */
function upgradeToFullArt(img, slug) {
  if (!img) return () => {};
  let live = true;
  const full = new Image();
  full.decoding = 'async';
  full.addEventListener('load', () => {
    if (!live) return;
    img.src = full.src;
    img.classList.add('is-full');
  }, { once: true });
  full.src = fullSrc(slug);
  return () => { live = false; };
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
    // THIS Kid's answer. The Curiosity is the same room for both of them and
    // each one answers it for themselves, so seat 1 walking in must see the
    // options rather than seat 0's outcome.
    const mine = r.eventAnswerFor ? r.eventAnswerFor() : (r.pendingEvent?.resolved
      ? { resolved: r.pendingEvent.resolved, pending: r.pendingEvent.pending } : null);
    if (mine) this._showOutcome(mine.resolved, mine.pending, false);
    bus.emit('event:ready', { id: this.def.id });
  }

  /* ── the page ─────────────────────────────────────────────────────────── */
  _buildPage() {
    const d = this.def;
    const page = el('article', 'ev-page');
    page.dataset.mood = d.mood || 'curious';
    /* No illustration. The Curiosities are the best writing in the build and the
       parametric line-art beside them — an arch and two rectangles in cyan —
       was actively cheapening it; a wireframe of a room is worse than no room.
       So this is a printed page instead: one measure, a drop cap, a rule, and
       the room's own name as its slug. The mood still colours the ground, so a
       Curiosity still arrives with a temperature. */
    page.innerHTML = `
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
      /* An option with one authored outcome is a PRICE; an option with several
         is a BET. Labelling both "risk / gain" made every Curiosity look like a
         coin flip, including the ones that are not. The stake itself is named
         either way — see the vocabulary note in data/events.js. */
      const certain = (o.outcomes || []).length <= 1;
      const nothing = /^(none|nothing)$/i.test(String(o.risk || '').trim());
      b.innerHTML = `
        <span class="ev-opt__label">${esc(o.label)}</span>
        <span class="ev-opt__meta">
          ${o.risk && !(certain && nothing)
    ? `<span class="ev-tag ev-tag--risk"><i>${certain ? 'costs' : 'risk'}</i>${esc(o.risk)}</span>` : ''}
          ${o.reward ? `<span class="ev-tag ev-tag--gain"><i>${certain ? 'always' : 'gain'}</i>${esc(o.reward)}</span>` : ''}
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

  /**
   * Say exactly what would have opened this door.
   *
   * `requires` may be a tag (`'canine'`, `'pry'`) rather than an item id, and
   * `itemById` alone returns nothing for those — so the gate used to read "you
   * would need something with a blade" with no hint as to what that is.
   * `itemsSatisfying` answers for both, which is the whole point of a locked
   * option: it teaches you what to pack next time.
   */
  _gateLine(o) {
    if (!o.gateText) return 'You did not bring what this needs.';
    const items = itemsSatisfying(o.requires);
    if (!items.length) return o.gateText;
    const names = items.slice(0, 3).map(i => i.name);
    const more = items.length > names.length ? `, or ${items.length - names.length} more` : '';
    return `${o.gateText} (${names.join(' or ')}${more})`;
  }

  /* ── choosing ─────────────────────────────────────────────────────────── */
  _choose(o) {
    if (this._answered) return;
    const res = this.run.chooseEventOption(o.id);
    if (!res) return;
    this._answered = true;
    this.ctx.audio?.play?.('ui:confirm');
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
      case 'clues': return chip('clue', word(g.n, 'Clue'), `+${g.n}`);
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

    // A Curiosity is answered by each Kid; a Rescue is one pet.
    this._leaveRoom({ perKid: !this.rescue });
  }

  /* ── a Companion rescue ───────────────────────────────────────────────────
     The premise of the whole game, so it does not get the parametric wireframe
     the Curiosities use.  The painted portrait of *this* animal is on screen
     from the first frame, behind a shut door; the one button parts the door and
     the light comes up on them.  The art was always in the assets folder — this
     screen is the reason it exists.                                          */
  _enterRescue() {
    const slug = this.run.pendingEvent?.companion || this.run.meta.companion;
    const c = COMPANIONS.find(x => x.slug === slug);
    const already = this.run.rescued.includes(slug);
    const name = c?.name || 'Somebody';

    this._shell({
      eyebrow: 'Rescue',
      title: already ? 'Somebody Has Been Here' : `${name} Is In Here`,
      sub: c ? c.title : '',
    });
    // Warm key light instead of the Curiosity's cold spectral one: this is the
    // one room in the mansion where the candle wins.
    this.root.querySelector('.rm').classList.add('is-rescue');

    const page = el('article', 'ev-page ev-page--rescue');
    page.innerHTML = `
      <figure class="ev-rsplate${already ? ' is-empty is-open' : ''}">
        <div class="ev-rsroom" aria-hidden="true"></div>
        ${already ? '' : `<img class="ev-rsart" src="${esc(thumbSrc(slug, '-card'))}"
              width="${PORTRAIT_W}" height="${PORTRAIT_H}" decoding="async" draggable="false"
              alt="${esc(name)}, ${esc(c?.title || 'a Menagerie Companion')}">`}
        <div class="ev-rsglow" aria-hidden="true"></div>
        <div class="ev-rsdust" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="ev-rsdoors" aria-hidden="true">
          <i class="ev-rsdoor ev-rsdoor--l"></i><i class="ev-rsdoor ev-rsdoor--r"></i>
          <b class="ev-rsseam"></b>
        </div>
        <div class="ev-rsframe" aria-hidden="true"></div>
        <figcaption class="ev-rscap">
          <b>${esc(name)}</b>
          <span>${esc(c?.title || '')}</span>
          <em class="ev-rscap__state" data-state>${already ? 'the room is empty' : 'behind the door'}</em>
        </figcaption>
      </figure>
      <div class="ev-prose">
        <p>${already
    ? 'The door is already open and the room is already empty, and there is a small tidy pile in the corner of things somebody decided not to take with them.'
    : `The door is wedged from the outside with a chair, which tells you everything about who put it there. ${esc(name)} has been in this room a long time — long enough to have arranged it, long enough to have stopped expecting the door to open.`}</p>
        <p>${already
    ? 'You leave the door open anyway.'
    : 'You move the chair. It takes both hands and it is the easiest thing you have done all night.'}</p>
      </div>
      <div class="ev-options" role="group" aria-label="What do you do?"></div>
      <div class="ev-outcome" hidden aria-live="polite"></div>`;
    this.$body.appendChild(page);
    this.$page = page;
    this.$plate = page.querySelector('.ev-rsplate');
    this.$options = page.querySelector('.ev-options');
    this.$outcome = page.querySelector('.ev-outcome');

    // The full 828x516 painting is 550KB; the -card thumbnail is what shows
    // first so the screen is never a grey box, and the full render swaps in
    // underneath the moment it has decoded.
    if (!already) this._own(upgradeToFullArt(page.querySelector('.ev-rsart'), slug));

    const b = el('button', 'ev-opt ev-opt--door');
    b.type = 'button';
    b.dataset.opt = 'free';
    b.innerHTML = `<span class="ev-opt__label">${already ? 'Take what they left.' : 'Open the door.'}</span>
      <span class="ev-opt__meta">
        <span class="ev-tag ev-tag--gain"><i>always</i>${already ? `${TERMS.gold} and a Clue` : 'A Companion goes free'}</span>
      </span>`;
    b.addEventListener('click', async () => {
      if (this._answered || this._opening) return;
      if (already) {
        this.run.addLostThings(60);
        this.run.addClues(1);
        this._showOutcome({ option: 'free', title: 'A tidy pile', text: 'Buttons, a bent spoon, a photograph of a door. Somebody meant these to be found.' },
          { gained: [{ kind: 'lostThings', n: 60 }, { kind: 'clues', n: 1 }] }, true);
        this._syncHud();
        return;
      }
      this._opening = true;
      b.disabled = true;
      this.run.rescueCompanion(slug);
      this._openDoor(name);
      // The door opens, and *then* Marmalade walks out. Landing both in the same
      // frame threw away the beat the writing is built on.
      await this._wait(0.7);
      if (this._dead) return;
      this._showOutcome({
        option: 'free', title: `${name}, come out`,
        text: `${name} does not run. ${name} walks out slowly, looks both ways down the corridor like somebody checking a road, and then sits down next to your Companion as though they have been introduced. You will see them again at the clubhouse.`,
      }, { gained: [{ kind: 'clues', n: 2 }] }, true);
      this._syncHud();
    });
    this.$options.appendChild(b);
    this._own(rovingFocus(this.$options, '.ev-opt', { cols: 0 }));
    this._buildFoot();
    this._bindKeys();
    requestAnimationFrame(() => b.focus());
  }

  /**
   * The reveal.  Everything moved here is a transform or an opacity on a
   * composited layer, so the door opening costs nothing per frame; the timings
   * come from the motion tokens and therefore collapse to nothing under
   * `reduceMotion`, which lands the screen straight on the open state.
   */
  _openDoor(name) {
    const plate = this.$plate;
    if (!plate || plate.classList.contains('is-open')) return;
    plate.classList.add('is-open');
    this.ctx.audio?.play?.('ui:confirm');
    /* `run.rescued` has to be passed in: the meta save only learns about a
       rescue when the expedition ends, so mid-run `freedCompanions()` alone
       would still be counting the one that just walked out of the door. */
    const freed = freedCompanions(this.run.rescued).size;
    const state = plate.querySelector('[data-state]');
    if (state) {
      state.textContent = `free · ${freed} of ${COMPANIONS.length}`;
      state.classList.add('is-free');
    }
    // Say it once, out loud, for a screen reader: the picture is the whole point
    // and a screen reader cannot see it open.
    plate.querySelector('.ev-rscap')?.setAttribute('aria-label', `${name} is free.`);
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
