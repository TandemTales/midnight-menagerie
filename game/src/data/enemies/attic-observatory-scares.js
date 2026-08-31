/**
 * The Moonlit Attic and Observatory — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/08-attic-observatory.md §13–§15.
 *
 *   The Great Orrery   a four-turn celestial cycle, all of it visible, and a
 *                      lever the player pulls by hitting hard enough.
 *   The Rafter Seer    three futures at once; the first Attack, Skill or Power
 *                      you play decides which one comes true.
 *   The Moon Lens      it magnifies whatever it is pointed at, including itself.
 *
 * ── UNCERTAIN IS NOT HIDDEN ─────────────────────────────────────────────────
 *
 * §2's rule governs all three: "the region should never rely on hidden coin
 * flips disguised as prediction." So the Seer's three futures are one move with
 * an `alternatives(c)` that draws all three side by side and collapses to the
 * Favoured one the instant the player commits — the same surface the Night
 * Terror and the Rafter Peeker use — and the Orrery's cycle is a counter with
 * its next three positions printed on a House Rule.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag, played,
  playedOfType, dmgTaken, isAlive, whenHandArrives, runHandOps,
} from './_lib.js';
import { web } from './attic-observatory.js';

const REGION = 'attic-observatory';

/* ══ Big Scare 1 — The Great Orrery (§13) ════════════════════════════════════
 *
 * "The player gets meaningful control over the cycle." (§13.)
 *
 * DEVIATION, and the region's first. §13's Nudge the Heavens is explicitly a
 * CHOICE — "they may choose, after the damage resolves, advance the cycle one
 * position or move it backward" — and there is no engine surface for an enemy
 * to stop the fight and ask. Random would be the one thing §2 forbids.
 *
 * So the Nudge fires on the same trigger (20 damage in one player turn, once
 * per turn) and resolves by a RULE THAT IS PRINTED ON THE HOUSE RULE: it steps
 * BACK if Midnight is next, and FORWARD otherwise. Those are §13's own two
 * named uses — "delay Midnight" and "move toward Eclipse to exploit
 * vulnerability" — so the lever is real, the trigger is the player's, and the
 * outcome is knowable before they swing.
 */
const POSITIONS = ['Dawn', 'Zenith', 'Eclipse', 'Midnight'];
const posOf = (c) => cnt(c, 'sky') % 4;

export const greatOrrery = {
  id: 'great-orrery',
  name: 'The Great Orrery',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [142, 142],
  silhouette: 'orrery',
  palette: ['#c9962f', '#f2dfa8', '#241a08'],
  shape: { body: 'sprawling', limbs: 6, eyes: 0 },
  scale: 1.7,
  lore: 'Brass planets the size of chairs orbit a small cold moon, and the gears run out through the walls of the observatory into rooms you have not found.',

  onSpawn(c) {
    setCnt(c, 'sky', flag(c, 'openSky', 0));
    mem(c).nudged = false;
    announceSky(c);
  },

  /** §13: Eclipse is the vulnerable window. */
  damageTakenMul(c) { return posOf(c) === 2 ? 1.2 : 1; },

  onPlayerTurnStart(c) { mem(c).nudged = false; },

  /**
   * Nudge the Heavens, measured at the end of the player turn from the damage
   * they actually dealt. Resolving here rather than mid-turn means the position
   * is settled before the next intent is drawn, so the move the player then
   * reads is the move the position produces.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (m.nudged) return;
    if ((c.self.damageTakenThisTurn || 0) < 20) return;
    m.nudged = true;
    const next = (posOf(c) + 1) % 4;
    // Printed rule: back away from Midnight, otherwise forward toward Eclipse.
    addCnt(c, 'sky', next === 3 ? 3 : 1, 9999);   // +3 ≡ -1 in mod 4
    c.say('The heavens move.', 'warn');
    announceSky(c);
  },

  /** The cycle turns at the END of its turn, so the intent and the move agree. */
  onTurnEnd(c) { addCnt(c, 'sky', 1, 9999); announceSky(c); },

  moves: {
    'first-light': {
      id: 'first-light', name: 'First Light', intent: Intent.ATTACK_DEFEND, damage: 5, hits: 1, block: 12,
      tell: 'A brass sun clears the rim of the model.',
      effect(c) { c.block(c.self, 12); hitPlayer(c, 5); },
    },
    'solar-flare': {
      id: 'solar-flare', name: 'Solar Flare', intent: Intent.ATTACK_BIG, damage: 13, hits: 1,
      tell: 'Everything brass in the room gets too hot to look at.',
      effect(c) { hitPlayer(c, 13); },
    },
    'shadow-transit': {
      id: 'shadow-transit', name: 'Shadow Transit', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      applies: [{ id: 'smothered', stacks: 1, to: 'player' }],
      tell: 'One planet slides across the moon and the room goes dim.',
      effect(c) { hitPlayer(c, 7); c.applyStatus(c.player, 'smothered', 1); },
    },
    'falling-stars': {
      id: 'falling-stars', name: 'Falling Stars', intent: Intent.ATTACK, damage: 5, hits: 3,
      tell: 'Three of them come loose at once.',
      effect(c) { hitPlayer(c, 5, 3); },
    },
  },

  /** One move per celestial position (§13). Pure: it reads the counter. */
  nextMove: (c) => ['first-light', 'solar-flare', 'shadow-transit', 'falling-stars'][posOf(c)],

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openSky = 1;
      h.notes.push('Haunt 9: it opens at Zenith rather than Dawn.');
    }
    return h;
  },
};

