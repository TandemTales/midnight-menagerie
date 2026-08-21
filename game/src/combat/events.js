/**
 * Combat event vocabulary. OWNER: combat-engine.
 *
 * Events are the ONLY thing the renderer reacts to. Every event carries enough
 * data to animate it without querying engine internals: a source, a target,
 * an amount, and before/after values so a bar can be tweened rather than snapped.
 *
 * Every event object is shaped:
 *   { type, seq, turn, ...payload }
 * `seq` is a monotonically increasing integer for the whole combat — the renderer
 * can use it to order an animation queue and to detect events it has already played.
 *
 * Subscribe with `engine.on(type, fn)` or `engine.on('*', fn)`. The wildcard
 * handler receives the same single event object (read `ev.type`).
 *
 * ── PAYLOADS ────────────────────────────────────────────────────────────────
 *
 * combat:start   { seed, playerId, enemies:[{id,name,hp,maxHp,slot,tier}] }
 * combat:end     { victory:boolean, turn, playerHp }
 *
 * turn:start     { actor:'player'|<enemyId>, actorId, turn, side:'player'|'enemy' }
 * turn:end       { actor, actorId, turn, side }
 * phase          { phase:'player'|'enemy'|'enemyPhaseEnd'|'over', turn }
 *   'enemyPhaseEnd' is the window between the last enemy acting and intents
 *   being redrawn — support enemies arm their allies' buffs there.
 *
 * draw           { cardUid, card:<CardSnap>, from:'draw', to:'hand',
 *                  handSize, drawCount, discardCount, reason }
 * discard        { cardUid, card, from, to:'discard', reason,
 *                  handSize, discardCount }
 * exhaust        { cardUid, card, from, reason, exhaustCount }
 * shuffle        { into:'draw', from:'discard', count, order:[cardUid] }
 * hand:full      { cardUid, card, cap }            // drawn card bounced to discard
 * card:add       { cardUid, card, pile, position, reason }   // created by an effect
 * card:move      { cardUid, card, from, to, position, reason } // Stash / Scurry / Bury
 * card:play      { cardUid, card, targetId, cost, energyBefore, energyAfter,
 *                  cardsPlayedThisTurn }
 * card:resolved  { cardUid, card, destination:'discard'|'exhaust'|'hand'|'limbo' }
 * card:cost      { cardUid, before, after, scope:'turn'|'combat'|'permanent', reason }
 * card:meta      { cardUid, key, before, after }   // Stretch, Enchantment, Slobbered…
 * card:invalid   { cardUid, targetId, reason }     // play was rejected, no state change
 *
 * energy         { before, after, delta, max, reason }
 *
 * damage         { sourceId, sourceName, targetId, targetName,
 *                  kind:'attack'|'loss'|'thorns'|'status',
 *                  base, amount,            // amount = final damage BEFORE block
 *                  blocked, hpLoss,
 *                  hpBefore, hpAfter, blockBefore, blockAfter,
 *                  hits, hitIndex, lethal, pierce, cause, cardId }
 * block:break    { targetId, sourceId }             // block went >0 → 0 from a hit
 * block          { actorId, amount, before, after, reason }        // gained
 * block:lose     { actorId, before, after, reason:'turnStart'|'effect' }
 * heal           { actorId, amount, before, after, reason }
 * hp:max         { actorId, before, after, delta }
 *
 * status         { actorId, id, name, kind, icon, before, after, delta,
 *                  sourceId, reason, meta }         // delta<0 = decay/removal
 *   `meta` is whatever content data the status was applied with — the 4th
 *   argument of applyStatus minus the engine's own keys.
 * status:trigger { actorId, id, name, stacks, effect, amount }
 *
 * death          { actorId, name, killerId, side, slot }
 *
 * intent         { enemyId, intent:<Intent>, previous:<Intent|null>, reason }
 *   Intent = { type, family, familyLabel, moveId, name, damage, hits, block,
 *              totalDamage, baseDamage, tooltip, tell, anchored, position,
 *              statuses:[{id,name,stacks,to}],
 *              addsCards:[{id,name,pile,count}],   // deck pollution, resolved+counted
 *              rule:{id,name,text}|null }          // a House Rule it will announce
 *   `damage` is per-hit AFTER every modifier. It is recomputed and re-emitted
 *   whenever anything that could change it changes (Strength, Weak, Vulnerable…).
 *
 * counter        { ownerId, id, name, before, after, delta, min, max, reason,
 *                  state, stateBefore, states }
 *   `states` are the named bands declared on the counter
 *   ([{at:0,label:'Whole'},{from:4,label:'Scattered'}]) and `state` is the label
 *   the value currently falls in. Read these — never parse `desc`.
 *   Persistent per-combat resource tracks: Nine Lives, Glow, Height, Loose Bones,
 *   Globs, Loyalty, Compost, Web, Open Eyes…
 *
 * timer          { id, label, ownerId, before, after, reason }   // countdown ticked
 * timer:fire     { id, label, ownerId }                          // countdown hit 0
 *
 * summon         { entity:{id,name,hp,maxHp,slot,side,tier}, sourceId }
 * entity:remove  { id, side, slot, reason }
 *
 * object:add     { id, kind, slot, data }    // Plant, Pumpkin, Plot, Grave…
 * object:update  { id, kind, slot, data, before }
 * object:remove  { id, kind, slot, reason }
 *
 * intent:queue  { enemyId, action:'preview'|'swap'|'postpone'|'delete', depth, queue }
 *   queue = [{ position, moveId, name, type, family, familyLabel, damage, hits,
 *              block, anchored, revealed, tooltip }]
 *   Position 0 is the action resolving next. Unrevealed slots come back with
 *   `revealed:false` and no numbers — Wink's Preview is what reveals them.
 *
 * choice         { requestId, kind:'card'|'option'|'enemy', prompt, count, optional,
 *                  pool:[{index,label,cardUid?,card?,id?}], cardUid, cardId, pile }
 *   The engine is BLOCKED awaiting a resolution. Call
 *   `engine.resolveChoice(requestId, indices)` or register a resolver up front
 *   with `engine.setChoiceResolver(fn)`.
 * choice:resolved{ requestId, kind, picked:[index], chosen:[...], cardUid }
 *
 * rule           { rule:{id,name,text,when,once}, sourceId, action:'announce'|'clear' }
 * rule:broken    { ruleId, name, sourceId, cardUid }
 *
 * snack:used     { snackId, name, desc, targetId, effect, potency }
 *   Emitted BEFORE the Snack resolves, so the renderer can play the eat, the
 *   banner and the target reticle while the numbers land underneath. `potency`
 *   is the post-`modifySnackPotency` numbers actually about to be applied.
 *
 * relic:trigger  { relicId, name, counter, reason }
 * log            { text, tone:'info'|'good'|'bad' }
 */

