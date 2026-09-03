/**
 * The Secret Passages — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/13-secret-passages.md §1–§13, §39–§44.
 *
 * "Less like a conventional wing of the mansion and more like the space between
 * its other regions." Hush's region, and its one lesson is §preamble's:
 *
 *     SOMETHING BEING OUT OF SIGHT DOES NOT MEAN IT IS GONE.
 *
 * ── HIDDEN AND PASSAGE ARE DIFFERENT THINGS ─────────────────────────────────
 *
 * §2 and §3 are careful to separate them and so is this file, because the
 * difference is the region's whole vocabulary (§60: "Hidden and removed from
 * the battlefield are mechanically different states").
 *
 *   HIDDEN   `untargetableBy: ['attack']`. Attack Tricks cannot reach it;
 *            Skills, Powers, area effects and everything already scheduled
 *            still land. A targeting state, NOT invulnerability. It already
 *            existed — the Sleeping Quarters uses it — and this region only
 *            leans on it harder.
 *
 *   PASSAGE  `untargetableBy: ['attack', 'skill', 'power']`. The enemy has left
 *            the battlefield. Nothing reaches it at all.
 *
 * ── AND PASSAGE ALWAYS LEAVES SOMETHING TO HIT ──────────────────────────────
 *
 * This is the one deliberate addition in the file and it is forced by the
 * engine, not invented for flavour: `playCard` refuses an Attack when
 * `targetableEnemies(card)` is empty. A SOLO enemy in Passage therefore does
 * not merely dodge — it makes every Attack in the hand unplayable, which turns
 * §11 Scuffle 8 ("Crawlspace Thing. Solo introduction.") into a dead turn and
 * makes §9's own escape hatch, "play at least 4 Tricks and the ambush weakens",
 * unreachable for an Attack-heavy hand. The chapter cannot have wanted that:
 * §9 asks "can they use the untargetable turn to set up something powerful?",
 * which presumes there is a turn to use.
 *
 * The fix is the region's own grammar rather than a new one. §18–§19 already
 * says what to do when the Whisper Warden is in Passage: "the player cannot
 * attack the Warden directly. Instead, they may attack the Latches." So
 * anything that enters Passage here leaves the way in behind it — a Vent Grate,
 * a Doorframe, a Latch — and breaking it is worth something specific and
 * printed. You hit the entrance, not the thing.
 *
 * ── SEEN HAD TO LAST ONE BEAT LONGER THAN §4 SAYS ───────────────────────────
 *
 * §4 makes the player Seen "until the end of the next enemy turn", which is
 * `decay: 'enemyTurnEnd'` and is exactly what the status below does. But three
 * moves in this region put a NUMBER on being Seen — False Door's third hit,
 * the Warden's extra Guard — and an intent is committed at the START of the
 * player's turn (engine step 7), by which point a Seen applied during the
 * previous turn has already decayed. Read literally, no committed intent can
 * ever see it, and those riders would be dead text.
 *
 * So the status expires when §4 says it does, and the readers do not read the
 * status. They read `field.sawSeen`, which is recorded at the end of the player
 * turn and settled at the start of the next one, BEFORE intents are drawn. The
 * printed number is therefore always "you were Seen last turn", which is
 * honest, visible a full turn ahead, and still a consequence of the player's
 * own repetition. `tests/secret-passages/check.py` gates both halves.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, playedOfType, field, lastMove,
} from './_lib.js';

const REGION = 'secret-passages';

/* ══ Seen: recorded at turn end, settled at turn start ═══════════════════════
 *
 * Three enemies and the boss read this and they all read it the same way. It
 * lives on the shared board field rather than on any one enemy so that a
 * formation with two readers and one Peephole agrees with itself, and so that
 * a reader still works when the Peephole dies mid-fight.
 */
