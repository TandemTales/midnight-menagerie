/**
 * Title — the game's first impression.
 * The mansion at night: parallax sky, drifting motes, a lit house, candles on the sill,
 * the MIDNIGHT MENAGERIE cartouche, and a menu with real character.
 *
 * OWNER: frontend agent.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { COMPANIONS } from '../data/schema.js';
import {
  ensureCss, fontsReady, logoLockup, candle, cobweb, bat,
  el, svg, rovingFocus, setReduceMotion, reduceMotion,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';
import { openSettings } from '../ui/settings.js';

const CSS_KIT   = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_TITLE = new URL('./title.css', import.meta.url).href;

/* ── the house ─────────────────────────────────────────────────────────────
   Built from a small spec rather than hand-authored path soup so the windows,
   pickets and treeline stay editable. Deterministic: the same house every boot.

   Returns an ORDERED LIST of sibling <svg> layers rather than one SVG, because
   the warm glow has to live outside the mansion markup. See the `.ti-glow` note
   in title.css: a blurred SVG *child* whose opacity animates cannot be promoted
   to its own compositor layer, so Chromium re-rasterises the blur on the main
   thread every single frame — measured here as a 3.3 s long task on entry. As
   sibling <svg> elements they are ordinary HTML boxes, so the blur is rasterised
   once into a texture and the flicker is a pure compositor opacity animation.

   The layers keep the original paint order: base house -> door glow -> door ->
   window bloom. Nothing that used to sit above the glow overlaps it (the fence
   and the dead trees are well below and outside the lit windows), so the stack
   renders identically. */
