/**
 * Combat engine assertion suite. OWNER: combat-engine.
 * Runs headless in the browser — no framework, no build step.
 */

import { CombatEngine } from '../../game/src/combat/engine.js';
import { RNG } from '../../game/src/core/rng.js';
import { Card, _resetUid } from '../../game/src/combat/piles.js';
import { computeDamage } from '../../game/src/combat/damage.js';
import { getStatus, registerStatus, UNIVERSAL_STATUSES, STATUS_ORDER } from '../../game/src/combat/statuses.js';
import { getKeyword, allKeywords, renderCardText, registerKeywords } from '../../game/src/data/keywords.js';
import { intentFamily, buildIntent } from '../../game/src/combat/intents.js';
import { previewIncoming } from '../../game/src/combat/preview.js';
import { makeDummyCombat, makeDummyDeck, SCRATCH, CURL_UP, BOO, FLURRY, RATTLE, SECOND_WIND, BRACE, DUST_BUNNY, COATRACK } from '../../game/src/combat/dummy.js';
import { CardType, Rarity, Target, Intent, Pile } from '../../game/src/data/schema.js';

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
function deepEq(a, b, label) {
  const pass = JSON.stringify(a) === JSON.stringify(b);
  current.asserts.push({ label, pass });
  if (!pass) current.failed++;
  return pass;
}
const fmt = (v) => typeof v === 'object' ? JSON.stringify(v) : String(v);

// ── fixtures ────────────────────────────────────────────────────────────────

/** A punching bag with one predictable move. */
function dummyEnemy(o = {}) {
  return {
    id: o.id || 'test/bag', name: o.name || 'Bag', region: 'test', tier: 'normal',
    hp: [o.hp ?? 40, o.hp ?? 40],
    moves: {
      hit: {
        id: 'hit', name: 'Hit', intent: Intent.ATTACK,
        damage: o.damage ?? 8, hits: o.hits ?? 1,
        effect: (c) => c.damageMulti(o.damage ?? 8, o.hits ?? 1),
      },
      guard: { id: 'guard', name: 'Guard', intent: Intent.DEFEND, block: 5, effect: (c) => c.block(5) },
      nothing: { id: 'nothing', name: 'Doze', intent: Intent.SLEEP, effect: () => {} },
    },
    nextMove: () => o.move || 'hit',
  };
}

function mk(o = {}) {
  _resetUid(0);
  return new CombatEngine({
    rng: new RNG(o.seed ?? 7),
    player: {
      name: 'Test', maxHp: o.maxHp ?? 60, hp: o.hp ?? 60,
      energyMax: o.energyMax ?? 3, drawPerTurn: o.drawPerTurn ?? 5,
      deck: o.deck || makeDummyDeck(),
    },
    enemies: o.enemies || [dummyEnemy()],
    relics: o.relics || [],
  });
}

const cardOf = (e, id) => e.piles.hand.find(c => c.id === id) || e.piles.draw.find(c => c.id === id);
/** Force a specific card into hand so tests never depend on the shuffle. */
function plant(e, def, upgraded = false) {
  const c = new Card(def, { upgraded });
  e.piles._push(c, Pile.HAND, 'bottom');
  return c;
}

// ── the tests ───────────────────────────────────────────────────────────────