function recordSeen(c) { field(c).seenLast = c.has('seen', c.player) ? 1 : 0; }
function settleSeen(c) { field(c).sawSeen = field(c).seenLast || 0; }
function wasSeen(c) { return !!field(c).sawSeen; }

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const PASSAGE_STATUSES = [
  {
    /**
     * §4. Seen does NOTHING by itself, and the chapter is emphatic about that:
     * "Peephole and several other Secret Passage enemies can exploit it." A
     * status with no hooks is the correct shape for a fact about the player.
     */
    id: 'seen', name: 'Seen', kind: 'debuff', icon: 'seen',
    desc: 'The house has your pattern. It does nothing on its own — but the Passages know what to do with it.',
    decay: 'enemyTurnEnd', stacks: false, max: 1,
  },
  {
    /**
     * §5. "The first Trick the player draws THROUGH AN EFFECT during their next
     * turn is placed into the discard pile instead. Then draw another Trick.
     * Distracted triggers only once. The player does not lose total draw count.
     * It alters which Trick becomes available."
     *
     * `reason` separates the turn-start deal from a mid-turn draw off a Trick,
     * which is the whole distinction §5 draws. The trigger is cleared BEFORE
     * the replacement draw because that draw re-enters `drawCards` and would
     * otherwise consume itself forever.
     */
    id: 'distracted', name: 'Distracted', kind: 'debuff', icon: 'distracted',
    desc: 'The next Trick you draw from an effect goes to the discard, and you draw a different one instead. Once.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      onCardsDrawn: (h) => {
        if (h.reason === 'turnStart' || h.reason === 'draw') return;
        const first = (h.cards || [])[0];
        if (!first) return;
        h.remove();
        h.e.discardCard(first, 'distracted');
        h.e.drawCards(1, 'distracted');
      },
    },
  },
  {
    /**
     * §3. Passage is not Hidden. Nothing reaches it — see the header for why
     * everything that uses this leaves an entrance behind.
     */
    id: 'passage', name: 'In the Passages', kind: 'buff', icon: 'passage',
    desc: 'Gone from the room entirely. Nothing can reach it. The way it went is still here.',
    decay: 'never', stacks: false, max: 1,
    untargetableBy: ['attack', 'skill', 'power'],
  },
  {
    /**
     * §7. A Key is a stolen Nerve, and it keeps being stolen until the Snatcher
     * gives it back. `energyDelta` is the only place a "start with less Nerve"
     * status can work — see the note on Queasy in `companions/keywords.js`; a
     * deduction taken anywhere earlier is wiped by the refill.
     *
     * `max: 2` is §7's cap and it is also the floor rule: Nerve starts at 3, so
     * two Keys leave 1 and "minimum starting Nerve remains 1" holds without a
     * clamp anywhere. Haunt 6 raises the cap to 3 and `keySnatcher` clamps it
     * against the seat's actual maximum there, because at that point it matters.
     */
    id: 'stolen-key', name: 'Stolen Nerve', kind: 'debuff', icon: 'key',
    desc: 'The Snatcher is holding {n} of your Nerve. Start each turn with that much less until you take them back.',
    decay: 'never', stacks: true, max: 3,
    energyDelta: -1,
  },
  {
    /**
     * §22 / §33. The Warden and the Ceiling Shaft take Nerve for ONE turn and
     * hand it back. Queasy's exact shape, and deliberately a different status
     * from a Key: a Key is on the board and can be knocked loose, this cannot.
     */
    id: 'nerve-taken', name: 'Nerve Taken', kind: 'debuff', icon: 'key',
    desc: 'Start your next turn with {n} less Nerve. Then you get it back.',
    decay: 'turnStart', stacks: true, max: 2,
    energyDelta: -1, decayAll: true,
  },
  {
    /**
     * §4's "Tell the House": "ANOTHER ENEMY's next damaging attack deals 4
     * additional damage."
     *
     * A HOOK and not a number in the Peephole's own `damageFn`, which is what
     * it was first. That version worked only when the Peephole kept the buff
     * itself — the §4 fallback branch — and did nothing at all in the case §4
     * actually describes, because the ally reading it would have had to be
     * written to know a Peephole exists. Every enemy in the game already runs
     * its damage through `modifyDamageDealt`, so putting it there means any
     * holder gets it and the number is in the intent before the player acts.
     *
     * Granted at the START of the player's turn and never during the enemy
     * phase — see `peephole.onPlayerTurnStart` — so the +4 is inside the number
     * the player reads rather than added after they committed to blocking it.
     * Spent on the first damaging attack, in `onDealtDamage`, because a reducer
     * must not write.
     */
    id: 'told-on', name: 'Told On', kind: 'buff', icon: 'seen',
    desc: 'The Peephole gave it your position. Its next damaging attack deals 4 more damage per stack.',
    decay: 'never', stacks: true, max: 2,
    hooks: {
      modifyDamageDealt: (amt, h) => (h.kind === 'attack' ? amt + 4 * (h.stacks || 1) : amt),
      onDealtDamage: (h) => { if (h.kind === 'attack' && h.amount > 0) h.remove(); },
    },
  },
  {
    /**
     * §6. "While Closed: the first Attack Trick that damages it each player
     * turn deals 50 percent damage." The spend flag is on the actor because
     * `modifyDamageTaken` is a reducer and must not write anywhere else.
     */
    id: 'shut', name: 'Closed', kind: 'buff', icon: 'door',
    desc: 'Part of the wall. The first Attack Trick to hit it each turn deals half damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => {
        if (!amt || h.card?.type !== 'attack') return amt;
        const who = h.owner;
        if (!who || who._shutSpent >= (who._shutUses || 1)) return amt;
        who._shutSpent = (who._shutSpent || 0) + 1;
        return Math.max(1, Math.floor(amt * 0.5));
      },
    },
  },
  {
    /** §6 / §16. Open: "takes 20 percent additional damage." */
    id: 'ajar', name: 'Open', kind: 'debuff', icon: 'door',
    desc: 'Standing open. It takes 20% more damage and nothing is blunting the first hit.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.2) },
  },
  {
    /** §34. Three Marked Passages: "takes 10 percent additional damage while Exposed." */
    id: 'cornered', name: 'Cornered', kind: 'debuff', icon: 'cornered',
    desc: 'You have mapped most of its routes. It takes 10% more damage whenever it is out here with you.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt, h) => (h.owner?.hasStatus('passage') ? amt : Math.ceil(amt * 1.1)) },
  },
  {
    /**
     * §34. Five Marks: "every future Ambush deals 3 less damage." Read by the
     * Warden's own `damageFn`, not by a hook, so the reduction is in the
     * printed number before the player commits to anything.
     */
    id: 'mapped', name: 'Mapped', kind: 'debuff', icon: 'blueprint',
    desc: 'You have walked every route it has. Every Ambush deals 3 less damage.',
    decay: 'never', stacks: false, max: 1,
  },
];