function announceSky(c) {
  const p = posOf(c);
  const TXT = [
    'Dawn: it gains 12 Guard and hits for 5.',
    'Zenith: Solar Flare, 13 damage.',
    'Eclipse: 7 damage, you draw one fewer next turn — and it takes 20% MORE damage.',
    'Midnight: Falling Stars, 5 damage three times. Then Dawn again.',
  ];
  const order = [0, 1, 2, 3].map(i => POSITIONS[(p + i) % 4]);
  c.announceRule({
    id: `sky:${c.self.id}`,
    name: `${order[0]} → ${order[1]} → ${order[2]} → ${order[3]}`,
    text: `${TXT[p]} Deal it 20 damage in one turn and the heavens move: BACK if Midnight is next, FORWARD otherwise.`,
  });
}

/* ══ Big Scare 2 — The Rafter Seer (§14) ═════════════════════════════════════
 *
 * "This is prediction as a small tactical control puzzle." (§14.)
 *
 * The three futures are ONE move with three faces, not three moves, because the
 * player is allowed to keep changing which one is Favoured all the way through
 * their turn. `alternatives(c)` draws whichever remain reachable and the
 * dynamic `intentFn`/`damageFn`/`blockFn` re-render as the Favoured moves — so
 * the icon is live rather than a promise made before the player acted.
 */
const FUTURES = ['claw', 'hide', 'hex'];
const FUTURE_LABEL = { claw: 'Claw', hide: 'Hide', hex: 'Hex' };

/**
 * Which future is Favoured RIGHT NOW. Pure, and derived rather than stored:
 * the base Favoured is set when See Further runs, and the player's first
 * Attack / Skill / Power this turn rotate or lock it. Deriving it means the
 * intent recomputes as the turn is played without anything having to write.
 */
function favoured(c) {
  const m = mem(c);
  let i = FUTURES.indexOf(m.favoured || 'claw');
  if (i < 0) i = 0;
  const list = played(c);
  let locked = false;
  let usedA = false, usedS = false;
  for (const p of list) {
    if (locked) break;
    if (p.type === 'attack' && !usedA) { usedA = true; i = (i + 1) % 3; }
    else if (p.type === 'skill' && !usedS) { usedS = true; i = (i + 2) % 3; }
    else if (p.type === 'power') { locked = true; }
  }
  return FUTURES[i];
}

