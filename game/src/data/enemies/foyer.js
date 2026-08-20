/**
 * The Forgotten Foyer — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/01-foyer.md (full enemy design pass).
 *
 * Region thesis: "Read the room before playing your hand."
 * Every enemy here either telegraphs a big attack the player can shrink, or changes
 * what a good sequence looks like. Almost every attack number in this file is dynamic:
 * hitting the right enemy at the right moment visibly drops the number on its intent.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, dmgTaken, wasHit, played, lastMove,
  cyc, countMoves, hitPlayer, hauntBase, flag, announce, isAlive,
} from './_lib.js';

const REGION = 'foyer';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dust Bunny — introductory escalation enemy
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lesson: dealing a small amount of damage now prevents a larger problem later.
 *
 * Dust timing is deliberate. The passive Dust gain resolves at the START of the Bunny's
 * own turn, so throughout the player turn the counter is stable and Tumble's intent can
 * PREDICT it: it shows `5 + 3 × (Dust + 1)` while the Bunny is untouched, and drops by 3
 * the instant the player pokes it. Poking for 3 damage visibly shrinks a 14 into an 11.
 */
export const dustBunny = {
  id: 'dust-bunny',
  name: 'Dust Bunny',
  region: REGION,
  tier: 'normal',
  role: 'introductory',
  hp: [20, 20],
  silhouette: 'dustball',
  palette: ['#8c8375', '#c9bfae', '#5b5346'],
  shape: { body: 'squat', limbs: 0, eyes: 2 },
  scale: 0.8,
  lore: 'It has been under the hall table since before anyone alive was born. It has opinions about being swept.',

  counters: { dust: 0 },
  maxDust: 4,

  /** Projected Dust at the moment its next turn begins — what the intent must display. */
  projectedDust(c) {
    const max = flag(c, 'maxDust', 4);
    return Math.min(max, cnt(c, 'dust') + (wasHit(c) ? 0 : 1));
  },

  onSpawn(c) {
    setCnt(c, 'dust', flag(c, 'startDust', 0));
  },

  onTurnStart(c) {
    // "Whenever the player ends a turn without damaging Dust Bunny, it gains 1 Dust."
    if (!wasHit(c)) addCnt(c, 'dust', 1, flag(c, 'maxDust', 4));
  },

  moves: {
    gather: {
      id: 'gather', name: 'Gather', intent: Intent.DEFEND, block: 5,
      tell: 'It rolls slowly along the skirting board, collecting the years.',
      effect(c) {
        c.block(c.self, 5);
        // Stacks with the passive gain — an ignored Bunny gains 2 Dust on a Gather turn.
        if (!wasHit(c)) addCnt(c, 'dust', 1, flag(c, 'maxDust', 4));
      },
    },
    tumble: {
      // BALANCE DEVIATION from the design doc (which says 5 + 3 per Dust). Measured at 5,
      // the region's opening Scuffle cost the player 0.18 Courage out of 68 across 60
      // seeded runs — a free encounter. The Slay the Spire Act-1 norm is 8-12. Base
      // raised to 7; the Dust scaling and the whole disruption read are unchanged.
      id: 'tumble', name: 'Tumble', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It gathers itself up into something much too large for a clump of dust.',
      damageFn: (c) => 7 + 3 * dustBunny.projectedDust(c),
      intentFn: (c) => (dustBunny.projectedDust(c) >= 3 ? Intent.ATTACK_BIG : Intent.ATTACK),
      effect(c) {
        hitPlayer(c, 7 + 3 * cnt(c, 'dust'));
        setCnt(c, 'dust', 0);
      },
    },
  },

  // Turn 1 Gather, turn 2 Tumble, repeat.
  nextMove: (c) => cyc(['gather', 'tumble'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.counters.dust = 1;
      h.advanced.flags.startDust = 1;
      h.notes.push('Haunt 3: begins advanced Scuffles with 1 Dust.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Coatrack Crawler — defensive bruiser
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lesson: enemy preparation can sometimes be disrupted.
 * Umbrella Jab's intent reads 12 while its Brace Guard stands and flips to 7 the frame
 * the last point of that Guard is stripped. This is the Foyer's clearest "your damage
 * changed the future" moment.
 */
export const coatrackCrawler = {
  id: 'coatrack-crawler',
  name: 'Coatrack Crawler',
  region: REGION,
  tier: 'normal',
  role: 'introductory',
  hp: [33, 33],
  silhouette: 'coatrack',
  palette: ['#5a3a22', '#8b5e34', '#2b1a10'],
  shape: { body: 'tall-thin', limbs: 6, eyes: 2 },
  scale: 1.15,
  lore: 'Six carved legs, four brass hooks, and one very old umbrella it has never once put down.',

  /** True while the Brace it is currently standing behind has been fully stripped. */
  braceBroken(c) {
    return !!mem(c).braced && (c.self.block || 0) <= 0;
  },

  onPlayerTurnEnd(c) {
    // Latch the result before the engine clears Guard at the start of its own turn.
    if (mem(c).braced) mem(c).wasBroken = (c.self.block || 0) <= 0;
  },

  moves: {
    brace: {
      id: 'brace', name: 'Brace', intent: Intent.DEFEND, block: 10,
      tell: 'It plants every leg and lifts the umbrella like a duelling sword.',
      effect(c) {
        c.block(c.self, 10);
        mem(c).braced = true;
        mem(c).wasBroken = false;
      },
    },
    'umbrella-jab': {
      id: 'umbrella-jab', name: 'Umbrella Jab', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'The umbrella tip trembles, waiting for an opening.',
      damageFn: (c) => (coatrackCrawler.braceBroken(c) ? 7 : flag(c, 'jabBig', 12)),
      effect(c) {
        const weakened = mem(c).wasBroken;
        hitPlayer(c, weakened ? 7 : flag(c, 'jabBig', 12));
        mem(c).braced = false;
        mem(c).wasBroken = false;
      },
    },
    'hat-swipe': {
      // BALANCE DEVIATION from the design doc (6 damage / 5 Guard). Scuffle 2 cost the
      // player 2.15 Courage of 68 across 60 seeded runs. Raised to 8; Guard unchanged, and
      // Brace / Umbrella Jab — the enemy's actual lesson — are untouched.
      id: 'hat-swipe', name: 'Hat Swipe', intent: Intent.ATTACK_DEFEND, damage: 8, hits: 1, block: 5,
      tell: 'It shrugs a bowler hat off a hook and swings the whole rack around.',
      effect(c) { hitPlayer(c, 8); c.block(c.self, 5); },
    },
  },

  nextMove: (c) => cyc(['brace', 'umbrella-jab', 'hat-swipe'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.jabBig = 14;
      h.moves['umbrella-jab'] = { damage: 14 };
      h.notes.push('Haunt 5: undisturbed Umbrella Jab 12 → 14. The disrupted version stays 7, so disruption is worth more.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Lost Luggage — deck interference
// ─────────────────────────────────────────────────────────────────────────────
export const lostLuggage = {
  id: 'lost-luggage',
  name: 'Lost Luggage',
  region: REGION,
  tier: 'normal',
  role: 'interaction',
  hp: [30, 30],
  silhouette: 'suitcase',
  palette: ['#6b4226', '#c2a06a', '#3a2415'],
  shape: { body: 'squat', limbs: 2, eyes: 1 },
  scale: 0.95,
  lore: 'Tagged for a room that does not exist, on a floor that was never built. It has been waiting to be carried up.',

  moves: {
    'pack-wrong': {
      id: 'pack-wrong', name: 'Pack Wrong', intent: Intent.DEBUFF, block: 5,
      tell: 'It yawns open and starts repacking itself with things that are not yours.',
      addsCards: [{ id: 'clutter', pile: 'discard' }],
      effect(c) {
        const first = countMoves(c, 'pack-wrong') === 0;
        const n = (first && flag(c, 'firstPackWrong', 1)) || 1;
        for (let i = 0; i < n; i++) c.addCard('clutter', 'discard');
        c.block(c.self, 5);
      },
    },
    'baggage-bash': {
      id: 'baggage-bash', name: 'Baggage Bash', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'It hops backwards, then throws its whole weight forward.',
      damageFn: (c) => (mem(c).primed ? 12 : 9),
      effect(c) {
        hitPlayer(c, mem(c).primed ? 12 : 9);
        mem(c).primed = false;
      },
    },
    'snap-shut': {
      id: 'snap-shut', name: 'Snap Shut', intent: Intent.DEFEND, block: 12,
      tell: 'The clasps slam home. Whatever was showing is not showing any more.',
      effect(c) { c.block(c.self, 12); mem(c).primed = true; },
    },
  },

  nextMove: (c) => cyc(['pack-wrong', 'baggage-bash', 'snap-shut', 'baggage-bash'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.firstPackWrong = 2;
      h.notes.push('Haunt 6: the first Pack Wrong adds 2 Clutter. Later uses add 1.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Calling Bell — support
// ─────────────────────────────────────────────────────────────────────────────
/** Lesson: low-Courage enemies can be more important than large ones. */
export const callingBell = {
  id: 'calling-bell',
  name: 'Calling Bell',
  region: REGION,
  tier: 'normal',
  role: 'interaction',
  hp: [18, 18],
  silhouette: 'service-bell',
  palette: ['#c9a227', '#f2d98d', '#6b5410'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.7,
  lore: 'Rings itself. Something in the house has always answered, and it has never once been told to stop.',

  moves: {
    ring: {
      id: 'ring', name: 'Ring', intent: Intent.BUFF,
      tell: 'A bright little ding. Everything else in the room stands up straighter.',
      // Roused changes how hard everything else hits — it must never land unannounced.
      appliesFn: (c) => {
        const stacks = (countMoves(c, 'ring') === 0 && flag(c, 'firstRingRoused', 1)) || 1;
        return allies(c).length ? [{ id: 'roused', stacks, to: 'allies' }] : [];
      },
      effect(c) {
        const first = countMoves(c, 'ring') === 0;
        const stacks = (first && flag(c, 'firstRingRoused', 1)) || 1;
        for (const a of allies(c)) c.applyStatus(a, 'roused', stacks);
      },
    },
    ping: {
      id: 'ping', name: 'Ping', intent: Intent.ATTACK, damage: 4, hits: 1,
      tell: 'It hops up and clips you on the shin, apologetically.',
      effect(c) { hitPlayer(c, 4); },
    },
    'call-for-service': {
      id: 'call-for-service', name: 'Call for Service', intent: Intent.SUMMON,
      tell: 'It rings and rings and rings. Something is coming up the hall.',
      summons: [{ enemyId: 'dust-bunny', hpMul: 0.75 }],
      effect(c) {
        if (board(c).length < 3) c.summon('dust-bunny', { hpMul: 0.75 });
        mem(c).calledService = true;
      },
    },
  },

  nextMove(c) {
    // Alone (its escorts died) → shout for help, once only.
    if (allies(c).length === 0 && !(c.history || []).includes('call-for-service')) return 'call-for-service';
    return cyc(['ring', 'ping'], countMoves(c, ['ring', 'ping']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.firstRingRoused = 2;
      h.notes.push('Haunt 4: the first Ring grants 2 Roused. Later Rings remain 1.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Red Carpet Runner — major ordinary threat
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lesson: large attacks can be prevented through preparation.
 * Unroll's Momentum is only banked if its 12 Guard survives the player turn, so the
 * Run the Hall intent reads 22 / 15 / 8 depending on how much work the player did.
 */
export const redCarpetRunner = {
  id: 'red-carpet-runner',
  name: 'Red Carpet Runner',
  region: REGION,
  tier: 'normal',
  role: 'pressure',
  hp: [43, 43],
  silhouette: 'rug-serpent',
  palette: ['#8e1b25', '#c93f43', '#4a0d14'],
  shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  scale: 1.3,
  lore: 'Laid down for a visit by someone important. The visit never happened. It is still very excited about it.',

  maxMomentum: 2,

  /** Momentum it will actually have when Run the Hall lands. */
  projectedMomentum(c) {
    const m = cnt(c, 'momentum');
    const pending = mem(c).unrolled && (c.self.block || 0) > 0 ? 1 : 0;
    return Math.min(flag(c, 'maxMomentum', 2), m + pending);
  },

  onPlayerTurnEnd(c) {
    // "Gain 1 Momentum unless all of this Guard is broken during the player's next turn."
    if (mem(c).unrolled) {
      if ((c.self.block || 0) > 0) addCnt(c, 'momentum', 1, flag(c, 'maxMomentum', 2));
      mem(c).unrolled = false;
    }
  },

  moves: {
    unroll: {
      id: 'unroll', name: 'Unroll', intent: Intent.DEFEND, block: 12,
      tell: 'It flattens itself across the hall, bracing at both ends.',
      effect(c) { c.block(c.self, 12); mem(c).unrolled = true; },
    },
    'gather-speed': {
      id: 'gather-speed', name: 'Gather Speed', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'The far end lifts off the floorboards and begins to ripple.',
      effect(c) { hitPlayer(c, 5); addCnt(c, 'momentum', 1, flag(c, 'maxMomentum', 2)); },
    },
    'run-the-hall': {
      id: 'run-the-hall', name: 'Run the Hall', intent: Intent.ATTACK_BIG, damage: 8, hits: 1,
      tell: 'Every inch of carpet snaps taut, pointed directly at you.',
      damageFn: (c) => 8 + flag(c, 'momentumDamage', 7) * redCarpetRunner.projectedMomentum(c),
      effect(c) {
        hitPlayer(c, 8 + flag(c, 'momentumDamage', 7) * cnt(c, 'momentum'));
        setCnt(c, 'momentum', 0);
      },
    },
  },

  nextMove: (c) => cyc(['unroll', 'gather-speed', 'run-the-hall'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.momentumDamage = 8;
      h.notes.push('Haunt 7: Run the Hall gains 8 damage per Momentum instead of 7 (max 24).');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Door Greeter — rule enemy, foreshadows The Butler
// ─────────────────────────────────────────────────────────────────────────────
export const doorGreeter = {
  id: 'door-greeter',
  name: 'Door Greeter',
  region: REGION,
  tier: 'normal',
  role: 'pressure',
  hp: [29, 29],
  silhouette: 'door',
  palette: ['#4a2f1c', '#7a5330', '#d8c48a'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 1 },
  scale: 1.25,
  lore: 'It would simply like everyone to wipe their feet, sign the book, and never leave.',

  moves: {
    'mind-your-manners': {
      id: 'mind-your-manners', name: 'Mind Your Manners', intent: Intent.DEBUFF,
      tell: 'It clears a throat it does not have. A rule appears in the air beside it.',
      rule: 'no-running',
      effect(c) {
        const dmg = flag(c, 'reprimand', 6);
        announce(c, {
          id: 'no-running', source: c.self.uid ?? c.self.id,
          name: 'NO RUNNING',
          text: `Playing a fourth Trick this turn breaks the rule. Reprimand: ${dmg} damage.`,
          when: 'cardPlayed', once: true,
          broken: (rc) => (rc.cardsPlayedThisTurn || []).length >= 4,
          onBreak: (cc) => { hitPlayer(cc, flag(cc, 'reprimand', 6)); },
        });
      },
    },
    'threshold-slam': {
      id: 'threshold-slam', name: 'Threshold Slam', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'It rears back on its hinges.',
      effect(c) { hitPlayer(c, 10); },
    },
    'hold-the-door': {
      id: 'hold-the-door', name: 'Hold the Door', intent: Intent.DEFEND, block: 6,
      tell: 'It holds itself open for everything in the room but you.',
      effect(c) { for (const e of board(c)) c.block(e, 6); },
    },
  },

  nextMove: (c) => cyc(['mind-your-manners', 'threshold-slam', 'hold-the-door'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.reprimand = 8;
      h.notes.push('Haunt 8: Reprimand deals 8 instead of 6.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Grand Coatcheck — adaptability test
// ─────────────────────────────────────────────────────────────────────────────
const GARMENTS = ['raincoat', 'evening-coat', 'mourning-coat'];
const GARMENT_NAMES = { raincoat: 'Raincoat', 'evening-coat': 'Evening Coat', 'mourning-coat': 'Mourning Coat' };

export const grandCoatcheck = {
  id: 'grand-coatcheck',
  name: 'The Grand Coatcheck',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  // Round 2 (corrected targets): 0.9x across all three Big Scares. Region
  // survival is P(reach the boss) x P(win the boss), and with ~0.83 Big Scares
  // on a path a 73%-win elite alone removes 18% of all runs before the boss is
  // even seen — which capped survival at 50% against a 65-78% target. Sweeping
  // elite Courage (45 fights per step) put a competent player at 88.9% and a
  // naive one at 60% here; at full Courage it was 77.8 / 40.0. See docs/notes.
  // BALANCE 2026-08-20: 96 -> 115 -> 104. At 96 a competent player finished it in 6.3
  // turns, which is a long Scuffle, not a Big Scare; StS elites run 8-12. 122
  // overshot hard (43% for a competent player, and the naive bot within ten
  // points of it, which means the fight had stopped rewarding play at all).
  hp: [104, 104],
  silhouette: 'coat-rack-mass',
  palette: ['#2f2a3a', '#6a5f7d', '#c4b48c'],
  shape: { body: 'sprawling', limbs: 8, eyes: 3 },
  scale: 1.6,
  lore: 'Every coat left behind since the house opened, and it has learned to wear all of them at once.',

  garments: GARMENTS,

  /** Active Garment, or null while Snagged. Drives every other number on this enemy. */
  activeGarment(c) {
    if (mem(c).snagged) return null;
    return GARMENTS[cnt(c, 'garment') % GARMENTS.length];
  },
  eveningBonus(c) { return grandCoatcheck.activeGarment(c) === 'evening-coat' ? 4 : 0; },

  onSpawn(c) { setCnt(c, 'garment', 0); mem(c).snagged = false; },

  onTurnStart(c) {
    if (grandCoatcheck.activeGarment(c) === 'raincoat') c.block(c.self, 10);
  },

  /** Mourning Coat: the first time the player damages it each turn, they gain Clutter. */
  onDamaged(c) {
    if (grandCoatcheck.activeGarment(c) === 'mourning-coat' && !mem(c).clutteredThisTurn) {
      mem(c).clutteredThisTurn = true;
      c.addCard('clutter', 'discard');
    }
  },

  onPlayerTurnEnd(c) {
    // Snag: 18+ damage during one player turn shuts the current Garment off until it changes.
    if (dmgTaken(c) >= flag(c, 'snagThreshold', 18)) mem(c).snagged = true;
    mem(c).clutteredThisTurn = false;
  },

  changeGarment(c) {
    setCnt(c, 'garment', (cnt(c, 'garment') + 1) % GARMENTS.length);
    mem(c).snagged = false;         // a fresh Garment is never Snagged
  },

  moves: {
    'check-your-things': {
      id: 'check-your-things', name: 'Check Your Things', intent: Intent.DEFEND, block: 8,
      tell: 'It shuffles its whole rack, looking for something more suitable to wear.',
      effect(c) { c.block(c.self, 8); grandCoatcheck.changeGarment(c); },
    },
    'umbrella-sweep': {
      // BALANCE 2026-08-20: 11 -> 13.
      id: 'umbrella-sweep', name: 'Umbrella Sweep', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'A dozen umbrellas open at once and swing in a single wide arc.',
      damageFn: (c) => 13 + grandCoatcheck.eveningBonus(c),
      effect(c) { hitPlayer(c, 13 + grandCoatcheck.eveningBonus(c)); },
    },
    'hanger-flurry': {
      id: 'hanger-flurry', name: 'Hanger Flurry', intent: Intent.ATTACK, damage: 4, hits: 3,
      tell: 'Wire hangers come off the rail in a stinging, chattering wave.',
      damageFn: (c) => 4 + grandCoatcheck.eveningBonus(c),
      hitsFn: () => 3,
      effect(c) { hitPlayer(c, 4 + grandCoatcheck.eveningBonus(c), 3); },
    },
    'everything-at-once': {
      // BALANCE 2026-08-20: 15 -> 17. Its one big telegraph has to be bigger
      // than a turn of Guard or the whole "accept the Garment or spend 18 to
      // Snag it" decision never has to be made.
      id: 'everything-at-once', name: 'Everything at Once', intent: Intent.ATTACK_BIG, damage: 17, hits: 1,
      tell: 'Coats, hats, scarves and cases all lean toward you together.',
      damageFn: (c) => 17 + grandCoatcheck.eveningBonus(c),
      effect(c) {
        hitPlayer(c, 17 + grandCoatcheck.eveningBonus(c));
        grandCoatcheck.changeGarment(c);
      },
    },
  },

  /**
   * BALANCE 2026-08-20: one Check Your Things per cycle, not two.
   *
   * Measured at 96.7% for a competent player and 22.9 Courage — a Big Scare
   * that costs less than two Scuffles. The numbers were not the problem: two of
   * its five turns dealt zero, so its average output was 7.6 a turn against a
   * player who can raise 10-15 Guard, and a solo enemy that cannot out-damage
   * one turn of Guard is free however much Courage it has. Dropping the second
   * Check takes it to 9.5 a turn and one blank turn in four, and the Garments
   * now rotate twice a cycle rather than twice every five turns, which makes
   * the read it is built around come round often enough to matter.
   */
  nextMove: (c) => cyc(
    ['check-your-things', 'umbrella-sweep', 'hanger-flurry', 'everything-at-once'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.snagThreshold = 20;
      h.notes.push('Haunt 9: Snagging a Garment requires 20 damage in one turn instead of 18.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The Unwelcome Guest — pattern-breaking test
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Familiarity is the whole enemy. At the end of every player turn it notes which Trick
 * type you leaned on; that type is Familiar next turn. Playing it is never forbidden —
 * the second one hands it Guard, the third one gets you hit.
 *
 * Too Familiar's intent grows LIVE as you play Familiar Tricks in front of it. Watching
 * 9 climb to 12 to 15 as you commit is the whole read.
 */
export const unwelcomeGuest = {
  id: 'unwelcome-guest',
  name: 'The Unwelcome Guest',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  // Round 2 (corrected targets): 0.9x across all three Big Scares. Region
  // survival is P(reach the boss) x P(win the boss), and with ~0.83 Big Scares
  // on a path a 73%-win elite alone removes 18% of all runs before the boss is
  // even seen — which capped survival at 50% against a 65-78% target. Sweeping
  // elite Courage (45 fights per step) put a competent player at 88.9% and a
  // naive one at 60% here; at full Courage it was 77.8 / 40.0. See docs/notes.
  // BALANCE 2026-08-20: 91 -> 142 -> 128. It was the softest thing in the region by a
  // distance — 100% for a competent player and 12.6 Courage, a fifth of what
  // the House Bell cost for the same Big Scare reward — and 72% of everything
  // it threw was being absorbed, so raising per-hit numbers alone could not
  // reach the player. The extra Courage is what turns those numbers into a
  // bill: the fight now runs ~10 turns instead of ~7.
  hp: [128, 128],
  silhouette: 'faceless-guest',
  palette: ['#1f2430', '#4a5468', '#e8e3d6'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.35,
  lore: 'Its coat hangs incorrectly. Its shadow faces the wrong way. Nobody remembers seeing it come in.',

  onSpawn(c) { mem(c).familiar = null; mem(c).familiarPlayed = 0; mem(c).reactedThisTurn = false; },

  /** How many Familiar Tricks the player has committed this turn. */
  familiarPlayedThisTurn(c) {
    const f = mem(c).familiar;
    if (!f) return 0;
    return played(c).filter(p => p && p.type === f).length;
  },

  /** Engine hook: called after each player card. Drives the Familiarity reaction. */
  onPlayerCard(c) {
    const f = mem(c).familiar;
    if (!f) return;
    const n = unwelcomeGuest.familiarPlayedThisTurn(c);
    if (n === 2) c.block(c.self, 6);
    if (n === 3 && !mem(c).reactedThisTurn) {
      mem(c).reactedThisTurn = true;
      hitPlayer(c, mem(c).bigReaction ? 10 : flag(c, 'familiarityDamage', 7));
      mem(c).bigReaction = false;
    }
  },

  onPlayerTurnEnd(c) {
    // Remember how Familiar the player just got — Too Familiar reads this.
    mem(c).familiarPlayed = unwelcomeGuest.familiarPlayedThisTurn(c);
    // Observe the most-used type; ties favour whichever was played last.
    const counts = { attack: 0, skill: 0, power: 0 };
    let last = null;
    for (const p of played(c)) {
      if (p && counts[p.type] !== undefined) { counts[p.type]++; last = p.type; }
    }
    let best = null, bestN = 0;
    for (const t of ['attack', 'skill', 'power']) {
      if (counts[t] > bestN || (counts[t] === bestN && counts[t] > 0 && t === last)) { best = t; bestN = counts[t]; }
    }
    mem(c).familiar = best;
    mem(c).reactedThisTurn = false;
  },

  moves: {
    watching: {
      id: 'watching', name: 'Watching', intent: Intent.DEFEND, block: 8,
      tell: 'It does not move. You are fairly sure it did not move before, either.',
      effect(c) { c.block(c.self, 8); },
    },
    'too-familiar': {
      id: 'too-familiar', name: 'Too Familiar', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'It has seen you do that before. It has seen you do that a great many times.',
      // The intent counts Familiar Tricks live, against the type that is Familiar RIGHT NOW.
      // By the time the move resolves, onPlayerTurnEnd has already rotated `familiar` to
      // next turn's type — so the effect must use the count latched at turn end, not a
      // fresh live count against the new type. Reading it live here made Too Familiar
      // deal 15 while its intent promised 12.
      damageFn: (c) => Math.min(20, 13 + 3 * unwelcomeGuest.familiarPlayedThisTurn(c)),
      intentFn: (c) => (unwelcomeGuest.familiarPlayedThisTurn(c) >= 2 ? Intent.ATTACK_BIG : Intent.ATTACK),
      effect(c) { hitPlayer(c, Math.min(20, 13 + 3 * (mem(c).familiarPlayed || 0))); },
    },
    'wrong-face': {
      id: 'wrong-face', name: 'Wrong Face', intent: Intent.ATTACK, damage: 9, hits: 2,
      tell: 'It turns toward you, and keeps turning.',
      effect(c) { hitPlayer(c, 9, 2); },
    },
    'come-in-then': {
      id: 'come-in-then', name: 'Come In, Then', intent: Intent.DEFEND, block: 12,
      tell: 'It steps aside and gestures you further into the house.',
      effect(c) { c.block(c.self, 12); mem(c).bigReaction = true; },
    },
  },

  /**
   * BALANCE 2026-08-20: Too Familiar 9->11 (cap 15->18), Wrong Face 6x2->8x2,
   * and the repeating cycle no longer contains a second pure-defence turn.
   *
   * It was the softest thing in the region by a distance: 100% for a competent
   * player, 80% for a naive one, and 12.6 Courage — a fifth of what the House
   * Bell costs, for the same Big Scare reward. Two of its five turns did
   * nothing but gain Guard, and the other three landed 12-ish into a player who
   * blocks 10-15, so it took 1.55 Courage a turn off a competent player.
   * Familiarity is a good mechanic attached to numbers too small to make
   * anybody change what they were going to do anyway.
   */
  nextMove: (c) => cyc(
    ['watching', 'too-familiar', 'wrong-face', 'come-in-then', 'too-familiar', 'wrong-face'],
    (c.history || []).length,
  ),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.familiarityDamage = 9;
      h.notes.push('Haunt 9: the Familiarity reaction deals 9 instead of 7.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Big Scare: The House Bell — escalation and add management
// ─────────────────────────────────────────────────────────────────────────────
export const houseBell = {
  id: 'house-bell',
  name: 'The House Bell',
  region: REGION,
  tier: 'elite',
  role: 'bigScare',
  // Round 2 (corrected targets): 0.9x across all three Big Scares. Region
  // survival is P(reach the boss) x P(win the boss), and with ~0.83 Big Scares
  // on a path a 73%-win elite alone removes 18% of all runs before the boss is
  // even seen — which capped survival at 50% against a 65-78% target. Sweeping
  // elite Courage (45 fights per step) put a competent player at 88.9% and a
  // naive one at 60% here; at full Courage it was 77.8 / 40.0. See docs/notes.
  hp: [95, 95],
  silhouette: 'great-bell',
  palette: ['#8a6b18', '#e0c46a', '#3b2c08'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 1.7,
  lore: 'It is bolted to the house itself. When it rings, the house answers, and the house has a great many staff.',

  maxResonance: 4,

  onSpawn(c) { setCnt(c, 'resonance', 0); },

  /** Any summon of the Bell's dying drops Resonance — the player's lever on the Toll. */
  onAllyDeath(c, dead) {
    if (dead && dead.summonedBy === (c.self.uid ?? c.self.id)) {
      addCnt(c, 'resonance', -1, 4, 0);
    }
  },

  moves: {
    'ring-for-service': {
      id: 'ring-for-service', name: 'Ring for Service', intent: Intent.SUMMON,
      tell: 'One clear note. Somewhere below stairs, something puts down what it was doing.',
      // BALANCE 2026-08-20: the summoned Bunny arrives at 60% Courage, matching
      // what Second Ring already does to its Crawler and what the Butler's
      // Service, Please does. A full-Courage Dust Bunny that banks Dust while
      // you are busy with the Bell projects up to 19 damage, which is most of
      // where this fight's 57 Courage bill came from.
      summons: [{ enemyId: 'dust-bunny', hpMul: 0.6 }],
      effect(c) {
        addCnt(c, 'resonance', 1, 4);
        if (allies(c).length >= 2) {
          // DEVIATION from the design doc, for intent honesty. The doc gives this branch
          // 1 Roused to every other enemy. The Bell is always slot 0, so it acts before
          // every ally it buffs — a mid-phase Roused raises an attack whose number is
          // already on screen, and the player takes 2 more than the intent promised.
          // Guard (what Second Ring's crowded-room branch already grants) has no effect on
          // any telegraphed number, so the room stays honest. Restore Roused here the
          // moment the engine can arm a buff between the enemy phase and the intent
          // refresh — see docs/NOTES.md.
          for (const a of allies(c)) c.block(a, 8);
        } else {
          c.summon('dust-bunny', { hpMul: 0.6 });
        }
      },
    },
    'deep-vibration': {
      /**
       * BALANCE 2026-08-20: no longer adds Resonance.
       *
       * "Every ring adds 1" is the rule the fight is sold on, and Deep
       * Vibration is not a ring — but it added 1 anyway, so Resonance climbed
       * on all four of its actions and MIDNIGHT TOLL landed every fourth turn
       * no matter what the player did. Killing a summon gives -1, so denying
       * the Toll required killing one add EVERY turn on top of racing 105
       * Courage: the advertised lever ("race the Bell, or farm its summons to
       * push the Toll away") could not actually be pulled. Now only the two
       * Ring moves charge it, the Toll is roughly every eight turns, and one
       * kill really does buy a turn.
       */
      id: 'deep-vibration', name: 'Deep Vibration', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'The floor hums. Your teeth hum with it.',
      effect(c) { hitPlayer(c, 7); },
    },
    'second-ring': {
      id: 'second-ring', name: 'Second Ring', intent: Intent.SUMMON,
      tell: 'A second note, lower than the first. Something taller is coming.',
      summons: [{ enemyId: 'coatrack-crawler', hpMul: 0.6 }],
      effect(c) {
        addCnt(c, 'resonance', 1, 4);
        if (board(c).length < 3) c.summon('coatrack-crawler', { hpMul: 0.6 });
        else for (const a of allies(c)) c.block(a, 8);
      },
    },
    'midnight-toll': {
      id: 'midnight-toll', name: 'MIDNIGHT TOLL', intent: Intent.ATTACK_BIG, damage: 20, hits: 1,
      tell: 'The whole house leans toward the sound. This is going to be very loud.',
      damageFn: (c) => flag(c, 'tollDamage', 20),
      effect(c) { hitPlayer(c, flag(c, 'tollDamage', 20)); setCnt(c, 'resonance', 0); },
    },
  },

  nextMove(c) {
    // At full Resonance the Toll pre-empts everything, and it was visible a turn early.
    if (cnt(c, 'resonance') >= 4) return 'midnight-toll';
    const base = ['ring-for-service', 'deep-vibration', 'second-ring', 'deep-vibration'];
    // Index by non-Toll actions so the cycle survives a Toll interrupting it.
    return cyc(base, countMoves(c, base));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.tollDamage = 23;
      h.moves['midnight-toll'] = { damage: 23 };
      h.notes.push('Haunt 9: MIDNIGHT TOLL deals 23 instead of 20.');
    }
    return h;
  },
};

export const FOYER_ENEMIES = [
  dustBunny, coatrackCrawler, lostLuggage, callingBell, redCarpetRunner, doorGreeter,
  grandCoatcheck, unwelcomeGuest, houseBell,
];
