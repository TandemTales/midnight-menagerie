/**
 * The Withered Hedge Maze — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/12-hedge-maze.md §13–§15.
 *
 *   The Mold Minotaur  a charge you can hear coming and interrupt, or eat.
 *   The Briar Idol     three rings of retaliation, and breaking them angers it.
 *   The Carrion Hedge  three sections that grow back until the body is low.
 *
 * ── "THERE IS NO SINGLE INTENDED ANSWER" ────────────────────────────────────
 *
 * §14 says that in as many words, and lists four: destroy the Rings and make it
 * more aggressive, ignore them and eat the retaliation, use indirect damage, or
 * burst through while healing. §13 offers the same shape — interrupt every
 * Charge, or let it land and keep the regeneration suppressed instead, and
 * "doing both every cycle may not be possible."
 *
 * So none of these three has a dominant line, and each one's numbers are on
 * screen from the first turn so the player can price the choice.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag,
  isAlive, dmgTaken,
} from './_lib.js';
import { retaliate } from './hedge-maze.js';

const REGION = 'hedge-maze';

/* ══ Big Scare 1 — The Mold Minotaur (§13) ═══════════════════════════════════ */
const PHASE = ['Searching', 'Lining Up', 'Charging'];
const step = (c) => cnt(c, 'hunt') % 3;

export const moldMinotaur = {
  id: 'mold-minotaur',
  name: 'The Mold Minotaur',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [146, 146],
  silhouette: 'minotaur',
  palette: ['#4d5c3a', '#8fa06a', '#1a2013'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.6,
  lore: 'A topiary bull gone over to mushrooms and mildew, going through hedge walls rather than around them. Its horns are branches and they are not straight.',

  onSpawn(c) {
    setCnt(c, 'hunt', 0);
    setCnt(c, 'momentum', flag(c, 'openMomentum', 0));
    mem(c).lost = false;
    announceMinotaur(c);
  },

  onPlayerTurnStart(c) { mem(c).interrupted = false; },

  /**
   * §13's Lose the Trail: "whenever the Minotaur takes at least 16 damage during
   * one player turn WHILE LINING UP, it becomes Lost."
   *
   * Resolved as the threshold is crossed, so the player watches the Charge
   * they were about to eat turn into a Wrong Turn while they are still holding
   * cards — the same rule the Lampworks needed for all five of its thresholds.
   */
  onDamaged(c) {
    const m = mem(c);
    if (m.interrupted || m.lost || step(c) !== 1 || dmgTaken(c) < 16) return;
    m.interrupted = true;
    m.lost = true;
    addCnt(c, 'momentum', -1, 3, 0);
    announceMinotaur(c);
  },

  /**
   * §13's Regrowth: "at the end of every SECOND enemy turn, if the Minotaur did
   * not lose at least 10 Courage during the preceding player turn, recover 7."
   */
  onTurnEnd(c) {
    if (!mem(c).lost) addCnt(c, 'hunt', 1, 9999);
    const beats = (c.history || []).length;
    if (beats % 2 === 0 && dmgTaken(c) < 10) c.heal(c.self, 7);
    announceMinotaur(c);
  },

  moves: {
    'hedge-horn': {
      id: 'hedge-horn', name: 'Hedge Horn', intent: Intent.ATTACK_DEFEND, damage: 10, hits: 1, block: 8,
      tell: 'It is looking for you and knocking things over on the way.',
      effect(c) { c.block(c.self, 8); hitPlayer(c, 10); },
    },
    'line-up': {
      id: 'line-up', name: 'Line Up', intent: Intent.BUFF,
      tell: 'It has found the straight bit of hedge it wanted.',
      effect(c) { addCnt(c, 'momentum', 1, 3); announceMinotaur(c); },
    },
    'maze-charge': {
      id: 'maze-charge', name: 'Maze Charge', intent: Intent.ATTACK_BIG, damage: 10, hits: 1,
      damageFn: (c) => 10 + 5 * cnt(c, 'momentum'),
      tell: 'It has stopped looking and started running.',
      effect(c) {
        const d = 10 + 5 * cnt(c, 'momentum');
        setCnt(c, 'momentum', 0);
        hitPlayer(c, d);
        announceMinotaur(c);
      },
    },
    'snort-spores': {
      id: 'snort-spores', name: 'Snort Spores', intent: Intent.ATTACK_DEBUFF, damage: 6, hits: 1,
      applies: [{ id: 'mildewed', stacks: 1, to: 'player' }],
      tell: 'It clears its head at you.',
      effect(c) {
        hitPlayer(c, 6);
        c.player._mildewSpent = false;
        c.applyStatus(c.player, 'mildewed', 1);
      },
    },
    'wrong-turn': {
      id: 'wrong-turn', name: 'Wrong Turn', intent: Intent.DEFEND, block: 10,
      tell: 'It has gone down the wrong row and has to come back.',
      effect(c) {
        c.block(c.self, 10);
        mem(c).lost = false;
        setCnt(c, 'hunt', 0);              // back to Searching
        announceMinotaur(c);
      },
    },
  },

  nextMove: (c) => {
    if (mem(c).lost) return 'wrong-turn';
    const s = step(c);
    if (s === 1) return 'line-up';
    if (s === 2) return 'maze-charge';
    return (c.history || []).length % 4 === 3 ? 'snort-spores' : 'hedge-horn';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openMomentum = 1;
      h.counters.momentum = 1;
      h.notes.push('Haunt 9: it opens with 1 Momentum.');
    }
    return h;
  },
};

