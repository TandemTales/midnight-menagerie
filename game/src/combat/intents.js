/**
 * Enemy intent resolution. OWNER: combat-engine.
 *
 * The intent icon is the single most important read in the game, so the number
 * on it is computed with the SAME function that resolves the hit — see
 * damage.js `previewDamageValue`. It is post-Strength, post-Weak, post-Vulnerable,
 * post-relic, post-Faint. If the player gains 3 Strength, nothing about the
 * enemy changed and the intent stays put; if the player gains Vulnerable, every
 * attack intent on the board goes up immediately and re-emits `intent`.
 *
 * `refreshIntents()` is cheap and idempotent — the engine calls it after any
 * mutation that could move a number, and only emits when the rendered intent
 * actually differs.
 *
 * MoveDef display hints (all optional, all pure data):
 *   damage, hits, block           the printed numbers
 *   applies: [{id, stacks, to:'player'|'self'|'allEnemies'}]  status preview
 *   tell                          one line of flavour for the tooltip
 *   damageFn(ctx) -> number       dynamic base damage (Dust Bunny growth etc.)
 */

import { EV } from './events.js';
import { Intent } from '../data/schema.js';
import { previewDamageValue } from './damage.js';
import { getStatus } from './statuses.js';

/** Wink's four Intent Families. Every intent type maps to exactly one. */
export function intentFamily(type) {
  switch (type) {
    case Intent.ATTACK: case Intent.ATTACK_BIG: case Intent.ATTACK_DEFEND:
    case Intent.ATTACK_BUFF: case Intent.ATTACK_DEBUFF:
      return 'attack';
    case Intent.DEFEND: case Intent.DEFEND_BUFF:
      return 'defense';
    case Intent.BUFF: case Intent.DEBUFF: case Intent.STRONG_DEBUFF:
      return 'scheme';
    default:
      return 'special';   // summon / sleep / stun / escape / unknown
  }
}

export function isAttackIntent(type) { return intentFamily(type) === 'attack'; }

/**
 * Build the display intent for a chosen move. Pure — no mutation, no events.
 * @returns {{type, family, moveId, name, damage, hits, totalDamage, block,
 *            statuses, tell, tooltip, targetId}}
 */
export function buildIntent(engine, enemy, move) {
  if (!move) {
    return {
      type: Intent.UNKNOWN, family: 'special', moveId: null, name: '???',
      damage: 0, hits: 0, totalDamage: 0, block: 0, statuses: [],
      tell: '', tooltip: 'You cannot tell what it is about to do.', targetId: null,
    };
  }

  const defender = engine.intentTargetFor(enemy);
  const hits = Math.max(0, move.hits ?? (move.damage != null ? 1 : 0));

  let base = move.damage ?? 0;
  if (typeof move.damageFn === 'function') {
    base = move.damageFn(engine.enemyCtx(enemy, move)) ?? 0;
  }

  const damage = (hits > 0 && base > 0 && defender)
    ? previewDamageValue(engine, enemy, defender, base, { kind: 'attack', pierce: !!move.pierce })
    : 0;

  const blockRaw = move.block ?? 0;
  const block = blockRaw > 0 ? engine.previewBlockValue(enemy, blockRaw) : 0;

  const statuses = (move.applies || []).map(a => ({
    id: a.id, stacks: a.stacks ?? 1, to: a.to || 'player',
    name: getStatus(a.id).name, kind: getStatus(a.id).kind,
  }));

  const intent = {
    type: move.intent || Intent.UNKNOWN,
    family: intentFamily(move.intent || Intent.UNKNOWN),
    moveId: move.id,
    name: move.name || move.id,
    damage, hits,
    totalDamage: damage * hits,
    block,
    statuses,
    tell: move.tell || '',
    targetId: defender ? defender.id : null,
    tooltip: '',
  };
  intent.tooltip = intentTooltip(intent, enemy);
  return intent;
}

/** Plain-language sentence for the intent hover. Never leaves a number implicit. */
export function intentTooltip(intent, enemy) {
  const parts = [];
  if (intent.hits > 1 && intent.damage > 0) {
    parts.push(`Attacks ${intent.hits} times for ${intent.damage} damage each (${intent.totalDamage} total).`);
  } else if (intent.damage > 0) {
    parts.push(`Attacks for ${intent.damage} damage.`);
  }
  if (intent.block > 0) parts.push(`Gains ${intent.block} Guard.`);
  for (const s of intent.statuses) {
    const who = s.to === 'self' ? enemy?.name || 'itself' : s.to === 'allEnemies' ? 'its allies' : 'you';
    parts.push(`Applies ${s.stacks} ${s.name} to ${who}.`);
  }
  if (parts.length === 0) {
    switch (intent.type) {
      case Intent.SLEEP: parts.push('Asleep. It does nothing this turn.'); break;
      case Intent.STUN: parts.push('Stunned. It does nothing this turn.'); break;
      case Intent.ESCAPE: parts.push('Preparing to flee.'); break;
      case Intent.SUMMON: parts.push('Calling for help.'); break;
      case Intent.UNKNOWN: parts.push('You cannot tell what it is about to do.'); break;
      default: parts.push(intent.name); break;
    }
  }
  if (intent.tell) parts.push(intent.tell);
  return parts.join(' ');
}

/** Two intents are the same render if every displayed field matches. */
export function sameIntent(a, b) {
  if (!a || !b) return a === b;
  if (a.type !== b.type || a.moveId !== b.moveId) return false;
  if (a.damage !== b.damage || a.hits !== b.hits || a.block !== b.block) return false;
  if (a.statuses.length !== b.statuses.length) return false;
  for (let i = 0; i < a.statuses.length; i++) {
    if (a.statuses[i].id !== b.statuses[i].id || a.statuses[i].stacks !== b.statuses[i].stacks) return false;
  }
  return true;
}

/**
 * Recompute every living enemy's displayed intent. Emits `intent` only for the
 * ones whose rendering changed. Call after ANY mutation that could move a number.
 */
export function refreshIntents(engine, reason = 'refresh') {
  for (const en of engine.enemies) {
    if (!en.alive) { en.intent = null; continue; }
    const next = buildIntent(engine, en, en.pendingMove);
    if (!sameIntent(en.intent, next)) {
      const prev = en.intent;
      en.intent = next;
      engine._emit(EV.INTENT, { enemyId: en.id, intent: { ...next }, previous: prev ? { ...prev } : null, reason });
    }
  }
}

/**
 * Ask an enemy for its next move and set the intent.
 * `def.nextMove(ctx)` MUST be deterministic given (rng, turn, history, board).
 */
export function chooseMove(engine, enemy, reason = 'turn') {
  if (!enemy.alive) return null;
  const def = enemy.def;
  let moveId = null;
  if (def && typeof def.nextMove === 'function') {
    moveId = def.nextMove(engine.enemyCtx(enemy, null));
  }
  const move = (def && def.moves && def.moves[moveId]) || null;
  if (!move && moveId) console.warn(`[combat] enemy ${enemy.defId} chose unknown move "${moveId}"`);
  enemy.pendingMove = move ? { id: moveId, ...move } : null;
  engine.hooks.dispatch('onIntentChosen', { enemy, move: enemy.pendingMove });
  const next = buildIntent(engine, enemy, enemy.pendingMove);
  const prev = enemy.intent;
  enemy.intent = next;
  engine._emit(EV.INTENT, { enemyId: enemy.id, intent: { ...next }, previous: prev ? { ...prev } : null, reason });
  return enemy.pendingMove;
}
