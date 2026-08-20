/**
 * The Forgotten Nursery — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/02-nursery.md.
 *
 * Region thesis: "Damage changes things."
 * Enemies mend each other, cover one another, transfer damage, attach improvements,
 * lose pieces, and become different threats as they deteriorate. The Foyer taught you
 * to read one enemy's timing; the Nursery makes you read the formation as a machine.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, dmgTaken, hpFrac, cyc, countMoves, lastMove,
  hitPlayer, hauntBase, flag, isAlive, pct, intentOf, ATTACK_INTENTS,
} from './_lib.js';

const REGION = 'nursery';

// ─────────────────────────────────────────────────────────────────────────────
// Shared: the Porcelain crack ladder (Doll and both Twins use it)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Pristine above 2/3 Courage, Cracked between, Shattered at or below 1/3.
 * Expressed as fractions of max so it survives Haunt scaling and party scaling —
 * at the doc's 36 Courage these land exactly on the stated 24 and 12.
 */
export function crackState(actor, shatterFrac = 1 / 3) {
  const max = actor.maxHp || 1;
  const hp = actor.hp || 0;
  if (hp <= Math.round(max * shatterFrac)) return 'shattered';
  if (hp <= Math.round(max * (2 / 3))) return 'cracked';
  return 'pristine';
}
export const CRACK_DAMAGE = { pristine: 0, cracked: 3, shattered: 6 };

// ─────────────────────────────────────────────────────────────────────────────
// 1. Button Baby — support
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lesson: support enemies alter how another enemy should be evaluated. A weak Rocking
 * Horse with a Spring Button is suddenly the most dangerous thing in the room.
 */
export const BUTTONS = ['button-brass', 'button-pillow', 'button-spring'];

