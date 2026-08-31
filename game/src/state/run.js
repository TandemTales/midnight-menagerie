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
import { clock } from '../core/clock.js';
import { NodeType, REGION_ORDER, TERMS, COMPANIONS, KIDS } from '../data/schema.js';
import { generateRegionMap, legalNextIds, regionMeta, sceneForNode } from './mapgen.js';
import {
  cardById, startingDeckFor, poolFor, poolWithCoop, companion as companionDef, allCards,
} from '../data/cards.js';
import { encountersFor, rollEncounter, buildEncounter } from '../data/encounters.js';
import { applyWing, addPipesEnemy } from '../data/wings.js';
import { MAX_PARTY } from '../combat/engine.js';
import { detectStrict } from '../combat/strict.js';
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
 * constant is the only thing holding it short.
 *
 * 2 -> 4 on 2026-08-30, when the Kitchens and Cellars shipped.
 *
 * IT WAS HOLDING BACK A REGION THAT ALREADY EXISTED. The Sleeping Quarters has
 * had a full roster, three Big Scares and the Bedframe Beast since 2026-08-2x,
 * and at 2 the run ended after the Nursery, so no player could ever reach any
 * of it. That is the same unreachable-content class the 2026-08-30 sweep spent
 * a day on, one constant wide, and it is why this number moves with the content
 * rather than after it.
 */
export const RUN_REGIONS = Object.freeze([
  'foyer', 'nursery', 'sleeping-quarters', 'kitchens-cellars', 'greenhouse',
  'graveyard', 'study-library', 'attic-observatory', 'lampworks', 'ballroom',
  'crypt', 'hedge-maze', 'secret-passages', 'bathhouse', 'kennels', 'heart',
]);

/**
 * THE LADDER IS A LIST NOW, NOT A LENGTH, and that is the whole change.
 *
 * `RUN_LENGTH_REGIONS` was a COUNT taken off the front of `REGION_ORDER`, which
 * works only while the built regions are a prefix of the design's seventeen.
 * The Heart is region SEVENTEEN and it is the ending — the only thing that
 * turns a run into a game with a finish — so a count could reach it only by
 * pretending the twelve unbuilt wings in between were finished.
 *
 * `RUN_REGIONS` is therefore the ladder the run actually walks: every region
 * with a roster, in `REGION_ORDER` order, with the Heart last. Building the
 * Greenhouse means adding one string in the right place; nothing else moves,
 * and the Heart stays where it belongs.
 *
 * The constant remains, because it is what everything else asks for and it
 * still means "how many wings is an expedition". It is derived now, so the two
 * cannot disagree.
 */
export const RUN_LENGTH_REGIONS = RUN_REGIONS.length;

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

/** Seconds the blueprint holds on a vote the roulette settled, in SCALED
 *  game time. Sized against the announcement's own word count — see the
 *  note on `_walkAfterVote`, which is where the arithmetic lives. */
const VOTE_BEAT = 3.0;

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
/** @type {{CombatEngine:Function, enemies:Object, statuses:Object, keywords:Object}|null} */
let CONTENT = null;
let CONTENT_P = null;

