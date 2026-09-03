/**
 * The Archivist — the Grand Study and Library boss. OWNER: enemies.
 * Source of truth: docs/design/regions/07-study-library.md §17–§35, §46–§48.
 *
 * "The Archivist does not consider Crinkle a prisoner. It considers Crinkle
 * PART OF THE COLLECTION. That distinction means everything to The Archivist
 * and nothing to Crinkle." (§17.)
 *
 * The Keeper's argument again, ten wings early, with the word "safe" swapped
 * for the word "catalogued" — and §58's closing line is the whole region:
 * "The Archivist knows almost everything about Crinkle. It still does not
 * understand what Crinkle wants."
 *
 * ── THE CATALOGUE IS A RESOURCE, NOT A PUNISHMENT METER ─────────────────────
 *
 * §23 is the most important section in the chapter and the one thing this fight
 * must get right:
 *
 *   "Suppose all three categories become Filed during one enormous turn. The
 *   Archivist can process only ONE next turn. The other two remain Filed. While
 *   they remain Filed, the player can continue playing those Trick types
 *   WITHOUT ADDING MORE ENTRIES. This means deliberately overwhelming The
 *   Catalogue can be strategically excellent."
 *
 * So a Filed tab is a SHIELD as well as a debt, and `addEntry` below refuses to
 * count into a Filed tab on purpose. Every other piece — the one-per-turn
 * processing limit, the oldest-first order, Cross Reference paying out for a
 * triple File — exists to make that exploit real rather than theoretical.
 * A version of this boss that processed everything waiting each turn would be
 * mechanically simpler and would delete the entire strategy the chapter is about.
 *
 * ── WHY MISFILED USES onPlayerReady ─────────────────────────────────────────
 *
 * §27 says Misfiled is applied "at the beginning of every player turn". The
 * engine's `onPlayerTurnStart` fires BEFORE the hand is dealt — engine.js says
 * so in its own comment, and an enemy that read the hand there "named nothing,
 * ever". `onPlayerReady` is the hook that exists for exactly this moment.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, cyc, hitPlayer, hauntBase, bossDmg, flag,
  phaseAt, seatKey, whenHandArrives, runHandOps,
} from '../enemies/_lib.js';
import { correct, TYPES, catalogueType, misfile, unfile } from '../enemies/study-library.js';

const REGION = 'study-library';
const SOLO_MAX = 200;
const PHASE_TWO_AT = 195;
const FINAL_EDITION_AT = 75;

/* §46: "It processes up to 1 Filed tab with one player, 2 with two players,
   2 with three players, 3 with four players. It always processes the OLDEST
   Filed tabs first." Quoted exactly — note 2 and 3 players are both 2, which
   is the chapter's number and not a typo on our part. */
const PROCESS_CAP = { 1: 1, 2: 2, 3: 2, 4: 3 };

/** §18 / §28: a tab Files at 4 in phase one and 3 in phase two. */
const fileAt = (c) => (mem(c).phase === 2 ? 3 : 4);

/**
 * Every damaging move's bonus, in one place.
 *
 *   Citation        §22, +1 permanent attack damage each, max 5
 *   Offensive Works §20, "its next damaging move deals 4 additional damage"
 *                   (5 in phase two, §30) — a counter so the intent re-renders
 *   Final Edition   §31, +2 for the rest of the fight below 75 Courage
 *   bossDmg         the Haunt ladder's per-hit boss pressure
 *
 * Read by BOTH `damageFn` and `effect` on every attack, which is the rule
 * `_lib.js` states for `bossDmg` and the reason the intent can be trusted.
 */
function punch(c) {
  return cnt(c, 'citation')
    + (cnt(c, 'offensive') ? (mem(c).phase === 2 ? 5 : 4) : 0)
    + (mem(c).finalEdition ? 2 : 0)
    + bossDmg(c);
}

/* ══ the Catalogue ═══════════════════════════════════════════════════════════
 *
 * §46: "Each player has their own three Catalogue counters. This is preferable
 * to one enormous shared Catalogue because each Companion should retain a
 * distinct relationship to the boss."
 *
 * So the tabs live per SEAT in `mem`. The three counters drawn under the
 * Courage bar mirror the seat the boss is currently aimed at, which in solo is
 * the only seat there is and is exactly §18's three tabs; in a party the House
 * Rule prints the whole table, because four Kids times three tabs is twelve
 * numbers and the counter row is not where twelve numbers belong.
 */
