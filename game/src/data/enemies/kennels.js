/**
 * The Kennels and Animal Ward — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/15-kennels.md §1–§13, §36–§44.
 *
 * "Unlike most regions, the animals here are not strange monsters guarding
 * rooms. THEY ARE THE REASON THE ROOMS EXIST." Pudding's region, and its one
 * lesson is §preamble's:
 *
 *     PROTECTION CAN BECOME ANOTHER FORM OF CONTROL WHEN THE PROTECTED
 *     INDIVIDUAL CANNOT LEAVE.
 *
 * ── A WARD ANIMAL IS A THING ON THE BOARD THAT CANNOT BE HURT ───────────────
 *
 * §2 is unusually strict and every clause of it is load-bearing: Ward Animals
 * "are not enemies", "are never directly attacked", "cannot die during
 * combat", and reaching Fright 3 means only that "the player loses the
 * opportunity to free it during that encounter. THERE IS NO PERMANENT INJURY."
 *
 * The engine has never had a body like that, and one flag is not enough for it:
 *
 *   `isTargetable: () => false`     no card can be aimed at it
 *   `modifyDamageTaken: () => 0`    and area damage, which does not aim, does
 *                                   nothing to it either
 *
 * The second is the one that matters. `damageAll` walks `livingEnemies()` and
 * never consults targeting, so a Ward Animal with only the first flag would
 * have been perfectly safe from every Attack Trick in the game and killable by
 * a sweep — which is exactly the failure §2 is written to forbid.
 *
 * It also leaves when the fight does. A body nothing can kill keeps
 * `livingEnemies()` non-empty forever, so the animal despawns itself the moment
 * the last real enemy falls. `onAllyDeath` runs before the engine's end-of-
 * combat check, which is the only reason that works.
 *
 * ── AND FREEING ONE IS NEVER MANDATORY ──────────────────────────────────────
 *
 * §3: "Freeing Ward Animals is advantageous. It is NOT MANDATORY. A struggling
 * player can focus on surviving the Scuffle." Nothing in this file gates
 * progress, damage or victory on a rescue; every Restraint is an optional
 * target with a printed reward, and the region's hardest formation (§12
 * Scuffle 14) is hard because the containment system repairs itself, not
 * because the animal is in danger.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, played, field, lastMove, hpFrac,
} from './_lib.js';

const REGION = 'kennels';

/* ══ Ward Animals ═══════════════════════════════════════════════════════════ */

/** The Restraint kinds, and which object removes each. */
export const RESTRAINTS = {
  cage: { id: 'cage', name: 'Cage Latch', object: 'cage-latch' },
  collar: { id: 'collar', name: 'Collar', object: 'ward-collar' },
  leash: { id: 'leash', name: 'Leash', object: 'ward-leash' },
};

/** Every living Ward Animal on the board. */
export function wardAnimals(c) {
  return board(c).filter(a => a && a.alive && String(a.defId || '').startsWith('ward-'));
}

/** The one this enemy should be working on, if any. */
export function someAnimal(c) { return wardAnimals(c)[0] || null; }

/** §2: "Certain containment enemies can increase Fright." Never below 0, never above 3. */
export function frighten(c, animal, n) {
  if (!animal || !animal.alive) return;
  const before = animal.counters.fright || 0;
  const after = Math.max(0, Math.min(3, before + n));
  animal.counters.fright = after;
  if (after === before) return;
  c.say(n > 0 ? `${animal.name} shrinks back.` : `${animal.name} settles a little.`, n > 0 ? 'warn' : 'good');
  /* §2: "At 3 Fright the animal hides somewhere safe. It leaves the combat."
     Not a loss and not an injury — the player simply does not get to free it. */
  if (after >= 3) {
    c.say(`${animal.name} finds somewhere to hide. It is not hurt; you just cannot reach it now.`, 'info');
    c.despawn(animal);
  }
}

/**
 * One Ward Animal. §2 gives them a Fright meter and §3 gives them Restraints;
 * everything else about them is that they are not part of the fight.
 */
function wardAnimal(id, name, lore) {
  return {
    id,
    name,
    region: REGION,
    tier: 'normal',
    role: 'ward',
    summonOnly: true,
    hp: [1, 1],
    silhouette: id,
    palette: ['#c9b79a', '#8a7a60', '#221c14'],
    shape: { body: 'squat', limbs: 4, eyes: 2 },
    scale: 0.45,
    lore,

    /** §2: "They are never directly attacked." */
    isTargetable: () => false,

    onSpawn(c) {
      setCnt(c, 'fright', 0);
      c.applyStatus(c.self, 'ward-animal', 1);
      if (!mem(c).restraints) mem(c).restraints = [];
      announceAnimal(c);
    },

    /**
     * Two different things, both here.
     *
     * A Restraint object dying is how an animal gets free. The last real enemy
     * dying is how the animal gets to go home anyway — and without that second
     * branch a body nothing can kill would hold `livingEnemies()` above zero
     * and the fight would never end.
     */
    onAllyDeath(c) {
      const left = (mem(c).restraints || []).filter(k => restraintAlive(c, c.self, k));
      mem(c).restraints = left;
      if (!left.length && !mem(c).freed) return free(c);
      if (!board(c).some(a => a && a.alive && a !== c.self && a.role !== 'ward'
        && !String(a.defId || '').startsWith('ward-'))) {
        c.say(`${name} slips out through the open door.`, 'good');
        c.despawn(c.self);
        return;
      }
      announceAnimal(c);
    },

    onPlayerTurnStart(c) { announceAnimal(c); },

    moves: {
      wait: {
        id: 'wait', name: 'Frightened', intent: Intent.SLEEP,
        tell: 'It is not fighting you. It is waiting to see what you do.',
        effect() {},
      },
    },
    nextMove: () => 'wait',
    hauntScaling(level) { return hauntBase(level, 'normal'); },
  };
}

