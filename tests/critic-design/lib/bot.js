/**
 * Two players. OWNER: balance.
 *
 * The old sim had one bot, and it was structurally broken as an instrument: it
 * blocked *exactly* the telegraphed number every turn, which makes any solo
 * enemy unloseable regardless of its damage, and it never used a Snack. It
 * measured the encounter's arithmetic, not the encounter.
 *
 * So there are two now, and the gap between them is itself a measurement:
 *
 *   NAIVE      — reads intents, blocks the shown number, swings the biggest
 *                attack at the first living enemy, never uses a Snack, never
 *                sequences. A first-time player who understands the UI.
 *
 *   COMPETENT  — a beam search over the whole player turn whose terminal states
 *                are scored by *actually simulating the enemy turn*. It knows
 *                no card's rules text; it discovers what a card does by playing
 *                it on a clone and looking at the result. So it sequences
 *                (strip the Brace before you hit; Haunt, then let them swing),
 *                values Ghoststep and Haunt because it watches them pay off,
 *                does not overblock, and eats a Snack when a Snack is the
 *                difference.
 *
 * The whole thing rides on `combat/preview.js`: `previewCard()` clones the
 * engine, plays the card on the clone and hands the clone back. The clone IS
 * the successor state, so the search is chained previews. Preview and
 * resolution are the same code path, so a plan found on clones replays
 * move-for-move on the real engine (same seeded RNG state, restored).
 */
