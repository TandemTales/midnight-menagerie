/**
 * CombatEngine. OWNER: combat-engine.
 *
 * Headless and deterministic. No DOM, no THREE, no Math.random, no setTimeout.
 * `src/scenes/combat.js` renders what this reports and never decides a rule.
 *
 * Public API (CONTRACTS.md §"Combat engine public API"):
 *   new CombatEngine({ player, enemies, rng, relics, hooks })
 *   engine.state                                  plain serialisable snapshot
 *   engine.startCombat()      -> Promise<void>
 *   engine.canPlay(uid, tid)  -> { ok, reason }
 *   engine.playCard(uid, tid) -> Promise<Event[]>
 *   engine.endTurn()          -> Promise<Event[]>
 *   engine.preview(uid, tid)  -> { damage, block, statuses, killsTarget, … }
 *   engine.on(event, fn)      -> unsubscribe fn
 *
 * ── TURN ORDER (authoritative; docs/NOTES.md repeats it) ────────────────────
 *
 * startCombat()
 *   1  combat:start
 *   2  relic/power onCombatStart hooks
 *   3  deck shuffled into draw (rng), Innate cards lifted to the top
 *   4  enemies roll Courage, onSpawn, choose their first move → intent
 *   5  beginPlayerTurn(1)
 *
 * beginPlayerTurn()
 *   1  turn++ ; phase='player' ; turn:start {actor:'player'}
 *   2  Guard wiped (keepBlock survives)                     → block:lose
 *   3  START-OF-TURN STATUSES: 'turnStart' decay, then onTurnStart hooks
 *      (Dread ticks here: lose Courage, then lose 1 Dread)
 *   4  countdown timers tick, fire at 0                     → timer / timer:fire
 *   5  DRAW to hand (drawPerTurn + modifyDraw)              → draw / shuffle
 *   6  ENERGY refilled to max (+ modifyEnergyGain)          → energy
 *   7  INTENTS refreshed for every living enemy             → intent
 *
 * endTurn()
 *   1  turn:end {actor:'player'}
 *   2  HAND RESOLUTION in hand order: Ethereal → exhaust, Retain → stays,
 *      everything else → discard
 *   3  END-OF-TURN STATUSES for the player: onTurnEnd hooks (Regen heals),
 *      then 'turnEnd' decay (Weak/Vulnerable/Frail/Faint lose a stack)
 *   4  playerTurnEnd timers tick
 *   5  ENEMY ACTIONS IN SLOT ORDER, one enemy at a time:
 *        a turn:start {actor:enemyId}
 *        b that enemy's Guard wiped
 *        c its start-of-turn statuses tick (its own Dread)
 *        d its move resolves
 *        e turn:end {actor:enemyId}
 *   6  ENEMY END-OF-TURN STATUSES: onTurnEnd hooks then 'turnEnd' decay,
 *      for every living enemy, in slot order
 *   7  every living enemy chooses its next move          → intent
 *   8  beginPlayerTurn()
 *
 * Nothing in here is time-based. The renderer consumes the returned Event[] and
 * animates at whatever pace it likes; the engine has already finished.
 */

import { RNG } from '../core/rng.js';
import { EV } from './events.js';
import { Hooks } from './hooks.js';
import { Player, Enemy } from './actor.js';
import { Card, Piles } from './piles.js';
import { applyDamage, previewDamageValue } from './damage.js';
import { getStatus, FRAIL_MULT } from './statuses.js';
import {
  buildIntent, chooseMove, refreshIntents, intentFamily, FAMILY_LABEL,
  queueSnapshot, consumePlan, rebuildPlan, moveAt, isAnchored,
  previewIntent, previewDepthOf, previewedFamilies,
  swapIntents, postponeIntent, deleteIntent, forkFuture, setIntentControl, MAX_PLAN,
  overrideIntent, clearIntentOverride,
} from './intents.js';
import { previewCard, previewCardAsync } from './preview.js';
import { ChoiceBroker } from './choice.js';
import { Pile, CardType, Target } from '../data/schema.js';
import { detectStrict, guardFactory } from './strict.js';

const MAX_LOG = 400;

/**
 * The most Kids that can go in together.
 *
 * FOUR, by the designer's decision on 2026-08-27, live from 2026-08-28.
 *
 * This was deliberately held at 2 while `scenes/select.js` was hard-wired to
 * exactly two Kids: raising it alone would have let a run start that the select
 * screen could not set up. The screen now offers 1..MAX_PARTY and reads this
 * constant rather than a literal of its own, so the two cannot drift apart in
 * either direction. The scaling below is measured, not extrapolated.
 */
export const MAX_PARTY = 4;

/**
 * Enemy Courage multiplier by party size, indexed 0-based (1p..4p).
 *
 * 2p = 220%, and it is a MEASURED number, not a quoted one.
 *
 * Slay the Spire 2 is the model — same game shape, same problem — and its
 * structure is adopted wholesale: enemy Courage scales, enemy DAMAGE never
 * does, and the extra threat comes from targeting (AoE moves, per-move seat
 * preferences). See `partyTargets` / `pickSeat`, and the per-enemy notes in
 * each region chapter.
 *
 * The NUMBER took three measurements, because the sources disagree wildly:
 *
 *   1.60x  `docs/design/regions/01-foyer.md` §26 (and the Nursery and Sleeping
 *          Quarters chapters). Measured here: duo wins 92% against solo's 80%
 *          and finishes on 64% Courage against 22%. Far too easy.
 *   2.50x  What StS2 actually uses, per two independent Steam threads
 *          ("1p: 1x hp, 2p: 2.5x hp, 3p: 3.5x, 4p: 4.5x"). Measured here: duo
 *          wins 60% against solo's 80%, with four times the falls. That
 *          reproduces StS2's own signature — "2 player is the hardest way to
 *          play the game" — which their players complain about at length. A
 *          cute-spooky game about kids and their pets should not ship the one
 *          number the reference game is criticised for.
 *   2.20x  The parity point, measured: Scuffles 73% solo vs 77% duo (+3 pts,
 *          n=30); Elites 55% vs 55% (+0 pts, n=20). Falls roughly double
 *          (0.27 -> 0.57 a fight), which is the point — a Kid going down is a
 *          co-op moment, and they get back up at 1 Courage when the team wins.
 *
 * Note the guide sites that say 1.5-1.8x for 2p are simply wrong; they do not
 * match play reports and they do not match what this engine measures.
 *
 * ── 3p and 4p, MEASURED for the first time on 2026-08-28 ───────────────────
 *
 * They used to read 3.1 and 4.0 and the comment here said, correctly, that they
 * were "extrapolated, not measured". They were also badly wrong. The first
 * measurement (Foyer, standard tier, 24 fights a size) read:
 *
 *     1p 79% win · 2p 75% · 3p 96% · 4p 96%
 *
 * — seventeen points of free win rate for bringing friends, with 64% and 73% of
 * the party's Courage still on the table at the end. The curve is supposed to be
 * FLAT; that is a rising line, and it is rising hard.
 *
 * The reason is structural and worth writing down. Enemy DAMAGE never scales,
 * by design. Adding a Kid therefore multiplies the party's output AND its total
 * Courage, while the incoming damage per Kid falls. Both halves of the ledger
 * improve at once, so the Courage multiplier has to grow faster than the party
 * does. StS2's own formula is linear in player count and would give 3.3 / 4.4
 * here; measured against this engine, linear is nowhere near enough.
 *
 * Four passes, each 24-36 real fights with the competent bot on every seat:
 *
 *     3p: 3.1 -> 96%   4.2 -> 71%   4.0 -> 75%    (2p reads 75%: parity)
 *     4p: 4.0 -> 96%   6.2 -> 54%   5.3 -> 88%   5.7 -> 72%
 *
 * Confirmed at a fresh seed with n=36: 1p 64% · 2p 78% · 3p 67% · 4p 72%, a
 * ~14-point spread across all four sizes where the noise on n=36 is about +/-8
 * points each. Falls per fight go 0.39 / 0.44 / 1.00 / 1.11 — more Kids go down
 * in a bigger party, which is the intended co-op texture, and they come back at
 * 1 Courage when the team wins.
 *
 * WHAT IS STILL OPEN: the residual is that bigger parties finish with more
 * Courage left (26% solo, 62% at 4p) even at matched win rates. Raising Courage
 * further would fix the number and make fights long instead of dangerous — 4p
 * at 6.2 already ran 7.7 turns. The real lever is AoE coverage: the compensation
 * for "damage never scales" is supposed to be TARGETING, and the Foyer's
 * standard tier is thin on moves that hit everybody. That is an enemy-content
 * question, not a constant, and it is a designer's call.
 *
 * Re-measure with `python tests/coop/balance.py` after ANY change to enemy
 * damage, starting decks, or the co-op card pool. Per-enemy overrides compose
 * on top via `EnemyDef.partyHp`.
 */
const PARTY_HP_SCALE = [1, 2.2, 4.0, 5.7];


export class CombatEngine {
  /**
   * @param {Object} cfg
   * @param {Object} cfg.player   { name, maxHp, hp, energyMax, drawPerTurn, handCap, companion, kid, deck:[CardDef|{def,upgraded}] }
   * @param {Array}  cfg.enemies  EnemyDef[] | [{def, hp, slot}]
   * @param {RNG}    cfg.rng      REQUIRED for determinism. Never defaulted to a clock seed silently.
   * @param {Array}  [cfg.relics] RelicDef[]
   * @param {Array}  [cfg.hooks]  [{name, fn}] extra hooks registered at construction
   * @param {Object} [cfg.bus]    optional core/bus.js — events mirror as `combat:<type>`
   */
  constructor(cfg = {}) {
    this._cfg = cfg;
    this.rng = cfg.rng instanceof RNG ? cfg.rng : new RNG(cfg.seed ?? 1);
    this.seed = this.rng.seed;
    // Keepsakes are PER PLAYER — `cfg.relics` is the solo spelling and lands on
    // seat 0. Held here only until `_build` hands them to their seat, because a
    // `_bare` engine (the preview clone) never runs `_build`.
    this._seedRelics = (cfg.relics || []).slice();
    this.bus = cfg.bus || null;
    /**
     * "You cannot read an intent." A predicate the CONTENT sets — `(enemy) =>
     * boolean` — consulted by `buildIntent`. Null means every intent is
     * readable, which is every fight that is not in a marked wing.
     *
     * A slot rather than a rule, for the same reason `choices.setRemote` is a
     * slot: two of mapgen's wing conditions are about what can be read of an
     * intent, and the engine has no business knowing what a wing is.
     * `data/wings.js` installs it; `state/run.js` calls that before
     * `startCombat()`, because the opening intents are rolled inside it.
     */
    this.concealIntent = null;
    this.isPreview = !!cfg.isPreview;

    // The dev seam guard (combat/strict.js). Resolved ONCE here, so the hot
    // path is a single already-bound function reference and a shipped build
    // pays nothing at all.
    this.strictCtx = detectStrict(cfg);
    this._guardCtx = guardFactory(this.strictCtx);

    this.hooks = new Hooks(this);
    for (const h of (cfg.hooks || [])) this.hooks.add(h.name, h.fn, h);

    this.turn = 0;
    this.phase = 'setup';          // 'setup' | 'player' | 'enemy' | 'over'
    this.over = false;
    this.victory = false;
    this.started = false;

    /** @type {Map<string, Object>} per-combat resource tracks */
    this.counters = new Map();
    /**
     * Counter ids that belong to the TABLE rather than to a seat, so
     * `_ckey` does not prefix them and every seat reads the one value.
     * Drizzle's Weather is the case this exists for: her chapter defines
     * it as a global combat state and it acts on the shared enemies, so a
     * per-seat Weather would have two Drizzles soaking and drying the same
     * board out of two different states.
     * @type {Set<string>}
     */
    this._sharedCounters = new Set();
    /** @type {Object[]} countdown triggers */
    this.timers = [];
    /** @type {Object[]} board objects (Plants, Plots, Pumpkins, Graves) */
    this.objects = [];
    /** @type {Enemy[]} */
    this.allies = [];
    /** Per-combat shared scratch every enemy can read and write (Darkness, House Rules). */
    this.field = {};
    /** @type {Object[]} active House Rules */
    this.rules = [];
    /** @type {{id:string,type:string,uid:string}[]} cards played during the current player turn */
    this.playedThisTurn = [];
    /** Extra draw applied to the NEXT player turn only (ctx.modifyDraw). */
    this.drawDeltaNextTurn = 0;
    /** Content registries so enemy moves can say addCard('clutter') / summon('dust-bunny'). */
    this.cardDefs = new Map();
    this.enemyDefs = new Map();
    /** id -> { id, name, text } for House Rules, so an intent can name a rule it
     *  has not announced yet. Seeded by registerRules() and by announceRule(). */
    this.ruleDefs = new Map();
    /**
     * Which seat this client is playing. The ChoiceBroker consults it: a
     * request addressed to somebody else's seat is never put in front of the
     * person sitting here. Set from `run.localSeat` when the run builds a
     * fight; 0 everywhere else, which is the whole answer in solo.
     */
    this.localSeat = cfg.localSeat | 0;
    this.choices = new ChoiceBroker(this);
    this._trackerInstaller = cfg.trackerInstaller || null;

    /**
     * Counters content is allowed to read. EVERY key here is maintained — if a
     * counter cannot be maintained it does not belong in this object, because a
     * field that is declared, zeroed and never written reads exactly like a
     * mechanic the designer wanted to do nothing. `damageDealtThisTurn` was that
     * for a whole build, and it made the Butler's Roughhousing rule impossible
     * to trigger at any threshold.
     *
     * `tests/combat` asserts that this key set and the documented contract agree
     * and that a real fight actually moves every one of them.
     *
     * ThisTurn counters reset at the START of the player turn, so they cover the
     * player turn AND the enemy phase that follows it — the same lifecycle as
     * `actor.damageTakenThisTurn`. ThisCombat counters never reset.
     */
    this.stats = {
      cardsPlayedThisTurn: 0,
      cardsPlayedThisCombat: 0,
      attacksPlayedThisTurn: 0,
      skillsPlayedThisTurn: 0,
      cardsDiscardedThisTurn: 0,
      cardsExhaustedThisTurn: 0,
      cardsExhaustedThisCombat: 0,
      damageDealtThisTurn: 0,
      damageDealtThisCombat: 0,
      damageTakenThisTurn: 0,
      damageTakenThisCombat: 0,
      damageTakenLastEnemyTurn: 0,
      turnsTaken: 0,
    };

    this._listeners = new Map();
    this._seq = 0;
    this._collect = null;
    this._dirty = true;
    this._rev = 0;
    this._stateCache = null;
    this.log = [];
    this._entityUid = 0;
    this._objectUid = 0;
    this._timerUid = 0;
    this._buildingState = false;

    /**
     * The party, in seat order. ALWAYS at least one; solo is a party of one,
     * which is why nothing below has a separate single-player path. Seats are
     * never removed during a fight — a player at 0 Courage is `fallen`, still
     * in this array (see Player.fallen).
     * @type {Player[]}
     */
    this.players = [];

    if (!cfg._bare) this._build(cfg);
  }

  // ── construction ──────────────────────────────────────────────────────────

  _build(cfg) {
    // `cfg.players` is the party form and `cfg.player` is the solo form; solo is
    // exactly a party of one. Both land in `this.players`, so no code past this
    // point has to ask which one it was handed.
    let roster = cfg.players && cfg.players.length ? cfg.players : [cfg.player || {}];
    if (roster.length > MAX_PARTY) {
      // Loud, not silent: quietly dropping a seat would show up as a Kid who
      // joined and then never got a turn.
      console.warn(`[combat] party of ${roster.length} capped to ${MAX_PARTY}; extra seats dropped`);
      roster = roster.slice(0, MAX_PARTY);
    }
    this.players = roster.map((raw, seat) => this._makePlayer(raw || {}, seat, cfg));

    /** @type {Enemy[]} */
    this.enemies = [];
    let slot = 0;
    for (const raw of (cfg.enemies || [])) {
      this.enemies.push(this._makeEnemy(raw, slot++));
    }
  }

  /** One seat: the Player, its own pile set, and its own deck. */
  _makePlayer(p, seat, cfg) {
    const pl = new Player({
      id: p.id || (seat ? `player${seat}` : 'player'),
      name: p.name || 'Kid',
      seat,
      maxHp: p.maxHp ?? 70,
      hp: p.hp ?? p.maxHp ?? 70,
      energyMax: p.energyMax ?? 3,
      drawPerTurn: p.drawPerTurn ?? 5,
      handCap: p.handCap ?? 10,
      companion: p.companion || 'neutral',
      kid: p.kid || null,
    });
    pl.piles = new Piles(this, pl);
    /** This Kid's Keepsakes. Per seat: co-op parity, and `_relicProviders`
     *  dispatches each one with its owner so a teammate's Keepsake can never
     *  fire for the wrong Kid. */
    pl.relics = (p.relics || (seat === 0 ? this._seedRelics : null) || []).slice();

    // Deck order is irrelevant — startCombat shuffles. `cfg.deck` is the old
    // solo spelling and only ever applies to seat 0.
    const deck = p.deck || (seat === 0 ? cfg.deck : null) || [];
    if (seat === 0) this._deckSource = deck;
    for (const entry of deck) {
      const def = entry.def || entry;
      const card = new Card(def, { upgraded: !!entry.upgraded, meta: entry.meta });
      pl.piles.draw.push(card);
      card.pile = Pile.DRAW;
    }
    return pl;
  }

  /**
   * The enemy Courage multiplier for the current party size — 1 in solo.
   *
   * Applied in `_makeEnemy`, to the rolled Courage, so `maxHp` and `hp` are
   * scaled together and a fight never opens looking pre-damaged. It lives on
   * the engine rather than in `_build` because an enemy summoned mid-fight has
   * to be scaled the same way.
   */
  get partyHpScale() {
    return PARTY_HP_SCALE[Math.min(this.players.length, PARTY_HP_SCALE.length) - 1] ?? 1;
  }

  /**
   * `raw` is either an EnemyDef itself or a wrapper `{ def, hp?, id? }`.
   * Only the wrapper form may override hp/id — an EnemyDef's own `hp` is the
   * inclusive ROLL RANGE `[min,max]`, never a value.
   */
  _makeEnemy(raw, slot) {
    const def = raw.def || raw;
    const wrapped = raw !== def;
    const range = def.hp || [10, 10];
    const hp = (wrapped && typeof raw.hp === 'number')
      ? raw.hp
      : (Array.isArray(range) ? this.rng.range(range[0], range[1]) : (range | 0));
    // A per-enemy override from its region chapter wins over the party curve;
    // otherwise the curve applies. Rolled Courage is scaled AFTER the roll so a
    // seeded fight keeps the same roll at every party size.
    const f = (typeof def.partyHp === 'function')
      ? (def.partyHp(this.players.length) ?? this.partyHpScale)
      : this.partyHpScale;
    const scaled = f === 1 ? hp : Math.max(1, Math.round(hp * f));
    return new Enemy({
      id: (wrapped && raw.id) || `e${slot}`,
      name: def.name || 'Something',
      def, slot,
      maxHp: scaled, hp: scaled,
      tier: def.tier || 'normal',
      side: 'enemy',
    });
  }

  // ── events ────────────────────────────────────────────────────────────────