function tabs(c, seat) {
  const key = seatKey(seat || c.player);
  const all = (mem(c).cat ||= {});
  return (all[key] ||= { attack: 0, skill: 0, power: 0, filed: {} });
}

/** Read a seat's tabs WITHOUT creating them. Safe from blockFn / damageFn. */
function tabsOf(c, seat) {
  const all = mem(c).cat || {};
  return all[seatKey(seat || c.player)] || { attack: 0, skill: 0, power: 0, filed: {} };
}

/**
 * Mirror the aimed seat's tabs onto the displayed counters.
 *
 * A FILED tab shows FULL — `fileAt` — rather than a sentinel. The first build
 * wrote -1 for "Filed", which the counter row under the Courage bar would have
 * drawn as a literal "-1" next to three honest numbers. Full is both true and
 * readable: the tab is at its limit and will take nothing more until the
 * Archivist gets to it, which is exactly what the House Rule says in words.
 */
function showTabs(c) {
  const t = tabs(c, c.player);
  for (const k of TYPES) setCnt(c, `tab-${k}`, t.filed[k] ? fileAt(c) : t[k]);
}

/**
 * §18: "Whenever the player plays a Trick, add 1 Catalogue Entry to the
 * matching tab. At 4 Entries that tab becomes Filed. A FILED TAB CANNOT GAIN
 * ADDITIONAL ENTRIES until The Archivist processes it."
 *
 * That last sentence is §23's exploit and is the reason for the early return.
 */
function addEntry(c, seat, type, n = 1) {
  if (!TYPES.includes(type)) return;
  const t = tabs(c, seat);
  if (t.filed[type]) return;                       // §18/§23: Filed tabs take nothing
  t[type] += n;
  if (t[type] < fileAt(c)) return;
  t[type] = 0;
  t.filed[type] = true;
  (mem(c).queue ||= []).push({ seat: seatKey(seat), type, at: (mem(c).seq = (mem(c).seq || 0) + 1) });
}

/** How many tabs this table currently has Filed, across all seats. */
function filedCount(c) {
  return (mem(c).queue || []).length;
}

