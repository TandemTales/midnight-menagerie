/**
 * Enemy registry. OWNER: enemies.
 *
 * Single lookup surface for every EnemyDef in the game — ordinary enemies, Big Scares
 * and region bosses alike. `data/encounters.js` and the combat engine both read from here.
 */

import { FOYER_ENEMIES } from './foyer.js';
import { NURSERY_ENEMIES } from './nursery.js';
import { SLEEPING_QUARTERS_ENEMIES } from './sleeping-quarters.js';
import { FOYER_BOSSES } from '../bosses/butler.js';
import { NURSERY_BOSSES } from '../bosses/governess.js';
import { SLEEPING_QUARTERS_BOSSES } from '../bosses/bedframe-beast.js';

export { ENEMY_STATUSES, STATUS_TRICK_DEFS } from './_lib.js';

const ALL = [
  ...FOYER_ENEMIES,
  ...FOYER_BOSSES,
  ...NURSERY_ENEMIES,
  ...NURSERY_BOSSES,
  ...SLEEPING_QUARTERS_ENEMIES,
  ...SLEEPING_QUARTERS_BOSSES,
];

/** id → EnemyDef */
export const ENEMIES = Object.freeze(
  ALL.reduce((m, e) => { m[e.id] = e; return m; }, Object.create(null)),
);

export const ENEMY_LIST = Object.freeze(ALL.slice());

export function getEnemy(id) {
  const e = ENEMIES[id];
  if (!e) throw new Error(`[enemies] unknown enemy id: ${id}`);
  return e;
}

export function hasEnemy(id) { return !!ENEMIES[id]; }

/** Every enemy in a region, optionally filtered by tier ('normal' | 'elite' | 'boss'). */
export function enemiesForRegion(region, tier) {
  return ENEMY_LIST.filter(e => e.region === region && (!tier || e.tier === tier));
}

/**
 * Roll an enemy's starting Courage. `hp` is an inclusive [min,max] range on the EnemyDef.
 * Haunt and encounter multipliers are applied by encounters.js, not here.
 */
export function rollHp(def, rng) {
  const [lo, hi] = def.hp;
  return hi > lo ? (rng ? rng.range(lo, hi) : lo) : lo;
}

/** Regions this agent has shipped rosters for. */
export const IMPLEMENTED_REGIONS = Object.freeze(['foyer', 'nursery', 'sleeping-quarters']);
