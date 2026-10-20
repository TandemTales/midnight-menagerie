/**
 * The persistent run HUD. OWNER: ui-chrome agent.
 *
 *   import { HUD } from './ui/hud.js';
 *   const hud = new HUD(ctx, { mount: this.root });   // or hud.mount(el)
 *   hud.refresh();                                    // usually automatic
 *   hud.destroy();                                    // in Scene.exit()
 *
 * Shows, left to right: Companion + region/wing, Courage, Buttons, Clues,
 * Luck, Snack slots, the Keepsake bar, the Backpack Gear bar, Haunt Level,
 * seed, the deck button and the settings button. Every chip on it is hoverable and
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
 *   escape     bind Escape -> Settings. OPT-IN: a mounted component that seizes
 *              a global key would surprise any host with its own use for it
 *              (the chrome harness has one). Every run scene passes true;
 *              combat handles Escape itself so it can close an open pile first,
 *              then calls `hud.openSettings()`.
 *
 * It reads `ctx.run` **defensively**. Every field is optional; when there is no
 * run at all it shows a clearly-labelled preview so a scene can be developed
 * and screenshotted standalone. It never writes to the run.
 *
 * Refresh is event-driven, not per-frame: the bus events below, plus an
 * explicit `refresh()`. Nothing here runs inside the frame loop.
 */

import { icon } from './icons.js';
import { formatSeed } from './portrait.js';
import { openPile } from './deckview.js';
import { openSettings } from './settings.js';
import { plural, word } from '../util/plural.js';
// One Keepsake sigil set for the whole game. The shop and the reward room
// already draw Keepsakes with this; the HUD drawing a generic glyph instead is
// exactly the drift this component exists to end.
import { relicSigil } from '../data/relics.js';
// The Backpack is the authority on what Gear the kid is carrying; the engine
// only sees the subset with combat hooks. See gearList() below.
import { itemById } from '../data/backpack.js';
// Round 19: a Keepsake or a Snack on the rail is the house's small painted
// object (ui/objects.js), the same picture the Shop sells it under.
import { objectUrl, keepsakeKey, snackKey, gearKey } from './objects.js';

/* ── Gear, Clue and Luck chip styling ────────────────────────────────────────
   This belongs in ui/hud.css beside `.mm-hud__relic`, and it is here instead
   only because hud.css is another owner's file and this change was scoped to
   hud.js. It is one idempotent <style> tag, injected once per document, using
   the same tokens the rest of the bar uses so it re-themes with everything else.
   HAND-OFF: whoever owns hud.css next should lift this block into it verbatim
   and delete `ensureGearCss()`. Noted in docs/NOTES.md. */
const GEAR_CSS = `
.mm-hud__gear {
  display: flex; align-items: center; gap: var(--s-1);
  padding-left: 0;
  margin-left: 2px;
}
/* Round 5: the Keepsakes and the Gear are parted by a cast brass boss struck
   into the rail, as every group on it is, not by a drawn hairline */
.mm-hud__gear::before {
  content: ''; flex: none; width: 15px; height: 15px; margin-right: 1px;
  background: url("assets/ui/kit/boss-rosette.webp") 50% 50% / 100% 100% no-repeat;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .85)) brightness(1.08);
}
.mm-hud__gear[hidden] { display: none; }
/* Round and cool, where a Keepsake is square and warm. Shape and temperature
   are the two things a player reads before they read anything. In the kit
   (ui/kit.css) that is one of the boards' round enamel buttons with a
   moonlight glyph, against the Keepsake's candle-lit brass square. */
.mm-hud__gearchip {
  position: relative;
  display: grid; place-items: center;
  width: calc(var(--hud-chip-h) * 1.08); height: calc(var(--hud-chip-h) * 1.08);
  color: color-mix(in srgb, var(--kit-moon) 85%, white);
  background: url("assets/ui/kit/button.webp") 50% 50% / 100% 100% no-repeat;
  border-radius: 999px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .8));
  transition: transform var(--t-quick) var(--ease-out), filter var(--t-quick) var(--ease-out);
}
.mm-hud__gearchip:hover { transform: translateY(-2px); filter: brightness(1.2) drop-shadow(0 0 6px color-mix(in srgb, var(--kit-moon) 55%, transparent)); }
.mm-hud__gearchip .mm-icon { width: 1.05em; height: 1.05em; }
.mm-hud__gearchip .mm-icon svg {
  fill: none; stroke: currentColor; stroke-width: 1.7;
  stroke-linecap: round; stroke-linejoin: round;
}
/* round 19: a painted item sits in the house's velvet well instead */
.mm-hud__gearchip.has-obj { background: url("assets/ui/kit/hw-well.webp") 50% 50% / 100% 100% no-repeat; }
.mm-hud__gearobj { width: 104%; }

/* The wing sub-label. At --text-lo the chip measures 4.38:1 against the room
   behind it (tests/chrome/run.py measures real pixels, and the shorter "Wing 1"
   gives it less ink to work with than "Floor 1" did) — under the 4.5:1 the HUD
   is held to. --text-mid is the next step up the same ramp and still reads as
   secondary to the region name beside it.
   NOTE: no backticks in this block. It is a template literal. */
.mm-hud__where .mm-hud__s { color: var(--text-mid); }

/* Clues and Luck. Same chip as Buttons — only the icon is tinted, cool for
   the investigation, green for the odds, so neither competes with Courage. */
.mm-hud__clue .mm-icon { color: var(--kit-moon); }
.mm-hud__luck .mm-icon { color: var(--good-300); }
.mm-hud__clue[hidden], .mm-hud__luck[hidden] { display: none; }
`;

function ensureGearCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('mm-hud-gear-css')) return;
  const st = document.createElement('style');
  st.id = 'mm-hud-gear-css';
  st.textContent = GEAR_CSS;
  document.head.appendChild(st);
}

/**
 * What makes the HUD redraw itself.
 *
 * Six of these were names NOTHING EMITS — `run:update`, `run:damage`,
 * `run:gold`, `run:relic`, `run:potion` and `hud:refresh`. They cost the
 * player nothing, because every room scene calls `_syncHud()` -> `refresh()`
 * by hand after a purchase or a heal and `scenes/combat.js` pokes it
 * directly; the HUD was never stale. But a list of subscriptions where
 * half the entries cannot fire is a list nobody can read, and the next
 * person to wonder "why doesn't the purse update" would have added a
 * seventh dead name to it.
 *
 * `tests/bus-names/check.py` resolves this array now and fails on a name
 * with no emitter, so it cannot silt up again.
 */
