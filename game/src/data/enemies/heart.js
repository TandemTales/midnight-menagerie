/**
 * The Heart of the House — ordinary enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/17-heart.md §1–§15.
 *
 * Region thesis, and it is the game's: "A system can protect you and control
 * you at the same time."
 *
 * §1 is explicit that the Heart SYNTHESISES ideas the player has already
 * learned rather than introducing another standalone subsystem, so almost
 * nothing here is a new verb. What is new is that half of these enemies are
 * genuinely trying to help. The Housekeeper's Put That Back sometimes improves
 * your hand. Old Welcome really does give you a Nerve and a card. The Sanctuary
 * Warden reduces violence in both directions. None of that is a trick — it is
 * the argument the region is making, and the player is meant to keep noticing
 * that accepting it is what makes the fight longer.
 *
 * ── WHAT THAT MEANS FOR THE CODE ────────────────────────────────────────────
 *
 * Five of the eight enemies here read or move Tricks in the player's piles, so
 * this is the first roster to lean on `c.cardsIn` / `c.moveCardTo` /
 * `c.playerDraw` (engine.js `enemyCtx`). They hand back SNAPSHOTS and take uids
 * back; an enemy def never holds a runtime card.
 *
 * Four of them modify what a Trick costs, and every one of those goes through
 * `costRule` below rather than inventing its own hook. `modifyCardCost` is
 * re-run on every repaint, so all of it has to be pure.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, countMoves, played,
  hitPlayer, hauntBase, flag, isAlive,
} from './_lib.js';

const REGION = 'heart';

/* ══ the region's own statuses ═══════════════════════════════════════════════
 * Registered by `data/enemies/index.js` alongside ENEMY_STATUSES, the same way
 * the Kitchens' are, so the region stays drop-in.
 *
 * The rule of thumb from `_lib.js` holds: cross-actor modifiers are statuses so
 * the engine's own pipeline shows them in intents; self-state (Order, Noise,
 * Memory, Stayed, Heartbeat) is a displayed COUNTER computed inside the owning
 * enemy's `damageFn`, and needs nothing from the engine.
 */
export const HEART_STATUSES = [
  {
    /**
     * The Warden's argument in one status. It is applied by the redirect, not
     * by the Warden's attacks, so the enemy that got PROTECTED is the one that
     * hits softer — "The Warden genuinely reduces violence on both sides"
     * (§6), and the player is the other side.
     */
    id: 'calmed', name: 'Calmed', kind: 'debuff', icon: 'calmed',
    desc: 'Its next damaging action deals 2 less damage. Then Calmed ends.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt) => Math.max(0, amt - 2),
      onDealtDamage: (ctx) => ctx.remove(),
    },
  },
  {
    /**
     * Sanctuary is Blanket Blob's Cover with the Heart's argument on top, and
     * it is implemented the same way for the same reason: a status hook cannot
     * reach another actor, so it absorbs on the PROTECTED enemy, books the
     * total, and the Warden settles the tab against its own Courage on its next
     * `onPlayerTurnEnd`. See the long note on `covered` in `_lib.js`.
     *
     * The allowance is per Kid (`seatKey`), which is the same clause every
     * "the first N damage" mechanic in this game carries: one player must not
     * be able to clear the protection for the whole table.
     */
    id: 'sanctuary', name: 'Sanctuary', kind: 'buff', icon: 'sanctuary',
    desc: 'Gains 6 Guard at the start of its turn. The first {n} Attack damage from each Kid each turn is taken by its Warden instead, and Calms it.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      onTurnStart: (ctx) => ctx.block(ctx.actor, 6),
      /** PURE. Works out the absorption and parks it; the spend is booked below. */
      modifyDamageTaken: (amt, ctx) => {
        const a = ctx && ctx.self;
        if (!a || amt <= 0 || ctx.card?.type !== 'attack') return amt;
        const cap = a._sanctuaryAmount || 6;
        const key = (ctx.attacker && ctx.attacker.side === 'player') ? `s${ctx.attacker.seat}` : 'x';
        const used = (a._sanctuaryUsedBySeat || {})[key] || 0;
        const take = Math.max(0, Math.min(amt, cap - used));
        a._sanctuaryTake = take > 0 ? { key, take } : null;
        return amt - take;
      },
      /** The booking half. Only ever runs on a hit that is really landing. */
      onIncomingHit: (ctx) => {
        const a = ctx.defender || ctx.owner;
        const pending = a && a._sanctuaryTake;
        if (a) a._sanctuaryTake = null;
        if (!pending) return;
        const spent = a._sanctuaryUsedBySeat || (a._sanctuaryUsedBySeat = {});
        spent[pending.key] = (spent[pending.key] || 0) + pending.take;
        a._sanctuaryPending = (a._sanctuaryPending || 0) + pending.take;
      },
    },
  },
  {
    /**
     * A MARKER, deliberately hookless. The bonus is read by the Namekeeper's
     * own `damageFn`, which is what makes the intent tell the truth about it —
     * a `modifyDamageTaken` hook here would also fire for every OTHER enemy on
     * the board, and "Recognized" is one filing cabinet knowing your name.
     */
    id: 'recognized', name: 'Recognized', kind: 'debuff', icon: 'nameplate',
    desc: "The Namekeeper's next damaging attack deals {n} more damage. Then Recognized ends.",
    decay: 'never', stacks: false, max: 1,
  },
  {
    /**
     * Old Welcome's bill, arriving one turn after the hospitality. Both halves
     * are real: 6 Guard is worth having and the third Trick costing more is
     * worth planning around, which is the whole enemy in one status.
     */
    id: 'comfortable', name: 'Comfortable', kind: 'neutral', icon: 'armchair',
    desc: 'Gain 6 Guard at the start of your turn. Your third Trick this turn costs 1 more Nerve. Then this passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      onTurnStart: (ctx) => ctx.block(ctx.actor, 6),
      modifyCardCost: (cost, h) => (((h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0) === 2
        ? cost + 1 : cost),
    },
  },
  {
    /**
     * Perfect Sanctuary's Comfort System, which recovers 2 Courage for you and
     * takes 3 off your first Attack. `frightened` is the same SHAPE (next
     * Attack is weaker, then it goes) but the wrong number — 25% rather than a
     * flat 3 — and using it would have quietly re-costed the whole encounter.
     */
    id: 'softened', name: 'Softened', kind: 'debuff', icon: 'softened',
    desc: 'Your next Attack deals 3 less damage. Then Softened passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, ctx) => (ctx.card?.type === 'attack' ? Math.max(0, amt - 3) : amt),
      onCardPlayed: (ctx) => { if (ctx.card?.type === 'attack') ctx.remove(); },
    },
  },
  {
    /**
     * The Safety Argument's other half (§43). Softened's twin at the Keeper's
     * number rather than Perfect Sanctuary's — a shared status at one value
     * would have quietly re-costed one of the two encounters, and which one
     * would depend on which file was edited last.
     */
    id: 'held-back', name: 'Held Back', kind: 'debuff', icon: 'held-back',
    desc: 'Your next Attack deals 4 less damage. Then this passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, ctx) => (ctx.card?.type === 'attack' ? Math.max(0, amt - 4) : amt),
      onCardPlayed: (ctx) => { if (ctx.card?.type === 'attack') ctx.remove(); },
    },
  },
  {
    /**
     * House Remembers' Weather Memory. The mirror image of `seam-pinch`, and
     * the spend rides in `modifyBlockGain` for the same reason it does there:
     * previews resolve against `engine.clone()`, so consuming it here cannot
     * spend the real one on a hover.
     */
    id: 'rain', name: 'Rain', kind: 'buff', icon: 'rain',
    desc: 'The next time you gain Guard, you gain 3 more. Then the rain passes.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyBlockGain: (amt, ctx) => { ctx.remove(); return amt + 3; } },
  },
  {
    id: 'systole', name: 'Systole', kind: 'buff', icon: 'pulse-up',
    desc: 'The House Pulse is contracting. This enemy deals {n} more attack damage.',
    decay: 'never', stacks: true, max: 1,
    hooks: { modifyDamageDealt: (amt, ctx) => amt + (ctx.stacks || 2) },
  },
  {
    id: 'diastole', name: 'Diastole', kind: 'buff', icon: 'pulse-down',
    desc: 'The House Pulse is filling. This enemy gains 5 Guard at the start of its turn.',
    decay: 'never', stacks: false, max: 1,
    hooks: { onTurnStart: (ctx) => ctx.block(ctx.actor, 5) },
  },
  {
    id: 'resonance', name: 'Resonance', kind: 'buff', icon: 'resonance',
    desc: 'A Name Stone has been destroyed. Scheduled damage +{n}, scheduled Guard +{m}.',
    decay: 'never', stacks: true,
  },
  {
    id: 'uncertain', name: 'Uncertain', kind: 'debuff', icon: 'uncertain',
    desc: 'Takes 25% more damage and cannot recover Courage.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.25) },
  },
  {
    id: 'open-heart', name: 'Open Heart', kind: 'debuff', icon: 'open-heart',
    desc: 'Its control is physically failing. Takes 15% more damage and cannot recover Courage.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.15) },
  },
];

