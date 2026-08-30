/**
 * The Heart of the House — the four Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/17-heart.md §16–§29.
 *
 * Separate from `heart.js` only because the Heart is the largest roster in the
 * game and one file of twenty definitions is a file nobody reads to the end.
 * Both are registered through `enemies/index.js`.
 *
 * The four ask four versions of one question:
 *
 *   Hall of Names       which part of the house's story do you erase first,
 *                       knowing that erasing one strengthens the rest?
 *   House Remembers     one familiar mechanic at a time, in a visible order you
 *                       are allowed to edit.
 *   Perfect Sanctuary   two of these three systems are HELPING you. Which ones
 *                       are actually hurting this deck?
 *   The Door That Says  you become stronger by accepting its hospitality, and
 *   Stay                it becomes easier to kill by being refused.
 *
 * None of them is a damage check, and none of them has a right answer that is
 * the same for two different decks. That is what a Heart Big Scare is for.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, countMoves, played,
  hitPlayer, hauntBase, flag, isAlive,
} from './_lib.js';
import { costRule, ordinal } from './heart.js';

const REGION = 'heart';

/* ══ Big Scare 1 — the Hall of Names (§16–§21) ═══════════════════════════════
 *
 * The Hall itself is the encounter: four Stones, 42 Courage each, each running
 * a schedule on its own clock. There is no fifth body — destroying a Stone
 * removes its schedule permanently and hands RESONANCE to the survivors, so
 * dismantling the Hall simplifies the timeline and strengthens what is left.
 *
 * `stone()` builds all four because they differ only in period, effect and
 * flavour. Writing them out four times would be four places to fix a schedule
 * bug, and the schedule is the entire encounter.
 */
function resonance(c) {
  // One per Stone already destroyed, banked on the survivor by `onAllyDeath`.
  return cnt(c, 'resonance');
}

function stone({ id, name, period, palette, lore, moveId, moveName, tell, intent, damage, block, run }) {
  return {
    id,
    name,
    region: REGION,
    tier: 'elite',
    role: 'stone',
    hp: [42, 42],
    silhouette: 'name-stone',
    palette,
    shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
    scale: 1.15,
    lore,

    onSpawn(c) { announceSchedule(c, name, period, moveName); },

    /**
     * "Each destroyed Stone gives surviving Stones: 1 additional damage to
     * damaging scheduled effects, 2 additional Guard to defensive scheduled
     * effects." (§21.) Banked as a counter so it is visible under the Courage
     * bar and readable by `damageFn`, which is what keeps the intent honest.
     */
    onAllyDeath(c) {
      if (!c.dead || c.dead.def?.role !== 'stone') return;
      addCnt(c, 'resonance', 1, 3);
      c.applyStatus(c.self, 'resonance', 1);
      c.say(`${c.self.name} resonates.`, 'warn');
    },

    moves: {
      [moveId]: {
        id: moveId, name: moveName, intent,
        ...(damage != null ? { damage, hits: 1, damageFn: (c) => damage + resonance(c) } : {}),
        ...(block != null ? { block, blockFn: (c) => block + 2 * resonance(c) } : {}),
        tell,
        effect(c) { run(c, resonance(c)); },
      },
      /** The turns between scheduled effects. A Stone is mostly a wall. */
      'stand-still': {
        id: 'stand-still', name: 'Stand Still', intent: Intent.DEFEND, block: 6,
        blockFn: (c) => 6 + 2 * resonance(c),
        tell: 'Nothing happens. It is not that kind of enemy.',
        effect(c) { c.block(c.self, 6 + 2 * resonance(c)); },
      },
    },

    /**
     * PURE, and the schedule is derived from history rather than a tick
     * counter: `nextMove` may be called repeatedly to re-render an intent, so
     * anything that counted its own calls would drift every time the player
     * hovered a card.
     */
    nextMove: (c) => (((c.history || []).length + 1) % period === 0 ? moveId : 'stand-still'),

    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 1) h.notes.push('Courage +6%.');
      if (level >= 9) {
        h.flags.headStart = 1;
        h.notes.push('Haunt 9: the Hall begins with one countdown already one turn shorter.');
      }
      return h;
    },
  };
}

function announceSchedule(c, name, period, moveName) {
  c.announceRule({
    id: `stone:${c.self.id}`,
    name,
    text: `Every ${period === 2 ? 'second' : period === 3 ? 'third' : `${period}th`} enemy turn: ${moveName}.`,
  });
}

