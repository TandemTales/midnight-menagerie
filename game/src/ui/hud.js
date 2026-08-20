/**
 * The persistent run HUD. OWNER: ui-chrome agent.
 *
 *   import { HUD } from './ui/hud.js';
 *   const hud = new HUD(ctx, { mount: this.root });   // or hud.mount(el)
 *   hud.refresh();                                    // usually automatic
 *   hud.destroy();                                    // in Scene.exit()
 *
 * Shows, left to right: Companion + region/floor, Courage, Lost Things, Snack
 * slots, the Keepsake bar, Haunt Level, seed, the deck button and the settings
 * button. Every chip on it is hoverable and keyboard-focusable, and every
 * tooltip is a plain-language sentence — the HUD is the game's answer to
 * "what do I actually have right now".
 *
 * It reads `ctx.run` **defensively**. Every field is optional; when there is no
 * run at all it shows a clearly-labelled preview so a scene can be developed
 * and screenshotted standalone. It never writes to the run.
 *
 * Refresh is event-driven, not per-frame: the bus events below, plus an
 * explicit `refresh()`. Nothing here runs inside the frame loop.
 */

import { icon } from './icons.js';
import { openPile } from './deckview.js';
import { openSettings } from './settings.js';

const EVENTS = [
  'run:start', 'run:enterNode', 'run:combatEnd', 'run:reward', 'run:update',
  'run:heal', 'run:damage', 'run:gold', 'run:relic', 'run:potion', 'run:deck',
  'hud:refresh', 'settings:changed', 'scene:enter',
];

/** What the HUD shows when `ctx.run` does not exist yet. */
const MOCK = {
  companionName: 'Marmalade', kidName: 'Maya',
  courage: 52, maxCourage: 70, lostThings: 137,
  region: 'foyer', floor: 1, hauntLevel: 0, seed: '—',
  keepsakes: [], snacks: [], snackCap: 3, deck: [],
  _mock: true,
};

const REGION_LABEL = {
  foyer: 'The Foyer', nursery: 'The Nursery', 'sleeping-quarters': 'Sleeping Quarters',
  'kitchens-cellars': 'Kitchens & Cellars', greenhouse: 'The Greenhouse',
  graveyard: 'The Graveyard', 'study-library': 'Study & Library',
  'attic-observatory': 'Attic & Observatory', lampworks: 'The Lampworks',
  ballroom: 'The Ballroom', crypt: 'The Crypt', 'hedge-maze': 'The Hedge Maze',
  'secret-passages': 'Secret Passages', bathhouse: 'The Bathhouse',
  kennels: 'The Kennels', 'pumpkin-grounds': 'Pumpkin Grounds', heart: 'The Heart',
};

export class HUD {
  /**
   * @param {object} ctx  shared app context
   * @param {{mount?:Element, compact?:boolean, show?:string[]}} [o]
   */
  constructor(ctx = {}, o = {}) {
    this.ctx = ctx;
    this.o = o;
    this.bus = ctx.bus;
    this._offs = [];
    this._build();
    if (o.mount) this.mount(o.mount);
    for (const ev of EVENTS) {
      if (this.bus?.on) this._offs.push(this.bus.on(ev, () => this.refresh()));
    }
    this.refresh();
  }

  get run() { return this.ctx?.run || null; }
  /** The run, or the labelled stand-in. Never throws, never null. */
  get data() { return this.run || MOCK; }

  mount(parent) { if (parent) parent.appendChild(this.el); return this; }

