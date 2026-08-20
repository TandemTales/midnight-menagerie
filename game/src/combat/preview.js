/**
 * Card preview. OWNER: combat-engine.
 *
 * StS2's tactical clarity lives or dies here: the player must be able to see the
 * exact outcome before committing. A preview that is *nearly* right is worse than
 * none, because it teaches the player to distrust the UI.
 *
 * So this does not re-implement anything. It clones the whole engine — same RNG
 * internal state, same statuses, same piles, same hooks — plays the card on the
 * clone, and reports what actually happened. Preview and resolution cannot drift
 * because they are literally the same code path (`engine._playCard`).
 *
 * Cost: one clone of ~40 small objects per call. That is a hover, not a frame.
 *
 * CAVEAT: a card whose `effect` returns a Promise cannot be fully previewed
 * synchronously. That is not a corner case any more — every "choose a Trick"
 * card is async by construction. So there are two entry points:
 *
 *   previewCard(...)       synchronous, contract-shaped. Reports everything that
 *                          resolved before the first `await` and sets
 *                          `partial:true` (+ `uncertain:true` if a choice is
 *                          involved).
 *   previewCardAsync(...)  awaits the whole effect, resolving any choice with the
 *                          deterministic auto-picker, and returns the complete
 *                          outcome with `uncertain:true`.
 *
 * `uncertain` means "one possible outcome, not a promise". The card face should
 * render the number with a trailing `?`. Showing a hard number for an outcome the
 * player has not chosen yet is worse than showing none.
 *
 * Return shape (superset of the CONTRACTS.md four keys):
 * {
 *   ok, reason, partial,
 *   cost, energyAfter,
 *   damage,            // total damage to the chosen target (or to all, if AoE)
 *   targets: [{ id, name, damage, hits, hpBefore, hpAfter, blockBefore,
 *               blockAfter, blocked, hpLoss, kills }],
 *   block,             // Guard the player gains, after Dexterity/Frail
 *   selfHpLoss, heal,
 *   statuses: [{ actorId, id, name, kind, stacks, remove }],
 *   counters: [{ id, name, delta, after }],
 *   draw, discard, exhaust, cardsAdded, summons,
 *   killsTarget, killsAny, killsAll,
 *   events             // the simulated event stream, for ghost animations
 * }
 */

import { EV } from './events.js';
import { getStatus } from './statuses.js';

const EMPTY = () => ({
  ok: false, reason: '', partial: false,
  cost: 0, energyAfter: 0,
  damage: 0, targets: [],
  block: 0, selfHpLoss: 0, heal: 0,
  statuses: [], counters: [],
  draw: 0, discard: 0, exhaust: 0, cardsAdded: 0, summons: 0,
  killsTarget: false, killsAny: false, killsAll: false,
  uncertain: false, pendingChoices: 0,
  events: [],
});

/**
 * @param {import('./engine.js').CombatEngine} engine
 * @param {string} cardUid
 * @param {string|null} targetId
 * @param {{assumeAffordable?:boolean}} [opts]
 */