export const kidStone = stone({
  id: 'kid-stone', name: 'Kid Stone', period: 3,
  palette: ['#d8c9a8', '#9c8760', '#4b3f2c'],
  lore: 'An enormous nameplate with the Kid’s own name cut into it, in a typeface nobody chose.',
  moveId: 'you-belong-here-too', moveName: 'You Belong Here Too',
  tell: 'The letters of your name deepen by a fraction.',
  intent: Intent.ATTACK_DEFEND, damage: 10, block: 5,
  run(c, res) { hitPlayer(c, 10 + res); c.block(c.self, 5 + 2 * res); },
});

export const companionStone = stone({
  id: 'companion-stone', name: 'Companion Stone', period: 2,
  palette: ['#c8d8cf', '#8fa79b', '#3d4f47'],
  lore: 'Your Companion’s name, engraved a very long time before you met them.',
  moveId: 'already-safe', moveName: 'Already Safe',
  tell: 'It looks at whichever of them is closest to breaking.',
  intent: Intent.DEFEND, block: 9,
  run(c, res) {
    // "The lowest Courage surviving Stone gains 9 Guard." Itself included.
    const stones = [c.self, ...allies(c)].filter(a => isAlive(a) && a.def?.role === 'stone');
    const weakest = stones.reduce((best, a) => (!best || a.hp < best.hp ? a : best), null);
    if (weakest) c.block(weakest, 9 + 2 * res);
  },
});

export const missingPetStone = stone({
  id: 'missing-pet-stone', name: 'Missing Pet Stone', period: 3,
  palette: ['#e0c4c4', '#b08585', '#5a3838'],
  lore: 'A name you have been saying out loud since the first room, cut into stone by somebody else.',
  moveId: 'keep-them-here', moveName: 'Keep Them Here',
  tell: 'It rearranges what you were going to do next.',
  intent: Intent.DEBUFF,
  run(c) {
    costRule(c, {
      id: 'keep-them-here', name: 'Keep Them Here',
      text: 'Your first Trick next turn costs 1 additional Nerve. Your second costs 1 less.',
      steps: [[1, 1], [2, -1]],
    });
  },
});

export const unknownStone = stone({
  id: 'unknown-stone', name: 'Unknown Stone', period: 4,
  palette: ['#bfbfc6', '#84848e', '#3a3a42'],
  lore: 'This one has no name on it at all. The surface is worn smooth where a name used to be.',
  moveId: 'someone-else-stayed', moveName: 'Someone Else Stayed',
  tell: 'Something that used to live here starts running its old circuit again.',
  intent: Intent.SUMMON,
  run(c) {
    // "Maximum one Memory Animal summon at a time." (§20.)
    const existing = allies(c).some(a => isAlive(a) && a.defId === 'memory-echo');
    if (existing) { c.block(c.self, 8); return; }
    c.summon('memory-echo', { hp: 20 });
    c.say('Someone else stayed.', 'warn');
  },
});

/* ══ Big Scare 2 — House Remembers (§22–§24) ═════════════════════════════════
 *
 * "This is not eight mechanics occurring simultaneously. Only one Memory is
 * active at a time. The difficulty comes from adapting to a visible sequence of
 * familiar ideas." (§24.)
 *
 * Four Patterns are drawn from a pool of eight at the start of combat, all four
 * are revealed, and it cycles them in order. The player can SKIP the next one
 * by dealing 24 damage in a turn, once per turn — which is the agency clause,
 * and the same shape as the Confectioner's spilled Ingredient.
 */
