/**
 * The Moon Courtyard and Pumpkin Grounds — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/16-pumpkin-grounds.md §1–§12, §38–§45.
 *
 * "The Greenhouse is about uncontrolled propagation. The Pumpkin Grounds are
 * about CULTIVATED TIMING." Pipkin's region, and its one lesson is §preamble's:
 *
 *     THE SAFEST TIME TO DESTROY SOMETHING IS NOT ALWAYS THE MOST VALUABLE
 *     TIME TO DESTROY IT.
 *
 * ── RIPENESS IS A COUNTER, AND THAT IS THE WHOLE REASON IT WORKS ────────────
 *
 * §1 gives four stages — Seed, Growing, Ripe, Overripe — and every enemy here
 * reads its own stage for its damage, its vulnerability, or both. It is a
 * COUNTER rather than a status because writing a counter calls `refreshIntents`:
 * the moment a Pumpkin Pip ripens, the number over its head changes in front of
 * the player, and the 20% vulnerability it just picked up is on the board before
 * they decide whether to spend the turn on it.
 *
 * ── AND HARVEST IS A REWARD FOR WAITING, NEVER A TAX FOR NOT ────────────────
 *
 * §2 is careful about this: "Destroying it earlier still removes the threat. The
 * player simply forfeits the Harvest reward... The player should NEVER feel
 * forced to let dangerous enemies mature." So every Harvest in this file is
 * modest, every one of them is printed on the enemy's House Rule a full stage
 * before it is claimable, and nothing anywhere punishes a player for killing a
 * Seed on sight.
 *
 * ── EVERY METER THE PLAYER'S DAMAGE MOVES SETTLES AT THE TOP OF THE TURN ────
 *
 * The Gourd Guard's Crack, the Vine Lantern's Glow and the Scarecrow's delay are
 * all "if it loses N Courage during one player turn", and all three would
 * otherwise land in `onPlayerTurnEnd` — after the intent was drawn and before
 * the enemy acts, which is where the Bathhouse found five of these and the audit
 * scored 46 lies. `settleRipeLedger` runs at `onPlayerTurnStart` instead.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, field, lastMove, hpFrac,
} from './_lib.js';

const REGION = 'pumpkin-grounds';

/* ══ Ripeness ═══════════════════════════════════════════════════════════════ */

export const STAGES = ['Seed', 'Growing', 'Ripe', 'Overripe'];
export const SEED = 0, GROWING = 1, RIPE = 2, OVERRIPE = 3;

export function stageOf(actor) { return (actor && actor.counters && actor.counters.stage) || 0; }
export function isRipe(actor) { return stageOf(actor) === RIPE; }

/** §12: "An enemy cannot become Ripe and Overripe during the same resolution." */
export function ripen(c, by = 1) {
  const at = cnt(c, 'stage');
  setCnt(c, 'stage', Math.min(OVERRIPE, at + Math.min(1, by)));
  return cnt(c, 'stage');
}

/**
 * "Loses at least N Courage during one player turn", settled at the START of
 * the next one. See the file header for why not the other end.
 */
export function settleRipeLedger(c, need, onPay) {
  const before = mem(c).hpAtStart;
  const lost = (before ?? c.self.hp) - c.self.hp;
  mem(c).hpAtStart = c.self.hp;
  if (before == null || lost < need) return false;
  onPay(lost);
  return true;
}

/**
 * §2's Harvest, in one place.
 *
 * "That effect occurs only if the target is destroyed WHILE RIPE." Called from
 * every `onDeath` in the region, and the `when` predicate is what lets the
 * Gourd Guard ask for its own two-condition window without a second mechanism.
 */
export function harvest(c, when, reward, line) {
  if (!when(c)) return false;
  reward(c);
  c.say(line, 'good');
  return true;
}

/** The player-side Harvest payouts the region hands out, all modest (§2). */
export const REWARD = {
  guard: (n) => (c) => c.block(c.player, n, { source: null }),
  draw: () => (c) => c.applyStatus(c.player, 'encouraged', 1, { fresh: true }),
  nerve: () => (c) => { c.player.flags.energyNextTurn = (c.player.flags.energyNextTurn || 0) + 1; },
  heal: (n) => (c) => c.heal(c.player, n),
  cheaper: () => (c) => c.applyStatus(c.player, 'next-attack-discount', 1, { fresh: true }),
};

