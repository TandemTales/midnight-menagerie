/**
 * Title — the game's first impression.
 *
 * The screen IS `UI/mainMenu.png`. Not a reference for one: the painting, full
 * bleed, with `UI/title.png` composited over it and the menu standing in the
 * dark at the left of the gate.
 *
 * This scene used to build its own mansion out of SVG — roofline, spire,
 * chimneys, sixteen procedural windows, a fence, dead trees, a moon, cobwebs
 * and two candles — plus a `logoLockup()` wordmark and a slate plinth for the
 * menu. All of it was a stand-in for art that now exists, so all of it is gone
 * rather than layered under the art. What survives from that pass is one hard-
 * won performance rule (see `.ti-lamp` in title.css: animate opacity on a
 * promoted CSS box, never a filter on an SVG child) and one hard-won taste rule
 * (a previous round's window flicker was violent enough that the designer
 * called the game unplayable — the lights here breathe, they do not flicker,
 * and the whole idle screen moves less than 1% in mean luminance).
 *
 * OWNER: frontend agent.
 */
import { Scene } from '../core/scenes.js';
import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { COMPANIONS } from '../data/schema.js';
import {
  ensureCss, fontsReady, menuArtSrc, bat, parallax,
  el, svg, rovingFocus, setReduceMotion, reduceMotion,
  freedCompanions, starterCount, warmFaces,
} from '../ui/portrait.js';
import { pauseStageFor } from './_stage.js';
import { openSettings } from '../ui/settings.js';

const CSS_KIT   = new URL('../ui/portrait.css', import.meta.url).href;
const CSS_TITLE = new URL('./title.css', import.meta.url).href;

/* ── the lights in the painting ─────────────────────────────────────────────
   The house lights itself: a lantern on the left gate post, a wall lamp either
   side of the front door, and a gilt crest on the balcony above it. Measured
   off the plate (the flame centre, as a fraction of the image), so a halo sits
   on the light the painter put there instead of inventing a new one.

   `w` is the halo diameter as a fraction of plate WIDTH — the layer is
   cover-fit exactly like the plate, so one number scales at every resolution.
   The durations are coprime-ish and the delays negative so the four are
   already out of phase on the first frame; nothing on this screen ever pulses
   in unison. */
const LAMPS = [
  { id: 'gate',  x: 10.4, y: 63.3, w: 7.6, dur: 9.4,  delay: -0.0 },
  { id: 'door',  x: 45.6, y: 61.4, w: 5.0, dur: 7.7,  delay: -2.9 },
  { id: 'door',  x: 54.6, y: 61.4, w: 5.0, dur: 8.6,  delay: -5.3 },
  { id: 'crest', x: 50.1, y: 54.1, w: 3.8, dur: 11.3, delay: -1.7 },
];

/** Faint twinkles laid on the painted stars in the upper sky. Seeded. */
function starField() {
  const wrap = el('div', 'ti-stars');
  wrap.setAttribute('aria-hidden', 'true');
  let s = 11;
  const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const at = [
    [4.8, 6.2], [19.6, 3.4], [34.1, 9.8], [62.4, 4.1],
    [71.8, 11.2], [83.6, 6.7], [92.2, 14.6], [58.2, 16.1],
  ];
  for (const [x, y] of at) {
    const i = el('i');
    i.style.cssText =
      `left:${x}%;top:${y}%;` +
      `--sz:${(1.4 + r() * 1.5).toFixed(2)}px;` +
      `--dur:${(5.5 + r() * 5).toFixed(1)}s;` +
      `--del:-${(r() * 9).toFixed(1)}s;` +
      `--op:${(0.3 + r() * 0.45).toFixed(2)}`;
    wrap.appendChild(i);
  }
  return wrap;
}