const EVENTS = [
  'run:start', 'run:enterNode', 'run:combatEnd', 'run:reward',
  'run:heal', 'run:deck', 'settings:changed', 'scene:entered',
];

/** What the HUD shows when `ctx.run` does not exist yet. */
const MOCK = {
  companionName: 'Marmalade', kidName: 'Maya',
  courage: 52, maxCourage: 70, lostThings: 137,
  cluesFound: 2, luck: 1,
  region: 'foyer', wing: 1, depth: 3, hauntLevel: 0, seed: '—',
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

/** The house has seventeen wings — the same seventeen the map counts. */
const WINGS = Object.keys(REGION_LABEL).length;

/** Snack slots are keyed ⇧1..⇧3 — the plain digits belong to the hand. */
const SNACK_KEYS = ['⇧1', '⇧2', '⇧3'];

/** Round 30 graft: the smallest a belt socket gets before the belt gives its
 *  last few to a "+N" medallion. */
const SOCK_MIN = 22;
/** ...and the largest it grows to where the rail has channel to spare: the
 *  plate round it (2 x 4 px) still clears the rail's mouldings. */
const SOCK_MAX = 33;
/** ROUND 33 -- THE POUCH. Survey 4, both judges, hud-late at 1280: ten
 *  Keepsakes and eight Gear shrank every icon to about 20 px, and HAUNT and
 *  the seed lost their labels. A group of more than POUCH_AT now folds into
 *  a labelled pouch medallion ("KEEPSAKES 10") that fans the whole group out
 *  on hover, focus or a press; beside it as many of the group's objects as
 *  the rail holds at 32-34 px (never under SOCK_FLOOR), a gap between each. */
const POUCH_AT = 6;
const POUCH_PEEK = 6;
const SOCK_FLOOR = 28;   // round 40: 30 -> 28, the third object a group before the 2 px
/** Round 33 graft: the objects a pouched group shows beside its cartouche
 *  before the socket starts giving up pixels (all three judges: three). */
const PEEK_WANT = 3;

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
    const wantEsc = this.o.escape === true;
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
        <div class="mm-hud__chip mm-hud__clue" tabindex="0"></div>
        <div class="mm-hud__chip mm-hud__luck" tabindex="0"></div>
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
    this.$clue = root.querySelector('.mm-hud__clue');
    this.$luck = root.querySelector('.mm-hud__luck');
    this.$snacks = root.querySelector('.mm-hud__snacks');
    this.$extra = root.querySelector('.mm-hud__group--extra');
    this.$relics = root.querySelector('.mm-hud__relics');
    this.$gear = root.querySelector('.mm-hud__gear');
    this.$haunt = root.querySelector('.mm-hud__haunt');
    this.$seed = root.querySelector('.mm-hud__seed');
    this.$deck = root.querySelector('.mm-hud__deck');
    this.$settings = root.querySelector('.mm-hud__settings');

    this.$where.prepend(icon('res.region'));
    // The Courage plate wears its heart on the round enamel medallion over its
    // left end, as every chip wears its icon. Decorative: the meter's own
    // aria-label says what it is.
    this.$courage.prepend(icon('res.courage'));
    this.$gold.prepend(icon('res.lost-things'));
    /* Clues and Luck keep a PERSISTENT text node, unlike the chips that rebuild
       themselves each refresh: `addChip()` hands this node to a room scene that
       still writes its own Clue chip, and a node that gets replaced every
       refresh would leave that scene writing into a detached span. */
    /* Round 30: each readout is its icon and its FIGURE; the word it counts
       is kept for a screen reader (and said by its tooltip), not lettered
       into the channel -- the belt needs the room. A room scene that still
       writes its own Clue/Luck text gets the hidden echo node (addChip()),
       so its words never reappear in the rail. */
    this.$clue.append(icon('ui.search'), text(''), srWord(''));
    this.$luck.append(icon('ui.star'), text(''), srWord(''));
    this.$clueT = this.$clue.querySelector('.mm-hud__t');
    this.$luckT = this.$luck.querySelector('.mm-hud__t');
    this.$clueW = this.$clue.querySelector('.mm-hud__sr');
    this.$luckW = this.$luck.querySelector('.mm-hud__sr');
    this.$clueEcho = echo(); this.$clue.append(this.$clueEcho);
    this.$luckEcho = echo(); this.$luck.append(this.$luckEcho);
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

    /* where — WING, not "floor".
       The map header says "Wing 1 of 6" — of tonight's ROUTE, not of the
       mansion's seventeen — and this strip is mounted directly
       above it; saying "Floor 1" in the same breath invented a third word for
       one number. "Floor" is also wrong on its own terms — several wings sit on
       the same storey. `run.wing` is the ladder position; `run.floor` is its
       documented alias and the fallback for a stand-in that only has that. */
    const region = REGION_LABEL[r.region || r.regionId] || cap(r.region || 'Somewhere');
    const wing = num(r.wing ?? r.floor, 1);
    const rooms = num(r.depth, 0);
    this.$where.textContent = '';
    this.$where.append(icon('res.region'), text(region), sub(`Wing ${wing}`));
    this.$where.dataset.tip =
      `${region}. Wing ${wing} of ${WINGS} — the house has ${WINGS}.` +
      (rooms ? ` You are ${plural(rooms, 'room')} deep.` : '') +
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
    /* round 20: the purse says what it counts. A bare "137" by a coin read as
       a number with no name to the judges (RUBRIC-r20: "a bare number that
       does not say what it counts is a defect"); Clues and Luck already say. */
    const purse = num(r.lostThings ?? r.gold, 0);
    this.$gold.append(icon('res.lost-things'), text(String(purse)), unit(word(purse, 'Button')));
    this.$gold.setAttribute('aria-label', plural(purse, 'Button'));

    /* Clues and Luck — the run awards both and, until now, only the four room
       screens showed them (through `addChip()`), so on the map and inside a
       Scuffle they were currencies the player could not see. `flags` is a
       getter on the real run that aggregates Keepsake + Gear + pity; the mock
       has no such getter, hence the explicit branch rather than `r.flags?.luck`
       — CONTRACTS rule 8: never `?.` a run API that must exist. */
    const clues = num(r.cluesFound ?? r.clues, 0);
    const luck = num(r.flags ? r.flags.luck : r.luck, 0);
    this.$clueT.textContent = String(clues);
    this.$clueW.textContent = ` ${word(clues, 'Clue')}`;
    this.$clue.setAttribute('aria-label', `${plural(clues, 'Clue')} found`);
    this.$clue.dataset.tipTitle = plural(clues, 'Clue');
    this.$clue.dataset.tip =
      'What you have worked out about where the animals went. Curiosities and some rooms give them up, and they carry over to the investigation board at the clubhouse.';
    this.$luckT.textContent = `+${luck}`;
    this.$luckW.textContent = ' Luck';
    this.$luck.setAttribute('aria-label', `Luck plus ${luck}`);
    this.$luck.dataset.tipTitle = `Luck +${luck}`;
    this.$luck.dataset.tip =
      'How much more likely a Rare Trick is to turn up in a reward. Keepsakes raise it, and so does taking none of the three.';
    // No Luck is the normal state; an always-on "+0" would be noise.
    this.$luck.hidden = luck <= 0;

    // snacks
    this._snackRun = r;
    this._renderSnacks(this._snackSpread !== false);
    this._fitSoon();

    this._refreshKeepsakes(r);
  }

  /* The Snack settings, and how many of them stand on the rail.

     Round 19 (the rail at 1280) collapsed the EMPTY settings into one that
     carried "×3" — and all three of that round's judges read the bare figure,
     sitting beside "No Keepsakes", as a count of Keepsakes that contradicted
     the plate next to it. An empty setting now holds the GHOST of a sweet (the
     house's painted snack, drained to a shadow in the hollow), the way an
     empty potion slot shows the bottle's outline: it says what goes there.
     Every free setting stands on the rail while the rail has room for it
     (`spread`); only when a full run's Keepsakes and Gear leave no room — the
     Steam Deck's 1280 — do the free ones fold into ONE ghost setting with
     their number on it, so the rail still holds one row. */
  _renderSnacks(spread) {
    const r = this._snackRun || this.data;
    const snacks = Array.isArray(r.snacks) ? r.snacks : [];
    const cap_ = num(r.snackCap, 3);
    const live = !!this.o.useSnacks;
    this._snacks = snacks;
    this.$snacks.textContent = '';
    this.$snacks.dataset.live = live ? '1' : '0';
    const free = Math.max(0, cap_ - snacks.length);
    this._snackFree = free;
    const folded = !spread && free > 1;
    this.$snacks.dataset.folded = folded ? '1' : '0';
    const slots = snacks.slice(0, cap_).map((s, i) => [s, i]);
    if (folded) slots.push([null, snacks.length]);
    else for (let j = 0; j < free; j++) slots.push([null, snacks.length + j]);
    const ghost = objectUrl('snack');
    /* ROUND 20 GRAFT: the settings say what they are. Three dark settings
       after Luck said nothing to a judge; an engraved caption before them
       does (never a bare "x3") */
    const capt = document.createElement('span');
    capt.className = 'mm-hud__snackcap';
    capt.textContent = 'Snacks';
    capt.setAttribute('aria-hidden', 'true');
    this.$snacks.appendChild(capt);
    for (const [s, i] of slots) {
      // A filled slot is a real button only where eating one is a real action.
      // Everywhere else it is a focusable, hoverable read-out that says why.
      const slot = document.createElement(s && live ? 'button' : 'div');
      slot.className = 'mm-hud__snack' + (s ? '' : ' is-empty');
      slot.tabIndex = 0;
      const pic = s ? objectUrl(snackKey(s.id)) : null;
      if (pic) {
        const o = document.createElement('i');
        o.className = 'kit-obj mm-hud__snackobj';
        o.style.setProperty('--obj', `url('${pic}')`);
        o.setAttribute('aria-hidden', 'true');
        slot.appendChild(o);
      } else if (s) {
        slot.appendChild(icon('res.snack'));
      } else if (ghost) {
        const o = document.createElement('i');
        o.className = 'kit-obj mm-hud__snackghost';
        o.style.setProperty('--obj', `url('${ghost}')`);
        o.setAttribute('aria-hidden', 'true');
        slot.appendChild(o);
      }
      if (!s && folded) {
        /* round 20: never a bare "×3" -- the folded setting says what it is
           counting, in the rail's engraved small capitals */
        const n = document.createElement('b');
        n.className = 'mm-hud__snackfree';
        n.textContent = `${free} free`;
        n.setAttribute('aria-hidden', 'true');
        slot.appendChild(n);
        slot.classList.add('is-folded');
      }
      const many = !s && folded;
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
        slot.dataset.tipTitle = many ? `${free} empty Snack slots` : 'Empty Snack slot';
        slot.dataset.tip = `You can carry ${cap_} Snacks. Find them in treasure, at Mr. Moth's and in Curiosities.`;
        slot.setAttribute('aria-label', many ? `${free} empty Snack slots` : 'Empty Snack slot');
      }
      this.$snacks.appendChild(slot);
    }
  }

  /** Does the rail hold ONE row? Tried after layout (and again on a resize,
   *  and once the fonts are in).
   *
   *  ROUND 20 -- the Steam Deck bug: a run carrying ten Keepsakes and a full
   *  backpack wrapped the rail to two rows at 1280, dropping Haunt, the seed,
   *  Tricks and Settings onto a second line over the room. Round 20 answered
   *  by folding whole groups into plates of words; round 30 (`_fit`) keeps
   *  every object on the rail instead, as a belt of sockets. */
  _fitSoon() {
    if (this._fitQueued) return;
    this._fitQueued = true;
    requestAnimationFrame(() => { this._fitQueued = false; this._fit(); });
    if (!this._fitBound) {
      this._fitBound = true;
      const onResize = () => this._fitSoon();
      window.addEventListener('resize', onResize);
      this._offs.push(() => window.removeEventListener('resize', onResize));
      document.fonts?.ready?.then(() => { if (this.el) this._fitSoon(); });
      /* a face first USED after load starts loading then, after `ready` has
         long resolved: the rail measured in the fallback face folds groups
         the real face has room for, so every face that lands refits it */
      const onFonts = () => { if (this.el) this._fitSoon(); };
      document.fonts?.addEventListener?.('loadingdone', onFonts);
      this._offs.push(() => document.fonts?.removeEventListener?.('loadingdone', onFonts));
    }
  }

  /** Is the rail over-full: a group dropped a row, the rail scrolls, or the
   *  belt spills or wraps inside its group? */
  _tight() {
    const groups = [...this.el.querySelectorAll(':scope > .mm-hud__group')].filter((g) => g.offsetWidth);
    /* round 30 graft: by the groups' MIDDLES -- the Keepsake and Gear plates
       stand taller than a readout, so their tops sit higher on one row */
    const tops = groups.map((g) => g.offsetTop + g.offsetHeight / 2);
    if (Math.max(...tops) - Math.min(...tops) > 6) return true;
    if (this.el.scrollWidth > this.el.clientWidth + 1) return true;
    /* round 33 graft (BONEBLACK): the wing's name squeezed into its ellipsis
       is over-full too -- a flex rail shrinks it before anything wraps --
       unless the rail has already closed up on purpose (data-dense) */
    const wt = this.$where?.querySelector('.mm-hud__t');
    if (wt && this.el.dataset.dense !== '1' && wt.scrollWidth > wt.clientWidth + 1) return true;
    const keep = this.$relics.parentElement;
    if (keep.scrollWidth > keep.clientWidth + 1) return true;
    for (const list of [this.$relics, this.$gear]) {
      if (list.hidden) continue;
      const kids = [...list.children].filter((k) => k.offsetWidth && !k.classList.contains('mm-hud__tray'));
      if (kids.length > 1 && kids[kids.length - 1].offsetTop > kids[0].offsetTop + 4) return true;
    }
    return false;
  }

  /* ROUND 30 -- THE BELT. Survey 3, both judges, on hud-late at 1280: "the
     ten Keepsakes collapse to two overlapping coins and the eight Gear show no
     icon at all -- '10 KEEPSAKES ◆ 8 GEAR ▼' is just words crushed between
     SNACKS and Haunt". Round 20 folded whole groups into a plate that SAID
     what it held; a plate of words is exactly the defect. Now every Keepsake
     and every piece of Gear stands as its own object in its own round
     gold-rimmed socket, a belt of them along the rail, and the rail makes
     room for them the other way round -- the readouts give up their words
     (each keeps its icon, its figure and its tooltip) and the type no longer
     shares the channel with captions. Only if even a tight belt cannot hold
     the load does it give up its LAST few sockets to one enamel "+N"
     medallion, which opens a tray of the rest, each still its own object:

       0  every socket, at the belt's size, every readout's word lettered
       1  the words the map and the tooltips already say go to a screen
          reader (the wing's number, Haunt's word, the seed's figures)
       2  every socket, a size down
       3  every socket, two sizes down, shoulder to shoulder
       4  the first sockets, and "+N" for the rest (never fewer than two) */
  _fit() {
    if (!this.el || !this.el.isConnected || !this.el.offsetWidth) return;
    const total = (this._keepChips?.length || 0) + (this._gearChips?.length || 0);
    this.el.dataset.dense = '0';
    this.el.dataset.terse = '0';
    this.el.style.removeProperty('--sock');
    // the vine is a flex item: a stale one from the last fit costs its gap
    this.$relics.parentElement.dataset.vine = '0';
    const nK = this._keepChips?.length || 0, nG = this._gearChips?.length || 0;
    if (nK > POUCH_AT || nG > POUCH_AT) { this._fitPouch(nK, nG); return; }
    let lv = { snack: true, compact: false, over: 0 };
    this._applyFold(lv);
    if (this._tight()) this.el.dataset.terse = '1';
    /* ROUND 30 GRAFT: the belt takes every pixel the channel has. The scroll
       flourish that filled the leftover channel is gone (hud.css), and the
       sockets shrink a PIXEL at a time from the belt's wide size until the
       rail holds one row -- 26 px or so on the Deck's 1280, never under 22 --
       instead of dropping two whole sizes and leaving the rest as ornament. */
    const first = (this._keepChips || [])[0] || (this._gearChips || [])[0];
    if (this._tight() && first && first.offsetWidth) {
      const wide = Math.floor(first.offsetWidth);
      let s = wide;
      while (this._tight() && s > Math.max(SOCK_MIN, SOCK_FLOOR)) {
        s -= 1;
        lv = { snack: true, compact: s <= SOCK_MIN + 2 ? 2 : 1, over: 0 };
        this.el.style.setProperty('--sock', `${s}px`);
        this._applyFold(lv);
      }
    }
    /* ...and where the rail has channel to spare (1600 and up), the sockets
       grow into it, up to a sixth over the belt's wide size, rather than
       leave a run of bare channel where the flourish was */
    if (!this._tight() && first && first.offsetWidth && !lv.compact) {
      const wide = first.offsetWidth;
      let s = Math.floor(wide);
      while (s + 1 <= Math.min(wide * 1.16, SOCK_MAX)) {
        this.el.style.setProperty('--sock', `${s + 1}px`);
        this._applyFold(lv);
        if (this._tight()) { this.el.style.setProperty('--sock', `${s}px`); this._applyFold(lv); break; }
        s += 1;
      }
    }
    while (this._tight() && lv.over < total - 1) {
      lv = { snack: true, compact: 2, over: lv.over ? lv.over + 1 : 2 };
      this._applyFold(lv);
    }
    this.el.dataset.fold = String(lv.over ? 4 : lv.compact === 2 ? 3 : lv.compact ? 2 : this.el.dataset.terse === '1' ? 1 : 0);
    /* and if even that is over-full -- a late wing's long name with a
       four-figure purse -- the rail closes up rather than drop a row: the
       wing's name ends in an ellipsis (its tooltip says it whole) */
    if (this._tight()) this.el.dataset.dense = '1';
    /* the engraved vine fills the channel left over (hud.css); a stub of it
       shorter than a whole turn of the vine reads as a scribble, so it only
       shows where it has room for one */
    const keep = this.$relics.parentElement;
    const kids = [...keep.children].filter((k) => k.offsetWidth);
    const used = kids.reduce((a, k) => a + k.offsetWidth, 0) + (kids.length ? parseFloat(getComputedStyle(keep).columnGap) * kids.length : 0);
    /* round 30 graft: only where the sockets can take no more of it (they
       grow to SOCK_MAX first) -- a run with nothing in its belt, a wide
       screen -- does the vine fill a long bare channel; never a stub of it
       after the last Gear */
    keep.dataset.vine = keep.clientWidth - used >= 140 ? '1' : '0';
  }

  /** ROUND 33: a group past POUCH_AT folds into its pouch; the rail keeps
   *  every readout's word (Haunt, the seed) and gives up PEEKS -- the objects
   *  shown beside a pouch -- before it gives up anything else. */
  _fitPouch(nK, nG) {
    /* round 33 graft: the socket gives up a pixel at a time (34 at 1600, 32
       under 1400, never under SOCK_FLOOR) before a group gives up its third
       object; the largest socket that keeps PEEK_WANT a group wins */
    const top = window.innerWidth > 1400 ? 34 : 32;
    const lay = (sock) => {
      this.el.style.setProperty('--sock', `${sock}px`);
      const p = {
        k: nK > POUCH_AT, g: nG > POUCH_AT,
        vk: nK > POUCH_AT ? Math.min(nK, POUCH_PEEK) : nK,
        vg: nG > POUCH_AT ? Math.min(nG, POUCH_PEEK) : nG,
      };
      let lv = { snack: true, compact: false, over: 0, pouch: { ...p } };
      this._applyFold(lv);
      while (this._tight()) {
        /* the larger peek gives one up first; a group still laid whole
           folds into its own pouch only once both peeks are gone */
        if (p.k && p.vk >= p.vg && p.vk > 0) p.vk -= 1;
        else if (p.g && p.vg > 0) p.vg -= 1;
        else if (p.k && p.vk > 0) p.vk -= 1;
        else if (!p.k && nK) { p.k = true; p.vk = 0; }
        else if (!p.g && nG) { p.g = true; p.vg = 0; }
        else break;
        lv = { ...lv, pouch: { ...p } };
        this._applyFold(lv);
      }
      return Math.min(p.k ? p.vk : 99, p.g ? p.vg : 99);
    };
    let best = top, bestN = -1;
    for (let sock = top; sock >= SOCK_FLOOR; sock--) {
      const got = lay(sock);
      if (got > bestN) { best = sock; bestN = got; }
      if (got >= PEEK_WANT) break;
    }
    if (parseFloat(this.el.style.getPropertyValue('--sock')) !== best) lay(best);
    this.el.dataset.fold = '5';
    if (this._tight()) this.el.dataset.dense = '1';
    this.$relics.parentElement.dataset.vine = '0';
  }

  _applyFold(lv) {
    if (this._snackSpread !== lv.snack) {
      this._snackSpread = lv.snack;
      this._renderSnacks(lv.snack);
    }
    this._fold = { ...lv };
    this._arrange();
  }

  /** Lay the belt: the Keepsakes, a boss, the Gear, each in its own socket;
   *  with `over` set, the last `over` of them go behind one "+N" medallion
   *  (in the Gear's list when there is Gear, so the Gear stays where its
   *  readers look for it). The chips are the same nodes either way. */
  _arrange() {
    const f = this._fold || {};
    const keep = this._keepChips || [], gear = this._gearChips || [];
    if (f.pouch) {
      this.el.dataset.belt = 'pouch';
      if (keep.length) layPouch(this.$relics, keep, f.pouch.k, f.pouch.vk, 'keepsakes');
      if (gear.length) layPouch(this.$gear, gear, f.pouch.g, f.pouch.vg, 'gear');
      return;
    }
    const total = keep.length + gear.length;
    const over = Math.min(f.over || 0, total);
    const showN = total - over;
    const showK = keep.slice(0, Math.min(keep.length, showN));
    const showG = gear.slice(0, Math.max(0, showN - keep.length));
    const rest = [...keep.slice(showK.length), ...gear.slice(showG.length)];
    this.el.dataset.belt = f.compact === 2 ? 'tighter' : f.compact ? 'tight' : 'wide';
    if (keep.length) layBelt(this.$relics, showK);
    if (gear.length) layBelt(this.$gear, showG);
    if (rest.length) {
      const host = gear.length ? this.$gear : this.$relics;
      host.append(...moreMedallion(host, rest, keep.length - showK.length, gear.length - showG.length));
    }
  }

  _refreshKeepsakes(r) {

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
    this.$relics.dataset.folded = '0';
    this._keepChips = relics.map(keepsakeChip);
    tintBelt(this._keepChips);
    this._keepKeys = relics.map((k) => keepsakeKey(k.id));
    /* ROUND 20 GRAFT: laid straight on the rail, the Keepsakes lead with
       their count and noun ("6 Keepsakes") exactly as their folded plate
       and the Gear's do -- a judge saw "4 Gear" labelled and the row of
       Keepsakes beside it not */
    /* round 30: no count-and-noun lead any more -- the objects say it, and
       the words were what crushed the belt at 1280 */
    this._keepLbl = null;
    if (!relics.length) {
      const none = document.createElement('span');
      none.className = 'mm-hud__norelics';
      // round 19: shorter, so the rail holds one row on the Steam Deck
      none.textContent = 'No Keepsakes';
      none.tabIndex = 0;
      none.dataset.kw = 'keepsake';
      this.$relics.appendChild(none);
    }

    /* Gear only appears when the kid actually brought some, and it never shows a
       "none yet" placeholder: an empty Backpack is a loadout choice, not a gap
       waiting to be filled the way an empty Keepsake bar is. */
    this.$gear.textContent = '';
    this.$gear.dataset.folded = '0';
    this.$gear.hidden = !gear.length;
    this._gearChips = gear.map(gearChip);
    tintBelt(this._gearChips);
    this._gearKeys = gear.map((g) => gearKey(String(g.icon || g.id || '').replace(/^gear\//, '')));
    this._gearLbl = null;
    this._arrange();

    // meta
    const haunt = num(r.hauntLevel ?? this.ctx?.Save?.data?.hauntLevel, 0);
    this.$haunt.textContent = '';
    /* round 30: the word is lettered where the rail has room for it and a
       screen reader's where it does not (hud.css, the Deck's 1280) */
    this.$haunt.append(icon('res.haunt-level'), wideWord('Haunt '), text(String(haunt)));
    this.$haunt.dataset.tipTitle = `Haunt Level ${haunt}`;
    this.$haunt.dataset.tip = haunt > 0
      ? `Every Haunt Level stacks another permanent difficulty modifier onto the whole expedition. You are running ${haunt} of them.`
      : 'The base difficulty. Win an expedition to unlock Haunt Level 1, which adds a permanent modifier.';

    // One notation everywhere: Select and Game Over both print formatSeed(), so the HUD
    // must too or the same run shows three different 'seeds'.
    const seed = (r.seed === undefined || r.seed === null) ? '—' : formatSeed(r.seed);
    this.$seed.textContent = '';
    /* round 33 graft: the seed is labelled the way Haunt is (BONEBLACK) */
    this.$seed.append(icon('res.seed'), wideWord('Seed '), text(seed));
    this.$seed.dataset.tipTitle = 'Seed';
    this.$seed.dataset.tip = `${seed} — this number generates the entire expedition. The same seed replays the same rooms, the same rewards and the same shop.`;

    const deck = Array.isArray(r.deck) ? r.deck : [];
    this.$deck.textContent = '';
    /* round 30: the deck's own icon says Tricks; its figure stands beside it */
    this.$deck.append(icon('res.deck'), srWord('Tricks '), text(String(deck.length)));
    this.$deck.setAttribute('aria-label', `View your ${plural(deck.length, 'Trick')}`);
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
   *
   * Clues and Luck are carried natively now, so a chip that asks for one of
   * them is NOT added twice: the HUD returns its own chip's text node instead
   * and the caller keeps updating "its" chip in place, in the one position the
   * player learns. The four room screens went through here for exactly this
   * (see `scenes/reward.js#_buildHudExtras`) and can drop their copy whenever
   * meta-run gets to it.
   *
   * @returns {Element} the node to update in place.
   */
  addChip(node) {
    const kw = node && node.dataset ? node.dataset.kw : '';
    if (kw === 'clue' && this.$clueEcho) return this.$clueEcho;
    if (kw === 'luck' && this.$luckEcho) return this.$luckEcho;
    this.$extra?.appendChild(node);
    return node;
  }

  destroy() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this.el?.remove();
    this.el = null;
  }
}

/**
 * Lay a group's chips straight on the belt (round 30): every one its own
 * object in its own socket. Rebuilt in place on every fit; the chips are the
 * same nodes, so their listeners and tooltips travel with them.
 */
function layBelt(list, chips) {
  list.textContent = '';
  for (const c of chips) list.appendChild(c);
  list.dataset.folded = '0';
  list.setAttribute('role', 'list');
  list.removeAttribute('data-open');
}

/** What each pouch has struck on its enamel: a drawstring pouch for the
 *  Keepsakes, a knapsack for the Gear (24-unit grid, even-odd filled). */
const POUCH_GLYPH = {
  keepsakes: 'M8.4 2.6h7.2l-1.7 3.4c4.1 1.7 6.9 5.9 6.9 10.1 0 3.6-3 5.6-8.8 5.6s-8.8-2-8.8-5.6c0-4.2 2.8-8.4 6.9-10.1zM9.2 6.6h5.6v1.5H9.2zM11.2 12.2h1.6l.5 3.6h-2.6z',
  gear: 'M9 2.4h6v2.4h-1.8v-.7h-2.4v.7H9zM6.6 5.2h10.8A2.6 2.6 0 0 1 20 7.8v11.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 19.4V7.8a2.6 2.6 0 0 1 2.6-2.6zM7.4 12h9.2v5.6H7.4zM9.2 13.5v1.5h5.6v-1.5z',
};
const POUCH_WORD = { keepsakes: ['Keepsake', 'Keepsakes'], gear: ['Gear', 'Gear'] };

/**
 * ROUND 33: lay a group either whole (layBelt) or as its POUCH: a labelled
 * enamel medallion with the group's count ("KEEPSAKES 10"), then the tray of
 * the rest (hidden until fanned), then `peek` of its objects in their
 * sockets. The tray fans out on hovering or focusing the pouch, or pressing
 * it (a pad, a finger); Escape or a press elsewhere shuts it. Every object is
 * still its own chip with its own tooltip, and the same node either way.
 */
function layPouch(list, chips, pouched, peek, kind) {
  if (!pouched) { for (const c of chips) c.querySelector(':scope > .mm-hud__peekmore')?.remove(); layBelt(list, chips); return; }
  const n = chips.length;
  const shown = chips.slice(0, peek), rest = chips.slice(peek);
  const [one, many] = POUCH_WORD[kind];
  const name = n === 1 ? one : many;
  list.textContent = '';
  list.dataset.folded = '2';
  list.removeAttribute('data-open');
  const btn = document.createElement('button');
  btn.type = 'button';
  /* round 33 graft: ONE line in a scrolled cartouche, "KEEPSAKES 10" (CADMIUM) */
  btn.className = 'mm-hud__pouch kit-beltpouch kit-beltpouch--cart';
  btn.dataset.kind = kind;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', `${n} ${name}${rest.length ? `, ${rest.length} more in the pouch. Show them.` : ''}`);
  /* no tooltip of its own: pointing at the pouch fans the group out in the
     tooltip's place, and each object there carries its own */
  btn.innerHTML = `<i class="kit-beltpouch__medal" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${POUCH_GLYPH[kind]}"/></svg></i>`
    + `<span class="kit-beltpouch__txt" aria-hidden="true"><b class="kit-beltpouch__label">${name}</b><b class="kit-beltpouch__n">${n}</b></span>`;
  list.appendChild(btn);
  if (rest.length) {
    const tray = document.createElement('div');
    tray.className = 'mm-hud__tray mm-hud__tray--pouch';
    tray.setAttribute('role', 'list');
    tray.setAttribute('aria-label', `The rest of your ${many}`);
    const head = document.createElement('b');
    head.className = 'mm-hud__trayt';
    head.setAttribute('aria-hidden', 'true');
    head.textContent = shown.length ? `${rest.length} more ${rest.length === 1 ? one : many}` : `${n} ${name}`;
    tray.appendChild(head);
    for (const c of rest) tray.appendChild(c);
    list.appendChild(tray);
    const sync = () => btn.setAttribute('aria-expanded', list.dataset.open === '1' ? 'true' : 'false');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.dataset.open = list.dataset.open === '1' ? '0' : '1';
      sync();
      if (list.dataset.open === '1') {
        const shut = (ev) => {
          if (list.contains(ev.target)) return;
          list.dataset.open = '0'; sync();
          document.removeEventListener('pointerdown', shut, true);
        };
        document.addEventListener('pointerdown', shut, true);
      }
    });
    if (!list._pouchKeys) {
      list._pouchKeys = true;
      list.addEventListener('keydown', (e) => {
        const b = list.querySelector(':scope > .mm-hud__pouch');
        if (!b || e.key !== 'Escape' || !list.querySelector(':scope > .mm-hud__tray')) return;
        e.preventDefault(); e.stopPropagation();
        list.dataset.open = '0';
        b.setAttribute('aria-expanded', 'false');
        b.focus();
        list.classList.add('is-shut');
        const lift = () => { list.classList.remove('is-shut'); b.removeEventListener('blur', lift); list.removeEventListener('mouseleave', lift); };
        b.addEventListener('blur', lift);
        list.addEventListener('mouseleave', lift);
      });
    }
  }
  /* round 40: what the pouch still holds, struck as "+7" on the last object
     shown -- the group reads as ten, not as three (survey 6, J2) */
  for (const c of chips) c.querySelector(':scope > .mm-hud__peekmore')?.remove();
  /* ...and then the cartouche says only what the group IS: its count is the
     objects shown and the "+7" (its aria-label still says all ten) */
  btn.classList.toggle('is-peeking', !!(rest.length && shown.length));
  if (rest.length && shown.length) {
    const more = document.createElement('b');
    more.className = 'mm-hud__peekmore';
    more.setAttribute('aria-hidden', 'true');
    more.textContent = `+${rest.length}`;
    shown[shown.length - 1].appendChild(more);
  }
  for (const c of shown) list.appendChild(c);
  list.setAttribute('role', 'list');
}

