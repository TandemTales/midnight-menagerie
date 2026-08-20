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
 *   Phase 1  165 → 93    one rule at a time, never the same twice running.
 *   Transition at ≤92    This Is Most Irregular: 16 Guard, dismisses every summon.
 *   Phase 2  92 → 0      harsher Reprimands, but Discomposed at 2 Flustered, not 3.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, countMoves, hitPlayer,
  hauntBase, flag, announce, isAlive, played,
} from '../enemies/_lib.js';

/**
 * BALANCE 2026-08-20: Courage 250 -> 165, phase two at 140 -> 92 (the same
 * 56% of the pool).
 *
 * 250 was measured for the first time against a deck a player actually brings
 * to this door — ~16 Tricks, one upgrade, five Keepsakes, arriving at a median
 * 46 of 68 Courage. That deck puts out ~13 Courage a turn net of his Guard and
 * takes ~4 a turn from him, so 250 needed 20+ turns and paid for 11. Both bots
 * won 15% of the time; the brief asks for 8-12 turns and 45-65%.
 *
 * The Courage pool was the wrong number, not the damage: he is not dangerous,
 * he is long. Sweeping the pool against captured pre-boss loadouts (48 fights
 * per step, tests/critic-design/sweep.py) put the fight in the target band at
 * 0.65x — 10.3 turns mean, 9 median, and 42% overall which is ~65% among the
 * runs that arrive in reasonable shape. See docs/NOTES.md for the table.
 */
const PHASE2_AT = 92;

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
  /**
   * BALANCE 2026-08-20 — thresholds lowered from 18 Guard and 20 damage.
   *
   * Both were *unreachable* by the deck that actually fights him. Measured over
   * 24 boss fights with real drafted Foyer decks: `keep-the-hall-clear` broke
   * 0 times and `no-roughhousing` broke 0 times. With 3 Pluck and a starter
   * Guard card worth 5, ending a turn on 18 needs four of them; and 20 damage
   * sits one point above three Scratches, which is the whole turn. Two of the
   * boss's four House Rules were therefore dead content, and Flustered — the
   * resource the entire fight is built to let you farm — averaged 1.4 breaks
   * and 0.46 Discomposed per fight.
   *
   * 12 Guard is two Guard cards. 15 damage is two Scratches and a cheap one.
   * Both are now lines an ordinary turn crosses, which is the point: the rule
   * has to cost you something real to respect, or respecting it is not a
   * decision.
   */
  'keep-the-hall-clear': (p2) => ({
    id: 'keep-the-hall-clear',
    name: 'GUESTS DO NOT CLUTTER THE HALL',
    text: `Ending your turn with 12 or more Guard breaks the rule. Reprimand: The Butler gains ${p2 ? 12 : 10} Guard.`,
    when: 'turnEnd', once: true,
    broken: (rc) => (rc.playerBlock || 0) >= 12,
    onBreak: (c) => c.block(c.self, p2 ? 12 : 10),
  }),
  /**
   * BALANCE 2026-08-20 (round 2): back to the plain `rc.damageDealtThisTurn`.
   *
   * This rule could not fire at ANY threshold until today: the stat was
   * declared on `CombatEngine`, zeroed every turn, and never written, because
   * `damage.js` did not touch `engine.stats`. The Butler counted hits on
   * himself as a stand-in. The engine owner has since made the stat real, so
   * the workaround is gone — note the semantics widened with it, from "damage
   * put into the Butler" to "damage dealt to anything", which is what the rule
   * text has always said and which makes his summoned Dust Bunny a way to trip
   * the rule by accident.
   */
  'no-roughhousing': (p2) => ({
    id: 'no-roughhousing',
    name: 'GUESTS DO NOT ROUGHHOUSE',
    text: `Dealing 15 or more damage this turn breaks the rule. Reprimand: his next damaging attack deals ${p2 ? 7 : 5} more.`,
    when: 'turnEnd', once: true,
    broken: (rc) => (rc.damageDealtThisTurn || 0) >= 15,
    /**
     * Armed for the NEXT telegraphed attack, not the one already on screen.
     *
     * This rule is evaluated at turnEnd, which the engine runs at the top of endTurn —
     * after the player has committed and after his intent number is fixed, but before he
     * swings. Adding the rider straight to `retaliation` therefore made him hit for 15
     * from an intent that promised 10. It banks into `retaliationPending` instead and
     * promotes at his own turn end, so the boost is visible on the intent that carries it.
     * (Only reachable at all since the engine started maintaining damageDealtThisTurn.)
     */
    onBreak: (c) => { mem(c).retaliationPending = (mem(c).retaliationPending || 0) + (p2 ? 7 : 5); },
  }),

  /**
   * The fifth rule (design doc §30, "The Butler may gain a fifth rare House Rule").
   * Unlocked at Haunt 8 and never before.
   *
   * The other four all punish doing too MUCH — too many Tricks, too much Guard, too
   * much damage, the same type twice. This one punishes doing too little, so it is the
   * first rule that cannot be respected by simply slowing down. Standing beside NO
   * RUNNING in phase two it closes the safe band to exactly two or three Tricks a turn,
   * which is the tightest sequencing constraint in the region.
   *
   * Its Reprimand is Clutter rather than damage or Guard: a fifth flavour of
   * consequence, it ties the boss back to the Foyer's own deck-interference thread, and
   * unlike a heal it makes the fight harder without making it longer.
   */
  'no-dawdling': (p2) => ({
    id: 'no-dawdling',
    name: 'GUESTS DO NOT DAWDLE',
    text: `Ending your turn having played fewer than two Tricks breaks the rule. `
        + `Reprimand: ${p2 ? 2 : 1} Clutter into your discard pile.`,
    when: 'turnEnd', once: true,
    broken: (rc) => (rc.cardsPlayedThisTurn || []).length < 2,
    onBreak: (c) => { for (let i = 0; i < (p2 ? 2 : 1); i++) c.addCard('clutter', 'discard'); },
  }),
};

