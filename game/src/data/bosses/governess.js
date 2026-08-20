/**
 * The Governess — Forgotten Nursery region boss. OWNER: enemies.
 * Source of truth: docs/design/regions/02-nursery.md §15–§24.
 *
 * She does not believe she is cruel. She believes everything damaged should be repaired,
 * everything messy corrected, and everything frightened kept somewhere safe. Forever,
 * if necessary. "Nothing properly cared for should ever be allowed to come apart."
 *
 *   Phase 1  280 → 151   Stitched Together: Favorite Doll eats the first 10 damage each
 *                        turn. Tear the Doll, get a window, watch her spend a turn mending.
 *   Transition at ≤150   Look What You've Done: the Doll is permanently Torn, and she
 *                        starts patching herself with what is left of it.
 *   Phase 2  150 → 0     A three-Patch cycle you can either play around or hit through.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, countMoves, hitPlayer, dmgTaken,
  hauntBase, flag, isAlive,
} from '../enemies/_lib.js';

const PHASE2_AT = 150;

/** Favorite Doll's random Patch, visible before the first player turn. */
export const DOLL_PATCHES = {
  'stuffed-patch': { id: 'stuffed-patch', name: 'Stuffed Patch', desc: 'Favorite Doll has 10 additional maximum Courage.' },
  'button-patch': { id: 'button-patch', name: 'Button Patch', desc: 'Whenever damage is redirected into Favorite Doll, The Governess gains 2 Guard. Maximum 6 per turn.' },
  'lace-patch': { id: 'lace-patch', name: 'Lace Patch', desc: 'Whenever The Governess repairs Favorite Doll, it returns with 6 additional Courage.' },
};
const DOLL_PATCH_IDS = Object.keys(DOLL_PATCHES);

