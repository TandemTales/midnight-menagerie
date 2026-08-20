/**
 * Status Tricks, Curses and shared colourless Tricks.  OWNER: companion-cards.
 *
 * Status cards are junk the enemy puts in your deck.  Curses are permanent junk.
 * Shared Tricks belong to no Companion and appear in shops, Curiosities and
 * colourless rewards.
 */
import { CardType, Rarity, Target } from './schema.js';
import { guard, draw, hit, hitAll, energy, N, cardsIn, handOthers, bleed, applySelf, removeOneDebuff } from './companions/_util.js';

const STATUS = CardType.STATUS, CURSE = CardType.CURSE, ATTACK = CardType.ATTACK, SKILL = CardType.SKILL;

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
    nums: { n: 2 }, effect: (c) => bleed(c, N(c).n), upgrade: { nums: { n: 4 }, text: 'Unplayable. At the end of your turn, lose {n} Courage.' },
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
    nums: { n: 1 }, effect: (c) => energy(c, -N(c).n), upgrade: { text: 'Unplayable. [Ethereal]. When drawn, lose {n} Nerve.' },
  },
  {
    id: 'status/wrong-side', name: 'Wrong Side', companion: 'status', type: STATUS, rarity: Rarity.SPECIAL,
    cost: -2, target: Target.NONE, unplayable: true, ethereal: true, keywords: ['ethereal'],
    text: 'Unplayable. [Ethereal]. When drawn, lose {n} Courage.',
    flavor: 'You came back. Most of you.',
    nums: { n: 3 }, effect: (c) => bleed(c, N(c).n), upgrade: { text: 'Unplayable. [Ethereal]. When drawn, lose {n} Courage.' },
  },
];

// ── Curses ──────────────────────────────────────────────────────────────────
export const CURSE_CARDS = [
  {
    id: 'curse/regret', name: 'Regret', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, lose {n} Courage for each Trick in your hand.',
    flavor: 'You should have taken the other door.',
    nums: { n: 1 }, effect: (c) => bleed(c, N(c).n * cardsIn(c, 'hand').length), upgrade: { text: 'Unplayable. At the end of your turn, lose {n} Courage for each Trick in your hand.' },
  },
  {
    id: 'curse/bad-luck', name: 'Bad Luck', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, gain {n} Weak.',
    flavor: 'Thirteen stairs. Every time. You have counted.',
    nums: { n: 1 }, effect: (c) => applySelf(c, 'weak', N(c).n), upgrade: { text: 'Unplayable. At the end of your turn, gain {n} Weak.' },
  },
  {
    id: 'curse/clingy-shadow', name: 'Clingy Shadow', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. At the end of your turn, gain {n} Frail.',
    flavor: 'It is yours. It is just not doing what you are doing.',
    nums: { n: 1 }, effect: (c) => applySelf(c, 'frail', N(c).n), upgrade: { text: 'Unplayable. At the end of your turn, gain {n} Frail.' },
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
    nums: { n: 2 }, effect: (c) => bleed(c, N(c).n), upgrade: { text: 'Unplayable. At the end of your turn, lose {n} Courage.' },
  },
  {
    id: 'curse/night-terror', name: 'Night Terror', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true,
    text: 'Unplayable. While this is in your hand, lose {n} Courage whenever you play a Trick.',
    flavor: 'It is under the bed and it is doing the breathing on purpose.',
    nums: { n: 1 }, effect: (c) => bleed(c, N(c).n), upgrade: { text: 'Unplayable. While this is in your hand, lose {n} Courage whenever you play a Trick.' },
  },
  {
    id: 'curse/lost-mitten', name: 'Lost Mitten', companion: 'curse', type: CURSE, rarity: Rarity.CURSE,
    cost: -2, target: Target.NONE, unplayable: true, ethereal: true, keywords: ['ethereal'],
    text: 'Unplayable. [Ethereal]. While this is in your hand, you cannot play more than {n} Tricks each turn.',
    flavor: 'One mitten is worse than no mittens.',
    nums: { n: 3 }, effect: () => {}, upgrade: { text: 'Unplayable. [Ethereal]. While this is in your hand, you cannot play more than {n} Tricks each turn.' },
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
    effect: (c) => { const sk = handOthers(c).filter(k => (k.def?.type || k.type) === SKILL); for (const k of sk) { c.exhaust?.(k); guard(c, N(c).b); } },
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
    nums: { d: 14, m0: 4 },
    effect: (c) => hit(c, N(c).d + N(c).m0 * handOthers(c).length),
    upgrade: { nums: { d: 18, m0: 5 } },
  },
];

export const NEUTRAL_CARDS = [...STATUS_CARDS, ...CURSE_CARDS, ...SHARED_CARDS];
export default NEUTRAL_CARDS;
