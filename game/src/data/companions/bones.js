/**
 * Bones, the Skeleton Puppy.  OWNER: companion-cards.
 * Spec: docs/design/companions/05-bones.md
 *
 * Loose Bones · Rattle · Fetch / Slobbered · Bury / Dig Up · Spare Bone
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE, SPECIAL } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE, RANDOM_ENEMY } = Target;
const SLUG = 'bones';
const N = U.N;
const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── mechanic helpers ────────────────────────────────────────────────────────
const BONES = 'loose-bones';
const loose = (c) => U.res(c, BONES);
const isWhole = (c) => loose(c) === 0;
const scatterAt = (c) => (U.stacks(c, c.self, 'anatomy-optional') > 0 ? 2 : 4);
const isScattered = (c) => loose(c) >= scatterAt(c);

/** A Rattle happens whenever the number actually changes. */
function rattle(c) { U.bump(c, 'rattles'); U.fire(c, 'rattle', {}); }
function shed(c, n) {
  if (n <= 0) return 0;
  const wasScattered = isScattered(c);
  let d = U.addRes(c, BONES, n, 0, 6);
  if (d === 0 && U.stacks(c, c.self, 'bones/built-wrong') > 0 && U.once(c, 'builtWrong')) {
    U.addRes(c, BONES, -1, 0, 6); rattle(c);
    d = U.addRes(c, BONES, n, 0, 6);
  }
  if (d > 0) { rattle(c); if (!wasScattered && isScattered(c)) U.fire(c, 'becameScattered', {}); }
  return d;
}
function reattach(c, n) {
  if (n <= 0) return 0;
  const d = -U.addRes(c, BONES, -n, 0, 6);
  if (d > 0) { U.bump(c, 'reattached', d); rattle(c); if (isWhole(c)) U.fire(c, 'becameWhole', {}); }
  return d;
}
const canFetch = (k) => k && !U.flag(k, 'slobbered');
/** Fetch: pull a Trick out of the discard pile. It becomes Slobbered. */
async function fetch(c, filter, prompt = 'Fetch a Trick') {
  const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt, filter: (x) => canFetch(x) && (!filter || filter(x)) });
  if (!k) return null;
  U.toHand(c, k);
  U.setFlag(k, 'slobbered', true);
  U.bump(c, 'retrieved'); U.bump(c, 'fetched');
  U.fire(c, 'fetch', { card: k });
  return k;
}
/** Bury: into the stash zone with counters that tick down at the start of your turn. */
function bury(c, k, counters = 2) {
  if (!k) return null;
  let n = counters;
  if (counters === 2 && U.stacks(c, c.self, 'bones/yard-map') > 0 && U.got(c, 'buriedThisTurn') < U.stacks(c, c.self, 'bones/yard-map')) n = 1;
  U.bump(c, 'buriedThisTurn');
  U.setCounter(k, 'buried', n);
  U.moveCard(c, k, 'stash', { buried: true });
  U.fire(c, 'bury', { card: k });
  return k;
}
const buriedCards = (c) => U.cardsIn(c, 'stash').filter(k => U.counter(k, 'buried') > 0);
function digUp(c, k) {
  if (!k) return null;
  U.setCounter(k, 'buried', 0);
  U.setFlag(k, 'dugUp', true);
  U.toHand(c, k);
  U.bump(c, 'retrieved'); U.bump(c, 'dugUp');
  U.fire(c, 'digUp', { card: k });
  return k;
}
function unslobber(c, k) { if (k) { U.clearFlag(k, 'slobbered'); U.setFlag(k, 'noFetchUntilNextTurn', true); } }
function power(c, id, n, install) {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
}

