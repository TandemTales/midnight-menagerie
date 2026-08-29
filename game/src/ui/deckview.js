/**
 * The pile viewer. OWNER: ui-chrome agent.
 *
 * One component serves every "show me the cards" moment: your deck, the draw
 * pile, the discard pile, the Vanished pile, and card-reward inspection.
 *
 *   import { DeckView, openPile } from './deckview.js';
 *
 *   await openPile({
 *     mode: 'draw',              // deck | draw | discard | exhaust | reward
 *     cards: engine.piles.draw,  // CardDefs, or {uid, def, upgraded, cost}
 *     ctx,                       // for the tooltip + Save
 *     onPick: (entry) => {},     // reward mode only
 *   });
 *
 * THE DRAW PILE IS SORTED, NOT ORDERED. Looking at it must be information, not
 * an oracle — you learn *what is left*, never *what is next*. combat.js already
 * sorts by name before handing the list over; this view sorts again anyway so
 * the guarantee does not depend on the caller.
 *
 * Keyboard: arrows walk the grid (real column count, not a guess), Home/End
 * jump, Enter picks in reward mode, Escape closes (Modal owns that), and the
 * sort/filter controls are ordinary form controls in the tab order.
 */

import { Modal } from './modal.js';
import { icon } from './icons.js';
import { plural, word } from '../util/plural.js';

const TYPES = ['attack', 'skill', 'power', 'status', 'curse'];
const RARITIES = ['basic', 'common', 'uncommon', 'rare'];

const MODES = {
  deck:    { title: 'Your Tricks',   note: '' },
  draw:    { title: 'Draw Pile',     note: 'Sorted alphabetically. The real order stays hidden — this tells you what is left, not what is next.' },
  discard: { title: 'Discard Pile',  note: 'These come back when the draw pile runs out.' },
  exhaust: { title: 'Vanished',      note: 'Out of this Scuffle. A few Tricks can reach in and pull one back.' },
  reward:  { title: 'Take a Trick',  note: 'Pick one, or skip.' },
};

/** Normalise whatever the caller passed into `{uid, def, upgraded, cost}`. */
function entryOf(c, i) {
  if (!c) return null;
  if (c.def) return { uid: c.uid ?? `e${i}`, def: c.def, upgraded: !!c.upgraded, cost: c.cost };
  return { uid: c.uid ?? `${c.id}#${i}`, def: c, upgraded: !!c.upgraded, cost: c.cost };
}

const COST_OF = (e) => (e.cost != null ? e.cost : e.def?.cost ?? 0);

const SORTS = {
  name:    (a, b) => (a.def.name || '').localeCompare(b.def.name || '') || COST_OF(a) - COST_OF(b),
  cost:    (a, b) => COST_OF(a) - COST_OF(b) || (a.def.name || '').localeCompare(b.def.name || ''),
  type:    (a, b) => TYPES.indexOf(a.def.type) - TYPES.indexOf(b.def.type) || SORTS.name(a, b),
  rarity:  (a, b) => RARITIES.indexOf(a.def.rarity) - RARITIES.indexOf(b.def.rarity) || SORTS.name(a, b),
};

export class DeckView {
  /**
   * @param {{mode?:string, cards?:Array, ctx?:object, onPick?:Function,
   *          title?:string, note?:string, pickLabel?:string}} o
   */
  constructor(o = {}) {
    this.o = o;
    this.ctx = o.ctx || {};
    this.mode = o.mode || 'deck';
    this.all = (o.cards || []).map(entryOf).filter(Boolean);
    this.views = new Map();          // uid -> CardView
    this.cells = [];
    this.focusIndex = 0;
    this.filters = { type: 'all', cost: 'all', rarity: 'all', upgraded: 'all', q: '' };
    this.sort = this.mode === 'draw' ? 'name' : (this.mode === 'reward' ? 'none' : 'name');
    this._offs = [];
    this._raf = 0;
    this._build();
  }

