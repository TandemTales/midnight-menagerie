/**
 * The Head Gardener — the Impossible Greenhouse boss. OWNER: enemies.
 * Source of truth: docs/design/regions/05-greenhouse.md §16–§27.
 *
 * "The Head Gardener believes every living thing has a correct place and
 * correct shape. Its philosophy is: anything can thrive if properly cultivated.
 * The problem is that it decides what thriving means."
 *
 * Brambleboo's opposite number, and the same argument the Keeper makes twelve
 * wings later with the word "safe" swapped for the word "correct".
 *
 * ── THE GARDEN IS THE FIGHT ─────────────────────────────────────────────────
 *
 * Three Beds. It sows Seeds; Seeds mature into plants; each plant does one
 * legible thing to the player. §20 is explicit that there must be NO
 * universally correct plant priority — a defensive deck tolerates the Thorn
 * Bush, a cheap-Trick deck hates the Binding Vine, a slow deck minds the Moon
 * Bloom most. So the answer is a property of the deck, which is what makes it
 * a decision rather than a lookup.
 *
 * And then §22 turns it round: PRUNE THE WEAK lets the boss eat its own garden
 * for permanent damage. The player cannot simply assume that everything the
 * gardener planted should be left alone because the gardener wants it.
 *
 * Seeds and plants are real actors, because the player has to be able to spend
 * a card on one. `Uproot` (§21) is the reason a Bed remembers being emptied:
 * removing a plant denies the space as well as the effect.
 */

import { Intent } from '../schema.js';
import {
  mem, cnt, setCnt, addCnt, allies, cyc, hitPlayer, hauntBase, bossDmg, flag, isAlive, phaseAt,
} from '../enemies/_lib.js';

const REGION = 'greenhouse';
const SOLO_MAX = 320;
const PHASE_TWO_AT = 180;
const COLLAPSE_AT = 70;

/** Each Seed, what it becomes, and the one thing that plant does. */
const SEEDS = {
  thorn: { seed: 'thorn-seed', plant: 'thorn-bush', name: 'Thorn Seed' },
  vine: { seed: 'vine-seed', plant: 'binding-vine', name: 'Vine Seed' },
  bloom: { seed: 'bloom-seed', plant: 'moon-bloom', name: 'Bloom Seed' },
};
const SEED_KEYS = Object.keys(SEEDS);

function punch(c) { return 2 * cnt(c, 'cultivated') + 2 * cnt(c, 'overgrown') + bossDmg(c); }

/* ══ Seeds ═══════════════════════════════════════════════════════════════════
 * A Seed does nothing but count down, and the count is on its own plate. It
 * matures in its own `onTurnEnd` so a Gardener that has died cannot leave a
 * Seed frozen mid-clock.
 */
function seedDef({ id, name, hp, becomes, palette, lore }) {
  return {
    id, name, region: REGION, tier: 'boss', role: 'bossPart',
    hp: [hp, hp],
    silhouette: 'seed',
    palette,
    shape: { body: 'squat', limbs: 0, eyes: 0 },
    scale: 0.35,
    summonOnly: true,
    remnant: true,
    seed: true,
    becomes,
    lore,

    onSpawn(c) { setCnt(c, 'sprouting', mem(c).timer ?? 2); },

    onTurnEnd(c) {
      const m = mem(c);
      m.timer = Math.max(0, (m.timer ?? 2) - 1);
      setCnt(c, 'sprouting', m.timer);
      if (m.timer > 0) return;
      const grown = c.summon(becomes, {});
      if (grown) (grown.mem ||= {}).bed = m.bed;
      c.say(`Something comes up in the ${m.bed || 'bed'}.`, 'warn');
      c.despawn(c.self);
    },

    /** Uprooting a Seed denies its Bed too (§21). */
    onDeath(c) { uproot(c, mem(c).bed); },

    moves: {
      sprout: {
        id: 'sprout', name: 'Sprout', intent: Intent.SLEEP,
        tell: 'It is a seed. It is doing exactly one thing.',
        effect() { /* the clock is in onTurnEnd */ },
      },
    },
    nextMove: () => 'sprout',
    hauntScaling: (level) => hauntBase(level, 'boss'),
  };
}

