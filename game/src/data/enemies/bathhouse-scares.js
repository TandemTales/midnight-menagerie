/**
 * The Bathhouse and Rain Wing — Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/14-bathhouse.md §14, §15, §16.
 *
 * Three of them, and each takes a different half of what Weather is for:
 *
 *   THE BOILER BELLOWER   a meter with bands, where the middle is safest and
 *                         both ends are dangerous in opposite directions
 *   THE FLOODED REFLECTION  the Weather decides how much you are TOLD
 *   THE STORM BATH        the whole cycle, on a clock you can push or hold
 *
 * ── THE REFLECTION READS LAST TURN, NOT THIS ONE ────────────────────────────
 *
 * §15 records the player's turn and prepares a response. Written literally that
 * is a number chosen after the intent was drawn, so the reading is taken at the
 * END of the player's turn and SETTLED at the start of the next one — the same
 * double buffer the Study's Oracle needed, and for the same reason. What the
 * player did on turn N is on the board as an intent all through turn N+1.
 *
 * §15's Weather clause then works out to exactly what it says: under Rain the
 * player sees the single committed response, and under Steam they see every
 * possible one, because Steam is the Weather that makes information worse.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, hitPlayer, hauntBase, flag, played, field,
} from './_lib.js';
import {
  weather, prepareWeather, openWeather, soak, wx, announceWeather,
  bathTurnStart, settleLedger,
} from './bathhouse.js';

const REGION = 'bathhouse';

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 1 — The Boiler Bellower (§14)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const boilerBellower = {
  id: 'boiler-bellower',
  name: 'The Boiler Bellower',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [154, 154],
  silhouette: 'boiler',
  palette: ['#5a3a2a', '#9c6a44', '#170e08'],
  shape: { body: 'squat', limbs: 2, eyes: 1 },
  scale: 1.5,
  lore: 'A huge iron boiler tears itself out of the basement wall. A furnace door opens and closes like a mouth.',

  onSpawn(c) { setCnt(c, 'psi', 1); mem(c).dealt0 = 0; announceBoiler(c); },

  /**
   * §14: "Whenever the player deals at least 16 damage during one turn, lose 1
   * Pressure. If the player deals at least 30, lose 2 instead."
   *
   * Measured from `damageDealtThisCombat`, because `damageDealtThisTurn` covers
   * the player turn AND the enemy phase after it — the Boiler's own Hot Pipes
   * would otherwise count toward the player's total and cool it down for free.
   *
   * Settled HERE and not at `onPlayerTurnEnd` for the reason `settleLedger`
   * gives: the gauge sets this turn's damage band, and a band that moves after
   * the intent is drawn is a promise the Boiler does not keep. The audit caught
   * it at 18-promised-10-delivered.
   */
  onPlayerTurnStart(c) {
    bathTurnStart(c);
    const now = c.e.stats.damageDealtThisCombat || 0;
    const dealt = now - (mem(c).dealt0 || 0);
    mem(c).dealt0 = now;
    if (dealt >= 16) {
      addCnt(c, 'psi', dealt >= 30 ? -2 : -1, 6, 0);
      c.say(dealt >= 30 ? 'The whole thing sags. Two off the gauge.' : 'The needle drops.', 'good');
      /* §14's Overcool: "If the player reduces Pressure to 0, the Boiler becomes
         Cold." A reward for pushing PAST the useful band, which is the only
         reason the low end is worth reaching at all. */
      if (cnt(c, 'psi') <= 0) c.applyStatus(c.self, 'cold', 1);
    }
    announceBoiler(c);
  },

  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); },

  moves: {
    stoke: {
      id: 'stoke', name: 'Stoke', intent: Intent.DEFEND_BUFF, block: 10,
      tell: 'The furnace door swings and something goes in.',
      effect(c) { c.block(c.self, 10); addCnt(c, 'psi', 2, 6, 0); announceBoiler(c); },
    },
    'hot-pipes': {
      id: 'hot-pipes', name: 'Hot Pipes', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => boilerDmg(c, 9),
      tell: 'Every pipe in the room goes hot at once.',
      effect(c) { hitPlayer(c, boilerDmg(c, 9)); addCnt(c, 'psi', 1, 6, 0); announceBoiler(c); },
    },
    vent: {
      id: 'vent', name: 'Vent', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => boilerDmg(c, 5),
      tell: 'It lets some of it go sideways, and the room fogs.',
      effect(c) {
        hitPlayer(c, boilerDmg(c, 5), 2);
        addCnt(c, 'psi', -2, 6, 0);
        prepareWeather(c, 'steam', 'The vented steam will fill the room.');
        announceBoiler(c);
      },
    },
    'boiler-burst': {
      id: 'boiler-burst', name: 'Boiler Burst', intent: Intent.ATTACK_BIG, damage: 24, hits: 1,
      damageFn: (c) => boilerDmg(c, 24),
      tell: 'It cannot hold it any longer.',
      effect(c) {
        hitPlayer(c, boilerDmg(c, 24));
        setCnt(c, 'psi', 2);
        c.block(c.self, 10);
        prepareWeather(c, 'steam', 'Everything it was holding is about to be in the air.');
        announceBoiler(c);
      },
    },
    'relight-furnace': {
      id: 'relight-furnace', name: 'Relight Furnace', intent: Intent.DEFEND_BUFF, block: 12,
      tell: 'It is out. Getting it going again takes the whole turn.',
      effect(c) {
        c.block(c.self, 12);
        setCnt(c, 'psi', 2);
        c.removeStatus(c.self, 'cold');
        announceBoiler(c);
      },
    },
  },

  nextMove: (c) => {
    if (c.has('cold', c.self)) return 'relight-furnace';
    if (cnt(c, 'psi') >= 6) return 'boiler-burst';
    if (cnt(c, 'psi') >= 5) return 'vent';
    return cyc(['stoke', 'hot-pipes'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.counters.psi = 3;
      h.notes.push('Haunt 9: it starts at 3 Pressure, halfway up the gauge.');
    }
    return h;
  },
};