function restraintAlive(c, animal, kind) {
  const objId = RESTRAINTS[kind] && RESTRAINTS[kind].object;
  return board(c).some(a => a && a.alive && a.defId === objId && (a.mem || {}).wardId === animal.id);
}

/** §3's reward, once per animal. */
function free(c) {
  mem(c).freed = 1;
  c.say(`${c.self.name} is free. It goes, and it looks back once.`, 'good');
  c.applyStatus(c.player, 'encouraged', 1, { fresh: true });
  c.block(c.player, 5, { source: null });
  const trust = board(c).find(a => a && a.alive && a.defId === 'kennelmaster');
  if (trust) { const m = (trust.mem ||= {}); m.trust = Math.min(3, (m.trust || 0) + 1); }
  c.despawn(c.self);
}

function announceAnimal(c) {
  const left = (mem(c).restraints || []).filter(k => restraintAlive(c, c.self, k));
  const names = left.map(k => RESTRAINTS[k].name);
  c.announceRule({
    id: `ward:${c.self.id}`,
    name: `${c.self.name.toUpperCase()} · FRIGHT ${cnt(c, 'fright')} / 3`,
    text: (names.length
      ? `It cannot be hurt and it cannot be attacked. Break its ${names.join(' and its ')} and it goes free — `
        + 'you gain 5 Guard and draw an extra Trick next turn. '
      : 'Nothing is holding it any more. ')
      + 'At Fright 3 it hides instead, which costs you the rescue and costs it nothing. '
      + 'None of this is required to win the Scuffle.',
  });
}

export const wardPup = wardAnimal('ward-pup', 'A Small Grey Dog',
  'Somebody\'s. The tag has been taken off and the mark where it sat is still there.');
export const wardCat = wardAnimal('ward-cat', 'A Long Haired Cat',
  'Enormously unimpressed, and shaking anyway.');
export const wardBird = wardAnimal('ward-bird', 'A Sooty Bird',
  'It has not sung since it got here. It watches the door.');

/* ══ Restraints ═════════════════════════════════════════════════════════════ */

/**
 * A Restraint object. §4 and §6 give two of them Integrity outright; the Collar
 * gets one for the same reason, because §12 Scuffle 10 says "the player may
 * free the animal WITHOUT DEFEATING EITHER ENEMY" and that is only possible if
 * every Restraint is a target of its own.
 */
function restraint(kind, hp, lore, tell) {
  const spec = RESTRAINTS[kind];
  return {
    id: spec.object,
    name: spec.name,
    region: REGION,
    tier: 'normal',
    role: 'object',
    summonOnly: true,
    hp: [hp, hp],
    silhouette: spec.object,
    palette: ['#6d6a63', '#a9a49a', '#191713'],
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.34,
    lore,
    onDeath(c) {
      const animal = board(c).find(a => a && a.alive && a.id === (mem(c).wardId || ''));
      if (!animal) return;
      const m = (animal.mem ||= {});
      m.restraints = (m.restraints || []).filter(k => k !== kind);
    },
    moves: { hold: { id: 'hold', name: 'Fastened', intent: Intent.SLEEP, tell, effect() {} } },
    nextMove: () => 'hold',
    hauntScaling(level) { return hauntBase(level, 'normal'); },
  };
}

export const cageLatch = restraint('cage', 10,
  'A sprung steel latch, oiled recently by somebody who cared about it working.',
  'Break it and the cage opens.');
export const wardCollar = restraint('collar', 8,
  'Soft webbing with a brass buckle. It is one hole too tight.',
  'Break it and the collar comes off.');
export const wardLeash = restraint('leash', 9,
  'A lead with no handle at the far end. It goes into the wall.',
  'Break it and the lead lets go.');

/**
 * Fit a fresh set of Restraints to whichever animal is on the board.
 *
 * Called from the containment enemies' `onSpawn`, because §4 and §6 both say
 * the enemy BEGINS with the animal held — the restraint belongs to the enemy's
 * setup, not to the encounter table.
 */
export function fitRestraint(c, kind) {
  const animal = someAnimal(c);
  if (!animal) return null;
  const m = (animal.mem ||= {});
  if ((m.restraints || []).includes(kind)) return null;
  const obj = c.summon(RESTRAINTS[kind].object);
  if (!obj) return null;
  obj.mem = { ...(obj.mem || {}), wardId: animal.id };
  m.restraints = [...(m.restraints || []), kind];
  return obj;
}

