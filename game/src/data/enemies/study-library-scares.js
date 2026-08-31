/**
 * The Grand Study and Library — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/07-study-library.md §14–§16, §43–§45.
 *
 *   The Bookwyrm       it eats one of your Tricks and gets better at the thing
 *                      that Trick was. Hit it hard enough and it gives one back.
 *   The Living Index   three counters you can see, and you decide which one
 *                      trips. A long combo turn can trip all three.
 *   The Inkblot Oracle it copies the most EXPENSIVE Trick you played, so the
 *                      cost of your finisher is now part of the cost.
 *
 * ── EVERY BONUS HERE IS A COUNTER, NOT A DAMAGE STATUS ──────────────────────
 *
 * Sharp Prose, Useful Reference, Insight, Permanent Record, Violence and Vision
 * are all worded "+N damage" or "+N Guard", and the obvious build is a status
 * with `modifyDamageDealt`. That build lies twice over here.
 *
 *   1. The Bookwyrm's Page Storm is 4 damage THREE TIMES. A `modifyDamageDealt`
 *      of +4 adds 4 to EVERY hit, so Sharp Prose reads "+4" and delivers +12.
 *      The intent's whole vocabulary is `damage x hits`, so it cannot say
 *      "8, then 4, then 4" — one of the two numbers has to be a lie.
 *   2. Several of these are gained by the very move that spends them, and the
 *      intent is drawn before the move resolves.
 *
 * Counters read by `damageFn`/`blockFn` fix both: the displayed number is
 * computed from the state the move WILL have, it re-renders when the counter
 * moves, and a per-hit bonus is per-hit on purpose and visibly so.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, hitPlayer, hauntBase, flag, played,
  whenHandArrives, runHandOps,
} from './_lib.js';
import { correct, TYPES } from './study-library.js';

const REGION = 'study-library';

/* ══ Big Scare 1 — The Bookwyrm (§14, §43) ═══════════════════════════════════
 *
 * "What Trick are you willing to temporarily lose? A weak Basic? A Power you
 * did not intend to play yet? A strong Trick you know you can recover
 * immediately through burst damage? That makes Devour a MEANINGFUL PLAYER
 * CHOICE rather than random card theft." (§14.)
 *
 * DEVIATION, and the region's second one. §14 says "the player chooses one
 * Trick from their hand", and there is no engine surface for an enemy to stop
 * the fight and ask — the same wall Book Bat's Haunt 3 reveal hits.
 *
 * Random theft is the one thing §14 explicitly is not, so the Wyrm takes the
 * MOST EXPENSIVE Trick in hand and SAYS SO on a House Rule from the moment it
 * spawns. That keeps the decision the chapter actually wants — the player
 * chooses what is in their hand when Demand a Volume resolves, and spending the
 * expensive Trick first is a real and available answer — while never being a
 * surprise. Ties go to the Trick drawn most recently.
 */
const RECOVER_AT = { 1: 22, 2: 34, 3: 44, 4: 52 };
/* §43's own table reads "2 players: 34 Courage. 3 players: 4 players:" — the
   last two lines are LITERALLY BLANK in the chapter. 44 and 52 continue the
   curve 22→34 at the shape the rest of the region uses for party thresholds
   (Paper Knight's 14/20/26/31), and are flagged here as authored-by-us rather
   than quoted, so a later pass can correct them against the doc if it grows. */
const recoverThreshold = (c) => RECOVER_AT[Math.min(4, Math.max(1, c.partySize ? c.partySize() : 1))] || 22;

/** +1 attack damage per Insight (§14). */
const wyrmDmg = (c) => cnt(c, 'insight') + 4 * cnt(c, 'sharp-prose');
/** +2 max Guard per Insight, and Useful Reference's one-off +6. */
const wyrmGuard = (c) => 2 * cnt(c, 'insight') + 6 * cnt(c, 'reference');

