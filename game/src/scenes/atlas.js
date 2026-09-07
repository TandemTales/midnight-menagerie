/**
 * The Atlas — the whole estate on one sheet.  OWNER: map.
 *
 * `scenes/map.js` is the plan of the wing you are STANDING IN: rooms, route,
 * nodes, one section drawing cover-fitted onto a survey sheet.  This screen is
 * the level above it — the recovered master drawing of the entire house, all
 * seventeen wings at once, with the kids' own annotations pencilled over it.
 *
 * ── WHY THE WING GETS SHARPER WHEN YOU ZOOM IN ─────────────────────────────
 *
 * `mansion.png` is 1448x1086 and a wing is a fifth of it, so pushing in on one
 * is a 4x to 6x blow-up of about forty thousand pixels — which is a smear.  It
 * is not drawn that way.  Each wing's section file is a 1:1 CROP of the master
 * at exactly the rectangle `sections.json` records, and `blueprint_trace.py`
 * has already reduced that crop to the marks it is made of.  So zooming lays
 * the wing's own vectors back down on the exact rectangle they were cut from,
 * at whatever size the screen is now showing it: the house goes soft, and the
 * wing you are looking at goes hard.  See `ui/plan.js`.
 *
 * The detail box round it is not decoration covering a seam.  A section is a
 * rectangle of the master and the neighbouring wings overlap it, so re-inking
 * one has to say where it stops.  Enlarged details on a real drawing say so the
 * same way, with a ruled box and a scale.
 *
 * ── WHAT THE DRAWING KNOWS AND WHAT THE KIDS KNOW ──────────────────────────
 *
 * `docs/design/03-content-architecture.md` §9 splits these and so does this
 * screen: "Architectural blueprint as the permanent base / Player investigation
 * annotations as a separate overlay."  Every wing's plan and its name are on
 * the master because the house drew them — you can look at all seventeen from
 * the first night.  Who is HELD in a wing, and what guards it, is an annotation
 * and only appears on a wing you have surveyed.
 *
 * That is also the rule `scenes/select.js` already enforces from the other
 * side: it draws no tile at all for a Companion you have not freed, expressly
 * so the board cannot tell you how many are missing or where each one is.  An
 * atlas that printed "Hush — the Secret Passages" on night one would hand back
 * everything that screen refuses to say.
 *
 * ONE DELIBERATE EXCEPTION, added 2026-09-06 on the design owner's call: in
 * `enter` mode — choosing which wing tonight starts in — every wing shows who
 * is held there, surveyed or not.  The whole point of that screen is "go and
 * get the one you want first", and it cannot be used for that if it will not
 * say who is where.  It is not night one either: the mode does not exist until
 * the Foyer has been cleared (`canChooseEntry`).  Everywhere else the survey
 * gate above still holds, which is why this is a flag on the mode rather than
 * a change to `_surveyed`.
 *
 * ── AND IT IS WHERE THE EXPEDITION TURNS ───────────────────────────────────
 *
 * A cleared wing does not hand the party the next one. `Run#openWingFork` sends
 * them here with every wing they have not walked marked as a way on — the Heart
 * excepted, which is the ending rather than a wing you pick.
 *
 * `docs/design/01-mansion-structure.md` no longer decides WHETHER a wing can be
 * reached; it decides how each one reads. A wing this one architecturally joins,
 * whose door the house has left open tonight, is printed with the doc's own
 * reason for the join, because the chapter insists the regions "should not
 * merely touch because the map needs them to". Everything else is a manifested
 * way in — a wardrobe that does not end — and is styled as one.
 *
 * This is the right screen for it and the map is not: the choice is about the
 * HOUSE, and this is the only place that shows which wings exist, which you
 * have surveyed, and what is held in them.
 *
 * Deep link: `#scene=atlas`, `&wing=<slug>` to open zoomed on one,
 * `&all=1` to survey everything (a review door, never progress),
 * `&choose=1` for the fork (needs a run standing on one),
 * `&enter=1` to pick tonight's way in (needs `canChooseEntry`).
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { COMPANIONS, REGION_ORDER } from '../data/schema.js';
import { regionMeta, blueprintTraceUrl, MASTER, exitReason } from '../state/mapgen.js';
import { canChooseEntry } from '../state/run.js';
import { loadPlanTrace, solvePen, inkTrace } from '../ui/plan.js';
import {
  ensureCss, fontsReady, el, svg, rovingFocus, logoLockup, filigree,
  companionPortrait, COMPANION_BY_SLUG, setReduceMotion, reduceMotion,
  freedCompanions, warmFaces,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';
import { act, ACT } from '../net/actions.js';
import { INPUT } from '../net/session.js';
import { passTo, shouldHandOff } from '../ui/handoff.js';

const CSS_KIT = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_ATL = new URL('./atlas.css', import.meta.url).href;
const SECTIONS_URL = new URL('../../assets/blueprint/sections.json', import.meta.url).href;

/** Fraction of the frame left as margin round a wing when it is zoomed. */
const ZOOM_MARGIN = 0.06;
/** A wing never zooms past this, however small it is on the master. */
const ZOOM_MAX = 7;
/** Backing-store cap for the re-inked wing, long side, in device pixels. */
const INK_MAX = 2600;

