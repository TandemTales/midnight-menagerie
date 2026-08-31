/**
 * The Moonlit Attic and Observatory — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/08-attic-observatory.md §1–§12, §49–§50.
 *
 * The Library watches what you DID. The Observatory shows you what is GOING TO
 * HAPPEN and then lets you move it. §2 names the three states a Forecast may be
 * in — Fixed, Conditional, Uncertain — and closes with the rule the whole region
 * is built on: "the region should never rely on HIDDEN COIN FLIPS DISGUISED AS
 * PREDICTION."
 *
 * ── THE ENGINE ALREADY HAD A FORECAST QUEUE ─────────────────────────────────
 *
 * Every enemy carries a four-slot `plan`: position 0 is what it resolves next,
 * 1..3 are what it intends after that. Wink has previewed, swapped and
 * postponed positions in it since she shipped. Until this region the whole API
 * lived on the CARD ctx, because the only thing that had ever rearranged a plan
 * was a player.
 *
 * `c.planOf(en)`, `c.swapIntents(en, a, b)` and `c.postponeIntent(en)` are the
 * enemy-side half, added for the Orrery Imp, which "does not increase damage
 * directly — it attacks the player's timeline" (§8). They take move IDS and
 * never move objects, for the same reason `cardsIn` returns snapshots.
 *
 * A swap LOCKS the positions it touched, so the next rebuild does not quietly
 * derive the old order back. That is the engine's own rule and it is what makes
 * a forecast worth manipulating.
 *
 * ── CONDITIONAL FORECASTS ARE `alternatives(c)`, NOT A SECRET ───────────────
 *
 * The Rafter Peeker's Flinch is §2's "Conditional" state exactly: it shows
 * Watching, and the moment you damage it the intent becomes Scramble Away. The
 * engine draws every branch of `alternatives(c)` side by side until one is
 * chosen and then collapses to it — the Night Terror's Watching You is the
 * same read, one region earlier. Nothing here rolls a die behind the icon.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag, played,
  playedOfType, dmgTaken, isAlive, whenHandArrives, runHandOps,
} from './_lib.js';

const REGION = 'attic-observatory';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const ATTIC_STATUSES = [
  {
    /**
     * §6. "A Webbed Trick is still fully playable. When played it costs 1
     * additional Nerve, then the Web is removed."
     *
     * The Graveyard's `forgotten` and the Library's `corrected` a third time,
     * and deliberately so — three regions now tax a named Trick once, and they
     * share one proven cost path rather than three nearly-identical ones.
     *
     * §6's other clause, "if the Webbed Trick is DISCARDED before being played
     * the Web also disappears", is real and is handled by the Cobweb Bundle:
     * a Web it put on a HAND Trick is swept at end of turn, because that hand
     * is about to be discarded. A Web on the draw pile survives, which is the
     * whole point of Web Ahead.
     */
    id: 'webbed', name: 'Webbed', kind: 'debuff', icon: 'webbed',
    desc: 'Silk across some of your Tricks. Each costs 1 additional Nerve the next time you play it.',
    decay: 'never', stacks: true,
    hooks: {
      modifyCardCost: (cost, h) => {
        const marks = h.owner && h.owner._webbed;
        return (marks && h.card && marks.has(h.card.uid)) ? cost + 1 : cost;
      },
      onCardPlayed: (h) => {
        const marks = h.owner && h.owner._webbed;
        if (!marks || !h.card || !marks.has(h.card.uid)) return;
        marks.delete(h.card.uid);
        h.consume(1);
      },
    },
  },
  {
    /**
     * §4. The Star Chart marks an ALLY's future attack: "an Auspicious attack
     * deals 4 additional damage when it eventually occurs."
     *
     * It decays at `enemyTurnEnd` rather than on the first hit it modifies, and
     * that is a deliberate reading of a rule the intent vocabulary cannot hold
     * both ways. `damage x hits` is all an intent can say. A +4 removed after
     * hit one would show (base+4) x hits and deliver base+4, base, base — the
     * exact lie `tests/enemies/audit.py` exists to catch. So Auspicious is +4
     * on EVERY hit of the attack it marks, which the intent states truthfully,
     * and the Star Chart prefers to mark a single-hit forecast (see `readStars`)
     * so the common case is the design's number exactly.
     */
    id: 'auspicious', name: 'Auspicious', kind: 'buff', icon: 'auspicious',
    desc: 'The stars favour its next attack. It deals {n} more damage per hit, then the omen passes.',
    decay: 'enemyTurnEnd', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, h) => amt + ((h.owner && h.owner._auspice) || 4),
    },
  },
];

