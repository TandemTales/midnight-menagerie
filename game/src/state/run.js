/**
 * The Run — the connective tissue.  OWNER: meta-run.
 *
 * Everything between "Begin Expedition" and the Game Over screen lives here:
 * the deck, the resources, the region ladder, which node you are standing on,
 * what a node hands off to, and what a node gives you when you leave it.
 *
 * ── Three rules this file exists to keep ────────────────────────────────────
 *
 * 1. **Deterministic.**  One seed reproduces an entire run.  The master RNG is
 *    never consumed for content; every subsystem asks for its own fork
 *    (`fork('map:foyer')`, `fork('reward:foyer-3-2')`, `fork('shop:foyer-4-1')`).
 *    A fork is derived from the *seed*, not from the stream position, so adding
 *    a shop roll can never shift the map.
 *
 * 2. **Autosaved.**  `save()` runs after every state change; `Run.resume()`
 *    restores mid-map exactly, including deck uids, Keepsake counters, the
 *    walked path, which Curiosities have been seen — and an unfinished fight.
 *    See "Interrupted fights" below: a room is only ever *cleared* when it
 *    resolves, so quitting can never buy you a free room.
 *
 * 3. **Scenes stay dumb.**  A scene asks the run for facts and calls one run
 *    method.  It never decides what a node is, what a reward costs, or where to
 *    go next.  The bus carries `run:enterNode`, `run:combatStart`,
 *    `run:combatEnd`, `run:reward`, `run:end`.
 *
 * ── Public surface ──────────────────────────────────────────────────────────
 *   new Run({ companion, kid, seed, hauntLevel, backpack })
 *   Run.resume(saved)                  from Save.loadRun()
 *   run.snapshot() / run.save()
 *   deck · addCard(def) · removeCard(uid) · upgradeCard(uid) · transformCard(uid)
 *   courage · maxCourage · lostThings · keepsakes · snacks · useSnack(i)
 *   region · regionIndex · map · currentNode · legalNodes() · enterNode(id)
 *   hauntLevel · rescued · cluesFound · depth · wing
 *   rng
 *
 * ── Canonical names, and the aliases ────────────────────────────────────────
 * One name per concept.  The canonical property is the one that is stored and
 * serialised; everything else is a **compatibility getter over the same field**,
 * never a second copy that can drift:
 *
 *   Courage  →  `courage` / `maxCourage`      aliases: `hp`, `maxHp`
 *   money    →  `lostThings`                  alias:   `gold`
 *   relics   →  `keepsakes`                   alias:   `relics`
 *   snacks   →  `snacks`                      alias:   `potions`
 *   region   →  `region`                      alias:   `regionId`
 *
 * Depth is two different numbers and used to be one ambiguous one, which is how
 * the Clubhouse came to print "Deepest floor 5" for a run whose Game Over screen
 * said "REACHED Floor 1":
 *
 *   `wing`   which of the house's 17 wings you are in   (map: "Wing 1 of 17")
 *   `depth`  how many rooms deep you got, all wings     (Game Over / Clubhouse)
 *   `floor`  documented alias of `wing` — map.js and ui/hud.js read it.
 *
 * ── Interrupted fights ──────────────────────────────────────────────────────
 * A room is marked **entered** on the way in and **cleared** only when it
 * resolves (`leaveNode`, `claimReward`, or a won fight).  `visitedIds` is the
 * cleared set, so a run quit mid-Scuffle comes back with the node still
 * standing.  `pendingCombat` carries the seed-relative recipe for the fight plus
 * the player's action log, and `restoreInterruptedCombat()` replays it into the
 * exact board you left — falling back to a fresh instance of the *same*
 * encounter at the Courage you walked in with if the replay cannot be verified.
 * Either way: no reward, no clear, no free Courage.
 */
import { RNG, hashSeed } from '../core/rng.js';
import { Save } from '../core/save.js';
import { bus } from '../core/bus.js';
import { NodeType, REGION_ORDER, TERMS, COMPANIONS, KIDS } from '../data/schema.js';
import { generateRegionMap, legalNextIds, regionMeta, sceneForNode } from './mapgen.js';
import {
  cardById, startingDeckFor, poolFor, companion as companionDef, allCards,
} from '../data/cards.js';
import { encountersFor, rollEncounter, buildEncounter } from '../data/encounters.js';
import {
  makeRelic, relicById, rollKeepsake, rollKeepsakeRarity, relicRunFlags, starterKeepsake,
} from '../data/relics.js';
import {
  defaultLoadout, backpackHooks, backpackRunFlags, backpackTags,
  assertLoadout, migrateLoadout,
} from '../data/backpack.js';
import { rollEvent, eventById, rollOutcome } from '../data/events.js';

/**
 * How many regions one expedition covers in this build.  The full campaign is
 * 17 (REGION_ORDER); the structure below walks the ladder properly, this
 * constant is the only thing holding it to one.
 */
export const RUN_LENGTH_REGIONS = 2;

/**
 * The four Companions who start at the clubhouse and were never in the house.
 * They are therefore never a meaningful Rescue — see `missingCompanions()`.
 *
 * `ui/portrait.js` exports the same list as `STARTER_COMPANIONS` for the
 * Title, Select and Clubhouse screens. It is duplicated rather than imported
 * because `state/run.js` must stay headless (tests/run/index.html imports it
 * with no DOM at all) and portrait.js is a UI kit. `tests/backpack/index.html`
 * asserts the two lists are identical, so they cannot drift in silence.
 */
export const STARTER_SLUGS = new Set(['marmalade', 'bones', 'pipkin', 'taffy']);

/** Courage is topped up to this fraction of max when a new wing opens. See advanceRegion(). */
const REGION_ENTRY_FLOOR = 0.85;

/** Base Lost Things per room type, before Keepsake multipliers. */
const PURSE = {
  [NodeType.SCUFFLE]:   [11, 19],
  [NodeType.BIG_SCARE]: [26, 36],
  [NodeType.BOSS]:      [92, 108],
};