export const thornSeed = seedDef({
  id: 'thorn-seed', name: 'Thorn Seed', hp: 8, becomes: 'thorn-bush',
  palette: ['#7a4a2a', '#b8814f', '#33200f'],
  lore: 'A seed with a hook on it, already trying to catch something.',
});
export const vineSeed = seedDef({
  id: 'vine-seed', name: 'Vine Seed', hp: 10, becomes: 'binding-vine',
  palette: ['#3f7a45', '#79b874', '#1c3a1e'],
  lore: 'A seed with a tail of root already out of it, feeling for a direction.',
});
export const bloomSeed = seedDef({
  id: 'bloom-seed', name: 'Bloom Seed', hp: 9, becomes: 'moon-bloom',
  palette: ['#5c5a8f', '#a3a0d4', '#25243f'],
  lore: 'A pale seed that is faintly, unhelpfully, giving off light.',
});

/* ══ Mature plants ══════════════════════════════════════════════════════════ */
function plantDef({ id, name, palette, lore, hooks }) {
  return {
    id, name, region: REGION, tier: 'boss', role: 'bossPart',
    hp: [16, 16],
    silhouette: 'plant',
    palette,
    shape: { body: 'tall-thin', limbs: 0, eyes: 0 },
    scale: 0.5,
    summonOnly: true,
    remnant: true,
    plant: true,
    lore,
    ...hooks,
    /**
     * DEFINED AFTER `...hooks`, and that is the bug this line is.
     *
     * It was defined before the spread, so the Binding Vine — the one plant
     * with an `onDeath` of its own, to clear its rule card — REPLACED it, and
     * killing a Binding Vine Uprooted nothing. Found by the control in
     * `tests/greenhouse/check.py`, which kills a plant and asks the Bed.
     * Every plant's own hook still runs: it is called first, from here.
     */
    onDeath(c) {
      try { hooks && hooks.onDeath && hooks.onDeath(c); } catch (err) { console.error(err); }
      uproot(c, mem(c).bed);
      // §27: below 70 Courage the garden is wired to the gardener.
      const boss = gardener(c);
      if (boss && boss.hp <= phaseAt({ self: boss }, COLLAPSE_AT, SOLO_MAX)) {
        c.loseHp(boss, 4);
        c.say('The Gardener feels that one.', 'good');
      }
    },
    moves: {
      stand: {
        id: 'stand', name: 'Stand', intent: Intent.SLEEP,
        tell: 'It grows. It does not need to do anything else.',
        effect() {},
      },
    },
    nextMove: () => 'stand',
    hauntScaling: (level) => hauntBase(level, 'boss'),
  };
}

export const thornBush = plantDef({
  id: 'thorn-bush', name: 'Thorn Bush',
  palette: ['#8a5230', '#c98b58', '#39230f'],
  lore: 'Waist high and entirely hostile to the idea of anyone reaching past it.',
  hooks: {
    /** First Attack each player turn costs 2 Courage. Once per Bush per turn. */
    onPlayerTurnStart(c) { mem(c).spent = false; },
    onCardPlayed(c) {
      if (mem(c).spent) return;
      const card = c.card;
      if (!card || card.type !== 'attack') return;
      mem(c).spent = true;
      c.loseHp(c.player, 2);
    },
  },
});

export const bindingVine = plantDef({
  id: 'binding-vine', name: 'Binding Vine',
  palette: ['#356b3c', '#6fae6a', '#16301a'],
  lore: 'It has already worked out which of your hands you favour.',
  hooks: {
    /**
     * "One random Trick in hand costs 1 additional Nerve that turn. The marked
     * Trick is shown immediately." (§18.) It marks at `onPlayerReady`, because
     * that is the only moment there IS a hand — `onPlayerTurnStart` fires
     * before the deal.
     */
    onPlayerReady(c) {
      const hand = c.cardsIn ? c.cardsIn('hand') : [];
      if (!hand.length) return;
      const pick = hand[c.rng.int(hand.length)];
      c.player._boundUid = pick.uid;
      c.applyStatus(c.player, 'bound-trick', 1);
      c.announceRule({
        id: `bound:${c.self.id}`, name: `Bound: ${pick.name}`,
        text: 'The Binding Vine has hold of this one. It costs 1 additional Nerve this turn.',
      });
    },
    onDeath(c) { c.clearRules(`bound:${c.self.id}`); },
  },
});

