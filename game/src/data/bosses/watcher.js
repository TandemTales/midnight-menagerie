/**
 * The Watcher in the Rafters — the Attic and Observatory boss. OWNER: enemies.
 * Source of truth: docs/design/regions/08-attic-observatory.md §16–§34.
 *
 * "It does not merely see what the player is doing. It believes everything
 * dangerous can be PREVENTED if it sees far enough ahead. Its philosophy is: if
 * every possible future is known, nothing has to be risked. That makes it a
 * distorted mirror of Wink. WINK PREDICTS SO IT CAN ACT. THE WATCHER PREDICTS
 * SO IT CAN CONTROL." (§16.)
 *
 * ── THE FUTURE LINE IS THE ENGINE'S PLAN ────────────────────────────────────
 *
 * §17 asks for "a visible timeline containing its next three planned actions",
 * and the engine has had exactly that since Wink: every enemy carries a
 * four-slot `plan`, position 0 resolving next. So the Future Line is not a new
 * structure — it is `c.reveal(3)` on the one the engine already derives, and
 * `c.swapIntents(self, a, b)` is the Tug.
 *
 * That matters for more than tidiness. `deriveMoveId` asks `nextMove` for
 * position k with the k moves before it treated as already resolved, which is
 * what makes §19's generation rules ("never the same damaging action twice
 * consecutively", "no more than one Web the Hand within three slots")
 * expressible at all: at position k this def can read the plan prefix out of
 * `c.history` and simply decline to repeat itself. A swap LOCKS the positions
 * it touched, so a Tug is not quietly derived away on the next rebuild.
 *
 * ── THE TUG, AND THE ONE PLACE THIS DEVIATES ───────────────────────────────
 *
 * §20 gives the player a Tug at their third and fifth Trick, and §30 adds a
 * seventh in phase two. In PHASE ONE a Tug has exactly one legal effect —
 * "each Tug can swap the second and third future actions" — so firing it
 * automatically is not a choice taken away from anybody; it is the only move
 * there was.
 *
 * In PHASE TWO §30 widens it to "any two ADJACENT future positions except the
 * current", which is two options (2↔3 or 3↔4), and there is no engine surface
 * for an enemy to stop the fight and ask which. So the Tug resolves by a rule
 * PRINTED ON THE HOUSE RULE: it pushes the heaviest scheduled attack later.
 * That is what the section's own worked example does — "swapping can prevent
 * Skitter Above from immediately empowering the dangerous attack behind it" —
 * and it keeps §32's Every Thread Leads Here honest, because the Courage the
 * Watcher loses is paid for a move that really happened.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, hitPlayer, hauntBase, bossDmg, flag,
  phaseAt, played, playedOfType, whenHandArrives, runHandOps,
} from '../enemies/_lib.js';
import { web } from '../enemies/attic-observatory.js';

const REGION = 'attic-observatory';
const SOLO_MAX = 355;
const PHASE_TWO_AT = 200;
const EVERY_THREAD_AT = 75;

/** §22's four predictions. Each is a question about the turn the player is about to take. */
const PREDICTIONS = [
  { id: 'attacks', text: 'You will play 3 or more Attacks.', test: (c) => playedOfType(c, 'attack') >= 3 },
  { id: 'guard', text: 'You will gain at least 15 Guard.', test: (c) => ((c.player && c.player.block) || 0) >= 15 },
  { id: 'many', text: 'You will play 5 or more Tricks.', test: (c) => played(c).length >= 5 },
  { id: 'spent', text: 'You will end with 0 Nerve.', test: (c) => ((c.player && c.player.energy) || 0) === 0 },
];

/**
 * Every damaging move's bonus, in one place, read by BOTH `damageFn` and
 * `effect` — the rule `_lib.js` states for `bossDmg` and the reason the intent
 * can be trusted.
 *
 *   Certainty      §23, +2 attack damage each, max 3, cleared at the transition
 *   Skitter Above  §18, "the next damaging action deals 3 additional damage"
 *                  (4 in phase two, §29) — a counter, so the intent re-renders
 *   Every Thread   §32, Rafter Strike gains 2 below 75 Courage
 */
function watch(c) {
  return 2 * cnt(c, 'certainty') + cnt(c, 'skitter') + bossDmg(c);
}

/* ══ the Future Line ═════════════════════════════════════════════════════════ */

