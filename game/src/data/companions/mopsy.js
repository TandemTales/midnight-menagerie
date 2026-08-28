/**
 * Mopsy, the Rag Doll Bunny.  OWNER: companion-cards.
 * Spec: docs/design/companions/10-mopsy.md
 *
 * Stuffing · Cushion · Plump / Hollow · Patches and Stitches · Reinforce ·
 * Tear and Mend (the Torn pile) · Scrap
 *
 * Mopsy rebuilds her own deck while the fight is happening. She sews Patches
 * onto individual Tricks, tears Tricks out to a fifth pile and mends them back,
 * and spends the Stuffing that is simultaneously her crafting material and her
 * armour.
 *
 * ── How the three systems are actually stored ───────────────────────────────
 *
 * PATCHES live on the RUNTIME CARD, not on Mopsy, because the spec requires
 * them to ride with the Trick through hand, draw, discard and Torn. Each card
 * carries `patches: [{ id, stitches }]` and an optional `patchSlots` bonus, via
 * `U.setFlag`. Only the id is stored — the behaviour lives in `PATCHES` below,
 * so a Patch is serialisable and a save can round-trip it.
 *
 * THE TORN PILE is the engine's `stash`. It already exists as a real pile with
 * a real cap and is snapshotted into `engine.state`; nothing rendered it before
 * this Companion, so `scenes/combat.js` grew a Torn pile button beside Draw and
 * Discard. A Torn Trick has NOT Vanished and comes back after combat.
 *
 * CUSHION is an `onCourageLoss` hook, a pipeline step added for it: the spec
 * says "after Guard is applied", and `onIncomingHit` fires before Guard is even
 * consulted, so there was no point in `damage.js` that could see the number
 * Cushion is defined against. It is a status rather than a Power so the player
 * can see it sitting there, and so the once-per-enemy-turn allowance has
 * somewhere to live.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE, SPECIAL } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'mopsy';
const N = U.N;

const STUFFING = 'stuffing';
const MAX_STUFFING = 6;
const PLUMP_AT = 5;
const MAX_STITCHES = 4;
const TORN = 'stash';

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── Stuffing ────────────────────────────────────────────────────────────────
const stuffing = (c) => U.res(c, STUFFING);
const isPlump = (c) => stuffing(c) >= PLUMP_AT;
const isHollow = (c) => stuffing(c) === 0;

function gainStuffing(c, n) {
  if (n <= 0) return 0;
  const before = stuffing(c);
  const give = Math.min(n, MAX_STUFFING - before);
  if (give <= 0) return 0;
  // The cap is enforced here, not by addRes's `max`: Stuffing is a counter-backed
  // resource and addRes hands the whole delta to addCounter. See _util.js.
  U.addRes(c, STUFFING, give, 0, MAX_STUFFING);
  return stuffing(c) - before;
}

function spendStuffing(c, n) {
  const have = Math.min(n, stuffing(c));
  if (have <= 0) return 0;
  U.addRes(c, STUFFING, -have, 0, MAX_STUFFING);
  const s = U.mm(c);
  if (s.memoryFoam && U.once(c, 'memoryFoam')) s.nextTrickCheaper = true;
  return have;
}

function setStuffing(c, n) {
  const target = Math.max(0, Math.min(MAX_STUFFING, n));
  const delta = target - stuffing(c);
  if (delta > 0) gainStuffing(c, delta);
  else if (delta < 0) spendStuffing(c, -delta);
  return stuffing(c);
}

// ── Patches ─────────────────────────────────────────────────────────────────
/**
 * Every Patch effect in the game, keyed by id. A card stores only the id and a
 * Stitch count, so a Patch survives a snapshot and a replay.
 *
 * `when: 'play'` fires from the card:play listener. 'cost' and 'retain' are
 * PASSIVE — they are read where the engine asks, never triggered — and they
 * deliberately do not consume Stitches on being played, which is what Secret
 * Pocket's rules text says out loud.
 */
const PATCHES = {
  guard: { id: 'guard', text: 'When played, gain 4 Guard.', when: 'play', fn: (c) => U.guard(c, 4) },
  guardBig: { id: 'guardBig', text: 'When played, gain 7 Guard.', when: 'play', fn: (c) => U.guard(c, 7) },
  pocket: {
    id: 'pocket', text: 'When played, if 3 or fewer Tricks remain in hand, draw 1.', when: 'play',
    fn: (c) => { if (U.cardsIn(c, 'hand').length <= 3) U.draw(c, 1); },
  },
  draw: { id: 'draw', text: 'When played, draw 1 Trick.', when: 'play', fn: (c) => U.draw(c, 1) },
  scrap: { id: 'scrap', text: 'When played, add a Scrap to your discard pile.', when: 'play', fn: (c) => spawnScrap(c, 1, 'discard') },
  bell: { id: 'bell', text: 'When played, deal 4 damage to all enemies.', when: 'play', fn: (c) => U.hitAll(c, 4) },
  weighted: {
    id: 'weighted', text: 'When played, an Attack deals 7 more damage; anything else gains 4 Guard.', when: 'play',
    fn: (c, card) => {
      if (isAttackCard(card)) { const t = c.target || c.randomEnemy(); if (t) c.damage(t, 7); }
      else U.guard(c, 4);
    },
  },
  cheaper: { id: 'cheaper', text: 'While attached, this Trick costs 1 less Nerve.', when: 'cost' },
  secret: { id: 'secret', text: 'At the end of your turn, Retain this Trick. Loses a Stitch when it does.', when: 'retain' },
};

const isAttackCard = (k) => {
  const t = (k && (k.type || (k.def && k.def.type))) || '';
  return String(t).toLowerCase() === 'attack';
};

const patchesOn = (card) => (U.flag(card, 'patches') || []);
const slotsOn = (c, card) => 1 + (U.counter(card, 'patchSlots') || 0) + (U.mm(c).masterSeamstress ? 1 : 0);
const patchable = (card) => !!card && String((card.type || (card.def && card.def.type)) || '').toLowerCase() !== 'status'
  && String((card.rarity || (card.def && card.def.rarity)) || '') !== 'curse';

function setPatches(card, list) { U.setFlag(card, 'patches', list.slice()); }

/** Sew a Patch on. Replaces one at random when there is no free slot. */
function patch(c, card, kind, stitches = 2) {
  if (!card || !patchable(card) || !PATCHES[kind]) return false;
  const s = U.mm(c);
  let n = stitches;
  if (s.sewingKit && U.once(c, 'sewingKit')) n += U.stacks(c, c.self, 'mopsy/sewing-kit');
  if (s.threadBonus) { n += s.threadBonus; s.threadBonus = 0; }
  n = Math.min(MAX_STITCHES, n);
  const list = patchesOn(card).slice();
  if (list.length >= slotsOn(c, card)) list.shift();
  list.push({ id: kind, stitches: n });
  setPatches(card, list);
  U.fire(c, 'patchApplied', { card, kind });
  return true;
}

/** Add a Stitch to one Patch, to the maximum of four. */
function reinforce(c, card, n = 1) {
  const list = patchesOn(card).slice();
  if (!list.length) return false;
  list[0] = { ...list[0], stitches: Math.min(MAX_STITCHES, list[0].stitches + n) };
  setPatches(card, list);
  U.mm(c).reinforcedThisTurn = true;
  return true;
}

/** Any patched Trick in hand, for the many Tricks that say "a Patch in your hand". */
const patchedInHand = (c) => U.cardsIn(c, 'hand').filter((k) => patchesOn(k).length > 0);
const allPatched = (c) => ['hand', 'draw', 'discard', TORN]
  .flatMap((p) => U.cardsIn(c, p)).filter((k) => patchesOn(k).length > 0);
const distinctPatchKinds = (c) => new Set(allPatched(c).flatMap((k) => patchesOn(k).map((x) => x.id)));

/** A Patch triggering: run it, then spend a Stitch unless something says not to. */
function firePatch(c, card, entry, index) {
  const def = PATCHES[entry.id];
  if (!def || def.when !== 'play') return;
  try { def.fn(c, card); } catch (err) { console.error('[mopsy] patch ' + entry.id + ' threw', err); }
  const s = U.mm(c);
  let cost = 1;
  if (s.noStitchLoss > 0) { s.noStitchLoss--; cost = 0; }
  else if (s.economyPlump && isPlump(c) && U.once(c, 'economyPlump')) cost = 0;
  else if (s.freeTriggerFor === entry.id) { s.freeTriggerFor = null; cost = 0; }
  if (s.extraStitchLoss) cost += s.extraStitchLoss;
  const list = patchesOn(card).slice();
  const cur = list[index];
  if (!cur) return;
  const left = cur.stitches - cost;
  if (left > 0) { list[index] = { ...cur, stitches: left }; setPatches(card, list); return; }
  list.splice(index, 1);
  setPatches(card, list);
  breakPatch(c, card, entry);
}