function mansionSVG() {
  const W = 1600, H = 960, DROP = 200;   // DROP pushes the house down under the logo
  const layer = (cls, inner) =>
    `<svg class="${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">`
    + `<g transform="translate(0 ${DROP})">${inner}</g></svg>`;
  let s = '';

  // --- far treeline ---------------------------------------------------------
  const tree = (x, base, h, w) =>
    `M${x - w} ${base}L${x} ${base - h}L${x + w} ${base}Z` +
    `M${x - w * 0.82} ${base - h * 0.3}L${x} ${base - h * 1.12}L${x + w * 0.82} ${base - h * 0.3}Z`;
  let trees = '';
  let tseed = 7;
  const rnd = () => (tseed = (tseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let x = -40; x < W + 40; x += 34) {
    trees += tree(x + rnd() * 16, 640 + rnd() * 14, 90 + rnd() * 130, 20 + rnd() * 16);
  }
  s += `<path class="ms-trees" d="${trees}"/>`;

  // --- the mansion ----------------------------------------------------------
  const body = [
    // left wing
    'M300 640V430l40-34 40 34v210Z',
    'M380 640V392l104-76 104 76v248Z',
    // main block
    'M588 640V300l212-142 212 142v340Z',
    // right wing
    'M1012 640V392l104-76 104 76v248Z',
    'M1220 640V430l40-34 40 34v210Z',
  ].join('');
  s += `<path class="ms-body" d="${body}"/>`;

  // roof planes catch a little moonlight
  s += `<path class="ms-roof" d="M300 434l40-34 40 34-40 12Z
        M376 396l108-80 108 80-108 22Z
        M584 304l216-146 216 146-216 30Z
        M1008 396l108-80 108 80-108 22Z
        M1216 434l40-34 40 34-40 12Z"/>`;

  // --- the tower ------------------------------------------------------------
  s += `<path class="ms-body" d="M726 300V132h148v168Z"/>`;
  s += `<path class="ms-spire" d="M714 136 800 20l86 116Z"/>`;
  s += `<path class="ms-spire-hi" d="M800 20l86 116h-30Z"/>`;
  s += `<path class="ms-finial" d="M797 24h6v-16h-6Zm-8-16h22v-5h-22Z"/>`;
  // weather vane bat
  s += `<g class="ms-vane" transform="translate(770,-24) scale(.6)">${bat()}</g>`;

  // --- chimneys -------------------------------------------------------------
  s += `<path class="ms-chim" d="M470 316h44v-70h-44Zm-6-70h56v-14h-56Z
        M1090 316h44v-70h-44Zm-6-70h56v-14h-56Z
        M636 232h40v-56h-40Zm-6-56h52v-13h-52Z"/>`;

  // --- porch ----------------------------------------------------------------
  s += `<path class="ms-porch" d="M690 640V520h220v120Z"/>`;
  s += `<path class="ms-porch-roof" d="M666 524l134-58 134 58Z"/>`;
  s += `<path class="ms-col" d="M700 640V528h14v112Zm186 0V528h14v112Z"/>`;
  s += `<path class="ms-steps" d="M676 640h248l14 18H662Zm-16 18h280l14 18H646Z"/>`;

  // the door: the one warm rectangle in a cold house. Its halo is a layer of its
  // own (below the door, above the porch) so the blur can be promoted; see below.
  const doorGlow = `<path class="ms-doorglow" d="M756 640V556a44 44 0 0 1 88 0v84Z"/>`;
  const door =
    `<path class="ms-door" d="M760 640V558a40 40 0 0 1 80 0v82Z"/>`
    + `<path class="ms-doorsplit" d="M800 566v74"/>`;

  // --- windows --------------------------------------------------------------
  // [x, y, w, h, lit]
  const wins = [];
  const arch = (x, y, w, h) =>
    `M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}Z`;
  const rows = [
    { y: 344, xs: [612, 676, 740, 804, 868, 932], w: 40, h: 78 },
    { y: 458, xs: [612, 676, 740, 804, 868, 932], w: 40, h: 78 },
    { y: 250, xs: [700, 764, 828], w: 36, h: 62 },
    { y: 176, xs: [758], w: 44, h: 74 },   // tower
    { y: 430, xs: [406, 456, 506, 1054, 1104, 1154], w: 34, h: 66 },
    { y: 528, xs: [406, 456, 506, 1054, 1104, 1154], w: 34, h: 66 },
    { y: 470, xs: [316, 1236], w: 30, h: 58 },
    { y: 556, xs: [316, 1236], w: 30, h: 58 },
  ];
  let lseed = 19;
  const lr = () => (lseed = (lseed * 48271) % 2147483647) / 2147483647;
  let dark = '', frames = '';
  for (const r of rows) {
    for (const x of r.xs) {
      const litRoll = lr();
      const lit = litRoll > 0.58;
      const d = arch(x, r.y, r.w, r.h);
      if (lit) wins.push({ d, x: x + r.w / 2, y: r.y + r.h / 2, s: 0.7 + lr() * 0.6, delay: (lr() * 6).toFixed(2) });
      else dark += d;
      frames += `M${x + r.w / 2} ${r.y + 4}V${r.y + r.h}M${x} ${r.y + r.h * 0.62}h${r.w}`;
    }
  }
  s += `<path class="ms-win-dark" d="${dark}"/>`;
  s += `<g class="ms-win-lit">${wins.map((w) =>
    `<path d="${w.d}" style="--fl:${w.s};animation-delay:-${w.delay}s"/>`).join('')}</g>`;
  s += `<path class="ms-win-bar" d="${frames}"/>`;

  /* Warm bloom pooling out of the lit windows. Split across three promoted layers
     rather than one so the halos still flicker out of phase with each other — the
     per-ellipse animation-delay that used to do that is gone, because the whole
     point is that opacity now animates on the layer, not on its children. Three
     phases reads the same as sixteen; one would read as the house blinking. */
  const BLOOM_LAYERS = 3;
  const bloomGroups = Array.from({ length: BLOOM_LAYERS }, () => '');
  wins.forEach((w, i) => {
    bloomGroups[i % BLOOM_LAYERS] += `<ellipse cx="${w.x}" cy="${w.y}" rx="52" ry="46"/>`;
  });

  // --- fence ----------------------------------------------------------------
  let pickets = '';
  for (let x = -20; x < W + 20; x += 26) {
    pickets += `M${x} 760V666l7-12 7 12v94Z`;
  }
  s += `<path class="ms-fence" d="${pickets}M0 690h1600v10H0ZM0 726h1600v10H0Z"/>`;

  // --- dead trees, foreground ----------------------------------------------
  const branch = (x, y, a, len, depth) => {
    if (depth === 0 || len < 8) return '';
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    return `M${x.toFixed(1)} ${y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
      + branch(x2, y2, a - 0.45 - depth * 0.03, len * 0.7, depth - 1)
      + branch(x2, y2, a + 0.42 + depth * 0.02, len * 0.66, depth - 1);
  };
  s += `<path class="ms-deadtree" d="${branch(96, 764, -Math.PI / 2 - 0.14, 132, 6)}"/>`;
  s += `<path class="ms-deadtree" d="${branch(1512, 764, -Math.PI / 2 + 0.16, 118, 6)}"/>`;

  // --- ground ---------------------------------------------------------------
  const ground = `<path class="ms-ground" d="M0 700c180-26 320 10 480 4s300-32 470-22 300 40 470 26 180-8 180-8v100H-40Z"/>`;

  return [
    layer('mansion', ground + s),
    layer('ti-glow ti-glow--door', doorGlow),
    layer('mansion mansion--door', door),
    ...bloomGroups
      .filter(Boolean)
      .map((g, i) => layer(`ti-glow ti-glow--bloom ti-glow--b${i}`, g)),
  ];
}

/* ── menu definition ───────────────────────────────────────────────────────── */
function menuItems(hasRun) {
  const items = [];
  if (hasRun) items.push({ id: 'continue', label: 'Continue', hint: 'Return to the expedition in progress' });
  items.push({ id: 'new',       label: 'New Expedition', hint: 'Choose a Kid, a Companion, and go in' });
  items.push({ id: 'menagerie', label: 'The Menagerie',  hint: 'The clubhouse, the board, the roster' });
  items.push({ id: 'settings',  label: 'Settings',       hint: 'Sound, motion, readability' });
  items.push({ id: 'credits',   label: 'Credits',        hint: 'Who built the house' });
  return items;
}

export class TitleScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this._offs = [];
    this._overlay = null;
  }

  async enter(params = {}) {
    const { ctx } = this;
    await Promise.all([ensureCss(CSS_KIT), ensureCss(CSS_TITLE)]);

    const applyLocal = () => {
      const s = Save?.settings ?? {};
      setReduceMotion(!!s.reduceMotion);
      document.documentElement.classList.toggle('mm-large-text', !!s.largeText);
    };
    applyLocal();
    // The shared Settings panel writes straight to Save and announces it; this
    // screen's two local mirrors follow, so a change is visible behind the modal.
    this._offs.push(bus.on('settings:changed', applyLocal));

    /* The authored exterior-night region, not the Foyer. Nothing on this screen
       shows it: `.ti-sky` is an opaque gradient and the canvas measures 0.00%
       visible, and the previous owner already rendered the transparent-sky
       version (shots/ti_fix.png) and rejected it — the WebGL gold horizon fights
       the purple SVG night and you get two moons. So the SVG art stays the
       visible layer and the stage is paused below. The region is still set
       correctly rather than left on 'foyer', because 'foyer' is a lie: it is the
       colour the CSS custom properties get published from (`_publishCss`), it is
       what the stage holds if anything ever un-pauses it mid-title, and leaving a
       screen pointing at the wrong room is how the next person inherits a bug. */
    try { ctx.atmosphere?.setMood?.('title'); } catch {}

    // Nothing of the canvas reaches the screen here — stop drawing it.
    this._unpauseStage = pauseStageFor(ctx);

    const root = this.root;
    root.innerHTML = '';

    // ── backdrop layers ────────────────────────────────────────────────────
    const sky = el('div', 'ti-sky');
    sky.appendChild(el('div', 'ti-stars'));
    sky.appendChild(el('div', 'ti-stars ti-stars--b'));
    sky.appendChild(el('div', 'ti-moon'));
    sky.appendChild(el('div', 'ti-clouds'));
    root.appendChild(sky);

    const house = el('div', 'ti-house');
    for (const markup of mansionSVG()) house.appendChild(svg(markup));
    root.appendChild(house);

    root.appendChild(el('div', 'ti-fog'));
    root.appendChild(el('div', 'ti-fog ti-fog--b'));

    // drifting motes: pure CSS animation, composited, zero JS per frame
    const motes = el('div', 'ti-motes');
    const N = 34;
    let ms = 3;
    const mr = () => (ms = (ms * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const m = el('i');
      const size = (1 + mr() * 2.6).toFixed(2);
      m.style.cssText =
        `left:${(mr() * 100).toFixed(2)}%;` +
        `--sz:${size}px;` +
        `--dur:${(13 + mr() * 20).toFixed(1)}s;` +
        `--del:-${(mr() * 30).toFixed(1)}s;` +
        `--dx:${(mr() * 90 - 45).toFixed(0)}px;` +
        `--op:${(0.18 + mr() * 0.6).toFixed(2)};` +
        `--y0:${(60 + mr() * 40).toFixed(0)}vh`;
      motes.appendChild(m);
    }
    root.appendChild(motes);

    // corner cobwebs + candles, straight from the source art
    root.appendChild(svg(`<div class="ti-web ti-web--l">${cobweb()}</div>`));
    root.appendChild(svg(`<div class="ti-web ti-web--r">${cobweb()}</div>`));
    root.appendChild(svg(`<div class="ti-candle ti-candle--l">${candle()}</div>`));
    root.appendChild(svg(`<div class="ti-candle ti-candle--r">${candle()}</div>`));
    root.appendChild(el('div', 'ti-vignette'));
    root.appendChild(el('div', 'ti-scrim'));   // keeps the menu legible over lit windows

    // ── foreground: logo + menu ────────────────────────────────────────────
    const stage = el('div', 'ti-stage');

    const logo = logoLockup({ size: 'hero' });
    logo.classList.add('ti-logo');
    stage.appendChild(logo);

    /* The menu used to float straight over the lit windows, which made the
       words fight the house. It now sits on a slate plinth: a framed, blurred
       panel of its own, so the type always has an unambiguous ground and the
       tagline reads at a glance. */
    const plinth = el('div', 'ti-plinth');
    plinth.appendChild(el('div', 'ti-plinth__glass'));

    plinth.appendChild(el('p', 'ti-tagline',
      'Sixteen lost pets became something else inside that house.<br>' +
      '<span>Eight kids are going in to bring the rest home.</span>'));

    const rescued = new Set(Save?.data?.companionsRescued ?? []);
    const nav = el('nav', 'ti-menu');
    nav.setAttribute('aria-label', 'Main menu');
    const items = menuItems(!!Save?.hasRun?.());
    for (const it of items) {
      const b = el('button', 'ti-item');
      b.type = 'button';
      b.dataset.action = it.id;
      b.innerHTML =
        `<span class="ti-item__glyph" aria-hidden="true"></span>` +
        `<span class="ti-item__label">${it.label}</span>` +
        `<span class="ti-item__hint">${it.hint}</span>`;
      nav.appendChild(b);
    }
    plinth.appendChild(nav);
    stage.appendChild(plinth);
    root.appendChild(stage);

    // ── footer chrome ──────────────────────────────────────────────────────
    const foot = el('div', 'ti-foot');
    foot.innerHTML =
      `<span class="ti-foot__prog"><b>${rescued.size}</b> / ${COMPANIONS.length} Menagerie Companions freed</span>` +
      `<span class="ti-foot__dot" aria-hidden="true"></span>` +
      `<span class="ti-foot__ver">Midnight Menagerie &middot; build ${window.MM?.version ?? '0.1.0'}</span>`;
    root.appendChild(foot);

    // ── behaviour ──────────────────────────────────────────────────────────
    const unlockOnce = () => { try { this.ctx.audio?.unlock?.(); } catch {} };
    root.addEventListener('pointerdown', unlockOnce, { once: true });
    this._offs.push(() => root.removeEventListener('pointerdown', unlockOnce));

    const act = (id) => this._activate(id);
    const onClick = (e) => {
      const b = e.target.closest('.ti-item');
      if (b) { unlockOnce(); act(b.dataset.action); }
    };
    nav.addEventListener('click', onClick);
    this._offs.push(() => nav.removeEventListener('click', onClick));

    const onHover = (e) => {
      const b = e.target.closest?.('.ti-item');
      if (b && b !== this._hovered) { this._hovered = b; try { this.ctx.audio?.play?.('ui:hover'); } catch {} }
    };
    nav.addEventListener('pointerover', onHover);
    this._offs.push(() => nav.removeEventListener('pointerover', onHover));

    this._offs.push(rovingFocus(nav, '.ti-item', {
      cols: 0, onActivate: (b) => act(b.dataset.action),
    }));

    const onKey = (e) => {
      if (this._overlay) {
        if (e.key === 'Escape') { e.preventDefault(); this._closeOverlay(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); nav.querySelector('.ti-item')?.focus(); }
    };
    addEventListener('keydown', onKey);
    this._offs.push(() => removeEventListener('keydown', onKey));

    await fontsReady();
    // stagger the entrance; skipped entirely under reduceMotion
    root.classList.add('is-live');
    if (!reduceMotion()) {
      root.classList.add('is-entering');
      this._entTimer = setTimeout(() => root.classList.remove('is-entering'), 2200);
    }
    nav.querySelector('.ti-item')?.setAttribute('data-first', '');
    bus.emit('title:ready');
  }

  _activate(id) {
    const { ctx } = this;
    try { ctx.audio?.play?.('ui:confirm'); } catch {}
    switch (id) {
      case 'continue': {
        const run = Save?.loadRun?.();
        bus.emit('run:continue', run || null);
        ctx.scenes?.go?.(run?.scene && ctx.scenes.registry?.has?.(run.scene) ? run.scene : 'map', run || {});
        break;
      }
      case 'new':       ctx.scenes?.go?.('select', {}); break;
      case 'menagerie': ctx.scenes?.go?.('clubhouse', { panel: 'menagerie' }); break;
      case 'settings':  this._openSettings(); break;
      case 'credits':   this._openOverlay('credits'); break;
    }
  }

  /**
   * Settings is `ui/settings.js` — the same panel the run HUD's cog opens, on
   * the same modal primitive, driving the same `Save.settings`. The title
   * screen used to carry its own overlay with a different subset of controls
   * and no colourblind palette at all, so the game had two answers to
   * "what are my settings".
   */
  _openSettings() { return openSettings(this.ctx); }

  /* ── credits overlay ────────────────────────────────────────────────────── */
  _openOverlay(kind) {
    if (this._overlay) this._closeOverlay();
    this._lastFocus = document.activeElement;

    const ov = el('div', 'ti-ov');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Credits');

    const panel = el('div', 'ti-ov__panel');
    panel.innerHTML = '<h2 class="ti-ov__title">Credits</h2>';

    {
      panel.appendChild(el('div', 'ti-ov__body ti-credits', `
        <p class="ti-credits__lead">A cute-spooky deckbuilding roguelike about eight kids,
        sixteen transformed pets, and a house that confused protecting someone with keeping them.</p>
        <dl>
          <dt>Design</dt><dd>Midnight Menagerie design document</dd>
          <dt>Companion art</dt><dd>The Menagerie plates &mdash; sixteen portraits</dd>
          <dt>Blueprint</dt><dd>The mansion floor plan, seventeen wings</dd>
          <dt>Soundtrack</dt><dd>Ten tracks for the house and the clubhouse</dd>
          <dt>Fiction</dt><dd>Courage, Guard, Nerve, Tricks, Keepsakes, Lost Things, Lost Things</dd>
        </dl>
        <p class="ti-credits__foot">Protection without freedom is still imprisonment.</p>`));
    }

    const close = el('button', 'ti-ov__close');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => this._closeOverlay());
    panel.appendChild(close);

    ov.appendChild(panel);
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) this._closeOverlay(); });

    // focus trap
    const onTrap = (e) => {
      if (e.key !== 'Tab') return;
      const f = [...panel.querySelectorAll('button,input,[tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    ov.addEventListener('keydown', onTrap);

    this.root.appendChild(ov);
    this._overlay = ov;
    requestAnimationFrame(() => {
      ov.classList.add('is-open');
      (panel.querySelector('input,button') || close).focus();
    });
  }

  _closeOverlay() {
    const ov = this._overlay;
    if (!ov) return;
    this._overlay = null;
    ov.classList.remove('is-open');
    ov.remove();
    this._lastFocus?.focus?.();
  }

  async exit() {
    this._unpauseStage?.();
    this._unpauseStage = null;
    clearTimeout(this._entTimer);
    this._closeOverlay();
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    this._hovered = null;
    this.root.innerHTML = '';
  }
}