/** Phase-one and phase-two action pools (§18, §29). */
const POOL_ONE = ['rafter-strike', 'web-the-hand', 'skitter-above', 'drop-behind-you', 'readjust'];
const POOL_TWO = ['rafter-strike', 'web-the-hand', 'skitter-above', 'drop-behind-you',
                  'great-descent', 'false-future', 'sever-the-web'];
const DAMAGING = new Set(['rafter-strike', 'drop-behind-you', 'great-descent', 'sever-the-web']);

/**
 * §19's generation rules, expressed against the plan prefix the engine hands
 * `nextMove` as `c.history`.
 *
 * NO DIE. The engine derives each plan position with its own RNG fork, so a
 * roll here would in fact be stable per position — but `nextMove` is re-called
 * on every intent refresh from three different places, and only one of them is
 * that fork. Deriving the pick from the HISTORY instead makes the Future Line
 * deterministic everywhere it is asked, which is what "a previewed future
 * action is the action you actually get" (intents.js) has to mean.
 *
 * The mixer is a cheap deterministic hash of the plan prefix, so the line still
 * reads as varied rather than as a four-beat loop — §19 asks for "readable but
 * varied timelines" — and it changes when the prefix does, which is exactly
 * when the Watcher would legitimately re-plan.
 */
function pickAction(c, pool) {
  const h = c.history || [];
  const last = h[h.length - 1] || null;
  const recent = h.slice(-3);
  const ok = pool.filter((id) => {
    if (DAMAGING.has(id) && id === last) return false;              // never twice running
    if (id === 'web-the-hand' && recent.includes('web-the-hand')) return false;
    if (id === 'skitter-above' && recent.includes('skitter-above')) return false;
    if (id === 'great-descent' && recent.includes('great-descent')) return false;
    return true;
  });
  const from = ok.length ? ok : pool;
  let mix = h.length * 2654435761;
  for (let i = 0; i < h.length; i++) mix = (mix ^ ((h[i] || '').length * 31 * (i + 7))) >>> 0;
  return from[mix % from.length];
}

/** The heaviest scheduled attack among the swappable future positions. */
function heaviestFuture(c, lo, hi) {
  const plan = (c.planOf && c.planOf(c.self)) || [];
  let best = -1, bestWeight = -1;
  const WEIGHT = { 'great-descent': 20, 'rafter-strike': 14, 'drop-behind-you': 14, 'sever-the-web': 8 };
  for (let k = lo; k <= hi; k++) {
    const w = WEIGHT[plan[k]] ?? 0;
    if (w > bestWeight) { bestWeight = w; best = k; }
  }
  return bestWeight > 0 ? best : -1;
}

