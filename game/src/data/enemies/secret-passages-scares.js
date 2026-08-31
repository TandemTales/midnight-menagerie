/**
 * The Secret Passages — Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/13-secret-passages.md §14, §15, §16.
 *
 * Three of them, and each one takes a different half of the region's lesson:
 *
 *   THE MOVING WALL        where the enemy is vulnerable is a thing you steer
 *   THE WHISPER CHOIR      what you can reach depends on what your deck does
 *   THE DOOR THAT WASN'T   leaving the battlefield is an offer, not only a threat
 *
 * ── THE MOVING WALL IS ONE ACTOR AND §14 DESCRIBES FOUR ─────────────────────
 *
 * §14 gives the Wall a main Courage pool of 150 and three Sections in front of
 * it: "Only the Gap can receive full damage. Attacks directed at other Sections
 * deal 50 percent damage to the main Courage pool."
 *
 * Built literally that is four actors sharing one pool, and the engine draws a
 * Courage bar for every actor it has. Three bars that never move, in front of a
 * fourth that does, is a worse lie than any deviation: the player would be
 * reading three numbers that mean nothing.
 *
 * What §14 is actually FOR survives without them, and it is stated outright at
 * the end of the section: "The player can deliberately manipulate where the
 * vulnerability appears. The wall is not a guessing game." That decision is the
 * Attacks-versus-Skills lever, and it needs the Gap to have a position and the
 * Wall to have somewhere the Gap can be RIGHT. So:
 *
 *   GAP       Left / Centre / Right. Moves at the end of the player's turn by
 *             §14's rule exactly — more Attacks than Skills moves it right,
 *             more Skills than Attacks moves it left, tied leaves it, and
 *             Powers count for neither.
 *   FACING    which part of the corridor the Wall has turned toward you. It
 *             rotates on its own, one step per enemy turn, and is shown a full
 *             turn ahead.
 *
 * Line the Gap up with the Facing and you are hitting the Gap: full damage.
 * Otherwise you are hitting a Section: half. Every other clause of §14 — Shift
 * the Hall moving it again, Seal the Passage relocating it, Hidden Strike's
 * third hit while the Gap is in Centre — is unchanged, and both numbers are on
 * the board before the player spends anything.
 *
 * ── AND WHY THE CHOIR IS FOUR ACTORS WHEN THE WALL IS ONE ───────────────────
 *
 * Because §15 gives each Whisper its own 31 Courage and its own reveal
 * condition. Four bars, four meanings. The rule is not "never split a Big
 * Scare"; it is that an actor on this board owns a number the player can move.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, playedOfType, field, lastMove,
} from './_lib.js';

const REGION = 'secret-passages';

const PLACES = ['Left', 'Centre', 'Right'];

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 1 — The Moving Wall (§14)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const movingWall = {
  id: 'moving-wall',
  name: 'The Moving Wall',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [150, 150],
  silhouette: 'moving-wall',
  palette: ['#3b3630', '#7c7166', '#141210'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 1.7,
  lore: 'The room begins sliding sideways. Doors vanish. Wall panels overlap. Something huge is moving inside the architecture.',

  onSpawn(c) {
    setCnt(c, 'gap', 1);
    setCnt(c, 'facing', flag(c, 'openFacing', 0));
    mem(c).guarded = flag(c, 'gapGuarded', 0);
    announceWall(c);
  },

  /**
   * §14: "Only the Gap can receive full damage. Attacks directed at other
   * Sections deal 50 percent." Haunt 9 opens with the Gap "in a guarded state",
   * which is the same rule one notch harder for one turn.
   */
  damageTakenMul(c) {
    if (cnt(c, 'gap') !== cnt(c, 'facing')) return 0.5;
    return mem(c).guarded ? 0.75 : 1;
  },

  /**
   * §14's movement rule, at the end of the player's turn, from what the player
   * actually did. Powers count for neither side — the chapter says so.
   */
  onPlayerTurnEnd(c) {
    if (mem(c).guarded) { mem(c).guarded = 0; c.say('The Gap stops being guarded.', 'info'); }
    moveGap(c);
    announceWall(c);
  },

  /** The Facing turns one step per enemy turn, on its own, in the open. */
  onTurnEnd(c) {
    setCnt(c, 'facing', (cnt(c, 'facing') + 1) % 3);
    announceWall(c);
  },

  onPlayerTurnStart(c) {
    /* Hidden Strike's third hit is committed from HERE, not from the live Gap:
       the Gap moves at the end of the player's turn, which is after the intent
       was drawn, and a promise of two hits that lands three is the one lie this
       project does not make. */
    mem(c).gapAtCommit = cnt(c, 'gap');
    announceWall(c);
  },

  moves: {
    'wall-crush': {
      id: 'wall-crush', name: 'Wall Crush', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'Two walls that were never in the same room close on you.',
      effect(c) { hitPlayer(c, 12); },
    },
    'shift-the-hall': {
      id: 'shift-the-hall', name: 'Shift the Hall', intent: Intent.DEFEND, block: 12,
      tell: 'The corridor rearranges itself, and the Gap goes with it.',
      effect(c) {
        c.block(c.self, 12);
        moveGap(c);
        announceWall(c);
      },
    },
    'hidden-strike': {
      id: 'hidden-strike', name: 'Hidden Strike', intent: Intent.ATTACK, damage: 6, hits: 2,
      /**
       * §14 asks for "6 damage twice, and a third 4 damage hit if the Gap is in
       * Center". An intent is `damage x hits` and 6+6+4 is neither 6x2 nor 6x3,
       * so the third hit is a full one — the same call the Kitchens made for
       * Cutlery Devil, and for the same reason: between a design nicety and the
       * number on screen being true, the number wins.
       */
      hitsFn: (c) => strikeHits(c),
      tell: 'Something reaches through the overlap where the panels meet.',
      effect(c) { hitPlayer(c, 6, strikeHits(c)); },
    },
    'seal-the-passage': {
      id: 'seal-the-passage', name: 'Seal the Passage', intent: Intent.BUFF,
      tell: 'It closes the Gap and opens another one somewhere else.',
      effect(c) {
        const from = cnt(c, 'gap');
        const options = [0, 1, 2].filter(i => i !== from);
        setCnt(c, 'gap', options[c.rng.int(options.length)]);
        c.say(`The Gap closes and reopens on the ${PLACES[cnt(c, 'gap')]}.`, 'warn');
        announceWall(c);
      },
    },
  },

  nextMove: (c) => cyc(['wall-crush', 'shift-the-hall', 'hidden-strike', 'seal-the-passage'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.gapGuarded = 1;
      h.notes.push('Haunt 9: the Gap opens guarded — 75% damage instead of full until the end of your first turn.');
    }
    return h;
  },
};

