/**
 * Brambleboo, the Haunted Houseplant.  OWNER: companion-cards.
 * Spec: docs/design/companions/15-brambleboo.md
 *
 * Garden · Cultivars · Harvest · Uproot · Compost · Vines · Snare · Overgrown
 *
 * He does not poison anything. He slowly turns the room into a haunted indoor
 * garden and then decides whether to keep it, let it get dangerously Overgrown,
 * or tear it apart for one enormous turn. The whole character is one sentence
 * from the chapter: **a living garden is valuable, a harvested garden is
 * valuable, and you cannot have both at once.**
 *
 * ── The rules that decide whether he works ──────────────────────────────────
 *
 * 1. PLANTS ARE ENGINE OBJECTS, NOT CARDS. `addObject` documents itself as the
 *    home for "Plants, Plots, Pumpkins, Graves" and this is the first Companion
 *    to use it. They are not Tricks and never touch a pile, which is exactly
 *    what the spec demands — and it means a Plant survives a shuffle, a discard
 *    and a reshuffle without anybody having to remember to exclude it.
 *
 * 2. A GARDEN NOBODY CAN SEE IS NOT A MECHANIC. Nothing in the build rendered
 *    `engine.objects` — Pipkin's Patch has been invisible since it shipped —
 *    so the Garden rail in `scenes/combat.js` was added with him. Four Plots,
 *    each showing its Cultivar and whether it is Mature, is the board state this
 *    Companion is played from; hiding it would repeat the Torn-pile mistake.
 *
 * 3. VINES ARE NOT POISON. They do nothing at all by existing. At the start of
 *    an enemy's Attack, four of them are consumed to Snare it — a multi-hit
 *    Attack loses its last hit, a single hit is reduced but never cancelled.
 *    That makes them a resource the offensive Tricks compete for, which is the
 *    tension; a damage-over-time reading would remove the decision entirely.
 *
 * 4. OVERGROWN IS A HAZARD, NOT A REWARD. Four Mature Plants unlocks his
 *    biggest Tricks AND adds a Weed to the discard pile every turn. The Weeds
 *    are the price of standing still, and several Tricks buy them back as
 *    Compost — which is the loop.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE, SPECIAL } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'brambleboo';
const N = U.N;

const COMPOST = 'compost';
const GARDEN = 'garden';
const VINES = 'vines';

const BASE_PLOTS = 4;
const MAX_PLOTS = 5;               // Secret Greenhouse
const MATURE_AT = 2;
const MAX_VINES = 6;
const SNARE_AT = 4;
const MAX_COMPOST = 9;

const IVY = 'ivy', BRIAR = 'briar', MOON = 'moonflower', MOSS = 'moss';
const CULTIVARS = [IVY, BRIAR, MOON, MOSS];
const CULTIVAR_NAME = { ivy: 'Creeping Ivy', briar: 'Briar', moonflower: 'Moonflower', moss: 'Grave Moss' };

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ════════════════════════════════════════════════════════════════════════════
//  The Garden
// ════════════════════════════════════════════════════════════════════════════

/** Every Plant of this Kid's, in Plot order. */
function garden(c) {
  const me = c.self && c.self.id;
  return c.e.objects.filter(o => o.kind === 'plant' && o.data.seat === me)
    .sort((a, b) => a.slot - b.slot);
}
const plotCap = (c) => Math.min(MAX_PLOTS, BASE_PLOTS + (U.mm(c).extraPlots || 0));
const plotsFree = (c) => plotCap(c) - garden(c).length;

const matureAt = (c) => (U.mm(c).ancient ? 1 : MATURE_AT);
const isMature = (o) => !!(o && o.data.mature);
const mature = (c) => garden(c).filter(isMature);
const immature = (c) => garden(c).filter(o => !isMature(o));
const ofKind = (c, k) => garden(c).filter(o => o.data.cultivar === k);
const matureOf = (c, k) => mature(c).filter(o => o.data.cultivar === k || (o.data.graft === k) || o.data.wild);

/** Overgrown: normally all four Plots Mature; three under Green in Every Room. */
function overgrown(c) {
  const need = U.mm(c).greenEveryRoom ? 3 : plotCap(c);
  return mature(c).length >= Math.min(need, plotCap(c));
}

function syncGardenCounter(c) {
  const track = U.res(c, GARDEN);
  const now = mature(c).length;
  if (track !== now) U.addRes(c, GARDEN, now - track, 0, MAX_PLOTS);
}

/** The first free Plot index, or -1. */
function freeSlot(c) {
  const used = new Set(garden(c).map(o => o.slot));
  for (let i = 0; i < plotCap(c); i++) if (!used.has(i)) return i;
  return -1;
}

/**
 * Put a Cultivar in the ground.
 * @param {number} o.growth  starting Growth (The Garden Remembers, Repot…)
 * @param {number} o.slot    a specific Plot (Repot, Deadhead)
 * @returns {Object|null} the Plant
 */
function plant(c, cultivar, o = {}) {
  const s = U.mm(c);
  if (s.noPlantTurn === U.turn(c) && !o.force) return null;
  const slot = o.slot != null ? o.slot : freeSlot(c);
  if (slot < 0) return null;

  let growth = o.growth || 0;
  // The Garden Remembers: a Cultivar you have Harvested comes back further on.
  if (s.remembered && s.remembered[cultivar] && U.once(c, 'remember:' + cultivar)) {
    growth = Math.max(growth, 1);
  }
  const obj = c.addObject({
    kind: 'plant', name: CULTIVAR_NAME[cultivar] || cultivar, slot,
    data: { cultivar, growth: 0, mature: false, seat: c.self.id, graft: null },
  });
  if (growth > 0) grow(c, obj, growth);
  syncGardenCounter(c);
  U.fire(c, 'plant', { plant: obj });
  return obj;
}

/** Give a Plant Growth, maturing it if it crosses the line. */
function grow(c, obj, n = 1) {
  if (!obj || isMature(obj) || n <= 0) return false;
  const before = obj.data.growth;
  obj.data.growth = before + n;
  let matured = false;
  if (obj.data.growth >= matureAt(c)) {
    obj.data.mature = true;
    matured = true;
    const s = U.mm(c);
    // Ancient Houseplant is faster AND dirtier.
    if (s.ancient && before === 0) addWeed(c, 1);
    if (s.creepingWalls) for (const en of U.enemies(c)) entwine(c, en, 1);
    U.fire(c, 'mature', { plant: obj });
  }
  c.updateObject(obj.id, { growth: obj.data.growth, mature: obj.data.mature });
  syncGardenCounter(c);
  if (matured) U.mm(c).maturedThisTurn = true;
  return matured;
}

/** Take a Plant out WITHOUT its Harvest effect. Still worth Compost. */
function uproot(c, obj) {
  if (!obj) return false;
  const cultivar = obj.data.cultivar;
  c.removeObject(obj.id);
  gainCompost(c, 1);
  syncGardenCounter(c);
  onPlantLeft(c, cultivar);
  U.fire(c, 'uproot', { cultivar });
  return true;
}

/** Resolve a Mature Plant's payoff and take it out. */
function harvest(c, obj) {
  if (!obj || !isMature(obj)) return false;
  const s = U.mm(c);
  const cultivar = obj.data.cultivar;
  const times = (s.noEmptyRooms && overgrown(c)) ? 2 : 1;
  for (let i = 0; i < times; i++) harvestEffect(c, cultivar, obj);

  s.remembered = s.remembered || {};
  s.remembered[cultivar] = true;

  /* Bloom After Midnight and Moonlit Conservatory both keep the Plant in the
     ground — and because it never LEFT, it generates no Compost. */
  const keep = (s.bloomAfterMidnight && U.once(c, 'bloomAfterMidnight'))
            || (s.conservatoryFor === obj.id);
  if (keep) {
    if (s.conservatoryFor === obj.id) s.conservatoryFor = null;
    obj.data.growth = 0;
    obj.data.mature = false;
    c.updateObject(obj.id, { growth: 0, mature: false });
    syncGardenCounter(c);
    return true;
  }

  c.removeObject(obj.id);
  gainCompost(c, 1);
  syncGardenCounter(c);
  onPlantLeft(c, cultivar);
  U.fire(c, 'harvest', { cultivar });
  return true;
}

/** Bookkeeping every departure shares. */
function onPlantLeft(c, cultivar) {
  const s = U.mm(c);
  s.leftThisTurn = (s.leftThisTurn || 0) + 1;
  // Perennial Problem replants what just left, once a turn.
  if (s.perennial && U.once(c, 'perennial') && plotsFree(c) > 0) {
    s.pendingReplant = cultivar;
  }
}

function propagate(c, obj) {
  if (!obj || plotsFree(c) <= 0) return null;
  return plant(c, obj.data.cultivar, { growth: 0 });
}

// ── the four Cultivars ──────────────────────────────────────────────────────

/** The recurring effect a Mature Plant produces at the start of his turn. */
function matureEffect(c, cultivar, obj) {
  switch (cultivar) {
    case IVY: {
      const t = U.rpick(c, U.enemies(c));
      if (t) entwine(c, t, 1);
      break;
    }
    case MOON:
      U.draw(c, 1);
      topDeckOne(c);
      break;
    case MOSS:
      U.guard(c, 5);
      break;
    // Briar's recurring half is reactive; see the enemy-attack listener.
    default: break;
  }
}

function harvestEffect(c, cultivar, obj) {
  switch (cultivar) {
    case IVY: {
      for (let i = 0; i < 3; i++) {
        const t = U.rpick(c, U.enemies(c));
        if (t) entwine(c, t, 1);
      }
      break;
    }
    case BRIAR:
      for (const en of U.enemies(c)) U.hitAt(c, en, vinesOn(c, en) >= 1 ? 10 : 5);
      break;
    case MOON:
      U.draw(c, 2);
      topDeckOne(c);
      cheapenOne(c, 1);
      break;
    case MOSS:
      U.guard(c, 16);
      c.self.keepBlock = true;
      break;
    default: break;
  }
}

/** Moonflower's signature: draw, then put one back on top. */
function topDeckOne(c) {
  const hand = U.cardsIn(c, 'hand');
  if (!hand.length) return;
  (async () => {
    const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Put which Trick back on top?' });
    if (k) U.toDrawTop(c, k);
  })();
}
function cheapenOne(c, n) {
  const hand = U.handOthers(c);
  if (!hand.length) return;
  (async () => {
    const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Which Trick costs less?' });
    if (k) U.costMod(c, k, -n, 'turn');
  })();
}

