/**
 * The Crypt and Ossuary — the three Big Scares. OWNER: enemies.
 * Source of truth: docs/design/regions/11-crypt.md §13–§15.
 *
 *   The Ribcage Knight  three pieces of equipment you can take off it, and it
 *                       can put two of them back.
 *   The Walking Ossuary every Remains anybody makes feeds it — including the
 *                       ones it makes itself.
 *   The Coffin Collector it buries your Tricks and gives them back if you hit
 *                       hard enough.
 *
 * ── COMPONENTS ARE BODIES, NOT COUNTERS ─────────────────────────────────────
 *
 * §13 gives each of the Knight's Components its own Integrity and says "the
 * player MAY ATTACK the Knight itself, or one of its Components" — so they are
 * actors, exactly as the Wardrobe's Doors and the Lamplighter's Lamps are, and
 * every lookup here is by `defId` because the engine names actors `e0`, `e1`.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, dmgTaken, whenHandArrives, runHandOps,
} from './_lib.js';
import { leaveRemains, remainsOn } from './crypt.js';

const REGION = 'crypt';

/* ══ Big Scare 1 — The Ribcage Knight (§13) ══════════════════════════════════
 *
 * "Strip equipment first? Race the Knight? Destroy only Femur Blade? ALLOW IT
 * TO SPEND TURNS RECOVERING COMPONENTS instead of attacking?" (§13.)
 *
 * That last one is the interesting plan and it only exists because Recover
 * Equipment costs the Knight a whole action and is capped at two uses.
 */
