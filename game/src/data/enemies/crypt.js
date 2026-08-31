/**
 * The Crypt and Ossuary — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/11-crypt.md §1–§12, §49–§50.
 *
 * "What gets left behind matters." Bones's region, and the one that opens by
 * telling you that killing a thing is not the same as being finished with it.
 *
 * ── REMAINS ARE REAL BODIES ─────────────────────────────────────────────────
 *
 * §2 gives Remains "Integrity: 8", says "the player can ATTACK Remains to
 * destroy them early", and that unattended ones "crumble and disappear" after
 * two enemy turns. All three of those need a targetable thing on the board with
 * its own Courage and its own clock — which is an actor, exactly as the
 * Lamplighter's Lamps and the Wardrobe's Doors are.
 *
 * They are `summonOnly`, so `tests/kitchens/check.py`'s rule holds: nothing may
 * write one into a formation by hand. The only way a Remains reaches a player
 * is the mechanic that is supposed to create it.
 *
 * §2 also states the question the whole region turns on and it is worth
 * keeping: "Do I spend damage cleaning up now, or gamble that the fight ends
 * before those pieces matter?" A Remains does nothing by itself. Everything it
 * costs you is what something ELSE does with it.
 *
 * ── AND NOT EVERY ENEMY LEAVES THEM ─────────────────────────────────────────
 *
 * §2, last line: "Not every Crypt enemy leaves Remains. That keeps the mechanic
 * from becoming tedious." The Tibia leaves one, the Ribcage Guard leaves two,
 * the Bone Heap throws them; the Skull Roller, the Urn Spirit and the Fetcher
 * leave nothing at all.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, board, cyc, hitPlayer, hauntBase, flag,
  isAlive, dmgTaken,
} from './_lib.js';

const REGION = 'crypt';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const CRYPT_STATUSES = [
  {
    /**
     * §6. The Ribcage Guard's Cage: "the first 10 Attack damage that enemy
     * would take EACH PLAYER TURN is redirected to Ribcage Guard. Any remaining
     * damage hits the original target normally."
     *
     * Two hooks, split the way the Velvet Curtain's is and for the same reason:
     * `modifyDamageTaken` runs inside the damage pipeline, so dealing the
     * redirected hit from there is re-entrant damage inside a reduce and does
     * nothing at all. The reduction happens there and banks what it took;
     * `onAttacked` fires after the hit resolves and is where the Guard pays.
     */
    id: 'caged', name: 'Caged', kind: 'buff', icon: 'caged',
    desc: 'The first {n} Attack damage aimed at it each turn goes to the Ribcage Guard instead.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDamageTaken: (amt, h) => {
        if (h.card?.type !== 'attack' || amt <= 0) return amt;
        const o = h.owner || {};
        const allow = Math.max(0, (o._cageAllow ?? 10) - (o._cageUsed || 0));
        if (!allow) return amt;
        const moved = Math.min(allow, amt);
        o._cageUsed = (o._cageUsed || 0) + moved;
        o._cageOwed = (o._cageOwed || 0) + moved;
        return amt - moved;
      },
      onAttacked: (h) => {
        const o = h.owner;
        const owed = o && o._cageOwed;
        if (!owed) return;
        o._cageOwed = 0;
        const guard = o._cager && o._cager.alive
          ? o._cager
          : (h.e && h.e.enemies ? h.e.enemies.find(x => x.defId === 'ribcage-guard' && x.alive) : null);
        if (guard && h.e && h.e.dealDamage) {
          h.e.dealDamage({ attacker: null, defender: guard, amount: owed, kind: 'hazard', cause: 'cage' });
        }
      },
    },
  },
  {
    /**
     * §4. The Skull Roller rolls somewhere inconvenient. "While Misplaced it
     * CANNOT BE TARGETED and it does not act during its next turn."
     *
     * The untargetability is the Roller's own `isTargetable(c)` — the EnemyDef
     * seam that was dead until the Heart needed it — because §4 means all
     * targeting, not just Attack Tricks, and `untargetableBy` is per card type.
     * This status exists so the player can see the word and read the rule.
     */
    id: 'misplaced', name: 'Misplaced', kind: 'buff', icon: 'misplaced',
    desc: 'It has rolled somewhere you cannot reach. It cannot be targeted, and it misses a turn getting back.',
    decay: 'never', stacks: false, max: 1,
  },
];