/* ══ Web, and the seat set it lives on ══════════════════════════════════════ */

/**
 * Web Tricks. Returns the uids that took a mark.
 *
 * `cap` is §6's "maximum two Webbed Tricks from one Cobweb Bundle" (three at
 * Haunt 6) — per SOURCE, recomputed against the seat's set on every call, so a
 * Web the player has already paid frees a slot with nothing having to notice.
 */
export function web(c, seat, uids, cap = Infinity, fromHand = false) {
  const marks = (seat._webbed ||= new Set());
  const mine = (mem(c).webs = (mem(c).webs || []).filter(w => marks.has(w.uid)));
  const took = [];
  for (const u of uids) {
    if (mine.length + took.length >= cap) break;
    if (marks.has(u)) continue;
    marks.add(u);
    took.push(u);
    mine.push({ uid: u, fromHand });
  }
  if (took.length) c.applyStatus(seat, 'webbed', took.length);
  return took;
}

/** §6: a Web on a Trick that was DISCARDED rather than played comes off with it. */
export function sweepHandWebs(c, seat) {
  const marks = seat && seat._webbed;
  const mine = mem(c).webs || [];
  if (!marks || !mine.length) return 0;
  let n = 0;
  for (const w of mine.slice()) {
    if (!w.fromHand || !marks.has(w.uid)) continue;
    marks.delete(w.uid);
    n++;
  }
  mem(c).webs = mine.filter(w => marks.has(w.uid));
  if (n) c.removeStatus(seat, 'webbed');
  return n;
}

