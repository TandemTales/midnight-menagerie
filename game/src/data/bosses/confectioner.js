/**
 * The Confectioner — the Kitchens and Cellars boss. OWNER: enemies.
 * Source of truth: docs/design/regions/04-kitchens-cellars.md §15–§25.
 *
 * Taffy's thematic opposite. Taffy changes because Taffy wants to; the
 * Confectioner changes things because it assumes transformation is improvement.
 * Nothing is finished until it becomes something new.
 *
 * ── THE RECIPE BOARD IS THE FIGHT ──────────────────────────────────────────
 *
 * Three slots in phase one, two in phase two, filled by its own moves. When the
 * last slot fills a Dish is plated, and what the Dish IS depends entirely on
 * what is on the board — three Sugar makes something that kills you, three Cream
 * makes something that will not die.
 *
 * The board is always visible and the player can spill the most recent
 * Ingredient by hurting it hard enough in one turn. That is the whole design
 * argument: this is a boss whose randomness the player is allowed to edit, so a
 * bad Recipe is a problem to solve rather than a roll to survive.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, flag, isAlive,
} from '../enemies/_lib.js';

const REGION = 'kitchens-cellars';

/** The five Ingredients, and what each one does to a Dish. */
export const INGREDIENTS = Object.freeze({
  dough: { id: 'dough', name: 'Dough', dish: '+8 max Courage', boss: 'gain 12 Guard' },
  jam: { id: 'jam', name: 'Jam', dish: 'its Nibble adds Sticky', boss: 'its next attack adds Sticky' },
  sugar: { id: 'sugar', name: 'Sugar', dish: '+3 damage per Sugar', boss: 'its next attack deals 5 more' },
  spice: { id: 'spice', name: 'Spice', dish: 'its Nibble Frightens', boss: 'its next attack Frightens' },
  cream: { id: 'cream', name: 'Cream', dish: '+4 Guard each turn', boss: 'recover 7 Courage' },
});
const ING_IDS = Object.keys(INGREDIENTS);

/* ── board helpers ────────────────────────────────────────────────────────
 * All state lives in `mem(c)`, which is per-instance. Nothing is written to the
 * def — the preview fork clones actors and their memory, and a def mutated
 * during a hover would leak the preview into the real fight.
 */
function board(c) { return (mem(c).recipe ||= []); }
function slots(c) { return mem(c).phase === 2 ? 2 : 3; }

/**
 * "Not currently the most common Ingredient on the board" — the design's own
 * guard against triple-anything arriving by accident at baseline difficulty.
 * At Haunt 3 the guard comes off, which is what makes a triple Sugar Dish a
 * thing a late-ladder player has to actually plan around.
 */
function pickIngredient(c) {
  const have = board(c);
  let pool = ING_IDS;
  if (!flag(c, 'anyIngredient')) {
    const counts = have.reduce((m, i) => { m[i] = (m[i] || 0) + 1; return m; }, {});
    const top = Math.max(0, ...Object.values(counts));
    if (top > 0) {
      const commonest = Object.keys(counts).filter(k => counts[k] === top);
      const filtered = ING_IDS.filter(i => !commonest.includes(i));
      if (filtered.length) pool = filtered;
    }
  }
  return pool[c.rng.int(pool.length)];
}

function addIngredient(c, id) {
  const have = board(c);
  const pick = id || pickIngredient(c);
  have.push(pick);
  announceBoard(c);
  if (have.length >= slots(c)) plate(c);
  return pick;
}

function announceBoard(c) {
  const have = board(c);
  const names = have.map(i => INGREDIENTS[i].name);
  c.announceRule({
    id: 'recipe',
    name: `Recipe ${have.length}/${slots(c)}`,
    text: names.join(' · ') || 'Nothing on the board yet.',
  });
}

/**
 * Complete the Recipe.
 *
 * ONE Dish ever. A second completed Recipe REPLATES the existing one rather than
 * summoning a second enemy — the design is explicit and it matters: two Dishes
 * plus the boss is three intents and a board the player cannot read, which is
 * the opposite of what this fight is for.
 */