// ════════════════════════════════════════════════════════════════════════════
//  Compost and Fertilize
// ════════════════════════════════════════════════════════════════════════════

const compost = (c) => U.res(c, COMPOST);
function gainCompost(c, n) { if (n > 0) U.addRes(c, COMPOST, n, 0, MAX_COMPOST); }
function spendCompost(c, n) {
  if (n <= 0 || compost(c) < n) return 0;
  U.addRes(c, COMPOST, -n, 0, MAX_COMPOST);
  return n;
}

// ════════════════════════════════════════════════════════════════════════════
//  Vines and Snare
// ════════════════════════════════════════════════════════════════════════════

const vinesOn = (c, en) => U.stacks(c, en, VINES);

/** @returns {number} Vines actually applied — the cap is 6. */
function entwine(c, en, n) {
  if (!en || n <= 0) return 0;
  const room = MAX_VINES - vinesOn(c, en);
  const give = Math.min(n, room);
  if (give > 0) U.apply(c, en, VINES, give);
  const s = U.mm(c);
  if (give > 0 && s.houseTakesRoot && U.once(c, 'houseTakesRoot')) {
    const others = U.enemies(c).filter(x => x !== en);
    const second = others.length ? U.rpick(c, others) : en;
    if (second) { const r2 = MAX_VINES - vinesOn(c, second); if (r2 > 0) U.apply(c, second, VINES, 1); }
  }
  return give;
}
function stripVines(c, en, n) {
  const have = Math.min(n, vinesOn(c, en));
  if (have > 0) U.unapply(c, en, VINES, have);
  return have;
}
const snareThreshold = (c) => (U.mm(c).trellis ? 3 : SNARE_AT);

// ════════════════════════════════════════════════════════════════════════════
//  Weeds
// ════════════════════════════════════════════════════════════════════════════

const WEED = {
  id: 'brambleboo/weed', name: 'Weed', companion: SLUG, type: SKILL, rarity: SPECIAL,
  cost: -2, target: NONE, unplayable: true, keywords: ['weed'],
  text: 'Unplayable. It is just in the way.',
  flavor: 'Something is growing in here that nobody planted.',
  nums: {},
  effect: () => {},
  /* A Weed cannot be upgraded in any meaningful sense; the entry exists because
     every def carries one, and it says out loud that it does nothing. */
  upgrade: { text: 'Unplayable. Still in the way. Upgrading it changes nothing.' },
};

function addWeed(c, n = 1) {
  const s = U.mm(c);
  if (s.terrariumBlocking) { s.terrariumBlocking = false; return; }
  for (let i = 0; i < n; i++) U.spawn(c, WEED, 'discard', {});
}

const isWeed = (k) => !!k && (k.def ? k.def.id : k.id) === 'brambleboo/weed';
function weedsAround(c) {
  return [...U.cardsIn(c, 'hand'), ...U.cardsIn(c, 'discard')].filter(isWeed);
}
/** @returns {number} how many were actually pulled out of the fight. */
function removeWeeds(c, n) {
  const found = weedsAround(c).slice(0, n);
  for (const k of found) U.moveCard(c, k, 'exhaust', { weeded: true });
  if (found.length) {
    const s = U.mm(c);
    if (s.kitchenCompost) s.freePlantNext = true;
    U.fire(c, 'weeded', { count: found.length });
  }
  return found.length;
}

/**
 * The Tricks whose job is putting something in the ground.
 *
 * Named explicitly rather than sniffed out of the rules text: Make Room and
 * Kitchen Compost both promise "your next Trick that Plants costs 0", and a
 * discount that guesses which cards those are would silently apply to the wrong
 * ones the first time somebody rewords a card.
 */
const PLANTING_IDS = new Set([
  'brambleboo/tiny-creeper', 'brambleboo/wall-creeper', 'brambleboo/little-bramble',
  'brambleboo/moon-in-the-window', 'brambleboo/damp-corner', 'brambleboo/four-corners',
  'brambleboo/easy-cutting', 'brambleboo/take-a-cutting', 'brambleboo/repot',
  'brambleboo/deadhead', 'brambleboo/keep-the-cutting', 'brambleboo/perfect-cutting',
  'brambleboo/secret-greenhouse', 'brambleboo/four-seasons',
]);
const isPlantingCard = (k) => PLANTING_IDS.has(k && (k.def ? k.def.id : k.id));

const power = (c, id, install) => {
  const s = U.mm(c);
  U.applySelf(c, id, 1);
  if (!s['pw:' + id]) { s['pw:' + id] = true; install(c, s); }
};

// ── tracks ──────────────────────────────────────────────────────────────────
const gardenTrack = (max, start = 0) => ({
  id: GARDEN, name: 'Garden', icon: 'garden', min: 0, max, start,
  desc: 'Mature Plants in your four Plots. All four Mature and the Garden is Overgrown.',
  states: [{ at: 0, label: 'Bare' }, { from: max, to: max, label: 'Overgrown' }],
});

/** Ask which Plant, when there is a real choice. */
async function pickPlant(c, o = {}) {
  const pool = o.pool || garden(c);
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];
  const picked = await c.choose({
    options: pool.map(p => `${p.name}${isMature(p) ? ' (Mature)' : ` (${p.data.growth}/${matureAt(c)})`}`),
    prompt: o.prompt || 'Which Plant?', optional: !!o.optional,
  });
  return pool[picked[0]] || null;
}
async function pickCultivar(c, prompt = 'Plant what?') {
  const picked = await c.choose({ options: CULTIVARS.map(k => CULTIVAR_NAME[k]), prompt });
  return CULTIVARS[picked[0]] || IVY;
}

