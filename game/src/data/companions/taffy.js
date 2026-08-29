/**
 * Taffy, the Candy Slime.  OWNER: companion-cards.
 * Spec: docs/design/companions/07-taffy.md
 *
 * Globs (Split / Recombine / Runny) · Stretch · Belly (Absorb / Spit Out) ·
 * Gummy copies · card shaping
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE, RANDOM_ENEMY } = Target;
const SLUG = 'taffy';
const N = U.N;
const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── Globs ───────────────────────────────────────────────────────────────────
const GLOBS = 'globs';
const globs = (c) => U.res(c, GLOBS);
const isRunny = (c) => globs(c) >= 5;
function split(c, n) { const d = U.addRes(c, GLOBS, n, 0, 6); if (d) U.fire(c, 'split', { n: d }); return d; }
function recombine(c, n) {
  const take = Math.min(n, globs(c));
  if (take <= 0) return 0;
  U.addRes(c, GLOBS, -take, 0, 6);
  U.fire(c, 'recombine', { n: take, left: globs(c) });
  return take;
}

// ── Stretch ─────────────────────────────────────────────────────────────────
const stretchOf = (k) => U.counter(k, 'stretch');
function stretch(c, k, n = 1) {
  if (!k) return 0;
  const before = stretchOf(k);
  U.setCounter(k, 'stretch', Math.min(3, before + n));
  U.setFlag(k, 'stretched', true);
  U.retain(c, k, 'combat');
  return stretchOf(k) - before;
}
function clearStretch(c, k) { U.setCounter(k, 'stretch', 0); U.clearFlag(k, 'stretched'); }
const stretchedInHand = (c) => U.cardsIn(c, 'hand').filter(k => stretchOf(k) > 0);

// ── Belly ───────────────────────────────────────────────────────────────────
const bellyCap = (c) => U.mm(c).bellyCap;
const belly = (c) => U.cardsIn(c, 'stash').filter(k => U.flag(k, 'belly'));
const bellyFull = (c) => belly(c).length >= bellyCap(c);
function absorb(c, k, freeSlot) {
  if (!k) return null;
  if (!freeSlot && bellyFull(c)) return null;
  U.setFlag(k, 'belly', true);
  if (freeSlot) U.setFlag(k, 'bellyFree', true);
  U.moveCard(c, k, 'stash', { belly: true });
  U.fire(c, 'absorb', { card: k });
  return k;
}
function spitOut(c, k) {
  if (!k) return null;
  U.clearFlag(k, 'belly');
  U.toHand(c, k);
  U.bump(c, 'spatOut');
  if (U.stacks(c, c.self, 'taffy/bottomless-belly') > 0) U.costMod(c, k, 1, 'turn');
  U.fire(c, 'spitOut', { card: k });
  return k;
}
const typeOf = (k) => (k?.def?.type || k?.type);

// ── Gummy copies ────────────────────────────────────────────────────────────
/** Build a temporary CardDef replica of a runtime card. */
function gummyDef(src, costDelta = 0, forcedCost) {
  const d = src?.def || src;
  if (!d) return null;
  const base = forcedCost != null ? forcedCost : Math.max(0, (src.cost != null ? src.cost : d.cost) + costDelta);
  return {
    ...d,
    name: d.name,
    cost: base,
    rarity: Rarity.SPECIAL,
    exhaust: true,
    keywords: [...new Set([...(d.keywords || []), 'gummy', 'vanish'])],
    text: d.text,
  };
}
/** Create a Gummy copy of `src` in `pile`. Gummy copies cannot copy themselves. */
function gummy(c, src, pile = 'hand', costDelta = 0, forcedCost) {
  if (!src || U.flag(src, 'gummy')) return null;
  let delta = costDelta;
  if (U.stacks(c, c.self, 'taffy/multipack') > 0 && U.once(c, 'multipack')) delta -= U.stacks(c, c.self, 'taffy/multipack');
  if (U.got(c, 'wrapperDiscount') > 0) { delta -= 1; U.bump(c, 'wrapperDiscount', -1); }
  const def = gummyDef(src, delta, forcedCost);
  if (!def) return null;
  U.spawn(c, def, pile, { gummy: true, exhaust: true, cost: def.cost, meta: { gummy: true } });
  U.bump(c, 'gummyMade');
  U.fire(c, 'gummy', { src });
  return def;
}
const copyable = (k) => k && !U.flag(k, 'gummy') && (typeOf(k) === ATTACK || typeOf(k) === SKILL);

function power(c, id, n, install) {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
}

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: 'globs', name: 'Globs', icon: 'globs', desc: 'Pieces of Taffy separated from her body. Runny at 5 or more, which costs Courage at the end of each enemy turn.', min: 0, max: 6, start: 0 },
  ]);
  const fake = () => U.trackerCtx(e, seat);

  /**
   * `gummyPlayed` counts Gummies PLAYED this turn. Two cards read it — Sticky
   * Fingers and Sugar Rush — and exactly ONE other card incremented it, so both
   * were reading a number that was almost always zero.
   *
   * The marker also never reached the card. `gummy()` spawned with
   * `{ flags: { gummy: true } }`, and `engine.addCard` reads `meta`, never
   * `flags` — so `U.flag(card, 'gummy')` was undefined on every Gummy ever
   * made. `copyable()` therefore let a Gummy be copied, and `gummy()` would not
   * refuse a Gummy as its source, which is the "cannot copy itself" rule the
   * archetype is built on.
   *
   * The `gummy` KEYWORD cannot stand in for the flag: Taffy's own Gummy-making
   * Tricks carry it as a category marker, so it does not distinguish a copy
   * from a card about copies. The meta flag is the only thing that does.
   */
  e.on('card:play', (ev) => {
    /* trap 19: `ev.card` is a SNAPSHOT, so the runtime flag is not on it. */
    const live = ev.cardUid != null ? e.card(ev.cardUid) : null;
    if (U.flag(live || ev.card, 'gummy')) U.bump(fake(), 'gummyPlayed');
  });
  // Player turn end ONLY — Stretch used to climb on every enemy turn end too.
  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const extra = U.stacks(c, c.self, 'taffy/slow-pull') > 0 ? 2 : 1;
    for (const k of U.cardsIn(c, 'hand')) if (U.counter(k, 'stretch') > 0) U.setCounter(k, 'stretch', Math.min(3, U.counter(k, 'stretch') + extra));
  });
  // Runny costs Courage once at the end of each enemy turn, not once per Glob.
  const runnyTick = () => {
    const c = fake();
    if (U.res(c, 'globs') < 5) return;
    if (U.stacks(c, c.self, 'blob-insurance') > 0 || U.stacks(c, c.self, 'no-runny') > 0) return;
    U.bleed(c, 3);
  };
  if (e.schedule) e.schedule({ turns: 1, repeat: 1, when: 'enemyTurnEnd', label: 'Runny', run: runnyTick });
  else e.on('enemyTurn:end', runnyTick);
  U.onPlayerTurn(e, 'start', () => { s.played = 0; });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('absorb', 'taffy/snack-pocket', (c) => { if (U.once(c, 'snackPocket')) U.guard(c, 6 + (U.stacks(c, c.self, 'taffy/snack-pocket') - 1) * 3); });