/** Living allies that have a forecast worth touching. */
function forecastable(c) {
  return allies(c).filter(a => isAlive(a) && ((c.planOf && c.planOf(a)) || []).filter(Boolean).length >= 2);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Rafter Peeker — the intent you change by swinging (§3)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player directly manipulates enemy intent through a simple action. This
 * is the region's cleanest introduction to the concept." (§3.)
 *
 * `alternatives(c)` draws both futures until the player commits, then collapses.
 * `dmgTaken` is the whole condition and it is readable during the enemy turn
 * that follows, which is what makes "this can change only once per turn" true
 * for free: the branch is a function of one number, not of a flag somebody has
 * to remember to reset.
 */
export const rafterPeeker = {
  id: 'rafter-peeker',
  name: 'Rafter Peeker',
  region: REGION,
  tier: 'normal',
  role: 'reactive',
  hp: [25, 25],
  silhouette: 'peeker',
  palette: ['#d8d2c4', '#8e8878', '#2a2721'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.55,
  lore: 'Something pale and small hanging upside down from a beam, mostly eyes, entirely unwilling to be looked at back.',

  moves: {
    watching: {
      id: 'watching', name: 'Watching', intent: Intent.UNKNOWN, damage: 9, hits: 1,
      tell: 'It is watching you and has not decided yet. Hitting it decides.',
      alternatives(c) {
        const alts = [
          { key: 'drop', label: 'If you leave it alone', intent: Intent.ATTACK, damage: 9, hits: 1,
            note: 'Drop Down: deals 9 damage.' },
          { key: 'scramble', label: 'If you damage it', intent: Intent.ATTACK_DEFEND,
            damage: 4, hits: 1, block: flag(c, 'scrambleGuard', 9),
            note: `Scramble Away: gains ${flag(c, 'scrambleGuard', 9)} Guard and deals 4.` },
        ];
        return dmgTaken(c) > 0 ? alts.filter(a => a.key === 'scramble') : alts;
      },
      intentFn: (c) => (dmgTaken(c) > 0 ? Intent.ATTACK_DEFEND : Intent.ATTACK),
      damageFn: (c) => (dmgTaken(c) > 0 ? 4 : 9),
      blockFn: (c) => (dmgTaken(c) > 0 ? flag(c, 'scrambleGuard', 9) : 0),
      effect(c) {
        if (dmgTaken(c) > 0) { c.block(c.self, flag(c, 'scrambleGuard', 9)); hitPlayer(c, 4); return; }
        hitPlayer(c, 9);
      },
    },
    'peek-again': {
      id: 'peek-again', name: 'Peek Again', intent: Intent.DEFEND, block: 5,
      tell: 'It edges back along the beam and resumes staring.',
      effect(c) { c.block(c.self, 5); },
    },
  },

  /* §3: Watching, resolve, Peek Again. The resolve IS Watching — one move with
     two faces — so the cycle is two beats, not three. */
  nextMove: (c) => cyc(['watching', 'peek-again'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.scrambleGuard = 12;
      h.notes.push('Haunt 3: Scramble Away gains 12 Guard instead of 9.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Star Chart — the enemy that makes ANOTHER enemy's turn worse (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Sometimes the most dangerous enemy is the one making another enemy's future
 * turn worse." (§4.)
 *
 * It marks an ALLY, so it is worthless alone — which is why §12 forbids it from
 * appearing alone in ordinary Scuffles, and why `REGION_RULES` carries that as
 * `neverAlone`.
 */
export const starChart = {
  id: 'star-chart',
  name: 'Star Chart',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [28, 28],
  silhouette: 'chart',
  palette: ['#2b3350', '#c9b978', '#12151f'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.9,
  lore: 'A brass-framed celestial chart hanging in the air. The stars on it rearrange themselves around silhouettes of whatever else is in the room.',

  /** §4: "On defeat, existing Auspicious marks disappear." */
  onDeath(c) {
    for (const a of allies(c)) c.removeStatus(a, 'auspicious');
    c.clearRules(`stars:${c.self.id}`);
  },

  moves: {
    'read-the-stars': {
      id: 'read-the-stars', name: 'Read the Stars', intent: Intent.BUFF,
      tell: 'It finds a shape in the stars that is about to be somebody else\'s problem.',
      effect(c) { readStars(c); },
    },
    'falling-star': {
      id: 'falling-star', name: 'Falling Star', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'One star comes loose.',
      effect(c) { hitPlayer(c, 6); },
    },
    recalculate: {
      id: 'recalculate', name: 'Recalculate', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'The chart redraws itself around a different silhouette.',
      effect(c) {
        c.block(c.self, 8);
        for (const a of allies(c)) c.removeStatus(a, 'auspicious');
        readStars(c);
      },
    },
  },

  nextMove: (c) => cyc(['read-the-stars', 'falling-star', 'recalculate', 'falling-star'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.auspice = 5;
      h.notes.push('Haunt 4: an Auspicious attack deals 5 more instead of 4.');
    }
    return h;
  },
};

/**
 * Mark one ally Auspicious. "Prefer the highest base damage forecast available."
 *
 * SINGLE-HIT FIRST, and that is not in §4 — it is what keeps §4's number honest.
 * Auspicious is +N per hit (see the status), so marking a 4x2 would deliver +8
 * where the chapter says +4. Preferring a single-hit attacker means the common
 * case is exactly the design, and a board of nothing but multi-hit attackers
 * gets a bigger omen the intent still states truthfully.
 */
function readStars(c) {
  const pool = allies(c).filter(a => isAlive(a) && a.intent && a.intent.damage > 0);
  if (!pool.length) { c.block(c.self, 6); return null; }
  const single = pool.filter(a => (a.intent.hits || 1) === 1);
  const from = single.length ? single : pool;
  let pick = from[0];
  for (const a of from) if ((a.intent.damage || 0) > (pick.intent.damage || 0)) pick = a;
  pick._auspice = flag(c, 'auspice', 4);
  /* `fresh`, or the omen never survives being cast. Auspicious decays at
     `enemyTurnEnd` and the Chart applies it DURING the enemy phase, so without
     this the decay bucket strips it seconds later in the same phase and the
     mark is gone before the ally it favours has drawn a new intent. This is the
     flag the engine documents for exactly that shape — "Doubt hands you 1 Weak
     at end of turn, and Weak also expires at end of turn". */
  c.applyStatus(pick, 'auspicious', 1, { fresh: true });
  c.announceRule({
    id: `stars:${c.self.id}`,
    name: `Auspicious: ${pick.name}`,
    text: `The stars favour it. Its next attack deals ${pick._auspice} more per hit. Kill the Chart and the omen goes with it.`,
  });
  return pick;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Telescope Eye — the enemy that watches YOU (§5)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player can deliberately change behaviour to alter the forecast, or
 * simply accept the stronger version because their preferred turn is worth
 * it." (§5.)
 *
 * The observation is recorded at `onPlayerTurnEnd` and the move it produces is
 * chosen at the NEXT player-turn start, which is the honest order: by the time
 * the intent is drawn the observation is already settled, so the number the
 * player reads is the number that lands.
 */
export const telescopeEye = {
  id: 'telescope-eye',
  name: 'Telescope Eye',
  region: REGION,
  tier: 'normal',
  role: 'predictor',
  hp: [36, 36],
  silhouette: 'telescope',
  palette: ['#8a7340', '#d6c493', '#241d12'],
  shape: { body: 'tall-thin', limbs: 3, eyes: 1 },
  scale: 0.95,
  lore: 'A brass telescope walking on three thin legs. The lens blinks.',

  onSpawn(c) { mem(c).watch = 'attacks'; mem(c).resolving = 'attacks'; mem(c).hit = false; announceEye(c); },

  /**
   * THE OBSERVATION IS DOUBLE-BUFFERED, and §5 asked for that in its own words:
   * it records the CURRENT turn and acts on it "NEXT TURN".
   *
   * The engine picks each move and draws its intent at player-turn START and
   * holds it. The first build scored the observation in `onPlayerTurnEnd` and
   * read it straight from `damageFn`, so the Eye showed 7 and hit for 13 — the
   * audit caught it. `pending` is written at turn end and NOTHING reads it;
   * it is promoted here, before the intent that carries it exists.
   */
  onPlayerTurnStart(c) {
    const m = mem(c);
    if (!m.pending) return;
    /* `resolving` is what it OBSERVED and is about to pay out; `watch` is what
       it is observing NEXT. They are two different things and collapsing them
       into one field made the Eye pay out the wrong move entirely: it observed
       Attacks, then advanced to Guard, then resolved as Guard — a 14-Guard
       turtle where §5 promises a 13-damage hit. §5's own pattern is
       "Observe Attacks. RESOLVE. Observe Guard. RESOLVE." — an observation and
       a resolution happen in the same turn, about different turns. */
    m.resolving = m.pending.kind;
    m.hit = !!m.pending.hit;
    m.pending = null;
    announceEye(c);
  },

  onPlayerTurnEnd(c) {
    const m = mem(c);
    const w = m.watch || 'attacks';
    let hit;
    if (w === 'attacks') hit = playedOfType(c, 'attack') >= 3;
    else if (w === 'guard') hit = (c.player && c.player.block || 0) >= 15;
    else hit = ((c.player && c.player.energy) || 0) >= 1;
    m.pending = { kind: w, hit };
    /* Haunt 5: "cycles through observations in a RANDOM VISIBLE order rather
       than the fixed sequence. The next observation is always shown." Random
       here and not in `nextMove`, because `nextMove` must stay pure. */
    const order = ['attacks', 'guard', 'nerve'];
    m.watch = flag(c, 'shuffleWatch', false)
      ? order[c.rng.int(order.length)]
      : order[(order.indexOf(w) + 1) % order.length];
    announceEye(c);
  },

  moves: {
    'predictable-violence': {
      id: 'predictable-violence', name: 'Predictable Violence', intent: Intent.ATTACK, damage: 13, hits: 1,
      damageFn: (c) => (mem(c).hit ? 13 : 7),
      tell: 'It saw that coming.',
      effect(c) { hitPlayer(c, mem(c).hit ? 13 : 7); },
    },
    'wait-them-out': {
      id: 'wait-them-out', name: 'Wait Them Out', intent: Intent.DEFEND, block: 14,
      blockFn: (c) => (mem(c).hit ? 14 : 8),
      tell: 'It settles on its three legs and waits.',
      effect(c) {
        const big = mem(c).hit;
        c.block(c.self, big ? 14 : 8);
        // "Its following attack deals 3 additional damage." A counter, so the
        // next intent renders the real number rather than a promise.
        if (big) setCnt(c, 'patience', 3);
      },
    },
    'missed-opportunity': {
      id: 'missed-opportunity', name: 'Missed Opportunity', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => (mem(c).hit ? 10 : 6) + cnt(c, 'patience'),
      tell: 'It noticed what you did not spend.',
      effect(c) {
        const d = (mem(c).hit ? 10 : 6) + cnt(c, 'patience');
        setCnt(c, 'patience', 0);
        hitPlayer(c, d);
      },
    },
  },

  /* §5: Observe Attacks, resolve, Observe Guard, resolve, Observe Nerve,
     resolve. The observation is state, not a move, so the cycle is the three
     resolutions and `mem.watch` decides which. */
  nextMove: (c) => {
    const w = mem(c).resolving || 'attacks';
    if (w === 'guard') return 'wait-them-out';
    if (w === 'nerve') return 'missed-opportunity';
    return 'predictable-violence';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.shuffleWatch = true;
      h.notes.push('Haunt 5: it picks its next observation freely. It still shows you which.');
    }
    return h;
  },
};

function announceEye(c) {
  const w = mem(c).watch;
  const TXT = {
    attacks: 'Watching your ATTACKS. Play 3 or more and its next hit is 13 instead of 7.',
    guard: 'Watching your GUARD. End on 15 or more and it turtles for 14 and sharpens its next hit.',
    nerve: 'Watching your NERVE. End with any unspent and its next hit is 10 instead of 6.',
  };
  c.announceRule({
    id: `eye:${c.self.id}`,
    name: `Observing: ${(w || 'attacks').toUpperCase()}`,
    text: TXT[w] || TXT.attacks,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Cobweb Bundle — the awkward card you can see coming (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Unlike the Quill Clerk, Cobweb Bundle is less about punishment and more
 * about forecasting which future card will be awkward." (§6.)
 *
 * Web Ahead names the top of the draw pile, which is the difference: you are
 * told which Trick will cost more before you have drawn it.
 */
export const cobwebBundle = {
  id: 'cobweb-bundle',
  name: 'Cobweb Bundle',
  region: REGION,
  tier: 'normal',
  role: 'markup',
  hp: [32, 32],
  silhouette: 'cobweb',
  palette: ['#cfd4d8', '#8b9096', '#22262a'],
  shape: { body: 'squat', limbs: 0, eyes: 4 },
  scale: 0.7,
  lore: 'A thick ball of moonlit webbing in the corner. It twitches. There are a great many small eyes inside it.',

  onSpawn(c) { mem(c).webs = []; },

  /** Sticky Strand webs the hand the player is about to hold. */
  onPlayerReady(c) { runHandOps(c); },

  /** §6: a Web on a Trick that was discarded rather than played comes off. */
  onPlayerTurnEnd(c) { sweepHandWebs(c, c.player); },

  moves: {
    'web-ahead': {
      id: 'web-ahead', name: 'Web Ahead', intent: Intent.DEBUFF,
      applies: [{ id: 'webbed', stacks: 1, to: 'player' }],
      tell: 'It throws a strand at something you have not drawn yet.',
      effect(c) {
        const draw = c.cardsIn ? c.cardsIn('draw') : [];
        if (!draw.length) { c.block(c.self, 6); return; }
        const pick = draw[0];
        const took = web(c, c.player, [pick.uid], flag(c, 'maxWebs', 2), false);
        if (!took.length) { c.block(c.self, 6); return; }
        c.announceRule({
          id: `web:${c.self.id}`,
          name: `Webbed on top: ${pick.name}`,
          text: 'The next Trick you draw has silk on it. It costs 1 additional Nerve once. This one survives the turn.',
        });
      },
    },
    'sticky-strand': {
      id: 'sticky-strand', name: 'Sticky Strand', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      applies: [{ id: 'webbed', stacks: 1, to: 'player' }],
      tell: 'A strand comes out fast and takes something with it.',
      effect(c) {
        hitPlayer(c, 7);
        whenHandArrives(c, (k) => {
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) return;
          const pick = hand[k.rng.int(hand.length)];
          const took = web(k, k.player, [pick.uid], flag(k, 'maxWebs', 2), true);
          if (!took.length) return;
          k.announceRule({
            id: `web:${k.self.id}`,
            name: `Webbed: ${pick.name}`,
            text: 'It costs 1 additional Nerve this turn. Discard it instead and the silk goes with it.',
          });
        });
      },
    },
    'wrap-up': {
      id: 'wrap-up', name: 'Wrap Up', intent: Intent.DEFEND, block: 11,
      tell: 'It pulls itself into a tighter ball.',
      effect(c) { c.block(c.self, 11); },
    },
  },

  nextMove: (c) => cyc(['web-ahead', 'sticky-strand', 'wrap-up', 'sticky-strand'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.maxWebs = 3;
      h.notes.push('Haunt 6: it can hold 3 Webs at once instead of 2.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 5. Moon Moth — a cycle you can read four turns out (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The player knows exactly when the vulnerable but dangerous Full Moon window
 * will arrive." (§7.)
 *
 * The phase is a counter, the next two phases are named on the House Rule, and
 * every damage number is a `damageFn` reading that counter — so the intent
 * shows the phase-adjusted number rather than a base the phase then changes.
 */
const PHASES = ['New Moon', 'Waxing', 'Full Moon', 'Waning'];
const phaseOf = (c) => cnt(c, 'phase') % 4;
/** §7's per-phase damage modifier. Full Moon's bonus is a Haunt 7 flag. */
function moonMod(c) {
  const p = phaseOf(c);
  if (p === 0) return -2;
  if (p === 2) return flag(c, 'fullMoon', 5);
  return 0;
}

export const moonMoth = {
  id: 'moon-moth',
  name: 'Moon Moth',
  region: REGION,
  tier: 'normal',
  role: 'cycler',
  hp: [34, 34],
  silhouette: 'moonmoth',
  palette: ['#dfe4ef', '#9aa3bb', '#2b3040'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.95,
  lore: 'A silver moth the size of a window. It is a slightly different shape every time you look away.',

  onSpawn(c) { setCnt(c, 'phase', 0); announceMoth(c); },

  /**
   * The phase turns at the END of the enemy turn, so the phase the intent was
   * drawn under is the phase the move resolves in. Turning it at turn START
   * would move the moon after the player had already read the number.
   */
  onTurnEnd(c) { addCnt(c, 'phase', 1, 999); announceMoth(c); },

  /** §7: New Moon gains Guard; Waning recovers Courage. */
  onTurnStart(c) {
    const p = phaseOf(c);
    if (p === 0) c.block(c.self, 8);
    if (p === 3) c.heal(c.self, 4);
  },

  /** §7: "Full Moon takes 20 percent additional damage." */
  damageTakenMul(c) { return phaseOf(c) === 2 ? 1.2 : 1; },

  moves: {
    'moon-dust': {
      id: 'moon-dust', name: 'Moon Dust', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => Math.max(0, 6 + moonMod(c)),
      tell: 'It shakes something fine and cold off its wings.',
      effect(c) { hitPlayer(c, Math.max(0, 6 + moonMod(c))); afterAttack(c); },
    },
    'silver-wing': {
      id: 'silver-wing', name: 'Silver Wing', intent: Intent.ATTACK, damage: 4, hits: 2,
      damageFn: (c) => Math.max(0, 4 + moonMod(c)),
      tell: 'Two slow beats, edge-on.',
      effect(c) { hitPlayer(c, Math.max(0, 4 + moonMod(c)), 2); afterAttack(c); },
    },
    moonflash: {
      id: 'moonflash', name: 'Moonflash', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      damageFn: (c) => Math.max(0, 14 + moonMod(c)),
      tell: 'The whole attic goes white.',
      effect(c) { hitPlayer(c, Math.max(0, 14 + moonMod(c))); afterAttack(c); },
    },
  },

  /* §7's cycle is Moon Dust / Silver Wing, "the phase itself changes the
     impact" — with Moonflash reserved for Full Moon, which is the one turn the
     player has been able to see coming for three turns. */
  nextMove: (c) => {
    if (phaseOf(c) === 2) return 'moonflash';
    return cyc(['moon-dust', 'silver-wing'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.fullMoon = 7;
      h.notes.push('Haunt 7: Full Moon adds 7 damage instead of 5. It is still 20% more fragile.');
    }
    return h;
  },
};

/** §7: "Waxing — after attacking, gain 4 Guard." */
function afterAttack(c) { if (phaseOf(c) === 1) c.block(c.self, 4); }

function announceMoth(c) {
  const p = phaseOf(c);
  const next = `${PHASES[(p + 1) % 4]}, then ${PHASES[(p + 2) % 4]}`;
  const TXT = [
    'New Moon: it gains 8 Guard each turn and its attacks deal 2 less.',
    'Waxing: normal damage, and it gains 4 Guard after it attacks.',
    `Full Moon: attacks deal ${flag(c, 'fullMoon', 5)} more — and it takes 20% MORE damage.`,
    'Waning: it recovers 4 Courage. Normal damage.',
  ];
  c.announceRule({
    id: `moon:${c.self.id}`,
    name: `${PHASES[p]} — then ${next}`,
    text: TXT[p],
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Orrery Imp — the enemy that attacks your TIMELINE (§8)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Orrery Imp does not increase damage directly. It attacks the player's
 * timeline." (§8.)
 *
 * It cannot change WHAT an ally will do, only WHEN — so every one of its
 * manipulations is `c.swapIntents(ally, a, b)` on a plan whose contents it
 * never touches. §8 asks the obvious question itself: "why would it ever slow
 * something down? Because delaying a moderate attack may allow it to combine
 * with another enemy's major attack."
 *
 * It is worthless with nobody to reschedule, so §12 keeps it out of the pools
 * until the player has met a forecast, and its fallback is a plain kick.
 */
export const orreryImp = {
  id: 'orrery-imp',
  name: 'Orrery Imp',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [31, 31],
  silhouette: 'orrery-imp',
  palette: ['#b98a3c', '#f0d9a0', '#2b1f0e'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.55,
  lore: 'A small brass thing running inside a model of the heavens, keeping it turning, occasionally turning it the wrong way on purpose.',

  moves: {
    'speed-up': {
      id: 'speed-up', name: 'Speed Up', intent: Intent.BUFF,
      tell: 'It runs the model faster. Something is going to arrive early.',
      effect(c) { rotate(c, 'sooner'); },
    },
    'slow-down': {
      id: 'slow-down', name: 'Slow Down', intent: Intent.BUFF,
      tell: 'It leans back against the gears. Something is going to arrive late.',
      effect(c) { rotate(c, 'later'); },
    },
    'brass-kick': {
      id: 'brass-kick', name: 'Brass Kick', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It kicks you with a very small brass foot.',
      effect(c) { hitPlayer(c, 6); },
    },
    'wind-the-mechanism': {
      id: 'wind-the-mechanism', name: 'Wind the Mechanism', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'It winds the whole orrery up.',
      effect(c) { c.block(c.self, 8); setCnt(c, 'wound', 1); },
    },
  },

  /**
   * §8: "If a useful forecast exists, alternate Speed Up and Slow Down.
   * Otherwise Brass Kick / Wind the Mechanism." Pure — `forecastable` only
   * reads plans, and the alternation is derived from history.
   */
  nextMove: (c) => {
    if (!forecastable(c).length) {
      return cyc(['brass-kick', 'wind-the-mechanism'], (c.history || []).length);
    }
    const turns = (c.history || []).filter(m => m === 'speed-up' || m === 'slow-down').length;
    return turns % 2 === 0 ? 'speed-up' : 'slow-down';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.advanced.flags.preWound = true;
      h.notes.push('Haunt 8: in advanced formations it arrives already wound, so its first rotation moves two forecasts.');
    }
    return h;
  },
};

/**
 * Move one ally's forecast one enemy turn closer or further away.
 *
 * A plan swap of adjacent positions is exactly "one turn closer/later", and
 * position 0 is never touched: §8 says Speed Up "cannot cause an action to
 * occur immediately on the current enemy turn", and the engine agrees — moving
 * what an enemy is about to do would make the intent the player already read a
 * lie. Wound (§8's Wind the Mechanism) lets one rotation hit two allies.
 */
function rotate(c, dir) {
  const pool = forecastable(c);
  if (!pool.length) { c.block(c.self, 6); return; }
  const many = cnt(c, 'wound') > 0 || flag(c, 'preWound', false);
  const picks = many ? pool.slice(0, 2) : [pool[c.rng.int(pool.length)]];
  setCnt(c, 'wound', 0);
  const moved = [];
  for (const a of picks) {
    // 'sooner' pulls slot 2 up to slot 1; 'later' pushes slot 1 back to slot 2.
    if (c.swapIntents && c.swapIntents(a, 1, 2)) moved.push(a.name);
  }
  if (!moved.length) { c.block(c.self, 6); return; }
  c.announceRule({
    id: `orrery:${c.self.id}`,
    name: dir === 'sooner' ? `Sped up: ${moved.join(', ')}` : `Slowed: ${moved.join(', ')}`,
    text: 'It cannot change WHAT they do. It changes WHEN. Read their forecasts again.',
  });
}

export const ATTIC_ENEMIES = [
  rafterPeeker, starChart, telescopeEye, cobwebBundle, moonMoth, orreryImp,
];
export const ATTIC_REGION = REGION;