/* ══ the region's own statuses ══════════════════════════════════════════════ */
export const KENNEL_STATUSES = [
  {
    /** §2, both halves. See the file header for why one flag was not enough. */
    id: 'ward-animal', name: 'Not Part of This', kind: 'buff', icon: 'paw',
    desc: 'A Ward Animal. It cannot be attacked, it cannot be damaged, and it cannot be hurt by anything in this fight.',
    decay: 'never', stacks: false, max: 1,
    untargetableBy: ['attack', 'skill', 'power'],
    hooks: { modifyDamageTaken: () => 0 },
  },
  {
    /** §3's Encouraged. The Guard is immediate; the Trick is next turn. */
    id: 'encouraged', name: 'Encouraged', kind: 'buff', icon: 'paw',
    desc: 'Somebody got out. Draw 1 extra Trick at the start of your turn.',
    decay: 'turnStart', stacks: false, max: 1,
    hooks: { onTurnStart: (h) => { h.e.drawCards(1, 'encouraged'); } },
  },
  {
    /**
     * §5. "The Collar does not forbid the player from playing many Tricks. It
     * creates a COST for pushing beyond the imposed limit."
     *
     * The reducer stays pure — it charges whenever the fourth Trick is being
     * priced — and `onCardPlayed` is what breaks the collar afterwards.
     */
    id: 'tight-collar', name: 'Tight Collar', kind: 'debuff', icon: 'collar',
    desc: 'Your fourth Trick this turn costs 1 more Nerve. Then the collar comes off.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        return n === 3 ? Math.max(1, cost + 1) : cost;
      },
      onCardPlayed: (h) => {
        const n = (h.e && h.e.playedThisTurn && h.e.playedThisTurn.length) || 0;
        if (n >= 4) h.remove();
      },
    },
  },
  {
    /** §4's no-animal branch: the Cage encloses an ALLY instead. */
    id: 'enclosed', name: 'Enclosed', kind: 'buff', icon: 'cage',
    desc: 'Shut inside the cage. The first Attack Trick to hit it each turn deals 3 less damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => {
        if (!amt || h.card?.type !== 'attack' || h.owner?._enclosedSpent) return amt;
        if (h.owner) h.owner._enclosedSpent = true;
        return Math.max(0, amt - 3);
      },
    },
  },
  {
    /** §6. Tether is a THRESHOLD, not a reduction — the player can plan around it. */
    id: 'tethered', name: 'Tethered', kind: 'buff', icon: 'leash',
    desc: 'On a lead. The first time it drops below half Courage, the Leash Hand pulls it back.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    /**
     * §8: "The next time that enemy would be reduced to 0 Courage, remain at 1
     * Courage instead. Then Stable disappears."
     *
     * `onLethal` is the engine's own seam for exactly this — it fires only when
     * the remainder would take Courage to zero, and `setHp` is how something
     * survives at a number. Without the hook this was a chip on a portrait that
     * meant nothing, which is the failure mode this project keeps finding.
     */
    id: 'stable', name: 'Stable', kind: 'buff', icon: 'clipboard',
    desc: 'The Orderly has it stabilised. The next time it would fall, it stays at 1 Courage instead.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      onLethal: (h) => {
        h.setHp(1);
        h.remove();
        if (h.e && h.e.say) h.e.say(`${h.owner?.name || 'It'} is held at 1 Courage.`, 'warn');
      },
    },
  },
  {
    /**
     * §6's Pull Back rider: "its next damaging attack deals 3 LESS damage."
     *
     * Exactly 3, not Weak's 25%, because the region's House Rules print the
     * number and a percentage would make them wrong. Granted at the START of
     * the player's turn — see `leashHand.onPlayerTurnStart` — so it is inside
     * the number the player reads rather than added after they committed.
     */
    id: 'pulled-back', name: 'Pulled Back', kind: 'debuff', icon: 'leash',
    desc: 'Hauled out of it. Its next damaging attack deals 3 less damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, h) => (h.kind === 'attack' ? Math.max(0, amt - 3) : amt),
      onDealtDamage: (h) => { if (h.kind === 'attack') h.remove(); },
    },
  },
  {
    /**
     * §9. Named Tucked In rather than Covered: the Nursery's Blanket Blob
     * already ships a status called `covered` with a different number, and two
     * chips reading the same word on the same portrait mean two things.
     */
    id: 'tucked', name: 'Tucked In', kind: 'buff', icon: 'blanket',
    desc: 'Under the blanket. The first 8 damage it would take each turn goes to the Comfort Blanket instead.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      /* Bank in the reducer, pay in `onAttacked` — dealing damage from inside
         the damage pipeline is re-entrant and silently does nothing. The
         Ballroom's Velvet Curtain is the same split. */
      modifyDamageTaken: (amt, h) => {
        if (amt <= 0) return amt;
        const spent = (h.owner && h.owner._tuckedSpent) || 0;
        const room = Math.max(0, 8 - spent);
        if (!room) return amt;
        const moved = Math.min(room, amt);
        if (h.owner) {
          h.owner._tuckedSpent = spent + moved;
          h.owner._tuckedOwed = (h.owner._tuckedOwed || 0) + moved;
        }
        return amt - moved;
      },
      onDamaged: (h) => {
        const o = h.owner;
        const owed = o && o._tuckedOwed;
        if (!owed) return;
        o._tuckedOwed = 0;
        const blanket = h.e.enemies.find(x => x.defId === 'comfort-blanket' && x.alive);
        if (blanket) {
          h.e.dealDamage({ attacker: null, defender: blanket, amount: owed,
            kind: 'hazard', cause: 'blanket' });
        }
      },
      onTurnStart: (h) => { if (h.owner) h.owner._tuckedSpent = 0; },
    },
  },
  {
    /** §7's Energy Treat, off the Feeding Cart. */
    /**
     * §7's Energy Treat, handed over at the START of the player's turn.
     *
     * The Cart delivers during the enemy phase, and an ally that acts later in
     * that same phase has already had its number drawn — granting +4 there
     * would raise a promise the player had seen. So the Cart MARKS a recipient
     * and `feedingCart.onPlayerTurnStart` hands the treat over, which is the
     * same fix the Peephole's Told On needed in the Secret Passages.
     */
    id: 'energy-treat', name: 'Energy Treat', kind: 'buff', icon: 'treat',
    desc: 'Its next damaging attack deals 4 more damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageDealt: (amt, h) => (h.kind === 'attack' ? amt + 4 : amt),
      onDealtDamage: (h) => { if (h.kind === 'attack' && h.amount > 0) h.remove(); },
    },
  },
];