/* ══ the boss ════════════════════════════════════════════════════════════════ */
export const watcher = {
  id: 'the-watcher',
  name: 'The Watcher in the Rafters',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'watcher',
  palette: ['#3a3f52', '#c8cede', '#12141c'],
  shape: { body: 'sprawling', limbs: 8, eyes: 6 },
  scale: 1.95,
  lore: 'At first only the eyes, dozens of them, between the beams. Then a body the size of the roof unfolds out of the dark, its back patterned like a star map, silver thread running from it to every telescope and clock and chart in the room.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.tugs = 0;
    m.moved = 0;
    m.grounded = false;
    m.severed = false;
    setCnt(c, 'certainty', 0);
    setCnt(c, 'skitter', 0);
    // §17: the whole point is that the player can inspect the line.
    c.reveal(3);
    if (flag(c, 'openPrediction', false)) m.predictId = PREDICTIONS[0].id;
    announceLine(c);
  },

  onPlayerTurnStart(c) {
    const m = mem(c);
    m.tugs = 0;
    m.moved = 0;
    m.spentTugs = 0;
    /* CERTAINTY IS DOUBLE-BUFFERED. It is +2 attack damage and it is scored at
       the end of the player turn, which is AFTER the intent that would spend it
       was drawn and held — the Watcher promised 15 and hit for 17. The verdict
       is banked at turn end and cashed here, one step before intents. */
    if (m.pendingCertain) { m.pendingCertain = false; addCnt(c, 'certainty', 1, 3); }
    c.reveal(m.phase === 2 ? 3 : 3);
  },

  onPlayerReady(c) { runHandOps(c); },

  /**
   * §20 and §30's Tug. Earned at the third and fifth Trick (and the seventh in
   * phase two); §28's Sever the Web pushes the first threshold to four for one
   * turn.
   */
  onCardPlayed(c) {
    const m = mem(c);
    const n = (c.cardsPlayedThisTurn || []).length;
    const first = m.severed ? 4 : 3;
    const gates = m.phase === 2 ? [first, 5, 7] : [first, 5];
    if (!gates.includes(n)) return;
    if ((m.spentTugs || 0) >= gates.length) return;
    m.spentTugs = (m.spentTugs || 0) + 1;
    tug(c);
  },

  /** §22: the prediction is scored against the turn it was made about. */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    m.severed = false;
    const pred = m.predictId && PREDICTIONS.find(p => p.id === m.predictId);
    if (!pred) { m.predictId = null; return; }
    const right = !!pred.test(c);
    m.predictId = null;
    if (right) {
      m.pendingCertain = true;              // cashed at onPlayerTurnStart
      c.say('I saw that coming.', 'warn');
    } else {
      /* §23's Doubtful. The engine has no "player chooses where the next
         action is inserted" prompt, so the half that IS expressible is the
         one taken: it loses Guard it has not spent yet, and the Future Line
         it was so sure of gets shaken — one swap, in the player's favour. */
      if (c.self.block > 0) c.loseBlock(c.self, Math.min(8, c.self.block), 'doubtful');
      tug(c, true);
      c.say('…no.', 'warn');
    }
    announceLine(c);
  },

  /** §26's Grounded, and §31's lock on Great Descent. */
  damageTakenMul(c) { return mem(c).grounded ? 1.25 : 1; },

  onTurnEnd(c) {
    const m = mem(c);
    // Grounded lasts "until the end of the next player turn"; it is set by
    // Great Descent and cleared one full round later.
    if (m.grounded) { m.groundedSeen = m.groundedSeen ? false : true; if (!m.groundedSeen) m.grounded = false; }

    /* §22: "Every third Watcher turn it uses I Saw That Coming." Made HERE, at
       the end of its turn, so the prediction is on screen before the player
       takes the turn it is about, which §22 requires in the same sentence. The
       pick is per-turn deterministic through the enemy's own RNG. */
    if (!m.predictId && (c.history || []).length % 3 === 0) {
      /* The ID, never the object. `mem` is JSON round-tripped by
         `combat/actor.js` for autosave and resume, so a stored PREDICTIONS
         entry comes back without its `test` function — and the next scoring
         turn threw `m.predict.test is not a function`. Found by
         `tests/run/run.py`, which is the only suite that saves mid-fight.
         Enemy `mem` is PLAIN DATA ONLY. */
      m.predictId = PREDICTIONS[c.rng.int(PREDICTIONS.length)].id;
      c.say('I know what you are going to do.', 'warn');
    }
    if (m.phase === 1 || m.everyThread) { announceLine(c); return; }
    if (c.self.hp > phaseAt(c, EVERY_THREAD_AT, SOLO_MAX)) { announceLine(c); return; }
    m.everyThread = true;
    c.announceRule({
      id: `thread:${c.self.id}`,
      name: 'Every Thread Leads Here',
      text: 'Its network is coming apart. Every future action you move costs it 2 Courage, up to 6 a turn — and its own attacks have got heavier.',
    });
    c.say('Every thread leads here.', 'warn');
  },

  moves: {
    /* ── the action pool (§18, §29) ───────────────────────────────────────── */
    'rafter-strike': {
      id: 'rafter-strike', name: 'Rafter Strike', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => base(c, 12, 14) + watch(c) + (mem(c).everyThread ? 2 : 0),
      tell: 'One long limb comes down out of the beams.',
      effect(c) {
        const d = base(c, 12, 14) + watch(c) + (mem(c).everyThread ? 2 : 0);
        spendSkitter(c); hitPlayer(c, d);
      },
    },
    'drop-behind-you': {
      id: 'drop-behind-you', name: 'Drop Behind You', intent: Intent.ATTACK, damage: 6, hits: 2,
      damageFn: (c) => base(c, 6, 7) + watch(c) + (mem(c).everyThread ? 1 : 0),
      tell: 'It is not where it was.',
      effect(c) {
        const d = base(c, 6, 7) + watch(c) + (mem(c).everyThread ? 1 : 0);
        spendSkitter(c); hitPlayer(c, d, 2);
      },
    },
    'web-the-hand': {
      id: 'web-the-hand', name: 'Web the Hand', intent: Intent.DEBUFF,
      applies: [{ id: 'webbed', stacks: 2, to: 'player' }],
      tell: 'Thread comes down across everything you are holding.',
      effect(c) {
        whenHandArrives(c, (k) => {
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          const pool = hand.length >= 2 ? hand : (k.cardsIn ? k.cardsIn('draw') : []);
          if (!pool.length) { k.block(k.self, 6); return; }
          const picks = [];
          const seen = new Set();
          while (picks.length < 2 && seen.size < pool.length) {
            const x = pool[k.rng.int(pool.length)];
            if (seen.has(x.uid)) continue;
            seen.add(x.uid); picks.push(x);
          }
          const took = web(k, k.player, picks.map(x => x.uid), 4, hand.length >= 2);
          if (!took.length) return;
          k.announceRule({
            id: `web:${k.self.id}`,
            name: `Webbed: ${picks.filter(x => took.includes(x.uid)).map(x => x.name).join(', ')}`,
            text: 'Each costs 1 additional Nerve the next time you play it.',
          });
        });
      },
    },
    'skitter-above': {
      id: 'skitter-above', name: 'Skitter Above', intent: Intent.DEFEND_BUFF, block: 13,
      blockFn: (c) => base(c, 13, 14),
      tell: 'It moves along the beams to somewhere with a better angle.',
      effect(c) {
        c.block(c.self, base(c, 13, 14));
        // "The next damaging action in the Future Line deals 3 more" (4 in
        // phase two). A counter, so the very next intent shows the real number.
        setCnt(c, 'skitter', base(c, 3, 4));
        announceLine(c);
      },
    },
    readjust: {
      id: 'readjust', name: 'Readjust', intent: Intent.DEFEND, block: 6,
      tell: 'It rearranges what it was going to do.',
      effect(c) {
        c.block(c.self, 6);
        if (c.swapIntents) c.swapIntents(c.self, 1, 2);
        announceLine(c);
      },
    },

    /* ── the transition (§24) ─────────────────────────────────────────────── */
    'too-many-futures': {
      id: 'too-many-futures', name: 'Too Many Futures', intent: Intent.BUFF, anchored: true,
      tell: 'The ceiling comes apart and there is far too much sky behind it.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        setCnt(c, 'certainty', 0);                       // "clear all Certainty"
        // "Remove all Webs from Tricks."
        if (c.player && c.player._webbed) c.player._webbed.clear();
        c.removeStatus(c.player, 'webbed');
        c.reveal(3);
        announceLine(c);
        c.say('There are too many futures. I will watch them all.', 'warn');
      },
    },

    /* ── phase two (§26, §27, §28) ────────────────────────────────────────── */
    'great-descent': {
      id: 'great-descent', name: 'Great Descent', intent: Intent.ATTACK_BIG, damage: 20, hits: 1,
      damageFn: (c) => 20 + watch(c),
      tell: 'All of it comes down at once.',
      effect(c) {
        const d = 20 + watch(c);
        spendSkitter(c);
        hitPlayer(c, d);
        const m = mem(c);
        m.grounded = true;
        m.groundedSeen = false;
        c.announceRule({
          id: `ground:${c.self.id}`,
          name: 'Grounded',
          text: 'It is on the floor. It takes 25% more damage and cannot gain Guard until it climbs back. This is your window.',
        });
      },
    },
    'false-future': {
      id: 'false-future', name: 'False Future', intent: Intent.BUFF,
      tell: 'One of the futures on the line goes double-exposed.',
      effect(c) {
        /* §27: the marker holds two possible actions and the ACTUAL one is
           decided by a rule the player is shown — "if the player has played
           more Attacks than Skills during the previous turn, the first option,
           otherwise the second". Resolved into a real plan entry immediately,
           because a slot the engine cannot derive is a slot that renders as
           "???", which is the hidden coin flip §2 forbids. */
        const attacky = playedOfType(c, 'attack') > playedOfType(c, 'skill');
        const chosen = attacky ? 'rafter-strike' : 'web-the-hand';
        const plan = (c.planOf && c.planOf(c.self)) || [];
        const slot = plan[3] ? 3 : 2;
        if (c.self.plan) { c.self.plan[slot] = chosen; c.self.planLocked = Math.max(c.self.planLocked || 0, slot + 1); }
        c.block(c.self, 6);
        c.announceRule({
          id: `false:${c.self.id}`,
          name: `False Future → ${chosen === 'rafter-strike' ? 'Rafter Strike' : 'Web the Hand'}`,
          text: 'More Attacks than Skills last turn and it becomes Rafter Strike; otherwise it becomes Web the Hand. It has already decided which.',
        });
        announceLine(c);
      },
    },
    'sever-the-web': {
      id: 'sever-the-web', name: 'Sever the Web', intent: Intent.ATTACK_DEBUFF, damage: 8, hits: 1,
      damageFn: (c) => 8 + watch(c),
      tell: 'It cuts the strands you have been pulling on.',
      effect(c) {
        const d = 8 + watch(c);
        spendSkitter(c);
        hitPlayer(c, d);
        const m = mem(c);
        m.spentTugs = 99;                 // "the player loses all unused Tugs this turn"
        m.severed = true;                 // and the first Tug next turn costs a fourth Trick
        c.announceRule({
          id: `sever:${c.self.id}`,
          name: 'Severed',
          text: 'Your Tugs are gone for this turn, and next turn the first one costs a fourth Trick.',
        });
      },
    },
  },

  /**
   * The Future Line generator. Pure, per-position, and the transition is
   * anchored so no Tug can move the moment the fight changes shape.
   */
  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two && (c.planPosition ?? 0) === 0) {
      return 'too-many-futures';
    }
    const pool = (m.phase === 2) ? POOL_TWO : POOL_ONE;
    // §22: "every third Watcher turn it uses I Saw That Coming." Folded into
    // Skitter Above's slot rather than costing a whole action, so the pool
    // still reads the way §18 lists it.
    return pickAction(c, pool);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 10) {
      h.flags.openPrediction = true;
      h.notes.push('Haunt 10: it opens with a full Future Line and a prediction already made.');
    }
    return h;
  },
};

