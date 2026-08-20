/**
 * Behavioural proof of the seam fixes. OWNER: this audit.
 *
 * CONTRACTS.md rule 9: "a test that mocks the thing it is testing proves
 * nothing". Nothing here is mocked. Every assertion runs the REAL CombatEngine
 * with the REAL Marmalade card definitions and the REAL Foyer enemy
 * definitions, and reads the result off engine state after a real play.
 *
 * Each block names the bug it would have caught.
 */

import { CombatEngine } from '../../game/src/combat/engine.js';
import { RNG } from '../../game/src/core/rng.js';
import { cardById } from '../../game/src/data/cards.js';
import { getEnemy } from '../../game/src/data/enemies/index.js';
import { loadContentRegistries } from '../../game/src/data/keywords.js';
import { resolveId, CUES, ALIASES } from '../../game/src/audio/sfx.js';
import { Pile } from '../../game/src/data/schema.js';

const results = [];
let current = null;

function test(name, fn) { current = { name, asserts: [], failed: 0, error: null }; results.push(current); try { fn(); } catch (e) { current.error = (e && e.stack) || String(e); current.failed++; } current = null; }
async function atest(name, fn) { current = { name, asserts: [], failed: 0, error: null }; results.push(current); try { await fn(); } catch (e) { current.error = (e && e.stack) || String(e); current.failed++; } current = null; }
function eq(actual, expected, label) {
  const pass = Object.is(actual, expected);
  current.asserts.push({ label: `${label} — expected ${expected}, got ${actual}`, pass });
  if (!pass) current.failed++;
  return pass;
}
function ok(cond, label) {
  current.asserts.push({ label, pass: !!cond });
  if (!cond) current.failed++;
  return !!cond;
}

/** A real engine with a hand-picked Marmalade deck and a real Foyer enemy. */
function mk({ cards = [], enemy = 'lost-luggage', hp = 40, maxHp = 70, seed = 11 } = {}) {
  const deck = cards.map(id => {
    const def = cardById(id);
    if (!def) throw new Error(`no such card: ${id}`);
    return def;
  });
  const e = new CombatEngine({
    rng: new RNG(seed),
    strictCtx: true,                       // the dev guard is ON for every proof
    player: { name: 'Kid', maxHp, hp: maxHp, energyMax: 99, drawPerTurn: deck.length, deck },
    enemies: [{ def: getEnemy(enemy), hp }],
  });
  e.startCombat();
  return e;
}

const handCard = (e, id) => e.piles.hand.find(c => c.id === id);

/**
 * Pin the enemy's next action. Lost Luggage opens on `pack-wrong`, which deals
 * no damage — a Haunt proof that just ends the turn and hopes proves nothing.
 * The move still resolves through the real enemy-turn path; only the plan slot
 * is chosen, exactly as Wink's queue manipulation does it.
 */
function forceMove(e, enemy, moveId) {
  enemy.plan[0] = moveId;
  enemy.planLocked = 1;
  e.refreshIntents('proof');
  if (!enemy.pendingMove || enemy.pendingMove.id !== moveId) {
    throw new Error(`could not pin ${moveId}: got ${enemy.pendingMove && enemy.pendingMove.id}`);
  }
}

async function play(e, id, target) {
  const card = handCard(e, id);
  if (!card) throw new Error(`${id} is not in hand: ${e.piles.hand.map(c => c.id).join(', ')}`);
  const r = e.playCard(card.uid, (target || e.enemies[0]).id);
  await r;
  return r;
}

