/**
 * The Map — an antique architectural blueprint of the mansion, marked up in pencil
 * by a group of kids who should not have it.  OWNER: map agent.
 *
 * The blueprint is not a background image: the ink is lifted off the source
 * drawing and re-laid onto parchment generated at full canvas resolution, so the
 * paper grain stays sharp while the linework keeps its hand-drawn softness.
 * Route, hazard wings, title block, compass and scale bar are all drawn on.
 *
 * Deep link:  #scene=map&seed=42&region=foyer[&walk=4][&haunt=2][&companion=marmalade]
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { clock, Clock } from '../core/clock.js';
import { RNG, hashSeed } from '../core/rng.js';
import { NodeType } from '../data/schema.js';
import {
  generateRegionMap, regionMeta, blueprintSection,
  NODE_INFO, sceneForNode, legalNextIds, reachableFrom, hazardById,
} from '../state/mapgen.js';
import { mapNodeMarkup, nodeSymbol, hazardSymbol, hazardGlyphMarkup, pencilStroke, seedOf, escapeHtml } from '../ui/mapnode.js';
import { HUD } from '../ui/hud.js';
import { pauseStageFor } from './_stage.js';

/* The sheet is always the same height; its width follows the region's blueprint
   section, so a broad glass complex gets a broad sheet and a vertical shaft gets
   a narrow one, and the plan fills its own paper. */
/* The sheet's aspect is matched to a 16:9 screen minus the two chrome strips,
   so fitting it wastes almost no paper: at 1600x900 the fit went from 0.61x —
   where a 52px icon lands as 32 screen pixels and disappears into the plan's
   dot field — to 0.76x, and the node art then counter-scales the rest. */
const SHEET_H = 1010, SHEET_W = 2030;
/** The drawn "plan window" the architecture is printed inside. */
const WIN = { x: 74, y: 60, w: SHEET_W - 148, h: 776 };
const NODE_R  = 44;
const BOSS_R  = 78;
/** Mark box sizes, mirrored from ui/mapnode.js — the label pass needs them. */
const NODE_BOX = 86, BOSS_BOX = 156;
/** Height of a name chip in unscaled sheet px (16.5px/1.15 + 4px padding). */
const LABEL_H = 23;
const CSS_HREF = 'src/scenes/map.css';

/**
 * The stylesheet, requested once at module load and never taken away again.
 *
 * This screen used to append the `<link>` in `enter()` and remove it in
 * `exit()`, which is the one place in the codebase that does — every other
 * scene goes through `ensureCss()` in `ui/portrait.js`, which never unloads.
 * Removing it meant a full stylesheet round trip on the critical path of every
 * single map entry, and the map is re-entered after every room: measured at
 * **312 ms**, in front of everything else, thirteen times a wing.
 *
 * `main.js` imports this module statically, so asking for the sheet here puts
 * it in flight during boot alongside the rest of the app, and `_css()` is an
 * already-settled promise by the time anyone walks into a map.  Keeping it
 * resident is safe by the project's own invariant: `tests/scene-css/check.py`
 * exists precisely because scene sheets are permanent and global, and it
 * passes.
 */
const CSS_READY = (() => {
  if (typeof document === 'undefined') return Promise.resolve();
  const have = document.querySelector('link[data-map-css]');
  if (have) return Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = CSS_HREF; link.dataset.mapCss = '1';
  const done = new Promise(r => { link.onload = r; link.onerror = r; });
  document.head.appendChild(link);
  return done;
})();

const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII'];
/** Pseudo-node standing for the doorway you came in through. */
const ENTRY = '__in';
/** Node icons stop shrinking with the sheet below this effective scale. */
const MIN_ICON_SCALE = 0.86;

/* ── The wing's own plan, re-inked ──────────────────────────────────────────
   The section drawings are small (165x470 up to 713x237) and the plan window is
   1882x776, so printing one means a 3.5x to 7.8x blow-up.  We do not blow one
   up: `tools/blueprint_trace.py` has already reduced each section to the two
   marks it is actually made of — WALL RUNS and PIER DOTS — and the sheet inks
   those at whatever size it is.  Magnification then moves the architecture
   apart without touching the pen, which is what a large-scale survey looks
   like, and there is no resampled pixel anywhere on the drawing.

   The weights below are the pen, in sheet px, and they are deliberately not
   proportional to the blow-up.  A draughtsman does not change pens when the
   scale changes; 8x a 2px line is a 16px pipe, and a wing drawn in pipes is not
   a survey.  Width still carries the source's own hierarchy (a load-bearing
   wall traced fat stays fatter than a partition), just compressed into a range
   a drafting pen could hold. */
const PLAN = {
  /* Ink-to-paper ratio the pen is solved for.  The seventeen drawings are not
     remotely alike: per unit of paper the Impossible Greenhouse carries three
     times the line length of the Grand Study, and it is shown at half the
     magnification (3.5x against 6.5x).  One authored stroke weight leaves the Study faint and turns
     the Greenhouse into a solid blue field — which is how you end up with
     sixteen wings that look like an afterthought and one that looks right.  So
     the sheet asks for a COVERAGE and works back to the pen it needs.  Same
     drawing weight on all seventeen; the pen changes, as it would in a real
     drawing office. */
  cover: 0.034,
  pen:   { min: 1.35, max: 5.20 },     // and the pen box it may solve inside
  /* How far a single stroke may depart from that pen for its own traced weight.
     The source does have a hierarchy — envelope walls are drawn heavier than
     partitions — and flattening it loses the plan's structure. */
  vary:  0.52,
  pierR: 0.62,        // pier radius as a fraction of the pen
  fineR: 0.40,        // and the drawing's small change, smaller and lighter
  fineA: 0.70,
  ink:   0.74,        // the linework's weight against the paper
  bleed: 0.19,        // the same drawing again, offset — ink soaking into paper
  wash:  0.09,        // the SOURCE bitmap under it all: grain, ornament, tone
};
/**
 * Small LRU, shared by the two per-section caches below.
 *
 * The map is re-entered on every single room, so recomputing either of these
 * each time is wasteful — but holding all seventeen forever is worse: the
 * parsed traces alone would be tens of megabytes of number arrays for wings the
 * run left two hours ago.  A run walks the wings in order and only ever needs
 * the one it is standing in, so three is generous.
 */
const KEEP = 3;
function lru(map, key, make) {
  if (map.has(key)) {
    const v = map.get(key);
    map.delete(key); map.set(key, v);            // touch
    return v;
  }
  const v = make();
  map.set(key, v);
  while (map.size > KEEP) map.delete(map.keys().next().value);
  return v;
}

/** Traced plans — see tools/blueprint_trace.py. */
const PLAN_CACHE = new Map();
function loadPlanTrace(url) {
  return lru(PLAN_CACHE, url,
    () => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));
}

/**
 * The wash layer: the section PNG with its paper dissolved away, so what is
 * left is ink-on-nothing and laying it over OUR parchment does not print a
 * beige rectangle across the window.  Same extraction the map used to run on
 * the master crop — blue against warm paper — at native size, because this
 * layer is tone and ornament, never linework.  Cached: it costs one pass over
 * ~50k pixels and the map is re-entered every single room.
 */
const WASH_CACHE = new Map();
function washOf(img, url, ink) {
  const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  if (!sw || !sh) return null;
  return lru(WASH_CACHE, url + '|' + ink, () => {
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const cg = c.getContext('2d', { willReadFrequently: true });
    cg.drawImage(img, 0, 0);
    const d = cg.getImageData(0, 0, sw, sh), p = d.data;
    const rgb = hexToRgb(ink);
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gg = p[i + 1], b = p[i + 2];
      const blue = (b - r) / 255;
      const dark = 1 - (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
      let v = blue * 2.6 + Math.max(0, dark - 0.42) * 1.1;
      v = v <= 0 ? 0 : v >= 1 ? 1 : v;
      p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2];
      p[i + 3] = (v * 255) | 0;
    }
    cg.putImageData(d, 0, 0);
    return c;
  });
}

/**
 * The grain tile: one 180x180 bitmap from one fixed seed, so it is the same
 * image on every map entry forever.  Building it per entry cost a 32k-sample
 * noise fill plus a `toDataURL` PNG *encode* and then a decode of the result —
 * measured at 39 ms inside `_buildDom`, which is on the critical path — to
 * arrive at a tile byte-identical to the last one.  Built once per page.
 */