let UID = 0;
const nextUid = () => `c${(++UID).toString(36)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Combat content, pre-warmed.
//
// Building a fight needs four dynamically-imported modules.  That is fine when
// a fight starts from a click, and fatal when a fight has to be rebuilt during
// `run:continue`: the title screen navigates in the same synchronous tick, so a
// rebuild that has to go to the network loses the race and `scenes/combat.js`
// builds a stand-in engine with the wrong deck.
//
// Warming them up front turns the rebuild into a pure microtask chain, which
// always completes before the scene manager's cover transition does.
// ─────────────────────────────────────────────────────────────────────────────
/** @type {{CombatEngine:Function, enemies:Object, statuses:Object, keywords:Object, lib:Object|null}|null} */
let CONTENT = null;
let CONTENT_P = null;

/** Load (once) everything `buildCombat` needs. Safe to call any number of times. */
export function warmCombatContent() {
  if (CONTENT_P) return CONTENT_P;
  CONTENT_P = (async () => {
    const [engineMod, enemiesMod, statusesMod, keywordsMod, libMod] = await Promise.all([
      import('../combat/engine.js'),
      import('../data/enemies/index.js'),
      import('../combat/statuses.js'),
      import('../data/keywords.js'),
      import('../data/enemies/_lib.js').catch(() => null),
    ]);
    if (enemiesMod.ENEMY_STATUSES) statusesMod.registerStatuses(enemiesMod.ENEMY_STATUSES);
    // Global keyword/status registries. Per-engine registration happens in
    // `_buildCombat`, which is why this is called with no engine.
    await keywordsMod.loadContentRegistries(null);
    CONTENT = {
      CombatEngine: engineMod.CombatEngine,
      enemies: enemiesMod,
      statuses: statusesMod,
      keywords: keywordsMod,
      lib: libMod,
    };
    return CONTENT;
  })();
  return CONTENT_P;
}

// ─────────────────────────────────────────────────────────────────────────────

export class Run {
  /**
   * @param {{companion?:string, kid?:string, seed?:number|string,
   *          hauntLevel?:number, backpack?:string[]}} cfg
   */
  constructor(cfg = {}) {
    const companion = cfg.companion || 'marmalade';
    const kid = cfg.kid || 'maya';

    this.version = 1;
    this.seed = Number.isFinite(+cfg.seed) ? (+cfg.seed >>> 0) : (hashSeed(String(cfg.seed ?? Date.now())));
    this.companion = companion;
    this.kid = kid;
    this.hauntLevel = Math.max(0, Number(cfg.hauntLevel ?? cfg.haunt ?? 0) || 0);
    /* The Backpack seam. `cfg.backpack` is `string[]` of ids from
       data/backpack.js — never names, never `{name,slots}` objects. A wrong
       shape here does not throw on its own: it produces an empty tag Set, zeroed
       gear flags, no hooks and permanently locked Curiosity options, which is
       exactly how this pillar of the game sat dead for a whole build. So it is
       asserted at the join instead (CONTRACTS.md rule 8). Old saves come in
       through `Run.resume`, which migrates before it gets here. */
    /* An EMPTY array is honoured, not replaced: the Clubhouse lets you unpack
       the whole bag, and "I brought nothing" is a loadout decision the design
       doc explicitly makes available (§19). Only `null`/absent falls back. */
    this.backpack = cfg.backpack == null
      ? defaultLoadout(kid)
      : assertLoadout(cfg.backpack, `new Run({kid:'${kid}'})`).slice();

    /** The master stream. Content never draws from it directly — see `fork`. */
    this.rng = new RNG(this.seed);

    // ── resources ───────────────────────────────────────────────────────────
    const comp = companionDef(companion);
    this.maxCourage = comp?.startingHp ?? 70;
    this.courage = this.maxCourage;
    this.energyMax = comp?.startingEnergy ?? 3;
    this.lostThings = 99;
    this.snacks = [];
    this.snackCap = 3;

    // ── deck ────────────────────────────────────────────────────────────────
    this.deck = startingDeckFor(companion).map(def => this._instance(def));

    // ── Keepsakes ───────────────────────────────────────────────────────────
    this.keepsakes = [];
    const starter = starterKeepsake(companion);
    if (starter) this.keepsakes.push(starter);

    // ── progression ─────────────────────────────────────────────────────────
    this.regionIndex = 0;
    this.region = REGION_ORDER[0];
    this.rescued = (Save.data?.companionsRescued || []).slice();
    /** Freed on THIS expedition only — see rescueCompanion(). */
    this.companionsFreed = [];
    this.cluesFound = 0;
    this.seenEvents = [];
    this.encounterHistory = [];
    this.removalPrice = 65;          // Mr. Moth's card-removal service
    this.shopsVisited = 0;
    this.pity = 0;                   // rare-card pity counter (STS2 §6 "luck")
    this.startedAt = Date.now();
    this.result = null;              // 'victory' | 'defeat' | null
    this.killedBy = null;

    this.stats = {
      scuffles: 0, bigScares: 0, curiosities: 0, safeRooms: 0, shops: 0,
      treasures: 0, cardsPlayed: 0, damageDealt: 0, turns: 0,
      // `depth` = deepest room reached, counted across every wing. This used to
      // be called `floor`, which collided with the wing number `run.floor`
      // returns, and the two disagreed on every end screen.
      depth: 0,
      cardsTaken: 0, cardsSkipped: 0, clues: 0,
    };

    // ── map ─────────────────────────────────────────────────────────────────
    this.map = null;
    this.currentNodeId = null;
    this.visitedIds = [];
    this.pathIds = [];
    this.pendingReward = null;
    this.pendingEvent = null;
    this.combat = null;
    /** The recipe + action log for a fight that has not resolved yet. */
    this.pendingCombat = null;
    this._ctx = null;
    this._combatOffs = [];
    this._saveTimer = null;

    this._buildMap();
  }

  // ══ identity / derived ═══════════════════════════════════════════════════
  get meta() { return regionMeta(this.region); }

  /* ── depth, in the two senses the screens actually mean ───────────────── */
  /** Which of the house's 17 wings this is. 1-based. */
  get wing() { return this.regionIndex + 1; }
  /** How many rooms deep the expedition got, counted across every wing. */
  get depth() { return this.stats.depth; }

  /* ── documented compatibility aliases (see the header) ────────────────── */
  /** @deprecated alias of `region`. */
  get regionId() { return this.region; }
  /** @deprecated alias of `wing`. `map.js` renders it as "Wing N of 17". */
  get floor() { return this.wing; }
  /** @deprecated alias of `courage`. */
  get hp() { return this.courage; }
  set hp(v) { this.courage = v; }
  /** @deprecated alias of `maxCourage`. */
  get maxHp() { return this.maxCourage; }
  set maxHp(v) { this.maxCourage = v; }
  /** @deprecated alias of `lostThings`. */
  get gold() { return this.lostThings; }
  set gold(v) { this.lostThings = v; }
  /** @deprecated alias of `keepsakes`. */
  get relics() { return this.keepsakes; }
  /** @deprecated alias of `snacks`. */
  get potions() { return this.snacks; }
  get alive() { return this.courage > 0 && this.result !== 'defeat'; }
  get companionName() { return COMPANIONS.find(c => c.slug === this.companion)?.name || this.companion; }
  get kidName() { return KIDS.find(k => k.slug === this.kid)?.name || this.kid; }
  get petName() { return KIDS.find(k => k.slug === this.kid)?.pet || 'your pet'; }
  get currentNode() { return this.nodeById(this.currentNodeId); }
  get isLastRegion() { return this.regionIndex >= Math.min(RUN_LENGTH_REGIONS, REGION_ORDER.length) - 1; }

  /** Aggregated Keepsake + Gear flags. Scenes read this, never a relic by name. */
  get flags() {
    const a = relicRunFlags(this.keepsakes);
    const b = backpackRunFlags(this.backpack);
    return {
      ...a,
      luck: a.luck + this.pity,
      restBonus: a.restBonus + b.restBonus,
      revealUnknown: a.revealUnknown || b.revealUnknown,
      clueBonus: b.clueBonus,
      mapPeek: b.mapPeek,
      curiosityHeal: b.curiosityHeal,
      gear: b,
    };
  }

  /** Everything the Backpack can satisfy — Curiosity gates ask this. */
  get carrying() { return backpackTags(this.backpack); }

  /**
   * A subsystem's own deterministic stream.  Derived from the run seed, never
   * from stream position, so adding a roll here cannot move a roll there.
   */
  fork(tag) { return new RNG(hashSeed(`mm-run-v1|${this.seed}|${tag}`)); }

  attach(ctx) { this._ctx = ctx; if (ctx) ctx.run = this; return this; }
  get ctx() { return this._ctx || (typeof window !== 'undefined' ? window.MM?.ctx : null) || null; }

  // ══ deck ═════════════════════════════════════════════════════════════════
  _instance(def, upgraded = false) {
    if (!def) return null;
    return { uid: nextUid(), id: def.id, upgraded: !!upgraded };
  }
  /** The CardDef behind a deck entry. */
  defOf(entry) { return entry ? cardById(entry.id) : undefined; }
  /** Deck as `[{def, upgraded, uid}]` — what CardView and the engine want. */
  deckViews() {
    return this.deck.map(c => ({ uid: c.uid, upgraded: c.upgraded, def: cardById(c.id) }))
      .filter(c => !!c.def);
  }
  cardCount() { return this.deck.length; }
  findCard(uid) { return this.deck.find(c => c.uid === uid) || null; }

  addCard(defOrId, { upgraded = false, quiet = false } = {}) {
    const def = typeof defOrId === 'string' ? cardById(defOrId) : defOrId;
    if (!def) return null;
    const c = this._instance(def, upgraded);
    this.deck.push(c);
    if (!quiet) bus.emit('run:deck', { action: 'add', card: c, id: def.id });
    this.save();
    return c;
  }
  removeCard(uid) {
    const i = this.deck.findIndex(c => c.uid === uid);
    if (i < 0) return null;
    const [gone] = this.deck.splice(i, 1);
    bus.emit('run:deck', { action: 'remove', card: gone, id: gone.id });
    this.save();
    return gone;
  }
  upgradeCard(uid) {
    const c = this.findCard(uid);
    if (!c || c.upgraded) return null;
    const def = cardById(c.id);
    if (!def?.upgrade) return null;      // not every Trick has a + form
    c.upgraded = true;
    bus.emit('run:deck', { action: 'upgrade', card: c, id: c.id });
    this.save();
    return c;
  }
  /** Swap a Trick for a random one of the same rarity. Curiosity fodder. */
  transformCard(uid, rng = null) {
    const c = this.findCard(uid);
    if (!c) return null;
    const def = cardById(c.id);
    const r = rng || this.fork(`transform:${uid}`);
    const pool = poolFor(this.companion, def?.rarity).filter(x => x.id !== c.id);
    if (!pool.length) return null;
    const next = pool[r.int(pool.length)];
    c.id = next.id;
    c.upgraded = false;
    bus.emit('run:deck', { action: 'transform', card: c, id: next.id });
    this.save();
    return c;
  }
  /** Tricks that can still be upgraded — the Safe Room picker's list. */
  upgradeableCards() {
    return this.deck.filter(c => !c.upgraded && !!cardById(c.id)?.upgrade);
  }
  /** Tricks Mr. Moth will take off your hands. Never the last one. */
  removableCards() {
    if (this.deck.length <= 1) return [];
    return this.deck.filter(c => cardById(c.id)?.rarity !== 'basic' || this.deck.length > 5);
  }

  // ══ resources ════════════════════════════════════════════════════════════
  heal(n) {
    const before = this.courage;
    this.courage = Math.max(0, Math.min(this.maxCourage, this.courage + Math.round(n)));
    if (this.courage !== before) { bus.emit('run:courage', { before, after: this.courage }); this.save(); }
    return this.courage - before;
  }
  hurt(n) {
    const d = this.heal(-Math.abs(Math.round(n)));
    if (this.courage <= 0) this.end(false, 'the house');
    return d;
  }
  addMaxCourage(n) {
    this.maxCourage = Math.max(1, this.maxCourage + Math.round(n));
    this.courage = Math.max(1, Math.min(this.courage, this.maxCourage));
    this.save();
  }
  addLostThings(n, { raw = false } = {}) {
    const mul = raw ? 1 : this.flags.lostThingsMul;
    const amount = Math.round(n > 0 ? n * mul : n);
    this.lostThings = Math.max(0, this.lostThings + amount);
    bus.emit('run:lostThings', { delta: amount, total: this.lostThings });
    this.save();
    return amount;
  }
  spendLostThings(n) {
    if (this.lostThings < n) return false;
    this.lostThings -= n;
    bus.emit('run:lostThings', { delta: -n, total: this.lostThings });
    this.save();
    return true;
  }
  addKeepsake(defOrId) {
    const inst = typeof defOrId === 'string' ? makeRelic(defOrId) : (defOrId?.id ? defOrId : null);
    if (!inst) return null;
    if (this.keepsakes.some(k => k.id === inst.id)) return null;
    inst.acquiredAt = this.currentNodeId;
    this.keepsakes.push(inst);
    try { inst.hooks?.onPickup?.({ run: this, owner: inst, e: null }); } catch { /* cosmetic */ }
    bus.emit('run:keepsake', { relic: inst });
    this.save();
    return inst;
  }
  hasKeepsake(id) { return this.keepsakes.some(k => k.id === id); }
  ownedKeepsakeIds() { return new Set(this.keepsakes.map(k => k.id)); }

  addSnack(snack) {
    if (this.snacks.length >= this.snackCap) return null;
    this.snacks.push(snack);
    this.save();
    return snack;
  }

  /**
   * Eat a Snack.  The counterpart `addSnack` never had — scenes were splicing
   * `run.snacks` themselves, which meant nothing recorded the use and the run
   * could not resume a fight a Snack had been eaten in.
   *
   * The RULES belong to the engine (CONTRACTS.md §5), so this owns exactly two
   * things: the inventory, and the fact that a Snack is spent the moment it is
   * eaten, win or lose.  Snacks are a combat resource; outside a Scuffle there
   * is nothing to resolve them against and this refuses.
   *
   * @param {number} index          slot in `run.snacks`
   * @param {string|null} targetId  engine actor id, for `target:'enemy'` Snacks
   * @returns {Promise<Object[]|null>} the engine events, or null if not allowed
   */
  async useSnack(index, targetId = null) {
    const snack = this.snacks[index];
    if (!snack) return null;
    const engine = this.combat;
    if (!engine) return null;
    if (!engine.canUseSnack(snack, targetId).ok) return null;

    this.snacks.splice(index, 1);
    bus.emit('run:snack', { snack, index });
    this.save();
    const events = await engine.useSnack(snack, targetId);
    return events;
  }

  /** Whether a Snack could be eaten right now, and why not. */
  canUseSnack(index, targetId = null) {
    const snack = this.snacks[index];
    if (!snack) return { ok: false, reason: 'That slot is empty.' };
    if (!this.combat) return { ok: false, reason: 'You eat Snacks during a Scuffle.' };
    return this.combat.canUseSnack(snack, targetId);
  }
  addClues(n = 1) {
    const total = Math.max(0, Math.round(n + (n > 0 ? this.flags.clueBonus : 0)));
    if (!total) return 0;
    this.cluesFound += total;
    this.stats.clues += total;
    bus.emit('run:clue', { delta: total, total: this.cluesFound });
    this.save();
    return total;
  }

  // ══ map ══════════════════════════════════════════════════════════════════
  _buildMap() {
    this.map = generateRegionMap(this.region, this.seed, {
      hauntLevel: this.hauntLevel,
      companion: this.companion,
      rescued: this.rescued,
      companionsFreed: this.companionsFreed.slice(),
    });
    this.currentNodeId = null;
    this.visitedIds = [];
    this.pathIds = [];
    if (this.flags.revealUnknown) {
      for (const n of this.map.nodes) if (n.type === NodeType.UNKNOWN) n.revealed = this._unknownAs(n);
    }
    for (const n of this.map.nodes) n.visited = false;
  }

  nodeById(id) { return id ? (this.map?.nodes.find(n => n.id === id) || null) : null; }
  legalNextIds() { return legalNextIds(this.map, this.currentNodeId); }
  legalNodes() { return this.legalNextIds().map(id => this.nodeById(id)).filter(Boolean); }
  isLegal(id) { return this.legalNextIds().includes(id); }

  /** What an Unsurveyed room actually turns out to be. Fixed per node + seed. */
  _unknownAs(node) {
    const r = this.fork(`unknown:${node.id}`);
    return r.weighted([
      { t: NodeType.CURIOSITY, w: 50 },
      { t: NodeType.SCUFFLE,   w: 20 },
      { t: NodeType.SHOP,      w: 14 },
      { t: NodeType.TREASURE,  w: 16 },
    ]).t;
  }
  /** The node's effective type — Unsurveyed resolved. */
  effectiveType(node) {
    if (!node) return null;
    if (node.type !== NodeType.UNKNOWN) return node.type;
    return node.revealed || (node.revealed = this._unknownAs(node));
  }
  /** Which scene a node hands off to. */
  sceneFor(node) {
    const t = this.effectiveType(node);
    if (t === NodeType.TREASURE) return 'reward';
    if (t === NodeType.RESCUE) return 'event';
    return sceneForNode({ ...node, type: t });
  }

  /** The map screen calls this directly (see scenes/map.js `_choose`). */
  chooseNode(node) {
    const id = typeof node === 'string' ? node : node?.id;
    if (!id || id === this.currentNodeId) return;    // already handled by the bus
    return this.enterNode(id);
  }

  /**
   * Walk into a room.  Marks the map, applies room-entry effects, tells the
   * Keepsakes, and hands off to the right scene.
   */
  async enterNode(nodeId) {
    const node = this.nodeById(nodeId);
    if (!node) return null;
    if (this.currentNodeId && !this.isLegal(nodeId)) return null;

    this._roomDone = false;
    this._markEntered(nodeId);
    if (this.currentNodeId && !this.pathIds.includes(this.currentNodeId)) this.pathIds.push(this.currentNodeId);
    this.pathIds.push(nodeId);
    this.currentNodeId = nodeId;
    const rows = this.map?.rows ?? 6;
    this.stats.depth = Math.max(this.stats.depth, this.regionIndex * rows + node.row + 1);

    // Hazard wings bite on entry (mapgen HAZARDS: "The Floor Sags").
    if (node.payload?.hazard === 'sagging') this.hurt(3);
    if (node.payload?.hazard === 'paw-prints') this.addClues(1);

    for (const k of this.keepsakes) {
      try { k.hooks?.onEnterRoom?.({ run: this, node, owner: k, e: null }); } catch { /* cosmetic */ }
    }

    const type = this.effectiveType(node);
    const scene = this.sceneFor(node);
    this.save();
    bus.emit('run:enterNode', { node, type, scene, run: this });

    if (scene === 'combat') return this._startCombat(node, type);
    if (scene === 'event') this._prepareEvent(node, type);
    if (scene === 'shop') this._prepareShop(node);
    if (scene === 'reward' && type === NodeType.TREASURE) this._prepareTreasure(node);
    return this._goto(scene, { node: nodeId, region: this.region });
  }

  /**
   * ENTERED, not cleared.
   *
   * `scenes/map.js` optimistically writes the node into `run.visitedIds` before
   * it calls `chooseNode` ("keeps the screen honest even before run.js exists"),
   * so this actively takes it back out again.  A room only joins `visitedIds`
   * when it *resolves* — see `_markCleared`.  That is the whole difference
   * between quitting mid-fight and being handed the room for free.
   */
  _markEntered(nodeId) {
    const node = this.nodeById(nodeId);
    if (node) node.visited = false;
    const i = this.visitedIds.indexOf(nodeId);
    if (i >= 0) this.visitedIds.splice(i, 1);
  }

  /** The room is done with. This — and only this — clears a node. */
  _markCleared(nodeId = this.currentNodeId) {
    if (!nodeId) return;
    const node = this.nodeById(nodeId);
    if (node) node.visited = true;
    if (!this.visitedIds.includes(nodeId)) this.visitedIds.push(nodeId);
  }

  /** Leave a non-combat room and go back to the blueprint. */
  leaveNode() {
    this.pendingReward = null;
    this.pendingEvent = null;
    this.pendingShop = null;
    this._roomDone = true;
    this._markCleared();
    this.save();
    const node = this.currentNode;
    if (node && this.effectiveType(node) === NodeType.BOSS) return this.completeRegion();
    return this._goto('map', { region: this.region, seed: this.seed });
  }

  _goto(scene, params = {}) {
    const ctx = this.ctx;
    if (!ctx?.scenes) return null;
    return ctx.scenes.go(scene, params);
  }

  // ══ combat ═══════════════════════════════════════════════════════════════
  /** Which authored encounter tier a node asks for. */
  tierFor(node, type) {
    if (type === NodeType.BOSS) return 'boss';
    if (type === NodeType.BIG_SCARE) return 'elite';
    const rows = this.map?.rows ?? 6;
    if (node.row < 2) return 'early';
    if (node.row < rows - 2) return 'standard';
    return 'advanced';
  }

  /** The nearest region that actually has authored formations for this tier. */
  _contentRegion(tier) {
    if (encountersFor(this.region, tier).length) return this.region;
    for (const r of REGION_ORDER) if (encountersFor(r, tier).length) return r;
    return 'foyer';
  }

  /**
   * Build the CombatEngine for a node and hand it to the combat scene through
   * `ctx.run.combat` — the seam the combat-scene agent asked for.
   */
  async buildCombat(node, type = null, opts = {}) {
    const C = CONTENT || await warmCombatContent();
    return this._buildCombat(C, node, type, opts);
  }

  /**
   * The synchronous half of `buildCombat`.
   *
   * It is split out because resuming an interrupted fight has to rebuild the
   * engine *and* replay it inside one microtask chain, before the scene manager
   * finishes its cover transition — see `restoreInterruptedCombat`.  Every
   * module it needs is pre-warmed by `warmCombatContent()`.
   *
   * @param {{histLen?:number, replay?:boolean}} opts
   *   `histLen` rolls the encounter against the history as it stood when the
   *   fight was first entered, so a resumed fight is the same fight.
   *   `replay` suppresses the history push and the room counters.
   */
  _buildCombat(C, node, type = null, opts = {}) {
    const t = type || this.effectiveType(node);
    const tier = this.tierFor(node, t);
    const region = this._contentRegion(tier);
    const rng = this.fork(`combat:${node.id}`);

    const { CombatEngine } = C;
    const { getEnemy, ENEMY_LIST } = C.enemies;

    const histLen = Number.isInteger(opts.histLen) ? opts.histLen : this.encounterHistory.length;
    const history = this.encounterHistory.slice(0, histLen);
    const enc = rollEncounter(region, tier, rng, history);
    const members = buildEncounter(enc.id, rng, this.hauntLevel);
    if (!opts.replay) this.encounterHistory.push(enc.id);

    const hpMul = this.flags.enemyHpMul || 1;
    const enemies = members.map((m, i) => {
      const def = getEnemy(m.enemyId);
      return def ? { def, hp: Math.max(1, Math.round(m.hp * hpMul)), id: `e${i}` } : null;
    }).filter(Boolean);

    const engine = new CombatEngine({
      rng,
      player: {
        name: this.kidName, companion: this.companion, kid: this.kid,
        maxHp: this.maxCourage, hp: this.courage,
        energyMax: this.energyMax, drawPerTurn: 5,
        deck: this.deckViews().map(c => ({ def: c.def, upgraded: c.upgraded })),
      },
      enemies,
      relics: [...this.keepsakes, ...backpackHooks(this.backpack)],
      bus,
    });

    // Haunt counters / behavioural flags the encounter builder produced.
    engine.enemies.forEach((en, i) => {
      const m = members[i];
      if (!m) return;
      if (m.counters) en.counters = { ...(en.counters || {}), ...m.counters };
      if (m.flags) en.flags = { ...(en.flags || {}), ...m.flags };
    });

    try {
      engine.registerCards(allCards());
      engine.registerEnemies(ENEMY_LIST || []);
      // Enemy-generated status Tricks (`ctx.addCard('clutter')`). The global
      // keyword/status registries were already loaded by warmCombatContent();
      // this is the only per-engine part of loadContentRegistries().
      if (C.lib && C.lib.STATUS_TRICK_DEFS) engine.registerCards(C.lib.STATUS_TRICK_DEFS);
    } catch { /* registries are best-effort */ }

    this.combatMeta = {
      nodeId: node.id, type: t, tier, encounter: enc.id, name: enc.name, region, histLen,
    };
    return engine;
  }

  async _startCombat(node, type) {
    const engine = await this.buildCombat(node, type);
    this._beginCombat(engine, node, type);
    return this._goto('combat', { node: node.id, region: this.region, seed: this.seed });
  }

  /**
   * Put a built engine on the run and start recording it.
   *
   * `pendingCombat` is the fight's whole identity: which node, which encounter,
   * the Courage the player walked in with, and every action they have taken.
   * It exists from the first frame of the fight, so there is no window in which
   * a reload loses the room.
   */
  _beginCombat(engine, node, type, { resumed = false, mode = 'fresh' } = {}) {
    this.combat = engine;
    if (!resumed) {
      const m = this.combatMeta || {};
      this.pendingCombat = {
        nodeId: node.id,
        type,
        tier: m.tier || null,
        encounter: m.encounter || null,
        histLen: Number.isInteger(m.histLen) ? m.histLen : this.encounterHistory.length - 1,
        courageOnEntry: this.courage,
        actions: [],
        choices: [],
        damage: 0,
        digest: null,
        unsafe: false,
      };
    }
    this._wireCombat(engine);
    bus.emit('run:combatStart', { node, engine, meta: this.combatMeta, resumed, mode });
    this._combatSave();
    return engine;
  }

  /* ── recording an in-flight fight ──────────────────────────────────────── */

  /**
   * A stable name for every card in a fight.
   *
   * Engine card uids come from a module counter, so they are not stable across
   * a page reload — but the ORDER cards are created in is, because the engine is
   * deterministic.  Deck cards get `d<index into the run deck>`; anything an
   * effect creates mid-fight gets `x<n>` in creation order.  Both sides of a
   * replay build this map the same way, so a recorded action always finds the
   * card it meant.
   *
   * @returns {{byUid:Map<string,string>, byKey:Map<string,string>, off:Function}}
   */
  _cardKeys(engine) {
    const byUid = new Map();
    const byKey = new Map();
    const put = (uid, key) => { byUid.set(uid, key); byKey.set(key, uid); };
    engine.piles.draw.forEach((c, i) => put(c.uid, `d${i}`));
    let extra = 0;
    const off = engine.on('card:add', (ev) => {
      if (ev && ev.cardUid && !byUid.has(ev.cardUid)) put(ev.cardUid, `x${extra++}`);
    });
    return { byUid, byKey, off };
  }

  _wireCombat(engine) {
    this._unwireCombat();
    const offs = this._combatOffs;
    const keys = this._cardKeys(engine);
    offs.push(keys.off);
    this._combatKeys = keys;

    offs.push(engine.on('combat:end', (ev) => this._onCombatEnd(ev)));

    // "DAMAGE DEALT 0" lived here: nothing ever added combat damage to the run.
    // The engine's own counter is per-turn, so the run watches the events.
    const playerId = engine.player.id;
    offs.push(engine.on('damage', (ev) => {
      if (!ev || ev.sourceId !== playerId || ev.targetId === playerId) return;
      const n = Math.max(0, Number(ev.hpLoss) || 0);
      if (!n) return;
      this.stats.damageDealt += n;
      if (this.pendingCombat) this.pendingCombat.damage += n;
    }));

    offs.push(engine.on('card:play', (ev) => {
      const pc = this.pendingCombat;
      if (!pc) return;
      const key = keys.byUid.get(ev && ev.cardUid);
      // A card we cannot name cannot be replayed. Say so rather than resuming
      // into a board that quietly disagrees with the one the player left.
      if (!key) { pc.unsafe = true; return; }
      pc.actions.push(['p', key, (ev && ev.targetId) || null]);
      this._combatSaveSoon();
    }));

    offs.push(engine.on('turn:end', (ev) => {
      const pc = this.pendingCombat;
      if (!pc || !ev || ev.side !== 'player') return;
      pc.actions.push(['e']);
      this._combatSave();                     // turn boundary: flush for real
    }));

    offs.push(engine.on('snack:used', (ev) => {
      const pc = this.pendingCombat;
      if (!pc || !ev) return;
      pc.actions.push(['s', ev.snackId, ev.targetId || null]);
      this._combatSaveSoon();
    }));

    // Card plays are debounced so localStorage is not written inside an
    // animation frame. A reload must still capture the last one, so flush on
    // the way out of the page.
    if (typeof window !== 'undefined') {
      const flush = () => this._combatSave();
      window.addEventListener('pagehide', flush);
      window.addEventListener('beforeunload', flush);
      document.addEventListener('visibilitychange', flush);
      offs.push(() => {
        window.removeEventListener('pagehide', flush);
        window.removeEventListener('beforeunload', flush);
        document.removeEventListener('visibilitychange', flush);
      });
    }
  }

  _unwireCombat() {
    for (const off of this._combatOffs.splice(0)) { try { off(); } catch { /* teardown */ } }
    this._combatKeys = null;
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
  }

  /**
   * A fingerprint of the board.  Written on every combat save and checked after
   * a replay: if the replayed board is not the board the player left, the
   * replay is thrown away rather than trusted.
   */
  _combatDigest(e) {
    if (!e) return null;
    return [
      e.turn, e.phase, e.over ? 1 : 0,
      e.player.hp, e.player.block, e.player.energy,
      e.enemies.map(x => `${x.id}:${x.hp}:${x.block}:${x.alive ? 1 : 0}`).join(','),
      e.piles.hand.map(c => `${c.id}${c.upgraded ? '+' : ''}`).join('|'),
      e.piles.draw.length, e.piles.discard.length, e.piles.exhaust.length,
    ].join('~');
  }

  _combatSaveSoon() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this._combatSave(); }, 120);
  }

  _combatSave() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    const pc = this.pendingCombat;
    const e = this.combat;
    if (!pc || !e) return;
    pc.choices = e.choiceLog.map(c => ({ picked: c.picked.slice() }));
    pc.digest = this._combatDigest(e);
    this.save();
  }

  /* ── putting an interrupted fight back on screen ───────────────────────── */

  /**
   * Rebuild the fight the player quit out of.
   *
   * Two outcomes, in order of preference:
   *
   *   'replay'   the engine is deterministic and the player's actions were
   *              recorded, so the fight is re-run silently and the player lands
   *              on the exact board they left — same hand, same Courage, same
   *              enemy plans.  Verified against a digest before it is trusted.
   *   'restart'  anything the replay cannot verify falls back to a FRESH
   *              instance of the same encounter at the Courage the player had
   *              when they walked in.  You lose the fight's progress; you do not
   *              lose the room, and you do not get the reward.
   *
   * Never: the room silently clearing itself.
   */
  async restoreInterruptedCombat() {
    const pc = this.pendingCombat;
    if (!pc || this.result) return null;
    const node = this.nodeById(pc.nodeId);
    if (!node) { this.pendingCombat = null; this.save(); return null; }

    // The room is not cleared and the reward does not exist. Say it out loud
    // here too, in case a save from an older build claimed otherwise.
    this._markEntered(pc.nodeId);
    this.pendingReward = null;
    this.currentNodeId = pc.nodeId;
    this.courage = Math.max(1, Math.min(this.maxCourage, pc.courageOnEntry ?? this.courage));

    const build = () => this._buildCombat(
      CONTENT, node, pc.type, { histLen: pc.histLen, replay: true },
    );

    if (!CONTENT) await warmCombatContent();

    let engine = null;
    let mode = 'restart';
    try {
      engine = build();
      if (pc.unsafe) { engine = null; }
      else if (!pc.actions.length) { mode = 'replay'; }        // nothing had happened yet
      else if (await this._replayCombat(engine, pc)) { mode = 'replay'; }
      else { engine = null; }
    } catch (err) {
      console.warn('[run] could not replay the interrupted Scuffle, restarting it', err);
      engine = null;
    }

    if (!engine) { engine = this._freshCombat(pc, node); mode = 'restart'; }

    this._beginCombat(engine, node, pc.type, { resumed: true, mode });
    this._ensureCombatOnScreen(engine, { node: node.id, region: this.region, seed: this.seed }, 0, mode);
    return mode;
  }

  /**
   * Throw the abandoned attempt away and stand the same encounter back up from
   * the top, at the Courage the room was entered with.
   */
  _freshCombat(pc, node) {
    // Un-bank the damage the abandoned attempt contributed, or the expedition
    // total counts it twice.
    this.stats.damageDealt = Math.max(0, this.stats.damageDealt - (pc.damage || 0));
    pc.damage = 0;
    pc.actions = [];
    pc.choices = [];
    pc.digest = null;
    pc.unsafe = false;
    this.courage = Math.max(1, Math.min(this.maxCourage, pc.courageOnEntry ?? this.courage));
    return this._buildCombat(CONTENT, node, pc.type, { histLen: pc.histLen, replay: true });
  }

  /**
   * Re-run a recorded fight against a fresh engine.
   * @returns {Promise<boolean>} true only when the board matches the digest.
   */
  async _replayCombat(engine, pc) {
    const keys = this._cardKeys(engine);
    try {
      engine.setChoiceScript(pc.choices || []);
      await engine.startCombat();
      for (const a of (pc.actions || [])) {
        if (engine.over) return false;
        if (a[0] === 'e') { await engine.endTurn(); continue; }
        if (a[0] === 's') {
          const snack = SNACKS.find(s => s.id === a[1]);
          if (!snack) return false;
          if (!engine.canUseSnack(snack, a[2]).ok) return false;
          await engine.useSnack(snack, a[2]);
          continue;
        }
        const uid = keys.byKey.get(a[1]);
        if (!uid || !engine.canPlay(uid, a[2]).ok) return false;
        await engine.playCard(uid, a[2]);
      }
      engine.setChoiceScript(null);
      if (engine.over) return false;
      return !pc.digest || this._combatDigest(engine) === pc.digest;
    } finally {
      keys.off();
    }
  }

  /**
   * The title screen navigates on its own the moment it emits `run:continue`,
   * using the `scene` field the snapshot carries.  Nine times in ten the rebuild
   * above finishes first (it is one microtask chain against a cover transition)
   * and `scenes/combat.js` picks the real engine straight off `ctx.run.combat`.
   * This is the tenth time: if the screen ended up anywhere else, or on a combat
   * scene holding a stand-in engine, put the real fight up.
   */
  _ensureCombatOnScreen(engine, params, tries = 0, mode = 'replay') {
    const scenes = this.ctx && this.ctx.scenes;
    if (!scenes || tries > 40) return;                 // ~2.5s, then give up quietly
    if (this.combat !== engine) return;                // something else took over
    if (scenes.currentName === 'combat' && scenes.current && scenes.current.engine === engine) {
      if (mode === 'replay') setTimeout(() => this._auditResumedCombat(engine, params), 700);
      return;
    }

    // `SceneManager.go` DROPS a navigation while another is in flight, and
    // `scene:entered` fires *before* `busy` is cleared — so waiting on that
    // event and calling `go` from it gets dropped too. Both the title's own
    // navigation and this one were lost that way when Continue was clicked
    // while the title screen's own entrance transition was still running.
    // Poll instead: cheap, bounded, and it cannot be raced.
    const again = () => setTimeout(() => this._ensureCombatOnScreen(engine, params, tries + 1, mode), 60);
    if (scenes.busy) { again(); return; }
    Promise.resolve(scenes.go('combat', params)).then(again, again);
  }

  /**
   * A replayed fight is rules-correct the moment the engine is rebuilt. Whether
   * the player can SEE it is a separate question, and it is not one this file
   * can answer on its own.
   *
   * `scenes/combat.js` fills its hand purely from `draw` events. A resumed
   * engine already holds its hand and will never emit those, so today a
   * replayed fight renders with an empty hand — mechanically perfect, unplayable
   * to look at. The one-line fix is in that file (seed `Hand.setCards` /
   * `Hand.draw` from `engine.piles.hand` in `_buildHand` when the engine is
   * already started) and it is written up in docs/NOTES.md.
   *
   * Until it lands, this reads the scene's own public `Hand.cards()` — a
   * read-only health check, it mutates nothing — and if the hand did not make it
   * to the screen it drops back to a fresh instance of the same encounter, which
   * renders correctly because the scene starts that one itself. The player loses
   * the fight's progress rather than the ability to play. It self-heals the
   * moment the scene seeds its hand; there is no flag to remember to flip.
   */
  _auditResumedCombat(engine, params) {
    const scenes = this.ctx && this.ctx.scenes;
    const scene = scenes && scenes.current;
    const pc = this.pendingCombat;
    if (!pc || !scene || this.combat !== engine) return;
    if (scenes.currentName !== 'combat' || scene.engine !== engine) return;
    if (!engine.started || engine.over || !engine.piles.hand.length) return;

    const hand = scene.hand;
    if (!hand || typeof hand.cards !== 'function') return;
    const shown = hand.cards().length;
    if (shown >= engine.piles.hand.length) return;

    console.warn(`[run] the Scuffle scene showed ${shown} of ${engine.piles.hand.length} `
      + 'Tricks in a replayed hand, so the replay is being dropped for a fresh '
      + 'instance of the same encounter. See docs/NOTES.md → meta-run round 2.');
    const node = this.nodeById(pc.nodeId);
    if (!node) return;
    this._unwireCombat();
    const fresh = this._freshCombat(pc, node);
    this._beginCombat(fresh, node, pc.type, { resumed: true, mode: 'restart' });
    this._ensureCombatOnScreen(fresh, params, 0, 'restart');
  }

  /**
   * The engine has finished.  This runs the moment the fight resolves, which is
   * a second or so before the combat scene has finished animating the last
   * death — so it prepares state and **navigates nothing**.  `scenes/combat.js`
   * owns the transition out of its own scene (to `reward` or `gameover`), and
   * both of those screens read what this method left behind.
   */
  _onCombatEnd(ev) {
    const engine = this.combat;
    if (!engine) return;
    this._unwireCombat();
    this.pendingCombat = null;             // the fight resolved; nothing to resume

    this.courage = Math.max(0, engine.player?.hp ?? this.courage);
    this.stats.cardsPlayed += engine.stats?.cardsPlayedThisCombat || 0;
    this.stats.turns += engine.stats?.turnsTaken || 0;

    const node = this.currentNode;
    const type = node ? this.effectiveType(node) : NodeType.SCUFFLE;
    bus.emit('run:combatEnd', { victory: !!ev?.victory, node, type });

    if (!ev?.victory) {
      this.killedBy = engine.enemies?.find(e => e.alive)?.name || null;
      this.combat = null;
      this.end(false, this.killedBy, { navigate: false });
      return;
    }

    if (type === NodeType.SCUFFLE) this.stats.scuffles++;
    else if (type === NodeType.BIG_SCARE) this.stats.bigScares++;

    this.combat = null;
    // The fight is won, so the room is done with even though the reward screen
    // has not been answered yet. Quitting on the reward screen resumes there.
    this._markCleared(node ? node.id : this.currentNodeId);
    this._prepareReward(node, type, { navigate: false });
    this.save();
  }

  // ══ rewards ══════════════════════════════════════════════════════════════
  /**
   * STS2-REFERENCE §6: three Tricks, take one or skip; the rarity odds move
   * with a pity counter so a long dry spell is self-correcting.  A Big Scare
   * also drops a Keepsake; a boss drops a rare one.
   */
  _prepareReward(node, type, { navigate = true } = {}) {
    const rng = this.fork(`reward:${node?.id || 'x'}`);
    const purse = PURSE[type] || PURSE[NodeType.SCUFFLE];
    const lost = rng.range(purse[0], purse[1]);

    const cards = this.rollCardReward(rng, {
      count: 3,
      eliteBonus: type === NodeType.BIG_SCARE ? 5 : type === NodeType.BOSS ? 10 : 0,
    });

    const owned = this.ownedKeepsakeIds();
    let keepsake = null;
    if (type === NodeType.BIG_SCARE) keepsake = rollKeepsake(rng, { owned, rarity: rollKeepsakeRarity(rng, this.flags.luck) });
    if (type === NodeType.BOSS) keepsake = rollKeepsake(rng, { owned, rarity: 'boss' }) || rollKeepsake(rng, { owned, rarity: 'rare' });

    const clue = this.flags.clueOnClear ? 1 : 0;

    this.pendingReward = {
      kind: type === NodeType.BOSS ? 'boss' : type === NodeType.BIG_SCARE ? 'bigScare' : 'scuffle',
      nodeId: node?.id || null,
      lostThings: Math.round(lost * this.flags.lostThingsMul),
      cards: cards.map(def => ({ id: def.id, rarity: def.rarity })),
      keepsake: keepsake ? keepsake.id : null,
      clues: clue,
      taken: [],
      encounter: this.combatMeta?.name || null,
    };
    bus.emit('run:reward', { reward: this.pendingReward, node, type });
    this.save();
    return navigate ? this._goto('reward', { node: node?.id, region: this.region }) : this.pendingReward;
  }

  /** A treasure room: one Keepsake, no fight. */
  _prepareTreasure(node) {
    const rng = this.fork(`treasure:${node.id}`);
    const owned = this.ownedKeepsakeIds();
    const k = rollKeepsake(rng, { owned, rarity: rollKeepsakeRarity(rng, this.flags.luck) });
    this.stats.treasures++;
    this.pendingReward = {
      kind: 'treasure', nodeId: node.id,
      lostThings: rng.range(20, 45), cards: [], keepsake: k ? k.id : null,
      clues: 0, taken: [],
    };
    bus.emit('run:reward', { reward: this.pendingReward, node, type: NodeType.TREASURE });
    this.save();
  }

  /**
   * Three distinct Tricks from this Companion's pool.
   * Base ladder mirrors StS: 60 / 37 / 3, rare shifted by luck + pity.
   */
  rollCardReward(rng, { count = 3, eliteBonus = 0 } = {}) {
    const luck = this.flags.luck + eliteBonus;
    const out = [];
    const seen = new Set(out.map(c => c.id));
    for (let i = 0; i < count; i++) {
      const rarity = this._rollRarity(rng, luck);
      let pool = poolFor(this.companion, rarity).filter(c => !seen.has(c.id));
      if (!pool.length) pool = poolFor(this.companion).filter(c => !seen.has(c.id));
      if (!pool.length) break;
      const pick = pool[rng.int(pool.length)];
      seen.add(pick.id);
      out.push(pick);
    }
    return out;
  }

  /** `luck` already carries the pity counter (see the `flags` getter). */
  _rollRarity(rng, luck = 0) {
    const rareChance = Math.min(45, 3 + luck);
    const roll = rng.next() * 100;
    if (roll < rareChance) return 'rare';
    if (roll < rareChance + 37) return 'uncommon';
    return 'common';
  }

  /** Take one of the offered Tricks, or take none. Both end the reward. */
  takeRewardCard(cardId) {
    const r = this.pendingReward;
    if (!r) return null;
    const entry = r.cards.find(c => c.id === cardId);
    if (!entry) return null;
    const added = this.addCard(cardId, { quiet: true });
    r.taken.push(cardId);
    this.stats.cardsTaken++;
    // Pity: a run that has not seen a Rare gets luckier; taking one resets it.
    this.pity = entry.rarity === 'rare' ? 0 : Math.min(20, this.pity + 1);
    bus.emit('run:deck', { action: 'add', card: added, id: cardId });
    this.save();
    return added;
  }
  skipRewardCards() {
    const r = this.pendingReward;
    if (!r) return;
    this.stats.cardsSkipped++;
    // Skipping is a real choice, not a punishment: it buys luck and a little
    // pocket money, so "none of these three" is sometimes correct.
    this.pity = Math.min(20, this.pity + 2);
    this.addLostThings(12, { raw: true });
    this.save();
  }
  /** Collect the purse + Keepsake and go back to the blueprint. */
  claimReward() {
    const r = this.pendingReward;
    if (!r) return this.leaveNode();
    if (r.lostThings) this.addLostThings(r.lostThings, { raw: true });
    if (r.keepsake) this.addKeepsake(r.keepsake);
    if (r.clues) this.addClues(r.clues);
    if (r.keepsake && this.flags.maxHpOnMilestone && r.kind === 'bigScare') {
      this.addMaxCourage(this.flags.maxHpOnMilestone);
    }
    const wasBoss = r.kind === 'boss';
    this.pendingReward = null;
    this._markCleared(r.nodeId || this.currentNodeId);
    this.save();
    if (wasBoss) return this.completeRegion();
    return this._goto('map', { region: this.region, seed: this.seed });
  }

  // ══ Safe Room ════════════════════════════════════════════════════════════
  restHealAmount() {
    if (this.flags.noRestHeal) return 0;
    return Math.max(0, Math.round(this.maxCourage * 0.3) + this.flags.restBonus);
  }
  /** Forge: permanently upgrade a Keepsake, paid for in maximum Courage. */
  forgeCost() { return 8; }
  forgeableKeepsakes() { return this.keepsakes.filter(k => !k.forged); }
  /**
   * StS2's Forge, in one rule that works for every Keepsake in the file: a
   * forged Keepsake fires its opening hook **twice**.  Welcome Mat gives 8
   * Guard, Porcupine Slipper gives 6 Bristle, the Night-Before Bag draws 4.
   * No bespoke tier-2 text per relic, and the before/after is trivially
   * previewable, which is the part that actually matters on screen.
   */
  _applyForge(k) {
    if (!k || k._forgeWired) return k;
    for (const key of ['onCombatStart', 'onTurnStart']) {
      const base = Object.getPrototypeOf(k)?.hooks?.[key];
      if (typeof base !== 'function') continue;
      k.hooks = { ...(k.hooks || {}), [key]: (h) => { base(h); base(h); } };
    }
    k._forgeWired = true;
    return k;
  }
  forgeKeepsake(id) {
    const k = this.keepsakes.find(x => x.id === id && !x.forged);
    if (!k) return null;
    if (this.maxCourage - this.forgeCost() < 10) return null;
    k.forged = true;
    k.tier = (k.tier || 1) + 1;
    this.addMaxCourage(-this.forgeCost());
    this._applyForge(k);
    bus.emit('run:forge', { relic: k });
    this.save();
    return k;
  }
  /** Plain-language before/after for the Forge picker. */
  forgePreview(id) {
    const k = this.keepsakes.find(x => x.id === id);
    if (!k) return null;
    const hasOpener = ['onCombatStart', 'onTurnStart']
      .some(n => typeof Object.getPrototypeOf(k)?.hooks?.[n] === 'function');
    return {
      id: k.id, name: k.name, before: k.desc,
      after: hasOpener
        ? `${k.desc} It happens twice.`
        : `${k.desc} (Forged — this one has no opener to double, so it only gains the mark.)`,
      worthwhile: hasOpener,
      cost: this.forgeCost(),
    };
  }
  rest() {
    const n = this.restHealAmount();
    if (n > 0) this.heal(n);
    this.stats.safeRooms++;
    for (const k of this.keepsakes) {
      try { k.hooks?.onRestSite?.({ run: this, owner: k, e: null }); } catch { /* cosmetic */ }
    }
    this.save();
    return n;
  }

  // ══ Mr. Moth's ═══════════════════════════════════════════════════════════
  /** Deterministic stock for one shop node. */
  shopStock(node = this.currentNode) {
    const id = node?.id || `shop-${this.shopsVisited}`;
    const rng = this.fork(`shop:${id}`);
    const f = this.flags;
    const disc = f.shopDiscount || 1;
    const price = (base, spread) => Math.max(5, Math.round((base + rng.range(-spread, spread)) * disc));

    const cards = [];
    const seen = new Set(this.deck.map(c => c.id));
    const wants = [
      ['common', 55], ['common', 55], ['uncommon', 85],
      ['uncommon', 85], [f.shopRare ? 'rare' : 'uncommon', f.shopRare ? 145 : 90],
    ];
    for (const [rarity, base] of wants) {
      let pool = poolFor(this.companion, rarity).filter(c => !cards.some(x => x.id === c.id));
      if (!pool.length) pool = poolFor(this.companion).filter(c => !cards.some(x => x.id === c.id));
      if (!pool.length) continue;
      const def = pool[rng.int(pool.length)];
      cards.push({ id: def.id, rarity: def.rarity, price: price(base, 12), owned: seen.has(def.id) });
    }

    const owned = this.ownedKeepsakeIds();
    const keepsakes = [];
    for (const rarity of ['common', 'uncommon', 'shop']) {
      const k = rollKeepsake(rng, { owned: new Set([...owned, ...keepsakes.map(x => x.id)]), rarity });
      if (k) keepsakes.push({ id: k.id, rarity: k.rarity, price: price(rarity === 'shop' ? 175 : rarity === 'uncommon' ? 150 : 115, 20) });
    }

    const snacks = SNACKS.map(s => ({ ...s })).slice();
    const offered = [];
    for (let i = 0; i < 3 && snacks.length; i++) {
      const s = snacks.splice(rng.int(snacks.length), 1)[0];
      offered.push({ ...s, price: price(s.base, 8) });
    }

    return { nodeId: id, cards, keepsakes, snacks: offered, removal: this.removalPrice };
  }

  /** One shop visit: the rolled stock plus what has already been bought. */
  _prepareShop(node) {
    if (this.pendingShop?.nodeId === node.id) return this.pendingShop;
    this.shopsVisited++;
    this.stats.shops++;
    this.pendingShop = { nodeId: node.id, sold: [] };
    this.save();
    return this.pendingShop;
  }
  shopSold() { return this.pendingShop?.sold || []; }
  _markSold(key) {
    if (!key) return;
    if (!this.pendingShop) this.pendingShop = { nodeId: this.currentNodeId, sold: [] };
    if (!this.pendingShop.sold.includes(key)) this.pendingShop.sold.push(key);
  }

  buyCard(id, price, key = null) {
    if (!this.spendLostThings(price)) return null;
    this._markSold(key || `card:${id}`);
    return this.addCard(id);
  }
  buyKeepsake(id, price, key = null) {
    if (this.hasKeepsake(id)) return null;
    if (!this.spendLostThings(price)) return null;
    this._markSold(key || `keep:${id}`);
    return this.addKeepsake(id);
  }
  buySnack(snack, price, key = null) {
    if (this.snacks.length >= this.snackCap) return null;
    if (!this.spendLostThings(price)) return null;
    this._markSold(key || `snack:${snack.id}`);
    return this.addSnack({ ...snack });
  }
  /** The removal service. Its price rises each use — unless the Ledger says no. */
  buyRemoval(uid) {
    const price = this.removalPrice;
    if (!this.spendLostThings(price)) return null;
    const gone = this.removeCard(uid);
    if (!gone) { this.lostThings += price; return null; }
    if (!this.flags.flatRemoval) this.removalPrice += 25;
    this.save();
    return gone;
  }

  // ══ Curiosities ══════════════════════════════════════════════════════════
  _prepareEvent(node, type) {
    const rng = this.fork(`event:${node.id}`);
    if (type === NodeType.RESCUE) {
      const authored = node.payload?.companion || this.meta.companion;
      this.pendingEvent = {
        rescue: true, nodeId: node.id, resolved: null,
        companion: this.rescueTargetFor(node.id, authored),
      };
      this.save();
      return this.pendingEvent;
    }
    const def = rollEvent(rng, this.region, { depth: node.row, seen: this.seenEvents });
    this.pendingEvent = { id: def.id, nodeId: node.id, resolved: null };
    this.stats.curiosities++;
    if (this.flags.curiosityHeal && !this._curiosityHealUsed) {
      this._curiosityHealUsed = true;
      this.heal(this.flags.curiosityHeal);
    }
    this.save();
    return this.pendingEvent;
  }

  /** The def for whatever Curiosity this room is running. */
  currentEvent() {
    const p = this.pendingEvent;
    if (!p || p.rescue) return null;
    return eventById(p.id) || null;
  }

  /** Is this option's Backpack gate satisfied? */
  optionOpen(option) {
    if (!option?.requires) return true;
    if (this.flags.unlockEvents) return true;
    const have = this.carrying;
    const list = Array.isArray(option.requires) ? option.requires : [option.requires];
    return list.some(r => have.has(r));
  }

  /** Take a Curiosity option. Returns the authored outcome, effects applied. */
  chooseEventOption(optionId) {
    const p = this.pendingEvent;
    const def = this.currentEvent();
    if (!p || !def) return null;
    const option = def.options.find(o => o.id === optionId);
    if (!option || !this.optionOpen(option)) return null;
    if (option.cost?.lostThings && !this.spendLostThings(option.cost.lostThings)) return null;

    const rng = this.fork(`event:${p.nodeId}:${optionId}`);
    const outcome = rollOutcome(rng, option);
    if (!this.seenEvents.includes(def.id)) this.seenEvents.push(def.id);
    p.resolved = { option: optionId, title: outcome.title, text: outcome.text };
    const pending = this.applyEffects(outcome.effects || {}, rng, `event:${p.nodeId}`);
    p.pending = pending;
    this.save();
    bus.emit('run:event', { event: def.id, option: optionId, outcome, pending });
    return { outcome, pending };
  }

  /**
   * Apply an effects block from a Curiosity.
   * Returns whatever still needs the player: card pickers, or a fight.
   */
  applyEffects(fx = {}, rng = null, tag = 'fx') {
    const r = rng || this.fork(tag);
    const pending = { removeCard: 0, upgradeCard: 0, combat: null, gained: [] };

    if (fx.heal) { const n = this.heal(fx.heal); if (n) pending.gained.push({ kind: 'heal', n }); }
    if (fx.hp) {
      if (fx.hp < 0) this.hurt(-fx.hp); else this.heal(fx.hp);
      pending.gained.push({ kind: 'hp', n: fx.hp });
    }
    if (fx.maxHp) { this.addMaxCourage(fx.maxHp); pending.gained.push({ kind: 'maxHp', n: fx.maxHp }); }
    if (fx.lostThings) {
      const n = this.addLostThings(fx.lostThings);
      pending.gained.push({ kind: 'lostThings', n });
    }
    if (fx.clues) { const n = this.addClues(fx.clues); if (n) pending.gained.push({ kind: 'clues', n }); }
    if (fx.snacks) {
      for (let i = 0; i < fx.snacks; i++) {
        const s = SNACKS[r.int(SNACKS.length)];
        if (this.addSnack({ ...s })) pending.gained.push({ kind: 'snack', name: s.name });
      }
    }
    if (fx.relic) {
      const direct = relicById(fx.relic);
      const k = direct
        ? (this.hasKeepsake(direct.id) ? rollKeepsake(r, { owned: this.ownedKeepsakeIds() }) : makeRelic(direct))
        : rollKeepsake(r, { owned: this.ownedKeepsakeIds(), rarity: fx.relic });
      const got = k ? this.addKeepsake(k) : null;
      if (got) pending.gained.push({ kind: 'keepsake', id: got.id, name: got.name });
    }
    if (fx.card) {
      const rarity = fx.card.rarity || 'common';
      for (let i = 0; i < (fx.card.count || 1); i++) {
        const pool = poolFor(this.companion, rarity);
        if (!pool.length) break;
        const def = pool[r.int(pool.length)];
        this.addCard(def, { upgraded: !!fx.card.upgraded, quiet: true });
        pending.gained.push({ kind: 'card', id: def.id, name: def.name });
      }
    }
    if (fx.curse) {
      const def = cardById(fx.curse);
      if (def) { this.addCard(def, { quiet: true }); pending.gained.push({ kind: 'curse', id: def.id, name: def.name }); }
    }
    if (fx.removeCard) pending.removeCard = fx.removeCard;
    if (fx.upgradeCard) pending.upgradeCard = fx.upgradeCard;
    if (fx.combat) pending.combat = fx.combat;
    this.save();
    return pending;
  }

  /** A Curiosity that ends in a fight. */
  async eventCombat(kind = 'standard') {
    const node = this.currentNode;
    if (!node) return null;
    const fake = { ...node, row: node.row, id: node.id };
    const type = kind === 'elite' ? NodeType.BIG_SCARE : NodeType.SCUFFLE;
    const engine = await this.buildCombat(fake, type);
    this._beginCombat(engine, node, type);
    return this._goto('combat', { node: node.id, region: this.region });
  }

  /**
   * Who is genuinely still lost in the house.
   *
   * Three kinds of Companion are NOT: the one walking beside you, anyone this
   * save has already freed, and the four starters — the starters were never in
   * the house at all, they are at the clubhouse from the first expedition.
   * A reviewer freed Marmalade in Wing 1 while playing Pipkin and the screen
   * read "FREE - 1 OF 16" for a Companion already on the roster: the run's
   * emotional peak spent on nothing.
   */
  missingCompanions() {
    return COMPANIONS.map(c => c.slug).filter(s =>
      s !== this.companion && !this.rescued.includes(s) && !STARTER_SLUGS.has(s));
  }

  /**
   * Which Companion a Rescue room should actually free. The authored one when
   * they are still missing; otherwise a deterministic pick from whoever is.
   *
   * The authored table (`state/mapgen.js REGIONS`) points four wings at starter
   * Companions — Foyer/marmalade, crypt/bones, kitchens-cellars/taffy,
   * pumpkin-grounds/pipkin — so following it literally spends Wing 1's rescue on
   * somebody who is already home. Substituting here rather than in mapgen keeps
   * the map agent's table intact and makes the decision at the moment the run
   * knows who is actually missing. Reported to the map owner too.
   *
   * Deterministic: the choice comes from the run seed via `fork`, so a seed
   * still reproduces the run exactly.
   */
  rescueTargetFor(nodeId, authored) {
    const pool = this.missingCompanions();
    if (authored && pool.includes(authored)) return authored;
    if (!pool.length) return authored || null;   // everyone is already free
    // Prefer somebody whose own wing this is; the house should feel like it
    // keeps its animals where they belong.
    const local = pool.filter(s => COMPANIONS.find(c => c.slug === s)?.region === this.region);
    const from = local.length ? local : pool;
    return from[this.fork(`rescue:${nodeId}`).int(from.length)];
  }

  /** Free a Companion. The point of the whole exercise. */
  rescueCompanion(slug) {
    if (!slug || this.rescued.includes(slug)) return false;
    this.rescued.push(slug);
    // `rescued` is seeded from the save and is therefore the lifetime set. The expedition-end
    // screen wants what YOU freed today, so track that separately.
    this.companionsFreed.push(slug);
    this.addClues(2);
    if (this.flags.maxHpOnMilestone) this.addMaxCourage(this.flags.maxHpOnMilestone);
    bus.emit('run:rescue', { companion: slug });
    this.save();
    return true;
  }

  // ══ region ladder / ending ═══════════════════════════════════════════════
  /** Boss down. Either the next wing opens, or the expedition is over. */
  completeRegion() {
    const meta = this.meta;
    // Same substitution as a Rescue room: a boss kill must not "free" one of the
    // four starters, who were never in the house. See rescueTargetFor().
    const freed = this.rescueTargetFor(`boss:${this.region}`, meta.companion);
    if (freed && !this.rescued.includes(freed)) this.rescueCompanion(freed);
    if (this.isLastRegion || this.regionIndex + 1 >= REGION_ORDER.length) return this.end(true, null);
    return this.advanceRegion();
  }

  /**
   * Crossing into the next wing.
   *
   * The kids get a breather between wings. Without it, entry to wing 2 measured a mean of
   * 51.5% Courage with p25 at 17 of 71 and no Safe Room until several rooms in, and that is
   * exactly where the second wing's Scuffle deaths were happening — not a difficulty problem,
   * a "you started act two nearly dead" problem. Restoring to a floor (rather than a flat
   * heal) helps only the runs that arrive hurt, so it can't make a healthy run trivial.
   * Measured with this in: wing-2 Scuffle deaths 5 -> 0, reached the boss 86.4% -> 95.5%,
   * whole-run survival 46.7% -> 50.0%.
   */
  advanceRegion() {
    const floor = Math.round(this.maxCourage * REGION_ENTRY_FLOOR);
    if (this.courage < floor) {
      const healed = floor - this.courage;
      this.courage = floor;
      bus.emit('run:heal', { amount: healed, reason: 'wing' });
    }
    this.regionIndex++;
    this.region = REGION_ORDER[this.regionIndex];
    this.encounterHistory = [];
    this._curiosityHealUsed = false;
    this._buildMap();
    this.save();
    bus.emit('run:region', { region: this.region, index: this.regionIndex });
    return this._goto('map', { region: this.region, seed: this.seed });
  }

  end(victory, killedBy = null, { navigate = true } = {}) {
    if (this.result) return null;
    this.result = victory ? 'victory' : 'defeat';
    this.killedBy = killedBy || this.killedBy;
    this.endedAt = Date.now();
    this.combat = null;
    this.pendingCombat = null;
    this._unwireCombat();

    const meta = Save.data;
    if (meta) {
      meta.stats.runs = (meta.stats.runs || 0) + 1;
      if (victory) meta.stats.wins = (meta.stats.wins || 0) + 1;
      // The Clubhouse's "Deepest floor" and Game Over's "REACHED Floor" are now
      // the same number, because both of them are `depth`.
      meta.stats.bestFloor = Math.max(meta.stats.bestFloor || 0, this.depth);
      meta.stats.cardsPlayed = (meta.stats.cardsPlayed || 0) + this.stats.cardsPlayed;
      meta.stats.damageDealt = (meta.stats.damageDealt || 0) + this.stats.damageDealt;
      for (const slug of this.rescued) {
        if (!meta.companionsRescued.includes(slug)) meta.companionsRescued.push(slug);
      }
      if (!meta.blueprint.revealed.includes(this.region)) meta.blueprint.revealed.push(this.region);
      Save.save();
    }
    Save.clearRun();
    bus.emit('run:end', { victory, run: this, killedBy: this.killedBy });
    if (!navigate) return this.result;
    return this._goto('gameover', {
      result: this.result, seed: this.seed,
      companion: this.companion, kid: this.kid, region: this.region,
      // `floor` is what scenes/gameover.js prints as "REACHED Floor N", and it
      // must agree with the Clubhouse's "Deepest floor". `wing` is the other
      // number — see the header note on the two senses of depth.
      floor: this.depth, depth: this.depth, wing: this.wing,
      damageDealt: this.stats.damageDealt,
    });
  }

  // ══ persistence ══════════════════════════════════════════════════════════
  /**
   * Plain and serialisable. `window.MM.state()` reads exactly this.
   *
   * One key per concept.  This used to carry `hp`/`maxHp`/`gold` alongside
   * `courage`/`maxCourage`/`lostThings` — two copies of one number in a blob
   * that survives a reload, which is exactly how a save drifts.  The live
   * aliases on the class are getters, so nothing needs the duplicates; `resume`
   * still reads the old keys so saves from earlier builds load.
   */
  snapshot() {
    return {
      version: this.version,
      seed: this.seed, companion: this.companion, kid: this.kid,
      hauntLevel: this.hauntLevel, backpack: this.backpack.slice(),

      courage: this.courage, maxCourage: this.maxCourage,
      energyMax: this.energyMax,
      lostThings: this.lostThings,
      snacks: this.snacks.map(s => ({ ...s })),

      deck: this.deck.map(c => ({ uid: c.uid, id: c.id, upgraded: c.upgraded, name: cardById(c.id)?.name || c.id })),
      keepsakes: this.keepsakes.map(k => ({
        id: k.id, name: k.name, desc: k.desc, rarity: k.rarity,
        counter: k.counter ?? null, forged: !!k.forged, icon: k.icon,
      })),

      region: this.region, regionIndex: this.regionIndex,
      wing: this.wing, depth: this.depth,
      map: this.map,
      currentNodeId: this.currentNodeId,
      visitedIds: this.visitedIds.slice(),
      pathIds: this.pathIds.slice(),

      rescued: this.rescued.slice(), companionsFreed: this.companionsFreed.slice(), cluesFound: this.cluesFound,
      seenEvents: this.seenEvents.slice(),
      encounterHistory: this.encounterHistory.slice(),
      removalPrice: this.removalPrice, shopsVisited: this.shopsVisited, pity: this.pity,

      pendingReward: this.pendingReward,
      pendingEvent: this.pendingEvent,
      pendingShop: this.pendingShop || null,
      pendingCombat: this.pendingCombat,
      roomDone: !!this._roomDone,
      curiosityHealUsed: !!this._curiosityHealUsed,

      stats: { ...this.stats },
      result: this.result, killedBy: this.killedBy,
      companionsFreed: this.companionsFreed.slice(),
      startedAt: this.startedAt,
      uidSeq: UID,
      // scenes/title.js reads `run.scene` off the raw save to decide where
      // Continue lands.
      scene: this.resumeScene(),
    };
  }

  save() {
    if (this.result) return;          // a finished run is not resumable
    if (this.ephemeral) return;       // deep-link mocks must not clobber a real save
    try { Save.saveRun(this.snapshot()); } catch { /* storage is best-effort */ }
  }

  /**
   * A fully-formed run for a standalone deep link (`#scene=shop` with no
   * expedition in progress).  It is a *real* Run walked a few rooms with a
   * fixed seed, not a bag of fake numbers, so the review screens exercise the
   * same code the game does.  `ephemeral` keeps it out of localStorage.
   */
  static mock({ seed = 20260820, companion = 'marmalade', kid = 'maya', node = null } = {}) {
    const run = new Run({ companion, kid, seed });
    run.ephemeral = true;
    run.lostThings = 246;
    run.courage = Math.round(run.maxCourage * 0.62);
    run.pity = 3;
    run.cluesFound = 4;
    run.stats = { ...run.stats, scuffles: 5, bigScares: 1, curiosities: 2, depth: 4, damageDealt: 612 };
    run.encounterHistory = [];
    for (const id of ['welcome-mat', 'chewed-tennis-ball', 'nightlight', 'butterfly-net']) {
      const k = makeRelic(id); if (k) run.keepsakes.push(k);
    }
    const pool = poolFor(companion);
    const r = run.fork('mock:deck');
    for (let i = 0; i < 6 && pool.length; i++) {
      const def = pool[r.int(pool.length)];
      run.deck.push({ uid: nextUid(), id: def.id, upgraded: i % 3 === 0 });
    }
    // stand somewhere sensible: two rows in, on a node of the requested kind
    const want = node ? run.map.nodes.find(n => run.effectiveType(n) === node) : null;
    const here = want || run.map.nodes.find(n => n.row === 2) || run.map.nodes[0];
    run.currentNodeId = here?.id || null;
    if (here) { here.visited = true; run.visitedIds.push(here.id); run.pathIds.push(here.id); }
    return run;
  }

  /** Rebuild a run from `Save.loadRun()`. Mid-map fidelity, not mid-combat. */
  static resume(saved) {
    if (!saved || !saved.seed) return null;
    /* A save written before the Backpack seam was fixed holds `{name,slots}`
       objects or display names. Migrate rather than throw — refusing to load
       somebody's expedition is a worse outcome than a console warning. */
    const packed = saved.backpack == null
      ? null : migrateLoadout(saved.backpack, `Run.resume(kid:'${saved.kid}')`);
    const run = new Run({
      companion: saved.companion, kid: saved.kid, seed: saved.seed,
      hauntLevel: saved.hauntLevel, backpack: packed,
    });
    UID = Math.max(UID, saved.uidSeq || 0);

    run.courage = saved.courage ?? saved.hp ?? run.courage;
    run.maxCourage = saved.maxCourage ?? saved.maxHp ?? run.maxCourage;
    run.energyMax = saved.energyMax ?? run.energyMax;
    run.lostThings = saved.lostThings ?? saved.gold ?? run.lostThings;
    run.snacks = (saved.snacks || []).map(s => ({ ...s }));

    run.deck = (saved.deck || []).map(c => ({ uid: c.uid || nextUid(), id: c.id, upgraded: !!c.upgraded }))
      .filter(c => !!cardById(c.id));
    run.keepsakes = (saved.keepsakes || saved.relics || []).map(r => {
      const inst = makeRelic(r.id);
      if (!inst) return null;
      inst.counter = r.counter ?? inst.counter;
      inst.forged = !!r.forged;
      if (inst.forged) run._applyForge(inst);
      return inst;
    }).filter(Boolean);

    run.regionIndex = saved.regionIndex || 0;
    run.region = saved.region || saved.regionId || REGION_ORDER[run.regionIndex] || REGION_ORDER[0];
    run.map = saved.map || run.map;
    if (run.map && run.map.regionId !== run.region) run._buildMap();
    run.currentNodeId = saved.currentNodeId || null;
    run.visitedIds = (saved.visitedIds || []).slice();
    run.pathIds = (saved.pathIds || []).slice();
    for (const n of run.map.nodes) n.visited = run.visitedIds.includes(n.id);

    run.rescued = (saved.rescued || []).slice();
    run.companionsFreed = (saved.companionsFreed || []).slice();
    run.cluesFound = saved.cluesFound || 0;
    run.seenEvents = (saved.seenEvents || []).slice();
    run.encounterHistory = (saved.encounterHistory || []).slice();
    run.removalPrice = saved.removalPrice ?? run.removalPrice;
    run.shopsVisited = saved.shopsVisited || 0;
    run.pity = saved.pity || 0;
    run.pendingReward = saved.pendingReward || null;
    run.pendingEvent = saved.pendingEvent || null;
    run.pendingShop = saved.pendingShop || null;
    run.pendingCombat = saved.pendingCombat || null;
    run._roomDone = !!saved.roomDone;
    run._curiosityHealUsed = !!saved.curiosityHealUsed;
    run.stats = { ...run.stats, ...(saved.stats || {}) };
    // Saves from before `stats.floor` was renamed to the unambiguous `depth`.
    if (run.stats.depth == null || run.stats.depth === 0) {
      run.stats.depth = Number(saved.stats?.depth ?? saved.stats?.floor ?? 0) || 0;
    }
    delete run.stats.floor;
    run.startedAt = saved.startedAt || run.startedAt;

    // An unfinished fight must never be resumable as a cleared room, whatever
    // an older save claimed.
    if (run.pendingCombat && run.pendingCombat.nodeId) {
      run.pendingReward = null;
      run._markEntered(run.pendingCombat.nodeId);
    }
    return run;
  }

  /**
   * Where a resumed run should be standing.
   *
   * An unfinished fight resumes INTO the fight — see `restoreInterruptedCombat`.
   * Dropping the player back on the blueprint instead is what let any room in
   * the game, up to and including the boss, be skipped by reloading the page.
   */
  resumeScene() {
    if (this.result) return 'gameover';
    if (this.pendingCombat) return 'combat';
    if (this.pendingReward) return 'reward';
    if (this.pendingEvent && !this.pendingEvent.resolved) return 'event';
    const node = this.currentNode;
    if (node && !this._roomDone) {
      const scene = this.sceneFor(node);
      if (scene === 'shop' || scene === 'rest') return scene;
    }
    return 'map';
  }
}

