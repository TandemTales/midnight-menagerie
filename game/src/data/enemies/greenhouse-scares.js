/**
 * The Impossible Greenhouse — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/05-greenhouse.md §13–§15.
 *
 *   The Compost Colossus        a body that regrows unless you take its Nodes,
 *                               and Nodes that stop coming back once it is
 *                               below half.
 *   The Carnivorous Conservatory a pressure gauge. Ignore the room and the room
 *                               becomes the fight.
 *   The Ancient Topiary          four forms, and the player picks the branch
 *                               every single turn with their first Trick.
 *
 * All three are the region's thesis at Big Scare size: a small thing left alone
 * becomes the problem.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, played, hitPlayer, hauntBase, flag, isAlive,
} from './_lib.js';

const REGION = 'greenhouse';

/* ══ Big Scare 1 — the Compost Colossus (§13) ════════════════════════════════ */
export const regrowthNode = {
  id: 'regrowth-node',
  name: 'Regrowth Node',
  region: REGION,
  tier: 'elite',
  role: 'bossPart',
  hp: [16, 16],
  silhouette: 'compost-node',
  palette: ['#6b5a35', '#a08c58', '#2e2718'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.45,
  summonOnly: true,
  remnant: true,
  node: true,
  lore: 'A knot of roots and broken pot the size of a football, pulsing gently in the side of something much larger.',

  onDeath(c) {
    // The regrowth clock lives on the COLOSSUS, so a destroyed Node is gone and
    // its slot is what remembers — §13's "it begins a three turn regrowth timer".
    const body = allies(c).find(a => isAlive(a) && a.defId === 'compost-colossus');
    if (!body) return;
    const bm = (body.mem ||= {});
    if (typeof bm.regrow !== 'number' || bm.regrow <= 0) bm.regrow = 3;
  },

  moves: {
    pulse: {
      id: 'pulse', name: 'Pulse', intent: Intent.DEFEND, block: 2,
      tell: 'It swells once, and something further up gets a little better.',
      effect(c) { c.block(c.self, 2); },
    },
  },
  nextMove: () => 'pulse',
  hauntScaling: (level) => hauntBase(level, 'elite'),
};

export const compostColossus = {
  id: 'compost-colossus',
  name: 'The Compost Colossus',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [132, 132],
  silhouette: 'compost',
  palette: ['#5c4a2a', '#8f7846', '#241d10'],
  shape: { body: 'sprawling', limbs: 2, eyes: 1 },
  scale: 1.5,
  lore: 'Soil, rotting leaves, broken flowerpots, pruning scraps, worms and discarded roots, standing up.',

  onCombatStart(c) {
    for (let i = 0; i < 3; i++) c.summon('regrowth-node', { hp: 16 });
    announceNodes(c);
  },

  /** "At the end of the Colossus's turn: each surviving Node restores 4, max 12." */
  onTurnEnd(c) {
    const n = nodes(c).length;
    if (n) c.heal(c.self, Math.min(12, 4 * n));
    const m = mem(c);
    if (typeof m.regrow === 'number' && m.regrow > 0) {
      m.regrow -= 1;
      if (m.regrow === 0) {
        // Below half, destroyed Nodes stop coming back (§13).
        if (c.self.hp > c.self.maxHp / 2 && nodes(c).length < 3) {
          c.summon('regrowth-node', { hp: 8 });
          c.say('Something grows back.', 'warn');
        }
        m.regrow = -1;
      }
    }
    announceNodes(c);
  },

  moves: {
    'compost-fist': {
      id: 'compost-fist', name: 'Compost Fist', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'It gathers a great deal of itself into one shape and swings it.',
      effect(c) { hitPlayer(c, 12); },
    },
    'heap-up': {
      id: 'heap-up', name: 'Heap Up', intent: Intent.DEFEND, block: 12,
      tell: 'It piles more of the floor onto itself.',
      effect(c) {
        c.block(c.self, 12);
        const m = mem(c);
        if (typeof m.regrow === 'number' && m.regrow > 0) m.regrow -= 1;
        announceNodes(c);
      },
    },
    'root-slam': {
      id: 'root-slam', name: 'Root Slam', intent: Intent.ATTACK, damage: 6, hits: 2,
      tell: 'Two roots come up through the flagstones, one after the other.',
      effect(c) {
        hitPlayer(c, 6, 2);
        const m = mem(c);
        if (nodes(c).length < 3 && !(typeof m.regrow === 'number' && m.regrow > 0)) {
          c.summon('regrowth-node', { hp: 16 });
          announceNodes(c);
        }
      },
    },
    mulch: {
      id: 'mulch', name: 'Mulch', intent: Intent.BUFF,
      tell: 'It composts a piece of itself and feeds it to the rest.',
      effect(c) {
        c.loseHp(c.self, 6);
        for (const n of nodes(c)) c.heal(n, n.maxHp);
      },
    },
  },

  nextMove: (c) => cyc(['compost-fist', 'heap-up', 'root-slam', 'mulch'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: Nodes regrow in two turns rather than three.');
    if (level >= 9) h.flags.regrowTurns = 2;
    return h;
  },
};
function nodes(c) { return allies(c).filter(a => isAlive(a) && a.def?.node); }
function announceNodes(c) {
  const n = nodes(c).length;
  const m = mem(c);
  const waiting = (typeof m.regrow === 'number' && m.regrow > 0) ? ` One regrows in ${m.regrow}.` : '';
  c.announceRule({
    id: `nodes:${c.self.id}`,
    name: `Regrowth Nodes — ${n}`,
    text: `Each surviving Node restores 4 Courage to the Colossus at the end of its turn, up to 12.${waiting}`
      + ' Below half Courage, destroyed Nodes stop coming back.',
  });
}

/* ══ Big Scare 2 — the Carnivorous Conservatory (§14) ════════════════════════ */
export const growthPatch = {
  id: 'growth-patch',
  name: 'Growth Patch',
  region: REGION,
  tier: 'elite',
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
    rm.patchBack = 2;                        // regrows after two enemy turns
  },

  moves: {
    spread: {
      id: 'spread', name: 'Spread', intent: Intent.DEFEND, block: 2,
      tell: 'It creeps another few inches across the tiles.',
      effect(c) { c.block(c.self, 2); },
    },
  },
  nextMove: () => 'spread',
  hauntScaling: (level) => hauntBase(level, 'elite'),
};

export const carnivorousConservatory = {
  id: 'carnivorous-conservatory',
  name: 'The Carnivorous Conservatory',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [145, 145],
  silhouette: 'conservatory',
  palette: ['#2f6b3d', '#6fb37a', '#152a19'],
  shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  scale: 1.6,
  lore: 'An entire greenhouse room that has decided to be predatory. The vines seal the doors behind you.',

  onCombatStart(c) {
    mem(c).overgrowth = 0;
    setCnt(c, 'overgrowth', 0);
    for (let i = 0; i < 2; i++) c.summon('growth-patch', { hp: 12 });
    announceRoom(c);
  },

  onTurnStart(c) { if (over(c) >= 2) c.block(c.self, 4); },

  onTurnEnd(c) {
    const m = mem(c);
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
    'vine-across-the-door': {
      id: 'vine-across-the-door', name: 'Vine Across the Door', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'Something thick grows across the way you came in.',
      effect(c) { grow(c, 1); c.block(c.self, 8); },
    },
    'hungry-flowers': {
      id: 'hungry-flowers', name: 'Hungry Flowers', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + (over(c) >= 4 ? 3 : 0),
      tell: 'Every flower in the room turns to face you at once.',
      effect(c) { hitPlayer(c, 5 + (over(c) >= 4 ? 3 : 0), 2); },
    },
    'root-burst': {
      id: 'root-burst', name: 'Root Burst', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + (over(c) >= 4 ? 3 : 0),
      tell: 'The floor bulges, and then it does not hold.',
      effect(c) { hitPlayer(c, 10 + (over(c) >= 4 ? 3 : 0)); grow(c, 1); },
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
      tell: 'The room closes.',
      effect(c) {
        hitPlayer(c, 24);
        mem(c).overgrowth = 3;
        setCnt(c, 'overgrowth', 3);
        for (const p of patches(c)) c.despawn(p);
        mem(c).patchBack = 2;
        announceRoom(c);
      },
    },
  },

  /** Room Consumed replaces the next action whenever Overgrowth reaches 6. */
  nextMove: (c) => {
    if (over(c) >= 6) return 'room-consumed';
    return cyc(['vine-across-the-door', 'hungry-flowers', 'root-burst', 'seed-everywhere'],
      (c.history || []).filter(x => x !== 'room-consumed').length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
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
      + 'Break a Growth Patch to take one Overgrowth back off it.',
  });
}

/* ══ Big Scare 3 — the Ancient Topiary (§15) ═════════════════════════════════
 *
 * "This means the player always controls the branch." Two forms are announced
 * every turn; the player's FIRST Trick decides which one arrives — Attack takes
 * the left, anything else the right. So the fight is a question asked once a
 * turn, and the answer is the first card you play.
 */
const ANCIENT = {
  fox: { name: 'Fox', move: 'thorn-dash' },
  bear: { name: 'Bear', move: 'hedge-maul' },
  tortoise: { name: 'Tortoise', move: 'ancient-shell' },
  stag: { name: 'Stag', move: 'branching-crown' },
};
/** The branch offered after each form. Left is taken by an Attack. */
const BRANCH = {
  fox: ['bear', 'stag'],
  bear: ['tortoise', 'fox'],
  tortoise: ['bear', 'stag'],
  stag: ['fox', 'tortoise'],
};

export const ancientTopiary = {
  id: 'ancient-topiary',
  name: 'The Ancient Topiary',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [138, 138],
  silhouette: 'topiary',
  palette: ['#2f5c2a', '#6ba05e', '#16290f'],
  shape: { body: 'sprawling', limbs: 4, eyes: 0 },
  scale: 1.55,
  lore: 'A hedge somebody started cutting into an animal a very long time ago, and never stopped.',

  onSpawn(c) { mem(c).form = 'fox'; announceBranch(c); },

  /**
   * The branch resolves at the START of the player's turn, from the turn that
   * just ended — so the form that acts is the one the announcement promised,
   * and the new announcement goes up before the player commits their next
   * first Trick.
   */
  onPlayerReady(c) {
    const m = mem(c);
    if (!m.pending) { announceBranch(c); return; }
    const first = (c.cardsPlayedThisTurn || [])[0];
    void first;
    m.pending = false;
    announceBranch(c);
  },

  onPlayerTurnEnd(c) {
    const m = mem(c);
    const opts = BRANCH[m.form || 'fox'];
    const first = played(c)[0];
    m.form = first && first.type === 'attack' ? opts[0] : opts[1];
    m.pending = true;
  },

  moves: {
    'thorn-dash': {
      id: 'thorn-dash', name: 'Thorn Dash', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => 4 + cnt(c, 'growth'),
      tell: 'Three passes, too fast to be a hedge.',
      effect(c) { hitPlayer(c, 4 + cnt(c, 'growth'), 3); c.block(c.self, 5); },
    },
    'hedge-maul': {
      id: 'hedge-maul', name: 'Hedge Maul', intent: Intent.ATTACK, damage: 15, hits: 1,
      damageFn: (c) => 15 + cnt(c, 'growth'),
      tell: 'It stands up on its hind branches.',
      effect(c) { hitPlayer(c, 15 + cnt(c, 'growth')); },
    },
    'ancient-shell': {
      id: 'ancient-shell', name: 'Ancient Shell', intent: Intent.DEFEND, block: 18,
      tell: 'Every branch folds inward and knits.',
      effect(c) { c.block(c.self, 18); c.heal(c.self, 3); },
    },
    'branching-crown': {
      id: 'branching-crown', name: 'Branching Crown', intent: Intent.BUFF,
      tell: 'It puts out new growth where the antlers would be.',
      effect(c) { addCnt(c, 'growth', 1, 5); announceBranch(c); },
    },
  },

  nextMove: (c) => ANCIENT[mem(c).form || 'fox'].move,

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: it begins with 1 Growth already banked.');
    if (level >= 9) h.counters.growth = 1;
    return h;
  },
};
function announceBranch(c) {
  const form = mem(c).form || 'fox';
  const [left, right] = BRANCH[form];
  c.announceRule({
    id: `branch:${c.self.id}`,
    name: `${ANCIENT[form].name} Form · Growth ${cnt(c, 'growth')}`,
    text: `Play an Attack first next turn and it becomes a ${ANCIENT[left].name}. `
      + `Play anything else first and it becomes a ${ANCIENT[right].name}. `
      + 'Each Growth is 1 more attack damage, for good.',
  });
}

export const GREENHOUSE_SCARES = [
  compostColossus, regrowthNode,
  carnivorousConservatory, growthPatch,
  ancientTopiary,
];