/* ═════════════════════════════════════════════════════════════════════════════
 * 1. Walking Cage — the containment is the enemy (§4)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const walkingCage = {
  id: 'walking-cage',
  name: 'Walking Cage',
  region: REGION,
  tier: 'normal',
  role: 'container',
  hp: [37, 37],
  silhouette: 'walking-cage',
  palette: ['#7b7468', '#b9b2a4', '#1c1a16'],
  shape: { body: 'squat', limbs: 4, eyes: 0 },
  scale: 0.9,
  lore: 'A kennel cage walks on four metal legs. Its door repeatedly swings open as though trying to catch something.',

  onSpawn(c) {
    const latch = fitRestraint(c, 'cage');
    mem(c).latchId = latch ? latch.id : null;
    /* §4: "If no Ward Animal is present, Walking Cage instead uses Enclose on
       another enemy." The containment does not stop existing when there is
       nobody to contain — it just picks somebody else. */
    if (!latch) {
      const friend = allies(c).find(isAlive);
      if (friend) {
        c.block(friend, 8);
        c.applyStatus(friend, 'enclosed', 1);
        mem(c).enclosedId = friend.id;
        const obj = c.summon('cage-latch');
        if (obj) mem(c).latchId = obj.id;
      }
    }
    announceCage(c);
  },

  onPlayerTurnStart(c) {
    if (mem(c).enclosedId) {
      const who = board(c).find(a => a && a.id === mem(c).enclosedId);
      if (who) who._enclosedSpent = false;
    }
    announceCage(c);
  },

  /** §4: destroying the Latch removes whatever it was holding shut. */
  onAllyDeath(c) {
    const latch = latchOf(c);
    if (latch) { announceCage(c); return; }
    if (mem(c).enclosedId) {
      const who = board(c).find(a => a && a.id === mem(c).enclosedId);
      if (who) c.removeStatus(who, 'enclosed');
      mem(c).enclosedId = null;
      c.say('The cage door swings open and stays open.', 'good');
    }
    announceCage(c);
  },

  moves: {
    'cage-slam': {
      id: 'cage-slam', name: 'Cage Slam', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It walks into you door first.',
      effect(c) { hitPlayer(c, 8); },
    },
    rattle: {
      id: 'rattle', name: 'Rattle', intent: Intent.DEFEND, block: 10,
      blockFn: (c) => 10 + (latchOf(c) ? 4 : 0),
      tell: 'Every bar of it shakes at once.',
      effect(c) { c.block(c.self, 10 + (latchOf(c) ? 4 : 0)); },
    },
    'lock-it': {
      id: 'lock-it', name: 'Lock It', intent: Intent.BUFF,
      tell: 'It checks the latch, and the latch is better than it was.',
      effect(c) {
        const latch = latchOf(c);
        if (!latch) { c.block(c.self, 6); c.say('There is nothing left to lock.', 'good'); return; }
        c.heal(latch, 5);
        announceCage(c);
      },
    },
  },

  /** §4: "Cage Slam. Rattle. Lock It if possible. Cage Slam." */
  nextMove: (c) => cyc(['cage-slam', 'rattle', 'lock-it', 'cage-slam'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) h.notes.push('Haunt 4: Lock It restores 8 Integrity instead of 5.');
    return h;
  },
};

