/**
 * Achievements.  OWNER: platform.
 *
 *   import { achievements, ACHIEVEMENTS } from './achievements.js';
 *   achievements.wire(ctx);            // once, from main.js
 *
 * ── HOW ONE FIRES ──────────────────────────────────────────────────────────
 *
 * Every achievement declares the bus event it listens to and a predicate. The
 * engine keeps ONE bus subscription per distinct event name and evaluates only
 * the achievements registered against it, so adding the fortieth costs nothing
 * at runtime. Nothing in `scenes/` or `state/` knows achievements exist — the
 * run layer already emits `run:end`, `run:rescue`, `run:keepsake`,
 * `run:combatEnd` and the rest, and this file is a subscriber like any other.
 * That is the same reason the audio bank is a subscriber: a system that has to
 * be called from thirty places is a system that will be forgotten in three.
 *
 * ── THE FOURTEEN REGIONS THAT DO NOT EXIST ─────────────────────────────────
 *
 * `REGION_ORDER` declares seventeen. `data/enemies/` has three. So an
 * achievement for "reach the Heart" is one no player could earn, and a Steam
 * page listing achievements nobody has is a review complaint with a screenshot
 * attached.
 *
 * Each entry therefore carries `requires`, naming the content it needs, and
 * `shippable()` returns only those whose content exists TODAY. The rest are
 * written, tested, and deliberately not registered with Steam yet — the work of
 * designing them is done and the day the Greenhouse ships they are one array
 * membership away from live. `plannedFor()` lists them so the omission is
 * visible rather than forgotten.
 *
 * ── OFFLINE ────────────────────────────────────────────────────────────────
 *
 * A player earns achievements with Steam closed, on a plane, in the browser
 * build. Unlocks are always written to the local save first and pushed to Steam
 * second, and `reconcile()` re-pushes anything Steam has not got on the next
 * boot where it is available. Steam is the mirror; the save is the record.
 */

import { Platform } from '../platform/index.js';
import { REGION_ORDER, COMPANIONS, NodeType } from '../data/schema.js';

/* ── what content actually exists ───────────────────────────────────────────
 * Kept as data rather than probed, because probing `data/enemies/index.js` at
 * module load would make the catalogue depend on the content registry being
 * booted, and this file is imported by the settings panel. When a region ships,
 * this list is where it gets added — and `tests/achievements/run.py` asserts the
 * list matches the enemy pools that really exist, so it cannot rot silently.
 */
export const BUILT_REGIONS = ['foyer', 'nursery', 'sleeping-quarters'];
export const BUILT_BOSSES = ['butler', 'governess', 'bedframe-beast'];

const TIER = { bronze: 'bronze', silver: 'silver', gold: 'gold' };

/**
 * @typedef {Object} AchievementDef
 * @property {string}  id        kebab-case, stable forever. Renaming one orphans every earned copy.
 * @property {string}  name
 * @property {string}  desc      what the player reads BEFORE earning it
 * @property {string}  [earned]  what they read after, when it should differ
 * @property {boolean} [hidden]  desc is withheld until earned
 * @property {string}  on        bus event, or several separated by spaces
 * @property {(p:any, api:AchApi) => boolean} when
 * @property {number}  [goal]    makes it a PROGRESS achievement; `when` returning true adds 1
 * @property {(p:any, api:AchApi) => number} [add]  how much progress this event is worth
 * @property {string}  [requires] content gate: a region slug, 'coop', or null for always
 * @property {string}  [tier]
 */

