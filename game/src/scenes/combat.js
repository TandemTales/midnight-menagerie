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
import { makeDummyCombat } from '../combat/dummy.js';
import { previewIncoming } from '../combat/preview.js';
import { TERMS } from '../data/schema.js';
import { Hand } from '../ui/hand.js';
import { CardView, ART_W, ART_H, CARD_SS } from '../ui/card.js';
import { warmArt } from '../ui/cardart.js';
import { EnemyView, PlayerView, statusGlyph } from '../ui/enemy.js';
import { CombatFX } from '../fx/combatfx.js';
import { HUD } from '../ui/hud.js';
import { openPile } from '../ui/deckview.js';

const CSS = new URL('./combat.css', import.meta.url).href;
const CARD_CSS = new URL('../ui/card.css', import.meta.url).href;
const HAND_CSS = new URL('../ui/hand.css', import.meta.url).href;
const PORTRAITS = new URL('../../assets/portraits/', import.meta.url).href;

/** Seconds from `card:play` to the effect resolving. See `_onPlay`. */
const PLAY_RESOLVE = 0.44;

/* ─────────────────────────────────────────────────────────────────────────────
 * WHICH ROOM ARE WE IN?
 *
 * `atmosphere.setMood(region)` and nothing else meant the Formal Dining Room,
 * the Music Room, East Landing, the Grand Coatcheck's Big Scare and The Butler
 * all played in one identical warm gallery. The map names 13 rooms per region
 * and promises 13 places.
 *
 * The atmosphere layer is data-driven and owns seventeen fully authored rooms
 * (geometry, camera, palette, props, shafts, particles). It does not yet expose
 * a per-ROOM variation hook — see docs/NOTES.md for the precise ask. What it
 * DOES expose is `setMood(name)`, so a room picks the authored space it most
 * honestly is: the Music Room plays in the ballroom, the Formal Dining Room in
 * the kitchens' long service space, East Landing in the passages.
 *
 * Matched on `node.roomName` (state/mapgen.js authors all 340). First hit wins,
 * and anything unmatched falls back to the region — never worse than before.
 */
/** Run region slugs are not all atmosphere keys. */
const REGION_KEY = {
  'sleeping-quarters': 'sleeping', 'kitchens-cellars': 'kitchens', cellars: 'kitchens',
  conservatory: 'greenhouse', 'study-library': 'study', library: 'study',
  'attic-observatory': 'attic', observatory: 'attic', ossuary: 'crypt',
  'hedge-maze': 'hedge', 'secret-passages': 'passages', 'pumpkin-grounds': 'pumpkin',
};

const ROOM_MOOD = [
  // the Foyer's own grand spaces must win before the catch-all "…Hall" rule
  [/vestibule|entry hall|entrance|grand staircase|main stair|front hall/i, 'foyer'],
  [/ballroom|music|dance|salon|revels|velvet|mask room|supper|drawing room|reception|receiving/i, 'ballroom'],
  [/dining|breakfast|refreshment|pantry|kitchen|scullery|larder|milk|flour|spice|pastry|bottle|dish|buttery/i, 'kitchens'],
  [/librar|study|book|read|archive|scribe|map room|writing|portrait|globe|curiosit|reference|newspaper|letter|register|parlou?r/i, 'study'],
  [/nurser|playroom|toy|doll|cradle|schoolroom|story|rocking|music box|blanket/i, 'nursery'],
  [/bedroom|bedchamber|sleep|dressing|canopy|box room|underbed|guest suite|guest hall/i, 'sleeping'],
  [/attic|loft|trunk|observator|telescope|star|moon dome|astronom|weather/i, 'attic'],
  [/lamp|candle|wax|lantern|sconce|wick|boiler|chimney|gas valve|match safe|reflector|glow|bell/i, 'lampworks'],
  [/crypt|vault|coffin|burial|ossuar|tomb|marble/i, 'crypt'],
  [/greenhouse|conservator|potting|moss|cactus|seed|garden|mushroom|compost|leaf/i, 'greenhouse'],
  [/bath|wash|steam|sauna|shower|cistern|pump|pipe|towel|locker|drying/i, 'bathhouse'],
  [/kennel|animal|dog|cat room|groom|feed|collar|treat|veterinar|quarantine/i, 'kennels'],
  [/hedge|maze|terrace|court|grounds|pumpkin|balcony|fountain/i, 'hedge'],
  [/grave|mausoleum|memorial|headstone/i, 'graveyard'],
  [/passage|crawlspace|junction|behind the|catwalk|landing|corridor|stair|walk|arcade|gallery|cloak|coat room|hall/i, 'passages'],
];

/**
 * A boss gets a room nobody else in its region fights in. Round 1 put The
 * Butler in the same warm gallery as the first Dust Bunny of the run.
 */
const BOSS_MOOD = {
  // The Butler's Receiving Chamber goes COLD. Every ordinary Foyer room is warm
  // candlelight; the one room where the house decides whether you belong is
  // stone and spectral light, and no Scuffle in the region shares it.
  foyer: 'crypt', nursery: 'attic', sleeping: 'passages', kitchens: 'crypt',
  greenhouse: 'graveyard', graveyard: 'crypt', study: 'attic', attic: 'lampworks',
  lampworks: 'crypt', ballroom: 'crypt', hedge: 'graveyard', passages: 'crypt',
  bathhouse: 'crypt', kennels: 'hedge',
};

/** The atmosphere region a node should actually play in. Exported so a test
 *  can assert the whole 340-room table without booting a scene. */
export function moodForRoom(roomName, region, arena) {
  const base = REGION_KEY[region] || region || 'foyer';
  if (arena === 'boss') return BOSS_MOOD[base] || base;
  const n = String(roomName || '');
  if (n) for (const [re, key] of ROOM_MOOD) if (re.test(n)) return key;
  return base;
}



export class CombatScene extends Scene {
  constructor(ctx) {
    super(ctx);
    this.views = new Map();       // enemyId -> EnemyView
    this._q = [];
    this._offs = [];
    this._engineOffs = [];
    this._shake = { mag: 0, ph: 0 };
    this._pt = { x: 0, y: 0 };
    this._rules = new Map();       // ruleId -> { id, name, text, sourceId }
    this._opening = true;          // see _o(): set-up beats are not play beats
    this._tipOffs = [];            // tooltip.attach() unsubscribes
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
    this._readRoom(params);
    this._buildHud();
    this._wireEngine();
    this._buildEnemies();
    this._buildHand();
    this._bindUi();

    /* Combat is the ONE scene where the canvas is really on screen (measured
       at 57% of pixels), so it never pauses the stage — and it says so out loud
       rather than trusting that whatever came before unpaused on its way out. */
    try { ctx.stage?.setPaused?.(false); } catch { /* no stage */ }

    // THE ROOM, not "the region". See ROOM_MOOD at the top of this file.
    ctx.atmosphere?.setMood?.(this.mood || this.region || 'foyer',
      // per-room seed: without it, the six Foyer rooms that share the 'passages'
      // space render pixel-identically.
      { seed: this.roomName || this.mood || this.region });
    ctx.audio?.music?.(this.arena === 'boss' ? 'boss' : 'combat');

    /* ── the warm-up that never ran ─────────────────────────────────────────
       `ui/cardart.js#warmArt` and `ui/hand.js#warmRaster` were both written for
       exactly this moment and NO scene in the build ever called either of them.
       Measured cost of not calling them: the first `Hand.draw` of five cards
       took 716 ms of synchronous canvas painting inside the frame that starts
       the draw animation. Both are chunked and off the critical path, and both
       finish long before the first card is dealt (~1 s later). */
    this._warmDeck();

    this._offFrame = ctx.clock.onFrame((dt, t) => this._frame(dt, t));
    this._ro = new ResizeObserver(() => { this.fx?.resize(); this._layoutEnemies(); });
    this._ro.observe(this.root);

    this._syncAll();

    /* ── DO NOT AWAIT THE FIGHT HERE ────────────────────────────────────────
       `core/scenes.js#go` awaits `enter()` and only THEN calls
       `transition.reveal()`. Round 1 awaited `startCombat()` and `_settle()`
       inside `enter()`, so the opening banner, the opening statuses, the
       shuffle and the first turn all played to a covered screen — that is the
       "six seconds of near-black" the playtester measured, and no amount of
       trimming animation would have fixed it while the veil was still down.

       Returning here lifts the veil on a built, lit, populated board, and the
       fight opens in front of the player. */
    this._boot = this._begin();
    // The keyboard path starts IN the hand. CONTRACTS §6 wants a keyboard route
    // to every action and `ui/hand.js` already implements the whole thing
    // (1-9 select, arrows, Enter to play, Tab to cycle targets, Esc to cancel);
    // round 1 simply never handed it focus, so Tab from a blurred start never
    // left BODY. `focusHand` is bound to Tab in `_bindUi`; the scene does NOT
    // grab focus on entry, because auto-lifting a card for a mouse player who
    // never touched the keyboard is worse than the problem it solves.
  }

