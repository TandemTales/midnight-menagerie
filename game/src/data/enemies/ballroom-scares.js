/**
 * The Ballroom and Velvet Suites — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/10-ballroom.md §13–§15.
 *
 *   The Grand Masque  four faces, four different ways to be dangerous, and one
 *                     of them is deliberately the most tempting.
 *   The Eternal Dance two dancers on one three-beat clock. Break the rhythm or
 *                     break a dancer.
 *   The Velvet Host   five offers, each better than the last, each costing more.
 *
 * ── THE OFFERS ARE TRICKS ───────────────────────────────────────────────────
 *
 * Same machinery as the ordinary roster: an Invitation is a 0-cost `ethereal`
 * card in the player's hand, playing it is Accept, letting it expire is
 * Decline, and the terms are printed on it. See `ballroom.js` for why.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag, field,
  played, playedOfType, isAlive, dmgTaken,
} from './_lib.js';
import { offer, accepted, takeBack } from './ballroom.js';

const REGION = 'ballroom';

/* ══ Big Scare 1 — The Grand Masque (§13) ════════════════════════════════════
 *
 * "The player must continually reassess whether the current bargain is worth
 * strengthening a future Persona." (§13.)
 *
 * Favor persists across Personas, which is what ties the four faces into one
 * fight rather than four small ones.
 */
const PERSONAS = ['Host', 'Dancer', 'Critic', 'Guest'];
const persona = (c) => PERSONAS[cnt(c, 'persona') % 4];
const favor = (c) => cnt(c, 'favor');

export const grandMasque = {
  id: 'grand-masque',
  name: 'The Grand Masque',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [143, 143],
  silhouette: 'grand-mask',
  palette: ['#f4ebee', '#a8697f', '#2b1a21'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 1.5,
  lore: 'A mask the size of a doorway, turning slowly through a great many elaborate faces, none of them for long.',

  onSpawn(c) {
    setCnt(c, 'persona', 0);
    setCnt(c, 'favor', flag(c, 'openFavor', 0));
    setCnt(c, 'tempo', 0);
    mem(c).acts = 0;
    mem(c).reacted = false;
    announceMasque(c);
  },

  onPlayerTurnStart(c) { mem(c).critiqued = false; },

  /**
   * Host and Dancer and Critic each watch the player turn in a different way.
   * All three bank into state that the NEXT intent is drawn from, never into
   * the number an already-committed intent promised.
   */
  onCardPlayed(c) {
    const m = mem(c);
    if (accepted(c)) {
      takeBack(c);
      m.tookIt = true;
      addCnt(c, 'favor', persona(c) === 'Guest' ? 2 : 1, 6);
      if (persona(c) === 'Host') c.block(c.self, 5);
      announceMasque(c);
      return;
    }
    const list = played(c);
    if (persona(c) === 'Dancer' && list.length === 4) {
      addCnt(c, 'tempo', 1, 3);
      announceMasque(c);
    }
    if (persona(c) === 'Critic' && !m.critiqued && list.length >= 2) {
      const a = list[list.length - 1], b = list[list.length - 2];
      if (a && b && a.type === b.type) {
        m.critiqued = true;
        m.reacted = true;
        c.block(c.self, 6);
      }
    }
  },

  /** §13's Guest: "Decline: Grand Masque loses 5 Courage." */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (takeBack(c) && persona(c) === 'Guest') c.loseHp(c.self, 5);
    m.tookIt = false;
  },

  /** §13: Guest "takes 20 percent additional damage". */
  damageTakenMul(c) { return persona(c) === 'Guest' ? 1.2 : 1; },

  moves: {
    'welcome-in': {
      id: 'welcome-in', name: 'Welcome In', intent: Intent.BUFF,
      tell: 'It holds the room open for you.',
      effect(c) {
        offer(c, 'welcome-in');
        announceMasque(c);
      },
    },
    'perfect-step': {
      id: 'perfect-step', name: 'Perfect Step', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + 2 * cnt(c, 'tempo') + favor(c),
      tell: 'It moves exactly on the beat.',
      effect(c) { hitPlayer(c, 8 + 2 * cnt(c, 'tempo') + favor(c)); },
    },
    'harsh-review': {
      id: 'harsh-review', name: 'Harsh Review', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + (mem(c).reacted ? 4 : 0) + favor(c),
      tell: 'It has an opinion about how you are playing.',
      effect(c) {
        const d = 11 + (mem(c).reacted ? 4 : 0) + favor(c);
        mem(c).reacted = false;
        hitPlayer(c, d);
      },
    },
    'your-turn': {
      id: 'your-turn', name: 'Your Turn', intent: Intent.BUFF,
      tell: 'It steps out of the middle of the floor and gestures you into it.',
      effect(c) {
        offer(c, 'your-turn');
        announceMasque(c);
      },
    },
    'change-mask': {
      id: 'change-mask', name: 'Change Mask', intent: Intent.DEFEND, block: 6,
      tell: 'It turns over. There is another one under it.',
      effect(c) {
        c.block(c.self, 6);
        addCnt(c, 'persona', 1, 9999);
        mem(c).acts = 0;
        setCnt(c, 'tempo', 0);
        announceMasque(c);
      },
    },
  },

  /**
   * §13: "After two actions in one Persona, use Change Mask." Derived from
   * history rather than a counter so `nextMove` stays pure — every third beat
   * is the mask turning.
   */
  nextMove: (c) => {
    const h = c.history || [];
    const sinceMask = h.length - 1 - h.lastIndexOf('change-mask');
    if (sinceMask >= 2) return 'change-mask';
    const p = persona(c);
    if (p === 'Host') return 'welcome-in';
    if (p === 'Dancer') return 'perfect-step';
    if (p === 'Critic') return 'harsh-review';
    return 'your-turn';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openFavor = 1;
      h.counters.favor = 1;
      h.notes.push('Haunt 9: it opens with 1 Favor.');
    }
    return h;
  },
};

