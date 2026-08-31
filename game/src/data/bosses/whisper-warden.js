/**
 * The Whisper Warden — Secret Passages boss. OWNER: enemies.
 * Source of truth: docs/design/regions/13-secret-passages.md §17–§35, §48–§50.
 *
 * "Its philosophy is: nothing hidden can be taken away. That makes it a
 * distorted mirror of Hush. Hush disappears in order to CHOOSE when to be seen.
 * The Warden hides things so nobody else can choose anything about them."
 *
 * ── THE FIGHT IS A NETWORK, AND THE PLAYER LEARNS IT ────────────────────────
 *
 * Everything here hangs off §18's one idea. The Warden periodically leaves the
 * battlefield through one of three (later five) Hidden Routes; while it is gone
 * nothing reaches it, so the player attacks the LATCH on the route it chose. A
 * broken Latch does not stop the Ambush — it MOVES it, clockwise, to the next
 * route, and each route's Ambush is a different shape of threat:
 *
 *   WALL PASSAGE        18 in one hit, and it comes back Guarded
 *   FLOOR HATCH         6 three times
 *   CEILING SHAFT       11, and a Nerve off your next turn
 *   MIRROR PASSAGE      9, and an Echo of your own last Trick in your discard
 *   DUMBWAITER SHAFT    7, and your deck order comes apart
 *
 * §23: "A Companion strong against one large hit may prefer Wall Passage. A
 * deck vulnerable to repeated hits may avoid Floor Hatch." The player is not
 * being asked to prevent the Ambush. They are being asked which one they want.
 *
 * ── WHY THE AMBUSH NUMBER IS A `damageFn` AND NOT A COMMITTED CONSTANT ──────
 *
 * This file breaks the usual rule on purpose and §19 is the reason: "The new
 * Ambush intent UPDATES IMMEDIATELY." The player breaks a Latch during their
 * own turn and the promise on screen is supposed to change in front of them,
 * because they are the one changing it.
 *
 * That is not the lie the audit hunts. A lie is an enemy quietly raising a
 * number after the player has committed to a plan; this is the player moving
 * the number themselves, with both values printed the whole time. It is the
 * Groundskeeper's `punch()` in a different coat, and it is why every Ambush
 * below computes from `routeNow(c)` rather than from anything cached.
 *
 * ── LATCHES ARE ACTORS, AND ONLY WHILE THERE IS AN AMBUSH ───────────────────
 *
 * §19's last clause — "all Latches repair after the Ambush cycle" — is the
 * permission to summon them on Vanish and take them away on the return. It
 * keeps the board at one body for most of the fight and at four (phase one) or
 * six (phase two) exactly when the player has something to do with them, and it
 * means the Warden's untargetable turn is never a turn with nothing to hit.
 */

import { Intent } from '../schema.js';
import {
  mem, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, field, lastMove,
} from '../enemies/_lib.js';

const REGION = 'secret-passages';

/* ══ the five routes ═════════════════════════════════════════════════════════ */
const ROUTES = {
  'wall-passage': {
    id: 'wall-passage', name: 'Wall Passage', latch: 'latch-wall', phase: 1,
    move: 'through-the-wallpaper',
  },
  'floor-hatch': {
    id: 'floor-hatch', name: 'Floor Hatch', latch: 'latch-floor', phase: 1,
    move: 'under-your-feet',
  },
  'ceiling-shaft': {
    id: 'ceiling-shaft', name: 'Ceiling Shaft', latch: 'latch-ceiling', phase: 1,
    move: 'from-above',
  },
  'mirror-passage': {
    id: 'mirror-passage', name: 'Mirror Passage', latch: 'latch-mirror', phase: 2,
    move: 'wrong-reflection',
  },
  'dumbwaiter-shaft': {
    id: 'dumbwaiter-shaft', name: 'Dumbwaiter Shaft', latch: 'latch-dumbwaiter', phase: 2,
    move: 'delivery',
  },
};

/** §19 and §31. Two explicit orders, because phase two is not phase one plus two. */
const CLOCKWISE_1 = ['wall-passage', 'floor-hatch', 'ceiling-shaft'];
const CLOCKWISE_2 = ['wall-passage', 'mirror-passage', 'ceiling-shaft', 'dumbwaiter-shaft', 'floor-hatch'];