  // ── DOM ────────────────────────────────────────────────────────────────
  _build() {
    const m = MODES[this.mode] || MODES.deck;
    const root = document.createElement('div');
    root.className = 'mm-deck';
    root.dataset.mode = this.mode;

    const bar = document.createElement('div');
    bar.className = 'mm-deck__bar';

    // count
    const count = document.createElement('div');
    count.className = 'mm-deck__count';
    count.innerHTML = '<b></b> <span></span>';
    this.countN = count.querySelector('b');
    this.countL = count.querySelector('span');

    // search
    const search = document.createElement('label');
    search.className = 'mm-deck__search';
    search.innerHTML = '<span class="sr-only">Search Tricks</span>';
    search.prepend(icon('ui.search'));
    const input = document.createElement('input');
    input.type = 'search'; input.placeholder = 'Search…'; input.autocomplete = 'off';
    input.addEventListener('input', () => { this.filters.q = input.value.trim().toLowerCase(); this._apply(); });
    search.appendChild(input);

    bar.append(count, search);

    // filters
    const filt = document.createElement('div');
    filt.className = 'mm-deck__filters';
    filt.append(
      this._select('Type', 'type', [['all', 'All types'], ...TYPES.map(t => [t, cap(t)])]),
      this._select('Cost', 'cost', [['all', 'Any cost'], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4+', '4+'], ['x', 'X']]),
      this._select('Rarity', 'rarity', [['all', 'Any rarity'], ...RARITIES.map(r => [r, cap(r)])]),
      this._select('Upgraded', 'upgraded', [['all', 'Upgraded or not'], ['yes', 'Upgraded only'], ['no', 'Not upgraded']]),
    );

    const sortWrap = document.createElement('label');
    sortWrap.className = 'mm-deck__sortwrap';
    sortWrap.innerHTML = '<span class="mm-deck__label">Sort</span>';
    const sortSel = document.createElement('select');
    sortSel.className = 'mm-deck__select';
    for (const [v, l] of [['name', 'Name'], ['cost', 'Nerve cost'], ['type', 'Type'], ['rarity', 'Rarity']]) {
      const op = document.createElement('option'); op.value = v; op.textContent = l; sortSel.appendChild(op);
    }
    if (this.mode === 'reward') {
      const op = document.createElement('option'); op.value = 'none'; op.textContent = 'As offered';
      sortSel.prepend(op);
    }
    sortSel.value = this.sort;
    sortSel.addEventListener('change', () => { this.sort = sortSel.value; this._apply(); });
    sortWrap.appendChild(sortSel);
    filt.appendChild(sortWrap);

    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'mm-btn mm-btn--ghost mm-deck__clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => this._clearFilters());
    filt.appendChild(clear);
    this.clearBtn = clear;

    // note
    const note = document.createElement('p');
    note.className = 'mm-deck__note';
    note.textContent = this.o.note ?? m.note;
    note.hidden = !note.textContent;

    // grid
    const grid = document.createElement('div');
    grid.className = 'mm-deck__grid';
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', this.o.title || m.title);
    grid.tabIndex = 0;
    grid.addEventListener('keydown', (e) => this._onKey(e));
    grid.addEventListener('focus', () => { if (!this.cells.length) return; this._focus(this.focusIndex, false); });

    const empty = document.createElement('p');
    empty.className = 'mm-deck__empty';
    empty.hidden = true;

    root.append(bar, filt, note, empty, grid);
    this.el = root; this.grid = grid; this.emptyEl = empty;

    const onResize = () => this._schedulePlace();
    window.addEventListener('resize', onResize);
    this._offs.push(() => window.removeEventListener('resize', onResize));

    this._apply();
  }

  _select(label, key, options) {
    const wrap = document.createElement('label');
    wrap.className = 'mm-deck__sortwrap';
    wrap.innerHTML = `<span class="mm-deck__label">${label}</span>`;
    const sel = document.createElement('select');
    sel.className = 'mm-deck__select';
    for (const [v, l] of options) {
      const op = document.createElement('option'); op.value = v; op.textContent = l; sel.appendChild(op);
    }
    sel.addEventListener('change', () => { this.filters[key] = sel.value; this._apply(); });
    wrap.appendChild(sel);
    (this._sels ||= []).push([key, sel]);
    return wrap;
  }
  get selects() { return this._sels || []; }

  _clearFilters() {
    this.filters = { type: 'all', cost: 'all', rarity: 'all', upgraded: 'all', q: '' };
    for (const [, sel] of this.selects) sel.value = 'all';
    const q = this.el.querySelector('.mm-deck__search input');
    if (q) q.value = '';
    this._apply();
  }

  // ── filtering / sorting ────────────────────────────────────────────────
  _match(e) {
    const f = this.filters, d = e.def;
    if (f.type !== 'all' && d.type !== f.type) return false;
    if (f.rarity !== 'all' && (d.rarity || 'common') !== f.rarity) return false;
    if (f.upgraded === 'yes' && !e.upgraded) return false;
    if (f.upgraded === 'no' && e.upgraded) return false;
    if (f.cost !== 'all') {
      const c = COST_OF(e);
      if (f.cost === 'x') { if (c !== -1 && d.cost !== 'X') return false; }
      else if (f.cost === '4+') { if (!(c >= 4)) return false; }
      else if (String(c) !== f.cost) return false;
    }
    if (f.q) {
      const hay = `${d.name || ''} ${d.text || ''} ${d.type || ''} ${d.rarity || ''}`.toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  }

  _apply() {
    let list = this.all.filter(e => this._match(e));
    if (this.sort !== 'none' && SORTS[this.sort]) list = list.slice().sort(SORTS[this.sort]);
    // Hard guarantee, independent of the caller: a draw pile is never in order.
    if (this.mode === 'draw' && this.sort === 'none') list = list.slice().sort(SORTS.name);
    this.shown = list;

    const total = this.all.length;
    this.countN.textContent = String(list.length);
    // The count itself is in `countN`, so the unfiltered label is the bare noun.
    // The filtered one carries its own number — "of 1 Tricks" was reachable with
    // a one-card pile and a filter that excluded it.
    this.countL.textContent = list.length === total
      ? word(total, 'Trick')
      : `of ${plural(total, 'Trick')}`;
    this.clearBtn.hidden = list.length === total && !this.filters.q;

    this.emptyEl.hidden = list.length > 0;
    this.emptyEl.textContent = total === 0
      ? 'Nothing here.'
      : 'No Trick matches those filters.';

    this._renderGrid(list);
  }

  _renderGrid(list) {
    // reuse cells/views across re-filters so sorting does not re-raster art
    this.grid.textContent = '';
    this.cells = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const cell = document.createElement('div');
      cell.className = 'mm-deck__cell';
      cell.setAttribute('role', 'option');
      cell.setAttribute('aria-selected', 'false');
      cell.tabIndex = -1;
      cell.dataset.uid = e.uid;
      cell.dataset.index = String(i);
      const label = `${e.def.name}${e.upgraded ? ' plus' : ''}, ${cap(e.def.type || 'skill')}, cost ${COST_OF(e)}`;
      cell.setAttribute('aria-label', label);
      cell.addEventListener('click', () => { this._focus(i); this._activate(i); });
      this.grid.appendChild(cell);
      this.cells.push(cell);
    }
    this._mountViews(list);
    this._schedulePlace();
  }

  async _mountViews(list) {
    if (!this._CardView) {
      try { ({ CardView: this._CardView } = await import('./card.js')); }
      catch { return; }
    }
    if (!this.el.isConnected && !this._forceMount) { /* still fine — cells exist */ }
    const CardView = this._CardView;
    const reduce = !!this.ctx?.Save?.settings?.reduceMotion;
    const large = !!this.ctx?.Save?.settings?.largeText;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const cell = this.cells[i];
      if (!cell) continue;
      let v = this.views.get(e.uid);
      if (!v) {
        v = new CardView(e.def, {
          uid: e.uid, upgraded: e.upgraded, cost: e.cost,
          playable: true, reduceMotion: reduce, largeText: large,
        });
        this.views.set(e.uid, v);
      }
      if (v.el.parentElement !== cell) cell.appendChild(v.el);
    }
    this._schedulePlace();
  }

  /**
   * One read pass then one write pass. CardView positions itself from its
   * bottom-centre, so each card is placed at (cellW/2, cellH) of its own cell.
   */
  _schedulePlace() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const sizes = this.cells.map(c => [c.clientWidth, c.clientHeight]);   // read
      /* `_columns()` reads `offsetTop`, so it belongs in the READ pass. It sat
         after the writes and forced a second layout on a grid that can hold
         sixty cards — the one place this method broke its own rule. Card
         transforms do not affect layout, so the answer is identical either
         side; only the flush is saved. */
      this._cols = this._columns();
      for (let i = 0; i < this.cells.length; i++) {                          // write
        const uid = this.cells[i].dataset.uid;
        const v = this.views.get(uid);
        if (v) v.setTransform({ x: sizes[i][0] / 2, y: sizes[i][1], rot: 0, scale: 1, z: 0 });
      }
    });
  }

  _columns() {
    if (this.cells.length < 2) return 1;
    const top = this.cells[0].offsetTop;
    let n = 0;
    for (const c of this.cells) { if (c.offsetTop !== top) break; n++; }
    return Math.max(1, n);
  }

  // ── keyboard ───────────────────────────────────────────────────────────
  _onKey(e) {
    const n = this.cells.length;
    if (!n) return;
    const cols = this._cols || this._columns();
    let i = this.focusIndex;
    switch (e.key) {
      case 'ArrowRight': i = Math.min(n - 1, i + 1); break;
      case 'ArrowLeft':  i = Math.max(0, i - 1); break;
      case 'ArrowDown':  i = Math.min(n - 1, i + cols); break;
      case 'ArrowUp':    i = Math.max(0, i - cols); break;
      case 'Home':       i = 0; break;
      case 'End':        i = n - 1; break;
      case 'PageDown':   i = Math.min(n - 1, i + cols * 3); break;
      case 'PageUp':     i = Math.max(0, i - cols * 3); break;
      case 'Enter': case ' ':
        e.preventDefault(); this._activate(this.focusIndex); return;
      default: return;
    }
    e.preventDefault();
    this._focus(i);
  }

  _focus(i, scroll = true) {
    const prev = this.cells[this.focusIndex];
    if (prev) { prev.classList.remove('is-focus'); prev.setAttribute('aria-selected', 'false'); prev.tabIndex = -1; }
    this.focusIndex = Math.max(0, Math.min(i, this.cells.length - 1));
    const cell = this.cells[this.focusIndex];
    if (!cell) return;
    cell.classList.add('is-focus');
    cell.setAttribute('aria-selected', 'true');
    cell.tabIndex = 0;
    cell.focus({ preventScroll: true });
    if (scroll) cell.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  _activate(i) {
    const e = this.shown?.[i];
    if (!e) return;
    if (this.mode === 'reward' && this.o.onPick) this.o.onPick(e);
    else this.o.onActivate?.(e);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const v of this.views.values()) { try { v.destroy?.(); } catch {} }
    this.views.clear();
    this.cells.length = 0;
    this.el.remove();
  }
}