function announceMinotaur(c) {
  const s = step(c);
  const m = cnt(c, 'momentum');
  c.announceRule({
    id: `bull:${c.self.id}`,
    name: mem(c).lost ? 'LOST' : `${PHASE[s]} — Momentum ${m} / 3`,
    text: mem(c).lost
      ? 'It has lost the trail. One wasted turn, then it starts looking again.'
      : `Searching, then Lining Up, then Charging for ${10 + 5 * m}. Deal it 16 in a turn WHILE it lines up `
        + 'and it loses the trail. Deal it 10 in a turn and it does not regrow 7 either — '
        + 'you probably cannot do both every cycle.',
  });
}

/* ══ Big Scare 2 — The Briar Idol (§14) ══════════════════════════════════════ */
function briarRing(n) {
  return {
    id: `briar-ring-${n}`, name: `Briar Ring ${n}`, region: REGION, tier: 'elite',
    role: 'bossPart', partOf: 'briar-idol',
    hp: [18, 18],
    silhouette: 'briar-ring',
    palette: ['#2a2418', '#5c5136', '#100d09'],
    shape: { body: 'floating', limbs: 0, eyes: 0 },
    scale: 0.45,
    lore: 'A ring of thorn growing round the statue, thick as a wrist.',

    onSpawn(c) { if (n === 1 && flag(c, 'reinforced', false)) c.block(c.self, 8); },

    /** §14: "Whenever a Ring is destroyed, the Briar Idol gains 1 Fury." */
    onDeath(c) {
      const idol = allies(c).find(a => a.defId === 'briar-idol' && isAlive(a));
      if (!idol) return;
      idol.counters = idol.counters || {};
      idol.counters.fury = Math.min(3, (idol.counters.fury || 0) + 1);
      (idol.mem ||= {}).broken = [...((idol.mem || {}).broken || []), n];
    },

    moves: {
      coil: {
        id: 'coil', name: 'Coiled', intent: Intent.SLEEP,
        tell: 'While this holds, every Attack Trick on the Idol costs you 1 more.',
        effect() {},
      },
    },
    nextMove: () => 'coil',
    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (n === 1 && level >= 9) {
        h.flags.reinforced = true;
        h.notes.push('Haunt 9: this Ring starts with 8 Guard.');
      }
      return h;
    },
  };
}

export const briarRing1 = briarRing(1);
export const briarRing2 = briarRing(2);
export const briarRing3 = briarRing(3);

const rings = (c) => allies(c).filter(a => String(a.defId).startsWith('briar-ring') && isAlive(a));
const fury = (c) => 2 * cnt(c, 'fury');