/* ══ Remains ════════════════════════════════════════════════════════════════ */

/**
 * §2's Remains. Integrity 8, targetable, and gone after two enemy turns unless
 * something retrieves it first.
 *
 * It never acts — `Intent.SLEEP`, the same as the Wardrobe's Doors and the
 * Lamplighter's Lamps — so the whole body is a target and a clock.
 */
export const remains = {
  id: 'remains',
  name: 'Remains',
  region: REGION,
  tier: 'normal',
  role: 'object',
  summonOnly: true,
  hp: [8, 8],
  silhouette: 'remains',
  palette: ['#d8d2c2', '#9a9382', '#2a2620'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.4,
  lore: 'A few pieces of something, left where it fell.',

  onSpawn(c) { setCnt(c, 'crumble', flag(c, 'linger', 2)); },

  /** The clock only ticks on the enemy turn, which is what §2 counts. */
  onTurnEnd(c) {
    addCnt(c, 'crumble', -1, 9, 0);
    if (cnt(c, 'crumble') <= 0) c.despawn(c.self);
  },

  moves: {
    lie: {
      id: 'lie', name: 'Lying There', intent: Intent.SLEEP,
      tell: 'Bones. Something in this room wants them.',
      effect() {},
    },
  },
  nextMove: () => 'lie',
  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 3) {
      h.flags.linger = 3;
      h.notes.push('Haunt 3: Remains lie there for three enemy turns instead of two.');
    }
    return h;
  },
};

/** Every Remains still on the board. `defId`, never `id` — CONTRACTS. */
export function remainsOn(c) {
  return board(c).filter(a => a.defId === 'remains' && isAlive(a));
}

/**
 * Leave Remains. Capped, because a board can only hold so many bodies and §2
 * wants a decision rather than a crowd.
 */