function component(id, name, hp, lore, note) {
  return {
    id, name, region: REGION, tier: 'elite', role: 'bossPart', partOf: 'ribcage-knight',
    hp: [hp, hp],
    silhouette: id,
    palette: ['#ddd4bd', '#94896f', '#231e17'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.5,
    lore,

    onSpawn(c) { if (flag(c, 'reinforced', false)) c.block(c.self, 8); },

    /** §13: "Each destroyed Component leaves 1 special Knight Remains." */
    onDeath(c) {
      const knight = allies(c).find(a => a.defId === 'ribcage-knight' && isAlive(a));
      if (knight) (knight.mem ||= {}).loose = [...((knight.mem || {}).loose || []), id];
    },

    moves: {
      worn: { id: 'worn', name: 'Attached', intent: Intent.SLEEP, tell: note, effect() {} },
    },
    nextMove: () => 'worn',
    hauntScaling(level) {
      const h = hauntBase(level, 'elite');
      if (level >= 9) { h.flags.reinforced = true; h.notes.push('Haunt 9: it starts with 8 Guard.'); }
      return h;
    },
  };
}

export const ribShield = component(
  'rib-shield', 'Rib Shield', 24,
  'A shield made of somebody\'s ribs, which is not an improvement on ribs.',
  'While this holds, the Knight gains 7 Guard at the start of its turn.',
);
export const femurBlade = component(
  'femur-blade', 'Femur Blade', 22,
  'The longest bone in the body, sharpened along one side.',
  'While this holds, the Knight\'s damaging attacks deal 4 more.',
);
export const skullHelm = component(
  'skull-helm', 'Skull Helm', 20,
  'It is wearing a skull. It already had one.',
  'While this holds, the first negative status on the Knight each turn is reduced.',
);
// Haunt 9 reinforces exactly one Component; the shield is the authored choice.
femurBlade.hauntScaling = (level) => hauntBase(level, 'elite');
skullHelm.hauntScaling = (level) => hauntBase(level, 'elite');

/** A Component still attached. `defId`, never `id`. */
const wearing = (c, id) => allies(c).some(a => a.defId === id && isAlive(a));

export const ribcageKnight = {
  id: 'ribcage-knight',
  name: 'The Ribcage Knight',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [148, 148],
  silhouette: 'knight-bone',
  palette: ['#cfc6ae', '#8b8067', '#211c14'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.4,
  lore: 'A skeleton standing inside a suit of armour made from a much larger skeleton.',

  onSpawn(c) { mem(c).loose = []; mem(c).recovered = 0; announceKnight(c); },

  /** §13: the Rib Shield's standing effect. */
  onTurnStart(c) { if (wearing(c, 'rib-shield')) c.block(c.self, 7); },

  onTurnEnd(c) { announceKnight(c); },

  moves: {
    'knights-strike': {
      id: 'knights-strike', name: "Knight's Strike", intent: Intent.ATTACK, damage: 11, hits: 1,
      damageFn: (c) => 11 + (wearing(c, 'femur-blade') ? 4 : 0),
      tell: 'A long overhand swing.',
      effect(c) { hitPlayer(c, 11 + (wearing(c, 'femur-blade') ? 4 : 0)); },
    },
    brace: {
      id: 'brace', name: 'Brace', intent: Intent.DEFEND, block: 12,
      tell: 'It sets itself.',
      effect(c) { c.block(c.self, 12); },
    },
    'bone-rush': {
      id: 'bone-rush', name: 'Bone Rush', intent: Intent.ATTACK, damage: 5, hits: 3,
      damageFn: (c) => 5 + (wearing(c, 'femur-blade') ? 4 : 0),
      tell: 'It comes forward three times without stopping.',
      effect(c) { hitPlayer(c, 5 + (wearing(c, 'femur-blade') ? 4 : 0), 3); },
    },
    'recover-equipment': {
      id: 'recover-equipment', name: 'Recover Equipment', intent: Intent.SUMMON,
      tell: 'It bends down and picks a piece of itself back up.',
      effect(c) {
        const m = mem(c);
        const id = (m.loose || []).shift();
        if (!id) { c.block(c.self, 8); return; }
        m.recovered = (m.recovered || 0) + 1;
        const def = { 'rib-shield': ribShield, 'femur-blade': femurBlade, 'skull-helm': skullHelm }[id];
        // "Restore that Component at 50 percent Integrity."
        if (def) c.summon(id, { hp: Math.max(1, Math.round(def.hp[0] * 0.5)) });
        announceKnight(c);
      },
    },
  },

  /**
   * §13: Strike, Brace, Bone Rush, "then check Recover Equipment" — and only
   * twice in the whole fight, which is what makes stripping it worth doing.
   */
  nextMove: (c) => {
    const m = mem(c);
    const beat = cyc(['knights-strike', 'brace', 'bone-rush', 'recover-equipment'],
      (c.history || []).length);
    if (beat !== 'recover-equipment') return beat;
    if ((m.loose || []).length && (m.recovered || 0) < 2) return 'recover-equipment';
    return 'knights-strike';
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    return h;
  },
};

function announceKnight(c) {
  const on = ['rib-shield', 'femur-blade', 'skull-helm'].filter(id => wearing(c, id));
  const NICE = { 'rib-shield': 'Rib Shield', 'femur-blade': 'Femur Blade', 'skull-helm': 'Skull Helm' };
  c.announceRule({
    id: `knight:${c.self.id}`,
    name: on.length ? `Wearing: ${on.map(id => NICE[id]).join(' · ')}` : 'Stripped',
    text: 'Shield: 7 Guard a turn. Blade: +4 on every attack. Helm: it shrugs off the first status each turn. '
      + 'Each can be attacked on its own, and breaking one is permanent — except that twice in the fight it can '
      + 'spend a whole action picking one back up at half Integrity. Letting it do that is a real plan.',
  });
}

/* ══ Big Scare 2 — The Walking Ossuary (§14) ═════════════════════════════════
 *
 * "Remains are both physical objects and a resource meter. The player can
 * control the battlefield to control the monster." (§14.)
 *
 * Its Collection counts every Remains anybody makes, "even if the Remains is
 * immediately destroyed afterward" — which is why the count is incremented in
 * `crypt.js`'s `leaveRemains`, the one place every creation in the region goes
 * through, rather than by watching the board.
 */
const collection = (c) => cnt(c, 'collection');

export const walkingOssuary = {
  id: 'walking-ossuary',
  name: 'The Walking Ossuary',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [158, 158],
  silhouette: 'ossuary',
  palette: ['#d6cdb4', '#8a8066', '#1f1b14'],
  shape: { body: 'sprawling', limbs: 6, eyes: 0 },
  scale: 1.7,
  lore: 'A building-sized arrangement of several hundred people\'s bones, with small ones crawling in and out of it constantly.',

  onSpawn(c) { setCnt(c, 'collection', flag(c, 'openCollection', 0)); announceOssuary(c); },

  onPlayerTurnStart(c) { mem(c).cleared = 0; mem(c).docked = false; },

  /** §14: "at 2 Collection, gain 5 Guard at the start of each turn." */
  onTurnStart(c) { if (collection(c) >= 2) c.block(c.self, 5); },

  /**
   * §14: "Whenever the player destroys 2 Remains during one player turn, the
   * Ossuary loses 1 Collection. Once per turn."
   *
   * Counted on the board event rather than at turn end, so the Collection the
   * player just paid for is off the meter before the next intent is drawn.
   */
  onAllyDeath(c) {
    const dead = c.dead;
    if (!dead || dead.defId !== 'remains') return;
    const m = mem(c);
    m.cleared = (m.cleared || 0) + 1;
    if (m.docked || m.cleared < 2) return;
    m.docked = true;
    addCnt(c, 'collection', -1, 8, 0);
    announceOssuary(c);
  },

  moves: {
    'bone-sweep': {
      id: 'bone-sweep', name: 'Bone Sweep', intent: Intent.ATTACK, damage: 10, hits: 1,
      damageFn: (c) => 10 + (collection(c) >= 4 ? 3 : 0),
      tell: 'One whole wall of it comes round.',
      effect(c) { hitPlayer(c, 10 + (collection(c) >= 4 ? 3 : 0)); },
    },
    'add-to-the-walls': {
      id: 'add-to-the-walls', name: 'Add to the Walls', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'It finds a gap and fills it.',
      effect(c) {
        c.block(c.self, 8);
        leaveRemains(c, 1);          // which feeds its own Collection through the helper
        announceOssuary(c);
      },
    },
    'assemble-something': {
      id: 'assemble-something', name: 'Assemble Something', intent: Intent.DEFEND_BUFF, block: 14,
      tell: 'It builds a thing out of itself, for itself.',
      effect(c) {
        addCnt(c, 'collection', -2, 8, 0);
        // §14: "choose one effect ACCORDING TO CURRENT NEED."
        if (c.self.hp < c.self.maxHp * 0.4) c.heal(c.self, 8);
        else if (collection(c) >= 4) setCnt(c, 'assembled', 6);
        else c.block(c.self, 14);
        announceOssuary(c);
      },
    },
    'everything-belongs-here': {
      id: 'everything-belongs-here', name: 'Everything Belongs Here',
      intent: Intent.ATTACK_BIG, damage: 18, hits: 1,
      damageFn: (c) => 18 + cnt(c, 'assembled'),
      tell: 'It reaches out for the parts of the room that are not yet part of it.',
      effect(c) {
        const d = 18 + cnt(c, 'assembled');
        setCnt(c, 'assembled', 0);
        setCnt(c, 'collection', 0);
        hitPlayer(c, d);
        leaveRemains(c, 3);
        announceOssuary(c);
      },
    },
  },

  nextMove: (c) => {
    if (collection(c) >= 8) return 'everything-belongs-here';
    if (collection(c) >= 6) return 'assemble-something';
    return cyc(['bone-sweep', 'add-to-the-walls'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.flags.openCollection = 1;
      h.counters.collection = 1;
      h.notes.push('Haunt 9: it opens with 1 Collection.');
    }
    return h;
  },
};

function announceOssuary(c) {
  const n = collection(c);
  const marks = [];
  if (n >= 2) marks.push('2: 5 Guard every turn');
  if (n >= 4) marks.push('4: attacks deal 3 more');
  if (n >= 6) marks.push('6: it can Assemble');
  if (n >= 8) marks.push('8: EVERYTHING BELONGS HERE');
  c.announceRule({
    id: `ossuary:${c.self.id}`,
    name: `Collection ${n} / 8`,
    text: `Every Remains ANYBODY makes counts, even one you break the same turn. `
      + (marks.length ? `${marks.join('. ')}. ` : 'Thresholds at 2, 4, 6 and 8. ')
      + 'Destroy two Remains in one turn and it loses one.',
  });
}

/* ══ Big Scare 3 — The Coffin Collector (§15) ════════════════════════════════
 *
 * §15's design principle, quoted because it is the same one the Bookwyrm was
 * built on: "Like Bookwyrm, the player chooses what is temporarily removed. The
 * game creates sacrifice decisions WITHOUT RANDOMLY DELETING the key card a
 * build depends on."
 *
 * DEVIATION, the same one and for the same reason: there is no engine surface
 * for an enemy to stop the fight and ask, and random theft is the one thing §15
 * explicitly is not. So the Collector takes the MOST EXPENSIVE Trick in hand and
 * says so on a House Rule from the moment it appears — the decision stays the
 * player's (what is in your hand when it reaches for one), and it is never a
 * surprise.
 */
const coffins = (c) => (mem(c).interred || []).length;

export const coffinCollector = {
  id: 'coffin-collector',
  name: 'The Coffin Collector',
  region: REGION,
  tier: 'elite',
  role: 'bigscare',
  hp: [141, 141],
  silhouette: 'coffins',
  palette: ['#4a3a2c', '#9c8a6a', '#1a130e'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.45,
  lore: 'Something long-limbed dragging a row of small coffins behind it. Each one is labelled FOR SAFEKEEPING in a careful hand.',

  onSpawn(c) { mem(c).interred = []; announceCoffins(c); },

  onPlayerReady(c) { runHandOps(c); },
  onPlayerTurnStart(c) { mem(c).opened = false; },

  /**
   * §15: "Whenever the Collector loses at least 20 Courage during one player
   * turn, open the OLDEST occupied Coffin. Once per turn." Resolved as the
   * threshold is crossed, so the Trick is back before the turn is over.
   */
  onDamaged(c) {
    const m = mem(c);
    if (m.opened || dmgTaken(c) < 20 || !coffins(c)) return;
    m.opened = true;
    const back = m.interred.shift();
    if (back && c.returnToHand) c.returnToHand(back.uid);
    announceCoffins(c);
  },

  /** §15: "at 3 occupied Coffins, gain 7 Guard at the start of each turn." */
  onTurnStart(c) { if (coffins(c) >= 3) c.block(c.self, 7); },

  moves: {
    'keep-this-safe': {
      id: 'keep-this-safe', name: 'Keep This Safe', intent: Intent.DEFEND_DEBUFF, block: 5,
      tell: 'It opens one of the little coffins and waits.',
      effect(c) {
        c.block(c.self, 5);
        whenHandArrives(c, (k) => {
          if (coffins(k) >= 3) return;
          const hand = k.cardsIn ? k.cardsIn('hand') : [];
          if (!hand.length) return;
          let pick = hand[0];
          for (const x of hand) if ((x.cost || 0) >= (pick.cost || 0)) pick = x;
          if (k.moveCardTo) k.moveCardTo(pick.uid, 'exhaust');
          mem(k).interred.push({ uid: pick.uid, name: pick.name });
          announceCoffins(k);
        });
      },
    },
    'coffin-drag': {
      id: 'coffin-drag', name: 'Coffin Drag', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => 9 + 2 * coffins(c),
      tell: 'It hauls the whole row of them at you.',
      effect(c) { hitPlayer(c, 9 + 2 * coffins(c)); },
    },
    'lid-slam': {
      id: 'lid-slam', name: 'Lid Slam', intent: Intent.ATTACK, damage: 6, hits: 2,
      tell: 'Twice, and the second one is louder.',
      effect(c) { hitPlayer(c, 6, 2); },
    },
    'check-the-locks': {
      id: 'check-the-locks', name: 'Check the Locks', intent: Intent.DEFEND, block: 9,
      blockFn: (c) => 9 + 3 * coffins(c),
      tell: 'It goes down the row testing every catch.',
      effect(c) { c.block(c.self, 9 + 3 * coffins(c)); },
    },
  },

  nextMove: (c) => cyc(['keep-this-safe', 'coffin-drag', 'lid-slam', 'keep-this-safe', 'check-the-locks'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 9) {
      h.notes.push('Haunt 9: it arrives with a coffin already prepared.');
    }
    return h;
  },
};

function announceCoffins(c) {
  const held = (mem(c).interred || []).map(x => x.name);
  c.announceRule({
    id: `coffin:${c.self.id}`,
    name: held.length ? `For Safekeeping: ${held.join(', ')}` : 'For Safekeeping: empty',
    text: 'It takes the MOST EXPENSIVE Trick in your hand, up to three, and each one is 2 more damage on '
      + 'Coffin Drag and 3 more Guard on Check the Locks. Deal it 20 in one turn and the oldest coffin opens. '
      + 'Everything still in there comes back after the fight.',
  });
}

export const CRYPT_SCARES = [
  ribcageKnight, ribShield, femurBlade, skullHelm,
  walkingOssuary, coffinCollector,
];
