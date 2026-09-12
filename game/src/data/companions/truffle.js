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

/**
 * The punch Bristle throws back. The literal lives in the `bristle` status in
 * `keywords.js`, which this file does not own — and Double Barbed, Lend Them
 * the Spiky Side and Shared Pincushion all throw the SAME one, so it is named
 * once here rather than written out three more times.
 */
const BRISTLE_HIT = 7;

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
  // Both of these pay the number PRINTED on the Power that installed them (see
  // `power`), not the 4 and the 1 that used to be written here — which is what
  // made "gain 7 Guard" and "Regrow 2" upgrade into exactly nothing.
  if (s.allSpines > 0 && U.once(c, 'allSpines')) U.guard(c, s.allSpines);
  if (s.shedCycle > 0 && U.once(c, 'shedCycle')) s.regrowNextTurn = (s.regrowNextTurn || 0) + s.shedCycle;
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
  /* Unpleasant Geometry is "the first {n} you Gather EACH TURN", so the budget
     is per turn and not per Gather: `Math.min(3, got)` threw three more for
     every separate Gather in the same turn, and read neither the Power's `n`
     nor its upgraded `d`. */
  if (s.unpleasantGeometry) {
    const g = s.unpleasantGeometry;
    const throws = Math.max(0, Math.min(got, g.n - U.got(c, 'geometry')));
    if (throws > 0) { U.bump(c, 'geometry', throws); for (let i = 0; i < throws; i++) U.hitRandom(c, g.d); }
  }
  if (s.moreWhereThat && got >= s.moreWhereThat.n && U.once(c, 'moreWhere')) bristle(c, s.moreWhereThat.m0);
  floorIsMine(c, s);
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
  // The Carpet Remembers refunds them; they were still SPENT, so The Floor Is
  // Mine still draws. This used to `return` above that line and skip it.
  if (!(s.carpetRemembers && U.once(c, 'carpetRemembers'))) U.addRes(c, LOOSE, -have, 0, 99);
  floorIsMine(c, s);
  return have;
}

/** The Floor Is Mine: the first spend OR Gather each turn draws its printed number. */
function floorIsMine(c, s) {
  if (s.floorIsMine > 0 && U.once(c, 'floorIsMine')) U.draw(c, s.floorIsMine);
}

// ── Bristle ─────────────────────────────────────────────────────────────────
const bristleOn = (c) => U.stacks(c, c.self, BRISTLE);
function bristle(c, n) { if (n > 0) U.applySelf(c, BRISTLE, n); }

function unbristle(c, n) {
  const have = Math.min(n, bristleOn(c));
  if (have > 0) U.unapply(c, c.self, BRISTLE, have);
  return have;
}

// ── Guard ───────────────────────────────────────────────────────────────────
/**
 * Guard from one of Truffle's own Tricks. Every Trick below gains Guard through
 * this and nothing else does, because Comfortable in Pieces is worded about
 * TRICKS: "While Ragged, Guard Tricks give a little less but each also gives
 * {n} Bristle." One `gd` call is one Trick — no Trick he owns gains Guard twice
 * — so the Bristle is per Trick and not per point.
 *
 * "A little less" is unquantified in the chapter and unprinted on the card, so
 * the rate is settled against Slay the Spire, which has exactly one "you gain
 * less Block" effect: Frail, at -25% rounded down (`floor(block * 0.75)`).
 * Same rate here.
 */
function gd(c, n) {
  if (!(n > 0)) return 0;
  const s = U.mm(c);
  if (!(s.comfortablePieces > 0) || !isRagged(c)) { U.guard(c, n); return n; }
  const give = Math.floor(n * 0.75);
  U.guard(c, give);
  bristle(c, s.comfortablePieces);
  return give;
}

/**
 * Apply a Power's own status, then record the numbers its hooks will read.
 *
 * `set` runs for EVERY copy played, `install` only for the first. That split is
 * the whole reason eight of his Powers had dead upgrades: their behaviour fires
 * from a tracker, a keyword hook or one of the Quill helpers, and in every one
 * of those places the ctx carries NO CARD — `N(c)` is `{}` — so each of them had
 * its number written out as a literal. The numbers are stashed here, at the one
 * moment a card really is in play, and a second, upgraded copy raises them.
 */
