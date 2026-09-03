/**
 * The Kennelmaster — Kennels boss. OWNER: enemies.
 * Source of truth: docs/design/regions/15-kennels.md §17–§35, §45–§52.
 *
 * "It is not cruel looking. That is important." §17 is careful about this: the
 * Kennelmaster knows how to feed frightened animals, how to approach without
 * startling them, how to sit quietly beside one that does not trust people yet.
 * Its philosophy is:
 *
 *     If I cannot guarantee that you will be safe outside, then I cannot
 *     responsibly let you leave.
 *
 * ── WHAT THIS FIGHT WILL NOT DO ─────────────────────────────────────────────
 *
 * §25 is a design constraint, not flavour: "The Kennelmaster should NEVER attack
 * a Ward Animal. No boss mechanic should involve threatening to injure one if
 * the player fails." §26 goes further — ignoring the animals entirely costs the
 * player nothing except Trust, and at the phase transition every remaining
 * animal "is moved through open side doors into safe holding rooms".
 *
 * So there is no timer on the rescue, no failure state attached to it, and no
 * move in this file that targets an animal. The three Containment Systems are
 * the only things in the fight that touch them, and each one is a target the
 * player may simply choose not to spend a turn on.
 *
 * ── TRUST IS A REWARD FOR A THING THE FIGHT DOES NOT REQUIRE ────────────────
 *
 * §22 gives one Trust per animal the player personally frees, and §33 keeps it
 * paying all the way through phase two, where the animals are not even present:
 *
 *   1  your first Guard gain each turn is 2 higher
 *   2  its healing is 3 lower
 *   3  Outvoted — every containment action costs it 4 Courage, and every
 *      Restraint you break costs it 2 more
 *
 * §22 says why the third one reads the way it does: "The animals are not
 * attacking the Kennelmaster. They are simply refusing to cooperate."
 *
 * ── AND RESTRAINT IS FRICTION, NOT PROHIBITION ──────────────────────────────
 *
 * §29: "The player can still attack, defend, play long turns, use Nerve. The
 * system creates friction. It does not tell the player: you are not allowed to
 * play." Every Restraint band below is a cost or a reduction, and §30's Break
 * Free is deliberately satisfiable four different ways so that four different
 * decks can all get out of it.
 */

import { Intent } from '../schema.js';
/** The pool the phase thresholds below were authored against. They were
    compared against raw `hp`, so ANY multiplier on the pool moved the share
    of the fight each phase covers — and `partyHpScale` is x5.7 at four Kids,
    which would have put phase two out of reach entirely. The Drowned Matron
    proved it in solo on 2026-09-02: a x1.4 correction left her at 595/595,
    full health after 200 turns, twice. `phaseAt` is the shared helper. */
const BASE_HP = 440;
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, bossDmg, flag,
  isAlive, played, field, lastMove, phaseAt,} from '../enemies/_lib.js';
import { frighten } from '../enemies/kennels.js';

const REGION = 'kennels';

/* ══ the three Containment Systems (§18–§21) ════════════════════════════════ */

/**
 * One Containment System. Each holds one Ward Animal and gives the
 * Kennelmaster one passive; destroying it frees the animal AND removes the
 * passive permanently, which is what makes the rescue and the fight the same
 * decision rather than a detour.
 */
function system(id, name, hp, who, passive, lore) {
  return {
    id, name, region: REGION, tier: 'boss', role: 'bossPart', summonOnly: true,
    hp: [hp, hp],
    silhouette: id,
    palette: ['#6a6154', '#aaa08d', '#181510'],
    shape: { body: 'squat', limbs: 0, eyes: 2 },
    scale: 0.4,
    lore,
    onSpawn(c) { setCnt(c, 'fright', 0); },
    onDeath(c) {
      const boss = allies(c).find(a => a.defId === 'kennelmaster' && isAlive(a));
      if (!boss) return;
      const m = (boss.mem ||= {});
      m.trust = Math.min(3, (m.trust || 0) + 1);
      m.freedNames = [...(m.freedNames || []), who];
      c.say(`${who} is out, and does not look back at all.`, 'good');
    },
    moves: { hold: { id: 'hold', name: 'Secured', intent: Intent.SLEEP,
      tell: `While this holds, the Kennelmaster ${passive}. Break it and ${who} goes free, `
        + 'the passive goes with it permanently, and you gain 1 Trust for the whole fight. '
        + 'You are not required to, and nothing in this fight will hurt them.',
      effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'boss'); },
  };
}