  /** @returns {() => void} unsubscribe */
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }
  off(type, fn) { this._listeners.get(type)?.delete(fn); }

  /**
   * Invalidate the state snapshot. Bumping a REVISION rather than setting a
   * boolean is deliberate: `_buildState` can be interrupted by a mutation
   * (a `dynamicCost` that touches a counter, a hook that fires mid-snapshot),
   * and a boolean cleared at the end of the build would swallow it. The build
   * only marks itself clean if the revision it started with is still current.
   */
  _invalidate() { this._dirty = true; this._rev++; }

  _emit(type, payload) {
    const ev = { type, seq: ++this._seq, turn: this.turn, ...payload };
    this._invalidate();
    if (this._collect) this._collect.push(ev);
    if (!this.isPreview) {
      this.log.push(ev);
      if (this.log.length > MAX_LOG) this.log.shift();
    }
    const s = this._listeners.get(type);
    if (s) for (const fn of [...s]) { try { fn(ev); } catch (e) { console.error(`[combat:${type}]`, e); } }
    const w = this._listeners.get('*');
    if (w) for (const fn of [...w]) { try { fn(ev); } catch (e) { console.error('[combat:*]', e); } }
    if (this.bus && !this.isPreview) this.bus.emit(`combat:${type}`, ev);
    return ev;
  }

  /** Run `fn` while capturing every event it causes. Returns the events. */
  _capture(fn) {
    const prev = this._collect;
    const list = [];
    this._collect = list;
    try { fn(); } finally { this._collect = prev; }
    if (prev) prev.push(...list);
    return list;
  }

  say(text, tone = 'info') { this._emit(EV.LOG, { text, tone }); }

  // ── state snapshot ────────────────────────────────────────────────────────

  /**
   * Plain, structuredClone-able snapshot. The renderer reads ONLY this and the
   * event stream. Rebuilt lazily — reading it every frame with no state change
   * allocates nothing.
   */
  get state() {
    if (!this._dirty && this._stateCache) return this._stateCache;
    // RE-ENTRANCY: building the snapshot calls cardSnap → canPlay → costOf →
    // CardDef.dynamicCost(ctx), and a content helper may read `ctx.e.state` from
    // in there. Rebuilding at that moment recurses forever. Hand back the last
    // good snapshot instead — and use the cheap direct accessors
    // (engine.turn / engine.phase / engine.energy) inside card code.
    if (this._buildingState) return this._stateCache || this._minimalState();
    this._buildingState = true;
    const rev = this._rev;
    try { return this._buildState(rev); } finally { this._buildingState = false; }
  }

  // ── the party ─────────────────────────────────────────────────────────────

  /**
   * Seat 0.
   *
   * In solo this IS the player and every reader is correct. In a party it is
   * almost always a bug — content that says `engine.player` nearly always means
   * "the player who played this card", and silently handing back seat 0 is
   * precisely the shape of failure CONTRACTS rule 8 exists to stop (Haunt dealt
   * zero damage for a whole build through one silent `?.`). So in a party, with
   * the dev guard armed, this THROWS and names the fix; a shipped build still
   * gets seat 0 rather than an exception in someone's run.
   *
   * Port a site by taking the seat from what you already have: `ctx.self`, the
   * card's `owner`, `engine.playerOf(actor)`, or an explicit seat argument.
   */
  get player() {
    if (this.players.length > 1 && this.strictCtx) {
      throw new Error(
        '[combat] engine.player is seat 0, but this fight has ' + this.players.length +
        ' seats. Say which one: engine.playerOf(actor), ctx.self, or pass a seat.');
    }
    return this.players[0];
  }

  /** Seat 0's Keepsakes. Same reasoning, same guard, as `player` below. */
  get relics() {
    if (this.players.length > 1 && this.strictCtx) {
      throw new Error(
        '[combat] engine.relics is the Keepsake list for seat 0, but this fight has ' +
        this.players.length + ' seats. Use player.relics, or engine.allRelics().');
    }
    return this.players[0].relics;
  }
  set relics(v) { if (this.players[0]) this.players[0].relics = (v || []).slice(); }

  /** Every Keepsake at the table, each paired with the seat that owns it. */
  allRelics() {
    const out = [];
    for (const pl of this.players) for (const r of (pl.relics || [])) out.push({ relic: r, seat: pl });
    return out;
  }

  /** Seat 0's piles. Same reasoning, same guard, as `player` below. */
  get piles() {
    if (this.players.length > 1 && this.strictCtx) {
      throw new Error(
        '[combat] engine.piles is the pile set for seat 0, but this fight has ' +
        this.players.length + ' seats. Use engine.pilesOf(player) or player.piles.');
    }
    return this.players[0].piles;
  }

  /**
   * The seat whose action is resolving RIGHT NOW, or null between actions.
   *
   * Almost every helper here — `drawCards`, `gainEnergy`, `costOf`,
   * `discardCard` — is implicitly about "the player doing this". In solo there
   * was only one, so they read `this.player`. In a party they read
   * `this.current`, and `_asSeat()` is what makes that answer right: card
   * resolution, each seat's turn opening and each seat's turn end all run
   * inside one.
   *
   * A stack discipline, not a mode: `_asSeat` restores whoever was acting
   * before, so a card that makes a TEAMMATE draw (Marmalade's Follow My Tail)
   * nests correctly instead of leaving the engine pointed at the wrong Kid.
   * @type {Player|null}
   */
  acting = null;

  /** The acting seat, or seat 0 when nothing in particular is acting. */
  get current() { return this.acting || this.players[0]; }

  /**
   * The per-turn counters for one seat — the acting seat by default.
   *
   * Content reads this, not `engine.stats`. `engine.stats` is the TEAM mirror:
   * identical to seat 0 in solo, and the sum of the table in co-op, which is
   * what an elite threshold worded "16 damage per player, all team damage
   * during the round contributes" wants and what a Kid's own card never does.
   */
  seatStats(who = null) {
    const pl = who ? this._resolveSeat(who) : this.current;
    return (pl && pl.stats) || this.stats;
  }

  /** The Tricks ONE seat played this turn. `engine.playedThisTurn` is the table's. */
  seatPlayed(who = null) {
    const pl = who ? this._resolveSeat(who) : this.current;
    return (pl && pl.playedThisTurn) || this.playedThisTurn;
  }

  /** Run `fn` with `pl` as the acting seat, then put back whoever was acting. */
  _asSeat(pl, fn) {
    const prev = this.acting;
    if (pl) this.acting = pl;
    try { return fn(); } finally { this.acting = prev; }
  }

  /** Which seat is holding this card. A card never moves between seats. */
  seatOfCard(card) {
    if (!card) return null;
    for (const pl of this.players) if (pl.piles.pileOf(card)) return pl;
    return null;
  }

  /** How many seats at the table. 1 in solo. */
  get partySize() { return this.players.length; }
  /** True when this is a co-op fight. */
  get isParty() { return this.players.length > 1; }

  /** Seat by index. */
  seat(n) { return this.players[n] || null; }

  /**
   * Players who can still act. A fallen player is NOT here — they are still in
   * `players` (their deck and relics stay inspectable, and they come back at
   * 1 Courage if the team wins) but they take no turn and draw no cards.
   */
  livingPlayers() {
    const out = [];
    for (const p of this.players) if (p.alive && !p.fallen) out.push(p);
    return out;
  }

  /** The seat an actor belongs to, or null. A Player is its own seat. */
  playerOf(actor) {
    if (!actor) return null;
    if (actor.side === 'player') return actor;
    return null;
  }

  /** A seat's pile set, tolerating being handed the piles already. */
  pilesOf(who) {
    if (!who) return null;
    if (who.draw && who.hand) return who;
    return who.piles || null;
  }

  /** Cheap, allocation-free reads that are always safe from inside a card effect. */
  get energy() { return this.current ? this.current.energy : 0; }
  get energyMax() { return this.current ? this.current.energyMax : 0; }
  get handSize() { return this.current.piles.hand.length; }
  get cardsPlayedThisTurn() { return this.stats.cardsPlayedThisTurn; }

  _minimalState() {
    return {
      turn: this.turn, phase: this.phase, over: this.over, victory: this.victory,
      seed: this.seed, partial: true,
      player: this.players[0] ? this.players[0].snapshot() : null,
      enemies: this.enemies.map(e => e.snapshot()),
      allies: [], piles: { draw: [], hand: [], discard: [], exhaust: [], limbo: [], stash: [] },
      counts: this.players[0].piles.snapshotCounts(), counters: [], timers: [], objects: [],
      relics: [], stats: { ...this.stats },
    };
  }

  _buildState(rev) {
    const s = {
      turn: this.turn,
      phase: this.phase,
      over: this.over,
      victory: this.victory,
      seed: this.seed,
      // `player` and `piles` are seat 0, kept flat because the whole renderer
      // reads them and solo is the only shape that existed until now. `players`
      // is the party, seat 0 included, and is what co-op UI reads. Both are
      // built from the same snapshot so they can never disagree.
      player: this._seatState(this.players[0]),
      players: this.players.map(pl => this._seatState(pl)),
      partySize: this.players.length,
      enemies: this.enemies.map(e => ({ ...e.snapshot(), statuses: this.statusList(e) })),
      allies: this.allies.map(a => ({ ...a.snapshot(), statuses: this.statusList(a) })),
      piles: this._pileState(this.players[0]),
      counts: this.players[0].piles.snapshotCounts(),
      /**
       * `stashCap` used to sit here too, as `players[0].piles.stashCap`: one
       * seat-0 number loose in a snapshot that is otherwise per seat, with no
       * reader anywhere in the build. Pudding's cemetery widens the cap per
       * Kid, so the first screen to reach for the flat one would have shown
       * every Kid the host's cemetery — the same shape as the pile events that
       * had every seat's draws landing in the local Kid's fan, waiting for its
       * first consumer.
       *
       * It is per seat only, in `_seatState`. `player`/`piles`/`counts` above
       * stay flat on purpose: they are seat 0's by documented design and the
       * whole renderer reads them.
       */
      rules: this.rules.map(r => ({ id: r.id, name: r.name, text: r.text, sourceId: r.sourceId || null })),
      field: JSON.parse(JSON.stringify(this.field)),
      playedThisTurn: this.playedThisTurn.map(x => ({ ...x })),
      counters: [...this.counters.values()].map(c => ({
        id: c.id, name: c.name, value: c.value, min: c.min, max: c.max,
        ownerId: c.ownerId, icon: c.icon, desc: c.desc, focusable: !!c.focusable,
        shared: !!c.shared,
        states: c.states.map(x => ({ ...x })),
        state: stateFor(c, c.value),
      })),
      timers: this.timers.map(t => ({
        id: t.id, label: t.label, turnsLeft: t.turnsLeft, ownerId: t.ownerId, when: t.when,
      })),
      objects: this.objects.map(o => ({
        id: o.id, kind: o.kind, slot: o.slot, name: o.name,
        data: JSON.parse(JSON.stringify(o.data || {})),
      })),
      relics: this.players[0].relics.map(r => ({ id: r.id, name: r.name, counter: r.counter ?? null, icon: r.icon || r.id })),
      stats: { ...this.stats },
    };
    this._stateCache = s;
    // Only clean if nothing mutated while we were snapshotting.
    this._dirty = (rev !== undefined) && (this._rev !== rev);
    return s;
  }

  /** One seat, fully snapshotted: the actor, its statuses, and its own piles. */
  _seatState(pl) {
    return {
      ...pl.snapshot(),
      statuses: this.statusList(pl),
      relics: (pl.relics || []).map(r => ({ id: r.id, name: r.name, counter: r.counter ?? null, icon: r.icon || r.id })),
      piles: this._pileState(pl),
      counts: pl.piles.snapshotCounts(),
      stashCap: pl.piles.stashCap,
    };
  }

  _pileState(pl) {
    const q = pl.piles;
    return {
      draw: q.draw.map(c => this.cardSnap(c)),
      hand: q.hand.map(c => this.cardSnap(c)),
      discard: q.discard.map(c => this.cardSnap(c)),
      exhaust: q.exhaust.map(c => this.cardSnap(c)),
      limbo: q.limbo.map(c => this.cardSnap(c)),
      stash: q.stash.map(c => this.cardSnap(c)),
    };
  }

  statusList(actor) {
    const out = [];
    for (const [id, stacks] of actor.statuses) {
      if (stacks === 0) continue;
      const d = getStatus(id);
      out.push({
        id, stacks, name: d.name, kind: d.kind, icon: d.icon || id,
        desc: String(d.desc || '').replace(/\{n\}/g, String(stacks)),
        decay: d.decay, showStacks: d.stacks !== false,
        meta: actor.statusMeta[id] ? { ...actor.statusMeta[id] } : null,
      });
    }
    for (const [id, p] of actor.powers) {
      out.push({
        id, stacks: p.stacks ?? 1, name: p.name || id, kind: 'buff',
        icon: p.icon || id, desc: p.desc || '', decay: 'never', power: true, showStacks: (p.stacks ?? 1) > 1,
      });
    }
    return out;
  }

  /**
   * Plain snapshot of a runtime card.
   * `display` carries the live-modified numbers so card text can be recoloured:
   * `{ value, base, dir:'up'|'down'|'same' }`.
   */
  cardSnap(card, targetId = null) {
    const cost = this.costOf(card);
    const target = targetId ? this.actor(targetId) : this.firstLivingEnemy();
    const display = {};
    if (card.nums) {
      for (const k of Object.keys(card.nums)) {
        const base = card.nums[k];
        if (typeof base !== 'number') { display[k] = { value: base, base, dir: 'same' }; continue; }
        let value = base;
        if (k === 'd') value = previewDamageValue(this, this.current, target, base, { kind: 'attack' });
        else if (k === 'b') value = this.previewBlockValue(this.current, base);
        display[k] = { value, base, dir: value > base ? 'up' : value < base ? 'down' : 'same' };
      }
    }
    return {
      uid: card.uid, id: card.id, name: card.name, type: card.type, rarity: card.rarity,
      companion: card.companion, target: card.target, text: card.text, flavor: card.flavor,
      art: card.art, keywords: card.keywords.slice(),
      cost, baseCost: card.baseCost, costModified: cost !== Math.max(0, card.baseCost) && card.baseCost >= 0,
      upgraded: card.upgraded, nums: { ...card.nums }, display,
      exhaust: card.exhaust, ethereal: card.ethereal, innate: card.innate,
      retain: card.retain || card.retainThisTurn, unplayable: card.unplayable,
      pile: card.pile, meta: JSON.parse(JSON.stringify(card.meta || {})),
      playable: (card.pile === Pile.HAND || card.pile === Pile.STASH)
        ? this.canPlay(card.uid, targetId).ok : false,
    };
  }

  // ── lookups ───────────────────────────────────────────────────────────────

  actor(id) {
    if (!id) return null;
    for (const pl of this.players) if (pl.id === id) return pl;
    return this.enemies.find(e => e.id === id) || this.allies.find(a => a.id === id) || null;
  }
  /**
   * A card by uid, from ANY seat. Card uids are unique across the whole fight,
   * so a lookup that stopped at seat 0 would simply fail to find a teammate's
   * card rather than return the wrong one — but "not found" is how a thrown
   * Snack or a Clone would silently do nothing, so it searches the party.
   */
  card(uid) {
    for (const pl of this.players) {
      const c = pl.piles.find(uid);
      if (c) return c;
    }
    return null;
  }
  statusDef(id) { return getStatus(id); }
  livingEnemies() { return this.enemies.filter(e => e.alive); }
  firstLivingEnemy() { return this.enemies.find(e => e.alive) || null; }
  randomEnemy() {
    const alive = this.livingEnemies();
    return alive.length ? alive[this.rng.int(alive.length)] : null;
  }
  handCap(who = null) {
    const pl = (who && this._resolveSeat(who)) || this.current;
    return this.hooks.reduce('modifyHandCap', pl.handCap, {}, this.hooks.actorHooks(pl, 'modifyHandCap'));
  }

  /** Cards in a zone, by the zone name or the content agents' aliases. */
  cardsIn(pile) {
    const map = {
      draw: 'draw', drawPile: 'draw', hand: 'hand', discard: 'discard',
      discardPile: 'discard', exhaust: 'exhaust', exhaustPile: 'exhaust',
      vanished: 'exhaust', limbo: 'limbo', stash: 'stash',
    };
    return this.current.piles[map[pile] || pile] || [];
  }

  /**
   * StatusDef.untargetableBy: ['attack'] — Hidden blocks Attack Tricks only.
   *
   * `EnemyDef.isTargetable(c)` is the other half, and it was DEAD alongside
   * `damageTakenMul`: the Wardrobe declares "the body is untargetable until at
   * least one Door is broken" and nothing consulted it, so its Doors were
   * decoration and the body could be hit from turn one. It is checked BEFORE
   * the `!card` shortcut because it is a property of the enemy, not of what is
   * being aimed at it.
   */
  isTargetable(actor, card) {
    if (!actor || !actor.alive) return false;
    if (actor.def && typeof actor.def.isTargetable === 'function') {
      let ok = true;
      try { ok = actor.def.isTargetable(this.enemyCtx(actor, null)); } catch { ok = true; }
      if (ok === false) return false;
    }
    if (!card) return true;
    for (const [id] of actor.statuses) {
      const list = getStatus(id).untargetableBy;
      if (Array.isArray(list) && list.includes(card.type)) return false;
    }
    return true;
  }
  targetableEnemies(card) { return this.enemies.filter(e => this.isTargetable(e, card)); }

  // ── content registries (enemy moves refer to content by id) ───────────────
  /** Teach the engine card definitions so `addCard('clutter')` works. */
  registerCards(defs) {
    const list = Array.isArray(defs) ? defs : Object.values(defs || {});
    for (const d of list) if (d && d.id) this.cardDefs.set(d.id, d);
    return this.cardDefs.size;
  }
  /** Teach the engine enemy definitions so `summon('dust-bunny')` works. */
  registerEnemies(defs) {
    const list = Array.isArray(defs) ? defs : Object.values(defs || {});
    for (const d of list) if (d && d.id) this.enemyDefs.set(d.id, d);
    return this.enemyDefs.size;
  }
  /** Teach the engine House Rule names so an intent can name one before it lands. */
  registerRules(defs) {
    const list = Array.isArray(defs) ? defs : Object.values(defs || {});
    for (const d of list) if (d && d.id) this.ruleDefs.set(d.id, { id: d.id, name: d.name || d.id, text: d.text || '' });
    return this.ruleDefs.size;
  }
  /** Resolve a rule id to something displayable. Never returns null for an id. */
  resolveRule(idOrObj) {
    if (!idOrObj) return null;
    if (typeof idOrObj === 'object') {
      const r = { id: idOrObj.id, name: idOrObj.name || humanise(idOrObj.id), text: idOrObj.text || '' };
      if (r.id) this.ruleDefs.set(r.id, r);
      return r;
    }
    const known = this.ruleDefs.get(idOrObj);
    if (known) return { ...known };
    const live = this.rules.find(r => r.id === idOrObj);
    if (live) return { id: live.id, name: live.name || humanise(live.id), text: live.text || '' };
    return { id: idOrObj, name: humanise(idOrObj), text: '' };
  }
  resolveCardDef(idOrDef) {
    if (!idOrDef) return null;
    if (typeof idOrDef === 'object') return idOrDef;
    return this.cardDefs.get(idOrDef)
      || [...this.cardDefs.values()].find(d => d.id.split('/').pop() === idOrDef)
      || null;
  }
  resolveEnemyDef(idOrDef) {
    if (!idOrDef) return null;
    if (typeof idOrDef === 'object') return idOrDef;
    return this.enemyDefs.get(idOrDef)
      || [...this.enemyDefs.values()].find(d => d.id.split('/').pop() === idOrDef)
      || null;
  }

  // ── intent queue (Wink + the enemies agent both read this) ────────────────
  /** The revealed slice of an enemy's plan. Position 0 is what resolves next. */
  intentQueue(enemy) { return enemy ? queueSnapshot(this, enemy) : []; }
  /** Capitalised Intent Family of plan position `pos` ('Attack'|'Defense'|'Scheme'|'Special'). */
  intentFamilyOf(enemy, pos = 0) {
    const m = moveAt(enemy, pos);
    if (!m) return null;
    const type = (typeof m.intentFn === 'function')
      ? (() => { try { return m.intentFn(this.enemyCtx(enemy, m, { planPosition: pos, forecast: pos > 0 })); } catch { return m.intent; } })()
      : m.intent;
    return FAMILY_LABEL[intentFamily(type)];
  }
  previewIntent(enemy, n = 1) { return previewIntent(this, enemy, n); }
  previewDepth(enemy) { return previewDepthOf(enemy); }
  previewedFamilies(enemy) { return previewedFamilies(this, enemy); }
  isAnchored(enemy, pos = 0) { return isAnchored(enemy, pos); }
  swapIntents(enemy, a, b) { return swapIntents(this, enemy, a, b); }
  postponeIntent(enemy) { return postponeIntent(this, enemy); }
  deleteIntent(enemy) { return deleteIntent(this, enemy); }
  /** Cancel the current action outright. Alias of deleteIntent, named for cards. */
  cancelIntent(enemy) { return deleteIntent(this, enemy); }
  /**
   * Boggle: swap this enemy's current action for a supplied one (Search).
   * The original action is spent, not postponed. `move` is a whole move object.
   */
  overrideIntent(enemy, move) { return overrideIntent(this, enemy, move); }
  /** Drop a pending override without resolving it. */
  clearIntentOverride(enemy) { return clearIntentOverride(this, enemy); }
  /** Wink: the player picks which of the two Previewed futures comes next. */
  forkFuture(enemy) { return forkFuture(this, enemy); }
  /** Wink: reveal and lock an enemy's whole plan — no more re-derivation. */
  controlEnemyChoice(enemy, on = true) { return setIntentControl(this, enemy, on); }

  // ── player choice ─────────────────────────────────────────────────────────
  /** The renderer registers `fn(req) -> Promise<number[]>` (indices into req.pool). */
  setChoiceResolver(fn) { this.choices.setResolver(fn); return this; }
  /** Replay a recorded `engine.choiceLog`. Seed + choice log reproduces a fight exactly. */
  setChoiceScript(log) { this.choices.setScript(log); return this; }
  get choiceLog() { return this.choices.log; }
  get awaitingChoice() { return this.choices.pending > 0; }

  // ── House Rules (Door Greeter → The Butler) ───────────────────────────────
  /**
   * Stand up a House Rule.
   *
   * REPLACE-BY-SOURCE is the default and it is deliberate: one actor announcing a
   * new rule almost always means "instead of", not "as well as". The Butler
   * announcing his fourth rule should be enforcing his fourth rule, not all four
   * at once. Pass `rule.stack = true` to keep a source's earlier rules alongside
   * the new one — a boss that genuinely escalates opts in explicitly.
   *
   * Rules from OTHER sources are never touched, and every rule a source owns is
   * cleared automatically when that source dies.
   */
  announceRule(rule, sourceId = null) {
    if (!rule || !rule.id) return null;
    this.clearRule(rule.id);
    if (!rule.stack && sourceId != null) {
      for (const other of [...this.rules]) {
        if (other.sourceId === sourceId) this.clearRule(other.id);
      }
    }
    const r = { ...rule, sourceId };
    this.ruleDefs.set(r.id, { id: r.id, name: r.name || humanise(r.id), text: r.text || '' });
    this.rules.push(r);
    this.field.activeRule = r.id;
    this._emit(EV.RULE, { rule: { id: r.id, name: r.name, text: r.text, when: r.when, once: !!r.once }, sourceId, action: 'announce' });
    return r;
  }
  clearRule(id) {
    const i = this.rules.findIndex(r => r.id === id);
    if (i >= 0) { const r = this.rules.splice(i, 1)[0]; this._emit(EV.RULE, { rule: { id: r.id, name: r.name }, sourceId: r.sourceId || null, action: 'clear' }); return true; }
    return false;
  }
  clearRules(sourceId = null) {
    for (const r of [...this.rules]) if (sourceId == null || r.sourceId === sourceId) this.clearRule(r.id);
  }
  /**
   * A House Rule never forbids an action — it attaches a consequence.
   *
   * Rules are judged SEAT BY SEAT, and a Reprimand lands on the Kid who earned
   * it. "House Rules apply to each player individually. Player A can play six
   * Tricks and receive their Reprimand. Player B can still play three Tricks
   * without consequence… One player's actions do not punish another player.
   * This prevents multiplayer resentment." (docs/design/regions/01-foyer.md
   * §26 Door Greeter and §28 The Butler.)
   *
   * Before this, every field a rule reads was the TABLE's: two Kids playing two
   * Tricks each tripped GUESTS DO NOT RUSH ("a fourth Trick"), which neither of
   * them broke, and the damage went to whoever the Butler was aiming at. The
   * `once` guard is per seat for the same reason — one Kid breaking a rule must
   * not buy the other one immunity for the rest of the turn.
   *
   * `extra.seat` narrows to one seat: a card play only ever exposes the seat
   * that played it. `turnEnd` sweeps every living seat, in seat order, so the
   * order of Reprimands is reproducible on a replay.
   */
  _checkRules(when, extra = {}) {
    const only = extra.seat ? this._resolveSeat(extra.seat) : null;
    const seats = only ? [only] : this.livingPlayers();
    if (!seats.length) return;
    for (const r of [...this.rules]) {
      if (r.when !== when) continue;
      for (const pl of seats) {
        if (r.once) {
          if (!r._firedTurn || typeof r._firedTurn !== 'object') r._firedTurn = {};
          if (r._firedTurn[pl.seat] === this.turn) continue;
        }
        const played = pl.playedThisTurn;
        const rc = {
          cardsPlayedThisTurn: played.map(x => ({ ...x })),
          card: extra.card || null,
          prevCard: played.length > 1 ? played[played.length - 2] : null,
          playerBlock: pl.block,
          damageDealtThisTurn: pl.stats.damageDealtThisTurn,
          turn: this.turn, e: this,
          // The seat being judged. Content that wants the table asks `e.stats`.
          seat: pl.seat, player: pl,
        };
        let broken = false;
        try { broken = !!r.broken?.(rc); } catch (err) { console.error(`[combat] rule ${r.id}.broken threw`, err); }
        if (!broken) continue;
        if (r.once) r._firedTurn[pl.seat] = this.turn;
        const src = this.actor(r.sourceId);
        this._emit(EV.RULE_BROKEN, {
          ruleId: r.id, name: r.name, sourceId: r.sourceId || null,
          cardUid: extra.card?.uid || null, actorId: pl.id, seat: pl.seat,
        });
        // Inside the breaker's seat AND aimed at them: `c.addCard('clutter')`
        // has to reach their discard pile and `hitPlayer` has to hit them.
        this._asSeat(pl, () => {
          try { r.onBreak?.(src ? this.enemyCtx(src, null, { rule: r, aimAt: pl }) : this.ctxFor(null, null)); }
          catch (err) { console.error(`[combat] rule ${r.id}.onBreak threw`, err); }
          if (src?.def?.onRuleBroken) {
            try { src.def.onRuleBroken(this.enemyCtx(src, null, { rule: r, aimAt: pl })); }
            catch (err) { console.error(err); }
          }
        });
      }
    }
  }

  /**
   * Broadcast a board event to every `EnemyDef.onBoardEvent`.
   *
   * This had NO CALLERS until 2026-08-29, and it took the event as two
   * arguments while every def is written `onBoardEvent(c, ev)` — so even a
   * caller would have handed them `ev === undefined` and every one of them
   * would have returned on its first line. Trap 5b twice over: the Porcelain
   * Twins' entire Joined mechanic and the Rocking Horse's Excitement from ally
   * support were finished-looking defs that nothing in the engine ever reached.
   *
   * The shape is what those two defs already read:
   *
   *     { type: 'block',  actor, source, amount, noJoin }
   *     { type: 'heal',   actor, source, amount }
   *     { type: 'status', actor, source, id, kind, amount, noJoin }
   *
   * `actor` is who it happened TO; `source` is who caused it, as an ACTOR — the
   * Horse's rule is "an ally gaining Guard FROM ANOTHER ENEMY" and it filters on
   * `ev.source === c.self`, which an id could never satisfy.
   *
   * `_boardDepth` is a backstop, not a mechanism. A handler that reacts to a
   * board event by causing one is legitimate — that is exactly what Joined is —
   * but a def that forgets to mark its own reaction would otherwise hang the
   * game rather than fail a test. Four is far above anything the content does.
   */
  boardEvent(ev) {
    if (!ev || !ev.type) return;
    if ((this._boardDepth | 0) >= 4) return;
    this._boardDepth = (this._boardDepth | 0) + 1;
    try {
      for (const en of [...this.enemies, ...this.allies]) {
        if (!en.alive || !en.def?.onBoardEvent) continue;
        try { en.def.onBoardEvent(this.enemyCtx(en, null, { boardEvent: ev }), ev); }
        catch (err) { console.error(err); }
      }
    } finally {
      this._boardDepth -= 1;
    }
  }

  /**
   * Fire one EnemyDef lifecycle hook across the board, in slot order.
   * The documented hooks are: onCombatStart, onSpawn, onPlayerTurnStart,
   * onPlayerReady, onTurnStart, onTurnEnd, onPlayerTurnEnd, onDamaged,
   * onDealtDamage, onAllyDeath, onDeath — plus onPlayerCard / onCardPlayed /
   * onBoardEvent / onEnemyPhaseEnd / onRuleBroken.
   *
   * onPlayerTurnStart fires BEFORE the hand is dealt; onPlayerReady fires
   * AFTER it and before intents are drawn. An enemy that reads the player's
   * hand wants the second one — see the Namekeeper.
   */
  _enemyLifecycle(name, extra = {}, list = null) {
    for (const en of (list || [...this.enemies, ...this.allies])) {
      if (!en.alive || !en.def?.[name]) continue;
      try { en.def[name](this.enemyCtx(en, null, extra)); }
      catch (err) { console.error(`[combat] ${en.defId}.${name} threw`, err); }
    }
  }

  /**
   * Who an enemy is aiming at.
   *
   * Order, highest priority first:
   *   1. an ally summon pulling aggro (`flags.taunt`) — unchanged from solo,
   *   2. a seat with Racket on it (the co-op taunt),
   *   3. the seat this enemy already marked, if it can still act,
   *   4. a seeded random living seat, which then becomes its mark.
   *
   * Step 3 matters more than it looks: without a held mark an enemy would
   * re-roll its target every time intents refreshed, so the arrow the player
   * read during planning would not be the one that resolved. "Who Did That?"
   * (Marmalade, multiplayer-only) reads this target directly, so it has to be
   * stable between preview and resolution.
   */
  intentTargetFor(enemy) {
    const ally = this.allies.find(a => a.alive && a.flags.taunt);
    if (ally) return ally;

    const living = this.livingPlayers();
    if (living.length === 0) return this.players[0];
    if (living.length === 1) return living[0];

    const loud = living.filter(pl => pl.hasStatus('racket'));
    if (loud.length) return loud.length === 1 ? loud[0] : loud[enemy.slot % loud.length];

    // The move's own preference, authored in the region chapter. This is the
    // half of co-op scaling that is NOT Courage: "Damage values normally remain
    // unchanged. Enemy effects gain multiplayer targeting logic instead."
    // (docs/design/regions/01-foyer.md §26.)
    /**
     * A `partyPick` is RE-DERIVED whenever intents refresh, and that is a real
     * tension with the rule above it — worth writing down rather than "fixing"
     * again.
     *
     * `pickSeat` reads live board state, so the arrow moves when a Kid reacts
     * to it: Walking Stick prefers `lowestGuard`, the Kid it points at raises
     * Guard, stops being lowest, and the swing transfers to their friend. That
     * reads like a straight violation of "the target is shown before the
     * players act".
     *
     * Holding the pick was TRIED (2026-08-28) and reverted, for two reasons the
     * next person should not have to rediscover:
     *   1. Player Guard is WIPED at the start of the player turn, after
     *      `chooseMove` has run. So a pick held from the moment the turn opens
     *      sees every seat on 0 Guard, ties, and resolves to seat 0 forever —
     *      `lowestGuard` stops meaning anything at all.
     *   2. It measured WORSE. Four Kids at 0.6x went 33% -> 17%, because the
     *      seats that were not marked correctly stopped blocking and the marked
     *      one could not absorb it alone.
     * Six assertions in `tests/coop/suite.js` also encode the re-derived
     * behaviour deliberately.
     *
     * The honest position: a preference computed from state the player controls
     * cannot both track that state and stay still. Which half to keep is a
     * design decision, and the one it wants is probably a preference the player
     * cannot game inside the turn (`lowestCourage`, `fewestDraw`) for anything
     * telegraphed a turn ahead.
     */
    const pick = enemy.pendingMove && enemy.pendingMove.partyPick;
    if (pick) {
      const chosen = this.pickSeat(pick, living);
      if (chosen) return chosen;
    }

    const held = enemy.targetSeatId && living.find(pl => pl.id === enemy.targetSeatId);
    if (held) return held;

    const rolled = living[this.rng.int(living.length)];
    enemy.targetSeatId = rolled.id;
    return rolled;
  }

  /**
   * Choose a seat by a named preference.
   *
   * Every tie breaks on seat index, never on the RNG: the player is SHOWN this
   * target before they act ("The target is shown clearly before players act" —
   * Nursery §29), so it has to be reproducible between the intent and the
   * resolution, and identical on two clients replaying the same seed.
   *
   * @param {'lowestGuard'|'lowestCourage'|'highestCourage'|'fewestDraw'|'mostDraw'} how
   */
  pickSeat(how, pool = null) {
    const living = pool || this.livingPlayers();
    if (!living.length) return null;
    if (living.length === 1) return living[0];
    const by = (f) => [...living].sort((a, b) => (f(a) - f(b)) || (a.seat - b.seat))[0];
    switch (how) {
      case 'lowestGuard':    return by(p => p.block);
      case 'lowestCourage':  return by(p => p.hpFrac);
      case 'highestCourage': return by(p => -p.hpFrac);
      case 'fewestDraw':     return by(p => p.piles.draw.length);
      case 'mostDraw':       return by(p => -p.piles.draw.length);
      default:               return null;
    }
  }

  /**
   * Every seat an enemy move lands on.
   *
   * `partyTarget: 'all'` is the AoE shape the region chapters give to specific
   * moves — Red Carpet Runner's Run the Hall, House Bell's Midnight Toll,
   * Rocking Horse's Gallop at 2+ Excitement. Slay the Spire 2's own co-op guides
   * name AoE as "the primary danger in co-op", and it is the only thing that
   * makes a bigger party genuinely more dangerous to be in, since damage per hit
   * deliberately does not scale.
   *
   * `partyTarget: 'two'` is Porcelain Doll's Shattered Sharp Little Hands: two
   * DIFFERENT seats, or the same one twice if only one is left.
   */
  partyTargets(enemy, move) {
    const m = move || enemy.pendingMove;
    // A function, because several are conditional: Rocking Horse's Gallop only
    // hits the whole party at 2+ Excitement, Porcelain Doll's Sharp Little Hands
    // only splits once Shattered. Handed the enemy and the engine rather than a
    // ctx, so it can be called from intent building without constructing one.
    let mode = m && m.partyTarget;
    if (typeof mode === 'function') {
      try { mode = mode(enemy, this); } catch (err) { mode = null; }
    }
    const living = this.livingPlayers();
    if (!mode || !this.isParty || !living.length) return [this.intentTargetFor(enemy)];
    if (mode === 'all') return living;
    if (mode === 'two') {
      const first = this.intentTargetFor(enemy);
      const second = living.find(p => p !== first);
      /**
       * NEVER the same seat twice.
       *
       * This used to fall back to `|| first`, and the damage loop in the enemy
       * ctx runs the move's full `hits` count once PER ENTRY — so a party
       * reduced to one Kid handed that Kid the whole move twice. A last Kid
       * standing took DOUBLE what they would have taken with a friend beside
       * them, which is backwards in the one moment the fight is already lost.
       *
       * `previewIncoming` could not see it either: it asks `aimed.includes(me)`,
       * a boolean, and then counts `damage x hits` ONCE. So the incoming rail
       * read exactly half of what was about to land, and its `lethal` flag was
       * computed from the half — trap 46's shape on the widget whose entire job
       * is to be believed, and fatal here rather than merely wrong.
       *
       * The chapter agrees: "If only one player remains available, both hits
       * target that player" (nursery §33) — both hits, which is one move, not
       * two. Returning one seat is what makes that sentence true.
       */
      return second ? [first, second] : [first];
    }
    return [this.intentTargetFor(enemy)];
  }

  /** A per-player threshold: "18 damage times number of players" (Foyer §27). */
  perPlayer(n) { return (n | 0) * this.players.length; }

  // ── cost ──────────────────────────────────────────────────────────────────

  /** Effective cost after dynamicCost and modifyCardCost hooks. -1 = X, -2 = unplayable. */
  /**
   * Effective cost. -1 = X, -2 = unplayable.
   *
   * ── COMPOSITION ORDER (content authors: this is the one that bites) ───────
   *   1. `CardDef.dynamicCost(ctx)`  computes the card's PRINTED cost right now.
   *      It replaces `baseCost`; it is NOT the final answer. A card whose cost
   *      depends on board state ("costs 2, or 0 after three Tricks") belongs here.
   *   2. a hard override (`setCost(card, n, 'turn'|'combat')`) outranks both the
   *      printed and the dynamic cost — "this costs 0 this turn" means 0.
   *   3. `+ costCombatDelta + costTurnDelta`  (`modifyCost`), clamped at 0.
   *   4. `modifyCardCost` hooks — the discount STATUSES live here
   *      (`next-trick-discount`, `next-attack-discount`, the "costs less"
   *      family). Clamped at 0 again.
   *
   * Step 1 used to RETURN, which meant no discount could ever reach a
   * dynamic-cost card. Discounts now compose on top, which is what both a
   * player and a designer expect.
   */
  costOf(card) {
    if (card.unplayable) return -2;
    // Re-entrancy guard: dynamicCost may read state, which snapshots cards, which
    // asks for their cost. One level deep only, then fall through to the printed cost.
    let printed = null;
    if (typeof card.def.dynamicCost === 'function' && !card._costing) {
      card._costing = true;
      try {
        const c = card.def.dynamicCost(this.ctxFor(card, null));
        if (typeof c === 'number') printed = c;
      } catch (err) { console.error(`[combat] ${card.id}.dynamicCost threw`, err); }
      finally { card._costing = false; }
    }
    const raw = card.rawCost(printed);
    if (raw < 0) return raw;
    return Math.max(0, this.hooks.reduce('modifyCardCost', raw, { card }, this.hooks.actorHooks(this.seatOfCard(card) || this.current, 'modifyCardCost')));
  }

  /**
   * @param {'turn'|'combat'|'permanent'} scope
   * `turn` overrides clear at the start of your next turn; `combat` lasts the fight.
   */
  setCardCost(card, value, scope = 'turn', reason = 'effect') {
    const before = this.costOf(card);
    if (scope === 'turn') card.costOverrideTurn = value;
    else { card.costOverrideCombat = value; card.costOverrideTurn = null; }
    const after = this.costOf(card);
    if (after !== before) this._emit(EV.CARD_COST, { cardUid: card.uid, before, after, scope, reason });
    return after;
  }

  modifyCardCost(card, delta, scope = 'turn', reason = 'effect') {
    const before = this.costOf(card);
    if (scope === 'turn') card.costTurnDelta += delta;
    else card.costCombatDelta += delta;
    const after = this.costOf(card);
    if (after !== before) this._emit(EV.CARD_COST, { cardUid: card.uid, before, after, scope, reason });
    return after;
  }

  /** Per-card metadata that survives shuffles (Stretch, Enchantments, Slobbered). */
  setCardMeta(card, key, value) {
    const before = card.meta[key];
    card.meta[key] = value;
    this._invalidate();
    this._emit(EV.CARD_META, { cardUid: card.uid, key, before: before ?? null, after: value });
    return value;
  }

  // ── resources: Courage, Guard, Nerve ──────────────────────────────────────

  /** Post-Dexterity, post-Frail Guard value. Pure; used by previews and intents. */
  previewBlockValue(actor, amount, opts = {}) {
    if (amount <= 0) return 0;
    let v = amount;
    // block.step1 — Dexterity, additive
    if (opts.fromCard !== false) v += actor.status('dexterity') || 0;
    // block.step2 — Frail, ×0.75 floored
    if (opts.fromCard !== false && actor.status('frail') > 0) v = Math.floor(v * FRAIL_MULT);
    // step3 — everything else
    v = this.hooks.reduce('modifyBlockGain', v, { actor, source: opts.source || null, fromCard: opts.fromCard !== false },
      this.hooks.actorHooks(actor, 'modifyBlockGain'));
    return Math.max(0, Math.floor(v));
  }

  gainBlock(actor, amount, opts = {}) {
    if (!actor || !actor.alive) return 0;
    const gain = this.previewBlockValue(actor, amount, opts);
    if (gain <= 0 && amount > 0) {
      this._emit(EV.BLOCK, { actorId: actor.id, amount: 0, before: actor.block, after: actor.block, reason: opts.reason || 'card', noJoin: !!opts.noJoin });
      return 0;
    }
    const before = actor.block;
    actor.block += gain;
    this._emit(EV.BLOCK, { actorId: actor.id, amount: gain, before, after: actor.block, reason: opts.reason || 'card', noJoin: !!opts.noJoin });
    this.hooks.dispatch('onBlockGained', { actor, amount: gain }, this.hooks.actorHooks(actor, 'onBlockGained'));
    // Guard is the Rocking Horse's "an ally gaining Guard from another enemy"
    // and the half the Porcelain Twins' Joined flows across.
    this.boardEvent({ type: 'block', actor, source: opts.source || null, amount: gain, noJoin: !!opts.noJoin });
    return gain;
  }

  loseBlock(actor, amount, reason = 'effect') {
    const before = actor.block;
    actor.block = Math.max(0, actor.block - amount);
    if (actor.block !== before) this._emit(EV.BLOCK_LOSE, { actorId: actor.id, before, after: actor.block, reason });
    return before - actor.block;
  }

  /** The one entry point for damage. See damage.js for the ordered pipeline. */
  dealDamage(o) { return applyDamage(this, o); }

  /** Direct Courage loss — ignores Guard and every attack modifier. */
  loseHp(actor, amount, reason = 'effect') {
    if (!actor || !actor.alive || amount <= 0) return 0;
    return applyDamage(this, {
      attacker: null, defender: actor, amount, kind: 'loss',
      ignoreBlock: true, skipModifiers: true, cause: reason,
    })?.hpLoss ?? 0;
  }

  heal(actor, amount, reason = 'effect') {
    if (!actor || !actor.alive || amount <= 0) return 0;
    const before = actor.hp;
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(amount));
    const healed = actor.hp - before;
    if (healed > 0) {
      this._emit(EV.HEAL, { actorId: actor.id, amount: healed, before, after: actor.hp, reason });
      this.hooks.dispatch('onHeal', { actor, amount: healed }, this.hooks.actorHooks(actor, 'onHeal'));
      // "an ally recovering Courage" (nursery §31).
      this.boardEvent({ type: 'heal', actor, source: null, amount: healed });
    }
    return healed;
  }

  addMaxHp(actor, delta) {
    const before = actor.maxHp;
    actor.maxHp = Math.max(1, actor.maxHp + delta);
    if (delta > 0) actor.hp += delta;
    actor.hp = Math.min(actor.hp, actor.maxHp);
    this._emit(EV.HP_MAX, { actorId: actor.id, before, after: actor.maxHp, delta });
  }

  /**
   * @param {Player} [who] the seat whose Nerve moves. Defaults to the acting
   *   seat, which is right for a card being played and wrong for anything that
   *   reaches a seat which is not currently acting — a Status card drawn into a
   *   Kid's hand during someone else's go, for one. Callers that pass nothing
   *   get exactly the old behaviour.
   */
  gainEnergy(n, reason = 'effect', who = null) {
    if (n === 0) return 0;
    const me = who || this.current;
    const add = n > 0
      ? this.hooks.reduce('modifyEnergyGain', n, { reason }, this.hooks.actorHooks(me, 'modifyEnergyGain'))
      : n;
    const before = me.energy;
    me.energy = Math.max(0, me.energy + add);
    this._emit(EV.ENERGY, {
      actorId: me.id, seat: me.seat,
      before, after: me.energy, delta: me.energy - before, max: me.energyMax, reason,
    });
    return me.energy - before;
  }
  loseEnergy(n, reason = 'effect', who = null) { return this.gainEnergy(-Math.abs(n), reason, who); }

  setEnergy(v, reason = 'refill') {
    const me = this.current;
    const before = me.energy;
    me.energy = Math.max(0, v | 0);
    this._emit(EV.ENERGY, { actorId: me.id, seat: me.seat, before, after: me.energy, delta: me.energy - before, max: me.energyMax, reason });
  }

  // ── statuses ──────────────────────────────────────────────────────────────

  /**
   * Apply (delta>0) or strip (delta<0) stacks.
   * Charm eats one incoming debuff application per stack — that check lives here
   * rather than in a hook because a hook cannot cleanly veto.
   */
  applyStatus(actor, id, delta = 1, opts = {}) {
    if (!actor || delta === 0) return 0;
    if (!actor.alive && delta > 0) return 0;
    const def = getStatus(id);

    if (delta > 0 && def.kind === 'debuff' && !opts.ignoreCharm) {
      // onDebuffIncoming — a vetoable view of the debuff before it lands (Nope.).
      const dbox = { prevented: false, stacks: delta };
      const inc = { actor, target: actor, id, stacks: delta, def, sourceId: opts.sourceId || null,
                    prevent: () => { dbox.prevented = true; },
                    setStacks: (n) => { dbox.stacks = Math.max(0, n | 0); } };
      this.hooks.dispatch('onDebuffIncoming', inc, this.hooks.actorHooks(actor, 'onDebuffIncoming'));
      if (dbox.prevented) { this._statusTrigger(actor, id, 0, 'refused'); return 0; }
      if (dbox.stacks !== delta) delta = dbox.stacks;
      if (delta === 0) return 0;
      // Charm eats one debuff application per stack.
      if (actor.status('charm') > 0) {
        this.applyStatus(actor, 'charm', -1, { reason: 'consumed', ignoreCharm: true });
        this._statusTrigger(actor, 'charm', actor.status('charm'), 'blocked');
        return 0;
      }
    }

    const before = actor.status(id);
    let after = before + delta;
    if (def.max != null) after = Math.min(after, def.max);
    if (def.stacks === false && after > 1) after = 1;
    after = Math.max(0, after);
    if (after === before) return 0;

    actor._setStatus(id, after);
    // `fresh`: applied during this actor's own end-of-turn step, so the decay
    // that runs moments later must not spend the turn it has not had. See
    // `_decayBucket`. Slay the Spire calls this `justApplied` and needs it for
    // exactly the same reason: Doubt hands you 1 Weak at end of turn, and Weak
    // also expires at end of turn.
    if (opts.fresh && after > before) actor.freshStatuses.add(id);
    // Anything else on `opts` is content data (Cover's { by, amount }, a source
    // card, a tag). It rides along on the event as `meta` and reaches onApply as
    // `h.opts`, so a status can be parameterised at the moment it is applied.
    const meta = statusMeta(opts);
    if (meta) actor.statusMeta[id] = { ...(actor.statusMeta[id] || {}), ...meta };
    this._emit(EV.STATUS, {
      actorId: actor.id, id, name: def.name, kind: def.kind, icon: def.icon || id,
      before, after, delta: after - before,
      sourceId: opts.sourceId || null, reason: opts.reason || 'effect',
      meta: meta || null,
      desc: String(def.desc || '').replace(/\{n\}/g, String(after)),
    });

    const payload = { actor, id, delta: after - before, stacks: after, def, opts, meta: meta || null };
    if (after > before) {
      def.hooks?.onApply?.({ ...payload, e: this, engine: this, owner: actor });
      this.hooks.dispatch('onStatusApplied', payload);
      // "an ally receiving a Button, an ally becoming Covered" (nursery §31),
      // and the debuffs the Twins copy across. `source` is resolved to an ACTOR
      // because both consumers compare it against `c.self`.
      this.boardEvent({
        type: 'status', actor, id, kind: def.kind, amount: after - before,
        source: opts.source || (opts.sourceId ? this.actor(opts.sourceId) : null),
        noJoin: !!opts.noJoin,
      });
    } else if (after === 0) {
      def.hooks?.onRemove?.({ ...payload, e: this, engine: this, owner: actor });
    }

    this.refreshIntents('status');
    return after - before;
  }

  removeStatus(actor, id, reason = 'effect') {
    const cur = actor.status(id);
    if (cur) this.applyStatus(actor, id, -cur, { reason });
    delete actor.statusMeta[id];
  }

  /** The options a status was applied with (Cover's `{ by, amount }`). */
  statusMeta(actor, id) { return (actor && actor.statusMeta[id]) || null; }

  /** Remove every debuff (Midnight Grooming, boss phase transitions). */
  cleanse(actor, reason = 'cleanse') {
    for (const id of [...actor.statuses.keys()]) {
      if (getStatus(id).kind === 'debuff') this.removeStatus(actor, id, reason);
    }
  }

  _statusTrigger(actor, id, stacks, effect, amount = 0) {
    this._emit(EV.STATUS_TRIGGER, { actorId: actor.id, id, name: getStatus(id).name, stacks, effect, amount });
  }

  addPower(actor, power) {
    const existing = actor.powers.get(power.id);
    if (existing) { existing.stacks = (existing.stacks || 1) + (power.stacks || 1); }
    else actor.powers.set(power.id, { stacks: 1, ...power });
    this._emit(EV.STATUS, {
      actorId: actor.id, id: power.id, name: power.name || power.id, kind: 'buff',
      icon: power.icon || power.id, before: existing ? existing.stacks - (power.stacks || 1) : 0,
      after: actor.powers.get(power.id).stacks, delta: power.stacks || 1,
      reason: 'power', desc: power.desc || '', power: true,
    });
    this.refreshIntents('power');
    return actor.powers.get(power.id);
  }

  // ── counters (companion resource tracks) ──────────────────────────────────

  /**
   * Declare a per-combat resource track. Nine Lives, Glow, Height, Loose Bones,
   * Globs, Loyalty, Compost, Web, Open Eyes, Plump… all use this.
   * `focusable:true` makes Focus boost gains to it.
   */
  /**
   * The key a counter is stored under.
   *
   * Companion counters are named for the mechanic, not the Kid — Marmalade's
   * track is `lives` — so a party with two Marmalades would collide on one
   * shared track and spend each other's Lives. In a party the key is scoped by
   * seat; in solo it is the bare id, so nothing about a single-player save or
   * any existing content changes. `c.id` stays the display id either way.
   */
  _ckey(id, ownerId) {
    if (this._sharedCounters.has(id)) return id;
    return this.isParty ? `${ownerId || this.current.id}/${id}` : id;
  }

  /** Is this counter defined for the seat that would be asked? */
  hasCounter(id, ownerId = null) { return this.counters.has(this._ckey(id, ownerId)); }

  defineCounter(o) {
    // Registered before `_ckey` runs below, or the first definition would
    // still land under a seat-prefixed key and every later read would miss it.
    if (o.shared) this._sharedCounters.add(o.id);
    const c = {
      id: o.id, name: o.name || o.id, icon: o.icon || o.id, desc: o.desc || '',
      min: o.min ?? 0, max: o.max ?? 99, value: o.start ?? 0,
      ownerId: o.ownerId || this.current.id, focusable: !!o.focusable,
      onChange: o.onChange || null, resetEachTurn: !!o.resetEachTurn,
      /**
       * Named bands on the track, so the renderer never parses `desc` to find
       * them. It was regexing "Whole at 0, Scattered at 4 or more" out of Loose
       * Bones, which breaks the first time anyone rewords a description.
       *   states: [{ at: 0, label: 'Whole' }, { from: 4, to: 6, label: 'Scattered' }]
       * `at` is an exact value; `from`/`to` are an inclusive range and either may
       * be omitted. The FIRST matching entry wins, so list exact values first.
       */
      states: normaliseStates(o.states),
      /** One value for the whole table — see `_sharedCounters`. */
      shared: !!o.shared,
    };
    c.value = Math.max(c.min, Math.min(c.max, c.value));
    c.key = this._ckey(c.id, c.ownerId);
    this.counters.set(c.key, c);
    this._dirty = true;
    return c;
  }

  counter(id, ownerId = null) { return this.counters.get(this._ckey(id, ownerId))?.value ?? 0; }
  /** The label of the band the counter is currently in, or null. */
  counterState(id, ownerId = null) {
    const c = this.counters.get(this._ckey(id, ownerId));
    return c ? stateFor(c, c.value) : null;
  }
  counterDef(id) { return this.counters.get(id) || null; }
  counterMax(id) { return this.counters.get(id)?.max ?? 0; }
  /** True if `n` can actually be spent — used by `canPlay` for Life costs. */
  canSpend(id, n, ownerId = null) { return this.counter(id, ownerId) >= n; }

  /** @returns {number} the actual delta applied (0 if capped/floored) */
  addCounter(id, delta, reason = 'effect', ownerId = null) {
    const c = this.counters.get(this._ckey(id, ownerId));
    if (!c || delta === 0) return 0;
    let d = delta;
    if (d > 0) {
      d = this.hooks.reduce('modifyCounterGain', d, { id, owner: c.ownerId, focusable: c.focusable },
        this.hooks.actorHooks(this.actor(c.ownerId) || this.current, 'modifyCounterGain'));
    }
    const before = c.value;
    c.value = Math.max(c.min, Math.min(c.max, c.value + d));
    const applied = c.value - before;
    if (applied === 0) { this._dirty = true; return 0; }
    this._emit(EV.COUNTER, {
      ownerId: c.ownerId, id, name: c.name, before, after: c.value,
      delta: applied, min: c.min, max: c.max, reason,
      state: stateFor(c, c.value), stateBefore: stateFor(c, before),
      states: c.states.map(x => ({ ...x })),
    });
    c.onChange?.({ e: this, engine: this, counter: c, delta: applied, before, after: c.value });
    this.hooks.dispatch('onCounterChanged', { id, delta: applied, value: c.value, counter: c });
    return applied;
  }

  setCounter(id, value, reason = 'effect', ownerId = null) {
    const c = this.counters.get(this._ckey(id, ownerId));
    if (!c) return 0;
    return this.addCounter(id, Math.max(c.min, Math.min(c.max, value)) - c.value, reason, ownerId);
  }

  /** Spend from a counter. Returns false and changes nothing if there isn't enough. */
  spendCounter(id, n, reason = 'spend', ownerId = null) {
    if (!this.canSpend(id, n, ownerId)) return false;
    this.addCounter(id, -n, reason, ownerId);
    return true;
  }

  // ── countdown triggers ────────────────────────────────────────────────────

  /**
   * Fire `run(ctx)` after `turns` of the given phase.
   * @param {Object} o { turns, run, label, ownerId, when:'playerTurnStart'|'playerTurnEnd'|'enemyTurnEnd', repeat }
   * Wisp's Linger, Wink's Set Tricks, "at the start of your 3rd turn" all use this.
   */
  schedule(o) {
    const t = {
      id: o.id || `t${++this._timerUid}`,
      label: o.label || o.id || 'countdown',
      turnsLeft: Math.max(0, o.turns ?? 1),
      when: o.when || 'playerTurnStart',
      ownerId: o.ownerId || this.current.id,
      run: o.run,
      repeat: o.repeat ?? 0,
      data: o.data || {},
      cardUid: o.cardUid || null,
    };
    this.timers.push(t);
    this._emit(EV.TIMER, { id: t.id, label: t.label, ownerId: t.ownerId, before: null, after: t.turnsLeft, reason: 'scheduled' });
    return t;
  }

  /** "At the start of your Nth turn" — absolute turn number. */
  at(turnNumber, run, label = 'scheduled') {
    return this.schedule({ turns: Math.max(1, turnNumber - this.turn), run, label, when: 'playerTurnStart' });
  }

  /** Change a timer's remaining count (Wisp's Hasten / Delay). */
  adjustTimer(id, delta, reason = 'hasten') {
    const t = this.timers.find(x => x.id === id);
    if (!t) return null;
    const before = t.turnsLeft;
    t.turnsLeft = Math.max(0, t.turnsLeft + delta);
    this._emit(EV.TIMER, { id, label: t.label, ownerId: t.ownerId, before, after: t.turnsLeft, reason });
    if (t.turnsLeft === 0) this._fireTimers([t], reason);
    return t;
  }

  cancelTimer(id) {
    const i = this.timers.findIndex(t => t.id === id);
    if (i >= 0) this.timers.splice(i, 1);
  }

  _tickTimers(when) {
    const due = [];
    for (const t of this.timers) {
      if (t.when !== when) continue;
      const before = t.turnsLeft;
      t.turnsLeft = Math.max(0, t.turnsLeft - 1);
      this._emit(EV.TIMER, { id: t.id, label: t.label, ownerId: t.ownerId, before, after: t.turnsLeft, reason: 'tick' });
      if (t.turnsLeft === 0) due.push(t);
    }
    // All timers that hit 0 on the same tick resolve as one batch — Wisp's
    // Convergence depends on that being true.
    if (due.length) this._fireTimers(due, 'tick');
  }

  _fireTimers(due, reason) {
    const batch = due.slice();
    for (const t of batch) {
      const i = this.timers.indexOf(t);
      if (i < 0) continue;
      if (t.repeat > 0) { t.turnsLeft = t.repeat; }
      else this.timers.splice(i, 1);
      this._emit(EV.TIMER_FIRE, { id: t.id, label: t.label, ownerId: t.ownerId, batchSize: batch.length, reason });
      try {
        /* `reason` distinguishes a countdown that ran out on its own ('tick')
           from one somebody forced to zero. The TIMER_FIRE event has always
           carried it and the handler never saw it, which made "resolved
           naturally" unaskable — and that is the whole of Mossbit's Patience:
           Advancing an Epitaph to 0 deliberately forfeits the Patience that
           letting it mature would have paid. */
        t.run?.({ e: this, engine: this, timer: t, batch, batchSize: batch.length, data: t.data, reason });
      } catch (err) { console.error(`[combat] timer ${t.id} threw`, err); }
    }
  }

  // ── board objects (Patch, Garden, Plots, Graves) ──────────────────────────

  addObject(o) {
    const obj = {
      id: o.id || `o${++this._objectUid}`,
      kind: o.kind, name: o.name || o.kind, slot: o.slot ?? this.objects.length,
      data: o.data || {}, hooks: o.hooks || null, stacks: o.stacks ?? 1,
    };
    this.objects.push(obj);
    this._emit(EV.OBJECT_ADD, { id: obj.id, kind: obj.kind, slot: obj.slot, name: obj.name, data: { ...obj.data } });
    return obj;
  }
  updateObject(id, patch) {
    const o = this.objects.find(x => x.id === id);
    if (!o) return null;
    const before = { ...o.data };
    Object.assign(o.data, patch);
    this._emit(EV.OBJECT_UPDATE, { id, kind: o.kind, slot: o.slot, data: { ...o.data }, before });
    return o;
  }
  removeObject(id, reason = 'effect') {
    const i = this.objects.findIndex(x => x.id === id);
    if (i < 0) return false;
    const o = this.objects[i];
    this.objects.splice(i, 1);
    this._emit(EV.OBJECT_REMOVE, { id, kind: o.kind, slot: o.slot, reason });
    return true;
  }
  objectsOfKind(kind) { return this.objects.filter(o => o.kind === kind); }

  // ── summons ───────────────────────────────────────────────────────────────

  /**
   * Put a new actor into an enemy-like slot. `side:'ally'` gives the player a
   * minion the enemies can hit; `side:'enemy'` reinforces the other team.
   */
  summon(def, o = {}) {
    const side = o.side || 'enemy';
    const list = side === 'ally' ? this.allies : this.enemies;
    const slot = o.slot ?? list.length;
    const id = o.id || `${side === 'ally' ? 'a' : 's'}${++this._entityUid}`;
    const e = this._makeEnemy({ def, hp: o.hp, id }, slot);
    e.side = side;
    e.summoned = true;
    if (o.maxSlots && list.length >= o.maxSlots) return null;
    list.push(e);
    this._emit(EV.SUMMON, {
      entity: { id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, slot: e.slot, side, tier: e.tier, silhouette: e.silhouette },
      sourceId: o.sourceId || null,
    });
    def.onSpawn?.(this.enemyCtx(e, null));
    if (side === 'enemy') chooseMove(this, e, 'summon');
    return e;
  }

  removeEntity(actor, reason = 'effect') {
    const list = actor.side === 'ally' ? this.allies : this.enemies;
    const i = list.indexOf(actor);
    if (i < 0) return false;
    list.splice(i, 1);
    // Same reason as `_checkDeath`: a despawn is the other way an enemy leaves,
    // and a rule it installed must leave with it.
    this.hooks.removeByOwner(actor);
    this._emit(EV.ENTITY_REMOVE, { id: actor.id, side: actor.side, slot: actor.slot, reason });
    return true;
  }

  // ── death ─────────────────────────────────────────────────────────────────

  _checkDeath(actor, killerId) {
    if (!actor.alive || actor.hp > 0) return false;
    actor.alive = false;
    actor.hp = 0;
    actor.block = 0;
    actor.intent = null;
    this._emit(EV.DEATH, { actorId: actor.id, name: actor.name, killerId: killerId || null, side: actor.side, slot: actor.slot });
    this.hooks.dispatch('onDeath', { actor, killerId });
    if (actor.def?.onDeath) { try { actor.def.onDeath(this.enemyCtx(actor, null)); } catch (e) { console.error(e); } }
    this.clearRules(actor.id);
    /**
     * An ad-hoc hook dies with the thing that installed it.
     *
     * `enemyCtx.addHook` has documented itself as "removed with the enemy"
     * since it was written and `Hooks.removeByOwner` had NO CALLERS, so a rule
     * an enemy installed kept firing after the enemy was gone. No shipped enemy
     * used `addHook`, which is the only reason nobody had met it — the Heart's
     * Sanctuary Locks and Routine rules are the first content that does, and
     * every one of them is a cost or Guard rule that must stop when the Lock
     * breaks. CONTRACTS 54: the comment was the whole implementation.
     *
     * Only for enemies and allies. A PLAYER seat that falls comes back at 1
     * Courage if the team wins, so its relics and Powers must survive.
     */
    if (actor.side !== 'player') this.hooks.removeByOwner(actor);
    this._enemyLifecycle('onAllyDeath', { dead: actor, deadId: actor.id },
      [...this.enemies, ...this.allies].filter(x => x !== actor));
    if (actor.side === 'player') this._fall(actor, killerId);
    else if (actor.side === 'enemy' && this.livingEnemies().length === 0) this._endCombat(true);
    return true;
  }

  /**
   * A player has hit 0 Courage.
   *
   * Solo: that is the run, exactly as before. In a party the seat FALLS — it
   * keeps its place in `players` (its deck and Keepsakes stay inspectable, and
   * teammates can still read what it was holding), takes no further turn, draws
   * nothing, and is not a legal target for anything. If the team wins the
   * fight, it comes back at 1 Courage. Only when every seat has fallen is the
   * run over.
   */
  _fall(pl, killerId) {
    pl.fallen = true;
    pl.block = 0;
    // A fallen seat stops holding cards: its hand goes to its own discard, so a
    // teammate's Clone can still reach the deck and nothing is stranded.
    for (const c of [...pl.piles.hand]) pl.piles.move(c, Pile.DISCARD, { reason: 'fallen' });
    this._emit(EV.PLAYER_FALL, { actorId: pl.id, seat: pl.seat, name: pl.name, killerId: killerId || null });
    this.hooks.dispatch('onPlayerFall', { actor: pl, player: pl, killerId });
    // Enemies aiming at a seat that can no longer act must re-aim, or their
    // intent would point at nobody for the rest of the fight.
    for (const en of this.enemies) if (en.targetSeatId === pl.id) en.targetSeatId = null;
    if (this.livingPlayers().length === 0) this._endCombat(false);
    else this.refreshIntents('fallen');
  }

  _endCombat(victory) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    this.phase = 'over';
    // Win the fight and everyone who fell gets back up at 1 Courage. Done
    // BEFORE onCombatEnd so a Keepsake that reads the party sees the revived
    // seat, and before COMBAT_END so the reward screen never opens on a corpse.
    if (victory) {
      for (const pl of this.players) {
        if (!pl.fallen) continue;
        pl.fallen = false;
        pl.alive = true;
        pl.hp = 1;
        this._emit(EV.PLAYER_REVIVE, { actorId: pl.id, seat: pl.seat, name: pl.name, hp: 1 });
      }
    }
    this._invalidate();
    this.hooks.dispatch('onCombatEnd', { victory });
    this._emit(EV.COMBAT_END, {
      victory, turn: this.turn,
      playerHp: this.players[0].hp,
      partyHp: this.players.map(pl => ({ seat: pl.seat, id: pl.id, hp: pl.hp, fallen: pl.fallen })),
    });
  }

  // ── intents ───────────────────────────────────────────────────────────────

  /**
   * Recompute every intent. Guarded against re-entry: rebuilding a plan calls
   * `EnemyDef.nextMove`, and a def that touches state from in there would
   * otherwise loop forever. `nextMove` is required to be pure; this makes a
   * violation merely wrong instead of fatal.
   */
  refreshIntents(reason = 'refresh') {
    if (!this.started || this.over || this._refreshing) return;
    this._refreshing = true;
    try { refreshIntents(this, reason); } finally { this._refreshing = false; }
  }

  /**
   * EnemyCtx — handed to nextMove, move effects and every EnemyDef lifecycle hook.
   * The full surface documented at the top of `data/enemies/_lib.js`.
   *
   * `nextMove` MUST be pure: the engine calls it repeatedly to re-render dynamic
   * intents and to look ahead into the plan. `extra.rng` is a per-position fork,
   * so lookahead never disturbs the main stream.
   */
  enemyCtx(enemy, move, extra = {}) {
    const e = this;
    /**
     * `extra.aimAt` pins this ctx to ONE seat, whatever the enemy's pending
     * move is aimed at.
     *
     * A House Rule's Reprimand belongs to the Kid who broke it — not to
     * whoever the Butler happens to be swinging at. Without the pin the
     * Reprimand resolves through `partyTargets`, which reads the enemy's
     * PENDING move, so a Reprimand landed on the wrong Kid and, if that
     * pending move was `partyTarget: 'all'`, went out as AoE.
     */
    const pinned = extra.aimAt || null;
    const target = () => pinned || e.intentTargetFor(enemy);
    const aim = target();
    return this._guardCtx({
      e, engine: e, self: enemy, enemy, move,
      rng: extra.rng || e.rng,
      turn: e.turn,
      // For an enemy, "the player" IS the seat it is aimed at. In solo those
      // are the same thing; in a party, reading seat 0 here would make every
      // enemy debuff land on the host no matter who it was swinging at.
      player: aim,
      target: aim,
      field: e.field,
      history: extra.history || enemy.history,
      lastMove: enemy.lastMove,
      mem: enemy.mem,
      planPosition: extra.planPosition ?? 0,
      forecast: !!extra.forecast,
      cardsPlayedThisTurn: e.playedThisTurn,
      ...extra,

      // board
      enemies: () => e.livingEnemies(),
      allies: () => e.livingEnemies().filter(x => x !== enemy),
      friends: () => e.allies.filter(x => x.alive),
      livingEnemies: () => e.livingEnemies(),
      intentOf: (a) => (a && a.intent ? a.intent.type : null),
      intentFamily: (a, pos) => e.intentFamilyOf(a || enemy, pos ?? 0),
      timesUsed: (id) => enemy.timesUsed(id),
      usedInARow: (id, n) => enemy.usedInARow(id, n),

      // damage / health
      damage: (t, n, opts = {}) => {
        // Overloads, all of which exist in the enemy content:
        //   damage(target, amount, opts)   an explicit victim
        //   damage(amount)                 whoever the move is aimed at
        //   damage(amount, opts)           ditto, with { hits }
        let victim = null, amount = 0, o = opts;
        if (t && t.id) { victim = t; amount = n; }
        else if (typeof t === 'number') { amount = t; if (n && typeof n === 'object') o = n; }
        else { amount = n; }
        const hits = o.hits ?? 1;
        // An explicit target wins. Otherwise the move's own `partyTarget`
        // decides: one seat, all of them, or two different ones. In solo every
        // branch collapses to the single player, so nothing changes.
        const targets = victim ? [victim] : (pinned ? [pinned] : e.partyTargets(enemy, move));
        for (const d of targets) {
          if (!d) continue;
          for (let i = 0; i < hits; i++) {
            if (e.over || !d.alive) break;
            e.dealDamage({ attacker: enemy, defender: d, amount, kind: 'attack', hits, hitIndex: i, ...o });
          }
        }
      },
      /** Every living seat, whatever the move declares. */
      damageParty: (n, opts = {}) => {
        for (const d of e.livingPlayers()) {
          if (e.over) break;
          e.dealDamage({ attacker: enemy, defender: d, amount: n, kind: 'attack', ...opts });
        }
      },
      /** The seats this move lands on, for a def that wants to look first. */
      targets: () => e.partyTargets(enemy, move),
      players: () => e.livingPlayers(),
      partySize: () => e.players.length,
      /** "N damage times number of players", the region chapters' threshold shape. */
      perPlayer: (n) => e.perPlayer(n),
      /** ONE seat's Tricks this turn. `c.cardsPlayedThisTurn` is the whole table's. */
      seatPlayed: (who) => e.seatPlayed(who),
      /** ONE seat's per-turn counters. `c.e.stats` is the whole table's. */
      seatStats: (who) => e.seatStats(who),
      /** Pick a seat by preference: lowestGuard | lowestCourage | fewestDraw | ... */
      pickSeat: (how) => e.pickSeat(how),
      damageMulti: (amount, hits, opts = {}) => {
        for (let i = 0; i < hits; i++) {
          if (e.over) break;
          e.dealDamage({ attacker: enemy, defender: opts.target || target(), amount, kind: 'attack', hits, hitIndex: i, ...opts });
        }
      },
      /**
       * block(4), block(actor, 4) or block(actor, 4, opts).
       *
       * The third argument used to be DROPPED, so `{ source: c.self }` and
       * `{ noJoin: true }` — both written in the nursery, both meaning
       * something — never reached `gainBlock` at all. `source` defaults to the
       * acting enemy because that is what it always is: the Rocking Horse's
       * rule is "an ally gaining Guard FROM ANOTHER ENEMY" (nursery §31), which
       * needs a source to be there, and its own guard against exciting off its
       * own Happy Clatter needs that source to be ITSELF.
       */
      block: (a, n, opts) => {
        const o = { fromCard: false, reason: 'enemy', source: enemy, ...(opts || {}) };
        if (typeof a === 'number') return e.gainBlock(enemy, a, o);
        return e.gainBlock(a || enemy, n, o);
      },
      heal: (a, n) => (typeof a === 'number' ? e.heal(enemy, a, 'enemy') : e.heal(a || enemy, n, 'enemy')),
      /**
       * Take Guard OFF an actor — the twin of `block`, and the seam the
       * Butler's GUESTS DO NOT CLUTTER THE HALL needs: its Reprimand tidies the
       * PLAYER's Guard away instead of handing him more of his own.
       *
       * Added rather than reached for: `c.e.loseBlock(...)` resolves against
       * the real engine and throws against `tests/enemies/index.html`, which
       * builds its own ctx. An enemy def must not have to know which of the two
       * it is talking to.
       */
      loseBlock: (a, n, reason) => e.loseBlock(a || target(), n, reason || 'enemy'),
      loseHp: (a, n) => (typeof a === 'number' ? e.loseHp(enemy, a, 'enemy') : e.loseHp(a || enemy, n, 'enemy')),

      // statuses. The 4th argument is options/content data and MUST be passed
      // through — Blanket Blob's Cover sends `{ by, amount }` this way.
      applyStatus: (a, id, n, opts) => e.applyStatus(a || e.player, id, n, { sourceId: enemy.id, ...(opts || {}) }),
      removeStatus: (a, id, opts) => e.removeStatus(a || enemy, id, (opts && opts.reason) || 'enemy'),
      buff: (id, n, opts) => e.applyStatus(enemy, id, n, { sourceId: enemy.id, ...(opts || {}) }),
      debuff: (id, n, opts) => e.applyStatus(target(), id, n, { sourceId: enemy.id, ...(opts || {}) }),
      statusMeta: (a, id) => e.statusMeta(a || enemy, id),
      count: (id, a) => (a || enemy).status(id),
      has: (id, a) => (a || enemy).hasStatus(id),

      /**
       * A Power on an enemy, with hooks.
       *
       * The card ctx has had this since the beginning; the enemy ctx did not,
       * and an enemy whose defence is "damage aimed at me goes somewhere else"
       * has nowhere else to hang it. The Governess's Stitched Together was
       * written as a def method nothing called for exactly this reason.
       * `hooks.actorHooks(defender)` finds an enemy's Powers already — the only
       * thing missing was a way for the enemy to install one.
       */
      addPower: (p, actor) => e.addPower(actor || enemy, p),
      /** An ad-hoc hook owned by this enemy. Removed with the enemy. */
      addHook: (name, fn, opts) => e.hooks.add(name, fn, { owner: enemy, source: 'enemy', ...(opts || {}) }),

      // per-enemy displayed counters
      counter: (key) => (enemy.counters[key] ?? 0),
      setCounter: (key, v) => {
        const before = enemy.counters[key] ?? 0;
        enemy.counters[key] = v;
        e._dirty = true;
        if (before !== v) {
          e._emit(EV.COUNTER, { ownerId: enemy.id, id: key, name: key, before, after: v, delta: v - before, min: 0, max: 99, reason: 'enemy' });
          e.refreshIntents('enemyCounter');
        }
        return v;
      },
      addCounter: (key, n, max = Infinity, min = 0) => {
        const v = Math.max(min, Math.min(max, (enemy.counters[key] ?? 0) + n));
        return e.enemyCtx(enemy, move).setCounter(key, v);
      },

      // cards and spawns, by id or by def
      /**
       * Deck pollution goes to the seat this move is AIMED at, unless the move
       * names one with `{ to }`. Nothing is acting during the enemy phase, so
       * without this it all landed in seat 0's pile.
       */
      addCard: (idOrDef, pile = Pile.DISCARD, opts) => {
        const def = e.resolveCardDef(idOrDef);
        if (!def) { console.warn(`[combat] unknown card "${idOrDef}"`); return null; }
        return e.addCard(def, pile, { reason: enemy.id, to: aim, ...(opts || {}) });
      },
      summon: (idOrDef, opts = {}) => {
        const def = e.resolveEnemyDef(idOrDef);
        if (!def) { console.warn(`[combat] unknown enemy "${idOrDef}"`); return null; }
        let hp = opts.hp;
        if (hp == null && opts.hpMul != null && Array.isArray(def.hp)) {
          hp = Math.max(1, Math.round(e.rng.range(def.hp[0], def.hp[1]) * opts.hpMul));
        }
        return e.summon(def, { ...opts, hp, sourceId: enemy.id });
      },
      despawn: (a) => e.removeEntity(a || enemy, 'despawn'),

      /* ── taking a Trick out of the fight, temporarily ────────────────────
       * The Kitchens' Pantry Mimic swallows the top of your draw pile and
       * gives it back when it dies. That is the softest deck attack in the
       * game and it needed a seam that did not exist: enemies could ADD cards
       * and could not touch the ones already there.
       *
       * LIMBO, not exhaust. The exhaust pile is "out of this Scuffle" and the
       * player can see it in the Vanished viewer; a swallowed card is coming
       * back and must not appear there. Limbo is the engine's existing staging
       * pile for a card that is mid-flight and belongs to nobody.
       *
       * Nothing here touches `run.deck`, so a fight that ends with a card
       * still swallowed costs the player nothing: the next Scuffle builds its
       * piles from the run's deck again. That is why there is no
       * combat-end restore — it would be a no-op with a comment on it.
       */
      takeFromDraw: (which = 'top') => {
        const seat = aim || e.current;
        const draw = seat.piles.draw;
        if (!draw.length) return null;
        const card = which === 'bottom' ? draw[draw.length - 1] : draw[0];
        seat.piles.move(card, Pile.LIMBO, { reason: enemy.id });
        return { uid: card.uid, id: card.id, name: card.name };
      },
      /* ── the aimed seat's piles, in general ──────────────────────────────
       * `takeFromDraw` above was added for one enemy and answers exactly one
       * question. The Heart asks a general one in five places — the Namekeeper
       * Names a Trick in HAND, the Housekeeper puts the most recent DISCARD
       * back, the Door sends the top of the DRAW pile to the bottom, the Keeper
       * pulls a discard to the top — so these are the general form rather than
       * five more one-offs, each with its own mock shim to drift from.
       *
       * `cardsIn` returns PLAIN SNAPSHOTS and never runtime cards. An enemy def
       * holding a runtime card would be CONTRACTS 19 wearing a different hat,
       * and the mock ctx in tests/enemies has no runtime cards to hand it.
       * `moveCardTo` takes the uid back, which is the same round trip
       * `takeFromDraw`/`returnToHand` already use.
       */
      cardsIn: (pile = Pile.HAND, who = null) => {
        const seat = (who && e._resolveSeat(who)) || aim || e.current;
        const list = (seat && seat.piles && seat.piles[pile]) || [];
        return list.map(c => ({
          uid: c.uid, id: c.id, name: c.name, type: c.type, cost: e.costOf(c),
        }));
      },
      /**
       * Move one of the seat's Tricks by uid. `opts` is Piles.move's:
       * `{ top: true }` / `{ bottom: true }` / `{ position }`.
       */
      moveCardTo: (ref, pile, opts = {}) => {
        const uid = (ref && ref.uid) || ref;
        const card = e.card(uid);
        if (!card) return false;
        const seat = e.seatOfCard(card) || aim || e.current;
        return seat.piles.move(card, pile, { reason: enemy.id, ...opts });
      },
      /**
       * The seat this move is aimed at draws.
       *
       * Through `_asSeat`, because `drawCards` resolves against `e.current` and
       * nothing is acting during the enemy phase — the same reason `addCard`
       * above has to name `to: aim`.
       */
      playerDraw: (n = 1) => e._asSeat(aim || e.current,
        () => e.drawCards(Math.max(0, n | 0), enemy.id)),

      /** Put a taken Trick back. Accepts the object `takeFromDraw` returned, or a uid. */
      returnToHand: (ref) => {
        const uid = (ref && ref.uid) || ref;
        const card = e.card(uid);
        if (!card) return false;
        const seat = e.seatOfCard(card) || aim || e.current;
        seat.piles.move(card, Pile.HAND, { reason: enemy.id });
        return true;
      },

      /* ── a countdown the player can SEE ───────────────────────────────────
       * The engine's timer system, which Wisp's Linger and Wink's Set Tricks
       * already use, reached from an enemy for the first time in the
       * Greenhouse: a Spore Cloud is 7 damage two turns from now, and "Killing
       * Spore Puff does not erase consequences it already created" means it
       * cannot live on the enemy that made it.
       *
       * `when: 'playerTurnStart'` by default, and that is deliberate rather
       * than convenient. A scheduled hit that lands during the ENEMY phase is
       * damage no intent promised, which is the one thing this game's intents
       * may never do — `tests/enemies/engine-audit.html` scores exactly that.
       * A labelled countdown ticking down in front of the player is its own
       * promise, made two turns early.
       */
      schedule: (o) => e.schedule({ when: 'playerTurnStart', ownerId: enemy.id, ...o }),
      adjustTimer: (id, delta, reason) => e.adjustTimer(id, delta, reason || 'enemy'),
      cancelTimer: (id) => e.cancelTimer(id),
      timers: () => e.timers.filter(t => t.ownerId === enemy.id).map(t => ({
        id: t.id, label: t.label, turnsLeft: t.turnsLeft, data: t.data,
      })),

      /**
       * SHOW MORE OF THE PLAN. `previewDepth` is how many FUTURE positions of
       * an enemy's queue are revealed, and `consumePlan` walks it back down to
       * zero every turn — so an enemy whose whole design is "you can always see
       * my next two actions" has to say so again each turn rather than once.
       * The Graveyard's Epitaph Spirit is the first, and its region's identity
       * is that it almost never surprises you.
       */
      reveal: (n = 1) => { enemy.previewDepth = Math.max(enemy.previewDepth || 0, n | 0); },

      // House Rules
      announceRule: (rule) => e.announceRule(rule, enemy.id),
      clearRules: (sourceId) => e.clearRules(sourceId ?? enemy.id),
      rules: () => e.rules.slice(),

      say: (text, tone) => e.say(text, tone),
    }, 'enemyCtx');
  }

  // ── card helpers ──────────────────────────────────────────────────────────

  /** Create a new card instance and put it somewhere. Returns the Card(s). */
  /**
   * Put a new card into somebody's pile.
   *
   * `opts.to` names the SEAT. It has to, because an enemy adding a card runs
   * with nobody acting, and `this.current` falls back to seat 0 — so every
   * enemy that pollutes "the player's" deck was pouring it into the host's,
   * whatever seat the move was aimed at. Lost Luggage picks the Kid with the
   * fewest Tricks in their draw pile and then handed the Clutter to seat 0.
   */
  addCard(def, pile = Pile.HAND, opts = {}) {
    const n = opts.count ?? 1;
    const made = [];
    const seat = (opts.to && this._resolveSeat(opts.to)) || this.current;
    for (let i = 0; i < n; i++) {
      const card = new Card(def, { upgraded: !!opts.upgraded, meta: opts.meta });
      if (opts.cost !== undefined) card.costOverrideCombat = opts.cost;
      if (opts.exhaust) card.exhaust = true;
      if (opts.ethereal) card.ethereal = true;
      if (opts.retain) card.retain = true;
      let dest = pile;
      if (dest === Pile.HAND && seat.piles.hand.length >= this.handCap(seat)) dest = Pile.DISCARD;
      const idx = seat.piles._push(card, dest, opts.position ?? (dest === Pile.DRAW ? 'top' : 'bottom'));
      this._emit(EV.CARD_ADD, {
        cardUid: card.uid, card: this.cardSnap(card), pile: dest,
        position: idx, reason: opts.reason || 'effect',
        actorId: seat.id, seat: seat.seat,
      });
      made.push(card);
    }
    return n === 1 ? made[0] : made;
  }

  moveCard(card, pile, opts = {}) { return this.current.piles.move(card, pile, opts); }

  drawCards(n, reason = 'draw') {
    const want = this.hooks.reduce('modifyDraw', n, { reason }, this.hooks.actorHooks(this.current, 'modifyDraw'));
    return this.current.piles.drawN(Math.max(0, want), reason);
  }

  discardCard(card, reason = 'effect') {
    const from = this.current.piles._pull(card);
    this.current.piles._push(card, Pile.DISCARD, 'bottom');
    this.stats.cardsDiscardedThisTurn++;
    this.current.stats.cardsDiscardedThisTurn++;
    this._emit(EV.DISCARD, {
      cardUid: card.uid, card: this.cardSnap(card), from, to: Pile.DISCARD, reason,
      handSize: this.current.piles.hand.length, discardCount: this.current.piles.discard.length,
    });
    this.hooks.dispatch('onCardDiscarded', { card, reason });
    return card;
  }

  exhaustCard(card, reason = 'effect') {
    const from = this.current.piles._pull(card);
    this.current.piles._push(card, Pile.EXHAUST, 'bottom');
    this.stats.cardsExhaustedThisTurn++;
    this.stats.cardsExhaustedThisCombat++;
    this.current.stats.cardsExhaustedThisTurn++;
    this.current.stats.cardsExhaustedThisCombat++;
    this._emit(EV.EXHAUST, {
      cardUid: card.uid, card: this.cardSnap(card), from, reason,
      exhaustCount: this.current.piles.exhaust.length,
    });
    this.hooks.dispatch('onCardExhausted', { card, reason });
    return card;
  }

  /** Discard n cards from hand. Deterministic: random picks come from engine.rng. */
  discardRandom(n, reason = 'effect', exclude = null) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const pool = this.current.piles.hand.filter(c => c !== exclude);
      if (!pool.length) break;
      out.push(this.discardCard(pool[this.rng.int(pool.length)], reason));
    }
    return out;
  }

  // ── ctx handed to card effects (schema.js §Ctx — exact) ───────────────────

  ctxFor(card, target, x = 0) {
    const e = this;
    // `self` is whoever is HOLDING this card, not seat 0. Every companion card
    // in the game reads `ctx.self` for its own Guard, statuses and Courage, so
    // getting this wrong would quietly apply a teammate's Curl Up to the host.
    // Falls back to the acting seat for engine-made ctx that carries no card.
    const self = this.seatOfCard(card) || this.current;
    return this._guardCtx({
      e, engine: e, self, player: self, target, card, x,
      rng: e.rng, turn: e.turn,

      // damage / health
      damage: (t, amount, opts = {}) => {
        const d = t || target;
        if (!d || !d.alive) return null;
        const hits = opts.hits ?? 1;
        let last = null;
        for (let i = 0; i < hits; i++) {
          if (!d.alive || e.over) break;
          last = e.dealDamage({ attacker: self, defender: d, amount, kind: 'attack', card, hits, hitIndex: i, ...opts });
        }
        return last;
      },
      damageAll: (amount, opts = {}) => {
        const hits = opts.hits ?? 1;
        for (let i = 0; i < hits; i++) {
          for (const en of e.livingEnemies()) {
            if (e.over) break;
            e.dealDamage({ attacker: self, defender: en, amount, kind: 'attack', card, hits, hitIndex: i, ...opts });
          }
        }
      },
      loseHp: (t, amount) => e.loseHp(t || self, amount, card ? card.id : 'effect'),
      block: (actor, amount) => e.gainBlock(actor || self, amount, { source: card, reason: 'card' }),
      heal: (actor, amount) => e.heal(actor || self, amount, card ? card.id : 'effect'),
      applyStatus: (actor, id, stacks, opts) => e.applyStatus(actor || self, id, stacks, { sourceId: self.id, reason: card ? card.id : 'effect', ...(opts || {}) }),
      statusMeta: (actor, id) => e.statusMeta(actor || self, id),
      removeStatus: (actor, id) => e.removeStatus(actor || self, id),

      // cards
      draw: (n) => e.drawCards(n, card ? card.id : 'effect'),
      discard: (n, opts = {}) => {
        const why = card ? card.id : 'effect';
        if (opts.cards) return opts.cards.map(c => e.discardCard(c, why));
        if (opts.all) return self.piles.hand.slice().map(c => e.discardCard(c, why));
        if (opts.choose) {
          // async: resolves to the discarded cards once the player has picked
          return (async () => {
            const pool = self.piles.hand.filter(k => k !== card && (!opts.filter || opts.filter(k)));
            if (!pool.length) return [];
            const picked = await e.choices.ask({
              kind: 'card', pool, count: Math.min(n, pool.length), optional: !!opts.optional,
              prompt: opts.prompt || `Choose ${n} Trick${n > 1 ? 's' : ''} to discard.`,
              meta: { pile: 'hand', cardId: card?.id, cardUid: card?.uid },
            });
            return picked.map(i => pool[i]).filter(Boolean).map(c => e.discardCard(c, why));
          })();
        }
        return e.discardRandom(n, why, card);
      },
      exhaust: (c) => e.exhaustCard(c || card, card ? card.id : 'effect'),
      addCard: (def, pile, opts) => e.addCard(def, pile || Pile.HAND, opts),
      moveCard: (c, pile, opts) => e.moveCard(c, pile, opts),
      setCost: (c, v, scope) => e.setCardCost(c || card, v, scope || 'turn'),
      modifyCost: (c, d, scope) => e.modifyCardCost(c || card, d, scope || 'turn'),
      meta: (key, value) => value === undefined ? card.meta[key] : e.setCardMeta(card, key, value),
      retainCard: (c) => { (c || card).retainThisTurn = true; e._dirty = true; },

      // energy
      gainEnergy: (n) => e.gainEnergy(n, card ? card.id : 'effect'),
      /** Which pile this Trick was played out of: 'hand' or 'stash'. */
      playedFrom: card ? (card._playedFrom || Pile.HAND) : null,
      loseEnergy: (n) => e.loseEnergy(n, card ? card.id : 'effect'),
      /**
       * Nerve at the START OF A LATER TURN. The only way to express it: the
       * refill in `_dealSeatTurn` SETS Nerve, so gaining it from a turn-start
       * listener, hook or timer is wiped a moment later. Twin of `energyDelta`
       * (trap 21), pointing the other way.
       */
      bankEnergy: (n, pl) => {
        const who = pl || self;
        who.flags.energyNextTurn = (who.flags.energyNextTurn || 0) + n;
        e._dirty = true;
        return who.flags.energyNextTurn;
      },

      // ── player choice (async) ───────────────────────────────────────────
      /** Ask the player to pick cards. Resolves to an array of runtime Cards. */
      chooseCard: async (o = {}) => {
        const pileName = o.pile || 'hand';
        const pool = (o.pool && o.pool.length ? o.pool : e.cardsIn(pileName))
          .filter(k => k && k !== card && (!o.filter || o.filter(k)));
        if (!pool.length) return [];
        const picked = await e.choices.ask({
          kind: 'card', pool, count: o.count ?? 1, optional: !!o.optional,
          prompt: o.prompt || `Choose ${o.count ?? 1} Trick${(o.count ?? 1) > 1 ? 's' : ''}.`,
          meta: { pile: pileName, cardId: card?.id, cardUid: card?.uid },
        });
        return picked.map(i => pool[i]).filter(Boolean);
      },
      /** Ask the player to pick from named options. Resolves to an array of indices. */
      choose: async (o = {}) => {
        const opts = (o.options || []).map(x => (typeof x === 'string' ? { label: x } : x));
        if (!opts.length) return [];
        return e.choices.ask({
          kind: 'option', pool: opts, count: o.count ?? 1, optional: !!o.optional,
          prompt: o.prompt || 'Choose one.',
          meta: { cardId: card?.id, cardUid: card?.uid },
        });
      },
      /** Ask the player to pick an enemy. Resolves to an array of Actors. */
      chooseEnemy: async (o = {}) => {
        const pool = (o.pool || e.livingEnemies());
        if (!pool.length) return [];
        const picked = await e.choices.ask({
          kind: 'enemy', pool, count: o.count ?? 1, optional: !!o.optional,
          prompt: o.prompt || 'Choose an enemy.', meta: { cardId: card?.id, cardUid: card?.uid },
        });
        return picked.map(i => pool[i]).filter(Boolean);
      },

      // ── zone / card-state helpers the content agents call ───────────────
      /** Mark a card so it Vanishes the next time it is played. */
      setVanish: (c2, on = true) => { const k = c2 || card; if (k) { k.exhaust = !!on; k.meta.vanish = !!on; e._dirty = true; } },
      /** Return a card to hand (defaults to the card resolving). */
      returnToHand: (c2) => {
        const k = c2 || card;
        if (!k) return false;
        if (self.piles.hand.length >= e.handCap()) return false;
        return self.piles.move(k, Pile.HAND, { reason: 'returned' });
      },
      /** Shuffle the draw pile in place. */
      shuffleDraw: () => self.piles.shuffleDraw('effect'),
      /** Change how many Tricks you draw at the start of your NEXT turn. */
      modifyDraw: (n) => { e.drawDeltaNextTurn += n; e._dirty = true; return e.drawDeltaNextTurn; },
      cardsIn: (pile) => e.cardsIn(pile),

      // ── intent queue (Wink) ─────────────────────────────────────────────
      intentQueue: (en) => e.intentQueue(en),
      intentFamily: (en, pos) => e.intentFamilyOf(en, pos ?? 0),
      intentOf: (en) => (en && en.intent ? en.intent.type : null),
      previewIntent: (en, n) => e.previewIntent(en, n),
      previewDepth: (en) => previewDepthOf(en),
      previewedFamilies: (en) => previewedFamilies(e, en),
      isAnchored: (en, pos) => isAnchored(en, pos ?? 0),
      swapIntents: (en, a, b) => e.swapIntents(en, a, b),
      forkFuture: (en) => e.forkFuture(en),
      controlEnemyChoice: (en, on) => e.controlEnemyChoice(en, on !== false),
      postponeIntent: (en) => e.postponeIntent(en),
      /** Replace what this enemy is about to do with a supplied move (Boggle's Search). */
      overrideIntent: (en, move) => e.overrideIntent(en, move),
      clearIntentOverride: (en) => e.clearIntentOverride(en),
      deleteIntent: (en) => e.deleteIntent(en),
      /** Cancel what this enemy is about to do; the next planned action steps up. */
      cancelIntent: (en) => e.cancelIntent(en),

      // queries
      count: (statusId, actor) => (actor || self).status(statusId),
      has: (statusId, actor) => (actor || self).hasStatus(statusId),
      forEachEnemy: (fn) => e.livingEnemies().forEach((en, i) => fn(en, i)),
      randomEnemy: () => e.randomEnemy(),
      livingEnemies: () => e.livingEnemies(),
      enemies: e.enemies,
      allies: e.allies,
      hand: self.piles.hand,
      drawPile: self.piles.draw,
      discardPile: self.piles.discard,
      exhaustPile: self.piles.exhaust,
      limbo: self.piles.limbo,
      stash: self.piles.stash,

      // companion systems
      counter: (id) => e.counter(id, self.id),
      // ── the party (co-op) ──────────────────────────────────────────────
      // These are the whole cross-player surface. Everything a multiplayer-only
      // Trick does to a teammate goes through one of them, so there is exactly
      // one place where "act on someone else" is implemented — and each one
      // resolves inside `_asSeat`, so the recipient's OWN piles, Nerve and
      // hooks are what respond. Reaching for `e.player` from a card effect
      // would silently act on seat 0 instead.
      party: () => e.livingPlayers(),
      /** Everyone but the Kid playing this card. Empty in solo. */
      teammates: () => e.livingPlayers().filter(pl => pl !== self),
      isParty: () => e.isParty,
      /**
       * Ask for a teammate. Resolves to null in solo, so a card can read
       * `const ally = await c.chooseAlly(); if (!ally) return;` and be honest
       * about doing nothing rather than silently targeting the caller.
       */
      chooseAlly: async (o = {}) => {
        const pool = e.livingPlayers().filter(pl => pl !== self);
        if (!pool.length) return null;
        if (pool.length === 1) return pool[0];
        const picked = await e.choices.ask({
          kind: 'option', prompt: o.prompt || 'Choose a friend.',
          cardId: card ? card.id : null,
          options: pool.map(pl => ({ id: pl.id, label: pl.name })),
          min: 1, max: 1,
        });
        const i = Array.isArray(picked) ? picked[0] : picked;
        return pool[i] ?? pool[0];
      },
      /** Guard onto a teammate, counted as theirs (their Dexterity, their Frail). */
      giveBlock: (pl, n) => (pl ? e._asSeat(pl, () =>
        e.gainBlock(pl, n, { fromCard: true, reason: card ? card.id : 'ally' })) : 0),
      /** A teammate draws from THEIR deck into THEIR hand. */
      giveDraw: (pl, n) => (pl && n > 0
        ? e._asSeat(pl, () => e.drawCards(n, card ? card.id : 'ally')) : 0),
      giveEnergy: (pl, n) => (pl && n
        ? e._asSeat(pl, () => e.gainEnergy(n, card ? card.id : 'ally')) : 0),
      giveStatus: (pl, id, n, opts) => (pl
        ? e.applyStatus(pl, id, n, { reason: card ? card.id : 'ally', ...(opts || {}) }) : 0),
      giveHeal: (pl, n) => (pl ? e.heal(pl, n, card ? card.id : 'ally') : 0),
      /** Cards in a teammate's pile — for Clone, Fetch Relay, Bring It Back. */
      allyCards: (pl, pile = 'hand') => (pl && pl.piles ? pl.piles.list(pile).slice() : []),
      /**
       * "That player chooses a Trick from their hand." — ask the KID WHOSE
       * CARDS THEY ARE, not whoever is driving.
       *
       * ~15 multiplayer-only Tricks are worded this way. Each one used to
       * inline its own deterministic rule beside a `// TEAMMATE PICK` comment,
       * five files' worth of slightly different sorts with no shared contract
       * and nothing a transport could intercept. This raises a real request
       * addressed to their seat: their own client's picker answers it, and
       * every other client resolves it with `prefer` and reads the outcome off
       * the choice log. Local play always takes the second branch, on purpose
       * — putting one player in charge of another Kid's deck would be worse
       * than a stable rule, not better.
       *
       * @param {Object}   ally         the teammate
       * @param {Object}   o
       * @param {Array}    o.pool       their cards to choose from
       * @param {number}   [o.count]    how many, default 1
       * @param {string}   [o.prompt]
       * @param {'cheapest'|'priciest'|Function} [o.prefer]  the fallback rule
       * @returns {Promise<Array>} the chosen cards, in pool order
       */
      askAlly: async (ally, o = {}) => {
        const pool = (o.pool || []).filter(Boolean);
        if (!ally || !pool.length) return [];
        const picked = await e.choices.ask({
          kind: 'card',
          prompt: o.prompt || 'Choose a Trick.',
          count: Math.max(1, o.count ?? 1),
          optional: !!o.optional,
          pool,
          prefer: o.prefer || null,
          seat: ally,
          meta: { cardId: card ? card.id : null, cardUid: card ? card.uid : null, pile: o.pile || null },
        });
        return picked.map(i => pool[i]).filter(Boolean);
      },
      /**
       * The same, for a call rather than a card: "a friend names an Intent
       * Family". `options` is `[{ label, ...anything }]` and the chosen entry
       * comes back. Ordering IS the fallback — put the answer this Kid would
       * give without being asked first, and make sure it can be wrong.
       */
      askAllyOption: async (ally, o = {}) => {
        const pool = (o.options || []).filter(Boolean);
        if (!ally || !pool.length) return null;
        const picked = await e.choices.ask({
          kind: 'option', prompt: o.prompt || 'Choose one.', count: 1,
          pool, seat: ally,
          meta: { cardId: card ? card.id : null, cardUid: card ? card.uid : null },
        });
        return pool[picked[0]] ?? pool[0];
      },
      /** Put a card into a teammate's hand (or any of their piles). */
      giveCard: (pl, def, o = {}) => (pl
        ? e._asSeat(pl, () => e.addCard(def, o.pile || Pile.HAND, o)) : null),
      /**
       * Move a card a teammate ALREADY OWNS between their own piles.
       *
       * `moveCard` acts on `this.current.piles`, so calling it on a teammate's
       * card looks right and silently moves nothing (their card is not in the
       * acting seat's piles). Pudding's Bring It Here and Community Plot both
       * need this; `giveCard` is no help because the card exists already.
       */
      allyMoveCard: (pl, c2, pile, o = {}) => (pl && c2
        ? e._asSeat(pl, () => e.moveCard(c2, pile, o)) : false),

      addCounter: (id, n) => e.addCounter(id, n, card ? card.id : 'effect', self.id),
      spendCounter: (id, n) => e.spendCounter(id, n, card ? card.id : 'effect', self.id),
      canSpend: (id, n) => e.canSpend(id, n, self.id),
      defineCounter: (o) => e.defineCounter(o),
      schedule: (o) => e.schedule({ ...o, cardUid: card?.uid }),
      adjustTimer: (id, d) => e.adjustTimer(id, d),
      addObject: (o) => e.addObject(o),
      updateObject: (id, patch) => e.updateObject(id, patch),
      removeObject: (id) => e.removeObject(id),
      objectsOfKind: (kind) => e.objectsOfKind(kind),
      summon: (def, opts) => e.summon(def, { ...opts, sourceId: self.id }),
      addPower: (p, actor) => e.addPower(actor || self, p),
      addHook: (name, fn, opts) => e.hooks.add(name, fn, opts),

      // Stats the Companions read — THIS SEAT's, never the table's. A Kid's
      // Zoomies must not switch on because their friend played three Tricks,
      // and a teammate taking a hit must not end their Untouched. `e.stats` is
      // still there for anything that genuinely means the whole party.
      cardsPlayedThisTurn: () => e.seatStats().cardsPlayedThisTurn,
      cardsPlayedThisCombat: () => e.seatStats().cardsPlayedThisCombat,
      exhaustedThisCombat: () => e.seatStats().cardsExhaustedThisCombat,
      damageTakenLastEnemyTurn: () => e.seatStats().damageTakenLastEnemyTurn,
      untouched: () => e.seatStats().damageTakenLastEnemyTurn === 0,
      teamStats: () => e.stats,
      n: (key) => card?.nums?.[key] ?? 0,
      upgraded: !!card?.upgraded,
      say: (text, tone) => e.say(text, tone),
    }, 'cardCtx');
  }

  // ── the public API ────────────────────────────────────────────────────────

  /**
   * Supply the companion tracker installer. Two ways in:
   *   new CombatEngine({ trackerInstaller })   or   engine.setTrackerInstaller(fn)
   * `loadContentRegistries(engine)` in data/keywords.js does it for you, which is
   * the path the game takes.
   */
  setTrackerInstaller(fn) { this._trackerInstaller = fn; return this; }

  /**
   * Install the Companion's per-combat trackers BEFORE the first intent is drawn.
   *
   * `data/companions/_util.js` only reached `installTrackers` from `U.ensure()`
   * inside a card effect, so a Companion's counters did not exist until it played
   * something: `loose-bones` was absent on turn one, the HUD gauge had nothing to
   * show, and any Keepsake or status reading a counter before the first card saw
   * nothing. Combat setup is the engine's job, so the engine does it.
   *
   * SYNCHRONOUS on purpose. `startCombat()` returns a Promise, but several
   * harnesses call it without awaiting and rely on the fight being fully set up
   * when it returns. Doing the install behind an `await` moved setup a microtask
   * later and emptied the opening hand for every one of them. The installer is
   * therefore injected ahead of time rather than imported here.
   */
  _installCompanionTrackers() {
    // Every seat's Companion, installed AS that seat. A party of Marmalade +
    // Bones needs both sets of trackers or the second Kid's counters do not
    // exist and every card that reads one silently does nothing; two
    // Marmalades need two independent Lives tracks, which is what installing
    // per seat (rather than per slug) gets us.
    const jobs = [];
    for (const pl of this.players) {
      if (pl.companion && pl.companion !== 'neutral') jobs.push([pl.companion, pl]);
    }
    for (const s of (this._cfg.companions || [])) jobs.push([s, this.players[0]]);
    const slugs = [...new Set(jobs.map(j => j[0]))];
    if (!jobs.length) return;

    const install = this._trackerInstaller || TRACKER_INSTALLER;
    if (typeof install !== 'function') {
      // Loud, not silent: a Companion with no trackers is a broken fight.
      console.warn(
        `[combat] no tracker installer for "${slugs.join(', ')}" — Companion counters `
        + 'will not exist. Call `await loadContentRegistries(engine)` (data/keywords.js) '
        + 'or `engine.setTrackerInstaller(installTrackers)` before startCombat().');
      return;
    }
    for (const [slug, seat] of jobs) {
      try { this._asSeat(seat, () => install(this, slug, seat)); }
      catch (err) { console.error(`[combat] installing trackers for "${slug}" threw`, err); }
    }
    this.trackersInstalled = slugs.slice();
  }

  /**
   * @returns {Promise<void>}
   * The body runs to completion synchronously — callers that do not await it
   * still get a fully started fight.
   */
  async startCombat() { this._startCombat(); }

  _startCombat() {
    if (this.started) return [];
    return this._capture(() => {
      this.started = true;
      this.phase = 'setup';
      this._installCompanionTrackers();
      this._emit(EV.COMBAT_START, {
        seed: this.seed, playerId: this.players[0].id,
        seats: this.players.map(pl => ({ id: pl.id, seat: pl.seat, name: pl.name, companion: pl.companion })),
        partySize: this.players.length,
        enemies: this.enemies.map(e => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, slot: e.slot, tier: e.tier })),
      });

      this.hooks.dispatch('onCombatStart', {});

      // shuffle, then lift Innate cards to the top in deck order
      // Each seat shuffles its OWN deck, in seat order, off the one shared RNG.
      // Seat order matters for determinism: the same seed must deal the same
      // opening hands to the same Kids, or a replay of a co-op fight diverges
      // on the first card.
      for (const pl of this.players) {
        const q = pl.piles;
        q.draw = this.rng.shuffle(q.draw);
        const innate = q.draw.filter(c => c.innate);
        if (innate.length) q.draw = innate.concat(q.draw.filter(c => !c.innate));
        this._emit(EV.SHUFFLE, {
          into: Pile.DRAW, from: 'deck', count: q.draw.length, actorId: pl.id, seat: pl.seat,
          order: q.draw.map(c => c.uid), reason: 'combatStart',
        });
      }

      for (const en of this.enemies) {
        if (en.def) this.enemyDefs.set(en.def.id, en.def);
        try { en.def?.onSpawn?.(this.enemyCtx(en, null)); } catch (err) { console.error(err); }
      }
      this._enemyLifecycle('onCombatStart');
      for (const en of this.enemies) {
        if (en.alive) chooseMove(this, en, 'combatStart');
      }

      this._beginPlayerTurn();
    });
  }

  _beginPlayerTurn() {
    if (this.over) return;
    this.turn++;
    this.phase = 'player';
    // Turn rollover changes `turn`, `phase`, every per-turn stat and every
    // turn-scoped card cost, none of which go through _emit. Invalidate here so
    // a `turn:start` listener reading `engine.state.turn` cannot see last turn's
    // number. (The HUD's Turn chip sat a whole turn behind on this.)
    this._invalidate();
    this.stats.turnsTaken = this.turn;
    this.stats.cardsPlayedThisTurn = 0;
    this.stats.attacksPlayedThisTurn = 0;
    this.stats.skillsPlayedThisTurn = 0;
    this.stats.cardsDiscardedThisTurn = 0;
    this.stats.cardsExhaustedThisTurn = 0;
    this.stats.damageDealtThisTurn = 0;
    this.stats.damageTakenThisTurn = 0;
    this.playedThisTurn = [];
    // Every seat's OWN copy of the same counters. `this.stats` above is the
    // TEAM mirror and stays team-wide because several enemies want the table
    // ("all team damage during the round contributes"); a Kid's own Tricks,
    // Keepsakes and House Rules read their seat instead. See actor.js
    // newTurnStats().
    for (const pl of this.players) {
      const st = pl.stats;
      st.cardsPlayedThisTurn = 0;
      st.attacksPlayedThisTurn = 0;
      st.skillsPlayedThisTurn = 0;
      st.cardsDiscardedThisTurn = 0;
      st.cardsExhaustedThisTurn = 0;
      st.damageDealtThisTurn = 0;
      st.damageTakenThisTurn = 0;
      pl.playedThisTurn = [];
    }
    // `damageTakenThisTurn` resets HERE and only here, for every actor. It then
    // accumulates through the player turn and is STILL READABLE during the enemy
    // turn that follows — several enemies key their whole design off
    // "was I hit last turn?". (data/enemies/_lib.js dmgTaken / wasHit.)
    // Nobody has ended the new turn yet.
    for (const pl of this.players) pl.ended = false;
    // The fresh-status reprieve is worth exactly one decay. Clearing it at the
    // top of every turn means a stack that somehow escaped its bucket cannot
    // ride the reprieve forever.
    for (const a of [...this.players, ...this.enemies, ...this.allies]) a.freshStatuses.clear();
    for (const a of [...this.players, ...this.enemies, ...this.allies]) {
      a.damageTakenLastTurn = a.damageTakenThisTurn;
      a.damageTakenThisTurn = 0;
      a.hitsTakenThisTurn = 0;
      a.unblockedHitsThisTurn = 0;
    }

    // turn-scoped card cost changes expire, in every seat
    for (const pl of this.players) {
      for (const c of pl.piles.all()) { c.costTurnDelta = 0; c.costOverrideTurn = null; }
    }
    this._invalidate();

    this._emit(EV.PHASE, { phase: 'player', turn: this.turn });
    this._emit(EV.TURN_START, {
      actor: 'player', actorId: this.players[0].id, turn: this.turn, side: 'player',
      seats: this.livingPlayers().map(pl => ({ id: pl.id, seat: pl.seat })),
    });

    // 2/3 — every seat wipes Guard and ticks its start-of-turn statuses BEFORE
    //        any seat draws. Interleaving them would let one Kid's Dread tick
    //        land between another Kid's Guard wipe and their draw, which is
    //        visible: a teammate would watch their Guard vanish mid-draw.
    for (const pl of this.livingPlayers()) this._openSeatTurn(pl);
    if (this.over) return;

    // 4 — countdowns (shared: the board has one clock, not one per seat)
    this._tickTimers('playerTurnStart');
    for (const c of this.counters.values()) if (c.resetEachTurn) this.setCounter(c.id, c.min, 'turnStart', c.ownerId);

    this._enemyLifecycle('onPlayerTurnStart');
    if (this.over) return;

    // 5/6 — draw and Nerve, per seat, after every start-of-turn effect has run
    for (const pl of this.livingPlayers()) this._dealSeatTurn(pl);

    /* 6b — the turn is now actually OPEN, and this is the only point at which
       that is true. `turn:start` fires at step 1, before `_openSeatTurn` wipes
       Guard and before `_dealSeatTurn` SETS Nerve and deals the hand, so
       anything granted from it is erased seconds later — the bug that killed
       five Truffle cards and Drizzle's Silver Lining. A `playerTurnStart` timer
       lands after the wipe but still before the deal, which is wrong for
       anything that has to see the opening hand: Brambleboo's Moonflower is
       specified as "at the start of your turn AFTER your normal draw", and
       sculpting the top of the deck before drawing five would just hand the
       card straight back.
       Emitted as a PHASE value rather than a new event so existing listeners,
       which all test for 'player' or 'enemy' specifically, fall through it. */
    this._emit(EV.PHASE, { phase: 'playerReady', turn: this.turn });

    /**
     * 6c — the enemy-side twin of 6b, and it exists for the same reason.
     *
     * `onPlayerTurnStart` fires at step 4, BEFORE the hand is dealt, so an
     * enemy that has to look at the opening hand sees an empty one. The
     * Namekeeper is exactly that enemy: §7 of the Heart chapter says it
     * "chooses one Trick in the player's hand", and driven against the real
     * engine from `onPlayerTurnStart` it named nothing, ever, because there was
     * nothing there yet. From the enemy phase it is worse — the hand has been
     * discarded by then.
     *
     * So this is the one moment an enemy can read the hand the player is about
     * to play with. It fires after the deal and before intents are drawn, which
     * also means anything armed here is already in the number the player reads.
     */
    this._enemyLifecycle('onPlayerReady');
    if (this.over) return;

    // 7 — intents
    this.refreshIntents('turnStart');
  }

  /** One seat's turn opening: draw penalty, Guard wipe, start-of-turn statuses. */
  _openSeatTurn(pl) {
    this._asSeat(pl, () => {
      // Draw penalties are measured BEFORE the start-of-turn decay, so a status
      // that says "draw N fewer next turn" and expires at turn start still bites
      // on the turn it was aimed at. (Smothered, and any StatusDef.drawDelta.)
      pl._drawPenalty = 0;
      pl._energyPenalty = 0;
      for (const [id, stacks] of pl.statuses) {
        const d = getStatus(id);
        const per = d.drawDelta ?? (id === 'smothered' ? -1 : 0);
        if (per) pl._drawPenalty += per * stacks;
        /* `energyDelta` is drawDelta's twin, and it has to be measured HERE for
           the same reason: the Nerve refill happens in `_dealSeatTurn`, several
           steps later, and it SETS Nerve to the maximum. A status that spends
           Nerve from an onTurnStart hook is silently overwritten a moment
           afterwards — which is exactly what Crumbula's Queasy did. */
        if (d.energyDelta) pl._energyPenalty += d.energyDelta * stacks;
      }

      const keep = Math.min(pl.keepBlock, pl.block);
      if (pl.block > keep) {
        const before = pl.block;
        pl.block = keep;
        this._emit(EV.BLOCK_LOSE, { actorId: pl.id, seat: pl.seat, before, after: keep, reason: 'turnStart' });
      }
      pl.keepBlock = 0;

      this._tickStatuses(pl, 'turnStart');
    });
  }

  /**
   * One seat's draw and Nerve refill.
   *
   * `drawDeltaNextTurn` is engine-wide and one-shot, so it is consumed by the
   * FIRST seat dealt and not handed to the rest — "draw 2 more next turn" is a
   * promise to the Kid who earned it, not to the whole table.
   */
  _dealSeatTurn(pl) {
    this._asSeat(pl, () => {
      let want = pl.drawPerTurn + this.drawDeltaNextTurn;
      this.drawDeltaNextTurn = 0;
      const pen = pl._drawPenalty || 0;
      if (pen < 0) want = Math.max(3, want + pen);
      pl._drawPenalty = 0;
      this.drawCards(Math.max(0, want), 'turnStart');
      const epen = pl._energyPenalty || 0;
      pl._energyPenalty = 0;
      /* Nerve BANKED for this turn by a card played earlier ("gain 1 Nerve at
         the start of your next turn"). It has to be added to the refill itself,
         for the same reason `energyDelta` does (trap 21): this line SETS Nerve,
         so anything granted beforehand — by a `turn:start` listener, by an
         `onTurnStart` hook, or by a scheduled `playerTurnStart` timer — is
         erased a moment later. Five shipped Truffle cards banked Nerve that way
         and none of them ever delivered it.
         Per SEAT, on `flags` so it survives `Player.clone()`, unlike the
         engine-wide `drawDeltaNextTurn` above, which in a party is consumed by
         whichever seat happens to be dealt first. */
      const bank = pl.flags.energyNextTurn || 0;
      pl.flags.energyNextTurn = 0;
      this.setEnergy(Math.max(0, pl.energyMax + epen + bank), 'turnStart');
    });
  }

  /**
   * Statuses tick for `actor`.
   * phase 'turnStart': onTurnStart hooks (Dread), then 'turnStart' decay.
   * phase 'turnEnd':   onTurnEnd hooks (Regen), then 'turnEnd' decay.
   */
  _tickStatuses(actor, phase) {
    const hookName = phase === 'turnStart' ? 'onTurnStart' : 'onTurnEnd';
    this.hooks.dispatch(hookName, { actor, turn: this.turn, side: actor.side },
      this.hooks.actorHooks(actor, hookName));
    if (!actor.alive) return;
    this._decayBucket(actor, phase);
  }

  /**
   * Drop one stack from every status whose `decay` bucket matches.
   * Buckets: 'turnStart' | 'turnEnd' | 'enemyTurnEnd' | 'never' | 'combat'.
   */
  _decayBucket(actor, bucket) {
    for (const [id, stacks] of [...actor.statuses]) {
      if (stacks <= 0) continue;
      const def = getStatus(id);
      if (def.decay !== bucket) continue;
      // Applied moments ago by this same end-of-turn step (a Curse in your hand
      // handing you Weak). It has not been felt for a turn yet, so it does not
      // spend one — otherwise the card's printed rule is inert by one tick.
      if (actor.freshStatuses.delete(id)) continue;
      const all = def.decayAll || def.expiresFully;
      this.applyStatus(actor, id, all ? -stacks : -1, { reason: 'decay', ignoreCharm: true });
    }
  }

  /** @returns {{ok:boolean, reason:string}} */
  canPlay(cardUid, targetId = null) {
    if (this.over) return { ok: false, reason: 'Combat is over.' };
    if (this.phase !== 'player') return { ok: false, reason: 'Not your turn.' };
    const card = this.card(cardUid);
    if (!card) return { ok: false, reason: 'No such Trick.' };
    if (card.pile !== Pile.HAND && card.pile !== Pile.STASH) return { ok: false, reason: 'That Trick is not in your hand.' };
    if (card.unplayable) return { ok: false, reason: 'This Trick cannot be played.' };

    // Every check below is about the seat HOLDING the card, not seat 0 — a
    // teammate's Entangle must not stop you playing an Attack, and your Nerve
    // is yours.
    const who = this.seatOfCard(card) || this.current;
    if (who.fallen) return { ok: false, reason: `${who.name} has fallen.` };
    if (who.ended) return { ok: false, reason: 'You have already ended your turn.' };

    if (card.type === CardType.ATTACK && who.hasStatus('entangle')) {
      return { ok: false, reason: 'Entangled — you cannot play Attacks this turn.' };
    }

    const cost = this.costOf(card);
    const need = cost === -1 ? 0 : cost;
    if (who.energy < need) return { ok: false, reason: `Not enough Nerve (needs ${need}).` };

    if (card.target === Target.ENEMY) {
      const t = this.actor(targetId);
      if (targetId !== null && (!t || !t.alive || t.side === 'player')) return { ok: false, reason: 'Choose a target.' };
      if (targetId === null && this.targetableEnemies(card).length === 0) return { ok: false, reason: 'Nothing to target.' };
      // StatusDef.untargetableBy: ['attack'] — the Hidden shape.
      if (t && !this.isTargetable(t, card)) return { ok: false, reason: `${t.name} cannot be targeted by that.` };
    }
    if (card.target === Target.ALL_ENEMIES && this.livingEnemies().length === 0) {
      return { ok: false, reason: 'Nothing to target.' };
    }

    if (typeof card.def.playable === 'function') {
      const t = this.actor(targetId) || this.firstLivingEnemy();
      if (!card.def.playable(this.ctxFor(card, t))) return { ok: false, reason: card.def.playableReason || 'Conditions are not met.' };
    }

    // `veto` rather than `any`: a refuser that returns a string gets to print
    // it. Lost Mitten knows exactly why it is saying no, and a card greyed out
    // with no reason is the same silence CONTRACTS rule 8 is about.
    const veto = this.hooks.veto('vetoPlay', { card }, this.hooks.actorHooks(who, 'vetoPlay'));
    if (veto) {
      return { ok: false, reason: typeof veto === 'string' ? veto : 'Something is stopping you.' };
    }
    return { ok: true, reason: '' };
  }

  /** @returns {Promise<Event[]>} */
  async playCard(cardUid, targetId = null, opts = {}) {
    const r = this._playCard(cardUid, targetId, opts);
    if (r.pending) { await r.pending; }
    return r.events;
  }

  /**
   * Synchronous core so preview.js can replay it exactly. Returns
   * `{ events, pending }` — `pending` is only set when a card effect returned
   * a promise (discouraged; such a card cannot be fully previewed).
   */
  _playCard(cardUid, targetId = null, opts = {}) {
    const check = this.canPlay(cardUid, targetId);
    if (!check.ok) {
      const events = this._capture(() => this._emit(EV.CARD_INVALID, { cardUid, targetId, reason: check.reason }));
      return { events, pending: null };
    }
    const card = this.card(cardUid);
    const target = this.actor(targetId) || (card.target === Target.ENEMY ? this.firstLivingEnemy() : null);

    // The whole resolution runs AS the seat holding the card, so every helper
    // it reaches — costOf, gainEnergy, the piles, ctxFor's `self` — answers for
    // the right Kid without any of them taking a seat argument.
    const owner = this.seatOfCard(card) || this.current;

    let pending = null;
    const events = this._capture(() => this._asSeat(owner, () => {
      const cost = this.costOf(card);
      const x = cost === -1 ? owner.energy : 0;
      const spend = cost === -1 ? owner.energy : cost;
      const energyBefore = owner.energy;

      // 1. leave the hand immediately so effects that look at the hand are right.
      //    `_playedFrom` is kept because by the time an effect runs the card is
      //    already in LIMBO, so "can only be played from the Shadow Pocket" and
      //    every Ambush clause have no other way to ask. `canPlay` accepts HAND
      //    and STASH, so this is HAND or STASH in practice.
      card._playedFrom = this.current.piles._pull(card) || Pile.HAND;
      this.current.piles._push(card, Pile.LIMBO, 'bottom');

      // 2. pay
      if (spend > 0) this.gainEnergy(-spend, 'play');

      // 3. announce
      const rec = { id: card.id, type: card.type, uid: card.uid, name: card.name, seat: owner.seat };
      this.stats.cardsPlayedThisTurn++;
      this.stats.cardsPlayedThisCombat++;
      this.playedThisTurn.push(rec);
      owner.stats.cardsPlayedThisTurn++;
      owner.stats.cardsPlayedThisCombat++;
      owner.playedThisTurn.push({ ...rec });
      if (card.type === CardType.ATTACK) { this.stats.attacksPlayedThisTurn++; owner.stats.attacksPlayedThisTurn++; }
      if (card.type === CardType.SKILL) { this.stats.skillsPlayedThisTurn++; owner.stats.skillsPlayedThisTurn++; }
      this._emit(EV.CARD_PLAY, {
        cardUid: card.uid, card: this.cardSnap(card, targetId), targetId: target ? target.id : null,
        cost: spend, energyBefore, energyAfter: owner.energy,
        actorId: owner.id, seat: owner.seat,
        cardsPlayedThisTurn: this.stats.cardsPlayedThisTurn,
      });

      // 4. resolve
      const ctx = this.ctxFor(card, target, x);
      ctx.exhaustSelf = () => { card._exhaustAfterPlay = true; };
      let ret = null;
      if (typeof card.def.effect !== 'function') {
        // Not `effect?.()`. A Trick with no effect is a content bug and must be
        // loud — CONTRACTS.md rule 8.
        console.error(`[combat] card ${card.id} has no effect() — it will do nothing`);
      } else {
        try { ret = card.def.effect(ctx); }
        catch (err) { console.error(`[combat] card ${card.id} effect threw`, err); }
      }

      const finish = () => {
        this.hooks.dispatch('onCardPlayed', { card, target, index: this.stats.cardsPlayedThisTurn });
        if (card.type === CardType.ATTACK) {
          this.hooks.dispatch('onAttackDealt', { card, target }, this.hooks.actorHooks(owner, 'onAttackDealt'));
        }
        // `by` and `aimAt` name the Kid who played it. An enemy that REACTS to
        // a card — Unwelcome Guest's Familiarity is the whole enemy — has to
        // react at that Kid, not at whoever it happened to be facing.
        const cardInfo = { card: { id: card.id, type: card.type, uid: card.uid }, playedCard: card, by: owner, aimAt: owner };
        this._enemyLifecycle('onPlayerCard', cardInfo);
        this._enemyLifecycle('onCardPlayed', cardInfo);
        this._checkRules('cardPlayed', { card, seat: owner });
        if (card.type === CardType.POWER) {
          // Powers leave play entirely once resolved. They are parked in limbo
          // tagged `meta.zone='power'` rather than in exhaust, so effects that
          // count Vanished Tricks do not silently count every Power too.
          this.current.piles._pull(card);
          card.meta.zone = 'power';
          this.current.piles._push(card, Pile.LIMBO, 'bottom');
          this._emit(EV.CARD_RESOLVED, { cardUid: card.uid, card: this.cardSnap(card), destination: 'power' });
        } else if (this.current.piles.pileOf(card) === Pile.LIMBO) {
          const toExhaust = card.exhaust || card._exhaustAfterPlay || opts.exhaust;
          this.current.piles._pull(card);
          if (toExhaust) {
            this.current.piles._push(card, Pile.EXHAUST, 'bottom');
            this.stats.cardsExhaustedThisTurn++;
            this.stats.cardsExhaustedThisCombat++;
            owner.stats.cardsExhaustedThisTurn++;
            owner.stats.cardsExhaustedThisCombat++;
            this._emit(EV.EXHAUST, {
              cardUid: card.uid, card: this.cardSnap(card), from: Pile.LIMBO,
              reason: 'played', exhaustCount: this.current.piles.exhaust.length,
            });
            this.hooks.dispatch('onCardExhausted', { card, reason: 'played' });
          } else {
            this.current.piles._push(card, Pile.DISCARD, 'bottom');
            this._emit(EV.DISCARD, {
              cardUid: card.uid, card: this.cardSnap(card), from: Pile.LIMBO, to: Pile.DISCARD,
              reason: 'played', handSize: this.current.piles.hand.length, discardCount: this.current.piles.discard.length,
            });
          }
          this._emit(EV.CARD_RESOLVED, { cardUid: card.uid, card: this.cardSnap(card), destination: card.pile });
        } else {
          // an effect moved the card somewhere itself (Stash, draw pile, hand)
          this._emit(EV.CARD_RESOLVED, { cardUid: card.uid, card: this.cardSnap(card), destination: this.current.piles.pileOf(card) });
        }
        card._exhaustAfterPlay = false;
        this.refreshIntents('cardPlayed');
        if (!this.over && this.livingEnemies().length === 0) this._endCombat(true);
      };

      if (ret && typeof ret.then === 'function') {
        // The deferred half has to resolve as the SAME seat. Without the
        // _asSeat here the finish would run with whatever seat happened to be
        // acting when the promise settled, which in a party is nobody.
        pending = ret.then(() => this._capture(() => this._asSeat(owner, finish)));
      } else {
        finish();
      }
    }));
    return { events, pending };
  }

  /* ══ Snacks ════════════════════════════════════════════════════════════
   * A Snack (potion) is a rules effect, so it resolves here and not in the
   * scene — CONTRACTS.md non-negotiable #5. The scene asks, the engine decides,
   * the renderer animates the events.
   *
   * The engine does NOT own the inventory. `useSnack` resolves ONE Snack def;
   * removing it from `run.snacks` is `Run.useSnack(index)`'s job. Consume it on
   * your side the moment `canUseSnack` returns ok — a Snack is spent when eaten,
   * win or lose.
   *
   * SnackDef.effect fields (state/run.js SNACKS):
   *   heal, block, energy, cleanse, damageAll, status:[id,n], target:'enemy'
   *
   * ── RESOLUTION ORDER ──────────────────────────────────────────────────────
   *   1. validate (`canUseSnack`)
   *   2. resolve the target — if `target:'enemy'` and none was passed, ask
   *      through the ordinary choice broker, so the scene's picker handles it
   *   3. `modifySnackPotency` reducers per numeric field (Sacred-Bark shape)
   *   4. emit `snack:used` BEFORE anything lands, carrying the final numbers
   *   5. heal → block → energy → cleanse → damageAll → status
   *   6. `onSnackUsed` hooks
   *   7. death / combat-end check, then intents refresh
   */

  /** @returns {{ok:boolean, reason:string}} */
  canUseSnack(snack, targetId = null) {
    if (!snack || !snack.effect) return { ok: false, reason: 'That is not a Snack.' };
    if (this.over) return { ok: false, reason: 'The Scuffle is over.' };
    if (this.phase !== 'player') return { ok: false, reason: 'Wait for your turn.' };
    if (snack.effect.target === 'enemy') {
      if (this.livingEnemies().length === 0) return { ok: false, reason: 'Nothing to aim it at.' };
      if (targetId !== null) {
        const t = this.actor(targetId);
        if (!t || !t.alive || t.side === 'player') return { ok: false, reason: 'Choose a target.' };
      }
    }
    return { ok: true, reason: '' };
  }

  /** The numbers a Snack would actually apply, after every relic modifier. */
  snackPotency(snack) {
    const fx = snack.effect || {};
    const provs = (f) => this.hooks.actorHooks(this.current, 'modifySnackPotency');
    const scale = (field, v) => Math.max(0, Math.round(
      this.hooks.reduce('modifySnackPotency', v, { snack, field }, provs(field))));
    const out = {};
    if (fx.heal) out.heal = scale('heal', fx.heal);
    if (fx.block) out.block = scale('block', fx.block);
    if (fx.energy) out.energy = scale('energy', fx.energy);
    if (fx.damageAll) out.damageAll = scale('damageAll', fx.damageAll);
    if (fx.cleanse) out.cleanse = true;
    if (Array.isArray(fx.status)) out.status = [fx.status[0], scale('status', fx.status[1])];
    return out;
  }

  /**
   * Eat a Snack — or throw one to a teammate.
   *
   * Slay the Spire 2 co-op lets a potion be drunk OR thrown to another player,
   * and that is the whole difference here: `opts.to` names the seat it lands
   * on. Left out, it lands on whoever reached into the Backpack, which is what
   * solo has always done.
   *
   * @param {Object} snack   a SnackDef ({ id, name, desc, effect })
   * @param {string|null} targetId  the ENEMY a damaging Snack is aimed at
   * @param {{to?: import('./actor.js').Player}} [opts]  `to` = the seat it is thrown to
   * @returns {Promise<Event[]>}
   */
  async useSnack(snack, targetId = null, opts = {}) {
    const check = this.canUseSnack(snack, targetId);
    if (!check.ok) {
      return this._capture(() => this._emit(EV.CARD_INVALID, {
        cardUid: null, snackId: snack && snack.id, targetId, reason: check.reason,
      }));
    }
    const fx = snack.effect;

    // 2 — one target question, asked before anything is consumed.
    let target = this.actor(targetId);
    if (fx.target === 'enemy' && !target) {
      const living = this.livingEnemies();
      if (living.length === 1) target = living[0];
      else {
        const picked = await this.choices.ask({
          kind: 'enemy', pool: living, count: 1, optional: true,
          prompt: `Who gets the ${snack.name}?`,
          meta: { cardId: snack.id },
        });
        if (!picked.length) return [];                 // cancelled — nothing spent
        target = living[picked[0]];
        if (!target || !target.alive) return [];
      }
    }

    const potency = this.snackPotency(snack);
    // A thrown Snack lands on a TEAMMATE: `opts.to` names the seat it is
    // thrown at, and defaults to whoever reached into the Backpack.
    const me = opts.to || this.current;

    return this._capture(() => {
      this._emit(EV.SNACK, {
        snackId: snack.id, name: snack.name, desc: snack.desc || '',
        targetId: target ? target.id : null, effect: { ...fx }, potency: { ...potency },
      });

      const results = {};
      if (potency.heal) results.healed = this.heal(me, potency.heal, 'snack');
      if (potency.block) results.blocked = this.gainBlock(me, potency.block, { source: 'snack', fromCard: false, reason: 'snack' });
      if (potency.energy) results.energy = this.gainEnergy(potency.energy, 'snack');
      if (potency.cleanse) this.cleanse(me, 'snack');
      if (potency.damageAll) {
        results.hit = 0;
        for (const en of this.livingEnemies()) {
          this.dealDamage({ attacker: me, defender: en, amount: potency.damageAll, kind: 'attack', cause: snack.name });
          results.hit++;
        }
      }
      if (potency.status) {
        const [id, n] = potency.status;
        this.applyStatus(target || me, id, n, { reason: 'snack', snack: snack.id });
      }

      this.hooks.dispatch('onSnackUsed', {
        snack, snackId: snack.id, target: target || null, potency, results,
      });

      this.refreshIntents('snack');
      if (!this.over && this.livingEnemies().length === 0) this._endCombat(true);
    });
  }

  /**
   * End a turn.
   *
   * SIMULTANEOUS TURNS. Every seat plans in the same window and each one ends
   * its OWN turn; the enemy phase waits until the last living seat has ended.
   * That is the Slay the Spire 2 shape and it is why this takes a seat: a Kid
   * who is done should be able to stop without freezing the table, and a Kid
   * still thinking must not have their hand discarded out from under them.
   *
   * Solo passes nothing and behaves exactly as it always has.
   *
   * @param {Player|string|null} [who] the seat ending its turn; omit for solo,
   *   or to end the turn for the whole table (the host's "everyone is ready").
   * @returns {Promise<Event[]>}
   */
  async endTurn(who = null) { return this._endTurn(who); }

  /** True once every living seat has ended its turn. */
  get tableReady() { return this.livingPlayers().every(pl => pl.ended); }

  /** Accept a Player, an actor id, or a seat index. */
  _resolveSeat(who) {
    if (who == null) return null;
    if (who.side === 'player') return who;
    if (typeof who === 'number') return this.seat(who);
    const a = this.actor(who);
    return (a && a.side === 'player') ? a : null;
  }

  /**
   * One seat stops acting: its hand resolves and it is marked ready.
   * Statuses do NOT tick here — those run once the whole table is ready, so a
   * teammate's Regen cannot heal before another Kid has finished playing.
   */
  _closeSeatHand(pl) {
    pl.ended = true;
    this._emit(EV.TURN_END, {
      actor: 'player', actorId: pl.id, seat: pl.seat, turn: this.turn, side: 'player',
      seats: this.livingPlayers().map(x => ({ id: x.id, seat: x.seat, ended: !!x.ended })),
    });
    this._asSeat(pl, () => {
      /* ── cards that DO something while they sit in your hand ─────────────
       * "At the end of your turn, lose 2 Courage" is printed on Candle Burn,
       * Heavy Heart, Regret, Bad Luck and Clingy Shadow, and none of it used to
       * happen: a card's `effect` runs at exactly one place in this file,
       * inside `_playCard`, behind a `canPlay` that refuses every `unplayable`
       * card. `handHooks` (combat/hooks.js) is where that behaviour lives.
       *
       * IT HAS TO BE HERE AND NOT IN THE onTurnEnd TICK. That tick is step 3 of
       * `_endTurn`; this method is step 1, and by step 3 the loop below has
       * emptied the hand — so a card asking "am I still held?" would always
       * hear no. `over` is re-checked because one of these can be lethal. */
      this.hooks.dispatch('onHeldTurnEnd', { actor: pl, turn: this.turn, side: 'player' },
        this.hooks.handHooks(pl, 'onHeldTurnEnd'));
      if (this.over) return;
      for (const card of [...pl.piles.hand]) {
        if (card.ethereal) { this.exhaustCard(card, 'ethereal'); continue; }
        /**
          * KEEPING a card is an event. It was not one until 2026-08-30, and
          * the consequence was a cue in the bank that nothing could ever
          * play: `tests/audio/cues.py` listed `card:retain` as unreachable
          * with the reason "no `retain` event is emitted... wiring it means
          * adding the event." The feature was fully built; only the moment
          * was missing, which is the thin end of CONTRACTS 54 — a thing that
          * happens with nothing published looks exactly like a thing that
          * does not happen.
          *
          * `reason` separates the two kinds, because they are different
          * promises: `retain` is printed on the card and holds every turn,
          * `retainThisTurn` was granted by an effect and is being spent right
          * here. Read the flag BEFORE clearing it or every retain reports as
          * the permanent kind.
          */
         const why = card.retain ? 'retain' : 'retainThisTurn';
         if (card.retain || card.retainThisTurn) {
           card.retainThisTurn = false;
           this._emit(EV.CARD_RETAIN, {
             cardUid: card.uid, card: this.cardSnap(card), reason: why,
             handSize: this.current.piles.hand.length,
           });
           continue;
         }
        this.discardCard(card, 'endTurn');
      }
    });
  }

  _endTurn(who = null) {
    if (this.over || this.phase !== 'player') return [];
    return this._capture(() => {
      const seat = this._resolveSeat(who);

      // 1 + 2 — close whoever is ending. With no seat named, the whole table
      //         ends at once, which is both the solo path and the host's
      //         "everyone is ready" button.
      if (seat) {
        if (seat.ended || seat.fallen) return;
        this._closeSeatHand(seat);
        if (!this.tableReady) return;            // still waiting on a teammate
      } else {
        for (const pl of this.livingPlayers()) if (!pl.ended) this._closeSeatHand(pl);
      }

      // 3 — end-of-turn statuses, per seat (Regen heals each Kid its own amount)
      this._checkRules('turnEnd');
      for (const pl of this.livingPlayers()) this._tickStatuses(pl, 'turnEnd');
      this._enemyLifecycle('onPlayerTurnEnd');
      if (this.over) return;

      // 4 — timers
      this._tickTimers('playerTurnEnd');
      if (this.over) return;

      // 5 — enemy actions, slot order
      this.phase = 'enemy';
      this._invalidate();
      this._emit(EV.PHASE, { phase: 'enemy', turn: this.turn });
      // Summed across the party: `damageTakenLastEnemyTurn` is a board-level
      // stat that House Rules and several enemies key off ("did the party get
      // through that untouched?"), so in co-op it has to mean the whole table.
      const beforeSeat = this.players.map(pl => pl.damageTakenThisTurn);
      const before = beforeSeat.reduce((n, x) => n + x, 0);

      for (const en of [...this.enemies]) {
        if (this.over) break;
        if (!en.alive) continue;
        en.turnsAlive++;
        this._emit(EV.TURN_START, { actor: en.id, actorId: en.id, turn: this.turn, side: 'enemy' });

        if (en.block > 0) {
          const b = en.block;
          en.block = 0;
          this._emit(EV.BLOCK_LOSE, { actorId: en.id, before: b, after: 0, reason: 'turnStart' });
        }
        // NOTE: damageTakenThisTurn is deliberately NOT reset here — it must
        // survive into this enemy turn so "was I hit last turn?" works.
        if (en.def?.onTurnStart) { try { en.def.onTurnStart(this.enemyCtx(en, null)); } catch (err) { console.error(err); } }
        this._tickStatuses(en, 'turnStart');
        if (!en.alive || this.over) { if (en.alive) this._emit(EV.TURN_END, { actor: en.id, actorId: en.id, turn: this.turn, side: 'enemy' }); continue; }

        const move = en.pendingMove;
        if (move) {
          en.history.push(move.id);
          try { move.effect?.(this.enemyCtx(en, move)); }
          catch (err) { console.error(`[combat] enemy ${en.defId} move ${move.id} threw`, err); }
          consumePlan(en);
        }
        if (en.def?.onTurnEnd) { try { en.def.onTurnEnd(this.enemyCtx(en, null)); } catch (err) { console.error(err); } }
        this._emit(EV.TURN_END, { actor: en.id, actorId: en.id, turn: this.turn, side: 'enemy' });
      }

      this.stats.damageTakenLastEnemyTurn =
        this.players.reduce((n, pl) => n + pl.damageTakenThisTurn, 0) - before;
      // Per seat as well. "Untouched" is a claim about ONE Kid — a teammate
      // taking a hit must not switch off your Untouched cards, which is what
      // the team mirror alone would do.
      this.players.forEach((pl, i) => {
        pl.stats.damageTakenLastEnemyTurn = pl.damageTakenThisTurn - (beforeSeat[i] || 0);
      });
      if (this.over) return;

      // 6a — per-enemy end-of-turn statuses.
      for (const en of [...this.enemies]) {
        if (!en.alive) continue;
        this._tickStatuses(en, 'turnEnd');
      }

      // 6b — the shared `enemyTurnEnd` decay bucket, for EVERY actor. This is
      //      what Marmalade's Ghoststep expires on: gone once the enemies have
      //      finished swinging, used or not.
      for (const pl of this.players) if (pl.alive) this._decayBucket(pl, 'enemyTurnEnd');
      for (const a of this.allies) if (a.alive) this._decayBucket(a, 'enemyTurnEnd');
      for (const en of this.enemies) if (en.alive) this._decayBucket(en, 'enemyTurnEnd');

      // 6c — ENEMY PHASE END. The one point that is after every enemy has acted
      //      and after the decay buckets, but BEFORE intents are redrawn. A
      //      support enemy arms its allies' buffs here so the intent the player
      //      then reads is the true post-buff number. Buffing an ally from
      //      inside a move cannot do that: the ally's intent was already drawn.
      //      Slot order cannot save a summoner, which is always slot 0.
      this.phase = 'enemyPhaseEnd';
      this._invalidate();
      this._emit(EV.PHASE, { phase: 'enemyPhaseEnd', turn: this.turn });
      this.hooks.dispatch('onEnemyPhaseEnd', { turn: this.turn });
      this._enemyLifecycle('onEnemyPhaseEnd', { turn: this.turn });

      this._tickTimers('enemyTurnEnd');
      if (this.over) return;

      // 7 — next intents. Everything armed in 6c is already in force.
      for (const en of this.enemies) if (en.alive) chooseMove(this, en, 'turnEnd');

      // 8
      this._beginPlayerTurn();
    });
  }

  /**
   * Exactly what will happen if this card is played right now.
   * Implemented by replaying the card on a full clone of the engine seeded with
   * the identical RNG state, so it cannot drift from resolution.
   */
  preview(cardUid, targetId = null, opts = undefined) { return previewCard(this, cardUid, targetId, opts); }

  /**
   * The full preview, including everything behind a player choice. Resolves the
   * choice with the deterministic auto-picker and flags the result `uncertain`.
   * Use this for hover previews; `preview()` stays synchronous for the contract.
   */
  previewAsync(cardUid, targetId = null, opts = undefined) { return previewCardAsync(this, cardUid, targetId, opts); }

  /** Post-modifier damage this card would do to this target, per hit. */
  cardDamageFor(cardUid, targetId, key = 'd') {
    const card = this.card(cardUid);
    if (!card) return 0;
    const t = this.actor(targetId) || this.firstLivingEnemy();
    return previewDamageValue(this, this.seatOfCard(card) || this.current, t, card.nums?.[key] ?? 0, { kind: 'attack' });
  }

  // ── cloning (for preview) ─────────────────────────────────────────────────

  snapshotRuntime() {
    return {
      turn: this.turn, phase: this.phase, over: this.over, victory: this.victory,
      started: this.started, seq: this._seq,
      stats: { ...this.stats },
      rng: this.rng.snapshot(),
      // Every seat, each with its own pile set. Solo is a one-element array, so
      // the clone below has no separate single-player path either.
      players: this.players.map(pl => ({
        actor: pl,
        piles: {
          draw: pl.piles.draw, hand: pl.piles.hand, discard: pl.piles.discard,
          exhaust: pl.piles.exhaust, limbo: pl.piles.limbo, stash: pl.piles.stash,
        },
        stashCap: pl.piles.stashCap,
      })),
      enemies: this.enemies,
      allies: this.allies,
      counters: this.counters,
      timers: this.timers,
      objects: this.objects,
      field: this.field,
      rules: this.rules,
      playedThisTurn: this.playedThisTurn,
      drawDeltaNextTurn: this.drawDeltaNextTurn,
      hooks: this.hooks.snapshot(),
      entityUid: this._entityUid, objectUid: this._objectUid, timerUid: this._timerUid,
    };
  }

  /** Deep-ish clone: runtime state copied, definitions shared by reference. */
  clone() {
    const c = new CombatEngine({ ..._cfgLite(this._cfg), _bare: true, rng: new RNG(this.seed), isPreview: true });
    // seats carry their own Keepsakes; copied with the seats below
    const s = this.snapshotRuntime();
    c.localSeat = this.localSeat | 0;
    c.turn = s.turn; c.phase = s.phase; c.over = s.over; c.victory = s.victory;
    c.started = s.started; c._seq = s.seq;
    c.stats = { ...s.stats };
    c.rng = new RNG(this.seed);
    c.rng.restore(s.rng);
    c.enemies = s.enemies.map(e => e.clone());
    c.allies = s.allies.map(e => e.clone());

    const map = new Map();
    const cloneList = (arr, pile) => arr.map(card => {
      const cc = card.clone();
      cc.pile = pile;
      map.set(card.uid, cc);
      return cc;
    });
    // Seats are cloned with their piles attached. `c.players` is assigned
    // directly rather than through `c.player`, which is a getter now — the
    // preview engine is built `_bare`, so it has no seats of its own yet.
    c.players = s.players.map(seat => {
      const pl = seat.actor.clone();
      pl.relics = (seat.actor.relics || []).slice();
      pl.piles = new Piles(c, pl);
      pl.piles.draw = cloneList(seat.piles.draw, Pile.DRAW);
      pl.piles.hand = cloneList(seat.piles.hand, Pile.HAND);
      pl.piles.discard = cloneList(seat.piles.discard, Pile.DISCARD);
      pl.piles.exhaust = cloneList(seat.piles.exhaust, Pile.EXHAUST);
      pl.piles.limbo = cloneList(seat.piles.limbo, Pile.LIMBO);
      pl.piles.stash = cloneList(seat.piles.stash, Pile.STASH);
      pl.piles.stashCap = seat.stashCap;
      return pl;
    });

    c._sharedCounters = new Set(s._sharedCounters);
    c.counters = new Map();
    for (const [k, v] of s.counters) c.counters.set(k, { ...v, states: (v.states || []).map(x => ({ ...x })) });
    c.timers = s.timers.map(t => ({ ...t, data: { ...t.data } }));
    c.objects = s.objects.map(o => ({ ...o, data: JSON.parse(JSON.stringify(o.data || {})) }));
    c.field = JSON.parse(JSON.stringify(s.field));
    // `_firedTurn` is a per-seat map, so a shallow spread would leave the
    // preview and the real fight writing into the SAME object — previewing a
    // card that trips a House Rule would then mark it fired and the real play
    // would silently escape its Reprimand.
    c.rules = s.rules.map(r => ({ ...r, _firedTurn: { ...(r._firedTurn || {}) } }));
    c.playedThisTurn = s.playedThisTurn.map(x => ({ ...x }));
    c.drawDeltaNextTurn = s.drawDeltaNextTurn;
    c.cardDefs = this.cardDefs;
    c.enemyDefs = this.enemyDefs;
    c.ruleDefs = this.ruleDefs;
    c._trackerInstaller = this._trackerInstaller;
    c.choices.autoOnly = true;          // a preview NEVER asks a human a question
    c.choices.resolver = null;
    c.hooks.restore(s.hooks);
    c._entityUid = s.entityUid; c._objectUid = s.objectUid; c._timerUid = s.timerUid;
    c.bus = null;
    return c;
  }
}

