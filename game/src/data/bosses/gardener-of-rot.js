/**
 * The Gardener of Rot — the Withered Hedge Maze boss. OWNER: enemies.
 * Source of truth: docs/design/regions/12-hedge-maze.md §16–§29.
 *
 * "The Gardener of Rot is the Head Gardener's PHILOSOPHICAL OPPOSITE. The Head
 * Gardener wanted everything trimmed, ordered, cultivated and controlled. The
 * Gardener of Rot believes all those distinctions are temporary. Flowers become
 * mulch. Mulch becomes mushrooms. Mushrooms feed roots. Roots crack stone.
 * Nothing stays what it was." (§16.)
 *
 * "Its philosophy is: NOTHING IS RUINED IF SOMETHING ELSE CAN GROW FROM IT. The
 * danger is that it refuses to recognise when something wants to remain itself."
 * Which is the mansion's whole error stated from the other end — the Keeper
 * wants to preserve you, this one wants to compost you, and neither asks.
 *
 * ── THE PLAYER DRIVES A SECOND CLOCK ────────────────────────────────────────
 *
 * §22 calls this "the heart of the fight": the player controls the Gardener's
 * Courage and ALSO the Decay Cycle, and the two pull against each other. 22
 * damage in a turn advances the state — which is sometimes exactly what you
 * want (out of Rotten to stop the retaliation, into Withered for the 15%
 * vulnerability) and sometimes the last thing you want (out of Withered, into
 * Regrown). §18 says it plainly: "heavy damage CHANGES the boss's state rather
 * than simply being universally correct."
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, bossDmg, flag,
  phaseAt, isAlive, dmgTaken,
} from '../enemies/_lib.js';
import { retaliate } from '../enemies/hedge-maze.js';

const REGION = 'hedge-maze';
const SOLO_MAX = 405;
const PHASE_TWO_AT = 230;
const LAST_AT = 85;

/* ══ the Decay Cycle (§17) ═══════════════════════════════════════════════════ */
const DECAY = ['Withered', 'Rotten', 'Regrown'];
const decay = (c) => DECAY[cnt(c, 'decay') % 3];