function announceMasque(c) {
  const p = persona(c);
  const TXT = {
    Host: 'HOST: it gains 5 Guard whenever you accept an offer — and it is offering.',
    Dancer: `DANCER: your FOURTH Trick each turn gives it 1 Tempo, and every Tempo is 2 more damage (${cnt(c, 'tempo')}/3).`,
    Critic: 'CRITIC: the first time you repeat a Trick type back-to-back each turn, it gains 6 Guard — and its next Review hits harder.',
    Guest: 'GUEST: it takes 20% MORE damage and makes its best offer. Refuse and it loses 5 Courage.',
  };
  c.announceRule({
    id: `masque:${c.self.id}`,
    name: `${p} — Favor ${favor(c)} / 6`,
    text: `${TXT[p]} Favor is 1 attack damage apiece and it survives the change of face.`,
  });
}

/* ══ Big Scare 2 — The Eternal Dance (§14) ═══════════════════════════════════
 *
 * "Focus one dancer? Alternate burst damage to keep Rhythm Broken? Spread damage
 * and finish both near the same time?" (§14.)
 *
 * The Rhythm is a SHARED three-beat clock, so it lives in `field` — the
 * per-combat scratch both dancers can see — rather than on either of them,
 * where killing that one would take the beat with it.
 */
function beat(c) { return ((field(c).danceBeat || 0) % 3) + 1; }

function partner(c, defId) {
  return allies(c).find(a => a.defId === defId && isAlive(a)) || null;
}

/** §14: "if EITHER dancer loses at least 18 Courage during one player turn, the
    Rhythm becomes Broken for one enemy turn." */
function breakRhythm(c) {
  if (field(c).danceBroken) return;
  field(c).danceBroken = true;
  c.announceRule({
    id: 'dance:rhythm',
    name: 'Rhythm BROKEN',
    text: 'For one enemy turn the support half does not work: no Mirror, no Catch, no Guard.',
  });
}

function danceBeatOn(c) {
  /* One dancer advances the shared beat, and it must be exactly one. The Lead
     owns the clock while it lives; if it is gone the Follow keeps time alone. */
  const lead = partner(c, 'the-lead');
  if (c.self.defId === 'the-lead' || !lead) {
    field(c).danceBeat = (field(c).danceBeat || 0) + 1;
    field(c).danceBroken = false;
    c.clearRules('dance:rhythm');
  }
  announceDance(c);
}

const solo = (c) => (partner(c, c.self.defId === 'the-lead' ? 'the-follow' : 'the-lead') ? 0 : 3);

