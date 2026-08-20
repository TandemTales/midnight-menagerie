/**
 * The Bedframe Beast — Sleeping Quarters region boss. OWNER: enemies.
 * Source of truth: docs/design/regions/03-sleeping-quarters.md §16–§33.
 *
 * The boss room looks like an enormous antique bedroom with no creature in it. Then the
 * four-poster moves: the legs unfold into jointed limbs, the mattress splits into a
 * mouth, the curtains become wings, and something beneath the bed laughs.
 *
 * The fight is about choosing when to attack and when to prepare.
 *
 *   Exposure states: Standing → Covered → Underneath, and back out through BOO.
 *   Phase 1  295 → 161   Long hide cycles. Scare built while Standing carries into the
 *                        ambush, so you can see a 30-damage BOO coming several turns out.
 *   Transition at ≤160   NO MORE HIDING: all Scare cleared, 15 Guard, the other beds in
 *                        the room drag themselves in and merge with it.
 *   Phase 2  160 → 0     One-turn hides, and three Bed Positions. Which one it emerges
 *                        from is a sequencing puzzle you can actually steer.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, countMoves, lastMove, hitPlayer, dmgTaken,
  hauntBase, flag, field, played,
} from '../enemies/_lib.js';

const PHASE2_AT = 160;

/** Left → Center → Right → Left. The rotation the player can push it around. */
export const BED_POSITIONS = ['left', 'center', 'right'];
export const BED_AMBUSH = { left: 'claw-ambush', center: 'giant-scare', right: 'grab-and-drag' };