/*
 * ONE HOUSE RULE PER FIGHT-SHAPED THING, NOT ONE PER BODY.
 *
 * The boss and its three Containment Systems each announced their own card, and
 * the screenshot of `kn-boss` had four of them stacked down the left with the
 * third clipped and the Kid's portrait underneath. Three fit; the fourth does
 * not. So the parts say what they do in their `tell` — which is where a player
 * looks when they hover the thing they are about to hit — and the body's rule
 * names them all.
 */

export const kennelGate = system('kennel-gate', 'Gate', 18, 'the grey dog',
  'gains 6 Guard at the start of its turn',
  'A tall wire gate with a spring closer, so it can never be left ajar by accident.');
export const collarDock = system('collar-dock', 'Collar Dock', 16, 'the long haired cat',
  'deals 3 more damage with every attack',
  'A rail of numbered hooks. Most of the hooks are empty and all of them are labelled.');
export const leadPost = system('lead-post', 'Lead Post', 16, 'the sooty bird',
  'gains 5 Guard the first time you play a fourth Trick each turn',
  'An iron post, worn smooth at one height by a great many leads.');

/* ══ the Kennelmaster ═══════════════════════════════════════════════════════ */
export const kennelmaster = {
  id: 'kennelmaster',
  name: 'The Kennelmaster',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [440, 440],
  silhouette: 'kennelmaster',
  palette: ['#4a4234', '#a99a78', '#141009'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.55,
  lore: 'A large supernatural caretaker in an old animal ward uniform, carrying keys, treats, medical supplies, leads, towels and a clipboard. Its coat pockets are full of little toys. Animals do not universally fear it. Some even like it.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.phaseStart = 0;
    m.trust = 0;
    m.freedNames = [];
    setCnt(c, 'restraint', 0);
    /* §30's "Think" condition — "draw at least 2 additional Tricks" — is the one
       the engine keeps no number for. `onCardsDrawn` is the seam the Secret
       Passages added for exactly this shape, and `reason` is what makes a draw
       ADDITIONAL. Owned by this actor, so it goes when it does. */
    c.addHook('onCardsDrawn', (h) => {
      if (h.reason === 'turnStart') return;
      mem(c).drew0 = (mem(c).drew0 || 0) + ((h.cards || []).length);
    });
    c.summon('kennel-gate');
    c.summon('collar-dock');
    c.summon('lead-post');
    announceMaster(c);
  },

  /**
   * §23's Leashed removal and §30's Break Free both settle HERE, at the top of
   * the turn, measuring the turn that just finished.
   *
   * The obvious place is `onPlayerTurnEnd` and it is the same trap the Bathhouse
   * found five times over: that hook fires after the intent is drawn and before
   * the enemy acts, so taking a Leashed stack off there would turn a committed
   * three-hit Kennel Sweep into two. Both meters now move where the player can
   * watch them move, a full turn before anything is promised on them.
   */
  onPlayerTurnStart(c) {
    const m = mem(c);
    settleFreedom(c);
    checkPhase(c);
    /* §22 Trust 1 and §33: the player's first Guard gain each turn is 2 higher.
       Kept as a status so the number is on the Kid where they can read it. */
    if (m.trust >= 1) c.applyStatus(c.player, 'trusted', 1);
    if (m.trust >= 3) c.applyStatus(c.self, 'outvoted', 1);
    m.moved = 0; m.pushed = 0; m.braced = 0; m.thought = 0;
    m.drew0 = 0;
    m.hpAtStart = c.self.hp;
    m.guard = 0;
    announceMaster(c);
  },

  /** §30's four Break Free conditions, all measured over one player turn. */
  onBoardEvent(c, ev) {
    if (!ev || ev.type !== 'block') return;
    if (!ev.actor || ev.actor.side !== 'player') return;
    mem(c).guard = (mem(c).guard || 0) + (ev.amount || 0);
  },

  onPlayerCard(c) { mem(c).moved = played(c).length; },

  /** §23's Guard payout, which is the one thing that genuinely belongs here. */
  onPlayerTurnEnd(c) {
    const stacks = c.count('leashed', c.player);
    if (stacks > 0) c.block(c.self, 3 * stacks);
    announceMaster(c);
  },

  onTurnStart(c) {
    if (mem(c).pendingTransition) return;
    if (systemAlive(c, 'kennel-gate')) c.block(c.self, 6);
  },

  onTurnEnd(c) {
    if (mem(c).pendingTransition) mem(c).pendingTransition = null;
    announceMaster(c);
  },

  onAllyDeath(c) { announceMaster(c); },

  moves: {
    /* ── phase one (§23) ─────────────────────────────────────────────────── */
    'check-the-gates': {
      id: 'check-the-gates', name: 'Check the Gates', intent: Intent.DEFEND, block: 6,
      tell: 'It walks the row and tries every one of them.',
      effect(c) {
        c.block(c.self, 6);
        for (const s of systemsOf(c)) c.block(s, 5);
        containmentCost(c);
        announceMaster(c);
      },
    },
    'lead-snap': {
      id: 'lead-snap', name: 'Lead Snap', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => masterDmg(c, 12),
      tell: 'A lead, doubled over, at exactly the right height.',
      effect(c) { hitPlayer(c, masterDmg(c, 12)); },
    },
    'treat-and-settle': {
      id: 'treat-and-settle', name: 'Treat and Settle', intent: Intent.BUFF,
      tell: 'It kneels down and does the thing it is genuinely good at.',
      effect(c) {
        /* §22 Trust 2 and §33: its healing is reduced by 3, minimum 0. */
        c.heal(c.self, Math.max(0, 7 - (mem(c).trust >= 2 ? 3 : 0)));
        const held = systemsOf(c)[0];
        if (held) { held.counters.fright = Math.max(0, (held.counters.fright || 0) - 1); }
        containmentCost(c);
        announceMaster(c);
      },
    },
    'stay-close': {
      id: 'stay-close', name: 'Stay Close', intent: Intent.DEBUFF,
      applies: [{ id: 'leashed', stacks: 1, to: 'player' }],
      tell: 'It clips something to you without looking up.',
      effect(c) {
        c.applyStatus(c.player, 'leashed', 1);
        containmentCost(c);
        announceMaster(c);
      },
    },
    'kennel-sweep': {
      id: 'kennel-sweep', name: 'Kennel Sweep', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => masterDmg(c, 5),
      /* §23's third hit at 2 or more Leashed. Leashed only changes at the end
         of the player's turn, which is after this intent was drawn, so the
         count the player reads is the count they get — see `sweepHits`. */
      hitsFn: (c) => sweepHits(c),
      tell: 'It moves down the row and everything in the way goes with it.',
      effect(c) { hitPlayer(c, masterDmg(c, 5), sweepHits(c)); },
    },

    /* ── the transition (§27) ────────────────────────────────────────────── */
    'everyone-back-to-their-rooms': {
      id: 'everyone-back-to-their-rooms', name: 'Everyone Back to Their Rooms',
      intent: Intent.BUFF,
      tell: 'It closes the kennel doors behind itself.',
      effect(c) {
        for (const s of systemsOf(c)) {
          c.say(`${s.name} opens, and whoever was in it goes somewhere safe.`, 'info');
          c.despawn(s);
        }
        c.removeStatus(c.player, 'leashed');
        setCnt(c, 'restraint', 0);
        c.say('It has stopped thinking of you as a visitor.', 'warn');
        announceMaster(c);
      },
    },

    /* ── phase two (§31) ─────────────────────────────────────────────────── */
    'catch-pole': {
      id: 'catch-pole', name: 'Catch Pole', intent: Intent.ATTACK, damage: 14, hits: 1,
      damageFn: (c) => masterDmg(c, 14),
      tell: 'A loop on a long handle, and it is very good with it.',
      effect(c) { hitPlayer(c, masterDmg(c, 14)); addRestraint(c, 1); },
    },
    'close-the-gate': {
      id: 'close-the-gate', name: 'Close the Gate', intent: Intent.DEFEND, block: 15,
      blockFn: (c) => 15 + (cnt(c, 'restraint') >= 2 ? 5 : 0),
      tell: 'It shuts something you did not know was open.',
      effect(c) { c.block(c.self, 15 + (cnt(c, 'restraint') >= 2 ? 5 : 0)); },
    },
    'gentle-but-firm': {
      id: 'gentle-but-firm', name: 'Gentle but Firm', intent: Intent.ATTACK, damage: 6, hits: 2,
      damageFn: (c) => masterDmg(c, 6),
      tell: 'Twice, and it apologises both times.',
      effect(c) {
        const before = c.player.hp;
        hitPlayer(c, masterDmg(c, 6), 2);
        /* §31: "If BOTH hits deal Courage damage, gain 1 Restraint." Guard is
           the whole answer to this one. */
        if (c.player.hp <= before - 2) addRestraint(c, 1);
      },
    },
    'back-in-your-bed': {
      id: 'back-in-your-bed', name: 'Back in Your Bed', intent: Intent.BUFF,
      tell: 'It puts everything back where it thinks it goes.',
      effect(c) {
        /* §34: at 90 or less it stops gaining Restraint here and the healing
           is disabled outright. */
        if (mem(c).phase < 3) {
          addRestraint(c, 1);
          c.heal(c.self, Math.max(0, 7 - (mem(c).trust >= 2 ? 3 : 0)));
        } else {
          c.block(c.self, 6);
          c.say('It reaches for the routine and the routine is not there any more.', 'good');
        }
        announceMaster(c);
      },
    },
    'keys-at-the-ready': {
      id: 'keys-at-the-ready', name: 'Keys at the Ready', intent: Intent.DEFEND, block: 8,
      tell: 'It takes the keys out, which is a mistake.',
      effect(c) {
        c.block(c.self, 8);
        mem(c).keys = 1;
        c.say('The next lead you get out of costs it 6 Courage.', 'good');
        announceMaster(c);
      },
    },
    'return-to-the-pen': {
      id: 'return-to-the-pen', name: 'Return to the Pen', intent: Intent.ATTACK_BIG,
      damage: 18, hits: 1, block: 14,
      damageFn: (c) => masterDmg(c, mem(c).trust >= 3 ? 14 : 18),
      tell: 'It picks you up the way it picks up anything that will not settle.',
      effect(c) {
        const trusted = mem(c).trust >= 3;
        hitPlayer(c, masterDmg(c, trusted ? 14 : 18));
        c.block(c.self, trusted ? 8 : 14);
        /* §34: in the last phase it clears the whole meter instead of two. */
        if (mem(c).phase >= 3) setCnt(c, 'restraint', 0);
        else addCnt(c, 'restraint', -2, 4, 0);
        announceMaster(c);
      },
    },

    /* ── the final escalation (§34) ──────────────────────────────────────── */
    'please-stay': {
      id: 'please-stay', name: 'Please Stay', intent: Intent.BUFF,
      tell: 'It is not an order any more.',
      effect(c) {
        c.say('It has stopped being able to make you.', 'good');
        announceMaster(c);
      },
    },
  },

  /** §24, §32 and §34's sequences. PURE — the step is derived, never incremented. */
  nextMove: (c) => {
    const m = mem(c);
    if (m.pendingTransition) return m.pendingTransition;
    if (m.phase >= 2 && cnt(c, 'restraint') >= 4) return 'return-to-the-pen';
    const step = (c.history || []).length - (m.phaseStart || 0);
    if (m.phase >= 2) {
      return cyc(['catch-pole', 'close-the-gate', 'gentle-but-firm', 'back-in-your-bed',
        'keys-at-the-ready'], step);
    }
    return cyc(['check-the-gates', 'lead-snap', 'stay-close', 'kennel-sweep',
      'treat-and-settle'], step);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.leashCap = 4;
      h.notes.push('Haunt 10: Leashed stacks to 4 rather than 3.');
    }
    return h;
  },
};