function plate(c) {
  const recipe = board(c).slice();
  mem(c).recipe = [];

  // Phase two: the Confectioner keeps one Ingredient for itself and the Dish
  // gets the rest. Alternating which end it takes keeps it predictable.
  let mine = null, theirs = recipe;
  if (mem(c).phase === 2 && recipe.length) {
    const takeFirst = (mem(c).plated || 0) % 2 === 0;
    mine = takeFirst ? recipe[0] : recipe[recipe.length - 1];
    theirs = recipe.filter((_, i) => i !== (takeFirst ? 0 : recipe.length - 1));
    absorb(c, mine);
  }
  mem(c).plated = (mem(c).plated || 0) + 1;

  const existing = allies(c).find(a => isAlive(a) && a.defId === 'dish');
  if (existing) {
    c.say('It replates what is already out.', 'warn');
    applyRecipe(c, existing, theirs);
  } else {
    const dish = c.summon('dish', {});
    c.say('Something is plated.', 'warn');
    if (dish) applyRecipe(c, dish, theirs);
  }
  announceBoard(c);
}

/** Write a Recipe onto a Dish. Stored on the Dish's own memory. */
function applyRecipe(c, dish, recipe) {
  const dm = (dish.mem ||= {});
  dm.recipe = recipe.slice();
  const count = (id) => recipe.filter(i => i === id).length;
  const dough = count('dough');
  if (dough) {
    dish.maxHp += 8 * dough;
    dish.hp = Math.min(dish.maxHp, dish.hp + 8 * dough);
  }
  dm.jam = count('jam');
  dm.sugar = count('sugar');
  dm.spice = count('spice');
  dm.cream = count('cream');
}

/** A personal Ingredient. Consumed when it triggers. */
function absorb(c, id) {
  const m = mem(c);
  if (id === 'dough') { c.block(c.self, 12); return; }
  if (id === 'cream') { c.heal(c.self, 7); return; }
  m.personal = id;                        // jam / sugar / spice: spent on the next attack
  c.say(`It keeps the ${INGREDIENTS[id].name} for itself.`, 'warn');
}

/** Spend a held personal Ingredient on an attack that has just landed. */
function spendPersonal(c) {
  const m = mem(c);
  if (!m.personal) return;
  const id = m.personal;
  m.personal = null;
  if (id === 'jam') c.addCard('status/sticky', 'discard');
  if (id === 'spice') c.applyStatus(c.player, 'frightened', 1);
}
function personalBonus(c) { return mem(c).personal === 'sugar' ? 5 : 0; }
function offendedBonus(c) { return cnt(c, 'offended') > 0 ? 3 : 0; }

// ─────────────────────────────────────────────────────────────────────────────
// The Dish
// ─────────────────────────────────────────────────────────────────────────────
export const dish = {
  id: 'dish',
  name: 'The Dish',
  region: REGION,
  tier: 'normal',
  role: 'summon',
  hp: [38, 38],
  summonOnly: true,
  silhouette: 'plate',
  palette: ['#f2e3c8', '#d09a5a', '#5c3a22'],
  shape: { body: 'sprawling', limbs: 2, eyes: 2 },
  scale: 0.85,
  lore: 'Whatever was on the board, combined. It is very pleased to have been made.',

  onTurnStart(c) {
    const cream = (c.self.mem && c.self.mem.cream) || 0;
    if (cream) c.block(c.self, 4 * cream);
  },

  moves: {
    nibble: {
      id: 'nibble', name: 'Nibble', intent: Intent.ATTACK, damage: 7, hits: 1,
      tell: 'It takes a small, considered bite.',
      damageFn: (c) => 7 + 3 * ((c.self.mem && c.self.mem.sugar) || 0),
      effect(c) {
        const dm = c.self.mem || {};
        hitPlayer(c, 7 + 3 * (dm.sugar || 0));
        // Jam: one Sticky however many Jams, but MORE Jam changes where it lands
        // and what it costs. Stacking the same effect would have been a number;
        // this is a different problem each time.
        if (dm.jam >= 1) {
          if (dm.jam >= 3) c.addCard('status/sticky-caramel', 'draw');
          else if (dm.jam === 2) c.addCard('status/sticky', 'draw');
          else c.addCard('status/sticky', 'discard');
        }
        const n = (dm.nibbles = (dm.nibbles || 0) + 1);
        const spice = dm.spice || 0;
        if (spice >= 3 || (spice === 2 && n % 2 === 0) || (spice === 1 && n === 1)) {
          c.applyStatus(c.player, 'frightened', 1);
        }
      },
    },
    set: {
      id: 'set', name: 'Set', intent: Intent.DEFEND, block: 7,
      tell: 'It settles, and firms up.',
      effect(c) { c.block(c.self, 7); },
    },
  },

  nextMove: (c) => cyc(['nibble', 'set'], (c.history || []).length),
  hauntScaling: (level) => hauntBase(level, 'normal'),
};

