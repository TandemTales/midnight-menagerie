/**
 * Combat engine assertion suite. OWNER: combat-engine.
 * Runs headless in the browser — no framework, no build step.
 */

import { CombatEngine } from '../../game/src/combat/engine.js';
import { RNG } from '../../game/src/core/rng.js';
import { Card, _resetUid } from '../../game/src/combat/piles.js';
import { computeDamage } from '../../game/src/combat/damage.js';
import { getStatus, registerStatus, UNIVERSAL_STATUSES, STATUS_ORDER } from '../../game/src/combat/statuses.js';
import { getKeyword, allKeywords, renderCardText, registerKeywords, loadContentRegistries } from '../../game/src/data/keywords.js';
import { intentFamily, buildIntent, MAX_PLAN } from '../../game/src/combat/intents.js';
import { previewIncoming } from '../../game/src/combat/preview.js';
import { makeDummyCombat, makeDummyDeck, SCRATCH, CURL_UP, BOO, FLURRY, RATTLE, SECOND_WIND, BRACE, DUST_BUNNY, COATRACK } from '../../game/src/combat/dummy.js';
import { CardType, Rarity, Target, Intent, Pile, TERMS } from '../../game/src/data/schema.js';

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
    for (const id of ['courage', 'guard', 'nerve', 'vanish', 'retain', 'innate', 'ethereal', 'intent', 'x-cost']) {
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


  // ══ ROUND 2 ═════════════════════════════════════════════════════════════

  test('terminology: the engine speaks the design doc\'s words', () => {
    eq(TERMS.energy, 'Nerve', 'energy is Nerve');
    eq(TERMS.gold, 'Lost Things', 'gold is Lost Things');
    ok(getKeyword('nerve'), 'the nerve keyword exists');
    ok(!getKeyword('pluck'), 'the old Pluck keyword is gone');
    ok(getKeyword('lost-things'), 'the Lost Things keyword exists');
  });

  await atest('terminology: player-facing refusal text uses Nerve', async () => {
    const e = mk();
    await e.startCombat();
    const c = plant(e, RATTLE);
    e.player.energy = 0;
    const r = e.canPlay(c.uid, e.enemies[0].id);
    eq(r.ok, false, 'refused');
    ok(/Nerve/.test(r.reason), `and says Nerve: "${r.reason}"`);
    ok(!/Pluck/.test(r.reason), 'never says Pluck');
  });

  // ── player choice ────────────────────────────────────────────────────────
  const CHOOSY = {
    id: 'test/choosy', name: 'Choosy', companion: 'neutral',
    type: CardType.SKILL, rarity: Rarity.COMMON, cost: 0, target: Target.NONE,
    text: 'Choose a Trick in your hand and Vanish it.',
    effect: async (c) => {
      const [picked] = await c.chooseCard({ pile: 'hand', count: 1, prompt: 'Vanish which?' });
      if (picked) c.exhaust(picked);
    },
  };
  const FORK = {
    id: 'test/fork', name: 'Fork', companion: 'neutral',
    type: CardType.SKILL, rarity: Rarity.COMMON, cost: 0, target: Target.NONE,
    text: 'Choose one: Guard or damage.', nums: { b: 7, d: 7 },
    effect: async (c) => {
      const [i] = await c.choose({ options: ['Gain 7 Guard', 'Deal 7 damage'], count: 1 });
      if (i === 0) c.block(c.self, 7); else c.damage(c.randomEnemy(), 7);
    },
  };

  await atest('choice: the engine raises a request and the renderer fulfils it', async () => {
    const e = mk();
    await e.startCombat();
    const a = plant(e, SCRATCH), b = plant(e, CURL_UP);
    const card = plant(e, CHOOSY);

    let seen = null;
    e.on('choice', ev => { seen = ev; });
    // resolver picks card `b`, which is never index 0, so the auto-picker would miss it
    e.setChoiceResolver(async (req) => [req.pool.indexOf(b)]);

    await e.playCard(card.uid, null);
    ok(seen, 'a choice event was emitted');
    eq(seen.kind, 'card', 'and it says what kind of choice it is');
    ok(seen.pool.length >= 2, `the candidate set is in the payload (${seen.pool?.length})`);
    ok(seen.pool[0].card && seen.pool[0].label, 'each candidate carries a full card snapshot for the picker UI');
    eq(seen.prompt, 'Vanish which?', 'the prompt reaches the UI');
    eq(e.piles.exhaust.some(x => x.uid === b.uid), true, 'the RESOLVER\'s pick was Vanished, not the auto-pick');
    eq(e.piles.exhaust.some(x => x.uid === a.uid), false, 'the auto-pick was left alone');
  });

  await atest('choice: headless callers get a deterministic auto-resolver', async () => {
    const run1 = async () => {
      const e = mk();
      await e.startCombat();
      const a = plant(e, SCRATCH); plant(e, CURL_UP);
      const card = plant(e, CHOOSY);
      let pool0 = null;
      e.on('choice', ev => { pool0 = ev.pool[0].cardUid; });
      await e.playCard(card.uid, null);
      return { exhausted: e.piles.exhaust.map(x => x.uid), pool0, first: a.uid };
    };
    const r1 = await run1(), r2 = await run1();
    deepEq(r1.exhausted, r2.exhausted, 'the auto-resolver is deterministic across runs');
    ok(r1.exhausted.includes(r1.pool0), 'it picks the lowest index in the offered pool');

    const e = mk();
    await e.startCombat();
    plant(e, SCRATCH); plant(e, CURL_UP);
    const card = plant(e, FORK);
    await e.playCard(card.uid, null);
    ok(e.player.block >= 7, 'ctx.choose auto-picks option 0');
    eq(e.choiceLog.length, 1, 'every resolution is recorded in engine.choiceLog');
    eq(e.choiceLog[0].kind, 'option', 'with its kind');
    deepEq(e.choiceLog[0].picked, [0], 'and the indices chosen');
  });

  await atest('choice: seed + choiceLog reproduces a fight a human played', async () => {
    const play = async (resolver, script) => {
      _resetUid(0);
      const e = new CombatEngine({
        rng: new RNG(77),
        player: { name: 'C', maxHp: 70, deck: makeDummyDeck() },
        enemies: [dummyEnemy({ move: 'nothing' })],
      });
      if (resolver) e.setChoiceResolver(resolver);
      if (script) e.setChoiceScript(script);
      await e.startCombat();
      for (let i = 0; i < 3; i++) {
        const card = plant(e, FORK);
        e.player.energy = 3;
        await e.playCard(card.uid, null);
      }
      return e;
    };
    // a "human" who chooses 1, 0, 1
    let n = 0;
    const human = await play(async () => [[1, 0, 1][n++ % 3]]);
    const log = human.choiceLog.map(x => ({ ...x }));
    ok(log.length === 3, 'three decisions recorded');

    const replay = await play(null, log);
    eq(JSON.stringify(replay.state.player.hp), JSON.stringify(human.state.player.hp), 'replay reproduced the player');
    eq(replay.player.block, human.player.block, 'replay reproduced the Guard exactly');
    deepEq(replay.choiceLog.map(x => x.picked), log.map(x => x.picked), 'replay made the same decisions');
  });

  await atest('choice: discard({choose:true}) asks, and preview is honest about the unknown', async () => {
    const DUMP = {
      id: 'test/dump', name: 'Dump', companion: 'neutral', type: CardType.SKILL,
      rarity: Rarity.COMMON, cost: 0, target: Target.NONE, text: 'Discard 1.',
      effect: async (c) => { await c.discard(1, { choose: true }); },
    };
    const e = mk();
    await e.startCombat();
    const keep = plant(e, SCRATCH);
    const card = plant(e, DUMP);
    e.setChoiceResolver(async (req) => [Math.max(0, req.pool.indexOf(keep))]);
    const before = e.piles.discard.length;
    await e.playCard(card.uid, null);
    eq(e.piles.discard.length, before + 2, 'the chosen card and the played card both reached the discard pile');
    ok(!e.piles.hand.includes(keep), 'the chosen Trick left the hand');

    // preview of a card gated behind a choice
    const e2 = mk();
    await e2.startCombat();
    plant(e2, SCRATCH);
    const c2 = plant(e2, CHOOSY);
    const sync = e2.preview(c2.uid, null);
    eq(sync.ok, true, 'a sync preview still returns');
    eq(sync.partial, true, 'and admits it is partial');
    eq(sync.uncertain, true, 'and flags itself uncertain so the UI can show "?"');
    const full = await e2.previewAsync(c2.uid, null);
    eq(full.partial, false, 'previewAsync completes the picture');
    eq(full.uncertain, true, 'but still says the outcome depends on your choice');
    eq(full.exhaust >= 1, true, 'and reports the Vanish the auto-pick would cause');
    eq(e2.piles.exhaust.length, 0, 'previewing changed nothing in the real fight');
  });

  // ── new ctx helpers ──────────────────────────────────────────────────────
  await atest('ctx: setVanish, returnToHand, shuffleDraw, modifyDraw, cancelIntent', async () => {
    const e = mk({ enemies: [dummyEnemy({ damage: 9 })] });
    await e.startCombat();
    const c = plant(e, SCRATCH);
    const ctx = e.ctxFor(c, e.enemies[0]);

    ctx.setVanish(c, true);
    eq(c.exhaust, true, 'setVanish marks the card to Vanish when played');
    ctx.setVanish(c, false);
    eq(c.exhaust, false, 'and can be turned off again');

    const moved = plant(e, CURL_UP);
    e.piles.move(moved, Pile.DISCARD);
    eq(ctx.returnToHand(moved), true, 'returnToHand pulls a card back');
    eq(moved.pile, Pile.HAND, 'and it is in hand');

    let shuffles = 0;
    e.on('shuffle', () => shuffles++);
    ctx.shuffleDraw();
    eq(shuffles, 1, 'shuffleDraw emits exactly one shuffle');

    ctx.modifyDraw(2);
    const handBefore = e.piles.hand.length;
    await e.endTurn();
    eq(e.piles.hand.length, e.player.drawPerTurn + 2, 'modifyDraw added to next turn\'s draw');
    await e.endTurn();
    eq(e.piles.hand.length, e.player.drawPerTurn, 'and it was a one-turn effect');

    const en = e.enemies[0];
    ok(en.intent, 'the enemy has an intent');
    const before = en.intent.moveId;
    eq(ctx.cancelIntent(en), true, 'cancelIntent succeeds');
    ok(en.plan[0] !== null, 'the enemy still has a plan afterwards');
    ok(handBefore >= 0, 'sanity');
  });

  // ── new status hooks ─────────────────────────────────────────────────────
  await atest('hooks: onIncomingHit can negate a hit outright (Ghoststep shape)', async () => {
    registerStatus({
      id: 'test/step', name: 'Step', kind: 'buff', decay: 'enemyTurnEnd', desc: 'Negate the next hit.',
      hooks: {
        onIncomingHit: (h) => { if (h.kind === 'attack' && h.stacks > 0) { h.prevent(); h.consume(1); } },
      },
    });
    const e = mk({ enemies: [dummyEnemy({ damage: 40, hits: 2 })] });
    await e.startCombat();
    e.applyStatus(e.player, 'test/step', 1);
    const hp0 = e.player.hp;
    let prevented = 0;
    e.on('damage', ev => { if (ev.prevented) prevented++; });
    await e.endTurn();
    eq(prevented, 1, 'exactly one hit was negated');
    eq(e.player.hp, hp0 - 40, 'the other 40-damage hit still landed');
    eq(e.player.status('test/step'), 0, 'the stack was consumed');
  });

  await atest('hooks: enemyTurnEnd is a real decay bucket', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    e.applyStatus(e.player, 'test/step', 2);
    eq(e.player.status('test/step'), 2, 'two stacks');
    await e.endTurn();
    eq(e.player.status('test/step'), 1, 'one stack expired after the enemy turn, unused');
    eq(getStatus('test/step').decay, 'enemyTurnEnd', 'the bucket name is enemyTurnEnd');
  });

  await atest('hooks: onLethal can refuse death; onDebuffIncoming can refuse a debuff', async () => {
    registerStatus({
      id: 'test/notdead', name: 'Not Dead Yet', kind: 'buff', decay: 'never', desc: 'Survive at 1.',
      hooks: { onLethal: (h) => { h.prevent(); h.remove(); } },
    });
    const e = mk({ enemies: [dummyEnemy({ damage: 500 })] });
    await e.startCombat();
    e.applyStatus(e.player, 'test/notdead', 1);
    await e.endTurn();
    eq(e.player.alive, true, 'the player survived a lethal hit');
    eq(e.player.hp, 1, 'at exactly 1 Courage');
    eq(e.player.status('test/notdead'), 0, 'and the effect was spent');

    registerStatus({
      id: 'test/nope', name: 'Nope.', kind: 'buff', decay: 'never', desc: 'Refuse a debuff.',
      hooks: { onDebuffIncoming: (h) => { h.prevent(); h.remove(); } },
    });
    const e2 = mk();
    await e2.startCombat();
    e2.applyStatus(e2.player, 'test/nope', 1);
    e2.applyStatus(e2.player, 'weak', 3);
    eq(e2.player.status('weak'), 0, 'the debuff was refused');
    eq(e2.player.status('test/nope'), 0, 'and the refusal was spent');
    e2.applyStatus(e2.player, 'weak', 3);
    eq(e2.player.status('weak'), 3, 'the next debuff lands normally');
  });

  await atest('hooks: onAttack fires when an enemy lands a move; onAttackDealt when you play an Attack', async () => {
    let attacks = 0, dealt = 0;
    registerStatus({
      id: 'test/haunt', name: 'Haunt', kind: 'debuff', decay: 'never', desc: 'Hurts itself.',
      hooks: { onAttack: (h) => { attacks++; h.e.loseHp(h.owner, h.stacks, 'haunt'); } },
    });
    registerStatus({
      id: 'test/emp', name: 'Empowered', kind: 'buff', decay: 'never', desc: 'Spent on an Attack.',
      hooks: { onAttackDealt: () => { dealt++; } },
    });
    const e = mk({ enemies: [dummyEnemy({ damage: 3, hits: 3, hp: 60 })] });
    await e.startCombat();
    const en = e.enemies[0];
    e.applyStatus(en, 'test/haunt', 4);
    e.applyStatus(e.player, 'test/emp', 1);
    const hp0 = en.hp;
    await e.endTurn();
    eq(attacks, 1, 'onAttack fired ONCE for a 3-hit move, not three times');
    eq(hp0 - en.hp, 4, 'the Haunt-shaped status hurt the attacker for its stacks');

    const c = plant(e, SCRATCH);
    e.player.energy = 3;
    await e.playCard(c.uid, en.id);
    eq(dealt, 1, 'onAttackDealt fired for the Attack card');
    const c2 = plant(e, CURL_UP);
    await e.playCard(c2.uid, null);
    eq(dealt, 1, 'and not for a Skill');
  });

  // ── state re-entrancy ────────────────────────────────────────────────────
  await atest('state: reading engine.state from inside a card helper does not blow the stack', async () => {
    const NOSY = {
      id: 'test/nosy', name: 'Nosy', companion: 'neutral', type: CardType.ATTACK,
      rarity: Rarity.COMMON, cost: 2, target: Target.ENEMY, text: 'Deal {d}.', nums: { d: 5 },
      dynamicCost: (c) => (c.e.state.turn >= 1 ? 0 : 2),
      effect: (c) => c.damage(c.target, c.card.nums.d),
    };
    const e = mk();
    await e.startCombat();
    const c = plant(e, NOSY);
    let snap = null, threw = null;
    try { snap = e.state; } catch (err) { threw = err; }
    ok(!threw, `engine.state survived a dynamicCost that reads it (${threw?.message || 'no throw'})`);
    ok(snap && Array.isArray(snap.piles.hand), 'and returned a usable snapshot');
    eq(e.costOf(c), 0, 'the dynamicCost still evaluated correctly');
    eq(typeof e.turn, 'number', 'engine.turn is a cheap direct accessor');
    eq(e.energy, e.player.energy, 'engine.energy is a cheap direct accessor');
    eq(e.cardsPlayedThisTurn, e.stats.cardsPlayedThisTurn, 'engine.cardsPlayedThisTurn too');
  });

  // ── EnemyCtx surface ─────────────────────────────────────────────────────
  await atest('EnemyCtx: the full documented surface exists and works', async () => {
    let ctx = null;
    const probe = {
      id: 'test/probe', name: 'Probe', region: 'test', tier: 'normal', hp: [30, 30],
      moves: { look: { id: 'look', name: 'Look', intent: Intent.BUFF, effect: (c) => { ctx = c; } } },
      nextMove: () => 'look',
    };
    const e = mk({ enemies: [probe, dummyEnemy({ move: 'nothing' })] });
    e.registerCards([SCRATCH, BOO]);
    e.registerEnemies([probe]);
    await e.startCombat();
    await e.endTurn();
    ok(ctx, 'the move received a ctx');
    for (const k of ['self', 'player', 'rng', 'history', 'turn', 'field', 'cardsPlayedThisTurn',
                     'enemies', 'allies', 'damage', 'block', 'heal', 'loseHp', 'applyStatus',
                     'removeStatus', 'count', 'has', 'addCard', 'summon', 'despawn',
                     'setCounter', 'counter', 'announceRule', 'clearRules', 'intentOf', 'mem']) {
      ok(ctx[k] !== undefined, `ctx.${k} exists`);
    }
    ok(Array.isArray(ctx.cardsPlayedThisTurn), 'cardsPlayedThisTurn is an array of {id,type}');
    eq(typeof ctx.enemies, 'function', 'enemies() is a function');
    eq(ctx.enemies().length, 2, 'enemies() includes self');
    eq(ctx.allies().length, 1, 'allies() excludes self');
    ok(ctx.self.uid, 'self carries a uid');
    ctx.mem.seen = 7;
    eq(e.enemies[0].mem.seen, 7, 'mem persists on the actor');
    ctx.setCounter('dust', 3);
    eq(ctx.counter('dust'), 3, 'per-enemy counters read back');
    eq(e.state.enemies[0].counters.dust, 3, 'and reach the renderer through state');
    ctx.field.dark = true;
    eq(e.field.dark, true, 'field is shared per-combat scratch');
    const before = e.piles.discard.length;
    ctx.addCard('neutral/scratch', Pile.DISCARD);
    eq(e.piles.discard.length, before + 1, 'addCard by id resolves through the registry');
    const n0 = e.enemies.length;
    const s2 = ctx.summon('test/probe', { hpMul: 0.5 });
    eq(e.enemies.length, n0 + 1, 'summon by id works');
    eq(s2.maxHp, 15, 'hpMul was applied');
    ctx.despawn(s2);
    eq(e.enemies.length, n0, 'despawn removes it again');
  });

  await atest('EnemyCtx: damageTakenThisTurn survives into the enemy turn that follows', async () => {
    let sawDuringEnemyTurn = -1;
    const watcher = {
      id: 'test/watcher', name: 'Watcher', region: 'test', tier: 'normal', hp: [50, 50],
      moves: {
        check: {
          id: 'check', name: 'Check', intent: Intent.BUFF,
          effect: (c) => { sawDuringEnemyTurn = c.self.damageTakenThisTurn; },
        },
      },
      nextMove: () => 'check',
    };
    const e = mk({ enemies: [watcher] });
    await e.startCombat();
    const c = plant(e, SCRATCH);
    e.player.energy = 3;
    await e.playCard(c.uid, e.enemies[0].id);
    eq(e.enemies[0].damageTakenThisTurn, 6, 'damage accumulated during the player turn');
    await e.endTurn();
    eq(sawDuringEnemyTurn, 6, 'and was STILL readable during the enemy turn');
    eq(e.enemies[0].damageTakenThisTurn, 0, 'then reset at the start of the next player turn');
    eq(e.enemies[0].damageTakenLastTurn, 6, 'with the old value preserved as damageTakenLastTurn');
  });

  await atest('intents: damageFn / hitsFn / intentFn beat the static fields', async () => {
    const grower = {
      id: 'test/grower', name: 'Grower', region: 'test', tier: 'normal', hp: [60, 60],
      moves: {
        swell: {
          id: 'swell', name: 'Swell', intent: Intent.ATTACK, damage: 1, hits: 1,
          damageFn: (c) => 2 + (c.self.counters.dust || 0) * 3,
          hitsFn: (c) => ((c.self.counters.dust || 0) >= 2 ? 2 : 1),
          intentFn: (c) => ((c.self.counters.dust || 0) >= 2 ? Intent.ATTACK_BIG : Intent.ATTACK),
          effect: (c) => c.damage(c.player, 2),
        },
      },
      nextMove: () => 'swell',
    };
    const e = mk({ enemies: [grower] });
    await e.startCombat();
    const en = e.enemies[0];
    eq(en.intent.damage, 2, 'the dynamic damageFn is used, not the static damage:1');
    eq(en.intent.hits, 1, 'the dynamic hitsFn is used');
    eq(en.intent.type, Intent.ATTACK, 'the dynamic intentFn is used');

    en.counters.dust = 2;
    e.refreshIntents('test');
    eq(en.intent.damage, 8, 'the intent re-rendered when the fn\'s input changed: 2 + 2*3');
    eq(en.intent.hits, 2, 'hits changed too');
    eq(en.intent.type, Intent.ATTACK_BIG, 'and the silhouette got heavier');
    eq(en.intent.totalDamage, 16, 'total is per-hit × hits');

    e.applyStatus(e.player, 'vulnerable', 2);
    eq(en.intent.damage, 12, 'and it still goes through the damage pipeline: floor(8*1.5)');
  });

  // ── intent queue (Wink) ──────────────────────────────────────────────────
  const CYCLER = {
    id: 'test/cycler', name: 'Cycler', region: 'test', tier: 'normal', hp: [90, 90],
    moves: {
      a: { id: 'a', name: 'Alpha', intent: Intent.ATTACK, damage: 4, effect: (c) => c.damage(c.player, 4) },
      b: { id: 'b', name: 'Beta', intent: Intent.DEFEND, block: 5, effect: (c) => c.block(5) },
      c: { id: 'c', name: 'Gamma', intent: Intent.BUFF, anchored: true, effect: (c) => c.buff('strength', 1) },
    },
    nextMove: (ctx) => ['a', 'b', 'c'][ctx.history.length % 3],
  };

  await atest('intent queue: preview reveals the future, and the future is what actually happens', async () => {
    const e = mk({ enemies: [CYCLER] });
    await e.startCombat();
    const en = e.enemies[0];
    eq(e.intentQueue(en).length, 1, 'only the current action is visible to start with');
    eq(e.intentQueue(en)[0].moveId, 'a', 'and it is the first of the cycle');
    eq(e.previewDepth(en), 0, 'nothing previewed yet');

    eq(e.previewIntent(en, 2), 2, 'Preview 2 revealed two more positions');
    const q = e.intentQueue(en);
    eq(q.length, 3, 'the queue is now three deep');
    deepEq(q.map(x => x.moveId), ['a', 'b', 'c'], 'and shows the real upcoming cycle');
    deepEq(q.map(x => x.familyLabel), ['Attack', 'Defense', 'Scheme'],
      'each position reports its Intent Family');
    eq(e.intentFamilyOf(en, 1), 'Defense', 'intentFamilyOf reads a future position');
    eq(e.previewIntent(en, 5), 1, `Preview is capped at ${MAX_PLAN - 1} future positions`);

    // and the revealed plan is honoured
    const predicted = e.intentQueue(en)[1].moveId;
    await e.endTurn();
    eq(en.intent.moveId, predicted, 'what the player was shown is what became current');
  });

  await atest('intent queue: swap, postpone and delete, with Anchored respected', async () => {
    const e = mk({ enemies: [CYCLER] });
    await e.startCombat();
    const en = e.enemies[0];
    e.previewIntent(en, 2);
    deepEq(e.intentQueue(en).map(x => x.moveId), ['a', 'b', 'c'], 'baseline plan');

    eq(e.isAnchored(en, 2), true, 'Gamma is Anchored');
    eq(e.swapIntents(en, 0, 2), false, 'an Anchored position refuses to be swapped');
    deepEq(e.intentQueue(en).map(x => x.moveId), ['a', 'b', 'c'], 'and nothing moved');

    let queueEvents = 0;
    e.on('intent:queue', () => queueEvents++);
    eq(e.swapIntents(en, 0, 1), true, 'a legal swap succeeds');
    deepEq(e.intentQueue(en).map(x => x.moveId), ['b', 'a', 'c'], 'the plan really changed');
    ok(queueEvents >= 1, 'the renderer was told');
    eq(en.intent.moveId, 'b', 'and the displayed intent followed');
    eq(en.intent.block, 5, 'showing the swapped-in action\'s numbers');

    eq(e.postponeIntent(en), true, 'postpone succeeds');
    eq(e.intentQueue(en)[0].moveId, 'a', 'the postponed action stepped aside');

    const e2 = mk({ enemies: [CYCLER] });
    await e2.startCombat();
    const en2 = e2.enemies[0];
    e2.previewIntent(en2, 2);
    eq(e2.deleteIntent(en2), true, 'delete succeeds on an unanchored action');
    eq(en2.intent.moveId, 'b', 'the next action became current');
    await e2.endTurn();
    eq(en2.history[0], 'b', 'and the deleted action never resolved');
  });

  await atest('intent queue: looking ahead does not change how the fight plays out', async () => {
    const play = async (peek) => {
      _resetUid(0);
      const e = new CombatEngine({
        rng: new RNG(31), player: { name: 'P', maxHp: 80, deck: makeDummyDeck() },
        enemies: [DUST_BUNNY, COATRACK],
      });
      await e.startCombat();
      for (let t = 0; t < 4 && !e.over; t++) {
        if (peek) for (const en of e.livingEnemies()) e.previewIntent(en, 3);
        await e.endTurn();
      }
      return e.enemies.map(x => x.history.join('>')).join('|') + '#' + e.player.hp;
    };
    const a = await play(false), b = await play(true);
    eq(a, b, `previewing the queue is information only, not a change to the fight (${a})`);
  });

  // ── enemy lifecycle hooks ────────────────────────────────────────────────
  await atest('EnemyDef: the ten lifecycle hooks all fire', async () => {
    const fired = [];
    const mkHook = (n) => (c) => fired.push(n + ':' + c.self.id);
    const subject = {
      id: 'test/lifecycle', name: 'Subject', region: 'test', tier: 'normal', hp: [40, 40],
      moves: { hit: { id: 'hit', name: 'Hit', intent: Intent.ATTACK, damage: 2, effect: (c) => c.damage(c.player, 2) } },
      nextMove: () => 'hit',
      onCombatStart: mkHook('combatStart'),
      onSpawn: mkHook('spawn'),
      onPlayerTurnStart: mkHook('playerTurnStart'),
      onPlayerTurnEnd: mkHook('playerTurnEnd'),
      onTurnStart: mkHook('turnStart'),
      onTurnEnd: mkHook('turnEnd'),
      onDamaged: mkHook('damaged'),
      onDealtDamage: mkHook('dealtDamage'),
      onPlayerCard: mkHook('playerCard'),
      onAllyDeath: mkHook('allyDeath'),
      onDeath: mkHook('death'),
      onBoardEvent: mkHook('boardEvent'),
    };
    const e = mk({ enemies: [subject, dummyEnemy({ hp: 6, move: 'nothing' })] });
    await e.startCombat();
    ok(fired.some(x => x.startsWith('spawn')), 'onSpawn');
    ok(fired.some(x => x.startsWith('combatStart')), 'onCombatStart');

    const c = plant(e, SCRATCH);
    e.player.energy = 3;
    await e.playCard(c.uid, e.enemies[0].id);
    ok(fired.some(x => x.startsWith('playerCard')), 'onPlayerCard');
    ok(fired.some(x => x.startsWith('damaged')), 'onDamaged');

    e.boardEvent('lightsOut', { level: 2 });
    ok(fired.some(x => x.startsWith('boardEvent')), 'onBoardEvent');

    await e.endTurn();
    ok(fired.some(x => x.startsWith('playerTurnEnd')), 'onPlayerTurnEnd');
    ok(fired.some(x => x.startsWith('turnStart')), 'onTurnStart (its own turn)');
    ok(fired.some(x => x.startsWith('turnEnd')), 'onTurnEnd (its own turn)');
    ok(fired.some(x => x.startsWith('dealtDamage')), 'onDealtDamage');
    ok(fired.some(x => x.startsWith('playerTurnStart')), 'onPlayerTurnStart');

    e.dealDamage({ attacker: e.player, defender: e.enemies[1], amount: 99 });
    ok(fired.some(x => x.startsWith('allyDeath')), 'onAllyDeath fires on the survivors');
    e.dealDamage({ attacker: e.player, defender: e.enemies[0], amount: 999 });
    ok(fired.some(x => x.startsWith('death')), 'onDeath');
  });

  await atest('House Rules: a rule attaches a consequence, it never forbids the action', async () => {
    let reprimands = 0;
    const butler = {
      id: 'test/butler', name: 'Butler', region: 'test', tier: 'boss', hp: [80, 80],
      moves: { wait: { id: 'wait', name: 'Wait', intent: Intent.BUFF, effect: () => {} } },
      nextMove: () => 'wait',
      onSpawn: (c) => c.announceRule({
        id: 'no-rushing', name: 'Guests do not rush.',
        text: 'Playing a third Trick in one turn earns a Reprimand.',
        when: 'cardPlayed', once: true,
        broken: (rc) => rc.cardsPlayedThisTurn.length >= 3,
        onBreak: (c2) => { reprimands++; c2.damage(c2.player, 5); },
      }),
    };
    const e = mk({ enemies: [butler] });
    await e.startCombat();
    eq(e.state.rules.length, 1, 'the rule is in state for the renderer');
    eq(e.state.rules[0].name, 'Guests do not rush.', 'with its player-facing name');

    let broken = 0;
    e.on('rule:broken', () => broken++);
    for (let i = 0; i < 3; i++) {
      const c = plant(e, CURL_UP);
      e.player.energy = 3;
      await e.playCard(c.uid, null);
    }
    eq(reprimands, 1, 'the third Trick earned exactly one Reprimand');
    eq(broken, 1, 'and one rule:broken event');
    eq(e.piles.discard.filter(x => x.id === CURL_UP.id).length, 3, 'all three Tricks were still allowed to resolve');

    e.clearRules('e0');
    eq(e.rules.length, 0, 'clearRules removes them by source');
  });

  await atest('content: ENEMY_STATUSES and companion statuses are registered', async () => {
    const loaded = await loadContentRegistries();
    ok(loaded.enemies || loaded.companions, 'at least one content registry loaded');
    if (loaded.enemies) {
      for (const id of ['roused', 'frightened', 'discomposed', 'hidden', 'darkness', 'smothered', 'scurry']) {
        const d = getStatus(id);
        ok(d && !d._missing, `enemy status "${id}" is registered (${d?.name})`);
        ok(getKeyword(id), `and has a tooltip entry`);
      }
      eq(getStatus('hidden').untargetableBy?.[0], 'attack', 'Hidden declares what it blocks');
    }
    if (loaded.companions) {
      const gs = getStatus('ghoststep');
      ok(gs && !gs._missing, 'companion statuses are registered');
    }
  });

  await atest('content: Hidden really does block Attack targeting; Smothered really does reduce the draw', async () => {
    await loadContentRegistries();
    const e = mk({ enemies: [dummyEnemy({ hp: 30, id: 'test/x' }), dummyEnemy({ hp: 30, id: 'test/y' })] });
    await e.startCombat();
    const [a, b] = e.enemies;
    e.applyStatus(a, 'hidden', 1);
    const atk = plant(e, SCRATCH);
    const skill = plant(e, BOO);
    eq(e.canPlay(atk.uid, a.id).ok, false, 'an Attack cannot target a Hidden enemy');
    eq(e.canPlay(atk.uid, b.id).ok, true, 'but can target the one beside it');
    eq(e.canPlay(skill.uid, a.id).ok, true, 'a Skill still reaches it');
    const aoe = plant(e, RATTLE);
    e.player.energy = 3;
    const hp0 = a.hp;
    await e.playCard(aoe.uid, null);
    ok(a.hp < hp0, 'area damage still hits a Hidden enemy');

    const e2 = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e2.startCombat();
    e2.applyStatus(e2.player, 'smothered', 2);
    await e2.endTurn();
    eq(e2.piles.hand.length, 3, 'Smothered 2 cut the draw from 5 to 3, and the floor held');
  });

  // ── report ---------------------------------------------------------------
  let passed = 0, failed = 0;
  for (const r of results) {
    for (const a of r.asserts) (a.pass ? passed++ : failed++);
    if (r.error) failed++;
  }
  return { results, passed, failed };
}
