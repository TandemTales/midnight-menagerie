/**
 * Hush, the Shadow Ferret.  OWNER: companion-cards.
 * Spec: docs/design/companions/08-hush.md
 *
 * Shadow Pocket · Stash · Scurry · Unseen / Seen · Ambush · Pilfer / Contraband
 *
 * Hush keeps a second, tiny hand. The Shadow Pocket holds three Tricks, they
 * survive the end of turn, and he can play them straight out of it. Hiding is
 * not a way to dodge — it is how he sets up an Attack, because an Attack played
 * from the Pocket while Unseen gets its Ambush clause first and only reveals him
 * afterwards.
 *
 * ── The four rules that are easy to get wrong ───────────────────────────────
 *
 * 1. THE POCKET IS THE ENGINE'S `stash`. The engine already permits playing out
 *    of `Pile.STASH` — that is what the zone was built for. Mopsy's Torn pile
 *    reuses the same pile for the OPPOSITE purpose, which is why her Tricks are
 *    flagged unplayable and his are not, and why `scenes/combat.js` names the
 *    pile after whoever is holding it.
 *
 * 2. UNSEEN IS NOT ARMOUR. It breaks on Courage actually lost to an enemy
 *    Attack — Guard absorbing the whole hit leaves him Unseen — and on playing
 *    an Attack. From the hand he is Seen BEFORE it resolves; from the Pocket the
 *    Attack resolves FIRST, Ambush and all, and he is Seen afterwards. That
 *    ordering is the whole Companion.
 *
 * 3. A SCURRY IS A DELIBERATE MOVE, not a draw. Drawing is not a Scurry,
 *    end-of-turn discarding is not a Scurry, a played Trick reaching the discard
 *    pile is not a Scurry, and Contraband never Scurries at all. One effect
 *    moving three Tricks is three Scurries.
 *
 * 4. CONTRABAND IS TEMPORARY and is generated from what the enemy is ACTUALLY
 *    about to do, so Pilfer reads the live intent rather than rolling.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE, SPECIAL } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'hush';
const N = U.N;

const POCKET = 'stash';
const UNSEEN = 'unseen';
const BASE_POCKET = 3;

const ATTACK_INTENTS = new Set(['attack', 'attackBig', 'attackDefend', 'attackBuff', 'attackDebuff']);
const DEFEND_INTENTS = new Set(['defend', 'defendBuff', 'defendDebuff']);
const BUFF_INTENTS = new Set(['buff']);

const eff = (fn) => (c) => {
  U.ensure(c, SLUG);
  /* An Attack played from the HAND reveals him BEFORE it resolves; one played
     from the Pocket resolves first and reveals him after. Both halves live here
     so no individual card can forget one of them. */
  const fromPocket = c.playedFrom === POCKET;
  const isAttack = String((c.card && (c.card.type || (c.card.def && c.card.def.type))) || '').toLowerCase() === 'attack';
  if (isAttack && !fromPocket) reveal(c);
  const r = fn(c);
  const after = () => { if (isAttack && fromPocket && !U.mm(c).stayHidden) reveal(c); };
  if (r && typeof r.then === 'function') return r.then((v) => { after(); return v; });
  after();
  return r;
};

// ── Unseen ──────────────────────────────────────────────────────────────────
const isUnseen = (c) => U.stacks(c, c.self, UNSEEN) > 0;

function hide(c) {
  if (U.mm(c).cannotHide) return false;
  if (isUnseen(c)) return false;
  U.applySelf(c, UNSEEN, 1);
  U.fire(c, 'unseen', {});
  return true;
}

function reveal(c) {
  if (!isUnseen(c)) return false;
  U.unapply(c, c.self, UNSEEN, U.stacks(c, c.self, UNSEEN));
  const s = U.mm(c);
  if (s.professionalNuisance && U.once(c, 'profNuisance') && pocketRoom(c)) {
    const top = U.cardsIn(c, 'draw')[0];
    if (top) scurry(c, top, POCKET);
  }
  U.fire(c, 'seen', {});
  return true;
}

/** Ambush: played out of the Pocket while still Unseen. */
const ambush = (c) => c.playedFrom === POCKET && isUnseen(c);

// ── the Shadow Pocket ───────────────────────────────────────────────────────
const pocket = (c) => U.cardsIn(c, POCKET);
const pocketCap = (c) => BASE_POCKET + (U.mm(c).pocketBonus || 0);
const pocketRoom = (c) => pocket(c).length < pocketCap(c);

/**
 * Move a Trick between zones deliberately. This is the ONLY way Hush's cards
 * move things, because a Scurry is defined as exactly this and counting it
 * anywhere else would make drawing a Scurry.
 */
function scurry(c, card, to, opts = {}) {
  if (!card) return false;
  if (to === POCKET && !pocketRoom(c) && !opts.overflow) return false;
  U.moveCard(c, card, to, opts.moveOpts || {});
  if (card.meta && card.meta.contraband) return true;   // Contraband never Scurries
  const s = U.mm(c);
  s.scurriesThisTurn = (s.scurriesThisTurn || 0) + 1;
  s.pocketTouched = true;
  if (s.hallwayPhantom && U.once(c, 'hallwayPhantom')) U.guard(c, 6);
  if (to === POCKET && s.hideyHole && U.once(c, 'hideyHole')) U.draw(c, 1);
  if (to !== POCKET && s.nowYouDont && pocket(c).length === 0 && U.once(c, 'nowYouDont')) {
    hide(c); U.draw(c, 2); U.energy(c, 1);
  }
  U.fire(c, 'scurry', { card, to });
  return true;
}

/** Stash: hand -> Shadow Pocket. */
function stash(c, card) {
  if (!card || card === c.card) return false;
  if (!pocketRoom(c)) return false;
  return scurry(c, card, POCKET);
}

async function stashSome(c, n) {
  if (n <= 0 || !pocketRoom(c)) return 0;
  const picks = await U.pickCards(c, { pile: 'hand', count: n, optional: true, prompt: 'Stash which Tricks?' });
  let got = 0;
  for (const k of picks) { if (stash(c, k)) got++; }
  return got;
}

// ── Pilfer and Contraband ───────────────────────────────────────────────────
const CONTRA = {
  swipe: {
    id: 'hush/snatched-swipe', name: 'Snatched Swipe', companion: SLUG, type: ATTACK, rarity: SPECIAL,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['contraband', 'vanish'],
    text: 'Deal {d} damage. [Contraband], so it [Vanish]es after use.', flavor: 'Not his. Definitely not his.',
    nums: { d: 5 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 8 } },
  },
  cover: {
    id: 'hush/borrowed-cover', name: 'Borrowed Cover', companion: SLUG, type: SKILL, rarity: SPECIAL,
    cost: 0, target: SELF, exhaust: true, keywords: ['contraband', 'vanish'],
    text: 'Gain {b} Guard. [Contraband], so it [Vanish]es after use.', flavor: 'Whoever was using it is not now.',
    nums: { b: 6 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 9 } },
  },
  swagger: {
    id: 'hush/stolen-swagger', name: 'Stolen Swagger', companion: SLUG, type: SKILL, rarity: SPECIAL,
    cost: 0, target: SELF, exhaust: true, keywords: ['contraband', 'vanish'],
    text: 'Your next Attack this turn deals {m0} more. [Contraband], so it [Vanish]es.',
    flavor: 'He is wearing it better.',
    nums: { m0: 7 }, effect: eff((c) => U.applySelf(c, 'empowered', N(c).m0)), upgrade: { nums: { m0: 10 } },
  },
  secret: {
    id: 'hush/dirty-secret', name: 'Dirty Secret', companion: SLUG, type: SKILL, rarity: SPECIAL,
    cost: 0, target: NONE, exhaust: true, keywords: ['contraband', 'scurry', 'vanish'],
    text: 'Draw {c1}, then put a Trick on top of your draw pile. [Contraband], so it [Vanish]es.',
    flavor: 'He will not say where he got it.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      U.draw(c, N(c).c1);
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Put which Trick back on top?' });
      if (k) scurry(c, k, 'draw', { moveOpts: { top: true } });
    }),
    upgrade: { nums: { c1: 2 } },
  },
};
const CONTRA_LIST = [CONTRA.swipe, CONTRA.cover, CONTRA.swagger, CONTRA.secret];

