/**
 * The Butler — Forgotten Foyer region boss. OWNER: enemies.
 * Source of truth: docs/design/regions/01-foyer.md §14–§23.
 *
 * He is impossibly polite even while attacking. His fight is built on House Rules:
 * announcements that NEVER forbid an action, only attach a consequence. Breaking one
 * costs you something AND makes him Flustered — and three Flustered makes him
 * Discomposed, which is the player's best offensive window in the region.
 *
 * That inversion is the whole boss. "Breaking rules is not simply failure. It is a
 * strategic option."
 *
 *   Phase 1  250 → 141   one rule at a time, never the same twice running.
 *   Transition at ≤140   This Is Most Irregular: 16 Guard, dismisses every summon.
 *   Phase 2  140 → 0     harsher Reprimands, but Discomposed at 2 Flustered, not 3.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, countMoves, hitPlayer,
  hauntBase, flag, announce, isAlive, played,
} from '../enemies/_lib.js';

const PHASE2_AT = 140;

// ── The four House Rules ─────────────────────────────────────────────────────
/**
 * Each returns a HouseRule (see _lib.js). `phase2` selects the harsher Reprimand.
 * The consequence always fires at most once per player turn and never blocks an action.
 */
export const HOUSE_RULES = {
  'no-running': (p2) => ({
    id: 'no-running',
    name: 'GUESTS DO NOT RUSH',
    text: `Playing a fourth Trick this turn breaks the rule. Reprimand: ${p2 ? 8 : 6} damage.`,
    when: 'cardPlayed', once: true,
    broken: (rc) => (rc.cardsPlayedThisTurn || []).length >= 4,
    onBreak: (c) => hitPlayer(c, p2 ? 8 : 6),
  }),
  'one-at-a-time': (p2) => ({
    id: 'one-at-a-time',
    name: 'GUESTS WAIT THEIR TURN',
    text: `Playing two Tricks of the same type in a row breaks the rule. Reprimand: The Butler gains ${p2 ? 10 : 8} Guard.`,
    when: 'cardPlayed', once: true,
    broken: (rc) => {
      const h = rc.cardsPlayedThisTurn || [];
      return h.length >= 2 && h[h.length - 1]?.type === h[h.length - 2]?.type;
    },
    onBreak: (c) => c.block(c.self, p2 ? 10 : 8),
  }),
  'keep-the-hall-clear': (p2) => ({
    id: 'keep-the-hall-clear',
    name: 'GUESTS DO NOT CLUTTER THE HALL',
    text: `Ending your turn with 18 or more Guard breaks the rule. Reprimand: The Butler gains ${p2 ? 12 : 10} Guard.`,
    when: 'turnEnd', once: true,
    broken: (rc) => (rc.playerBlock || 0) >= 18,
    onBreak: (c) => c.block(c.self, p2 ? 12 : 10),
  }),
  'no-roughhousing': (p2) => ({
    id: 'no-roughhousing',
    name: 'GUESTS DO NOT ROUGHHOUSE',
    text: `Dealing 20 or more damage this turn breaks the rule. Reprimand: his next damaging attack deals ${p2 ? 7 : 5} more.`,
    when: 'turnEnd', once: true,
    broken: (rc) => (rc.damageDealtThisTurn || 0) >= 20,
    onBreak: (c) => { mem(c).retaliation = (mem(c).retaliation || 0) + (p2 ? 7 : 5); },
  }),
};

const RULE_IDS = Object.keys(HOUSE_RULES);