/* ══ shared helpers ══════════════════════════════════════════════════════════ */

/**
 * §4. Three of one Trick type in a turn and the house has your pattern.
 * Counted from `cardsPlayedThisTurn`, which is the whole table's list — §39
 * says Seen is per-player, and `seatPlayed` is the per-seat form for when the
 * party build needs it. Solo they are the same list.
 */
function repeatedType(c, need) {
  for (const t of ['attack', 'skill', 'power']) {
    if (playedOfType(c, t) >= need) return t;
  }
  return null;
}

/**
 * The Passage marker. Everything that leaves the battlefield drops one of these
 * so the hand stays live — see the header. It is a real actor with real
 * Courage, so the player can see the number and decide whether it is worth it.
 */
function openPassage(c, defId, note) {
  c.applyStatus(c.self, 'passage', 1);
  const marker = c.summon(defId, { hp: undefined });
  if (marker) mem(c).markerId = marker.id;
  if (note) c.say(note, 'warn');
  return marker;
}

/** True once the marker this enemy left behind has been broken. */
function markerBroken(c) {
  const id = mem(c).markerId;
  if (!id) return false;
  return !board(c).some(a => a && a.id === id && a.alive);
}

function closePassage(c) {
  c.removeStatus(c.self, 'passage');
  const id = mem(c).markerId;
  mem(c).markerId = null;
  const marker = id && board(c).find(a => a && a.id === id && a.alive);
  if (marker) c.despawn(marker);
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 1. Peephole — the region's information tax (§4)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const peephole = {
  id: 'peephole',
  name: 'Peephole',
  region: REGION,
  tier: 'normal',
  role: 'observer',
  hp: [24, 24],
  silhouette: 'peephole',
  palette: ['#6b5a3a', '#c9ab6a', '#12100c'],
  shape: { body: 'squat', limbs: 0, eyes: 1 },
  scale: 0.5,
  lore: 'A brass rimmed eye set directly into the wall. Sometimes it blinks. Sometimes a completely different eye opens after it blinks.',

  onSpawn(c) { mem(c).telling = 0; announceSeen(c); },

  /** §4: three of a type in one turn and you are Seen. */
  onPlayerCard(c) {
    if (c.has('seen', c.player)) return;
    const need = flag(c, 'seenAt', 3);
    if (!repeatedType(c, need)) return;
    c.applyStatus(c.player, 'seen', 1);
    c.say('The eye stops blinking.', 'warn');
    announceSeen(c);
  },

  onPlayerTurnEnd(c) { recordSeen(c); },

  /**
   * §4's Tell the House, PAID OUT HERE rather than where it is chosen.
   *
   * Told On adds 4 to somebody's attack, and an attack's number is committed at
   * step 7 of the player's turn. Granting the buff during the enemy phase — the
   * obvious place, inside the move — would raise a number the player had
   * already been shown, which is the exact lie `tests/enemies/audit.py` counts.
   * `onPlayerTurnStart` is step 4: before the deal, before intents, so the +4 is
   * inside the number the player reads.
   */
  onPlayerTurnStart(c) {
    settleSeen(c);
    if (!mem(c).telling) { announceSeen(c); return; }
    mem(c).telling = 0;
    const friend = allies(c).find(isAlive);
    c.applyStatus(friend || c.self, 'told-on', 1);
    c.say(friend ? `${friend.name} has been told exactly where you are.` : 'It has kept the information for itself.', 'warn');
    announceSeen(c);
  },

  moves: {
    watch: {
      id: 'watch', name: 'Watch', intent: Intent.DEFEND, block: 5,
      tell: 'It settles in and does not blink.',
      effect(c) { c.block(c.self, 5); },
    },
    'tell-the-house': {
      id: 'tell-the-house', name: 'Tell the House', intent: Intent.BUFF,
      tell: 'It passes what it saw along the wall.',
      /* No number: what it grants lands at the start of your NEXT turn and is
         printed in that turn's intent, which is the only honest place for it. */
      effect(c) {
        if (!c.has('seen', c.player)) { c.say('It has nothing to report.', 'info'); return; }
        c.removeStatus(c.player, 'seen');
        mem(c).telling = 1;
        c.say('It tells the house where you keep putting your hands.', 'warn');
        announceSeen(c);
      },
    },
    'shutter-snap': {
      /* No `damageFn`: Told On is a `modifyDamageDealt` hook now, so the +4 is
         already in both the printed number and the swing. Adding it here as
         well was the double count. */
      id: 'shutter-snap', name: 'Shutter Snap', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'The brass ring snaps shut on you.',
      effect(c) { hitPlayer(c, 7); },
    },
  },

  nextMove: (c) => cyc(['watch', 'tell-the-house', 'shutter-snap'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.flags.seenAt = 2;
      h.notes.push('Haunt 3: in advanced formations two repeats are enough to be Seen.');
    }
    return h;
  },
};

