/**
 * The Carnivorous Conservatory — the Impossible Greenhouse boss. OWNER: enemies.
 * Source of truth: docs/design/regions/05-greenhouse.md §14 and §14a.
 *
 * "This Big Scare is not one plant. It is an entire greenhouse room that has
 * become predatory. Vines seal the doors. Flowers turn toward the player. Roots
 * move beneath the floor."
 *
 * THE BOSS SINCE 2026-09-12. Josh: "i need the carnivorous conservatory the boss
 * of that level instead of the head gardener (who would now just be a big
 * scare)". It was a Big Scare at 145 in `enemies/greenhouse-scares.js`; the Head
 * Gardener was the boss and is now a Big Scare in `enemies/greenhouse-gardener.js`.
 *
 * ── PHASE ONE IS §14, UNCHANGED ─────────────────────────────────────────────
 *
 * A pressure gauge. Overgrowth climbs to 6: at 2 it takes 4 Guard a turn, at 4
 * its attacks deal 3 more, at 6 it closes the room for 24 and falls back to 3.
 * Breaking a Growth Patch takes one Overgrowth back off it, and the Patch
 * regrows two enemy turns later. Ignore the room and the room becomes the fight.
 *
 * ── PHASE TWO IS WHAT A BOSS NEEDS AND A BIG SCARE DID NOT ──────────────────
 *
 * §14 is a 145-Courage fight. At boss size the same loop only repeats: Room
 * Consumed on a timer until one side runs out, which is the treadmill shape the
 * Greenhouse already had under the Head Gardener (see tests/design-courage).
 * `docs/STS2-REFERENCE.md` names the convention a boss follows: "Multi-phase
 * bosses | Phase transition below 50% HP: debuff clear + AoE". So at half it
 * plays THE GLASS GIVES WAY — it clears its debuffs, hits every Kid, and every
 * Patch it had lost comes back at once — and from then on the room grows by
 * itself: 1 Overgrowth at the end of each of its turns, and a broken Patch is
 * back after one turn rather than two. The counterplay is the one the whole
 * fight teaches, on a faster clock.
 *
 * ── COURAGE ─────────────────────────────────────────────────────────────────
 *
 * 300: the band the two bosses before it sit in (the Bedframe Beast 295, the
 * Confectioner 305), and below the 320 the Head Gardener carried here. An
 * opening bid like every boss chapter's; tune it against the run gate.
 */

import { Intent } from '../schema.js';
import {
  mem, setCnt, allies, cyc, hitPlayer, hauntBase, bossDmg, flag, isAlive, phaseAt,
} from '../enemies/_lib.js';

const REGION = 'greenhouse';
const SOLO_MAX = 300;
const PHASE_TWO_AT = 150;

/**
 * §38: "Room Consumed damages all players", 17 / 15 / 14 each for two, three and
 * four Kids against 24 alone. Every move that lands on the whole table here is
 * scaled by those same shares, so coverage is bought with per-head damage the
 * way the chapter already priced it.
 */
const PARTY_SHARE = { 1: 1, 2: 17 / 24, 3: 15 / 24, 4: 14 / 24 };
function each(c, solo) {
  const n = Math.min(4, Math.max(1, (c.partySize && c.partySize()) || 1));
  return Math.round(solo * PARTY_SHARE[n]);
}

