/**
 * The Scuffle screen. OWNER: combat-scene.
 * Spec: docs/STS2-REFERENCE.md §1 (layout), §2 (numbers are never a mystery),
 * §4 (feel and juice).
 *
 * This scene NEVER decides rules. It drives `CombatEngine` from the Hand's
 * callbacks and renders exclusively from engine events + `engine.state`.
 *
 * Event flow:
 *   engine.on('*')  ->  this._q  ->  _drain()  ->  await _animate(ev)
 * so a five-hit attack reads as five distinct impacts and an enemy's wind-up
 * always plays *before* its damage lands.
 *
 * Boots from `ctx.run` when a run exists; otherwise from real Foyer content
 * (imported defensively) and finally from `makeDummyCombat`, so
 * `#scene=combat&seed=42` is fully playable standalone.
 */

import { Scene } from '../core/scenes.js';
import { Clock } from '../core/clock.js';
import { RNG } from '../core/rng.js';
import { CombatEngine } from '../combat/engine.js';
import { makeDummyCombat, makeDummySetup } from '../combat/dummy.js';
import { previewIncoming } from '../combat/preview.js';
import { Intent, TERMS } from '../data/schema.js';
import { Hand } from '../ui/hand.js';
import { CardView } from '../ui/card.js';
import { EnemyView } from '../ui/enemy.js';
import { CombatFX } from '../fx/combatfx.js';

const CSS = new URL('./combat.css', import.meta.url).href;
const CARD_CSS = new URL('../ui/card.css', import.meta.url).href;
const HAND_CSS = new URL('../ui/hand.css', import.meta.url).href;
const PORTRAITS = new URL('../../assets/portraits/', import.meta.url).href;

/* ── status glyphs: one distinct silhouette each, on a 24x24 box ───────────── */
const SG = {
  strength: 'M12 2 L15 8 L21 9 L16.5 13.5 L18 20 L12 17 L6 20 L7.5 13.5 L3 9 L9 8 Z',
  dexterity: 'M4 20 L10 4 L14 4 L20 20 L16 20 L14.6 16 L9.4 16 L8 20 Z M10.6 12 L13.4 12 L12 7.6 Z',
  focus: 'M12 3 A9 9 0 1 1 11.9 3 Z M12 8 A4 4 0 1 0 12.1 8 Z',
  regen: 'M12 21 C6 16 3 12.5 3 9 A4.6 4.6 0 0 1 12 7 A4.6 4.6 0 0 1 21 9 C21 12.5 18 16 12 21 Z',
  bristle: 'M12 2 L14 9 L21 8 L16 13 L21 19 L13 17 L12 22 L11 17 L3 19 L8 13 L3 8 L10 9 Z',
  faint: 'M12 2 C7 6 5 9 5 13 A7 7 0 0 0 19 13 C19 9 17 6 12 2 Z M12 7 C9 10 8.5 11.5 8.5 13 A3.5 3.5 0 0 0 15.5 13 C15.5 11.5 15 10 12 7 Z',
  charm: 'M12 2 L20 5.5 C20 13 16.5 18.5 12 21 C7.5 18.5 4 13 4 5.5 Z',
  weak: 'M4 6 L20 6 L20 9 L14 9 L14 20 L10 20 L10 9 L4 9 Z',
  vulnerable: 'M12 3 L22 21 L2 21 Z M11 9 H13 V15 H11 Z M11 17 H13 V19 H11 Z',
  frail: 'M6 3 L18 3 L18 8 L13 12 L18 16 L18 21 L6 21 L6 16 L11 12 L6 8 Z',
  dread: 'M12 2 C7 2 4 5.5 4 10 C4 13 5.5 15 7 16.5 L7 20 H17 L17 16.5 C18.5 15 20 13 20 10 C20 5.5 17 2 12 2 Z M9 9.5 A1.8 1.8 0 1 1 8.9 9.5 Z M15 9.5 A1.8 1.8 0 1 1 14.9 9.5 Z',
  confusion: 'M9 8 C9 5 10.5 3.5 12.5 3.5 C14.8 3.5 16 5 16 7 C16 9.5 13.5 10 13 12 L11 12 C11 9.5 14 8.8 14 7 C14 6 13.5 5.4 12.5 5.4 C11.4 5.4 11 6.3 11 8 Z M11 15 H13 V17.4 H11 Z',
  entangle: 'M5 4 C13 6 11 12 5 14 M19 4 C11 6 13 12 19 14 M5 20 H19',
  roused: 'M12 2 L14.5 9 L22 9 L16 13.5 L18 21 L12 16.6 L6 21 L8 13.5 L2 9 L9.5 9 Z',
};
const SG_STROKE = new Set(['entangle']);

/* ── keepsake glyph fallback ───────────────────────────────────────────────── */
const RELIC_G = 'M12 3 L14.6 9.4 L21.5 9.9 L16.2 14.3 L17.9 21 L12 17.3 L6.1 21 L7.8 14.3 L2.5 9.9 L9.4 9.4 Z';