export const moonBloom = plantDef({
  id: 'moon-bloom', name: 'Moon Bloom',
  palette: ['#6a68a8', '#b9b6e6', '#2a2947'],
  lore: 'It opens at the wrong time of day and the Gardener stands a little straighter near it.',
  hooks: {
    onTurnEnd(c) {
      const boss = gardener(c);
      if (boss) c.heal(boss, 5);
    },
  },
});

function gardener(c) { return allies(c).find(a => isAlive(a) && a.defId === 'head-gardener') || null; }

/**
 * §21, Uproot. The Bed a plant came out of is denied until the end of the
 * Gardener's next turn, so removing something buys space as well as quiet.
 * Stored on the GARDENER, because the Bed outlives whatever was in it.
 */
function uproot(c, bed) {
  const boss = gardener(c);
  if (!boss || !bed) return;
  const bm = (boss.mem ||= {});
  (bm.uprooted ||= {})[bed] = 2;
}

// ═════════════════════════════════════════════════════════════════════════════
// The Head Gardener
// ═════════════════════════════════════════════════════════════════════════════
const BEDS = ['Left Bed', 'Center Bed', 'Right Bed'];

export const headGardener = {
  id: 'head-gardener',
  name: 'The Head Gardener',
  region: REGION,
  tier: 'boss',
  role: 'boss',
  hp: [SOLO_MAX, SOLO_MAX],
  silhouette: 'gardener',
  palette: ['#6d6f4a', '#b9ba86', '#2b2c1c'],
  shape: { body: 'tall-thin', limbs: 4, eyes: 0 },
  scale: 1.55,
  lore: 'Gardening aprons stitched into a coat, a cracked porcelain mask, one hand of pruning shears and one of watering can. Roots have come up through its boots.',

  onSpawn(c) {
    mem(c).phase = 1;
    mem(c).uprooted = {};
    announceGarden(c);
  },

  onTurnEnd(c) {
    const m = mem(c);
    for (const b of Object.keys(m.uprooted || {})) {
      m.uprooted[b] = Math.max(0, m.uprooted[b] - 1);
      if (!m.uprooted[b]) delete m.uprooted[b];
    }
    // §25: phase two banks Overgrown when every Bed holds a mature plant.
    if (m.phase === 2) {
      if (plants(c).length >= 3) addCnt(c, 'overgrown', 1, 3);
      else setCnt(c, 'overgrown', cnt(c, 'overgrown'));
    }
    announceGarden(c);
  },

  moves: {
    /* ── phase one (§20) ─────────────────────────────────────────────────── */
    sow: {
      id: 'sow', name: 'Sow', intent: Intent.SUMMON, block: 5,
      tell: 'It presses something into an empty bed with its thumb.',
      effect(c) { c.block(c.self, 5); plant(c); },
    },
    'pruning-shears': {
      id: 'pruning-shears', name: 'Pruning Shears', intent: Intent.ATTACK, damage: 12, hits: 1,
      damageFn: (c) => 12 + punch(c),
      tell: 'The shear-hand opens.',
      effect(c) { hitPlayer(c, 12 + punch(c)); },
    },
    'water-the-beds': {
      id: 'water-the-beds', name: 'Water the Beds', intent: Intent.BUFF,
      tell: 'The watering-can hand tips, and everything in the beds drinks.',
      effect(c) {
        for (const s of seeds(c)) { (s.mem ||= {}).timer = Math.max(0, (s.mem.timer ?? 2) - 1); }
        for (const p of plants(c)) c.block(p, 5);
      },
    },
    'rake-the-floor': {
      id: 'rake-the-floor', name: 'Rake the Floor', intent: Intent.ATTACK, damage: 5, hits: 2,
      damageFn: (c) => 5 + punch(c) + Math.min(6, 2 * occupied(c)),
      tell: 'It drags something metal across the whole width of the room.',
      /**
       * §20 gives the extra only to the SECOND hit. An intent is damage x hits
       * and cannot say "5 then 11", so both hits carry it and the total on
       * screen is the total delivered. Same call the Kitchens made for the
       * Whisk and the Heart made for Stay Where I Can See You: the promise
       * beats the nicety.
       */
      effect(c) { hitPlayer(c, 5 + punch(c) + Math.min(6, 2 * occupied(c)), 2); },
    },
    'prune-the-weak': {
      id: 'prune-the-weak', name: 'Prune the Weak', intent: Intent.BUFF,
      tell: 'It looks over its own garden, and decides something is not thriving.',
      effect(c) {
        const s = seeds(c).sort((a, b) => (a.mem?.timer ?? 9) - (b.mem?.timer ?? 9))[0];
        const victim = s || plants(c).sort((a, b) => a.hp - b.hp)[0];
        if (!victim) { c.block(c.self, 8); return; }
        c.say(`It prunes its own ${victim.name}.`, 'warn');
        c.loseHp(victim, victim.hp + 5);
        addCnt(c, 'cultivated', 1, 4);
        announceGarden(c);
      },
    },

    /* ── the turn (§23) ──────────────────────────────────────────────────── */
    'let-nature-take-its-course': {
      id: 'let-nature-take-its-course', name: 'Let Nature Take Its Course', intent: Intent.BUFF,
      tell: 'It puts the shears down.',
      effect(c) {
        mem(c).phase = 2;
        mem(c).uprooted = {};
        for (const s of seeds(c)) c.despawn(s);
        // Every empty Bed fills at once, and a Wild Seed matures immediately —
        // so the same plant can now appear more than once (§24).
        const free = 3 - plants(c).length;
        for (let i = 0; i < free; i++) {
          const key = SEED_KEYS[c.rng.int(SEED_KEYS.length)];
          const p = c.summon(SEEDS[key].plant, {});
          if (p) (p.mem ||= {}).bed = BEDS[plants(c).length - 1] || BEDS[i];
        }
        c.say('It stops arranging things.', 'warn');
        announceGarden(c);
      },
    },

    /* ── phase two (§26) ─────────────────────────────────────────────────── */
    'thorned-shears': {
      id: 'thorned-shears', name: 'Thorned Shears', intent: Intent.ATTACK, damage: 14, hits: 1,
      damageFn: (c) => 14 + punch(c) + (has(c, 'thorn-bush') ? 3 : 0),
      tell: 'The shears have grown thorns of their own.',
      effect(c) { hitPlayer(c, 14 + punch(c) + (has(c, 'thorn-bush') ? 3 : 0)); },
    },
    'root-sweep': {
      id: 'root-sweep', name: 'Root Sweep', intent: Intent.ATTACK, damage: 6, hits: 3,
      damageFn: (c) => 6 + punch(c) + (has(c, 'binding-vine') ? 1 : 0),
      tell: 'Three roots, in order, across the floor.',
      effect(c) { hitPlayer(c, 6 + punch(c) + (has(c, 'binding-vine') ? 1 : 0), 3); },
    },
    'water-everything': {
      id: 'water-everything', name: 'Water Everything', intent: Intent.DEFEND, block: 8,
      tell: 'It waters the whole room, including the parts that are not plants.',
      effect(c) {
        for (const p of plants(c)) c.heal(p, 6);
        c.block(c.self, 8);
        c.heal(c.self, has(c, 'moon-bloom') ? 4 : 0);
      },
    },
    'scatter-seed': {
      id: 'scatter-seed', name: 'Scatter Seed', intent: Intent.SUMMON,
      tell: 'It stops aiming and simply throws.',
      effect(c) {
        const free = 3 - (plants(c).length + seeds(c).length);
        for (let i = 0; i < free; i++) plant(c, { wild: true });
      },
    },
    'the-greenhouse-takes-you': {
      id: 'the-greenhouse-takes-you', name: 'The Greenhouse Takes You',
      intent: Intent.ATTACK_BIG, damage: 22, hits: 1,
      /* "Each mature plant triggers its effect one additional time." (§25.)
         The Thorn Bush's half of that is DAMAGE, so it has to be inside the
         number on the intent — dealt separately it was 22 promised and 24
         delivered, which the intent-truth audit scored as a lie and was right
         to. The Moon Bloom's half is the boss healing and belongs in `effect`,
         because an intent says nothing about an enemy's own Courage. */
      damageFn: (c) => 22 + punch(c) + 2 * plants(c).filter(p => p.defId === 'thorn-bush').length,
      tell: 'Everything in the room leans in at once.',
      effect(c) {
        const thorns = plants(c).filter(p => p.defId === 'thorn-bush').length;
        hitPlayer(c, 22 + punch(c) + 2 * thorns);
        for (const p of plants(c)) if (p.defId === 'moon-bloom') c.heal(c.self, 5);
        setCnt(c, 'overgrown', 0);
        announceGarden(c);
      },
    },
  },

  nextMove: (c) => {
    const m = mem(c);
    const two = phaseAt(c, PHASE_TWO_AT, SOLO_MAX);
    if ((m.phase || 1) === 1 && c.self.hp <= two) return 'let-nature-take-its-course';

    if (m.phase === 2) {
      if (cnt(c, 'overgrown') >= 3) return 'the-greenhouse-takes-you';
      return cyc(['scatter-seed', 'thorned-shears', 'water-everything', 'root-sweep'],
        (c.history || []).filter(x => x !== 'the-greenhouse-takes-you').length);
    }

    // Every fourth action is Prune the Weak (§22).
    const acted = (c.history || []).length;
    if (acted > 0 && acted % 4 === 3) return 'prune-the-weak';
    const seq = ['sow', 'pruning-shears', 'sow', 'water-the-beds', 'rake-the-floor'];
    const pick = cyc(seq, acted);
    // Sow becomes Cultivate when every Bed is full (§19); Water is that here.
    if (pick === 'sow' && occupied(c) >= 3) return 'water-the-beds';
    return pick;
  },

  hauntScaling(level) {
    const h = hauntBase(level, 'boss');
    if (level >= 1) h.notes.push('Courage +6%.');
    if (level >= 5) { h.flags.wildTriples = 1; h.notes.push('Haunt 5: Wild Growth may fill all three Beds with the same plant.'); }
    return h;
  },
};

