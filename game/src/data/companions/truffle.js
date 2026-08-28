/**
 * Truffle, the Zombie Hedgehog.  OWNER: companion-cards.
 * Spec: docs/design/companions/09-truffle.md
 *
 * Quills · Shed · Loose Quills · Gather · Regrow · Bristle · Ragged
 *
 * Truffle has two pools of the same resource: the Quills attached to him, and
 * the ones scattered across the floor. Most of his good decks move Quills back
 * and forth between the two rather than treating either as finite.
 *
 * ── The two rules that decide whether he works ──────────────────────────────
 *
 * 1. BRISTLE IS NOT "WHEN ATTACKED". It fires only when an enemy Attack
 *    actually costs Truffle Courage, after Guard and every other prevention —
 *    so a hit absorbed entirely by Guard does nothing, and a Bristle turn is
 *    one where he deliberately lets a manageable hit through. It runs on the
 *    `onCourageLoss` step added for Mopsy's Cushion, which is the only point in
 *    `damage.js` that can see the figure it is defined against.
 *
 * 2. ONE ATTACK ACTION TRIGGERS IT ONCE, however many hits that action
 *    contains. A four-hit move must not consume four Bristle, so triggers are
 *    deduped per attacker for the enemy turn rather than counted per hit.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'truffle';
const N = U.N;

const QUILLS = 'quills';
const LOOSE = 'loose-quills';
const BRISTLE = 'bristle';
const BASE_QUILL_CAP = 12;
const OVER_CAP = 6;          // Grows Back Wrong
const START_QUILLS = 6;

const ATTACK_INTENTS = new Set(['attack', 'attackBig', 'attackDefend', 'attackBuff', 'attackDebuff']);

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── Quills, Loose Quills ────────────────────────────────────────────────────
const quills = (c) => U.res(c, QUILLS);
const loose = (c) => U.res(c, LOOSE);
const quillCap = (c) => BASE_QUILL_CAP + (U.mm(c).growsWrong ? OVER_CAP : 0);
const isRagged = (c) => c.self.hp <= Math.ceil(c.self.maxHp * (U.mm(c).closeEnough ? 0.75 : 0.5));

function addQuills(c, n) {
  if (n <= 0) return 0;
  const before = quills(c);
  const give = Math.min(n, Math.max(0, quillCap(c) - before));
  if (give <= 0) return 0;
  U.addRes(c, QUILLS, give, 0, quillCap(c));
  return quills(c) - before;
}

function addLoose(c, n) {
  if (n <= 0) return 0;
  U.addRes(c, LOOSE, n, 0, 99);
  return n;
}

/** Shed X: move X off Truffle and onto the floor. */
function shed(c, n) {
  const have = Math.min(n, quills(c));
  if (have <= 0) return 0;
  U.addRes(c, QUILLS, -have, 0, quillCap(c));
  addLoose(c, have);
  const s = U.mm(c);
  s.shedThisTurn = (s.shedThisTurn || 0) + have;
  if (s.allSpines && U.once(c, 'allSpines')) U.guard(c, 4);
  if (s.shedCycle && U.once(c, 'shedCycle')) s.regrowNextTurn = (s.regrowNextTurn || 0) + 1;
  U.fire(c, 'shed', { amount: have });
  return have;
}

/** Gather X: pick up to X off the floor, never past the cap. */
function gather(c, n) {
  const want = Math.min(n, loose(c));
  const room = Math.max(0, quillCap(c) - quills(c));
  const got = Math.min(want, room);
  if (got <= 0) return 0;
  U.addRes(c, LOOSE, -got, 0, 99);
  U.addRes(c, QUILLS, got, 0, quillCap(c));
  const s = U.mm(c);
  if (s.unpleasantGeometry) { for (let i = 0; i < Math.min(3, got); i++) U.hitRandom(c, 4); }
  if (s.moreWhereThat && got >= 2 && U.once(c, 'moreWhere')) bristle(c, 2);
  if (s.floorIsMine && U.once(c, 'floorIsMine')) U.draw(c, 1);
  U.fire(c, 'gather', { amount: got });
  return got;
}

/** Regrow X: brand new Quills, no Loose Quills consumed. */
const regrow = (c, n) => addQuills(c, n);

/** Spend Loose Quills as ammunition. The Carpet Remembers refunds the first lot. */
function spendLoose(c, n) {
  const have = Math.min(n, loose(c));
  if (have <= 0) return 0;
  const s = U.mm(c);
  if (s.carpetRemembers && U.once(c, 'carpetRemembers')) return have;   // full benefit, none removed
  U.addRes(c, LOOSE, -have, 0, 99);
  if (s.floorIsMine && U.once(c, 'floorIsMine')) U.draw(c, 1);
  return have;
}

// ── Bristle ─────────────────────────────────────────────────────────────────
const bristleOn = (c) => U.stacks(c, c.self, BRISTLE);
function bristle(c, n) { if (n > 0) U.applySelf(c, BRISTLE, n); }
function unbristle(c, n) {
  const have = Math.min(n, bristleOn(c));
  if (have > 0) U.unapply(c, c.self, BRISTLE, have);
  return have;
}