/**
 * Snacks (potions). Small, single-use, and they read in one line.
 *
 * ── Pricing ─────────────────────────────────────────────────────────────────
 * Now that Snacks can actually be eaten, the price has to mean something. The
 * ladder is StS's, and so is the purse it is measured against:
 *
 *   Scuffle purse    11-19    (StS normal fight: 10-20 gold)
 *   Big Scare        26-36    (StS elite:        25-35)
 *   Boss             92-108   (StS boss:         ~100)
 *   Shop Tricks      55 / 85 / 145 ± 12   (StS cards: 50 / 75 / 150-ish)
 *
 * So one Snack should cost about three Scuffles, and a *strong* one about the
 * same as a common Trick you keep forever — which is the trade the player is
 * actually being asked to make.  The old table was flat (55-75 for everything),
 * so Cold Milk cost the same as +2 Nerve.  Three tiers now:
 *
 *   45  a single clean effect                  (heal, Guard, cleanse)
 *   65  swings a fight                         (AoE, Vulnerable)
 *   80  changes what a turn can do             (+2 Nerve, +2 Strength)
 *
 * `shopStock` adds ±8, so the shelf runs 37-88 against StS's 48-115. Snacks are
 * deliberately a little cheaper than StS potions: this build's fights are
 * shorter, so a Snack has fewer turns in which to pay for itself.
 */