let GRAIN_URL = null;
function grainUrl() {
  if (GRAIN_URL) return GRAIN_URL;
  const c = document.createElement('canvas'); c.width = c.height = 180;
  const g = c.getContext('2d');
  const d = g.createImageData(180, 180); const p = d.data;
  const rng = new RNG(9137);
  for (let i = 0; i < p.length; i += 4) {
    const v = 118 + (rng.next() - 0.5) * 150;
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return (GRAIN_URL = c.toDataURL('image/png'));
}

export class MapScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._off = [];                 // teardown thunks
    this.view = { x: 0, y: 0, z: 1, tz: 1, minZ: 0.4, maxZ: 2.4 };
    this.lamp = { x: 0, y: 0, tx: 0, ty: 0 };
    this._drag = null;
    this._hoverId = null;
    this._focusId = null;
  }

  // ───────────────────────────────────────────────────────────────── enter ──
  async enter(params = {}) {
    const ctx = this.ctx;
    this.still = !!ctx.Save?.settings?.reduceMotion;

    // The blueprint sheet is opaque: the canvas measures 0.00% visible here.
    // Stop drawing it (the pause waits for the stage warm-up; see _stage.js).
    this._unpauseStage = pauseStageFor(ctx);

    // Everything this screen has to WAIT for, asked for at once.
    //
    // These were three round trips run strictly one after another — stylesheet,
    // then trace, then section PNG — and their latencies added up on the
    // critical path: 312 + 258 + 61 = 631 ms before a single pixel could be
    // drawn.  None of them needs the others, and `_buildModel` needs no DOM,
    // so the model is built first and all three requests go out together.  The
    // screen is now gated on the slowest one instead of on their sum.
    this._buildModel(params);
    // The wing's own section drawing: the traced linework is what gets inked,
    // the PNG is only the wash under it.  Both are optional — a missing file
    // costs the plan, never the screen.
    const sec = this._sec = blueprintSection(this.model.regionId, WIN.w / WIN.h);
    const wantTrace = loadPlanTrace(sec.traceUrl);
    const wantImg = ctx.assets.image(sec.url).catch(() => null);

    await this._css();
    const [trace, img] = await Promise.all([wantTrace, wantImg]);
    this._trace = trace;
    this._section = img;
    this._sheetSize();
    this._buildDom();

    // Paper first (it is the slow bit), then everything drawn on top of it.
    await this._paintPaper();

    // One frame between the paper and the marks, on purpose.
    //
    // Building the whole screen in a single task put the sheet, the ink layer,
    // sixty-four marks, the banner, the bar and the HUD into one 137 ms job —
    // over the 120 ms budget on its own — and handed the compositor all of it
    // to raster in one go.  Split here, each half is under 70 ms and the paper
    // (which the armed state deliberately leaves painted) rasters on its own
    // frame while the marks are still being built.  The cost is one frame,
    // spent behind the transition veil, which is where a frame is free.
    if (!this.still) await clock.wait(0.02);
    if (!this.el) return;                          // scene left mid-build

    this._buildInk();
    this._buildNodes();
    this._buildMarginalia();

    this._fitView();
    this._syncStates();
    this._bindEvents();

    const walk = parseInt(params.walk, 10);
    if (Number.isFinite(walk) && walk > 0) this._prewalk(walk);

    const drawn = this.still
      ? (this.el.screen.classList.add('is-drawn'), Promise.resolve())
      : this._drawOn();

    // Mood and music go AFTER the ink, deliberately.  Setting the mood can make
    // the renderer compile a shader, and a compile landing on the entrance frame
    // freezes the page for as long as it takes — which is what turned a staged
    // 880ms draw-on into one instantaneous jump in the review's frame strip.
    // The survey draws itself first; the room lights come up behind it.
    drawn.then(() => {
      if (!this.el) return;                        // scene left mid-draw
      ctx.atmosphere?.setMood?.('blueprint');
      ctx.audio?.music?.('map', { fade: 1.2 });
    });

    bus.emit('map:shown', { regionId: this.model.map.regionId, seed: this.model.seed });
  }

  async _css() {
    await CSS_READY;
    // The title block, the compass and the scale bar are canvas `fillText`, so
    // the paint genuinely cannot start before Cinzel and Grenze are resolved —
    // drawn against the fallback serif they measure differently and the cells
    // land in the wrong places.  Free after boot; the sheet is loaded by then.
    try { await document.fonts?.ready; } catch {}
  }

  // ─────────────────────────────────────────────────────────────── the run ──
  /**
   * ctx.run is owned by meta-run and may not exist yet.  Read it if it is
   * there; otherwise fabricate a mock so the screen is fully playable alone.
   */
  _buildModel(params) {
    const ctx = this.ctx;
    const run = ctx.run || null;
    const seed = params.seed ?? run?.seed ?? 1;
    const regionId = regionMeta(params.region ?? run?.region ?? run?.regionId ?? 'foyer').slug;
    const hauntLevel = Number(params.haunt ?? run?.hauntLevel ?? ctx.Save?.data?.hauntLevel ?? 0) || 0;
    const companion = params.companion ?? run?.companion ?? regionMeta(regionId).companion;

    let map = run?.map;
    if (!map || map.regionId !== regionId || String(map.seed) !== String(seed)) {
      map = generateRegionMap(regionId, seed, {
        hauntLevel, companion,
        rescued: ctx.Save?.data?.companionsRescued || [],
      });
      if (run && !run.map) run.map = map;      // hand it back if run.js wants it
    }

    this.model = {
      map, seed, regionId, hauntLevel, companion, run,
      byId: new Map(map.nodes.map(n => [n.id, n])),
      currentId: run?.currentNodeId ?? null,
      visited: new Set(run?.visitedIds || []),
      // The route is seeded with the doorway marker so that the very first step
      // already forms a pair and inks the way-in arrow you actually walked.
      // Without it `path` holds one id, `walkedPairs` needs two, and the trail
      // stays invisible until the second room.
      path: (run?.pathIds?.length ? run.pathIds.slice() : [ENTRY]),
      // Courage / Lost Things / Keepsakes are the shared HUD's business now.
      floor: run?.floor ?? (regionMeta(regionId).index),
      mock: !run,
    };
  }

  _legal() {
    const m = this.model;
    if (m.run?.legalNextIds) { try { return m.run.legalNextIds() || []; } catch {} }
    return legalNextIds(m.map, m.currentId);
  }

  _sheetSize() { this.SH = SHEET_H; this.SW = SHEET_W; }

  // ──────────────────────────────────────────────────────────────── layout ──
  _buildDom() {
    const m = this.model, meta = m.map.meta;
    this.root.innerHTML = `
      <div class="map-screen${this.still ? ' is-still' : ''}">
        <div class="map-desk"></div>

        <div class="map-viewport" role="application"
             aria-label="Blueprint of ${escapeHtml(meta.name)}. Choose the next room.">
          <div class="map-sheet">
            <canvas class="map-paper"></canvas>
            <svg class="map-ink" viewBox="0 0 ${this.SW} ${this.SH}"
                 width="${this.SW}" height="${this.SH}" aria-hidden="true"></svg>
            <div class="map-nodes"></div>
            <div class="map-wet" aria-hidden="true"></div>
            <div class="map-curl" aria-hidden="true"></div>
          </div>
        </div>

        <div class="map-shade" aria-hidden="true"></div>
        <div class="map-lamp" aria-hidden="true"></div>
        <div class="map-lamp map-lamp--warm" aria-hidden="true"></div>
        <div class="map-grain" aria-hidden="true"></div>

        <!-- the shared run HUD (ui/hud.js) mounts here -->
        <div class="map-hudhost"></div>

        <header class="map-banner">
          <span class="tape tape-l" aria-hidden="true"></span>
          <span class="tape tape-r" aria-hidden="true"></span>
          <div class="bn-roman">${ROMAN[meta.index] || meta.index}</div>
          <div class="bn-body">
            <h1>${escapeHtml(meta.name)}</h1>
            <p class="bn-form">${escapeHtml(meta.form)}</p>
            <!-- Two halves of ONE address, written the same way on purpose:
                 which wing of the house you are in, and how far into it you
                 have walked.  A playtester read "Wing 1 of 17" and "row 2 of
                 13" as two unrelated facts, so they now share capitalisation,
                 weight and the "N of M" shape, and the hover on either one
                 explains the pair. -->
            <p class="bn-meta">
              <span title="The house has seventeen wings. This is the ${ordinal(m.floor)}. The second number is how far into this wing you have walked.">Wing <b>${m.floor}</b> of 17</span>
              <span class="dot">·</span>
              <span class="bn-row" title="This wing is ${m.map.rows} rows deep, door to boss. The first number is which of the seventeen wings you are in."></span>
              <span class="dot">·</span>
              <span>Boss: <b>${escapeHtml(meta.boss)}</b></span>
            </p>
          </div>
        </header>

        <div class="map-bar">
          <div class="map-legend" aria-label="Blueprint key"></div>
          <div class="map-notes" aria-label="Wing conditions"></div>
          <div class="map-hint" aria-hidden="true">
            <b>drag</b> pan · <b>scroll</b> zoom · <b>↑↓</b> choose · <b>⏎</b> go
          </div>
        </div>
        <div class="map-tip" role="tooltip" aria-hidden="true"></div>
      </div>`;

    const q = s => this.root.querySelector(s);
    this.el = {
      screen: q('.map-screen'), viewport: q('.map-viewport'), sheet: q('.map-sheet'),
      paper: q('.map-paper'), ink: q('.map-ink'), nodes: q('.map-nodes'),
      lamp: q('.map-lamp'), lampWarm: q('.map-lamp--warm'), grain: q('.map-grain'),
      tip: q('.map-tip'), notes: q('.map-notes'), legend: q('.map-legend'),
      hudHost: q('.map-hudhost'), rowNum: q('.bn-row'),
    };
    // One HUD, one position: the shared strip along the top edge. Everything it
    // used to duplicate here — Courage, Lost Things, Keepsakes, Haunt, the cog
    // that did nothing — is that component's job now.
    this.hud = new HUD(this.ctx, { mount: this.el.hudHost, escape: true, useSnacks: false });
    this.el.sheet.style.width = this.SW + 'px';
    this.el.sheet.style.height = this.SH + 'px';
    this.el.sheet.style.setProperty('--sw', this.SW + 'px');   // the wet edge's run
    this._paintGrain();
  }

  // ───────────────────────────────────────────────────────── paper + ink ────
  _tok(name, fallback) {
    // One style resolve for the whole paint, not one per token.
    this._cs = this._cs || getComputedStyle(document.documentElement);
    const v = this._cs.getPropertyValue(name).trim();
    return v || fallback;
  }

  async _paintPaper() {
    const cv = this.el.paper;
    // 1.25 is the point past which the parchment stops looking any better and
    // starts costing whole frames: at 1.6 this canvas is 3248x1616 = 5.2M px.
    const q = this._paperQ = Math.min(1.25, Math.max(1, (devicePixelRatio || 1) * 1.1));
    const W = Math.round(this.SW * q), H = Math.round(this.SH * q);
    cv.width = W; cv.height = H;
    cv.style.width = this.SW + 'px'; cv.style.height = this.SH + 'px';
    const g = cv.getContext('2d', { alpha: false });
    g.scale(q, q);
    const w = this.SW, h = this.SH;

    const parch = this._tok('--parchment', '#e8dcc0');
    const shade = this._tok('--parchment-shade', '#cdbb96');
    const ink   = this._tok('--blueprint-ink', '#2d4a7a');
    this._inkColor = ink;
    const rng = new RNG(hashSeed(`paper|${this.model.regionId}|${this.model.seed}`));

    // 1. ground
    g.fillStyle = parch; g.fillRect(0, 0, w, h);

    // 2. broad tonal blotches — the sheet has not aged evenly
    g.save();
    for (let i = 0; i < 190; i++) {
      const x = rng.next() * w, y = rng.next() * h, r = 60 + rng.next() * 340;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const warm = rng.chance(0.55);
      gr.addColorStop(0, hexA(warm ? shade : '#f3e9d2', 0.055 + rng.next() * 0.07));
      gr.addColorStop(1, hexA(warm ? shade : '#f3e9d2', 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    g.restore();

    // 3. paper fibre
    g.save(); g.lineWidth = 1;
    for (let i = 0; i < 2600; i++) {
      const x = rng.next() * w, y = rng.next() * h;
      const a = (rng.next() - 0.5) * 0.7 + (rng.chance(0.5) ? 0 : Math.PI / 2);
      const l = 2 + rng.next() * 13;
      g.strokeStyle = hexA(rng.chance(0.5) ? shade : '#fbf3e0', 0.05 + rng.next() * 0.07);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.restore();

    // 4. foxing — little rust-brown age spots, denser near the edges
    for (let i = 0; i < 130; i++) {
      const edge = rng.chance(0.72);
      const x = edge ? (rng.chance(0.5) ? rng.next() * w * 0.2 : w - rng.next() * w * 0.2) : rng.next() * w;
      const y = edge ? (rng.chance(0.5) ? rng.next() * h * 0.22 : h - rng.next() * h * 0.22) : rng.next() * h;
      const r = 2 + rng.next() * 11;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, hexA('#9c7443', 0.10 + rng.next() * 0.13));
      gr.addColorStop(0.7, hexA('#9c7443', 0.05));
      gr.addColorStop(1, hexA('#9c7443', 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }

    // 5. two coffee rings, because someone put a mug on the plans
    for (let i = 0; i < 2; i++) {
      const x = 150 + rng.next() * (w - 300), y = 150 + rng.next() * (h - 300);
      const r = 52 + rng.next() * 40;
      g.save(); g.strokeStyle = hexA('#8a5f31', 0.10); g.lineWidth = 3 + rng.next() * 3;
      g.beginPath(); g.arc(x, y, r, 0.2, 5.4); g.stroke();
      g.strokeStyle = hexA('#8a5f31', 0.05); g.lineWidth = 12;
      g.beginPath(); g.arc(x, y, r - 5, 0.4, 5.2); g.stroke(); g.restore();
    }

    // 6. folds — this sheet has been in a backpack
    g.save();
    for (const fx of [w * 0.5]) {
      const lg = g.createLinearGradient(fx - 26, 0, fx + 26, 0);
      lg.addColorStop(0, hexA(shade, 0)); lg.addColorStop(0.42, hexA(shade, 0.13));
      lg.addColorStop(0.5, hexA('#fdf6e6', 0.16)); lg.addColorStop(0.58, hexA(shade, 0.13));
      lg.addColorStop(1, hexA(shade, 0));
      g.fillStyle = lg; g.fillRect(fx - 26, 0, 52, h);
    }
    for (const fy of [h * 0.34, h * 0.71]) {
      const lg = g.createLinearGradient(0, fy - 22, 0, fy + 22);
      lg.addColorStop(0, hexA(shade, 0)); lg.addColorStop(0.45, hexA(shade, 0.10));
      lg.addColorStop(0.52, hexA('#fdf6e6', 0.12)); lg.addColorStop(1, hexA(shade, 0));
      g.fillStyle = lg; g.fillRect(0, fy - 22, w, 44);
    }
    g.restore();

    // 7. edge burn
    const edge = (x0, y0, x1, y1, len) => {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, hexA('#7d6440', 0.34));
      lg.addColorStop(0.35, hexA('#9c8154', 0.10));
      lg.addColorStop(1, hexA('#9c8154', 0));
      g.fillStyle = lg; g.fillRect(Math.min(x0, x1), Math.min(y0, y1),
        Math.abs(x1 - x0) || w, Math.abs(y1 - y0) || h);
    };
    edge(0, 0, 120, 0); edge(w, 0, w - 130, 0); edge(0, 0, 0, 100); edge(0, h, 0, h - 110);

    // 8. the ink — this wing's own section drawing, re-inked
    this._layPlan(g, ink);

    // 9. drawn border, title block, compass, scale bar
    this._drawFurniture(g, w, h, ink, rng);
  }

  /**
   * Where the wing's plan sits inside the drawn window, and how big.
   *
   * Cover-fit: the plan runs to the window's edges and is cut by them.  The
   * window is a drawn frame with registration ticks on it, so a wing running
   * off it reads as "this sheet shows this much of the wing" — which is what a
   * survey sheet says — rather than as a cropped picture.  Contain-fitting
   * instead would leave a tall wing as a ribbon of architecture down the middle
   * of an otherwise empty sheet, with two thirds of the route floating over
   * blank paper.
   */
  _planFit() {
    const s = this._sec, t = this._trace;
    // Fit the DRAWING, not the file.  Every section PNG carries 3-20% of blank
    // parchment round its plan, and fitting the file frames that margin instead
    // of the wing — most visibly on the secret passages, where it left a band of
    // bare paper along the foot of the sheet.  The tracer records the ink's
    // bounding box for exactly this.
    let bx = 0, by = 0, bw = s.w, bh = s.h;
    if (t && t.box) {
      const q = t.q || 1;
      bx = t.box[0] / q; by = t.box[1] / q;
      bw = Math.max(1, t.box[2] / q - bx); bh = Math.max(1, t.box[3] / q - by);
    }
    // in sheet-facing orientation
    const pw = s.rot ? bh : bw, ph = s.rot ? bw : bh;
    const scale = Math.max(WIN.w / pw, WIN.h / ph);
    const dw = pw * scale, dh = ph * scale;

    // Solve the pen for the coverage we want.  Cover-fitting means the window
    // IS the visible plan, so drawn-line area / window area reduces to
    // len * pen / (area * scale) with everything in the section's own units —
    // no need to know which part of the wing the window happens to be showing.
    let pen = 3.2;
    if (t && t.len > 0 && t.area > 0) {
      pen = clampN(PLAN.cover * t.area * scale / t.len, PLAN.pen.min, PLAN.pen.max);
    }
    return {
      scale, dw, dh, bx, by, bw, bh, pen,
      dx: WIN.x + (WIN.w - dw) / 2,
      dy: WIN.y + (WIN.h - dh) / 2,
    };
  }

  /**
   * Ink this wing's section onto the parchment.
   *
   * Three passes, all off ONE offscreen canvas that is then composited once:
   * every stroke overlaps its neighbours at the piers, and multiplying six
   * hundred translucent strokes onto the paper directly would turn every
   * junction into a black knot.  Drawn opaque, composited once, the drawing
   * holds a single even weight the way printed ink does.
   *
   *   wash    the source PNG, very faint.  It is not the linework — the vectors
   *           are — it is the drawing's tone, foxing and the fine ornament the
   *           trace does not carry (the greenhouse's planting, mostly).
   *   bleed   the vectors again, offset and pale: ink soaking into the paper.
   *   line    the vectors.  Sharp at any size, because there is nothing to
   *           resample: it is drawn at the size it is asked for.
   */
  _layPlan(g, ink) {
    const t = this._trace, sec = this._sec;
    const fit = this._plan = this._planFit();
    if (!t && !this._section) return;

    const q = this._paperQ || 1;
    const cw = Math.max(1, Math.round(WIN.w * q)), ch = Math.max(1, Math.round(WIN.h * q));
    const off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    const o = off.getContext('2d');
    o.scale(q, q);
    o.translate(-WIN.x, -WIN.y);            // offscreen shares the sheet's coords

    // The whole plan lives in one transform: sheet px -> section px, turned if
    // this wing's sheet turns it.  Everything below is authored in section px.
    o.save();
    o.translate(fit.dx, fit.dy);
    o.scale(fit.scale, fit.scale);
    if (sec.rot) { o.translate(fit.by + fit.bh, -fit.bx); o.rotate(Math.PI / 2); }
    else { o.translate(-fit.bx, -fit.by); }

    const wash = this._section && washOf(this._section, sec.url, ink);
    if (wash) {
      o.save();
      // Relative, because the composite below scales the whole layer.  With no
      // trace — the JSON missing, a fetch refused — the wash IS the plan and
      // carries full weight: a soft drawing beats a blank window, and this is
      // the only path by which the sheet can still show the right wing.
      o.globalAlpha = t ? PLAN.wash / PLAN.ink : 1;
      o.imageSmoothingQuality = 'high';
      o.drawImage(wash, 0, 0, sec.w, sec.h);
      o.restore();
    }

    if (t) {
      const inv = 1 / fit.scale;
      const Qn = (t.q || 1);
      o.lineCap = 'round'; o.lineJoin = 'round';
      o.strokeStyle = ink; o.fillStyle = ink;

      // Every mark is the solved pen, times how heavy the tracer found THIS
      // mark against the drawing's own median — held inside +-52% so the
      // hierarchy survives without any one line running away with the sheet.
      const pen = fit.pen;
      const wm = (t.wm || 2 * Qn) / Qn, pm = (t.pr || Qn) / Qn;
      const rel = (v, med) => clampN(v / med, 1 - PLAN.vary, 1 + PLAN.vary);

      // Strokes are bucketed by width and each bucket is ONE path with one
      // stroke() call: six hundred stroke calls each with its own lineWidth is
      // six hundred state changes, and this runs while the veil is still down.
      const pens = new Map();
      for (const s of t.s) {
        const key = Math.round(pen * rel(s[0] / Qn, wm) * 4);      // quarter-px pens
        let path = pens.get(key);
        if (!path) pens.set(key, path = new Path2D());
        path.moveTo(s[1] / Qn, s[2] / Qn);
        for (let i = 3; i < s.length; i += 2) path.lineTo(s[i] / Qn, s[i + 1] / Qn);
      }
      const piers = new Path2D();
      const pierBase = pen * PLAN.pierR;
      for (const p of t.p) {
        const r = (pierBase * rel(p[2] / Qn, pm)) * inv;
        piers.moveTo(p[0] / Qn + r, p[1] / Qn);
        piers.arc(p[0] / Qn, p[1] / Qn, r, 0, 6.2832);
      }
      // The drawing's small change — door swings, dashes, hatch ticks — a
      // couple of hundred marks the walls and piers do not account for.  Drawn
      // lighter, because on the original they ARE lighter.
      const fine = new Path2D();
      const fineBase = pen * PLAN.fineR;
      for (const p of (t.f || [])) {
        const r = (fineBase * clampN(p[2] / Qn, 0.5, 1.8)) * inv;
        fine.moveTo(p[0] / Qn + r, p[1] / Qn);
        fine.arc(p[0] / Qn, p[1] / Qn, r, 0, 6.2832);
      }

      // bleed first, under everything, so the drawing sits ON the paper
      o.save();
      o.globalAlpha = PLAN.bleed / PLAN.ink;
      o.translate(-1.6 * inv, 1.6 * inv);
      for (const [key, path] of pens) { o.lineWidth = (key / 4 + 1.1) * inv; o.stroke(path); }
      o.fill(piers);
      o.restore();

      for (const [key, path] of pens) { o.lineWidth = (key / 4) * inv; o.stroke(path); }
      o.fill(piers);
      o.save(); o.globalAlpha = PLAN.fineA; o.fill(fine); o.restore();
    }
    o.restore();

    // One composite, clipped to the drawn window.  GROUND, not figure: the
    // route is graphite laid over a printed survey and the survey has to sit
    // back or the pencil loses on line count (see the note over the route).
    g.save();
    g.beginPath(); g.rect(WIN.x, WIN.y, WIN.w, WIN.h); g.clip();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = PLAN.ink;
    g.drawImage(off, WIN.x, WIN.y, WIN.w, WIN.h);
    g.restore();
  }

  /** Border rules, corner flourishes, title block, compass rose, scale bar. */
  _drawFurniture(g, w, h, ink, rng) {
    const meta = this.model.map.meta;
    g.save();
    g.strokeStyle = hexA(ink, 0.62); g.lineJoin = 'round';

    // double rule
    g.lineWidth = 3.2; g.strokeRect(30, 30, w - 60, h - 60);
    g.lineWidth = 1.1; g.strokeRect(40, 40, w - 80, h - 80);
    g.lineWidth = 0.8; g.strokeStyle = hexA(ink, 0.34); g.strokeRect(46, 46, w - 92, h - 92);

    // the plan window — this sheet shows exactly this much of the wing
    g.strokeStyle = hexA(ink, 0.62); g.lineWidth = 1.8;
    g.strokeRect(WIN.x, WIN.y, WIN.w, WIN.h);
    g.strokeStyle = hexA(ink, 0.26); g.lineWidth = 0.8;
    g.strokeRect(WIN.x + 6, WIN.y + 6, WIN.w - 12, WIN.h - 12);
    // registration ticks on the window
    g.strokeStyle = hexA(ink, 0.5); g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = WIN.x + WIN.w * i / 8;
      g.moveTo(x, WIN.y); g.lineTo(x, WIN.y + 9);
      g.moveTo(x, WIN.y + WIN.h); g.lineTo(x, WIN.y + WIN.h - 9);
    }
    for (let i = 1; i < 4; i++) {
      const y = WIN.y + WIN.h * i / 4;
      g.moveTo(WIN.x, y); g.lineTo(WIN.x + 9, y);
      g.moveTo(WIN.x + WIN.w, y); g.lineTo(WIN.x + WIN.w - 9, y);
    }
    g.stroke();

    // corner flourishes
    g.strokeStyle = hexA(ink, 0.55); g.lineWidth = 2;
    const corner = (cx, cy, sx, sy) => {
      g.save(); g.translate(cx, cy); g.scale(sx, sy);
      g.beginPath();
      g.moveTo(0, 54); g.bezierCurveTo(0, 22, 22, 0, 54, 0);
      g.moveTo(10, 54); g.bezierCurveTo(10, 28, 28, 10, 54, 10);
      g.moveTo(20, 30); g.bezierCurveTo(26, 20, 34, 16, 44, 18);
      g.stroke();
      g.beginPath(); g.arc(30, 30, 4, 0, 6.2832); g.stroke();
      g.restore();
    };
    corner(40, 40, 1, 1); corner(w - 40, 40, -1, 1);
    corner(40, h - 40, 1, -1); corner(w - 40, h - 40, -1, -1);

    // ── title bar, the full width of the sheet, like a real drawing
    const tx = WIN.x, ty = WIN.y + WIN.h + 34, tw = WIN.w, th = 72;
    g.fillStyle = hexA('#f6eeda', 0.42); g.fillRect(tx, ty, tw, th);
    g.strokeStyle = hexA(ink, 0.74); g.lineWidth = 2; g.strokeRect(tx, ty, tw, th);
    const cells = [0.30, 0.48, 0.61, 0.77];
    g.lineWidth = 1; g.strokeStyle = hexA(ink, 0.45);
    g.beginPath();
    for (const c of cells) { g.moveTo(tx + tw * c, ty); g.lineTo(tx + tw * c, ty + th); }
    g.stroke();

    g.textBaseline = 'middle';
    const cell = (i, head, val, big) => {
      const x0 = tx + tw * (i === 0 ? 0 : cells[i - 1]) + 16;
      g.fillStyle = hexA(ink, 0.58);
      g.font = '400 10px Grenze, Georgia, serif';
      g.fillText(head, x0, ty + 21);
      g.fillStyle = hexA(ink, 0.92);
      g.font = big ? '700 26px Cinzel, Georgia, serif' : '600 15px Cinzel, Georgia, serif';
      g.fillText(val, x0, ty + 49);
    };
    cell(0, 'REGION OF THE ESTATE', meta.name.toUpperCase(), true);
    cell(1, 'BOSS OF RECORD', meta.boss.toUpperCase());
    cell(2, 'SHEET', (ROMAN[meta.index] || meta.index) + ' OF XVII');
    cell(3, 'SCALE', '1 : 96');
    cell(4, 'SURVEY REF.', 'MM-' + String(this.model.seed).toUpperCase());

    // ── compass rose, top right of the plan
    //
    // Six of the seventeen wings are drawn on their side, because they are
    // tall and the sheet is not (see `blueprintSection`).  A survey that turns
    // its plan turns its NORTH with it and says so on the sheet — the rose is
    // the reader's only handle on which way the building is facing, and a rose
    // that keeps pointing up while the plan has been rotated is simply wrong.
    const turned = !!this._sec?.rot;
    const cx = WIN.x + WIN.w - 84, cy = WIN.y + 88, rr = 48;
    g.save(); g.translate(cx, cy);
    g.strokeStyle = hexA(ink, 0.6); g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, rr, 0, 6.2832); g.stroke();
    g.beginPath(); g.arc(0, 0, rr - 7, 0, 6.2832); g.stroke();
    for (let i = 0; i < 16; i++) {
      const t = i / 16 * 6.2832;
      const l = i % 4 === 0 ? 11 : 5;
      g.beginPath();
      g.moveTo(Math.cos(t) * (rr - 7), Math.sin(t) * (rr - 7));
      g.lineTo(Math.cos(t) * (rr - 7 - l), Math.sin(t) * (rr - 7 - l)); g.stroke();
    }
    const spike = (rot, len, wid, fill) => {
      g.save(); g.rotate(rot);
      g.beginPath(); g.moveTo(0, -len); g.lineTo(wid, 0); g.lineTo(0, len * 0.12); g.lineTo(-wid, 0); g.closePath();
      if (fill) { g.fillStyle = hexA(ink, 0.8); g.fill(); } else { g.stroke(); }
      g.restore();
    };
    const N = turned ? Math.PI / 2 : 0;         // the plan's own north, on the sheet
    g.lineWidth = 1.2;
    spike(N, rr - 12, 9, true); spike(N + Math.PI, rr - 12, 9, false);
    spike(N + Math.PI / 2, rr - 20, 7, false); spike(N - Math.PI / 2, rr - 20, 7, false);
    g.fillStyle = hexA(ink, 0.85); g.font = '600 15px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.fillText('N', Math.sin(N) * (rr + 14), -Math.cos(N) * (rr + 13));
    if (turned) {
      g.font = '400 10px Grenze, Georgia, serif';
      g.fillStyle = hexA(ink, 0.6);
      g.fillText('PLAN TURNED 90°', 0, rr + 16);
    }
    g.restore(); g.textAlign = 'left';

    // ── scale bar, sitting just above the title bar
    const bx = WIN.x, by = WIN.y + WIN.h + 10;
    g.strokeStyle = hexA(ink, 0.7); g.lineWidth = 1.4;
    g.strokeRect(bx, by, 180, 10);
    g.fillStyle = hexA(ink, 0.7);
    for (let i = 0; i < 4; i++) if (i % 2 === 0) g.fillRect(bx + i * 45, by, 45, 10);
    g.font = '400 11px Grenze, Georgia, serif'; g.textBaseline = 'top';
    g.fillText('0', bx - 3, by + 15); g.fillText('40 FT', bx + 166, by + 15);
    g.restore();
  }

  /** Static film grain, generated once, tiled by CSS. */
  _paintGrain() {
    this.el.grain.style.backgroundImage = `url(${grainUrl()})`;
  }

  // ──────────────────────────────────────────────────────── route + zones ──
  _buildInk() {
    const m = this.model, map = m.map;
    const parts = [];
    parts.push(`<defs>
      <pattern id="mm-hatch" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="11" stroke="currentColor" stroke-width="2.1" opacity=".5"/>
      </pattern>
      <pattern id="mm-dots" width="13" height="13" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.7" fill="currentColor" opacity=".5"/>
        <circle cx="9.5" cy="9.5" r="1.2" fill="currentColor" opacity=".35"/>
      </pattern>
      <!-- The arrowhead is on the LIVE choice, so it wears the live choice's
           colour.  currentColor inside a marker resolves against the marker's
           own inherited colour, which on this layer is the blueprint's blue —
           so the one mark that had to be flame was quietly navy. -->
      <marker id="mm-arrow" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7"
              orient="auto-start-reverse">
        <path class="mi-arrowhead" d="M1 1 L11 6 L1 11 L3.6 6 Z"/>
      </marker>
    </defs>`);

    // hazard wings, under the route
    //
    // The wing used to be labelled with its full name on a banner inside the top
    // edge of its boundary.  On a plan this dense that banner is 300px of solid
    // ink laid across two and a half rows of rooms, and it landed squarely on
    // the icons of the rooms it was warning about — the playtester's report, and
    // measured: five marks covered, one of them by 2,200 square pixels.  There
    // is nowhere on this drawing a 300px banner fits: rows are 125px apart and a
    // mark is 106px wide, so the clear paper between them is nineteen pixels.
    //
    // So the plan is now keyed the way a real drawing is keyed: the wing carries
    // its SYMBOL, and the margin carries the legend.  The symbol is the same one
    // the bar's note wears, so the two read as one thing, and the full name and
    // rule are on the note, on every affected room's hover card, and announced
    // in the node's aria-label.  The roundel is 40px and it is placed by
    // measuring — four corners just outside the boundary, scored against every
    // mark on the sheet, least-covered wins.
    const marks = map.nodes.map((n) => {
      const hx = (n.type === NodeType.BOSS ? 86 : 58);
      return { left: n.x * this.SW - hx, right: n.x * this.SW + hx,
               top: n.y * this.SH - hx, bottom: n.y * this.SH + hx };
    });
    const KEY = 40;
    parts.push('<g class="mi-zones">');
    for (const hz of map.hazards) {
      const x = hz.rect.x0 * this.SW, y = hz.rect.y0 * this.SH;
      const w = (hz.rect.x1 - hz.rect.x0) * this.SW, h = (hz.rect.y1 - hz.rect.y0) * this.SH;
      const s = seedOf(hz.id + map.regionId);
      let best = null;
      for (const [kx, ky] of [[x - KEY - 4, y - KEY - 4], [x + w + 4, y - KEY - 4],
                              [x - KEY - 4, y + h + 4], [x + w + 4, y + h + 4],
                              [x - KEY - 4, y + h / 2 - KEY / 2], [x + w + 4, y + h / 2 - KEY / 2]]) {
        const px = clampN(kx, WIN.x + 4, WIN.x + WIN.w - KEY - 4);
        const py = clampN(ky, WIN.y + 4, WIN.y + WIN.h - KEY - 4);
        const box = { left: px, top: py, right: px + KEY, bottom: py + KEY };
        let c = 0;
        for (const mk of marks) c += rectOverlap(box, mk);
        if (!best || c < best.c) best = { px, py, c };
        if (c === 0) break;
      }
      // a short leader from the roundel back to the nearest point on the boundary
      const ax = best.px + KEY / 2, ay = best.py + KEY / 2;
      const bx = clampN(ax, x, x + w), by = clampN(ay, y, y + h);
      parts.push(`<g class="mi-zone mi-zone--${hz.kind}" data-hz="${hz.id}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22"
              fill="url(#${hz.kind === 'boon' ? 'mm-dots' : 'mm-hatch'})"/>
        <path class="mi-zone-edge" d="${roundedWobbleRect(s, x, y, w, h, 22)}"/>
        <g class="mi-zone-key">
          <path class="mi-zone-lead" d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}"/>
          <circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${KEY / 2}"/>
          <g class="mi-zone-glyph"
             transform="translate(${(best.px + 8).toFixed(1)} ${(best.py + 8).toFixed(1)}) scale(1.5)">
            ${hazardGlyphMarkup(hz.glyph)}
          </g>
        </g>
      </g>`);
    }
    parts.push('</g>');

    // ── the route: GRAPHITE OVER INK ────────────────────────────────────────
    //
    // Rounds 2 and 3 tried to make the route readable by raising its weight and
    // dropping the plan's alpha, and measured that it worked.  It did not: a
    // reviewer playing normally still reported "I could never see which node
    // leads where — the connective strokes are the same dashed vocabulary as the
    // architectural line-work."  They are right, and the sentence contains the
    // diagnosis.  Both were thin dashed blue-grey lines on parchment, so the
    // only variable left was strength, and strength cannot separate two marks
    // that are the same KIND of mark.  A heavier dashed navy line among three
    // hundred dashed navy lines is still camouflage.
    //
    // The route is a pencil drawn OVER a printed survey.  It is now drawn like
    // one, on five axes at once (see `pencilStroke` in ui/mapnode.js):
    //
    //   colour   warm graphite (--graphite ≈ rgb 66,60,54) against the plan's
    //            cold blue, which lands on paper at roughly rgb 134,144,155
    //   texture  one continuous deposit.  The dash is the ARCHITECT's word for
    //            "proposed"; the plan owns it and the route has given it back
    //   join     smooth curves through the hand's tremble.  The plan is mitred
    //            right angles; graphite has no corners
    //   pass     two overlapping strokes, because nobody rules a route once
    //   relief   the same stroke again, offset 1.2/2.4px and very pale, so the
    //            mark casts a shade and sits ON the paper rather than in it
    //
    // Four paths per leg instead of one, all static — no filters, nothing
    // animated per frame.  Order matters: every parchment halo is laid before
    // any graphite, or one leg's clear channel erases the leg it crosses.
    const halos = [], shades = [], ghosts = [], lines = [];
    const put = (from, to, geo, extra = '') => {
      const at = `data-from="${from}" data-to="${to}"`;
      halos .push(`<path class="mi-halo"   ${at} d="${geo.a}"/>`);
      shades.push(`<path class="mi-shade"  ${at} d="${geo.a}"/>`);
      ghosts.push(`<path class="mi-ghost"  ${at} d="${geo.b}"/>`);
      lines .push(`<path class="mi-edge${extra}" ${at} d="${geo.a}"/>`);
    };
    for (const e of map.edges) {
      const a = m.byId.get(e.from), b = m.byId.get(e.to);
      if (!a || !b) continue;
      const ra = a.type === NodeType.BOSS ? BOSS_R : NODE_R;
      const rb = b.type === NodeType.BOSS ? BOSS_R : NODE_R;
      // Trim proportionally, not by a flat mark radius.  Rows sit ~135 sheet-px
      // apart and lanes ~129, so a typical leg is 150-190px long; taking 48 off
      // one end and 51 off the other left 60px of drawn line floating in the
      // middle with a 22px gap at each mark.  With a dashed line nobody noticed;
      // with a continuous pencil the sheet turned into a field of unattached
      // arcs, which is a WORSE answer to "which node leads where" than the one
      // it replaced.  A route has to touch the rooms it joins.
      const L = Math.hypot((b.x - a.x) * this.SW, (b.y - a.y) * this.SH) || 1;
      const t1 = Math.min(ra + 4, L * 0.21), t2 = Math.min(rb + 7, L * 0.23);
      const [x1, y1, x2, y2] = trim(a.x * this.SW, a.y * this.SH, b.x * this.SW, b.y * this.SH, t1, t2);
      const long = b.row - a.row > 1;
      put(e.from, e.to,
        pencilStroke(seedOf(e.from + e.to), x1, y1, x2, y2,
          { bow: long ? 15 : 9, tremble: 1.5, step: long ? 34 : 26 }),
        long ? ' mi-edge--long' : '');
    }

    // The way in.  These are real edges from the doorway marker, not decoration:
    // the one you walk through inks up like any other leg of the route.
    for (const id of map.startIds) {
      const n = m.byId.get(id); if (!n) continue;
      const x = n.x * this.SW, y = n.y * this.SH;
      const x0 = WIN.x + 16;
      put(ENTRY, id,
        pencilStroke(seedOf('in' + id), x0, y + 14, x - NODE_R - 14, y,
          { bow: 9, tremble: 1.2, step: 22 }),
        ' mi-edge--entry');
    }
    parts.push('<g class="mi-halos">'  + halos.join('')  + '</g>');
    parts.push('<g class="mi-shades">' + shades.join('') + '</g>');
    parts.push('<g class="mi-ghosts">' + ghosts.join('') + '</g>');
    parts.push('<g class="mi-edges">'  + lines.join('')  + '</g>');

    const sx = map.startIds.map(i => m.byId.get(i)).filter(Boolean);
    if (sx.length) {
      const my = sx.reduce((a, n) => a + n.y, 0) / sx.length * this.SH;
      parts.push(`<g class="mi-entries"><text class="mi-in" transform="translate(${WIN.x - 16} ${my.toFixed(0)}) rotate(-90)">THE WAY IN</text></g>`);
    }

    // "you are here" pin ring, positioned later
    parts.push('<g class="mi-here" style="display:none"><circle class="mi-here-a" r="48"/><circle class="mi-here-b" r="58"/></g>');

    this.el.ink.innerHTML = parts.join('');
    this.el.ink.style.color = this._inkColor || '#2d4a7a';
    this._edges = [...this.el.ink.querySelectorAll('.mi-edge')];
    // Every leg's four strokes, keyed once so the state pass is four writes per
    // leg and not four queries per leg.
    this._legs = new Map();
    for (const p of this.el.ink.querySelectorAll('.mi-halo, .mi-shade, .mi-ghost')) {
      const k = p.dataset.from + '>' + p.dataset.to;
      let list = this._legs.get(k);
      if (!list) this._legs.set(k, list = []);
      list.push(p);
    }
  }

  /**
   * All sixty-four marks, in ONE parse.
   *
   * This used to build a `<button>` per node and append them to a fragment,
   * which is sixty-four separate `innerHTML` parses of a ten-element SVG each —
   * 57 ms on the Foyer, on the critical path between the veil and the sheet.
   * The markup is a pure function of the node either way, so it is now
   * assembled as one string and handed over once: 23 ms for the same DOM.
   * The mark's position goes in the same string; setting `left`/`top` per node
   * afterwards was sixty-four more style writes for nothing.
   */
  _buildNodes() {
    const m = this.model;
    const html = [];
    for (const n of m.map.nodes) {
      const hz = n.hazard ? hazardById(n.hazard) : null;
      html.push(mapNodeMarkup(n, NODE_INFO[n.type], hz ? hz.name : '',
        { left: n.x * this.SW, top: n.y * this.SH }));
    }
    this.el.nodes.innerHTML = html.join('');

    this._nodeEls = new Map();
    for (const el of this.el.nodes.children) this._nodeEls.set(el.dataset.id, el);

    // One measuring pass for every name chip, read together so the browser does
    // a single layout rather than sixty.  Widths never change after this: the
    // text is fixed and the counter-scale is a transform.
    this._labels = [];
    for (const n of m.map.nodes) {
      const el = this._nodeEls.get(n.id);
      const lab = el.querySelector('.mn-label');
      this._labels.push({ n, el, lab, box: n.type === NodeType.BOSS ? BOSS_BOX : NODE_BOX, w: 0 });
    }
    for (const L of this._labels) L.w = L.lab.offsetWidth || 120;
  }

  /**
   * Keep the name chips off each other and off the marks.
   *
   * Lanes sit 129 sheet-px apart and a counter-scaled mark plus its name is
   * ~125 of them, so a room's name lands on the next lane's icon the moment the
   * lane jitter closes the gap — which is what put "Formal Dining R…" under the
   * "Music Room" chip.  There is no CSS for this: it is a placement problem, so
   * it gets solved as one, analytically, in sheet coordinates.
   *
   * Each visible chip tries a short ladder of vertical offsets (in place, a
   * nudge down, flipped above the mark, further out) and takes the first that
   * touches nothing.  Priority decides who gets the good slot: where you are
   * standing, then the boss, then the rooms you may enter, then the rest.  Only
   * the last group may be dropped, and only when nothing clears — a chip that
   * cannot be read is worse than no chip.
   *
   * Runs on state changes and when the counter-scale steps, never per frame.
   */
  _layoutLabels() {
    if (!this._labels) return;
    const m = this.model;
    const k = this._mnK || 1;
    const close = this.el.screen.classList.contains('is-close');
    const legal = new Set(this._legalIds || []);

    const rank = (L) => {
      if (L.n.id === m.currentId) return 0;
      if (L.n.type === NodeType.BOSS) return 1;
      if (legal.has(L.n.id)) return 2;
      return 3;
    };
    const shown = this._labels.filter((L) => {
      const r = rank(L);
      if (r < 3) return true;
      // matches the CSS: when zoomed in, everything except cut-off rooms
      return close && !L.el.classList.contains('is-cold');
    });
    const shownSet = new Set(shown);

    // The marks themselves are obstacles.  How big a mark is depends on what it
    // is wearing: a room you may enter has the pencil ring round it and the ring
    // is the "you may go here" signal, so nothing may touch it.  A quiet room is
    // only its glyph, and a name chip tucked into the empty paper beside that
    // glyph reads fine — treating every mark as ring-sized over-constrains the
    // problem and leaves chips sitting on ink they could have avoided.
    const discs = this._labels.map((L) => {
      const lit = L.n.id === m.currentId || legal.has(L.n.id);
      return {
        cx: L.n.x * this.SW, cy: L.n.y * this.SH,
        r: (L.n.type === NodeType.BOSS ? 74 : lit ? 44 : 30) * k,
      };
    });

    const placed = [];
    /**
     * The chip's box in sheet coordinates for a candidate offset — and the
     * offset it actually ended up at, because the box is clamped into the drawn
     * plan window here rather than after the fact.  That clamp is the boss
     * label fix: "RECEIVING CHAMBER" is 341 sheet-px of Cinzel centred on a
     * room at x=0.905, which puts half of it past the right-hand frame rule and
     * off the paper.  Clamping inside boxOf means the collision pass scores the
     * position the chip will really occupy, not the one it asked for.
     */
    const boxOf = (L, dx, dy) => {
      const cx = L.n.x * this.SW, cy = L.n.y * this.SH;
      const hw = (L.w / 2 + 4) * k, hh = LABEL_H * k;
      const lo = WIN.x + 10 + hw, hi = WIN.x + WIN.w - 10 - hw;
      const c = hi > lo ? clampN(cx + dx * k, lo, hi) : cx;
      const top = cy + (L.box / 2 + 3 + dy) * k;
      return { left: c - hw, right: c + hw, top, bottom: top + hh,
               dx: (c - cx) / k, dy };
    };
    // Overlap and travel are scored separately on purpose.  Travel is only a
    // tie-break — "all else equal, stay near your own mark" — and must never
    // reach the drop decision, or a chip that found perfectly clear paper two
    // rungs down gets deleted for the crime of having moved.  (It did: folding
    // the two together took the sheet from 9 dropped names to 20.)
    // Chips are tested against each other with a breathing gap around them, not
    // edge to edge.  Two names 3px apart do not overlap by any measure and read
    // as one pile — which is precisely what the playtester photographed and
    // called an overlap.  "Formal Dining Room" and "East Reception Hall" in
    // `p5-42z.png` are 17 screen px apart and touch nothing.
    const GAP = 7 * k;
    const clash = (L, b) => {
      let c = 0;
      const g = { left: b.left - GAP, right: b.right + GAP,
                  top: b.top - GAP, bottom: b.bottom + GAP };
      for (const p of placed) c += rectOverlap(g, p) * 4;
      for (let i = 0; i < discs.length; i++) {
        if (this._labels[i] !== L) c += discOverlap(b, discs[i]);
      }
      return c;
    };
    const travel = (b) => (Math.abs(b.dx) + Math.abs(b.dy)) * 0.6;

    // `lab-off` means "the pass could not find clear paper", never "the CSS
    // was going to hide this anyway" — otherwise the class stops meaning
    // anything and the next person to read it is misled.
    for (const L of this._labels) { L.dx = 0; L.dy = 0; L.off = false; }
    for (const L of shown.sort((a, b) => rank(a) - rank(b))) {
      // The old ladder was vertical only, and vertical-only is why the
      // playtester saw "Formal Dining Room" and "East Reception Hall" stacked
      // against each other: two rooms one lane apart have nowhere to go up or
      // down that is not the other one's mark, and a chip that cannot move
      // sideways has to settle for the least-bad pile.  Sideways is where the
      // clear paper is on a plan whose depth runs west to east.
      const side = L.w / 2 + 34;
      const cands = [];
      for (const dy of [0, 26, -(L.box + 26), 54, -(L.box + 54), 82, -(L.box + 82)]) {
        cands.push([0, dy]);
        if (Math.abs(dy) <= 56) { cands.push([side, dy], [-side, dy]); }
      }
      // nearest first, so the first slot that clears is also the closest one
      cands.sort((p, q) => (Math.abs(p[0]) + Math.abs(p[1])) - (Math.abs(q[0]) + Math.abs(q[1])));
      let best = null;
      for (const [dx, dy] of cands) {
        const b = boxOf(L, dx, dy);
        const hit = clash(L, b);
        const score = hit + travel(b);
        if (!best || score < best.score) best = { score, hit, b };
        if (hit === 0) break;
      }
      // A chip may only be dropped when nothing clears AND it is one of the
      // rooms you cannot enter this turn: an unreadable name is worse than no
      // name, but a missing name on a legal room is worse than either.
      if (best.hit > 0 && rank(L) === 3) { L.off = true; continue; }
      L.dx = best.b.dx; L.dy = best.b.dy;
      placed.push(best.b);
    }
    for (const L of this._labels) {
      L.el.style.setProperty('--mn-dx', L.dx ? L.dx.toFixed(1) + 'px' : '0px');
      L.el.style.setProperty('--mn-dy', L.dy ? L.dy.toFixed(1) + 'px' : '0px');
      L.el.classList.toggle('lab-off', !!L.off);
      this._drawLeader(L);
    }
  }

  /**
   * Tie a displaced name back to its room with a drafting leader.
   *
   * Moving a chip solves the collision and creates a worse problem: the
   * playtester's two labels were perfectly legible, they just did not say which
   * room they belonged to.  On a real survey a note that will not fit beside its
   * subject gets a leader line, so this one does too.  Drawn inside the node's
   * own SVG, which shares the mark's coordinate space and its counter-scale.
   */
  _drawLeader(L) {
    const path = L.lead || (L.lead = L.el.querySelector('.mn-lead'));
    if (!path) return;
    const far = Math.abs(L.dy) > 20 || Math.abs(L.dx) > 12;
    if (!far || L.off) { path.setAttribute('d', ''); return; }
    const b = L.box, hw = L.w / 2 + 4, hh = LABEL_H / 2;
    const ox = b / 2, oy = b / 2;                       // the mark's centre
    const tx = b / 2 + L.dx, ty = b + 3 + L.dy + hh;    // the chip's centre
    const vx = tx - ox, vy = ty - oy, len = Math.hypot(vx, vy) || 1;
    const ux = vx / len, uy = vy / len;
    const r0 = (L.n.type === NodeType.BOSS ? 0.44 : 0.34) * b;
    // stop on the chip's edge, not inside it
    const tin = Math.min(Math.abs(hw / (ux || 1e-6)), Math.abs(hh / (uy || 1e-6))) + 2;
    const l1 = Math.max(r0 + 3, len - tin);
    if (l1 <= r0 + 3) { path.setAttribute('d', ''); return; }
    path.setAttribute('d', `M${(ox + ux * r0).toFixed(1)} ${(oy + uy * r0).toFixed(1)}`
                         + `L${(ox + ux * l1).toFixed(1)} ${(oy + uy * l1).toFixed(1)}`);
  }

  _buildMarginalia() {
    const map = this.model.map;
    // Wing conditions live in the bar so nothing ever covers the boss.
    // The full rule is one hover away, and repeated on every affected node.
    this.el.notes.innerHTML = map.hazards.length ? `
      <span class="notes-h">Wings</span>
      ${map.hazards.map(h => `
        <button type="button" class="note note--${h.kind}" data-hz="${h.id}">
          <span class="note-ico">${hazardSymbol(h.glyph, 17)}</span>
          <b>${escapeHtml(h.name)}</b>
          <span class="note-pop">
            <i>${escapeHtml(h.rule)}</i>
            <em>${escapeHtml(h.note)}</em>
          </span>
        </button>`).join('')}` : '';

    // The key is a key to THIS drawing, so it lists the marks that are actually
    // on it.  All nine are real and distinct — measured across every region:
    // an average sheet carries 22 Scuffles, 10 Curiosities, 8 Safe Rooms, 6
    // Unsurveyed, 4 Big Scares, 3 Treasures, 2 of Mr. Moth's, a Rescue and the
    // boss — but two of them are conditional.  Rescue only exists while that
    // wing's Companion is still trapped (the Heart has none at all), and the
    // Unsurveyed mark is genuinely its own thing rather than a second Curiosity:
    // `run.js` resolves it on entry into a Curiosity, Scuffle, shop or Treasure,
    // which is the whole point of it.  Printing a symbol for a room the player
    // will not find on this sheet is the kind of small lie that makes a key
    // untrustworthy, so the conditional ones drop out when they are not there.
    const order = [NodeType.SCUFFLE, NodeType.BIG_SCARE, NodeType.CURIOSITY, NodeType.TREASURE,
                   NodeType.SAFE, NodeType.SHOP, NodeType.RESCUE, NodeType.UNKNOWN, NodeType.BOSS];
    const present = new Set(map.nodes.map(n => n.type));
    this.el.legend.innerHTML = `
      <span class="lg-h">Key</span>
      ${order.filter(t => present.has(t))
             .map(t => `<span class="lg-i"><span class="lg-ico">${nodeSymbol(t, 19)}</span>${escapeHtml(NODE_INFO[t].label)}</span>`)
             .join('')}`;
  }

  // ────────────────────────────────────────────────────────────── states ───
  _syncStates() {
    const m = this.model;
    const legal = new Set(this._legal());
    const reach = this._reach = reachableFrom(m.map, m.currentId);
    // `reachableFrom` returns what you can reach FROM the seeds, so at the door
    // the seeds themselves — the whole first row — were not in the set, and
    // every edge leaving row one was classified "no route from here" and drawn
    // at the faintest weight there is.  That is the exact moment the player is
    // trying to read the sheet for the first time.  Standing at the door, the
    // first row is ahead of you.
    if (!m.currentId) for (const id of m.map.startIds) reach.add(id);
    // depth runs left→right, so the choice you are making is a vertical one
    this._legalIds = [...legal].sort((a, b) =>
      (m.byId.get(a)?.y ?? 0) - (m.byId.get(b)?.y ?? 0));

    // Slay the Spire's rule, and the one this screen was failing: the nodes you
    // may enter are lit and EVERYTHING else is dimmed.  Reachability is not the
    // test — from row one almost the whole wing is still reachable, so keying
    // the dim off it left every icon at full strength and the three live rings
    // competing with thirty dead ones.  Reachability only picks which shade of
    // dim: still ahead of you, or cut off for good.
    for (const [id, el] of this._nodeEls) {
      const isVisited = m.visited.has(id);
      const isCurrent = id === m.currentId;
      const isLegal = legal.has(id);
      const isOther = !isLegal && !isCurrent && !isVisited;
      const isReach = reach.has(id);
      el.classList.toggle('is-visited', isVisited);
      el.classList.toggle('is-current', isCurrent);
      el.classList.toggle('is-legal', isLegal);
      el.classList.toggle('is-dim', isOther);
      el.classList.toggle('is-far', isOther && isReach);
      el.classList.toggle('is-cold', isOther && !isReach);
      el.tabIndex = isLegal ? 0 : -1;
      el.setAttribute('aria-disabled', isLegal ? 'false' : 'true');
    }

    const walkedPairs = new Set();
    for (let i = 1; i < m.path.length; i++) walkedPairs.add(m.path[i - 1] + '>' + m.path[i]);
    const here = m.currentId || ENTRY;
    for (const p of this._edges) {
      const f = p.dataset.from, t = p.dataset.to;
      const walked = walkedPairs.has(f + '>' + t);
      const open = !walked && f === here && legal.has(t);
      const dead = !walked && !open;
      const cold = dead && !(reach.has(f) && reach.has(t));
      p.classList.toggle('is-walked', walked);
      p.classList.toggle('is-open', open);
      p.classList.toggle('is-dead', dead);
      p.classList.toggle('is-cold', cold);
      p.setAttribute('marker-end', open ? 'url(#mm-arrow)' : '');
      for (const q of this._legs.get(f + '>' + t) || []) {
        q.classList.toggle('is-walked', walked);
        q.classList.toggle('is-open', open);
        q.classList.toggle('is-dead', dead);
        q.classList.toggle('is-cold', cold);
      }
    }

    this.el.screen.classList.toggle('is-underway', !!m.currentId);

    // you-are-here ring
    const hereRing = this.el.ink.querySelector('.mi-here');
    const cur = m.currentId && m.byId.get(m.currentId);
    if (cur) {
      hereRing.style.display = '';
      hereRing.setAttribute('transform', `translate(${cur.x * this.SW} ${cur.y * this.SH})`);
    } else hereRing.style.display = 'none';

    // Row counter in the header, so "Wing 1 of 17" and "Row 4 of 13" are visibly
    // the same two-level address and not two unrelated numbers — same case, same
    // bold numeral, same "N of M".
    // Before you step inside there is no row number, and "Row — of 13" printed
    // an em dash where the player expected a number and read as a bug.  Say the
    // true thing instead: you are at the door, and here is how deep the wing is.
    if (this.el.rowNum) {
      const at = m.currentId && m.byId.get(m.currentId);
      this.el.rowNum.innerHTML = at
        ? (at.type === NodeType.BOSS
            ? `Row <b>${m.map.rows}</b> of ${m.map.rows} — the boss`
            : `Row <b>${at.row + 1}</b> of ${m.map.rows}`)
        : `<b>At the door</b> · ${m.map.rows} rows deep`;
    }

    if (!this._focusId || !legal.has(this._focusId)) this._focusId = this._legalIds[0] || null;
    this._markFocus();
    this._layoutLabels();
    this._refreshTip();
  }

  /** The hover card must never keep claiming "you may go here" after you went. */
  _refreshTip() {
    const id = this._hoverId;
    if (!id || !this.el?.tip?.classList.contains('is-on')) return;
    const el = this._nodeEls?.get(id);
    if (el) this._showTip(id, el);
  }

  _markFocus() {
    for (const [id, el] of this._nodeEls) el.classList.toggle('is-kbd', id === this._focusId);
  }

  // ─────────────────────────────────────────────────────────── the ink-on ──
  /**
   * The survey draws itself on, west to east, in one 800ms sweep: a clip on the
   * ink layer and the marks, with a wet pencil edge travelling ahead of it.
   * A frame strip taken from t=0 must show motion across at least eight of
   * twelve frames; if it does not, this is a lie and should be deleted rather
   * than dressed up.  (It did not, once — see the note over @keyframes mm-wipe.)
   */
  _drawOn() {
    const scr = this.el.screen;
    scr.classList.remove('is-drawn');
    // Armed: the sheet is blank and the marks are clipped away, but nothing is
    // animating yet.  `scenes.go` awaits enter() and only THEN lifts the veil,
    // so a sweep started here would spend its first third behind a black screen
    // and arrive already half-drawn.  Hold the blank sheet until the screen is
    // actually being looked at, then draw.
    scr.classList.add('is-armed');
    return this._whenVisible()
      .then(() => {
        if (!this.el) return null;
        scr.classList.remove('is-armed');
        scr.classList.add('is-drawing');
        return clock.wait(0.82);
      })
      .then(() => {
        if (!this.el) return;
        scr.classList.remove('is-armed', 'is-drawing');
        scr.classList.add('is-drawn');
      });
  }

  /**
   * Resolve once the scene change has finished revealing AND the page is
   * actually producing frames again.  The first raster of this screen — a
   * 2233x1111 parchment canvas, a 2030x1010 ink layer, sixty-four marks and
   * two blurred chrome strips — measured a 390ms stall followed by a 300ms one.
   * An 800ms animation that spends 690ms of that frozen is not an animation, and
   * that is exactly what the last review's frame strip caught.  So: wait for the
   * veil, then wait for three consecutive frames under 40ms, then draw.
   */
  async _whenVisible() {
    const sm = this.ctx.scenes;
    const deadline = performance.now() + 2500;      // never hold the sheet blank longer
    for (let i = 0; i < 75 && sm && sm.busy && this.el; i++) {
      if (performance.now() > deadline) return;
      await clock.wait(0.016);
    }
    let smooth = 0, t = performance.now();
    for (let i = 0; i < 60 && smooth < 3 && this.el; i++) {
      await clock.wait(0.016);
      const now = performance.now();
      if (now > deadline) return;
      smooth = (now - t) < 40 ? smooth + 1 : 0;
      t = now;
    }
  }

  // ───────────────────────────────────────────────────────── view control ──
  /** Cached viewport box.  _applyView runs on every drag move and every frame
   *  of a look-at tween; measuring the DOM in there is a layout read per frame. */
  _vpRect() {
    return this._vp || (this._vp = this.el.viewport.getBoundingClientRect());
  }

  _fitView() {
    this._vp = null;
    const vp = this._vpRect();
    const fit = Math.min((vp.width - 44) / this.SW, (vp.height - 30) / this.SH);
    this.view.minZ = Math.max(0.28, fit * 0.85);
    this.view.maxZ = 2.4;
    const z = clampN(fit, this.view.minZ, this.view.maxZ);
    this.view.z = this.view.tz = z;
    this.view.x = (vp.width - this.SW * z) / 2;
    this.view.y = (vp.height - this.SH * z) / 2;
    this._fitZoom = z;
    this._applyView();
  }

  _clampPan() {
    const vp = this._vpRect();
    const w = this.SW * this.view.z, h = this.SH * this.view.z;
    const mx = Math.min(140, vp.width * 0.2), my = Math.min(120, vp.height * 0.2);
    if (w <= vp.width) this.view.x = (vp.width - w) / 2;
    else this.view.x = clampN(this.view.x, vp.width - w - mx, mx);
    if (h <= vp.height) this.view.y = (vp.height - h) / 2;
    else this.view.y = clampN(this.view.y, vp.height - h - my, my);
  }

  _applyView() {
    this._clampPan();
    const v = this.view;
    this.el.sheet.style.transform =
      `translate3d(${v.x.toFixed(2)}px, ${v.y.toFixed(2)}px, 0) scale(${v.z.toFixed(4)})`;
    // Counter-scale the marks so a zoomed-out sheet still has legible icons.
    // The paper shrinks; the pencil on it does not go below a readable size.
    // Quantised: writing this every wheel frame restyles all sixty-odd node
    // subtrees, and a 2% step is invisible.
    const k = Math.round(clampN(MIN_ICON_SCALE / v.z, 1, 1.5) * 50) / 50;
    let relayout = false;
    if (k !== this._mnK) {
      this._mnK = k;
      this.el.nodes.style.setProperty('--mn-k', k.toFixed(2));
      relayout = true;
    }
    const close = v.z > (this._fitZoom || 1) * 1.22;
    if (close !== this._isClose) {
      this._isClose = close;
      this.el.screen.classList.toggle('is-close', close);
      relayout = true;
    }
    // Both of these change which chips are on the paper and how big they are, so
    // the collision pass has to run again — but only on the step, never per
    // wheel frame.
    if (relayout && this._labels) this._layoutLabels();
  }

  _zoomAt(px, py, factor) {
    const v = this.view;
    const z2 = clampN(v.z * factor, v.minZ, v.maxZ);
    if (z2 === v.z) return;
    const k = z2 / v.z;
    v.x = px - (px - v.x) * k;
    v.y = py - (py - v.y) * k;
    v.z = z2;
    this._applyView();
  }

  /** Keep the current node (or the start row) comfortably in frame. */
  _lookAt(node, dur = 0.55) {
    if (!node) return;
    const vp = this._vpRect();
    const z = this.view.z;
    const tx = vp.width * 0.40 - node.x * this.SW * z;   // keep the road ahead in view
    const ty = vp.height * 0.50 - node.y * this.SH * z;
    if (this.still || dur <= 0) { this.view.x = tx; this.view.y = ty; this._applyView(); return; }
    const from = { x: this.view.x, y: this.view.y };
    clock.ramp(dur, (v) => {
      this.view.x = from.x + (tx - from.x) * v;
      this.view.y = from.y + (ty - from.y) * v;
      this._applyView();
    }, Clock.easeOutCubic);
  }

  // ──────────────────────────────────────────────────────────────── events ──
  _bindEvents() {
    const el = this.el, on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._off.push(() => t.removeEventListener(ev, fn, o)); };

    // hover / click on nodes (delegated — one listener, not fifty)
    on(el.nodes, 'pointerover', (e) => {
      const b = e.target.closest('.map-node'); if (!b) return;
      this._showTip(b.dataset.id, b);
    });
    on(el.nodes, 'pointerout', (e) => {
      const b = e.target.closest('.map-node'); if (!b) return;
      if (b.contains(e.relatedTarget)) return;
      this._hideTip();
    });
    on(el.nodes, 'click', (e) => {
      const b = e.target.closest('.map-node'); if (!b) return;
      if (this._movedFar) return;
      this._choose(b.dataset.id);
    });
    on(el.nodes, 'focusin', (e) => {
      const b = e.target.closest('.map-node'); if (!b) return;
      this._focusId = b.dataset.id; this._markFocus(); this._showTip(b.dataset.id, b);
    });

    // Pan.  The pointer is captured ONLY once a drag has actually started.
    // Capturing on pointerdown retargets the resulting `click` to the viewport,
    // which makes `e.target.closest('.map-node')` above return null on every
    // single click and silently kills the entire mouse path through the map.
    on(el.viewport, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      this._drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, id: e.pointerId };
      this._movedFar = false;
      el.screen.classList.add('is-grabbing');
    });
    on(window, 'pointermove', (e) => {
      this.lamp.tx = e.clientX; this.lamp.ty = e.clientY;
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      if (!this._movedFar && Math.hypot(dx, dy) > 5) {
        this._movedFar = true;
        // now it is a drag, so keep the pointer even if it leaves the window
        try { el.viewport.setPointerCapture?.(this._drag.id); this._drag.captured = true; } catch {}
      }
      if (!this._movedFar) return;
      this.view.x = this._drag.vx + dx; this.view.y = this._drag.vy + dy;
      this._applyView();
    }, { passive: true });
    const endDrag = () => {
      if (this._drag?.captured) {
        try { el.viewport.releasePointerCapture?.(this._drag.id); } catch {}
      }
      this._drag = null; el.screen.classList.remove('is-grabbing');
    };
    on(window, 'pointerup', endDrag);
    on(window, 'pointercancel', endDrag);

    // zoom — about 1.2x per notch, not 1.9x
    on(el.viewport, 'wheel', (e) => {
      e.preventDefault();
      const r = this._vpRect();
      this._zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0005));
    }, { passive: false });

    // keyboard
    on(window, 'keydown', (e) => this._key(e));
    on(window, 'resize', () => { this._fitView(); }, { passive: true });

    // hazard note ↔ zone cross-highlight
    on(el.notes, 'pointerover', (e) => {
      const n = e.target.closest('.note'); if (!n) return;
      this.el.screen.dataset.hzFocus = n.dataset.hz;
    });
    on(el.notes, 'pointerout', () => { delete this.el.screen.dataset.hzFocus; });
  }

  _key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ids = this._legalIds || [];
    const idx = Math.max(0, ids.indexOf(this._focusId));
    const pan = (dx, dy) => { this.view.x += dx; this.view.y += dy; this._applyView(); };
    switch (e.key) {
      case 'ArrowLeft':
        if (e.shiftKey) { pan(120, 0); break; }
        if (!ids.length) break;
        this._focusId = ids[(idx - 1 + ids.length) % ids.length]; this._focusMove(); break;
      case 'ArrowRight':
        if (e.shiftKey) { pan(-120, 0); break; }
        if (!ids.length) break;
        this._focusId = ids[(idx + 1) % ids.length]; this._focusMove(); break;
      case 'ArrowUp':
        if (e.shiftKey) { pan(0, 120); break; }
        if (!ids.length) break;
        this._focusId = ids[(idx + 1) % ids.length]; this._focusMove(); break;
      case 'ArrowDown':
        if (e.shiftKey) { pan(0, -120); break; }
        if (!ids.length) break;
        this._focusId = ids[(idx - 1 + ids.length) % ids.length]; this._focusMove(); break;
      case 'Enter': case ' ':
        if (this._focusId) { e.preventDefault(); this._choose(this._focusId); } break;
      case '+': case '=': this._zoomCentre(1.2); break;
      case '-': case '_': this._zoomCentre(1 / 1.2); break;
      case '0': this._fitView(); break;
      case 'l': case 'L': this.el.screen.classList.toggle('no-bar'); break;
      default: return;
    }
  }
  _zoomCentre(f) {
    const r = this._vpRect();
    this._zoomAt(r.width / 2, r.height / 2, f);
  }
  _focusMove() {
    this._markFocus();
    const el = this._nodeEls.get(this._focusId);
    if (el) { el.focus({ preventScroll: true }); this._showTip(this._focusId, el); }
  }

  // ───────────────────────────────────────────────────────────── the tip ───
  _showTip(id, anchor) {
    const n = this.model.byId.get(id); if (!n) return;
    this._hoverId = id;
    const info = NODE_INFO[n.type];
    const hz = n.hazard ? hazardById(n.hazard) : null;
    const legal = (this._legalIds || []).includes(id);
    const visited = this.model.visited.has(id);
    const current = id === this.model.currentId;
    const depth = n.type === NodeType.BOSS
      ? 'The end of this wing'
      : `Row ${n.row + 1} of ${this.model.map.rows} in this wing`;

    this.el.tip.innerHTML = `
      <div class="tip-head">
        <span class="tip-ico">${nodeSymbol(n.type, 30)}</span>
        <div>
          <b class="tip-room">${escapeHtml(n.roomName || info.label)}</b>
          <span class="tip-type">${info.label}</span>
        </div>
      </div>
      <p class="tip-blurb">${escapeHtml(info.blurb)}</p>
      <p class="tip-reward"><i>Yields</i> ${escapeHtml(info.reward)}</p>
      ${hz ? `<p class="tip-hz tip-hz--${hz.kind}">
          <span>${hazardSymbol(hz.glyph, 16)}</span>
          <b>${escapeHtml(hz.name)}</b> — ${escapeHtml(hz.rule)}</p>` : ''}
      <p class="tip-foot">${depth} · ${
        current ? '<b>you are standing here</b>'
        : visited ? 'already walked'
        : legal ? '<b>you may go here</b>'
        : this._reach?.has(id) ? 'still ahead of you on this route'
        : 'no route from where you are standing'}</p>`;

    const r = anchor.getBoundingClientRect();
    const t = this.el.tip;
    t.setAttribute('aria-hidden', 'false');
    t.classList.add('is-on');
    // Depth runs west to east, so a room's onward edges leave to its RIGHT and
    // fan out over the next two rows.  The card must never cover that fan, or it
    // hides the very choice it is explaining.  So: LEFT first, over ground already
    // walked.  When the room is hard against the west edge of the screen — which
    // every room on row one is — the card goes ABOVE or BELOW instead, where it
    // crosses at most one lane of the fan.  Going right is the last resort and
    // only happens when there is no vertical room either.
    const tw = t.offsetWidth || 320, th = t.offsetHeight || 170;
    const gap = 20;
    const topLim = 66, botLim = innerHeight - 58;
    const centreY = clampN(r.top + r.height / 2 - th / 2, topLim, Math.max(topLim, botLim - th));
    const centreX = clampN(r.left + r.width / 2 - tw / 2, 14, Math.max(14, innerWidth - tw - 14));

    // The card must never cover the room's own onward corridors, or it hides the
    // very choice it is explaining.  This used to be a fixed ladder (left, then
    // above, then below, then right) reasoned from "depth runs west to east, so
    // the fan leaves to the right".  That is true on average and wrong often
    // enough — a long passage or a lane change can put an outgoing edge anywhere.
    // ui-chrome's shared tooltip solved the same problem properly, by MEASURING
    // what a side would occlude; this is that idea applied to the real thing
    // that matters here, the `.mi-edge` paths leaving this node.  (Their panel
    // itself is not adopted — see the note in docs/notes.)
    // Avoid the edges leaving this room AND every other room you may enter.
    // Measured over the five entry rooms of the Foyer at seed 42, the card was
    // landing on another legal mark four times out of five (worst: 6,316 px²) —
    // it fitted, it missed the corridors, and it sat squarely on the two other
    // doors.  A card explaining one choice must not hide the alternatives; a
    // legal mark and its name are as load-bearing as an outgoing corridor.
    const avoid = [r];
    for (const p of this._edges) {
      if (p.dataset.from !== id) continue;
      const b = p.getBoundingClientRect();
      if (b.width && b.height) avoid.push(b);
    }
    for (const lid of (this._legalIds || [])) {
      if (lid === id) continue;
      const el = this._nodeEls.get(lid); if (!el) continue;
      const nb = el.getBoundingClientRect();
      if (nb.width && nb.height) avoid.push(nb);
      const lb = el.querySelector('.mn-label');
      if (lb) { const q = lb.getBoundingClientRect(); if (q.width) avoid.push(q); }
    }
    const cands = [
      { side: 'left',  x: r.left - gap - tw,  y: centreY },
      { side: 'above', x: centreX,            y: r.top - gap - th },
      { side: 'below', x: centreX,            y: r.bottom + gap },
      { side: 'right', x: r.right + gap,      y: centreY },
    ];
    let best = null;
    for (const c of cands) {
      const fits = c.x >= 14 && c.y >= topLim && c.x + tw <= innerWidth - 14 && c.y + th <= botLim;
      let score = fits ? 1000 : 0;
      if (!fits) {
        score -= Math.max(0, 14 - c.x) + Math.max(0, topLim - c.y)
               + Math.max(0, c.x + tw - (innerWidth - 14)) + Math.max(0, c.y + th - (botLim));
      }
      const box = { left: c.x, top: c.y, right: c.x + tw, bottom: c.y + th };
      let occl = 0;
      for (const a of avoid) occl += rectOverlap(box, a);
      score -= Math.min(900, occl / 26);
      if (c.side === 'left') score += 30;      // ground already walked, all else equal
      if (!best || score > best.score) best = { ...c, score };
    }
    const side = best.side;
    const x = clampN(best.x, 14, Math.max(14, innerWidth - tw - 14));
    const y = clampN(best.y, topLim, Math.max(topLim, botLim - th));
    t.dataset.side = side;
    t.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (hz) this.el.screen.dataset.hzFocus = hz.id;
  }
  _hideTip() {
    this._hoverId = null;
    this.el.tip.classList.remove('is-on');
    this.el.tip.setAttribute('aria-hidden', 'true');
    delete this.el.screen.dataset.hzFocus;
  }

  // ──────────────────────────────────────────────────────────── choosing ───
  _choose(id) {
    const m = this.model;
    if (!(this._legalIds || []).includes(id)) { this._refuse(id); return; }
    const node = m.byId.get(id);
    bus.emit('map:choose', node);

    // Local advance keeps the screen honest even before run.js exists.
    m.visited.add(id);
    node.visited = true;
    if (!m.path.length) m.path.push(ENTRY);
    m.path.push(id);
    m.currentId = id;

    if (m.run) {
      m.run.currentNodeId = id;
      // Deliberately NOT `run.visitedIds = [...m.visited]`. `visitedIds` is the
      // *cleared* set now, and `run._markEntered()` had to actively splice this
      // optimistic entry back out. Entering a room is not clearing it.
      m.run.pathIds = m.path.slice();
      if (typeof m.run.chooseNode === 'function') { m.run.chooseNode(node); return; }
      this.ctx.scenes?.go?.(sceneForNode(node), { node: id, region: m.regionId });
      return;
    }

    // standalone: stay on the map, mark it up, keep playing
    this.ctx.audio?.play?.('map:step');
    this._syncStates();
    this._stampVisit(id);
    this._lookAt(node);
  }

  _refuse(id) {
    const el = this._nodeEls.get(id); if (!el) return;
    el.classList.remove('is-refused'); void el.offsetWidth; el.classList.add('is-refused');
  }

  _stampVisit(id) {
    const el = this._nodeEls.get(id); if (!el || this.still) return;
    el.classList.remove('is-stamping'); void el.offsetWidth; el.classList.add('is-stamping');
  }

  _prewalk(n) {
    const rng = new RNG(hashSeed(`walk|${this.model.seed}|${this.model.regionId}`));
    for (let i = 0; i < n; i++) {
      const ids = this._legalIds || this._legal();
      if (!ids.length) break;
      const pick = ids[rng.int(ids.length)];
      const node = this.model.byId.get(pick);
      this.model.visited.add(pick); node.visited = true;
      if (!this.model.path.length) this.model.path.push(ENTRY);
      this.model.path.push(pick);
      this.model.currentId = pick;
      this._syncStates();
    }
    this._lookAt(this.model.byId.get(this.model.currentId), 0);
  }

  // ─────────────────────────────────────────────────────────────── frame ───
  update(dt, t) {
    // lamp follows the cursor with a little lag, and breathes like a real flame
    if (!this.el?.lamp) return;
    const l = this.lamp;
    const k = this.still ? 1 : 1 - Math.pow(0.001, dt);
    l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k;
    const flick = this.still ? 1 : 1 + Math.sin(t * 7.3) * 0.018 + Math.sin(t * 17.1) * 0.011;
    // Two 1280px layers with mix-blend-mode: writing them every frame recomposites
    // the whole screen whether or not anything moved.  Quantise, and only write
    // when the change would actually be visible.
    const qx = Math.round(l.x * 2) / 2, qy = Math.round(l.y * 2) / 2;
    const qf = Math.round(flick * 250) / 250;
    if (qx === this._lx && qy === this._ly && qf === this._lf) return;
    this._lx = qx; this._ly = qy; this._lf = qf;
    const tr = `translate3d(${qx}px, ${qy}px, 0) scale(${qf})`;
    this.el.lamp.style.transform = tr;
    this.el.lampWarm.style.transform = tr;
  }

  // ──────────────────────────────────────────────────────────────── exit ───
  async exit() {
    this._unpauseStage?.();
    this._unpauseStage = null;
    for (const off of this._off) { try { off(); } catch {} }
    this._off.length = 0;
    this.hud?.destroy(); this.hud = null;
    this._nodeEls?.clear();
    this._edges = null;
    if (this.el?.paper) { this.el.paper.width = this.el.paper.height = 0; }
    // The stylesheet stays: see CSS_READY.  Pulling it out here was costing a
    // full round trip on the way back in, every room, for no benefit.
    this._cs = null; this._vp = null; this._legs = null;
    this.el = null; this.model = null;
  }
}

