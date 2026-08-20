/**
 * The persistent run HUD. OWNER: ui-chrome agent.
 *
 *   import { HUD } from './ui/hud.js';
 *   const hud = new HUD(ctx, { mount: this.root });   // or hud.mount(el)
 *   hud.refresh();                                    // usually automatic
 *   hud.destroy();                                    // in Scene.exit()
 *
 * Shows, left to right: Companion + region/floor, Courage, Lost Things, Snack
 * slots, the Keepsake bar, the Backpack Gear bar, Haunt Level, seed, the deck
 * button and the settings button. Every chip on it is hoverable and
 * keyboard-focusable, and every tooltip is a plain-language sentence — the HUD
 * is the game's answer to "what do I actually have right now".
 *
 * ── KEEPSAKES ARE NOT GEAR ──────────────────────────────────────────────────
 * They arrive through the same door and they are not the same thing. A Keepsake
 * is something the house gave up; Backpack Gear is what the kid packed before
 * she went in, chosen at the clubhouse and carried between runs. The run layer
 * hands the combat engine both as one list — `state/run.js` appends
 * `backpackHooks(this.backpack)`, which are relic-SHAPED objects tagged
 * `gear: true` with a `gear/<id>` id — because the engine only cares that a
 * thing has hooks. The HUD is where the player is, so the HUD splits them back
 * apart: warm square sigils for Keepsakes, cool round packs for Gear, each in
 * its own labelled list. Before this, Maya's Camera sat in the Keepsake bar
 * wearing the unknown-Keepsake lozenge.
 *
 * ── ONE HUD, ONE POSITION ───────────────────────────────────────────────────
 * Every run scene pins this to the top edge of the viewport, full width, in the
 * order above. Combat is the only variant (`variant:'combat'`) and it differs
 * only in density and in the one extra chip it owns (Turn) — same markup, same
 * class names, same icons, same order. If you find yourself hand-rolling a
 * Courage bar or a Keepsake row in a scene, you want this instead.
 *
 * Options:
 *   mount      Element to append to.
 *   variant    'bar' (default) | 'combat'
 *   fixed      pin to the top edge of the viewport (default true)
 *   compact    denser padding, hides the seed
 *   useSnacks  the Snack slots are ACTIVATABLE here (combat only). Outside a
 *              Scuffle they still show what you carry, but say so instead of
 *              offering a dead click.
 *   escape     bind Escape -> Settings (default true). A scene that owns Escape
 *              for something else passes false and calls `hud.openSettings()`.
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
// One Keepsake sigil set for the whole game. The shop and the reward room
// already draw Keepsakes with this; the HUD drawing a generic glyph instead is
// exactly the drift this component exists to end.
import { relicSigil } from '../data/relics.js';
// The Backpack is the authority on what Gear the kid is carrying; the engine
// only sees the subset with combat hooks. See gearList() below.
import { itemById } from '../data/backpack.js';

/* ── Gear chip styling ────────────────────────────────────────────────────────
   This belongs in ui/hud.css beside `.mm-hud__relic`, and it is here instead
   only because hud.css is another owner's file and this change was scoped to
   hud.js. It is one idempotent <style> tag, injected once per document, using
   the same tokens the rest of the bar uses so it re-themes with everything else.
   HAND-OFF: whoever owns hud.css next should lift this block into it verbatim
   and delete `ensureGearCss()`. Noted in docs/NOTES.md. */
const GEAR_CSS = `
.mm-hud__gear {
  display: flex; align-items: center; gap: var(--s-1);
  padding-left: var(--s-2);
  margin-left: var(--s-1);
  border-left: 1px solid color-mix(in srgb, var(--surface-line) 70%, transparent);
}
.mm-hud__gear[hidden] { display: none; }
.mm-hud__gearlbl {
  font-size: var(--fs-xs); letter-spacing: .14em; text-transform: uppercase;
  color: color-mix(in srgb, var(--spectre-200) 78%, var(--text-lo));
}
/* Round and cool, where a Keepsake is square and warm. Shape and temperature
   are the two things a player reads before they read anything. */
.mm-hud__gearchip {
  position: relative;
  display: grid; place-items: center;
  width: var(--hud-chip-h); height: var(--hud-chip-h);
  color: var(--spectre-100);
  background:
    radial-gradient(70% 70% at 50% 30%, color-mix(in srgb, var(--spectre-500) 30%, transparent), transparent 70%),
    var(--chip-bg);
  border: 1px solid color-mix(in srgb, var(--spectre-300) 72%, transparent);
  border-radius: 999px;
  transition: transform var(--t-quick) var(--ease-out), border-color var(--t-quick) var(--ease-out);
}
.mm-hud__gearchip:hover { transform: translateY(-2px); border-color: var(--spectre-200); }
.mm-hud__gearchip .mm-icon { width: 1.1em; height: 1.1em; }
.mm-hud__gearchip .mm-icon svg {
  fill: none; stroke: currentColor; stroke-width: 1.6;
  stroke-linecap: round; stroke-linejoin: round;
}
.mm-hud__gearchip .mm-hud__relicn { background: var(--spectre-200); }
`;

function ensureGearCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('mm-hud-gear-css')) return;
  const st = document.createElement('style');
  st.id = 'mm-hud-gear-css';
  st.textContent = GEAR_CSS;
  document.head.appendChild(st);
}

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

/** Snack slots are keyed ⇧1..⇧3 — the plain digits belong to the hand. */
const SNACK_KEYS = ['⇧1', '⇧2', '⇧3'];

export class HUD {
  /**
   * @param {object} ctx  shared app context
   * @param {{mount?:Element, compact?:boolean, variant?:string, fixed?:boolean,
   *          useSnacks?:boolean, escape?:boolean}} [o]
   */
  constructor(ctx = {}, o = {}) {
    this.ctx = ctx;
    this.o = o;
    this.bus = ctx.bus;
    this._offs = [];
    this._snacks = [];
    ensureGearCss();
    this._build();
    if (o.mount) this.mount(o.mount);
    for (const ev of EVENTS) {
      if (this.bus?.on) this._offs.push(this.bus.on(ev, () => this.refresh()));
    }
    this._bindKeys();
    this.refresh();
  }

  /**
   * Escape opens Settings, and ⇧1..⇧3 eat a Snack where Snacks are live.
   * Both run before the scene's own handlers (the HUD is built first) and both
   * mark the event handled, so every scene key map already defers to them —
   * they all begin `if (e.defaultPrevented) return`.
   */
  _bindKeys() {
    const wantEsc = this.o.escape !== false;
    const wantSnack = !!this.o.useSnacks;
    if (!wantEsc && !wantSnack) return;
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.mm-modal')) return;      // a modal owns the keyboard
      if (wantEsc && e.key === 'Escape') { e.preventDefault(); this.openSettings(); return; }
      if (wantSnack && e.shiftKey && e.code && /^Digit[1-3]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1;
        const s = this._snacks[i];
        if (s) { e.preventDefault(); this._useSnack(i, s); }
      }
    };
    window.addEventListener('keydown', onKey);
    this._offs.push(() => window.removeEventListener('keydown', onKey));
  }

  /** `o.run` lets a deep-linked scene show its own stand-in run instead of the
   *  generic preview — the screen is then honest about what it is showing. */
  get run() { return this.o.run || this.ctx?.run || null; }
  /** The run, or the labelled stand-in. Never throws, never null. */
  get data() { return this.run || MOCK; }

  mount(parent) { if (parent) parent.appendChild(this.el); return this; }

  // ── DOM ────────────────────────────────────────────────────────────────
  _build() {
    const root = document.createElement('div');
    root.className = 'mm-hud';
    root.dataset.variant = this.o.variant || 'bar';
    if (this.o.compact) root.dataset.compact = '1';
    if (this.o.fixed !== false) root.classList.add('mm-hud--fixed');
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
        <div class="mm-hud__gear" role="list" aria-label="Backpack Gear" hidden></div>
      </div>
      <div class="mm-hud__group mm-hud__group--extra"></div>
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
    this.$extra = root.querySelector('.mm-hud__group--extra');
    this.$relics = root.querySelector('.mm-hud__relics');
    this.$gear = root.querySelector('.mm-hud__gear');
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

    // courage — during a Scuffle the engine's player is authoritative (the run
    // only learns the new number when the fight ends), so combat passes it in.
    const cv = typeof this.o.courage === 'function' ? this.o.courage() : null;
    const hp = cv ? num(cv[0], 0) : num(r.courage ?? r.hp, 0);
    const max = Math.max(1, cv ? num(cv[1], 1) : num(r.maxCourage ?? r.maxHp, 1));
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
    const live = !!this.o.useSnacks;
    this._snacks = snacks;
    this.$snacks.textContent = '';
    this.$snacks.dataset.live = live ? '1' : '0';
    for (let i = 0; i < cap_; i++) {
      const s = snacks[i];
      // A filled slot is a real button only where eating one is a real action.
      // Everywhere else it is a focusable, hoverable read-out that says why.
      const slot = document.createElement(s && live ? 'button' : 'div');
      slot.className = 'mm-hud__snack' + (s ? '' : ' is-empty');
      slot.tabIndex = 0;
      slot.appendChild(icon('res.snack'));
      if (s) {
        slot.dataset.tipTitle = s.name || 'Snack';
        const what = s.desc || s.text || 'A one-use Snack.';
        if (live) {
          slot.type = 'button';
          slot.dataset.tip = `${what} Eat it at any point in your turn — it does not cost Nerve. Shortcut: ${SNACK_KEYS[i]}.`;
          slot.setAttribute('aria-label', `Eat ${s.name || 'Snack'}. ${what}`);
          const k = document.createElement('b');
          k.className = 'mm-hud__snackk';
          k.textContent = SNACK_KEYS[i];
          slot.appendChild(k);
          slot.addEventListener('click', () => this._useSnack(i, s));
        } else {
          slot.classList.add('is-idle');
          slot.setAttribute('aria-disabled', 'true');
          slot.dataset.tip = `${what} You eat Snacks during a Scuffle.`;
          slot.setAttribute('aria-label', `${s.name || 'Snack'} in your pocket. ${what}`);
        }
      } else {
        slot.dataset.tipTitle = 'Empty Snack slot';
        slot.dataset.tip = `You can carry ${cap_} Snacks. Find them in treasure, at Mr. Moth's and in Curiosities.`;
        slot.setAttribute('aria-label', 'Empty Snack slot');
      }
      this.$snacks.appendChild(slot);
    }

    /* Keepsakes and Gear — inside a Scuffle the ENGINE owns the live counters, so
       combat passes `relics:` and the same chips show the same numbers the rules
       use. That list is mixed: `state/run.js` feeds the engine
       `[...keepsakes, ...backpackHooks(backpack)]`, so everything the kid packed
       that has combat hooks arrives here wearing a relic's shape. Split it back
       out before drawing — see the header note. */
    const carried = typeof this.o.relics === 'function'
      ? (this.o.relics() || [])
      : Array.isArray(r.keepsakes) ? r.keepsakes : (Array.isArray(r.relics) ? r.relics : []);
    const relics = carried.filter((k) => !isGear(k));
    const gear = gearList(r, carried);

    this.$relics.textContent = '';
    if (!relics.length) {
      const none = document.createElement('span');
      none.className = 'mm-hud__norelics';
      none.textContent = 'No Keepsakes yet';
      none.tabIndex = 0;
      none.dataset.kw = 'keepsake';
      this.$relics.appendChild(none);
    } else {
      for (const k of relics) this.$relics.appendChild(keepsakeChip(k));
    }

    /* Gear only appears when the kid actually brought some, and it never shows a
       "none yet" placeholder: an empty Backpack is a loadout choice, not a gap
       waiting to be filled the way an empty Keepsake bar is. */
    this.$gear.textContent = '';
    this.$gear.hidden = !gear.length;
    if (gear.length) {
      const tag = document.createElement('span');
      tag.className = 'mm-hud__gearlbl';
      tag.textContent = 'Gear';
      tag.setAttribute('aria-hidden', 'true');
      this.$gear.appendChild(tag);
      for (const g of gear) this.$gear.appendChild(gearChip(g));
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

  /**
   * Eat a Snack. The HUD never decides what a Snack DOES — it announces the
   * intent and the scene that owns a Scuffle resolves it against the engine.
   * `o.onUseSnack` wins over the bus so a scene can await the resolution.
   */
  _useSnack(index, snack) {
    this.ctx?.audio?.play?.('ui:confirm');
    if (typeof this.o.onUseSnack === 'function') { this.o.onUseSnack(index, snack); return; }
    this.bus?.emit('hud:useSnack', { index, snack });
  }

  /**
   * Add a scene-owned chip to the HUD (combat's Turn counter is the only one).
   * Use `.mm-hud__chip` so it inherits the shared chip treatment exactly.
   * @returns {Element} the node, so the caller can update it in place.
   */
  addChip(node) { this.$extra?.appendChild(node); return node; }

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

/**
 * What Gear to draw. The run's own `backpack` is the authority: it is the whole
 * loadout, it is the same on the map as it is mid-Scuffle, and it does not
 * depend on whether an item happens to carry combat hooks. The engine's list
 * only ever holds the hook-bearing subset, so using it would make half the
 * pack blink out of the bar the moment a fight started.
 *
 * Counters still come off the engine entry when there is one, because during a
 * Scuffle the engine owns those numbers — same rule as the Keepsake chips.
 * Falls back to the engine's gear entries when there is no run to read (a
 * deep-linked combat with a dummy engine).
 */
function gearList(r, carried) {
  const live = new Map();
  for (const k of carried) {
    if (isGear(k)) live.set(String(k.id).replace(/^gear\//, ''), k);
  }
  const ids = Array.isArray(r?.backpack) ? r.backpack : null;
  if (!ids || !ids.length) return [...live.values()];
  const out = [];
  for (const id of ids) {
    const def = itemById(id);
    if (!def) continue;
    const hot = live.get(id);
    out.push({
      id: `gear/${id}`, name: def.name, desc: def.desc, icon: def.icon,
      gear: true, counter: hot?.counter ?? null,
    });
  }
  return out;
}

/**
 * Is this relic-shaped thing actually Backpack Gear?
 * `data/backpack.js backpackHooks()` stamps both marks; either alone is enough,
 * so a saved run that lost the boolean still sorts correctly on its id.
 */
function isGear(k) {
  return !!k && (k.gear === true || String(k.id || '').startsWith('gear/'));
}

/** One Keepsake: a warm, rarity-bordered square holding the relic's own sigil. */
function keepsakeChip(k) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'mm-hud__relic';
  chip.setAttribute('role', 'listitem');
  chip.dataset.rarity = k.rarity || 'common';
  chip.appendChild(sigil(k.id));
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
  return chip;
}

/**
 * One piece of Backpack Gear: a cool, round pack. Deliberately the opposite of
 * the Keepsake chip on both axes a player reads first — shape and temperature —
 * so the two bars never have to be told apart by reading them.
 *
 * The glyph is the same pack for every item because `ui/icons.js` has no
 * Backpack art yet (it owns intents, statuses, resources, nodes, types,
 * rarities and chrome, and Gear is none of those). `data-gear` carries the
 * item's authored icon name so per-item drawings can land here later without
 * touching this function. Reported to the icons owner, not fixed here.
 */
function gearChip(g) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'mm-hud__gearchip';
  chip.setAttribute('role', 'listitem');
  chip.dataset.gear = String(g.icon || g.id || '').replace(/^gear\//, '');
  chip.appendChild(packGlyph());
  if (g.counter != null) {
    const c = document.createElement('b');
    c.className = 'mm-hud__relicn';
    c.textContent = String(g.counter);
    chip.appendChild(c);
  }
  const name = g.name || 'Backpack Gear';
  chip.setAttribute('aria-label', `${name}, Backpack Gear${g.counter != null ? `, at ${g.counter}` : ''}`);
  chip.dataset.tipTitle = name;
  chip.dataset.tip = [
    g.desc || g.text || '',
    'Backpack Gear — you brought this from home. It is not a Keepsake, and it goes back in the pack when the run ends.',
    g.counter != null ? `Currently at ${g.counter}.` : '',
  ].filter(Boolean).join(' ');
  chip.dataset.tipPlacement = 'bottom';
  return chip;
}

/** A stroked knapsack: lid seam and front pocket, drawn like the relic sigils. */
function packGlyph() {
  const span = document.createElement('span');
  span.className = 'mm-icon';
  span.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const d of [
    'M7.5 8V6.2A3.2 3.2 0 0 1 10.7 3h2.6a3.2 3.2 0 0 1 3.2 3.2V8',
    'M5.4 8h13.2a2.4 2.4 0 0 1 2.4 2.4v8.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6v-8.2A2.4 2.4 0 0 1 5.4 8z',
    'M3 13.2h18',
    'M9.6 13.2v3.4h4.8v-3.4',
  ]) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  span.appendChild(svg);
  return span;
}

/** A Keepsake's own drawing, in an `.mm-icon` box so it sits like every other. */
function sigil(id) {
  const span = document.createElement('span');
  span.className = 'mm-icon';
  span.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', relicSigil(id));
  svg.appendChild(path);
  span.appendChild(svg);
  return span;
}

export default HUD;
