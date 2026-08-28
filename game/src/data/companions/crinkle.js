/**
 * Crinkle, the Paper Crow.  OWNER: companion-cards.
 * Spec: docs/design/companions/16-crinkle.md
 *
 * Paper · Fold · Crease · Overfolded · Trace · Refold
 *
 * NOTE ON THE SPEC. Every other Companion is built from a chapter carved out of
 * the design doc. Crinkle has none — his entire specification in the source is
 * one line, "card duplication, folding, transformations and fragile high power
 * effects". `docs/design/companions/16-crinkle.md` was written to unblock him
 * and is a RECONSTRUCTION from that line plus what the doc already says about
 * his region, his boss and his art. The designer should read the chapter as a
 * proposal; this file follows it, so changing the chapter is how to change him.
 *
 * ── The rules that decide whether he works ──────────────────────────────────
 *
 * 1. CREASES ARE PERMANENT AND THEY LIVE ON THE CARD. Not on the seat, not on a
 *    turn flag — on the runtime card's own counter, so a folded Trick is still
 *    folded after it is discarded, shuffled and drawn again. That is the whole
 *    reason his deck gets better during a fight rather than just cheaper for a
 *    turn, and it is why `card:play`'s SNAPSHOT is useless here: every read goes
 *    through `e.card(uid)` (trap 19).
 *
 * 2. ONE SCALER, READ BY EVERY CARD. Creases multiply a Trick's printed numbers,
 *    so no effect in this file reads `N(c)` directly — they all read `NC(c)`.
 *    A single card written against `N` would silently ignore its own Creases and
 *    look exactly like every other card while being wrong.
 *
 * 3. THE COST REDUCTION IS A HOOK, NOT A CARD PROPERTY. `dynamicCost` is
 *    per-def, and Creases apply to all eighty Tricks; a `modifyCardCost` hook on
 *    the seat is the only place it can be said once.
 *
 * 4. OVERFOLDED IS THE PAYOFF AND THE COST AT THE SAME TIME. Three Creases makes
 *    a Trick twice its printed size and free, and playing it removes it from the
 *    combat. That happens in the `eff()` wrapper so no individual card can
 *    forget it — the same reason Hush's reveal ordering lives there.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE, SPECIAL } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'crinkle';
const N = U.N;

const PAPER = 'paper';
const CREASE = 'crease';

const BASE_PAPER = 8;
const BIG_PAPER = 16;              // Paper Everything
const OVERFOLD = 3;
const BASE_MAX_CREASE = 3;
const BIG_MAX_CREASE = 4;          // Fourth Crease

/** Which printed numbers a Crease makes bigger. Counts are deliberately absent:
 *  `hits`, `c1` (cards) and `n` are quantities of things, not sizes of them. */
const SCALED = new Set(['d', 'b', 'm0', 'm1', 'w']);

// ════════════════════════════════════════════════════════════════════════════
//  Creases
// ════════════════════════════════════════════════════════════════════════════

const creases = (k) => (k ? U.counter(k, CREASE) : 0);
const maxCrease = (c) => (U.mm(c).fourthCrease ? BIG_MAX_CREASE : BASE_MAX_CREASE);
const isOverfolded = (c, k) => creases(k) >= OVERFOLD;

/** The multiplier a Crease count applies to a printed number. */
function creaseMult(c, k) {
  const cr = creases(k);
  if (!cr) return 1;
  const step = U.mm(c).deckleEdge ? 2 / 3 : 1 / 3;
  return 1 + cr * step;
}

/**
 * Write the Creased numbers onto the runtime card itself.
 *
 * The alternative — computing them at read time inside each effect — works and
 * is INVISIBLE: a folded Paper Cut would still print "Deal 6 damage" on the card
 * and deal 12. `Card.nums` is a per-instance copy (`piles.js:60`) and the
 * renderer substitutes `{d}` from it, so baking the numbers in makes the card
 * say what it will actually do, which is the whole tactical-clarity bar. It also
 * removes a bug class outright: with no second numbers accessor, no card can be
 * written against the wrong one.
 *
 * `meta.baseNums` is the printed set, captured once, so this is idempotent and
 * reversible — Unfold and Deckle Edge both recompute from it.
 */
function applyCreaseNums(c, k) {
  if (!k || !k.nums) return;
  if (!k.meta.baseNums) k.meta.baseNums = { ...k.nums };
  const base = k.meta.baseNums;
  const m = creaseMult(c, k);
  for (const key of Object.keys(base)) {
    k.nums[key] = SCALED.has(key) ? Math.max(1, Math.round(base[key] * m)) : base[key];
  }
  if (c.e) c.e._dirty = true;
}

/** Recompute every card in play — Deckle Edge changes the rate retroactively. */
function recomputeAll(c) {
  for (const pile of ['hand', 'draw', 'discard', 'exhaust', 'limbo', 'stash']) {
    for (const k of U.cardsIn(c, pile)) if (creases(k)) applyCreaseNums(c, k);
  }
}

/**
 * The numbers a Trick is worth right now.
 *
 * Identical to `N` — the Creased values are already ON the card. Kept as a named
 * alias so every effect in this file reads as "the Creased numbers" and nobody
 * later reintroduces a second, silently-unscaled accessor.
 */
const NC = N;

/** @returns {number} Creases actually added. */
function fold(c, k, n = 1) {
  if (!k || n <= 0) return 0;
  if (k.meta && k.meta.noFold) return 0;
  const s0 = U.mm(c);
  // Practised Hands makes the first Fold of the turn go one deeper.
  let want = n;
  if (s0.practisedHands && U.once(c, 'practisedHands')) want += s0.practisedHands;
  const cap = maxCrease(c);
  const before = creases(k);
  const give = Math.min(want, Math.max(0, cap - before));
  if (give <= 0) return 0;
  U.setCounter(k, CREASE, before + give);
  applyCreaseNums(c, k);
  const s = U.mm(c);
  if (s.pressedFlat && before < 2 && before + give >= 2) U.guard(c, s.pressedFlat);
  U.fire(c, 'fold', { card: k, to: before + give });
  return give;
}

function unfold(c, k) {
  const had = creases(k);
  if (had > 0) { U.setCounter(k, CREASE, 0); applyCreaseNums(c, k); }
  return had;
}

// ════════════════════════════════════════════════════════════════════════════
//  Paper
// ════════════════════════════════════════════════════════════════════════════

const paper = (c) => U.res(c, PAPER);
const paperMax = (c) => (U.mm(c).paperEverything ? BIG_PAPER : BASE_PAPER);

function gainPaper(c, n) {
  if (n <= 0) return 0;
  const room = paperMax(c) - paper(c);
  const give = Math.min(n, room);
  const over = n - give;
  if (give > 0) U.addRes(c, PAPER, give, 0, BIG_PAPER);
  // Everything Is Paper turns the overflow into damage rather than wasting it.
  if (over > 0 && U.mm(c).everythingIsPaper) U.hitRandom(c, over);
  return give;
}
function spendPaper(c, n) {
  if (n <= 0) return 0;
  if (paper(c) < n) return 0;
  U.addRes(c, PAPER, -n, 0, BIG_PAPER);
  return n;
}

// ════════════════════════════════════════════════════════════════════════════
//  Trace
// ════════════════════════════════════════════════════════════════════════════

/** Every def in this pool, for Refold. Lazy: the arrays are declared below. */
let ALL_DEFS = null;
function allDefs() {
  if (!ALL_DEFS) ALL_DEFS = [...basics, ...commons, ...uncommons, ...rares];
  return ALL_DEFS;
}

const traceCost = (c) => Math.max(0, 1 - (U.mm(c).cheapCopies ? 1 : 0));

/**
 * A Paper Copy: free, keeps the original's Creases, Vanishes when played, and
 * cannot itself be Traced.
 * @returns {Object|null} the copy
 */
