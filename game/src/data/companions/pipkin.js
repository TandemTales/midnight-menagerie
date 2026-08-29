/**
 * Pipkin, the Pumpkin Frog.  OWNER: companion-cards.
 * Spec: docs/design/companions/06-pipkin.md
 *
 * Height (Hop / Land) · The Patch (Plant / Harvest) · Plump (Deflate / Heavy Feet)
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE, RANDOM_ENEMY } = Target;
const SLUG = 'pipkin';
const N = U.N;
const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── Height ──────────────────────────────────────────────────────────────────
const HEIGHT = 'height', PLUMP = 'plump';
const height = (c) => U.res(c, HEIGHT);
function hop(c, n = 1) { const d = U.addRes(c, HEIGHT, n, 0, 3); if (d > 0) U.fire(c, 'hop', { n: d }); return d; }
/**
 * Land: spend all Height and resolve `fn(spent)`.  With 0 Height nothing happens.
 * Respects Higher Than It Looks, Double Landing and Boing Without End.
 */
function land(c, fn) {
  const h = height(c);
  if (h <= 0) return 0;
  const spent = Math.min(3, h + U.stacks(c, c.self, 'land-boost'));
  U.setRes(c, HEIGHT, 0, 0, 3);
  U.unapply(c, c.self, 'land-boost', U.stacks(c, c.self, 'land-boost'));
  fn(spent);
  if (U.stacks(c, c.self, 'double-land') > 0) { U.unapply(c, c.self, 'double-land', 1); fn(spent); }
  U.fire(c, 'land', { spent });
  if (U.stacks(c, c.self, 'pipkin/boing-without-end') > 0 && U.once(c, 'boing')) U.setRes(c, HEIGHT, U.stacks(c, c.self, 'pipkin/boing-without-end'), 0, 3);
  return spent;
}

// ── Plump / Heavy Feet ──────────────────────────────────────────────────────
const plump = (c) => U.res(c, PLUMP);
const maxPlump = (c) => (U.stacks(c, c.self, 'pipkin/bigger-than-the-doorway') > 0 ? 5 : 3);
const heavyAt = (c) => (U.stacks(c, c.self, 'pipkin/bigger-than-the-doorway') > 0 ? 4 : 3);
const heavyFeet = (c) => (plump(c) >= heavyAt(c) && U.stacks(c, c.self, 'pipkin/great-pumpkin-frog') === 0 && U.stacks(c, c.self, 'ignore-heavy-feet') === 0 ? 1 : 0);
/** dynamicCost for any Trick containing Hop. */
const hopCost = (base) => (c) => Math.max(0, base + heavyFeet(c) - (U.stacks(c, c.self, 'elastic-legs') > 0 ? 1 : 0));
function gainPlump(c, n) {
  const room = Math.max(0, maxPlump(c) - plump(c));
  const d = U.addRes(c, PLUMP, Math.min(n, room), 0, maxPlump(c));
  if (d > 0) U.fire(c, 'plump', { n: d, above3: plump(c) > 3 });
  return d;
}
function deflate(c, n) {
  if (plump(c) < n) return 0;
  U.addRes(c, PLUMP, -n, 0, 5);
  U.fire(c, 'deflate', { n });
  return n;
}

// ── The Patch ───────────────────────────────────────────────────────────────
const SEED = 'seed', SPROUT = 'sprout', PUMPKIN = 'pumpkin';
const patch = (c) => U.mm(c).patch;

/**
 * THE PATCH IS RENDERED NOW.
 *
 * It lives in `U.mm(c).patch` — a plain array of stages — and that is still the
 * source of truth every Trick, hook and test reads. What it never did was
 * appear anywhere the player could see it: `engine.objects` documents itself as
 * the home for "Plants, Plots, Pumpkins, Graves" and nothing drew it until
 * Brambleboo's Garden needed it, so Pipkin's whole signature mechanic has been
 * invisible since he shipped. Every Trick that says "for each Pumpkin" was
 * asking the player to count something the screen did not show.
 *
 * So the array is MIRRORED into `engine.objects`, one object per plot, keyed to
 * the seat (`data.seat`) exactly as `_renderPlayerCounters` filters on. The
 * array stays authoritative and the mirror is derived — the opposite way round
 * would mean rewriting every one of his cards, and the mirror can be rebuilt
 * from the array at any moment, which is what makes the safety-net sync below
 * cheap and total.
 */
const PATCH_KIND = 'patch';

/**
 * ONE object for the whole Patch, not one per plot.
 *
 * A plot per object was the first shape and the screenshot killed it: at three
 * plots the chips already covered Pipkin's portrait, and `patchCap` is SIX. It
 * was also the wrong model. Brambleboo's Plants each have an identity — a
 * Cultivar, its own growth, its own effect — so one chip each is information.
 * Pipkin's plots are interchangeable, and every Trick he owns reads a COUNT:
 * "[Harvest] 1", "for each Pumpkin", "if your Patch is full". So the chip
 * shows the counts, which is the number the player is actually being asked
 * about, and the breakdown rides in the tooltip.
 */
function patchObject(c) {
  const seat = c.self && c.self.id;
  return c.objectsOfKind(PATCH_KIND).find(o => o && o.data && o.data.seat === seat) || null;
}

/**
 * Make the object match the array. Idempotent, and cheap enough to call after
 * anything at all — which is the point: the array is mutated in nine places
 * including inline inside three card effects, and a mirror maintained by
 * remembering to update it at each of them is a mirror that goes stale.
 */
