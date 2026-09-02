/**
 * The Groundskeeper of Names — the Mansion Graveyard boss. OWNER: enemies.
 * Source of truth: docs/design/regions/06-graveyard.md §16–§28.
 *
 * "It does not think of itself as a jailer. It believes that being remembered
 * is the only way something truly survives. Its tragedy is that it has confused
 * REMEMBERING SOMEONE with REFUSING TO LET THEM LEAVE."
 *
 * Mossbit's opposite number, and the Keeper's argument eleven wings early with
 * the word "safe" swapped for the word "remembered".
 *
 * ── THE LEDGER IS THE FIGHT ─────────────────────────────────────────────────
 *
 * §17 carries the most important rule of the encounter in its own words:
 * "The player can always inspect what will happen, who it affects, and how many
 * turns remain. NOTHING ON THE LEDGER SHOULD BE HIDDEN." Every Entry is an
 * engine timer with a label saying exactly what it is and when — the same
 * machinery the whole region's Countdowns use.
 *
 * §19's Smudge is the interesting half: 22 Courage in one player turn DELAYS
 * the nearest Entry by a turn. Deliberately not deletion. The future
 * consequence still exists and the player has bought time — and §22 points out
 * that delaying everything can be wrong, because a full Ledger makes Review the
 * Records accelerate what is already on it.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, bossDmg,
  flag, isAlive, dmgTaken, phaseAt,
} from '../enemies/_lib.js';
import { countdown, countdownHit } from '../enemies/graveyard.js';

const REGION = 'graveyard';
const SOLO_MAX = 165;
const PHASE_TWO_AT = 190;

/**
 * EVERY NAME IT MANAGES TO WRITE DOWN MAKES IT HIT HARDER, and that is the one
 * thing §16-§22 does not give this boss.
 *
 * Phase one as written has no escalation at all: 12 and 6 damage, and a Ledger
 * whose only compounding pressure is that Entries arrive sooner. Against a deck
 * that can block 12, the fight becomes a DRAW — measured, the Groundskeeper sat
 * at exactly 232 of 402 Courage for eighty consecutive turns while the player
 * sat at full Courage, and `tests/run/run.py` reported a fight that could not
 * resolve in two hundred turns. Every other boss in this game escalates: the
 * Butler's Discomposed, the Confectioner's Offended, the Keeper's Panic.
 *
 * `names` is that, and it is the boss's own stated belief rather than a knob:
 * "being remembered is the only way something truly survives." Each Entry that
 * RESOLVES is one more name written down and one more point of attack damage,
 * to a ceiling of three — measured at six it took the boss from a draw to an 8% win rate, which is the other kind of wrong. It also gives the player a reason to care which Entries
 * they let land, which is §22's decision made sharper rather than replaced.
 */
function punch(c) { return 2 * cnt(c, 'memory') + cnt(c, 'names') + bossDmg(c); }

/* ══ the four Epitaph Entries (§18) ══════════════════════════════════════════ */
const ENTRIES = {
  courage: {
    id: 'courage', name: 'Here Lies Courage', turns: 2, label: '12 damage',
    run: (e, seat) => countdownHit(e, seat, 12),
  },
  shelter: {
    id: 'shelter', name: 'Here Lies Shelter', turns: 2, label: 'the Groundskeeper gains 16 Guard',
    run: (e, seat, boss) => { if (boss && e.gainBlock) e.gainBlock(boss, 16, { reason: 'entry' }); },
  },
  certainty: {
    id: 'certainty', name: 'Here Lies Certainty', turns: 3,
    label: '2 Tricks in your draw pile are Forgotten',
    run: (e, seat) => {
      const draw = (seat.piles && seat.piles.draw) || [];
      const picked = draw.slice(0, 2);
      if (!picked.length) return;
      const marks = (seat._forgotten ||= new Set());
      for (const card of picked) marks.add(card.uid);
      if (e.applyStatus) e.applyStatus(seat, 'forgotten', picked.length);
      if (typeof e.say === 'function') {
        e.say(`Forgotten: ${picked.map(x => x.name).join(', ')}.`, 'warn');
      }
    },
  },
  haste: {
    id: 'haste', name: 'Here Lies Haste', turns: 2,
    label: 'your next two Tricks cost 1 additional Nerve',
    run: (e, seat) => {
      const marks = (seat._forgotten ||= new Set());
      for (const card of (seat.piles?.hand || []).slice(0, 2)) marks.add(card.uid);
      if (e.applyStatus) e.applyStatus(seat, 'forgotten', 2);
    },
  },
};
const ENTRY_KEYS = Object.keys(ENTRIES);