/* ══ phase two's secondary Growths (§24) ═════════════════════════════════════ */
function growth(id, name, lore, tell) {
  return {
    id, name, region: REGION, tier: 'boss', role: 'bossPart', partOf: 'gardener-of-rot',
    summonOnly: true,
    hp: [25, 25],
    silhouette: id,
    palette: ['#3b4028', '#6f7a4a', '#151810'],
    shape: { body: 'sprawling', limbs: 0, eyes: 0 },
    scale: 0.55,
    lore,

    /** §24: a destroyed Growth is Composted, and the dormant one takes its place. */
    onDeath(c) {
      const boss = allies(c).find(a => a.defId === 'gardener-of-rot' && isAlive(a));
      if (!boss) return;
      const m = (boss.mem ||= {});
      m.composted = { id, turns: 2 };
      if (decayOf(boss) === 'Rotten') {
        boss.counters = boss.counters || {};
        boss.counters.compost = Math.min(2, (boss.counters.compost || 0) + 1);
      }
    },

    moves: { grow: { id: 'grow', name: 'Growing', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'grow',
    hauntScaling(level) { return hauntBase(level, 'boss'); },
  };
}

/** Read a boss actor's Decay state from outside its own ctx. */
function decayOf(boss) { return DECAY[((boss.counters || {}).decay || 0) % 3]; }

export const theBramble = growth(
  'the-bramble', 'The Bramble',
  'A dead hedge shape that has come up out of the ground with thorns all through it.',
  'While this stands, every Attack Trick on the Gardener costs you 1 more.',
);
export const theFungus = growth(
  'the-fungus', 'The Fungus',
  'A pale shelf of it, taller than a door, breathing slightly.',
  'While this stands, the Gardener recovers 4 Courage at the end of its turn.',
);
export const theHusk = growth(
  'the-husk', 'The Husk',
  'Whatever this was, it is a shell now, and the shell is enormous.',
  'While this stands, the Gardener gains 6 Guard at the start of its turn.',
);

const GROWTHS = ['the-bramble', 'the-fungus', 'the-husk'];
const standing = (c) => allies(c).filter(a => GROWTHS.includes(a.defId) && isAlive(a));
const growthUp = (c, id) => allies(c).some(a => a.defId === id && isAlive(a));

/* ══ the boss ════════════════════════════════════════════════════════════════ */
const rotDmg = (c) => {
  const d = decay(c);
  return (d === 'Withered' ? -2 : d === 'Regrown' ? 3 : 0)
    + 2 * cnt(c, 'compost') + cnt(c, 'torn') + bossDmg(c);
};

export const gardenerOfRot = {
  id: 'gardener-of-rot',
  name: 'The Gardener of Rot',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'gardener-rot',
  palette: ['#5a4a2c', '#9c8a52', '#1a1409'],
  shape: { body: 'tall-thin', limbs: 3, eyes: 0 },
  scale: 1.9,
  lore: 'A decayed straw coat under a smiling wooden scarecrow mask, both of them well through with mushrooms and thorn. A pair of rusted pruning shears hangs at its side, unused. It carries a compost fork instead.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.acts = 0;
    m.composted = null;
    setCnt(c, 'decay', flag(c, 'openDecay', 0));
    setCnt(c, 'compost', 0);
    setCnt(c, 'torn', 0);
    setCnt(c, 'retaliated', 0);
    announceDecay(c);
  },

  onPlayerTurnStart(c) { mem(c).sped = false; setCnt(c, 'retaliated', 0); },

  /** §17's Rotten: "whenever damaged by an Attack Trick, deal 1 retaliation
      damage. MAXIMUM FOUR TRIGGERS PER PLAYER TURN." */
  onAttacked(c) {
    if (decay(c) !== 'Rotten' || cnt(c, 'retaliated') >= 4) return;
    const extra = growthUp(c, 'the-bramble') ? 1 : 0;
    if (retaliate(c, 1 + extra)) addCnt(c, 'retaliated', 1, 4);
  },

  /**
   * §18's acceleration: "if the player deals at least 22 Courage damage during
   * one turn, advance the Decay Cycle by one step AFTER the player turn."
   *
   * At turn end rather than as the threshold is crossed, because §18 says so
   * and because the state is what every `damageFn` in the fight reads — moving
   * it mid-turn would rewrite an intent the player had already been shown.
   * At turn end it lands before the next intent is drawn, which is the honest
   * window.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (!m.sped && dmgTaken(c) >= 22) { m.sped = true; addCnt(c, 'decay', 1, 9999); }
    announceDecay(c);
  },

  /** §17's Regrown, and §24/§25's Growth interactions. */
  onTurnStart(c) {
    const d = decay(c);
    if (d === 'Regrown') {
      c.block(c.self, 7);
      for (const g of standing(c)) c.block(g, 5);
    }
    if (d === 'Withered') {
      for (const g of standing(c)) c.loseHp(g, 5);
    }
    if (growthUp(c, 'the-husk')) c.block(c.self, 6);
  },

  onTurnEnd(c) {
    const m = mem(c);
    if (growthUp(c, 'the-fungus')) c.heal(c.self, 4);
    // §18: "the state normally advances after TWO Gardener actions."
    m.acts = (m.acts || 0) + 1;
    if (m.acts >= 2) { m.acts = 0; addCnt(c, 'decay', 1, 9999); }
    // §24: a Composted Growth is replaced by the dormant one after two turns.
    if (m.composted) {
      m.composted.turns -= 1;
      if (m.composted.turns <= 0) {
        const up = standing(c).map(a => a.defId);
        const dormant = GROWTHS.find(g => g !== m.composted.id && !up.includes(g));
        if (dormant) c.summon(dormant, { hp: 15 });
        m.composted = null;
      }
    }
    if (!m.last && m.phase === 2 && c.self.hp <= phaseAt(c, LAST_AT, SOLO_MAX)) {
      m.last = true;
      c.say('Nothing is ruined. Something else grows.', 'warn');
    }
    announceDecay(c);
  },

  /** §17's Withered: "takes 15 percent additional damage." */
  damageTakenMul(c) { return decay(c) === 'Withered' ? 1.15 : 1; },

  moves: {
    /* ── phase one (§19) ──────────────────────────────────────────────────── */
    'rusted-fork': {
      id: 'rusted-fork', name: 'Rusted Fork', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => Math.max(0, 12 + rotDmg(c)),
      tell: 'The compost fork, which is not for this.',
      effect(c) { const d = Math.max(0, 12 + rotDmg(c)); setCnt(c, 'torn', 0); hitPlayer(c, d); },
    },
    'moldy-sweep': {
      id: 'moldy-sweep', name: 'Moldy Sweep', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 2,
      damageFn: (c) => Math.max(0, 5 + rotDmg(c)),
      applies: [{ id: 'mildewed', stacks: 1, to: 'player' }],
      tell: 'Two low swings and a great deal of spore.',
      effect(c) {
        const d = Math.max(0, 5 + rotDmg(c));
        setCnt(c, 'torn', 0);
        const before = c.player.hp;
        hitPlayer(c, d, 2);
        if (before - c.player.hp >= 2 * d) {
          c.player._mildewSpent = false;
          c.applyStatus(c.player, 'mildewed', 1);
        }
      },
    },
    'compost-toss': {
      id: 'compost-toss', name: 'Compost Toss', intent: Intent.SUMMON,
      blockFn: () => 6,
      tell: 'It throws an armful of the garden onto the floor.',
      effect(c) {
        c.block(c.self, 6);
        const piles = allies(c).filter(a => a.defId === 'rot-pile' && isAlive(a));
        if (piles.length < 2) c.summon('rot-pile');
        announceDecay(c);
      },
    },
    'let-it-break-down': {
      id: 'let-it-break-down', name: 'Let It Break Down', intent: Intent.BUFF,
      tell: 'It opens its coat and lets something go.',
      effect(c) { c.loseHp(c.self, 6); addCnt(c, 'compost', 1, 3); announceDecay(c); },
    },
    reclaim: {
      id: 'reclaim', name: 'Reclaim', intent: Intent.BUFF,
      tell: 'It picks the heap back up and puts it away.',
      effect(c) {
        const pile = allies(c).find(a => a.defId === 'rot-pile' && isAlive(a));
        if (!pile) { c.block(c.self, 8); return; }
        c.despawn(pile);
        c.heal(c.self, 8 + 3 * cnt(c, 'compost'));
        setCnt(c, 'compost', 0);
        announceDecay(c);
      },
    },

    /* ── the transition (§23) ─────────────────────────────────────────────── */
    'good-soil': {
      id: 'good-soil', name: 'Good Soil Needs Something Dead',
      intent: Intent.SUMMON, anchored: true,
      tell: 'The maze walls come in and three shapes stand up out of them.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        setCnt(c, 'compost', 0);
        for (const p of allies(c).filter(a => a.defId === 'rot-pile' && isAlive(a))) c.despawn(p);
        // §24: "two of the three are selected randomly. The third remains dormant."
        const pool = GROWTHS.slice();
        for (let i = 0; i < 2 && pool.length; i++) {
          c.summon(pool.splice(c.rng.int(pool.length), 1)[0]);
        }
        c.say('Good soil needs something dead.', 'warn');
        announceDecay(c);
      },
    },

    /* ── phase two (§26, §28) ─────────────────────────────────────────────── */
    'thorn-fork': {
      id: 'thorn-fork', name: 'Thorn Fork', intent: Intent.ATTACK_BIG, damage: 15, hits: 1,
      damageFn: (c) => Math.max(0, 15 + rotDmg(c)),
      tell: 'The fork has grown thorns of its own now.',
      effect(c) { const d = Math.max(0, 15 + rotDmg(c)); setCnt(c, 'torn', 0); hitPlayer(c, d); },
    },
    'rotting-flurry': {
      id: 'rotting-flurry', name: 'Rotting Flurry', intent: Intent.ATTACK, damage: 4, hits: 4,
      damageFn: (c) => Math.max(0, 4 + rotDmg(c)),
      tell: 'Four fast, wet, careless swings.',
      effect(c) { const d = Math.max(0, 4 + rotDmg(c)); setCnt(c, 'torn', 0); hitPlayer(c, d, 4); },
    },
    'feed-the-maze': {
      id: 'feed-the-maze', name: 'Feed the Maze', intent: Intent.DEFEND, block: 8,
      tell: 'It gives the garden something back.',
      effect(c) {
        c.block(c.self, 8);
        const up = standing(c);
        if (up.length) c.heal(up[c.rng.int(up.length)], 8);
      },
    },
    'everything-returns': {
      id: 'everything-returns', name: 'Everything Returns', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => Math.max(0, (mem(c).composted ? 8 : 10) + rotDmg(c)),
      tell: 'It is not finished with anything.',
      effect(c) {
        const m = mem(c);
        const d = Math.max(0, (m.composted ? 8 : 10) + rotDmg(c));
        setCnt(c, 'torn', 0);
        if (m.composted) m.composted.turns = Math.max(0, m.composted.turns - 1);
        else addCnt(c, 'compost', 1, 2);
        hitPlayer(c, d);
        announceDecay(c);
      },
    },
    'tear-yourself-open': {
      id: 'tear-yourself-open', name: 'Tear Yourself Open', intent: Intent.BUFF,
      tell: 'It opens itself up to get at what is underneath.',
      effect(c) {
        c.loseHp(c.self, 8);
        addCnt(c, 'decay', 1, 9999);
        mem(c).acts = 0;
        setCnt(c, 'torn', 5);
        announceDecay(c);
      },
    },
    'compost-burst': {
      id: 'compost-burst', name: 'Compost Burst', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      damageFn: (c) => Math.max(0, 14 + rotDmg(c)),
      tell: 'Whatever it has been holding goes off.',
      effect(c) {
        const d = Math.max(0, 14 + rotDmg(c));
        setCnt(c, 'compost', 0);
        setCnt(c, 'torn', 0);
        hitPlayer(c, d);
        // §28: "All active Growths lose 6 Integrity." Its own power damages its garden.
        for (const g of standing(c)) c.loseHp(g, 6);
        announceDecay(c);
      },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'good-soil';

    if (m.phase === 2) {
      // §28: 2 Compost makes its next move Compost Burst.
      if (cnt(c, 'compost') >= 2) return 'compost-burst';
      return cyc(['thorn-fork', 'feed-the-maze', 'rotting-flurry', 'everything-returns',
        'tear-yourself-open'], countTwo(c));
    }
    const beat = cyc(['compost-toss', 'rusted-fork', 'moldy-sweep', 'let-it-break-down', 'reclaim'],
      (c.history || []).length);
    if (beat !== 'reclaim') return beat;
    // §19: "Reclaim — used if at least one Rot Pile exists." Otherwise it swings.
    return allies(c).some(a => a.defId === 'rot-pile' && isAlive(a)) ? 'reclaim' : 'rusted-fork';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 10) {
      h.flags.openDecay = 1;
      h.counters.decay = 1;
      h.notes.push('Haunt 10: it opens in Rotten instead of Withered.');
    }
    return h;
  },
};