/** §14's bands, in one expression so the intent and the swing cannot disagree. */
function boilerDmg(c, base) {
  const p = cnt(c, 'psi');
  const band = p <= 1 ? -3 : p >= 5 ? 4 : 0;
  return wx(c, Math.max(1, base + band));
}

function announceBoiler(c) {
  const p = cnt(c, 'psi');
  const band = p <= 1 ? 'LOW — its attacks deal 3 LESS'
    : p >= 6 ? 'CRITICAL — the next thing it does is a 24-damage Burst'
      : p >= 5 ? 'DANGEROUS — its attacks deal 4 MORE'
        : 'NORMAL — no modifier';
  c.announceRule({
    id: `boiler:${c.self.id}`,
    name: c.has('cold', c.self) ? 'COLD — the furnace is out' : `PRESSURE ${p} / 6`,
    text: c.has('cold', c.self)
      ? 'You overcooled it. Its whole next turn is spent relighting and it deals no damage at all.'
      : `${band}. 16 damage in one of your turns takes a Pressure off; 30 takes two. `
        + 'Take it all the way to 0 and the furnace goes out.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 2 — The Flooded Reflection (§15)
 * ═══════════════════════════════════════════════════════════════════════════ */
const RESPONSES = {
  damage: 'violent-reflection',
  guard: 'defensive-reflection',
  draw: 'curious-reflection',
  still: 'still-water',
};

export const floodedReflection = {
  id: 'flooded-reflection',
  name: 'The Flooded Reflection',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [145, 145],
  silhouette: 'mirror',
  palette: ['#8fa6b4', '#4f6472', '#131a1f'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 2 },
  scale: 1.45,
  lore: 'A tall mirror stands ankle deep in water. The reflection inside moves a moment later than the player. Sometimes it moves first.',

  onSpawn(c) {
    mem(c).reading = 'still';
    mem(c).next = 'still';
    /* §15's third category. The engine keeps damage dealt and Guard reaches it
       through the board-event stream; "ADDITIONAL Tricks drawn" is the one it
       has no number for, so the Reflection counts it on the seam the Secret
       Passages added. `reason` is what makes it ADDITIONAL. Owned by this
       enemy, so it goes when it does. */
    c.addHook('onCardsDrawn', (h) => {
      if (h.reason === 'turnStart') return;
      mem(c).drew = (mem(c).drew || 0) + ((h.cards || []).length);
    });
    announceMirror(c);
  },

  onPlayerTurnStart(c) {
    bathTurnStart(c);
    /* THE SETTLE. What the player did last turn becomes this turn's committed
       response, before intents are drawn. */
    mem(c).next = mem(c).reading || 'still';
    mem(c).dealt0 = c.e.stats.damageDealtThisCombat || 0;
    mem(c).guard = 0;
    mem(c).drew = 0;
    announceMirror(c);
  },

  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); },

  /** §15's three categories, measured from the streams that carry them. */
  onBoardEvent(c, ev) {
    if (!ev || ev.type !== 'block') return;
    if (!ev.actor || ev.actor.side !== 'player') return;
    mem(c).guard = (mem(c).guard || 0) + (ev.amount || 0);
  },

  onPlayerTurnEnd(c) {
    const dealt = (c.e.stats.damageDealtThisCombat || 0) - (mem(c).dealt0 || 0);
    const guard = mem(c).guard || 0;
    const drew = mem(c).drew || 0;
    /**
     * §15: "chooses the LARGEST PROPORTIONAL category". The three are measured
     * in different units, so proportional means against the scale each one
     * naturally reaches in a turn: about 18 damage, about 14 Guard, about 3
     * extra Tricks. A turn where nothing clearly leads is Still Water, which
     * §15 asks for by name.
     */
    const score = { damage: dealt / 18, guard: guard / 14, draw: drew / 3 };
    const best = Object.keys(score).reduce((a, b) => (score[b] > score[a] ? b : a));
    const second = Object.keys(score).filter(k => k !== best)
      .reduce((a, b) => (score[b] > score[a] ? b : a));
    mem(c).reading = (score[best] < 0.5 || score[best] - score[second] < 0.25) ? 'still' : best;

    /* §15's shatter window: 22 damage in one turn WHILE IT IS RAINING. */
    const w = weather(c);
    if ((w === 'rain' || w === 'downpour') && dealt >= flag(c, 'shatterAt', 22)) {
      c.applyStatus(c.self, 'cracked', 1, { fresh: true });
      c.say('A line runs right through the glass.', 'good');
    }
    announceMirror(c);
  },

  moves: {
    'violent-reflection': {
      id: 'violent-reflection', name: 'Violent Reflection', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => wx(c, 12),
      tell: 'It does to you what you did to it.',
      effect(c) { hitPlayer(c, wx(c, 12)); },
    },
    'defensive-reflection': {
      id: 'defensive-reflection', name: 'Defensive Reflection', intent: Intent.ATTACK_DEFEND,
      damage: 5, hits: 1, block: 16,
      damageFn: (c) => wx(c, 5),
      tell: 'It braces the way you braced.',
      effect(c) { c.block(c.self, 16); hitPlayer(c, wx(c, 5)); },
    },
    'curious-reflection': {
      id: 'curious-reflection', name: 'Curious Reflection', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      damageFn: (c) => wx(c, 7),
      applies: [{ id: 'delivered', stacks: 1, to: 'player' }],
      tell: 'It goes looking through your things.',
      effect(c) {
        hitPlayer(c, wx(c, 7));
        const top = c.cardsIn('draw')[0];
        if (top) { c.moveCardTo(top, 'discard'); c.say(`${top.name} slides into the discard.`, 'warn'); }
        /* §15: "then draw 1 additional Trick next turn." It rearranges; it
           never costs a card. */
        c.applyStatus(c.player, 'delivered', 1, { fresh: true });
      },
    },
    'still-water': {
      id: 'still-water', name: 'Still Water', intent: Intent.ATTACK_DEFEND,
      damage: 7, hits: 1, block: 7,
      damageFn: (c) => wx(c, 7),
      tell: 'It does not know what you are yet.',
      effect(c) { c.block(c.self, 7); hitPlayer(c, wx(c, 7)); },
    },
  },

  nextMove: (c) => RESPONSES[mem(c).next || 'still'] || 'still-water',

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.shatterAt = 28;
      h.notes.push('Haunt 9: it takes 28 damage in the rain to crack it, not 22.');
    }
    return h;
  },
};

