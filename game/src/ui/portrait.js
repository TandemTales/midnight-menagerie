/**
 * Shared companion / kid portrait + ornament kit.
 * OWNER: frontend agent.
 *
 * Everything the pre-run screens draw that is *art* rather than *layout* lives here:
 * companion portrait plates (with pointer parallax + spectral shimmer), procedurally
 * generated Kid portraits, the MIDNIGHT MENAGERIE logo cartouche, and the filigree /
 * cobweb / candle / bat ornaments that give the mansion its character.
 *
 * No hex literals: every colour is a token from ui/tokens.css, or derived from one
 * with color-mix() in the owning stylesheet. SVG here inherits `currentColor` or uses
 * CSS custom properties so the stylesheet stays in charge.
 */

import { COMPANIONS, KIDS } from '../data/schema.js';

// ── stylesheet loading ──────────────────────────────────────────────────────
// index.html is owned by the lead and only links tokens.css + base.css, so scene
// stylesheets attach themselves on first use. Idempotent, and resolves once loaded
// so a scene can await it and never render a single unstyled frame.
const _css = new Map();
export function ensureCss(href) {
  const url = String(href);
  if (_css.has(url)) return _css.get(url);
  const p = new Promise((resolve) => {
    const existing = document.querySelector(`link[data-mmcss="${CSS.escape(url)}"]`);
    if (existing) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.mmcss = url;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
    // never let a missing stylesheet stall a scene
    setTimeout(resolve, 1200);
  });
  _css.set(url, p);
  return p;
}

/** Wait for the display webfonts so SVG/text measurement is stable. Never rejects. */
export function fontsReady(timeout = 1500) {
  return Promise.race([
    (document.fonts?.ready ?? Promise.resolve()).catch(() => {}),
    new Promise((r) => setTimeout(r, timeout)),
  ]);
}

// ── asset paths ─────────────────────────────────────────────────────────────
const ASSETS = new URL('../../assets/', import.meta.url).href;
export const PORTRAIT_W = 828;
export const PORTRAIT_H = 516;
export const PORTRAIT_ASPECT = PORTRAIT_W / PORTRAIT_H;

/** Companions that have a dedicated 768px hero render. */
export const HERO_ART = new Set(['bones', 'pipkin', 'taffy']);

/** Downscaled grid thumbnail. `variant`: '@1x' | '@2x' | '-card'. */
export function thumbSrc(slug, variant = '@2x') {
  return `${ASSETS}portraits/thumbs/${slug}${variant}.png`;
}
export function fullSrc(slug) { return `${ASSETS}portraits/${slug}.png`; }
export function heroSrc(slug) {
  return HERO_ART.has(slug) ? `${ASSETS}hero/${slug}.jpg` : thumbSrc(slug, '-card');
}
export function blueprintSrc(name = 'mansion') { return `${ASSETS}blueprint/${name}.png`; }

export const COMPANION_BY_SLUG = Object.fromEntries(COMPANIONS.map((c) => [c.slug, c]));
export const KID_BY_SLUG = Object.fromEntries(KIDS.map((k) => [k.slug, k]));

/** Region slug -> the name the fiction uses. */
export const REGION_NAMES = {
  'foyer': 'the Forgotten Foyer',
  'nursery': 'the Nursery',
  'sleeping-quarters': 'the Sleeping Quarters',
  'kitchens-cellars': 'the Kitchens & Cellars',
  'greenhouse': 'the Greenhouse',
  'graveyard': 'the Graveyard',
  'study-library': 'the Study & Library',
  'attic-observatory': 'the Attic & Observatory',
  'lampworks': 'the Lampworks',
  'ballroom': 'the Ballroom',
  'crypt': 'the Crypt',
  'hedge-maze': 'the Hedge Maze',
  'secret-passages': 'the Secret Passages',
  'bathhouse': 'the Bathhouse',
  'kennels': 'the Kennels',
  'pumpkin-grounds': 'the Pumpkin Grounds',
  'heart': 'the Heart of the House',
};

// ── motion preferences ──────────────────────────────────────────────────────
let _reduceMotion = false;
export function setReduceMotion(v) {
  _reduceMotion = !!v;
  document.documentElement.classList.toggle('mm-reduce-motion', _reduceMotion);
  if (_reduceMotion) parallax.reset();
}
export function reduceMotion() { return _reduceMotion; }