function trace(c, k, o = {}) {
  if (!k) return null;
  if (k.meta && k.meta.noTrace) return null;
  const def = k.def || k;
  U.spawn(c, def, 'hand', {});
  const copy = U.cardsIn(c, 'hand').slice(-1)[0];
  if (!copy) return null;
  const cr = creases(k);
  if (cr) { U.setCounter(copy, CREASE, cr); applyCreaseNums(c, copy); }
  U.costSet(c, copy, 0, 'combat');
  copy.meta.noTrace = true;
  copy.meta.paperCopy = true;
  if (!o.permanent) U.makeVanish(c, copy);
  U.fire(c, 'trace', { card: copy, from: k });
  return copy;
}

// ════════════════════════════════════════════════════════════════════════════
//  Refold
// ════════════════════════════════════════════════════════════════════════════

/**
 * Turn a Trick into a different one of the same TYPE from Crinkle's own pool,
 * keeping its Creases. Transformation, not selection — the result is random.
 * @returns {Object|null} the new card
 */
function refold(c, k, o = {}) {
  if (!k) return null;
  if (k.meta && k.meta.noRefoldTurn === U.turn(c)) return null;
  const fromId = k.def ? k.def.id : k.id;
  const pool = allDefs().filter(d => d.type === k.type && d.id !== fromId);
  if (!pool.length) return null;

  let pick = U.rpick(c, pool);
  // Rewrite offers two and takes the better-looking one; still not a search.
  if (o.ofTwo) {
    const alt = U.rpick(c, pool);
    if (alt && alt !== pick) pick = (alt.rarity === RARE && pick.rarity !== RARE) ? alt : pick;
  }
  if (!pick) return null;

  const cr = creases(k);
  U.moveCard(c, k, 'exhaust', { refolded: true });
  U.spawn(c, pick, 'hand', {});
  const made = U.cardsIn(c, 'hand').slice(-1)[0];
  if (made && cr) { U.setCounter(made, CREASE, cr); applyCreaseNums(c, made); }
  // The Second Draft copies whatever came out, once a turn.
  if (made && U.mm(c).secondDraft && U.once(c, 'secondDraft')) trace(c, made);
  U.fire(c, 'refold', { card: made });
  return made;
}

// ── small helpers ───────────────────────────────────────────────────────────
const handFolded = (c) => U.handOthers(c).filter(k => creases(k) > 0);
const handOverfolded = (c) => U.cardsIn(c, 'hand').filter(k => isOverfolded(c, k));
const totalCreases = (c) => U.cardsIn(c, 'hand').reduce((s, k) => s + creases(k), 0);

async function pickHand(c, o = {}) {
  const [k] = await U.pickCards(c, {
    pile: 'hand', count: 1, optional: !!o.optional,
    prompt: o.prompt || 'Choose a Trick.', filter: o.filter,
  });
  return k || null;
}

const power = (c, id, install) => {
  const s = U.mm(c);
  U.applySelf(c, id, 1);
  if (!s['pw:' + id]) { s['pw:' + id] = true; install(c, s); }
};

/**
 * Every effect goes through here.
 *
 * Besides installing the trackers it settles the Overfolded rule AFTER the
 * effect has run — a Trick that folds itself to 3 on the way past (Fold and
 * Strike, Dog-Ear) has to Vanish on the same play, and a card that had to
 * remember to do that itself would be the one card that forgot.
 */
const eff = (fn) => (c) => {
  U.ensure(c, SLUG);
  const settle = () => {
    const k = c.card;
    if (!k) return;
    if (creases(k) >= OVERFOLD && !U.mm(c).neverUnfolds && !k.meta.keptFlat) U.makeVanish(c, k);
    if (k.meta.keptFlat) k.meta.keptFlat = false;
  };
  const r = fn(c);
  if (r && typeof r.then === 'function') return r.then((v) => { settle(); return v; });
  settle();
  return r;
};

// ── tracks ──────────────────────────────────────────────────────────────────
const paperTrack = (max, start = 0) => ({
  id: PAPER, name: 'Paper', icon: 'paper', min: 0, max, start,
  desc: 'Spent to Trace and Refold. Gained whenever one of your Tricks Vanishes.',
  states: [{ at: 0, label: 'Bare' }, { from: max, to: max, label: 'Full' }],
});