export const SNACKS = [
  { id: 'gummy-bat',     name: 'Gummy Bat',      base: 45, desc: `Recover 12 ${TERMS.hp}.`,               effect: { heal: 12 } },
  { id: 'liquorice',     name: 'Liquorice Rope', base: 45, desc: `Gain 12 ${TERMS.block}.`,               effect: { block: 12 } },
  { id: 'cold-milk',     name: 'Cold Milk',      base: 45, desc: 'Remove all debuffs.',                   effect: { cleanse: true } },
  { id: 'popping-candy', name: 'Popping Candy',  base: 65, desc: 'Deal 10 damage to all enemies.',        effect: { damageAll: 10 } },
  { id: 'jawbreaker',    name: 'Jawbreaker',     base: 65, desc: 'Apply 3 Vulnerable to one enemy.',      effect: { status: ['vulnerable', 3], target: 'enemy' } },
  { id: 'sherbet',       name: 'Sherbet Fizz',   base: 80, desc: `Gain 2 ${TERMS.energy}.`,               effect: { energy: 2 } },
  { id: 'toffee',        name: 'Stubborn Toffee', base: 80, desc: 'Gain 2 Strength.',                     effect: { status: ['strength', 2] } },
];

// ─────────────────────────────────────────────────────────────────────────────
// Run layer installation.
//
// `main.js` (foundation's file) imports every scene at boot, and the four node
// scenes import this module, so this runs once, before anything is clicked.
// It is the only place the run layer wires itself to the rest of the game.
// ─────────────────────────────────────────────────────────────────────────────
let INSTALLED = false;

