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
  hauntBase, flag, announce, isAlive, played, bossDmg,
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
  /**
   * BALANCE 2026-08-28: the Reprimand was +8/10 GUARD. It is now damage that
   * ignores Guard.
   *
   * Measured over 24 boss fights with real pre-boss loadouts: this is the most
   * broken rule in the fight by a distance, 1.75 breaks per fight against
   * no-roughhousing's 0.92 and no-running's 0.13 — and **68% of every Reprimand
   * he collected paid him in Guard**. His effective Courage pool measured 201
   * against a printed 165, because 35.8 of the damage the player found went
   * into Guard rather than into him. That is the arithmetic behind "he is not
   * dangerous, he is long": the fight's central mechanic, the one the player is
   * invited to trip on purpose, was paying him in LENGTH.
   *
   * The trigger and the fiction are untouched — he still objects to you taking
   * two turns in a row, he just stops being safer for it. Ignoring Guard is
   * what makes it distinct from GUESTS DO NOT RUSH, which deals ordinary
   * damage: the deck that shrugs off a flat 6 is precisely the defensive deck
   * that breaks this rule, and it should not be able to pay for the
   * interruption with Guard it was keeping anyway.
   *
   * DEVIATION from docs/design/regions/01-foyer.md §17, which specifies 8
   * Guard. Recorded here rather than absorbed. The chapter's reasoning for the
   * Guard Reprimands ("they simply give the Butler additional protection in
   * exchange") is exactly the exchange the measurement says is wrong.
   */
  'one-at-a-time': (p2) => ({
    id: 'one-at-a-time',
    name: 'GUESTS WAIT THEIR TURN',
    text: `Playing two Tricks of the same type in a row breaks the rule. Reprimand: ${p2 ? 7 : 5} damage, ignoring Guard.`,
    when: 'cardPlayed', once: true,
    broken: (rc) => {
      const h = rc.cardsPlayedThisTurn || [];
      return h.length >= 2 && h[h.length - 1]?.type === h[h.length - 2]?.type;
    },
    // No explicit target: the engine pins a Reprimand's ctx to the Kid who
    // broke it, so this reaches them and nobody else (foyer §26).
    onBreak: (c) => c.damage(p2 ? 7 : 5, { pierce: true }),
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
    /**
     * BALANCE 2026-08-28: he gained 10/12 Guard; he now tidies 10/12 of YOURS
     * away. The same number, moved from his side of the board to the player's.
     *
     * Damage would have been the wrong answer here and it is worth saying why:
     * this rule fires at turn END on a player sitting behind 12+ Guard, so
     * damage is exactly what they have already paid for. Removing the Guard is
     * the consequence that lands — it strips the wall the instant before he
     * swings, which is the same threat expressed against the deck that
     * actually breaks the rule.
     *
     * It is also the more faithful reading of the name. He does not brace
     * himself when the hall is cluttered; he clears it.
     *
     * DEVIATION from foyer §18 (10 Guard to him), same reasoning as §17 above.
     */
    text: `Ending your turn with 12 or more Guard breaks the rule. Reprimand: he tidies ${p2 ? 12 : 10} of your Guard away.`,
    when: 'turnEnd', once: true,
    broken: (rc) => (rc.playerBlock || 0) >= 12,
    // `c.player` is the Kid who broke it — the engine pins a Reprimand's ctx
    // to the breaker, so this reaches them and nobody else (foyer §26).
    onBreak: (c) => c.loseBlock(c.player, p2 ? 12 : 10, 'reprimand'),
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
    mem(c).flusteredTurn = {};          // seat -> turn, one Flustered per Kid per round
    // Haunt 10: he opens with a rule already standing, so Formal Welcome is no longer free.
    if (flag(c, 'openWithRule')) butler.announceNext(c);
  },

  phase(c) { return mem(c).phase || 1; },

  /**
   * How much Flustered makes him Discomposed. Solo: 3, then 2 in phase two.
   *
   * "With multiple players: phase one requires 2 plus number of players
   * Flustered. Phase two requires 1 plus number of players. For example, with
   * two players: phase one threshold is 4, phase two is 3. This prevents a four
   * player party from instantly forcing Discomposed every round."
   * (docs/design/regions/01-foyer.md §28.)
   *
   * The formula reproduces the solo numbers exactly at one player, so there is
   * no separate single-player branch — the same arithmetic all the way down.
   */
  flusterThreshold(c) {
    const n = typeof c.partySize === 'function' ? Math.max(1, c.partySize()) : 1;
    return butler.phase(c) >= 2 ? 1 + n : 2 + n;
  },

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

  /**
   * Engine hook: one of his House Rules was broken — by ONE Kid, who is
   * `c.player`. The engine judges every rule seat by seat and resolves the
   * Reprimand inside the breaker's seat (see `_checkRules`).
   *
   * "Each player can generate at most 1 Flustered per round." (§28.) Without
   * that cap a two-Kid party in phase two, where two rules stand at once, can
   * hand him four Flustered in a single round off one careless burst turn and
   * force Discomposed every round for free — which is the exact failure the
   * higher thresholds exist to prevent, arriving by the other door.
   *
   * The cap is NOT party-only, because solo is a party of one everywhere else
   * in this build and a second code path here would be the thing that rots. It
   * does change the solo boss: phase two stands two rules at once, so a burst
   * turn used to hand him 2 Flustered against a threshold of 2 and open the
   * window every single turn. Measured either way at scale 1.0 before it
   * shipped — see docs/notes/2026-08-26-multiplayer-bosses.md.
   *
   * The Reprimand itself is NOT capped. Break three rules and you take three
   * consequences; you just do not get three Flustered for it.
   */
  onRuleBroken(c) {
    const seat = c.player && c.player.side === 'player' ? c.player.seat : 0;
    const m = mem(c);
    const seen = m.flusteredTurn || (m.flusteredTurn = {});
    if (seen[seat] === c.turn) return;
    seen[seat] = c.turn;

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

  /** Roused armed by Service, Please lands here, after every enemy has acted. */
  onEnemyPhaseEnd(c) {
    if (!mem(c).rousePending) return;
    mem(c).rousePending = 0;
    const other = allies(c)[0];
    if (other) c.applyStatus(other, 'roused', 1);
  },

  /**
   * His own turn end does TWO things, and it used to do neither reliably: this
   * def declared `onTurnEnd` twice, and in a JS object literal the second key
   * silently wins. The Discomposed half below was dead for the whole build —
   * `discomposed` is `decay: 'never'`, so once he became Discomposed he STAYED
   * Discomposed: permanently taking 25% more, and permanently unable to
   * announce another House Rule (`announceNext` refuses while Discomposed), so
   * the Flustered economy the entire boss is built on shut down the first time
   * the player won it. `tests/dup-keys/check.py` now gates the class.
   *
   * 1. Close the Discomposed window. The decay buckets all fire inside the
   *    enemy phase, so any of them would have expired it before the player got
   *    to swing. He clears it himself on the first of his own turns AFTER the
   *    one he wasted collecting himself, which makes the window exactly one
   *    full player turn: break the last rule, watch him tidy his cuffs, then
   *    hit him for 25% more.
   * 2. Promote a Reprimand banked this turn so the NEXT intent shows it.
   */
  onTurnEnd(c) {
    const m = mem(c);
    if (c.has('discomposed', c.self) && m.windowTurn != null && c.turn > m.windowTurn) {
      c.removeStatus(c.self, 'discomposed');
      m.windowTurn = null;
    }
    const pending = m.retaliationPending || 0;
    if (pending) {
      m.retaliation = (m.retaliation || 0) + pending;
      m.retaliationPending = 0;
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
    // bossDmg is the Haunt pressure axis: bosses stopped growing in Courage at round 4,
    // so they buy their difficulty back per hit instead of per turn.
    return (bonus > 0 ? Math.ceil(bonus / Math.max(1, hits)) : 0) + bossDmg(c);
  },
  /**
   * Every living seat except the one this move is aimed at.
   *
   * Solo answers an empty array, so a move that splashes onto "everyone else"
   * is exactly the move it always was for one Kid.
   */
  bystanders(c) {
    const aim = c.player;
    const all = typeof c.players === 'function' ? c.players() : [];
    return all.filter(pl => pl && pl !== aim && pl.alive);
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
      // MULTIPLAYER: the Kid who is not braced. The region already teaches this
      // preference with Dust Bunny's Tumble (foyer §26), and it is the half of
      // co-op scaling that is not Courage. Ties break on seat index, never the
      // RNG — the arrow is on screen before anybody commits.
      partyPick: 'lowestGuard',
      tell: 'He adjusts his gloves.',
      damageFn: (c) => butler.strikeDisplay(c, 10),
      effect(c) { butler.strike(c, 10); butler.announceNext(c); },
    },
    'dust-them-off': {
      /**
       * MULTIPLAYER: phase one's AoE. He tidies EVERY guest.
       *
       * The design chapter is silent on the Butler's targeting — §28 covers his
       * House Rules and Flustered thresholds and nothing else — so this is
       * authored to §26's precedent (Red Carpet Runner's Run the Hall) and to
       * his own tell, which is the one move in his phase-one cycle that is
       * already a housekeeping chore rather than a blow. A cloth going briskly
       * over four guests is the same gesture as over one.
       *
       * No `splash`: the main number lands in full on every seat, so every seat
       * has an arrow and the intent is honest without one. Damage per Kid is
       * unchanged at 5x2 — what scales is COVERAGE, never the number.
       */
      id: 'dust-them-off', name: 'Dust Them Off', intent: Intent.ATTACK, damage: 5, hits: 2,
      partyTarget: 'all',
      tell: 'He produces a cloth and begins, briskly, to tidy you.',
      /**
       * 5x2 alone, 3x2 EACH in a party — coverage bought with per-head damage,
       * which is the doc's own shape for an AoE move: Run the Hall is 8 + 7 per
       * Momentum solo and "6 plus 5 per Momentum to each player" in
       * multiplayer (§26).
       *
       * The first version dealt the full 5x2 to every Kid and it broke the
       * fight. This move comes up every third turn in phase one, so at four
       * Kids the party was under pressure EVERY round, where a solo Kid gets
       * free turns whenever he defends or summons. Every seat turtled, and four
       * Kids ended up dealing about the same damage per turn as one — which
       * made the fight three times longer, which gave the AoE three times as
       * many chances to land. Measured at 0% wins for three and four Kids.
       *
       * 24 across four seats is still far more total threat than the 10 a solo
       * Kid takes; what it stops being is a per-seat tax that leaves nobody
       * able to attack.
       */
      damageFn: (c) => butler.strikeDisplay(c, c.partySize() > 1 ? 3 : 5, 2),
      hitsFn: () => 2,
      effect(c) { butler.strike(c, c.partySize() > 1 ? 3 : 5, 2); butler.announceNext(c); },
    },
    'service-please': {
      id: 'service-please', name: 'Service, Please', intent: Intent.SUMMON,
      tell: 'He rings for assistance without once looking away from you.',
      summons: [{ enemyId: 'dust-bunny', hp: 12 }],
      appliesFn: (c) => (allies(c)[0] ? [{ id: 'roused', stacks: 1, to: 'ally' }] : []),
      /**
       * 8 Guard and 1 Roused, as the doc writes it. The Roused is armed and applied at
       * onEnemyPhaseEnd — he is slot 0 and his summons sit behind him, so handing it out
       * mid-phase would have boosted an attack already telegraphed on screen.
       */
      effect(c) {
        const other = allies(c)[0];
        if (!other) c.summon('dust-bunny', { hp: 12 });
        else { c.block(other, 8); mem(c).rousePending = 1; }
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
      /**
       * MULTIPLAYER: singles out the HEALTHIEST Kid, and stays single-target.
       *
       * Deliberately not AoE: a phase needs one move that is one Kid's problem,
       * or the party stops having anything to answer individually. And
       * deliberately not `lowestCourage` — a boss that focuses whoever is
       * nearest to falling executes the party one Kid at a time, which is the
       * least interesting thing co-op can do. He is removing the guest most
       * capable of resisting, which is both better play and better character.
       */
      id: 'remove-the-intruder', name: 'Remove the Intruder', intent: Intent.ATTACK, damage: 7, hits: 3,
      partyPick: 'highestCourage',
      tell: 'He takes hold of you the way one takes hold of a stray animal.',
      damageFn: (c) => butler.strikeDisplay(c, 7, 3),
      hitsFn: () => 3,
      effect(c) { butler.strike(c, 7, 3); },
    },
    'enough-of-this': {
      /**
       * MULTIPLAYER: phase two's AoE, and the only one shaped as a splash.
       *
       * "For the first time all evening, he raises his voice." A shout is aimed
       * at somebody and heard by everybody, so the 15 belongs to one Kid and
       * the rest of the table takes 6. That is the shape CONTRACTS requires to
       * be declared: a move whose main number belongs to ONE Kid while other
       * seats also take damage MUST carry `splash`, or the intent is lying to
       * the seats with no arrow.
       *
       * The splash is flat and takes neither the Haunt bump nor the No
       * Roughhousing rider, both of which belong to the blow he is actually
       * aiming.
       */
      id: 'enough-of-this', name: 'Enough of This', intent: Intent.ATTACK_BIG, damage: 15, hits: 1, block: 6,
      tell: 'For the first time all evening, he raises his voice.',
      damageFn: (c) => butler.strikeDisplay(c, 15),
      splashFn: (c) => (c.partySize() > 1 ? 6 : 0),
      effect(c) {
        butler.strike(c, 15);
        for (const pl of butler.bystanders(c)) c.damage(pl, 6);
        c.block(c.self, 6);
      },
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