/* ══ shared helpers ═════════════════════════════════════════════════════════ */

/**
 * "The Nth Trick each turn costs 1 more (or less) Nerve."
 *
 * The Heart's single most repeated sentence: the Perfect Keeper, the Missing
 * Pet Stone, Perfect Sanctuary's Routine System, the Routine Lock and two of
 * the Keeper's House Arguments all print a version of it. One implementation,
 * so all of them behave identically and there is one place to be wrong.
 *
 * THREE THINGS THIS HAS TO GET RIGHT.
 *
 *  1. `modifyCardCost` MUST BE PURE. The engine re-runs it on every repaint of
 *     every card in hand, so this reads `playedThisTurn` and writes nothing.
 *  2. IT MUST NOT OUTLIVE ITS OWNER. Installed through `c.addHook`, which is
 *     owned by the enemy — and `Hooks.removeByOwner` had no callers until
 *     2026-08-30, so this is the first content that needs that to be true. A
 *     Routine Lock the player broke must stop charging them.
 *  3. IT MUST NOT CLOSE OVER THE ACTOR. `engine.clone()` copies the hook list
 *     by reference for previews, so a closure over `c.self` would read the
 *     REAL board while resolving against the clone. The owner is looked up by
 *     id on whichever engine is dispatching.
 *
 * @param {object} c     enemy ctx
 * @param {object} spec  { id, name, text, steps: [[nth, delta], …] }
 */
function costRule(c, spec) {
  const key = `${spec.id}:${c.self.id}`;
  const m = (mem(c).costRules ||= {});
  if (!m[key]) {
    m[key] = true;
    const selfId = c.self.id;
    const steps = spec.steps;
    c.addHook('modifyCardCost', (cost, h) => {
      const me = h.e && typeof h.e.actor === 'function' ? h.e.actor(selfId) : null;
      if (!me || !me.alive) return cost;
      // 1-based ordinal of the card whose cost is being asked about.
      const nth = ((h.e.playedThisTurn && h.e.playedThisTurn.length) || 0) + 1;
      let out = cost;
      for (const [at, delta] of steps) if (nth === at) out += delta;
      return Math.max(0, out);
    }, { id: key });
  }
  if (spec.text) c.announceRule({ id: key, name: spec.name, text: spec.text });
}

/** Drop a cost rule and its strip entry. */
function clearCostRule(c, id) {
  const key = `${id}:${c.self.id}`;
  const m = mem(c).costRules;
  if (m) delete m[key];
  c.clearRules(key);
}

