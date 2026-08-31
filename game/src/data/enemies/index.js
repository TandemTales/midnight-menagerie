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
import { GREENHOUSE_ENEMIES, GREENHOUSE_STATUSES } from './greenhouse.js';
import { GRAVEYARD_ENEMIES, GRAVEYARD_STATUSES } from './graveyard.js';
import { GRAVEYARD_SCARES } from './graveyard-scares.js';
import { STUDY_LIBRARY_ENEMIES, STUDY_LIBRARY_STATUSES } from './study-library.js';
import { STUDY_LIBRARY_SCARES } from './study-library-scares.js';
import { ATTIC_ENEMIES, ATTIC_STATUSES } from './attic-observatory.js';
import { ATTIC_SCARES } from './attic-observatory-scares.js';
import { LAMPWORKS_ENEMIES, LAMPWORKS_STATUSES } from './lampworks.js';
import { LAMPWORKS_SCARES } from './lampworks-scares.js';
import { BALLROOM_ENEMIES, BALLROOM_STATUSES } from './ballroom.js';
import { BALLROOM_SCARES } from './ballroom-scares.js';
import { CRYPT_ENEMIES, CRYPT_STATUSES } from './crypt.js';
import { CRYPT_SCARES } from './crypt-scares.js';
import { MAZE_ENEMIES, MAZE_STATUSES } from './hedge-maze.js';
import { MAZE_SCARES } from './hedge-maze-scares.js';
import { PASSAGE_ENEMIES, PASSAGE_STATUSES } from './secret-passages.js';
import { PASSAGE_SCARES, SCARE_STATUSES as PASSAGE_SCARE_STATUSES } from './secret-passages-scares.js';
import { BATH_ENEMIES, BATH_STATUSES } from './bathhouse.js';
import { BATH_SCARES } from './bathhouse-scares.js';
import { GREENHOUSE_SCARES } from './greenhouse-scares.js';
import { HEART_ENEMIES, HEART_STATUSES } from './heart.js';
import { HEART_SCARES } from './heart-scares.js';
import { FOYER_BOSSES } from '../bosses/butler.js';
import { NURSERY_BOSSES } from '../bosses/governess.js';
import { SLEEPING_QUARTERS_BOSSES } from '../bosses/bedframe-beast.js';
import { KITCHENS_CELLARS_BOSSES } from '../bosses/confectioner.js';
import { GREENHOUSE_BOSSES } from '../bosses/head-gardener.js';
import { GRAVEYARD_BOSSES } from '../bosses/groundskeeper.js';
import { STUDY_LIBRARY_BOSSES } from '../bosses/archivist.js';
import { ATTIC_BOSSES } from '../bosses/watcher.js';
import { LAMPWORKS_BOSSES } from '../bosses/lamplighter.js';
import { BALLROOM_BOSSES } from '../bosses/master-of-revels.js';
import { CRYPT_BOSSES } from '../bosses/bone-curator.js';
import { MAZE_BOSSES } from '../bosses/gardener-of-rot.js';
import { WARDEN_BOSSES, WARDEN_STATUSES } from '../bosses/whisper-warden.js';
import { MATRON_BOSSES } from '../bosses/drowned-matron.js';
import { HEART_BOSSES, KEEPER_STATUSES } from '../bosses/keeper.js';
import { ENEMY_STATUSES as CORE_STATUSES, STATUS_TRICK_DEFS as CORE_TRICKS } from './_lib.js';
import { INVITATION_TRICKS, PASSAGE_OFFER_TRICKS, ECHO_TRICKS, STORM_OFFER_TRICKS } from '../invitations.js';

/**
 * Statuses and status Tricks, merged here rather than in `_lib.js`.
 *
 * Every consumer already reads these two names off THIS module —
 * `state/run.js:152`, `scenes/combat.js:488`, `data/keywords.js:160` — so a
 * region that adds its own gets picked up everywhere by appending here, and
 * nothing else in the codebase has to learn that a fourth region exists.
 * `_lib.js` stays the shared library; it is not a registry.
 */
