/**
 * Wing conditions — the marked areas on the blueprint. OWNER: meta-run.
 *
 * `state/mapgen.js` HAZARDS declares eight, each with a `name`, a `rule`
 * sentence and a glyph. Every blueprint places two to four; `scenes/map.js`
 * shades the area, prints the name along the footer, adds it to the legend and
 * renders the rule in the hover card.
 *
 * **Six of the eight were implemented nowhere** until 2026-08-29 — the player
 * was told "Guard is halved" and nothing halved anything (CONTRACTS 54). This
 * module is the missing half. `sagging`, `paw-prints` and `moonlit` are room
 * effects and live in `state/run.js enterNode`; the five here are FIGHT
 * effects, and this is where they are applied.
 *
 *   import { applyWing, WING_STATUSES } from '../data/wings.js';
 *   applyWing(engine, node.payload?.hazard);      // before startCombat()
 *
 * ── Two rules did not survive contact with the engine ───────────────────────
 *
 * Both are flagged rather than silently reinterpreted, and both are the
 * designer's to overrule:
 *
 * - **Long Shadows** reads "Guard is halved at the start of each of your
 *   turns". Guard is already WIPED at the start of every player turn
 *   (`_beginPlayerTurn` step 2), so halving it there is a no-op — and this is
 *   a hazard, so a no-op is the one thing it cannot be. Implemented as **Guard
 *   GAINED is halved** while you are in the wing, which is the same threat
 *   ("your defence is worth less in the dark") expressed in a way the engine
 *   can carry.
 * - **The Lights Are Out** reads "start every Scuffle with 2 Unseen". `unseen`
 *   is Hush's status: it does not stack, and every rule for breaking it lives
 *   in his card code, so an enemy handed it would stay hidden forever. This
 *   uses its own status — displayed as "Unseen", because that is what the wing
 *   promises the player — which stacks, starts at 2, and loses one each time
 *   the creature is hurt or attacks. Two events to bring it into the light.
 */

import { registerStatuses } from '../combat/statuses.js';

const D = (fn) => fn;

/** Statuses that exist only because a wing needs them. */
export const WING_STATUSES = [
  {
    id: 'chill', name: 'Chill', kind: 'debuff', icon: 'frail',
    desc: 'Your first Trick each turn costs 1 more Nerve. Lose 1 Chill at the end of your turn.',
    decay: 'turnEnd', stacks: true,
    hooks: {
      /* The FIRST Trick, per seat. `stats.cardsPlayedThisTurn` is the seat's
         own counter, not the team mirror — `_beginPlayerTurn` resets both and
         actor.js documents the split. Reading the team one would tax one Kid
         for another Kid's opening card. */
      modifyCardCost: D((cost, h) => {
        if (h.stacks <= 0 || cost < 0) return cost;          // -1 is X, -2 unplayable
        const own = h.owner?.stats?.cardsPlayedThisTurn ?? 0;
        return own === 0 ? cost + 1 : cost;
      }),
    },
  },
  {
    id: 'lurking', name: 'Unseen', kind: 'buff', icon: 'hidden',
    desc: 'Nothing can be read of what it means to do. Loses 1 when hurt, and 1 when it attacks.',
    decay: 'never', stacks: true,
    hooks: {
      onDamaged: D((h) => {
        if (h.stacks <= 0 || !(h.hpLoss > 0)) return;
        h.e.applyStatus(h.owner, 'lurking', -1, { reason: 'seen' });
      }),
      /* `onAttack` fires when an ENEMY finishes a damaging move — the moment
         the thing gives itself away. */
      onAttack: D((h) => {
        if (h.stacks <= 0 || h.attacker !== h.owner) return;
        h.e.applyStatus(h.owner, 'lurking', -1, { reason: 'seen' });
      }),
    },
  },
  {
    id: 'long-shadows', name: 'Long Shadows', kind: 'debuff', icon: 'shadow',
    desc: 'Guard you gain is halved. No daylight reaches these rooms.',
    decay: 'never', stacks: false,
    hooks: {
      modifyBlockGain: D((v, h) => (h.stacks > 0 ? Math.floor(v / 2) : v)),
    },
  },
];

let registered = false;
/** Idempotent; `loadContentRegistries` calls it and so does `applyWing`. */
export function registerWingStatuses() {
  if (registered) return;
  registerStatuses(WING_STATUSES);
  registered = true;
}

/**
 * An extra small creature, for The Pipes Rattle.
 *
 * A COPY of the smallest thing already in the room rather than a pick from the
 * region pool: the encounter's own roster is the only list that is guaranteed
 * to be region-appropriate, tier-appropriate and already balanced against the
 * fight it is joining. "Noise carries" — something else came to look, and it is
 * the same kind of something.
 *
 * Called on the MEMBER list, before the engine is built.
 */
export function addPipesEnemy(members) {
  if (!Array.isArray(members) || !members.length) return members;
  let small = members[0];
  for (const m of members) if ((m.hp | 0) < (small.hp | 0)) small = m;
  return members.concat([{ ...small, slot: members.length }]);
}

/**
 * Apply a wing to a built engine. Call BEFORE `startCombat()`.
 *
 * Before, because `startCombat` rolls the opening intents, and two of these
 * wings are about what you can read of an intent. Actors exist as soon as the
 * constructor returns (`_build` runs in it), so there is a window.
 *
 * `pipes` is not here: it changes the ROSTER, so it has to happen before the
 * engine is constructed at all. See `addPipesEnemy`.
 *
 * @returns {string|null} the wing that was applied, for the caller to log
 */
export function applyWing(engine, wingId) {
  if (!engine || !wingId) return null;
  registerWingStatuses();

  switch (wingId) {
    case 'lights-out':
      for (const en of engine.enemies) {
        engine.applyStatus(en, 'lurking', 2, { reason: 'lights-out' });
      }
      /* Read at intent-refresh time, so a creature that is brought into the
         light mid-fight becomes readable the moment its last stack goes. */
      engine.concealIntent = (en) => (en?.status?.('lurking') || 0) > 0;
      break;

    case 'dust-sheets':
      // "Enemy intents are hidden on the first turn of every Scuffle."
      // `turn` is 0 during setup and 1 for the first player turn, and intents
      // are rolled at both, so both are the first turn as the player sees it.
      engine.concealIntent = () => engine.turn <= 1;
      break;

    case 'cold-draught':
      for (const pl of engine.players) {
        engine.applyStatus(pl, 'chill', 2, { reason: 'cold-draught' });
      }
      break;

    case 'long-shadows':
      for (const pl of engine.players) {
        engine.applyStatus(pl, 'long-shadows', 1, { reason: 'long-shadows' });
      }
      break;

    case 'pipes':
      // handled by addPipesEnemy on the member list
      break;

    default:
      // sagging / paw-prints / moonlit are room effects, in state/run.js.
      return null;
  }
  return wingId;
}

export default { WING_STATUSES, applyWing, addPipesEnemy, registerWingStatuses };
