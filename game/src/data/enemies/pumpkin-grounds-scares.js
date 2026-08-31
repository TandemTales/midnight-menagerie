/**
 * The Moon Courtyard and Pumpkin Grounds — Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/16-pumpkin-grounds.md §13, §14, §15.
 *
 * Three of them, and each asks the region's question at a different scale:
 *
 *   THE MOON SCARECROW  a cycle you can push, and pushing it cuts both ways
 *   THE GOURD KNIGHT    layers you cross with arithmetic instead of targets
 *   THE GREAT ROOT      a harvesting engine both sides are working
 *
 * ── THE GOURD KNIGHT HAS NO EXTRA BODIES AND THAT IS THE POINT ──────────────
 *
 * §14 gives it three shells and then says exactly how to build them: "Each is
 * represented by A COURAGE RANGE." Its layers are thresholds in one health bar,
 * and §14 closes with why — "this expresses harvesting through combat
 * ARITHMETIC rather than extra targets". So the Knight is one actor, its layer
 * is derived from its Courage, and the reward for crossing a threshold with 10
 * spare damage is a Clean Cut rather than a body falling off.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, field, lastMove, hpFrac,
} from './_lib.js';
import {
  STAGES, SEED, GROWING, RIPE, OVERRIPE, stageOf, isRipe, ripen, harvest, REWARD,
  crop, growCrop, CROP_INTEGRITY,
} from './pumpkin-grounds.js';

const REGION = 'pumpkin-grounds';

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 1 — The Moon Scarecrow (§13)
 * ═══════════════════════════════════════════════════════════════════════════ */
const MOON = ['New Moon', 'Waxing Moon', 'Full Moon', 'Harvest Moon'];

export const moonScarecrow = {
  id: 'moon-scarecrow',
  name: 'The Moon Scarecrow',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [156, 156],
  silhouette: 'moon-scarecrow',
  palette: ['#b7a06a', '#5c4c2a', '#191308'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.6,
  lore: 'An enormous scarecrow stands in the centre of a moonlit field. Its pumpkin head changes expression as the moon moves overhead.',

  onSpawn(c) { setCnt(c, 'moon', 0); mem(c).turned = 0; announceMoon(c); },

  onPlayerTurnStart(c) { mem(c).turned = 0; announceMoon(c); },

  /**
   * §13's Turn the Moon, as an offer.
   *
   * "Whenever the player plays their FIFTH Trick during one turn, they MAY
   * advance the Moon Cycle one stage. Once per turn." The Ballroom settled how
   * to ask a question the engine cannot ask: a card is an offer with its whole
   * cost printed on it, playing it is yes and letting it expire is no.
   */
  onPlayerCard(c) {
    if (mem(c).turned || played(c).length !== 5) return;
    c.addCard('moon/turn-the-moon', 'hand');
    c.say('Five Tricks, and the moon is listening.', 'info');
  },

  onCardPlayed(c) {
    if (c.card?.id !== 'moon/turn-the-moon') return;
    mem(c).turned = 1;
    advanceMoon(c);
    c.say('You put your shoulder to the sky.', 'good');
  },

  onTurnStart(c) { if (cnt(c, 'moon') === 0) c.block(c.self, 10); },

  /** §13's two vulnerable phases. */
  damageTakenMul(c) {
    const m = cnt(c, 'moon');
    return m === 3 ? 1.25 : m === 2 ? 1.15 : 1;
  },

  /** §13's larger Big Scare Harvest. */
  onDeath(c) {
    harvest(c, () => cnt(c, 'moon') === 3, (x) => {
      x.block(x.player, 6, { source: null });
      x.applyStatus(x.player, 'encouraged', 1, { fresh: true });
    }, 'Cut down under the Harvest Moon. 6 Guard and a Trick.');
  },

  moves: {
    'hay-fork': {
      id: 'hay-fork', name: 'Hay Fork', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => moonDmg(c, 11),
      tell: 'Two tines, at the height of your chest.',
      effect(c) { hitPlayer(c, moonDmg(c, 11)); },
    },
    'crow-scatter': {
      id: 'crow-scatter', name: 'Crow Scatter', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => moonDmg(c, 4),
      tell: 'Everything that was sitting on it comes off at once.',
      effect(c) { hitPlayer(c, moonDmg(c, 4), 3); },
    },
    'moonlit-posture': {
      id: 'moonlit-posture', name: 'Moonlit Posture', intent: Intent.DEFEND, block: 12,
      tell: 'It turns its head to follow the moon, and the moon follows back.',
      effect(c) { c.block(c.self, 12); advanceMoon(c); },
    },
    'reaping-swing': {
      id: 'reaping-swing', name: 'Reaping Swing', intent: Intent.ATTACK_BIG, damage: 18, hits: 1,
      damageFn: (c) => moonDmg(c, 18),
      tell: 'The whole field at once, and you are standing in it.',
      effect(c) {
        hitPlayer(c, moonDmg(c, 18));
        setCnt(c, 'moon', 0);
        c.say('The moon goes all the way back round.', 'info');
        announceMoon(c);
      },
    },
  },

  nextMove: (c) => (cnt(c, 'moon') === 3 ? 'reaping-swing'
    : cyc(['hay-fork', 'moonlit-posture', 'crow-scatter'], (c.history || []).length)),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.counters.moon = 1;
      h.notes.push('Haunt 9: it rises under a Waxing Moon.');
    }
    return h;
  },
};

