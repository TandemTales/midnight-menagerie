/**
 * The Bone Curator — the Crypt and Ossuary boss. OWNER: enemies.
 * Source of truth: docs/design/regions/11-crypt.md §16–§31.
 *
 * "The Bone Curator believes every fragment belongs somewhere. Its philosophy
 * is: nothing should be lost when it can be put back where it belongs. THE
 * PROBLEM IS THAT IT DECIDES WHAT BELONGS TOGETHER." (§16.)
 *
 * Its own skeleton is assembled out of several different animals, and it does
 * not think that is strange.
 *
 * ── DISMANTLING IT MAKES MORE OF IT ─────────────────────────────────────────
 *
 * §20 is the whole fight: "destroying one removes its effect. When destroyed it
 * becomes LOOSE EXHIBIT rather than disappearing… The Curator may retrieve it
 * later. THIS MEANS DISMANTLING THE BOSS CREATES FUTURE RESOURCES."
 *
 * And §22 draws the conclusion out loud: "Destroying every Piece is not
 * necessarily efficient. The Curator will spend actions retrieving them.
 * Sometimes letting a manageable Piece remain is better than constantly feeding
 * the retrieval cycle." So a player who razes the Exhibit every turn is buying
 * tempo and paying for it in Order.
 *
 * ── PHASE ONE DECIDES PHASE TWO ─────────────────────────────────────────────
 *
 * §24: at the transition the Pieces "fly toward the Curator and attach directly
 * to its body", and it "gains a phase two form based on the THREE MOST RECENTLY
 * ACTIVE Piece types". §25 then gives each attached Piece a Weak Point the
 * player can meet to switch it off for a turn — and §30 closes with the rule
 * that governs all five: "every Weak Point has multiple reasonable ways to be
 * addressed across the complete Companion roster. NO BUILD SHOULD BE
 * MECHANICALLY LOCKED OUT."
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, bossDmg, flag,
  phaseAt, played, playedOfType, isAlive, dmgTaken,
} from '../enemies/_lib.js';

const REGION = 'crypt';
const SOLO_MAX = 390;
const PHASE_TWO_AT = 220;

/* ══ one Display Stand ═══════════════════════════════════════════════════════ */
/**
 * §18's five Bone Piece types, as one def whose `kind` decides what it does.
 * Five near-identical defs would be five places to be wrong about the same
 * thing; the kind lives in a counter, which survives the JSON round-trip that
 * `combat/actor.js` puts every actor's `mem` through.
 */
export const PIECE_KINDS = ['fang', 'rib', 'paw', 'spine', 'tail'];
const PIECE_TEXT = {
  fang: 'Fang — its damaging attacks deal 3 more.',
  rib: 'Rib — it gains 6 Guard at the start of its turn.',
  paw: 'Paw — it gains 4 Guard after it attacks.',
  spine: 'Spine — the first negative status it takes each turn is reduced.',
  tail: 'Tail — its multi-hit moves gain an extra hit.',
};