export const bookwyrm = {
  id: 'bookwyrm',
  name: 'The Bookwyrm',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [139, 139],
  silhouette: 'wyrm',
  palette: ['#6d5b3f', '#cbb98f', '#241d14'],
  shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  scale: 1.5,
  lore: 'A long serpent shingled in overlapping pages instead of scales. Its belly is full of half-digested books and it is still hungry.',

  onSpawn(c) {
    mem(c).swallowed = [];
    setCnt(c, 'insight', 0);
    setCnt(c, 'sharp-prose', 0);
    setCnt(c, 'reference', 0);

    /* Haunt 9: "begins with one random swallowed Basic Trick from the player's
       draw pile. The Trick is shown immediately." */
    if (flag(c, 'openingMeal', false)) {
      const draw = c.cardsIn ? c.cardsIn('draw') : [];
      if (draw.length) swallow(c, draw[c.rng.int(draw.length)]);
    }
    announceWyrm(c);
  },

  /**
   * §14's recovery. "Whenever the Bookwyrm loses at least 22 Courage during one
   * player turn: it coughs up the OLDEST Swallowed Trick. Once per turn."
   *
   * Measured from `damageTakenThisTurn` at the end of the player turn, which is
   * where that number is still readable — but the RETURN is queued, because the
   * hand has already been closed by step 3 and a Trick pushed into it here
   * would sit outside the pile the next deal builds. Queued, it is in the hand
   * the player actually picks up, which is what "returns immediately to the
   * player's hand" has to mean.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    if (!m.swallowed.length) return;
    if ((c.self.damageTakenThisTurn || 0) < recoverThreshold(c)) return;
    const back = m.swallowed.shift();                    // oldest first
    whenHandArrives(c, (k) => {
      if (k.returnToHand) k.returnToHand(back.uid);
      else if (k.moveCardTo) k.moveCardTo(back.uid, 'hand');
      announceWyrm(k);
    });
  },

  /** The Wyrm takes its volume, and gives one back, from a real hand. */
  onPlayerReady(c) { runHandOps(c); },

  moves: {
    'demand-a-volume': {
      id: 'demand-a-volume', name: 'Demand a Volume', intent: Intent.DEFEND_DEBUFF, block: 5,
      blockFn: (c) => 5 + wyrmGuard(c),
      tell: 'It opens its mouth and waits to be handed something.',
      effect(c) {
        /* GUARD FIRST, THEN SWALLOW, and the order is load-bearing. Swallowing a
           Skill grants Useful Reference — "next time it gains Guard, gain 6
           additional" — and `blockFn` was evaluated for the intent before this
           move ran, when nothing had been eaten yet. Swallowing first would let
           this same Guard gain collect a bonus the displayed number could not
           have known about. "NEXT time" is also the literal wording. */
        gainGuard(c, 5);
        /* Queued: there is no hand during the enemy phase. The Wyrm opens its
           mouth now and takes the volume when the player picks their Tricks
           up — which lands before intents are drawn, so the bonus the swallow
           grants is already inside the number on its next intent. */
        whenHandArrives(c, (k) => {
          if (mem(k).swallowed.length >= 3) return;      // "Maximum three Swallowed Tricks."
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) return;
          // The announced rule: the most expensive, ties to the most recent.
          let pick = hand[0];
          for (const x of hand) if ((x.cost || 0) >= (pick.cost || 0)) pick = x;
          swallow(k, pick);
          announceWyrm(k);
        });
      },
    },
    'spine-whip': {
      id: 'spine-whip', name: 'Spine Whip', intent: Intent.ATTACK, damage: 13, hits: 1,
      damageFn: (c) => 13 + wyrmDmg(c),
      tell: 'It cracks the whole length of itself at you.',
      effect(c) { const d = 13 + wyrmDmg(c); spendProse(c); hitPlayer(c, d); },
    },
    'page-storm': {
      id: 'page-storm', name: 'Page Storm', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => 4 + wyrmDmg(c),
      tell: 'Loose pages come off it edge-first, three times.',
      effect(c) { const d = 4 + wyrmDmg(c); spendProse(c); hitPlayer(c, d, 3); },
    },
    digest: {
      id: 'digest', name: 'Digest', intent: Intent.DEFEND_BUFF, block: 8,
      blockFn: (c) => 8 + wyrmGuard(c),
      tell: 'Something inside it stops struggling.',
      effect(c) {
        /* "Use all pending swallowed type bonuses that can currently resolve."
           Guard is the one that resolves here; Sharp Prose is spent by the next
           attack and Insight is permanent, so both are already resolved. */
        gainGuard(c, 8);
        announceWyrm(c);
      },
    },
  },

  nextMove: (c) => cyc(['demand-a-volume', 'spine-whip', 'page-storm', 'demand-a-volume', 'digest'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openingMeal = true;
      h.notes.push('Haunt 9: it starts the fight having already swallowed one of your Tricks.');
    }
    return h;
  },
};