export const briarIdol = {
  id: 'briar-idol',
  name: 'The Briar Idol',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [151, 151],
  silhouette: 'idol',
  palette: ['#6d6a5c', '#a09a85', '#20201a'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 2 },
  scale: 1.5,
  lore: 'A garden statue swallowed whole by thorn. Only the stone eyes are still showing and they are still looking at you.',

  onSpawn(c) { setCnt(c, 'fury', 0); mem(c).broken = []; mem(c).regrew = false; announceIdol(c); },

  /** §14: one retaliation damage per surviving Ring. */
  onAttacked(c) { retaliate(c, rings(c).length); },

  onTurnEnd(c) { announceIdol(c); },

  moves: {
    'stone-palm': {
      id: 'stone-palm', name: 'Stone Palm', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + fury(c),
      tell: 'A hand you had not noticed comes out of the thorn.',
      effect(c) { hitPlayer(c, 11 + fury(c)); },
    },
    'briar-sweep': {
      id: 'briar-sweep', name: 'Briar Sweep', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => 4 + fury(c),
      tell: 'The whole mass of it turns over, three times.',
      effect(c) { hitPlayer(c, 4 + fury(c), 3); },
    },
    'rooted-silence': {
      id: 'rooted-silence', name: 'Rooted Silence', intent: Intent.DEFEND, block: 14,
      tell: 'It does nothing at all, very solidly.',
      effect(c) {
        c.block(c.self, 14);
        for (const r of rings(c)) c.block(r, 6);
      },
    },
    'angry-growth': {
      id: 'angry-growth', name: 'Angry Growth', intent: Intent.SUMMON,
      tell: 'Something you broke starts coming back.',
      effect(c) {
        const m = mem(c);
        const n = (m.broken || []).shift();
        m.regrew = true;
        addCnt(c, 'fury', 1, 3);
        if (n) c.summon(`briar-ring-${n}`, { hp: 8 });
        announceIdol(c);
      },
    },
  },

  /** §14: Angry Growth "can occur only ONCE during the fight." */
  nextMove: (c) => {
    const m = mem(c);
    if (!m.regrew && (m.broken || []).length) return 'angry-growth';
    return cyc(['stone-palm', 'briar-sweep', 'rooted-silence'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    return h;
  },
};

function announceIdol(c) {
  const n = rings(c).length;
  c.announceRule({
    id: `idol:${c.self.id}`,
    name: `Briar Rings ${n} / 3 — Fury ${cnt(c, 'fury')} / 3`,
    text: `Every Attack Trick on the Idol costs you ${n}, one per surviving Ring. Each Ring has 18 Integrity `
      + 'of its own — but breaking one gives it 1 Fury, worth 2 attack damage, for good. '
      + 'Breaking them, ignoring them and going indirect are all real answers.',
  });
}

/* ══ Big Scare 3 — The Carrion Hedge (§15) ═══════════════════════════════════ */
function hedgeSection(id, name, lore, tell) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'bossPart', partOf: 'carrion-hedge',
    hp: [24, 24],
    silhouette: id,
    palette: ['#3a3526', '#6b6144', '#161309'],
    shape: { body: 'sprawling', limbs: 0, eyes: 0 },
    scale: 0.55,
    lore,

    /** §15: "every destroyed section begins a Regrowth Countdown 3." */
    onDeath(c) {
      const body = allies(c).find(a => a.defId === 'carrion-hedge' && isAlive(a));
      if (!body) return;
      const m = (body.mem ||= {});
      m.regrowing = { ...(m.regrowing || {}), [id]: 3 };
    },

    moves: { hold: { id: 'hold', name: 'Growing', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'elite'); },
  };
}

export const hedgeCrown = hedgeSection(
  'hedge-crown', 'Crown', 'The top of the hedge, still putting out shoots.',
  'While this holds, the Hedge\'s attacks deal 3 more.',
);
export const hedgeMiddle = hedgeSection(
  'hedge-middle', 'Middle', 'The thick of it, packed solid with dead wood.',
  'While this holds, the Hedge gains 6 Guard at the start of its turn.',
);
export const hedgeRoots = hedgeSection(
  'hedge-roots', 'Roots', 'What is under it, which is most of it.',
  'While this holds, the Hedge recovers 5 Courage at the end of its turn.',
);