export class CombatScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this.views = new Map();       // enemyId -> EnemyView
    this._q = [];
    this._offs = [];
    this._engineOffs = [];
    this._shake = { mag: 0, ph: 0 };
    this._tipEl = null;
    this._pt = { x: 0, y: 0 };
  }

  /* ══ boot ═══════════════════════════════════════════════════════════════ */
  async enter(params = {}) {
    const ctx = this.ctx;
    await Promise.all([ensureCss(CSS), ensureCss(CARD_CSS), ensureCss(HAND_CSS)]);
    this._readSettings();

    this.root.classList.add('cb-root');
    this._buildDom(params);

    this.fx = new CombatFX(ctx, this.root);
    this.engine = await this._makeEngine(params);
    this._wireEngine();
    this._buildEnemies();
    this._buildHand();
    this._bindUi();

    ctx.atmosphere?.setMood?.(this.region || 'foyer');
    ctx.audio?.music?.('combat');

    this._offFrame = ctx.clock.onFrame((dt, t) => this._frame(dt, t));
    this._ro = new ResizeObserver(() => { this.fx?.resize(); this._layoutEnemies(); });
    this._ro.observe(this.root);

    this._syncAll();
    await this.engine.startCombat();
    await this._settle();
  }

  _readSettings() {
    const s = this.ctx.Save?.settings || {};
    this.reduceMotion = !!s.reduceMotion;
    this.shakeAmt = s.screenShake ?? 1;
    this.flashes = s.flashes ?? 1;
    this.largeText = !!s.largeText;
    this.speed = s.fastMode ? 1.7 : (s.speed || 1);
  }
  /** Every animation duration passes through here. One switch for reduceMotion. */
  _d(sec) { return this.reduceMotion ? 0.001 : sec / this.speed; }

  /* ── engine construction ─────────────────────────────────────────────── */
  async _makeEngine(params) {
    const ctx = this.ctx;
    if (ctx.run?.combat instanceof CombatEngine) {
      this.region = ctx.run.region || 'foyer';
      this.companion = ctx.run.companion || 'marmalade';
      return ctx.run.combat;
    }

    const seed = Number(params.seed ?? ctx.run?.seed ?? 42) || 42;
    const rng = ctx.run?.rng || new RNG(seed);
    this.companion = params.companion || ctx.run?.companion || 'marmalade';
    this.region = params.region || ctx.run?.region || 'foyer';

    let deck = null, enemies = null, hp = null, energyMax = 3, relics = [];

    // real content, imported defensively — the scene still boots without any of it
    try {
      const cards = await import('../data/cards.js');
      const d = cards.startingDeckFor(this.companion);
      if (d && d.length >= 5) deck = d;
      const comp = cards.companion?.(this.companion);
      if (comp?.startingHp) hp = comp.startingHp;
      if (comp?.startingEnergy) energyMax = comp.startingEnergy;
    } catch (e) { /* companion content not present yet */ }

    try {
      const [{ getEnemy, hasEnemy, ENEMY_STATUSES }, enc, statuses] = await Promise.all([
        import('../data/enemies/index.js'),
        import('../data/encounters.js'),
        import('../combat/statuses.js'),
      ]);
      if (ENEMY_STATUSES && statuses.registerStatuses) statuses.registerStatuses(ENEMY_STATUSES);

      let members = null;
      if (params.encounter) {
        members = enc.buildEncounter(params.encounter, rng, Number(params.haunt) || 0);
      } else if (params.enemies) {
        // stress / debug: N copies of the two safest Foyer rigs
        const pool = ['dust-bunny', 'coatrack-crawler', 'lost-luggage', 'red-carpet-runner'];
        members = [];
        for (let i = 0; i < Math.min(4, Math.max(1, +params.enemies || 1)); i++) {
          const id = pool[i % pool.length];
          if (hasEnemy(id)) members.push({ enemyId: id, hp: null, counters: {}, flags: {} });
        }
      } else {
        const e = enc.rollEncounter(this.region, params.tier || 'standard', rng, []);
        if (e) members = enc.buildEncounter(e.id, rng, Number(params.haunt) || 0);
      }

      if (members && members.length) {
        this._members = members;
        const resolve = await makeIdResolver(getEnemy);
        enemies = members.map((mm, i) => {
          const def = getEnemy(mm.enemyId);
          return def ? { def: adaptEnemyDef(def, resolve), hp: mm.hp || undefined, id: `e${i}` } : null;
        }).filter(Boolean);
        if (!enemies.length) enemies = null;
      }
    } catch (e) { /* enemy content not present yet */ }

    if (deck && enemies) {
      const engine = new CombatEngine({
        rng,
        player: {
          name: 'Kid', companion: this.companion,
          maxHp: hp || 70, hp: hp || 70,
          energyMax, drawPerTurn: 5, deck,
        },
        enemies, relics,
      });
      // Haunt counters / behavioural flags the encounter builder produced.
      if (this._members) {
        engine.enemies.forEach((en, i) => {
          const mm = this._members[i];
          if (!mm) return;
          if (mm.counters) en.counters = { ...(en.counters || {}), ...mm.counters };
          if (mm.flags) en.flags = { ...(en.flags || {}), ...mm.flags };
        });
      }
      this.usingRealContent = true;
      return engine;
    }

    // last resort — always playable
    this.usingRealContent = false;
    return makeDummyCombat(rng, makeDummySetup(rng).player ? {} : {});
  }

  /* ══ DOM ════════════════════════════════════════════════════════════════ */
  _buildDom(params) {
    const T = TERMS;
    this.root.innerHTML = `
      <div class="cb">
        <header class="cb-top">
          <div class="cb-keeps" role="list" aria-label="${T.relic}s"></div>
          <div class="cb-vitals">
            <div class="cb-turn"><span class="cb-turn__k">Turn</span><b class="cb-turn__n">1</b></div>
            <div class="cb-chip cb-chip--hp" data-tip="${T.hp}|How much fright you can take before the night ends.|Guard soaks damage first." tabindex="0">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 C5 15.5 2.5 12 2.5 8.4 A5 5 0 0 1 12 6.2 A5 5 0 0 1 21.5 8.4 C21.5 12 19 15.5 12 21 Z"/></svg>
              <b class="cb-chip__n">0</b><span class="cb-chip__m">/0</span>
            </div>
            <div class="cb-chip cb-chip--gold" data-tip="${T.gold}|Spent at Lost Things." tabindex="0">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6" class="hole"/></svg>
              <b class="cb-chip__n">0</b>
            </div>
          </div>
        </header>

        <div class="cb-field">
          <div class="cb-enemies" role="group" aria-label="Enemies"></div>
        </div>

        <section class="cb-player" aria-label="You">
          <div class="cb-player__figure">
            <div class="cb-player__glow"></div>
            <img class="cb-player__art" alt="" draggable="false">
            <div class="cb-player__flash"></div>
            <div class="cb-player__guard" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 L21.5 5.2 C21.5 14 17.3 20.2 12 22.8 C6.7 20.2 2.5 14 2.5 5.2 Z"/></svg>
              <b>0</b>
            </div>
          </div>
          <div class="cb-player__plate">
            <div class="cb-player__name"></div>
            <div class="cb-hpbar" data-tip="${T.hp}|What is left of your nerve.|At zero the night is over." tabindex="0">
              <div class="cb-hpbar__ghost"></div>
              <div class="cb-hpbar__fill"></div>
              <div class="cb-hpbar__incoming"></div>
              <div class="cb-hpbar__txt"><b></b><span></span></div>
            </div>
            <div class="cb-incoming" hidden></div>
            <div class="cb-statuses" role="list" aria-label="Your conditions"></div>
          </div>
        </section>

        <div class="cb-handhost"></div>

        <div class="cb-bl">
          <div class="cb-pluck" data-tip="${T.energy}|You spend it to play Tricks.|It refills to full at the start of every turn." tabindex="0">
            <svg class="cb-pluck__ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="cb-pluck__track" cx="50" cy="50" r="42"/>
              <circle class="cb-pluck__arc" cx="50" cy="50" r="42"/>
            </svg>
            <div class="cb-pluck__core"></div>
            <div class="cb-pluck__n"><b>3</b><span>/3</span></div>
            <div class="cb-pluck__lbl">${T.energy}</div>
          </div>
          <button class="cb-pile cb-pile--draw" id="draw-pile" type="button"
                  data-tip="Draw pile|The Tricks still to come. Order is hidden.|Click to look through them.">
            <svg viewBox="0 0 34 44" aria-hidden="true"><rect x="1" y="1" width="24" height="34" rx="3"/><rect x="6" y="5" width="24" height="34" rx="3"/><rect x="9" y="9" width="24" height="34" rx="3" class="top"/></svg>
            <b>0</b><span class="cb-pile__lbl">Draw</span>
          </button>
        </div>

        <div class="cb-br">
          <button class="cb-endturn" id="end-turn" type="button">
            <span class="cb-endturn__glow"></span>
            <span class="cb-endturn__k">End Turn</span>
            <span class="cb-endturn__hint">E</span>
          </button>
          <button class="cb-pile cb-pile--discard" id="discard-pile" type="button"
                  data-tip="Discard pile|Tricks already used this Scuffle.|Reshuffled into the draw pile when it runs out.">
            <svg viewBox="0 0 34 44" aria-hidden="true"><rect x="1" y="1" width="24" height="34" rx="3"/><rect x="6" y="5" width="24" height="34" rx="3"/><rect x="9" y="9" width="24" height="34" rx="3" class="top"/></svg>
            <b>0</b><span class="cb-pile__lbl">Discard</span>
          </button>
        </div>

        <div class="cb-banner" aria-live="polite"></div>
        <div class="cb-deny" aria-live="assertive"></div>
        <div class="cb-pileview" hidden>
          <div class="cb-pileview__panel" role="dialog" aria-modal="true" aria-label="Pile">
            <header><h2></h2><button class="cb-pileview__x" type="button" aria-label="Close">&times;</button></header>
            <div class="cb-pileview__grid"></div>
          </div>
        </div>
      </div>`;

    const $ = (s) => this.root.querySelector(s);
    this.$cb = $('.cb');
    this.$field = $('.cb-field');
    this.$enemies = $('.cb-enemies');
    this.$keeps = $('.cb-keeps');
    this.$turnN = $('.cb-turn__n');
    this.$hpN = $('.cb-chip--hp .cb-chip__n');
    this.$hpM = $('.cb-chip--hp .cb-chip__m');
    this.$gold = $('.cb-chip--gold .cb-chip__n');
    this.$pl = $('.cb-player');
    this.$plArt = $('.cb-player__art');
    this.$plName = $('.cb-player__name');
    this.$plFlash = $('.cb-player__flash');
    this.$plGuard = $('.cb-player__guard');
    this.$plGuardN = $('.cb-player__guard b');
    this.$hpFill = $('.cb-hpbar__fill');
    this.$hpGhost = $('.cb-hpbar__ghost');
    this.$hpInc = $('.cb-hpbar__incoming');
    this.$hpTxtN = $('.cb-hpbar__txt b');
    this.$hpTxtM = $('.cb-hpbar__txt span');
    this.$inc = $('.cb-incoming');
    this.$statuses = $('.cb-statuses');
    this.$handHost = $('.cb-handhost');
    this.$pluckN = $('.cb-pluck__n b');
    this.$pluckM = $('.cb-pluck__n span');
    this.$pluckArc = $('.cb-pluck__arc');
    this.$pluck = $('.cb-pluck');
    this.$drawPile = $('#draw-pile');
    this.$discardPile = $('#discard-pile');
    this.$endTurn = $('#end-turn');
    this.$banner = $('.cb-banner');
    this.$deny = $('.cb-deny');
    this.$pileview = $('.cb-pileview');
    this.$pileTitle = $('.cb-pileview h2');
    this.$pileGrid = $('.cb-pileview__grid');

    this.root.classList.toggle('is-large', this.largeText);
    const slug = String(params.companion || this.ctx.run?.companion || 'marmalade');
    this.$plArt.src = `${PORTRAITS}${slug}.png`;
    this.$plArt.addEventListener('error', () => { this.$plArt.style.display = 'none'; }, { once: true });

    // arc length for the Pluck ring
    this._arcLen = 2 * Math.PI * 42;
    this.$pluckArc.style.strokeDasharray = String(this._arcLen);
  }

  /* ══ enemies ════════════════════════════════════════════════════════════ */
  _buildEnemies() {
    const st = this.engine.state;
    for (const e of st.enemies) {
      const def = this.engine.actor(e.id)?.def || null;
      const v = new EnemyView(e, {
        clock: this.ctx.clock, reduceMotion: this.reduceMotion, def,
      });
      v.el.addEventListener('pointerenter', () => this._enemyHover(v, true));
      v.el.addEventListener('pointerleave', () => this._enemyHover(v, false));
      v.el.addEventListener('focus', () => this._enemyHover(v, true));
      v.el.addEventListener('blur', () => this._enemyHover(v, false));
      v.intentView.el.addEventListener('pointerenter', () => this._showTip(v.intentView.el, v.intentView.tooltipHTML(), true));
      v.intentView.el.addEventListener('pointerleave', () => this._hideTip());
      this.views.set(e.id, v);
      this.$enemies.appendChild(v.el);
    }
    this._layoutEnemies();
  }

  _layoutEnemies() {
    const n = this.$enemies.children.length;
    this.$enemies.dataset.n = String(n);
  }

  _enemyHover(v, on) {
    if (on) {
      const lore = v.def?.lore ? `<div class="cb-tip__tell">${esc(v.def.lore)}</div>` : '';
      const body = v.intentView.intent
        ? v.intentView.tooltipHTML()
        : `<div class="cb-tip__title">${esc(v.name)}</div>`;
      this._showTip(v.el, `${body}${lore}`, true);
    } else this._hideTip();
  }

  /* ══ hand ═══════════════════════════════════════════════════════════════ */
  _buildHand() {
    const ctx = this.ctx;
    this.hand = new Hand(ctx, {
      root: this.$handHost,
      onPlay: (o) => this._onPlay(o),
      onPreview: (o) => this._onPreview(o),
      getTargets: () => [...this.views.values()]
        .filter(v => v.alive && !v.dying)
        .map(v => ({ id: v.id, el: v.$stage })),
    });
    this.hand.setPlayable((card) => this.engine.canPlay(card.uid, null).ok
      || this.engine.canPlay(card.uid, this.engine.firstLivingEnemy()?.id || null).ok);
    this._updatePilePositions();

    this._offs.push(ctx.bus.on('card:hover', (p) => this._hoverPreview(p.uid)));
    this._offs.push(ctx.bus.on('card:unhover', () => this._clearPreview()));
    this._offs.push(ctx.bus.on('card:cancel', () => this._clearPreview()));
    this._offs.push(ctx.bus.on('settings:changed', () => {
      this._readSettings();
      this.root.classList.toggle('is-large', this.largeText);
      for (const v of this.views.values()) v.reduceMotion = this.reduceMotion;
    }));
  }

  _updatePilePositions() {
    const r = this.$handHost.getBoundingClientRect();
    const d = this.$drawPile.getBoundingClientRect();
    const x = this.$discardPile.getBoundingClientRect();
    this.hand.setPiles({
      draw: { x: d.left - r.left + d.width / 2, y: d.top - r.top + d.height / 2 },
      discard: { x: x.left - r.left + x.width / 2, y: x.top - r.top + x.height / 2 },
    });
  }

  /** Hand asked to commit a card. Returning false rejects it with a shake. */
  _onPlay({ uid, targetId }) {
    if (this._resolving || this.engine.over) return false;
    const tid = targetId ?? (this._defaultTargetFor(uid));
    const chk = this.engine.canPlay(uid, tid);
    if (!chk.ok) { this._deny(chk.reason); return false; }

    this._resolving = true;
    this._playedUid = uid;
    this._clearPreview();
    this.hand.lock();
    const card = this.engine.card(uid);
    this.ctx.bus.emit('card:play', { type: card?.type, cardId: card?.id });
    // resolve on the "hold" beat of the Hand's play animation, so the effect
    // lands while the card is presented rather than the instant it leaves
    this.ctx.clock.wait(this._d(0.20)).then(async () => {
      try { await this.engine.playCard(uid, tid); } catch (e) { console.error('[combat] playCard', e); }
      await this._settle();
      this._playedUid = null;
      this._resolving = false;
      if (!this.engine.over && this.engine.phase === 'player') this.hand.unlock();
    });
    return true;
  }

  _defaultTargetFor(uid) {
    const c = this.engine.card(uid);
    if (!c) return null;
    if (c.target === 'enemy') return this.engine.firstLivingEnemy()?.id || null;
    return null;
  }

  /* ══ preview / tactical clarity ═════════════════════════════════════════ */
  /**
   * STS2 §2: hovering a target while holding a card previews the outcome on
   * that target, and the card's own numbers recolour.
   */
  _onPreview({ uid, targetId }) {
    const tid = targetId || this._defaultTargetFor(uid);
    const p = this._preview(uid, tid);
    this._paintPreview(uid, tid, p);
    return this._cardNumbers(uid, tid);
  }

  _hoverPreview(uid) {
    const tid = this._defaultTargetFor(uid);
    const p = this._preview(uid, tid);
    this._paintPreview(uid, tid, p);
    const v = this.hand.viewOf(uid);
    v?.setPreviewNumbers(this._cardNumbers(uid, tid));
  }

  _preview(uid, tid) {
    try { return this.engine.preview(uid, tid, { assumeAffordable: true }); }
    catch (e) { console.error('[combat] preview', e); return null; }
  }

  /** Live-modified card text numbers: `{ d, wasD, b, wasB, ... }`. */
  _cardNumbers(uid, tid) {
    const card = this.engine.card(uid);
    if (!card) return null;
    const snap = this.engine.cardSnap(card, tid);
    const out = {};
    for (const k in snap.display || {}) {
      const d = snap.display[k];
      out[k] = d.value;
      out['was' + k.charAt(0).toUpperCase() + k.slice(1)] = d.base;
    }
    return out;
  }

  /** Paint the outcome ON the targets, plus the Guard the player would gain. */
  _paintPreview(uid, tid, p) {
    this._previewOn = true;
    for (const v of this.views.values()) v.showPreview(null);
    if (!p) { this.$pl.classList.remove('is-preview'); return; }

    for (const t of p.targets || []) {
      const v = this.views.get(t.id);
      if (!v || !v.alive) continue;
      v.showPreview({
        damage: t.hpLoss > 0 || t.damage > 0 ? (t.damage || 0) : 0,
        hits: t.hits || 1,
        kills: !!t.kills,
        statuses: (p.statuses || []).filter(s => s.actorId === t.id),
      });
    }
    // statuses landing on an untargeted enemy (AoE debuffs) still show
    for (const s of p.statuses || []) {
      if (s.actorId === this.engine.player.id) continue;
      const v = this.views.get(s.actorId);
      if (v && v.alive && v.$preview.hidden) v.showPreview({ damage: 0, statuses: [s] });
    }

    const selfSt = (p.statuses || []).filter(s => s.actorId === this.engine.player.id);
    const gain = p.block || 0;
    this.$pl.classList.toggle('is-preview', gain > 0 || selfSt.length > 0 || p.heal > 0);
    if (gain > 0) {
      this.$plGuard.hidden = false;
      this.$plGuard.classList.add('is-preview');
      this.$plGuardN.textContent = String(this.engine.player.block + gain);
      this.$plGuard.dataset.plus = '+' + gain;
    }
    this._renderIncoming(gain);
  }

  _clearPreview() {
    if (!this._previewOn) return;
    this._previewOn = false;
    for (const v of this.views.values()) v.showPreview(null);
    this.$pl.classList.remove('is-preview');
    this.$plGuard.classList.remove('is-preview');
    delete this.$plGuard.dataset.plus;
    this._syncPlayer();
    this._renderIncoming(0);
  }

  /**
   * The persistent "incoming damage this turn" readout — computed from every
   * enemy intent, updating as Guard changes, so the player can see exactly how
   * much more Guard they need.
   */
  _renderIncoming(extraBlock = 0) {
    if (!this.engine || this.engine.over) { this.$inc.hidden = true; return; }
    let inc;
    try { inc = previewIncoming(this.engine); } catch { return; }
    const block = (inc.block || 0) + extraBlock;
    const through = Math.max(0, inc.total - block);
    if (inc.total <= 0) {
      this.$inc.hidden = true;
      this.$hpInc.style.width = '0%';
      this.$pl.classList.remove('is-lethal');
      return;
    }
    const hp = this.engine.player.hp;
    const lethal = through >= hp;
    const need = Math.max(0, inc.total - (inc.block || 0));
    this.$inc.hidden = false;
    this.$inc.dataset.state = lethal ? 'lethal' : through > 0 ? 'through' : 'safe';
    this.$inc.innerHTML =
      `<span class="cb-inc__k">Incoming</span>`
      + `<b class="cb-inc__n">${inc.total}</b>`
      + (block > 0 ? `<span class="cb-inc__blk">&minus;${block} Guard</span>` : '')
      + `<span class="cb-inc__arrow">&rarr;</span>`
      + `<b class="cb-inc__t">${through}</b>`
      + (lethal ? `<span class="cb-inc__lethal">LETHAL</span>`
        : through > 0 ? `<span class="cb-inc__need">${need} more Guard to stop it all</span>`
          : `<span class="cb-inc__safe">Fully blocked</span>`);
    this.$inc.dataset.tip = `Incoming this turn|Every living enemy's intent added up: ${inc.total} damage.|`
      + (through > 0 ? `Your ${block} Guard stops ${Math.min(block, inc.total)}; ${through} reaches your Courage.`
        : `Your ${block} Guard stops all of it.`);
    this.$inc.tabIndex = 0;
    this.$pl.classList.toggle('is-lethal', lethal);

    const maxHp = this.engine.player.maxHp || 1;
    this.$hpInc.style.width = Math.min(100, (through / maxHp) * 100).toFixed(2) + '%';
  }

  /* ══ engine wiring ══════════════════════════════════════════════════════ */
  _wireEngine() {
    this._engineOffs.push(this.engine.on('*', (ev) => {
      this._q.push(ev);
      this._kick();
    }));
  }

  _kick() {
    if (this._draining) return this._draining;
    this._draining = this._drain().finally(() => { this._draining = null; });
    return this._draining;
  }

  async _drain() {
    while (this._q.length) {
      const ev = this._q.shift();
      try { await this._animate(ev); } catch (e) { console.error('[combat] animate ' + ev.type, e); }
    }
    this._syncAll();
  }

  /** Wait until every queued event has finished animating. */
  async _settle() {
    let guard = 0;
    while (this._draining && guard++ < 400) await this._draining;
    this._syncAll();
  }

  /** Pull consecutive events of `type` off the front of the queue. */
  _takeRun(type) {
    const out = [];
    while (this._q.length && this._q[0].type === type) out.push(this._q.shift());
    return out;
  }

  /* ══ the animator ═══════════════════════════════════════════════════════ */
  async _animate(ev) {
    const E = this.engine;
    switch (ev.type) {

      case 'combat:start':
        this._banner('The Scuffle Begins', 'start');
        this.ctx.atmosphere?.dread?.(0.12, 0.6);
        await this._wait(this._d(0.24));
        return;

      case 'phase':
        if (ev.phase === 'enemy') {
          this.$cb.classList.add('is-enemy-turn');
          this.ctx.atmosphere?.dread?.(0.45, 0.5);
          this._banner('Their Turn', 'enemy');
          await this._wait(this._d(0.34));
        } else if (ev.phase === 'player') {
          this.$cb.classList.remove('is-enemy-turn');
          this.ctx.atmosphere?.dread?.(0.1, 0.7);
        }
        return;

      case 'turn:start':
        if (ev.side === 'player') {
          this.$turnN.textContent = String(ev.turn);
          this._banner(`Your Turn ${ev.turn}`, 'player');
          this.ctx.audio?.play?.('combat:turn-start');
          await this._wait(this._d(0.22));
        } else {
          const v = this.views.get(ev.actorId);
          if (v) {
            this._focusEnemy(v.id);
            await v.windup(v.lastIntent?.type || 'attack');
          }
        }
        return;

      case 'turn:end':
        if (ev.side === 'player') {
          this.ctx.audio?.play?.('combat:turn-end');
          await this.hand.discardAll();
        } else {
          const v = this.views.get(ev.actorId);
          if (v) await v.settle();
          this._focusEnemy(null);
          await this._wait(this._d(0.1));
        }
        return;

      case 'draw': {
        const run = [ev, ...this._takeRun('draw')];
        this.hand.draw(run.map(r => this._handCard(r.card)));
        this._syncPiles();
        this.ctx.audio?.play?.('card:draw');
        await this._wait(this._d(0.1 + run.length * 0.045));
        return;
      }

      case 'discard':
        if (ev.cardUid === this._playedUid) { this._syncPiles(); return; }
        await this.hand.discard(ev.cardUid);
        this._syncPiles();
        return;

      case 'exhaust':
        this._syncPiles();
        if (ev.cardUid === this._playedUid) return;
        await this.hand.exhaust(ev.cardUid);
        return;

      case 'card:add':
        if (ev.pile === 'hand') this.hand.draw([this._handCard(ev.card)]);
        this._syncPiles();
        return;

      case 'shuffle':
        this._syncPiles();
        this.ctx.audio?.play?.('card:shuffle');
        this.$drawPile.classList.remove('is-shuffle');
        void this.$drawPile.offsetWidth;
        this.$drawPile.classList.add('is-shuffle');
        await this._wait(this._d(0.16));
        return;

      case 'energy':
        this._syncPluck(ev.after, ev.max ?? E.player.energyMax);
        return;

      case 'damage':
        await this._animDamage(ev);
        return;

      case 'block': {
        if (ev.amount <= 0) return;
        this._syncActor(ev.actorId);
        const c = this._pointOf(ev.actorId);
        this.fx.shimmer(c.x, c.y, this.fx.col.guard);
        this.fx.number(c.x, c.y - 14, `+${ev.amount}`, { kind: 'block', mag: ev.amount });
        if (ev.actorId === E.player.id) this.$pl.classList.add('is-guarding');
        else this.views.get(ev.actorId)?.shimmer();
        this.ctx.audio?.play?.('combat:block-gain');
        await this._wait(this._d(0.13));
        if (ev.actorId === E.player.id) this.$pl.classList.remove('is-guarding');
        this._renderIncoming(0);
        return;
      }

      case 'block:break': {
        const c = this._pointOf(ev.targetId);
        this.fx.shatter(c.x, c.y, this.fx.col.guard);
        this.fx.word(c.x, c.y - 34, 'GUARD BROKEN', 'shatter');
        this.ctx.audio?.play?.('combat:block-break');
        this._addShake(0.5);
        await this._wait(this._d(0.14));
        this._syncActor(ev.targetId);
        return;
      }

      case 'block:lose':
        this._syncActor(ev.actorId);
        this._renderIncoming(0);
        return;

      case 'heal': {
        const c = this._pointOf(ev.actorId);
        this.fx.number(c.x, c.y - 20, `+${ev.amount}`, { kind: 'heal', mag: ev.amount });
        this.fx.shimmer(c.x, c.y, this.fx.col.flame);
        this.ctx.audio?.play?.('combat:heal');
        this._syncActor(ev.actorId);
        await this._wait(this._d(0.14));
        return;
      }

      case 'status': {
        this._syncActor(ev.actorId);
        if (ev.delta === 0) return;
        const c = this._pointOf(ev.actorId);
        if (ev.reason !== 'decay' && Math.abs(ev.delta) > 0) {
          this.fx.word(c.x, c.y - 46, `${ev.delta > 0 ? '+' : ''}${ev.delta} ${ev.name}`,
            ev.kind === 'debuff' ? 'debuff' : 'buff');
          this.ctx.audio?.play?.(ev.kind === 'debuff' ? 'combat:status-apply-debuff' : 'combat:status-apply-buff');
          await this._wait(this._d(0.11));
        }
        return;
      }

      case 'intent': {
        const v = this.views.get(ev.enemyId);
        if (v) v.setIntent(ev.intent, { playerHp: E.player.hp, playerBlock: E.player.block });
        this._renderIncoming(0);
        return;
      }

      case 'summon': {
        const en = E.enemies.find(x => x.id === ev.entity.id);
        if (en) this._addEnemyView(en);
        this.ctx.audio?.play?.('world:rescue-chime');
        await this._wait(this._d(0.2));
        return;
      }

      case 'death':
        await this._animDeath(ev);
        return;

      case 'counter': {
        const v = this.views.get(ev.ownerId);
        if (v) {
          const c = this._pointOf(ev.ownerId);
          if (ev.delta) this.fx.word(c.x, c.y - 56, `${ev.delta > 0 ? '+' : ''}${ev.delta} ${ev.name || ev.id}`, 'counter');
        }
        return;
      }

      case 'card:invalid':
        this._deny(ev.reason);
        return;

      case 'combat:end':
        await this._animEnd(ev);
        return;

      default:
        return;
    }
  }

  /* ── damage ──────────────────────────────────────────────────────────── */
  async _animDamage(ev) {
    const E = this.engine;
    const isPlayer = ev.targetId === E.player.id;
    const src = this.views.get(ev.sourceId);
    const tgt = isPlayer ? null : this.views.get(ev.targetId);

    // the attacker commits — this is the contact beat
    if (src && !src.dying) await src.strike();

    const c = this._pointOf(ev.targetId);
    const hpLoss = ev.hpLoss || 0;
    const blockedAll = hpLoss <= 0 && ev.blocked > 0;

    // impact
    const dir = isPlayer ? Math.PI * 0.85 : -0.5;
    this.fx.slash(c.x, c.y, dir, blockedAll ? this.fx.col.guard : this.fx.col.threat);
    this.fx.burst(c.x, c.y, {
      color: blockedAll ? this.fx.col.guard : this.fx.col.threatHi,
      count: Math.min(30, 8 + Math.round((ev.amount || 0) * 0.9)),
      speed: 240 + (ev.amount || 0) * 12,
    });

    if (blockedAll) {
      this.fx.number(c.x, c.y - 18, ev.amount, { kind: 'blocked', mag: ev.amount });
    } else {
      this.fx.number(c.x, c.y - 18, hpLoss, { kind: isPlayer ? 'taken' : 'damage', mag: hpLoss });
      if (ev.blocked > 0) this.fx.number(c.x + 54, c.y + 6, ev.blocked, { kind: 'blocked', mag: ev.blocked, delay: 0.06 });
    }

    if (isPlayer) {
      this._playerHit(hpLoss, blockedAll);
    } else if (tgt) {
      if (blockedAll) tgt.clank(ev.amount);
      else tgt.flinch(hpLoss, ev.sourceId === E.player.id ? 1 : -1);
      tgt.setState(E.state.enemies.find(x => x.id === ev.targetId) || {});
    }

    // shake scaled to Courage actually lost, never to the raw number
    this._addShake(Math.min(1.5, hpLoss / 12 + (blockedAll ? 0.12 : 0.18)));
    this.ctx.atmosphere?.impact?.(c, {
      strength: Math.min(1.8, 0.35 + hpLoss / 14),
      color: blockedAll ? 0x8fb7d9 : (isPlayer ? 0xf26d78 : 0xffb64a),
      shake: false,
    });
    this.ctx.audio?.play?.(hpLoss >= 12 ? 'combat:hit-heavy'
      : isPlayer ? 'combat:player-hurt' : 'combat:hit-light');

    // hitstop on big hits ONLY
    if (hpLoss >= 12 && !this.reduceMotion) await this.ctx.clock.hitstop(0.16, 0.075);

    this._syncActor(ev.targetId);
    this._renderIncoming(0);
    await this._wait(this._d(ev.hits > 1 ? 0.115 : 0.19));
  }

  _playerHit(hpLoss, blocked) {
    this.$pl.classList.remove('is-hit', 'is-clank');
    void this.$pl.offsetWidth;
    this.$pl.classList.add(blocked ? 'is-clank' : 'is-hit');
    if (this.flashes && !blocked) {
      this.$plFlash.style.opacity = String(Math.min(0.9, 0.35 + hpLoss / 22));
      this._plFlash = 1;
    }
  }

  async _animDeath(ev) {
    const v = this.views.get(ev.actorId);
    if (!v) return;
    const c = v.centre();
    const pal = v.def?.palette || null;
    this.ctx.audio?.play?.('combat:enemy-death');
    const local = this.fx.toLocal(c.x, c.y);
    // "a beat of silence"
    this.ctx.atmosphere?.pulse?.(0x6fd9ec, 0.14, 0.5);
    const dying = v.die();
    await this._wait(this._d(0.24));
    this.fx.death(local.x, local.y, pal);
    this._addShake(0.45);
    await dying;
    v.el.classList.add('is-removed');
    await this._wait(this._d(0.18));
    this._renderIncoming(0);
  }

  async _animEnd(ev) {
    this.hand.lock();
    this._focusEnemy(null);
    this.$cb.classList.add(ev.victory ? 'is-won' : 'is-lost');
    this._banner(ev.victory ? 'Room Cleared' : 'Out of Courage', ev.victory ? 'win' : 'lose', 2.2);
    this.ctx.atmosphere?.dread?.(ev.victory ? 0 : 0.9, 0.8);
    this.ctx.audio?.stinger?.(ev.victory ? 'sting:victory' : 'sting:defeat');
    await this._wait(this._d(1.1));
    if (ev.victory && this.ctx.run) {
      this.ctx.scenes?.go?.('reward', { seed: this.engine.seed });
    } else if (!ev.victory && this.ctx.run) {
      this.ctx.scenes?.go?.('gameover', {});
    }
  }

  /* ══ state sync ═════════════════════════════════════════════════════════ */
  _syncAll() {
    if (!this.engine) return;
    const st = this.engine.state;
    this.$turnN.textContent = String(st.turn);
    this._syncPlayer(st);
    for (const e of st.enemies) this.views.get(e.id)?.setState(e);
    this._syncPiles(st);
    this._syncPluck(st.player.energy, st.player.energyMax);
    this._syncKeeps(st);
    this._syncHandPlayability();
    this._renderIncoming(0);
    this._syncEndTurn();
  }

  _syncActor(id) {
    const st = this.engine.state;
    if (id === this.engine.player.id) this._syncPlayer(st);
    else this.views.get(id)?.setState(st.enemies.find(e => e.id === id) || {});
  }

  _syncPlayer(st) {
    st = st || this.engine.state;
    const p = st.player;
    const pct = Math.max(0, Math.min(1, p.hp / (p.maxHp || 1)));
    this.$hpFill.style.transform = `scaleX(${pct.toFixed(4)})`;
    this.$hpTxtN.textContent = String(Math.max(0, p.hp));
    this.$hpTxtM.textContent = '/' + p.maxHp;
    this.$hpN.textContent = String(Math.max(0, p.hp));
    this.$hpM.textContent = '/' + p.maxHp;
    this.$gold.textContent = String(this.ctx.run?.gold ?? 0);
    this.$plName.textContent = p.name || 'You';
    this.$pl.classList.toggle('is-low', pct <= 0.3);
    this._hpTarget = pct;
    if (this._hpGhostV === undefined) { this._hpGhostV = pct; this.$hpGhost.style.transform = `scaleX(${pct})`; }
    if (pct < this._hpGhostV) this._hpGhostAt = performance.now();
    else if (pct > this._hpGhostV) { this._hpGhostV = pct; this.$hpGhost.style.transform = `scaleX(${pct})`; }

    if (!this.$plGuard.classList.contains('is-preview')) {
      if (p.block > 0) { this.$plGuard.hidden = false; this.$plGuardN.textContent = String(p.block); }
      else this.$plGuard.hidden = true;
    }
    this._renderStatusRow(p.statuses || []);
  }

  _renderStatusRow(list) {
    const key = list.map(s => s.id + ':' + s.stacks).join('|');
    if (key === this._plStatusKey) return;
    this._plStatusKey = key;
    this.$statuses.textContent = '';
    for (const s of list) {
      const d = document.createElement('span');
      d.className = 'cb-status';
      d.dataset.kind = s.kind || 'buff';
      d.dataset.id = s.id;
      d.tabIndex = 0;
      d.setAttribute('role', 'listitem');
      d.dataset.tip = `${s.name}|${s.desc || ''}|${decayLine(s.decay)}`;
      d.setAttribute('aria-label', `${s.name} ${s.stacks}. ${s.desc || ''}`);
      d.innerHTML = statusIcon(s.id) + (s.showStacks === false ? '' : `<b>${s.stacks}</b>`);
      this.$statuses.appendChild(d);
    }
  }

  _syncPiles(st) {
    st = st || this.engine.state;
    this.$drawPile.querySelector('b').textContent = String(st.counts?.draw ?? st.piles.draw.length);
    this.$discardPile.querySelector('b').textContent = String(st.counts?.discard ?? st.piles.discard.length);
  }

  _syncPluck(cur, max) {
    const c = cur ?? this.engine.player.energy;
    const m = max ?? this.engine.player.energyMax;
    if (this._pluckV === c && this._pluckM === m) return;
    const dropped = this._pluckV !== undefined && c < this._pluckV;
    this._pluckV = c; this._pluckM = m;
    this.$pluckN.textContent = String(c);
    this.$pluckM.textContent = '/' + m;
    this.$pluckArc.style.strokeDashoffset = String(this._arcLen * (1 - Math.max(0, Math.min(1, c / (m || 1)))));
    this.$pluck.classList.toggle('is-empty', c <= 0);
    this.$pluck.classList.remove('is-spend', 'is-gain');
    void this.$pluck.offsetWidth;
    this.$pluck.classList.add(dropped ? 'is-spend' : 'is-gain');
    this.hand?.setEnergy(c);
    this._syncHandPlayability();
    this._syncEndTurn();
  }

  _syncKeeps(st) {
    const relics = st.relics || [];
    const key = relics.map(r => r.id + ':' + r.counter).join('|') || 'none';
    if (key === this._keepKey) return;
    this._keepKey = key;
    this.$keeps.textContent = '';
    if (!relics.length) {
      const d = document.createElement('div');
      d.className = 'cb-keep is-empty';
      d.dataset.tip = `${TERMS.relic}s|You are carrying none yet.|Find them in treasure rooms, Big Scares and Lost Things.`;
      d.tabIndex = 0;
      d.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${RELIC_G}"/></svg><span>No ${TERMS.relic}s</span>`;
      this.$keeps.appendChild(d);
      return;
    }
    for (const r of relics) {
      const d = document.createElement('div');
      d.className = 'cb-keep';
      d.setAttribute('role', 'listitem');
      d.tabIndex = 0;
      d.dataset.tip = `${r.name}|${r.desc || ''}|`;
      d.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${RELIC_G}"/></svg>`
        + (r.counter != null ? `<b>${r.counter}</b>` : '');
      this.$keeps.appendChild(d);
    }
  }

  _syncHandPlayability() {
    if (!this.hand) return;
    this.hand.setPlayable((card) => {
      const t = this._defaultTargetFor(card.uid);
      return this.engine.canPlay(card.uid, t).ok;
    });
  }

  /** STS2 §1: End Turn *changes state* when the hand has nothing playable. */
  _syncEndTurn() {
    if (!this.engine || !this.hand) return;
    const playerTurn = this.engine.phase === 'player' && !this.engine.over;
    const any = this.engine.state.piles.hand.some(c =>
      this.engine.canPlay(c.uid, this._defaultTargetFor(c.uid)).ok);
    this.$endTurn.disabled = !playerTurn;
    this.$endTurn.classList.toggle('is-ready', playerTurn && !any);
    this.$endTurn.classList.toggle('is-waiting', playerTurn && any);
    this.$endTurn.dataset.tip = playerTurn
      ? (any ? 'End Turn|You still have Tricks you can play.|Shortcut: E'
        : 'End Turn|Nothing left you can play.|Shortcut: E')
      : 'End Turn|Not your turn.||';
  }

  _handCard(snap) {
    const def = this.engine.card(snap.uid)?.def || snap;
    return { uid: snap.uid, def, upgraded: snap.upgraded, cost: snap.cost };
  }

  _addEnemyView(en) {
    const snap = this.engine.state.enemies.find(e => e.id === en.id);
    if (!snap || this.views.has(en.id)) return;
    const v = new EnemyView(snap, { clock: this.ctx.clock, reduceMotion: this.reduceMotion, def: en.def });
    v.el.addEventListener('pointerenter', () => this._enemyHover(v, true));
    v.el.addEventListener('pointerleave', () => this._enemyHover(v, false));
    v.intentView.el.addEventListener('pointerenter', () => this._showTip(v.intentView.el, v.intentView.tooltipHTML(), true));
    v.intentView.el.addEventListener('pointerleave', () => this._hideTip());
    this.views.set(en.id, v);
    this.$enemies.appendChild(v.el);
    this._layoutEnemies();
  }

  /* ══ ui plumbing ════════════════════════════════════════════════════════ */
  _bindUi() {
    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); this._offs.push(() => el.removeEventListener(ev, fn, o)); };

    on(this.$endTurn, 'click', () => this._endTurn());
    on(this.$drawPile, 'click', () => this._openPile('draw'));
    on(this.$discardPile, 'click', () => this._openPile('discard'));
    on(this.root.querySelector('.cb-pileview__x'), 'click', () => this._closePile());
    on(this.$pileview, 'click', (e) => { if (e.target === this.$pileview) this._closePile(); });

    // tooltips for anything carrying data-tip
    this._onOver = (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (!t) return;
      this._showTip(t, tipHTML(t.dataset.tip));
    };
    this._onOut = (e) => { if (e.target.closest?.('[data-tip]')) this._hideTip(); };
    on(this.root, 'pointerover', this._onOver);
    on(this.root, 'pointerout', this._onOut);
    on(this.root, 'focusin', this._onOver);
    on(this.root, 'focusout', this._onOut);
    this._onPointer = (e) => { this._pt.x = e.clientX; this._pt.y = e.clientY; };
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    this._offs.push(() => window.removeEventListener('pointermove', this._onPointer));

    // keyboard: full parity. The Hand owns 1-9 / arrows / enter; we own the rest.
    this._onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'e') { e.preventDefault(); this._endTurn(); }
      else if (k === 'q') { e.preventDefault(); this._openPile('draw'); }
      else if (k === 'w') { e.preventDefault(); this._openPile('discard'); }
      else if (e.key === 'Escape' && !this.$pileview.hidden) { e.preventDefault(); this._closePile(); }
    };
    window.addEventListener('keydown', this._onKey);
    this._offs.push(() => window.removeEventListener('keydown', this._onKey));
  }

  async _endTurn() {
    if (this._resolving || !this.engine || this.engine.over) return;
    if (this.engine.phase !== 'player') return;
    this._resolving = true;
    this._clearPreview();
    this.hand.lock();
    this.ctx.audio?.play?.('ui:confirm');
    try { await this.engine.endTurn(); } catch (e) { console.error('[combat] endTurn', e); }
    await this._settle();
    this._resolving = false;
    if (!this.engine.over && this.engine.phase === 'player') this.hand.unlock();
    this._syncEndTurn();
  }

  _focusEnemy(id) {
    this.$enemies.classList.toggle('is-focusing', !!id);
    for (const v of this.views.values()) v.el.classList.toggle('is-focus', v.id === id);
  }

  _banner(text, kind, hold = 1.05) {
    const b = this.$banner;
    b.textContent = text;
    b.dataset.kind = kind || '';
    b.classList.remove('is-on');
    void b.offsetWidth;
    b.classList.add('is-on');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('is-on'), hold * 1000 / this.speed);
  }

  _deny(reason) {
    this.$deny.textContent = reason || 'You cannot do that.';
    this.$deny.classList.remove('is-on');
    void this.$deny.offsetWidth;
    this.$deny.classList.add('is-on');
    this.ctx.audio?.play?.('ui:deny');
    clearTimeout(this._denyT);
    this._denyT = setTimeout(() => this.$deny.classList.remove('is-on'), 1500);
  }

  _addShake(k) {
    if (!this.shakeAmt) return;
    this._shake.mag = Math.min(28, this._shake.mag + 13 * k * this.shakeAmt);
    this.ctx.stage?.shake?.(0.05 + 0.09 * k, 11);
  }

  /** Layer-local point for FX, from an actor id. */
  _pointOf(id) {
    if (id === this.engine?.player?.id) {
      const r = this.$pl.querySelector('.cb-player__figure').getBoundingClientRect();
      return this.fx.toLocal(r.left + r.width / 2, r.top + r.height * 0.5);
    }
    const v = this.views.get(id);
    if (!v) return this.fx.toLocal(this.fx.w / 2 + this.fx.left, this.fx.h / 2 + this.fx.top);
    const c = v.centre();
    return this.fx.toLocal(c.x, c.y);
  }

  _wait(s) { return this.ctx.clock.wait(Math.max(0.001, s)); }

  /* ── pile viewer ─────────────────────────────────────────────────────── */
  _openPile(which) {
    if (!this.engine) return;
    const st = this.engine.state;
    // The draw pile's ORDER is secret; sort it so looking is information, not an oracle.
    const cards = which === 'draw'
      ? st.piles.draw.slice().sort((a, b) => a.name.localeCompare(b.name))
      : st.piles.discard.slice().reverse();
    this.$pileTitle.textContent = which === 'draw'
      ? `Draw pile — ${cards.length} ${cards.length === 1 ? 'Trick' : 'Tricks'} (order hidden)`
      : `Discard pile — ${cards.length} ${cards.length === 1 ? 'Trick' : 'Tricks'}`;
    this.$pileGrid.textContent = '';
    this._pileViews?.forEach(v => v.destroy());
    this._pileViews = [];
    for (const c of cards) {
      const def = this.engine.card(c.uid)?.def || c;
      const v = new CardView(def, { uid: c.uid, upgraded: c.upgraded, cost: c.cost, largeText: this.largeText, reduceMotion: true });
      const wrap = document.createElement('div');
      wrap.className = 'cb-pilecard';
      wrap.appendChild(v.el);
      v.setTransform({ x: 0, y: 0, rot: 0, scale: 1, z: 0 });
      this.$pileGrid.appendChild(wrap);
      this._pileViews.push(v);
    }
    if (!cards.length) {
      const d = document.createElement('p');
      d.className = 'cb-pileview__none';
      d.textContent = 'Nothing here.';
      this.$pileGrid.appendChild(d);
    }
    this.$pileview.hidden = false;
    this.ctx.audio?.play?.('ui:open-panel');
    this.root.querySelector('.cb-pileview__x')?.focus();
  }

  _closePile() {
    this.$pileview.hidden = true;
    this._pileViews?.forEach(v => v.destroy());
    this._pileViews = [];
    this.$pileGrid.textContent = '';
    this.ctx.audio?.play?.('ui:close-panel');
  }

  /* ── tooltips ────────────────────────────────────────────────────────── */
  _showTip(anchor, html) {
    if (!html) return;
    // Prefer the shared tooltip if ui-chrome has shipped a real one.
    if (!this._tipProbed) {
      this._tipProbed = true;
      this._tipShared = false;
      try {
        const before = this.ctx.tipLayer?.childElementCount ?? 0;
        this.ctx.tooltip?.show?.(anchor, html);
        this._tipShared = (this.ctx.tipLayer?.childElementCount ?? 0) > before;
        if (this._tipShared) return;
        this.ctx.tooltip?.hide?.();
      } catch { /* fall through to our own */ }
    }
    if (this._tipShared) { this.ctx.tooltip?.show?.(anchor, html); return; }

    if (!this._tipEl) {
      this._tipEl = document.createElement('div');
      this._tipEl.className = 'cb-tip';
      (this.ctx.tipLayer || document.body).appendChild(this._tipEl);
    }
    this._tipEl.innerHTML = html;
    this._tipEl.classList.add('is-on');
    const r = anchor.getBoundingClientRect();
    const t = this._tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    let y = r.top - t.height - 12;
    if (y < 8) y = r.bottom + 12;
    x = Math.max(8, Math.min(window.innerWidth - t.width - 8, x));
    this._tipEl.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  }

  _hideTip() {
    if (this._tipShared) { this.ctx.tooltip?.hide?.(); return; }
    this._tipEl?.classList.remove('is-on');
  }

  /* ══ frame ══════════════════════════════════════════════════════════════ */
  _frame(dt, t) {
    if (!this.engine) return;
    for (const v of this.views.values()) v.update(dt, t);
    this.fx?.update(dt);

    // screen shake on the DOM layer (stage.shake only moves the 3D camera)
    const s = this._shake;
    if (s.mag > 0.05) {
      s.mag *= Math.max(0, 1 - dt * 7.5);
      s.ph += dt * 46;
      const m = s.mag;
      this.$cb.style.transform =
        `translate3d(${(Math.sin(s.ph) * m).toFixed(2)}px,${(Math.cos(s.ph * 1.37) * m * 0.7).toFixed(2)}px,0)`;
    } else if (s.mag) {
      s.mag = 0;
      this.$cb.style.transform = '';
    }

    // player hit flash decay
    if (this._plFlash > 0) {
      this._plFlash -= dt * 4.6;
      this.$plFlash.style.opacity = String(Math.max(0, this._plFlash * 0.8));
    }

    // player Courage bar lags behind so the loss reads
    if (this._hpTarget !== undefined && this._hpGhostV > this._hpTarget) {
      const held = this._hpGhostAt && performance.now() - this._hpGhostAt < 300;
      if (!held) {
        this._hpGhostV = Math.max(this._hpTarget, this._hpGhostV - dt * 0.8);
        this.$hpGhost.style.transform = `scaleX(${this._hpGhostV.toFixed(4)})`;
      }
    }
  }

  update() { /* driven by clock.onFrame */ }

  /* ══ teardown ═══════════════════════════════════════════════════════════ */
  async exit() {
    this._offFrame?.();
    this._ro?.disconnect();
    for (const off of this._offs) { try { off(); } catch {} }
    for (const off of this._engineOffs) { try { off(); } catch {} }
    this._offs.length = 0; this._engineOffs.length = 0;
    clearTimeout(this._bannerT); clearTimeout(this._denyT);
    this._q.length = 0;
    this.hand?.destroy();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this._pileViews?.forEach(v => v.destroy());
    this.fx?.destroy();
    this._tipEl?.remove(); this._tipEl = null;
    this.ctx.tooltip?.hide?.();
    this.ctx.atmosphere?.dread?.(0, 0.3);
    this.engine = null;
  }
}

