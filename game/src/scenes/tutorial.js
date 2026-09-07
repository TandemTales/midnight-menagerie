/**
 * The opening — the first night, and the only time the game explains itself.
 *
 * ── WHERE THE WORDS COME FROM ──────────────────────────────────────────────
 *
 * Nothing here is invented. `docs/design/00-core-overview.md` §2 and §3 are the
 * opening, nearly beat for beat: each kid lost a pet under ordinary
 * circumstances, they compare stories and conclude the mansion is their best
 * lead, they bring torches and snacks and whatever fits in a backpack, they
 * expect broken floors and squatters — *"They do not expect the mansion to be
 * alive. Soon after entering, the doors close. Hallways shift… The group
 * encounters one of the starting Menagerie Companions. Perhaps Marmalade is the
 * first."* Each Kid's own loss is `KID_CODEX` in `scenes/select.js`, which is
 * where their missing-pet posters are already written.
 *
 * ── WHY IT IS KID-FIRST, AND WHY MARMALADE IS NOT A CHOICE ─────────────────
 *
 * `STARTER_SLUGS` is `['marmalade']` and nothing else, so on a fresh save the
 * Companion board has exactly one pickable frame. Asking a player to choose
 * from a wall of one is a screen that pretends to be a decision. The tutorial is
 * the FICTION for a rule the game already enforces: you do not pick her, she
 * turns up, and the reason she is with you afterwards is that she chose to
 * stand in front of you. §3 says the group *encounters* her — nobody selects a
 * Companion in the design's own telling of the first night.
 *
 * So the order is reversed for the first run only: the Kid, then the house.
 * `scenes/select.js` is untouched — `shouldPlayOpening()` below routes the two
 * doors into it (the title's New Game, the Clubhouse's Plan the Expedition).
 *
 * ── THE FIGHT IS THE REAL FIGHT ────────────────────────────────────────────
 *
 * It deep-links the ordinary `CombatScene` at `foyer-1` — one Dust Bunny, the
 * gentlest encounter in the game — with `ui/coach.js` over it. No scripted
 * hand, no forced targets, no tutorial rules: a second set of combat rules
 * inside a 3,858-line scene is a second set of bugs, and the coach can teach
 * everything that matters by pointing at what is already on screen. The engine
 * cannot tell this fight from any other.
 *
 * Deep links: `#scene=tutorial` from the top, `&kid=maya` to skip the picker,
 * `&step=after` for the closing beats.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { clock } from '../core/clock.js';
import { KIDS } from '../data/schema.js';
import {
  ensureCss, fontsReady, el, rovingFocus, kidImg, heroSrc,
  setReduceMotion, reduceMotion, freedCompanions, warmFaces,
  menuArtSrc, KID_BOARD, kidBoardRect,
} from '../ui/portrait.js';
import { KID_CODEX, loadoutFor } from './select.js';
import { assertLoadout } from '../data/backpack.js';

const CSS_KIT = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_TUT = new URL('./tutorial.css', import.meta.url).href;

/** The save's record that this has been played. `Save.data.seenTutorials`. */
export const OPENING_ID = 'opening';

/**
 * Should a new game open with the tutorial?
 *
 * The user's rule is "skip it if the player has already rescued a Companion",
 * and `freedCompanions()` is the right set for that — NOT
 * `availableCompanions()`, which counts Marmalade and is therefore non-empty on
 * every save that has ever existed.
 *
 * The second clause is an addition and worth being explicit about: having
 * PLAYED the opening is a stronger signal than having rescued somebody, and
 * without it a player who dies in the Foyer three times is walked through the
 * same story three times. It is recorded on a skip too — declining it is an
 * answer.
 */
export function shouldPlayOpening() {
  if (freedCompanions().size > 0) return false;
  const seen = Save.data.seenTutorials;
  return !(Array.isArray(seen) && seen.includes(OPENING_ID));
}

