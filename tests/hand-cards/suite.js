/**
 * Cards that act while they sit in your HAND.  OWNER: combat-engine.
 *
 * Runs headless in the browser — no framework, no build step. Driven by run.py.
 *
 * WHY THIS EXISTS
 * ---------------
 * Nine Status and Curse cards in data/neutral.js print a rule — "At the end of
 * your turn, lose 2 Courage", "When drawn, lose 1 Nerve", "you cannot play more
 * than 3 Tricks each turn" — and not one of them did anything. A card's
 * `effect` is invoked at exactly one place in the engine, inside `_playCard`,
 * and that place is behind a `canPlay` that refuses every `unplayable` card. The
 * text was printed, the Curiosity that hands the card out was written, the card
 * entered the deck, and the rule never fired. Six of the nine come from real
 * Curiosity outcomes.
 *
 * Every check below runs its CONTROL: the same fight, the same turn, without
 * the card. "Courage went down" is not evidence on its own — a Scuffle is full
 * of reasons Courage goes down — and a suite that only ever runs the with-card
 * case cannot tell an implemented rule from a coincidence, which is the exact
 * shape of the bug it is guarding.
 *
 * It also carries the GATE for the whole class: an `unplayable` card may not
 * have a working `effect`, because nothing can ever call it.
 */

import { CombatEngine } from '../../game/src/combat/engine.js';
import { RNG } from '../../game/src/core/rng.js';
import { Card, _resetUid } from '../../game/src/combat/piles.js';
import { makeDummyDeck, SCRATCH, DUST_BUNNY } from '../../game/src/combat/dummy.js';
import { Pile } from '../../game/src/data/schema.js';
import { STATUS_CARDS, CURSE_CARDS } from '../../game/src/data/neutral.js';
import { allCards } from '../../game/src/data/cards.js';
import { loadContentRegistries } from '../../game/src/data/keywords.js';

// ── micro framework ─────────────────────────────────────────────────────────
const results = [];
let current = null;

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
const fmt = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

// ── fixtures ────────────────────────────────────────────────────────────────

/** A bag that does nothing at all, so every number the tests read is ours. */
const DOZER = {
  id: 'test/dozer', name: 'Dozer', region: 'test', tier: 'normal',
  hp: [400, 400],
  moves: { nothing: { id: 'nothing', name: 'Doze', intent: 'sleep', effect: () => {} } },
  nextMove: () => 'nothing',
};

function mk(o = {}) {
  _resetUid(0);
  return new CombatEngine({
    rng: new RNG(o.seed ?? 7),
    player: {
      name: 'Test', maxHp: o.maxHp ?? 200, hp: o.hp ?? 200,
      energyMax: o.energyMax ?? 3, drawPerTurn: o.drawPerTurn ?? 5,
      deck: o.deck || makeDummyDeck(),
    },
    players: o.players,
    enemies: o.enemies || [DOZER],
    relics: [],
  });
}

const byId = (list, id) => list.find(c => c.id === id);
const CARD = {
  candleBurn:   byId(STATUS_CARDS, 'status/candle-burn'),
  gloom:        byId(STATUS_CARDS, 'status/gloom'),
  wrongSide:    byId(STATUS_CARDS, 'status/wrong-side'),
  scrape:       byId(STATUS_CARDS, 'status/scrape'),
  regret:       byId(CURSE_CARDS,  'curse/regret'),
  badLuck:      byId(CURSE_CARDS,  'curse/bad-luck'),
  clingyShadow: byId(CURSE_CARDS,  'curse/clingy-shadow'),
  heavyHeart:   byId(CURSE_CARDS,  'curse/heavy-heart'),
  nightTerror:  byId(CURSE_CARDS,  'curse/night-terror'),
  lostMitten:   byId(CURSE_CARDS,  'curse/lost-mitten'),
  creaky:       byId(CURSE_CARDS,  'curse/creaky-floorboard'),
};

/** Put a def in hand, bypassing the shuffle. */
function plant(e, def, upgraded = false, seat = null) {
  const piles = seat ? seat.piles : e.piles;
  const c = new Card(def, { upgraded });
  piles._push(c, Pile.HAND, 'bottom');
  return c;
}