/**
 * Hidden Strike's hit count, from the Gap as it stood when the intent was
 * drawn. `hitsFn` and `effect` both call this, so the promise and the swing are
 * one expression and cannot drift.
 */
function strikeHits(c) { return (mem(c).gapAtCommit ?? cnt(c, 'gap')) === 1 ? 3 : 2; }

/** §14's rule, exactly: Attacks beat Skills → right, Skills beat Attacks → left, tied → stay. */
function moveGap(c) {
  const atk = playedOfType(c, 'attack');
  const skl = playedOfType(c, 'skill');
  if (atk === skl) return;
  const dir = atk > skl ? 1 : -1;
  const before = cnt(c, 'gap');
  setCnt(c, 'gap', Math.max(0, Math.min(2, before + dir)));
  if (cnt(c, 'gap') !== before) {
    c.say(`The Gap slides ${dir > 0 ? 'right' : 'left'}, to the ${PLACES[cnt(c, 'gap')]}.`, 'info');
  }
}

function announceWall(c) {
  const gap = cnt(c, 'gap');
  const face = cnt(c, 'facing');
  const lined = gap === face;
  c.announceRule({
    id: `wall:${c.self.id}`,
    name: `GAP ${PLACES[gap].toUpperCase()} · FACING ${PLACES[face].toUpperCase()}`,
    text: (lined
      ? (mem(c).guarded
        ? 'Lined up, but the Gap is still guarded: 75% damage this turn.'
        : 'Lined up. You are hitting the Gap and it takes FULL damage.')
      : 'Not lined up. You are hitting a Section: HALF damage.')
      + ` The Facing turns one step every enemy turn (next: ${PLACES[(face + 1) % 3]}). `
      + 'The Gap moves at the end of YOUR turn: more Attacks than Skills sends it right, more Skills than Attacks sends it left, tied leaves it. Powers count for neither.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 2 — The Whisper Choir (§15)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One Whisper. §15 gives each of the four its own cadence, its own single move
 * and its own reveal condition, and the differences between them are the whole
 * encounter: the player picks which voice to expose by picking which thing
 * their deck can comfortably do.
 *
 * `reveal(c)` is asked once at the end of every player turn and returns true
 * when that turn satisfied the condition. §15's fallback — "if the player's
 * deck cannot reasonably satisfy a reveal condition, after that Whisper acts
 * twice it becomes Revealed automatically" — is shared and lives in `act()`,
 * because a deck that cannot gain 10 Guard is not a deck that should lose.
 */
function whisper(id, name, lore, cadence, revealText, reveal, move, watch) {
  return {
    id,
    name,
    region: REGION,
    tier: 'elite',
    role: 'bigscare',
    hp: [31, 31],
    silhouette: id,
    palette: ['#2a2c38', '#8189a0', '#0b0c10'],
    shape: { body: 'floating', limbs: 0, eyes: 0 },
    scale: 0.8,
    lore,

    onSpawn(c) {
      c.applyStatus(c.self, 'hidden', 1);
      mem(c).beats = 0;
      mem(c).acted = 0;
      mem(c).showUntil = 0;
      if (typeof watch === 'function') watch(c);
      announceWhisperVoice(c, revealText, cadence);
    },

    /**
     * Guard gained per turn, for the Threatening Whisper. The board-event
     * stream is the only place that number exists — the engine keeps damage
     * dealt and cards played per turn, and not this.
     *
     * ONE WRITER, and the id check is the whole reason it is here rather than
     * on every voice: this factory builds four Whispers, all four would have
     * added the same 4 Guard to the same shared field, and 4 would have read as
     * 16. The gate's own CONTROL only caught it at two voices by luck.
     */
    onBoardEvent(c, ev) {
      if (id !== 'threatening-whisper') return;
      if (!ev || ev.type !== 'block') return;
      if (!ev.actor || ev.actor.side !== 'player') return;
      field(c).guardThisTurn = (field(c).guardThisTurn || 0) + (ev.amount || 0);
    },

    onPlayerTurnEnd(c) {
      if (c.has('hidden', c.self) && reveal(c)) {
        showVoice(c, `${name} gives itself away.`);
      }
      announceWhisperVoice(c, revealText, cadence);
    },

    onPlayerTurnStart(c) {
      /* One writer each, so the two shared tallies below cannot be counted
         four times over by four voices. */
      if (id === 'threatening-whisper') field(c).guardThisTurn = 0;
      if (id === 'lost-whisper') field(c).drawnThisTurn = 0;
      /* §15: "remains targetable until the end of the next player turn. Then it
         hides again if still alive." */
      if (!c.has('hidden', c.self) && c.turn > (mem(c).showUntil || 0)) {
        c.applyStatus(c.self, 'hidden', 1);
        c.say(`${name} goes quiet again.`, 'warn');
      }
      announceWhisperVoice(c, revealText, cadence);
    },

    moves: {
      listen: {
        id: 'listen', name: 'Listening', intent: Intent.SLEEP,
        tell: `It is not this one's turn to speak. ${cadence === 2 ? 'Every second' : 'Every third'} turn is.`,
        effect() {},
      },
      [move.id]: move,
    },

    /**
     * §15's cadence. The beat is counted on the Whisper's own turns, so a
     * Choir that loses a voice does not shift the others' rhythm.
     */
    nextMove: (c) => (((mem(c).beats || 0) + 1) % cadence === 0 ? move.id : 'listen'),

    onTurnEnd(c) {
      mem(c).beats = (mem(c).beats || 0) + 1;
      if (lastMove(c) !== move.id) return;
      mem(c).acted = (mem(c).acted || 0) + 1;
      if (c.has('hidden', c.self) && mem(c).acted >= 2) {
        mem(c).acted = 0;
        showVoice(c, `${name} has spoken twice. You can hear exactly where it is.`);
      }
    },

    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 1) h.notes.push('Courage +6%.');
      if (level >= 9) {
        h.flags.choirOpens = 1;
        h.notes.push('Haunt 9: the Choir opens with one voice already on its cadence.');
      }
      return h;
    },
  };
}

function showVoice(c, line) {
  c.removeStatus(c.self, 'hidden');
  mem(c).showUntil = c.turn + 1;
  c.say(line, 'good');
}

function announceWhisperVoice(c, revealText, cadence) {
  const hidden = c.has('hidden', c.self);
  c.announceRule({
    id: `voice:${c.self.id}`,
    name: hidden ? `${c.self.name} — HIDDEN` : `${c.self.name} — exposed`,
    text: (hidden
      ? `Attack Tricks cannot reach it. To expose it: ${revealText}`
      : 'Out in the open until the end of your next turn, then it hides again.')
      + ` It acts every ${cadence === 2 ? 'second' : 'third'} turn, and after it has acted twice unheard it gives itself away anyway.`,
  });
}

export const threateningWhisper = whisper(
  'threatening-whisper', 'The Threatening Whisper',
  'A voice that describes, in detail and without raising itself, what it is going to do.',
  2, 'gain 10 or more Guard in one turn.',
  (c) => (field(c).guardThisTurn || 0) >= 10,
  {
    id: 'threaten', name: 'Threaten', intent: Intent.ATTACK, damage: 10, hits: 1,
    tell: 'It tells you what happens next and then it happens.',
    effect(c) { hitPlayer(c, 10); },
  },
);

export const nervousWhisper = whisper(
  'nervous-whisper', 'The Nervous Whisper',
  'A voice that keeps apologising and keeps helping the others anyway.',
  2, 'deal 12 or more damage in one turn.',
  (c) => (c.e?.stats?.damageDealtThisTurn || 0) >= 12,
  {
    id: 'brace', name: 'Brace the Others', intent: Intent.DEFEND_BUFF, block: 8,
    tell: 'It puts itself in front of one of the others.',
    effect(c) {
      c.block(c.self, 8);
      const friend = allies(c).find(a => isAlive(a) && a !== c.self);
      if (friend) c.block(friend, 5);
    },
  },
);

export const hungryWhisper = whisper(
  'hungry-whisper', 'The Hungry Whisper',
  'A voice that only ever asks for one more of something.',
  3, 'end a turn with at least 1 Nerve unspent.',
  (c) => (c.player?.energy || 0) >= 1,
  {
    id: 'ask', name: 'Ask for One More', intent: Intent.DEBUFF,
    applies: [{ id: 'nerve-taken', stacks: 1, to: 'player' }],
    tell: 'It asks for one more and does not wait to be given it.',
    effect(c) { c.applyStatus(c.player, 'nerve-taken', 1, { fresh: true }); },
  },
);

export const lostWhisper = whisper(
  'lost-whisper', 'The Lost Whisper',
  'A voice that has forgotten which room it is in and keeps trying doors.',
  3, 'draw 2 or more extra Tricks in one turn.',
  (c) => (field(c).drawnThisTurn || 0) >= 2,
  {
    id: 'mislay', name: 'Mislay Something', intent: Intent.DEBUFF,
    tell: 'Something goes missing off the top of your deck.',
    effect(c) {
      const top = c.cardsIn('draw')[0];
      if (!top) return;
      c.moveCardTo(top, 'discard');
      c.say(`${top.name} is put down somewhere and forgotten.`, 'warn');
    },
  },
  /**
   * "Drew at least 2 ADDITIONAL Tricks" is the one reveal condition the engine
   * could not answer at all, which is why `drawCards` now dispatches
   * `onCardsDrawn` — see the note there. `reason` separates the turn-start deal
   * from a draw the player produced, which is the whole word "additional".
   *
   * Installed once, by the voice that needs it, and removed with that voice.
   */
  (c) => c.addHook('onCardsDrawn', (h) => {
    if (h.reason === 'turnStart') return;
    field(c).drawnThisTurn = (field(c).drawnThisTurn || 0) + ((h.cards || []).length);
  }),
);

/* ═════════════════════════════════════════════════════════════════════════════
 * Big Scare 3 — The Door That Wasn't There (§16)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const doorframe = {
  id: 'doorframe',
  name: 'The Doorframe',
  region: REGION,
  tier: 'elite',
  role: 'object',
  summonOnly: true,
  hp: [22, 22],
  silhouette: 'doorframe',
  palette: ['#4a3b28', '#8d7351', '#0f0c08'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 0.7,
  lore: 'The frame stays when the door goes. There is corridor on both sides of it now.',
  moves: {
    stand: {
      id: 'stand', name: 'Standing Empty', intent: Intent.SLEEP,
      tell: 'Break the frame and it has nowhere good to come back through: Wrong Side loses 6.',
      effect() {},
    },
  },
  nextMove: () => 'stand',
  hauntScaling(level) { return hauntBase(level, 'elite'); },
};

export const theDoor = {
  id: 'the-door',
  name: "The Door That Wasn't There",
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [154, 154],
  silhouette: 'the-door',
  palette: ['#503c26', '#a17f4f', '#120e08'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 1 },
  scale: 1.5,
  lore: 'A door in the middle of a corridor. The blueprint insists no room exists behind it. It behaves differently every time it opens.',

  onSpawn(c) {
    mem(c).state = flag(c, 'opensOpen', 0) ? 'open' : 'locked';
    if (mem(c).state === 'open') { c.applyStatus(c.self, 'ajar', 1); offerGoThrough(c); }
    else c.applyStatus(c.self, 'bolted', 1);
    announceTheDoor(c);
  },

  onPlayerTurnStart(c) {
    c.self._boltSpent = 0;
    announceTheDoor(c);
  },

  /** §16: accepting the offer means the Door's next attack misses. */
  onPlayerCard(c) {
    if (c.card?.id !== 'invite/go-through') return;
    mem(c).missNext = 1;
    c.say('You step through and the corridor closes behind you.', 'good');
    announceTheDoor(c);
  },

  moves: {
    deadbolt: {
      id: 'deadbolt', name: 'Deadbolt', intent: Intent.DEFEND, block: 13,
      applies: [{ id: 'bolted', stacks: 1, to: 'self' }],
      tell: 'Every bolt in it goes over at once.',
      effect(c) { c.block(c.self, 13); setDoorState(c, 'locked'); },
    },
    'stand-open': {
      id: 'stand-open', name: 'Stand Open', intent: Intent.BUFF,
      applies: [{ id: 'ajar', stacks: 1, to: 'self' }],
      tell: 'It opens, and it is offering.',
      effect(c) { setDoorState(c, 'open'); offerGoThrough(c); },
    },
    'door-slam': {
      id: 'door-slam', name: 'Door Slam', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => swingDamage(c, 11),
      tell: 'It shuts on you from a direction doors do not shut from.',
      effect(c) { swing(c, 11, 1); },
    },
    'hallway-snap': {
      id: 'hallway-snap', name: 'Hallway Snap', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => swingDamage(c, 5),
      tell: 'The corridor folds twice.',
      effect(c) { swing(c, 5, 2); },
    },
    elsewhere: {
      id: 'elsewhere', name: 'Elsewhere', intent: Intent.ESCAPE,
      applies: [{ id: 'passage', stacks: 1, to: 'self' }],
      tell: 'The door goes. The frame does not.',
      effect(c) {
        setDoorState(c, 'elsewhere');
        c.applyStatus(c.self, 'passage', 1);
        const frame = c.summon('doorframe');
        if (frame) mem(c).frameId = frame.id;
        c.say('It is on the other side of itself.', 'warn');
        announceTheDoor(c);
      },
    },
    'wrong-side': {
      id: 'wrong-side', name: 'Wrong Side', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      damageFn: (c) => swingDamage(c, wrongSideDamage(c)),
      applies: [{ id: 'bolted', stacks: 1, to: 'self' }],
      tell: 'It opens behind you, from the side that is not the corridor.',
      effect(c) {
        const d = wrongSideDamage(c);
        c.removeStatus(c.self, 'passage');
        const id = mem(c).frameId;
        mem(c).frameId = null;
        const frame = id && board(c).find(a => a && a.id === id && a.alive);
        if (frame) c.despawn(frame);
        swing(c, d, 1);
        setDoorState(c, 'locked');
      },
    },
  },

  /** §16's sequence, verbatim. */
  nextMove: (c) => cyc(
    ['deadbolt', 'stand-open', 'door-slam', 'hallway-snap', 'elsewhere', 'wrong-side'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.opensOpen = 1;
      h.notes.push('Haunt 9: it begins Open and offers Go Through immediately.');
    }
    return h;
  },
};