const SECTIONS = ['hedge-crown', 'hedge-middle', 'hedge-roots'];
const intact = (c, id) => allies(c).some(a => a.defId === id && isAlive(a));

export const carrionHedge = {
  id: 'carrion-hedge',
  name: 'The Carrion Hedge',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [160, 160],
  silhouette: 'carrion',
  palette: ['#2e2a1d', '#5a5138', '#121009'],
  shape: { body: 'sprawling', limbs: 6, eyes: 0 },
  scale: 1.75,
  lore: 'A whole run of dead hedge that has decided to be one animal. The branches are bare and new shoots keep appearing out of the rotten wood.',

  onSpawn(c) { mem(c).regrowing = {}; announceHedge(c); },

  onTurnStart(c) { if (intact(c, 'hedge-middle')) c.block(c.self, 6); },

  onTurnEnd(c) {
    const m = mem(c);
    if (intact(c, 'hedge-roots')) c.heal(c.self, 5);
    /* §15: "When the main body falls below 50 percent Courage, destroyed
       sections STOP REGROWING." The fight has an end, and this is where the
       player stops paying for the same section twice. */
    const stalled = c.self.hp <= c.self.maxHp * 0.5;
    for (const id of Object.keys(m.regrowing || {})) {
      if (stalled) continue;
      m.regrowing[id] -= 1;
      if (m.regrowing[id] > 0) continue;
      delete m.regrowing[id];
      c.summon(id, { hp: 12 });
    }
    announceHedge(c);
  },

  moves: {
    'dead-branches': {
      id: 'dead-branches', name: 'Dead Branches', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + (intact(c, 'hedge-crown') ? 3 : 0),
      tell: 'Everything it has, all at once, from above.',
      effect(c) { hitPlayer(c, 12 + (intact(c, 'hedge-crown') ? 3 : 0)); },
    },
    'drag-through': {
      id: 'drag-through', name: 'Drag Through the Hedge', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + (intact(c, 'hedge-crown') ? 3 : 0),
      tell: 'It takes hold and pulls you through the middle of itself.',
      effect(c) { hitPlayer(c, 5 + (intact(c, 'hedge-crown') ? 3 : 0), 2); },
    },
    'feed-the-roots': {
      id: 'feed-the-roots', name: 'Feed the Roots', intent: Intent.BUFF,
      tell: 'It puts everything it has into what is underneath.',
      effect(c) {
        c.heal(c.self, 6);
        const m = mem(c);
        for (const id of Object.keys(m.regrowing || {})) {
          m.regrowing[id] = Math.max(0, m.regrowing[id] - 1);
        }
        announceHedge(c);
      },
    },
  },

  nextMove: (c) => cyc(['dead-branches', 'drag-through', 'feed-the-roots'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    return h;
  },
};

function announceHedge(c) {
  const on = SECTIONS.filter(id => intact(c, id));
  const NICE = { 'hedge-crown': 'Crown', 'hedge-middle': 'Middle', 'hedge-roots': 'Roots' };
  const waiting = Object.entries(mem(c).regrowing || {})
    .map(([id, n]) => `${NICE[id]} in ${n}`).join(', ');
  const stalled = c.self.hp <= c.self.maxHp * 0.5;
  c.announceRule({
    id: `hedge:${c.self.id}`,
    name: `Sections: ${on.map(id => NICE[id]).join(' · ') || 'none'}`,
    text: 'Crown: +3 on its attacks. Middle: 6 Guard a turn. Roots: 5 Courage a turn. '
      + `Each has 24 Integrity. ${waiting ? `Regrowing — ${waiting}. ` : ''}`
      + (stalled ? 'Below half Courage, nothing grows back any more.'
        : 'Below half its Courage they stop coming back — until then they do.'),
  });
}

export const MAZE_SCARES = [
  moldMinotaur,
  briarIdol, briarRing1, briarRing2, briarRing3,
  carrionHedge, hedgeCrown, hedgeMiddle, hedgeRoots,
];
