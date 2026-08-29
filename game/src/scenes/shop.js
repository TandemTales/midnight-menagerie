/**
 * Mr. Moth's — the Lost Things market.  OWNER: meta-run.
 *
 * Design source: docs/design/00-core-overview.md §25.  The mansion is full of
 * buttons, coins, keys, marbles and charms dropped by a hundred years of
 * occupants, and Mr. Moth considers them incredibly valuable.
 *
 * Four counters, all seeded per node so the stock is the same every time you
 * walk back in:
 *
 *   Tricks       five real CardViews with prices under them
 *   Keepsakes    three, at their rarity's price
 *   Snacks       three consumables
 *   Forgetting   the removal service — and its price goes up every time you
 *                use it, which is the whole tension of the counter
 *
 * Affordability is unmistakable at a glance: an item you cannot pay for is
 * desaturated, its price is struck through in the threat colour, and its
 * button says how short you are.  You never have to do the subtraction.
 */
import { bus } from '../core/bus.js';
import { TERMS, NodeType } from '../data/schema.js';
import { cardById } from '../data/cards.js';
import { word } from '../util/plural.js';
import { relicById, relicSigil } from '../data/relics.js';
import { RoomScene, esc } from './reward.js';
import { act, ACT, deckIndex } from '../net/actions.js';
import { INPUT } from '../net/session.js';
import { el, ensureCss, rovingFocus } from '../ui/portrait.js';
import { iconSvg } from '../ui/icons.js';
import { fitCardToSlot } from './_cardfit.js';

const CSS_SHOP = new URL('./shop.css', import.meta.url).href;

/** Mr. Moth says something when you arrive, when you buy, and when you leave. */
const GREETING = [
  'Buttons, keys, marbles, teeth. I take all of it. Look around.',
  'You have found things. I have found things. This is the basis of a relationship.',
  'Everything here was dropped by somebody who is not coming back for it.',
  'No haggling. I do not understand haggling. I understand swapping.',
];
const ON_BUY = [
  'A fine choice. Nobody has wanted that in sixty years.',
  'Yes. Yes. Take it away from me.',
  'It has been waiting. I told it somebody would come.',
  'Do not tell the others what you paid.',
];
const ON_BROKE = [
  'You are short. I can see the exact amount you are short. It is not personal.',
  'Come back with more buttons.',
];

/**
 * Mr. Moth himself: a tall stooped thing in a too-long coat with moth wings
 * folded down its back, holding the lamp that keeps the market findable.
 * Pure SVG, every colour a token, so it costs nothing and never 404s.
 */
const MOTH_SVG = `
<svg class="sh-moth" viewBox="0 0 260 300" role="img" aria-label="Mr. Moth, behind his counter">
  <defs>
    <radialGradient id="shLamp" cx="50%" cy="50%">
      <stop offset="0%"  class="sh-lamp-a"/><stop offset="100%" class="sh-lamp-b"/>
    </radialGradient>
  </defs>
  <ellipse class="sh-moth__glow" cx="196" cy="176" rx="88" ry="86" fill="url(#shLamp)"/>
  <!-- wings -->
  <path class="sh-moth__wing" d="M118 118c-46-16-82 6-92 44-6 24 6 48 26 54 28 8 56-16 66-46 5-16 6-36 0-52Z"/>
  <path class="sh-moth__wing" d="M138 118c46-16 82 6 92 44 6 24-6 48-26 54-28 8-56-16-66-46-5-16-6-36 0-52Z"/>
  <path class="sh-moth__wingline" d="M104 138c-30-4-56 12-64 40M152 138c30-4 56 12 64 40"/>
  <!-- coat -->
  <path class="sh-moth__coat" d="M128 92c22 0 38 12 42 30l16 122c1 8-4 14-12 14H82c-8 0-13-6-12-14l16-122c4-18 20-30 42-30Z"/>
  <path class="sh-moth__lapel" d="M128 100 108 132l20 20 20-20Z"/>
  <path class="sh-moth__btn" d="M128 168h.01M128 190h.01M128 212h.01"/>
  <!-- head -->
  <ellipse class="sh-moth__head" cx="128" cy="72" rx="30" ry="27"/>
  <path class="sh-moth__ant" d="M112 50C104 30 88 22 74 24M144 50c8-20 24-28 38-26"/>
  <path class="sh-moth__eye" d="M116 70a6 7 0 1 0 .01 0M140 70a6 7 0 1 0 .01 0"/>
  <path class="sh-moth__fluff" d="M100 90c8 8 20 12 28 12s20-4 28-12"/>
  <!-- lamp -->
  <path class="sh-moth__arm" d="M170 132c14 4 22 14 24 26"/>
  <path class="sh-moth__lamp" d="M186 158h20l4 30h-28ZM196 148v10M188 188h16l3 10h-22Z"/>
  <!-- counter -->
  <path class="sh-moth__counter" d="M14 246h232l8 22H6Z"/>
  <path class="sh-moth__counterline" d="M22 256h216"/>
</svg>`;

