/**
 * The Clubhouse — neighbourhood headquarters, between expeditions.
 *
 * Deliberately the opposite of the mansion: lamplight instead of moonlight, wood and
 * cork and masking tape instead of brass and cold stone, a kid's handwriting instead
 * of an engraved plaque. That contrast is the emotional core of the game, so this
 * screen is warm on purpose.
 *
 * Panels: the investigation board (polaroids, string, clues, recovered blueprint),
 * the Menagerie roster, the missing-pet tracker, and the Backpack loadout editor.
 * Persistent sidebar: Haunt Level, run stats, and the way back into the house.
 *
 * OWNER: frontend agent.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { COMPANIONS, KIDS, TERMS, REGION_ORDER } from '../data/schema.js';
import {
  ensureCss, fontsReady, companionPortrait, kidPortrait, petGlyph, blueprintSrc,
  el, svg, rovingFocus, setReduceMotion, REGION_NAMES,
} from '../ui/portrait.js';
import { KID_CODEX, STARTER_COMPANIONS } from './select.js';

const CSS_KIT  = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_CLUB = new URL('./clubhouse.css', import.meta.url).href;

/** Backpack Gear, from design doc §18–20. [name, slots, description] */
export const GEAR = [
  ['Flashlight',     1, 'The basic one. Reveals a little more of every dark room.'],
  ['Spare Batteries', 1, 'Refreshes one exhausted piece of Gear mid-expedition.'],
  ['First Aid Kit',  2, `Restores ${TERMS.hp} once per expedition.`],
  ['Walkie-Talkie',  2, 'Warns you what is waiting two rooms ahead.'],
  ['Camera',         2, 'Photographs supernatural clues. Sees things you cannot.'],
  ['Pocket Mirror',  1, 'Shows what is behind you, and occasionally what is not.'],
  ['Multitool',      2, 'Opens things the house would rather stayed shut.'],
  ['Rope',           2, 'Turns a drop into a route.'],
  ['Chalk',          1, 'Marks a room so the house cannot move it on you.'],
  ['Glow Sticks',    1, 'One room stays lit no matter what the house does.'],
  ['Compass',        1, 'Points toward the Heart. Usually.'],
  ['Dog Whistle',    1, 'Reveals hidden canine creatures. Bones and Pudding both answer.'],
  ['Notebook',       1, 'Keeps a Clue you would otherwise lose on a failed expedition.'],
  ['Pet Treats',     1, 'Calms a frightened ordinary animal. Opens kinder Curiosity endings.'],
  ['Blanket',        2, 'Builds a better Safe Room.'],
  ['Thermos',        2, 'One warm drink. It matters more than it should.'],
  ['Familiar Toy',   1, 'Something of your pet’s. Certain rooms react to it.'],
  ['Collar Tag',     1, 'Interacts with whatever the house uses to keep track of its animals.'],
];
const GEAR_BY_NAME = Object.fromEntries(GEAR.map((g) => [g[0], g]));
const BACKPACK_SLOTS = 5;

const HAUNTS = [
  [0, 'Standard', 'The mansion as it is.'],
  [1, 'Stirred', 'Enemies hit harder and have more Courage.'],
  [2, 'Watchful', 'Curiosities turn dangerous.'],
  [3, 'Awake', 'Bosses gain an additional ability.'],
  [4, 'Hungry', 'Far more dangerous room combinations.'],
  [5, 'Possessive', 'The house actively works against you.'],
];

/** Clues the board shows once the corresponding thing has happened. */
const BOARD_CLUES = [
  ['The Photograph', 'An old family photo with a completely ordinary cat in it. We recognise the cat. The photo is fifty years old.', true],
  ['The Feeding Room', 'Dozens of bowls, arranged neatly. Some are decades old. Some have fresh food in them.', true],
  ['The Collar', 'A collar in the middle of an empty room. The tag has a name none of us wrote down.', false],
  ['Scratching Behind the Wall', 'Something moves inside the walls when the house thinks we have stopped listening.', false],
  ['Doorway Paw Prints', 'Prints leading up to a doorway that is not there in the morning.', false],
];