// ── pointer parallax ────────────────────────────────────────────────────────
/**
 * One pointermove listener and one rAF for the whole app, no matter how many
 * portraits are on screen. Each registered element declares a depth; the manager
 * lerps toward the pointer and writes a single composited transform per element.
 * Writes only — never reads layout — so this cannot thrash.
 */
class ParallaxManager {
  constructor() {
    this.items = new Set();
    this.tx = 0; this.ty = 0;   // target, -1..1
    this.cx = 0; this.cy = 0;   // current
    this.raf = 0;
    this._bound = false;
    this._onMove = (e) => {
      this.tx = (e.clientX / Math.max(innerWidth, 1)) * 2 - 1;
      this.ty = (e.clientY / Math.max(innerHeight, 1)) * 2 - 1;
    };
    this._onLeave = () => { this.tx = 0; this.ty = 0; };
  }
  add(el, depth = 1, scale = 1.06) {
    this.items.add({ el, depth, scale });
    this._bind();
    return () => this.remove(el);
  }
  remove(el) {
    for (const it of this.items) if (it.el === el) this.items.delete(it);
    if (!this.items.size) this._unbind();
  }
  reset() {
    this.tx = this.ty = this.cx = this.cy = 0;
    for (const it of this.items) it.el.style.transform = '';
  }
  _bind() {
    if (this._bound) return;
    this._bound = true;
    addEventListener('pointermove', this._onMove, { passive: true });
    addEventListener('pointerleave', this._onLeave, { passive: true });
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (_reduceMotion) return;
      this.cx += (this.tx - this.cx) * 0.075;
      this.cy += (this.ty - this.cy) * 0.075;
      if (Math.abs(this.cx - this.tx) < 0.0008 && Math.abs(this.cy - this.ty) < 0.0008) {
        this.cx = this.tx; this.cy = this.ty;
      }
      for (const it of this.items) {
        const d = it.depth;
        it.el.style.transform =
          `translate3d(${(-this.cx * 9 * d).toFixed(2)}px,${(-this.cy * 6 * d).toFixed(2)}px,0) scale(${it.scale})`;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
  _unbind() {
    if (!this._bound) return;
    this._bound = false;
    removeEventListener('pointermove', this._onMove);
    removeEventListener('pointerleave', this._onLeave);
    cancelAnimationFrame(this.raf);
  }
}
export const parallax = new ParallaxManager();

// ── small DOM helper ────────────────────────────────────────────────────────
export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

// ── companion portrait plate ────────────────────────────────────────────────
/**
 * A framed companion portrait. Returns { el, destroy }.
 *  slug     companion slug
 *  variant  thumbnail variant ('@2x' grid, '-card' hero, 'hero' full render)
 *  locked   render as an un-rescued silhouette
 *  parallax depth multiplier; 0 disables
 *  shimmer  add the drifting spectral sheen layer
 */
export function companionPortrait({
  slug, variant = '@2x', locked = false, parallax: depth = 1, shimmer = true, alt,
} = {}) {
  const c = COMPANION_BY_SLUG[slug];
  const wrap = el('div', 'pf' + (locked ? ' is-locked' : ''));
  wrap.dataset.companion = slug;

  const inner = el('div', 'pf__inner');
  const img = document.createElement('img');
  img.className = 'pf__img';
  img.decoding = 'async';
  img.loading = 'eager';
  img.draggable = false;
  if (variant === 'hero') {
    img.src = heroSrc(slug);
    const square = HERO_ART.has(slug);
    img.width = square ? 768 : 560;
    img.height = square ? 768 : Math.round(560 / PORTRAIT_ASPECT);
  } else if (variant === '-card') {
    img.src = thumbSrc(slug, '-card'); img.width = 560; img.height = 349;
  } else if (variant === '@1x') {
    img.src = thumbSrc(slug, '@1x'); img.width = 240; img.height = 150;
  } else {
    img.src = thumbSrc(slug, '@2x'); img.width = 480; img.height = 299;
  }
  img.alt = alt ?? (locked ? `${c?.name ?? slug} — not yet rescued` : `${c?.name ?? slug}, ${c?.title ?? ''}`);
  img.addEventListener('error', () => { img.src = fullSrc(slug); }, { once: true });
  inner.appendChild(img);
  wrap.appendChild(inner);

  if (shimmer && !locked) wrap.appendChild(el('div', 'pf__shimmer'));
  wrap.appendChild(el('div', 'pf__vig'));
  if (locked) {
    wrap.appendChild(svg(`<div class="pf__lock">
      <svg viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2c-6.1 0-11 4.9-11 11v6H6a2 2 0 0 0-2 2v23a2 2 0 0 0 2 2h28a2 2 0 0 0 2-2V21a2 2 0 0 0-2-2h-3v-6c0-6.1-4.9-11-11-11Zm0 5a6 6 0 0 1 6 6v6H14v-6a6 6 0 0 1 6-6Z"/></svg>
    </div>`));
  }

  let off = null;
  if (depth && !_reduceMotion) off = parallax.add(inner, depth, 1.055 + depth * 0.012);
  return {
    el: wrap,
    destroy() { off?.(); off = null; },
  };
}

// ── ornaments ───────────────────────────────────────────────────────────────
// These return SVG *fragments* (a <g>), not standalone <svg> roots: a nested <svg>
// with no width/height defaults to 300x150 and destroys the parent's coordinate
// space. Callers place them with a transform inside their own <svg>.

/**
 * Half of a filigree scroll, drawn as strokes inside a 160x80 box with the
 * attachment point at (0,40). Mirror with scale(-1,1) for the other side.
 */
export const FILIGREE_STEM =
  'M0 45C44 44 62 20 98 18c26-1.5 43 10 40 24-2.5 11.5-17 15-23 6-5-7.5 2-16 10-13 4.5 1.5 5 6 3 8'
  + 'M0 45c40 1 56 23 88 27 24 3 40-4 40-15 0-9-10-13-16-7-5 5-2 12 4 11'
  + 'M2 45C12 44 16 36 13 30';
export const FILIGREE_LEAF =
  'M34 42C46 26 62 20 78 22 66 34 50 41 34 42Z'
  + 'M34 48c12 14 26 21 42 20-12-11-26-19-42-20Z';

export function filigree(cls = '') {
  return `<g class="orn-fil ${cls}" aria-hidden="true">
    <path class="orn-fil__stem" d="${FILIGREE_STEM}"/>
    <path class="orn-fil__leaf" d="${FILIGREE_LEAF}"/>
    <circle class="orn-fil__berry" cx="127" cy="42" r="2.2"/>
    <circle class="orn-fil__berry" cx="118" cy="57" r="1.9"/>
  </g>`;
}

/** Bat silhouette, wings spread, inside a 100x40 box. */
export const BAT_PATH =
  'M50 9c-2.4 0-4.2 1.8-5.2 4.2C41.4 8.6 35.6 5.6 29 5.6c-4.2 0-8 1.2-11.2 3.4 2.8-.6 5.4.2 7 2.2'
  + '-5.4 1.2-9.8 5-11.8 10.2 3.6-3 7.8-4 12-2.4-3.2 2.8-5 7-4.4 11.4 2.8-5 8-7.6 13.6-6.8'
  + '3.6.6 6.4 2.8 8.2 6 1.8-3.4 4.6-5.4 7.6-5.4s5.8 2 7.6 5.4c1.8-3.2 4.6-5.4 8.2-6'
  + '5.6-.8 10.8 1.8 13.6 6.8.6-4.4-1.2-8.6-4.4-11.4 4.2-1.6 8.4-.6 12 2.4-2-5.2-6.4-9-11.8-10.2'
  + '1.6-2 4.2-2.8 7-2.2C79.2 6.8 75.4 5.6 71.2 5.6c-6.6 0-12.4 3-15.8 7.6C54.4 10.8 52.6 9 50 9Z';

export function bat(cls = '') {
  return `<g class="orn-bat ${cls}" aria-hidden="true"><path d="${BAT_PATH}"/></g>`;
}

/** Corner cobweb: radial spokes + sagging catenary threads. */
export function cobweb(cls = '', rings = 5, spokes = 7) {
  const R = 200;
  let d = '';
  for (let i = 0; i < spokes; i++) {
    const a = (i / (spokes - 1)) * (Math.PI / 2);
    d += `M0 0L${(Math.cos(a) * R).toFixed(1)} ${(Math.sin(a) * R).toFixed(1)}`;
  }
  let arcs = '';
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * R * 0.94;
    let p = '';
    for (let i = 0; i < spokes - 1; i++) {
      const a0 = (i / (spokes - 1)) * (Math.PI / 2);
      const a1 = ((i + 1) / (spokes - 1)) * (Math.PI / 2);
      const am = (a0 + a1) / 2;
      const sag = rad * 0.82;
      const x0 = Math.cos(a0) * rad, y0 = Math.sin(a0) * rad;
      const x1 = Math.cos(a1) * rad, y1 = Math.sin(a1) * rad;
      const xm = Math.cos(am) * sag, ym = Math.sin(am) * sag;
      p += `${i === 0 ? `M${x0.toFixed(1)} ${y0.toFixed(1)}` : ''}Q${xm.toFixed(1)} ${ym.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    arcs += `<path d="${p}"/>`;
  }
  return `<svg class="orn-web ${cls}" viewBox="0 0 200 200" aria-hidden="true">
    <g class="orn-web__spokes"><path d="${d}"/></g>
    <g class="orn-web__rings">${arcs}</g>
  </svg>`;
}

/** Brass candlestick with a live flame. Flame animation is CSS. */
export function candle(cls = '') {
  return `<div class="orn-candle ${cls}" aria-hidden="true">
    <div class="orn-candle__halo"></div>
    <div class="orn-candle__flame"><i></i><b></b></div>
    <svg class="orn-candle__body" viewBox="0 0 60 190">
      <path class="wax" d="M21 40h18c1.6 0 3 1.3 3 3v104H18V43c0-1.7 1.3-3 3-3Z"/>
      <path class="drip" d="M20 62c3 8 1 15 3 22s-1 12 1 18V70Zm20 6c-3 9-1 14-3 21s1 11-1 17V74Z"/>
      <path class="brass" d="M12 147h36l4 9H8Zm7 9h22l-3 16H22Zm-2 16h26c5 0 9 3 9 7H8c0-4 4-7 9-7Z"/>
      <path class="brass2" d="M4 179h52c2 0 3 1.4 3 3v5c0 1.7-1.3 3-3 3H4c-1.7 0-3-1.3-3-3v-5c0-1.6 1.3-3 3-3Z"/>
      <path class="wick" d="M29 34h2v8h-2Z"/>
    </svg>
  </div>`;
}

// ── the logo ────────────────────────────────────────────────────────────────
/**
 * MIDNIGHT MENAGERIE, matching UI/selectCompanion.png: an ornate serif wordmark in a
 * purple/silver gradient on a dark oval cartouche with filigree scrollwork, bats and
 * cobwebs. Text is real DOM so it stays crisp and selectable by a11y tooling; the
 * cartouche and ornaments are SVG.
 *
 *  size    'hero' | 'md' | 'sm'
 *  plaque  optional sub-banner text ('MENAGERIE COMPANIONS')
 */
export function logoLockup({ size = 'hero', plaque = null, id = 'mm-logo' } = {}) {
  const uid = `${id}-${Math.random().toString(36).slice(2, 7)}`;
  const node = el('div', `mm-logo mm-logo--${size}`);
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', 'Midnight Menagerie');

  node.appendChild(svg(`
  <svg class="mm-logo__plate" viewBox="0 0 1400 360" aria-hidden="true">
    <defs>
      <radialGradient id="${uid}-oval" cx="50%" cy="40%" r="68%">
        <stop offset="0%"  class="s-oval-in"/>
        <stop offset="56%" class="s-oval-mid"/>
        <stop offset="100%" class="s-oval-out"/>
      </radialGradient>
      <linearGradient id="${uid}-rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   class="s-rim-hi"/>
        <stop offset="20%"  class="s-rim-lo"/>
        <stop offset="52%"  class="s-rim-hi"/>
        <stop offset="84%"  class="s-rim-lo"/>
        <stop offset="100%" class="s-rim-hi"/>
      </linearGradient>
      <filter id="${uid}-soft" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="22"/>
      </filter>
    </defs>

    <!-- the halo the cartouche sits in -->
    <ellipse class="mm-logo__halo" cx="700" cy="178" rx="640" ry="176" filter="url(#${uid}-soft)"/>

    <!-- outer scrollwork: arms off each tip, flourishes into the four corners.
         Drawn behind the oval, but placed so the visible mass sits outside it. -->
    <g class="mm-logo__vines">
      <g transform="translate(172,178) scale(-1.06,1.06) translate(0,-45)">${filigree()}</g>
      <g transform="translate(1228,178) scale(1.06,1.06) translate(0,-45)">${filigree()}</g>
      <g transform="translate(250,74)  rotate(-152) scale(.72) translate(0,-45)">${filigree()}</g>
      <g transform="translate(1150,74) rotate(-28)  scale(.72) translate(0,-45)">${filigree()}</g>
      <g transform="translate(250,282) rotate(152)  scale(.72) translate(0,-45)">${filigree()}</g>
      <g transform="translate(1150,282) rotate(28)  scale(.72) translate(0,-45)">${filigree()}</g>
    </g>

    <!-- the cartouche -->
    <ellipse class="mm-logo__oval" cx="700" cy="178" rx="556" ry="152" fill="url(#${uid}-oval)"/>
    <ellipse class="mm-logo__ring mm-logo__ring--out"  cx="700" cy="178" rx="556" ry="152" stroke="url(#${uid}-rim)"/>
    <ellipse class="mm-logo__ring mm-logo__ring--in"   cx="700" cy="178" rx="538" ry="137"/>
    <ellipse class="mm-logo__ring mm-logo__ring--hair" cx="700" cy="178" rx="528" ry="128"/>

    <!-- star dust inside the cartouche -->
    <g class="mm-logo__stars">
      <circle cx="266" cy="140" r="2.3"/><circle cx="318" cy="228" r="1.6"/>
      <circle cx="430" cy="76"  r="1.8"/><circle cx="960" cy="66"  r="2.0"/>
      <circle cx="1096" cy="212" r="1.7"/><circle cx="1132" cy="128" r="2.3"/>
      <circle cx="700" cy="46"  r="1.6"/><circle cx="812" cy="300" r="1.9"/>
      <circle cx="520" cy="300" r="1.5"/><circle cx="1010" cy="286" r="1.7"/>
      <circle cx="212" cy="178" r="1.8"/><circle cx="1188" cy="180" r="1.6"/>
      <circle cx="596" cy="52"  r="1.4"/><circle cx="380" cy="272" r="1.4"/>
    </g>

    <!-- bats flanking the wordmark, as in the source plate -->
    <g class="mm-logo__bats">
      <g transform="translate(196,148) scale(.92)">${bat()}</g>
      <g transform="translate(1116,142) scale(.80)">${bat()}</g>
      <g transform="translate(470,288) scale(.44)">${bat()}</g>
      <g transform="translate(860,292) scale(.36)">${bat()}</g>
    </g>
  </svg>`));

  const text = el('div', 'mm-logo__text');
  text.appendChild(el('span', 'mm-logo__top', 'Midnight'));
  text.appendChild(el('span', 'mm-logo__main', 'Menagerie'));
  node.appendChild(text);

  if (plaque) {
    node.appendChild(svg(`<div class="mm-logo__plaque"><span>&#9733;</span>${plaque}<span>&#9733;</span></div>`));
  }
  return node;
}

// ── procedural Kid portraits ────────────────────────────────────────────────
/**
 * No kid art exists. Each Kid gets a hand-tuned procedural portrait: a torch beam
 * cutting the dark, a distinct silhouette (hair shape, headgear, crutches, glasses),
 * a signature colour, and their missing pet's collar tag hanging in the beam.
 * Deterministic — the same kid always draws the same portrait.
 */
export const KID_LOOKS = {
  maya:   { hue: 'var(--kid-maya)',   hair: 'bob',      gear: 'crutch',   beam: 0.90 },
  mateo:  { hue: 'var(--kid-mateo)',  hair: 'curls',    gear: 'cap',      beam: 0.72 },
  amina:  { hue: 'var(--kid-amina)',  hair: 'puffs',    gear: 'scarf',    beam: 0.80 },
  eli:    { hue: 'var(--kid-eli)',    hair: 'shag',     gear: 'goggles',  beam: 0.66 },
  priya:  { hue: 'var(--kid-priya)',  hair: 'braid',    gear: 'glasses',  beam: 0.86 },
  jordan: { hue: 'var(--kid-jordan)', hair: 'fade',     gear: 'hoodie',   beam: 0.74 },
  lena:   { hue: 'var(--kid-lena)',   hair: 'longtie',  gear: 'headlamp', beam: 0.95 },
  lucy:   { hue: 'var(--kid-lucy)',   hair: 'pigtails', gear: 'backpack', beam: 0.62 },
};

const HAIR = {
  bob:      'M100 78c0-26 18-44 44-44s44 18 44 44c0 10-2 18-4 26-2-14-10-22-22-24-14-3-30-3-44 2-12 4-18 12-18 24-1-9 0-19 0-28Z',
  curls:    'M100 80c-2-24 16-46 44-46s46 20 44 46c-1 8-4 12-8 6-3-5-8-4-11 1-2 4-7 4-9-1-3-6-9-6-12 0-2 5-8 5-10 0-3-6-9-6-12 0-3 5-8 6-11 1-3-5-9-11-15-7Z',
  puffs:    'M112 74c0-22 14-40 32-40s32 18 32 40c0 6-1 11-3 16-1-12-8-19-19-21-11-3-24-3-35 1-5 2-7 5-7 10v-6Zm-24 8a17 17 0 1 1 34 0 17 17 0 0 1-34 0Zm112 0a17 17 0 1 1 34 0 17 17 0 0 1-34 0Z',
  shag:     'M98 86c-3-28 16-52 46-52s49 22 46 52c-1 8-5 9-8 3-3-7-8-9-11-3-3 5-8 5-11-1-3-7-9-7-13-1-4 5-10 4-13-2-3-7-10-8-14-2-3 5-9 8-13 3-3-4-8-3-9 3Z',
  braid:    'M104 78c0-24 17-44 40-44s40 20 40 44c0 8-1 15-3 21-2-15-9-23-22-26-13-2-27-2-39 3-9 4-14 10-16 19v-17Zm74 24c8 12 10 28 8 44-1 10-4 18-9 24 6-22 5-46-3-66l4-2Z',
  fade:     'M104 82c0-26 16-48 40-48s40 22 40 48c0 4 0 8-1 12-3-16-12-24-27-26-14-2-30-1-42 5-6 3-9 7-10 13v-4Z',
  longtie:  'M100 80c0-25 18-46 44-46s44 21 44 46v20c-3-18-11-28-26-31-16-3-33-2-46 4-9 4-14 11-16 20V80Zm-4 34c-4 26-4 54 2 80 2 8 6 14 10 17-9-30-11-64-6-95l-6-2Zm96 2c5 31 3 65-6 95 4-3 8-9 10-17 6-26 6-54 2-80l-6 2Z',
  pigtails: 'M108 78c0-24 16-44 38-44s38 20 38 44v14c-3-14-10-21-22-24-13-3-27-2-38 3-8 4-13 9-16 16V78Zm-22 16a20 20 0 1 1 40 0 20 20 0 0 1-40 0Zm120 0a20 20 0 1 1 40 0 20 20 0 0 1-40 0Z',
};

const GEAR = {
  crutch:   '<path class="kg" d="M232 176v96m-10-96h20m-16 30h12m-6 0v66"/><circle class="kg-d" cx="232" cy="176" r="7"/>',
  cap:      '<path class="kg-f" d="M96 74c4-24 24-40 48-40s44 16 48 40c1 6-2 9-8 9h-80c-6 0-9-3-8-9Z"/><path class="kg-f" d="M192 76h44c4 0 6 3 5 7-1 5-6 8-12 8h-37Z"/>',
  scarf:    '<path class="kg-f" d="M104 156c26 14 60 14 86 0l8 22c-32 18-70 18-102 0Z"/>',
  goggles:  '<path class="kg" d="M104 96h80"/><circle class="kg-l" cx="122" cy="98" r="15"/><circle class="kg-l" cx="166" cy="98" r="15"/><path class="kg" d="M137 98h14"/>',
  glasses:  '<circle class="kg-l" cx="124" cy="104" r="14"/><circle class="kg-l" cx="164" cy="104" r="14"/><path class="kg" d="M138 104h12m-40-4-14-6m82 6 14-6"/>',
  hoodie:   '<path class="kg-f" d="M78 190c6-40 30-62 66-62s60 22 66 62c-20-16-42-24-66-24s-46 8-66 24Z"/>',
  headlamp: '<path class="kg" d="M100 84h88"/><rect class="kg-d2" x="128" y="70" width="32" height="20" rx="5"/>',
  backpack: '<path class="kg-f" d="M64 208c0-22 12-36 28-40l6 44Zm160 0c0-22-12-36-28-40l-6 44Z"/>',
};

const PET_GLYPH = {
  cat:      'M12 26c-4-3-6-8-6-13l4 3 3-6 4 4h6l4-4 3 6 4-3c0 5-2 10-6 13Z',
  dog:      'M8 10 5 4l6 3h10l6-3-3 6c3 3 4 7 4 11 0 5-5 8-12 8s-12-3-12-8c0-4 1-8 4-11Z',
  rabbit:   'M11 16C9 11 8 6 10 3s5-1 6 3l1 7h2l1-7c1-4 4-6 6-3s1 8-1 13c3 2 5 5 5 8 0 5-4 8-9 8s-9-3-9-8c0-3 2-6 5-8Z',
  bird:     'M6 18c0-7 6-13 13-13 4 0 7 2 9 4l4-1-2 5c1 2 2 4 2 7 0 7-6 12-13 12S6 25 6 18Z',
  rat:      'M9 14a7 7 0 1 1 14 0c3 1 5 4 5 7 0 5-5 9-12 9S4 26 4 21c0-3 2-6 5-7Z',
  gecko:    'M6 20c0-6 5-11 11-11s11 5 11 11c0 4-2 7-5 9l3 5-6-3-3 3-3-3-6 3 3-5c-3-2-5-5-5-9Z',
  hamster:  'M16 5c7 0 12 6 12 13s-5 13-12 13S4 25 4 18 9 5 16 5Z',
  'guinea pig': 'M16 6c8 0 13 5 13 12s-6 13-13 13S3 25 3 18 8 6 16 6Z',
};
export function petGlyph(kind) {
  const k = String(kind || '').toLowerCase();
  if (PET_GLYPH[k]) return PET_GLYPH[k];
  if (k.includes('parrot') || k.includes('conure') || k.includes('bird')) return PET_GLYPH.bird;
  if (k.includes('cat')) return PET_GLYPH.cat;
  if (k.includes('dog') || k.includes('beagle')) return PET_GLYPH.dog;
  if (k.includes('rabbit')) return PET_GLYPH.rabbit;
  if (k.includes('rat') || k.includes('ferret')) return PET_GLYPH.rat;
  if (k.includes('gecko') || k.includes('lizard')) return PET_GLYPH.gecko;
  if (k.includes('hamster')) return PET_GLYPH.hamster;
  if (k.includes('guinea')) return PET_GLYPH['guinea pig'];
  return PET_GLYPH.cat;
}

/**
 * Build a Kid portrait SVG.
 *  kid  the record from KIDS, plus `petKind` and optional `look` overrides
 */
export function kidPortrait(kid, { w = 260, h = 300, tag = true } = {}) {
  const look = KID_LOOKS[kid.slug] || KID_LOOKS.maya;
  const hair = HAIR[look.hair] || HAIR.bob;
  const gear = GEAR[look.gear] || '';
  const uid = `kp-${kid.slug}`;
  return svg(`
<svg class="kidpf" viewBox="0 0 288 320" width="${w}" height="${h}" role="img"
     aria-label="${kid.name}, searching with a flashlight" style="--kid-hue:${look.hue}">
  <defs>
    <radialGradient id="${uid}-room" cx="50%" cy="34%" r="72%">
      <stop offset="0%" class="kp-room-in"/><stop offset="100%" class="kp-room-out"/>
    </radialGradient>
    <linearGradient id="${uid}-beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   class="kp-beam-a" stop-opacity="${look.beam * 0.72}"/>
      <stop offset="55%"  class="kp-beam-b" stop-opacity="${look.beam * 0.26}"/>
      <stop offset="100%" class="kp-beam-b" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${uid}-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" class="kp-rim-a"/><stop offset="100%" class="kp-rim-b"/>
    </linearGradient>
    <clipPath id="${uid}-clip"><rect x="0" y="0" width="288" height="320" rx="10"/></clipPath>
  </defs>

  <g clip-path="url(#${uid}-clip)">
    <rect width="288" height="320" fill="url(#${uid}-room)"/>
    <!-- wallpaper stripes so the dark has depth -->
    <g class="kp-paper">
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 34}" y="0" width="15" height="320"/>`).join('')}
    </g>
    <!-- floorboards -->
    <g class="kp-floor"><rect x="0" y="252" width="288" height="68"/>
      <path d="M0 252h288M0 272h288M0 294h288"/></g>

    <!-- torch beam -->
    <path class="kp-beam" d="M258 150 L288 96 L288 300 L150 320 Z" fill="url(#${uid}-beam)"/>

    <!-- the kid, backlit -->
    <g class="kp-figure" transform="translate(-6,10)">
      <path class="kp-body" d="M78 300c2-52 28-84 66-84s64 32 66 84Z"/>
      <path class="kp-body" d="M118 186h52v34h-52Z"/>
      <ellipse class="kp-head" cx="144" cy="122" rx="46" ry="52"/>
      <path class="kp-hair" d="${hair}"/>
      <ellipse class="kp-eye" cx="127" cy="128" rx="5.5" ry="6.5"/>
      <ellipse class="kp-eye" cx="161" cy="128" rx="5.5" ry="6.5"/>
      <path class="kp-rim" d="M186 92c14 12 22 30 22 48s-8 36-22 48" fill="none" stroke="url(#${uid}-rim)"/>
      ${gear}
    </g>

    <!-- flashlight -->
    <g class="kp-torch" transform="translate(224,150) rotate(-24)">
      <rect class="kp-torch-b" x="-8" y="0" width="20" height="44" rx="4"/>
      <rect class="kp-torch-h" x="-12" y="-14" width="28" height="18" rx="4"/>
      <circle class="kp-torch-l" cx="2" cy="-6" r="6"/>
    </g>
    <circle class="kp-glow" cx="226" cy="142" r="26"/>

    ${tag ? `
    <!-- the pet's collar tag, kept in the backpack -->
    <g class="kp-tag" transform="translate(44,214)">
      <path class="kp-tag-str" d="M18 -46c-6 14-4 28 2 40" fill="none"/>
      <circle class="kp-tag-d" cx="20" cy="0" r="20"/>
      <circle class="kp-tag-r" cx="20" cy="0" r="20"/>
      <circle class="kp-tag-h" cx="20" cy="-14" r="3.2"/>
      <g class="kp-tag-g" transform="translate(4,-16) scale(1.0)"><path d="${petGlyph(kid.petKind)}"/></g>
    </g>` : ''}
  </g>
  <rect class="kp-edge" x="1" y="1" width="286" height="318" rx="10" fill="none"/>
</svg>`);
}

// ── keyboard roving focus ───────────────────────────────────────────────────
/**
 * Grid/list arrow-key navigation with a visible focus ring. Returns a disposer.
 * `cols` 0 = linear list (up/down only).
 */
export function rovingFocus(container, selector, { cols = 0, wrap = true, onActivate } = {}) {
  const items = () => [...container.querySelectorAll(selector)].filter((n) => !n.hidden && !n.disabled);
  const onKey = (e) => {
    const list = items();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    let n = -1;
    const k = e.key;
    if (k === 'ArrowRight' || (cols === 0 && k === 'ArrowDown')) n = i + 1;
    else if (k === 'ArrowLeft' || (cols === 0 && k === 'ArrowUp')) n = i - 1;
    else if (cols > 0 && k === 'ArrowDown') n = i + cols;
    else if (cols > 0 && k === 'ArrowUp') n = i - cols;
    else if (k === 'Home') n = 0;
    else if (k === 'End') n = list.length - 1;
    else if ((k === 'Enter' || k === ' ') && i >= 0 && onActivate) { e.preventDefault(); onActivate(list[i], i); return; }
    else return;
    if (i < 0) n = 0;
    if (n < 0) n = wrap ? list.length - 1 : 0;
    if (n >= list.length) n = wrap ? 0 : list.length - 1;
    e.preventDefault();
    list[n]?.focus();
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

/** Format a seed as the game shows it: MM-XXXX-XXXX. */
export function formatSeed(seed) {
  const s = Math.abs(Number(seed) | 0).toString(36).toUpperCase().padStart(8, '0').slice(-8);
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