const ringOf = (c) => (phaseOf(c) >= 2 ? CLOCKWISE_2 : CLOCKWISE_1);
const phaseOf = (c) => (mem(c).phase || 1);

/* ══ Latches ═════════════════════════════════════════════════════════════════ */

/**
 * One Latch. §28 lowers phase two's Integrity from 14 to 12 while ADDING two
 * more routes, and §28 says why in as many words: "The phase becomes more
 * complex without simply requiring more raw damage."
 *
 * A Latch's whole job when it breaks is to tell the Warden, which it does by
 * writing to the Warden's mem — plain data, because `mem` is JSON round-tripped
 * and a function stored there comes back as null.
 */
function latch(id, routeId, lore) {
  return {
    id,
    name: `${ROUTES[routeId].name} Latch`,
    region: REGION,
    tier: 'boss',
    role: 'bossPart',
    summonOnly: true,
    hp: [14, 14],
    silhouette: id,
    palette: ['#3d3a44', '#8b8496', '#0d0c11'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.42,
    lore,

    onDeath(c) {
      const warden = allies(c).find(a => a.defId === 'whisper-warden' && isAlive(a));
      if (!warden) return;
      const m = (warden.mem ||= {});
      m.sealed = [...new Set([...(m.sealed || []), routeId])];
      m.rerouteFrom = routeId;
      /* §35: "Whenever the player destroys a Latch, the Warden loses 4 Courage."
         Only in the final phase, and it is what turns the stealth puzzle into a
         way of finishing the fight. `loseHp`, not damage: it is the Warden
         paying for the network, not the player landing a hit. */
      if ((m.phase || 1) >= 3) {
        c.loseHp(warden, 4);
        c.say('Another route gone. It costs the Warden to lose one now.', 'good');
      }
    },

    moves: {
      hold: {
        id: 'hold', name: 'Latched', intent: Intent.SLEEP,
        tell: 'Break it and the Warden has to use the next route round.',
        effect() {},
      },
    },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'boss'); },
  };
}

export const latchWall = latch('latch-wall', 'wall-passage',
  'A strip of wallpaper over a seam, held down by one small brass catch.');
export const latchFloor = latch('latch-floor', 'floor-hatch',
  'A hatch in the boards with a ring pull worn smooth.');
export const latchCeiling = latch('latch-ceiling', 'ceiling-shaft',
  'A hooked bar across a shaft nobody has looked up in a long time.');
export const latchMirror = latch('latch-mirror', 'mirror-passage',
  'A mirror hung on hinges. Something on the other side is holding it shut.');
export const latchDumbwaiter = latch('latch-dumbwaiter', 'dumbwaiter-shaft',
  'The service door of a dumbwaiter, and the rope is still moving.');