export class ClubhouseScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this._portraits = [];
    this.panel = 'board';
  }

  async enter(params = {}) {
    const { ctx } = this;
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_CLUB)]);

    const settings = Save?.settings ?? {};
    setReduceMotion(!!settings.reduceMotion);
    document.documentElement.classList.toggle('mm-large-text', !!settings.largeText);
    try { ctx.atmosphere?.setMood?.('clubhouse'); } catch {}

    const data = Save?.data ?? {};
    this.rescued = new Set([...STARTER_COMPANIONS, ...(data.companionsRescued ?? [])]);
    this.petsRescued = new Set(data.petsRescued ?? []);
    this.revealed = new Set(data.blueprint?.revealed ?? ['foyer']);
    this.haunt = Math.max(0, Number(data.hauntLevel ?? 0));
    this.activeKid = data.activeKid && KID_CODEX[data.activeKid] ? data.activeKid : KIDS[0].slug;
    this.pack = this._loadPack(this.activeKid);

    this.panel = ['board', 'menagerie', 'pets', 'backpack'].includes(params.panel) ? params.panel : 'board';

    const root = this.root;
    root.innerHTML = '';
    root.dataset.panel = this.panel;

    root.appendChild(this._buildRoom());
    root.appendChild(this._buildHeader());

    const main = el('main', 'cl__main');
    main.appendChild(this._buildBoard());
    main.appendChild(this._buildMenagerie());
    main.appendChild(this._buildPets());
    main.appendChild(this._buildBackpack());
    root.appendChild(main);

    root.appendChild(this._buildSide());

    this._wire();
    await fontsReady();
    this._drawStrings();
    bus.emit('clubhouse:ready');
  }

  /* ── the room itself ────────────────────────────────────────────────────── */
  _buildRoom() {
    const room = el('div', 'cl-room');
    room.innerHTML = `
      <div class="cl-wall"></div>
      <div class="cl-lamp"><span class="cl-lamp__shade"></span><span class="cl-lamp__glow"></span></div>
      <div class="cl-lights">${Array.from({ length: 14 }, (_, i) =>
        `<i style="--i:${i};--d:-${(i * 0.42).toFixed(2)}s"></i>`).join('')}</div>
      <div class="cl-floor"></div>
      <div class="cl-dust">${Array.from({ length: 18 }, (_, i) =>
        `<i style="left:${(i * 5.6 + 3) % 100}%;--dur:${(16 + (i % 7) * 3)}s;--del:-${i * 1.7}s;--sz:${1 + (i % 3) * .8}px"></i>`).join('')}</div>`;
    return room;
  }

  /* ── header ─────────────────────────────────────────────────────────────── */
  _buildHeader() {
    const h = el('header', 'cl__head');

    const back = el('button', 'cl-back');
    back.type = 'button';
    back.innerHTML = '<span aria-hidden="true">&#8592;</span> Title';
    back.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    h.appendChild(back);

    const sign = el('div', 'cl-sign');
    sign.innerHTML = `
      <span class="cl-sign__board">
        <span class="cl-sign__line1">Neighbourhood</span>
        <span class="cl-sign__line2">Headquarters</span>
        <span class="cl-sign__sub">members only &middot; bring snacks</span>
      </span>
      <span class="cl-sign__nail cl-sign__nail--l" aria-hidden="true"></span>
      <span class="cl-sign__nail cl-sign__nail--r" aria-hidden="true"></span>`;
    h.appendChild(sign);

    const tabs = el('nav', 'cl-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Clubhouse sections');
    for (const [id, label] of [
      ['board', 'Investigation Board'], ['menagerie', 'The Menagerie'],
      ['pets', 'Missing Pets'], ['backpack', 'Backpack'],
    ]) {
      const b = el('button', 'cl-tab');
      b.type = 'button';
      b.dataset.panel = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === this.panel));
      b.textContent = label;
      tabs.appendChild(b);
    }
    h.appendChild(tabs);
    this._tabs = tabs;
    return h;
  }

  /* ── panel: investigation board ─────────────────────────────────────────── */
  _buildBoard() {
    const p = el('section', 'cl-panel cl-panel--board');
    p.dataset.panel = 'board';
    p.setAttribute('role', 'tabpanel');

    const cork = el('div', 'cork');
    cork.innerHTML = `<svg class="cork__string" aria-hidden="true"><g></g></svg>`;

    // the pinned pet polaroids
    const rot = [-3.4, 2.1, -1.6, 3.2, -2.4, 1.4, -3.0, 2.6];
    const pos = [
      [4, 8], [21, 3], [38, 10], [55, 4], [72, 9], [5, 46], [23, 52], [40, 45],
    ];
    KIDS.forEach((k, i) => {
      const info = KID_CODEX[k.slug] ?? {};
      const found = this.petsRescued.has(k.slug);
      const card = el('div', 'polaroid' + (found ? ' is-found' : ''));
      card.style.cssText = `left:${pos[i][0]}%;top:${pos[i][1]}%;--rot:${rot[i]}deg`;
      card.dataset.anchor = k.slug;
      card.innerHTML = `
        <span class="pin" aria-hidden="true"></span>
        <span class="polaroid__photo"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="${petGlyph(info.species || k.petKind)}"/></svg></span>
        <span class="polaroid__cap">${k.pet}</span>
        <span class="polaroid__sub">${k.name.split(' ')[0]}&rsquo;s</span>
        ${found ? '<span class="polaroid__stamp">Home</span>' : ''}`;
      cork.appendChild(card);
    });

    // recovered blueprint
    const bp = el('div', 'bpfrag');
    bp.style.cssText = 'right:2.5%;top:5%;--rot:1.6deg';
    bp.innerHTML = `
      <span class="pin pin--blue" aria-hidden="true"></span>
      <span class="bpfrag__label">The house, as far as we have mapped it</span>
      <span class="bpfrag__img"><img src="${blueprintSrc('mansion')}" alt="Hand-copied floor plan of the mansion" width="1448" height="1086" decoding="async"></span>
      <span class="bpfrag__count"><b>${this.revealed.size}</b> / ${REGION_ORDER.length} wings</span>`;
    cork.appendChild(bp);

    // clue notes
    const cluePos = [[58, 44], [74, 50], [59, 70], [76, 74], [42, 72]];
    BOARD_CLUES.forEach((c, i) => {
      const [title, text, known] = c;
      const note = el('div', 'note' + (known ? '' : ' is-unknown'));
      note.style.cssText = `left:${cluePos[i][0]}%;top:${cluePos[i][1]}%;--rot:${(i % 2 ? 1.8 : -2.2)}deg`;
      note.innerHTML = known
        ? `<span class="tape" aria-hidden="true"></span><b>${title}</b><p>${text}</p>`
        : `<span class="tape" aria-hidden="true"></span><b>?</b><p>Not found yet.</p>`;
      cork.appendChild(note);
    });

    // the thesis, in a kid's handwriting
    const thesis = el('div', 'scrawl');
    thesis.style.cssText = 'left:6%;top:78%;--rot:-1.2deg';
    thesis.innerHTML = `too many pets. same house. <u>not a coincidence.</u>`;
    cork.appendChild(thesis);

    p.appendChild(cork);
    this._cork = cork;
    return p;
  }

  /** Red string between the pinned polaroids, with a believable sag. */
  _drawStrings() {
    const cork = this._cork;
    if (!cork) return;
    const svgEl = cork.querySelector('.cork__string');
    const g = svgEl.querySelector('g');
    const box = cork.getBoundingClientRect();
    if (!box.width) return;
    svgEl.setAttribute('viewBox', `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);
    const pts = [...cork.querySelectorAll('.polaroid .pin')].map((pin) => {
      const r = pin.getBoundingClientRect();
      return [r.x + r.width / 2 - box.x, r.y + r.height / 2 - box.y];
    });
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + Math.abs(x1 - x0) * 0.14 + 10;
      d += `M${x0.toFixed(0)} ${y0.toFixed(0)}Q${mx.toFixed(0)} ${my.toFixed(0)} ${x1.toFixed(0)} ${y1.toFixed(0)}`;
    }
    if (pts.length > 2) {
      const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
      d += `M${ax.toFixed(0)} ${ay.toFixed(0)}Q${((ax + bx) / 2).toFixed(0)} ${(Math.max(ay, by) + 120).toFixed(0)} ${bx.toFixed(0)} ${by.toFixed(0)}`;
    }
    g.innerHTML = `<path class="cork__thread" d="${d}"/>`;
  }

  /* ── panel: the Menagerie roster ────────────────────────────────────────── */
  _buildMenagerie() {
    const p = el('section', 'cl-panel cl-panel--menagerie');
    p.dataset.panel = 'menagerie';
    p.setAttribute('role', 'tabpanel');

    p.appendChild(el('div', 'cl-panel__head', `
      <h2>The Menagerie</h2>
      <p>Sixteen animals the house kept. Free every one and they will show us the way to the Heart.</p>
      <div class="tally"><b>${this.rescued.size}</b> / ${COMPANIONS.length} freed</div>`));

    const scrap = el('div', 'scrapgrid');
    for (const c of COMPANIONS) {
      const got = this.rescued.has(c.slug);
      const cell = el('div', 'scrapcell' + (got ? '' : ' is-empty'));
      const pf = companionPortrait({ slug: c.slug, variant: '@1x', locked: !got, parallax: 0, shimmer: false });
      this._portraits.push(pf);
      cell.appendChild(pf.el);
      cell.appendChild(el('div', 'scrapcell__cap',
        got ? `<b>${c.name}</b><span>${c.title}</span>`
            : `<b>&mdash;</b><span>still in ${REGION_NAMES[c.region] ?? c.region}</span>`));
      if (got) cell.appendChild(el('span', 'scrapcell__tape'));
      scrap.appendChild(cell);
    }
    p.appendChild(scrap);
    return p;
  }

  /* ── panel: missing pets ────────────────────────────────────────────────── */
  _buildPets() {
    const p = el('section', 'cl-panel cl-panel--pets');
    p.dataset.panel = 'pets';
    p.setAttribute('role', 'tabpanel');

    p.appendChild(el('div', 'cl-panel__head', `
      <h2>Missing Pets</h2>
      <p>Eight of us. Eight animals still inside. The longer they are in there, the less of them comes back.</p>
      <div class="tally"><b>${this.petsRescued.size}</b> / ${KIDS.length} home</div>`));

    const grid = el('div', 'petgrid');
    for (const k of KIDS) {
      const info = KID_CODEX[k.slug] ?? {};
      const home = this.petsRescued.has(k.slug);
      const card = el('article', 'petcard' + (home ? ' is-home' : ''));
      card.innerHTML = `
        <div class="petcard__kid"></div>
        <div class="petcard__body">
          <h3>${k.pet}</h3>
          <p class="petcard__sp">${info.species ?? k.petKind}</p>
          <p class="petcard__lost">${info.lost ?? ''}</p>
          <p class="petcard__who">${k.name}</p>
          <div class="stagebar" role="img" aria-label="Transformation stage 1 of 5">
            ${[1, 2, 3, 4, 5].map((n) => `<i class="${n === 1 ? 'is-on' : ''}"></i>`).join('')}
            <span>${home ? 'home' : 'stage 1 — still an ordinary animal'}</span>
          </div>
        </div>`;
      card.querySelector('.petcard__kid').appendChild(
        kidPortrait({ ...k, petKind: info.species || k.petKind }, { w: 120, h: 134, tag: false }));
      grid.appendChild(card);
    }
    p.appendChild(grid);
    return p;
  }

  /* ── panel: backpack ────────────────────────────────────────────────────── */
  _buildBackpack() {
    const p = el('section', 'cl-panel cl-panel--backpack');
    p.dataset.panel = 'backpack';
    p.setAttribute('role', 'tabpanel');

    p.appendChild(el('div', 'cl-panel__head', `
      <h2>Backpack</h2>
      <p>Five slots. You cannot bring everything, and the thing you leave behind is always the thing the house asks for.</p>`));

    const who = el('div', 'packwho');
    who.setAttribute('role', 'radiogroup');
    who.setAttribute('aria-label', 'Whose backpack');
    for (const k of KIDS) {
      const b = el('button', 'packwho__b');
      b.type = 'button';
      b.dataset.kid = k.slug;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(k.slug === this.activeKid));
      b.textContent = k.name.split(' ')[0];
      who.appendChild(b);
    }
    p.appendChild(who);

    const cols = el('div', 'packcols');
    cols.innerHTML = `
      <div class="packbag">
        <h3 class="cl-h">Loaded <em class="packbag__slots"></em></h3>
        <ul class="packbag__list"></ul>
        <p class="packbag__hint">Click an item to take it back out.</p>
      </div>
      <div class="packshelf">
        <h3 class="cl-h">On the shelf</h3>
        <ul class="packshelf__list"></ul>
      </div>`;
    p.appendChild(cols);
    this._packPanel = p;
    this._renderPack();
    return p;
  }

  _loadPack(kidSlug) {
    const saved = Save?.data?.backpacks?.[kidSlug];
    if (Array.isArray(saved) && saved.length) return saved.filter((n) => GEAR_BY_NAME[n]);
    return (KID_CODEX[kidSlug]?.pack ?? []).map(([name]) => name).filter((n) => GEAR_BY_NAME[n]);
  }

  _savePack() {
    try {
      if (!Save.data.backpacks) Save.data.backpacks = {};
      Save.data.backpacks[this.activeKid] = [...this.pack];
      Save.data.activeKid = this.activeKid;
      Save.save();
    } catch {}
  }

  _packUsed() { return this.pack.reduce((s, n) => s + (GEAR_BY_NAME[n]?.[1] ?? 0), 0); }

  _renderPack() {
    const p = this._packPanel;
    if (!p) return;
    const used = this._packUsed();
    p.querySelector('.packbag__slots').textContent = `${used} / ${BACKPACK_SLOTS} slots`;

    const pips = (n) => `<span class="slots" aria-hidden="true">${'■'.repeat(n)}</span>`;
    p.querySelector('.packbag__list').innerHTML = this.pack.length
      ? this.pack.map((name) => {
          const g = GEAR_BY_NAME[name];
          return `<li><button type="button" class="gear gear--in" data-remove="${name}">
            ${pips(g[1])}<b>${name}</b><em>${g[2]}</em><span class="gear__x" aria-hidden="true">&#215;</span>
            <span class="sr-only">Remove ${name} from the backpack</span></button></li>`;
        }).join('')
      : '<li class="packbag__empty">Nothing packed. That is a choice, technically.</li>';

    p.querySelector('.packshelf__list').innerHTML = GEAR
      .filter(([name]) => !this.pack.includes(name))
      .map(([name, slots, desc]) => {
        const fits = used + slots <= BACKPACK_SLOTS;
        return `<li><button type="button" class="gear${fits ? '' : ' is-toobig'}" data-add="${name}" ${fits ? '' : 'disabled'}>
          ${pips(slots)}<b>${name}</b><em>${desc}</em>
          <span class="sr-only">${fits ? `Add ${name} to the backpack` : `${name} does not fit`}</span></button></li>`;
      }).join('');
  }

  /* ── sidebar ────────────────────────────────────────────────────────────── */
  _buildSide() {
    const side = el('aside', 'cl__side');
    const st = Save?.data?.stats ?? {};

    const board = el('div', 'chalk');
    board.innerHTML = `
      <h3 class="chalk__h">Expedition log</h3>
      <dl class="chalk__dl">
        <dt>Expeditions</dt><dd>${st.runs ?? 0}</dd>
        <dt>Made it out</dt><dd>${st.wins ?? 0}</dd>
        <dt>Deepest floor</dt><dd>${st.bestFloor ?? 0}</dd>
        <dt>${TERMS.card}s played</dt><dd>${st.cardsPlayed ?? 0}</dd>
        <dt>Damage dealt</dt><dd>${st.damageDealt ?? 0}</dd>
      </dl>`;
    side.appendChild(board);

    const haunt = el('div', 'cl-haunt');
    haunt.innerHTML = `<h3 class="cl-h">${TERMS.ascension}</h3>`;
    const row = el('div', 'haunt__row');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', TERMS.ascension);
    const maxH = Math.max(0, Number(Save?.data?.hauntLevel ?? 0));
    for (const [lvl, name, desc] of HAUNTS) {
      const b = el('button', 'haunt__pip');
      b.type = 'button';
      b.dataset.haunt = String(lvl);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(lvl === this.haunt));
      b.textContent = String(lvl);
      if (lvl > maxH) { b.disabled = true; b.classList.add('is-locked'); }
      b.title = `Haunt ${lvl}: ${name}. ${desc}`;
      b.setAttribute('aria-label', b.title);
      row.appendChild(b);
    }
    haunt.appendChild(row);
    haunt.appendChild(el('p', 'cl-haunt__desc', `<b>${HAUNTS[this.haunt][1]}</b> ${HAUNTS[this.haunt][2]}`));
    side.appendChild(haunt);

    const go = el('button', 'cl-go');
    go.type = 'button';
    go.innerHTML = `<b>Plan the Expedition</b><em>choose a Kid and a Companion</em>`;
    side.appendChild(go);
    this._goBtn = go;

    side.appendChild(el('p', 'cl-quote',
      '&ldquo;Get every animal out that wants to leave.&rdquo;'));

    this._side = side;
    return side;
  }

  /* ── wiring ─────────────────────────────────────────────────────────────── */
  _wire() {
    const root = this.root;
    const unlockOnce = () => { try { this.ctx.audio?.unlock?.(); } catch {} };
    root.addEventListener('pointerdown', unlockOnce, { once: true });
    this._offs.push(() => root.removeEventListener('pointerdown', unlockOnce));

    const onTab = (e) => {
      const b = e.target.closest('.cl-tab');
      if (!b) return;
      this._setPanel(b.dataset.panel);
    };
    this._tabs.addEventListener('click', onTab);
    this._offs.push(() => this._tabs.removeEventListener('click', onTab));
    this._offs.push(rovingFocus(this._tabs, '.cl-tab', { cols: 0, onActivate: (b) => this._setPanel(b.dataset.panel) }));

    // backpack
    const onPack = (e) => {
      const who = e.target.closest('.packwho__b');
      if (who) {
        this.activeKid = who.dataset.kid;
        for (const b of this._packPanel.querySelectorAll('.packwho__b')) b.setAttribute('aria-checked', String(b.dataset.kid === this.activeKid));
        this.pack = this._loadPack(this.activeKid);
        this._renderPack();
        this._savePack();
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add && !add.disabled) {
        const g = GEAR_BY_NAME[add.dataset.add];
        if (g && this._packUsed() + g[1] <= BACKPACK_SLOTS) { this.pack.push(g[0]); this._renderPack(); this._savePack(); }
        return;
      }
      const rem = e.target.closest('[data-remove]');
      if (rem) {
        this.pack = this.pack.filter((n) => n !== rem.dataset.remove);
        this._renderPack(); this._savePack();
      }
    };
    this._packPanel.addEventListener('click', onPack);
    this._offs.push(() => this._packPanel.removeEventListener('click', onPack));

    // haunt
    const hrow = this._side.querySelector('.haunt__row');
    const onHaunt = (e) => {
      const b = e.target.closest('.haunt__pip');
      if (!b || b.disabled) return;
      this.haunt = Number(b.dataset.haunt);
      for (const p of hrow.querySelectorAll('.haunt__pip')) p.setAttribute('aria-checked', String(Number(p.dataset.haunt) === this.haunt));
      this._side.querySelector('.cl-haunt__desc').innerHTML = `<b>${HAUNTS[this.haunt][1]}</b> ${HAUNTS[this.haunt][2]}`;
    };
    hrow.addEventListener('click', onHaunt);
    this._offs.push(() => hrow.removeEventListener('click', onHaunt));
    this._offs.push(rovingFocus(hrow, '.haunt__pip', { cols: 0, onActivate: (b) => b.click() }));

    const onGo = () => {
      this._savePack();
      this.ctx.scenes?.go?.('select', { haunt: this.haunt, kid: this.activeKid });
    };
    this._goBtn.addEventListener('click', onGo);
    this._offs.push(() => this._goBtn.removeEventListener('click', onGo));

    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.ctx.scenes?.go?.('title', {}); } };
    addEventListener('keydown', onKey);
    this._offs.push(() => removeEventListener('keydown', onKey));

    const onResize = () => {
      clearTimeout(this._rzT);
      this._rzT = setTimeout(() => this._drawStrings(), 120);
    };
    addEventListener('resize', onResize, { passive: true });
    this._offs.push(() => { removeEventListener('resize', onResize); clearTimeout(this._rzT); });
  }

  _setPanel(id) {
    if (!id || id === this.panel) return;
    this.panel = id;
    this.root.dataset.panel = id;
    for (const b of this._tabs.querySelectorAll('.cl-tab')) b.setAttribute('aria-selected', String(b.dataset.panel === id));
    if (id === 'board') requestAnimationFrame(() => this._drawStrings());
  }

  async exit() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const p of this._portraits) { try { p.destroy(); } catch {} }
    this._portraits.length = 0;
    this._tabs = this._cork = this._packPanel = this._side = this._goBtn = null;
    this.root.innerHTML = '';
  }
}
