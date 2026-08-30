/**
 * The Impossible Greenhouse — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/05-greenhouse.md §1–§15.
 *
 * Region thesis: "Small problems become large problems if allowed to take
 * root." This is the first region where the player is not fighting individual
 * creatures but an ECOSYSTEM — a Seedling that is harmless now, a Spore Cloud
 * that lands in two turns, an Ivy that makes something else harder to remove.
 *
 * ── GROWTH IS A LANGUAGE, NOT A BUFF ────────────────────────────────────────
 *
 * §2 is explicit: Growth is not one universal status with identical effects.
 * Each creature explains what growing does for IT — a Potling matures a
 * Seedling, a Blossom opens wider, the Ancient Topiary banks permanent damage.
 * The region teaches one sentence, "if something is growing, pay attention to
 * what happens when it matures", and Brambleboo's whole Trick pool is built on
 * the same idea. So nothing here shares a `growth` status: each enemy's is its
 * own displayed counter, read by its own `damageFn`.
 *
 * ── WHAT THAT MEANS FOR THE CODE ────────────────────────────────────────────
 *
 * Two mechanics outlive the enemy that made them, and both had to be built that
 * way rather than hung off their creator:
 *
 *   Seedlings   are real actors, so a Potling's children mature whether or not
 *               the Potling is still standing.
 *   Spore Clouds are engine TIMERS (`c.schedule`), because §6 says in bold that
 *               killing Spore Puff does not erase what it already scheduled.
 *               They fire at `playerTurnStart`, outside the enemy phase — a hit
 *               that lands inside the enemy phase is damage no intent promised,
 *               and a labelled countdown in front of the player is its own
 *               promise, made two turns early.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, countMoves, played, playedOfType,
  hitPlayer, hauntBase, flag, isAlive, dmgTaken,
} from './_lib.js';

const REGION = 'greenhouse';

/* ══ the region's own statuses ═══════════════════════════════════════════════ */
export const GREENHOUSE_STATUSES = [
  {
    /**
     * §4. Deliberately NOT a draw penalty on the normal turn draw: it eats the
     * next EXTRA card, so a deck that never draws beyond its opening hand pays
     * nothing and a draw engine pays exactly once. `modifyDraw` carries the
     * reason, which is what makes that distinction expressible at all.
     */
    id: 'pollen', name: 'Pollen', kind: 'debuff', icon: 'pollen',
    desc: 'The next time you draw Tricks beyond your normal turn draw, draw 1 fewer. Then the Pollen settles.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      modifyDraw: (n, h) => {
        if (h.reason === 'turnStart' || n <= 0) return n;
        h.remove();
        return Math.max(0, n - 1);
      },
    },
  },
  {
    /**
     * §5, on the HOST. The Ivy's half — taking 50% of what the host takes —
     * cannot live here, because a status hook cannot reach another actor. The
     * Ivy books it in its own `onPlayerTurnEnd`, the way Blanket Blob settles
     * Cover and the Sanctuary Warden settles its redirect.
     */
    id: 'entwined', name: 'Entwined', kind: 'buff', icon: 'vine',
    desc: 'Wrapped in Creeping Ivy: 5 Guard at the start of its turn, and 2 more attack damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: {
      onTurnStart: (ctx) => ctx.block(ctx.actor, 5),
      modifyDamageDealt: (amt) => amt + 2,
    },
  },
  {
    id: 'exposed-sap', name: 'Exposed Sap', kind: 'debuff', icon: 'sap',
    desc: 'Its glass is broken. It takes 20% more damage until the start of its next turn.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.2) },
  },
  {
    /**
     * §18. The Binding Vine names ONE Trick in hand and charges a Nerve for it,
     * and §18 says "The marked Trick is shown immediately" — so it is a status
     * on the player carrying the uid, and the surcharge is a pure
     * `modifyCardCost` that reads it. Pure because the engine re-runs cost on
     * every repaint.
     */
    id: 'bound-trick', name: 'Bound', kind: 'debuff', icon: 'vine-tight',
    desc: 'One Trick in your hand costs 1 additional Nerve this turn.',
    decay: 'turnEnd', stacks: false, max: 1,
    hooks: {
      modifyCardCost: (cost, h) => {
        const uid = h.owner && h.owner._boundUid;
        return (uid && h.card && h.card.uid === uid) ? cost + 1 : cost;
      },
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// 1. Potling — the propagation lesson (§3)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The Seedling is harmless now. It will not remain harmless." (§3.)
 *
 * The Seedling is a REAL ACTOR rather than a counter on the Potling, because
 * the player has to be able to choose to spend a card on it — and because a
 * Potling killed on turn two must not take its children with it. That is the
 * whole lesson of the region's first enemy.
 */
export const potling = {
  id: 'potling',
  name: 'Potling',
  region: REGION,
  tier: 'normal',
  role: 'propagator',
  hp: [23, 23],
  silhouette: 'flowerpot',
  palette: ['#b4713f', '#e0a874', '#4a2c17'],
  shape: { body: 'squat', limbs: 2, eyes: 2 },
  scale: 0.7,
  lore: 'A ceramic flowerpot walking on little root legs, with one very nervous seedling sticking out of the top.',

  moves: {
    'plant-seed': {
      id: 'plant-seed', name: 'Plant Seed', intent: Intent.SUMMON,
      tell: 'It leans over and presses something into the soil.',
      effect(c) {
        const mine = seedlingsOf(c);
        if (mine.length >= 2) { c.block(c.self, 5); return; }
        const s = c.summon('seedling', { hp: 6 });
        if (s) { (s.mem ||= {}).parent = c.self.id; (s.mem).timer = 3; }
      },
    },
    'pot-bash': {
      id: 'pot-bash', name: 'Pot Bash', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'It hops once and lands rim-first.',
      effect(c) { hitPlayer(c, 6); },
    },
    'water-itself': {
      id: 'water-itself', name: 'Water Itself', intent: Intent.DEFEND, block: 6,
      tell: 'It tips a little water over its own head, and over anything nearby.',
      effect(c) {
        c.block(c.self, 6);
        const s = seedlingsOf(c)[0];
        if (s) (s.mem ||= {}).timer = Math.max(1, ((s.mem.timer ?? 3) - 1));
      },
    },
  },

  nextMove: (c) => cyc(['plant-seed', 'pot-bash', 'water-itself', 'pot-bash'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 4) {
      h.flags.seedCap = 3;
      h.notes.push('Haunt 4: it can keep three Seedlings rather than two.');
    }
    return h;
  },
};
function seedlingsOf(c) {
  return allies(c).filter(a => isAlive(a) && a.defId === 'seedling' && a.mem?.parent === c.self.id);
}

/** What a Potling plants. Never rolled into a formation. */
export const seedling = {
  id: 'seedling',
  name: 'Seedling',
  region: REGION,
  tier: 'normal',
  role: 'spawn',
  hp: [6, 6],
  silhouette: 'sprout',
  palette: ['#8fbf6a', '#c7e3a8', '#3a5527'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 0.35,
  summonOnly: true,
  remnant: true,
  lore: 'Two leaves and a stem, no higher than a boot. It is watching you with no eyes at all.',

  /**
   * It does not attack. Its whole threat is the number counting down over its
   * head, and `nextMove` reads the clock rather than counting its own calls —
   * the engine may call it repeatedly to re-render an intent.
   */
  onTurnEnd(c) {
    const m = mem(c);
    m.timer = Math.max(0, (m.timer ?? 3) - 1);
    setCnt(c, 'sprouting', m.timer);
    if (m.timer > 0) return;
    c.say('The Seedling stands up.', 'warn');
    c.summon('potling', { hp: 14 });
    c.despawn(c.self);
  },

  onSpawn(c) { setCnt(c, 'sprouting', mem(c).timer ?? 3); },

  moves: {
    grow: {
      id: 'grow', name: 'Grow', intent: Intent.SLEEP,
      tell: 'It gets taller. That is all it does, and it is enough.',
      effect() { /* the growing happens in onTurnEnd, where the clock lives */ },
    },
  },
  nextMove: () => 'grow',
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. Snapping Blossom — the telegraph (§4)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Three Bloom stages, and the whole enemy is the number you can see coming.
 * `damageFn` reads the stage so Snap's intent says 7 or 17 truthfully, and §4's
 * interrupt — 14 Courage off it in one player turn while Full Bloom — drops it
 * back to Opening and defuses the swing to 10. That check runs in
 * `onPlayerTurnEnd`, before the enemy phase, so the intent the player already
 * read is the one that resolves.
 */
const BLOOM = ['closed', 'opening', 'full'];
export const snappingBlossom = {
  id: 'snapping-blossom',
  name: 'Snapping Blossom',
  region: REGION,
  tier: 'normal',
  role: 'telegraph',
  hp: [37, 37],
  silhouette: 'blossom',
  palette: ['#d4477e', '#f2a3c2', '#4a1b2c'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 1.0,
  lore: 'A flower the size of a wheelbarrow, with a full set of teeth around the inside of every petal.',

  onSpawn(c) { setCnt(c, 'bloom', 0); },

  onTurnStart(c) { if (cnt(c, 'bloom') === 0) c.block(c.self, 4); },

  onPlayerTurnEnd(c) {
    if (cnt(c, 'bloom') < 2) return;
    if (dmgTaken(c) < 14) return;
    setCnt(c, 'bloom', 1);
    mem(c).pruned = true;
    c.say('The Blossom closes back down.', 'good');
  },

  moves: {
    unfurl: {
      id: 'unfurl', name: 'Unfurl', intent: Intent.DEFEND_BUFF, block: 5,
      tell: 'It opens another few inches, and the teeth catch the light.',
      effect(c) { addCnt(c, 'bloom', 1, 2); c.block(c.self, 5); },
    },
    snap: {
      id: 'snap', name: 'Snap', intent: Intent.ATTACK, damage: 7, hits: 1,
      damageFn: (c) => (cnt(c, 'bloom') >= 2 ? 17 : (mem(c).pruned ? 10 : 7)),
      tell: 'It shuts.',
      effect(c) {
        hitPlayer(c, cnt(c, 'bloom') >= 2 ? 17 : (mem(c).pruned ? 10 : 7));
        mem(c).pruned = false;
        setCnt(c, 'bloom', 0);
      },
    },
    'pollen-shake': {
      id: 'pollen-shake', name: 'Pollen Shake', intent: Intent.ATTACK_DEBUFF, damage: 4, hits: 1,
      applies: [{ id: 'pollen', stacks: 1, to: 'player' }],
      tell: 'It shakes itself, and the air turns yellow.',
      effect(c) { hitPlayer(c, 4); c.applyStatus(c.player, 'pollen', 1); },
    },
  },

  nextMove: (c) => cyc(['unfurl', 'pollen-shake', 'unfurl', 'snap'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) h.notes.push('Haunt 5: the interrupt needs 18 Courage in one turn, not 14.');
    if (level >= 5) h.flags.pruneAt = 18;
    return h;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// 3. Creeping Ivy — attachment (§5)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Some support enemies become harder to remove after attaching themselves, but
 * attacking the host can solve both problems at once." (§5.)
 *
 * The Ivy takes half of what its host takes, booked at the end of the player
 * turn rather than per hit, for the same reason Cover and Sanctuary are: a
 * status hook cannot reach another actor. Twelve points through the host and
 * the vine lets go.
 */
export const creepingIvy = {
  id: 'creeping-ivy',
  name: 'Creeping Ivy',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [29, 29],
  silhouette: 'ivy',
  palette: ['#4f8f45', '#8ccf78', '#22381f'],
  shape: { body: 'sprawling', limbs: 0, eyes: 0 },
  scale: 0.8,
  lore: 'A bundle of vines that moves like it is looking for something to hold on to, and finds one.',

  onPlayerTurnEnd(c) {
    const host = hostOf(c);
    if (!host) return;
    const share = Math.floor(dmgTaken(c, host) / 2);
    if (share <= 0) return;
    c.loseHp(c.self, share);
    addCnt(c, 'strain', share, 99);
    if (cnt(c, 'strain') >= 12) {
      c.removeStatus(host, 'entwined');
      mem(c).hostId = null;
      setCnt(c, 'strain', 0);
      c.say('The Ivy lets go.', 'good');
    }
  },

  onAllyDeath(c) { if (c.deadId && mem(c).hostId === c.deadId) { mem(c).hostId = null; setCnt(c, 'strain', 0); } },

  moves: {
    creep: {
      id: 'creep', name: 'Creep', intent: Intent.BUFF,
      applies: [{ id: 'entwined', stacks: 1, to: 'ally' }],
      tell: 'It reaches across the floor towards whatever is nearest.',
      effect(c) {
        const target = pickHost(c);
        if (!target) { c.block(c.self, 6); return; }
        mem(c).hostId = target.id;
        setCnt(c, 'strain', 0);
        c.applyStatus(target, 'entwined', 1);
        c.say(`The Ivy wraps around ${target.name}.`, 'warn');
      },
    },
    'vine-lash': {
      id: 'vine-lash', name: 'Vine Lash', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'A single vine comes up off the floor like a whip.',
      effect(c) { hitPlayer(c, 7); },
    },
    'take-root': {
      id: 'take-root', name: 'Take Root', intent: Intent.DEFEND, block: 9,
      tell: 'It works its way into a crack in the flagstones.',
      effect(c) { c.block(c.self, 9); },
    },
  },

  /**
   * "While Entwined, Creeping Ivy cannot use its normal attacks." (§5.) It has
   * no move of its own while attached, so it holds — and the intent says so
   * rather than leaving a blank.
   */
  nextMove: (c) => {
    if (hostOf(c)) return 'take-root';
    if (pickHost(c)) return 'creep';
    return cyc(['vine-lash', 'take-root'], countMoves(c, ['vine-lash', 'take-root']));
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 6) h.notes.push('Haunt 6: Entwine takes 16 damage through the host to break, not 12.');
    if (level >= 6) h.flags.breakAt = 16;
    return h;
  },
};
function hostOf(c) {
  const id = mem(c).hostId;
  return id ? (allies(c).find(a => isAlive(a) && a.id === id) || null) : null;
}
function pickHost(c) {
  const pool = allies(c).filter(a => isAlive(a) && a.defId !== 'creeping-ivy' && !a.hasStatus?.('entwined'));
  return pool.reduce((best, a) => (!best || a.hp > best.hp ? a : best), null);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Spore Puff — the delayed hazard (§6)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "On defeat: all existing Spore Clouds remain. THIS IS CRUCIAL. Killing Spore
 * Puff does not erase consequences it already created." (§6.)
 *
 * So the Clouds are engine timers rather than anything the Puff owns: they tick
 * on `playerTurnStart`, land whether or not the Puff is standing, and appear as
 * labelled countdowns the player can read two turns before they matter.
 */
export const sporePuff = {
  id: 'spore-puff',
  name: 'Spore Puff',
  region: REGION,
  tier: 'normal',
  role: 'hazard',
  hp: [27, 27],
  silhouette: 'puffball',
  palette: ['#b9a7c6', '#e0d4e8', '#453952'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.75,
  lore: 'A round fungal thing that swells whenever anything comes near it, and does not always stop swelling.',

  moves: {
    'release-spores': {
      id: 'release-spores', name: 'Release Spores', intent: Intent.DEBUFF,
      tell: 'It exhales, and something drifts up towards the glass.',
      effect(c) { sporeCloud(c, 2); },
    },
    'puff-up': {
      id: 'puff-up', name: 'Puff Up', intent: Intent.DEFEND, block: 8,
      tell: 'It doubles in size and holds its breath.',
      effect(c) { c.block(c.self, 8); sporeCloud(c, 3); },
    },
    'soft-bonk': {
      id: 'soft-bonk', name: 'Soft Bonk', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'It bumps into you, apologetically.',
      effect(c) { hitPlayer(c, 5); },
    },
  },

  nextMove: (c) => cyc(['release-spores', 'soft-bonk', 'puff-up', 'soft-bonk'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 7) { h.flags.sporeDamage = 9; h.notes.push('Haunt 7: a Spore Cloud lands for 9, not 7.'); }
    return h;
  },
};
function sporeCloud(c, turns) {
  const n = flag(c, 'sporeDamage', 7);
  const id = `spore:${c.self.id}:${(mem(c).clouds = (mem(c).clouds || 0) + 1)}`;
  c.schedule({
    id, turns, label: `Spore Cloud — ${n} damage`,
    /* The timer's `run` gets the ENGINE, not this ctx, and the Puff may be dead
       by then, so the damage is dealt through the engine directly rather than
       through a ctx that has gone stale. `loseHp` and not `damage`: a Spore
       Cloud is not an attack and Guard raised two turns ago should not still be
       standing in front of it — but Guard IS the honest answer here, so it goes
       through `dealDamage` with the seat as defender. */
    run: ({ e }) => {
      const seat = (typeof e.livingPlayers === 'function' && e.livingPlayers()[0]) || e.player;
      if (!seat || !e.dealDamage) return;
      e.dealDamage({ attacker: null, defender: seat, amount: n, kind: 'hazard', cause: 'timer' });
      if (typeof e.say === 'function') e.say('A Spore Cloud comes down.', 'warn');
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Topiary Beast — the reactive bruiser (§7)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "The enemy reacts to broad player behavior without directly invalidating it.
 * The player can even manipulate which form appears." (§7.)
 *
 * `nextMove` is pure and reads the turn that just ended, so the announced form
 * is the form that arrives. §7 requires the INTENDED form to be displayed
 * before Reshape happens, which is what `ruleFn` on Reshape is for.
 */
const FORMS = {
  rabbit: { name: 'Rabbit', move: 'hedge-hop' },
  bear: { name: 'Bear', move: 'topiary-maul' },
  tortoise: { name: 'Tortoise', move: 'leafy-shell' },
};
export const topiaryBeast = {
  id: 'topiary-beast',
  name: 'Topiary Beast',
  region: REGION,
  tier: 'normal',
  role: 'adaptive',
  hp: [43, 43],
  silhouette: 'topiary',
  palette: ['#3f7a3a', '#79b86b', '#1e3a1c'],
  shape: { body: 'squat', limbs: 4, eyes: 0 },
  scale: 1.05,
  lore: 'A hedge cut into the shape of an animal, which trims itself into a different animal when it needs to.',

  onSpawn(c) {
    const keys = Object.keys(FORMS);
    mem(c).form = keys[c.rng.int(keys.length)];
    announceForm(c);
  },

  onPlayerTurnStart(c) { mem(c).guardGained = 0; },
  onBoardEvent(c, ev) {
    const e = ev || c.boardEvent || {};
    if (e.type === 'block' && e.actor && e.actor.side === 'player') {
      mem(c).guardGained = (mem(c).guardGained || 0) + (e.amount || 0);
    }
  },

  moves: {
    'hedge-hop': {
      id: 'hedge-hop', name: 'Hedge Hop', intent: Intent.ATTACK, damage: 4, hits: 2,
      tell: 'Two quick bounds, and it is somewhere else afterwards.',
      effect(c) { hitPlayer(c, 4, 2); c.block(c.self, 4); },
    },
    'topiary-maul': {
      id: 'topiary-maul', name: 'Topiary Maul', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'It rears up on branches thick enough to be legs.',
      effect(c) { hitPlayer(c, 12); },
    },
    'leafy-shell': {
      id: 'leafy-shell', name: 'Leafy Shell', intent: Intent.DEFEND, block: 14,
      tell: 'It folds every branch inwards and waits.',
      effect(c) { c.block(c.self, 14); mem(c).shelled = true; },
    },
    reshape: {
      id: 'reshape', name: 'Reshape', intent: Intent.BUFF,
      tellFn: (c) => `It is about to cut itself into a ${FORMS[intendedForm(c)].name}.`,
      tell: 'It starts trimming itself into something else.',
      effect(c) { mem(c).form = intendedForm(c); announceForm(c); },
    },
  },

  /** Two actions in a form, then Reshape (§7). */
  nextMove: (c) => {
    const h = c.history || [];
    if (h.length && h[h.length - 1] !== 'reshape') {
      const since = [];
      for (let i = h.length - 1; i >= 0 && h[i] !== 'reshape'; i--) since.push(h[i]);
      if (since.length >= 2) return 'reshape';
    }
    return FORMS[mem(c).form || 'rabbit'].move;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 8) h.notes.push('Haunt 8: a shelled Tortoise adds 6 to its next attack, not 4.');
    if (level >= 8) h.flags.shellBonus = 6;
    return h;
  },
};
function intendedForm(c) {
  if (playedOfType(c, 'attack') >= 3) return 'tortoise';
  if ((mem(c).guardGained || 0) >= 15) return 'bear';
  return 'rabbit';
}
function announceForm(c) {
  const f = FORMS[mem(c).form || 'rabbit'];
  c.announceRule({
    id: `form:${c.self.id}`,
    name: `${f.name} Form`,
    text: 'Play 3 or more Attacks and it becomes a Tortoise. Gain 15 or more Guard and it becomes a Bear. Otherwise a Rabbit.',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Glassvine — retaliation with a break point (§8)
// ═════════════════════════════════════════════════════════════════════════════
/**
 * "Small repeated attacks pay a price. But sufficiently committed offense can
 * break the retaliation mechanic entirely for a window." (§8.)
 *
 * The retaliation is capped at three triggers a player turn, and it is dealt
 * with `loseHp` rather than `damage` — it is not an attack, it is thorns, and
 * routing it through the attack pipeline would let the player's own Guard stop
 * a thing they walked into.
 */
export const glassvine = {
  id: 'glassvine',
  name: 'Glassvine',
  region: REGION,
  tier: 'normal',
  role: 'retaliator',
  hp: [34, 34],
  silhouette: 'glassvine',
  palette: ['#8fd0d8', '#d6f2f5', '#25454a'],
  shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
  scale: 0.95,
  lore: 'A vine that has grown up through a broken pane and taken the glass with it. Every thorn is a shard.',

  onSpawn(c) { announceThorns(c); },
  onPlayerTurnStart(c) { setCnt(c, 'thorns', 0); mem(c).attackDamage = 0; },

  onDamaged(c) {
    if (mem(c).shattered) return;
    if (cnt(c, 'thorns') >= 3) return;
    addCnt(c, 'thorns', 1, 3);
    c.loseHp(c.player, 2 + (mem(c).refracted ? 1 : 0));
  },

  onPlayerTurnEnd(c) {
    // 15 Attack damage in one turn shatters the coating (§8).
    if (!mem(c).shattered && dmgTaken(c) >= 15) {
      mem(c).shattered = true;
      c.applyStatus(c.self, 'exposed-sap', 1);
      c.say('The glass shatters.', 'good');
      announceThorns(c);
    }
  },

  /** The glass regrows after its next turn. */
  onTurnEnd(c) {
    mem(c).refracted = false;
    if (!mem(c).shattered) return;
    if (!mem(c).shatterHeld) { mem(c).shatterHeld = true; return; }
    mem(c).shattered = false;
    mem(c).shatterHeld = false;
    c.removeStatus(c.self, 'exposed-sap');
    announceThorns(c);
  },

  moves: {
    'shard-whip': {
      id: 'shard-whip', name: 'Shard Whip', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It swings, and the light goes everywhere at once.',
      effect(c) { hitPlayer(c, 8); },
    },
    refract: {
      id: 'refract', name: 'Refract', intent: Intent.DEFEND, block: 10,
      tell: 'The shards turn edge-on and the whole vine goes hard to look at.',
      effect(c) { c.block(c.self, 10); mem(c).refracted = true; announceThorns(c); },
    },
    'grow-through': {
      id: 'grow-through', name: 'Grow Through', intent: Intent.DEFEND, block: 5,
      tell: 'It pushes another inch through the broken pane and heals over the cut.',
      effect(c) { c.heal(c.self, 4); c.block(c.self, 5); },
    },
  },

  nextMove: (c) => cyc(['shard-whip', 'refract', 'grow-through'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 9) h.notes.push('Haunt 9: shattering it needs 20 Attack damage in one turn.');
    if (level >= 9) h.flags.shatterAt = 20;
    return h;
  },
};
function announceThorns(c) {
  c.announceRule({
    id: `thorns:${c.self.id}`,
    name: mem(c).shattered ? 'Glass Broken' : 'Glass Thorns',
    text: mem(c).shattered
      ? 'Its thorns do nothing and it takes 20% more damage, until after its next turn.'
      : `Every Attack that damages it costs you ${2 + (mem(c).refracted ? 1 : 0)} Courage, up to three times a turn. `
        + `Deal ${flag(c, 'shatterAt', 15)} Attack damage in one turn to break the glass.`,
  });
}

export const GREENHOUSE_ENEMIES = [
  potling, seedling, snappingBlossom, creepingIvy, sporePuff, topiaryBeast, glassvine,
];
export const GREENHOUSE_REGION = REGION;