/* KEEPER_STATUSES lives in bosses/keeper.js rather than with the rest of the
   Heart's, because it is the four things the Sanctuary Locks GIVE the player
   and they belong beside the Locks that hand them over. It is merged here for
   the same reason everything else is: this module is the one registry, and
   `heart.js` importing the boss file to collect them would make a cycle. */
export const ENEMY_STATUSES = Object.freeze(
  [...CORE_STATUSES, ...KITCHENS_STATUSES, ...GREENHOUSE_STATUSES,
   ...GRAVEYARD_STATUSES, ...STUDY_LIBRARY_STATUSES, ...ATTIC_STATUSES,
   ...LAMPWORKS_STATUSES, ...BALLROOM_STATUSES, ...CRYPT_STATUSES,
   ...MAZE_STATUSES,
   ...PASSAGE_STATUSES, ...PASSAGE_SCARE_STATUSES, ...WARDEN_STATUSES,
   ...BATH_STATUSES,
   ...HEART_STATUSES,
   ...KEEPER_STATUSES],
);
/* The Ballroom's Invitations are real Tricks the player may choose to play,
   so they live here beside Clutter and Drowsy rather than in the Companion
   card registry — `scenes/combat.js` and the enemy ctx's `addCard` both
   resolve ids through this list. */
export const STATUS_TRICK_DEFS = Object.freeze([...CORE_TRICKS, ...INVITATION_TRICKS, ...PASSAGE_OFFER_TRICKS, ...ECHO_TRICKS,
   ...STORM_OFFER_TRICKS]);

const ALL = [
  ...FOYER_ENEMIES,
  ...FOYER_BOSSES,
  ...NURSERY_ENEMIES,
  ...NURSERY_BOSSES,
  ...SLEEPING_QUARTERS_ENEMIES,
  ...SLEEPING_QUARTERS_BOSSES,
  ...KITCHENS_CELLARS_ENEMIES,
  ...KITCHENS_CELLARS_BOSSES,
  ...GREENHOUSE_ENEMIES,
  ...GREENHOUSE_SCARES,
  ...GREENHOUSE_BOSSES,
  ...GRAVEYARD_ENEMIES,
  ...GRAVEYARD_SCARES,
  ...GRAVEYARD_BOSSES,
  ...STUDY_LIBRARY_ENEMIES,
  ...STUDY_LIBRARY_SCARES,
  ...STUDY_LIBRARY_BOSSES,
  ...ATTIC_ENEMIES,
  ...ATTIC_SCARES,
  ...ATTIC_BOSSES,
  ...LAMPWORKS_ENEMIES,
  ...LAMPWORKS_SCARES,
  ...LAMPWORKS_BOSSES,
  ...BALLROOM_ENEMIES,
  ...BALLROOM_SCARES,
  ...BALLROOM_BOSSES,
  ...CRYPT_ENEMIES,
  ...CRYPT_SCARES,
  ...CRYPT_BOSSES,
  ...MAZE_ENEMIES,
  ...MAZE_SCARES,
  ...MAZE_BOSSES,
  ...PASSAGE_ENEMIES,
  ...PASSAGE_SCARES,
  ...WARDEN_BOSSES,
  ...BATH_ENEMIES,
  ...BATH_SCARES,
  ...MATRON_BOSSES,
  ...HEART_ENEMIES,
  ...HEART_SCARES,
  ...HEART_BOSSES,
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
  'foyer', 'nursery', 'sleeping-quarters', 'kitchens-cellars', 'greenhouse',
  'graveyard', 'study-library', 'attic-observatory', 'lampworks', 'ballroom',
  'crypt', 'hedge-maze', 'secret-passages', 'bathhouse', 'heart',
]);

/**
 * Enemies that may only ever arrive by `summon` — a Doughling from a Divide, a
 * Crust Beast out of the Oven. `tests/kitchens/check.py` fails if one is written
 * into an encounter formation by hand, which is the only way it could reach a
 * player without the mechanic that is supposed to create it.
 */
export const SUMMON_ONLY = Object.freeze(ENEMY_LIST.filter(e => e.summonOnly).map(e => e.id));