const MEMORY_PATTERNS = [
  {
    id: 'rule', name: 'Rule Memory',
    text: 'The fourth Trick you play this turn gives House Remembers 8 Guard.',
    arm(c) { mem(c).rulePending = true; },
    onCard(c, nth) { if (mem(c).rulePending && nth === 4) { c.block(c.self, 8); mem(c).rulePending = false; } },
  },
  {
    id: 'growth', name: 'Growth Memory',
    text: 'A Sprout appears. If it survives one enemy turn, House Remembers gains 12 Guard.',
    arm(c) {
      if (allies(c).some(a => isAlive(a) && a.defId === 'sprout')) { c.block(c.self, 6); return; }
      c.summon('sprout', { hp: 10 });
    },
  },
  {
    id: 'countdown', name: 'Countdown Memory',
    text: 'In two enemy turns: 10 damage. The countdown stays visible.',
    /* THE COUNTDOWN IS A MOVE, not a hook, and the intent-truth audit is why.
       Dealing its 10 from `onTurnEnd` landed damage inside an enemy turn that
       no intent had promised: Settle Back said 0 and dealt 10, Every Room at
       Once said 15 and dealt 25. Fifteen lies in one batch.
       `countdownAt` is an absolute turn number so `nextMove` stays pure — it
       reads the clock rather than counting its own calls. */
    arm(c) {
      mem(c).countdownAt = (c.turn || 0) + 2 - flag(c, 'headStart', 0);
      setCnt(c, 'countdown', 2 - flag(c, 'headStart', 0));
    },
  },
  {
    id: 'charge', name: 'Charge Memory',
    text: 'It gains 1 Charge. At 3 Charge its next attack deals 12 more, then Charge resets.',
    arm(c) { addCnt(c, 'charge', 1, 3); },
  },
  {
    id: 'invitation', name: 'Invitation Memory',
    text: 'End your turn with Nerve to spare and you take the offer: House Remembers gains 8 Guard.',
    arm(c) { mem(c).invited = true; },
  },
  {
    id: 'hidden', name: 'Hidden Memory',
    text: 'It hides after acting, and is Exposed again once you have played three Tricks.',
    arm(c) { c.applyStatus(c.self, 'hidden', 1); mem(c).hideUntil = 3; },
  },
  {
    id: 'weather', name: 'Weather Memory',
    text: 'Rain. Your first Guard gain this turn is 3 larger. House Remembers gains 5 Guard.',
    arm(c) { c.block(c.self, 5); c.applyStatus(c.player, 'rain', 1); },
  },
  {
    id: 'restraint', name: 'Restraint Memory',
    text: 'Your fourth Trick next turn costs 1 more Nerve. Play six or more anyway and it loses 6 Courage.',
    arm(c) {
      costRule(c, {
        id: 'restraint', name: 'Restraint Memory',
        text: 'Your fourth Trick costs 1 additional Nerve. Play six or more Tricks this turn and House Remembers loses 6 Courage.',
        steps: [[4, 1]],
      });
      mem(c).restraint = true;
    },
  },
];