function moonDmg(c, base) {
  const m = cnt(c, 'moon');
  return Math.max(1, base + (m === 0 ? -2 : m === 2 ? 4 : 0));
}

function advanceMoon(c) {
  setCnt(c, 'moon', (cnt(c, 'moon') + 1) % 4);
  announceMoon(c);
}

function announceMoon(c) {
  const m = cnt(c, 'moon');
  const band = m === 0 ? '10 Guard every turn and 2 less damage'
    : m === 1 ? 'no modifier either way'
      : m === 2 ? '4 more damage, and it takes 15% MORE'
        : 'it takes 25% MORE, and its next action is an 18-damage Reaping Swing';
  c.announceRule({
    id: `moon:${c.self.id}`,
    name: `${MOON[m].toUpperCase()} → ${MOON[(m + 1) % 4].toUpperCase()}`,
    text: `${MOON[m]}: ${band}. Play FIVE Tricks in a turn and it offers you the sky — you may push `
      + 'the moon on one stage, once. Pushing it reaches the Harvest Moon window sooner AND brings '
      + 'the Reaping Swing sooner. HARVEST: kill it under the Harvest Moon for 6 Guard and a Trick.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 2 — The Gourd Knight (§14)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const gourdKnight = {
  id: 'gourd-knight',
  name: 'The Gourd Knight',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [165, 165],
  silhouette: 'gourd-knight',
  palette: ['#d08a35', '#7a4c18', '#211205'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.6,
  lore: 'A huge knight made from nested pumpkins stomps through the courtyard. Its body is literally one gourd inside another.',

  onSpawn(c) { mem(c).layer = 0; mem(c).burst = 0; announceKnight(c); },

  /**
   * §14's threshold crossing, settled at the top of the player's turn.
   *
   * Two things happen here and both have to happen BEFORE intents are drawn:
   * the layer changes, which changes every number the Knight has; and Shell
   * Burst is queued, which changes what it is about to do. The 10-excess-damage
   * Clean Cut is measured at the same moment, from the Courage the crossing
   * blow left it on.
   */
  onPlayerTurnStart(c) {
    const was = mem(c).layer || 0;
    const now = layerOf(c);
    if (now > was) {
      mem(c).layer = now;
      mem(c).burst = 1;
      /* §14: "If the player crosses a layer threshold with at least 10 excess
         damage beyond what was required, gain Clean Cut." The excess is how far
         past the line the blow carried it. */
      const line = LAYER_LINE[now];
      if (line != null && line - c.self.hp >= 10) {
        c.applyStatus(c.player, 'next-attack-discount', 1, { fresh: true });
        c.say('Straight through the shell and out the other side. Clean Cut.', 'good');
      }
    }
    announceKnight(c);
  },

  onTurnStart(c) { if (layerOf(c) === 0) c.block(c.self, 7); },

  /** §14's Heart Gourd: 25% more taken, and it is running out of itself. */
  damageTakenMul(c) { return layerOf(c) === 2 ? 1.25 : 1; },
  onTurnEnd(c) { if (layerOf(c) === 2) c.loseHp(c.self, 3); },

  moves: {
    'shell-burst': {
      id: 'shell-burst', name: 'Shell Burst', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'A whole layer comes off it and it is bigger underneath.',
      effect(c) {
        c.block(c.self, 9);
        mem(c).burst = 0;
        mem(c).pushed = 1;
        announceKnight(c);
      },
    },
    'gourd-sword': {
      id: 'gourd-sword', name: 'Gourd Sword', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => knightDmg(c, 12),
      tell: 'A blade grown rather than forged.',
      effect(c) { hitPlayer(c, knightDmg(c, 12)); mem(c).pushed = 0; },
    },
    'pumpkin-shield': {
      id: 'pumpkin-shield', name: 'Pumpkin Shield', intent: Intent.DEFEND, block: 14,
      tell: 'It puts a whole gourd between you and itself.',
      effect(c) { c.block(c.self, 14); },
    },
    'seed-volley': {
      id: 'seed-volley', name: 'Seed Volley', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => knightDmg(c, 4),
      tell: 'Three of them, hard, from somewhere inside it.',
      effect(c) { hitPlayer(c, knightDmg(c, 4), 3); mem(c).pushed = 0; },
    },
  },

  nextMove: (c) => (mem(c).burst ? 'shell-burst'
    : cyc(['gourd-sword', 'pumpkin-shield', 'seed-volley'], (c.history || []).length)),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: Shell Burst also heals it 8 Courage.');
    return h;
  },
};

/** §14's ranges, as thresholds on one bar. */
const LAYER_LINE = [null, 110, 55];
function layerOf(c) {
  const hp = c.self.hp;
  return hp > 110 ? 0 : hp > 55 ? 1 : 2;
}
function knightDmg(c, base) {
  const l = layerOf(c);
  return base + (l === 1 ? 3 : l === 2 ? 5 : 0) + (mem(c).pushed ? 3 : 0);
}

function announceKnight(c) {
  const l = layerOf(c);
  c.announceRule({
    id: `knight:${c.self.id}`,
    name: `${['OUTER GOURD', 'MIDDLE GOURD', 'HEART GOURD'][l]} · ${c.self.hp} Courage`,
    text: (l === 0 ? 'Outer: 7 Guard every turn. Nothing else. '
      : l === 1 ? 'Middle: 3 more damage on every attack, and no free Guard. '
        : 'Heart: 5 more damage, 25% MORE taken, and it loses 3 Courage every turn on its own. ')
      + 'It has no extra bodies — the layers are lines on this bar, at 110 and at 55. '
      + 'Cross one with 10 damage to spare and your next Attack costs 1 less. '
      + 'Crossing also makes it Shell Burst: 9 Guard and 3 more damage on the next thing it does.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 3 — The Great Root (§15)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const shieldGourd = crop('shield-gourd', 'Shield Gourd', 'great-root',
  'A squat green thing with a rind like a shell.',
  REWARD.guard(8), 'Shield Gourd, picked at the right moment. 8 Guard.',
  'you gain 8 Guard.');

export const sparkPumpkin = crop('spark-pumpkin', 'Spark Pumpkin', 'great-root',
  'Small, orange, and audibly fizzing.',
  REWARD.nerve(), 'Spark Pumpkin. A Nerve next turn.',
  'you gain a Nerve next turn.');

export const moonMelon = crop('moon-melon', 'Moon Melon', 'great-root',
  'Pale and cold, and it tastes of the light it grew under.',
  REWARD.heal(3), 'Moon Melon. It helps a little.',
  'you recover 3 Courage.');

const ROOT_CROPS = ['shield-gourd', 'spark-pumpkin', 'moon-melon'];

export const greatRoot = {
  id: 'great-root',
  name: 'The Great Root',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [172, 172],
  silhouette: 'great-root',
  palette: ['#6b4a2a', '#3b2915', '#150e06'],
  shape: { body: 'sprawling', limbs: 6, eyes: 0 },
  scale: 1.75,
  lore: 'A colossal root system erupts beneath the pumpkin field. It connects every plant in the area.',

  onSpawn(c) {
    mem(c).next = 0;
    mem(c).cleared = [];
    for (const id of ROOT_CROPS) c.summon(id);
    announceRoot(c);
  },

  onPlayerTurnStart(c) { announceRoot(c); },
  onAllyDeath(c) { announceRoot(c); },

  /** §15: "At the end of every enemy turn, advance one Root Plot one stage." */
  onTurnEnd(c) {
    const plots = cropsOf(c);
    if (plots.length) {
      const at = (mem(c).next || 0) % plots.length;
      mem(c).next = at + 1;
      resolveGrowth(c, plots[at]);
    }
    announceRoot(c);
  },

  moves: {
    'root-slam': {
      id: 'root-slam', name: 'Root Slam', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + (mem(c).spark ? 6 : 0),
      tell: 'The whole floor comes up under you.',
      effect(c) { hitPlayer(c, 12 + (mem(c).spark ? 6 : 0)); mem(c).spark = 0; },
    },
    'feed-the-plots': {
      id: 'feed-the-plots', name: 'Feed the Plots', intent: Intent.DEFEND_BUFF, block: 7,
      tell: 'It pushes something up through two of them at once.',
      effect(c) {
        c.block(c.self, 7);
        for (const p of cropsOf(c).slice(0, 2)) resolveGrowth(c, p);
        announceRoot(c);
      },
    },
    'tangled-ground': {
      id: 'tangled-ground', name: 'Tangled Ground', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 2,
      applies: [{ id: 'weather-flood', stacks: 1, to: 'player' }],
      tell: 'Everything underfoot takes hold at once.',
      effect(c) {
        hitPlayer(c, 5, 2);
        /* §15's sequencing tax is the Bathhouse's Flood exactly — first Trick
           costs 1 more, second costs 1 less — so it reuses that status rather
           than shipping a second rule that means the same thing. */
        c.applyStatus(c.player, 'weather-flood', 1, { fresh: true });
      },
    },
    replant: {
      id: 'replant', name: 'Replant', intent: Intent.SUMMON,
      tell: 'It puts something new in every gap.',
      effect(c) {
        const have = new Set(cropsOf(c).map(a => String(a.defId)));
        const gap = ROOT_CROPS.find(id => !have.has(id));
        if (gap) { c.summon(gap); c.say('Something new comes up out of the soil.', 'warn'); }
        else c.block(c.self, 10);
        announceRoot(c);
      },
    },
  },

  nextMove: (c) => cyc(['root-slam', 'feed-the-plots', 'tangled-ground', 'replant'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: it advances two plots at the end of every turn, not one.');
    return h;
  },
};

const cropsOf = (c) => allies(c).filter(a => isAlive(a) && ROOT_CROPS.includes(String(a.defId)));

/**
 * §15's Overripe branch: "the enemy benefit triggers automatically and the Plot
 * becomes empty." The Root's consolation for failing to have the crop taken at
 * the right time, and the reason letting one rot is not free for the player.
 */
function resolveGrowth(c, plant) {
  const what = growCrop(c, plant);
  if (what === 'bruised') { c.say(`${plant.name} is too bruised to grow.`, 'good'); return; }
  if (what !== 'overripe') return;
  const id = String(plant.defId);
  if (id === 'shield-gourd') { c.block(c.self, 12); c.say('The Shield Gourd rots into the Root. 12 Guard.', 'warn'); }
  if (id === 'spark-pumpkin') { mem(c).spark = 1; c.say('The Spark Pumpkin rots into the Root. Its next Slam is 6 heavier.', 'warn'); }
  if (id === 'moon-melon') { c.heal(c.self, 8); c.say('The Moon Melon rots into the Root. 8 Courage back.', 'warn'); }
  c.despawn(plant);
}

function announceRoot(c) {
  const plots = cropsOf(c);
  const names = plots.map(a => `${a.name} (${STAGES[stageOf(a)]})`);
  c.announceRule({
    id: `root:${c.self.id}`,
    name: `${plots.length} PLOTS GROWING`,
    text: (names.length ? `${names.join(', ')}. ` : 'Every plot is bare. ')
      + 'One plot advances at the end of every enemy turn. Take a crop while it is RIPE and the reward '
      + 'is yours; take it early and you get nothing but a clear plot; leave it too long and the Root '
      + 'gets the weak version and the plot empties anyway. Both of you are working the same field.',
  });
}

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const PUMPKIN_SCARES = [
  moonScarecrow, gourdKnight,
  greatRoot, shieldGourd, sparkPumpkin, moonMelon,
];