// ── Spare Bone ──────────────────────────────────────────────────────────────
const SPARE_BONE = {
  id: 'bones/spare-bone', name: 'Spare Bone', companion: SLUG, type: SKILL, rarity: SPECIAL,
  cost: 0, target: SELF, exhaust: true, ethereal: true, keywords: ['shed', 'reattach', 'vanish'],
  text: 'Choose one: [Shed] {n} Bone, or [Reattach] {n} Bone. [Vanish].',
  flavor: 'It is a bone. It is spare. He is very clear about this.',
  nums: { n: 1 },
  effect: eff(c => U.chooseOne(c, [
    { label: 'Shed 1', fn: (x) => shed(x, N(x).n) },
    { label: 'Reattach 1', fn: (x) => reattach(x, N(x).n) },
  ])),
  upgrade: { nums: { n: 2 } },
};
const spawnSpare = (c, n) => { for (let i = 0; i < n; i++) U.spawn(c, SPARE_BONE, 'hand', { temporary: true }); };

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: 'loose-bones', name: 'Loose Bones', icon: 'loose-bones', desc: 'How much of Bones is currently detached. Whole at 0, Scattered at 4 or more.', min: 0, max: 6, start: 0 },
  ]);
  // Player turn start ONLY: the raw event also fires for every enemy, which
  // made the Buried countdown tick two or three times a round.
  U.onPlayerTurn(e, 'start', () => {
    s.played = 0;
    const c = U.trackerCtx(e, seat);
    for (const k of U.cardsIn(c, 'stash')) {
      if (U.counter(k, 'buried') > 0) {
        U.addCounter(k, 'buried', -1);
        if (U.counter(k, 'buried') === 0) digUp(c, k);
      }
      U.clearFlag(k, 'noFetchUntilNextTurn');
    }
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('rattle', 'bones/rattletrap', (c) => { if (U.once(c, 'rattletrap')) U.hitAll(c, 5 + (U.stacks(c, c.self, 'bones/rattletrap') - 1) * 3); });
/**
 * Tail a Mile a Minute: the first Attack after a Fetch or a Dig Up each turn is
 * Empowered. Scales by stacks the same way Rattletrap does, because a second
 * copy of a Power has to be worth something.
 */
const tailAMile = (c) => {
  if (!U.once(c, 'tailAMileAMinute')) return;
  U.empower(c, 7 + (U.stacks(c, c.self, 'bones/tail-a-mile-a-minute') - 1) * 3);
};
U.onHook('fetch', 'bones/tail-a-mile-a-minute', tailAMile);
/**
 * `digUp`, not `dugUp`. TRAP 10 AGAIN, ON THE SAME CARD.
 *
 * This Power shipped with an empty handler on `retrieved`, a hook nothing
 * fires, and was repaired by listening on `dugUp` — which IS fired, but only by
 * the two multiplayer Pack Stash cards at the bottom of this file. `digUp()`,
 * the ordinary Dig Up every solo player uses, has always fired `digUp`, and so
 * does Pudding. So half of a card that says "after Fetching or Digging Up" was
 * still dead, in solo, where nearly every game of this is played.
 *
 * `hook-names` could not see it: both spellings were declared somewhere and
 * fired somewhere, so the registry balanced. Only playing a Dig Up and looking
 * at the Attack afterwards finds it — `tests/bones/run.py` now does.
 *
 * One name now. The two co-op cards fire `digUp` like everything else.
 */
U.onHook('digUp', 'bones/tail-a-mile-a-minute', tailAMile);
U.onHook('fetch', 'bones/scent-memory', (c) => { if (U.once(c, 'scentMemory')) U.draw(c, U.stacks(c, c.self, 'bones/scent-memory')); });
U.onHook('becameScattered', 'bones/spare-parts-everywhere', (c) => { if (U.once(c, 'sparePartsEverywhere')) spawnSpare(c, U.stacks(c, c.self, 'bones/spare-parts-everywhere')); });
U.onHook('becameWhole', 'bones/tighten-the-collar', (c) => {
  if (!U.once(c, 'tightenCollar')) return;
  const n = U.stacks(c, c.self, 'bones/tighten-the-collar');
  U.nextTurn(c, (x) => U.energy(x, n));
});
U.onHook('digUp', 'bones/treasure-yard', (c) => {
  const cap = 1 + U.stacks(c, c.self, 'bones/treasure-yard');
  if (U.got(c, 'treasureYard') < cap) { U.bump(c, 'treasureYard'); U.energy(c, 1); }
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'bones/bite', name: 'Bite', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'No lips, no gums, tremendous enthusiasm.',
    nums: { d: 6 }, effect: eff(c => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'bones/sit-pretty', name: 'Sit Pretty', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['whole'],
    text: 'Gain {b} Guard. Gain {m0} more while [Whole].',
    flavor: 'A skeleton sitting up straight is somehow more polite than a dog.',
    nums: { b: 5, m0: 3 },
    effect: eff(c => U.guard(c, N(c).b + (isWhole(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 7, m0: 4 } },
  },
  {
    id: 'bones/shake-boy', name: 'Shake, Boy!', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 0, target: SELF, keywords: ['shed'],
    text: '[Shed] {m0} Bone. Draw {n} Trick.',
    flavor: 'Something always comes off. That is the trick.',
    nums: { m0: 1, n: 1 },
    effect: eff(c => { shed(c, N(c).m0); U.draw(c, N(c).n); }),
    upgrade: { nums: { m0: 1, n: 2 } },
  },
  {
    id: 'bones/put-yourself-back-together', name: 'Put Yourself Back Together', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['reattach'],
    text: '[Reattach] up to {n} Bones. Gain {b} Guard for each. If you have none, gain {m0} Guard instead.',
    flavor: 'Left hip. No — other left hip.',
    nums: { n: 2, b: 4, m0: 6 },
    effect: eff(c => { const d = reattach(c, Math.min(N(c).n, loose(c))); U.guard(c, d > 0 ? d * N(c).b : N(c).m0); }),
    upgrade: { nums: { n: 2, b: 6, m0: 8 } },
  },
  {
    id: 'bones/go-get-it', name: 'Go Get It!', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: NONE, keywords: ['fetch', 'slobbered'],
    text: '[Fetch] a non-[Slobbered] Trick with printed cost {n} or less.',
    flavor: 'He has already gone. He went before you finished saying it.',
    nums: { n: 1 },
    effect: eff(c => fetch(c, (k) => U.printedCost(k) <= N(c).n)),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'bones/rib-rattle', name: 'Rib Rattle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage. [Shed] {n} Bone.',
    flavor: 'Xylophone technique, wolf intent.',
    nums: { d: 8, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); shed(c, N(c).n); }),
    upgrade: { nums: { d: 11, n: 1 } },
  },
  {
    id: 'bones/tailbone-thump', name: 'Tailbone Thump', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['whole'],
    text: 'Deal {d} damage. If [Whole], gain {b} Guard.',
    flavor: 'The tail is nine small bones and one enormous mood.',
    nums: { d: 7, b: 5 },
    effect: eff(c => { U.hit(c, N(c).d); if (isWhole(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 10, b: 6 } },
  },
  {
    id: 'bones/clatter-pounce', name: 'Clatter Pounce', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['scattered'],
    text: 'Deal {d} damage to all enemies. Deal {m0} more while [Scattered].',
    flavor: 'Arrives as several separate sounds.',
    nums: { d: 5, m0: 4 },
    effect: eff(c => U.hitAll(c, N(c).d + (isScattered(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 7, m0: 5 } },
  },
  {
    id: 'bones/skull-boop', name: 'Skull Boop', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['reattach'],
    text: 'Deal {d} damage. If you [Reattach]ed a Bone this turn, deal {m0} more.',
    flavor: 'Affectionate. Structurally alarming.',
    nums: { d: 8, m0: 5 },
    effect: eff(c => U.hit(c, N(c).d + (U.got(c, 'reattached') > 0 ? N(c).m0 : 0))),
    upgrade: { nums: { d: 11, m0: 6 } },
  },
  {
    id: 'bones/bone-toss', name: 'Bone Toss', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['reattach', 'empowered'],
    text: 'Deal {d} damage. You may [Reattach] {m0} Bone. If you do, your next Trick this turn is [Empowered] {n}.',
    flavor: 'He throws it for himself. He also fetches it for himself.',
    nums: { d: 7, m0: 1, n: 3 },
    effect: eff(c => { U.hit(c, N(c).d); if (reattach(c, N(c).m0) > 0) U.empower(c, N(c).n); }),
    upgrade: { nums: { d: 10, m0: 1, n: 4 } },
  },
  {
    id: 'bones/digging-claws', name: 'Digging Claws', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bury'],
    text: 'Deal {d} damage {n} times. Deal one more hit if you have a [Buried] Trick.',
    flavor: 'The rug is not going to survive this either.',
    nums: { d: 4, n: 2, hits: 2 },
    effect: eff(c => U.hitN(c, N(c).d, N(c).n + (buriedCards(c).length ? 1 : 0))),
    upgrade: { nums: { d: 6, n: 2, hits: 2 } },
  },
  {
    id: 'bones/full-body-tackle', name: 'Full Body Tackle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['scattered', 'shed'],
    text: 'Cannot be played while [Scattered]. Deal {d} damage, then [Shed] {n} Bones.',
    flavor: 'Every single piece of him arrives at the same time and place.',
    nums: { d: 16, n: 2 },
    effect: eff(c => { U.hit(c, N(c).d); shed(c, N(c).n); }),
    playable: (c) => loose(c) < 4,
    upgrade: { nums: { d: 21, n: 2 } },
  },
  {
    id: 'bones/run-in-circles', name: 'Run in Circles', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['rattle'],
    text: 'Deal {d} damage. If you have [Rattle]d this turn, draw {n} Trick, then discard {m0} Trick.',
    flavor: 'Nine laps of the parlour, minimum.',
    nums: { d: 4, n: 1, m0: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.got(c, 'rattles') > 0) { U.draw(c, N(c).n); c.discard(N(c).m0, { choose: true }); } }),
    upgrade: { nums: { d: 6, n: 1, m0: 1 } },
  },
  {
    id: 'bones/shake-it-loose', name: 'Shake It Loose', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['shed'],
    text: '[Shed] {m0} Bone. The next Trick you play this turn costs {n} less.',
    flavor: 'A full-body shake with one predictable consequence and one useful one.',
    nums: { m0: 1, n: 1 },
    effect: eff(c => { shed(c, N(c).m0); U.applySelf(c, 'next-trick-discount', N(c).n); }),
    upgrade: { nums: { m0: 1, n: 1, m1: 1 }, text: '[Shed] {m0} Bone. The next Trick you play this turn costs {n} less. Draw {m1} Trick.' },
  },
  {
    id: 'bones/sit-stay', name: 'Sit, Stay', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['retain'],
    text: 'Gain {b} Guard. [Retain] this Trick.',
    flavor: 'He will stay. He will stay for as long as it takes.',
    nums: { b: 7 },
    effect: eff(c => { U.guard(c, N(c).b); U.retain(c, c.card); }),
    upgrade: { nums: { b: 10 } },
  },
  {
    id: 'bones/reassemble', name: 'Reassemble', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['reattach'],
    text: '[Reattach] up to {n} Bones. Gain {b} Guard for each Bone Reattached.',
    flavor: 'Click. Click. Nearly.',
    nums: { n: 2, b: 5 },
    effect: eff(c => U.guard(c, reattach(c, Math.min(N(c).n, loose(c))) * N(c).b)),
    upgrade: { nums: { n: 2, b: 7 } },
  },
  {
    id: 'bones/fetch', name: 'Fetch!', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['fetch', 'slobbered', 'shed'],
    text: '[Shed] {m0} Bone, then [Fetch] a non-[Slobbered] Trick with printed cost {n} or less.',
    flavor: 'The single greatest word in the language. He leaves a rib behind on the way out.',
    nums: { n: 1, m0: 1 },
    effect: eff(async c => { shed(c, N(c).m0); await fetch(c, (k) => U.printedCost(k) <= N(c).n); }),
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'bones/bury-it', name: 'Bury It', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['bury'],
    text: '[Bury] another Trick from your hand. Draw {n} Trick.',
    flavor: 'For later. For definitely later.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury a Trick' }); bury(c, k); U.draw(c, N(c).n); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/dig-here', name: 'Dig Here', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['dig-up', 'bury'],
    text: '[Dig Up] one [Buried] Trick. If you have none, gain {b} Guard instead.',
    flavor: 'He is certain. He is always certain.',
    nums: { b: 9 },
    effect: eff(async c => { const pool = buriedCards(c); if (!pool.length) { U.guard(c, N(c).b); return; } const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Dig Up', filter: (x) => U.counter(x, 'buried') > 0 }); digUp(c, k); }),
    upgrade: { nums: { b: 13 } },
  },
  {
    id: 'bones/leave-it', name: 'Leave It!', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['slobbered'],
    text: 'Discard another Trick. Gain {b} Guard if it was [Slobbered], otherwise {m0}.',
    flavor: 'He does not leave it. He never leaves it. But he considers leaving it.',
    nums: { b: 10, m0: 4 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Discard a Trick' }); if (!k) return; const sl = U.flag(k, 'slobbered'); U.moveCard(c, k, 'discard'); U.guard(c, sl ? N(c).b : N(c).m0); }),
    upgrade: { nums: { b: 14, m0: 6 } },
  },
  {
    id: 'bones/sniff-around', name: 'Sniff Around', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE,
    text: 'Look at the top {n} Tricks of your draw pile. Put one into your hand, discard one, and return the rest to the top.',
    flavor: 'Ninety percent of a dog is nose and the rest is optimism.',
    nums: { n: 3 },
    effect: eff(async c => {
      const top = U.cardsIn(c, 'draw').slice(0, N(c).n);
      if (!top.length) return;
      const [keep] = await U.pickCards(c, { pile: 'draw', count: 1, prompt: 'Take into hand', filter: (k) => top.includes(k) });
      if (keep) U.toHand(c, keep);
      const rest = top.filter(k => k !== keep);
      if (rest.length) U.moveCard(c, rest[0], 'discard');
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'bones/under-the-couch', name: 'Under the Couch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bury', 'dug-up'],
    text: '[Bury] another Trick from your hand. Gain {b} Guard. The first time that Trick is played after being [Dug Up], it costs {n} less.',
    flavor: 'Along with two socks, a spoon, and something that was once a biscuit.',
    nums: { b: 10, n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury a Trick' }); if (k) { bury(c, k); U.setFlag(k, 'digDiscount', N(c).n); } U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 14, n: 1 } },
  },
  {
    id: 'bones/spare-parts', name: 'Spare Parts', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, text: 'Create {n} Spare Bones in your hand.',
    flavor: 'Not his. Probably not his.',
    nums: { n: 2 }, effect: eff(c => spawnSpare(c, N(c).n)), upgrade: { nums: { n: 3 } },
  },
  {
    id: 'bones/shake-dry', name: 'Shake Dry', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['slobbered', 'fetch'],
    text: 'Choose a [Slobbered] Trick in your discard pile. Remove Slobbered and put it on the bottom of your draw pile. It cannot be [Fetch]ed until your next turn.',
    flavor: 'Everyone in the room is now slightly damp.',
    nums: {},
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Un-Slobber a Trick', filter: (x) => U.flag(x, 'slobbered') }); if (k) { unslobber(c, k); U.toDrawBottom(c, k); } }),
    upgrade: { cost: 0 },
  },
  {
    id: 'bones/good-dog', name: 'Good Dog', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['fetch', 'dig-up', 'reattach'],
    text: 'Gain {b} Guard. If you [Fetch]ed or [Dug Up] a Trick this turn, [Reattach] {n} Bone.',
    flavor: 'He knows. He absolutely knows.',
    nums: { b: 7, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); if (U.got(c, 'retrieved') > 0) reattach(c, N(c).n); }),
    upgrade: { nums: { b: 10, n: 1 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (12) ──────────────────────────────────────────────────────────
  {
    id: 'bones/flying-femur', name: 'Flying Femur', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['fetch'],
    text: 'Deal {d} damage. If this Trick was [Fetch]ed since it was last played, deal {d} again.',
    flavor: 'It goes further than a bone has any right to.',
    nums: { d: 8, hits: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.flag(c.card, 'slobbered')) U.hit(c, N(c).d); U.clearFlag(c.card, 'slobbered'); }),
    upgrade: { nums: { d: 11, hits: 1 } },
  },
  {
    id: 'bones/dug-up-dinner', name: 'Dug Up Dinner', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['dug-up', 'reattach'],
    text: 'Deal {d} damage. If this Trick is [Dug Up], deal {m0} more and [Reattach] {n} Bone.',
    flavor: 'Vintage. Aged. Absolutely still good.',
    nums: { d: 8, m0: 6, n: 1 },
    effect: eff(c => { const dug = U.flag(c.card, 'dugUp'); U.hit(c, N(c).d + (dug ? N(c).m0 : 0)); if (dug) { reattach(c, N(c).n); U.clearFlag(c.card, 'dugUp'); } }),
    upgrade: { nums: { d: 11, m0: 8, n: 1 } },
  },
  {
    id: 'bones/scattershot-skeleton', name: 'Scattershot Skeleton', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['loose-bones'],
    text: 'Deal {d} damage to all enemies. Then deal {m0} damage to a random enemy for each [Loose Bones], up to {n} hits.',
    flavor: 'He does not aim so much as distribute.',
    nums: { d: 9, m0: 3, n: 6 },
    effect: eff(c => { U.hitAll(c, N(c).d); U.hitRandomN(c, N(c).m0, Math.min(N(c).n, loose(c))); }),
    upgrade: { nums: { d: 12, m0: 4, n: 6 } },
  },
  {
    id: 'bones/boomerang-bone', name: 'Boomerang Bone', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['slobbered'],
    text: 'Deal {d} damage. The first time you play this while it is not [Slobbered], return it to your hand and make it Slobbered.',
    flavor: 'It comes back. It always comes back. That is the entire feature.',
    nums: { d: 9 },
    effect: eff(c => { U.hit(c, N(c).d); if (!U.flag(c.card, 'slobbered')) { U.setFlag(c.card, 'slobbered', true); U.returnSelf(c); } }),
    upgrade: { nums: { d: 12 } },
  },
  {
    id: 'bones/heel', name: 'Heel!', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['reattach', 'whole'],
    text: 'Deal {d} damage and [Reattach] {n} Bone. If this makes you [Whole], repeat the attack.',
    flavor: 'He does come back. Eventually. Mostly.',
    nums: { d: 8, n: 1, hits: 1 },
    effect: eff(c => { U.hit(c, N(c).d); const had = loose(c); reattach(c, N(c).n); if (had > 0 && isWhole(c)) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 11, n: 1, hits: 1 } },
  },
  {
    id: 'bones/off-leash', name: 'Off Leash', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['rattle'],
    text: 'Deal {d} damage, plus one more hit for each [Rattle] this turn, up to {n} extra hits.',
    flavor: 'The lead is on the floor. The dog is on the ceiling.',
    nums: { d: 4, n: 4, hits: 3 },
    effect: eff(c => U.hitN(c, N(c).d, 1 + Math.min(N(c).n, U.got(c, 'rattles')))),
    upgrade: { nums: { d: 6, n: 4, hits: 3 } },
  },
  {
    id: 'bones/missing-piece-missile', name: 'Missing Piece Missile', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['reattach'],
    text: '[Reattach] {n} Bone as an additional cost. Deal {d} damage.',
    flavor: 'One rib, delivered at speed, with feeling.',
    nums: { d: 8, n: 1 },
    effect: eff(c => { if (reattach(c, N(c).n) > 0) U.hit(c, N(c).d); }),
    playable: (c) => loose(c) >= 1,
    upgrade: { nums: { d: 12, n: 1 } },
  },
  {
    id: 'bones/jawbone-jamboree', name: 'Jawbone Jamboree', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['shed', 'scattered'],
    text: 'Deal {d} damage, then [Shed] {n} Bones. If this makes you [Scattered], deal {m0} damage to all other enemies.',
    flavor: 'The jaw keeps going after the rest of him stops.',
    nums: { d: 18, n: 2, m0: 7 },
    effect: eff(c => { U.hit(c, N(c).d); const was = isScattered(c); shed(c, N(c).n); if (!was && isScattered(c)) for (const t of U.others(c)) U.hitAt(c, t, N(c).m0); }),
    upgrade: { nums: { d: 23, n: 2, m0: 9 } },
  },
  {
    id: 'bones/excavation-frenzy', name: 'Excavation Frenzy', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['bury'],
    text: 'Deal {d} damage, plus {m0} for each [Buried] Trick, up to {n} extra hits.',
    flavor: 'The lawn is a crime scene and he is the perpetrator.',
    nums: { d: 15, m0: 6, n: 3 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).m0, Math.min(N(c).n, buriedCards(c).length)); }),
    upgrade: { nums: { d: 19, m0: 7, n: 3 } },
  },
  {
    id: 'bones/toss-and-chase', name: 'Toss and Chase', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['slobbered', 'fetch'],
    text: 'Deal {d} damage. Put a non-[Slobbered] Trick from your discard pile on top of your draw pile. This is not [Fetch]ing.',
    flavor: 'He is both the thrower and the retriever and he is losing at both.',
    nums: { d: 8 },
    effect: eff(async c => { U.hit(c, N(c).d); const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Put on top of draw', filter: canFetch }); U.toDrawTop(c, k); }),
    upgrade: { nums: { d: 11 } },
  },
  {
    id: 'bones/good-as-new', name: 'Good as New', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['whole'],
    text: 'Deal {d} damage. If [Whole], deal {m0} instead.',
    flavor: 'Every bone accounted for and extremely pleased about it.',
    nums: { d: 12, m0: 28 },
    effect: eff(c => U.hit(c, isWhole(c) ? N(c).m0 : N(c).d)),
    upgrade: { nums: { d: 15, m0: 34 } },
  },
  {
    id: 'bones/take-me-apart', name: 'Take Me Apart', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage. You may [Shed] up to {n} Bones. Deal {m0} more for each Bone actually Shed.',
    flavor: 'He volunteers. Every time, he volunteers.',
    nums: { d: 7, n: 2, m0: 5 },
    effect: eff(c => { U.hit(c, N(c).d); const s = shed(c, N(c).n); U.hitN(c, N(c).m0, s); }),
    upgrade: { nums: { d: 10, n: 2, m0: 6 } },
  },

  // ── Skills (17) ───────────────────────────────────────────────────────────
  {
    id: 'bones/roll-over', name: 'Roll Over', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loose-bones', 'rattle'],
    text: 'Set your [Loose Bones] to exactly {n}, [Shed]ing or [Reattach]ing as needed. Gain {b} Guard.',
    flavor: 'Whatever state he was in, he is now in the middle of it.',
    nums: { n: 3, b: 8 },
    effect: eff(c => { const cur = loose(c); if (cur < N(c).n) shed(c, N(c).n - cur); else if (cur > N(c).n) reattach(c, cur - N(c).n); U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 3, b: 11 } },
  },
  {
    id: 'bones/call-that-back', name: 'Call That Back', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['fetch', 'slobbered'],
    text: '[Fetch] any non-[Slobbered] Trick. If its printed cost is {m0} or more, it costs {n} less this turn.',
    flavor: 'One whistle and the expensive one comes running.',
    nums: { n: 1, m0: 2 },
    effect: eff(async c => { const k = await fetch(c, null, 'Fetch any Trick'); if (k && U.printedCost(k) >= N(c).m0) U.costMod(c, k, -N(c).n, 'turn'); }),
    upgrade: { cost: 0, nums: { n: 1, m0: 2 } },
  },
  {
    id: 'bones/scent-trail', name: 'Scent Trail', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['slobbered'],
    text: 'Choose up to {n} non-[Slobbered] Tricks in your discard pile. Put one on top of your draw pile and the other on the bottom.',
    flavor: 'He has an entire map of this house and none of it is visual.',
    nums: { n: 2 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'discard', count: N(c).n, prompt: 'Order two Tricks', filter: canFetch, optional: true }); if (ks[0]) U.toDrawTop(c, ks[0]); if (ks[1]) U.toDrawBottom(c, ks[1]); }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'bones/backyard-cache', name: 'Backyard Cache', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['bury'],
    text: '[Bury] up to {n} other Tricks from your hand. Draw {m0} Trick for each.',
    flavor: 'A filing system with soil in it.',
    nums: { n: 2, m0: 1 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'hand', count: N(c).n, prompt: 'Bury Tricks', optional: true }); for (const k of ks) { bury(c, k); U.draw(c, N(c).m0); } }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'bones/dig-like-crazy', name: 'Dig Like Crazy', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['dig-up'],
    text: '[Dig Up] up to {n} Tricks, then discard {m0} Trick.',
    flavor: 'Soil everywhere. Regret nowhere.',
    nums: { n: 2, m0: 1 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'stash', count: N(c).n, prompt: 'Dig Up', filter: (x) => U.counter(x, 'buried') > 0, optional: true }); for (const k of ks) digUp(c, k); c.discard(N(c).m0, { choose: true }); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'bones/bury-the-evidence', name: 'Bury the Evidence', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['slobbered', 'bury'],
    text: 'Choose a [Slobbered] Trick in your discard pile. Remove Slobbered and [Bury] it with {n} counters.',
    flavor: 'What the family does not know cannot upset the family.',
    nums: { n: 2 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Bury a Slobbered Trick', filter: (x) => U.flag(x, 'slobbered') }); if (k) { U.clearFlag(k, 'slobbered'); bury(c, k, N(c).n); } }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'bones/wet-dog-shake', name: 'Wet Dog Shake', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['slobbered', 'shed'],
    text: 'Remove [Slobbered] from up to {n} Tricks in your discard pile and shuffle them into your draw pile. [Shed] {m0} Bone.',
    flavor: 'Somewhere between a spin cycle and a small weather event.',
    nums: { n: 2, m0: 1 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'discard', count: N(c).n, prompt: 'Clean off', filter: (x) => U.flag(x, 'slobbered'), optional: true }); for (const k of ks) { unslobber(c, k); U.moveCard(c, k, 'draw', { shuffle: true }); } shed(c, N(c).m0); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'bones/pile-of-me', name: 'Pile of Me', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loose-bones', 'reattach'],
    text: 'Gain {b} Guard for each [Loose Bones], then [Reattach] all of them.',
    flavor: 'A heap of dog. Briefly.',
    nums: { b: 6 },
    effect: eff(c => { const n = loose(c); U.guard(c, n * N(c).b); reattach(c, n); }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'bones/emergency-reassembly', name: 'Emergency Reassembly', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['scattered', 'reattach', 'vanish'],
    text: 'Playable only while [Scattered]. [Reattach] {n} Bones and gain {b} Guard. [Vanish].',
    flavor: 'Adrenaline, but for a dog with no adrenal glands.',
    nums: { n: 2, b: 10 },
    effect: eff(c => { reattach(c, N(c).n); U.guard(c, N(c).b); }),
    playable: (c) => isScattered(c),
    upgrade: { nums: { n: 2, b: 15 } },
  },
  {
    id: 'bones/flop-over', name: 'Flop Over', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['scattered', 'retain'],
    text: 'Gain {b} Guard. If [Scattered], gain {m0} instead and [Retain] one other Trick this turn.',
    flavor: 'Structural collapse as a defensive strategy.',
    nums: { b: 5, m0: 10 },
    effect: eff(async c => { if (isScattered(c)) { U.guard(c, N(c).m0); const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Retain a Trick' }); U.retain(c, k); } else U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 7, m0: 13 } },
  },
  {
    id: 'bones/smell-something', name: 'Smell Something?', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['bury', 'dig-up'],
    text: 'Look at the top {n} Tricks of your draw pile and [Bury] one with {m0} counter. It is [Dig Up]ped at the start of your next turn.',
    flavor: 'He does. He always does. And then he hides it.',
    nums: { n: 5, m0: 1 },
    effect: eff(async c => {
      const top = U.cardsIn(c, 'draw').slice(0, N(c).n);
      if (!top.length) return;
      const [pick] = await U.pickCards(c, { pile: 'draw', count: 1, prompt: 'Bury one of these', filter: (k) => top.includes(k) });
      bury(c, pick, N(c).m0);
    }),
    upgrade: { nums: { n: 7, m0: 1 } },
  },
  {
    id: 'bones/treat-stash', name: 'Treat Stash', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bury', 'dig-up', 'vanish'],
    text: '[Bury] this Trick with {n} counter. When it is [Dug Up], gain {m0} Nerve, draw {m1} Trick, then [Vanish] it.',
    flavor: 'Three biscuits and a chicken bone under the third floorboard.',
    nums: { n: 1, m0: 2, m1: 1 },
    effect: eff(c => { bury(c, c.card, N(c).n); U.setFlag(c.card, 'treatStash', true); }),
    upgrade: { nums: { n: 1, m0: 2, m1: 2 } },
  },
  {
    id: 'bones/cant-reach-it', name: 'Can’t Reach It', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['fetch'],
    text: 'Discard another Trick. Gain {b} Guard for each point of its printed cost. If you [Fetch] it this turn, it costs {n} less.',
    flavor: 'It is four centimetres away and it may as well be the moon.',
    nums: { b: 5, n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Discard a Trick' }); if (!k) return; U.moveCard(c, k, 'discard'); U.guard(c, Math.max(0, U.printedCost(k)) * N(c).b); U.setFlag(k, 'fetchDiscount', N(c).n); }),
    upgrade: { nums: { b: 7, n: 1 } },
  },
  {
    id: 'bones/skeleton-key', name: 'Skeleton Key', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['dig-up', 'bury'],
    text: '[Dig Up] a [Buried] Trick. If you have none, [Bury] another Trick from your hand with {n} counter instead.',
    flavor: 'It is not a key. It is a key-shaped bone. It works anyway.',
    nums: { n: 1 },
    effect: eff(async c => {
      const pool = buriedCards(c);
      if (pool.length) { const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Dig Up', filter: (x) => U.counter(x, 'buried') > 0 }); digUp(c, k); }
      else { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury a Trick' }); bury(c, k, N(c).n); }
    }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'bones/stash-under-the-rug', name: 'Stash Under the Rug', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, exhaust: true, keywords: ['bury', 'vanish'],
    text: '[Bury] another Trick with {n} counter. Draw {m0} Trick. [Vanish].',
    flavor: 'Technically indoors. Technically still burying.',
    nums: { n: 1, m0: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Bury a Trick' }); bury(c, k, N(c).n); U.draw(c, N(c).m0); }),
    upgrade: { nums: { n: 1, m0: 2 } },
  },
  {
    id: 'bones/good-boy', name: 'Good Boy!', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['fetch', 'dig-up', 'vanish'],
    text: 'Playable only if you [Fetch]ed or [Dug Up] a Trick this turn. Gain {n} Nerve. [Vanish].',
    flavor: 'The tail alone generates most of the energy.',
    nums: { n: 1 },
    effect: eff(c => U.energy(c, N(c).n)),
    playable: (c) => U.got(c, 'retrieved') > 0,
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/jingle-collar', name: 'Jingle Collar', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shed', 'reattach', 'rattle'],
    text: 'Playable only with {n} or fewer [Loose Bones]. [Shed] {m0} Bone, then [Reattach] {m0} Bone. These are separate effects and cause two [Rattle]s.',
    flavor: 'The tag says BONES. It is the only part of him that is not bone.',
    nums: { n: 5, m0: 1 },
    effect: eff(c => { shed(c, N(c).m0); reattach(c, N(c).m0); }),
    playable: (c) => loose(c) <= 5,
    upgrade: { cost: 0, nums: { n: 5, m0: 1 } },
  },

  // ── Powers (6) ────────────────────────────────────────────────────────────
  {
    id: 'bones/rattletrap', name: 'Rattletrap', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['rattle'],
    text: 'The first time you [Rattle] each turn, deal {d} damage to all enemies.',
    flavor: 'The noise is the weapon. The dog is the delivery mechanism.',
    nums: { d: 5 },
    effect: eff(c => power(c, 'bones/rattletrap', 1)),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'bones/scent-memory', name: 'Scent Memory', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fetch'],
    text: 'The first time you [Fetch] each turn, draw {n} Trick.',
    flavor: 'He remembers every single thing he has ever put in his mouth.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'bones/scent-memory', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/yard-map', name: 'Yard Map', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bury'],
    text: 'The first {m0} Tricks you [Bury] each turn receive only {n} counter instead of 2.',
    flavor: 'X, X, X, and a fourth X he refuses to explain.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => power(c, 'bones/yard-map', 1)),
    upgrade: { nums: { n: 1, m0: 2 } },
  },
  {
    id: 'bones/spare-parts-everywhere', name: 'Spare Parts Everywhere', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['scattered'],
    text: 'The first time each turn you become [Scattered], create {n} Spare Bone.',
    flavor: 'The house is now, in a real sense, partly dog.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'bones/spare-parts-everywhere', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/tighten-the-collar', name: 'Tighten the Collar', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['whole'],
    text: 'The first time each turn you become [Whole], gain {n} Nerve at the start of your next turn.',
    flavor: 'One notch. Everything stays where it belongs.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'bones/tighten-the-collar', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/tail-a-mile-a-minute', name: 'Tail Going A Mile A Minute', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fetch', 'dig-up', 'empowered'],
    text: 'The first Attack you play after [Fetch]ing or [Dig Up]ping each turn is [Empowered] {n}.',
    flavor: 'Nine tail bones at approximately forty hertz.',
    nums: { n: 7 },
    // This Power did NOTHING. It registered an EMPTY handler on 'retrieved', a
    // hook name nothing in the game fires — so the card was a Rare that cost 1
    // Nerve and had no effect whatsoever. Found by tests/hook-names/check.py.
    // The hooks Bones actually fires are 'fetch' and 'digUp'; the wiring is
    // module-scope below, next to the other Bones Powers.
    effect: eff(c => power(c, 'bones/tail-a-mile-a-minute', 1)),
    upgrade: { nums: { n: 10 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ───────────────────────────────────────────────────────────
  {
    id: 'bones/every-bone-at-once', name: 'Every Bone at Once', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['whole', 'shed'],
    text: 'Playable only while [Whole]. Deal {d} damage to all enemies, then [Shed] {n} Bones.',
    flavor: 'Two hundred and six projectiles, one dog, no plan for afterwards.',
    nums: { d: 30, n: 6 },
    effect: eff(c => { U.hitAll(c, N(c).d); shed(c, N(c).n); }),
    playable: (c) => isWhole(c),
    upgrade: { nums: { d: 38, n: 6 } },
  },
  {
    id: 'bones/bone-a-fide-missile', name: 'Bone A Fide Missile', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['reattach', 'whole'],
    text: '[Reattach] any number of Bones as an additional cost, minimum {n}. Deal {d} damage, plus {m0} for each Bone Reattached. If this makes you [Whole], draw {m1} Trick.',
    flavor: 'Reassembly, weaponised.',
    nums: { d: 8, m0: 6, n: 1, m1: 1 },
    effect: eff(c => { const r = reattach(c, loose(c)); if (r < N(c).n) return; U.hit(c, N(c).d); U.hitN(c, N(c).m0, r); if (isWhole(c)) U.draw(c, N(c).m1); }),
    playable: (c) => loose(c) >= 1,
    upgrade: { nums: { d: 11, m0: 7, n: 1, m1: 1 } },
  },
  {
    id: 'bones/fetch-the-moon', name: 'Fetch the Moon', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['fetch'],
    text: 'Deal {d} damage. Whenever this Trick is [Fetch]ed, it costs {n} for that turn.',
    flavor: 'It is very far away and he is very committed.',
    nums: { d: 32, n: 0 },
    effect: eff(c => U.hit(c, N(c).d)),
    upgrade: { nums: { d: 40, n: 0 } },
  },
  {
    id: 'bones/buried-bite', name: 'Buried Bite', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['bury', 'dig-up'],
    text: 'Deal {d} damage, then [Bury] this Trick with {n} counter instead of discarding it. Each time it is [Dug Up], it permanently gains a {m0} damage hit this combat.',
    flavor: 'It gets worse every time it comes back up. So does the smell.',
    nums: { d: 9, n: 1, m0: 5 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).m0, U.counter(c.card, 'buriedBite')); if (U.flag(c.card, 'dugUp')) { U.addCounter(c.card, 'buriedBite', 1); U.clearFlag(c.card, 'dugUp'); } bury(c, c.card, N(c).n); }),
    upgrade: { nums: { d: 12, n: 1, m0: 6 } },
  },
  {
    id: 'bones/skeleton-stampede', name: 'Skeleton Stampede', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['rattle'],
    text: 'Deal {d} damage to all enemies, then repeat once for each [Rattle] this turn, up to {n} repeats.',
    flavor: 'It sounds like a cutlery drawer falling down the stairs, forever.',
    nums: { d: 6, n: 5, hits: 3 },
    effect: eff(c => U.hitAllN(c, N(c).d, 1 + Math.min(N(c).n, U.got(c, 'rattles')))),
    upgrade: { nums: { d: 8, n: 5, hits: 3 } },
  },
  {
    id: 'bones/dogpile-of-one', name: 'Dogpile of One', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['fetch', 'dig-up'],
    text: 'Deal {d} damage, plus {m0} for each Trick you [Fetch]ed or [Dug Up] this turn, up to {n} extra hits.',
    flavor: 'One dog. Many dogs. It depends how you count.',
    nums: { d: 18, m0: 6, n: 4 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).m0, Math.min(N(c).n, U.got(c, 'retrieved'))); }),
    upgrade: { nums: { d: 23, m0: 7, n: 4 } },
  },
  {
    id: 'bones/headless-rush', name: 'Headless Rush', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['shed', 'scattered', 'slobbered'],
    text: 'Deal {d} damage and [Shed] {n} Bone. The first time each turn this makes you [Scattered], return it to your hand, make it [Slobbered], and it costs {m0} for the rest of the turn.',
    flavor: 'He does not need it for this part.',
    nums: { d: 14, n: 1, m0: 0 },
    effect: eff(c => {
      U.hit(c, N(c).d);
      const was = isScattered(c); shed(c, N(c).n);
      if (!was && isScattered(c) && U.once(c, 'headlessRush')) { U.setFlag(c.card, 'slobbered', true); U.costSet(c, c.card, N(c).m0, 'turn'); U.returnSelf(c); }
    }),
    upgrade: { nums: { d: 18, n: 1, m0: 0 } },
  },
  {
    id: 'bones/dig-up-a-fight', name: 'Dig Up a Fight', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['bury', 'dig-up'],
    text: 'Deal {d} damage {n} times. Reduce one [Buried] Trick’s counter by 1. If that [Dig Up]s it, deal {m0} more and it costs {m1} less this turn.',
    flavor: 'He was digging for a bone. He found an argument.',
    nums: { d: 9, n: 2, hits: 2, m0: 14, m1: 1 },
    effect: eff(async c => {
      U.hitN(c, N(c).d, N(c).n);
      const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Hurry a Buried Trick', filter: (x) => U.counter(x, 'buried') > 0 });
      if (!k) return;
      U.addCounter(k, 'buried', -1);
      if (U.counter(k, 'buried') === 0) { digUp(c, k); U.hit(c, N(c).m0); U.costMod(c, k, -N(c).m1, 'turn'); }
    }),
    upgrade: { nums: { d: 12, n: 2, hits: 2, m0: 17, m1: 1 } },
  },

  // ── Skills (10) ───────────────────────────────────────────────────────────
  {
    id: 'bones/perfect-fetch', name: 'Perfect Fetch', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, exhaust: true, keywords: ['fetch', 'slobbered', 'vanish'],
    text: '[Fetch] up to {n} non-[Slobbered] Tricks with different printed costs. Each costs {m0} less this turn. [Vanish].',
    flavor: 'Three at once, in his mouth, all the way back, without dropping any.',
    nums: { n: 3, m0: 1 },
    effect: eff(async c => {
      const used = new Set();
      for (let i = 0; i < N(c).n; i++) {
        const k = await fetch(c, (x) => !used.has(U.printedCost(x)), 'Fetch a Trick');
        if (!k) break;
        used.add(U.printedCost(k)); U.costMod(c, k, -N(c).m0, 'turn');
      }
    }),
    upgrade: { cost: 1, nums: { n: 3, m0: 1 } },
  },
  {
    id: 'bones/no-the-other-bone', name: 'No, the Other Bone', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['slobbered'],
    text: 'Choose another Trick in your hand and a non-[Slobbered] Trick in your discard pile. Exchange their locations. The one entering your hand becomes [Slobbered].',
    flavor: 'That one. No, that one. No — that one.',
    nums: {},
    effect: eff(async c => {
      const [a] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Send to discard' });
      const [b] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Bring to hand', filter: canFetch });
      if (a) U.moveCard(c, a, 'discard');
      if (b) { U.toHand(c, b); U.setFlag(b, 'slobbered', true); U.bump(c, 'retrieved'); }
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'bones/who-buried-that', name: 'Who Buried That?', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['bury'],
    text: 'Search your draw pile for any Trick and [Bury] it with {n} counter, then shuffle your draw pile.',
    flavor: 'He is asking sincerely. He genuinely does not remember.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'draw', count: 1, prompt: 'Bury from the draw pile' }); bury(c, k, N(c).n); U.reshuffle(c); }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'bones/shake-everything-off', name: 'Shake Everything Off', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, exhaust: true, keywords: ['slobbered', 'fetch', 'vanish'],
    text: 'Remove [Slobbered] from up to {n} Tricks in your discard pile and shuffle them into your draw pile. They cannot be [Fetch]ed until your next turn. Draw {m0} Trick. [Vanish].',
    flavor: 'The dog resets. The room does not.',
    nums: { n: 3, m0: 1 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'discard', count: N(c).n, prompt: 'Clean off', filter: (x) => U.flag(x, 'slobbered'), optional: true }); for (const k of ks) { unslobber(c, k); U.moveCard(c, k, 'draw', { shuffle: true }); } U.draw(c, N(c).m0); }),
    upgrade: { nums: { n: 4, m0: 2 } },
  },
  {
    id: 'bones/secret-stash', name: 'Secret Stash', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['bury', 'dug-up'],
    text: '[Bury] any number of other Tricks from your hand, then draw that many. The first time each is played after being [Dug Up], it costs {n}.',
    flavor: 'Under the third stair. Do not tell the cat.',
    nums: { n: 0 },
    effect: eff(async c => {
      const ks = await U.pickCards(c, { pile: 'hand', count: 99, prompt: 'Bury any number', optional: true });
      for (const k of ks) { bury(c, k); U.setFlag(k, 'digFree', true); }
      U.draw(c, ks.length);
    }),
    upgrade: { cost: 1, nums: { n: 0 } },
  },
  {
    id: 'bones/rebuild-from-scratch', name: 'Rebuild from Scratch', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['reattach'],
    text: '[Reattach] all [Loose Bones]. Gain {b} Guard plus {m0} for each Bone Reattached. Draw {m1} Trick for every 2 Bones, up to {n}.',
    flavor: 'From the paws up, in the correct order, for once.',
    nums: { b: 12, m0: 5, m1: 1, n: 3 },
    effect: eff(c => { const r = reattach(c, loose(c)); U.guard(c, N(c).b + r * N(c).m0); U.draw(c, Math.min(N(c).n, Math.floor(r / 2) * N(c).m1)); }),
    upgrade: { nums: { b: 16, m0: 6, m1: 1, n: 3 } },
  },
  {
    id: 'bones/fall-apart-on-purpose', name: 'Fall Apart on Purpose', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['shed', 'vanish'],
    text: 'Lose all Guard. [Shed] until you reach 6. Gain {m0} Nerve for every {n} Bones actually Shed. [Vanish].',
    flavor: 'A controlled demolition of a very good boy.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { if (c.self) c.self.block = 0; const s = shed(c, 6 - loose(c)); U.energy(c, Math.floor(s / N(c).n) * N(c).m0); }),
    upgrade: { nums: { n: 2, m0: 1, m1: 2 }, text: 'Lose all Guard. [Shed] until you reach 6. Gain {m0} Nerve for every {n} Bones actually Shed. Draw {m1} Tricks. [Vanish].' },
  },
  {
    id: 'bones/dig-to-the-basement', name: 'Dig to the Basement', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, exhaust: true, keywords: ['dig-up', 'vanish'],
    text: '[Dig Up] every [Buried] Trick. Each costs {n} less this turn. [Vanish].',
    flavor: 'He was aiming for the garden. He arrived in the wine cellar.',
    nums: { n: 1 },
    effect: eff(c => { for (const k of buriedCards(c)) { digUp(c, k); U.costMod(c, k, -N(c).n, 'turn'); } }),
    upgrade: { cost: 1, nums: { n: 1 } },
  },
  {
    id: 'bones/one-more-throw', name: 'One More Throw', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['slobbered', 'fetch', 'vanish'],
    text: 'Choose a [Slobbered] Trick in your discard pile. [Fetch] it anyway and make it cost {n} this turn. After it is next played, it [Vanish]es.',
    flavor: 'One more. One more. Definitely the last one.',
    nums: { n: 0 },
    effect: eff(async c => {
      const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Fetch a Slobbered Trick', filter: (x) => U.flag(x, 'slobbered') });
      if (!k) return;
      U.toHand(c, k); U.costSet(c, k, N(c).n, 'turn'); U.makeVanish(c, k);
      U.bump(c, 'retrieved'); U.fire(c, 'fetch', { card: k });
    }),
    upgrade: { cost: 0, nums: { n: 0 } },
  },
  {
    id: 'bones/play-dead', name: 'Play Dead', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['shed'],
    text: 'Until your next turn, you may [Shed] {n} Bone before any hit to halve that hit’s damage. Once per hit.',
    flavor: 'He is extremely bad at it and it works perfectly.',
    nums: { n: 1 },
    effect: eff(c => U.applySelf(c, 'play-dead', 1)),
    upgrade: { cost: 0, nums: { n: 1 } },
  },

  // ── Powers (7) ────────────────────────────────────────────────────────────
  {
    id: 'bones/favorite-toy', name: 'Favorite Toy', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: NONE, keywords: ['fetch', 'slobbered'],
    text: 'Choose a non-Basic Trick in your hand. It can be [Fetch]ed even while [Slobbered], at most once each turn. After its first Fetch, each later Fetch makes it cost {n} more that turn.',
    flavor: 'It is a femur. It has a name. Do not ask.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Choose your Favorite', filter: (x) => (x.def?.rarity || x.rarity) !== BASIC }); if (k) U.setFlag(k, 'favorite', true); power(c, 'bones/favorite-toy', 1); }),
    upgrade: { cost: 1, nums: { n: 1 } },
  },
  {
    id: 'bones/anatomy-is-optional', name: 'Anatomy Is Optional', companion: SLUG, type: POWER, rarity: RARE,
    cost: 1, target: SELF, keywords: ['scattered', 'whole'],
    text: 'You count as [Scattered] at {n} or more [Loose Bones] instead of 4. [Whole] still requires exactly 0.',
    flavor: 'He has read the manual and disagrees with it.',
    nums: { n: 2 },
    effect: eff(c => { U.applySelf(c, 'anatomy-optional', 1); power(c, 'bones/anatomy-is-optional', 1); }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'bones/built-wrong', name: 'Built Wrong, Still Works', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['shed', 'reattach', 'rattle'],
    text: '{n} time each turn, if an effect would [Shed] while you already have 6 [Loose Bones], first [Reattach] 1, then Shed. Both cause separate [Rattle]s.',
    flavor: 'Nobody put him together. He simply happened, correctly.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'bones/built-wrong', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/treasure-yard', name: 'Treasure Yard', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bury', 'dig-up'],
    text: 'The first {n} times each turn a [Buried] Trick is [Dug Up], gain {m0} Nerve.',
    flavor: 'Every hole is a withdrawal.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => power(c, 'bones/treasure-yard', 1)),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'bones/every-bone-knows-the-way-home', name: 'Every Bone Knows the Way Home', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['reattach', 'whole'],
    text: 'At the end of your turn, [Reattach] {n} Bone if possible. Whenever you begin your turn [Whole], draw {m0} additional Trick.',
    flavor: 'They come back on their own. It is unnerving and very convenient.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => power(c, 'bones/every-bone-knows-the-way-home', 1, (x) => {
      x.e?.on?.('turn:end', () => reattach(x, U.stacks(x, x.self, 'bones/every-bone-knows-the-way-home')));
      x.e?.on?.('turn:start', () => { if (isWhole(x)) U.draw(x, 1); });
    })),
    upgrade: { nums: { n: 1, m0: 2 } },
  },
  {
    id: 'bones/never-really-lost', name: 'Never Really Lost', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['slobbered'],
    text: 'The first time each turn a [Slobbered] Trick reaches your discard pile after being played, remove Slobbered and put it on the bottom of your draw pile instead.',
    flavor: 'Nothing in this house is gone. It is just somewhere he has not looked yet.',
    nums: {},
    effect: eff(c => power(c, 'bones/never-really-lost', 1, (x) => {
      x.e?.on?.('discard', (ev) => {
        /* CONTRACTS 19, and it CRASHED rather than going quiet. `ev.card` is a
           snapshot, and `cardSnap()` clones `meta` — so `U.flag(k,'slobbered')`
           answered TRUE on the copy and everything after it ran against a dead
           object: `unslobber` wrote to the clone, and `toDrawBottom` handed the
           engine a card that was in no pile and had no `def`, which threw in
           `costOf`. This Power took down any fight in which a Slobbered Trick
           was played. Every DISCARD emitter pushes the card to the pile BEFORE
           it emits, so the uid always resolves.
           `reason` is filtered because the card prints "after being played",
           and firing on Bones's own discard effects would make it quietly
           better than its text. */
        if (ev?.reason !== 'played') return;
        const k = ev.cardUid ? x.e?.card?.(ev.cardUid) : null;
        if (!k || !U.flag(k, 'slobbered') || !U.once(x, 'neverReallyLost')) return;
        unslobber(x, k); U.toDrawBottom(x, k);
      });
    })),
    upgrade: { cost: 1 },
  },
  {
    id: 'bones/best-dog-in-the-house', name: 'Best Dog in the House', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['fetch', 'dig-up', 'slobbered'],
    text: 'At the start of each turn, choose one: [Fetch] a non-[Slobbered] Trick with printed cost {n} or less, or [Dig Up] one [Buried] Trick. If neither is possible, create a Spare Bone.',
    flavor: 'Unanimous. Every year. There are no other candidates.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'bones/best-dog-in-the-house', 1, (x) => {
      x.e?.on?.('turn:start', async () => {
        const buried = buriedCards(x);
        const fetchable = U.cardsIn(x, 'discard').filter(k => canFetch(k) && U.printedCost(k) <= 1);
        if (!buried.length && !fetchable.length) { spawnSpare(x, 1); return; }
        await U.chooseOne(x, [
          { label: 'Fetch', when: () => fetchable.length > 0, fn: (y) => fetch(y, (k) => U.printedCost(k) <= 1) },
          { label: 'Dig Up', when: () => buried.length > 0, fn: (y) => digUp(y, buried[0]) },
        ]);
      });
    })),
    upgrade: { cost: 2, nums: { n: 1 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
// ── MULTIPLAYER ONLY TRICKS ─────────────────────────────────────────────────
/**
 * The five co-op Tricks from this companion's design chapter, kept OUTSIDE the
 * 80 in a separate `coopCards` pool so a solo run can never draft one.
 *
 * A NOTE ON ANY THAT ASK A TEAMMATE TO CHOOSE. Where one of these says "that
 * player chooses a Trick from their hand/discard", it goes through
 * `c.askAlly(ally, {...})` (or `c.askAllyOption` for a call rather than a
 * card), which raises a real choice request ADDRESSED TO THAT KID'S SEAT: their
 * own client's picker answers it, and everyone else resolves it from the
 * request's `prefer` rule and reads the outcome off the choice log. Local play
 * always takes the second branch on purpose — handing one player the other
 * Kid's deck would be worse than a stable rule, not better — so a transport is
 * the only piece still missing. Never hand-roll the pick inside an effect.
 */
const coopCards = [
  {
    id: 'bones/bring-it-back-friend', name: 'Bring It Back, Friend!', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Choose a friend. They return a Trick costing {n} or less from their discard to their hand. If they play it this turn, Reattach {b} Bone.',
    flavor: 'He has brought back a stick, a shoe, and someone else\'s idea.',
    nums: { n: 1, b: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Whose discard are you digging in?' });
      if (!ally) return;
      const pool = c.allyCards(ally, 'discard')
        .filter(k => (k.baseCost ?? 99) <= N(c).n && !U.flag(k, 'noReturnThisCombat'));
      if (!pool.length) return;
      const pick = (await c.askAlly(ally, {
        pool, pile: 'discard', prefer: 'cheapest',
        prompt: 'Bring one back from your discard.',
      }))[0];
      if (!pick) return;
      U.setFlag(pick, 'noReturnThisCombat', true);   // once per combat, per the doc
      c.e._asSeat(ally, () => c.e.moveCard(pick, 'hand', { reason: 'bones/bring-it-back-friend' }));
      // "If they play it this turn" — one-shot, torn down at end of turn either way.
      const b = N(c).b;
      const off = c.e.on('card:play', (ev) => {
        if (ev.cardUid !== pick.uid) return;
        off(); reattach(c, b);
      });
      U.atTurnEnd(c, () => off());
    }),
    upgrade: { nums: { n: 2, b: 1 } },
  },
  {
    id: 'bones/burial-buddy', name: 'Burial Buddy', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Choose a friend. You each set aside a Trick. At the start of your next turns they return costing {n} less. Yours counts as Buried and Dug Up.',
    flavor: 'Two dogs, one hole, entirely different plans for it.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who is burying with you?' });
      if (!ally) return;
      const mine = U.handOthers(c)[0];
      const theirs = (await c.askAlly(ally, {
        pool: c.allyCards(ally, 'hand'), pile: 'hand',
        prompt: 'Set one aside to bury.',
      }))[0];
      const less = N(c).n;
      const stash = (seat, card) => {
        if (!card) return;
        c.e._asSeat(seat, () => c.e.moveCard(card, 'limbo', { reason: 'bones/burial-buddy' }));
        c.e.schedule({
          turns: 1, when: 'playerTurnStart', label: 'Burial Buddy', ownerId: seat.id,
          run: () => {
            c.e._asSeat(seat, () => {
              c.e.moveCard(card, 'hand', { reason: 'bones/burial-buddy' });
              card.costTurnDelta -= less;
            });
          },
        });
      };
      stash(c.self, mine);
      stash(ally, theirs);
      if (mine) { U.fire(c, 'buried', { card: mine }); U.fire(c, 'digUp', { card: mine }); }
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/tug-of-war', name: 'Tug of War', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 0, target: NONE, coop: true,
    text: 'Choose a friend. You each discard a Trick; if you both do, you each draw {n}. Then Shed 1 and Reattach 1.',
    flavor: 'Nobody wins. Everybody is delighted.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who is on the other end?' });
      if (!ally) return;
      const mine = U.handOthers(c)[0];
      const theirs = (await c.askAlly(ally, {
        pool: c.allyCards(ally, 'hand'), pile: 'hand',
        prompt: 'Which one are you handing over?',
      }))[0];
      if (!mine || !theirs) return;                 // both, or neither
      // `discardCard` is an ENGINE method, not part of the card ctx surface —
      // the strict guard caught this reaching for a member that does not exist.
      // Each discard resolves as its own seat so the count lands on that Kid.
      c.e._asSeat(c.self, () => c.e.discardCard(mine, 'bones/tug-of-war'));
      c.e._asSeat(ally, () => c.e.discardCard(theirs, 'bones/tug-of-war'));
      U.draw(c, N(c).n);
      c.giveDraw(ally, N(c).n);
      shed(c, 1); reattach(c, 1);                   // two Rattles, per the doc
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'bones/fetch-relay', name: 'Fetch Relay', companion: SLUG,
    type: SKILL, rarity: RARE, cost: 1, target: NONE, coop: true,
    text: 'Choose a friend. You each take a Trick from your own discard into the OTHER\'s hand this turn, costing {n} less. They return at end of turn.',
    flavor: 'The relay works. What arrives is never quite what was sent.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who are you relaying with?' });
      if (!ally) return;
      const mine = c.discardPile.filter(k => !U.flag(k, 'noReturnThisCombat'))[0];
      const theirs = (await c.askAlly(ally, {
        pool: c.allyCards(ally, 'discard').filter(k => !U.flag(k, 'noReturnThisCombat')),
        pile: 'discard', prompt: 'Which one are you lending?',
      }))[0];
      const less = N(c).n;
      const lend = (from, to, card) => {
        if (!card) return;
        c.e._asSeat(to, () => c.e.moveCard(card, 'hand', { reason: 'bones/fetch-relay' }));
        card.costTurnDelta -= less;
        U.setFlag(card, 'borrowed', from.id);
        // Borrowed Tricks go home at end of turn, played or not.
        U.atTurnEnd(c, () => {
          if (!U.flag(card, 'borrowed')) return;
          U.clearFlag(card, 'borrowed');
          c.e._asSeat(from, () => c.e.moveCard(card, 'discard', { reason: 'bones/fetch-relay' }));
        });
      };
      lend(c.self, ally, mine);
      lend(ally, c.self, theirs);
      if (mine) U.setFlag(mine, 'slobbered', true);              // per the doc
      if (theirs) U.setFlag(theirs, 'noReturnThisCombat', true);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'bones/pack-stash', name: 'Pack Stash', companion: SLUG,
    type: SKILL, rarity: RARE, cost: 2, target: NONE, coop: true, exhaust: true,
    text: 'EVERY player may set aside a Trick. At the start of their next turn it returns costing 0. Yours counts as Buried and Dug Up. [Vanish].',
    flavor: 'A communal hole. Contributions welcome. Withdrawals negotiable.',
    nums: {},
    effect: eff((c) => {
      for (const pl of c.party()) {
        const card = (pl === c.self) ? U.handOthers(c)[0] : c.allyCards(pl, 'hand')[0];
        if (!card) continue;
        c.e._asSeat(pl, () => c.e.moveCard(card, 'limbo', { reason: 'bones/pack-stash' }));
        c.e.schedule({
          turns: 1, when: 'playerTurnStart', label: 'Pack Stash', ownerId: pl.id,
          run: () => c.e._asSeat(pl, () => {
            c.e.moveCard(card, 'hand', { reason: 'bones/pack-stash' });
            card.costOverrideTurn = 0;
          }),
        });
        if (pl === c.self) { U.fire(c, 'buried', { card }); U.fire(c, 'digUp', { card }); }
      }
    }),
    upgrade: { cost: 1 },
  },
];

