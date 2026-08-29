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

  test('status registry: all fourteen universal statuses exist with the right shape', () => {
    // Racket is the fourteenth and the only co-op one: it makes enemies target
    // the seat that has it. Counted here rather than treated as a special case,
    // because a status the registry does not know about is a status the display
    // order silently drops.
    const want = ['strength', 'dexterity', 'weak', 'vulnerable', 'frail', 'dread',
      'charm', 'regen', 'bristle', 'faint', 'confusion', 'entangle', 'focus', 'racket'];
    for (const id of want) {
      const d = getStatus(id);
      ok(d && !d._missing && d.name && d.desc && d.kind, `status "${id}" is registered (${d?.name})`);
    }
    eq(Object.keys(UNIVERSAL_STATUSES).length, 14, 'exactly fourteen universal statuses');
    eq(STATUS_ORDER.length, 14, 'display order covers all of them');
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
  /**
   * The two mechanics that were built on `onBoardEvent` and never once ran.
   * `boardEvent()` had no callers outside the lifecycle test above, so the
   * Porcelain Twins' Joined and the Rocking Horse's Excitement-from-support
   * were finished-looking defs the engine never reached (trap 5b).
   */
  await atest('boardEvent: Joined really flows half a Twin Guard to the other', async () => {
    const { getEnemy } = await import('/game/src/data/enemies/index.js');
    const e = mk({ enemies: [
      { def: getEnemy('porcelain-twin-prim'), hp: 60, id: 'prim' },
      { def: getEnemy('porcelain-twin-proper'), hp: 60, id: 'proper' },
    ] });
    await e.startCombat();
    const [prim, proper] = e.enemies;
    prim.block = 0; proper.block = 0;
    e.gainBlock(prim, 8, { fromCard: false, reason: 'test', source: prim });
    eq(prim.block, 8, 'Prim has the Guard it was given');
    eq(proper.block, 4, 'and half of it flowed to Proper, which is Joined');
  });

  await atest('boardEvent: a Joined mirror does not mirror itself', async () => {
    const { getEnemy } = await import('/game/src/data/enemies/index.js');
    const e = mk({ enemies: [
      { def: getEnemy('porcelain-twin-prim'), hp: 60, id: 'prim' },
      { def: getEnemy('porcelain-twin-proper'), hp: 60, id: 'proper' },
    ] });
    await e.startCombat();
    const [prim, proper] = e.enemies;
    prim.block = 0; proper.block = 0;
    /* Good Posture's explicit dual grant: "it must not also re-trigger Joined,
       or each would get 12." */
    e.gainBlock(prim, 8, { fromCard: false, reason: 'test', source: prim, noJoin: true });
    e.gainBlock(proper, 8, { fromCard: false, reason: 'test', source: proper, noJoin: true });
    eq(prim.block, 8, 'Prim got exactly what it was granted, not 12');
    eq(proper.block, 8, 'and so did Proper');
  });

  await atest('boardEvent: Good Posture grants 8 each, through the real move', async () => {
    /**
     * Resolves the actual move through the actual enemy ctx, because the thing
     * under test is the ctx's `block` helper FORWARDING its third argument.
     * `gainBlock` called directly would skip exactly the line that was broken:
     * `block: (a, n)` dropped opts, so Good Posture's `{ noJoin: true }` never
     * reached the engine and the Joined mirror fired on a grant whose own
     * comment says "it must not also re-trigger Joined, or each would get 12".
     */
    const { getEnemy } = await import('/game/src/data/enemies/index.js');
    const e = mk({ enemies: [
      { def: getEnemy('porcelain-twin-prim'), hp: 60, id: 'prim' },
      { def: getEnemy('porcelain-twin-proper'), hp: 60, id: 'proper' },
    ] });
    await e.startCombat();
    const [prim, proper] = e.enemies;
    prim.block = 0; proper.block = 0;
    const move = proper.def.moves['good-posture'];
    ok(!!move, 'Good Posture is on the def');
    move.effect(e.enemyCtx(proper, move));
    eq(prim.block, 8, 'Prim has 8, not 12');
    eq(proper.block, 8, 'and Proper has 8, not 12');
  });

  await atest('boardEvent: the Rocking Horse is excited by another enemy Guard', async () => {
    const { getEnemy } = await import('/game/src/data/enemies/index.js');
    /* THREE enemies: the rule is "an ally gaining Guard FROM ANOTHER ENEMY",
       so the giver and the receiver have to be different, and neither may be
       the Horse itself. */
    const e = mk({ enemies: [
      { def: getEnemy('rocking-horse'), hp: 60, id: 'horse' },
      { def: getEnemy('button-baby'), hp: 40, id: 'baby' },
      { def: getEnemy('button-baby'), hp: 40, id: 'giver' },
    ] });
    await e.startCombat();
    const [horse, baby, giver] = e.enemies;
    const excitement = () => (horse.counters && horse.counters.excitement) | 0;
    const before = excitement();
    e.gainBlock(baby, 6, { fromCard: false, reason: 'test', source: giver });
    ok(excitement() > before, 'an ally gaining Guard from another enemy excites it',
       before + ' -> ' + excitement());
  });

  await atest('boardEvent: but not by its OWN Happy Clatter', async () => {
    const { getEnemy } = await import('/game/src/data/enemies/index.js');
    const e = mk({ enemies: [
      { def: getEnemy('rocking-horse'), hp: 60, id: 'horse' },
      { def: getEnemy('button-baby'), hp: 40, id: 'baby' },
    ] });
    await e.startCombat();
    const [horse, baby] = e.enemies;
    const excitement = () => (horse.counters && horse.counters.excitement) | 0;
    const before = excitement();
    /* The Horse blocking an ally: source is the HORSE, and its own guard skips it. */
    e.gainBlock(baby, 4, { fromCard: false, reason: 'test', source: horse });
    eq(excitement(), before, 'its own support does not double-count');
  });

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

    /**
     * Through the REAL path, not by calling `boardEvent` directly.
     *
     * This used to be `e.boardEvent('lightsOut', { level: 2 })` — an event this
     * game does not have, invented by the test — and it was the ONLY caller of
     * `boardEvent` anywhere in the repo. So the hook was proved to fire while
     * nothing in the game had ever fired it, and two nursery mechanics built on
     * it were dead: rule 9's shape, where driving another module's API yourself
     * proves the API works rather than that the game uses it.
     */
    const before = fired.length;
    e.gainBlock(e.enemies[1], 5, { fromCard: false, reason: 'test', source: e.enemies[1] });
    ok(fired.some(x => x.startsWith('boardEvent')), 'onBoardEvent — off a real Guard gain');
    ok(fired.length > before, 'and it fired because of the gain, not earlier',
      `${before} -> ${fired.length}`);

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


  // ══ ROUND 3 ═════════════════════════════════════════════════════════════

  await atest('onEnemyPhaseEnd: a support enemy can arm an ally buff and the intent stays honest', async () => {
    // The shipping bug: Calling Bell buffs an ally from inside its MOVE, but the
    // ally's intent was drawn before the buff landed, so the displayed number lied.
    // A summoner is always slot 0, so ordering support enemies last cannot fix it.
    registerStatus({
      id: 'test/roused', name: 'Roused', kind: 'buff', decay: 'never', desc: 'Next attack hits harder.',
      hooks: { modifyDamageDealt: (amt, h) => amt + 2 * (h.stacks || 1) },
    });

    const attacker = {
      id: 'test/brute', name: 'Brute', region: 'test', tier: 'normal', hp: [50, 50],
      moves: { swing: { id: 'swing', name: 'Swing', intent: Intent.ATTACK, damage: 6, effect: (c) => c.damage(c.player, 6) } },
      nextMove: () => 'swing',
    };
    // slot 0 — ordering cannot save this one
    const bell = {
      id: 'test/bell', name: 'Bell', region: 'test', tier: 'normal', hp: [30, 30],
      moves: { ring: { id: 'ring', name: 'Ring', intent: Intent.BUFF, effect: () => {} } },
      nextMove: () => 'ring',
      onEnemyPhaseEnd: (c) => { for (const a of c.allies()) c.applyStatus(a, 'test/roused', 1); },
    };

    const e = mk({ enemies: [bell, attacker] });
    await e.startCombat();
    const brute = e.enemies[1];
    eq(brute.intent.damage, 6, 'turn 1 intent is the unbuffed number');

    await e.endTurn();
    eq(brute.status('test/roused'), 1, 'the Bell armed its ally at enemy-phase end');
    eq(brute.intent.damage, 8, 'and the intent the player now reads INCLUDES the buff');

    const hp0 = e.player.hp;
    await e.endTurn();
    eq(hp0 - e.player.hp, 8, 'the hit landed for exactly what the intent promised');
    eq(brute.intent.damage, 10, 'and the next intent shows the second stack');
  });

  await atest('onEnemyPhaseEnd: fires as a status/relic hook too, once, in the right window', async () => {
    const order = [];
    const relic = {
      id: 'test/watcher-relic', name: 'Watcher', hooks: {
        onEnemyPhaseEnd: () => order.push('phaseEnd'),
      },
    };
    const e = mk({ relics: [relic], enemies: [dummyEnemy({ damage: 2 })] });
    await e.startCombat();
    e.on('*', ev => {
      if (ev.type === 'turn:end' && ev.side === 'enemy') order.push('enemyDone');
      if (ev.type === 'intent' && ev.reason === 'turnEnd') order.push('intentRedrawn');
    });
    await e.endTurn();
    const i = (t) => order.indexOf(t);
    ok(i('enemyDone') >= 0 && i('phaseEnd') >= 0, 'both markers were seen');
    ok(i('enemyDone') < i('phaseEnd'), 'onEnemyPhaseEnd runs AFTER every enemy has acted');
    ok(i('intentRedrawn') >= 0, 'intents really were redrawn (the check is not vacuous)');
    ok(i('phaseEnd') < i('intentRedrawn'), 'and onEnemyPhaseEnd ran BEFORE they were redrawn');
    eq(order.filter(x => x === 'phaseEnd').length, 1, 'exactly once per enemy phase');
    ok(e.state.phase === 'player', 'and the phase settles back to the player turn');
  });

  await atest('decay: the enemyTurnEnd bucket now runs on enemies too', async () => {
    registerStatus({
      id: 'test/shimmer', name: 'Shimmer', kind: 'buff', decay: 'enemyTurnEnd',
      desc: 'Expires at the end of the enemy phase.',
    });
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    const en = e.enemies[0];
    e.applyStatus(en, 'test/shimmer', 2);
    e.applyStatus(e.player, 'test/shimmer', 2);
    await e.endTurn();
    eq(en.status('test/shimmer'), 1, 'an enemy-held enemyTurnEnd status decayed');
    eq(e.player.status('test/shimmer'), 1, 'and so did the player-held one');
    await e.endTurn();
    eq(en.status('test/shimmer'), 0, 'gone after the second enemy phase');
  });

  await atest('House Rules: announcing replaces the source\'s previous rule by default', async () => {
    const rule = (id, n) => ({
      id, name: n, text: n, when: 'cardPlayed', once: true,
      broken: () => false, onBreak: () => {},
    });
    const butler = {
      id: 'test/butler2', name: 'Butler', region: 'test', tier: 'boss', hp: [90, 90],
      moves: { wait: { id: 'wait', name: 'Wait', intent: Intent.BUFF, effect: () => {} } },
      nextMove: () => 'wait',
    };
    const e = mk({ enemies: [butler, dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    const b = e.enemies[0], other = e.enemies[1];

    const ctx = e.enemyCtx(b, null);
    ctx.announceRule(rule('r1', 'Guests do not rush.'));
    eq(e.rules.length, 1, 'one rule');
    ctx.announceRule(rule('r2', 'Guests wait their turn.'));
    eq(e.rules.length, 1, 'announcing a second rule REPLACED the first — the Butler enforces one rule, not four');
    eq(e.rules[0].id, 'r2', 'and it is the new one');

    // another source is untouched
    e.enemyCtx(other, null).announceRule(rule('r3', 'Wipe your feet.'));
    eq(e.rules.length, 2, 'a different source keeps its own rule');
    deepEq(e.rules.map(r => r.id).sort(), ['r2', 'r3'], 'both are live');

    // explicit opt-in to stacking
    ctx.announceRule({ ...rule('r4', 'And no running.'), stack: true });
    eq(e.rules.filter(r => r.sourceId === b.id).length, 2, 'stack:true keeps the source\'s earlier rule alongside');

    e.dealDamage({ attacker: e.player, defender: b, amount: 999 });
    eq(e.rules.filter(r => r.sourceId === b.id).length, 0, 'a dead source loses all of its rules');
    eq(e.rules.length, 1, 'the other source keeps its own');
  });

  await atest('applyStatus: the 4th argument survives the enemy ctx wrapper', async () => {
    registerStatus({ id: 'test/cover', name: 'Covered', kind: 'buff', decay: 'never', desc: 'Soaks {n}.' });
    let seenOpts = null;
    registerStatus({
      id: 'test/tagged', name: 'Tagged', kind: 'buff', decay: 'never', desc: 'x',
      hooks: { onApply: (h) => { seenOpts = h.opts; } },
    });

    const blob = {
      id: 'test/blob', name: 'Blob', region: 'test', tier: 'normal', hp: [40, 40],
      moves: {
        cover: {
          id: 'cover', name: 'Cover', intent: Intent.DEFEND,
          // this is the exact shape Blanket Blob sends
          effect: (c) => { const a = c.allies()[0]; if (a) c.applyStatus(a, 'test/cover', 1, { by: c.self.id, amount: 7 }); },
        },
      },
      nextMove: () => 'cover',
    };
    const e = mk({ enemies: [blob, dummyEnemy({ move: 'nothing' })] });
    let meta = null;
    e.on('status', ev => { if (ev.id === 'test/cover') meta = ev.meta; });
    await e.startCombat();
    await e.endTurn();

    const ally = e.enemies[1];
    eq(ally.status('test/cover'), 1, 'the status landed');
    ok(meta, 'the status event carried the content data');
    eq(meta.amount, 7, 'amount arrived');
    eq(meta.by, e.enemies[0].id, 'by arrived');
    const read = e.statusMeta(ally, 'test/cover');
    eq(read.amount, 7, 'and it is readable later via engine.statusMeta');
    ok(e.state.enemies[1].statuses.find(x => x.id === 'test/cover').meta.amount === 7,
      'the renderer can see it in state');

    // player ctx passes it through as well
    const e2 = mk();
    await e2.startCombat();
    const c = plant(e2, SCRATCH);
    e2.ctxFor(c, e2.enemies[0]).applyStatus(e2.player, 'test/tagged', 1, { source: 'trick', power: 3 });
    ok(seenOpts && seenOpts.power === 3, 'the player ctx passes options through to onApply too');
    eq(e2.statusMeta(e2.player, 'test/tagged').power, 3, 'and stores them');
    eq(e2.statusMeta(e2.player, 'test/tagged').reason, undefined, 'engine bookkeeping keys are not leaked into meta');
  });

  await atest('intent honesty: the audit method — blocked + hpLoss equals the promise', async () => {
    // This mirrors tests/enemies/audit.py: score honesty from the `damage` events
    // as blocked + hpLoss, never from HP/Guard deltas across endTurn (which counts
    // the player's whole unspent Guard as damage taken).
    let mismatches = 0, turns = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const e = makeDummyCombat(new RNG(seed));
      await e.startCombat();
      for (let t = 0; t < 6 && !e.over; t++) {
        const promised = new Map();
        for (const en of e.livingEnemies()) {
          if (en.intent && en.intent.damage > 0) promised.set(en.id, en.intent.damage * en.intent.hits);
        }
        const got = new Map();
        const off = e.on('damage', ev => {
          if (ev.targetId !== e.player.id || !ev.sourceId) return;
          got.set(ev.sourceId, (got.get(ev.sourceId) || 0) + ev.blocked + ev.hpLoss);
        });
        // give the player some Guard so a naive HP-delta method would be fooled
        e.gainBlock(e.player, 12, { fromCard: false });
        await e.endTurn();
        off();
        for (const [id, want] of promised) {
          turns++;
          if ((got.get(id) || 0) !== want) mismatches++;
        }
      }
    }
    ok(turns > 40, `sampled a meaningful number of enemy actions (${turns})`);
    eq(mismatches, 0, `every attack intent delivered exactly what it promised (${turns} checked)`);
  });


  // ══ ROUND 4 ═════════════════════════════════════════════════════════════

  await atest('snacks: every real SNACK def resolves through engine.useSnack', async () => {
    // CONTRACTS rule 9 — across the seam, against the REAL definitions, not a mock.
    let SNACKS = null;
    try { ({ SNACKS } = await import('../../game/src/state/run.js')); }
    catch (err) { ok(false, 'could not import the real SNACKS: ' + (err?.message || err)); }
    if (!SNACKS) return;
    ok(SNACKS.length >= 7, `loaded the real Snack table (${SNACKS.length} Snacks)`);

    for (const snack of SNACKS) {
      const e = mk({ enemies: [dummyEnemy({ hp: 40, move: 'nothing' })] });
      await e.startCombat();
      e.player.hp = 40;
      e.applyStatus(e.player, 'weak', 2);
      const en = e.enemies[0];
      const before = {
        hp: e.player.hp, block: e.player.block, energy: e.player.energy,
        weak: e.player.status('weak'), enemyHp: en.hp,
      };
      const evs = await e.useSnack(snack, snack.effect.target === 'enemy' ? en.id : null);
      ok(evs.some(x => x.type === 'snack:used'), `${snack.name}: emitted snack:used`);

      const fx = snack.effect;
      if (fx.heal)      eq(e.player.hp, before.hp + fx.heal, `${snack.name}: healed`);
      if (fx.block)     eq(e.player.block, before.block + fx.block, `${snack.name}: gained Guard`);
      if (fx.energy)    eq(e.player.energy, before.energy + fx.energy, `${snack.name}: gained Nerve`);
      if (fx.cleanse)   eq(e.player.status('weak'), 0, `${snack.name}: cleansed debuffs`);
      if (fx.damageAll) ok(en.hp < before.enemyHp, `${snack.name}: hit every enemy`);
      if (Array.isArray(fx.status)) {
        const who = fx.target === 'enemy' ? en : e.player;
        eq(who.status(fx.status[0]), fx.status[1], `${snack.name}: applied ${fx.status[0]}`);
      }
    }
  });

  await atest('snacks: the snack:used event lands BEFORE the numbers, and carries them', async () => {
    const snack = { id: 'test/bat', name: 'Gummy Bat', desc: 'Recover 12.', effect: { heal: 12 } };
    const e = mk();
    await e.startCombat();
    e.player.hp = 30;
    let hpAtAnnounce = null;
    const order = [];
    e.on('snack:used', (ev) => { hpAtAnnounce = e.player.hp; order.push('snack'); });
    e.on('heal', () => order.push('heal'));
    const evs = await e.useSnack(snack);
    eq(hpAtAnnounce, 30, 'the announcement fires before the Courage moves, so the eat can animate first');
    deepEq(order, ['snack', 'heal'], 'and in that order');
    const ev = evs.find(x => x.type === 'snack:used');
    eq(ev.snackId, 'test/bat', 'the event names the Snack');
    eq(ev.potency.heal, 12, 'and carries the final numbers');
    eq(e.player.hp, 42, 'the heal landed');
  });

  await atest('snacks: canUseSnack refuses cleanly, and the engine never touches the inventory', async () => {
    const bat = { id: 'test/bat', name: 'Bat', effect: { heal: 5 } };
    const jaw = { id: 'test/jaw', name: 'Jaw', effect: { status: ['vulnerable', 3], target: 'enemy' } };
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    eq(e.canUseSnack(bat).ok, true, 'a plain Snack is usable on your turn');
    eq(e.canUseSnack(null).ok, false, 'null is refused');
    eq(e.canUseSnack({ id: 'x', name: 'x' }).ok, false, 'a Snack with no effect is refused');

    e.dealDamage({ attacker: e.player, defender: e.enemies[0], amount: 999 });
    eq(e.over, true, 'combat is over');
    const r = e.canUseSnack(jaw);
    eq(r.ok, false, 'a targeted Snack is refused with nothing to aim at');
    ok(r.reason.length > 0, `and says why: "${r.reason}"`);
    const evs = await e.useSnack(jaw);
    eq(evs.some(x => x.type === 'card:invalid'), true, 'a refused Snack emits card:invalid and changes nothing');

    // the run inventory is not the engine's business
    eq(typeof e.snacks, 'undefined', 'the engine holds no Snack inventory');
  });

  await atest('snacks: a targeted Snack asks through the ordinary chooser; cancelling spends nothing', async () => {
    const jaw = { id: 'test/jaw', name: 'Jawbreaker', effect: { status: ['vulnerable', 3], target: 'enemy' } };
    const e = mk({ enemies: [dummyEnemy({ hp: 30, move: 'nothing' }), dummyEnemy({ hp: 30, move: 'nothing' })] });
    await e.startCombat();
    let asked = null;
    e.on('choice', ev => { asked = ev; });
    e.setChoiceResolver(async (req) => [1]);           // pick the second enemy
    await e.useSnack(jaw);
    ok(asked, 'the engine raised a choice request');
    eq(asked.kind, 'enemy', 'of kind enemy');
    ok(/Jawbreaker/.test(asked.prompt), `with a readable prompt: "${asked.prompt}"`);
    eq(e.enemies[1].status('vulnerable'), 3, 'the chosen enemy got it');
    eq(e.enemies[0].status('vulnerable'), 0, 'the other did not');

    // cancelling
    const e2 = mk({ enemies: [dummyEnemy({ hp: 30, move: 'nothing' }), dummyEnemy({ hp: 30, move: 'nothing' })] });
    await e2.startCombat();
    e2.setChoiceResolver(async () => []);              // player backed out
    const evs = await e2.useSnack(jaw);
    eq(evs.some(x => x.type === 'snack:used'), false, 'backing out never announces the Snack');
    eq(e2.enemies[0].status('vulnerable'), 0, 'and nothing was applied');

    // a single living enemy needs no question
    const e3 = mk({ enemies: [dummyEnemy({ hp: 30, move: 'nothing' })] });
    await e3.startCombat();
    let asked3 = false;
    e3.on('choice', () => { asked3 = true; });
    await e3.useSnack(jaw);
    eq(asked3, false, 'one enemy means no question');
    eq(e3.enemies[0].status('vulnerable'), 3, 'and it just lands');
  });

  await atest('snacks: onSnackUsed lets a Keepsake react, modifySnackPotency lets one scale', async () => {
    const seen = [];
    const ornithopter = {
      id: 'test/ornithopter', name: 'Tin Bird', hooks: {
        onSnackUsed: (h) => {
          seen.push({ id: h.snackId, target: h.target ? h.target.id : null, potency: h.potency, results: h.results });
          h.e.heal(h.e.player, 3, 'keepsake');
        },
      },
    };
    const bark = {
      id: 'test/bark', name: 'Sacred Bark', hooks: {
        modifySnackPotency: (v, h) => v * 2,
      },
    };
    const bat = { id: 'test/bat', name: 'Gummy Bat', effect: { heal: 10 } };

    const e = mk({ relics: [ornithopter] });
    await e.startCombat();
    e.player.hp = 20;
    await e.useSnack(bat);
    eq(seen.length, 1, 'onSnackUsed fired exactly once');
    eq(seen[0].id, 'test/bat', 'with the Snack id');
    eq(seen[0].potency.heal, 10, 'and the numbers that were applied');
    eq(seen[0].results.healed, 10, 'and what actually happened');
    eq(e.player.hp, 33, 'the Keepsake\'s own reaction landed too (20 + 10 + 3)');

    const e2 = mk({ relics: [bark] });
    await e2.startCombat();
    e2.player.hp = 20;
    eq(e2.snackPotency(bat).heal, 20, 'modifySnackPotency doubled the Snack before it resolved');
    await e2.useSnack(bat);
    eq(e2.player.hp, 40, 'and the doubled amount is what landed');
  });

  // ── state cache invalidation ─────────────────────────────────────────────
  await atest('state: the snapshot is never stale on turn rollover', async () => {
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })] });
    await e.startCombat();
    const mismatches = [];
    e.on('turn:start', (ev) => {
      if (ev.side !== 'player') return;
      // this is exactly what the HUD does
      if (e.state.turn !== ev.turn) mismatches.push({ state: e.state.turn, ev: ev.turn });
      if (e.state.phase !== 'player') mismatches.push({ phase: e.state.phase });
    });
    for (let i = 0; i < 6; i++) {
      e.state;                                   // warm the cache every turn, like a frame loop
      await e.endTurn();
    }
    eq(mismatches.length, 0, `engine.state.turn matched the turn:start event every time (${JSON.stringify(mismatches)})`);
    eq(e.state.turn, e.turn, 'and matches the live value afterwards');
  });

  await atest('state: a mutation DURING a snapshot is not swallowed', async () => {
    const e = mk();
    await e.startCombat();
    e.defineCounter({ id: 'sneaky', name: 'Sneaky', max: 9, start: 0 });
    const NOSY2 = {
      id: 'test/nosy2', name: 'Nosy2', companion: 'neutral', type: CardType.SKILL,
      rarity: Rarity.COMMON, cost: 1, target: Target.NONE, text: 'x',
      // a dynamicCost that mutates is bad content, but it must not corrupt the cache
      dynamicCost: (c) => { c.e.addCounter('sneaky', 1); return 1; },
      effect: () => {},
    };
    plant(e, NOSY2);
    const first = e.state;
    const v1 = first.counters.find(c => c.id === 'sneaky').value;
    const second = e.state;
    ok(second !== first, 'the cache was invalidated by the mutation that happened mid-snapshot');
    const v2 = second.counters.find(c => c.id === 'sneaky').value;
    ok(v2 > v1, `and the fresh snapshot shows the newer value (${v1} → ${v2})`);
  });

  // ── cost composition ─────────────────────────────────────────────────────
  await atest('costOf: discounts compose on top of dynamicCost instead of being skipped', async () => {
    registerStatus({
      id: 'test/discount', name: 'Discount', kind: 'buff', decay: 'never',
      desc: 'Tricks cost {n} less.',
      hooks: { modifyCardCost: (cost, h) => cost - h.stacks },
    });
    const DYN = {
      id: 'test/dyn2', name: 'Dyn', companion: 'neutral', type: CardType.SKILL,
      rarity: Rarity.COMMON, cost: 3, target: Target.NONE, text: 'x',
      dynamicCost: () => 3,
      effect: () => {},
    };
    const e = mk();
    await e.startCombat();
    const c = plant(e, DYN);
    eq(e.costOf(c), 3, 'step 1: dynamicCost supplies the printed cost');

    e.applyStatus(e.player, 'test/discount', 1);
    eq(e.costOf(c), 2, 'step 4: a discount status now REACHES a dynamic-cost card');

    e.modifyCardCost(c, -1, 'turn');
    eq(e.costOf(c), 1, 'step 3: modifyCost deltas apply to the dynamic cost too');

    e.setCardCost(c, 0, 'turn');
    eq(e.costOf(c), 0, 'step 2: a hard override outranks the dynamic cost, and clamps at 0');

    // and a plain card is unchanged by all of this
    const plain = plant(e, RATTLE);              // printed 2
    eq(e.costOf(plain), 1, 'a non-dynamic card still gets the discount');
    e.removeStatus(e.player, 'test/discount');
    eq(e.costOf(plain), 2, 'and loses it again');

    // X-cost survives a dynamicCost that returns -1
    const XC = { ...DYN, id: 'test/xc', cost: -1, dynamicCost: () => -1 };
    const x = plant(e, XC);
    eq(e.costOf(x), -1, 'an X cost stays an X cost');
  });

  test('contract: registerCards / registerEnemies exist and are correctly named', () => {
    const e = mk();
    eq(typeof e.registerCards, 'function', 'engine.registerCards(defs) exists');
    eq(typeof e.registerEnemies, 'function', 'engine.registerEnemies(defs) exists');
    eq(typeof e.useSnack, 'function', 'engine.useSnack(snack, targetId) exists');
    eq(typeof e.canUseSnack, 'function', 'engine.canUseSnack(snack, targetId) exists');
    eq(typeof e.snackPotency, 'function', 'engine.snackPotency(snack) exists');
    ok(e.registerCards([SCRATCH]) >= 1, 'registerCards accepts an array and returns the registry size');
    ok(e.registerEnemies([DUST_BUNNY]) >= 1, 'registerEnemies does too');
    ok(e.resolveCardDef('neutral/scratch'), 'and the id resolves afterwards');
    ok(e.resolveCardDef('scratch'), 'including by the last path segment');
  });


  // ══ ROUND 5 ═════════════════════════════════════════════════════════════

  /**
   * The contract for `engine.stats`. A counter that is declared but never
   * written is worse than a missing one: content reads it, gets 0 forever, and
   * the mechanic silently does nothing. `damageDealtThisTurn` was exactly that,
   * and it made the Butler's Roughhousing rule impossible to trigger.
   *
   * Every key below must (a) exist and (b) actually move during a real fight.
   * Any key NOT below must not exist. Adding a counter means adding it here.
   */
  const STAT_CONTRACT = [
    'cardsPlayedThisTurn', 'cardsPlayedThisCombat',
    'attacksPlayedThisTurn', 'skillsPlayedThisTurn',
    'cardsDiscardedThisTurn', 'cardsExhaustedThisTurn', 'cardsExhaustedThisCombat',
    'damageDealtThisTurn', 'damageDealtThisCombat',
    'damageTakenThisTurn', 'damageTakenThisCombat',
    'damageTakenLastEnemyTurn', 'turnsTaken',
  ];

  test('stats: the declared key set matches the documented contract exactly', () => {
    const e = mk();
    const declared = Object.keys(e.stats).sort();
    const contract = STAT_CONTRACT.slice().sort();
    deepEq(declared, contract, 'no undeclared and no undocumented counters');
    ok(!('livesSpentThisTurn' in e.stats),
      'livesSpentThisTurn is gone — the engine has no concept of a Life, so it could never write it');
    for (const k of STAT_CONTRACT) eq(typeof e.stats[k], 'number', `stats.${k} is a number`);
  });

  await atest('stats: a real fight moves every single declared counter', async () => {
    const moved = new Set();
    const watch = (e) => { for (const k of STAT_CONTRACT) if (e.stats[k] > 0) moved.add(k); };

    const e = mk({ enemies: [dummyEnemy({ hp: 200, damage: 7 })] });
    await e.startCombat();
    const en = e.enemies[0];

    // attacks, skills, exhaust, discards, damage dealt
    e.player.energy = 9;
    await e.playCard(plant(e, SCRATCH).uid, en.id);
    await e.playCard(plant(e, CURL_UP).uid, null);
    await e.playCard(plant(e, SECOND_WIND).uid, null);
    e.discardCard(e.piles.hand[0], 'test');
    watch(e);

    // damage taken, inside the player turn so the ThisTurn counter is readable
    e.dealDamage({ attacker: en, defender: e.player, amount: 9 });
    watch(e);

    await e.endTurn();            // enemy swings → damageTakenLastEnemyTurn
    watch(e);

    const missing = STAT_CONTRACT.filter(k => !moved.has(k));
    deepEq(missing, [], `every counter was written by real play (dead: ${missing.join(', ') || 'none'})`);
  });

  await atest('stats: damageDealtThisTurn is what the Butler\'s Roughhousing rule reads', async () => {
    const e = mk({ enemies: [dummyEnemy({ hp: 200, move: 'nothing' })] });
    await e.startCombat();
    const en = e.enemies[0];
    eq(e.stats.damageDealtThisTurn, 0, 'starts at zero');

    e.player.energy = 9;
    await e.playCard(plant(e, SCRATCH).uid, en.id);      // 6
    eq(e.stats.damageDealtThisTurn, 6, 'one Scratch counted');
    await e.playCard(plant(e, FLURRY).uid, en.id);       // 3 x 3
    eq(e.stats.damageDealtThisTurn, 15, 'multi-hit counted per hit — the rule can now reach 15');
    eq(e.stats.damageDealtThisCombat, 15, 'and the combat total tracks it');

    // this is the RuleCtx field the Butler reads
    let sawInRule = -1;
    e.announceRule({
      id: 'test/roughhousing', name: 'Roughhousing', text: 'x', when: 'cardPlayed', once: true,
      broken: (rc) => { sawInRule = rc.damageDealtThisTurn; return rc.damageDealtThisTurn >= 15; },
      onBreak: () => {},
    }, en.id);
    let broke = 0;
    e.on('rule:broken', () => broke++);
    await e.playCard(plant(e, CURL_UP).uid, null);
    eq(sawInRule, 15, 'RuleCtx.damageDealtThisTurn carried the real number');
    eq(broke, 1, 'and a >= 15 threshold rule actually fired');

    // Guard absorbing a swing is not damage dealt
    const before = e.stats.damageDealtThisTurn;
    en.block = 50;
    await e.playCard(plant(e, SCRATCH).uid, en.id);
    eq(e.stats.damageDealtThisTurn, before, 'a fully blocked hit deals no damage');
  });

  await atest('stats: the counter still holds at turnEnd, which is when the Butler checks', async () => {
    // The real rule is `when: 'turnEnd'`, so the number must survive until the
    // end-of-turn rule sweep and only reset at the START of the next player turn.
    const e = mk({ enemies: [dummyEnemy({ hp: 200, move: 'nothing' })] });
    await e.startCombat();
    const en = e.enemies[0];
    let sawAtTurnEnd = -1, broke = 0;
    e.announceRule({
      id: 'test/no-roughhousing', name: 'GUESTS DO NOT ROUGHHOUSE', text: 'x',
      when: 'turnEnd', once: true,
      broken: (rc) => { sawAtTurnEnd = rc.damageDealtThisTurn; return (rc.damageDealtThisTurn || 0) >= 15; },
      onBreak: () => { broke++; },
    }, en.id);

    e.player.energy = 9;
    await e.playCard(plant(e, SCRATCH).uid, en.id);   // 6
    await e.playCard(plant(e, FLURRY).uid, en.id);    // 9
    await e.endTurn();
    eq(sawAtTurnEnd, 15, 'the end-of-turn rule sweep saw the full turn total');
    eq(broke, 1, 'so the boss rule fired');
    eq(e.stats.damageDealtThisTurn, 0, 'and only then did the counter reset');
  });

  await atest('stats: turn/combat lifecycles are distinct, and mirror the actor counters', async () => {
    const e = mk({ enemies: [dummyEnemy({ hp: 200, damage: 5 })] });
    await e.startCombat();
    const en = e.enemies[0];
    e.player.energy = 9;
    await e.playCard(plant(e, SCRATCH).uid, en.id);
    eq(e.stats.damageDealtThisTurn, 6, 'turn counter');
    eq(e.stats.damageDealtThisCombat, 6, 'combat counter');

    await e.endTurn();
    eq(e.stats.damageDealtThisTurn, 0, 'the turn counter reset at the start of the new turn');
    eq(e.stats.damageDealtThisCombat, 6, 'the combat counter did NOT reset');
    eq(e.stats.damageTakenThisTurn, 0, 'damage taken during the enemy phase resets with the turn…');
    eq(e.stats.damageTakenLastEnemyTurn, 5, '…and is carried by damageTakenLastEnemyTurn instead');
    eq(e.stats.damageTakenThisCombat, 5, 'while the combat total keeps it');
    eq(e.stats.damageTakenThisCombat, e.player.maxHp - e.player.hp,
      'and agrees with the Courage the player has actually lost');
    eq(e.stats.turnsTaken, e.turn, 'turnsTaken tracks the turn number');

    // state exposes all of it to the renderer
    const st = e.state.stats;
    for (const k of STAT_CONTRACT) eq(typeof st[k], 'number', `state.stats.${k} reaches the renderer`);
  });


  // ══ ROUND 6 ═════════════════════════════════════════════════════════════

  await atest('trackers: a Companion\'s counters exist at combat start, before the first card', async () => {
    // The bug: installTrackers was only reached from U.ensure() inside a card
    // effect, so loose-bones did not exist on turn one and the HUD gauge had
    // nothing to show.
    let installedFor = null;
    const e = mk({ player: { companion: 'bones' } });
    e.player.companion = 'bones';
    e.setTrackerInstaller((engine, slug) => {
      installedFor = slug;
      engine.defineCounter({
        id: 'loose-bones', name: 'Loose Bones', min: 0, max: 6, start: 0,
        states: [{ at: 0, label: 'Whole' }, { from: 4, to: 6, label: 'Scattered' }],
      });
    });

    let counterAtFirstIntent = null;
    e.on('intent', () => { if (counterAtFirstIntent === null) counterAtFirstIntent = e.counters.has('loose-bones'); });

    await e.startCombat();
    eq(installedFor, 'bones', 'the engine installed the player Companion\'s trackers');
    eq(counterAtFirstIntent, true, 'and did it BEFORE the first intent was drawn');
    ok(e.counters.has('loose-bones'), 'the counter exists on turn one with no card played');
    eq(e.state.counters.find(c => c.id === 'loose-bones').value, 0, 'and the HUD can read it from state');
    deepEq(e.trackersInstalled, ['bones'], 'the engine records what it installed');
  });

  await atest('trackers: startCombat completes SYNCHRONOUSLY for callers that do not await', async () => {
    // Regression guard. Installing trackers behind an `await` moved the whole of
    // combat setup one microtask later, and every harness that calls
    // `engine.startCombat()` without awaiting (tests/seams/proof.js:50 among
    // them) got an empty opening hand. startCombat returns a Promise, but its
    // body must run to completion before it returns.
    const e = mk();
    e.startCombat();                              // deliberately NOT awaited
    eq(e.started, true, 'combat started before startCombat() returned');
    eq(e.piles.hand.length, 5, 'the opening hand is already dealt');
    eq(e.turn, 1, 'and we are on turn 1');
    ok(e.enemies.every(x => x.intent), 'intents are already drawn');
  });

  await atest('trackers: a missing installer warns loudly instead of failing silently', async () => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...a) => { warnings.push(a.join(' ')); };
    try {
      const e = mk();
      e.player.companion = 'nobody-registered-this';
      e.setTrackerInstaller(null);
      const { setTrackerInstaller } = await import('../../game/src/combat/engine.js');
      const saved = await import('../../game/src/combat/engine.js');
      // temporarily clear the shared installer so the warning path is reachable
      setTrackerInstaller(null);
      await e.startCombat();
      ok(warnings.some(w => /no tracker installer/.test(w)),
        'a Companion with no installer produces a warning, not silence');
      // restore for the tests that follow
      const util = await import('../../game/src/data/companions/_util.js');
      setTrackerInstaller(util.installTrackers);
      ok(saved, 'module handle held');
    } finally { console.warn = realWarn; }
  });

  await atest('trackers: a neutral deck installs nothing and still boots', async () => {
    let called = 0;
    const e = mk();
    e.setTrackerInstaller(() => { called++; });
    await e.startCombat();
    eq(called, 0, 'no Companion means no tracker install');
    eq(e.over, false, 'and combat started normally');
  });

  await atest('trackers: the real companion _util installs Bones\'s counter for real', async () => {
    // CONTRACTS rule 9 — across the seam, against the real module.
    let util = null;
    try { util = await import('../../game/src/data/companions/_util.js'); }
    catch (err) { ok(false, 'could not import the real _util: ' + (err?.message || err)); }
    if (!util) return;
    try { await import('../../game/src/data/companions/bones.js'); }
    catch (err) { ok(false, 'could not import bones.js: ' + (err?.message || err)); return; }
    // Explicit, so this test does not depend on an earlier one having warmed it.
    const { preloadCompanionTrackers } = await import('../../game/src/combat/engine.js');
    eq(await preloadCompanionTrackers(), true, 'the real installTrackers was registered with the engine');

    _resetUid(0);
    const e = new CombatEngine({
      rng: new RNG(4),
      player: { name: 'B', maxHp: 70, companion: 'bones', deck: makeDummyDeck() },
      enemies: [dummyEnemy({ move: 'nothing' })],
    });
    await e.startCombat();
    ok(e.counters.has('loose-bones'),
      'the real installTrackers ran from startCombat and defined loose-bones');
    const snap = e.state.counters.find(c => c.id === 'loose-bones');
    ok(snap, 'and it reaches state for the HUD gauge');
    eq(snap.value, 0, 'starting at 0');
  });

  // ── counter states ───────────────────────────────────────────────────────
  await atest('counters: declare their own named states so nobody parses desc', async () => {
    const e = mk();
    await e.startCombat();
    e.defineCounter({
      id: 'bones', name: 'Loose Bones', min: 0, max: 6, start: 0,
      desc: 'How much of Bones is currently detached.',
      states: [{ at: 0, label: 'Whole' }, { from: 4, to: 6, label: 'Scattered' }],
    });
    eq(e.counterState('bones'), 'Whole', '0 is Whole');
    e.addCounter('bones', 2);
    eq(e.counterState('bones'), null, '2 is in neither band, and says so rather than guessing');
    e.addCounter('bones', 2);
    eq(e.counterState('bones'), 'Scattered', '4 is Scattered');
    e.addCounter('bones', 2);
    eq(e.counterState('bones'), 'Scattered', 'and so is 6');

    const snap = e.state.counters.find(c => c.id === 'bones');
    eq(snap.state, 'Scattered', 'state carries the current label');
    eq(snap.states.length, 2, 'and the full band list, so the renderer can draw the track');
    deepEq(snap.states.map(x => x.label), ['Whole', 'Scattered'], 'in declaration order');

    let ev = null;
    e.on('counter', (x) => { ev = x; });
    e.addCounter('bones', -6);
    eq(ev.state, 'Whole', 'the counter event carries the new state');
    eq(ev.stateBefore, 'Scattered', 'and the old one, so a transition can be animated');

    // a counter with no states is unaffected
    e.defineCounter({ id: 'plain', name: 'Plain', max: 9, start: 3 });
    eq(e.counterState('plain'), null, 'a counter without states has none');
    deepEq(e.state.counters.find(c => c.id === 'plain').states, [], 'and an empty band list');

    // malformed entries are dropped, not thrown
    e.defineCounter({ id: 'messy', name: 'Messy', max: 9, states: [{ label: 'nope' }, null, { at: 1, label: 'One' }] });
    eq(e.counterDef('messy').states.length, 1, 'malformed bands are dropped rather than crashing the fight');
  });

  // ── intents: addsCards and rule ──────────────────────────────────────────
  await atest('intents: deck pollution is on the chip, resolved and counted', async () => {
    const CLUTTER = {
      id: 'clutter', name: 'Clutter', companion: 'status', type: CardType.STATUS,
      rarity: Rarity.SPECIAL, cost: 0, target: Target.NONE, exhaust: true,
      text: 'Does nothing.', effect() {},
    };
    // Pack Wrong's real shape: a DEBUFF intent whose only visible number was its Guard.
    const luggage = {
      id: 'test/luggage', name: 'Lost Luggage', region: 'test', tier: 'normal', hp: [40, 40],
      moves: {
        'pack-wrong': {
          id: 'pack-wrong', name: 'Pack Wrong', intent: Intent.DEBUFF, block: 5,
          addsCards: [{ id: 'clutter', pile: 'discard' }],
          // first use puts in two — the resolved count is what the chip must show
          addsCardsFn: (c) => [{ id: 'clutter', pile: 'discard', count: c.history.length === 0 ? 2 : 1 }],
          effect: (c) => { c.addCard('clutter', 'discard'); c.block(5); },
        },
      },
      nextMove: () => 'pack-wrong',
    };
    const e = mk({ enemies: [luggage] });
    e.registerCards([CLUTTER]);
    await e.startCombat();
    const it = e.enemies[0].intent;

    eq(it.block, 5, 'the Guard is still reported');
    eq(it.addsCards.length, 1, 'and so is the deck pollution, which used to be invisible');
    eq(it.addsCards[0].id, 'clutter', 'by id');
    eq(it.addsCards[0].name, 'Clutter', 'resolved to a display name through the card registry');
    eq(it.addsCards[0].pile, 'discard', 'with the destination pile');
    eq(it.addsCards[0].count, 2, 'and the RESOLVED count — 2 on its first use');
    ok(/2 Clutter/.test(it.tooltip), `the tooltip says it out loud: "${it.tooltip}"`);
    ok(/discard pile/.test(it.tooltip), 'including where they go');

    // static entries are grouped and counted too
    const twice = { ...luggage.moves['pack-wrong'], addsCardsFn: undefined,
      addsCards: [{ id: 'clutter', pile: 'discard' }, { id: 'clutter', pile: 'discard' }] };
    const it2 = buildIntent(e, e.enemies[0], { id: 'x', ...twice });
    eq(it2.addsCards[0].count, 2, 'two identical static entries collapse into a count of 2');

    // an unregistered card still names itself rather than vanishing
    const it3 = buildIntent(e, e.enemies[0], { id: 'y', intent: Intent.DEBUFF, addsCards: [{ id: 'mystery-goo' }] });
    eq(it3.addsCards[0].name, 'mystery-goo', 'an unknown card id falls back to the id');
    eq(it3.addsCards[0].pile, 'discard', 'and defaults to the discard pile');
  });

  await atest('intents: a House Rule intent names the actual rule', async () => {
    const greeter = {
      id: 'test/greeter', name: 'Door Greeter', region: 'test', tier: 'normal', hp: [40, 40],
      moves: {
        manners: {
          id: 'manners', name: 'Mind Your Manners', intent: Intent.DEBUFF,
          rule: 'no-running',
          effect: (c) => c.announceRule({
            id: 'no-running', name: 'NO RUNNING', text: 'Playing a fourth Trick this turn breaks the rule.',
            when: 'cardPlayed', once: true, broken: () => false, onBreak: () => {},
          }),
        },
      },
      nextMove: () => 'manners',
    };
    const e = mk({ enemies: [greeter] });
    await e.startCombat();
    let it = e.enemies[0].intent;
    ok(it.rule, 'the intent carries the rule instead of a bare DEBUFF with no magnitude');
    eq(it.rule.id, 'no-running', 'by id');
    eq(it.rule.name, 'NO RUNNING', 'humanised from the id before it has ever been announced');
    ok(/House Rule: NO RUNNING/.test(it.tooltip), `and the tooltip names it: "${it.tooltip}"`);

    // registering the real text makes the chip exact
    e.registerRules([{ id: 'no-running', name: 'NO RUNNING', text: 'Playing a fourth Trick this turn breaks the rule.' }]);
    e.refreshIntents('test');
    it = e.enemies[0].intent;
    eq(it.rule.text, 'Playing a fourth Trick this turn breaks the rule.', 'registered rules give the chip the real text');
    ok(/fourth Trick/.test(it.tooltip), 'which reaches the tooltip');

    // announcing seeds the registry too, so the next cycle is exact for free
    const e2 = mk({ enemies: [greeter] });
    await e2.startCombat();
    await e2.endTurn();
    eq(e2.resolveRule('no-running').text.length > 0, true, 'announceRule seeded the rule registry');

    // an alternating enemy names the one it is ACTUALLY about to announce
    const alt = {
      ...greeter,
      moves: { manners: { ...greeter.moves.manners,
        ruleFn: (c) => (c.history.length % 2 === 1
          ? { id: 'one-at-a-time', name: 'ONE AT A TIME', text: 'x' }
          : { id: 'no-running', name: 'NO RUNNING', text: 'y' }) } },
    };
    const e3 = mk({ enemies: [alt] });
    await e3.startCombat();
    eq(e3.enemies[0].intent.rule.id, 'no-running', 'first cycle');
    await e3.endTurn();
    eq(e3.enemies[0].intent.rule.id, 'one-at-a-time', 'second cycle names the other rule');
  });

  await atest('intents: addsCards and rule take part in change detection', async () => {
    let emitted = 0;
    const shifty = {
      id: 'test/shifty', name: 'Shifty', region: 'test', tier: 'normal', hp: [40, 40],
      moves: {
        pack: {
          id: 'pack', name: 'Pack', intent: Intent.DEBUFF,
          addsCardsFn: (c) => [{ id: 'clutter', pile: 'discard', count: (c.self.counters.n || 0) + 1 }],
          effect: () => {},
        },
      },
      nextMove: () => 'pack',
    };
    const e = mk({ enemies: [shifty] });
    await e.startCombat();
    e.on('intent', () => emitted++);
    eq(e.enemies[0].intent.addsCards[0].count, 1, 'baseline');
    e.enemies[0].counters.n = 2;
    e.refreshIntents('test');
    eq(e.enemies[0].intent.addsCards[0].count, 3, 'the count re-rendered');
    ok(emitted >= 1, 'and an intent event told the renderer, because addsCards is part of sameIntent');
    const before = emitted;
    e.refreshIntents('test');
    eq(emitted, before, 'an unchanged intent still emits nothing');
  });

  // ── retain contract ──────────────────────────────────────────────────────
  await atest('retain: the engine never empties the hand — retained Tricks persist across the boundary', async () => {
    // The renderer was calling hand.discardAll() at turn:end and nothing put the
    // retained cards back. The engine's contract is that the hand is ADDED to at
    // turn start, never rebuilt, so this states it explicitly.
    const e = mk({ enemies: [dummyEnemy({ move: 'nothing' })], drawPerTurn: 5 });
    await e.startCombat();
    const kept = plant(e, { ...CURL_UP, id: 'x/keeper', retain: true });
    const doomed = plant(e, SCRATCH);

    await e.endTurn();

    const hand = e.state.piles.hand;
    ok(hand.some(c => c.uid === kept.uid), 'the retained Trick is still in state.piles.hand next turn');
    ok(!hand.some(c => c.uid === doomed.uid), 'the un-retained one is not');
    eq(hand.length, e.player.drawPerTurn + 1, 'the new hand is the fresh draw PLUS what was retained');
    eq(kept.pile, Pile.HAND, 'and it never left the hand pile');

    let cleared = 0;
    e.on('discard', (ev) => { if (ev.cardUid === kept.uid) cleared++; });
    await e.endTurn();
    eq(cleared, 0, 'a retained Trick is never discarded, so no discard event is emitted for it');
    ok(e.state.piles.hand.some(c => c.uid === kept.uid), 'and it is still there a second turn later');
  });

  // ── the REAL Butler, not a stand-in ───────────────────────────────────────
  // Everything above tests the rules ENGINE against a hand-written boss. These
  // run the shipped `data/bosses/butler.js`, because the bug that motivated
  // them was in the def, not the engine: it declared `onTurnEnd` twice, and in
  // a JS object literal the second key silently replaces the first. The half
  // that closes the Discomposed window was dead for the whole build — and
  // `discomposed` is `decay: 'never'`, so he stayed Discomposed forever the
  // first time a player earned it: permanently taking 25% more, and
  // permanently unable to announce another House Rule, which shuts down the
  // Flustered economy the entire boss is built on. `tests/dup-keys/check.py`
  // gates the class; these two assert the behaviour.

  async function butlerFight(seed = 11) {
    const { butler } = await import('../../game/src/data/bosses/butler.js');
    const e = mk({ enemies: [butler], maxHp: 200, seed });
    await loadContentRegistries(e);
    await e.startCombat();
    return { butler, e, b: e.enemies[0] };
  }
  /** Break one of his rules, without caring which — the count is the point. */
  const breakRule = (butler, e, b) =>
    butler.onRuleBroken(e.enemyCtx(b, null, { rule: { id: 'test-rule' }, aimAt: e.player }));

  await atest('butler: Discomposed opens for one player turn and then closes', async () => {
    const { butler, e, b } = await butlerFight(11);
    b.counters.flustered = butler.flusterThreshold(e.enemyCtx(b, null)) - 1;
    breakRule(butler, e, b);
    ok(b.hasStatus('discomposed'), 'the last Flustered made him Discomposed');
    ok(b.mem.collectHimself, 'and his next action is spent collecting himself');
    eq(e.rules.length, 0, 'his standing House Rule was cleared');

    // He still swings the move he had already telegraphed; Collect Himself is
    // the turn after, and THAT is what opens the window the player is promised.
    let guard = 0;
    while (!b.history.includes('collect-himself') && guard++ < 6) await e.endTurn();
    ok(b.history.includes('collect-himself'), 'he spent a turn putting himself back together');
    ok(b.hasStatus('discomposed'), 'the window is open across the player turn that follows');
    await e.endTurn();                       // the player has now had that whole turn
    ok(!b.hasStatus('discomposed'), 'and it closes on his next turn — exactly one turn wide');
  });

  await atest('butler: once the window closes he can hold a House Rule again', async () => {
    const { butler, e, b } = await butlerFight(13);
    b.counters.flustered = butler.flusterThreshold(e.enemyCtx(b, null)) - 1;
    breakRule(butler, e, b);
    let guard = 0;
    while (!b.history.includes('collect-himself') && guard++ < 6) await e.endTurn();
    await e.endTurn();
    ok(!b.hasStatus('discomposed'), 'the window closed');
    butler.announceNext(e.enemyCtx(b, null));
    eq(e.rules.length, 1, 'and the fight has an economy again — he is enforcing something');
  });

  await atest('butler: one Flustered per round, however many rules you break', async () => {
    const { butler, e, b } = await butlerFight(17);
    b.counters.flustered = 0;
    breakRule(butler, e, b);
    breakRule(butler, e, b);
    breakRule(butler, e, b);
    eq(b.counters.flustered, 1, 'three broken rules in one turn are still one Flustered');
    await e.endTurn();
    breakRule(butler, e, b);
    eq(b.counters.flustered, 2, 'and the next round can earn another');
  });

  await atest('butler: the solo Flustered thresholds are the printed 3, then 2', async () => {
    const { butler, e, b } = await butlerFight(19);
    const c = () => e.enemyCtx(b, null);
    eq(butler.flusterThreshold(c()), 3, 'phase one: three Flustered');
    b.mem.phase = 2;
    eq(butler.flusterThreshold(c()), 2, 'phase two: two');
  });

  // ── the REAL Governess: Stitched Together ─────────────────────────────────
  // `governess.redirect()` and `governess.modifyIncoming()` were def methods
  // that nothing in the engine ever called, and `governess.doll()` looked up
  // `a.id === 'favorite-doll'` when an actor's `id` is its board slot (`e1`).
  // The result: 30 damage aimed at her landed 30 on her and 0 on the Doll, Mend
  // My Darling was never selected once in a full simulated fight, and the
  // phase-two Repair Patch counter finished on 0. Her whole defensive design
  // was decoration. These assert the mechanic, not the absence of a throw.

  async function govFight(seed = 21, hp = 400) {
    const { governess, favoriteDoll } = await import('../../game/src/data/bosses/governess.js');
    // `mk` defaults hp to 60 whatever maxHp says, and a 12-turn boss test that
    // quietly ends on turn 3 proves nothing at all.
    const e = mk({ enemies: [governess, favoriteDoll], maxHp: hp, hp, seed });
    await loadContentRegistries(e);
    await e.startCombat();
    return {
      governess, e,
      gov: e.enemies.find(x => x.defId === 'governess'),
      doll: e.enemies.find(x => x.defId === 'favorite-doll'),
    };
  }
  const hit = (e, foe, n) => {
    const before = foe.hp;
    e.dealDamage({ attacker: e.player, defender: foe, amount: n, kind: 'attack' });
    return before - foe.hp;
  };

  await atest('governess: Favorite Doll eats the first 10 damage of the turn', async () => {
    const { e, gov, doll } = await govFight(21);
    ok(!!doll, 'the Doll is on the board');
    const dollBefore = doll.hp;
    const took = hit(e, gov, 30);
    eq(dollBefore - doll.hp, 10, 'the Doll took the first 10');
    eq(took, 30 - 10 - gov.block, 'and she took the rest');
  });

  await atest('governess: the allowance runs out — the second swing reaches her', async () => {
    const { e, gov, doll } = await govFight(23);
    hit(e, gov, 30);
    const dollBefore = doll.hp;
    const govBefore = gov.hp;
    e.dealDamage({ attacker: e.player, defender: gov, amount: 30, kind: 'attack' });
    eq(doll.hp, dollBefore, 'the Doll absorbed nothing more this turn');
    ok(govBefore - gov.hp > 20, 'she took the swing herself');
  });

  await atest('governess: the allowance comes back next round', async () => {
    const { e, gov, doll } = await govFight(25);
    hit(e, gov, 30);
    await e.endTurn();
    const dollBefore = doll.hp;
    hit(e, gov, 30);
    eq(dollBefore - doll.hp, 10, 'a fresh 10 goes into the Doll');
  });

  await atest('governess: tearing the Doll opens a window, then she mends it', async () => {
    const { governess, e, gov, doll } = await govFight(27);
    e.dealDamage({ attacker: e.player, defender: doll, amount: 999, kind: 'attack' });
    ok(doll.mem.torn, 'the Doll is Torn');
    eq(governess.canMend(e.enemyCtx(gov, null)), false, 'she cannot mend it on the turn it tore');

    const dollBefore = doll.hp;
    hit(e, gov, 30);
    eq(doll.hp, dollBefore, 'a Torn Doll absorbs nothing — that is the window');

    let guard = 0;
    while (!gov.history.includes('mend-my-darling') && guard++ < 12 && !e.over) await e.endTurn();
    ok(gov.history.includes('mend-my-darling'), 'she spends a turn putting the Doll back together');
    ok(!doll.mem.torn, 'and it is whole again');
    ok(doll.hp > 0, 'with Courage on it');
  });

  await atest('governess: the phase-two Repair Patch cycle actually turns over', async () => {
    const { e, gov } = await govFight(29, 900);
    // Down to the transition, then stop hitting her — the point is her cycle,
    // not how fast she dies.
    let guard = 0;
    while (gov.mem.phase !== 2 && guard++ < 30 && !e.over) {
      // ignoreBlock so the setup is not a second test of her Guard.
      if (gov.hp > 95) {
        e.dealDamage({ attacker: e.player, defender: gov, amount: 30, kind: 'attack', ignoreBlock: true });
      }
      await e.endTurn();
    }
    eq(gov.mem.phase, 2, 'she reached phase two');
    const seen = new Set();
    for (let i = 0; i < 6 && !e.over; i++) {
      seen.add(gov.counters['repair-patch']);
      await e.endTurn();
    }
    ok(seen.size >= 2, `the Patch counter moves (saw ${[...seen].join(',')}) — it used to sit on 0 forever`);
  });

  // ── report ---------------------------------------------------------------
  let passed = 0, failed = 0;
  for (const r of results) {
    for (const a of r.asserts) (a.pass ? passed++ : failed++);
    if (r.error) failed++;
  }
  return { results, passed, failed };
}