/* ══ the Warden ══════════════════════════════════════════════════════════════ */
export const whisperWarden = {
  id: 'whisper-warden',
  name: 'The Whisper Warden',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [415, 415],
  silhouette: 'whisper-warden',
  palette: ['#20202a', '#6f6a80', '#08080c'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.65,
  lore: 'A tall, narrow figure wrapped in an old servant\'s coat made from strips of wallpaper. Its face is a smooth black mask with a tiny keyhole where the mouth should be. Dozens of keys hang silently inside the coat.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.route = null;
    m.sealed = [];
    m.marked = [];
    m.stashed = [];
    m.rerouteFrom = null;
    m.inPassage = 0;
    m.phaseStart = 0;
    m.lockedLatches = 0;
    /* §52 Haunt 10: "begins combat with one Passage already Marked BY THE HOUSE
       rather than the kids", and that Passage's Ambush deals 4 more until the
       player reroutes through it once. A head start that is also a target. */
    if (flag(c, 'houseMark', 0)) {
      m.marked = ['wall-passage'];
      m.houseMark = 'wall-passage';
    }
    announceWarden(c);
  },

  onPlayerTurnEnd(c) {
    field(c).seenLast = c.has('seen', c.player) ? 1 : 0;
    field(c).warden = {
      tricks: played(c).length,
      guard: field(c).guardThisTurn || 0,
      lastType: played(c).length ? played(c)[played(c).length - 1].type : null,
    };
  },

  onBoardEvent(c, ev) {
    if (!ev || ev.type !== 'block') return;
    if (!ev.actor || ev.actor.side !== 'player') return;
    field(c).guardThisTurn = (field(c).guardThisTurn || 0) + (ev.amount || 0);
  },

  /**
   * §24: "Choose one Trick FROM THE PLAYER'S HAND."
   *
   * `onPlayerReady` is the only moment an enemy can read the hand — at
   * `onPlayerTurnStart` it has not been dealt and during the enemy phase it has
   * already been discarded, which is where this was and why it took nothing,
   * ever. Taking here also means the Trick is gone from the hand the player is
   * about to spend, which is what §26's question ("what can I afford not to
   * have next turn?") is actually about.
   */
  onPlayerReady(c) {
    returnStash(c);
    if (!mem(c).pocketing) return;
    mem(c).pocketing = 0;
    pocket(c);
    announceWarden(c);
  },

  onPlayerTurnStart(c) {
    field(c).sawSeen = field(c).seenLast || 0;
    field(c).guardThisTurn = 0;
    /* §27 / §35: both escalations are Courage thresholds and both are settled
       here, before intents, so the turn the player crosses one they read the
       new fight rather than being told about it afterwards. */
    checkPhase(c);
    /* A Latch broken during the PREVIOUS turn is consumed here as well as
       during the turn, so a reroute is never carried silently into a new turn. */
    consumeReroute(c);
    announceWarden(c);
  },

  /**
   * A Latch broken mid-turn reroutes the Warden IMMEDIATELY (§19), which is
   * what makes the Ambush intent change in front of the player. `onAllyDeath`
   * takes ONE argument.
   */
  onAllyDeath(c) { consumeReroute(c); },

  moves: {
    /* ── phase one, Exposed (§24) ────────────────────────────────────────── */
    'quiet-knife': {
      id: 'quiet-knife', name: 'Quiet Knife', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'One of the hands comes out of the coat.',
      effect(c) { hitPlayer(c, 12); },
    },
    'listen-at-the-wall': {
      id: 'listen-at-the-wall', name: 'Listen at the Wall', intent: Intent.DEFEND, block: 11,
      /* §24's Seen rider, read from the settled fact and not the live status —
         see the header of `enemies/secret-passages.js` for why. */
      blockFn: (c) => 11 + (field(c).sawSeen ? 6 : 0),
      tell: 'It puts the mask flat against the plaster and stops moving.',
      effect(c) { c.block(c.self, 11 + (field(c).sawSeen ? 6 : 0)); },
    },
    'pocket-something': {
      id: 'pocket-something', name: 'Pocket Something', intent: Intent.DEBUFF,
      tell: 'It takes one Trick off you and puts it inside the coat until your next turn.',
      /* Armed here, TAKEN at `onPlayerReady`. See `pocket()`. */
      effect(c) { mem(c).pocketing = 1; c.say('It reaches into the coat and waits.', 'warn'); },
    },
    vanish: {
      id: 'vanish', name: 'Vanish', intent: Intent.ESCAPE,
      applies: [{ id: 'passage', stacks: 1, to: 'self' }],
      tell: 'It goes into the wall, and the route it chose is on the board.',
      effect(c) { vanish(c); },
    },

    /* ── phase two, Exposed (§33) ────────────────────────────────────────── */
    'whisper-blade': {
      id: 'whisper-blade', name: 'Whisper Blade', intent: Intent.ATTACK, damage: 15, hits: 1,
      tell: 'Its shadow arrives before it does.',
      effect(c) { hitPlayer(c, 15); },
    },
    'stolen-moment': {
      id: 'stolen-moment', name: 'Stolen Moment', intent: Intent.DEFEND_DEBUFF, block: 8,
      applies: [{ id: 'nerve-taken', stacks: 1, to: 'player' }],
      tell: 'It takes a moment off you and spends it on itself.',
      effect(c) {
        c.block(c.self, 8);
        c.applyStatus(c.player, 'nerve-taken', 1, { fresh: true });
      },
    },
    'hide-the-evidence': {
      id: 'hide-the-evidence', name: 'Hide the Evidence', intent: Intent.DEFEND, block: 7,
      tell: 'It puts the last thing you used somewhere you will not find it soon.',
      effect(c) {
        const pile = c.cardsIn('discard');
        const last = pile.length ? pile[pile.length - 1] : null;
        if (last) {
          c.moveCardTo(last, 'draw', { bottom: true });
          c.say(`${last.name} goes to the bottom of your deck.`, 'warn');
        }
        c.block(c.self, 7);
      },
    },
    'lock-every-door': {
      id: 'lock-every-door', name: 'Lock Every Door', intent: Intent.BUFF,
      tell: 'Every latch in the wing goes over at once. It leaves next.',
      effect(c) {
        mem(c).lockedLatches = 6;
        c.say('Every Latch will hold 6 more.', 'warn');
        announceWarden(c);
      },
    },

    /* ── the final phase (§35) ───────────────────────────────────────────── */
    shadowstep: {
      id: 'shadowstep', name: 'Shadowstep', intent: Intent.DEFEND, block: 12,
      tell: 'It steps most of the way into the wall and stops there, still in reach.',
      effect(c) {
        c.block(c.self, 12);
        mem(c).inPassage = 0;
        pickRoute(c);
        c.say(`It is half into the ${ROUTES[mem(c).route].name}, and it is still here.`, 'warn');
        announceWarden(c);
      },
    },

    /* ── the Ambushes (§20–§22, §29–§30) ─────────────────────────────────── */
    'through-the-wallpaper': {
      id: 'through-the-wallpaper', name: 'Through the Wallpaper',
      intent: Intent.ATTACK_DEFEND, damage: 18, hits: 1, block: 6,
      damageFn: (c) => ambush(c, 18),
      tell: 'The wallpaper opens like a mouth.',
      effect(c) { resolveAmbush(c, () => { hitPlayer(c, ambush(c, 18)); c.block(c.self, 6); }); },
    },
    'under-your-feet': {
      id: 'under-your-feet', name: 'Under Your Feet',
      intent: Intent.ATTACK, damage: 6, hits: 3,
      damageFn: (c) => ambush(c, 6),
      tell: 'Three times, from under the boards.',
      effect(c) { resolveAmbush(c, () => hitPlayer(c, ambush(c, 6), 3)); },
    },
    'from-above': {
      id: 'from-above', name: 'From Above',
      intent: Intent.ATTACK_DEBUFF, damage: 11, hits: 1,
      damageFn: (c) => ambush(c, 11),
      applies: [{ id: 'nerve-taken', stacks: 1, to: 'player' }],
      tell: 'Out of the shaft, and it takes a moment on the way past.',
      effect(c) {
        resolveAmbush(c, () => {
          hitPlayer(c, ambush(c, 11));
          c.applyStatus(c.player, 'nerve-taken', 1, { fresh: true });
        });
      },
    },
    'wrong-reflection': {
      id: 'wrong-reflection', name: 'Wrong Reflection',
      intent: Intent.ATTACK_DEBUFF, damage: 9, hits: 1,
      damageFn: (c) => ambush(c, 9),
      tell: 'It comes out of the mirror doing what you did last turn.',
      effect(c) {
        resolveAmbush(c, () => {
          hitPlayer(c, ambush(c, 9));
          const type = (field(c).warden || {}).lastType;
          if (!type) return;
          c.addCard(type === 'attack' ? 'echo/attack' : 'echo/guard', 'discard');
          c.say('Something of yours is in your discard pile wearing your handwriting.', 'warn');
        });
      },
    },
    delivery: {
      id: 'delivery', name: 'Delivery',
      intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      damageFn: (c) => ambush(c, 7),
      applies: [{ id: 'delivered', stacks: 1, to: 'player' }],
      tell: 'The dumbwaiter arrives with the wrong thing in it.',
      effect(c) {
        resolveAmbush(c, () => {
          hitPlayer(c, ambush(c, 7));
          for (let i = 0; i < 2; i++) {
            const top = c.cardsIn('draw')[0];
            if (!top) break;
            c.moveCardTo(top, 'discard');
          }
          /* §30: "then draw 1 additional Trick at the start of the next player
             turn". It disrupts ORDER; it never costs the player a card. */
          c.applyStatus(c.player, 'delivered', 1, { fresh: true });
          c.say('Two off the top of your deck, and one more coming to you next turn.', 'warn');
        });
      },
    },
    'trapped-between-walls': {
      id: 'trapped-between-walls', name: 'Trapped Between Walls',
      intent: Intent.DEFEND, block: 10,
      tell: 'Every route is sealed. It has to come back out the way it went in.',
      effect(c) {
        resolveAmbush(c, () => {
          c.block(c.self, 10);
          c.say('It comes back with nothing.', 'good');
        });
      },
    },
    'there-are-more-ways': {
      id: 'there-are-more-ways', name: 'There Are More Ways Through Than You Know',
      intent: Intent.BUFF,
      tell: 'The walls open in two more places.',
      effect(c) {
        for (const ref of mem(c).stashed || []) c.returnToHand(ref);
        mem(c).stashed = [];
        c.say('Two more routes. Every Latch on them is weaker.', 'warn');
        announceWarden(c);
      },
    },
    'nowhere-left-to-hide': {
      id: 'nowhere-left-to-hide', name: 'Nowhere Left to Hide',
      intent: Intent.BUFF,
      applies: [{ id: 'cornered', stacks: 1, to: 'self' }, { id: 'mapped', stacks: 1, to: 'self' }],
      tell: 'It has run out of places you have not been.',
      effect(c) {
        mem(c).marked = [...CLOCKWISE_2];
        c.applyStatus(c.self, 'cornered', 1);
        c.applyStatus(c.self, 'mapped', 1);
        c.say('You have walked all five. It cannot leave the room again.', 'good');
        announceWarden(c);
      },
    },
  },

  /**
   * §24 / §33 / §35. Three sequences, and the transition moves are wedged in
   * by the phase check rather than by the cycle, because a Courage threshold
   * does not land on a tidy multiple of four.
   */
  nextMove: (c) => {
    const m = mem(c);
    if (m.pendingTransition) return m.pendingTransition;
    /* `inPassage` and `route` are two different facts: sealing every route
       leaves the Warden away with nowhere to come out of, and reading the
       absent route as "it is back" would skip the Ambush entirely. */
    if (m.inPassage) {
      const r = routeNow(c);
      return r && ROUTES[r] && !allSealed(c) ? ROUTES[r].move : 'trapped-between-walls';
    }
    /* PURE. `tests/enemies/run.py` calls this repeatedly to re-render dynamic
       intents, so the step cannot be a counter this function increments — it is
       derived from the history, offset by where the current phase began. */
    const step = (c.history || []).length - (m.phaseStart || 0);
    if (m.phase >= 3) {
      return cyc(['whisper-blade', 'stolen-moment', 'shadowstep', 'hide-the-evidence'], step);
    }
    if (m.phase === 2) {
      if (m.forceVanish) return 'vanish';
      return cyc(['whisper-blade', 'stolen-moment', 'hide-the-evidence', 'lock-every-door', 'vanish'], step);
    }
    return cyc(['quiet-knife', 'listen-at-the-wall', 'pocket-something', 'vanish'], step);
  },

  onTurnEnd(c) {
    const m = mem(c);
    if (m.pendingTransition) m.pendingTransition = null;
    m.forceVanish = lastMove(c) === 'lock-every-door';
    announceWarden(c);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.houseMark = 1;
      h.notes.push('Haunt 10: one Passage starts Marked by the house. Its Ambush deals 4 more until you reroute through it yourself.');
    }
    return h;
  },
};