/** The catalogue. Order is display order. */
export const ACHIEVEMENTS = [
  /* ── the first hour ──────────────────────────────────────────────────── */
  {
    id: 'first-scuffle', name: 'Something Moved', tier: TIER.bronze,
    desc: 'Win your first Scuffle.',
    on: 'run:combatEnd', when: (p) => !!p.victory,
  },
  {
    id: 'first-wing', name: 'One Wing Down', tier: TIER.bronze,
    desc: 'Clear a whole wing of the house.',
    on: 'run:region', when: (p) => (p.index | 0) >= 1,
  },
  {
    id: 'first-win', name: 'Out Before Morning', tier: TIER.silver,
    desc: 'Finish an expedition alive.',
    on: 'run:end', when: (p) => !!p.victory,
  },
  {
    id: 'first-loss', name: 'The Candle Goes Out', tier: TIER.bronze,
    desc: 'Lose a run. It happens to everyone.',
    on: 'run:end', when: (p) => !p.victory,
  },

  /* ── the Companions ──────────────────────────────────────────────────── */
  {
    id: 'first-rescue', name: 'Somebody Is Coming', tier: TIER.silver,
    desc: 'Free a Companion from the house.',
    on: 'run:rescue', when: () => true,
  },
  {
    id: 'rescue-four', name: 'A Small Menagerie', tier: TIER.silver,
    desc: 'Free four different Companions.',
    on: 'run:rescue', goal: 4,
    when: (p, api) => api.firstTime('rescued', p.companion),
  },
  {
    id: 'rescue-all', name: 'Midnight Menagerie', tier: TIER.gold,
    desc: 'Free every Companion in the house.',
    on: 'run:rescue', goal: COMPANIONS.length,
    when: (p, api) => api.firstTime('rescued', p.companion),
    requires: 'all-regions',
  },
  {
    id: 'played-eight', name: 'Nobody Sits Out', tier: TIER.silver,
    desc: 'Take eight different Companions on an expedition.',
    on: 'run:start', goal: 8,
    when: (p, api) => api.firstTime('played', api.run && api.run.companion),
  },
  {
    id: 'played-all', name: 'Every Last One', tier: TIER.gold,
    desc: 'Take all sixteen Companions on an expedition.',
    on: 'run:start', goal: COMPANIONS.length,
    when: (p, api) => api.firstTime('played', api.run && api.run.companion),
  },

  /* ── the house ───────────────────────────────────────────────────────── */
  {
    id: 'beat-butler', name: 'After You', tier: TIER.silver,
    desc: 'Defeat the Butler.',
    on: 'run:combatEnd', when: (p, api) => p.victory && api.bossWas('butler'),
  },
  {
    id: 'beat-governess', name: 'Sit Up Straight', tier: TIER.silver,
    desc: 'Defeat the Governess.',
    on: 'run:combatEnd', when: (p, api) => p.victory && api.bossWas('governess'),
  },
  {
    id: 'beat-bedframe', name: 'Under the Bed', tier: TIER.silver,
    desc: 'Defeat the Bedframe Beast.',
    on: 'run:combatEnd', when: (p, api) => p.victory && api.bossWas('bedframe-beast'),
  },
  {
    id: 'reach-heart', name: 'The Heart of the House', tier: TIER.gold,
    desc: 'Reach the last room.',
    on: 'run:region', when: (p) => p.region === 'heart',
    requires: 'heart',
  },

  /* ── the Haunt ladder ────────────────────────────────────────────────── */
  {
    id: 'haunt-1', name: 'It Noticed', tier: TIER.silver,
    desc: 'Win a run at Haunt 1 or higher.',
    on: 'run:end', when: (p, api) => p.victory && api.hauntPlayed() >= 1,
  },
  {
    id: 'haunt-3', name: 'It Is Waiting For You', tier: TIER.gold,
    desc: 'Win a run at Haunt 3 or higher.',
    on: 'run:end', when: (p, api) => p.victory && api.hauntPlayed() >= 3,
  },
  {
    id: 'haunt-5', name: 'The House Is Awake', tier: TIER.gold,
    desc: 'Win a run at Haunt 5.',
    on: 'run:end', when: (p, api) => p.victory && api.hauntPlayed() >= 5,
  },

  /* ── decks ───────────────────────────────────────────────────────────── */
  {
    id: 'big-deck', name: 'Everything Is Useful', tier: TIER.bronze,
    desc: 'Carry 35 Tricks at once.',
    on: 'run:deck', when: (p, api) => api.deckSize() >= 35,
  },
  {
    id: 'lean-deck', name: 'Travel Light', tier: TIER.silver,
    desc: 'Reach a boss carrying 12 Tricks or fewer.',
    on: 'run:combatStart', when: (p, api) => api.isBoss(p) && api.deckSize() <= 12 && api.deckSize() > 0,
  },
  {
    id: 'ten-upgrades', name: 'Practised', tier: TIER.bronze,
    desc: 'Upgrade ten Tricks in one expedition.',
    on: 'run:deck', goal: 10,
    when: (p) => p.action === 'upgrade',
    perRun: true,
  },
  {
    id: 'cursed', name: 'Carrying Something', tier: TIER.bronze, hidden: true,
    desc: 'End an expedition holding four Curses.',
    on: 'run:end', when: (p, api) => api.countInDeck((c) => String(c.id).startsWith('curse/')) >= 4,
  },

  /* ── Keepsakes and the Backpack ──────────────────────────────────────── */
  {
    id: 'first-keepsake', name: 'Pocketed', tier: TIER.bronze,
    desc: 'Pick up a Keepsake.',
    on: 'run:keepsake', when: () => true,
  },
  {
    id: 'eight-keepsakes', name: 'Heavy Pockets', tier: TIER.silver,
    desc: 'Hold eight Keepsakes at once.',
    on: 'run:keepsake', when: (p, api) => api.keepsakeCount() >= 8,
  },
  {
    id: 'forged', name: 'Made It Yours', tier: TIER.bronze,
    desc: 'Forge a Keepsake.',
    on: 'run:forge', when: () => true,
  },

  /* ── skill ───────────────────────────────────────────────────────────── */
  {
    id: 'untouched-boss', name: 'Not a Scratch', tier: TIER.gold,
    desc: 'Beat a boss without losing any Courage.',
    on: 'run:combatEnd',
    when: (p, api) => p.victory && api.isBoss(p) && api.courageLostThisFight() === 0,
  },
  {
    id: 'big-turn', name: 'All At Once', tier: TIER.silver,
    desc: 'Play ten Tricks in a single turn.',
    on: 'run:combatEnd', when: (p, api) => api.mostCardsInATurn() >= 10,
  },
  {
    id: 'last-breath', name: 'One Courage Left', tier: TIER.silver, hidden: true,
    desc: 'Win a Scuffle on exactly 1 Courage.',
    on: 'run:combatEnd', when: (p, api) => p.victory && api.courageNow() === 1,
  },

  /* ── co-op ───────────────────────────────────────────────────────────── */
  {
    id: 'coop-first', name: 'Two Torches', tier: TIER.bronze,
    desc: 'Start an expedition with another Kid.',
    on: 'run:start', when: (p, api) => api.partySize() >= 2,
    requires: 'coop',
  },
  {
    id: 'coop-four', name: 'The Whole Gang', tier: TIER.silver,
    desc: 'Start an expedition with four Kids.',
    on: 'run:start', when: (p, api) => api.partySize() >= 4,
    requires: 'coop',
  },
  {
    id: 'coop-win', name: 'Nobody Left Behind', tier: TIER.gold,
    desc: 'Finish an expedition with every Kid still standing.',
    on: 'run:end',
    when: (p, api) => p.victory && api.partySize() >= 2 && api.allKidsAlive(),
    requires: 'coop',
  },

  /* ── the long game ───────────────────────────────────────────────────── */
  {
    id: 'ten-runs', name: 'Again Tomorrow Night', tier: TIER.bronze,
    desc: 'Finish ten expeditions.',
    on: 'run:end', goal: 10, when: () => true,
  },
  {
    id: 'fifty-runs', name: 'It Knows Your Name', tier: TIER.silver,
    desc: 'Finish fifty expeditions.',
    on: 'run:end', goal: 50, when: () => true,
  },
  {
    id: 'clue-hunter', name: 'Reading the House', tier: TIER.bronze,
    desc: 'Find twenty Clues.',
    on: 'run:clue', goal: 20, add: (p) => Math.max(1, p.delta | 0), when: () => true,
  },
];