/* ══ the machinery ══════════════════════════════════════════════════════════ */

const systemsOf = (c) => allies(c).filter(a => isAlive(a)
  && ['kennel-gate', 'collar-dock', 'lead-post'].includes(String(a.defId)));
const systemAlive = (c, id) => allies(c).some(a => isAlive(a) && a.defId === id);

/** §20: the Collar Dock's damage bonus, in one place. */
/**
 * Every rider on a Kennelmaster attack, including the Haunt one.
 *
 * `bossDmg` is the whole of boss Haunt scaling above the flat +6% Courage:
 * +1 damage a hit every third level, deliberately per-hit so a multi-hit
 * finisher scales with its own shape. `_lib.js` states the contract — "Bosses
 * must apply this in BOTH their `damageFn` and their `effect`, or the intent
 * stops telling the truth" — and this boss applied it in NEITHER, so its own
 * Haunt notes promised a number it never delivered. Added here, in the one
 * helper both halves already share, because two expressions that must agree
 * will eventually not. `tests/boss-haunt/check.py` is the gate.
 */
function masterDmg(c, base) {
  return base + (systemAlive(c, 'collar-dock') ? 3 : 0) + bossDmg(c);
}

/** §23's third Kennel Sweep hit. */
function sweepHits(c) { return c.count('leashed', c.player) >= 2 ? 3 : 2; }