/**
 * The belt's overflow (round 30): one round enamel medallion lettered "+N",
 * and under the rail a tray holding the N objects it stands for, each still
 * its own chip with its own tooltip -- opened by hover, focus or a click (a
 * pad or a finger), shut by Escape or a click elsewhere.
 */
function moreMedallion(list, rest, nKeep, nGear) {
  const n = rest.length;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mm-hud__more kit-beltsock__more';
  btn.setAttribute('aria-expanded', 'false');
  const what = [nKeep ? plural(nKeep, 'more Keepsake', 'more Keepsakes') : '', nGear ? plural(nGear, 'more Gear', 'more Gear') : '']
    .filter(Boolean).join(' and ');
  btn.setAttribute('aria-label', `${what}. Show them.`);
  btn.dataset.tipTitle = `+${n}`;
  btn.dataset.tip = `${what[0].toUpperCase()}${what.slice(1)} than the rail has room for. Point here, or press it, to see them.`;
  btn.dataset.tipPlacement = 'bottom';
  const fig = document.createElement('b');
  fig.className = 'mm-hud__moren';
  fig.textContent = `+${n}`;
  btn.appendChild(fig);
  const tray = document.createElement('div');
  tray.className = 'mm-hud__tray';
  tray.setAttribute('role', 'list');
  tray.setAttribute('aria-label', 'The rest of what you carry');
  const head = document.createElement('b');
  head.className = 'mm-hud__trayt';
  head.setAttribute('aria-hidden', 'true');
  head.textContent = `${n} more`;
  tray.appendChild(head);
  for (const c of rest) tray.appendChild(c);
  list.dataset.folded = '1';
  const sync = () => {
    const open = list.dataset.open === '1' || list.matches(':hover') || list.matches(':focus-within');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    list.dataset.open = list.dataset.open === '1' ? '0' : '1';
    sync();
    if (list.dataset.open === '1') {
      const shut = (ev) => {
        if (list.contains(ev.target)) return;
        list.dataset.open = '0'; sync();
        document.removeEventListener('pointerdown', shut, true);
      };
      document.addEventListener('pointerdown', shut, true);
    }
  });
  if (!list._foldWired) {
    list._foldWired = true;
    for (const ev of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) {
      list.addEventListener(ev, () => requestAnimationFrame(() => {
        const b = list.querySelector(':scope > .mm-hud__more');
        if (!b) return;
        const open = list.dataset.open === '1' || list.matches(':hover') || list.matches(':focus-within');
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
      }));
    }
    list.addEventListener('keydown', (e) => {
      const b = list.querySelector(':scope > .mm-hud__more');
      if (!b || e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      list.dataset.open = '0';
      b.focus();
      b.setAttribute('aria-expanded', 'false');
      list.classList.add('is-shut');
      const lift = () => { list.classList.remove('is-shut'); list.removeEventListener('mouseleave', lift); b.removeEventListener('blur', lift); };
      list.addEventListener('mouseleave', lift);
      b.addEventListener('blur', lift);
    });
  }
  return [btn, tray];
}

