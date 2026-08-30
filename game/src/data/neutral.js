/**
 * Status Tricks, Curses and shared colourless Tricks.  OWNER: companion-cards.
 *
 * Status cards are junk the enemy puts in your deck.  Curses are permanent junk.
 * Shared Tricks belong to no Companion and appear in shops, Curiosities and
 * colourless rewards.
 */
import { CardType, Rarity, Target } from './schema.js';
import { guard, draw, hit, hitAll, energy, N, handOthers, removeOneDebuff } from './companions/_util.js';

const STATUS = CardType.STATUS, CURSE = CardType.CURSE, ATTACK = CardType.ATTACK, SKILL = CardType.SKILL;

/* ── Cards that DO something while they are stuck in your hand ───────────────
 *
 * Nine of the cards below print a rule - "At the end of your turn, lose 2
 * Courage", "When drawn, lose 1 Nerve", "you cannot play more than 3 Tricks
 * each turn" - and not one of them used to do anything at all. A card's
 * `effect` is invoked at exactly one place in the engine, inside `_playCard`,
 * and that place is behind a `canPlay` that refuses every `unplayable` card. So
 * the text was printed, the Curiosity that hands the card out was written, the
 * card entered the deck, and the rule never once fired. Six of the nine come
 * from real Curiosity outcomes.
 *
 * `handHooks` (combat/hooks.js) is the seam that reaches a held card. Two things
 * about it differ from a status hook and both bite if forgotten:
 *
 *   h.owner is the CARD, not an actor. So every call names its actor:
 *   `h.loseHp(h.player, n)`, never `h.loseHp(n)`.
 *
 *   Dispatch is global for `onCardDrawn` and `onCardPlayed`, so in a party a
 *   Curse in YOUR hand hears about a teammate's draw. Each hook below checks
 *   that what happened happened to its own holder.
 *
 * The `effect` on these cards is now an honest no-op rather than a second,
 * unreachable copy of the rule. Two implementations of one sentence, one of
 * them dead, is how they drift.
 */

/** This card's own live number - the INSTANCE's, so an upgrade is respected. */
function hnum(h, key = 'n') { return (h.owner?.nums?.[key] ?? 0) | 0; }
/** True when the thing that just happened happened to the Kid holding this card. */
function mine(h) { return h.e.seatOfCard(h.card) === h.player; }

// ── Status Tricks ───────────────────────────────────────────────────────────
export const STATUS_CARDS = [
  {
    id: 'status/spooked', name: 'Spooked', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: -2, target: Target.NONE, unplayable: true, ethereal: true, keywords: ['ethereal'],
    text: 'Unplayable. [Ethereal].',
    flavor: 'Something moved. You are almost sure something moved.',
    nums: {}, effect: () => {}, upgrade: { text: 'Unplayable. [Ethereal].' },
  },
  {
    id: 'status/sticky-fur', name: 'Sticky Fur', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: 1, target: Target.NONE, exhaust: true, keywords: ['vanish'],
    text: '[Vanish].', flavor: 'It will come out. Eventually.',
    nums: {}, effect: () => {}, upgrade: { text: '[Vanish].' },
  },
  {
    id: 'status/candle-burn', name: 'Candle Burn', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, lose {n} Courage.',
    flavor: 'Wax where wax should not be.',
    nums: { n: 2 }, effect: () => {},
    handHooks: { onHeldTurnEnd(h) { h.loseHp(h.player, hnum(h)); } },
    upgrade: { nums: { n: 4 }, text: 'Unplayable. At the end of your turn, lose {n} Courage.' },
  },
  {
    /* -- the Kitchens and Cellars -----------------------------------------
     * Sticky is that region's signature interference and is deliberately NOT a
     * dead card - the rule Drowsy follows. It replaces itself, so it never
     * shrinks your hand. What it takes is a Nerve, and a Nerve in the Kitchens
     * is the resource every escalating enemy is racing you for.
     *
     * It lives HERE rather than in the roster that generates it because it is a
     * CARD: `ctx.draw()` is on the card context, and `tests/seams/check.py`
     * reads a `ctx.` call inside `data/enemies/` as a call on the ENEMY context,
     * where no `draw` exists. The gate is right to be suspicious - one home for
     * status cards is better than two, and this is the one the others use. */
    id: 'status/sticky', name: 'Sticky', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: 1, target: Target.NONE, exhaust: true, keywords: ['vanish'],
    text: 'Draw {n} Trick. [Vanish].',
    flavor: 'It comes away from the counter with a sound you feel in your teeth.',
    nums: { n: 1 }, effect: (c) => draw(c, N(c).n),
    upgrade: { text: 'Draw {n} Trick. [Vanish].' },
  },
  {
    /* The Confectioner's three-Jam Dish and the Oven's Caramel Creeper make one
     * that costs 2. A separate def rather than a runtime cost bump: a card's
     * printed cost is rendered once when its CardView is built, so one whose
     * cost changed after it was drawn would sit in the hand showing the wrong
     * number until it was played. */
    id: 'status/sticky-caramel', name: 'Caramel Sticky', companion: 'status', type: STATUS,
    rarity: Rarity.SPECIAL,
    cost: 2, target: Target.NONE, exhaust: true, keywords: ['vanish'],
    text: 'Draw {n} Trick. [Vanish].',
    flavor: 'Twice as much of it, and it has had time to set.',
    nums: { n: 1 }, effect: (c) => draw(c, N(c).n),
    upgrade: { text: 'Draw {n} Trick. [Vanish].' },
  },
  {
    id: 'status/scrape', name: 'Scrape', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable.', flavor: 'A thin white line that stings when you think about it.',
    nums: {}, effect: () => {}, upgrade: { text: 'Unplayable.' },
  },
  {
    id: 'status/gloom', name: 'Gloom', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: -2, target: Target.NONE, unplayable: true, ethereal: true, keywords: ['ethereal'],
    text: 'Unplayable. [Ethereal]. When drawn, lose {n} Nerve.',
    flavor: 'The room gets one shade dimmer.',
    nums: { n: 1 }, effect: () => {},
    // The seat is named because a Kid can be handed a card outside their own
    // go, and `loseEnergy` with no seat moves whoever is currently acting.
    handHooks: {
      onCardDrawn(h) { if (h.card === h.owner) h.e.loseEnergy(hnum(h), 'gloom', h.player); },
    },
    upgrade: { text: 'Unplayable. [Ethereal]. When drawn, lose {n} Nerve.' },
  },
  {
    id: 'status/wrong-side', name: 'Wrong Side', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: -2, target: Target.NONE, unplayable: true, ethereal: true, keywords: ['ethereal'],
    text: 'Unplayable. [Ethereal]. When drawn, lose {n} Courage.',
    flavor: 'You came back. Most of you.',
    nums: { n: 3 }, effect: () => {},
    handHooks: {
      onCardDrawn(h) { if (h.card === h.owner) h.loseHp(h.player, hnum(h)); },
    },
    upgrade: { text: 'Unplayable. [Ethereal]. When drawn, lose {n} Courage.' },
  },
];

