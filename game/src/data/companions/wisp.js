/**
 * Wisp, the Baby Will-o'-Wisp.  OWNER: companion-cards.
 * Spec: docs/design/companions/02-wisp.md
 *
 * Glow · Bright / Blazing · Linger X · The Gloaming · Afterglow · Converge ·
 * Hasten X / Delay X · Flare X
 *
 * Wisp plays half of every turn now and half of it later. A Lingering Trick
 * leaves the deck entirely and sits face up in the Gloaming with a countdown;
 * when the countdown reaches 0 its Afterglow resolves. Two or more Afterglows
 * landing in the same batch is a Convergence, which is the whole point of her.
 *
 * ── Where the Gloaming actually lives ───────────────────────────────────────
 *
 * The cards sit in the engine's `limbo` pile — the same zone Wink's Sets use —
 * and the countdown lives beside them in tracker state rather than on the card,
 * so a Trick that leaves the Gloaming carries nothing stale with it.
 *
 * ── The two things that are easy to get wrong ───────────────────────────────
 *
 * 1. A BATCH IS ONE BATCH. Every countdown ticks SIMULTANEOUSLY, and everything
 *    that reaches 0 resolves together as one batch with at most one Convergence
 *    — "regardless of how many Afterglows are involved". Resolving them one at a
 *    time in a loop, each checking whether it was alone, would make Converge
 *    fire once per card and turn every archetype into the Convergence one.
 *
 * 2. AN AFTERGLOW IS NOT A TRICK BEING PLAYED. It must not fire "whenever you
 *    play a Trick" effects, so it never goes through `playCard` — the stored
 *    function is called directly with a tracker ctx.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'wisp';
const N = U.N;

const GLOW = 'glow';
const BASE_GLOW_CAP = 6;
const BIG_GLOW_CAP = 9;
const BRIGHT_AT = 3;
const BLAZING_AT = 6;

const GLOW_DESC = 'Wisp starts each combat with 0 and holds at most 6. Bright at 3, Blazing at 6.';

const eff = (fn) => (c) => {
  U.ensure(c, SLUG);
  const r = fn(c);
  if (r && typeof r.then === 'function') return r.then((v) => { settleLinger(c); return v; });
  settleLinger(c);
  return r;
};

// ── Glow ────────────────────────────────────────────────────────────────────
const glow = (c) => U.res(c, GLOW);
const glowCap = (c) => (U.mm(c).bigGlow ? BIG_GLOW_CAP : BASE_GLOW_CAP);
const isBright = (c) => glow(c) >= BRIGHT_AT;
const isBlazing = (c) => glow(c) >= BLAZING_AT;

function gainGlow(c, n) {
  if (n <= 0) return 0;
  const cap = glowCap(c);
  const before = glow(c);
  const give = Math.min(n, Math.max(0, cap - before));
  if (give <= 0) return 0;
  // Clamped here, not by addRes's `max` — Glow is counter-backed and addRes
  // hands the whole delta to addCounter. See the note on addRes in _util.js.
  U.addRes(c, GLOW, give, 0, cap);
  return glow(c) - before;
}

function spendGlow(c, n) {
  const have = Math.min(n, glow(c));
  if (have <= 0) return 0;
  U.addRes(c, GLOW, -have, 0, glowCap(c));
  const s = U.mm(c);
  if (s.neverGoesOut && U.once(c, 'neverGoesOut')) U.atTurnEnd(c, (x) => gainGlow(x, have >= 3 ? 2 : 1));
  if (s.flickerFeedback && U.once(c, 'flickerFeedback')) {
    const list = gloaming(c);
    if (list.length) hasten(c, U.rpick(c, list), 1);
  }
  if (s.staticWallpaper && U.once(c, 'staticWallpaper')) U.hitRandom(c, 4);
  U.fire(c, 'flared', { amount: have });
  return have;
}

/** Flare X: optionally spend X Glow for the listed bonus. */
const canFlare = (c, n) => glow(c) >= n;
const flare = (c, n) => (canFlare(c, n) ? spendGlow(c, n) === n : false);

// ── The Gloaming ────────────────────────────────────────────────────────────
const gloaming = (c) => (U.mm(c).gloaming || (U.mm(c).gloaming = []));
const gloamingSize = (c) => gloaming(c).length;

/**
 * Queue this Trick to enter the Gloaming once its immediate effect has fully
 * resolved. Placed by `eff()` rather than inside the effect so a card that asks
 * a question still lands in the right order.
 */
function linger(c, count) {
  U.mm(c).pendingLinger = { card: c.card, count, def: c.card && c.card.def };
}

function settleLinger(c) {
  const s = U.mm(c);
  const p = s.pendingLinger;
  if (!p || !p.card) return;
  s.pendingLinger = null;
  /* The card cannot be moved here. While a Trick is resolving the engine parks
     it in LIMBO, and the moment the effect returns it checks `pileOf(card) ===
     LIMBO` and pushes it to the discard pile — so moving it to limbo from
     inside the effect is a no-op that the engine then undoes. The Gloaming
     entry is created now (countdowns have to be right immediately) and the
     physical card is pulled out of the discard pile on `card:resolved`, which
     is emitted after that placement. */
  s.awaitingLinger = p.card;
  gloaming(c).push({ card: p.card, def: p.def, count: Math.max(0, p.count), delayed: 0, hastened: 0, stored: 0 });
  if (s.brighterEveryMinute && U.once(c, 'brighterEveryMinute')) U.guard(c, 4);
  U.fire(c, 'lingered', { card: p.card });
  if (s.gloamingCrowded && gloamingSize(c) >= 4 && U.once(c, 'gloamingCrowded')) { U.draw(c, 2); U.energy(c, 1); }
}

function hasten(c, entry, n) {
  if (!entry || n <= 0) return false;
  entry.count = Math.max(0, entry.count - n);
  entry.hastened += n;
  const s = U.mm(c);
  if (entry.count === 0) {
    if (s.cantWait && U.once(c, 'cantWait')) U.hitRandom(c, 4);
    resolveBatch(c, [entry]);
    return true;
  }
  return false;
}

function delay(c, entry, n) {
  if (!entry || n <= 0) return false;
  entry.count += n;
  entry.delayed += n;
  const s = U.mm(c);
  if (s.thisOneCooking && entry.def && entry.def.id === 'wisp/this-ones-been-cooking') entry.stored += 1;
  if (s.iCanWait && U.once(c, 'iCanWait')) U.guard(c, 6);
  U.fire(c, 'delayed', { entry });
  return true;
}

/**
 * Resolve a set of Afterglows as ONE batch. At most one Convergence, however
 * many Tricks are involved — see the header.
 */
function resolveBatch(c, entries, opts = {}) {
  const list = entries.filter(Boolean);
  if (!list.length) return;
  const s = U.mm(c);
  const converged = list.length >= 2;
  const all = gloaming(c);
  for (const e of list) {
    const i = all.indexOf(e);
    if (i >= 0) all.splice(i, 1);
  }
  for (const e of list) {
    const def = e.def;
    const fn = def && def.afterglow;
    if (fn) {
      try { fn(c, { entry: e, noGlow: !!opts.noGlow, converged }); }
      catch (err) { console.error('[wisp] afterglow ' + (def && def.id) + ' threw', err); }
    }
    if (converged && def && def.converge) {
      try { def.converge(c, { entry: e }); } catch (err) { console.error('[wisp] converge threw', err); }
    }
    if (s.homeInTheDark && U.once(c, 'homeInTheDark')) U.guard(c, 4);
    if (s.gentleLanding > 0) { U.guard(c, 4); s.gentleLanding--; }
    s.afterglowsThisTurn = (s.afterglowsThisTurn || 0) + 1;
    U.fire(c, 'afterglow', { entry: e });
    if (e.card) {
      if (e.vanish) { U.makeVanish(c, e.card); c.exhaust(e.card); }
      else U.moveCard(c, e.card, 'discard', {});
    }
  }
  if (converged) {
    s.convergedThisTurn = (s.convergedThisTurn || 0) + 1;
    if (s.gettingExcited && U.once(c, 'gettingExcited')) gainGlow(c, 1);
    if (s.constellation && U.once(c, 'constellation')) { U.draw(c, 1); gainGlow(c, 1); }
    U.fire(c, 'converge', { entries: list });
  }
  // Falling Dominoes: the first Afterglow each turn Hastens everything else,
  // and whatever reaches 0 resolves as a NEW batch rather than joining this one.
  if (s.fallingDominoes && U.once(c, 'fallingDominoes')) {
    const rest = gloaming(c).slice();
    const popped = [];
    for (const e of rest) { e.count = Math.max(0, e.count - 1); if (e.count === 0) popped.push(e); }
    if (popped.length) resolveBatch(c, popped);
  }
}

