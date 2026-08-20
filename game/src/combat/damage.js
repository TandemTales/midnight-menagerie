/**
 * The damage pipeline. OWNER: combat-engine.
 *
 * EVERY point of damage in the game goes through here — card attacks, enemy
 * moves, Bristle retaliation, Dread ticks, self-inflicted Courage loss. There is
 * exactly one ordered function so that "why did that do 14?" always has one
 * answer, and so the preview can reuse the identical maths.
 *
 * ── ORDER (do not reorder without updating docs/NOTES.md) ───────────────────
 *
 *   1. BASE            the printed number (card nums.d, move.damage, status stacks)
 *   2. ATTACKER STR    + Strength stacks         (additive, attack-kind only)
 *   3. ATTACKER WEAK   × 0.75, floored           (multiplicative, attack-kind only)
 *   4. DEFENDER VULN   × 1.50, floored           (multiplicative, attack-kind only)
 *   5. MODIFIER HOOKS  relics / powers / statuses / objects:
 *                        a. attacker-side `modifyDamageDealt(amount, h)`
 *                        b. defender-side `modifyDamageTaken(amount, h)`   ← Faint clamps to 1 here
 *                      (steps 2-4 are themselves implemented as hooks on the
 *                       Strength/Weak/Vulnerable status defs; they are listed
 *                       separately above because their ordering is guaranteed:
 *                       the engine runs them in the fixed order below, not in
 *                       whatever order the statuses happen to sit in the Map.)
 *   6. CLAMP           floor, never below 0
 *   6b. onIncomingHit  LAST CHANCE to change or negate this specific hit, before
 *                      Guard is even consulted. Mutable payload: set `h.amount`,
 *                      or call `h.prevent()`. This is Marmalade's Ghoststep shape
 *                      and Play Dead's shape — "the hit does not happen" rather
 *                      than "the hit does 0".
 *   7. BLOCK ABSORB    min(amount, defender.block) removed from Guard,
 *                      unless `pierce` (spectral attacks) or `ignoreBlock` (Courage loss)
 *   7b. onLethal       fires only if the remainder would take hp to 0.
 *                      `h.prevent()` cancels the hit; `h.setHp(n)` survives at n.
 *   8. HP LOSS         defender.hp -= remainder
 *   9. onDamaged → onAttacked (attacks only) → onDealtDamage → onAttack
 *                      (onAttack = "an enemy finished a damaging move", Haunt)
 *  10. DEATH CHECK     hp <= 0 → death event, once
 *
 * Steps 1-6 are pure: `computeDamage()` runs them and mutates nothing, which is
 * what intents.js and preview.js use so the number a player reads is provably
 * the number they will get.
 */

import { EV } from './events.js';
import { WEAK_MULT, VULNERABLE_MULT } from './statuses.js';

/**
 * Pure damage calculation. No mutation, no events.
 * @returns {{base:number, afterStrength:number, afterWeak:number,
 *            afterVulnerable:number, afterHooks:number, final:number,
 *            blocked:number, hpLoss:number, lethal:boolean}}
 */
export function computeDamage(engine, o) {
  const { attacker = null, defender, card = null } = o;
  const kind = o.kind || 'attack';
  const isAttack = kind === 'attack';
  const base = Math.max(0, Math.floor(o.amount || 0));

  let v = base;
  const trace = { base };

  if (!o.skipModifiers) {
    // 2. attacker Strength (additive, attacks only)
    if (isAttack && attacker) v = v + (attacker.status('strength') || 0);
    trace.afterStrength = v;

    // 3. attacker Weak (multiplicative, attacks only)
    if (isAttack && attacker && attacker.status('weak') > 0) v = Math.floor(v * WEAK_MULT);
    trace.afterWeak = v;

    // 4. defender Vulnerable (multiplicative, attacks only)
    if (isAttack && defender && defender.status('vulnerable') > 0) v = Math.floor(v * VULNERABLE_MULT);
    trace.afterVulnerable = v;

    // 5a/5b. everything else that wants a say
    const hCtx = { attacker, defender, card, kind, cause: o.cause || null, base };
    if (attacker) {
      v = engine.hooks.reduce('modifyDamageDealt', v,
        { ...hCtx, self: attacker }, engine.hooks.actorHooks(attacker, 'modifyDamageDealt'));
    }
    if (defender) {
      v = engine.hooks.reduce('modifyDamageTaken', v,
        { ...hCtx, self: defender }, engine.hooks.actorHooks(defender, 'modifyDamageTaken'));
    }
  } else {
    trace.afterStrength = v; trace.afterWeak = v; trace.afterVulnerable = v;
  }
  trace.afterHooks = v;

  // 6. clamp
  v = Math.max(0, Math.floor(v));
  trace.final = v;

  // 7. block absorption
  const skipBlock = !!(o.pierce || o.ignoreBlock);
  const blocked = skipBlock ? 0 : Math.min(v, defender ? defender.block : 0);
  trace.blocked = blocked;

  // 8. hp loss
  const hpLoss = Math.max(0, v - blocked);
  trace.hpLoss = hpLoss;
  trace.lethal = !!defender && (defender.hp - hpLoss) <= 0;

  return trace;
}