// ── Curses ──────────────────────────────────────────────────────────────────
export const CURSE_CARDS = [
  {
    id: 'curse/regret', name: 'Regret', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, lose {n} Courage for each Trick in your hand.',
    flavor: 'You should have taken the other door.',
    nums: { n: 1 }, effect: () => {},
    // Counting itself is the printed rule read literally: Regret IS a Trick in
    // your hand. It is also what makes it worth removing.
    handHooks: {
      onHeldTurnEnd(h) { h.loseHp(h.player, hnum(h) * h.player.piles.hand.length); },
    },
    upgrade: { text: 'Unplayable. At the end of your turn, lose {n} Courage for each Trick in your hand.' },
  },
  {
    id: 'curse/bad-luck', name: 'Bad Luck', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, gain {n} Weak.',
    flavor: 'Thirteen stairs. Every time. You have counted.',
    nums: { n: 1 }, effect: () => {},
    // `fresh`: Weak's own decay bucket is 'turnEnd' and runs moments after this,
    // so without it the stack expires in the same breath it arrives and the
    // Curse is inert. See CombatEngine._decayBucket.
    handHooks: {
      onHeldTurnEnd(h) { h.applyStatus(h.player, 'weak', hnum(h), { fresh: true }); },
    },
    upgrade: { text: 'Unplayable. At the end of your turn, gain {n} Weak.' },
  },
  {
    id: 'curse/clingy-shadow', name: 'Clingy Shadow', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, gain {n} Frail.',
    flavor: 'It is yours. It is just not doing what you are doing.',
    nums: { n: 1 }, effect: () => {},
    handHooks: {
      onHeldTurnEnd(h) { h.applyStatus(h.player, 'frail', hnum(h), { fresh: true }); },
    },
    upgrade: { text: 'Unplayable. At the end of your turn, gain {n} Frail.' },
  },
  {
    id: 'curse/creaky-floorboard', name: 'Creaky Floorboard', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable.', flavor: 'Everything in the house now knows exactly where you are.',
    nums: {}, effect: () => {}, upgrade: { text: 'Unplayable.' },
  },
  {
    id: 'curse/heavy-heart', name: 'Heavy Heart', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, lose {n} Courage.',
    flavor: 'Not sad exactly. Just weighted.',
    nums: { n: 2 }, effect: () => {},
    handHooks: { onHeldTurnEnd(h) { h.loseHp(h.player, hnum(h)); } },
    upgrade: { text: 'Unplayable. At the end of your turn, lose {n} Courage.' },
  },
  {
    id: 'curse/night-terror', name: 'Night Terror', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. While this is in your hand, lose {n} Courage whenever you play a Trick.',
    flavor: 'It is under the bed and it is doing the breathing on purpose.',
    nums: { n: 1 }, effect: () => {},
    handHooks: {
      onCardPlayed(h) { if (h.card !== h.owner && mine(h)) h.loseHp(h.player, hnum(h)); },
    },
    upgrade: { text: 'Unplayable. While this is in your hand, lose {n} Courage whenever you play a Trick.' },
  },
  {
    id: 'curse/lost-mitten', name: 'Lost Mitten', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true, ethereal: true, keywords: ['ethereal'],
    text: 'Unplayable. [Ethereal]. While this is in your hand, you cannot play more than {n} Tricks each turn.',
    flavor: 'One mitten is worse than no mittens.',
    nums: { n: 3 }, effect: () => {},
    // A veto that returns a STRING prints it instead of the generic "Something
    // is stopping you" - the Mitten knows exactly why it is saying no, and a
    // card greyed out for no stated reason is its own small silence.
    handHooks: {
      vetoPlay(h) {
        const cap = hnum(h);
        const played = h.player.playedThisTurn ? h.player.playedThisTurn.length : 0;
        return played >= cap ? `Lost Mitten - no more than ${cap} Tricks this turn.` : false;
      },
    },
    upgrade: { text: 'Unplayable. [Ethereal]. While this is in your hand, you cannot play more than {n} Tricks each turn.' },
  },
];