/* ── menu definition ───────────────────────────────────────────────────────── */
function menuItems(hasRun) {
  const items = [];
  if (hasRun) items.push({ id: 'continue', label: 'Continue', hint: 'Return to the expedition in progress' });
  items.push({ id: 'new',       label: 'New Expedition', hint: 'Choose a Kid, a Companion, and go in' });
  /* The wire's front door. `net/lobby.js` has existed, tested, since 2026-08-28
     with nothing to reach it from — this line is the whole difference between
     a networked game somebody can start and one that only tests can. */
  items.push({ id: 'together',  label: 'Play Together',  hint: 'Meet at the treehouse and go in with somebody else' });
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

    /* The authored exterior-night region, not the Foyer. Nothing of the canvas
       reaches the screen here — the painting is opaque and full bleed — but the
       region is still set correctly rather than left on 'foyer', because
       'foyer' is a lie: it is the colour the CSS custom properties get
       published from (`_publishCss`), it is what the stage holds if anything
       ever un-pauses it mid-title, and leaving a screen pointing at the wrong
       room is how the next person inherits a bug. */
    try { ctx.atmosphere?.setMood?.('title'); } catch {}

    // Nothing of the canvas reaches the screen here — stop drawing it.
    this._unpauseStage = pauseStageFor(ctx);

    const root = this.root;
    root.innerHTML = '';

    /* ── the painting ─────────────────────────────────────────────────────
       Two <img> of the same file. One request, one decode, one bitmap: the
       browser shares it, and both layers are therefore guaranteed to be the
       same painting at the same rendered size, so the near-field copy seats
       back into the sharp one with nothing to line up. (Same argument as the
       Menagerie board's two plates in scenes/select.js.) */
    const scene = el('div', 'ti-scene');
    const plate = document.createElement('img');
    plate.className = 'ti-plate';
    plate.src = menuArtSrc('menu');
    plate.alt = '';
    plate.width = 1672;
    plate.height = 941;
    plate.decoding = 'async';
    plate.fetchPriority = 'high';
    plate.draggable = false;
    scene.appendChild(plate);
    this._plate = plate;

    /* The near ground, out of focus. The same plate blurred and dimmed, masked
       to a soft pool in the bottom-left corner where the menu stands.

       This is the menu's ground and it is deliberately NOT a panel. A slate
       plinth was the previous fix for menu-over-lit-windows and it worked, but
       it sat on the painting as an object from another game. Depth of field
       belongs to the picture: the cobbles nearest the camera go soft, the words
       sit in front of them, and nothing has an edge.

       It costs nothing per frame. `filter` on a static element rasterises once
       into that element's texture; the parallax that moves it is a transform on
       the PARENT, which does not re-run the filter. (The 3.3s long task that
       the old SVG mansion caused came from animating opacity on a blurred SVG
       *child*, which is not a CSS box and cannot be promoted. Nothing here
       animates a filtered layer's own opacity.) */
    const dof = document.createElement('img');
    dof.className = 'ti-plate ti-plate--dof';
    dof.src = menuArtSrc('menu');
    dof.alt = '';
    dof.setAttribute('aria-hidden', 'true');
    dof.decoding = 'async';
    dof.draggable = false;
    scene.appendChild(dof);
    root.appendChild(scene);

    /* The measured half of the ground: a pool of shadow under the menu column.
       Its strength is not a taste decision — it is set by the worst pixel
       behind any menu glyph. See the round-7 note for the numbers. */
    const ground = el('div', 'ti-ground');
    ground.setAttribute('aria-hidden', 'true');
    root.appendChild(ground);

    /* Lamps sit ABOVE the shadow pool, on `screen`, because a light source is
       not dimmed by the shadow it casts. It is what keeps the gate lantern lit
       right next to the darkest part of the screen. */
    const lights = el('div', 'ti-lights');
    lights.setAttribute('aria-hidden', 'true');
    for (const L of LAMPS) {
      const i = el('i', `ti-lamp ti-lamp--${L.id}`);
      i.style.cssText =
        `left:${L.x}%;top:${L.y}%;--w:${L.w}%;` +
        `--dur:${L.dur}s;animation-delay:${L.delay}s`;
      lights.appendChild(i);
    }
    root.appendChild(lights);

    root.appendChild(el('div', 'ti-mist'));
    root.appendChild(el('div', 'ti-mist ti-mist--b'));
    root.appendChild(starField());

    // Two bats crossing the sky, answering the ones painted into the wordmark.
    const bats = el('div', 'ti-bats');
    bats.setAttribute('aria-hidden', 'true');
    for (const [cls, delay] of [['ti-bat--a', '-9s'], ['ti-bat--b', '-31s']]) {
      const b = svg(`<svg class="ti-bat ${cls}" viewBox="0 0 100 36" aria-hidden="true">${bat()}</svg>`);
      b.style.animationDelay = delay;
      bats.appendChild(b);
    }
    root.appendChild(bats);

    root.appendChild(el('div', 'ti-vignette'));

    // ── the wordmark ───────────────────────────────────────────────────────
    const mark = el('h1', 'ti-mark');
    const logo = document.createElement('img');
    logo.className = 'ti-logo';
    logo.src = menuArtSrc('title');
    logo.alt = 'Midnight Menagerie';
    logo.width = 2102;
    logo.height = 688;
    logo.decoding = 'async';
    logo.fetchPriority = 'high';
    logo.draggable = false;
    mark.appendChild(logo);
    root.appendChild(mark);

    // ── the menu ───────────────────────────────────────────────────────────
    /* FREED means freed. On a completely empty localStorage this line said
       "4 / 16 MENAGERIE COMPANIONS FREED" — the four starters were being
       counted as rescues — which is a lie on a fresh save and it flattens the
       counter you spend the entire game raising: your first real rescue moved
       it from four to five. The starters are named separately, because they are
       real and pickable, but they are not rescues.
       `freedCompanions()` / `starterCount()` — see ui/portrait.js. */
    const rescued = freedCompanions();
    const starters = starterCount();

    const panel = el('div', 'ti-panel');
    panel.appendChild(el('p', 'ti-tagline',
      'Sixteen lost pets became something else inside that house.<br>' +
      '<span>Eight kids are going in to bring the rest home.</span>'));
    panel.appendChild(el('div', 'ti-rule'));

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
    panel.appendChild(nav);

    panel.appendChild(el('div', 'ti-rule ti-rule--foot'));
    /* Shorter than the old footer's "N / 16 Menagerie Companions freed - N
       already at the clubhouse", which needed 490px at 1920 and wrapped inside
       the menu column, putting the number alone on its own line. Same two
       facts, same separation of the two, one line at every resolution. */
    panel.appendChild(el('div', 'ti-count',
      `<b>${rescued.size}</b> / ${COMPANIONS.length} Companions freed` +
      (starters ? `<span class="ti-count__dot"></span>` +
        `<span class="ti-count__with">${starters} at the clubhouse</span>` : '')));
    root.appendChild(panel);

    const build = el('div', 'ti-build',
      `Midnight Menagerie &middot; build ${window.MM?.version ?? '0.1.0'}`);
    root.appendChild(build);

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

    /* A very slow parallax on pointer. The painting is far, so it barely moves;
       the wordmark hangs in front of it, so it moves about twice as much and
       the house separates from the sign. The scale on the plate is what buys
       the room to translate without showing the frame edge, and it is applied
       BY the parallax manager rather than in CSS, because the manager writes
       `style.transform` wholesale — a CSS transform on the same element would
       be overwritten on the first pointer move. Under reduceMotion nothing is
       registered at all, so the plate sits at exactly 1.0 and cover-fits the
       viewport with no crop of its own. */
    if (!reduceMotion()) {
      this._offs.push(parallax.add(scene, 0.7, 1.045));
      this._offs.push(parallax.add(lights, 0.7, 1.045));
      this._offs.push(parallax.add(mark, 1.5, 1));
    }

    await fontsReady();
    /* The painting IS the screen. `Scene.enter()` is awaited behind the
       transition veil (CONTRACTS trap #4), so waiting for the plate to decode
       here costs black frames rather than showing a blank navy rectangle with
       a menu floating on it. Capped hard, and it cannot reject. */
    await this._plateReady();

    root.classList.add('is-live');
    if (!reduceMotion()) {
      root.classList.add('is-entering');
      this._entTimer = setTimeout(() => root.classList.remove('is-entering'), 2000);
    }
    nav.querySelector('.ti-item')?.setAttribute('data-first', '');
    bus.emit('title:ready');
  }

  /** The plate, decoded and ready to paint. Never rejects, never hangs. */
  _plateReady(timeout = 1800) {
    const img = this._plate;
    if (!img) return Promise.resolve();
    return Promise.race([
      (img.decode?.() ?? Promise.resolve()).catch(() => {}),
      new Promise((r) => setTimeout(r, timeout)),
    ]);
  }

  _activate(id) {
    const { ctx } = this;
    try { ctx.audio?.play?.('ui:confirm'); } catch {}
    /* Start the eight pet photographs the instant the player commits, so they
       render under the transition veil that is coming down anyway rather than
       in front of anybody. Fire and forget, chunked across frames; whatever is
       unfinished when the destination scene builds is finished synchronously
       there, still behind the veil.
       An earlier version warmed on requestIdleCallback while the Title was on
       screen and measured 6 fps. See ui/petart.js.
       The Kids are not in here any more: they are files on disk now, decoded by
       the browser off the main thread, so there is nothing to pre-render. */
    if (id === 'new' || id === 'menagerie' || id === 'continue' || id === 'together') warmFaces();
    switch (id) {
      case 'continue': {
        const run = Save?.loadRun?.();
        bus.emit('run:continue', run || null);
        ctx.scenes?.go?.(run?.scene && ctx.scenes.registry?.has?.(run.scene) ? run.scene : 'map', run || {});
        break;
      }
      case 'new':       ctx.scenes?.go?.('select', {}); break;
      case 'together':  ctx.scenes?.go?.('lobby', {}); break;
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
      /* ── what this list is FOR ──────────────────────────────────────────────
       * It used to name no person, no tool and no licence, and printed "Lost
       * Things" twice. Two of those are taste; one is not. This game
       * redistributes three OFL fonts and an MIT library, and both licences
       * require their notices to travel with the work — `game/vendor/LICENSE`
       * and `game/assets/fonts/OFL.txt` are what satisfies that, and this is
       * where a player is told the notices exist and where to find them.
       *
       * The AI lines are here because Steam requires the disclosure and because
       * a player who reads credits is exactly the player who wants to know.
       * `docs/COMMERCIAL-USE.md` carries the evidence and the timestamps. */
      panel.appendChild(el('div', 'ti-ov__body ti-credits', `
        <p class="ti-credits__lead">A cute-spooky deckbuilding roguelike about eight kids,
        sixteen transformed pets, and a house that confused protecting someone with keeping them.</p>
        <dl>
          <dt>Design, code &amp; writing</dt><dd>The Midnight Menagerie authors</dd>
          <dt>Fiction</dt><dd>Courage, Guard, Nerve, Tricks, Keepsakes, Lost Things</dd>
          <dt>Art</dt><dd>Generated with OpenAI's image model, then hand-edited</dd>
          <dt>Soundtrack</dt><dd>Ten tracks generated with Suno</dd>
          <dt>Sound effects</dt><dd>Synthesised in the browser &mdash; no recordings</dd>
          <dt>Engine</dt><dd>three.js r169 &mdash; MIT licence</dd>
          <dt>Type</dt><dd>Cinzel, Grenze and Rye &mdash; SIL Open Font License 1.1</dd>
        </dl>
        <p class="ti-credits__note">Full licence texts ship with the game, in
        <code>vendor/LICENSE</code> and <code>assets/fonts/OFL.txt</code>.</p>
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
    this._plate = null;
    this.root.innerHTML = '';
  }
}
