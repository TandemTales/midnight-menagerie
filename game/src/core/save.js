/** Persistent meta-progression + run autosave, in localStorage. */
const KEY = 'mm.save.v1';
const RUN = 'mm.run.v1';

/**
 * The highest Haunt the game offers.
 *
 * `scenes/clubhouse.js` and `scenes/select.js` each carry their own DISPLAY
 * table of Haunt names — two copies, which is a drift waiting to happen and is
 * not made worse here. This is the only number PROGRESSION reads, and it lives
 * with the save because the save is what it bounds.
 */
export const MAX_HAUNT = 5;

const DEFAULT = {
  version: 1,
  createdAt: null,
  companionsRescued: [],       // slugs
  kidsUnlocked: ['maya'],
  petsRescued: [],
  clues: {},                   // kid slug -> [clue ids]
  blueprint: { revealed: ['foyer'] },
  hauntLevel: 0,               // ascension analogue — the SOLO ladder
  partyHauntLevel: 0,          // and the party one, climbed separately
  stats: { runs: 0, wins: 0, cardsPlayed: 0, damageDealt: 0, bestFloor: 0 },
  settings: {
    music: 0.6, sfx: 0.8, master: 0.9,
    screenShake: 1, flashes: 1, speed: 1,
    fastMode: false, colorblind: 'off', reduceMotion: false,
    quality: 'auto',            // 'auto' | 'high' | 'medium' | 'low' — see Stage.setTier
    showDamageNumbers: true, autoEndTurn: false, confirmSingleTarget: false,
    largeText: false,
  },
  seenTutorials: [],
};

function deepMerge(base, over) {
  if (over === undefined || over === null) return structuredClone(base);
  if (typeof base !== 'object' || Array.isArray(base)) return over;
  const out = structuredClone(base);
  for (const k in over) out[k] = deepMerge(base[k], over[k]);
  return out;
}

export const Save = {
  data: structuredClone(DEFAULT),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? deepMerge(DEFAULT, JSON.parse(raw)) : structuredClone(DEFAULT);
    } catch { this.data = structuredClone(DEFAULT); }
    if (!this.data.createdAt) this.data.createdAt = Date.now();
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} },
  reset() { this.data = structuredClone(DEFAULT); this.data.createdAt = Date.now(); this.save(); this.clearRun(); },

  get settings() { return this.data.settings; },
  setSetting(k, v) { this.data.settings[k] = v; this.save(); },

  saveRun(state) { try { localStorage.setItem(RUN, JSON.stringify(state)); } catch {} },
  loadRun() { try { const r = localStorage.getItem(RUN); return r ? JSON.parse(r) : null; } catch { return null; } },
  clearRun() { try { localStorage.removeItem(RUN); } catch {} },
  hasRun() { return !!localStorage.getItem(RUN); },

  /* ── The Haunt ladder ─────────────────────────────────────────────────────
   *
   * TWO ladders, and a party does not climb the solo one.
   *
   * `docs/STS2-REFERENCE.md` §8.1 is unusually direct about this and we had no
   * answer at all: Multiplayer Ascension is tracked SEPARATELY from
   * single-player, it is gated by the weakest player in the lobby, and on a won
   * run the ENTIRE lobby earns the next level. Nothing in this project keyed
   * Haunt progression to party size — and the ladder did not move on a win
   * either, for anyone, so `hauntLevel` was a number that could only ever be 0.
   *
   * Separate is the part that matters. A Haunt cleared by four Kids is not
   * evidence that one Kid can clear it: the party curve multiplies enemy
   * Courage but never enemy damage, and four decks draw four times as many
   * answers. One ladder would let a group unlock Haunt 5 and then hand a solo
   * player a fight nothing in their history says they can take.
   *
   * "Credited to everyone" falls out rather than being built: every client
   * advances its OWN save on a shared win, so all four earn it at once without
   * anybody owning the ladder. "Gated by the weakest" needs the lobby to
   * compare saves and is therefore transport work — `hauntLevelFor` is the
   * seam it will call, with the lobby taking the MIN across peers.
   */

  /** Which ladder a run of this size climbs. */
  hauntKey(partySize = 1) {
    return (partySize | 0) > 1 ? 'partyHauntLevel' : 'hauntLevel';
  },

  /** The highest Haunt unlocked for a party of this size. */
  hauntLevelFor(partySize = 1) {
    const raw = Number(this.data[this.hauntKey(partySize)] ?? 0) || 0;
    return Math.max(0, Math.min(MAX_HAUNT, raw));
  },

  /**
   * A won run unlocks the next Haunt on ITS OWN ladder.
   *
   * Keyed off the Haunt the run was PLAYED at, not the unlocked maximum, so
   * clearing Haunt 1 while 3 is unlocked cannot walk the ladder backwards and
   * cannot be farmed for a level you already have.
   */
  advanceHaunt(partySize = 1, clearedAt = 0) {
    const key = this.hauntKey(partySize);
    const now = Math.max(0, Number(this.data[key] ?? 0) || 0);
    const want = Math.min(MAX_HAUNT, Math.max(0, clearedAt | 0) + 1);
    if (want <= now) return now;
    this.data[key] = want;
    this.save();
    return want;
  },
};