export function leaveRemains(c, n = 1) {
  const made = [];
  for (let i = 0; i < n; i++) {
    if (remainsOn(c).length + made.length >= 4) break;
    const r = c.summon('remains');
    if (r) made.push(r);
  }
  if (made.length) {
    /* §14: "Whenever any Remains object is created, the Walking Ossuary gains 1
       Collection. THIS HAPPENS EVEN IF THE REMAINS IS IMMEDIATELY DESTROYED
       AFTERWARD." So the count is announced on creation, from here, where every
       creation in the region goes through. */
    for (const a of board(c)) {
      if (a.defId === 'walking-ossuary' && isAlive(a)) {
        a.counters = a.counters || {};
        a.counters.collection = Math.min(8, (a.counters.collection || 0) + made.length);
      }
    }
  }
  return made;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Loose Tibia — a defeated thing leaves something behind (§3)
// ═════════════════════════════════════════════════════════════════════════════
export const looseTibia = {
  id: 'loose-tibia',
  name: 'Loose Tibia',
  region: REGION,
  tier: 'normal',
  role: 'opener',
  hp: [23, 23],
  silhouette: 'tibia',
  palette: ['#e4ddca', '#a89c7e', '#2b2620'],
  shape: { body: 'tall-thin', limbs: 1, eyes: 0 },
  scale: 0.45,
  lore: 'One leg bone, hopping at you with a determination nothing that shape should have.',

  /** §3: "When Loose Tibia is defeated, leave 1 Remains." */
  onDeath(c) { leaveRemains(c, 1); },

  moves: {
    'shin-kick': {
      id: 'shin-kick', name: 'Shin Kick', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + cnt(c, 'runup'),
      tell: 'It gets you in exactly the worst place.',
      effect(c) { const d = 6 + cnt(c, 'runup'); setCnt(c, 'runup', 0); hitPlayer(c, d); },
    },
    'hop-back': {
      id: 'hop-back', name: 'Hop Back', intent: Intent.DEFEND, block: 7,
      tell: 'It hops out of reach, which for a tibia is quite far.',
      effect(c) { c.block(c.self, 7); },
    },
    'running-start': {
      id: 'running-start', name: 'Running Start', intent: Intent.DEFEND_BUFF, block: 4,
      tell: 'It backs up a long way to get a run at you.',
      effect(c) { c.block(c.self, 4); setCnt(c, 'runup', 5); },
    },
  },

  nextMove: (c) => cyc(['shin-kick', 'running-start', 'shin-kick', 'hop-back'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) h.notes.push('Haunt 3: the Remains it leaves lie there a turn longer.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Skull Roller — it does not resurrect, it leaves and comes back (§4)
// ═════════════════════════════════════════════════════════════════════════════
export const skullRoller = {
  id: 'skull-roller',
  name: 'Skull Roller',
  region: REGION,
  tier: 'normal',
  role: 'harasser',
  hp: [28, 28],
  silhouette: 'skull',
  palette: ['#eae2cc', '#9d9276', '#26221b'],
  shape: { body: 'squat', limbs: 0, eyes: 2 },
  scale: 0.5,
  lore: 'A skull that bites ankles and then rolls somewhere annoying to think about it.',

  onSpawn(c) { mem(c).gone = 0; },

  /**
   * §4's untargetability. `EnemyDef.isTargetable` is the seam for a whole-body
   * rule that is not about card types, and it is checked before the engine even
   * looks at what is being aimed. Pure, and it must be: the engine calls it on
   * every repaint.
   */
  isTargetable(c) { return !mem(c).gone; },

  moves: {
    'chomp-and-roll': {
      id: 'chomp-and-roll', name: 'Chomp and Roll', intent: Intent.ATTACK, damage: 8, hits: 1,
      damageFn: (c) => 8 + cnt(c, 'rattled'),
      applies: [{ id: 'misplaced', stacks: 1, to: 'self' }],
      tell: 'It bites, and then it is somewhere else.',
      effect(c) {
        const d = 8 + cnt(c, 'rattled');
        setCnt(c, 'rattled', 0);
        hitPlayer(c, d);
        mem(c).gone = 2;                 // this turn's roll plus the skipped one
        c.applyStatus(c.self, 'misplaced', 1, { fresh: true });
      },
    },
    misplaced: {
      id: 'misplaced', name: 'Somewhere Else', intent: Intent.SLEEP,
      tell: 'It is under something. It will be back.',
      effect(c) {
        const m = mem(c);
        m.gone = Math.max(0, (m.gone || 0) - 1);
        if (m.gone) return;
        c.removeStatus(c.self, 'misplaced');
        c.block(c.self, flag(c, 'returnGuard', 5));
      },
    },
    headbutt: {
      id: 'headbutt', name: 'Headbutt', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It has no neck and does it anyway.',
      effect(c) { hitPlayer(c, 6); },
    },
    rattle: {
      id: 'rattle', name: 'Rattle', intent: Intent.DEFEND_BUFF, block: 8,
      tell: 'Something inside it is loose.',
      effect(c) { c.block(c.self, 8); setCnt(c, 'rattled', 3); },
    },
  },

  nextMove: (c) => {
    if (mem(c).gone) return 'misplaced';
    const beat = (c.history || []).filter(x => x !== 'misplaced').length;
    return cyc(['chomp-and-roll', 'headbutt', 'rattle'], beat);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.returnGuard = 8;
      h.notes.push('Haunt 4: it comes back with 8 Guard instead of 5.');
    }
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 3. Urn Spirit — kill order decides what it gets (§5)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Kill order changes what tools the Urn Spirit receives." (§5.)
 *
 * The Remembrance is stored as the dead enemy's DEF ID — a string — because
 * `mem` is JSON round-tripped for autosave and resume, so anything richer than
 * plain data would not survive a mid-fight save.
 */
const REMEMBRANCE = {
  'loose-tibia': 'its next attack deals 4 more',
  'skull-roller': 'it gains 7 Guard after its next attack',
  'ribcage-guard': 'it gains 10 Guard',
  'bone-heap': 'it recovers 6 Courage',
  'crypt-fetcher': 'it eats a Remains for 8 Guard',
};

export const urnSpirit = {
  id: 'urn-spirit',
  name: 'Urn Spirit',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [30, 30],
  silhouette: 'urn',
  palette: ['#b9c6c2', '#e7efe9', '#232c2a'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 0.7,
  lore: 'A cracked funerary urn with something patient inside it. Small shapes move in the ceramic like remembered things.',

  onSpawn(c) { mem(c).held = []; announceUrn(c); },

  /** §5: "The first time another enemy is defeated, capture a Remembrance." */
  onAllyDeath(c) {
    /* ONE argument. `_enemyLifecycle` merges its `extra` INTO the ctx, so the
       fallen actor is `c.dead` — a second parameter is `undefined` on every
       call, which is how the Foyer's House Bell lost its Resonance drop. */
    const id = c.dead && c.dead.defId;
    if (!id || !REMEMBRANCE[id]) return;
    const held = mem(c).held || (mem(c).held = []);
    if (held.length >= flag(c, 'maxHeld', 1)) return;
    held.push(id);
    announceUrn(c);
  },

  moves: {
    'release-memory': {
      id: 'release-memory', name: 'Release Memory', intent: Intent.BUFF,
      tell: 'Something it was keeping gets used.',
      effect(c) {
        const held = mem(c).held || [];
        const id = held.shift();
        if (!id) { c.block(c.self, 6); return; }
        if (id === 'loose-tibia') setCnt(c, 'remembered', 4);
        else if (id === 'skull-roller') mem(c).guardAfter = 7;
        else if (id === 'ribcage-guard') c.block(c.self, 10);
        else if (id === 'bone-heap') c.heal(c.self, 6);
        else if (id === 'crypt-fetcher') {
          const r = remainsOn(c)[0];
          if (r) { c.despawn(r); c.block(c.self, 8); } else c.block(c.self, 4);
        }
        announceUrn(c);
      },
    },
    'urn-shard': {
      id: 'urn-shard', name: 'Urn Shard', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => 7 + cnt(c, 'remembered'),
      tell: 'A piece of the ceramic comes off fast.',
      effect(c) {
        const d = 7 + cnt(c, 'remembered');
        setCnt(c, 'remembered', 0);
        hitPlayer(c, d);
        if (mem(c).guardAfter) { c.block(c.self, mem(c).guardAfter); mem(c).guardAfter = 0; }
      },
    },
    'seal-the-lid': {
      id: 'seal-the-lid', name: 'Seal the Lid', intent: Intent.DEFEND, block: 9,
      tell: 'It closes itself.',
      effect(c) { c.block(c.self, 9); },
    },
  },

  nextMove: (c) => {
    if ((mem(c).held || []).length) return 'release-memory';
    return cyc(['urn-shard', 'seal-the-lid'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) {
      h.flags.maxHeld = 2;
      h.notes.push('Haunt 5: it can hold two Remembrances. It still spends one at a time.');
    }
    return h;
  },
};

function announceUrn(c) {
  const held = mem(c).held || [];
  c.announceRule({
    id: `urn:${c.self.id}`,
    name: held.length ? `Remembering: ${held.length}` : 'Remembering: nothing yet',
    text: held.length
      ? `It kept something from what died: ${held.map(id => REMEMBRANCE[id]).join('; ')}.`
      : 'The first ally to fall leaves it something. WHICH one is up to you.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Ribcage Guard — killing it solves defence and creates material (§6)
// ═════════════════════════════════════════════════════════════════════════════
export const ribcageGuard = {
  id: 'ribcage-guard',
  name: 'Ribcage Guard',
  region: REGION,
  tier: 'normal',
  role: 'protector',
  hp: [38, 38],
  silhouette: 'ribcage',
  palette: ['#ded6c0', '#9b9078', '#282219'],
  shape: { body: 'sprawling', limbs: 8, eyes: 0 },
  scale: 1.0,
  lore: 'A rib cage getting around on its own ribs, looking for something to be around.',

  onSpawn(c) { mem(c).caging = null; },

  onPlayerTurnStart(c) {
    mem(c).broke = false;
    for (const a of allies(c)) { a._cageUsed = 0; a._cageAllow = flag(c, 'cage', 10); }
  },

  /** §6: "If Ribcage Guard loses at least 15 Courage during one player turn, the
      Cage breaks immediately." Resolved as the threshold is crossed. */
  onDamaged(c) {
    if (mem(c).broke || dmgTaken(c) < 15) return;
    mem(c).broke = true;
    uncage(c);
  },

  /** §6: "On defeat, Ribcage Guard leaves 2 Remains rather than 1." */
  onDeath(c) { uncage(c); leaveRemains(c, 2); },

  moves: {
    'cage-up': {
      id: 'cage-up', name: 'Cage Up', intent: Intent.DEFEND_BUFF, block: 5,
      applies: [{ id: 'caged', stacks: 1, to: 'allies' }],
      tell: 'It walks itself around somebody.',
      effect(c) {
        c.block(c.self, 5);
        uncage(c);
        /* §12: "Ribcage Guard cannot Cage another Ribcage Guard." Two of them
           trading redirects is a loop, not a defence. */
        const pool = allies(c).filter(a => isAlive(a) && a.defId !== 'ribcage-guard' && a.defId !== 'remains');
        if (!pool.length) { c.block(c.self, 6); return; }
        const pick = pool[c.rng.int(pool.length)];
        pick._cager = c.self;
        pick._cageUsed = 0;
        pick._cageAllow = flag(c, 'cage', 10);
        c.applyStatus(pick, 'caged', 1, { fresh: true });
        mem(c).caging = pick.defId;
        c.announceRule({
          id: `cage:${c.self.id}`,
          name: `Caged: ${pick.name}`,
          text: `The first ${flag(c, 'cage', 10)} Attack damage aimed at it each turn goes to the Guard instead. `
            + 'Anything past that still lands. Deal the Guard 15 in one turn and the cage comes apart.',
        });
      },
    },
    'rib-bash': {
      id: 'rib-bash', name: 'Rib Bash', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It leans its whole cage into you.',
      effect(c) { hitPlayer(c, 8); },
    },
    tighten: {
      id: 'tighten', name: 'Tighten', intent: Intent.DEFEND, block: 11,
      tell: 'The ribs draw in.',
      effect(c) {
        c.block(c.self, 11);
        const kept = allies(c).find(a => isAlive(a) && a._cager === c.self);
        if (kept) c.block(kept, 5);
      },
    },
  },

  nextMove: (c) => cyc(['cage-up', 'rib-bash', 'tighten'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) {
      h.flags.cage = 12;
      h.notes.push('Haunt 6: the Cage redirects 12 Attack damage instead of 10.');
    }
    return h;
  },
};

function uncage(c) {
  for (const a of allies(c)) {
    if (a._cager !== c.self) continue;
    a._cager = null;
    a._cageOwed = 0;
    c.removeStatus(a, 'caged');
  }
  mem(c).caging = null;
  c.clearRules(`cage:${c.self.id}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Bone Heap — kill the pile, or kill it twice (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Burst Bone Heap twice? Destroy the Bone Pile while it is helpless? Or ignore
 * the Pile and try to finish the entire encounter before it reassembles?" (§7.)
 *
 * The Bone Pile is a real body with 14 Integrity, so all three plans are things
 * the player can actually do with damage.
 */
export const bonePile = {
  id: 'bone-pile',
  name: 'Bone Pile',
  region: REGION,
  tier: 'normal',
  role: 'object',
  summonOnly: true,
  hp: [14, 14],
  silhouette: 'bonepile',
  palette: ['#d2c9b2', '#8f866e', '#231f18'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.55,
  lore: 'Everything the Bone Heap was, in a heap. It is still deciding.',

  onSpawn(c) { setCnt(c, 'rebuild', 2); },

  onTurnEnd(c) {
    addCnt(c, 'rebuild', -1, 9, 0);
    if (cnt(c, 'rebuild') > 0) return;
    /* §7: "If the Bone Pile still exists, Bone Heap returns with 20 Courage.
       Then destroy the Bone Pile." The Pile getting there first is the player's
       whole window. */
    const back = c.summon('bone-heap', { hp: flag(c, 'rebuildHp', 20) });
    if (back) (back.mem ||= {}).returned = true;
    c.despawn(c.self);
  },

  moves: {
    settle: {
      id: 'settle', name: 'Reassembling', intent: Intent.SLEEP,
      tell: 'It is putting itself back together. Break it now and it stays broken.',
      effect() {},
    },
  },
  nextMove: () => 'settle',
  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 7) { h.flags.rebuildHp = 24; h.notes.push('Haunt 7: it comes back at 24 Courage.'); }
    return h;
  },
};

export const boneHeap = {
  id: 'bone-heap',
  name: 'Bone Heap',
  region: REGION,
  tier: 'normal',
  role: 'rebuilder',
  hp: [41, 41],
  silhouette: 'boneheap',
  palette: ['#dfd6bd', '#968b70', '#241f17'],
  shape: { body: 'sprawling', limbs: 4, eyes: 0 },
  scale: 1.0,
  lore: 'A pile of bones pulling itself into a slightly different animal every few seconds. None of them are right.',

  /**
   * §7's Collapse. "The FIRST time Bone Heap reaches 0 Courage, it becomes
   * Collapsed instead of being defeated." A Heap that has already come back
   * once dies properly.
   */
  onDeath(c) {
    if (mem(c).returned) return;
    c.summon('bone-pile');
  },

  moves: {
    'bone-swing': {
      id: 'bone-swing', name: 'Bone Swing', intent: Intent.ATTACK, damage: 9, hits: 1,
      damageFn: (c) => 9 + cnt(c, 'rearranged'),
      tell: 'It swings whichever limb is currently longest.',
      effect(c) {
        const d = 9 + cnt(c, 'rearranged');
        setCnt(c, 'rearranged', 0);
        hitPlayer(c, d);
      },
    },
    rearrange: {
      id: 'rearrange', name: 'Rearrange', intent: Intent.DEFEND_BUFF, block: 10,
      tell: 'It tries being a different shape.',
      effect(c) { c.block(c.self, 10); setCnt(c, 'rearranged', 4); },
    },
    'throw-a-piece': {
      id: 'throw-a-piece', name: 'Throw a Piece', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It takes something off itself and throws it.',
      effect(c) {
        hitPlayer(c, 6);
        leaveRemains(c, 1);
        c.loseHp(c.self, 3);
      },
    },
  },

  nextMove: (c) => cyc(['bone-swing', 'rearrange', 'bone-swing', 'throw-a-piece'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) h.notes.push('Haunt 7: it reassembles at 24 Courage instead of 20.');
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 6. Crypt Fetcher — it thinks this is an excellent game (§8)
// ═════════════════════════════════════════════════════════════════════════════
const RESTORABLE = new Set(['loose-tibia', 'skull-roller', 'urn-spirit', 'ribcage-guard', 'bone-heap']);

export const cryptFetcher = {
  id: 'crypt-fetcher',
  name: 'Crypt Fetcher',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [34, 34],
  silhouette: 'fetcher',
  palette: ['#cfc5ab', '#8d8368', '#211d16'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 0.75,
  lore: 'Something dog-shaped with too many jaws, bringing bones back to people who did not ask.',

  onSpawn(c) { setCnt(c, 'bones', 0); mem(c).restored = []; replan(c); announceFetcher(c); },

  /**
   * §8's behaviour is CONDITIONAL — "if Remains exist and fewer than 2 Fetched
   * Bones, Fetch" — and the conditions are things the player changes mid-turn.
   * Sampled live, that made the intent a lie: killing a Ribcage Guard with the
   * last card of a turn drops two Remains, re-derives the plan AFTER the intent
   * was committed, and turned a promised 10-damage Gnaw into a Fetch that dealt
   * nothing. The audit caught it once in 12,489 turns.
   *
   * So the choice is settled HERE, at player-turn start, before the intent is
   * drawn — and cleaning up the floor pays off on the Fetcher's NEXT turn
   * instead of retroactively editing this one. Which is also what §2 is about.
   */
  onPlayerTurnStart(c) { replan(c); },

  /** §8: "Each Fetched Bone grants 2 Guard at the beginning of its turn." */
  onTurnStart(c) { if (cnt(c, 'bones')) c.block(c.self, 2 * cnt(c, 'bones')); },

  /** It remembers what died so it knows what to bring back. */
  onAllyDeath(c) {
    const id = c.dead && c.dead.defId;
    if (!id || !RESTORABLE.has(id)) return;
    (mem(c).fallen ||= []).push(id);
  },

  moves: {
    fetch: {
      id: 'fetch', name: 'Fetch!', intent: Intent.BUFF,
      tell: 'It has spotted something on the floor.',
      effect(c) {
        const r = remainsOn(c)[0];
        if (!r) { c.block(c.self, 5); return; }
        c.despawn(r);
        addCnt(c, 'bones', 1, 3);
        announceFetcher(c);
      },
    },
    gnaw: {
      id: 'gnaw', name: 'Gnaw', intent: Intent.ATTACK, damage: 6, hits: 1,
      damageFn: (c) => 6 + 2 * cnt(c, 'bones'),
      tell: 'It is chewing on something and looking at you.',
      effect(c) { hitPlayer(c, 6 + 2 * cnt(c, 'bones')); },
    },
    'bring-it-back': {
      id: 'bring-it-back', name: 'Bring It Back', intent: Intent.SUMMON,
      tell: 'It is very pleased with itself.',
      effect(c) {
        const fallen = mem(c).fallen || [];
        const done = mem(c).restored || (mem(c).restored = []);
        /* §12: "Crypt Fetcher cannot restore the same enemy more than once per
           combat at baseline difficulty." */
        const idx = fallen.findIndex(id => !done.includes(id));
        if (idx < 0) { c.block(c.self, 7); return; }
        const id = fallen.splice(idx, 1)[0];
        const cost = flag(c, 'cheapFetch', false) ? 1 : 2;
        if (cnt(c, 'bones') < cost) { c.block(c.self, 7); return; }
        addCnt(c, 'bones', -cost, 3, 0);
        if (flag(c, 'cheapFetch', false)) {
          const r = remainsOn(c)[0];
          if (r) c.despawn(r);
        }
        const back = c.summon(id, { hpMul: 0.35 });
        if (back) { done.push(id); (back.mem ||= {}).returned = true; }
        announceFetcher(c);
      },
    },
    'good-dog': {
      id: 'good-dog', name: 'Good Dog', intent: Intent.DEFEND, block: 7,
      tell: 'It digs, briefly, in the floor of a crypt.',
      effect(c) {
        c.block(c.self, 7);
        if (!remainsOn(c).length) leaveRemains(c, 1);
      },
    },
  },

  /** §8's stated behaviour, read off the plan `replan` settled at turn start. */
  nextMove: (c) => {
    const want = mem(c).plan;
    if (want === 'fetch' || want === 'bring-it-back') return want;
    return cyc(['gnaw', 'good-dog'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) {
      h.flags.cheapFetch = true;
      h.notes.push('Haunt 8: Bring It Back costs 1 Fetched Bone plus a Remains, and eats both.');
    }
    return h;
  },
};

/** Settle what the Fetcher will do, once, at the start of the player's turn. */
function replan(c) {
  const cost = flag(c, 'cheapFetch', false) ? 1 : 2;
  const fallen = mem(c).fallen || [];
  const done = mem(c).restored || [];
  if (remainsOn(c).length && cnt(c, 'bones') < 2) { mem(c).plan = 'fetch'; return; }
  if (cnt(c, 'bones') >= cost && fallen.some(id => !done.includes(id))) {
    mem(c).plan = 'bring-it-back';
    return;
  }
  mem(c).plan = null;
}

function announceFetcher(c) {
  c.announceRule({
    id: `fetch:${c.self.id}`,
    name: `Fetched Bones ${cnt(c, 'bones')} / 3`,
    text: 'Each one is 2 Guard at the start of its turn and 2 more on Gnaw. '
      + 'At 2 it can bring a defeated friend back at a third of their Courage. '
      + 'The Remains on the floor are what it is spending — clear them, or do not.',
  });
}

export const CRYPT_ENEMIES = [
  looseTibia, skullRoller, urnSpirit, ribcageGuard, boneHeap, cryptFetcher,
  remains, bonePile,
];
export const CRYPT_REGION = REGION;
