/**
 * The Kitchens and Cellars — enemy roster. OWNER: enemies.
 * Source of truth: docs/design/regions/04-kitchens-cellars.md.
 *
 * Region thesis: "The enemy you are fighting now may not be the enemy you are
 * fighting next turn."
 *
 * The Sleeping Quarters was about not being sure what was safe. This region is
 * about not being sure what things ARE. Dough divides. Batter rises. Candy eats
 * its neighbours. An oven takes an enemy off the board and hands it back worse.
 * Every one of those is visible turns in advance — the chaos is in the board
 * state, never in the information.
 *
 * WHAT THAT MEANS FOR THE CODE. Three mechanics here mutate the roster mid-fight
 * (Divide, Bake, Absorb), and all three do it through the engine's own
 * `summon`/`despawn` rather than by mutating a def. A def is shared by every
 * instance in every fight and in every preview fork; writing to one would give
 * the second Dough Blob of the run the first one's scars.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, dmgTaken, cyc, countMoves, lastMove,
  hitPlayer, hauntBase, flag, isAlive, pct,
} from './_lib.js';

const REGION = 'kitchens-cellars';

/* ── the region's own statuses and status Trick ────────────────────────────
 * Registered by `data/enemies/index.js` alongside `ENEMY_STATUSES`, so the
 * region is drop-in the same way the first three are.
 */

/**
 * Sticky is the region's signature deck interference, and it is deliberately
 * NOT a dead card — the same rule Drowsy follows in the Sleeping Quarters. It
 * replaces itself, so it never shrinks your hand. What it takes is a Nerve, and
 * a Nerve in this region is the resource every escalating enemy is racing you
 * for. It slows tempo rather than removing options.
 */
/* The region's two status Tricks live in `_lib.js` with `clutter` and
 * `drowsy`. They are CARD defs, not enemy defs: their effects run against the
 * card context, and a `ctx.draw()` sitting in an enemy roster file reads to
 * `tests/seams/check.py` as a call on the enemy context that does not exist.
 * The gate is right to be suspicious, and one home for status Tricks is
 * better than two. */

export const KITCHENS_STATUSES = [
  {
    id: 'rise', name: 'Rise', kind: 'buff', icon: 'rise',
    desc: 'Attacks deal 2 more damage per Rise. At 4 Rise it also gains 5 Guard each turn.',
    decay: 'never', stacks: true, max: 4,
    hooks: { onTurnStart: (ctx) => { if ((ctx.stacks || 0) >= 4) ctx.block(ctx.actor, 5); } },
  },
  {
    id: 'sweetness', name: 'Sweetness', kind: 'buff', icon: 'sweetness',
    desc: 'Attacks deal 2 more damage per Sweetness.',
    decay: 'never', stacks: true, max: 3,
    hooks: { modifyDamageDealt: (amt, ctx) => amt + 2 * (ctx.stacks || 0) },
  },
  {
    /**
     * Disguised hides how much Courage is left, not the enemy. The Mimic is
     * targetable throughout — the region's rule is that chaos lives in the board
     * and never in the information, and an untargetable enemy would break it.
     * `ui/enemy.js` reads this status to band the number; see the note in
     * `pantryMimic` about what is and is not wired.
     */
    id: 'disguised', name: 'Disguised', kind: 'buff', icon: 'disguise',
    desc: 'Its exact Courage is hidden until it takes damage.',
    decay: 'never', stacks: false, max: 1,
  },
  {
    id: 'baking', name: 'Baking', kind: 'buff', icon: 'baking',
    desc: 'Inside the Oven Maw. Cannot act and cannot be targeted.',
    decay: 'never', stacks: false, max: 1,
    untargetableBy: ['attack', 'skill', 'power'],
  },
  {
    id: 'brittle', name: 'Brittle', kind: 'debuff', icon: 'brittle',
    desc: 'Takes 25% more damage.',
    decay: 'never', stacks: false, max: 1,
    hooks: { modifyDamageTaken: (amt) => Math.ceil(amt * 1.25) },
  },
];

/* ── utensils, shared by Kitchen Imp and anything that inherits one ────────── */
const UTENSILS = {
  fork: { id: 'fork', name: 'Fork', note: 'Next attack deals 3 more damage.' },
  /**
   * DEVIATION FROM THE DESIGN DOC, deliberately.
   *
   * §4 asks for "one additional hit at half damage". That cannot be expressed
   * in the intent model: an intent is `damage x hits`, and 8 + 4 is neither
   * 8x1 nor 8x2. `tests/enemies/run.py` caught it as Cutlery Devil promising 16
   * and dealing 12 — a 0.75x lie on the game's first-line promise that the
   * player can always see exactly what is about to happen.
   *
   * So the extra hit is full damage. The alternative was to keep the half-hit
   * and let the number on screen be wrong, and between a design nicety and the
   * intent contract, the contract wins. Balance-wise it makes the Whisk the
   * strongest of the three utensils, which is fine: it is also the rarest thing
   * to see land, and the Fork's +3 is flat while this scales with the attack.
   */
  whisk: { id: 'whisk', name: 'Whisk', note: 'Next attack hits one more time.' },
  ladle: { id: 'ladle', name: 'Ladle', note: 'After its next attack, gain 6 Guard.' },
};
const UTENSIL_IDS = Object.keys(UTENSILS);

/** The held utensil, or null. Stored per-instance in `mem`, never on the def. */
function tool(c) { return mem(c).tool || null; }
function grabTool(c, rng) {
  const pick = UTENSIL_IDS[(rng || c.rng).int(UTENSIL_IDS.length)];
  mem(c).tool = pick;
  // A House Rule, not a `say`: the held utensil is persistent board state the
  // player is meant to plan against for a full turn, and `announceRule` is what
  // puts it on the rules strip rather than in the log for one beat. It takes an
  // OBJECT — passing a string throws inside the engine, which is how this was
  // caught before it ever reached a fight.
  c.announceRule({ id: `tool-${c.self.id}`, name: UTENSILS[pick].name, text: UTENSILS[pick].note });
  return pick;
}
/**
 * Resolve an attack through whatever utensil is held, then drop it.
 * Returns the damage actually dealt, for callers that care.
 */