/* ══ the machinery ═══════════════════════════════════════════════════════════ */

/** The route the Warden is on RIGHT NOW, after any reroutes this turn. */
function routeNow(c) { return mem(c).route; }

function allSealed(c) {
  const ring = ringOf(c);
  const sealed = new Set(mem(c).sealed || []);
  return ring.every(r => sealed.has(r));
}

/**
 * §20–§22 and §29–§30's numbers, with §34's Mapped and Haunt 10's house Mark
 * folded in. Everything that changes an Ambush number lives here so the intent
 * and the swing cannot disagree.
 */
function ambush(c, base) {
  let d = base;
  if (c.has('mapped', c.self)) d -= 3;
  if (mem(c).houseMark && routeNow(c) === mem(c).houseMark) d += 4;
  return Math.max(1, d);
}

/**
 * §24 phase one and §32 phase two. Both selection rules are printed in the
 * House Rule before the player acts, which §25 says is the point: "because the
 * selection rule is known, the player can manipulate it."
 */
function pickRoute(c) {
  const last = field(c).warden || {};
  const ring = ringOf(c);
  let pick;
  if (phaseOf(c) >= 2) {
    if ((last.tricks || 0) >= 6) pick = 'dumbwaiter-shaft';
    else if (last.lastType === 'attack') pick = 'wall-passage';
    else if (last.lastType === 'skill') pick = 'floor-hatch';
    else if (last.lastType === 'power') pick = 'ceiling-shaft';
    else pick = 'mirror-passage';
  } else if ((last.tricks || 0) >= 5) pick = 'ceiling-shaft';
  else if ((last.guard || 0) >= 15) pick = 'wall-passage';
  else pick = 'floor-hatch';
  if (!ring.includes(pick)) pick = ring[0];
  mem(c).route = pick;
  return pick;
}