/** A Patch running out of Stitches. Several Tricks care about this specifically. */
function breakPatch(c, card, entry) {
  const s = U.mm(c);
  if (!s.brokeThisTurn) s.brokeThisTurn = [];
  s.brokeThisTurn.push(entry.id);
  if (s.heirloom && U.once(c, 'heirloom')) {
    const host = U.cardsIn(c, 'hand').concat(U.cardsIn(c, 'discard'))
      .find((k) => k !== card && patchable(k) && patchesOn(k).length === 0);
    if (host) { setPatches(host, [{ id: entry.id, stitches: 1 }]); return; }
  }
  U.fire(c, 'patchBroke', { card, kind: entry.id });
}

// ── Tear and Mend ───────────────────────────────────────────────────────────
function tear(c, card) {
  if (!card || card === c.card) return false;
  U.moveCard(c, card, TORN, { torn: true });
  /* The engine lets a Trick be played out of `stash` — that zone exists for
     Hush's Shadow Pocket, which is a second hand. Mopsy's Torn pile is the
     opposite: "cannot normally be drawn or played until something Mends it".
     Without this flag a Torn Trick was fully playable from the Torn pile. */
  card.unplayable = true;
  const s = U.mm(c);
  s.toreThisTurn = (s.toreThisTurn || 0) + 1;
  if (s.ragBag && U.once(c, 'ragBag')) gainStuffing(c, U.stacks(c, c.self, 'mopsy/rag-bag'));
  if (s.shipOfMopsy && U.once(c, 'shipOfMopsy')) {
    const def = card.def || card;
    U.spawn(c, def, 'hand', { temporary: true, cost: 0 });
  }
  U.fire(c, 'tore', { card });
  return true;
}

function mend(c, card, pile = 'discard') {
  if (!card) return false;
  const s = U.mm(c);
  if (!s.mendedThisTurn) s.mendedThisTurn = [];
  const uid = card.uid || card.id;
  if (s.mendedThisTurn.includes(uid)) return false;   // no trivial recursion
  s.mendedThisTurn.push(uid);
  card.unplayable = false;
  U.moveCard(c, card, pile, {});
  if (s.wellLoved && U.once(c, 'wellLoved')) {
    U.guard(c, 6 * U.stacks(c, c.self, 'mopsy/well-loved'));
    reinforce(c, card, 1);
  }
  U.fire(c, 'mended', { card });
  return true;
}

const tornCards = (c) => U.cardsIn(c, TORN);

// ── Scrap ───────────────────────────────────────────────────────────────────
const SCRAP = {
  id: 'mopsy/scrap', name: 'Scrap', companion: SLUG, type: SKILL, rarity: SPECIAL,
  cost: 0, target: SELF, exhaust: true, ethereal: true, keywords: ['scrap', 'stuffing', 'reinforce'],
  text: 'Choose one: gain {n} [Stuffing], or [Reinforce] a [Patch] in your hand by {n}. [Vanish].',
  flavor: 'Too small to be anything. Too useful to throw away.',
  nums: { n: 1 },
  effect: eff((c) => U.chooseOne(c, [
    { label: 'Gain 1 Stuffing', fn: (x) => gainStuffing(x, N(x).n) },
    { label: 'Reinforce a Patch', fn: (x) => { const k = patchedInHand(x)[0]; if (k) reinforce(x, k, N(x).n); }, when: (x) => patchedInHand(x).length > 0 },
  ])),
  upgrade: { nums: { n: 2 } },
};
const spawnScrap = (c, n = 1, pile = 'hand') => { for (let i = 0; i < n; i++) U.spawn(c, SCRAP, pile, { temporary: true }); };

