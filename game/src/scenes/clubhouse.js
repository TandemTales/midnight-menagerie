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
  ensureCss, fontsReady, companionPortrait, kidPortrait, petPortrait, blueprintSrc,
  el, svg, rovingFocus, setReduceMotion, reduceMotion, REGION_NAMES,
  freedCompanions, availableCompanions, warmFaces, menuArtSrc,
} from '../ui/portrait.js';
import { KID_CODEX, loadoutFor } from './select.js';
import { shouldPlayOpening } from './tutorial.js';
import { pauseStageFor } from './_stage.js';
import {
  BACKPACK_ITEMS, itemById, loadoutSize, assertLoadout, SLOTS_BASE,
} from '../data/backpack.js';
import { HAUNTS } from '../data/haunts.js';
import { paintBackdrop } from '../ui/kitboard.js';
import { objectUrl } from '../ui/objects.js';

const CSS_KIT  = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_CLUB = new URL('./clubhouse.css', import.meta.url).href;

/** Glyphs for the round enamel buttons: flat antique gold, ink outline. */
const GLYPH = {
  back: '<svg viewBox="0 0 24 24"><path d="M20.5 9.6h-9.2V5.2L3 12l8.3 6.8v-4.4h9.2z"/></svg>',
  /* the way on, as every board's lit button draws it */
  onward: '<svg viewBox="0 0 24 24"><path d="M3.5 9.6h9.2V5.2L21 12l-8.3 6.8v-4.4H3.5z"/></svg>',
};

/* Backpack Gear.  There is ONE item table and it is `data/backpack.js` — this
   screen used to carry a third hard-coded copy (names and slot counts that
   matched neither the Kid dossier's nor the real definitions), and it stored
   display names into `Save.data.backpacks`, which nothing downstream could
   resolve. The editor is now a view over the real table, storing ids, and what
   it saves is the loadout the next expedition genuinely starts with. */