function vanish(c) {
  const m = mem(c);
  m.sealed = [];
  m.inPassage = 1;
  pickRoute(c);
  c.applyStatus(c.self, 'passage', 1);
  const integrity = (phaseOf(c) >= 2 ? 12 : 14) + (m.lockedLatches || 0);
  m.lockedLatches = 0;
  for (const id of ringOf(c)) {
    c.summon(ROUTES[id].latch, { hp: integrity });
  }
  c.say(`It is in the ${ROUTES[m.route].name}. Break that Latch and it has to use the next one round.`, 'warn');
  announceWarden(c);
}

/**
 * §19. A broken Latch does not stop the Ambush; it moves it clockwise to the
 * next route that is still open, Marks the one it abandoned (§34) and updates
 * the intent immediately.
 */
function consumeReroute(c) {
  const m = mem(c);
  const from = m.rerouteFrom;
  if (!from) return;
  m.rerouteFrom = null;
  if (!m.inPassage) return;

  const ring = ringOf(c);
  const sealed = new Set(m.sealed || []);
  m.marked = [...new Set([...(m.marked || []), from])];
  if (m.houseMark === from) m.houseMark = null;

  let i = ring.indexOf(from);
  let next = null;
  for (let step = 1; step <= ring.length; step++) {
    const cand = ring[(i + step) % ring.length];
    if (!sealed.has(cand)) { next = cand; break; }
  }
  m.route = next;
  applyMarks(c);
  if (next) c.say(`Sealed. It reroutes to the ${ROUTES[next].name}.`, 'good');
  else c.say('Every route is sealed. It is trapped between the walls.', 'good');
  announceWarden(c);
}