/** The Entries currently on the Ledger, newest last. */
function ledger(c) { return (c.timers() || []).filter(t => /^entry:/.test(t.id)); }

function record(c, key) {
  const spec = ENTRIES[key];
  if (!spec) return null;
  const t = countdown(c, {
    id: `entry:${spec.id}`, turns: spec.turns,
    label: `${spec.name} — ${spec.label}`,
    run: ({ e, seat }) => {
      spec.run(e, seat, c.self);
      // One more name written down.
      if (c.self.counters) {
        c.self.counters.names = Math.min(3, (c.self.counters.names || 0) + 1);
      }
      // "Mark the Stone" rides on whichever Entry resolves next (§20).
      if (mem(c).marked) {
        mem(c).marked = false;
        if (e.gainBlock) e.gainBlock(c.self, 6, { reason: 'marked' });
      }
      announceLedger(c);
    },
  });
  announceLedger(c);
  return t;
}

function announceLedger(c) {
  const rows = ledger(c).map(t => `${t.label} (${t.turnsLeft})`);
  const frozen = (mem(c).frozen || []).map(x => `${x.label} — frozen`);
  c.announceRule({
    id: `ledger:${c.self.id}`,
    name: mem(c).phase === 2
      ? `The Ledger · frozen · Memory ${cnt(c, 'memory')}`
      : `The Ledger ${rows.length} / 3`,
    text: `${[...rows, ...frozen].join('. ') || 'The Ledger is empty.'}`
      + (mem(c).phase === 2
        ? ' Break a Memorial Stone to erase one frozen Entry for good.'
        : ' Deal it 22 Courage in one turn and the nearest un-smudged Entry is delayed a turn. Each Entry can be smudged once.')
      + ` Every Entry it manages to resolve is 1 more attack damage, for good (${cnt(c, 'names')} / 3).`,
  });
}

/* ══ phase two — the three Memorial Stones (§25) ═════════════════════════════ */
function memorial({ id, name, palette, lore, every, act, rule, intent, damage, block, tell }) {
  return {
    id, name, region: REGION, tier: 'boss', role: 'bossPart',
    hp: [24, 24],
    silhouette: 'name-stone',
    palette,
    shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
    scale: 0.75,
    summonOnly: true,
    memorial: true,
    lore,

    onSpawn(c) { setCnt(c, 'toll', every); c.announceRule({ id: `mem:${c.self.id}`, name, text: rule }); },

    /**
     * THE TOLL IS A MOVE, not a hook, and the intent-truth audit is why.
     *
     * The Player Stone's 6 damage was dealt from `onTurnEnd` while its intent
     * said Stand: promised 0, delivered 6, sixteen times. A Memorial Stone's
     * whole action IS the toll, so it belongs on the intent where the player
     * can read it — which is also the region's founding rule (§2: it should
     * almost never surprise the player with untelegraphed delayed damage).
     *
     * The clock only ticks here. `nextMove` reads it and stays pure.
     */
    onTurnEnd(c) {
      const n = Math.max(0, cnt(c, 'toll') - 1);
      setCnt(c, 'toll', n > 0 ? n : every);
    },

    /**
     * §28: breaking a Stone erases one frozen Ledger Entry, and if none remain
     * it costs the Groundskeeper 6 Courage instead. That is the connection
     * between the two phases — the player is dismantling what they watched get
     * built.
     */
    onDeath(c) {
      c.clearRules(`mem:${c.self.id}`);
      const boss = allies(c).find(a => isAlive(a) && a.defId === 'groundskeeper');
      if (!boss) return;
      const bm = (boss.mem ||= {});
      if ((bm.frozen || []).length) {
        const gone = bm.frozen.shift();
        c.say(`${gone.label.split(' — ')[0]} is erased.`, 'good');
      } else {
        c.loseHp(boss, 6);
        c.say('There is nothing left to erase. It feels that instead.', 'good');
      }
      bm.restorable = (bm.restorable || []).concat(id);
    },

    moves: {
      wait: {
        id: 'wait', name: 'Wait', intent: Intent.SLEEP,
        tell: 'It is a gravestone with a name on it. The name is the threat.',
        effect() { /* the clock ticks in onTurnEnd */ },
      },
      toll: {
        id: 'toll', name, intent,
        ...(damage != null ? { damage, hits: 1 } : {}),
        ...(block != null ? { block } : {}),
        tell,
        effect(c) { act(c); },
      },
    },
    nextMove: (c) => (cnt(c, 'toll') <= 1 ? 'toll' : 'wait'),
    hauntScaling: (level) => hauntBase(level, 'boss'),
  };
}

