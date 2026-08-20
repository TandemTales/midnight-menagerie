/** Persistent meta-progression + run autosave, in localStorage. */
const KEY = 'mm.save.v1';
const RUN = 'mm.run.v1';

const DEFAULT = {
  version: 1,
  createdAt: null,
  companionsRescued: [],       // slugs
  kidsUnlocked: ['maya'],
  petsRescued: [],
  clues: {},                   // kid slug -> [clue ids]
  blueprint: { revealed: ['foyer'] },
  hauntLevel: 0,               // ascension analogue
  stats: { runs: 0, wins: 0, cardsPlayed: 0, damageDealt: 0, bestFloor: 0 },
  settings: {
    music: 0.6, sfx: 0.8, master: 0.9,
    screenShake: 1, flashes: 1, speed: 1,
    fastMode: false, colorblind: 'off', reduceMotion: false,
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
};