export const EV = /** @type {const} */ ({
  COMBAT_START: 'combat:start',
  COMBAT_END: 'combat:end',

  TURN_START: 'turn:start',
  TURN_END: 'turn:end',
  PHASE: 'phase',

  DRAW: 'draw',
  DISCARD: 'discard',
  EXHAUST: 'exhaust',
  SHUFFLE: 'shuffle',
  HAND_FULL: 'hand:full',
  CARD_ADD: 'card:add',
  CARD_MOVE: 'card:move',
  CARD_PLAY: 'card:play',
  CARD_RESOLVED: 'card:resolved',
  CARD_COST: 'card:cost',
  CARD_META: 'card:meta',
  CARD_INVALID: 'card:invalid',

  ENERGY: 'energy',

  DAMAGE: 'damage',
  BLOCK: 'block',
  BLOCK_LOSE: 'block:lose',
  BLOCK_BREAK: 'block:break',
  HEAL: 'heal',
  HP_MAX: 'hp:max',

  STATUS: 'status',
  STATUS_TRIGGER: 'status:trigger',

  DEATH: 'death',
  INTENT: 'intent',

  COUNTER: 'counter',
  TIMER: 'timer',
  TIMER_FIRE: 'timer:fire',

  SUMMON: 'summon',
  ENTITY_REMOVE: 'entity:remove',

  OBJECT_ADD: 'object:add',
  OBJECT_UPDATE: 'object:update',
  OBJECT_REMOVE: 'object:remove',

  INTENT_QUEUE: 'intent:queue',

  CHOICE: 'choice',
  CHOICE_RESOLVED: 'choice:resolved',

  RULE: 'rule',
  RULE_BROKEN: 'rule:broken',

  SNACK: 'snack:used',

  RELIC: 'relic:trigger',
  LOG: 'log',
});

/** Every event type, in a stable order. Handy for test harnesses and debug UI. */
export const EVENT_TYPES = Object.freeze(Object.values(EV));

/** Events the renderer must animate rather than just re-render state for. */
export const ANIMATED_EVENTS = Object.freeze([
  EV.DAMAGE, EV.BLOCK, EV.BLOCK_BREAK, EV.HEAL, EV.STATUS, EV.STATUS_TRIGGER,
  EV.DRAW, EV.DISCARD, EV.EXHAUST, EV.SHUFFLE, EV.CARD_PLAY, EV.CARD_MOVE,
  EV.DEATH, EV.SUMMON, EV.COUNTER, EV.TIMER_FIRE, EV.ENERGY,
  EV.INTENT_QUEUE, EV.CHOICE, EV.RULE_BROKEN, EV.SNACK,
]);