export const buttonBaby = {
  id: 'button-baby',
  name: 'Button Baby',
  region: REGION,
  tier: 'normal',
  role: 'introductory',
  hp: [21, 21],
  silhouette: 'button-doll',
  palette: ['#e0b7c4', '#f6e3d2', '#7a4f5c'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.75,
  lore: 'It has no buttons of its own left. It gave them all away, and it is still giving.',

  /** First ally without a Button. Button Baby can never be Buttoned itself. */
  buttonTarget(c) {
    return allies(c).find(a => a.id !== 'button-baby' && !BUTTONS.some(b => c.has(b, a))) || null;
  },

  /** Spring if it is about to swing, Pillow if it is hurt, otherwise Brass. */
  chooseButton(c, target) {
    const intent = intentOf(c, target);
    if (intent && ATTACK_INTENTS.has(intent)) return 'button-spring';
    if (hpFrac(target) < 0.5) return 'button-pillow';
    return 'button-brass';
  },

  onSpawn(c) {
    // Haunt 3: it arrives at advanced Scuffles with one Button already sewn on.
    if (flag(c, 'preSewn')) {
      const t = buttonBaby.buttonTarget(c);
      if (t) c.applyStatus(t, buttonBaby.chooseButton(c, t), 1);
    }
  },

  moves: {
    'sew-on': {
      id: 'sew-on', name: 'Sew On', intent: Intent.BUFF,
      tell: 'It selects a button, licks the thread, and reaches for a friend.',
      // Name the exact Button before it is sewn — which one it picks changes who the
      // player should be attacking this turn.
      appliesFn: (c) => {
        const t = buttonBaby.buttonTarget(c);
        return t ? [{ id: buttonBaby.chooseButton(c, t), stacks: 1, to: 'ally' }] : [];
      },
      effect(c) {
        const t = buttonBaby.buttonTarget(c);
        if (!t) return;
        c.applyStatus(t, buttonBaby.chooseButton(c, t), 1);
        if (mem(c).threaded) { c.block(t, 5); mem(c).threaded = false; }
      },
    },
    'button-toss': {
      id: 'button-toss', name: 'Button Toss', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'It flicks a brass button at you, hard.',
      effect(c) { hitPlayer(c, 5); },
    },
    'gather-thread': {
      id: 'gather-thread', name: 'Gather Thread', intent: Intent.DEFEND, block: 7,
      tell: 'It winds thread around itself until it is mostly thread.',
      effect(c) { c.block(c.self, 7); mem(c).threaded = true; },
    },
  },

  nextMove(c) {
    if (buttonBaby.buttonTarget(c)) return 'sew-on';
    return cyc(['button-toss', 'gather-thread', 'button-toss'], countMoves(c, ['button-toss', 'gather-thread']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.flags.preSewn = true;
      h.notes.push('Haunt 3: begins advanced Scuffles with one Button already attached to an ally.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Jack in the Box — telegraph
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Like Red Carpet Runner, but the disruption is a *counter* rather than a cancel:
 * strip the Guard that Turn the Handle granted and the box Jams, unwinding one Wound Up.
 * POP!'s intent reads 17 while its Guard stands and 12 the moment you break it.
 */
const POP_DAMAGE = [7, 12, 17, 17];

export const jackInTheBox = {
  id: 'jack-in-the-box',
  name: 'Jack in the Box',
  region: REGION,
  tier: 'normal',
  role: 'introductory',
  hp: [32, 32],
  silhouette: 'jackbox',
  palette: ['#3c6e8f', '#e8d24a', '#1f3a4a'],
  shape: { body: 'squat', limbs: 1, eyes: 2 },
  scale: 0.95,
  lore: 'The handle turns by itself now. Nobody has heard the tune it plays in a very long time.',

  maxWoundUp: 2,

  /** Wound Up it will actually POP with, accounting for a Jam the player has set up. */
  projectedWoundUp(c) {
    const w = cnt(c, 'wound-up');
    const jamming = mem(c).handleGuard && (c.self.block || 0) <= 0;
    return Math.max(0, w - (jamming ? 1 : 0));
  },

  onSpawn(c) { setCnt(c, 'wound-up', flag(c, 'startWoundUp', 0)); },

  onPlayerTurnEnd(c) {
    // Jammed: all Guard from Turn the Handle removed during the same player turn.
    if (mem(c).handleGuard && (c.self.block || 0) <= 0) {
      addCnt(c, 'wound-up', -1, 2, 0);
      mem(c).jammed = true;
    }
    mem(c).handleGuard = false;
  },

  moves: {
    'turn-the-handle': {
      id: 'turn-the-handle', name: 'Turn the Handle', intent: Intent.DEFEND, block: 6,
      tell: 'Crank. Crank. Crank. The lid strains against the catch.',
      effect(c) {
        c.block(c.self, 6);
        addCnt(c, 'wound-up', 1, 2);
        mem(c).handleGuard = true;
      },
    },
    pop: {
      id: 'pop', name: 'POP!', intent: Intent.ATTACK_BIG, damage: 7, hits: 1,
      tell: 'The catch is not going to hold.',
      damageFn: (c) => POP_DAMAGE[jackInTheBox.projectedWoundUp(c)] ?? 7,
      effect(c) {
        hitPlayer(c, POP_DAMAGE[Math.min(2, cnt(c, 'wound-up'))]);
        setCnt(c, 'wound-up', 0);
      },
    },
    'box-bite': {
      id: 'box-bite', name: 'Box Bite', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'The lid snaps at you like a mouth, because it is one.',
      effect(c) { hitPlayer(c, 7); },
    },
  },

  nextMove: (c) => cyc(['turn-the-handle', 'turn-the-handle', 'pop', 'box-bite'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.advanced.counters['wound-up'] = 1;
      h.advanced.flags.startWoundUp = 1;
      h.notes.push('Haunt 4: begins advanced encounters with 1 Wound Up.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Patchwork Soldier — repair
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Healing you can exploit. Damaging its friend makes the Soldier hurt itself putting
 * them back together — sometimes the correct play is to let it keep doing that.
 */
export const patchworkSoldier = {
  id: 'patchwork-soldier',
  name: 'Patchwork Soldier',
  region: REGION,
  tier: 'normal',
  role: 'interaction',
  hp: [38, 38],
  silhouette: 'toy-soldier',
  palette: ['#7a2b2b', '#c9b18a', '#3b2a1a'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 2 },
  scale: 1.0,
  lore: 'One cloth arm, one metal leg, and far too many seams. It has repaired everything in this room at least once.',

  /** The ally most in need of stuffing. */
  patchTarget(c) {
    let best = null, worst = 0;
    for (const a of allies(c)) {
      const missing = (a.maxHp || 0) - (a.hp || 0);
      if (missing >= 12 && missing > worst) { best = a; worst = missing; }
    }
    return best;
  },

  moves: {
    'patch-up': {
      id: 'patch-up', name: 'Patch Up', intent: Intent.BUFF,
      tell: 'It tears a handful of its own stuffing out for somebody else.',
      effect(c) {
        const t = patchworkSoldier.patchTarget(c);
        if (!t) return;
        c.heal(t, flag(c, 'patchHeal', 9));
        // Never kills itself repairing — it just gets thinner and thinner.
        const cost = Math.min(7, Math.max(0, (c.self.hp || 1) - 1));
        if (cost > 0) c.loseHp(c.self, cost);
      },
    },
    'wooden-saber': {
      id: 'wooden-saber', name: 'Wooden Saber', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'It presents the wooden sword with complete seriousness.',
      effect(c) { hitPlayer(c, 9); },
    },
    'stand-guard': {
      id: 'stand-guard', name: 'Stand Guard', intent: Intent.DEFEND, block: 8,
      tell: 'It plants itself between you and everything behind it.',
      effect(c) {
        c.block(c.self, 8);
        const other = allies(c)[0];
        if (other) c.block(other, 5);
      },
    },
  },

  nextMove(c) {
    // Patch Up when someone needs it, but never twice running.
    if (patchworkSoldier.patchTarget(c) && lastMove(c) !== 'patch-up') return 'patch-up';
    return cyc(['wooden-saber', 'stand-guard'], countMoves(c, ['wooden-saber', 'stand-guard']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.patchHeal = 11;
      h.notes.push('Haunt 5: Patch Up restores 11 Courage instead of 9. It still loses 7, so exploiting its repairs matters more.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Rocking Horse — interaction bruiser
// ─────────────────────────────────────────────────────────────────────────────
/**
 * It feeds on the rest of the nursery being helpful. Every Button sewn, every wound
 * patched, every blanket tucked in makes the Horse's Gallop bigger. This is where the
 * player stops reading enemies one at a time.
 */
export const rockingHorse = {
  id: 'rocking-horse',
  name: 'Rocking Horse',
  region: REGION,
  tier: 'normal',
  role: 'pressure',
  hp: [42, 42],
  silhouette: 'rocking-horse',
  palette: ['#a8763f', '#e6d3ad', '#4a3018'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.25,
  lore: 'Its eyes glow whenever the rest of the room gets lively. It has been waiting all century for the room to get lively.',

  maxExcitement(c) { return flag(c, 'maxExcitement', 3); },

  /**
   * Engine hook. Any of: an ally gaining Guard from another enemy, an ally recovering
   * Courage, an ally receiving a Button, an ally becoming Covered.
   * The Horse's own Happy Clatter never double-counts — its +1 is already in the move.
   */
  onBoardEvent(c, ev) {
    if (!ev || ev.actor === c.self) return;
    if (ev.source === c.self) return;
    const excites = (ev.type === 'block' && ev.source && ev.source !== ev.actor)
      || ev.type === 'heal'
      || (ev.type === 'status' && (String(ev.id || '').startsWith('button-') || ev.id === 'covered'));
    if (excites) addCnt(c, 'excitement', 1, rockingHorse.maxExcitement(c));
  },

  moves: {
    rock: {
      id: 'rock', name: 'Rock', intent: Intent.ATTACK_DEFEND, damage: 6, hits: 1, block: 5,
      tell: 'It tips forward on its rockers and comes down hard.',
      effect(c) { hitPlayer(c, 6); c.block(c.self, 5); },
    },
    gallop: {
      id: 'gallop', name: 'Gallop', intent: Intent.ATTACK_BIG, damage: 7, hits: 1,
      tell: 'It is not rocking any more. It is running.',
      damageFn: (c) => 7 + 4 * cnt(c, 'excitement'),
      effect(c) {
        hitPlayer(c, 7 + 4 * cnt(c, 'excitement'));
        setCnt(c, 'excitement', 0);
      },
    },
    'happy-clatter': {
      id: 'happy-clatter', name: 'Happy Clatter', intent: Intent.BUFF,
      tell: 'It clatters delightedly. Something else in the room stands up straighter.',
      effect(c) {
        addCnt(c, 'excitement', 1, rockingHorse.maxExcitement(c));
        const other = allies(c)[0];
        if (other) c.block(other, 4, { source: c.self, noExcite: true });
      },
    },
  },

  nextMove(c) {
    if (cnt(c, 'excitement') >= 2) return 'gallop';
    return cyc(['rock', 'happy-clatter', 'rock'], countMoves(c, ['rock', 'happy-clatter']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.maxExcitement = 4;
      h.notes.push('Haunt 7: can hold 4 Excitement. Gallop still gains 4 per stack, so its maximum becomes 23.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Blanket Blob — protector
// ─────────────────────────────────────────────────────────────────────────────
export const blanketBlob = {
  id: 'blanket-blob',
  name: 'Blanket Blob',
  region: REGION,
  tier: 'normal',
  role: 'interaction',
  hp: [34, 34],
  silhouette: 'blanket-pile',
  palette: ['#8f9ec4', '#cfd8ee', '#4a5170'],
  shape: { body: 'squat', limbs: 1, eyes: 3 },
  scale: 1.1,
  lore: 'Several nursery blankets crawled together. Occasionally a stuffed foot sticks out. Nobody is sure whose.',

  coverAmount(c) { return flag(c, 'coverAmount', 8); },

  coveredAlly(c) { return allies(c).find(a => c.has('covered', a)) || null; },

  /**
   * Pay the damage the `covered` status absorbed on an ally's behalf. Runs on the Blob's
   * own hooks because a status hook cannot reach across actors to deal it directly.
   * Settling does NOT re-arm the allowance — that is a separate, once-per-round step.
   */
  settleCover(c) {
    for (const a of allies(c)) {
      if (!c.has('covered', a)) continue;
      const owed = a._coverPending || 0;
      a._coverPending = 0;
      if (owed > 0) c.damage(c.self, owed, { cause: 'cover' });
    }
  },

  /** "The first 8 damage ... each player turn." One fresh allowance per round. */
  rearmCover(c) {
    for (const a of allies(c)) if (c.has('covered', a)) a._coverUsedThisTurn = 0;
  },

  onPlayerTurnEnd(c) { blanketBlob.settleCover(c); },
  onTurnStart(c) { blanketBlob.settleCover(c); blanketBlob.rearmCover(c); },

  /** It will not tuck in another Blanket Blob — blankets under blankets go nowhere. */
  coverTarget(c) {
    return allies(c).find(a => a.id !== 'blanket-blob' && !c.has('covered', a)) || null;
  },

  onDeath(c) {
    // "When Blanket Blob is defeated, Cover immediately ends."
    for (const a of allies(c)) {
      if (!c.has('covered', a)) continue;
      c.removeStatus(a, 'covered');
      a._coverPending = 0;
      a._coverUsedThisTurn = 0;
    }
  },

  moves: {
    'tuck-in': {
      id: 'tuck-in', name: 'Tuck In', intent: Intent.DEFEND, block: 5,
      tell: 'It flows over a friend and settles, leaving only a shape.',
      appliesFn: (c) => (blanketBlob.coverTarget(c) ? [{ id: 'covered', stacks: 1, to: 'ally' }] : []),
      effect(c) {
        const t = blanketBlob.coverTarget(c);
        if (t) {
          // The engine's enemy ctx drops extra applyStatus args, so the size of the Cover
          // is stamped straight onto the actor where the status hook can read it.
          t._coverAmount = blanketBlob.coverAmount(c);
          t._coverUsedThisTurn = 0;
          t._coverPending = 0;
          c.applyStatus(t, 'covered', 1);
        }
        c.block(c.self, 5);
      },
    },
    'blanket-snap': {
      id: 'blanket-snap', name: 'Blanket Snap', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'A corner of it cracks out like a wet towel.',
      effect(c) { hitPlayer(c, 8); },
    },
    smother: {
      id: 'smother', name: 'Smother', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 1,
      tell: 'It presses down over your face, warm and far too heavy.',
      applies: [{ id: 'smothered', stacks: 1, to: 'player' }],
      effect(c) { hitPlayer(c, 5); c.applyStatus(c.player, 'smothered', 1); },
    },
  },

  nextMove(c) {
    if (!blanketBlob.coveredAlly(c) && blanketBlob.coverTarget(c)) return 'tuck-in';
    return cyc(['blanket-snap', 'smother', 'blanket-snap'], countMoves(c, ['blanket-snap', 'smother']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.coverAmount = 10;
      h.notes.push('Haunt 6: Cover redirects the first 10 damage instead of 8.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Porcelain Doll — transformation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Damaging it makes it more dangerous. Damaging it enough makes it destroy itself.
 * Leave it intact, burst through the middle, or push it into Shattered and let its own
 * hands finish the job — all three are correct in different fights.
 */
export const porcelainDoll = {
  id: 'porcelain-doll',
  name: 'Porcelain Doll',
  region: REGION,
  tier: 'normal',
  role: 'pressure',
  hp: [36, 36],
  silhouette: 'porcelain-doll',
  palette: ['#f3e7de', '#c8a2a8', '#5b4750'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 2 },
  scale: 1.0,
  lore: 'It has been sitting perfectly still for ninety years, waiting to be picked up correctly.',

  state(c) { return crackState(c.self, flag(c, 'shatterFrac', 1 / 3)); },
  bonus(c) { return CRACK_DAMAGE[porcelainDoll.state(c)]; },

  onTurnStart(c) {
    if (porcelainDoll.state(c) === 'pristine') c.block(c.self, 4);
  },

  /** Shattered: after attacking, its own instability costs it 3 Courage. */
  afterAttack(c) {
    if (porcelainDoll.state(c) === 'shattered') c.loseHp(c.self, 3);
  },

  moves: {
    'tea-cup-tap': {
      id: 'tea-cup-tap', name: 'Tea Cup Tap', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It taps a china cup against its teeth. It does not have a cup.',
      damageFn: (c) => 7 + porcelainDoll.bonus(c),
      effect(c) { hitPlayer(c, 7 + porcelainDoll.bonus(c)); porcelainDoll.afterAttack(c); },
    },
    'perfect-posture': {
      id: 'perfect-posture', name: 'Perfect Posture', intent: Intent.DEFEND, block: 10,
      tell: 'It sits up very straight, the way it was taught.',
      effect(c) { c.block(c.self, 10); },
    },
    'sharp-little-hands': {
      id: 'sharp-little-hands', name: 'Sharp Little Hands', intent: Intent.ATTACK, damage: 4, hits: 2,
      tell: 'Its fingers have gone to points somewhere along the way.',
      damageFn: (c) => 4 + porcelainDoll.bonus(c),
      hitsFn: () => 2,
      effect(c) { hitPlayer(c, 4 + porcelainDoll.bonus(c), 2); porcelainDoll.afterAttack(c); },
    },
  },

  nextMove: (c) => cyc(['tea-cup-tap', 'perfect-posture', 'sharp-little-hands'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.shatterFrac = 14 / 36;
      h.notes.push('Haunt 8: enters Shattered at 14 Courage rather than 12 — the dangerous final state lasts longer.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Toy Chest — battlefield management
// ─────────────────────────────────────────────────────────────────────────────
const CHEST_SUMMONS = [
  { enemyId: 'button-baby', hpMul: 0.5 },
  { enemyId: 'jack-in-the-box', hpMul: 0.5 },
  { enemyId: 'patchwork-soldier', hpMul: 0.45 },
];

export const toyChest = {
  id: 'toy-chest',
  name: 'The Toy Chest',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  hp: [110, 110],
  silhouette: 'toy-chest',
  palette: ['#6a4423', '#b98a4b', '#2e1c0e'],
  shape: { body: 'squat', limbs: 6, eyes: 4 },
  scale: 1.55,
  lore: 'Everything the nursery ever lost is in here, and all of it has been awake the whole time.',

  maxSummons: 2,

  onSpawn(c) { setCnt(c, 'contents', flag(c, 'contents', 6)); },

  onPlayerTurnEnd(c) {
    // Slam the Lid: 16+ damage in one player turn holds it shut for a turn.
    if (dmgTaken(c) >= 16) mem(c).slammed = true;
  },

  canSpill(c) {
    return !mem(c).slammed
      && cnt(c, 'contents') > 0
      && allies(c).filter(a => a.summonedBy === (c.self.uid ?? c.self.id)).length < toyChest.maxSummons;
  },

  moves: {
    'spill-toys': {
      id: 'spill-toys', name: 'Spill Toys', intent: Intent.SUMMON,
      tell: 'The lid lifts a hand-width. Something climbs out over the edge.',
      summons: CHEST_SUMMONS,
      effect(c) {
        addCnt(c, 'contents', -1, 99, 0);
        const pick = CHEST_SUMMONS[c.rng.int(CHEST_SUMMONS.length)];
        c.summon(pick.enemyId, { hpMul: pick.hpMul });
      },
    },
    'rattle-angrily': {
      id: 'rattle-angrily', name: 'Rattle Angrily', intent: Intent.DEFEND, block: 9,
      tell: 'The lid strains and bangs. Whatever wanted out is not getting out.',
      effect(c) { c.block(c.self, 9); mem(c).slammed = false; },
    },
    'lid-slam': {
      id: 'lid-slam', name: 'Lid Slam', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'It rears up on its back edge to bring the whole lid down.',
      effect(c) { hitPlayer(c, 13); },
    },
    'toy-barrage': {
      id: 'toy-barrage', name: 'Toy Barrage', intent: Intent.ATTACK, damage: 4, hits: 3,
      tell: 'It throws its own contents at you, one handful at a time.',
      effect(c) { hitPlayer(c, 4, 3); },
    },
    'tidy-up': {
      id: 'tidy-up', name: 'Tidy Up', intent: Intent.DEFEND_BUFF,
      tell: 'It collects a stray toy and swallows it. It looks noticeably better for it.',
      effect(c) {
        const own = allies(c).filter(a => a.summonedBy === (c.self.uid ?? c.self.id));
        if (own.length) {
          // Reclaim the most damaged one — it was going to die anyway.
          own.sort((a, b) => hpFrac(a) - hpFrac(b));
          c.despawn(own[0]);
          addCnt(c, 'contents', 1, 99);
        }
        c.heal(c.self, 12);
      },
    },
  },

  nextMove(c) {
    const planned = cyc(
      ['spill-toys', 'lid-slam', 'spill-toys', 'toy-barrage', 'tidy-up'],
      (c.history || []).length,
    );
    // "If its planned move was Spill Toys, that move becomes Rattle Angrily."
    if (planned === 'spill-toys' && !toyChest.canSpill(c)) return 'rattle-angrily';
    return planned;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.contents = 7;
      h.counters.contents = 7;
      h.notes.push('Haunt 9: begins with 7 Contents instead of 6.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Patchwork Giant — progressive transformation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * It becomes less versatile as it falls apart and more aggressive with every piece lost.
 * The player is literally dismantling it, and the Giant is getting angrier about it.
 *
 * Patch tear thresholds are the doc's 90/60/30, expressed relative to its 126 Courage so
 * they hold under Haunt and party scaling (the doc's own multiplayer note calls them
 * 75% / 50% / 25%).
 */
const GIANT_CYCLE = ['stuffed-fist', 'sit-down', 'wild-flail', 'coming-apart'];

export const patchworkGiant = {
  id: 'patchwork-giant',
  name: 'The Patchwork Giant',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  hp: [126, 126],
  silhouette: 'patchwork-giant',
  palette: ['#8a6f5c', '#c8a97e', '#4a3a2c'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.8,
  lore: 'Rabbit ears, bear arms, a crocodile tail, a doll\'s face and three different kinds of stuffing. It was made out of everything nobody came back for.',

  patchOrder: ['bear', 'pillow', 'spring'],
  thresholds: [90, 60, 30],

  onSpawn(c) {
    mem(c).patches = ['bear', 'pillow', 'spring'];
    mem(c).torn = 0;
    setCnt(c, 'patches', 3);
    setCnt(c, 'loose-stuffing', 0);
  },

  hasPatch(c, p) { return (mem(c).patches || []).includes(p); },
  stuffing(c) { return cnt(c, 'loose-stuffing'); },

  /** Flat damage added to every hit: Bear Patch plus accumulated Loose Stuffing. */
  atkBonus(c) {
    return (patchworkGiant.hasPatch(c, 'bear') ? 3 : 0)
      + patchworkGiant.stuffing(c)
      + (mem(c).comingApart ? 4 : 0);
  },

  /** Spring Patch splits the first attack of each cycle into two 60% hits. */
  springs(c, moveId) {
    return patchworkGiant.hasPatch(c, 'spring') && moveId === 'stuffed-fist';
  },

  /** "The next Patch removed is always the one currently providing the most benefit." */
  choosePatch(c) {
    const remaining = mem(c).patches || [];
    if (!remaining.length) return null;
    const nextId = patchworkGiant.nextMove(c);
    const nextMove = patchworkGiant.moves[nextId] || {};
    const hits = nextMove.hits || 0;
    const dmg = nextMove.damage || 0;
    const score = {
      // Bear adds 3 to every hit of the coming attack.
      bear: hits ? 3 * hits : 0,
      // Pillow is a flat 6 Guard every single turn regardless of what it does.
      pillow: 6,
      // Spring turns one attack into 120% of itself, but only on the cycle's first attack.
      spring: patchworkGiant.springs(c, nextId) ? 0.2 * dmg * hits : 0,
    };
    let best = null, bestScore = -1;
    for (const p of patchworkGiant.patchOrder) {          // fixed order breaks ties
      if (!remaining.includes(p)) continue;
      if (score[p] > bestScore) { best = p; bestScore = score[p]; }
    }
    return best;
  },

  /** Engine hook: fired after this enemy takes damage. */
  onDamaged(c) {
    const scale = (c.self.maxHp || 126) / 126;
    const torn = mem(c).torn || 0;
    let n = torn;
    for (let i = torn; i < patchworkGiant.thresholds.length; i++) {
      if ((c.self.hp || 0) <= Math.round(patchworkGiant.thresholds[i] * scale)) n = i + 1;
    }
    while ((mem(c).torn || 0) < n) {
      const p = patchworkGiant.choosePatch(c);
      if (!p) break;
      mem(c).patches = (mem(c).patches || []).filter(x => x !== p);
      mem(c).torn = (mem(c).torn || 0) + 1;
      setCnt(c, 'patches', (mem(c).patches || []).length);
      addCnt(c, 'loose-stuffing', flag(c, 'stuffingPerTear', 1), 99);
      mem(c).lastTorn = p;
    }
  },

  onTurnStart(c) {
    if (patchworkGiant.hasPatch(c, 'pillow')) c.block(c.self, 6);
  },

  moves: {
    'stuffed-fist': {
      id: 'stuffed-fist', name: 'Stuffed Fist', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'It winds up an arm that used to belong to a bear.',
      damageFn: (c) => {
        const d = 11 + patchworkGiant.atkBonus(c);
        return patchworkGiant.springs(c, 'stuffed-fist') ? pct(d, 0.6) : d;
      },
      hitsFn: (c) => (patchworkGiant.springs(c, 'stuffed-fist') ? 2 : 1),
      effect(c) {
        const d = 11 + patchworkGiant.atkBonus(c);
        mem(c).comingApart = false;
        if (patchworkGiant.springs(c, 'stuffed-fist')) hitPlayer(c, pct(d, 0.6), 2);
        else hitPlayer(c, d);
      },
    },
    'sit-down': {
      id: 'sit-down', name: 'Sit Down', intent: Intent.DEFEND, block: 13,
      tell: 'It sits, heavily, and becomes a wall of secondhand toys.',
      effect(c) { c.block(c.self, 13); },
    },
    'wild-flail': {
      id: 'wild-flail', name: 'Wild Flail', intent: Intent.ATTACK, damage: 5, hits: 3,
      tell: 'Every mismatched limb goes in a different direction at once.',
      damageFn: (c) => 5 + patchworkGiant.atkBonus(c),
      hitsFn: () => 3,
      effect(c) { hitPlayer(c, 5 + patchworkGiant.atkBonus(c), 3); mem(c).comingApart = false; },
    },
    'coming-apart': {
      id: 'coming-apart', name: 'Coming Apart', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'A seam gives. It pushes the stuffing back in and glares at you.',
      effect(c) { c.block(c.self, 8); mem(c).comingApart = true; },
    },
  },

  nextMove: (c) => cyc(GIANT_CYCLE, (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.stuffingPerTear = 2;
      h.notes.push('Haunt 9: gains 2 Loose Stuffing whenever a Patch tears instead of 1.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Porcelain Twins — effect transfer puzzle
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Prim and Proper hold hands. Guard given to one half-flows to the other; a debuff
 * landed on one is copied to the other. Push them into Shattered together, or split
 * them and eat the survivor's Alone bonus. Both are real plans.
 */
function twinOf(c, myId) {
  const otherId = myId === 'porcelain-twin-prim' ? 'porcelain-twin-proper' : 'porcelain-twin-prim';
  return allies(c).find(a => a.id === otherId) || null;
}

/** Shared behaviour for both Twins. */
function twinCommon(id) {
  return {
    region: REGION,
    tier: 'elite',
    role: 'bigScare',
    hp: [68, 68],
    silhouette: 'porcelain-twin',
    shape: { body: 'tall-thin', limbs: 4, eyes: 2 },
    scale: 1.15,

    state(c) { return crackState(c.self); },

    /** Damage rider: crack state + Distressed (twin Shattered, I am not) + Alone. */
    bonus(c) {
      let b = CRACK_DAMAGE[crackState(c.self)];
      const t = twinOf(c, id);
      if (t) {
        if (crackState(t) === 'shattered' && crackState(c.self) === 'pristine') b += 4;   // Distressed
      } else {
        // Alone. Derived from "no living twin", never latched in a hook — a latch set at
        // turn start lands AFTER the intent is read, so the survivor would telegraph a
        // stale number for a full turn. This way the intent jumps the instant a Twin dies.
        b += 3;
      }
      return b;
    },

    onTurnStart(c) {
      if (crackState(c.self) === 'pristine') c.block(c.self, 4);
    },

    afterAttack(c) { if (crackState(c.self) === 'shattered') c.loseHp(c.self, 3); },

    /** Joined: Guard half-flows, stackable debuffs copy across. */
    onBoardEvent(c, ev) {
      const t = twinOf(c, id);
      if (!t || !ev || ev.actor !== t) return;
      if (ev.type === 'block' && !ev.noJoin && ev.amount > 0) c.block(c.self, Math.floor(ev.amount / 2));
      if (ev.type === 'status' && ev.kind === 'debuff' && !ev.noJoin) {
        c.applyStatus(c.self, ev.id, 1, { noJoin: true });
      }
    },

    /** Tea Party lands on every fourth turn while both are standing. */
    isTeaTurn(c) {
      return twinOf(c, id) && ((c.history || []).length + 1) % 4 === 0;
    },
  };
}

export const porcelainTwinPrim = Object.assign(twinCommon('porcelain-twin-prim'), {
  id: 'porcelain-twin-prim',
  name: 'Prim',
  palette: ['#f5ece4', '#b2666f', '#4c3a44'],
  lore: 'Prim does the talking. Prim has always done the talking, and Prim has never once been asked to stop.',

  moves: {
    'pointed-finger': {
      id: 'pointed-finger', name: 'Pointed Finger', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'Prim points at you. It is not a friendly gesture.',
      damageFn: (c) => 10 + porcelainTwinPrim.bonus(c) + (mem(c).hushed ? 4 : 0),
      effect(c) {
        hitPlayer(c, 10 + porcelainTwinPrim.bonus(c) + (mem(c).hushed ? 4 : 0));
        mem(c).hushed = false;
        porcelainTwinPrim.afterAttack(c);
      },
    },
    'little-slap': {
      id: 'little-slap', name: 'Little Slap', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'Two small, extremely precise slaps.',
      damageFn: (c) => 5 + porcelainTwinPrim.bonus(c) + (mem(c).hushed ? 4 : 0),
      hitsFn: () => 2,
      effect(c) {
        hitPlayer(c, 5 + porcelainTwinPrim.bonus(c) + (mem(c).hushed ? 4 : 0), 2);
        mem(c).hushed = false;
        porcelainTwinPrim.afterAttack(c);
      },
    },
    'tea-party': {
      id: 'tea-party', name: 'Tea Party', intent: Intent.BUFF,
      tell: 'They pour for one another. Both of them look a great deal better afterwards.',
      effect(c) {
        c.heal(c.self, 5);
        const t = twinOf(c, 'porcelain-twin-prim');
        if (t) c.heal(t, 5);
      },
    },
  },

  nextMove(c) {
    if (porcelainTwinPrim.isTeaTurn(c)) return 'tea-party';
    return cyc(['pointed-finger', 'little-slap'], countMoves(c, ['pointed-finger', 'little-slap']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.crackGuard = 6;
      h.notes.push('Haunt 9: gains 6 Guard the first time she enters a new Crack state.');
    }
    return h;
  },
});

export const porcelainTwinProper = Object.assign(twinCommon('porcelain-twin-proper'), {
  id: 'porcelain-twin-proper',
  name: 'Proper',
  palette: ['#f5ece4', '#6f86b2', '#3a414c'],
  lore: 'Proper does the listening, the arranging, and the making-sure. Proper has never needed to raise a hand.',

  moves: {
    'good-posture': {
      id: 'good-posture', name: 'Good Posture', intent: Intent.DEFEND, block: 8,
      tell: 'Both Twins straighten at exactly the same moment.',
      effect(c) {
        // An explicit dual grant — it must not also re-trigger Joined, or each would get 12.
        c.block(c.self, 8, { noJoin: true });
        const t = twinOf(c, 'porcelain-twin-proper');
        if (t) c.block(t, 8, { noJoin: true });
      },
    },
    'hush-now': {
      id: 'hush-now', name: 'Hush Now', intent: Intent.DEFEND_BUFF, block: 6,
      tell: 'Proper lays a hand on Prim\'s arm. Prim goes very quiet, and very still.',
      effect(c) {
        const t = twinOf(c, 'porcelain-twin-proper');
        if (t) (t.mem ||= {}).hushed = true;
        c.block(c.self, 6);
      },
    },
    'tea-party': {
      id: 'tea-party', name: 'Tea Party', intent: Intent.BUFF,
      tell: 'They pour for one another. Both of them look a great deal better afterwards.',
      effect(c) {
        c.heal(c.self, 5);
        const t = twinOf(c, 'porcelain-twin-proper');
        if (t) c.heal(t, 5);
      },
    },
  },

  nextMove(c) {
    if (porcelainTwinProper.isTeaTurn(c)) return 'tea-party';
    return cyc(['good-posture', 'hush-now'], countMoves(c, ['good-posture', 'hush-now']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.crackGuard = 6;
      h.notes.push('Haunt 9: gains 6 Guard the first time she enters a new Crack state.');
    }
    return h;
  },
});

export const NURSERY_ENEMIES = [
  buttonBaby, jackInTheBox, patchworkSoldier, rockingHorse, blanketBlob, porcelainDoll,
  toyChest, patchworkGiant, porcelainTwinPrim, porcelainTwinProper,
];