function latchOf(c) {
  const id = mem(c).latchId;
  return id ? board(c).find(a => a && a.alive && a.id === id) : null;
}

function announceCage(c) {
  const latch = latchOf(c);
  const holding = someAnimal(c);
  c.announceRule({
    id: `cage:${c.self.id}`,
    name: latch ? `LATCH ${latch.hp} / ${latch.maxHp}` : 'THE DOOR IS OPEN',
    text: latch
      ? (holding
        ? 'The animal inside is not your enemy and cannot be hurt. Break the LATCH, not the cage. '
        : 'It has shut one of the others in: 8 Guard, and their first Attack taken each turn is 3 less. ')
        + 'The cage repairs its own latch every third turn, so chipping it does not work.'
      : 'Nothing is shut in any more. The cage is still a cage and still fights.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 2. Collar Keeper — a limit, not a prohibition (§5)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const collarKeeper = {
  id: 'collar-keeper',
  name: 'Collar Keeper',
  region: REGION,
  tier: 'normal',
  role: 'restrainer',
  hp: [31, 31],
  silhouette: 'collars',
  palette: ['#5a4130', '#9c7a56', '#171008'],
  shape: { body: 'floating', limbs: 6, eyes: 0 },
  scale: 0.8,
  lore: 'A floating collection of collars, tags, clasps and buckles, moving like a many armed creature.',

  onSpawn(c) { fitRestraint(c, 'collar'); },

  /** §5: "When Collar Keeper is defeated, any Collar Restraint it created is removed." */
  onDeath(c) {
    for (const a of board(c)) {
      if (a && a.alive && a.defId === 'ward-collar') c.despawn(a);
    }
    for (const animal of wardAnimals(c)) {
      const m = (animal.mem ||= {});
      m.restraints = (m.restraints || []).filter(k => k !== 'collar');
    }
    c.removeStatus(c.player, 'tight-collar');
    c.say('Every buckle it was holding comes undone at once.', 'good');
  },

  moves: {
    'fit-the-collar': {
      id: 'fit-the-collar', name: 'Fit the Collar', intent: Intent.DEBUFF,
      applies: [{ id: 'tight-collar', stacks: 1, to: 'player' }],
      tell: 'It measures you, unhurriedly. Your fourth Trick will cost 1 more Nerve — a price for '
        + 'going past what it thinks you should, not a limit on what you may do. Killing it undoes every buckle.',
      effect(c) {
        if (c.has('tight-collar', c.player)) { c.block(c.self, 8); return; }
        c.applyStatus(c.player, 'tight-collar', 1, { fresh: true });
      },
    },
    'tag-snap': {
      id: 'tag-snap', name: 'Tag Snap', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'A brass tag, on the end of a very long strap.',
      effect(c) { hitPlayer(c, 7); },
    },
    'check-the-buckle': {
      id: 'check-the-buckle', name: 'Check the Buckle', intent: Intent.DEFEND, block: 9,
      tell: 'It goes round the ward tightening things by one hole.',
      effect(c) {
        c.block(c.self, 9);
        const animal = wardAnimals(c).find(a => ((a.mem || {}).restraints || []).includes('collar'));
        if (animal) frighten(c, animal, 1);
      },
    },
  },

  nextMove: (c) => cyc(['fit-the-collar', 'tag-snap', 'check-the-buckle'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) h.notes.push('Haunt 5: Tight Collar catches your THIRD Trick instead of your fourth.');
    return h;
  },
};

/* No House Rule card. Tight Collar's whole rule is printed on the status chip
   it puts on the Kid, and a formation in this region can hold four bodies that
   each want to explain themselves — see the note in `bosses/kennelmaster.js`.
   The tells carry the rest. */

/* ═════════════════════════════════════════════════════════════════════════════
 * 3. Leash Hand — a threshold you can plan around (§6)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const leashHand = {
  id: 'leash-hand',
  name: 'Leash Hand',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [34, 34],
  silhouette: 'leash-hand',
  palette: ['#4c4438', '#95886e', '#141109'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 0.85,
  lore: 'A long gloved hand emerges from the wall holding several supernatural leashes.',

  onSpawn(c) { fitRestraint(c, 'leash'); },

  onPlayerTurnStart(c) {
    if (mem(c).pulledId) {
      const who = board(c).find(a => a && a.alive && a.id === mem(c).pulledId);
      mem(c).pulledId = null;
      if (who) c.applyStatus(who, 'pulled-back', 1);
    }
  },

  moves: {
    'clip-on': {
      id: 'clip-on', name: 'Clip On', intent: Intent.DEFEND_BUFF, block: 5,
      applies: [{ id: 'tethered', stacks: 1, to: 'ally' }],
      tell: 'It clips a lead onto one of the others. The FIRST time they drop below half Courage it '
        + 'hauls them back: 9 Guard and a weaker next attack. Take one from half to nothing in a '
        + 'single turn and the lead never gets used.',
      effect(c) {
        c.block(c.self, 5);
        const friend = allies(c).find(a => isAlive(a) && !c.has('tethered', a) && a.role !== 'object');
        if (friend) { c.applyStatus(friend, 'tethered', 1); c.say(`${friend.name} is on a lead.`, 'warn'); }
      },
    },
    'leash-snap': {
      id: 'leash-snap', name: 'Leash Snap', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'The lead comes round like a whip.',
      effect(c) { hitPlayer(c, 8); },
    },
    'pull-back': {
      id: 'pull-back', name: 'Pull Back', intent: Intent.DEFEND, block: 8,
      tell: 'If anything it is holding is hurt, it hauls them out of reach.',
      effect(c) {
        const hurt = allies(c).find(a => isAlive(a) && c.has('tethered', a) && hpFrac(a) < 0.5);
        if (!hurt) { c.block(c.self, 8); return; }
        c.block(hurt, 9);
        /* The Guard lands now; the -3 is MARKED and handed over at the start of
           the player's turn — see the note on `pulled-back`. */
        mem(c).pulledId = hurt.id;
        c.removeStatus(hurt, 'tethered');
        c.say(`${hurt.name} is dragged back out of it.`, 'warn');
      },
    },
  },

  nextMove: (c) => cyc(['clip-on', 'leash-snap', 'pull-back', 'leash-snap'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) h.notes.push('Haunt 6: Pull Back also heals its target 5 Courage.');
    return h;
  },
};