export function previewCard(engine, cardUid, targetId = null, opts = {}) {
  const out = EMPTY();
  const card = engine.card(cardUid);
  if (!card) { out.reason = 'No such Trick.'; return out; }

  const check = engine.canPlay(cardUid, targetId);
  const onlyCost = !check.ok && /Nerve/.test(check.reason);
  if (!check.ok && !(opts.assumeAffordable && onlyCost)) {
    out.reason = check.reason;
    out.cost = Math.max(0, engine.costOf(card));
    return out;
  }

  const sim = engine.clone();
  if (opts.assumeAffordable && onlyCost) {
    sim.player.energy = Math.max(sim.player.energy, Math.max(0, sim.costOf(card)));
  }

  const events = [];
  sim.on('*', (ev) => events.push(ev));

  const playerId = sim.player.id;
  const hpBeforeMap = new Map();
  const blockBeforeMap = new Map();
  for (const a of [sim.player, ...sim.enemies, ...sim.allies]) {
    hpBeforeMap.set(a.id, a.hp);
    blockBeforeMap.set(a.id, a.block);
  }
  const energyBefore = sim.player.energy;

  const res = sim._playCard(cardUid, targetId);
  out.partial = !!res.pending;
  out.ok = true;
  out.events = events;
  out._sim = sim;
  out._pending = res.pending || null;

  const tmap = new Map();
  const statusMap = new Map();
  const counterMap = new Map();
  const deaths = new Set();
  let playCost = 0;

  for (const ev of events) {
    switch (ev.type) {
      case EV.CARD_PLAY:
        playCost = ev.cost;
        break;

      case EV.DAMAGE: {
        if (ev.targetId === playerId) {
          out.selfHpLoss += ev.hpLoss;
          break;
        }
        let t = tmap.get(ev.targetId);
        if (!t) {
          t = {
            id: ev.targetId, name: ev.targetName,
            damage: 0, hits: 0, blocked: 0, hpLoss: 0,
            hpBefore: hpBeforeMap.has(ev.targetId) ? hpBeforeMap.get(ev.targetId) : ev.hpBefore,
            hpAfter: ev.hpAfter,
            blockBefore: blockBeforeMap.has(ev.targetId) ? blockBeforeMap.get(ev.targetId) : ev.blockBefore,
            blockAfter: ev.blockAfter,
            kills: false,
          };
          tmap.set(ev.targetId, t);
        }
        t.damage += ev.amount;
        t.hpLoss += ev.hpLoss;
        t.blocked += ev.blocked;
        t.hits += 1;
        t.hpAfter = ev.hpAfter;
        t.blockAfter = ev.blockAfter;
        break;
      }

      case EV.BLOCK:
        if (ev.actorId === playerId) out.block += ev.amount;
        break;

      case EV.HEAL:
        if (ev.actorId === playerId) out.heal += ev.amount;
        break;

      case EV.STATUS: {
        const key = `${ev.actorId}/${ev.id}`;
        const cur = statusMap.get(key) || {
          actorId: ev.actorId, id: ev.id, name: ev.name || getStatus(ev.id).name,
          kind: ev.kind || getStatus(ev.id).kind, stacks: 0, remove: false,
        };
        cur.stacks += ev.delta;
        statusMap.set(key, cur);
        break;
      }

      case EV.COUNTER: {
        const cur = counterMap.get(ev.id) || { id: ev.id, name: ev.name, delta: 0, after: ev.after };
        cur.delta += ev.delta;
        cur.after = ev.after;
        counterMap.set(ev.id, cur);
        break;
      }

      case EV.DRAW: out.draw++; break;
      case EV.DISCARD: if (ev.reason !== 'played') out.discard++; break;
      case EV.EXHAUST: out.exhaust++; break;
      case EV.CARD_ADD: out.cardsAdded++; break;
      case EV.SUMMON: out.summons++; break;
      case EV.DEATH: deaths.add(ev.actorId); break;
      case EV.CHOICE: out.pendingChoices++; out.uncertain = true; break;
      default: break;
    }
  }

  for (const t of tmap.values()) {
    t.kills = deaths.has(t.id);
    out.targets.push(t);
  }
  out.targets.sort((a, b) => {
    const ea = sim.enemies.find(x => x.id === a.id);
    const eb = sim.enemies.find(x => x.id === b.id);
    return (ea ? ea.slot : 99) - (eb ? eb.slot : 99);
  });

  out.statuses = [...statusMap.values()].filter(s => s.stacks !== 0)
    .map(s => ({ ...s, remove: s.stacks < 0 }));
  out.counters = [...counterMap.values()].filter(c => c.delta !== 0);

  out.cost = playCost;
  out.energyAfter = sim.player.energy;
  out.energyDelta = sim.player.energy - energyBefore;

  const chosen = targetId ? out.targets.find(t => t.id === targetId) : null;
  out.damage = chosen ? chosen.damage : out.targets.reduce((s, t) => s + t.damage, 0);
  out.killsTarget = chosen ? chosen.kills : (out.targets.length === 1 ? out.targets[0].kills : false);
  out.killsAny = out.targets.some(t => t.kills);
  out.killsAll = sim.livingEnemies().length === 0 && engine.livingEnemies().length > 0;
  out.playerDies = !sim.player.alive;
  out.endsCombat = sim.over;
  if (out.partial) out.uncertain = true;

  return out;
}

/**
 * The complete preview, including everything behind a player choice. Choices are
 * resolved by the deterministic auto-picker on the clone — no human is ever asked
 * a question by a preview.
 * @returns {Promise<Object>}
 */
export async function previewCardAsync(engine, cardUid, targetId = null, opts = {}) {
  const out = previewCard(engine, cardUid, targetId, opts);
  if (!out.ok || !out._pending) { delete out._sim; delete out._pending; return out; }
  try { await out._pending; } catch (err) { console.error('[combat] async preview threw', err); }
  const full = rederive(out, out._sim, engine, targetId);
  delete full._sim; delete full._pending;
  full.partial = false;
  full.uncertain = out.uncertain || out.pendingChoices > 0;
  return full;
}