// ─────────────────────────────────────────────────────────────────────────────
// The Confectioner
// ─────────────────────────────────────────────────────────────────────────────
export const confectioner = {
  id: 'confectioner',
  name: 'The Confectioner',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [305, 305],
  silhouette: 'chef',
  palette: ['#f5f0e6', '#c9a227', '#3b2f2a'],
  shape: { body: 'tall-thin', limbs: 6, eyes: 2 },
  scale: 1.5,
  lore: 'A porcelain smile above a flour-covered apron, and arms long enough to reach every countertop at once.',

  onSpawn(c) {
    mem(c).phase = 1;
    mem(c).recipe = [];
    // It starts mid-thought: one Ingredient is already down.
    addIngredient(c);
  },

  /**
   * The player's hand on the Recipe Board.
   *
   * 24 Courage in one player turn spills the most recent Ingredient, once per
   * turn. This is the agency clause — without it the Recipe is weather. With it,
   * "that third Sugar is unacceptable" becomes a thing you can do something
   * about, and a big turn buys board control as well as damage.
   */
  onPlayerTurnEnd(c) {
    if (!isAlive(c.self)) return;
    const m = mem(c);
    const lost = (m.hpAtTurnStart == null ? c.self.hp : m.hpAtTurnStart) - c.self.hp;
    m.hpAtTurnStart = c.self.hp;
    if (lost < 24) return;
    const have = board(c);
    if (!have.length) return;
    const spilled = have.pop();
    c.say(`${INGREDIENTS[spilled].name} is spilled.`, 'good');
    announceBoard(c);
  },

  onPlayerTurnStart(c) { mem(c).hpAtTurnStart = c.self.hp; },

  /** A destroyed Dish offends it: harder for a turn, but it cannot cook. */
  onAllyDeath(c) {
    if (!c.dead || c.dead.defId !== 'dish') return;
    if (mem(c).enough) return;                    // the phase change kills it silently
    setCnt(c, 'offended', 2);
    c.say('It is offended.', 'warn');
  },

  onTurnEnd(c) { if (cnt(c, 'offended') > 0) addCnt(c, 'offended', -1, 2, 0); },

  moves: {
    /* ── phase one ──────────────────────────────────────────────────────── */
    'add-ingredient': {
      id: 'add-ingredient', name: 'Add Ingredient', intent: Intent.BUFF, block: 6,
      tell: 'It reaches for something and sets it down on the board.',
      effect(c) { c.block(c.self, 6); if (!cnt(c, 'offended')) addIngredient(c); },
    },
    'sugar-hook': {
      id: 'sugar-hook', name: 'Sugar Hook', intent: Intent.ATTACK, damage: 11, hits: 1,
      tell: 'One long arm comes around with a hook on the end of it.',
      damageFn: (c) => 11 + personalBonus(c) + offendedBonus(c),
      effect(c) { hitPlayer(c, 11 + personalBonus(c) + offendedBonus(c)); spendPersonal(c); },
    },
    'taste-test': {
      id: 'taste-test', name: 'Taste Test', intent: Intent.ATTACK, damage: 5, hits: 2,
      tell: 'It tries a little of everything, including you.',
      damageFn: (c) => 5 + personalBonus(c) + offendedBonus(c),
      effect(c) {
        hitPlayer(c, 5 + personalBonus(c) + offendedBonus(c), 2);
        spendPersonal(c);
        const d = allies(c).find(a => isAlive(a) && a.defId === 'dish');
        if (d) c.heal(d, 5);
      },
    },
    'stir-everything': {
      id: 'stir-everything', name: 'Stir Everything', intent: Intent.BUFF,
      tell: 'It stirs whatever is nearest, briskly.',
      effect(c) {
        if (!cnt(c, 'offended')) addIngredient(c);
        const d = allies(c).find(a => isAlive(a) && a.defId === 'dish');
        if (d) c.block(d, 7);
      },
    },

    /* ── the turn ───────────────────────────────────────────────────────── */
    'enough-measuring': {
      id: 'enough-measuring', name: 'Enough Measuring', intent: Intent.BUFF,
      tell: 'It sweeps the whole board onto the floor. Something enormous starts bubbling behind it.',
      effect(c) {
        const m = mem(c);
        m.phase = 2;
        m.enough = true;
        m.recipe = [];
        const d = allies(c).find(a => isAlive(a) && a.defId === 'dish');
        if (d) c.despawn(d);                      // no Offended: it threw this one away
        m.enough = false;
        setCnt(c, 'offended', 0);
        announceBoard(c);
      },
    },

    /* ── phase two ──────────────────────────────────────────────────────── */
    'candy-cleaver': {
      id: 'candy-cleaver', name: 'Candy Cleaver', intent: Intent.ATTACK, damage: 15, hits: 1,
      tell: 'It brings something down that was never meant for this.',
      damageFn: (c) => 15 + personalBonus(c) + offendedBonus(c),
      effect(c) { hitPlayer(c, 15 + personalBonus(c) + offendedBonus(c)); spendPersonal(c); },
    },
    'whisking-frenzy': {
      id: 'whisking-frenzy', name: 'Whisking Frenzy', intent: Intent.ATTACK, damage: 4, hits: 4,
      tell: 'Every arm at once, far too fast to follow.',
      damageFn: (c) => 4 + personalBonus(c) + offendedBonus(c),
      effect(c) { hitPlayer(c, 4 + personalBonus(c) + offendedBonus(c), 4); spendPersonal(c); },
    },
    'toss-it-in': {
      id: 'toss-it-in', name: 'Toss It In', intent: Intent.BUFF, block: 5,
      tell: 'It does not measure this one.',
      effect(c) { c.block(c.self, 5); if (!cnt(c, 'offended')) addIngredient(c); },
    },
    'no-recipe-needed': {
      id: 'no-recipe-needed', name: 'No Recipe Needed', intent: Intent.BUFF,
      tell: 'It stops pretending there was ever a recipe.',
      effect(c) {
        if (cnt(c, 'offended')) return;
        const before = allies(c).filter(a => isAlive(a) && a.defId === 'dish').length;
        addIngredient(c);
        // If that completed the Recipe, the Dish acts immediately afterwards.
        const d = allies(c).find(a => isAlive(a) && a.defId === 'dish');
        if (d && !before) c.say('It is served straight away.', 'warn');
      },
    },
    'lick-the-spoon': {
      // Intent.BUFF: there is no HEAL in the schema, and a healing enemy reads
      // as a buff to a player deciding whether to race it.
      id: 'lick-the-spoon', name: 'Lick the Spoon', intent: Intent.BUFF,
      tell: 'It tastes its own work and approves.',
      effect(c) { c.heal(c.self, 8); },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    if (m.phase !== 2 && c.self.hp <= 170) return 'enough-measuring';
    if (m.phase === 2) {
      return cyc(['candy-cleaver', 'toss-it-in', 'whisking-frenzy', 'no-recipe-needed', 'lick-the-spoon'],
        (c.history || []).length);
    }
    return cyc(['add-ingredient', 'sugar-hook', 'stir-everything', 'taste-test', 'sugar-hook'],
      (c.history || []).length);
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +8%.');
    if (level >= 3) {
      h.flags.anyIngredient = 1;
      h.notes.push('Haunt 3: the Recipe may repeat an Ingredient freely. Triple Sugar is on the table.');
    }
    if (level >= 5) h.notes.push('Haunt 5: the spill threshold is unchanged, but it cooks faster.');
    return h;
  },
};

export const KITCHENS_CELLARS_BOSSES = [confectioner, dish];