/** Load (once) everything `buildCombat` needs. Safe to call any number of times. */
export function warmCombatContent() {
  if (CONTENT_P) return CONTENT_P;
  CONTENT_P = (async () => {
    /* `enemies/_lib.js` is deliberately NOT loaded here. It is the shared
       library and it exports only the three CORE status Tricks; the REGISTRY
       (`enemies/index.js`, already in this list) exports those plus every one a
       region adds. Holding both invites the mistake this file used to make. */
    const [engineMod, enemiesMod, statusesMod, keywordsMod] = await Promise.all([
      import('../combat/engine.js'),
      import('../data/enemies/index.js'),
      import('../combat/statuses.js'),
      import('../data/keywords.js'),
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
    this.version = 1;
    this.seed = Number.isFinite(+cfg.seed) ? (+cfg.seed >>> 0) : (hashSeed(String(cfg.seed ?? Date.now())));
    this.hauntLevel = Math.max(0, Number(cfg.hauntLevel ?? cfg.haunt ?? 0) || 0);

    /**
     * The Kids on this expedition, in seat order. ALWAYS at least one; solo is
     * a party of one, exactly as in the combat engine, so nothing below this
     * has a separate single-player path.
     *
     * Shared across the party: the route, the rooms, the enemies, the Haunt
     * level, the seed. Per Kid: deck, Courage, Lost Things, Keepsakes, Backpack,
     * Snacks, card rewards, shop prices. That split is Slay the Spire 2's
     * ("shared map and enemies; per-player deck, gold, energy, HP, relics, card
     * rewards, shop inventory") and it is what makes two Kids feel like two
     * runs being played side by side rather than one run with two cursors.
     * @type {RunKid[]}
     */
    this.kids = [];
    /**
     * The seat THIS client is playing. Every un-suffixed per-Kid field on the
     * Run — `run.deck`, `run.courage`, `run.lostThings` — reads through it, so
     * every screen already shows "my deck" without knowing co-op exists.
     */
    this.localSeat = 0;

    const roster = (cfg.kids && cfg.kids.length ? cfg.kids : [{
      companion: cfg.companion || 'marmalade', kid: cfg.kid || 'maya', backpack: cfg.backpack,
    }]).slice(0, MAX_PARTY);
    for (let i = 0; i < roster.length; i++) this.kids.push(this._makeKid(roster[i] || {}, i));

    const companion = this.companion;
    const kid = this.kid;
    /** The master stream. Content never draws from it directly — see `fork`. */
    this.rng = new RNG(this.seed);

    // ── progression ─────────────────────────────────────────────────────────
    this.regionIndex = 0;
    this.region = RUN_REGIONS[0];
    this.rescued = (Save.data?.companionsRescued || []).slice();
    /** Freed on THIS expedition only — see rescueCompanion(). */
    this.companionsFreed = [];
    this.cluesFound = 0;
    this.seenEvents = [];
    this.encounterHistory = [];
    this.shopsVisited = 0;
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
    this.pendingEvent = null;
    this.combat = null;
    /**
     * The blueprint's open vote: `{ nodeId, votes: { [seat]: id } }`.
     *
     * Deliberately NOT in `snapshot()`. Every other `pending*` on this class
     * survives a save because losing it would lose something the player
     * earned — an offer, a shelf, a fight in progress. A half-cast vote is
     * none of those: quitting on the blueprint and coming back re-opens the
     * fork with nobody committed, which is the honest thing to do anyway
     * when the party has been away.
     */
    this.pendingVote = null;
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
  /**
   * Is the expedition still going?
   *
   * In co-op the run ends only when EVERY Kid is down — one Kid at 0 Courage
   * has fallen, not lost, and comes back at 1 Courage when the team wins the
   * fight they fell in. Reading only the local Kid here would end the run for
   * both players the moment one of them went down.
   */
  get alive() { return this.kids.some(k => k.courage > 0) && this.result !== 'defeat'; }
  /** Is the LOCAL Kid still standing? The HUD asks this, not `alive`. */
  get localAlive() { return this.courage > 0; }
  get companionName() { return COMPANIONS.find(c => c.slug === this.companion)?.name || this.companion; }
  get kidName() { return this.kidNameOf(this.local); }
  /** A named Kid's display name — the party form of `kidName`. */
  kidNameOf(k) { return (k && k.name) || KIDS.find(x => x.slug === (k ? k.kid : this.kid))?.name || (k ? k.kid : this.kid); }
  /** A named Kid's Companion display name. */
  companionNameOf(k) { return COMPANIONS.find(c => c.slug === k.companion)?.name || k.companion; }
  get petName() { return KIDS.find(k => k.slug === this.kid)?.pet || 'your pet'; }
  get currentNode() { return this.nodeById(this.currentNodeId); }
  get isLastRegion() { return this.regionIndex >= RUN_REGIONS.length - 1; }

  /** Aggregated Keepsake + Gear flags. Scenes read this, never a relic by name. */
  get flags() { return this.flagsOf(this.local); }

  /** The same, for a NAMED Kid — the party form. Flags are per Kid: they come
   *  from that Kid's own Keepsakes and their own Backpack. */
  flagsOf(k) {
    const a = relicRunFlags(k ? k.keepsakes : []);
    const b = backpackRunFlags(k ? k.backpack : []);
    return {
      ...a,
      luck: a.luck + ((k && k.pity) || 0),
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
  /**
   * One Kid's whole run-state.
   *
   * `seat` is the stable identity: it orders simultaneous turns in combat, it
   * is what a thrown Snack and a Mend name, and it is what the network layer
   * will address. Seat 0 keeps every default so a solo run is byte-identical to
   * what it was before the party existed.
   */
  _makeKid(cfg, seat) {
    const companion = cfg.companion || 'marmalade';
    const kid = cfg.kid || 'maya';
    const comp = companionDef(companion);
    /* A Companion with no registered def is not a hard-mode Companion, it is a
       run with no cards: `startingDeckFor()` answers `[]` and nothing throws.
       A save written before `missingCompanions()` gated the rescue pool can
       still name one, and a shipped build must not throw at a player mid-run
       (CONTRACTS: degrade rather than throw), so this is fatal in dev and loud
       everywhere. */
    if (!comp) {
      const msg = `[run] no registered Companion "${companion}" - data/cards.js does not `
        + 'import it, so this Kid would start with an empty deck. Build it, or pick another.';
      if (detectStrict()) throw new Error(msg);
      console.error(msg);
    }
    const maxCourage = comp?.startingHp ?? 70;
    const k = {
      seat, companion, kid,
      name: cfg.name || null,
      /* The Backpack seam. `cfg.backpack` is `string[]` of ids from
         data/backpack.js — never names, never `{name,slots}` objects. A wrong
         shape here does not throw on its own: it produces an empty tag Set,
         zeroed gear flags, no hooks and permanently locked Curiosity options,
         which is exactly how this pillar of the game sat dead for a whole
         build. So it is asserted at the join instead (CONTRACTS.md rule 8).
         An EMPTY array is honoured, not replaced: "I brought nothing" is a
         loadout decision the design doc makes available (§19). */
      backpack: cfg.backpack == null
        ? defaultLoadout(kid)
        : assertLoadout(cfg.backpack, `new Run({kid:'${kid}'})`).slice(),
      maxCourage,
      courage: maxCourage,
      energyMax: comp?.startingEnergy ?? 3,
      lostThings: 99,
      snacks: [],
      snackCap: 3,
      deck: [],
      keepsakes: [],
      pity: 0,                   // rare-card pity counter (STS2 §6 "luck")
      removalPrice: 65,          // Mr. Moth's card-removal service, per Kid
      pendingReward: null,       // each Kid drafts their own card reward
    };
    k.deck = startingDeckFor(companion).map(def => this._instance(def));
    const starter = starterKeepsake(companion);
    if (starter) k.keepsakes.push(starter);
    return k;
  }

  /** The Kid this client is playing. */
  get local() { return this.kids[this.localSeat] || this.kids[0]; }

  /**
   * Hand the game to another Kid AT THIS SCREEN.
   *
   * Every per-Kid thing in this file — deck, Keepsakes, the shop shelf, the
   * card offer, the Safe Room's options — is reached through `this.local`, so
   * moving the seat moves all of it at once. That is the whole of pass-and-play,
   * and it is the exact call a transport removes: with a wire, each client sets
   * its seat once at the start and never moves it again.
   *
   * Emits `run:seat` so a screen already on the board can redraw for whoever
   * just picked up the controller rather than being torn down and rebuilt.
   */
  setLocalSeat(n) {
    const seat = Math.max(0, Math.min(this.kids.length - 1, n | 0));
    if (seat === this.localSeat) return this.local;
    const from = this.localSeat;
    this.localSeat = seat;
    bus.emit('run:seat', { seat, from, kid: this.local, name: this.kidNameOf(this.local) });
    this.save();
    return this.local;
  }

  /**
   * Do something AS another seat, without the screen following.
   *
   * The run-layer twin of `engine._asSeat`, and it exists for the same reason:
   * `takeRewardCard`, `buyCard`, `forgeKeepsake` and every other room action
   * act on `this.local`, so a remote Kid's action arriving over the wire has to
   * be applied to THEIR Kid rather than to whoever is looking at this screen.
   *
   * `setLocalSeat` is the wrong tool for that — it emits `run:seat`, which is
   * how a pass-and-play handoff redresses the whole screen, so using it here
   * would repaint the local player's HUD as their friend every time their
   * friend bought a Snack. This moves the seat and puts it back, silently.
   *
   * **`engine.localSeat` deliberately does NOT move with it.** CONTRACTS says
   * the engine's seat follows the Run's, and that is right for a pass-and-play
   * HANDOFF, where the screen has genuinely changed hands. This is the other
   * case: the screen still belongs to whoever is looking at it, and a remote
   * Kid's card is only being replayed. `choices.ask({ seat })` opens the picker
   * when the seat matches `engine.localSeat`, so moving it here would pop a
   * choice for their Trick in front of me — on every client at once, each
   * answering it separately, which is a desync rather than a wrong screen.
   *
   * Safe because `net/session.js` applies inputs strictly one at a time: there
   * is never a second action in flight to see the borrowed seat. If `fn` is
   * async the seat is restored when it settles, and the queue is what
   * guarantees nothing else ran in between.
   */
  asSeat(seat, fn) {
    const n = Math.max(0, Math.min(this.kids.length - 1, seat | 0));
    const was = this.localSeat;
    if (n === was) return fn();
    const restore = () => { this.localSeat = was; };
    this.localSeat = n;
    let out;
    try { out = fn(); } catch (err) { restore(); throw err; }
    if (out && typeof out.then === 'function') {
      return out.then(v => { restore(); return v; }, e => { restore(); throw e; });
    }
    restore();
    return out;
  }

  /**
   * Has this Kid finished with the room they are standing in?
   *
   * A Safe Room or a shop is per Kid and each one gets a turn at it, but
   * "finished" cannot mean "used it" — a Kid may look at Mr. Moth's shelf and
   * buy nothing, and they must not then be handed the screen forever. So the
   * marker is the NODE they were last done with, set when their turn at it
   * ends either way, and it rides on the seat so it survives a save.
   */
  markRoomDone(kid = null) {
    const k = kid || this.local;
    if (k) k.roomDone = this.currentNodeId;
    this.save();
    return k;
  }
  /** Has this Kid had their turn in the room we are standing in? */
  roomDoneBy(kid) { return !!kid && kid.roomDone === this.currentNodeId; }

  /**
   * Back to the lowest living seat.
   *
   * Called on the way OUT of a room as well as on the way in. The blueprint is
   * shared but the HUD on it is not — Courage, Tricks and the Gear row all
   * belong to whoever the screen currently is — so coming back from a room on
   * seat 1 and flipping to seat 0 on the next door is a visible twitch of
   * "whose numbers are these". The map always shows the first Kid.
   */
  resetSeat() {
    /**
     * NOT over a wire. `localSeat` means two different things depending on how
     * the game is being played, and this is the line where that bites.
     *
     * At one keyboard it is "whose turn it is with the controller", and moving
     * it to the first living Kid at every door is the whole point — the screen
     * genuinely changes hands. With a session, each client OWNS one seat for
     * the whole expedition and `localSeat` is "which Kid I am". Moving it then
     * hands every client seat 0's screen: their HUD becomes somebody else's
     * Courage, `run.local` answers as the wrong Kid, and — since `_buildCombat`
     * passes `localSeat` to the engine as "which Kid is at THIS screen" — the
     * choice broker starts opening other people's pickers in front of them.
     *
     * `shouldHandOff()` in ui/handoff.js asks the same question for the same
     * reason and is the reference for it; this cannot import that module
     * (ui/ depends on state/, not the other way round), so the condition is
     * repeated rather than shared, and both name each other.
     */
    if (this.session && this.session.remote) return this.local;
    const first = this.kids.findIndex(k => k.courage > 0);
    if (first >= 0) this.setLocalSeat(first);
    return this.local;
  }

  /**
   * The next Kid, in seat order after the local one, that `needs()` says still
   * has something to do. Wraps, and never returns the local Kid.
   *
   * Seat order and not "whoever is left" so a three-Kid table hands over in the
   * same order every time — the same reason every seat choice in combat ties on
   * seat index.
   */
  nextSeatNeeding(needs) {
    const n = this.kids.length;
    for (let i = 1; i < n; i++) {
      const seat = (this.localSeat + i) % n;
      const k = this.kids[seat];
      if (k && needs(k, seat)) return seat;
    }
    return -1;
  }
  /** Every Kid on the expedition, in seat order. */
  get party() { return this.kids; }
  /** How many Kids went in. */
  get partySize() { return this.kids.length; }
  /** True when this is a co-op expedition. */
  get isParty() { return this.kids.length > 1; }
  /** A Kid by seat, or null. */
  kidAt(n) { return this.kids[n] || null; }
  /** The other Kid, in a two-Kid expedition. Null in solo. */
  get partner() { return this.kids.length > 1 ? this.kids[1 - this.localSeat] : null; }

  /** Heal a NAMED Kid. `heal()` heals the local one. */
  healKid(k, n) {
    if (!k || n <= 0) return 0;
    const before = k.courage;
    k.courage = Math.min(k.maxCourage, k.courage + Math.round(n));
    return k.courage - before;
  }

  _instance(def, upgraded = false) {
    if (!def) return null;
    return { uid: nextUid(), id: def.id, upgraded: !!upgraded };
  }
  /** The CardDef behind a deck entry. */
  defOf(entry) { return entry ? cardById(entry.id) : undefined; }
  /** Deck as `[{def, upgraded, uid}]` — what CardView and the engine want. */
  deckViews() { return this.deckViewsOf(this.local); }
  /** The same, for a named Kid — the party form. */
  deckViewsOf(k) {
    return (k ? k.deck : []).map(c => ({ uid: c.uid, upgraded: c.upgraded, def: cardById(c.id) }))
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
    this.ctx?.audio?.play?.('card:upgrade');   // in the bank since the sound pass, never called
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
    // `world:coin` has been in the bank, tuned, since the sound pass, with no
    // caller: the only thing that would have played it was a `on('gold')` bus
    // handler listening for a name nothing emits. Gains only — spending is not
    // a coin sound.
    if (amount > 0) this.ctx?.audio?.play?.('world:coin');
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
  /**
   * Put away EVERY Kid's offer for the room being left, not just the local
   * one's.
   *
   * `pendingReward` is per Kid, so clearing `this.pendingReward` clears the
   * local Kid's and leaves the other seat holding an offer for a room that is
   * already behind them — which is then saved, and comes back on resume as an
   * unclaimed reward on a cleared node.
   */
  clearOffers() {
    for (const k of this.kids) k.pendingReward = null;
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

  // ══ the route is voted ═══════════════════════════════════════════════════
  /**
   * Which seats owe a vote at this fork: everyone still standing.
   *
   * A fallen Kid does not vote. They are still on the expedition — the party
   * carries them — but the route is a decision made by whoever can walk it,
   * and leaving a dead seat in the tally would stall the fork forever.
   */
  voters() {
    const out = [];
    for (let i = 0; i < this.kids.length; i++) if (this.kids[i].courage > 0) out.push(i);
    return out.length ? out : [0];
  }

  /** Seats that have not voted yet at the fork the party is standing on. */
  votesPending() {
    const v = this._voteBook();
    return this.voters().filter(seat => v.votes[seat] === undefined);
  }

  /** The open ballot, opened (or re-opened at a new fork) on demand. */
  _voteBook() {
    const at = this.currentNodeId || null;
    if (!this.pendingVote || this.pendingVote.nodeId !== at) {
      // Keyed by the fork it belongs to, so a vote cast in the last room
      // cannot be counted in this one. The party moves; the ballot does not
      // move with it.
      this.pendingVote = { nodeId: at, votes: {} };
    }
    return this.pendingVote;
  }

  /**
   * One seat's vote for the next room. Where `ACT.MAP_VOTE` lands.
   *
   * StS2-REFERENCE 8.5: one shared path, every player votes at every fork,
   * a weighted roulette picks the winner, and **the host has no special
   * authority**. A minority vote can win, proportionally to how many wanted
   * it. That last part is the mechanic, not a rough edge — it is what stops
   * one loud player dragging the team around a whole expedition, which is
   * exactly what this game did before: `resetSeat()` puts the blueprint on
   * the lowest living seat and that seat chose the entire route.
   *
   * Decisive only when it is the LAST vote owed — the same shape as
   * `ROOM_DONE`, where every Kid sends the same verb and the last one closes
   * the room. A party of one is the degenerate case and resolves on its own
   * first vote, walking into the room exactly as it always did.
   */
  voteNode(nodeId, seat = this.localSeat) {
    const id = typeof nodeId === 'string' ? nodeId : nodeId?.id;
    if (!id || !this.nodeById(id)) return null;
    // NOT `if (this.currentNodeId && ...)`. `legalNextIds` already answers
    // correctly for a null current node — it returns the doorway row — so
    // guarding the guard only meant that at every region doorway a vote
    // could name ANY node on the sheet, the boss included.
    if (!this.isLegal(id)) return null;
    const n = seat | 0;
    if (!this.voters().includes(n)) return null;   // a fallen seat has no say
    const book = this._voteBook();
    book.votes[n] = id;
    bus.emit('map:vote', { seat: n, nodeId: id, run: this,
                           pending: this.votesPending().slice() });
    /* A DOOR IS NOT A FORK. Where only one exit is legal, every vote still
       owed is forced to that same node, so the outcome is already settled and
       the remaining seats are being asked to ratify a choice they do not have
       — four clicks, and in hotseat three `.hoff__go` passes between them, to
       walk through the only door there is.

       Resolving early is the SAME result, sooner: `resolveVote` tallies the
       votes actually cast, a single candidate makes `items.length === 1`, so
       the winner is that node and `rolled` stays false — no roulette claim and
       no beat, which is already what a unanimous ballot produces.

       It stays deterministic. `legalNextIds()` reads committed map state that
       every client shares, and the resolve is triggered by the first
       `map.vote` in LOG order, which `session._pump` makes the same everywhere
       — not by whichever client's player happened to click first. */
    const forced = this.legalNextIds().length <= 1;
    if (this.votesPending().length && !forced) return null;  // someone to hear from
    return this.resolveVote();
  }

  /**
   * Spin the roulette and walk in. Every client runs this, not just a host.
   *
   * ── Why a fork, and not `this.rng` ─────────────────────────────────────
   *
   * THIS is what keeps a solo run byte-identical, and it is worth being
   * precise because the first version of this comment credited the wrong
   * thing. The master stream is the run's spine — every reward, shelf and
   * encounter draws downstream of it — so taking a number from it here would
   * shift every later roll by however much the party happened to disagree,
   * and a party of one would shift by simply existing. `fork(tag)` builds a
   * whole separate RNG from the seed and the tag, so a draw here moves
   * nothing at all, however many times it is taken.
   *
   * The tag carries the fork we are standing on AND the ballot, so the same
   * three Kids at the same door always get the same answer — which is what a
   * replay needs — while a different split is a different draw, rather than
   * one fixed answer per node that could be read off a recording.
   *
   * ── Why it skips the draw for one candidate ────────────────────────────
   *
   * Not for determinism: `weighted()` on a single item returns that item, so
   * drawing would give the same room. It is so `rolled` MEANS something. The
   * screen has to tell the player when a number overrode them (CONTRACTS 45)
   * and "the roulette chose" is a lie when nobody disagreed.
   */
  resolveVote() {
    const book = this._voteBook();
    const seats = Object.keys(book.votes).map(Number).sort((a, b) => a - b);
    if (!seats.length) return null;
    const tally = new Map();
    for (const seat of seats) {
      const id = book.votes[seat];
      tally.set(id, (tally.get(id) || 0) + 1);
    }
    const items = [...tally].map(([id, w]) => ({ id, w }));
    let winner = items[0].id;
    if (items.length > 1) {
      const ballot = seats.map(s => `${s}:${book.votes[s]}`).join(',');
      winner = this.fork(`vote|${book.nodeId || 'door'}|${ballot}`).weighted(items).id;
    }
    const result = { winner, votes: { ...book.votes },
                     tally: Object.fromEntries(tally), rolled: items.length > 1 };
    this.pendingVote = null;
    this.lastVote = result;   // the sheet they come back to repeats it
    bus.emit('map:voted', { ...result, run: this });
    return this._walkAfterVote(result);
  }

  /**
   * The beat between the draw and the door.
   *
   * A number just overrode what somebody voted for, and the party has to be
   * told (CONTRACTS 45). `map:voted` above is emitted while the blueprint is
   * still the screen on the glass — but `enterNode` asks for the next scene
   * immediately, and MEASURED, the announcement it produced was gone inside
   * 1.4 s without ever being sampled: `scenes.go` covers the screen BEFORE it
   * calls `exit()`, so the sheet is already veiled.
   *
   * So the resolution waits. This is a game beat, not decoration — the
   * roulette is a moment in StS2 too — and no state moves while it does.
   * It is NOT wall time: `clock.wait` counts scaled game time, so a client
   * with the game paused or slowed waits longer. That is right for a beat
   * whose whole job is to be looked at, and wrong to describe as "every
   * client waits the same amount", which is what this comment used to say.
   *
   * ── 1.5 s → 3.0 s, 2026-08-30, and this is arithmetic not taste ────────
   *
   * The handoff carried "the beat is unplaytested" as a question for the
   * designer for three sessions. It did not need a playtest; it needed
   * somebody to count the words. `scenes/map.js _announceVote` renders
   * "The house chose <room>" plus "<n> of <m> wanted it · the rest were
   * outvoted by the draw" — about eighteen words. On-screen reading for
   * comprehension runs 200–250 wpm, so that text takes 4.3–5.4 s to read,
   * 3.6 s at a fast skim, plus roughly 0.3 s to notice a thing appearing.
   *
   * **1.5 s was about a third of what its own message needs.** It cleared the
   * MEASURED 1.4 s the announcement used to survive for, which is why it was
   * chosen — but that floor was about the card still EXISTING, not about
   * anybody being able to read it. A floor and a duration are different
   * questions and only the first had been asked.
   *
   * 3.0 s rather than the full 5.4 because this message REPEATS. The first
   * time you must read all of it; after that you are checking two things,
   * which room and the tally, and that is about six words — 1.8 s plus
   * noticing. 3.0 is comfortable for the familiar case and tolerable for the
   * first, and it only ever fires when the roulette actually overrode
   * somebody, which `tests/vote` measures at 48 of 150 forks.
   *
   * The genuinely correct fix is for the verdict to SURVIVE the transition
   * instead of being covered by it — `scenes.go` veils the screen before
   * `exit()`, which is what destroys the card — and then the beat could go
   * back to being short. That is a scene-layer change and it is not this
   * one.
   *
   * ── and only when there is somebody to tell ────────────────────────────
   *
   * No `ctx.scenes` means no screen: a headless harness, a rejoining client
   * replaying a log, `tests/vote` spinning 150 ballots. Waiting there would
   * add three and a half minutes to one suite to animate nothing. `_goto`
   * already no-ops on the same test, for the same reason.
   */
  async _walkAfterVote(result) {
    // `session.absorbing` is a client catching up on a log after a rejoin.
    // It has scenes, so the `ctx.scenes` test alone let it sit through the
    // beat once per split vote — twenty rooms of catching up is twenty
    // seconds of watching a verdict for a fork that was settled while it was
    // away. There is nobody to tell.
    const watched = this.ctx?.scenes && !this.session?.absorbing;
    if (result.rolled && watched) {
      try { await clock.wait(VOTE_BEAT); } catch { /* a clock that is gone is not fatal */ }
    }
    try { await this.enterNode(result.winner); } catch { /* the walk reports itself */ }
    return result;
  }

  /** The direct walk. Nothing in a played game calls it: a vote resolves
   *  through `resolveVote` -> `_walkAfterVote` -> `enterNode`. Kept as the
   *  by-name entry point for harnesses and for a future scripted move. */
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
    // See `voteNode`: a null `currentNodeId` is a DOORWAY, not a wildcard.
    if (!this.isLegal(nodeId)) return null;

    // Captured BEFORE `currentNodeId` moves — the moonlit boon below pays on
    // the way OUT of its wing, so it needs the room the party is leaving.
    const leaving = this.nodeById(this.currentNodeId);

    this._roomDone = false;
    this._markEntered(nodeId);
    if (this.currentNodeId && !this.pathIds.includes(this.currentNodeId)) this.pathIds.push(this.currentNodeId);
    this.pathIds.push(nodeId);
    this.currentNodeId = nodeId;
    const rows = this.map?.rows ?? 6;
    this.stats.depth = Math.max(this.stats.depth, this.regionIndex * rows + node.row + 1);

    /**
     * A room starts with the lowest living seat, every time.
     *
     * Without this the seat stays wherever the previous room left it, so
     * whoever happened to go last at Mr. Moth's goes first in the Safe Room and
     * the order flips from room to room. Nobody gains anything by it — the
     * shelves and the offers are separate — but "who goes first" should not be
     * a thing the players have to work out fresh at every door. It is the same
     * rule combat uses for the top of a round.
     *
     * FIRST, not last. Everything below this line that touches a Kid used to
     * run against whoever `local` happened to be on the way in — and once the
     * route was voted, that was the Kid who cast the LAST vote. The floor
     * sagged under whoever clicked last.
     */
    this.resetSeat();

    /**
     * "Moonlit Rooms: moonlight through the roof lights. LEAVING the marked
     * area restores 8 Courage."
     *
     * mapgen places exactly one boon wing per blueprint and this is it. It was
     * drawn on the sheet, named in the footer, listed in the legend and
     * described in its own hover card — and implemented nowhere, along with
     * five of the six hazards. Every Kid is restored, for the same reason
     * every Kid pays for the sagging floor: the wing is a property of the
     * ROOMS, not of whoever is holding the controller.
     *
     * `leaving` is captured at the top of this method, because by here
     * `currentNodeId` is already the room being ENTERED — which is how the
     * first version of this silently paid out nothing at all.
     */
    if (leaving?.payload?.hazard === 'moonlit' && node.payload?.hazard !== 'moonlit') {
      for (let i = 0; i < this.kids.length; i++) {
        if (this.kids[i].courage > 0) this.asSeat(i, () => this.heal(8));
      }
    }

    // Hazard wings bite on entry (mapgen HAZARDS).
    //
    // "The Floor Sags: entering any room inside the marked area costs 3
    // Courage. The boards remember your weight" — with the surveyor's note
    // "joists unsound, do not crowd". EVERY Kid who walks in pays it, which
    // is both what the rule says and the only reading that does not depend on
    // which seat the screen happens to be on. A party of one is unchanged.
    if (node.payload?.hazard === 'sagging') {
      for (const k of this.kids) if (k.courage > 0) this.asSeat(this.kids.indexOf(k), () => this.hurt(3));
    }
    // Clues are SHARED (`cluesFound` is not a PER_KID field), so this one is
    // a single grant however many Kids walked in.
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
   * A room only joins `visitedIds` when it *resolves* — see `_markCleared` — so
   * this actively takes an entry back out.  Not defensive: `Run.demo` stands the
   * party on a node and marks it visited, and a save from an older build can
   * claim a room was cleared when the fight in it was only interrupted
   * (`restoreInterruptedCombat` calls this for exactly that).  The difference it
   * keeps is between quitting mid-fight and being handed the room for free.
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
    this.resetSeat();
    this.clearOffers();
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
    let members = buildEncounter(enc.id, rng, this.hauntLevel);
    if (!opts.replay) this.encounterHistory.push(enc.id);

    /* "The Pipes Rattle: noise carries. Every Scuffle inside the marked area
       brings one extra small enemy." The ROSTER changes, so it has to happen
       before the engine is built — every other wing is applied to the built
       engine by `applyWing`. */
    const wing = node?.payload?.hazard || null;
    if (wing === 'pipes') members = addPipesEnemy(members);

    const hpMul = this.flags.enemyHpMul || 1;
    const enemies = members.map((m, i) => {
      const def = getEnemy(m.enemyId);
      return def ? { def, hp: Math.max(1, Math.round(m.hp * hpMul)), id: `e${i}` } : null;
    }).filter(Boolean);

    // One seat per Kid, each with their OWN deck and Keepsakes. Solo builds a
    // one-element array and the engine treats it exactly as it always did.
    const seats = this.kids.map(k => ({
      name: this.kidNameOf(k), companion: k.companion, kid: k.kid,
      maxHp: k.maxCourage, hp: k.courage,
      energyMax: k.energyMax, drawPerTurn: 5,
      deck: this.deckViewsOf(k).map(c => ({ def: c.def, upgraded: c.upgraded })),
      relics: [...k.keepsakes, ...backpackHooks(k.backpack)],
    }));
    const engine = new CombatEngine({
      rng,
      players: seats,
      enemies,
      bus,
      // Which Kid is at THIS screen. The choice broker will not ask the person
      // sitting here to make the other Kid's decisions.
      localSeat: this.localSeat | 0,
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
      /* Enemy-generated status Tricks (`ctx.addCard('clutter')`, and every
         Ballroom Invitation). The global keyword/status registries were already
         loaded by warmCombatContent(); this is the only per-engine part of
         loadContentRegistries().

         `C.enemies` is `enemies/index.js`, THE REGISTRY. This used to read
         `enemies/_lib.js`, the shared library, which carries only the three
         CORE Tricks — so every region-supplied Trick was unresolvable at
         runtime. See the long note at the same call in `scenes/combat.js`. */
      if (C.enemies && C.enemies.STATUS_TRICK_DEFS) {
        engine.registerCards(C.enemies.STATUS_TRICK_DEFS);
      }
      /* The marked area this room sits in. BEFORE `startCombat()`, which rolls
         the opening intents — two of the wings are about what can be read of
         one. `applyWing` is a no-op for the three room-effect wings and for a
         room in no wing at all. */
      applyWing(engine, wing);
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
    // Every seat's opening draw pile, keyed by seat so a replay can tell two
    // Kids' cards apart. Solo produces exactly the old `d0..dN` keys, so an
    // in-flight single-player save still replays.
    engine.players.forEach((pl, seat) => {
      pl.piles.draw.forEach((c, i) => put(c.uid, seat === 0 ? `d${i}` : `d${seat}_${i}`));
    });
    let extra = 0;
    const off = engine.on('card:add', (ev) => {
      if (ev && ev.cardUid && !byUid.has(ev.cardUid)) put(ev.cardUid, `x${extra++}`);
    });
    return { byUid, byKey, off };
  }

  _wireCombat(engine) {
    this._unwireCombat();
    const offs = this._combatOffs;
    /* A resumed fight hands over the map it built before replaying — see
       `_replayCombat`. Building a fresh one here would read a depleted draw
       pile and name almost nothing. */
    const keys = this._resumeKeys || this._cardKeys(engine);
    this._resumeKeys = null;
    offs.push(keys.off);
    this._combatKeys = keys;

    offs.push(engine.on('combat:end', (ev) => this._onCombatEnd(ev)));

    // "DAMAGE DEALT 0" lived here: nothing ever added combat damage to the run.
    // The engine's own counter is per-turn, so the run watches the events.
    // Any seat's damage counts toward the run, and damage BETWEEN seats never
    // does. Reading `engine.player.id` here was seat 0 only — and throws
    // outright in a party with the dev guard armed.
    const seatIds = new Set(engine.players.map(pl => pl.id));
    offs.push(engine.on('damage', (ev) => {
      if (!ev || !seatIds.has(ev.sourceId) || seatIds.has(ev.targetId)) return;
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
      // Every seat, in seat order. A digest that only covered seat 0 would call
      // a replay "identical" while the other Kid's board had diverged.
      e.players.map(pl => [
        pl.hp, pl.block, pl.energy, pl.fallen ? 1 : 0,
        pl.piles.hand.map(c => `${c.id}${c.upgraded ? '+' : ''}`).join('|'),
        pl.piles.draw.length, pl.piles.discard.length, pl.piles.exhaust.length,
      ].join(':')).join(';'),
      e.enemies.map(x => `${x.id}:${x.hp}:${x.block}:${x.alive ? 1 : 0}`).join(','),
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
    this.clearOffers();
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
    /**
     * Built BEFORE `startCombat()`, while every card is still in the draw pile
     * in run-deck order — which is the only moment `_cardKeys` is correct.
     *
     * It is handed to `_wireCombat` afterwards. `_wireCombat` builds its own
     * map, and on the resume path it was building it from a MID-FIGHT draw
     * pile: by then the replay has moved cards to hand, discard and exhaust, so
     * they had no key at all, and the first card played after a resume could
     * not be named. A second interruption then lost the fight entirely.
     */
    const keys = this._cardKeys(engine);
    this._resumeKeys = keys;
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
      /* Kept alive when the replay SUCCEEDED — `_wireCombat` adopts it, and
         its `card:add` listener has to keep numbering the `x<n>` cards. On a
         failed replay nothing adopts it, so it is disposed here. */
      if (this._resumeKeys !== keys) keys.off();
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

    // Every Kid carries their own Courage out of the fight. A fallen Kid was
    // already revived to 1 by the engine if the team won, so this reads the
    // post-revival number and the Safe Room sees a Kid who is up again.
    for (const k of this.kids) {
      const seat = engine.players[k.seat];
      if (seat) k.courage = Math.max(0, seat.hp);
    }
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

    const eliteBonus = type === NodeType.BIG_SCARE ? 5 : type === NodeType.BOSS ? 10 : 0;
    const cards = this.rollCardReward(rng, { count: 3, eliteBonus, forKid: this.local });

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
    /**
     * EVERY Kid drafts their own three, from their OWN Companion's pool and off
     * their OWN forked stream — sharing one roll would offer a Bones player
     * three Marmalade Tricks, and sharing one stream would make the second
     * Kid's offer depend on the order the two were rolled.
     *
     * The KEEPSAKE is theirs too, which it was not: it was rolled once against
     * the local Kid's collection and the local Kid's luck, while the cards
     * beside it were per Kid. Slay the Spire 2 settles it — a relic reward
     * screen there "presents four different relics simultaneously, one per
     * player", and a treasure chest offers one relic per player. Nothing about
     * a relic is shared.
     *
     * "Four DIFFERENT relics" is the part that needs the running set: each Kid
     * is rolled against what they already own AND against what the other Kids
     * have just been offered, so the team is never looking at one Keepsake
     * twice. Their own luck decides their own rarity.
     *
     * Not built, and it needs the wire: StS2 resolves two players reaching for
     * the same relic with rock-paper-scissors. Here nobody can reach for
     * somebody else's, so there is nothing to resolve yet.
     */
    const offered = new Set(keepsake ? [keepsake.id] : []);
    for (const k of this.kids) {
      if (k === this.local) continue;
      const kRng = this.fork(`reward:${node?.id || 'x'}:seat${k.seat}`);
      const kOwned = new Set([...(k.keepsakes || []).map(x => x.id), ...offered]);
      const kLuck = this.flagsOf(k).luck;
      let kKeep = null;
      if (type === NodeType.BIG_SCARE) kKeep = rollKeepsake(kRng, { owned: kOwned, rarity: rollKeepsakeRarity(kRng, kLuck) });
      if (type === NodeType.BOSS) kKeep = rollKeepsake(kRng, { owned: kOwned, rarity: 'boss' }) || rollKeepsake(kRng, { owned: kOwned, rarity: 'rare' });
      if (kKeep) offered.add(kKeep.id);
      k.pendingReward = {
        ...this.pendingReward,
        cards: this.rollCardReward(kRng, { count: 3, eliteBonus, forKid: k })
          .map(def => ({ id: def.id, rarity: def.rarity })),
        keepsake: kKeep ? kKeep.id : null,
        taken: [],
      };
    }

    bus.emit('run:reward', { reward: this.pendingReward, node, type });
    this.save();
    return navigate ? this._goto('reward', { node: node?.id, region: this.region }) : this.pendingReward;
  }

  /** A treasure room: one Keepsake, no fight. */
  _prepareTreasure(node) {
    this.ctx?.audio?.play?.('world:treasure');
    const rng = this.fork(`treasure:${node.id}`);
    const owned = this.ownedKeepsakeIds();
    const k = rollKeepsake(rng, { owned, rarity: rollKeepsakeRarity(rng, this.flags.luck) });
    this.stats.treasures++;
    this.pendingReward = {
      kind: 'treasure', nodeId: node.id,
      lostThings: rng.range(20, 45), cards: [], keepsake: k ? k.id : null,
      clues: 0, taken: [],
    };
    // "Treasure chests offer one relic per player" — Slay the Spire 2. One
    // chest, one Keepsake each, and never the same one twice across the party.
    const offered = new Set(k ? [k.id] : []);
    for (const kid of this.kids) {
      if (kid === this.local) continue;
      const kRng = this.fork(`treasure:${node.id}:seat${kid.seat}`);
      const kOwned = new Set([...(kid.keepsakes || []).map(x => x.id), ...offered]);
      const kk = rollKeepsake(kRng, { owned: kOwned, rarity: rollKeepsakeRarity(kRng, this.flagsOf(kid).luck) });
      if (kk) offered.add(kk.id);
      kid.pendingReward = {
        ...this.pendingReward,
        keepsake: kk ? kk.id : null,
        lostThings: kRng.range(20, 45),
        taken: [],
      };
    }
    bus.emit('run:reward', { reward: this.pendingReward, node, type: NodeType.TREASURE });
    this.save();
  }

  /**
   * Three distinct Tricks from this Companion's pool.
   * Base ladder mirrors StS: 60 / 37 / 3, rare shifted by luck + pity.
   */
  /**
   * Three Tricks to choose from.
   *
   * `forKid` is which Kid is being offered them, because the pool is their
   * COMPANION'S — offering a Bones player three Marmalade Tricks is not a
   * reward, it is a bug. Defaults to the local Kid, which is what solo means.
   *
   * `coop` folds in that Companion's multiplayer-only Tricks, which are outside
   * the 80 and must never appear in a solo draft.
   */
  rollCardReward(rng, { count = 3, eliteBonus = 0, forKid = null, coop = null } = {}) {
    const who = forKid || this.local;
    const asParty = coop == null ? this.isParty : !!coop;
    // THEIR luck, not the local Kid's. Rarity odds come off Keepsakes and pity,
    // both of which are per Kid, so reading `this.flags` here had seat 1's card
    // rarities decided by seat 0's collection.
    const luck = this.flagsOf(who).luck + eliteBonus;
    const out = [];
    const seen = new Set(out.map(c => c.id));
    for (let i = 0; i < count; i++) {
      const rarity = this._rollRarity(rng, luck);
      let pool = poolWithCoop(who.companion, rarity, { coop: asParty }).filter(c => !seen.has(c.id));
      if (!pool.length) pool = poolWithCoop(who.companion, null, { coop: asParty }).filter(c => !seen.has(c.id));
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
  /**
   * Collect the purse + Keepsake and go back to the blueprint.
   *
   * `close: false` takes only the LOCAL Kid's half and leaves the room open,
   * which is what pass-and-play needs: each Kid claims their own spoils in
   * turn and the last one out shuts the door. Every caller that is not handing
   * the screen over wants the default.
   */
  claimReward({ close = true } = {}) {
    const r = this.pendingReward;
    if (!r) return close ? this.leaveNode() : false;
    if (r.lostThings) this.addLostThings(r.lostThings, { raw: true });
    if (r.keepsake) this.addKeepsake(r.keepsake);
    if (r.clues) this.addClues(r.clues);
    if (r.keepsake && this.flags.maxHpOnMilestone && r.kind === 'bigScare') {
      this.addMaxCourage(this.flags.maxHpOnMilestone);
    }
    // Just mine. `clearOffers()` below is the job of the Kid who closes it.
    this.local.pendingReward = null;
    if (!close) { this.save(); return true; }
    const wasBoss = r.kind === 'boss';
    this.resetSeat();
    this.clearOffers();
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
  /**
   * Deterministic stock for one shop node, for ONE Kid.
   *
   * Every shelf is that Kid's: their Companion's card pool, Keepsakes they do
   * not already own, prices bent by their own Keepsake and Gear flags, and
   * their own rising removal price. Two Kids on the same Companion get
   * DIFFERENT shelves, because the roll is forked per seat — otherwise they
   * would stand in front of one shop looking at two identical lists and race
   * for the same card.
   *
   * The fork key for seat 0 is unchanged (`shop:<node>`), so every existing
   * seed still rolls the shop it always rolled and the 50-run determinism sim
   * does not move.
   */
  shopStock(node = this.currentNode, who = null) {
    const kid = who || this.local;
    const seat = this.kids.indexOf(kid);
    const id = node?.id || `shop-${this.shopsVisited}`;
    const rng = this.fork(seat > 0 ? `shop:${id}:${seat}` : `shop:${id}`);
    const f = this.flagsOf(kid);
    const disc = f.shopDiscount || 1;
    const price = (base, spread) => Math.max(5, Math.round((base + rng.range(-spread, spread)) * disc));

    const cards = [];
    const seen = new Set((kid.deck || []).map(c => c.id));
    const wants = [
      ['common', 55], ['common', 55], ['uncommon', 85],
      ['uncommon', 85], [f.shopRare ? 'rare' : 'uncommon', f.shopRare ? 145 : 90],
    ];
    for (const [rarity, base] of wants) {
      let pool = poolFor(kid.companion, rarity).filter(c => !cards.some(x => x.id === c.id));
      if (!pool.length) pool = poolFor(kid.companion).filter(c => !cards.some(x => x.id === c.id));
      if (!pool.length) continue;
      const def = pool[rng.int(pool.length)];
      cards.push({ id: def.id, rarity: def.rarity, price: price(base, 12), owned: seen.has(def.id) });
    }

    const owned = new Set((kid.keepsakes || []).map(k => k.id));
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

    return {
      nodeId: id, seat: Math.max(0, seat),
      cards, keepsakes, snacks: offered, removal: kid.removalPrice,
    };
  }

  /** One shop visit: the rolled stock plus what has already been bought. */
  _prepareShop(node) {
    if (this.pendingShop?.nodeId === node.id) return this.pendingShop;
    this.shopsVisited++;
    this.stats.shops++;
    this.pendingShop = { nodeId: node.id, sold: [], soldBy: {} };
    this.save();
    return this.pendingShop;
  }

  /**
   * What has already been bought off ONE Kid's shelf.
   *
   * Per seat, because the shelves are per seat: a shared list meant the other
   * Kid buying a Keepsake struck the same row off YOUR shop, which is a
   * different Keepsake at a different price and possibly one you had been
   * saving for. `sold` is kept alongside as seat 0's list so an older save
   * migrates without losing what the solo player had already bought.
   */
  shopSold(who = null) {
    const p = this.pendingShop;
    if (!p) return [];
    const seat = Math.max(0, this.kids.indexOf(who || this.local));
    if (p.soldBy && p.soldBy[seat]) return p.soldBy[seat];
    return seat === 0 ? (p.sold || []) : [];
  }
  _markSold(key) {
    if (!key) return;
    if (!this.pendingShop) this.pendingShop = { nodeId: this.currentNodeId, sold: [], soldBy: {} };
    const p = this.pendingShop;
    const seat = Math.max(0, this.kids.indexOf(this.local));
    if (!p.soldBy) p.soldBy = {};
    const list = p.soldBy[seat] || (p.soldBy[seat] = (seat === 0 ? (p.sold || []).slice() : []));
    if (!list.includes(key)) list.push(key);
    if (seat === 0) p.sold = list;      // the solo spelling, kept in step
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
        rescue: true, nodeId: node.id, resolved: null, resolvedBy: {}, pendingBy: {},
        companion: this.rescueTargetFor(node.id, authored),
      };
      this.save();
      return this.pendingEvent;
    }
    const def = rollEvent(rng, this.region, { depth: node.row, seen: this.seenEvents });
    // `resolvedBy` is per seat: the room is shared and each Kid answers it for
    // themselves. `resolved` stays as the solo spelling and as seat 0's answer.
    this.pendingEvent = { id: def.id, nodeId: node.id, resolved: null, resolvedBy: {}, pendingBy: {} };
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
  /**
   * What THIS Kid answered, if they have. Each Kid answers the room for
   * themselves; the room itself is shared.
   */
  eventAnswerFor(kid = null) {
    const p = this.pendingEvent;
    if (!p) return null;
    const seat = Math.max(0, this.kids.indexOf(kid || this.local));
    if (p.resolvedBy && p.resolvedBy[seat]) {
      return { resolved: p.resolvedBy[seat], pending: (p.pendingBy || {})[seat] || null };
    }
    // An older save, or solo: `resolved` alone is seat 0's answer.
    if (seat === 0 && p.resolved) return { resolved: p.resolved, pending: p.pending || null };
    return null;
  }

  chooseEventOption(optionId) {
    const p = this.pendingEvent;
    const def = this.currentEvent();
    if (!p || !def) return null;
    const option = def.options.find(o => o.id === optionId);
    if (!option || !this.optionOpen(option)) return null;
    if (option.cost?.lostThings && !this.spendLostThings(option.cost.lostThings)) return null;

    /**
     * Forked per SEAT as well as per option.
     *
     * The room is shared and each Kid answers it themselves — Slay the Spire 2
     * co-op shares the map and the node, and "individual choices within events
     * may differ". Two Kids picking the same option must not therefore get the
     * same roll off the same stream, or the second one is just watching a
     * replay of the first.
     */
    const seat = Math.max(0, this.kids.indexOf(this.local));
    const rng = this.fork(seat > 0 ? `event:${p.nodeId}:${optionId}:seat${seat}`
                                   : `event:${p.nodeId}:${optionId}`);
    const outcome = rollOutcome(rng, option);
    if (!this.seenEvents.includes(def.id)) this.seenEvents.push(def.id);
    const answer = { option: optionId, title: outcome.title, text: outcome.text };
    p.resolved = answer;                       // the local Kid's, the solo spelling
    (p.resolvedBy || (p.resolvedBy = {}))[seat] = answer;
    const pending = this.applyEffects(outcome.effects || {}, rng, `event:${p.nodeId}`);
    p.pending = pending;
    (p.pendingBy || (p.pendingBy = {}))[seat] = pending;
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
   *
   * A FOURTH kind is not: a Companion with no registered card pool. `schema.js`
   * lists all sixteen because sixteen is the design target, but only the ones
   * `data/cards.js` imports can actually be played. Freeing an unbuilt one
   * writes it to the lifetime save at `end()`, `availableCompanions()` then
   * makes it pickable, and `startingDeckFor()` answers `[]` - a run that begins
   * with an EMPTY DECK, no throw and no console output. Measured before this
   * gate existed: 178 of 200 seeds had the Foyer boss free an unbuilt
   * Companion, because the authored table points Wing 1 at Marmalade, a starter
   * who is already home, so `rescueTargetFor()` substitutes on nearly every run.
   * `companionDef` IS the registry, so this gate opens by itself as each
   * Companion is built - there is no second list to keep in step.
   */
  missingCompanions() {
    return COMPANIONS.map(c => c.slug).filter(s =>
      s !== this.companion && !this.rescued.includes(s) && !STARTER_SLUGS.has(s)
      && !!companionDef(s));
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
    // The whole emotional beat of the game, and it was silent: `sting:rescue`
    // is a rising five-note phrase nothing has ever played. `world:rescue-chime`
    // is separate and already plays from scenes/combat.js.
    this.ctx?.audio?.stinger?.('sting:rescue');
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
    if (this.isLastRegion || this.regionIndex + 1 >= RUN_REGIONS.length) return this.end(true, null);
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
    /**
     * THE BREATHER IS FOR THE WHOLE PARTY.
     *
     * This read `this.courage` and `this.maxCourage`, which are the un-suffixed
     * aliases for `this.local` — so in co-op exactly ONE seat got the floor and
     * every other Kid crossed into the Nursery on whatever they walked out of
     * the boss fight with, including a Kid the engine had just revived at 1
     * Courage. The measurement this whole mechanic exists for ("you started act
     * two nearly dead") was being applied to a quarter of the party.
     *
     * The event still reports the TOTAL restored, which is what the HUD's
     * heal readout wants; each Kid is floored against their OWN maximum,
     * because Companions do not share a starting Courage.
     */
    let healed = 0;
    for (const k of this.kids) {
      const floor = Math.round((k.maxCourage || 0) * REGION_ENTRY_FLOOR);
      if (k.courage < floor) { healed += floor - k.courage; k.courage = floor; }
    }
    if (healed > 0) bus.emit('run:heal', { amount: healed, reason: 'wing' });
    this.regionIndex++;
    this.region = RUN_REGIONS[this.regionIndex];
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
      if (victory) {
        meta.stats.wins = (meta.stats.wins || 0) + 1;
        /* The ladder moves HERE and nowhere else, and until 2026-08-29 it moved
           nowhere at all — `hauntLevel` was written by the default and read by
           two pickers, so every save sat on Haunt 0 for ever. A party climbs
           its own ladder; see the note in `core/save.js`. */
        Save.advanceHaunt(this.partySize, this.hauntLevel);
      }
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

      // Every Kid, in seat order. The flat fields above are seat 0's and are
      // kept so an older save still loads and a solo save is unchanged in
      // shape; `kids` is what a co-op resume actually reads.
      kids: this.kids.map(k => this._kidSnapshot(k)),
      localSeat: this.localSeat,

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

  /** One Kid, serialised. Mirrors the flat fields exactly. */
  _kidSnapshot(k) {
    return {
      seat: k.seat, companion: k.companion, kid: k.kid, name: k.name || null,
      backpack: k.backpack.slice(),
      courage: k.courage, maxCourage: k.maxCourage, energyMax: k.energyMax,
      lostThings: k.lostThings,
      snacks: k.snacks.map(x => ({ ...x })),
      snackCap: k.snackCap,
      deck: k.deck.map(c => ({ uid: c.uid, id: c.id, upgraded: c.upgraded, name: cardById(c.id)?.name || c.id })),
      keepsakes: k.keepsakes.map(r => ({
        id: r.id, name: r.name, desc: r.desc, rarity: r.rarity,
        counter: r.counter ?? null, forged: !!r.forged, icon: r.icon,
      })),
      pity: k.pity, removalPrice: k.removalPrice,
      pendingReward: k.pendingReward || null,
      roomDone: k.roomDone || null,
    };
  }

  /** Restore one Kid from `_kidSnapshot`. */
  _restoreKid(saved, seat) {
    const k = this._makeKid({
      companion: saved.companion, kid: saved.kid, name: saved.name,
      backpack: saved.backpack == null ? null
        : migrateLoadout(saved.backpack, `Run.resume(seat:${seat})`),
    }, seat);
    k.courage = saved.courage ?? k.courage;
    k.maxCourage = saved.maxCourage ?? k.maxCourage;
    k.energyMax = saved.energyMax ?? k.energyMax;
    k.lostThings = saved.lostThings ?? k.lostThings;
    k.snacks = (saved.snacks || []).map(x => ({ ...x }));
    k.snackCap = saved.snackCap ?? k.snackCap;
    k.deck = (saved.deck || []).map(c => ({ uid: c.uid || nextUid(), id: c.id, upgraded: !!c.upgraded }))
      .filter(c => !!cardById(c.id));
    k.keepsakes = (saved.keepsakes || []).map(r => {
      const inst = makeRelic(r.id);
      if (!inst) return null;
      inst.counter = r.counter ?? inst.counter;
      inst.forged = !!r.forged;
      if (inst.forged) this._applyForge(inst);
      return inst;
    }).filter(Boolean);
    k.pity = saved.pity || 0;
    k.removalPrice = saved.removalPrice ?? k.removalPrice;
    k.pendingReward = saved.pendingReward || null;
    k.roomDone = saved.roomDone || null;
    return k;
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
  static mock({ seed = 20260820, companion = 'marmalade', kid = 'maya', node = null, kids = null } = {}) {
    const run = new Run(kids ? { seed, kids } : { companion, kid, seed });
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
    const r = run.fork('mock:deck');
    // Every Kid gets a plausible mid-run deck, not just seat 0 — a co-op review
    // screen with one full deck and one starter deck tells you nothing.
    for (const k of run.kids) {
      const pool = poolFor(k.companion);
      for (let i = 0; i < 6 && pool.length; i++) {
        const def = pool[r.int(pool.length)];
        k.deck.push({ uid: nextUid(), id: def.id, upgraded: i % 3 === 0 });
      }
      if (k !== run.local) {
        k.courage = Math.round(k.maxCourage * 0.48);
        k.lostThings = 180;
        for (const id of ['nightlight', 'butterfly-net']) {
          const rel = makeRelic(id); if (rel) k.keepsakes.push(rel);
        }
      }
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

    // A co-op save carries every Kid. A solo save (and every save written
    // before the party existed) carries only the flat fields, and falls through
    // to the single-Kid path below — which is why `kids` is checked rather than
    // assumed.
    if (Array.isArray(saved.kids) && saved.kids.length) {
      run.kids = saved.kids.slice(0, MAX_PARTY).map((k, i) => run._restoreKid(k, i));
      run.localSeat = Math.min(saved.localSeat || 0, run.kids.length - 1);
      // The flat `backpack` is the LOCAL seat's by definition (that is what
      // snapshot writes), and it is the field a pre-fix save carries in the old
      // `{name, slots}` shape. Applying the migrated version after the seats
      // are built keeps both paths working: without this, a save that has both
      // silently kept the un-migrated seat copy and the migration was dead.
      if (packed) run.local.backpack = packed.slice();
    }

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
    run.region = saved.region || saved.regionId || RUN_REGIONS[run.regionIndex] || RUN_REGIONS[0];
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
      run.clearOffers();
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
      // A co-op expedition comes in through the SAME seam as a solo one, so
      // there is no second start path to keep in step. `kids` is an array of
      // { companion, kid, name, backpack }; absent means a party of one.
      kids: p?.kids,
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

  /**
   * There was a `map:choose` listener here that called `run.enterNode`, and it
   * was the ONLY thing a click on the blueprint actually did. `scenes/map.js`
   * also called `chooseNode` — but it wrote `currentNodeId` first, which made
   * that call's own guard true, so it moved nothing on any click ever measured.
   * The whole party's route therefore reached the run layer down a BUS NAME,
   * never as an input, and so could not cross a wire. It goes through
   * `ACT.MAP_VOTE` now, like every other room action; `map:choose` is still
   * emitted and is audio's alone.
   */
}

installRunLayer();

/**
 * Per-Kid fields, exposed on the Run as the LOCAL Kid's.
 *
 * `run.deck`, `run.courage`, `run.lostThings` and the rest keep meaning exactly
 * what they always meant — "mine" — so every screen, Keepsake and Curiosity in
 * the game reads correctly in co-op without knowing co-op exists. The party is
 * reached deliberately through `run.kids`, `run.partner` or `run.kidAt(n)`.
 *
 * Defined as accessors rather than copied on seat switch: a copy would let a
 * screen hold a stale reference to the other Kid's deck, which is the silent
 * kind of wrong this project keeps getting bitten by.
 */
const PER_KID = [
  'companion', 'kid', 'backpack', 'maxCourage', 'courage', 'energyMax',
  'lostThings', 'snacks', 'snackCap', 'deck', 'keepsakes', 'pity',
  'removalPrice', 'pendingReward',
];
for (const key of PER_KID) {
  Object.defineProperty(Run.prototype, key, {
    get() { const k = this.local; return k ? k[key] : undefined; },
    set(v) { const k = this.local; if (k) k[key] = v; },
    enumerable: false, configurable: true,
  });
}

export default Run;
