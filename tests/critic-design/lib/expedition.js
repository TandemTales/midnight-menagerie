/**
 * One whole expedition, node by node, through the REAL `Run`. OWNER: balance.
 *
 * Nothing here re-implements the game. It walks `state/run.js` the way the
 * scenes do — `enterNode`, `run.combat`, `takeRewardCard`, `claimReward`,
 * `rest`, `upgradeCard`, `shopStock`/`buy*`, `chooseEventOption`, `leaveNode` —
 * so the deck grows, Keepsakes arrive at the rate the run layer grants them,
 * Snacks are bought and eaten, Courage carries between fights and Safe Rooms
 * heal. That is the whole point: the numbers below describe a run, not a
 * laboratory fight against a tutorial deck.
 */
import { Run } from '/game/src/state/run.js';
import { NodeType } from '/game/src/data/schema.js';
import { STATUS_TRICK_DEFS } from '/game/src/data/enemies/_lib.js';
import { cardById } from '/game/src/data/cards.js';
import * as P from './policy.js';
import { naiveTurn, competentTurn } from './bot.js';

export const MAX_TURNS = 60;

/**
 * `state/run.js buildCombat()` registers `allCards()` but not the two Status
 * Tricks that live in `data/enemies/_lib.js`, so in a real run every enemy that
 * does `addCard('clutter')` logs "unknown card" and adds nothing. Deck
 * interference — a whole Foyer enemy's design — is currently free. Reported to
 * the meta-run owner; the sim registers them so the measurement describes the
 * encounter as designed. `?clutter=0` measures the shipped behaviour instead.
 */
export function wireStatusTricks(engine, on = true) {
  if (on && engine?.registerCards) engine.registerCards(STATUS_TRICK_DEFS);
}

/** Run one fight to completion with the given bot. Returns per-fight telemetry. */
export async function fight(engine, bot, { run = null, maxTurns = MAX_TURNS, trace = null } = {}) {
  const t0 = performance.now();
  let dmgTaken = 0, hauntDamage = 0, hauntTicks = 0, pierceHits = 0, snacksUsed = 0;
  let cardsPlayed = 0, dmgDealt = 0, dmgBlockedByEnemies = 0, enemyGuard = 0;
  engine.on('damage', (ev) => {
    if (ev.targetId === engine.player.id) dmgTaken += ev.hpLoss;
    else { dmgDealt += ev.hpLoss; dmgBlockedByEnemies += ev.blocked || 0; }
    if (ev.cause === 'haunt') { hauntTicks++; hauntDamage += ev.hpLoss; }
    if (ev.pierce && ev.targetId !== engine.player.id) pierceHits++;
  });
  engine.on('block', (ev) => { if (ev.actorId !== engine.player.id) enemyGuard += ev.amount || 0; });
  const rulesBroken = {};
  const statusSeen = {};
  const moveLog = [];
  engine.on('rule:broken', (ev) => { rulesBroken[ev.ruleId] = (rulesBroken[ev.ruleId] || 0) + 1; });
  engine.on('status', (ev) => {
    if (ev.delta > 0 && ev.actorId !== engine.player.id) statusSeen[ev.id] = (statusSeen[ev.id] || 0) + ev.delta;
  });
  engine.on('summon', () => { moveLog.push('summon'); });
  const hpBefore = engine.player.hp;
  await engine.startCombat();

  const onSnack = (i, s) => {
    snacksUsed++;
    if (run && Array.isArray(run.snacks)) {
      const at = run.snacks.indexOf(s);
      if (at >= 0) run.snacks.splice(at, 1);
    }
  };

  let turns = 0;
  while (!engine.over && turns < maxTurns) {
    turns++;
    const d0 = dmgDealt, t0hp = engine.player.hp;
    if (bot === 'naive') await naiveTurn(engine);
    else await competentTurn(engine, { snacks: run ? run.snacks : null, onSnack });
    if (trace) {
      trace.push({
        turn: turns, dealt: dmgDealt - d0,
        enemies: engine.enemies.filter(e => e.alive).map(e => ({
          n: e.name, hp: e.hp, blk: e.block, i: e.intent?.moveId, d: e.intent?.totalDamage,
        })),
        php: engine.player.hp, blk: engine.player.block,
        played: engine.playedThisTurn.map(x => x.name),
      });
    }
    if (engine.over) break;
    await engine.endTurn();
    if (trace) trace[trace.length - 1].took = t0hp - engine.player.hp;
  }
  cardsPlayed = engine.stats.cardsPlayedThisCombat;
  return {
    win: !!engine.victory,
    lose: engine.over && !engine.victory,
    timeout: !engine.over,
    turns, dmgTaken, hpBefore, hpAfter: engine.player.hp,
    dmgDealt, dmgBlockedByEnemies, enemyGuard, rulesBroken, statusSeen,
    summons: moveLog.length,
    hauntDamage, hauntTicks, pierceHits, snacksUsed, cardsPlayed,
    ms: performance.now() - t0,
    enemyHpLeft: engine.enemies.reduce((s, x) => s + Math.max(0, x.hp), 0),
  };
}

