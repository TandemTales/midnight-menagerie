/**
 * The Ballroom and Velvet Suites — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/10-ballroom.md §1–§12, §45–§46.
 *
 * "A good deal can still be a trap if the cost compounds." Count Crumbula's
 * region, and the only one in the game where most of what the enemies do to you
 * is offer you something you want.
 *
 * ── AN INVITATION IS A TRICK IN YOUR HAND ───────────────────────────────────
 *
 * §2 sets the rules: an Invitation is "a temporary player choice", the player
 * may Accept or Decline, and "Invitations should ALWAYS SHOW THE COMPLETE TERMS
 * BEFORE THE PLAYER CHOOSES. No hidden consequences. The region is about
 * temptation, not tricking the player with missing information."
 *
 * There is no engine surface for an enemy to stop the fight and ask a question —
 * the Bookwyrm, the Great Orrery and the Watcher's Tug all hit that wall and all
 * three had to be resolved by a printed rule instead. Here it is not a wall at
 * all, because the game already has a thing that means "an offer, on the table,
 * with its whole cost written on it, which you may take or leave":
 *
 *   A CARD.
 *
 * Every Invitation is a 0-cost Trick added to the player's hand, `ethereal` so
 * it expires with the turn. Playing it is Accept. Not playing it is Decline.
 * The terms are the card text, which is the most legible surface in the game and
 * the one place a player already looks. The enemy learns the answer from
 * `onCardPlayed`, and learns a refusal from the offer still being unplayed at
 * `onPlayerTurnEnd`.
 *
 * That also gets §2's hardest clause for free. A card cannot have hidden
 * consequences: everything it does is printed on it.
 *
 * ── TWO WORDS THIS REGION MAY NOT USE ───────────────────────────────────────
 *
 * §6 calls the Party Phantom's meter Indulgence, and INDULGENCE IS CRUMBULA'S —
 * the name of one of his three archetypes in his own chapter, in his own
 * region. It is `delight` here. §19's player status is Comfortable, and
 * `enemies/heart.js` has shipped a status by that name and nearly that meaning
 * since the Heart; this one is Well Hosted. Both are the Glow rule from the
 * Lampworks: `tests/status-names/check.py` gates the id namespace, but the id
 * namespace is not what the player reads.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag, played,
  isAlive, dmgTaken,
} from './_lib.js';

const REGION = 'ballroom';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const BALLROOM_STATUSES = [
  {
    /** §7. The Goblet Geist's side of the bargain, and Crumbula's whole thesis. */
    id: 'exhilarated', name: 'Exhilarated', kind: 'buff', icon: 'exhilarated',
    desc: 'Your next Attack Trick this turn deals 5 more damage. Then it passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, h) => (h.card?.type === 'attack' ? amt + 5 : amt),
      onCardPlayed: (h) => { if (h.card?.type === 'attack') h.remove(); },
    },
  },
  {
    /**
     * §8. Waltzing Armor's Encore, handed to an ALLY.
     *
     * `enemyTurnEnd` rather than consumed on the first hit, for the reason the
     * Star Chart's Auspicious carries in full: `damage x hits` is the whole
     * intent vocabulary, so a bonus removed after hit one shows (base+4) x hits
     * and delivers base+4, base — the exact lie the audit exists to catch.
     * The Armor prefers a single-hit ally (see `followStep`), so the common
     * case is §8's number exactly.
     */
    id: 'encore', name: 'Encore', kind: 'buff', icon: 'encore',
    desc: 'Its next damaging attack deals {n} more per hit. Then the applause dies down.',
    decay: 'enemyTurnEnd', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, h) => amt + ((h.owner && h.owner._encore) || 4),
    },
  },
  {
    /**
     * §5. The Velvet Curtain's protection: "that enemy receives 50 percent less
     * damage from Attack Tricks. VELVET CURTAIN RECEIVES THE PREVENTED DAMAGE."
     *
     * Both halves are here, and the second one is the point — §5 is explicit
     * that "the player is not forbidden from attacking the protected target,
     * they are CHOOSING WHERE THE DAMAGE EFFECTIVELY GOES". A version that only
     * halved the damage would be a wall; this one is a redirect.
     */
    id: 'behind-the-curtain', name: 'Behind the Curtain', kind: 'buff', icon: 'curtain',
    desc: 'Attack Tricks deal half damage to it. The Curtain takes the rest.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      /* TWO HOOKS, and the split is the point. `modifyDamageTaken` runs INSIDE
         the damage pipeline, so dealing the redirected damage from there would
         be re-entrant damage inside a reduce — it silently did nothing. The
         halving happens there and banks what it took off; `onAttacked` fires
         after the hit has fully resolved and is where the Curtain actually
         pays. */
      modifyDamageTaken: (amt, h) => {
        if (h.card?.type !== 'attack' || amt <= 0) return amt;
        const kept = Math.ceil(amt / 2);
        if (h.owner) h.owner._curtainOwed = (h.owner._curtainOwed || 0) + (amt - kept);
        return kept;
      },
      onAttacked: (h) => {
        const o = h.owner;
        const owed = o && o._curtainOwed;
        if (!owed) return;
        o._curtainOwed = 0;
        const curtain = o._curtain;
        const live = curtain && curtain.alive
          ? curtain
          : (h.e && h.e.enemies ? h.e.enemies.find(x => x.defId === 'velvet-curtain' && x.alive) : null);
        if (live && h.e && h.e.dealDamage) {
          h.e.dealDamage({ attacker: null, defender: live, amount: owed, kind: 'hazard', cause: 'curtain' });
        }
      },
    },
  },
  {
    /**
     * §19. The Master of Revels' Never Leave. "Even the boss's punishment still
     * contains a small benefit. That makes the whole region feel seductively
     * strange rather than purely punitive."
     *
     * Named Well Hosted rather than Comfortable — see the header.
     */
    id: 'well-hosted', name: 'Well Hosted', kind: 'neutral', icon: 'armchair',
    desc: 'Your FIRST Trick this turn costs 1 less Nerve and your THIRD costs 1 more. Then this passes.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        if (n === 0) return Math.max(0, cost - 1);
        if (n === 2) return cost + 1;
        return cost;
      },
    },
  },
];

