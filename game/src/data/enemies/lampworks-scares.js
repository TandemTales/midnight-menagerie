/**
 * The Lampworks — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/09-lampworks.md §13–§15.
 *
 *   The Chandelier      six Lights, three states each, several timers at once.
 *   The Blackout Beast  one shared meter, and both ends of it are a trap.
 *   The Great Lantern   48 damage, six turns away, and entirely your decision.
 *
 * ── EVERY RELEASE IS TELEGRAPHED, WHICH IS THE WHOLE REGION ────────────────
 *
 * §15 says the Great Lantern's 48-damage release "is deliberately terrifying"
 * and then, in its own heading, "BUT THE RELEASE IS HIGHLY TELEGRAPHED". That
 * pairing is the region: a number big enough to end a run, printed on the
 * board for four turns before it can happen, with three different levers for
 * doing something about it.
 *
 * So every one of these scales through a COUNTER read by `damageFn`, never
 * through a status the intent cannot show. Open the Lantern renders as the real
 * number — 8 per Charge, live — from the moment it becomes reachable.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, hitPlayer, hauntBase, flag, field, dmgTaken,
} from './_lib.js';

const REGION = 'lampworks';

/* ══ Big Scare 1 — The Chandelier (§13) ══════════════════════════════════════
 *
 * "The Chandelier creates several visible timers at once." (§13.)
 *
 * Six Lights, each Unlit / Lit / Overcharged, held as two counters — how many
 * are Lit and how many are Overcharged — because that is exactly what every
 * rule in §13 asks about and what the player needs to read. An Overcharged
 * Light that survives a full turn EXPLODES for 4, which is the timer.
 */
const LIGHTS = 6;
const lit = (c) => cnt(c, 'lit');
const over = (c) => cnt(c, 'over');