/* ══ the region's own statuses ══════════════════════════════════════════════ */
export const PUMPKIN_STATUSES = [
  {
    /** §6's Crack window. The reward for burst damage against a hard shell. */
    /* 'Split Rind' and not 'Cracked': the Ballroom already ships a Cracked, and
       two chips reading the same word on one portrait mean two things.
       `tests/status-names/check.py` is the gate that says so. */
    id: 'cracked-shell', name: 'Split Rind', kind: 'debuff', icon: 'pumpkin',
    desc: 'The shell is split. It takes 20% more damage until its next turn.',
    decay: 'enemyTurnEnd', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.2) },
  },
  {
    /** §7. Spending the Flare leaves it open. */
    /* 'Guttering' and not 'Dim', for the same reason — the Lampworks has one. */
    id: 'dim', name: 'Guttering', kind: 'debuff', icon: 'lantern',
    desc: 'It spent everything it had stored. The next Attack Trick to hit it deals 5 more damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => (h.card?.type === 'attack' ? amt + 5 : amt),
      onAttacked: (h) => { if (h.amount > 0) h.remove(); },
    },
  },
  {
    /** §8. The Hopper wants the same thing the player does. */
    id: 'tasty', name: 'Tasty', kind: 'debuff', icon: 'frog',
    desc: 'Ripe, and the Harvest Hopper has noticed. It will eat 6 Courage off this rather than let you have it.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    /** §8. */
    id: 'full-belly', name: 'Full Belly', kind: 'buff', icon: 'frog',
    desc: 'It has eaten {n} harvests. Each is worth 2 attack damage, and at 3 the next one is a Big Hop.',
    decay: 'never', stacks: true, max: 3,
  },
  {
    /**
     * §22's Bruise, which belongs to the Crops in the Scares and the boss but
     * is registered here with the rest of the region's vocabulary.
     *
     * "A Bruised Crop does not advance at the end of the next enemy turn." It is
     * the low-damage deck's way of controlling timing, and §22 says so.
     */
    id: 'bruised', name: 'Bruised', kind: 'debuff', icon: 'pumpkin',
    desc: 'Knocked about. It does not ripen at the end of the next enemy turn.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    /** §30's Jumping Gourd, harvested by the player. */
    id: 'jumping', name: 'Jumping', kind: 'buff', icon: 'frog',
    desc: 'Your next Trick this turn draws you a card after it resolves, and pays a Nerve back if it cost 2 or more.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      onCardPlayed: (h) => {
        if (!h.card || h.card.type === 'status') return;
        h.remove();
        h.e._asSeat(h.owner, () => h.e.drawCards(1, 'jumping'));
        if ((h.card.baseCost ?? 0) >= 2) {
          h.owner.flags.energyNextTurn = (h.owner.flags.energyNextTurn || 0) + 1;
        }
      },
    },
  },
];

/* ══ Crops ══════════════════════════════════════════════════════════════════ */

/**
 * §15 and §18's Crops, as one factory used by both the Great Root and the
 * Harvest King.
 *
 * A Crop is a body in a Plot with a stage and its own Integrity, and §18 makes
 * the Integrity depend on the stage — 6 as a Seed, 10 Growing, 15 Ripe. Growing
 * one therefore RAISES its Courage, which is the mechanical shape of "it is
 * getting harder to take off the board the longer you leave it".
 *
 * Every Crop answers the same three questions and answers them differently:
 *
 *   the player harvests it Ripe   a modest reward, printed on its House Rule
 *   the owner harvests it Ripe    a bigger one, and the owner decides when
 *   it goes Overripe              a weaker version for the owner, and it rots
 *
 * §19 explains that last line: "The King’s ideal outcome is harvesting at
 * exactly the correct time. Failing to harvest still provides some value, but
 * less." So waiting costs the owner too, which is what stops the board being a
 * pure timer against the player.
 */
export const CROP_INTEGRITY = [6, 10, 15, 15];