export const butler = {
  id: 'butler',
  name: 'The Butler',
  region: 'foyer',
  tier: 'boss',
  role: 'boss',
  hp: [250, 250],
  silhouette: 'butler',
  palette: ['#14161d', '#2c3140', '#e9e4d4'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 1.5,
  lore: 'One of the oldest extensions of the house. His job is to decide who belongs inside, and his definition of hospitality has quietly become permanent.',

  phases: 2,
  phaseThresholds: [PHASE2_AT],

  onSpawn(c) {
    setCnt(c, 'flustered', 0);
    mem(c).phase = 1;
    mem(c).ruleHistory = [];
    mem(c).retaliation = 0;
    // Haunt 10: he opens with a rule already standing, so Formal Welcome is no longer free.
    if (flag(c, 'openWithRule')) butler.announceNext(c);
  },

  phase(c) { return mem(c).phase || 1; },
  flusterThreshold(c) { return butler.phase(c) >= 2 ? 2 : 3; },

  /**
   * Announce the standing House Rule(s).
   *
   * Phase one: ONE rule at a time, never the same one twice running. You choose which
   * single line to cross, and crossing it is cheap — Flustered is a resource you farm
   * toward a Discomposed window you picked the timing of.
   *
   * Phase two: TWO rules stand at once, and the Discomposed threshold is 2 instead of 3.
   * That inverts the read completely. With two lines on the board almost every strong
   * turn crosses one, so Flustered stops being something you accumulate on purpose and
   * becomes something you have to steer around — the question flips from "which rule do
   * I break for value?" to "which rule can I still afford to respect?". A careless burst
   * turn now crosses both at once and hands him the Discomposed recovery on his terms.
   *
   * The engine keeps every announced rule standing until it is cleared (rules are only
   * replaced by id), so his previous rules must be cleared explicitly or he would
   * silently accumulate all four and enforce them simultaneously from turn four onward.
   */
  announceNext(c) {
    if (c.has('discomposed', c.self)) return;          // he cannot enforce while Discomposed
    const hist = mem(c).ruleHistory || (mem(c).ruleHistory = []);
    const p2 = butler.phase(c) >= 2;
    const count = p2 ? 2 : 1;
    const prev = [].concat(hist[hist.length - 1] || []);

    // Never re-announce the identical set. With four rules there is always another.
    let picked = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const avail = RULE_IDS.slice();
      picked = [];
      for (let i = 0; i < count && avail.length; i++) picked.push(avail.splice(c.rng.int(avail.length), 1)[0]);
      const same = picked.length === prev.length && picked.every(r => prev.includes(r));
      if (!same) break;
    }

    hist.push(p2 ? picked.slice() : picked[0]);
    c.clearRules();                                     // drop the standing set first
    for (const id of picked) announce(c, HOUSE_RULES[id](p2));
  },

  /** How many House Rules he is enforcing right now. Phase one 1, phase two 2. */
  standingRules(c) { return butler.phase(c) >= 2 ? 2 : 1; },

  /** Engine hook: any House Rule of his was broken this turn. */
  onRuleBroken(c) {
    const n = addCnt(c, 'flustered', 1, 9);
    if (n >= butler.flusterThreshold(c)) {
      setCnt(c, 'flustered', 0);
      c.applyStatus(c.self, 'discomposed', 1);
      c.clearRules(c.self.uid ?? c.self.id);
      mem(c).collectHimself = true;      // his next action is wasted collecting himself
    }
  },

  /** Announced at the beginning of each player turn once he is in phase two. */
  onPlayerTurnStart(c) {
    if (butler.phase(c) >= 2 && !c.has('discomposed', c.self)) butler.announceNext(c);
  },

  /** Apply and clear the No Roughhousing retaliation rider. */
  strike(c, dmg, hits = 1) {
    const bonus = mem(c).retaliation || 0;
    mem(c).retaliation = 0;
    hitPlayer(c, dmg + bonus, hits);
  },
  strikeDisplay(c, dmg) { return dmg + (mem(c).retaliation || 0); },

  moves: {
    // ── phase one ────────────────────────────────────────────────────────────
    'formal-welcome': {
      id: 'formal-welcome', name: 'Formal Welcome', intent: Intent.DEFEND, block: 12,
      tell: 'He bows exactly as far as is correct, and not one degree further.',
      effect(c) { c.block(c.self, 12); butler.announceNext(c); },
    },
    'walking-stick': {
      id: 'walking-stick', name: 'Walking Stick', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'He adjusts his gloves.',
      damageFn: (c) => butler.strikeDisplay(c, 10),
      effect(c) { butler.strike(c, 10); butler.announceNext(c); },
    },
    'dust-them-off': {
      id: 'dust-them-off', name: 'Dust Them Off', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'He produces a cloth and begins, briskly, to tidy you.',
      damageFn: (c) => butler.strikeDisplay(c, 5),
      hitsFn: () => 2,
      effect(c) { butler.strike(c, 5, 2); butler.announceNext(c); },
    },
    'service-please': {
      id: 'service-please', name: 'Service, Please', intent: Intent.SUMMON,
      tell: 'He rings for assistance without once looking away from you.',
      summons: [{ enemyId: 'dust-bunny', hp: 12 }],
      effect(c) {
        const other = allies(c)[0];
        if (!other) c.summon('dust-bunny', { hp: 12 });
        // DEVIATION from the design doc, for intent honesty: the doc gives the standing
        // ally 8 Guard AND 1 Roused. The Butler is slot 0 and his summons sit behind him,
        // so a Roused handed out here always lands on an ally whose attack number is
        // already on screen — the player then takes 2 more than promised. He gives Guard
        // alone until the engine can arm a buff between the enemy phase and the intent
        // refresh. Roused itself is untouched and still lives on Calling Bell, which acts
        // last in every formation it appears in and is therefore honest. See docs/NOTES.md.
        else c.block(other, 8);
        butler.announceNext(c);
      },
    },
    'collect-himself': {
      id: 'collect-himself', name: 'Collect Himself', intent: Intent.DEFEND, block: 12,
      tell: 'He straightens his cuffs with slightly unsteady hands. This is your window.',
      effect(c) { c.block(c.self, 12); mem(c).collectHimself = false; },
    },

    // ── transition ───────────────────────────────────────────────────────────
    'this-is-most-irregular': {
      id: 'this-is-most-irregular', name: 'This Is Most Irregular', intent: Intent.DEFEND, block: 16,
      tell: 'His jacket has come open. He has noticed. He is not pleased.',
      phaseTransition: 2,
      effect(c) {
        c.block(c.self, 16);
        // Orders every summoned ordinary enemy away. His own debuffs stay.
        for (const a of allies(c)) if (a.summoned || a.summonedBy) c.despawn(a);
        mem(c).phase = 2;
      },
    },

    // ── phase two ────────────────────────────────────────────────────────────
    'remove-the-intruder': {
      id: 'remove-the-intruder', name: 'Remove the Intruder', intent: Intent.ATTACK, damage: 7, hits: 3,
      tell: 'He takes hold of you the way one takes hold of a stray animal.',
      damageFn: (c) => butler.strikeDisplay(c, 7),
      hitsFn: () => 3,
      effect(c) { butler.strike(c, 7, 3); },
    },
    'enough-of-this': {
      id: 'enough-of-this', name: 'Enough of This', intent: Intent.ATTACK_BIG, damage: 15, hits: 1, block: 6,
      tell: 'For the first time all evening, he raises his voice.',
      damageFn: (c) => butler.strikeDisplay(c, 15),
      effect(c) { butler.strike(c, 15); c.block(c.self, 6); },
    },
    'restore-order': {
      id: 'restore-order', name: 'Restore Order', intent: Intent.DEFEND_BUFF, block: 14,
      tell: 'He puts one thing back exactly where it belongs. He looks calmer for it.',
      effect(c) {
        c.block(c.self, 14);
        // Removes one ordinary negative effect. Never a Companion signature resource —
        // Haunt and the like are the Companion's central mechanic and must survive.
        if (typeof c.removeWorstStatus === 'function') c.removeWorstStatus(c.self, { protectSignature: true });
        else c.removeStatus(c.self, 'weak');
      },
    },
  },

  nextMove(c) {
    const hp = c.self.hp ?? 0;
    const phase = butler.phase(c);
    const hist = c.history || [];

    // Phase transition pre-empts everything, exactly once.
    if (phase === 1 && hp <= PHASE2_AT && !hist.includes('this-is-most-irregular')) {
      return 'this-is-most-irregular';
    }
    // Discomposed: he spends the action putting himself back together.
    if (mem(c).collectHimself) return 'collect-himself';

    if (phase === 1) {
      // Formal Welcome, Walking Stick, then repeat [Dust Them Off, Service Please, Walking Stick].
      const p1 = hist.filter(m => m !== 'collect-himself');
      if (p1.length === 0) return 'formal-welcome';
      if (p1.length === 1) return 'walking-stick';
      return cyc(['dust-them-off', 'service-please', 'walking-stick'], p1.length - 2);
    }

    // Phase two: Remove the Intruder, Restore Order, Enough of This, Remove the Intruder.
    const p2 = countMoves(c, ['remove-the-intruder', 'restore-order', 'enough-of-this']);
    return cyc(['remove-the-intruder', 'restore-order', 'enough-of-this', 'remove-the-intruder'], p2);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 10) {
      h.flags.openWithRule = true;
      h.notes.push('Haunt 10: he begins combat with a House Rule already active, so Formal Welcome no longer gives an unrestricted opening turn.');
    }
    return h;
  },
};

export const FOYER_BOSSES = [butler];