U.onHook('absorb', 'taffy/bottomless-belly', (c) => U.draw(c, 1));
U.onHook('recombine', 'taffy/sweet-spot', (c, p) => { if (p.left === 2 && U.once(c, 'sweetSpot')) U.draw(c, U.stacks(c, c.self, 'taffy/sweet-spot')); });
U.onHook('recombine', 'taffy/conservation-of-taffy', (c, p) => { if (p.n >= 2 && U.once(c, 'conservation')) { const g = U.stacks(c, c.self, 'taffy/conservation-of-taffy'); U.atTurnEnd(c, (x) => split(x, g)); } });
U.onHook('spitOut', 'taffy/chew-cycle', (c, p) => {
  if (!U.once(c, 'chewCycle')) return;
  const other = belly(c).find(k => k !== p.card && copyable(k));
  if (other) gummy(c, other, 'discard');
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'taffy/sugar-bonk', name: 'Sugar Bonk', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'A soft impact that somehow rattles the furniture.',
    nums: { d: 6 }, effect: eff(c => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'taffy/squish', name: 'Squish', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'She simply becomes wider than the problem.',
    nums: { b: 5 }, effect: eff(c => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'taffy/pinch-off', name: 'Pinch Off', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['split', 'glob'],
    text: '[Split] {n}. Gain {b} Guard.',
    flavor: 'It does not hurt. She checks every time, and it does not hurt.',
    nums: { n: 1, b: 4 },
    effect: eff(c => { split(c, N(c).n); U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 1, b: 6 } },
  },
  {
    id: 'taffy/long-pull', name: 'Long Pull', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: NONE, keywords: ['stretch'],
    text: '[Stretch] one other Attack or Skill.',
    flavor: 'Slowly. Evenly. It gets better the longer you leave it.',
    nums: {},
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Stretch a Trick', filter: (x) => typeOf(x) === ATTACK || typeOf(x) === SKILL }); stretch(c, k); }),
    upgrade: { cost: 0 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'taffy/gummy-jab', name: 'Gummy Jab', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['glob'],
    text: 'Deal {d} damage. Deal {m0} more if you have at least {n} [Glob].',
    flavor: 'Most of the fist is somewhere else, and it still lands.',
    nums: { d: 6, m0: 4, n: 1 },
    effect: eff(c => U.hit(c, N(c).d + (globs(c) >= N(c).n ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 5, n: 1 } },
  },
  {
    id: 'taffy/licorice-lash', name: 'Licorice Lash', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['stretch'],
    text: 'Deal {d} damage, plus {m0} for each [Stretch]. At {n} or more Stretch it also hits a second enemy.',
    flavor: 'Reach is a property you can add to a whip after the fact.',
    nums: { d: 6, m0: 3, n: 2 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, N(c).d + N(c).m0 * s); const o = U.others(c); if (s >= N(c).n && o.length) U.hitAt(c, o[0], N(c).d + N(c).m0 * s); clearStretch(c, c.card); }),
    upgrade: { nums: { d: 8, m0: 4, n: 2 } },
  },
  {
    id: 'taffy/snap-back', name: 'Snap Back', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['stretch'],
    text: 'Deal {d} damage. If this Trick had [Stretch], gain {b} Guard.',
    flavor: 'The recoil is the useful half.',
    nums: { d: 8, b: 6 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, N(c).d); if (s > 0) { U.guard(c, N(c).b); clearStretch(c, c.card); } }),
    upgrade: { nums: { d: 11, b: 8 } },
  },
  {
    id: 'taffy/split-splat', name: 'Split Splat', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['split'],
    text: 'Deal {d} damage. [Split] {n}.',
    flavor: 'Part of the attack stays behind. It is fine. It will catch up.',
    nums: { d: 7, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); split(c, N(c).n); }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'taffy/gumball-volley', name: 'Gumball Volley', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['glob'],
    text: 'Deal {d} damage {n} times. Deal one more hit if you have at least {m0} [Glob]s.',
    flavor: 'Rapid, spherical, and faintly fruit-flavoured.',
    nums: { d: 4, n: 2, hits: 2, m0: 3 },
    effect: eff(c => U.hitN(c, N(c).d, N(c).n + (globs(c) >= N(c).m0 ? 1 : 0))),
    upgrade: { nums: { d: 6, n: 2, hits: 2, m0: 3 } },
  },
  {
    id: 'taffy/big-chew', name: 'Big Chew', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['recombine'],
    text: 'Deal {d} damage. You may [Recombine] {n} to deal {m0} more.',
    flavor: 'She puts a piece of herself back in and bites down.',
    nums: { d: 8, n: 1, m0: 7 },
    effect: eff(c => U.hit(c, N(c).d + (recombine(c, N(c).n) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 11, n: 1, m0: 9 } },
  },
  {
    id: 'taffy/stretch-punch', name: 'Stretch Punch', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['stretch'],
    text: 'Deal {d} damage, plus {m0} for each [Stretch]. At 3 Stretch, deal {m1} more on top.',
    flavor: 'The wind-up starts two rooms away.',
    nums: { d: 6, m0: 4, m1: 8 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, N(c).d + N(c).m0 * s + (s >= 3 ? N(c).m1 : 0)); clearStretch(c, c.card); }),
    upgrade: { nums: { d: 8, m0: 5, m1: 10 } },
  },
  {
    id: 'taffy/rebound-bite', name: 'Rebound Bite', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['spit-out'],
    text: 'Deal {d} damage. If you [Spit Out] a Trick this turn, draw {n} Trick.',
    flavor: 'Everything she swallows comes back with interest.',
    nums: { d: 7, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.got(c, 'spatOut') > 0) U.draw(c, N(c).n); }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'taffy/pinch-a-piece', name: 'Pinch a Piece', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['split', 'glob'],
    text: '[Split] {n}. Gain {b} Guard for each [Glob] you have.',
    flavor: 'A modest donation to the floor, and every other piece braces with her.',
    nums: { n: 1, b: 3 },
    effect: eff(c => { split(c, N(c).n); U.guard(c, N(c).b * globs(c)); }),
    upgrade: { nums: { n: 1, b: 4 } },
  },
  {
    id: 'taffy/squish-flat', name: 'Squish Flat', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['glob'],
    text: 'Gain {b} Guard. If you have 0 [Glob]s, gain {m0} instead.',
    flavor: 'One continuous puddle is a much better shield than several small ones.',
    nums: { b: 8, m0: 13 },
    effect: eff(c => U.guard(c, globs(c) === 0 ? N(c).m0 : N(c).b)),
    upgrade: { nums: { b: 10, m0: 16 } },
  },
  {
    id: 'taffy/pull-it-long', name: 'Pull It Long', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['stretch'],
    text: '[Stretch] another Attack or Skill, then draw {n} Trick.',
    flavor: 'Patience, applied physically — and something to do while you wait.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Stretch a Trick', filter: copyable }); stretch(c, k); U.draw(c, N(c).n); }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'taffy/save-for-later', name: 'Save for Later', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['absorb', 'belly'],
    text: '[Absorb] one Trick from your hand, then draw {n} Trick.',
    flavor: 'Into the [Belly]. Out of the way. Still hers.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Absorb a Trick' }); absorb(c, k); U.draw(c, N(c).n); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'taffy/spit-take', name: 'Spit Take', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['spit-out'],
    text: '[Spit Out] one Trick. It costs {n} less this turn.',
    flavor: 'Delivered at speed, across the room, slightly glossy.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Spit Out a Trick', filter: (x) => U.flag(x, 'belly') }); if (k) { spitOut(c, k); U.costMod(c, k, -N(c).n, 'turn'); } }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'taffy/sticky-palm', name: 'Sticky Palm', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['retain', 'stretch'],
    text: 'Give one Trick [Retain] this turn. If it is already [Stretch]ed, add {n} Stretch instead.',
    flavor: 'Everything she holds stays held.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Hold a Trick' }); if (!k) return; if (stretchOf(k) > 0) stretch(c, k, N(c).n); else U.retain(c, k); }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'taffy/mix-the-costs', name: 'Mix the Costs', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE,
    text: 'Choose two other Tricks in your hand. Swap their current Nerve costs until the end of the turn.',
    flavor: 'Price tags are only stuck on.',
    nums: {},
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'hand', count: 2, prompt: 'Swap two costs' }); if (ks.length < 2) return; const a = U.nowCost(ks[0]), b = U.nowCost(ks[1]); U.costSet(c, ks[0], b, 'turn'); U.costSet(c, ks[1], a, 'turn'); }),
    upgrade: { text: 'Choose two other Tricks in your hand. Swap their current Nerve costs for the rest of combat.' },
  },
  {
    id: 'taffy/little-recombine', name: 'Little Recombine', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['recombine', 'glob'],
    text: '[Recombine] up to {n}. Gain {b} Guard for each [Glob] spent.',
    flavor: 'Reabsorbed with a faint, satisfying schlup.',
    nums: { n: 2, b: 8 },
    effect: eff(c => U.guard(c, recombine(c, N(c).n) * N(c).b)),
    upgrade: { nums: { n: 2, b: 11 } },
  },
  {
    id: 'taffy/sample-size', name: 'Sample Size', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['gummy'],
    text: 'Create a [Gummy] copy of a Common Attack or Skill in your hand. The copy costs {n} more.',
    flavor: 'Try before you buy. The sample is slightly worse than the product.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Copy a Common Trick', filter: (x) => copyable(x) && (x.def?.rarity || x.rarity) === COMMON }); gummy(c, k, 'hand', N(c).n); }),
    upgrade: { nums: { n: 0 } },
  },
  {
    id: 'taffy/candy-wrapper', name: 'Candy Wrapper', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['gummy'],
    text: 'Gain {b} Guard. The next [Gummy] copy you create this turn costs {n} less.',
    flavor: 'Crinkly. Load-bearing.',
    nums: { b: 8, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); U.bump(c, 'wrapperDiscount', N(c).n); }),
    upgrade: { nums: { b: 11, n: 1 } },
  },
  {
    id: 'taffy/wobble-room', name: 'Wobble Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['split', 'runny'],
    text: '[Split] {m0}. If this makes you [Runny], draw {n} Tricks.',
    flavor: 'Dangerously loose and suddenly full of ideas.',
    nums: { m0: 1, n: 2 },
    effect: eff(c => { const was = isRunny(c); split(c, N(c).m0); if (!was && isRunny(c)) U.draw(c, N(c).n); }),
    upgrade: { nums: { m0: 1, n: 3 } },
  },
  {
    id: 'taffy/chew-slowly', name: 'Chew Slowly', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['stretch'],
    text: 'Gain {b} Guard for each [Stretch]ed Trick in your hand, up to {n}.',
    flavor: 'Nothing in the hand is ready. Everything in the hand is getting better.',
    nums: { b: 4, n: 4 },
    effect: eff(c => U.guard(c, Math.min(N(c).n, stretchedInHand(c).length) * N(c).b)),
    upgrade: { nums: { b: 6, n: 4 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (12) ──────────────────────────────────────────────────────────
  {
    id: 'taffy/elastic-reversal', name: 'Elastic Reversal', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['stretch'],
    text: 'Deal {d} damage. At {n} or more [Stretch], repeat the damage once.',
    flavor: 'Out, then back, then out again before anyone reacts.',
    nums: { d: 9, n: 2, hits: 1 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, N(c).d); if (s >= N(c).n) U.hit(c, N(c).d); clearStretch(c, c.card); }),
    upgrade: { nums: { d: 12, n: 2, hits: 1 } },
  },
  {
    id: 'taffy/blob-barrage', name: 'Blob Barrage', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['glob'],
    text: 'Deal {d} damage once for each [Glob] you have, up to {n} hits. This does not spend Globs.',
    flavor: 'Every piece of her arrives separately and on time.',
    nums: { d: 4, n: 6, hits: 4 },
    effect: eff(c => U.hitN(c, N(c).d, Math.min(N(c).n, globs(c)))),
    upgrade: { nums: { d: 6, n: 6, hits: 4 } },
  },
  {
    id: 'taffy/recombination-slam', name: 'Recombination Slam', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['recombine', 'glob'],
    text: '[Recombine] any number of [Glob]s. Deal {d} damage plus {m0} for each spent.',
    flavor: 'All of her, in one place, briefly, extremely hard.',
    nums: { d: 5, m0: 6 },
    effect: eff(c => U.hit(c, N(c).d + N(c).m0 * recombine(c, globs(c)))),
    upgrade: { nums: { d: 7, m0: 7 } },
  },
  {
    id: 'taffy/second-serving', name: 'Second Serving', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['gummy'],
    text: 'Deal {d} damage. If you played a [Gummy] copy earlier this turn, create a Gummy copy of this Trick in your discard pile.',
    flavor: 'There is always more. That is the trouble with her.',
    nums: { d: 8 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.got(c, 'gummyPlayed') > 0) gummy(c, c.card, 'discard'); }),
    upgrade: { nums: { d: 11 } },
  },
  {
    id: 'taffy/bellyflop', name: 'Bellyflop', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['belly'],
    text: 'Deal {d} damage. If your [Belly] is full, gain {b} Guard.',
    flavor: 'Everything she has eaten arrives at the same moment as she does.',
    nums: { d: 16, b: 12 },
    effect: eff(c => { U.hit(c, N(c).d); if (bellyFull(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 20, b: 15 } },
  },
  {
    id: 'taffy/sugar-sling', name: 'Sugar Sling', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['runny', 'recombine'],
    text: 'Deal {d} damage to all enemies. If [Runny], deal {m0} instead, then [Recombine] {n}.',
    flavor: 'At this consistency she can be thrown in several directions at once.',
    nums: { d: 6, m0: 13, n: 1 },
    effect: eff(c => { if (isRunny(c)) { U.hitAll(c, N(c).m0); recombine(c, N(c).n); } else U.hitAll(c, N(c).d); }),
    upgrade: { nums: { d: 8, m0: 17, n: 1 } },
  },
  {
    id: 'taffy/snapback-special', name: 'Snapback Special', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['stretch', 'gummy'],
    text: 'Deal {d} damage. If this Trick was played with [Stretch], create a [Gummy] copy of it in your discard pile.',
    flavor: 'The tension has to go somewhere.',
    nums: { d: 9 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, N(c).d); if (s > 0) { gummy(c, c.card, 'discard'); clearStretch(c, c.card); } }),
    upgrade: { nums: { d: 12 } },
  },
  {
    id: 'taffy/hard-candy-haymaker', name: 'Hard Candy Haymaker', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['recombine'],
    text: 'Deal {d} damage. You may [Recombine] {n} before paying to reduce this Trick’s cost by {m0} this turn.',
    flavor: 'She lets one part of herself go rigid. Only one part.',
    nums: { d: 20, n: 2, m0: 1 },
    effect: eff(c => U.hit(c, N(c).d)),
    dynamicCost: (c) => Math.max(0, 2 - (U.res(c, GLOBS) >= 2 ? 1 : 0)),
    upgrade: { nums: { d: 25, n: 2, m0: 1 } },
  },
  {
    id: 'taffy/taffy-hook', name: 'Taffy Hook', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['spit-out', 'absorb'],
    text: 'Deal {d} damage. [Spit Out] one [Absorb]ed Attack.',
    flavor: 'She reaches in past her own teeth and pulls out a fist.',
    nums: { d: 8 },
    effect: eff(async c => { U.hit(c, N(c).d); const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Spit Out an Attack', filter: (x) => U.flag(x, 'belly') && typeOf(x) === ATTACK }); spitOut(c, k); }),
    upgrade: { nums: { d: 11 } },
  },
  {
    id: 'taffy/feed-the-blob', name: 'Feed the Blob', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['belly'],
    text: 'Deal {d} damage, plus {m0} for each Trick in your [Belly].',
    flavor: 'Whatever is in there is helping.',
    nums: { d: 7, m0: 6 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).m0, belly(c).length); }),
    upgrade: { nums: { d: 10, m0: 7 } },
  },
  {
    id: 'taffy/long-distance-smack', name: 'Long Distance Smack', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['stretch'],
    text: 'Deal {d} damage. Each [Stretch] adds a {m0} hit against another enemy where possible.',
    flavor: 'One arm, three rooms, four enemies.',
    nums: { d: 9, m0: 5 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, N(c).d); const o = U.others(c); for (let i = 0; i < s; i++) U.hitAt(c, o.length ? o[i % o.length] : c.target, N(c).m0); clearStretch(c, c.card); }),
    upgrade: { nums: { d: 12, m0: 6 } },
  },
  {
    id: 'taffy/bite-sized-brigade', name: 'Bite Sized Brigade', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['gummy'],
    text: 'Deal {d} damage, plus {m0} for each [Gummy] copy you have played this turn, up to {n} extra hits.',
    flavor: 'A small army of slightly wrong duplicates.',
    nums: { d: 5, m0: 5, n: 4 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).m0, Math.min(N(c).n, U.got(c, 'gummyPlayed'))); }),
    upgrade: { nums: { d: 7, m0: 7, n: 4 } },
  },

  // ── Skills (17) ───────────────────────────────────────────────────────────
  {
    id: 'taffy/better-save-that', name: 'Better Save That', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['absorb', 'belly'],
    text: '[Absorb] up to {n} Tricks from your hand, respecting [Belly] capacity. Draw {m0} Trick for each.',
    flavor: 'Filing, by mouth.',
    nums: { n: 2, m0: 1 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'hand', count: N(c).n, prompt: 'Absorb Tricks', optional: true }); for (const k of ks) if (absorb(c, k)) U.draw(c, N(c).m0); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'taffy/pocket-taffy', name: 'Pocket Taffy', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['absorb', 'belly'],
    text: '[Absorb] one Trick from your discard pile. Gain {b} Guard.',
    flavor: 'She goes back for the one she regrets.',
    nums: { b: 10 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Absorb from discard' }); absorb(c, k); U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 14 } },
  },
  {
    id: 'taffy/regurgitate', name: 'Regurgitate', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['spit-out', 'belly'],
    text: '[Spit Out] every Trick in your [Belly]. Choose one of them to cost {n} this turn.',
    flavor: 'Unpleasant. Effective. Slightly warm.',
    nums: { n: 0 },
    effect: eff(c => { const ks = belly(c); ks.forEach(k => spitOut(c, k)); if (ks[0]) U.costSet(c, ks[0], N(c).n, 'turn'); }),
    upgrade: { cost: 0, nums: { n: 0 } },
  },
  {
    id: 'taffy/taste-memory', name: 'Taste Memory', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['gummy', 'absorb'],
    text: 'Choose an [Absorb]ed Attack or Skill. Create a [Gummy] copy of it in your hand.',
    flavor: 'She remembers the shape of everything she has swallowed.',
    nums: {},
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Copy from the Belly', filter: (x) => U.flag(x, 'belly') && copyable(x) }); gummy(c, k, 'hand'); }),
    upgrade: { cost: 0 },
  },
  {
    id: 'taffy/make-it-sticky', name: 'Make It Sticky', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['retain', 'stretch'],
    text: 'One Trick gains [Retain] for the rest of combat. If it is already [Stretch]ed, also add {n} Stretch.',
    flavor: 'It is never leaving her hand again and it knows it.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Make it sticky' }); if (!k) return; U.retain(c, k, 'combat'); if (stretchOf(k) > 0) stretch(c, k, N(c).n); }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'taffy/borrowed-price', name: 'Borrowed Price', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['belly'],
    text: 'Choose one Trick in hand and one in your [Belly]. Swap their current Nerve costs until each has been played once.',
    flavor: 'The expensive one goes in the tummy and comes out cheap.',
    nums: {},
    effect: eff(async c => {
      const [a] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Trick in hand' });
      const [b] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Trick in Belly', filter: (x) => U.flag(x, 'belly') });
      if (!a || !b) return;
      const ca = U.nowCost(a), cb = U.nowCost(b);
      U.costSet(c, a, cb, 'untilPlayed'); U.costSet(c, b, ca, 'untilPlayed');
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'taffy/pull-apart', name: 'Pull Apart', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['stretch', 'split'],
    text: '[Stretch] {n} different Attacks or Skills. [Split] {m0}.',
    flavor: 'Both hands. Opposite directions. Considerable commitment.',
    nums: { n: 2, m0: 1 },
    effect: eff(async c => { const ks = await U.pickCards(c, { pile: 'hand', count: N(c).n, prompt: 'Stretch two Tricks', filter: copyable }); for (const k of ks) stretch(c, k); split(c, N(c).m0); }),
    upgrade: { cost: 0, nums: { n: 2, m0: 1 } },
  },
  {
    id: 'taffy/overstretch', name: 'Overstretch', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['stretch', 'vanish'],
    text: 'Add {n} [Stretch] to an already Stretched Trick. It gains [Vanish] when next played.',
    flavor: 'Past the point of sensible. Well past.',
    nums: { n: 2 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Overstretch', filter: (x) => stretchOf(x) > 0 }); if (k) { stretch(c, k, N(c).n); U.makeVanish(c, k); } }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'taffy/let-it-sag', name: 'Let It Sag', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['stretch'],
    text: 'Choose a [Stretch]ed Trick. Reduce its cost this turn by {n} for each Stretch it has, to a minimum of 0.',
    flavor: 'Gravity does the discounting.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Let it sag', filter: (x) => stretchOf(x) > 0 }); if (k) U.costMod(c, k, -N(c).n * stretchOf(k), 'turn'); }),
    upgrade: { nums: { n: 1, m0: 1 }, text: 'Choose a [Stretch]ed Trick. Reduce its cost this turn by {n} for each Stretch it has, to a minimum of 0. Draw {m0} Trick.' },
  },
  {
    id: 'taffy/blob-insurance', name: 'Blob Insurance', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['split', 'runny'],
    text: '[Split] {n}. You cannot lose Courage from being [Runny] before your next turn.',
    flavor: 'Underwritten by nobody, honoured anyway.',
    nums: { n: 2 },
    effect: eff(c => { split(c, N(c).n); U.applySelf(c, 'blob-insurance', 1); }),
    upgrade: { nums: { n: 2, b: 10 }, text: '[Split] {n}. Gain {b} Guard. You cannot lose Courage from being [Runny] before your next turn.' },
  },
  {
    id: 'taffy/smoosh-together', name: 'Smoosh Together', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['recombine', 'gummy'],
    text: '[Recombine] {n}. The next non-[Gummy] Attack or Skill you play this turn creates a Gummy copy of itself in your discard pile.',
    flavor: 'Pressed back together with a little too much enthusiasm.',
    nums: { n: 2 },
    effect: eff(c => { recombine(c, N(c).n); U.bump(c, 'smoosh'); }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'taffy/mouthfeel', name: 'Mouthfeel', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['belly'],
    text: 'Gain {b} Guard and draw {n} Trick for each different Trick type in your [Belly].',
    flavor: 'Attack, Skill and Power have completely different textures.',
    nums: { b: 5, n: 1 },
    effect: eff(c => { const t = new Set(belly(c).map(typeOf)).size; U.guard(c, t * N(c).b); U.draw(c, t >= 2 ? N(c).n * (t - 1) : 0); }),
    upgrade: { nums: { b: 7, n: 1 } },
  },
  {
    id: 'taffy/wrapped-up', name: 'Wrapped Up', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['absorb', 'belly'],
    text: '[Absorb] one Status or Curse from your hand for the rest of combat without using a [Belly] slot. Gain {b} Guard.',
    flavor: 'She will deal with it later. She will not deal with it later.',
    nums: { b: 10 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Absorb a Status or Curse', filter: (x) => typeOf(x) === CardType.STATUS || typeOf(x) === CardType.CURSE }); absorb(c, k, true); U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 14 } },
  },
  {
    id: 'taffy/same-again', name: 'Same Again', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['gummy'],
    text: 'Create a [Gummy] copy of the last non-Gummy Attack or Skill you played this turn. Once each turn.',
    flavor: 'Exactly that, please. Again.',
    nums: {},
    effect: eff(c => { if (!U.once(c, 'sameAgain')) return; const last = U.tf(c).lastPlayed; if (last) gummy(c, last, 'hand'); }),
    upgrade: { cost: 0 },
  },
  {
    id: 'taffy/stretch-transfer', name: 'Stretch Transfer', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['stretch'],
    text: 'Move the [Stretch]ed state and all Stretch counters from one Trick to another Attack or Skill.',
    flavor: 'The investment moves. The plan does not have to.',
    nums: {},
    effect: eff(async c => {
      const [from] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Take Stretch from', filter: (x) => stretchOf(x) > 0 });
      if (!from) return;
      const n = stretchOf(from);
      const [to] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Give Stretch to', filter: (x) => copyable(x) && x !== from });
      clearStretch(c, from);
      if (to) stretch(c, to, n);
    }),
    upgrade: { nums: { m0: 1 }, text: 'Move the [Stretch]ed state and all Stretch counters from one Trick to another Attack or Skill. Draw {m0} Trick.' },
  },
  {
    id: 'taffy/sugar-coat', name: 'Sugar Coat', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE,
    text: 'Choose one Trick. For the rest of combat, nothing can raise its cost above its printed cost. Reset it now if it already has.',
    flavor: 'A hard shell around the price.',
    nums: {},
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Sugar coat a Trick' }); if (!k) return; U.setFlag(k, 'costCapped', true); if (U.nowCost(k) > U.printedCost(k)) U.costSet(c, k, U.printedCost(k), 'combat'); }),
    upgrade: { cost: 0 },
  },
  {
    id: 'taffy/half-now-half-later', name: 'Half Now, Half Later', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['split', 'recombine'],
    text: '[Split] {m0} and draw {n} Trick. At the start of your next turn, [Recombine] {m0} if possible; if you do, draw {m1} Trick.',
    flavor: 'A plan in two instalments.',
    nums: { m0: 1, n: 1, m1: 1 },
    effect: eff(c => { split(c, N(c).m0); U.draw(c, N(c).n); const a = N(c).m0, b = N(c).m1; U.nextTurn(c, (x) => { if (recombine(x, a)) U.draw(x, b); }); }),
    upgrade: { nums: { m0: 1, n: 2, m1: 1 } },
  },

  // ── Powers (6) ────────────────────────────────────────────────────────────
  {
    id: 'taffy/elastic-memory', name: 'Elastic Memory', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['stretch'],
    text: 'The first time each turn you play a [Stretch]ed Trick, add {n} Stretch to another Stretched Trick in your hand.',
    flavor: 'The pull carries across.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'taffy/elastic-memory', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'taffy/snack-pocket', name: 'Snack Pocket', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['belly', 'absorb'],
    text: 'Increase [Belly] capacity by {n}. The first time you [Absorb] each turn, gain {b} Guard.',
    flavor: 'A second stomach, for admin.',
    nums: { n: 1, b: 6 },
    effect: eff(c => { U.mm(c).bellyCap += N(c).n; power(c, 'taffy/snack-pocket', 1); }),
    upgrade: { nums: { n: 1, b: 9 } },
  },
  {
    id: 'taffy/multipack', name: 'Multipack', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['gummy'],
    text: 'The first [Gummy] copy you create each turn costs {n} less.',
    flavor: 'Bulk discount, applied to herself.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'taffy/multipack', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'taffy/surface-tension', name: 'Surface Tension', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['glob', 'runny'],
    text: 'At the start of your turn, gain {b} Guard if you have 3 or 4 [Glob]s. If you are [Runny] instead, draw {n} Trick.',
    flavor: 'Held together by nothing but the outside of herself.',
    nums: { b: 10, n: 1 },
    effect: eff(c => power(c, 'taffy/surface-tension', 1, (x) => {
      x.e?.on?.('turn:start', () => { const g = globs(x); if (g >= 5) U.draw(x, 1); else if (g >= 3) U.guard(x, 10); });
    })),
    upgrade: { nums: { b: 14, n: 1 } },
  },
  {
    id: 'taffy/sweet-spot', name: 'Sweet Spot', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['recombine', 'glob'],
    text: 'The first time each turn a [Recombine] leaves you at exactly {n} [Glob]s, draw {m0} Trick.',
    flavor: 'Two is the correct number of pieces. She is certain of this.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => power(c, 'taffy/sweet-spot', 1)),
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'taffy/chew-cycle', name: 'Chew Cycle', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['spit-out', 'gummy', 'absorb'],
    text: 'The first time each turn you [Spit Out] a Trick, create a [Gummy] copy of a different [Absorb]ed Attack or Skill in your discard pile.',
    flavor: 'In, around, out, and out again.',
    nums: {},
    effect: eff(c => power(c, 'taffy/chew-cycle', 1)),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ───────────────────────────────────────────────────────────
  {
    id: 'taffy/whole-body-slam', name: 'Whole Body Slam', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['recombine', 'glob'],
    text: '[Recombine] all [Glob]s. Deal {d} damage plus {m0} for each one spent.',
    flavor: 'Every last piece of her, arriving as one object.',
    nums: { d: 8, m0: 11 },
    effect: eff(c => U.hit(c, N(c).d + N(c).m0 * recombine(c, globs(c)))),
    upgrade: { nums: { d: 10, m0: 14 } },
  },
  {
    id: 'taffy/splattershot', name: 'Splattershot', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: RANDOM_ENEMY, keywords: ['split', 'glob', 'runny'],
    text: '[Split] until you reach 6 [Glob]s. Deal {d} damage to a random enemy for each Glob gained. This can leave you [Runny].',
    flavor: 'A deliberate, joyful, extremely messy decision.',
    nums: { d: 8, hits: 3 },
    effect: eff(c => U.hitRandomN(c, N(c).d, split(c, 6 - globs(c)))),
    upgrade: { nums: { d: 10, hits: 3 } },
  },
  {
    id: 'taffy/jawbreaker-drop', name: 'Jawbreaker Drop', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['stretch', 'vanish'],
    text: 'Deal {d} damage. At 2 [Stretch] deal {m0} instead. At 3 Stretch deal {m1} instead, then [Vanish] this Trick.',
    flavor: 'Four turns of patience compressed into one sphere.',
    nums: { d: 18, m0: 32, m1: 52 },
    effect: eff(c => { const s = stretchOf(c.card); U.hit(c, s >= 3 ? N(c).m1 : s >= 2 ? N(c).m0 : N(c).d); if (s >= 3) { U.makeVanish(c, c.card); c.exhaust(c.card); } clearStretch(c, c.card); }),
    upgrade: { nums: { d: 23, m0: 40, m1: 64 } },
  },
  {
    id: 'taffy/three-course-chomp', name: 'Three Course Chomp', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['belly'],
    text: 'Deal {d} damage. If your [Belly] holds an Attack, deal {m0} more. A Skill: gain {b} Guard. A Power: a Trick in your hand costs {m1} less. All three can happen.',
    flavor: 'Starter, main and pudding, all currently inside her.',
    nums: { d: 14, m0: 12, b: 14, m1: 1 },
    effect: eff(async c => {
      U.hit(c, N(c).d);
      const t = new Set(belly(c).map(typeOf));
      if (t.has(ATTACK)) U.hit(c, N(c).m0);
      if (t.has(SKILL)) U.guard(c, N(c).b);
      if (t.has(POWER)) { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Reduce a cost' }); U.costMod(c, k, -N(c).m1, 'turn'); }
    }),
    upgrade: { nums: { d: 18, m0: 15, b: 18, m1: 1 } },
  },
  {
    id: 'taffy/copycat-cannon', name: 'Copycat Cannon', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: NONE, keywords: ['gummy', 'absorb'],
    text: 'Choose an [Absorb]ed Attack. Create two [Gummy] copies. Play one immediately without paying for it, and put the other in your discard pile.',
    flavor: 'Loaded with a replica of something she already ate.',
    nums: {},
    effect: eff(async c => {
      const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Copy an Absorbed Attack', filter: (x) => U.flag(x, 'belly') && typeOf(x) === ATTACK });
      if (!k) return;
      const def = gummyDef(k, 0, 0);
      gummy(c, k, 'discard');
      if (def) { U.spawn(c, def, 'hand', { gummy: true, exhaust: true, cost: 0, playImmediately: true, meta: { gummy: true } }); }
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'taffy/elastic-orbit', name: 'Elastic Orbit', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['stretch'],
    text: 'Deal {d} damage to all enemies. If played at 3 [Stretch], return this Trick to your hand once that turn with its Stretch reset and its cost increased by {n}.',
    flavor: 'All the way round the room and back to where she started.',
    nums: { d: 15, n: 1 },
    effect: eff(c => { const s = stretchOf(c.card); U.hitAll(c, N(c).d); clearStretch(c, c.card); if (s >= 3 && U.once(c, 'elasticOrbit')) { U.costMod(c, c.card, N(c).n, 'combat'); U.returnSelf(c); } }),
    upgrade: { nums: { d: 19, n: 1 } },
  },
  {
    id: 'taffy/sugar-comet', name: 'Sugar Comet', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['recombine', 'gummy'],
    text: '[Recombine] {n}. Deal {d} damage to all enemies. Every [Gummy] copy in your hand costs {m0} this turn.',
    flavor: 'Bright, fast, and stickier than any comet has a right to be.',
    nums: { d: 22, n: 3, m0: 0 },
    effect: eff(c => { recombine(c, N(c).n); U.hitAll(c, N(c).d); for (const k of U.cardsIn(c, 'hand')) if (U.flag(k, 'gummy')) U.costSet(c, k, N(c).m0, 'turn'); }),
    upgrade: { nums: { d: 28, n: 3, m0: 0 } },
  },
  {
    id: 'taffy/last-bite-first', name: 'Last Bite First', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['gummy', 'belly'],
    text: 'Deal {d} damage. Create a [Gummy] copy of a non-Gummy Attack in your discard pile, in your hand. Its cost is reduced by {n} for each Trick in your [Belly].',
    flavor: 'Pudding first. She has always eaten pudding first.',
    nums: { d: 6, n: 1 },
    effect: eff(async c => { U.hit(c, N(c).d); const [k] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Copy an Attack', filter: (x) => copyable(x) && typeOf(x) === ATTACK }); gummy(c, k, 'hand', -N(c).n * belly(c).length); }),
    upgrade: { nums: { d: 9, n: 1 } },
  },

  // ── Skills (10) ───────────────────────────────────────────────────────────
  {
    id: 'taffy/mix-everything', name: 'Mix Everything', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE,
    text: 'Choose up to {n} non-[Gummy] Tricks in your hand. Rearrange their current Nerve costs among them however you like, for the rest of combat.',
    flavor: 'The economics of the hand, redrawn by a slime.',
    nums: { n: 3 },
    effect: eff(async c => {
      const ks = await U.pickCards(c, { pile: 'hand', count: N(c).n, prompt: 'Rearrange costs', filter: (x) => !U.flag(x, 'gummy'), optional: true });
      if (ks.length < 2) return;
      const costs = ks.map(U.nowCost).sort((a, b) => a - b);
      const order = ks.slice().sort((a, b) => (U.printedCost(b) - U.printedCost(a)));
      order.forEach((k, i) => U.costSet(c, k, costs[i], 'combat'));
    }),
    upgrade: { cost: 0, nums: { n: 3 } },
  },
  {
    id: 'taffy/deep-pocket', name: 'Deep Pocket', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['belly', 'absorb'],
    text: 'Increase [Belly] capacity by {n} for the rest of combat, then [Absorb] up to {m0} Tricks from your hand and draw the same number.',
    flavor: 'There was always more room. She was being polite.',
    nums: { n: 2, m0: 2 },
    effect: eff(async c => { U.mm(c).bellyCap += N(c).n; const ks = await U.pickCards(c, { pile: 'hand', count: N(c).m0, prompt: 'Absorb Tricks', optional: true }); let got = 0; for (const k of ks) if (absorb(c, k)) got++; U.draw(c, got); }),
    upgrade: { cost: 0, nums: { n: 2, m0: 2 } },
  },
  {
    id: 'taffy/spit-the-whole-bag', name: 'Spit the Whole Bag', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['spit-out', 'belly'],
    text: '[Spit Out] every Trick in your [Belly]. Each costs {n} less this turn. If your Belly was full, draw {m0} Tricks.',
    flavor: 'Everything at once, across the parquet.',
    nums: { n: 1, m0: 2 },
    effect: eff(c => { const full = bellyFull(c); const ks = belly(c); for (const k of ks) { spitOut(c, k); U.costMod(c, k, -N(c).n, 'turn'); } if (full) U.draw(c, N(c).m0); }),
    upgrade: { cost: 0, nums: { n: 1, m0: 2 } },
  },
  {
    id: 'taffy/pull-to-the-moon', name: 'Pull to the Moon', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['stretch', 'vanish'],
    text: '[Stretch] an Attack or Skill straight to {n} Stretch. It gains [Vanish] when played.',
    flavor: 'The whole investment, immediately, with no waiting.',
    nums: { n: 3 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Stretch to 3', filter: copyable }); if (k) { stretch(c, k, N(c).n); U.setCounter(k, 'stretch', N(c).n); U.makeVanish(c, k); } }),
    upgrade: { cost: 0, nums: { n: 3 } },
  },
  {
    id: 'taffy/unsplit', name: 'Unsplit', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['recombine', 'glob'],
    text: '[Recombine] all [Glob]s. Gain {b} Guard for each, and recover {n} Courage for every 2.',
    flavor: 'Whole again, and rather pleased about it.',
    nums: { b: 8, n: 3 },
    effect: eff(c => { const g = recombine(c, globs(c)); U.guard(c, g * N(c).b); U.mend(c, Math.floor(g / 2) * N(c).n); }),
    upgrade: { nums: { b: 10, n: 4 } },
  },
  {
    id: 'taffy/perfect-replica', name: 'Perfect Replica', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['gummy', 'absorb', 'vanish'],
    text: 'Choose an [Absorb]ed Attack or Skill. Create a {n}-cost [Gummy] copy. The first time that copy is played it does not [Vanish]. Its second play does.',
    flavor: 'Indistinguishable. Slightly sweeter.',
    nums: { n: 0 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Replicate', filter: (x) => U.flag(x, 'belly') && copyable(x) }); if (!k) return; const def = gummyDef(k, 0, N(c).n); if (def) U.spawn(c, def, 'hand', { gummy: true, exhaust: false, cost: N(c).n, flags: { gummy: true, chewed: false, survivesOnce: true } }); }),
    upgrade: { cost: 1, nums: { n: 0 } },
  },
  {
    id: 'taffy/cross-flavor', name: 'Cross Flavor', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['gummy', 'absorb'],
    text: 'Create a [Gummy] copy of an [Absorb]ed Attack and one of an Absorbed Skill. If both are created, each costs {n} less this turn.',
    flavor: 'Two flavours that should not go together and do.',
    nums: { n: 1 },
    effect: eff(async c => {
      const [a] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Copy an Attack', filter: (x) => U.flag(x, 'belly') && typeOf(x) === ATTACK });
      const [s] = await U.pickCards(c, { pile: 'stash', count: 1, prompt: 'Copy a Skill', filter: (x) => U.flag(x, 'belly') && typeOf(x) === SKILL });
      const both = a && s;
      if (a) gummy(c, a, 'hand', both ? -N(c).n : 0);
      if (s) gummy(c, s, 'hand', both ? -N(c).n : 0);
    }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'taffy/candy-surgery', name: 'Candy Surgery', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['retain', 'stretch'],
    text: 'Choose two Tricks in your hand. Independently choose whether to exchange their costs, their [Retain], and their [Stretch] counters.',
    flavor: 'Anaesthetic-free and entirely painless.',
    nums: {},
    effect: eff(async c => {
      const ks = await U.pickCards(c, { pile: 'hand', count: 2, prompt: 'Operate on two Tricks' });
      if (ks.length < 2) return;
      const [a, b] = ks;
      await U.chooseOne(c, [
        { label: 'Swap costs', fn: (x) => { const ca = U.nowCost(a), cb = U.nowCost(b); U.costSet(x, a, cb, 'combat'); U.costSet(x, b, ca, 'combat'); } },
        { label: 'Swap Retain', fn: (x) => { const ra = U.flag(a, 'retain'), rb = U.flag(b, 'retain'); U.setFlag(a, 'retain', rb); U.setFlag(b, 'retain', ra); if (rb) U.retain(x, a, 'combat'); if (ra) U.retain(x, b, 'combat'); } },
        { label: 'Swap Stretch', fn: (x) => { const sa = stretchOf(a), sb = stretchOf(b); clearStretch(x, a); clearStretch(x, b); if (sb) stretch(x, a, sb); if (sa) stretch(x, b, sa); } },
      ], 3);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'taffy/keep-the-wrapper', name: 'Keep the Wrapper', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: NONE, keywords: ['gummy', 'vanish', 'chewed'],
    text: 'Choose a [Gummy] copy in your hand. It does not [Vanish] on its next play. Afterwards it behaves as a temporary Trick in your discard pile and is [Chewed].',
    flavor: 'She keeps the wrapper. She always keeps the wrapper.',
    nums: {},
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Keep a Gummy copy', filter: (x) => U.flag(x, 'gummy') }); if (k) { U.setFlag(k, 'survivesOnce', true); U.setFlag(k, 'chewed', true); c.setVanish(k, false); } }),
    upgrade: { nums: { n: 1 }, text: 'Choose a [Gummy] copy in your hand. It does not [Vanish] on its next play. Afterwards it behaves as a temporary Trick in your discard pile and is [Chewed]. Draw {n} Trick.' },
  },
  {
    id: 'taffy/melt-and-remake', name: 'Melt and Remake', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['gummy', 'vanish'],
    text: '[Vanish] one non-[Gummy] Trick from your hand for this combat. Create Gummy copies of {n} other non-Gummy Attacks or Skills in your hand.',
    flavor: 'One goes in the pot. Two come out.',
    nums: { n: 2 },
    effect: eff(async c => {
      const [sac] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Melt a Trick', filter: (x) => !U.flag(x, 'gummy') });
      if (!sac) return;
      c.exhaust(sac);
      const ks = await U.pickCards(c, { pile: 'hand', count: N(c).n, prompt: 'Remake as Gummy', filter: (x) => copyable(x) && x !== sac });
      for (const k of ks) gummy(c, k, 'hand');
    }),
    upgrade: { nums: { n: 3 } },
  },

  // ── Powers (7) ────────────────────────────────────────────────────────────
  {
    id: 'taffy/conservation-of-taffy', name: 'Conservation of Taffy', companion: SLUG, type: POWER, rarity: RARE,
    cost: 1, target: SELF, keywords: ['recombine', 'glob'],
    text: 'Once each turn, after you [Recombine] {n} or more [Glob]s, regain {m0} Glob at the end of that turn.',
    flavor: 'Taffy is neither created nor destroyed. Taffy is merely relocated.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => power(c, 'taffy/conservation-of-taffy', 1)),
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'taffy/bottomless-belly', name: 'Bottomless Belly', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['belly', 'absorb', 'spit-out'],
    text: 'Increase [Belly] capacity by {n}. Whenever you [Absorb] from your hand, draw {m0} Trick. Tricks [Spit Out] cost {m1} more that turn.',
    flavor: 'There is no bottom. There is only more Taffy.',
    nums: { n: 3, m0: 1, m1: 1 },
    effect: eff(c => { U.mm(c).bellyCap += N(c).n; power(c, 'taffy/bottomless-belly', 1); }),
    upgrade: { nums: { n: 4, m0: 1, m1: 1 } },
  },
  {
    id: 'taffy/house-of-mirrors', name: 'House of Mirrors', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['gummy'],
    text: 'The first non-[Gummy] Attack or Skill you play each turn creates a Gummy copy of itself in your discard pile. That copy costs {n} more.',
    flavor: 'Every reflection is slightly stickier than the last.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'taffy/house-of-mirrors', 1)),
    upgrade: { cost: 1, nums: { n: 1 } },
  },
  {
    id: 'taffy/runaway-puddle', name: 'Runaway Puddle', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['runny', 'gummy', 'recombine'],
    text: 'Being [Runny] no longer costs you Courage. While Runny, the first {n} [Gummy] copies you play each turn cost 0, and after each one [Recombine] {m0} if possible.',
    flavor: 'She has stopped trying to hold herself together and it is going great.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { U.applySelf(c, 'no-runny', 1); power(c, 'taffy/runaway-puddle', 1); }),
    upgrade: { cost: 1, nums: { n: 2, m0: 1 } },
  },
  {
    id: 'taffy/slow-pull', name: 'Slow Pull', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['stretch'],
    text: '[Stretch]ed Tricks gain {n} additional Stretch at the end of your turn. A Trick at 3 Stretch costs {m0} less while it remains Stretched.',
    flavor: 'Slower is better. Slower is always better.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => power(c, 'taffy/slow-pull', 1)),
    upgrade: { cost: 1, nums: { n: 1, m0: 1 } },
  },
  {
    id: 'taffy/one-big-piece', name: 'One Big Piece', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['glob', 'split', 'gummy'],
    text: 'While you have exactly 0 [Glob]s, the first non-[Gummy] Attack or Skill you play each turn repeats its damage, Guard, healing and enemy statuses once. [Split]ting turns this off until you return to 0.',
    flavor: 'Undivided attention, in the most literal possible sense.',
    nums: {},
    effect: eff(c => power(c, 'taffy/one-big-piece', 1)),
    upgrade: { cost: 1 },
  },
  {
    id: 'taffy/family-size', name: 'Family Size', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['gummy', 'chewed', 'vanish'],
    text: '[Gummy] copies no longer [Vanish] the first time they are played. They go to your discard pile [Chewed] instead, and Vanish when played again.',
    flavor: 'Sharing bag. Nobody else is getting any.',
    nums: {},
    effect: eff(c => power(c, 'taffy/family-size', 1)),
    upgrade: { cost: 1 },
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
    id: 'taffy/hold-this-for-me', name: 'Hold This for Me', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Choose a friend. They put a Trick in Taffy\'s Belly and draw {n}. At the start of their next turn it returns costing 0.',
    flavor: 'It is safe in there. It is not comfortable in there.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who needs a hand free?' });
      if (!ally) return;
      const card = (await c.askAlly(ally, {
        pool: c.allyCards(ally, 'hand'), pile: 'hand',
        prompt: 'Which one am I holding for you?',
      }))[0];
      if (!card) return;
      c.e._asSeat(ally, () => c.e.moveCard(card, 'limbo', { reason: 'taffy/hold-this-for-me' }));
      U.setFlag(card, 'belly', true);
      c.giveDraw(ally, N(c).n);
      c.e.schedule({
        turns: 1, when: 'playerTurnStart', label: 'Hold This for Me', ownerId: ally.id,
        run: () => c.e._asSeat(ally, () => {
          U.clearFlag(card, 'belly');
          c.e.moveCard(card, 'hand', { reason: 'taffy/hold-this-for-me' });
          card.costOverrideTurn = 0;
        }),
      });
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'taffy/second-helping', name: 'Second Helping', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Choose a friend. The next Trick they play this turn leaves a Gummy copy in THEIR discard, costing {n} more.',
    flavor: 'There is always more. That is the problem with Taffy.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who wants seconds?' });
      if (!ally) return;
      const more = N(c).n;
      let used = false;
      const off = c.e.on('card:play', (ev) => {
        if (used) return;
        const card = c.e.card(ev.cardUid);
        if (!card || c.e.seatOfCard(card) !== ally || card.temporary) return;
        used = true; off();
        c.e._asSeat(ally, () => gummy(c, card, 'discard', more));
      });
      U.atTurnEnd(c, () => off());
    }),
    upgrade: { nums: { n: 0 } },
  },
  {
    id: 'taffy/pass-the-piece', name: 'Pass the Piece', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Recombine up to 2 Globs. A friend gains {b} Guard per Glob spent, and draws {n} if you spent two.',
    flavor: 'A piece of her, handed over, still slightly warm.',
    nums: { b: 7, n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who are you passing to?' });
      const spent = recombine(c, Math.min(2, globs(c)));
      if (!ally || !spent) return;
      c.giveBlock(ally, N(c).b * spent);
      if (spent >= 2) c.giveDraw(ally, N(c).n);
    }),
    upgrade: { nums: { b: 10, n: 1 } },
  },
  {
    id: 'taffy/family-pack', name: 'Family Pack', companion: SLUG,
    type: POWER, rarity: RARE, cost: 2, target: SELF, coop: true,
    text: 'Once each round, the first Trick each player plays leaves a Gummy copy in THEIR OWN discard, costing {n} more.',
    flavor: 'Economy size. Nobody remembers agreeing to it.',
    nums: { n: 1 },
    effect: eff((c) => {
      power(c, 'taffy/family-pack', 1, () => {
        const more = N(c).n;
        let done = new Set();
        U.onPlayerTurn(c.e, 'start', () => { done = new Set(); });
        c.e.on('card:play', (ev) => {
          const card = c.e.card(ev.cardUid);
          const who = card && c.e.seatOfCard(card);
          if (!who || card.temporary || done.has(who.id)) return;
          done.add(who.id);
          c.e._asSeat(who, () => gummy(c, card, 'discard', more));
        });
      });
    }),
    upgrade: { nums: { n: 0 } },
  },
  {
    id: 'taffy/everybody-squeeze-in', name: 'Everybody Squeeze In', companion: SLUG,
    type: SKILL, rarity: RARE, cost: 2, target: NONE, coop: true,
    text: 'EVERY player sets aside a Trick and draws {n}. It returns costing 0 at the start of their next turn. Split 1 per friend who joined in.',
    flavor: 'The cupboard was not designed for four children and a confectionery.',
    nums: { n: 1 },
    effect: eff((c) => {
      let joined = 0;
      for (const pl of c.party()) {
        const card = (pl === c.self) ? U.handOthers(c)[0] : c.allyCards(pl, 'hand')[0];
        if (!card) continue;
        if (pl !== c.self) joined++;
        c.e._asSeat(pl, () => c.e.moveCard(card, 'limbo', { reason: 'taffy/everybody-squeeze-in' }));
        c.e.schedule({
          turns: 1, when: 'playerTurnStart', label: 'Everybody Squeeze In', ownerId: pl.id,
          run: () => c.e._asSeat(pl, () => {
            c.e.moveCard(card, 'hand', { reason: 'taffy/everybody-squeeze-in' });
            card.costOverrideTurn = 0;
          }),
        });
        if (pl === c.self) U.draw(c, N(c).n); else c.giveDraw(pl, N(c).n);
      }
      if (joined) split(c, joined);
    }),
    upgrade: { nums: { n: 2 } },
  },
];

export default {
  slug: SLUG,
  name: 'Taffy',
  title: 'the Candy Slime',
  region: 'kitchens-cellars',
  identity:
    'Taffy is the deck-manipulation Companion, and her fantasy is not "slime that makes copies" — it is ' +
    'that Tricks are physical objects she can handle. She stretches them, swallows them, spits them back ' +
    'out, makes temporary gummy replicas, pulls their costs out of shape, splits her own body into usable ' +
    'mass and smooshes it back together for the payoff. She has no turn-one efficiency at all; her best ' +
    'decks manufacture a favourable card state over several turns and then exploit it. A good Taffy turn ' +
    'is one where the player looks at a hand of familiar Tricks and realises none of them currently ' +
    'behave the way they normally do.',
  strengths: [
    'Exceptional control over what is actually circulating in the deck',
    'Turns mediocre cards into ingredients',
    'Temporarily removes awkward Tricks rather than drawing them forever',
    'Reuses key Attacks and Skills without ordinary discard recursion',
    'Unusually strong with expensive Tricks, because she can move their costs',
    'Enormous late-combat flexibility',
  ],
  weaknesses: [
    'Substantial setup cost before anything happens',
    'Stretching clogs the hand',
    'Absorbing too much leaves the deck unable to answer the current problem',
    'Too many Globs means Runny, and Runny costs Courage every enemy turn',
    'Gummy copies are temporary and worse than the original',
    'Several engines need specific Tricks in specific zones simultaneously',
    'Enemy Status generation wrecks carefully sculpted hands',
  ],
  startingHp: 76,
  startingEnergy: 3,
  mechanics: {
    globs: { name: 'Globs', kind: 'resource', desc: 'Pieces of Taffy separated from her body, 0 to 6. Split gains them, Recombine spends them. They cannot pay Trick costs. At 5 or 6 she is Runny and loses a little Courage at the end of each enemy turn — once per turn, not once per Glob.', min: 0, max: 6, hooks: ['split', 'recombine'] },
    stretch: { name: 'Stretch', kind: 'system', desc: 'A Stretched Trick Retains and gains 1 more Stretch at the end of each of your turns, to a maximum of 3. All Stretch is removed when it is played. Counters follow the physical card between zones. Stretch is deliberate hand congestion: future power bought with present hand space.', min: 0, max: 3, hooks: [] },
    belly: { name: 'Belly', kind: 'system', desc: 'A private zone with 2 slots. Absorbed Tricks leave circulation entirely — they cannot be drawn or played — but keep every combat modification and return after the fight. Spit Out moves one back to hand.', min: 0, max: 6, hooks: ['absorb', 'spitOut'] },
    gummy: { name: 'Gummy copies', kind: 'system', desc: 'Temporary replicas of an Attack or Skill. A copy takes the original’s text and current cost, starts at 0 Stretch, has Vanish, cannot be Absorbed, and can never copy itself. Duplication, never recursion.', min: 0, max: 99, hooks: ['gummy'] },
    shaping: { name: 'Card shaping', kind: 'system', desc: 'Taffy has no single keyword for this. Her Tricks directly change other Tricks: current costs, cost swaps, moving Stretch, granting Retain, granting or removing Vanish, and moving cards between hand, deck, discard and Belly. It is strongest when the hand mixes cheap and expensive Tricks.', min: 0, max: 99, hooks: [] },
  },
  startingDeck: [
    'taffy/sugar-bonk', 'taffy/sugar-bonk', 'taffy/sugar-bonk', 'taffy/sugar-bonk',
    'taffy/squish', 'taffy/squish', 'taffy/squish', 'taffy/squish',
    'taffy/pinch-off', 'taffy/long-pull',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Puddle Cycle', desc: 'Split aggressively, exploit the dispersed state, then Recombine before Runny becomes dangerous. The real question is where in the Glob cycle you want to end each turn — some cards want 0, some want 2, some want 4, some want Runny.', coreCards: ['taffy/split-splat', 'taffy/pinch-a-piece', 'taffy/blob-barrage', 'taffy/recombination-slam', 'taffy/sugar-sling', 'taffy/surface-tension', 'taffy/sweet-spot', 'taffy/whole-body-slam', 'taffy/splattershot', 'taffy/unsplit'] },
    { name: 'Long Pull', desc: 'Stretch a small number of high-value Tricks and let them mature while the rest of the deck handles the turn. The difficulty is deciding how much present hand space future power is worth.', coreCards: ['taffy/long-pull', 'taffy/pull-it-long', 'taffy/stretch-punch', 'taffy/elastic-reversal', 'taffy/overstretch', 'taffy/let-it-sag', 'taffy/stretch-transfer', 'taffy/elastic-memory', 'taffy/slow-pull', 'taffy/jawbreaker-drop', 'taffy/pull-to-the-moon'] },
    { name: 'Snack Pocket', desc: 'Use the Belly to decide which Tricks are allowed to participate in the current deck cycle. Temporary thinning, tactical storage, and a protected template for every copy effect.', coreCards: ['taffy/save-for-later', 'taffy/better-save-that', 'taffy/pocket-taffy', 'taffy/regurgitate', 'taffy/taste-memory', 'taffy/snack-pocket', 'taffy/wrapped-up', 'taffy/three-course-chomp', 'taffy/deep-pocket', 'taffy/bottomless-belly'] },
    { name: 'Candy Factory', desc: 'Manufacture Gummy copies of the Tricks worth duplicating. Copying an inefficient Trick just makes more inefficiency, and recursive copying is prohibited outright.', coreCards: ['taffy/sample-size', 'taffy/candy-wrapper', 'taffy/second-serving', 'taffy/snapback-special', 'taffy/same-again', 'taffy/smoosh-together', 'taffy/multipack', 'taffy/chew-cycle', 'taffy/house-of-mirrors', 'taffy/copycat-cannon', 'taffy/family-size'] },
    { name: 'Cost Sculptor', desc: 'Treat Nerve costs as movable properties. Give the cheap utility Trick the expensive price, give the payoff the cheap one, then discard or Absorb the card holding the bill. Worthless if every Trick costs the same.', coreCards: ['taffy/mix-the-costs', 'taffy/borrowed-price', 'taffy/let-it-sag', 'taffy/sugar-coat', 'taffy/mix-everything', 'taffy/candy-surgery', 'taffy/spit-take', 'taffy/spit-the-whole-bag'] },
  ],
};
