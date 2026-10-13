/**
 * The seeded board both effect gates play on. OWNER: companion-cards.
 *
 *   tests/upgrade-effects/  - base vs UPGRADED, same seed: did the upgrade move anything?
 *   tests/base-effects/     - the card vs a blank twin, same seed: did the CARD move anything?
 *
 * Both ask "is this board identical to that one", so both have to build the
 * same board the same way, and every lesson the upgrade gate learned about a
 * fair comparison (see its page) lives here once rather than in two copies that
 * drift. Nothing in here decides what counts as dead; the pages do.
 */
import { RNG } from '../../game/src/core/rng.js';
import { CombatEngine } from '../../game/src/combat/engine.js';
import { makeDummySetup } from '../../game/src/combat/dummy.js';
import { installTrackers } from '../../game/src/data/companions/_util.js';
import * as CARDS from '../../game/src/data/cards.js';

export const SEED = 20260911;
export const TURNS_AFTER = 2;
export const SEED_COUNTERS = [['lives', 9], ['loose-bones', 3], ['height', 2], ['plump', 2],
  ['globs', 3], ['open-eyes', 3], ['patience', 2], ['stretch', 2], ['forecast', 2]];
export const SEED_ENEMY_STATUS = [['haunt', 6], ['web', 6], ['weak', 1]];

/** This board is one Kid. A Trick that pays a FRIEND cannot show anything here. */
export const PARTY = /friend|teammate|\bally\b|another Kid|other Kid|each Kid|every Kid|party/i;
/** A chooser takes the FIRST option here. */
export const CHOICE = /chooseOne|pickCards|pickEpitaph|pickHand|askRead/;

export function buildEngine(slug) {
  const deck = CARDS.companion(slug) ? CARDS.startingDeckFor(slug) : CARDS.sharedPool().slice(0, 8);
  return new CombatEngine(makeDummySetup(new RNG(SEED), { companion: slug, deck: deck.length ? deck : CARDS.sharedPool() }));
}

/**
 * Build, start and seed the board for one Companion, and play the warm-up.
 * Returns { e, t } where t is the first living enemy (the target). Identical on
 * every call with the same slug - that is the whole contract.
 */
export async function seededBoard(slug) {
  const e = buildEngine(slug);
  await e.startCombat();
  installTrackers(e, slug);
  // Bodies that cannot die: a kill ends the fight and truncates the comparison,
  // and the DIFFERENCE in damage is exactly what has to stay visible.
  for (const x of e.enemies) { x.maxHp = 9999; x.hp = 9999; }
  /* EVERY declared counter, not a hand-written six: a Companion's card
     usually pays off through their own track (Quills, Glow, Creases, Paper,
     Lurk, Loyalty, Patience), and a track sitting at 0 hides the difference. */
  for (const c of e.counters.values()) {
    const want = Math.min(c.max === undefined ? 3 : c.max, 3);
    if (want > (c.min || 0)) e.setCounter(c.id, want, 'test');
  }
  for (const [id, v] of SEED_COUNTERS) if (e.counters.has(id)) e.setCounter(id, v, 'test');
  const t = e.livingEnemies()[0];
  if (t) for (const [id, v] of SEED_ENEMY_STATUS) e.applyStatus(t, id, v);

  /* A turn that has already started. "Gain {b} Guard for each Trick you
     discarded this turn" is 5x0 and 7x0 on an untouched board, and "the first
     Trick each turn" never fires if this is the first. One ordinary play and
     one discard first -- identical on both sides -- give those a foothold. */
  const warm = e.piles.hand[0];
  if (warm) {
    e.player.energy = 9;
    const chk = e.canPlay(warm.uid, t && t.id);
    if (!chk || chk.ok !== false) {
      try { await e.playCard(warm.uid, warm.target === 'enemy' ? (t && t.id) : undefined); } catch (_) { /* affordability */ }
    }
  }
  const spare = e.piles.hand[0];
  if (spare) { try { e.moveCard(spare, 'discard', { reason: 'test' }); } catch (_) { /* pile guard */ } }
  return { e, t };
}