export const growthPatch = {
  id: 'growth-patch',
  name: 'Growth Patch',
  region: REGION,
  tier: 'boss',
  role: 'bossPart',
  hp: [12, 12],
  silhouette: 'patch',
  palette: ['#4a7c3a', '#86c46c', '#20351a'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 0.4,
  summonOnly: true,
  remnant: true,
  patch: true,
  lore: 'A patch of floor that has given up being floor. Things are coming through it.',

  onDeath(c) {
    const room = allies(c).find(a => isAlive(a) && a.defId === 'carnivorous-conservatory');
    if (!room) return;
    const rm = (room.mem ||= {});
    rm.overgrowth = Math.max(0, (rm.overgrowth || 0) - 1);
    if (room.counters) room.counters.overgrowth = rm.overgrowth;
    // regrows after two enemy turns, and after one once the glass has gone
    rm.patchBack = rm.phase === 2 ? 1 : 2;
  },

  moves: {
    spread: {
      id: 'spread', name: 'Spread', intent: Intent.DEFEND, block: 2,
      tell: 'It creeps another few inches across the tiles.',
      effect(c) { c.block(c.self, 2); },
    },
  },
  nextMove: () => 'spread',
  hauntScaling: (level) => hauntBase(level, 'boss'),
};

export const carnivorousConservatory = {
  id: 'carnivorous-conservatory',
  name: 'The Carnivorous Conservatory',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'conservatory',
  palette: ['#2f6b3d', '#6fb37a', '#152a19'],
  shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  scale: 1.6,
  lore: 'An entire greenhouse room that has decided to be predatory. The vines seal the doors behind you.',

  onCombatStart(c) {
    const m = mem(c);
    m.overgrowth = 0;
    m.phase = 1;
    setCnt(c, 'overgrowth', 0);
    for (let i = 0; i < 2; i++) c.summon('growth-patch', { hp: 12 });
    announceRoom(c);
  },

  onTurnStart(c) { if (over(c) >= 2) c.block(c.self, 4); },

  onTurnEnd(c) {
    const m = mem(c);
    // §14a: once the glass has gone, the room grows whether or not it is told to.
    if (m.phase === 2) grow(c, 1);
    if (typeof m.patchBack === 'number' && m.patchBack > 0) {
      m.patchBack -= 1;
      if (m.patchBack === 0 && patches(c).length < maxPatches(c)) {
        c.summon('growth-patch', { hp: 12 });
        c.say('The floor opens again.', 'warn');
      }
    }
    announceRoom(c);
  },

  moves: {
    /* ── §14, the gauge ───────────────────────────────────────────────────── */
    'vine-across-the-door': {
      id: 'vine-across-the-door', name: 'Vine Across the Door', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'Something thick grows across the way you came in.',
      effect(c) { grow(c, 1); c.block(c.self, 8); },
    },
    'hungry-flowers': {
      id: 'hungry-flowers', name: 'Hungry Flowers', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + (over(c) >= 4 ? 3 : 0) + bossDmg(c),
      tell: 'Every flower in the room turns to face you at once.',
      effect(c) { hitPlayer(c, 5 + (over(c) >= 4 ? 3 : 0) + bossDmg(c), 2); },
    },
    'root-burst': {
      id: 'root-burst', name: 'Root Burst', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + (over(c) >= 4 ? 3 : 0) + bossDmg(c),
      tell: 'The floor bulges, and then it does not hold.',
      effect(c) { hitPlayer(c, 10 + (over(c) >= 4 ? 3 : 0) + bossDmg(c)); grow(c, 1); },
    },
    'seed-everywhere': {
      id: 'seed-everywhere', name: 'Seed Everywhere', intent: Intent.SUMMON,
      tell: 'It scatters, indiscriminately.',
      effect(c) {
        if (patches(c).length < maxPatches(c)) c.summon('growth-patch', { hp: 12 });
        else grow(c, 1);
      },
    },
    'room-consumed': {
      id: 'room-consumed', name: 'Room Consumed', intent: Intent.ATTACK_BIG, damage: 24, hits: 1,
      partyTarget: 'all',
      damageFn: (c) => each(c, 24) + bossDmg(c),
      tell: 'The room closes.',
      tellFn: (c) => (c.partySize() > 1 ? 'The room closes on all of you.' : 'The room closes.'),
      effect(c) {
        hitPlayer(c, each(c, 24) + bossDmg(c));
        const m = mem(c);
        m.overgrowth = 3;
        setCnt(c, 'overgrowth', 3);
        for (const p of patches(c)) c.despawn(p);
        m.patchBack = m.phase === 2 ? 1 : 2;
        announceRoom(c);
      },
    },

    /* ── §14a, the turn ───────────────────────────────────────────────────── */
    'the-glass-gives-way': {
      id: 'the-glass-gives-way', name: 'The Glass Gives Way', intent: Intent.ATTACK, damage: 12, hits: 1,
      partyTarget: 'all',
      damageFn: (c) => each(c, 12) + bossDmg(c),
      tell: 'Every pane in the roof lets go at once.',
      tellFn: (c) => (c.partySize() > 1
        ? 'Every pane in the roof lets go at once, over all of you.'
        : 'Every pane in the roof lets go at once.'),
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        // StS2's phase transition: the debuffs go, and everyone is hit.
        c.cleanse(c.self);
        hitPlayer(c, each(c, 12) + bossDmg(c));
        for (let i = patches(c).length; i < maxPatches(c); i++) c.summon('growth-patch', { hp: 12 });
        m.patchBack = null;
        c.say('The room stops waiting to be told.', 'warn');
        announceRoom(c);
      },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    if ((m.phase || 1) === 1 && c.self.hp <= phaseAt(c, PHASE_TWO_AT, SOLO_MAX)) return 'the-glass-gives-way';
    // Room Consumed replaces the next action whenever Overgrowth reaches 6.
    if (over(c) >= 6) return 'room-consumed';
    return cyc(['vine-across-the-door', 'hungry-flowers', 'root-burst', 'seed-everywhere'],
      (c.history || []).filter(x => x !== 'room-consumed' && x !== 'the-glass-gives-way').length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) { h.flags.patches = 3; h.notes.push('Haunt 9: three Growth Patches rather than two.'); }
    return h;
  },
};

function over(c) { return mem(c).overgrowth || 0; }
function grow(c, n) {
  const m = mem(c);
  m.overgrowth = Math.min(6, (m.overgrowth || 0) + n);
  setCnt(c, 'overgrowth', m.overgrowth);
  announceRoom(c);
}
function patches(c) { return allies(c).filter(a => isAlive(a) && a.def?.patch); }
function maxPatches(c) { return flag(c, 'patches', 2); }
function announceRoom(c) {
  const o = over(c);
  c.announceRule({
    id: `room:${c.self.id}`,
    name: `Overgrowth ${o} / 6`,
    text: '2: it gains 4 Guard every turn. 4: its attacks deal 3 more. 6: the room closes for 24. '
      + 'Break a Growth Patch to take one Overgrowth back off it.'
      + (mem(c).phase === 2
        ? ' The glass is gone: it grows by 1 at the end of every turn, and a broken Patch is back after one.'
        : ' At half Courage the glass gives way.'),
  });
}

export const GREENHOUSE_BOSSES = [
  carnivorousConservatory, growthPatch,
];