/** Swallow one Trick and take the bonus its TYPE grants (§14). */
function swallow(c, card) {
  const m = mem(c);
  if (m.swallowed.length >= 3) return null;
  // Out of the deck for the fight. Piles are per-combat, so "all remaining
  // Tricks return after combat" is what happens by simply not putting it back.
  if (c.moveCardTo) c.moveCardTo(card.uid, 'exhaust');
  m.swallowed.push({ uid: card.uid, name: card.name, type: card.type });
  if (card.type === 'attack') addCnt(c, 'sharp-prose', 1, 1);
  else if (card.type === 'skill') addCnt(c, 'reference', 1, 1);
  else if (card.type === 'power') addCnt(c, 'insight', 1, 3);
  return card;
}

/** Guard, plus Useful Reference's one-off and Insight's standing bonus. */
function gainGuard(c, base) {
  c.block(c.self, base + wyrmGuard(c));
  setCnt(c, 'reference', 0);                             // "next time it gains Guard"
}

/** Sharp Prose is spent by the attack that used it. */
function spendProse(c) { setCnt(c, 'sharp-prose', 0); }

function announceWyrm(c) {
  const m = mem(c);
  const eaten = m.swallowed.map(s => s.name).join(', ');
  c.announceRule({
    id: `wyrm:${c.self.id}`,
    name: eaten ? `Swallowed: ${eaten}` : 'Swallowed: nothing yet',
    text: `Demand a Volume takes the MOST EXPENSIVE Trick in your hand, up to three. `
      + `Deal it ${recoverThreshold(c)} damage in one turn and it coughs the oldest one back. `
      + `Everything it still holds comes back after the fight.`,
  });
}

/* ══ Big Scare 2 — The Living Index (§15, §44) ═══════════════════════════════
 *
 * "The Entry counters are COMPLETELY VISIBLE. The player can intentionally stop
 * a category at 3. Or deliberately trigger it now to clear the counter before a
 * more important turn." (§15.)
 *
 * So the three counters are real engine counters under the Courage bar, and
 * nothing about Filing is hidden or random.
 */
const FILE_AT = { 1: 4, 2: 6, 3: 7, 4: 8 };
/* §44 gives 4 solo and 6 at two players and then, like §43, stops mid-table.
   7 and 8 continue it, and §44's stated reason — "intentionally less than
   simply multiplying by player count because team play naturally produces more
   varied Trick types" — is what keeps them well under 4x. Authored by us. */
const fileAt = (c) => FILE_AT[Math.min(4, Math.max(1, c.partySize ? c.partySize() : 1))] || 4;

/** +2 attack damage per Permanent Record, +4 while Violence is pending. */
const indexDmg = (c) => 2 * cnt(c, 'permanent-record') + 4 * cnt(c, 'violence');