function syncPatch(c) {
  if (typeof c.objectsOfKind !== 'function') return;   // preview engines and bare ctxs
  const p = patch(c) || [];
  const seat = c.self && c.self.id;
  const obj = patchObject(c);

  if (!p.length) { if (obj) c.removeObject(obj.id); return; }

  const seeds = p.filter(x => x === SEED).length;
  const sprouts = p.filter(x => x === SPROUT).length;
  const pumpkins = p.filter(x => x === PUMPKIN).length;
  const cap = patchCap(c);
  const parts = [];
  if (pumpkins) parts.push(pumpkins + ' ripe');
  if (sprouts) parts.push(sprouts + ' sprouting');
  if (seeds) parts.push(seeds + ' seeded');
  const data = {
    seat, seeds, sprouts, pumpkins, count: p.length, cap,
    stateLabel: parts.join(' · '),
    desc: 'Your Patch. Seeds become Sprouts and Sprouts ripen into Pumpkins at the '
        + 'end of your turn; Harvest takes the Pumpkins.',
    tipDetail: pumpkins
      ? pumpkins + ' ripe and ready to Harvest.'
      : 'Nothing ripe yet — a Sprout becomes a Pumpkin at the end of your turn.',
  };
  if (!obj) c.addObject({ kind: PATCH_KIND, name: 'Patch', slot: 0, data });
  else c.updateObject(obj.id, data);
}
const patchCap = (c) => U.mm(c).patchCap;
const countStage = (c, st) => patch(c).filter(x => x === st).length;
function plant(c, n) {
  let added = 0;
  const p = patch(c);
  while (added < n && p.length < patchCap(c)) { p.push(SEED); added++; }
  if (added) { U.bump(c, 'plantedThisTurn', added); syncPatch(c); U.fire(c, 'plant', { n: added }); }
  return added;
}
/** Advance the earliest object of the given stage (or the earliest immature one). */
function advance(c, stage) {
  const p = patch(c);
  const i = stage ? p.indexOf(stage) : (p.indexOf(SPROUT) >= 0 ? p.indexOf(SPROUT) : p.indexOf(SEED));
  if (i < 0) return false;
  if (p[i] === SEED) p[i] = SPROUT;
  else if (p[i] === SPROUT) { p[i] = PUMPKIN; syncPatch(c); U.fire(c, 'ripen', {}); return true; }
  else return false;
  syncPatch(c);
  return true;
}
function regress(c) {
  const p = patch(c);
  const i = p.indexOf(PUMPKIN) >= 0 ? p.indexOf(PUMPKIN) : p.indexOf(SPROUT);
  if (i < 0) return false;
  p[i] = p[i] === PUMPKIN ? SPROUT : SEED;
  syncPatch(c);
  return true;
}
function removeOne(c, stage) {
  const p = patch(c); const i = p.indexOf(stage);
  if (i < 0) return false;
  p.splice(i, 1); syncPatch(c); return true;
}
/** Harvest up to n Pumpkins. Returns how many were actually taken. */
function harvest(c, n) {
  let took = 0;
  while (took < n && removeOne(c, PUMPKIN)) took++;
  if (took) { U.bump(c, 'harvested', took); syncPatch(c); U.fire(c, 'harvest', { n: took }); }
  return took;
}
/** One growth step: Sprouts ripen, Seeds sprout, all at once. */
function growthStep(c) {
  const p = patch(c);
  let ripened = 0;
  for (let i = 0; i < p.length; i++) { if (p[i] === SPROUT) { p[i] = PUMPKIN; ripened++; } else if (p[i] === SEED) p[i] = SEED + '*'; }
  for (let i = 0; i < p.length; i++) if (p[i] === SEED + '*') p[i] = SPROUT;
  syncPatch(c);
  if (ripened) U.fire(c, 'ripen', { n: ripened });
  return ripened;
}
function power(c, id, n, install) {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
}

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: 'height', name: 'Height', icon: 'height', desc: 'How far off the ground Pipkin has bounced. Land spends all of it at once. Unused Height disappears at the end of your turn.', min: 0, max: 3, start: 0 },
    { id: 'plump', name: 'Plump', icon: 'plump', desc: 'How round Pipkin is. Persists between turns. At maximum Plump, Heavy Feet makes Hop Tricks cost 1 more.', min: 0, max: 5, start: 0 },
  ]);
  const fake = () => U.trackerCtx(e, seat);
  // Player turn end ONLY — this used to run a growth step per enemy.
  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const steps = U.stacks(c, c.self, 'pipkin/moonlit-garden') > 0 ? 2 : 1;
    for (let i = 0; i < steps; i++) growthStep(c);
    // Height evaporates unless something is holding it up
    if (U.stacks(c, c.self, 'hang-time') === 0 && U.stacks(c, c.self, 'pipkin/spring-eternal') === 0) U.setRes(c, HEIGHT, 0, 0, 3);
  });
  U.onPlayerTurn(e, 'start', () => { s.played = 0; syncPatch(fake()); });
  /**
   * The safety net. Three of his Tricks reach into the array directly rather
   * than through the helpers above (Moonbeam on the Patch rewrites every entry
   * in place), so the mirror is rebuilt after any card resolves as well. It is
   * a diff against an array that is at most `patchCap` long, so this is
   * cheaper than remembering to be careful.
   */
  e.on('card:resolved', () => syncPatch(fake()));
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('land', 'leapfrog', (c) => {
  const s = U.mm(c);
  const ally = c.e.actor(s.leapfrogAlly);
  if (ally) c.giveBlock(ally, s.leapfrogGuard || 6);
  U.unapply(c, c.self, 'leapfrog', 1);
  s.leapfrogAlly = null;
});
U.onHook('harvest', 'pipkin/community-garden', (c) => {
  // First Harvest each turn only. `U.once` is the established per-turn guard.
  if (!U.once(c, 'communityGarden')) return;
  const friend = c.e.livingPlayers().find(pl => pl !== c.self);
  if (friend) c.giveBlock(friend, 7);
});
U.onHook('land', 'pipkin/fertile-footprints', (c) => { if (U.once(c, 'fertileFootprints')) plant(c, U.stacks(c, c.self, 'pipkin/fertile-footprints')); });
U.onHook('ripen', 'pipkin/prize-pumpkin', (c) => { if (U.once(c, 'prizePumpkin')) { const n = U.stacks(c, c.self, 'pipkin/prize-pumpkin'); U.nextTurn(c, (x) => U.energy(x, n)); } });
U.onHook('plump', 'pipkin/big-frog-energy', (c) => U.guard(c, 5 + (U.stacks(c, c.self, 'pipkin/big-frog-energy') - 1) * 2));
U.onHook('deflate', 'pipkin/big-frog-energy', (c) => { if (U.once(c, 'bigFrogDeflate')) U.empower(c, 8 + (U.stacks(c, c.self, 'pipkin/big-frog-energy') - 1) * 2); });
U.onHook('harvest', 'pipkin/garden-in-motion', (c) => { if (U.once(c, 'gardenInMotion')) { if (!advance(c, SEED)) plant(c, 1); } });
U.onHook('harvest', 'pipkin/great-pumpkin-frog', (c) => { if (U.once(c, 'gpfHarvest')) gainPlump(c, 1); });
U.onHook('deflate', 'pipkin/great-pumpkin-frog', (c) => { if (U.once(c, 'gpfDeflate')) plant(c, 1); });
U.onHook('harvest', 'pipkin/heirloom-seeds', (c, p) => { const t = U.bump(c, 'heirloom', p.n || 1); if (Math.floor(t / 2) > Math.floor((t - (p.n || 1)) / 2)) plant(c, 1); });
U.onHook('plump', 'pipkin/bigger-than-the-doorway', (c, p) => { if (p.above3) U.guard(c, 8 + (U.stacks(c, c.self, 'pipkin/bigger-than-the-doorway') - 1) * 3); });
U.onHook('harvest', 'pipkin/the-patch-fights-back', (c) => {
  if (!U.once(c, 'patchFightsBack')) return;
  const t = c.target || c.randomEnemy();
  U.tf(c).patchTarget = t;
  U.tf(c).patchDamage = 20 + (U.stacks(c, c.self, 'pipkin/the-patch-fights-back') - 1) * 6;
});
U.onHook('land', 'pipkin/the-patch-fights-back', (c) => {
  const f = U.tf(c);
  if (f.patchTarget && f.patchDamage) { U.hitAt(c, f.patchTarget, f.patchDamage); f.patchTarget = null; }
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'pipkin/tiny-tongue', name: 'Tiny Tongue', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'Faster than the eye. Shorter than you would hope.',
    nums: { d: 6 }, effect: eff(c => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'pipkin/leaf-umbrella', name: 'Leaf Umbrella', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'One rhubarb leaf, held with enormous seriousness.',
    nums: { b: 5 }, effect: eff(c => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'pipkin/puddle-hop', name: 'Puddle Hop', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['hop'],
    text: '[Hop]. Gain {b} Guard.',
    flavor: 'The splash is the point. The Height is a bonus.',
    nums: { b: 4 },
    effect: eff(c => { hop(c); U.guard(c, N(c).b); }),
    dynamicCost: hopCost(1),
    upgrade: { nums: { b: 6 } },
  },
  {
    id: 'pipkin/belly-drop', name: 'Belly Drop', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['land', 'height'],
    text: 'Deal {d} damage. [Land]: deal {m0} more for each [Height] spent.',
    flavor: 'Gravity does the difficult part.',
    nums: { d: 5, m0: 4 },
    effect: eff(c => { U.hit(c, N(c).d); land(c, (s) => U.hit(c, N(c).m0 * s)); }),
    upgrade: { nums: { d: 7, m0: 5 } },
  },
  {
    id: 'pipkin/plant-a-little-one', name: 'Plant a Little One', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['plant', 'seed'],
    text: '[Plant] {n} [Seed].',
    flavor: 'He pats the soil down afterwards. Every time.',
    nums: { n: 1 }, effect: eff(c => plant(c, N(c).n)), upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/puff-up', name: 'Puff Up', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['plump'],
    text: 'Gain {n} [Plump]. Gain {b} Guard.',
    flavor: 'Air in, dignity out.',
    nums: { n: 1, b: 4 },
    effect: eff(c => { gainPlump(c, N(c).n); U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 1, b: 7 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'pipkin/puddle-jumper', name: 'Puddle Jumper', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['hop'],
    text: 'Deal {d} damage. [Hop].',
    flavor: 'Attack and altitude in a single motion.',
    nums: { d: 6 },
    effect: eff(c => { U.hit(c, N(c).d); hop(c); }),
    dynamicCost: hopCost(1),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: 'pipkin/tongue-snap', name: 'Tongue Snap', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['height'],
    text: 'Deal {d} damage. If you have at least {m0} [Height], draw {n} Trick.',
    flavor: 'From up here he can see exactly which bit to aim at.',
    nums: { d: 8, m0: 2, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (height(c) >= N(c).m0) U.draw(c, N(c).n); }),
    upgrade: { nums: { d: 11, m0: 2, n: 1 } },
  },
  {
    id: 'pipkin/belly-bop', name: 'Belly Bop', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['plump'],
    text: 'Deal {d} damage, plus {m0} for each [Plump].',
    flavor: 'Mass times enthusiasm.',
    nums: { d: 6, m0: 3 },
    effect: eff(c => U.hit(c, N(c).d + N(c).m0 * plump(c))),
    upgrade: { nums: { d: 8, m0: 4 } },
  },
  {
    id: 'pipkin/pumpkin-pitch', name: 'Pumpkin Pitch', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['harvest', 'pumpkin'],
    text: 'Deal {d} damage. [Harvest] {n}: deal {m0} damage to another enemy, or to the same one if it is alone.',
    flavor: 'Overarm. Surprisingly good technique for a frog.',
    nums: { d: 8, n: 1, m0: 6 },
    effect: eff(c => { U.hit(c, N(c).d); if (harvest(c, N(c).n)) { const o = U.others(c); U.hitAt(c, o.length ? o[0] : c.target, N(c).m0); } }),
    upgrade: { nums: { d: 11, n: 1, m0: 8 } },
  },
  {
    id: 'pipkin/drop-in', name: 'Drop In', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['land', 'height'],
    text: 'Deal {d} damage to all enemies. [Land]: deal {m0} more to all enemies for each [Height] spent.',
    flavor: 'Uninvited, from above, into the middle of everyone.',
    nums: { d: 5, m0: 3 },
    effect: eff(c => { U.hitAll(c, N(c).d); land(c, (s) => U.hitAll(c, N(c).m0 * s)); }),
    upgrade: { nums: { d: 7, m0: 4 } },
  },
  {
    id: 'pipkin/seed-spit', name: 'Seed Spit', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['plant', 'seed'],
    text: 'Deal {d} damage. [Plant] {n} [Seed].',
    flavor: 'Offensive gardening.',
    nums: { d: 6, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); plant(c, N(c).n); }),
    upgrade: { nums: { d: 9, n: 1 } },
  },
  {
    id: 'pipkin/footstool-kick', name: 'Footstool Kick', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['hop', 'height', 'vanish'],
    text: 'Deal {d} damage. If you have 0 [Height], [Hop]. [Vanish].',
    flavor: 'He needed something to push off. The footstool volunteered.',
    nums: { d: 5 },
    effect: eff(c => { U.hit(c, N(c).d); if (height(c) === 0) hop(c); }),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'pipkin/squash-tackle', name: 'Squash Tackle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['deflate'],
    text: 'Deal {d} damage. You may [Deflate] {n} to gain {b} Guard.',
    flavor: 'He arrives round and leaves considerably less so.',
    nums: { d: 15, n: 1, b: 10 },
    effect: eff(c => { U.hit(c, N(c).d); if (deflate(c, N(c).n)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 19, n: 1, b: 12 } },
  },
  {
    id: 'pipkin/pocket-seeds', name: 'Pocket Seeds', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['plant', 'seed'],
    text: '[Plant] {n} [Seed]s.',
    flavor: 'Frogs do not have pockets. He manages anyway.',
    nums: { n: 2 }, effect: eff(c => plant(c, N(c).n)), upgrade: { nums: { n: 3 } },
  },
  {
    id: 'pipkin/damp-corner', name: 'Damp Corner', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['patch', 'seed', 'sprout'],
    text: 'Advance {n} [Patch] object by one stage.',
    flavor: 'The good corner. Everyone in the Patch wants the good corner.',
    nums: { n: 1 },
    effect: eff(c => { for (let i = 0; i < N(c).n; i++) advance(c); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/big-breath', name: 'Big Breath', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['plump'],
    text: 'Gain {n} [Plump]. Draw {m0} Trick.',
    flavor: 'Held for as long as it takes to look intimidating, then let out as a wheeze.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { gainPlump(c, N(c).n); U.draw(c, N(c).m0); }),
    upgrade: { nums: { n: 1, m0: 2 } },
  },
  {
    id: 'pipkin/soft-landing', name: 'Soft Landing', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['land', 'height'],
    text: 'Gain {b} Guard. [Land]: gain {m0} more Guard for each [Height] spent.',
    flavor: 'He tucks. It helps more than it should.',
    nums: { b: 6, m0: 5 },
    effect: eff(c => { U.guard(c, N(c).b); land(c, (s) => U.guard(c, N(c).m0 * s)); }),
    upgrade: { nums: { b: 8, m0: 6 } },
  },
  {
    id: 'pipkin/squat-low', name: 'Squat Low', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['plump'],
    text: 'Gain {b} Guard. Gain {m0} more if you have at least {n} [Plump].',
    flavor: 'Wide, low, and very hard to move.',
    nums: { b: 7, m0: 6, n: 2 },
    effect: eff(c => U.guard(c, N(c).b + (plump(c) >= N(c).n ? N(c).m0 : 0))),
    upgrade: { nums: { b: 9, m0: 8, n: 2 } },
  },
  {
    id: 'pipkin/hopscotch', name: 'Hopscotch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['hop', 'height'],
    text: '[Hop]. Draw {n} Trick. If this brings you to 3 [Height], gain {b} Guard.',
    flavor: 'Chalk squares. Invisible rules. Absolute commitment.',
    nums: { n: 1, b: 5 },
    effect: eff(c => { hop(c); U.draw(c, N(c).n); if (height(c) === 3) U.guard(c, N(c).b); }),
    dynamicCost: hopCost(1),
    upgrade: { nums: { n: 2, b: 5 } },
  },
  {
    id: 'pipkin/weed-the-patch', name: 'Weed the Patch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['patch', 'seed', 'sprout', 'vanish'],
    text: 'Remove one [Seed] or [Sprout] from your [Patch]. Gain {b} Guard and draw {n} Trick. [Vanish].',
    flavor: 'Difficult decisions, made quickly, with a trowel.',
    nums: { b: 4, n: 1 },
    effect: eff(c => { if (!removeOne(c, SPROUT)) removeOne(c, SEED); U.guard(c, N(c).b); U.draw(c, N(c).n); }),
    upgrade: { nums: { b: 7, n: 1 } },
  },
  {
    id: 'pipkin/pick-one', name: 'Pick One', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['harvest', 'vanish'],
    text: '[Harvest] {m0}: gain {n} Nerve. [Vanish].',
    flavor: 'The biggest one. Obviously the biggest one.',
    nums: { m0: 1, n: 1 },
    effect: eff(c => { if (harvest(c, N(c).m0)) U.energy(c, N(c).n); }),
    upgrade: { nums: { m0: 1, n: 2 } },
  },
  {
    id: 'pipkin/scatter-on-landing', name: 'Scatter on Landing', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['plant', 'land', 'height', 'seed'],
    text: '[Plant] {n} [Seed]. [Land]: [Plant] {m0} more if you spent at least {m1} [Height].',
    flavor: 'The impact does the sowing.',
    nums: { n: 1, m0: 1, m1: 2 },
    effect: eff(c => { plant(c, N(c).n); land(c, (s) => { if (s >= N(c).m1) plant(c, N(c).m0); }); }),
    upgrade: { nums: { n: 2, m0: 1, m1: 2 } },
  },
  {
    id: 'pipkin/hold-your-croak', name: 'Hold Your Croak', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['retain'],
    text: '[Retain] another Trick in your hand. It costs {n} less next turn.',
    flavor: 'He is holding it in. You can see him holding it in.',
    nums: { n: 1 },
    effect: eff(async c => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Retain a Trick' }); if (k) { U.retain(c, k); const d = N(c).n; U.nextTurn(c, (x) => U.costMod(x, k, -d, 'turn')); } }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/mud-nap', name: 'Mud Nap', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['height', 'plump'],
    text: 'Gain {b} Guard. If you end the turn at 0 [Height], gain {n} [Plump] at the start of your next turn.',
    flavor: 'Cold, wet, and exactly right.',
    nums: { b: 8, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); const n = N(c).n; U.atTurnEnd(c, (x) => { if (height(x) === 0) U.nextTurn(x, (y) => gainPlump(y, n)); }); }),
    upgrade: { nums: { b: 11, n: 1 } },
  },
  {
    id: 'pipkin/little-harvest', name: 'Little Harvest', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['harvest'],
    text: 'Draw {n} Trick. [Harvest] {m0}: draw {m1} additional Trick.',
    flavor: 'A modest yield, taken personally.',
    nums: { n: 1, m0: 1, m1: 1 },
    effect: eff(c => { U.draw(c, N(c).n); if (harvest(c, N(c).m0)) U.draw(c, N(c).m1); }),
    upgrade: { nums: { n: 2, m0: 1, m1: 1 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (14) ──────────────────────────────────────────────────────────
  {
    id: 'pipkin/cannonball', name: 'Cannonball', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['land', 'height', 'deflate', 'plump'],
    text: 'Deal {d} damage. [Land]: deal {m0} more for each [Height] spent. If you spent 3 Height with at least {m1} [Plump], you may [Deflate] 1 to gain {b} Guard.',
    flavor: 'Knees to chest. Eyes shut. Everyone else gets wet.',
    nums: { d: 14, m0: 6, m1: 2, b: 14 },
    effect: eff(c => { U.hit(c, N(c).d); land(c, (s) => { U.hit(c, N(c).m0 * s); if (s >= 3 && plump(c) >= N(c).m1 && deflate(c, 1)) U.guard(c, N(c).b); }); }),
    upgrade: { nums: { d: 18, m0: 7, m1: 2, b: 18 } },
  },
  {
    id: 'pipkin/tongue-from-above', name: 'Tongue from Above', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['land', 'height', 'plant', 'seed'],
    text: 'Deal {d} damage. [Land]: if at least {n} [Height] was spent, draw {m0} Trick and [Plant] {m1} [Seed].',
    flavor: 'Descending, tongue first, entirely on purpose.',
    nums: { d: 8, n: 2, m0: 1, m1: 1 },
    effect: eff(c => { U.hit(c, N(c).d); land(c, (s) => { if (s >= N(c).n) { U.draw(c, N(c).m0); plant(c, N(c).m1); } }); }),
    upgrade: { nums: { d: 11, n: 2, m0: 1, m1: 1 } },
  },
  {
    id: 'pipkin/pumpkin-bowling', name: 'Pumpkin Bowling', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['harvest'],
    text: 'Deal {d} damage. [Harvest] {n}: deal {m0} damage to all other enemies, or add it to the target if it is alone.',
    flavor: 'Strike. Every single time. Nobody knows how.',
    nums: { d: 16, n: 1, m0: 9 },
    effect: eff(c => { U.hit(c, N(c).d); if (harvest(c, N(c).n)) { const o = U.others(c); if (o.length) for (const t of o) U.hitAt(c, t, N(c).m0); else U.hit(c, N(c).m0); } }),
    upgrade: { nums: { d: 20, n: 1, m0: 11 } },
  },
  {
    id: 'pipkin/seed-slam', name: 'Seed Slam', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['plant', 'patch', 'seed'],
    text: 'Deal {d} damage. [Plant] {n} [Seed]. If the [Patch] is full, advance one object instead.',
    flavor: 'Pressed into the floorboards with real force.',
    nums: { d: 8, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (plant(c, N(c).n) === 0) advance(c); }),
    upgrade: { nums: { d: 11, n: 1 } },
  },
  {
    id: 'pipkin/lily-pad-lariat', name: 'Lily Pad Lariat', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['height'],
    text: 'Deal {d} damage {n} times. If you have [Height], the second hit may strike another enemy and grants {b} Guard.',
    flavor: 'The tongue goes round twice. Do not ask about the physics.',
    nums: { d: 5, n: 2, hits: 2, b: 5 },
    effect: eff(c => { U.hit(c, N(c).d); const o = U.others(c); if (height(c) > 0 && o.length) { U.hitAt(c, o[0], N(c).d); U.guard(c, N(c).b); } else { U.hit(c, N(c).d); if (height(c) > 0) U.guard(c, N(c).b); } }),
    upgrade: { nums: { d: 7, n: 2, hits: 2, b: 6 } },
  },
  {
    id: 'pipkin/three-hop-combo', name: 'Three Hop Combo', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['land', 'height'],
    text: 'Deal {d} damage. [Land]: if {n} [Height] was spent, repeat the attack twice.',
    flavor: 'One, two, three, and then the ceiling.',
    nums: { d: 8, n: 3, hits: 1 },
    effect: eff(c => { U.hit(c, N(c).d); land(c, (s) => { if (s >= N(c).n) U.hitN(c, N(c).d, 2); }); }),
    upgrade: { nums: { d: 11, n: 3, hits: 1 } },
  },
  {
    id: 'pipkin/gourdquake', name: 'Gourdquake', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['land', 'height', 'harvest'],
    text: 'Deal {d} damage to all enemies. [Land]: deal {m0} more to all for each [Height] spent. [Harvest] {n}: also gain {b} Guard.',
    flavor: 'The floorboards remember this one.',
    nums: { d: 9, m0: 4, n: 1, b: 12 },
    effect: eff(c => { U.hitAll(c, N(c).d); land(c, (s) => U.hitAll(c, N(c).m0 * s)); if (harvest(c, N(c).n)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 12, m0: 5, n: 1, b: 15 } },
  },
  {
    id: 'pipkin/bug-lunch-break', name: 'Bug Lunch Break', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['plant', 'plump', 'seed'],
    text: 'Deal {d} damage. If this defeats a non-boss enemy, [Plant] {n} [Seed] and gain {m0} [Plump].',
    flavor: 'Work is work, but lunch is lunch.',
    nums: { d: 9, n: 1, m0: 1 },
    effect: eff(c => { const t = c.target; U.hit(c, N(c).d); if (t && t.tier !== 'boss' && (t.hp <= 0 || t.dead)) { plant(c, N(c).n); gainPlump(c, N(c).m0); } }),
    upgrade: { nums: { d: 12, n: 1, m0: 1 } },
  },
  {
    id: 'pipkin/heavy-hopper', name: 'Heavy Hopper', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['plump', 'deflate', 'hop'],
    text: 'Deal {d} damage, plus {m0} for each [Plump]. You may [Deflate] {n} afterwards to [Hop].',
    flavor: 'Enormous. Airborne. Briefly.',
    nums: { d: 14, m0: 5, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d + N(c).m0 * plump(c)); if (deflate(c, N(c).n)) hop(c); }),
    dynamicCost: hopCost(2),
    upgrade: { nums: { d: 18, m0: 6, n: 1 } },
  },
  {
    id: 'pipkin/pond-skimmer', name: 'Pond Skimmer', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['hop', 'height', 'vanish'],
    text: 'Deal {d} damage. [Hop]. If this brings you to at least {n} [Height], draw {m0} Trick. [Vanish].',
    flavor: 'Four bounces off the surface without breaking it once.',
    nums: { d: 5, n: 2, m0: 1 },
    effect: eff(c => { U.hit(c, N(c).d); hop(c); if (height(c) >= N(c).n) U.draw(c, N(c).m0); }),
    dynamicCost: hopCost(0),
    upgrade: { nums: { d: 8, n: 2, m0: 1 } },
  },
  {
    id: 'pipkin/ripe-for-throwing', name: 'Ripe for Throwing', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['harvest'],
    text: 'Deal {d} damage. [Harvest] up to {n}: repeat the attack once for each Pumpkin harvested.',
    flavor: 'They were going to go soft anyway.',
    nums: { d: 8, n: 2, hits: 2 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).d, harvest(c, N(c).n)); }),
    upgrade: { nums: { d: 11, n: 2, hits: 2 } },
  },
  {
    id: 'pipkin/squash-match', name: 'Squash Match', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['patch', 'plump'],
    text: 'Deal {d} damage. If your [Patch] is full, deal {d} to another enemy. If you have 3 [Plump], one of the hits deals {m0} instead.',
    flavor: 'A sporting fixture between a frog and a wall.',
    nums: { d: 15, m0: 22 },
    effect: eff(c => { const big = plump(c) >= 3; U.hit(c, big ? N(c).m0 : N(c).d); const o = U.others(c); if (patch(c).length >= patchCap(c) && o.length) U.hitAt(c, o[0], N(c).d); }),
    upgrade: { nums: { d: 19, m0: 27 } },
  },
  {
    id: 'pipkin/croak-shock', name: 'Croak Shock', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['plant', 'harvest'],
    text: 'Deal {d} damage to all enemies. If you have both [Plant]ed and [Harvest]ed this turn, deal {m0} instead and draw {n} Trick.',
    flavor: 'A frog this size should not be able to make that sound.',
    nums: { d: 5, m0: 9, n: 1 },
    effect: eff(c => { const on = U.got(c, 'harvested') > 0 && U.got(c, 'plantedThisTurn') > 0; U.hitAll(c, on ? N(c).m0 : N(c).d); if (on) U.draw(c, N(c).n); }),
    upgrade: { nums: { d: 7, m0: 12, n: 1 } },
  },
  {
    id: 'pipkin/leapfrog', name: 'Leapfrog', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['hop', 'land', 'height'],
    text: 'Deal {d} damage. [Hop]. Your next [Land] this turn treats the [Height] spent as {n} higher, to a maximum of 3.',
    flavor: 'Over the top of something that did not agree to be leapt.',
    nums: { d: 8, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); hop(c); U.applySelf(c, 'land-boost', N(c).n); }),
    dynamicCost: hopCost(1),
    upgrade: { nums: { d: 11, n: 1 } },
  },

  // ── Skills (16) ───────────────────────────────────────────────────────────
  {
    id: 'pipkin/warm-windowsill', name: 'Warm Windowsill', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch'],
    text: 'Advance up to {n} different [Patch] objects by one stage.',
    flavor: 'Best sun in the house. Strictly rationed.',
    nums: { n: 2 },
    effect: eff(c => { for (let i = 0; i < N(c).n; i++) advance(c); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'pipkin/crop-rotation', name: 'Crop Rotation', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch'],
    text: 'Advance one [Patch] object by a stage and move another back by a stage. Draw {n} Trick.',
    flavor: 'Somebody has to go backwards. It is only fair.',
    nums: { n: 1 },
    effect: eff(c => { advance(c); regress(c); U.draw(c, N(c).n); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/springboard', name: 'Springboard', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['hop', 'land'],
    text: '[Hop] twice. Your next Trick containing [Land] this turn costs {n} less.',
    flavor: 'A loose floorboard, correctly identified.',
    nums: { n: 1 },
    effect: eff(c => { hop(c, 2); U.applySelf(c, 'land-discount', N(c).n); }),
    dynamicCost: hopCost(1),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'pipkin/hang-time', name: 'Hang Time', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, exhaust: true, keywords: ['height', 'vanish'],
    text: 'Your [Height] does not disappear at the end of this turn. If you keep at least {n}, draw {m0} additional Trick next turn. [Vanish].',
    flavor: 'He simply declines to come down this turn.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { U.applySelf(c, 'hang-time', 1); const n = N(c).n, m = N(c).m0; U.atTurnEnd(c, (x) => { if (height(x) >= n) U.nextTurn(x, (y) => U.draw(y, m)); }); }),
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'pipkin/inflate', name: 'Inflate', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['plump', 'heavy-feet'],
    text: 'Gain {n} [Plump]. If that brings you to maximum Plump, gain {m0} Pluck — and [Heavy Feet] with it.',
    flavor: 'Two lungfuls. Structural. Immobilising.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { gainPlump(c, N(c).n); if (plump(c) >= maxPlump(c)) U.energy(c, N(c).m0); }),
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'pipkin/pffft', name: 'Pffft', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['deflate', 'vanish'],
    text: '[Deflate] {m0}: gain {n} Nerve and draw {m1} Trick. [Vanish].',
    flavor: 'Not dignified. Extremely efficient.',
    nums: { m0: 1, n: 1, m1: 1 },
    effect: eff(c => { if (deflate(c, N(c).m0)) { U.energy(c, N(c).n); U.draw(c, N(c).m1); } }),
    playable: (c) => plump(c) >= 1,
    upgrade: { nums: { m0: 1, n: 1, m1: 2 } },
  },
  {
    id: 'pipkin/mud-jacket', name: 'Mud Jacket', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['plump'],
    text: 'Gain {b} Guard, plus {m0} for each [Plump]. At 3 Plump, keep {m1} of it into your next turn.',
    flavor: 'Cracks when it dries. Works while it does not.',
    nums: { b: 5, m0: 6, m1: 8 },
    effect: eff(c => { U.guard(c, N(c).b + N(c).m0 * plump(c)); if (plump(c) >= 3) { const k = N(c).m1; U.nextTurn(c, (x) => U.guard(x, k)); } }),
    upgrade: { nums: { b: 7, m0: 8, m1: 10 } },
  },
  {
    id: 'pipkin/choose-the-biggest', name: 'Choose the Biggest', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['harvest', 'empowered'],
    text: '[Harvest] {m0}: gain {b} Guard and your next Attack this turn is [Empowered] {n}.',
    flavor: 'He has been watching that one for three turns.',
    nums: { m0: 1, b: 14, n: 8 },
    effect: eff(c => { if (harvest(c, N(c).m0)) { U.guard(c, N(c).b); U.empower(c, N(c).n); } }),
    upgrade: { nums: { m0: 1, b: 18, n: 10 } },
  },
  {
    id: 'pipkin/pantry-raid', name: 'Pantry Raid', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['harvest'],
    text: '[Harvest] up to {n}: draw {m0} Trick for each Pumpkin taken, then discard {m1} Trick if you took any.',
    flavor: 'In and out. Mostly out. Some of it rolled.',
    nums: { n: 2, m0: 1, m1: 1 },
    effect: eff(c => { const t = harvest(c, N(c).n); U.draw(c, t * N(c).m0); if (t) c.discard(N(c).m1, { choose: true }); }),
    upgrade: { nums: { n: 3, m0: 1, m1: 1 } },
  },
  {
    id: 'pipkin/replant-the-rind', name: 'Replant the Rind', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['harvest', 'plant', 'seed', 'vanish'],
    text: '[Harvest] {m0}: [Plant] {n} [Seed]s. [Vanish].',
    flavor: 'Nothing is wasted in a garden run by a frog.',
    nums: { m0: 1, n: 2 },
    effect: eff(c => { if (harvest(c, N(c).m0)) plant(c, N(c).n); }),
    upgrade: { nums: { m0: 1, n: 3 } },
  },
  {
    id: 'pipkin/seed-stash', name: 'Seed Stash', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['plant', 'seed'],
    text: '[Plant] {n} [Seed]. [Plant] {m0} more at the start of your next turn if there is room.',
    flavor: 'Half now, half in the morning.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { plant(c, N(c).n); const m = N(c).m0; U.nextTurn(c, (x) => plant(x, m)); }),
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'pipkin/no-room-no-problem', name: 'No Room, No Problem', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch', 'plant', 'seed', 'sprout', 'pumpkin'],
    text: 'If your [Patch] is full, turn one [Seed] or [Sprout] straight into a [Pumpkin]. Otherwise [Plant] {n} Seed and gain {b} Guard.',
    flavor: 'Overcrowding, solved by force of will.',
    nums: { n: 1, b: 9 },
    effect: eff(c => {
      if (patch(c).length >= patchCap(c)) { const p = patch(c); const i = p.indexOf(SPROUT) >= 0 ? p.indexOf(SPROUT) : p.indexOf(SEED); if (i >= 0) { p[i] = PUMPKIN; U.fire(c, 'ripen', { n: 1 }); } }
      else { plant(c, N(c).n); U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { n: 1, b: 13 } },
  },
  {
    id: 'pipkin/crouch-and-count', name: 'Crouch and Count', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['height', 'patch'],
    text: 'Gain {b} Guard. If you end the turn at 0 [Height], advance one [Patch] object by a stage.',
    flavor: 'Very still. Counting something. Nobody knows what.',
    nums: { b: 8 },
    effect: eff(c => { U.guard(c, N(c).b); U.atTurnEnd(c, (x) => { if (height(x) === 0) advance(x); }); }),
    upgrade: { nums: { b: 11 } },
  },
  {
    id: 'pipkin/moonbeam-on-the-patch', name: 'Moonbeam on the Patch', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['patch', 'seed', 'sprout'],
    text: 'Choose [Seed]s or [Sprout]s. Advance every [Patch] object of that stage by one.',
    flavor: 'Moonlight is better for pumpkins. Ask any frog.',
    nums: {},
    effect: eff(c => U.chooseOne(c, [
      { label: 'Sprouts', fn: (x) => { const p = patch(x); let r = 0; for (let i = 0; i < p.length; i++) if (p[i] === SPROUT) { p[i] = PUMPKIN; r++; } if (r) U.fire(x, 'ripen', { n: r }); } },
      { label: 'Seeds', fn: (x) => { const p = patch(x); for (let i = 0; i < p.length; i++) if (p[i] === SEED) p[i] = SPROUT; } },
    ])),
    upgrade: { cost: 1 },
  },
  {
    id: 'pipkin/picnic-basket', name: 'Picnic Basket', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['harvest'],
    text: '[Harvest] {m0}: recover {n} Courage. If you are already at full Courage, gain {b} Guard instead.',
    flavor: 'Two sandwiches, a flask, and an unreasonable quantity of pumpkin.',
    nums: { m0: 1, n: 8, b: 16 },
    effect: eff(c => { if (!harvest(c, N(c).m0)) return; const s = c.self; if (s && s.hp >= s.maxHp) U.guard(c, N(c).b); else U.mend(c, N(c).n); }),
    upgrade: { nums: { m0: 1, n: 11, b: 20 } },
  },
  {
    id: 'pipkin/deep-pond-breathing', name: 'Deep Pond Breathing', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['plump', 'deflate', 'hop'],
    text: 'Choose one: gain {n} [Plump]; or [Deflate] {m0} to [Hop] twice and draw {m1} Trick.',
    flavor: 'In through the skin. Out through the everything.',
    nums: { n: 1, m0: 1, m1: 1 },
    effect: eff(c => U.chooseOne(c, [
      { label: 'Gain Plump', fn: (x) => gainPlump(x, N(x).n) },
      { label: 'Deflate and Hop', when: (x) => plump(x) >= 1, fn: (x) => { if (deflate(x, N(x).m0)) { hop(x, 2); U.draw(x, N(x).m1); } } },
    ])),
    upgrade: { nums: { n: 2, m0: 1, m1: 2 } },
  },

  // ── Powers (5) ────────────────────────────────────────────────────────────
  {
    id: 'pipkin/fertile-footprints', name: 'Fertile Footprints', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['land', 'plant', 'seed'],
    text: 'The first time you [Land] each turn, [Plant] {n} [Seed].',
    flavor: 'Something grows in every dent he leaves.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'pipkin/fertile-footprints', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/elastic-legs', name: 'Elastic Legs', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['hop', 'heavy-feet'],
    text: 'The first Trick containing [Hop] you play each turn costs {n} less, minimum 0. This can cancel [Heavy Feet].',
    flavor: 'All the spring is in the back half.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'pipkin/elastic-legs', 1, (x) => {
      x.e?.on?.('turn:start', () => U.applySelf(x, 'elastic-legs', 1));
    })),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'pipkin/prize-pumpkin', name: 'Prize Pumpkin', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['pumpkin'],
    text: 'The first time at least one [Pumpkin] ripens each turn, gain {n} Nerve at the start of your next turn.',
    flavor: 'Blue ribbon. Slightly menacing.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'pipkin/prize-pumpkin', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/big-frog-energy', name: 'Big Frog Energy', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['plump', 'deflate', 'empowered'],
    text: 'Whenever you gain [Plump], gain {b} Guard. The first time you [Deflate] each turn, your next Attack is [Empowered] {n}.',
    flavor: 'He is not big. He is just very present.',
    nums: { b: 5, n: 8 },
    effect: eff(c => power(c, 'pipkin/big-frog-energy', 1)),
    upgrade: { nums: { b: 7, n: 10 } },
  },
  {
    id: 'pipkin/garden-in-motion', name: 'Garden in Motion', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['harvest', 'plant', 'seed', 'sprout'],
    text: 'The first time you [Harvest] each turn, advance a [Seed] into a [Sprout]. If there are none, [Plant] {n} Seed instead.',
    flavor: 'Take one out, push one along.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'pipkin/garden-in-motion', 1)),
    upgrade: { cost: 1, nums: { n: 1 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ───────────────────────────────────────────────────────────
  {
    id: 'pipkin/crater-maker', name: 'Crater Maker', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['land', 'height', 'deflate'],
    text: 'Deal {d} damage to all enemies. [Land]: deal {m0} more to all for each [Height] spent. If 3 Height was spent, you may [Deflate] {n} to repeat the Land damage.',
    flavor: 'The hole is frog-shaped. Everyone agrees not to mention it.',
    nums: { d: 20, m0: 8, n: 1 },
    effect: eff(c => { U.hitAll(c, N(c).d); land(c, (s) => { U.hitAll(c, N(c).m0 * s); if (s >= 3 && deflate(c, N(c).n)) U.hitAll(c, N(c).m0 * s); }); }),
    upgrade: { nums: { d: 25, m0: 10, n: 1 } },
  },
  {
    id: 'pipkin/frogapult', name: 'Frogapult', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['deflate', 'hop', 'land', 'height'],
    text: '[Deflate] any amount up to {n}. [Hop] once for each [Plump] spent, then immediately [Land] and deal {d} damage plus {m0} for each [Height] spent.',
    flavor: 'Stored body mass, converted directly into altitude.',
    nums: { d: 12, m0: 12, n: 3 },
    effect: eff(c => { const p = Math.min(N(c).n, plump(c)); if (p) deflate(c, p); hop(c, p); land(c, (s) => U.hit(c, N(c).d + N(c).m0 * s)); if (!p) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 15, m0: 15, n: 3 } },
  },
  {
    id: 'pipkin/pumpkin-barrage', name: 'Pumpkin Barrage', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['harvest'],
    text: 'Deal {d} damage. [Harvest] up to {n}: launch {m0} damage at a random enemy for each Pumpkin taken.',
    flavor: 'Three at a time, from a frog with two arms.',
    nums: { d: 8, n: 3, m0: 10 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitRandomN(c, N(c).m0, harvest(c, N(c).n)); }),
    upgrade: { nums: { d: 11, n: 3, m0: 12 } },
  },
  {
    id: 'pipkin/grand-slam-gourd', name: 'Grand Slam Gourd', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['land', 'height', 'harvest', 'plump'],
    text: 'Deal {d} damage. [Land]: deal {m0} more for each [Height] spent. [Harvest] {n}: add a {m1} hit for each [Plump].',
    flavor: 'He winds up with the whole body. There is not much body.',
    nums: { d: 18, m0: 8, n: 1, m1: 5 },
    effect: eff(c => { U.hit(c, N(c).d); land(c, (s) => U.hit(c, N(c).m0 * s)); if (harvest(c, N(c).n)) U.hitN(c, N(c).m1, plump(c)); }),
    upgrade: { nums: { d: 23, m0: 10, n: 1, m1: 6 } },
  },
  {
    id: 'pipkin/eat-the-whole-thing', name: 'Eat the Whole Thing', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['harvest', 'plump'],
    text: 'Deal {d} damage. [Harvest] {m1}: deal {m0} instead, gain {m2} [Plump], and recover {n} Courage.',
    flavor: 'Rind included. Stem included. Regret not included.',
    nums: { d: 8, m0: 22, n: 4, m1: 1, m2: 1 },
    effect: eff(c => { if (harvest(c, N(c).m1)) { U.hit(c, N(c).m0); gainPlump(c, N(c).m2); U.mend(c, N(c).n); } else U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 11, m0: 27, n: 5, m1: 1, m2: 1 } },
  },
  {
    id: 'pipkin/three-story-belly-flop', name: 'Three Story Belly Flop', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['land', 'height', 'plump'],
    text: 'Deal {d} damage. [Land]: deal {m0} more for each [Height] spent. If you also have 3 [Plump], gain {b} Guard after impact.',
    flavor: 'From the banister. Past the chandelier. Onto the problem.',
    nums: { d: 10, m0: 14, b: 20 },
    effect: eff(c => { U.hit(c, N(c).d); land(c, (s) => { U.hit(c, N(c).m0 * s); if (plump(c) >= 3) U.guard(c, N(c).b); }); }),
    upgrade: { nums: { d: 13, m0: 17, b: 25 } },
  },
  {
    id: 'pipkin/pumpkin-meteor', name: 'Pumpkin Meteor', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['harvest', 'plant', 'seed'],
    text: 'Deal {d} damage to all enemies. [Harvest] up to {n}: deal {m0} more to all for each Pumpkin taken, then [Plant] {m1} [Seed] for each.',
    flavor: 'It is not actually on fire. It is close enough.',
    nums: { d: 20, n: 3, m0: 10, m1: 1 },
    effect: eff(c => { U.hitAll(c, N(c).d); const t = harvest(c, N(c).n); U.hitAllN(c, N(c).m0, t); plant(c, t * N(c).m1); }),
    upgrade: { nums: { d: 25, n: 3, m0: 12, m1: 1 } },
  },
  {
    id: 'pipkin/leap-of-faith', name: 'Leap of Faith', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['hop', 'land', 'vanish'],
    text: 'Deal {d} damage and [Hop] twice. If you do not [Land] before the end of this turn, lose {n} Courage. [Vanish].',
    flavor: 'There is no plan for the descent. There never is.',
    nums: { d: 6, n: 8 },
    effect: eff(c => { U.hit(c, N(c).d); hop(c, 2); const n = N(c).n; U.atTurnEnd(c, (x) => { if (height(x) > 0) U.bleed(x, n); }); }),
    dynamicCost: hopCost(0),
    upgrade: { nums: { d: 9, n: 8 } },
  },

  // ── Skills (10) ───────────────────────────────────────────────────────────
  {
    id: 'pipkin/overnight-miracle', name: 'Overnight Miracle', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['patch'],
    text: 'Immediately perform one [Patch] growth step. If the Patch was full when you played this, perform a second.',
    flavor: 'You leave for one night. You come back to this.',
    nums: {},
    effect: eff(c => { const full = patch(c).length >= patchCap(c); growthStep(c); if (full) growthStep(c); }),
    upgrade: { cost: 1 },
  },
  {
    id: 'pipkin/perfect-harvest', name: 'Perfect Harvest', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['harvest', 'empowered'],
    text: '[Harvest] any number. For each, choose: draw {n} Trick, gain {b} Guard, or [Empowered] {m0}. Each reward at most twice.',
    flavor: 'Everything ripe, all at once, exactly how he wanted it.',
    nums: { n: 1, b: 6, m0: 6 },
    effect: eff(async c => {
      const took = harvest(c, 6);
      const used = { draw: 0, guard: 0, empower: 0 };
      for (let i = 0; i < took; i++) {
        await U.chooseOne(c, [
          { label: 'Draw', when: () => used.draw < 2, fn: (x) => { used.draw++; U.draw(x, N(x).n); } },
          { label: 'Guard', when: () => used.guard < 2, fn: (x) => { used.guard++; U.guard(x, N(x).b); } },
          { label: 'Empower', when: () => used.empower < 2, fn: (x) => { used.empower++; U.empower(x, N(x).m0); } },
        ]);
      }
    }),
    upgrade: { nums: { n: 1, b: 8, m0: 8 } },
  },
  {
    id: 'pipkin/swallow-the-sun', name: 'Swallow the Sun', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['harvest', 'plump', 'hop', 'heavy-feet'],
    text: '[Harvest] {m0}. Set [Plump] to {n}, gain {b} Guard, and your next [Hop] Trick this turn ignores [Heavy Feet].',
    flavor: 'It was a pumpkin. It is now, briefly, the sun. Now it is inside a frog.',
    nums: { m0: 1, n: 3, b: 20 },
    effect: eff(c => { harvest(c, N(c).m0); U.setRes(c, PLUMP, N(c).n, 0, maxPlump(c)); U.fire(c, 'plump', { n: 1 }); U.guard(c, N(c).b); U.applySelf(c, 'ignore-heavy-feet', 1); }),
    upgrade: { nums: { m0: 1, n: 3, b: 26 } },
  },
  {
    id: 'pipkin/emergency-deflation', name: 'Emergency Deflation', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['deflate', 'plump', 'vanish'],
    text: '[Deflate] all [Plump]. Gain {n} Nerve and {b} Guard for each spent. [Vanish].',
    flavor: 'The room clears. The frog is much smaller.',
    nums: { n: 1, b: 6 },
    effect: eff(c => { const p = plump(c); if (deflate(c, p)) { U.energy(c, p * N(c).n); U.guard(c, p * N(c).b); } }),
    upgrade: { nums: { n: 1, b: 9 } },
  },
  {
    id: 'pipkin/triple-jump', name: 'Triple Jump', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['hop', 'height', 'heavy-feet', 'vanish'],
    text: '[Hop] until you reach 3 [Height]. [Vanish]. [Heavy Feet] applies normally.',
    flavor: 'Hop. Skip. Whatever the third one is called.',
    nums: {},
    effect: eff(c => hop(c, 3 - height(c))),
    dynamicCost: hopCost(1),
    upgrade: { cost: 0 },
  },
  {
    id: 'pipkin/back-to-seed', name: 'Back to Seed', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['pumpkin', 'seed', 'harvest'],
    text: 'Turn up to {n} [Pumpkin]s into [Seed]s. For each, choose: draw {m0} Trick now, or gain {m1} Nerve next turn. This is not [Harvest]ing.',
    flavor: 'Undoing a season of work, deliberately, for a better one.',
    nums: { n: 3, m0: 1, m1: 1 },
    effect: eff(async c => {
      const p = patch(c);
      let done = 0;
      for (let i = 0; i < p.length && done < N(c).n; i++) {
        if (p[i] !== PUMPKIN) continue;
        p[i] = SEED; done++;
        await U.chooseOne(c, [
          { label: 'Draw now', fn: (x) => U.draw(x, N(x).m0) },
          { label: 'Nerve next turn', fn: (x) => { const m = N(x).m1; U.nextTurn(x, (y) => U.energy(y, m)); } },
        ]);
      }
    }),
    upgrade: { nums: { n: 4, m0: 1, m1: 1 } },
  },
  {
    id: 'pipkin/store-for-supper', name: 'Store for Supper', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['harvest'],
    text: '[Harvest] up to {n}. For each, choose: draw {m0} additional Trick at the start of your next turn, or gain {m1} Nerve then.',
    flavor: 'A frog with a larder is a frog with a future.',
    nums: { n: 2, m0: 1, m1: 1 },
    effect: eff(async c => {
      const took = harvest(c, N(c).n);
      for (let i = 0; i < took; i++) {
        await U.chooseOne(c, [
          { label: 'Draw next turn', fn: (x) => { const m = N(x).m0; U.nextTurn(x, (y) => U.draw(y, m)); } },
          { label: 'Nerve next turn', fn: (x) => { const m = N(x).m1; U.nextTurn(x, (y) => U.energy(y, m)); } },
        ]);
      }
    }),
    upgrade: { nums: { n: 3, m0: 1, m1: 1 } },
  },
  {
    id: 'pipkin/big-little-frog', name: 'Big Little Frog', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['plump', 'hop', 'vanish'],
    text: 'Choose one: set [Plump] to 0 and [Hop] twice; or set Plump to {n} and gain {b} Guard. [Vanish].',
    flavor: 'Two frogs, one frog, depending entirely on the turn.',
    nums: { n: 3, b: 20 },
    effect: eff(c => U.chooseOne(c, [
      { label: 'Small and springy', fn: (x) => { U.setRes(x, PLUMP, 0, 0, 5); hop(x, 2); } },
      { label: 'Big and solid', fn: (x) => { U.setRes(x, PLUMP, N(x).n, 0, maxPlump(x)); U.fire(x, 'plump', { n: 1 }); U.guard(x, N(x).b); } },
    ])),
    upgrade: { nums: { n: 3, b: 26 } },
  },
  {
    id: 'pipkin/seed-vault', name: 'Seed Vault', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['patch', 'plant', 'seed', 'vanish'],
    text: 'Increase [Patch] capacity by {n} for this combat, then [Plant] {m0} [Seed]s. [Vanish].',
    flavor: 'A shoebox under the stairs, catalogued in frog.',
    nums: { n: 2, m0: 2 },
    effect: eff(c => { U.mm(c).patchCap += N(c).n; plant(c, N(c).m0); }),
    upgrade: { nums: { n: 3, m0: 3 } },
  },
  {
    id: 'pipkin/pick-of-the-patch', name: 'Pick of the Patch', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['harvest', 'land', 'vanish'],
    text: '[Harvest] {m1}. Choose one: draw {n} Tricks; gain {m0} Nerve; gain {b} Guard; or your next [Land] this turn resolves twice. [Vanish].',
    flavor: 'The one he has been protecting all fight.',
    nums: { m1: 1, n: 3, m0: 2, b: 30 },
    effect: eff(async c => {
      if (!harvest(c, N(c).m1)) return;
      await U.chooseOne(c, [
        { label: 'Draw', fn: (x) => U.draw(x, N(x).n) },
        { label: 'Nerve', fn: (x) => U.energy(x, N(x).m0) },
        { label: 'Guard', fn: (x) => U.guard(x, N(x).b) },
        { label: 'Double Land', fn: (x) => U.applySelf(x, 'double-land', 1) },
      ]);
    }),
    upgrade: { nums: { m1: 1, n: 3, m0: 2, b: 38 } },
  },

  // ── Powers (7) ────────────────────────────────────────────────────────────
  {
    id: 'pipkin/great-pumpkin-frog', name: 'Great Pumpkin Frog', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['heavy-feet', 'hop', 'harvest', 'plump', 'deflate', 'plant'],
    text: '[Heavy Feet] no longer raises [Hop] costs. Once each turn when you [Harvest], gain {n} [Plump]. Once each turn when you [Deflate], [Plant] {m0} Seed.',
    flavor: 'Every year, one frog in the patch is chosen. It is always this one.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => power(c, 'pipkin/great-pumpkin-frog', 1)),
    upgrade: { cost: 2, nums: { n: 1, m0: 1 } },
  },
  {
    id: 'pipkin/spring-eternal', name: 'Spring Eternal', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['height', 'land'],
    text: '[Height] no longer disappears at the end of your turn. [Land] still spends it normally.',
    flavor: 'He simply stays up there between turns. Nobody has asked how.',
    nums: {},
    effect: eff(c => power(c, 'pipkin/spring-eternal', 1)),
    upgrade: { cost: 1 },
  },
  {
    id: 'pipkin/heirloom-seeds', name: 'Heirloom Seeds', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['plant', 'harvest', 'seed'],
    text: '[Plant] {n} [Seed]s. Every second [Pumpkin] you [Harvest] this combat Plants {m0} Seed.',
    flavor: 'Great-grandmother frog’s. Slightly haunted, in the good way.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { plant(c, N(c).n); power(c, 'pipkin/heirloom-seeds', 1); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'pipkin/moonlit-garden', name: 'Moonlit Garden', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['patch'],
    text: 'Your [Patch] performs {n} growth steps at the end of each turn instead of one.',
    flavor: 'Everything doubles overnight. Everything.',
    nums: { n: 2 },
    effect: eff(c => power(c, 'pipkin/moonlit-garden', 1)),
    upgrade: { cost: 2, nums: { n: 2 } },
  },
  {
    id: 'pipkin/bigger-than-the-doorway', name: 'Bigger Than the Doorway', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['plump', 'heavy-feet'],
    text: 'Maximum [Plump] becomes {n}. [Heavy Feet] activates at {m0} instead of 3. Whenever you gain Plump above 3, gain {b} Guard.',
    flavor: 'A logistical problem for the entire household.',
    nums: { n: 5, m0: 4, b: 8 },
    effect: eff(c => power(c, 'pipkin/bigger-than-the-doorway', 1)),
    upgrade: { nums: { n: 5, m0: 4, b: 11 } },
  },
  {
    id: 'pipkin/boing-without-end', name: 'Boing Without End', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['land', 'height'],
    text: 'The first time you [Land] each turn, set your [Height] to {n} afterwards instead of 0.',
    flavor: 'He bounces on impact. Every single time.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'pipkin/boing-without-end', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/the-patch-fights-back', name: 'The Patch Fights Back', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['harvest', 'land'],
    text: 'Once each turn when you [Harvest] a Pumpkin, choose an enemy. Your next [Land] that turn also deals {d} damage to it.',
    flavor: 'It has been listening. All season, it has been listening.',
    nums: { d: 20 },
    effect: eff(c => power(c, 'pipkin/the-patch-fights-back', 1)),
    upgrade: { nums: { d: 26 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
// ── MULTIPLAYER ONLY TRICKS ─────────────────────────────────────────────────
/**
 * The five co-op Tricks from this companion's design chapter, kept OUTSIDE the
 * 80 in a separate `coopCards` pool so a solo run can never draft one.
 *
 * A NOTE ON ANY THAT ASK A TEAMMATE TO CHOOSE. Where one of these says "that
 * player chooses a Trick from their hand/discard", it goes through
 * `c.askAlly(ally, {...})` (or `c.askAllyOption` for a call rather than a
 * card), which raises a real choice request ADDRESSED TO THAT KID'S SEAT: their
 * own client's picker answers it, and everyone else resolves it from the
 * request's `prefer` rule and reads the outcome off the choice log. Local play
 * always takes the second branch on purpose — handing one player the other
 * Kid's deck would be worse than a stable rule, not better — so a transport is
 * the only piece still missing. Never hand-roll the pick inside an effect.
 */
const coopCards = [
  {
    id: 'pipkin/gourd-to-go', name: 'Gourd to Go', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Harvest 1. Choose a friend: they gain {b} Guard and draw {n}. Then Plant 1 Seed.',
    flavor: 'It is still warm. Do not ask what from.',
    nums: { b: 9, n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who gets the gourd?' });
      harvest(c, 1);
      if (ally) { c.giveBlock(ally, N(c).b); c.giveDraw(ally, N(c).n); }
      plant(c, 1);
    }),
    upgrade: { nums: { b: 13, n: 1 } },
  },
  {
    id: 'pipkin/leapfrog-literally', name: 'Leapfrog, Literally', companion: SLUG,
    type: SKILL, rarity: UNCOMMON, cost: 1, target: NONE, coop: true,
    text: 'Choose a friend. The next Attack they play this turn makes Pipkin Hop and gives them {b} Guard. If Pipkin Lands later this turn, they gain {b} Guard again.',
    flavor: 'The frog is load-bearing.',
    nums: { b: 6 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly({ prompt: 'Who are you vaulting over?' });
      if (!ally) return;
      const b = N(c).b;
      let used = false;
      const off = c.e.on('card:play', (ev) => {
        if (used || ev.actorId !== ally.id) return;
        // Same correction: the type lives on the card, not on the event.
        const card = c.e.card(ev.cardUid);
        if (!card || card.type !== 'attack') return;
        used = true; off();
        hop(c, 1);
        c.giveBlock(ally, b);
        // The second helping is on a LATER Land, per the card. Calling `land()`
        // here instead lands IMMEDIATELY — it spends the Hop that was just
        // made and pays both halves at once, which is a different (and
        // strictly better) card than the one the text describes.
        const s2 = U.mm(c);
        s2.leapfrogAlly = ally.id;
        s2.leapfrogGuard = b;
        U.applySelf(c, 'leapfrog', 1);
      });
      U.atTurnEnd(c, () => off());
    }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'pipkin/community-garden', name: 'Community Garden', companion: SLUG,
    type: POWER, rarity: UNCOMMON, cost: 2, target: SELF, coop: true,
    text: 'Once each turn, when a friend plays a Trick, Plant 1 Seed. The first time you Harvest each turn, a friend gains {b} Guard.',
    flavor: 'Everyone waters it. Nobody agrees what it is.',
    nums: { b: 7 },
    effect: eff((c) => {
      // The Harvest payout is a MODULE-SCOPE U.onHook below, not a listener
      // registered here: companion Powers fire through `U.fire`, and an
      // `engine.hooks.add('harvested', ...)` — which is what this first did —
      // registers for a hook name the engine never dispatches. It resolved
      // cleanly and did nothing, which is precisely CONTRACTS rule 8.
      power(c, 'pipkin/community-garden', 1, () => {
        c.e.on('card:play', (ev) => {
          const s = U.mm({ e: c.e, self: c.self });
          if (s.gardenPlantedTurn === c.e.turn) return;
          // The event carries `card` (a snapshot), `actorId` and `seat` — NOT
          // a bare `type`. Reading `ev.type` made this silently never fire.
          const card = c.e.card(ev.cardUid);
          if (!card || card.type !== 'skill') return;
          if (!ev.actorId || ev.actorId === c.self.id) return;   // a FRIEND's Skill
          s.gardenPlantedTurn = c.e.turn;
          plant(c, 1);
        });
      });
    }),
    upgrade: { nums: { b: 10 } },
  },
  {
    id: 'pipkin/everybody-jump', name: 'Everybody Jump', companion: SLUG,
    type: SKILL, rarity: RARE, cost: 2, target: NONE, coop: true,
    text: 'Every friend\'s next Trick this turn costs {n} less. Each discount used makes Pipkin Hop.',
    flavor: 'On three. THREE. Not on the word three. On three.',
    nums: { n: 1 },
    effect: eff((c) => {
      const less = N(c).n;
      const marked = new Set();
      for (const pl of c.party()) {
        if (pl === c.self) continue;
        for (const k of c.allyCards(pl, 'hand')) { k.costTurnDelta -= less; marked.add(k.uid); }
      }
      const off = c.e.on('card:play', (ev) => {
        if (!marked.has(ev.cardUid)) return;
        marked.clear();                    // one discount per friend's next Trick
        hop(c, 1);
        off();
      });
      U.atTurnEnd(c, () => off());
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'pipkin/harvest-festival', name: 'Harvest Festival', companion: SLUG,
    type: SKILL, rarity: RARE, cost: 2, target: NONE, coop: true,
    text: 'Harvest up to one Pumpkin per player. For each one, a different player draws {n} and gains {b} Guard.',
    flavor: 'The lanterns are all slightly wrong and it is perfect.',
    nums: { n: 1, b: 6 },
    effect: eff((c) => {
      const party = c.party();
      let i = 0;
      for (const pl of party) {
        if (!harvest(c, 1)) break;         // out of Pumpkins: stop cleanly
        const who = party[i % party.length];
        i++;
        if (who === c.self) { U.draw(c, N(c).n); U.block(c, N(c).b); }
        else { c.giveDraw(who, N(c).n); c.giveBlock(who, N(c).b); }
      }
    }),
    upgrade: { nums: { n: 1, b: 9 } },
  },
];

export default {
  slug: SLUG,
  name: 'Pipkin',
  title: 'the Pumpkin Frog',
  region: 'pumpkin-grounds',
  identity:
    'Pipkin is a rhythm and maturation Companion — a tiny haunted garden problem with legs. His turns ' +
    'are sequences rather than a list of independent Tricks: hop, hop again, force a Sprout into a ' +
    'Pumpkin, Harvest it, use the Harvest to swell, then come crashing down with a Landing Trick. His ' +
    'Patch is a private production engine on a two-turn clock, so what he plants now decides what next ' +
    'turn can afford. Meanwhile he physically changes size, and that is the tension: a small Pipkin is ' +
    'mobile, a big Pipkin is dangerous, and a maximally Plump Pipkin has Heavy Feet and cannot get off ' +
    'the ground. The Patch is how he moves between the two.',
  strengths: [
    'Enormous burst turns once several systems are prepared together',
    'Strong multi-enemy damage from Landings and thrown Pumpkins',
    'Flexible delayed resource generation — a Pumpkin can become anything',
    'Scales without a permanent damage stat',
    'Many ways to manipulate the timing of future turns',
  ],
  weaknesses: [
    'Patch Tricks are weak before Pumpkins ripen',
    'A Patch full of the wrong stages blocks further planting',
    'Harvest payoffs are dead draws with no Pumpkins',
    'Height evaporates at the end of the turn unless preserved',
    'Maximum Plump makes Hop Tricks more expensive',
    'Too many setup Tricks and the deck prepares instead of winning',
    'Fast enemies punish ambitious farming',
  ],
  startingHp: 72,
  startingEnergy: 3,
  mechanics: {
    height: { name: 'Height', kind: 'resource', desc: 'Hop gains 1 Height, maximum 3. Height does nothing by itself — Land spends all of it at once and scales its clause by the amount spent. Unused Height disappears at the end of your turn.', min: 0, max: 3, hooks: ['hop', 'land'] },
    patch: { name: 'The Patch', kind: 'system', desc: 'Up to 6 objects, each a Seed, Sprout or Pumpkin. At the end of your turn every Sprout ripens and every Seed sprouts, in the same step, so a Seed needs two turns. Plant adds Seeds; Harvest removes Pumpkins to power an effect.', min: 0, max: 6, hooks: ['plant', 'harvest', 'ripen'] },
    plump: { name: 'Plump', kind: 'resource', desc: 'How round Pipkin is, 0 to 3, persisting between turns. Many body Tricks scale with it and Deflate spends it. At maximum Plump, Heavy Feet makes every Hop Trick cost 1 more.', min: 0, max: 5, hooks: ['plump', 'deflate'] },
    heavyFeet: { name: 'Heavy Feet', kind: 'system', desc: 'At maximum Plump, Tricks containing Hop cost 1 additional Nerve. A Trick that Hops twice is taxed only once. This is Pipkin’s central internal tension.', min: 0, max: 1, hooks: [] },
  },
  startingDeck: [
    'pipkin/tiny-tongue', 'pipkin/tiny-tongue', 'pipkin/tiny-tongue',
    'pipkin/leaf-umbrella', 'pipkin/leaf-umbrella', 'pipkin/leaf-umbrella',
    'pipkin/puddle-hop', 'pipkin/belly-drop', 'pipkin/plant-a-little-one', 'pipkin/puff-up',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'The Hopper', desc: 'Treat the hand as a sequence puzzle: build Height efficiently, then decide which Trick is the one that finally brings him down. Landing Tricks are mediocre without Hop support, and Heavy Feet can wreck the whole plan.', coreCards: ['pipkin/puddle-jumper', 'pipkin/drop-in', 'pipkin/soft-landing', 'pipkin/hopscotch', 'pipkin/cannonball', 'pipkin/three-hop-combo', 'pipkin/springboard', 'pipkin/leapfrog', 'pipkin/triple-jump', 'pipkin/spring-eternal', 'pipkin/boing-without-end'] },
    { name: 'Pumpkin Farmer', desc: 'Plant early, watch the Patch mature, then convert Pumpkins into whatever the turn needs — damage, draw, Courage or Nerve. Exceptional long-fight scaling, terrible opening turns.', coreCards: ['pipkin/pocket-seeds', 'pipkin/damp-corner', 'pipkin/pumpkin-pitch', 'pipkin/little-harvest', 'pipkin/warm-windowsill', 'pipkin/no-room-no-problem', 'pipkin/moonbeam-on-the-patch', 'pipkin/pantry-raid', 'pipkin/prize-pumpkin', 'pipkin/garden-in-motion', 'pipkin/overnight-miracle', 'pipkin/perfect-harvest', 'pipkin/moonlit-garden', 'pipkin/heirloom-seeds'] },
    { name: 'Big Frog', desc: 'Push Plump upward and exploit the mass. The interesting decks inflate and deflate repeatedly rather than parking at maximum, because maximum Plump fights the Hop engine.', coreCards: ['pipkin/belly-bop', 'pipkin/big-breath', 'pipkin/squat-low', 'pipkin/squash-tackle', 'pipkin/inflate', 'pipkin/pffft', 'pipkin/mud-jacket', 'pipkin/heavy-hopper', 'pipkin/big-frog-energy', 'pipkin/emergency-deflation', 'pipkin/frogapult', 'pipkin/big-little-frog', 'pipkin/bigger-than-the-doorway'] },
    { name: 'The Fast Garden', desc: 'Refuse the normal Patch clock and manipulate growth stages directly, sometimes moving things backwards to engineer a future turn. An engine, not a deck — it has to feed something.', coreCards: ['pipkin/damp-corner', 'pipkin/weed-the-patch', 'pipkin/warm-windowsill', 'pipkin/crop-rotation', 'pipkin/no-room-no-problem', 'pipkin/crouch-and-count', 'pipkin/moonbeam-on-the-patch', 'pipkin/garden-in-motion', 'pipkin/overnight-miracle', 'pipkin/back-to-seed', 'pipkin/moonlit-garden'] },
    { name: 'Bridges', desc: 'The Tricks that stop the optimal deck being twenty copies of one keyword: Height into planting, Harvest into Plump, Plump into Height, and agriculture into Landing burst.', coreCards: ['pipkin/tongue-from-above', 'pipkin/seed-slam', 'pipkin/fertile-footprints', 'pipkin/choose-the-biggest', 'pipkin/heavy-hopper', 'pipkin/frogapult', 'pipkin/swallow-the-sun', 'pipkin/great-pumpkin-frog', 'pipkin/the-patch-fights-back'] },
  ],
};