/* ══ the boss ════════════════════════════════════════════════════════════════ */
export const archivist = {
  id: 'the-archivist',
  name: 'The Archivist',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'archivist',
  palette: ['#e8dfc8', '#8a6a2f', '#241f18'],
  shape: { body: 'tall-thin', limbs: 6, eyes: 4 },
  scale: 1.9,
  lore: 'A tall figure in layered paper robes. Its head is an old brass library lamp ringed with floating spectacles, and a dozen mechanical hands file, stamp and shelve around it without ever stopping.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.cat = {};
    m.queue = [];
    m.crossUsed = {};
    m.finalEdition = false;
    setCnt(c, 'citation', 0);
    setCnt(c, 'offensive', 0);

    /* Haunt 10: "begins combat with 2 Attack Entries, 1 Skill Entry, 1 Power
       Entry. The opening Catalogue state is VISIBLE before the player acts." */
    const open = flag(c, 'openingCatalogue', null);
    if (open) {
      const t = tabs(c, c.player);
      t.attack = open.attack || 0; t.skill = open.skill || 0; t.power = open.power || 0;
    }
    showTabs(c);
    announceCatalogue(c);
  },

  /**
   * §27's Misfiled, and §48's party rule: "each player receives at most one
   * Misfiled Trick per round. With four players, The Archivist marks only two
   * players each round and alternates targets. This prevents excessive UI
   * clutter."
   *
   * Phase two only. `onPlayerReady` because the hand does not exist yet at
   * `onPlayerTurnStart` — see the header.
   */
  onPlayerReady(c) {
    processCatalogue(c);
    runHandOps(c);
    if (mem(c).phase !== 2) return;
    const hand = c.cardsIn ? c.cardsIn('hand') : [];
    if (!hand.length) return;
    const pick = hand[c.rng.int(hand.length)];
    /* §27's own examples: Attack counted as Skill, Skill as Power, Power as
       Attack. A fixed rotation rather than a random type, because "the new
       Catalogue type is shown on the card" and a rule the player can learn is
       worth more here than a surprise. */
    const as = TYPES[(TYPES.indexOf(pick.type) + 1) % TYPES.length] || 'skill';
    misfile(c, c.player, pick, as);
    c.announceRule({
      id: `misfile:${c.self.id}`,
      name: `Misfiled: ${pick.name} → ${as}`,
      text: 'It still does exactly what it says. The Catalogue will file it as the other type — which you can use.',
    });
  },

  /** Entries, in Catalogue terms — so a Misfiled Trick files as its label (§34). */
  onCardPlayed(c) {
    const rec = c.card;
    if (!rec) return;
    const seat = c.by || c.player;
    const type = catalogueType(seat, rec);
    /* §24's Stamp of Approval: "the next Trick added to a Catalogue tab counts
       as 2 Entries instead of 1. This effect disappears after triggering." */
    const n = mem(c).stamped ? 2 : 1;
    const before = tabs(c, seat).filed[type];
    addEntry(c, seat, type, n);
    if (!before && mem(c).stamped) mem(c).stamped = false;
    if (seat && seat._misfiled && seat._misfiled.uid === rec.uid) unfile(c, seat);
    showTabs(c);
    announceCatalogue(c);
  },

  /** "Misfiled disappears after that Trick is played OR AT END OF TURN." (§27.) */
  onPlayerTurnEnd(c) { unfile(c, c.player); },

  /**
   * §19: "At the beginning of The Archivist's turn, if one or more tabs are
   * Filed, process the tab that became Filed FIRST. Only one tab is processed
   * per enemy turn during phase one. After processing, reset that tab to 0.
   * OTHER FILED TABS REMAIN WAITING."
   *
   * PROCESSED AT PLAYER-TURN START, NOT `onTurnStart`, and that is a deliberate
   * shift of one step rather than of one turn.
   *
   * Offensive Works grants "its next damaging move deals 4 additional damage".
   * Run from the Archivist's own `onTurnStart` that lands INSIDE the enemy
   * phase — after the move was committed and its intent drawn at player-turn
   * start — so the boss showed a 12 and hit for 16. The intent audit caught it
   * 44 times across two enemies and a third of a Living Index fight.
   *
   * Filing at step 4 of the player's turn puts every consequence — the Guard,
   * the Citation, the sharper next hit, and Cross Reference itself — in front
   * of the player BEFORE they commit the turn that has to answer it. It also
   * reads better than the chapter's wording: the Archivist does its paperwork
   * while you are deciding, and you watch it happen.
   */
  /** §32: "While Overwhelmed: take 20 percent additional damage." */
  damageTakenMul(c) { return mem(c).overwhelmed ? 1.2 : 1; },

  moves: {
    /* ── phase one (§24) ──────────────────────────────────────────────────── */
    'paper-cutter': {
      id: 'paper-cutter', name: 'Paper Cutter', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + punch(c),
      tell: 'A guillotine arm comes down out of the robes.',
      effect(c) { const d = 8 + punch(c); spendOffensive(c); hitPlayer(c, d); },
    },
    'stamp-of-approval': {
      id: 'stamp-of-approval', name: 'Stamp of Approval', intent: Intent.DEFEND_BUFF, block: 12,
      tell: 'It stamps something, hard, and looks satisfied.',
      effect(c) {
        c.block(c.self, 12);
        mem(c).stamped = true;
        announceCatalogue(c);
      },
    },
    'margin-correction': {
      id: 'margin-correction', name: 'Margin Correction', intent: Intent.ATTACK_DEBUFF, damage: 7, hits: 1,
      damageFn: (c) => 7 + punch(c),
      applies: [{ id: 'corrected', stacks: 1, to: 'player' }],
      tell: 'It writes on you and on something in your hand.',
      effect(c) {
        const d = 7 + punch(c);
        spendOffensive(c);
        hitPlayer(c, d);
        // The cut lands now; the correction is waiting on the hand you pick up.
        whenHandArrives(c, (k) => correctFrom(k, 'hand', 1));
      },
    },
    reorganize: {
      id: 'reorganize', name: 'Reorganize', intent: Intent.DEFEND, block: 8,
      blockFn: (c) => (tidy(c) ? 13 : 8),
      tell: 'It puts the drawers back in an order only it understands.',
      effect(c) {
        /* "Reduce the highest NON-FILED Catalogue counter by 1. If every tab is
           either at 0 or Filed: gain 13 Guard instead." */
        if (tidy(c)) { c.block(c.self, 13); return; }
        c.block(c.self, 8);
        const t = tabs(c, c.player);
        let best = null;
        for (const k of TYPES) {
          if (t.filed[k] || t[k] <= 0) continue;
          if (best === null || t[k] > t[best]) best = k;
        }
        if (best) t[best] -= 1;
        showTabs(c);
        announceCatalogue(c);
      },
    },

    /* ── the transition (§26) ─────────────────────────────────────────────── */
    'this-collection-is-misclassified': {
      id: 'this-collection-is-misclassified', name: 'This Collection Is Misclassified',
      intent: Intent.BUFF,
      tell: 'It tears the labels off its own drawers and looks at your hand.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        /* "Clear all NON-FILED Catalogue Entries. Resolve no waiting Filed
           effects. WAITING FILED TABS REMAIN FILED." — the queue survives, which
           means a player who overloaded the Catalogue before the transition
           keeps every shield they bought. */
        for (const key of Object.keys(m.cat || {})) {
          const t = m.cat[key];
          for (const k of TYPES) if (!t.filed[k]) t[k] = 0;
        }
        showTabs(c);
        announceCatalogue(c);
        c.say('This collection is misclassified.', 'warn');
      },
    },

    /* ── phase two (§29) ──────────────────────────────────────────────────── */
    'red-pen': {
      id: 'red-pen', name: 'Red Pen', intent: Intent.ATTACK_BIG, damage: 10, hits: 1,
      damageFn: (c) => 10 + punch(c),
      tell: 'It uncaps the big one.',
      effect(c) { const d = 10 + punch(c); spendOffensive(c); hitPlayer(c, d); },
    },
    'binding-thread': {
      id: 'binding-thread', name: 'Binding Thread', intent: Intent.ATTACK, damage: 5, hits: 3,
      damageFn: (c) => 5 + punch(c),
      blockFn: (c) => (filedCount(c) > 0 ? 6 : 0),
      tell: 'Thread goes through you the way it goes through a spine.',
      effect(c) {
        const d = 5 + punch(c);
        spendOffensive(c);
        hitPlayer(c, d, 3);
        if (filedCount(c) > 0) c.block(c.self, 6);
      },
    },
    'complete-revision': {
      id: 'complete-revision', name: 'Complete Revision', intent: Intent.DEFEND_DEBUFF, block: 7,
      applies: [{ id: 'corrected', stacks: 2, to: 'player' }],
      tell: 'It revises one thing you are holding and one thing you have not drawn.',
      effect(c) {
        c.block(c.self, 7);
        /* BOTH halves are queued, though only the hand one has to be.
           Splitting them — draw pile now, hand at the start of your turn —
           made the move apply ONE Corrected where its intent declared two, and
           `tests/enemies/run.py` calls that out as a pip that lies about
           magnitude. Queued together, the intent's "2 Corrected" is exactly
           what arrives, in one announcement, at the one moment both piles
           exist. */
        whenHandArrives(c, (k) => {
          const got = correctFrom(k, 'hand', 1);
          correctFrom(k, 'draw', 1 + (1 - got));
        });
      },
    },
    'reshelve-everything': {
      id: 'reshelve-everything', name: 'Reshelve Everything', intent: Intent.DEBUFF,
      tell: 'Every drawer in the room slides one notch.',
      effect(c) {
        /* "Each non-Filed Catalogue counter moves 1 step TOWARD 2. 0 becomes 1.
           1 becomes 2. 2 remains 2. THIS CANNOT DIRECTLY FILE A CATEGORY." —
           so it is clamped at 2 and never calls addEntry. */
        for (const key of Object.keys(mem(c).cat || {})) {
          const t = mem(c).cat[key];
          for (const k of TYPES) {
            if (t.filed[k]) continue;
            t[k] = t[k] < 2 ? t[k] + 1 : 2;
          }
        }
        showTabs(c);
        announceCatalogue(c);
      },
    },

    /* ── §32's rare move ──────────────────────────────────────────────────── */
    'cross-reference': {
      id: 'cross-reference', name: 'Cross Reference', intent: Intent.DEFEND, block: 15,
      tell: 'Every hand it has stops at once. It has found a contradiction.',
      effect(c) {
        const m = mem(c);
        c.block(c.self, 15);
        if (cnt(c, 'citation') > 0) addCnt(c, 'citation', -1, 5);
        m.overwhelmed = true;
        m.crossPending = false;
        c.announceRule({
          id: `cross:${c.self.id}`,
          name: 'Overwhelmed',
          text: 'You filed all three at once. It takes 20% more damage until the end of your next turn.',
        });
      },
    },
  },

  /**
   * Overwhelmed lasts "until the end of the next player turn", cleared here so
   * the player gets the whole turn they earned.
   */
  onEnemyPhaseEnd(c) {
    const m = mem(c);
    if (!m.overwhelmed) return;
    if (!m.overwhelmedSeen) { m.overwhelmedSeen = true; return; }
    m.overwhelmed = false;
    m.overwhelmedSeen = false;
    c.clearRules(`cross:${c.self.id}`);
  },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'this-collection-is-misclassified';
    if (m.crossPending) return 'cross-reference';

    if (m.phase === 2) {
      return cyc(['red-pen', 'complete-revision', 'binding-thread', 'reshelve-everything'],
        countPhaseTwo(c));
    }
    // §24's opening sequence, repeating.
    return cyc(['stamp-of-approval', 'paper-cutter', 'margin-correction', 'paper-cutter', 'reorganize'],
      (c.history || []).length);
  },

  /**
   * §31's Final Edition. Announced the moment it becomes true rather than as a
   * move, because it is a standing change to how Correction behaves and the
   * player has to be able to read it.
   */
  onTurnEnd(c) {
    const m = mem(c);
    if (m.finalEdition) return;
    if (c.self.hp > phaseAt(c, FINAL_EDITION_AT, SOLO_MAX)) return;
    m.finalEdition = true;
    c.announceRule({
      id: `final:${c.self.id}`,
      name: 'Final Edition',
      text: 'It has abandoned procedure. Corrections now fall off a Trick once you DRAW it, played or not — and every attack it makes deals 2 more.',
    });
    c.say('Never mind the filing.', 'warn');
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 10) {
      h.flags.openingCatalogue = { attack: 2, skill: 1, power: 1 };
      h.notes.push('Haunt 10: it opens with 2 Attack, 1 Skill and 1 Power Entry already filed.');
    }
    return h;
  },
};