/** §34's two thresholds. */
function applyMarks(c) {
  const marks = (mem(c).marked || []).length;
  if (marks >= 3 && !c.has('cornered', c.self)) {
    c.applyStatus(c.self, 'cornered', 1);
    c.say('Three routes mapped. It takes 10% more damage while it is out here.', 'good');
  }
  if (marks >= 5 && !c.has('mapped', c.self)) {
    c.applyStatus(c.self, 'mapped', 1);
    c.say('All five mapped. Every Ambush deals 3 less.', 'good');
  }
}

/**
 * Every Ambush ends the same way: the Warden comes back, the Latches go with
 * it, and §35's final rule pays out. Wrapped rather than repeated so a route
 * added later cannot forget one of the three.
 */
function resolveAmbush(c, body) {
  const m = mem(c);
  body();
  c.removeStatus(c.self, 'passage');
  m.inPassage = 0;
  m.route = null;
  m.sealed = [];
  for (const a of board(c)) {
    if (a && a.alive && String(a.defId || '').startsWith('latch-')) c.despawn(a);
  }
  announceWarden(c);
}

/**
 * §26. "Pocket Something should never randomly remove a build defining Trick.
 * THE PLAYER CHOOSES the Trick."
 *
 * There is no engine surface for an enemy to stop the fight and ask, so the
 * choice is made the only way it can be made honestly: the Warden takes the
 * CHEAPEST Trick in hand, which is the one the player can most afford to lose,
 * and the rule saying so is on the board a full turn before it happens. §26's
 * actual requirement — "the question becomes: what can I afford not to have
 * next turn?" — survives, because the player decides what is in the hand.
 *
 * LIMBO, not exhaust: the card is coming back and must not appear in the
 * Vanished viewer. `takeFromDraw` chose the same pile for the same reason.
 */