export const playerStone = memorial({
  id: 'player-stone', name: 'Player Stone', every: 2,
  palette: ['#a89e8c', '#d8d0c0', '#3a352c'],
  lore: 'Your own name, cut deeper than it should be for somebody still walking around.',
  rule: 'Every second enemy turn: 6 damage.',
  intent: Intent.ATTACK, damage: 6,
  tell: 'Your own name catches the light.',
  act: (c) => { c.damage(6); },
});

export const companionStone = memorial({
  id: 'companion-memorial', name: 'Companion Stone', every: 2,
  palette: ['#93a89c', '#cfe0d4', '#2f3d34'],
  lore: 'Your Companion’s name, and a date that has not happened.',
  rule: 'Every second enemy turn: the Groundskeeper gains 7 Guard.',
  intent: Intent.BUFF,
  tell: 'It leans, and the Groundskeeper stands a little straighter.',
  act: (c) => {
    const boss = allies(c).find(a => isAlive(a) && a.defId === 'groundskeeper');
    if (boss) c.block(boss, 7);
  },
});

export const unknownStone = memorial({
  id: 'unknown-memorial', name: 'Unknown Stone', every: 3,
  palette: ['#9c96a8', '#d0cbd8', '#332f3a'],
  /**
   * §26 wants this Stone to carry narrative weight and to CHANGE as the
   * campaign's investigation progresses. The name it shows is deliberately a
   * blank here rather than an invented one: nothing else in the build knows how
   * far the investigation has got, and writing a name into the roster would
   * settle a story question that belongs to the meta layer.
   */
  lore: 'A name you have never heard, cut by somebody who assumed you would know it.',
  rule: 'Every third enemy turn: the Groundskeeper gains 1 Memory. Each Memory is 2 more attack damage.',
  intent: Intent.BUFF,
  tell: 'The name on it is read out by somebody who is not there.',
  act: (c) => {
    const boss = allies(c).find(a => isAlive(a) && a.defId === 'groundskeeper');
    if (!boss) return;
    boss.counters.memory = Math.min(5, (boss.counters.memory || 0) + 1);
    c.say('It remembers one more.', 'warn');
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// The Groundskeeper
// ═════════════════════════════════════════════════════════════════════════════
export const groundskeeper = {
  id: 'groundskeeper',
  name: 'The Groundskeeper of Names',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'groundskeeper',
  palette: ['#4f4a40', '#8f8778', '#211f1a'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.6,
  lore: 'A tall figure in a heavy cemetery coat. Where the keys should be, a ring of hundreds of small grave markers. Names move across its face and do not stay.',

  onSpawn(c) { mem(c).phase = 1; mem(c).frozen = []; announceLedger(c); },

  onPlayerTurnStart(c) { mem(c).smudged = false; },

  /** §19. 22 Courage in one player turn Smudges the nearest Entry. Once a turn. */
  onPlayerTurnEnd(c) {
    if (mem(c).phase !== 1 || mem(c).smudged) return;
    if (dmgTaken(c) < flag(c, 'smudgeAt', 22)) return;
    /**
     * AN ENTRY CAN BE SMUDGED ONCE, AND THIS IS THE WHOLE DRAW.
     *
     * §19 gives no limit, and an Entry ticks down one step per turn — so a deck
     * that reliably deals 22 in a turn Smudges the nearest Entry EVERY turn and
     * the Ledger freezes for ever. Nothing lands, so nothing escalates, so
     * neither side can win: measured, the Groundskeeper sat at exactly 232 of
     * 402 Courage for two hundred turns against a full-Courage player.
     *
     * §19's own words are "the player has bought time", singular. One Smudge
     * per Entry is that sentence with a bound on it, and it keeps everything the
     * clause is for — the nearest threat still slides a turn, the future
     * consequence still exists, and the player still chooses which one to buy
     * time against.
     */
    const m = mem(c);
    const done = (m.smudgedIds ||= []);
    const nearest = ledger(c)
      .filter(t => !done.includes(t.id))
      .reduce((best, t) => (!best || t.turnsLeft < best.turnsLeft ? t : best), null);
    if (!nearest) return;
    m.smudged = true;
    done.push(nearest.id);
    c.adjustTimer(nearest.id, 1, 'smudge');
    c.say(`${nearest.label.split(' — ')[0]} is smudged. It cannot be smudged twice.`, 'good');
    announceLedger(c);
  },

  moves: {
    /* ── phase one (§20) ─────────────────────────────────────────────────── */
    'record-the-name': {
      id: 'record-the-name', name: 'Record the Name', intent: Intent.DEBUFF, block: 5,
      tell: 'It writes something into the Ledger without looking down.',
      /**
       * HERE LIES SHELTER IS WRITTEN ONCE PER PHASE. Everything else recurs.
       *
       * An Entry leaves the Ledger when it resolves, so §20's "cannot duplicate
       * an Entry already present" lets all four come back for ever — and one of
       * them is 16 Guard. With Record the Name's 5 and Review the Records' 10
       * that is about 6 Guard a turn, indefinitely, which is more than a
       * seven-wing deck deals. Measured: the Groundskeeper sat at exactly 232
       * of 402 Courage for EIGHTY consecutive turns, neither winning nor
       * losing, and `tests/run/run.py` reported a fight that could not resolve
       * in two hundred.
       *
       * A hard fight is fine; a fight that cannot END is a defect. Capping ALL
       * four was the first attempt and it was too blunt — it took away §22's
       * whole point, that a crowded Ledger is dangerous. Only the Guard engine
       * is bounded. Courage, Certainty and Haste recur exactly as written, and
       * the Ledger still fills, still accelerates itself, and still has to be
       * chosen between.
       */
      effect(c) {
        c.block(c.self, 5);
        const m = mem(c);
        const used = (m.used ||= []);
        const have = new Set(ledger(c).map(t => t.id.split(':')[1]));
        const free = ENTRY_KEYS.filter(k => !have.has(ENTRIES[k].id)
          && !(k === 'shelter' && used.includes('shelter')));
        if (!free.length) return;             // nothing left to write
        const pick = free[c.rng.int(free.length)];
        if (pick === 'shelter') used.push('shelter');
        record(c, pick);
      },
    },
    'cemetery-spade': {
      id: 'cemetery-spade', name: 'Cemetery Spade', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + punch(c),
      tell: 'It brings the spade round flat.',
      effect(c) { hitPlayer(c, 12 + punch(c)); },
    },
    'mark-the-stone': {
      id: 'mark-the-stone', name: 'Mark the Stone', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + punch(c),
      tell: 'It cuts one more line into whichever stone is nearest.',
      effect(c) { hitPlayer(c, 6 + punch(c)); mem(c).marked = true; announceLedger(c); },
    },
    'turn-the-page': {
      id: 'turn-the-page', name: 'Turn the Page', intent: Intent.DEBUFF,
      tell: 'It turns the page, and something on it gets closer.',
      /**
       * §20's fallback is "if no Entries exist, use Record the Name instead" —
       * and the first version of that reached straight past the once-per-phase
       * cap, so all four Epitaphs recurred through this move and the Guard
       * engine came back. The boss stalled again, twice in fifty runs, BOTH
       * TIMES at exactly one Courage above its phase-two threshold.
       * Recording goes through the same gate as Record the Name.
       */
      effect(c) {
        const furthest = ledger(c).reduce((best, t) => (!best || t.turnsLeft > best.turnsLeft ? t : best), null);
        if (furthest) { c.adjustTimer(furthest.id, -1, 'page'); announceLedger(c); return; }
        const m = mem(c);
        const used = (m.used ||= []);
        const free = ENTRY_KEYS.filter(k => !(k === 'shelter' && used.includes('shelter')));
        if (!free.length) return;
        const pick = free[c.rng.int(free.length)];
        if (pick === 'shelter') used.push('shelter');
        record(c, pick);
      },
    },
    'review-the-records': {
      id: 'review-the-records', name: 'Review the Records', intent: Intent.DEFEND, block: 10,
      tell: 'It reads back over what it has already written.',
      effect(c) {
        c.block(c.self, 10);
        const rows = ledger(c);
        if (rows.length) c.adjustTimer(rows[c.rng.int(rows.length)].id, -1, 'review');
        announceLedger(c);
      },
    },

    /* ── the turn (§24) ──────────────────────────────────────────────────── */
    'names-should-not-be-forgotten': {
      id: 'names-should-not-be-forgotten', name: 'Names Should Not Be Forgotten',
      intent: Intent.SUMMON,
      tell: 'It closes the Ledger, and three larger stones come up out of the ground.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        // Freeze rather than resolve: every Entry stays visible and none of
        // them lands. Breaking a Memorial Stone erases one (§28).
        m.used = [];                          // phase two writes nothing anyway
        m.frozen = ledger(c).map(t => ({ label: t.label, turnsLeft: t.turnsLeft }));
        for (const t of ledger(c)) c.cancelTimer(t.id);
        for (const id of ['player-stone', 'companion-memorial', 'unknown-memorial']) c.summon(id, {});
        c.say('Names should not be forgotten.', 'warn');
        announceLedger(c);
      },
    },

    /* ── phase two (§27) ─────────────────────────────────────────────────── */
    'gravekeepers-swing': {
      id: 'gravekeepers-swing', name: "Gravekeeper's Swing", intent: Intent.ATTACK, damage: 15, hits: 1,
      damageFn: (c) => 15 + punch(c),
      tell: 'The spade comes all the way round this time.',
      effect(c) { hitPlayer(c, 15 + punch(c)); },
    },
    'dirt-over-everything': {
      id: 'dirt-over-everything', name: 'Dirt Over Everything',
      intent: Intent.ATTACK_DEFEND, damage: 6, hits: 2, block: 8,
      damageFn: (c) => 6 + punch(c),
      tell: 'It starts filling something in, and is not fussy about what.',
      effect(c) { hitPlayer(c, 6 + punch(c), 2); c.block(c.self, 8); },
    },
    'remember-them': {
      id: 'remember-them', name: 'Remember Them', intent: Intent.BUFF,
      tell: 'It says a list of names under its breath.',
      effect(c) {
        addCnt(c, 'memory', 1, 5);
        for (const s of stones(c)) c.block(s, 5);
        announceLedger(c);
      },
    },
    'rewrite-the-stone': {
      id: 'rewrite-the-stone', name: 'Rewrite the Stone', intent: Intent.SUMMON,
      tell: 'It re-cuts a name that had been taken off.',
      effect(c) {
        const m = mem(c);
        const gone = (m.restorable || []).shift();
        if (!gone) { c.block(c.self, 10); return; }
        m.rewrites = (m.rewrites || 0) + 1;
        c.summon(gone, { hp: 12 });
        c.say('It puts one back.', 'warn');
      },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'names-should-not-be-forgotten';

    if (m.phase === 2) {
      const seq = ['gravekeepers-swing', 'remember-them', 'dirt-over-everything', 'gravekeepers-swing'];
      const i = (c.history || []).filter(x => x !== 'rewrite-the-stone').length;
      // "Can occur only twice during phase two." (§27.)
      if (i > 0 && i % 4 === 0 && (m.restorable || []).length && (m.rewrites || 0) < 2) {
        return 'rewrite-the-stone';
      }
      return cyc(seq, i);
    }

    const seq = ['record-the-name', 'cemetery-spade', 'record-the-name', 'mark-the-stone', 'turn-the-page'];
    const pick = cyc(seq, (c.history || []).length);
    // §21: a full Ledger turns Record the Name into Review the Records, which
    // is worse — the crowded Ledger accelerates itself.
    if (pick === 'record-the-name' && ledger(c).length >= 3) return 'review-the-records';
    /* And Record the Name stops being a free 5 Guard once there is nothing left
       that it is allowed to write. That drip was the last piece of the draw: a
       boss whose every fifth action is "gain 5 Guard, change nothing" cannot
       lose to a deck that cannot out-damage 5 a turn, and cannot win either. */
    const shelterSpent = (m.used || []).includes('shelter');
    const nothingToWrite = ledger(c).length + (shelterSpent ? 1 : 0) >= ENTRY_KEYS.length;
    if (pick === 'record-the-name' && nothingToWrite) return 'cemetery-spade';
    return pick;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 5) { h.flags.smudgeAt = 28; h.notes.push('Haunt 5: Smudging an Entry needs 28 Courage in one turn.'); }
    return h;
  },
};
function stones(c) { return allies(c).filter(a => isAlive(a) && a.def?.memorial); }

export const GRAVEYARD_BOSSES = [
  groundskeeper, playerStone, companionStone, unknownStone,
];