/**
 * §19's processing, run from .
 *
 * TWO constraints pick that hook and only that hook satisfies both.
 *   * Offensive Works sharpens the next damaging move, so it must land BEFORE
 *     intents are drawn or the boss shows a 12 and hits for 16. The audit
 *     caught exactly that 44 times.
 *   * Practical Works applies Correction to Tricks IN HAND, and there is no
 *     hand at  (it fires before the deal) or anywhere in the
 *     enemy phase (the hand is closed three steps earlier).
 *  is step 6c: after the deal, before the intents.
 */
function processCatalogue(c) {
  const m = mem(c);
  const q = m.queue || [];
  if (!q.length) { showTabs(c); return; }

  /* §32's Cross Reference, checked before processing — it is the reward for
     having all three Filed AT ONCE, and processing one would end that. */
  if (!m.crossUsed[m.phase] && allThreeFiled(c)) {
    m.crossPending = true;
    m.crossUsed[m.phase] = true;
    return;
  }

  const cap = PROCESS_CAP[Math.min(4, Math.max(1, c.partySize ? c.partySize() : 1))] || 1;
  for (let i = 0; i < cap && q.length; i++) {
    const entry = q.shift();                     // oldest first
    process(c, entry);
  }
  showTabs(c);
  announceCatalogue(c);
}

