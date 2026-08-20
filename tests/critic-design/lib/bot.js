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
// The only opinion in here is the exchange rate: one point of enemy Courage is
// worth 1.15 of the player's, because every point of enemy Courage has to come
// off eventually while damage taken never comes back, and a shorter fight
// deletes whole enemy turns. A kill is worth much more than the Courage it
// costs, for the same reason. Guard beyond the telegraphed number is nearly
// worthless — that is the single correction the naive bot most needs.
// ─────────────────────────────────────────────────────────────────────────────
function boardScore(s, before, { blockAgainst = 0 } = {}) {
  if (!s.player.alive) return -1e6;
  let v = 1.0 * s.player.hp;
  const useful = Math.min(s.player.block, blockAgainst);
  v += 1.0 * useful + 0.08 * (s.player.block - useful);
  let enemyHp = 0, enemyBlock = 0, haunt = 0, weak = 0, vuln = 0, living = 0;
  for (const en of s.enemies) {
    if (!en.alive) continue;
    living++;
    enemyHp += Math.max(0, en.hp);
    enemyBlock += en.block;
    haunt += stacksOf(en, 'haunt');
    weak += stacksOf(en, 'weak');
    vuln += stacksOf(en, 'vulnerable');
  }
  v -= 1.15 * enemyHp;
  v -= 0.5 * enemyBlock;
  v += 32 * Math.max(0, before.living - living);
  if (living === 0) v += 400;
  // residual board value a one-turn horizon cannot otherwise see
  v += 0.55 * haunt + 1.1 * weak + 1.4 * vuln;
  v += 1.4 * stacksOf(s.player, 'ghoststep');
  v += 4.0 * stacksOf(s.player, 'strength');
  v += 2.0 * stacksOf(s.player, 'dexterity');
  v += 6.0 * (s.player.powers ? s.player.powers.size : 0);
  return v;
}

/** Cheap score used to shape the beam. No enemy turn simulated. */
function staticScore(s, before) {
  return boardScore(s, before, { blockAgainst: shownIncoming(s) })
       + 0.9 * s.player.energy            // do not dump for the sake of dumping
       + 0.7 * s.piles.hand.length;       // cards in hand are options
}

/** Simulate "stop here, end the turn" and score what the enemies leave behind. */
async function endTurnValue(e, before) {
  let t;
  try { t = e.clone(); await t.endTurn(); }
  catch { return -1e5; }
  return boardScore(t, before, { blockAgainst: shownIncoming(t) });
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
  const { snacks = null, onSnack = null, beam = 3, depth = 6, cap = 12 } = opts;
  const before = { living: e.livingEnemies().length };

  const baseline = await planTurn(e, before, { beam, depth, cap });

  // A Snack is a limited resource: eat one only when it is worth ~12 Courage of
  // board value, or when the snackless plan gets us killed.
  if (snacks && snacks.length) {
    let bestSnack = null;
    const desperate = baseline.score <= -1e5;
    for (let i = 0; i < snacks.length; i++) {
      let trial;
      try { trial = e.clone(); applySnack(trial, snacks[i], e.livingEnemies()[0]?.id || null); }
      catch { continue; }
      const plan = await planTurn(trial, before, { beam, depth, cap });
      if (plan.score > baseline.score + (desperate ? 0 : 12)
          && (!bestSnack || plan.score > bestSnack.score)) {
        bestSnack = { index: i, snack: snacks[i], score: plan.score, seq: plan.seq };
      }
    }
    if (bestSnack) {
      applySnack(e, bestSnack.snack, e.livingEnemies()[0]?.id || null);
      onSnack?.(bestSnack.index, bestSnack.snack);
      return replay(e, bestSnack.seq);
    }
  }
  return replay(e, baseline.seq);
}

async function replay(e, seq) {
  for (const mv of seq) {
    if (e.over || e.phase !== 'player') break;
    if (!e.canPlay(mv.uid, mv.targetId).ok) break;
    await e.playCard(mv.uid, mv.targetId);
  }
}

/**
 * Beam search over one player turn. Returns the best `[{uid,targetId}]`
 * sequence and the score of the board after the enemies have answered it.
 */
async function planTurn(e0, before, { beam, depth, cap }) {
  let frontier = [{ e: e0, seq: [] }];
  let best = { seq: [], score: await endTurnValue(e0, before) };

  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const st of frontier) {
      if (st.e.over || st.e.phase !== 'player') continue;
      for (const opt of options(st.e, cap)) {
        const sim = await step(st.e, opt.uid, opt.targetId);
        if (!sim) continue;
        const seq = st.seq.concat([opt]);
        if (sim.over) {
          const s = boardScore(sim, before, { blockAgainst: 0 }) + (sim.victory ? 250 : 0);
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
      const score = await endTurnValue(st.e, before);
      if (score > best.score) best = { seq: st.seq, score };
    }
  }
  return best;
}

export default { naiveTurn, competentTurn, applySnack, shownIncoming };