/** Remember that it has been played, or deliberately skipped. */
function markOpeningSeen() {
  const seen = Array.isArray(Save.data.seenTutorials) ? Save.data.seenTutorials : (Save.data.seenTutorials = []);
  if (!seen.includes(OPENING_ID)) { seen.push(OPENING_ID); Save.save(); }
}

/**
 * The beats.
 *
 * `lines` are authored; `of(kid)` builds the ones that need the player's own
 * Kid, so Maya's opening is about a cat that walked out of a shut house and
 * Samir's is about a guinea pig. `figure` is who is on screen.
 */
const PAGES = [
  {
    id: 'kid', kind: 'pick',
    head: 'Somebody’s pet went missing.',
    sub: 'Start with whose.',
  },
  {
    id: 'loss', figure: 'kid',
    of: (k, info) => [
      `${k.pet} is a ${String(info.species || k.petBreed).toLowerCase()}.`,
      info.lost,
      `${k.name.split(' ')[0]} looked everywhere twice, and then everywhere again.`,
      info.note,
    ],
  },
  {
    id: 'others',
    lines: [
      'Then it happened to somebody else. Then somebody else.',
      'Seven pets, one neighbourhood, one summer — and when the kids finally '
      + 'sat down on the kerb outside the corner shop and compared dates, not one '
      + 'of the stories was the odd one out.',
    ],
  },
  {
    id: 'rumour',
    lines: [
      'Everybody’s grandmother tells the same one. Animals disappear around the '
      + 'old mansion. Some of them remember it happening when THEY were children.',
      'There are stories about barking behind boarded windows. About cats watching '
      + 'from upstairs rooms in a house nobody has lived in for fifty years.',
      'The adults call it folklore. The kids counted.',
    ],
  },
  {
    id: 'in',
    lines: [
      'So they brought torches, snacks, a first-aid kit and whatever else fit in a '
      + 'backpack, and they went in.',
      'They were expecting broken floors. Dark rooms. Maybe squatters. Maybe a fox.',
      'Behind them the door closes. The corridor they came down is not there any more.',
    ],
  },
  {
    id: 'cat', figure: 'marmalade',
    lines: [
      'Something walks out of the dark, sits down in front of them, and starts '
      + 'washing a paw.',
      'It is a cat. You can see the wallpaper through her.',
      'She was an ordinary cat once. She has been in this house a very long time.',
    ],
  },
  {
    id: 'fight', figure: 'marmalade', kind: 'fight',
    of: (k) => [
      'Something else comes out of the dark. It is not a cat.',
      `Nobody asks her to. She puts herself between it and ${k.name.split(' ')[0]}, `
      + 'and her back goes up.',
    ],
    cta: 'Stay behind her',
  },
  /* ── after the Scuffle ─────────────────────────────────────────────────── */
  {
    id: 'after', after: true, figure: 'marmalade',
    lines: [
      'The thing comes apart into dust and stops being anything at all.',
      'The cat sits down and washes the same paw again, which is the most ordinary '
      + 'thing that has happened all night.',
    ],
  },
  {
    id: 'name', after: true, figure: 'marmalade',
    lines: [
      'There is a collar tag on the hall floor with a name stamped into it. '
      + 'MARMALADE. It is fifty years old.',
      'She is coming with you. That was never in question — she decided it '
      + 'before anybody knew her name.',
    ],
  },
  {
    id: 'hook', after: true, kind: 'begin',
    of: (k) => [
      'There are more of them in here. The house has been collecting for a very '
      + 'long time — animals from this world, and some from somewhere else.',
      `${k.pet} is in here somewhere. So are seven others, and sixteen who stopped `
      + 'being pets a long time ago.',
      'Find them. Get them out before the house finishes with them.',
    ],
    cta: 'Go and find them',
  },
];

const FIRST_AFTER = PAGES.findIndex((p) => p.after);