const snapshotLoadout = (run) => ({
  deck: run.deck.map(c => ({ id: c.id, upgraded: !!c.upgraded })),
  keepsakes: run.keepsakes.map(k => k.id),
  snacks: run.snacks.map(s => ({ ...s })),
  courage: run.courage, maxCourage: run.maxCourage,
  lostThings: run.lostThings,
});

/**
 * Walk one expedition. Returns a full trace: every node, every fight, the deck
 * at the boss, and how it ended.
 */
export async function expedition({
  seed, bot = 'competent', policy = 'balanced', companion = 'marmalade',
  haunt = 0, clutter = true, maxNodes = 40,
} = {}) {
  const run = new Run({ companion, seed, hauntLevel: haunt });
  run.ephemeral = true;
  const core = P.coreSets(companion);
  const out = {
    seed, bot, policy, haunt,
    nodes: [], fights: [], result: null, killedBy: null,
    reachedBoss: false, bossWin: false,
    elites: 0, eliteWins: 0, scuffles: 0,
    loadoutAtBoss: null, loadoutAtFirstElite: null,
    endCourage: 0, maxCourage: run.maxCourage,
    deckEnd: null, keepsakesEnd: null,
    ms: 0,
  };
  const t0 = performance.now();

  // Start: the region's first row. Pick the start with the best onward options.
  let nodeId = run.map.startIds[run.fork('sim:start').int(run.map.startIds.length)];

  for (let step = 0; step < maxNodes; step++) {
    if (!nodeId) break;
    await run.enterNode(nodeId);
    const node = run.currentNode;
    const type = run.effectiveType(node);
    const rec = { id: nodeId, row: node.row, type };

    if (run.combat) {
      const engine = run.combat;
      wireStatusTricks(engine, clutter);
      const meta = { ...run.combatMeta };
      const r = await fight(engine, bot, { run });
      rec.fight = { ...meta, ...r };
      out.fights.push(rec.fight);
      if (type === NodeType.BIG_SCARE) { out.elites++; if (r.win) out.eliteWins++; }
      if (type === NodeType.SCUFFLE) out.scuffles++;
      if (type === NodeType.BOSS) { out.reachedBoss = true; out.bossWin = r.win; }
      if (!r.win) {
        out.result = 'defeat';
        out.killedBy = meta.name || null;
        out.deathType = type;
        break;
      }
      if (r.timeout) { out.result = 'stall'; break; }
    }

    // ── the room's own business ──────────────────────────────────────────────
    if (run.pendingReward) {
      const r = run.pendingReward;
      if (r.cards?.length) {
        const pick = P.draft(r.cards, policy, { core, deckSize: run.deck.length, skipFloor: 4 });
        if (pick) run.takeRewardCard(pick); else run.skipRewardCards();
      }
      const wasBoss = r.kind === 'boss';
      run.claimReward();
      if (wasBoss) { out.result = 'victory'; rec.done = true; out.nodes.push(rec); break; }
    } else if (type === NodeType.SAFE) {
      const c = P.restChoice(run);
      if (c.kind === 'rest') { rec.rest = run.rest(); }
      else {
        const uid = P.pickUpgrade(run, policy);
        if (uid) { run.upgradeCard(uid); rec.upgrade = uid; } else rec.rest = run.rest();
      }
      run.leaveNode();
    } else if (type === NodeType.SHOP) {
      const { buys } = P.shopPlan(run, policy);
      rec.bought = [];
      for (const b of buys) {
        if (run.lostThings < b.price) continue;
        if (b.kind === 'snack' && run.buySnack(b.snack, b.price)) rec.bought.push(b.snack.id);
        else if (b.kind === 'keepsake' && run.buyKeepsake(b.id, b.price)) rec.bought.push(b.id);
        else if (b.kind === 'card' && run.buyCard(b.id, b.price)) rec.bought.push(b.id);
      }
      run.leaveNode();
    } else if (run.pendingEvent) {
      const p = run.pendingEvent;
      if (p.rescue) {
        run.rescueCompanion(p.companion);
        run.leaveNode();
      } else {
        const def = run.currentEvent();
        let res = null;
        if (def) {
          const opt = P.pickEventOption(run, def);
          if (opt) res = run.chooseEventOption(opt);
          rec.event = { id: def.id, option: opt };
        }
        const pending = res?.pending;
        if (pending?.removeCard) {
          for (let i = 0; i < pending.removeCard; i++) {
            const worst = worstCard(run, policy, core);
            if (worst) run.removeCard(worst);
          }
        }
        if (pending?.upgradeCard) {
          for (let i = 0; i < pending.upgradeCard; i++) {
            const uid = P.pickUpgrade(run, policy);
            if (uid) run.upgradeCard(uid);
          }
        }
        if (pending?.combat) {
          await run.eventCombat(pending.combat);
          if (run.combat) {
            const engine = run.combat;
            wireStatusTricks(engine, clutter);
            const meta = { ...run.combatMeta };
            const r = await fight(engine, bot, { run });
            rec.fight = { ...meta, ...r, fromEvent: true };
            out.fights.push(rec.fight);
            if (!r.win) { out.result = 'defeat'; out.killedBy = meta.name; out.deathType = 'curiosity'; break; }
            if (run.pendingReward) {
              const rr = run.pendingReward;
              if (rr.cards?.length) {
                const pick = P.draft(rr.cards, policy, { core, deckSize: run.deck.length, skipFloor: 4 });
                if (pick) run.takeRewardCard(pick); else run.skipRewardCards();
              }
              run.claimReward();
            }
          }
        }
        if (!run.pendingReward) run.leaveNode();
        else run.claimReward();
      }
    } else if (type !== NodeType.BOSS) {
      run.leaveNode();
    }

    if (run.result === 'defeat') { out.result = 'defeat'; break; }
    out.nodes.push(rec);

    // ── choose the next room ────────────────────────────────────────────────
    const legal = run.legalNodes();
    if (!legal.length) break;
    // capture the loadout the moment before the two fights that matter
    const nxt = P.pickNode(run, legal);
    const nt = nxt ? run.effectiveType(nxt) : null;
    if (nt === NodeType.BOSS) out.loadoutAtBoss = snapshotLoadout(run);
    if (nt === NodeType.BIG_SCARE && !out.loadoutAtFirstElite) out.loadoutAtFirstElite = snapshotLoadout(run);
    nodeId = nxt?.id || null;
  }

  out.endCourage = run.courage;
  out.maxCourage = run.maxCourage;
  out.deckEnd = run.deck.map(c => (c.upgraded ? c.id + '+' : c.id));
  out.keepsakesEnd = run.keepsakes.map(k => k.id);
  out.lostThings = run.lostThings;
  if (!out.result) out.result = run.result || 'incomplete';
  out.ms = performance.now() - t0;
  return out;
}