/** The four he always knows. The fifth is Haunt 8 only — see rulePool(). */
const RULE_IDS = ['no-running', 'one-at-a-time', 'keep-the-hall-clear', 'no-roughhousing'];

export const butler = {
  id: 'butler',
  name: 'The Butler',
  region: 'foyer',
  tier: 'boss',
  role: 'boss',
  hp: [165, 165],
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
    mem(c).retaliationPending = 0;
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
    const pool = butler.rulePool(c);
    let picked = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const avail = pool.slice();
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

  /** The rules available to him. Haunt 8 adds GUESTS DO NOT DAWDLE. */
  rulePool(c) {
    return flag(c, 'fifthRule') ? RULE_IDS.concat('no-dawdling') : RULE_IDS;
  },

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

  /**
   * Close the Discomposed window.
   *
   * `discomposed` is `decay: 'never'` so it can span a player turn — the status
   * decay buckets all fire inside the enemy phase, so any of them would have
   * expired it before the player ever got to swing (and did: it was measurably
   * worth zero). He clears it himself on the first of his own turns AFTER the
   * one he wasted collecting himself, which makes the window exactly one full
   * player turn: break the third rule, watch him tidy his cuffs, then hit him
   * for 25% more.
   */
  onTurnEnd(c) {
    const m = mem(c);
    if (!c.has('discomposed', c.self)) return;
    if (m.windowTurn != null && c.turn > m.windowTurn) {
      c.removeStatus(c.self, 'discomposed');
      m.windowTurn = null;
    }
  },

  /** Promote a Reprimand banked this turn so the NEXT intent shows it. */
  onTurnEnd(c) {
    const pending = mem(c).retaliationPending || 0;
    if (pending) {
      mem(c).retaliation = (mem(c).retaliation || 0) + pending;
      mem(c).retaliationPending = 0;
    }
  },

  /**
   * Apply and clear the No Roughhousing retaliation rider.
   *
   * BALANCE 2026-08-20: the rider used to be added to **every hit**, so "his
   * next damaging attack deals 5 more" was +10 on Dust Them Off (5×2) and +15
   * on Remove the Intruder (7×3) — a telegraphed 21 arriving as 36. It never
   * showed up before because the rule that arms it could not fire at all (see
   * the note on `no-roughhousing`); the moment it could, the boss started
   * one-shotting people. The rider is now spread across the hits, rounded up,
   * so a 3-hit attack takes +6 rather than +15 — and, just as important, the
   * per-hit number stays uniform so `damageFn × hitsFn` remains exactly what
   * the player is about to take.
   */
  perHitBonus(c, hits = 1) {
    const bonus = mem(c).retaliation || 0;
    return bonus > 0 ? Math.ceil(bonus / Math.max(1, hits)) : 0;
  },
  strike(c, dmg, hits = 1) {
    const per = butler.perHitBonus(c, hits);
    mem(c).retaliation = 0;
    hitPlayer(c, dmg + per, hits);
  },
  strikeDisplay(c, dmg, hits = 1) { return dmg + butler.perHitBonus(c, hits); },

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
      damageFn: (c) => butler.strikeDisplay(c, 5, 2),
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
      // BALANCE 2026-08-20: 12 Guard -> 6, and the Discomposed window is opened
      // here rather than expiring unseen. The turn he spends putting himself
      // back together is advertised to the player as their opening; handing him
      // 12 Guard on it made the window worth roughly nothing.
      id: 'collect-himself', name: 'Collect Himself', intent: Intent.DEFEND, block: 6,
      tell: 'He straightens his cuffs with slightly unsteady hands. This is your window.',
      effect(c) {
        c.block(c.self, 6);
        mem(c).collectHimself = false;
        mem(c).windowTurn = c.turn;      // Discomposed survives into the NEXT player turn
      },
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
      damageFn: (c) => butler.strikeDisplay(c, 7, 3),
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
    if (level >= 8) {
      h.flags.fifthRule = true;
      h.notes.push('Haunt 8: gains a fifth House Rule, GUESTS DO NOT DAWDLE (design doc §30) — the '
        + 'first one that punishes playing too little, so slowing down stops being a safe answer.');
    }
    if (level >= 10) {
      h.flags.openWithRule = true;
      h.notes.push('Haunt 10: he begins combat with a House Rule already active, so Formal Welcome no longer gives an unrestricted opening turn.');
    }
    return h;
  },
};

export const FOYER_BOSSES = [butler];