function seeds(c) { return allies(c).filter(a => isAlive(a) && a.def?.seed); }
function plants(c) { return allies(c).filter(a => isAlive(a) && a.def?.plant); }
function occupied(c) { return seeds(c).length + plants(c).length; }
function has(c, defId) { return plants(c).some(p => p.defId === defId); }

/** Sow one Seed into a Bed that is neither occupied nor Uprooted (§19, §21). */
function plant(c, { wild = false } = {}) {
  const m = mem(c);
  const taken = new Set([...seeds(c), ...plants(c)].map(a => a.mem?.bed).filter(Boolean));
  const bed = BEDS.find(b => !taken.has(b) && !(m.uprooted || {})[b]);
  if (!bed) { c.block(c.self, 5); return null; }
  // "The Head Gardener prefers Seeds not already present." (§19.)
  const present = new Set([...seeds(c), ...plants(c)].map(a => a.defId));
  const pool = wild ? SEED_KEYS
    : (SEED_KEYS.filter(k => !present.has(SEEDS[k].seed) && !present.has(SEEDS[k].plant)) || SEED_KEYS);
  const keys = pool.length ? pool : SEED_KEYS;
  const key = keys[c.rng.int(keys.length)];
  const s = c.summon(SEEDS[key].seed, {});
  if (s) { (s.mem ||= {}).bed = bed; (s.mem).timer = 2; }
  announceGarden(c);
  return s;
}

function announceGarden(c) {
  const m = mem(c);
  const rows = [...seeds(c), ...plants(c)]
    .map(a => `${a.mem?.bed || '?'}: ${a.name}${a.def?.seed ? ` (${a.mem?.timer ?? 2})` : ''}`);
  const denied = Object.keys(m.uprooted || {});
  c.announceRule({
    id: `garden:${c.self.id}`,
    name: m.phase === 2
      ? `Wild Growth · Overgrown ${cnt(c, 'overgrown')} / 3`
      : `Garden Beds · Cultivated ${cnt(c, 'cultivated')}`,
    text: `${rows.join('. ') || 'Every Bed is empty.'}`
      + (denied.length ? ` Uprooted: ${denied.join(', ')}.` : '')
      + (m.phase === 2
        ? ' Every Bed full at the end of its turn banks 1 Overgrown; at 3, the room takes you for 22.'
        : ' Every fourth action it prunes one of its own and keeps the growth.'),
  });
}

export const GREENHOUSE_BOSSES = [
  headGardener,
  thornSeed, vineSeed, bloomSeed,
  thornBush, bindingVine, moonBloom,
];