export async function run() {
  await loadContentRegistries(null);

  // ═════════════════════════════════════════════════════════════════════════
  // BUG 1 — Haunt dealt no damage, ever.
  //   keywords.js called `ctx.loseHp?.(…)`; the hook payload had no `loseHp`,
  //   the optional chain swallowed it, `ctx.consume?.()` then succeeded, so
  //   Haunt visibly decayed and never bit.
  //   Playtester: enemy 6 HP / Haunt 2 / 4 Guard, player attacks, enemy attacks
  //   back for 2 — enemy HP stayed 6 and Haunt went 2 → 1.
  // ═════════════════════════════════════════════════════════════════════════
  await atest('Haunt: a Haunted enemy loses Courage when it acts', async () => {
    const e = mk({ cards: ['marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    const en = e.enemies[0];
    await play(e, 'marmalade/boo');
    eq(en.status('haunt'), 2, 'Boo! applied Haunt 2');

    forceMove(e, en, 'baggage-bash');        // 9 damage, a real Attack
    const hpBefore = en.hp;
    const playerBefore = e.player.hp;
    await e.endTurn();                       // the enemy acts → onAttack fires

    ok(e.player.hp < playerBefore, 'the enemy actually attacked (player lost Courage)');
    eq(en.hp, hpBefore - 2, 'the Haunted enemy lost 2 Courage from Haunt');
    eq(en.status('haunt'), 1, 'Haunt halved, rounded up: 2 → 1');
  });

  await atest('Haunt: ignores the enemy\'s own Guard and stacks up', async () => {
    const e = mk({ cards: ['marmalade/boo', 'marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    const en = e.enemies[0];
    await play(e, 'marmalade/boo');
    await play(e, 'marmalade/boo');
    eq(en.status('haunt'), 4, 'two Boo! = Haunt 4');
    forceMove(e, en, 'baggage-bash');
    en.block = 20;                            // Haunt is Courage loss, not an attack
    const hpBefore = en.hp;
    await e.endTurn();
    eq(en.hp, hpBefore - 4, 'Haunt 4 took 4 Courage straight through 20 Guard');
    eq(en.status('haunt'), 2, 'Haunt 4 → 2');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // BUG 2 — "Ignores Guard" did not ignore Guard.
  //   marmalade.js passed `{pierceBlock:true}`; damage.js reads
  //   `o.pierce || o.ignoreBlock`. Playtester: Through the Wall (9, "Ignores
  //   Guard") into a 5-Guard Lost Luggage dealt exactly 4.
  // ═════════════════════════════════════════════════════════════════════════
  await atest('Ignores Guard: Through the Wall bypasses Guard entirely', async () => {
    const e = mk({ cards: ['marmalade/through-the-wall'], enemy: 'lost-luggage', hp: 40 });
    const en = e.enemies[0];
    en.block = 5;
    const hpBefore = en.hp;
    await play(e, 'marmalade/through-the-wall');
    eq(en.hp, hpBefore - 9, 'all 9 damage reached Courage (was 4 before the fix)');
    eq(en.block, 5, 'Guard was not consumed');
  });

  await atest('Ignores Guard: Across the Veil pierces on every hit', async () => {
    const e = mk({ cards: ['marmalade/across-the-veil'], enemy: 'lost-luggage', hp: 60 });
    const en = e.enemies[0];
    e.applyStatus(e.player, 'ghoststep', 2);
    en.block = 30;
    const hpBefore = en.hp;
    await play(e, 'marmalade/across-the-veil');
    eq(en.hp, hpBefore - 22, '2 Ghoststep spent = 2 x 11 through 30 Guard');
    eq(en.block, 30, 'Guard untouched');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // The rest of the class, found by tests/seams/check.py and the dev ctx guard.
  // ═════════════════════════════════════════════════════════════════════════

  await atest('Ghoststep prevents a whole enemy hit (was `ctx.fromAttack`, undefined)', async () => {
    const e = mk({ cards: ['marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    forceMove(e, e.enemies[0], 'baggage-bash');
    e.applyStatus(e.player, 'ghoststep', 1);
    const before = e.player.hp;
    await e.endTurn();
    eq(e.player.hp, before, 'the hit was prevented outright');
    eq(e.player.status('ghoststep'), 0, 'one stack was spent');
  });

  test('Ghoststep is not consumed by drawing an intent preview', () => {
    const e = mk({ cards: ['marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    e.applyStatus(e.player, 'ghoststep', 3);
    for (let i = 0; i < 10; i++) e.refreshIntents('proof');
    eq(e.player.status('ghoststep'), 3, 'ten intent re-renders spent nothing');
  });

  await atest('Empowered adds damage (was `ctx.isAttack`, undefined)', async () => {
    const e = mk({ cards: ['marmalade/scratch'], enemy: 'lost-luggage', hp: 40 });
    const en = e.enemies[0];
    const card = handCard(e, 'marmalade/scratch');
    const base = card.nums.d;
    e.applyStatus(e.player, 'empowered', 4);
    const hpBefore = en.hp;
    await play(e, 'marmalade/scratch');
    eq(hpBefore - en.hp, base + 4, 'Empowered 4 added 4 damage');
    eq(e.player.status('empowered'), 0, 'and was consumed by the Attack');
  });

  await atest('Nope. actually refuses a debuff (onDebuffIncoming needed prevent())', async () => {
    const e = mk({ cards: ['marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    e.applyStatus(e.player, 'nope', 1);
    e.applyStatus(e.player, 'weak', 3, { sourceId: 'proof' });
    eq(e.player.status('weak'), 0, 'the debuff was refused');
    eq(e.player.status('nope'), 0, 'one Nope. was spent');
  });

  await atest('Not Dead Yet survives lethal by spending Lives', async () => {
    const e = mk({ cards: ['marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    e.defineCounter({ id: 'lives', name: 'Lives', min: 0, max: 9, start: 9 });
    e.applyStatus(e.player, 'not-dead-yet', 1);
    e.player.hp = 4;
    e.dealDamage({ attacker: e.enemies[0], defender: e.player, amount: 50, kind: 'attack' });
    eq(e.player.hp, 1, 'survived at 1 Courage');
    eq(e.counter('lives'), 6, 'three Lives were spent');
  });

  await atest('Tripwire Tail Haunts the enemy that attacks you', async () => {
    const e = mk({ cards: ['marmalade/tripwire-tail'], enemy: 'lost-luggage', hp: 40 });
    const en = e.enemies[0];
    await play(e, 'marmalade/tripwire-tail');
    ok(e.player.status('tripwire-tail') > 0, 'the trap is armed');
    forceMove(e, en, 'baggage-bash');
    await e.endTurn();
    ok(en.status('haunt') > 0, 'the attacker picked up Haunt');
  });

  await atest('"next Trick costs less" statuses actually discount', async () => {
    const e = mk({ cards: ['marmalade/scratch', 'marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    const jab = handCard(e, 'marmalade/scratch');
    const full = e.costOf(jab);
    e.applyStatus(e.player, 'next-attack-discount', 1);
    eq(e.costOf(jab), Math.max(0, full - 1), 'Opening took 1 Nerve off the Attack');
    const boo = handCard(e, 'marmalade/boo');
    eq(e.costOf(boo), e.costOf(boo), 'and a Skill is unaffected');
    ok(e.costOf(boo) === boo.rawCost(), 'Opening does not discount Skills');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // BUG 3 — eight scenes called audio with `domain/name` and were silent.
  // ═════════════════════════════════════════════════════════════════════════
  test('every sfx id the scenes ask for resolves to a real cue', () => {
    const ids = [
      'ui:confirm', 'ui:back', 'ui:hover', 'ui:deny', 'ui:click',
      'ui:begin', 'ui:denied', 'ui:tick', 'ui:snuff', 'card:pick', 'map:step',
      'card:draw', 'card:pickUp', 'combat:hit-light',
    ];
    for (const id of ids) ok(!!resolveId(id) && !!CUES[resolveId(id)], `${id} → ${resolveId(id)}`);
  });

  test('the `domain/name` spelling still resolves rather than warning', () => {
    for (const id of ['ui/confirm', 'card/pick', 'map/step', 'ui/begin', 'ui/snuff', 'ui/tick', 'ui/denied']) {
      ok(!!resolveId(id), `${id} → ${resolveId(id)}`);
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // The runtime guard itself.
  // ═════════════════════════════════════════════════════════════════════════
  test('the dev ctx guard throws on an undefined ctx member', () => {
    const e = mk({ cards: ['marmalade/boo'], enemy: 'lost-luggage', hp: 40 });
    const ctx = e.ctxFor(null, null, 0);
    let threw = false;
    try { void ctx.thisHelperDoesNotExist; } catch { threw = true; }
    ok(threw, 'reading an unknown ctx member throws');
    let threw2 = false;
    try { ctx.alsoNotAThing?.(1); } catch { threw2 = true; }
    ok(threw2, '`ctx.missing?.()` throws instead of silently no-opping');
    ok(ctx.removeDebuff === undefined, 'sanctioned feature-detect names still return undefined');
    ok(typeof ctx.damage === 'function', 'real members still work');
  });

  test('the guard is off unless dev mode asks for it', () => {
    const e = new CombatEngine({ rng: new RNG(1), strictCtx: false, _bare: true });
    ok(e.strictCtx === false, 'strictCtx false');
    const o = {};
    ok(e._guardCtx(o) === o, 'the wrapper is the identity function — zero cost');
  });

  const failed = results.reduce((n, r) => n + r.failed, 0);
  const passed = results.reduce((n, r) => n + r.asserts.filter(a => a.pass).length, 0);
  return { results, passed, failed };
}