/** The most recently discarded Trick, as a snapshot, or null. */
function lastDiscard(c) {
  const pile = c.cardsIn ? c.cardsIn('discard') : [];
  return pile.length ? pile[pile.length - 1] : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Housekeeper — restoration support (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * It attacks disorder itself, and disorder includes the player's discard pile.
 *
 * ORDER IS A COUNTER WITH A HOOK, which is unusual here and deliberate. The
 * design says "Each Order grants 2 Guard WHENEVER Housekeeper gains Guard", not
 * "whenever it Guards itself" — House Pulse's Diastole and a Warden's Sanctuary
 * both feed it. So the counter is the display and a `modifyBlockGain` hook
 * installed at spawn is the rule. It is filtered by actor id, because
 * `actorHooks` hands every extra hook to every actor.
 *
 * TIDY UP IS USUALLY THE 8 GUARD BRANCH, and that is the design's own fallback
 * ("If nothing exists: Gain 8 Guard"). Heart formations field few objects for
 * it to clear — it has real work in the Hall of Names and beside House
 * Remembers' Sprout, and in a plain Scuffle it mostly stands there tidying
 * nothing, which is exactly what §4 describes.
 */
export const housekeeper = {
  id: 'housekeeper',
  name: 'Housekeeper',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [42, 42],
  silhouette: 'housekeeper',
  palette: ['#efeae0', '#b9ae9a', '#5c5346'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.1,
  lore: 'Folded sheets and dusting cloths around a set of polished wooden hands. It has been putting things back for a very long time.',

  onSpawn(c) {
    const selfId = c.self.id;
    c.addHook('modifyBlockGain', (amt, h) => {
      if (!h.actor || h.actor.id !== selfId) return amt;
      return amt + 2 * (h.actor.counters?.order || 0);
    }, { id: `order:${selfId}` });
  },

  moves: {
    'tidy-up': {
      id: 'tidy-up', name: 'Tidy Up', intent: Intent.DEFEND, blockFn: (c) => (remnant(c) ? 0 : 8),
      tell: 'It looks around for something that is out of place.',
      effect(c) {
        const junk = remnant(c);
        if (junk) {
          c.say(`${c.self.name} puts ${junk.name} away.`, 'warn');
          c.despawn(junk);
          addCnt(c, 'order', 1, 3);
        } else {
          c.block(c.self, 8);
        }
      },
    },
    'put-that-back': {
      id: 'put-that-back', name: 'Put That Back', intent: Intent.DEBUFF,
      tell: 'It picks the last thing you dropped up off the floor.',
      /**
       * "This is intentionally not always harmful" (§4). It costs you the
       * choice of when that Trick comes back and hands you a fresh one, and
       * against a thin deck that is a gift. The house's systems are not
       * malicious in every interaction, and this is the line that says so.
       */
      effect(c) {
        const card = lastDiscard(c);
        if (card) {
          c.say(`${card.name} goes back on the bottom of the pile.`, 'warn');
          c.moveCardTo(card.uid, 'draw', { bottom: true });
        }
        c.playerDraw(1);
      },
    },
    'feather-duster': {
      id: 'feather-duster', name: 'Feather Duster', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'One wooden hand comes round in a wide, unhurried arc.',
      effect(c) { hitPlayer(c, 8); },
    },
    'everything-in-its-place': {
      id: 'everything-in-its-place', name: 'Everything in Its Place',
      intent: Intent.DEFEND, blockFn: (c) => 9 + 2 * cnt(c, 'order'),
      tell: 'It squares up the whole room, itself included.',
      effect(c) {
        c.block(c.self, 9 + 2 * cnt(c, 'order'));
        const friend = allies(c)[0];
        if (friend) c.block(friend, 5);
      },
    },
  },

  nextMove: (c) => cyc(['tidy-up', 'feather-duster', 'put-that-back', 'everything-in-its-place'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.counters.order = 1;
      h.notes.push('Haunt 3: it begins advanced encounters already holding 1 Order.');
    }
    return h;
  },
};

/** A summoned board object this Housekeeper would tidy away. */
function remnant(c) {
  return allies(c).find(a => isAlive(a) && a.def && a.def.remnant) || null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Memory Animal — behavioural echo (§5)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * It is not a trapped animal. It is a memory of one, and defeating it harms
 * nothing — §5 says so twice, and the lore line says it where a player will
 * read it.
 *
 * FOUR MOVES, NOT ONE DYNAMIC ONE. The remembered type could have been an
 * `intentFn` on a single "Resolve Memory", but then the intent would carry the
 * right number under the wrong NAME, and this region's whole promise is that
 * the house is remembering something specific about you. The memory is written
 * in `onPlayerTurnEnd` and only READ in `nextMove`, which is what keeps
 * `nextMove` pure.
 */
export const memoryAnimal = {
  id: 'memory-animal',
  name: 'Memory Animal',
  region: REGION,
  tier: 'normal',
  role: 'adaptive',
  hp: [38, 38],
  silhouette: 'memory-animal',
  palette: ['#bcd8e8', '#7fa8c4', '#3d5c73'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 0.9,
  lore: 'The outline of an animal, running the same circuit it has always run. Nothing is inside it.',

  onPlayerTurnEnd(c) {
    const first = played(c)[0];
    mem(c).memory = first ? first.type : null;
  },

  moves: {
    'remembered-pounce': {
      id: 'remembered-pounce', name: 'Remembered Pounce', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'It remembers being fast.',
      effect(c) { hitPlayer(c, 11); },
    },
    'remembered-shelter': {
      id: 'remembered-shelter', name: 'Remembered Shelter', intent: Intent.ATTACK_DEFEND,
      damage: 4, hits: 1, block: 12,
      tell: 'It remembers somewhere safe, and puts its back to it.',
      effect(c) { c.block(c.self, 12); hitPlayer(c, 4); },
    },
    'remembered-habit': {
      id: 'remembered-habit', name: 'Remembered Habit', intent: Intent.ATTACK_BUFF,
      damage: 5, hits: 1,
      damageFn: (c) => 5 + 2 * Math.min(cnt(c, 'memory') + 1, memoryCap(c)),
      tell: 'It remembers doing this before. It is getting better at it.',
      effect(c) {
        addCnt(c, 'memory', 1, memoryCap(c));
        hitPlayer(c, 5 + 2 * cnt(c, 'memory'));
      },
    },
    'waiting-memory': {
      id: 'waiting-memory', name: 'Waiting Memory', intent: Intent.DEFEND, block: 8,
      tell: 'It waits by the door, the way it always did.',
      effect(c) { c.block(c.self, 8); },
    },
    'familiar-sound': {
      id: 'familiar-sound', name: 'Familiar Sound', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'Something in the walls makes a noise it knows.',
      effect(c) { hitPlayer(c, 7); mem(c).memory = null; },
    },
  },

  nextMove: (c) => {
    // Resolve Memory, Familiar Sound, repeat (§5 Pattern).
    if ((c.history || []).length % 2 === 1) return 'familiar-sound';
    switch (mem(c).memory) {
      case 'attack': return 'remembered-pounce';
      case 'skill': return 'remembered-shelter';
      case 'power': return 'remembered-habit';
      default: return 'waiting-memory';
    }
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.memoryCap = 4;
      h.notes.push('Haunt 4: it can hold 4 Memory rather than 3.');
    }
    return h;
  },
};
function memoryCap(c) { return flag(c, 'memoryCap', 3); }

// ═════════════════════════════════════════════════════════════════════════════
// 3. Sanctuary Warden — protective control (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The protection is genuinely useful to the protected target. It also makes
 * them harder to defeat. That contradiction is the Heart in miniature." (§6.)
 *
 * The redirect is settled at the END of the player turn rather than per hit,
 * because a status hook cannot reach another actor — see the `sanctuary` note
 * above and the much longer one on `covered` in `_lib.js`. The consequence the
 * player sees is exactly the printed rule: their Attack lands short on the
 * protected enemy, the Warden's Courage drops instead, and the enemy they were
 * hitting comes out of it Calmed.
 */
export const sanctuaryWarden = {
  id: 'sanctuary-warden',
  name: 'Sanctuary Warden',
  region: REGION,
  tier: 'normal',
  role: 'protector',
  hp: [48, 48],
  silhouette: 'warden',
  palette: ['#f6f4ef', '#cfc7b6', '#6f7f86'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.15,
  lore: 'A white wooden figure with padded arms and a small gate built into its chest. The gate opens inward.',

  onPlayerTurnEnd(c) {
    // 1. Break Sanctuary if the player hit the Warden hard enough this turn.
    const took = (c.self.damageTakenThisTurn || 0);
    if (took >= 16 && mem(c).wardId) {
      const ward = wardOf(c);
      if (ward) { c.removeStatus(ward, 'sanctuary'); c.say(`${ward.name} is no longer sheltered.`, 'good'); }
      mem(c).wardId = null;
    }
    // 2. Settle the redirect: what Sanctuary absorbed comes off the Warden,
    //    and the enemy that was spared is Calmed.
    const ward = wardOf(c);
    if (!ward) return;
    const owed = ward._sanctuaryPending || 0;
    ward._sanctuaryPending = 0;
    ward._sanctuaryUsedBySeat = {};
    if (owed <= 0) return;
    c.loseHp(c.self, owed);
    c.applyStatus(ward, 'calmed', 1);
  },

  onAllyDeath(c) { if (c.deadId && mem(c).wardId === c.deadId) mem(c).wardId = null; },

  moves: {
    'provide-shelter': {
      id: 'provide-shelter', name: 'Provide Shelter', intent: Intent.DEFEND_BUFF, block: 6,
      tell: 'The gate in its chest opens, and it looks for someone to put behind it.',
      applies: [{ id: 'sanctuary', stacks: 1, to: 'enemy' }],
      effect(c) {
        c.block(c.self, 6);
        const pick = pickWard(c);
        if (!pick) return;
        mem(c).wardId = pick.id;
        pick._sanctuaryAmount = flag(c, 'redirect', 6);
        pick._sanctuaryUsedBySeat = {};
        pick._sanctuaryPending = 0;
        c.applyStatus(pick, 'sanctuary', 1);
        c.say(`${pick.name} is taken into Sanctuary.`, 'warn');
      },
    },
    'gentle-push': {
      id: 'gentle-push', name: 'Gentle Push', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'A padded arm moves you back towards where it thinks you should be.',
      effect(c) { hitPlayer(c, 9); },
    },
    'remain-here': {
      id: 'remain-here', name: 'Remain Here', intent: Intent.DEFEND, block: 12,
      tell: 'It settles its weight and does not intend to move again.',
      effect(c) {
        c.block(c.self, 12);
        const ward = wardOf(c);
        if (ward) { c.block(ward, 6); c.applyStatus(ward, 'calmed', 1); }
      },
    },
  },

  nextMove: (c) => {
    // Re-shelter as soon as there is nobody behind the gate and somebody to put
    // there — otherwise the pattern from §6.
    if (!wardOf(c) && pickWard(c)) return 'provide-shelter';
    return cyc(['gentle-push', 'remain-here'], countMoves(c, ['gentle-push', 'remain-here']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.redirect = 8;
      h.notes.push('Haunt 5: Sanctuary redirects the first 8 Attack damage instead of 6.');
    }
    return h;
  },
};

function wardOf(c) {
  const id = mem(c).wardId;
  if (!id) return null;
  return allies(c).find(a => isAlive(a) && a.id === id) || null;
}
/**
 * "Sanctuary Warden cannot protect House Pulse during the first round of
 * combat" (§15). The Pulse buffs the whole formation, so sheltering it on turn
 * one makes the opening unreadable.
 */
function pickWard(c) {
  const pool = allies(c).filter(a => isAlive(a) && !a.hasStatus?.('sanctuary'));
  const legal = pool.filter(a => !(c.turn <= 1 && a.defId === 'house-pulse'));
  const use = legal.length ? legal : pool.filter(a => a.defId !== 'house-pulse');
  if (!use.length) return null;
  // The one it can actually keep alive: highest current Courage.
  return use.reduce((best, a) => (!best || a.hp > best.hp ? a : best), null);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Namekeeper — Trick identity pressure (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Playing the Named Trick hurts Namekeeper but creates future danger. Refusing
 * the challenge gives Namekeeper defense but preserves safety." (§7.)
 *
 * ONE RECOGNIZED BONUS, NOT TWO. §7 prints both "Recognized: the next damaging
 * attack deals 4 additional damage" AND "I Know You: if Recognized deal 12,
 * otherwise 8" — and those cannot both be separate mechanics, because the
 * Pattern puts Registry Slam between the two and it would eat the Recognized
 * first, leaving I Know You nothing to read. So Recognized is the single
 * mechanic: +4 on the next damaging attack, spent there. I Know You's base is 8
 * and it reads that bonus like every other attack, which produces exactly the
 * 12 and the 8 the chapter prints for it.
 */
export const namekeeper = {
  id: 'namekeeper',
  name: 'Namekeeper',
  region: REGION,
  tier: 'normal',
  role: 'controller',
  hp: [40, 40],
  silhouette: 'cabinet',
  palette: ['#7a5c3a', '#c8a465', '#efe3c8'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 1.05,
  lore: 'A floating filing cabinet under a hundred engraved nameplates. Two of the drawers have your names on them.',

  /**
   * THE NAME IS CHOSEN AT THE START OF YOUR TURN, NOT DURING THE ENEMY PHASE.
   *
   * §7 says "Namekeeper chooses one Trick in the player's hand", and Call Your
   * Name resolves on the enemy turn — by which point the hand has been
   * discarded and there is nothing to choose. Driven against the real engine
   * the move took its empty-hand fallback every single time and no Trick was
   * ever Named; the structural suite could not see it, because its mock hand is
   * never emptied.
   *
   * So Call Your Name TELEGRAPHS ("a drawer slides open") and the Name lands on
   * the hand you are actually holding. That is also the better read: you see
   * which of your Tricks it wants at the moment you can do something about it.
   *
   * `onPlayerReady`, not `onPlayerTurnStart`: the latter fires at step 4 of the
   * turn, BEFORE the deal, so it saw an empty hand too and named nothing on
   * every single turn. `onPlayerReady` is the engine's step 6c, after the hand
   * exists and before intents are drawn.
   */
  onPlayerReady(c) {
    /* RECOGNIZED IS APPLIED HERE, NOT WHERE IT IS EARNED, and the intent-truth
       audit is why. Applying it in `onPlayerTurnEnd` — the moment the player
       played the Named Trick — lands it AFTER the intent for the imminent
       attack has already been published, so Registry Slam promised 8 and dealt
       12. Twenty-three times in 4,666 audited turns.
       This is the Rising Batter's bug from the Kitchens, in a different file:
       a buff that must be inside a number the player reads has to land before
       that number is drawn. `onPlayerReady` runs at engine step 6c, one line
       before `refreshIntents('turnStart')`, so the +4 is in the intent the
       player is looking at when they decide what to do about it. */
    if (mem(c).recognizeNext) {
      mem(c).recognizeNext = false;
      c.applyStatus(c.player, 'recognized', 1);
    }
    if (!mem(c).naming) return;
    mem(c).naming = false;
    const hand = c.cardsIn ? c.cardsIn('hand') : [];
    if (!hand.length) { c.block(c.self, 5); return; }
    const pick = hand[c.rng.int(hand.length)];
    mem(c).named = pick;
    c.announceRule({
      id: `named:${c.self.id}`,
      name: `Named: ${pick.name}`,
      text: 'Play it and the Namekeeper loses 4 Courage, but it will know you. Leave it and it goes back on top of your draw pile and the Namekeeper gains 7 Guard.',
    });
  },

  onPlayerTurnEnd(c) {
    const named = mem(c).named;
    if (!named) return;
    const wasPlayed = played(c).some(p => p && p.uid === named.uid);
    if (wasPlayed) {
      c.loseHp(c.self, 4);
      mem(c).recognizeNext = true;          // applied at `onPlayerReady` — see above
      c.say(`It writes your name down. ${named.name} was yours.`, 'warn');
    } else {
      c.moveCardTo(named.uid, 'draw', { top: true });
      c.block(c.self, 7);
      c.say(`${named.name} is filed back on top.`, 'warn');
    }
    mem(c).named = null;
    c.clearRules(`named:${c.self.id}`);
  },

  moves: {
    'call-your-name': {
      id: 'call-your-name', name: 'Call Your Name', intent: Intent.DEFEND_DEBUFF, block: 4,
      tell: 'A drawer slides open. Whatever is in it has your handwriting on it.',
      effect(c) {
        // The Name lands at the start of your turn — see `onPlayerTurnStart`.
        mem(c).naming = true;
        c.block(c.self, 4);
      },
    },
    'registry-slam': {
      id: 'registry-slam', name: 'Registry Slam', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + recognizedBonus(c),
      tell: 'Every drawer shuts at once.',
      effect(c) { hitPlayer(c, 8 + recognizedBonus(c)); spendRecognized(c); },
    },
    'i-know-you': {
      id: 'i-know-you', name: 'I Know You', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + recognizedBonus(c),
      tell: 'It says the name again, and this time it is sure.',
      effect(c) { hitPlayer(c, 12 + recognizedBonus(c)); spendRecognized(c); },
    },
    'file-away': {
      id: 'file-away', name: 'File Away', intent: Intent.DEFEND, block: 10,
      tell: 'It closes itself around its own paperwork.',
      effect(c) { c.block(c.self, 10); },
    },
  },

  nextMove: (c) => cyc(['call-your-name', 'registry-slam', 'i-know-you', 'file-away'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.recognized = 6;
      h.notes.push("Haunt 6: Recognized adds 6 damage instead of 4.");
    }
    return h;
  },
};
function recognizedBonus(c) {
  return c.has('recognized', c.player) ? flag(c, 'recognized', 4) : 0;
}
function spendRecognized(c) {
  if (c.has('recognized', c.player)) c.removeStatus(c.player, 'recognized');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Quiet Room — rule pressure (§8)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The Quiet Room does not say: you cannot play more Tricks. It says: you can,
 * but the room responds." (§8.) That distinction is the region's rule-design
 * contract and it is why Noise is a consequence rather than a restriction —
 * nothing here ever refuses a card.
 *
 * The thresholds are the 4th and the 6th Trick of the turn, counted across the
 * whole table, and Haunt 7 moves the second one to the 5th.
 */
export const quietRoom = {
  id: 'quiet-room',
  name: 'Quiet Room',
  region: REGION,
  tier: 'normal',
  role: 'rule',
  hp: [50, 50],
  silhouette: 'quiet-room',
  palette: ['#d9d2c4', '#a39782', '#4a4238'],
  shape: { body: 'squat', limbs: 0, eyes: 1 },
  scale: 1.3,
  lore: 'The door shuts, padding grows across the walls, and a face appears somewhere underneath the wallpaper.',

  onCombatStart(c) { announceQuiet(c); },
  onSpawn(c) { announceQuiet(c); },

  onCardPlayed(c) {
    const nth = (c.cardsPlayedThisTurn || []).length;
    const second = flag(c, 'secondNoise', 6);
    if (nth !== 4 && nth !== second) return;
    if (cnt(c, 'noise') >= 2) return;
    addCnt(c, 'noise', 1, 2);
    c.block(c.self, 6);
    c.say('The room does not like that.', 'warn');
  },

  onPlayerTurnStart(c) { setCnt(c, 'noise', 0); },

  moves: {
    'soft-walls': {
      id: 'soft-walls', name: 'Soft Walls', intent: Intent.DEFEND, block: 12,
      tell: 'The padding thickens.',
      effect(c) { c.block(c.self, 12); },
    },
    'please-settle-down': {
      id: 'please-settle-down', name: 'Please Settle Down', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'The walls lean in a little.',
      effect(c) { hitPlayer(c, 8); },
    },
    'too-much': {
      id: 'too-much', name: 'Too Much', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + 3 * cnt(c, 'noise'),
      tell: 'It has been counting.',
      effect(c) { hitPlayer(c, 7 + 3 * cnt(c, 'noise')); setCnt(c, 'noise', 0); },
    },
  },

  nextMove: (c) => cyc(['soft-walls', 'please-settle-down', 'too-much'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.secondNoise = 5;
      h.notes.push('Haunt 7: Noise on the fourth and FIFTH Trick. Maximum is still 2.');
    }
    return h;
  },
};
function announceQuiet(c) {
  const second = flag(c, 'secondNoise', 6);
  c.announceRule({
    id: `quiet:${c.self.id}`,
    name: 'Quiet Please',
    text: `Play as many Tricks as you like. The ${ordinal(4)} and ${ordinal(second)} each turn make Noise: the room gains 6 Guard, and its next damaging move gains 3 damage per Noise.`,
  });
}
const ordinal = (n) => ['0th', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n] || `${n}th`;

// ═════════════════════════════════════════════════════════════════════════════
// 6. House Pulse — formation amplifier (§9)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "This is the house itself participating in ordinary combat." (§9.)
 *
 * THE NEXT STATE IS ALWAYS SHOWN, which is not decoration — it is the whole
 * enemy. The state is applied to the rest of the formation at `onEnemyPhaseEnd`
 * and NOT inside a move, because that is the documented moment when every enemy
 * has acted and intents have not yet been redrawn. Arming it anywhere later
 * would publish an intent and then change the number under it, which is the one
 * thing this game's intents may never do (see the Rising Batter's note in the
 * Kitchens for the time that happened).
 */
export const housePulse = {
  id: 'house-pulse',
  name: 'House Pulse',
  region: REGION,
  tier: 'normal',
  role: 'amplifier',
  hp: [35, 35],
  silhouette: 'pulse',
  palette: ['#5c8fb0', '#8fd0e8', '#23364a'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.85,
  lore: 'Wood, plumbing, wallpaper, roots and wire knotted around a blue light, contracting on a slow and even beat.',

  onSpawn(c) { setCnt(c, 'systole', 1); announcePulse(c); },

  onEnemyPhaseEnd(c) { applyPulse(c); },
  onPlayerTurnStart(c) { applyPulse(c); },

  /** "On defeat: all Heartbeat bonuses immediately end." (§9.) */
  onDeath(c) {
    for (const a of allies(c)) { c.removeStatus(a, 'systole'); c.removeStatus(a, 'diastole'); }
    c.clearRules(`pulse:${c.self.id}`);
  },

  moves: {
    beat: {
      id: 'beat', name: 'Beat', intent: Intent.ATTACK, damage: 5, hits: 1,
      // Beat FLIPS the Heartbeat, so what the intent must promise is the state
      // the formation will be in afterwards, not the one it is in now.
      appliesFn: (c) => (allies(c).length
        ? [{ id: cnt(c, 'systole') ? 'diastole' : 'systole', stacks: 1, to: 'allies' }] : []),
      tell: 'It contracts once, and the floorboards answer.',
      effect(c) { hitPlayer(c, 5); flip(c); },
    },
    quickening: {
      id: 'quickening', name: 'Quickening', intent: Intent.BUFF,
      appliesFn: (c) => (allies(c).length ? [{ id: 'systole', stacks: 1, to: 'allies' }] : []),
      tell: 'The beat speeds up and everything around it stands taller.',
      effect(c) {
        setCnt(c, 'systole', 1);
        for (const a of allies(c)) c.block(a, 4);
        applyPulse(c);
      },
    },
    slowing: {
      id: 'slowing', name: 'Slowing', intent: Intent.DEFEND, block: 10,
      appliesFn: (c) => (allies(c).length ? [{ id: 'diastole', stacks: 1, to: 'allies' }] : []),
      tell: 'The beat lengthens and the room fills up.',
      effect(c) { setCnt(c, 'systole', 0); c.block(c.self, 10); applyPulse(c); },
    },
  },

  /**
   * "Beat. Beat. Quickening or Slowing according to which state would benefit
   * the formation." (§9.) Pure: it reads the board's intents, which the engine
   * has already drawn, and never writes.
   */
  nextMove: (c) => {
    const i = (c.history || []).length % 3;
    if (i < 2) return 'beat';
    const friends = allies(c);
    const attacking = friends.filter(a => {
      const t = c.intentOf ? c.intentOf(a) : null;
      return t === Intent.ATTACK || t === Intent.ATTACK_BIG || t === Intent.ATTACK_DEFEND
        || t === Intent.ATTACK_BUFF || t === Intent.ATTACK_DEBUFF;
    }).length;
    return attacking * 2 >= friends.length ? 'quickening' : 'slowing';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.systoleDamage = 3;
      h.notes.push('Haunt 8: Systole grants 3 attack damage instead of 2.');
    }
    return h;
  },
};
function flip(c) { setCnt(c, 'systole', cnt(c, 'systole') ? 0 : 1); applyPulse(c); }
function applyPulse(c) {
  if (!isAlive(c.self)) return;
  const on = cnt(c, 'systole') ? 'systole' : 'diastole';
  const off = on === 'systole' ? 'diastole' : 'systole';
  const stacks = on === 'systole' ? flag(c, 'systoleDamage', 2) : 1;
  for (const a of allies(c)) {
    if (!isAlive(a)) continue;
    c.removeStatus(a, off);
    if (!c.has(on, a)) c.applyStatus(a, on, stacks);
  }
  announcePulse(c);
}
function announcePulse(c) {
  const on = cnt(c, 'systole') ? 'Systole' : 'Diastole';
  const next = cnt(c, 'systole') ? 'Diastole' : 'Systole';
  c.announceRule({
    id: `pulse:${c.self.id}`,
    name: `Heartbeat — ${on}`,
    text: on === 'Systole'
      ? `Every other enemy deals ${flag(c, 'systoleDamage', 2)} more attack damage. Next: ${next}.`
      : `Every other enemy gains 5 Guard at the start of its turn. Next: ${next}.`,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Old Welcome — temptation and staying (§10)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The Heart still gives the player real benefits. It simply keeps making
 * staying easier." (§10.)
 *
 * THE OFFER IS NOT A PROMPT. Every other "choose one" in this game is a
 * Curiosity on the map, where stopping the fight to ask a question is free. In
 * combat it would be a modal in the middle of an enemy phase, so the offer is
 * expressed the way the rest of this engine expresses a choice the player makes
 * with their hands: the chair is PUT OUT (a House Rule the player can read),
 * and the player accepts it by ending their next turn with unspent Nerve —
 * which is what "sitting down" is, in the only currency the fight has.
 *
 * That is a deviation from §10's literal Accept/Decline button and it is
 * deliberate: the same benefits, the same Stayed, the same escalation, made of
 * a decision the player takes rather than a dialog they dismiss. §15 asks that
 * "Old Welcome offers always display their full cost", which the rule does.
 */
export const oldWelcome = {
  id: 'old-welcome',
  name: 'Old Welcome',
  region: REGION,
  tier: 'normal',
  role: 'tempter',
  hp: [44, 44],
  silhouette: 'welcome',
  palette: ['#b08e4e', '#e6d3a8', '#4a3a2a'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 1.0,
  lore: 'An old brass welcome sign floating beside a comfortable armchair. The chair has been following you for some time.',

  onPlayerTurnEnd(c) {
    if (!mem(c).offered) return;
    mem(c).offered = false;
    c.clearRules(`sit:${c.self.id}`);
    const spare = (c.player && c.player.energy) || 0;
    mem(c).accepted = spare > 0;
    if (spare <= 0) return;
    // Accepted: a Nerve's worth of rest, a Trick, and one more reason to stay.
    c.playerDraw(1);
    addCnt(c, 'stayed', 1, 3);
    c.say('You sit down for a moment.', 'warn');
    if (cnt(c, 'stayed') >= 3) {
      c.applyStatus(c.player, 'comfortable', 1);
      addCnt(c, 'stayed', -1, 3);
    }
  },

  moves: {
    'stay-awhile': {
      id: 'stay-awhile', name: 'Stay Awhile', intent: Intent.BUFF,
      tell: 'The chair is pushed a little closer, and turned to face you.',
      effect(c) {
        mem(c).offered = true;
        c.announceRule({
          id: `sit:${c.self.id}`,
          name: 'Sit Down?',
          text: 'End your turn with Nerve to spare and you sit: draw 1 Trick and gain 1 Stayed. Each Stayed gives Old Welcome 2 attack damage. At 3, you become Comfortable.',
        });
      },
    },
    'warm-welcome': {
      id: 'warm-welcome', name: 'Warm Welcome', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + 2 * cnt(c, 'stayed'),
      tell: 'The sign turns to face you, which is somehow the worst part.',
      effect(c) { hitPlayer(c, 7 + 2 * cnt(c, 'stayed')); },
    },
    'fluff-the-cushion': {
      id: 'fluff-the-cushion', name: 'Fluff the Cushion', intent: Intent.DEFEND,
      blockFn: (c) => 9 + (mem(c).accepted ? 5 : 0),
      tell: 'It makes the chair nicer. It is very hard to hold this against it.',
      effect(c) { c.block(c.self, 9 + (mem(c).accepted ? 5 : 0)); },
    },
  },

  nextMove: (c) => cyc(['stay-awhile', 'warm-welcome', 'fluff-the-cushion'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 8. Perfect Keeper — advanced adaptive (§11)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "A compact preview of the Heart's final philosophy. Every action is
 * interpreted as evidence that the system knows what the player needs." (§11.)
 *
 * THE ASSESSMENT IS LIVE, AND THAT IS THE MECHANIC. §11: "the intended response
 * is determined by the first qualifying threshold reached DURING the turn. The
 * intent updates immediately when that happens. The player can therefore
 * manipulate it." So `nextMove` reads the turn in progress and stays pure —
 * `refreshIntents` re-runs it as the player plays, and the silhouette on screen
 * changes under their hands. That is the enemy.
 */
export const perfectKeeper = {
  id: 'perfect-keeper',
  name: 'Perfect Keeper',
  region: REGION,
  tier: 'normal',
  role: 'adaptive',
  hp: [54, 54],
  silhouette: 'keeper-small',
  palette: ['#c9b79a', '#8a7355', '#efe9dd'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 2 },
  scale: 1.2,
  lore: 'Doors, blankets, food bowls, keys and polished wood assembled into something that means to look after you.',

  onPlayerTurnStart(c) {
    mem(c).guardGained = 0;
    mem(c).damageDone = 0;
  },

  /**
   * Guard the player raised this turn, which nothing else records.
   *
   * `onBoardEvent(c, ev)` — the event arrives as the SECOND argument and also
   * on `c.boardEvent`; it is not `c.event`, and a strict ctx throws on a field
   * no dispatch carries rather than quietly handing back undefined, which is
   * how that gets caught.
   */
  onBoardEvent(c, ev) {
    const e = ev || c.boardEvent || {};
    if (e.type === 'block' && e.actor && e.actor.side === 'player') {
      mem(c).guardGained = (mem(c).guardGained || 0) + (e.amount || 0);
    }
  },

  moves: {
    'you-need-shelter': {
      id: 'you-need-shelter', name: 'You Need Shelter', intent: Intent.DEFEND, block: 15,
      tell: 'It decides you have been out in it too long.',
      effect(c) { c.block(c.self, 15); },
    },
    'you-need-encouragement': {
      id: 'you-need-encouragement', name: 'You Need Encouragement', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'It decides you have been hiding.',
      effect(c) { hitPlayer(c, 13); },
    },
    'you-need-rest': {
      id: 'you-need-rest', name: 'You Need Rest', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      tell: 'It decides you have been doing too much.',
      effect(c) {
        hitPlayer(c, 7);
        costRule(c, {
          id: 'rest', name: 'You Need Rest',
          text: 'Your fourth Trick next turn costs 1 additional Nerve.',
          steps: [[4, 1]],
        });
        mem(c).restUntil = (c.turn || 0) + 1;
      },
    },
    'you-need-something': {
      id: 'you-need-something', name: 'You Need Something', intent: Intent.ATTACK_DEFEND,
      damage: 7, hits: 1, block: 8,
      tell: 'It cannot tell what you need, so it offers a little of everything.',
      effect(c) { c.block(c.self, 8); hitPlayer(c, 7); },
    },
    'check-again': {
      id: 'check-again', name: 'Check Again', intent: Intent.DEFEND, block: 7,
      tell: 'It starts the assessment over.',
      effect(c) {
        c.block(c.self, 7);
        mem(c).guardGained = 0;
        mem(c).damageDone = 0;
        clearCostRule(c, 'rest');
      },
    },
  },

  /**
   * Assess Need, resolve the response, Check Again, repeat (§11 Pattern).
   * The assessment reads the turn IN PROGRESS, so the intent moves while the
   * player is still playing — §11's "the player can therefore manipulate it".
   */
  nextMove: (c) => {
    if ((c.history || []).length % 2 === 1) return 'check-again';
    const dealt = c.self.damageTakenThisTurn || 0;
    const guarded = mem(c).guardGained || 0;
    const tricks = played(c).length;
    if (dealt >= 18) return 'you-need-shelter';
    if (guarded >= 15) return 'you-need-encouragement';
    if (tricks >= 5) return 'you-need-rest';
    return 'you-need-something';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Summoned objects
// ═════════════════════════════════════════════════════════════════════════════
/**
 * The Unknown Stone's "Someone Else Stayed" (§20) and the Keeper's phase two
 * both put one of these on the board. `remnant: true` is what the Housekeeper's
 * Tidy Up looks for; `summonOnly: true` keeps it out of hand-written formations
 * and is checked by tests/heart/check.py, the same way the Kitchens gates
 * Doughlings.
 */
export const memoryEcho = {
  id: 'memory-echo',
  name: 'Memory Echo',
  region: REGION,
  tier: 'normal',
  role: 'spawn',
  hp: [20, 20],
  silhouette: 'memory-animal',
  palette: ['#cfe4f0', '#93b6cd', '#4a6479'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 0.6,
  summonOnly: true,
  remnant: true,
  lore: 'A fainter outline than the Memory Animal, running a shorter circuit. Somebody else stayed here once.',

  moves: {
    'echo-pounce': {
      id: 'echo-pounce', name: 'Echo Pounce', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It remembers about half of being fast.',
      effect(c) { hitPlayer(c, 6); },
    },
    'echo-wait': {
      id: 'echo-wait', name: 'Echo Wait', intent: Intent.DEFEND, block: 5,
      tell: 'It waits by a door that is not there any more.',
      effect(c) { c.block(c.self, 5); },
    },
  },

  nextMove: (c) => cyc(['echo-pounce', 'echo-wait'], (c.history || []).length),
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

export const HEART_ENEMIES = [
  housekeeper, memoryAnimal, sanctuaryWarden, namekeeper,
  quietRoom, housePulse, oldWelcome, perfectKeeper,
  memoryEcho,
];

export { costRule, clearCostRule, lastDiscard, ordinal };
export const HEART_REGION = REGION;
