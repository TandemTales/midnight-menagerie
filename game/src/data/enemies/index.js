/**
 * Enemy registry. OWNER: enemies.
 *
 * Single lookup surface for every EnemyDef in the game — ordinary enemies, Big Scares
 * and region bosses alike. `data/encounters.js` and the combat engine both read from here.
 */

import { FOYER_ENEMIES } from './foyer.js';
import { NURSERY_ENEMIES } from './nursery.js';
import { SLEEPING_QUARTERS_ENEMIES } from './sleeping-quarters.js';
import { KITCHENS_CELLARS_ENEMIES, KITCHENS_STATUSES } from './kitchens-cellars.js';
import { FOYER_BOSSES } from '../bosses/butler.js';
import { NURSERY_BOSSES } from '../bosses/governess.js';
import { SLEEPING_QUARTERS_BOSSES } from '../bosses/bedframe-beast.js';
import { KITCHENS_CELLARS_BOSSES } from '../bosses/confectioner.js';
import { ENEMY_STATUSES as CORE_STATUSES, STATUS_TRICK_DEFS as CORE_TRICKS } from './_lib.js';

/**
 * Statuses and status Tricks, merged here rather than in `_lib.js`.
 *
 * Every consumer already reads these two names off THIS module —
 * `state/run.js:152`, `scenes/combat.js:488`, `data/keywords.js:160` — so a
 * region that adds its own gets picked up everywhere by appending here, and
 * nothing else in the codebase has to learn that a fourth region exists.
 * `_lib.js` stays the shared library; it is not a registry.
 */
export const ENEMY_STATUSES = Object.freeze([...CORE_STATUSES, ...KITCHENS_STATUSES]);
export const STATUS_TRICK_DEFS = Object.freeze([...CORE_TRICKS]);

const ALL = [
  ...FOYER_ENEMIES,
  ...FOYER_BOSSES,
  ...NURSERY_ENEMIES,
  ...NURSERY_BOSSES,
  ...SLEEPING_QUARTERS_ENEMIES,
  ...SLEEPING_QUARTERS_BOSSES,
  ...KITCHENS_CELLARS_ENEMIES,
  ...KITCHENS_CELLARS_BOSSES,
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
export const IMPLEMENTED_REGIONS = Object.freeze([
  'foyer', 'nursery', 'sleeping-quarters', 'kitchens-cellars',
]);

/**
 * Enemies that may only ever arrive by `summon` — a Doughling from a Divide, a
 * Crust Beast out of the Oven. `tests/kitchens/check.py` fails if one is written
 * into an encounter formation by hand, which is the only way it could reach a
 * player without the mechanic that is supposed to create it.
 */
export const SUMMON_ONLY = Object.freeze(ENEMY_LIST.filter(e => e.summonOnly).map(e => e.id));