/**
 * The companion tracker installer, shared by every engine once something has
 * supplied it. `data/companions/**` is another agent's area and a headless engine
 * must boot without it, so this is injected rather than statically imported.
 */
let TRACKER_INSTALLER = null;
export function setTrackerInstaller(fn) { TRACKER_INSTALLER = fn; }

/**
 * Load `data/companions/_util.js` and register its `installTrackers` for every
 * engine. Called by `loadContentRegistries(engine)`; safe to call repeatedly and
 * safe to call when that file does not exist.
 * @returns {Promise<boolean>}
 */
export async function preloadCompanionTrackers() {
  if (TRACKER_INSTALLER) return true;
  try {
    const m = await import('../data/companions/_util.js');
    if (typeof m.installTrackers === 'function') { TRACKER_INSTALLER = m.installTrackers; return true; }
  } catch (e) {
    console.warn('[combat] companion trackers unavailable', e && e.message);
  }
  return false;
}

/** `no-running` -> `NO RUNNING`. The last-resort name for an unregistered rule. */
export function humanise(id) {
  return String(id || '').replace(/[-_/]+/g, ' ').trim().toUpperCase();
}

/** Normalise `states` entries and drop anything malformed rather than throwing. */
function normaliseStates(states) {
  if (!Array.isArray(states)) return [];
  const out = [];
  for (const s of states) {
    if (!s || !s.label) continue;
    const e = { label: String(s.label) };
    if (typeof s.at === 'number') e.at = s.at;
    if (typeof s.from === 'number') e.from = s.from;
    if (typeof s.to === 'number') e.to = s.to;
    if (e.at === undefined && e.from === undefined && e.to === undefined) continue;
    out.push(e);
  }
  return out;
}