function text(s) { const n = document.createElement('span'); n.className = 'mm-hud__t'; n.textContent = s; return n; }
/** a readout's word, lettered on a wide rail, a screen reader's on a narrow one */
function wideWord(s) { const n = document.createElement('span'); n.className = 'mm-hud__w'; n.textContent = s; return n; }
/** the word a readout counts, for a screen reader only (round 30) */
function srWord(s) { const n = document.createElement('span'); n.className = 'mm-hud__sr'; n.textContent = s; return n; }
/** where a room scene's own Clue/Luck text lands, out of sight (round 30) */
function echo() { const n = document.createElement('span'); n.className = 'mm-hud__echo'; n.hidden = true; n.setAttribute('aria-hidden', 'true'); return n; }
/** the word a figure counts, engraved small beside it ("137 Buttons") */
function unit(s) { const n = document.createElement('span'); n.className = 'mm-hud__u'; n.textContent = s; return n; }
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
/* ROUND 40 -- EACH OBJECT ITS OWN RIM (survey 6, J2: "three sepia chips
   about 22 px across at 1280, grey on grey with no rim colour, so the ten
   Keepsakes cannot be told apart"). Every Keepsake and every piece of Gear
   on the strip is set in a socket rimmed in one of the house's enamels --
   gilt, verdigris, madder, indigo, violet, bone -- chosen by the object
   itself, so two neighbours never wear one colour and each reads as its own
   thing at a glance (ui/hud.css --tint). */