/** Phase-scaled base value: `one` in phase one, `two` in phase two (§29). */
function base(c, one, two) { return mem(c).phase === 2 ? two : one; }
function spendSkitter(c) { setCnt(c, 'skitter', 0); }

/**
 * One Tug. Swaps two adjacent FUTURE positions — never position 0, which is
 * §20's "the current next enemy action cannot be moved" and is also the only
 * way the intent the player already read stays true.
 */
function tug(c, free = false) {
  const m = mem(c);
  const hi = m.phase === 2 ? 3 : 2;
  let a = 1, b = 2;
  if (m.phase === 2) {
    // Printed rule: push the heaviest scheduled attack one slot later.
    const worst = heaviestFuture(c, 1, hi);
    if (worst > 0 && worst < hi) { a = worst; b = worst + 1; }
    else { a = 2; b = 3; }
  }
  if (!c.swapIntents || !c.swapIntents(c.self, a, b)) return false;
  m.tugs = (m.tugs || 0) + 1;
  /* §32: below 75 Courage, disrupting the network costs it. Capped at 6 a turn
     so a wide turn cannot simply delete the boss. `free` is the Doubtful swap,
     which the Watcher did to itself and is not paid for. */
  if (m.everyThread && !free && (m.moved || 0) < 6) {
    m.moved = (m.moved || 0) + 2;
    c.loseHp(c.self, 2);
  }
  announceLine(c);
  return true;
}