/** First matching band wins. Exact `at` entries should be listed first. */
function stateFor(c, value) {
  for (const s of (c.states || [])) {
    if (s.at !== undefined) { if (value === s.at) return s.label; continue; }
    if (s.from !== undefined && value < s.from) continue;
    if (s.to !== undefined && value > s.to) continue;
    return s.label;
  }
  return null;
}

/** Strip the engine's own bookkeeping keys; whatever remains is content data. */
const STATUS_OPT_KEYS = new Set(['reason', 'sourceId', 'ignoreCharm', 'silentBlock', 'fresh']);
function statusMeta(opts) {
  if (!opts) return null;
  let out = null;
  for (const k of Object.keys(opts)) {
    if (STATUS_OPT_KEYS.has(k)) continue;
    const v = opts[k];
    if (typeof v === 'function') continue;
    (out || (out = {}))[k] = (v && typeof v === 'object' && v.id) ? v.id : v;
  }
  return out;
}

function _cfgLite(cfg) {
  // Strip everything the clone rebuilds itself; keeping cfg.hooks would register
  // every ad-hoc hook twice.
  const { player, players, enemies, deck, hooks, bus, relics, rng, ...rest } = cfg || {};
  return rest;
}

export { EV, intentFamily, buildIntent };
export default CombatEngine;