/**
 * Geometry comes from `sections.json`; EVERYTHING ELSE comes from `regionMeta`.
 *
 * The file carries a name, boss and companion for each wing too — they were
 * written by `tools/blueprint_locate.py`, which read them off `state/mapgen.js`
 * in the first place.  Reading them back here would make the asset a second
 * source of truth for content the game already owns, and the two would be free
 * to disagree the moment a boss is renamed.  The rectangle is the one thing the
 * tool actually MEASURED, so the rectangle is the one thing we take.
 */
async function loadSections() {
  const r = await fetch(SECTIONS_URL);
  if (!r.ok) throw new Error(`sections.json ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const slug of REGION_ORDER) {
    const s = j.sections?.[slug];
    if (!s) continue;
    const meta = regionMeta(slug);
    out.push({
      slug, meta,
      n: meta.section,
      x: s.x, y: s.y, w: s.w, h: s.h,
      nx: s.nx, ny: s.ny, nw: s.nw, nh: s.nh,
      companion: COMPANIONS.find((c) => c.region === slug) || null,
    });
  }
  return out;
}

export class AtlasScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this._pf = null;
    this.wings = [];
    this.sel = null;          // slug of the wing the sheet is zoomed on
    this.hover = null;        // slug under the cursor / keyboard focus
    this.choosing = false;    // standing at a fork between wings
    this.entering = false;     // choosing which wing the expedition STARTS in
    this.startPayload = null;  // the run:start payload `enter` mode will fire
    this.offer = [];          // [{to, why, manifested}] while choosing
    this._voting = false;
  }

  async enter(params = {}) {
    const { ctx } = this;
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_ATL)]);

    const settings = Save.settings;
    setReduceMotion(!!settings.reduceMotion);
    document.documentElement.classList.toggle('mm-large-text', !!settings.largeText);
    try { ctx.atmosphere?.setMood?.('blueprint'); } catch {}

    // The sheet is opaque parchment edge to edge; the canvas behind it is not
    // visible at all. Same measurement scenes/map.js made.
    this._unpauseStage = pauseStageFor(ctx);
    warmFaces({ sync: true });

    this.wings = await loadSections();
    this.surveyed = this._surveyed(params.all === '1' || params.all === true);

    /* THE FORK. `run.pendingWing` is the truth, never the deep-link parameter:
       `&choose=1` on a run that is not standing at a fork would offer wings the
       house has not opened, and a resumed save that IS at one must show it
       whether or not the parameter survived. */
    const run = this.ctx.run;
    this.choosing = !!(run && run.pendingWing);

    /* THE WAY IN. `scenes/select.js` sends the whole `run:start` payload here
       instead of firing it, so this screen owns one decision and then starts
       the expedition. No run exists yet, which is what separates this from the
       fork above: `choosing` reads `run.pendingWing` and there isn't one.

       Guarded on `canChooseEntry()` as well as on the parameter, so a deep link
       cannot buy the unlock. Everything but the Heart is on offer — it is the
       ending, and starting there would be starting at the end. */
    this.entering = !this.choosing && (params.enter === '1' || params.enter === true)
      && canChooseEntry();
    this.startPayload = this.entering ? (params.payload || {}) : null;
    if (this.entering) {
      const last = this.wings[this.wings.length - 1].slug;
      this.offer = this.wings.filter((w) => w.slug !== last)
        .map((w) => ({ to: w.slug, why: null, manifested: false }));
    } else {
      this.offer = this.choosing ? run.pendingWing.options.slice() : [];
    }
    this.offered = new Set(this.offer.map((o) => o.to));
    this.trail = (run && Array.isArray(run.route)) ? run.route.slice(0, (run.regionIndex | 0) + 1) : [];
    this.root.dataset.choose = this.choosing ? '1' : '0';
    this.root.dataset.enter = this.entering ? '1' : '0';

    this.root.classList.add('at-root');
    this.root.innerHTML = '';
    this.root.appendChild(el('div', 'at-bg'));
    this.root.appendChild(this._buildHead());

    const body = el('div', 'at-body');
    body.appendChild(this._buildSheet());
    body.appendChild(this._buildDossier());
    this.root.appendChild(body);

    this._wire();
    await fontsReady();
    this._layout();

    this._paintTrail();
    this._paintBallot();

    /* AT A FORK THE SCREEN OPENS ON THE WHOLE HOUSE, and the first version of
       this opened zoomed on the first way on — which showed the player one wing
       at the exact moment the question is "which of these three". The dossier
       previews the first option so the panel is not blank; the drawing shows
       all of them. */
    const want = params.wing && this.wings.some((w) => w.slug === params.wing) ? params.wing : null;
    this._show((this.choosing || this.entering) ? (want || this.offer[0].to)
      : (want || this.trail[this.trail.length - 1] || this.wings[0].slug));
    if (want && !this.choosing && !this.entering) this._select(want, true);

    bus.emit('atlas:ready', {
      wings: this.wings.length, surveyed: this.surveyed.size,
      choosing: this.choosing, entering: this.entering,
      offer: this.offer.map((o) => o.to),
    });
  }

  /**
   * Which wings carry annotations.
   *
   * `Save.data.blueprint.revealed` is the record of wings walked, kept by
   * `state/run.js#markWingMapped`.  A rescued Companion's own wing is unioned
   * in because you cannot have freed them without having been there, and a save
   * made before the record existed would otherwise show a house you have
   * demonstrably crossed as blank.  The Foyer is always in: it is where the
   * front door is.
   */
  _surveyed(all) {
    if (all) return new Set(this.wings.map((w) => w.slug));
    const out = new Set(['foyer']);
    for (const slug of (Save.data.blueprint?.revealed || [])) out.add(slug);
    for (const slug of freedCompanions()) {
      const c = COMPANION_BY_SLUG[slug];
      if (c && c.region) out.add(c.region);
    }
    // A run in progress has been through everything up to where it stands.
    const run = this.ctx.run;
    if (run && Array.isArray(run.route)) {
      for (let i = 0; i <= (run.regionIndex | 0) && i < run.route.length; i++) out.add(run.route[i]);
    }
    return out;
  }

  /** A wing is being PICKED — at the fork on the way on, or on the way in.
      The two modes differ in what commits (a vote against a run, or a
      `run:start`) and in nothing the pointer and keyboard care about. */
  get picking() { return this.choosing || this.entering; }

  /* ── chrome ─────────────────────────────────────────────────────────────── */
  _buildHead() {
    const h = el('header', 'at-head');

    const back = el('button', 'at-back');
    back.type = 'button';
    back.innerHTML = '<span aria-hidden="true">&#8592;</span> Back';
    back.addEventListener('click', () => this._leave());
    /* No way out of a fork except through it. The party has cleared a wing and
       the house is holding a door open; leaving would mean a run with nowhere
       to be. `_leave` refuses too — this only stops it being offered. */
    back.hidden = this.choosing;
    // `enter` mode CAN be backed out of — it happens before the run exists,
    // so leaving just returns to Companion Select with nothing spent.
    h.appendChild(back);

    const logo = logoLockup({
      size: 'sm', id: 'mm-logo-atlas',
      plaque: this.choosing ? 'The Way On' : this.entering ? 'The Way In' : 'The Mansion',
    });
    logo.classList.add('at-logo');
    h.appendChild(logo);

    const tally = this._tally = el('p', 'at-tally');
    if (this.choosing) {
      const run = this.ctx.run;
      tally.innerHTML = `<b>${run.regionIndex + 1}</b> <span>of ${run.wings} wings crossed</span>`;
    } else if (this.entering) {
      tally.innerHTML = '<span>Choose where tonight starts</span>';
    } else {
      tally.innerHTML = `<b>${this.surveyed.size}</b> <span>of ${this.wings.length} wings surveyed</span>`;
    }
    h.appendChild(tally);
    return h;
  }

  /* ── the sheet ──────────────────────────────────────────────────────────── */
  _buildSheet() {
    const sheet = el('div', 'at-sheet');

    const vp = this._vp = el('div', 'at-vp');
    const plate = this._plate = el('div', 'at-plate');

    const img = this._estate = document.createElement('img');
    img.className = 'at-estate';
    img.src = new URL(`../../${MASTER.url}`, import.meta.url).href;
    img.width = MASTER.w; img.height = MASTER.h;
    img.decoding = 'async';
    img.fetchPriority = 'high';
    img.draggable = false;
    /* Presentational: everything this drawing says is said again by the
       seventeen buttons over it, each of which carries its own label. */
    img.alt = '';
    plate.appendChild(img);

    // the re-inked wing, laid back on the rectangle it was cut from
    const ink = this._ink = document.createElement('canvas');
    ink.className = 'at-ink';
    ink.hidden = true;
    plate.appendChild(ink);

    /* THE TRAIL. Pencil over the printed drawing — the same ground/figure
       split `scenes/map.js` uses for its route, and the reason this is graphite
       and the house is ink. Solid where the party has walked, dashed to each
       door the house is holding open. viewBox is the master's own pixel size
       so a wing's centre is just its rect's centre, and the plate is fitted to
       exactly that aspect (`_fitSheet`), so nothing is distorted. */
    const trail = this._trail = svg(`<svg class="at-trail" viewBox="0 0 ${MASTER.w} ${MASTER.h}"
         preserveAspectRatio="none" aria-hidden="true">
      <path class="at-trail__walked" d=""></path>
      <path class="at-trail__open" d=""></path>
      <g class="at-trail__marks"></g>
    </svg>`);
    plate.appendChild(trail);

    const hots = this._hots = el('div', 'at-hots');
    hots.setAttribute('role', 'listbox');
    hots.setAttribute('aria-label',
      `The mansion — ${this.wings.length} wings, ${this.surveyed.size} surveyed`);
    for (const w of this.wings) {
      const b = el('button', 'at-hot');
      b.type = 'button';
      b.dataset.wing = w.slug;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      b.style.left = `${w.nx * 100}%`;
      b.style.top = `${w.ny * 100}%`;
      b.style.width = `${w.nw * 100}%`;
      b.style.height = `${w.nh * 100}%`;
      /* AT A FORK the ways on are marked whether or not the cursor is near
         them — two or three doors, and finding them is the whole screen. On the
         WAY IN sixteen wings are open, and marking all sixteen drew sixteen
         boxes and sixteen labels over a drawing that overlaps itself: the
         labels collided into an unreadable band across the middle. So entry
         mode leaves the tiles in their ordinary hover-to-reveal state and marks
         only what is CLOSED — the Heart. Everything legible is choosable, which
         is the same information without the noise. */
      if (this.offered.has(w.slug)) { if (this.choosing) b.classList.add('is-open'); }
      else if (this.choosing || this.entering) b.classList.add('is-shut');
      if (this.trail.includes(w.slug)) b.classList.add('is-walked');
      if (this.trail[this.trail.length - 1] === w.slug) b.classList.add('is-here');
      b.setAttribute('aria-label', this._hotLabel(w));
      b.innerHTML = `<span class="at-hot__box" aria-hidden="true"></span>`
        + `<span class="at-hot__tag">${esc(w.meta.name)}</span>`;
      hots.appendChild(b);
    }
    plate.appendChild(hots);
    vp.appendChild(plate);
    sheet.appendChild(vp);

    /* The title block sits UNDER the drawing, not over it. `scenes/map.js`
       learned this the expensive way twice: a label laid across a plan covers
       marks, and on a drawing that is simply wrong however high its z-index is
       — both offenders there ended up moved or tucked. */
    const foot = el('div', 'at-foot');
    foot.innerHTML =
      `<span class="at-foot__t">The Mansion &mdash; recovered floor plan</span>`
      + `<span class="at-foot__d">Hand-copied. Scale approximate.</span>`;
    sheet.appendChild(foot);

    const back = this._wide = el('button', 'at-wide');
    back.type = 'button';
    back.hidden = true;
    back.innerHTML = '<span aria-hidden="true">&#8598;</span> The whole house';
    back.addEventListener('click', () => this._select(null));
    sheet.appendChild(back);

    return sheet;
  }

  _hotLabel(w) {
    const seen = this.surveyed.has(w.slug) || this.entering;
    const o = this.offer.find((x) => x.to === w.slug);
    const way = o ? ` A way on from here: ${o.why}.` : this.choosing ? ' No way through tonight.' : '';
    if (!seen) return `${w.meta.name}. Unsurveyed.${way}`;
    const held = w.companion ? ` ${w.companion.name}, ${w.companion.title}, is held here.` : '';
    return `${w.meta.name}. Surveyed.${held} Guarded by ${w.meta.boss}.${way}`;
  }

  /* ── the pencil trail ───────────────────────────────────────────────────── */

  /** A wing's centre on the master drawing, in its own pixels. */
  _centre(slug) {
    const w = this.wings.find((x) => x.slug === slug);
    if (!w) return null;
    return [(w.nx + w.nw / 2) * MASTER.w, (w.ny + w.nh / 2) * MASTER.h];
  }

  /**
   * Where they have been, and where the house says they can go.
   *
   * Drawn as a pencil line, not a straight rule: each leg bows by a seeded
   * fraction of its own length, perpendicular to itself, so the trail reads as
   * something somebody drew on a printed plan rather than as a graph edge. The
   * seed is the pair of wings, so the same leg always bows the same way and the
   * drawing does not twitch when the sheet is re-laid.
   */
  _paintTrail() {
    if (!this._trail) return;
    const bow = (a, b, k) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      return `Q ${(mx - dy * k).toFixed(1)} ${(my + dx * k).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    };
    // A stable little hash, so a leg's bow belongs to the leg.
    const lean = (a, b) => {
      let h = 0;
      for (const ch of `${a}>${b}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
      return ((h % 9) - 4) / 90;                       // about ±4.5% of the run
    };

    let walked = '';
    for (let i = 0; i < this.trail.length; i++) {
      const c = this._centre(this.trail[i]);
      if (!c) continue;
      if (!walked) { walked = `M ${c[0].toFixed(1)} ${c[1].toFixed(1)}`; continue; }
      const prev = this._centre(this.trail[i - 1]);
      walked += ' ' + bow(prev, c, lean(this.trail[i - 1], this.trail[i]));
    }
    this._trail.querySelector('.at-trail__walked').setAttribute('d', walked);

    let open = '';
    const from = this.trail[this.trail.length - 1];
    const a = from && this._centre(from);
    if (a) {
      for (const o of this.offer) {
        const b = this._centre(o.to);
        if (!b) continue;
        open += `M ${a[0].toFixed(1)} ${a[1].toFixed(1)} ` + bow(a, b, lean(from, o.to)) + ' ';
      }
    }
    this._trail.querySelector('.at-trail__open').setAttribute('d', open.trim());

    const marks = this._trail.querySelector('.at-trail__marks');
    marks.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    for (const slug of this.trail) {
      const c = this._centre(slug);
      if (!c) continue;
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', c[0].toFixed(1));
      dot.setAttribute('cy', c[1].toFixed(1));
      dot.setAttribute('r', slug === from ? '11' : '7');
      dot.setAttribute('class', slug === from ? 'at-mark at-mark--here' : 'at-mark');
      marks.appendChild(dot);
    }
  }

  /* ── the dossier ────────────────────────────────────────────────────────── */
  _buildDossier() {
    const d = this._dossier = el('aside', 'at-dossier');
    d.setAttribute('aria-live', 'polite');
    d.innerHTML = `
      <div class="at-dos__rule" aria-hidden="true"></div>
      <p class="at-dos__no">Section <b class="at-dos__n">I</b></p>
      <h2 class="at-dos__name">&nbsp;</h2>
      <p class="at-dos__form">&nbsp;</p>
      <div class="at-dos__held">
        <div class="at-dos__pf"></div>
        <div class="at-dos__who">
          <span class="at-dos__lbl">Held here</span>
          <b class="at-dos__cname">&nbsp;</b>
          <span class="at-dos__ctitle">&nbsp;</span>
        </div>
      </div>
      <dl class="at-dos__facts">
        <div><dt>Kept by</dt><dd class="at-dos__boss">&mdash;</dd></div>
        <div><dt>Rooms</dt><dd class="at-dos__rooms">20</dd></div>
        <div><dt>Survey</dt><dd class="at-dos__state">&mdash;</dd></div>
      </dl>
      <p class="at-dos__why" hidden></p>
      <div class="at-dos__inside" hidden>
        <span class="at-dos__lbl">Through that door</span>
        <p class="at-dos__depth"></p>
        <ul class="at-dos__cond"></ul>
      </div>
      <p class="at-dos__hint"></p>
      <div class="at-dos__act" hidden>
        <button class="at-go" type="button">Go this way</button>
        <p class="at-ballot" aria-live="polite" hidden></p>
      </div>`;
    d.appendChild(svg(`<div class="at-dos__fil" aria-hidden="true">
      <svg viewBox="0 0 320 80">${filigree()}</svg></div>`));
    return d;
  }

  /* ── wiring ─────────────────────────────────────────────────────────────── */
  _wire() {
    const on = (node, ev, fn, opts) => {
      node.addEventListener(ev, fn, opts);
      this._offs.push(() => node.removeEventListener(ev, fn, opts));
    };

    on(this._hots, 'pointerover', (e) => {
      const b = e.target.closest('.at-hot');
      if (b) this._show(b.dataset.wing);
    });
    on(this._hots, 'focusin', (e) => {
      const b = e.target.closest('.at-hot');
      if (b) this._show(b.dataset.wing);
    });
    on(this._hots, 'pointerleave', () => this._show(this.sel || this.hover));
    on(this._hots, 'click', (e) => {
      const b = e.target.closest('.at-hot');
      if (!b) return;
      const slug = b.dataset.wing;
      /* At a fork, clicking a way on the SECOND time takes it. The first click
         zooms — a wing is a whole act and nobody should commit to one they have
         not looked at — and the dossier's own button is the other way to do it. */
      if (this.picking && this.offered.has(slug) && this.sel === slug) return this._choose(slug);
      if (this.picking && !this.offered.has(slug)) { this._select(slug); return; }
      this._select(slug === this.sel ? null : slug);
    });

    this._offs.push(rovingFocus(this._hots, '.at-hot', {
      cols: 0, wrap: true,
      onActivate: (b) => {
        const slug = b.dataset.wing;
        if (this.picking && this.offered.has(slug) && this.sel === slug) return this._choose(slug);
        this._select(slug === this.sel ? null : slug);
      },
    }));

    on(this._dossier.querySelector('.at-go'), 'click', () => {
      if (this.hover) this._choose(this.hover);
    });

    on(window, 'keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      /* At a fork Escape pulls back out of a wing and stops there. There is no
         "leave" while the house is holding a door open — see `_leave`. */
      if (this.sel) this._select(null);
      else if (!this.choosing) this._leave();
    });

    // The ballot belongs to the run, so it is repainted from the run's events —
    // including the ones another client raised.
    this._offs.push(bus.on('wing:vote', () => this._paintBallot()));
    this._offs.push(bus.on('wing:chosen', (v) => this._announce(v)));

    /* The SHEET, never the viewport: `_fitSheet()` resizes the viewport, so
       watching it would feed its own output back in as a resize. */
    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this._vp.parentElement);
  }

  /* ── the zoom ───────────────────────────────────────────────────────────── */

  /**
   * Place the DRAWING on the paper: the largest 1448x1086 box that fits the
   * sheet, with a margin for the title block under it.
   *
   * This is in JS on purpose. `aspect-ratio` in CSS is dropped the moment both
   * axes end up constrained — which is exactly what happens to a grid item that
   * is `width:100%` and `max-height:100%` — and a stretched estate would put
   * every one of the seventeen hotspots, each a percentage of the drawing, over
   * the wrong architecture. Measuring the box once per resize keeps the ratio
   * exact and the rectangles honest.
   */
  _fitSheet() {
    const sheet = this._vp.parentElement;
    const b = sheet.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    const pad = Math.max(8, Math.min(22, b.width * 0.014));
    const foot = 30;                                    // the title block's strip
    const aw = Math.max(1, b.width - pad * 2);
    const ah = Math.max(1, b.height - pad * 2 - foot);
    const k = Math.min(aw / MASTER.w, ah / MASTER.h);
    const w = Math.round(MASTER.w * k), h = Math.round(MASTER.h * k);
    const vp = this._vp;
    vp.style.width = `${w}px`;
    vp.style.height = `${h}px`;
    vp.style.left = `${Math.round((b.width - w) / 2)}px`;
    vp.style.top = `${Math.round(pad + (ah - h) / 2)}px`;
    return true;
  }

  /** Viewport-relative geometry for one wing, in plate pixels. */
  _rectOf(w) {
    const r = this._vp.getBoundingClientRect();
    return {
      vw: r.width, vh: r.height,
      x: w.nx * r.width, y: w.ny * r.height,
      w: w.nw * r.width, h: w.nh * r.height,
    };
  }

  /**
   * Push the plate in on the selected wing, or lay it flat again.
   *
   * `transform-origin` is the plate's own top-left, so a point p maps to
   * `t + k·p` and centring one rectangle is one subtraction.  The translate is
   * then clamped so the plate can never pull away from the frame and show a
   * hole — a wing near the edge simply sits off-centre, which is what happens
   * when you slide a real drawing under a magnifier.
   */
  _layout() {
    if (!this._plate) return;
    if (!this._fitSheet()) return;
    const w = this.sel && this.wings.find((x) => x.slug === this.sel);
    if (!w) {
      this._plate.style.transform = 'translate(0px, 0px) scale(1)';
      this._plate.style.setProperty('--k', '1');
      this._k = 1;
      return;
    }
    const r = this._rectOf(w);
    const k = Math.min(ZOOM_MAX,
      Math.max(1, Math.min(r.vw * (1 - 2 * ZOOM_MARGIN) / r.w, r.vh * (1 - 2 * ZOOM_MARGIN) / r.h)));
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const tx = clamp(r.vw / 2 - k * cx, r.vw - k * r.vw, 0);
    const ty = clamp(r.vh / 2 - k * cy, r.vh - k * r.vh, 0);
    this._k = k;
    /* Everything pinned to the plate is magnified with it — a 13px label at 4.6x
       is a 60px banner across the plan, which is the exact failure `scenes/map.js`
       hit twice with its own title card. `--k` lets a mark undo the zoom and stay
       the size it was drawn. */
    this._plate.style.setProperty('--k', k.toFixed(4));
    this._plate.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(4)})`;
    this._paintInk(w, r, k);
  }

  /**
   * Re-ink one wing onto the rectangle it was cut from.
   *
   * The canvas sits at the section's exact rect on the plate, so the vectors
   * land on the same architecture the bitmap under them is showing — this is a
   * redraw of that rectangle, not a picture pasted near it.
   *
   * `scale` handed to `inkTrace` is the ON-SCREEN magnification, not the
   * backing store's: the pen is solved in the pixels a person is looking at,
   * and the supersample is free to be whatever fits in `INK_MAX` without
   * changing a single line weight.
   */
  async _paintInk(w, r, k) {
    const cv = this._ink;
    const token = this._inkToken = (this._inkToken || 0) + 1;
    cv.style.left = `${w.nx * 100}%`;
    cv.style.top = `${w.ny * 100}%`;
    cv.style.width = `${w.nw * 100}%`;
    cv.style.height = `${w.nh * 100}%`;

    const t = await loadPlanTrace(new URL(`../../${blueprintTraceUrl(w.slug)}`, import.meta.url).href);
    if (token !== this._inkToken || !this._ink) return;

    // on-screen px per section px, and a supersample that stays inside INK_MAX
    const D = (r.w * k) / w.w;
    const ss = Math.max(1, Math.min(D * (window.devicePixelRatio || 1), INK_MAX / Math.max(w.w, w.h)));
    const cw = Math.max(1, Math.round(w.w * ss)), ch = Math.max(1, Math.round(w.h * ss));
    cv.width = cw; cv.height = ch;

    const g = cv.getContext('2d');
    const ink = this._tok('--blueprint-ink', '#2d4a7a');
    const paper = this._tok('--parchment', '#e8dcc0');

    /* A fresh sheet under the redraw. Feathered, because the section is a
       RECTANGLE of the master and its neighbours overlap it — a hard-edged
       opaque patch would blank a slice of the wing next door. The ruled box
       drawn in CSS over this is what makes the edge a mark rather than a seam. */
    g.save();
    const feather = Math.max(2, Math.round(Math.min(cw, ch) * 0.05));
    g.fillStyle = paper;
    g.globalAlpha = 0.82;
    g.fillRect(feather, feather, cw - feather * 2, ch - feather * 2);
    g.globalAlpha = 0.42;
    g.fillRect(0, 0, cw, ch);
    g.restore();

    if (!t) { cv.hidden = false; return; }

    g.save();
    g.scale(cw / w.w, ch / w.h);              // section px -> backing store
    inkTrace(g, t, { pen: solvePen(t, D), scale: D, ink, layerAlpha: 0.88 });
    g.restore();
    cv.hidden = false;
  }

  _tok(name, dflt) {
    const v = getComputedStyle(this.root).getPropertyValue(name).trim();
    return v || dflt;
  }

  /* ── selection + preview ────────────────────────────────────────────────── */

  /** Preview a wing in the dossier without committing to it. */
  _show(slug) {
    const w = this.wings.find((x) => x.slug === slug);
    if (!w) return;
    this.hover = slug;
    for (const b of this._hots.querySelectorAll('.at-hot')) {
      b.classList.toggle('is-hover', b.dataset.wing === slug);
    }

    const seen = this.surveyed.has(slug);
    const d = this._dossier;
    d.dataset.seen = seen ? '1' : '0';
    d.querySelector('.at-dos__n').textContent = w.meta.roman;
    d.querySelector('.at-dos__name').textContent = w.meta.name;
    d.querySelector('.at-dos__form').textContent = w.meta.form;
    d.querySelector('.at-dos__boss').textContent = seen ? w.meta.boss : 'Not yet known';
    d.querySelector('.at-dos__rooms').textContent = '20';
    d.querySelector('.at-dos__state').textContent = seen ? 'Surveyed' : 'Unsurveyed';

    /* WHO IS HELD HERE. Gated on having surveyed the wing everywhere except
       `enter` mode, where naming them IS the decision the screen exists for.
       See the header's "ONE DELIBERATE EXCEPTION". */
    const held = d.querySelector('.at-dos__held');
    const c = (seen || this.entering) ? w.companion : null;
    held.hidden = !c;
    try { this._pf?.destroy?.(); } catch {}
    this._pf = null;
    if (c) {
      d.querySelector('.at-dos__cname').textContent = c.name;
      d.querySelector('.at-dos__ctitle').textContent = c.title;
      const host = d.querySelector('.at-dos__pf');
      host.innerHTML = '';
      this._pf = companionPortrait({ slug: c.slug, variant: '@1x', parallax: 0, shimmer: false });
      host.appendChild(this._pf.el);
    }
    /* The Heart holds no Companion — it is what holds the house — so the
       "Held here" block is simply absent there rather than reading empty. */

    /* WHY these two wings join, in the house's own words. Printed whenever the
       drawing knows — not only at a fork — because it is the one thing a floor
       plan of seventeen wings cannot show you and the design doc bothered to
       write down for every edge. */
    const from = this.trail[this.trail.length - 1] || null;
    const o = this.offer.find((x) => x.to === slug);
    const why = o ? o.why : (from && from !== slug ? exitReason(from, slug) : null);
    const $why = d.querySelector('.at-dos__why');
    $why.hidden = !why;
    if (why) {
      $why.innerHTML = o && o.manifested
        ? `<em>The house opens</em> ${esc(why)}`
        : `<em>From ${esc(regionMeta(from).name)}</em> &mdash; ${esc(why)}`;
      $why.classList.toggle('is-manifested', !!(o && o.manifested));
    }

    /* WHAT IS IN THERE. Only at a fork, and only for a wing on offer: this is
       the decision content, not lore, and it comes from `Run#wingPreview` —
       literally the map you will walk, generated by the same call with the same
       options, so it cannot promise a wing it will not deliver. */
    const inside = d.querySelector('.at-dos__inside');
    const pv = o && this.ctx.run ? this.ctx.run.wingPreview(slug) : null;
    inside.hidden = !pv;
    if (pv) {
      d.querySelector('.at-dos__depth').innerHTML =
        `<b>${pv.rows}</b> rooms deep &middot; <b>${pv.bigScares}</b> `
        + (pv.bigScares === 1 ? 'Big Scare' : 'Big Scares');
      const list = d.querySelector('.at-dos__cond');
      list.innerHTML = '';
      for (const c of pv.conditions) {
        const li = el('li', 'at-cond' + (c.kind === 'boon' ? ' is-boon' : ''));
        li.tabIndex = 0;
        /* `ui/tooltip.js` installs ONE delegated pointer/focus handler, so the
           rule is a hover and a Tab away without this screen wiring anything. */
        li.dataset.tip = `${c.name}|${c.rule}`;
        li.textContent = c.name;
        list.appendChild(li);
      }
    }

    const act$ = d.querySelector('.at-dos__act');
    act$.hidden = !o;
    if (o) {
      const go = act$.querySelector('.at-go');
      go.textContent = this.entering ? `Start in ${w.meta.name}` : `Go to ${w.meta.name}`;
      go.disabled = this._voting;
    }

    d.querySelector('.at-dos__hint').textContent = o
      ? (this.entering ? 'Where tonight starts. The Heart is always the way out.'
                       : 'One way on. There is no way back through a wing.')
      : this.entering ? 'The Heart is the ending. You cannot begin there.'
      : this.choosing ? 'The house is not opening this one tonight.'
      : !seen ? 'The house drew this wing. Nobody has been in it yet.'
      : this.sel === slug ? 'Escape, or “The whole house”, to pull back out.'
      : 'Select to look closer.';
  }

  /* ── choosing the way on ────────────────────────────────────────────────── */

  /**
   * One Kid commits to a wing, and the drawing waits for the rest.
   *
   * The same ballot as `scenes/map.js#_vote` and for the same reason
   * (STS2-REFERENCE §8.5): everybody votes, a weighted roulette settles a
   * split, and the host has no special authority. `act()` is awaited because
   * over a wire it is a promise for the answer that lands once the input has
   * taken its place in the total order; solo it resolves synchronously and
   * crosses immediately.
   *
   * This is the ONE irreversible decision in an expedition — you cannot walk
   * back through a wing — so it is worth being exactly as careful with it as
   * with a room.
   */
  async _choose(slug) {
    /* THE WAY IN is a different commit from the way on: there is no run yet, so
       there is nothing to vote on and nobody to hand the sheet to. Fire the
       payload `scenes/select.js` handed over, with the wing appended, and let
       the ordinary `run:start` seam build the expedition — `new Run` validates
       the slug and falls back to the front door, so this cannot strand a run. */
    if (this.entering) {
      if (this._voting || !this.offered.has(slug)) return;
      this._voting = true;
      const payload = { ...(this.startPayload || {}), startRegion: slug };
      try { this.ctx.audio?.play?.('ui:begin'); } catch {}
      bus.emit('run:start', payload);
      this.root.classList.add('is-leaving');
      await this.ctx.scenes?.go?.('map', payload);
      return;
    }
    const run = this.ctx.run;
    if (!run || !run.pendingWing || this._voting) return;
    if (!this.offered.has(slug)) return;
    // A fallen Kid has no say in the route (`run.voters()`), so their click has
    // to be refused HERE too or the screen accepts it and silently does nothing.
    if (!run.voters().includes(run.localSeat)) return;
    this._voting = true;
    try {
      await act(run, { t: INPUT.ROOM, act: ACT.WING_CHOOSE, region: slug });
      // The last vote owed crosses the party, and by then `advanceRegion` has
      // asked for the map and `exit()` has nulled this screen's elements.
      if (!this._dossier || !this.ctx.run?.pendingWing) return;
      const owed = run.wingVotesPending();
      this._paintBallot();
      try { this.ctx.audio?.play?.('ui:click'); } catch {}
      if (!owed.length) return;
      // On a wire each Kid votes from their own machine; at one keyboard the
      // sheet has to be handed over, the same veil every per-Kid room uses.
      if (shouldHandOff(run)) await this._passVoteTo(owed[0]);
    } finally {
      this._voting = false;
    }
  }

  /** Cover the drawing, put the next voter in the seat, redraw as theirs. */
  async _passVoteTo(seat) {
    const run = this.ctx.run;
    const kid = run.kids[seat];
    if (!kid) return;
    await passTo({
      name: run.kidNameOf(kid), companion: kid.companion,
      line: 'Which way now?',
      sub: 'Everyone gets a say in where the house takes you.',
      onReady: async () => {
        run.setLocalSeat(seat);
        await this.ctx.scenes.go('atlas', { choose: '1' }, { instant: true });
      },
    });
  }

  /**
   * Who has chosen what. Hidden in solo, where there is nobody to wait for.
   *
   * Painted from `run.pendingWing.votes` rather than from anything this screen
   * remembers, so it survives the hand-off rebuild — the ballot belongs to the
   * run, not to the sheet.
   */
  _paintBallot() {
    const run = this.ctx.run;
    const bar = this._dossier && this._dossier.querySelector('.at-ballot');
    if (!bar) return;
    const votes = (run && run.pendingWing) ? run.pendingWing.votes : {};
    const cast = Object.keys(votes).map(Number).sort((a, b) => a - b);

    for (const b of this._hots.querySelectorAll('.at-hot')) {
      const who = cast.filter((s) => votes[s] === b.dataset.wing);
      b.classList.toggle('is-voted', who.length > 0);
      b.dataset.votes = who.length ? who.map((s) => this._kidTag(run, s)).join(' ') : '';
    }
    if (!run || !this.choosing || run.partySize < 2) { bar.hidden = true; return; }
    bar.hidden = false;
    const total = run.voters().length;
    const owed = run.wingVotesPending();
    bar.textContent = owed.length
      ? `${cast.length} of ${total} have chosen · ${run.kidNameOf(run.kids[owed[0]])} is deciding`
      : `${total} of ${total} have chosen`;
  }

  /** A Kid's initial, for a vote pin. */
  _kidTag(run, seat) {
    const k = run && run.kids[seat];
    return (run.kidNameOf(k) || '?').trim().charAt(0).toUpperCase();
  }

  /**
   * "The house chose the Hedge Maze." Only when a number decided it.
   *
   * Silent on a unanimous ballot — CONTRACTS 45 wants the player told when a
   * roll overrode them, and "the roulette chose" is a lie when nobody
   * disagreed, which is what `rolled` is on the result for.
   */
  _announce(v) {
    if (!v || !v.rolled || !this.root) return;
    const want = v.tally?.[v.winner] || 0;
    const of = Object.values(v.tally || {}).reduce((a, b) => a + b, 0);
    const card = el('div', 'at-verdict');
    card.setAttribute('role', 'status');
    card.innerHTML = `<b>The house chose ${esc(regionMeta(v.winner).name)}</b>`
      + `<i>${want} of ${of} wanted it &middot; the rest were outvoted by the draw</i>`;
    this.root.appendChild(card);
    try { this.ctx.audio?.play?.('ui:confirm'); } catch {}
  }

  /** Commit: zoom the sheet onto a wing, or pull back out. */
  _select(slug, instant = false) {
    const next = slug && this.wings.some((w) => w.slug === slug) ? slug : null;
    if (next === this.sel) return;
    this.sel = next;
    this.root.dataset.zoom = next ? '1' : '0';
    this._wide.hidden = !next;
    for (const b of this._hots.querySelectorAll('.at-hot')) {
      const on = b.dataset.wing === next;
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (!next) { this._ink.hidden = true; this._inkToken = (this._inkToken || 0) + 1; }
    this._layout();
    if (next) this._show(next);
    if (!instant) {
      try { this.ctx.audio?.play?.(next ? 'world:blueprint-unfold' : 'ui:back'); } catch {}
    }
  }

  /**
   * Back where you came from.
   *
   * Mid-expedition that is the wing you are standing in, handed the same
   * `{region, seed}` `Run#advanceRegion` uses so the map rebuilds identically;
   * otherwise the clubhouse board, where the pinned blueprint fragment is.
   */
  _leave() {
    /* A run standing at a fork has nowhere else to be: the wing behind it is
       cleared, the map would rebuild the sheet they have finished, and the
       Clubhouse is between expeditions. The choice is the screen. */
    if (this.choosing) return;
    const opts0 = { transition: reduceMotion() ? 'veil' : 'blueprint' };
    /* Backing out of the WAY IN returns to Companion Select, which is where the
       payload came from and the only screen that can re-issue it. Falling
       through to the Clubhouse here would drop the chosen Kid on the floor. */
    if (this.entering) return void this.ctx.scenes.go('select', {}, opts0);
    const run = this.ctx.run;
    const opts = opts0;
    if (run) this.ctx.scenes.go('map', { region: run.region, seed: run.seed }, opts);
    else this.ctx.scenes.go('clubhouse', { panel: 'board' }, opts);
  }

  update() { /* every animation on this screen is CSS-composited */ }

  async exit() {
    this._unpauseStage?.();
    this._unpauseStage = null;
    this._ro?.disconnect();
    this._ro = null;
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    try { this._pf?.destroy?.(); } catch {}
    this._pf = null;
    this._inkToken = (this._inkToken || 0) + 1;
    this._vp = this._plate = this._estate = this._ink = this._hots = null;
    this._dossier = this._wide = this._trail = this._tally = null;
    this.offer = [];
    this.offered = new Set();
    this.root.innerHTML = '';
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default AtlasScene;