export function crop(id, name, ownerId, lore, playerReward, playerLine, ripeText) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'object', summonOnly: true,
    hp: [CROP_INTEGRITY[0], CROP_INTEGRITY[0]],
    silhouette: id,
    palette: ['#c8873c', '#6d4a1c', '#1d1207'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.34,
    lore,

    onSpawn(c) { setCnt(c, 'stage', SEED); fitIntegrity(c); },

    /**
     * §22's Bruise. "Whenever a Crop takes at least 8 damage but survives, it
     * becomes Bruised... This can occur once per Crop per stage."
     *
     * Measured across the player turn and applied at the top of the next one,
     * like every other player-damage ledger in this region — and it is the low
     * damage deck’s way of controlling timing, which §22 says outright.
     */
    onPlayerTurnEnd(c) {
      const lost = (mem(c).hpAtStart ?? c.self.hp) - c.self.hp;
      mem(c).hpAtStart = c.self.hp;
      if (lost >= 8 && mem(c).bruisedAt !== cnt(c, 'stage')) {
        mem(c).bruisedAt = cnt(c, 'stage');
        c.applyStatus(c.self, 'bruised', 1);
        c.say(`${name} is bruised. It will not ripen this turn.`, 'good');
      }
    },

    /** §20: destroying it Ripe pays the player; earlier just clears the Plot. */
    onDeath(c) {
      const owner = allies(c).find(a => a.defId === ownerId && isAlive(a));
      if (owner) {
        const m = (owner.mem ||= {});
        m.cleared = [...(m.cleared || []), id];
        if (isRipe(c.self)) m.stolen = (m.stolen || 0) + 1;
      }
      harvest(c, () => isRipe(c.self), playerReward, playerLine);
    },

    /* No House Rule card of its own. Four crops plus the owner is five cards
       stacked down the left, and the Kennels' `kn-boss` screenshot showed what
       the fourth does to the Kid's portrait. The owner's rule lists every plot
       and its stage; this tell carries the rest. */
    moves: { grow: { id: 'grow', name: 'In the Ground', intent: Intent.SLEEP,
      tell: `Take it while it is RIPE and ${ripeText} Take it earlier and you get a clear plot `
        + 'and nothing else. Leave it and whoever planted it gets the weak version. '
        + '8 damage that does not kill it Bruises it, and a Bruised crop skips one growth.',
      effect() {} } },
    nextMove: () => 'grow',
    hauntScaling(level) { return hauntBase(level, 'elite'); },
  };
}

/**
 * §19's growth, driven by whoever owns the Plot. Returns what happened so the
 * owner can pay itself the Overripe consolation and empty the Plot.
 */
export function growCrop(c, plant) {
  if (!plant || !plant.alive) return null;
  if (plant.hasStatus && plant.hasStatus('bruised')) {
    c.removeStatus(plant, 'bruised');
    return 'bruised';
  }
  const at = stageOf(plant);
  /* 'rotten' and 'overripe' are the same answer to the caller and both have to
     be, or a Crop that reached Overripe by any route other than this function —
     a Haunt opener, a debug set, the transition — would sit in its plot for the
     rest of the fight paying nobody. */
  if (at >= OVERRIPE) return 'overripe';
  plant.counters.stage = at + 1;
  /* Integrity follows the stage: a Ripe Crop is harder to take off the board
     than a Seed, which is what makes waiting a real decision rather than a
     free one. Existing damage is kept as a proportion. */
  const frac = plant.maxHp ? plant.hp / plant.maxHp : 1;
  plant.maxHp = CROP_INTEGRITY[plant.counters.stage];
  plant.hp = Math.max(1, Math.round(plant.maxHp * frac));
  return plant.counters.stage === OVERRIPE ? 'overripe' : 'grew';
}