/**
 * §23 and §30, measured over the player turn that just ended. Called from
 * `onPlayerTurnStart` — see the note there for why not the other end.
 */
function settleFreedom(c) {
  const m = mem(c);
  if (m.hpAtStart == null) return;
  const dealt = m.hpAtStart - c.self.hp;
  const hits = [
    (m.moved || 0) >= 4,
    dealt >= 16,
    (m.guard || 0) >= 12,
    (m.drew0 || 0) >= 2,
  ].filter(Boolean).length;
  if (m.phase === 1) {
    /* §23: one stack, by ANY ONE of three conditions. */
    if (hits >= 1 && c.count('leashed', c.player) > 0) {
      c.applyStatus(c.player, 'leashed', -1);
      c.say('One lead comes off.', 'good');
    }
  } else if (hits >= 2 && cnt(c, 'restraint') > 0) {
    /* §30: TWO different conditions, once per turn. */
    breakRestraint(c);
  }
}

/**
 * §22 Trust 3: "Whenever it attempts a CONTAINMENT SPECIFIC action, lose 4
 * Courage. The animals are not attacking the Kennelmaster. They are simply
 * refusing to cooperate."
 */
function containmentCost(c) {
  if (mem(c).trust < 3) return;
  c.loseHp(c.self, 4);
  c.say('Nobody does what it asks.', 'good');
}