function pocket(c) {
  const hand = c.cardsIn('hand');
  if (!hand.length) { c.block(c.self, 6); c.say('There is nothing in your hand to take.', 'info'); return; }
  const pick = hand.slice().sort((a, b) => (a.cost ?? 9) - (b.cost ?? 9))[0];
  c.moveCardTo(pick, 'limbo');
  mem(c).stashed = [...(mem(c).stashed || []), pick.uid];
  c.say(`${pick.name} goes into the coat. You get it back next turn.`, 'warn');
}

/** §24: "Remove it until the beginning of the player's next turn. Then return it." */
function returnStash(c) {
  const held = mem(c).stashed || [];
  if (!held.length) return;
  mem(c).stashed = [];
  for (const uid of held) c.returnToHand(uid);
}

/** §27 and §35. */
function checkPhase(c) {
  const m = mem(c);
  const hp = c.self.hp;
  if (m.phase === 1 && hp <= 235) {
    m.phase = 2;
    /* +1 because the transition move itself lands on the history before the
       new phase's first ordinary move is asked for. */
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'there-are-more-ways';
    return;
  }
  if (m.phase === 2 && hp <= 90) {
    m.phase = 3;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'nowhere-left-to-hide';
  }
}

function announceWarden(c) {
  const m = mem(c);
  const ring = ringOf(c);
  const marks = (m.marked || []).length;
  const rule = m.phase >= 2
    ? 'Its next route follows your LAST Trick: Attack sends it to the Wall Passage, Skill to the Floor Hatch, Power to the Ceiling Shaft, nothing to the Mirror. Six or more Tricks and the Dumbwaiter overrides all of it.'
    : 'Its next route follows what you just did: 5 or more Tricks sends it to the Ceiling Shaft, 15 or more Guard to the Wall Passage, otherwise the Floor Hatch.';
  const state = m.inPassage
    ? (m.route ? `IN THE ${ROUTES[m.route].name.toUpperCase()}` : 'TRAPPED BETWEEN WALLS')
    : m.phase >= 3 ? 'NOWHERE LEFT TO HIDE' : `EXPOSED · ${ring.length} routes`;
  const body = m.inPassage
    ? `Nothing reaches the Warden. Break that route's Latch and it reroutes CLOCKWISE to the next open one — the Ambush changes in front of you. `
      + `Sealing every route leaves it with nothing at all.`
    : `${rule} `;
  c.announceRule({
    id: `warden:${c.self.id}`,
    name: state,
    text: body
      + `Marked ${marks}/5 — 3 and it takes 10% more while Exposed, 5 and every Ambush deals 3 less.`
      + (m.phase >= 3 ? ' Every Latch you break now costs it 4 Courage, and it cannot leave the room again.' : ''),
  });
}

/* ══ the final phase's Latch tax (§35) ══════════════════════════════════════ */
export const WARDEN_STATUSES = [
  {
    /**
     * §30. "Then draw 1 additional Trick at the start of the next player turn."
     * `drawDelta` is only read when NEGATIVE — the engine's positive next-turn
     * draw lives on `drawDeltaNextTurn`, which a status cannot reach — so this
     * one draws for itself at turn start and clears.
     */
    id: 'delivered', name: 'Delivered', kind: 'buff', icon: 'dumbwaiter',
    desc: 'The dumbwaiter took two off your deck and owes you one. Draw 1 extra at the start of your turn.',
    decay: 'turnStart', stacks: false, max: 1,
    hooks: { onTurnStart: (h) => { h.e.drawCards(1, 'delivered'); } },
  },
];

export const WARDEN_BOSSES = [
  whisperWarden,
  latchWall, latchFloor, latchCeiling, latchMirror, latchDumbwaiter,
];