export const livingIndex = {
  id: 'living-index',
  name: 'The Living Index',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [126, 126],
  silhouette: 'catalogue',
  palette: ['#8a6a43', '#d4b98c', '#2a2118'],
  shape: { body: 'sprawling', limbs: 8, eyes: 0 },
  scale: 1.55,
  lore: 'An enormous wooden card catalogue walking on dozens of little drawer legs. Every drawer opens into another drawer.',

  onSpawn(c) {
    const start = flag(c, 'openingEntries', 0);
    for (const t of TYPES) setCnt(c, `e-${t}`, start);
    mem(c).filed = [];
    setCnt(c, 'permanent-record', 0);
    setCnt(c, 'violence', 0);
    announceIndex(c);
  },

  /**
   * "Whenever the player plays a Trick: add 1 Entry to the appropriate
   * category. At 4 Entries that category becomes Filed. It immediately resets
   * to 0 and schedules an effect for the next enemy turn." (§15.)
   *
   * §44 makes the counters SHARED across all players, so this counts every
   * Trick the table plays and does not care whose it was.
   */
  onCardPlayed(c) {
    const rec = c.card;
    if (!rec || !TYPES.includes(rec.type)) return;
    const key = `e-${rec.type}`;
    const n = addCnt(c, key, 1, 99);
    if (n < fileAt(c)) { announceIndex(c); return; }
    setCnt(c, key, 0);
    mem(c).filed.push(rec.type);              // §15: multiple may File in one turn
    announceIndex(c);
  },

  /**
   * The Filed effects. "ALL scheduled effects resolve. This makes extremely
   * long combo turns potentially dangerous." — so this drains the queue rather
   * than taking one, which is the difference between the Living Index and the
   * Archivist.
   *
   * At PLAYER-TURN START, for the reason the Archivist's twin of this hook
   * carries in full: Cross Reference: Violence sharpens the next attack, and
   * run from the enemy's own `onTurnStart` that bonus lands after the intent
   * has already been drawn and committed. The audit caught it 36 times here —
   * Drawer Charge promising 11 and delivering 15, Catalogue Slam promising 10
   * and delivering 18.
   */
  onPlayerTurnStart(c) {
    const q = mem(c).filed;
    if (!q || !q.length) return;
    while (q.length) {
      const t = q.shift();
      if (t === 'attack') { c.block(c.self, 14); addCnt(c, 'violence', 1, 1); }
      else if (t === 'skill') { c.block(c.self, 10); c.applyStatus(c.player, 'smothered', 1); }
      else if (t === 'power') { addCnt(c, 'permanent-record', 1, 3); }
    }
    announceIndex(c);
  },

  moves: {
    'drawer-charge': {
      id: 'drawer-charge', name: 'Drawer Charge', intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + indexDmg(c),
      tell: 'It runs at you on all thirty legs.',
      effect(c) { const d = 11 + indexDmg(c); setCnt(c, 'violence', 0); hitPlayer(c, d); },
    },
    'catalogue-slam': {
      id: 'catalogue-slam', name: 'Catalogue Slam', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + indexDmg(c),
      tell: 'Two drawers, one after the other.',
      effect(c) { const d = 5 + indexDmg(c); setCnt(c, 'violence', 0); hitPlayer(c, d, 2); },
    },
    reshelve: {
      id: 'reshelve', name: 'Reshelve', intent: Intent.DEFEND, block: 10,
      tell: 'It puts something back where it thinks it goes.',
      effect(c) {
        c.block(c.self, 10);
        // "Reduce the highest current Entry count by 1."
        let best = null;
        for (const t of TYPES) if (best === null || cnt(c, `e-${t}`) > cnt(c, `e-${best}`)) best = t;
        if (best && cnt(c, `e-${best}`) > 0) addCnt(c, `e-${best}`, -1, 99);
        announceIndex(c);
      },
    },
  },

  nextMove: (c) => cyc(['drawer-charge', 'reshelve', 'catalogue-slam', 'drawer-charge'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openingEntries = 1;
      h.notes.push('Haunt 9: it begins with 1 Entry in every category.');
    }
    return h;
  },
};

function announceIndex(c) {
  const n = fileAt(c);
  const row = TYPES.map(t => `${t[0].toUpperCase()}${t.slice(1)} ${cnt(c, `e-${t}`)}/${n}`).join(' · ');
  c.announceRule({
    id: `index:${c.self.id}`,
    name: `Entries — ${row}`,
    text: `Every Trick you play files an Entry. At ${n} the category trips: Attacks give it 14 Guard and a sharper next hit, `
      + `Skills give it 10 Guard and cost you a draw, Powers make it permanently stronger. Everything that trips resolves.`,
  });
}

