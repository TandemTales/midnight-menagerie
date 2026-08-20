/**
 * Status registry — data-side entry point. OWNER: combat-engine.
 *
 * The implementation lives in `src/combat/statuses.js` because the definitions
 * carry engine hooks and must not drift from the damage pipeline. This module
 * re-exports it so content agents can `import { registerStatus } from '../data/statuses.js'`
 * without reaching into the combat folder.
 */
export {
  UNIVERSAL_STATUSES,
  STATUS_ORDER,
  WEAK_MULT,
  VULNERABLE_MULT,
  FRAIL_MULT,
  registerStatus,
  registerStatuses,
  getStatus,
  hasStatusDef,
  allStatuses,
  statusDesc,
} from '../combat/statuses.js';
