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
      // MULTIPLAYER: prefers the Kid with the least Guard up (foyer §26).
      partyPick: 'lowestGuard',
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
      // The doc scopes this to advanced Scuffles. At Haunt 3 it applies everywhere:
      // the opening board state itself changes, so the very first Tumble already
      // reads 3 higher and the "poke it now" decision arrives a turn earlier.
      h.counters.dust = 1;
      h.flags.startDust = 1;
      h.notes.push('Haunt 3: every Dust Bunny begins combat with 1 Dust, not just those in advanced Scuffles.');
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
      /**
       * PARTY: a tip finds the gap. MEASURED 2026-08-29 — an audit of this file
       * found the Crawler and the Door Greeter with NO party-aware content of
       * any kind, not a pick, not a splash, not a pierce, while
       * `tests/coop/balance.py` had the standard tier ending fights at 62% / 77%
       * / 83% / 86% Courage left. A rising line there is the tool's own
       * definition of co-op being too easy.
       *
       * Pierce rather than more damage or an AoE, for the reason the elite
       * ledger records: "a pick SPREADS damage, AoE ADDS damage a party then
       * blocks, and only pierce is KEPT". Four Kids out-Guard a Foyer normal
       * comfortably, so anything blockable is blocked and a bigger printed
       * number is eaten.
       *
       * The number does NOT move — 12 stays 12, and 7 stays 7 when the Brace is
       * broken. Only what a party can do about it changes, which is this game's
       * stated party design (enemy damage never scales; the threat is what gets
       * through). Solo is untouched.
       */
      pierceFn: (c) => c.partySize() > 1,
      effect(c) {
        const weakened = mem(c).wasBroken;
        hitPlayer(c, weakened ? 7 : flag(c, 'jabBig', 12), 1,
          { pierce: c.partySize() > 1 });
        mem(c).braced = false;
        mem(c).wasBroken = false;
      },
    },
    'hat-swipe': {
      // BALANCE DEVIATION from the design doc (6 damage / 5 Guard). Scuffle 2 cost the
      // player 2.15 Courage of 68 across 60 seeded runs. Raised to 8; Guard unchanged, and
      // Brace / Umbrella Jab — the enemy's actual lesson — are untouched.
      /**
       * PARTY: the tell has always said this one sweeps. "It swings the whole
       * rack around" is an area attack described in words and implemented as a
       * poke at one Kid — the same shape as CONTRACTS 54, where a rule that
       * reads like an implementation is believed to be one.
       *
       * The standard tier needs it for the reason the elite tier did: `spread`
       * reads 0.144 / 0.198 / 0.278 at two, three and four Kids, so an ordinary
       * Foyer scuffle happens to one Kid while the others watch. Five of the
       * six Foyer normals were single-target; only the Red Carpet Runner ever
       * reached the table.
       *
       * `'all'`, and that was MEASURED rather than assumed. 'two' was tried
       * first as the smaller change and it reaches half of four: spread went
       * 0.144 -> 0.256 at two Kids and 0.278 -> 0.270 at four, which is
       * nothing. 'all' reads 0.256 / 0.288 / 0.297 — identical at 2p, where
       * the two modes ARE the same thing, and better wherever they differ.
       * The number does not move — 8 to each, per the Snip Snip precedent —
       * and the Guard it gains is untouched.
       *
       * **It is not enough on its own, and the reason is structural.** Five of
       * the six Foyer normals are single-target, so one sweeping enemy among
       * several cannot shift an encounter's aggregate far; the elite tier
       * reached 0.40 because its fights are one enemy. Fixing this tier
       * properly is a coverage pass across it. These are 5-turn fights at 100%
       * win and 93% Courage left, so it is low stakes and low priority — but
       * it is a to-do, not a solved thing, and the number above is where it
       * stands.
       */
      id: 'hat-swipe', name: 'Hat Swipe', intent: Intent.ATTACK_DEFEND, damage: 8, hits: 1, block: 5,
      partyTarget: 'all',
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
      // MULTIPLAYER: the Kid with the thinnest draw pile, so the Clutter
      // actually gets drawn soon (foyer §26).
      partyPick: 'fewestDraw',
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
      /**
       * Roused is ARMED here and applied at onEnemyPhaseEnd, never during the phase.
       *
       * Enemies act in slot order and next turn's intents are chosen after the whole
       * phase. A buff handed out mid-phase therefore raises the damage of any ally that
       * has not swung yet, whose number is already on screen — the player takes more than
       * the intent promised. Deferring to the phase-end window means the Roused is always
       * reflected in the next intent refresh before it can change a single number.
       *
       * This also makes board order irrelevant for correctness. Support enemies are still
       * authored into the last slot because it reads better, but nothing depends on it.
       */
      effect(c) {
        const first = countMoves(c, 'ring') === 0;
        mem(c).rousePending = (first && flag(c, 'firstRingRoused', 1)) || 1;
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

  /** Roused armed by Ring lands here — after every enemy has acted, before intents refresh. */
  onEnemyPhaseEnd(c) {
    const stacks = mem(c).rousePending || 0;
    if (!stacks) return;
    mem(c).rousePending = 0;
    for (const a of allies(c)) c.applyStatus(a, 'roused', stacks);
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

  onSpawn(c) {
    // Haunt 5 (design doc §30): it is already moving when the fight starts, so the
    // very first Run the Hall reads 15 instead of 8 and the disruption window on
    // Unroll matters immediately rather than on the second cycle.
    setCnt(c, 'momentum', flag(c, 'startMomentum', 0));
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
      // MULTIPLAYER: hits EVERY Kid — "This makes disrupting Momentum a
      // genuinely cooperative responsibility." (foyer §26)
      partyTarget: 'all',
      /* SOLO keeps the intimate wording; a PARTY is told the truth. This move
         is `partyTarget: 'all'`, so before 2026-08-30 four Kids each read a
         tell addressed personally to them and then all four were hit — the
         intent is the promise this game makes about what is coming, and it was
         quietly making it to the wrong number of people. `tellFn` has existed
         in `combat/intents.js` the whole time. */
      tell: 'Every inch of carpet snaps taut, pointed directly at you.',
      tellFn: (c) => (c.partySize() > 1
        ? 'Every inch of carpet snaps taut, from one end of the hall to the other.'
        : 'Every inch of carpet snaps taut, pointed directly at you.'),
      /**
       * "Multiplayer damage becomes: 6 plus 5 per Momentum to each player."
       * (§26.) This shipped dealing the full solo number — 8 + 7 per Momentum —
       * to EVERY Kid, which at four seats is 64 from one move at 2 Momentum
       * against the 22 a solo Kid takes. The chapter trades per-head damage for
       * coverage and this did not.
       *
       * The Haunt bump rides the per-Momentum term either way, so a higher
       * `momentumDamage` still makes it worse at every party size.
       */
      damageFn: (c) => (c.partySize() > 1
        ? 6 + (flag(c, 'momentumDamage', 7) - 2) * redCarpetRunner.projectedMomentum(c)
        : 8 + flag(c, 'momentumDamage', 7) * redCarpetRunner.projectedMomentum(c)),
      effect(c) {
        const solo = c.partySize() <= 1;
        const per = flag(c, 'momentumDamage', 7) - (solo ? 0 : 2);
        hitPlayer(c, (solo ? 8 : 6) + per * cnt(c, 'momentum'));
        setCnt(c, 'momentum', 0);
      },
    },
  },

  nextMove: (c) => cyc(['unroll', 'gather-speed', 'run-the-hall'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.counters.momentum = 1;
      h.flags.startMomentum = 1;
      h.notes.push('Haunt 5: begins combat with 1 Momentum already built (design doc §30), so its '
        + 'first Run the Hall lands a full cycle earlier than you have learned to expect.');
    }
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
      /**
       * `ruleFn` rather than a static `rule` id, because from Haunt 2 this move alternates
       * between two rules and a static id names the wrong one half the time. The engine
       * prefers ruleFn, so the intent tooltip states the rule the Greeter is *about* to
       * announce, with its real text and its live Reprimand number — a player should never
       * have to break a rule to learn what it was.
       */
      ruleFn(c) {
        const dmg = flag(c, 'reprimand', 6);
        const alt = flag(c, 'altRules') && countMoves(c, 'mind-your-manners') % 2 === 1;
        return alt
          ? { id: 'greeter-one-at-a-time', name: 'ONE AT A TIME',
              text: 'Playing two Tricks of the same type in a row breaks the rule. '
                  + 'Reprimand: every enemy gains 6 Guard.' }
          : { id: 'no-running', name: 'NO RUNNING',
              text: `Playing a fourth Trick this turn breaks the rule. Reprimand: ${dmg} damage.` };
      },
      /**
       * Haunt 2 (design doc §30, "Door Greeter occasionally announces One at a Time
       * instead of only No Running"): it alternates between two different rules.
       * Below Haunt 2 the Greeter is a fixed lesson — you learn NO RUNNING once and
       * play around it forever. From Haunt 2 the rule on the board is no longer
       * predictable from the enemy alone; you have to read it every cycle, which is
       * the whole point of the Foyer.
       */
      effect(c) {
        const dmg = flag(c, 'reprimand', 6);
        const alt = flag(c, 'altRules') && countMoves(c, 'mind-your-manners') % 2 === 1;
        if (alt) {
          announce(c, {
            id: 'greeter-one-at-a-time', source: c.self.uid ?? c.self.id,
            name: 'ONE AT A TIME',
            text: 'Playing two Tricks of the same type in a row breaks the rule. '
                + 'Reprimand: every enemy gains 6 Guard.',
            when: 'cardPlayed', once: true,
            broken: (rc) => {
              const h = rc.cardsPlayedThisTurn || [];
              return h.length >= 2 && h[h.length - 1]?.type === h[h.length - 2]?.type;
            },
            onBreak: (cc) => { for (const e of board(cc)) cc.block(e, 6); },
          });
          return;
        }
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
      /* PARTY: the door does not care how many of you are leaning on it. Same
         reasoning as the Crawler's Umbrella Jab above — this was the other
         Foyer normal with no party content at all, and 10 stays 10. */
      pierceFn: (c) => c.partySize() > 1,
      effect(c) { hitPlayer(c, 10, 1, { pierce: c.partySize() > 1 }); },
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
    if (level >= 2) {
      h.flags.altRules = true;
      h.notes.push('Haunt 2: alternates ONE AT A TIME with NO RUNNING, so which rule is standing '
        + 'is no longer predictable from the enemy alone (design doc §30).');
    }
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
    // "Snag threshold becomes 18 damage times number of players. The damage
    // may be contributed by everyone during the round." (foyer §27.)
    if (dmgTaken(c) >= c.perPlayer(flag(c, 'snagThreshold', 18))) mem(c).snagged = true;
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
      /**
       * MULTIPLAYER. §27 gives the Coatcheck the per-player Snag threshold and
       * nothing else, so its targeting is unauthored — and it had none at all,
       * which measured at **-5.7 points against the arithmetic baseline** for
       * four Kids: worse than having no multiplayer logic, because it held one
       * Kid while three hit it freely (trap 38).
       *
       * "A dozen umbrellas open at once and swing in a single wide arc" is not
       * a move that picks a Kid. The number does not move — §26's default for
       * this region is "damage values normally remain unchanged".
       */
      partyTarget: 'all',
      tell: 'A dozen umbrellas open at once and swing in a single wide arc.',
      damageFn: (c) => 13 + grandCoatcheck.eveningBonus(c),
      effect(c) { hitPlayer(c, 13 + grandCoatcheck.eveningBonus(c)); },
    },
    'hanger-flurry': {
      id: 'hanger-flurry', name: 'Hanger Flurry', intent: Intent.ATTACK, damage: 4, hits: 3,
      partyPick: 'lowestCourage',
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
      /**
       * The one blow a party's Guard cannot answer. Coverage ADDS damage that
       * four Kids then block; only pierce is kept (CONTRACTS 45). `lowestCourage`
       * and not `lowestGuard` — §26 gives the Dust Bunny the Guard preference,
       * but this is the telegraphed big hit, and a preference computed from
       * state the player controls cannot both track it and stay still.
       */
      partyPick: 'lowestCourage',
      pierceFn: (c) => c.partySize() > 1,
      tell: 'Coats, hats, scarves and cases all lean toward you together.',
      damageFn: (c) => 17 + grandCoatcheck.eveningBonus(c),
      effect(c) {
        hitPlayer(c, 17 + grandCoatcheck.eveningBonus(c), 1, { pierce: c.partySize() > 1 });
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

  onSpawn(c) {
    mem(c).familiar = null;
    mem(c).familiarPlayed = 0;
    mem(c).reacted = {};
  },

  /**
   * How many Familiar Tricks ONE Kid has committed this turn.
   *
   * "Tracks Familiarity separately for every player. Its Too Familiar attack
   * targets whichever player became most Familiar during that round."
   * (docs/design/regions/01-foyer.md §27.) Counted off the whole table, two
   * Kids playing two Attacks each would hand the third-Trick punishment to
   * whoever happened to go second, for a line neither of them crossed.
   */
  familiarPlayedThisTurn(c, who = null) {
    const f = mem(c).familiar;
    if (!f) return 0;
    const list = who ? c.seatPlayed(who) : played(c);
    return list.filter(p => p && p.type === f).length;
  },

  /** The Kid who leaned hardest on the Familiar type this round. Ties go to seat order. */
  mostFamiliar(c) {
    const seats = c.players();
    if (seats.length <= 1) return seats[0] || null;
    let best = seats[0], bestN = -1;
    for (const pl of seats) {
      const n = unwelcomeGuest.familiarPlayedThisTurn(c, pl);
      if (n > bestN) { best = pl; bestN = n; }
    }
    return best;
  },

  /**
   * Engine hook: called after each player card, with `c.player` set to the Kid
   * who played it. The Guard and the reaction both belong to THAT Kid's count.
   */
  onPlayerCard(c) {
    const f = mem(c).familiar;
    if (!f) return;
    const who = (c.player && c.player.side === 'player') ? c.player : null;
    const n = unwelcomeGuest.familiarPlayedThisTurn(c, who);
    if (n === 2) c.block(c.self, 6);
    const key = who ? who.id : 'solo';
    const reacted = mem(c).reacted || (mem(c).reacted = {});
    if (n === 3 && !reacted[key]) {
      reacted[key] = true;
      c.damage(who || c.player, mem(c).bigReaction ? 10 : flag(c, 'familiarityDamage', 7));
      mem(c).bigReaction = false;
    }
  },

  onPlayerTurnEnd(c) {
    // Remember how Familiar the player just got — Too Familiar reads this. In a
    // party that is the HIGHEST single Kid's count, and Too Familiar goes for
    // them: "targets whichever player became most Familiar during that round".
    const worst = unwelcomeGuest.mostFamiliar(c);
    mem(c).familiarPlayed = unwelcomeGuest.familiarPlayedThisTurn(c, worst);
    if (worst) c.self.targetSeatId = worst.id;
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
    mem(c).reacted = {};
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
      // Counted against the Kid it is aiming at — the one who has leaned
      // hardest on the Familiar type this round (foyer §27). In solo that is
      // the only Kid there is, so the number is the one it always was.
      damageFn: (c) => Math.min(20, 13 + 3 * unwelcomeGuest.familiarPlayedThisTurn(c, unwelcomeGuest.mostFamiliar(c))),
      intentFn: (c) => (unwelcomeGuest.familiarPlayedThisTurn(c, unwelcomeGuest.mostFamiliar(c)) >= 2 ? Intent.ATTACK_BIG : Intent.ATTACK),
      /**
       * PARTY: the escalated version cuts through Guard. MEASURED 2026-08-29 —
       * `party-ledger.py --tier elite` read win% 100 at two, three and four
       * Kids against 83.3 solo, with %blocked CLIMBING 57.6 -> 68.3. A party
       * does not need more damage aimed at it; it blocks what is already
       * aimed. Only what is KEPT changes the fight, which is why this is
       * pierce and not another point of damage or another AoE.
       *
       * The threshold is exactly `intentFn`'s, so the turn the icon says BIG
       * is the turn Guard stops working — one tell, one rule, no move that
       * pierces while looking ordinary. Solo is untouched: `partySize() > 1`.
       *
       * Live count here, latched count in `effect`, for the same reason the
       * damage does it: `onPlayerTurnEnd` rotates `familiar` between the two,
       * and reading it live at resolve time once made this deal 15 while its
       * intent promised 12.
       */
      pierceFn: (c) => c.partySize() > 1
        && unwelcomeGuest.familiarPlayedThisTurn(c, unwelcomeGuest.mostFamiliar(c)) >= 2,
      effect(c) {
        const n = mem(c).familiarPlayed || 0;
        hitPlayer(c, Math.min(20, 13 + 3 * n), 1,
          { pierce: c.partySize() > 1 && n >= 2 });
      },
    },
    'wrong-face': {
      /**
       * PARTY: it turns toward you, and KEEPS TURNING — so it reaches two.
       *
       * MEASURED 2026-08-30, and this is the number nobody had looked at
       * because `party-ledger.html` computed it and never printed it:
       * `spread` — how evenly incoming damage is shared, 0 when one seat takes
       * everything — reads 0.14 to 0.28 in EVERY Foyer fight at EVERY party
       * size. Three Kids in four are spectators as far as incoming threat
       * goes, which no win rate would ever have surfaced.
       *
       * The Unwelcome Guest was the purest case at the elite tier: every one
       * of its moves was single-target, so a party of four watched one Kid
       * have the fight. `engine.partyTargets` says the design position
       * outright — AoE "is the only thing that makes a bigger party genuinely
       * more dangerous to be in, since damage per hit deliberately does not
       * scale."
       *
       * `partyTarget: 'two'` and NOT `'all'`, and the number does not move:
       * 9x2 to each, exactly the Governess's Snip Snip precedent (§27, §33) —
       * "the number stays at its solo value and the change is who it reaches.
       * Two seats is the coverage; cutting the number as well was tried and
       * measured nothing." Two rather than all because this is the ordinary
       * turn, not the telegraphed one; Too Familiar is still the big hit and
       * it still pierces.
       */
      id: 'wrong-face', name: 'Wrong Face', intent: Intent.ATTACK, damage: 9, hits: 2,
      partyTarget: 'two',
      /* And the TELL has to say so. I gave this move `partyTarget: 'two'`
         earlier today and quoted its own tell as the justification, then left
         the tell addressing one person — `tests/party-tells/check.py`, written
         an hour later for exactly this class, caught me. */
      tell: 'It turns toward you, and keeps turning.',
      tellFn: (c) => (c.partySize() > 1
        ? 'It turns toward you, and keeps turning until it is facing somebody else too.'
        : 'It turns toward you, and keeps turning.'),
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

  /** Roused armed by Ring for Service lands here, after every enemy has acted. */
  onEnemyPhaseEnd(c) {
    const stacks = mem(c).rousePending || 0;
    if (!stacks) return;
    mem(c).rousePending = 0;
    for (const a of allies(c)) c.applyStatus(a, 'roused', stacks);
  },

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
      appliesFn: (c) => (allies(c).length >= 2 ? [{ id: 'roused', stacks: 1, to: 'allies' }] : []),
      /**
       * The doc's Roused branch, restored. It was Guard for two rounds only because a
       * summoner is permanently slot 0 — every ally it could buff acts after it, so a
       * mid-phase Roused always landed on an already-telegraphed attack. Ordering could
       * never fix that. `onEnemyPhaseEnd` can: the Roused is armed now and applied once
       * every enemy has acted, so it shows up on the next intent and never behind it.
       */
      effect(c) {
        addCnt(c, 'resonance', 1, 4);
        if (allies(c).length >= 2) mem(c).rousePending = 1;
        else c.summon('dust-bunny', { hpMul: 0.6 });
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
      // MULTIPLAYER: hits all players (foyer §27).
      partyTarget: 'all',
      /**
       * PARTY: and it goes THROUGH Guard, which is the half that was missing.
       *
       * This move was already the AoE, and the ledger is precisely about why
       * that was not enough: "a pick SPREADS damage, AoE ADDS damage a party
       * then blocks, and only pierce is KEPT". Measured 2026-08-29 at
       * foyer/elite, `landed` moved 51.2 -> 52.6 from three Kids to four while
       * `aimed` moved 140.8 -> 165.9 — the fourth Kid's entire share of the
       * threat arrived as 1.4 damage, because four Kids generate Guard faster
       * than one elite can spend it. Adding to the 20 would have been eaten
       * the same way.
       *
       * It is the right move to carry it and the only one here that should:
       * it is named in capitals, it is ATTACK_BIG, it is telegraphed a turn
       * early at full Resonance, and its tell already promises the whole house
       * leaning in. Solo never sees it — `partySize() > 1`.
       */
      pierceFn: (c) => c.partySize() > 1,
      tell: 'The whole house leans toward the sound. This is going to be very loud.',
      damageFn: (c) => flag(c, 'tollDamage', 20),
      effect(c) {
        hitPlayer(c, flag(c, 'tollDamage', 20), 1, { pierce: c.partySize() > 1 });
        setCnt(c, 'resonance', 0);
      },
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