/**
 * Put an Invitation on the table. Returns the uid so the enemy can tell its own
 * offer from anybody else's — a UID STRING and never the card, because an enemy
 * def holding a runtime card is CONTRACTS 19 and `tests/snapshot-cards/check.py`
 * gates the class.
 */
export function offer(c, cardId, nums) {
  const made = c.addCard(`invite/${cardId}`, 'hand', { ethereal: true, nums });
  const card = Array.isArray(made) ? made[0] : made;
  const uid = card && card.uid;
  mem(c).offered = uid || null;
  mem(c).offerId = `invite/${cardId}`;
  return uid || null;
}

/** Did the player just accept THIS enemy's offer? */
export function accepted(c) {
  const uid = mem(c).offered;
  return !!(uid && c.card && c.card.uid === uid);
}

/** Clear the standing offer. Returns true if it was still on the table. */
export function takeBack(c) {
  const had = !!mem(c).offered;
  mem(c).offered = null;
  return had;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Dancing Shoe — pressure, or it snowballs (§3)
// ═════════════════════════════════════════════════════════════════════════════
const tempo = (c) => cnt(c, 'tempo');

export const dancingShoe = {
  id: 'dancing-shoe',
  name: 'Dancing Shoe',
  region: REGION,
  tier: 'normal',
  role: 'escalator',
  hp: [25, 25],
  silhouette: 'shoe',
  palette: ['#2b1a24', '#c9a2b4', '#120a0f'],
  shape: { body: 'squat', limbs: 2, eyes: 0 },
  scale: 0.5,
  lore: 'A pair of very good dancing shoes going through the steps with nobody in them.',

  onSpawn(c) { setCnt(c, 'tempo', flag(c, 'openTempo', 0)); announceShoe(c); },

  /**
   * §3: "whenever it attacks WITHOUT TAKING DAMAGE during the previous player
   * turn, gain 1 Tempo." Banked at the end of the player turn and cashed at the
   * next turn's start, so the Tempo the intent is drawn from is settled — a
   * counter that moved between the intent and the move is the lie this region's
   * two predecessors both had to be fixed for.
   */
  onPlayerTurnEnd(c) { mem(c).clean = dmgTaken(c) === 0; },
  onPlayerTurnStart(c) {
    if (!mem(c).clean) return;
    mem(c).clean = false;
    addCnt(c, 'tempo', 1, 3);
    announceShoe(c);
  },

  moves: {
    quickstep: {
      id: 'quickstep', name: 'Quickstep', intent: Intent.ATTACK, damage: 5, hits: 1,
      damageFn: (c) => 5 + 2 * tempo(c),
      tell: 'Three steps closer than it was.',
      effect(c) { hitPlayer(c, 5 + 2 * tempo(c)); },
    },
    spin: {
      id: 'spin', name: 'Spin', intent: Intent.ATTACK, damage: 3, hits: 2,
      damageFn: (c) => 3 + tempo(c),
      tell: 'It turns twice on the spot and both of them land.',
      effect(c) { hitPlayer(c, 3 + tempo(c), 2); },
    },
    'pause-for-applause': {
      id: 'pause-for-applause', name: 'Pause for Applause', intent: Intent.DEFEND, block: 8,
      tell: 'It stops, and waits, and something in the room claps.',
      effect(c) { c.block(c.self, 8); addCnt(c, 'tempo', -1, 3, 0); announceShoe(c); },
    },
  },

  nextMove: (c) => cyc(['quickstep', 'spin', 'quickstep', 'pause-for-applause'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.counters.tempo = 1;
      h.advanced.flags.openTempo = 1;
      h.notes.push('Haunt 3: it opens advanced formations already at 1 Tempo.');
    }
    return h;
  },
};

function announceShoe(c) {
  c.announceRule({
    id: `shoe:${c.self.id}`,
    name: `Tempo ${tempo(c)} / 3`,
    text: 'Every Tempo is 2 more on Quickstep and 1 more on each half of Spin. '
      + 'It gains one for every player turn it goes UNHIT — a little pressure stops the whole thing.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Masquerade Mask — it grows on what its friends do (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The Mask often becomes more dangerous because of what its allies are doing."
 * (§4.) Worthless alone, so §12 keeps it out of solo Scuffles.
 *
 * Mimicry watches the board through `onBoardEvent`, which is the hook the
 * engine already broadcasts Guard gains and status applications on — the
 * Patchwork Giant and Button Baby read the same feed.
 */
export const masqueradeMask = {
  id: 'masquerade-mask',
  name: 'Masquerade Mask',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [31, 31],
  silhouette: 'mask',
  palette: ['#f0e6ea', '#b98aa0', '#2a1b22'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.7,
  lore: 'A porcelain party mask trailing ribbons, wearing whichever expression is currently winning.',

  onSpawn(c) { mem(c).copied = false; mem(c).full = false; },

  onPlayerTurnStart(c) { mem(c).copied = false; },

  /**
   * §4: "whenever another enemy gains a positive effect, Masquerade Mask copies
   * a reduced version ONCE PER ENEMY TURN." Guard is the numeric case the
   * chapter leads with; a named non-stacking buff is worth a flat 5.
   */
  onBoardEvent(c, ev) {
    /* The shape is `{ type, actor, source, amount, id }` and `actor` is an
       ACTOR, not an id — engine.js documents it, and it documents it because
       this hook had no callers for months and two finished-looking defs read it
       wrong. `ev.actor === c.self` is the guard that stops the Mask copying its
       own Guard forever; `_boardDepth` is only a backstop. */
    if (!ev || mem(c).copied) return;
    if (ev.actor === c.self || ev.source === c.self) return;
    const share = mem(c).full ? 1 : flag(c, 'mimicry', 0.5);
    if (ev.type === 'block' && ev.amount > 0) {
      mem(c).copied = true;
      mem(c).full = false;
      c.block(c.self, Math.max(1, Math.floor(ev.amount * share)), { noJoin: true });
    } else if (ev.type === 'status' && ev.kind === 'buff') {
      // "A named non-stackable buff" is worth a flat 5 — it cannot be halved.
      mem(c).copied = true;
      mem(c).full = false;
      c.block(c.self, 5, { noJoin: true });
    }
  },

  moves: {
    'borrowed-smile': {
      id: 'borrowed-smile', name: 'Borrowed Smile', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + (mem(c).copied ? 3 : 0),
      tell: 'It is wearing somebody else\'s good mood.',
      effect(c) { hitPlayer(c, 7 + (mem(c).copied ? 3 : 0)); },
    },
    'change-face': {
      id: 'change-face', name: 'Change Face', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'It turns over, and there is another one underneath.',
      effect(c) { c.block(c.self, 9); mem(c).full = true; },
    },
    'mocking-bow': {
      id: 'mocking-bow', name: 'Mocking Bow', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'It bows to somebody who is not you.',
      effect(c) {
        hitPlayer(c, 5);
        // "This can intentionally trigger Mimicry." — it hands an ally Guard
        // precisely so it can copy it.
        const friends = allies(c).filter(isAlive);
        if (friends.length) c.block(friends[c.rng.int(friends.length)], 5);
      },
    },
  },

  nextMove: (c) => cyc(['mocking-bow', 'borrowed-smile', 'change-face', 'borrowed-smile'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.mimicry = 0.6;
      h.notes.push('Haunt 4: it copies 60% of a numeric buff instead of half.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 3. Velvet Curtain — you choose where the damage goes (§5)
// ═════════════════════════════════════════════════════════════════════════════
export const velvetCurtain = {
  id: 'velvet-curtain',
  name: 'Velvet Curtain',
  region: REGION,
  tier: 'normal',
  role: 'protector',
  hp: [36, 36],
  silhouette: 'curtain',
  palette: ['#6b1220', '#a8323f', '#25070c'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 1.15,
  lore: 'A great red curtain crossing the room on a rail nobody installed.',

  onSpawn(c) { mem(c).guarding = null; },

  onPlayerTurnStart(c) { mem(c).broke = false; },

  /** §5: "if Velvet Curtain loses at least 14 Courage during one player turn,
      protection immediately ends." Resolved as the threshold is crossed. */
  onDamaged(c) {
    if (mem(c).broke || dmgTaken(c) < flag(c, 'breakAt', 14)) return;
    mem(c).broke = true;
    drop(c);
  },

  onDeath(c) { drop(c); },

  moves: {
    'draw-the-curtain': {
      id: 'draw-the-curtain', name: 'Draw the Curtain', intent: Intent.DEFEND_BUFF, block: 6,
      applies: [{ id: 'behind-the-curtain', stacks: 1, to: 'allies' }],
      tell: 'It slides across in front of somebody.',
      effect(c) {
        c.block(c.self, 6);
        drop(c);
        const friends = allies(c).filter(isAlive);
        if (!friends.length) return;
        const pick = friends[c.rng.int(friends.length)];
        pick._curtain = c.self;
        c.applyStatus(pick, 'behind-the-curtain', 1, { fresh: true });
        mem(c).guarding = pick.defId;
        c.announceRule({
          id: `curtain:${c.self.id}`,
          name: `Behind the Curtain: ${pick.name}`,
          text: `Attack Tricks deal HALF to it and the Curtain takes the rest. You are not forbidden `
            + `from hitting it — you are choosing where the damage goes. `
            + `Deal the Curtain ${flag(c, 'breakAt', 14)} in one turn and the protection ends.`,
        });
      },
    },
    'heavy-drape': {
      id: 'heavy-drape', name: 'Heavy Drape', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'A great weight of fabric comes down.',
      effect(c) { hitPlayer(c, 8); },
    },
    'close-the-show': {
      id: 'close-the-show', name: 'Close the Show', intent: Intent.DEFEND, block: 12,
      tell: 'It draws itself closed.',
      effect(c) {
        c.block(c.self, 12);
        const kept = allies(c).find(a => isAlive(a) && a._curtain === c.self);
        if (kept) c.block(kept, 6);
      },
    },
  },

  nextMove: (c) => cyc(['draw-the-curtain', 'heavy-drape', 'close-the-show'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.breakAt = 17;
      h.notes.push('Haunt 5: it takes 17 damage in a turn to tear the curtain down, not 14.');
    }
    return h;
  },
};

function drop(c) {
  for (const a of allies(c)) {
    if (a._curtain !== c.self) continue;
    a._curtain = null;
    c.removeStatus(a, 'behind-the-curtain');
  }
  mem(c).guarding = null;
  c.clearRules(`curtain:${c.self.id}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Party Phantom — the first Invitation (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * §6's design principle, which governs the whole region: "Accepting an
 * Invitation should OFTEN BE CORRECT. The point is not to teach 'never accept
 * bargains'. It is to teach: know how much future danger you are buying."
 */
const delight = (c) => 2 * cnt(c, 'delight');
const OFFERS = [
  ['sweet-treat', 'Sweet Treat', 'recover 5 Courage'],
  ['sparkling-punch', 'Sparkling Punch', 'gain 1 Nerve this turn'],
  ['encore', 'Encore', 'draw 2 Tricks'],
];

export const partyPhantom = {
  id: 'party-phantom',
  name: 'Party Phantom',
  region: REGION,
  tier: 'normal',
  role: 'tempter',
  hp: [29, 29],
  silhouette: 'phantom',
  palette: ['#cfd8ee', '#8f9ec4', '#232a3d'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 2 },
  scale: 0.9,
  lore: 'A translucent guest holding a tray, so pleased to see you that it is almost rude to refuse.',

  onSpawn(c) { setCnt(c, 'delight', 0); announcePhantom(c); },

  onPlayerTurnStart(c) { mem(c).tookIt = false; },

  onCardPlayed(c) {
    if (!accepted(c)) return;
    takeBack(c);
    mem(c).tookIt = true;
    addCnt(c, 'delight', 1, flag(c, 'maxDelight', 4));
    announcePhantom(c);
  },

  /** An offer left on the table simply expires — §6 gives Decline no penalty. */
  onPlayerTurnEnd(c) { takeBack(c); },

  moves: {
    'offer-refreshment': {
      id: 'offer-refreshment', name: 'Offer Refreshment', intent: Intent.BUFF,
      tell: 'It holds the tray out and waits, very patiently.',
      effect(c) {
        const [id, name, what] = OFFERS[c.rng.int(OFFERS.length)];
        offer(c, id);
        c.announceRule({
          id: `offer:${c.self.id}`,
          name: `Invitation: ${name}`,
          text: `It is in your hand. Play it to ACCEPT — ${what} — and the Phantom takes 1 Delight for it. `
            + 'Leave it and it expires with the turn, at no cost. Accepting is often correct.',
        });
      },
    },
    'social-pressure': {
      id: 'social-pressure', name: 'Social Pressure', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + delight(c),
      tell: 'Everyone is looking at you and smiling.',
      effect(c) { hitPlayer(c, 6 + delight(c)); },
    },
    'delighted-laugh': {
      id: 'delighted-laugh', name: 'Delighted Laugh', intent: Intent.DEFEND, block: 7,
      blockFn: (c) => 7 + (mem(c).tookIt ? 4 : 0),
      tell: 'It is thrilled with how the evening is going.',
      effect(c) { c.block(c.self, 7 + (mem(c).tookIt ? 4 : 0)); },
    },
  },

  nextMove: (c) => cyc(['offer-refreshment', 'social-pressure', 'delighted-laugh'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.maxDelight = 5;
      h.notes.push('Haunt 6: it can reach 5 Delight.');
    }
    return h;
  },
};

function announcePhantom(c) {
  const n = cnt(c, 'delight');
  c.announceRule({
    id: `phantom:${c.self.id}`,
    name: `Delight ${n} / ${flag(c, 'maxDelight', 4)}`,
    text: `Every Delight is 2 more on Social Pressure — ${6 + 2 * n} right now. `
      + 'It gains one for each Invitation you take.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Goblet Geist — Courage straight into offence (§7)
// ═════════════════════════════════════════════════════════════════════════════
export const gobletGeist = {
  id: 'goblet-geist',
  name: 'Goblet Geist',
  region: REGION,
  tier: 'normal',
  role: 'tempter',
  hp: [33, 33],
  silhouette: 'goblet',
  palette: ['#8e1b2c', '#e6c9d2', '#2a0a11'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.6,
  lore: 'A crystal goblet floating at chest height, full of something dark red and very cold. Cordial, probably.',

  onSpawn(c) { mem(c).offered = null; },

  onCardPlayed(c) { if (accepted(c)) { takeBack(c); mem(c).drank = true; } },

  /**
   * §7: "Decline: Goblet Geist gains 6 Guard." A refusal is not free here.
   *
   * FLAGGED at turn end and PAID at its own turn start, because the engine wipes
   * every enemy's Guard at the start of that enemy's turn — Guard banked in
   * `onPlayerTurnEnd` is erased three steps later without ever having stopped
   * anything. The Bookmark Imp lost its 7 Guard the same way.
   */
  onPlayerTurnEnd(c) { if (takeBack(c)) mem(c).refused = true; },
  onTurnStart(c) {
    if (!mem(c).refused) return;
    mem(c).refused = false;
    c.block(c.self, 6);
  },

  moves: {
    'offer-the-goblet': {
      id: 'offer-the-goblet', name: 'Offer the Goblet', intent: Intent.BUFF,
      tell: 'It drifts to your elbow and waits.',
      effect(c) {
        /* §12: "Goblet Geist cannot offer Take a Sip when the player has 5 or
           less Courage." A bargain that can kill you is not a bargain. */
        if ((c.player.hp || 0) <= 5) { c.block(c.self, 6); return; }
        const draws = flag(c, 'sipDraw', false);
        offer(c, 'take-a-sip', { c: draws ? 5 : 4 });
        c.announceRule({
          id: `offer:${c.self.id}`,
          name: 'Invitation: Take a Sip',
          text: `It is in your hand. Play it to ACCEPT — lose ${draws ? 5 : 4} Courage, and your next `
            + 'Attack Trick this turn deals 5 more. REFUSE and the Goblet gains 6 Guard instead.',
        });
      },
    },
    toast: {
      id: 'toast', name: 'Toast', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It raises itself to you.',
      effect(c) { hitPlayer(c, 8); },
    },
    refill: {
      id: 'refill', name: 'Refill', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'It fills back up from nowhere in particular.',
      effect(c) { c.block(c.self, 5); c.heal(c.self, 5); },
    },
  },

  nextMove: (c) => cyc(['offer-the-goblet', 'toast', 'refill', 'toast'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.sipDraw = true;
      h.notes.push('Haunt 7: the Sip costs 5 Courage and also draws a Trick — a stronger temptation, not a bigger penalty.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 6. Waltzing Armor — what it is empowering matters more than what it does (§8)
// ═════════════════════════════════════════════════════════════════════════════
export const waltzingArmor = {
  id: 'waltzing-armor',
  name: 'Waltzing Armor',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [44, 44],
  silhouette: 'armor',
  palette: ['#8d939c', '#d7dce4', '#20242b'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.1,
  lore: 'An empty suit of formal armour going round the floor with a partner nobody else can see.',

  onSpawn(c) { mem(c).lead = true; announceArmor(c); },

  moves: {
    'lead-step': {
      id: 'lead-step', name: 'Lead Step', intent: Intent.ATTACK_BIG, damage: 12, hits: 1,
      tell: 'It takes the lead and the whole room shifts to match.',
      effect(c) { hitPlayer(c, 12); mem(c).lead = false; announceArmor(c); },
    },
    'follow-step': {
      id: 'follow-step', name: 'Follow Step', intent: Intent.BUFF,
      applies: [{ id: 'encore', stacks: 1, to: 'allies' }],
      blockFn: (c) => (allies(c).filter(isAlive).length ? 0 : 10),
      tell: 'It falls in behind somebody else.',
      effect(c) {
        mem(c).lead = true;
        announceArmor(c);
        /* §12: "Waltzing Armor cannot apply Encore to another Waltzing Armor at
           baseline difficulty." Two of them trading Encore is a loop, not a
           dance. And single-hit allies are preferred for the reason the status
           carries: Encore is per hit, so a 4x2 would take double what §8 says. */
        const pool = allies(c).filter(a => isAlive(a) && a.defId !== 'waltzing-armor');
        if (!pool.length) { c.block(c.self, 10); return; }
        const single = pool.filter(a => a.intent && (a.intent.hits || 1) === 1 && a.intent.damage > 0);
        const pick = (single.length ? single : pool)[c.rng.int((single.length ? single : pool).length)];
        pick._encore = flag(c, 'encore', 4);
        c.applyStatus(pick, 'encore', 1, { fresh: true });
        c.announceRule({
          id: `encore:${c.self.id}`,
          name: `Encore: ${pick.name}`,
          text: `Its next damaging attack deals ${pick._encore} more per hit.`,
        });
      },
    },
    'turn-together': {
      id: 'turn-together', name: 'Turn Together', intent: Intent.ATTACK, damage: 5, hits: 2,
      blockFn: (c) => (mem(c).lead ? 5 : 0),
      tell: 'Two steps, together, and it is somehow behind you for the second.',
      effect(c) {
        hitPlayer(c, 5, 2);
        if (mem(c).lead) { c.block(c.self, 5); return; }
        const friends = allies(c).filter(isAlive);
        if (friends.length) c.block(friends[c.rng.int(friends.length)], 5);
      },
    },
  },

  nextMove: (c) => cyc(['lead-step', 'follow-step', 'turn-together'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.encore = 6;
      h.notes.push('Haunt 8: Encore grants 6 additional damage instead of 4.');
    }
    return h;
  },
};

function announceArmor(c) {
  c.announceRule({
    id: `armor:${c.self.id}`,
    name: mem(c).lead ? 'Leading' : 'Following',
    text: mem(c).lead
      ? 'Leading: its own attack is the dangerous one.'
      : 'Following: it is about to make somebody ELSE dangerous instead. Watch who.',
  });
}

export const BALLROOM_ENEMIES = [
  dancingShoe, masqueradeMask, velvetCurtain, partyPhantom, gobletGeist, waltzingArmor,
];
export const BALLROOM_REGION = REGION;
