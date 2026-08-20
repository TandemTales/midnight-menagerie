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
import { Run, RUN_LENGTH_REGIONS } from '/game/src/state/run.js';
import { NodeType, REGION_ORDER } from '/game/src/data/schema.js';
import { STATUS_TRICK_DEFS } from '/game/src/data/enemies/_lib.js';
import { cardById } from '/game/src/data/cards.js';
import * as P from './policy.js';
import { naiveTurn, competentTurn } from './bot.js';

export const MAX_TURNS = 60;

/**
 * Round 1 registered `STATUS_TRICK_DEFS` here, because `state/run.js
 * buildCombat()` did not — so in a real run every enemy doing
 * `addCard('clutter')` logged "unknown card" and added nothing, and Lost
 * Luggage's and the Grand Coatcheck's deck interference was free. The run layer
 * registers them itself now, so this is a no-op kept only so `?clutter=0` can
 * still answer "what is that interference actually worth".
 */
export function wireStatusTricks(engine, on = true) {
  if (on || !engine) return;
  engine.cardDefs.delete('clutter');
  engine.cardDefs.delete('drowsy');
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
  // Per-fight running estimates the competent bot projects the rest of the
  // fight from. One object per fight, never shared between fights.
  const fc = { dps: 10, threat: 8, guard: 4, peak: 0, turns: 0 };
  let dbg = null;
  while (!engine.over && turns < maxTurns) {
    turns++;
    const d0 = dmgDealt, t0hp = engine.player.hp;
    const handAtStart = trace ? engine.piles.hand.map(c => c.name) : null;
    if (bot === 'naive') await naiveTurn(engine);
    else await competentTurn(engine, { snacks: run ? run.snacks : null, onSnack, fc, debug: trace ? (dbg = []) : null });
    if (trace) {
      trace.push({
        turn: turns, dealt: dmgDealt - d0,
        enemies: engine.enemies.filter(e => e.alive).map(e => ({
          n: e.name, hp: e.hp, blk: e.block, i: e.intent?.moveId, d: e.intent?.totalDamage,
        })),
        php: engine.player.hp, blk: engine.player.block,
        played: engine.playedThisTurn.map(x => x.name),
        hand: handAtStart,
        dbg: dbg ? dbg.sort((a, b) => b.score - a.score).slice(0, 6) : null,
        fc: { ...fc },
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

const newLedger = () => ({
  scuffle: 0, elite: 0, boss: 0, event: 0, hazard: 0,
  rested: 0, healed: 0, combatHeal: 0, rests: 0,
});

/**
 * One region's slice of an expedition. The whole point of the two-region build
 * is that these must be reported separately — a single total hides whether the
 * Nursery is a second act or a wall.
 */
function newRegionRec(run) {
  return {
    index: run.regionIndex, region: run.region,
    nodes: [], fights: [], visited: {},
    scuffles: 0, elites: 0, eliteWins: 0,
    reachedBoss: false, bossWin: false, cleared: false,
    loadoutAtBoss: null, loadoutAtFirstElite: null,
    ledger: newLedger(),
    // what the player walked into the region carrying
    entry: {
      courage: run.courage, maxCourage: run.maxCourage,
      deck: run.deck.length, upgrades: run.deck.filter(c => c.upgraded).length,
      keepsakes: run.keepsakes.length, snacks: run.snacks.length,
      lostThings: run.lostThings,
    },
    exit: null,
  };
}

/**
 * Walk one expedition — **the whole region ladder**, not one region.
 *
 * Until now this stopped at the first boss (`if (wasBoss) result = 'victory'`),
 * so with `RUN_LENGTH_REGIONS = 2` the Nursery was shipping unmeasured. It now
 * follows the run layer: `claimReward()` on a boss calls `completeRegion()`,
 * which either ends the run or calls `advanceRegion()` — new map, same deck,
 * same Keepsakes, same Snacks, same Courage. We re-seed from the new map's
 * `startIds` and keep walking. Only death, a stall, or clearing the LAST region
 * ends the loop.
 *
 * Returns a full trace with `regions[]` alongside the flat totals.
 */
export async function expedition({
  seed, bot = 'competent', policy = 'balanced', companion = 'marmalade',
  haunt = 0, clutter = true, maxNodes = 90, regionHeal = 0,
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
    // per-region, in ladder order. `regions[1]` is the Nursery.
    regions: [], regionsCleared: 0, deathRegion: null, deathRegionIndex: null,
    endCourage: 0, maxCourage: run.maxCourage,
    deckEnd: null, keepsakesEnd: null,
    // The Courage ledger. Where a region's whole health budget actually goes.
    ledger: newLedger(),
    visited: {},
    ms: 0,
  };
  let R = newRegionRec(run);
  out.regions.push(R);
  /** Every ledger entry lands in both the run total and the current region. */
  const led = (k, v) => { out.ledger[k] += v; R.ledger[k] += v; };
  const t0 = performance.now();

  // Start: the region's first row. Pick the start with the best onward options.
  let nodeId = run.map.startIds[run.fork('sim:start').int(run.map.startIds.length)];

  for (let step = 0; step < maxNodes; step++) {
    if (!nodeId) break;
    const cBeforeNode = run.courage;
    await run.enterNode(nodeId);
    const node = run.currentNode;
    const type = run.effectiveType(node);
    out.visited[type] = (out.visited[type] || 0) + 1;
    R.visited[type] = (R.visited[type] || 0) + 1;
    if (node.payload && node.payload.hazard === 'sagging') led('hazard', 3);
    const rec = { id: nodeId, row: node.row, type, regionIndex: R.index, region: R.region };

    if (run.combat) {
      const engine = run.combat;
      wireStatusTricks(engine, clutter);
      const meta = { ...run.combatMeta };
      const r = await fight(engine, bot, { run });
      rec.fight = { ...meta, ...r, regionIndex: R.index, region: R.region };
      out.fights.push(rec.fight);
      R.fights.push(rec.fight);
      led(type === NodeType.BOSS ? 'boss' : type === NodeType.BIG_SCARE ? 'elite' : 'scuffle', r.dmgTaken);
      // Anything that put Courage back during the fight (Pocket Flashlight's
      // end-of-combat heal, Tin of Sardines, Snacks) shows up as the gap
      // between what we were hit for and what we actually walked out with.
      if (r.win) led('combatHeal', Math.max(0, run.courage - (cBeforeNode - r.dmgTaken)));
      if (type === NodeType.BIG_SCARE) { out.elites++; R.elites++; if (r.win) { out.eliteWins++; R.eliteWins++; } }
      if (type === NodeType.SCUFFLE) { out.scuffles++; R.scuffles++; }
      if (type === NodeType.BOSS) {
        out.reachedBoss = true; out.bossWin = r.win;
        R.reachedBoss = true; R.bossWin = r.win;
      }
      if (!r.win) {
        out.result = 'defeat';
        out.killedBy = meta.name || null;
        out.deathType = type;
        out.deathRegion = R.region; out.deathRegionIndex = R.index;
        break;
      }
      if (r.timeout) { out.result = 'stall'; out.deathRegion = R.region; out.deathRegionIndex = R.index; break; }
    }

    // ── the room's own business ──────────────────────────────────────────────
    if (run.pendingReward) {
      const r = run.pendingReward;
      if (r.cards?.length) {
        const pick = P.draft(r.cards, policy, { core, deckSize: run.deck.length, skipFloor: 4 });
        if (pick) run.takeRewardCard(pick); else run.skipRewardCards();
      }
      const wasBoss = r.kind === 'boss';
      const regionBefore = run.regionIndex;
      run.claimReward();
      if (wasBoss) {
        // `claimReward` → `completeRegion()` → `end(true)` on the last region,
        // or `advanceRegion()` which rebuilds the map and keeps everything else.
        R.cleared = true;
        R.exit = snapshotExit(run);
        out.regionsCleared++;
        rec.done = true;
        out.nodes.push(rec); R.nodes.push(rec);
        if (run.result || run.regionIndex === regionBefore) { out.result = 'victory'; break; }
        /**
         * A WHAT-IF, off by default (`regionHeal = 0`), never on in a shipping
         * measurement. `advanceRegion()` restores nothing, so the player walks
         * into the Nursery at a measured median 38 of 71 Courage with p25 = 17
         * and no Safe Room yet. This knob answers "what would a post-boss
         * campfire be worth", as a fraction of maximum Courage. The answer
         * belongs to meta-run, whose file `state/run.js` is — see the note.
         */
        if (regionHeal > 0) {
          const want = Math.round(run.maxCourage * regionHeal);
          if (run.courage < want) { out.regionHealGiven = (out.regionHealGiven || 0) + (want - run.courage); run.courage = want; }
        }
        R = newRegionRec(run);
        out.regions.push(R);
        const starts = run.map.startIds;
        nodeId = starts[run.fork(`sim:start:${run.regionIndex}`).int(starts.length)];
        continue;
      }
    } else if (type === NodeType.SAFE) {
      const c = P.restChoice(run);
      if (c.kind === 'rest') { rec.rest = run.rest(); led('rested', rec.rest); led('rests', 1); }
      else {
        const uid = P.pickUpgrade(run, policy);
        if (uid) { run.upgradeCard(uid); rec.upgrade = uid; }
        else { rec.rest = run.rest(); led('rested', rec.rest); led('rests', 1); }
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
            rec.fight = { ...meta, ...r, fromEvent: true, regionIndex: R.index, region: R.region };
            out.fights.push(rec.fight);
            R.fights.push(rec.fight);
            if (!r.win) {
              out.result = 'defeat'; out.killedBy = meta.name; out.deathType = 'curiosity';
              out.deathRegion = R.region; out.deathRegionIndex = R.index;
              break;
            }
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

    if (run.result === 'defeat') {
      out.result = 'defeat';
      out.deathRegion = R.region; out.deathRegionIndex = R.index;
      break;
    }
    if (type !== NodeType.SAFE && !rec.fight) {
      const d = run.courage - cBeforeNode;
      if (d > 0) led('healed', d); else led('event', -d);
    }
    out.nodes.push(rec); R.nodes.push(rec);

    // ── choose the next room ────────────────────────────────────────────────
    const legal = run.legalNodes();
    if (!legal.length) break;
    // capture the loadout the moment before the two fights that matter
    const nxt = P.pickNode(run, legal);
    const nt = nxt ? run.effectiveType(nxt) : null;
    if (nt === NodeType.BOSS) {
      R.loadoutAtBoss = snapshotLoadout(run);
      if (!out.loadoutAtBoss) out.loadoutAtBoss = R.loadoutAtBoss;
    }
    if (nt === NodeType.BIG_SCARE && !R.loadoutAtFirstElite) {
      R.loadoutAtFirstElite = snapshotLoadout(run);
      if (!out.loadoutAtFirstElite) out.loadoutAtFirstElite = R.loadoutAtFirstElite;
    }
    nodeId = nxt?.id || null;
  }

  if (!R.exit) R.exit = snapshotExit(run);
  out.endCourage = run.courage;
  out.maxCourage = run.maxCourage;
  out.deckEnd = run.deck.map(c => (c.upgraded ? c.id + '+' : c.id));
  out.keepsakesEnd = run.keepsakes.map(k => k.id);
  out.lostThings = run.lostThings;
  if (!out.result) out.result = run.result || 'incomplete';
  // "Survived the whole ladder" is the only thing that counts as a victory now.
  out.regionsPlayed = out.regions.length;
  out.regionsTarget = Math.min(RUN_LENGTH_REGIONS, REGION_ORDER.length);
  out.ms = performance.now() - t0;
  return out;
}

const snapshotExit = (run) => ({
  courage: run.courage, maxCourage: run.maxCourage,
  deck: run.deck.length, upgrades: run.deck.filter(c => c.upgraded).length,
  keepsakes: run.keepsakes.length, snacks: run.snacks.length,
  lostThings: run.lostThings,
});

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
                              encounterId = null, hpScale = 1, region = null } = {}) {
  const run = new Run({ companion, seed, hauntLevel: haunt });
  run.ephemeral = true;
  // Bench a later region's content. `_buildCombat` resolves its formations
  // through `this.region`, so moving the Run up the ladder is all it takes —
  // the map is only read for `rows`, and every bench pins its own node row.
  if (region && region !== run.region) {
    const idx = REGION_ORDER.indexOf(region);
    if (idx < 0) throw new Error(`[bench] unknown region ${region}`);
    run.regionIndex = idx;
    run.region = region;
    run.encounterHistory = [];
  }
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