export const houseRemembers = {
  id: 'house-remembers',
  name: 'House Remembers',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [188, 188],
  silhouette: 'house-remembers',
  palette: ['#7e8fa8', '#c3cede', '#2c3442'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 1.5,
  lore: 'The walls fill with moving pictures of rooms you have already walked through. There is nothing standing in front of you.',

  onCombatStart(c) {
    const pool = MEMORY_PATTERNS.slice();
    const want = flag(c, 'patterns', 4);
    const drawn = [];
    for (let i = 0; i < want && pool.length; i++) drawn.push(pool.splice(c.rng.int(pool.length), 1)[0].id);
    mem(c).cycle = drawn;
    mem(c).at = 0;
    announceCycle(c);
  },

  onCardPlayed(c) {
    const nth = (c.cardsPlayedThisTurn || []).length;
    const cur = currentPattern(c);
    if (cur && cur.onCard) cur.onCard(c, nth);
    if (mem(c).hideUntil && nth >= mem(c).hideUntil) {
      mem(c).hideUntil = 0;
      c.removeStatus(c.self, 'hidden');
      c.say('It is exposed.', 'good');
    }
  },

  onPlayerTurnStart(c) { mem(c).hpAtTurnStart = c.self.hp; },

  onPlayerTurnEnd(c) {
    const m = mem(c);
    // The Invitation: taken by ending the turn with Nerve unspent, the same way
    // Old Welcome's chair is taken. It is a real Nerve and a real 8 Guard.
    if (m.invited) {
      m.invited = false;
      if (((c.player && c.player.energy) || 0) > 0) { c.block(c.self, 8); c.say('You took the offer.', 'warn'); }
    }
    if (m.restraint) {
      m.restraint = false;
      if (played(c).length >= 6) { c.loseHp(c.self, 6); c.say('You played through it.', 'good'); }
    }
    // "Whenever the player deals at least 24 damage during one turn: skip the
    // next Memory Pattern. Once per turn." (§24.)
    const lost = (m.hpAtTurnStart == null ? c.self.hp : m.hpAtTurnStart) - c.self.hp;
    m.hpAtTurnStart = c.self.hp;
    if (lost >= 24 && (m.cycle || []).length) {
      m.at = (m.at + 1) % m.cycle.length;
      c.say('It loses its place.', 'good');
      announceCycle(c);
    }
  },

  onTurnEnd(c) {
    // The Sprout's bargain and the visible countdown both resolve here.
    const sprout = allies(c).find(a => isAlive(a) && a.defId === 'sprout');
    if (sprout && sprout.mem && sprout.mem.survived) {
      c.block(c.self, 12);
      c.despawn(sprout);
      c.say('It got what it wanted from that.', 'warn');
    } else if (sprout) {
      (sprout.mem ||= {}).survived = true;
    }
    // The counter is the visible clock; the strike itself is a move.
    if (mem(c).countdownAt != null) {
      setCnt(c, 'countdown', Math.max(0, mem(c).countdownAt - (c.turn || 0)));
    }
  },

  moves: {
    'remember-this': {
      id: 'remember-this', name: 'Remember This', intent: Intent.BUFF,
      ruleFn: (c) => null,
      tellFn: (c) => {
        const p = currentPattern(c);
        return p ? `It remembers: ${p.name}.` : 'It searches for something it has seen work before.';
      },
      tell: 'It remembers something that worked once.',
      effect(c) {
        const p = currentPattern(c);
        const m = mem(c);
        if (p) p.arm(c);
        if ((m.cycle || []).length) m.at = (m.at + 1) % m.cycle.length;
        announceCycle(c);
      },
    },
    'shape-of-a-room': {
      id: 'shape-of-a-room', name: 'The Shape of a Room', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + (cnt(c, 'charge') >= 3 ? 12 : 0),
      tell: 'One of the pictures on the wall becomes the room you are standing in.',
      effect(c) {
        const bonus = cnt(c, 'charge') >= 3 ? 12 : 0;
        hitPlayer(c, 11 + bonus);
        if (bonus) setCnt(c, 'charge', 0);
      },
    },
    'every-room-at-once': {
      id: 'every-room-at-once', name: 'Every Room at Once', intent: Intent.ATTACK, damage: 5, hits: 3,
      tell: 'All of them, briefly, in the wrong order.',
      effect(c) { hitPlayer(c, 5, 3); },
    },
    'settle-back': {
      id: 'settle-back', name: 'Settle Back', intent: Intent.DEFEND, block: 14,
      tell: 'The pictures slow down and hold still.',
      effect(c) { c.block(c.self, 14); },
    },
    'the-countdown': {
      id: 'the-countdown', name: 'The Countdown', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'The thing it scheduled two turns ago arrives.',
      effect(c) {
        hitPlayer(c, 10);
        mem(c).countdownAt = null;
        setCnt(c, 'countdown', 0);
      },
    },
  },

  nextMove: (c) => {
    // A scheduled strike outranks the cycle, so it can be an intent of its own.
    const at = mem(c).countdownAt;
    if (at != null && (c.turn || 0) >= at) return 'the-countdown';
    return cyc(['remember-this', 'shape-of-a-room', 'remember-this', 'every-room-at-once',
      'remember-this', 'settle-back'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.patterns = 5;
      h.flags.headStart = 1;
      h.notes.push('Haunt 9: it draws five Memory Patterns, and its Countdown starts one turn shorter.');
    }
    return h;
  },
};

function currentPattern(c) {
  const m = mem(c);
  const id = (m.cycle || [])[m.at || 0];
  return MEMORY_PATTERNS.find(p => p.id === id) || null;
}
function announceCycle(c) {
  const m = mem(c);
  const names = (m.cycle || []).map((id, i) => {
    const p = MEMORY_PATTERNS.find(x => x.id === id);
    return `${i === (m.at || 0) ? '▸ ' : ''}${p ? p.name : id}`;
  });
  const cur = currentPattern(c);
  c.announceRule({
    id: `memories:${c.self.id}`,
    name: 'Memory Cycle',
    text: `${names.join(' · ')}${cur ? ` — ${cur.text}` : ''} Deal 24 damage in a turn to skip the next one.`,
  });
}

/** House Remembers' Growth Memory. Never rolled into a formation. */
export const sprout = {
  id: 'sprout',
  name: 'Sprout',
  region: REGION,
  tier: 'normal',
  role: 'spawn',
  hp: [10, 10],
  silhouette: 'sprout',
  palette: ['#8fbf6a', '#5b8340', '#2f4423'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 0.45,
  summonOnly: true,
  remnant: true,
  lore: 'A green shoot coming up between two floorboards, growing far faster than any green shoot should.',

  moves: {
    'reach-up': {
      id: 'reach-up', name: 'Reach Up', intent: Intent.DEFEND, block: 3,
      tell: 'It grows another inch.',
      effect(c) { c.block(c.self, 3); },
    },
  },
  nextMove: () => 'reach-up',
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

/* ══ Big Scare 3 — Perfect Sanctuary (§25–§26) ═══════════════════════════════
 *
 * "Two of these systems provide actual benefits to the player. Destroying them
 * is not automatically correct." (§25.)
 *
 * The three Systems are separate targetable bodies with their own Integrity,
 * because the whole encounter is the player choosing which of them to take
 * apart — and that choice does not exist if they are counters on one enemy.
 * They deal no damage and never act aggressively; each is a rule with Courage.
 */
function system({ id, name, hp, palette, lore, rule, onSpawn, onPlayerTurnStart }) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'system',
    hp: [hp, hp],
    silhouette: 'system',
    palette,
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.8,
    summonOnly: true,
    lore,
    onSpawn(c) {
      c.announceRule({ id: `system:${c.self.id}`, name, text: rule });
      if (onSpawn) onSpawn(c);
    },
    onDeath(c) { c.clearRules(`system:${c.self.id}`); c.say(`${name} goes quiet.`, 'good'); },
    ...(onPlayerTurnStart ? { onPlayerTurnStart } : {}),
    moves: {
      hum: {
        id: 'hum', name: 'Hum', intent: Intent.DEFEND, block: 3,
        tell: 'It carries on doing its job.',
        effect(c) { c.block(c.self, 3); },
      },
    },
    nextMove: () => 'hum',
    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 9) {
        h.counters.reinforced = 1;
        h.notes.push('Haunt 9: one System begins the fight already carrying Guard.');
      }
      return h;
    },
  };
}