/** Re-run the aggregation over the now-complete event list. */
function rederive(out, sim, engine, targetId) {
  const events = out.events;
  const fresh = EMPTY();
  fresh.ok = true;
  fresh.events = events;
  fresh.reason = out.reason;
  const playerId = sim.player.id;
  const tmap = new Map(), statusMap = new Map(), counterMap = new Map(), deaths = new Set();
  let playCost = 0;
  for (const ev of events) {
    switch (ev.type) {
      case EV.CARD_PLAY: playCost = ev.cost; break;
      case EV.DAMAGE: {
        if (ev.targetId === playerId) { fresh.selfHpLoss += ev.hpLoss; break; }
        let t = tmap.get(ev.targetId);
        if (!t) {
          t = { id: ev.targetId, name: ev.targetName, damage: 0, hits: 0, blocked: 0, hpLoss: 0,
                hpBefore: ev.hpBefore, hpAfter: ev.hpAfter, blockBefore: ev.blockBefore,
                blockAfter: ev.blockAfter, kills: false };
          tmap.set(ev.targetId, t);
        }
        t.damage += ev.amount; t.hpLoss += ev.hpLoss; t.blocked += ev.blocked; t.hits += 1;
        t.hpAfter = ev.hpAfter; t.blockAfter = ev.blockAfter;
        break;
      }
      case EV.BLOCK: if (ev.actorId === playerId) fresh.block += ev.amount; break;
      case EV.HEAL: if (ev.actorId === playerId) fresh.heal += ev.amount; break;
      case EV.STATUS: {
        const key = `${ev.actorId}/${ev.id}`;
        const cur = statusMap.get(key) || { actorId: ev.actorId, id: ev.id, name: ev.name, kind: ev.kind, stacks: 0, remove: false };
        cur.stacks += ev.delta; statusMap.set(key, cur);
        break;
      }
      case EV.COUNTER: {
        const cur = counterMap.get(ev.id) || { id: ev.id, name: ev.name, delta: 0, after: ev.after };
        cur.delta += ev.delta; cur.after = ev.after; counterMap.set(ev.id, cur);
        break;
      }
      case EV.DRAW: fresh.draw++; break;
      case EV.DISCARD: if (ev.reason !== 'played') fresh.discard++; break;
      case EV.EXHAUST: fresh.exhaust++; break;
      case EV.CARD_ADD: fresh.cardsAdded++; break;
      case EV.SUMMON: fresh.summons++; break;
      case EV.DEATH: deaths.add(ev.actorId); break;
      case EV.CHOICE: fresh.pendingChoices++; fresh.uncertain = true; break;
      default: break;
    }
  }
  for (const t of tmap.values()) { t.kills = deaths.has(t.id); fresh.targets.push(t); }
  fresh.targets.sort((a, b) => {
    const ea = sim.enemies.find(x => x.id === a.id), eb = sim.enemies.find(x => x.id === b.id);
    return (ea ? ea.slot : 99) - (eb ? eb.slot : 99);
  });
  fresh.statuses = [...statusMap.values()].filter(x => x.stacks !== 0).map(x => ({ ...x, remove: x.stacks < 0 }));
  fresh.counters = [...counterMap.values()].filter(c => c.delta !== 0);
  fresh.cost = playCost;
  fresh.energyAfter = sim.player.energy;
  const chosen = targetId ? fresh.targets.find(t => t.id === targetId) : null;
  fresh.damage = chosen ? chosen.damage : fresh.targets.reduce((sum, t) => sum + t.damage, 0);
  fresh.killsTarget = chosen ? chosen.kills : (fresh.targets.length === 1 ? fresh.targets[0].kills : false);
  fresh.killsAny = fresh.targets.some(t => t.kills);
  fresh.killsAll = sim.livingEnemies().length === 0 && engine.livingEnemies().length > 0;
  fresh.playerDies = !sim.player.alive;
  fresh.endsCombat = sim.over;
  return fresh;
}

/**
 * What the enemy turn would do to the player if nothing changes. Used by the
 * "incoming damage" readout under the player's Guard.
 * Pure: sums every living enemy's current attack intent.
 */
export function previewIncoming(engine) {
  let total = 0;
  const parts = [];
  for (const en of engine.enemies) {
    if (!en.alive || !en.intent) continue;
    const t = en.intent.damage * en.intent.hits;
    if (t > 0) { total += t; parts.push({ enemyId: en.id, damage: en.intent.damage, hits: en.intent.hits, total: t }); }
  }
  const block = engine.player.block;
  return { total, parts, block, unblocked: Math.max(0, total - block), lethal: total - block >= engine.player.hp };
}

export default previewCard;