// ════════════════════════════════════════════════════════════════════════════
//  per-combat bookkeeping
// ════════════════════════════════════════════════════════════════════════════
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [paperTrack(BASE_PAPER)]);
  const fake = () => U.trackerCtx(e, seat);

  /* Creases take a Nerve off, for every Trick he owns. `dynamicCost` is
     per-def and this is a rule about all eighty, so it is said once, here. */
  e.hooks.add('modifyCardCost', (cost, h) => {
    const k = h && h.card;
    if (!k) return cost;
    const cr = creases(k);
    if (!cr) return cost;
    return Math.max(0, cost - cr);
  }, { owner: seat });

  /* Paper from every Vanish. `onCardExhausted` is the engine's word for it. */
  e.hooks.add('onCardExhausted', (h) => {
    const c = fake();
    const st = U.mm(c);
    const k = h && h.card;
    if (!k) return;
    st.vanishedThisTurn = (st.vanishedThisTurn || 0) + 1;
    st.vanishedThisCombat = (st.vanishedThisCombat || 0) + 1;

    let n = 1;
    if (st.paperTrail && U.once(c, 'paperTrail')) n += 1;
    if (st.underTheBlotter && isOverfolded(c, k)) n += 1;
    if (st.paperDoors && k.meta && k.meta.paperCopy) n += 1;
    gainPaper(c, n);

    /* The Archive recycles instead of losing them, Creases and all. */
    if (st.theArchive && !(k.meta && k.meta.paperCopy)) {
      U.moveCard(c, k, 'draw', { bottom: true });
    } else if (!(k.meta && k.meta.paperCopy)) {
      (st.vanishedCards || (st.vanishedCards = [])).push(k);
    }
  }, { owner: seat });

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.vanishedThisTurn = 0;
    st.playedIdsThisTurn = {};
  }, seat);

  /* Anything that has to see the opening hand waits for `playerReady` — the
     phase emitted after the turn-start deal. `turn:start` fires before the
     draw, so "Fold a Trick in your hand" would have nothing to fold. */
  e.on('phase', (ev) => {
    if (!ev || ev.phase !== 'playerReady') return;
    const c = fake();
    const st = U.mm(c);

    if (st.standingOrder) {
      const pool = U.cardsIn(c, 'hand').filter(k => creases(k) < maxCrease(c));
      const k = U.rpick(c, pool);
      if (k) fold(c, k, 1);
    }
    if (st.readingAloud) {
      const k = U.cardsIn(c, 'hand')[0];
      if (k) fold(c, k, 1);
    }
    if (st.crowRemembers && st.vanishedCards && st.vanishedCards.length) {
      const k = st.vanishedCards.shift();
      if (k) U.moveCard(c, k, 'hand', { remembered: true });
    }
  });

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    /* Collated puts a folded Trick back on top, so the fold is worth making. */
    if (st.collated) {
      const k = U.cardsIn(c, 'discard').find(x => creases(x) > 0);
      if (k) U.toDrawTop(c, k);
    }
  }, seat);

  /* Marginalia, Mass Production and Watermark all key off a Trick actually
     being played. `ev.card` is a SNAPSHOT and Creases live on the RUNTIME card,
     so it is looked up by uid (trap 19). */
  e.on('card:play', (ev) => {
    if (!ev || ev.actorId !== seat.id) return;
    const c = fake();
    const st = U.mm(c);
    const k = e.card(ev.cardUid);
    if (!k) return;

    if (st.marginalia && k.meta && k.meta.paperCopy && U.once(c, 'marginalia')) U.draw(c, 1);
    if (st.watermarkId && (k.def ? k.def.id : k.id) === st.watermarkId && k.meta && k.meta.paperCopy) {
      gainPaper(c, 1);
    }
    const id = k.def ? k.def.id : k.id;
    st.playedIdsThisTurn = st.playedIdsThisTurn || {};
    st.playedIdsThisTurn[id] = (st.playedIdsThisTurn[id] || 0) + 1;
  });

  /* Shared Library reads a FRIEND's play, so it is a separate listener with the
     seat comparison the other way round. */
  e.on('card:play', (ev) => {
    if (!ev || ev.actorId === seat.id) return;
    const c = fake();
    const st = U.mm(c);
    if (!st.sharedLibrary) return;
    const cost = (ev.card && typeof ev.card.cost === 'number') ? ev.card.cost : 0;
    if (cost >= 2) gainPaper(c, st.sharedLibrary);
  });

  /* Mass Production copies the first Trick each turn AFTER it resolves —
     from inside the effect the card is in LIMBO and the copy would be made
     from a card the engine is about to move (trap 16). */
  e.on('card:resolved', (ev) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.massProduction || !U.once(c, 'massProduction')) return;
    const k = e.card(ev.cardUid);
    if (k && !(k.meta && k.meta.paperCopy)) trace(c, k);
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('fold', 'crinkle/pressed-flat', () => {});
U.onHook('trace', 'crinkle/marginalia', () => {});
U.onHook('refold', 'crinkle/the-second-draft', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'crinkle/paper-cut', name: 'Paper Cut', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'It is a very small wound and you will think about it all day.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, NC(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'crinkle/flatten', name: 'Flatten', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'He is already flat. He becomes flatter.',
    nums: { b: 5 }, effect: eff((c) => U.guard(c, NC(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'crinkle/first-fold', name: 'First Fold', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['fold', 'crease', 'paper'],
    text: '[Fold] a Trick in your hand {n}. Gain {p} [Paper].',
    flavor: 'Corner to corner. Press. That is the whole of it.',
    nums: { n: 1, p: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Fold which Trick?', filter: (x) => creases(x) < maxCrease(c) });
      if (k) fold(c, k, N(c).n);
      gainPaper(c, N(c).p);
    }),
    upgrade: { nums: { n: 1, p: 2 } },
  },
  {
    id: 'crinkle/trace-it', name: 'Trace It', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['trace', 'paper'],
    text: '[Trace] a Trick in your hand.',
    flavor: 'Thin paper, a candle behind it, and a steady beak.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Trace which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      if (k) trace(c, k);
    }),
    upgrade: { text: '[Trace] a Trick in your hand, then draw a Trick.' },
  },
  {
    id: 'crinkle/scrap-paper', name: 'Scrap Paper', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 0, target: SELF, exhaust: true, keywords: ['paper', 'vanish'],
    text: 'Gain {p} [Paper]. [Vanish].',
    flavor: 'The back of an envelope. It will do.',
    nums: { p: 2 },
    effect: eff((c) => gainPaper(c, N(c).p)),
    upgrade: { nums: { p: 3 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'crinkle/sharp-edge', name: 'Sharp Edge', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY,
    /* Printed in the chapter as a plain "deal moderate damage", which is Paper
       Cut with a bigger number — the cards suite is right that a pool should not
       contain a Basic twice. The rider is the smallest thing that makes it a
       Common: it pays for the cheap-copy turns the rest of him is built around.
       The chapter has been updated to match. */
    text: 'Deal {d} damage, and {m0} more if you have already played a Trick this turn.',
    flavor: 'Ninety degrees of absolute intent.',
    nums: { d: 8, m0: 4 },
    effect: eff((c) => U.hit(c, NC(c).d + (U.playedThisTurn(c) > 1 ? NC(c).m0 : 0))),
    upgrade: { nums: { d: 11, m0: 6 } },
  },
  {
    id: 'crinkle/papercrow-dive', name: 'Papercrow Dive', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['crease'],
    text: 'Deal {d} damage, and {m0} more if this Trick has a [Crease].',
    flavor: 'Down the stairwell, silently, at an angle.',
    nums: { d: 6, m0: 4 },
    effect: eff((c) => U.hit(c, NC(c).d + (creases(c.card) ? NC(c).m0 : 0))),
    upgrade: { nums: { d: 9, m0: 6 } },
  },
  {
    id: 'crinkle/fold-and-strike', name: 'Fold and Strike', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['fold', 'crease'],
    text: '[Fold] this Trick {n}, then deal {d} damage.',
    flavor: 'A crease, and then the consequences of a crease.',
    nums: { d: 6, n: 1 },
    effect: eff((c) => { fold(c, c.card, N(c).n); U.hit(c, NC(c).d); }),
    upgrade: { nums: { d: 9, n: 1 } },
  },
  {
    id: 'crinkle/duplicate-beak', name: 'Duplicate Beak', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['trace'],
    text: 'Deal {d} damage. [Trace] this Trick.',
    flavor: 'There are two of him now. There were always two of him.',
    nums: { d: 6 },
    effect: eff((c) => { const k = c.card; U.hit(c, NC(c).d); trace(c, k); }),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: 'crinkle/bookmark', name: 'Bookmark', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['paper'],
    text: 'Deal {d} damage. Gain {p} [Paper].',
    flavor: 'Slid in at exactly the right page, edge first.',
    nums: { d: 9, p: 1 },
    effect: eff((c) => { U.hit(c, NC(c).d); gainPaper(c, N(c).p); }),
    upgrade: { nums: { d: 12, p: 2 } },
  },
  {
    id: 'crinkle/flying-page', name: 'Flying Page', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES,
    text: 'Deal {d} damage to all enemies.',
    flavor: 'One sheet, and then the whole chapter.',
    nums: { d: 6 },
    effect: eff((c) => U.hitAll(c, NC(c).d)),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: 'crinkle/guillotine-cut', name: 'Guillotine Cut', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['crease'],
    text: 'Deal {d} damage. Every [Crease] takes a Nerve off it.',
    flavor: 'The big lever in the Book Repair Room.',
    nums: { d: 14 },
    effect: eff((c) => U.hit(c, NC(c).d)),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'crinkle/read-the-room', name: 'Read the Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease'],
    text: 'Draw {c1} Trick and [Fold] it {n}.',
    flavor: 'He looks at the wallpaper for a long moment.',
    nums: { c1: 1, n: 1 },
    effect: eff((c) => {
      const before = U.cardsIn(c, 'hand').length;
      U.draw(c, N(c).c1);
      const hand = U.cardsIn(c, 'hand');
      for (let i = before; i < hand.length; i++) fold(c, hand[i], N(c).n);
    }),
    upgrade: { nums: { c1: 2, n: 1 } },
  },
  {
    id: 'crinkle/careful-crease', name: 'Careful Crease', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease', 'paper'],
    text: '[Fold] a Trick {n}. Gain {p} [Paper].',
    flavor: 'Thumbnail down the length of it.',
    nums: { n: 1, p: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Fold which Trick?', filter: (x) => creases(x) < maxCrease(c) });
      if (k) fold(c, k, N(c).n);
      gainPaper(c, N(c).p);
    }),
    upgrade: { nums: { n: 2, p: 1 } },
  },
  {
    id: 'crinkle/double-crease', name: 'Double Crease', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 2, target: SELF, keywords: ['fold', 'crease'],
    text: '[Fold] a Trick in your hand {n}.',
    flavor: 'Then across. It is a different object now.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Fold which Trick?', filter: (x) => creases(x) < maxCrease(c) });
      if (k) fold(c, k, N(c).n);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/second-copy', name: 'Second Copy', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['trace', 'paper'],
    text: 'Spend {p} [Paper]. [Trace] a Trick in your hand.',
    flavor: 'For the file. There is always a file.',
    nums: { p: 1 },
    effect: eff(async (c) => {
      if (!spendPaper(c, Math.max(0, N(c).p - (U.mm(c).cheapCopies ? 1 : 0)))) return;
      const k = await pickHand(c, { prompt: 'Trace which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      if (k) trace(c, k);
    }),
    upgrade: { nums: { p: 0 } },
  },
  {
    id: 'crinkle/refold-it', name: 'Refold It', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['refold', 'crease'],
    text: '[Refold] a Trick in your hand. It keeps its [Crease]s.',
    flavor: 'It was a boat. It is a bird. He is not sorry.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Refold which Trick?' });
      if (k) refold(c, k);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/paper-screen', name: 'Paper Screen', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['paper'],
    /* Same correction as Sharp Edge: printed as a plain Guard Skill, which is
       Flatten again. Reading [Paper] is the cheapest way to make it his. */
    text: 'Gain {b} Guard, and {m0} more if you hold any [Paper].',
    flavor: 'It would not stop anything. It stops things.',
    nums: { b: 7, m0: 4 },
    effect: eff((c) => U.guard(c, NC(c).b + (paper(c) > 0 ? NC(c).m0 : 0))),
    upgrade: { nums: { b: 10, m0: 6 } },
  },
  {
    id: 'crinkle/concertina', name: 'Concertina', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['crease'],
    text: 'Gain {b} Guard, and {m0} more for every [Crease] in your hand.',
    flavor: 'Back and forth and back and forth and back.',
    nums: { b: 5, m0: 3 },
    effect: eff((c) => U.guard(c, NC(c).b + NC(c).m0 * totalCreases(c))),
    upgrade: { nums: { b: 8, m0: 4 } },
  },
  {
    id: 'crinkle/loose-leaf', name: 'Loose Leaf', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['paper'],
    text: 'Discard a Trick. Gain {p} [Paper] and draw {c1}.',
    flavor: 'It fell out of something. It is his now.',
    nums: { p: 2, c1: 1 },
    effect: eff((c) => { c.discard(1, { choose: true }); gainPaper(c, N(c).p); U.draw(c, N(c).c1); }),
    upgrade: { nums: { p: 3, c1: 1 } },
  },
  {
    id: 'crinkle/pulp', name: 'Pulp', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['paper', 'vanish'],
    text: '[Vanish] a Trick in your hand. Gain [Paper] equal to its Nerve cost plus {p}.',
    flavor: 'Back to soup. Everything goes back to soup.',
    nums: { p: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Pulp which Trick?' });
      if (!k) return;
      const cost = Math.max(0, U.printedCost(k));
      U.moveCard(c, k, 'exhaust', { pulped: true });
      gainPaper(c, cost + N(c).p);
    }),
    upgrade: { nums: { p: 2 } },
  },
  {
    id: 'crinkle/filing', name: 'Filing', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease'],
    text: 'Look at the top {n} Tricks. Put one in your hand and [Fold] it {m0}.',
    flavor: 'Alphabetical, then chronological, then by mood.',
    nums: { n: 3, m0: 1 },
    effect: eff(async (c) => {
      const top = U.cardsIn(c, 'draw').slice(-N(c).n);
      if (!top.length) return;
      const [k] = await U.pickCards(c, { pile: 'draw', pool: top, count: 1, prompt: 'Take which Trick?' });
      if (!k) return;
      U.toHand(c, k);
      fold(c, k, N(c).m0);
    }),
    upgrade: { nums: { n: 5, m0: 1 } },
  },
  {
    id: 'crinkle/paper-trail', name: 'Paper Trail', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['paper', 'vanish'],
    text: 'The first Trick to [Vanish] each turn gives {p} additional [Paper].',
    flavor: 'You can follow him. That is rather the point.',
    nums: { p: 1 },
    effect: eff((c) => power(c, 'crinkle/paper-trail', (x, s) => { s.paperTrail = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/practised-hands', name: 'Practised Hands', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease'],
    text: 'The first Trick you [Fold] each turn gets {n} more [Crease].',
    flavor: 'He has done this eleven thousand times.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'crinkle/practised-hands', (x, s) => { s.practisedHands = N(x).n; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/marginalia', name: 'Marginalia', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['trace'],
    text: 'The first Paper Copy you play each turn draws {c1} Trick.',
    flavor: 'Somebody has written in this. In pencil. Rudely.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'crinkle/marginalia', (x, s) => { s.marginalia = true; })),
    upgrade: { cost: 0 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'crinkle/thousand-cuts', name: 'Thousand Cuts', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['crease'],
    text: 'Deal {d} damage once for each [Crease] on this Trick, at least once.',
    flavor: 'None of them is the one that does it.',
    nums: { d: 5, hits: 4 },
    balance: { scalesWith: 'its own Creases' },
    effect: eff((c) => U.hitN(c, NC(c).d, Math.max(1, creases(c.card)))),
    upgrade: { nums: { d: 7, hits: 4 } },
  },
  {
    id: 'crinkle/origami-crow', name: 'Origami Crow', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['overfolded'],
    text: 'Deal {d} damage. [Overfolded]: it hits every enemy instead.',
    flavor: 'The finished object. Beak, wings, and a terrible opinion.',
    nums: { d: 15 },
    effect: eff((c) => { if (isOverfolded(c, c.card)) U.hitAll(c, NC(c).d); else U.hit(c, NC(c).d); }),
    upgrade: { nums: { d: 20 } },
  },
  {
    id: 'crinkle/cut-and-paste', name: 'Cut and Paste', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['trace'],
    text: 'Deal {d} damage, then [Trace] this Trick.',
    flavor: 'Scissors. Glue. A certain lack of scruple.',
    nums: { d: 9 },
    effect: eff((c) => { const k = c.card; U.hit(c, NC(c).d); trace(c, k); }),
    upgrade: { nums: { d: 13 } },
  },
  {
    id: 'crinkle/bookbinders-blade', name: "Bookbinder's Blade", companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['crease', 'paper'],
    text: 'Deal {d} damage. Gain {p} [Paper] for each [Crease] on this Trick.',
    flavor: 'Very thin. Very old. Very sharp.',
    nums: { d: 10, p: 1 },
    effect: eff((c) => { U.hit(c, NC(c).d); gainPaper(c, N(c).p * creases(c.card)); }),
    upgrade: { nums: { d: 14, p: 1 } },
  },
  {
    id: 'crinkle/errata', name: 'Errata', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['refold'],
    text: 'Deal {d} damage. [Refold] a Trick in your hand.',
    flavor: 'For "crow" read "crown". For "crown" read "crow".',
    nums: { d: 10 },
    effect: eff(async (c) => {
      U.hit(c, NC(c).d);
      const k = await pickHand(c, { optional: true, prompt: 'Refold which Trick?' });
      if (k) refold(c, k);
    }),
    upgrade: { nums: { d: 14 } },
  },
  {
    id: 'crinkle/folded-flock', name: 'Folded Flock', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['paper'],
    text: 'Deal {d} damage to all enemies once for every {n} [Paper] you hold, at least once.',
    flavor: 'All of them at once, and all of them the same.',
    nums: { d: 6, n: 2, hits: 4 },
    balance: { scalesWith: 'Paper held' },
    effect: eff((c) => U.hitAllN(c, NC(c).d, Math.max(1, Math.floor(paper(c) / N(c).n)))),
    upgrade: { nums: { d: 8, n: 2, hits: 4 } },
  },
  {
    id: 'crinkle/dog-ear', name: 'Dog-Ear', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['fold', 'crease'],
    text: 'Deal {d} damage and [Fold] this Trick {n}. Once a turn, it comes back to your hand.',
    flavor: 'Somebody has turned down the corner. Somebody always has.',
    nums: { d: 5, n: 1 },
    effect: eff((c) => {
      U.hit(c, NC(c).d);
      fold(c, c.card, N(c).n);
      if (U.once(c, 'dogEar') && !isOverfolded(c, c.card)) U.returnSelf(c);
    }),
    upgrade: { nums: { d: 7, n: 1 } },
  },
  {
    id: 'crinkle/shredder', name: 'Shredder', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['vanish', 'paper'],
    text: '[Vanish] a Trick in your hand. Deal {d} damage plus {m0} for each Nerve it cost.',
    flavor: 'The Book Repair Room has one. It is not for repairs.',
    nums: { d: 14, m0: 5 },
    balance: { scalesWith: "the Vanished Trick's cost" },
    effect: eff(async (c) => {
      const k = await pickHand(c, { optional: true, prompt: 'Shred which Trick?' });
      let cost = 0;
      if (k) { cost = Math.max(0, U.printedCost(k)); U.moveCard(c, k, 'exhaust', { shredded: true }); }
      U.hit(c, NC(c).d + NC(c).m0 * cost);
    }),
    upgrade: { nums: { d: 19, m0: 6 } },
  },
  {
    id: 'crinkle/between-the-lines', name: 'Between the Lines', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['overfolded'],
    text: 'Deal {d} damage, and {m0} more with an [Overfolded] Trick in your hand.',
    flavor: 'There is more here than there is here.',
    nums: { d: 9, m0: 8 },
    effect: eff((c) => U.hit(c, NC(c).d + (handOverfolded(c).some(k => k !== c.card) ? NC(c).m0 : 0))),
    upgrade: { nums: { d: 13, m0: 11 } },
  },
  {
    id: 'crinkle/sharpened-corner', name: 'Sharpened Corner', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['fold', 'crease'],
    text: 'Deal {d} damage. [Fold] a Trick in your hand {n} afterwards.',
    flavor: 'One corner, done properly, is a weapon.',
    nums: { d: 15, n: 1 },
    effect: eff(async (c) => {
      U.hit(c, NC(c).d);
      const k = await pickHand(c, { optional: true, prompt: 'Fold which Trick?', filter: (x) => creases(x) < maxCrease(c) });
      if (k) fold(c, k, N(c).n);
    }),
    upgrade: { nums: { d: 20, n: 2 } },
  },
  {
    id: 'crinkle/quill', name: 'Quill', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['crease'],
    text: 'Deal {d} damage three times.',
    flavor: 'One of his own. He can spare it.',
    nums: { d: 5, hits: 3 },
    effect: eff((c) => U.hitN(c, NC(c).d, 3)),
    upgrade: { nums: { d: 7, hits: 3 } },
  },
  {
    id: 'crinkle/press-cutting', name: 'Press Cutting', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['trace', 'crease'],
    text: '[Trace] a Trick in your hand, then deal {d} damage for each [Crease] on the copy.',
    flavor: 'Clipped out and kept. Everything gets kept.',
    nums: { d: 8, hits: 3 },
    balance: { scalesWith: 'the copied Creases' },
    effect: eff(async (c) => {
      const k = await pickHand(c, { optional: true, prompt: 'Trace which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      const copy = k ? trace(c, k) : null;
      U.hitN(c, NC(c).d, Math.max(1, creases(copy)));
    }),
    upgrade: { nums: { d: 11, hits: 3 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'crinkle/crease-along-the-grain', name: 'Crease Along the Grain', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease', 'overfolded', 'paper'],
    text: '[Fold] a Trick {n}. Gain {p} [Paper] if it is now [Overfolded].',
    flavor: 'With the grain it goes cleanly. Against it, it tears.',
    nums: { n: 2, p: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Fold which Trick?', filter: (x) => creases(x) < maxCrease(c) });
      if (!k) return;
      fold(c, k, N(c).n);
      if (isOverfolded(c, k)) gainPaper(c, N(c).p);
    }),
    upgrade: { nums: { n: 2, p: 3 } },
  },
  {
    id: 'crinkle/paper-mirror', name: 'Paper Mirror', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['trace'],
    text: '[Trace] a Trick. The copy does NOT [Vanish] when played.',
    flavor: 'The same, but the wrong way round, and it stays.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Trace which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      if (k) trace(c, k, { permanent: true });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/rewrite', name: 'Rewrite', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['refold'],
    text: '[Refold] a Trick. Two results are considered and the better one is kept.',
    flavor: 'Draft after draft after draft.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Refold which Trick?' });
      if (k) refold(c, k, { ofTwo: true });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/reference-copy', name: 'Reference Copy', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['trace', 'crease'],
    text: '[Trace] every Trick in your hand that costs nothing.',
    flavor: 'For reference only. Do not remove. He removed it.',
    nums: {},
    effect: eff((c) => {
      for (const k of U.handOthers(c)) {
        if (k.meta && k.meta.noTrace) continue;
        if (c.e.costOf(k) === 0) trace(c, k);
      }
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/sheaf', name: 'Sheaf', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease'],
    text: 'Draw {c1} Tricks. [Fold] one of them {n}.',
    flavor: 'A whole handful. Untidy. Promising.',
    nums: { c1: 2, n: 1 },
    effect: eff(async (c) => {
      U.draw(c, N(c).c1);
      const k = await pickHand(c, { optional: true, prompt: 'Fold which Trick?', filter: (x) => creases(x) < maxCrease(c) });
      if (k) fold(c, k, N(c).n);
    }),
    upgrade: { nums: { c1: 3, n: 1 } },
  },
  {
    id: 'crinkle/bookplate', name: 'Bookplate', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['overfolded', 'paper'],
    text: 'Gain {b} Guard. Gain {p} [Paper] for each [Overfolded] Trick in your hand.',
    flavor: 'EX LIBRIS. Nobody knows whose.',
    nums: { b: 13, p: 1 },
    effect: eff((c) => { U.guard(c, NC(c).b); gainPaper(c, N(c).p * handOverfolded(c).length); }),
    upgrade: { nums: { b: 18, p: 2 } },
  },
  {
    id: 'crinkle/unbound', name: 'Unbound', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['paper', 'vanish'],
    text: 'Spend any [Paper]. Draw {c1} Trick for every {n} spent. [Vanish].',
    flavor: 'The stitching goes and the whole thing is just sheets.',
    nums: { c1: 1, n: 3 },
    effect: eff((c) => {
      let spent = 0;
      while (spendPaper(c, 1)) spent++;
      U.draw(c, Math.floor(spent / N(c).n) * N(c).c1);
    }),
    upgrade: { nums: { c1: 1, n: 2 } },
  },
  {
    id: 'crinkle/fold-along-the-fold', name: 'Fold Along the Fold', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease', 'refold'],
    text: '[Fold] an already-[Crease]d Trick {n} more. It cannot be [Refold]ed this turn.',
    flavor: 'Follow the line that is already there.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Fold which Trick?', filter: (x) => creases(x) > 0 && creases(x) < maxCrease(c) });
      if (!k) return;
      fold(c, k, N(c).n);
      k.meta.noRefoldTurn = U.turn(c);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'crinkle/index', name: 'Index', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease'],
    text: 'Search your draw pile. Put that Trick in your hand and [Fold] it {n}.',
    flavor: 'See also: everything.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'draw', count: 1, prompt: 'Find which Trick?' });
      if (!k) return;
      U.toHand(c, k);
      fold(c, k, N(c).n);
      U.reshuffle(c);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'crinkle/watermark', name: 'Watermark', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['trace', 'paper'],
    text: 'Choose a Trick. Copies of it played this turn each give {p} [Paper].',
    flavor: 'Hold it up to the candle and there he is.',
    nums: { p: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Watermark which Trick?' });
      if (k) U.mm(c).watermarkId = (k.def ? k.def.id : k.id);
    }),
    upgrade: { nums: { p: 2 } },
  },
  {
    id: 'crinkle/straighten', name: 'Straighten', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['crease', 'fold', 'vanish'],
    text: 'Move every [Crease] from one Trick in your hand onto another. [Vanish].',
    flavor: 'It will never be flat again but it can be a different shape.',
    nums: {},
    effect: eff(async (c) => {
      const from = await pickHand(c, { prompt: 'Take the Creases from?', filter: (x) => creases(x) > 0 });
      if (!from) return;
      const to = await pickHand(c, { prompt: 'And put them on?', filter: (x) => x !== from });
      if (!to) return;
      const moved = unfold(c, from);
      fold(c, to, moved);
    }),
    upgrade: { cost: 0, text: 'Move every [Crease] from one Trick onto another, then draw a Trick. [Vanish].' },
  },
  {
    id: 'crinkle/foolscap', name: 'Foolscap', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['paper'],
    text: 'Gain {b} Guard and {p} [Paper].',
    flavor: 'A big sheet with a jester on the watermark.',
    nums: { b: 10, p: 2 },
    effect: eff((c) => { U.guard(c, NC(c).b); gainPaper(c, N(c).p); }),
    upgrade: { nums: { b: 14, p: 3 } },
  },
  {
    id: 'crinkle/air-between-the-pages', name: 'Air Between the Pages', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['vanish'],
    text: 'Gain {b} Guard, and {m0} more for each Trick that [Vanish]ed this turn.',
    flavor: 'Not nothing. Just very thin.',
    nums: { b: 8, m0: 4 },
    effect: eff((c) => U.guard(c, NC(c).b + NC(c).m0 * (U.mm(c).vanishedThisTurn || 0))),
    upgrade: { nums: { b: 11, m0: 6 } },
  },
  {
    id: 'crinkle/impression', name: 'Impression', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['trace', 'fold', 'crease'],
    text: '[Trace] a Trick, then [Fold] the copy {n}.',
    flavor: 'Pressed hard enough to come through to the next sheet.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Trace which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      if (!k) return;
      const copy = trace(c, k);
      if (copy) fold(c, copy, N(c).n);
    }),
    upgrade: { nums: { n: 2 } },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'crinkle/standing-order', name: 'Standing Order', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['fold', 'crease'],
    text: 'At the start of your turn, [Fold] a random Trick in your hand {n}.',
    flavor: 'Every week, the same shelf, the same time.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'crinkle/standing-order', (x, s) => { s.standingOrder = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/under-the-blotter', name: 'Under the Blotter', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['overfolded', 'paper'],
    text: '[Overfolded] Tricks give {p} additional [Paper] when they [Vanish].',
    flavor: 'Everything worth keeping is under the blotter.',
    nums: { p: 1 },
    effect: eff((c) => power(c, 'crinkle/under-the-blotter', (x, s) => { s.underTheBlotter = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/cheap-reproduction', name: 'Cheap Reproduction', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['trace', 'paper'],
    text: '[Trace] costs 1 [Paper] less, to a minimum of nothing.',
    flavor: 'The quality is appalling. There are so many of them.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/cheap-reproduction', (x, s) => { s.cheapCopies = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/reading-aloud', name: 'Reading Aloud', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['fold', 'crease'],
    text: 'The first Trick you draw each turn is [Fold]ed {n}.',
    flavor: 'He does the voices. All of them. Badly.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'crinkle/reading-aloud', (x, s) => { s.readingAloud = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/the-second-draft', name: 'The Second Draft', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['refold', 'trace'],
    text: 'The first time you [Refold] each turn, [Trace] the result.',
    flavor: 'Nobody has ever meant the first one.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/the-second-draft', (x, s) => { s.secondDraft = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/pressed-flat', name: 'Pressed Flat', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['fold', 'crease'],
    text: 'Whenever you [Fold] a Trick to exactly two [Crease]s, gain {b} Guard.',
    flavor: 'Under the heaviest book on the heaviest shelf.',
    nums: { b: 9 },
    effect: eff((c) => power(c, 'crinkle/pressed-flat', (x, s) => { s.pressedFlat = N(x).b; })),
    upgrade: { nums: { b: 13 } },
  },
  {
    id: 'crinkle/paper-doors', name: 'Paper Doors', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['trace', 'paper'],
    text: 'Whenever a Paper Copy [Vanish]es, gain {p} [Paper].',
    flavor: 'A door drawn on a wall, which opens.',
    nums: { p: 1 },
    effect: eff((c) => power(c, 'crinkle/paper-doors', (x, s) => { s.paperDoors = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/collated', name: 'Collated', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['crease'],
    text: 'At the end of your turn, put a [Crease]d Trick from your discard pile on top of your deck.',
    flavor: 'In order. In actual order.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/collated', (x, s) => { s.collated = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/deckle-edge', name: 'Deckle Edge', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['crease'],
    text: 'Every [Crease] is worth twice as much to a Trick’s numbers.',
    flavor: 'The rough edge. The expensive one.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/deckle-edge', (x, s) => { s.deckleEdge = true; recomputeAll(x); })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'crinkle/the-whole-library', name: 'The Whole Library', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['crease'],
    text: 'Deal {d} damage to all enemies once for each [Crease] in your hand, up to six times.',
    flavor: 'Every shelf. Every gallery. At once.',
    nums: { d: 8, hits: 6 },
    balance: { scalesWith: 'Creases in hand' },
    effect: eff((c) => U.hitAllN(c, NC(c).d, Math.max(1, Math.min(6, totalCreases(c))))),
    upgrade: { nums: { d: 11, hits: 6 } },
  },
  {
    id: 'crinkle/perfect-fold', name: 'Perfect Fold', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['overfolded'],
    text: 'Deal {d} damage. [Overfolded]: deal it twice before it [Vanish]es.',
    flavor: 'Every edge true. Every plane a flat facet.',
    nums: { d: 20 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, NC(c).d);
      if (isOverfolded(c, c.card)) U.hitAt(c, t, NC(c).d);
    }),
    upgrade: { nums: { d: 27 } },
  },
  {
    id: 'crinkle/paper-storm', name: 'Paper Storm', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['trace'],
    text: '[Trace] this Trick twice, then deal {d} damage.',
    flavor: 'The Index Hall, in a draught, with the windows open.',
    nums: { d: 14 },
    effect: eff((c) => { const k = c.card; trace(c, k); trace(c, k); U.hit(c, NC(c).d); }),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'crinkle/the-archivists-knife', name: "The Archivist's Knife", companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['paper'],
    text: 'Deal damage equal to your [Paper], then spend all of it.',
    flavor: 'He keeps it in the drawer with the good scissors.',
    nums: { d: 8, m0: 16 },
    balance: { scalesWith: 'Paper held' },
    effect: eff((c) => {
      const have = paper(c);
      U.hit(c, Math.max(NC(c).d, have));
      spendPaper(c, have);
    }),
    upgrade: { nums: { d: 12, m0: 20 } },
  },
  {
    id: 'crinkle/fold-everything', name: 'Fold Everything', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['fold', 'crease', 'overfolded'],
    text: '[Fold] every Trick in your hand {n}, then deal {d} to all enemies for each that became [Overfolded].',
    flavor: 'All of it. Everything on the table.',
    nums: { d: 12, n: 1, hits: 4 },
    balance: { scalesWith: 'Tricks that became Overfolded' },
    effect: eff((c) => {
      let made = 0;
      for (const k of U.handOthers(c)) {
        const was = isOverfolded(c, k);
        fold(c, k, N(c).n);
        if (!was && isOverfolded(c, k)) made++;
      }
      U.hitAllN(c, NC(c).d, Math.max(1, made));
    }),
    upgrade: { nums: { d: 16, n: 1, hits: 4 } },
  },
  {
    id: 'crinkle/cut-along-the-dotted-line', name: 'Cut Along the Dotted Line', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, exhaust: true, keywords: ['paper', 'vanish'],
    text: 'Deal {d} damage. [Vanish]. Gain {p} [Paper].',
    flavor: 'It says to. He does.',
    nums: { d: 24, p: 4 },
    effect: eff((c) => { U.hit(c, NC(c).d); gainPaper(c, N(c).p); }),
    upgrade: { nums: { d: 32, p: 5 } },
  },
  {
    id: 'crinkle/flight-of-pages', name: 'Flight of Pages', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['vanish'],
    text: 'Deal {d} damage at random once for every Trick that has [Vanish]ed this Scuffle, up to eight.',
    flavor: 'Everything he has spent, coming back at once.',
    nums: { d: 5, hits: 8 },
    balance: { scalesWith: 'Tricks Vanished this combat' },
    effect: eff((c) => U.hitRandomN(c, NC(c).d, Math.max(1, Math.min(8, U.mm(c).vanishedThisCombat || 0)))),
    upgrade: { nums: { d: 7, hits: 8 } },
  },
  {
    id: 'crinkle/the-same-page-twice', name: 'The Same Page Twice', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['trace'],
    text: 'Deal {d} damage. If a copy of this Trick has already been played this turn, deal it again.',
    flavor: 'You have read this. You are reading it again.',
    nums: { d: 12, hits: 2 },
    effect: eff((c) => {
      const t = c.target;
      const id = c.card && (c.card.def ? c.card.def.id : c.card.id);
      const seen = ((U.mm(c).playedIdsThisTurn || {})[id] || 0) > 1;
      U.hit(c, NC(c).d);
      if (seen) U.hitAt(c, t, NC(c).d);
    }),
    upgrade: { nums: { d: 16, hits: 2 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'crinkle/master-copy', name: 'Master Copy', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['trace', 'crease'],
    text: '[Trace] a Trick {n} times. The copies keep its [Crease]s.',
    flavor: 'The one they make all the others from.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Copy which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      if (!k) return;
      for (let i = 0; i < N(c).n; i++) trace(c, k);
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'crinkle/third-crease', name: 'Third Crease', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['fold', 'crease', 'overfolded'],
    text: '[Fold] a Trick in your hand all the way to [Overfolded], however many [Crease]s it had.',
    flavor: 'The one you cannot take back.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Overfold which Trick?', filter: (x) => creases(x) < OVERFOLD });
      if (k) fold(c, k, OVERFOLD - creases(k));
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/unfold', name: 'Unfold', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['crease', 'paper', 'vanish'],
    text: 'Take every [Crease] off a Trick. Gain {p} [Paper] and draw a Trick for each. [Vanish].',
    flavor: 'The only thing in the house that undoes anything.',
    nums: { p: 2 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Unfold which Trick?', filter: (x) => creases(x) > 0 });
      if (!k) return;
      const had = unfold(c, k);
      gainPaper(c, had * N(c).p);
      U.draw(c, had);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/the-houses-floor-plan', name: "The House's Floor Plan", companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['fold', 'crease', 'vanish'],
    text: 'Look through your whole deck. Take one Trick and [Fold] it {n}. [Vanish].',
    flavor: 'He knows how the house changes its floor plan.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'draw', count: 1, prompt: 'Take which Trick?' });
      if (!k) return;
      U.toHand(c, k);
      fold(c, k, N(c).n);
      U.reshuffle(c);
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'crinkle/papermaking', name: 'Papermaking', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['paper', 'vanish'],
    text: '[Vanish] any number of Tricks in your hand. Gain {p} [Paper] for each and draw half that many.',
    flavor: 'Rags, water, a frame, and a great deal of patience.',
    nums: { p: 2 },
    effect: eff(async (c) => {
      let n = 0;
      for (;;) {
        const k = await pickHand(c, { optional: true, prompt: 'Pulp which Trick? (or stop)' });
        if (!k) break;
        U.moveCard(c, k, 'exhaust', { pulped: true });
        n++;
      }
      gainPaper(c, n * N(c).p);
      U.draw(c, Math.floor(n / 2));
    }),
    upgrade: { nums: { p: 3 } },
  },
  {
    id: 'crinkle/second-edition', name: 'Second Edition', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['refold', 'crease'],
    text: '[Refold] every Trick in your hand. They all keep their [Crease]s.',
    flavor: 'Revised. Expanded. Worse.',
    nums: {},
    effect: eff((c) => { for (const k of U.handOthers(c)) refold(c, k); }),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/endless-ream', name: 'Endless Ream', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['paper', 'vanish'],
    text: 'Fill your [Paper]. [Vanish].',
    flavor: 'The stationery cupboard does not have a back.',
    nums: {},
    effect: eff((c) => gainPaper(c, paperMax(c) - paper(c))),
    upgrade: { cost: 0, text: 'Fill your [Paper] and draw a Trick. [Vanish].' },
  },
  {
    id: 'crinkle/bind', name: 'Bind', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['crease', 'fold'],
    text: 'Choose two Tricks in your hand. Each gains the other’s [Crease]s.',
    flavor: 'Sewn together down the spine.',
    nums: {},
    effect: eff(async (c) => {
      const a = await pickHand(c, { prompt: 'Bind which Trick…' });
      if (!a) return;
      const b = await pickHand(c, { prompt: '…to which?', filter: (x) => x !== a });
      if (!b) return;
      const ca = creases(a), cb = creases(b);
      fold(c, a, cb);
      fold(c, b, ca);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/kept-flat', name: 'Kept Flat', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['overfolded'],
    text: 'An [Overfolded] Trick of your choice does not [Vanish] the next time it is played.',
    flavor: 'In the flat drawer. The wide one nobody opens.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Keep which Trick flat?', filter: (x) => isOverfolded(c, x) });
      if (k) k.meta.keptFlat = true;
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/the-long-fold', name: 'The Long Fold', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: SELF, exhaust: true, keywords: ['fold', 'crease', 'overfolded', 'trace', 'vanish'],
    text: '[Fold] a Trick to [Overfolded] and [Trace] it {n} times. [Vanish].',
    flavor: 'The last one. Hold your breath.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Which Trick?' });
      if (!k) return;
      fold(c, k, Math.max(0, OVERFOLD - creases(k)));
      for (let i = 0; i < N(c).n; i++) trace(c, k);
    }),
    upgrade: { cost: 2 },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'crinkle/never-unfolds', name: 'Never Unfolds', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['overfolded'],
    text: '[Overfolded] Tricks no longer [Vanish] when played.',
    flavor: 'It has been this shape for a hundred years.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/never-unfolds', (x, s) => { s.neverUnfolds = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'crinkle/paper-everything', name: 'Paper Everything', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['paper'],
    text: 'Your maximum [Paper] becomes {n}.',
    flavor: 'The walls. The stairs. The Archivist, possibly.',
    nums: { n: BIG_PAPER },
    effect: eff((c) => power(c, 'crinkle/paper-everything', (x, s) => {
      s.paperEverything = true;
      x.defineCounter(paperTrack(BIG_PAPER, paper(x)));
    })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/fourth-crease', name: 'Fourth Crease', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['crease', 'overfolded'],
    text: 'Tricks hold a fourth [Crease]. [Overfolded] still means three or more.',
    flavor: 'There should not be room. There is room.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/fourth-crease', (x, s) => { s.fourthCrease = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'crinkle/the-archive', name: 'The Archive', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['vanish', 'crease'],
    text: 'Tricks that [Vanish] go to the bottom of your deck instead, keeping their [Crease]s.',
    flavor: 'Nothing is thrown away here. Nothing has ever been thrown away here.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/the-archive', (x, s) => { s.theArchive = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/mass-production', name: 'Mass Production', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['trace'],
    text: 'The first Trick you play each turn is [Trace]d after it resolves.',
    flavor: 'Hundreds of them. Thousands. All exactly the same.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/mass-production', (x, s) => { s.massProduction = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'crinkle/everything-is-paper', name: 'Everything Is Paper', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['paper'],
    text: '[Paper] you cannot hold becomes damage to a random enemy instead.',
    flavor: 'He has been saying this for years and nobody listens.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/everything-is-paper', (x, s) => { s.everythingIsPaper = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'crinkle/the-crow-remembers', name: 'The Crow Remembers', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['vanish', 'crease'],
    text: 'At the start of your turn, a Trick that [Vanish]ed this Scuffle comes back to your hand with its [Crease]s.',
    flavor: 'Crows remember faces. This one remembers paperwork.',
    nums: {},
    effect: eff((c) => power(c, 'crinkle/the-crow-remembers', (x, s) => { s.crowRemembers = true; })),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'crinkle/carbon-copy', name: 'Carbon Copy', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['trace'],
    text: 'Put a free Paper Copy of one of your Tricks into a friend’s hand. It [Vanish]es.',
    flavor: 'Press hard. You are making three.',
    nums: {},
    effect: eff(async (c) => {
      const k = await pickHand(c, { prompt: 'Copy which Trick?', filter: (x) => !(x.meta && x.meta.noTrace) });
      if (!k) return;
      const ally = await c.chooseAlly();
      if (!ally) return;
      const made = c.giveCard(ally, k.def || k, { pile: 'hand' });
      if (made) { U.costSet(c, made, 0, 'combat'); made.meta.noTrace = true; made.meta.paperCopy = true; U.makeVanish(c, made); }
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'crinkle/lend-a-page', name: 'Lend a Page', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['fold', 'crease', 'paper'],
    text: '[Fold] a Trick in a friend’s hand {n}. Gain {p} [Paper].',
    flavor: 'Improving somebody else’s book without asking.',
    nums: { n: 1, p: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) { gainPaper(c, N(c).p); return; }
      const pick = await c.askAlly(ally, { pool: c.allyCards(ally, 'hand'), prefer: 'costliest' });
      const k = Array.isArray(pick) ? pick[0] : pick;
      if (k) fold(c, k, N(c).n);
      gainPaper(c, N(c).p);
    }),
    upgrade: { nums: { n: 2, p: 1 } },
  },
  {
    id: 'crinkle/paper-screen-for-two', name: 'Paper Screen for Two', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['crease'],
    text: 'You and a friend each gain {b} Guard, and {m0} more for each [Crease] in your hand.',
    flavor: 'It is a big screen. There are birds on it.',
    nums: { b: 8, m0: 2 },
    effect: eff(async (c) => {
      const bonus = NC(c).b + NC(c).m0 * totalCreases(c);
      U.guard(c, bonus);
      const ally = await c.chooseAlly();
      if (ally) c.giveBlock(ally, bonus);
    }),
    upgrade: { nums: { b: 12, m0: 3 } },
  },
  {
    id: 'crinkle/shared-library', name: 'Shared Library', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, coop: true, keywords: ['paper'],
    text: 'Whenever a friend plays a Trick costing 2 or more, gain {p} [Paper].',
    flavor: 'Everyone’s books, on everyone’s shelves.',
    nums: { p: 1 },
    effect: eff((c) => power(c, 'crinkle/shared-library', (x, s) => { s.sharedLibrary = N(x).p; })),
    upgrade: { nums: { p: 2 } },
  },
  {
    id: 'crinkle/the-whole-house-on-paper', name: 'The Whole House on Paper', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: SELF, coop: true, keywords: ['fold', 'crease', 'trace'],
    text: 'Every friend draws a Trick and [Fold]s it {n}. [Trace] one of your own for each who did.',
    flavor: 'Every room, every door, every stair, at 1:100.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      let n = 0;
      for (const mate of c.teammates()) {
        c.giveDraw(mate, 1);
        const pick = await c.askAlly(mate, { pool: c.allyCards(mate, 'hand'), prefer: 'costliest' });
        const k = Array.isArray(pick) ? pick[0] : pick;
        if (k) { fold(c, k, N(c).n); n++; }
      }
      for (let i = 0; i < n; i++) {
        const own = U.handOthers(c).find(x => !(x.meta && x.meta.noTrace));
        if (own) trace(c, own);
      }
    }),
    upgrade: { nums: { n: 2 } },
  },
];

export default {
  slug: SLUG,
  name: 'Crinkle',
  title: 'the Paper Crow',
  region: 'study-library',
  identity:
    'Crinkle does not change the board. He changes the Tricks. He copies them, folds them — ' +
    'permanently cheaper and permanently stronger, and the Creases survive being discarded and ' +
    'drawn again — and refolds them into different Tricks entirely. His whole tension is one ' +
    'sentence: a folded Trick is the best card in your deck, right up until the fold you cannot ' +
    'take back. The third Crease makes a Trick twice its printed size and free, and destroys it ' +
    'the moment you use it, so every Crinkle deck is a running argument about whether to stop at ' +
    'two.',
  strengths: [
    'The only Companion whose deck genuinely improves during a fight, permanently',
    'Enormous single turns: a traced Overfolded Rare is four times a printed effect for nothing',
    'Refold fixes a dead draw, which nothing else in the roster can do',
    'Cost reduction that compounds with every other discount in the game',
    'Very strong with expensive Rares, exactly where other decks struggle',
  ],
  weaknesses: [
    'Folding is one-way, and so is a Refold that gave you something worse',
    'His deck SHRINKS — Overfolded Tricks leave the fight when used',
    'A turn spent folding is a turn the enemy is not being hit',
    'Paper Copies Vanish, so a copy-heavy turn leaves nothing behind',
    'Refold is random, and randomness is worst when the situation is specific',
    'No defensive mechanic of his own; his Guard is ordinary Skills that happen to be folded',
    'Against a three-turn fight he is simply worse than everybody',
  ],
  startingHp: 68,
  startingEnergy: 3,
  mechanics: {
    paper: { name: 'Paper', kind: 'resource', desc: 'Holds 8, or 16 under Paper Everything. Gained whenever one of his Tricks Vanishes, and spent on Tracing and Refolding.', min: 0, max: 16, hooks: [] },
    crease: { name: 'Crease / Fold X', kind: 'system', desc: 'A Trick holds up to 3 Creases. Each one takes a Nerve off its cost and adds a third to its printed numbers, and they are PERMANENT — a folded Trick stays folded through the discard pile and back into your hand.', min: 0, max: 4, hooks: ['fold'] },
    overfolded: { name: 'Overfolded', kind: 'system', desc: 'A Trick at 3 Creases: twice its printed size, free, and removed from the combat when played. The payoff and the cost are the same event.', min: 0, max: 1, hooks: [] },
    trace: { name: 'Trace', kind: 'system', desc: 'Make a Paper Copy of a Trick in your hand. It costs 0, keeps the original\'s Creases, Vanishes when played, and cannot itself be Traced.', min: 0, max: 9, hooks: ['trace'] },
    refold: { name: 'Refold', kind: 'system', desc: 'Turn a Trick into a different one of the same type from Crinkle\'s pool, keeping its Creases. Transformation, not selection — the result is random.', min: 0, max: 9, hooks: ['refold'] },
  },
  startingDeck: [
    'crinkle/paper-cut', 'crinkle/paper-cut', 'crinkle/paper-cut', 'crinkle/paper-cut',
    'crinkle/flatten', 'crinkle/flatten', 'crinkle/flatten',
    'crinkle/first-fold', 'crinkle/trace-it', 'crinkle/scrap-paper',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'The Copyist', desc: 'Trace constantly. Every turn is the same excellent Trick two or three times, paid for in Paper rather than Nerve.', coreCards: ['crinkle/second-copy', 'crinkle/master-copy', 'crinkle/paper-mirror', 'crinkle/reference-copy', 'crinkle/marginalia', 'crinkle/cheap-reproduction', 'crinkle/mass-production'] },
    { name: 'Deep Folds', desc: 'Pick one Trick early and put every Crease in it. Build the rest of the deck around drawing it, copying it, and getting more than one use out of the turn it dies.', coreCards: ['crinkle/double-crease', 'crinkle/crease-along-the-grain', 'crinkle/third-crease', 'crinkle/perfect-fold', 'crinkle/the-long-fold', 'crinkle/kept-flat', 'crinkle/never-unfolds'] },
    { name: 'The Refolder', desc: 'Treat the hand as raw material. Refold anything unwanted, keep the Creases, and accept that the deck at the end is not the deck at the start.', coreCards: ['crinkle/refold-it', 'crinkle/rewrite', 'crinkle/errata', 'crinkle/second-edition', 'crinkle/the-second-draft', 'crinkle/straighten', 'crinkle/bind'] },
    { name: 'Paper Economy', desc: 'Vanish everything. Every Vanish is Paper and Paper is everything. The fastest version of him and the one that runs out of deck first.', coreCards: ['crinkle/pulp', 'crinkle/scrap-paper', 'crinkle/papermaking', 'crinkle/unbound', 'crinkle/paper-trail', 'crinkle/paper-doors', 'crinkle/the-archivists-knife'] },
    { name: 'Fragile Perfection', desc: 'Overfold on purpose, everywhere, and win before the deck is gone. The highest ceiling and the shortest fuse in the roster.', coreCards: ['crinkle/fold-everything', 'crinkle/between-the-lines', 'crinkle/origami-crow', 'crinkle/bookplate', 'crinkle/under-the-blotter', 'crinkle/the-archive', 'crinkle/the-crow-remembers'] },
  ],
};