import { previewCard } from '/game/src/combat/preview.js';
import { Target, CardType } from '/game/src/data/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Snacks — mirrors scenes/combat.js `_useSnack` (the shipped behaviour: a Snack
// costs no Nerve and resolves through the ordinary engine API).
// ─────────────────────────────────────────────────────────────────────────────
export function applySnack(E, snack, targetId = null) {
  const fx = snack?.effect;
  if (!fx) return false;
  const me = E.player;
  let target = null;
  if (fx.target === 'enemy') {
    const living = E.livingEnemies();
    if (!living.length) return false;
    target = (targetId && living.find(x => x.id === targetId)) || living[0];
  }
  if (fx.heal) E.heal(me, fx.heal, 'snack');
  if (fx.block) E.gainBlock(me, fx.block, { source: 'snack', fromCard: false, reason: 'snack' });
  if (fx.energy) E.gainEnergy(fx.energy, 'snack');
  if (fx.cleanse) E.cleanse(me, 'snack');
  if (fx.damageAll) {
    for (const en of E.livingEnemies()) {
      E.dealDamage({ attacker: me, defender: en, amount: fx.damageAll, kind: 'snack', cause: snack.name });
    }
  }
  if (Array.isArray(fx.status)) E.applyStatus(target || me, fx.status[0], fx.status[1], { source: 'snack' });
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// shared reads
// ─────────────────────────────────────────────────────────────────────────────

/** What the intents PROMISE this enemy turn — the number the HUD shows. */
export function shownIncoming(e) {
  let t = 0;
  for (const en of e.enemies) {
    if (!en.alive || !en.intent) continue;
    t += (en.intent.totalDamage || 0);
  }
  return t;
}

const handOf = (e) => e.piles.hand.filter(c => !c.unplayable);
const stacksOf = (a, id) => a.statuses.get(id) || 0;

/** Legal (card, target) pairs, deduped so five identical Scratches cost one probe. */
function options(e, cap) {
  const out = [];
  const seen = new Set();
  const living = e.livingEnemies();
  for (const card of handOf(e)) {
    const key = `${card.id}|${card.upgraded ? 1 : 0}|${e.costOf(card)}`;
    if (card.target === Target.ENEMY) {
      for (const en of living) {
        const k = `${key}|${en.id}`;
        if (seen.has(k) || !e.canPlay(card.uid, en.id).ok) continue;
        seen.add(k);
        out.push({ uid: card.uid, targetId: en.id });
      }
    } else {
      if (seen.has(key) || !e.canPlay(card.uid, null).ok) continue;
      seen.add(key);
      out.push({ uid: card.uid, targetId: null });
    }
  }
  return out.slice(0, cap);
}

/** Play one card on a CLONE and hand the clone back. */
async function step(e, uid, targetId) {
  let pv;
  try { pv = previewCard(e, uid, targetId); }
  catch { return null; }
  if (!pv.ok) return null;
  if (pv._pending) { try { await pv._pending; } catch { /* clone is still usable */ } }
  return pv._sim || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluation
//
// The first version of this used a fixed damage-versus-Guard exchange rate, and
// it was wrong in a way worth writing down, because it is the naive bot's own
// mistake seen from the other side. A fixed rate says "6 damage beats 5 Guard",
// which is true in a three-turn Scuffle and false in a thirteen-turn boss fight
// where the Courage pool is too deep to race and the only question is whether
// you out-live it. With the fixed rate the "competent" bot LOST to the naive one
// against the Butler — the instrument reporting that the instrument was broken.
//
// So a terminal state is scored by projecting the rest of the fight from the
// rates the candidate turn itself demonstrates:
//
//     turnsLeft   = enemy Courage remaining / damage this plan dealt
//     lossPerTurn = the threat they keep showing − Guard this plan raised
//     value       = Courage now − turnsLeft × lossPerTurn
//
// A plan that deals 18 and blocks nothing buys a short fight and a big bill; a
// plan that deals 6 and blocks 10 buys a long fight and no bill at all. The bot
// finds the crossover itself, per fight — which is the decision a competent
// player is actually making, and the reason it can be beaten by a boss that is
// genuinely too big rather than merely arithmetically unfavourable.
// ─────────────────────────────────────────────────────────────────────────────
function enemyPool(s) {
  let hp = 0, block = 0, living = 0, haunt = 0, weak = 0, vuln = 0;
  for (const en of s.enemies) {
    if (!en.alive) continue;
    living++;
    hp += Math.max(0, en.hp);
    block += en.block;
    haunt += stacksOf(en, 'haunt');
    weak += stacksOf(en, 'weak');
    vuln += stacksOf(en, 'vulnerable');
  }
  return { hp, block, living, haunt, weak, vuln };
}

/** Board value that does not depend on the projection. */
function residual(s, before, pool) {
  let v = 34 * Math.max(0, before.living - pool.living);
  v += 0.55 * pool.haunt + 1.2 * pool.weak + 1.5 * pool.vuln;
  v += 1.4 * stacksOf(s.player, 'ghoststep');
  v += 4.0 * stacksOf(s.player, 'strength');
  v += 2.0 * stacksOf(s.player, 'dexterity');
  v += 6.0 * (s.player.powers ? s.player.powers.size : 0);
  return v;
}

/**
 * @param {object} t       board AFTER the simulated enemy turn
 * @param {object} before  {living, enemyHp} at the start of this player turn
 * @param {number} guarded Guard standing when the player ended the turn
 * @param {object} fc      per-fight running estimates {dps, threat, turns}
 */
function projectedValue(t, before, guarded, fc) {
  if (!t.player.alive) return -1e6;
  const pool = enemyPool(t);
  if (pool.living === 0) return 1e4 + t.player.hp;

  const dealt = Math.max(0, before.enemyHp - pool.hp);
  // Floored so a pure-defence turn does not project an infinite fight, and
  // blended with what this fight has actually managed so far.
  const dps = Math.max(2.5, 0.65 * dealt + 0.35 * fc.dps);
  const turnsLeft = Math.min(28, (pool.hp + pool.block * 0.6) / dps);
  const lossPerTurn = Math.max(0, Math.max(1, fc.threat) - guarded);

  let v = t.player.hp - turnsLeft * lossPerTurn;
  v -= turnsLeft * 0.35;                        // a long fight is its own risk
  v += residual(t, before, pool);
  return v;
}

/** Cheap score used only to shape the beam — no enemy turn simulated. */
function staticScore(s, before) {
  const pool = enemyPool(s);
  const useful = Math.min(s.player.block, shownIncoming(s));
  return s.player.hp
       + 1.0 * useful + 0.06 * (s.player.block - useful)
       - 0.9 * pool.hp - 0.4 * pool.block
       + residual(s, before, pool)
       + 0.9 * s.player.energy              // do not dump for the sake of dumping
       + 0.7 * s.piles.hand.length;         // cards in hand are options
}

/** Simulate "stop here, end the turn" and score what the enemies leave behind. */
async function endTurnValue(e, before, fc) {
  const guarded = e.player.block;
  let t;
  try { t = e.clone(); await t.endTurn(); }
  catch { return -1e5; }
  return projectedValue(t, before, guarded, fc);
}

// ─────────────────────────────────────────────────────────────────────────────
// NAIVE
// ─────────────────────────────────────────────────────────────────────────────
export async function naiveTurn(e) {
  for (let guard = 0; guard < 40; guard++) {
    if (e.over || e.phase !== 'player') break;
    const living = e.livingEnemies();
    const tid = living[0] ? living[0].id : null;
    const hand = handOf(e).filter(c => e.canPlay(c.uid, null).ok
      || living.some(en => e.canPlay(c.uid, en.id).ok));
    if (!hand.length) break;
    const need = Math.max(0, shownIncoming(e) - e.player.block);
    const snap = (c) => e.cardSnap(c, tid);

    let pick = null;
    for (const c of hand) {                       // lethal first
      if (c.type !== CardType.ATTACK) continue;
      const d = snap(c).display?.d?.value ?? 0;
      const en = living.find(x => d >= x.hp + x.block);
      if (en && e.canPlay(c.uid, en.id).ok) { pick = { c, t: en.id }; break; }
    }
    if (!pick && need > 0) {
      const blocks = hand.filter(c => (snap(c).display?.b?.value ?? 0) > 0)
        .sort((a, b) => (snap(b).display.b.value) - (snap(a).display.b.value));
      if (blocks.length) pick = { c: blocks[0], t: null };
    }
    if (!pick) {
      const atks = hand.filter(c => c.type === CardType.ATTACK)
        .sort((a, b) => (snap(b).display?.d?.value ?? 0) - (snap(a).display?.d?.value ?? 0));
      if (atks.length) pick = { c: atks[0], t: tid };
    }
    if (!pick) {
      const rest = hand.filter(c => c.type !== CardType.ATTACK);
      if (rest.length) pick = { c: rest[0], t: tid };
    }
    if (!pick) break;
    const t = pick.c.target === Target.ENEMY ? (pick.t || tid) : null;
    if (!e.canPlay(pick.c.uid, t).ok) break;
    await e.playCard(pick.c.uid, t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPETENT
// ─────────────────────────────────────────────────────────────────────────────
export async function competentTurn(e, opts = {}) {
  const { snacks = null, onSnack = null, beam = 3, depth = 6, cap = 12, fc = null, debug = null } = opts;
  const pool0 = enemyPool(e);
  const before = { living: pool0.living, enemyHp: pool0.hp };
  const F = fc || { dps: 10, threat: 8, turns: 0 };
  F.threat = F.turns === 0 ? Math.max(4, shownIncoming(e))
    : (F.threat * F.turns + shownIncoming(e)) / (F.turns + 1);

  const baseline = await planTurn(e, before, { beam, depth, cap, fc: F, debug });

  // A Snack is a limited resource: eat one only when it is worth ~12 Courage of
  // board value, or when the snackless plan gets us killed.
  if (snacks && snacks.length) {
    let bestSnack = null;
    const desperate = baseline.score <= -1e5;
    for (let i = 0; i < snacks.length; i++) {
      let trial;
      try { trial = e.clone(); applySnack(trial, snacks[i], e.livingEnemies()[0]?.id || null); }
      catch { continue; }
      const plan = await planTurn(trial, before, { beam, depth, cap, fc: F });
      if (plan.score > baseline.score + (desperate ? 0 : 12)
          && (!bestSnack || plan.score > bestSnack.score)) {
        bestSnack = { index: i, snack: snacks[i], score: plan.score, seq: plan.seq };
      }
    }
    if (bestSnack) {
      applySnack(e, bestSnack.snack, e.livingEnemies()[0]?.id || null);
      onSnack?.(bestSnack.index, bestSnack.snack);
      await replay(e, bestSnack.seq);
      return bookkeep(e, before, F);
    }
  }
  await replay(e, baseline.seq);
  return bookkeep(e, before, F);
}

/** Fold what the turn actually achieved back into the running estimates. */
function bookkeep(e, before, F) {
  const dealt = Math.max(0, before.enemyHp - enemyPool(e).hp);
  F.dps = F.turns === 0 ? Math.max(4, dealt) : (F.dps * F.turns + dealt) / (F.turns + 1);
  F.turns++;
  return F;
}

/**
 * Replay a plan found on clones onto the real engine.
 *
 * This used to `break` the moment a step was illegal, and that quietly ruined
 * the bot: cards that return themselves to hand (Frenzied Zoomies) can make one
 * mid-plan step unplayable, and the abort threw away everything after it — which
 * was, reliably, the Curl Up the plan had put LAST. The bot looked like it had
 * decided not to block. It had decided to block and then dropped the card.
 *
 * So: skip a step that no longer applies, keep the rest, and accept an
 * equivalent copy of the same Trick if the specific uid has moved on.
 */
async function replay(e, seq) {
  for (const mv of seq) {
    if (e.over || e.phase !== 'player') break;
    let uid = mv.uid;
    if (!e.canPlay(uid, mv.targetId).ok) {
      const want = e.card(uid);
      const alt = want && e.piles.hand.find(c => c.id === want.id && c.upgraded === want.upgraded
        && e.canPlay(c.uid, mv.targetId).ok);
      if (!alt) continue;
      uid = alt.uid;
    }
    await e.playCard(uid, mv.targetId);
  }
}

/**
 * Beam search over one player turn. Returns the best `[{uid,targetId}]`
 * sequence and the score of the board after the enemies have answered it.
 */
async function planTurn(e0, before, { beam, depth, cap, fc, debug = null }) {
  let frontier = [{ e: e0, seq: [] }];
  let best = { seq: [], score: await endTurnValue(e0, before, fc) };
  if (debug) debug.push({ d: -1, names: ['(pass)'], score: +best.score.toFixed(1), guarded: e0.player.block });

  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const st of frontier) {
      if (st.e.over || st.e.phase !== 'player') continue;
      for (const opt of options(st.e, cap)) {
        const sim = await step(st.e, opt.uid, opt.targetId);
        if (!sim) continue;
        const seq = st.seq.concat([opt]);
        if (sim.over) {
          const s = sim.victory ? 1e4 + sim.player.hp + 200 : -1e6;
          if (s > best.score) best = { seq, score: s };
          continue;
        }
        next.push({ e: sim, seq, s: staticScore(sim, before) });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.s - a.s);
    frontier = next.slice(0, beam);
    // Only the surviving frontier pays for a full enemy-turn simulation.
    for (const st of frontier) {
      const score = await endTurnValue(st.e, before, fc);
      if (debug) {
        debug.push({ d, names: st.seq.map(x => e0.card(x.uid)?.name || x.uid),
                     score: +score.toFixed(1), guarded: st.e.player.block,
                     ehp: enemyPool(st.e).hp });
      }
      if (score > best.score) best = { seq: st.seq, score };
    }
  }
  return best;
}

export default { naiveTurn, competentTurn, applySnack, shownIncoming };