export const rafterSeer = {
  id: 'rafter-seer',
  name: 'The Rafter Seer',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [128, 128],
  silhouette: 'seer',
  palette: ['#6c6350', '#cdc3a8', '#201c15'],
  shape: { body: 'sprawling', limbs: 6, eyes: 5 },
  scale: 1.45,
  lore: 'A long-limbed thing crossing the ceiling on too many joints. Its face is several closed eyes. It says what is going to happen before it opens them.',

  onSpawn(c) {
    mem(c).favoured = flag(c, 'openClaw', false) ? 'claw' : 'claw';
    announceSeer(c);
  },

  /** Web the hand the player is about to hold (Hex). */
  onPlayerReady(c) { runHandOps(c); },

  /** §14: "At end of player turn the current Favoured outcome becomes the actual intent." */
  onPlayerTurnEnd(c) { mem(c).favoured = favoured(c); announceSeer(c); },

  moves: {
    'three-futures': {
      id: 'three-futures', name: 'Three Futures', intent: Intent.UNKNOWN, damage: 15, hits: 1,
      tell: 'Three futures, one of them already leaning. Your first Attack, Skill or Power decides.',
      alternatives(c) {
        const f = favoured(c);
        const alts = [
          { key: 'claw', label: 'Claw', intent: Intent.ATTACK_BIG, damage: 15, hits: 1,
            note: 'Claw: deals 15 damage.' },
          { key: 'hide', label: 'Hide', intent: Intent.DEFEND, damage: 0, hits: 0, block: 17,
            note: 'Hide: gains 17 Guard.' },
          { key: 'hex', label: 'Hex', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
            note: 'Hex: deals 7 and puts silk on a Trick in your hand.' },
        ];
        // Once the player has spent all three levers the future is settled;
        // until then every branch stays on screen, which is §2's whole rule.
        const spent = playedOfType(c, 'power') > 0
          || (playedOfType(c, 'attack') > 0 && playedOfType(c, 'skill') > 0);
        return spent ? alts.filter(a => a.key === f) : alts;
      },
      intentFn: (c) => ({ claw: Intent.ATTACK_BIG, hide: Intent.DEFEND, hex: Intent.ATTACK_DEBUFF }[favoured(c)]),
      damageFn: (c) => ({ claw: 15, hide: 0, hex: 7 }[favoured(c)]),
      hitsFn: (c) => (favoured(c) === 'hide' ? 0 : 1),
      blockFn: (c) => (favoured(c) === 'hide' ? 17 : 0),
      appliesFn: (c) => (favoured(c) === 'hex' ? [{ id: 'webbed', stacks: 1, to: 'player' }] : []),
      effect(c) {
        const f = mem(c).favoured || favoured(c);
        if (f === 'hide') { c.block(c.self, 17); return; }
        if (f === 'claw') { hitPlayer(c, 15); return; }
        hitPlayer(c, 7);
        whenHandArrives(c, (k) => {
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) return;
          const pick = hand[k.rng.int(hand.length)];
          if (!web(k, k.player, [pick.uid], 3, true).length) return;
          k.announceRule({
            id: `hex:${k.self.id}`, name: `Hexed: ${pick.name}`,
            text: 'It costs 1 additional Nerve this turn.',
          });
        });
      },
    },
    'see-further': {
      id: 'see-further', name: 'See Further', intent: Intent.DEFEND, block: 5,
      tell: 'More of the eyes open.',
      effect(c) { c.block(c.self, 5); announceSeer(c); },
    },
    'many-eyes': {
      id: 'many-eyes', name: 'Many Eyes', intent: Intent.ATTACK, damage: 4, hits: 2,
      tell: 'All of them at once, twice.',
      effect(c) { hitPlayer(c, 4, 2); mem(c).favoured = 'hide'; announceSeer(c); },
    },
    'false-prophecy': {
      id: 'false-prophecy', name: 'False Prophecy', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It says something that is not true yet.',
      effect(c) {
        hitPlayer(c, 8);
        mem(c).favoured = FUTURES[c.rng.int(3)];
        announceSeer(c);
      },
    },
  },

  /* §14: See Further, resolve, Many Eyes, See Further, resolve, False Prophecy. */
  nextMove: (c) => cyc(
    ['see-further', 'three-futures', 'many-eyes', 'see-further', 'three-futures', 'false-prophecy'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openClaw = true;
      h.notes.push('Haunt 9: its first Three Futures opens with Claw Favoured.');
    }
    return h;
  },
};

function announceSeer(c) {
  const f = mem(c).favoured || 'claw';
  c.announceRule({
    id: `seer:${c.self.id}`,
    name: `Favoured: ${FUTURE_LABEL[f]}`,
    text: 'Your first ATTACK moves the omen one way, your first SKILL the other, and your first POWER locks it where it stands. '
      + 'Claw is 15 damage, Hide is 17 Guard, Hex is 7 and silk on a Trick.',
  });
}

/* ══ Big Scare 3 — The Moon Lens (§15) ═══════════════════════════════════════
 *
 * "Do you keep the focus on a harmlessly defended Lens? Allow the Echo to
 * become threatening while racing the main enemy?" (§15.)
 *
 * The Focus is announced ONE TURN AHEAD and the player can swap it by playing
 * exactly their third Trick — so both the threat and the lever are visible
 * before either matters.
 */
export const moonEcho = {
  id: 'moon-echo',
  name: 'Moon Echo',
  region: REGION,
  tier: 'normal',
  role: 'echo',
  summonOnly: true,
  hp: [28, 28],
  silhouette: 'echo',
  palette: ['#e8eef8', '#aab6cc', '#39415a'],
  shape: { body: 'floating', limbs: 0, eyes: 1 },
  scale: 0.8,
  lore: 'A patch of moonlight with an outline, standing where nothing is standing.',

  moves: {
    'echoed-light': {
      id: 'echoed-light', name: 'Echoed Light', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 * (focusedOnEcho(c) ? 2 : 1),
      tell: 'The light where it is standing gets brighter.',
      effect(c) { hitPlayer(c, 7 * (focusedOnEcho(c) ? 2 : 1)); },
    },
  },
  nextMove: () => 'echoed-light',
  hauntScaling(level) { return hauntBase(level, 'normal'); },
};

/**
 * Is the Lens currently magnifying the Echo?
 *
 * Read from the LENS, not stored on the Echo, so killing and re-creating an
 * Echo cannot lose the state and two Echoes cannot disagree. Pure — it is
 * called from `damageFn`.
 */