// ─────────────────────────────────────────────────────────────────────────────
// Favorite Doll — not an independent actor, a limb of the boss
// ─────────────────────────────────────────────────────────────────────────────
export const favoriteDoll = {
  id: 'favorite-doll',
  name: 'Favorite Doll',
  region: 'nursery',
  tier: 'boss',
  role: 'bossPart',
  hp: [50, 50],
  silhouette: 'favorite-doll',
  palette: ['#f2e2d0', '#b9899a', '#5a4450'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.85,
  passive: true,
  lore: 'She has repaired it so many times that none of the original doll is left. She has never once considered that this might matter.',

  onSpawn(c) {
    // One Patch, rolled from the run seed and shown before the first player turn.
    const n = flag(c, 'patchCount', 1);
    const pool = c.rng.shuffle(DOLL_PATCH_IDS).slice(0, n);
    mem(c).patches = pool;
    setCnt(c, 'patches', pool.length);
    if (pool.includes('stuffed-patch')) {
      c.self.maxHp += 10;
      c.self.hp += 10;
    }
  },

  hasPatch(c, id) { return (mem(c).patches || []).includes(id); },

  /** Torn: still on the battlefield, no longer redirecting, no longer targetable. */
  isTorn(c) { return !!mem(c).torn; },

  onDeath(c) {
    mem(c).torn = true;
    mem(c).tornOnTurn = c.turn;
  },

  moves: {
    'sit-still': {
      id: 'sit-still', name: 'Held Together', intent: Intent.SLEEP,
      tell: 'It does not act on its own. It is only here to be hurt instead of her.',
      effect() { /* the Doll never takes an action */ },
    },
  },

  nextMove: () => 'sit-still',

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.patchCount = 2;
      h.notes.push('Haunt 10: Favorite Doll carries two Patches instead of one. Both function simultaneously.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// The Governess
// ─────────────────────────────────────────────────────────────────────────────
const REPAIR_PATCHES = ['reinforced', 'stuffed', 'buttoned'];

export const governess = {
  id: 'governess',
  name: 'The Governess',
  region: 'nursery',
  tier: 'boss',
  role: 'boss',
  hp: [280, 280],
  silhouette: 'governess',
  palette: ['#2b2233', '#6b5a72', '#e6dcc8'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.55,
  lore: 'Her dress is made from nursery curtains, her fingers taper into silver needles, and a measuring tape moves around her neck like a snake.',

  phases: 2,
  phaseThresholds: [PHASE2_AT],
  escort: [{ enemyId: 'favorite-doll' }],

  onSpawn(c) {
    mem(c).phase = 1;
    mem(c).emergencyRepairs = 0;
    mem(c).cycle = 0;
    setCnt(c, 'repair-patch', 0);
  },

  phase(c) { return mem(c).phase || 1; },

  doll(c) { return allies(c).find(a => a.id === 'favorite-doll') || null; },
  dollActive(c) {
    const d = governess.doll(c);
    return !!d && !(d.mem && d.mem.torn) && (d.hp || 0) > 0;
  },

  /**
   * Stitched Together. The engine calls this before applying damage to her, once per
   * player turn's worth of redirection, and it returns how much to divert into the Doll.
   */
  redirect(c, incoming) {
    if (governess.phase(c) >= 2 || !governess.dollActive(c)) return 0;
    const used = mem(c).redirectedThisTurn || 0;
    const take = Math.max(0, Math.min(incoming, 10 - used));
    if (take > 0) {
      mem(c).redirectedThisTurn = used + take;
      const d = governess.doll(c);
      c.damage(d, take, { redirected: true });
      // Button Patch: she profits from being protected. Capped at 6 Guard per turn.
      if (d && d.mem?.patches?.includes('button-patch')) {
        const gained = mem(c).buttonGuardThisTurn || 0;
        if (gained < 6) { c.block(c.self, 2); mem(c).buttonGuardThisTurn = gained + 2; }
      }
    }
    return take;
  },

  onPlayerTurnStart(c) {
    mem(c).redirectedThisTurn = 0;
    mem(c).buttonGuardThisTurn = 0;
  },

  onPlayerTurnEnd(c) {
    if (governess.phase(c) < 2) return;
    // Tearing a Repair Patch: 20+ damage in one player turn kills the active one outright.
    if (dmgTaken(c) >= 20) mem(c).patchTorn = true;
    // Stuffed Patch: she recovers if you were too gentle.
    if (governess.activePatch(c) === 'stuffed' && dmgTaken(c) < 12) c.heal(c.self, 5);
  },

  /** Active phase-two Repair Patch, or null while torn. Cycle is always the same. */
  activePatch(c) {
    if (governess.phase(c) < 2 || mem(c).patchTorn) return null;
    return REPAIR_PATCHES[cnt(c, 'repair-patch') % REPAIR_PATCHES.length];
  },

  /** Reinforced Patch: the first damaging Trick each turn deals 6 less. */
  modifyIncoming(c, amount, isFirstThisTurn) {
    if (governess.activePatch(c) === 'reinforced' && isFirstThisTurn) return Math.max(0, amount - 6);
    return amount;
  },

  /** Buttoned Patch: every Guard gain is 4 bigger. */
  gainGuard(c, n) {
    c.block(c.self, n + (governess.activePatch(c) === 'buttoned' ? 4 : 0));
  },

  /** Advance the Patch after every Governess turn. A torn Patch still yields to the next. */
  advancePatch(c) {
    if (governess.phase(c) < 2) return;
    setCnt(c, 'repair-patch', (cnt(c, 'repair-patch') + 1) % REPAIR_PATCHES.length);
    mem(c).patchTorn = false;
  },

  /** Mend My Darling is legal only once the player has had a turn with the Doll Torn. */
  canMend(c) {
    const d = governess.doll(c);
    if (governess.phase(c) >= 2 || !d || !d.mem?.torn) return false;
    return (c.turn || 0) > (d.mem.tornOnTurn || 0);
  },

  moves: {
    // ── phase one ────────────────────────────────────────────────────────────
    'inspect-the-nursery': {
      id: 'inspect-the-nursery', name: 'Inspect the Nursery', intent: Intent.DEFEND, block: 10,
      tell: 'She runs a finger along a shelf and looks at it for a long moment.',
      effect(c) {
        c.block(c.self, 10);
        const d = governess.doll(c);
        if (d && !d.mem?.torn) c.block(d, 8);
      },
    },
    'sharp-correction': {
      id: 'sharp-correction', name: 'Sharp Correction', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'Her needles come together with a small, tidy click.',
      effect(c) { hitPlayer(c, 11); },
    },
    'mind-your-seams': {
      id: 'mind-your-seams', name: 'Mind Your Seams', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 2,
      tell: 'She takes in a seam somewhere on you that you did not know you had.',
      effect(c) { hitPlayer(c, 5, 2); c.applyStatus(c.player, 'seam-pinch', 1); },
    },
    'mend-my-darling': {
      id: 'mend-my-darling', name: 'Mend My Darling', intent: Intent.BUFF,
      tell: 'She gathers the Doll into her lap and begins, patiently, to put it back.',
      effect(c) {
        const d = governess.doll(c);
        if (d) {
          const bonus = d.mem?.patches?.includes('lace-patch') ? 6 : 0;
          d.mem.torn = false;
          d.alive = true;
          d.hp = Math.min(d.maxHp, 28 + bonus);
        }
        c.block(c.self, 6);
      },
    },

    // ── transition ───────────────────────────────────────────────────────────
    'look-what-youve-done': {
      id: 'look-what-youve-done', name: "Look What You've Done", intent: Intent.BUFF,
      tell: 'She looks at the Doll. Then at you. Then she starts taking the Doll apart herself.',
      phaseTransition: 2,
      effect(c) {
        const d = governess.doll(c);
        if (d) {
          d.mem = d.mem || {};
          d.mem.torn = true;
          d.mem.permanent = true;
          d.alive = false;
          d.hp = 0;
          c.despawn(d);
        }
        mem(c).phase = 2;
        setCnt(c, 'repair-patch', 0);
        mem(c).patchTorn = false;
      },
    },

    // ── phase two ────────────────────────────────────────────────────────────
    'needle-point': {
      id: 'needle-point', name: 'Needle Point', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'One long silver finger, held perfectly level.',
      damageFn: (c) => 13 + (mem(c).tightened ? 5 : 0),
      effect(c) {
        hitPlayer(c, 13 + (mem(c).tightened ? 5 : 0));
        mem(c).tightened = false;
      },
    },
    'tighten-the-stitch': {
      id: 'tighten-the-stitch', name: 'Tighten the Stitch', intent: Intent.DEFEND_BUFF, block: 13,
      tell: 'She pulls a thread through herself and draws it tight.',
      blockFn: (c) => 13 + (governess.activePatch(c) === 'buttoned' ? 4 : 0),
      effect(c) { governess.gainGuard(c, 13); mem(c).tightened = true; },
    },
    'snip-snip': {
      id: 'snip-snip', name: 'Snip Snip', intent: Intent.ATTACK, damage: 4, hits: 3,
      tell: 'Three quick cuts, the way one trims a loose thread.',
      effect(c) { hitPlayer(c, 4, 3); },
    },
    'emergency-repair': {
      id: 'emergency-repair', name: 'Emergency Repair', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'She stops fighting entirely and repairs herself, which she finds humiliating.',
      blockFn: (c) => 8 + (governess.activePatch(c) === 'buttoned' ? 4 : 0),
      effect(c) {
        c.heal(c.self, 10);
        governess.gainGuard(c, 8);
        mem(c).emergencyRepairs = (mem(c).emergencyRepairs || 0) + 1;
        mem(c).lastEmergencyCycle = mem(c).cycle;
      },
    },
  },

  nextMove(c) {
    const hp = c.self.hp ?? 0;
    const hist = c.history || [];

    if (governess.phase(c) === 1 && hp <= PHASE2_AT && !hist.includes('look-what-youve-done')) {
      return 'look-what-youve-done';
    }

    if (governess.phase(c) === 1) {
      const p1 = ['inspect-the-nursery', 'sharp-correction', 'mind-your-seams', 'sharp-correction'];
      const i = countMoves(c, p1.concat('mend-my-darling'));
      const planned = cyc(p1, i);
      // "Mend My Darling replaces the next Inspect the Nursery."
      if (planned === 'inspect-the-nursery' && governess.canMend(c)) return 'mend-my-darling';
      return planned;
    }

    // Phase two: Needle Point, Tighten the Stitch, Snip Snip, Needle Point, then check
    // Emergency Repair. Twice per combat, never on consecutive cycles, and only when
    // there is actually something to repair.
    const p2 = ['needle-point', 'tighten-the-stitch', 'snip-snip', 'needle-point'];
    const acted = countMoves(c, p2);
    const cycle = Math.floor(acted / p2.length);
    if (acted > 0 && acted % p2.length === 0) {
      const used = countMoves(c, 'emergency-repair');
      const missing = (c.self.maxHp || 0) - (c.self.hp || 0);
      const last = lastEmergency(c);
      // Twice per combat, never on back-to-back cycles, and only when it would do something.
      if (used < 2 && last !== cycle && last !== cycle - 1 && missing >= 15) return 'emergency-repair';
    }
    return cyc(p2, acted);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.notes.push('Haunt 10: Favorite Doll carries two Patches instead of one (see favorite-doll).');
    }
    return h;
  },
};

/** Which cycle Emergency Repair last fired on. Kept pure for nextMove. */
function lastEmergency(c) {
  const h = c.history || [];
  const i = h.lastIndexOf('emergency-repair');
  if (i < 0) return -Infinity;
  const p2 = ['needle-point', 'tighten-the-stitch', 'snip-snip', 'needle-point'];
  const before = h.slice(0, i).filter(m => p2.includes(m)).length;
  return Math.floor(before / p2.length);
}

export const NURSERY_BOSSES = [governess, favoriteDoll];