const RIM_TINTS = ['#c99a4e', '#4f9a82', '#b4524a', '#4f7fb4', '#8a62c4', '#d8c8a2'];
function rimTint(id, i) {
  let h = 7;
  for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RIM_TINTS[(h + i) % RIM_TINTS.length];
}
function tintBelt(chips) {
  let prev = null;
  chips.forEach((c, i) => {
    let t = rimTint(c.dataset.tint || c.getAttribute('aria-label'), 0);
    for (let k = 1; t === prev && k < RIM_TINTS.length; k++) t = rimTint(c.dataset.tint || c.getAttribute('aria-label'), k);
    c.style.setProperty('--tint', t);
    prev = t;
  });
}

function keepsakeChip(k) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'mm-hud__relic kit-beltsock';
  chip.dataset.tint = k.id || k.name || '';
  chip.setAttribute('role', 'listitem');
  chip.dataset.rarity = k.rarity || 'common';
  chip.appendChild(keepsakePicture(k.id));
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

/* ── Gear glyphs ─────────────────────────────────────────────────────────────
   One drawing per item, keyed by the `icon` name authored in data/backpack.js.
   Four identical knapsacks in a row told the player they were carrying four
   things and nothing about which four — the bar existed but did not inform, and
   a HUD that has to be hovered to be read is not surfacing anything.

   These live here rather than in `ui/icons.js` because that module owns intents,
   statuses, resources, nodes, types, rarities and chrome, and Gear is none of
   those; it is also another owner's file. Same stroke language as the Keepsake
   sigils: 24x24, no fill, `stroke-width: 1.6` from the CSS above.
   HAND-OFF: fold into ui/icons.js when it grows a Backpack set. */