const power = (c, id, n, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: QUILLS, name: 'Quills', icon: 'quills', min: 0, max: BASE_QUILL_CAP, start: START_QUILLS,
      desc: 'The spines currently attached to Truffle.',
      states: [{ at: 0, label: 'Bare' }, { from: BASE_QUILL_CAP, to: BASE_QUILL_CAP + OVER_CAP, label: 'Full' }] },
    { id: LOOSE, name: 'Loose Quills', icon: 'loose-quills', min: 0, max: 99, start: 0,
      desc: 'Shed Quills, lying about the room until Gathered or spent.' },
  ]);
  const fake = () => U.trackerCtx(e, seat);

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.shedThisTurn = 0;
    st.lostCourageLastEnemyTurn = st.lostCourageThisEnemyTurn || false;
    st.lostCourageThisEnemyTurn = false;
    st.bristledLastEnemyTurn = st.bristledThisEnemyTurn || false;
    st.bristledThisEnemyTurn = false;
    // Bristle expires unless Permanent Bad Hair Day says otherwise.
    if (!st.permanentBristle) { const n = bristleOn(c); if (n > 0) unbristle(c, n); }
    if (st.regrowNextTurn) { regrow(c, st.regrowNextTurn); st.regrowNextTurn = 0; }
    if (st.guardNextTurn) { U.guard(c, st.guardNextTurn); st.guardNextTurn = 0; }
    if (st.nerveNextTurn) { U.energy(c, st.nerveNextTurn); st.nerveNextTurn = 0; }
    if (st.drawNextTurn) { U.draw(c, st.drawNextTurn); st.drawNextTurn = 0; }
    if (!st.raggedSeen && isRagged(c)) { st.raggedSeen = true; if (st.barelyHolding) U.draw(c, 2); }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    if (st.quillCarpet && loose(c) >= 4) U.hitAll(c, 4);
    if (st.wretchedMiracle && isRagged(c) && c.self.block === 0) bristle(c, 1);
    if (st.stillWiggling && isRagged(c) && c.self.block === 0 && bristleOn(c) >= 1) {
      st.nerveNextTurn = (st.nerveNextTurn || 0) + 1;
      st.drawNextTurn = (st.drawNextTurn || 0) + 1;
    }
    // Grows Back Wrong: anything above the normal cap falls off overnight.
    if (st.growsWrong) {
      const over = quills(c) - BASE_QUILL_CAP;
      if (over > 0) { U.addRes(c, QUILLS, -over, 0, quillCap(c)); addLoose(c, over); }
    }
  }, seat);

  /* Reset the once-per-Attack dedup when the enemy phase is over. */
  e.on('phase', (ev) => {
    if (ev && ev.phase === 'enemyPhaseEnd') U.mm(fake()).bristledBy = null;
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('shed', 'truffle/shed-cycle', () => {});
U.onHook('gather', 'truffle/more-where-that-came-from', () => {});
U.onHook('bristled', 'truffle/hard-to-finish', (c) => {
  U.mm(c).guardNextTurn = (U.mm(c).guardNextTurn || 0) + 4;
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'truffle/zombie-nibble', name: 'Zombie Nibble', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'He is not fussy and he is not in a hurry.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'truffle/round-up', name: 'Round Up', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'A ball, more or less. Mostly less.',
    nums: { b: 5 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'truffle/prickle-up', name: 'Prickle Up', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['bristle', 'regrow'],
    text: 'Gain {n} [Bristle] and [Regrow] {g}.',
    flavor: 'Everything that can point outwards, does.',
    nums: { n: 1, g: 1 },
    effect: eff((c) => { bristle(c, N(c).n); regrow(c, N(c).g); }),
    upgrade: { nums: { n: 2, g: 1 } },
  },
  {
    id: 'truffle/oops-a-quill', name: 'Oops, a Quill', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['shed', 'loose-quill'],
    text: 'Deal {d} damage and [Shed] {n}.',
    flavor: 'They come out. They have always come out.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); shed(c, N(c).n); }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'truffle/found-it', name: 'Found It', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 0, target: SELF, keywords: ['gather', 'loose-quill'],
    text: '[Gather] {n}. If a Quill came back, gain {b} Guard.',
    flavor: 'Under the rug, where he left it.',
    nums: { n: 1, b: 4 },
    effect: eff((c) => { if (gather(c, N(c).n) > 0) U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 6 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'truffle/pokey-nibble', name: 'Pokey Nibble', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage, plus {m0} if you have [Shed] this turn.',
    flavor: 'Pokier than it looks.',
    nums: { d: 5, m0: 3 },
    effect: eff((c) => U.hit(c, N(c).d + ((U.mm(c).shedThisTurn || 0) > 0 ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 4 } },
  },
  {
    id: 'truffle/back-into-them', name: 'Back Into Them', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. If the target intends to Attack, gain {n} [Bristle].',
    flavor: 'Reverse, at speed, without looking.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) bristle(c, N(c).n);
    }),
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'truffle/shed-happens', name: 'Shed Happens', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage and [Shed] {n}. With no Quill to Shed, deal only {m0}.',
    flavor: 'It does. Constantly.',
    nums: { d: 7, m0: 4, n: 1 },
    effect: eff((c) => { const got = shed(c, N(c).n); U.hit(c, got > 0 ? N(c).d : N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6, n: 1 } },
  },
  {
    id: 'truffle/scuttle-through', name: 'Scuttle Through', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['gather'],
    text: 'Deal {d} to all enemies. With a [Loose Quill] on the floor, [Gather] {n}.',
    flavor: 'Straight through the middle of everything.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => { U.hitAll(c, N(c).d); if (loose(c) > 0) gather(c, N(c).n); }),
    upgrade: { nums: { d: 7, n: 2 } },
  },
  {
    id: 'truffle/floor-sweep', name: 'Floor Sweep', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['loose-quill'],
    text: 'Spend up to {n} [Loose Quill]s for {d} each, then deal {d} anyway.',
    flavor: 'Everything on the carpet, in one direction.',
    nums: { d: 5, n: 2 },
    balance: { scalesWith: 'the Loose Quills lying about — up to two extra hits' },
    effect: eff((c) => { const spent = spendLoose(c, N(c).n); for (let i = 0; i < spent; i++) U.hit(c, N(c).d); U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 7, n: 3 } },
  },
  {
    id: 'truffle/tiny-quill-flick', name: 'Tiny Quill Flick', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['shed', 'vanish'],
    text: '[Shed] {n} to deal {d} damage. [Vanish].',
    flavor: 'A flick. Barely a gesture.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => { if (shed(c, N(c).n) > 0) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 8, n: 1 } },
  },
  {
    id: 'truffle/wrong-end-first', name: 'Wrong End First', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. Costs 1 less if [Bristle] triggered during the last enemy turn.',
    flavor: 'It is all the wrong end, really.',
    nums: { d: 14 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (U.mm(c).bristledLastEnemyTurn ? 1 : 2),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'truffle/gnaw-through-it', name: 'Gnaw Through It', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['ragged'],
    text: 'Deal {d} damage. While [Ragged], follow with {m0} more.',
    flavor: 'Slowly. Extremely slowly. But through.',
    nums: { d: 7, m0: 5 },
    effect: eff((c) => { U.hit(c, N(c).d); if (isRagged(c)) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 7 } },
  },
  {
    id: 'truffle/hunch-up', name: 'Hunch Up', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['ragged'],
    text: 'Gain {b} Guard, or {m0} while [Ragged].',
    flavor: 'The whole animal, folded inwards.',
    nums: { b: 8, m0: 12 },
    effect: eff((c) => U.guard(c, isRagged(c) ? N(c).m0 : N(c).b)),
    upgrade: { nums: { b: 12, m0: 17 } },
  },
  {
    id: 'truffle/just-enough', name: 'Just Enough', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard. If an Attack would still get through it, gain {n} [Bristle].',
    flavor: 'Just enough, and not one bit more.',
    nums: { b: 5, n: 1 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      const through = U.enemies(c).some((e2) => {
        const m = e2.pendingMove;
        return m && ATTACK_INTENTS.has(m.intent) && (m.damage || 0) > c.self.block;
      });
      if (through) bristle(c, N(c).n);
    }),
    upgrade: { nums: { b: 8, n: 2 } },
  },
  {
    id: 'truffle/pointy-side-out', name: 'Pointy Side Out', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bristle', 'regrow'],
    text: 'Gain {n} [Bristle]. [Regrow] {g}.',
    flavor: 'There is no other side.',
    nums: { n: 2, g: 1 },
    effect: eff((c) => { bristle(c, N(c).n); regrow(c, N(c).g); }),
    upgrade: { nums: { n: 3, g: 2 } },
  },
  {
    id: 'truffle/shake-it-loose', name: 'Shake It Loose', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bristle', 'shed'],
    text: 'Remove up to {b} of your Guard. If any went, gain {n} [Bristle] and [Shed] {g}.',
    flavor: 'Giving up the armour to get the spines.',
    nums: { b: 6, n: 2, g: 1 },
    effect: eff((c) => {
      const had = Math.min(N(c).b, c.self.block);
      if (had <= 0) return;
      U.stripGuard(c, c.self, had);
      bristle(c, N(c).n);
      shed(c, N(c).g);
    }),
    upgrade: { nums: { b: 6, n: 3, g: 1 } },
  },
  {
    id: 'truffle/pick-it-back-up', name: 'Pick It Back Up', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['gather', 'vanish'],
    text: '[Gather] {n}. If a Quill came back, draw {c1}. [Vanish].',
    flavor: 'Waste not.',
    nums: { n: 1, c1: 1 },
    effect: eff((c) => { if (gather(c, N(c).n) > 0) U.draw(c, N(c).c1); }),
    upgrade: { nums: { n: 2, c1: 2 } },
  },
  {
    id: 'truffle/grow-back-weird', name: 'Grow Back Weird', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['regrow'],
    text: '[Regrow] {g}.',
    flavor: 'At angles. Always at angles.',
    nums: { g: 3 },
    effect: eff((c) => regrow(c, N(c).g)),
    upgrade: { nums: { g: 5 } },
  },
  {
    id: 'truffle/bend-dont-break', name: 'Bend, Don’t Break', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard. If an Attack still costs you Courage this turn, gain {n} [Bristle].',
    flavor: 'He has bent a very long way.',
    nums: { b: 5, n: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); U.mm(c).bendDontBreak = N(c).n; }),
    upgrade: { nums: { b: 8, n: 2 } },
  },
  {
    id: 'truffle/still-good', name: 'Still Good', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF,
    text: 'Gain {b} Guard, or {m0} if you lost Courage during the last enemy turn.',
    flavor: 'Debatable, but he is committed to the position.',
    nums: { b: 6, m0: 10 },
    effect: eff((c) => U.guard(c, U.mm(c).lostCourageLastEnemyTurn ? N(c).m0 : N(c).b)),
    upgrade: { nums: { b: 9, m0: 14 } },
  },
  {
    id: 'truffle/shake-and-scoot', name: 'Shake and Scoot', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['shed'],
    text: 'Gain {b} Guard, [Shed] {n}, then draw {c1}.',
    flavor: 'A shake, then a scoot. In that order.',
    nums: { b: 4, n: 1, c1: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); shed(c, N(c).n); U.draw(c, N(c).c1); }),
    upgrade: { nums: { b: 7, n: 1, c1: 2 } },
  },
  {
    id: 'truffle/carpet-check', name: 'Carpet Check', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['loose-quill', 'shed'],
    text: 'With {n}+ [Loose Quill]s, draw {c1} and gain {e} Nerve next turn. Otherwise [Shed] 1 and gain {b} Guard.',
    flavor: 'A quick audit of the floor.',
    nums: { n: 3, c1: 1, e: 1, b: 4 },
    effect: eff((c) => {
      if (loose(c) >= N(c).n) { U.draw(c, N(c).c1); U.mm(c).nerveNextTurn = (U.mm(c).nerveNextTurn || 0) + N(c).e; }
      else { shed(c, 1); U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { n: 3, c1: 2, e: 1, b: 7 } },
  },
  {
    id: 'truffle/barely-holding-together', name: 'Barely Holding Together', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['ragged'],
    text: 'The first time you become [Ragged] this combat, draw {c1}. Triggers now if already [Ragged].',
    flavor: 'He is. He genuinely is.',
    nums: { c1: 2 },
    effect: eff((c) => power(c, 'truffle/barely-holding-together', 1, (x) => {
      U.mm(x).barelyHolding = true;
      if (isRagged(x)) { U.mm(x).raggedSeen = true; U.draw(x, N(x).c1); }
    })),
    upgrade: { nums: { c1: 3 } },
  },
  {
    id: 'truffle/all-spines-no-plan', name: 'All Spines, No Plan', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['shed'],
    text: 'The first time you [Shed] each turn, gain {b} Guard.',
    flavor: 'There has never been a plan.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'truffle/all-spines-no-plan', N(c).b, (x) => { U.mm(x).allSpines = true; })),
    upgrade: { nums: { b: 7 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (14) ──
  {
    id: 'truffle/barbed-charge', name: 'Barbed Charge', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. Consume up to {n} [Bristle] for {m0} each.',
    flavor: 'Head down, everything else pointing forwards.',
    nums: { d: 11, m0: 5, n: 3 },
    balance: { scalesWith: 'the Bristle you are willing to cash instead of saving for retaliation' },
    effect: eff((c) => { U.hit(c, N(c).d); const n = unbristle(c, N(c).n); for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 15, m0: 7, n: 3 } },
  },
  {
    id: 'truffle/quillstorm', name: 'Quillstorm', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['shed'],
    text: '[Shed] up to {n}. Each one throws {d} at a random enemy.',
    flavor: 'Briefly, the air is entirely quills.',
    nums: { d: 7, n: 3 },
    balance: { scalesWith: 'the Quills you are willing to throw away' },
    effect: eff((c) => { const n = shed(c, N(c).n); for (let i = 0; i < n; i++) U.hitRandom(c, N(c).d); }),
    upgrade: { nums: { d: 10, n: 4 } },
  },
  {
    id: 'truffle/sweep-the-floor', name: 'Sweep the Floor', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['gather'],
    text: '[Gather] up to {n}, then deal {d} plus {m0} for each one recovered.',
    flavor: 'Tidying, weaponised.',
    nums: { d: 7, m0: 4, n: 3 },
    balance: { scalesWith: 'how many Loose Quills you manage to pick up first' },
    effect: eff((c) => { const got = gather(c, N(c).n); U.hit(c, N(c).d + got * N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 5, n: 3 } },
  },
  {
    id: 'truffle/hedgehog-handshake', name: 'Hedgehog Handshake', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bristle', 'shed'],
    text: 'Deal {d} damage. If the target intends to Attack, gain {n} [Bristle] and [Shed] {g}.',
    flavor: 'Firm. Memorable. Regretted immediately.',
    nums: { d: 7, n: 2, g: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) { bristle(c, N(c).n); shed(c, N(c).g); }
    }),
    upgrade: { nums: { d: 10, n: 3, g: 1 } },
  },
  {
    id: 'truffle/low-profile-high-spines', name: 'Low Profile, High Spines', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ragged'],
    text: 'Deal {d} damage twice, or three times while [Ragged].',
    flavor: 'Very close to the floor and extremely unpleasant.',
    nums: { d: 5, hits: 2 },
    effect: eff((c) => { U.hitN(c, N(c).d, isRagged(c) ? 3 : 2); }),
    upgrade: { nums: { d: 7, hits: 2 } },
  },
  {
    id: 'truffle/rotten-little-cannonball', name: 'Rotten Little Cannonball', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['ragged'],
    text: 'Deal {d} to all enemies. Costs 1 while [Ragged].',
    flavor: 'Fired from nowhere, by nobody, at everybody.',
    nums: { d: 11 },
    balance: { scalesWith: 'the whole room, and it costs 1 while Ragged' },
    effect: eff((c) => U.hitAll(c, N(c).d)),
    dynamicCost: (c) => (isRagged(c) ? 1 : 2),
    upgrade: { nums: { d: 15 } },
  },
  {
    id: 'truffle/crossfire', name: 'Crossfire', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} to one enemy and {m0} to another. {n} [Bristle] per Attacker struck, up to 2.',
    flavor: 'Both of them, and neither of them meant it.',
    nums: { d: 7, m0: 5, n: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      const other = U.others(c)[0];
      if (other) U.hitAt(c, other, N(c).m0);
      let got = 0;
      for (const e2 of [t, other]) {
        if (got >= 2) break;
        if (e2 && e2.pendingMove && ATTACK_INTENTS.has(e2.pendingMove.intent)) { bristle(c, N(c).n); got++; }
      }
    }),
    upgrade: { nums: { d: 10, m0: 7, n: 1 } },
  },
  {
    id: 'truffle/rear-end-first', name: 'Rear End First', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['loose-quill'],
    text: 'Deal {d} damage. Spend {n} [Loose Quill]s to do it again.',
    flavor: 'His preferred approach to most problems.',
    nums: { d: 7, n: 2 },
    effect: eff((c) => { U.hit(c, N(c).d); if (spendLoose(c, N(c).n) >= N(c).n) U.hitAt(c, c.target, N(c).d); }),
    upgrade: { nums: { d: 10, n: 2 } },
  },
  {
    id: 'truffle/scrape-along-the-wall', name: 'Scrape Along the Wall', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['gather'],
    text: 'Deal {d} damage, [Gather] {n}, and gain {b} Guard.',
    flavor: 'Leaves a mark on the wallpaper and a trail of quills.',
    nums: { d: 7, n: 1, b: 4 },
    effect: eff((c) => { U.hit(c, N(c).d); gather(c, N(c).n); U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 10, n: 2, b: 6 } },
  },
  {
    id: 'truffle/needle-exchange', name: 'Needle Exchange', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['bristle', 'regrow', 'vanish'],
    text: 'Consume {n} [Bristle] to deal {d} damage and [Regrow] {g}. [Vanish].',
    flavor: 'One out, one in.',
    nums: { d: 7, n: 1, g: 1 },
    effect: eff((c) => { if (unbristle(c, N(c).n) > 0) { U.hit(c, N(c).d); regrow(c, N(c).g); } }),
    upgrade: { nums: { d: 10, n: 1, g: 2 } },
  },
  {
    id: 'truffle/quill-tax', name: 'Quill Tax', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage. If the target intends to Attack, weaken it and [Shed] {g}.',
    flavor: 'Everyone pays. Nobody agreed to this.',
    nums: { d: 7, n: 1, g: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) { U.apply(c, t, 'weak', N(c).n); shed(c, N(c).g); }
    }),
    upgrade: { nums: { d: 10, n: 2, g: 1 } },
  },
  {
    id: 'truffle/carpet-skewer', name: 'Carpet Skewer', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['loose-quill'],
    text: 'Spend up to {n} [Loose Quill]s. Deal {d} plus {m0} for each.',
    flavor: 'Straight up through the pile of the rug.',
    nums: { d: 11, m0: 4, n: 4 },
    balance: { scalesWith: 'the Loose Quills on the floor, up to four of them' },
    effect: eff((c) => { const spent = spendLoose(c, N(c).n); U.hit(c, N(c).d + spent * N(c).m0); }),
    upgrade: { nums: { d: 15, m0: 6, n: 4 } },
  },
  {
    id: 'truffle/no-room-to-back-up', name: 'No Room to Back Up', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. With 0 Guard, gain {n} [Bristle] and draw {c1}.',
    flavor: 'Cornered, and delighted about it.',
    nums: { d: 7, n: 1, c1: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); if (c.self.block === 0) { bristle(c, N(c).n); U.draw(c, N(c).c1); } }),
    upgrade: { nums: { d: 10, n: 2, c1: 1 } },
  },
  {
    id: 'truffle/down-but-pointy', name: 'Down But Pointy', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['ragged'],
    text: 'Deal {d} damage. While [Ragged], refund {e} Nerve.',
    flavor: 'Down, yes. Safe to approach, no.',
    nums: { d: 15, e: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); if (isRagged(c)) U.energy(c, N(c).e); }),
    upgrade: { nums: { d: 20, e: 1 } },
  },

  // ── Skills (13) ──
  {
    id: 'truffle/roll-with-it', name: 'Roll With It', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard. If an Attack breaks it and costs you Courage this enemy turn, gain {n} [Bristle].',
    flavor: 'Rolling is most of his strategy.',
    nums: { b: 5, n: 2 },
    effect: eff((c) => { U.guard(c, N(c).b); U.mm(c).bendDontBreak = N(c).n; }),
    upgrade: { nums: { b: 8, n: 3 } },
  },
  {
    id: 'truffle/lower-the-guard', name: 'Lower the Guard', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['bristle', 'vanish'],
    text: 'Remove all your Guard. Gain {n} [Bristle] per {b} removed, up to 3. Draw {c1}. [Vanish].',
    flavor: 'Deliberately, and with enthusiasm.',
    nums: { b: 4, n: 1, c1: 1 },
    effect: eff((c) => {
      const had = c.self.block;
      if (had > 0) U.stripGuard(c, c.self, had);
      bristle(c, Math.min(3, Math.floor(had / N(c).b) * N(c).n));
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { b: 3, n: 1, c1: 2 } },
  },
  {
    id: 'truffle/loose-change', name: 'Loose Change', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loose-quill'],
    text: 'Spend {n} [Loose Quill]s for {e} Nerve next turn. You may do it twice.',
    flavor: 'The floor is, in a sense, a bank.',
    nums: { n: 2, e: 1 },
    effect: eff((c) => {
      let got = 0;
      for (let i = 0; i < 2; i++) { if (spendLoose(c, N(c).n) >= N(c).n) got += N(c).e; }
      if (got) U.mm(c).nerveNextTurn = (U.mm(c).nerveNextTurn || 0) + got;
    }),
    upgrade: { nums: { n: 2, e: 2 } },
  },
  {
    id: 'truffle/pick-yourself-up', name: 'Pick Yourself Up', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['gather', 'ragged'],
    text: '[Gather] up to {n}. While [Ragged], also gain {b} Guard.',
    flavor: 'Nobody else is going to.',
    nums: { n: 3, b: 6 },
    effect: eff((c) => { gather(c, N(c).n); if (isRagged(c)) U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 4, b: 9 } },
  },
  {
    id: 'truffle/it-grows-back', name: 'It Grows Back', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['regrow'],
    text: '[Regrow] {g}. If that fills you, draw {c1}.',
    flavor: 'It always grows back. That is the one reliable thing.',
    nums: { g: 5, c1: 1 },
    effect: eff((c) => { regrow(c, N(c).g); if (quills(c) >= quillCap(c)) U.draw(c, N(c).c1); }),
    upgrade: { nums: { g: 7, c1: 2 } },
  },
  {
    id: 'truffle/no-big-deal', name: 'No Big Deal', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF,
    text: 'If you lost Courage last enemy turn, draw {c1}. Otherwise draw 1 and gain {b} Guard.',
    flavor: 'It was quite a big deal.',
    nums: { c1: 2, b: 4 },
    effect: eff((c) => {
      if (U.mm(c).lostCourageLastEnemyTurn) U.draw(c, N(c).c1);
      else { U.draw(c, 1); U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { c1: 3, b: 7 } },
  },
  {
    id: 'truffle/down-in-front', name: 'Down in Front', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard, then lose {n} [Bristle]. With none to lose, gain only {m0}.',
    flavor: 'Everybody down.',
    nums: { b: 12, m0: 6, n: 1 },
    effect: eff((c) => { if (unbristle(c, N(c).n) > 0) U.guard(c, N(c).b); else U.guard(c, N(c).m0); }),
    upgrade: { nums: { b: 16, m0: 9, n: 1 } },
  },
  {
    id: 'truffle/quill-reserve', name: 'Quill Reserve', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shed'],
    text: '[Shed] {n} to gain {b} Guard.',
    flavor: 'Kept back for exactly this.',
    nums: { n: 2, b: 14 },
    effect: eff((c) => { if (shed(c, N(c).n) >= N(c).n) U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 19 } },
  },
  {
    id: 'truffle/keep-the-good-bits', name: 'Keep the Good Bits', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['regrow', 'gather'],
    text: 'Discard up to {n}. [Regrow] 1 per Attack, [Gather] 1 per Skill.',
    flavor: 'Most of them are not good bits.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const picks = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Discard which Tricks?' });
      for (const k of picks) {
        const t = String((k.type || (k.def && k.def.type)) || '').toLowerCase();
        U.moveCard(c, k, 'discard', {});
        if (t === 'attack') regrow(c, 1); else gather(c, 1);
      }
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'truffle/raggedy-breathing', name: 'Raggedy Breathing', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['ragged', 'regrow', 'bristle'],
    text: 'While [Ragged], recover {h} Courage and [Regrow] {g}. Otherwise gain {n} [Bristle].',
    flavor: 'Rattly, but present.',
    nums: { h: 6, g: 2, n: 2 },
    effect: eff((c) => {
      if (isRagged(c)) { U.mend(c, N(c).h); regrow(c, N(c).g); }
      else bristle(c, N(c).n);
    }),
    upgrade: { nums: { h: 9, g: 3, n: 3 } },
  },
  {
    id: 'truffle/old-quill-under-the-rug', name: 'Old Quill Under the Rug', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['loose-quill'],
    text: 'Put {n} [Loose Quill]s on the floor. He apparently left them here before.',
    flavor: 'How long has he been in this house?',
    nums: { n: 2 },
    effect: eff((c) => addLoose(c, N(c).n)),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'truffle/shake-off-the-cobwebs', name: 'Shake Off the Cobwebs', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shed', 'regrow'],
    text: 'Remove a debuff and [Shed] {n}. If one went, [Regrow] {g}.',
    flavor: 'Most of it comes off.',
    nums: { n: 1, g: 2 },
    effect: eff((c) => { const removed = U.removeOneDebuff(c, c.self); shed(c, N(c).n); if (removed) regrow(c, N(c).g); }),
    upgrade: { nums: { n: 1, g: 4 } },
  },
  {
    id: 'truffle/hold-still-almost', name: 'Hold Still, Almost', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF,
    text: 'Gain {b} Guard. If you lose Courage this enemy turn, gain {m0} Guard next turn.',
    flavor: 'Almost. Nearly. Not quite.',
    nums: { b: 4, m0: 12 },
    effect: eff((c) => { U.guard(c, N(c).b); U.mm(c).holdStill = N(c).m0; }),
    upgrade: { nums: { b: 7, m0: 16 } },
  },

  // ── Powers (8) ──
  {
    id: 'truffle/shed-cycle', name: 'Shed Cycle', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shed', 'regrow'],
    text: 'The first time you [Shed] each turn, [Regrow] {g} at the start of your next.',
    flavor: 'Off, then on, then off again.',
    nums: { g: 1 },
    effect: eff((c) => power(c, 'truffle/shed-cycle', N(c).g, (x) => { U.mm(x).shedCycle = true; })),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'truffle/quill-carpet', name: 'Quill Carpet', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['loose-quill'],
    text: 'At end of turn, with {n}+ [Loose Quill]s down, deal {d} to all enemies. They are not consumed.',
    flavor: 'The floor itself is now a hazard.',
    nums: { n: 4, d: 4 },
    effect: eff((c) => power(c, 'truffle/quill-carpet', 1, (x) => { U.mm(x).quillCarpet = true; })),
    upgrade: { nums: { n: 4, d: 7 } },
  },
  {
    id: 'truffle/wretched-little-miracle', name: 'Wretched Little Miracle', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['ragged', 'bristle'],
    text: 'Whenever you end a turn [Ragged] with 0 Guard, gain {n} [Bristle].',
    flavor: 'By every reasonable measure he should not be here.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'truffle/wretched-little-miracle', N(c).n, (x) => { U.mm(x).wretchedMiracle = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'truffle/built-wrong', name: 'Built Wrong', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['regrow'],
    text: 'The first Attack each enemy turn that costs you Courage makes you [Regrow] {g} after.',
    flavor: 'Structurally. Comprehensively.',
    nums: { g: 2 },
    effect: eff((c) => power(c, 'truffle/built-wrong', N(c).g, (x) => { U.mm(x).builtWrong = N(x).g; })),
    upgrade: { nums: { g: 3 } },
  },
  {
    id: 'truffle/hard-to-finish', name: 'Hard to Finish', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['bristle'],
    text: 'Whenever [Bristle] triggers, gain {b} Guard at the start of your next turn.',
    flavor: 'People have tried.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'truffle/hard-to-finish', N(c).b)),
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'truffle/more-where-that-came-from', name: 'More Where That Came From', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['gather', 'bristle'],
    text: 'The first time each turn you [Gather] {n}+ at once, gain {m0} [Bristle].',
    flavor: 'There is. There is a great deal more.',
    nums: { n: 2, m0: 2 },
    effect: eff((c) => power(c, 'truffle/more-where-that-came-from', 1, (x) => { U.mm(x).moreWhereThat = true; })),
    upgrade: { nums: { n: 2, m0: 3 } },
  },
  {
    id: 'truffle/comfortable-in-pieces', name: 'Comfortable in Pieces', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['ragged', 'bristle'],
    text: 'While [Ragged], Guard Tricks give a little less but each also gives {n} [Bristle].',
    flavor: 'He has been in pieces before. It is fine.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'truffle/comfortable-in-pieces', N(c).n, (x) => { U.mm(x).comfortablePieces = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'truffle/the-floor-is-mine', name: 'The Floor Is Mine', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['loose-quill', 'gather'],
    text: 'The first time each turn you spend or [Gather] [Loose Quill]s, draw {c1}.',
    flavor: 'He has claimed it. Nobody contested it.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'truffle/the-floor-is-mine', N(c).c1, (x) => { U.mm(x).floorIsMine = true; })),
    upgrade: { nums: { c1: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (10) ──
  {
    id: 'truffle/hedgepocalypse', name: 'Hedgepocalypse', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['shed', 'loose-quill'],
    text: '[Shed] every Quill. Each throws {d} at a random enemy. They all stay on the floor as [Loose Quill]s.',
    flavor: 'All of them. All at once. Everywhere.',
    nums: { d: 5 },
    balance: { scalesWith: 'every single Quill attached to him, and they all end up on the floor' },
    effect: eff((c) => { const n = shed(c, quills(c)); for (let i = 0; i < n; i++) U.hitRandom(c, N(c).d); }),
    upgrade: { nums: { d: 7 } },
  },
  {
    id: 'truffle/the-long-roll', name: 'The Long Roll', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. Consume any amount of [Bristle] for {m0} each.',
    flavor: 'From one end of the hall to the other.',
    nums: { d: 15, m0: 5 },
    balance: { scalesWith: 'every point of Bristle you have banked' },
    effect: eff((c) => { U.hit(c, N(c).d); const n = unbristle(c, bristleOn(c)); for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 20, m0: 7 } },
  },
  {
    id: 'truffle/everything-is-pointy', name: 'Everything Is Pointy', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['loose-quill'],
    text: 'Deal {d} to all enemies. Spend up to {n} [Loose Quill]s for {m0} more each.',
    flavor: 'It is. It really is.',
    nums: { d: 11, m0: 2, n: 6 },
    balance: { scalesWith: 'the Loose Quills you sweep into it — every one hits the whole room' },
    effect: eff((c) => { const spent = spendLoose(c, N(c).n); U.hitAll(c, N(c).d + spent * N(c).m0); }),
    upgrade: { nums: { d: 15, m0: 3, n: 6 } },
  },
  {
    id: 'truffle/bite-back-first', name: 'Bite Back First', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. Until your next turn, if it costs you Courage, this repeats against it.',
    flavor: 'Pre-emptively. It seemed fair.',
    nums: { d: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); U.mm(c).biteBack = { id: c.target && (c.target.id ?? c.target.uid), d: N(c).d }; }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'truffle/keep-coming', name: 'Keep Coming', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY,
    text: 'Deal {d} damage. If you lost Courage last enemy turn, this returns to your hand once.',
    flavor: 'He will. That is the whole problem with him.',
    nums: { d: 15 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if (!U.mm(c).lostCourageLastEnemyTurn) return;
      if (U.bump(c, 'keepComing') > 1) return;
      U.returnSelf(c);
      U.costMod(c, c.card, 1, 'turn');
      U.makeVanish(c, c.card);
    }),
    upgrade: { nums: { d: 20 } },
  },
  {
    id: 'truffle/tiny-disaster', name: 'Tiny Disaster', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['ragged', 'shed', 'vanish'],
    text: 'Only while [Ragged]. [Shed] {n} to deal {d} damage. [Vanish].',
    flavor: 'Small. Complete. Disastrous.',
    /* BALANCE DEVIATION, stated per CONTRACTS rule 8. The doc's "very heavy
       damage" at 0 Nerve is 21, which is outside the cards suite's 3-12 band for
       a 0-cost Rare -- and that band exists precisely to catch a free finisher.
       Held at the ceiling instead. It is still 12 for nothing while Ragged, and
       it costs two Quills off his back and the card itself. */
    nums: { d: 12, n: 2 },
    balance: { scalesWith: 'two Quills off his back, and it only exists while he is Ragged' },
    effect: eff((c) => { if (shed(c, N(c).n) >= N(c).n) U.hit(c, N(c).d); }),
    playable: (c) => isRagged(c),
    playableReason: 'Truffle is not Ragged yet.',
    upgrade: { nums: { d: 17, n: 2 } },
  },
  {
    id: 'truffle/pinball-truffle', name: 'Pinball Truffle', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['loose-quill'],
    text: 'Deal {d} to each enemy, plus a random hit per {n} [Loose Quill]s, up to 3 more.',
    flavor: 'Off the skirting, off the table leg, off a Kid.',
    nums: { d: 7, n: 3 },
    balance: { scalesWith: 'the Loose Quills on the floor — up to three extra ricochets' },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      const extra = Math.min(3, Math.floor(loose(c) / N(c).n));
      for (let i = 0; i < extra; i++) U.hitRandom(c, N(c).d);
    }),
    upgrade: { nums: { d: 10, n: 3 } },
  },
  {
    id: 'truffle/carpet-launcher', name: 'Carpet Launcher', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['loose-quill'],
    text: 'Spend up to {n} [Loose Quill]s, firing {d} each. At {m}+ fired, draw {c1}.',
    flavor: 'The rug, discharged.',
    nums: { d: 4, n: 12, m: 6, c1: 1 },
    balance: { scalesWith: 'however many Loose Quills you have managed to scatter' },
    effect: eff((c) => {
      const spent = spendLoose(c, N(c).n);
      for (let i = 0; i < spent; i++) U.hitRandom(c, N(c).d);
      if (spent >= N(c).m) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { d: 6, n: 12, m: 6, c1: 2 } },
  },
  {
    id: 'truffle/quills-in-reverse', name: 'Quills in Reverse', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['gather'],
    text: 'Deal {d} damage and [Gather] {n}. If that fills you, deal it again.',
    flavor: 'Backwards, which is forwards for him.',
    nums: { d: 11, n: 2 },
    effect: eff((c) => { U.hit(c, N(c).d); gather(c, N(c).n); if (quills(c) >= quillCap(c)) U.hitAt(c, c.target, N(c).d); }),
    upgrade: { nums: { d: 15, n: 3 } },
  },
  {
    id: 'truffle/half-alive-full-speed', name: 'Half Alive, Full Speed', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['ragged', 'bristle', 'shed'],
    text: 'Deal {d} damage. [Ragged]: refund {e} Nerve and gain {n} [Bristle]. Otherwise [Shed] {g}.',
    flavor: 'Both halves committed.',
    nums: { d: 21, e: 1, n: 2, g: 2 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if (isRagged(c)) { U.energy(c, N(c).e); bristle(c, N(c).n); }
      else shed(c, N(c).g);
    }),
    upgrade: { nums: { d: 27, e: 1, n: 3, g: 2 } },
  },

  // ── Skills (7) ──
  {
    id: 'truffle/play-dead-ish', name: 'Play Dead-ish', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['bristle', 'vanish'],
    text: 'Remove all Guard and gain {n} [Bristle]. The next huge Attack is capped this enemy turn. [Vanish].',
    flavor: 'He is very good at it. Suspiciously good.',
    nums: { n: 4, cap: 12 },
    effect: eff((c) => {
      if (c.self.block > 0) U.stripGuard(c, c.self, c.self.block);
      bristle(c, N(c).n);
      U.applySelf(c, 'play-dead', 1);
    }),
    upgrade: { nums: { n: 5, cap: 10 } },
  },
  {
    id: 'truffle/emergency-regrowth', name: 'Emergency Regrowth', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['regrow', 'ragged', 'vanish'],
    text: '[Regrow] to maximum. While [Ragged], also recover {h} Courage. [Vanish].',
    flavor: 'All at once, and it hurts.',
    nums: { h: 8 },
    effect: eff((c) => { regrow(c, quillCap(c)); if (isRagged(c)) U.mend(c, N(c).h); }),
    upgrade: { nums: { h: 12 } },
  },
  {
    id: 'truffle/all-together-now', name: 'All Together Now', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['gather', 'loose-quill'],
    text: '[Gather] everything you can. Each one that will not fit empowers your next Attack, up to {n}.',
    flavor: 'Every last one.',
    nums: { n: 6, m0: 3 },
    balance: { scalesWith: 'every Loose Quill on the floor, whether it fits or not' },
    effect: eff((c) => {
      const before = loose(c);
      gather(c, before);
      const left = Math.min(N(c).n, loose(c));
      if (left > 0) { spendLoose(c, left); U.applySelf(c, 'empowered', left * N(c).m0); }
    }),
    upgrade: { nums: { n: 6, m0: 4 } },
  },
  {
    id: 'truffle/shake-apart', name: 'Shake Apart', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['shed', 'regrow', 'vanish'],
    text: '[Shed] up to {n}. Draw 1 per 2 Shed, up to {c1}. [Regrow] the same number next turn. [Vanish].',
    flavor: 'Temporarily, there is more hedgehog on the floor than on the hedgehog.',
    nums: { n: 6, c1: 3 },
    effect: eff((c) => {
      const n = shed(c, N(c).n);
      U.draw(c, Math.min(N(c).c1, Math.floor(n / 2)));
      U.mm(c).regrowNextTurn = (U.mm(c).regrowNextTurn || 0) + n;
    }),
    upgrade: { nums: { n: 8, c1: 4 } },
  },
  {
    id: 'truffle/refuse-to-stay-down', name: 'Refuse to Stay Down', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['bristle', 'regrow', 'vanish'],
    text: 'Until your next turn, lethal damage leaves you at 1 Courage, [Regrow]n and with {n} [Bristle]. [Vanish].',
    flavor: 'He has refused before. Repeatedly.',
    nums: { n: 4 },
    effect: eff((c) => { U.applySelf(c, 'not-dead-yet', 1); U.mm(c).refuseDown = N(c).n; }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'truffle/exact-amount-of-terrible', name: 'Exact Amount of Terrible', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['bristle'],
    text: 'Gain Guard so that almost exactly {n} of the target’s Attack gets through, up to {b}.',
    flavor: 'Measured. Deliberate. Horrible.',
    nums: { n: 2, b: 24 },
    balance: { scalesWith: 'whatever the enemy is actually about to swing — it engineers the Bristle turn' },
    effect: eff((c) => {
      const t = c.target;
      const dmg = (t && t.pendingMove && t.pendingMove.damage) || 0;
      const want = Math.max(0, Math.min(N(c).b, dmg - N(c).n - c.self.block));
      U.guard(c, want);
    }),
    upgrade: { nums: { n: 2, b: 32 } },
  },
  {
    id: 'truffle/ragged-reset', name: 'Ragged Reset', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['ragged', 'vanish'],
    text: 'Only while [Ragged]. Recover {h} Courage. If that ends [Ragged], draw {c1} and gain {e} Nerve. [Vanish].',
    flavor: 'Back up to merely awful.',
    nums: { h: 14, c1: 2, e: 1 },
    effect: eff((c) => {
      U.mend(c, N(c).h);
      if (!isRagged(c)) { U.draw(c, N(c).c1); U.energy(c, N(c).e); }
    }),
    playable: (c) => isRagged(c),
    playableReason: 'Truffle is not Ragged.',
    upgrade: { nums: { h: 19, c1: 3, e: 1 } },
  },

  // ── Powers (8) ──
  {
    id: 'truffle/unpleasant-geometry', name: 'Unpleasant Geometry', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['gather'],
    text: 'The first {n} [Loose Quill]s you [Gather] each turn each throw {d} at a random enemy.',
    flavor: 'The angles are wrong and they hurt to look at.',
    nums: { n: 3, d: 4 },
    effect: eff((c) => power(c, 'truffle/unpleasant-geometry', 1, (x) => { U.mm(x).unpleasantGeometry = true; })),
    upgrade: { nums: { n: 3, d: 7 } },
  },
  {
    id: 'truffle/the-carpet-remembers', name: 'The Carpet Remembers', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['loose-quill'],
    text: 'The first effect each turn that spends [Loose Quill]s gets the full benefit without spending them.',
    flavor: 'It has been collecting for years.',
    nums: {},
    effect: eff((c) => power(c, 'truffle/the-carpet-remembers', 1, (x) => { U.mm(x).carpetRemembers = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/double-barbed', name: 'Double Barbed', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bristle', 'shed'],
    text: '[Bristle] may [Shed] {n} instead of 1 and retaliate once per Quill, still consuming only 1 [Bristle].',
    flavor: 'Twice the spines, same amount of spite.',
    nums: { n: 2 },
    effect: eff((c) => power(c, 'truffle/double-barbed', N(c).n, (x) => { U.mm(x).doubleBarbed = N(x).n; })),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'truffle/close-enough-to-dead', name: 'Close Enough to Dead', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['ragged'],
    text: 'You count as [Ragged] at 75% Courage or below instead of 50%.',
    flavor: 'The distinction was always academic.',
    nums: {},
    effect: eff((c) => power(c, 'truffle/close-enough-to-dead', 1, (x) => { U.mm(x).closeEnough = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/dead-hedgehog-theory', name: 'Dead Hedgehog Theory', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['regrow'],
    text: 'The first Attack each enemy turn that costs you Courage: [Regrow] {g}, and next turn {e} Nerve and {c1} card.',
    flavor: 'A theory he is testing personally.',
    nums: { g: 1, e: 1, c1: 1 },
    effect: eff((c) => power(c, 'truffle/dead-hedgehog-theory', 1, (x) => { U.mm(x).deadTheory = { g: N(x).g, e: N(x).e, c1: N(x).c1 }; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'truffle/grows-back-wrong', name: 'Grows Back Wrong', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['regrow', 'loose-quill'],
    text: '[Regrow] may take you {n} above maximum. At end of turn the excess falls off as [Loose Quill]s.',
    flavor: 'Wrong, but more.',
    nums: { n: 6 },
    effect: eff((c) => power(c, 'truffle/grows-back-wrong', 1, (x) => { U.mm(x).growsWrong = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/permanent-bad-hair-day', name: 'Permanent Bad Hair Day', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bristle'],
    text: '[Bristle] no longer expires. It stays until something consumes it.',
    flavor: 'Every day, in perpetuity.',
    nums: {},
    effect: eff((c) => power(c, 'truffle/permanent-bad-hair-day', 1, (x) => { U.mm(x).permanentBristle = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/still-wiggling', name: 'Still Wiggling', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['ragged', 'bristle'],
    text: 'End a turn [Ragged], with 0 Guard and [Bristle] left: gain {e} Nerve and {c1} card next turn.',
    flavor: 'Against all advice, and all evidence.',
    nums: { e: 1, c1: 1 },
    effect: eff((c) => power(c, 'truffle/still-wiggling', 1, (x) => { U.mm(x).stillWiggling = true; })),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'truffle/lend-them-the-spiky-side', name: 'Lend Them the Spiky Side', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Give a chosen Kid {n} Borrowed [Bristle]. Attacks that cost them Courage make you [Shed] and retaliate.',
    flavor: 'Only the spiky side. He keeps the rest.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      c.giveStatus(ally, BRISTLE, N(c).n);
      U.mm(c).lentBristle = { seat: ally.seat, left: N(c).n };
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'truffle/group-huddle', name: 'Group Huddle', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Every Kid gains {b} Guard. Gain {n} [Bristle] for each who is still under-Guarded.',
    flavor: 'Spines outward. Everybody else inward.',
    nums: { b: 5, n: 1 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      for (const mate of c.teammates()) {
        c.giveBlock(mate, N(c).b);
        const aimed = U.enemies(c).some((e2) => e2.pendingMove && ATTACK_INTENTS.has(e2.pendingMove.intent));
        if (aimed && mate.block < 12) bristle(c, N(c).n);
      }
    }),
    upgrade: { nums: { b: 8, n: 1 } },
  },
  {
    id: 'truffle/sweep-their-side-too', name: 'Sweep Their Side Too', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['gather', 'loose-quill'],
    text: '[Gather] up to {n}. A chosen Kid draws {c1}; if both came back, they gain {b} Guard.',
    flavor: 'It is all one floor.',
    nums: { n: 2, c1: 1, b: 6 },
    effect: eff(async (c) => {
      const got = gather(c, N(c).n);
      const ally = await c.chooseAlly();
      if (!ally) return;
      c.giveDraw(ally, N(c).c1);
      if (got >= N(c).n) c.giveBlock(ally, N(c).b);
    }),
    upgrade: { nums: { n: 3, c1: 2, b: 9 } },
  },
  {
    id: 'truffle/everybody-behind-the-hedgehog', name: 'Everybody Behind the Hedgehog', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bristle'],
    text: 'Until your next turn, the first Courage each Kid would lose is partly redirected to you — and it can [Bristle].',
    flavor: 'Behind. Not beside. Behind.',
    nums: { n: 3 },
    effect: eff((c) => { U.mm(c).behindTheHedgehog = { share: N(c).n, used: [] }; }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'truffle/shared-pincushion', name: 'Shared Pincushion', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bristle', 'shed'],
    text: 'Once each enemy turn per Kid, when they lose Courage you may [Shed] 1 to retaliate. They gain {b} Guard next turn.',
    flavor: 'Everybody gets to be the pincushion.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'truffle/shared-pincushion', N(c).b, (x) => { U.mm(x).sharedPincushion = N(x).b; })),
    upgrade: { nums: { b: 7 } },
  },
];

export default {
  slug: SLUG,
  name: 'Truffle',
  title: 'the Zombie Hedgehog',
  region: 'hedge-maze',
  identity:
    'Truffle has the same resource in two places at once: the Quills attached to him and the ones ' +
    'scattered across the floor, and most of his good decks move them back and forth rather than ' +
    'treating either as finite. Bristle is the other half of him, and it is not "when attacked" — it ' +
    'fires only when an Attack actually costs him Courage, so a Bristle turn is one where he chooses ' +
    'to let a manageable hit land. Ragged pays him for being hurt, which makes the safest line and ' +
    'the strongest line pull in opposite directions all fight.',
  strengths: [
    'Retaliation that scales with how much punishment he is willing to take',
    'Two Quill pools, so nothing is ever really wasted — Shed is ammunition, not a cost',
    'Ragged turns being nearly dead into a genuine engine',
    'Deliberately dropping his own Guard is a real, rewarded decision',
    'Very hard to finish off, and the longer a fight runs the worse he gets',
  ],
  weaknesses: [
    'Bristle does nothing if his Guard holds, so over-defending switches him off',
    'Loose Quills do nothing at all until something spends or Gathers them',
    'Ragged means genuinely low Courage, and the reward does not stop it killing him',
    'Shedding for value leaves him with nothing to Shed when Bristle triggers',
    'A short fight never lets the Quill economy come round',
    'Everything he does is reactive, so a passive enemy turn wastes his setup',
  ],
  startingHp: 78,
  startingEnergy: 3,
  mechanics: {
    quills: { name: 'Quills', kind: 'resource', desc: 'Starts at 6, holds 12. The spines actually attached to him.', min: 0, max: 18, hooks: [] },
    loose: { name: 'Loose Quills', kind: 'resource', desc: 'Shed Quills lying about the room, with no maximum. Gathered back or spent as ammunition.', min: 0, max: 99, hooks: [] },
    shed: { name: 'Shed / Gather / Regrow', kind: 'system', desc: 'Shed moves Quills to the floor; Gather picks them back up; Regrow grows new ones without touching the floor.', min: 0, max: 12, hooks: ['shed', 'gather'] },
    bristle: { name: 'Bristle X', kind: 'status', desc: 'When an Attack actually costs Courage after Guard: consume 1, Shed 1, retaliate. Once per Attack action however many hits. Expires at the start of your turn.', min: 0, max: 12, hooks: ['bristled'] },
    ragged: { name: 'Ragged', kind: 'system', desc: 'At or below half maximum Courage. No benefit of its own — individual Tricks are stronger for it.', min: 0, max: 1, hooks: [] },
  },
  startingDeck: [
    'truffle/zombie-nibble', 'truffle/zombie-nibble', 'truffle/zombie-nibble', 'truffle/zombie-nibble',
    'truffle/round-up', 'truffle/round-up', 'truffle/round-up',
    'truffle/prickle-up', 'truffle/oops-a-quill', 'truffle/found-it',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Bristle Counterattack', desc: 'Generate Bristle, let a manageable Attack through on purpose, and convert it into automatic retaliation. The ideal turn is not the one where nothing touches you.', coreCards: ['truffle/prickle-up', 'truffle/pointy-side-out', 'truffle/shake-it-loose', 'truffle/roll-with-it', 'truffle/exact-amount-of-terrible', 'truffle/double-barbed', 'truffle/permanent-bad-hair-day'] },
    { name: 'Regrowth Engine', desc: 'Treat Quills as circulating material rather than a supply. Attached becomes Loose, Loose becomes ammunition, Gather returns it, Regrow replaces it.', coreCards: ['truffle/grow-back-weird', 'truffle/pick-it-back-up', 'truffle/sweep-the-floor', 'truffle/pick-yourself-up', 'truffle/it-grows-back', 'truffle/shed-cycle', 'truffle/grows-back-wrong'] },
    { name: 'The Floor Is Ammunition', desc: 'Scatter Quills deliberately and fire them back. The biggest single turns he has, and they need the floor stocked first.', coreCards: ['truffle/floor-sweep', 'truffle/carpet-skewer', 'truffle/old-quill-under-the-rug', 'truffle/carpet-launcher', 'truffle/everything-is-pointy', 'truffle/quill-carpet', 'truffle/the-carpet-remembers'] },
    { name: 'Ragged', desc: 'Stay hurt on purpose. Everything gets better and none of it stops the damage being real.', coreCards: ['truffle/gnaw-through-it', 'truffle/low-profile-high-spines', 'truffle/down-but-pointy', 'truffle/tiny-disaster', 'truffle/raggedy-breathing', 'truffle/close-enough-to-dead', 'truffle/still-wiggling'] },
    { name: 'Refuses to Die', desc: 'Guard, regrow, retaliate and simply outlast it. The least flashy version of him and the one that finishes bosses.', coreCards: ['truffle/hunch-up', 'truffle/still-good', 'truffle/hold-still-almost', 'truffle/emergency-regrowth', 'truffle/play-dead-ish', 'truffle/refuse-to-stay-down', 'truffle/dead-hedgehog-theory'] },
  ],
};
