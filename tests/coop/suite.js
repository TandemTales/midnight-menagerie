/**
 * Co-op combat assertion suite. OWNER: combat-engine.
 *
 * Everything here runs a REAL party engine — no mocks. CONTRACTS rule 9: a
 * suite whose mock implements the mechanic it is testing proves nothing, and
 * this project has already shipped a green enemy suite over a bug where every
 * multi-hit attack dealt damage `hits²` times.
 *
 * The strict seat guard is ARMED in every party built here (dummy.js sets it),
 * so any engine path that still reads `engine.player` in a party throws instead
 * of quietly resolving to seat 0. That is the point: an unported seam should
 * fail loudly here rather than send a teammate's damage to the wrong Kid.
 */

import { RNG } from '../../game/src/core/rng.js';
import { _resetUid } from '../../game/src/combat/piles.js';
import {
  makeDummyParty, startDummyParty, makeDummyCombat, SCRATCH,
} from '../../game/src/combat/dummy.js';
import { EV } from '../../game/src/combat/events.js';

// ── micro test framework ────────────────────────────────────────────────────
const results = [];
let current = null;

function test(name, fn) {
  current = { name, asserts: [], failed: 0, error: null };
  results.push(current);
  try { fn(); } catch (e) { current.error = (e && e.stack) || String(e); current.failed++; }
  current = null;
}
async function atest(name, fn) {
  current = { name, asserts: [], failed: 0, error: null };
  results.push(current);
  try { await fn(); } catch (e) { current.error = (e && e.stack) || String(e); current.failed++; }
  current = null;
}
function ok(cond, label) {
  const pass = !!cond;
  current.asserts.push({ label, pass });
  if (!pass) current.failed++;
  return pass;
}
function eq(actual, expected, label) {
  const pass = Object.is(actual, expected);
  current.asserts.push({ label: `${label} — expected ${fmt(expected)}, got ${fmt(actual)}`, pass });
  if (!pass) current.failed++;
  return pass;
}
function throws(fn, label) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  current.asserts.push({ label, pass: threw });
  if (!threw) current.failed++;
  return threw;
}
function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`;
  return String(v);
}

// ── the suite ───────────────────────────────────────────────────────────────

export async function run() {
  results.length = 0;

  test('party: seats exist, each with its own identity and its own deck', () => {
    _resetUid(0);
    const e = makeDummyParty(new RNG(7), 3);
    eq(e.partySize, 3, 'three seats');
    ok(e.isParty, 'isParty is true');
    eq(e.players[0].seat, 0, 'seat 0 knows its index');
    eq(e.players[2].seat, 2, 'seat 2 knows its index');
    eq(e.players[0].id, 'player', 'seat 0 keeps the solo id so saves stay readable');
    eq(e.players[1].id, 'player1', 'seat 1 gets its own id');
    ok(e.players[0].piles !== e.players[1].piles, 'seats do not share a pile set');
    eq(e.players[0].piles.draw.length, 10, 'seat 0 has its own ten cards');
    eq(e.players[1].piles.draw.length, 10, 'seat 1 has its own ten cards');
    const shared = e.players[0].piles.draw.some(c => e.players[1].piles.draw.includes(c));
    ok(!shared, 'no card INSTANCE is in two seats at once');
    eq(e.seat(1), e.players[1], 'seat(n) addresses a seat');
    eq(e.seat(9), null, 'seat(n) out of range is null, not undefined');
  });

  test('party: engine.player and engine.piles throw rather than silently mean seat 0', () => {
    const e = makeDummyParty(new RNG(7), 2);
    throws(() => e.player, 'engine.player throws in a party with the guard armed');
    throws(() => e.piles, 'engine.piles throws in a party with the guard armed');
    const solo = makeDummyCombat(new RNG(7));
    ok(solo.player && solo.player.seat === 0, 'solo still reads engine.player normally');
    ok(solo.piles && solo.piles.draw.length === 10, 'solo still reads engine.piles normally');
    // Shipped builds must not throw at a player mid-run: guard OFF = seat 0.
    const loose = makeDummyParty(new RNG(7), 2, { strictCtx: false });
    eq(loose.player, loose.players[0], 'with the guard off it degrades to seat 0, never an exception');
  });

  test('party: enemy Courage follows the non-linear curve, not the party size', () => {
    const solo = makeDummyCombat(new RNG(42));
    const duo = makeDummyParty(new RNG(42), 2);
    const trio = makeDummyParty(new RNG(42), 3);
    const quad = makeDummyParty(new RNG(42), 4);
    const hp = (e, i) => e.enemies[i].maxHp;
    // Same seed rolls the same base Courage, so the ratio is the curve alone.
    eq(hp(duo, 0), Math.round(hp(solo, 0) * 2.2), '2 players -> 220% Courage');
    eq(hp(trio, 0), Math.round(hp(solo, 0) * 3.6), '3 players -> 360% Courage');
    eq(hp(quad, 0), Math.round(hp(solo, 0) * 5.2), '4 players -> 520% Courage');
    ok(hp(quad, 0) < hp(solo, 0) * 4 * 1.35, '4p is well under a linear 4x plus a third');
    eq(duo.enemies[0].hp, duo.enemies[0].maxHp, 'a scaled fight does not open pre-damaged');
    eq(solo.partyHpScale, 1, 'solo is never scaled');
  });

  await atest('party: a real fight starts, and every seat draws its own hand', async () => {
    const e = await startDummyParty(new RNG(11), 2);
    ok(e.started, 'combat started');
    for (const pl of e.players) {
      eq(pl.piles.hand.length, 5, `seat ${pl.seat} drew five`);
      eq(pl.piles.draw.length, 5, `seat ${pl.seat} has five left in its draw pile`);
      eq(pl.energy, pl.energyMax, `seat ${pl.seat} has full Nerve`);
    }
    const h0 = e.players[0].piles.hand.map(c => c.uid);
    const h1 = e.players[1].piles.hand.map(c => c.uid);
    ok(!h0.some(u => h1.includes(u)), 'the two hands share no card');
  });

  await atest('party: an enemy marks one seat and keeps that mark across refreshes', async () => {
    const e = await startDummyParty(new RNG(3), 3);
    const en = e.enemies[0];
    const first = e.intentTargetFor(en);
    ok(first && first.side === 'player', 'an enemy aims at a seat');
    eq(e.intentTargetFor(en), first, 'asking twice gives the same seat');
    e.refreshIntents('test');
    eq(e.intentTargetFor(en), first, 'the mark survives an intent refresh');
    ok(e.enemies.some(x => x.targetSeatId), 'the mark is recorded on the enemy');
  });

  await atest('party: Racket pulls every enemy onto the seat that made it', async () => {
    const e = await startDummyParty(new RNG(5), 3);
    const loud = e.players[2];
    e.applyStatus(loud, 'racket', 1, { reason: 'test' });
    for (const en of e.enemies) {
      eq(e.intentTargetFor(en), loud, `enemy ${en.id} is pulled onto the loud seat`);
    }
    e.removeStatus(loud, 'racket', 'test');
    const after = e.enemies.map(en => e.intentTargetFor(en));
    ok(after.every(t => t && t.side === 'player'), 'targets are still valid once Racket drops');
  });

  await atest('fallen: a seat at 0 Courage falls, and the fight continues', async () => {
    const e = await startDummyParty(new RNG(9), 2);
    const seen = [];
    e.on(EV.PLAYER_FALL, ev => seen.push(ev));
    const victim = e.players[0];
    e.loseHp(victim, 999, 'test');
    ok(victim.fallen, 'the seat is marked fallen');
    ok(!victim.alive, 'and is not alive');
    eq(seen.length, 1, 'exactly one player:fall event');
    eq(seen[0].seat, 0, 'the event names the seat');
    ok(!e.over, 'the fight is NOT over — a teammate is still up');
    eq(e.livingPlayers().length, 1, 'one seat can still act');
    eq(e.players.length, 2, 'the fallen seat keeps its place in the party');
    eq(victim.piles.hand.length, 0, 'a fallen seat is not left holding cards');
    ok(e.enemies.every(en => en.targetSeatId !== victim.id), 'no enemy is still marking the fallen seat');
  });

  await atest('fallen: the last seat falling ends the run', async () => {
    const e = await startDummyParty(new RNG(9), 2);
    e.loseHp(e.players[0], 999, 'test');
    ok(!e.over, 'still going after the first');
    e.loseHp(e.players[1], 999, 'test');
    ok(e.over, 'over once every seat has fallen');
    eq(e.victory, false, 'and it is a loss');
  });

  await atest('fallen: winning the fight brings everyone back at 1 Courage', async () => {
    const e = await startDummyParty(new RNG(13), 2);
    const revived = [];
    e.on(EV.PLAYER_REVIVE, ev => revived.push(ev));
    e.loseHp(e.players[0], 999, 'test');
    ok(e.players[0].fallen, 'seat 0 is down');
    for (const en of [...e.enemies]) e.loseHp(en, 9999, 'test');
    ok(e.over && e.victory, 'the team won');
    eq(e.players[0].hp, 1, 'the fallen seat is back at exactly 1 Courage');
    ok(e.players[0].alive, 'and is alive again');
    ok(!e.players[0].fallen, 'and no longer marked fallen');
    eq(revived.length, 1, 'one player:revive event');
  });

  await atest('party: state snapshot carries every seat and stays serialisable', async () => {
    const e = await startDummyParty(new RNG(17), 3);
    const st = e.state;
    eq(st.partySize, 3, 'snapshot reports the party size');
    eq(st.players.length, 3, 'snapshot carries every seat');
    eq(st.players[1].seat, 1, 'each seat snapshot knows its index');
    eq(st.players[1].piles.hand.length, 5, 'each seat snapshot carries its own hand');
    eq(st.player.seat, 0, 'the flat player field is seat 0 for the solo renderer');
    ok(st.piles.hand.length === st.players[0].piles.hand.length, 'flat piles agree with seat 0');
    let round = null;
    try { round = JSON.parse(JSON.stringify(st)); } catch (err) { /* fall through */ }
    ok(round !== null, 'the snapshot survives a JSON round trip');
    eq(round.players.length, 3, 'and still has every seat afterwards');
  });

  await atest('party: a preview clone copies every seat, not just seat 0', async () => {
    const e = await startDummyParty(new RNG(19), 2);
    const c = e.clone();
    eq(c.players.length, 2, 'the clone has both seats');
    ok(c.players[1].piles !== e.players[1].piles, 'seat 1 piles are copied, not shared');
    eq(c.players[1].piles.hand.length, e.players[1].piles.hand.length, 'seat 1 hand size matches');
    c.loseHp(c.players[1], 5, 'test');
    ok(e.players[1].hp !== c.players[1].hp, 'mutating the clone does not touch the real fight');
  });

  await atest('party: a card played by seat 1 comes out of seat 1', async () => {
    const e = await startDummyParty(new RNG(23), 2);
    const seat1 = e.players[1];
    const before0 = e.players[0].piles.hand.length;
    const card = seat1.piles.hand.find(c => c.id === SCRATCH.id) || seat1.piles.hand[0];
    ok(!!card, 'seat 1 is holding something');
    eq(e.card(card.uid), card, 'engine.card finds a card in a non-zero seat');
    const target = e.livingEnemies()[0];
    const hpBefore = target.hp;
    await e.playCard(card.uid, target.id);
    ok(target.hp < hpBefore || seat1.block > 0, 'the card actually did something');
    eq(e.players[0].piles.hand.length, before0, 'seat 0 hand is untouched');
    ok(!seat1.piles.hand.includes(card), 'the card left seat 1 hand');
  });

  const passed = results.reduce((n, t) => n + t.asserts.filter(a => a.pass).length, 0);
  const failed = results.reduce((n, t) => n + t.failed, 0);
  return { results, passed, failed };
}