  // ── DOM ────────────────────────────────────────────────────────────────
  _build() {
    const root = document.createElement('div');
    root.className = 'mm-hud';
    if (this.o.compact) root.dataset.compact = '1';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Expedition status');

    root.innerHTML = `
      <div class="mm-hud__group mm-hud__group--who">
        <button class="mm-hud__chip mm-hud__where" type="button"></button>
      </div>
      <div class="mm-hud__group mm-hud__group--vitals">
        <div class="mm-hud__courage" tabindex="0">
          <div class="mm-hud__bar"><i></i><span class="mm-hud__barlabel"></span></div>
        </div>
        <div class="mm-hud__chip mm-hud__gold" tabindex="0"></div>
        <div class="mm-hud__snacks" role="group" aria-label="Snacks"></div>
      </div>
      <div class="mm-hud__group mm-hud__group--keepsakes">
        <div class="mm-hud__relics" role="list" aria-label="Keepsakes"></div>
      </div>
      <div class="mm-hud__group mm-hud__group--meta">
        <div class="mm-hud__chip mm-hud__haunt" tabindex="0"></div>
        <div class="mm-hud__chip mm-hud__seed" tabindex="0"></div>
        <button class="mm-hud__chip mm-hud__btn mm-hud__deck" type="button"></button>
        <button class="mm-hud__chip mm-hud__btn mm-hud__settings" type="button" aria-label="Settings"></button>
      </div>`;

    this.el = root;
    this.$where = root.querySelector('.mm-hud__where');
    this.$courage = root.querySelector('.mm-hud__courage');
    this.$bar = root.querySelector('.mm-hud__bar > i');
    this.$barLabel = root.querySelector('.mm-hud__barlabel');
    this.$gold = root.querySelector('.mm-hud__gold');
    this.$snacks = root.querySelector('.mm-hud__snacks');
    this.$relics = root.querySelector('.mm-hud__relics');
    this.$haunt = root.querySelector('.mm-hud__haunt');
    this.$seed = root.querySelector('.mm-hud__seed');
    this.$deck = root.querySelector('.mm-hud__deck');
    this.$settings = root.querySelector('.mm-hud__settings');

    this.$where.prepend(icon('res.region'));
    this.$gold.prepend(icon('res.lost-things'));
    this.$haunt.prepend(icon('res.haunt-level'));
    this.$seed.prepend(icon('res.seed'));
    this.$deck.prepend(icon('res.deck'));
    this.$settings.appendChild(icon('ui.gear', { title: 'Settings' }));

    this.$deck.addEventListener('click', () => this.openDeck());
    this.$settings.addEventListener('click', () => this.openSettings());
    this.$where.addEventListener('click', () => this.bus?.emit('hud:where'));

    // The tooltip system picks these up by attribute — no wiring needed.
    this.$courage.dataset.kw = 'courage';
    this.$gold.dataset.kw = 'lost-things';
    this.$deck.dataset.tip = 'Look through every Trick you own. Sorting and filtering only — no secrets revealed.';
    this.$deck.dataset.tipTitle = 'Your Tricks';
    this.$settings.dataset.tip = 'Volume, motion, colour, text size and the rest. Everything here takes effect immediately.';
    this.$settings.dataset.tipTitle = 'Settings';
  }