  /**
   * Resolve once the scene manager has finished its reveal, so a boss entrance
   * is not played behind the curtain. Capped, because a missing transition or a
   * queued `go()` must never leave the fight unstarted.
   */
  _untilRevealed() {
    const scenes = this.ctx.scenes;
    if (!scenes || !scenes.busy) return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = performance.now();
      const off = this.ctx.clock.onFrame(() => {
        if (!scenes.busy || performance.now() - t0 > 1600) { off(); resolve(); }
      });
    });
  }

  /** The fight's opening, played AFTER the transition veil lifts. */
  async _begin() {
    try {
      const resumed = this.engine.started;
      if (!resumed && (this.arena === 'boss' || this.arena === 'elite')) {
        // An entrance nobody sees is not an entrance. `core/scenes.js` reveals
        // AFTER `enter()` returns, so wait for the veil to finish lifting
        // before the boss rises. Ordinary Scuffles do not wait — their opening
        // banner reads perfectly well through the last of the fade.
        await this._untilRevealed();
        if (!this.engine) return;
        await this._arenaEntrance();
      }
      if (!this.engine) return;
      // `startCombat()` returns [] on an already-started engine; calling it on a
      // resumed fight is harmless but the settle still has to run so the board
      // matches the restored state.
      if (!resumed) await this.engine.startCombat();
      await this._settle();
    } catch (e) {
      if (this.engine) console.error('[combat] startCombat', e);
    }
    this._opening = false;
  }

  /**
   * Which room is this, and how should it be framed?
   *   `mood`  — the authored atmosphere space this room plays in
   *   `arena` — 'normal' | 'elite' | 'boss', which drives the whole stage
   */
  _readRoom(params) {
    const run = this.ctx.run;
    const node = run && run.currentNode ? run.currentNode : null;
    const meta = run ? run.combatMeta : null;
    this.roomName = (node && node.roomName) || params.room || '';
    this.roomTag = (node && node.roomTag) || '';

    const tier = (meta && meta.tier) || params.tier
      || (this.engine.enemies || []).reduce(
        (t, e) => (e.tier === 'boss' ? 'boss' : t === 'boss' ? t : e.tier === 'elite' ? 'elite' : t), 'standard');
    this.arena = tier === 'boss' ? 'boss' : tier === 'elite' ? 'elite' : 'normal';
    this.mood = moodForRoom(this.roomName, this.region, this.arena);

    this.root.dataset.arena = this.arena;
    this.root.dataset.mood = this.mood;
    if (this.roomName) this.$room.textContent = this.roomName;
    this.$room.hidden = !this.roomName;
  }

  /** Pre-render every CardDef that can reach the hand this fight. */
  _warmDeck() {
    const defs = [];
    const seen = new Set();
    const piles = this.engine.piles || {};
    for (const key of ['draw', 'hand', 'discard', 'exhaust']) {
      for (const c of piles[key] || []) {
        const def = c.def || c;
        if (def && def.id && !seen.has(def.id)) { seen.add(def.id); defs.push(def); }
      }
    }
    if (!defs.length) return;
    try {
      warmArt(defs, ART_W * CARD_SS, ART_H * CARD_SS, { upgraded: 'both' }).catch(() => {});
      this.hand.warmRaster(defs, 6).catch(() => {});
    } catch (e) { console.error('[combat] warm', e); }
  }

  /**
   * A Big Scare or a boss gets an ARENA and an ENTRANCE.
   * STS2-REFERENCE §4: StS2 aims "epic rather than intimate" — a boss should be
   * big, get an entrance, and own the frame. Round 1 gave The Butler, the
   * 250-Courage region boss, the same warm gallery and the same trash-mob scale
   * as a Dust Bunny.
   */
  async _arenaEntrance() {
    const boss = this.arena === 'boss';
    this.ctx.atmosphere?.dread?.(boss ? 0.55 : 0.3, 0.5);
    this.$cb.classList.add('is-arena-in');
    const big = [...this.views.values()].filter(v => v.tier === 'boss' || v.tier === 'elite');
    const named = big[0] || [...this.views.values()][0];
    if (named) {
      this._banner(named.name, boss ? 'boss' : 'elite', boss ? 2.0 : 1.4);
      this.ctx.audio?.stinger?.(boss ? 'sting:boss' : 'sting:elite');
    }
    this.ctx.atmosphere?.pulse?.(boss ? 0xf26d78 : 0xffb64a, 0.18, 0.7);
    await Promise.all(big.map(v => v.enterArena({ big: boss })));
    if (boss && !this.reduceMotion) {
      this._addShake(0.9);
      this.ctx.atmosphere?.impact?.(this._viewportPoint(named), { strength: 1.2, color: 0xf26d78, shake: false });
    }
    this.ctx.atmosphere?.dread?.(boss ? 0.22 : 0.12, 0.8);
    this.$cb.classList.remove('is-arena-in');
    this.$cb.classList.add('is-arena');
  }

  _viewportPoint(v) {
    if (!v) return { x: innerWidth / 2, y: innerHeight / 2 };
    const c = v.centre();
    return { x: c.x, y: c.y };
  }

  /**
   * Hand the keyboard to the Hand. `ui/hand.js` is the single Tab stop for the
   * whole hand and auto-selects the middle card on focusin.
   */
  focusHand() {
    const el = this.hand && this.hand.el;
    if (!el || !el.isConnected) return false;
    el.focus({ preventScroll: true });
    return document.activeElement === el || el.contains(document.activeElement);
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

  /**
   * An OPENING duration. Everything the engine emits between `startCombat()`
   * and the first player turn is set-up, not play: statuses the encounter
   * builder applied, the opening shuffle, the first intent roll. Round 1 gave
   * each of them its full ceremony and the player watched a near-black screen
   * for 6-7 seconds before their first card existed (measured: combat:start
   * 415 ms, two status words 235 ms, shuffle 166 ms, turn banner 233 ms).
   *
   * STS2-REFERENCE §8: "Nothing makes you wait." During the opening these
   * collapse to a third; after it they are exactly `_d`.
   */
  _o(sec) { return this._opening ? this._d(sec * 0.34) : this._d(sec); }

  /* ── engine construction ─────────────────────────────────────────────── */
  async _makeEngine(params) {
    const ctx = this.ctx;
    if (ctx.run?.combat instanceof CombatEngine) {
      this.region = ctx.run.region || 'foyer';
      this.companion = ctx.run.companion || 'marmalade';
      return ctx.run.combat;
    }

    const seed = Number(params.seed ?? ctx.run?.seed ?? 42) || 42;
    /* FORK, never the run's own stream. Drawing straight from `ctx.run.rng`
       advances the run's sequence by however many rolls this fight happens to
       need, so the same seed stops reproducing the same run the moment anyone
       deep-links a combat. `RNG#fork` gives a stream derived from the seed and
       a label, which is stable and independent. */
    const rng = (ctx.run && typeof ctx.run.fork === 'function')
      ? ctx.run.fork(`combat:deeplink:${params.node ?? params.encounter ?? seed}`)
      : new RNG(seed);
    this.companion = params.companion || ctx.run?.companion || 'marmalade';
    this.region = params.region || ctx.run?.region || 'foyer';

    // A run that exists but has not built its own engine (deep link into a
    // Scuffle mid-expedition) still carries Keepsakes. Hand them over, or the
    // HUD's Keepsake bar goes empty for a fight the player is genuinely
    // carrying them into — and the relic hooks silently stop firing.
    let deck = null, enemies = null, hp = null, energyMax = 3;
    let relics = Array.isArray(ctx.run?.keepsakes) ? ctx.run.keepsakes : [];

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
      const [{ getEnemy, hasEnemy, ENEMY_STATUSES, ENEMY_LIST }, enc, statuses] = await Promise.all([
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
        enemies = members.map((mm, i) => {
          const def = getEnemy(mm.enemyId);
          return def ? { def, hp: mm.hp || undefined, id: `e${i}` } : null;
        }).filter(Boolean);
        this._enemyDefs = ENEMY_LIST;
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
      // Teach the engine the content vocabulary its EnemyCtx resolves ids against.
      try {
        const [cards, lib] = await Promise.all([
          import('../data/cards.js'), import('../data/enemies/_lib.js'),
        ]);
        engine.registerCards(cards.allCards());
        engine.registerCards(lib.STATUS_TRICK_DEFS || []);
      } catch { /* nothing to register */ }
      try { engine.registerEnemies(this._enemyDefs || []); } catch { /* none */ }

      this.usingRealContent = true;
      return engine;
    }

    // last resort — always playable
    this.usingRealContent = false;
    return makeDummyCombat(rng);
  }

  /* ══ DOM ════════════════════════════════════════════════════════════════ */
  _buildDom(params) {
    const T = TERMS;
    this.root.innerHTML = `
      <div class="cb">
        <header class="cb-top"></header>

        <div class="cb-field">
          <div class="cb-arena" aria-hidden="true">
            <div class="cb-arena__spot"></div>
            <div class="cb-arena__floor"></div>
          </div>
          <div class="cb-enemies" role="group" aria-label="Enemies"></div>
          <!-- THE KID STANDS HERE. See PlayerView in ui/enemy.js and the
               .cb-hero block in combat.css: round 3 had no player body on the
               board at all, only the framed portrait below.
               (No backticks in this comment — CONTRACTS.md trap 1: one inside a
               template literal ends the template and blanks the whole app.) -->
          <div class="cb-herohost"></div>
        </div>
        <div class="cb-room" hidden></div>
        <!-- HOUSE RULES live in a docked rail, not pinned over the creature's
             head. Round 3 stacked .cb-enemy__rule on top of the intent inside
             .cb-enemy__above, so The Butler's rule measured [571, -120] —
             entirely above the viewport — and the Door Greeter's sat behind the
             HUD. This rail starts below the HUD and can never leave the screen. -->
        <div class="cb-rules" role="list" aria-label="House Rules in play" hidden></div>

        <section class="cb-player" aria-label="You">
          <div class="cb-player__figure">
            <div class="cb-player__glow"></div>
            <img class="cb-player__art" alt="" draggable="false">
            <div class="cb-player__flash"></div>
            <div class="cb-player__guard" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 L21.5 5.2 C21.5 14 17.3 20.2 12 22.8 C6.7 20.2 2.5 14 2.5 5.2 Z"/></svg>
              <b>0</b>
            </div>
            <!-- YOUR counters. engine.state.counters has always shipped the
                 player's resource tracks (Loose Bones, Nine Lives, Glow, Web…)
                 and round 3 rendered only en.counters, so Bones's Sit Pretty
                 and Put Yourself Back Together keyed off a number the player
                 could not see. Same widget as the enemies' DUST 0/4, beside
                 the Guard shield. -->
            <div class="cb-player__counters" role="list" aria-label="Your resources"></div>
          </div>
          <div class="cb-player__plate">
            <div class="cb-player__name"></div>
            <!-- No Courage bar here: ui/hud.js owns exactly one, top-right,
                 and two of the same number on one screen is a bug, not
                 reassurance. What is NOT duplicated - how much of it you are
                 about to lose - stays, and is the panel below. -->
            <div class="cb-incoming" hidden></div>
            <div class="cb-statuses" role="list" aria-label="Your conditions"></div>
          </div>
        </section>

        <div class="cb-handhost"></div>

        <div class="cb-bl">
          <div class="cb-nerve" data-tip="${T.energy}|You spend it to play Tricks.|It refills to full at the start of every turn." tabindex="0">
            <svg class="cb-nerve__ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="cb-nerve__track" cx="50" cy="50" r="42"/>
              <circle class="cb-nerve__arc" cx="50" cy="50" r="42"/>
            </svg>
            <div class="cb-nerve__core"></div>
            <div class="cb-nerve__n"><b>3</b><span>/3</span></div>
            <div class="cb-nerve__lbl">${T.energy}</div>
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
        <div class="cb-chooser" hidden>
          <div class="cb-chooser__panel" role="dialog" aria-modal="true">
            <h2 class="cb-chooser__prompt"></h2>
            <p class="cb-chooser__sub"></p>
            <div class="cb-chooser__pool"></div>
            <div class="cb-chooser__bar">
              <button class="cb-chooser__skip" type="button">Skip</button>
              <button class="cb-chooser__ok" type="button">Confirm</button>
            </div>
          </div>
        </div>
      </div>`;

    const $ = (s) => this.root.querySelector(s);
    this.$cb = $('.cb');
    this.$field = $('.cb-field');
    this.$enemies = $('.cb-enemies');
    this.$room = $('.cb-room');
    this.$rules = $('.cb-rules');
    this.$top = $('.cb-top');
    this.$pl = $('.cb-player');
    this.$plArt = $('.cb-player__art');
    this.$plName = $('.cb-player__name');
    this.$plFlash = $('.cb-player__flash');
    this.$plGuard = $('.cb-player__guard');
    this.$plGuardN = $('.cb-player__guard b');
    this.$plCounters = $('.cb-player__counters');
    this.$inc = $('.cb-incoming');
    this.$statuses = $('.cb-statuses');
    this.$handHost = $('.cb-handhost');
    this.$nerveN = $('.cb-nerve__n b');
    this.$nerveM = $('.cb-nerve__n span');
    this.$nerveArc = $('.cb-nerve__arc');
    this.$nerve = $('.cb-nerve');
    this.$drawPile = $('#draw-pile');
    this.$discardPile = $('#discard-pile');
    this.$endTurn = $('#end-turn');
    this.$banner = $('.cb-banner');
    this.$deny = $('.cb-deny');
    this.$chooser = $('.cb-chooser');
    this.$chPrompt = $('.cb-chooser__prompt');
    this.$chSub = $('.cb-chooser__sub');
    this.$chPool = $('.cb-chooser__pool');
    this.$chOk = $('.cb-chooser__ok');
    this.$chSkip = $('.cb-chooser__skip');

    this.root.classList.toggle('is-large', this.largeText);
    const slug = String(params.companion || this.ctx.run?.companion || 'marmalade');
    this.hero = new PlayerView({
      clock: this.ctx.clock, reduceMotion: this.reduceMotion, companion: slug,
    });
    $('.cb-herohost').appendChild(this.hero.el);
    this.$plArt.src = `${PORTRAITS}${slug}.png`;
    this.$plArt.addEventListener('error', () => { this.$plArt.style.display = 'none'; }, { once: true });

    // CardView positions by its BOTTOM CENTRE, so any static card needs a real
    // transform rather than a CSS scale.
    const cs = getComputedStyle(this.root);
    this._cardW = parseFloat(cs.getPropertyValue('--card-w')) || 174;
    this._cardH = parseFloat(cs.getPropertyValue('--card-h')) || 242;

    // arc length for the Nerve ring
    this._arcLen = 2 * Math.PI * 42;
    this.$nerveArc.style.strokeDasharray = String(this._arcLen);
  }

  /* ══ the shared HUD ═════════════════════════════════════════════════════
   * STS2-REFERENCE §1: relics left, HP / gold / cog right, along the top edge.
   * That is exactly `ui/hud.js`, so the Scuffle uses it rather than a fourth
   * hand-rolled copy. It is the `combat` variant — same markup, same order,
   * same icons, denser, plus the one chip only this screen has: Turn.
   *
   * Two things the run cannot answer mid-fight are passed in: Courage (the
   * engine's player is authoritative until the fight ends) and the Keepsake
   * counters (the engine mutates them live).
   */
  _buildHud() {
    this.hud = new HUD(this.ctx, {
      mount: this.$top,
      variant: 'combat',
      useSnacks: true,                       // §6: Snacks are a tactical layer
      escape: false,                         // this scene owns Escape (see _bindUi)
      courage: () => [this.engine?.player?.hp ?? 0, this.engine?.player?.maxHp ?? 1],
      relics: () => this.engine?.relics || [],
      onUseSnack: (i, s) => this._useSnack(i, s),
    });

    const turn = document.createElement('div');
    turn.className = 'mm-hud__chip mm-hud__turn';
    turn.tabIndex = 0;
    turn.dataset.tipTitle = 'Turn';
    turn.dataset.tip = 'Which round of the Scuffle this is. Some Tricks and some enemies count turns.';
    // `mm-hud__t` is the shared HUD's own generic text span (hud.js#text) and
    // reusing it made `.mm-hud__t` ambiguous. This chip owns its own class.
    turn.innerHTML = '<span class="mm-hud__t cb-hud__turn">Turn 1</span>';
    this.$turnN = turn.querySelector('.cb-hud__turn');
    this.hud.addChip(turn);
  }

  /* ══ enemies ════════════════════════════════════════════════════════════ */
  _buildEnemies() {
    const st = this.engine.state;
    for (const e of st.enemies) {
      // A resumed fight ships its dead. They get no rig — see `_syncAll`.
      if (e.alive === false || e.hp <= 0) continue;
      const def = this.engine.actor(e.id)?.def || null;
      const v = new EnemyView(e, {
        clock: this.ctx.clock, reduceMotion: this.reduceMotion, def,
      });
      this._attachTips(v);
      this.views.set(e.id, v);
      this.$enemies.appendChild(v.el);
    }
    this._layoutEnemies();
  }

  _layoutEnemies() {
    const n = this.$enemies.children.length;
    this.$enemies.dataset.n = String(n);
  }

  /**
   * Tooltips for the creature and for its intent.
   *
   * These go through `tooltip.attach(el, fn)` and NOT through
   * `pointerenter -> tooltip.show(el, html)`. Two reasons, both bugs round 1
   * shipped:
   *
   *   1. `show()` handed a STRING renders it as literal text. The intent
   *      tooltip was built as HTML, so the panel displayed the characters
   *      `<div class="cb-tip__title">Pack Wrong</div>` on screen. A descriptor
   *      object is what the shared Tooltip actually renders.
   *   2. The Tooltip owns a document-level `pointerover` handler that hides the
   *      panel over any element it does not recognise as an anchor. Moving one
   *      pixel inside the intent — onto a glyph path — dismissed it instantly.
   *      `attach()` registers the element so `_anchorFor` walks up to it,
   *      exactly like `[data-tip]`, and the keyboard path comes free.
   */
  _attachTips(v) {
    const tip = this.ctx.tooltip;
    if (!tip || !tip.attach) return;
    /* NEVER COVER THE CREATURE YOU ARE DESCRIBING.
       `ui/tooltip.js` already places the panel fully outside its ANCHOR, but the
       anchor here is the flex box, and a boss rig draws far outside that box —
       the SVG is `overflow: visible` and `meet`-fits a 1.5-scale creature into
       it. So the panel sat squarely on top of The Butler while explaining him
       (shots/p5-103-butler-intent.png). `data-tip-avoid` is the documented hook
       for exactly this: score every side by how much of the listed elements it
       would occlude. Every enemy STAGE on the board is listed, so the panel also
       stops covering the creature's neighbours on its way past. */
    v.el.dataset.tipAvoid = '.cb-enemy__stage, .cb-enemy__plate';
    v.intentView.el.dataset.tipAvoid = '.cb-enemy__stage, .cb-enemy__plate';
    this._tipOffs.push(tip.attach(v.intentView.el, () => v.intentView.describe()));
    this._tipOffs.push(tip.attach(v.el, () => this._enemyDesc(v)));
  }

  /** The creature panel: what it is, how much is left, what it is about to do. */
  _enemyDesc(v) {
    const intent = v.intentView.describe();
    const rows = [[TERMS.hp, `${v.hp} / ${v.maxHp}`]];
    if (v.block > 0) rows.push(['Guard', String(v.block)]);
    const lines = [];
    if (intent) {
      lines.push(`Next: ${intent.title}`);
      for (const l of intent.lines || []) lines.push(l);
    }
    if (v.rule) lines.push(`House Rule — ${v.rule.name}: ${v.rule.text}`);
    return {
      kind: 'enemy',
      id: v.def && v.def.id,
      title: v.name,
      subtitle: v.tier === 'boss' ? 'Boss' : v.tier === 'elite' ? 'Big Scare' : 'Scuffle',
      rows,
      lines,
      footer: (v.def && v.def.lore) || (intent && intent.footer) || null,
    };
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
    /* RESUME. The hand is normally filled by `draw` events, which a resumed
       engine has already emitted and will never emit again — so a restored
       mid-combat save rendered an empty hand while the engine held five cards.
       Seed from the pile when the fight is already under way. `engine.started`
       is the flag; a fresh engine is false here and draws normally. */
    if (this.engine.started && !this.engine.over) {
      const held = (this.engine.piles && this.engine.piles.hand) || [];
      if (held.length) {
        this.hand.setCards(held.map(c => this._handCard(this.engine.cardSnap(c))));
        this._opening = false;              // a resumed fight is not opening
      }
    }
    this._syncHandPlayability();
    this._updatePilePositions();

    this._offs.push(ctx.bus.on('card:hover', (p) => this._hoverPreview(p.uid)));
    this._offs.push(ctx.bus.on('card:unhover', () => this._clearPreview()));
    this._offs.push(ctx.bus.on('card:target', (p) => {
      for (const v of this.views.values()) v.el.classList.toggle('is-aimed', v.id === p.targetId);
    }));
    this._offs.push(ctx.bus.on('card:drop', () => {
      for (const v of this.views.values()) v.el.classList.remove('is-aimed');
    }));
    /* ── a click is a play ──────────────────────────────────────────────────
     * FINDING: a non-targeted card could only be played by dragging it above
     * roughly y=450; a click did nothing at all. The Hand commits a drag on
     * crossing its threshold and treats a tap — pointerdown and pointerup in
     * the same place — as a cancelled drag, so nothing happens.
     *
     * The Hand's public `playCard(uid, targetId)` is the right seam, and its
     * `card:pickup` / `card:cancel` pair is enough to recognise a tap without
     * touching its pointer code. A tap on a self-targeted Trick plays it; a tap
     * on an aimed Trick with exactly one living enemy plays it at that enemy
     * (Slay the Spire does the same); otherwise it says what to do instead.
     */
    this._offs.push(ctx.bus.on('card:pickup', (p) => {
      this._tap = { uid: p.uid, t: performance.now(), x: this._pt.x, y: this._pt.y };
    }));
    this._offs.push(ctx.bus.on('card:cancel', (p) => {
      this._clearPreview();
      const t = this._tap; this._tap = null;
      if (!t || !p || t.uid !== p.uid || !this.engine || this.engine.over) return;
      if (performance.now() - t.t > 420) return;                               // a slow drag
      if (Math.hypot(this._pt.x - t.x, this._pt.y - t.y) > 12) return;         // it moved
      this._tapPlay(p.uid);
    }));
    this._offs.push(ctx.bus.on('settings:changed', () => {
      this._readSettings();
      this.root.classList.toggle('is-large', this.largeText);
      for (const v of this.views.values()) v.reduceMotion = this.reduceMotion;
      if (this.hero) this.hero.reduceMotion = this.reduceMotion;
    }));
  }

  /** Resolve a tap on a card in hand into a play, or into a usable hint. */
  _tapPlay(uid) {
    const card = this.engine.card(uid);
    if (!card) return;
    const aimed = card.target === 'enemy' || card.target === 'ally';
    let tid = null;
    if (aimed) {
      const living = card.target === 'enemy' ? this.engine.livingEnemies() : [];
      if (living.length !== 1) {
        this._deny('Drag it onto the one you mean, or select it and press Tab.');
        return;
      }
      tid = living[0].id;
    }
    const chk = this.engine.canPlay(uid, tid);
    if (!chk.ok) { this._deny(chk.reason); return; }
    this.hand.playCard(uid, tid || undefined);
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
    if (this._resolving || !this.engine || this.engine.over) return false;
    const tid = targetId ?? (this._defaultTargetFor(uid));
    const chk = this.engine.canPlay(uid, tid);
    if (!chk.ok) { this._deny(chk.reason); return false; }

    this._resolving = true;
    this._playedUid = uid;
    this._clearPreview();
    this.hand.lock();
    const card = this.engine.card(uid);
    // The wind-up runs during the Hand's 0.20s hold, so contact lands on the
    // frame the effect resolves rather than after it.
    if (card && card.type === 'attack') this._playerWindup();
    /* No `card:play` re-emit here: `ui/hand.js` already emits it (now carrying `type`),
       and this method is the handler for that very event. Emitting again made every
       play appear twice on the bus. */
    /* ── WHEN THE EFFECT LANDS, relative to the card ───────────────────────
       Round 3 resolved 200 ms in, which is BEFORE the card has even finished
       flying to the play position (`ui/hand.js` TUNE.playTo is 260 ms). So the
       impact happened behind a 226x314 card sitting dead centre: measured, the
       card occupied y 230-560 while the enemy occupied y 330-450, and the whole
       reaction — flinch, shards, GUARD BROKEN — played underneath it.

       PLAY_RESOLVE is now the end of the Hand's presentation hold
       (playTo 0.26 + playHold 0.20), so the card is already arcing away to the
       discard pile when contact lands and the creature is uncovered. It costs
       ~220 ms of latency once per card and buys back the entire receiving-side
       animation the reviewer praised, which was being played to nobody.

       The complete fix is one number in a file this agent does not own —
       `ui/hand.js` TUNE.playY, 0.62 of the board height, which is what puts the
       presented card across the creature band in the first place. That ask is
       in the report. */
    this.ctx.clock.wait(this._d(PLAY_RESOLVE)).then(async () => {
      try { await this.engine.playCard(uid, tid); } catch (e) { console.error('[combat] playCard', e); }
      await this._settle();
      this._playedUid = null;
      this._resolving = false;
      // `_settle()` can end the fight, and `_animEnd` navigates away, which runs
      // `exit()` and nulls the engine. Reading `this.engine.over` here is what
      // threw `Cannot read properties of null (reading 'over')` at the moment
      // of defeat — a listener outliving its teardown, CONTRACTS §7.
      if (!this.engine) return;
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

  /* ══ Snacks ═══════════════════════════════════════════════════════════════
   * STS2-REFERENCE §6: "Potions: 3 slots, usable any time in combat, they are a
   * real tactical layer."
   *
   * The ~50-line effect table that used to live here is GONE. It decided rules,
   * which CONTRACTS.md §5 puts in `src/combat/` — it was only here because the
   * previous agent could not edit that directory. The engine now owns it:
   * `canUseSnack` / `snackPotency` / `useSnack`, with relic modifiers, the
   * ordinary choice broker for targeting, an `onSnackUsed` hook, and a
   * `snack:used` event emitted BEFORE anything lands so the eat animates first.
   *
   * Inventory is `Run.useSnack(index, targetId)`, which takes the Snack off the
   * run and forwards to the engine — so this scene no longer splices an array
   * either. Without a run (a deep-linked Scuffle) the engine is called direct.
   */
  async _useSnack(index, snack) {
    if (!this.engine || this._resolving || this._snacking) return;
    const run = this.ctx.run;
    const chk = run && typeof run.canUseSnack === 'function'
      ? run.canUseSnack(index, null)
      : this.engine.canUseSnack(snack, null);
    if (!chk.ok) { this._deny(chk.reason); return; }

    this._snacking = true;
    try {
      if (run && typeof run.useSnack === 'function') await run.useSnack(index, null);
      else await this.engine.useSnack(snack, null);
    } catch (e) {
      console.error('[combat] useSnack', e);
    } finally {
      this._snacking = false;
    }
    await this._settle();
    if (this.engine) { this.hud.refresh(); this._syncEndTurn(); }
  }

  /* ══ player choice ══════════════════════════════════════════════════════ */
  /**
   * The engine BLOCKS on this. Returns the indices the player picked.
   * `kind` is 'card' | 'option' | 'enemy'; enemy choices are made on the board
   * itself (click a rig) as well as from the list, so the read stays spatial.
   */
  _resolveChoice(req) {
    return new Promise((resolve) => {
      const upTo = this._isUpTo(req);
      this._choice = {
        req, picked: [], resolve, done: false, upTo,
        /* THE FEWEST PICKS THAT MAY CONFIRM.
           Round 3 required `req.count` and disabled CONFIRM below it. The engine
           has never wanted that: `combat/choice.js#sanitise` accepts ANY subset
           of the pool and only forces a single index when a non-optional request
           comes back completely empty. So "Bury up to 2 other Tricks" with one
           card selected was a legal resolution the whole time, and the screen
           refused it — with Escape swallowed as well, which is a soft-lock by
           any other name (shots/p5-46-SOFTLOCK.png). */
        min: (req.optional || upTo) ? 0 : 1,
      };
      this._openChooser(req);
    });
  }

  /**
   * Does the card that raised this request print "up to N"?
   *
   * `Backyard Cache` reads "Bury up to 2 other Tricks" and the chooser said
   * "Pick 2" — the card and the UI disagreed, and the card is the promise the
   * player was given. The request carries `meta.cardId`, so the scene can read
   * the printed text and honour it rather than contradict it.
   *
   * This is a RENDERING decision, not a rules one: whatever count comes back,
   * the engine is what applies it. The data-side fix (passing `optional:true`
   * from those cards) belongs to companion-cards and is in the report; this
   * stops the screen lying in the meantime, and is harmless once it lands.
   */
  _isUpTo(req) {
    if (!req || !req.meta) return false;
    try {
      const uid = req.meta.cardUid;
      const card = uid != null ? this.engine.card(uid) : null;
      const def = (card && card.def) || (req.meta.cardId && this.engine.resolveCardDef(req.meta.cardId));
      const text = String((def && (def.text || def.desc)) || '');
      return /\bup to\b/i.test(text);
    } catch { return false; }
  }

  _openChooser(req) {
    const ch = this._choice;
    const many = req.count > 1;
    this.$chPrompt.textContent = req.prompt || (req.kind === 'enemy' ? 'Choose a target' : 'Choose');
    /* SAY WHAT THE BUTTON IS. A single pick shows a prompt, a sub-line and a
       row of cards and NO button of any kind — nothing on screen told a mouse
       player that the card itself is the control, and a previous reviewer filed
       the whole panel as a soft-lock. The sub-line now names both routes. */
    const noun = req.kind === 'card' ? 'a Trick' : req.kind === 'enemy' ? 'a target' : 'an option';
    const how = req.kind === 'enemy'
      ? 'Click one here or on the board, or use the arrow keys and Enter.'
      : 'Click one, or use the arrow keys and Enter.';
    /* SAY THE SAME THING THE CARD SAYS. "Bury up to 2" printed "Pick 2." here
       and then refused Confirm at one — the sub-line now matches the range the
       chooser will actually accept, which for `up to N` is 0..N. */
    const range = ch.upTo || req.optional ? `up to ${req.count}` : String(req.count);
    this.$chSub.textContent = many
      ? `Pick ${range}. Click them, then Confirm.`
      : (ch.min === 0 ? `You may skip this. ${how}` : `Pick ${noun}. ${how}`);
    /* EVERY CHOOSER CANCELS, AND THEY ALL CANCEL THE SAME WAY. Escape dismissed
       the Fetch picker and did nothing at all on the Bury picker, so two panels
       in one scene behaved differently and one of them read as frozen. */
    this.$chSkip.hidden = false;
    this.$chSkip.textContent = ch.min === 0 ? 'Skip' : 'Cancel';
    this.$chOk.hidden = !many;
    this.$chPool.textContent = '';
    this.$chPool.dataset.kind = req.kind;
    this._chViews?.forEach(v => v.destroy());
    this._chViews = [];
    ch.nodes = [];

    req.pool.forEach((item, i) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'cb-choice';
      node.dataset.index = String(i);
      if (req.kind === 'card' && item.uid) {
        const def = this.engine.card(item.uid)?.def || item.def || item;
        const cv = new CardView(def, {
          uid: item.uid, upgraded: item.upgraded, cost: item.cost,
          largeText: this.largeText, reduceMotion: true,
        });
        node.classList.add('cb-choice--card');
        node.appendChild(cv.el);
        this._placeCard(cv, node, 0.88);
        node.setAttribute('aria-label', def.name || 'Trick');
        this._chViews.push(cv);
      } else if (req.kind === 'enemy') {
        node.classList.add('cb-choice--enemy');
        node.innerHTML = `<b>${esc(item.name || item.label || 'Enemy')}</b>`
          + `<span>${item.hp ?? ''}${item.maxHp ? '/' + item.maxHp : ''} ${TERMS.hp}</span>`;
        node.addEventListener('pointerenter', () => {
          for (const v of this.views.values()) v.el.classList.toggle('is-aimed', v.id === item.id);
        });
      } else {
        node.classList.add('cb-choice--option');
        node.innerHTML = `<b>${esc(item.label ?? String(item))}</b>`;
        if (item.disabled) node.disabled = true;
      }
      node.addEventListener('click', () => this._pickChoice(i));
      this.$chPool.appendChild(node);
      ch.nodes.push(node);
    });

    // enemy choices are also made by clicking the creature itself
    if (req.kind === 'enemy') {
      ch.boardOff = [];
      req.pool.forEach((item, i) => {
        const v = this.views.get(item.id);
        if (!v) return;
        const fn = () => this._pickChoice(i);
        v.el.addEventListener('click', fn);
        v.el.classList.add('is-choosable');
        ch.boardOff.push(() => { v.el.removeEventListener('click', fn); v.el.classList.remove('is-choosable'); });
      });
    }

    this.$chooser.hidden = false;
    this._syncChooserBar();
    this.ctx.audio?.play?.('ui:open-panel');
    ch.cursor = 0;
    this._focusChoice(0);
  }

  _focusChoice(i) {
    const ch = this._choice;
    if (!ch || !ch.nodes.length) return;
    ch.cursor = ((i % ch.nodes.length) + ch.nodes.length) % ch.nodes.length;
    ch.nodes[ch.cursor].focus({ preventScroll: true });
  }

  _pickChoice(i) {
    const ch = this._choice;
    if (!ch || ch.done) return;
    const req = ch.req;
    const at = ch.picked.indexOf(i);
    if (at >= 0) { ch.picked.splice(at, 1); ch.nodes[i].classList.remove('is-picked'); }
    else {
      if (ch.picked.length >= req.count) {
        const drop = ch.picked.shift();
        ch.nodes[drop]?.classList.remove('is-picked');
      }
      ch.picked.push(i);
      ch.nodes[i].classList.add('is-picked');
    }
    this.ctx.audio?.play?.('ui:click');
    this._syncChooserBar();
    if (req.count === 1 && ch.picked.length === 1) this._commitChoice();
  }

  /** CONFIRM is live the moment the selection is legal — see `_resolveChoice`. */
  _syncChooserBar() {
    const ch = this._choice;
    if (!ch) return;
    const n = ch.picked.length;
    this.$chOk.disabled = n < ch.min;
    this.$chOk.textContent = n === 0 && ch.min === 0 ? 'Confirm none'
      : n < ch.req.count ? `Confirm ${n}` : 'Confirm';
  }

  /**
   * Close the chooser and hand the engine what was picked.
   *
   * `skip` means the player cancelled. It NEVER refuses to close: a blocking
   * modal the player cannot dismiss is a soft-lock whatever the reason for it,
   * and the engine is built for this — `combat/choice.js#sanitise` takes any
   * subset and substitutes the first entry if a mandatory request comes back
   * empty, so cancelling a mandatory pick costs you the choice, not the run.
   * When that substitution is what is about to happen, say so out loud.
   */
  _commitChoice(skip) {
    const ch = this._choice;
    if (!ch || ch.done) return;
    if (!skip && ch.picked.length < ch.min) {
      this._deny(`Pick at least ${ch.min}.`);
      return;
    }
    if (skip && ch.min > 0 && ch.picked.length === 0) {
      this._deny('Cancelled — the House picks for you.');
    }
    ch.done = true;
    this.$chooser.hidden = true;
    ch.boardOff?.forEach(f => f());
    for (const v of this.views.values()) v.el.classList.remove('is-aimed');
    this._chViews?.forEach(v => v.destroy());
    this._chViews = [];
    this.$chPool.textContent = '';
    this.ctx.audio?.play?.(skip ? 'ui:back' : 'ui:confirm');
    // Cancelling an OPTIONAL pick means "none". Cancelling a mandatory one with
    // something already selected means "just these" — throwing the selection
    // away would make Cancel destructive rather than an exit.
    const picked = (skip && ch.min === 0) ? [] : ch.picked.slice();
    this._choice = null;
    ch.resolve(picked);
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
    this._refinePreview(uid, tid);      // previewAsync fills in past the choice
    return this._cardNumbers(uid, tid);
  }

  _hoverPreview(uid) {
    const tid = this._defaultTargetFor(uid);
    const p = this._preview(uid, tid);
    this._paintPreview(uid, tid, p);
    this.hand.viewOf(uid)?.setPreviewNumbers(this._cardNumbers(uid, tid));
    this._refinePreview(uid, tid);
  }

  /**
   * A card with an unmade choice can only be previewed up to that choice.
   * `previewAsync` completes the picture with the auto-picker — one POSSIBLE
   * outcome, so everything it produces is marked uncertain and printed with a
   * `?`. A confident wrong number is worse than an honest uncertain one.
   */
  _refinePreview(uid, tid) {
    if (!this.engine.previewAsync) return;
    const token = (this._previewToken = (this._previewToken || 0) + 1);
    this.engine.previewAsync(uid, tid, { assumeAffordable: true }).then((p) => {
      if (token !== this._previewToken || !this._previewOn) return;
      this._paintPreview(uid, tid, p);
      this.hand.viewOf(uid)?.setPreviewNumbers(this._cardNumbers(uid, tid));
    }).catch(() => {});
  }

  _preview(uid, tid) {
    try { return this.engine.preview(uid, tid, { assumeAffordable: true }); }
    catch (e) { console.error('[combat] preview', e); return null; }
  }

  /**
   * Live-modified card text numbers: `{ d, wasD, b, wasB, ... }`.
   *
   * NO uncertainty marker here. Round 3 stamped `?` on every number of a card
   * that contained an unresolved choice, which printed `Go Get It!` as "printed
   * cost **1?** or less" and `Toss and Chase` as "Deal **8?** damage" — both of
   * those are printed constants that no pick can move. `cardSnap.display` is
   * computed from the card's own `nums` plus Strength / Weak / Vulnerable and
   * never consults the auto-picker, so nothing in it is ever an estimate.
   *
   * The uncertainty is real, but it belongs to the OUTCOME, and that is where
   * it is shown: the target overlay prints `-6?` and "depends on your pick"
   * (`_paintPreview` -> `EnemyView#showPreview`).
   */
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
      /* GUARD IS PART OF THE ANSWER. Round 3 printed `-6` on a 5-Guard enemy
         and the actual Courage loss was 1. `preview()` has always returned
         `hpLoss`, `blocked` and `blockBefore` per target — the renderer just
         threw them away. STS2-REFERENCE §2: "the player can always see exactly
         what will happen before it happens." */
      const guard = Number.isFinite(t.blockBefore) ? t.blockBefore : (t.blocked || 0);
      v.showPreview({
        damage: t.hpLoss > 0 || t.damage > 0 ? (t.damage || 0) : 0,
        hpLoss: t.hpLoss || 0,
        guard,
        hits: t.hits || 1,
        kills: !!t.kills && !p.uncertain,
        uncertain: !!p.uncertain,
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
    for (const v of this.views.values()) { v.showPreview(null); v.el.classList.remove('is-aimed'); }
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
      this.$pl.classList.remove('is-lethal');
      return;
    }
    const hp = this.engine.player.hp;
    const lethal = through >= hp;
    const need = Math.max(0, inc.total - (inc.block || 0));
    this.$inc.hidden = false;
    this.$inc.dataset.state = lethal ? 'lethal' : through > 0 ? 'through' : 'safe';
    /* WITH NO GUARD THERE IS NO ARITHMETIC. At 0 Guard the panel printed
       `INCOMING 12 -> 12`: an arrow, a second copy of the same number, and no
       Guard term anywhere to explain what the arrow was supposed to have done.
       The arrow earns its place only when something actually changes the
       number, so it now appears exactly when a Guard term does. */
    const shown = block > 0;
    this.$inc.innerHTML =
      `<span class="cb-inc__k">Incoming</span>`
      + `<b class="cb-inc__n">${inc.total}</b>`
      + (shown
        ? `<span class="cb-inc__blk">&minus;${block} Guard</span>`
          + `<span class="cb-inc__arrow">&rarr;</span>`
          + `<b class="cb-inc__t">${through}</b>`
        : '')
      + (lethal ? `<span class="cb-inc__lethal">LETHAL</span>`
        : through > 0 ? `<span class="cb-inc__need">${need} more Guard to stop it all</span>`
          : `<span class="cb-inc__safe">Fully blocked</span>`);
    this.$inc.dataset.tip = `Incoming this turn|Every living enemy's intent added up: ${inc.total} damage.|`
      + (through > 0 ? `Your ${block} Guard stops ${Math.min(block, inc.total)}; ${through} reaches your Courage.`
        : `Your ${block} Guard stops all of it.`);
    this.$inc.tabIndex = 0;
    this.$pl.classList.toggle('is-lethal', lethal);
  }

  /* ══ engine wiring ══════════════════════════════════════════════════════ */
  _wireEngine() {
    this._engineOffs.push(this.engine.on('*', (ev) => {
      this._q.push(ev);
      this._kick();
    }));
    // ~70 Tricks say "choose a Trick". Without a resolver the engine silently
    // auto-picks and the player loses agency, so this is not optional.
    this.engine.setChoiceResolver?.((req) => this._resolveChoice(req));
  }

  _kick() {
    if (this._draining) return this._draining;
    this._draining = this._drain().finally(() => { this._draining = null; });
    return this._draining;
  }

  async _drain() {
    while (this._q.length) {
      // the scene can be torn down mid-drain (defeat navigates to gameover)
      if (!this.engine) { this._q.length = 0; return; }
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
    if (!E) return;                    // torn down while this event was queued
    switch (ev.type) {

      case 'combat:start':
        this._banner('The Scuffle Begins', 'start');
        this.ctx.atmosphere?.dread?.(0.12, 0.6);
        await this._wait(this._o(0.24));
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
          this.$turnN.textContent = `Turn ${ev.turn}`;
          this._banner(`Your Turn ${ev.turn}`, 'player');
          this.ctx.audio?.play?.('combat:turn-start');
          await this._wait(this._o(0.22));
          // Everything queued before this point was set-up, not play. From here
          // the fight animates at full weight.
          this._opening = false;
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

      /* ── THE RENDER SEAM ────────────────────────────────────────────────
         `piles.move()` is how every effect that is not a draw / discard /
         exhaust relocates a card: Fetch, Dig Up, Bury, the Bury return,
         Stash, Scurry, "put it on top of your draw pile", the forced
         discard inside Slobber. It emits `card:move` at
         combat/piles.js:188 and round 3 had NO case for it, so the entire
         Bones identity resolved in the rules and never appeared on screen —
         `engine.state.piles.hand` held `[c26,c27,c24,c35]` while the DOM
         hand held `[c26,c27,c24]`, and the fetched card was discarded
         unplayed at end of turn.

         `_reconcileHand()` in `_syncAll` is the belt to this braces: if any
         future effect moves a card by a route this switch does not know
         about, the fan still ends the beat matching `piles.hand`. */
      case 'card:move':
        await this._animCardMove(ev);
        return;

      case 'shuffle':
        this._syncPiles();
        this.ctx.audio?.play?.('card:shuffle');
        this.$drawPile.classList.remove('is-shuffle');
        void this.$drawPile.offsetWidth;
        this.$drawPile.classList.add('is-shuffle');
        await this._wait(this._o(0.16));
        return;

      case 'energy':
        this._syncNerve(ev.after, ev.max ?? E.player.energyMax);
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
        if (ev.actorId === E.player.id) { this.$pl.classList.add('is-guarding'); this.hero?.guard(); }
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
          await this._wait(this._o(0.11));
        }
        return;
      }

      case 'intent': {
        const v = this.views.get(ev.enemyId);
        if (v) {
          v.setIntent(ev.intent, { playerHp: E.player.hp, playerBlock: E.player.block });
          this._refreshTip(v);
        }
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

      case 'snack:used': {
        // Emitted BEFORE the effects land, which is the whole point: the eat
        // plays first, then heal / Guard / Nerve arrive as their own events.
        this._banner(ev.name || 'Snack', 'good', 0.9);
        const c = this._pointOf(E.player.id);
        this.fx.shimmer(c.x, c.y, this.fx.col.flame);
        this.fx.ring(c.x, c.y, this.fx.col.pluck, 54);
        this.ctx.audio?.play?.('ui:confirm');
        this.$pl.classList.remove('is-snacking');
        void this.$pl.offsetWidth;
        this.$pl.classList.add('is-snacking');
        await this._wait(this._d(0.22));
        this.$pl.classList.remove('is-snacking');
        return;
      }

      case 'death':
        await this._animDeath(ev);
        return;

      case 'counter': {
        // The PLAYER owns counters too (Loose Bones, Nine Lives, Glow, Web…) and
        // round 3 only floated a word for enemies, so every change to your own
        // resource track happened in silence.
        /* NEVER PRINT `undefined`. A counter event with neither `name` nor `id`
           floated the literal string "+1 undefined" over the board mid-play —
           `${a || b}` is not a guard when both sides can be missing. Anything
           without a readable label is a number the player cannot act on, so it
           does not get a word at all; the counter chip under the creature is
           still updated by `_syncActor`. */
        const label = ev.name || (ev.id ? titleCase(ev.id) : '');
        if (ev.delta && label) {
          const c = this._pointOf(ev.ownerId);
          this.fx.word(c.x + (ev.ownerId === E.player.id ? 64 : 0), c.y - 56,
            `${ev.delta > 0 ? '+' : ''}${ev.delta} ${label}`, 'counter');
        }
        if (ev.ownerId === E.player.id) this._syncPlayer();
        return;
      }

      case 'intent:queue': {
        const v = this.views.get(ev.enemyId);
        if (v) {
          v.setQueue(ev.queue || []);
          if (ev.action && typeof ev.action === 'string' && ev.action !== 'preview') {
            const c = this._pointOf(ev.enemyId);
            this.fx.word(c.x, c.y - 70, ev.action.toUpperCase(), 'counter');
            this.ctx.audio?.play?.('ui:confirm');
          }
        }
        return;
      }

      case 'rule': {
        if (ev.action === 'clear') this._rules.delete(ev.rule.id);
        else this._rules.set(ev.rule.id, { ...ev.rule, sourceId: ev.sourceId });
        if (ev.sourceId) this._syncEnemyExtras(ev.sourceId);
        if (ev.action !== 'clear') {
          this._banner(ev.rule.name || 'A Rule', 'rule', 1.4);
          this.ctx.audio?.play?.('world:boss-roar', { vol: 0.5 });
          await this._wait(this._d(0.4));
        }
        return;
      }

      case 'rule:broken': {
        const v = ev.sourceId ? this.views.get(ev.sourceId) : null;
        v?.el.classList.add('rule-broken');
        this._banner(`${ev.name} BROKEN`, 'rulebreak', 1.3);
        const c = this._pointOf(ev.sourceId || this.engine.player.id);
        this.fx.burst(c.x, c.y, { color: this.fx.col.threatHi, count: 22, speed: 320 });
        this._addShake(0.7);
        this.ctx.audio?.play?.('ui:deny');
        await this._wait(this._d(0.35));
        v?.el.classList.remove('rule-broken');
        return;
      }

      case 'choice':
        // the engine is blocked awaiting `_resolveChoice`; make sure everything
        // queued before it has finished animating so the picker reads in context
        return;

      case 'choice:resolved': {
        if (ev.kind === 'enemy' && ev.chosen?.[0]?.id) {
          const v = this.views.get(ev.chosen[0].id);
          if (v) { const c = this._pointOf(ev.chosen[0].id); this.fx.ring(c.x, c.y, this.fx.col.flame, 60); }
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

  /* ── card:move — a card changing zones by effect ─────────────────────────
   * Three motions, because three different things are happening:
   *   into the hand  — it flies UP out of the zone it came from, lands in the
   *                    fan and lights briefly. Distinct from a draw because it
   *                    leaves the discard pile (or the ground, for Buried).
   *   out of the hand— it tumbles to wherever it is actually going, which is
   *                    not always the discard pile.
   *   pile to pile   — no card is on screen; only the counters move.
   *
   * Budget: the fetched card must be in the DOM and playable within 250 ms of
   * the chooser closing, so this awaits one short beat and never the flight.
   */
  async _animCardMove(ev) {
    if (!this.hand) return;
    const from = ev.from || null;
    const to = ev.to || null;
    this._syncPiles();
    if (!to || to === from) return;

    if (to === 'hand') {
      // Already in the fan (the Hand put it there itself, or a duplicate
      // event): nothing to build, but the piles and playability still moved.
      if (!this.hand.viewOf(ev.cardUid)) {
        /* The Hand deals every entering card from `piles.draw`. Point that
           anchor at the zone this card is genuinely coming from for exactly
           this insertion — `_makeSlot` reads it synchronously — then put it
           back, so a real draw one event later is unaffected. */
        const keep = this.hand.piles.draw;
        this.hand.setPiles({ draw: this._pileAnchor(from) });
        this.hand.draw([this._handCard(ev.card)]);
        this.hand.setPiles({ draw: keep });
        const v = this.hand.viewOf(ev.cardUid);
        if (v) {
          v.el.classList.add('is-recovered');
          this.ctx.clock.wait(this._d(0.85))
            .then(() => v.el.classList.remove('is-recovered'));
        }
      }
      this.ctx.audio?.play?.('card:draw');
      this._syncHandPlayability();
      this._syncEndTurn();
      await this._wait(this._d(0.14));
      return;
    }

    if (from === 'hand') {
      if (!this.hand.viewOf(ev.cardUid)) return;   // the Hand already let it go
      if (to === 'exhaust') { await this.hand.exhaust(ev.cardUid); return; }
      /* `Hand#discard` reads `piles.discard` synchronously inside its own
         `.map()`, before its first await — so aiming it at another zone for
         one call is safe, and it is the only way to make "put it on top of
         your draw pile" fly to the draw pile instead of the discard pile. */
      const keep = this.hand.piles.discard;
      this.hand.setPiles({ discard: this._pileAnchor(to) });
      const flight = this.hand.discard(ev.cardUid);
      this.hand.setPiles({ discard: keep });
      this._syncHandPlayability();
      this._syncEndTurn();
      await flight;
      this._syncPiles();
      return;
    }

    // pile -> pile with nothing on screen. The counts already moved above.
  }

  /**
   * Where a zone lives, in the Hand's own coordinate space.
   * Buried / Stashed / Limbo have no pile on the board, so they come up out of
   * the floor under the fan — which is what digging something up should read
   * as, and never a lie about which corner it came from.
   */
  _pileAnchor(which) {
    const p = this.hand.piles || {};
    if (which === 'draw' && p.draw) return { x: p.draw.x, y: p.draw.y };
    if (which === 'discard' && p.discard) return { x: p.discard.x, y: p.discard.y };
    const r = this.$handHost.getBoundingClientRect();
    return { x: r.width * 0.5, y: r.height + 80 };
  }

  /**
   * The fan and `piles.hand` must agree at the end of every beat.
   *
   * This is the CONTRACTS §9 guard for this scene: the switch above animates
   * the moves it knows, and this catches everything else — a retained card
   * (`turn:end` clears the whole fan but the engine keeps retained cards), a
   * card moved by a route nobody has written a case for yet, a resumed fight.
   * It only touches the DOM when the two genuinely disagree.
   */
  _reconcileHand() {
    if (!this.hand || !this.engine || this.engine.over) return;
    const want = (this.engine.piles && this.engine.piles.hand) || [];
    const have = this.hand.cards();
    if (want.length === have.length) {
      let same = true;
      for (let i = 0; i < want.length; i++) {
        if (!have.some(h => h.uid === want[i].uid)) { same = false; break; }
      }
      if (same) return;
    }
    this.hand.setCards(want.map(c => this._handCard(this.engine.cardSnap(c))));
    this._syncHandPlayability();
  }

  /* ── damage ──────────────────────────────────────────────────────────── */
  async _animDamage(ev) {
    const E = this.engine;
    const isPlayer = ev.targetId === E.player.id;
    const src = this.views.get(ev.sourceId);
    const tgt = isPlayer ? null : this.views.get(ev.targetId);

    /* GET THE CARD OFF THE CREATURE — armed BEFORE the attacker commits, so it
       is already down by the contact frame rather than starting to fade on it.
       Measured at the contact frame, round 3: the played card occupied
       y 230-560 while the target occupied y 330-450, covering 58.2% of it, so
       the flinch, the shards and GUARD BROKEN all played behind a piece of
       cardboard. STS2-REFERENCE §1 wants the effect to resolve WHILE the card
       is presented, so the card is meant to be there — it just may not be
       opaque. `filter: opacity()` and not the opacity PROPERTY, because
       `ui/hand.js` writes that inline during the discard arc and inline always
       wins the cascade; a filter composes with it instead of fighting it. */
    this._impactVeil();

    // the attacker commits — this is the contact beat
    if (src && !src.dying) await src.strike();
    // STS2-REFERENCE §4: "Characters animate their attacks: StS2 explicitly
    // fixed the StS1 complaint that the player figure just twitched." Round 3
    // had the player as a framed portrait that never moved at all. Wind-up is
    // armed in `_onPlay`; this is contact and follow-through.
    else if (ev.sourceId === E.player.id) await this._playerStrike();

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

    /* NUMERALS STAY ON THE BODY, NEVER ON THE INTENT.
       A damage numeral spawned at the stage centre and rose 88-100px, which on
       a short rig carried it clean off the top of the creature and onto that
       creature's own intent chips — every hit briefly replaced the enemy's
       intent number with the damage number, in the same spot, both dark on
       dark. Two changes: a lateral offset, and a rise capped so the numeral
       cannot leave the rig it belongs to. */
    const n = this._numeralSpot(ev.targetId, c);
    if (blockedAll) {
      this.fx.number(n.x, n.y, ev.amount, { kind: 'blocked', mag: ev.amount, rise: n.rise });
    } else {
      this.fx.number(n.x, n.y, hpLoss, { kind: isPlayer ? 'taken' : 'damage', mag: hpLoss, rise: n.rise });
      if (ev.blocked > 0) {
        this.fx.number(c.x - (n.x - c.x), n.y + 20, ev.blocked,
          { kind: 'blocked', mag: ev.blocked, delay: 0.06, rise: n.rise });
      }
    }

    if (isPlayer) {
      this._playerHit(hpLoss, blockedAll);
    } else if (tgt) {
      if (blockedAll) tgt.clank(ev.amount);
      else tgt.flinch(hpLoss, ev.sourceId === E.player.id ? 1 : -1);
      tgt.setState(E.state.enemies.find(x => x.id === ev.targetId) || {});
    }

    // shake scaled to Courage actually lost, never to the raw number
    this._addShake(Math.min(1.5, hpLoss / 9 + (blockedAll ? 0.10 : 0.22)));
    this.ctx.atmosphere?.impact?.(c, {
      strength: Math.min(1.5, 0.2 + hpLoss / 22),
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

  /**
   * Where a damage numeral spawns, and how far it may climb, for one actor.
   * Measured against the creature's own stage so a 168px Dust Bunny and a 420px
   * Butler both keep their numbers on their bodies and off their intent.
   */
  _numeralSpot(id, c) {
    const v = this.views.get(id);
    let dx = NUM_DX;
    let rise = 0;
    if (v) {
      const st = v.$stage.getBoundingClientRect();
      const top = this.fx.toLocal(st.left, st.top).y;
      // top out NUM_HEADROOM below the top of the rig, so the intent stack —
      // which begins at that line and grows upward — is never reached
      rise = Math.max(24, (c.y - 6) - top - NUM_HEADROOM);
      if (c.x > this.fx.w * 0.62) dx = -dx;     // stay inside the board
    }
    return { x: c.x + dx, y: c.y - 6, rise };
  }

  /**
   * Wind-up: the Kid coils before the Trick lands. Armed by `_onPlay`.
   *
   * It drives the BODY on the board (`ui/enemy.js` PlayerView) and the portrait
   * panel together. Round 3 only had the panel, and the reviewer's note was not
   * "the portrait animation is too small" — it was "the player has no body in
   * the scene at all", which no amount of animating a picture frame fixes.
   */
  _playerWindup() {
    if (this.reduceMotion) return;
    this.hero?.windup();
    const el = this.$pl;
    el.classList.remove('is-windup', 'is-striking');
    void el.offsetWidth;
    el.classList.add('is-windup');
    clearTimeout(this._windT);
    // an attack that never produces a damage event must not leave the pose held
    this._windT = setTimeout(() => {
      el.classList.remove('is-windup');
      this.hero?.settle();
    }, 900);
  }

  /** Contact + follow-through. Resolves on the contact frame, like `EnemyView#strike`. */
  async _playerStrike() {
    const el = this.$pl;
    clearTimeout(this._windT);
    el.classList.remove('is-windup', 'is-striking');
    if (this.reduceMotion) return;
    void el.offsetWidth;
    el.classList.add('is-striking');
    this.ctx.clock.wait(this._d(0.36)).then(() => el.classList.remove('is-striking'));
    /* The torch arc is drawn from the tip of the torch to the target, so the
       hit has a visible CAUSE rather than a number appearing on a creature. */
    if (this.hero) {
      const c = this.hero.centre();
      const from = this.hero.reach();
      const o = this.fx.toLocal(c.x, c.y);
      const r = Math.max(60, Math.hypot(from.x - c.x, from.y - c.y));
      this.fx.swing(o.x, o.y, r, -1.5, 1.9, this.fx.col.flame, 0.3);
      await this.hero.strike();
      this.ctx.clock.wait(this._d(0.5)).then(() => this.hero?.settle());
      return;
    }
    await this._wait(this._d(0.085));
  }

  /** Cards go translucent for the length of one impact. See `_animDamage`. */
  _impactVeil() {
    if (this.reduceMotion) return;
    this.$handHost.classList.add('is-impact');
    clearTimeout(this._veilT);
    this._veilT = setTimeout(() => this.$handHost.classList.remove('is-impact'),
      Math.round(340 / this.speed));
  }

  _playerHit(hpLoss, blocked) {
    this.hero?.flinch(hpLoss, blocked);
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
    // `engine.turn`, not `st.turn`: the state snapshot is cached and a turn
    // rollover does not always mark it dirty, so the top bar could sit a whole
    // turn behind the fight it is labelling.
    this.$turnN.textContent = `Turn ${this.engine.turn}`;
    this._syncPlayer();
    for (const e of st.enemies) {
      const v = this.views.get(e.id);
      if (!v) continue;
      /* A corpse holds no board slot. After reload -> Continue, the engine ships
         `{hp:0, alive:false}` for anything killed before the save and there is
         no `death` event left to animate it away, so round 3 rendered a
         full-size 0/20 body. Anything already dead when we get here is simply
         not on the board. */
      if ((e.alive === false || e.hp <= 0) && !v.dying) {
        v.alive = false;
        v.el.classList.add('is-removed');
        continue;
      }
      v.setState(e);
      this._syncEnemyExtras(e.id);
    }
    this._renderRules();
    this._syncPiles();
    this._syncNerve(this.engine.energy, this.engine.player.energyMax);
    this.hud?.refresh();
    // The fan and `piles.hand` agree at the end of every beat, or this fixes it.
    this._reconcileHand();
    this._syncHandPlayability();
    this._renderIncoming(0);
    this._syncEndTurn();
  }

  /** Per-event refresh. Reads the actor directly — `engine.state` is a
   *  serialising snapshot and this runs once per hit of a multi-hit attack. */
  /**
   * An open tooltip is a LIVE readout, not a snapshot.
   *
   * The enemy panel read `COURAGE 30/30` while the bar four pixels under it
   * read 24/30, and again 175/175 against 169/175 — the panel is built once on
   * show and the fight had moved on underneath it. `ui/tooltip.js#refresh(el)`
   * re-runs the descriptor for exactly one anchor and does nothing at all when
   * that anchor is not the open one, so this is safe to call on every sync.
   */
  _refreshTip(v) {
    const tip = this.ctx.tooltip;
    if (!tip || !tip.refresh || !v) return;
    tip.refresh(v.el);
    tip.refresh(v.intentView.el);
  }

  _syncActor(id) {
    if (id === this.engine.player.id) { this._syncPlayer(); return; }
    const en = this.engine.actor(id);
    const v = this.views.get(id);
    if (en && v) { v.setState(this._light(en)); this._syncEnemyExtras(id); this._refreshTip(v); }
  }

  _light(a) {
    return {
      id: a.id, hp: a.hp, maxHp: a.maxHp, block: a.block, alive: a.alive,
      statuses: this.engine.statusList(a),
    };
  }

  /**
   * Counters, named state badges, House Rules and two-possibility intents.
   * The enemies agent writes counters through `_lib.setCnt` (which lands on
   * `actor.counters`) and mirrors rules into the shared `field` object, so this
   * reads both rather than inventing display state.
   */
  _syncEnemyExtras(id) {
    const v = this.views.get(id);
    const en = this.engine.actor(id);
    if (!v || !en) return;

    // counters
    const out = [];
    for (const k in en.counters || {}) {
      const val = en.counters[k];
      if (typeof val !== 'number') continue;
      const m = COUNTER_META[k] || {};
      if (m.hidden) continue;
      // A gauge (`max`) reads as 0/4 and that is information. A bare counter at
      // zero is not: the region boss shipped with a permanent `FLUSTERED 0`.
      if (!val && !m.max) continue;
      out.push({ id: k, label: m.label || titleCase(k), value: val, max: m.max, desc: m.desc, note: m.note });
    }
    v.setCounters(out);

    // named state badges
    v.setBadges(badgesFor(en, this.engine.field));

    // House Rule. The TEXT lives in the docked rail (`_renderRules`) because
    // pinned above the creature it measured [571, -120] on The Butler — fully
    // off the top of the screen. The creature keeps only the marker that says
    // "this one is holding the rule".
    let rule = null;
    for (const r of this._rules.values()) if (r.sourceId === id) rule = r;
    v.setRule(rule);
    // the revealed intent queue — Wink reorders it, so it is first-class
    v.setQueue(en.queue || []);

    // two-possibility intent
    const mv = en.pendingMove;
    if (mv && typeof mv.alternatives === 'function') {
      let alts = null;
      try { alts = mv.alternatives(this.engine.enemyCtx(en, mv)); } catch { alts = null; }
      v.setAlternatives(alts || []);
      v.hideIntent(!!(alts && alts.length > 1));
    } else {
      v.setAlternatives([]);
      v.hideIntent(false);
    }
  }

  _syncPlayer() {
    const p = this._light(this.engine.player);
    p.name = this.engine.player.name;
    const pct = Math.max(0, Math.min(1, p.hp / (p.maxHp || 1)));
    this.$plName.textContent = p.name || 'You';
    this.$pl.classList.toggle('is-low', pct <= 0.3);

    if (!this.$plGuard.classList.contains('is-preview')) {
      if (p.block > 0) { this.$plGuard.hidden = false; this.$plGuardN.textContent = String(p.block); }
      else this.$plGuard.hidden = true;
    }
    this._renderPlayerCounters();
    this._renderStatusRow(p.statuses || []);
  }

  /**
   * YOUR resource tracks, beside the Guard shield.
   *
   * `engine.state.counters` has always carried them —
   * `{id:'loose-bones', name:'Loose Bones', value, min:0, max:6,
   *   ownerId:'player', desc:'Whole at 0, Scattered at 4 or more.'}` — and the
   * scene walked only `en.counters`, so Bones's whole gauge was invisible while
   * `Sit Pretty` and `Put Yourself Back Together` keyed off it.
   *
   * Read from the live Map, not `engine.state`: that snapshot serialises the
   * entire fight and this runs once per damage event.
   */
  _renderPlayerCounters() {
    const pid = this.engine.player.id;
    const out = [];
    for (const c of this.engine.counters.values()) {
      if (c.ownerId !== pid) continue;
      const gauge = c.max > 0 && c.max <= GAUGE_MAX;
      // A gauge reads as 0/6 and that is information. A bare track at zero is not.
      if (!c.value && !gauge) continue;
      out.push({ c, gauge, state: counterState(c) });
    }
    const key = out.map(o => `${o.c.id}:${o.c.value}/${o.c.max}:${o.state || ''}`).join('|');
    if (key === this._plCounterKey) return;
    const prev = this._plCounterPrev;
    this._plCounterKey = key;
    this._plCounterPrev = new Map(out.map(o => [o.c.id, o.c.value]));
    this.$plCounters.textContent = '';
    for (const { c, gauge, state } of out) {
      const bumped = prev && prev.has(c.id) && prev.get(c.id) !== c.value;
      const d = document.createElement('span');
      d.className = 'cb-count cb-count--mine' + (bumped ? ' is-bumped' : '');
      d.setAttribute('role', 'listitem');
      d.tabIndex = 0;
      d.dataset.tip = `${c.name}|${c.desc || `${c.name}: ${c.value}${gauge ? ' of ' + c.max : ''}.`}|`
        + (state ? `Right now: ${state}.` : 'Some of your Tricks read this number.');
      d.setAttribute('aria-label',
        `${c.name} ${c.value}${gauge ? ' of ' + c.max : ''}${state ? '. ' + state : ''}`);
      d.innerHTML = `<i>${esc(c.name)}</i><b>${c.value}${gauge ? `<u>/${c.max}</u>` : ''}</b>`
        + (state ? `<em>${esc(state)}</em>` : '');
      this.$plCounters.appendChild(d);
    }
  }

  /**
   * The House Rules rail, docked under the HUD on the left.
   *
   * "Playing two Tricks of the same type in a row breaks the rule. Reprimand:
   * The Butler gains 8 Guard" is the single most consequential sentence in that
   * fight, and pinned above the creature's head it rendered at y = -120.
   */
  _renderRules() {
    if (!this.$rules) return;
    const list = [...this._rules.values()];
    const key = list.map(r => `${r.id}|${r.name}|${r.text}|${r.sourceId || ''}`).join('\n');
    if (key === this._rulesKey) return;
    this._rulesKey = key;
    this.$rules.textContent = '';
    this.$rules.hidden = list.length === 0;
    for (const r of list) {
      const who = r.sourceId ? (this.views.get(r.sourceId)?.name || '') : '';
      const d = document.createElement('div');
      d.className = 'cb-rule';
      d.setAttribute('role', 'listitem');
      d.tabIndex = 0;
      d.dataset.tip = `${r.name}|${r.text}|`
        + (who ? `${who} is keeping this rule.` : 'The house is keeping this rule.');
      d.innerHTML = `<i>House Rule</i><b>${esc(r.name)}</b><span>${esc(r.text)}</span>`
        + (who ? `<u>${esc(who)}</u>` : '');
      this.$rules.appendChild(d);
    }
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
      d.innerHTML = statusGlyph(s) + (s.showStacks === false ? '' : `<b>${s.stacks}</b>`);
      this.$statuses.appendChild(d);
    }
  }

  _syncPiles() {
    const pl = this.engine.piles;
    this.$drawPile.querySelector('b').textContent = String(pl?.draw?.length ?? 0);
    this.$discardPile.querySelector('b').textContent = String(pl?.discard?.length ?? 0);
  }

  _syncNerve(cur, max) {
    const c = cur ?? this.engine.energy;
    const m = max ?? this.engine.player.energyMax;
    if (this._nerveV === c && this._nerveM === m) return;
    const dropped = this._nerveV !== undefined && c < this._nerveV;
    this._nerveV = c; this._nerveM = m;
    this.$nerveN.textContent = String(c);
    this.$nerveM.textContent = '/' + m;
    this.$nerveArc.style.strokeDashoffset = String(this._arcLen * (1 - Math.max(0, Math.min(1, c / (m || 1)))));
    this.$nerve.classList.toggle('is-empty', c <= 0);
    this.$nerve.classList.remove('is-spend', 'is-gain');
    void this.$nerve.offsetWidth;
    this.$nerve.classList.add(dropped ? 'is-spend' : 'is-gain');
    this.hand?.setEnergy(c);
    this._syncHandPlayability();
    this._syncEndTurn();
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
    // `engine.state` serialises the whole fight — never touch it in a hot path.
    const any = (this.engine.piles?.hand || []).some(c =>
      this.engine.canPlay(c.uid, this._defaultTargetFor(c.uid)).ok);
    this.$endTurn.disabled = !playerTurn;
    this.$endTurn.classList.toggle('is-ready', playerTurn && !any);
    this.$endTurn.classList.toggle('is-waiting', playerTurn && any);
    this.$endTurn.dataset.tip = playerTurn
      ? (any ? 'End Turn|You still have Tricks you can play.|Shortcut: E'
        : 'End Turn|Nothing left you can play.|Shortcut: E')
      : 'End Turn|Not your turn. The house is taking its go.|';
    // The sentence above just changed, and the button may have just gone
    // `disabled` — which stops it dispatching the `pointerout` that would
    // otherwise dismiss its own tooltip. Tell the tooltip to re-read itself.
    this.ctx.tooltip?.refresh?.(this.$endTurn);
  }

  /** Place a CardView statically inside `wrap` at `scale`. */
  _placeCard(cv, wrap, scale) {
    const w = this._cardW * scale, h = this._cardH * scale;
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    cv.setTransform({ x: w / 2, y: h, rot: 0, scale, z: 0 });
    return cv;
  }

  _handCard(snap) {
    const def = this.engine.card(snap.uid)?.def || snap;
    return { uid: snap.uid, def, upgraded: snap.upgraded, cost: snap.cost };
  }

  _addEnemyView(en) {
    const snap = this.engine.state.enemies.find(e => e.id === en.id);
    if (!snap || this.views.has(en.id)) return;
    const v = new EnemyView(snap, { clock: this.ctx.clock, reduceMotion: this.reduceMotion, def: en.def });
    this._attachTips(v);
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
    on(this.$chOk, 'click', () => this._commitChoice());
    on(this.$chSkip, 'click', () => this._commitChoice(true));

    // Tooltips for `[data-tip]` are the shared Tooltip's own delegated job —
    // it understands this scene's `Title|body|footer` shorthand. This screen
    // used to run a second, competing delegation over the same attribute,
    // which is how a panel could end up with nobody responsible for hiding it.
    this._onPointer = (e) => { this._pt.x = e.clientX; this._pt.y = e.clientY; };
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    this._offs.push(() => window.removeEventListener('pointermove', this._onPointer));

    /* ── keyboard ─────────────────────────────────────────────────────────
     * CONTRACTS §6: a keyboard path for every action.
     *
     * `ui/hand.js` already implements the whole card interaction — 1-9 select,
     * arrows to walk the fan, Enter/ArrowUp to play, Tab to cycle targets while
     * aiming, Escape to cancel — on its own window listener. Round 1's fault
     * was not a missing implementation, it was that nothing ever gave the Hand
     * focus, so Tab from a blurred start never left BODY.
     *
     * So: this handler runs SECOND (the Hand binds first, in `_buildHand`), it
     * never re-implements anything the Hand owns, and its one addition to card
     * play is the handoff below.
     */
    this._onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // the chooser owns the keyboard while it is open
      if (this._choice && !this._choice.done) {
        const ch = this._choice;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this._focusChoice(ch.cursor + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this._focusChoice(ch.cursor - 1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._pickChoice(ch.cursor); }
        else if (e.key === 'Tab') {
          // A blocking choice is modal: Tab walks it and never escapes it.
          e.preventDefault();
          this._focusChoice(ch.cursor + (e.shiftKey ? -1 : 1));
        } else if (e.key === 'Escape') {
          // ESCAPE ALWAYS DISMISSES. Every chooser in this scene, mandatory or
          // not, the same key with the same result — see `_commitChoice`.
          e.preventDefault();
          this._commitChoice(true);
        } else if (e.key >= '1' && e.key <= '9') {
          const i = +e.key - 1;
          if (i < ch.nodes.length) { e.preventDefault(); this._pickChoice(i); }
        }
        e.stopPropagation();
        return;
      }
      // TAB FROM NOWHERE. If focus is sitting on BODY — first entry to the
      // scene, or anything that blurred — Tab enters the hand rather than
      // walking the browser's default order from the top of the document.
      if (e.key === 'Tab' && !e.shiftKey && !e.defaultPrevented) {
        const a = document.activeElement;
        if (!a || a === document.body || a === document.documentElement) {
          if (this.focusHand()) { e.preventDefault(); return; }
        }
      }
      if (e.shiftKey && e.code && /^Digit[1-3]$/.test(e.code)) return;   // Snacks — the HUD owns these
      const k = e.key.toLowerCase();
      if (k === 'e') { e.preventDefault(); this._endTurn(); }
      else if (k === 'q') { e.preventDefault(); this._openPile('draw'); }
      else if (k === 'w') { e.preventDefault(); this._openPile('discard'); }
      else if (k === 'd') { e.preventDefault(); this.hud?.openDeck(); }
      // Escape reaches Settings from inside a Scuffle, the same as everywhere
      // else in a run. The Modal owns Escape whenever one is already open.
      else if (e.key === 'Escape' && !document.querySelector('.mm-modal')) {
        e.preventDefault(); this.hud?.openSettings();
      }
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
    if (!this.engine) return;                     // the fight ended and we left
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
    /* The deny used to paint 160 stacking layers BENEATH the modal that
       provoked it (`.cb-deny` z 360 vs `.cb-chooser` z 520):
       `document.elementFromPoint` at the deny's own centre returned
       `DIV.cb-chooser__pool`. On screen, Escape on a mandatory pick visibly did
       nothing, which is exactly how the chooser got filed as a soft-lock. */
    const modal = !!(this._choice && !this._choice.done);
    this.$deny.classList.toggle('is-over-chooser', modal);
    void this.$deny.offsetWidth;
    this.$deny.classList.add('is-on');
    this.ctx.audio?.play?.('ui:deny');
    clearTimeout(this._denyT);
    this._denyT = setTimeout(() => this.$deny.classList.remove('is-on'), 1500);
  }

  /**
   * STS2-REFERENCE §4: "Screen shake scaled to damage. Hitstop on big hits.
   * Never on small ones."
   *
   * Two surfaces, because they move different things: `this._shake` translates
   * the DOM board (`_frame`), `stage.shake()` kicks the 3D camera and only the
   * 3D camera. Round 3 drove the camera at 0.05-0.185 world units, of which the
   * renderer uses half — under a pixel on screen — so the room never moved with
   * the board and no shake read at any damage tier in capture.
   */
  _addShake(k) {
    if (!this.shakeAmt) return;
    if (this.reduceMotion) return;
    this._shake.mag = Math.min(30, this._shake.mag + 16 * k * this.shakeAmt);
    this.ctx.stage?.shake?.(0.08 + 0.22 * k, 11);
  }

  /** Layer-local point for FX, from an actor id. */
  _pointOf(id) {
    if (id === this.engine?.player?.id) {
      /* The Kid's BODY, not her portrait. Sparks, Guard shimmer and the damage
         numeral used to land on the framed picture in the corner while the
         thing being hit stood somewhere else entirely. */
      if (this.hero) { const c = this.hero.centre(); return this.fx.toLocal(c.x, c.y); }
      const r = this.$pl.querySelector('.cb-player__figure').getBoundingClientRect();
      return this.fx.toLocal(r.left + r.width / 2, r.top + r.height * 0.5);
    }
    const v = this.views.get(id);
    if (!v) return this.fx.toLocal(this.fx.w / 2 + this.fx.left, this.fx.h / 2 + this.fx.top);
    const c = v.centre();
    return this.fx.toLocal(c.x, c.y);
  }

  _wait(s) { return this.ctx.clock.wait(Math.max(0.001, s)); }

  /* ── pile viewer ─────────────────────────────────────────────────────────
   * `ui/deckview.js` is the one viewer for every pile in the game — search,
   * filters, sort, real keyboard grid, and it force-sorts the draw pile itself
   * so looking is information and never an oracle. This screen used to carry a
   * private copy of a worse one; it does not any more.
   */
  async _openPile(which) {
    if (!this.engine || this._pileOpen) return;
    const st = this.engine.state;
    const raw = which === 'draw' ? st.piles.draw : st.piles.discard.slice().reverse();
    const cards = raw.map(c => ({
      uid: c.uid, def: this.engine.card(c.uid)?.def || c, upgraded: c.upgraded, cost: c.cost,
    }));
    this._pileOpen = true;
    this.ctx.audio?.play?.('ui:open-panel');
    try {
      await openPile({ mode: which, cards, ctx: this.ctx, host: this.ctx.dom });
    } finally {
      this._pileOpen = false;
      this.ctx.audio?.play?.('ui:close-panel');
    }
  }

  /* ── tooltips ─────────────────────────────────────────────────────────────
   * There is one tooltip in this game and it lives in `ui/tooltip.js`. It owns
   * every `[data-tip]` anchor on this screen by document delegation, and the
   * two rich panels (intent, creature) by `attach()` — see `_attachTips`.
   * This screen no longer calls `tooltip.show()` at all.
   */

  /* ══ frame ══════════════════════════════════════════════════════════════ */
  _frame(dt, t) {
    if (!this.engine) return;
    for (const v of this.views.values()) v.update(dt, t);
    this.hero?.update(dt, t);
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

  }

  update() { /* driven by clock.onFrame */ }

  /* ══ teardown ═══════════════════════════════════════════════════════════ */
  async exit() {
    clearTimeout(this._veilT);
    this._offFrame?.();
    this.hero?.destroy();
    this.hero = null;
    this._ro?.disconnect();
    for (const off of this._offs) { try { off(); } catch {} }
    for (const off of this._engineOffs) { try { off(); } catch {} }
    for (const off of this._tipOffs) { try { off(); } catch {} }
    this._tipOffs.length = 0;
    this._offs.length = 0; this._engineOffs.length = 0;
    clearTimeout(this._bannerT); clearTimeout(this._denyT); clearTimeout(this._windT);
    // never leave the engine awaiting a resolution that can no longer arrive
    if (this._choice && !this._choice.done) { this._choice.done = true; this._choice.resolve([]); this._choice = null; }
    this.engine?.setChoiceResolver?.(null);
    this._chViews?.forEach(v => v.destroy());
    this._chViews = [];
    this._q.length = 0;
    this.hand?.destroy();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.hud?.destroy(); this.hud = null;
    this.fx?.destroy();
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

/** Counters the enemies agent names as "the telegraph". */
const COUNTER_META = {
  dust: { label: 'Dust', max: 4, note: 'Each Dust adds 3 to the Tumble. Hitting it stops the gain.' },
  momentum: { label: 'Momentum', max: 2, note: 'Each Momentum adds 7 to Run the Hall.' },
  resonance: { label: 'Resonance', max: 4, note: 'At 4 the MIDNIGHT TOLL pre-empts everything.' },
  flustered: { label: 'Flustered' },
  'wound-up': { label: 'Wound Up', note: 'POP! gets bigger the longer it winds.' },
  excitement: { label: 'Excitement' },
  layers: { label: 'Layers' },
  scare: { label: 'Scare' },
  contents: { label: 'Contents' },
  patches: { label: 'Patches' },
  'loose-stuffing': { label: 'Loose Stuffing' },
  heads: { label: 'Heads' },
  'repair-patch': { label: 'Repair Patch' },
  garment: { hidden: true },   // shown as a named badge instead
};

/** `defineCounter` defaults `max` to 99, which means "no ceiling", not a gauge. */
const GAUGE_MAX = 24;

/** How far a floating numeral is offset sideways from an actor's centre, and
 *  how much clear air it leaves below the top of the rig it belongs to. */
const NUM_DX = 46;
const NUM_HEADROOM = 34;

/**
 * The state word for a player gauge — "Whole" / "Scattered" on Loose Bones.
 *
 * The engine ships the thresholds inside the counter's own `desc`
 * ("Whole at 0, Scattered at 4 or more.") and nowhere else, so they are read
 * from there rather than duplicated here: a table in the renderer would drift
 * away from the card text the moment Bones is rebalanced. If a counter's `desc`
 * is not written in that shape, it simply shows its number.
 *
 * The clean fix is upstream — see the note to the engine: a counter could carry
 * `states: [{at:0,label:'Whole'},{from:4,label:'Scattered'}]`.
 */
const STATE_RE = /\b([A-Z][A-Za-z' -]{1,22}?)\s+at\s+(\d+)(\s+or\s+more)?/g;
const _stateCache = new Map();
function counterState(c) {
  const desc = c.desc || '';
  if (!desc) return null;
  let parsed = _stateCache.get(desc);
  if (!parsed) {
    parsed = [];
    STATE_RE.lastIndex = 0;
    let m;
    while ((m = STATE_RE.exec(desc))) {
      parsed.push({ label: m[1].trim(), n: +m[2], orMore: !!m[3] });
    }
    _stateCache.set(desc, parsed);
  }
  let hit = null;
  for (const p of parsed) {
    if (p.orMore ? c.value >= p.n : c.value === p.n) hit = p.label;
  }
  return hit;
}

const GARMENTS = { raincoat: 'Raincoat', 'evening-coat': 'Evening Coat', 'mourning-coat': 'Mourning Coat' };

/**
 * Named state badges. The enemies encode these in per-instance `mem` and
 * counters; this maps the documented ones onto a badge with a tone.
 */
function badgesFor(en, field) {
  const out = [];
  const mem = en.mem || {};
  const c = en.counters || {};
  const id = en.defId || '';

  if (id === 'grand-coatcheck') {
    const keys = Object.keys(GARMENTS);
    out.push(mem.snagged
      ? { text: 'Snagged', tone: 'good', desc: 'Its Garment is off. No Garment bonus until it changes.' }
      : { text: GARMENTS[keys[(c.garment || 0) % keys.length]], tone: 'warn', desc: 'The Garment it is currently wearing. Each one changes what it does.' });
  }
  if (mem.condition) out.push({ text: titleCase(mem.condition), tone: mem.condition === 'shattered' ? 'good' : 'warn' });
  if (mem.hidden || en.flags?.hidden) out.push({ text: 'Hidden', tone: 'warn', desc: 'It cannot be targeted by Attacks right now.' });
  else if (mem.exposed) out.push({ text: 'Exposed', tone: 'good', desc: 'Wide open. Attacks land.' });
  if (mem.position) out.push({ text: titleCase(mem.position), tone: 'warn', desc: 'Where the Beast currently is.' });
  if (mem.discomposed || en.statuses?.has?.('discomposed')) out.push({ text: 'Discomposed', tone: 'good' });
  if (field?.darkness) out.push({ text: 'Darkness', tone: 'warn' });
  return out;
}

function titleCase(s) {
  return String(s).replace(/[-_]/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

function decayLine(decay) {
  if (decay === 'turnEnd') return 'One stack wears off at the end of the turn.';
  if (decay === 'turnStart') return 'It ticks at the start of the turn.';
  return 'It lasts the whole Scuffle.';
}

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

export default CombatScene;
