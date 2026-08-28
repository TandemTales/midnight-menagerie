/**
 * Count Crumbula, the Vampire Chinchilla.  OWNER: companion-cards.
 * Spec: docs/design/companions/03-crumbula.md
 *
 * Appetite (Hungry / Sated) · Bite Marks · Feed X · Queasy · Indulge ·
 * Leftovers
 *
 * Crumbula puts Bite Marks on things and eats them later. The twist is that
 * feeding is NOT automatically good: Appetite is a track with bonuses at BOTH
 * ends, so healing yourself out of Hungry costs you the Hungry cards, and
 * refusing food long enough sets up the aggressive turns.
 *
 * ── The three rules that are easy to break ──────────────────────────────────
 *
 * 1. FEED RESOLVES ONE BITE MARK AT A TIME. Cards care about becoming Sated
 *    partway through a large Feed, so `feed()` loops and re-checks rather than
 *    computing a total and applying it once.
 *
 * 2. ONE QUEASY PER FEED EFFECT, however far past maximum it goes. Counting per
 *    Bite Mark would make a single overfull Feed 3 cost three turns of Nerve.
 *
 * 3. INDULGE IS NOT DAMAGE. It ignores Guard, it counts as Courage lost, it is
 *    not an enemy Attack, and it can never take Crumbula below 1 — so an
 *    Indulge that cannot be paid safely is simply not available.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE, SPECIAL } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'crumbula';
const N = U.N;

const APPETITE = 'appetite';
const BITE = 'bite-mark';
const QUEASY = 'queasy';
const BASE_APPETITE_CAP = 6;
const BIG_APPETITE_CAP = 9;
const HUNGRY_AT = 1;      // 0 or 1
const SATED_AT = 4;       // 4 and above
const HEAL_PER_MARK = 3;

const APPETITE_DESC = 'Starts at 2 and drops by 1 at the end of every turn. Hungry at 0-1, Sated at 4 or more.';

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── Appetite ────────────────────────────────────────────────────────────────
const appetite = (c) => U.res(c, APPETITE);
const appetiteCap = (c) => (U.mm(c).bigTummy ? BIG_APPETITE_CAP : BASE_APPETITE_CAP);
const isHungry = (c) => (U.mm(c).forceHungry ? true : appetite(c) <= HUNGRY_AT);
const isSated = (c) => (U.mm(c).forceSated ? true : appetite(c) >= SATED_AT);

/** Move Appetite, firing the threshold hooks the Powers watch for. */
function setAppetite(c, n, opts = {}) {
  const s = U.mm(c);
  if (s.appetiteLocked && !opts.force) return appetite(c);
  const cap = appetiteCap(c);
  const before = appetite(c);
  const target = Math.max(0, Math.min(cap, n));
  const delta = target - before;
  if (delta !== 0) U.addRes(c, APPETITE, delta, 0, cap);
  const now = appetite(c);
  if (now !== before) {
    if (s.keepTheChange) { s.keepTheChange = false; U.draw(c, 1); U.guard(c, 4); }
    const wasHungry = before <= HUNGRY_AT;
    const wasSated = before >= SATED_AT;
    if (!wasHungry && now <= HUNGRY_AT) enteredHungry(c);
    if (!wasSated && now >= SATED_AT) enteredSated(c);
  }
  return now;
}

const addAppetite = (c, n) => setAppetite(c, appetite(c) + n);

function enteredHungry(c) {
  const s = U.mm(c);
  s.wasHungryThisTurn = true;
  if (s.velvetAppetite && U.once(c, 'enterHungry')) U.draw(c, 1);
  if (s.feastFamine && s.wasSatedThisTurn && U.once(c, 'ffHungry')) { U.energy(c, 1); U.draw(c, 1); }
  U.fire(c, 'hungry', {});
}

function enteredSated(c) {
  const s = U.mm(c);
  s.wasSatedThisTurn = true;
  if (s.velvetAppetite && U.once(c, 'enterSated')) U.draw(c, 1);
  if (s.feastFamine && s.wasHungryThisTurn && U.once(c, 'ffSated')) { U.energy(c, 1); U.draw(c, 1); }
  U.fire(c, 'sated', {});
}

// ── Bite Marks ──────────────────────────────────────────────────────────────
const marksOn = (c, e) => U.stacks(c, e, BITE);
const markedEnemies = (c) => U.enemies(c).filter((e) => marksOn(c, e) > 0);

function bite(c, e, n) {
  if (!e || n <= 0) return 0;
  const s = U.mm(c);
  let amount = n;
  if (s.doubleMarksOn && s.doubleMarksOn === (e.id ?? e.uid)) amount *= 2;
  U.apply(c, e, BITE, amount);
  if (s.napkinTuck) { s.napkinTuck = false; U.guard(c, 4); }
  U.fire(c, 'bitten', { enemy: e, amount });
  return amount;
}

/** Take marks off without eating them. Not a Feed, so no Courage and no Appetite. */
function unbite(c, e, n) {
  const have = Math.min(n, marksOn(c, e));
  if (have > 0) U.unapply(c, e, BITE, have);
  return have;
}

// ── Feed ────────────────────────────────────────────────────────────────────
/**
 * Feed X from one enemy. One Bite Mark at a time, because cards ask whether
 * Crumbula became Sated PARTWAY THROUGH — and at most one Queasy for the whole
 * effect however far past maximum it runs.
 */
function feed(c, e, x, opts = {}) {
  const s = U.mm(c);
  if (s.noFeedThisTurn) return 0;
  let eaten = 0;
  let overate = false;
  for (let i = 0; i < x; i++) {
    if (!opts.free) {
      if (!e || marksOn(c, e) <= 0) break;
      U.unapply(c, e, BITE, 1);
    }
    eaten++;
    let heal = HEAL_PER_MARK + (s.borrowedBravery ? 3 : 0);
    s.borrowedBravery = false;
    U.mend(c, heal);
    if (s.politeRefusal) s.politeRefusal = false;
    else if (appetite(c) >= appetiteCap(c)) overate = true;
    else addAppetite(c, 1);
    if (s.hospitality && U.once(c, 'hospitality')) {
      const mates = c.teammates ? c.teammates() : [];
      const worst = mates.slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (worst) { c.giveHeal(worst, HEAL_PER_MARK); addAppetite(c, 1); }
    }
  }
  if (eaten > 0) {
    s.feedsThisTurn = (s.feedsThisTurn || 0) + 1;
    if (s.wellFed && isSated(c) && U.once(c, 'wellFed')) U.guard(c, 6);
    if (s.tableForTwo) { const m = s.tableForTwo; const who = (c.party ? c.party() : []).find((p) => p.seat === m.seat); if (who) c.giveHeal(who, m.heal); }
    U.fire(c, 'fed', { enemy: e, amount: eaten });
  }
  if (overate && !s.appetiteLocked) queasy(c, 1);
  return eaten;
}

function queasy(c, n) {
  const have = U.stacks(c, c.self, QUEASY);
  const give = Math.min(n, 2 - have);
  if (give > 0) U.applySelf(c, QUEASY, give);
}

// ── Indulge ─────────────────────────────────────────────────────────────────
const canIndulge = (c, n) => (c.self.hp - n) >= 1;
/** Voluntary Courage loss. Ignores Guard, never takes him below 1. */
function indulge(c, n) {
  if (n <= 0 || !canIndulge(c, n)) return false;
  const s = U.mm(c);
  if (s.onTheHouse && U.once(c, 'onTheHouse')) { s.tab = n; return true; }
  U.bleed(c, n);
  if (s.goodNapkin) U.guard(c, n);
  s.indulgedThisTurn = true;
  if (s.countsCut && U.once(c, 'countsCut')) for (const e of U.enemies(c)) bite(c, e, 1);
  U.fire(c, 'indulged', { amount: n });
  return true;
}