const DUST_BUNNY = {
  id: 'hush/dust-bunny', name: 'Dust Bunny', companion: SLUG, type: SKILL, rarity: SPECIAL,
  cost: 0, target: SELF, exhaust: true, keywords: ['scurry', 'vanish'],
  text: 'Gain {b} Guard, discard a Trick, then draw {c1}. [Vanish].',
  flavor: 'An accomplice of convenience.',
  nums: { b: 6, c1: 1 },
  effect: eff(async (c) => {
    U.guard(c, N(c).b);
    const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Discard which Trick?' });
    if (k) scurry(c, k, 'discard');
    U.draw(c, N(c).c1);
  }),
  upgrade: { nums: { b: 9, c1: 2 } },
};

/** Which Contraband an enemy's live intent is worth. */
function contrabandFor(c, e) {
  const m = e && e.pendingMove;
  const kind = m && m.intent;
  if (ATTACK_INTENTS.has(kind)) return CONTRA.swipe;
  if (DEFEND_INTENTS.has(kind)) return CONTRA.cover;
  if (BUFF_INTENTS.has(kind)) return CONTRA.swagger;
  return CONTRA.secret;
}

/** Pilfer: read the intent, put the matching Contraband in the Pocket. */
function pilfer(c, e, opts = {}) {
  if (!e) return null;
  if (!pocketRoom(c) && !opts.overflow) return null;
  const def = contrabandFor(c, e);
  U.spawn(c, def, POCKET, { temporary: true, contraband: true });
  const made = pocket(c)[pocket(c).length - 1];
  if (made && made.meta) made.meta.contraband = true;
  const s = U.mm(c);
  s.pilferedThisTurn = (s.pilferedThisTurn || []).concat([(e.id ?? e.uid)]);
  if (s.kleptomaniac && U.once(c, 'kleptomaniac') && pocketRoom(c)) U.spawn(c, def, POCKET, { temporary: true, contraband: true });
  U.fire(c, 'pilfer', { enemy: e, def });
  return def;
}