export const bedframeBeast = {
  id: 'bedframe-beast',
  name: 'The Bedframe Beast',
  region: 'sleeping-quarters',
  tier: 'boss',
  role: 'boss',
  hp: [295, 295],
  silhouette: 'bedframe',
  palette: ['#2a1d16', '#6b4a33', '#c3b6a0'],
  shape: { body: 'sprawling', limbs: 8, eyes: 6 },
  scale: 2.0,
  lore: 'The whole bed is the monster. It has been keeping something underneath itself, and it does not intend to give it back.',

  phases: 2,
  phaseThresholds: [PHASE2_AT],
  maxScare: 3,

  onSpawn(c) {
    mem(c).phase = 1;
    mem(c).state = 'standing';
    setCnt(c, 'scare', flag(c, 'startScare', 0));
    field(c).bedPosition = 'left';
  },

  phase(c) { return mem(c).phase || 1; },
  state(c) { return mem(c).state || 'standing'; },
  isUnderneath(c) { return bedframeBeast.state(c) === 'underneath'; },
  isCovered(c) { return bedframeBeast.state(c) === 'covered'; },

  /** Covered: the first 12 damage each player turn is halved. */
  modifyIncoming(c, amount, alreadyTakenThisTurn = 0) {
    if (!bedframeBeast.isCovered(c)) return amount;
    const remaining = Math.max(0, 12 - alreadyTakenThisTurn);
    const softened = Math.min(amount, remaining);
    return Math.round(amount - softened * 0.5);
  },

  // ── Bed Positions (phase two) ──────────────────────────────────────────────
  /**
   * "Playing the third Trick of the turn moves the Rattling position one step clockwise.
   *  Playing the sixth moves it one additional step."
   * Derived from the base position banked at the start of the player turn, so the widget
   * can show the position moving the instant the third card lands.
   */
  rattling(c) {
    const base = BED_POSITIONS.indexOf(field(c).bedPosition || 'left');
    const n = played(c).length;
    const steps = (n >= 3 ? 1 : 0) + (n >= 6 ? 1 : 0);
    return BED_POSITIONS[(Math.max(0, base) + steps) % BED_POSITIONS.length];
  },

  onPlayerTurnEnd(c) {
    // Bank the steered position so it persists into the ambush.
    if (bedframeBeast.phase(c) >= 2) field(c).bedPosition = bedframeBeast.rattling(c);

    // Dragged Out: 18+ *indirect* damage while Underneath pulls it into the open early.
    if (bedframeBeast.isUnderneath(c) && (c.self.indirectDamageThisTurn || 0) >= 18) {
      mem(c).state = 'standing';
      addCnt(c, 'scare', -1, bedframeBeast.maxScareNow(c), 0);
      mem(c).disoriented = true;
    }
  },

  maxScareNow(c) { return flag(c, 'maxScare', 3); },

  moves: {
    // ── Standing, phase one ──────────────────────────────────────────────────
    'bedpost-swipe': {
      id: 'bedpost-swipe', name: 'Bedpost Swipe', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'A carved post swings around on a joint that should not exist.',
      effect(c) { hitPlayer(c, 11); },
    },
    'spring-snap': {
      id: 'spring-snap', name: 'Spring Snap', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'Two mattress springs come loose and go looking for you.',
      effect(c) { hitPlayer(c, 5, 2); },
    },
    'rattle-the-frame': {
      id: 'rattle-the-frame', name: 'Rattle the Frame', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'The whole frame shivers. Something under it is enjoying itself.',
      effect(c) { c.block(c.self, 8); addCnt(c, 'scare', 1, bedframeBeast.maxScareNow(c)); },
    },

    // ── Covered / retreat ────────────────────────────────────────────────────
    'pull-the-covers-up': {
      id: 'pull-the-covers-up', name: 'Pull the Covers Up', intent: Intent.DEFEND, block: 10,
      tell: 'It draws the blankets over itself the way a child does. It is not a child.',
      effect(c) { c.block(c.self, 10); mem(c).state = 'covered'; },
    },
    'retreat-underneath': {
      id: 'retreat-underneath', name: 'Retreat Underneath', intent: Intent.UNKNOWN,
      tell: 'The bed goes underneath itself. The architecture is impossible.',
      effect(c) { mem(c).state = 'underneath'; },
    },

    // ── Underneath ───────────────────────────────────────────────────────────
    'scratching-below': {
      id: 'scratching-below', name: 'Scratching Below', intent: Intent.DEBUFF,
      tell: 'Long slow scratches, directly beneath where you are standing.',
      addsCards: [{ id: 'drowsy', pile: 'discard' }],
      effect(c) { addCnt(c, 'scare', 1, bedframeBeast.maxScareNow(c)); c.addCard('drowsy', 'discard'); },
    },
    'footsteps-around-the-bed': {
      id: 'footsteps-around-the-bed', name: 'Footsteps Around the Bed', intent: Intent.DEBUFF,
      tell: 'Something walks a slow circle around you, and it is not under the bed any more.',
      applies: [{ id: 'frightened', stacks: 1, to: 'player' }],
      effect(c) {
        addCnt(c, 'scare', 1, bedframeBeast.maxScareNow(c));
        c.applyStatus(c.player, 'frightened', 1);
      },
    },
    boo: {
      id: 'boo', name: 'BOO', intent: Intent.ATTACK_BIG, damage: 9, hits: 1,
      tell: 'It has been quiet for a while now.',
      damageFn: (c) => 9 + 7 * cnt(c, 'scare'),
      effect(c) {
        mem(c).state = 'standing';
        hitPlayer(c, 9 + 7 * cnt(c, 'scare'));
        setCnt(c, 'scare', 0);
      },
    },
    disoriented: {
      id: 'disoriented', name: 'Disoriented', intent: Intent.DEFEND, block: 8,
      tell: 'You pulled it out before it was ready. It is not sure where you went.',
      effect(c) { c.block(c.self, 8); mem(c).disoriented = false; },
    },

    // ── Transition ───────────────────────────────────────────────────────────
    'no-more-hiding': {
      id: 'no-more-hiding', name: 'NO MORE HIDING', intent: Intent.DEFEND_BUFF, block: 15,
      tell: 'The mattress tears. Every other bed in the room starts dragging itself over.',
      phaseTransition: 2,
      effect(c) {
        setCnt(c, 'scare', 0);
        c.block(c.self, 15);
        mem(c).phase = 2;
        mem(c).state = 'standing';
        field(c).bedPosition = 'left';
      },
    },

    // ── Standing, phase two ──────────────────────────────────────────────────
    'splinter-swipe': {
      id: 'splinter-swipe', name: 'Splinter Swipe', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'The broken end of a bedpost, swung like a club.',
      effect(c) { hitPlayer(c, 13); },
    },
    'mattress-maw': {
      id: 'mattress-maw', name: 'Mattress Maw', intent: Intent.ATTACK_DEBUFF, damage: 6, hits: 2,
      tell: 'The mattress opens along its whole length.',
      // Conditional on both hits biting through, but the player must be able to plan for it.
      applies: [{ id: 'frightened', stacks: 1, to: 'player' }],
      effect(c) {
        const before = c.player.hp;
        hitPlayer(c, 6, 2);
        // Frightened only if both hits actually bit into Courage.
        if (c.player.hp < before - 6) c.applyStatus(c.player, 'frightened', 1);
      },
    },
    'shake-the-room': {
      id: 'shake-the-room', name: 'Shake the Room', intent: Intent.DEFEND_BUFF, block: 10,
      tell: 'Every loose thing in the bedroom hits the floor at once.',
      effect(c) { c.block(c.self, 10); addCnt(c, 'scare', 1, bedframeBeast.maxScareNow(c)); },
    },
    'dive-under': {
      id: 'dive-under', name: 'Dive Under', intent: Intent.UNKNOWN,
      tell: 'It is gone. One of the three beds is going to rattle.',
      effect(c) { mem(c).state = 'underneath'; },
    },

    // ── Phase two ambushes, one per Bed Position ─────────────────────────────
    'claw-ambush': {
      id: 'claw-ambush', name: 'Claw Ambush', intent: Intent.ATTACK, damage: 7, hits: 3,
      tell: 'The LEFT bed is rattling. Three sets of claws, one after another.',
      effect(c) { mem(c).state = 'standing'; hitPlayer(c, 7, 3); setCnt(c, 'scare', 0); },
    },
    'giant-scare': {
      id: 'giant-scare', name: 'Giant Scare', intent: Intent.ATTACK_BIG, damage: 13, hits: 1,
      tell: 'The CENTER bed is rattling. This is the big one.',
      damageFn: (c) => 13 + 5 * cnt(c, 'scare'),
      effect(c) {
        mem(c).state = 'standing';
        hitPlayer(c, 13 + 5 * cnt(c, 'scare'));
        setCnt(c, 'scare', 0);
      },
    },
    'grab-and-drag': {
      id: 'grab-and-drag', name: 'Grab and Drag', intent: Intent.ATTACK_DEBUFF, damage: 10, hits: 1,
      tell: 'The RIGHT bed is rattling. It is not going for your Courage.',
      addsCards: [{ id: 'drowsy', pile: 'discard' }, { id: 'drowsy', pile: 'discard' }],
      applies: [{ id: 'frightened', stacks: 1, to: 'player' }],
      effect(c) {
        mem(c).state = 'standing';
        hitPlayer(c, 10);
        c.addCard('drowsy', 'discard');
        c.addCard('drowsy', 'discard');
        c.applyStatus(c.player, 'frightened', 1);
        setCnt(c, 'scare', 0);
      },
    },
  },

  nextMove(c) {
    const hp = c.self.hp ?? 0;
    const hist = c.history || [];
    const phase = bedframeBeast.phase(c);

    if (phase === 1 && hp <= PHASE2_AT && !hist.includes('no-more-hiding')) return 'no-more-hiding';
    if (mem(c).disoriented) return 'disoriented';

    if (phase === 1) {
      // Opening once, then a repeating Standing → Covered → Underneath loop.
      const OPENING = [
        'bedpost-swipe', 'rattle-the-frame', 'spring-snap',
        'pull-the-covers-up', 'retreat-underneath',
        'scratching-below', 'footsteps-around-the-bed', 'boo',
      ];
      const LOOP = [
        'spring-snap', 'bedpost-swipe',
        'pull-the-covers-up', 'retreat-underneath',
        'scratching-below', 'footsteps-around-the-bed', 'boo',
      ];
      const n = hist.filter(m => m !== 'disoriented').length;
      if (n < OPENING.length) return OPENING[n];
      return cyc(LOOP, n - OPENING.length);
    }

    // Phase two: Splinter Swipe, Shake the Room, Mattress Maw, Dive Under, then the
    // ambush for whichever Bed Position the player left Rattling. One turn under, only.
    if (bedframeBeast.isUnderneath(c)) return BED_AMBUSH[field(c).bedPosition || 'left'];

    const P2 = ['splinter-swipe', 'shake-the-room', 'mattress-maw', 'dive-under'];
    const n = countMoves(c, P2);
    return cyc(P2, n);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.startScare = 1;
      h.counters.scare = 1;
      h.notes.push('Haunt 10: begins combat with 1 Scare, so its first retreat is immediately threatening.');
    }
    return h;
  },
};

export const SLEEPING_QUARTERS_BOSSES = [bedframeBeast];