// ── Leftovers ───────────────────────────────────────────────────────────────
const LEFTOVER = {
  id: 'crumbula/leftover', name: 'Leftover', companion: SLUG, type: SKILL, rarity: SPECIAL,
  cost: 0, target: SELF, exhaust: true, retain: true, keywords: ['leftover', 'feed', 'vanish'],
  text: '[Feed] {n} with no enemy and no [Bite Mark] needed. [Vanish].',
  flavor: 'Wrapped in a napkin, kept about his person.',
  nums: { n: 1 },
  effect: eff((c) => {
    feed(c, null, N(c).n, { free: true });
    const s = U.mm(c);
    if (s.connoisseur) U.guard(c, 4);
  }),
  upgrade: { nums: { n: 2 } },
};
const makeLeftovers = (c, n, pile = 'hand') => { for (let i = 0; i < n; i++) U.spawn(c, LEFTOVER, pile, { temporary: true }); };
const leftoversInHand = (c) => U.cardsIn(c, 'hand').filter((k) => (k.def && k.def.id) === 'crumbula/leftover');

const power = (c, id, n, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: APPETITE, name: 'Appetite', icon: 'appetite', min: 0, max: BASE_APPETITE_CAP, start: 2, desc: APPETITE_DESC,
      states: [{ from: 0, to: HUNGRY_AT, label: 'Hungry' },
        { from: SATED_AT, to: BIG_APPETITE_CAP, label: 'Sated' },
        { from: HUNGRY_AT + 1, to: SATED_AT - 1, label: 'Peckish' }] },
  ]);
  const fake = () => U.trackerCtx(e, seat);

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.feedsThisTurn = 0;
    st.indulgedThisTurn = false;
    st.wasHungryThisTurn = isHungry(c);
    st.wasSatedThisTurn = isSated(c);
    st.noFeedThisTurn = false;
    st.forceHungry = false;
    st.forceSated = false;
    st.politeRefusal = false;
    st.napkinTuck = false;
    st.keepTheChange = false;
    st.goodNapkin = false;
    st.doubleMarksOn = null;
    st.openBar = false;
    /* Queasy pays for itself from its own onTurnStart hook in keywords.js. It
       cannot be done here: turn:start is emitted BEFORE the Nerve refill. */
    if (st.sipSlowly) { const en = U.enemies(c).find((x) => (x.id ?? x.uid) === st.sipSlowly); if (en && marksOn(c, en) > 0) feed(c, en, 1); st.sipSlowly = null; }
    if (st.nextTurnDraw) { U.draw(c, st.nextTurnDraw); st.nextTurnDraw = 0; }
    if (st.nextTurnNerve) { U.energy(c, st.nextTurnNerve); st.nextTurnNerve = 0; }
    if (st.cheekPocket && st.cheekPocket.length) {
      for (const k of st.cheekPocket) { U.toHand(c, k); U.costSet(c, k, 0, 'turn'); }
      st.cheekPocket = [];
    }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    // An unpaid Tab comes due.
    if (st.tab) { U.bleed(c, st.tab); st.tab = 0; }
    if (st.capeClosed) { st.nextTurnGuard = (st.nextTurnGuard || 0) + st.capeClosed; st.capeClosed = 0; }
    setAppetite(c, appetite(c) - 1);
  }, seat);

  /* House Rules: marks on a dying enemy are normally lost. */
  e.on('death', (ev) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.houseRules) return;
    const dead = e.actor(ev.actorId);
    if (!dead) return;
    const had = Math.min(2, marksOn(c, dead));
    if (had <= 0) return;
    const living = U.enemies(c).filter((x) => x !== dead);
    for (let i = 0; i < had && living.length; i++) bite(c, living[i % living.length], 1);
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('fed', 'crumbula/well-fed-well-dressed', () => {});
U.onHook('indulged', 'crumbula/the-counts-cut', () => {});
U.onHook('hungry', 'crumbula/velvet-appetite', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'crumbula/tiny-nibble', name: 'Tiny Nibble', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage and apply {n} [Bite Mark].',
    flavor: 'Barely a nibble. He is very proud of it.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); bite(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 8, n: 1 } },
  },
  {
    id: 'crumbula/cape-curl', name: 'Cape Curl', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Entirely hidden, except for the ears.',
    nums: { b: 5 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'crumbula/midnight-snack', name: 'Midnight Snack', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['feed', 'sated'],
    text: '[Feed] {n}. If that makes you [Sated], gain {b} Guard.',
    flavor: 'It is always midnight somewhere in this house.',
    nums: { n: 1, b: 4 },
    effect: eff((c) => { const t = c.target || markedEnemies(c)[0]; feed(c, t, N(c).n); if (isSated(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 1, b: 7 } },
  },
  {
    id: 'crumbula/bad-idea-delicious', name: 'Bad Idea, Delicious', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['indulge', 'bite-mark'],
    text: 'Deal {d} damage. [Indulge] {i} to apply {n} [Bite Mark]s.',
    flavor: 'He knows. He does it anyway.',
    nums: { d: 7, i: 3, n: 2 },
    effect: eff((c) => { U.hit(c, N(c).d); if (indulge(c, N(c).i)) bite(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 10, i: 3, n: 3 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'crumbula/velvet-nibble', name: 'Velvet Nibble', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'hungry'],
    text: 'Deal {d} damage and apply {n} [Bite Mark]. If [Hungry], apply {m0} more.',
    flavor: 'Impeccable manners, questionable ethics.',
    nums: { d: 5, n: 1, m0: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); bite(c, c.target, N(c).n + (isHungry(c) ? N(c).m0 : 0)); }),
    upgrade: { nums: { d: 8, n: 1, m0: 2 } },
  },
  {
    id: 'crumbula/two-tiny-fangs', name: 'Two Tiny Fangs', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage twice. If the target was already marked, apply {n} [Bite Mark].',
    flavor: 'Two. He has counted them many times.',
    nums: { d: 4, n: 1, hits: 2 },
    effect: eff((c) => { const had = marksOn(c, c.target) > 0; U.hitN(c, N(c).d, 2); if (had) bite(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 6, n: 2, hits: 2 } },
  },
  {
    id: 'crumbula/dinner-bell', name: 'Dinner Bell', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage. If the target has {n}+ [Bite Mark]s, draw {c1}.',
    flavor: 'Rung once, politely, before the biting.',
    nums: { d: 7, n: 2, c1: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); if (marksOn(c, c.target) >= N(c).n) U.draw(c, N(c).c1); }),
    upgrade: { nums: { d: 10, n: 2, c1: 2 } },
  },
  {
    id: 'crumbula/no-i-can-stop', name: 'No, I Can Stop', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['indulge', 'bite-mark'],
    text: 'Deal {d} damage. [Indulge] {i} to apply {n} [Bite Mark]s, or {m0} while [Hungry].',
    flavor: 'He cannot stop.',
    nums: { d: 7, i: 3, n: 2, m0: 3 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if (indulge(c, N(c).i)) bite(c, c.target, isHungry(c) ? N(c).m0 : N(c).n);
    }),
    upgrade: { nums: { d: 10, i: 3, n: 3, m0: 4 } },
  },
  {
    id: 'crumbula/cape-and-fang', name: 'Cape and Fang', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['hungry', 'sated'],
    text: 'Deal {d} damage and gain {b} Guard. [Hungry]: {m0} more damage. [Sated]: {m1} more Guard.',
    flavor: 'Both halves of the job, at once.',
    nums: { d: 4, b: 4, m0: 3, m1: 3 },
    effect: eff((c) => {
      U.hit(c, N(c).d + (isHungry(c) ? N(c).m0 : 0));
      U.guard(c, N(c).b + (isSated(c) ? N(c).m1 : 0));
    }),
    upgrade: { nums: { d: 6, b: 6, m0: 4, m1: 4 } },
  },
  {
    id: 'crumbula/dainty-claws', name: 'Dainty Claws', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['bite-mark'],
    text: 'Deal {d} to all enemies. Apply {n} [Bite Mark] to the healthiest one.',
    flavor: 'Manicured. Genuinely.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      const best = U.enemies(c).slice().sort((a, b) => b.hp - a.hp)[0];
      if (best) bite(c, best, N(c).n);
    }),
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'crumbula/taste-test', name: 'Taste Test', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['bite-mark', 'vanish'],
    text: 'Deal {d} damage and apply {n} [Bite Mark]. [Vanish].',
    flavor: 'For research.',
    nums: { d: 3, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); bite(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 5, n: 2 } },
  },
  {
    id: 'crumbula/midnight-rush', name: 'Midnight Rush', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['hungry', 'sated', 'feed'],
    text: 'Deal {d} damage. Costs 1 while [Hungry]. If [Sated], [Feed] {n} from the target after.',
    flavor: 'Very fast, for something with such short legs.',
    nums: { d: 11, n: 1 },
    effect: eff((c) => { const sat = isSated(c); U.hit(c, N(c).d); if (sat) feed(c, c.target, N(c).n); }),
    dynamicCost: (c) => (isHungry(c) ? 1 : 2),
    upgrade: { nums: { d: 15, n: 2 } },
  },
  {
    id: 'crumbula/one-tiny-sip', name: 'One Tiny Sip', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['feed', 'vanish'],
    text: '[Feed] {n}. [Vanish].',
    flavor: 'One. He promises.',
    nums: { n: 1 },
    effect: eff((c) => feed(c, c.target || markedEnemies(c)[0], N(c).n)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'crumbula/just-a-taste', name: 'Just a Taste', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'feed'],
    text: 'Apply {n} [Bite Mark]s to an enemy, then [Feed] {m} from it.',
    flavor: 'Prepared and consumed in the same motion.',
    nums: { n: 2, m: 1 },
    effect: eff((c) => { bite(c, c.target, N(c).n); feed(c, c.target, N(c).m); }),
    upgrade: { nums: { n: 3, m: 1 } },
  },
  {
    id: 'crumbula/save-room', name: 'Save Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['appetite', 'hungry'],
    text: 'Reduce [Appetite] by {n} and gain {b} Guard. If that makes you [Hungry], draw {c1}.',
    flavor: 'For dessert. There is always dessert.',
    nums: { n: 1, b: 6, c1: 1 },
    effect: eff((c) => {
      const was = isHungry(c);
      addAppetite(c, -N(c).n);
      U.guard(c, N(c).b);
      if (!was && isHungry(c)) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 1, b: 9, c1: 2 } },
  },
  {
    id: 'crumbula/seconds', name: 'Seconds?', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['feed', 'sated'],
    text: '[Feed] {n}. If [Sated] afterwards, gain {b} Guard.',
    flavor: 'He was going to ask anyway.',
    nums: { n: 1, b: 6 },
    effect: eff((c) => { feed(c, c.target || markedEnemies(c)[0], N(c).n); if (isSated(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 9 } },
  },
  {
    id: 'crumbula/cape-closed', name: 'Cape Closed', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['sated'],
    text: 'Gain {b} Guard. If [Sated], gain {m0} Guard at the start of your next turn.',
    flavor: 'Nothing to see. Nobody home.',
    nums: { b: 6, m0: 4 },
    effect: eff((c) => { U.guard(c, N(c).b); if (isSated(c)) U.mm(c).capeClosed = N(c).m0; }),
    upgrade: { nums: { b: 9, m0: 7 } },
  },
  {
    id: 'crumbula/proper-manners', name: 'Proper Manners', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['feed'],
    text: 'Gain {b} Guard. If you have not [Feed]ed this turn, draw {c1}.',
    flavor: 'Napkin. Posture. Then the throat.',
    nums: { b: 4, c1: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); if (!(U.mm(c).feedsThisTurn || 0)) U.draw(c, N(c).c1); }),
    upgrade: { nums: { b: 7, c1: 2 } },
  },
  {
    id: 'crumbula/pocket-snack', name: 'Pocket Snack', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'leftover'],
    text: 'Remove {n} [Bite Mark] without [Feed]ing and make {m} [Leftover].',
    flavor: 'For the walk home.',
    nums: { n: 1, m: 1 },
    effect: eff((c) => { const t = c.target || markedEnemies(c)[0]; if (unbite(c, t, N(c).n) > 0) makeLeftovers(c, N(c).m); }),
    upgrade: { nums: { n: 2, m: 2 } },
  },
  {
    id: 'crumbula/worth-it', name: 'Worth It', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['indulge', 'vanish'],
    text: '[Indulge] {i}. Gain {e} Nerve and draw {c1}. [Vanish].',
    flavor: 'It was. It really was.',
    nums: { i: 3, e: 1, c1: 1 },
    effect: eff((c) => { if (indulge(c, N(c).i)) { U.energy(c, N(c).e); U.draw(c, N(c).c1); } }),
    upgrade: { nums: { i: 3, e: 1, c1: 2 } },
  },
  {
    id: 'crumbula/napkin-tuck', name: 'Napkin Tuck', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bite-mark'],
    text: 'Gain {b} Guard. Your next [Bite Mark] this turn also gains {m0} Guard.',
    flavor: 'Tucked into the collar. Every time.',
    nums: { b: 6, m0: 4 },
    effect: eff((c) => { U.guard(c, N(c).b); U.mm(c).napkinTuck = true; }),
    upgrade: { nums: { b: 9, m0: 7 } },
  },
  {
    id: 'crumbula/fussy-eater', name: 'Fussy Eater', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['appetite', 'hungry'],
    text: 'Reduce [Appetite] by {n}. If already [Hungry], gain {b} Guard instead.',
    flavor: 'Not that one. Not that one either.',
    nums: { n: 1, b: 4 },
    effect: eff((c) => { if (isHungry(c)) U.guard(c, N(c).b); else addAppetite(c, -N(c).n); }),
    upgrade: { nums: { n: 2, b: 7 } },
  },
  {
    id: 'crumbula/house-special', name: 'House Special', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'feed'],
    text: 'Choose: apply {n} [Bite Mark]s, or [Feed] {m} from it.',
    flavor: 'Whatever the kitchen has, which is you.',
    nums: { n: 2, m: 1 },
    effect: eff((c) => U.chooseOne(c, [
      { label: 'Apply ' + N(c).n + ' Bite Marks', fn: (x) => bite(x, x.target, N(x).n) },
      { label: 'Feed ' + N(c).m, fn: (x) => feed(x, x.target, N(x).m) },
    ])),
    upgrade: { nums: { n: 3, m: 2 } },
  },
  {
    id: 'crumbula/keep-the-change', name: 'Keep the Change', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['appetite'],
    text: 'The next time [Appetite] changes this turn, draw {c1} and gain {b} Guard.',
    flavor: 'Generous, for a man who eats his hosts.',
    nums: { c1: 1, b: 4 },
    effect: eff((c) => { U.mm(c).keepTheChange = true; }),
    upgrade: { nums: { c1: 2, b: 7 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (14) ──
  {
    id: 'crumbula/crossbite', name: 'Crossbite', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage twice. With {n}+ [Bite Mark]s on the target, the second deals {m0}.',
    flavor: 'Left fang, right fang, in quick succession.',
    nums: { d: 7, m0: 11, n: 2, hits: 2 },
    effect: eff((c) => { const big = marksOn(c, c.target) >= N(c).n; U.hit(c, N(c).d); U.hit(c, big ? N(c).m0 : N(c).d); }),
    upgrade: { nums: { d: 10, m0: 15, n: 2, hits: 2 } },
  },
  {
    id: 'crumbula/first-course', name: 'First Course', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['hungry', 'bite-mark'],
    text: 'Only while [Hungry]. Deal {d} damage and apply {n} [Bite Mark].',
    flavor: 'He has been looking forward to this all evening.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); bite(c, c.target, N(c).n); }),
    playable: (c) => isHungry(c),
    playableReason: 'The Count is not Hungry.',
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'crumbula/dessert-bite', name: 'Dessert Bite', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['feed', 'sated'],
    text: 'Deal {d} damage, then [Feed] {n}. If you become [Sated] doing it, draw {c1} next turn.',
    flavor: 'There is always room for this one.',
    nums: { d: 11, n: 2, c1: 1 },
    balance: { scalesWith: 'the Feed that follows it — most of this card is the Courage it gives back' },
    effect: eff((c) => {
      const was = isSated(c);
      U.hit(c, N(c).d);
      feed(c, c.target, N(c).n);
      if (!was && isSated(c)) U.mm(c).nextTurnDraw = (U.mm(c).nextTurnDraw || 0) + N(c).c1;
    }),
    upgrade: { nums: { d: 15, n: 2, c1: 2 } },
  },
  {
    id: 'crumbula/bottomless-bite', name: 'Bottomless Bite', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['feed'],
    text: 'Deal {d} damage, plus {m0} for each separate [Feed] earlier this turn, up to {n}.',
    flavor: 'There is no bottom. Nobody has found one.',
    nums: { d: 7, m0: 4, n: 3 },
    balance: { scalesWith: 'how many separate times you have already Fed this turn' },
    effect: eff((c) => { U.hit(c, N(c).d); const n = Math.min(N(c).n, U.mm(c).feedsThisTurn || 0); for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6, n: 3 } },
  },
  {
    id: 'crumbula/the-good-silverware', name: 'The Good Silverware', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage. Remove up to {n} [Bite Mark]s without [Feed]ing; {m0} more each.',
    flavor: 'Brought out for guests. Used on guests.',
    nums: { d: 14, m0: 4, n: 2 },
    effect: eff((c) => { U.hit(c, N(c).d); const got = unbite(c, c.target, N(c).n); for (let i = 0; i < got; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 19, m0: 6, n: 3 } },
  },
  {
    id: 'crumbula/velvet-ambush', name: 'Velvet Ambush', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['hungry', 'sated'],
    text: 'Deal {d} damage. [Hungry]: draw {c1}. [Sated]: gain {b} Guard.',
    flavor: 'The cape muffles absolutely everything.',
    nums: { d: 7, c1: 1, b: 6 },
    effect: eff((c) => { U.hit(c, N(c).d); if (isHungry(c)) U.draw(c, N(c).c1); if (isSated(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 10, c1: 2, b: 9 } },
  },
  {
    id: 'crumbula/taste-of-everyone', name: 'Taste of Everyone', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['bite-mark', 'feed'],
    text: 'Deal {d} to all and apply {n} [Bite Mark] each. Then [Feed] {m} from one.',
    flavor: 'A tasting menu, essentially.',
    nums: { d: 5, n: 1, m: 1 },
    balance: { scalesWith: 'the size of the room: everything takes it, everything gets marked, and then you eat' },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      for (const e of U.enemies(c)) bite(c, e, N(c).n);
      feed(c, markedEnemies(c)[0], N(c).m);
    }),
    upgrade: { nums: { d: 8, n: 1, m: 2 } },
  },
  {
    id: 'crumbula/personal-favorite', name: 'Personal Favourite', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage. Move up to {n} [Bite Mark]s from other enemies onto the target.',
    flavor: 'He has favourites. He is not ashamed of it.',
    nums: { d: 7, n: 2 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      let moved = 0;
      for (const e of U.others(c)) {
        while (moved < N(c).n && marksOn(c, e) > 0) { unbite(c, e, 1); bite(c, c.target, 1); moved++; }
      }
    }),
    upgrade: { nums: { d: 10, n: 3 } },
  },
  {
    id: 'crumbula/table-for-one', name: 'Table for One', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} damage plus {m0} for each [Bite Mark] on the target, up to {n}. Then remove one.',
    flavor: 'Candle. Napkin. No second chair.',
    nums: { d: 14, m0: 4, n: 4 },
    balance: { scalesWith: 'the Bite Marks already on the target — up to four more hits' },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const n = Math.min(N(c).n, marksOn(c, c.target));
      for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0);
      unbite(c, c.target, 1);
    }),
    upgrade: { nums: { d: 19, m0: 6, n: 4 } },
  },
  {
    id: 'crumbula/too-cute-to-refuse', name: 'Too Cute to Refuse', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['indulge'],
    text: 'Deal {d} damage. [Indulge] {i} to deal it again.',
    flavor: 'Look at him. Look at his little face.',
    nums: { d: 7, i: 3 },
    effect: eff((c) => { U.hit(c, N(c).d); if (indulge(c, N(c).i)) U.hitAt(c, c.target, N(c).d); }),
    upgrade: { nums: { d: 10, i: 3 } },
  },
  {
    id: 'crumbula/snack-attack', name: 'Snack Attack', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['leftover'],
    text: 'Deal {d} damage. You may discard a [Leftover] to deal {m0} instead.',
    flavor: 'He had one in his cheek the entire time.',
    nums: { d: 7, m0: 15 },
    effect: eff((c) => {
      const l = leftoversInHand(c)[0];
      if (l) { U.moveCard(c, l, 'discard', {}); U.hit(c, N(c).m0); }
      else U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 10, m0: 20 } },
  },
  {
    id: 'crumbula/empty-plate', name: 'Empty Plate', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['appetite', 'hungry'],
    text: 'Deal {d} damage. At exactly 0 [Appetite], deal {m1} instead, then set [Appetite] to 2.',
    flavor: 'Spotless. Alarming.',
    nums: { d: 11, m1: 24 },
    balance: { scalesWith: 'an empty Appetite — at exactly 0 this is one of the biggest hits he has' },
    effect: eff((c) => {
      if (appetite(c) === 0) { U.hit(c, N(c).m1); setAppetite(c, 2); }
      else U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 15, m1: 31 } },
  },
  {
    id: 'crumbula/finishing-nibble', name: 'Finishing Nibble', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'leftover'],
    text: 'Deal {d} damage. If it finishes the target, turn up to {n} of its [Bite Mark]s into [Leftover]s first.',
    flavor: 'Waste not.',
    nums: { d: 7, n: 2 },
    effect: eff((c) => {
      const t = c.target;
      const marks = Math.min(N(c).n, marksOn(c, t));
      const hpBefore = t ? t.hp : 0;
      U.hit(c, N(c).d);
      if (t && !t.alive && marks > 0 && hpBefore > 0) makeLeftovers(c, marks);
    }),
    upgrade: { nums: { d: 10, n: 3 } },
  },
  {
    id: 'crumbula/the-count-arrives', name: 'The Count Arrives', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 3, target: ENEMY, keywords: ['bite-mark', 'indulge'],
    text: 'Deal {d} to one enemy and {m0} to the rest. Apply {n} [Bite Mark] to each. Costs 1 less if you [Indulge]d.',
    flavor: 'He does like an entrance.',
    nums: { d: 14, m0: 5, n: 1 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      for (const e of U.others(c)) U.hitAt(c, e, N(c).m0);
      for (const e of U.enemies(c)) bite(c, e, N(c).n);
    }),
    dynamicCost: (c) => (U.mm(c).indulgedThisTurn ? 2 : 3),
    upgrade: { nums: { d: 19, m0: 7, n: 1 } },
  },

  // ── Skills (15) ──
  {
    id: 'crumbula/reserve-vintage', name: 'Reserve Vintage', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['bite-mark', 'leftover'],
    text: 'Remove up to {n} [Bite Mark]s without [Feed]ing. Make that many [Leftover]s.',
    flavor: 'Laid down years ago, for an occasion.',
    nums: { n: 2 },
    effect: eff((c) => {
      let got = 0;
      for (const e of markedEnemies(c)) { while (got < N(c).n && marksOn(c, e) > 0) { unbite(c, e, 1); got++; } }
      makeLeftovers(c, got);
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'crumbula/emergency-rations', name: 'Emergency Rations', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['leftover'],
    text: 'Discard a [Leftover]. Gain {e} Nerve and {b} Guard.',
    flavor: 'Kept for emergencies, eaten constantly.',
    nums: { e: 1, b: 10 },
    effect: eff((c) => { const l = leftoversInHand(c)[0]; if (!l) return; U.moveCard(c, l, 'discard', {}); U.energy(c, N(c).e); U.guard(c, N(c).b); }),
    playable: (c) => leftoversInHand(c).length > 0,
    playableReason: 'No Leftovers in hand.',
    upgrade: { nums: { e: 1, b: 14 } },
  },
  {
    id: 'crumbula/sip-slowly', name: 'Sip Slowly', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['feed'],
    text: '[Feed] {n} from an enemy. At the start of your next turn, [Feed] {n} from it again.',
    flavor: 'He is savouring it. It is unbearable to watch.',
    nums: { n: 1 },
    effect: eff((c) => { const t = c.target || markedEnemies(c)[0]; if (!t) return; feed(c, t, N(c).n); U.mm(c).sipSlowly = (t.id ?? t.uid); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'crumbula/clean-plate-club', name: 'Clean Plate Club', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['feed', 'queasy'],
    text: '[Feed] up to {n} from one enemy. If it makes you [Queasy], gain {b} Guard.',
    flavor: 'Membership is not optional.',
    nums: { n: 3, b: 10 },
    effect: eff((c) => {
      const before = U.stacks(c, c.self, QUEASY);
      feed(c, c.target || markedEnemies(c)[0], N(c).n);
      if (U.stacks(c, c.self, QUEASY) > before) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { n: 4, b: 14 } },
  },
  {
    id: 'crumbula/refuse-dessert', name: 'Refuse Dessert', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, exhaust: true, keywords: ['appetite', 'vanish'],
    text: 'Set [Appetite] to 0 and draw {c1}. You cannot [Feed] again this turn. [Vanish].',
    flavor: 'Through gritted, pointed teeth.',
    nums: { c1: 2 },
    effect: eff((c) => { setAppetite(c, 0); U.draw(c, N(c).c1); U.mm(c).noFeedThisTurn = true; }),
    upgrade: { nums: { c1: 3 } },
  },
  {
    id: 'crumbula/a-little-dramatic', name: 'A Little Dramatic', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['indulge'],
    text: 'Gain {b} Guard. [Indulge] {i} to draw {c1}.',
    flavor: 'The cape swirl is not strictly necessary.',
    nums: { b: 6, i: 3, c1: 2 },
    effect: eff((c) => { U.guard(c, N(c).b); if (indulge(c, N(c).i)) U.draw(c, N(c).c1); }),
    upgrade: { nums: { b: 9, i: 3, c1: 3 } },
  },
  {
    id: 'crumbula/borrowed-bravery', name: 'Borrowed Bravery', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['indulge', 'feed'],
    text: '[Indulge] {i}. Gain {b} Guard. Your next [Feed] this turn restores extra Courage.',
    flavor: 'Borrowed from himself, at ruinous interest.',
    nums: { i: 5, b: 16 },
    effect: eff((c) => { if (indulge(c, N(c).i)) { U.guard(c, N(c).b); U.mm(c).borrowedBravery = true; } }),
    upgrade: { nums: { i: 5, b: 21 } },
  },
  {
    id: 'crumbula/sip-and-squeak', name: 'Sip and Squeak', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['feed', 'bite-mark'],
    text: '[Feed] {n} from an enemy, then apply {m} [Bite Mark]s to any enemy.',
    flavor: 'The squeak is involuntary and deeply undignified.',
    nums: { n: 1, m: 2 },
    effect: eff((c) => { feed(c, c.target || markedEnemies(c)[0], N(c).n); bite(c, c.target || U.enemies(c)[0], N(c).m); }),
    upgrade: { nums: { n: 2, m: 3 } },
  },
  {
    id: 'crumbula/choice-of-vintage', name: 'Choice of Vintage', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['feed', 'leftover', 'bite-mark'],
    text: 'Choose: [Feed] {n}, make a [Leftover], or remove a [Bite Mark] for {e} Nerve.',
    flavor: 'A short but intense deliberation.',
    nums: { n: 1, e: 1 },
    effect: eff((c) => {
      const t = c.target || markedEnemies(c)[0];
      return U.chooseOne(c, [
        { label: 'Feed ' + N(c).n, fn: (x) => feed(x, t, N(x).n) },
        { label: 'Make a Leftover', fn: (x) => { if (unbite(x, t, 1) > 0) makeLeftovers(x, 1); } },
        { label: 'Gain ' + N(c).e + ' Nerve', fn: (x) => { if (unbite(x, t, 1) > 0) U.energy(x, N(x).e); } },
      ]);
    }),
    upgrade: { nums: { n: 2, e: 1 } },
  },
  {
    id: 'crumbula/please-i-insist', name: 'Please, I Insist', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark'],
    text: 'Apply {n} [Bite Mark]s. Until your next turn its Attacks hurt {m0} more.',
    flavor: 'He is holding the door. He will keep holding it.',
    nums: { n: 3, m0: 2 },
    effect: eff((c) => { bite(c, c.target, N(c).n); U.apply(c, c.target, 'empowered', N(c).m0); }),
    upgrade: { nums: { n: 4, m0: 2 } },
  },
  {
    id: 'crumbula/house-guest', name: 'House Guest', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bite-mark'],
    text: 'Move any number of [Bite Mark]s onto the target. Gain {b} Guard each, up to {n}.',
    flavor: 'Invited once, in 1893.',
    nums: { b: 4, n: 4 },
    effect: eff((c) => {
      let moved = 0;
      for (const e of U.others(c)) { while (marksOn(c, e) > 0) { unbite(c, e, 1); bite(c, c.target, 1); moved++; } }
      U.guard(c, N(c).b * Math.min(N(c).n, moved));
    }),
    upgrade: { nums: { b: 6, n: 4 } },
  },
  {
    id: 'crumbula/polite-refusal', name: 'Polite Refusal', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['feed', 'appetite', 'vanish'],
    text: 'Your next {n} [Feed]s this turn restore Courage without raising [Appetite]. [Vanish].',
    flavor: '"I couldn’t possibly." He could. He will.',
    nums: { n: 1 },
    effect: eff((c) => { U.mm(c).politeRefusal = (U.mm(c).politeRefusal || 0) + N(c).n; }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'crumbula/loosen-the-cravat', name: 'Loosen the Cravat', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['indulge', 'appetite'],
    text: '[Indulge] {i}. Reduce [Appetite] by {n} and draw {c1}.',
    flavor: 'A gentleman does not loosen his cravat. A hungry one does.',
    nums: { i: 3, n: 2, c1: 1 },
    effect: eff((c) => { if (indulge(c, N(c).i)) { addAppetite(c, -N(c).n); U.draw(c, N(c).c1); } }),
    upgrade: { nums: { i: 3, n: 2, c1: 2 } },
  },
  {
    id: 'crumbula/after-dinner-nap', name: 'After Dinner Nap', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['sated'],
    text: 'Gain {b} Guard. If [Sated], draw {c1} extra next turn.',
    flavor: 'Upside down, in a drawer.',
    nums: { b: 10, c1: 2 },
    effect: eff((c) => { U.guard(c, N(c).b); if (isSated(c)) U.mm(c).nextTurnDraw = (U.mm(c).nextTurnDraw || 0) + N(c).c1; }),
    upgrade: { nums: { b: 14, c1: 2 } },
  },
  {
    id: 'crumbula/secret-pantry', name: 'Secret Pantry', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['leftover', 'bite-mark'],
    text: 'Return up to {n} [Leftover]s from your discard pile. With none, make one from a [Bite Mark].',
    flavor: 'Behind the wine rack, behind the other wine rack.',
    nums: { n: 2 },
    effect: eff((c) => {
      const found = U.cardsIn(c, 'discard').filter((k) => (k.def && k.def.id) === 'crumbula/leftover').slice(0, N(c).n);
      if (found.length) { for (const k of found) U.toHand(c, k); return; }
      const t = markedEnemies(c)[0];
      if (t && unbite(c, t, 1) > 0) makeLeftovers(c, 1);
    }),
    upgrade: { nums: { n: 3 } },
  },

  // ── Powers (6) ──
  {
    id: 'crumbula/velvet-appetite', name: 'Velvet Appetite', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['hungry', 'sated'],
    text: 'The first time each turn you become [Hungry], and the first time you become [Sated], draw {c1}.',
    flavor: 'Both ends of the evening suit him.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'crumbula/velvet-appetite', N(c).c1, (x) => { U.mm(x).velvetAppetite = true; })),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'crumbula/house-rules', name: 'House Rules', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bite-mark'],
    text: 'When a marked enemy dies, move up to {n} of its [Bite Mark]s to the living instead of losing them.',
    flavor: 'The house has rules. He wrote them.',
    nums: { n: 2 },
    effect: eff((c) => power(c, 'crumbula/house-rules', N(c).n, (x) => { U.mm(x).houseRules = true; })),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'crumbula/connoisseur', name: 'Connoisseur', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['leftover'],
    text: 'Whenever you play a [Leftover], gain {b} Guard.',
    flavor: 'He can tell you the year. He is usually right.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'crumbula/connoisseur', N(c).b, (x) => { U.mm(x).connoisseur = true; })),
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'crumbula/the-counts-cut', name: 'The Count’s Cut', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['indulge', 'bite-mark'],
    text: 'The first time each turn you [Indulge], apply {n} [Bite Mark] to every enemy.',
    flavor: 'His percentage. Non-negotiable.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'crumbula/the-counts-cut', N(c).n, (x) => { U.mm(x).countsCut = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'crumbula/hunger-pangs', name: 'Hunger Pangs', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['hungry'],
    text: 'Your first Attack each turn while [Hungry] costs 1 less.',
    flavor: 'A small, insistent noise from under the cape.',
    nums: {},
    effect: eff((c) => power(c, 'crumbula/hunger-pangs', 1, (x) => { U.applySelf(x, 'next-attack-discount', 1); })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crumbula/well-fed-well-dressed', name: 'Well Fed, Well Dressed', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['feed', 'sated'],
    text: 'The first time each turn you [Feed] while already [Sated], gain {b} Guard.',
    flavor: 'Both, always, without exception.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'crumbula/well-fed-well-dressed', N(c).b, (x) => { U.mm(x).wellFed = true; })),
    upgrade: { nums: { b: 9 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (10) ──
  {
    id: 'crumbula/one-bite-too-many', name: 'One Bite Too Many', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['bite-mark', 'indulge', 'feed'],
    text: 'Deal {d} damage and apply {n} [Bite Mark]s. [Indulge] {i} to [Feed] {m} from it.',
    flavor: 'There is always one.',
    nums: { d: 24, n: 3, i: 8, m: 3 },
    effect: eff((c) => { U.hit(c, N(c).d); bite(c, c.target, N(c).n); if (indulge(c, N(c).i)) feed(c, c.target, N(c).m); }),
    upgrade: { nums: { d: 31, n: 3, i: 8, m: 3 } },
  },
  {
    id: 'crumbula/all-you-can-eat', name: 'All You Can Eat', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['feed', 'bite-mark'],
    text: 'Deal {d} to every enemy, then [Feed] {n} from every marked one, separately.',
    flavor: 'His favourite four words in the language.',
    nums: { d: 7, n: 1 },
    balance: { scalesWith: 'how many enemies you have marked — every one of them is a separate Feed' },
    effect: eff((c) => { U.hitAll(c, N(c).d); for (const e of markedEnemies(c)) feed(c, e, N(c).n); }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'crumbula/royal-taste-test', name: 'Royal Taste Test', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'feed'],
    text: 'Deal {d} once per [Bite Mark] on the target, up to {n}, then [Feed] {m} from it.',
    flavor: 'Somebody has to check.',
    nums: { d: 5, n: 5, m: 1 },
    balance: { scalesWith: 'every Bite Mark on the target, up to five hits' },
    effect: eff((c) => {
      const n = Math.min(N(c).n, marksOn(c, c.target));
      for (let i = 0; i < n; i++) U.hit(c, N(c).d);
      feed(c, c.target, N(c).m);
    }),
    upgrade: { nums: { d: 7, n: 5, m: 2 } },
  },
  {
    id: 'crumbula/starving-artist', name: 'Starving Artist', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['appetite', 'hungry'],
    text: 'Deal {d} damage. At exactly 0 [Appetite], deal {d} again and gain {n} [Appetite].',
    flavor: 'Suffering for the art, and for the dinner.',
    nums: { d: 14, n: 1 },
    effect: eff((c) => {
      const empty = appetite(c) === 0;
      U.hit(c, N(c).d);
      if (empty) { U.hitAt(c, c.target, N(c).d); addAppetite(c, N(c).n); }
    }),
    upgrade: { nums: { d: 19, n: 1 } },
  },
  {
    id: 'crumbula/stuffed-and-dangerous', name: 'Stuffed and Dangerous', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['appetite', 'sated'],
    text: 'Deal {d} damage plus {m0} for each [Appetite] above 3, then set [Appetite] to 0.',
    flavor: 'Round, ferocious, and slightly out of breath.',
    nums: { d: 7, m0: 7 },
    balance: { scalesWith: 'every point of Appetite over 3, and it costs you all of it' },
    effect: eff((c) => {
      const over = Math.max(0, appetite(c) - 3);
      U.hit(c, N(c).d + over * N(c).m0);
      setAppetite(c, 0);
    }),
    upgrade: { nums: { d: 10, m0: 10 } },
  },
  {
    id: 'crumbula/the-last-nibble', name: 'The Last Nibble', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['indulge', 'feed'],
    text: 'Deal {d} damage. If you have both [Indulge]d and [Feed]ed this turn, play this again free.',
    flavor: 'The last one. He says this every time.',
    nums: { d: 7 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const s = U.mm(c);
      if (s.indulgedThisTurn && (s.feedsThisTurn || 0) > 0 && U.bump(c, 'lastNibble') <= 1) U.hitAt(c, c.target, N(c).d);
    }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'crumbula/bite-the-hand', name: 'Bite the Hand That Pets Me', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['indulge', 'bite-mark'],
    text: 'Deal {d} damage. [Indulge] {i} to apply {n} [Bite Mark]s and gain {e} Nerve next turn.',
    flavor: 'He is sorry. He is not sorry.',
    nums: { d: 11, i: 8, n: 2, e: 2 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if (indulge(c, N(c).i)) { bite(c, c.target, N(c).n); U.mm(c).nextTurnNerve = (U.mm(c).nextTurnNerve || 0) + N(c).e; }
    }),
    upgrade: { nums: { d: 15, i: 8, n: 3, e: 2 } },
  },
  {
    id: 'crumbula/one-for-the-road', name: 'One for the Road', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['leftover', 'feed', 'vanish'],
    text: 'Eat any number of [Leftover]s in hand as [Feed] {m} each, then deal {d} per one, up to {n}. [Vanish].',
    flavor: 'And one for the road. And one more for the road.',
    nums: { d: 5, m: 1, n: 4 },
    balance: { scalesWith: 'however many Leftovers you have been hoarding' },
    effect: eff((c) => {
      const list = leftoversInHand(c);
      let n = 0;
      for (const k of list) { U.moveCard(c, k, 'exhaust', {}); feed(c, null, N(c).m, { free: true }); n++; }
      for (let i = 0; i < Math.min(N(c).n, n); i++) U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 7, m: 1, n: 5 } },
  },
  {
    id: 'crumbula/fangs-out-cape-up', name: 'Fangs Out, Cape Up', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['bite-mark'],
    text: 'Deal {d} to all. Gain {b} Guard per [Bite Mark] anywhere, up to {n}. Then remove one from each.',
    flavor: 'The full performance.',
    nums: { d: 14, b: 4, n: 6 },
    balance: { scalesWith: 'every Bite Mark in the room, and it clears one from each afterwards' },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      const total = U.enemies(c).reduce((n2, e) => n2 + marksOn(c, e), 0);
      U.guard(c, N(c).b * Math.min(N(c).n, total));
      for (const e of U.enemies(c)) unbite(c, e, 1);
    }),
    upgrade: { nums: { d: 19, b: 6, n: 6 } },
  },
  {
    id: 'crumbula/tiny-lord-of-the-night', name: 'Tiny Lord of the Night', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['bite-mark'],
    text: 'Deal {d} three times among enemies. Spend a [Bite Mark] for another hit, up to {n} more.',
    flavor: 'He is eleven centimetres tall and the room is his.',
    nums: { d: 5, n: 2, hits: 3 },
    effect: eff((c) => {
      U.hitN(c, N(c).d, 3);
      let extra = 0;
      for (const e of markedEnemies(c)) {
        while (extra < N(c).n && marksOn(c, e) > 0) { unbite(c, e, 1); U.hitAt(c, e, N(c).d); extra++; }
      }
    }),
    upgrade: { nums: { d: 7, n: 3, hits: 3 } },
  },

  // ── Skills (9) ──
  {
    id: 'crumbula/open-bar', name: 'Open Bar', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['bite-mark', 'feed'],
    text: 'Apply {n} [Bite Mark]s to every enemy. This turn, a [Feed] may take marks from several.',
    flavor: 'Ruinous. Traditional.',
    nums: { n: 2 },
    effect: eff((c) => { for (const e of U.enemies(c)) bite(c, e, N(c).n); U.mm(c).openBar = true; }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'crumbula/i-regret-nothing', name: 'I Regret Nothing', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['indulge', 'vanish'],
    text: '[Indulge] {i}. Gain {e} Nerve, draw {c1}, and clear all [Queasy]. [Vanish].',
    flavor: 'He regrets some of it.',
    nums: { i: 8, e: 2, c1: 3 },
    effect: eff((c) => {
      if (!indulge(c, N(c).i)) return;
      U.energy(c, N(c).e);
      U.draw(c, N(c).c1);
      const q = U.stacks(c, c.self, QUEASY);
      if (q > 0) U.unapply(c, c.self, QUEASY, q);
    }),
    playable: (c) => canIndulge(c, N(c).i),
    playableReason: 'Not enough Courage to Indulge that much.',
    upgrade: { nums: { i: 6, e: 2, c1: 3 } },
  },
  {
    id: 'crumbula/the-good-napkin', name: 'The Good Napkin', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['indulge'],
    text: 'This turn, every [Indulge] gains you Guard equal to the Courage paid.',
    flavor: 'Monogrammed. Older than the house.',
    nums: {},
    effect: eff((c) => { U.mm(c).goodNapkin = true; }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crumbula/private-cellar', name: 'Private Cellar', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['leftover', 'appetite', 'queasy'],
    text: 'Make {n} [Leftover]s. Set [Appetite] to 6 and gain {q} [Queasy].',
    flavor: 'Down the stairs, past the other stairs.',
    nums: { n: 3, q: 1 },
    effect: eff((c) => { makeLeftovers(c, N(c).n); setAppetite(c, BASE_APPETITE_CAP); queasy(c, N(c).q); }),
    upgrade: { nums: { n: 4, q: 1 } },
  },
  {
    id: 'crumbula/fast-before-feast', name: 'Fast Before Feast', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['appetite', 'hungry'],
    text: 'Set [Appetite] to 0. [Hungry] stays active this turn however high it goes.',
    flavor: 'Discipline, briefly.',
    nums: {},
    effect: eff((c) => { setAppetite(c, 0); U.mm(c).forceHungry = true; }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crumbula/feast-before-fast', name: 'Feast Before Fast', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['appetite', 'sated'],
    text: 'Set [Appetite] to 6. [Sated] stays active this turn however low it falls.',
    flavor: 'Discipline, later.',
    nums: {},
    effect: eff((c) => { setAppetite(c, BASE_APPETITE_CAP); U.mm(c).forceSated = true; }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crumbula/tuck-it-in-my-cheek', name: 'Tuck It in My Cheek', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE,
    text: 'Set aside a non-Power Trick. It returns at the start of your next turn costing 0.',
    flavor: 'Chinchillas can hold a surprising amount.',
    nums: {},
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Tuck which Trick away?', filter: (x) => String((x.type || (x.def && x.def.type)) || '').toLowerCase() !== 'power' });
      if (!k) return;
      U.moveCard(c, k, 'limbo', {});
      const st = U.mm(c);
      st.cheekPocket = st.cheekPocket || [];
      st.cheekPocket.push(k);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crumbula/the-perfect-amount', name: 'The Perfect Amount', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['appetite', 'hungry', 'sated'],
    text: 'Set [Appetite] to 3. This turn you are both [Hungry] and [Sated], and you cannot [Feed].',
    flavor: 'For one perfect moment, everything is correct.',
    nums: {},
    effect: eff((c) => {
      setAppetite(c, 3);
      const s = U.mm(c);
      s.forceHungry = true; s.forceSated = true; s.noFeedThisTurn = true;
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crumbula/midnight-reservation', name: 'Midnight Reservation', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['bite-mark', 'feed'],
    text: '[Bite Mark]s on the target are doubled this turn. You cannot [Feed] from it until next turn.',
    flavor: 'Booked. Under a false name.',
    nums: {},
    effect: eff((c) => { if (c.target) U.mm(c).doubleMarksOn = (c.target.id ?? c.target.uid); }),
    upgrade: { cost: 0 },
  },

  // ── Powers (6) ──
  {
    id: 'crumbula/eternal-hunger', name: 'Eternal Hunger', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['appetite', 'hungry', 'queasy'],
    text: 'Set [Appetite] to 0 and lock it. [Feed] still heals, but never raises it or makes you [Queasy].',
    flavor: 'He has made his peace with it.',
    nums: {},
    effect: eff((c) => power(c, 'crumbula/eternal-hunger', 1, (x) => { setAppetite(x, 0, { force: true }); U.mm(x).appetiteLocked = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'crumbula/bottomless-tummy', name: 'Bottomless Tummy', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['appetite', 'sated'],
    text: 'Maximum [Appetite] becomes 9. Above 6, Attacks cost 1 more and your first Skill costs 1 less.',
    flavor: 'Physically implausible. Verified.',
    nums: {},
    effect: eff((c) => power(c, 'crumbula/bottomless-tummy', 1, (x) => { raiseAppetiteCap(x); })),
    upgrade: { cost: 2 },
  },
  {
    id: 'crumbula/on-the-house', name: 'On the House', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['indulge', 'feed'],
    text: 'Your first [Indulge] each turn goes on the Tab. The next [Feed] clears it but heals nothing.',
    flavor: 'He is good for it.',
    nums: {},
    effect: eff((c) => power(c, 'crumbula/on-the-house', 1, (x) => { U.mm(x).onTheHouse = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crumbula/endless-pantry', name: 'Endless Pantry', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['leftover'],
    text: '[Leftover]s cost 1 and no longer [Vanish] — they go to your discard pile and come round again.',
    flavor: 'It is not endless. It is simply very large.',
    nums: {},
    effect: eff((c) => power(c, 'crumbula/endless-pantry', 1, (x) => { U.mm(x).endlessPantry = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crumbula/not-dead-just-napping', name: 'Not Dead, Just Napping', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['appetite'],
    text: 'Once per combat, lethal damage leaves you at 1 Courage. Set [Appetite] to 0 and discard your hand.',
    flavor: 'A common misunderstanding, and one he encourages.',
    nums: {},
    effect: eff((c) => power(c, 'crumbula/not-dead-just-napping', 1, (x) => { U.applySelf(x, 'not-dead-yet', 1); })),
    upgrade: { cost: 2 },
  },
  {
    id: 'crumbula/feast-and-famine', name: 'Feast and Famine', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['hungry', 'sated'],
    text: 'Swinging from [Hungry] to [Sated] or back, once each per turn, gains {e} Nerve and draws {c1}.',
    flavor: 'The whole evening, in miniature, repeatedly.',
    nums: { e: 1, c1: 1 },
    effect: eff((c) => power(c, 'crumbula/feast-and-famine', 1, (x) => { U.mm(x).feastFamine = true; })),
    upgrade: { cost: 2 },
  },
];

/** Bottomless Tummy moves the ceiling, and the HUD has to say so. */
function raiseAppetiteCap(c) {
  const s = U.mm(c);
  if (s.bigTummy) return;
  s.bigTummy = true;
  c.e.defineCounter({
    id: APPETITE, name: 'Appetite', icon: 'appetite', min: 0, max: BIG_APPETITE_CAP, start: appetite(c), ownerId: c.self.id,
    desc: 'Bottomless Tummy has raised the ceiling to 9. Hungry at 0-1, Sated at 4 or more.',
    states: [{ from: 0, to: HUNGRY_AT, label: 'Hungry' }, { from: SATED_AT, to: BIG_APPETITE_CAP, label: 'Sated' }],
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'crumbula/table-for-two', name: 'Table for Two', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['feed'],
    text: 'You and a chosen Kid gain {b} Guard. If you [Feed] later this turn, they recover {h} Courage.',
    flavor: 'He has set two places. Only one of you is eating.',
    nums: { b: 6, h: 3 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      U.guard(c, N(c).b);
      if (!ally) return;
      c.giveBlock(ally, N(c).b);
      U.mm(c).tableForTwo = { seat: ally.seat, heal: N(c).h };
    }),
    upgrade: { nums: { b: 9, h: 5 } },
  },
  {
    id: 'crumbula/pass-the-plate', name: 'Pass the Plate', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['bite-mark', 'leftover'],
    text: 'Turn up to {n} [Bite Mark]s into [Leftover]s in a friend’s hand. Theirs restore Courage.',
    flavor: 'Sharing. He has read about it.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      let got = 0;
      for (const e of markedEnemies(c)) { while (got < N(c).n && marksOn(c, e) > 0) { unbite(c, e, 1); got++; } }
      for (let i = 0; i < got; i++) c.giveCard(ally, LEFTOVER, 'hand');
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'crumbula/everybody-gets-a-cape', name: 'Everybody Gets a Cape', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['sated', 'hungry'],
    text: 'Each round: the first time you become [Sated] every Kid gains {b} Guard; [Hungry] draws them {c1}.',
    flavor: 'Small capes. Everybody looks ridiculous. Nobody minds.',
    nums: { b: 4, c1: 1 },
    effect: eff((c) => power(c, 'crumbula/everybody-gets-a-cape', 1, (x) => { U.mm(x).capesForAll = { b: N(x).b, draw: N(x).c1 }; })),
    upgrade: { nums: { b: 7, c1: 1 } },
  },
  {
    id: 'crumbula/family-banquet', name: 'Family Banquet', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bite-mark', 'feed'],
    text: 'This round, the first time each Kid damages a marked enemy, remove a [Bite Mark] and heal them {h}.',
    flavor: 'Everybody round the long table.',
    nums: { h: 4 },
    effect: eff((c) => { U.mm(c).familyBanquet = { heal: N(c).h, used: [] }; }),
    upgrade: { nums: { h: 6 } },
  },
  {
    id: 'crumbula/the-counts-hospitality', name: 'The Count’s Hospitality', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['feed', 'appetite'],
    text: 'Each round your first [Feed] also heals the weakest Kid {h} — and costs you {n} extra [Appetite].',
    flavor: 'Generous to a fault. The fault is the Appetite.',
    nums: { n: 1, h: 3 },
    effect: eff((c) => power(c, 'crumbula/the-counts-hospitality', N(c).n, (x) => { U.mm(x).hospitality = N(x).h; })),
    upgrade: { nums: { n: 1, h: 6 } },
  },
];

export default {
  slug: SLUG,
  name: 'Count Crumbula',
  title: 'the Vampire Chinchilla',
  region: 'ballroom',
  identity:
    'Crumbula puts Bite Marks on things and eats them later. The trick is that feeding is not simply ' +
    'good: Appetite is a track with rewards at BOTH ends, so healing yourself out of Hungry costs you ' +
    'every Hungry card in your deck, and going without long enough sets up the biggest turns he has. ' +
    'Indulge lets him spend Courage directly for tempo, Leftovers let him carry a meal away from an ' +
    'enemy that is about to die, and Queasy is the bill that arrives when he eats past full.',
  strengths: [
    'Sustain that is genuinely his own — Bite Marks are stored healing he chooses when to spend',
    'Rewards at both ends of the Appetite track, so there is always a direction to push',
    'Indulge converts Courage into immediate tempo when the feeding engine can repay it',
    'Leftovers rescue value from an enemy that is about to die',
    'Very strong in long fights with several targets to mark',
  ],
  weaknesses: [
    'Bite Marks do nothing at all until something eats them',
    'Marks on a dying enemy are simply lost',
    'Feeding out of Hungry switches off half the deck',
    'Overeating costs Nerve on the turn after, which is usually the turn that mattered',
    'Indulge is real Courage, and a deck that Indulges without feeding will kill him',
    'Sitting comfortably in the middle of the track is the worst place to be',
  ],
  startingHp: 74,
  startingEnergy: 3,
  mechanics: {
    appetite: { name: 'Appetite', kind: 'resource', desc: 'A 0-6 track starting at 2 and dropping 1 each turn. Hungry at 0-1, Sated at 4+. Both ends pay.', min: 0, max: 9, hooks: ['hungry', 'sated'] },
    bite: { name: 'Bite Marks', kind: 'status', desc: 'A stacking enemy status that does nothing by itself — a prepared meal. Lost when the enemy dies.', min: 0, max: 99, hooks: ['bitten'] },
    feed: { name: 'Feed X', kind: 'system', desc: 'Remove up to X Bite Marks; each restores Courage and raises Appetite by 1. Resolves one mark at a time.', min: 0, max: 9, hooks: ['fed'] },
    queasy: { name: 'Queasy', kind: 'status', desc: 'Eating past maximum. One per Feed effect, stacks to 2, and costs that much Nerve at the start of your next turn.', min: 0, max: 2, hooks: [] },
    indulge: { name: 'Indulge', kind: 'system', desc: 'Voluntary Courage loss. Ignores Guard, counts as Courage lost, is not enemy damage, and never takes him below 1.', min: 0, max: 99, hooks: ['indulged'] },
    leftover: { name: 'Leftovers', kind: 'system', desc: 'A temporary 0-Nerve Trick that Feeds 1 with no enemy needed. Retains, then Vanishes.', min: 0, max: 99, hooks: [] },
  },
  startingDeck: [
    'crumbula/tiny-nibble', 'crumbula/tiny-nibble', 'crumbula/tiny-nibble', 'crumbula/tiny-nibble',
    'crumbula/cape-curl', 'crumbula/cape-curl', 'crumbula/cape-curl', 'crumbula/cape-curl',
    'crumbula/midnight-snack', 'crumbula/bad-idea-delicious',
  ],
  cards: [...basics, LEFTOVER, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Famished Fangs', desc: 'Stay at 0 or 1 Appetite as much of the fight as you can bear and live on the Hungry bonuses. Enormously aggressive, and one careless Feed switches it all off.', coreCards: ['crumbula/velvet-nibble', 'crumbula/first-course', 'crumbula/save-room', 'crumbula/fussy-eater', 'crumbula/hunger-pangs', 'crumbula/empty-plate', 'crumbula/fast-before-feast', 'crumbula/eternal-hunger'] },
    { name: 'The Long Dinner', desc: 'Mark everything, then eat steadily. Sustain that outlasts anything in the house, provided the marked enemy stays alive long enough to be eaten.', coreCards: ['crumbula/just-a-taste', 'crumbula/seconds', 'crumbula/sip-slowly', 'crumbula/all-you-can-eat', 'crumbula/clean-plate-club', 'crumbula/well-fed-well-dressed', 'crumbula/house-rules'] },
    { name: 'Indulgence', desc: 'Spend Courage for tempo and trust the feeding to repay it. The most dangerous way to play him and the fastest.', coreCards: ['crumbula/no-i-can-stop', 'crumbula/worth-it', 'crumbula/a-little-dramatic', 'crumbula/borrowed-bravery', 'crumbula/i-regret-nothing', 'crumbula/the-good-napkin', 'crumbula/the-counts-cut', 'crumbula/on-the-house'] },
    { name: 'The Pantry', desc: 'Convert Bite Marks into Leftovers and carry your healing with you, safe from anything dying at the wrong moment.', coreCards: ['crumbula/pocket-snack', 'crumbula/reserve-vintage', 'crumbula/emergency-rations', 'crumbula/secret-pantry', 'crumbula/snack-attack', 'crumbula/one-for-the-road', 'crumbula/connoisseur', 'crumbula/endless-pantry'] },
    { name: 'Feast and Famine', desc: 'Swing deliberately between both ends of the track, collecting the bonuses on the way past. The hardest to pilot and the highest ceiling.', coreCards: ['crumbula/velvet-appetite', 'crumbula/keep-the-change', 'crumbula/stuffed-and-dangerous', 'crumbula/starving-artist', 'crumbula/feast-before-fast', 'crumbula/the-perfect-amount', 'crumbula/feast-and-famine', 'crumbula/bottomless-tummy'] },
  ],
};