export async function run() {
  results.length = 0;

  // 1 ─ determinism ---------------------------------------------------------
  await atest('determinism: same seed + same inputs → identical event stream', async () => {
    const digest = async (seed) => {
      _resetUid(0);
      const e = new CombatEngine({
        rng: new RNG(seed),
        player: { name: 'D', maxHp: 70, deck: makeDummyDeck() },
        enemies: [DUST_BUNNY, COATRACK],
      });
      const evs = [];
      e.on('*', (ev) => evs.push(`${ev.type}:${ev.cardUid || ev.actorId || ev.targetId || ev.enemyId || ''}:${ev.amount ?? ev.after ?? ''}`));
      await e.startCombat();
      for (let t = 0; t < 5 && !e.over; t++) {
        let guard = 0;
        while (!e.over && guard++ < 12) {
          const playable = e.piles.hand.find(c => e.canPlay(c.uid, e.firstLivingEnemy()?.id).ok);
          if (!playable) break;
          await e.playCard(playable.uid, e.firstLivingEnemy()?.id ?? null);
        }
        if (!e.over) await e.endTurn();
      }
      return { evs, state: JSON.stringify(e.state) };
    };
    const a = await digest(1234);
    const b = await digest(1234);
    const c = await digest(9999);
    eq(a.evs.length === b.evs.length, true, 'same event count');
    deepEq(a.evs, b.evs, 'identical event streams for the same seed');
    eq(a.state, b.state, 'identical final state for the same seed');
    ok(a.evs.join('|') !== c.evs.join('|'), 'a different seed produces a different fight');
    ok(a.evs.length > 40, `event stream is substantial (${a.evs.length} events)`);
  });

  await atest('determinism: rng.fork is stable and no engine call uses Math.random', async () => {
    const r1 = new RNG(5).fork('x');
    const r2 = new RNG(5).fork('x');
    eq(r1.next(), r2.next(), 'forked RNGs agree');
    const files = [
      'engine.js', 'damage.js', 'piles.js', 'preview.js', 'intents.js',
      'statuses.js', 'hooks.js', 'actor.js', 'events.js', 'dummy.js',
    ];
    let hits = 0;
    for (const f of files) {
      const src = await (await fetch(`/game/src/combat/${f}`, { cache: 'no-store' })).text();
      if (/Math\.random\s*\(/.test(src)) hits++;   // a call, not the word in a comment
    }
    eq(hits, 0, 'no Math.random anywhere in src/combat');
    const kw = await (await fetch('/game/src/data/keywords.js', { cache: 'no-store' })).text();
    ok(!/Math\.random\s*\(/.test(kw), 'no Math.random in data/keywords.js');
  });

  // 2 ─ damage pipeline -----------------------------------------------------
  await atest('damage pipeline: order is base → Strength → Weak → Vulnerable → hooks → block', async () => {
    const e = mk();
    await e.startCombat();
    const en = e.enemies[0];

    let t = computeDamage(e, { attacker: e.player, defender: en, amount: 6 });
    eq(t.final, 6, 'unmodified 6 stays 6');

    e.applyStatus(e.player, 'strength', 3);
    t = computeDamage(e, { attacker: e.player, defender: en, amount: 6 });
    eq(t.final, 9, 'Strength 3 is additive: 6 + 3');

    e.applyStatus(e.player, 'weak', 1);
    t = computeDamage(e, { attacker: e.player, defender: en, amount: 6 });
    eq(t.final, 6, 'Weak applies AFTER Strength: floor((6+3)*0.75) = 6');

    e.applyStatus(en, 'vulnerable', 1);
    t = computeDamage(e, { attacker: e.player, defender: en, amount: 6 });
    eq(t.final, 9, 'Vulnerable applies AFTER Weak: floor(6*1.5) = 9');

    // If the order were Vulnerable-before-Weak we would get floor(13*0.75)=9 too,
    // so use an asymmetric case that separates them.
    e.removeStatus(e.player, 'strength');
    e.applyStatus(e.player, 'strength', 1);
    t = computeDamage(e, { attacker: e.player, defender: en, amount: 5 });
    eq(t.final, 6, 'floor(floor((5+1)*0.75)*1.5) = 6 (Weak first), not 7');

    e.applyStatus(en, 'faint', 1);
    t = computeDamage(e, { attacker: e.player, defender: en, amount: 5 });
    eq(t.final, 1, 'Faint clamps everything to 1 in the hook step');
    e.removeStatus(en, 'faint');

    t = computeDamage(e, { attacker: e.player, defender: en, amount: 5, skipModifiers: true });
    eq(t.final, 5, 'skipModifiers bypasses the whole modifier chain');
  });

  await atest('damage pipeline: block absorption, break, and overkill', async () => {
    const e = mk();
    await e.startCombat();
    const en = e.enemies[0];
    en.block = 4;
    const hp0 = en.hp;
    const events = [];
    e.on('*', ev => events.push(ev));
    e.dealDamage({ attacker: e.player, defender: en, amount: 10 });
    eq(en.block, 0, 'Guard absorbed first and is spent');
    eq(en.hp, hp0 - 6, 'only the remainder hits Courage');
    ok(events.some(x => x.type === 'block:break'), 'block:break emitted when Guard shatters');
    const dmg = events.find(x => x.type === 'damage');
    eq(dmg.blocked, 4, 'damage event reports how much was blocked');
    eq(dmg.hpLoss, 6, 'damage event reports Courage lost');
    eq(dmg.hpBefore, hp0, 'damage event carries hpBefore for tweening');
    eq(dmg.hpAfter, hp0 - 6, 'damage event carries hpAfter');

    en.block = 20;
    e.dealDamage({ attacker: e.player, defender: en, amount: 5 });
    eq(en.block, 15, 'partial absorption leaves the rest of the Guard');
    eq(en.hp, hp0 - 6, 'no Courage lost through a big Guard');

    e.dealDamage({ attacker: e.player, defender: en, amount: 5, pierce: true });
    eq(en.block, 15, 'pierce ignores Guard entirely');
    eq(en.hp, hp0 - 11, 'pierce damage lands on Courage');
  });

  await atest('damage pipeline: multi-hit × Vulnerable rounds per hit, not once', async () => {
    const e = mk({ enemies: [dummyEnemy({ hp: 80 })] });
    await e.startCombat();
    const en = e.enemies[0];
    const card = plant(e, FLURRY);              // 3 damage × 3
    e.player.energy = 3;
    const before = en.hp;
    await e.playCard(card.uid, en.id);
    eq(before - en.hp, 9, 'no Vulnerable: 3+3+3 = 9');

    e.applyStatus(en, 'vulnerable', 3);
    const card2 = plant(e, FLURRY);
    e.player.energy = 3;
    const before2 = en.hp;
    await e.playCard(card2.uid, en.id);
    eq(before2 - en.hp, 12, 'Vulnerable rounds every hit: floor(3*1.5)=4, ×3 = 12');
  });

  await atest('Guard pipeline: Dexterity is additive, Frail multiplies after it', async () => {
    const e = mk();
    await e.startCombat();
    eq(e.previewBlockValue(e.player, 5), 5, 'plain 5 Guard');
    e.applyStatus(e.player, 'dexterity', 2);
    eq(e.previewBlockValue(e.player, 5), 7, 'Dexterity 2 adds');
    e.applyStatus(e.player, 'frail', 1);
    eq(e.previewBlockValue(e.player, 5), 5, 'Frail applies after Dexterity: floor(7*0.75) = 5');
    const before = e.player.block;
    const gained = e.gainBlock(e.player, 5);
    eq(gained, 5, 'gainBlock returns the modified amount');
    eq(e.player.block, before + 5, 'Guard actually changed by the modified amount');
  });

  // 3 ─ statuses ------------------------------------------------------------
  await atest('status decay: turnEnd statuses tick at the END of their owner\'s turn', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    const en = e.enemies[0];
    e.applyStatus(e.player, 'weak', 2);
    e.applyStatus(en, 'vulnerable', 2);
    eq(e.player.status('weak'), 2, 'Weak applied to the player');
    await e.endTurn();
    eq(e.player.status('weak'), 1, 'player Weak decays at the end of the player turn');
    eq(en.status('vulnerable'), 1, 'enemy Vulnerable survives the player turn and decays at the enemy turn end');
    await e.endTurn();
    eq(e.player.status('weak'), 0, 'Weak is gone after two turns');
    eq(en.status('vulnerable'), 0, 'Vulnerable is gone after two enemy turns');
  });

  await atest('status: Dread ticks at turn start and loses a stack; Strength never decays', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    e.applyStatus(e.player, 'dread', 3);
    e.applyStatus(e.player, 'strength', 2);
    e.player.block = 50;
    const hp0 = e.player.hp;
    await e.endTurn();
    eq(e.player.hp, hp0 - 3, 'Dread ignores Guard entirely');
    eq(e.player.status('dread'), 2, 'Dread loses exactly one stack per tick');
    eq(e.player.status('strength'), 2, 'Strength does not decay');
  });

  await atest('status: Charm eats one debuff per stack and nothing else', async () => {
    const e = mk();
    await e.startCombat();
    e.applyStatus(e.player, 'charm', 1);
    e.applyStatus(e.player, 'weak', 2);
    eq(e.player.status('weak'), 0, 'Charm blocked the debuff');
    eq(e.player.status('charm'), 0, 'Charm was consumed');
    e.applyStatus(e.player, 'weak', 2);
    eq(e.player.status('weak'), 2, 'the next debuff lands normally');
    e.applyStatus(e.player, 'charm', 1);
    e.applyStatus(e.player, 'strength', 1);
    eq(e.player.status('charm'), 1, 'Charm ignores buffs');
  });

  await atest('status: Regen heals at end of turn, Bristle retaliates, Entangle blocks Attacks', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    e.player.hp = 30;
    e.applyStatus(e.player, 'regen', 3);
    await e.endTurn();
    eq(e.player.hp, 33, 'Regen healed for its stack count');
    eq(e.player.status('regen'), 2, 'Regen then decayed by 1');

    const e2 = mk({ enemies: [dummyEnemy({ damage: 5 })] });
    await e2.startCombat();
    e2.applyStatus(e2.player, 'bristle', 4);
    const enHp = e2.enemies[0].hp;
    await e2.endTurn();
    eq(e2.enemies[0].hp, enHp - 4, 'Bristle hit the attacker back for its stacks');

    const e3 = mk();
    await e3.startCombat();
    const atk = plant(e3, SCRATCH);
    const skl = plant(e3, CURL_UP);
    e3.applyStatus(e3.player, 'entangle', 1);
    eq(e3.canPlay(atk.uid, e3.enemies[0].id).ok, false, 'Entangle forbids Attacks');
    eq(e3.canPlay(skl.uid, null).ok, true, 'Entangle still allows Skills');
  });

  test('status registry: all thirteen universal statuses exist with the right shape', () => {
    const want = ['strength', 'dexterity', 'weak', 'vulnerable', 'frail', 'dread',
      'charm', 'regen', 'bristle', 'faint', 'confusion', 'entangle', 'focus'];
    for (const id of want) {
      const d = getStatus(id);
      ok(d && !d._missing && d.name && d.desc && d.kind, `status "${id}" is registered (${d?.name})`);
    }
    eq(Object.keys(UNIVERSAL_STATUSES).length, 13, 'exactly thirteen universal statuses');
    eq(STATUS_ORDER.length, 13, 'display order covers all of them');
    ok(getStatus('nope-not-real')._missing, 'unknown status ids degrade instead of throwing');
    registerStatus({ id: 'test/ghoststep', name: 'Ghoststep', kind: 'buff', desc: 'x' });
    eq(getStatus('test/ghoststep').name, 'Ghoststep', 'content agents can register their own statuses');
  });

  await atest('hooks: a content-registered status can veto a whole hit (Ghoststep shape)', async () => {
    registerStatus({
      id: 'test/ghoststep', name: 'Ghoststep', kind: 'buff', decay: 'never', desc: 'Prevents the next hit.',
      hooks: {
        modifyDamageTaken: (amt, h) => (h.kind === 'attack' && h.stacks > 0) ? 0 : amt,
        onDamaged: (h) => { if (h.kind === 'attack') h.e.applyStatus(h.owner, 'test/ghoststep', -1, { reason: 'consumed' }); },
      },
    });
    const e = mk({ enemies: [dummyEnemy({ damage: 30, hits: 2 })] });
    await e.startCombat();
    e.applyStatus(e.player, 'test/ghoststep', 1);
    const hp0 = e.player.hp;
    await e.endTurn();
    eq(e.player.hp, hp0 - 30, 'one Ghoststep ate one 30-damage hit and the second landed');
    eq(e.player.status('test/ghoststep'), 0, 'the stack was consumed');
  });

  // 4 ─ preview -------------------------------------------------------------
  await atest('preview: matches actual resolution exactly (simple attack)', async () => {
    const e = mk();
    await e.startCombat();
    const en = e.enemies[0];
    e.applyStatus(e.player, 'strength', 2);
    e.applyStatus(en, 'vulnerable', 2);
    const card = plant(e, SCRATCH);
    e.player.energy = 3;

    const p = e.preview(card.uid, en.id);
    const hpBefore = en.hp;
    await e.playCard(card.uid, en.id);
    const actual = hpBefore - en.hp;
    eq(p.ok, true, 'preview is ok');
    eq(p.damage, actual, `preview damage matched resolution (${p.damage})`);
    eq(p.targets[0].hpAfter, en.hp, 'preview predicted the exact hp after');
    eq(p.killsTarget, false, 'preview correctly says it does not kill');
    eq(p.cost, 1, 'preview reports the cost paid');
  });

  await atest('preview: matches actual for multi-hit, AoE, block, statuses and draw', async () => {
    const e = mk({ enemies: [dummyEnemy({ hp: 30, id: 'test/a' }), dummyEnemy({ hp: 12, id: 'test/b' })] });
    await e.startCombat();
    const [a, b] = e.enemies;
    e.applyStatus(a, 'vulnerable', 2);
    e.player.energy = 3;

    const rattle = plant(e, RATTLE);
    const pv = e.preview(rattle.uid, null);
    const before = e.enemies.map(x => x.hp);
    await e.playCard(rattle.uid, null);
    eq(pv.targets.length, 2, 'AoE preview lists both targets');
    eq(pv.targets[0].damage, before[0] - a.hp, 'AoE preview matched target 1');
    eq(pv.targets[1].damage, before[1] - Math.max(0, b.hp), 'AoE preview matched target 2');
    eq(pv.killsAny, !b.alive, 'preview predicted the kill correctly');

    const e2 = mk();
    await e2.startCombat();
    e2.applyStatus(e2.player, 'dexterity', 3);
    const curl = plant(e2, CURL_UP);
    e2.player.energy = 3;
    const pv2 = e2.preview(curl.uid, null);
    const blk = e2.player.block;
    await e2.playCard(curl.uid, null);
    eq(pv2.block, e2.player.block - blk, 'Guard preview matched, Dexterity included');
    eq(pv2.block, 8, 'preview reports post-Dexterity Guard (5 + 3)');

    const e3 = mk();
    await e3.startCombat();
    const boo = plant(e3, BOO);
    e3.player.energy = 3;
    const pv3 = e3.preview(boo.uid, e3.enemies[0].id);
    eq(pv3.statuses.length, 2, 'preview lists both statuses the card applies');
    ok(pv3.statuses.every(s => s.actorId === e3.enemies[0].id), 'preview says who gets them');
    await e3.playCard(boo.uid, e3.enemies[0].id);
    eq(e3.enemies[0].status('weak'), 1, 'the status actually landed as previewed');

    const e4 = mk();
    await e4.startCombat();
    const sw = plant(e4, SECOND_WIND);
    const pv4 = e4.preview(sw.uid, null);
    eq(pv4.draw, 2, 'preview counts cards drawn');
    eq(pv4.exhaust, 1, 'preview knows the card Vanishes');
  });

  await atest('preview: is side-effect free — no rng, hp, pile or event leakage', async () => {
    const e = mk();
    await e.startCombat();
    const en = e.enemies[0];
    const card = plant(e, FLURRY);
    e.player.energy = 3;

    const rngBefore = JSON.stringify(e.rng.snapshot());
    const stateBefore = JSON.stringify(e.state);
    const seqBefore = e._seq;
    let leaked = 0;
    e.on('*', () => leaked++);

    const p1 = e.preview(card.uid, en.id);
    const p2 = e.preview(card.uid, en.id);

    eq(JSON.stringify(e.rng.snapshot()), rngBefore, 'RNG was not advanced by previewing');
    eq(JSON.stringify(e.state), stateBefore, 'engine state is byte-identical after previewing');
    eq(e._seq, seqBefore, 'no events were emitted into the real engine');
    eq(leaked, 0, 'no listener heard a preview event');
    eq(p1.damage, p2.damage, 'previewing twice gives the same answer');
  });

  await atest('preview: reports a kill, and reports why an unplayable card is unplayable', async () => {
    const e = mk({ enemies: [dummyEnemy({ hp: 40 })] });
    await e.startCombat();
    const en = e.enemies[0];
    en.hp = 5;
    const card = plant(e, SCRATCH);
    e.player.energy = 3;
    const p = e.preview(card.uid, en.id);
    eq(p.killsTarget, true, 'preview says this kills');
    eq(p.killsAll, true, 'preview says this ends the fight');
    await e.playCard(card.uid, en.id);
    eq(en.alive, false, 'and it did');

    const e2 = mk();
    await e2.startCombat();
    const c2 = plant(e2, RATTLE);      // costs 2
    e2.player.energy = 0;
    const p2 = e2.preview(c2.uid, e2.enemies[0].id);
    eq(p2.ok, false, 'preview refuses an unaffordable card');
    ok(/Nerve/.test(p2.reason), `and says why: "${p2.reason}"`);
    const p3 = e2.preview(c2.uid, e2.enemies[0].id, { assumeAffordable: true });
    eq(p3.ok, true, 'assumeAffordable previews it anyway for the card face');
    ok(p3.damage > 0, 'and still computes real damage');
  });

  // 5 ─ piles ---------------------------------------------------------------
  await atest('piles: reshuffle on empty, card conservation, hand cap, innate/ethereal/retain', async () => {
    const e = mk({ drawPerTurn: 5 });
    await e.startCombat();
    const total = () => e.piles.all().length;
    const t0 = total();
    eq(t0, 10, 'the starter deck is 10 Tricks');
    eq(e.piles.hand.length, 5, 'opening hand is 5');

    let shuffles = 0;
    e.on('shuffle', () => shuffles++);
    e.drawCards(4);
    eq(e.piles.draw.length, 1, 'draw pile drained to 1');
    e.discardCard(e.piles.hand[0]);
    e.drawCards(3);
    ok(shuffles >= 1, 'the discard pile was reshuffled when the draw pile ran dry');
    eq(total(), t0, 'no Trick was created or destroyed by shuffling');

    const e2 = mk();
    await e2.startCombat();
    for (let i = 0; i < 20; i++) e2.addCard(SCRATCH, Pile.HAND);
    eq(e2.piles.hand.length, 10, 'hand is capped at 10');
    let bounced = 0;
    e2.on('hand:full', () => bounced++);
    e2.drawCards(3);
    ok(bounced > 0, 'drawing into a full hand emits hand:full');

    const e3 = mk({ deck: [SCRATCH, SCRATCH, SCRATCH, SCRATCH, SCRATCH, SCRATCH, { ...CURL_UP, id: 'x/innate', innate: true }] });
    await e3.startCombat();
    ok(e3.piles.hand.some(c => c.id === 'x/innate'), 'Innate Tricks start in the opening hand');

    const e4 = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e4.startCombat();
    const eth = plant(e4, { ...CURL_UP, id: 'x/eth', ethereal: true });
    const ret = plant(e4, { ...CURL_UP, id: 'x/ret', retain: true });
    await e4.endTurn();
    eq(e4.piles.exhaust.some(c => c.uid === eth.uid), true, 'Ethereal Tricks Vanish at end of turn');
    eq(e4.piles.hand.some(c => c.uid === ret.uid), true, 'Retain Tricks stay in hand');
  });

  await atest('piles: positional insertion, Stash capacity, and metadata surviving a shuffle', async () => {
    const e = mk();
    await e.startCombat();
    const top = e.addCard(SCRATCH, Pile.DRAW, { position: 'top' });
    eq(e.piles.draw[0].uid, top.uid, 'a card can be put on top of the draw pile');
    const bot = e.addCard(SCRATCH, Pile.DRAW, { position: 'bottom' });
    eq(e.piles.draw[e.piles.draw.length - 1].uid, bot.uid, 'and on the bottom');

    const a = plant(e, SCRATCH), b = plant(e, SCRATCH), c = plant(e, SCRATCH), d = plant(e, SCRATCH);
    eq(e.moveCard(a, Pile.STASH), true, 'Stash accepts the first Trick');
    e.moveCard(b, Pile.STASH); e.moveCard(c, Pile.STASH);
    eq(e.piles.stash.length, 3, 'Stash holds three');
    eq(e.moveCard(d, Pile.STASH), false, 'Stash refuses a fourth');

    const meta = plant(e, SCRATCH);
    e.setCardMeta(meta, 'stretch', 2);
    e.piles.move(meta, Pile.DISCARD);
    e.piles.reshuffle('test');
    const found = e.piles.find(meta.uid);
    eq(found.meta.stretch, 2, 'per-card metadata survives a move and a shuffle');
  });

  await atest('cost mutation: turn-scoped, combat-scoped, and dynamic costs', async () => {
    const e = mk();
    await e.startCombat();
    const c = plant(e, RATTLE);     // base cost 2
    eq(e.costOf(c), 2, 'base cost');
    e.modifyCardCost(c, -1, 'turn');
    eq(e.costOf(c), 1, 'turn-scoped reduction applies');
    e.setCardCost(c, 0, 'turn');
    eq(e.costOf(c), 0, 'turn-scoped override applies');
    await e.endTurn();
    eq(e.costOf(c), 2, 'turn-scoped changes expire at the start of your next turn');
    e.setCardCost(c, 0, 'combat');
    await e.endTurn();
    eq(e.costOf(c), 0, 'combat-scoped changes survive the turn boundary');

    const dyn = plant(e, {
      ...SCRATCH, id: 'x/dyn',
      dynamicCost: (ctx) => ctx.e.stats.cardsPlayedThisTurn >= 2 ? 0 : 2,
    });
    eq(e.costOf(dyn), 2, 'dynamicCost starts at 2');
    e.stats.cardsPlayedThisTurn = 3;
    eq(e.costOf(dyn), 0, 'dynamicCost re-evaluates live');
  });

  // 6 ─ turn flow, death, combat end ----------------------------------------
  await atest('turn flow: start-of-turn order is Guard wipe → statuses → timers → draw → energy → intents', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    const seen = [];
    e.on('*', ev => { if (['turn:start', 'block:lose', 'draw', 'energy', 'intent'].includes(ev.type)) seen.push(ev.type); });
    await e.startCombat();
    e.player.block = 12;
    await e.endTurn();
    const i = (t) => seen.lastIndexOf(t);
    ok(i('turn:start') < i('draw'), 'turn:start precedes the draw');
    ok(i('block:lose') < i('draw'), 'Guard is wiped before the draw');
    ok(i('draw') < i('energy'), 'the draw happens before the Nerve refill');
    eq(e.player.block, 0, 'Guard did not carry over');
    eq(e.player.energy, 3, 'Nerve refilled to max');
    eq(e.piles.hand.length, 5, 'a fresh hand was drawn');
    eq(e.turn, 2, 'we are on turn 2');
  });

  await atest('turn flow: end of turn discards the hand, then enemies act in slot order', async () => {
    const order = [];
    const e = mk({
      enemies: [
        { ...dummyEnemy({ id: 'test/one', damage: 1 }), name: 'One' },
        { ...dummyEnemy({ id: 'test/two', damage: 1 }), name: 'Two' },
      ],
    });
    await e.startCombat();
    e.on('turn:start', ev => { if (ev.side === 'enemy') order.push(ev.actorId); });
    const handSize = e.piles.hand.length;
    await e.endTurn();
    deepEq(order, [e.enemies[0].id, e.enemies[1].id], 'enemies acted in slot order');
    ok(handSize > 0, 'there was a hand to discard');
    eq(e.piles.hand.length, 5, 'the old hand was discarded and a new one drawn');
  });

  await atest('death: dying enemies stop acting, emit death once, and end the fight', async () => {
    const e = mk({ enemies: [dummyEnemy({ hp: 40, id: 'test/a' }), dummyEnemy({ hp: 40, id: 'test/b' })] });
    await e.startCombat();
    let deaths = 0;
    e.on('death', () => deaths++);
    const a = e.enemies[0];
    a.hp = 3;
    e.dealDamage({ attacker: e.player, defender: a, amount: 50 });
    eq(a.alive, false, 'the enemy is dead');
    eq(a.hp, 0, 'Courage floors at 0, never negative');
    eq(deaths, 1, 'exactly one death event');
    e.dealDamage({ attacker: e.player, defender: a, amount: 50 });
    eq(deaths, 1, 'hitting a corpse does nothing');
    eq(e.livingEnemies().length, 1, 'one enemy left');
    eq(e.over, false, 'the fight is not over yet');
    e.dealDamage({ attacker: e.player, defender: e.enemies[1], amount: 999 });
    eq(e.over, true, 'the fight ends when the last enemy dies');
    eq(e.victory, true, 'and it is a victory');

    const e2 = mk({ enemies: [dummyEnemy({ damage: 400 })] });
    await e2.startCombat();
    await e2.endTurn();
    eq(e2.player.alive, false, 'the player can lose');
    eq(e2.over && e2.victory === false, true, 'a player death ends the fight as a loss');
  });

  // 7 ─ intents -------------------------------------------------------------
  await atest('intents: damage shown is post-modifier and updates the instant anything changes', async () => {
    const e = mk({ enemies: [dummyEnemy({ damage: 10 })] });
    await e.startCombat();
    const en = e.enemies[0];
    eq(en.intent.damage, 10, 'plain intent shows the printed damage');
    eq(en.intent.family, 'attack', 'attack intents report the Attack family');

    let emitted = 0;
    e.on('intent', () => emitted++);
    e.applyStatus(en, 'strength', 3);
    eq(en.intent.damage, 13, 'enemy Strength raises the displayed intent immediately');
    ok(emitted >= 1, 'an intent event was emitted for the renderer');

    const before = emitted;
    e.applyStatus(e.player, 'vulnerable', 2);
    eq(en.intent.damage, 19, 'player Vulnerable raises it again: floor(13*1.5) = 19');
    ok(emitted > before, 'a second intent event fired');

    e.applyStatus(en, 'weak', 1);
    eq(en.intent.damage, 13, 'enemy Weak lowers it: floor(floor(13*0.75)*1.5) = 13');

    const before2 = emitted;
    e.applyStatus(e.player, 'dexterity', 1);
    eq(emitted, before2, 'a change that cannot move the number emits nothing');

    e.applyStatus(e.player, 'faint', 1);
    eq(en.intent.damage, 1, 'Faint is reflected in the intent too');
  });

  await atest('intents: multi-hit display, tooltips, families and the incoming-damage readout', async () => {
    const e = mk({ enemies: [dummyEnemy({ damage: 5, hits: 3 })] });
    await e.startCombat();
    const en = e.enemies[0];
    eq(en.intent.hits, 3, 'hits are reported for the ×N display');
    eq(en.intent.totalDamage, 15, 'total damage is available too');
    ok(/3 times for 5/.test(en.intent.tooltip), `tooltip spells it out: "${en.intent.tooltip}"`);

    eq(intentFamily(Intent.DEFEND), 'defense', 'DEFEND is the Defense family');
    eq(intentFamily(Intent.BUFF), 'scheme', 'BUFF is the Scheme family');
    eq(intentFamily(Intent.SUMMON), 'special', 'SUMMON is the Special family');

    const inc = previewIncoming(e);
    eq(inc.total, 15, 'incoming readout sums the board');
    e.player.block = 6;
    eq(previewIncoming(e).unblocked, 9, 'and subtracts current Guard');

    const dm = buildIntent(e, en, null);
    eq(dm.type, Intent.UNKNOWN, 'a missing move renders as Unknown rather than crashing');
  });

  // 8 ─ companion mechanic categories ---------------------------------------
  await atest('mechanic categories: counters, countdowns, summons, objects, generated cards', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();

    // persistent per-combat counter with min/max (Nine Lives shape)
    e.defineCounter({ id: 'lives', name: 'Lives', min: 0, max: 9, start: 9 });
    eq(e.counter('lives'), 9, 'counter starts at its configured value');
    eq(e.addCounter('lives', 5), 0, 'counters clamp at max');
    eq(e.spendCounter('lives', 3), true, 'spending works');
    eq(e.counter('lives'), 6, 'and lands on the right value');
    eq(e.spendCounter('lives', 99), false, 'overspending is refused and changes nothing');
    eq(e.counter('lives'), 6, 'still 6');
    e.defineCounter({ id: 'glow', name: 'Glow', min: 0, max: 6, start: 0, focusable: true });
    e.applyStatus(e.player, 'focus', 2);
    e.addCounter('glow', 1);
    eq(e.counter('glow'), 3, 'Focus boosts focusable counter gains');

    // delayed trigger: "at the start of your 3rd turn"
    let fired = 0;
    e.at(3, () => fired++, 'third turn');
    await e.endTurn();
    eq(fired, 0, 'not yet on turn 2');
    await e.endTurn();
    eq(fired, 1, 'the countdown fired at the start of turn 3');

    // simultaneous countdowns resolve as one batch (Wisp's Convergence)
    let batchSizes = [];
    e.schedule({ turns: 1, label: 'a', run: (c) => batchSizes.push(c.batchSize) });
    e.schedule({ turns: 1, label: 'b', run: (c) => batchSizes.push(c.batchSize) });
    await e.endTurn();
    deepEq(batchSizes, [2, 2], 'both countdowns knew they resolved together');

    // summons occupy enemy-like slots
    const before = e.enemies.length;
    const s = e.summon(dummyEnemy({ hp: 9, id: 'test/minion' }), { side: 'enemy' });
    eq(e.enemies.length, before + 1, 'the summon joined the enemy line');
    ok(s.intent !== null, 'the summon immediately has an intent');
    const ally = e.summon(dummyEnemy({ hp: 5 }), { side: 'ally' });
    eq(e.allies.length, 1, 'ally summons go into their own slot list');
    eq(ally.side, 'ally', 'and are tagged as allies');

    // board objects (Patch / Garden / Plots)
    const plant1 = e.addObject({ kind: 'plant', name: 'Briar', data: { growth: 0 } });
    e.updateObject(plant1.id, { growth: 2 });
    eq(e.objectsOfKind('plant')[0].data.growth, 2, 'board objects hold and update state');
    eq(e.removeObject(plant1.id), true, 'and can be removed');

    // cards that create cards, into any pile, at any position
    const made = e.addCard(BOO, Pile.DRAW, { position: 'top', count: 2 });
    eq(made.length, 2, 'an effect can create several Tricks');
    eq(e.piles.draw[0].id, BOO.id, 'created on top of the draw pile');
  });

  await atest('hooks: relics see combat start, card plays and damage, in a fixed order', async () => {
    const seen = [];
    const relic = {
      id: 'test/lucky-button', name: 'Lucky Button', hooks: {
        onCombatStart: () => seen.push('start'),
        onCardPlayed: (h) => seen.push('played:' + h.card.id),
        modifyDamageDealt: (amt, h) => h.kind === 'attack' ? amt + 2 : amt,
        onDeath: (h) => seen.push('death:' + h.actor.id),
      },
    };
    const e = mk({ relics: [relic], enemies: [dummyEnemy({ hp: 40 })] });
    await e.startCombat();
    eq(seen[0], 'start', 'onCombatStart fired');
    const c = plant(e, SCRATCH);
    e.player.energy = 3;
    const hp0 = e.enemies[0].hp;
    await e.playCard(c.uid, e.enemies[0].id);
    eq(hp0 - e.enemies[0].hp, 8, 'the relic added +2 in the hook step: 6 + 2');
    ok(seen.includes('played:' + SCRATCH.id), 'onCardPlayed fired with the card');
    const off = e.hooks.add('onCardPlayed', () => seen.push('adhoc'));
    const c2 = plant(e, SCRATCH);
    await e.playCard(c2.uid, e.enemies[0].id);
    ok(seen.includes('adhoc'), 'ad-hoc hooks registered by a card effect fire too');
    off();
    const c3 = plant(e, SCRATCH);
    const n = seen.filter(x => x === 'adhoc').length;
    await e.playCard(c3.uid, e.enemies[0].id);
    eq(seen.filter(x => x === 'adhoc').length, n, 'and can be removed again');
  });

  // 9 ─ state contract ------------------------------------------------------
  await atest('state: plain, structuredClone-able, and carries everything the renderer needs', async () => {
    const e = mk();
    await e.startCombat();
    e.defineCounter({ id: 'glow', name: 'Glow', max: 6, start: 2 });
    e.schedule({ turns: 2, label: 'linger', run: () => {} });
    e.addObject({ kind: 'plant', data: { growth: 1 } });
    e.applyStatus(e.player, 'strength', 2);
    const s = e.state;
    let cloned = null;
    try { cloned = structuredClone(s); } catch (err) { ok(false, 'structuredClone threw: ' + err.message); }
    ok(cloned, 'engine.state is structuredClone-able');
    eq(JSON.stringify(cloned), JSON.stringify(s), 'and survives the round trip unchanged');

    ok(Array.isArray(s.enemies) && s.enemies[0].intent, 'enemies carry their intent');
    ok(s.player.statuses.some(x => x.id === 'strength' && x.stacks === 2), 'statuses come with stacks and names');
    ok(s.counts.draw + s.counts.hand + s.counts.discard === 10, 'pile counts are present');
    ok(s.counters.some(c => c.id === 'glow' && c.value === 2), 'counters are in state');
    ok(s.timers.some(t => t.label === 'linger'), 'countdowns are in state');
    ok(s.objects.length === 1, 'board objects are in state');
    const card = s.piles.hand[0];
    ok(card && typeof card.cost === 'number' && card.display, 'hand cards carry cost and live display numbers');
    eq(e.state === s, true, 'reading state again with no change returns the cached object (no per-frame allocation)');
    e.applyStatus(e.player, 'weak', 1);
    ok(e.state !== s, 'and a real change invalidates the cache');
  });

  test('state: card text display numbers reflect modifiers and recolour direction', () => {
    const e = mk();
    e.player.statuses.set('strength', 3);
    const c = new Card(SCRATCH);
    e.piles._push(c, Pile.HAND, 'bottom');
    const snap = e.cardSnap(c, null);
    eq(snap.display.d.base, 6, 'base number preserved for comparison');
    eq(snap.display.d.value, 9, 'displayed number includes Strength');
    eq(snap.display.d.dir, 'up', 'and is flagged as boosted so it can be tinted');
    const parts = renderCardText(snap.text, snap.display, snap.nums);
    ok(parts.some(p => p.t === 'num' && p.value === 9), 'renderCardText substitutes the live number');
    const boo = e.cardSnap(new Card(BOO));
    const p2 = renderCardText(boo.text, boo.display, boo.nums);
    ok(p2.some(x => x.t === 'kw' && x.id === 'weak'), 'keyword chips are extracted from [Brackets]');
  });

  // 10 ─ keywords -----------------------------------------------------------
  test('keywords: every universal status and core term has a tooltip entry', () => {
    for (const id of STATUS_ORDER) {
      const k = getKeyword(id);
      ok(k && k.name && k.desc && k.color, `keyword "${id}" exists (${k?.name})`);
    }
    for (const id of ['courage', 'guard', 'pluck', 'vanish', 'retain', 'innate', 'ethereal', 'intent', 'x-cost']) {
      ok(getKeyword(id), `core keyword "${id}" exists`);
    }
    ok(allKeywords().length >= 35, `registry is populated (${allKeywords().length} entries)`);
    ok(allKeywords().every(k => !/#[0-9a-f]{3,8}/i.test(k.color)), 'no hex literals — every colour is a token reference');
    registerKeywords([{ id: 'test/kw', name: 'Testy', desc: 'hi', companion: 'marmalade' }]);
    eq(getKeyword('test/kw').category, 'companion', 'companion keywords merge in and get the companion colour');
  });

  await atest('keywords: the companion-cards registry merges in cleanly', async () => {
    const { loadCompanionKeywords } = await import('../../game/src/data/keywords.js');
    const okLoad = await loadCompanionKeywords();
    if (!okLoad) {
      ok(true, 'companion keyword file not present yet — merge seam still callable');
    } else {
      ok(getKeyword('ghoststep'), 'Marmalade keywords merged into the tooltip registry');
      ok(getKeyword('ghoststep').category === 'companion' || getKeyword('ghoststep').category === 'buff',
        'and got a sensible category');
      const gs = getStatus('ghoststep');
      ok(gs && !gs._missing, 'companion statuses registered into the engine status registry');
    }
  });

  // 11 ─ ctx contract -------------------------------------------------------
  await atest('ctx: the helper API matches schema.js exactly', async () => {
    const e = mk();
    await e.startCombat();
    const c = plant(e, SCRATCH);
    const ctx = e.ctxFor(c, e.enemies[0]);
    const required = ['damage', 'damageAll', 'loseHp', 'block', 'heal', 'applyStatus',
      'draw', 'discard', 'exhaust', 'addCard', 'gainEnergy', 'loseEnergy',
      'count', 'has', 'forEachEnemy', 'randomEnemy', 'livingEnemies'];
    for (const k of required) ok(typeof ctx[k] === 'function', `ctx.${k}() exists`);
    for (const k of ['e', 'self', 'target', 'card']) ok(ctx[k] !== undefined, `ctx.${k} exists`);
    eq(typeof ctx.x, 'number', 'ctx.x is a number for X-cost cards');

    ctx.loseHp(e.player, 5);
    eq(e.player.hp, 55, 'ctx.loseHp ignores Guard');
    ctx.heal(e.player, 3);
    eq(e.player.hp, 58, 'ctx.heal works');
    eq(ctx.count('strength'), 0, 'ctx.count reads statuses');
    ctx.applyStatus(e.player, 'strength', 2);
    eq(ctx.has('strength'), true, 'ctx.has reads statuses');
    let n = 0; ctx.forEachEnemy(() => n++);
    eq(n, e.livingEnemies().length, 'ctx.forEachEnemy visits every living enemy');
    ok(ctx.randomEnemy(), 'ctx.randomEnemy returns someone');
    ctx.gainEnergy(2);
    eq(e.player.energy, 5, 'ctx.gainEnergy works');
    ctx.loseEnergy(1);
    eq(e.player.energy, 4, 'ctx.loseEnergy works');
  });

  // 12 ─ the dummy scenario -------------------------------------------------
  await atest('dummy scenario: boots, plays and finishes without a single content file', async () => {
    const e = makeDummyCombat(new RNG(3));
    await e.startCombat();
    eq(e.enemies.length, 2, 'two dummy enemies');
    eq(e.piles.all().length, 10, 'a 10-Trick starter deck');
    eq(e.piles.hand.length, 5, 'opening hand drawn');
    ok(e.enemies.every(x => x.intent), 'both enemies show an intent from turn 1');
    let turns = 0;
    while (!e.over && turns++ < 30) {
      let guard = 0;
      while (!e.over && guard++ < 12) {
        const t = e.firstLivingEnemy();
        const c = e.piles.hand.find(x => e.canPlay(x.uid, t?.id).ok);
        if (!c) break;
        await e.playCard(c.uid, t?.id ?? null);
      }
      if (!e.over) await e.endTurn();
    }
    eq(e.over, true, `the dummy fight reaches a conclusion (${turns} turns, victory=${e.victory})`);
    ok(e.log.length > 50, `and produced a rich event log (${e.log.length} events)`);
  });

  // ── report ---------------------------------------------------------------
  let passed = 0, failed = 0;
  for (const r of results) {
    for (const a of r.asserts) (a.pass ? passed++ : failed++);
    if (r.error) failed++;
  }
  return { results, passed, failed };
}