function announceSeen(c) {
  const need = flag(c, 'seenAt', 3);
  c.announceRule({
    id: `seen:${c.self.id}`,
    name: c.has('seen', c.player) ? 'SEEN' : `Seen at ${need} repeats`,
    text: c.has('seen', c.player)
      ? 'It has your pattern. Being Seen does nothing by itself — the rest of the wing decides what it is worth.'
      : `Play ${need} Tricks of the same TYPE in one turn and it sees the pattern. Vary the turn, or decide the repetition is worth it.`,
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 2. Wall Whisper — Hidden in a predictable rhythm (§5)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const wallWhisper = {
  id: 'wall-whisper',
  name: 'Wall Whisper',
  region: REGION,
  tier: 'normal',
  role: 'harasser',
  hp: [28, 28],
  silhouette: 'whisper',
  palette: ['#4a4a56', '#9aa0b2', '#14141a'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 0.7,
  lore: 'A whisper travelling through the plaster. Occasionally the shape of a mouth presses outward from inside the wall.',

  onSpawn(c) { announceWhisper(c); },

  moves: {
    'whisper-bite': {
      id: 'whisper-bite', name: 'Whisper Bite', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'The plaster bulges and something in it bites.',
      effect(c) { hitPlayer(c, 8); },
    },
    'slip-behind-plaster': {
      id: 'slip-behind-plaster', name: 'Slip Behind Plaster', intent: Intent.DEFEND_BUFF, block: 5,
      applies: [{ id: 'hidden', stacks: 1, to: 'self' }],
      tell: 'It goes back into the wall.',
      effect(c) {
        c.block(c.self, 5);
        c.applyStatus(c.self, 'hidden', 1);
        mem(c).inside = 1;
        announceWhisper(c);
      },
    },
    'voice-behind-you': {
      id: 'voice-behind-you', name: 'Voice Behind You', intent: Intent.ATTACK_DEBUFF, damage: 5, hits: 1,
      applies: [{ id: 'distracted', stacks: 1, to: 'player' }],
      tell: 'It says your name from somewhere behind your shoulder.',
      effect(c) {
        hitPlayer(c, 5);
        c.applyStatus(c.player, 'distracted', 1, { fresh: true });
      },
    },
    'push-through': {
      id: 'push-through', name: 'Push Through', intent: Intent.DEFEND, block: 7,
      tell: 'The wall gives, and it comes out of it.',
      effect(c) {
        c.block(c.self, 7);
        c.removeStatus(c.self, 'hidden');
        mem(c).inside = 0;
        announceWhisper(c);
      },
    },
  },

  /**
   * §5's pattern, driven off the STATE rather than the history index, because
   * Haunt 4 keeps it inside for one extra action the first time it hides and a
   * modular cycle cannot express that.
   */
  /* PURE — the engine re-calls this to re-render dynamic intents, so the
     Haunt-4 debt is SPENT in `onTurnEnd` and only READ here. */
  nextMove: (c) => {
    if (!mem(c).inside) {
      return lastMove(c) === 'push-through' || !c.history?.length ? 'whisper-bite' : 'slip-behind-plaster';
    }
    if ((mem(c).extraInside || 0) > 0) return 'voice-behind-you';
    return lastMove(c) === 'voice-behind-you' ? 'push-through' : 'voice-behind-you';
  },

  onTurnEnd(c) {
    if (!mem(c).inside) { mem(c).extraInside = null; return; }
    /* §5 / Haunt 4: "remains Inside the Wall for one additional enemy action
       THE FIRST TIME it hides." Armed on the way in, spent one action at a
       time, and never re-armed. */
    if (mem(c).extraInside == null) mem(c).extraInside = flag(c, 'lingerInside', 0);
    else if (mem(c).extraInside > 0 && lastMove(c) === 'voice-behind-you') mem(c).extraInside -= 1;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.lingerInside = 1;
      h.notes.push('Haunt 4: the first time it hides it stays inside for one extra action.');
    }
    return h;
  },
};

function announceWhisper(c) {
  c.announceRule({
    id: `whisper:${c.self.id}`,
    name: mem(c).inside ? 'INSIDE THE WALL' : 'Exposed',
    text: mem(c).inside
      ? 'Hidden: Attack Tricks cannot reach it. Skills, Powers and anything already scheduled still can. It comes out on its own.'
      : 'Out here. It goes back in after its next Guard.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 3. False Door — a vulnerability the player opens (§6)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const falseDoor = {
  id: 'false-door',
  name: 'False Door',
  region: REGION,
  tier: 'normal',
  role: 'conditional',
  hp: [36, 36],
  silhouette: 'false-door',
  palette: ['#5a4530', '#a68455', '#100d09'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 0.95,
  lore: 'A perfectly ordinary door in the middle of a wall. The handle turns. There is something behind it. Then it closes and becomes wall again.',

  onSpawn(c) { shut(c); },

  /** §6: "When the player plays their third Trick during a turn." */
  onPlayerCard(c) {
    if (c.has('ajar', c.self)) return;
    if (played(c).length < 3) return;
    c.removeStatus(c.self, 'shut');
    c.applyStatus(c.self, 'ajar', 1);
    c.self._shutSpent = 0;
    c.say('The handle turns on its own.', 'warn');
    announceDoor(c);
  },

  onPlayerTurnEnd(c) {
    recordSeen(c);
    /* §6: Open lasts "until the end of that turn". */
    if (c.has('ajar', c.self)) shut(c);
  },

  onPlayerTurnStart(c) {
    settleSeen(c);
    c.self._shutSpent = 0;
    c.self._shutUses = flag(c, 'shutUses', 1);
    announceDoor(c);
  },

  moves: {
    'door-slam': {
      id: 'door-slam', name: 'Door Slam', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'It swings all the way open and all the way shut.',
      effect(c) { hitPlayer(c, 11); },
    },
    'wrong-room': {
      id: 'wrong-room', name: 'Wrong Room', intent: Intent.DEFEND, block: 10,
      applies: [{ id: 'shut', stacks: 1, to: 'self' }],
      tell: 'It opens onto a room that is not there and shuts again.',
      effect(c) { c.block(c.self, 10); shut(c); },
    },
    'come-through': {
      id: 'come-through', name: 'Come Through', intent: Intent.ATTACK, damage: 5, hits: 2,
      /* §6's Seen rider is a HIT COUNT, so it is committed from `field.sawSeen`
         at the start of the turn and never from the live status — see header. */
      hitsFn: (c) => (wasSeen(c) ? 3 : 2),
      tell: 'Something steps out of it, and the doorway is wider than the wall.',
      effect(c) { hitPlayer(c, 5, wasSeen(c) ? 3 : 2); },
    },
  },

  nextMove: (c) => cyc(['door-slam', 'wrong-room', 'come-through'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.shutUses = 2;
      h.notes.push('Haunt 5: while Closed it blunts the first TWO Attacks each turn, not one.');
    }
    return h;
  },
};

function shut(c) {
  c.removeStatus(c.self, 'ajar');
  c.applyStatus(c.self, 'shut', 1);
  c.self._shutSpent = 0;
  c.self._shutUses = flag(c, 'shutUses', 1);
  announceDoor(c);
}

function announceDoor(c) {
  const open = c.has('ajar', c.self);
  const uses = flag(c, 'shutUses', 1);
  c.announceRule({
    id: `door:${c.self.id}`,
    name: open ? 'OPEN' : 'Closed',
    text: open
      ? 'Open until the end of this turn: it takes 20% MORE damage and nothing is blunting your Attacks. Spend it.'
      : `Closed: the first ${uses > 1 ? uses + ' Attack Tricks' : 'Attack Trick'} to hit it each turn deal${uses > 1 ? '' : 's'} HALF damage. Play three Tricks in a turn and it opens.`,
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 4. Key Snatcher — a stolen resource you can see (§7)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const keySnatcher = {
  id: 'key-snatcher',
  name: 'Key Snatcher',
  region: REGION,
  tier: 'normal',
  role: 'thief',
  hp: [32, 32],
  silhouette: 'snatcher',
  palette: ['#2a2630', '#8d8398', '#0c0a10'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.6,
  lore: 'A little shadow creature running about with a ring of stolen keys twice its own size.',

  onSpawn(c) { setCnt(c, 'keys', 0); mem(c).dropped = 0; announceKeys(c); },

  onPlayerTurnStart(c) { mem(c).dropped = 0; mem(c).hpAtStart = c.self.hp; },

  /**
   * §7: "If Key Snatcher loses at least 13 Courage during one player turn, it
   * drops 1 Key. Once per turn."
   *
   * Measured against the Courage it had at the start of the player's turn
   * rather than through `dmgTaken`, because §7 says LOSES COURAGE and a Rot
   * Pile or a retaliation is a loss the player caused just as much as a swing.
   */
  onPlayerTurnEnd(c) {
    recordSeen(c);
    if (mem(c).dropped || cnt(c, 'keys') <= 0) return;
    const lost = (mem(c).hpAtStart ?? c.self.hp) - c.self.hp;
    if (lost < flag(c, 'dropAt', 13)) return;
    mem(c).dropped = 1;
    dropKey(c);
  },

  onDeath(c) {
    /* §7: "On defeat, all Keys are returned." */
    const n = cnt(c, 'keys');
    if (n > 0) {
      setCnt(c, 'keys', 0);
      c.removeStatus(c.player, 'stolen-key');
      c.say(`The key ring hits the floor. ${n} Nerve back.`, 'good');
    }
  },

  moves: {
    snatch: {
      id: 'snatch', name: 'Snatch', intent: Intent.DEBUFF,
      applies: [{ id: 'stolen-key', stacks: 1, to: 'player' }],
      tell: 'It takes something off you that you did not know was loose.',
      effect(c) {
        const cap = Math.min(flag(c, 'maxKeys', 2), Math.max(0, (c.player.energyMax || 3) - 1));
        if (cnt(c, 'keys') >= cap) { c.block(c.self, 4); return; }
        addCnt(c, 'keys', 1, cap, 0);
        c.applyStatus(c.player, 'stolen-key', 1);
        announceKeys(c);
      },
    },
    'key-jab': {
      id: 'key-jab', name: 'Key Jab', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + 2 * cnt(c, 'keys'),
      tell: 'It swings the ring at you and the keys do the work.',
      effect(c) { hitPlayer(c, 6 + 2 * cnt(c, 'keys')); },
    },
    'jingle-away': {
      id: 'jingle-away', name: 'Jingle Away', intent: Intent.DEFEND, block: 8,
      tell: 'It gets somewhere you are not, noisily.',
      effect(c) { c.block(c.self, 8); },
    },
  },

  nextMove: (c) => cyc(['snatch', 'key-jab', 'jingle-away'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.maxKeys = 3;
      h.notes.push('Haunt 6: it can hold 3 Keys. Your Nerve still never starts below 1.');
    }
    return h;
  },
};

function dropKey(c) {
  addCnt(c, 'keys', -1, 9, 0);
  c.removeStatus(c.player, 'stolen-key');
  const left = cnt(c, 'keys');
  if (left > 0) c.applyStatus(c.player, 'stolen-key', left);
  /* §7: "If the player has already started the affected turn, gain 1 Nerve
     immediately instead." The drop is measured at the end of the player's
     turn, so the refill is always the next turn's — the status is simply gone
     before it can be counted again. */
  c.say('A key comes off the ring.', 'good');
  announceKeys(c);
}

function announceKeys(c) {
  const n = cnt(c, 'keys');
  const cap = flag(c, 'maxKeys', 2);
  c.announceRule({
    id: `keys:${c.self.id}`,
    name: `Keys ${n} / ${cap}`,
    text: n > 0
      ? `It is holding ${n} of your Nerve, and Key Jab hits for 2 more per Key. Take ${flag(c, 'dropAt', 13)}+ Courage off it in one turn and it drops one. Killing it returns them all.`
      : `Every Snatch takes 1 Nerve off your next turn, up to ${cap}. Take ${flag(c, 'dropAt', 13)}+ Courage off it in one turn and it drops one back.`,
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 5. Shadow Draft — moving a Trick is not deleting it (§8)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const shadowDraft = {
  id: 'shadow-draft',
  name: 'Shadow Draft',
  region: REGION,
  tier: 'normal',
  role: 'deck',
  hp: [35, 35],
  silhouette: 'draft',
  palette: ['#1c2028', '#5d6b80', '#080a0e'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.85,
  lore: 'A cold black wind running through the cracks in the walls. It behaves like something alive.',

  onSpawn(c) { announceDraft(c); },
  onPlayerTurnEnd(c) { recordSeen(c); },
  onPlayerTurnStart(c) { settleSeen(c); announceDraft(c); },

  moves: {
    'cold-draft': {
      id: 'cold-draft', name: 'Cold Draft', intent: Intent.DEFEND, block: 5,
      tell: 'It pulls the top of your deck out from under you.',
      effect(c) {
        const n = flag(c, 'coldDraft', 1);
        for (let i = 0; i < n; i++) {
          const top = c.cardsIn('draw')[0];
          if (!top) break;
          c.moveCardTo(top, 'discard');
          c.say(`${top.name} blows into the discard.`, 'warn');
        }
        c.block(c.self, 5);
      },
    },
    backdraft: {
      id: 'backdraft', name: 'Backdraft', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'The wind changes and something comes back with it.',
      effect(c) {
        const pile = c.cardsIn('discard');
        const last = pile.length ? pile[pile.length - 1] : null;
        if (last) {
          c.moveCardTo(last, 'draw', { top: true });
          c.say(`${last.name} is back on top of your deck.`, 'info');
        }
        hitPlayer(c, 5);
      },
    },
    'cross-breeze': {
      id: 'cross-breeze', name: 'Cross Breeze', intent: Intent.ATTACK, damage: 4, hits: 2,
      tell: 'It goes through you from two directions at once.',
      effect(c) {
        hitPlayer(c, 4, 2);
        if (!wasSeen(c)) return;
        const pile = c.cardsIn('discard');
        if (!pile.length) return;
        const pick = pile[c.rng.int(pile.length)];
        c.moveCardTo(pick, 'draw', { bottom: true });
        c.say(`${pick.name} goes to the bottom of your deck.`, 'warn');
      },
    },
  },

  nextMove: (c) => cyc(['cold-draft', 'cross-breeze', 'backdraft', 'cross-breeze'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.coldDraft = 2;
      h.notes.push('Haunt 7: Cold Draft moves the top TWO Tricks. You still see both.');
    }
    return h;
  },
};

function announceDraft(c) {
  c.announceRule({
    id: `draft:${c.self.id}`,
    name: 'Nothing is destroyed',
    text: 'It only MOVES Tricks between your piles — top of deck to discard, discard back to the top. '
      + 'A bad draw skipped and a good discard returned are both things you can use. '
      + (wasSeen(c) ? 'You were Seen, so Cross Breeze also buries a discard.' : 'While you are not Seen, Cross Breeze is only damage.'),
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 6. Crawlspace Thing — the ambush, and two ways to blunt it (§9)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const ventGrate = {
  id: 'vent-grate',
  name: 'Vent Grate',
  region: REGION,
  tier: 'normal',
  hp: [14, 14],
  silhouette: 'grate',
  palette: ['#3a3a3a', '#7d7d7d', '#0d0d0d'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.45,
  role: 'object',
  summonOnly: true,
  lore: 'The louvred plate it went in through. It is still rattling.',
  moves: {
    rattle: {
      id: 'rattle', name: 'Rattling', intent: Intent.SLEEP,
      tell: 'Something is coming back through it. Break it and it has to come out where you are.',
      effect() {},
    },
  },
  nextMove: () => 'rattle',
  hauntScaling(level) { return hauntBase(level, 'normal'); },
};

export const crawlspaceThing = {
  id: 'crawlspace-thing',
  name: 'Crawlspace Thing',
  region: REGION,
  tier: 'normal',
  role: 'ambusher',
  hp: [46, 46],
  silhouette: 'crawlspace',
  palette: ['#241d19', '#6f5a48', '#0a0806'],
  shape: { body: 'sprawling', limbs: 4, eyes: 3 },
  scale: 1.0,
  lore: 'Nobody sees the whole creature. Long fingers disappear into vents. Eyes shine beneath floorboards.',

  onSpawn(c) { mem(c).away = 0; setCnt(c, 'noise', 0); announceCrawl(c); },

  /**
   * §9: "If the player plays at least 4 Tricks while it is in Passage."
   *
   * A COUNTER and not a mem field, and that is the whole point of it: writing a
   * counter calls `refreshIntents`, so the ambush number on screen drops from 18
   * to 10 on the fourth Trick, in front of the player, while they still have the
   * turn to spend. In `mem` it was correct and invisible — the promise only
   * caught up after the swing, which is the same as not telling them.
   */
  onPlayerCard(c) { if (mem(c).away) { setCnt(c, 'noise', played(c).length); announceCrawl(c); } },

  onPlayerTurnStart(c) { if (mem(c).away) { setCnt(c, 'noise', 0); announceCrawl(c); } },

  moves: {
    'long-fingers': {
      id: 'long-fingers', name: 'Long Fingers', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'An arm comes out of a gap far too narrow for it.',
      effect(c) { hitPlayer(c, 9); },
    },
    'crawl-away': {
      id: 'crawl-away', name: 'Crawl Away', intent: Intent.ESCAPE,
      applies: [{ id: 'passage', stacks: 1, to: 'self' }],
      tell: 'It folds itself into the vent. The grate is still there.',
      effect(c) {
        mem(c).away = 1;
        setCnt(c, 'noise', 0);
        openPassage(c, 'vent-grate', 'It is gone. The grate it went through is not.');
        announceCrawl(c);
      },
    },
    'from-behind': {
      id: 'from-behind', name: 'From Behind', intent: Intent.ATTACK_BIG,
      damage: 18, hits: 1,
      damageFn: (c) => ambushDamage(c),
      tell: 'It comes out of the floor behind you.',
      effect(c) {
        /* Recomputed rather than read off `c.self.intent`: the intent is the
           same function and the harness ctx has no live intent to read. */
        const d = ambushDamage(c);
        mem(c).away = 0;
        closePassage(c);
        hitPlayer(c, d);
        announceCrawl(c);
      },
    },
    skitter: {
      id: 'skitter', name: 'Skitter', intent: Intent.ATTACK_DEFEND, damage: 5, hits: 2, block: 5,
      tell: 'It runs over you on its way to somewhere else.',
      effect(c) { hitPlayer(c, 5, 2); c.block(c.self, 5); },
    },
  },

  /**
   * §9's pattern: Long Fingers, Crawl Away, the return attack, Skitter.
   *
   * "Too Early" is not a separate move. §9 gives it a different NUMBER and an
   * earlier return, and both of those are `damageFn` on the same From Behind —
   * one intent, one printed number, chosen at commit from facts the player has
   * already produced. A second move id would have meant the intent changing
   * identity between the promise and the swing.
   */
  nextMove: (c) => {
    if (mem(c).away) return 'from-behind';
    return cyc(['long-fingers', 'crawl-away', null, 'skitter'], (c.history || []).length) || 'skitter';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.ambush = 22;
      h.notes.push('Haunt 8: From Behind hits for 22. Too Early is still 10, so luring it out is worth much more.');
    }
    return h;
  },
};

/**
 * §9's two answers, plus the one the engine forced (see the file header).
 *
 * Noise:   4+ Tricks while it is away and it comes out "Too Early" for 10.
 * Grate:   break the way it went in and it has to come out where you are
 *          waiting — 6 less.
 *
 * Neither is mandatory and they stack, which is the chapter's whole refrain:
 * "one answer is not mandatory".
 */
function ambushDamage(c) {
  const base = flag(c, 'ambush', 18);
  let d = cnt(c, 'noise') >= flag(c, 'noiseNeeded', 4) ? 10 : base;
  if (markerBroken(c)) d = Math.max(1, d - 6);
  return d;
}

function announceCrawl(c) {
  const need = flag(c, 'noiseNeeded', 4);
  const away = mem(c).away;
  c.announceRule({
    id: `crawl:${c.self.id}`,
    name: away ? `AMBUSH — ${ambushDamage(c)} damage` : 'It leaves through the vent',
    text: away
      ? `It is in the passages and nothing reaches it. Two things still change the number: play ${need} Tricks this turn `
        + `(${cnt(c, 'noise')} so far) and it comes out early for 10, or break the Vent Grate and it takes 6 off. Both work together.`
      : 'When it goes into the wall it cannot be touched — but the grate it went through stays on the board, and so does the number it is coming back with.',
  });
}

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const PASSAGE_ENEMIES = [
  peephole, wallWhisper, falseDoor, keySnatcher, shadowDraft, crawlspaceThing,
  ventGrate,
];