// ════════════════════════════════════════════════════════════════════════════
//  per-combat bookkeeping
// ════════════════════════════════════════════════════════════════════════════
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: COMPOST, name: 'Compost', icon: 'compost', min: 0, max: MAX_COMPOST, start: 0,
      desc: 'Earned whenever a Plant leaves the Garden. Once a turn, spend 1 to give an immature Plant 1 Growth.',
      states: [{ at: 0, label: 'Empty' }] },
    gardenTrack(BASE_PLOTS),
  ]);
  const fake = () => U.trackerCtx(e, seat);

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.leftThisTurn = 0;
    st.maturedThisTurn = false;
    st.fertilizedThisTurn = false;
    st.noPlantTurn = -1;
    st.freePlantNext = false;
    st.snaredThisTurn = {};
    st.briarFiredThisTurn = {};

    syncGardenCounter(c);

    /* Fertilize: the free once-a-turn action. There is no button for a free
       action anywhere in this build, so it is offered here — and only when it
       could do something, because a prompt for nothing every round is worse
       than the action. */
    const fertilizes = 1 + (st.extraFertilize ? 1 : 0);
    st.extraFertilize = false;
    if (compost(c) > 0 && immature(c).length) {
      (async () => {
        for (let i = 0; i < fertilizes; i++) {
          if (compost(c) <= 0 || !immature(c).length) break;
          const p = await pickPlant(c, { pool: immature(c), optional: true, prompt: 'Fertilize (free — spends 1 Compost)' });
          if (!p) break;
          if (spendCompost(c, 1)) grow(c, p, 1);
        }
      })();
    }

    /* One Big Conservatory: each friend chooses, at the top of the round. */
    if (st.conservatory) {
      for (const mate of c.teammates()) {
        (async () => {
          const pick = await c.askAllyOption(mate, {
            options: ['Grow one of Brambleboo’s Plants', 'Entwine an enemy'],
            prompt: 'One Big Conservatory',
          });
          if (String(pick || '').startsWith('Grow')) {
            const p = immature(c)[0];
            if (p && grow(c, p, 1)) { U.draw(c, 1); c.giveDraw(mate, 1); }
          } else {
            const t = U.rpick(c, U.enemies(c));
            if (t) entwine(c, t, 1);
          }
        })();
      }
    }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);

    /* Closed Terrarium: pull one Plant to keep the Weed away. Offered before
       Growth, because the choice is about whether to STAY Overgrown. */
    if (st.closedTerrarium && overgrown(c)) {
      (async () => {
        const p = await pickPlant(c, { optional: true, prompt: 'Closed Terrarium — Uproot one to keep the Weed out?' });
        if (p) { uproot(c, p); st.terrariumBlocking = true; }
      })();
    }

    // Every immature Plant gains 1 Growth, unless Bloom Schedule held it.
    if (!st.holdGrowth) for (const obj of immature(c)) grow(c, obj, 1);
    st.holdGrowth = false;

    if (st.neverStopGrowing) {
      if (overgrown(c)) addWeed(c, 1);
      else if (plotsFree(c) > 0) plant(c, U.rpick(c, CULTIVARS) || IVY, {});
    }

    /* The price of standing still. Checked AFTER Growth, because a Plant that
       matured this turn is what makes the Garden Overgrown. */
    if (overgrown(c)) addWeed(c, st.greenEveryRoom ? 2 : 1);
    if (st.mansionWatersWeed) { addWeed(c, 1); st.mansionWatersWeed = false; }
    st.mansionWaters = false;
    syncGardenCounter(c);
  }, seat);

  /* Perennial Problem replants AFTER the Trick that emptied the Plot has
     finished — doing it inside the effect would fill the Plot the Trick was
     about to use. */
  e.on('card:resolved', () => {
    const c = fake();
    const st = U.mm(c);
    if (!st.pendingReplant) return;
    const cultivar = st.pendingReplant;
    st.pendingReplant = null;
    if (plotsFree(c) > 0) plant(c, cultivar, { growth: 0, force: true });
  });

  /* Snare, and Briar's retaliation. Both hang off the same enemy Attack.
     `onIncomingHit` is a VOID hook with a mutable payload — read `h.amount`,
     then call `h.setAmount(n)`. */
  e.hooks.add('onIncomingHit', (h) => {
    if (!h || h.kind !== 'attack') return;
    const c = fake();
    const st = U.mm(c);
    const from = h.attacker;
    if (!from || from.side === 'player') return;

    /* Over the Headboard and Safe Under the Leaves both act on a friend's
       incoming hit, before it lands. Checked here rather than on a status
       because both are about the ATTACKER's Vines, which only Brambleboo can
       see. (The `h.defender !== seat` guard above lets an ally's hit through to
       this point only for these two.) */
    if (h.defender !== seat) {
      if (!st.snaredThisTurn) st.snaredThisTurn = {};
      const owed = (st.guarding || {})[h.defender.id];
      if (owed) {
        st.guarding[h.defender.id] = 0;
        entwine(c, from, owed);
        if (vinesOn(c, from) >= snareThreshold(c) && !st.snaredThisTurn[from.id]) {
          stripVines(c, from, snareThreshold(c));
          st.snaredThisTurn[from.id] = true;
          h.setAmount(Math.max(1, Math.round(h.amount * 0.4)));
        }
      }
      if (st.safeUnderLeaves) {
        st.leafUsed = st.leafUsed || {};
        if (st.leafUsed[h.defender.id] !== U.turn(c) && vinesOn(c, from) >= 2) {
          st.leafUsed[h.defender.id] = U.turn(c);
          stripVines(c, from, 2);
          c.giveBlock(h.defender, st.safeUnderLeaves);
        }
      }
      return;
    }

    const hits = h.hits || 1;
    const idx = h.hitIndex || 0;

    /* Created here rather than only at turn start: an enemy can swing before
       this seat has ever opened a turn (the validation harness does exactly
       that), and an undefined map here threw inside the enemy's move. */
    if (!st.snaredThisTurn) st.snaredThisTurn = {};

    // Decide once, at the START of the Attack action, and once per enemy turn.
    if (idx === 0 && !st.snaredThisTurn[from.id]) {
      const need = snareThreshold(c);
      if (vinesOn(c, from) >= need) {
        stripVines(c, from, st.trellis ? vinesOn(c, from) : need);
        st.snaredThisTurn[from.id] = true;
        if (st.thornyDisposition) {
          for (const b of matureOf(c, BRIAR)) U.hitAt(c, from, st.thornyDisposition);
        }
        U.fire(c, 'snare', { enemy: from });
      }
    }
    if (st.forcedSnare && st.forcedSnare[from.id]) {
      st.snaredThisTurn[from.id] = true;
      st.forcedSnare[from.id] = false;
    }
    if (!st.snaredThisTurn[from.id]) return;

    /* A Snared multi-hit loses its LAST hit; a Snared single hit is reduced but
       never cancelled — the spec says so explicitly, and a Snare that could
       zero a big single hit would make Vines strictly better than Guard. */
    if (hits > 1) { if (idx === hits - 1) h.setAmount(0); }
    else if (idx === 0) h.setAmount(Math.max(1, Math.round(h.amount * 0.4)));
  }, { owner: seat });

  /* Briar answers AFTER the Attack has resolved. `onAttack` is the engine's
     "an enemy finished a damaging move" step, which is exactly that moment. */
  e.hooks.add('onAttack', (h) => {
    const c = fake();
    const st = U.mm(c);
    const from = h && h.actor;
    if (!from || from.side === 'player') return;
    const briars = matureOf(c, BRIAR);
    if (!briars.length) return;
    if (!st.briarFiredThisTurn) st.briarFiredThisTurn = {};

    let uses = st.briarFiredThisTurn[from.id] ? 0 : 1;
    if (st.thornyRebound && st.thornyRebound[from.id]) { uses += 1; st.thornyRebound[from.id] = false; }
    if (!uses) return;
    st.briarFiredThisTurn[from.id] = true;
    for (let i = 0; i < uses; i++) {
      for (const _ of briars) { U.hitAt(c, from, 5); entwine(c, from, 1); }
    }
    st.attackedSinceMyTurn = st.attackedSinceMyTurn || {};
    st.attackedSinceMyTurn[from.id] = true;
  }, { owner: seat });

  e.on('phase', (ev) => {
    if (!ev) return;
    const c = fake();
    const st = U.mm(c);

    /* Every Mature Plant's recurring half, in Plot order — on `playerReady`,
       NOT on `turn:start`. Grave Moss's Guard would be wiped by `_openSeatTurn`
       and Moonflower is specified as running AFTER the normal draw, so putting
       a card back on top before drawing five would simply hand it back.
       No More Empty Rooms runs each of them twice while Overgrown. */
    if (ev.phase === 'playerReady') {
      const times = (st.noEmptyRooms && overgrown(c)) ? 2 : 1;
      for (const obj of mature(c)) {
        for (let i = 0; i < times; i++) {
          matureEffect(c, obj.data.cultivar, obj);
          if (obj.data.graft) matureEffect(c, obj.data.graft, obj);
        }
      }
      syncGardenCounter(c);
    }

    if (ev.phase === 'enemyPhaseEnd') {
      /* Root Around asks whether an enemy has been Snared SINCE your last turn,
         so the record has to survive the reset that clears the per-turn guard. */
      st.snaredLast = st.snaredThisTurn;
      st.snaredThisTurn = {};
      st.briarFiredThisTurn = {};
      st.attackedLast = st.attackedSinceMyTurn || {};
    }
  });

  /* Make Room and Kitchen Compost both make the next Planting Trick free. */
  e.hooks.add('modifyCardCost', (cost, h) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.freePlantNext) return cost;
    const k = h && h.card;
    if (!isPlantingCard(k)) return cost;
    return 0;
  }, { owner: seat });

  e.on('card:play', (ev) => {
    if (!ev || ev.actorId !== seat.id) return;
    const c = fake();
    const st = U.mm(c);
    if (st.freePlantNext && isPlantingCard(e.card(ev.cardUid))) st.freePlantNext = false;
  });

  /* The Mansion Waters Back grows something every time Nerve is actually spent. */
  e.on('card:play', (ev) => {
    if (!ev || ev.actorId !== seat.id) return;
    const c = fake();
    const st = U.mm(c);
    if (!st.mansionWaters) return;
    const paid = (ev.card && typeof ev.card.cost === 'number') ? ev.card.cost : 0;
    if (paid <= 0) return;
    st.wateredIds = st.wateredIds || {};
    const target = immature(c).find(o => !st.wateredIds[o.id]);
    if (!target) return;
    st.wateredIds[target.id] = true;
    grow(c, target, 1);
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('plant', 'brambleboo/never-stop-growing', () => {});
U.onHook('mature', 'brambleboo/creeping-through-the-walls', () => {});
U.onHook('harvest', 'brambleboo/the-garden-remembers', () => {});
U.onHook('uproot', 'brambleboo/perennial-problem', () => {});
U.onHook('snare', 'brambleboo/thorny-disposition', () => {});
U.onHook('weeded', 'brambleboo/kitchen-compost', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'brambleboo/leaf-bop', name: 'Leaf Bop', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'A leaf. Moving faster than a leaf should.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'brambleboo/curl-the-leaves', name: 'Curl the Leaves', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Everything folds inwards and waits.',
    nums: { b: 5 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'brambleboo/tiny-creeper', name: 'Tiny Creeper', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['garden', 'ivy'],
    text: '[Plant] a Creeping [Ivy].',
    flavor: 'It has picked a wall. It is committed.',
    nums: {},
    playable: (c) => plotsFree(c) > 0,
    effect: eff((c) => { plant(c, IVY, {}); }),
    upgrade: { text: '[Plant] a Creeping [Ivy] with 1 Growth.' },
  },
  {
    id: 'brambleboo/cup-of-water', name: 'Cup of Water', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['garden'],
    text: 'Give one immature Plant 1 Growth. With no Plant, gain {b} Guard instead.',
    flavor: 'Not much. It is a small cup.',
    nums: { b: 5 },
    effect: eff(async (c) => {
      const pool = immature(c);
      if (!pool.length) { U.guard(c, N(c).b); return; }
      const p = await pickPlant(c, { pool, prompt: 'Water which Plant?' });
      if (p) grow(c, p, 1);
    }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'brambleboo/careful-snip', name: 'Careful Snip', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 0, target: SELF, keywords: ['garden', 'harvest', 'uproot', 'compost'],
    text: '[Harvest] a Mature Plant, or [Uproot] an immature one.',
    flavor: 'Snip. He has thought about it.',
    nums: {},
    effect: eff(async (c) => {
      const ripe = mature(c);
      if (ripe.length) { const p = await pickPlant(c, { pool: ripe, prompt: 'Harvest which Plant?' }); if (p) harvest(c, p); return; }
      const p = await pickPlant(c, { pool: immature(c), optional: true, prompt: 'Uproot which Plant?' });
      if (p) uproot(c, p);
    }),
    upgrade: { text: '[Harvest] a Mature Plant, or [Uproot] an immature one. Gain 1 [Compost] either way.' },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'brambleboo/carpet-creeper', name: 'Carpet Creeper', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['garden', 'entwine'],
    text: 'Deal {d} damage. With any Plant in your [Garden], [Entwine] {n}.',
    flavor: 'Under the rug and out the other side.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => { const t = c.target; U.hit(c, N(c).d); if (garden(c).length) entwine(c, t, N(c).n); }),
    upgrade: { nums: { d: 10, n: 2 } },
  },
  {
    id: 'brambleboo/thorn-flick', name: 'Thorn Flick', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['briar'],
    text: 'Deal {d} damage, and {m0} more with a Mature [Briar].',
    flavor: 'Flick. Very small. Very sharp.',
    nums: { d: 9, m0: 5 },
    effect: eff((c) => U.hit(c, N(c).d + (matureOf(c, BRIAR).length ? N(c).m0 : 0))),
    upgrade: { nums: { d: 12, m0: 7 } },
  },
  {
    id: 'brambleboo/pot-swing', name: 'Pot Swing', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['garden'],
    text: 'Deal {d} damage, or {m0} more if a Plant left your [Garden] this turn.',
    flavor: 'Terracotta. Held by the stem. Somehow.',
    nums: { d: 8, m0: 5 },
    effect: eff((c) => U.hit(c, N(c).d + (U.mm(c).leftThisTurn ? N(c).m0 : 0))),
    upgrade: { nums: { d: 11, m0: 7 } },
  },
  {
    id: 'brambleboo/vine-trip', name: 'Vine Trip', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['entwine', 'vines'],
    text: 'Deal {d} damage and [Entwine] {n}. If it already had 3 [Vines], gain {b} Guard.',
    flavor: 'It did not see the vine. Nobody ever does.',
    nums: { d: 6, n: 1, b: 5 },
    effect: eff((c) => {
      const t = c.target;
      const had = vinesOn(c, t);
      U.hit(c, N(c).d);
      entwine(c, t, N(c).n);
      if (had >= 3) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { d: 9, n: 2, b: 7 } },
  },
  {
    id: 'brambleboo/room-full-of-leaves', name: 'Room Full of Leaves', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['overgrown'],
    text: 'Deal {d} damage to all enemies, or {m0} more while [Overgrown].',
    flavor: 'You cannot see the floor. There was a floor.',
    nums: { d: 11, m0: 4 },
    effect: eff((c) => U.hitAll(c, N(c).d + (overgrown(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 15, m0: 5 } },
  },
  {
    id: 'brambleboo/prickly-welcome', name: 'Prickly Welcome', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['entwine'],
    text: 'Deal {d} damage. If it attacked since your last turn, [Entwine] {n}.',
    flavor: 'He remembers. Plants are very good at remembering.',
    nums: { d: 9, n: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      const seen = (U.mm(c).attackedSinceMyTurn || {})[t && t.id];
      if (seen) entwine(c, t, N(c).n);
    }),
    upgrade: { nums: { d: 12, n: 2 } },
  },
  {
    id: 'brambleboo/leaf-cover', name: 'Leaf Cover', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden'],
    text: 'Gain {b} Guard. With no Mature Plants, give an immature one 1 Growth.',
    flavor: 'Enough leaves to hide a small ghost.',
    nums: { b: 9 },
    effect: eff(async (c) => {
      U.guard(c, N(c).b);
      if (mature(c).length) return;
      const p = await pickPlant(c, { pool: immature(c), optional: true, prompt: 'Grow which Plant?' });
      if (p) grow(c, p, 1);
    }),
    upgrade: { nums: { b: 13 } },
  },
  {
    id: 'brambleboo/wall-creeper', name: 'Wall Creeper', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden', 'ivy'],
    text: '[Plant] a Creeping [Ivy] with {g} Growth.',
    flavor: 'Up the wallpaper, behind the picture, gone.',
    nums: { g: 1 },
    playable: (c) => plotsFree(c) > 0,
    effect: eff((c) => { plant(c, IVY, { growth: N(c).g }); }),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'brambleboo/little-bramble', name: 'Little Bramble', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden', 'briar'],
    text: '[Plant] a [Briar].',
    flavor: 'Small. Extremely opinionated.',
    nums: {},
    playable: (c) => plotsFree(c) > 0,
    effect: eff((c) => { plant(c, BRIAR, {}); }),
    upgrade: { text: '[Plant] a [Briar] with 1 Growth.' },
  },
  {
    id: 'brambleboo/moon-in-the-window', name: 'Moon in the Window', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden', 'moonflower'],
    text: '[Plant] a [Moonflower].',
    flavor: 'It only opens when nobody is looking.',
    nums: {},
    playable: (c) => plotsFree(c) > 0,
    effect: eff((c) => { plant(c, MOON, {}); }),
    upgrade: { text: '[Plant] a [Moonflower] with 1 Growth.' },
  },
  {
    id: 'brambleboo/damp-corner', name: 'Damp Corner', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden', 'grave-moss'],
    text: '[Plant] [Grave Moss].',
    flavor: 'Every house has one. This one has nine.',
    nums: {},
    playable: (c) => plotsFree(c) > 0,
    effect: eff((c) => { plant(c, MOSS, {}); }),
    upgrade: { text: '[Plant] [Grave Moss] with 1 Growth.' },
  },
  {
    id: 'brambleboo/water-please', name: 'Water, Please', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden'],
    text: 'Give up to {n} different immature Plants 1 Growth each.',
    flavor: 'He cannot reach the tap. He has learned to ask.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const done = new Set();
      for (let i = 0; i < N(c).n; i++) {
        const pool = immature(c).filter(p => !done.has(p.id));
        if (!pool.length) break;
        const p = await pickPlant(c, { pool, optional: true, prompt: 'Water which Plant?' });
        if (!p) break;
        done.add(p.id);
        grow(c, p, 1);
      }
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'brambleboo/careful-pruning', name: 'Careful Pruning', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['harvest', 'uproot', 'compost'],
    text: '[Harvest] a Mature Plant or [Uproot] any Plant. Uprooting an immature one gains {b} Guard.',
    flavor: 'Neatly. With the good scissors.',
    nums: { b: 5 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { optional: true, prompt: 'Prune which Plant?' });
      if (!p) return;
      if (isMature(p)) harvest(c, p);
      else { uproot(c, p); U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'brambleboo/kitchen-scraps', name: 'Kitchen Scraps', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['compost', 'weed', 'vanish'],
    text: 'Gain {n} [Compost]. Add a [Weed] to your discard pile. [Vanish].',
    flavor: 'Peelings, mostly. He is not fussy.',
    nums: { n: 1 },
    effect: eff((c) => { gainCompost(c, N(c).n); addWeed(c, 1); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'brambleboo/window-seat', name: 'Window Seat', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['moonflower'],
    text: 'Draw {c1}, then put a Trick back on top. With a Mature [Moonflower], draw {m0} first.',
    flavor: 'The best seat. Obviously the best seat.',
    nums: { c1: 1, m0: 1 },
    effect: eff((c) => {
      U.draw(c, N(c).c1 + (matureOf(c, MOON).length ? N(c).m0 : 0));
      topDeckOne(c);
    }),
    upgrade: { nums: { c1: 2, m0: 1 } },
  },
  {
    id: 'brambleboo/curl-around-the-pot', name: 'Curl Around the Pot', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['grave-moss', 'garden'],
    text: 'Gain {b} Guard, and {m0} more with [Grave Moss] in your [Garden].',
    flavor: 'Snug. Faintly damp. Ideal.',
    nums: { b: 9, m0: 5 },
    effect: eff((c) => U.guard(c, N(c).b + (ofKind(c, MOSS).length ? N(c).m0 : 0))),
    upgrade: { nums: { b: 13, m0: 7 } },
  },
  {
    id: 'brambleboo/loop-around-the-banister', name: 'Loop Around the Banister', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['entwine', 'vines'],
    text: '[Entwine] {n} split between enemies. Reaching two of them gains {b} Guard.',
    flavor: 'All the way up, twice around, back down.',
    nums: { n: 2, b: 5 },
    effect: eff((c) => {
      const pool = U.enemies(c);
      if (!pool.length) return;
      let touched = 0;
      for (let i = 0; i < N(c).n; i++) {
        const t = pool[i % pool.length];
        if (entwine(c, t, 1) > 0 && i < pool.length) touched++;
      }
      if (touched >= 2) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { n: 3, b: 8 } },
  },
  {
    id: 'brambleboo/easy-cutting', name: 'Easy Cutting', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['garden', 'propagate'],
    text: '[Propagate] one of your Plants into an empty Plot.',
    flavor: 'Snip, jar of water, windowsill, wait.',
    nums: {},
    playable: (c) => plotsFree(c) > 0 && garden(c).length > 0,
    effect: eff(async (c) => {
      const p = await pickPlant(c, { prompt: 'Take a cutting from which Plant?' });
      if (p) propagate(c, p);
    }),
    upgrade: { text: '[Propagate] one of your Plants into an empty Plot with 1 Growth.' },
  },
  {
    id: 'brambleboo/pull-a-weed', name: 'Pull a Weed', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['weed', 'compost', 'vanish'],
    text: 'Remove a [Weed] from the fight and gain {n} [Compost]. No Weed: gain {b} Guard. [Vanish].',
    flavor: 'One down. There are others. There are always others.',
    nums: { n: 1, b: 5 },
    effect: eff((c) => { if (removeWeeds(c, 1)) gainCompost(c, N(c).n); else U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 8 } },
  },
  {
    id: 'brambleboo/make-room', name: 'Make Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['uproot', 'garden', 'compost'],
    text: '[Uproot] a Plant. Draw {c1}. Your next Trick that Plants costs 0 this turn.',
    flavor: 'Something has to go. Sorry.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { optional: true, prompt: 'Uproot which Plant?' });
      if (p) uproot(c, p);
      U.draw(c, N(c).c1);
      U.mm(c).freePlantNext = true;
    }),
    upgrade: { nums: { c1: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'brambleboo/wallpaper-lash', name: 'Wallpaper Lash', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['ivy', 'entwine'],
    text: 'Deal {d} damage. With a Mature Creeping [Ivy], [Entwine] {n}.',
    flavor: 'The pattern moves. It has always moved.',
    nums: { d: 10, n: 2 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (matureOf(c, IVY).length) entwine(c, t, N(c).n);
    }),
    upgrade: { nums: { d: 14, n: 3 } },
  },
  {
    id: 'brambleboo/thorny-rebound', name: 'Thorny Rebound', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['briar'],
    text: 'Deal {d} damage. The next time it attacks, every Mature [Briar] answers an extra time.',
    flavor: 'It is going to regret the follow-through.',
    nums: { d: 10 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      const s = U.mm(c);
      s.thornyRebound = s.thornyRebound || {};
      if (t) s.thornyRebound[t.id] = true;
    }),
    upgrade: { nums: { d: 14 } },
  },
  {
    id: 'brambleboo/hallway-tripwire', name: 'Hallway Tripwire', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['entwine', 'vines'],
    text: 'Deal {d} damage to all enemies and [Entwine] {n} on each.',
    flavor: 'Ankle height. The whole corridor.',
    nums: { d: 6, n: 1 },
    effect: eff((c) => { U.hitAll(c, N(c).d); for (const en of U.enemies(c)) entwine(c, en, N(c).n); }),
    upgrade: { nums: { d: 9, n: 2 } },
  },
  {
    id: 'brambleboo/uprooted-uppercut', name: 'Uprooted Uppercut', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['uproot', 'compost'],
    text: '[Uproot] a Plant. Deal {d} damage, or {m0} more if it was Mature.',
    flavor: 'Roots and all. Straight up.',
    nums: { d: 16, m0: 8 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { optional: true, prompt: 'Uproot which Plant?' });
      const wasMature = isMature(p);
      if (p) uproot(c, p);
      U.hit(c, N(c).d + (wasMature ? N(c).m0 : 0));
    }),
    upgrade: { nums: { d: 21, m0: 11 } },
  },
  {
    id: 'brambleboo/potbound-pounce', name: 'Potbound Pounce', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['garden'],
    text: 'Deal {d} damage. Costs 1 Nerve if every Plot is occupied.',
    flavor: 'No room left. Nowhere to go but outward.',
    nums: { d: 17 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (plotsFree(c) === 0 ? 1 : 2),
    upgrade: { nums: { d: 22 } },
  },
  {
    id: 'brambleboo/snapback-tendril', name: 'Snapback Tendril', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['vines'],
    text: 'Deal {d} damage. You may take 1 [Vines] off it to take this back, once a turn.',
    flavor: 'Boing.',
    nums: { d: 10 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (U.once(c, 'snapback') && t && stripVines(c, t, 1)) U.returnSelf(c);
    }),
    upgrade: { nums: { d: 14 } },
  },
  {
    id: 'brambleboo/root-around', name: 'Root Around', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['snare', 'vanish'],
    text: 'Deal {d} damage. If it has been [Snare]d since your last turn, draw {c1}. [Vanish].',
    flavor: 'Down among the floorboards, having a look.',
    nums: { d: 6, c1: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && (U.mm(c).snaredLast || {})[t.id]) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { d: 8, c1: 2 } },
  },
  {
    id: 'brambleboo/over-the-doorframe', name: 'Over the Doorframe', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['overgrown', 'entwine'],
    text: 'Deal {d} damage to all enemies. While [Overgrown], [Entwine] {n} on every one.',
    flavor: 'It got in above the door. Nobody watches above the door.',
    nums: { d: 12, n: 2 },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      if (overgrown(c)) for (const en of U.enemies(c)) entwine(c, en, N(c).n);
    }),
    upgrade: { nums: { d: 16, n: 3 } },
  },
  {
    id: 'brambleboo/too-close-to-the-pot', name: 'Too Close to the Pot', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['briar'],
    text: 'Deal {d} damage. Gain {b} Guard for each Mature [Briar], up to {m0}.',
    flavor: 'It leaned in. That was its choice.',
    nums: { d: 10, b: 5, m0: 15 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      U.guard(c, Math.min(N(c).m0, N(c).b * matureOf(c, BRIAR).length));
    }),
    upgrade: { nums: { d: 14, b: 7, m0: 21 } },
  },
  {
    id: 'brambleboo/compost-catapult', name: 'Compost Catapult', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['compost'],
    text: 'Spend up to {n} [Compost]. Deal {d} damage, and again for each spent.',
    flavor: 'It is mostly leaf mould. It is travelling very fast.',
    nums: { d: 5, n: 3, hits: 4 },
    balance: { scalesWith: 'Compost spent' },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      let spent = 0;
      while (spent < N(c).n && spendCompost(c, 1)) spent++;
      for (let i = 0; i < spent; i++) U.hitAt(c, t, N(c).d);
    }),
    upgrade: { nums: { d: 7, n: 3, hits: 4 } },
  },
  {
    id: 'brambleboo/climbing-the-chandelier', name: 'Climbing the Chandelier', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['garden'],
    text: 'Deal {d} damage. Costs 1 Nerve if a Plant became Mature this turn.',
    flavor: 'All the way up. Everyone is nervous.',
    nums: { d: 17 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (U.mm(c).maturedThisTurn ? 1 : 2),
    upgrade: { nums: { d: 22 } },
  },
  {
    id: 'brambleboo/tangled-up-together', name: 'Tangled Up Together', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['vines'],
    text: 'Move any [Vines] from one enemy to another, then deal {d} damage to both.',
    flavor: 'Now they are a single problem.',
    nums: { d: 12 },
    effect: eff(async (c) => {
      const pool = U.enemies(c);
      if (pool.length < 2) { U.hitAll(c, N(c).d); return; }
      const [from] = await c.chooseEnemy({ pool, count: 1, prompt: 'Take Vines from which enemy?' });
      const rest = pool.filter(x => x !== from);
      const [to] = await c.chooseEnemy({ pool: rest, count: 1, prompt: 'And give them to?' });
      if (from && to) {
        const moved = stripVines(c, from, vinesOn(c, from));
        entwine(c, to, moved);
        U.hitAt(c, from, N(c).d);
        U.hitAt(c, to, N(c).d);
      }
    }),
    upgrade: { nums: { d: 16 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'brambleboo/repot', name: 'Repot', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['garden', 'uproot', 'compost'],
    text: '[Uproot] a Plant, then put the same Cultivar back in that Plot with {g} Growth.',
    flavor: 'A bigger pot. Or the same pot, turned round.',
    nums: { g: 1 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: garden(c).filter(x => !x.data.repotted), prompt: 'Repot which Plant?' });
      if (!p) return;
      const { cultivar, slot } = { cultivar: p.data.cultivar, slot: p.slot };
      uproot(c, p);
      const made = plant(c, cultivar, { growth: N(c).g, slot, force: true });
      if (made) made.data.repotted = true;
    }),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'brambleboo/take-a-cutting', name: 'Take a Cutting', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['propagate', 'weed'],
    text: '[Propagate] a Mature Plant into up to {n} empty Plots. Making two adds a [Weed].',
    flavor: 'Two jars. Two windowsills. Twice the trouble.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), prompt: 'Take a cutting from which Plant?' });
      if (!p) return;
      let made = 0;
      for (let i = 0; i < N(c).n; i++) if (propagate(c, p)) made++;
      if (made >= 2) addWeed(c, 1);
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'brambleboo/compost-tea', name: 'Compost Tea', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['compost', 'garden'],
    text: 'Spend up to {n} [Compost], each giving an immature Plant 1 Growth. One Plant maturing gains {b} Guard.',
    flavor: 'It smells appalling. It works.',
    nums: { n: 2, b: 9 },
    effect: eff(async (c) => {
      let matured = false;
      for (let i = 0; i < N(c).n; i++) {
        if (!immature(c).length || !spendCompost(c, 1)) break;
        const p = await pickPlant(c, { pool: immature(c), prompt: 'Feed which Plant?' });
        if (!p) break;
        if (grow(c, p, 1)) matured = true;
      }
      if (matured) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { n: 3, b: 13 } },
  },
  {
    id: 'brambleboo/night-watering', name: 'Night Watering', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['garden', 'weed'],
    text: 'Every immature Plant gains 1 Growth. Add a [Weed] to your discard pile.',
    flavor: 'The whole house, at three in the morning.',
    nums: {},
    effect: eff((c) => { for (const p of immature(c)) grow(c, p, 1); addWeed(c, 1); }),
    upgrade: { text: 'Every immature Plant gains 2 Growth. Add a [Weed] to your discard pile.' },
  },
  {
    id: 'brambleboo/pin-to-the-carpet', name: 'Pin to the Carpet', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['entwine', 'vines'],
    text: '[Entwine] {n} on one enemy. Until your next turn your own Tricks cannot take those [Vines] off.',
    flavor: 'Pinned. Like a very cross butterfly.',
    nums: { n: 3 },
    effect: eff((c) => {
      const t = c.target;
      entwine(c, t, N(c).n);
      if (t) { const s = U.mm(c); s.pinned = s.pinned || {}; s.pinned[t.id] = true; }
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'brambleboo/follow-the-draft', name: 'Follow the Draft', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: ALL_ENEMIES, exhaust: true, keywords: ['vines', 'vanish'],
    text: 'Move up to {n} [Vines] between enemies. Moving {m0} or more draws {c1}. [Vanish].',
    flavor: 'Everything in this house moves when the door opens.',
    nums: { n: 3, m0: 2, c1: 1 },
    effect: eff((c) => {
      const pool = U.enemies(c).filter(x => !(U.mm(c).pinned || {})[x.id]);
      if (pool.length < 2) return;
      const from = pool.reduce((a, b) => (vinesOn(c, b) > vinesOn(c, a) ? b : a), pool[0]);
      const to = pool.find(x => x !== from);
      const moved = stripVines(c, from, Math.min(N(c).n, vinesOn(c, from)));
      entwine(c, to, moved);
      if (moved >= N(c).m0) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 5, m0: 2, c1: 2 } },
  },
  {
    id: 'brambleboo/deadhead', name: 'Deadhead', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['uproot', 'compost', 'garden'],
    text: '[Uproot] a Mature Plant, gain {n} extra [Compost], and put a different Cultivar there with {g} Growth.',
    flavor: 'It has had its moment. Something else can have a go.',
    nums: { n: 1, g: 1 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), prompt: 'Deadhead which Plant?' });
      if (!p) return;
      const { cultivar, slot } = { cultivar: p.data.cultivar, slot: p.slot };
      uproot(c, p);
      gainCompost(c, N(c).n);
      const want = await pickCultivar(c, 'Plant what in its place?');
      plant(c, want === cultivar ? (CULTIVARS.find(k => k !== cultivar) || cultivar) : want,
        { growth: N(c).g, slot, force: true });
    }),
    upgrade: { nums: { n: 2, g: 1 } },
  },
  {
    id: 'brambleboo/four-corners', name: 'Four Corners', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['garden'],
    text: '[Plant] two different Cultivars into two empty Plots.',
    flavor: 'One in each corner. It is only fair.',
    nums: {},
    playable: (c) => plotsFree(c) >= 2,
    effect: eff(async (c) => {
      const a = await pickCultivar(c, 'Plant what first?');
      plant(c, a, { force: true });
      const rest = CULTIVARS.filter(k => k !== a);
      const picked = await c.choose({ options: rest.map(k => CULTIVAR_NAME[k]), prompt: 'And what next?' });
      plant(c, rest[picked[0]] || rest[0], { force: true });
    }),
    upgrade: { text: '[Plant] two different Cultivars into two empty Plots, each with 1 Growth.' },
  },
  {
    id: 'brambleboo/moonlit-conservatory', name: 'Moonlit Conservatory', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['moonflower', 'harvest'],
    text: 'The next time you [Harvest] a Mature [Moonflower] this turn it stays, at 0 Growth and no [Compost].',
    flavor: 'Glass, moonlight, and a great deal of condensation.',
    nums: {},
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: matureOf(c, MOON), optional: true, prompt: 'Which Moonflower?' });
      if (p) U.mm(c).conservatoryFor = p.id;
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'brambleboo/mulch-the-evidence', name: 'Mulch the Evidence', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['weed', 'compost', 'vanish'],
    text: 'Remove up to {n} [Weed]s from the fight. Gain {m0} [Compost] for each. [Vanish].',
    flavor: 'What weeds? There were never any weeds.',
    nums: { n: 2, m0: 1 },
    effect: eff((c) => { gainCompost(c, removeWeeds(c, N(c).n) * N(c).m0); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'brambleboo/pull-the-curtain', name: 'Pull the Curtain', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['entwine'],
    text: 'Gain {b} Guard. [Entwine] {n} on every enemy that is winding up to Attack.',
    flavor: 'Whatever was going to happen is now happening behind a curtain.',
    nums: { b: 9, n: 1 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      for (const en of U.enemies(c)) {
        const m = en.pendingMove;
        if (m && String(m.intent || '').startsWith('attack')) entwine(c, en, N(c).n);
      }
    }),
    upgrade: { nums: { b: 13, n: 2 } },
  },
  {
    id: 'brambleboo/keep-the-cutting', name: 'Keep the Cutting', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['harvest', 'garden'],
    text: '[Harvest] a Mature Plant, then [Plant] that same Cultivar again with 0 Growth.',
    flavor: 'The good bit, saved. The rest, used.',
    nums: {},
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), prompt: 'Harvest which Plant?' });
      if (!p) return;
      const cultivar = p.data.cultivar;
      harvest(c, p);
      plant(c, cultivar, { force: true });
    }),
    upgrade: { text: '[Harvest] a Mature Plant, then [Plant] that same Cultivar again with 1 Growth.' },
  },
  {
    id: 'brambleboo/tangled-hallway', name: 'Tangled Hallway', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['entwine', 'vines'],
    text: '[Entwine] {n} on every enemy. Anything already holding 2 [Vines] gets {m0} more.',
    flavor: 'Nobody is getting down that corridor quickly.',
    nums: { n: 1, m0: 1 },
    effect: eff((c) => {
      for (const en of U.enemies(c)) {
        const had = vinesOn(c, en);
        entwine(c, en, N(c).n + (had >= 2 ? N(c).m0 : 0));
      }
    }),
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'brambleboo/potbound', name: 'Potbound', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['garden'],
    text: 'Gain {b} Guard with no empty Plot, otherwise {w}. You cannot [Plant] again this turn.',
    flavor: 'Root against root against root.',
    nums: { b: 16, w: 9 },
    effect: eff((c) => {
      U.guard(c, plotsFree(c) === 0 ? N(c).b : N(c).w);
      U.mm(c).noPlantTurn = U.turn(c);
    }),
    upgrade: { nums: { b: 22, w: 13 } },
  },
  {
    id: 'brambleboo/sweep-the-weeds', name: 'Sweep the Weeds', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weed'],
    text: 'Remove every [Weed] from the fight. Draw {c1} for each, up to {m0}.',
    flavor: 'A brisk, thorough, faintly vengeful sweep.',
    nums: { c1: 1, m0: 2 },
    effect: eff((c) => { U.draw(c, Math.min(N(c).m0, removeWeeds(c, 99) * N(c).c1)); }),
    upgrade: { nums: { c1: 1, m0: 3 } },
  },
  {
    id: 'brambleboo/graft', name: 'Graft', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['garden', 'uproot'],
    text: '[Uproot] a Plant. Another Plant also gains that Cultivar’s Mature effect. One Graft each.',
    flavor: 'Held together with string and considerable optimism.',
    nums: {},
    effect: eff(async (c) => {
      if (garden(c).length < 2) return;
      const donor = await pickPlant(c, { prompt: 'Take the graft from which Plant?' });
      if (!donor) return;
      const cultivar = donor.data.cultivar;
      const rest = garden(c).filter(x => x !== donor && !x.data.graft);
      if (!rest.length) return;
      const host = await pickPlant(c, { pool: rest, prompt: 'And graft it onto?' });
      uproot(c, donor);
      if (host) { host.data.graft = cultivar; c.updateObject(host.id, { graft: cultivar }); }
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'brambleboo/bloom-schedule', name: 'Bloom Schedule', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['garden', 'weed', 'vanish'],
    text: 'Either hold back this turn’s Growth and draw {c1}, or grow one Plant now and add a [Weed]. [Vanish].',
    flavor: 'Written on the back of an envelope. Adhered to strictly.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const pick = await c.choose({ options: ['Hold the Growth back and draw', 'Grow one now, and a Weed'], prompt: 'Bloom Schedule' });
      if (pick[0] === 1) {
        const p = await pickPlant(c, { pool: immature(c), optional: true, prompt: 'Grow which Plant?' });
        if (p) { grow(c, p, 1); addWeed(c, 1); }
      } else { U.mm(c).holdGrowth = true; U.draw(c, N(c).c1); }
    }),
    upgrade: { nums: { c1: 2 } },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'brambleboo/house-takes-root', name: 'House Takes Root', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['entwine'],
    text: 'The first time you [Entwine] each turn, a second enemy gets 1 too — or the same one, alone.',
    flavor: 'It is in the walls now. All of the walls.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/house-takes-root', (x, s) => { s.houseTakesRoot = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/perennial-problem', name: 'Perennial Problem', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['garden'],
    text: 'The first Plant to leave your [Garden] each turn comes back at 0 Growth, if there is room.',
    flavor: 'You have not got rid of it. You have never got rid of it.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/perennial-problem', (x, s) => { s.perennial = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/thorny-disposition', name: 'Thorny Disposition', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['snare', 'briar'],
    text: 'Whenever an enemy is [Snare]d, every Mature [Briar] deals {m0}. Once per enemy each turn.',
    flavor: 'Caught. And then, immediately, punished.',
    nums: { m0: 5 },
    effect: eff((c) => power(c, 'brambleboo/thorny-disposition', (x, s) => { s.thornyDisposition = N(x).m0; })),
    upgrade: { nums: { m0: 8 } },
  },
  {
    id: 'brambleboo/closed-terrarium', name: 'Closed Terrarium', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['overgrown', 'weed', 'uproot'],
    text: 'Ending a turn [Overgrown], you may [Uproot] one Plant to keep that turn’s [Weed] out.',
    flavor: 'Sealed. Self-sustaining. Absolutely full.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/closed-terrarium', (x, s) => { s.closedTerrarium = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/creeping-through-the-walls', name: 'Creeping Through the Walls', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['garden', 'entwine'],
    text: 'Whenever a Plant becomes Mature, [Entwine] {n} on every enemy.',
    flavor: 'Behind the plaster. Between the joists. Everywhere.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'brambleboo/creeping-through-the-walls', (x, s) => { s.creepingWalls = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/kitchen-compost', name: 'Kitchen Compost', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weed', 'compost'],
    text: 'Removing a [Weed] makes your next Planting Trick that turn cost 0.',
    flavor: 'A bucket by the sink. Nobody asks about the bucket.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/kitchen-compost', (x, s) => { s.kitchenCompost = true; })),
    upgrade: { cost: 0 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'brambleboo/the-house-bites-back', name: 'The House Bites Back', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['garden'],
    text: 'Deal {d} damage to all enemies. Then every Mature Plant does its thing once more.',
    flavor: 'All of it. At once. Politely, but all of it.',
    nums: { d: 20 },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      for (const obj of mature(c)) {
        if (obj.data.cultivar === BRIAR) { const t = U.rpick(c, U.enemies(c)); if (t) U.hitAt(c, t, 5); }
        else matureEffect(c, obj.data.cultivar, obj);
      }
    }),
    upgrade: { nums: { d: 27 } },
  },
  {
    id: 'brambleboo/tug-the-whole-room', name: 'Tug the Whole Room', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['vines'],
    text: 'Take every [Vines] off every enemy, up to {n}. Deal {d} damage for each one taken.',
    flavor: 'One good pull.',
    nums: { d: 4, n: 12, hits: 6 },
    balance: { scalesWith: 'Vines removed' },
    effect: eff((c) => {
      let taken = 0;
      for (const en of U.enemies(c)) {
        if ((U.mm(c).pinned || {})[en.id]) continue;
        if (taken >= N(c).n) break;
        taken += stripVines(c, en, Math.min(vinesOn(c, en), N(c).n - taken));
      }
      for (let i = 0; i < taken; i++) U.hitRandom(c, N(c).d);
    }),
    upgrade: { nums: { d: 6, n: 12, hits: 6 } },
  },
  {
    id: 'brambleboo/bramble-stampede', name: 'Bramble Stampede', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['briar'],
    text: 'Every Mature [Briar] answers each enemy that attacked since your last turn. Then deal {d} to all.',
    flavor: 'All of them. Coming down the hall.',
    nums: { d: 12, m0: 5 },
    balance: { scalesWith: 'Mature Briars' },
    effect: eff((c) => {
      const seen = U.mm(c).attackedSinceMyTurn || {};
      for (const b of matureOf(c, BRIAR)) {
        for (const en of U.enemies(c)) if (seen[en.id]) { U.hitAt(c, en, N(c).m0); entwine(c, en, 1); }
      }
      U.hitAll(c, N(c).d);
    }),
    upgrade: { nums: { d: 16, m0: 8 } },
  },
  {
    id: 'brambleboo/drop-the-hanging-basket', name: 'Drop the Hanging Basket', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['harvest'],
    text: '[Harvest] a Mature Plant, then deal {d} damage.',
    flavor: 'It was always going to come down eventually.',
    nums: { d: 30 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), optional: true, prompt: 'Harvest which Plant?' });
      if (p) harvest(c, p);
      U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 38 } },
  },
  {
    id: 'brambleboo/rootquake', name: 'Rootquake', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['vines', 'snare'],
    text: 'Deal {d} damage. With 4 [Vines] you may spend them to guarantee its next Attack is [Snare]d.',
    flavor: 'The floor is not a floor. The floor is roots.',
    nums: { d: 26 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (!t || vinesOn(c, t) < SNARE_AT) return;
      stripVines(c, t, SNARE_AT);
      const s = U.mm(c);
      s.forcedSnare = s.forcedSnare || {};
      s.forcedSnare[t.id] = true;
    }),
    upgrade: { nums: { d: 34 } },
  },
  {
    id: 'brambleboo/everywhere-at-once', name: 'Everywhere at Once', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['entwine', 'garden'],
    text: 'Deal {d} damage to all enemies and [Entwine] {n} on each. All four Cultivars planted: do it twice.',
    flavor: 'Every room. Every wall. Simultaneously.',
    nums: { d: 14, n: 2 },
    effect: eff((c) => {
      const kinds = new Set(garden(c).map(o => o.data.cultivar));
      const times = kinds.size >= 4 ? 2 : 1;
      for (let i = 0; i < times; i++) U.hitAll(c, N(c).d);
      for (const en of U.enemies(c)) entwine(c, en, N(c).n);
    }),
    upgrade: { nums: { d: 19, n: 3 } },
  },
  {
    id: 'brambleboo/pruning-frenzy', name: 'Pruning Frenzy', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['garden'],
    text: 'Deal {d} damage twice, and once more for each Plant that left your [Garden] this turn.',
    flavor: 'He has lost control of the scissors.',
    nums: { d: 4, hits: 6 },
    balance: { scalesWith: 'Plants that left this turn' },
    effect: eff((c) => U.hitN(c, N(c).d, Math.min(6, 2 + (U.mm(c).leftThisTurn || 0)))),
    upgrade: { nums: { d: 6, hits: 6 } },
  },
  {
    id: 'brambleboo/very-hungry-houseplant', name: 'Very Hungry Houseplant', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['harvest'],
    text: 'Deal {d} damage. You may [Harvest] up to {n} Mature Plants, repeating this after each.',
    flavor: 'It is still hungry. It is always still hungry.',
    nums: { d: 10, n: 3, hits: 4 },
    balance: { scalesWith: 'Plants Harvested' },
    effect: eff(async (c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      for (let i = 0; i < N(c).n; i++) {
        const ripe = mature(c);
        if (!ripe.length) break;
        const p = await pickPlant(c, { pool: ripe, optional: true, prompt: 'Harvest which Plant?' });
        if (!p) break;
        harvest(c, p);
        U.hitAt(c, t, N(c).d);
      }
    }),
    upgrade: { nums: { d: 14, n: 3, hits: 4 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'brambleboo/secret-greenhouse', name: 'Secret Greenhouse', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['garden', 'vanish'],
    text: 'A fifth Plot for the rest of the fight. [Plant] a Cultivar there with {g} Growth. [Vanish].',
    flavor: 'Behind the pantry. Nobody has been in for years.',
    nums: { g: 1 },
    effect: eff(async (c) => {
      const s = U.mm(c);
      s.extraPlots = 1;
      const want = await pickCultivar(c, 'Plant what in the greenhouse?');
      plant(c, want, { growth: N(c).g, force: true });
    }),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'brambleboo/midnight-bloom', name: 'Midnight Bloom', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['garden', 'weed'],
    text: 'Every immature Plant becomes Mature. Add a [Weed] for each that skipped any Growth.',
    flavor: 'All at once, in the dark, with a noise like paper.',
    nums: {},
    effect: eff((c) => {
      let skipped = 0;
      for (const p of immature(c).slice()) {
        const need = matureAt(c) - p.data.growth;
        if (need > 1) skipped++;
        grow(c, p, Math.max(1, need));
      }
      addWeed(c, skipped);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/tear-up-the-floorboards', name: 'Tear Up the Floorboards', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['uproot', 'compost', 'entwine'],
    text: '[Uproot] any number of Plants. [Entwine] 1 for each. Draw {c1} for each different Cultivar, up to {m0}.',
    flavor: 'It turns out the whole floor was holding it up.',
    nums: { c1: 1, m0: 3 },
    effect: eff((c) => {
      const all = garden(c).slice();
      const kinds = new Set(all.map(o => o.data.cultivar));
      for (const p of all) {
        uproot(c, p);
        const t = U.rpick(c, U.enemies(c));
        if (t) entwine(c, t, 1);
      }
      U.draw(c, Math.min(N(c).m0, kinds.size * N(c).c1));
    }),
    upgrade: { nums: { c1: 1, m0: 4 } },
  },
  {
    id: 'brambleboo/perfect-cutting', name: 'Perfect Cutting', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['propagate', 'weed', 'vanish'],
    text: '[Propagate] a Mature Plant with {g} Growth into every empty Plot. A [Weed] for each after the first. [Vanish].',
    flavor: 'The right cut, on the right night, from the right stem.',
    nums: { g: 1 },
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), prompt: 'Take cuttings from which Plant?' });
      if (!p) return;
      let made = 0;
      while (plotsFree(c) > 0) {
        if (!plant(c, p.data.cultivar, { growth: N(c).g, force: true })) break;
        made++;
      }
      if (made > 1) addWeed(c, made - 1);
    }),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'brambleboo/compost-cathedral', name: 'Compost Cathedral', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['compost', 'garden', 'entwine', 'weed'],
    text: 'Spend up to {n} [Compost]. Each one grows a Plant, [Entwine]s 1, pulls a [Weed], or gains {b} Guard.',
    flavor: 'Enormous. Warm. Steaming gently.',
    nums: { n: 6, b: 5 },
    effect: eff(async (c) => {
      for (let i = 0; i < N(c).n; i++) {
        if (!spendCompost(c, 1)) break;
        const pick = await c.choose({
          options: ['Grow a Plant', 'Entwine an enemy', 'Pull a Weed', `Gain ${N(c).b} Guard`],
          prompt: 'Compost Cathedral',
        });
        if (pick[0] === 0) { const p = await pickPlant(c, { pool: immature(c), optional: true, prompt: 'Grow which?' }); if (p) grow(c, p, 1); }
        else if (pick[0] === 1) { const t = U.rpick(c, U.enemies(c)); if (t) entwine(c, t, 1); }
        else if (pick[0] === 2) removeWeeds(c, 1);
        else U.guard(c, N(c).b);
      }
    }),
    upgrade: { nums: { n: 8, b: 7 } },
  },
  {
    id: 'brambleboo/prune-to-the-heart', name: 'Prune to the Heart', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['harvest', 'vanish'],
    text: '[Harvest] a Mature Plant. Its [Harvest] happens twice, and it still gives only 1 [Compost]. [Vanish].',
    flavor: 'Right down to the wood.',
    nums: {},
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), prompt: 'Harvest which Plant?' });
      if (!p) return;
      harvestEffect(c, p.data.cultivar, p);
      harvest(c, p);
    }),
    upgrade: { cost: 0, text: '[Harvest] a Mature Plant. Its [Harvest] happens three times, for 1 [Compost]. [Vanish].' },
  },
  {
    id: 'brambleboo/invasive-species', name: 'Invasive Species', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['vines', 'entwine'],
    text: 'Every other enemy gains [Vines] to match the one you choose. Alone, it doubles instead.',
    flavor: 'It was not here last week. It is here now.',
    nums: {},
    effect: eff((c) => {
      const t = c.target || U.enemies(c)[0];
      if (!t) return;
      const n = vinesOn(c, t);
      const others = U.enemies(c).filter(x => x !== t);
      if (!others.length) { entwine(c, t, n); return; }
      for (const en of others) entwine(c, en, Math.max(0, n - vinesOn(c, en)));
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/four-seasons', name: 'Four Seasons in One Night', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['harvest', 'garden'],
    text: '[Harvest] any number of Mature Plants. Then [Plant] one Cultivar of your choice for each, with {g} Growth.',
    flavor: 'Spring by the stairs, autumn in the hall.',
    nums: { g: 1 },
    effect: eff(async (c) => {
      let n = 0;
      for (;;) {
        const ripe = mature(c);
        if (!ripe.length) break;
        const p = await pickPlant(c, { pool: ripe, optional: true, prompt: 'Harvest which Plant?' });
        if (!p) break;
        harvest(c, p);
        n++;
      }
      for (let i = 0; i < n; i++) {
        if (plotsFree(c) <= 0) break;
        const want = await pickCultivar(c, 'Plant what?');
        plant(c, want, { growth: N(c).g, force: true });
      }
    }),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'brambleboo/the-mansion-waters-back', name: 'The Mansion Waters Back', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['garden', 'weed', 'vanish'],
    text: 'This turn, every Trick you pay Nerve for grows a Plant, once each. A [Weed] at the end. [Vanish].',
    flavor: 'The pipes are doing it. Nobody asked the pipes.',
    nums: {},
    effect: eff((c) => {
      const s = U.mm(c);
      s.mansionWaters = true;
      s.mansionWatersWeed = true;
      s.wateredIds = {};
    }),
    upgrade: { text: 'This turn, every Trick you pay Nerve for grows a Plant, once each. No [Weed]. [Vanish].' },
  },
  {
    id: 'brambleboo/borrowed-sunlight', name: 'Borrowed Sunlight', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['garden', 'harvest'],
    text: 'Until end of turn one Plant counts as all four Cultivars, and may be [Harvest]ed as any of them.',
    flavor: 'There is only so much light. He is taking some.',
    nums: {},
    effect: eff(async (c) => {
      const p = await pickPlant(c, { prompt: 'Which Plant?' });
      if (!p) return;
      p.data.wild = true;
      c.updateObject(p.id, { wild: true });
    }),
    upgrade: { cost: 0 },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'brambleboo/the-mansion-is-my-trellis', name: 'The Mansion Is My Trellis', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['snare', 'vines'],
    text: '[Snare] needs only 3 [Vines], and takes ALL of them when it happens.',
    flavor: 'The whole house is something to climb.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/the-mansion-is-my-trellis', (x, s) => { s.trellis = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'brambleboo/ancient-houseplant', name: 'Ancient Houseplant', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['garden', 'weed'],
    text: 'Plants Mature at 1 Growth. Any that Matures on its first Growth adds a [Weed].',
    flavor: 'It came with the house. It may BE the house.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/ancient-houseplant', (x, s) => { s.ancient = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'brambleboo/never-stop-growing', name: 'Never Stop Growing', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['garden', 'weed'],
    text: 'End your turn with a free Plot and something random grows there. [Overgrown] instead: an extra [Weed].',
    flavor: 'It has not stopped. It is not going to stop.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/never-stop-growing', (x, s) => { s.neverStopGrowing = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/bloom-after-midnight', name: 'Bloom After Midnight', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['harvest', 'garden'],
    text: 'The first [Harvest] each turn leaves the Plant in the ground at 0 Growth. It gives no [Compost].',
    flavor: 'It closes at dawn and nobody has ever seen it happen.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/bloom-after-midnight', (x, s) => { s.bloomAfterMidnight = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'brambleboo/green-in-every-room', name: 'Green in Every Room', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['overgrown', 'weed'],
    text: '[Overgrown] needs only 3 Mature Plants. Overgrown turns end with 2 [Weed]s instead of 1.',
    flavor: 'Every room. He checked.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/green-in-every-room', (x, s) => { s.greenEveryRoom = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'brambleboo/the-garden-remembers', name: 'The Garden Remembers', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['harvest', 'garden'],
    text: 'A Cultivar you have [Harvest]ed comes back with 1 Growth, the first time each turn you [Plant] it.',
    flavor: 'It knows where it was. It goes back there.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/the-garden-remembers', (x, s) => { s.remembered = s.remembered || {}; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'brambleboo/no-more-empty-rooms', name: 'No More Empty Rooms', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['overgrown', 'harvest', 'weed'],
    text: 'While [Overgrown], every Mature effect and every [Harvest] happens twice. One more [Weed] each turn.',
    flavor: 'There are no empty rooms. There never were.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/no-more-empty-rooms', (x, s) => { s.noEmptyRooms = true; })),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const CUTTINGS = {
  ivy: { name: 'Borrowed Ivy', text: '[Entwine] 2. [Vanish].', run: (c) => { const t = c.target || c.randomEnemy(); if (t) U.apply(c, t, VINES, 2); } },
  briar: { name: 'Borrowed Briar', text: 'Deal 10 damage. [Vanish].', run: (c) => U.hit(c, 10) },
  moonflower: { name: 'Borrowed Moonflower', text: 'Draw 2, then put one back on top. [Vanish].', run: (c) => { U.draw(c, 2); } },
  moss: { name: 'Borrowed Moss', text: 'Gain 14 Guard. [Vanish].', run: (c) => U.guard(c, 14) },
};
const cuttingDef = (k) => ({
  id: `brambleboo/cutting-${k}`, name: CUTTINGS[k].name, companion: SLUG, type: SKILL, rarity: SPECIAL,
  cost: 0, target: k === 'ivy' || k === 'briar' ? ENEMY : SELF, exhaust: true, coop: true,
  keywords: ['garden', 'vanish'],
  text: CUTTINGS[k].text, flavor: 'A bit of somebody else’s houseplant.',
  nums: {}, effect: (c) => CUTTINGS[k].run(c),
  /* Borrowed Cuttings are made mid-fight and Vanish on use, so they can never
     reach an upgrade station. The entry is here because every def carries one. */
  upgrade: { text: `${CUTTINGS[k].text} It does not improve; it is a cutting.` },
});
const cuttings = CULTIVARS.map(cuttingDef);

const coopCards = [
  {
    id: 'brambleboo/pass-the-cutting', name: 'Pass the Cutting', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['garden'],
    text: 'Give a friend a free one-use cutting from one of your Mature Plants.',
    flavor: 'Here. Look after it. Do not overwater it.',
    nums: {},
    effect: eff(async (c) => {
      const p = await pickPlant(c, { pool: mature(c), prompt: 'A cutting from which Plant?' });
      if (!p) return;
      const ally = await c.chooseAlly();
      if (!ally) return;
      c.giveCard(ally, cuttingDef(p.data.cultivar), { pile: 'hand' });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'brambleboo/over-the-headboard', name: 'Over the Headboard', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['entwine', 'snare'],
    text: 'Before the next Attack on a friend, [Entwine] {n} on the attacker and check [Snare] again.',
    flavor: 'It came over the headboard while they were asleep.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      const s = U.mm(c);
      s.guarding = s.guarding || {};
      s.guarding[ally.id] = N(c).n;
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'brambleboo/compost-circle', name: 'Compost Circle', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, coop: true, keywords: ['compost'],
    text: 'Every friend may swap a Trick. Gain {n} [Compost] for each who does.',
    flavor: 'Everyone brings something. Mostly peelings.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      for (const mate of c.teammates()) {
        const pick = await c.askAlly(mate, { pool: c.allyCards(mate, 'hand'), prefer: 'cheapest' });
        const k = Array.isArray(pick) ? pick[0] : pick;
        if (!k) continue;
        c.allyMoveCard(mate, k, 'discard', {});
        c.giveDraw(mate, 1);
        gainCompost(c, N(c).n);
      }
      U.mm(c).extraFertilize = true;
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'brambleboo/safe-under-the-leaves', name: 'Safe Under the Leaves', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, coop: true, keywords: ['vines'],
    text: 'Once per friend each turn, spend 2 [Vines] from an attacker to give them {b} Guard first.',
    flavor: 'Room under there for everyone.',
    nums: { b: 10 },
    effect: eff((c) => power(c, 'brambleboo/safe-under-the-leaves', (x, s) => { s.safeUnderLeaves = N(x).b; })),
    upgrade: { nums: { b: 15 } },
  },
  {
    id: 'brambleboo/one-big-conservatory', name: 'One Big Conservatory', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, coop: true, keywords: ['garden', 'entwine'],
    text: 'Each friend’s turn starts with a choice: grow one of your Plants, or [Entwine] an enemy.',
    flavor: 'Glass all the way round. Everyone gets a chair.',
    nums: {},
    effect: eff((c) => power(c, 'brambleboo/one-big-conservatory', (x, s) => { s.conservatory = true; })),
    upgrade: { cost: 2 },
  },
];

export default {
  slug: SLUG,
  name: 'Brambleboo',
  title: 'the Haunted Houseplant',
  region: 'greenhouse',
  identity:
    'Brambleboo does not poison anything. He turns the room into a haunted indoor garden — four ' +
    'Plots holding Creeping Ivy, Briar, Moonflower or Grave Moss, each of which needs two turns ' +
    'to Mature and then pays every turn afterwards — while spreading Vines across the enemies. ' +
    'Vines do nothing at all until four of them Snare an Attack. The whole character is one ' +
    'sentence: a living garden is valuable, a harvested garden is valuable, and you cannot have ' +
    'both at the same time. Fill all four Plots and he is Overgrown, which unlocks his biggest ' +
    'Tricks and quietly fills his deck with Weeds.',
  strengths: [
    'The best long-fight scaling in the roster once four Plots are Mature',
    'Snare stops dangerous Attacks in a way no amount of Guard would',
    'Genuinely modular defence — the Garden can be rebuilt to suit the room',
    'Moonflowers make the whole deck consistent, not just bigger',
    'Compost turns yesterday’s sacrificed Garden into tomorrow’s',
    'Several real ways to play him rather than one mandatory engine',
  ],
  weaknesses: [
    'Slow to start, and the first dangerous turn often arrives before anything is Mature',
    'Only four Plots, so every Cultivar competes with every other',
    'Harvesting destroys the engine that made the payoff worth having',
    'Overgrown steadily contaminates the deck with Weeds',
    'Vines do very little against enemies that buff, summon or wait',
    'Moonflowers find Tricks without finding the Nerve to play them',
  ],
  startingHp: 74,
  startingEnergy: 3,
  mechanics: {
    garden: { name: 'The Garden', kind: 'resource', desc: 'Four Plots beside your deck, each holding one Plant. Plants are board objects, never Tricks. A new Plant has 0 Growth, gains 1 at the end of each of your turns, and is Mature at 2.', min: 0, max: 5, hooks: ['plant', 'mature'] },
    cultivars: { name: 'Cultivars', kind: 'system', desc: 'Creeping Ivy Entwines every turn and Harvests for 3 Vines. Briar answers every enemy Attack and Harvests for board damage. Moonflower draws and sculpts the top of your deck. Grave Moss Guards, and Harvests for Guard that does not expire.', min: 0, max: 4, hooks: [] },
    harvest: { name: 'Harvest / Uproot / Compost', kind: 'system', desc: 'Harvest resolves a Mature Plant’s payoff and removes it. Uproot removes any Plant with no payoff at all. Both give 1 Compost, and once a turn 1 Compost gives an immature Plant 1 Growth for free.', min: 0, max: 9, hooks: ['harvest', 'uproot'] },
    vines: { name: 'Vines / Snare', kind: 'status', desc: 'Up to 6 on an enemy, and they do nothing by existing. At the start of an Attack, 4 Vines are consumed to Snare it: a multi-hit loses its last hit, a single hit is reduced but never cancelled. Once per enemy per turn.', min: 0, max: 6, hooks: ['snare'] },
    overgrown: { name: 'Overgrown', kind: 'system', desc: 'All four Plots Mature. Several Tricks become dramatically stronger — and every Overgrown turn adds a Weed to your discard pile. It is a hazard you choose.', min: 0, max: 1, hooks: [] },
  },
  startingDeck: [
    'brambleboo/leaf-bop', 'brambleboo/leaf-bop', 'brambleboo/leaf-bop',
    'brambleboo/curl-the-leaves', 'brambleboo/curl-the-leaves', 'brambleboo/curl-the-leaves', 'brambleboo/curl-the-leaves',
    'brambleboo/tiny-creeper', 'brambleboo/cup-of-water', 'brambleboo/careful-snip',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares, WEED, ...cuttings],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Creeping Ivy Control', desc: 'Keep an Ivy or two Mature and keep the Vines coming until enemy Attacks are Snared as a matter of routine. Then decide, every turn, whether four Vines are defence or ammunition.', coreCards: ['brambleboo/wall-creeper', 'brambleboo/wallpaper-lash', 'brambleboo/tangled-hallway', 'brambleboo/pin-to-the-carpet', 'brambleboo/rootquake', 'brambleboo/the-mansion-is-my-trellis', 'brambleboo/house-takes-root'] },
    { name: 'Briar Retaliation', desc: 'Several Mature Briars make attacking him expensive — and every answer leaves another Vine, so the enemy walks itself into a Snare.', coreCards: ['brambleboo/little-bramble', 'brambleboo/thorn-flick', 'brambleboo/thorny-rebound', 'brambleboo/too-close-to-the-pot', 'brambleboo/bramble-stampede', 'brambleboo/thorny-disposition', 'brambleboo/creeping-through-the-walls'] },
    { name: 'Moonflower Harvest Engine', desc: 'Sculpt the next three hands, then Harvest and regrow on exactly the turn the deck is ready for it. Consistency as a win condition.', coreCards: ['brambleboo/moon-in-the-window', 'brambleboo/window-seat', 'brambleboo/moonlit-conservatory', 'brambleboo/keep-the-cutting', 'brambleboo/bloom-after-midnight', 'brambleboo/perennial-problem', 'brambleboo/the-garden-remembers'] },
    { name: 'Prune and Regrow', desc: 'Treat Plants as machinery, not furniture. Enter the turn with one Garden and leave it with another.', coreCards: ['brambleboo/careful-pruning', 'brambleboo/repot', 'brambleboo/deadhead', 'brambleboo/make-room', 'brambleboo/four-seasons', 'brambleboo/very-hungry-houseplant', 'brambleboo/pruning-frenzy'] },
    { name: 'Overgrown', desc: 'Fill all four Plots and stay there, taking the Weeds as the cost of the biggest Tricks in the pool. The Compost economy is what makes the deck survivable.', coreCards: ['brambleboo/room-full-of-leaves', 'brambleboo/over-the-doorframe', 'brambleboo/everywhere-at-once', 'brambleboo/mulch-the-evidence', 'brambleboo/sweep-the-weeds', 'brambleboo/closed-terrarium', 'brambleboo/no-more-empty-rooms'] },
  ],
};