function swingWithTool(c, base, hits = 1) {
  const t = tool(c);
  mem(c).tool = null;
  if (t === 'fork') { hitPlayer(c, base + 3, hits); return base + 3; }
  if (t === 'whisk') { hitPlayer(c, base, hits + 1); return base; }
  hitPlayer(c, base, hits);
  if (t === 'ladle') c.block(c.self, 6);
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dough Blob — the splitting lesson
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Divide is the region's opening argument: a damage threshold can create a new
 * enemy, so killing something cleanly is sometimes worth more than killing it
 * efficiently.
 *
 * THE BURST EXEMPTION IS THE WHOLE MECHANIC. Dropped from above 16 straight to 0
 * by one resolving effect, it does not Divide — so a saved-up Attack is
 * genuinely better here than two small ones, which is a real decision rather
 * than a tax. `onDamaged` fires after the damage resolves and can see both the
 * before and after, which is the only place that distinction is visible.
 */
export const doughBlob = {
  id: 'dough-blob',
  name: 'Dough Blob',
  region: REGION,
  tier: 'normal',
  role: 'splitter',
  hp: [34, 34],
  silhouette: 'blob',
  palette: ['#e8d9bd', '#c4ab86', '#7d6a4e'],
  shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  scale: 0.95,
  lore: 'A mound of dough with a face pressed into it. It is trying, very slowly, to become more dough.',

  onDamaged(c) {
    if (mem(c).divided) return;
    const self = c.self;
    // Killed outright from above the threshold: no split. This is the burst
    // exemption and it is checked BEFORE the alive test, because a dead Blob
    // that crossed 16 on the way down must still not divide.
    if (!isAlive(self)) { mem(c).divided = true; return; }
    if (self.hp > 16) return;
    mem(c).divided = true;
    const spawn = flag(c, 'doughlings', 2);
    c.say(`${self.name} comes apart into ${spawn} smaller ones.`, 'warn');
    for (let i = 0; i < spawn; i++) c.summon('doughling', { hp: 11 });
    c.despawn(self);
  },

  moves: {
    knead: {
      id: 'knead', name: 'Knead', intent: Intent.DEFEND, block: 8,
      tell: 'It folds itself over, twice, and presses down.',
      effect(c) { c.block(c.self, 8); },
    },
    'dough-slam': {
      id: 'dough-slam', name: 'Dough Slam', intent: Intent.ATTACK, damage: 8, hits: 1,
      tell: 'It rears up and lets gravity do the rest.',
      effect(c) { hitPlayer(c, 8); },
    },
    rise: {
      id: 'rise', name: 'Rise', intent: Intent.BUFF, block: 3,
      tell: 'It swells at the edges, quietly pleased with itself.',
      effect(c) {
        // Never above the original maximum: Rise is recovery, not growth.
        c.heal(c.self, Math.min(4, Math.max(0, c.self.maxHp - c.self.hp)));
        c.block(c.self, 3);
      },
    },
  },

  nextMove: (c) => cyc(['knead', 'dough-slam', 'rise', 'dough-slam'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.doughlings = 3;
      h.notes.push('Haunt 3: it divides into three Doughlings instead of two.');
    }
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Doughling — what a Dough Blob becomes
// ─────────────────────────────────────────────────────────────────────────────
export const doughling = {
  id: 'doughling',
  name: 'Doughling',
  region: REGION,
  tier: 'normal',
  role: 'spawn',
  hp: [11, 11],
  silhouette: 'blob',
  palette: ['#efe4cd', '#cdb897', '#8a765a'],
  shape: { body: 'sprawling', limbs: 0, eyes: 1 },
  scale: 0.55,
  /**
   * Never rolled into a formation on its own — it only ever arrives by Divide.
   * Read by `tests/kitchens/check.py`, which fails if a summon-only enemy is
   * ever placed in an encounter by hand. A flag with no reader would have been
   * the same unreachable-declaration class the 2026-08-30 sweep spent a day on.
   */
  summonOnly: true,
  lore: 'Half the mass, all of the enthusiasm.',

  moves: {
    'sticky-slap': {
      id: 'sticky-slap', name: 'Sticky Slap', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'It flops a limb at you and takes a moment to peel it off again.',
      effect(c) { hitPlayer(c, 5); },
    },
    'squish-together': {
      id: 'squish-together', name: 'Squish Together', intent: Intent.DEFEND, block: 4,
      tell: 'The two of them lean on each other.',
      effect(c) {
        const kin = [c.self, ...allies(c)].filter(a => isAlive(a) && a.defId === 'doughling');
        if (kin.length >= 2) for (const k of kin) c.block(k, 4);
        else c.block(c.self, 4);
      },
    },
  },

  nextMove: (c) => {
    const kin = [c.self, ...allies(c)].filter(a => isAlive(a) && a.defId === 'doughling');
    return (kin.length >= 2 && (c.history || []).length % 2 === 1) ? 'squish-together' : 'sticky-slap';
  },

  hauntScaling(level) { return hauntBase(level, 'normal'); },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Jam Jar — tempo interference
// ─────────────────────────────────────────────────────────────────────────────
export const jamJar = {
  id: 'jam-jar',
  name: 'Jam Jar',
  region: REGION,
  tier: 'normal',
  role: 'support',
  hp: [25, 25],
  silhouette: 'jar',
  palette: ['#6d2440', '#a83a5e', '#e0b9c6'],
  shape: { body: 'squat', limbs: 2, eyes: 0 },
  scale: 0.7,
  lore: 'A jar of something purple, walking on two teaspoons, leaking a little as it goes.',

  moves: {
    spill: {
      id: 'spill', name: 'Spill', intent: Intent.DEBUFF,
      partyPick: 'mostDraw',
      tell: 'It tips, deliberately, and something reaches the floor.',
      addsCards: [{ id: 'status/sticky', pile: 'discard' }],
      effect(c) { c.addCard('status/sticky', 'discard'); },
    },
    'jam-splash': {
      id: 'jam-splash', name: 'Jam Splash', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'It shakes itself and the lid rattles.',
      effect(c) { hitPlayer(c, 5); },
    },
    'seal-the-lid': {
      id: 'seal-the-lid', name: 'Seal the Lid', intent: Intent.DEFEND, block: 11,
      tell: 'The lid screws itself down a quarter turn.',
      effect(c) { c.block(c.self, 11); },
    },
  },

  nextMove: (c) => cyc(['spill', 'jam-splash', 'seal-the-lid'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 2) h.notes.push('Haunt 2: Spill leaves the Sticky in the DRAW pile.');
    if (level >= 2) h.flags.spillToDraw = 1;
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Kitchen Imp — a visible, readable modifier
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The utensil is announced when it is grabbed and spent on the next attack, so
 * the player always has one full turn to plan against a known modification.
 * That is the difference between this and a random damage roll.
 */
export const kitchenImp = {
  id: 'kitchen-imp',
  name: 'Kitchen Imp',
  region: REGION,
  tier: 'normal',
  role: 'fast-attacker',
  hp: [29, 29],
  silhouette: 'imp',
  palette: ['#b9c3cc', '#7b8794', '#3d454e'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 2 },
  scale: 0.72,
  lore: 'Fork hands, whisk tail, a measuring cup worn at a confident angle.',

  moves: {
    'grab-a-tool': {
      id: 'grab-a-tool', name: 'Grab a Tool', intent: Intent.BUFF,
      tell: 'It reaches over its shoulder into the drawer without looking.',
      effect(c) { grabTool(c); },
    },
    'utensil-jab': {
      id: 'utensil-jab', name: 'Utensil Jab', intent: Intent.ATTACK, damage: 7, hits: 1,
      tellFn: (c) => (tool(c)
        ? `It comes in with the ${UTENSILS[tool(c)].name}. ${UTENSILS[tool(c)].note}`
        : 'It comes in bare-handed, which is somehow worse.'),
      tell: 'It comes in with whatever it picked up.',
      damageFn: (c) => 7 + (tool(c) === 'fork' ? 3 : 0),
      hitsFn: (c) => 1 + (tool(c) === 'whisk' ? 1 : 0),
      effect(c) { swingWithTool(c, 7, 1); },
    },
    'countertop-scamper': {
      id: 'countertop-scamper', name: 'Countertop Scamper', intent: Intent.ATTACK, damage: 4, hits: 2,
      tell: 'It runs the length of the counter, hitting things on the way past.',
      effect(c) { hitPlayer(c, 4, 2); },
    },
  },

  nextMove: (c) => cyc(['grab-a-tool', 'utensil-jab', 'countertop-scamper'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 4) h.notes.push('Haunt 4: it starts the fight holding a utensil.');
    if (level >= 4) h.flags.startWithTool = 1;
    return h;
  },

  onSpawn(c) { if (flag(c, 'startWithTool')) grabTool(c); },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Candy Clump — the absorber
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Absorb turns every other enemy on the board into a decision. It is loud on
 * purpose: the announcement names what it took, so "do I kill the Jam Jar first"
 * is a question the player can actually answer rather than a surprise they
 * discover afterwards.
 */
export const candyClump = {
  id: 'candy-clump',
  name: 'Candy Clump',
  region: REGION,
  tier: 'normal',
  role: 'absorber',
  hp: [38, 38],
  silhouette: 'clump',
  palette: ['#f06d9a', '#ffd166', '#5ad2c4'],
  shape: { body: 'sprawling', limbs: 0, eyes: 3 },
  scale: 0.9,
  lore: 'Several boiled sweets that melted into one another in a warm cupboard, and kept going.',

  onAllyDeath(c) {
    const dead = c.dead;
    if (!dead || !isAlive(c.self)) return;
    const id = dead.defId || dead.id || '';
    const took = (what) => c.say(`${c.self.name} absorbs ${what}.`, 'warn');

    if (id === 'dough-blob' || id === 'doughling' || id === 'crust-beast') {
      c.self.maxHp += 6;
      c.heal(c.self, 6);
      took('the dough');
    } else if (id === 'jam-jar' || id === 'caramel-creeper') {
      mem(c).jammed = true;
      took('the jam — its next attack will stick');
    } else if (id === 'kitchen-imp' || id === 'cutlery-devil') {
      const t = (dead.mem && dead.mem.tool) || null;
      if (t) { mem(c).tool = t; took(`the ${UTENSILS[t].name}`); }
      else took('a handful of cutlery');
    } else if (id === 'candy-clump' || id === 'brittle-candy-beast') {
      addCnt(c, 'permDmg', 2);
      took('the other Clump — permanently harder');
    } else if (id === 'pantry-mimic') {
      c.block(c.self, 10);
      took('the Mimic');
    } else if (id === 'rising-batter' || id === 'cake-thing') {
      c.applyStatus(c.self, 'sweetness', 1);
      took('the batter — Sweetness');
    }
  },

  moves: {
    'candy-bash': {
      id: 'candy-bash', name: 'Candy Bash', intent: Intent.ATTACK, damage: 9, hits: 1,
      tell: 'It swings the heaviest part of itself.',
      damageFn: (c) => 9 + cnt(c, 'permDmg'),
      effect(c) { swingClump(c, 9 + cnt(c, 'permDmg'), 1); },
    },
    harden: {
      id: 'harden', name: 'Harden', intent: Intent.DEFEND, block: 10,
      tell: 'The surface goes glassy.',
      effect(c) { c.block(c.self, 10); },
    },
    'sugar-rush': {
      id: 'sugar-rush', name: 'Sugar Rush', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'Everything speeds up for a moment.',
      damageFn: (c) => 5 + cnt(c, 'permDmg'),
      hitsFn: (c) => (c.count('sweetness', c.self) >= 1 ? 3 : 2),
      effect(c) {
        const hits = c.count('sweetness', c.self) >= 1 ? 3 : 2;
        swingClump(c, 5 + cnt(c, 'permDmg'), hits);
      },
    },
  },

  nextMove: (c) => cyc(['candy-bash', 'harden', 'sugar-rush'], (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 3) h.notes.push('Haunt 3: it starts with 1 Sweetness.');
    if (level >= 3) h.flags.startSweet = 1;
    return h;
  },

  onSpawn(c) { if (flag(c, 'startSweet')) c.applyStatus(c.self, 'sweetness', 1); },
};

/** A Clump attack, spending the Jam it absorbed if it has any. */
function swingClump(c, dmg, hits) {
  const t = tool(c);
  if (t) swingWithTool(c, dmg, hits); else hitPlayer(c, dmg, hits);
  if (mem(c).jammed) { mem(c).jammed = false; c.addCard('status/sticky', 'discard'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pantry Mimic — information, taken temporarily
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Swallow Something is the softest form of deck attack in the game: the Trick is
 * not destroyed, not transformed and not permanently lost. It is behind the
 * Mimic, and killing the Mimic gives it straight back. The clock is the fight,
 * not the run.
 *
 * NOT WIRED: the design asks the player to see "Low / Medium / High" instead of
 * an exact number while Disguised. The `disguised` status carries the state and
 * the reveal works; banding the printed number is a change in `ui/enemy.js`,
 * which this file does not own. Recorded in docs/notes rather than half-done.
 */
export const pantryMimic = {
  id: 'pantry-mimic',
  name: 'Pantry Mimic',
  region: REGION,
  tier: 'normal',
  role: 'deceiver',
  hp: [35, 35],
  silhouette: 'sack',
  palette: ['#cbb99a', '#8d7a5c', '#3a3126'],
  shape: { body: 'squat', limbs: 0, eyes: 0 },
  scale: 0.85,
  lore: 'A sack of flour. Or a crate. Or a cupboard. Then teeth.',

  onSpawn(c) { c.applyStatus(c.self, 'disguised', 1); },

  onDamaged(c) {
    if (!c.has('disguised', c.self) || !isAlive(c.self)) return;
    c.removeStatus(c.self, 'disguised');
    c.block(c.self, 5);
    c.say(`${c.self.name} stops pretending.`, 'warn');
  },

  /**
   * Whatever it swallowed comes back when it dies.
   *
   * There is deliberately no combat-end restore. The engine dispatches no
   * `onCombatEnd` to enemy defs — I checked rather than assumed — and it would
   * be a no-op if it did: a swallowed card is moved within the FIGHT's piles and
   * `run.deck` is never touched, so the next Scuffle deals it again. The
   * design's "it returns normally before leaving combat" is satisfied by
   * construction rather than by code.
   */
  onDeath(c) { returnSwallowed(c); },

  moves: {
    'stay-still': {
      id: 'stay-still', name: 'Stay Still', intent: Intent.DEFEND, block: 6,
      tell: 'It is a sack of flour. It has always been a sack of flour.',
      effect(c) { c.block(c.self, 6); },
    },
    'pantry-bite': {
      id: 'pantry-bite', name: 'Pantry Bite', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'The seam along the top opens further than a seam should.',
      effect(c) { hitPlayer(c, 10); },
    },
    'swallow-something': {
      id: 'swallow-something', name: 'Swallow Something', intent: Intent.DEBUFF,
      tell: 'It takes something off the top of your deck and holds it where you can see.',
      effect(c) {
        if (mem(c).swallowed) return;              // one at a time
        const card = c.takeFromDraw('top');
        if (card) {
          mem(c).swallowed = card;
          c.say(`${c.self.name} swallowed ${card.name}.`, 'warn');
        }
      },
    },
  },

  nextMove: (c) => cyc(['stay-still', 'pantry-bite', 'swallow-something', 'pantry-bite'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 2) h.notes.push('Courage +10%.');
    return h;
  },
};

function returnSwallowed(c) {
  const card = mem(c).swallowed;
  if (!card) return;
  mem(c).swallowed = null;
  c.returnToHand(card);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Rising Batter — escalation that changes behaviour, not just numbers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Dust Bunny punishes you for ignoring it by hitting harder. This punishes you
 * by becoming a different fight: at 3 Rise it stops using its normal pattern and
 * starts Collapsing, which is both its biggest hit and the only thing that
 * spends Rise. Touching it every turn is a real cost; not touching it is worse.
 */
export const risingBatter = {
  id: 'rising-batter',
  name: 'Rising Batter',
  region: REGION,
  tier: 'normal',
  role: 'escalation',
  hp: [40, 40],
  silhouette: 'bowl',
  palette: ['#f3e2c0', '#d8b98a', '#6f5a3c'],
  shape: { body: 'sprawling', limbs: 2, eyes: 2 },
  scale: 1.0,
  lore: 'A mixing bowl that has grown legs, and batter that has grown ambitions.',

  /**
   * "At the end of every player turn in which it took no damage." Measured off
   * `dmgTaken`, which the engine resets per turn, rather than off a flag this
   * file would have to remember to clear.
   */
  onPlayerTurnEnd(c) {
    // Only RECORD the verdict here. Applying it here made the shown intent a
    // lie: `tests/enemies/run.py` measured Batter Flop promising 7 and dealing
    // 9, because the Rise landed after the intent for that very attack had
    // already been published. The rule is unchanged — "a player turn in which
    // it took no damage" — but the stack arrives where the engine can still
    // redraw the number the player reads.
    if (!isAlive(c.self)) return;
    mem(c).roseThisTurn = dmgTaken(c, c.self) === 0;
  },

  /**
   * `onEnemyPhaseEnd` is documented in `combat/hooks.js` as the moment after
   * every enemy has acted and BEFORE intents are redrawn — "arm ally buffs here
   * so the intent the player reads afterwards is the true number". This is that
   * exact case.
   */
  onEnemyPhaseEnd(c) {
    if (!isAlive(c.self)) return;
    if (!mem(c).roseThisTurn) return;
    mem(c).roseThisTurn = false;
    if (c.count('rise', c.self) >= 4) return;
    c.applyStatus(c.self, 'rise', 1);
  },

  moves: {
    'batter-flop': {
      id: 'batter-flop', name: 'Batter Flop', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It leans over the rim and lets go.',
      damageFn: (c) => 7 + 2 * c.count('rise', c.self),
      effect(c) { hitPlayer(c, 7 + 2 * c.count('rise', c.self)); },
    },
    overflow: {
      id: 'overflow', name: 'Overflow', intent: Intent.DEFEND, block: 7,
      tell: 'It swells past the rim and holds there.',
      effect(c) {
        c.block(c.self, 7);
        if (c.count('rise', c.self) >= 2) c.addCard('status/sticky', 'discard');
      },
    },
    collapse: {
      id: 'collapse', name: 'Collapse', intent: Intent.ATTACK, damage: 10, hits: 1,
      tell: 'All of it comes down at once.',
      // Spending Rise is a status change and the intent has to say so, or it
      // lands with no warning — which is what the suite caught.
      applies: [{ id: 'rise', stacks: -2, to: 'self' }],
      effect(c) {
        hitPlayer(c, 10);
        c.applyStatus(c.self, 'rise', -2);
      },
    },
  },

  nextMove: (c) => {
    if (c.count('rise', c.self) >= 3) return 'collapse';
    return cyc(['batter-flop', 'overflow'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'normal');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 5) h.notes.push('Haunt 5: it begins at 1 Rise.');
    if (level >= 5) h.flags.startRise = 1;
    return h;
  },

  onSpawn(c) { if (flag(c, 'startRise')) c.applyStatus(c.self, 'rise', 1); },
};

/* ═══ the baked forms ══════════════════════════════════════════════════════
 * What the Oven Maw hands back. Each is a real EnemyDef rather than a status on
 * the original, because "cannot Divide any more" and "no longer gains Rise" are
 * changes to behaviour, and a status that suppressed another def's `nextMove`
 * would be a second, invisible copy of that def's logic.
 */

export const crustBeast = {
  id: 'crust-beast', name: 'Crust Beast', region: REGION, tier: 'normal', role: 'baked',
  hp: [42, 42], summonOnly: true, silhouette: 'blob', scale: 1.0,
  palette: ['#b98a52', '#8a6034', '#4a3320'], shape: { body: 'sprawling', limbs: 0, eyes: 2 },
  lore: 'The dough went in soft. It has come out with edges.',
  moves: {
    'crust-slam': {
      id: 'crust-slam', name: 'Crust Slam', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'It brings the hard edge down.',
      effect(c) { hitPlayer(c, 12); },
    },
    'set-firm': {
      id: 'set-firm', name: 'Set Firm', intent: Intent.DEFEND, block: 9,
      tell: 'It cools, and hardens where it stands.',
      effect(c) { c.block(c.self, 9); },
    },
  },
  nextMove: (c) => cyc(['crust-slam', 'set-firm'], (c.history || []).length),
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

export const caramelCreeper = {
  id: 'caramel-creeper', name: 'Caramel Creeper', region: REGION, tier: 'normal', role: 'baked',
  hp: [31, 31], summonOnly: true, silhouette: 'jar', scale: 0.75,
  palette: ['#8a4a1e', '#c47b33', '#f0c48a'], shape: { body: 'squat', limbs: 2, eyes: 0 },
  lore: 'The jam cooked down. What is left moves slowly and does not let go.',
  moves: {
    'caramel-spill': {
      id: 'caramel-spill', name: 'Caramel Spill', intent: Intent.DEBUFF,
      partyPick: 'mostDraw',
      tell: 'Something thick reaches the floor and stays there.',
      addsCards: [{ id: 'status/sticky-caramel', pile: 'discard' }],
      effect(c) { c.addCard('status/sticky-caramel', 'discard'); },
    },
    'hot-splash': {
      id: 'hot-splash', name: 'Hot Splash', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It is still far too warm.',
      effect(c) { hitPlayer(c, 7); },
    },
  },
  nextMove: (c) => cyc(['caramel-spill', 'hot-splash'], (c.history || []).length),
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

export const cutleryDevil = {
  id: 'cutlery-devil', name: 'Cutlery Devil', region: REGION, tier: 'normal', role: 'baked',
  hp: [36, 36], summonOnly: true, silhouette: 'imp', scale: 0.8,
  palette: ['#dfe6ec', '#98a6b4', '#2f3944'], shape: { body: 'tall-thin', limbs: 6, eyes: 2 },
  lore: 'It went in holding one thing. It has come out holding everything.',
  onSpawn(c) { grabTool(c); mem(c).second = UTENSIL_IDS[c.rng.int(UTENSIL_IDS.length)]; },
  moves: {
    'double-jab': {
      id: 'double-jab', name: 'Double Jab', intent: Intent.ATTACK, damage: 8, hits: 1,
      tellFn: (c) => (tool(c) ? `Both hands are full. ${UTENSILS[tool(c)].note}` : 'Both hands are full.'),
      tell: 'Both hands are full.',
      damageFn: (c) => 8 + (tool(c) === 'fork' ? 3 : 0),
      hitsFn: (c) => 1 + (tool(c) === 'whisk' ? 1 : 0),
      effect(c) {
        swingWithTool(c, 8, 1);
        const second = mem(c).second;
        if (second) { mem(c).tool = second; mem(c).second = null; }
      },
    },
    'drawer-rattle': {
      id: 'drawer-rattle', name: 'Drawer Rattle', intent: Intent.ATTACK, damage: 3, hits: 3,
      tell: 'Everything in the drawer at once.',
      effect(c) { hitPlayer(c, 3, 3); },
    },
  },
  nextMove: (c) => cyc(['double-jab', 'drawer-rattle'], (c.history || []).length),
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

export const brittleCandyBeast = {
  id: 'brittle-candy-beast', name: 'Brittle Candy Beast', region: REGION, tier: 'normal', role: 'baked',
  hp: [44, 44], summonOnly: true, silhouette: 'clump', scale: 0.95,
  palette: ['#ff8fb1', '#ffe08a', '#7be0d3'], shape: { body: 'sprawling', limbs: 0, eyes: 3 },
  lore: 'Baked until it rang when you tapped it. It hits harder and it does not bend.',
  onSpawn(c) { c.applyStatus(c.self, 'brittle', 1); },
  moves: {
    'shatter-swing': {
      id: 'shatter-swing', name: 'Shatter Swing', intent: Intent.ATTACK, damage: 13, hits: 1,
      tell: 'It swings, and pieces of it come away.',
      effect(c) { hitPlayer(c, 13); },
    },
    'glass-guard': {
      id: 'glass-guard', name: 'Glass Guard', intent: Intent.DEFEND, block: 8,
      tell: 'It turns its thickest face toward you.',
      effect(c) { c.block(c.self, 8); },
    },
  },
  nextMove: (c) => cyc(['shatter-swing', 'glass-guard'], (c.history || []).length),
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

export const cakeThing = {
  id: 'cake-thing', name: 'Cake Thing', region: REGION, tier: 'normal', role: 'baked',
  hp: [46, 46], summonOnly: true, silhouette: 'bowl', scale: 1.05,
  palette: ['#f6d9b0', '#e0a97a', '#7a5638'], shape: { body: 'sprawling', limbs: 2, eyes: 2 },
  lore: 'It stopped rising. It has settled into something with a shape and a plan.',
  onTurnStart(c) { c.block(c.self, 4); },
  moves: {
    'layer-slam': {
      id: 'layer-slam', name: 'Layer Slam', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'It comes down in one even piece.',
      effect(c) { hitPlayer(c, 11); },
    },
  },
  nextMove: () => 'layer-slam',
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

/** What each ingredient becomes. Read by the Oven Maw and by nothing else. */
export const BAKED_FORM = Object.freeze({
  'dough-blob': 'crust-beast',
  doughling: 'crust-beast',
  'jam-jar': 'caramel-creeper',
  'kitchen-imp': 'cutlery-devil',
  'candy-clump': 'brittle-candy-beast',
  'rising-batter': 'cake-thing',
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. BIG SCARE — The Oven Maw
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The strategic question the design asks — "do you kill the ingredients before
 * they transform, hit the Oven, or let it take the annoying one away?" — only
 * works if Baking is genuinely temporary and genuinely visible. So the baked
 * enemy is `despawn`ed and its identity held in the Oven's own memory with a
 * countdown, and the Oven says whose turn is coming.
 */
export const ovenMaw = {
  id: 'oven-maw',
  name: 'The Oven Maw',
  region: REGION,
  tier: 'elite',
  role: 'transformer',
  hp: [118, 118],
  silhouette: 'oven',
  palette: ['#2b2b2f', '#6b3a1c', '#ffae4a'],
  shape: { body: 'sprawling', limbs: 4, eyes: 8 },
  scale: 1.35,
  lore: 'Cast iron, on legs, with a door that opens further than a door should and a great many small bright eyes behind it.',

  onEnemyPhaseEnd(c) {
    const m = mem(c);
    if (!m.baking) return;
    m.bakeTurns = (m.bakeTurns || 0) - 1;
    if (m.bakeTurns > 0) return;
    const become = BAKED_FORM[m.baking] || 'crust-beast';
    c.say(`The door swings open. Something else comes out.`, 'warn');
    c.summon(become, {});
    m.baking = null;
  },

  moves: {
    bake: {
      id: 'bake', name: 'Bake', intent: Intent.BUFF,
      tell: 'The door swings wide and the heat leans out.',
      effect(c) {
        const m = mem(c);
        if (m.baking) { c.block(c.self, 8); return; }
        const eligible = allies(c).filter(a => isAlive(a) && BAKED_FORM[a.defId]);
        if (!eligible.length) { mixIngredients(c); return; }
        const victim = eligible[c.rng.int(eligible.length)];
        m.baking = victim.defId;
        /* §12: "Preheat - the NEXT baked enemy emerges one turn earlier."
           Consumed HERE, at the next Bake, which is what "next" means. It
           used to be spent inside Preheat as `if (bakeTurns > 1) bakeTurns--`,
           which discounts a bake ALREADY RUNNING - and in the chapter's own
           cycle (Bake, Slam, Heat Wave, Preheat, repeat) that bake has been
           out of the oven for two turns by then, so the rule never fired
           once. Floored at 1: earlier, never instant. */
        m.bakeTurns = Math.max(1, (flag(c, 'bakeFast') ? 1 : 2) - (m.preheated ? 1 : 0));
        m.preheated = false;
        c.say(`${victim.name} goes in.`, 'warn');
        c.despawn(victim);
      },
    },
    'mix-ingredients': {
      id: 'mix-ingredients', name: 'Mix Ingredients', intent: Intent.BUFF,
      tell: 'Something is being assembled in there out of nothing much.',
      effect(c) { mixIngredients(c); },
    },
    'oven-door-slam': {
      id: 'oven-door-slam', name: 'Oven Door Slam', intent: Intent.ATTACK, damage: 14, hits: 1,
      tell: 'The door comes down like a portcullis.',
      effect(c) { hitPlayer(c, 14); },
    },
    'heat-wave': {
      id: 'heat-wave', name: 'Heat Wave', intent: Intent.ATTACK, damage: 6, hits: 1,
      tell: 'The air above it stops being clear.',
      addsCards: [{ id: 'status/sticky', pile: 'discard' }],
      effect(c) { hitPlayer(c, 6); c.addCard('status/sticky', 'discard'); },
    },
    preheat: {
      id: 'preheat', name: 'Preheat', intent: Intent.DEFEND, block: 14,
      tell: 'It glows a shade brighter and settles in.',
      effect(c) {
        c.block(c.self, 14);
        /* Arms the discount; `bake` above spends it. */
        mem(c).preheated = true;
      },
    },
  },

  nextMove: (c) => {
    const others = allies(c).filter(isAlive);
    const m = mem(c);
    if (!others.length && !m.baking) return 'mix-ingredients';
    return cyc(['bake', 'oven-door-slam', 'heat-wave', 'preheat'], (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 2) h.notes.push('Courage +10%.');
    if (level >= 4) { h.flags.bakeFast = 1; h.notes.push('Haunt 4: things bake in one turn.'); }
    return h;
  },
};

function mixIngredients(c) {
  c.say('Something is being made out of nothing much.', 'warn');
  c.summon('dough-blob', { hpMul: 0.5 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. BIG SCARE — The Sugar Golem
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Three layers, and the layer is read from Courage rather than tracked, so it
 * cannot desynchronise from the health bar the player is looking at. Crack Apart
 * fires once per boundary — `mem.layer` records the deepest layer entered, so
 * healing back up does not re-arm it and cannot be farmed.
 */
const GOLEM_LAYERS = [
  { at: 91, id: 'shell', name: 'Candy Shell' },
  { at: 46, id: 'core', name: 'Caramel Core' },
  { at: 0, id: 'crystal', name: 'Sugar Crystal' },
];

function golemLayer(c) {
  const hp = c.self.hp;
  if (hp >= 91) return 'shell';
  if (hp >= 46) return 'core';
  return 'crystal';
}

export const sugarGolem = {
  id: 'sugar-golem',
  name: 'The Sugar Golem',
  region: REGION,
  tier: 'elite',
  role: 'layered',
  hp: [134, 134],
  silhouette: 'golem',
  palette: ['#ffd9e8', '#c98cc0', '#6b3f7a'],
  shape: { body: 'sprawling', limbs: 4, eyes: 2 },
  scale: 1.4,
  lore: 'Crystallised sugar, candy glass and caramel, assembled into something the size of a doorway.',

  onSpawn(c) { mem(c).layer = 'shell'; },

  onTurnStart(c) {
    if (golemLayer(c) === 'shell') c.block(c.self, 6);
  },

  /** The third Attack in a turn, while the Caramel Core is exposed. Once a turn. */
  onPlayerCard(c) {
    if (golemLayer(c) !== 'core') return;
    if (!c.playedCard || c.playedCard.type !== 'attack') return;
    const m = mem(c);
    if (m.stickyTurn === c.turn) return;
    const attacks = (c.cardsPlayedThisTurn || []).filter(p => p && p.type === 'attack').length;
    if (attacks < 3) return;
    m.stickyTurn = c.turn;
    c.addCard('status/sticky', 'discard');
  },

  onDeath(c) {
    // It collapses into a great deal of powdered sugar. A small comic reward.
    c.say('It comes apart into an enormous pile of powdered sugar.', 'good');
    c.block(c.player, 6);
  },

  moves: {
    'crack-apart': {
      id: 'crack-apart', name: 'Crack Apart', intent: Intent.ATTACK, damage: 5, hits: 1,
      tell: 'A seam opens all the way down it.',
      effect(c) { hitPlayer(c, 5); c.block(c.self, 8); },
    },
    'sugar-fist': {
      id: 'sugar-fist', name: 'Sugar Fist', intent: Intent.ATTACK, damage: 12, hits: 1,
      tell: 'It makes a fist the size of a bread bin.',
      damageFn: (c) => 12 + (golemLayer(c) === 'crystal' ? 4 : 0),
      effect(c) { hitPlayer(c, 12 + (golemLayer(c) === 'crystal' ? 4 : 0)); },
    },
    'candy-shards': {
      id: 'candy-shards', name: 'Candy Shards', intent: Intent.ATTACK, damage: 4, hits: 3,
      tell: 'Pieces of it come off on purpose.',
      damageFn: (c) => 4 + (golemLayer(c) === 'crystal' ? 4 : 0),
      effect(c) { hitPlayer(c, 4 + (golemLayer(c) === 'crystal' ? 4 : 0), 3); },
    },
    harden: {
      id: 'harden', name: 'Harden', intent: Intent.DEFEND, block: 14,
      tell: 'Everything about it goes glassy.',
      effect(c) { c.block(c.self, 14); },
    },
  },

  nextMove: (c) => {
    const now = golemLayer(c);
    const m = mem(c);
    if (m.layer !== now) { m.layer = now; return 'crack-apart'; }
    return cyc(['sugar-fist', 'candy-shards', 'harden'], (c.history || []).length);
  },

  /**
   * The Sugar Crystal is exposed: 25% more damage taken.
   *
   * `damageTakenMul` and not a `damageTakenFn` I invented — the engine reads a
   * MULTIPLIER here, which is the seam `sleeping-quarters.js`'s Wardrobe already
   * uses. A function name that nothing dispatches is silent, and silent is the
   * one failure mode this roster cannot afford: the whole third layer would
   * simply not have been a third layer.
   */
  damageTakenMul(c) { return golemLayer(c) === 'crystal' ? 1.25 : 1; },

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 2) h.notes.push('Courage +10%.');
    return h;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. BIG SCARE — The Pantry Poltergeist
// ─────────────────────────────────────────────────────────────────────────────
const OBJECTS = {
  'frying-pan': { id: 'frying-pan', name: 'Frying Pan', note: 'Its basic attack deals 4 more.' },
  'flour-sack': { id: 'flour-sack', name: 'Flour Sack', note: 'Every third turn it adds a Sticky.' },
  cleaver: { id: 'cleaver', name: 'Cleaver', note: 'Its multi-hit attack gains a hit.' },
  'mixing-bowl': { id: 'mixing-bowl', name: 'Mixing Bowl', note: 'It gains 3 more Guard whenever it Guards.' },
  'spice-tin': { id: 'spice-tin', name: 'Spice Tin', note: 'Its next damaging attack Frightens.' },
  'rolling-pin': { id: 'rolling-pin', name: 'Rolling Pin', note: 'After attacking, it gains 5 Guard.' },
};
const OBJECT_IDS = Object.keys(OBJECTS);

function held(c) { return (mem(c).objects ||= []); }
function possess(c) {
  const have = held(c);
  if (have.length >= 3) return null;
  const pool = OBJECT_IDS.filter(id => !have.includes(id));
  if (!pool.length) return null;
  const pick = pool[c.rng.int(pool.length)];
  have.push(pick);
  // `stack: true` so three objects show as three rules. Without it each new
  // possession would clear the previous one, and the whole fight is reading
  // which combination is currently live.
  c.announceRule({ id: `obj-${pick}`, name: OBJECTS[pick].name, text: OBJECTS[pick].note, stack: true });
  return pick;
}

export const pantryPoltergeist = {
  id: 'pantry-poltergeist',
  name: 'The Pantry Poltergeist',
  region: REGION,
  tier: 'elite',
  role: 'variable',
  hp: [108, 108],
  silhouette: 'swarm',
  palette: ['#d8d2c4', '#9a9184', '#403a33'],
  shape: { body: 'floating', limbs: 0, eyes: 0 },
  scale: 1.25,
  lore: 'You cannot see it. You can see the pans, the jars, the sacks and the knives, and where they are going.',

  onSpawn(c) { for (let i = 0; i < 3; i++) possess(c); },

  moves: {
    'throw-something': {
      id: 'throw-something', name: 'Throw Something', intent: Intent.ATTACK, damage: 8, hits: 1,
      tellFn: (c) => {
        const o = held(c)[0];
        return o ? `The ${OBJECTS[o].name} comes off the shelf first.` : 'Something comes off the shelf.';
      },
      tell: 'Something comes off the shelf.',
      damageFn: (c) => 8 + (held(c)[0] === 'frying-pan' ? 4 : 0),
      hitsFn: (c) => (held(c)[0] === 'cleaver' ? 2 : 1),
      appliesFn: (c) => (held(c)[0] === 'spice-tin'
        ? [{ id: 'frightened', stacks: 1, to: 'player' }] : []),
      effect(c) {
        const have = held(c);
        const o = have.shift();
        let dmg = 8;
        if (o === 'frying-pan') dmg += 4;
        if (o === 'cleaver') { hitPlayer(c, dmg, 2); }
        else hitPlayer(c, dmg);
        if (o === 'flour-sack') c.addCard('status/sticky', 'discard');
        if (o === 'mixing-bowl') c.block(c.self, 3);
        if (o === 'spice-tin') c.applyStatus(c.player, 'frightened', 1);
        if (o === 'rolling-pin') c.block(c.self, 5);
      },
    },
    'kitchen-storm': {
      id: 'kitchen-storm', name: 'Kitchen Storm', intent: Intent.ATTACK, damage: 3, hits: 3,
      tell: 'Everything that is not nailed down goes up at once.',
      damageFn: (c) => 3 + (held(c).includes('frying-pan') ? 4 : 0),
      hitsFn: (c) => 3 + (held(c).includes('cleaver') ? 1 : 0),
      appliesFn: (c) => (held(c).includes('spice-tin')
        ? [{ id: 'frightened', stacks: 1, to: 'player' }] : []),
      effect(c) {
        const have = held(c);
        hitPlayer(c, 3 + (have.includes('frying-pan') ? 4 : 0), 3 + (have.includes('cleaver') ? 1 : 0));
        if (have.includes('rolling-pin')) c.block(c.self, 5);
        if (have.includes('spice-tin')) c.applyStatus(c.player, 'frightened', 1);
      },
    },
    'possess-another': {
      id: 'possess-another', name: 'Possess Another', intent: Intent.BUFF,
      tell: 'Something else on the shelf starts moving.',
      effect(c) { possess(c); },
    },
    'cupboard-slam': {
      id: 'cupboard-slam', name: 'Cupboard Slam', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'Every cupboard door in the room shuts at the same moment.',
      effect(c) {
        hitPlayer(c, 11);
        if (held(c).includes('rolling-pin')) c.block(c.self, 5);
      },
    },
    ransack: {
      id: 'ransack', name: 'Ransack', intent: Intent.DEFEND, block: 10,
      tell: 'It pulls the whole pantry in around itself.',
      effect(c) {
        c.block(c.self, 10 + (held(c).includes('mixing-bowl') ? 3 : 0));
        possess(c);
      },
    },
  },

  nextMove: (c) => cyc(
    ['throw-something', 'kitchen-storm', 'possess-another', 'cupboard-slam', 'ransack'],
    (c.history || []).length),

  hauntScaling(level) {
    const h = hauntBase(level, 'elite');
    if (level >= 2) h.notes.push('Courage +10%.');
    if (level >= 5) h.notes.push('Haunt 5: it never drops below two objects.');
    return h;
  },
};

export const KITCHENS_CELLARS_ENEMIES = [
  doughBlob, doughling, jamJar, kitchenImp, candyClump, pantryMimic, risingBatter,
  crustBeast, caramelCreeper, cutleryDevil, brittleCandyBeast, cakeThing,
  ovenMaw, sugarGolem, pantryPoltergeist,
];