function countTwo(c) {
  const ids = new Set(['thorn-fork', 'feed-the-maze', 'rotting-flurry', 'everything-returns',
    'tear-yourself-open']);
  return (c.history || []).filter(x => ids.has(x)).length;
}

function announceDecay(c) {
  const d = decay(c);
  const m = mem(c);
  const TXT = {
    Withered: 'WITHERED: it takes 15% MORE damage and its attacks deal 2 less.',
    Rotten: 'ROTTEN: every Attack Trick on it costs you 1, up to four a turn.',
    Regrown: 'REGROWN: 7 Guard at the start of its turn and its attacks deal 3 more.',
  };
  const up = standing(c).map(a => a.name);
  c.announceRule({
    id: `rot:${c.self.id}`,
    name: `${d} → ${DECAY[(cnt(c, 'decay') + 1) % 3]}  (${2 - (m.acts || 0)} action${2 - (m.acts || 0) === 1 ? '' : 's'} left)`,
    text: `${TXT[d]} It turns after two of its actions — and 22 damage from you in one turn turns it early. `
      + 'That is not always what you want.'
      + (m.phase === 2 && up.length ? ` Standing: ${up.join(', ')}.` : ''),
  });
}

export const MAZE_BOSSES = [gardenerOfRot, theBramble, theFungus, theHusk];
