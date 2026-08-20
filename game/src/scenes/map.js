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
import { NodeType, TERMS } from '../data/schema.js';
import {
  generateRegionMap, regionMeta, blueprintPlan,
  NODE_INFO, sceneForNode, legalNextIds, reachableFrom, hazardById,
} from '../state/mapgen.js';
import { createMapNode, nodeSymbol, hazardSymbol, inkLine, seedOf, escapeHtml } from '../ui/mapnode.js';

/* The sheet is always the same height; its width follows the region's blueprint
   section, so a broad glass complex gets a broad sheet and a vertical shaft gets
   a narrow one, and the plan fills its own paper. */
const SHEET_H = 1180, SHEET_W = 2030;
/** The drawn "plan window" the architecture is printed inside. */
const WIN = { x: 74, y: 66, w: SHEET_W - 148, h: 950 };
const NODE_R  = 44;
const BOSS_R  = 62;
const CSS_HREF = 'src/scenes/map.css';

const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII'];

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
    await this._css();

    this._buildModel(params);
    this._crop = blueprintPlan(this.model.regionId, WIN.w / WIN.h);
    try { this._section = await ctx.assets.image(this._crop.url); }
    catch { this._section = null; }
    this._sheetSize();
    this._buildDom();

    // Paper first (it is the slow bit), then everything drawn on top of it.
    await this._paintPaper();
    this._buildInk();
    this._buildNodes();
    this._buildMarginalia();

    this._fitView(true);
    this._syncStates();
    this._bindEvents();

    ctx.atmosphere?.setMood?.('blueprint');
    ctx.audio?.music?.('map', { fade: 1.2 });

    const walk = parseInt(params.walk, 10);
    if (Number.isFinite(walk) && walk > 0) this._prewalk(walk);

    if (!this.still) this._drawOn();
    else this.el.screen.classList.add('is-drawn');

    bus.emit('map:shown', { regionId: this.model.map.regionId, seed: this.model.seed });
  }

  async _css() {
    if (document.querySelector(`link[data-map-css]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = CSS_HREF; link.dataset.mapCss = '1';
    const done = new Promise(r => { link.onload = r; link.onerror = r; });
    document.head.appendChild(link);
    this._cssLink = link;
    await done;
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
      path: (run?.pathIds || []).slice(),
      hp: run?.hp ?? 68, maxHp: run?.maxHp ?? 80,
      gold: run?.gold ?? 137,
      relics: run?.relics ?? [
        { id: 'lucky-button', name: 'Lucky Button' },
        { id: 'chalk-stub', name: 'Chalk Stub' },
        { id: 'torch', name: 'Half a Torch' },
      ],
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
            <div class="map-curl" aria-hidden="true"></div>
          </div>
        </div>

        <div class="map-shade" aria-hidden="true"></div>
        <div class="map-lamp" aria-hidden="true"></div>
        <div class="map-lamp map-lamp--warm" aria-hidden="true"></div>
        <div class="map-grain" aria-hidden="true"></div>

        <!-- placeholder HUD strip: ui-chrome owns the real one -->
        <div class="map-hud" data-placeholder="hud">
          <div class="hud-l">
            <span class="hud-chip hud-hp" title="${TERMS.hp}">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path
                d="M12 21C7 17.2 3 14 3 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 9 2.6C21 14 17 17.2 12 21Z"/></svg>
              <b class="hud-hp-num">${m.hp}</b><i>/${m.maxHp}</i>
              <span class="hud-bar"><span style="width:${Math.round(m.hp / m.maxHp * 100)}%"></span></span>
            </span>
            <span class="hud-chip hud-gold" title="${TERMS.gold}">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></svg>
              <b>${m.gold}</b>
            </span>
            <span class="hud-keeps" title="${TERMS.relic}s">
              ${m.relics.map(r => `<i class="keep" title="${escapeHtml(r.name)}"></i>`).join('')}
            </span>
          </div>
          <div class="hud-r">
            <span class="hud-haunt">${TERMS.ascension} ${m.hauntLevel}</span>
            <span class="hud-cog" aria-hidden="true">⚙</span>
          </div>
        </div>

        <header class="map-banner">
          <span class="tape tape-l" aria-hidden="true"></span>
          <span class="tape tape-r" aria-hidden="true"></span>
          <div class="bn-roman">${ROMAN[meta.index] || meta.index}</div>
          <div class="bn-body">
            <h1>${escapeHtml(meta.name)}</h1>
            <p class="bn-form">${escapeHtml(meta.form)}</p>
            <p class="bn-meta">
              <span>Floor <b>${m.floor}</b> of 17</span>
              <span class="dot">·</span>
              <span>Boss: <b>${escapeHtml(meta.boss)}</b></span>
              <span class="dot">·</span>
              <span>Seed <b>${escapeHtml(String(m.seed))}</b></span>
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
      hpNum: q('.hud-hp-num'),
    };
    this.el.sheet.style.width = this.SW + 'px';
    this.el.sheet.style.height = this.SH + 'px';
    this._paintGrain();
  }

  // ───────────────────────────────────────────────────────── paper + ink ────
  _tok(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  async _paintPaper() {
    const cv = this.el.paper;
    const q = Math.min(1.6, Math.max(1, (devicePixelRatio || 1) * 1.15));
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

    // 8. the ink — lifted off the region's blueprint section
    await this._layInk(g, w, h, ink);

    // 9. drawn border, title block, compass, scale bar
    this._drawFurniture(g, w, h, ink, rng);
  }

  /** Extract blue linework from the section PNG and re-lay it on our parchment. */
  async _layInk(g, w, h, ink) {
    const img = this._section, crop = this._crop;
    if (!img || !img.width || !crop) return;

    const sw = crop.sw, sh = crop.sh;
    // a) native-res alpha extraction, over this region's window on the master
    const a = document.createElement('canvas'); a.width = sw; a.height = sh;
    const ag = a.getContext('2d', { willReadFrequently: true });
    ag.drawImage(img, crop.sx, crop.sy, sw, sh, 0, 0, sw, sh);
    const d = ag.getImageData(0, 0, sw, sh);
    const p = d.data;
    const rgb = hexToRgb(ink);
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gg = p[i + 1], b = p[i + 2];
      const blue = (b - r) / 255;                       // blue ink against warm paper
      const dark = 1 - (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
      let v = blue * 1.75 + Math.max(0, dark - 0.46) * 0.85;
      v = v <= 0 ? 0 : v >= 1 ? 1 : v;
      v = v * v * (3 - 2 * v);                          // smoothstep: tighten the edge
      p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2];
      p[i + 3] = Math.round(v * 255);
    }
    ag.putImageData(d, 0, 0);

    // b) Upscale near the final size, then re-threshold the alpha.  A smooth
    //    6-7x upscale turns 1px lines into grey mush; pushing the alpha back
    //    through a steep smoothstep recovers a hard edge, so what lands on the
    //    paper is crisp ink with a slightly irregular contour — which is what
    //    old drafting ink actually looks like.
    const k = Math.max(4, Math.min(8, Math.round(WIN.w / sw) + 1));
    const b1 = document.createElement('canvas'); b1.width = sw * k; b1.height = sh * k;
    const bg = b1.getContext('2d', { willReadFrequently: true });
    bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    bg.drawImage(a, 0, 0, sw * k, sh * k);
    const d2 = bg.getImageData(0, 0, b1.width, b1.height); const p2 = d2.data;
    const e0 = 0.30, e1 = 0.54, inv = 1 / (e1 - e0);
    for (let i = 3; i < p2.length; i += 4) {
      let v = (p2[i] / 255 - e0) * inv;
      v = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
      p2[i] = (v * 255) | 0;
    }
    bg.putImageData(d2, 0, 0);

    // c) cover-fit into the plan window and clip.  The window is a drawn frame,
    //    so a wing running off the edge reads as "this sheet shows this much"
    //    rather than as a cropped image.  The plan is GROUND, not figure — it
    //    sits under the pencilled route, never competing with it.
    const scale = Math.max(WIN.w / (sw * k), WIN.h / (sh * k));
    const dw = sw * k * scale, dh = sh * k * scale;
    const dx = WIN.x + (WIN.w - dw) / 2;
    const dy = WIN.y + (WIN.h - dh) / 2;
    g.save();
    g.beginPath(); g.rect(WIN.x, WIN.y, WIN.w, WIN.h); g.clip();
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingQuality = 'high';
    g.globalAlpha = 0.24;                                     // soft under-bleed
    g.drawImage(b1, dx - 1.8, dy + 1.8, dw, dh);
    g.globalAlpha = 0.86;                                     // the linework itself
    g.drawImage(b1, dx, dy, dw, dh);
    g.restore();
    this._plan = { dx, dy, dw, dh };
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
    g.lineWidth = 1.2;
    spike(0, rr - 12, 9, true); spike(Math.PI, rr - 12, 9, false);
    spike(Math.PI / 2, rr - 20, 7, false); spike(-Math.PI / 2, rr - 20, 7, false);
    g.fillStyle = hexA(ink, 0.85); g.font = '600 15px Cinzel, Georgia, serif';
    g.textAlign = 'center'; g.fillText('N', 0, -rr - 13);
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
    const c = document.createElement('canvas'); c.width = c.height = 180;
    const g = c.getContext('2d');
    const d = g.createImageData(180, 180); const p = d.data;
    const rng = new RNG(9137);
    for (let i = 0; i < p.length; i += 4) {
      const v = 118 + (rng.next() - 0.5) * 150;
      p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    this.el.grain.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
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
      <marker id="mm-arrow" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7"
              orient="auto-start-reverse">
        <path d="M1 1 L11 6 L1 11 L3.6 6 Z" fill="currentColor"/>
      </marker>
    </defs>`);

    // hazard wings, under the route
    parts.push('<g class="mi-zones">');
    for (const hz of map.hazards) {
      const x = hz.rect.x0 * this.SW, y = hz.rect.y0 * this.SH;
      const w = (hz.rect.x1 - hz.rect.x0) * this.SW, h = (hz.rect.y1 - hz.rect.y0) * this.SH;
      const s = seedOf(hz.id + map.regionId);
      parts.push(`<g class="mi-zone mi-zone--${hz.kind}" data-hz="${hz.id}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22"
              fill="url(#${hz.kind === 'boon' ? 'mm-dots' : 'mm-hatch'})"/>
        <path class="mi-zone-edge" d="${roundedWobbleRect(s, x, y, w, h, 22)}"/>
        <g class="mi-zone-tab" transform="translate(${x + 16} ${y - 4})">
          <rect x="0" y="-27" rx="4" width="${Math.min(w - 26, 20 + hz.name.length * 11.2)}" height="27"/>
          <text x="10" y="-8">${escapeHtml(hz.name.toUpperCase())}</text>
        </g>
      </g>`);
    }
    parts.push('</g>');

    // route edges
    parts.push('<g class="mi-edges">');
    for (const e of map.edges) {
      const a = m.byId.get(e.from), b = m.byId.get(e.to);
      if (!a || !b) continue;
      const ra = a.type === NodeType.BOSS ? BOSS_R : NODE_R;
      const rb = b.type === NodeType.BOSS ? BOSS_R : NODE_R;
      const [x1, y1, x2, y2] = trim(a.x * this.SW, a.y * this.SH, b.x * this.SW, b.y * this.SH, ra + 6, rb + 8);
      const d = inkLine(seedOf(e.from + e.to), x1, y1, x2, y2, 11, 9);
      parts.push(`<path class="mi-edge" data-from="${e.from}" data-to="${e.to}"
        d="${d}" style="animation-delay:${(0.10 + a.row * 0.026).toFixed(3)}s"/>`);
    }
    parts.push('</g>');

    // the way in: short pencil arrows off the west edge into the first rooms
    parts.push('<g class="mi-entries">');
    for (const id of map.startIds) {
      const n = m.byId.get(id); if (!n) continue;
      const x = n.x * this.SW, y = n.y * this.SH;
      const x0 = WIN.x + 16;
      const d = inkLine(seedOf('in' + id), x0, y + 14, x - NODE_R - 14, y, 5, 6);
      parts.push(`<path class="mi-entry" d="${d}" marker-end="url(#mm-arrow)"/>`);
    }
    const sx = map.startIds.map(i => m.byId.get(i)).filter(Boolean);
    if (sx.length) {
      const my = sx.reduce((a, n) => a + n.y, 0) / sx.length * this.SH;
      parts.push(`<text class="mi-in" transform="translate(${WIN.x - 16} ${my.toFixed(0)}) rotate(-90)">THE WAY IN</text>`);
    }
    parts.push('</g>');

    // "you are here" pin ring, positioned later
    parts.push('<g class="mi-here" style="display:none"><circle class="mi-here-a" r="48"/><circle class="mi-here-b" r="58"/></g>');

    this.el.ink.innerHTML = parts.join('');
    this.el.ink.style.color = this._inkColor || '#2d4a7a';
    this._edges = [...this.el.ink.querySelectorAll('.mi-edge')];
    for (const p of this._edges) {
      const L = p.getTotalLength();
      p.style.setProperty('--len', L.toFixed(1));
    }
  }

  _buildNodes() {
    const m = this.model;
    const frag = document.createDocumentFragment();
    this._nodeEls = new Map();
    for (const n of m.map.nodes) {
      const el = createMapNode(n, NODE_INFO[n.type]);
      el.style.left = (n.x * this.SW) + 'px';
      el.style.top = (n.y * this.SH) + 'px';
      el.style.setProperty('--delay', (0.20 + n.row * 0.026).toFixed(3) + 's');
      this._nodeEls.set(n.id, el);
      frag.appendChild(el);
    }
    this.el.nodes.appendChild(frag);
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

    const order = [NodeType.SCUFFLE, NodeType.BIG_SCARE, NodeType.CURIOSITY, NodeType.TREASURE,
                   NodeType.SAFE, NodeType.SHOP, NodeType.RESCUE, NodeType.UNKNOWN, NodeType.BOSS];
    this.el.legend.innerHTML = `
      <span class="lg-h">Key</span>
      ${order.map(t => `<span class="lg-i"><span class="lg-ico">${nodeSymbol(t, 19)}</span>${NODE_INFO[t].label}</span>`).join('')}`;
  }

  // ────────────────────────────────────────────────────────────── states ───
  _syncStates() {
    const m = this.model;
    const legal = new Set(this._legal());
    const reach = reachableFrom(m.map, m.currentId);
    // depth runs left→right, so the choice you are making is a vertical one
    this._legalIds = [...legal].sort((a, b) =>
      (m.byId.get(a)?.y ?? 0) - (m.byId.get(b)?.y ?? 0));

    for (const [id, el] of this._nodeEls) {
      const n = m.byId.get(id);
      const isVisited = m.visited.has(id);
      const isCurrent = id === m.currentId;
      const isLegal = legal.has(id);
      const isReach = reach.has(id) || isCurrent || isLegal || (!m.currentId && n.row === 0);
      el.classList.toggle('is-visited', isVisited);
      el.classList.toggle('is-current', isCurrent);
      el.classList.toggle('is-legal', isLegal);
      el.classList.toggle('is-dim', !isLegal && !isCurrent && !isVisited && !isReach);
      el.classList.toggle('is-far', !isLegal && !isCurrent && !isVisited && isReach);
      el.tabIndex = isLegal ? 0 : -1;
      el.setAttribute('aria-disabled', isLegal ? 'false' : 'true');
    }

    const walkedPairs = new Set();
    for (let i = 1; i < m.path.length; i++) walkedPairs.add(m.path[i - 1] + '>' + m.path[i]);
    for (const p of this._edges) {
      const f = p.dataset.from, t = p.dataset.to;
      const walked = walkedPairs.has(f + '>' + t);
      const open = f === m.currentId || (!m.currentId && m.map.byRow0?.has?.(f));
      const live = open || (reach.has(f) && reach.has(t)) ||
                   (!m.currentId && m.map.startIds.includes(f));
      p.classList.toggle('is-walked', walked);
      p.classList.toggle('is-open', !walked && f === m.currentId);
      p.classList.toggle('is-dead', !walked && !live && !!m.currentId);
      p.setAttribute('marker-end', (!walked && f === m.currentId) ? 'url(#mm-arrow)' : '');
    }

    this.el.screen.classList.toggle('is-underway', !!m.currentId);

    // you-are-here ring
    const here = this.el.ink.querySelector('.mi-here');
    const cur = m.currentId && m.byId.get(m.currentId);
    if (cur) {
      here.style.display = '';
      here.setAttribute('transform', `translate(${cur.x * this.SW} ${cur.y * this.SH})`);
    } else here.style.display = 'none';

    if (!this._focusId || !legal.has(this._focusId)) this._focusId = this._legalIds[0] || null;
    this._markFocus();
  }

  _markFocus() {
    for (const [id, el] of this._nodeEls) el.classList.toggle('is-kbd', id === this._focusId);
  }

  // ─────────────────────────────────────────────────────────── the ink-on ──
  _drawOn() {
    this.el.screen.classList.add('is-drawing');
    // total budget 900ms; the class flip lets CSS run the staggered keyframes
    clock.wait(0.90).then(() => {
      this.el.screen.classList.remove('is-drawing');
      this.el.screen.classList.add('is-drawn');
    });
  }

  // ───────────────────────────────────────────────────────── view control ──
  _fitView(instant) {
    const vp = this.el.viewport.getBoundingClientRect();
    const fit = Math.min((vp.width - 96) / this.SW, (vp.height - 72) / this.SH);
    this.view.minZ = Math.max(0.28, fit * 0.85);
    this.view.maxZ = 2.4;
    const z = clampN(fit, this.view.minZ, this.view.maxZ);
    this.view.z = this.view.tz = z;
    this.view.x = (vp.width - this.SW * z) / 2;
    this.view.y = (vp.height - this.SH * z) / 2;
    this._fitZoom = z;
    this._applyView(instant);
  }

  _clampPan() {
    const vp = this.el.viewport.getBoundingClientRect();
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
    this.el.screen.classList.toggle('is-close', v.z > (this._fitZoom || 1) * 1.22);
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
    const vp = this.el.viewport.getBoundingClientRect();
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

    // pan
    on(el.viewport, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      this._drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
      this._movedFar = false;
      el.viewport.setPointerCapture?.(e.pointerId);
      el.screen.classList.add('is-grabbing');
    });
    on(window, 'pointermove', (e) => {
      this.lamp.tx = e.clientX; this.lamp.ty = e.clientY;
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      if (Math.hypot(dx, dy) > 5) this._movedFar = true;
      this.view.x = this._drag.vx + dx; this.view.y = this._drag.vy + dy;
      this._applyView();
    }, { passive: true });
    const endDrag = () => { this._drag = null; el.screen.classList.remove('is-grabbing'); };
    on(window, 'pointerup', endDrag);
    on(window, 'pointercancel', endDrag);

    // zoom
    on(el.viewport, 'wheel', (e) => {
      e.preventDefault();
      const r = el.viewport.getBoundingClientRect();
      this._zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });

    // keyboard
    on(window, 'keydown', (e) => this._key(e));
    on(window, 'resize', () => { this._fitView(true); }, { passive: true });

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
      case '0': this._fitView(true); break;
      case 'l': case 'L': this.el.screen.classList.toggle('no-bar'); break;
      default: return;
    }
  }
  _zoomCentre(f) {
    const r = this.el.viewport.getBoundingClientRect();
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
    const depth = n.type === NodeType.BOSS
      ? 'The end of this wing'
      : `Row ${n.row + 1} of ${this.model.map.rows}`;

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
      <p class="tip-foot">${depth}${visited ? ' · already walked'
        : legal ? ' · <b>you may go here</b>' : ' · not reachable from here'}</p>`;

    const r = anchor.getBoundingClientRect();
    const t = this.el.tip;
    t.setAttribute('aria-hidden', 'false');
    t.classList.add('is-on');
    const tw = t.offsetWidth || 300, th = t.offsetHeight || 150;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 14;
    if (y < 78) y = r.bottom + 14;
    x = clampN(x, 14, innerWidth - tw - 14);
    y = clampN(y, 14, innerHeight - th - 14);
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
    if (!m.path.length && m.currentId) m.path.push(m.currentId);
    if (m.currentId) m.path.push(id); else m.path = [id];
    m.currentId = id;

    if (m.run) {
      m.run.currentNodeId = id;
      m.run.visitedIds = [...m.visited];
      m.run.pathIds = m.path.slice();
      if (typeof m.run.chooseNode === 'function') { m.run.chooseNode(node); return; }
      this.ctx.scenes?.go?.(sceneForNode(node), { node: id, region: m.regionId });
      return;
    }

    // standalone: stay on the map, mark it up, keep playing
    this.ctx.audio?.play?.('map/step');
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
      if (this.model.currentId) this.model.path.push(pick);
      else this.model.path = [pick];
      this.model.currentId = pick;
      this._syncStates();
    }
    this._lookAt(this.model.byId.get(this.model.currentId), 0);
  }

  // ─────────────────────────────────────────────────────────────── frame ───
  update(dt, t) {
    // lamp follows the cursor with a little lag, and breathes like a real flame
    const l = this.lamp;
    const k = this.still ? 1 : 1 - Math.pow(0.001, dt);
    l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k;
    const flick = this.still ? 1 : 1 + Math.sin(t * 7.3) * 0.018 + Math.sin(t * 17.1) * 0.011;
    const tr = `translate3d(${(l.x).toFixed(1)}px, ${(l.y).toFixed(1)}px, 0) scale(${flick.toFixed(4)})`;
    if (this.el?.lamp) { this.el.lamp.style.transform = tr; this.el.lampWarm.style.transform = tr; }
  }

  // ──────────────────────────────────────────────────────────────── exit ───
  async exit() {
    for (const off of this._off) { try { off(); } catch {} }
    this._off.length = 0;
    this._nodeEls?.clear();
    this._edges = null;
    if (this.el?.paper) { this.el.paper.width = this.el.paper.height = 0; }
    this._cssLink?.remove(); this._cssLink = null;
    this.el = null; this.model = null;
  }
}

// ── little maths ─────────────────────────────────────────────────────────────
function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
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