function fitIntegrity(c) {
  c.self.maxHp = CROP_INTEGRITY[cnt(c, 'stage')];
  c.self.hp = c.self.maxHp;
  mem(c).hpAtStart = c.self.hp;
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 1. Pumpkin Pip — the cleanest possible introduction (§3)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const pumpkinPip = {
  id: 'pumpkin-pip',
  name: 'Pumpkin Pip',
  region: REGION,
  tier: 'normal',
  role: 'ripener',
  hp: [26, 26],
  silhouette: 'pumpkin-pip',
  palette: ['#d4823a', '#f0b06a', '#2a1608'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.5,
  lore: 'A tiny pumpkin with frog legs. It begins barely larger than an apple.',

  onSpawn(c) { setCnt(c, 'stage', GROWING); announcePip(c); },
  onPlayerTurnStart(c) { announcePip(c); },

  /** §3: "After each of its actions, advance one stage." */
  onTurnEnd(c) {
    ripen(c);
    /* §3's Overripe cost. It is a clock on the enemy, not on the player. */
    if (cnt(c, 'stage') === OVERRIPE) c.loseHp(c.self, 3);
    announcePip(c);
  },

  /** §3: Ripe takes 20% more. */
  damageTakenMul(c) { return cnt(c, 'stage') === RIPE ? 1.2 : 1; },

  onDeath(c) {
    harvest(c, () => isRipe(c.self), REWARD.guard(5),
      'Picked at exactly the right moment. 5 Guard.');
  },

  moves: {
    'pumpkin-bump': {
      id: 'pumpkin-bump', name: 'Pumpkin Bump', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => pipDmg(c, 7),
      tell: 'It hops into your shins.',
      effect(c) { hitPlayer(c, pipDmg(c, 7)); },
    },
    'little-hop': {
      id: 'little-hop', name: 'Little Hop', intent: Intent.ATTACK_DEFEND, damage: 5, hits: 1, block: 5,
      damageFn: (c) => pipDmg(c, 5),
      tell: 'Up, across, and down on you.',
      effect(c) { hitPlayer(c, pipDmg(c, 5)); c.block(c.self, 5); },
    },
    'squishy-slam': {
      id: 'squishy-slam', name: 'Squishy Slam', intent: Intent.ATTACK_BIG, damage: 11, hits: 1,
      damageFn: (c) => pipDmg(c, 11),
      tell: 'It is past its best and it knows it.',
      effect(c) { hitPlayer(c, pipDmg(c, 11)); c.loseHp(c.self, 2); },
    },
  },

  nextMove: (c) => (cnt(c, 'stage') === OVERRIPE ? 'squishy-slam'
    : cyc(['pumpkin-bump', 'little-hop'], (c.history || []).length)),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.advanced.counters.stage = 2;
      h.notes.push('Haunt 3: it arrives already Ripe in advanced formations.');
    }
    return h;
  },
};

/** §3's three bands. */
function pipDmg(c, base) {
  const s = cnt(c, 'stage');
  return Math.max(1, base + (s === GROWING ? -2 : s === RIPE ? 2 : s === OVERRIPE ? 5 : 0));
}