export const chandelier = {
  id: 'chandelier',
  name: 'The Chandelier',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [144, 144],
  silhouette: 'chandelier',
  palette: ['#e6cf8a', '#fff4cf', '#2b2110'],
  shape: { body: 'sprawling', limbs: 6, eyes: 0 },
  scale: 1.7,
  lore: 'It came off the ceiling some time ago and gets around on its own chains now. Six flames burn along the arms and none of them are the right colour.',

  onSpawn(c) {
    setCnt(c, 'lit', flag(c, 'openLit', 0));
    setCnt(c, 'over', 0);
    mem(c).shed = false;
    announceChandelier(c);
  },

  /**
   * §13's explosion, resolved at PLAYER-TURN START — engine step 4, three steps
   * before intents are drawn.
   *
   * It used to fire at the Chandelier's own `onTurnStart`, which is inside the
   * enemy phase and therefore AFTER the intent that reads these counters was
   * committed: Chain Sweep promised 9 and delivered 8, because the Light it was
   * counting had just gone off. The audit caught it seven times. Armed at the
   * end of its turn, resolved here, so the number the player reads is the
   * number that lands.
   *
   * The damage is tagged `cause: 'timer'` for the reason the Graveyard's
   * Countdowns are: a clock the player has been watching is its own promise,
   * and the audit scores it apart from intents rather than against them.
   */
  onPlayerTurnStart(c) {
    const m = mem(c);
    m.shed = false;
    const due = Math.min(m.armed || 0, over(c));
    m.armed = 0;
    if (!due) return;
    addCnt(c, 'over', -due, LIGHTS, 0);
    if (c.e && c.e.dealDamage) {
      c.e.dealDamage({ attacker: null, defender: c.player, amount: 4 * due, kind: 'hazard', cause: 'timer' });
    } else {
      hitPlayer(c, 4 * due);
    }
    c.say('Something up there lets go.', 'warn');
    announceChandelier(c);
  },

  /**
   * §13's player interaction: "whenever the Chandelier loses at least 12
   * Courage during one player turn, extinguish one OVERCHARGED Light first,
   * otherwise one Lit." Resolved the MOMENT the threshold is crossed — see the
   * long note on `shedCharge` in `lampworks.js` for why end-of-turn lies.
   */
  onDamaged(c) {
    if (mem(c).shed || dmgTaken(c) < 12) return;
    mem(c).shed = true;
    if (over(c) > 0) addCnt(c, 'over', -1, LIGHTS, 0);
    else if (lit(c) > 0) addCnt(c, 'lit', -1, LIGHTS, 0);
    else return;
    announceChandelier(c);
  },

  /** Arm whatever is still Overcharged when its turn ends; see onPlayerTurnStart. */
  onTurnEnd(c) { mem(c).armed = over(c); },

  moves: {
    'light-the-room': {
      id: 'light-the-room', name: 'Light the Room', intent: Intent.BUFF,
      tell: 'Two more of the arms find a flame.',
      effect(c) {
        const room = LIGHTS - lit(c) - over(c);
        addCnt(c, 'lit', Math.min(2, room), LIGHTS, 0);
        announceChandelier(c);
      },
    },
    overcharge: {
      id: 'overcharge', name: 'Overcharge', intent: Intent.BUFF,
      tell: 'Two of the flames go white and start to hum.',
      effect(c) {
        const n = Math.min(2, lit(c));
        addCnt(c, 'lit', -n, LIGHTS, 0);
        addCnt(c, 'over', n, LIGHTS, 0);
        announceChandelier(c);
      },
    },
    'chain-sweep': {
      id: 'chain-sweep', name: 'Chain Sweep', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + lit(c) + 2 * over(c),
      tell: 'It swings the whole length of its chain across the room.',
      effect(c) { hitPlayer(c, 7 + lit(c) + 2 * over(c)); },
    },
    'crystal-rain': {
      id: 'crystal-rain', name: 'Crystal Rain', intent: Intent.ATTACK_DEFEND, damage: 3, hits: 3,
      blockFn: (c) => 5 * over(c),
      tell: 'Pieces of it come down and it does not seem to mind.',
      effect(c) { c.block(c.self, 5 * over(c)); hitPlayer(c, 3, 3); },
    },
  },

  nextMove: (c) => cyc(['light-the-room', 'chain-sweep', 'overcharge', 'crystal-rain'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openLit = 2;
      h.counters.lit = 2;
      h.notes.push('Haunt 9: it opens with two Lights already Lit.');
    }
    return h;
  },
};

function announceChandelier(c) {
  const l = lit(c), o = over(c);
  c.announceRule({
    id: `chand:${c.self.id}`,
    name: `Lights — ${o} Overcharged, ${l} Lit, ${LIGHTS - l - o} Dark`,
    text: `Each Lit is +1 damage, each Overcharged +2 — Chain Sweep is ${7 + l + 2 * o} right now. `
      + 'An Overcharged Light that survives its next turn EXPLODES for 4. '
      + 'Deal it 12 in one turn to put one out, Overcharged first.',
  });
}

/* ══ Big Scare 2 — The Blackout Beast (§14) ══════════════════════════════════
 *
 * "The player WANTS high Illumination because the Beast becomes vulnerable. But
 * pushing it all the way to 4 enables Snuff Everything. Sometimes holding at 3
 * is ideal." (§14.)
 *
 * A five-step meter where both ends are a trap and the good answer is a
 * deliberate stop one short of the top.
 */
const illum = (c) => Math.max(0, Math.min(4, cnt(c, 'illumination')));