// ── Shared colourless Tricks ────────────────────────────────────────────────
export const SHARED_CARDS = [
  {
    id: 'neutral/torchlight', name: 'Torchlight', companion: 'neutral', type: ATTACK, rarity: Rarity.COMMON,
    cost: 1, target: Target.ENEMY, text: 'Deal {d} damage.',
    flavor: 'Batteries the size of your thumb. Courage the size of the room.',
    nums: { d: 8 }, effect: (c) => hit(c, N(c).d), upgrade: { nums: { d: 11 } },
  },
  {
    id: 'neutral/borrowed-courage', name: 'Borrowed Courage', companion: 'neutral', type: SKILL, rarity: Rarity.COMMON,
    cost: 0, target: Target.SELF, text: 'Gain {b} Guard.',
    flavor: 'Someone else was brave here once. Some of it is still lying around.',
    nums: { b: 5 }, effect: (c) => guard(c, N(c).b), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'neutral/quick-look', name: 'Quick Look', companion: 'neutral', type: SKILL, rarity: Rarity.COMMON,
    cost: 0, target: Target.NONE, exhaust: true, keywords: ['vanish'],
    text: 'Draw {n} Tricks. [Vanish].', flavor: 'Just a peek. Just one.',
    nums: { n: 2 }, effect: (c) => draw(c, N(c).n), upgrade: { nums: { n: 3 } },
  },
  {
    id: 'neutral/clumsy-swing', name: 'Clumsy Swing', companion: 'neutral', type: ATTACK, rarity: Rarity.UNCOMMON,
    cost: 1, target: Target.ALL_ENEMIES, text: 'Deal {d} damage to all enemies.',
    flavor: 'Aim is optional in a hallway this narrow.',
    nums: { d: 8 }, effect: (c) => hitAll(c, N(c).d), upgrade: { nums: { d: 11 } },
  },
  {
    id: 'neutral/dust-off', name: 'Dust Off', companion: 'neutral', type: SKILL, rarity: Rarity.UNCOMMON,
    cost: 1, target: Target.SELF, text: 'Remove a negative condition from yourself. Draw {n} Trick.',
    flavor: 'Shake it out and pretend it never happened.',
    nums: { n: 1 },
    effect: (c) => { removeOneDebuff(c); draw(c, N(c).n); },
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'neutral/second-wind', name: 'Second Wind', companion: 'neutral', type: SKILL, rarity: Rarity.UNCOMMON,
    cost: 1, target: Target.SELF, keywords: ['vanish'],
    text: '[Vanish] every Skill in your hand. Gain {b} Guard for each.',
    flavor: 'Trade the plan for the breath.',
    nums: { b: 5 },
    effect: (c) => { const sk = handOthers(c).filter(k => (k.def?.type || k.type) === SKILL); for (const k of sk) { c.exhaust(k); guard(c, N(c).b); } },
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'neutral/lucky-penny', name: 'Lucky Penny', companion: 'neutral', type: SKILL, rarity: Rarity.RARE,
    cost: 0, target: Target.SELF, exhaust: true, keywords: ['vanish'],
    text: 'Gain {n} Nerve. Draw {m0} Trick. [Vanish].',
    flavor: 'Heads up, in a house where nothing is.',
    nums: { n: 2, m0: 1 },
    effect: (c) => { energy(c, N(c).n); draw(c, N(c).m0); },
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'neutral/big-swing', name: 'Big Swing', companion: 'neutral', type: ATTACK, rarity: Rarity.RARE,
    cost: 3, target: Target.ENEMY, text: 'Deal {d} damage. Deal {m0} more for each other Trick in your hand.',
    flavor: 'Wind up. Commit. Do not look.',
    nums: { d: 16, m0: 4 },
    effect: (c) => hit(c, N(c).d + N(c).m0 * handOthers(c).length),
    upgrade: { nums: { d: 21, m0: 5 } },
  },
];

export const NEUTRAL_CARDS = [...STATUS_CARDS, ...CURSE_CARDS, ...SHARED_CARDS];
export default NEUTRAL_CARDS;