function focusedOnEcho(c) {
  const lens = (typeof c.enemies === 'function' ? c.enemies() : [])
    .find(a => a && a.defId === 'moon-lens' && isAlive(a));
  return !!(lens && lens.mem && lens.mem.focus === 'echo');
}

export const moonLens = {
  id: 'moon-lens',
  name: 'The Moon Lens',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [136, 136],
  silhouette: 'lens',
  palette: ['#cfd8e6', '#7d8798', '#1b1f27'],
  shape: { body: 'floating', limbs: 0, eyes: 1 },
  scale: 1.6,
  lore: 'A telescope lens the width of a door, hanging in the middle of the room. Whatever the moonlight touches through it comes out larger than it went in.',

  onSpawn(c) {
    mem(c).focus = 'self';
    mem(c).next = 'self';
    mem(c).swapped = false;
    if (flag(c, 'openEcho', false)) c.summon('moon-echo');
    announceLens(c);
  },

  /**
   * §15: "The Lens ANNOUNCES where it will Focus one turn ahead." So Adjust the
   * Lens announces, and the Focus actually turns here — before intents are
   * drawn. Turning it inside the move meant the Echo's intent said 7 and its
   * effect dealt 14 whenever the Lens acted first in slot order; the audit
   * caught that twelve times.
   */
  onPlayerTurnStart(c) {
    const m = mem(c);
    m.swapped = false;
    if (m.pendingFocus) { m.focus = m.pendingFocus; m.pendingFocus = null; announceLens(c); }
  },

  /**
   * §15: "Whenever the player plays exactly their third Trick of the turn,
   * swap the intended Focus target. Once per turn."
   *
   * `onCardPlayed` fires per Trick, so "exactly the third" is a count check
   * rather than a threshold — a fourth Trick does not swap it back.
   */
  onCardPlayed(c) {
    const m = mem(c);
    if (m.swapped) return;
    if ((c.cardsPlayedThisTurn || []).length !== 3) return;
    m.swapped = true;
    m.next = m.next === 'echo' ? 'self' : 'echo';
    announceLens(c);
  },

  /** §15: focusing on itself is 10 Guard at the start of its turn. */
  onTurnStart(c) { if (mem(c).focus === 'self') c.block(c.self, 10); },

  moves: {
    'adjust-the-lens': {
      id: 'adjust-the-lens', name: 'Adjust the Lens', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'It turns, slowly, toward what it means to make bigger.',
      effect(c) {
        c.block(c.self, 8);
        // Announced now, turned at the start of the player's turn — see above.
        mem(c).pendingFocus = mem(c).next;
        announceLens(c);
      },
    },
    moonbeam: {
      id: 'moonbeam', name: 'Moonbeam', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + (mem(c).focus === 'self' ? 5 : 0),
      tell: 'A column of cold light, aimed.',
      effect(c) { hitPlayer(c, 11 + (mem(c).focus === 'self' ? 5 : 0)); },
    },
    refraction: {
      id: 'refraction', name: 'Refraction', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + (mem(c).focus === 'self' ? 5 : 0),
      hitsFn: (c) => (mem(c).focus === 'self' ? 3 : 2),
      tell: 'The beam splits on the way out.',
      effect(c) {
        const self = mem(c).focus === 'self';
        hitPlayer(c, 5 + (self ? 5 : 0), self ? 3 : 2);
      },
    },
    'create-reflection': {
      id: 'create-reflection', name: 'Create Reflection', intent: Intent.SUMMON,
      tell: 'It gathers a second helping of moonlight into the shape of something.',
      effect(c) {
        const has = allies(c).some(a => a.defId === 'moon-echo' && isAlive(a));
        if (has) { c.block(c.self, 12); return; }
        c.summon('moon-echo');
        announceLens(c);
      },
    },
  },

  nextMove: (c) => cyc(
    ['create-reflection', 'adjust-the-lens', 'moonbeam', 'refraction', 'adjust-the-lens'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openEcho = true;
      h.notes.push('Haunt 9: the Moon Echo is already standing when the fight opens.');
    }
    return h;
  },
};

function announceLens(c) {
  const m = mem(c);
  const WORD = { self: 'ITSELF', echo: 'the Moon Echo' };
  c.announceRule({
    id: `lens:${c.self.id}`,
    name: `Focused on ${WORD[m.focus]} — next: ${WORD[m.next]}`,
    text: 'Focused on itself it gains 10 Guard a turn and hits for 5 more. Focused on the Echo, the Echo hits twice as hard. '
      + 'Play exactly your THIRD Trick in a turn to swap what it turns to next.',
  });
}

export const ATTIC_SCARES = [greatOrrery, rafterSeer, moonLens, moonEcho];