/**
 * Just the post-modifier, pre-block number. Used by intent display and by the
 * live-recoloured numbers in card text.
 */
export function previewDamageValue(engine, attacker, defender, amount, opts = {}) {
  return computeDamage(engine, { attacker, defender, amount, ...opts }).final;
}

/**
 * Full resolution: mutate + emit. Called by engine.dealDamage().
 * Returns the same trace object, plus `dead`.
 */
export function applyDamage(engine, o) {
  const defender = o.defender;
  if (!defender || !defender.alive) return null;

  const attacker = o.attacker || null;
  const kind = o.kind || 'attack';
  const t = computeDamage(engine, o);

  // 6b. onIncomingHit — a mutable, vetoable view of this single hit.
  if (!o.skipModifiers) {
    // NOTE: hook payloads are SPREAD into each provider's own object, so a
    // method using `this` would mutate the copy. Everything mutable closes over
    // `box` instead.
    const box = { prevented: false, amount: t.final };
    const inc = {
      attacker, defender, target: defender, kind, card: o.card || null,
      amount: t.final, base: t.base, cause: o.cause || null,
      hits: o.hits ?? 1, hitIndex: o.hitIndex ?? 0,
      prevent: () => { box.prevented = true; },
      setAmount: (n) => { box.amount = Math.max(0, n | 0); },
    };
    engine.hooks.dispatch('onIncomingHit', inc, engine.hooks.actorHooks(defender, 'onIncomingHit'));
    if (box.prevented) {
      engine._emit(EV.DAMAGE, {
        sourceId: attacker ? attacker.id : null,
        sourceName: attacker ? attacker.name : (o.cause || 'the house'),
        targetId: defender.id, targetName: defender.name, kind,
        base: t.base, amount: 0, blocked: 0, hpLoss: 0,
        hpBefore: defender.hp, hpAfter: defender.hp,
        blockBefore: defender.block, blockAfter: defender.block,
        hits: o.hits ?? 1, hitIndex: o.hitIndex ?? 0,
        lethal: false, pierce: !!o.pierce, prevented: true,
        cause: o.cause || null, cardId: o.card ? o.card.id : null,
        cardUid: o.card ? o.card.uid : null,
      });
      return { ...t, final: 0, blocked: 0, hpLoss: 0, lethal: false, prevented: true, dead: false };
    }
    if (box.amount !== t.final) {
      t.final = Math.max(0, Math.floor(box.amount));
      const skipBlock2 = !!(o.pierce || o.ignoreBlock);
      t.blocked = skipBlock2 ? 0 : Math.min(t.final, defender.block);
      t.hpLoss = Math.max(0, t.final - t.blocked);
      t.lethal = (defender.hp - t.hpLoss) <= 0;
    }
  }

  // 7b. onLethal — the one place a Companion can refuse to die.
  if (t.lethal && t.hpLoss > 0) {
    const lbox = { prevented: false, survivesAt: null };
    const le = {
      attacker, defender, target: defender, kind, card: o.card || null,
      amount: t.final, hpLoss: t.hpLoss,
      prevent: () => { lbox.prevented = true; },
      setHp: (n) => { lbox.survivesAt = Math.max(1, n | 0); },
    };
    engine.hooks.dispatch('onLethal', le, engine.hooks.actorHooks(defender, 'onLethal'));
    if (lbox.prevented) {
      t.hpLoss = Math.max(0, defender.hp - 1);
      t.lethal = false;
    } else if (lbox.survivesAt != null) {
      t.hpLoss = Math.max(0, defender.hp - lbox.survivesAt);
      t.lethal = false;
    }
  }

  const hpBefore = defender.hp;
  const blockBefore = defender.block;

  // 7. Guard absorbs first.
  defender.block = Math.max(0, defender.block - t.blocked);
  // 8. Courage loss.
  defender.hp = Math.max(0, defender.hp - t.hpLoss);

  defender.damageTakenThisTurn += t.hpLoss;
  defender.hitsTakenThisTurn += 1;
  if (t.hpLoss > 0) defender.unblockedHitsThisTurn += 1;

  // engine.stats — the board-wide mirror content reads. "Damage" here means
  // Courage actually removed, not the pre-Guard number, which is the same
  // definition the run layer's end screen uses. Guard absorbing a swing means
  // no damage was dealt.
  const st = engine.stats;
  if (defender.side === 'player') {
    st.damageTakenThisTurn += t.hpLoss;
    st.damageTakenThisCombat += t.hpLoss;
  } else if (attacker && attacker.side === 'player') {
    st.damageDealtThisTurn += t.hpLoss;
    st.damageDealtThisCombat += t.hpLoss;
  }

  engine._emit(EV.DAMAGE, {
    sourceId: attacker ? attacker.id : null,
    sourceName: attacker ? attacker.name : (o.cause || 'the house'),
    targetId: defender.id,
    targetName: defender.name,
    kind,
    base: t.base,
    amount: t.final,
    blocked: t.blocked,
    hpLoss: t.hpLoss,
    hpBefore, hpAfter: defender.hp,
    blockBefore, blockAfter: defender.block,
    hits: o.hits ?? 1,
    hitIndex: o.hitIndex ?? 0,
    lethal: defender.hp <= 0,
    pierce: !!o.pierce,
    ignoreBlock: !!o.ignoreBlock,
    cause: o.cause || (o.card ? o.card.id : null),
    cardId: o.card ? o.card.id : null,
    cardUid: o.card ? o.card.uid : null,
  });

  if (blockBefore > 0 && defender.block === 0 && t.blocked > 0) {
    engine._emit(EV.BLOCK_BREAK, { targetId: defender.id, sourceId: attacker ? attacker.id : null });
  }

  // 9. reactions. onAttacked only fires for real attacks so Bristle cannot
  //    retaliate against a Dread tick or against its own retaliation.
  const hookPayload = {
    attacker, defender, target: defender, kind,
    amount: t.final, hpLoss: t.hpLoss, blocked: t.blocked,
    card: o.card || null, cause: o.cause || null,
  };
  engine.hooks.dispatch('onDamaged', hookPayload, engine.hooks.actorHooks(defender, 'onDamaged'));
  if (kind === 'attack') {
    engine.hooks.dispatch('onAttacked', hookPayload, engine.hooks.actorHooks(defender, 'onAttacked'));
  }
  if (attacker) {
    engine.hooks.dispatch('onDealtDamage', hookPayload, engine.hooks.actorHooks(attacker, 'onDealtDamage'));
    // onAttack: "an enemy landed a damaging action on you". Haunt hangs off this.
    if (kind === 'attack' && attacker.side === 'enemy' && (o.hitIndex ?? 0) === ((o.hits ?? 1) - 1)) {
      engine.hooks.dispatch('onAttack', hookPayload, engine.hooks.actorHooks(attacker, 'onAttack'));
    }
    if (attacker.def?.onDealtDamage) {
      try { attacker.def.onDealtDamage(engine.enemyCtx(attacker, null, { info: hookPayload })); } catch (err) { console.error(err); }
    }
  }
  if (defender.def?.onDamaged) {
    try { defender.def.onDamaged(engine.enemyCtx(defender, null, { info: hookPayload })); } catch (err) { console.error(err); }
  }
  if (defender.def?.onAttacked && kind === 'attack') {
    try { defender.def.onAttacked(engine.enemyCtx(defender, null, { info: hookPayload })); } catch (err) { console.error(err); }
  }

  // 10. death
  t.dead = engine._checkDeath(defender, attacker ? attacker.id : null);
  return t;
}