/**
 * §16: "If accepted, the Door's next attack misses." One attack, then spent.
 *
 * The MISS IS IN THE PRINTED NUMBER, which is the whole reason `swingDamage`
 * exists next to `swing`. The player accepts the offer during their own turn,
 * after the intent has been drawn; without this the Door would go on promising
 * 11 and deliver nothing, and `tests/enemies/audit.py` counted exactly that —
 * 51 turns of "promised 11 got 0". A lie in the player's favour is still a lie,
 * and worse, it hides the thing they just bought.
 */
function swingDamage(c, base) { return mem(c).missNext ? 0 : base; }

function swing(c, dmg, hits) {
  if (mem(c).missNext) {
    mem(c).missNext = 0;
    c.say('It shuts on a corridor you are not standing in.', 'good');
    announceTheDoor(c);
    return;
  }
  hitPlayer(c, dmg, hits);
}

function wrongSideDamage(c) {
  const id = mem(c).frameId;
  const gone = id && !board(c).some(a => a && a.id === id && a.alive);
  return gone ? 8 : 14;
}

function setDoorState(c, state) {
  mem(c).state = state;
  c.removeStatus(c.self, 'bolted');
  c.removeStatus(c.self, 'ajar');
  if (state === 'locked') { c.applyStatus(c.self, 'bolted', 1); c.self._boltSpent = 0; }
  if (state === 'open') c.applyStatus(c.self, 'ajar', 1);
  announceTheDoor(c);
}