/* No House Rule card either: Tethered says what it does on the chip it puts on
   its target, and the tell below says the rest. */

/* ═════════════════════════════════════════════════════════════════════════════
 * 4. Feeding Cart — you may want to leave it alive (§7)
 * ═══════════════════════════════════════════════════════════════════════════ */
const MEALS = [
  { id: 'hearty', name: 'Hearty Meal', note: 'recovers 8 Courage' },
  { id: 'treat', name: 'Energy Treat', note: 'gives its next attack 4 more damage' },
  { id: 'calming', name: 'Calming Snack', note: 'gives 11 Guard' },
];

export const feedingCart = {
  id: 'feeding-cart',
  name: 'Feeding Cart',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [33, 33],
  silhouette: 'cart',
  palette: ['#8a8f7d', '#c8ccbb', '#1d1f19'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.7,
  lore: 'A rolling cart of bowls, treats, medicine, water bottles, towels and labelled food tins. It is one of the least threatening things in the house. It still will not stop.',

  onSpawn(c) { setCnt(c, 'meal', 0); mem(c).hpAtStart = c.self.hp; announceCart(c); },

  /**
   * §7's Spill: "If Feeding Cart takes at least 12 damage during one player
   * turn, the Meal spills." Settled at the START of the next turn, not the end
   * of this one, so it cannot move a number the player has already been shown —
   * the Bathhouse's `settleLedger` note has the long version.
   */
  onPlayerTurnStart(c) {
    const before = mem(c).hpAtStart;
    const lost = (before ?? c.self.hp) - c.self.hp;
    mem(c).hpAtStart = c.self.hp;
    if (before != null && lost >= flag(c, 'spillAt', 12) && mem(c).hasMeal) {
      mem(c).hasMeal = 0;
      mem(c).treatFor = null;
      c.block(c.player, 4, { source: null });
      c.say('The meal goes over the side. There is something in it you can use.', 'good');
    }
    /* The Energy Treat is handed over HERE, before intents are drawn, so the
       +4 is inside the number the player reads. */
    if (mem(c).treatFor) {
      const who = board(c).find(a => a && a.alive && a.id === mem(c).treatFor);
      mem(c).treatFor = null;
      if (who) c.applyStatus(who, 'energy-treat', 1);
    }
    announceCart(c);
  },

  moves: {
    'deliver-meal': {
      id: 'deliver-meal', name: 'Deliver Meal', intent: Intent.BUFF,
      tell: 'It rolls up to whoever it thinks needs it most.',
      effect(c) {
        if (!mem(c).hasMeal) { c.block(c.self, 5); announceCart(c); return; }
        const meal = MEALS[cnt(c, 'meal')];
        const hurt = allies(c).filter(a => isAlive(a) && a.role !== 'object' && a.role !== 'ward')
          .sort((a, b) => hpFrac(a) - hpFrac(b))[0];
        /* §7: "If no enemy needs the current Meal, Feeding Cart may give it to
           the Ward Animal instead. This reduces Fright by 1. THIS IS
           BENEFICIAL." The player may deliberately leave the Cart alive. */
        if (!hurt || hpFrac(hurt) > 0.9) {
          const animal = someAnimal(c);
          if (animal) {
            frighten(c, animal, -1);
            c.say(`It puts the bowl down where ${animal.name} can reach it.`, 'good');
            mem(c).hasMeal = 0;
            nextMeal(c);
            return;
          }
        }
        if (hurt) {
          if (meal.id === 'hearty') c.heal(hurt, 8);
          /* MARKED, not granted — see the note on `energy-treat`. Healing and
             Guard can land now because neither changes a promised number. */
          if (meal.id === 'treat') mem(c).treatFor = hurt.id;
          if (meal.id === 'calming') c.block(hurt, 11);
          c.say(`${hurt.name} gets the ${meal.name}.`, 'warn');
        }
        mem(c).hasMeal = 0;
        nextMeal(c);
      },
    },
    'cart-bump': {
      id: 'cart-bump', name: 'Cart Bump', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It bumps into you the way a trolley does.',
      effect(c) { hitPlayer(c, 6); },
    },
    restock: {
      id: 'restock', name: 'Restock', intent: Intent.DEFEND, block: 8,
      tell: 'It puts something new on the top shelf.',
      effect(c) { c.block(c.self, 8); if (!mem(c).hasMeal) nextMeal(c); },
    },
  },

  nextMove: (c) => (mem(c).hasMeal ? 'deliver-meal'
    : cyc(['cart-bump', 'restock'], (c.history || []).length)),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) {
      h.flags.spillAt = 16;
      h.notes.push('Haunt 7: it takes 16 damage in a turn to spill the meal, not 12.');
    }
    return h;
  },
};