const power = (c, id, n, install) => {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
};

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    { id: STUFFING, name: 'Stuffing', icon: 'stuffing', min: 0, max: MAX_STUFFING, start: 3,
      desc: 'Mopsy’s crafting material and her armour. Plump at 5 or 6, Hollow at 0.',
      states: [{ at: 0, label: 'Hollow' }, { from: PLUMP_AT, to: MAX_STUFFING, label: 'Plump' }] },
  ]);
  const fake = () => U.trackerCtx(e, seat);

  // Cushion is inherent, so it is applied once rather than bought. The status
  // carries the onCourageLoss hook and shows the player it is there.
  const c0 = fake();
  if (U.stacks(c0, c0.self, 'cushion') === 0) U.applySelf(c0, 'cushion', 1);


  /* Patches fire when their Trick is played. `card:play` carries `card`, and
     CONTRACTS trap 11 is explicit that it does NOT carry `type` — the card
     object is what to ask. Iterated backwards because a Patch that breaks
     splices itself out of the list. */
  e.on('card:play', (ev) => {
    /* `seat` here is the ACTOR the tracker was installed for, the way
       U.onPlayerTurn takes it -- while `ev.seat` is a NUMBER. Comparing the
       two was always unequal, so this listener returned on its first line
       every single time and every Patch was silently inert. `card:play`
       carries `actorId`; compare that. (CONTRACTS trap 11.) */
    if (seat && ev.actorId && ev.actorId !== seat.id) return;
    const c = fake();
    /* `card:play` carries a SNAPSHOT in `ev.card`, not the runtime card —
       CONTRACTS trap 11. Patches live on the real card's `meta`, so the snapshot
       has none and every Patch silently did nothing. Look it up by uid. */
    const card = e.card(ev.cardUid);
    if (!card) return;
    const st = U.mm(c);
    const list = patchesOn(card);
    if (!list.length) return;
    let extra = 0;
    if (st.threadbare && isHollow(c) && U.once(c, 'threadbare')) extra = 1;
    if (st.doubleTrigger) extra += st.doubleTrigger;
    for (let i = list.length - 1; i >= 0; i--) {
      for (let rep = 0; rep <= extra; rep++) firePatch(c, card, list[i], i);
    }
    st.playedPatchKinds = (st.playedPatchKinds || []).concat(list.map((x) => x.id));
    if (st.patternBook && new Set(st.playedPatchKinds).size >= 2 && U.once(c, 'patternBook')) gainStuffing(c, 1);
  });

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.brokeThisTurn = [];
    st.mendedThisTurn = [];
    st.playedPatchKinds = [];
    st.toreThisTurn = 0;
    st.reinforcedThisTurn = false;
    st.noStitchLoss = 0;
    st.extraStitchLoss = 0;
    st.doubleTrigger = 0;
    st.threadBonus = 0;
    st.freeTriggerFor = null;
    if (st.wholePatternBonus) { U.energy(c, 1); U.draw(c, 1); st.wholePatternBonus = false; }
    if (st.heldTogetherDraw) { U.draw(c, st.heldTogetherDraw); st.heldTogetherDraw = 0; }
    if (st.fortRefund) { gainStuffing(c, Math.min(2, st.fortRefund)); st.fortRefund = 0; }
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);
    // Secret Pocket retains its Trick, and pays a Stitch for doing it.
    for (const k of U.cardsIn(c, 'hand')) {
      const list = patchesOn(k);
      const idx = list.findIndex((x) => x.id === 'secret');
      if (idx < 0) continue;
      U.retain(c, k, 'turn');
      const copy = list.slice();
      const left = copy[idx].stitches - 1;
      if (left > 0) copy[idx] = { ...copy[idx], stitches: left };
      else { copy.splice(idx, 1); breakPatch(c, k, list[idx]); }
      setPatches(k, copy);
    }
    if (st.safetyPins) { const k = patchedInHand(c)[0]; if (k) reinforce(c, k, 1); }
    if (st.wholePattern && distinctPatchKinds(c).size >= 3) st.wholePatternBonus = true;
  }, seat);
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('patchBroke', 'mopsy/loose-ends', (c) => {
  if (!U.once(c, 'looseEnds')) return;
  U.draw(c, 1);
  spawnScrap(c, 1, 'discard');
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'mopsy/sock-kick', name: 'Sock Kick', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'One sock. Considerable follow-through.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'mopsy/folded-arms', name: 'Folded Arms', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Stuffed arms fold better than real ones.',
    nums: { b: 5 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 8 } },
  },
  {
    id: 'mopsy/beginners-patch', name: 'Beginner’s Patch', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: '[Patch] a Trick in your hand: "When played, gain 4 Guard." {n} [Stitch]es.',
    flavor: 'Crooked, but it holds.',
    nums: { n: 2 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'guard', N(c).n); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/loose-stuffing', name: 'Loose Stuffing', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['stuffing'],
    text: 'Gain {n} [Stuffing].',
    flavor: 'There is always a bit more in there somewhere.',
    nums: { n: 1 },
    effect: eff((c) => gainStuffing(c, N(c).n)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/snip-and-save', name: 'Snip and Save', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: NONE, keywords: ['tear', 'stuffing'],
    text: '[Tear] another Trick in your hand. Draw {c1} Trick and gain {n} [Stuffing].',
    flavor: 'Saved for later. Later always comes.',
    nums: { c1: 1, n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Tear which Trick?' });
      if (k) tear(c, k);
      U.draw(c, N(c).c1); gainStuffing(c, N(c).n);
    }),
    upgrade: { nums: { c1: 2, n: 1 } },
  },
  {
    id: 'mopsy/little-repair', name: 'Little Repair', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: NONE, keywords: ['mend', 'torn'],
    text: '[Mend] a chosen [Torn] Trick to your discard pile.',
    flavor: 'Good as new. Nearly. Nearly good as new.',
    nums: {},
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: TORN, count: 1, prompt: 'Mend which Trick?' }); if (k) mend(c, k, 'discard'); }),
    upgrade: { cost: 0 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'mopsy/soft-paw-thump', name: 'Soft Paw Thump', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['patch'],
    text: 'Deal {d} damage. If this Trick has a [Patch], deal {m0} more.',
    flavor: 'Velvet over something considerably less soft.',
    nums: { d: 5, m0: 4 },
    effect: eff((c) => U.hit(c, N(c).d + (patchesOn(c.card).length ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 5 } },
  },
  {
    id: 'mopsy/button-bonk', name: 'Button Bonk', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['plump'],
    text: 'Deal {d} damage twice. While [Plump], the second hit deals {m0} more.',
    flavor: 'Both eyes are buttons. Only one of them is for looking.',
    nums: { d: 4, m0: 3, hits: 2 },
    effect: eff((c) => { U.hit(c, N(c).d); U.hit(c, N(c).d + (isPlump(c) ? N(c).m0 : 0)); }),
    upgrade: { nums: { d: 6, m0: 4, hits: 2 } },
  },
  {
    id: 'mopsy/running-stitch', name: 'Running Stitch', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['reinforce', 'patch'],
    text: 'Deal {d} damage. [Reinforce] a [Patch] on another Trick in your hand by {n}.',
    flavor: 'In and out, in and out, all the way along.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => { U.hit(c, N(c).d); const k = patchedInHand(c).find((x) => x !== c.card); if (k) reinforce(c, k, N(c).n); }),
    upgrade: { nums: { d: 10, n: 2 } },
  },
  {
    id: 'mopsy/loose-ear-lariat', name: 'Loose Ear Lariat', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['hollow', 'scrap'],
    text: 'Deal {d} damage. If [Hollow], add a [Scrap] to your discard pile.',
    flavor: 'The ear has been loose since the beginning. It is load-bearing now.',
    nums: { d: 7 },
    effect: eff((c) => { U.hit(c, N(c).d); if (isHollow(c)) spawnScrap(c, 1, 'discard'); }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'mopsy/hopscotch-hem', name: 'Hopscotch Hem', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['patch', 'stitch'],
    text: 'Deal {d} damage. A [Patch] on this Trick loses {n} extra [Stitch] after triggering.',
    flavor: 'Hop, hop, hop, and the hem gives a little more each time.',
    nums: { d: 4, n: 1 },
    effect: eff((c) => { U.mm(c).extraStitchLoss = N(c).n; U.hit(c, N(c).d); U.atTurnEnd(c, (x) => { U.mm(x).extraStitchLoss = 0; }); }),
    upgrade: { nums: { d: 7, n: 1 } },
  },
  {
    id: 'mopsy/stuffing-toss', name: 'Stuffing Toss', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['stuffing'],
    text: 'Deal {d} damage. You may spend {n} [Stuffing] to deal {m0} to every other enemy.',
    flavor: 'She can spare a handful. Probably.',
    nums: { d: 7, m0: 4, n: 1 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      if (stuffing(c) >= N(c).n && spendStuffing(c, N(c).n)) {
        for (const en of U.others(c)) U.hitAt(c, en, N(c).m0);
      }
    }),
    upgrade: { nums: { d: 10, m0: 6, n: 1 } },
  },
  {
    id: 'mopsy/quick-patch', name: 'Quick Patch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: '[Patch] a Trick in your hand or discard pile: "When played, gain 4 Guard." {n} [Stitch]es.',
    flavor: 'Fast, and only slightly the wrong colour.',
    nums: { n: 2 },
    /* DESIGN DEVIATION, stated per CONTRACTS rule 8: the doc gives Quick Patch
       the identical line to Beginner's Patch, which makes the Common a strictly
       redundant copy of a Basic. Reaching the discard pile is the smallest
       change that earns it its slot in the 80. */
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Patch which Trick?', filter: patchable });
      if (k) { patch(c, k, 'guard', N(c).n); return; }
      const [d] = await U.pickCards(c, { pile: 'discard', count: 1, prompt: 'Patch which Trick in the discard pile?', filter: patchable });
      if (d) patch(c, d, 'guard', N(c).n);
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/pocket-patch', name: 'Pocket Patch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['patch'],
    text: '[Patch] a Trick: "When played, if 3 or fewer Tricks are left in hand, draw 1." {n} [Stitch]es.',
    flavor: 'A pocket is a hole you meant.',
    nums: { n: 2 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'pocket', N(c).n); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/stuff-it-back-in', name: 'Stuff It Back In', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['stuffing', 'plump'],
    text: 'Gain {n} [Stuffing]. If already [Plump], gain {b} Guard instead of wasting any.',
    flavor: 'Most of it goes back in.',
    nums: { n: 2, b: 6 },
    effect: eff((c) => { if (isPlump(c)) U.guard(c, N(c).b); else { const got = gainStuffing(c, N(c).n); if (got < N(c).n) U.guard(c, N(c).b); } }),
    upgrade: { nums: { n: 3, b: 9 } },
  },
  {
    id: 'mopsy/snip-snip', name: 'Snip Snip', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['tear', 'vanish'],
    exhaust: true,
    text: '[Tear] another Trick from your hand. Draw {c1} Tricks. [Vanish].',
    flavor: 'Two cuts. No hesitation.',
    nums: { c1: 2 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Tear which Trick?' });
      if (k) tear(c, k);
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 3 } },
  },
  {
    id: 'mopsy/find-that-piece', name: 'Find That Piece', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['mend', 'reinforce', 'torn'],
    text: '[Mend] a chosen [Torn] Trick to your discard pile. If it has a [Patch], [Reinforce] it by {n}.',
    flavor: 'It was under the sofa. It is always under the sofa.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: TORN, count: 1, prompt: 'Mend which Trick?' });
      if (!k) return;
      if (patchesOn(k).length) reinforce(c, k, N(c).n);
      mend(c, k, 'discard');
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/pin-it-there', name: 'Pin It There', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['reinforce', 'patch', 'vanish'],
    exhaust: true,
    text: 'Retain another Trick this turn. If it has a [Patch], [Reinforce] it by {n}. [Vanish].',
    flavor: 'A pin is a promise.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Pin which Trick?' });
      if (k) { U.retain(c, k, 'turn'); if (patchesOn(k).length) reinforce(c, k, N(c).n); }
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/shake-out-the-fluff', name: 'Shake Out the Fluff', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['stuffing', 'vanish'],
    exhaust: true,
    text: 'Spend {n} [Stuffing]. Draw {c1} Tricks. [Vanish].',
    flavor: 'A vigorous shake, and out it comes.',
    nums: { n: 1, c1: 2 },
    effect: eff((c) => {
      if (spendStuffing(c, N(c).n) > 0) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 1, c1: 3 } },
  },
  {
    id: 'mopsy/emergency-sewing', name: 'Emergency Sewing', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['stuffing'],
    text: 'Gain {b} Guard. You may spend {n} [Stuffing] to gain {b2} more.',
    flavor: 'Needle in her teeth, thread in her paw, monster in the doorway.',
    nums: { b: 6, b2: 6, n: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); if (spendStuffing(c, N(c).n) > 0) U.guard(c, N(c).b2); }),
    upgrade: { nums: { b: 9, b2: 9, n: 1 } },
  },
  {
    id: 'mopsy/cross-stitch', name: 'Cross Stitch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['patch', 'reinforce', 'stitch'],
    text: 'Move a [Patch] from one Trick in your hand to another, keeping its [Stitch]es, then [Reinforce] it by {n}.',
    flavor: 'The same patch, somewhere more useful.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const from = patchedInHand(c)[0];
      if (!from) return;
      const [to] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Move the Patch onto which Trick?', filter: (k) => k !== from && patchable(k) });
      if (!to) return;
      const list = patchesOn(from).slice();
      const moved = list.shift();
      setPatches(from, list);
      const dest = patchesOn(to).slice();
      if (dest.length >= slotsOn(c, to)) dest.shift();
      dest.push({ ...moved, stitches: Math.min(MAX_STITCHES, moved.stitches + N(c).n) });
      setPatches(to, dest);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/save-the-scraps', name: 'Save the Scraps', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['scrap'],
    text: 'Add one [Scrap] to your hand and {n} to your discard pile.',
    flavor: 'The scrap bag is the most valuable thing she owns.',
    nums: { n: 1 },
    effect: eff((c) => { spawnScrap(c, 1, 'hand'); spawnScrap(c, N(c).n, 'discard'); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/neat-hem', name: 'Neat Hem', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: NONE, keywords: ['reinforce', 'vanish'],
    exhaust: true,
    text: '[Reinforce] a [Patch] in your hand by {n}. [Vanish].',
    flavor: 'Somebody in this house can sew properly and it is the rabbit.',
    nums: { n: 2 },
    effect: eff((c) => {
      const k = patchedInHand(c)[0];
      if (k) reinforce(c, k, N(c).n);
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/unstuff-yourself', name: 'Unstuff Yourself', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['stuffing', 'vanish'],
    exhaust: true,
    text: 'Spend up to {n} [Stuffing]. Draw a Trick for each. [Vanish].',
    flavor: 'It is fine. It goes back in. Mostly.',
    nums: { n: 2 },
    effect: eff((c) => {
      const spent = spendStuffing(c, Math.min(N(c).n, stuffing(c)));
      U.draw(c, spent);
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/cushion-check', name: 'Cushion Check', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['cushion', 'stuffing'],
    text: 'Gain {b} Guard. Next enemy turn, [Cushion] may be used against {n} more hits. Each still costs 1 [Stuffing].',
    flavor: 'She checks her own seams before the lights go out.',
    nums: { b: 4, n: 1 },
    effect: eff((c) => { U.guard(c, N(c).b); U.applySelf(c, 'cushion-extra', N(c).n); }),
    upgrade: { nums: { b: 7, n: 2 } },
  },
  {
    id: 'mopsy/temporary-fix', name: 'Temporary Fix', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: '[Patch] a Trick: "While attached, this costs 1 less Nerve." {n} [Stitch].',
    flavor: 'Temporary in the way that most things in this house are temporary.',
    nums: { n: 1 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'cheaper', N(c).n); }),
    upgrade: { nums: { n: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (10) ──
  {
    id: 'mopsy/needle-nose-dive', name: 'Needle Nose Dive', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['reinforce'],
    text: 'Deal {d} damage. If you [Reinforce]d a [Patch] this turn, deal {m0} more.',
    flavor: 'Nose first, as always.',
    nums: { d: 7, m0: 5 },
    effect: eff((c) => U.hit(c, N(c).d + (U.mm(c).reinforcedThisTurn ? N(c).m0 : 0))),
    upgrade: { nums: { d: 10, m0: 7 } },
  },
  {
    id: 'mopsy/seam-ripper', name: 'Seam Ripper', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['tear'],
    text: 'Deal {d} damage. You may [Tear] another Trick; deal {m0} more for each Nerve it cost, up to 3 hits.',
    flavor: 'It only rips along the seam. That is the whole trick of it.',
    nums: { d: 7, m0: 4 },
    balance: { scalesWith: 'the cost of whatever you Tear -- up to three more hits' },
    effect: eff(async (c) => {
      U.hit(c, N(c).d);
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Tear which Trick?' });
      if (!k) return;
      const n = Math.min(3, Math.max(0, U.nowCost(k)));
      tear(c, k);
      for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0);
    }),
    upgrade: { nums: { d: 10, m0: 6 } },
  },
  {
    id: 'mopsy/patchwork-pummel', name: 'Patchwork Pummel', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['patch'],
    text: 'Deal {d} damage, plus {m0} for each differently worded [Patch] you have attached, up to 3.',
    flavor: 'Every patch is somebody’s idea of a repair.',
    nums: { d: 12, m0: 4 },
    effect: eff((c) => { U.hit(c, N(c).d); const n = Math.min(3, distinctPatchKinds(c).size); for (let i = 0; i < n; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 16, m0: 6 } },
  },
  {
    id: 'mopsy/stuffing-cannon', name: 'Stuffing Cannon', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['stuffing'],
    text: 'Deal {d} damage. Spend up to {n} [Stuffing]; deal {m0} more for each.',
    flavor: 'Fired out of the hole in her side, which she insists is a feature.',
    nums: { d: 7, m0: 4, n: 3 },
    balance: { scalesWith: 'the Stuffing you are willing to give up -- up to three more hits' },
    effect: eff((c) => { U.hit(c, N(c).d); const spent = spendStuffing(c, Math.min(N(c).n, stuffing(c))); for (let i = 0; i < spent; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6, n: 3 } },
  },
  {
    id: 'mopsy/hop-until-it-holds', name: 'Hop Until It Holds', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['patch', 'stitch'],
    text: 'Deal {d} damage 3 times. [Patch]es on this Trick lose {n} [Stitch]es instead of 1.',
    flavor: 'Eventually it holds. Usually.',
    nums: { d: 4, n: 2, hits: 3 },
    effect: eff((c) => { U.mm(c).extraStitchLoss = N(c).n - 1; U.hitN(c, N(c).d, 3); U.atTurnEnd(c, (x) => { U.mm(x).extraStitchLoss = 0; }); }),
    upgrade: { nums: { d: 6, n: 2, hits: 3 } },
  },
  {
    id: 'mopsy/mend-and-maul', name: 'Mend and Maul', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['mend', 'torn'],
    text: '[Mend] an Attack from your [Torn] pile to your hand; it costs {n} less this turn. Deal {d} damage.',
    flavor: 'Fix the paw, then use the paw.',
    nums: { d: 7, n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: TORN, count: 1, optional: true, prompt: 'Mend which Attack?', filter: isAttackCard });
      if (k && mend(c, k, 'hand')) U.costMod(c, k, -N(c).n, 'turn');
      U.hit(c, N(c).d);
    }),
    upgrade: { nums: { d: 10, n: 2 } },
  },
  {
    id: 'mopsy/pattern-match', name: 'Pattern Match', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['patch'],
    text: 'Deal {d} damage. If another Trick in hand carries a [Patch] worded like one on this Trick, deal it again.',
    flavor: 'Two of the same patch is a pattern, and patterns are powerful.',
    nums: { d: 7 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const mine = new Set(patchesOn(c.card).map((x) => x.id));
      if (!mine.size) return;
      const twin = U.handOthers(c).some((k) => patchesOn(k).some((x) => mine.has(x.id)));
      if (twin) U.hitAt(c, c.target, N(c).d);
    }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'mopsy/flop-with-confidence', name: 'Flop With Confidence', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['plump'],
    text: 'Deal {d} damage. Costs 1 less while [Plump].',
    flavor: 'The flop is the attack. Commit to the flop.',
    nums: { d: 14 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (isPlump(c) ? 1 : 2),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'mopsy/hollow-heel-kick', name: 'Hollow Heel Kick', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['hollow', 'vanish'],
    exhaust: true,
    text: 'Deal {d} damage. If [Hollow], deal {m0} more and draw {c1}. [Vanish].',
    flavor: 'Nothing in the heel but the kick.',
    nums: { d: 4, m0: 5, c1: 1 },
    effect: eff((c) => {
      const h = isHollow(c);
      U.hit(c, N(c).d + (h ? N(c).m0 : 0));
      if (h) U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { d: 7, m0: 7, c1: 1 } },
  },
  {
    id: 'mopsy/loose-thread-whip', name: 'Loose Thread Whip', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['patch', 'stitch'],
    text: 'Deal {d} to all enemies. If a [Patch] broke this turn, deal {m0} to all again.',
    flavor: 'Pull the thread. Keep pulling.',
    nums: { d: 7, m0: 4 },
    effect: eff((c) => { U.hitAll(c, N(c).d); if ((U.mm(c).brokeThisTurn || []).length) U.hitAll(c, N(c).m0); }),
    upgrade: { nums: { d: 10, m0: 6 } },
  },

  // ── Skills (18) ──
  {
    id: 'mopsy/quilted-lining', name: 'Quilted Lining', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: '[Patch] a Trick: "When played, gain 7 Guard." {n} [Stitch]es.',
    flavor: 'Warm, and surprisingly good at stopping things.',
    nums: { n: 2 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'guardBig', N(c).n); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/lucky-button', name: 'Lucky Button', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch', 'scrap'],
    text: '[Patch] a Trick: "When played, add a [Scrap] to your discard pile." {n} [Stitch]es.',
    flavor: 'It came off a coat nobody remembers.',
    nums: { n: 2 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'scrap', N(c).n); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/secret-pocket', name: 'Secret Pocket', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: '[Patch] a Trick: "At the end of your turn, Retain this. Lose 1 [Stitch] when it does." {n} [Stitch]es.',
    flavor: 'Everybody assumed it was just a lump.',
    nums: { n: 2 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'secret', N(c).n); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/weighted-hem', name: 'Weighted Hem', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch'],
    text: '[Patch] a Trick: an Attack deals 7 more damage, anything else gains 4 Guard. {n} [Stitch]es.',
    flavor: 'Pennies in the hem. An old trick, and a good one.',
    nums: { n: 2 },
    effect: eff(async (c) => { const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Patch which Trick?', filter: patchable }); if (k) patch(c, k, 'weighted', N(c).n); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/double-stitch', name: 'Double Stitch', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: 'Give a Trick one more [Patch] slot this combat, then [Patch] it: "When played, gain 4 Guard." {n} [Stitch].',
    flavor: 'Twice through, both ways.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Which Trick?', filter: patchable });
      if (!k) return;
      U.addCounter(k, 'patchSlots', 1);
      patch(c, k, 'guard', N(c).n);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/baste-and-test', name: 'Baste and Test', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['patch', 'vanish'],
    exhaust: true,
    text: 'Look at the top 3 of your draw pile and [Patch] one: "When played, draw 1." {n} [Stitch]. [Vanish].',
    flavor: 'A loose stitch to see whether it sits right.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'draw', count: 1, optional: true, prompt: 'Baste which Trick?', filter: patchable });
      if (k) patch(c, k, 'draw', N(c).n);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/thread-the-needle', name: 'Thread the Needle', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch', 'stitch'],
    text: 'Your next [Patch] this turn starts with {n} more [Stitch]es. Draw {c1} Trick.',
    flavor: 'Third time. Always the third time.',
    nums: { n: 2, c1: 1 },
    effect: eff((c) => { U.mm(c).threadBonus = N(c).n; U.draw(c, N(c).c1); }),
    upgrade: { nums: { n: 2, c1: 2 } },
  },
  {
    id: 'mopsy/mend-with-love', name: 'Mend With Love', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['mend', 'plump', 'reinforce'],
    text: '[Mend] a [Torn] Trick to your hand; it costs {n} less this turn. If [Plump], [Reinforce] a [Patch] on it.',
    flavor: 'She talks to it while she works.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: TORN, count: 1, prompt: 'Mend which Trick?' });
      if (!k || !mend(c, k, 'hand')) return;
      U.costMod(c, k, -N(c).n, 'turn');
      if (isPlump(c)) reinforce(c, k, 1);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/ripcord', name: 'Ripcord', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['tear', 'stuffing', 'vanish'],
    exhaust: true,
    text: '[Tear] up to {n} other Tricks. For each, gain 1 [Stuffing] and draw 1. [Vanish].',
    flavor: 'One pull and everything comes apart on purpose.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const picks = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Tear which Tricks?' });
      for (const k of picks) { if (tear(c, k)) { gainStuffing(c, 1); U.draw(c, 1); } }
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/shake-loose', name: 'Shake Loose', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['patch', 'stuffing'],
    text: 'Remove a [Patch] from one of your Tricks. Gain {n} [Stuffing] and draw {c1}.',
    flavor: 'It was going to come off anyway.',
    nums: { n: 2, c1: 1 },
    effect: eff((c) => {
      const k = patchedInHand(c)[0] || allPatched(c)[0];
      if (k) { const list = patchesOn(k).slice(); list.shift(); setPatches(k, list); }
      gainStuffing(c, N(c).n); U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { n: 3, c1: 2 } },
  },
  {
    id: 'mopsy/stuffing-exchange', name: 'Stuffing Exchange', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['plump', 'hollow', 'stuffing'],
    text: '[Plump]: spend 2 [Stuffing], draw {c1}. [Hollow]: gain 2 [Stuffing], draw 1. Otherwise choose.',
    flavor: 'Give a little, take a little.',
    nums: { c1: 3 },
    effect: eff(async (c) => {
      if (isPlump(c)) { spendStuffing(c, 2); U.draw(c, N(c).c1); return; }
      if (isHollow(c)) { gainStuffing(c, 2); U.draw(c, 1); return; }
      await U.chooseOne(c, [
        { label: 'Spend 2, draw ' + N(c).c1, fn: (x) => { if (spendStuffing(x, 2) === 2) U.draw(x, N(x).c1); }, when: (x) => stuffing(x) >= 2 },
        { label: 'Gain 2, draw 1', fn: (x) => { gainStuffing(x, 2); U.draw(x, 1); } },
      ]);
    }),
    upgrade: { nums: { c1: 4 } },
  },
  {
    id: 'mopsy/inside-out', name: 'Inside Out', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['stuffing', 'plump', 'hollow'],
    text: 'Set [Stuffing] to 6 minus itself. Becoming [Plump] draws {c1}; becoming [Hollow] gains {b} Guard.',
    flavor: 'All the seams are on the outside now.',
    nums: { c1: 2, b: 10 },
    effect: eff((c) => {
      setStuffing(c, MAX_STUFFING - stuffing(c));
      if (isPlump(c)) U.draw(c, N(c).c1);
      else if (isHollow(c)) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { c1: 3, b: 14 } },
  },
  {
    id: 'mopsy/pin-cushion', name: 'Pin Cushion', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch'],
    text: 'Retain up to {n} other Tricks this turn. Gain {b} Guard for each patched one.',
    flavor: 'She is, technically, one.',
    nums: { n: 2, b: 4 },
    effect: eff(async (c) => {
      const picks = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Retain which Tricks?' });
      for (const k of picks) { U.retain(c, k, 'turn'); if (patchesOn(k).length) U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { n: 3, b: 6 } },
  },
  {
    id: 'mopsy/no-loose-ends', name: 'No Loose Ends', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: 'Choose a [Patch]. The next time it triggers it keeps its [Stitch]. Draw {c1}.',
    flavor: 'Tucked in, tied off, invisible.',
    nums: { c1: 1 },
    effect: eff((c) => {
      const k = patchedInHand(c)[0];
      if (k) U.mm(c).freeTriggerFor = patchesOn(k)[0].id;
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'mopsy/recycle-the-ugly-bit', name: 'Recycle the Ugly Bit', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['tear', 'stuffing', 'scrap'],
    text: '[Tear] a Status or Curse from hand or discard. Gain {n} [Stuffing] and a [Scrap]. Otherwise Tear any Trick for the [Stuffing] only.',
    flavor: 'Even the ugly bit is fabric.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const junk = (k) => { const r = String((k.rarity || (k.def && k.def.rarity)) || ''); const t = String((k.type || (k.def && k.def.type)) || ''); return r === 'curse' || t === 'status'; };
      const pool = U.cardsIn(c, 'hand').concat(U.cardsIn(c, 'discard')).filter(junk);
      if (pool.length) { tear(c, pool[0]); gainStuffing(c, N(c).n); spawnScrap(c, 1, 'hand'); return; }
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, optional: true, prompt: 'Tear which Trick?' });
      if (k) { tear(c, k); gainStuffing(c, N(c).n); }
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/tuck-it-under', name: 'Tuck It Under', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['reinforce', 'patch'],
    text: 'Put another Trick on the bottom of your draw pile. If it has a [Patch], [Reinforce] it. Draw {c1}.',
    flavor: 'Out of the way, but not gone.',
    nums: { c1: 1 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Tuck which Trick away?' });
      if (k) { if (patchesOn(k).length) reinforce(c, k, 1); U.toDrawBottom(c, k); }
      U.draw(c, N(c).c1);
    }),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'mopsy/spare-parts', name: 'Spare Parts', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['scrap', 'vanish'],
    exhaust: true,
    text: 'Add {n} [Scrap]s to your hand. [Vanish].',
    flavor: 'A whole drawer of nearly-somethings.',
    nums: { n: 2 },
    effect: eff((c) => spawnScrap(c, N(c).n, 'hand')),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/two-good-stitches', name: 'Two Good Stitches', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch', 'stitch', 'vanish'],
    exhaust: true,
    text: 'The next {n} [Patch] triggers this turn cost no [Stitch]es. [Vanish].',
    flavor: 'Two that will actually hold.',
    nums: { n: 2 },
    effect: eff((c) => { U.mm(c).noStitchLoss = (U.mm(c).noStitchLoss || 0) + N(c).n; }),
    upgrade: { nums: { n: 3 } },
  },

  // ── Powers (7) ──
  {
    id: 'mopsy/sewing-kit', name: 'Sewing Kit', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch', 'stitch'],
    text: 'The first [Patch] you apply each turn starts with {n} more [Stitch]es.',
    flavor: 'Tin box. Rattles. Contains everything.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'mopsy/sewing-kit', N(c).n, (x) => { U.mm(x).sewingKit = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/rag-bag', name: 'Rag Bag', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['tear', 'stuffing'],
    text: 'The first Trick you [Tear] each turn gives you {n} [Stuffing].',
    flavor: 'Everything goes in the bag. Nothing leaves the bag.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'mopsy/rag-bag', N(c).n, (x) => { U.mm(x).ragBag = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/memory-foam', name: 'Memory Foam', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['stuffing'],
    text: 'The first time each turn you spend [Stuffing], your next Trick costs 1 less.',
    flavor: 'It remembers the shape of the last thing that squashed her.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/memory-foam', 1, (x) => { U.mm(x).memoryFoam = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/loose-ends', name: 'Loose Ends', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch', 'scrap'],
    text: 'The first time a [Patch] breaks each turn, draw {c1} and add a [Scrap] to your discard pile.',
    flavor: 'Nothing is wasted. Nothing is ever wasted.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'mopsy/loose-ends', N(c).c1)),
    upgrade: { nums: { c1: 2 } },
  },
  {
    id: 'mopsy/well-loved', name: 'Well Loved', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['mend', 'reinforce'],
    text: 'The first Trick you [Mend] each turn gains you 6 Guard and [Reinforce]s one of its [Patch]es.',
    flavor: 'The worn patches are the ones that were held most.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/well-loved', 1, (x) => { U.mm(x).wellLoved = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/pattern-book', name: 'Pattern Book', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['patch', 'stuffing'],
    text: 'Once a turn, after playing Tricks with two differently worded [Patch]es, gain {n} [Stuffing].',
    flavor: 'Pressed flowers and cut-out shapes, all of it useful.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'mopsy/pattern-book', N(c).n, (x) => { U.mm(x).patternBook = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/safety-pins', name: 'Safety Pins', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['reinforce', 'patch'],
    text: 'At the end of your turn, [Reinforce] one [Patch] on a Trick you are holding.',
    flavor: 'Not elegant. Extremely effective.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/safety-pins', 1, (x) => { U.mm(x).safetyPins = true; })),
    upgrade: { cost: 0 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (7) ──
  {
    id: 'mopsy/the-big-flop', name: 'The Big Flop', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['stuffing'],
    text: 'Deal {d} damage. Spend any amount of [Stuffing]; deal {m0} more for each.',
    flavor: 'Her whole body, all at once, from a height.',
    nums: { d: 20, m0: 4 },
    balance: { scalesWith: 'every point of Stuffing you are willing to empty out' },
    effect: eff((c) => { U.hit(c, N(c).d); const spent = spendStuffing(c, stuffing(c)); for (let i = 0; i < spent; i++) U.hitAt(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 26, m0: 6 } },
  },
  {
    id: 'mopsy/patchwork-meteor', name: 'Patchwork Meteor', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['patch'],
    text: 'Deal {d} to all enemies. Remove up to {n} [Patch]es; deal {m0} more to all for each.',
    flavor: 'Everything she has sewn, thrown at once.',
    nums: { d: 14, m0: 7, n: 4 },
    balance: { scalesWith: 'the Patches you are willing to cash in -- up to four more waves on the whole room' },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      let removed = 0;
      for (const k of allPatched(c)) {
        if (removed >= N(c).n) break;
        const list = patchesOn(k).slice();
        while (list.length && removed < N(c).n) { list.shift(); removed++; }
        setPatches(k, list);
      }
      for (let i = 0; i < removed; i++) U.hitAll(c, N(c).m0);
    }),
    upgrade: { nums: { d: 19, m0: 9, n: 4 } },
  },
  {
    id: 'mopsy/thirty-two-tiny-stitches', name: 'Thirty-Two Tiny Stitches', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['patch', 'stitch'],
    text: 'Deal {d} damage 4 times. [Patch]es on this Trick trigger twice, losing [Stitch]es for both.',
    flavor: 'She counted. Twice.',
    nums: { d: 4, hits: 4 },
    effect: eff((c) => { U.mm(c).doubleTrigger = 1; U.hitN(c, N(c).d, 4); U.atTurnEnd(c, (x) => { U.mm(x).doubleTrigger = 0; }); }),
    upgrade: { nums: { d: 6, hits: 4 } },
  },
  {
    id: 'mopsy/seam-reaper', name: 'Seam Reaper', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['tear'],
    text: 'Deal {d} damage. [Tear] up to {n} Tricks from your discard pile; deal {m0} more for each.',
    flavor: 'It only unmakes. That is all it was ever for.',
    nums: { d: 14, m0: 4, n: 3 },
    balance: { scalesWith: 'how much of your discard pile you are willing to unpick' },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const pool = U.cardsIn(c, 'discard').slice(0, N(c).n);
      for (const k of pool) { if (tear(c, k)) U.hitAt(c, c.target, N(c).m0); }
    }),
    upgrade: { nums: { d: 19, m0: 6, n: 3 } },
  },
  {
    id: 'mopsy/stuffed-to-bursting', name: 'Stuffed to Bursting', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['plump', 'stuffing'],
    text: '[Plump]: deal {m1} and set [Stuffing] to 0. Otherwise deal {d} and gain {n} [Stuffing].',
    flavor: 'There is a limit and she has found it.',
    nums: { d: 14, m1: 26, n: 2 },
    effect: eff((c) => {
      if (isPlump(c)) { U.hit(c, N(c).m1); setStuffing(c, 0); }
      else { U.hit(c, N(c).d); gainStuffing(c, N(c).n); }
    }),
    upgrade: { nums: { d: 19, m1: 33, n: 2 } },
  },
  {
    id: 'mopsy/rabbit-of-theseus', name: 'Rabbit of Theseus', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['mend', 'vanish'],
    exhaust: true,
    text: 'Deal {d} damage. If this Trick was [Mend]ed this turn, put a free copy in your hand. It [Vanish]es.',
    flavor: 'Every bit of her has been replaced. She is still Mopsy.',
    nums: { d: 7 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const uid = c.card && (c.card.uid || c.card.id);
      const mended = (U.mm(c).mendedThisTurn || []).includes(uid);
      if (mended) U.spawn(c, c.card.def || c.card, 'hand', { temporary: true, cost: 0 });
    }),
    upgrade: { nums: { d: 10 } },
  },
  {
    id: 'mopsy/i-can-fix-this', name: 'I Can Fix This', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['patch', 'stitch'],
    text: 'Deal {d} damage. Attach a copy of a [Patch] that broke this turn to this Trick with {n} [Stitch].',
    flavor: 'She can. She usually can.',
    nums: { d: 7, n: 1 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const broke = (U.mm(c).brokeThisTurn || [])[0];
      if (broke) patch(c, c.card, broke, N(c).n);
    }),
    upgrade: { nums: { d: 10, n: 2 } },
  },

  // ── Skills (10) ──
  {
    id: 'mopsy/grand-refit', name: 'Grand Refit', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['patch', 'vanish'],
    exhaust: true,
    text: '[Patch] up to {n} Tricks in hand or discard: "When played, gain 7 Guard." 2 [Stitch]es. [Vanish].',
    flavor: 'Everything on the table. Everything gets a patch.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const picks = await U.pickCards(c, { pile: 'hand', count: N(c).n, optional: true, prompt: 'Refit which Tricks?', filter: patchable });
      for (const k of picks) patch(c, k, 'guardBig', 2);
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'mopsy/full-restuffing', name: 'Full Restuffing', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['stuffing', 'cushion', 'vanish'],
    exhaust: true,
    text: 'Set [Stuffing] to 6. Your next {n} uses of [Cushion] cost nothing. [Vanish].',
    flavor: 'Right up to the seams.',
    nums: { n: 1 },
    effect: eff((c) => {
      setStuffing(c, MAX_STUFFING);
      U.applySelf(c, 'cushion-free', N(c).n);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/emergency-transplant', name: 'Emergency Transplant', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['tear', 'mend', 'patch'],
    text: '[Tear] a Trick from hand and [Mend] a different one to hand, moving a [Patch] across.',
    flavor: 'One of them was going to make it. Only one.',
    nums: {},
    effect: eff(async (c) => {
      const [donor] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Tear which Trick?' });
      if (!donor) return;
      const moved = patchesOn(donor)[0] || null;
      tear(c, donor);
      const [k] = await U.pickCards(c, { pile: TORN, count: 1, optional: true, prompt: 'Mend which Trick?', filter: (x) => x !== donor });
      if (!k || !mend(c, k, 'hand')) return;
      if (!moved) return;
      U.addCounter(k, 'patchSlots', 1);
      setPatches(k, patchesOn(k).concat([moved]));
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'mopsy/borrowed-pattern', name: 'Borrowed Pattern', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: 'Copy a [Patch] from one of your Tricks onto another. The copy starts with {n} [Stitch].',
    flavor: 'She traced it in pencil first.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const src = patchedInHand(c)[0] || allPatched(c)[0];
      if (!src) return;
      const kind = patchesOn(src)[0].id;
      const [to] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Copy the Patch onto which Trick?', filter: (k) => k !== src && patchable(k) });
      if (to) patch(c, to, kind, N(c).n);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/perfect-repair', name: 'Perfect Repair', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: NONE, keywords: ['mend', 'reinforce', 'torn', 'vanish'],
    exhaust: true,
    text: '[Mend] every [Torn] Trick to your discard pile and [Reinforce] a [Patch] on each. Draw {c1}. [Vanish].',
    flavor: 'She sits down properly for this one.',
    nums: { c1: 2 },
    effect: eff((c) => {
      for (const k of tornCards(c).slice()) {
        k.unplayable = false;
        U.moveCard(c, k, 'discard', {});
        if (patchesOn(k).length) reinforce(c, k, 1);
      }
      U.draw(c, N(c).c1);
    }),
    upgrade: { cost: 2 },
  },
  {
    id: 'mopsy/turn-me-inside-out', name: 'Turn Me Inside Out', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, keywords: ['stuffing', 'plump', 'hollow', 'vanish'],
    exhaust: true,
    text: 'Set [Stuffing] to 6 minus itself. [Plump] draws {c1}; [Hollow] gains {b} Guard. [Vanish].',
    flavor: 'Seams out, stuffing in, everything the wrong way round.',
    nums: { c1: 2, b: 10 },
    effect: eff((c) => {
      setStuffing(c, MAX_STUFFING - stuffing(c));
      if (isPlump(c)) U.draw(c, N(c).c1);
      else if (isHollow(c)) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { c1: 3, b: 14 } },
  },
  {
    id: 'mopsy/button-box', name: 'Button Box', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['patch', 'stitch'],
    text: 'Choose a button and [Patch] a Trick with it: draw 1, hit the room, or gain Guard. {n} [Stitch]es.',
    flavor: 'Pearl, brass, velvet. She knows every one of them.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Which Trick gets a button?', filter: patchable });
      if (!k) return;
      await U.chooseOne(c, [
        { label: 'Pearl Button — draw 1', fn: (x) => patch(x, k, 'draw', N(x).n) },
        { label: 'Brass Bell — 4 to all', fn: (x) => patch(x, k, 'bell', N(x).n) },
        { label: 'Velvet Heart — 7 Guard', fn: (x) => patch(x, k, 'guardBig', N(x).n) },
      ]);
    }),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'mopsy/room-for-one-more', name: 'Room for One More', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: NONE, keywords: ['patch'],
    text: 'A non-Power Trick gains {n} [Patch] slots this combat. Move up to {n} existing [Patch]es onto it.',
    flavor: 'There is always room for one more.',
    nums: { n: 2 },
    effect: eff(async (c) => {
      const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Which Trick?', filter: (x) => patchable(x) && String((x.type || (x.def && x.def.type)) || '').toLowerCase() !== 'power' });
      if (!k) return;
      U.addCounter(k, 'patchSlots', N(c).n);
      let moved = 0;
      for (const src of patchedInHand(c)) {
        if (src === k || moved >= N(c).n) continue;
        const list = patchesOn(src).slice();
        const take = list.shift();
        setPatches(src, list);
        setPatches(k, patchesOn(k).concat([take]));
        moved++;
      }
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'mopsy/keep-the-good-bits', name: 'Keep the Good Bits', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: NONE, keywords: ['tear', 'stuffing', 'reinforce', 'vanish'],
    exhaust: true,
    text: 'Choose a Trick. [Tear] the rest of your hand, gaining 1 [Stuffing] each up to {n}. The kept Trick gains a slot and {m} [Stitch]es. [Vanish].',
    flavor: 'The good bits go in the tin.',
    nums: { n: 3, m: 2 },
    effect: eff(async (c) => {
      const [keep] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Which Trick do you keep?' });
      if (!keep) return;
      let torn = 0;
      for (const k of U.handOthers(c).slice()) {
        if (k === keep) continue;
        if (tear(c, k)) torn++;
      }
      gainStuffing(c, Math.min(N(c).n, torn));
      U.addCounter(keep, 'patchSlots', 1);
      reinforce(c, keep, N(c).m);
    }),
    upgrade: { nums: { n: 4, m: 3 } },
  },
  {
    id: 'mopsy/cushion-fort', name: 'Cushion Fort', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['cushion', 'stuffing'],
    text: 'Until your next turn [Cushion] has no usage limit. Each still costs 1 [Stuffing]. Regain up to {n} after.',
    flavor: 'Every cushion in the house, in one doorway.',
    nums: { n: 2 },
    effect: eff((c) => { U.applySelf(c, 'cushion-fort', 1); U.mm(c).fortRefundCap = N(c).n; }),
    upgrade: { nums: { n: 3 } },
  },

  // ── Powers (8) ──
  {
    id: 'mopsy/master-seamstress', name: 'Master Seamstress', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['patch'],
    text: 'Every eligible Trick can hold one more [Patch] for the rest of combat.',
    flavor: 'She has been doing this longer than the house has been standing.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/master-seamstress', 1, (x) => { U.mm(x).masterSeamstress = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'mopsy/heirloom-quilt', name: 'Heirloom Quilt', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['patch', 'stitch'],
    text: 'Once a turn, a breaking [Patch] moves to a different unpatched Trick with 1 [Stitch] instead of being lost.',
    flavor: 'Made of every coat the family ever wore out.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/heirloom-quilt', 1, (x) => { U.mm(x).heirloom = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/ship-of-mopsy', name: 'Ship of Mopsy', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['tear', 'vanish'],
    exhaust: true,
    text: 'The first Trick you [Tear] each turn leaves a temporary free copy in your hand. It [Vanish]es.',
    flavor: 'Is it the same rabbit? She has stopped worrying about it.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/ship-of-mopsy', 1, (x) => { U.mm(x).shipOfMopsy = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/heart-on-her-sleeve', name: 'Heart on Her Sleeve', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['stuffing', 'reinforce'],
    text: 'The first time each enemy turn you actually lose Courage, gain {n} [Stuffing] and [Reinforce] every [Patch] in hand.',
    flavor: 'Stitched on the outside where everyone can see it.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'mopsy/heart-on-her-sleeve', N(c).n, (x) => { U.mm(x).heartOnSleeve = true; })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/stuffing-economy', name: 'Stuffing Economy', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['plump', 'hollow', 'stitch'],
    text: '[Plump]: your first [Patch] trigger each turn keeps its [Stitch]. [Hollow]: your first [Tear] or [Mend] Skill costs 1 less.',
    flavor: 'Waste not. Especially not yourself.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/stuffing-economy', 1, (x) => { U.mm(x).economyPlump = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/the-whole-pattern', name: 'The Whole Pattern', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['patch'],
    text: 'At the end of your turn, with {n} differently worded [Patch]es attached, gain 1 Nerve and 1 card next turn.',
    flavor: 'Step back far enough and it is a picture.',
    nums: { n: 3 },
    effect: eff((c) => power(c, 'mopsy/the-whole-pattern', 1, (x) => { U.mm(x).wholePattern = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'mopsy/threadbare-and-thriving', name: 'Threadbare and Thriving', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['hollow', 'patch', 'stitch'],
    text: 'While [Hollow], the first patched Trick you play each turn triggers one [Patch] an extra time.',
    flavor: 'You can see daylight through her and she has never been better.',
    nums: {},
    effect: eff((c) => power(c, 'mopsy/threadbare-and-thriving', 1, (x) => { U.mm(x).threadbare = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mopsy/held-together-by-love', name: 'Held Together by Love', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['tear', 'patch', 'stuffing'],
    text: 'Once per combat, lethal damage leaves you at 1 Courage. [Tear] your hand, cash every [Patch] for [Stuffing], draw {c1} next turn.',
    flavor: 'That is genuinely all that is holding her together.',
    nums: { c1: 2 },
    effect: eff((c) => power(c, 'mopsy/held-together-by-love', 1, (x) => { U.mm(x).heldTogether = N(x).c1; })),
    upgrade: { nums: { c1: 3 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'mopsy/hand-me-down', name: 'Hand Me Down', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patch', 'reinforce'],
    text: 'Move a [Patch] from one of your Tricks onto a Trick in a friend’s hand, keeping its [Stitch]es, then [Reinforce] it by {n}.',
    flavor: 'It was always going to end up theirs.',
    nums: { n: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      const src = patchedInHand(c)[0];
      if (!ally || !src) return;
      const list = patchesOn(src).slice();
      const moved = list.shift();
      setPatches(src, list);
      const theirs = c.allyCards(ally, 'hand').filter(patchable);
      if (!theirs.length) return;
      const k = theirs[0];
      setPatches(k, patchesOn(k).concat([{ ...moved, stitches: Math.min(MAX_STITCHES, moved.stitches + N(c).n) }]));
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/stuffing-between-us', name: 'Stuffing Between Us', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['stuffing', 'cushion'],
    text: 'Spend {n} [Stuffing]. The next Attack that would cost a chosen friend Courage costs them half, rounded up.',
    flavor: 'Here. Take some of mine.',
    nums: { n: 1, m: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally || spendStuffing(c, N(c).n) < N(c).n) return;
      c.giveStatus(ally, 'cushion-free', N(c).m);
      c.giveStatus(ally, 'cushion', 1);
    }),
    upgrade: { nums: { n: 1, m: 2 } },
  },
  {
    id: 'mopsy/quilting-bee', name: 'Quilting Bee', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['patch', 'stitch'],
    text: '[Patch] one Trick in every Kid’s hand: "When played, gain 4 Guard." {n} [Stitch].',
    flavor: 'Everybody round the table, everybody sewing.',
    nums: { n: 1 },
    effect: eff((c) => {
      const mine = U.cardsIn(c, 'hand').filter(patchable)[0];
      if (mine) patch(c, mine, 'guard', N(c).n);
      for (const mate of c.teammates()) {
        const theirs = c.allyCards(mate, 'hand').filter(patchable);
        if (theirs.length) setPatches(theirs[0], patchesOn(theirs[0]).concat([{ id: 'guard', stitches: N(c).n }]));
      }
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'mopsy/family-quilt', name: 'Family Quilt', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['patch', 'stuffing'],
    text: 'Once a round per Kid, when they play a Trick you [Patch]ed, they draw {c1} and you gain {n} [Stuffing].',
    flavor: 'One square each, and it covers all of them.',
    nums: { c1: 1, n: 1 },
    effect: eff((c) => power(c, 'mopsy/family-quilt', 1, (x) => { U.mm(x).familyQuilt = { draw: N(x).c1, stuff: N(x).n }; })),
    upgrade: { nums: { c1: 1, n: 2 } },
  },
  {
    id: 'mopsy/bunny-pile', name: 'Bunny Pile', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['stuffing', 'cushion'],
    text: 'Spend up to {n} [Stuffing]. For each, a different Kid halves the next Attack that would cost them Courage.',
    flavor: 'Everyone in one heap, which is both a defence and the point.',
    nums: { n: 3 },
    effect: eff((c) => {
      const party = [c.self].concat(c.teammates());
      const spend = Math.min(N(c).n, stuffing(c), party.length);
      if (spendStuffing(c, spend) < spend) return;
      for (let i = 0; i < spend; i++) {
        const who = party[i];
        if (who === c.self) U.applySelf(c, 'cushion-free', 1);
        else { c.giveStatus(who, 'cushion', 1); c.giveStatus(who, 'cushion-free', 1); }
      }
    }),
    upgrade: { nums: { n: 4 } },
  },
];

export default {
  slug: SLUG,
  name: 'Mopsy',
  title: 'the Rag Doll Bunny',
  region: 'nursery',
  identity:
    'Mopsy rebuilds her own deck while the fight is happening. She sews Patches onto individual ' +
    'Tricks that change what those Tricks do for the rest of the combat, tears Tricks out to a fifth ' +
    'pile and mends them back when she wants them, and spends Stuffing that is simultaneously her ' +
    'crafting material and her armour. At low mastery she patches whatever is in hand. At high ' +
    'mastery she builds one or two extraordinary Tricks, tears them to safety, mends them back on the ' +
    'turn they matter, and moves deliberately between Plump and Hollow because both ends of that ' +
    'track pay her differently.',
  strengths: [
    'Enormous long-combat scaling — individual Tricks get better as the fight goes on',
    'Unusual control over what is actually in her deck, through Tear and Mend',
    'Adapts to whatever an expedition gives her, because Patches upgrade ordinary Tricks',
    'Cushion protects against single big hits without a deck full of Guard',
    'Her engines cross archetypes naturally: Tear makes Stuffing, Stuffing makes Patches, Patches make reasons to Mend',
  ],
  weaknesses: [
    'She needs setup, and a Patch on a Trick she never draws again was wasted',
    'Patches deteriorate, so every trigger is a decision about whether to Reinforce',
    'Tearing too much leaves her with a small, lopsided deck',
    'Spending Stuffing offensively is spending her armour',
    'Cushion is poor against many small hits and useless while Hollow',
    'Staying safely Plump wastes the generation the Hollow half of her kit is built on',
    'A deck built around one incredible Trick suffers badly when it is buried',
  ],
  startingHp: 72,
  startingEnergy: 3,
  mechanics: {
    stuffing: { name: 'Stuffing', kind: 'resource', desc: 'Starts at 3, caps at 6. Crafting material and armour at once. Plump at 5 or 6, Hollow at 0.', min: 0, max: 6, hooks: [] },
    cushion: { name: 'Cushion', kind: 'system', desc: 'Once each enemy turn, spend 1 Stuffing to halve a Courage loss after Guard, rounding up. Unavailable while Hollow.', min: 0, max: 1, hooks: ['onCourageLoss'] },
    patch: { name: 'Patches', kind: 'system', desc: 'A modification sewn onto one Trick, adding a line of rules text. It rides with the Trick between every pile and is gone when combat ends.', min: 0, max: 4, hooks: ['patchApplied', 'patchBroke'] },
    stitch: { name: 'Stitches', kind: 'system', desc: 'What holds a Patch on. Two to begin with, one spent per trigger, four at most, and the Patch falls off at zero.', min: 0, max: 4, hooks: [] },
    tear: { name: 'Tear and Mend', kind: 'system', desc: 'Tear moves a Trick to the Torn pile for the rest of combat, keeping its Patches; Mend brings it back. The same Trick cannot be Mended twice in a turn.', min: 0, max: 99, hooks: ['tore', 'mended'] },
    scrap: { name: 'Scrap', kind: 'system', desc: 'A temporary 0-Nerve Trick: 1 Stuffing, or Reinforce a Patch in hand. Vanishes.', min: 0, max: 99, hooks: [] },
  },
  startingDeck: [
    'mopsy/sock-kick', 'mopsy/sock-kick', 'mopsy/sock-kick',
    'mopsy/folded-arms', 'mopsy/folded-arms', 'mopsy/folded-arms',
    'mopsy/beginners-patch', 'mopsy/loose-stuffing', 'mopsy/snip-and-save', 'mopsy/little-repair',
  ],
  cards: [...basics, SCRAP, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Patchwork Toolbox', desc: 'Modify many different Tricks with many different Patches, turning an ordinary deck into a collection of specialised tools.', coreCards: ['mopsy/quick-patch', 'mopsy/pocket-patch', 'mopsy/quilted-lining', 'mopsy/weighted-hem', 'mopsy/pattern-book', 'mopsy/button-box', 'mopsy/the-whole-pattern', 'mopsy/patchwork-pummel'] },
    { name: 'Masterpiece', desc: 'Rather than patching everything, build one or two extraordinary Tricks with several slots. Retain them, Reinforce them, Tear them for safekeeping, Mend them back.', coreCards: ['mopsy/room-for-one-more', 'mopsy/master-seamstress', 'mopsy/double-stitch', 'mopsy/secret-pocket', 'mopsy/keep-the-good-bits', 'mopsy/safety-pins', 'mopsy/pattern-match'] },
    { name: 'Tear and Mend', desc: 'Use the Torn pile as a second deck. Strip out Basics and situational Tricks, then recover exactly the one you need.', coreCards: ['mopsy/snip-snip', 'mopsy/ripcord', 'mopsy/find-that-piece', 'mopsy/mend-with-love', 'mopsy/perfect-repair', 'mopsy/ship-of-mopsy', 'mopsy/seam-reaper', 'mopsy/emergency-transplant'] },
    { name: 'Stuffing Oscillation', desc: 'Move deliberately between Plump and Hollow rather than maximising either. Both ends of the track pay, and the middle pays least.', coreCards: ['mopsy/inside-out', 'mopsy/turn-me-inside-out', 'mopsy/stuffing-exchange', 'mopsy/hollow-heel-kick', 'mopsy/stuffed-to-bursting', 'mopsy/threadbare-and-thriving', 'mopsy/stuffing-economy'] },
    { name: 'Rag Doll Endurance', desc: 'Cushion, controlled Courage loss and efficient reconstruction. Not a Guard-stacking deck — a deck about deciding which damage is worth absorbing.', coreCards: ['mopsy/cushion-check', 'mopsy/cushion-fort', 'mopsy/full-restuffing', 'mopsy/emergency-sewing', 'mopsy/heart-on-her-sleeve', 'mopsy/held-together-by-love', 'mopsy/quilted-lining'] },
  ],
};