const glowFrom = (c, n, o) => { if (!o || !o.noGlow) gainGlow(c, n); };

const power = (c, id, n, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: GLOW, name: 'Glow', icon: 'glow', min: 0, max: BASE_GLOW_CAP, start: 0, desc: GLOW_DESC,
      states: [{ from: BLAZING_AT, to: BIG_GLOW_CAP, label: 'Blazing' }, { from: BRIGHT_AT, to: BLAZING_AT - 1, label: 'Bright' }] },
  ]);
  const fake = () => U.trackerCtx(e, seat);

  /* Finish the move into the Gloaming. See settleLinger: the engine places the
     played card AFTER the effect returns, so this is the first moment the card
     can actually be taken out of circulation. */
  e.on('card:resolved', (ev) => {
    const c = fake();
    const s2 = U.mm(c);
    const want = s2.awaitingLinger;
    if (!want || ev.cardUid !== want.uid) return;
    s2.awaitingLinger = null;
    U.moveCard(c, want, 'limbo', { gloaming: true });
  });

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.afterglowsThisTurn = 0;
    st.convergedThisTurn = 0;
    st.gentleLanding = 0;
    /* Every countdown ticks at once and everything that lands resolves as ONE
       batch — one Convergence at most, however many are involved. Ticking in a
       loop and resolving each on its own would fire Converge once per card. */
    if (st.stopTheClocks) { st.stopTheClocks = false; }
    else {
      const due = [];
      for (const entry of gloaming(c).slice()) {
        if (entry.skipNextTick) { entry.skipNextTick = false; continue; }
        const ticks = entry.doubleTick ? 2 : 1;
        entry.doubleTick = false;
        entry.count = Math.max(0, entry.count - ticks);
        if (entry.count === 0) due.push(entry);
      }
      if (due.length) resolveBatch(c, due);
    }
    if (st.bottled != null) { gainGlow(c, st.bottled + 1); st.bottled = null; }
    if (st.pocketTomorrow && st.pocketTomorrow.length) {
      for (const k of st.pocketTomorrow) { U.toHand(c, k); U.costSet(c, k, 0, 'turn'); }
      st.pocketTomorrow = [];
    }
    if (st.threeLightsDraw) { U.draw(c, st.threeLightsDraw); st.threeLightsDraw = 0; }
    if (st.tooBright && isBlazing(c)) {
      for (const k of U.cardsIn(c, 'hand').slice(0, 2)) U.costMod(c, k, -1, 'turn');
      U.atTurnEnd(c, (x) => spendGlow(x, 2));
    }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    if (st.threeLittleLights && gloamingSize(c) === 3) { gainGlow(c, 1); st.threeLightsDraw = 1; }
  }, seat);
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('afterglow', 'wisp/hallway-aurora', (c, p) => {
  // handled inside the Afterglows themselves via brightBonus(); this hook keeps
  // the Power's status honest for the seams gate and fires the audible cue.
  U.fire(c, 'auroraTick', { entry: p.entry });
});