export const theLead = {
  id: 'the-lead',
  name: 'The Lead',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [74, 74],
  silhouette: 'dancer-lead',
  palette: ['#241a2c', '#c7b3d8', '#0f0a14'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.1,
  lore: 'Formal, upright, and absolutely certain where the next step goes.',

  onSpawn(c) { field(c).danceBeat = flag(c, 'openBeat', 0); announceDance(c); },
  onPlayerTurnStart(c) { mem(c).broke = false; },
  onDamaged(c) {
    if (mem(c).broke || dmgTaken(c) < 18) return;
    mem(c).broke = true;
    breakRhythm(c);
  },
  onTurnEnd(c) { danceBeatOn(c); },

  moves: {
    'opening-step': {
      id: 'opening-step', name: 'Opening Step', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + solo(c),
      tell: 'It offers a hand to the room and begins.',
      effect(c) { hitPlayer(c, 8 + solo(c)); },
    },
    turn: {
      id: 'turn', name: 'Turn', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + solo(c),
      tell: 'Two turns under the same arm.',
      effect(c) { hitPlayer(c, 5 + solo(c), 2); },
    },
    finale: {
      id: 'finale', name: 'Finale', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      damageFn: (c) => 14 + solo(c),
      tell: 'The music gathers itself up.',
      effect(c) { hitPlayer(c, 14 + solo(c)); },
    },
  },
  nextMove: (c) => ['opening-step', 'turn', 'finale'][beat(c) - 1],

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) { h.flags.openBeat = 1; h.notes.push('Haunt 9: the dance opens on Beat 2.'); }
    return h;
  },
};

export const theFollow = {
  id: 'the-follow',
  name: 'The Follow',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [74, 74],
  silhouette: 'dancer-follow',
  palette: ['#2c1a24', '#d8b3c2', '#140a0f'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.1,
  lore: 'Lighter, and always exactly where the Lead is about to need it to be.',

  onPlayerTurnStart(c) { mem(c).broke = false; },
  onDamaged(c) {
    if (mem(c).broke || dmgTaken(c) < 18) return;
    mem(c).broke = true;
    breakRhythm(c);
  },
  onTurnEnd(c) { danceBeatOn(c); },

  moves: {
    support: {
      id: 'support', name: 'Support', intent: Intent.DEFEND,
      blockFn: (c) => (partner(c, 'the-lead') && !field(c).danceBroken ? 0 : 7),
      tell: 'It steadies the other one.',
      effect(c) {
        const lead = partner(c, 'the-lead');
        if (lead && !field(c).danceBroken) { c.block(lead, 7); return; }
        c.block(c.self, 7);
      },
    },
    mirror: {
      id: 'mirror', name: 'Mirror', intent: Intent.ATTACK, damage: 5, hits: 1,
      /* §14: "repeat HALF the damage of Lead's current action, rounded down."
         The Lead is on Beat 2 (Turn, 5x2 = 10) whenever the Follow is, so the
         number is knowable — and it is 0 while the Rhythm is Broken, which the
         intent shows rather than discovering at resolve time. */
      damageFn: (c) => {
        if (field(c).danceBroken) return 0;
        const lead = partner(c, 'the-lead');
        if (!lead) return 5 + solo(c);
        return Math.floor((5 + solo(c)) * 2 / 2);
      },
      hitsFn: (c) => (field(c).danceBroken ? 0 : 1),
      tell: 'It does what the other one is doing, a half-beat behind.',
      effect(c) {
        if (field(c).danceBroken) return;
        const lead = partner(c, 'the-lead');
        hitPlayer(c, lead ? Math.floor((5 + solo(c)) * 2 / 2) : 5 + solo(c));
      },
    },
    catch: {
      id: 'catch', name: 'Catch', intent: Intent.DEFEND,
      intentFn: (c) => (partner(c, 'the-lead') ? Intent.DEFEND : Intent.ATTACK),
      blockFn: (c) => (partner(c, 'the-lead') && !field(c).danceBroken ? 10 : 0),
      damageFn: (c) => (partner(c, 'the-lead') ? 0 : 10 + solo(c)),
      hitsFn: (c) => (partner(c, 'the-lead') ? 0 : 1),
      tell: 'It puts an arm out for a fall that has not happened yet.',
      effect(c) {
        const lead = partner(c, 'the-lead');
        if (!lead) { hitPlayer(c, 10 + solo(c)); return; }
        if (field(c).danceBroken) return;
        c.block(lead, 10);
      },
    },
  },
  nextMove: (c) => ['support', 'mirror', 'catch'][beat(c) - 1],

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    return h;
  },
};

function announceDance(c) {
  c.announceRule({
    id: 'dance:beat',
    name: `Beat ${beat(c)} of 3`,
    text: 'Beat 1 opens and supports. Beat 2 turns and mirrors. Beat 3 finishes and catches. '
      + 'Deal EITHER dancer 18 in one turn and the Rhythm breaks for a turn — no Mirror, no Catch, no Guard. '
      + 'Kill one and the survivor goes Solo: 3 more damage, and nothing to lean on.',
  });
}