const GEAR_GLYPHS = {
  whistle:    ['M4 10.2h8.4a2.9 2.9 0 0 1 0 5.8H4z', 'M16 9.6a5.2 5.2 0 0 1 0 7', 'M18.8 7a9 9 0 0 1 0 12.2'],
  treats:     ['M9.2 12h5.6', 'M7 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z', 'M17 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z'],
  camera:     ['M3 8.6h4.2L8.6 6.4h6.8l1.4 2.2H21v10.2H3z', 'M12 10.6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M18.4 10.6h.8'],
  toy:        ['M12 4.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4z', 'M5.4 9.6c4.2 2.1 9 2.1 13.2 0', 'M5.4 14.4c4.2-2.1 9-2.1 13.2 0'],
  tag:        ['M4.4 10.2a7.6 7.6 0 0 1 15.2 0', 'M12 10.6v2.2', 'M12 12.8l2.7 2.7L12 18.2l-2.7-2.7z'],
  flashlight: ['M3.2 9.8h6.6v4.4H3.2z', 'M9.8 8.2l4.2-2.4v12.4l-4.2-2.4z', 'M15.6 7.6l5-2.2', 'M15.6 16.4l5 2.2', 'M16.4 12h4.4'],
  radio:      ['M7 8.4h9.4v11.8H7z', 'M14.6 8.4V4.2', 'M9.6 11.6h4.2', 'M9.6 14.6h4.2', 'M9.6 17.4h4.2'],
  mirror:     ['M12 4.4a4.6 5.6 0 1 0 0 11.2 4.6 5.6 0 0 0 0-11.2z', 'M12 15.6v4', 'M9.8 19.6h4.4'],
  tool:       ['M16.4 3.6a5 5 0 0 0-4.6 6.9L4 18.3a2 2 0 0 0 2.8 2.8l7.8-7.8a5 5 0 0 0 6.9-4.6c0-.6-.1-1.2-.3-1.7l-3 3-2.6-.6-.6-2.6 3-3a5 5 0 0 0-1.6-.2z'],
  rope:       ['M12 5.2c3.3 0 6 1.2 6 2.6s-2.7 2.6-6 2.6-6-1.2-6-2.6S8.7 5.2 12 5.2z', 'M6 7.8v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4', 'M6 11.8v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-4'],
  chalkbox:   ['M4 11.4h16v8H4z', 'M7.2 11.4V5.8', 'M11.2 11.4V7.4', 'M15.2 11.4V6.4', 'M4 15h16'],
  glow:       ['M8.6 19l6.8-13.4', 'M4.8 12.6l-2-1', 'M19.2 11.4l2 1', 'M12 4.6V2.4', 'M12 21.6v-2'],
  compass:    ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M15.4 8.6l-2 4.8-4.8 2 2-4.8z'],
  notebook:   ['M6 4h12.4v16H6z', 'M9.2 4v16', 'M11.8 8.6h4.2', 'M11.8 12h4.2', 'M11.8 15.4h4.2'],
  blanket:    ['M3.6 8.4c2.6-2 5.6-2 8.4 0s5.8 2 8.4 0v8.6c-2.6 2-5.6 2-8.4 0s-5.8-2-8.4 0z', 'M3.6 12.8c2.6-2 5.6-2 8.4 0s5.8 2 8.4 0'],
  thermos2:   ['M8.4 3.4h7.2v2.4H8.4z', 'M9.4 5.8h5.2v14.8H9.4z', 'M9.4 11.4h5.2', 'M11 3.4V2'],
  battery2:   ['M3 9h13.6v6H3z', 'M16.6 10.8h2.6v2.4h-2.6z', 'M6.2 11.4v1.2', 'M9 11.4v1.2', 'M11.8 11.4v1.2'],
  tin2:       ['M3.8 8.2h16.4v11.6H3.8z', 'M9 8.2V5.4h6v2.8', 'M12 11v6', 'M9 14h6'],
};