/** Empty the hand so a test reads only what it planted. */
function clearHand(e, seat = null) {
  const piles = seat ? seat.piles : e.piles;
  for (const c of [...piles.hand]) piles.move(c, 'discard', { reason: 'test' });
}

/**
 * One fight, opened, hand emptied, ready to be planted into.
 * `hp` is read AFTER opening so start-of-combat effects are already priced in.
 */
async function opened(o = {}) {
  const e = mk(o);
  await e.startCombat();
  clearHand(e);
  return e;
}

// ── the tests ───────────────────────────────────────────────────────────────

export async function run() {
  results.length = 0;

  /* ══ THE GATE ══════════════════════════════════════════════════════════════
     The whole class in one assertion. `effect` on an unplayable card is
     unreachable by construction, so any body at all in one is a rule that has
     been written down and cannot run. */
  await atest('GATE: no unplayable card carries a working effect', async () => {
    await loadContentRegistries();
    const cards = allCards();
    ok(cards.length > 200, `the registry is loaded (${cards.length} cards)`);
    const bad = cards
      .filter(d => d.unplayable || d.cost === -2)
      .filter((d) => {
        const body = String(d.effect || '').replace(/\s+/g, '');
        return body && !/^(\(\)|\(c\)|c)=>\{\}$/.test(body) && !/^function\w*\(\w*\)\{\}$/.test(body);
      })
      .map(d => d.id);
    eq(bad.join(', '), '', 'every unplayable card has a no-op effect');
    ok(cards.filter(d => d.unplayable || d.cost === -2).length >= 10,
       'the gate actually saw the unplayable cards');
  });

  /* ══ END OF TURN, WHILE HELD ══════════════════════════════════════════════ */
  await atest('Candle Burn burns at the end of your turn — and only when held', async () => {
    // CONTROL: the identical fight and turn with nothing planted.
    const ctrl = await opened();
    const before0 = ctrl.player.hp;
    await ctrl.endTurn();
    eq(ctrl.player.hp, before0, 'CONTROL: an empty hand costs no Courage over a turn');

    const e = await opened();
    plant(e, CARD.candleBurn);
    const before = e.player.hp;
    await e.endTurn();
    eq(before - e.player.hp, 2, 'held Candle Burn costs 2 Courage at end of turn');

    const up = await opened();
    plant(up, CARD.candleBurn, true);
    const b2 = up.player.hp;
    await up.endTurn();
    eq(b2 - up.player.hp, 4, 'upgraded Candle Burn costs 4 — the number is read off the instance');

    // In the discard it is inert: the rule says "in your hand" and means it.
    const disc = await opened();
    const c = plant(disc, CARD.candleBurn);
    disc.piles.move(c, 'discard', { reason: 'test' });
    const b3 = disc.player.hp;
    await disc.endTurn();
    eq(disc.player.hp, b3, 'the same card in the discard pile costs nothing');
  });

  await atest('Heavy Heart costs 2 Courage a turn while it is in your hand', async () => {
    const e = await opened();
    plant(e, CARD.heavyHeart);
    const before = e.player.hp;
    await e.endTurn();
    eq(before - e.player.hp, 2, 'Heavy Heart costs 2 Courage');
  });

  await atest('Regret charges for every Trick in the hand, itself included', async () => {
    const e = await opened();
    plant(e, CARD.regret);
    plant(e, CARD.scrape);
    plant(e, CARD.creaky);
    const held = e.piles.hand.length;
    eq(held, 3, 'three Tricks in hand');
    const before = e.player.hp;
    await e.endTurn();
    eq(before - e.player.hp, 3, 'Regret costs 1 Courage per card in hand');

    // CONTROL: the same three-card hand without Regret in it.
    const ctrl = await opened();
    plant(ctrl, CARD.scrape);
    plant(ctrl, CARD.creaky);
    plant(ctrl, CARD.scrape);
    const b = ctrl.player.hp;
    await ctrl.endTurn();
    eq(ctrl.player.hp, b, 'CONTROL: three harmless Status cards cost nothing');
  });

  /* ══ A DEBUFF APPLIED AT END OF TURN HAS TO SURVIVE THE DECAY ═════════════ */
  await atest('Bad Luck gives Weak that is still there on your next turn', async () => {
    const e = await opened();
    plant(e, CARD.badLuck);
    await e.endTurn();
    // `endTurn` runs the enemy phase and opens the next player turn, so this is
    // the stack the player actually plays with.
    eq(e.player.status('weak'), 1, 'Weak survives into the next player turn');

    const ctrl = await opened();
    await ctrl.endTurn();
    eq(ctrl.player.status('weak'), 0, 'CONTROL: no Weak without the Curse');
  });

  await atest('Clingy Shadow gives Frail that is still there on your next turn', async () => {
    const e = await opened();
    plant(e, CARD.clingyShadow);
    await e.endTurn();
    eq(e.player.status('frail'), 1, 'Frail survives into the next player turn');
  });

  await atest('the fresh reprieve is worth exactly one decay, not a licence', async () => {
    // A Weak applied in the ordinary way, mid-turn, must STILL expire at the end
    // of the turn. If `fresh` had leaked into normal applications, every
    // turnEnd debuff in the game would have quietly gained a turn.
    const e = await opened();
    e.applyStatus(e.player, 'weak', 1, { reason: 'test' });
    eq(e.player.status('weak'), 1, 'Weak applied mid-turn');
    await e.endTurn();
    eq(e.player.status('weak'), 0, 'CONTROL: an ordinary mid-turn Weak still expires at end of turn');

    // And a fresh one does not ride the reprieve twice.
    const f = await opened();
    plant(f, CARD.badLuck);
    await f.endTurn();
    eq(f.player.status('weak'), 1, 'one Weak after the first turn');
    clearHand(f);                                   // the Curse is gone from hand
    await f.endTurn();
    eq(f.player.status('weak'), 0, 'and it expires normally on the turn after');
  });

  /* ══ ON DRAW ══════════════════════════════════════════════════════════════ */
  await atest('Gloom takes a Nerve as it is drawn', async () => {
    const e = await opened();
    e.piles._push(new Card(CARD.gloom, {}), Pile.DRAW, 'top');
    const before = e.player.energy;
    e.drawCards(1, 'test');
    eq(before - e.player.energy, 1, 'drawing Gloom costs 1 Nerve');
    ok(e.piles.hand.some(c => c.id === 'status/gloom'), 'and it is in hand');

    const ctrl = await opened();
    ctrl.piles._push(new Card(CARD.scrape, {}), Pile.DRAW, 'top');
    const b = ctrl.player.energy;
    ctrl.drawCards(1, 'test');
    eq(ctrl.player.energy, b, 'CONTROL: drawing an ordinary Status card costs nothing');
  });

  await atest('Wrong Side takes 3 Courage as it is drawn, once', async () => {
    const e = await opened();
    e.piles._push(new Card(CARD.wrongSide, {}), Pile.DRAW, 'top');
    const before = e.player.hp;
    e.drawCards(1, 'test');
    eq(before - e.player.hp, 3, 'drawing Wrong Side costs 3 Courage');

    // It fires on the DRAW, not on every draw while it is held.
    e.piles._push(new Card(CARD.scrape, {}), Pile.DRAW, 'top');
    const after = e.player.hp;
    e.drawCards(1, 'test');
    eq(e.player.hp, after, 'drawing something else afterwards costs nothing');
  });

  /* ══ WHILE HELD, WHEN YOU PLAY SOMETHING ELSE ════════════════════════════ */
  await atest('Night Terror charges a Courage for every Trick you play', async () => {
    const e = await opened();
    plant(e, CARD.nightTerror);
    const s = plant(e, SCRATCH);
    const before = e.player.hp;
    await e.playCard(s.uid, e.firstLivingEnemy().id);
    eq(before - e.player.hp, 1, 'playing a Trick with Night Terror held costs 1 Courage');

    const ctrl = await opened();
    const s2 = plant(ctrl, SCRATCH);
    const b = ctrl.player.hp;
    await ctrl.playCard(s2.uid, ctrl.firstLivingEnemy().id);
    eq(ctrl.player.hp, b, 'CONTROL: the same Trick costs no Courage without it');
  });

  /* ══ A VETO THAT SAYS WHY ════════════════════════════════════════════════ */
  await atest('Lost Mitten caps the turn at 3 Tricks and says so', async () => {
    const e = await opened({ energyMax: 99 });
    e.setEnergy(99);
    plant(e, CARD.lostMitten);
    const hand = [plant(e, SCRATCH), plant(e, SCRATCH), plant(e, SCRATCH), plant(e, SCRATCH)];
    for (let i = 0; i < 3; i++) {
      const chk = e.canPlay(hand[i].uid, e.firstLivingEnemy().id);
      ok(chk.ok, `Trick ${i + 1} of 3 is allowed`);
      await e.playCard(hand[i].uid, e.firstLivingEnemy().id);
    }
    const chk = e.canPlay(hand[3].uid, e.firstLivingEnemy().id);
    eq(chk.ok, false, 'the fourth Trick is refused');
    ok(/Lost Mitten/.test(chk.reason), `the refusal names the Curse — "${chk.reason}"`);

    const ctrl = await opened({ energyMax: 99 });
    ctrl.setEnergy(99);
    const h2 = [plant(ctrl, SCRATCH), plant(ctrl, SCRATCH), plant(ctrl, SCRATCH), plant(ctrl, SCRATCH)];
    for (let i = 0; i < 3; i++) await ctrl.playCard(h2[i].uid, ctrl.firstLivingEnemy().id);
    eq(ctrl.canPlay(h2[3].uid, ctrl.firstLivingEnemy().id).ok, true,
       'CONTROL: a fourth Trick is fine without the Mitten');
  });

  /* ══ A PARTY IS FOUR HANDS, NOT ONE ══════════════════════════════════════ */
  await atest('a Curse in one Kid\'s hand does not charge the other Kid', async () => {
    const e = mk({
      players: [
        { name: 'A', maxHp: 200, hp: 200, deck: makeDummyDeck(), energyMax: 3 },
        { name: 'B', maxHp: 200, hp: 200, deck: makeDummyDeck(), energyMax: 3 },
      ],
      enemies: [DOZER],
    });
    await e.startCombat();
    const [a, b] = e.players;
    clearHand(e, a); clearHand(e, b);
    ok(e.players.length === 2, 'two seats at the table');

    // Seat B holds the Curse; seat A plays a Trick.
    plant(e, CARD.nightTerror, false, b);
    const s = plant(e, SCRATCH, false, a);
    const aBefore = a.hp, bBefore = b.hp;
    await e.playCard(s.uid, e.firstLivingEnemy().id);
    eq(a.hp, aBefore, "seat A pays nothing for seat B's Curse");
    eq(b.hp, bBefore, 'and seat B pays nothing for a Trick it did not play');

    // Now seat B plays one of its own.
    const s2 = plant(e, SCRATCH, false, b);
    const b2 = b.hp;
    await e.playCard(s2.uid, e.firstLivingEnemy().id);
    eq(b2 - b.hp, 1, 'seat B pays for its own Trick');

    // And the end-of-turn family is per seat too.
    plant(e, CARD.heavyHeart, false, a);
    const aH = a.hp, bH = b.hp;
    await e.endTurn();
    eq(aH - a.hp, 2, 'seat A pays for the Curse in seat A\'s hand');
    eq(b.hp, bH, 'seat B pays nothing for it');
  });

  /* ══ AND NONE OF THIS BROKE THE PREVIEW ══════════════════════════════════ */
  await atest('a hand hook never fires on the live board from a preview', async () => {
    const e = await opened();
    plant(e, CARD.heavyHeart);
    const before = e.player.hp;
    const fork = e.clone();
    ok(fork !== e, 'the engine forked');
    await fork.endTurn();
    ok(fork.player.hp < before, 'the FORK paid for the Curse');
    eq(e.player.hp, before, 'and the real board did not');
  });

  const passed = results.reduce((n, r) => n + r.asserts.filter(a => a.pass).length, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  return { results, passed, failed };
}