const BACKPACK_SLOTS = SLOTS_BASE;


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

    // The canvas measures 0.00% visible behind this screen — stop drawing it.
    this._unpauseStage = pauseStageFor(ctx);

    // Every pet photograph on this screen. Warmed, not awaited — Scene.enter()
    // runs behind the transition veil (CONTRACTS trap 4) and a cold set is
    // ~0.6 s of black. On the normal route in from the Title they are already
    // cached and this is a no-op. The Kid portraits are files on disk and need
    // no warming.
    warmFaces({ sync: true });

    const data = Save?.data ?? {};
    /* available (pickable, portrait unlocked) vs freed (the score). The four
       starters are available and were never in the house. See ui/portrait.js. */
    this.available = availableCompanions();
    this.rescued = freedCompanions();
    this.petsRescued = new Set(data.petsRescued ?? []);
    this.revealed = new Set(data.blueprint?.revealed ?? ['foyer']);
    this.haunt = Math.max(0, Number(data.hauntLevel ?? 0));
    this.activeKid = data.activeKid && KID_CODEX[data.activeKid] ? data.activeKid : KIDS[0].slug;
    this.pack = this._loadPack(this.activeKid);

    this.panel = ['board', 'menagerie', 'pets', 'backpack'].includes(params.panel) ? params.panel : 'board';

    const root = this.root;
    root.innerHTML = '';
    root.dataset.panel = this.panel;
    root.classList.toggle('kit-still', reduceMotion());

    root.appendChild(this._defs());
    const room = this._buildRoom();
    root.appendChild(room);
    root.appendChild(this._buildHeader());

    const main = el('main', 'cl__main');
    /* The section tabs stand on the board's top edge — the tabs switch the
       thing they stand on, so that is where they are — and come FIRST in the
       board, so the keyboard still reaches them before what they switch. The
       board's carved frame goes round whichever section is showing. */
    main.appendChild(this._tabs);
    main.appendChild(this._buildBoard());
    main.appendChild(this._buildMenagerie());
    main.appendChild(this._buildPets());
    main.appendChild(this._buildBackpack());
    /* the carved frame, a purple enamel stud in a brass rosette over each of
       its corner mounts (MARL's studs, round 4). Decoration. */
    const frame = el('div', 'cl-frame kit-carved',
      ['tl', 'tr', 'bl', 'br'].map((c) => `<i class="kit-stud cl-stud cl-stud--${c}"></i>`).join(''));
    frame.setAttribute('aria-hidden', 'true');
    main.appendChild(frame);
    root.appendChild(main);

    root.appendChild(this._buildSide());
    /* Josh's `clubhouse.png`, when it exists, hangs on the treehouse wall. */
    paintBackdrop(room, 'clubhouse', () => !!this._tabs && room.isConnected);

    this._wire();
    await fontsReady();
    this._drawStrings();
    bus.emit('clubhouse:ready');
  }

  /**
   * This screen's own filters. Scoped to the scene (index.html's `kit-defs` is
   * the shared kit's and nobody's this round), removed with the scene.
   *
   * `#cl-print` is what a photographic print has that a canvas render does not:
   * an acutance edge. The pet photographs are generated (ui/petart.js) with a
   * deliberate flash blur, halation and grain, which is right for a snapshot —
   * but pinned an inch from engraved gold caps they read as SMEARED, which is
   * the note every round-5 judge left on this board. A 3x3 unsharp convolution
   * puts the bite back into the fur and the eyes without touching the grain or
   * the generator, and the kernel's weights sum to 1 so nothing gains exposure.
   */
  _defs() {
    const s = svg(`<svg class="cl-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="cl-print" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feConvolveMatrix order="3" preserveAlpha="true" divisor="1" bias="0"
          kernelMatrix="0 -0.55 0  -0.55 3.2 -0.55  0 -0.55 0"/>
      </filter>
    </svg>`);
    s.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    return s;
  }

  /* ── the room itself ────────────────────────────────────────────────────── */
  _buildRoom() {
    /* The room the whole board hangs in: the Treehouse's own timber (ui/kit.css
       .kit-ground--clapboard, tools/prep_kids_timber.py) — the same roof beam,
       posts, rail and clapboards, tinted toward aubergine where the light does
       not reach, the slot Josh's clubhouse.png drops into — warmer than the
       mansion because the Kids have lit it: the enamel lamp over the
       investigation board, a string of candle-coloured bulbs along the top,
       dust in the light. Dressed as every board is: the purple scrollwork down
       both sides over the planks, a candle and a cobweb in each top corner, the
       painted rule round the edge. */
    const room = el('div', 'cl-room kit-board');
    room.innerHTML = `
      <div class="cl-wall kit-ground kit-ground--clapboard"><i class="kit-ground__warm"></i><i class="kit-ground__moon"></i></div>
      <div class="cl-lights kit-bulbs kit-bulbs--candle">${Array.from({ length: 14 }, (_, i) =>
        `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="cl-floor"></div>
      <div class="cl-dust">${Array.from({ length: 18 }, (_, i) =>
        `<i style="left:${(i * 5.6 + 3) % 100}%;--dur:${(16 + (i % 7) * 3)}s;--del:-${i * 1.7}s;--sz:${1 + (i % 3) * .8}px"></i>`).join('')}</div>
      <div class="kit-dress cl-dress" aria-hidden="true">
        <i class="kit-dress__floor"></i>
        <i class="kit-dress__rule"></i>
        <i class="kit-dress__vine kit-dress__vine--l cl-vine cl-vine--l"></i>
        <i class="kit-dress__vine kit-dress__vine--r cl-vine cl-vine--r"></i>
        <i class="kit-dress__corner kit-dress__corner--l cl-corner cl-corner--l"></i>
        <i class="kit-dress__corner kit-dress__corner--r cl-corner cl-corner--r"></i>
        <i class="kit-dress__flame kit-dress__flame--l cl-flame cl-flame--l"></i>
        <i class="kit-dress__flame kit-dress__flame--r cl-flame cl-flame--r"></i>
      </div>
      <div class="cl-lamp kit-lamp" aria-hidden="true"></div>`;
    return room;
  }

  /* ── header ─────────────────────────────────────────────────────────────── */
  _buildHeader() {
    const h = el('header', 'cl__head');

    const back = el('button', 'cl-back kit-btn kit-btn--quiet');
    back.type = 'button';
    back.innerHTML = '<span class="cl-back__arrow" aria-hidden="true">&#8592;</span> Title'
      + `<i class="kit-medallion kit-btn__medal cl-back__medal" aria-hidden="true">${GLYPH.back}</i>`;
    back.addEventListener('click', () => this.ctx.scenes?.go?.('title', {}));
    h.appendChild(back);

    /* The sign, lettered the way the wordmark is: the small word over the big
       one in the cartouche, as MIDNIGHT sits over MENAGERIE, and the house
       rules on the ribbon under it. */
    const sign = el('div', 'cl-sign kit-titleblock kit-titleblock--compact');
    sign.innerHTML = `
      <span class="cl-sign__sub kit-ribbon">members only &middot; bring snacks</span>
      <h1 class="cl-sign__board kit-cartouche__title">
        <span class="cl-sign__line1">Neighbourhood</span>
        <span class="cl-sign__line2">Headquarters</span>
      </h1>`;
    h.appendChild(sign);

    const tabs = el('nav', 'cl-tabs kit-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Clubhouse sections');
    for (const [id, label] of [
      ['board', 'Investigation Board'], ['menagerie', 'The Menagerie'],
      ['pets', 'Missing Pets'], ['backpack', 'Backpack'],
    ]) {
      const b = el('button', 'cl-tab kit-tab');
      b.type = 'button';
      b.dataset.panel = id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === this.panel));
      b.textContent = label;
      tabs.appendChild(b);
    }
    /* Not appended here: `enter()` stands the tabs on the board's top rail. */
    this._tabs = tabs;

    /* The two numbers this whole screen is about, on one enamel plate opposite
       Title: how many of the Menagerie are out, and how many pets are home. */
    const tally = el('p', 'cl-count kit-enamel kit-enamel--dark');
    tally.innerHTML = `<b class="kit-enamel__value">${this.rescued.size}</b>`
      + `<span class="kit-enamel__label">of ${COMPANIONS.length} freed</span>`
      + `<i class="cl-count__dot" aria-hidden="true"></i>`
      + `<b class="kit-enamel__value">${this.petsRescued.size}</b>`
      + `<span class="kit-enamel__label">of ${KIDS.length} home</span>`;
    h.appendChild(tally);
    return h;
  }

  /* ── panel: investigation board ─────────────────────────────────────────── */
  _buildBoard() {
    const p = el('section', 'cl-panel cl-panel--board');
    p.dataset.panel = 'board';
    p.setAttribute('role', 'tabpanel');

    const cork = el('div', 'cork');
    /* Two reels of wool on two layers. The chain that links the eight
       photographs runs BEHIND them, the way a string pinned first does; the
       leads that tie the chain and the cutting to the House's snapshot run
       OVER them, because they were run last and because they are the argument
       — if they were hidden behind the paper the board would not make it. */
    cork.innerHTML = '<svg class="cork__string" aria-hidden="true"><g></g></svg>'
      + '<svg class="cork__string cork__string--over" aria-hidden="true"><g></g></svg>';

    // the pinned pet polaroids
    /* Corkboard geography. The right ~24% of the board belongs to the recovered
       blueprint and the right-hand clue notes, so the eight pet photographs live
       in two rows across the left. Round 3 pinned the fifth one at 72% and the
       blueprint (later in the DOM, same z-index) covered Pixel completely — a
       missing pet you could not see on the missing-pets board. */
    /* Both rows ride higher than they did, because the board's foot is now an
       EXHIBIT and an exhibit needs room: the House's photograph, the cutting
       and the verdict are laid along it as three separate pieces with air
       between them, instead of the pile they made when the rows ended at 72%
       of the cork and left them 27% to share. */
    const rot = [-3.4, 2.1, -1.6, 3.2, -2.4, 1.4, -3.0, 2.6];
    const pos = [
      [2, 1], [17, 3], [32, 0], [47, 2.5],
      [2, 35], [17, 37], [32, 34], [47, 36.5],
    ];
    KIDS.forEach((k, i) => {
      const info = KID_CODEX[k.slug] ?? {};
      const found = this.petsRescued.has(k.slug);
      const card = el('div', 'polaroid kit-paper' + (found ? ' is-found' : ''));
      card.style.cssText = `left:${pos[i][0]}%;top:${pos[i][1]}%;--rot:${rot[i]}deg`;
      card.dataset.anchor = k.slug;
      card.innerHTML = `
        <span class="pin kit-pin" aria-hidden="true"></span>
        <span class="polaroid__photo"></span>
        <span class="polaroid__who" aria-hidden="true"></span>
        <span class="polaroid__cap">${k.pet}</span>
        <span class="polaroid__sub">${k.name.split(' ')[0]}&rsquo;s</span>
        ${found ? '<span class="polaroid__stamp">Home</span>' : ''}`;
      card.querySelector('.polaroid__photo').appendChild(
        petPortrait(k.slug, { alt: `${k.pet}, ${(info.species || k.petKind).toLowerCase()}` }));
      /* Whose animal this is, as a face rather than only as the word under the
         photograph. The board is eight small animals and one line of text each;
         with the kids painted there is no reason the owner stays anonymous.
         aria-hidden because `.polaroid__sub` already says the same thing to a
         screen reader, and two of them is noise. */
      card.querySelector('.polaroid__who').appendChild(
        kidPortrait({ ...k, petKind: info.species || k.petKind },
          { w: 192, h: 192, variant: 'thumb' }));
      cork.appendChild(card);
    });

    /* The recovered blueprint, and it OPENS now.
       It was a picture of the thing `scenes/atlas.js` is: the same drawing, the
       same count, pinned to the same board. A player who wants a closer look at
       the house has exactly one instinct about a floor plan on a corkboard, and
       until the atlas existed there was nothing for that instinct to reach. */
    const bp = el('button', 'bpfrag kit-paper');
    bp.type = 'button';
    bp.style.cssText = 'right:2.5%;top:2%;--rot:1.6deg';
    bp.setAttribute('aria-label',
      `Open the atlas — the house, ${this.revealed.size} of ${REGION_ORDER.length} wings mapped`);
    bp.innerHTML = `
      <span class="pin pin--blue kit-pin kit-pin--blue" aria-hidden="true"></span>
      <span class="bpfrag__label">The house, as far as we have mapped it</span>
      <span class="bpfrag__img"><img src="${blueprintSrc('mansion')}" alt="" width="1448" height="1086" decoding="async"></span>
      <span class="bpfrag__count"><b>${this.revealed.size}</b> / ${REGION_ORDER.length} wings</span>
      <span class="bpfrag__go">Look closer</span>`;
    bp.addEventListener('click', () => {
      try { this.ctx.audio?.play?.('ui:open-panel'); } catch {}
      this.ctx.scenes.go('atlas', {}, { transition: reduceMotion() ? 'veil' : 'blueprint' });
    });
    cork.appendChild(bp);

    // clue notes
    /* Two columns of cards under the recovered drawing, the known clues above
       the unknown ones, and one unknown card beside the thesis: laid so that at
       1280 no card lies on another, on the drawing or on a photograph. The
       three unknown cards are narrower (a "?" and three words) and packed to
       the right, leaving the board's lower left to the collage. */
    /* The board's right half reads as a numbered exhibit list: the two clues we
       HAVE, one under the other beside the drawing, then the three slots still
       empty in one row along the foot — so the corner opposite them is free for
       the House, the cutting and the verdict, and every card on the board is
       either something to read or an honest gap. */
    const cluePos = [[60, 46], [79.5, 51], [57.5, 74.5], [71.5, 77], [85.5, 75]];
    const clueNo  = ['i', 'ii', 'iii', 'iv', 'v'];
    BOARD_CLUES.forEach((c, i) => {
      const [title, text, known] = c;
      /* `ch-note`, not `note`. The class was renamed in clubhouse.css to get out
         of another scene's way and the JS was not, so every clue on the board
         lost `position:absolute` and the five of them stacked in the top-left
         corner underneath the polaroids. Exactly the failure the scene-css gate
         exists for, one level down: same name, different file. */
      const note = el('div', 'ch-note kit-paper' + (known ? '' : ' is-unknown'));
      note.style.cssText = `left:${cluePos[i][0]}%;top:${cluePos[i][1]}%;--rot:${(i % 2 ? 1.8 : -2.2)}deg`;
      /* the exhibit number in the corner of the card, pencilled in by hand the
         way a kid numbers what they have found */
      const no = `<i class="ch-note__no" aria-hidden="true">${clueNo[i]}</i>`;
      note.innerHTML = known
        ? `<span class="ch-tape kit-tape" aria-hidden="true"></span>${no}<b>${title}</b><p>${text}</p>`
        : `<span class="ch-tape kit-tape" aria-hidden="true"></span>${no}<b>?</b><p>Not found yet.</p>`;
      cork.appendChild(note);
    });

    /* ── the evidence corner ────────────────────────────────────────────────
       The board's foot, composed rather than piled: three exhibits laid left to
       right with air between them, each carrying its own words, and each a
       different KIND of paper — a snapshot, newsprint, a cut-out verdict — so
       the corner reads as one argument being made.

       1  The House's photograph (MARL's, round 4): the one snapshot on the
          board that is not of a pet, UI/mainMenu.png's own painting, now
          CAPTIONED in the same hand as the pet polaroids (GORSE's words), so
          the picture the whole investigation turns on says what it is.
       2  The cutting from the local paper (NUTMEG's): the house again, in
          half-tone, under the headline that made the Kids look — with GORSE's
          standfirst set under the rule, which is the number the board is about.
       3  The verdict, torn out phrase by phrase. */
    const snap = el('figure', 'cl-snap kit-paper',
      `<span class="pin kit-pin" aria-hidden="true"></span>`
      + `<span class="cl-snap__photo" style="background-image:url('${menuArtSrc('menu')}')"></span>`
      + `<figcaption class="cl-snap__cap">The House<em>where they all went</em></figcaption>`);
    snap.style.cssText = 'left:1.5%;top:69.4%;--rot:-3.4deg';
    cork.appendChild(snap);
    const cut = el('div', 'cl-cutting kit-newscutting',
      '<span class="pin kit-pin kit-pin--blue cl-cutting__pin" aria-hidden="true"></span>'
      + '<p class="kit-newscutting__head">Pets vanish</p>'
      + '<p class="cl-cutting__sub">eight gone this year</p>');
    cut.style.cssText = 'left:19.4%;top:70.6%;--rot:3.2deg';
    cork.appendChild(cut);

    /* The thesis, cut out and pinned up beside them: each phrase torn from a
       sheet of red paper the way a kid makes a headline, the last one on a
       scrap of the index cards and underlined in red biro. */
    const thesis = el('div', 'scrawl');
    thesis.style.cssText = 'left:34.6%;top:70.5%;--rot:-1.2deg';
    thesis.innerHTML = `<span class="scrawl__cut kit-clipping" style="--rot:-3deg">too many pets.</span> `
      + `<span class="scrawl__cut kit-clipping" style="--rot:2.2deg">same house.</span> `
      + `<span class="scrawl__cut scrawl__cut--last kit-clipping kit-clipping--card" style="--rot:-1deg"><u>not a coincidence.</u></span>`
      + `<i class="scrawl__pin kit-pin" aria-hidden="true"></i>`;
    cork.appendChild(thesis);

    p.appendChild(cork);
    /* the lamp's light on the board, over everything pinned to it */
    p.appendChild(el('div', 'cl-lampglow'));
    this._cork = cork;
    return p;
  }

  /**
   * Red wool between what is pinned up, with a believable sag.
   *
   * Two runs, and the second is the argument: the eight photographs are chained
   * in the order they are pinned, and then the ends of that chain and the
   * newspaper cutting are ALL tied to the House's snapshot. It is the thing a
   * kid does with a reel of wool and it is the only line of reasoning on the
   * board that is drawn rather than written — eight animals, one house.
   */
  _drawStrings() {
    const cork = this._cork;
    if (!cork) return;
    const svgEl = cork.querySelector('.cork__string');
    const overEl = cork.querySelector('.cork__string--over');
    const g = svgEl.querySelector('g');
    const box = cork.getBoundingClientRect();
    if (!box.width) return;
    const vb = `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`;
    svgEl.setAttribute('viewBox', vb);
    overEl?.setAttribute('viewBox', vb);
    const at = (sel) => {
      const pin = cork.querySelector(sel);
      if (!pin) return null;
      const r = pin.getBoundingClientRect();
      if (!r.width) return null;
      return [r.x + r.width / 2 - box.x, r.y + r.height / 2 - box.y];
    };
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
    /* everything the board has leads to the same address */
    const hub = at('.cl-snap .pin');
    let lead = '';
    if (hub) {
      /* the two photographs nearest the corner, the cutting and the verdict.
         Not all eight: the leads are chosen to run over open cork rather than
         across somebody's face, which is also how a kid runs them. */
      const ties = [pts[4], pts[5], at('.cl-cutting__pin')].filter(Boolean);
      for (const [x0, y0] of ties) {
        const dx = hub[0] - x0, dy = hub[1] - y0;
        const len = Math.hypot(dx, dy);
        if (len < 24) continue;
        const mx = x0 + dx * 0.5, my = y0 + dy * 0.5 + Math.min(34, len * 0.12) + 5;
        lead += `M${x0.toFixed(0)} ${y0.toFixed(0)}Q${mx.toFixed(0)} ${my.toFixed(0)} ${hub[0].toFixed(0)} ${hub[1].toFixed(0)}`;
      }
    }
    g.innerHTML = `<path class="cork__thread" d="${d}"/>`;
    if (overEl) {
      overEl.querySelector('g').innerHTML = lead
        ? `<path class="cork__thread cork__thread--lead" d="${lead}"/>` : '';
    }
  }

  /* ── panel: the Menagerie roster ────────────────────────────────────────── */
  _buildMenagerie() {
    const p = el('section', 'cl-panel cl-panel--menagerie');
    p.dataset.panel = 'menagerie';
    p.setAttribute('role', 'tabpanel');

    p.appendChild(el('div', 'cl-panel__head', `
      <h2>The Menagerie</h2>
      <p>Sixteen animals the house kept. Free every one and they will show us the way to the Heart.</p>
      <div class="tally"><b>${this.rescued.size}</b> / ${COMPANIONS.length} freed<em>${
        this.available.size - this.rescued.size} already with us</em></div>`));

    const scrap = el('div', 'scrapgrid');
    for (const c of COMPANIONS) {
      /* Here is exactly why available and freed had to come apart. A starter is
         on this board with their portrait showing, because they live here — but
         they are not one of the ones we got out, and the tally above must not
         claim them. */
      const here = this.available.has(c.slug);
      const got = this.rescued.has(c.slug);
      const cell = el('div', 'scrapcell kit-paper' + (here ? '' : ' is-empty') + (here && !got ? ' is-starter' : ''));
      const pf = companionPortrait({ slug: c.slug, variant: '@1x', locked: !here, parallax: 0, shimmer: false });
      this._portraits.push(pf);
      cell.appendChild(pf.el);
      cell.appendChild(el('div', 'scrapcell__cap',
        here ? `<b>${c.name}</b><span>${got ? c.title : 'never in the house'}</span>`
             : `<b>&mdash;</b><span>still in ${REGION_NAMES[c.region] ?? c.region}</span>`));
      if (here) cell.appendChild(el('span', 'scrapcell__tape'));
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
        <div class="petcard__pet"><div class="petcard__kid"></div></div>
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
      card.querySelector('.petcard__pet').appendChild(
        petPortrait(k.slug, { alt: `${k.pet}, ${(info.species || k.petKind).toLowerCase()}` }));
      card.querySelector('.petcard__kid').appendChild(
        kidPortrait({ ...k, petKind: info.species || k.petKind },
          { w: 192, h: 192, variant: 'thumb' }));
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
      /* A face on the pill, not just a first name. Eight identical brass
         lozenges reading MAYA MATEO AMINA… is a dropdown; eight faces is a
         roster, and this is the screen where you pack somebody's bag. */
      const face = el('span', 'packwho__pf');
      face.appendChild(kidPortrait(k, { w: 192, h: 192, variant: 'thumb' }));
      face.firstChild.alt = '';
      b.appendChild(face);
      b.appendChild(el('span', 'packwho__n', k.name.split(' ')[0]));
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

  /** The pack this Kid would leave with right now, as item ids. */
  _loadPack(kidSlug) {
    return loadoutFor(kidSlug);
  }

  /**
   * Write the pack where the run layer reads it: `Save.data.backpacks[kid]`,
   * as `string[]` of item ids. `select.js loadoutFor()` picks this up and hands
   * it to `new Run`, so the editor changes the expedition — which it did not do
   * at all while this file stored display names from its own private table.
   */
  _savePack() {
    try {
      assertLoadout(this.pack, `clubhouse _savePack(kid:'${this.activeKid}')`);
      if (!Save.data.backpacks) Save.data.backpacks = {};
      Save.data.backpacks[this.activeKid] = [...this.pack];
      Save.data.activeKid = this.activeKid;
      Save.save();
    } catch (err) { console.error(err); }
  }

  _packUsed() { return loadoutSize(this.pack); }

  _renderPack() {
    const p = this._packPanel;
    if (!p) return;
    const used = this._packUsed();
    p.querySelector('.packbag__slots').textContent = `${used} / ${BACKPACK_SLOTS} slots`;

    const pips = (n) => `<span class="slots" aria-hidden="true">${'■'.repeat(n)}</span>`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    p.querySelector('.packbag__list').innerHTML = this.pack.length
      ? this.pack.map((id) => {
          const g = itemById(id);
          return `<li><button type="button" class="gear gear--in" data-remove="${esc(id)}">
            ${pips(g.size)}<b>${esc(g.name)}</b><em>${esc(g.desc)}</em><span class="gear__x" aria-hidden="true">&#215;</span>
            <span class="sr-only">Remove ${esc(g.name)} from the backpack</span></button></li>`;
        }).join('')
      : '<li class="packbag__empty">Nothing packed. That is a choice, technically.</li>';

    p.querySelector('.packshelf__list').innerHTML = BACKPACK_ITEMS
      .filter((g) => !this.pack.includes(g.id))
      .map((g) => {
        const fits = used + g.size <= BACKPACK_SLOTS;
        return `<li><button type="button" class="gear${fits ? '' : ' is-toobig'}" data-add="${esc(g.id)}" ${fits ? '' : 'disabled'}>
          ${pips(g.size)}<b>${esc(g.name)}</b><em>${esc(g.desc)}</em>
          <span class="sr-only">${fits ? `Add ${esc(g.name)} to the backpack` : `${esc(g.name)} does not fit`}</span></button></li>`;
      }).join('');
  }

  /* ── sidebar ────────────────────────────────────────────────────────────── */
  _buildSide() {
    const side = el('aside', 'cl__side');
    const st = Save?.data?.stats ?? {};

    /* The log and the ladder are the kit's panels, each with its crest on the
       top rail; the counts are a ledger that reads down in one glance. */
    const board = el('div', 'chalk kit-panel kit-panel--damask');
    board.dataset.medal = 'star';
    board.innerHTML = `
      <h3 class="chalk__h kit-heading">Expedition log</h3>
      <dl class="chalk__dl kit-ledger">
        <dt>Expeditions</dt><dd>${st.runs ?? 0}</dd>
        <dt>Made it out</dt><dd>${st.wins ?? 0}</dd>
        <dt>Deepest room</dt><dd>${st.bestFloor ?? 0}</dd>
        <dt>${TERMS.card}s played</dt><dd>${st.cardsPlayed ?? 0}</dd>
        <dt>Damage dealt</dt><dd>${st.damageDealt ?? 0}</dd>
      </dl>`;
    side.appendChild(board);

    const haunt = el('div', 'cl-haunt kit-panel kit-panel--damask');
    haunt.dataset.medal = 'shield';
    haunt.innerHTML = `<h3 class="cl-haunt__h kit-heading">${TERMS.ascension}</h3>`;
    /* the ladder's rungs are candle stubs (ui/kit.css .kit-ladder--candles):
       lit up to the chosen Haunt, cold past it — the house's own objects, not
       dim discs like disabled web steppers */
    const row = el('div', 'haunt__row kit-ladder kit-ladder--candles');
    row.style.setProperty('--obj-lit', `url('${objectUrl('candle-lit')}')`);
    row.style.setProperty('--obj-unlit', `url('${objectUrl('candle-unlit')}')`);
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', TERMS.ascension);
    /* The SOLO ladder. The Clubhouse is the single-player meta screen — a
       party is assembled on the select screen, which shows the party ladder.
       Read through the accessor either way, so no screen holds an opinion
       about which field a ladder lives in. */
    const maxH = Save.hauntLevelFor(1);
    for (const [lvl, name, desc] of HAUNTS) {
      const b = el('button', 'haunt__pip kit-ladder__rung');
      b.type = 'button';
      b.dataset.haunt = String(lvl);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(lvl === this.haunt));
      b.classList.toggle('is-lit', lvl <= this.haunt);
      b.textContent = String(lvl);
      if (lvl > maxH) { b.disabled = true; b.classList.add('is-locked'); }
      b.title = `Haunt ${lvl}: ${name}. ${desc}`;
      b.setAttribute('aria-label', b.title);
      row.appendChild(b);
    }
    haunt.appendChild(row);
    haunt.appendChild(el('p', 'cl-haunt__desc', `<b>${HAUNTS[this.haunt][1]}</b> ${HAUNTS[this.haunt][2]}`));
    side.appendChild(haunt);

    /* Between the ladder and the way in, a still life on a shelf (MARL's, round
       4): the Treehouse's own plank shelf nailed to the wall, and standing on
       it the Kid board's skull on its books, a lantern and a candle, their
       light warming the wall and the plank round them.
       Over them, and the point of the whole column: the club's one rule on a
       card pinned to the wall (ELDER's treatment, round 5). It was a thin cream
       strip of small type laid along the shelf's edge, which is where a caption
       goes, not where a manifesto goes. It is a proper card now — tilted, big
       enough to read across the room, its pin standing in a clear band of paper
       above the first line — and it is what the still life is lit for. */
    const motto = el('div', 'cl-motto cl-shelf');
    /* The still life is its own box under the card, and a SIZE CONTAINER: the
       skull, the roll, the lantern and the candle are sized from the height the
       column actually leaves them, so the card can never stand on the skull's
       head at one size and float over an empty plank at another. */
    motto.insertAdjacentHTML('beforeend',
      '<i class="cl-shelf__still" aria-hidden="true">'
      + '<i class="kit-light kit-light--candle cl-shelf__pool"></i>'
      + '<i class="kit-sill kit-sill--grain cl-shelf__plank"></i>'
      + '<i class="kit-prop kit-prop--skull cl-shelf__skull"></i>'
      /* GORSE's rolled tracing with its wax seal, off the atlas floor and onto
         this shelf (the round-7 brief asks for it here too): the same drawing
         the board upstairs is pinned with, rolled up and put away. */
      + '<i class="kit-prop kit-prop--tracing cl-shelf__roll"></i>'
      + '<i class="kit-lantern kit-lantern--standing cl-shelf__lantern"></i>'
      + '<i class="kit-prop kit-prop--candle cl-shelf__candle"></i>'
      + '</i>');
    const quote = el('blockquote', 'cl-quote kit-paper');
    quote.innerHTML = '<i class="cl-quote__pin kit-pin" aria-hidden="true"></i>'
      + '<span class="cl-quote__k">The club rule</span>'
      + '<p class="cl-quote__t">&ldquo;Get every animal out that wants to leave.&rdquo;</p>';
    motto.appendChild(quote);
    side.appendChild(motto);

    const go = el('button', 'cl-go kit-btn');
    go.type = 'button';
    go.innerHTML = `<b>Plan the Expedition</b><em>choose a Kid and a Companion</em>`
      + `<i class="kit-medallion kit-medallion--ornate kit-btn__medal cl-go__medal" aria-hidden="true">${GLYPH.onward}</i>`;
    side.appendChild(go);
    this._goBtn = go;

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
        const g = itemById(add.dataset.add);
        if (g && this._packUsed() + g.size <= BACKPACK_SLOTS) { this.pack.push(g.id); this._renderPack(); this._savePack(); }
        return;
      }
      const rem = e.target.closest('[data-remove]');
      if (rem) {
        this.pack = this.pack.filter((id) => id !== rem.dataset.remove);
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
      for (const p of hrow.querySelectorAll('.haunt__pip')) {
        p.setAttribute('aria-checked', String(Number(p.dataset.haunt) === this.haunt));
        p.classList.toggle('is-lit', Number(p.dataset.haunt) <= this.haunt);
      }
      this._side.querySelector('.cl-haunt__desc').innerHTML = `<b>${HAUNTS[this.haunt][1]}</b> ${HAUNTS[this.haunt][2]}`;
    };
    hrow.addEventListener('click', onHaunt);
    this._offs.push(() => hrow.removeEventListener('click', onHaunt));
    this._offs.push(rovingFocus(hrow, '.haunt__pip', { cols: 0, onActivate: (b) => b.click() }));

    const onGo = () => {
      this._savePack();
      /* Same fork as the title's New Game: a player who has freed nobody and
         never seen the opening gets the story, not the planning screen. The Kid
         they have been looking at on the board comes with them. */
      if (shouldPlayOpening()) {
        this.ctx.scenes?.go?.('tutorial', { kid: this.activeKid });
        return;
      }
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
    this._unpauseStage?.();
    this._unpauseStage = null;
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    for (const p of this._portraits) { try { p.destroy(); } catch {} }
    this._portraits.length = 0;
    this._tabs = this._cork = this._packPanel = this._side = this._goBtn = null;
    this.root.innerHTML = '';
  }
}