/** Everything one play can move, flattened. Same seed on both sides, so a
 *  difference is the card and SAMENESS is the finding. */
export function snapshot(e) {
  const st = (a) => [...a.statuses].map(([k, v]) => k + ':' + v).sort().join(' ');
  const bodies = [...e.enemies, ...(e.allies || [])]
    .map(x => [x.id, x.hp, x.block, x.alive ? 1 : 0, st(x)].join('/')).join(' | ');
  const counters = [...e.counters.values()].map(c => c.id + ':' + e.counter(c.id)).sort().join(' ');
  const piles = ['hand', 'draw', 'discard', 'exhaust', 'stash', 'limbo']
    .map(n => n + '=' + ((e.piles && e.piles[n]) || []).length).join(' ');
  const p = e.player;
  return [bodies, 'hp' + p.hp, 'guard' + p.block, 'nerve' + p.energy, st(p), counters, piles,
    'timers' + ((e.timers || []).length), 'objects' + ((e.objects || []).length)].join(' # ');
}

/**
 * A running tally of what the fight EMITTED (damage, Guard, healing, status
 * stacks). Guard is wiped and the hand re-dealt at turn start, so a board read
 * only at the end cannot see Curl Up's Guard; the tally survives the wipe.
 */
export function startTally(e) {
  const tally = { dmg: 0, hits: 0, block: 0, heal: 0, status: 0 };
  const amt = (ev) => ((ev && ev.amount) || 0);
  e.on('damage', (ev) => { tally.dmg += amt(ev); tally.hits += 1; });
  e.on('block', (ev) => { tally.block += amt(ev); });
  e.on('heal', (ev) => { tally.heal += amt(ev); });
  e.on('status', (ev) => { tally.status += Math.abs((ev && ev.delta) || 0); });
  return tally;
}
export const tallyText = (tally) => ['dmg' + tally.dmg, 'hits' + tally.hits, 'guard' + tally.block,
  'heal' + tally.heal, 'status' + tally.status].join(' ');

/**
 * A Power buffs what you play NEXT. Playing nothing after it means "your
 * Attacks deal 2 more" and "your Attacks deal 3 more" end the fight on
 * identical boards, so two ordinary Tricks are played each turn afterwards -
 * same hand, same order, both sides - and the Power shows up in the damage.
 * Returns the first error thrown, or ''.
 */
export async function playTurns(e, t, turns = TURNS_AFTER) {
  let threw = '';
  for (let i = 0; i < turns && !e.over; i++) {
    e.player.energy = 9;
    for (const k of e.piles.hand.slice(0, 2)) {
      const chk = e.canPlay(k.uid, t && t.id);
      if (chk && chk.ok === false) continue;
      try { await e.playCard(k.uid, k.target === 'enemy' ? (t && t.id) : undefined); }
      catch (err) { if (!threw) threw = String((err && err.message) || err); }
      if (e.over) break;
    }
    e.player.energy = 9;
    try { await e.endTurn(); } catch (err) { if (!threw) threw = String((err && err.message) || err); }
  }
  return threw;
}

/* A card's own source text, so a report can tell "dead" from "this board
   could not ask the question". `def.effect` is wrapped in `eff()`, so reading
   the function back gives the wrapper; the module text gives the card. */
const SRC = new Map();
export async function sourceFor(slug) {
  // Neutral Tricks live in data/neutral.js, not companions/: asking for
  // companions/neutral.js is a 404 in the console and a red gate.
  if (!slug || !CARDS.companion(slug)) return '';
  if (!SRC.has(slug)) {
    try {
      const r = await fetch('/game/src/data/companions/' + slug + '.js');
      SRC.set(slug, r.ok ? await r.text() : '');
    } catch (_) { SRC.set(slug, ''); }
  }
  return SRC.get(slug);
}
export function literalOf(text, id) {
  const at = text.indexOf("id: '" + id + "'");
  if (at < 0) return '';
  const next = text.indexOf("id: '", at + 5);
  return text.slice(at, next < 0 ? text.length : next);
}