const brightBonus = (c) => (U.mm(c).aurora && isBright(c) ? 4 : 0);
const blazingGuard = (c) => (U.mm(c).aurora && isBlazing(c) ? 4 : 0);
const highGlowGuard = (c) => (U.mm(c).bigGlow && glow(c) >= 7 ? 4 : 0);

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'wisp/baby-spark', name: 'Baby Spark', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'A very small light, moving with tremendous purpose.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'wisp/soft-halo', name: 'Soft Halo', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Warm at the edges. Safe in the middle.',
    nums: { b: 6 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 9 } },
  },
  {
    id: 'wisp/wait-wait', name: 'Wait... Wait...', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Deal {d} damage. [Linger] 1. [Afterglow]: deal {m0} damage.',
    flavor: 'Not yet. Not yet. Not — now.',
    nums: { d: 5, m0: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 1); }),
    afterglow: (c) => U.hitRandom(c, 7 + brightBonus(c)),
    upgrade: { nums: { d: 8, m0: 10 } },
  },
  {
    id: 'wisp/nightlight-practice', name: 'Nightlight Practice', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Gain {b} Guard. [Linger] 1. [Afterglow]: gain {m0} Guard.',
    flavor: 'She practises every night. She is getting better.',
    nums: { b: 4, m0: 7 },
    effect: eff((c) => { U.guard(c, N(c).b); linger(c, 1); }),
    afterglow: (c) => U.guard(c, 7 + blazingGuard(c) + highGlowGuard(c)),
    upgrade: { nums: { b: 7, m0: 10 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'wisp/candle-skip', name: 'Candle Skip', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['linger'],
    text: 'Deal {d} damage, or {m0} if anything is [Linger]ing.',
    flavor: 'From wick to wick without touching the floor.',
    nums: { d: 4, m0: 6 },
    effect: eff((c) => U.hit(c, gloamingSize(c) ? N(c).m0 : N(c).d)),
    upgrade: { nums: { d: 6, m0: 9 } },
  },
  {
    id: 'wisp/boo-eventually', name: 'Boo! Eventually', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Deal {d} damage. [Linger] 1. [Afterglow]: deal {d} damage and gain {g} [Glow].',
    flavor: 'The boo is coming. It is simply not here yet.',
    nums: { d: 5, g: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 1); }),
    afterglow: (c, o) => { U.hitRandom(c, 5 + brightBonus(c)); glowFrom(c, 1, o); U.guard(c, highGlowGuard(c)); },
    upgrade: { nums: { d: 8, g: 2 } },
  },
  {
    id: 'wisp/two-rooms-over', name: 'Two Rooms Over', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Deal {d} damage. [Linger] 2. [Afterglow]: deal {m0} to the strongest enemy and gain {g} [Glow].',
    flavor: 'You hear it happen somewhere else in the house.',
    nums: { d: 3, m0: 7, g: 1 },
    balance: { scalesWith: 'patience — most of it arrives two turns later, on the biggest thing in the room' },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 2); }),
    afterglow: (c, o) => {
      const worst = U.enemies(c).slice().sort((a, b) => b.hp - a.hp)[0];
      if (worst) U.hitAt(c, worst, 7 + brightBonus(c));
      glowFrom(c, 1, o);
      U.guard(c, highGlowGuard(c));
    },
    upgrade: { nums: { d: 5, m0: 10, g: 1 } },
  },
  {
    id: 'wisp/firefly-tackle', name: 'Firefly Tackle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['flare', 'glow'],
    text: 'Deal {d} damage. [Flare] {f}: follow with {m0} more.',
    flavor: 'All of her, at speed, at ankle height.',
    nums: { d: 7, m0: 4, f: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); if (flare(c, N(c).f)) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6, f: 1 } },
  },
  {
    id: 'wisp/pop', name: 'Pop!', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['bright'],
    text: 'Deal {d} damage. If [Bright], deal {m0} more.',
    flavor: 'Pop.',
    nums: { d: 7, m0: 4 },
    effect: eff((c) => U.hit(c, N(c).d + (isBright(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 10, m0: 6 } },
  },
  {
    id: 'wisp/little-orbit', name: 'Little Orbit', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Deal {d} to all enemies. [Linger] 1. [Afterglow]: deal {d} to all and gain {g} [Glow].',
    flavor: 'Round and round the room, twice.',
    nums: { d: 5, g: 1 },
    effect: eff((c) => { U.hitAll(c, N(c).d); linger(c, 1); }),
    afterglow: (c, o) => { U.hitAll(c, 4 + brightBonus(c)); glowFrom(c, 1, o); U.guard(c, highGlowGuard(c)); },
    upgrade: { nums: { d: 7, g: 1 } },
  },
  {
    id: 'wisp/bonk-from-later', name: 'Bonk From Later', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['linger', 'afterglow', 'converge'],
    text: 'Deal {d} damage. [Linger] 1. [Afterglow]: deal {d} to the same enemy. [Converge]: {m0} more.',
    flavor: 'It arrives on schedule. Somebody else’s schedule.',
    nums: { d: 7, m0: 4 },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 1); }),
    afterglow: (c) => U.hitRandom(c, 7 + brightBonus(c)),
    converge: (c) => U.hitRandom(c, 4),
    upgrade: { nums: { d: 10, m0: 6 } },
  },
  {
    id: 'wisp/pocket-the-spark', name: 'Pocket the Spark', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['glow'],
    text: 'Gain {g} [Glow] and {b} Guard.',
    flavor: 'She keeps a bit back. She always keeps a bit back.',
    nums: { g: 1, b: 4 },
    effect: eff((c) => { gainGlow(c, N(c).g); U.guard(c, N(c).b); }),
    upgrade: { nums: { g: 2, b: 6 } },
  },
  {
    id: 'wisp/nightlight', name: 'Nightlight', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['bright'],
    text: 'Gain {b} Guard, and {m0} more if [Bright].',
    flavor: 'Left on for somebody who is not scared, obviously.',
    nums: { b: 6, m0: 4 },
    effect: eff((c) => U.guard(c, N(c).b + (isBright(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 9, m0: 6 } },
  },
  {
    id: 'wisp/put-it-somewhere-safe', name: 'Put It Somewhere Safe', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Gain {b} Guard. [Linger] 1. [Afterglow]: gain {m0} Guard and {g} [Glow].',
    flavor: 'Somewhere safe, and then immediately forgotten about.',
    nums: { b: 4, m0: 7, g: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); linger(c, 1); }),
    afterglow: (c, o) => { U.guard(c, 7 + blazingGuard(c) + highGlowGuard(c)); glowFrom(c, 1, o); },
    upgrade: { nums: { b: 7, m0: 10, g: 1 } },
  },
  {
    id: 'wisp/one-more-second', name: 'One More Second', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['delay', 'linger'],
    text: '[Delay] 1 one [Linger]ing Trick. Draw {c1} Trick.',
    flavor: 'One more. One more. One more.',
    nums: { c1: 1 },
    effect: eff((c) => { const g = gloaming(c)[0]; if (g) delay(c, g, 1); U.draw(c, N(c).c1); }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'wisp/not-yet', name: 'Not Yet!', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['hasten', 'linger'],
    text: '[Hasten] 1 one [Linger]ing Trick. If it resolves, gain {b} Guard.',
    flavor: 'She has changed her mind about the waiting.',
    nums: { b: 4 },
    effect: eff((c) => { const g = gloaming(c)[0]; if (g && hasten(c, g, 1)) U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'wisp/scoot-the-spark', name: 'Scoot the Spark', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['hasten', 'delay'],
    text: 'Choose a [Linger]ing Trick: [Hasten] 1, or [Delay] 1 and gain {b} Guard.',
    flavor: 'Forwards or backwards. Both are moving.',
    nums: { b: 6 },
    effect: eff(async (c) => {
      const g = gloaming(c)[0];
      if (!g) return;
      await U.chooseOne(c, [
        { label: 'Hasten 1', fn: (x) => hasten(x, g, 1) },
        { label: 'Delay 1, gain Guard', fn: (x) => { delay(x, g, 1); U.guard(x, N(x).b); } },
      ]);
    }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'wisp/still-here', name: 'Still Here!', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['linger', 'gloaming'],
    text: 'Gain {b} Guard for each [Linger]ing Trick, up to three.',
    flavor: 'All of her, in several places, all still here.',
    nums: { b: 4 },
    effect: eff((c) => U.guard(c, N(c).b * Math.min(3, gloamingSize(c)))),
    upgrade: { nums: { b: 6 } },
  },
  {
    id: 'wisp/dim-the-room', name: 'Dim the Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['flare', 'glow'],
    text: 'Gain {b} Guard. [Flare] {f}: gain {m0} instead.',
    flavor: 'If she is smaller, the dark is bigger.',
    nums: { b: 4, m0: 7, f: 1 },
    effect: eff((c) => { if (flare(c, N(c).f)) U.guard(c, N(c).m0); else U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 6, m0: 10, f: 1 } },
  },
  {
    id: 'wisp/tiny-reservoir', name: 'Tiny Reservoir', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['glow', 'bright'],
    text: 'Gain {g} [Glow]. If [Bright], draw {c1} then discard 1.',
    flavor: 'Kept somewhere behind her eyes.',
    nums: { g: 1, c1: 1 },
    effect: eff((c) => { gainGlow(c, N(c).g); if (isBright(c)) { U.draw(c, N(c).c1); U.discardRandom(c, 1); } }),
    upgrade: { nums: { g: 2, c1: 2 } },
  },
  {
    id: 'wisp/home-in-the-dark', name: 'Home in the Dark', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['afterglow'],
    text: 'The first [Afterglow] each turn gains you {b} Guard.',
    flavor: 'She grew up in it. It is not frightening from the inside.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'wisp/home-in-the-dark', N(c).b, (x) => { U.mm(x).homeInTheDark = true; })),
    upgrade: { nums: { b: 7 } },
  },
  {
    id: 'wisp/static-in-the-wallpaper', name: 'Static in the Wallpaper', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['flare'],
    text: 'The first time you [Flare] each turn, deal {d} to a random enemy.',
    flavor: 'The whole wall hums for a second afterwards.',
    nums: { d: 4 },
    effect: eff((c) => power(c, 'wisp/static-in-the-wallpaper', N(c).d, (x) => { U.mm(x).staticWallpaper = true; })),
    upgrade: { nums: { d: 7 } },
  },
  {
    id: 'wisp/getting-excited', name: 'Getting Excited', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['converge', 'glow'],
    text: 'The first [Converge]nce each turn gains {g} [Glow].',
    flavor: 'She cannot help it. Everything lines up and she lights up.',
    nums: { g: 1 },
    effect: eff((c) => power(c, 'wisp/getting-excited', N(c).g, (x) => { U.mm(x).gettingExcited = true; })),
    upgrade: { nums: { g: 2 } },
  },
  {
    id: 'wisp/brighter-every-minute', name: 'Brighter Every Minute', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['gloaming', 'linger'],
    text: 'The first Trick you put in the [Gloaming] each turn gains {b} Guard.',
    flavor: 'A little more every night, whether anyone is watching or not.',
    nums: { b: 4 },
    effect: eff((c) => power(c, 'wisp/brighter-every-minute', N(c).b, (x) => { U.mm(x).brighterEveryMinute = true; })),
    upgrade: { nums: { b: 7 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (13) ──
  {
    id: 'wisp/long-fuse', name: 'Long Fuse', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['linger', 'afterglow', 'glow'],
    text: 'Deal {d} damage. [Linger] 3. [Afterglow]: deal {m0}, gain {b} Guard and {g} [Glow].',
    flavor: 'Lit ages ago. Still going.',
    nums: { d: 3, m0: 16, g: 2, b: 6 },
    balance: { scalesWith: 'three turns of waiting — almost all of it lands at the end' },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 3); }),
    afterglow: (c, o) => { U.hitRandom(c, 16 + brightBonus(c)); U.guard(c, 6 + blazingGuard(c)); glowFrom(c, 2, o); },
    upgrade: { nums: { d: 5, m0: 21, g: 2, b: 9 } },
  },
  {
    id: 'wisp/no-now', name: 'No, NOW!', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['hasten', 'afterglow'],
    text: 'Deal {d} damage. [Hasten] 1 a [Linger]ing Trick; if it resolves, deal {m0} more.',
    flavor: 'She has run out of patience with her own plan.',
    nums: { d: 7, m0: 4 },
    effect: eff((c) => { U.hit(c, N(c).d); const g = gloaming(c)[0]; if (g && hasten(c, g, 1)) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6 } },
  },
  {
    id: 'wisp/spark-parade', name: 'Spark Parade', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['linger', 'afterglow', 'converge'],
    text: 'Deal {d} to all. [Linger] 2. [Afterglow]: {m0} to all and {g} [Glow]. [Converge]: {d} to all again.',
    flavor: 'One after another after another, all the way down the hall.',
    nums: { d: 4, m0: 7, g: 1 },
    balance: { scalesWith: 'the whole room twice over, two turns apart, and again on a Convergence' },
    effect: eff((c) => { U.hitAll(c, N(c).d); linger(c, 2); }),
    afterglow: (c, o) => { U.hitAll(c, 7 + brightBonus(c)); glowFrom(c, 1, o); },
    converge: (c) => U.hitAll(c, 4),
    upgrade: { nums: { d: 6, m0: 10, g: 1 } },
  },
  {
    id: 'wisp/backtrack-bolt', name: 'Backtrack Bolt', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['afterglow'],
    text: 'Deal {d} damage. If an [Afterglow] has resolved this turn, put this on top of your draw pile.',
    flavor: 'It goes back to where it came from and waits to be used again.',
    nums: { d: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); if ((U.mm(c).afterglowsThisTurn || 0) > 0) U.toDrawTop(c, c.card); }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'wisp/hot-potato', name: 'Hot Potato', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['flare', 'afterglow'],
    text: 'Deal {d} damage. [Flare] {f}: the next [Afterglow] to damage this enemy deals {m0} more.',
    flavor: 'Passed along quickly, by everybody, to somebody else.',
    nums: { d: 7, m0: 7, f: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); if (flare(c, N(c).f)) U.mm(c).hotPotato = N(c).m0; }),
    upgrade: { nums: { d: 10, m0: 10, f: 1 } },
  },
  {
    id: 'wisp/jump-scare-spark', name: 'Jump Scare Spark', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['afterglow'],
    text: 'Deal {d} damage, plus {m0} more if an [Afterglow] has already resolved this turn.',
    flavor: 'Timed badly on purpose.',
    nums: { d: 4, m0: 11 },
    effect: eff((c) => U.hit(c, N(c).d + ((U.mm(c).afterglowsThisTurn || 0) > 0 ? N(c).m0 : 0))),
    upgrade: { nums: { d: 6, m0: 16 } },
  },
  {
    id: 'wisp/bank-shot', name: 'Bank Shot', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['linger', 'afterglow', 'glow'],
    text: '[Linger] 1. [Afterglow]: deal {m0} to the weakest enemy; if it falls, gain {g} [Glow].',
    flavor: 'Off the wall, off the bannister, into something.',
    nums: { m0: 7, g: 2 },
    effect: eff((c) => linger(c, 1)),
    afterglow: (c, o) => {
      const list = U.enemies(c).slice().sort((a, b) => a.hp - b.hp);
      const t = list[0];
      if (!t) return;
      U.hitAt(c, t, 7 + brightBonus(c));
      if (!t.alive) glowFrom(c, 2, o);
    },
    upgrade: { nums: { m0: 10, g: 2 } },
  },
  {
    id: 'wisp/tiny-supernova', name: 'Tiny Supernova', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['flare', 'glow'],
    text: 'Deal {d} to all enemies. [Flare] {f}: deal {d} to all again.',
    flavor: 'Very small. Very bright. Very briefly.',
    nums: { d: 7, f: 2 },
    balance: { scalesWith: 'the Glow you cash in — it hits the whole room a second time' },
    effect: eff((c) => { U.hitAll(c, N(c).d); if (flare(c, N(c).f)) U.hitAll(c, N(c).d); }),
    upgrade: { nums: { d: 10, f: 2 } },
  },
  {
    id: 'wisp/skip-ahead', name: 'Skip Ahead', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['hasten', 'vanish'],
    text: 'Deal {d} damage and [Hasten] 1 a [Linger]ing Trick. [Vanish].',
    flavor: 'Straight to the part she likes.',
    nums: { d: 4 },
    effect: eff((c) => { U.hit(c, N(c).d); const g = gloaming(c)[0]; if (g) hasten(c, g, 1); }),
    upgrade: { nums: { d: 7 } },
  },
  {
    id: 'wisp/orbiting-sparks', name: 'Orbiting Sparks', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['gloaming', 'linger'],
    text: 'Deal {d} damage once for each Trick in the [Gloaming], up to four.',
    flavor: 'Everything she has put off, circling.',
    nums: { d: 5 },
    balance: { scalesWith: 'how full the Gloaming is — up to four hits' },
    effect: eff((c) => { const n = Math.min(4, gloamingSize(c)); for (let i = 0; i < n; i++) U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 7 } },
  },
  {
    id: 'wisp/not-done-yet', name: 'Not Done Yet', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['linger', 'afterglow', 'converge'],
    text: 'Deal {d} damage. [Linger] 1. [Afterglow]: deal {m0}. [Converge]: {m1} instead.',
    flavor: 'She is not. She really is not.',
    nums: { d: 7, m0: 4, m1: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 1); }),
    afterglow: (c, o) => { if (!o.converged) U.hitRandom(c, 4 + brightBonus(c)); },
    converge: (c) => U.hitRandom(c, 7),
    upgrade: { nums: { d: 10, m0: 6, m1: 10 } },
  },
  {
    id: 'wisp/saved-up-spark', name: 'Saved Up Spark', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['glow'],
    text: 'Deal {d} damage plus {m0} for each [Glow] you have, up to 6. [Glow] is not spent.',
    flavor: 'All of it still there, just pointed at something.',
    nums: { d: 6, m0: 3 },
    balance: { scalesWith: 'your Glow, without spending a single point of it' },
    effect: eff((c) => U.hit(c, N(c).d + N(c).m0 * Math.min(6, glow(c)))),
    upgrade: { nums: { d: 9, m0: 4 } },
  },
  {
    id: 'wisp/blow-the-fuse', name: 'Blow the Fuse', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['flare', 'blazing', 'hasten'],
    text: 'Deal {d} damage. [Flare] up to {f}: {m0} more each. If you were [Blazing] first, [Hasten] 1 everything.',
    flavor: 'Every light on the landing goes at once.',
    nums: { d: 11, m0: 4, f: 3 },
    balance: { scalesWith: 'the Glow you cash in, and everything Lingering if you were Blazing' },
    effect: eff((c) => {
      const wasBlazing = isBlazing(c);
      U.hit(c, N(c).d);
      const spent = spendGlow(c, Math.min(N(c).f, glow(c)));
      for (let i = 0; i < spent; i++) U.hitAt(c, c.target, N(c).m0);
      if (wasBlazing) { const due = []; for (const g of gloaming(c).slice()) { g.count = Math.max(0, g.count - 1); if (g.count === 0) due.push(g); } if (due.length) resolveBatch(c, due); }
    }),
    upgrade: { nums: { d: 15, m0: 6, f: 3 } },
  },

  // ── Skills (16) ──
  {
    id: 'wisp/line-them-up', name: 'Line Them Up', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['linger', 'converge'],
    text: 'Set one [Linger]ing Trick’s countdown equal to another’s.',
    flavor: 'Everything on the same beat.',
    nums: {},
    effect: eff((c) => { const g = gloaming(c); if (g.length >= 2) g[0].count = g[1].count; }),
    upgrade: { cost: 0 },
  },
  {
    id: 'wisp/stretch-the-moment', name: 'Stretch the Moment', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['delay'],
    text: '[Delay] 1 up to {n} [Linger]ing Tricks. Gain {b} Guard.',
    flavor: 'She holds the second open with both hands.',
    nums: { n: 2, b: 6 },
    effect: eff((c) => { for (const g of gloaming(c).slice(0, N(c).n)) delay(c, g, 1); U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 3, b: 9 } },
  },
  {
    id: 'wisp/cut-the-wait', name: 'Cut the Wait', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['hasten', 'converge'],
    text: '[Hasten] 1 up to {n} [Linger]ing Tricks. If both land together, draw {c1}.',
    flavor: 'Enough waiting.',
    nums: { n: 2, c1: 1 },
    effect: eff((c) => {
      const picks = gloaming(c).slice(0, N(c).n);
      const due = [];
      for (const g of picks) { g.count = Math.max(0, g.count - 1); g.hastened += 1; if (g.count === 0) due.push(g); }
      if (due.length) resolveBatch(c, due);
      if (due.length >= 2) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 3, c1: 2 } },
  },
  {
    id: 'wisp/glow-bank', name: 'Glow Bank', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['glow', 'delay'],
    text: 'Gain {g} [Glow], then [Delay] 1 a random [Linger]ing Trick. With none, gain {m0} instead.',
    flavor: 'Put it away where the dark cannot get at it.',
    nums: { g: 2, m0: 1 },
    effect: eff((c) => {
      const list = gloaming(c);
      if (!list.length) { gainGlow(c, N(c).m0); return; }
      gainGlow(c, N(c).g);
      delay(c, U.rpick(c, list), 1);
    }),
    upgrade: { nums: { g: 3, m0: 2 } },
  },
  {
    id: 'wisp/emergency-lantern', name: 'Emergency Lantern', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['flare', 'glow'],
    text: 'Gain {b} Guard. [Flare] {f}: gain {m0} and draw {c1} instead.',
    flavor: 'Glass, a handle, and a very worried expression.',
    nums: { b: 6, m0: 10, c1: 1, f: 2 },
    effect: eff((c) => { if (flare(c, N(c).f)) { U.guard(c, N(c).m0); U.draw(c, N(c).c1); } else U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 9, m0: 14, c1: 2, f: 2 } },
  },
  {
    id: 'wisp/room-for-more', name: 'Room for More', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, exhaust: true, keywords: ['gloaming', 'vanish'],
    text: 'Draw {c1} then discard 1, or {m0} then discard 1 with three in the [Gloaming]. [Vanish].',
    flavor: 'There is always room for one more light.',
    nums: { c1: 1, m0: 2 },
    effect: eff((c) => { U.draw(c, gloamingSize(c) >= 3 ? N(c).m0 : N(c).c1); U.discardRandom(c, 1); }),
    upgrade: { nums: { c1: 2, m0: 3 } },
  },
  {
    id: 'wisp/quiet-before-the-pop', name: 'Quiet Before the Pop', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['afterglow', 'glow'],
    text: 'With no [Afterglow] yet this turn, gain {b} Guard. Otherwise {m0} Guard and {g} [Glow].',
    flavor: 'The bit before, which is the frightening bit.',
    nums: { b: 10, m0: 6, g: 1 },
    effect: eff((c) => {
      if ((U.mm(c).afterglowsThisTurn || 0) === 0) U.guard(c, N(c).b);
      else { U.guard(c, N(c).m0); gainGlow(c, N(c).g); }
    }),
    upgrade: { nums: { b: 14, m0: 9, g: 1 } },
  },
  {
    id: 'wisp/borrowed-tomorrow', name: 'Borrowed Tomorrow', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['afterglow', 'linger'],
    text: 'Resolve one [Linger]ing Trick’s [Afterglow] now. It gains no [Glow], then it is discarded.',
    flavor: 'Spent before it arrives.',
    nums: {},
    effect: eff((c) => { const g = gloaming(c)[0]; if (g) resolveBatch(c, [g], { noGlow: true }); }),
    upgrade: { cost: 0 },
  },
  {
    id: 'wisp/push-it-back', name: 'Push It Back', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['delay'],
    text: '[Delay] {n} one [Linger]ing Trick. Gain {b} Guard.',
    flavor: 'Later. Definitely later.',
    nums: { n: 2, b: 10 },
    effect: eff((c) => { const g = gloaming(c)[0]; if (g) delay(c, g, N(c).n); U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 2, b: 14 } },
  },
  {
    id: 'wisp/shared-spark', name: 'Shared Spark', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['flare', 'glow'],
    text: 'Draw {c1} Tricks. [Flare] {f}: keep both. Otherwise discard one.',
    flavor: 'One for her and one for whoever is nearest.',
    nums: { c1: 2, f: 1 },
    effect: eff((c) => { U.draw(c, N(c).c1); if (!flare(c, N(c).f)) U.discardRandom(c, 1); }),
    upgrade: { nums: { c1: 3, f: 1 } },
  },
  {
    id: 'wisp/all-at-once', name: 'All at Once', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: NONE, keywords: ['hasten', 'converge'],
    text: '[Hasten] 1 every [Linger]ing Trick at once. If two or more land, regain {e} Nerve.',
    flavor: 'Everything she has been saving, now.',
    nums: { e: 1 },
    effect: eff((c) => {
      const due = [];
      for (const g of gloaming(c).slice()) { g.count = Math.max(0, g.count - 1); g.hastened += 1; if (g.count === 0) due.push(g); }
      if (due.length) resolveBatch(c, due);
      if (due.length >= 2) U.energy(c, N(c).e);
    }),
    upgrade: { nums: { e: 2 } },
  },
  {
    id: 'wisp/glow-in-the-dark', name: 'Glow in the Dark', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['glow'],
    text: 'Gain {b} Guard. Gain {m0} [Glow] if you have none, otherwise {g}.',
    flavor: 'Charged up all day for exactly this.',
    nums: { b: 6, g: 1, m0: 2 },
    effect: eff((c) => { U.guard(c, N(c).b); gainGlow(c, glow(c) === 0 ? N(c).m0 : N(c).g); }),
    upgrade: { nums: { b: 9, g: 2, m0: 3 } },
  },
  {
    id: 'wisp/small-orbit', name: 'Small Orbit', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['gloaming', 'linger'],
    text: 'Put the top Trick of your draw pile in the [Gloaming] at 1. It returns to hand costing {m} less.',
    flavor: 'Held just above her head, going round.',
    nums: { m: 1 },
    effect: eff((c) => {
      const top = U.cardsIn(c, 'draw')[0];
      if (!top) return;
      U.moveCard(c, top, 'limbo', { gloaming: true });
      const disc = N(c).m;
      gloaming(c).push({
        card: top, count: 1, delayed: 0, hastened: 0, stored: 0,
        def: { id: 'wisp/small-orbit-return', afterglow: (x) => { U.toHand(x, top); U.costMod(x, top, -disc, 'turn'); } },
      });
    }),
    upgrade: { nums: { m: 2 } },
  },
  {
    id: 'wisp/gentle-landing', name: 'Gentle Landing', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['afterglow'],
    text: 'Until your next turn, each [Afterglow] gains you {b} Guard, up to {n} times.',
    flavor: 'Everything comes down softly if you plan it.',
    nums: { b: 4, n: 3 },
    effect: eff((c) => { U.mm(c).gentleLanding = N(c).n; }),
    upgrade: { nums: { b: 6, n: 3 } },
  },
  {
    id: 'wisp/stash-the-flash', name: 'Stash the Flash', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['glow'],
    text: 'Spend up to {n} [Glow]. Gain {b} Guard each. At exactly {n}, draw {c1}.',
    flavor: 'Tucked away in the lining, for later.',
    nums: { n: 3, b: 4, c1: 2 },
    effect: eff((c) => {
      const spent = spendGlow(c, Math.min(N(c).n, glow(c)));
      U.guard(c, spent * N(c).b);
      if (spent === N(c).n) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 3, b: 6, c1: 3 } },
  },
  {
    id: 'wisp/split-second', name: 'Split Second', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, exhaust: true, keywords: ['hasten', 'delay', 'vanish'],
    text: 'One [Linger]ing Trick does not tick next turn; another ticks twice. Draw {c1}. [Vanish].',
    flavor: 'Two moments, pulled apart.',
    nums: { c1: 1 },
    effect: eff((c) => {
      const g = gloaming(c);
      if (g[0]) g[0].skipNextTick = true;
      if (g[1]) g[1].doubleTick = true;
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },

  // ── Powers (6) ──
  {
    id: 'wisp/constellation-practice', name: 'Constellation Practice', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['converge', 'glow'],
    text: 'The first [Converge]nce each turn draws {c1} and gains {g} [Glow].',
    flavor: 'She is learning the shapes.',
    nums: { c1: 1, g: 1 },
    effect: eff((c) => power(c, 'wisp/constellation-practice', 1, (x) => { U.mm(x).constellation = true; })),
    upgrade: { nums: { c1: 2, g: 1 } },
  },
  {
    id: 'wisp/hallway-aurora', name: 'Hallway Aurora', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['bright', 'blazing', 'afterglow'],
    text: 'While [Bright], damaging [Afterglow]s deal 4 more. While [Blazing], defensive ones give 4 Guard.',
    flavor: 'The whole corridor goes green for a moment.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/hallway-aurora', 1, (x) => { U.mm(x).aurora = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/i-can-wait', name: 'I Can Wait', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['delay'],
    text: 'The first time each turn you deliberately [Delay], gain {b} Guard.',
    flavor: 'She has waited longer than the house has stood.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'wisp/i-can-wait', N(c).b, (x) => { U.mm(x).iCanWait = true; })),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'wisp/cant-wait', name: 'Can’t Wait!', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['hasten'],
    text: 'The first time each turn you [Hasten] something to 0, deal {d} to a random enemy.',
    flavor: 'She really cannot.',
    nums: { d: 4 },
    effect: eff((c) => power(c, 'wisp/cant-wait', N(c).d, (x) => { U.mm(x).cantWait = true; })),
    upgrade: { nums: { d: 7 } },
  },
  {
    id: 'wisp/flicker-feedback', name: 'Flicker Feedback', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['flare', 'hasten'],
    text: 'The first time each turn you [Flare], [Hasten] 1 a random [Linger]ing Trick.',
    flavor: 'Everything in the house dims for a second when she spends.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/flicker-feedback', 1, (x) => { U.mm(x).flickerFeedback = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/three-little-lights', name: 'Three Little Lights', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['gloaming', 'glow'],
    text: 'At end of turn, with exactly three in the [Gloaming], gain {g} [Glow] and draw {c1} next turn.',
    flavor: 'Three is the number. She is very firm about this.',
    nums: { g: 1, c1: 1 },
    effect: eff((c) => power(c, 'wisp/three-little-lights', 1, (x) => { U.mm(x).threeLittleLights = true; })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ──
  {
    id: 'wisp/tiny-sun-big-feelings', name: 'Tiny Sun, Big Feelings', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['blazing', 'flare'],
    text: 'Deal {d} to all enemies. If [Blazing], you may [Flare] {f} to do it again.',
    flavor: 'She has had a very big day.',
    nums: { d: 15, f: 6 },
    balance: { scalesWith: 'the whole room, and the whole room again if you are Blazing' },
    effect: eff((c) => { const blaz = isBlazing(c); U.hitAll(c, N(c).d); if (blaz && flare(c, N(c).f)) U.hitAll(c, N(c).d); }),
    upgrade: { nums: { d: 20, f: 6 } },
  },
  {
    id: 'wisp/this-ones-been-cooking', name: 'This One’s Been Cooking', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['linger', 'delay', 'afterglow', 'glow'],
    text: 'Deal {d}. [Linger] 3. Each [Delay] adds {m0} to it. [Afterglow]: {m1}, plus everything stored, and {g} [Glow].',
    flavor: 'Left on the back of the stove since before anyone lived here.',
    nums: { d: 3, m0: 7, m1: 15, g: 2 },
    balance: { scalesWith: 'every turn you are willing to Delay it — each adds another hit' },
    effect: eff((c) => { U.mm(c).thisOneCooking = true; U.hit(c, N(c).d); linger(c, 3); }),
    afterglow: (c, o) => {
      const e = o && o.entry;
      U.hitRandom(c, 15 + brightBonus(c));
      for (let i = 0; i < ((e && e.stored) || 0); i++) U.hitRandom(c, 7);
      glowFrom(c, 2, o);
    },
    upgrade: { nums: { d: 5, m0: 10, m1: 20, g: 2 } },
  },
  {
    id: 'wisp/chain-reaction', name: 'Chain Reaction', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['afterglow'],
    text: 'Deal {d}, plus {m0} for each [Afterglow] resolved this turn, up to {n}.',
    flavor: 'One thing, then the next thing, then everything.',
    nums: { d: 7, m0: 4, n: 5 },
    balance: { scalesWith: 'how many Afterglows have already landed this turn' },
    effect: eff((c) => { U.hit(c, N(c).d); const n = Math.min(N(c).n, U.mm(c).afterglowsThisTurn || 0); for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6, n: 5 } },
  },
  {
    id: 'wisp/premature-celebration', name: 'Premature Celebration', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ALL_ENEMIES, keywords: ['converge', 'linger', 'afterglow'],
    text: 'After a [Converge]nce this turn, deal {m1} to all. Otherwise {d} to all and [Linger] 1.',
    flavor: 'She celebrates first and checks afterwards.',
    nums: { d: 4, m1: 15, m0: 7 },
    effect: eff((c) => {
      if ((U.mm(c).convergedThisTurn || 0) > 0) { U.hitAll(c, N(c).m1); return; }
      U.hitAll(c, N(c).d);
      linger(c, 1);
    }),
    afterglow: (c) => U.hitAll(c, 7 + brightBonus(c)),
    upgrade: { nums: { d: 6, m1: 20, m0: 10 } },
  },
  {
    id: 'wisp/orbital-drop', name: 'Orbital Drop', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: NONE, keywords: ['linger', 'afterglow', 'converge', 'glow'],
    text: '[Linger] 1. [Afterglow]: three hits of {m0} spread among enemies and {g} [Glow]. [Converge]: a fourth.',
    flavor: 'From somewhere above the roof.',
    nums: { m0: 11, g: 1 },
    effect: eff((c) => linger(c, 1)),
    afterglow: (c, o) => { U.hitRandomN(c, 11 + brightBonus(c), 3); glowFrom(c, 1, o); },
    converge: (c) => U.hitRandom(c, 11),
    upgrade: { nums: { m0: 15, g: 2 } },
  },
  {
    id: 'wisp/all-the-lamps-at-once', name: 'All the Lamps at Once', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['flare', 'glow'],
    text: 'Deal {d} to all. Spend any [Glow]; {m0} to a random enemy each. At {n}+ spent, draw {c1}.',
    flavor: 'Every lamp. All of them. At once.',
    nums: { d: 7, m0: 4, n: 3, c1: 1 },
    balance: { scalesWith: 'however much Glow you are willing to empty out' },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      const spent = spendGlow(c, glow(c));
      for (let i = 0; i < spent; i++) U.hitRandom(c, N(c).m0);
      if (spent >= N(c).n) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { d: 10, m0: 6, n: 3, c1: 2 } },
  },
  {
    id: 'wisp/peekaboo-meteor', name: 'Peekaboo Meteor', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['linger', 'hasten', 'afterglow'],
    text: 'Deal {d}. [Linger] 2. [Afterglow]: {m1}; if it was ever [Hasten]ed, {m0} more.',
    flavor: 'Peekaboo, from orbit.',
    nums: { d: 7, m1: 15, m0: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); linger(c, 2); }),
    afterglow: (c, o) => {
      const e = o && o.entry;
      U.hitRandom(c, 15 + brightBonus(c));
      if (e && e.hastened > 0) U.hitRandom(c, 7);
    },
    upgrade: { nums: { d: 10, m1: 20, m0: 10 } },
  },
  {
    id: 'wisp/one-bright-problem', name: 'One Bright Problem', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, exhaust: true, keywords: ['blazing', 'glow', 'vanish'],
    text: 'Only while [Blazing]. Spend all [Glow]. Deal {d}, plus {m0} for each above 6. [Vanish].',
    flavor: 'The problem is that she is very, very bright.',
    nums: { d: 26, m0: 7 },
    balance: { scalesWith: 'every point of Glow above six' },
    effect: eff((c) => {
      const had = glow(c);
      spendGlow(c, had);
      U.hit(c, N(c).d);
      for (let i = 0; i < Math.max(0, had - 6); i++) U.hitAt(c, c.target, N(c).m0);
    }),
    playable: (c) => isBlazing(c),
    playableReason: 'Wisp is not Blazing yet.',
    upgrade: { nums: { d: 33, m0: 10 } },
  },

  // ── Skills (10) ──
  {
    id: 'wisp/stop-the-clocks', name: 'Stop the Clocks', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['delay', 'linger'],
    text: 'Countdowns do not tick next turn. Gain {b} Guard for each Trick held this way.',
    flavor: 'Every clock in the house, at the same second.',
    nums: { b: 4 },
    effect: eff((c) => { U.mm(c).stopTheClocks = true; U.guard(c, N(c).b * gloamingSize(c)); }),
    upgrade: { nums: { b: 6 } },
  },
  {
    id: 'wisp/same-time-tomorrow', name: 'Same Time Tomorrow', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['linger', 'converge', 'glow'],
    text: 'Set every [Linger]ing Trick to the same countdown. If {n} or more changed, gain {g} [Glow].',
    flavor: 'She likes a routine.',
    nums: { n: 3, g: 1 },
    effect: eff(async (c) => {
      const list = gloaming(c);
      if (!list.length) return;
      await U.chooseOne(c, [1, 2, 3].map((v) => ({
        label: 'Set every countdown to ' + v,
        fn: (x) => { for (const g of list) g.count = v; if (list.length >= N(x).n) gainGlow(x, N(x).g); },
      })));
    }),
    upgrade: { nums: { n: 2, g: 2 } },
  },
  {
    id: 'wisp/skip-to-the-good-part', name: 'Skip to the Good Part', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['afterglow', 'converge'],
    text: 'Resolve every [Linger]ing [Afterglow] as one batch. They gain no [Glow].',
    flavor: 'All of it, now, please.',
    nums: {},
    effect: eff((c) => { const all = gloaming(c).slice(); if (all.length) resolveBatch(c, all, { noGlow: true }); }),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/bottle-the-glow', name: 'Bottle the Glow', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['glow', 'vanish'],
    text: 'Lose all [Glow]. Next turn regain it plus {g}. At {n}+ stored, gain {b} Guard now. [Vanish].',
    flavor: 'Corked, and glowing gently on the shelf.',
    nums: { g: 1, n: 4, b: 10 },
    effect: eff((c) => {
      const had = glow(c);
      spendGlow(c, had);
      U.mm(c).bottled = had;
      if (had >= N(c).n) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { g: 2, n: 4, b: 14 } },
  },
  {
    id: 'wisp/emergency-eclipse', name: 'Emergency Eclipse', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['glow', 'vanish'],
    text: 'Spend any [Glow]. Gain {b} Guard each. At {n}+, enemies are Weakened this turn. [Vanish].',
    flavor: 'She puts herself out. Briefly. On purpose.',
    nums: { b: 4, n: 6 },
    balance: { scalesWith: 'the Glow you spend, all of it if you like' },
    effect: eff((c) => {
      const spent = spendGlow(c, glow(c));
      U.guard(c, spent * N(c).b);
      if (spent >= N(c).n) U.applyAll(c, 'weak', 2);
    }),
    upgrade: { nums: { b: 6, n: 5 } },
  },
  {
    id: 'wisp/pocket-tomorrow', name: 'Pocket Tomorrow', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, exhaust: true, keywords: ['vanish'],
    text: 'Draw {c1}. Set aside up to {n} Tricks; they return next turn costing 0. [Vanish].',
    flavor: 'Tomorrow, folded small.',
    nums: { c1: 3, n: 2 },
    effect: eff(async (c) => {
      U.draw(c, N(c).c1);
      const picks = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Keep which Tricks for next turn?' });
      const st = U.mm(c);
      st.pocketTomorrow = st.pocketTomorrow || [];
      for (const k of picks) { U.moveCard(c, k, 'limbo', {}); st.pocketTomorrow.push(k); }
    }),
    upgrade: { nums: { c1: 4, n: 3 } },
  },
  {
    id: 'wisp/start-over-small', name: 'Start Over Small', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: NONE, exhaust: true, keywords: ['glow', 'hasten', 'vanish'],
    text: 'Lose all [Glow]. [Hasten] every [Linger]ing Trick 1 per 2 lost, up to {n}. [Vanish].',
    flavor: 'Back to a spark, and everything happens at once.',
    nums: { n: 3 },
    effect: eff((c) => {
      const spent = spendGlow(c, glow(c));
      const steps = Math.min(N(c).n, Math.floor(spent / 2));
      if (steps <= 0) return;
      const due = [];
      for (const g of gloaming(c).slice()) { g.count = Math.max(0, g.count - steps); g.hastened += steps; if (g.count === 0) due.push(g); }
      if (due.length) resolveBatch(c, due);
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'wisp/encore', name: 'Encore!', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['linger', 'gloaming', 'vanish'],
    text: 'Put up to {n} [Linger] Tricks from your discard pile straight into the [Gloaming]. They [Vanish] after.',
    flavor: 'Again! Again!',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const picks = await U.pickCards(c, {
        pile: 'discard', count: N(c).n, optional: true, prompt: 'Encore which Tricks?',
        filter: (k) => !!(k.def && k.def.afterglow),
      });
      for (const k of picks) {
        U.moveCard(c, k, 'limbo', { gloaming: true });
        gloaming(c).push({ card: k, def: k.def, count: Math.max(1, (k.def && k.def.linger) || 1), delayed: 0, hastened: 0, stored: 0, vanish: true });
      }
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'wisp/double-exposure', name: 'Double Exposure', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['linger', 'afterglow', 'converge'],
    text: 'Copy one [Linger]ing Trick beside itself at the same countdown. The copy gains no [Glow].',
    flavor: 'Two of the same moment, on the same negative.',
    nums: {},
    effect: eff((c) => {
      const g = gloaming(c)[0];
      if (!g) return;
      gloaming(c).push({ card: null, def: g.def, count: g.count, delayed: 0, hastened: 0, stored: g.stored, noGlow: true, vanish: true });
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/darkest-before-dawn', name: 'Darkest Before Dawn', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['linger', 'afterglow', 'converge'],
    text: 'Gain {b} Guard. [Linger] 2. [Afterglow]: {b} Guard and draw {c1}. [Converge]: {e} Nerve next turn.',
    flavor: 'It is. It really is.',
    nums: { b: 10, c1: 2, e: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); linger(c, 2); }),
    afterglow: (c) => { U.guard(c, 10 + blazingGuard(c)); U.draw(c, 2); },
    converge: (c) => U.nextTurn(c, (x) => U.energy(x, 1)),
    upgrade: { nums: { b: 14, c1: 3, e: 1 } },
  },

  // ── Powers (7) ──
  {
    id: 'wisp/bigger-than-a-nightlight', name: 'Bigger Than a Nightlight', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['glow', 'afterglow'],
    text: 'Maximum [Glow] becomes 9. At 7 or more, every [Afterglow] also gives Guard and damage.',
    flavor: 'Nobody is calling her a nightlight any more.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/bigger-than-a-nightlight', 1, (x) => { raiseGlowCap(x); })),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/falling-dominoes', name: 'Falling Dominoes', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['afterglow', 'hasten', 'converge'],
    text: 'The first [Afterglow] each turn [Hasten]s everything else by 1. What lands resolves as a new batch.',
    flavor: 'She set them all up herself, hours ago.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/falling-dominoes', 1, (x) => { U.mm(x).fallingDominoes = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/good-things-come', name: 'Good Things Come to Tiny Ghosts', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['delay', 'afterglow'],
    text: 'Once a turn, a Trick that was [Delay]ed resolves its [Afterglow] twice. The second gains no [Glow].',
    flavor: 'Everything she waited for, twice over.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/good-things-come', 1, (x) => { U.mm(x).goodThings = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/never-goes-out', name: 'Never Goes Out', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['glow', 'flare'],
    text: 'The first time each turn you spend [Glow], regain {g} after, or {m0} if you spent 3 or more.',
    flavor: 'Not once, in all the years anyone has been counting.',
    nums: { g: 1, m0: 2 },
    effect: eff((c) => power(c, 'wisp/never-goes-out', 1, (x) => { U.mm(x).neverGoesOut = true; })),
    upgrade: { nums: { g: 2, m0: 3 } },
  },
  {
    id: 'wisp/gloaming-gets-crowded', name: 'Gloaming Gets Crowded', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['gloaming'],
    text: 'Once a turn, when the [Gloaming] reaches four, draw {c1} and gain {e} Nerve.',
    flavor: 'There is barely room to hover.',
    nums: { c1: 2, e: 1 },
    effect: eff((c) => power(c, 'wisp/gloaming-gets-crowded', 1, (x) => { U.mm(x).gloamingCrowded = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'wisp/too-bright-for-bedtime', name: 'Too Bright for Bedtime', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['blazing', 'glow'],
    text: 'While [Blazing] at turn start, your first two Tricks cost 1 less. Lose {g} [Glow] at end of turn.',
    flavor: 'It is well past her bedtime and everybody knows it.',
    nums: { g: 2 },
    effect: eff((c) => power(c, 'wisp/too-bright-for-bedtime', 1, (x) => { U.mm(x).tooBright = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'wisp/tiny-star-long-shadow', name: 'Tiny Star, Long Shadow', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['converge', 'afterglow'],
    text: 'Once a turn on a [Converge]nce, one of the [Afterglow]s involved resolves again with no [Glow].',
    flavor: 'Small thing. Very long shadow.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/tiny-star-long-shadow', 1, (x) => { U.mm(x).longShadow = true; })),
    upgrade: { cost: 2 },
  },
];

/** Bigger Than a Nightlight moves the ceiling, and the HUD has to say so. */
function raiseGlowCap(c) {
  const s = U.mm(c);
  if (s.bigGlow) return;
  s.bigGlow = true;
  c.e.defineCounter({
    id: GLOW, name: 'Glow', icon: 'glow', min: 0, max: BIG_GLOW_CAP, start: glow(c), ownerId: c.self.id,
    desc: 'Bigger Than a Nightlight has raised Wisp’s ceiling to 9. Bright at 3, Blazing at 6.',
    states: [{ from: BLAZING_AT, to: BIG_GLOW_CAP, label: 'Blazing' }, { from: BRIGHT_AT, to: BLAZING_AT - 1, label: 'Bright' }],
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'wisp/pass-the-nightlight', name: 'Pass the Nightlight', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['glow', 'bright'],
    text: 'Gain {g} [Glow]. A chosen Kid gains {b} Guard, and if you are [Bright] their next Trick costs 1 less.',
    flavor: 'Here. You have it. I know where everything is.',
    nums: { g: 1, b: 6 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      gainGlow(c, N(c).g);
      if (!ally) return;
      c.giveBlock(ally, N(c).b);
      if (isBright(c)) c.giveStatus(ally, 'next-trick-discount', 1);
    }),
    upgrade: { nums: { g: 2, b: 9 } },
  },
  {
    id: 'wisp/count-with-me', name: 'Count With Me', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['linger', 'afterglow', 'converge'],
    text: 'When a chosen [Linger]ing Trick resolves, a chosen Kid draws {c1} and gains {b} Guard.',
    flavor: 'Three, two, one, together.',
    nums: { c1: 1, b: 6 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      const g = gloaming(c)[0];
      if (!ally || !g) return;
      g.watcher = { seat: ally.seat, draw: N(c).c1, guard: N(c).b };
      U.mm(c).countWithMe = g.watcher;
    }),
    upgrade: { nums: { c1: 2, b: 9 } },
  },
  {
    id: 'wisp/everybody-say-boo', name: 'Everybody Say Boo', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['hasten', 'linger'],
    text: 'Deal {d}. Until your next turn, the first time each other Kid damages that enemy, [Hasten] 1.',
    flavor: 'On three. One, two —',
    nums: { d: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); U.mm(c).everybodyBoo = { enemyId: c.target && c.target.id, used: [] }; }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'wisp/make-a-constellation', name: 'Make a Constellation', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['linger', 'converge'],
    text: 'Pick a Kid per [Linger]ing Trick, up to 3. When one resolves they gain {b} Guard and draw {c1}.',
    flavor: 'Everyone stand where I put you.',
    nums: { b: 10, c1: 1 },
    effect: eff((c) => {
      const mates = c.teammates().slice(0, Math.min(3, gloamingSize(c)));
      const list = gloaming(c);
      mates.forEach((m, i) => { if (list[i]) list[i].watcher = { seat: m.seat, draw: N(c).c1, guard: N(c).b }; });
    }),
    upgrade: { nums: { b: 14, c1: 2 } },
  },
  {
    id: 'wisp/follow-my-light', name: 'Follow My Light!', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['hasten', 'afterglow'],
    text: 'Once a round, another Kid’s third Trick [Hasten]s one of yours; your [Afterglow]s make their next Trick cheaper.',
    flavor: 'This way. Keep up.',
    nums: {},
    effect: eff((c) => power(c, 'wisp/follow-my-light', 1, (x) => { U.mm(x).followMyLight = true; })),
    upgrade: { cost: 1 },
  },
];

export default {
  slug: SLUG,
  name: 'Wisp',
  title: "the Baby Will-o'-Wisp",
  region: 'lampworks',
  identity:
    'Wisp plays half of every turn now and the other half later. A Lingering Trick leaves the deck ' +
    'entirely and sits face up in the Gloaming with a countdown, and when that countdown runs out its ' +
    'Afterglow happens. At low mastery that is simply delayed value. At high mastery the player is ' +
    'running a schedule: Hastening and Delaying to land several Afterglows in the same batch for a ' +
    'Convergence, keeping the Gloaming deliberately full to shrink the deck, and deciding every turn ' +
    'whether to stay Bright or cash the Glow out through a Flare.',
  strengths: [
    'Very high ceiling once several Afterglows land together',
    'The Gloaming shrinks the active deck, so the good Tricks come round faster',
    'Delay is a real choice, not a punishment — several builds want it',
    'Glow scales quietly without ever being spent',
    'Countdown manipulation makes her future something she can rearrange',
  ],
  weaknesses: [
    'Almost nothing happens on the turn she sets it up',
    'A short fight can end before the Gloaming pays out',
    'Spending Glow costs her the Bright and Blazing thresholds she was benefiting from',
    'Suspending too many Tricks leaves her with nothing to play',
    'A pure Convergence deck is too slow; a pure Flare deck keeps eating its own scaling',
    'Afterglows are not Tricks, so nothing that rewards playing Tricks sees them',
  ],
  startingHp: 64,
  startingEnergy: 3,
  mechanics: {
    glow: { name: 'Glow', kind: 'resource', desc: 'Starts at 0, holds 6. Bright at 3, Blazing at 6. Not Nerve, and it cannot pay costs.', min: 0, max: 9, hooks: ['flared'] },
    linger: { name: 'Linger X', kind: 'system', desc: 'Instead of discarding, the Trick goes face up into the Gloaming with X countdown counters.', min: 0, max: 3, hooks: ['lingered'] },
    gloaming: { name: 'The Gloaming', kind: 'system', desc: 'Wisp’s delayed-Trick zone, outside hand, draw and discard. Cards there are out of circulation.', min: 0, max: 9, hooks: [] },
    afterglow: { name: 'Afterglow', kind: 'system', desc: 'The delayed effect. It resolves when the countdown reaches 0, and it is NOT a Trick being played.', min: 0, max: 9, hooks: ['afterglow'] },
    converge: { name: 'Converge', kind: 'system', desc: 'Two or more Afterglows in one batch. At most one Convergence per batch, however many are involved.', min: 0, max: 1, hooks: ['converge'] },
    hasten: { name: 'Hasten / Delay', kind: 'system', desc: 'Move a countdown down or up. Delay is not a penalty — several builds want the extra time.', min: 0, max: 9, hooks: ['delayed'] },
    flare: { name: 'Flare X', kind: 'system', desc: 'Optionally spend X Glow for the listed extra effect. The central tension: stay Bright, or cash out.', min: 0, max: 9, hooks: ['flared'] },
  },
  startingDeck: [
    'wisp/baby-spark', 'wisp/baby-spark', 'wisp/baby-spark', 'wisp/baby-spark',
    'wisp/soft-halo', 'wisp/soft-halo', 'wisp/soft-halo', 'wisp/soft-halo',
    'wisp/wait-wait', 'wisp/nightlight-practice',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Convergence', desc: 'Schedule several Afterglows to land in the same batch. The highest ceiling she has, and the slowest to set up.', coreCards: ['wisp/bonk-from-later', 'wisp/spark-parade', 'wisp/line-them-up', 'wisp/cut-the-wait', 'wisp/all-at-once', 'wisp/same-time-tomorrow', 'wisp/constellation-practice', 'wisp/tiny-star-long-shadow'] },
    { name: 'Deep Gloaming', desc: 'Keep several Tricks suspended at once — it shrinks the active deck as well as banking value, which is two benefits from one decision.', coreCards: ['wisp/still-here', 'wisp/orbiting-sparks', 'wisp/room-for-more', 'wisp/small-orbit', 'wisp/three-little-lights', 'wisp/gloaming-gets-crowded', 'wisp/encore'] },
    { name: 'Bright Wisp', desc: 'Accumulate Glow and stay above the thresholds rather than cashing out. Everything gets quietly better and nothing is ever spent.', coreCards: ['wisp/pop', 'wisp/nightlight', 'wisp/saved-up-spark', 'wisp/tiny-reservoir', 'wisp/hallway-aurora', 'wisp/bigger-than-a-nightlight', 'wisp/too-bright-for-bedtime'] },
    { name: 'Flare', desc: 'Build and spend, repeatedly. Enormous burst, and it keeps eating the scaling the Bright deck lives on.', coreCards: ['wisp/firefly-tackle', 'wisp/dim-the-room', 'wisp/tiny-supernova', 'wisp/blow-the-fuse', 'wisp/all-the-lamps-at-once', 'wisp/never-goes-out', 'wisp/one-bright-problem'] },
    { name: 'Countdown Manipulation', desc: 'Treat the schedule as the puzzle. Hasten, Delay, stop the clocks, and make the future arrive when it suits you.', coreCards: ['wisp/one-more-second', 'wisp/not-yet', 'wisp/scoot-the-spark', 'wisp/split-second', 'wisp/stop-the-clocks', 'wisp/falling-dominoes', 'wisp/good-things-come', 'wisp/peekaboo-meteor'] },
  ],
};
