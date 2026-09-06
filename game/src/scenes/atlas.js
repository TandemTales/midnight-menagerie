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
 * Deep link: `#scene=atlas`, `&wing=<slug>` to open zoomed on one,
 * `&all=1` to survey everything (a review door, never progress).
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { COMPANIONS, REGION_ORDER } from '../data/schema.js';
import { regionMeta, blueprintTraceUrl, MASTER } from '../state/mapgen.js';
import { loadPlanTrace, solvePen, inkTrace } from '../ui/plan.js';
import {
  ensureCss, fontsReady, el, svg, rovingFocus, logoLockup, filigree,
  companionPortrait, COMPANION_BY_SLUG, setReduceMotion, reduceMotion,
  freedCompanions, warmFaces,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';

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

    const want = params.wing && this.wings.some((w) => w.slug === params.wing) ? params.wing : null;
    this._show(want || this.wings[0].slug);
    if (want) this._select(want, true);

    bus.emit('atlas:ready', { wings: this.wings.length, surveyed: this.surveyed.size });
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

  /* ── chrome ─────────────────────────────────────────────────────────────── */
  _buildHead() {
    const h = el('header', 'at-head');

    const back = el('button', 'at-back');
    back.type = 'button';
    back.innerHTML = '<span aria-hidden="true">&#8592;</span> Back';
    back.addEventListener('click', () => this._leave());
    h.appendChild(back);

    const logo = logoLockup({ size: 'sm', plaque: 'The Mansion', id: 'mm-logo-atlas' });
    logo.classList.add('at-logo');
    h.appendChild(logo);

    const tally = el('p', 'at-tally');
    tally.innerHTML = `<b>${this.surveyed.size}</b> <span>of ${this.wings.length} wings surveyed</span>`;
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
    const seen = this.surveyed.has(w.slug);
    if (!seen) return `${w.meta.name}. Unsurveyed.`;
    const held = w.companion ? ` ${w.companion.name}, ${w.companion.title}, is held here.` : '';
    return `${w.meta.name}. Surveyed.${held} Guarded by ${w.meta.boss}.`;
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
      <p class="at-dos__hint"></p>`;
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
      this._select(b.dataset.wing === this.sel ? null : b.dataset.wing);
    });

    this._offs.push(rovingFocus(this._hots, '.at-hot', {
      cols: 0, wrap: true,
      onActivate: (b) => this._select(b.dataset.wing === this.sel ? null : b.dataset.wing),
    }));

    on(window, 'keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (this.sel) this._select(null); else this._leave();
    });

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

    const held = d.querySelector('.at-dos__held');
    const c = seen ? w.companion : null;
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

    d.querySelector('.at-dos__hint').textContent = !seen
      ? 'The house drew this wing. Nobody has been in it yet.'
      : this.sel === slug ? 'Escape, or “The whole house”, to pull back out.'
      : 'Select to look closer.';
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
    const run = this.ctx.run;
    const opts = { transition: reduceMotion() ? 'veil' : 'blueprint' };
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
    this._vp = this._plate = this._estate = this._ink = this._hots = this._dossier = this._wide = null;
    this.root.innerHTML = '';
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default AtlasScene;