function addRestraint(c, n) {
  addCnt(c, 'restraint', n, 4, 0);
  applyRestraint(c);
}

/** §30 and §33 and §34's three payouts for getting free, stacked in that order. */
function breakRestraint(c) {
  addCnt(c, 'restraint', -1, 4, 0);
  applyRestraint(c);
  c.say('You get an arm free.', 'good');
  if (mem(c).keys) { mem(c).keys = 0; c.loseHp(c.self, 6); c.say('The keys go across the floor.', 'good'); }
  if (mem(c).trust >= 3) c.loseHp(c.self, 2);
  if (mem(c).phase >= 3) c.loseHp(c.self, 3);
}

/** §28's bands, as statuses on the Kid so the player can read them. */
function applyRestraint(c) {
  const r = cnt(c, 'restraint');
  if (r >= 2) c.applyStatus(c.player, 'held-fast', 1);
  else c.removeStatus(c.player, 'held-fast');
  if (r >= 3) c.applyStatus(c.player, 'gentle-restraint', 1);
}

function checkPhase(c) {
  const m = mem(c);
  if (m.phase === 1 && c.self.hp <= phaseAt(c, 250, BASE_HP)) {
    m.phase = 2;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'everyone-back-to-their-rooms';
    return;
  }
  if (m.phase === 2 && c.self.hp <= phaseAt(c, 90, BASE_HP)) {
    m.phase = 3;
    m.phaseStart = (c.history || []).length + 1;
    m.pendingTransition = 'please-stay';
  }
}