/* ══ Big Scare 3 — The Inkblot Oracle (§16, §45) ═════════════════════════════
 *
 * "Playing an expensive Trick may still be completely correct. But now its
 * enemy echo becomes part of the cost calculation." (§16.)
 *
 * This is the enemy the engine's played-card record gained a `cost` field for.
 * It needs the PRINTED cost — §16 says "3 per printed Nerve cost" — and the
 * Library is the region that makes Tricks cost more, so reading the effective
 * cost would let a Quill Clerk's Correction inflate the Oracle's echo and make
 * the intent a number the player cannot derive from their own cards.
 */
const oracleDmg = (c) => cnt(c, 'vision');

export const inkblotOracle = {
  id: 'inkblot-oracle',
  name: 'The Inkblot Oracle',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [132, 132],
  silhouette: 'oracle',
  palette: ['#14121a', '#3d3850', '#08070b'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 3 },
  scale: 1.6,
  lore: 'A towering black shape behind a desk, with no fixed body. Whatever you just did appears inside it, slightly wrong.',

  onSpawn(c) {
    mem(c).reflection = null;
    mem(c).pending = null;
    setCnt(c, 'vision', flag(c, 'openingVision', 0));
    announceOracle(c);
  },

  /**
   * THE REFLECTION IS DOUBLE-BUFFERED, and this hook is the whole reason.
   *
   * The engine picks each enemy's move and draws its intent at PLAYER TURN
   * START (`refreshIntents('turnStart')`), and holds that pick until the move
   * resolves. The first build of this enemy recorded the Reflection in
   * `onPlayerTurnEnd` and read it straight from `damageFn` — so the player was
   * shown "5" for an echo of nothing, then played a 1-Nerve Attack, and the
   * Oracle hit for 8. `tests/enemies/run.py` caught it as a 1.60x lie.
   *
   * So `onPlayerTurnEnd` writes `pending` and NOTHING reads it, and `pending`
   * is promoted here — before the intent for this round is drawn and never
   * during it. §16's own wording is what falls out: the Trick you played is
   * echoed "NEXT TURN", where you can see it coming and answer it.
   */
  onPlayerTurnStart(c) {
    const m = mem(c);
    if (m.pending === undefined) return;
    m.reflection = m.pending || null;
    m.pending = null;
    announceOracle(c);
  },

  /**
   * §16: "At the end of the player turn, the Inkblot Oracle selects the highest
   * Nerve cost Trick played that turn. Ties use the last tied Trick."
   *
   * §45 makes that the highest cost played by ANY player. `cardsPlayedThisTurn`
   * is already the whole table's — the per-seat list is `c.seatPlayed(who)` —
   * so the party rule is the one this code naturally expresses, and solo is the
   * same rule with one seat.
   *
   * "A 0 Nerve Trick still produces a Reflection." So an empty-cost pick is a
   * real pick and only an EMPTY TURN leaves the Oracle with nothing.
   */
  /** Blot the Margin writes on a Trick the player can actually see. */
  onPlayerReady(c) { runHandOps(c); },

  onPlayerTurnEnd(c) {
    const list = played(c).filter(p => p && TYPES.includes(p.type));
    if (!list.length) { mem(c).pending = null; announceOracle(c); return; }
    let pick = list[0];
    for (const p of list) if (printedCost(p) >= printedCost(pick)) pick = p;   // ties → last
    // `pending`, NOT `reflection` — see onPlayerTurnStart above.
    mem(c).pending = { type: pick.type, cost: printedCost(pick), name: pick.name };
    announceOracle(c);
  },

  moves: {
    'violent-reflection': {
      id: 'violent-reflection', name: 'Violent Reflection', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => 5 + 3 * reflCost(c) + oracleDmg(c),
      tell: 'The shape of your biggest swing comes back out of it, wrong.',
      effect(c) { hitPlayer(c, 5 + 3 * reflCost(c) + oracleDmg(c)); },
    },
    'protective-reflection': {
      id: 'protective-reflection', name: 'Protective Reflection', intent: Intent.ATTACK_DEFEND, damage: 4, hits: 1, block: 6,
      blockFn: (c) => 6 + 4 * reflCost(c),
      damageFn: (c) => 4 + oracleDmg(c),
      tell: 'It copies your caution, and then some.',
      effect(c) { c.block(c.self, 6 + 4 * reflCost(c)); hitPlayer(c, 4 + oracleDmg(c)); },
    },
    'enduring-reflection': {
      id: 'enduring-reflection', name: 'Enduring Reflection', intent: Intent.BUFF,
      tell: 'It keeps a copy of something you meant to keep.',
      effect(c) {
        // "Gain 1 Vision per printed Nerve cost. Maximum 5 total Vision."
        addCnt(c, 'vision', Math.max(1, reflCost(c)), 5);
        announceOracle(c);
      },
    },
    'ink-finger': {
      id: 'ink-finger', name: 'Ink Finger', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => 9 + oracleDmg(c),
      tell: 'One long wet finger, straight at you.',
      effect(c) { hitPlayer(c, 9 + oracleDmg(c)); },
    },
    'blot-the-margin': {
      id: 'blot-the-margin', name: 'Blot the Margin', intent: Intent.DEBUFF,
      applies: [{ id: 'corrected', stacks: 1, to: 'player' }],
      tell: 'It leans over and writes in your margin.',
      effect(c) {
        whenHandArrives(c, (k) => {
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) { k.block(k.self, 6); return; }
          const pick = hand[k.rng.int(hand.length)];
          const took = correct(k, k.player, [pick.uid]);
          if (!took.length) { k.block(k.self, 6); return; }
          k.announceRule({
            id: `blot:${k.self.id}`,
            name: `Corrected: ${pick.name}`,
            text: 'It costs 1 additional Nerve the next time you play it.',
          });
        });
      },
    },
    'wash-away': {
      id: 'wash-away', name: 'Wash Away', intent: Intent.DEFEND, block: 16,
      tell: 'Everything it was wearing runs off it.',
      effect(c) {
        /* "Lose all current Guard. Then gain 16 Guard. This INTENTIONALLY
           resets accumulated defensive modifiers." */
        if (c.loseBlock) c.loseBlock(c.self, c.self.block || 0, 'wash-away');
        c.block(c.self, 16);
      },
    },
  },

  /** §16: Reflection, Ink Finger, Blot the Margin, Reflection, Wash Away. */
  nextMove: (c) => {
    const beat = cyc([0, 1, 2, 3, 4], (c.history || []).length);
    if (beat === 1) return 'ink-finger';
    if (beat === 2) return 'blot-the-margin';
    if (beat === 4) return 'wash-away';
    const r = mem(c).reflection;
    if (!r) return 'ink-finger';                    // nothing played: no echo to give
    if (r.type === 'attack') return 'violent-reflection';
    if (r.type === 'skill') return 'protective-reflection';
    return 'enduring-reflection';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openingVision = 1;
      h.notes.push('Haunt 9: it begins with 1 Vision.');
    }
    return h;
  },
};

