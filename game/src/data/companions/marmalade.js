/**
 * Marmalade, the Ghost Cat.  OWNER: companion-cards.
 * Spec: docs/design/companions/01-marmalade.md
 *
 * Ghoststep · Haunt · Nine Lives · Zoomies · Untouched
 */
import { CardType, Rarity, Target } from '../schema.js';
import { STATUS_CARDS } from '../neutral.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE, RANDOM_ENEMY } = Target;
const SLUG = 'marmalade';

const N = U.N;
/** Every effect installs the companion's per-combat bookkeeping first. */
const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── mechanic helpers ────────────────────────────────────────────────────────
const LIVES = 'lives', GHOST = 'ghoststep', HAUNT = 'haunt';

const lives = (c) => U.res(c, LIVES);
/** Spend Lives. Returns true if the whole cost was paid. Fires the Nine Lives hook. */
function spendLife(c, n) {
  if (!U.spendRes(c, LIVES, n)) return false;
  if (U.once(c, 'lifeSpent')) U.fire(c, 'lifeSpent', { n });
  return true;
}
/** Gain Ghoststep. Fires the Haunted Housecat hook. */
function gainGhost(c, n) {
  if (n <= 0) return 0;
  const d = U.addRes(c, GHOST, n, 0, 9);
  if (d > 0) U.fire(c, 'ghoststepGained', { n: d });
  return d;
}
const ghost = (c) => U.res(c, GHOST);
const haunt = (c, t, n) => U.apply(c, t || c.target, HAUNT, n);
/** Does this enemy's current move deal damage? */
const willAttack = (c, e) => !!(e && (e.intent === 'attack' || e.intent === 'attackBig' || e.intent === 'attackDefend' || e.intent === 'attackBuff' || e.intent === 'attackDebuff'));
const anyAttacker = (c) => U.enemies(c).some(e => willAttack(c, e));
/** Install a Power: apply its marker status, then run its one-time wiring. */
function power(c, id, n, install) {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
}
const SPOOKED = STATUS_CARDS.find(k => k.id === 'status/spooked');
const WRONG_SIDE = STATUS_CARDS.find(k => k.id === 'status/wrong-side');

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s) => {
  const hp = () => (e.state?.player?.hp ?? e.player?.hp ?? 0);
  s.lastTurnEndHp = null;
  e.on('turn:start', () => {
    s.untouched = (s.lastTurnEndHp == null) ? true : hp() >= s.lastTurnEndHp;
    s.played = 0;
    s.exhaustAtTurnStart = (e.state?.exhaust || e.exhaust || []).length;
  });
  e.on('turn:end', () => { s.lastTurnEndHp = hp(); });
  // "I Meant to Do That" counts everything that left the hand this turn.
  e.on('discard', (ev) => { s.turnFlags.gone = (s.turnFlags.gone || 0) + (ev?.count || 1); });
});
/** Tricks discarded or Vanished so far this turn. */
function gone(c) {
  const s = U.mm(c);
  const ex = (c.e?.state?.exhaust || c.e?.exhaust || []).length;
  return (U.got(c, 'gone') || 0) + Math.max(0, ex - (s.exhaustAtTurnStart || 0));
}

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('ghoststepGained', 'marmalade/haunted-housecat', (c) => {
  const n = U.stacks(c, c.self, 'marmalade/haunted-housecat');
  const t = c.randomEnemy?.(); if (t) U.apply(c, t, HAUNT, 2 + n - 1);
});
U.onHook('lifeSpent', 'marmalade/nine-lives', (c) => {
  U.draw(c, 1); U.guard(c, 6 + (U.stacks(c, c.self, 'marmalade/nine-lives') - 1) * 4);
});
U.onHook('ghoststepConsumed', 'marmalade/always-lands', (c) => {
  if (U.once(c, 'alwaysLands')) U.guard(c, 8 + (U.stacks(c, c.self, 'marmalade/always-lands') - 1) * 4);
});
U.onHook('zoomiesTriggered', 'marmalade/endless-zoomies', (c) => {
  if (U.got(c, 'endlessZoomies') < 2) { U.bump(c, 'endlessZoomies'); U.draw(c, 1); }
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'marmalade/scratch', name: 'Scratch', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'Four small lines, straight through the wallpaper and whatever was behind it.',
    nums: { d: 6 }, effect: eff(c => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'marmalade/curl-up', name: 'Curl Up', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'A cat is mostly a defensive posture with fur on it.',
    nums: { b: 5 }, effect: eff(c => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'marmalade/boo', name: 'Boo!', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: [HAUNT], text: 'Apply {n} [Haunt].',
    flavor: 'She has been practising this in the hallway mirror.',
    nums: { n: 2 }, effect: eff(c => haunt(c, c.target, N(c).n)), upgrade: { nums: { n: 3 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'marmalade/spectral-scratch', name: 'Spectral Scratch', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['untouched'],
    text: 'Deal {d} damage. Deal {m0} more while [Untouched].',
    flavor: 'Nothing touched her, so she has energy to spare.',
    nums: { d: 6, m0: 4 },
    effect: eff(c => U.hit(c, N(c).d + (U.isUntouched(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 5 } },
  },
  {
    id: 'marmalade/paw-through', name: 'Paw Through', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, text: 'Deal {d} damage. Gain {b} Guard.',
    flavor: 'In, out, and back to a sitting position before the dust settles.',
    nums: { d: 6, b: 5 },
    effect: eff(c => { U.hit(c, N(c).d); U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 8, b: 7 } },
  },
  {
    id: 'marmalade/sneak-attack', name: 'Sneak Attack', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, text: 'Deal {d} damage. If this is the first Trick you played this turn, draw {n} Trick.',
    flavor: 'The trick is to already be there.',
    nums: { d: 4, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.playedThisTurn(c) <= 1) U.draw(c, N(c).n); }),
    upgrade: { nums: { d: 6, n: 1 } },
  },
  {
    id: 'marmalade/tail-flick', name: 'Tail Flick', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT], text: 'Deal {d} damage. Apply {n} [Haunt].',
    flavor: 'The tail does the haunting. The rest of her is just transport.',
    nums: { d: 5, n: 3 },
    effect: eff(c => { U.hit(c, N(c).d); haunt(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 7, n: 4 } },
  },
  {
    id: 'marmalade/startle', name: 'Startle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, text: 'Deal {d} damage. Apply {n} Weak.',
    flavor: 'She does not even mean it. She just appears.',
    nums: { d: 6, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); U.apply(c, c.target, 'weak', N(c).n); }),
    upgrade: { nums: { d: 8, n: 2 } },
  },
  {
    id: 'marmalade/wall-bounce', name: 'Wall Bounce', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: [GHOST],
    text: 'Deal {d} damage. If you have [Ghoststep], strike again.',
    flavor: 'Off the wainscoting, off the banister, off the enemy.',
    nums: { d: 6, hits: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (ghost(c) > 0) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 8, hits: 1 } },
  },
  {
    id: 'marmalade/moonlit-claw', name: 'Moonlit Claw', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['untouched'],
    text: 'Deal {d} damage. Costs {n} less while [Untouched].',
    flavor: 'Silver light does most of the sharpening.',
    nums: { d: 13, n: 1 },
    effect: eff(c => U.hit(c, N(c).d)),
    dynamicCost: (c) => Math.max(0, 2 - (U.isUntouched(c) ? 1 : 0)),
    upgrade: { nums: { d: 17, n: 1 } },
  },
  {
    id: 'marmalade/back-arched-swipe', name: 'Back-Arched Swipe', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, text: 'Deal {d} damage. Gain {b} Guard if the target intends to attack.',
    flavor: 'Twice her size and none of it real.',
    nums: { d: 6, b: 6 },
    effect: eff(c => { const t = c.target; U.hit(c, N(c).d); if (willAttack(c, t)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 8, b: 8 } },
  },
  {
    id: 'marmalade/quick-pounce', name: 'Quick Pounce', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['zoomies'],
    text: 'Deal {d} damage. [Zoomies]: deal {m0} more.',
    flavor: 'Third time in six seconds. She is warmed up now.',
    nums: { d: 5, m0: 6 },
    effect: eff(c => { const z = U.zoomies(c); if (z) U.fire(c, 'zoomiesTriggered', {}); U.hit(c, N(c).d + (z ? N(c).m0 : 0)); }),
    upgrade: { nums: { d: 7, m0: 8 } },
  },
  {
    id: 'marmalade/ghoststep', name: 'Ghoststep', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: [GHOST], text: 'Gain {n} [Ghoststep].',
    flavor: 'She steps sideways out of the moment the fist arrives.',
    nums: { n: 1 },
    effect: eff(c => gainGhost(c, N(c).n)),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'marmalade/slip-away', name: 'Slip Away', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, text: 'Gain {b} Guard. Gain {m0} more if any enemy intends to attack.',
    flavor: 'Where there was a cat there is now a slightly warm cushion.',
    nums: { b: 5, m0: 4 },
    effect: eff(c => U.guard(c, N(c).b + (anyAttacker(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 7, m0: 5 } },
  },
  {
    id: 'marmalade/fluff-up', name: 'Fluff Up', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Ninety percent air, one hundred percent commitment.',
    nums: { b: 8 }, effect: eff(c => U.guard(c, N(c).b)), upgrade: { nums: { b: 11 } },
  },
  {
    id: 'marmalade/watchful-eyes', name: 'Watchful Eyes', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, text: 'Draw {n} Tricks, then discard {m0} Trick.',
    flavor: 'Two lamps in the dark at the top of the stairs.',
    nums: { n: 3, m0: 1 },
    effect: eff(c => { U.draw(c, N(c).n); c.discard?.(N(c).m0, { choose: true }); }),
    upgrade: { nums: { n: 4, m0: 1 } },
  },
  {
    id: 'marmalade/catnap', name: 'Catnap', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, text: 'Gain {b} Guard. Draw {n} Tricks at the start of your next turn.',
    flavor: 'Eleven seconds. Fully restored.',
    nums: { b: 6, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); const n = N(c).n; U.nextTurn(c, (x) => U.draw(x, n)); }),
    upgrade: { nums: { b: 9, n: 1 } },
  },
  {
    id: 'marmalade/curious-paw', name: 'Curious Paw', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, exhaust: true, keywords: ['vanish'],
    text: 'Draw {n} Tricks. Discard {m0} Trick. [Vanish].',
    flavor: 'What is this? What is this? What is this?',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { U.draw(c, N(c).n); c.discard?.(N(c).m0, { choose: true }); }),
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'marmalade/hide-under-something', name: 'Hide Under Something', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, text: 'Gain {b} Guard. Your next Attack this turn costs {n} less.',
    flavor: 'The sideboard has never been so tactically important.',
    nums: { b: 6, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); U.applySelf(c, 'next-attack-discount', N(c).n); }),
    upgrade: { nums: { b: 9, n: 1 } },
  },
  {
    id: 'marmalade/nine-lived-nerve', name: 'Nine-Lived Nerve', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['lives'],
    text: 'Spend {m0} [Lives]. Gain {n} Pluck.',
    flavor: 'She has eight more. She has done the arithmetic.',
    nums: { m0: 1, n: 1 },
    effect: eff(c => { if (spendLife(c, N(c).m0)) U.energy(c, N(c).n); }),
    playable: (c) => U.res(c, LIVES) >= 1,
    upgrade: { nums: { m0: 1, n: 1, m1: 1 }, text: 'Spend {m0} [Lives]. Gain {n} Pluck. Draw {m1} Trick.' },
  },
  {
    id: 'marmalade/haunting-hiss', name: 'Haunting Hiss', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT], text: 'Apply {n} [Haunt].',
    flavor: 'A sound with a temperature.',
    nums: { n: 6 }, effect: eff(c => haunt(c, c.target, N(c).n)), upgrade: { nums: { n: 8 } },
  },
  {
    id: 'marmalade/knock-it-over', name: 'Knock It Over', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT],
    text: 'Remove {b} Guard from the target. Apply {n} [Haunt].',
    flavor: 'Direct eye contact the entire time.',
    nums: { b: 10, n: 3 },
    effect: eff(c => { c.removeBlock?.(c.target, N(c).b); haunt(c, c.target, N(c).n); }),
    upgrade: { nums: { b: 14, n: 4 } },
  },
  {
    id: 'marmalade/soft-landing', name: 'Soft Landing', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['untouched'],
    text: 'Gain {b} Guard. Gain {m0} more if [Untouched].',
    flavor: 'Every fall is a controlled descent if you are smug enough about it.',
    nums: { b: 5, m0: 6 },
    effect: eff(c => U.guard(c, N(c).b + (U.isUntouched(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 7, m0: 8 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (13) ──────────────────────────────────────────────────────────
  {
    id: 'marmalade/double-pounce', name: 'Double Pounce', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['zoomies'],
    text: 'Deal {d} damage {n} times. [Zoomies]: strike once more.',
    flavor: 'One for the noise. One for the principle.',
    nums: { d: 5, n: 2, hits: 2 },
    effect: eff(c => { const z = U.zoomies(c); if (z) U.fire(c, 'zoomiesTriggered', {}); U.hitN(c, N(c).d, N(c).n + (z ? 1 : 0)); }),
    upgrade: { nums: { d: 7, n: 2, hits: 2 } },
  },
  {
    id: 'marmalade/through-the-wall', name: 'Through the Wall', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, text: 'Deal {d} damage. Ignores Guard.',
    flavor: 'The wall is not an argument she recognises.',
    nums: { d: 9 },
    effect: eff(c => U.hit(c, N(c).d, { pierceBlock: true })),
    upgrade: { nums: { d: 12 } },
  },
  {
    id: 'marmalade/ambush-from-nowhere', name: 'Ambush from Nowhere', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: [GHOST],
    text: 'Deal {d} damage. Costs {n} less for each [Ghoststep] you have.',
    flavor: 'Nowhere is where she keeps most of herself.',
    nums: { d: 16, n: 1 },
    effect: eff(c => U.hit(c, N(c).d)),
    dynamicCost: (c) => Math.max(0, 2 - U.res(c, GHOST)),
    upgrade: { nums: { d: 20, n: 1 } },
  },
  {
    id: 'marmalade/rattle-the-chandelier', name: 'Rattle the Chandelier', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT],
    text: 'Deal {d} damage to all enemies. Apply {n} [Haunt] to the target.',
    flavor: 'Eleven hundred crystals and one extremely pleased cat.',
    nums: { d: 7, n: 4 },
    effect: eff(c => { U.hitAll(c, N(c).d); haunt(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 10, n: 5 } },
  },
  {
    id: 'marmalade/claw-from-beyond', name: 'Claw from Beyond', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['vanish'],
    text: 'Deal {d} damage. Deal {m0} more for each Trick that has [Vanish]ed this combat.',
    flavor: 'Everything she has spent is still out there, and it is still hers.',
    nums: { d: 4, m0: 2 },
    effect: eff(c => U.hit(c, N(c).d + N(c).m0 * U.vanishedCount(c))),
    upgrade: { nums: { d: 6, m0: 3 } },
  },
  {
    id: 'marmalade/frenzied-zoomies', name: 'Frenzied Zoomies', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['zoomies'],
    text: 'Deal {d} damage. [Zoomies]: return this to your hand. Once each turn.',
    flavor: 'AAAAAAAAA (affectionate)',
    nums: { d: 4 },
    effect: eff(c => {
      U.hit(c, N(c).d);
      if (U.zoomies(c)) { U.fire(c, 'zoomiesTriggered', {}); if (U.once(c, 'frenzied')) U.returnSelf(c); }
    }),
    upgrade: { nums: { d: 6 } },
  },
  {
    id: 'marmalade/shadow-swat', name: 'Shadow Swat', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: [GHOST],
    text: 'Deal {d} damage. If this defeats an enemy, gain {n} [Ghoststep].',
    flavor: 'She takes the shadow with her as a souvenir.',
    nums: { d: 9, n: 2 },
    effect: eff(c => { const t = c.target; U.hit(c, N(c).d); if (t && (t.hp <= 0 || t.dead)) gainGhost(c, N(c).n); }),
    upgrade: { nums: { d: 12, n: 2 } },
  },
  {
    id: 'marmalade/graveyard-pounce', name: 'Graveyard Pounce', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT],
    text: 'Deal {d} damage. Deal additional damage equal to the target’s [Haunt].',
    flavor: 'She lands on the part that was already frightened.',
    nums: { d: 6 },
    effect: eff(c => U.hit(c, N(c).d + U.stacks(c, c.target, HAUNT))),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: 'marmalade/hiss-and-hit', name: 'Hiss and Hit', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT],
    text: 'Deal {d} damage. The target loses Courage equal to half its [Haunt], rounded up. Its Haunt does not dissipate.',
    flavor: 'A reminder, not a resolution.',
    nums: { d: 7 },
    effect: eff(c => { const t = c.target; U.hit(c, N(c).d); const h = U.stacks(c, t, HAUNT); if (h > 0) c.loseHp?.(t, Math.ceil(h / 2)); }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'marmalade/ricochet-cat', name: 'Ricochet Cat', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: RANDOM_ENEMY, text: 'Deal {d} damage to a random enemy {n} times.',
    flavor: 'Floor, wall, ceiling, wall, floor, enemy, ceiling.',
    nums: { d: 4, n: 4, hits: 4 },
    effect: eff(c => U.hitRandomN(c, N(c).d, N(c).n)),
    upgrade: { nums: { d: 4, n: 6, hits: 6 } },
  },
  {
    id: 'marmalade/phantom-flurry', name: 'Phantom Flurry', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['zoomies'],
    text: 'Deal {d} damage once for each Trick you have played this turn, to a maximum of {n}.',
    flavor: 'Somewhere in there is a real cat.',
    nums: { d: 3, n: 5, hits: 3 },
    effect: eff(c => U.hitN(c, N(c).d, Math.max(1, Math.min(N(c).n, U.playedThisTurn(c))))),
    upgrade: { nums: { d: 4, n: 5, hits: 3 } },
  },
  {
    id: 'marmalade/pounce-on-the-weak', name: 'Pounce on the Weak', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, text: 'Deal {d} damage. Deal {m0} more if the target has any negative condition.',
    flavor: 'Cats are not cruel. Cats are efficient.',
    nums: { d: 6, m0: 7 },
    effect: eff(c => U.hit(c, N(c).d + (U.debuffCount(c, c.target) > 0 ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 9 } },
  },
  {
    id: 'marmalade/ninefold-scratch', name: 'Ninefold Scratch', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, text: 'Deal {d} damage {n} times.',
    flavor: 'One for every life, whether she is using them or not.',
    nums: { d: 2, n: 9, hits: 9 },
    effect: eff(c => U.hitN(c, N(c).d, N(c).n)),
    upgrade: { nums: { d: 3, n: 9, hits: 9 } },
  },

  // ── Skills (16) ───────────────────────────────────────────────────────────
  {
    id: 'marmalade/phase-out', name: 'Phase Out', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: [GHOST],
    text: 'Gain {n} [Ghoststep]. Draw {m0} fewer Tricks next turn.',
    flavor: 'Most of her is elsewhere and the rest is catching up.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { gainGhost(c, N(c).n); const m = N(c).m0; U.nextTurn(c, (x) => x.modifyDraw?.(-m)); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'marmalade/now-you-see-me', name: 'Now You See Me', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: [GHOST, 'vanish'],
    text: 'Gain {n} [Ghoststep]. [Vanish].',
    flavor: 'And then, unhelpfully, you do not.',
    nums: { n: 1 }, effect: eff(c => gainGhost(c, N(c).n)), upgrade: { nums: { n: 2 } },
  },
  {
    id: 'marmalade/nope', name: 'Nope.', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, text: 'Prevent the next {n} negative conditions an enemy would apply to you this turn.',
    flavor: 'She simply declines.',
    nums: { n: 1 }, effect: eff(c => U.applySelf(c, 'nope', N(c).n)), upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'marmalade/curiosity', name: 'Curiosity', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, text: 'Draw {n} Tricks. Add {m0} Spooked to your discard pile.',
    flavor: 'Worth it. Probably worth it.',
    nums: { n: 3, m0: 1 },
    effect: eff(c => { U.draw(c, N(c).n); for (let i = 0; i < N(c).m0; i++) U.spawn(c, SPOOKED, 'discard'); }),
    upgrade: { nums: { n: 4, m0: 1 } },
  },
  {
    id: 'marmalade/chase-the-light', name: 'Chase the Light', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, text: 'Draw {n} Tricks. Gain {m0} Pluck for each of them that costs 0.',
    flavor: 'The dot is on the wall. The dot is the enemy. The dot is everything.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => {
      const before = new Set(U.cardsIn(c, 'hand'));
      U.draw(c, N(c).n);
      for (const k of U.cardsIn(c, 'hand')) if (!before.has(k) && U.nowCost(k) === 0) U.energy(c, N(c).m0);
    }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'marmalade/steal-their-shadow', name: 'Steal Their Shadow', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: [HAUNT],
    text: 'Gain {b} Guard. Reduce the target’s Strength by {n}. Apply {m0} [Haunt] for each point removed.',
    flavor: 'It was not doing much for them anyway.',
    nums: { b: 6, n: 2, m0: 3 },
    effect: eff(c => { U.guard(c, N(c).b); U.apply(c, c.target, 'strength', -N(c).n); haunt(c, c.target, N(c).n * N(c).m0); }),
    upgrade: { nums: { b: 8, n: 3, m0: 3 } },
  },
  {
    id: 'marmalade/hairball', name: 'Hairball', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, text: 'Apply {n} Weak and {m0} Vulnerable.',
    flavor: 'Delivered onto the good rug, as tradition demands.',
    nums: { n: 3, m0: 3 },
    effect: eff(c => { U.apply(c, c.target, 'weak', N(c).n); U.apply(c, c.target, 'vulnerable', N(c).m0); }),
    upgrade: { nums: { n: 4, m0: 4 } },
  },
  {
    id: 'marmalade/tripwire-tail', name: 'Tripwire Tail', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: [HAUNT],
    text: 'The next enemy to attack you this turn gains {n} [Haunt].',
    flavor: 'She leaves it lying across the doorway like she forgot it there.',
    nums: { n: 10 },
    effect: eff(c => { const n = N(c).n; const off = c.e?.on?.('damage', (ev) => { if (ev?.source && ev?.targetIsPlayer) { U.apply(c, ev.source, HAUNT, n); if (typeof off === 'function') off(); } }); U.applySelf(c, 'tripwire-tail', n); }),
    upgrade: { nums: { n: 14 } },
  },
  {
    id: 'marmalade/perch-up-high', name: 'Perch Up High', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: [GHOST],
    text: 'Gain {b} Guard. Gain {n} [Ghoststep] at the start of your next turn.',
    flavor: 'From up here the whole fight is just furniture.',
    nums: { b: 14, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); const n = N(c).n; U.nextTurn(c, (x) => gainGhost(x, n)); }),
    upgrade: { nums: { b: 18, n: 2 } },
  },
  {
    id: 'marmalade/hide-and-seek', name: 'Hide and Seek', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: [GHOST],
    text: 'Choose one: gain {n} [Ghoststep]; draw {m0} Tricks; or gain {b} Guard.',
    flavor: 'She is winning. She is always winning. Nobody else is playing.',
    nums: { n: 1, m0: 2, b: 9 },
    effect: eff(c => U.chooseOne(c, [
      { label: 'Ghoststep', fn: (x) => gainGhost(x, N(x).n) },
      { label: 'Draw', fn: (x) => U.draw(x, N(x).m0) },
      { label: 'Guard', fn: (x) => U.guard(x, N(x).b) },
    ])),
    upgrade: { nums: { n: 2, m0: 3, b: 13 } },
  },
  {
    id: 'marmalade/borrowed-life', name: 'Borrowed Life', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['lives'],
    text: 'Spend {m0} [Lives]. Draw {n} Tricks.',
    flavor: 'Against future earnings.',
    nums: { m0: 1, n: 2 },
    effect: eff(c => { if (spendLife(c, N(c).m0)) U.draw(c, N(c).n); }),
    playable: (c) => U.res(c, LIVES) >= 1,
    upgrade: { nums: { m0: 1, n: 3 } },
  },
  {
    id: 'marmalade/second-chance', name: 'Second Chance', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['lives', 'vanish'],
    text: 'Spend {m0} [Lives]. Return a Trick that [Vanish]ed this combat to your hand.',
    flavor: 'She goes back for it. She always goes back for it.',
    nums: { m0: 1 },
    effect: eff(async c => { if (!spendLife(c, N(c).m0)) return; const [k] = await U.pickCards(c, { pile: 'exhaust', count: 1, prompt: 'Return a Vanished Trick' }); U.toHand(c, k); }),
    playable: (c) => U.res(c, LIVES) >= 1,
    upgrade: { cost: 0, nums: { m0: 1 } },
  },
  {
    id: 'marmalade/leave-a-life-behind', name: 'Leave a Life Behind', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, exhaust: true, keywords: ['lives', 'vanish'],
    text: 'Spend {m0} [Lives]. Gain {b} Guard. [Vanish].',
    flavor: 'One of her stays to take the hit. She is fine about it.',
    nums: { m0: 1, b: 24 },
    effect: eff(c => { if (spendLife(c, N(c).m0)) U.guard(c, N(c).b); }),
    playable: (c) => U.res(c, LIVES) >= 1,
    upgrade: { nums: { m0: 1, b: 32 } },
  },
  {
    id: 'marmalade/impossible-squeeze', name: 'Impossible Squeeze', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['vanish'],
    text: '[Vanish] another Trick in your hand. Draw {n} Trick.',
    flavor: 'The gap is four centimetres. The cat is not.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Vanish a Trick' }); if (k) { c.exhaust?.(k); U.draw(c, N(c).n); } }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'marmalade/midnight-grooming', name: 'Midnight Grooming', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, text: 'Remove a negative condition from yourself. Gain {b} Guard.',
    flavor: 'Whatever it was, it is not on her any more.',
    nums: { b: 8 },
    effect: eff(c => { c.removeDebuff?.(c.self, 1); U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 12 } },
  },
  {
    id: 'marmalade/nine-lives-nine-plans', name: 'Nine Lives, Nine Plans', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['lives', HAUNT],
    text: 'Choose one: gain {b} Guard; draw {n} Tricks; apply {m0} [Haunt]; or gain {m1} Pluck. Spend {m2} [Lives] to choose two.',
    flavor: 'Plan one through eight are variations on hiding.',
    nums: { b: 10, n: 2, m0: 6, m1: 1, m2: 1 },
    effect: eff(async c => {
      const opts = [
        { label: 'Guard', fn: (x) => U.guard(x, N(x).b) },
        { label: 'Draw', fn: (x) => U.draw(x, N(x).n) },
        { label: 'Haunt', fn: (x) => haunt(x, x.target || x.randomEnemy?.(), N(x).m0) },
        { label: 'Pluck', fn: (x) => U.energy(x, N(x).m1) },
      ];
      const two = U.res(c, LIVES) >= N(c).m2 && spendLife(c, N(c).m2);
      await U.chooseOne(c, opts, two ? 2 : 1);
    }),
    upgrade: { nums: { b: 13, n: 3, m0: 8, m1: 1, m2: 1 } },
  },

  // ── Powers (6) ────────────────────────────────────────────────────────────
  {
    id: 'marmalade/ghost-in-the-rafters', name: 'Ghost in the Rafters', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['untouched', 'retain'],
    text: 'While [Untouched], [Retain] {n} Trick at the end of your turn.',
    flavor: 'She sleeps up there. She has opinions up there.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'marmalade/ghost-in-the-rafters', N(c).n, (x) => {
      x.e?.on?.('turn:end', () => {
        if (!U.isUntouched(x)) return;
        const n = U.stacks(x, x.self, 'marmalade/ghost-in-the-rafters');
        U.cardsIn(x, 'hand').slice(0, n).forEach(k => U.retain(x, k));
      });
    })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'marmalade/poltercat', name: 'Poltercat', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: [HAUNT],
    text: 'Whenever an enemy buffs itself, apply {n} [Haunt] to it.',
    flavor: 'Confidence is a provocation.',
    nums: { n: 4 },
    effect: eff(c => power(c, 'marmalade/poltercat', N(c).n, (x) => {
      x.e?.on?.('status', (ev) => {
        if (!ev || ev.kind !== 'buff' || ev.targetIsPlayer) return;
        U.apply(x, ev.target, HAUNT, 4 + (U.stacks(x, x.self, 'marmalade/poltercat') - 1) * 2);
      });
    })),
    upgrade: { nums: { n: 6 } },
  },
  {
    id: 'marmalade/always-lands', name: 'Always Lands on Her Feet', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: [GHOST],
    text: 'The first time each turn your [Ghoststep] is consumed, gain {b} Guard.',
    flavor: 'Physics files a complaint. Physics is ignored.',
    nums: { b: 8 },
    effect: eff(c => power(c, 'marmalade/always-lands', 1)),
    upgrade: { nums: { b: 12 } },
  },
  {
    id: 'marmalade/predators-patience', name: 'Predator’s Patience', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['untouched'],
    text: 'At the start of your turn, if you were [Untouched], your Attacks deal {n} more damage for the rest of combat.',
    flavor: 'Forty minutes of stillness. Then the shelf.',
    nums: { n: 2 },
    effect: eff(c => power(c, 'marmalade/predators-patience', N(c).n, (x) => {
      x.e?.on?.('turn:start', () => { if (U.isUntouched(x)) U.applySelf(x, 'predators-patience', U.stacks(x, x.self, 'marmalade/predators-patience')); });
    })),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'marmalade/haunted-housecat', name: 'Haunted Housecat', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: [GHOST, HAUNT],
    text: 'Whenever you gain [Ghoststep], apply {n} [Haunt] to a random enemy.',
    flavor: 'Being hard to hit is, itself, unsettling.',
    nums: { n: 2 },
    effect: eff(c => power(c, 'marmalade/haunted-housecat', 1)),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'marmalade/zoomies-at-midnight', name: 'Zoomies at Midnight', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['zoomies'],
    text: 'The first Trick each turn that activates [Zoomies] costs {n} less.',
    flavor: '2:14 a.m. Every night. No known cause.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'marmalade/zoomies-at-midnight', N(c).n, (x) => {
      x.e?.on?.('turn:start', () => { U.applySelf(x, 'zoomies-discount', U.stacks(x, x.self, 'marmalade/zoomies-at-midnight')); });
    })),
    upgrade: { nums: { n: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ───────────────────────────────────────────────────────────
  {
    id: 'marmalade/final-pounce', name: 'Final Pounce', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['untouched'],
    text: 'Deal {d} damage. Deal {m0} more while [Untouched].',
    flavor: 'She has been sitting perfectly still for four turns. This is why.',
    nums: { d: 12, m0: 14 },
    effect: eff(c => U.hit(c, N(c).d + (U.isUntouched(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 16, m0: 18 } },
  },
  {
    id: 'marmalade/nine-lives-fury', name: 'Nine Lives’ Fury', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['lives'],
    text: 'Spend up to {m0} [Lives]. Deal {d} damage for each Life spent.',
    flavor: 'All of them are angry. All of them arrive at once.',
    nums: { d: 9, m0: 3, hits: 3 },
    effect: eff(c => { let n = 0; while (n < N(c).m0 && spendLife(c, 1)) n++; U.hitN(c, N(c).d, n); }),
    upgrade: { nums: { d: 10, m0: 4, hits: 4 } },
  },
  {
    id: 'marmalade/across-the-veil', name: 'Across the Veil', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: [GHOST],
    text: 'Deal {d} damage. Ignores Guard. Gain {n} [Ghoststep].',
    flavor: 'She reaches through from the other side of the wallpaper.',
    nums: { d: 18, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d, { pierceBlock: true }); gainGhost(c, N(c).n); }),
    upgrade: { nums: { d: 23, n: 2 } },
  },
  {
    id: 'marmalade/everywhere-at-once', name: 'Everywhere at Once', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: [GHOST],
    text: 'Deal {d} damage to all enemies. Repeat once for each [Ghoststep] you have, to a maximum of {n} repeats.',
    flavor: 'There is one cat. There has only ever been one cat.',
    nums: { d: 8, n: 3, hits: 2 },
    effect: eff(c => U.hitAllN(c, N(c).d, 1 + Math.min(N(c).n, U.res(c, GHOST)))),
    upgrade: { nums: { d: 10, n: 3, hits: 2 } },
  },
  {
    id: 'marmalade/claws-in-the-dark', name: 'Claws in the Dark', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: [HAUNT],
    text: 'Deal {d} damage. Deal {m0} more for each [Haunt] on the target, then remove all of it.',
    flavor: 'Everything it has been afraid of, delivered at once.',
    nums: { d: 6, m0: 2 },
    effect: eff(c => { const t = c.target, h = U.stacks(c, t, HAUNT); U.hit(c, N(c).d + N(c).m0 * h); U.unapply(c, t, HAUNT, h); }),
    upgrade: { nums: { d: 8, m0: 3 } },
  },
  {
    id: 'marmalade/spectral-stampede', name: 'Spectral Stampede', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: RANDOM_ENEMY, text: 'Deal {d} damage to a random enemy {n} times.',
    flavor: 'Every cat that has ever lived in this house, briefly, all at once.',
    nums: { d: 6, n: 6, hits: 6 },
    effect: eff(c => U.hitRandomN(c, N(c).d, N(c).n)),
    upgrade: { nums: { d: 6, n: 8, hits: 8 } },
  },
  {
    id: 'marmalade/the-last-thing-they-see', name: 'The Last Thing They See', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, text: 'Deal {d} damage. If the target has {n} or less Courage, defeat it instead. Bosses are immune.',
    flavor: 'Two amber circles and then nothing at all.',
    nums: { d: 12, n: 25 },
    effect: eff(c => {
      const t = c.target;
      if (t && t.tier !== 'boss' && (t.hp ?? 999) <= N(c).n) { c.loseHp?.(t, t.hp); return; }
      U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 16, n: 35 } },
  },
  {
    id: 'marmalade/catastrophe', name: 'Catastrophe', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: -1, target: RANDOM_ENEMY, keywords: ['zoomies'],
    text: 'Spend all your Pluck. Deal {d} damage to a random enemy {n} times for each Pluck spent.',
    flavor: 'Cat-astrophe. She is very proud of it.',
    nums: { d: 6, n: 2, hits: 6 },
    effect: eff(c => U.hitRandomN(c, N(c).d, N(c).n * (c.x || 0))),
    upgrade: { nums: { d: 8, n: 2, hits: 6 } },
  },

  // ── Skills (12) ───────────────────────────────────────────────────────────
  {
    id: 'marmalade/spend-a-life', name: 'Spend a Life', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, keywords: ['lives', GHOST],
    text: 'Spend {m0} [Lives]. Choose one: gain {n} Pluck; draw {m1} Tricks; gain {m2} [Ghoststep]; or gain {b} Guard.',
    flavor: 'Nine is a budget, not a promise.',
    nums: { m0: 1, n: 2, m1: 3, m2: 2, b: 16 },
    effect: eff(async c => {
      if (!spendLife(c, N(c).m0)) return;
      await U.chooseOne(c, [
        { label: 'Pluck', fn: (x) => U.energy(x, N(x).n) },
        { label: 'Draw', fn: (x) => U.draw(x, N(x).m1) },
        { label: 'Ghoststep', fn: (x) => gainGhost(x, N(x).m2) },
        { label: 'Guard', fn: (x) => U.guard(x, N(x).b) },
      ]);
    }),
    playable: (c) => U.res(c, LIVES) >= 1,
    upgrade: { nums: { m0: 1, n: 2, m1: 4, m2: 3, b: 22 } },
  },
  {
    id: 'marmalade/come-back-wrong', name: 'Come Back Wrong', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['lives', 'vanish'],
    text: 'Spend {m0} [Lives]. Heal {n} Courage and gain {b} Guard. Add {m1} Wrong Side to your draw pile. [Vanish].',
    flavor: 'Everything is where it should be. Nothing is quite the right way round.',
    nums: { m0: 3, n: 20, b: 20, m1: 2 },
    effect: eff(c => { if (!spendLife(c, N(c).m0)) return; U.mend(c, N(c).n); U.guard(c, N(c).b); for (let i = 0; i < N(c).m1; i++) U.spawn(c, WRONG_SIDE, 'draw', { shuffle: true }); }),
    playable: (c) => U.res(c, LIVES) >= 3,
    upgrade: { nums: { m0: 3, n: 28, b: 26, m1: 2 } },
  },
  {
    id: 'marmalade/not-dead-yet', name: 'Not Dead Yet', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['lives'],
    text: 'The next time your Courage would reach 0 this turn, spend {m0} [Lives] and survive with {n} Courage instead.',
    flavor: 'Technically inaccurate. Emotionally correct.',
    nums: { m0: 3, n: 1 },
    effect: eff(c => U.applySelf(c, 'not-dead-yet', 1)),
    upgrade: { cost: 0, nums: { m0: 3, n: 1 } },
  },
  {
    id: 'marmalade/walk-between-rooms', name: 'Walk Between Rooms', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: [GHOST],
    text: 'Discard your hand, then draw that many Tricks. Gain {n} [Ghoststep].',
    flavor: 'She goes in the study door and comes out of the pantry.',
    nums: { n: 1 },
    effect: eff(c => { const k = U.handOthers(c).length; c.discard?.(k, { all: true }); U.draw(c, k); gainGhost(c, N(c).n); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'marmalade/curiosity-killed-the-cat', name: 'Curiosity Killed the Cat', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE,
    text: 'Draw until your hand is full. At the end of your turn, lose {n} Courage for each Trick drawn this way still in your hand.',
    flavor: 'She knows. She is going in anyway.',
    nums: { n: 3 },
    effect: eff(c => {
      const cap = (c.e?.state?.handSize ?? 10) - U.cardsIn(c, 'hand').length;
      U.draw(c, Math.max(0, cap));
      const marked = U.cardsIn(c, 'hand').slice();
      const n = N(c).n;
      U.atTurnEnd(c, (x) => { const left = U.cardsIn(x, 'hand'); const still = marked.filter(k => left.includes(k)).length; U.bleed(x, still * n); });
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'marmalade/but-satisfaction-brought-it-back', name: 'But Satisfaction Brought It Back', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['vanish'],
    text: 'Return {n} Tricks that [Vanish]ed this combat to your hand. They cost {m0} less this turn.',
    flavor: 'It always comes back. That is the whole problem with cats.',
    nums: { n: 3, m0: 1 },
    effect: eff(async c => {
      const ks = await U.pickCards(c, { pile: 'exhaust', count: N(c).n, prompt: 'Return Vanished Tricks' });
      for (const k of ks) { U.toHand(c, k); U.costMod(c, k, -N(c).m0, 'turn'); }
    }),
    upgrade: { nums: { n: 4, m0: 1 } },
  },
  {
    id: 'marmalade/steal-a-turn', name: 'Steal a Turn', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: ENEMY, exhaust: true, keywords: [HAUNT, 'vanish'],
    text: 'Cancel the target’s current action. Apply {n} [Haunt]. [Vanish].',
    flavor: 'It was going to do something. Now it is thinking about a cat instead.',
    nums: { n: 6 },
    effect: eff(c => { c.cancelIntent?.(c.target); haunt(c, c.target, N(c).n); }),
    upgrade: { cost: 2, nums: { n: 6 } },
  },
  {
    id: 'marmalade/perfect-landing', name: 'Perfect Landing', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['untouched'],
    text: 'Gain {b} Guard. If [Untouched], gain {m0} more and draw {n} Tricks.',
    flavor: 'Stuck it. Walks off as if nothing happened.',
    nums: { b: 8, m0: 16, n: 2 },
    effect: eff(c => { const u = U.isUntouched(c); U.guard(c, N(c).b + (u ? N(c).m0 : 0)); if (u) U.draw(c, N(c).n); }),
    upgrade: { nums: { b: 11, m0: 20, n: 2 } },
  },
  {
    id: 'marmalade/haunt-the-whole-room', name: 'Haunt the Whole Room', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: [HAUNT],
    text: 'Apply {n} [Haunt] to all enemies.',
    flavor: 'Every corner of it. Even the corners that were fine.',
    nums: { n: 12 }, effect: eff(c => U.applyAll(c, HAUNT, N(c).n)), upgrade: { nums: { n: 16 } },
  },
  {
    id: 'marmalade/disappearing-act', name: 'Disappearing Act', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: [GHOST, 'vanish'],
    text: '[Vanish] your hand. Draw that many Tricks plus {m0}. Gain {n} [Ghoststep].',
    flavor: 'A whole cat, gone, in a room with one door and no windows.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { const h = U.handOthers(c); for (const k of h) c.exhaust?.(k); U.draw(c, h.length + N(c).m0); gainGhost(c, N(c).n); }),
    upgrade: { nums: { n: 3, m0: 2 } },
  },
  {
    id: 'marmalade/i-meant-to-do-that', name: 'I Meant to Do That', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['vanish'],
    text: 'Gain {b} Guard for each Trick you discarded or [Vanish]ed this turn. Draw {n} Tricks if that is at least {m0}.',
    flavor: 'She absolutely did not mean to do that.',
    nums: { b: 5, n: 2, m0: 3 },
    effect: eff(c => { const k = gone(c); U.guard(c, N(c).b * k); if (k >= N(c).m0) U.draw(c, N(c).n); }),
    upgrade: { nums: { b: 7, n: 2, m0: 3 } },
  },
  {
    id: 'marmalade/all-nine', name: 'All Nine', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['lives', 'vanish'],
    text: 'Restore your [Lives] to {n}. [Vanish].',
    flavor: 'All of them come back at once and they are all annoyed.',
    nums: { n: 9 },
    effect: eff(c => U.setRes(c, LIVES, N(c).n, 0, 9)),
    upgrade: { cost: 1, nums: { n: 9 } },
  },

  // ── Powers (5) ────────────────────────────────────────────────────────────
  {
    id: 'marmalade/nine-lives', name: 'Nine Lives', companion: SLUG, type: POWER, rarity: RARE,
    cost: 1, target: SELF, keywords: ['lives'],
    text: 'The first [Lives] you spend each turn also draws {n} Trick and gains {b} Guard.',
    flavor: 'Spending one is only expensive if you were counting.',
    nums: { n: 1, b: 6 },
    effect: eff(c => power(c, 'marmalade/nine-lives', 1)),
    upgrade: { nums: { n: 1, b: 10 } },
  },
  {
    id: 'marmalade/untouchable', name: 'Untouchable', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['untouched'],
    text: 'At the start of your turn, gain a Perfect Streak if you were [Untouched], otherwise lose all of them. Your Attacks deal {n} more damage and you gain {b} Guard for each Streak.',
    flavor: 'Four turns without a scratch. Nobody in the room is comfortable.',
    nums: { n: 2, b: 3 },
    effect: eff(c => {
      const dmg = N(c).n, blk = N(c).b;
      power(c, 'marmalade/untouchable', 1, (x) => {
        x.e?.on?.('turn:start', () => {
          if (!U.isUntouched(x)) { U.setRes(x, 'untouched-streak', 0); return; }
          U.addRes(x, 'untouched-streak', 1, 0, 99);
          const s = U.res(x, 'untouched-streak');
          U.applySelf(x, 'predators-patience', dmg);
          U.guard(x, blk * s);
        });
      });
    }),
    upgrade: { nums: { n: 3, b: 4 } },
  },
  {
    id: 'marmalade/queen-of-the-rafters', name: 'Queen of the Rafters', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['retain'],
    text: 'At the end of your turn, [Retain] a Trick of your choice. It costs {n} less next turn.',
    flavor: 'She has claimed the beam over the stairwell. It is hers now.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'marmalade/queen-of-the-rafters', N(c).n, (x) => {
      x.e?.on?.('turn:end', async () => {
        const [k] = await U.pickCards(x, { pile: 'hand', count: 1, prompt: 'Retain a Trick' });
        if (k) { U.retain(x, k); U.costMod(x, k, -U.stacks(x, x.self, 'marmalade/queen-of-the-rafters'), 'turn'); }
      });
    })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'marmalade/permanent-haunting', name: 'Permanent Haunting', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: [HAUNT],
    text: '[Haunt] loses only {n} stack when it triggers instead of half.',
    flavor: 'It does not fade. It settles in and unpacks.',
    nums: { n: 1 },
    effect: eff(c => { U.applySelf(c, 'slow-haunting', 1); power(c, 'marmalade/permanent-haunting', 1); }),
    upgrade: { cost: 1, nums: { n: 1 } },
  },
  {
    id: 'marmalade/endless-zoomies', name: 'Endless Zoomies', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['zoomies'],
    text: 'Whenever a Trick activates [Zoomies], draw {m0} Trick. Maximum {m1} times each turn.',
    flavor: 'It does not stop. It has never once stopped on its own.',
    nums: { m0: 1, m1: 2 },
    effect: eff(c => power(c, 'marmalade/endless-zoomies', 1)),
    upgrade: { nums: { m0: 1, m1: 3 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
export default {
  slug: SLUG,
  name: 'Marmalade',
  title: 'the Ghost Cat',
  region: 'foyer',
  identity:
    'Marmalade is the agile technical Companion. Her conventional Guard is unreliable and her ' +
    'straightforward damage is only moderate; what makes her terrifying is that she avoids attacks ' +
    'outright with Ghoststep, punishes anything that swings at her with Haunt, spends her nine Lives ' +
    'for bursts of power she can never fully get back, and chains long strings of cheap Tricks into ' +
    'Zoomies turns. Staying Untouched ties all of it together — it makes her expensive attacks cheaper ' +
    'and larger, and every one of her mechanics is a way of arranging for the enemy to hit nothing. ' +
    'A new player thinks this cat is hard to hit. An experienced player knows exactly what the enemies ' +
    'will do for two turns, knows they will connect with nothing, and knows that this is what kills them.',
  strengths: [
    'High card mobility and strong draw',
    'Exceptional protection against single large attacks',
    'Powerful reactive damage through Haunt',
    'Excellent zero and low cost chains',
    'Converts defence into offence',
    'Several ways to recover from a disastrous turn',
  ],
  weaknesses: [
    'Unreliable conventional Guard',
    'Multi-hit attacks strip Ghoststep quickly',
    'Limited straightforward heavy damage',
    'Several builds need real setup',
    'Lives are finite within a combat and do not return',
    'Haunt is poor against enemies that rarely attack',
    'Zoomies chokes on Status cards',
  ],
  startingHp: 68,
  startingEnergy: 3,
  mechanics: {
    ghoststep: {
      name: 'Ghoststep', kind: 'status', desc: 'Each stack prevents the next hit of enemy Attack damage entirely. Unused Ghoststep expires at the end of the enemy turn. Not Guard — one stack eats a 30 damage hit, six small hits eat six stacks.',
      min: 0, max: 9, hooks: ['modifyDamageTaken', 'ghoststepGained', 'ghoststepConsumed'],
    },
    haunt: {
      name: 'Haunt', kind: 'status', desc: 'When a Haunted enemy takes a damaging action it loses Courage equal to its Haunt, then loses half its Haunt, rounded up.',
      min: 0, max: 99, hooks: ['onAttack'],
    },
    lives: {
      name: 'Nine Lives', kind: 'resource', desc: 'Marmalade starts every combat with 9 Lives. Tricks spend them for bursts of power. They do not regenerate until the next battle.',
      min: 0, max: 9, hooks: ['lifeSpent'],
    },
    zoomies: {
      name: 'Zoomies', kind: 'system', desc: 'A Zoomies clause activates when its Trick is the third or later Trick played this turn.',
      min: 3, max: 99, hooks: ['zoomiesTriggered'],
    },
    untouched: {
      name: 'Untouched', kind: 'system', desc: 'Active while Marmalade lost no Courage during the previous enemy turn.',
      min: 0, max: 1, hooks: ['turn:start'],
    },
  },
  startingDeck: [
    'marmalade/scratch', 'marmalade/scratch', 'marmalade/scratch', 'marmalade/scratch', 'marmalade/scratch',
    'marmalade/curl-up', 'marmalade/curl-up', 'marmalade/curl-up', 'marmalade/curl-up',
    'marmalade/boo',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  archetypes: [
    {
      name: 'Ghoststep & Untouched',
      desc: 'Avoid damage entirely, stay Untouched, and cash that state in for cheaper and larger attacks. Escalating rewards for consecutive perfect enemy turns. Loses to multi-hit attackers and non-Attack damage.',
      coreCards: ['marmalade/ghoststep', 'marmalade/soft-landing', 'marmalade/moonlit-claw', 'marmalade/ambush-from-nowhere', 'marmalade/perch-up-high', 'marmalade/predators-patience', 'marmalade/final-pounce', 'marmalade/untouchable', 'marmalade/perfect-landing'],
    },
    {
      name: 'Haunt',
      desc: 'Load enemies up, invite them to swing, and stand behind Ghoststep while they take themselves apart. Claws in the Dark converts a stack into burst when you need it now. Loses to defensive and buff-focused enemies.',
      coreCards: ['marmalade/boo', 'marmalade/haunting-hiss', 'marmalade/tail-flick', 'marmalade/tripwire-tail', 'marmalade/graveyard-pounce', 'marmalade/poltercat', 'marmalade/haunted-housecat', 'marmalade/claws-in-the-dark', 'marmalade/haunt-the-whole-room', 'marmalade/permanent-haunting'],
    },
    {
      name: 'Nine Lives',
      desc: 'Treat the nine Lives as a second resource pool — spend for Pluck, cards, defence and enormous attacks, or hoard them for the boss. All Nine and Come Back Wrong build a deck around burning through and recovering them. Loses when you simply run out.',
      coreCards: ['marmalade/nine-lived-nerve', 'marmalade/borrowed-life', 'marmalade/leave-a-life-behind', 'marmalade/spend-a-life', 'marmalade/nine-lives-fury', 'marmalade/all-nine', 'marmalade/nine-lives', 'marmalade/not-dead-yet', 'marmalade/come-back-wrong'],
    },
    {
      name: 'Zoomies',
      desc: 'Cheap Tricks, draw, discard, Vanish, repeated small attacks, and payoffs for playing three, four, five or six Tricks in one turn. The screen should explode into frantic cat. Loses to Status cards and expensive hands.',
      coreCards: ['marmalade/sneak-attack', 'marmalade/quick-pounce', 'marmalade/frenzied-zoomies', 'marmalade/curious-paw', 'marmalade/double-pounce', 'marmalade/phantom-flurry', 'marmalade/zoomies-at-midnight', 'marmalade/endless-zoomies', 'marmalade/catastrophe'],
    },
    {
      name: 'Hybrid Ghost Cat',
      desc: 'The strongest decks combine systems: Ghoststep to stay Untouched, a cheap Pounce into a Zoomies chain, Haunt applied on the way through, then the enemy swings, hits nothing, and hurts itself.',
      coreCards: ['marmalade/spectral-scratch', 'marmalade/wall-bounce', 'marmalade/haunted-housecat', 'marmalade/always-lands', 'marmalade/hide-and-seek', 'marmalade/across-the-veil', 'marmalade/nine-lives-nine-plans'],
    },
  ],
};