function nextMeal(c) {
  setCnt(c, 'meal', (cnt(c, 'meal') + 1) % MEALS.length);
  mem(c).hasMeal = 1;
  announceCart(c);
}

function announceCart(c) {
  const meal = MEALS[cnt(c, 'meal')];
  const has = mem(c).hasMeal;
  c.announceRule({
    id: `cart:${c.self.id}`,
    name: has ? `ON THE CART: ${meal.name.toUpperCase()}` : 'The cart is empty',
    text: (has ? `Whoever is hurt worst gets it, and it ${meal.note}. ` : 'It will make another. ')
      + `Take ${flag(c, 'spillAt', 12)} damage off the CART in one turn and the meal spills — you get 4 Guard out of it. `
      + 'When nobody needs feeding it feeds the animal instead, and that is worth 1 Fright off. '
      + 'You may well want it alive.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 5. Ward Orderly — genuinely caring, for a system that should not exist (§8)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const wardOrderly = {
  id: 'ward-orderly',
  name: 'Ward Orderly',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [41, 41],
  silhouette: 'orderly',
  palette: ['#d9d2c4', '#8e8779', '#201d17'],
  shape: { body: 'tall-thin', limbs: 2, eyes: 0 },
  scale: 1.0,
  lore: 'A tall cloth and porcelain attendant moving quietly through the ward with clipboards and medical supplies. It never appears angry. It is following procedure.',

  onSpawn(c) { mem(c).hpAtStart = c.self.hp; announceOrderly(c); },

  /** §8: "If the Ward Orderly takes at least 14 damage during one player turn, any existing Stable effect immediately disappears." */
  onPlayerTurnStart(c) {
    const before = mem(c).hpAtStart;
    const lost = (before ?? c.self.hp) - c.self.hp;
    mem(c).hpAtStart = c.self.hp;
    if (before != null && lost >= flag(c, 'breakAt', 14)) {
      let broke = 0;
      for (const a of board(c)) if (a && a.alive && a.hasStatus && a.hasStatus('stable')) {
        c.removeStatus(a, 'stable'); broke++;
      }
      if (broke) c.say('The clipboard goes on the floor. Nobody is Stable any more.', 'good');
    }
    announceOrderly(c);
  },

  moves: {
    stabilize: {
      id: 'stabilize', name: 'Stabilize', intent: Intent.BUFF,
      applies: [{ id: 'stable', stacks: 1, to: 'ally' }],
      tell: 'It writes something down and somebody stops dying.',
      effect(c) {
        if (board(c).some(a => a && a.alive && a.hasStatus && a.hasStatus('stable'))) {
          c.block(c.self, 7);
          return;
        }
        const hurt = allies(c).filter(a => isAlive(a) && a.role !== 'object' && a.role !== 'ward'
          && hpFrac(a) < 0.5).sort((a, b) => hpFrac(a) - hpFrac(b))[0];
        if (hurt) { c.applyStatus(hurt, 'stable', 1); c.say(`${hurt.name} is Stable.`, 'warn'); }
        else c.block(c.self, 7);
        announceOrderly(c);
      },
    },
    'routine-check': {
      id: 'routine-check', name: 'Routine Check', intent: Intent.DEFEND_BUFF, block: 9,
      tell: 'It does the rounds. Everything gets looked at.',
      effect(c) {
        c.block(c.self, 9);
        const friend = allies(c).find(a => isAlive(a) && a.role !== 'object' && a.role !== 'ward');
        if (friend) c.block(friend, 6);
        /* §8: "Routine Check reduces a Ward Animal's Fright by 1. Not every
           support action in this region is bad." */
        const animal = someAnimal(c);
        if (animal) frighten(c, animal, -1);
      },
    },
    'orderly-push': {
      id: 'orderly-push', name: 'Orderly Push', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'It moves you out of the way of the trolley.',
      effect(c) { hitPlayer(c, 9); },
    },
  },

  nextMove: (c) => cyc(['stabilize', 'routine-check', 'orderly-push'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.breakAt = 18;
      h.notes.push('Haunt 8: it takes 18 damage in a turn to break Stable, not 14.');
    }
    return h;
  },
};

function announceOrderly(c) {
  const stable = board(c).find(a => a && a.alive && a.hasStatus && a.hasStatus('stable'));
  c.announceRule({
    id: `orderly:${c.self.id}`,
    name: stable ? `${stable.name.toUpperCase()} IS STABLE` : 'Doing the rounds',
    text: 'Anything it Stabilises survives the next blow that would finish it, at 1 Courage. '
      + `Take ${flag(c, 'breakAt', 14)} damage off the ORDERLY in one turn and that goes away. `
      + 'Its Routine Check calms the animal by 1 Fright, which is a real kindness inside a system that should not exist.',
  });
}

/* ═════════════════════════════════════════════════════════════════════════════
 * 6. Comfort Blanket — a sincere protector (§9)
 * ═══════════════════════════════════════════════════════════════════════════ */
export const comfortBlanket = {
  id: 'comfort-blanket',
  name: 'Comfort Blanket',
  region: REGION,
  tier: 'normal',
  role: 'protector',
  hp: [36, 36],
  silhouette: 'blanket',
  palette: ['#a98fa4', '#dcc9d6', '#231b21'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 0.75,
  lore: 'A thick blanket crawls around like a friendly ghost. Its corners behave like paws. It tries to tuck everyone in.',

  onSpawn(c) { mem(c).hpAtStart = c.self.hp; announceBlanket(c); },

  /** §9: "Dealing 12 or more Courage damage to it during one player turn also ends Cover." */
  onPlayerTurnStart(c) {
    const before = mem(c).hpAtStart;
    const lost = (before ?? c.self.hp) - c.self.hp;
    mem(c).hpAtStart = c.self.hp;
    if (before != null && lost >= flag(c, 'uncoverAt', 12)) untuck(c, 'The blanket slips off.');
    for (const a of board(c)) if (a) a._tuckedSpent = 0;
    announceBlanket(c);
  },

  /** §9: "Defeating Comfort Blanket ends Cover." */
  onDeath(c) { untuck(c, 'The blanket goes still.'); },

  moves: {
    'tuck-in': {
      id: 'tuck-in', name: 'Tuck In', intent: Intent.DEFEND_BUFF, block: 5,
      applies: [{ id: 'tucked', stacks: 1, to: 'ally' }],
      tell: 'It puts itself over somebody.',
      effect(c) {
        c.block(c.self, 5);
        untuck(c);
        const friend = allies(c).find(a => isAlive(a) && a.role !== 'object' && a.role !== 'ward');
        if (friend) {
          c.applyStatus(friend, 'tucked', 1);
          friend._tuckedSpent = 0;
          mem(c).tuckedId = friend.id;
          c.say(`${friend.name} is tucked in.`, 'warn');
        }
        announceBlanket(c);
      },
    },
    'blanket-flop': {
      id: 'blanket-flop', name: 'Blanket Flop', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'All of it, at once, gently.',
      effect(c) { hitPlayer(c, 7); },
    },
    'everything-is-fine': {
      id: 'everything-is-fine', name: 'Everything Is Fine', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'It says so with its whole body.',
      effect(c) {
        c.block(c.self, 8);
        const friend = allies(c).find(a => isAlive(a) && a.role !== 'object' && a.role !== 'ward');
        if (friend) c.block(friend, 5);
        const animal = someAnimal(c);
        if (animal) frighten(c, animal, -1);
      },
    },
  },

  nextMove: (c) => cyc(['tuck-in', 'blanket-flop', 'everything-is-fine'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 9) {
      h.flags.uncoverAt = 16;
      h.notes.push('Haunt 9: it takes 16 damage in a turn to pull the blanket off, not 12.');
    }
    return h;
  },
};

function untuck(c, line) {
  let any = 0;
  for (const a of board(c)) {
    if (a && a.hasStatus && a.hasStatus('tucked')) { c.removeStatus(a, 'tucked'); any = 1; }
  }
  mem(c).tuckedId = null;
  if (any && line) c.say(line, 'good');
}

function announceBlanket(c) {
  const who = board(c).find(a => a && a.alive && a.hasStatus && a.hasStatus('tucked'));
  c.announceRule({
    id: `blanket:${c.self.id}`,
    name: who ? `${who.name.toUpperCase()} IS TUCKED IN` : 'Looking for somebody to cover',
    text: 'The first 8 damage whoever it is covering would take each turn comes to the BLANKET instead — '
      + 'so hitting them is hitting it. '
      + `Take ${flag(c, 'uncoverAt', 12)} damage off the blanket in one turn and it comes off. `
      + 'It is not lying to anybody. It just cannot tell the difference between keeping you safe and not letting you go.',
  });
}

/* ══ exports ════════════════════════════════════════════════════════════════ */
export const KENNEL_ENEMIES = [
  walkingCage, collarKeeper, leashHand, feedingCart, wardOrderly, comfortBlanket,
  wardPup, wardCat, wardBird,
  cageLatch, wardCollar, wardLeash,
];