export class ShopScene extends RoomScene {
  constructor(ctx) { super(ctx, { kind: 'shop' }); }

  async enter(params = {}) {
    await this._boot(params, NodeType.SHOP);
    if (this._dead) return;
    await ensureCss(CSS_SHOP);
    if (this._dead) return;

    if (!this.run.pendingShop && this.run.currentNode) this.run._prepareShop(this.run.currentNode);
    // Both default to the LOCAL Kid: the shelf is theirs, rolled off their
    // Companion and their Keepsakes, and so is the record of what they have
    // already bought off it. `shopSold` is a documented Run API — no `?.` on
    // it (CONTRACTS rule 8); if it ever goes missing that must be a loud
    // TypeError here rather than a shop that silently forgets every purchase.
    this.stock = this.run.shopStock();
    this.sold = new Set(this.run.shopSold());

    const g = this.run.fork(`shopline:${this.stock.nodeId}`);
    this._greeting = GREETING[g.int(GREETING.length)];
    this._shell({
      eyebrow: TERMS.shop,
      title: 'The Midnight Market',
      sub: 'Buttons, keys, marbles, teeth. He considers them incredibly valuable.',
    });

    await this._buildCounters();
    this._buildFoot();
    this._bindKeys();
    bus.emit('shop:ready', { node: this.stock.nodeId });
  }