/**
 * Printed Nerve cost of a played Trick, clamped for the two special costs.
 *
 * `cost` is `card.baseCost`, where -1 means X and -2 means unplayable. §16 gives
 * no reading for either, and "3 per printed Nerve cost" of an X Trick is not a
 * number, so both floor at 0 — which §16 already has a rule for: "a 0 Nerve
 * Trick still produces a Reflection. The base effect remains."
 */
function printedCost(rec) { return Math.max(0, (rec && rec.cost) || 0); }

/** The cost of the Trick currently being reflected. Pure — safe from damageFn. */
function reflCost(c) {
  const r = mem(c).reflection;
  return r ? Math.max(0, r.cost || 0) : 0;
}

function announceOracle(c) {
  const m = mem(c);
  const r = m.reflection;
  const p = m.pending;
  const v = cnt(c, 'vision');
  c.announceRule({
    id: `oracle:${c.self.id}`,
    name: r ? `Reflecting: ${r.name} (${r.cost} Nerve)` : 'Reflecting: nothing',
    text: `It copies the most EXPENSIVE Trick you played each turn and echoes it on the turn AFTER, so what it is holding now is what its intent says.`
      + (p ? ` Next it will echo ${p.name} (${p.cost} Nerve).` : '')
      + (v ? ` Vision ${v}/5: every attack it makes deals ${v} more.` : ''),
  });
}

export const STUDY_LIBRARY_SCARES = [bookwyrm, livingIndex, inkblotOracle];