export function installRunLayer() {
  if (INSTALLED || typeof window === 'undefined') return;
  INSTALLED = true;

  // If the save on disk is mid-fight, the modules needed to rebuild it are
  // needed the instant "Continue" is clicked. Fetch them while the player is
  // still looking at the title screen.
  try { if (Save.loadRun()) warmCombatContent(); } catch { /* storage is best-effort */ }

  bus.on('run:start', (p) => {
    const ctx = window.MM?.ctx;
    warmCombatContent();
    // The one seam a screen can get wrong. Assert here so the stack names the
    // emitter, not `new Run` three frames later. See data/backpack.js.
    if (p?.backpack != null) assertLoadout(p.backpack, "bus 'run:start'.backpack");
    const run = new Run({
      companion: p?.companion, kid: p?.kid, seed: p?.seed,
      hauntLevel: p?.haunt ?? p?.hauntLevel, backpack: p?.backpack,
    });
    run.attach(ctx);
    run.save();
    bus.emit('run:ready', { run });
  });

  // The title screen emits this and then navigates itself, using the `scene`
  // field the snapshot carries. We only have to have `ctx.run` in place first,
  // and `bus.emit` is synchronous, so we do.
  bus.on('run:continue', (payload) => {
    const ctx = window.MM?.ctx;
    const saved = payload && payload.seed ? payload : Save.loadRun();
    if (!saved) return;
    const run = Run.resume(saved);
    if (!run) return;
    run.attach(ctx);
    bus.emit('run:ready', { run });
    // Kick the rebuild NOW, synchronously with the emit, so it is finished
    // before the title's own `scenes.go` gets past its cover transition and
    // scenes/combat.js looks for `ctx.run.combat`.
    if (run.pendingCombat) run.restoreInterruptedCombat();
  });

  // The map screen emits this before it calls `run.chooseNode`, which is a
  // no-op once the node is already current — so the two paths never double-fire.
  bus.on('map:choose', (node) => {
    const run = window.MM?.ctx?.run;
    if (!run || !(run instanceof Run)) return;
    if (!node?.id || node.id === run.currentNodeId) return;
    run.enterNode(node.id);
  });
}

installRunLayer();

export default Run;