/* ── the Filed effects (§20–§22, upgraded by §30) ───────────────────────────── */
function process(c, entry) {
  const m = mem(c);
  const two = m.phase === 2;
  const seat = seatOf(c, entry.seat);
  const t = tabs(c, seat);
  t.filed[entry.type] = false;
  t[entry.type] = 0;

  if (entry.type === 'attack') {
    // Offensive Works — §20, §30.
    c.block(c.self, two ? 18 : 16);
    setCnt(c, 'offensive', 1);
  } else if (entry.type === 'skill') {
    // Practical Works — two Corrections, three in phase two.
    const want = two ? 3 : 2;
    const got = correctFrom(c, 'hand', want);
    if (got < want) correctFrom(c, 'draw', want - got);
  } else if (entry.type === 'power') {
    // Restricted Works — §22, §30. Citation is a GLOBAL boss buff even in a
    // party (§47), which is why it is a counter on the boss and not per seat.
    addCnt(c, 'citation', 1, 5);
    c.block(c.self, two ? 10 : 8);
  }
}

/** Every tab of every seat currently Filed — §32's trigger. */
function allThreeFiled(c) {
  const all = mem(c).cat || {};
  for (const key of Object.keys(all)) {
    const t = all[key];
    if (TYPES.every(k => t.filed[k])) return true;
  }
  return false;
}

