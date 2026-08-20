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
 *    walked path and which Curiosities have been seen.
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
 *   courage · maxCourage · lostThings · keepsakes · snacks
 *   region · regionIndex · map · currentNode · legalNodes() · enterNode(id)
 *   hauntLevel · rescued · cluesFound
 *   rng
 *
 * Legacy aliases the other agents' scenes already read (`hp`, `maxHp`, `gold`,
 * `relics`, `regionId`, `currentNodeId`, `visitedIds`, `pathIds`, `floor`,
 * `combat`, `chooseNode`) are all live properties, not copies.
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
import { defaultLoadout, backpackHooks, backpackRunFlags, backpackTags } from '../data/backpack.js';
import { rollEvent, eventById, rollOutcome } from '../data/events.js';

/**
 * How many regions one expedition covers in this build.  The full campaign is
 * 17 (REGION_ORDER); the structure below walks the ladder properly, this
 * constant is the only thing holding it to one.
 */
export const RUN_LENGTH_REGIONS = 1;

/** Base Lost Things per room type, before Keepsake multipliers. */
const PURSE = {
  [NodeType.SCUFFLE]:   [11, 19],
  [NodeType.BIG_SCARE]: [26, 36],
  [NodeType.BOSS]:      [92, 108],
};

let UID = 0;
const nextUid = () => `c${(++UID).toString(36)}`;

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
    this.backpack = Array.isArray(cfg.backpack) && cfg.backpack.length
      ? cfg.backpack.slice() : defaultLoadout(kid);

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
      treasures: 0, cardsPlayed: 0, damageDealt: 0, turns: 0, floor: 0,
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
    this._ctx = null;
    this._offCombat = null;

    this._buildMap();
  }

  // ══ identity / derived ═══════════════════════════════════════════════════
  get regionId() { return this.region; }
  get meta() { return regionMeta(this.region); }
  get floor() { return this.regionIndex + 1; }
  get hp() { return this.courage; }
  set hp(v) { this.courage = v; }
  get maxHp() { return this.maxCourage; }
  set maxHp(v) { this.maxCourage = v; }
  get gold() { return this.lostThings; }
  set gold(v) { this.lostThings = v; }
  get relics() { return this.keepsakes; }
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

    node.visited = true;
    this._roomDone = false;
    if (!this.visitedIds.includes(nodeId)) this.visitedIds.push(nodeId);
    if (this.currentNodeId && !this.pathIds.includes(this.currentNodeId)) this.pathIds.push(this.currentNodeId);
    this.pathIds.push(nodeId);
    this.currentNodeId = nodeId;
    this.stats.floor = Math.max(this.stats.floor, node.row + 1);

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

  /** Leave a non-combat room and go back to the blueprint. */
  leaveNode() {
    this.pendingReward = null;
    this.pendingEvent = null;
    this.pendingShop = null;
    this._roomDone = true;
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
  async buildCombat(node, type = null) {
    const t = type || this.effectiveType(node);
    const tier = this.tierFor(node, t);
    const region = this._contentRegion(tier);
    const rng = this.fork(`combat:${node.id}`);

    const [{ CombatEngine }, enemiesMod, statusesMod, keywordsMod] = await Promise.all([
      import('../combat/engine.js'),
      import('../data/enemies/index.js'),
      import('../combat/statuses.js'),
      import('../data/keywords.js'),
    ]);
    const { getEnemy, ENEMY_STATUSES, ENEMY_LIST } = enemiesMod;
    if (ENEMY_STATUSES) statusesMod.registerStatuses?.(ENEMY_STATUSES);

    const enc = rollEncounter(region, tier, rng, this.encounterHistory);
    const members = buildEncounter(enc.id, rng, this.hauntLevel);
    this.encounterHistory.push(enc.id);

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
    } catch { /* registries are best-effort */ }
    await keywordsMod.loadContentRegistries?.(engine);

    this.combatMeta = { nodeId: node.id, type: t, tier, encounter: enc.id, name: enc.name, region };
    return engine;
  }

  async _startCombat(node, type) {
    const engine = await this.buildCombat(node, type);
    this.combat = engine;
    this._offCombat?.();
    this._offCombat = engine.on('combat:end', (ev) => this._onCombatEnd(ev));
    bus.emit('run:combatStart', { node, engine, meta: this.combatMeta });
    this.save();
    return this._goto('combat', { node: node.id, region: this.region, seed: this.seed });
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
    this._offCombat?.(); this._offCombat = null;

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
      this.pendingEvent = { rescue: true, nodeId: node.id, companion: node.payload?.companion || this.meta.companion, resolved: null };
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
    this.combat = engine;
    this._offCombat?.();
    this._offCombat = engine.on('combat:end', (ev) => this._onCombatEnd(ev));
    bus.emit('run:combatStart', { node, engine, meta: this.combatMeta });
    return this._goto('combat', { node: node.id, region: this.region });
  }

  /** Free a Companion. The point of the whole exercise. */
  rescueCompanion(slug) {
    if (!slug || this.rescued.includes(slug)) return false;
    this.rescued.push(slug);
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
    if (!this.rescued.includes(meta.companion) && meta.companion) this.rescueCompanion(meta.companion);
    if (this.isLastRegion || this.regionIndex + 1 >= REGION_ORDER.length) return this.end(true, null);
    return this.advanceRegion();
  }

  advanceRegion() {
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
    this._offCombat?.(); this._offCombat = null;

    const meta = Save.data;
    if (meta) {
      meta.stats.runs = (meta.stats.runs || 0) + 1;
      if (victory) meta.stats.wins = (meta.stats.wins || 0) + 1;
      meta.stats.bestFloor = Math.max(meta.stats.bestFloor || 0, this.stats.floor);
      meta.stats.cardsPlayed = (meta.stats.cardsPlayed || 0) + this.stats.cardsPlayed;
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
    });
  }

  // ══ persistence ══════════════════════════════════════════════════════════
  /** Plain and serialisable. `window.MM.state()` reads exactly this. */
  snapshot() {
    return {
      version: this.version,
      seed: this.seed, companion: this.companion, kid: this.kid,
      hauntLevel: this.hauntLevel, backpack: this.backpack.slice(),

      courage: this.courage, maxCourage: this.maxCourage,
      hp: this.courage, maxHp: this.maxCourage,
      energyMax: this.energyMax,
      lostThings: this.lostThings, gold: this.lostThings,
      snacks: this.snacks.map(s => ({ ...s })),

      deck: this.deck.map(c => ({ uid: c.uid, id: c.id, upgraded: c.upgraded, name: cardById(c.id)?.name || c.id })),
      relics: this.keepsakes.map(k => ({
        id: k.id, name: k.name, desc: k.desc, rarity: k.rarity,
        counter: k.counter ?? null, forged: !!k.forged, icon: k.icon,
      })),

      region: this.region, regionId: this.region, regionIndex: this.regionIndex,
      floor: this.floor,
      map: this.map,
      currentNodeId: this.currentNodeId,
      visitedIds: this.visitedIds.slice(),
      pathIds: this.pathIds.slice(),

      rescued: this.rescued.slice(), cluesFound: this.cluesFound,
      seenEvents: this.seenEvents.slice(),
      encounterHistory: this.encounterHistory.slice(),
      removalPrice: this.removalPrice, shopsVisited: this.shopsVisited, pity: this.pity,

      pendingReward: this.pendingReward,
      pendingEvent: this.pendingEvent,
      pendingShop: this.pendingShop || null,
      roomDone: !!this._roomDone,
      curiosityHealUsed: !!this._curiosityHealUsed,

      stats: { ...this.stats },
      result: this.result, killedBy: this.killedBy,
      companionsFreed: this.rescued.slice(),
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
    run.stats = { ...run.stats, scuffles: 5, bigScares: 1, curiosities: 2, floor: 4 };
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
    const run = new Run({
      companion: saved.companion, kid: saved.kid, seed: saved.seed,
      hauntLevel: saved.hauntLevel, backpack: saved.backpack,
    });
    UID = Math.max(UID, saved.uidSeq || 0);

    run.courage = saved.courage ?? saved.hp ?? run.courage;
    run.maxCourage = saved.maxCourage ?? saved.maxHp ?? run.maxCourage;
    run.energyMax = saved.energyMax ?? run.energyMax;
    run.lostThings = saved.lostThings ?? saved.gold ?? run.lostThings;
    run.snacks = (saved.snacks || []).map(s => ({ ...s }));

    run.deck = (saved.deck || []).map(c => ({ uid: c.uid || nextUid(), id: c.id, upgraded: !!c.upgraded }))
      .filter(c => !!cardById(c.id));
    run.keepsakes = (saved.relics || []).map(r => {
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
    run.cluesFound = saved.cluesFound || 0;
    run.seenEvents = (saved.seenEvents || []).slice();
    run.encounterHistory = (saved.encounterHistory || []).slice();
    run.removalPrice = saved.removalPrice ?? run.removalPrice;
    run.shopsVisited = saved.shopsVisited || 0;
    run.pity = saved.pity || 0;
    run.pendingReward = saved.pendingReward || null;
    run.pendingEvent = saved.pendingEvent || null;
    run.pendingShop = saved.pendingShop || null;
    run._roomDone = !!saved.roomDone;
    run._curiosityHealUsed = !!saved.curiosityHealUsed;
    run.stats = { ...run.stats, ...(saved.stats || {}) };
    run.startedAt = saved.startedAt || run.startedAt;
    return run;
  }

  /**
   * Where a resumed run should be standing.
   *
   * Mid-combat resume is explicitly out of scope: an unfinished fight drops the
   * player back on the blueprint rather than being re-run for free, which is
   * both honest and non-exploitable.  Everything else resumes in place.
   */
  resumeScene() {
    if (this.result) return 'gameover';
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

/** Snacks (potions). Small, single-use, and they read in one line. */
export const SNACKS = [
  { id: 'gummy-bat',     name: 'Gummy Bat',      base: 55, desc: `Recover 12 ${TERMS.hp}.`,               effect: { heal: 12 } },
  { id: 'liquorice',     name: 'Liquorice Rope', base: 60, desc: `Gain 12 ${TERMS.block}.`,               effect: { block: 12 } },
  { id: 'popping-candy', name: 'Popping Candy',  base: 70, desc: 'Deal 10 damage to all enemies.',        effect: { damageAll: 10 } },
  { id: 'sherbet',       name: 'Sherbet Fizz',   base: 70, desc: `Gain 2 ${TERMS.energy}.`,               effect: { energy: 2 } },
  { id: 'toffee',        name: 'Stubborn Toffee', base: 65, desc: 'Gain 2 Strength.',                     effect: { status: ['strength', 2] } },
  { id: 'cold-milk',     name: 'Cold Milk',      base: 60, desc: 'Remove all debuffs.',                   effect: { cleanse: true } },
  { id: 'jawbreaker',    name: 'Jawbreaker',     base: 75, desc: 'Apply 3 Vulnerable to one enemy.',      effect: { status: ['vulnerable', 3], target: 'enemy' } },
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

  bus.on('run:start', (p) => {
    const ctx = window.MM?.ctx;
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