// ── little maths ─────────────────────────────────────────────────────────────
function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/** Overlap area of two {left,right,top,bottom} boxes, 0 if they miss. */
function rectOverlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (w > 0 && h > 0) ? w * h : 0;
}
/** Approximate overlap of a box and a disc, via the disc's bounding square. */
function discOverlap(a, d) {
  return rectOverlap(a, { left: d.cx - d.r, right: d.cx + d.r, top: d.cy - d.r, bottom: d.cy + d.r });
}
function trim(x1, y1, x2, y2, r1, r2) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  return [x1 + dx / L * r1, y1 + dy / L * r1, x2 - dx / L * r2, y2 - dy / L * r2];
}
function hexToRgb(h) {
  const s = h.replace('#', '').trim();
  const n = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [parseInt(n.slice(0, 2), 16) || 45, parseInt(n.slice(2, 4), 16) || 74, parseInt(n.slice(4, 6), 16) || 122];
}
function hexA(hex, a) {
  if (hex.startsWith('rgb')) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** A rounded rect drawn as if with a straightedge and a shaky hand. */
function roundedWobbleRect(seed, x, y, w, h, r) {
  let s = seed || 1;
  const n = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296 - 0.5) * 5; };
  const P = (px, py) => `${(px + n()).toFixed(1)} ${(py + n()).toFixed(1)}`;
  return `M${P(x + r, y)} L${P(x + w - r, y)} Q${P(x + w, y)} ${P(x + w, y + r)}
          L${P(x + w, y + h - r)} Q${P(x + w, y + h)} ${P(x + w - r, y + h)}
          L${P(x + r, y + h)} Q${P(x, y + h)} ${P(x, y + h - r)}
          L${P(x, y + r)} Q${P(x, y)} ${P(x + r, y)} Z`;
}