const power = (c, id, n, set, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (set) set(c, s);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── Truffle's own two defensive statuses ────────────────────────────────────
/**
 * Both of these BORROWED somebody else's status, and neither borrowed one fits:
 *
 *  - Refuse to Stay Down applied Marmalade's `not-dead-yet`, whose `onLethal`
 *    spends 3 Lives. Truffle has no Lives, so `res(c,'lives') < 3` returned on
 *    the hook's first line and the card did nothing whatsoever.
 *  - Play Dead-ish applied Bones' `play-dead`, which HALVES a hit and hands the
 *    defender a Loose Bone. Truffle's card says "capped" and prints a `cap` that
 *    nothing ever read — and its upgrade only moves that cap, so it was dead too.
 *
 * They are declared here rather than in `keywords.js` because they belong to
 * Truffle and to nobody else. `registerStatuses` through `data/statuses.js` is
 * the documented content-agent seam, and the keyword entry beside it is what
 * keeps the chip on his portrait from being an unlabelled square
 * (`tests/teaching`: every status the player can see has a tooltip to hover).
 */
const PLAYING_DEAD = 'truffle/playing-dead';
const REFUSES_TO_STAY_DOWN = 'truffle/refuses-to-stay-down';

const OWN_STATUSES = [
  {
    id: PLAYING_DEAD, name: 'Playing Dead', kind: 'buff', icon: 'play-dead',
    decay: 'turnStart', decayAll: true, stacks: true, companion: SLUG,
    desc: 'The next Attack that would cost more than {n} Courage costs {n} instead.',
    hooks: {
      // EXTRA: onCourageLoss — after Guard, before onLethal, and mutable. A CAP,
      // not Bones' halving: a 40 becomes the printed number and a 6 is left
      // alone, which is also why a small hit must not spend it.
      onCourageLoss: (h) => {
        if (h.kind !== 'attack') return;
        const cap = h.stacks | 0;
        if (cap <= 0 || h.amount <= cap) return;
        h.setAmount(cap);
        h.remove();
      },
    },
  },
  {
    id: REFUSES_TO_STAY_DOWN, name: 'Refuses to Stay Down', kind: 'buff', icon: 'quills',
    decay: 'turnStart', decayAll: true, stacks: true, companion: SLUG,
    desc: 'Lethal damage leaves you at 1 Courage: you lose your Guard, Regrow to full and gain {n} Bristle.',
    hooks: {
      // EXTRA: onLethal — the one place a Companion can refuse to die. `setHp`
      // is the survival control; the chapter's "remove all Guard" is a formality
      // (a hit only reaches Courage once Guard is gone) and is honoured anyway.
      onLethal: (h) => {
        const c = U.trackerCtx(h.e, h.defender);
        if (!c) return false;
        h.setHp(1);
        if (c.self.block > 0) U.stripGuard(c, c.self, c.self.block);
        regrow(c, quillCap(c));
        bristle(c, h.stacks | 0);
        h.remove();
        return true;
      },
    },
  },
];

try {
  const S = await import('../statuses.js');
  S.registerStatuses(OWN_STATUSES);
  const K = await import('../keywords.js');
  K.registerKeywords(OWN_STATUSES.map((s) => ({
    id: s.id, name: s.name, desc: String(s.desc).replace(/\{n\}/g, 'X'),
    category: 'buff', status: true, icon: s.icon, companion: SLUG,
  })));
} catch (_) { /* headless tooling with no combat folder still loads the cards */ }

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
    /* The rest of what the enemy turn accumulated. Every one of these is a
       promise made on the player's turn and kept — or not kept — during the
       enemy turn: an unclaimed rider expires here rather than paying out a
       round late. */
    st.hurtThisEnemyTurn = false;
    st.guardBrokenThisEnemyTurn = false;
    st.pincushionSeen = [];
    st.bendDontBreak = 0;
    st.rollWithIt = 0;
    st.holdStill = 0;
    st.biteBack = null;                       // "until your next turn"
    st.behindTheHedgehog = null;              // ditto
    if (st.lentBristle) {                     // and the Borrowed Bristle goes home
      const mate = (e.players || []).find((p) => p && p.seat === st.lentBristle.seat);
      if (mate) { const n = U.stacks(c, mate, BRISTLE); if (n > 0) U.unapply(c, mate, BRISTLE, Math.min(n, st.lentBristle.left)); }
      st.lentBristle = null;
    }
    // Bristle expires unless Permanent Bad Hair Day says otherwise.
    if (!st.permanentBristle) { const n = bristleOn(c); if (n > 0) unbristle(c, n); }
    if (st.regrowNextTurn) { regrow(c, st.regrowNextTurn); st.regrowNextTurn = 0; }
    /* Guard and Nerve are NOT banked here. `turn:start` is emitted before
       `_openSeatTurn` wipes Guard and before `_dealSeatTurn` SETS Nerve, so
       both were deleted a moment after they were granted — five Truffle cards
       shipped that way and delivered nothing. `U.guardNextTurn` schedules a
       timer that ticks after the wipe; `U.energyNextTurn` rides the refill
       itself. Draw is fine here: the turn-start deal ADDS to the hand. */
    if (st.drawNextTurn) { U.draw(c, st.drawNextTurn); st.drawNextTurn = 0; }
    if (!st.raggedSeen && isRagged(c)) { st.raggedSeen = true; if (st.barelyHolding) U.draw(c, 2); }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    // Printed numbers, from the Power that installed each of these. The 4, the
    // 4, the 1 and the two 1s that were written here read no card at all.
    if (st.quillCarpet && loose(c) >= st.quillCarpet.n) U.hitAll(c, st.quillCarpet.d);
    if (st.wretchedMiracle > 0 && isRagged(c) && c.self.block === 0) bristle(c, st.wretchedMiracle);
    if (st.stillWiggling && isRagged(c) && c.self.block === 0 && bristleOn(c) >= 1) {
      U.energyNextTurn(c, st.stillWiggling.e);
      st.drawNextTurn = (st.drawNextTurn || 0) + st.stillWiggling.c1;
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

  /* ── what the enemy turn actually did to him ─────────────────────────────
     Half of Truffle is worded "when an Attack costs you Courage", and nothing
     in this file was watching for it. `lostCourageThisEnemyTurn` and
     `bristledThisEnemyTurn` were READ by four Tricks and written by nobody, and
     nine more cards parked a number in the scratch that no listener ever spent.
     One `damage` listener answers all of them.

     The payload names its actors `sourceId` / `targetId`; `attacker` /
     `defender` belong to the onCourageLoss / onIncomingHit HOOK payloads and
     reading them here is CONTRACTS trap 26. `hpLoss` is Courage actually
     removed, which is exactly Bristle's own definition of being hurt: a swing
     the Guard ate is not one. */
  const enemyTurn = () => e.phase === 'enemy' || e.phase === 'enemyPhaseEnd';
  const enemyById = (id) => (id ? (e.enemies || []).find((a) => a && a.id === id) || null : null);

  /** Shed one and hit back, exactly as his own Bristle would. */
  function retaliate(c, from) {
    if (!from || !from.alive) return false;
    if (shed(c, 1) <= 0) return false;              // nothing on his back to throw
    U.hitAt(c, from, BRISTLE_HIT);
    U.fire(c, 'bristled', { enemy: from });
    U.mm(c).bristledThisEnemyTurn = true;
    return true;
  }

  /** An Attack has just taken Courage off Truffle. */
  function hurt(c, st, ev) {
    st.lostCourageThisEnemyTurn = true;
    // Hold Still, Almost: "if you lose Courage this enemy turn" — any source.
    // Its Guard goes through `guardNextTurn`, never a turn-start gain (trap 24).
    if (st.holdStill > 0) { U.guardNextTurn(c, st.holdStill); st.holdStill = 0; }
    if (ev.kind !== 'attack') return;
    const from = enemyById(ev.sourceId);
    // Roll With It wants the Attack to have gone THROUGH the Guard, and a
    // multi-hit move can break it on one hit and draw Courage on the next.
    if (ev.blockBefore > 0 && ev.blockAfter === 0) st.guardBrokenThisEnemyTurn = true;
    if (st.bendDontBreak > 0) { bristle(c, st.bendDontBreak); st.bendDontBreak = 0; }
    if (st.rollWithIt > 0 && st.guardBrokenThisEnemyTurn) { bristle(c, st.rollWithIt); st.rollWithIt = 0; }
    // Built Wrong and Dead Hedgehog Theory: "the FIRST Attack each enemy turn".
    if (!st.hurtThisEnemyTurn) {
      st.hurtThisEnemyTurn = true;
      if (st.builtWrong > 0) regrow(c, st.builtWrong);
      const th = st.deadTheory;
      if (th) {
        regrow(c, th.g);
        U.energyNextTurn(c, th.e);              // banked: the refill SETS Nerve
        st.drawNextTurn = (st.drawNextTurn || 0) + th.c1;
      }
    }
    const bb = st.biteBack;
    if (bb && from && from.id === bb.id) { st.biteBack = null; U.hitAt(c, from, bb.d); }
  }

  /** A teammate has just lost Courage. His three party Tricks all live here. */
  function teammateHurt(c, st, ev) {
    if (ev.kind !== 'attack') return;
    const mate = (e.players || []).find((p) => p && p.id === ev.targetId);
    if (!mate || mate === seat || !mate.alive) return;
    const from = enemyById(ev.sourceId);
    if (!from) return;

    // Lend Them the Spiky Side — the first n Attacks that hurt them, then spent.
    const lent = st.lentBristle;
    if (lent && lent.left > 0 && mate.seat === lent.seat) { lent.left--; retaliate(c, from); }

    // Shared Pincushion — once per Kid per enemy turn, and they wake up Guarded.
    const b = st.sharedPincushion || 0;
    if (b > 0) {
      const seen = st.pincushionSeen || (st.pincushionSeen = []);
      if (!seen.includes(mate.id)) {
        seen.push(mate.id);
        if (retaliate(c, from)) {
          c.schedule({ turns: 1, when: 'playerTurnStart', label: 'Shared Pincushion',
            run: () => { try { c.giveBlock(mate, b); } catch (_) { /* they may have fallen */ } } });
        }
      }
    }

    // Everybody Behind the Hedgehog — "the first time each other player would
    // lose Courage, redirect a small portion to Truffle AFTER their Guard
    // resolves". After, so it is taken off the wound rather than intercepted,
    // and it arrives at him as a real Attack from the same enemy — which is the
    // whole point: "that redirected damage can activate Truffle's Bristle".
    const bh = st.behindTheHedgehog;
    if (bh && !bh.used.includes(mate.id)) {
      bh.used.push(mate.id);
      const share = Math.min(bh.share, ev.hpLoss);
      if (share > 0) {
        c.giveHeal(mate, share);
        e.dealDamage({ attacker: from, defender: seat, amount: share, kind: 'attack', cause: 'behind-the-hedgehog' });
      }
    }
  }

  e.on('damage', (ev) => {
    if (!ev || !enemyTurn()) return;
    const c = fake();
    if (!c) return;
    const st = U.mm(c);
    /* His own retaliation going out. "Bristle triggered" means a Quill was
       really thrown, which is the same event Hard to Finish pays out on. */
    if (ev.cause === 'bristle' && ev.sourceId === seat.id) { st.bristledThisEnemyTurn = true; return; }
    if (!(ev.hpLoss > 0)) return;
    if (ev.targetId === seat.id) hurt(c, st, ev);
    else teammateHurt(c, st, ev);
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('shed', 'truffle/shed-cycle', () => {});
U.onHook('gather', 'truffle/more-where-that-came-from', () => {});
U.onHook('bristled', 'truffle/hard-to-finish', (c) => {
  // The printed number, not a 4: the hook runs on a tracker ctx with no card on
  // it, so `N(c)` is empty and the upgrade to 7 could never have been read.
  U.guardNextTurn(c, U.mm(c).hardToFinish || 0);
});
U.onHook('bristled', 'truffle/double-barbed', (c, p) => {
  /* Bristle itself Sheds one Quill and throws it (that pair lives in the
     `bristle` status in `keywords.js`, which this file does not own). Double
     Barbed buys the SECOND and third Quill for the same single stack —
     "Shed up to {n} instead of 1 and retaliate once for each Quill Shed". */
  const extra = (U.mm(c).doubleBarbed || 1) - 1;
  for (let i = 0; i < extra; i++) {
    if (shed(c, 1) <= 0) break;
    U.hitAt(c, p.enemy, BRISTLE_HIT);
  }
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
    nums: { b: 5 }, effect: eff((c) => gd(c, N(c).b)), upgrade: { nums: { b: 8 } },
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
    cost: 2, target: ENEMY, keywords: ['shed', 'loose-quill'],
    text: 'Deal {d} damage and [Shed] {n}.',
    flavor: 'They come out. They have always come out.',
    nums: { d: 11, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); shed(c, N(c).n); }),
    upgrade: { nums: { d: 16, n: 1 } },
  },
  {
    id: 'truffle/found-it', name: 'Found It', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 0, target: SELF, keywords: ['gather', 'loose-quill'],
    text: '[Gather] {n}. If a Quill came back, gain {b} Guard.',
    flavor: 'Under the rug, where he left it.',
    nums: { n: 1, b: 4 },
    effect: eff((c) => { if (gather(c, N(c).n) > 0) gd(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 6 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'truffle/pokey-nibble', name: 'Pokey Nibble', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage, plus {m0} if you have [Shed] this turn.',
    flavor: 'Pokier than it looks.',
    nums: { d: 3, m0: 3 },
    effect: eff((c) => U.hit(c, N(c).d + ((U.mm(c).shedThisTurn || 0) > 0 ? N(c).m0 : 0))),
    upgrade: { nums: { d: 4, m0: 4 } },
  },
  {
    id: 'truffle/back-into-them', name: 'Back Into Them', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} damage. If the target intends to Attack, gain {n} [Bristle].',
    flavor: 'Reverse, at speed, without looking.',
    nums: { d: 12, n: 2 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) bristle(c, N(c).n);
    }),
    upgrade: { nums: { d: 16, n: 3 } },
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
    cost: 2, target: ENEMY, keywords: ['ragged'],
    text: 'Deal {d} damage. While [Ragged], follow with {m0} more.',
    flavor: 'Slowly. Extremely slowly. But through.',
    nums: { d: 12, m0: 8 },
    effect: eff((c) => { U.hit(c, N(c).d); if (isRagged(c)) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 16, m0: 11 } },
  },
  {
    id: 'truffle/hunch-up', name: 'Hunch Up', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 2, target: SELF, keywords: ['ragged'],
    text: 'Gain {b} Guard, or {m0} while [Ragged].',
    flavor: 'The whole animal, folded inwards.',
    nums: { b: 13, m0: 19 },
    effect: eff((c) => gd(c, isRagged(c) ? N(c).m0 : N(c).b)),
    upgrade: { nums: { b: 18, m0: 26 } },
  },
  {
    id: 'truffle/just-enough', name: 'Just Enough', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard. If an Attack would still get through it, gain {n} [Bristle].',
    flavor: 'Just enough, and not one bit more.',
    nums: { b: 5, n: 1 },
    effect: eff((c) => {
      gd(c, N(c).b);
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
    cost: 0, target: SELF, keywords: ['regrow'],
    text: '[Regrow] {g}.',
    flavor: 'At angles. Always at angles.',
    nums: { g: 2 },
    effect: eff((c) => regrow(c, N(c).g)),
    upgrade: { nums: { g: 3 } },
  },
  {
    id: 'truffle/bend-dont-break', name: 'Bend, Don’t Break', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard. If an Attack still costs you Courage this turn, gain {n} [Bristle].',
    flavor: 'He has bent a very long way.',
    nums: { b: 5, n: 1 },
    // The rider is READ now, by the tracker's `damage` listener: an Attack that
    // costs him Courage this enemy turn pays the Bristle out. Two copies stack.
    effect: eff((c) => { gd(c, N(c).b); U.mm(c).bendDontBreak = (U.mm(c).bendDontBreak || 0) + N(c).n; }),
    upgrade: { nums: { b: 8, n: 2 } },
  },
  {
    id: 'truffle/still-good', name: 'Still Good', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF,
    text: 'Gain {b} Guard, or {m0} if you lost Courage during the last enemy turn.',
    flavor: 'Debatable, but he is committed to the position.',
    nums: { b: 6, m0: 10 },
    effect: eff((c) => gd(c, U.mm(c).lostCourageLastEnemyTurn ? N(c).m0 : N(c).b)),
    upgrade: { nums: { b: 9, m0: 14 } },
  },
  {
    id: 'truffle/shake-and-scoot', name: 'Shake and Scoot', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 2, target: SELF, keywords: ['shed'],
    text: 'Gain {b} Guard, [Shed] {n}, then draw {c1}.',
    flavor: 'A shake, then a scoot. In that order.',
    nums: { b: 9, n: 1, c1: 2 },
    effect: eff((c) => { gd(c, N(c).b); shed(c, N(c).n); U.draw(c, N(c).c1); }),
    upgrade: { nums: { b: 12, n: 1, c1: 3 } },
  },
  {
    id: 'truffle/carpet-check', name: 'Carpet Check', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['loose-quill', 'shed'],
    text: 'With {n}+ [Loose Quill]s, draw {c1} and gain {e} Nerve next turn. Otherwise [Shed] 1 and gain {b} Guard.',
    flavor: 'A quick audit of the floor.',
    nums: { n: 3, c1: 1, e: 1, b: 4 },
    effect: eff((c) => {
      if (loose(c) >= N(c).n) { U.draw(c, N(c).c1); U.energyNextTurn(c, N(c).e); }
      else { shed(c, 1); gd(c, N(c).b); }
    }),
    upgrade: { nums: { n: 3, c1: 2, e: 1, b: 7 } },
  },
  {
    id: 'truffle/barely-holding-together', name: 'Barely Holding Together', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['ragged'],
    text: 'The first time you become [Ragged] this combat, draw {c1}. Triggers now if already [Ragged].',
    flavor: 'He is. He genuinely is.',
    nums: { c1: 2 },
    effect: eff((c) => power(c, 'truffle/barely-holding-together', 1, null, (x) => {
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
    effect: eff((c) => power(c, 'truffle/all-spines-no-plan', N(c).b, (x, st) => { st.allSpines = N(x).b; })),
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
    cost: -1, target: ALL_ENEMIES, keywords: ['shed'],
    text: 'Spend all your Nerve. [Shed] {n} for each Nerve spent. Each one throws {d} at a random enemy.',
    flavor: 'Briefly, the air is entirely quills.',
    /* His X Trick. One Shed of n per Nerve spent (`c.x`), priced near his
       1-Nerve Attacks: two throws and two Loose Quills a Nerve. It can only
       throw what is on his back, so a Bare Truffle pours Nerve into nothing --
       Regrow first, and banked Nerve (Loose Change, Carpet Check) makes it big. */
    nums: { d: 4, n: 2 },
    balance: { scalesWith: 'the Nerve poured in, and the Quills on his back to throw' },
    effect: eff((c) => { const n = shed(c, N(c).n * (c.x || 0)); for (let i = 0; i < n; i++) U.hitRandom(c, N(c).d); }),
    upgrade: { nums: { d: 6, n: 2 } },
  },
  {
    id: 'truffle/sweep-the-floor', name: 'Sweep the Floor', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['gather'],
    text: '[Gather] up to {n}, then deal {d} plus {m0} for each one recovered.',
    flavor: 'Tidying, weaponised.',
    nums: { d: 12, m0: 5, n: 3 },
    balance: { scalesWith: 'how many Loose Quills you manage to pick up first' },
    effect: eff((c) => { const got = gather(c, N(c).n); U.hit(c, N(c).d + got * N(c).m0); }),
    upgrade: { nums: { d: 16, m0: 7, n: 3 } },
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
    cost: 2, target: ENEMY, keywords: ['ragged'],
    text: 'Deal {d} damage twice, or three times while [Ragged].',
    flavor: 'Very close to the floor and extremely unpleasant.',
    nums: { d: 8, hits: 2 },
    effect: eff((c) => { U.hitN(c, N(c).d, isRagged(c) ? 3 : 2); }),
    upgrade: { nums: { d: 11, hits: 2 } },
  },
  {
    id: 'truffle/rotten-little-cannonball', name: 'Rotten Little Cannonball', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 4, target: ALL_ENEMIES, keywords: ['ragged'],
    text: 'Deal {d} to all enemies. Costs 2 while [Ragged].',
    flavor: 'Fired from nowhere, by nobody, at everybody.',
    /* His 4-Nerve Trick, and Ragged is the way in: at half Courage (three
       quarters under Close Enough to Dead) it costs 2, the same rate per Nerve
       it always had while Ragged. A healthy Truffle pays the full 4 out of
       banked Nerve -- Carpet Check, Loose Change, Still Wiggling. */
    nums: { d: 24 },
    balance: { scalesWith: 'the whole room, and it costs 2 while Ragged' },
    effect: eff((c) => U.hitAll(c, N(c).d)),
    // The 4 and the 2 here ARE the printed cost and the text: re-cost one, re-cost both.
    dynamicCost: (c) => (isRagged(c) ? 2 : 4),
    upgrade: { nums: { d: 32 } },
  },
  {
    id: 'truffle/crossfire', name: 'Crossfire', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['bristle'],
    text: 'Deal {d} to one enemy and {m0} to another. {n} [Bristle] per Attacker struck, up to 2.',
    flavor: 'Both of them, and neither of them meant it.',
    nums: { d: 12, m0: 8, n: 1 },
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
    upgrade: { nums: { d: 17, m0: 11, n: 1 } },
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
    cost: 2, target: ENEMY, keywords: ['gather'],
    text: 'Deal {d} damage, [Gather] {n}, and gain {b} Guard.',
    flavor: 'Leaves a mark on the wallpaper and a trail of quills.',
    nums: { d: 12, n: 1, b: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); gather(c, N(c).n); gd(c, N(c).b); }),
    upgrade: { nums: { d: 16, n: 2, b: 10 } },
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
    cost: 2, target: ENEMY, keywords: ['shed'],
    text: 'Deal {d} damage. If the target intends to Attack, apply {n} [Weak] and [Shed] {g}.',
    flavor: 'Everyone pays. Nobody agreed to this.',
    /* The count is PRINTED. "Weaken it" hid a number the card really applies,
       and hid the upgrade with it — n goes 1 -> 2 and nothing on the face moved.
       Tactical clarity: the player can see exactly what will happen. */
    nums: { d: 13, n: 1, g: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) { U.apply(c, t, 'weak', N(c).n); shed(c, N(c).g); }
    }),
    upgrade: { nums: { d: 18, n: 2, g: 1 } },
  },
  {
    id: 'truffle/carpet-skewer', name: 'Carpet Skewer', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 3, target: ENEMY, keywords: ['loose-quill'],
    text: 'Spend up to {n} [Loose Quill]s. Deal {d} plus {m0} for each.',
    flavor: 'Straight up through the pile of the rug.',
    nums: { d: 18, m0: 5, n: 4 },
    balance: { scalesWith: 'the Loose Quills on the floor, up to four of them' },
    effect: eff((c) => { const spent = spendLoose(c, N(c).n); U.hit(c, N(c).d + spent * N(c).m0); }),
    upgrade: { nums: { d: 25, m0: 7, n: 4 } },
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
    // Its own key, not Bend, Don't Break's: the chapter is explicit that this one
    // needs the Attack to have REMOVED the Guard first ("if an enemy Attack
    // removes all of that Guard and then damages your Courage").
    effect: eff((c) => { gd(c, N(c).b); U.mm(c).rollWithIt = (U.mm(c).rollWithIt || 0) + N(c).n; }),
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
      if (got) U.energyNextTurn(c, got);
    }),
    upgrade: { nums: { n: 2, e: 2 } },
  },
  {
    id: 'truffle/pick-yourself-up', name: 'Pick Yourself Up', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['gather', 'ragged'],
    text: '[Gather] up to {n}. While [Ragged], also gain {b} Guard.',
    flavor: 'Nobody else is going to.',
    nums: { n: 3, b: 6 },
    effect: eff((c) => { gather(c, N(c).n); if (isRagged(c)) gd(c, N(c).b); }),
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
      else { U.draw(c, 1); gd(c, N(c).b); }
    }),
    upgrade: { nums: { c1: 3, b: 7 } },
  },
  {
    id: 'truffle/down-in-front', name: 'Down in Front', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['bristle'],
    text: 'Gain {b} Guard, then lose {n} [Bristle]. With none to lose, gain only {m0}.',
    flavor: 'Everybody down.',
    nums: { b: 20, m0: 11, n: 1 },
    effect: eff((c) => { if (unbristle(c, N(c).n) > 0) gd(c, N(c).b); else gd(c, N(c).m0); }),
    upgrade: { nums: { b: 27, m0: 15, n: 1 } },
  },
  {
    id: 'truffle/quill-reserve', name: 'Quill Reserve', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['shed'],
    text: '[Shed] {n} to gain {b} Guard.',
    flavor: 'Kept back for exactly this.',
    nums: { n: 2, b: 22 },
    effect: eff((c) => { if (shed(c, N(c).n) >= N(c).n) gd(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 30 } },
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
    cost: 0, target: SELF, keywords: ['shed', 'regrow'],
    text: 'Remove a debuff and [Shed] {n}. If one went, [Regrow] {g}.',
    flavor: 'Most of it comes off.',
    nums: { n: 1, g: 1 },
    effect: eff((c) => { const removed = U.removeOneDebuff(c, c.self); shed(c, N(c).n); if (removed) regrow(c, N(c).g); }),
    upgrade: { nums: { n: 1, g: 2 } },
  },
  {
    id: 'truffle/hold-still-almost', name: 'Hold Still, Almost', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF,
    text: 'Gain {b} Guard. If you lose Courage this enemy turn, gain {m0} Guard next turn.',
    flavor: 'Almost. Nearly. Not quite.',
    nums: { b: 4, m0: 12 },
    effect: eff((c) => { gd(c, N(c).b); U.mm(c).holdStill = (U.mm(c).holdStill || 0) + N(c).m0; }),
    upgrade: { nums: { b: 7, m0: 16 } },
  },

  // ── Powers (8) ──
  {
    id: 'truffle/shed-cycle', name: 'Shed Cycle', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shed', 'regrow'],
    text: 'The first time you [Shed] each turn, [Regrow] {g} at the start of your next.',
    flavor: 'Off, then on, then off again.',
    nums: { g: 1 },
    effect: eff((c) => power(c, 'truffle/shed-cycle', N(c).g, (x, st) => { st.shedCycle = N(x).g; })),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'truffle/quill-carpet', name: 'Quill Carpet', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['loose-quill'],
    text: 'At end of turn, with {n}+ [Loose Quill]s down, deal {d} to all enemies. They are not consumed.',
    flavor: 'The floor itself is now a hazard.',
    nums: { n: 4, d: 4 },
    effect: eff((c) => power(c, 'truffle/quill-carpet', 1, (x, st) => { st.quillCarpet = { n: N(x).n, d: N(x).d }; })),
    upgrade: { nums: { n: 4, d: 7 } },
  },
  {
    id: 'truffle/wretched-little-miracle', name: 'Wretched Little Miracle', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['ragged', 'bristle'],
    text: 'Whenever you end a turn [Ragged] with 0 Guard, gain {n} [Bristle].',
    flavor: 'By every reasonable measure he should not be here.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'truffle/wretched-little-miracle', N(c).n, (x, st) => { st.wretchedMiracle = N(x).n; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'truffle/built-wrong', name: 'Built Wrong', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['regrow'],
    text: 'The first Attack each enemy turn that costs you Courage makes you [Regrow] {g} after.',
    flavor: 'Structurally. Comprehensively.',
    nums: { g: 2 },
    effect: eff((c) => power(c, 'truffle/built-wrong', N(c).g, (x, st) => { st.builtWrong = N(x).g; })),
    upgrade: { nums: { g: 3 } },
  },
  {
    id: 'truffle/hard-to-finish', name: 'Hard to Finish', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['bristle'],
    text: 'Whenever [Bristle] triggers, gain {b} Guard at the start of your next turn.',
    flavor: 'People have tried.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'truffle/hard-to-finish', N(c).b, (x, st) => { st.hardToFinish = N(x).b; })),
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'truffle/more-where-that-came-from', name: 'More Where That Came From', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['gather', 'bristle'],
    text: 'The first time each turn you [Gather] {n}+ at once, gain {m0} [Bristle].',
    flavor: 'There is. There is a great deal more.',
    nums: { n: 2, m0: 2 },
    effect: eff((c) => power(c, 'truffle/more-where-that-came-from', 1, (x, st) => { st.moreWhereThat = { n: N(x).n, m0: N(x).m0 }; })),
    upgrade: { nums: { n: 2, m0: 3 } },
  },
  {
    id: 'truffle/comfortable-in-pieces', name: 'Comfortable in Pieces', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['ragged', 'bristle'],
    text: 'While [Ragged], Guard Tricks give a little less but each also gives {n} [Bristle].',
    flavor: 'He has been in pieces before. It is fine.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'truffle/comfortable-in-pieces', N(c).n, (x, st) => { st.comfortablePieces = N(x).n; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'truffle/the-floor-is-mine', name: 'The Floor Is Mine', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['loose-quill', 'gather'],
    text: 'The first time each turn you spend or [Gather] [Loose Quill]s, draw {c1}.',
    flavor: 'He has claimed it. Nobody contested it.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'truffle/the-floor-is-mine', N(c).c1, (x, st) => { st.floorIsMine = N(x).c1; })),
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
      /* His own status. Bones' `play-dead` HALVES the hit and hands the
         defender a Loose Bone, so `cap` was never read and the upgrade — which
         does nothing but lower the cap — was dead. A second copy REPLACES
         rather than stacks, because the stack count is the cap itself. */
      if (U.stacks(c, c.self, PLAYING_DEAD) > 0) c.removeStatus(c.self, PLAYING_DEAD);
      U.applySelf(c, PLAYING_DEAD, N(c).cap);
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
    /* `not-dead-yet` is Marmalade's and spends 3 Lives; Truffle has none, so it
       returned on its first line every time and this Rare did nothing at all.
       His own status carries the Bristle as its stack count. */
    effect: eff((c) => {
      if (U.stacks(c, c.self, REFUSES_TO_STAY_DOWN) > 0) c.removeStatus(c.self, REFUSES_TO_STAY_DOWN);
      U.applySelf(c, REFUSES_TO_STAY_DOWN, N(c).n);
    }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'truffle/exact-amount-of-terrible', name: 'Exact Amount of Terrible', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['bristle'],
    text: 'Gain Guard so that almost exactly {n} of the target’s Attack gets through, up to {b}.',
    flavor: 'Measured. Deliberate. Horrible.',
    nums: { n: 2, b: 24 },
    balance: { scalesWith: 'whatever the enemy is actually about to swing — it engineers the Bristle turn' },
    /* This goes through `gd` like every other Guard Trick, so Comfortable in
       Pieces taxes it too and a little more than {n} gets through. Deliberate:
       that Power's rule is blanket and prints no exception list, and this card
       already says "almost exactly". */
    effect: eff((c) => {
      const t = c.target;
      const dmg = (t && t.pendingMove && t.pendingMove.damage) || 0;
      const want = Math.max(0, Math.min(N(c).b, dmg - N(c).n - c.self.block));
      gd(c, want);
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
    effect: eff((c) => power(c, 'truffle/unpleasant-geometry', 1, (x, st) => { st.unpleasantGeometry = { n: N(x).n, d: N(x).d }; })),
    upgrade: { nums: { n: 3, d: 7 } },
  },
  {
    id: 'truffle/the-carpet-remembers', name: 'The Carpet Remembers', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['loose-quill'],
    text: 'The first effect each turn that spends [Loose Quill]s gets the full benefit without spending them.',
    flavor: 'It has been collecting for years.',
    nums: {},
    effect: eff((c) => power(c, 'truffle/the-carpet-remembers', 1, (x, st) => { st.carpetRemembers = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/double-barbed', name: 'Double Barbed', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bristle', 'shed'],
    text: '[Bristle] may [Shed] {n} instead of 1 and retaliate once per Quill, still consuming only 1 [Bristle].',
    flavor: 'Twice the spines, same amount of spite.',
    nums: { n: 2 },
    effect: eff((c) => power(c, 'truffle/double-barbed', N(c).n, (x, st) => { st.doubleBarbed = N(x).n; })),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'truffle/close-enough-to-dead', name: 'Close Enough to Dead', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['ragged'],
    text: 'You count as [Ragged] at 75% Courage or below instead of 50%.',
    flavor: 'The distinction was always academic.',
    nums: {},
    effect: eff((c) => power(c, 'truffle/close-enough-to-dead', 1, (x, st) => { st.closeEnough = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/dead-hedgehog-theory', name: 'Dead Hedgehog Theory', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['regrow'],
    text: 'The first Attack each enemy turn that costs you Courage: [Regrow] {g}, and next turn {e} Nerve and {c1} card.',
    flavor: 'A theory he is testing personally.',
    nums: { g: 1, e: 1, c1: 1 },
    effect: eff((c) => power(c, 'truffle/dead-hedgehog-theory', 1, (x, st) => { st.deadTheory = { g: N(x).g, e: N(x).e, c1: N(x).c1 }; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'truffle/grows-back-wrong', name: 'Grows Back Wrong', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['regrow', 'loose-quill'],
    text: '[Regrow] may take you {n} above maximum. At end of turn the excess falls off as [Loose Quill]s.',
    flavor: 'Wrong, but more.',
    nums: { n: 6 },
    effect: eff((c) => power(c, 'truffle/grows-back-wrong', 1, (x, st) => { st.growsWrong = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/permanent-bad-hair-day', name: 'Permanent Bad Hair Day', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['bristle'],
    text: '[Bristle] no longer expires. It stays until something consumes it.',
    flavor: 'Every day, in perpetuity.',
    nums: {},
    effect: eff((c) => power(c, 'truffle/permanent-bad-hair-day', 1, (x, st) => { st.permanentBristle = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'truffle/still-wiggling', name: 'Still Wiggling', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['ragged', 'bristle'],
    text: 'End a turn [Ragged], with 0 Guard and [Bristle] left: gain {e} Nerve and {c1} card next turn.',
    flavor: 'Against all advice, and all evidence.',
    nums: { e: 1, c1: 1 },
    effect: eff((c) => power(c, 'truffle/still-wiggling', 1, (x, st) => { st.stillWiggling = { e: N(x).e, c1: N(x).c1 }; })),
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
      gd(c, N(c).b);
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
    effect: eff((c) => power(c, 'truffle/shared-pincushion', N(c).b, (x, st) => { st.sharedPincushion = N(x).b; })),
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