function announceMaster(c) {
  const m = mem(c);
  const trust = m.trust || 0;
  const trustLine = trust >= 3
    ? 'TRUST 3 — Outvoted: every containment action costs it 4 Courage, and every Restraint you break costs it 2 more.'
    : trust === 2 ? 'Trust 2 — its healing is 3 lower.'
      : trust === 1 ? 'Trust 1 — your first Guard gain each turn is 2 higher.'
        : 'Trust 0 — freeing an animal is worth one, for the whole fight.';
  if (m.phase >= 2) {
    const r = cnt(c, 'restraint');
    const band = r >= 4 ? 'it puts you back in the pen next turn'
      : r === 3 ? 'your fourth Trick costs 1 more Nerve'
        : r === 2 ? 'your first Guard gain each turn is 2 lower'
          : 'no passive effect yet';
    c.announceRule({
      id: `master:${c.self.id}`,
      name: `RESTRAINT ${r} / 4`,
      text: `At ${r}, ${band}. Meet TWO of these in one turn and one comes off: 4 Tricks, 16 damage, `
        + `12 Guard, or 2 extra Tricks drawn. ${trustLine}`
        + (m.phase >= 3 ? ' PLEASE STAY: nothing heals it, Back in Your Bed no longer restrains, and Return to the Pen clears the meter entirely.' : ''),
    });
    return;
  }
  const stacks = c.count('leashed', c.player);
  c.announceRule({
    id: `master:${c.self.id}`,
    name: `LEASHED ${stacks} / ${flag(c, 'leashCap', 3)}`,
    text: `It gains 3 Guard per stack at the end of your turn. Meet ANY ONE of these and one comes off: `
      + `4 Tricks, 16 damage to it, or 12 Guard. ${trustLine} `
      + 'The Gate is 6 Guard a turn, the Collar Dock is 3 damage on every attack, and the Lead Post '
      + 'is 5 Guard the first time you play a fourth Trick — break one and its animal goes free with it. '
      + 'Nothing in this fight will hurt them, and ignoring them entirely costs you nothing but the Trust.',
  });
}

/* ══ the boss's own statuses ════════════════════════════════════════════════ */
export const MASTER_STATUSES = [
  {
    /** §23. Leashed is Guard for the boss, and it is removable every single turn. */
    id: 'leashed', name: 'Leashed', kind: 'debuff', icon: 'leash',
    desc: 'On a lead. The Kennelmaster gains 3 Guard per stack at the end of your turn.',
    decay: 'never', stacks: true, max: 4,
  },
  {
    /** §22 Trust 1 and §33. */
    id: 'trusted', name: 'Trusted', kind: 'buff', icon: 'paw',
    desc: 'They chose to go with you. The first Guard you gain each turn is 2 higher.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => {
        if (!amt || h.owner?.side !== 'player' || h.owner._trustSpent) return amt;
        h.owner._trustSpent = true;
        return amt + 2;
      },
      onTurnStart: (h) => { if (h.owner) h.owner._trustSpent = false; },
    },
  },
  {
    /** §28 Restraint 2. The twin of Trusted, pulling the other way. */
    id: 'held-fast', name: 'Held Fast', kind: 'debuff', icon: 'catchpole',
    desc: 'The first Guard you gain each turn is 2 lower.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyBlockGain: (amt, h) => {
        if (!amt || h.owner?.side !== 'player' || h.owner._heldSpent) return amt;
        h.owner._heldSpent = true;
        return Math.max(0, amt - 2);
      },
      onTurnStart: (h) => { if (h.owner) h.owner._heldSpent = false; },
    },
  },
  {
    /** §22 Trust 3, as a chip on the boss so the player can see it landed. */
    id: 'outvoted', name: 'Outvoted', kind: 'debuff', icon: 'paw',
    desc: 'Nobody in this room does what it says any more. Every containment action costs it 4 Courage.',
    decay: 'never', stacks: false, max: 1,
  },
];

export const MASTER_BOSSES = [kennelmaster, kennelGate, collarDock, leadPost];