export default {
  slug: SLUG,
  name: 'Bones',
  title: 'the Skeleton Puppy',
  region: 'crypt',
  identity:
    'Bones is a zone-manipulation and body-state Companion whose anatomy is a resource. His combat ' +
    'rhythm is a loop: Whole, Shed, Rattle, become Scattered, exploit the missing pieces, retrieve a ' +
    'spent Trick, Reattach, become Whole, cash out, fall apart again. His recursion is deliberately ' +
    'constrained — Fetch gives an individual Trick one second life before it is Slobbered, and Burying ' +
    'offers deeper recursion only in exchange for delayed gratification. A weak Bones deck keeps ' +
    'retrieving its best card. A strong Bones deck treats the draw pile, the discard pile, the Buried ' +
    'zone and his own skeleton as one circulatory system, and knows which of the four a given Trick ' +
    'belongs in right now.',
  strengths: [
    'Exceptional access to specific Tricks after they have been played',
    'The discard pile works as a second toolbox',
    'Strong long-combat scaling through body transitions and Buried Tricks',
    'Real control over what future hands contain',
    'Can thin his active deck temporarily by Burying',
    'Enormous burst turns once Loose Bones, discard and the Buried zone line up',
  ],
  weaknesses: [
    'Fetching the same premium Trick repeatedly is restricted by Slobbered',
    'Burying sacrifices immediate tempo',
    'Defensive Tricks want Whole; offensive Tricks want Scattered',
    'Sitting at 6 Loose Bones shuts down every Rattle engine',
    'Staying Whole wastes most of his offensive engine',
    'Short encounters end before a burial engine repays itself',
    'Almost no passive scaling — everything requires doing something repeatedly',
  ],
  startingHp: 74,
  startingEnergy: 3,
  mechanics: {
    looseBones: { name: 'Loose Bones', kind: 'resource', desc: 'How much of Bones is detached. Shed raises it, Reattach lowers it. Whole at 0, Scattered at 4 or more. Loose Bones vanish after combat.', min: 0, max: 6, hooks: ['rattle', 'becameWhole', 'becameScattered'] },
    rattle: { name: 'Rattle', kind: 'system', desc: 'Fires whenever Loose Bones actually change. Changing three at once is one Rattle; Shedding then Reattaching is two. Nothing changing is no Rattle.', min: 0, max: 99, hooks: ['rattle'] },
    fetch: { name: 'Fetch / Slobbered', kind: 'system', desc: 'Fetch returns an eligible Trick from the discard pile to hand — not a draw. It becomes Slobbered and cannot be Fetched again this combat. Slobbered is the anti-loop constraint.', min: 0, max: 99, hooks: ['fetch'] },
    bury: { name: 'Bury / Dig Up', kind: 'system', desc: 'Buried Tricks sit in their own zone with 2 counters, losing one at the start of each of your turns, and are Dug Up when the last one goes. While Buried they cannot be drawn, played, discarded or Fetched.', min: 0, max: 99, hooks: ['bury', 'digUp'] },
    spareBone: { name: 'Spare Bone', kind: 'system', desc: 'A free temporary Trick that Sheds 1 or Reattaches 1. It disappears at the end of the turn, so Rattles cannot be stockpiled.', min: 0, max: 99, hooks: [] },
  },
  startingDeck: [
    'bones/bite', 'bones/bite', 'bones/bite', 'bones/bite',
    'bones/sit-pretty', 'bones/sit-pretty', 'bones/sit-pretty',
    'bones/shake-boy', 'bones/put-yourself-back-together', 'bones/go-get-it',
  ],
  cards: [...basics, SPARE_BONE, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'The Rattle Engine', desc: 'Repeatedly Shed and Reattach small numbers. The objective is not to reach 6 — it is to keep moving. Stalls at either extreme, so the deck needs both directions.', coreCards: ['bones/shake-it-loose', 'bones/fetch', 'bones/reassemble', 'bones/spare-parts', 'bones/off-leash', 'bones/jingle-collar', 'bones/rattletrap', 'bones/spare-parts-everywhere', 'bones/skeleton-stampede', 'bones/built-wrong'] },
    { name: 'Scattered Puppy', desc: 'Deliberately reach high Loose Bones and turn the missing anatomy into pressure. High burst and excellent multi-enemy damage, but permanently sitting at 6 starves its own engines.', coreCards: ['bones/clatter-pounce', 'bones/scattershot-skeleton', 'bones/take-me-apart', 'bones/flop-over', 'bones/spare-parts-everywhere', 'bones/every-bone-at-once', 'bones/headless-rush', 'bones/play-dead', 'bones/anatomy-is-optional'] },
    { name: 'Fetch Toolbox', desc: 'The discard pile as a second hand. Replay exactly the defence, attack or setup the turn needs. Slobbered stops it becoming one card played forever.', coreCards: ['bones/fetch', 'bones/leave-it', 'bones/shake-dry', 'bones/flying-femur', 'bones/boomerang-bone', 'bones/call-that-back', 'bones/scent-trail', 'bones/scent-memory', 'bones/perfect-fetch', 'bones/one-more-throw', 'bones/favorite-toy', 'bones/never-really-lost'] },
    { name: 'Backyard Burial', desc: 'The Buried zone as delayed storage, deck thinning, tutoring and resource banking. The enemy does not care that your best Trick will be wonderful in two turns.', coreCards: ['bones/bury-it', 'bones/dig-here', 'bones/under-the-couch', 'bones/backyard-cache', 'bones/bury-the-evidence', 'bones/smell-something', 'bones/treat-stash', 'bones/skeleton-key', 'bones/yard-map', 'bones/buried-bite', 'bones/who-buried-that', 'bones/secret-stash', 'bones/dig-to-the-basement', 'bones/treasure-yard'] },
    { name: 'Whole Dog Reassembly', desc: 'Exploit effects that need a fully reconstructed dog. Not a deck that sits at zero — it falls apart on purpose because its best payoffs require coming back.', coreCards: ['bones/tailbone-thump', 'bones/reassemble', 'bones/full-body-tackle', 'bones/heel', 'bones/good-as-new', 'bones/pile-of-me', 'bones/tighten-the-collar', 'bones/bone-a-fide-missile', 'bones/rebuild-from-scratch', 'bones/every-bone-at-once', 'bones/every-bone-knows-the-way-home'] },
  ],
};