  // ── data → DOM ─────────────────────────────────────────────────────────
  refresh() {
    if (!this.el) return;
    const r = this.data;
    this.el.classList.toggle('is-mock', !!r._mock);

    // where
    const region = REGION_LABEL[r.region || r.regionId] || cap(r.region || 'Somewhere');
    const floor = r.floor ?? 1;
    this.$where.textContent = '';
    this.$where.append(icon('res.region'), text(region), sub(`Floor ${floor}`));
    this.$where.dataset.tip =
      `${region}. You are on floor ${floor} of the expedition.` +
      (r.companionName ? ` ${r.companionName} is with ${r.kidName || 'you'}.` : '');
    this.$where.dataset.tipTitle = r._mock ? 'Preview — no run in progress' : region;

    // courage
    const hp = num(r.courage ?? r.hp, 0);
    const max = Math.max(1, num(r.maxCourage ?? r.maxHp, 1));
    const pct = Math.max(0, Math.min(1, hp / max));
    this.$bar.style.transform = `scaleX(${pct.toFixed(4)})`;
    this.$courage.dataset.low = pct <= 0.3 ? '1' : '0';
    this.$barLabel.textContent = `${hp} / ${max}`;
    this.$courage.setAttribute('role', 'meter');
    this.$courage.setAttribute('aria-valuenow', String(hp));
    this.$courage.setAttribute('aria-valuemin', '0');
    this.$courage.setAttribute('aria-valuemax', String(max));
    this.$courage.setAttribute('aria-label', `Courage ${hp} of ${max}`);

    // gold
    this.$gold.textContent = '';
    this.$gold.append(icon('res.lost-things'), text(String(num(r.lostThings ?? r.gold, 0))));

    // snacks
    const snacks = Array.isArray(r.snacks) ? r.snacks : [];
    const cap_ = num(r.snackCap, 3);
    this.$snacks.textContent = '';
    for (let i = 0; i < cap_; i++) {
      const s = snacks[i];
      const slot = document.createElement(s ? 'button' : 'div');
      slot.className = 'mm-hud__snack' + (s ? '' : ' is-empty');
      slot.tabIndex = 0;
      if (s) {
        slot.type = 'button';
        slot.appendChild(icon('res.snack'));
        slot.dataset.tipTitle = s.name || 'Snack';
        slot.dataset.tip = s.desc || s.text || 'A one-use Snack. Eat it at any point during a Scuffle.';
        slot.addEventListener('click', () => this.bus?.emit('hud:useSnack', { index: i, snack: s }));
      } else {
        slot.appendChild(icon('res.snack'));
        slot.dataset.tipTitle = 'Empty Snack slot';
        slot.dataset.tip = 'You can carry three Snacks. Find them in treasure, shops and Curiosities.';
      }
      this.$snacks.appendChild(slot);
    }

    // keepsakes
    const relics = Array.isArray(r.keepsakes) ? r.keepsakes : (Array.isArray(r.relics) ? r.relics : []);
    this.$relics.textContent = '';
    if (!relics.length) {
      const none = document.createElement('span');
      none.className = 'mm-hud__norelics';
      none.textContent = 'No Keepsakes yet';
      none.tabIndex = 0;
      none.dataset.kw = 'keepsake';
      this.$relics.appendChild(none);
    } else {
      for (const k of relics) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'mm-hud__relic';
        chip.setAttribute('role', 'listitem');
        chip.dataset.rarity = k.rarity || 'common';
        chip.appendChild(icon(k.icon && hasRes(k.icon) ? k.icon : 'res.keepsake'));
        if (k.counter != null) {
          const c = document.createElement('b');
          c.className = 'mm-hud__relicn';
          c.textContent = String(k.counter);
          chip.appendChild(c);
        }
        chip.setAttribute('aria-label', `${k.name || 'Keepsake'}${k.counter != null ? `, at ${k.counter}` : ''}`);
        chip.dataset.tipTitle = k.name || 'Keepsake';
        chip.dataset.tip = [k.desc || k.text || '', k.counter != null ? `Currently at ${k.counter}.` : '']
          .filter(Boolean).join(' ');
        chip.dataset.tipPlacement = 'bottom';
        this.$relics.appendChild(chip);
      }
    }

    // meta
    const haunt = num(r.hauntLevel ?? this.ctx?.Save?.data?.hauntLevel, 0);
    this.$haunt.textContent = '';
    this.$haunt.append(icon('res.haunt-level'), text(`Haunt ${haunt}`));
    this.$haunt.dataset.tipTitle = `Haunt Level ${haunt}`;
    this.$haunt.dataset.tip = haunt > 0
      ? `Every Haunt Level stacks another permanent difficulty modifier onto the whole expedition. You are running ${haunt} of them.`
      : 'The base difficulty. Win an expedition to unlock Haunt Level 1, which adds a permanent modifier.';

    const seed = String(r.seed ?? '—');
    this.$seed.textContent = '';
    this.$seed.append(icon('res.seed'), text(seed));
    this.$seed.dataset.tipTitle = 'Seed';
    this.$seed.dataset.tip = `${seed} — this number generates the entire expedition. The same seed replays the same rooms, the same rewards and the same shop.`;

    const deck = Array.isArray(r.deck) ? r.deck : [];
    this.$deck.textContent = '';
    this.$deck.append(icon('res.deck'), text('Tricks'), sub(String(deck.length)));
    this.$deck.setAttribute('aria-label', `View your ${deck.length} Tricks`);
  }

  // ── actions ────────────────────────────────────────────────────────────
  async openDeck() {
    const r = this.run;
    const cards = r?.deckViews?.() ?? (Array.isArray(r?.deck) ? r.deck : []);
    await openPile({ mode: 'deck', cards, ctx: this.ctx, host: this.ctx?.dom });
  }
  async openSettings() { await openSettings(this.ctx); }

  destroy() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this.el?.remove();
    this.el = null;
  }
}

function text(s) { const n = document.createElement('span'); n.className = 'mm-hud__t'; n.textContent = s; return n; }
function sub(s)  { const n = document.createElement('span'); n.className = 'mm-hud__s'; n.textContent = s; return n; }
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function cap(s) { return String(s || '').replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase()); }
function hasRes() { return false; }   // relic art is the meta-run agent's; we use one glyph

export default HUD;