export class TutorialScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this.i = 0;
    this.kid = null;
    this.seed = 0;
  }

  async enter(params = {}) {
    const { ctx } = this;
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_TUT)]);

    const settings = Save.settings;
    setReduceMotion(!!settings.reduceMotion);
    document.documentElement.classList.toggle('mm-large-text', !!settings.largeText);
    warmFaces({ sync: true });

    /* Session state, because the fight is a DIFFERENT SCENE and this one is
       destroyed while it runs. `scenes/combat.js` reads nothing from here — it
       only knows to come back to `tutorial` with `step=after`. */
    const carried = ctx.tutorial || {};
    this.kid = params.kid || carried.kid || null;
    this.seed = Number(params.seed || carried.seed) || (Date.now() % 0x7fffffff);
    ctx.tutorial = { kid: this.kid, seed: this.seed };

    /* THE ONE SCREEN OUTSIDE COMBAT THAT SHOWS THE MANSION.
       Nine of the ten scenes cover the canvas completely and pause the stage
       (see `_stage.js`). This one is prose over a lit room, and the room is the
       point — the atmosphere layer has seventeen authored spaces and until now
       only Scuffles ever stood in one. */
    try { ctx.stage.setPaused(false); } catch { /* no stage */ }
    try { ctx.atmosphere.setMood('foyer', { seed: 'tutorial' }); } catch {}
    try { ctx.audio?.music?.('map'); } catch {}

    this.root.classList.add('tut-root');
    this.root.innerHTML = '';
    this.root.appendChild(el('div', 'tut-veil'));

    const stage = this._stage = el('div', 'tut-stage');
    stage.appendChild(this._buildFigure());
    stage.appendChild(this._buildPanel());
    this.root.appendChild(stage);
    /* The board is a SIBLING of the stage, not a page inside the panel: it is
       its own full-screen painting and it must not inherit the prose column's
       width or padding. `_render` shows exactly one of the two. */
    this.root.appendChild(this._buildBoard());
    this.root.appendChild(this._buildSkip());

    this._wire();
    await fontsReady();

    /* `step` is a page id, so the fight can send us back to either half: `after`
       when it was won, `fight` when it was not and Marmalade has to step in
       front of you again. */
    const at = params.step ? PAGES.findIndex((p) => p.id === params.step) : -1;
    this.i = at >= 0 ? at : (carried.after ? FIRST_AFTER : 0);
    if (this.kid && this.i === 0) this.i = 1;          // a Kid was handed in
    this._render(true);
    bus.emit('tutorial:ready', { page: PAGES[this.i].id, kid: this.kid });
  }

  /* ── the stage ──────────────────────────────────────────────────────────── */
  _buildFigure() {
    const f = this._fig = el('div', 'tut-fig');
    f.setAttribute('aria-hidden', 'true');
    return f;
  }

  _buildPanel() {
    const p = this._panel = el('section', 'tut-panel');
    p.innerHTML = `
      <h1 class="tut-head"></h1>
      <p class="tut-sub"></p>
      <div class="tut-lines"></div>
      <div class="tut-foot">
        <span class="tut-dots" aria-hidden="true"></span>
        <button class="tut-next" type="button">Go on</button>
      </div>`;

    return p;
  }

  /**
   * THE KID BOARD IS `UI/selectKid.png`, the way the Companion board is its own
   * painting and the Title is `mainMenu.png`.
   *
   * It was a grid of eight thumbnails and a paragraph — a screen rebuilt out of
   * parts while the painting for it sat prepared and wired to nothing since
   * August (`game/assets/ui/select-kid.jpg`; `portrait.js` said so in a comment
   * and HANDOFF.md said so again).
   *
   * The painting already contains the eight portraits, the oval mirror, the
   * slotted dossier and both buttons, so nothing here draws a frame: it lays
   * transparent hotspots over the painted frames, puts the chosen Kid's own art
   * in the glass, and writes live text into the panel's slots. Geometry is
   * `KID_BOARD` in ui/portrait.js, measured off the file.
   *
   * `contain`, never `cover`: the gold border is the composition and cropping it
   * reads as a bug. The letterbox is the room the painting is hung in.
   */
  _buildBoard() {
    const b = this._board = el('div', 'tut-board');
    b.hidden = true;

    const sheet = this._sheet = el('div', 'tut-sheet');
    sheet.style.backgroundImage = `url("${menuArtSrc('kid')}")`;

    const hots = el('div', 'tut-hots');
    hots.setAttribute('role', 'listbox');
    hots.setAttribute('aria-label', 'Choose a Kid');
    for (const [slug, rect] of Object.entries(KID_BOARD.cells)) {
      const k = KIDS.find((x) => x.slug === slug);
      if (!k) continue;
      const h = el('button', 'tut-hot');
      h.type = 'button';
      h.dataset.slug = slug;
      h.style.cssText = kidBoardRect(rect);
      h.setAttribute('role', 'option');
      h.setAttribute('aria-selected', 'false');
      h.setAttribute('aria-label', `${k.name}, looking for ${k.pet}`);
      hots.appendChild(h);
    }
    sheet.appendChild(hots);

    /* THE GLASS. Empty until somebody is chosen — an oval of painted black is
       what the picture wants when nobody is picked, and filling it with a
       placeholder would be worse than leaving it. */
    const glass = this._glass = el('div', 'tut-glass');
    glass.style.cssText = kidBoardRect(KID_BOARD.mirror);
    glass.setAttribute('aria-hidden', 'true');
    sheet.appendChild(glass);

    const panel = this._dossier = el('div', 'tut-dos');
    panel.style.cssText = kidBoardRect(KID_BOARD.panel);
    sheet.appendChild(panel);

    const back = this._back = el('button', 'tut-btn tut-btn--back');
    back.type = 'button';
    back.style.cssText = kidBoardRect(KID_BOARD.back);
    back.setAttribute('aria-label', 'Back to the title screen');
    sheet.appendChild(back);

    const go = this._go = el('button', 'tut-btn tut-btn--go');
    go.type = 'button';
    go.style.cssText = kidBoardRect(KID_BOARD.confirm);
    go.setAttribute('aria-label', 'Confirm this Kid');
    go.disabled = true;
    sheet.appendChild(go);

    b.appendChild(sheet);
    return b;
  }

  _buildSkip() {
    const s = el('button', 'tut-skip');
    s.type = 'button';
    s.innerHTML = 'Skip &mdash; I know the house';
    s.addEventListener('click', () => this._skip());
    return s;
  }

  _wire() {
    const on = (n, ev, fn, o) => { n.addEventListener(ev, fn, o); this._offs.push(() => n.removeEventListener(ev, fn, o)); };

    /* THE BOARD. Selecting and CONFIRMING are two steps, because the painting
       has a confirm button on it and a screen with a tick that does nothing is
       worse than no tick. Clicking a frame picks; the tick commits. Clicking a
       frame that is already picked commits too, so the mouse never has to cross
       the board twice. */
    const hots = this._board.querySelector('.tut-hots');
    on(hots, 'click', (e) => {
      const b = e.target.closest('.tut-hot');
      if (!b) return;
      if (this.kid === b.dataset.slug) this._chooseKid(b.dataset.slug);
      else this._pickKid(b.dataset.slug);
    });
    on(hots, 'pointerover', (e) => {
      const b = e.target.closest('.tut-hot');
      if (b) this._previewKid(b.dataset.slug);
    });
    on(hots, 'pointerleave', () => this._previewKid(this.kid || this._hover));
    on(hots, 'focusin', (e) => {
      const b = e.target.closest('.tut-hot');
      if (b) this._previewKid(b.dataset.slug);
    });
    this._offs.push(rovingFocus(hots, '.tut-hot', {
      cols: 0, wrap: true, onActivate: (b) => this._pickKid(b.dataset.slug),
    }));
    on(this._go, 'click', () => { if (this.kid) this._chooseKid(this.kid); });
    on(this._back, 'click', () => this.ctx.scenes?.go?.('title', {}));

    on(this._panel.querySelector('.tut-next'), 'click', () => this._advance());

    on(window, 'keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); this._skip(); return; }
      /* Enter and Space turn the page, but NOT while the Kid strip has focus —
         there they choose, and `rovingFocus` has already claimed them. */
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement && document.activeElement.closest('.tut-hots')) return;
        /* On the board the page does not turn: the tick does. Falling through
           to `_advance` here let Space skip the pick entirely. */
        if (this._page().kind === 'pick') {
          if (this.kid) { e.preventDefault(); this._chooseKid(this.kid); }
          return;
        }
        e.preventDefault();
        this._advance();
      }
    });
  }

  /* ── pages ──────────────────────────────────────────────────────────────── */
  _page() { return PAGES[this.i]; }

  _render(instant = false) {
    const p = this._page();
    const k = KIDS.find((x) => x.slug === this.kid) || null;
    const info = (k && KID_CODEX[k.slug]) || {};
    const panel = this._panel;

    panel.dataset.page = p.id;
    panel.querySelector('.tut-head').textContent = p.head || '';
    panel.querySelector('.tut-head').hidden = !p.head;
    panel.querySelector('.tut-sub').textContent = p.sub || '';
    panel.querySelector('.tut-sub').hidden = !p.sub;

    const lines = p.lines || (p.of && k ? p.of(k, info) : []);
    const host = panel.querySelector('.tut-lines');
    host.innerHTML = '';
    for (const line of lines) host.appendChild(el('p', 'tut-line', esc(line)));
    host.hidden = !lines.length;

    const picking = p.kind === 'pick';
    /* The board REPLACES the prose stage on this page. Both visible at once was
       the old grid's problem: a heading, a strip and a paragraph competing for
       the same screen. */
    this._board.hidden = !picking;
    this._stage.hidden = picking;
    if (picking) this._previewKid(this.kid || this._hover || KIDS[0].slug);

    const next = panel.querySelector('.tut-next');
    next.textContent = p.cta || 'Go on';
    /* Nothing to press until somebody has been chosen. The strip is the page. */
    next.hidden = picking;

    this._setFigure(p.figure, k);
    /* A page with nobody on it gets the whole stage. `.tut-fig:empty` is
       `display:none`, which takes it out of the grid entirely — so without this
       the panel inherited the FIGURE's 22rem column and the prose ran four
       words to a line. */
    this.root.dataset.wide = (p.figure && (p.figure !== 'kid' || k)) ? '0' : '1';
    this._dots();

    /* The page fades in on EVERY page, the Kid picker included. This used to be
       the else-branch of the `picking` test, so the one page that opens the
       scene was the one page that never got `is-in` — and `.tut-panel` starts
       at `opacity: 0`, so the whole screen was a lit room with nothing on it. */
    if (!instant && !reduceMotion()) {
      panel.classList.remove('is-in');
      void panel.offsetWidth;                    // restart the fade
    }
    panel.classList.add('is-in');

    if (picking) {
      requestAnimationFrame(() => {
        (this._board.querySelector('.tut-hot[aria-selected="true"]')
          || this._board.querySelector('.tut-hot'))?.focus();
      });
    }
  }

  _dots() {
    const host = this._panel.querySelector('.tut-dots');
    const total = PAGES.length;
    host.innerHTML = '';
    for (let n = 0; n < total; n++) {
      const d = el('i', 'tut-dot' + (n === this.i ? ' is-on' : n < this.i ? ' is-past' : ''));
      host.appendChild(d);
    }
  }

  /**
   * Who is on screen. The Kid is their painted portrait; Marmalade is her hero
   * render, which is the only place in the game outside the Companion dossier
   * that it is shown at size.
   */
  _setFigure(which, k) {
    const f = this._fig;
    if (!which || (which === 'kid' && !k)) { f.innerHTML = ''; f.dataset.who = ''; return; }
    if (f.dataset.who === which + (which === 'kid' ? ':' + k.slug : '')) return;
    f.dataset.who = which + (which === 'kid' ? ':' + k.slug : '');
    f.innerHTML = '';
    if (which === 'kid') {
      f.appendChild(kidImg(k.slug, { className: 'tut-fig__img kidpf' }));
    } else {
      const img = document.createElement('img');
      img.className = 'tut-fig__img tut-fig__img--ghost';
      img.src = heroSrc('marmalade');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      f.appendChild(img);
    }
  }

  /* ── the Kid ────────────────────────────────────────────────────────────── */

  /**
   * Show a Kid in the glass and the panel WITHOUT committing to them.
   *
   * The painting's dossier is four slotted bands with a medallion on each
   * divider — a star, a shield, a star, a paw — so the text is written into
   * those bands rather than run as one paragraph. The paw is the pet, which is
   * what the medallion is a picture of.
   */
  _previewKid(slug) {
    const k = KIDS.find((x) => x.slug === slug);
    if (!k) return;
    this._hover = slug;
    const info = KID_CODEX[slug] || {};
    const first = k.name.split(' ')[0];

    /* THE GLASS holds the Kid's own full portrait — the same art the story
       beats put on the stage — cropped to the oval, so the mirror shows a
       person rather than a thumbnail scaled up. */
    const g = this._glass;
    if (g.dataset.slug !== slug) {
      g.dataset.slug = slug;
      g.innerHTML = '';
      // `kidImg` takes a SLUG and its variants are 'portrait' | 'thumb'; the
      // full portrait is what the glass wants, cropped to the oval by CSS.
      g.appendChild(kidImg(slug, { variant: 'portrait', className: 'tut-glass__img', alt: '' }));
    }

    this._dossier.innerHTML =
      `<div class="tut-dos__band tut-dos__band--name">`
      + `<b class="tut-dos__n">${esc(k.name)}</b>`
      + (info.age ? `<span class="tut-dos__a">${esc(String(info.age))}</span>` : '')
      + `</div>`
      + `<div class="tut-dos__band tut-dos__band--trait">`
      + `<p class="tut-dos__t">${esc(info.trait || '')}</p>`
      + `</div>`
      + `<div class="tut-dos__band tut-dos__band--perk">`
      + `<div class="tut-dos__half">`
      + (info.perk ? `<b class="tut-dos__k">${esc(info.perk[0])}</b>`
                   + `<p class="tut-dos__p">${esc(info.perk[1] || '')}</p>` : '')
      + `</div>`
      + `<div class="tut-dos__half">`
      + (info.focus ? `<p class="tut-dos__f">${esc(info.focus)}</p>` : '')
      + `</div>`
      + `</div>`
      + `<div class="tut-dos__band tut-dos__band--pet">`
      + `<b class="tut-dos__pn">${esc(k.pet)}</b>`
      + `<span class="tut-dos__pk">${esc(info.species || k.petBreed || '')}</span>`
      + `<p class="tut-dos__pl">${esc(info.lost || '')}</p>`
      + `</div>`;

    this._fitBands();

    for (const b of this._board.querySelectorAll('.tut-hot')) {
      b.classList.toggle('is-hover', b.dataset.slug === slug);
    }
    this._go.disabled = !this.kid;
    this._go.setAttribute('aria-label',
      this.kid ? `Go into the house as ${first}` : 'Choose a Kid first');
  }

  /**
   * SHRINK A BAND THAT WILL NOT FIT ITS PAINTED BOX.
   *
   * The boxes are painted, so their heights are fixed and the codex entries are
   * not: seven Kids fit at the size the painting was designed around and Samir
   * does not — his perk ran 5px past the third box at 900x900. Sizing all eight
   * down to the longest would make the other seven small for no reason, so each
   * band carries its own `--fit` and only the one that overflows turns it down.
   *
   * Measured against the CHILDREN's boxes rather than `scrollHeight`: the bands
   * are centred flex columns, so content escapes upwards as readily as
   * downwards and `scrollHeight` does not see the top half of it.
   */
  _fitBands() {
    for (const band of this._dossier.querySelectorAll('.tut-dos__band')) {
      band.style.setProperty('--fit', '1');
      const over = () => {
        const br = band.getBoundingClientRect();
        if (!br.height) return 0;
        let d = 0;
        for (const c of band.querySelectorAll('*')) {
          const cr = c.getBoundingClientRect();
          if (!cr.height) continue;
          d = Math.max(d, cr.bottom - br.bottom, br.top - cr.top);
        }
        return d;
      };
      // 0.74 is the floor: below it the text is smaller than the painting's own
      // engraved labels and stops looking like part of the picture.
      for (let f = 1; f > 0.74 && over() > 1; ) {
        f -= 0.04;
        band.style.setProperty('--fit', f.toFixed(2));
      }
    }
  }

  /** Lock the frame in, but do not turn the page — the painted tick does that. */
  _pickKid(slug) {
    if (!KIDS.some((x) => x.slug === slug)) return;
    this.kid = slug;
    this.ctx.tutorial = { ...(this.ctx.tutorial || {}), kid: slug, seed: this.seed };
    for (const b of this._board.querySelectorAll('.tut-hot')) {
      b.setAttribute('aria-selected', String(b.dataset.slug === slug));
    }
    this._previewKid(slug);
    try { this.ctx.audio?.play?.('ui:confirm'); } catch {}
  }

  /** Commit and turn the page. `_pickKid` has already done the selecting. */
  _chooseKid(slug) {
    if (!KIDS.some((x) => x.slug === slug)) return;
    if (this.kid !== slug) this._pickKid(slug);
    try { this.ctx.audio?.play?.('ui:begin'); } catch {}
    this._advance();
  }

  /* ── moving on ──────────────────────────────────────────────────────────── */
  _advance() {
    const p = this._page();
    if (p.kind === 'pick' && !this.kid) return;
    if (p.kind === 'fight') return this._toFight();
    if (p.kind === 'begin') return this._begin();
    if (this.i >= PAGES.length - 1) return this._begin();
    this.i++;
    /* The pre-fight half ends AT the fight page; nothing walks from it into the
       after-pages by turning one more page. */
    try { this.ctx.audio?.play?.('ui:click'); } catch {}
    this._render();
  }

  _toFight() {
    this.ctx.tutorial = { kid: this.kid, seed: this.seed, after: true };
    try { this.ctx.audio?.play?.('ui:begin'); } catch {}
    /* THE REAL COMBAT SCENE. `foyer-1` is one Dust Bunny — `data/encounters.js`
       tier 'early', the gentlest thing in the house — at a fixed seed so the
       coached fight is the same fight for everybody who is taught it. */
    this.ctx.scenes.go('combat', {
      tutorial: '1',
      encounter: 'foyer-1',
      companion: 'marmalade',
      region: 'foyer',
      room: 'Entry Hall',
      seed: this.seed,
      kid: this.kid,
    }, { transition: reduceMotion() ? 'veil' : 'doorway' });
  }

  /** The expedition proper. Marmalade, the Kid they chose, and the same seed. */
  _begin() {
    markOpeningSeen();
    const kid = this.kid || KIDS[0].slug;
    const payload = {
      companion: 'marmalade', kid, seed: this.seed, haunt: 0,
      backpack: assertLoadout(loadoutFor(kid), `tutorial _begin(kid:'${kid}')`),
    };
    this.ctx.tutorial = null;
    try { this.ctx.audio?.play?.('ui:begin'); } catch {}
    bus.emit('run:start', payload);
    const go = () => this.ctx.scenes.go('map', payload);
    if (reduceMotion()) go(); else clock.wait(0.3).then(go);
  }

  /**
   * Out of the story and into the ordinary flow.
   *
   * NOT straight into a run: skipping before the Kid page would start an
   * expedition with a Kid nobody picked. The Companion/Kid screen is where that
   * choice lives, and it takes both as parameters, so a player who skips half
   * way lands there with what they had already decided.
   */
  _skip() {
    markOpeningSeen();
    const params = { companion: 'marmalade', seed: String(this.seed) };
    if (this.kid) params.kid = this.kid;
    this.ctx.tutorial = null;
    try { this.ctx.audio?.play?.('ui:back'); } catch {}
    this.ctx.scenes.go('select', params);
  }

  update() { /* CSS-composited */ }

  async exit() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this._stage = this._panel = this._fig = null;
    this.root.innerHTML = '';
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default TutorialScene;