/** §24's Reorganize condition: every tab is either at 0 or Filed. */
function tidy(c) {
  /* `tabsOf`, NOT `tabs`: Reorganize's blockFn calls this to choose between 8
     and 13 Guard, and blockFn is re-run every time the intent is drawn. `tabs`
     lazily CREATES the seat record, and creating state inside intent rendering
     is a write on a path the engine treats as pure — the same rule that forbids
     mutating from `nextMove`. */
  const t = tabsOf(c, c.player);
  return TYPES.every(k => t.filed[k] || t[k] <= 0);
}

function seatOf(c, key) {
  const players = (typeof c.players === 'function' && c.players()) || [];
  return players.find(p => seatKey(p) === key) || c.player;
}

function spendOffensive(c) { setCnt(c, 'offensive', 0); }

/**
 * Correction, from a named pile. Returns how many actually took.
 *
 * §21: "Targets can come from hand first, then draw pile if fewer than two
 * valid Tricks are in hand. AFFECTED TRICKS ARE REVEALED." — the reveal is the
 * House Rule, which is the only surface that can name a Trick.
 */
function correctFrom(c, pile, want) {
  if (want <= 0) return 0;
  const list = c.cardsIn ? c.cardsIn(pile) : [];
  if (!list.length) return 0;
  const pool = list.slice(0, pile === 'draw' ? want : list.length);
  const took = correct(c, c.player, pool.map(x => x.uid).slice(0, want));
  if (!took.length) return 0;
  const names = pool.filter(x => took.includes(x.uid)).map(x => x.name).join(', ');
  c.announceRule({
    id: `revise:${c.self.id}`,
    name: `Corrected: ${names}`,
    text: 'Each costs 1 additional Nerve the next time you play it.',
  });
  return took.length;
}

/** Phase-two cycle position, derived from history so `nextMove` stays pure. */
function countPhaseTwo(c) {
  const ids = new Set(['red-pen', 'complete-revision', 'binding-thread', 'reshelve-everything']);
  return (c.history || []).filter(x => ids.has(x)).length;
}

function announceCatalogue(c) {
  const party = (c.partySize ? c.partySize() : 1) > 1;
  const n = fileAt(c);
  const one = (t) => TYPES.map(k => `${k[0].toUpperCase()}${k.slice(1)} ${t.filed[k] ? 'FILED' : `${t[k]}/${n}`}`).join(' · ');
  const body = party
    ? Object.keys(mem(c).cat || {}).map(key => one(mem(c).cat[key])).join('   |   ')
    : one(tabs(c, c.player));
  c.announceRule({
    id: `cat:${c.self.id}`,
    name: `The Catalogue — ${body}`,
    text: `Every Trick you play files an Entry. At ${n} the tab is FILED and takes no more — `
      + `and it can only process ${PROCESS_CAP[Math.min(4, Math.max(1, c.partySize ? c.partySize() : 1))] || 1} `
      + `each turn, oldest first. File all three at once and it has to stop and cross-reference.`
      + (mem(c).stamped ? ' The next Trick you file counts DOUBLE.' : ''),
  });
}

export const STUDY_LIBRARY_BOSSES = [archivist];