/* ── helpers ────────────────────────────────────────────────────────────── */
const _cssCache = new Map();
function ensureCss(href) {
  if (_cssCache.has(href)) return _cssCache.get(href);
  const p = new Promise((resolve) => {
    if (document.querySelector(`link[data-mmcss="${href}"]`)) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.mmcss = href;
    l.addEventListener('load', () => resolve(), { once: true });
    l.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(l);
    setTimeout(resolve, 1500);
  });
  _cssCache.set(href, p);
  return p;
}

/**
 * Enemy content addresses Tricks and other enemies by **id string**
 * (`c.addCard('clutter','discard')`, `c.summon('dust-bunny')`) while the engine's
 * EnemyCtx wants a def object. Rather than have either agent guess, the scene
 * resolves ids at boot: a pure look-up adapter, no rules involved.
 * Reported to the integrator — delete this the moment the seam is agreed.
 */
async function makeIdResolver(getEnemy) {
  let cardById = null, statusTricks = [];
  try { ({ cardById } = await import('../data/cards.js')); } catch { /* no card registry yet */ }
  try { ({ STATUS_TRICK_DEFS: statusTricks = [] } = await import('../data/enemies/_lib.js')); } catch { /* none */ }
  const extra = new Map(statusTricks.map(c => [c.id, c]));
  return {
    card: (d) => {
      if (!d || typeof d !== 'string') return d;
      return extra.get(d) || cardById?.(d) || cardById?.('status/' + d) || d;
    },
    enemy: (d) => (typeof d === 'string' ? (getEnemy(d) || d) : d),
  };
}

