/**
 * The Sleeping Quarters — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/03-sleeping-quarters.md.
 *
 * Region thesis: "Not every threat should be attacked immediately, and not every
 * visible target is the real threat."
 *
 * The Nursery was full of visible systems you could manipulate. This region is about not
 * being sure what is safe. Things hide, things wait, things get bigger while you cannot
 * reach them — but uncertainty here always contains agency. Hidden is not invulnerable,
 * and every enormous attack is signposted turns in advance.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, dmgTaken, cyc, countMoves, lastMove,
  hitPlayer, hauntBase, flag, field, isAlive,
} from './_lib.js';

const REGION = 'sleeping-quarters';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pillow Puff — introductory nuisance
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Drowsy is deliberately not a dead card: 1 Nerve for 4 Guard, then it leaves. Awkward,
 * not useless. That principle governs every status Trick in the game.
 */
export const pillowPuff = {
  id: 'pillow-puff',
  name: 'Pillow Puff',
  region: REGION,
  tier: 'normal',
  role: 'introductory',
  hp: [22, 22],
  silhouette: 'pillow',
  palette: ['#e3e7f2', '#aab5d2', '#6e7692'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.8,
  lore: 'Its stuffing leaks into the air like sleepy fog. It looks almost harmless, which is the entire point.',

  moves: {
    'feather-cloud': {
      id: 'feather-cloud', name: 'Feather Cloud', intent: Intent.DEBUFF, block: 5,
      // MULTIPLAYER: the Kid with the FATTEST draw pile, so the Drowsy is
      // most likely to come round again and matter (sleeping-quarters §37).
      partyPick: 'mostDraw',
      tell: 'It shakes itself out and the whole room goes soft at the edges.',
      addsCards: [{ id: 'drowsy', pile: 'discard' }],
      effect(c) {
        const first = countMoves(c, 'feather-cloud') === 0;
        const n = (first && flag(c, 'firstFeatherCloud', 1)) || 1;
        for (let i = 0; i < n; i++) c.addCard('drowsy', 'discard');
        c.block(c.self, 5);
      },
    },
    puff: {
      id: 'puff', name: 'Puff', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'A small, insulting whump.',
      effect(c) { hitPlayer(c, 5); },
    },
    'pillow-bonk': {
      id: 'pillow-bonk', name: 'Pillow Bonk', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It gets a proper swing behind it this time.',
      effect(c) { hitPlayer(c, 8); },
    },
  },

  nextMove: (c) => cyc(['feather-cloud', 'puff', 'pillow-bonk'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.firstFeatherCloud = 2;
      h.notes.push('Haunt 4: the first Feather Cloud adds 2 Drowsy. Later uses add 1.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Slipper Skitter — fast harassment
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Scurry does not stop you attacking it. It makes leading with your biggest Attack a
 * waste. Multi-hit, chip damage, or simply a weaker card first are all better answers —
 * which is how the region starts teaching target timing.
 */
export const slipperSkitter = {
  id: 'slipper-skitter',
  name: 'Slipper Skitter',
  region: REGION,
  tier: 'normal',
  role: 'introductory',
  hp: [24, 24],
  silhouette: 'slippers',
  palette: ['#c07a8f', '#f0d3dc', '#5c3644'],
  shape: { body: 'squat', limbs: 2, eyes: 4 },
  scale: 0.7,
  lore: 'A pair of them, always together, always going somewhere else the moment you look directly at them.',

  onSpawn(c) { if (flag(c, 'startScurry')) c.applyStatus(c.self, 'scurry', 1); },

  moves: {
    'toe-stomp': {
      id: 'toe-stomp', name: 'Toe Stomp', intent: Intent.ATTACK, damage: 4, hits: 2,
      tell: 'Two quick stamps, one from each slipper.',
      applies: [{ id: 'scurry', stacks: 1, to: 'self' }],
      effect(c) { hitPlayer(c, 4, 2); c.applyStatus(c.self, 'scurry', 1); },
    },
    'heel-kick': {
      id: 'heel-kick', name: 'Heel Kick', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'One rears back on its heel.',
      applies: [{ id: 'scurry', stacks: 1, to: 'self' }],
      effect(c) { hitPlayer(c, 7); c.applyStatus(c.self, 'scurry', 1); },
    },
    'hide-under-the-bed': {
      id: 'hide-under-the-bed', name: 'Hide Under the Bed', intent: Intent.DEFEND, block: 9,
      tell: 'They scoot for the dust ruffle and wedge themselves in.',
      effect(c) { c.block(c.self, 9); c.removeStatus(c.self, 'scurry'); },
    },
  },

  nextMove: (c) => cyc(['toe-stomp', 'heel-kick', 'hide-under-the-bed'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.startScurry = true;
      h.notes.push('Haunt 3: every Slipper Skitter begins with Scurry already up, not just those in '
        + 'advanced Scuffles — your opening Attack is halved before you have done anything.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Wardrobe Guest — hiding
// ─────────────────────────────────────────────────────────────────────────────
/** Hidden is not invulnerability. It changes which interactions are available. */
export const wardrobeGuest = {
  id: 'wardrobe-guest',
  name: 'Wardrobe Guest',
  region: REGION,
  tier: 'normal',
  role: 'interaction',
  hp: [36, 36],
  silhouette: 'wardrobe-arm',
  palette: ['#3a2b20', '#6b503a', '#141019'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.2,
  lore: 'You only ever see a long arm, one eye between the doors, or a coat moving when there is no breeze.',

  isHidden(c) { return c.has('hidden', c.self); },

  goHidden(c) {
    c.applyStatus(c.self, 'hidden', 1);
    // Nightlight Snuffer's Darkness makes hiding materially better.
    if (c.has('darkness', c.self) || field(c).darkness) c.block(c.self, 4);
    /**
     * Haunt 5 (design doc §48, "may hide another enemy with it"). It pulls the ally you
     * were actually trying to kill into the wardrobe too. Below Haunt 5 the Guest's
     * hiding cycle gives you a clean window on everything else in the room; from Haunt 5
     * that window can close on the target that mattered, and Hidden is not a state you
     * can simply out-damage.
     */
    if (!flag(c, 'hideAlly')) return;
    const friend = allies(c).find(a => !c.has('hidden', a));
    if (friend) c.applyStatus(friend, 'hidden', 1);
  },

  moves: {
    'long-fingers': {
      id: 'long-fingers', name: 'Long Fingers', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'An arm comes out of the wardrobe. It keeps coming out.',
      effect(c) { hitPlayer(c, 9 + (mem(c).rustled ? 3 : 0)); mem(c).rustled = false; },
      damageFn: (c) => 9 + (mem(c).rustled ? 3 : 0),
    },
    'back-inside': {
      id: 'back-inside', name: 'Back Inside', intent: Intent.DEFEND, block: 7,
      tell: 'The doors pull shut from within.',
      appliesFn: (c) => (flag(c, 'hideAlly') && allies(c).some(a => !c.has('hidden', a))
        ? [{ id: 'hidden', stacks: 1, to: 'self' }, { id: 'hidden', stacks: 1, to: 'ally' }]
        : [{ id: 'hidden', stacks: 1, to: 'self' }]),
      effect(c) { c.block(c.self, 7); wardrobeGuest.goHidden(c); },
    },
    rustle: {
      id: 'rustle', name: 'Rustle', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'Coat hangers move. Nothing else does.',
      blockFn: (c) => flag(c, 'rustleBlock', 5),
      effect(c) { c.block(c.self, flag(c, 'rustleBlock', 5)); mem(c).rustled = true; },
    },
    'peek-out': {
      id: 'peek-out', name: 'Peek Out', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'One eye, then all of it at once.',
      damageFn: (c) => 5 + (mem(c).rustled ? 3 : 0),
      effect(c) {
        c.removeStatus(c.self, 'hidden');
        hitPlayer(c, 5 + (mem(c).rustled ? 3 : 0));
        mem(c).rustled = false;
      },
    },
  },

  nextMove: (c) => cyc(['long-fingers', 'back-inside', 'rustle', 'peek-out'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.rustleBlock = 8;
      h.flags.hideAlly = true;
      h.moves.rustle = { block: 8 };
      h.notes.push('Haunt 5: Rustle grants 8 Guard instead of 5 while Hidden, and Back Inside now '
        + 'takes an ally into the wardrobe with it (design doc §48) — your targeting window closes '
        + 'on the enemy you actually wanted.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Blanket Creeper — defensive threat
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Like Porcelain Doll, damage changes it. Unlike the Doll, you are stripping protection
 * off something that gets meaner the more of it you take away.
 */
export const blanketCreeper = {
  id: 'blanket-creeper',
  name: 'Blanket Creeper',
  region: REGION,
  tier: 'normal',
  role: 'interaction',
  hp: [39, 39],
  silhouette: 'blanket-crawl',
  palette: ['#5f6f8c', '#9fb0cc', '#333d4f'],
  shape: { body: 'sprawling', limbs: 0, eyes: 5 },
  scale: 1.2,
  lore: 'It crawls by folding itself over and over. Several lumps move beneath it, and they do not move together.',

  onSpawn(c) { setCnt(c, 'layers', flag(c, 'layers', 3)); },

  uncovered(c) { return cnt(c, 'layers') <= 0; },
  atkBonus(c) { return blanketCreeper.uncovered(c) ? 2 : 0; },

  onTurnStart(c) {
    const l = cnt(c, 'layers');
    if (l > 0) c.block(c.self, 4 * l);
  },

  onPlayerTurnEnd(c) {
    // One Layer per turn, at 10+ damage. Slow, deliberate, and completely readable.
    // "Layer removal threshold becomes 10 damage per player across the team
    // round. All players contribute. Only one Layer can still be removed per
    // round." (sleeping quarters §40.)
    if (cnt(c, 'layers') > 0 && dmgTaken(c) >= c.perPlayer(10)) {
      addCnt(c, 'layers', -1, 9, 0);
      mem(c).idleTurns = 0;
      return;
    }
    /**
     * Haunt 3 (design doc §48, "may restore a Layer if completely ignored for several
     * turns"). Two consecutive turns without taking a single point and it folds a layer
     * back on. Below Haunt 3 stripping Layers is monotonic, so you can chip it down at
     * whatever pace you like; from Haunt 3 the work rots if you stop, and splitting
     * attention between the Creeper and a second enemy costs you real progress.
     */
    if (!flag(c, 'relayer')) return;
    if (dmgTaken(c) > 0) { mem(c).idleTurns = 0; return; }
    mem(c).idleTurns = (mem(c).idleTurns || 0) + 1;
    if (mem(c).idleTurns >= 2 && cnt(c, 'layers') < flag(c, 'layers', 3)) {
      addCnt(c, 'layers', 1, flag(c, 'layers', 3));
      mem(c).idleTurns = 0;
    }
  },

  moves: {
    'wrap-up': {
      id: 'wrap-up', name: 'Wrap Up', intent: Intent.DEFEND, block: 6,
      tell: 'It folds another layer over itself.',
      effect(c) { c.block(c.self, 6); },
    },
    'blanket-lash': {
      id: 'blanket-lash', name: 'Blanket Lash', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'A corner whips out at ankle height.',
      damageFn: (c) => 8 + blanketCreeper.atkBonus(c),
      effect(c) { hitPlayer(c, 8 + blanketCreeper.atkBonus(c)); },
    },
    smother: {
      id: 'smother', name: 'Smother', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 1,
      tell: 'It settles over you, and it is in no hurry.',
      damageFn: (c) => 5 + blanketCreeper.atkBonus(c),
      applies: [{ id: 'smothered', stacks: 1, to: 'player' }],
      effect(c) {
        hitPlayer(c, 5 + blanketCreeper.atkBonus(c));
        c.applyStatus(c.player, 'smothered', 1);
      },
    },
  },

  nextMove(c) {
    const armoured = cnt(c, 'layers') >= 2;
    const pattern = armoured
      ? ['wrap-up', 'blanket-lash', 'smother']
      : ['blanket-lash', 'smother', 'blanket-lash'];
    return cyc(pattern, (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.relayer = true;
      h.notes.push('Haunt 3: folds a Layer back on after two turns without taking damage '
        + '(design doc §48) — progress rots if you look away.');
    }
    if (level >= 6) {
      h.advanced.counters.layers = 4;
      h.advanced.flags.layers = 4;
      h.notes.push('Haunt 6: begins advanced encounters with 4 Layers instead of 3.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Nightlight Snuffer — support
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A clean priority target that you will still sometimes correctly ignore, because
 * something else is about to land a telegraphed 26.
 */
export const nightlightSnuffer = {
  id: 'nightlight-snuffer',
  name: 'Nightlight Snuffer',
  region: REGION,
  tier: 'normal',
  role: 'pressure',
  hp: [27, 27],
  silhouette: 'snuffer',
  palette: ['#22242c', '#4c5160', '#e8b25a'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.8,
  lore: 'A small soot-covered thing with a long brass snuffer for a nose. It hates light with its whole heart.',

  darknessPower(c) { return flag(c, 'darknessPower', 2); },

  /**
   * Put out one stack of the player's most valuable standing buff. Ordered most to least
   * painful to lose, so it always takes something the player would actually miss rather
   * than nibbling the cheapest stack on the row.
   */
  SNUFFABLE: ['strength', 'focus', 'dexterity', 'regen', 'bristle', 'charm'],
  extinguish(c) {
    for (const id of nightlightSnuffer.SNUFFABLE) {
      if (c.count(id, c.player) > 0) {
        c.applyStatus(c.player, id, -1);
        return id;
      }
    }
    return null;
  },

  /**
   * "Darkness lasts until the beginning of Nightlight Snuffer's next turn."
   *
   * Expiring it at the Snuffer's own turn start was the mirror image of the Roused bug:
   * from any slot but the last it stripped the +2 out of an ally that had not swung yet,
   * so the player took LESS than the intent promised. It now expires at
   * onEnemyPhaseEnd — after every enemy has acted, before the next intents are chosen —
   * one full phase after it was cast, so the Darkness the player was shown is always
   * exactly the Darkness that resolves. Slot order no longer matters.
   */
  onEnemyPhaseEnd(c) {
    if (!field(c).darkness) return;
    const now = c.turn ?? 0;
    if (now <= (field(c).darknessTurn ?? now)) return;   // cast this phase — it still has a turn to run
    field(c).darkness = false;
    field(c).darknessTurn = null;
    for (const a of allies(c)) c.removeStatus(a, 'darkness');
  },

  onDeath(c) {
    field(c).darkness = false;
    for (const a of allies(c)) c.removeStatus(a, 'darkness');
  },

  moves: {
    snuff: {
      id: 'snuff', name: 'Snuff', intent: Intent.BUFF,
      tell: 'It leans over the nightlight. The room gets a great deal larger.',
      // Darkness is a flat damage buff to the rest of the room. Announce the exact size.
      appliesFn: (c) => (allies(c).length
        ? [{ id: 'darkness', stacks: nightlightSnuffer.darknessPower(c), to: 'allies' }] : []),
      effect(c) {
        field(c).darkness = true;
        field(c).darknessTurn = c.turn ?? 0;
        // The Snuffer itself never benefits from its own Darkness.
        for (const a of allies(c)) c.applyStatus(a, 'darkness', nightlightSnuffer.darknessPower(c));
        /**
         * Haunt 7 (design doc §48, "may extinguish a positive player battlefield effect").
         * Snuffing takes one stack of one of your buffs with the light. Below Haunt 7 you
         * can set up through a Snuff freely; from Haunt 7 the Snuffer is on a four-turn
         * clock against your own preparation, so when you spend a Power stops being free.
         *
         * Written against `removeStatus`/`count`, which the engine actually has. The first
         * draft called a `removeBestStatus(actor, {kind})` helper that does not exist, and
         * because the call was behind a `typeof` guard it degraded to a silent no-op — the
         * upgrade would have shipped doing nothing at all, exactly like Cover in round 2.
         * Feature-detecting a helper you have not confirmed is a way to ship dead content.
         */
        if (flag(c, 'snuffBuffs')) nightlightSnuffer.extinguish(c);
      },
    },
    'hot-wick': {
      id: 'hot-wick', name: 'Hot Wick', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It presses the still-glowing wick against you.',
      effect(c) { hitPlayer(c, 6); },
    },
    'flicker-out': {
      id: 'flicker-out', name: 'Flicker Out', intent: Intent.DEFEND, block: 8,
      tell: 'It curls around itself and dims almost to nothing.',
      effect(c) {
        c.block(c.self, 8);
        if (field(c).darkness) {
          const other = allies(c)[0];
          if (other) c.block(other, 6);
        }
      },
    },
  },

  nextMove: (c) => cyc(['snuff', 'hot-wick', 'flicker-out', 'hot-wick'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.darknessPower = 3;
      h.flags.snuffBuffs = true;
      h.notes.push('Haunt 7: Darkness grants 3 additional attack damage instead of 2, and Snuff '
        + 'puts out one of your own positive effects (design doc §48).');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Thing Beneath — major telegraphed threat
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The region's clearest slow-building threat, and its clearest dynamic intent: hit it
 * for 15 in a turn and UNDER THE BED visibly loses 6 damage before it ever lands.
 */
export const thingBeneath = {
  id: 'thing-beneath',
  name: 'Thing Beneath',
  region: REGION,
  tier: 'normal',
  role: 'pressure',
  hp: [45, 45],
  silhouette: 'under-bed-claws',
  palette: ['#171a22', '#3b4152', '#c85a4a'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.3,
  lore: 'You never see the whole creature. Only claws beneath a bed, a pair of eyes, a hand disappearing behind a dust ruffle.',

  maxScare(c) { return flag(c, 'maxScare', 3); },

  /** Scare it will actually swing with, accounting for an interrupt already earned. */
  projectedScare(c) {
    const s = cnt(c, 'scare');
    const interrupting = !mem(c).interruptedThisTurn && dmgTaken(c) >= c.perPlayer(15);
    return Math.max(0, s - (interrupting ? 1 : 0));
  },

  onPlayerTurnStart(c) { mem(c).interruptedThisTurn = false; },

  /** Decide, once, whether the next full-Scare cycle holds back a turn. Haunt 4+. */
  rollDelay(c) {
    if (!flag(c, 'delayScare')) { mem(c).willDelay = false; return; }
    if (cnt(c, 'scare') < thingBeneath.maxScare(c)) return;
    if (mem(c).delayRolled) return;
    mem(c).delayRolled = true;
    mem(c).willDelay = c.rng.chance(0.5);
  },

  onSpawn(c) { mem(c).delayRolled = false; mem(c).willDelay = false; },

  onPlayerTurnEnd(c) {
    // "If Thing Beneath loses at least 15 Courage during a single player turn, remove 1 Scare."
    // Per player, like every other "damage in one round" threshold in these
    // chapters. §42 does not name this one, but a duo would otherwise strip a
    // Scare every single round and UNDER THE BED would never reach 3.
    if (!mem(c).interruptedThisTurn && dmgTaken(c) >= c.perPlayer(15)) {
      addCnt(c, 'scare', -1, thingBeneath.maxScare(c), 0);
      mem(c).interruptedThisTurn = true;
    }
  },

  moves: {
    'scratch-scratch': {
      id: 'scratch-scratch', name: 'Scratch Scratch', intent: Intent.DEFEND, block: 7,
      tell: 'Something under the bed goes very still, then starts scratching.',
      effect(c) {
        addCnt(c, 'scare', 1, thingBeneath.maxScare(c));
        c.block(c.self, 7);
        thingBeneath.rollDelay(c);
      },
    },
    'grab-an-ankle': {
      id: 'grab-an-ankle', name: 'Grab an Ankle', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'A hand closes around your ankle, just for a moment.',
      effect(c) { hitPlayer(c, 6); addCnt(c, 'scare', 1, thingBeneath.maxScare(c)); thingBeneath.rollDelay(c); },
    },
    loom: {
      id: 'loom', name: 'Not Yet', intent: Intent.DEFEND, block: 7,
      tell: 'It is ready. It is not coming out. Not this turn.',
      effect(c) { c.block(c.self, 7); mem(c).willDelay = false; },
    },
    'under-the-bed': {
      id: 'under-the-bed', name: 'UNDER THE BED', intent: Intent.ATTACK_BIG, damage: 8, hits: 1,
      // MULTIPLAYER: "The target is therefore the whole team." (§42)
      partyTarget: 'all',
      tell: 'Every noise in the room stops at once.',
      damageFn: (c) => 8 + 6 * thingBeneath.projectedScare(c),
      effect(c) {
        hitPlayer(c, 8 + 6 * cnt(c, 'scare'));
        setCnt(c, 'scare', 0);
        mem(c).delayRolled = false;
        mem(c).willDelay = false;
      },
    },
  },

  nextMove(c) {
    const planned = cyc(
      ['scratch-scratch', 'grab-an-ankle', 'scratch-scratch', 'under-the-bed'],
      (c.history || []).length,
    );
    /**
     * Haunt 4 (design doc §48, "may delay UNDER THE BED for one turn, creating
     * uncertainty about when the scare arrives"). Below Haunt 4 the countdown is a
     * metronome: you know the exact turn and can pre-build the exact answer. From Haunt 4
     * it will sometimes hold at maximum Scare and scratch for one more turn instead,
     * banking nothing but forcing you to hold your defensive turn open. The delay only
     * happens at full Scare and never twice running, so it is uncertainty with a
     * ceiling — you always know it is coming and you always know how big.
     *
     * The coin is flipped in the effect that banks the final Scare, never here:
     * nextMove is re-called every time the intent refreshes, so drawing from the rng
     * inside it would both desync the run seed and make the telegraph flicker between
     * "Not Yet" and UNDER THE BED while the player watched.
     */
    if (planned === 'under-the-bed' && flag(c, 'delayScare')
        && mem(c).willDelay && lastMove(c) !== 'loom') {
      return 'loom';
    }
    return planned;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.delayScare = true;
      h.notes.push('Haunt 4: at full Scare it may hold UNDER THE BED back a turn (design doc §48). '
        + 'You still know how big it is, but no longer exactly when.');
    }
    if (level >= 8) {
      h.flags.maxScare = 4;
      h.notes.push('Haunt 8: can hold 4 Scare, so UNDER THE BED reaches 32. The player gets an extra visual warning at 4.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Night Terror — intent uncertainty
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Watching You shows BOTH possible intents and tells you exactly which action picks
 * which. "Uncertainty should create decisions, not coin flips." The player controls the
 * branch; they simply have to decide what their first Trick is worth.
 */
export const nightTerror = {
  id: 'night-terror',
  name: 'The Night Terror',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  hp: [104, 104],
  silhouette: 'shadow-shape',
  palette: ['#0f1018', '#2a2c3d', '#d9d2e6'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.5,
  lore: 'Long arms, no face, too many teeth. Then suddenly nothing at all except a shadow on the wall that is still moving.',

  /** Which branch the player's first Trick this turn has locked in, or null. */
  branch(c) {
    const first = (c.cardsPlayedThisTurn || [])[0];
    if (!first) return null;
    if (first.type === 'attack') return 'recoil';
    if (first.type === 'power' && flag(c, 'powerBranch')) return 'looming';
    return 'lunge';
  },

  moves: {
    'watching-you': {
      id: 'watching-you', name: 'Watching You', intent: Intent.UNKNOWN, damage: 14, hits: 1,
      tell: 'It is deciding what to be. Your first Trick this turn decides for it.',
      /**
       * The engine draws every alternative side by side until the branch resolves, then
       * collapses to the chosen one. This is the region's signature read.
       */
      alternatives(c) {
        const alts = [
          { key: 'recoil', label: 'If you open with an Attack', intent: Intent.DEFEND_BUFF, block: 14, damage: 0, hits: 0, note: 'Recoil: gains 14 Guard and applies Frightened.' },
          { key: 'lunge', label: 'If you open with a Skill', intent: Intent.ATTACK_BIG, damage: 14, hits: 1, note: 'Lunge: deals 14 damage.' },
        ];
        if (flag(c, 'powerBranch')) {
          alts[1].label = 'If you open with a Skill';
          alts.push({ key: 'looming', label: 'If you open with a Power', intent: Intent.ATTACK_DEBUFF, damage: 10, hits: 1, note: 'Looming: deals 10 damage and applies Frightened.' });
        } else {
          alts[1].label = 'If you open with a Skill or Power';
        }
        const chosen = nightTerror.branch(c);
        return chosen ? alts.filter(a => a.key === chosen) : alts;
      },
      intentFn: (c) => {
        const b = nightTerror.branch(c);
        if (b === 'recoil') return Intent.DEFEND_BUFF;
        if (b === 'looming') return Intent.ATTACK_DEBUFF;
        if (b === 'lunge') return Intent.ATTACK_BIG;
        return Intent.UNKNOWN;
      },
      damageFn: (c) => {
        const b = nightTerror.branch(c);
        if (b === 'recoil') return 0;
        if (b === 'looming') return 10;
        return 14;
      },
      hitsFn: (c) => (nightTerror.branch(c) === 'recoil' ? 0 : 1),
      blockFn: (c) => (nightTerror.branch(c) === 'recoil' ? 14 : 0),
      appliesFn: (c) => {
        const b = nightTerror.branch(c);
        return (b === 'recoil' || b === 'looming') ? [{ id: 'frightened', stacks: 1, to: 'player' }] : [];
      },
      effect(c) {
        const b = nightTerror.branch(c) || 'lunge';    // no cards played → it lunges
        if (b === 'recoil') { c.block(c.self, 14); c.applyStatus(c.player, 'frightened', 1); }
        else if (b === 'looming') { hitPlayer(c, 10); c.applyStatus(c.player, 'frightened', 1); }
        else hitPlayer(c, 14);
      },
    },
    'long-shadow': {
      id: 'long-shadow', name: 'Long Shadow', intent: Intent.ATTACK, damage: 8, hits: 2,
      tell: 'Its shadow reaches the far wall before the rest of it does.',
      effect(c) { hitPlayer(c, 8, 2); },
    },
    'bedroom-corner': {
      id: 'bedroom-corner', name: 'Bedroom Corner', intent: Intent.DEFEND, block: 12,
      tell: 'It folds itself into the angle where two walls meet and is simply not there.',
      applies: [{ id: 'hidden', stacks: 1, to: 'self' }],
      effect(c) { c.block(c.self, 12); c.applyStatus(c.self, 'hidden', 1); },
    },
    'sudden-face': {
      id: 'sudden-face', name: 'Sudden Face', intent: Intent.ATTACK_DEBUFF, damage: 10, hits: 1,
      tell: 'It is going to be much closer than this in a moment.',
      applies: [{ id: 'frightened', stacks: 1, to: 'player' }],
      effect(c) {
        c.removeStatus(c.self, 'hidden');
        hitPlayer(c, 10);
        c.applyStatus(c.player, 'frightened', 1);
      },
    },
  },

  onTurnStart(c) {
    // Bedroom Corner's hiding lasts until the beginning of its next turn.
    if (lastMove(c) === 'bedroom-corner') c.removeStatus(c.self, 'hidden');
  },

  nextMove: (c) => cyc(
    ['watching-you', 'long-shadow', 'bedroom-corner', 'sudden-face'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.powerBranch = true;
      h.notes.push('Haunt 9: Watching You reacts to Power as a third branch (Looming: 10 damage and Frightened).');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Blanket Hydra — multi-target transformation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Heads are separately targetable and do not share the body's Courage. Killing one
 * costs the body 10 and buys you two enemy turns of quiet — until the body drops below
 * half, after which dead Heads stay dead. Four legitimate plans, no correct one.
 */
function hydraBody(c) {
  return allies(c).find(a => a.id === 'blanket-hydra') || null;
}

function hydraHead(id, name, palette, lore, behaviour) {
  return Object.assign({
    id, name, region: REGION, tier: 'elite', role: 'bossPart',
    hp: [24, 24],
    silhouette: 'hydra-head',
    palette,
    shape: { body: 'floating', limbs: 0, eyes: 2 },
    scale: 0.7,
    lore,
    partOf: 'blanket-hydra',

    onDeath(c) {
      const body = hydraBody(c);
      if (body) {
        c.damage(body, 10, { skipModifiers: true, cause: 'hydra-head:' + id });
        (body.mem ||= {});
        // Below half Courage the Hydra stops replacing what it loses.
        if ((body.hp || 0) > (body.maxHp || 1) * 0.5) {
          (body.mem.regrow ||= []).push({ head: id, at: (c.turn || 0) + flag(c, 'regrowDelay', 2) });
        }
      }
    },

    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 1) h.notes.push('Courage +6%.');
      if (level >= 9) {
        h.flags.regrowDelay = 1;
        h.notes.push('Haunt 9: regrows one enemy turn faster.');
      }
      return h;
    },
  }, behaviour);
}

export const hydraHeadSnoring = hydraHead(
  'hydra-head-snoring', 'Snoring Head',
  ['#7d8bb0', '#c3cde6', '#3d465e'],
  'It has not woken up once. Whatever it is dreaming about is getting into the room.',
  {
    moves: {
      'snore': {
        id: 'snore', name: 'Snore', intent: Intent.DEBUFF,
        tell: 'A long wet snore. You feel your own eyes getting heavy.',
        addsCards: [{ id: 'drowsy', pile: 'discard' }],
        effect(c) { c.addCard('drowsy', 'discard'); },
      },
      'doze': {
        id: 'doze', name: 'Doze', intent: Intent.SLEEP,
        tell: 'It is fast asleep. It will not be, next turn.',
        effect() {},
      },
    },
    nextMove: (c) => ((c.history || []).length % 2 === 1 ? 'snore' : 'doze'),
  },
);

export const hydraHeadBiting = hydraHead(
  'hydra-head-biting', 'Biting Head',
  ['#8f6f7d', '#d8b8c2', '#4a3540'],
  'This one is awake. This one has always been awake.',
  {
    moves: {
      'chomp': {
        id: 'chomp', name: 'Chomp', intent: Intent.ATTACK, damage: 5, hits: 1,
        // MULTIPLAYER: "Biting Head attacks the player with the lowest Guard."
        // (§44). Each Head chooses separately, which the seat-marking already
        // gives us — they are separate enemies.
        partyPick: 'lowestGuard',
        tell: 'It bites without any particular malice, the way a dog bites a stick.',
        effect(c) { hitPlayer(c, 5); },
      },
    },
    nextMove: () => 'chomp',
  },
);

export const hydraHeadCrying = hydraHead(
  'hydra-head-crying', 'Crying Head',
  ['#6f86b2', '#b9c9e6', '#333f57'],
  'It has been crying for a very long time and nobody has ever come.',
  {
    moves: {
      'wail': {
        id: 'wail', name: 'Wail', intent: Intent.DEFEND, block: 0,
        tell: 'It wails, and the whole pile draws itself tighter.',
        blockFn: () => 8,
        effect(c) { const b = hydraBody(c); if (b) c.block(b, 8); },
      },
      'sniffle': {
        id: 'sniffle', name: 'Sniffle', intent: Intent.SLEEP,
        tell: 'It is gathering itself up for another one.',
        effect() {},
      },
    },
    nextMove: (c) => ((c.history || []).length % 2 === 1 ? 'wail' : 'sniffle'),
  },
);

export const blanketHydra = {
  id: 'blanket-hydra',
  name: 'The Blanket Hydra',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  hp: [118, 118],
  silhouette: 'blanket-hydra',
  palette: ['#4a5878', '#8f9fc0', '#262d3e'],
  shape: { body: 'sprawling', limbs: 0, eyes: 6 },
  scale: 1.75,
  lore: 'A pile of blankets rises from several beds at once, and three covered heads push up out of the fabric.',

  heads: ['hydra-head-snoring', 'hydra-head-biting', 'hydra-head-crying'],

  onSpawn(c) { mem(c).regrow = []; setCnt(c, 'heads', 3); },

  onTurnStart(c) {
    const pending = mem(c).regrow || [];
    const still = [];
    for (const r of pending) {
      // Once below half Courage, defeated Heads remain defeated.
      if ((c.self.hp || 0) <= (c.self.maxHp || 1) * 0.5) continue;
      if ((c.turn || 0) >= r.at) c.summon(r.head, { hp: 12 });
      else still.push(r);
    }
    mem(c).regrow = still;
    setCnt(c, 'heads', allies(c).filter(a => blanketHydra.heads.includes(a.id)).length);
  },

  moves: {
    'blanket-crush': {
      id: 'blanket-crush', name: 'Blanket Crush', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'The whole pile rears and comes down at once.',
      effect(c) { hitPlayer(c, 10); },
    },
    tangle: {
      id: 'tangle', name: 'Tangle', intent: Intent.ATTACK_DEBUFF, damage: 0, hits: 1,
      tell: 'Fabric wraps your arms before you have decided to move them.',
      damageFn: () => 0,
      hitsFn: () => 1,
      intentFn: () => Intent.DEBUFF,
      applies: [{ id: 'frightened', stacks: 1, to: 'player' }],
      effect(c) { c.applyStatus(c.player, 'frightened', 1); c.block(c.self, 6); },
    },
    'roll-over': {
      id: 'roll-over', name: 'Roll Over', intent: Intent.DEFEND, block: 12,
      tell: 'It turns over in its sleep, which takes a considerable amount of room.',
      effect(c) { c.block(c.self, 12); },
    },
  },

  nextMove: (c) => cyc(['blanket-crush', 'tangle', 'roll-over'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: Heads regrow one enemy turn faster (see the Head definitions).');
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Wardrobe — hidden threat and encounter composition
// ─────────────────────────────────────────────────────────────────────────────
const WARDROBE_SUMMONS = [
  { enemyId: 'slipper-skitter', hpMul: 0.5 },
  { enemyId: 'pillow-puff', hpMul: 0.5 },
  { enemyId: 'wardrobe-guest', hpMul: 0.4 },
];

function wardrobeBody(c) { return allies(c).find(a => a.id === 'the-wardrobe') || null; }

function wardrobeDoor(id, name, lore) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'bossPart',
    hp: [26, 26],
    silhouette: 'wardrobe-door',
    palette: ['#3f2c1e', '#6b5636', '#100d14'],
    shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
    scale: 0.9,
    lore,
    partOf: 'the-wardrobe',

    onSpawn(c) { mem(c).open = !!flag(c, 'startOpen'); },
    isOpen(c) { return !!mem(c).open; },

    onDeath(c) {
      mem(c).broken = true;
      const body = wardrobeBody(c);
      if (body) (body.mem ||= {}).doorsBroken = ((body.mem.doorsBroken) || 0) + 1;
    },

    moves: {
      stand: {
        id: 'stand', name: 'Closed', intent: Intent.SLEEP,
        tell: 'The door is shut. Nothing behind it can be reached while it holds.',
        effect() {},
      },
      ajar: {
        id: 'ajar', name: 'Open', intent: Intent.SLEEP,
        tell: 'The door stands open. It cannot be attacked, and something is using it.',
        effect() {},
      },
    },
    nextMove: (c) => (mem(c).open ? 'ajar' : 'stand'),

    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 1) h.notes.push('Courage +6%.');
      if (level >= 9) {
        h.flags.startOpen = false;
        h.notes.push('Haunt 9: The Wardrobe begins with one Door already open (set on the left Door).');
      }
      return h;
    },
  };
}

export const wardrobeDoorLeft = wardrobeDoor(
  'wardrobe-door-left', 'Left Door',
  'The hinges were replaced at some point with something that is not metal.',
);
export const wardrobeDoorRight = wardrobeDoor(
  'wardrobe-door-right', 'Right Door',
  'There are scratches on the inside of this one. Only on the inside.',
);
// Haunt 9 opens exactly one Door; the left one is the authored choice.
wardrobeDoorLeft.hauntScaling = (level) => {
  const h = hauntBase(level, 'elite');
  if (level >= 1) h.notes.push('Courage +6%.');
  if (level >= 9) {
    h.flags.startOpen = true;
    h.notes.push('Haunt 9: begins the fight already open.');
  }
  return h;
};

export const theWardrobe = {
  id: 'the-wardrobe',
  name: 'The Wardrobe',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  hp: [132, 132],
  silhouette: 'wardrobe',
  palette: ['#3f2c1e', '#7a5636', '#100d14'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 2 },
  scale: 1.85,
  lore: 'Its doors lead somewhere considerably larger than the piece of furniture should contain.',

  doors: ['wardrobe-door-left', 'wardrobe-door-right'],
  /**
   * "Maximum summons: 2 with one or two players, 3 with three, 4 with four."
   * (docs/design/regions/03-sleeping-quarters.md §45.) Same number at one and
   * two Kids; only reachable if MAX_PARTY ever grows.
   */
  maxSummons: 2,
  maxSummonsFor(c) { return Math.max(2, Math.min(4, c.partySize())); },

  doorActors(c) { return allies(c).filter(a => theWardrobe.doors.includes(a.id)); },
  brokenDoors(c) { return (mem(c).doorsBroken || 0); },

  /** The body is untargetable until at least one Door is broken. */
  isTargetable(c) { return theWardrobe.brokenDoors(c) >= 1; },
  /** Both Doors broken → fully exposed, 20% more damage taken for the rest of combat. */
  damageTakenMul(c) { return theWardrobe.brokenDoors(c) >= 2 ? 1.2 : 1; },

  onDeath(c) {
    // "Summoned enemies disappear when The Wardrobe is defeated."
    for (const a of allies(c)) if (a.summonedBy === (c.self.uid ?? c.self.id)) c.despawn(a);
  },

  moves: {
    'creak-open': {
      id: 'creak-open', name: 'Creak Open', intent: Intent.SUMMON,
      tell: 'One door swings wide on its own. The inside is much too deep.',
      summons: WARDROBE_SUMMONS,
      effect(c) {
        const shut = theWardrobe.doorActors(c).filter(d => !d.mem?.open && !d.mem?.broken);
        if (shut.length) (shut[0].mem ||= {}).open = true;
        const own = allies(c).filter(a => a.summonedBy === (c.self.uid ?? c.self.id));
        if (own.length < theWardrobe.maxSummonsFor(c)) {
          const pick = WARDROBE_SUMMONS[c.rng.int(WARDROBE_SUMMONS.length)];
          c.summon(pick.enemyId, { hpMul: pick.hpMul });
        }
      },
    },
    'slam-shut': {
      id: 'slam-shut', name: 'Slam Shut', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'Both doors come to at once, hard enough to move the floorboards.',
      effect(c) {
        for (const d of theWardrobe.doorActors(c)) if (!d.mem?.broken) (d.mem ||= {}).open = false;
        hitPlayer(c, 8);
      },
    },
    'something-reaches-out': {
      id: 'something-reaches-out', name: 'Something Reaches Out', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'An arm comes out that does not match anything else in the room.',
      effect(c) { hitPlayer(c, 13); },
    },
    'empty-hangers': {
      id: 'empty-hangers', name: 'Empty Hangers', intent: Intent.DEBUFF, block: 10,
      tell: 'Every hanger inside is empty, and every one of them is swinging.',
      applies: [{ id: 'frightened', stacks: 1, to: 'player' }],
      effect(c) { c.applyStatus(c.player, 'frightened', 1); c.block(c.self, 10); },
    },
  },

  nextMove: (c) => cyc(
    ['creak-open', 'something-reaches-out', 'slam-shut', 'empty-hangers'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: begins with one Door already open (see wardrobe-door-left).');
    return h;
  },
};

export const SLEEPING_QUARTERS_ENEMIES = [
  pillowPuff, slipperSkitter, wardrobeGuest, blanketCreeper, nightlightSnuffer, thingBeneath,
  nightTerror, blanketHydra, hydraHeadSnoring, hydraHeadBiting, hydraHeadCrying,
  theWardrobe, wardrobeDoorLeft, wardrobeDoorRight,
];