/** Content that is not in the build yet, keyed by the `requires` value. */
const CONTENT_GATES = {
  'all-regions': () => BUILT_REGIONS.length >= REGION_ORDER.length,
  heart: () => BUILT_REGIONS.includes('heart'),
  coop: () => true,       // co-op is built and playable today
};

/** Achievements that can actually be earned in this build. Register only these with Steam. */
export function shippable() {
  return ACHIEVEMENTS.filter((a) => {
    if (!a.requires) return true;
    const gate = CONTENT_GATES[a.requires];
    return typeof gate === 'function' ? gate() : false;
  });
}

/** The written-but-withheld ones, so their absence is visible rather than forgotten. */
export function plannedFor() {
  const ship = new Set(shippable().map((a) => a.id));
  return ACHIEVEMENTS.filter((a) => !ship.has(a.id));
}

/**
 * The Steam API Name for an id.
 *
 * Steamworks wants a short stable token per achievement and it is set in the
 * partner site, not here — so this is the mapping the partner site must be made
 * to match, and it is derived rather than hand-listed so the two cannot drift.
 * `first-win` -> `ACH_FIRST_WIN`.
 */
export function steamName(id) {
  return 'ACH_' + String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/* ══ the engine ════════════════════════════════════════════════════════════ */

export class Achievements {
  constructor() {
    this.ctx = null;
    this.Save = null;
    this._offs = [];
    this.enabled = true;
    /** Set while a run is live, so per-run progress can reset. */
    this._runToken = null;
    /* Per-fight, reset by `run:combatStart`. Named here so the first predicate
       to run before any fight reads a number rather than undefined. */
    this._fightStartHp = null;
    this._fightLowHp = null;
    this._fightCourageLost = 0;
    this._fightMostCards = 0;
    this._lastWasBoss = false;
    this._lastBoss = null;
    this.onUnlock = null;      // set by the toast UI
  }

  /* ── persistence ───────────────────────────────────────────────────────
   * Lives inside the existing meta save rather than a slot of its own: it is
   * meta-progression, it must survive alongside `companionsRescued`, and a
   * player restoring a backup expects their achievements to come with it.
   */
  get _store() {
    const d = this.Save && this.Save.data;
    if (!d) return { unlocked: {}, counters: {}, seen: {} };
    if (!d.achievements) d.achievements = { unlocked: {}, counters: {}, seen: {} };
    const a = d.achievements;
    if (!a.unlocked) a.unlocked = {};
    if (!a.counters) a.counters = {};
    if (!a.seen) a.seen = {};
    return a;
  }

  has(id) { return !!this._store.unlocked[id]; }
  earnedAt(id) { return this._store.unlocked[id] || null; }
  progress(id) {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def || !def.goal) return null;
    return { have: this._store.counters[id] | 0, goal: def.goal };
  }
  /** Every achievement with its state, for the viewer. */
  list() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: this.has(a.id),
      at: this.earnedAt(a.id),
      progress: this.progress(a.id),
      shippable: !a.requires || (CONTENT_GATES[a.requires] ? CONTENT_GATES[a.requires]() : false),
    }));
  }
  get earnedCount() { return Object.keys(this._store.unlocked).length; }

  /* ── the api handed to `when` ─────────────────────────────────────────── */
  /**
   * Built PER ACHIEVEMENT, not once per event, and that is not a style choice.
   *
   * `firstTime` records what it has seen, and `rescue-four` and `rescue-all`
   * both call it with the same companion slug on the same `run:rescue`. A
   * shared api object means whichever ran first consumed the slug and the
   * second saw a repeat — so the two counters would drift apart forever, and
   * `rescue-all` would need seventeen rescues to reach sixteen. Keying the seen
   * set by achievement id is what keeps them independent.
   */
  _api(defId) {
    const ctx = this.ctx || {};
    const run = ctx.run || null;
    const store = this._store;
    const self = this;
    return {
      run, save: this.Save && this.Save.data,
      /** True the FIRST time `value` is seen under `key`, for THIS achievement. */
      firstTime(key, value) {
        if (!value) return false;
        const k = `${defId}:${key}`;
        const seen = store.seen[k] || (store.seen[k] = []);
        if (seen.includes(value)) return false;
        seen.push(value);
        return true;
      },
      partySize() { return run ? (run.partySize | 0) || 1 : 1; },
      allKidsAlive() { return !!run && Array.isArray(run.kids) && run.kids.every((k) => (k.courage | 0) > 0); },
      deckSize() { return run && Array.isArray(run.deck) ? run.deck.length : 0; },
      keepsakeCount() { return run && Array.isArray(run.keepsakes) ? run.keepsakes.length : 0; },
      countInDeck(fn) { return run && Array.isArray(run.deck) ? run.deck.filter(fn).length : 0; },
      courageNow() { return run ? run.courage | 0 : 0; },
      hauntPlayed() { return run ? (run.hauntLevel | 0) : 0; },
      /** Was the fight that just ended against this boss? */
      bossWas(slug) { return self._lastBoss === slug; },
      isBoss(p) { return (p && p.type === NodeType.BOSS) || self._lastWasBoss; },
      courageLostThisFight() { return self._fightCourageLost; },
      mostCardsInATurn() { return self._fightMostCards; },
    };
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */
  wire(ctx) {
    this.unwire();
    this.ctx = ctx;
    this.Save = ctx.Save;
    const bus = ctx.bus;
    if (!bus) return this;

    // Group by event so there is one subscription per name, not one per entry.
    const byEvent = new Map();
    for (const a of ACHIEVEMENTS) {
      for (const ev of String(a.on).split(/\s+/)) {
        if (!byEvent.has(ev)) byEvent.set(ev, []);
        byEvent.get(ev).push(a);
      }
    }
    for (const [ev, defs] of byEvent) {
      this._offs.push(bus.on(ev, (payload) => this._fire(ev, defs, payload)));
    }

    /* ── per-fight bookkeeping ───────────────────────────────────────────
     * Kept here rather than in the engine because no other consumer wants it
     * and the engine is not ours to widen.
     *
     * COURAGE IS SAMPLED OFF THE ENGINE, not off `run:courage`. That event
     * looked like the obvious source and is the wrong one: `Run.hurt()` and
     * `Run.heal()` emit it, and combat damage goes nowhere near them — the
     * engine moves an Actor's `hp` and `_onCombatEnd` copies the result back
     * into each Kid AFTERWARDS (run.js:1627). So a fight where the Butler took
     * a Kid to 3 Courage emits no `run:courage` at all, and "Not a Scratch"
     * would have unlocked on every boss anyone ever beat. */
    this._offs.push(bus.on('run:combatStart', (p) => {
      this._fightMostCards = 0;
      this._lastWasBoss = !!(p && (p.type === NodeType.BOSS
        || (p.node && p.node.type === NodeType.BOSS)));
      this._lastBoss = this._bossSlugOf(p);
      this._fightStartHp = this._localHp(p && p.engine);
      this._fightLowHp = this._fightStartHp;
    }));
    this._offs.push(bus.on('card:play', () => {
      const eng = this.ctx && this.ctx.run && this.ctx.run.combat;
      if (!eng) return;
      const n = eng.stats ? (eng.stats.cardsPlayedThisTurn | 0) : 0;
      if (n > this._fightMostCards) this._fightMostCards = n;
      const hp = this._localHp(eng);
      if (hp !== null && (this._fightLowHp === null || hp < this._fightLowHp)) this._fightLowHp = hp;
    }));
    this._offs.push(bus.on('run:start', () => { this._runToken = Math.random(); this._resetPerRun(); }));
    return this;
  }

  /** The local seat's Courage inside the engine, or null when there is no fight. */
  _localHp(engine) {
    const run = this.ctx && this.ctx.run;
    const eng = engine || (run && run.combat);
    if (!eng || !eng.players) return null;
    const seat = eng.players[(run && run.localSeat) | 0] || eng.players[0];
    return seat ? (seat.hp | 0) : null;
  }

  unwire() {
    for (const off of this._offs) { try { off(); } catch {} }
    this._offs.length = 0;
    return this;
  }

  _resetPerRun() {
    const store = this._store;
    for (const a of ACHIEVEMENTS) if (a.perRun && a.goal) store.counters[a.id] = 0;
  }

  _bossSlugOf(p) {
    const n = p && p.node;
    const id = (n && (n.bossId || n.boss)) || (p && p.meta && p.meta.bossId) || null;
    if (id) return String(id);
    // Fall back to the engine's own enemies: a boss fight has exactly one, tiered.
    const e = p && p.engine && p.engine.enemies && p.engine.enemies[0];
    const raw = e && (e.defId || (e.def && e.def.id) || e.id);
    return raw ? String(raw).split('/').pop() : null;
  }

  _fire(ev, defs, payload) {
    if (!this.enabled || !this.Save) return;
    if (ev === 'run:combatEnd') {
      // `run.combat` is still the engine here: `_onCombatEnd` emits at run.js:1636
      // and clears it at :1640/:1648, after. Take the last sample before it goes.
      const hp = this._localHp();
      if (hp !== null && (this._fightLowHp === null || hp < this._fightLowHp)) this._fightLowHp = hp;
      this._fightCourageLost = (this._fightStartHp === null || this._fightLowHp === null)
        ? 0 : Math.max(0, this._fightStartHp - this._fightLowHp);
    }
    for (const def of defs) {
      if (this.has(def.id)) continue;
      const api = this._api(def.id);
      let hit = false;
      try { hit = !!def.when(payload, api); } catch (e) { console.error(`[ach:${def.id}]`, e); continue; }
      if (!hit) continue;
      if (def.goal) {
        const store = this._store;
        const add = def.add ? Math.max(0, def.add(payload, api) | 0) : 1;
        const now = (store.counters[def.id] | 0) + add;
        store.counters[def.id] = now;
        if (now >= def.goal) this.unlock(def.id);
        else this.Save.save();
      } else {
        this.unlock(def.id);
      }
    }
  }

  /**
   * Award it. Local first, Steam second, and never the other way round: a
   * player on a plane still earned it, and a Steam call that fails must not be
   * able to lose the record.
   */
  unlock(id) {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def || !this.Save) return false;
    if (this.has(id)) return false;
    this._store.unlocked[id] = Date.now();
    this.Save.save();

    if (this.ctx && this.ctx.bus) this.ctx.bus.emit('achievement:unlocked', { id, def });
    if (typeof this.onUnlock === 'function') { try { this.onUnlock(def); } catch (e) { console.error(e); } }

    this._pushToSteam(id);
    return true;
  }

  async _pushToSteam(id) {
    if (!Platform.steam.available) return false;
    if (!shippable().some((a) => a.id === id)) return false;   // never register a gated one
    const ok = await Platform.steam.setAchievement(steamName(id));
    if (ok) await Platform.steam.storeStats();
    return ok;
  }

  /**
   * Push anything Steam has not got.
   *
   * Called on boot. A player earns achievements offline, in the browser build,
   * or while the Steam client is restarting; without this those are simply lost
   * to the platform even though the save has them. It also repairs the reverse
   * case — Steam has one the local save does not, because the player moved
   * machines and their Cloud save had not arrived yet.
   */
  async reconcile() {
    if (!Platform.steam.available || !this.Save) return { pushed: 0, pulled: 0 };
    let pushed = 0, pulled = 0;
    for (const def of shippable()) {
      const name = steamName(def.id);
      const onSteam = await Platform.steam.getAchievement(name);
      const local = this.has(def.id);
      if (local && !onSteam) { if (await Platform.steam.setAchievement(name)) pushed++; }
      else if (onSteam && !local) { this._store.unlocked[def.id] = Date.now(); pulled++; }
    }
    if (pushed) await Platform.steam.storeStats();
    if (pulled) this.Save.save();
    return { pushed, pulled };
  }

  /** Dev/reset only. Does not touch Steam — clearing there is a partner-site action. */
  resetLocal() {
    if (!this.Save) return;
    this.Save.data.achievements = { unlocked: {}, counters: {}, seen: {} };
    this.Save.save();
  }
}

export const achievements = new Achievements();
export default achievements;