function announceMirror(c) {
  const w = weather(c);
  const foggy = w === 'steam';
  const next = mem(c).next || 'still';
  const LABEL = {
    damage: 'VIOLENT — 12 damage', guard: 'DEFENSIVE — 16 Guard and 5 damage',
    draw: 'CURIOUS — 7 damage and it goes through your deck',
    still: 'STILL WATER — 7 Guard and 7 damage',
  };
  c.announceRule({
    id: `mirror:${c.self.id}`,
    name: foggy ? 'THE GLASS IS FOGGED' : `IT SAW: ${LABEL[next].split(' —')[0]}`,
    text: (foggy
      ? 'Steam. You cannot read which response it settled on — only that it is one of the four. '
      : `It copies whatever you did MOST last turn, and this turn that is ${LABEL[next]}. `)
      + 'Damage, Guard, or extra Tricks — whichever led. A turn with no clear lead is Still Water. '
      + `Deal ${flag(c, 'shatterAt', 22)} damage to it while it is RAINING and the glass cracks: 25% more damage until the end of your next turn.`,
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 3 — The Storm Bath (§16)
 * ═══════════════════════════════════════════════════════════════════════════ */
const CYCLE = ['clear', 'rain', 'downpour', 'drain'];

export const stormBath = {
  id: 'storm-bath',
  name: 'The Storm Bath',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [162, 162],
  silhouette: 'storm-bath',
  palette: ['#6f8f9c', '#c2d6dd', '#101a1f'],
  shape: { body: 'sprawling', limbs: 4, eyes: 0 },
  scale: 1.8,
  lore: 'An enormous tiled bathing chamber that has become alive. Fixtures twist into limbs. Rain pours from the ceiling. Drains open like mouths.',

  onSpawn(c) {
    field(c).weather = 'clear';
    mem(c).held = 0;
    mem(c).spent = 0;
    announceStorm(c);
  },

  onPlayerTurnStart(c) {
    openWeather(c);
    mem(c).spent = 0;
    announceStorm(c);
  },

  onAllyDeath(c) { announceWeather(c); },
  onTurnStart(c) { soak(c); },

  /**
   * §16's Redirect the Water, as an offer.
   *
   * "Whenever the player plays exactly their FOURTH Trick during one turn, they
   * may choose: advance Weather one stage, or delay the next transition by one
   * enemy turn. Once per turn." There is no engine surface for an enemy to stop
   * the fight and ask, and the Ballroom settled what to do about that: a card
   * IS an offer with its whole cost printed on it. Two cards, two answers,
   * neither of them free of the other — playing one spends the turn's offer.
   */
  onPlayerCard(c) {
    if (mem(c).spent || played(c).length !== 4) return;
    c.addCard('storm/push-the-water', 'hand');
    c.addCard('storm/hold-the-water', 'hand');
    c.say('Four Tricks and the drains answer you. Push it on, or hold it where it is.', 'info');
  },

  /** The Storm Bath's own bookkeeping for whichever offer was taken. */
  onCardPlayed(c) {
    const id = c.card?.id;
    if (id !== 'storm/push-the-water' && id !== 'storm/hold-the-water') return;
    mem(c).spent = 1;
    if (id === 'storm/push-the-water') advanceStorm(c, 'You send it on a stage early.');
    else { mem(c).held = 1; c.say('You hold it where it is for one more turn.', 'good'); }
    announceStorm(c);
  },

  moves: {
    'turn-the-taps': {
      id: 'turn-the-taps', name: 'Turn the Taps', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'Every tap in the room turns at once.',
      effect(c) {
        c.block(c.self, 8);
        if (mem(c).held) { mem(c).held = 0; c.say('You held it. The taps turn on nothing.', 'good'); }
        else advanceStorm(c);
        announceStorm(c);
      },
    },
    'tile-slam': {
      id: 'tile-slam', name: 'Tile Slam', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => wx(c, 11),
      tell: 'A whole wall of it comes at you flat.',
      effect(c) { hitPlayer(c, wx(c, 11)); },
    },
    'shower-burst': {
      id: 'shower-burst', name: 'Shower Burst', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => wx(c, 4),
      /* §16's fourth hit during Downpour. Weather only ever changes at the
         start of the player's turn, so the count is settled before the intent
         is drawn and cannot move under it. */
      hitsFn: (c) => (weather(c) === 'downpour' ? 4 : 3),
      tell: 'Every shower head in the room finds you.',
      effect(c) { hitPlayer(c, wx(c, 4), weather(c) === 'downpour' ? 4 : 3); },
    },
    'drain-pull': {
      id: 'drain-pull', name: 'Drain Pull', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => wx(c, 8),
      tell: 'The floor opens and pulls.',
      effect(c) { hitPlayer(c, wx(c, 8)); advanceStorm(c); announceStorm(c); },
    },
  },

  /** §16: Drain Pull is "used during Drain"; otherwise the ordinary rotation. */
  nextMove: (c) => {
    if (weather(c) === 'drain') return 'drain-pull';
    return cyc(['turn-the-taps', 'tile-slam', 'shower-burst'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) h.notes.push('Haunt 9: the cycle opens on Rain rather than Clear.');
    return h;
  },
};

function advanceStorm(c, why) {
  const at = CYCLE.indexOf(weather(c));
  const next = CYCLE[(at < 0 ? 0 : at + 1) % CYCLE.length];
  prepareWeather(c, next, why);
}

function announceStorm(c) {
  const at = Math.max(0, CYCLE.indexOf(weather(c)));
  const next = CYCLE[(at + 1) % CYCLE.length];
  c.announceRule({
    id: `storm:${c.self.id}`,
    name: `STORM CYCLE · ${CYCLE[at].toUpperCase()} → ${next.toUpperCase()}`,
    text: 'Clear, Rain, Downpour, Drain, and round again — the whole cycle is on the board. '
      + (mem(c).held ? 'You are HOLDING it: its next Turn the Taps does nothing. '
        : 'Play your fourth Trick in a turn and it offers you the drains: push the cycle on a stage, or hold it where it is. ')
      + 'Rain and Downpour are Guard for you as much as damage for it. Drain takes everyone\'s Guard, including its own.',
  });
}

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const BATH_SCARES = [boilerBellower, floodedReflection, stormBath];