/**
 * §16's Go Through offer, as a Trick.
 *
 * The Ballroom already settled this argument (see `data/invitations.js`): there
 * is no engine surface for an enemy to stop the fight and ask a question, and a
 * card IS an offer with its whole cost printed on it. Playing it is Accept.
 * Letting it expire is Decline. The Door takes its own half of the bargain in
 * `onPlayerCard` above, because the enemy is what knows its own bookkeeping.
 */
function offerGoThrough(c) {
  c.addCard('invite/go-through', 'hand');
  c.say('It is standing open, and there is somewhere on the other side.', 'info');
}

function announceTheDoor(c) {
  const state = mem(c).state;
  const frameGone = mem(c).frameId
    && !board(c).some(a => a && a.id === mem(c).frameId && a.alive);
  const text = state === 'locked'
    ? 'Locked: the first Attack Trick to hit it each turn deals 6 LESS damage.'
    : state === 'open'
      ? 'Open: it takes 20% MORE damage, and Go Through? is in your hand. Playing it is Accept and letting it expire is Decline — the terms are on the card.'
      : `Elsewhere: nothing reaches the Door. The frame is still here. It comes back for ${frameGone ? 8 : 14}${frameGone ? '' : ', or 8 if the frame is broken first'}.`;
  c.announceRule({
    id: `thedoor:${c.self.id}`,
    name: state === 'elsewhere' ? 'ELSEWHERE' : state === 'open' ? 'OPEN' : 'LOCKED',
    text: text + (mem(c).missNext ? ' You went through: its next attack misses.' : ''),
  });
}

/* ══ the Locked status ══════════════════════════════════════════════════════ */
export const SCARE_STATUSES = [
  {
    /**
     * §16. "Locked: the first Attack against it each turn deals 6 LESS damage."
     * A flat reduction rather than the False Door's percentage, which is what
     * separates the two doors in this region: one blunts your opener, the other
     * halves it.
     */
    id: 'bolted', name: 'Locked', kind: 'buff', icon: 'door',
    desc: 'Bolted shut. The first Attack Trick to hit it each turn deals 6 less damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => {
        if (!amt || h.card?.type !== 'attack') return amt;
        const who = h.owner;
        if (!who || who._boltSpent) return amt;
        who._boltSpent = 1;
        return Math.max(0, amt - 6);
      },
    },
  },
];

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const PASSAGE_SCARES = [
  movingWall,
  threateningWhisper, nervousWhisper, hungryWhisper, lostWhisper,
  theDoor, doorframe,
];