/**
 * Open a pile in a modal. Resolves with the picked entry (reward mode) or null.
 * @param {object} o  see DeckView, plus `{host}`
 */
export async function openPile(o = {}) {
  const m = MODES[o.mode || 'deck'] || MODES.deck;
  const modal = new Modal({
    title: o.title || m.title,
    subtitle: o.subtitle || '',
    size: 'wide',
    host: o.host || o.ctx?.dom,
  });

  let picked = null;
  const view = new DeckView({
    ...o,
    onPick: (e) => { picked = e; modal.close(e); },
  });
  modal.body.appendChild(view.el);

  if (o.mode === 'reward' && o.allowSkip !== false) {
    const skip = document.createElement('button');
    skip.type = 'button'; skip.className = 'mm-btn';
    skip.textContent = o.skipLabel || 'Skip';
    skip.addEventListener('click', () => modal.close(null));
    modal.footer.appendChild(skip);
  } else {
    const done = document.createElement('button');
    done.type = 'button'; done.className = 'mm-btn mm-btn--primary';
    done.textContent = 'Close';
    done.addEventListener('click', () => modal.close(null));
    modal.footer.appendChild(done);
  }

  const result = await modal.open();
  view.destroy();
  return result ?? picked;
}

function cap(s) { return String(s || '').replace(/^[a-z]/, c => c.toUpperCase()); }

export default DeckView;