function worstCard(run, policy, core) {
  const ctx = { core, deckSize: run.deck.length, skipFloor: 0 };
  let worst = null;
  for (const c of run.removableCards()) {
    const v = P.cardValue(cardById(c.id), policy, ctx);
    if (!worst || v < worst.v) worst = { uid: c.uid, v };
  }
  return worst?.uid || null;
}

/**
 * Fight one encounter with a *captured* loadout — the deck, Keepsakes, Snacks
 * and Courage a real expedition was actually carrying when it walked into that
 * room. This is how the boss and elite get a sample size larger than "the
 * number of runs that survived to meet them".
 */
export async function bench({ loadout, encounterTier, seed, bot = 'competent',
                              companion = 'marmalade', haunt = 0, clutter = true,
                              fullCourage = false, maxTurns = 120, trace = null,
                              encounterId = null, hpScale = 1 } = {}) {
  const run = new Run({ companion, seed, hauntLevel: haunt });
  run.ephemeral = true;
  run.deck = loadout.deck.map((c, i) => ({ uid: `b${i}`, id: c.id, upgraded: !!c.upgraded }));
  run.keepsakes = [];
  for (const id of loadout.keepsakes) run.addKeepsake(id);
  run.snacks = loadout.snacks.map(s => ({ ...s }));
  run.maxCourage = loadout.maxCourage;
  run.courage = fullCourage ? loadout.maxCourage : loadout.courage;

  const type = encounterTier === 'boss' ? NodeType.BOSS
    : encounterTier === 'elite' ? NodeType.BIG_SCARE : NodeType.SCUFFLE;
  const node = { id: `bench-${seed}`, row: 11 };
  // Pin one specific formation when asked — the three Foyer Big Scares are very
  // different fights and their spread is itself a finding.
  if (encounterId) run.encounterHistory = [];
  const engine = await run.buildCombat(node, type);
  if (encounterId && run.combatMeta.encounter !== encounterId) {
    // reroll deterministically until the requested formation comes up
    for (let k = 0; k < 60 && run.combatMeta.encounter !== encounterId; k++) {
      const e2 = await run.buildCombat({ id: `bench-${seed}-${k}`, row: 11 }, type);
      if (run.combatMeta.encounter === encounterId) {
        return finishBench(run, e2, bot, maxTurns, clutter, loadout, trace, hpScale);
      }
    }
  }
  return finishBench(run, engine, bot, maxTurns, clutter, loadout, trace, hpScale);
}

/** A what-if lever for sweeps ONLY. Shipping numbers live in the enemy defs. */
function scaleHp(engine, mul) {
  if (!mul || mul === 1) return;
  for (const en of engine.enemies) {
    en.maxHp = Math.max(1, Math.round(en.maxHp * mul));
    en.hp = Math.max(1, Math.round(en.hp * mul));
  }
}

async function finishBench(run, engine, bot, maxTurns, clutter, loadout, trace, hpScale = 1) {
  wireStatusTricks(engine, clutter);
  scaleHp(engine, hpScale);
  const meta = { ...run.combatMeta };
  const r = await fight(engine, bot, { run, maxTurns, trace });
  return { ...meta, ...r, courageBefore: run.courage, maxCourage: run.maxCourage,
           deckSize: loadout.deck.length,
           upgrades: loadout.deck.filter(c => c.upgraded).length,
           keepsakes: loadout.keepsakes.length };
}

export default { expedition, bench, fight };