const power = (c, id, n, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  const fake = () => U.trackerCtx(e, seat);

  /* Unseen breaks on COURAGE actually lost to an enemy Attack. Guard absorbing
     the whole hit leaves him hidden, which is why this listens to the damage
     event's hpLoss rather than to being attacked. */
  e.on('damage', (ev) => {
    if (!ev || ev.kind !== 'attack') return;
    const c = fake();
    if (!c || !c.self || ev.targetId !== c.self.id) return;
    if ((ev.hpLoss || 0) <= 0) return;
    reveal(c);
  });

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.scurriesThisTurn = 0;
    st.pocketTouched = false;
    st.pilferedThisTurn = [];
    st.cannotHide = false;
    st.stayHidden = false;
    st.attacksFromHand = 0;
    st.pocketFullAtStart = pocket(c).length >= pocketCap(c);
    if (st.lightSleeper && isUnseen(c)) U.energy(c, 1);
    if (st.houseHasCorners && !isUnseen(c) && pocket(c).length >= 2) hide(c);
    if (st.nextTurnNerve) { U.energy(c, st.nextTurnNerve); st.nextTurnNerve = 0; }
    // Contraband and other temporaries do not survive into a new turn.
    for (const k of pocket(c).slice()) {
      if (k.meta && k.meta.expireAtTurnEnd) U.moveCard(c, k, 'exhaust', {});
    }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    if (st.noFixedAddress && pocket(c).length >= pocketCap(c)) hide(c);
    if (st.hideAtEnd) { hide(c); st.hideAtEnd = false; }
  }, seat);

  /* Count Attacks played from the hand, for One Two Gone. */
  e.on('card:play', (ev) => {
    if (seat && ev.actorId && ev.actorId !== seat.id) return;
    const c = fake();
    const card = e.card(ev.cardUid);
    if (!card) return;
    const isAttack = String((card.type || (card.def && card.def.type)) || '').toLowerCase() === 'attack';
    if (isAttack && card._playedFrom !== POCKET) U.mm(c).attacksFromHand = (U.mm(c).attacksFromHand || 0) + 1;
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('scurry', 'hush/hallway-phantom', () => {});
U.onHook('pilfer', 'hush/kleptomaniac', () => {});
U.onHook('unseen', 'hush/light-sleeper', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'hush/quick-nip', name: 'Quick Nip', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'Gone before the ankle registers it.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'hush/cushion-dive', name: 'Cushion Dive', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Straight down the back of the sofa.',
    nums: { b: 5 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'hush/pocket-this', name: 'Pocket This', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: NONE, keywords: ['stash', 'shadow-pocket', 'scurry'],
    text: '[Stash] {n} Trick, then draw {c1}.',
    flavor: 'It is his now. It was always going to be his.',
    nums: { n: 1, c1: 1 },
    effect: eff(async (c) => { await stashSome(c, N(c).n); U.draw(c, N(c).c1); }),
    upgrade: { nums: { n: 1, c1: 2 } },
  },
  {
    id: 'hush/lights-out', name: 'Lights Out', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['unseen'],
    text: 'Become [Unseen] and gain {b} Guard.',
    flavor: 'Click.',
    nums: { b: 4 },
    effect: eff((c) => { hide(c); U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'hush/from-under-the-sofa', name: 'From Under the Sofa', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: deal {m0} more.',
    flavor: 'There was never anything under the sofa. Obviously.',
    nums: { d: 6, m0: 4 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d + (a ? N(c).m0 : 0)); }),
    upgrade: { nums: { d: 9, m0: 6 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'hush/curtain-claw', name: 'Curtain Claw', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['shadow-pocket'],
    text: 'Deal {d} damage, plus {m0} if anything entered or left your [Shadow Pocket] this turn.',
    flavor: 'The curtain moves. Nothing else does.',
    nums: { d: 5, m0: 3 },
    effect: eff((c) => U.hit(c, N(c).d + (U.mm(c).pocketTouched ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 4 } },
  },
  {
    id: 'hush/ankle-collector', name: 'Ankle Collector', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['scurry'],
    text: 'Deal {d} damage. If you have [Scurry]ed this turn, deal it again.',
    flavor: 'He has a collection. It is not a metaphor.',
    nums: { d: 5 },
    effect: eff((c) => { U.hit(c, N(c).d); if ((U.mm(c).scurriesThisTurn || 0) > 0) U.hitAt(c, c.target, N(c).d); }),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'hush/from-nowhere', name: 'From Nowhere', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: regain {e} Nerve afterwards.',
    flavor: 'Nowhere is a place he keeps going back to.',
    nums: { d: 7, e: 1 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d); if (a) U.energy(c, N(c).e); }),
    upgrade: { nums: { d: 10, e: 1 } },
  },
  {
    id: 'hush/sock-thief', name: 'Sock Thief', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['scurry'],
    text: 'Deal {d} damage, then move the top of your discard pile onto your draw pile.',
    flavor: 'One of every pair, in a place nobody has found.',
    nums: { d: 5 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const pile = U.cardsIn(c, 'discard');
      const top = pile[pile.length - 1];
      if (top) scurry(c, top, 'draw', { moveOpts: { top: true } });
    }),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'hush/tail-around-the-corner', name: 'Tail Around the Corner', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['ambush'],
    text: 'Deal {d} to all enemies. [Ambush]: deal {m0} more to one of them.',
    flavor: 'A tail, going round a corner, some distance ahead of the ferret.',
    nums: { d: 4, m0: 5 },
    effect: eff((c) => { const a = ambush(c); U.hitAll(c, N(c).d); if (a) U.hitRandom(c, N(c).m0); }),
    upgrade: { nums: { d: 6, m0: 7 } },
  },
  {
    id: 'hush/furniture-gap-lunge', name: 'Furniture Gap Lunge', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['shadow-pocket'],
    text: 'Deal {d} damage. Costs 1 less while your [Shadow Pocket] is full.',
    flavor: 'The gap is four centimetres. He is fine.',
    nums: { d: 14 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (pocket(c).length >= pocketCap(c) ? 1 : 2),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'hush/squeak-then-strike', name: 'Squeak Then Strike', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['unseen'],
    text: 'Deal {d} damage. Played from your hand, you cannot become [Unseen] again this turn.',
    flavor: 'The squeak is the mistake. He knows.',
    nums: { d: 5 },
    effect: eff((c) => { U.hit(c, N(c).d); if (c.playedFrom !== POCKET) U.mm(c).cannotHide = true; }),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'hush/underfoot', name: 'Underfoot', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['stash'],
    text: 'Deal {d} damage. If the target does not intend to Attack, [Stash] {n} Trick.',
    flavor: 'Exactly where the foot is going.',
    nums: { d: 5, n: 1 },
    effect: eff(async (c) => {
      const t = c.target;
      const attacking = t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent);
      U.hit(c, N(c).d);
      if (!attacking) await stashSome(c, N(c).n);
    }),
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'hush/pillowcase-pounce', name: 'Pillowcase Pounce', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: also gain {b} Guard.',
    flavor: 'From inside the pillowcase, which he was not in a moment ago.',
    nums: { d: 14, b: 6 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d); if (a) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 19, b: 9 } },
  },
  {
    id: 'hush/pocket-this-too', name: 'Pocket This Too', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['stash', 'scurry'],
    text: '[Stash] up to {n} Tricks, then draw {c1}.',
    flavor: 'And that. And that as well.',
    nums: { n: 2, c1: 1 },
    effect: eff(async (c) => { await stashSome(c, N(c).n); U.draw(c, N(c).c1); }),
    upgrade: { nums: { n: 2, c1: 2 } },
  },
  {
    id: 'hush/behind-the-curtain', name: 'Behind the Curtain', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['unseen', 'shadow-pocket'],
    text: 'Gain {b} Guard. If your [Shadow Pocket] holds anything, become [Unseen].',
    flavor: 'Two small feet, visible below the hem.',
    nums: { b: 6 },
    effect: eff((c) => { U.guard(c, N(c).b); if (pocket(c).length > 0) hide(c); }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'hush/make-room', name: 'Make Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['scurry', 'shadow-pocket', 'stash'],
    text: 'Swap {n} Trick in your hand for one in your [Shadow Pocket]. Both are [Scurry]s.',
    flavor: 'Something has to come out first.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const held = pocket(c).filter((k) => !(k.meta && k.meta.contraband));
      if (!held.length) return;
      const outs = await U.pickCards(c, { pile: POCKET, count: N(c).n, prompt: 'Take which Tricks out?' });
      for (const k of outs) scurry(c, k, 'hand');
      const ins = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Put which Tricks in?' });
      for (const k of ins) scurry(c, k, POCKET);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'hush/quiet-paws', name: 'Quiet Paws', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['unseen'],
    text: 'Gain {b} Guard, or {m0} while [Unseen].',
    flavor: 'Four of them, and not one makes a sound.',
    nums: { b: 5, m0: 10 },
    effect: eff((c) => U.guard(c, isUnseen(c) ? N(c).m0 : N(c).b)),
    upgrade: { nums: { b: 8, m0: 14 } },
  },
  {
    id: 'hush/laundry-chute', name: 'Laundry Chute', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['scurry', 'shadow-pocket'],
    text: 'Look at the top {n} of your draw pile. Put one in the [Shadow Pocket] and one in the discard.',
    flavor: 'Down two floors in under a second.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const [a] = await U.pickCards(c, { pile: 'draw', count: 1, optional: true, prompt: 'Into the Shadow Pocket?' });
      if (a) scurry(c, a, POCKET);
      const [b] = await U.pickCards(c, { pile: 'draw', count: 1, optional: true, prompt: 'Into the discard pile?' });
      if (b) scurry(c, b, 'discard');
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'hush/found-it', name: 'Found It', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['scurry'],
    text: 'Move a Trick from your discard pile to your hand, then one from hand to the bottom of your draw pile.',
    flavor: 'He knew where it was the entire time.',
    nums: {},
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'discard', count: 1, optional: true, prompt: 'Recover which Trick?' });
      if (k) scurry(c, k, 'hand');
      const [b] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Send which Trick to the bottom?' });
      if (b) scurry(c, b, 'draw', { moveOpts: { bottom: true } });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/nobody-saw-that', name: 'Nobody Saw That', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['unseen', 'stash'],
    text: 'Become [Unseen]. If already [Unseen], draw {c1} and you may [Stash] {n}.',
    flavor: 'Somebody did.',
    nums: { c1: 1, n: 1 },
    effect: eff(async (c) => {
      if (isUnseen(c)) { U.draw(c, N(c).c1); await stashSome(c, N(c).n); }
      else hide(c);
    }),
    upgrade: { nums: { c1: 2, n: 1 } },
  },
  {
    id: 'hush/tiny-escape-route', name: 'Tiny Escape Route', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['scurry'],
    text: 'Gain {b} Guard. If you have [Scurry]ed this turn, draw {c1}.',
    flavor: 'Behind the skirting board, then left.',
    nums: { b: 5, c1: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); if ((U.mm(c).scurriesThisTurn || 0) > 0) U.draw(c, N(c).c1); }),
    upgrade: { nums: { b: 8, c1: 2 } },
  },
  {
    id: 'hush/sticky-fingers', name: 'Sticky Fingers', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['pilfer', 'contraband'],
    text: '[Pilfer] an enemy.',
    flavor: 'Paws, technically.',
    nums: {},
    effect: eff((c) => { pilfer(c, c.target); }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/diversion', name: 'Diversion', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['stash'],
    text: 'If the target intends to Attack, gain {b} Guard. Otherwise draw {c1} and may [Stash] {n}.',
    flavor: 'A noise from the other side of the room, made by nobody.',
    nums: { b: 10, c1: 1, n: 1 },
    effect: eff(async (c) => {
      const t = c.target;
      if (t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) { U.guard(c, N(c).b); return; }
      U.draw(c, N(c).c1);
      await stashSome(c, N(c).n);
    }),
    upgrade: { nums: { b: 14, c1: 2, n: 1 } },
  },
  {
    id: 'hush/false-trail', name: 'False Trail', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['scurry'],
    text: 'Put a Trick from your hand on top of your draw pile. Gain {b} Guard.',
    flavor: 'Leads directly into a cupboard.',
    nums: { b: 5 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Put which Trick on top?' });
      if (k) scurry(c, k, 'draw', { moveOpts: { top: true } });
      U.guard(c, N(c).b);
    }),
    upgrade: { nums: { b: 8 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (14) ──
  {
    id: 'hush/blackout-bite', name: 'Blackout Bite', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: the target’s next Attack hits for less.',
    flavor: 'Everything goes dark and something goes wrong.',
    nums: { d: 7, n: 2 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d); if (a) U.apply(c, c.target, 'weak', N(c).n); }),
    upgrade: { nums: { d: 10, n: 3 } },
  },
  {
    id: 'hush/pocketknife-teeth', name: 'Pocketknife Teeth', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['scurry'],
    text: 'Deal {d} damage, plus once for each of your first {n} [Scurry]s this turn.',
    flavor: 'Folded away until they are not.',
    nums: { d: 5, n: 2 },
    balance: { scalesWith: 'how much you have moved cards around this turn — up to three hits' },
    effect: eff((c) => { const n = 1 + Math.min(N(c).n, U.mm(c).scurriesThisTurn || 0); for (let i = 0; i < n; i++) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 7, n: 2 } },
  },
  {
    id: 'hush/slinking-barrage', name: 'Slinking Barrage', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['shadow-pocket'],
    text: 'Deal {d} damage, plus once for every occupied [Shadow Pocket] slot.',
    flavor: 'One after another, all from different directions.',
    nums: { d: 6 },
    balance: { scalesWith: 'how full the Shadow Pocket is' },
    effect: eff((c) => { const n = 1 + pocket(c).length; for (let i = 0; i < n; i++) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: 'hush/ceiling-drop', name: 'Ceiling Drop', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['ambush'],
    text: 'Deal {d} damage. [Ambush]: regain {e} Nerve and draw {c1}.',
    flavor: 'How he got up there is his business.',
    nums: { d: 15, e: 1, c1: 1 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d); if (a) { U.energy(c, N(c).e); U.draw(c, N(c).c1); } }),
    upgrade: { nums: { d: 20, e: 1, c1: 2 } },
  },
  {
    id: 'hush/no-receipts', name: 'No Receipts', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY,
    text: 'Deal {d} damage. Remove a Status or Curse from your hand for the fight to deal {m0} more.',
    flavor: 'There is no paperwork. There never was any paperwork.',
    nums: { d: 7, m0: 14 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const junk = U.cardsIn(c, 'hand').find((k) => {
        const r = String((k.rarity || (k.def && k.def.rarity)) || '');
        const t = String((k.type || (k.def && k.def.type)) || '').toLowerCase();
        return r === 'curse' || t === 'status';
      });
      if (junk) { U.makeVanish(c, junk); c.exhaust(junk); U.hitAt(c, c.target, N(c).m0); }
    }),
    upgrade: { nums: { d: 10, m0: 19 } },
  },
  {
    id: 'hush/one-two-gone', name: 'One Two Gone', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['unseen'],
    text: 'Deal {d} damage. If this is your only Attack from hand this turn, become [Unseen] after.',
    flavor: 'One. Two. Gone.',
    nums: { d: 7 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if ((U.mm(c).attacksFromHand || 0) <= 1) U.mm(c).hideAfter = true;
    }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'hush/borrowed-fang', name: 'Borrowed Fang', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['contraband'],
    text: 'Deal {d} damage. If you played [Contraband] this turn, deal {m0} twice more.',
    flavor: 'It is not even the right shape for his mouth.',
    nums: { d: 7, m0: 4 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if ((U.mm(c).contrabandPlayed || 0) > 0) { U.hitAt(c, c.target, N(c).m0); U.hitAt(c, c.target, N(c).m0); }
    }),
    upgrade: { nums: { d: 10, m0: 6 } },
  },
  {
    id: 'hush/behind-you', name: 'Behind You', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['shadow-pocket', 'ambush'],
    text: 'Only from the [Shadow Pocket]. Deal {d} damage. [Ambush]: its next Attack hits for much less.',
    flavor: 'He is not. He is nowhere near. That is worse.',
    nums: { d: 14, n: 3 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d); if (a) U.apply(c, c.target, 'weak', N(c).n); }),
    playable: (c) => (c.card && c.card.pile === POCKET),
    playableReason: 'Behind You can only be played from the Shadow Pocket.',
    upgrade: { nums: { d: 19, n: 4 } },
  },
  {
    id: 'hush/ferret-missile', name: 'Ferret Missile', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['shadow-pocket'],
    text: 'Deal {d} damage. The first time, return this to the [Shadow Pocket] instead of discarding.',
    flavor: 'Aerodynamic in the way a sausage is aerodynamic.',
    nums: { d: 15 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const used = U.counter(c.card, 'launches') || 0;
      U.setCounter(c.card, 'launches', used + 1);
      if (used === 0 && pocketRoom(c)) U.moveCard(c, c.card, POCKET, {});
      else if (used >= 1) { U.makeVanish(c, c.card); c.exhaust(c.card); }
    }),
    upgrade: { nums: { d: 20 } },
  },
  {
    id: 'hush/hit-and-hide', name: 'Hit and Hide', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['stash', 'unseen'],
    text: 'Deal {d} damage. You may [Stash] a Skill; if you do, become [Unseen].',
    flavor: 'Both halves, in that order, very quickly.',
    nums: { d: 5 },
    effect: eff(async (c) => {
      U.hit(c, N(c).d);
      const [k] = await U.pickCards(c, {
        pile: 'hand', count: 1, optional: true, prompt: 'Stash which Skill?',
        filter: (x) => String((x.type || (x.def && x.def.type)) || '').toLowerCase() === 'skill',
      });
      if (k && stash(c, k)) U.mm(c).hideAfter = true;
    }),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'hush/rack-run', name: 'Rack Run', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['scurry'],
    text: 'Deal {d} to all enemies. With {n}+ [Scurry]s this turn, do it again.',
    flavor: 'Along the top of the coat rack, at speed.',
    nums: { d: 5, n: 2 },
    effect: eff((c) => { U.hitAll(c, N(c).d); if ((U.mm(c).scurriesThisTurn || 0) >= N(c).n) U.hitAll(c, N(c).d); }),
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'hush/stolen-momentum', name: 'Stolen Momentum', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['pilfer', 'scurry'],
    text: 'Deal {d} damage. If you [Pilfer]ed this enemy this turn, move your top discard to the [Shadow Pocket].',
    flavor: 'He took the run-up as well.',
    nums: { d: 7 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const t = c.target;
      const did = (U.mm(c).pilferedThisTurn || []).includes(t && (t.id ?? t.uid));
      if (!did) return;
      const pile = U.cardsIn(c, 'discard');
      const top = pile[pile.length - 1];
      if (top) scurry(c, top, POCKET);
    }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'hush/sudden-longness', name: 'Sudden Longness', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['shadow-pocket'],
    text: 'Deal {d} damage. Costs 1 less if the [Shadow Pocket] was full when the turn began.',
    flavor: 'He was a normal length a moment ago.',
    nums: { d: 14 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (U.mm(c).pocketFullAtStart ? 1 : 2),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'hush/no-witnesses', name: 'No Witnesses', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY,
    text: 'Deal {d} damage, or {m1} against something not intending to Attack.',
    flavor: 'There were none. He checked.',
    nums: { d: 15, m1: 21 },
    effect: eff((c) => {
      const t = c.target;
      const attacking = t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent);
      U.hit(c, attacking ? N(c).d : N(c).m1);
    }),
    upgrade: { nums: { d: 20, m1: 27 } },
  },

  // ── Skills (14) ──
  {
    id: 'hush/pocket-rotation', name: 'Pocket Rotation', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['scurry', 'shadow-pocket'],
    text: 'Swap up to {n} Tricks between hand and [Shadow Pocket]. If {n} moved, draw {c1}.',
    flavor: 'A complete inventory, conducted at speed.',
    nums: { n: 3, c1: 1 },
    effect: eff(async (c) => {
      let moved = 0;
      const outs = await U.pickCards(c, { pile: POCKET, count: N(c).n, optional: true, prompt: 'Take which Tricks out?' });
      for (const k of outs) { if (scurry(c, k, 'hand')) moved++; }
      const ins = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Put which Tricks in?' });
      for (const k of ins) { if (stash(c, k)) moved++; }
      if (moved >= N(c).n) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 3, c1: 2 } },
  },
  {
    id: 'hush/quiet-theft', name: 'Quiet Theft', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['pilfer', 'unseen', 'contraband'],
    text: '[Pilfer] an enemy. If [Unseen], make a second copy of the [Contraband].',
    flavor: 'They will notice in about an hour.',
    nums: {},
    effect: eff((c) => {
      const hidden = isUnseen(c);
      const def = pilfer(c, c.target);
      if (def && hidden && pocketRoom(c)) U.spawn(c, def, POCKET, { temporary: true, contraband: true });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/purloined-plan', name: 'Purloined Plan', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['pilfer', 'unseen'],
    text: '[Pilfer] an enemy. If it is not intending to Attack, also become [Unseen].',
    flavor: 'Folded up small and taken away.',
    nums: {},
    effect: eff((c) => {
      const t = c.target;
      pilfer(c, t);
      const attacking = t && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent);
      if (!attacking) hide(c);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/crawlspace', name: 'Crawlspace', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unseen', 'shadow-pocket'],
    text: 'Gain {b} Guard. If [Unseen], return this to the [Shadow Pocket] instead of discarding it.',
    flavor: 'Under the floor, above the ceiling, both at once.',
    nums: { b: 10 },
    effect: eff((c) => { U.guard(c, N(c).b); if (isUnseen(c) && pocketRoom(c)) U.moveCard(c, c.card, POCKET, {}); }),
    upgrade: { nums: { b: 14 } },
  },
  {
    id: 'hush/slip-the-collar', name: 'Slip the Collar', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unseen'],
    text: 'Remove a debuff and become [Unseen]. With nothing to remove, gain {b} Guard instead.',
    flavor: 'It was never going to hold him.',
    nums: { b: 6 },
    effect: eff((c) => { if (U.removeOneDebuff(c, c.self)) hide(c); else U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'hush/stuff-behind-the-sofa', name: 'Stuff Behind the Sofa', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['scurry', 'shadow-pocket'],
    text: 'From your discard pile: move one to the [Shadow Pocket] and one to the top of your draw pile.',
    flavor: 'Everything is behind the sofa. Everything has always been behind the sofa.',
    nums: {},
    effect: eff(async (c) => {
      const [a] = await U.pickCards(c, { pile: 'discard', count: 1, optional: true, prompt: 'Into the Shadow Pocket?' });
      if (a) scurry(c, a, POCKET);
      const [b] = await U.pickCards(c, { pile: 'discard', count: 1, optional: true, prompt: 'On top of the draw pile?' });
      if (b) scurry(c, b, 'draw', { moveOpts: { top: true } });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/nothing-to-see-here', name: 'Nothing to See Here', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unseen', 'stash'],
    text: 'Become [Unseen] and gain {b} Guard. If already [Unseen], [Stash] {n} and draw {c1} instead.',
    flavor: 'Said by nobody, from behind the sideboard.',
    nums: { b: 6, n: 1, c1: 1 },
    effect: eff(async (c) => {
      if (isUnseen(c)) { await stashSome(c, N(c).n); U.draw(c, N(c).c1); return; }
      hide(c);
      U.guard(c, N(c).b);
    }),
    upgrade: { nums: { b: 9, n: 1, c1: 2 } },
  },
  {
    id: 'hush/long-way-around', name: 'Long Way Around', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['scurry', 'shadow-pocket'],
    text: 'Look at the top {n} of your draw pile. Move one to the [Shadow Pocket] and one to the bottom.',
    flavor: 'Three rooms and a chimney out of his way.',
    nums: { n: 4 },
    effect: eff(async (c) => {
      const [a] = await U.pickCards(c, { pile: 'draw', count: 1, optional: true, prompt: 'Into the Shadow Pocket?' });
      if (a) scurry(c, a, POCKET);
      const [b] = await U.pickCards(c, { pile: 'draw', count: 1, optional: true, prompt: 'To the bottom?' });
      if (b) scurry(c, b, 'draw', { moveOpts: { bottom: true } });
    }),
    upgrade: { nums: { n: 5 } },
  },
  {
    id: 'hush/quick-change', name: 'Quick Change', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['scurry', 'stash'],
    text: 'Return the whole [Shadow Pocket] to your hand, then [Stash] the same number. Draw {c1}.',
    flavor: 'Everything out, everything back, nothing where it was.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const held = pocket(c).filter((k) => !(k.meta && k.meta.contraband));
      let n = 0;
      for (const k of held) { if (scurry(c, k, 'hand')) n++; }
      await stashSome(c, n);
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'hush/trapdoor-memory', name: 'Trapdoor Memory', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['scurry'],
    text: 'Move a Trick from the discard pile onto your draw pile. If you had already [Scurry]ed, draw it.',
    flavor: 'He remembers every floorboard that lifts.',
    nums: {},
    effect: eff(async (c) => {
      const already = (U.mm(c).scurriesThisTurn || 0) > 0;
      const [k] = await U.pickCards(c, { pile: 'discard', count: 1, optional: true, prompt: 'Bring which Trick back?' });
      if (!k) return;
      scurry(c, k, 'draw', { moveOpts: { top: true } });
      if (already) U.draw(c, 1);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/dust-bunny-accomplice', name: 'Dust Bunny Accomplice', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['shadow-pocket', 'vanish'],
    text: 'Put a temporary Dust Bunny in your [Shadow Pocket].',
    flavor: 'It has agreed to help. It is mostly hair.',
    nums: {},
    effect: eff((c) => { if (pocketRoom(c)) U.spawn(c, DUST_BUNNY, POCKET, { temporary: true }); }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/shhh', name: 'Shhh', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['shadow-pocket'],
    text: 'The next Trick you play from the [Shadow Pocket] this turn costs {n} less.',
    flavor: 'A paw, held up. Everybody stops.',
    nums: { n: 1 },
    effect: eff((c) => {
      for (const k of pocket(c)) U.costMod(c, k, -N(c).n, 'turn');
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'hush/under-the-door', name: 'Under the Door', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['shadow-pocket', 'scurry'],
    text: 'If a Trick has left your [Shadow Pocket] this turn, gain {e} Nerve, then move a Trick to the bottom.',
    flavor: 'The gap is two millimetres. He is fine.',
    nums: { e: 1 },
    effect: eff(async (c) => {
      if (!U.mm(c).pocketTouched) return;
      U.energy(c, N(c).e);
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Send which Trick to the bottom?' });
      if (k) scurry(c, k, 'draw', { moveOpts: { bottom: true } });
    }),
    upgrade: { nums: { e: 2 } },
  },
  {
    id: 'hush/stash-and-dash', name: 'Stash and Dash', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['stash', 'unseen'],
    text: '[Stash] up to {n}. Gain {b} Guard each. Become [Unseen]. End your turn.',
    flavor: 'And he is gone, and so is the turn.',
    nums: { n: 2, b: 5 },
    effect: eff(async (c) => {
      const got = await stashSome(c, N(c).n);
      U.guard(c, got * N(c).b);
      hide(c);
      U.mm(c).endTurnAfter = true;
    }),
    upgrade: { nums: { n: 3, b: 7 } },
  },

  // ── Powers (7) ──
  {
    id: 'hush/hidey-hole', name: 'Hidey Hole', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shadow-pocket', 'stash'],
    text: '[Shadow Pocket] capacity +{n} this combat. The first [Stash] each turn draws {c1}.',
    flavor: 'There is another one behind this one.',
    nums: { n: 1, c1: 1 },
    effect: eff((c) => power(c, 'hush/hidey-hole', 1, (x) => {
      U.mm(x).pocketBonus = (U.mm(x).pocketBonus || 0) + N(x).n;
      U.mm(x).hideyHole = true;
    })),
    upgrade: { nums: { n: 2, c1: 1 } },
  },
  {
    id: 'hush/light-sleeper', name: 'Light Sleeper', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['unseen'],
    text: 'At the start of your turn, if [Unseen], gain {e} Nerve.',
    flavor: 'One eye, always.',
    nums: { e: 1 },
    effect: eff((c) => power(c, 'hush/light-sleeper', N(c).e, (x) => { U.mm(x).lightSleeper = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/kleptomaniac', name: 'Kleptomaniac', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['pilfer', 'contraband'],
    text: 'The first [Pilfer] each turn makes a second copy of the [Contraband].',
    flavor: 'It is not a choice he is making.',
    nums: {},
    effect: eff((c) => power(c, 'hush/kleptomaniac', 1, (x) => { U.mm(x).kleptomaniac = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/hallway-phantom', name: 'Hallway Phantom', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['scurry'],
    text: 'The first time you [Scurry] each turn, gain {b} Guard.',
    flavor: 'Something went past. Nothing was there.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'hush/hallway-phantom', N(c).b, (x) => { U.mm(x).hallwayPhantom = true; })),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'hush/no-fixed-address', name: 'No Fixed Address', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['shadow-pocket', 'unseen'],
    text: 'At the end of your turn, if the [Shadow Pocket] is full, become [Unseen].',
    flavor: 'He lives in the house. Not in any particular part of it.',
    nums: {},
    effect: eff((c) => power(c, 'hush/no-fixed-address', 1, (x) => { U.mm(x).noFixedAddress = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/inside-job', name: 'Inside Job', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['contraband', 'scurry'],
    text: 'The first [Contraband] you play each turn moves your top discard into the [Shadow Pocket].',
    flavor: 'Somebody on the inside. Somebody very small.',
    nums: {},
    effect: eff((c) => power(c, 'hush/inside-job', 1, (x) => { U.mm(x).insideJob = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/soft-footfalls', name: 'Soft Footfalls', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['shadow-pocket', 'ambush'],
    text: 'Your first [Ambush] Attack from the [Shadow Pocket] each turn costs {n} less.',
    flavor: 'Not silence. Something quieter than silence.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'hush/soft-footfalls', N(c).n, (x) => {
      U.mm(x).softFootfalls = true;
      for (const k of pocket(x)) U.costMod(x, k, -N(x).n, 'combat');
    })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (10) ──
  {
    id: 'hush/lights-out-teeth-out', name: 'Lights Out, Teeth Out', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['ambush', 'unseen'],
    text: 'Deal {d} damage, or {m1} on an [Ambush]. Play no more Attacks and become [Unseen] at end of turn.',
    flavor: 'Both halves of him, at once.',
    nums: { d: 15, m1: 24 },
    effect: eff((c) => {
      const a = ambush(c);
      U.hit(c, a ? N(c).m1 : N(c).d);
      U.mm(c).hideAtEnd = true;
    }),
    upgrade: { nums: { d: 20, m1: 31 } },
  },
  {
    id: 'hush/whole-ferret-no-warning', name: 'Whole Ferret, No Warning', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, exhaust: true, keywords: ['shadow-pocket', 'ambush', 'vanish'],
    text: 'Only from the [Shadow Pocket]. Deal {d} damage. [Ambush]: ignore Guard. [Vanish].',
    flavor: 'All of him. No warning.',
    nums: { d: 33 },
    effect: eff((c) => { const a = ambush(c); U.hit(c, N(c).d, a ? { pierce: true } : undefined); }),
    playable: (c) => (c.card && c.card.pile === POCKET),
    playableReason: 'That one only comes out of the Shadow Pocket.',
    upgrade: { cost: 2 },
  },
  {
    id: 'hush/swipe-the-spotlight', name: 'Swipe the Spotlight', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['ambush', 'unseen'],
    text: 'Deal {d} to all enemies. [Ambush]: this does not reveal you.',
    flavor: 'Took the light with him.',
    nums: { d: 11 },
    balance: { scalesWith: 'the whole room, and on an Ambush it does not cost you the hiding' },
    effect: eff((c) => { if (ambush(c)) U.mm(c).stayHidden = true; U.hitAll(c, N(c).d); }),
    upgrade: { nums: { d: 15 } },
  },
  {
    id: 'hush/borrowed-violence', name: 'Borrowed Violence', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['contraband'],
    text: 'If a Snatched Swipe is in your [Shadow Pocket], fire it first. Then deal {d} damage.',
    flavor: 'Somebody else’s violence, used carefully.',
    nums: { d: 7, m0: 5 },
    effect: eff((c) => {
      const swipe = pocket(c).find((k) => (k.def && k.def.id) === 'hush/snatched-swipe');
      if (swipe) { U.hitAt(c, c.target, N(c).m0); U.moveCard(c, swipe, 'exhaust', {}); }
      U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 10, m0: 7 } },
  },
  {
    id: 'hush/master-key-bite', name: 'Master Key Bite', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['pilfer'],
    text: 'Deal {d} damage, ignoring Guard against a Defending target. {m1} if you [Pilfer]ed it this turn.',
    flavor: 'Opens everything. Including things that are not locks.',
    nums: { d: 14, m1: 20 },
    effect: eff((c) => {
      const t = c.target;
      const did = (U.mm(c).pilferedThisTurn || []).includes(t && (t.id ?? t.uid));
      const defending = t && t.pendingMove && DEFEND_INTENTS.has(t.pendingMove.intent);
      U.hit(c, did ? N(c).m1 : N(c).d, defending ? { pierce: true } : undefined);
    }),
    upgrade: { nums: { d: 19, m1: 26 } },
  },
  {
    id: 'hush/grand-theft-momentum', name: 'Grand Theft Momentum', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['pilfer', 'ambush', 'contraband'],
    text: '[Pilfer] the target, then deal {d} damage. [Ambush]: play the [Contraband] free and draw {c1}.',
    flavor: 'The whole run-up, the whole swing, and the wallet.',
    nums: { d: 11, c1: 1 },
    balance: { scalesWith: 'the Contraband it steals and, on an Ambush, plays for free' },
    effect: eff((c) => {
      const a = ambush(c);
      pilfer(c, c.target);
      U.hit(c, N(c).d);
      if (!a) return;
      const made = pocket(c)[pocket(c).length - 1];
      if (made && made.def && made.def.effect) {
        try { made.def.effect({ ...c, card: made }); } catch (_) { /* the Contraband is optional value */ }
        U.moveCard(c, made, 'exhaust', {});
      }
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { d: 15, c1: 2 } },
  },
  {
    id: 'hush/pocket-dimension-pounce', name: 'Pocket Dimension Pounce', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['shadow-pocket'],
    text: 'Deal {d} plus {m0} per Nerve of your other [Shadow Pocket] Tricks, then discard them.',
    flavor: 'Everything he was saving, spent at once.',
    nums: { d: 11, m0: 5 },
    balance: { scalesWith: 'the printed cost of everything else in the Pocket, which it then empties' },
    effect: eff((c) => {
      const others = pocket(c).filter((k) => k !== c.card);
      const total = others.reduce((n, k) => n + Math.max(0, U.printedCost(k)), 0);
      U.hit(c, N(c).d + total * N(c).m0);
      for (const k of others) U.moveCard(c, k, 'discard', {});
    }),
    upgrade: { nums: { d: 15, m0: 7 } },
  },
  {
    id: 'hush/floorboard-express', name: 'Floorboard Express', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['scurry', 'ambush', 'shadow-pocket'],
    text: 'Deal {d} damage, then move an Attack from your discard into the [Shadow Pocket]. [Ambush]: it costs {n} less.',
    flavor: 'Under the boards, three rooms along, out by the stairs.',
    nums: { d: 5, n: 1 },
    balance: { scalesWith: 'the Attack it pulls out of your discard pile and into the Pocket' },
    effect: eff(async (c) => {
      const a = ambush(c);
      U.hit(c, N(c).d);
      const [k] = await U.pickCards(c, {
        pile: 'discard', count: 1, optional: true, prompt: 'Pocket which Attack?',
        filter: (x) => String((x.type || (x.def && x.def.type)) || '').toLowerCase() === 'attack',
      });
      if (k && scurry(c, k, POCKET) && a) U.costMod(c, k, -N(c).n, 'turn');
    }),
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'hush/gone-before-the-squeak', name: 'Gone Before the Squeak', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['ambush', 'unseen', 'vanish'],
    text: 'Deal {d} damage. [Ambush]: become [Unseen] again afterwards, then [Vanish].',
    flavor: 'The squeak arrives in an empty room.',
    nums: { d: 11 },
    effect: eff((c) => {
      const a = ambush(c);
      U.hit(c, N(c).d);
      if (!a) return;
      U.mm(c).hideAfter = true;
      U.makeVanish(c, c.card); c.exhaust(c.card);
    }),
    upgrade: { nums: { d: 15 } },
  },
  {
    id: 'hush/every-door-is-mine', name: 'Every Door Is Mine', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['scurry'],
    text: 'Deal {d} damage once, then once more per [Scurry] this turn, up to {n} hits.',
    flavor: 'Every door, every vent, every gap behind every skirting board.',
    nums: { d: 5, n: 6 },
    balance: { scalesWith: 'every Scurry you made this turn, up to six hits' },
    effect: eff((c) => {
      const n = Math.min(N(c).n, 1 + (U.mm(c).scurriesThisTurn || 0));
      for (let i = 0; i < n; i++) U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 7, n: 6 } },
  },

  // ── Skills (9) ──
  {
    id: 'hush/clean-getaway', name: 'Clean Getaway', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['unseen'],
    text: 'Gain {b} Guard and become [Unseen]. If nothing gets through this enemy turn, gain {e} Nerve next turn.',
    flavor: 'No prints, no fur, no witnesses.',
    nums: { b: 14, e: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); hide(c); U.mm(c).cleanGetaway = N(c).e; }),
    upgrade: { nums: { b: 19, e: 1 } },
  },
  {
    id: 'hush/empty-the-pockets', name: 'Empty the Pockets', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['contraband', 'shadow-pocket'],
    text: 'Play every [Contraband] in your [Shadow Pocket], each a little stronger, then they are gone.',
    flavor: 'Turned out onto the rug, all at once.',
    nums: { m0: 4 },
    balance: { scalesWith: 'however much Contraband you have squirrelled away' },
    effect: eff((c) => {
      const loot = pocket(c).filter((k) => k.meta && k.meta.contraband);
      for (const k of loot) {
        try { if (k.def && k.def.effect) k.def.effect({ ...c, card: k }); } catch (_) { /* one bad Contraband must not eat the rest */ }
        U.guard(c, N(c).m0);
        U.moveCard(c, k, 'exhaust', {});
      }
    }),
    upgrade: { nums: { m0: 6 } },
  },
  {
    id: 'hush/perfect-heist', name: 'Perfect Heist', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['pilfer', 'contraband'],
    text: '[Pilfer] every enemy the [Shadow Pocket] has room for, then duplicate one of them.',
    flavor: 'Planned for weeks. Executed in four seconds.',
    nums: {},
    effect: eff((c) => {
      let last = null;
      for (const e of U.enemies(c)) { const d = pilfer(c, e); if (d) last = d; }
      if (last && pocketRoom(c)) U.spawn(c, last, POCKET, { temporary: true, contraband: true });
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/switcheroo', name: 'Switcheroo', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['scurry', 'shadow-pocket', 'stash'],
    text: 'Swap your whole hand with the [Shadow Pocket], ignoring capacity until end of turn.',
    flavor: 'Nobody, including Hush, is entirely sure what happened.',
    nums: {},
    effect: eff((c) => {
      const hand = U.handOthers(c).slice();
      const held = pocket(c).filter((k) => !(k.meta && k.meta.contraband)).slice();
      for (const k of held) scurry(c, k, 'hand');
      for (const k of hand) scurry(c, k, POCKET, { overflow: true });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/cut-the-lights', name: 'Cut the Lights', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['unseen', 'shadow-pocket'],
    text: 'Become [Unseen]. This turn, Skills and Powers from the [Shadow Pocket] cost 0, and your first Attack from it does too.',
    flavor: 'The whole wing, at the fusebox.',
    nums: {},
    effect: eff((c) => {
      hide(c);
      for (const k of pocket(c)) U.costSet(c, k, 0, 'turn');
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/secret-passage-network', name: 'Secret Passage Network', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['scurry', 'shadow-pocket'],
    text: 'Find up to {n} Tricks: one to your hand, one to the [Shadow Pocket], one on top of your draw pile.',
    flavor: 'He drew a map once. He ate it.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const [a] = await U.pickCards(c, { pile: 'discard', count: 1, optional: true, prompt: 'Into your hand?' });
      if (a) scurry(c, a, 'hand');
      const [b] = await U.pickCards(c, { pile: 'discard', count: 1, optional: true, prompt: 'Into the Shadow Pocket?' });
      if (b) scurry(c, b, POCKET);
      const [d] = await U.pickCards(c, { pile: 'draw', count: 1, optional: true, prompt: 'On top of the draw pile?' });
      if (d) scurry(c, d, 'draw', { moveOpts: { top: true } });
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/all-according-to-hush', name: 'All According to Hush', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['shadow-pocket', 'unseen'],
    text: 'Prime a Trick in your [Shadow Pocket]. The next time you become Seen, it plays free.',
    flavor: 'It was. It always is.',
    nums: {},
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: POCKET, count: 1, optional: true, prompt: 'Prime which Trick?' });
      if (k) U.mm(c).primed = k;
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/buried-in-the-couch', name: 'Buried in the Couch', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['scurry'],
    text: 'Remove up to {n} Statuses or Curses for the fight. Gain {b} Guard for each.',
    flavor: 'Coins, a biro, three Curses and a ferret.',
    nums: { n: 3, b: 5 },
    effect: eff((c) => {
      const junk = U.cardsIn(c, 'hand').concat(U.cardsIn(c, 'discard')).filter((k) => {
        const r = String((k.rarity || (k.def && k.def.rarity)) || '');
        const t = String((k.type || (k.def && k.def.type)) || '').toLowerCase();
        return r === 'curse' || t === 'status';
      }).slice(0, N(c).n);
      for (const k of junk) { U.makeVanish(c, k); c.exhaust(k); U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { n: 4, b: 7 } },
  },
  {
    id: 'hush/three-places-at-once', name: 'Three Places at Once', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['scurry'],
    text: 'This turn, the first time each Trick [Scurry]s it leaves a free temporary copy behind.',
    flavor: 'He is not. It only looks that way.',
    nums: {},
    effect: eff((c) => { U.mm(c).threePlaces = new Set(); }),
    upgrade: { cost: 1 },
  },

  // ── Powers (6) ──
  {
    id: 'hush/bigger-on-the-inside', name: 'Bigger on the Inside', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['shadow-pocket'],
    text: '[Shadow Pocket] capacity becomes {n}. The first Trick in each turn costs 1 less from there.',
    flavor: 'It is a pocket. It is also, somehow, a room.',
    nums: { n: 5 },
    effect: eff((c) => power(c, 'hush/bigger-on-the-inside', 1, (x) => {
      U.mm(x).pocketBonus = Math.max(U.mm(x).pocketBonus || 0, N(x).n - BASE_POCKET);
    })),
    upgrade: { nums: { n: 6 } },
  },
  {
    id: 'hush/professional-nuisance', name: 'Professional Nuisance', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['ambush', 'scurry', 'shadow-pocket'],
    text: 'The first time each turn an [Ambush] reveals you, move your top draw into the [Shadow Pocket].',
    flavor: 'It is a career, of a sort.',
    nums: {},
    effect: eff((c) => power(c, 'hush/professional-nuisance', 1, (x) => { U.mm(x).professionalNuisance = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/the-house-has-corners', name: 'The House Has Corners', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['unseen', 'shadow-pocket'],
    text: 'At the start of your turn, if Seen with {n}+ in the [Shadow Pocket], become [Unseen].',
    flavor: 'More than it should, for its dimensions.',
    nums: { n: 2 },
    effect: eff((c) => power(c, 'hush/the-house-has-corners', 1, (x) => { U.mm(x).houseHasCorners = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'hush/sticky-little-legend', name: 'Sticky Little Legend', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['contraband', 'shadow-pocket'],
    text: '[Contraband] returns to the [Shadow Pocket] after use, costing {n} more each time.',
    flavor: 'They tell stories about him downstairs.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'hush/sticky-little-legend', N(c).n, (x) => { U.mm(x).stickyLegend = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'hush/now-you-see-me', name: 'Now You See Me', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['ambush', 'unseen'],
    text: 'The first [Ambush] Attack you resolve each turn does not reveal you.',
    flavor: 'You did. Briefly.',
    nums: {},
    effect: eff((c) => power(c, 'hush/now-you-see-me', 1, (x) => { U.mm(x).nowYouSeeMe = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'hush/now-you-dont', name: 'Now You Don’t', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['shadow-pocket', 'unseen'],
    text: 'The first time the [Shadow Pocket] empties each turn, become [Unseen], draw {c1} and gain {e} Nerve.',
    flavor: 'And you do not.',
    nums: { c1: 2, e: 1 },
    effect: eff((c) => power(c, 'hush/now-you-dont', 1, (x) => { U.mm(x).nowYouDont = true; })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'hush/pass-the-sock', name: 'Pass the Sock', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['scurry'],
    text: 'Give a Trick from your hand to another Kid until the end of their next turn. It costs {n} less for them.',
    flavor: 'It is a good sock. He is being generous.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Give which Trick?' });
      if (!k) return;
      c.giveCard(ally, k.def || k, 'hand');
      U.moveCard(c, k, 'discard', {});
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'hush/coat-check', name: 'Coat Check', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF,
    text: 'Set aside a Trick in a friend’s hand until their next turn. They draw {c1}; it returns costing {n} less.',
    flavor: 'A numbered ticket. No coat.',
    nums: { c1: 1, n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      c.giveDraw(ally, N(c).c1);
    }),
    upgrade: { nums: { c1: 2, n: 1 } },
  },
  {
    id: 'hush/whisper-from-the-vent', name: 'Whisper From the Vent', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['unseen'],
    text: 'A friend moves a Trick from their discard to the top of their draw pile — into their hand if you are [Unseen].',
    flavor: 'Advice, from inside the wall.',
    nums: {},
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      if (isUnseen(c)) c.giveDraw(ally, 1);
      else c.giveBlock(ally, 5);
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'hush/everybody-act-natural', name: 'Everybody Act Natural', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['unseen'],
    text: 'Every other Kid sets a Trick aside and draws {c1}; it returns next turn costing {n} less. Become [Unseen].',
    flavor: 'Nobody in the room is acting natural.',
    nums: { c1: 1, n: 1 },
    effect: eff((c) => {
      for (const mate of c.teammates()) c.giveDraw(mate, N(c).c1);
      hide(c);
    }),
    upgrade: { nums: { c1: 2, n: 1 } },
  },
  {
    id: 'hush/the-great-menagerie-heist', name: 'The Great Menagerie Heist', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['scurry'],
    text: 'Every Kid contributes a Trick to a shared stash; each may play somebody else’s once this turn.',
    flavor: 'Nine seconds of planning and a lifetime of consequences.',
    nums: { c1: 1 },
    effect: eff((c) => {
      // Each Kid draws into the shared moment; the stash itself is the party's
      // hands, so the mechanical shape is "everybody gets a card and Hush gets
      // the pick of the Pocket".
      for (const mate of c.teammates()) c.giveDraw(mate, N(c).c1);
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
];

export default {
  slug: SLUG,
  name: 'Hush',
  title: 'the Shadow Ferret',
  region: 'secret-passages',
  identity:
    'Hush keeps a second, tiny hand. The Shadow Pocket holds three Tricks, they survive the end of ' +
    'the turn, and he can play them straight out of it — so hiding is not a way to dodge, it is how ' +
    'he sets up. An Attack played from the Pocket while Unseen resolves its Ambush FIRST and only ' +
    'reveals him afterwards, while the same Attack from his hand reveals him before it lands. At high ' +
    'mastery he is moving Tricks between four zones every turn, stealing whatever the enemy was about ' +
    'to do, and choosing exactly which turn stops being quiet.',
  strengths: [
    'A second hand that survives the turn, holding exactly what he wants when he wants it',
    'Ambush turns preparation into damage nothing else in the house matches',
    'Scurry rewards moving cards, so his deck manipulation IS his damage',
    'Pilfer converts whatever the enemy intends into something he can use',
    'Unseen survives a hit entirely absorbed by Guard, so defence and stealth stack',
  ],
  weaknesses: [
    'Three slots, and Contraband competes for them',
    'Unseen is not armour — it does nothing about the damage itself',
    'Every Attack from his hand throws away the hiding he spent a turn setting up',
    'A Pocket full of the wrong Tricks is worse than an empty one',
    'Pilfer depends on what the enemy happens to intend, which he does not control',
    'Setup turns do very little, and a short fight never lets him cash them in',
  ],
  startingHp: 66,
  startingEnergy: 3,
  mechanics: {
    pocket: { name: 'Shadow Pocket', kind: 'system', desc: 'A second zone holding 3 Tricks. They stay between turns, do not count as hand size, and can be played straight out of it.', min: 0, max: 6, hooks: [] },
    stash: { name: 'Stash', kind: 'system', desc: 'Move a Trick from your hand into the Shadow Pocket. Stashing is not playing it.', min: 0, max: 6, hooks: [] },
    scurry: { name: 'Scurry', kind: 'system', desc: 'A deliberate move of a non-temporary Trick between hand, draw, discard and Pocket. Drawing is not a Scurry; nor is normal discarding.', min: 0, max: 99, hooks: ['scurry'] },
    unseen: { name: 'Unseen', kind: 'status', desc: 'Broken by losing Courage to an Attack, or by playing an Attack. Guard absorbing the whole hit leaves him hidden.', min: 0, max: 1, hooks: ['unseen', 'seen'] },
    ambush: { name: 'Ambush', kind: 'system', desc: 'Extra text that fires when a Trick is played from the Shadow Pocket while Unseen. The Attack resolves first, then he is Seen.', min: 0, max: 1, hooks: [] },
    pilfer: { name: 'Pilfer', kind: 'system', desc: 'Read an enemy intent and put the matching temporary Contraband into the Shadow Pocket. Contraband never Scurries.', min: 0, max: 4, hooks: ['pilfer'] },
  },
  startingDeck: [
    'hush/quick-nip', 'hush/quick-nip', 'hush/quick-nip', 'hush/quick-nip',
    'hush/cushion-dive', 'hush/cushion-dive', 'hush/cushion-dive',
    'hush/pocket-this', 'hush/lights-out', 'hush/from-under-the-sofa',
  ],
  cards: [...basics, ...CONTRA_LIST, DUST_BUNNY, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Ambush Hush', desc: 'Prepare an Attack in the Pocket, become Unseen, and choose the moment. The cleanest expression of him and the one every other build borrows from.', coreCards: ['hush/from-under-the-sofa', 'hush/ceiling-drop', 'hush/behind-you', 'hush/soft-footfalls', 'hush/gone-before-the-squeak', 'hush/now-you-see-me', 'hush/whole-ferret-no-warning'] },
    { name: 'Scurry Engine', desc: 'Move Tricks between four zones constantly and let the movement itself be the damage. Enormous with the right payoffs and completely inert without them.', coreCards: ['hush/make-room', 'hush/found-it', 'hush/pocket-rotation', 'hush/pocketknife-teeth', 'hush/every-door-is-mine', 'hush/hallway-phantom', 'hush/three-places-at-once'] },
    { name: 'Contraband', desc: 'Steal what the enemy was about to do and use it yourself. Flexible, and dependent on what they happen to intend.', coreCards: ['hush/sticky-fingers', 'hush/quiet-theft', 'hush/kleptomaniac', 'hush/inside-job', 'hush/empty-the-pockets', 'hush/perfect-heist', 'hush/sticky-little-legend'] },
    { name: 'Long Stealth', desc: 'Stay Unseen across several turns rather than cashing it in immediately. Everything gets quietly better and one careless Attack ends it.', coreCards: ['hush/quiet-paws', 'hush/crawlspace', 'hush/light-sleeper', 'hush/no-fixed-address', 'hush/clean-getaway', 'hush/the-house-has-corners', 'hush/swipe-the-spotlight'] },
    { name: 'Deep Pockets', desc: 'Make the Pocket enormous and treat it as the real hand. The most demanding version of him, and the one that plays the biggest turns.', coreCards: ['hush/hidey-hole', 'hush/bigger-on-the-inside', 'hush/slinking-barrage', 'hush/pocket-dimension-pounce', 'hush/switcheroo', 'hush/cut-the-lights', 'hush/now-you-dont'] },
  ],
};