export const blackoutBeast = {
  id: 'blackout-beast',
  name: 'The Blackout Beast',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [137, 137],
  silhouette: 'beast-dark',
  palette: ['#0b0a0f', '#2a2833', '#040405'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.55,
  lore: 'A big four-legged shadow that runs between the lamps. It is only there in the places the light is not.',

  onSpawn(c) {
    setCnt(c, 'illumination', flag(c, 'openIllum', 2));
    mem(c).lifted = false;
    announceBeast(c);
  },

  onPlayerTurnStart(c) { mem(c).lifted = false; },

  /** §14: "at least 18 damage in one turn: increase Illumination by 1. Max 4." */
  onDamaged(c) {
    if (mem(c).lifted || dmgTaken(c) < 18 || illum(c) >= 4) return;
    mem(c).lifted = true;
    addCnt(c, 'illumination', 1, 4, 0);
    announceBeast(c);
  },

  /** §14: bright makes it fragile, dark makes it tough. */
  damageTakenMul(c) {
    const i = illum(c);
    if (i <= 1) return 0.8;
    if (i >= 3) return 1.2;
    return 1;
  },

  moves: {
    'devour-light': {
      id: 'devour-light', name: 'Devour Light', intent: Intent.DEFEND, block: 9,
      tell: 'It puts its mouth over the nearest lamp.',
      effect(c) { c.block(c.self, 9); addCnt(c, 'illumination', -1, 4, 0); announceBeast(c); },
    },
    'shadow-pounce': {
      id: 'shadow-pounce', name: 'Shadow Pounce', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => Math.max(0, 11 + beastMod(c)),
      tell: 'It comes out of a corner that was not that big.',
      effect(c) { hitPlayer(c, Math.max(0, 11 + beastMod(c))); },
    },
    'run-between-lamps': {
      id: 'run-between-lamps', name: 'Run Between Lamps', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => Math.max(0, 5 + beastMod(c)),
      tell: 'It crosses the room through every dark patch on the way.',
      effect(c) {
        const before = c.player.hp;
        hitPlayer(c, Math.max(0, 5 + beastMod(c)), 2);
        // "Reduce Illumination by 1 if both hits deal Courage damage."
        if (before - c.player.hp >= 2 * Math.max(1, 5 + beastMod(c))) {
          addCnt(c, 'illumination', -1, 4, 0);
        }
        announceBeast(c);
      },
    },
    'snuff-everything': {
      id: 'snuff-everything', name: 'Snuff Everything', intent: Intent.ATTACK_BIG, damage: 13, hits: 1,
      blockFn: () => 12,
      tell: 'Every lamp in the room at once.',
      effect(c) {
        c.block(c.self, 12);
        hitPlayer(c, 13);
        setCnt(c, 'illumination', 1);
        announceBeast(c);
      },
    },
  },

  /** §14: Snuff Everything is "used only at Illumination 4". */
  nextMove: (c) => {
    if (illum(c) >= 4) return 'snuff-everything';
    return cyc(['shadow-pounce', 'devour-light', 'run-between-lamps'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openIllum = 1;
      h.counters.illumination = 1;
      h.notes.push('Haunt 9: it opens at Illumination 1, already in its strong half.');
    }
    return h;
  },
};

/** §14's per-Illumination damage modifier. */
function beastMod(c) {
  const i = illum(c);
  if (i <= 1) return 5;
  if (i >= 3) return -2;
  return 0;
}

function announceBeast(c) {
  const i = illum(c);
  const TXT = [
    'Total Darkness: +5 damage, and it takes 20% LESS.',
    'Dark: +5 damage, and it takes 20% LESS.',
    'Even: no modifier either way.',
    'Bright: it takes 20% MORE and deals 2 less. This is where you want it.',
    'Blazing: it takes 20% MORE — but Snuff Everything is now available to it.',
  ];
  c.announceRule({
    id: `beast:${c.self.id}`,
    name: `Illumination ${i} / 4`,
    text: `${TXT[i]} Deal it 18 in one turn to raise the meter one step, once a turn.`,
  });
}

/* ══ Big Scare 3 — The Great Lantern (§15) ═══════════════════════════════════
 *
 * 48 damage, and every turn of the four it takes to get there is on the board.
 * §15's own list of what the player may do with that is four different plans —
 * suppress it, race it, empty it for a free turn, or take the hit on purpose
 * while spending the interval scaling — which is the best statement of the
 * region's thesis in the chapter.
 */
export const greatLantern = {
  id: 'great-lantern',
  name: 'The Great Lantern',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [150, 150],
  silhouette: 'lantern',
  palette: ['#f0d99a', '#fffbe8', '#2d2412'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 1 },
  scale: 1.6,
  lore: 'A lantern taller than you are, walking on iron legs. Whatever is burning in it throws shadows through the walls.',

  onSpawn(c) {
    setCnt(c, 'charge', flag(c, 'openReservoir', 1));
    mem(c).bled = false;
    announceLantern(c);
  },

  onPlayerTurnStart(c) { mem(c).bled = false; },

  /**
   * §15's Bleed Charge — 15 damage takes one, 30 takes two — and Overventing:
   * "if Charge is reduced to 0 BY PLAYER EFFECTS, the Great Lantern becomes
   * Dimmed", which costs it a whole turn. That is the free turn §15 invites the
   * player to go and buy on purpose.
   */
  onDamaged(c) {
    if (mem(c).bled) return;
    const d = dmgTaken(c);
    if (d < 15) return;
    mem(c).bled = true;
    const before = cnt(c, 'charge');
    addCnt(c, 'charge', d >= 30 ? -2 : -1, 6, 0);
    if (before > 0 && cnt(c, 'charge') === 0) mem(c).dimmed = true;
    announceLantern(c);
  },

  moves: {
    'store-flame': {
      id: 'store-flame', name: 'Store Flame', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'It draws something in through the vents.',
      effect(c) { c.block(c.self, 8); addCnt(c, 'charge', 2, 6, 0); announceLantern(c); },
    },
    'lantern-bash': {
      id: 'lantern-bash', name: 'Lantern Bash', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'It simply walks into you, glass first.',
      effect(c) { hitPlayer(c, 10); addCnt(c, 'charge', 1, 6, 0); announceLantern(c); },
    },
    'vent-heat': {
      id: 'vent-heat', name: 'Vent Heat', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'It lets a little of it out on purpose.',
      effect(c) { hitPlayer(c, 5, 2); addCnt(c, 'charge', -1, 6, 0); announceLantern(c); },
    },
    'open-the-lantern': {
      id: 'open-the-lantern', name: 'Open the Lantern', intent: Intent.ATTACK_BIG, damage: 40, hits: 1,
      damageFn: (c) => 8 * cnt(c, 'charge'),
      tell: 'It unlatches the front.',
      effect(c) {
        const d = 8 * cnt(c, 'charge');
        setCnt(c, 'charge', 0);
        hitPlayer(c, d);
        announceLantern(c);
      },
    },
    relight: {
      id: 'relight', name: 'Relight', intent: Intent.DEFEND_BUFF, block: 10,
      tell: 'There is nothing left in it. It starts again.',
      effect(c) {
        c.block(c.self, 10);
        addCnt(c, 'charge', 1, 6, 0);
        mem(c).dimmed = false;
        announceLantern(c);
      },
    },
  },

  /** §15: Open the Lantern is "available at 5 or more Charge". */
  nextMove: (c) => {
    if (mem(c).dimmed) return 'relight';
    if (cnt(c, 'charge') >= 5) return 'open-the-lantern';
    return cyc(['store-flame', 'lantern-bash', 'vent-heat', 'store-flame'],
      (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openReservoir = 2;
      h.counters.charge = 2;
      h.notes.push('Haunt 9: it opens with 2 Reservoir Charge.');
    }
    return h;
  },
};

function announceLantern(c) {
  const n = cnt(c, 'charge');
  const danger = n >= 5 ? 'IT CAN OPEN NOW — ' : n >= 4 ? 'DANGEROUS PRESSURE. ' : '';
  c.announceRule({
    id: `lantern:${c.self.id}`,
    name: `${danger}Reservoir ${n} / 6`,
    text: `At 5 Charge it can Open the Lantern for 8 per Charge — that is ${8 * n} at this level. `
      + 'Deal it 15 in one turn to bleed one Charge, 30 to bleed two. '
      + 'Empty it completely and it must spend a whole turn relighting.',
  });
}

export const LAMPWORKS_SCARES = [chandelier, blackoutBeast, greatLantern];