/* ══ Big Scare 3 — The Velvet Host (§15) ═════════════════════════════════════
 *
 * "The player can simply refuse every offer. But doing so means giving up
 * substantial value. A skilled player may accept exactly two or three bargains
 * and STOP BEFORE the Host reaches its most dangerous state." (§15.)
 *
 * The whole enemy is one dial the player turns themselves.
 */
const HOSPITALITY = [
  ['appetizer', 'Appetizer', 'recover 5 Courage'],
  ['appetizer', 'Appetizer', 'recover 5 Courage'],
  ['fine-drink', 'A Fine Drink', 'gain 2 Nerve this turn, and lose 4 Courage'],
  ['private-performance', 'A Private Performance', 'draw 3 Tricks, each costing 1 more this turn'],
  ['anything-you-want', 'Anything You Want', 'gain 12 Guard, and lose 7 Courage'],
];

export const velvetHost = {
  id: 'velvet-host',
  name: 'The Velvet Host',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [134, 134],
  silhouette: 'host',
  palette: ['#3b1220', '#8d4a5e', '#170609'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.45,
  lore: 'A tall figure in a deep velvet coat with nothing at all where its face should be, presiding over a private suite it very much wants you to enjoy.',

  onSpawn(c) { setCnt(c, 'hospitality', flag(c, 'openHosp', 0)); announceHost(c); },

  onCardPlayed(c) {
    if (!accepted(c)) return;
    takeBack(c);
    addCnt(c, 'hospitality', 1, 5);
    announceHost(c);
  },

  onPlayerTurnEnd(c) { takeBack(c); },

  /** §15's Hospitality 5: Overindulged. */
  onTurnStart(c) { if (cnt(c, 'hospitality') >= 5) c.block(c.self, 8); },

  moves: {
    'another-round': {
      id: 'another-round', name: 'Another Round', intent: Intent.BUFF,
      blockFn: (c) => (cnt(c, 'hospitality') >= 5 ? 8 : 0),
      tell: 'It has thought of something else you might like.',
      effect(c) {
        const h = cnt(c, 'hospitality');
        if (h >= 5) { c.block(c.self, 8); return; }
        const [id, name, what] = HOSPITALITY[h];
        offer(c, id);
        c.announceRule({
          id: `offer:${c.self.id}`,
          name: `Offer ${h + 1}: ${name}`,
          text: `It is in your hand. Play it to ACCEPT — ${what} — and the Host gains 1 Hospitality. `
            + 'Leave it and it expires, free. At Hospitality 5 it stops offering and simply gets stronger.',
        });
      },
    },
    'velvet-cane': {
      id: 'velvet-cane', name: 'Velvet Cane', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + (cnt(c, 'hospitality') >= 5 ? 5 : 0),
      tell: 'It taps the cane once on the floor.',
      effect(c) { hitPlayer(c, 10 + (cnt(c, 'hospitality') >= 5 ? 5 : 0)); },
    },
    'toast-the-guest': {
      id: 'toast-the-guest', name: 'Toast the Guest', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + (cnt(c, 'hospitality') >= 3 ? 5 : 0) + (cnt(c, 'hospitality') >= 5 ? 5 : 0),
      tell: 'It raises a glass to you and everyone turns.',
      effect(c) {
        hitPlayer(c, 6 + (cnt(c, 'hospitality') >= 3 ? 5 : 0) + (cnt(c, 'hospitality') >= 5 ? 5 : 0));
      },
    },
  },

  nextMove: (c) => cyc(['another-round', 'velvet-cane', 'toast-the-guest'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openHosp = 1;
      h.counters.hospitality = 1;
      h.notes.push('Haunt 9: it opens at 1 Hospitality — one offer further along.');
    }
    return h;
  },
};

function announceHost(c) {
  const h = cnt(c, 'hospitality');
  c.announceRule({
    id: `host:${c.self.id}`,
    name: `Hospitality ${h} / 5`,
    text: h >= 5
      ? 'OVERINDULGED: it has stopped offering. +5 attack damage and 8 Guard at the start of every turn.'
      : 'Each offer you take is better than the last, and so is what it costs. At 5 it stops offering and simply gets stronger. '
        + 'Taking two or three and stopping is a real plan.',
  });
}

export const BALLROOM_SCARES = [grandMasque, theLead, theFollow, velvetHost];