export const safetySystem = system({
  id: 'safety-system', name: 'Safety System', hp: 22,
  palette: ['#cfd8e0', '#8a99a8', '#3c4650'],
  lore: 'A panel of small green lights, all of them steady. It is checking that the door is still locked.',
  rule: 'While it runs, Perfect Sanctuary gains 7 Guard at the start of its turn.',
});

export const comfortSystem = system({
  id: 'comfort-system', name: 'Comfort System', hp: 20,
  palette: ['#e8d6c0', '#bd9f80', '#5b4536'],
  lore: 'Warm light and a smell of clean bedding. It is genuinely nice, which is the problem.',
  rule: 'While it runs, you recover 2 Courage at the start of your turn, and your first Attack deals 3 less damage.',
  onPlayerTurnStart(c) {
    c.heal(c.player, 2);
    c.applyStatus(c.player, 'softened', 1);
  },
});

export const routineSystem = system({
  id: 'routine-system', name: 'Routine System', hp: 20,
  palette: ['#d6d0e0', '#9990ab', '#453e55'],
  lore: 'A clock with no numbers on it, and a list of things that happen in an order.',
  rule: 'While it runs, your first Trick each turn costs 1 less Nerve and your fourth costs 1 more.',
  onSpawn(c) {
    costRule(c, {
      id: 'routine', name: 'Routine System',
      text: 'Your first Trick each turn costs 1 less Nerve. Your fourth costs 1 more.',
      steps: [[1, -1], [4, 1]],
    });
  },
});