/**
 * The House Rule carries the RULES, not the line.
 *
 * The first build printed the four plan slots in the card's NAME, which was
 * wrong twice over: the engine already draws the revealed Future Line under the
 * intent — that is what `c.reveal(3)` buys — so the card duplicated it, and at
 * `onSpawn` the plan has not been derived yet, so a screenshot caught the card
 * reading "FUTURE LINE —" with nothing after the dash.
 */
/** The standing prediction, looked up by id. */
function predictionText(c) {
  const id = mem(c).predictId;
  const p = id && PREDICTIONS.find(x => x.id === id);
  return p ? `It predicts: ${p.text}` : '';
}

function announceLine(c) {
  const m = mem(c);
  const gates = m.phase === 2 ? '3rd, 5th and 7th' : '3rd and 5th';
  c.announceRule({
    id: `line:${c.self.id}`,
    name: m.phase === 2 ? 'The Future Line — four deep' : 'The Future Line',
    text: `Your ${gates} Trick each earn a Tug, and a Tug swaps two FUTURE actions — never the one it is about to do. `
      + (m.phase === 2 ? 'A Tug pushes its heaviest scheduled attack one slot later. ' : '')
      + (cnt(c, 'certainty') ? `Certainty ${cnt(c, 'certainty')}/3: every attack deals ${2 * cnt(c, 'certainty')} more. ` : '')
      + (predictionText(c) || ''),
  });
}

export const ATTIC_BOSSES = [watcher];