function announcePip(c) {
  const s = cnt(c, 'stage');
  c.announceRule({
    id: `pip:${c.self.id}`,
    name: `${STAGES[s].toUpperCase()}`,
    text: (s === GROWING ? 'Growing: it hits for 2 less. '
      : s === RIPE ? 'Ripe: it hits for 2 more AND takes 20% more damage. '
        : 'Overripe: it hits for 5 more and loses 3 Courage every turn. ')
      + 'It ripens one stage after every action it takes. '
      + 'HARVEST: kill it while it is Ripe and you gain 5 Guard. Killing it sooner is always allowed.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 2. Moonseed — a helpless thing you may want to let grow (§4)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const moonseed = {
  id: 'moonseed',
  name: 'Moonseed',
  region: REGION,
  tier: 'normal',
  role: 'grower',
  hp: [30, 30],
  silhouette: 'moonseed',
  palette: ['#c8d4ea', '#8a9ab8', '#161c28'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.55,
  lore: 'A glowing silver seed floats slightly above the soil. Tiny roots trail beneath it.',

  onSpawn(c) { setCnt(c, 'stage', SEED); announceSeed(c); },
  onPlayerTurnStart(c) { announceSeed(c); },

  /** §4: Moon Bloom gains 5 Guard at the end of its turn. */
  onTurnEnd(c) { if (cnt(c, 'stage') >= RIPE) c.block(c.self, 5); announceSeed(c); },

  /** §4: the Seed takes 25% more and cannot attack at all. */
  damageTakenMul(c) { return cnt(c, 'stage') === SEED ? 1.25 : 1; },

  onDeath(c) {
    harvest(c, () => cnt(c, 'stage') >= RIPE, REWARD.draw(),
      'It bursts into seed-light. An extra Trick next turn.');
  },

  moves: {
    germinate: {
      id: 'germinate', name: 'Germinate', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'It puts down another root.',
      effect(c) { c.block(c.self, 5); ripen(c); announceSeed(c); },
    },
    moonbeam: {
      id: 'moonbeam', name: 'Moonbeam', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + (cnt(c, 'stage') >= RIPE ? 4 : 0),
      tell: 'A thin line of cold light.',
      effect(c) { hitPlayer(c, 7 + (cnt(c, 'stage') >= RIPE ? 4 : 0)); },
    },
    'silver-bloom': {
      id: 'silver-bloom', name: 'Silver Bloom', intent: Intent.ATTACK_BIG, damage: 11, hits: 1,
      damageFn: (c) => 11 + 4,
      tell: 'It opens all the way, and the courtyard goes white.',
      effect(c) { hitPlayer(c, 15); },
    },
  },

  /** §4's behaviour, keyed off the stage rather than a modular cycle. */
  nextMove: (c) => {
    const s = cnt(c, 'stage');
    if (s === SEED) return 'germinate';
    if (s === GROWING) return lastMove(c) === 'moonbeam' ? 'germinate' : 'moonbeam';
    return lastMove(c) === 'silver-bloom' ? 'moonbeam' : 'silver-bloom';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.advanced.counters.stage = 1;
      h.notes.push('Haunt 4: it arrives already Growing in advanced formations.');
    }
    return h;
  },
};

function announceSeed(c) {
  const s = cnt(c, 'stage');
  c.announceRule({
    id: `seed:${c.self.id}`,
    name: s === SEED ? 'SEED' : s === GROWING ? 'GROWING' : 'MOON BLOOM',
    text: (s === SEED ? 'A Seed cannot attack at all and takes 25% MORE damage. It is free to kill right now. '
      : s === GROWING ? 'Growing. No modifier either way, and it is one Germinate from blooming. '
        : 'Moon Bloom: its attacks hit for 4 more and it gains 5 Guard every turn. ')
      + 'HARVEST: kill it while it is a Moon Bloom and you draw an extra Trick next turn. '
      + 'That is the whole question — a free kill now, or a stronger enemy and a card later.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 3. Scarecrow Sprout — it builds itself out of the dirt (§5)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const scarecrowSprout = {
  id: 'scarecrow-sprout',
  name: 'Scarecrow Sprout',
  region: REGION,
  tier: 'normal',
  role: 'builder',
  hp: [40, 40],
  silhouette: 'scarecrow-sprout',
  palette: ['#b9995c', '#6f5a34', '#221a0c'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 0.8,
  lore: 'A little straw bundle sticks out of the dirt. Each turn it grows more limbs.',

  onSpawn(c) { setCnt(c, 'stage', SEED); mem(c).hpAtStart = c.self.hp; announceSprout(c); },

  onPlayerTurnStart(c) { mem(c).hpAtStart = c.self.hp; announceSprout(c); },

  /**
   * §5: "If it loses at least 14 Courage during one player turn, delay its NEXT
   * Grow an Arm by one action."
   *
   * The only ledger in this region that settles at the END of the player's turn,
   * and it is deliberate. The rest settle at the top of the next turn because
   * they move a number the player has already been shown; this one moves nothing
   * of the kind. Grow an Arm's intent is 6 Guard whether it is delayed or not,
   * and the stage it would have reached only changes numbers a turn later. Held
   * to the start of the next turn instead it would delay the SECOND Grow an Arm,
   * which is not what §5 says and not what the player would expect from a limb
   * they just knocked off.
   */
  onPlayerTurnEnd(c) {
    const lost = (mem(c).hpAtStart ?? c.self.hp) - c.self.hp;
    if (lost < flag(c, 'delayAt', 14)) return;
    mem(c).delayed = 1;
    c.say('Something comes off it. It has to put itself back together first.', 'good');
    announceSprout(c);
  },

  /** §5: the Sprout Guards itself every turn. */
  onTurnStart(c) { if (cnt(c, 'stage') === SEED) c.block(c.self, 6); },

  onDeath(c) {
    harvest(c, () => cnt(c, 'stage') >= RIPE, REWARD.nerve(),
      'The whole thing comes apart at once. A Nerve next turn.');
  },

  moves: {
    'twig-swipe': {
      id: 'twig-swipe', name: 'Twig Swipe', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => sproutDmg(c, 7),
      tell: 'One arm, and not much of it.',
      effect(c) { hitPlayer(c, sproutDmg(c, 7)); },
    },
    'grow-an-arm': {
      id: 'grow-an-arm', name: 'Grow an Arm', intent: Intent.DEFEND_BUFF, block: 6,
      tell: 'It pulls another limb out of the soil.',
      effect(c) {
        c.block(c.self, 6);
        if (mem(c).delayed) { mem(c).delayed = 0; c.say('It gets nothing new out of the ground.', 'good'); }
        else ripen(c);
        announceSprout(c);
      },
    },
    haymaker: {
      id: 'haymaker', name: 'Haymaker', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      damageFn: (c) => sproutDmg(c, 14),
      tell: 'Everything it has built, thrown at you once.',
      effect(c) {
        hitPlayer(c, sproutDmg(c, 14));
        /* §5: "Then lose one form and return to Half Built. Part of it literally
           falls off." Its own best move is what un-ripens it, which is why the
           Harvest window closes as fast as it opens. */
        setCnt(c, 'stage', GROWING);
        c.say('An arm goes with it.', 'info');
        announceSprout(c);
      },
    },
  },

  nextMove: (c) => {
    if (cnt(c, 'stage') >= RIPE) return 'haymaker';
    return cyc(['grow-an-arm', 'twig-swipe'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.delayAt = 18;
      h.notes.push('Haunt 5: it takes 18 Courage in a turn to knock a limb off, not 14.');
    }
    return h;
  },
};

function sproutDmg(c, base) {
  const s = cnt(c, 'stage');
  return Math.max(1, base + (s === SEED ? -2 : s >= RIPE ? 3 : 0));
}

function announceSprout(c) {
  const s = cnt(c, 'stage');
  c.announceRule({
    id: `sprout:${c.self.id}`,
    name: s === SEED ? 'SPROUT' : s === GROWING ? 'HALF BUILT' : 'SCARECROW',
    text: (s === SEED ? 'Sprout: 6 Guard every turn and 2 less damage. '
      : s === GROWING ? 'Half Built: ordinary numbers, one arm from finished. '
        : 'Scarecrow: 3 more damage, and its Haymaker is 14 — but the swing costs it an arm and puts it back to Half Built. ')
      + `Take ${flag(c, 'delayAt', 14)} Courage off it in one turn and its next Grow an Arm does nothing. `
      + 'HARVEST: kill it in full Scarecrow form and you gain a Nerve next turn.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 4. Gourd Guard — let it harden, then crack it (§6)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const gourdGuard = {
  id: 'gourd-guard',
  name: 'Gourd Guard',
  region: REGION,
  tier: 'normal',
  role: 'hardener',
  hp: [43, 43],
  silhouette: 'gourd-guard',
  palette: ['#c07a34', '#6a4520', '#221208'],
  shape: { body: 'squat', limbs: 2, eyes: 0 },
  scale: 0.95,
  lore: 'A huge pumpkin grows around a suit of wooden garden armour.',

  onSpawn(c) { setCnt(c, 'stage', SEED); mem(c).hpAtStart = c.self.hp; announceGuard(c); },

  /**
   * §6's Crack: "If Hardened and it takes at least 18 Attack damage during one
   * player turn, return to Firm and become Cracked until its next turn."
   */
  onPlayerTurnStart(c) {
    settleRipeLedger(c, flag(c, 'crackAt', 18), () => {
      if (cnt(c, 'stage') < RIPE) return;
      setCnt(c, 'stage', GROWING);
      c.applyStatus(c.self, 'cracked-shell', 1, { fresh: true });
      c.say('The shell splits right across. It is wide open.', 'good');
    });
    announceGuard(c);
  },

  onTurnStart(c) { if (cnt(c, 'stage') >= RIPE) c.block(c.self, 7); },

  /** §6: Soft takes 15% more. Cracked is a status and stacks with this. */
  damageTakenMul(c) { return cnt(c, 'stage') === SEED ? 1.15 : 1; },

  onDeath(c) {
    harvest(c, () => c.has('cracked-shell', c.self), REWARD.guard(8),
      'It comes apart along the split. 8 Guard.');
  },

  moves: {
    'gourd-bash': {
      id: 'gourd-bash', name: 'Gourd Bash', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => 9 + (cnt(c, 'stage') >= RIPE ? 2 : 0),
      tell: 'It leads with the whole front of itself.',
      effect(c) { hitPlayer(c, 9 + (cnt(c, 'stage') >= RIPE ? 2 : 0)); },
    },
    harden: {
      id: 'harden', name: 'Harden', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'The rind thickens where you have been hitting it.',
      effect(c) { c.block(c.self, 8); ripen(c); announceGuard(c); },
    },
    'stem-shield': {
      id: 'stem-shield', name: 'Stem Shield', intent: Intent.DEFEND, block: 13,
      tell: 'It gets the stem between you and the rest of it.',
      effect(c) { c.block(c.self, 13); },
    },
  },

  nextMove: (c) => cyc(['harden', 'gourd-bash', 'stem-shield', 'gourd-bash'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.crackAt = 22;
      h.notes.push('Haunt 6: it takes 22 Courage in a turn to crack the shell, not 18.');
    }
    return h;
  },
};

function announceGuard(c) {
  const s = cnt(c, 'stage');
  const cracked = c.has('cracked-shell', c.self);
  c.announceRule({
    id: `gourd:${c.self.id}`,
    name: cracked ? 'CRACKED' : s === SEED ? 'SOFT' : s === GROWING ? 'FIRM' : 'HARDENED',
    text: (cracked ? 'Split open: 20% MORE damage until its next turn. This is the window. '
      : s === SEED ? 'Soft: 15% MORE damage. Easy now, and worth nothing later. '
        : s === GROWING ? 'Firm: no modifier. It hardens again on its next Harden. '
          : 'Hardened: 7 Guard every turn and 2 more damage. ')
      + `Take ${flag(c, 'crackAt', 18)} damage off it in ONE turn while Hardened and the shell cracks. `
      + 'HARVEST: kill it while it is Cracked and you gain 8 Guard. Letting it harden first is the point.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 5. Vine Lantern — three answers, none of them wrong (§7)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const vineLantern = {
  id: 'vine-lantern',
  name: 'Vine Lantern',
  region: REGION,
  tier: 'normal',
  role: 'charger',
  hp: [35, 35],
  silhouette: 'vine-lantern',
  palette: ['#e8a13c', '#7a4a12', '#1f1206'],
  shape: { body: 'floating', limbs: 0, eyes: 2 },
  scale: 0.7,
  lore: 'A jack o\' lantern hangs from a supernatural vine. Its internal light grows brighter as the fruit ripens.',

  onSpawn(c) { setCnt(c, 'glow', 0); mem(c).hpAtStart = c.self.hp; announceLantern(c); },

  /** §7: "If it loses at least 12 Courage during one player turn, remove 1 Glow." */
  onPlayerTurnStart(c) {
    settleRipeLedger(c, flag(c, 'douseAt', 12), () => {
      if (cnt(c, 'glow') <= 0) return;
      addCnt(c, 'glow', -1, 3, 0);
      c.say('Some of the light goes out of it.', 'good');
    });
    announceLantern(c);
  },

  onDeath(c) {
    harvest(c, () => cnt(c, 'glow') >= 3, REWARD.cheaper(),
      'All that stored light, and none of it spent. Your next Attack costs 1 less.');
  },

  moves: {
    'moonlight-drink': {
      id: 'moonlight-drink', name: 'Moonlight Drink', intent: Intent.DEFEND_BUFF, block: 6,
      tell: 'It turns its face up and takes some in.',
      effect(c) { c.block(c.self, 6); addCnt(c, 'glow', 1, 3, 0); announceLantern(c); },
    },
    'lantern-spit': {
      id: 'lantern-spit', name: 'Lantern Spit', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + 2 * cnt(c, 'glow'),
      tell: 'A mouthful of it, straight at you.',
      effect(c) { hitPlayer(c, 6 + 2 * cnt(c, 'glow')); },
    },
    'pumpkin-flare': {
      id: 'pumpkin-flare', name: 'Pumpkin Flare', intent: Intent.ATTACK_BIG, damage: 15, hits: 1,
      applies: [{ id: 'dim', stacks: 1, to: 'self' }],
      tell: 'Everything it has been storing, all at once.',
      effect(c) {
        hitPlayer(c, 15);
        setCnt(c, 'glow', 0);
        c.applyStatus(c.self, 'dim', 1);
        announceLantern(c);
      },
    },
  },

  nextMove: (c) => {
    if (cnt(c, 'glow') >= 3) return 'pumpkin-flare';
    return cyc(['moonlight-drink', 'lantern-spit'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.douseAt = 16;
      h.notes.push('Haunt 7: it takes 16 Courage in a turn to put a Glow out, not 12.');
    }
    return h;
  },
};

function announceLantern(c) {
  const g = cnt(c, 'glow');
  c.announceRule({
    id: `lantern:${c.self.id}`,
    name: `GLOW ${g} / 3`,
    text: `Lantern Spit hits for 2 more per Glow — ${6 + 2 * g} right now. At 3 it Flares for 15 and goes Dim, `
      + 'and a Dim lantern takes 5 more from your next Attack. '
      + `Take ${flag(c, 'douseAt', 12)} Courage off it in one turn and a Glow goes out. `
      + 'HARVEST: kill it at 3 Glow BEFORE the Flare and your next Attack costs 1 less. '
      + 'Suppress it, let it Flare and punish the Dim, or race it to 3 — all three work.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 6. Harvest Hopper — it wants what you want (§8)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const harvestHopper = {
  id: 'harvest-hopper',
  name: 'Harvest Hopper',
  region: REGION,
  tier: 'normal',
  role: 'thief',
  hp: [38, 38],
  silhouette: 'harvest-hopper',
  palette: ['#7a9a4a', '#435c26', '#141d0c'],
  shape: { body: 'squat', limbs: 4, eyes: 2 },
  scale: 0.75,
  lore: 'A large frog like creature with a tiny straw hat. It leaps from pumpkin to pumpkin looking for whatever is ready to eat.',

  /**
   * §8: "Whenever another enemy becomes Ripe, Harvest Hopper marks it as Tasty.
   * Only one Tasty target at a time."
   *
   * Marked at the top of the player's turn rather than the instant something
   * ripens, so the mark and the Steal it justifies are both on the board before
   * the player decides who to spend the turn on.
   */
  onPlayerTurnStart(c) {
    if (!tastyOf(c)) {
      const ripe = allies(c).find(a => isAlive(a) && isRipe(a) && a.role !== 'object');
      if (ripe) {
        c.applyStatus(ripe, 'tasty', 1);
        c.say(`It has its eye on ${ripe.name}.`, 'warn');
      }
    }
    announceHopper(c);
  },

  moves: {
    'steal-the-harvest': {
      id: 'steal-the-harvest', name: 'Steal the Harvest', intent: Intent.DEFEND_BUFF, block: 6,
      applies: [{ id: 'full-belly', stacks: 1, to: 'self' }],
      tell: 'It gets there first.',
      effect(c) {
        c.block(c.self, 6);
        const meal = tastyOf(c);
        if (meal) {
          /* §12: "Harvest Hopper cannot reduce a Tasty enemy below 1 Courage." */
          c.loseHp(meal, Math.min(6, Math.max(0, meal.hp - 1)));
          c.removeStatus(meal, 'tasty');
          c.say(`It takes a bite out of ${meal.name}.`, 'warn');
        }
        c.applyStatus(c.self, 'full-belly', 1);
        announceHopper(c);
      },
    },
    'tongue-flick': {
      id: 'tongue-flick', name: 'Tongue Flick', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + 2 * c.count('full-belly', c.self),
      tell: 'Faster than anything that shape should be.',
      effect(c) { hitPlayer(c, 7 + 2 * c.count('full-belly', c.self)); },
    },
    'frog-hop': {
      id: 'frog-hop', name: 'Frog Hop', intent: Intent.ATTACK_DEFEND, damage: 5, hits: 1, block: 6,
      damageFn: (c) => 5 + 2 * c.count('full-belly', c.self),
      tell: 'Over you, and back again.',
      effect(c) { hitPlayer(c, 5 + 2 * c.count('full-belly', c.self)); c.block(c.self, 6); },
    },
    'big-hop': {
      id: 'big-hop', name: 'Big Hop', intent: Intent.ATTACK_BIG, damage: 14, hits: 1,
      damageFn: (c) => 14 + 2 * c.count('full-belly', c.self),
      tell: 'It has had enough to do this properly.',
      effect(c) {
        hitPlayer(c, 14 + 2 * c.count('full-belly', c.self));
        c.removeStatus(c.self, 'full-belly');
        announceHopper(c);
      },
    },
  },

  nextMove: (c) => {
    if (c.count('full-belly', c.self) >= 3) return 'big-hop';
    if (tastyOf(c)) return 'steal-the-harvest';
    return cyc(['tongue-flick', 'frog-hop'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) h.notes.push('Haunt 8: Steal the Harvest takes 8 Courage rather than 6.');
    return h;
  },
};

function tastyOf(c) {
  return allies(c).find(a => isAlive(a) && a.hasStatus && a.hasStatus('tasty')) || null;
}

function announceHopper(c) {
  const belly = c.count('full-belly', c.self);
  const meal = tastyOf(c);
  c.announceRule({
    id: `hopper:${c.self.id}`,
    name: `FULL BELLY ${belly} / 3`,
    text: (meal ? `It is going to eat 6 Courage off ${meal.name} rather than let you have it. `
      : 'It marks whatever ripens next and eats the harvest before you can take it. ')
      + `Each Full Belly is 2 more attack damage, and at 3 the next attack is a 14-damage Big Hop `
      + 'that spends the lot. It is competing with you for the same thing, which is what makes '
      + 'ripeness worth arguing about.',
  });
}

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const PUMPKIN_ENEMIES = [
  pumpkinPip, moonseed, scarecrowSprout, gourdGuard, vineLantern, harvestHopper,
];