  /* ── counters ─────────────────────────────────────────────────────────── */
  async _buildCounters() {
    const { CardView } = await import('../ui/card.js');
    if (this._dead) return;

    const wrap = el('div', 'sh-floor');
    wrap.innerHTML = `
      <div class="sh-left">
        <section class="sh-counter sh-counter--cards" aria-label="${esc(TERMS.card)}s for sale">
          <h2 class="sh-h">${esc(TERMS.deck)} <em>on the table</em></h2>
          <div class="sh-cards" role="list"></div>
        </section>
        <section class="sh-counter sh-counter--moth">
          ${MOTH_SVG}
          <div class="sh-moth__say">
            <p class="sh-moth__name">Mr. Moth</p>
            <p class="sh-moth__line">&ldquo;${esc(this._greeting)}&rdquo;</p>
            <!-- Live, not a snapshot: this panel is the only place in the shop
                 that says what you already have, and it used to be written once
                 at build time — so after buying two Snacks the HUD read 2 and
                 the counter underneath still read SNACKS 0/3. -->
            <dl class="sh-moth__you">
              <div><dt>${esc(TERMS.deck)}</dt><dd><button type="button" class="sh-deck"
                data-tip-title="Your ${esc(TERMS.deck)}"
                data-tip="Look through every ${esc(TERMS.card)} you own before you spend anything."
                data-inv="deck"></button></dd></div>
              <div><dt data-invlabel="keeps"></dt><dd data-inv="keeps"></dd></div>
              <div><dt>${esc(TERMS.potion)}s</dt><dd data-inv="snacks"></dd></div>
              <div><dt data-invlabel="clues"></dt><dd data-inv="clues"></dd></div>
            </dl>
          </div>
          <div class="sh-service" aria-label="Removal service">
            <h3 class="sh-h">Forgetting <em>a service</em></h3>
            <div class="sh-remove"></div>
          </div>
        </section>
      </div>
      <div class="sh-side">
        <section class="sh-counter" aria-label="${esc(TERMS.relic)}s for sale">
          <h2 class="sh-h">${esc(TERMS.relic)}s <em>under the glass</em></h2>
          <div class="sh-list sh-list--keeps" role="list"></div>
        </section>
        <section class="sh-counter" aria-label="${esc(TERMS.potion)}s for sale">
          <h2 class="sh-h">${esc(TERMS.potion)}s <em>in the jar</em></h2>
          <div class="sh-list sh-list--snacks" role="list"></div>
        </section>
      </div>`;
    this.$body.appendChild(wrap);

    this.$cards = wrap.querySelector('.sh-cards');
    this.$keeps = wrap.querySelector('.sh-list--keeps');
    this.$snacks = wrap.querySelector('.sh-list--snacks');
    this.$remove = wrap.querySelector('.sh-remove');
    this._cardSlots = [];

    // ── Tricks ──────────────────────────────────────────────────────────────
    for (const item of this.stock.cards) {
      const def = cardById(item.id);
      if (!def) continue;
      const key = `card:${item.id}`;
      const slot = el('div', 'sh-card');
      slot.setAttribute('role', 'listitem');
      slot.dataset.key = key;
      const view = new CardView(def, {
        uid: `sh-${item.id}`, largeText: this.largeText, reduceMotion: this.reduceMotion,
      });
      const face = el('div', 'sh-card__face');
      face.appendChild(view.el);
      slot.appendChild(face);
      // Owning one already is a *note*, not a lock — a second copy is often the play.
      if (item.owned) slot.appendChild(el('span', 'sh-card__own', 'already in your deck'));
      slot.appendChild(this._priceTag(item.price, key, `Buy ${def.name}`, async () => {
        if (!await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_BUY,
                                   kind: 'card', id: item.id, price: item.price, key })) return false;
        return `${def.name} is yours.`;
      }));
      this.$cards.appendChild(slot);
      this._views.push(view);
      this._cardSlots.push({ slot, view });
    }

    // ── Keepsakes ───────────────────────────────────────────────────────────
    for (const item of this.stock.keepsakes) {
      const def = relicById(item.id);
      if (!def) continue;
      const key = `keep:${item.id}`;
      const row = el('div', 'sh-row');
      row.setAttribute('role', 'listitem');
      row.dataset.key = key;
      row.innerHTML = `
        <span class="sh-row__sig" data-rarity="${esc(def.rarity)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${relicSigil(def.id)}"/></svg>
        </span>
        <span class="sh-row__txt">
          <b>${esc(def.name)}</b>
          <em>${esc(def.desc)}</em>
        </span>`;
      row.appendChild(this._priceTag(item.price, key, `Buy ${def.name}`, async () => {
        if (!await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_BUY,
                                   kind: 'keepsake', id: item.id, price: item.price, key })) return false;
        return `${def.name} goes in the bag.`;
      }));
      this.$keeps.appendChild(row);
    }

    // ── Snacks ──────────────────────────────────────────────────────────────
    for (const item of this.stock.snacks) {
      const key = `snack:${item.id}`;
      const row = el('div', 'sh-row sh-row--snack');
      row.setAttribute('role', 'listitem');
      row.dataset.key = key;
      row.innerHTML = `
        <span class="sh-row__sig sh-row__sig--snack" aria-hidden="true">
          <!-- the shared res.snack drawing, so a Snack looks the same here and in the HUD -->
          ${iconSvg('res.snack')}
        </span>
        <span class="sh-row__txt"><b>${esc(item.name)}</b><em>${esc(item.desc)}</em></span>`;
      // Fullness is recomputed in `_syncAffordable()`, not frozen here: buying
      // the last free slot has to lock the rows next to it immediately.
      const tag = this._priceTag(item.price, key, `Buy ${item.name}`, async () => {
        if (!await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_BUY,
                                   kind: 'snack', id: item.id, price: item.price, key })) return false;
        return `${item.name} in the pocket.`;
      });
      tag.dataset.kind = 'snack';
      row.appendChild(tag);
      this.$snacks.appendChild(row);
    }

    // You are buying Tricks. You can see the deck you are buying them for.
    this._on(wrap.querySelector('.sh-deck'), 'click', () => this.hud?.openDeck());

    this._renderRemoval();
    this._own(rovingFocus(wrap, '.sh-buy', { cols: 0 }));
    this._layout();
    const onResize = () => this._layout();
    window.addEventListener('resize', onResize);
    this._own(() => window.removeEventListener('resize', onResize));
    this._syncAffordable();
  }

  /**
   * The removal service.  Its price is on the run, not the stock, because it
   * rises across the whole expedition — that is the decision the counter asks.
   */
  _renderRemoval() {
    const price = this.run.removalPrice;
    const flat = this.run.flags.flatRemoval;
    const canRemove = (this.run.removableCards?.() || []).length > 0;
    this.$remove.innerHTML = `
      <p class="sh-remove__blurb">Hand over one ${esc(TERMS.card)} and he will keep it. You will not
        remember it. <b>${flat ? 'The price never moves.' : `Each one after this costs 25 more.`}</b></p>`;
    const key = 'removal';
    this.$remove.appendChild(this._priceTag(price, key, `Forget a ${TERMS.card}`, async () => {
      const cards = this.run.removableCards().map(c => ({ uid: c.uid, def: cardById(c.id), upgraded: c.upgraded }))
        .filter(c => c.def);
      const uid = await this.pickCard({
        title: `Which ${TERMS.card} would you rather not know?`,
        sub: `${price} ${TERMS.gold}. He will take it away and neither of you will bring it up again.`,
        cards, confirmLabel: 'Hand it over',
      });
      if (!uid) return false;
      // uid → index HERE, on the client that has the uid. A uid is not a
      // network identity (CONTRACTS trap 30) — `net/actions.js` says why.
      const i = deckIndex(this.run, this.run.localSeat, uid);
      if (i < 0) return false;
      const gone = await act(this.run, { t: INPUT.ROOM, act: ACT.SHOP_REMOVE, index: i });
      if (!gone) return false;
      this._renderRemoval();
      this._syncAffordable();
      return `${cardById(gone.id)?.name || 'It'} is gone.`;
    }, canRemove ? '' : 'Nothing you could spare.', { repeatable: true }));
  }

  /**
   * One purchasable. `onBuy` returns a message on success, or false.
   * Everything about affordability is expressed here so it is consistent.
   */
  _priceTag(price, key, label, onBuy, blockedReason = '', { repeatable = false } = {}) {
    const b = el('button', 'sh-buy');
    b.type = 'button';
    b.dataset.key = key;
    b.dataset.price = String(price);
    if (blockedReason) b.dataset.blocked = blockedReason;
    b.setAttribute('aria-label', `${label}, ${price} ${TERMS.gold}`);
    b.innerHTML = `
      <span class="sh-buy__price"><b>${price}</b><i>${esc(TERMS.gold)}</i></span>
      <span class="sh-buy__state"></span>`;
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      if (this.sold.has(key) && !repeatable) return;
      if (this.run.lostThings < price) { this._say(ON_BROKE[0], 'bad'); this._bump(b); return; }
      b.disabled = true;
      const msg = await onBuy();
      b.disabled = false;
      if (!msg) { this._bump(b); return; }
      if (!repeatable) this.sold.add(key);
      this.run.save?.();
      this.ctx.audio?.play?.('ui:confirm');
      const g = this.run.fork(`shopbuy:${key}`);
      this._say(`${msg} <i>&ldquo;${esc(ON_BUY[g.int(ON_BUY.length)])}&rdquo;</i>`, 'good');
      this._syncAffordable();
      this._syncHud();
    });
    return b;
  }

  _bump(b) {
    b.classList.remove('is-refused'); void b.offsetWidth; b.classList.add('is-refused');
  }

  /** What you are carrying, restated after every purchase. */
  _syncInventory() {
    const set = (k, v) => {
      const n = this.root?.querySelector(`[data-inv="${k}"]`);
      if (n) n.textContent = String(v);
    };
    const label = (k, v) => {
      const n = this.root?.querySelector(`[data-invlabel="${k}"]`);
      if (n) n.textContent = v;
    };
    const keeps = this.run.keepsakes.length;
    const clues = Number(this.run.cluesFound) || 0;
    set('deck', this.run.deck.length);
    set('keeps', keeps);
    set('snacks', `${this.run.snacks.length}/${this.run.snackCap}`);
    set('clues', clues);
    label('keeps', word(keeps, TERMS.relic));
    label('clues', word(clues, 'Clue'));
  }

  /** One pass over every purchasable: sold, unaffordable, or ready. */
  _syncAffordable() {
    const purse = this.run.lostThings;
    const pocketsFull = this.run.snacks.length >= this.run.snackCap;
    this._syncInventory();
    for (const b of this.root.querySelectorAll('.sh-buy')) {
      const price = Number(b.dataset.price);
      const key = b.dataset.key;
      const owner = b.closest('.sh-card, .sh-row, .sh-remove');
      const sold = this.sold.has(key);
      if (b.dataset.kind === 'snack') {
        if (pocketsFull) b.dataset.blocked = 'Your pockets are full.';
        else delete b.dataset.blocked;
      }
      const blocked = b.dataset.blocked || '';
      const short = purse - price;
      const state = b.querySelector('.sh-buy__state');

      b.classList.toggle('is-sold', sold);
      b.classList.toggle('is-poor', !sold && !blocked && short < 0);
      b.classList.toggle('is-blocked', !sold && !!blocked);
      b.disabled = sold || !!blocked;
      owner?.classList.toggle('is-sold', sold);
      owner?.classList.toggle('is-poor', !sold && !blocked && short < 0);

      if (sold) state.textContent = 'Taken';
      else if (blocked) state.textContent = blocked;
      else if (short < 0) state.textContent = `${-short} short`;
      else state.textContent = 'Buy';
    }
    // The removal price can move mid-visit.
    const rm = this.$remove?.querySelector('.sh-buy');
    if (rm) {
      rm.dataset.price = String(this.run.removalPrice);
      rm.querySelector('.sh-buy__price b').textContent = String(this.run.removalPrice);
    }
  }

  _layout() {
    for (const { slot, view } of this._cardSlots || []) {
      fitCardToSlot(view, slot.querySelector('.sh-card__face'));
    }
  }

  _say(html, tone = '') {
    if (!this.$line) {
      this.$line = el('p', 'sh-line');
      this.$line.setAttribute('role', 'status');
      this.$line.setAttribute('aria-live', 'polite');
      this.$foot.prepend(this.$line);
    }
    this.$line.className = `sh-line${tone ? ` is-${tone}` : ''}`;
    this.$line.innerHTML = html;
  }

  _buildFoot() {
    this._say('&nbsp;');
    // Escape belongs to Settings now, everywhere in a run — the HUD owns it.
    this._primary('Back to the blueprint', () => this._leaveRoom(), { key: 'Enter' });
    this.$go.classList.add('is-ready');
  }

  _bindKeys() {
    this._on(window, 'keydown', (e) => {
      if (e.defaultPrevented || this.root.querySelector('.rm-picker')) return;
      // Enter leaves, unless something that answers to Enter itself has focus.
      if (e.key === 'Enter' && !document.activeElement?.closest?.('.sh-buy, .sh-deck, .rm-go, .mm-hud')) {
        e.preventDefault(); this._leaveRoom();
      }
    });
  }
}

export default ShopScene;