const CTX_HOOKS = ['onSpawn', 'onDeath', 'onTurnStart', 'onTurnEnd', 'onDamaged',
  'onPlayerCard', 'onPlayerTurnEnd', 'onAllyDeath', 'onAttacked'];

function adaptEnemyDef(def, resolve) {
  if (!def || def.__adapted) return def;
  const wrap = (fn) => (typeof fn !== 'function' ? fn : function (c, ...rest) {
    const c2 = Object.create(c);
    if (typeof c.addCard === 'function') c2.addCard = (d, p, o) => c.addCard(resolve.card(d), p, o);
    if (typeof c.summon === 'function') c2.summon = (d, o) => c.summon(resolve.enemy(d), o);
    return fn.call(this, c2, ...rest);
  });
  const out = Object.create(Object.getPrototypeOf(def));
  Object.assign(out, def);
  out.__adapted = true;
  out.moves = {};
  for (const k in def.moves || {}) out.moves[k] = { ...def.moves[k], effect: wrap(def.moves[k].effect) };
  for (const h of CTX_HOOKS) if (def[h]) out[h] = wrap(def[h]);
  return out;
}

function statusIcon(id) {
  const d = SG[id];
  if (!d) return `<i class="cb-status__letter">${String(id).charAt(0).toUpperCase()}</i>`;
  const stroke = SG_STROKE.has(id) ? ' class="is-stroke"' : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${stroke}><path d="${d}"/></svg>`;
}

function decayLine(decay) {
  if (decay === 'turnEnd') return 'One stack wears off at the end of the turn.';
  if (decay === 'turnStart') return 'It ticks at the start of the turn.';
  return 'It lasts the whole Scuffle.';
}

/** `Title|body|note` -> tooltip HTML. */
function tipHTML(raw) {
  if (!raw) return '';
  const [title, body, note] = String(raw).split('|');
  return `${title ? `<div class="cb-tip__title">${esc(title)}</div>` : ''}`
    + `${body ? `<div class="cb-tip__body">${esc(body)}</div>` : ''}`
    + `${note ? `<div class="cb-tip__note">${esc(note)}</div>` : ''}`;
}

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

export default CombatScene;