/**
 * One piece of Backpack Gear: a cool, round chip. Deliberately the opposite of
 * the Keepsake chip on both axes a player reads first — shape and temperature —
 * so the two bars never have to be told apart by reading them.
 *
 * `data-gear` still carries the item's authored icon name, so a future art pass
 * can restyle a single item without touching this function.
 */
function gearChip(g) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'mm-hud__gearchip kit-beltsock kit-beltsock--moon';
  chip.setAttribute('role', 'listitem');
  chip.dataset.tint = 'gear/' + (g.id || g.icon || '');
  const icon = String(g.icon || g.id || '').replace(/^gear\//, '');
  chip.dataset.gear = icon;
  /* round 19: the item itself, painted (ui/objects.js), in the house's round
     velvet well; the stroked glyph only for an item with no painting */
  const pic = gearKey(icon) && objectUrl(gearKey(icon));
  if (pic) {
    chip.classList.add('has-obj');
    const o = document.createElement('i');
    o.className = 'kit-obj mm-hud__gearobj';
    o.style.setProperty('--obj', `url('${pic}')`);
    o.setAttribute('aria-hidden', 'true');
    chip.appendChild(o);
  } else {
    chip.appendChild(packGlyph(GEAR_GLYPHS[icon]));
  }
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

/**
 * The item's own drawing, or a stroked knapsack when nothing is authored for it
 * — a new item shows a pack rather than an empty circle.
 */
function packGlyph(paths = null) {
  const span = document.createElement('span');
  span.className = 'mm-icon';
  span.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const d of paths && paths.length ? paths : [
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

/** A Keepsake as the house's small painted object (ui/objects.js), set in its
 *  brass socket; the line sigil only if a Keepsake has no painting. */
function keepsakePicture(id) {
  const url = objectUrl(keepsakeKey(id));
  if (!url) return sigil(id);
  const o = document.createElement('i');
  o.className = 'kit-obj mm-hud__relicobj';
  o.style.setProperty('--obj', `url('${url}')`);
  o.setAttribute('aria-hidden', 'true');
  return o;
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