export const perfectSanctuary = {
  id: 'perfect-sanctuary',
  name: 'Perfect Sanctuary',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [195, 195],
  silhouette: 'sanctuary-room',
  palette: ['#f2ede4', '#c2b8a6', '#4d4740'],
  shape: { body: 'squat', limbs: 0, eyes: 1 },
  scale: 1.6,
  lore: 'A spotless room seals itself around you. Soft bed, food, warm light, and a door that will not open.',

  onCombatStart(c) {
    for (const id of ['safety-system', 'comfort-system', 'routine-system']) c.summon(id, {});
    c.announceRule({
      id: `sanctuary-room:${c.self.id}`,
      name: 'Everything You Need',
      text: 'Three Systems keep this room. Two of them are helping you. Breaking one is not automatically correct.',
    });
  },

  onTurnStart(c) {
    if (systems(c).some(s => s.defId === 'safety-system')) c.block(c.self, 7);
  },

  /**
   * THE ROOM ENDS WITH THE ROOM.
   *
   * Without this the fight could not end at all: the Systems deal no damage
   * and gain Guard every turn, so a board holding two of them after Perfect
   * Sanctuary is dead is a stalemate nobody can win or lose. Measured at 81
   * turns with the room defeated and a Comfort System on 9 Courage, which is
   * how the run harness found it — "combat did not resolve in 80 turns" is a
   * failure this suite reports rather than a timeout it hides.
   *
   * The Wardrobe carries the same line for the same reason ("Summoned enemies
   * disappear when The Wardrobe is defeated"). Breaking a System is still a
   * real choice while the room is standing, which is the whole encounter.
   */
  onDeath(c) {
    for (const s of systems(c)) c.despawn(s);
    c.clearRules(`sanctuary-room:${c.self.id}`);
  },

  moves: {
    'lock-the-door': {
      id: 'lock-the-door', name: 'Lock the Door', intent: Intent.DEFEND, block: 13,
      tell: 'The bolt goes across, unhurried.',
      effect(c) { c.block(c.self, 13); },
    },
    'gentle-reminder': {
      id: 'gentle-reminder', name: 'Gentle Reminder', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => 9 + (systems(c).length >= 3 ? 4 : 0),
      tell: 'It points out, kindly, that you have everything you need.',
      effect(c) { hitPlayer(c, 9 + (systems(c).length >= 3 ? 4 : 0)); },
    },
    'everything-you-need': {
      id: 'everything-you-need', name: 'Everything You Need', intent: Intent.BUFF,
      tell: 'It tops everything up, including itself.',
      effect(c) {
        for (const s of systems(c)) c.heal(s, 6);
        c.heal(c.self, 4);
      },
    },
    'please-stop-struggling': {
      id: 'please-stop-struggling', name: 'Please Stop Struggling',
      intent: Intent.ATTACK, damage: 5, hits: 3,
      hitsFn: (c) => (systems(c).length <= 1 ? 2 : 3),
      tell: 'Three soft, insistent pushes back towards the bed.',
      effect(c) { hitPlayer(c, 5, systems(c).length <= 1 ? 2 : 3); },
    },
  },

  nextMove: (c) => cyc(['lock-the-door', 'gentle-reminder', 'everything-you-need', 'please-stop-struggling'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: one System begins the fight already carrying Guard.');
    return h;
  },
};
function systems(c) { return allies(c).filter(a => isAlive(a) && a.def?.role === 'system'); }

/* ══ Big Scare 4 — The Door That Says Stay (§27–§29) ═════════════════════════
 *
 * "The player literally becomes stronger by accepting the Door's hospitality.
 * The Door becomes easier to defeat by repeatedly refusing it. Both paths are
 * viable." (§29.)
 *
 * The offer is taken the same way Old Welcome's chair is — by ending the turn
 * with Nerve unspent — and refused by spending everything. That is the one
 * reading of Accept/Decline that does not require stopping the fight for a
 * modal, and it makes refusing cost exactly what refusing should cost: you have
 * to actually use your turn.
 */
export const doorThatSaysStay = {
  id: 'door-that-says-stay',
  name: 'The Door That Says Stay',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [182, 182],
  silhouette: 'door',
  palette: ['#8a6236', '#d8ba7a', '#3a2a19'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 1.45,
  lore: 'A beautiful front door at the end of a hallway that keeps getting longer. The word STAY is in the grain.',

  onSpawn(c) {
    setCnt(c, 'stayed', flag(c, 'startStayed', 0));
    setCnt(c, 'refusal', flag(c, 'startRefusal', 0));
    announceDoor(c);
  },

  onPlayerTurnEnd(c) {
    if (!mem(c).offering) return;
    mem(c).offering = false;
    const spare = (c.player && c.player.energy) || 0;
    if (spare > 0) {
      // Accepted. Three real benefits, and the fight gets longer.
      c.heal(c.player, 6);
      c.playerDraw(3);
      addCnt(c, 'stayed', 1, 3);
      c.say('You stay a little longer.', 'warn');
    } else {
      addCnt(c, 'refusal', 1, 3);
      c.say('You do not stay.', 'good');
      if (cnt(c, 'refusal') >= 3) c.say('The Door is Open.', 'good');
    }
    announceDoor(c);
  },

  onTurnStart(c) {
    const stayed = cnt(c, 'stayed');
    if (stayed > 0) c.block(c.self, 5 * stayed);
  },

  /**
   * Refusal is a multiplier on the enemy rather than a status, because it is
   * not a debuff anybody applied — it is the Door being less sure of itself.
   * 10 / 20 / 30 percent, and Open at 3 (§29).
   *
   * `damageTakenMul` was DEAD when this was written: the Sugar Golem's crystal
   * layer and the Wardrobe's exposed body both declared one, the Kitchens even
   * carries a comment asserting "the engine reads a MULTIPLIER here", and
   * nothing in `game/` or `tests/` read the name. It is wired in
   * `combat/damage.js` now and gated by `tests/heart/check.py`.
   */
  damageTakenMul(c) { return 1 + 0.1 * cnt(c, 'refusal'); },

  moves: {
    'stay-a-little-longer': {
      id: 'stay-a-little-longer', name: 'Stay a Little Longer?', intent: Intent.BUFF,
      tell: 'The door opens a crack onto somewhere warm.',
      effect(c) {
        mem(c).offering = true;
        c.announceRule({
          id: `offer:${c.self.id}`,
          name: 'Stay a Little Longer?',
          text: 'End your turn with Nerve to spare and you accept: recover 6 Courage, draw 3 Tricks, and the Door gains 1 Stayed. Spend everything and you refuse: the Door gains 1 Refusal and takes more damage.',
        });
      },
    },
    'close-hard': {
      id: 'close-hard', name: 'Close Hard', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'It shuts, and the whole hallway feels it.',
      effect(c) { hitPlayer(c, 12); },
    },
    bolt: {
      id: 'bolt', name: 'Bolt', intent: Intent.DEFEND, block: 14,
      tell: 'Something heavy slides across on the other side.',
      effect(c) { c.block(c.self, 14); },
    },
    'hallway-lengthens': {
      id: 'hallway-lengthens', name: 'Hallway Lengthens', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'The door gets further away without moving.',
      effect(c) {
        hitPlayer(c, 7);
        const draw = c.cardsIn ? c.cardsIn('draw') : [];
        if (draw.length) c.moveCardTo(draw[0].uid, 'draw', { bottom: true });
      },
    },
    'you-would-be-safer-here': {
      id: 'you-would-be-safer-here', name: 'You Would Be Safer Here',
      intent: Intent.ATTACK_DEFEND, damage: 18, hits: 1, block: 10,
      tell: 'It stops being polite about it.',
      effect(c) { hitPlayer(c, 18); c.block(c.self, 10); },
    },
  },

  /**
   * "Offer. Close Hard. Bolt. Offer. Hallway Lengthens. Repeat." — with the
   * heavy swing substituted in when Stayed has earned it, and disabled entirely
   * once the Door is Open (§29: "Its strongest attack is disabled").
   */
  nextMove: (c) => {
    const seq = ['stay-a-little-longer', 'close-hard', 'bolt', 'stay-a-little-longer', 'hallway-lengthens'];
    const pick = cyc(seq, (c.history || []).length);
    const open = cnt(c, 'refusal') >= 3;
    if (!open && cnt(c, 'stayed') >= 2 && (pick === 'close-hard' || pick === 'hallway-lengthens')) {
      return 'you-would-be-safer-here';
    }
    return pick;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.counters.stayed = 1;
      h.counters.refusal = 1;
      h.flags.startStayed = 1;
      h.flags.startRefusal = 1;
      h.notes.push('Haunt 9: the Door begins with 1 Stayed and 1 Refusal.');
    }
    return h;
  },
};
function announceDoor(c) {
  const r = cnt(c, 'refusal');
  const s = cnt(c, 'stayed');
  c.announceRule({
    id: `door:${c.self.id}`,
    name: r >= 3 ? 'Open' : `Stayed ${s} · Refusal ${r}`,
    text: r >= 3
      ? 'The Door takes 30% more damage and cannot use You Would Be Safer Here.'
      : `Each Stayed gives the Door 5 Guard at the start of its turn. Each Refusal makes it take 10% more damage; at 3 it becomes Open.`,
  });
}

export const HEART_SCARES = [
  kidStone, companionStone, missingPetStone, unknownStone,
  houseRemembers, sprout,
  perfectSanctuary, safetySystem, comfortSystem, routineSystem,
  doorThatSaysStay,
];