export const bonePiece = {
  id: 'bone-piece',
  name: 'Bone Piece',
  region: REGION,
  tier: 'boss',
  role: 'bossPart',
  partOf: 'bone-curator',
  summonOnly: true,
  hp: [18, 18],
  silhouette: 'bone-piece',
  palette: ['#e2d9c0', '#9a8f73', '#241f17'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.4,
  lore: 'A single labelled bone on a little stand, from something that is not here any more.',

  onSpawn(c) { if (!mem(c).kind) mem(c).kind = 'fang'; },

  /** §20: a destroyed Piece becomes a Loose Exhibit on the Curator, not nothing. */
  onDeath(c) {
    const boss = allies(c).find(a => a.defId === 'bone-curator' && isAlive(a));
    if (!boss) return;
    const m = (boss.mem ||= {});
    m.loose = [...(m.loose || []), mem(c).kind];
    m.brokenThisTurn = (m.brokenThisTurn || 0) + 1;
  },

  moves: {
    displayed: {
      id: 'displayed', name: 'On Display', intent: Intent.SLEEP,
      tell: 'Labelled, mounted, and doing something for the Curator.',
      effect() {},
    },
  },
  nextMove: () => 'displayed',
  hauntScaling(level) { return hauntBase(level, 'boss'); },
};

/**
 * What a Piece IS, read defensively.
 *
 * `onSpawn` sets a default and `addPiece` overwrites it, but neither has run
 * when a Piece is placed BESIDE the Curator rather than summoned by it — the
 * Haunt sweep pairs every def with a same-tier partner and runs the boss's
 * `onSpawn` first, so the Curator read a Piece that did not know what it was
 * yet and threw on `undefined.toUpperCase()`. A kind is a property of the
 * object; asking for it should never be able to fail.
 */
const kindOf = (a) => ((a && a.mem && a.mem.kind) || 'fang');

/** The Pieces currently on stands. `defId`, never `id`. */
function pieces(c) {
  return allies(c).filter(a => a.defId === 'bone-piece' && isAlive(a));
}
function showing(c, kind) {
  return pieces(c).some(a => kindOf(a) === kind);
}

/**
 * Is a Piece's effect live RIGHT NOW?
 *
 * In phase one that means a stand still holds it. In phase two it is attached
 * and can only be switched off by meeting its Weak Point (§26–§30) — every one
 * of which is a thing the player did during the turn just gone, so this reads
 * the turn rather than a flag somebody has to remember to clear.
 */
function live(c, kind) {
  if (mem(c).phase !== 2) return showing(c, kind);
  if (!(mem(c).attached || []).includes(kind)) return false;
  return !(mem(c).disabled || []).includes(kind);
}

/** §23's Order: 2 attack damage apiece, to a maximum of three. */
const order = (c) => 2 * cnt(c, 'order');
const curatorDmg = (c) => order(c) + (live(c, 'fang') ? (mem(c).phase === 2 ? 4 : 3) : 0)
  + cnt(c, 'measured') + bossDmg(c);

/* ══ the boss ════════════════════════════════════════════════════════════════ */
export const boneCurator = {
  id: 'bone-curator',
  name: 'The Bone Curator',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'curator',
  palette: ['#e8dfc6', '#6f6549', '#191510'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.9,
  lore: 'A tall, elegant skeleton in an old museum coat, assembled out of a great many different animals — not grotesquely, more like a natural history display that got up and walked. There are small paper labels tied to several of its bones.',

  onSpawn(c) {
    const m = mem(c);
    m.phase = 1;
    m.loose = [];
    m.attached = [];
    m.disabled = [];
    m.seen = [];
    m.brokenThisTurn = 0;
    m.perfect = 0;
    setCnt(c, 'order', 0);
    setCnt(c, 'measured', 0);
    const open = flag(c, 'openStands', 0);
    for (let i = 0; i < open; i++) addPiece(c);
    announceExhibit(c);
  },

  /**
   * §23's Order removal and §25's Weak Points, both scored from the player turn
   * that just ended and both applied BEFORE the next intent is drawn — every
   * number they move is one a `damageFn` reads.
   */
  onPlayerTurnEnd(c) {
    const m = mem(c);
    // §23: "whenever the player destroys TWO Displayed Pieces during the same
    // player turn, lose 1 Order. Once per turn."
    if ((m.brokenThisTurn || 0) >= 2) addCnt(c, 'order', -1, 3, 0);
    m.brokenThisTurn = 0;

    if (m.phase !== 2) { announceExhibit(c); return; }
    /* §26–§30's Weak Points, each a thing the player DID this turn. §29's
       fallback is quoted because it exists to stop a hard deck check: Spine
       also yields to 12 damage that was not an Attack Trick. */
    const off = [];
    if ((c.player.block || 0) >= 15) off.push('fang');
    if (dmgTaken(c) >= 18) off.push('rib');
    if (played(c).length >= 4) off.push('paw');
    if (playedOfType(c, 'skill') + playedOfType(c, 'power') >= 2) off.push('spine');
    if ((c.player.energy || 0) >= 1) off.push('tail');
    m.disabled = off;
    announceExhibit(c);
  },

  /** §18: the Rib's standing effect. */
  onTurnStart(c) { if (live(c, 'rib')) c.block(c.self, 6); },

  moves: {
    /* ── phase one (§21) ──────────────────────────────────────────────────── */
    'polished-femur': {
      id: 'polished-femur', name: 'Polished Femur', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + curatorDmg(c),
      tell: 'It selects a bone from the display and swings it.',
      effect(c) { const d = 12 + curatorDmg(c); spend(c); hitPlayer(c, d); paw(c); },
    },
    'catalogue-remains': {
      id: 'catalogue-remains', name: 'Catalogue Remains', intent: Intent.SUMMON,
      blockFn: () => 4,
      tell: 'It finds something on the floor worth keeping.',
      effect(c) { c.block(c.self, 4); addPiece(c); announceExhibit(c); },
    },
    'rearrange-exhibit': {
      id: 'rearrange-exhibit', name: 'Rearrange Exhibit', intent: Intent.SUMMON,
      blockFn: () => 4,
      tell: 'It has reconsidered the arrangement.',
      effect(c) {
        c.block(c.self, 4);
        /* §19: with every stand occupied, Catalogue becomes this — and the piece
           it takes down "becomes LOOSE EXHIBIT rather than disappearing". */
        const on = pieces(c);
        if (on.length) {
          const drop = on[c.rng.int(on.length)];
          c.despawn(drop);
          mem(c).loose = [...(mem(c).loose || []), (drop.mem || {}).kind];
        }
        addPiece(c);
        announceExhibit(c);
      },
    },
    'preservation-wire': {
      id: 'preservation-wire', name: 'Preservation Wire', intent: Intent.DEFEND, block: 13,
      tell: 'It wires something back into place.',
      effect(c) {
        c.block(c.self, 13);
        const on = pieces(c);
        if (on.length) c.block(on[c.rng.int(on.length)], 8);
      },
    },
    'measure-twice': {
      id: 'measure-twice', name: 'Measure Twice', intent: Intent.ATTACK_BUFF, damage: 6, hits: 1,
      damageFn: (c) => 6 + curatorDmg(c),
      tell: 'It takes the calipers to you, thoughtfully.',
      effect(c) {
        const d = 6 + curatorDmg(c);
        spend(c);
        hitPlayer(c, d);
        setCnt(c, 'measured', 4);
        paw(c);
      },
    },
    'exhibit-sweep': {
      id: 'exhibit-sweep', name: 'Exhibit Sweep', intent: Intent.ATTACK, damage: 4, hits: 2,
      damageFn: (c) => 4 + curatorDmg(c),
      hitsFn: (c) => (live(c, 'tail') ? 3 : 2),
      tell: 'It clears the top of the case with one arm.',
      effect(c) {
        const d = 4 + curatorDmg(c);
        spend(c);
        hitPlayer(c, d, live(c, 'tail') ? 3 : 2);
        paw(c);
      },
    },
    'that-still-belongs-here': {
      id: 'that-still-belongs-here', name: 'That Still Belongs Here', intent: Intent.SUMMON,
      tell: 'It picks a piece of itself up off the floor.',
      effect(c) {
        const m = mem(c);
        const kind = (m.loose || []).shift();
        if (!kind) { c.block(c.self, 8); return; }
        // §19/§22: restored at 10 Integrity, and §23 pays it 1 Order for the trouble.
        const on = pieces(c);
        if (on.length >= 3) {
          const drop = on[0];
          c.despawn(drop);
          m.loose.push(kindOf(drop));
        }
        addPiece(c, kind, 10);
        addCnt(c, 'order', 1, 3);
        announceExhibit(c);
      },
    },

    /* ── the transition (§24) ─────────────────────────────────────────────── */
    'the-display-is-incomplete': {
      id: 'the-display-is-incomplete', name: 'The Display Is Incomplete',
      intent: Intent.BUFF, anchored: true,
      tell: 'Every label in the room turns to face it at once.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        /* §24: the three MOST RECENTLY ACTIVE types attach. `seen` is appended
           to every time a Piece goes up, so its tail is exactly that — and the
           fallback fills from "pieces seen during combat", which is the same
           list read from the other end. */
        const recent = [];
        for (let i = (m.seen || []).length - 1; i >= 0 && recent.length < 3; i--) {
          const k = m.seen[i];
          if (!recent.includes(k)) recent.push(k);
        }
        for (const k of PIECE_KINDS) {
          if (recent.length >= 3) break;
          if (!recent.includes(k)) recent.push(k);
        }
        m.attached = recent;
        m.disabled = [];
        for (const p of pieces(c)) c.despawn(p);
        m.loose = [];
        c.say('The display is incomplete.', 'warn');
        announceExhibit(c);
      },
    },

    /* ── phase two (§31) ──────────────────────────────────────────────────── */
    'curated-strike': {
      id: 'curated-strike', name: 'Curated Strike', intent: Intent.ATTACK_BIG, damage: 15, hits: 1,
      damageFn: (c) => 15 + curatorDmg(c),
      tell: 'One considered, well-documented blow.',
      effect(c) { const d = 15 + curatorDmg(c); spend(c); hitPlayer(c, d); paw(c); },
    },
    'articulated-flurry': {
      id: 'articulated-flurry', name: 'Articulated Flurry', intent: Intent.ATTACK, damage: 4, hits: 3,
      damageFn: (c) => 4 + curatorDmg(c),
      hitsFn: (c) => (live(c, 'tail') ? 4 : 3),
      tell: 'Every joint it has, in order.',
      effect(c) {
        const d = 4 + curatorDmg(c);
        spend(c);
        hitPlayer(c, d, live(c, 'tail') ? 4 : 3);
        paw(c);
      },
    },
    'perfect-arrangement': {
      id: 'perfect-arrangement', name: 'Perfect Arrangement', intent: Intent.DEFEND, block: 14,
      tell: 'It steps back and looks at itself and is briefly satisfied.',
      effect(c) { c.block(c.self, 14); c.heal(c.self, 6); mem(c).perfect = (mem(c).perfect || 0) + 1; },
    },
    'retrieve-yourself': {
      id: 'retrieve-yourself', name: 'Retrieve Yourself', intent: Intent.BUFF,
      tell: 'It takes part of itself off and puts it back on better.',
      effect(c) { addCnt(c, 'order', 1, 3); c.loseHp(c.self, 4); announceExhibit(c); },
    },
    'museum-charge': {
      id: 'museum-charge', name: 'Museum Charge', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + (activeCount(c) >= 2 ? 5 : 0) + curatorDmg(c),
      tell: 'It comes across the room like a whole exhibit falling over.',
      effect(c) {
        const d = 10 + (activeCount(c) >= 2 ? 5 : 0) + curatorDmg(c);
        spend(c);
        hitPlayer(c, d);
        paw(c);
      },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'the-display-is-incomplete';

    if (m.phase === 2) {
      const beat = cyc(['curated-strike', 'perfect-arrangement', 'articulated-flurry',
        'museum-charge', 'retrieve-yourself'], countTwo(c));
      // §31: Perfect Arrangement "can occur at most twice during phase two."
      if (beat === 'perfect-arrangement' && (m.perfect || 0) >= 2) return 'curated-strike';
      return beat;
    }

    // §22: "Every fourth Curator action it checks for Loose Exhibits."
    const acts = (c.history || []).length;
    if (acts > 0 && acts % 4 === 0 && (m.loose || []).length) return 'that-still-belongs-here';
    const beat = cyc(['catalogue-remains', 'polished-femur', 'catalogue-remains',
      'preservation-wire', 'exhibit-sweep', 'measure-twice'], acts);
    // §19: with every stand occupied, Catalogue becomes Rearrange.
    if (beat === 'catalogue-remains' && pieces(c).length >= 3) return 'rearrange-exhibit';
    return beat;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 10) {
      h.flags.openStands = 2;
      h.notes.push('Haunt 10: two Display Stands are already occupied, and you see which before you act.');
    }
    return h;
  },
};

/** Put a Bone Piece on an empty stand (§19). */
function addPiece(c, kind, hp) {
  if (pieces(c).length >= 3) return null;
  const taken = pieces(c).map(kindOf);
  const free = PIECE_KINDS.filter(k => !taken.includes(k));
  const pick = kind || (free.length ? free[c.rng.int(free.length)] : PIECE_KINDS[c.rng.int(5)]);
  const made = c.summon('bone-piece', hp ? { hp } : {});
  if (!made) return null;
  (made.mem ||= {}).kind = pick;
  mem(c).seen = [...(mem(c).seen || []), pick];
  return made;
}

/** §18's Paw: "after the Curator attacks, gain 4 Guard." */
function paw(c) { if (live(c, 'paw')) c.block(c.self, mem(c).phase === 2 ? 6 : 4); }
/** Measure Twice's one-shot bonus is spent by the attack that used it. */
function spend(c) { setCnt(c, 'measured', 0); }
function activeCount(c) { return PIECE_KINDS.filter(k => live(c, k)).length; }
/** Phase-two cycle position, derived from history so `nextMove` stays pure. */
function countTwo(c) {
  const ids = new Set(['curated-strike', 'perfect-arrangement', 'articulated-flurry',
    'museum-charge', 'retrieve-yourself']);
  return (c.history || []).filter(x => ids.has(x)).length;
}

const WEAK = {
  fang: 'gain 15 or more Guard in a turn',
  rib: 'deal it 18 or more in a turn',
  paw: 'play 4 or more Tricks in a turn',
  spine: 'play two Skills or Powers in a turn',
  tail: 'end your turn with any Nerve unspent',
};

function announceExhibit(c) {
  const m = mem(c);
  if (m.phase === 2) {
    const rows = (m.attached || []).map(k =>
      `${k.toUpperCase()}${(m.disabled || []).includes(k) ? ' (off)' : ''} — ${WEAK[k]}`);
    c.announceRule({
      id: `exhibit:${c.self.id}`,
      name: `Reconstructed — Order ${cnt(c, 'order')} / 3`,
      text: `Three Pieces are part of it now and cannot be attacked. Each switches OFF for a turn if you `
        + `meet its condition, and what you did LAST turn is what counts. ${rows.join('. ')}.`,
    });
    return;
  }
  const on = pieces(c).map(kindOf);
  c.announceRule({
    id: `exhibit:${c.self.id}`,
    name: `The Exhibit — ${on.length ? on.map(k => k.toUpperCase()).join(' · ') : 'empty'}  (Order ${cnt(c, 'order')}/3)`,
    text: `${on.map(k => PIECE_TEXT[k]).join(' ') || 'Nothing on the stands yet.'} `
      + 'Each Piece has 18 Integrity of its own. Break one and it does NOT disappear — it goes on the floor, '
      + 'and every fourth action it stops attacking to put one back and takes 1 Order for it. '
      + 'Break two in one turn and it loses one instead. Razing the whole Exhibit is not obviously right.',
  });
}

export const CRYPT_BOSSES = [boneCurator, bonePiece];
