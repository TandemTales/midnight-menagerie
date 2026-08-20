/**
 * Wink, the Eyeball Spider.  OWNER: companion-cards.
 * Spec: docs/design/companions/13-wink.md
 *
 * Preview · Intent Families · Reads / Blind Reads · Open Eyes / Full Gaze ·
 * Web · Intent reordering / Anchored · Set Tricks
 *
 * The enemy action queue lives in the combat engine.  Everything here goes
 * through the thin wrappers below, which call the engine when it offers the API
 * and degrade to Wink's own bookkeeping when it does not.  See the report for
 * the exact list combat-engine and enemies need to expose.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE, RANDOM_ENEMY } = Target;
const SLUG = 'wink';
const N = U.N;
const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ── Intent Families ─────────────────────────────────────────────────────────
export const FAMILY = { ATTACK: 'Attack', DEFENSE: 'Defense', SCHEME: 'Scheme', SPECIAL: 'Special' };
const FAMILIES = [FAMILY.ATTACK, FAMILY.DEFENSE, FAMILY.SCHEME, FAMILY.SPECIAL];
const ATTACK_INTENTS = new Set(['attack', 'attackBig', 'attackDefend', 'attackBuff', 'attackDebuff']);
const DEFENSE_INTENTS = new Set(['defend', 'defendBuff']);
/** The Intent Family of an enemy's current action. */
function currentFamily(c, e) {
  if (!e) return null;
  if (c.intentFamily) return c.intentFamily(e, 0);
  const i = e.intent;
  if (ATTACK_INTENTS.has(i)) return FAMILY.ATTACK;
  if (DEFENSE_INTENTS.has(i)) return FAMILY.DEFENSE;
  if (i === 'buff' || i === 'debuff' || i === 'strongDebuff' || i === 'attackDebuff') return FAMILY.SCHEME;
  return FAMILY.SPECIAL;
}
const intendsAttack = (c, e) => currentFamily(c, e) === FAMILY.ATTACK;
const anyAttacker = (c) => U.enemies(c).some(e => intendsAttack(c, e));

// ── Preview ─────────────────────────────────────────────────────────────────
const eid = (e) => (e && (e.id ?? e.uid)) || 'unknown';
const previewDepth = (c, e) => (c.previewDepth ? c.previewDepth(e) : (U.mm(c).previewed[eid(e)] || 0));
/** Reveal up to n further future Intents. Returns how many were newly revealed. */
function preview(c, e, n = 1) {
  if (!e) return 0;
  const before = previewDepth(c, e);
  const room = Math.max(0, 3 - before);
  const got = Math.min(n, room);
  if (!got) return 0;
  if (c.previewIntent) c.previewIntent(e, got);
  U.mm(c).previewed[eid(e)] = before + got;
  U.bump(c, 'revealed', got);
  U.fire(c, 'preview', { enemy: e, n: got });
  return got;
}
function previewAll(c, n = 1) { let t = 0; for (const e of U.enemies(c)) t += preview(c, e, n); return t; }
/** The families of an enemy's revealed future positions. */
function futureFamilies(c, e) {
  if (c.previewedFamilies) return c.previewedFamilies(e) || [];
  const d = previewDepth(c, e);
  const q = (c.intentQueue && c.intentQueue(e)) || [];
  return q.slice(1, 1 + d).map(x => (typeof x === 'string' ? x : x && x.family)).filter(Boolean);
}

// ── Reads ───────────────────────────────────────────────────────────────────
const reads = (c) => U.mm(c).reads;
const readsOn = (c, e) => reads(c).filter(r => r.enemyId === eid(e) && !r.resolved);
/** Place a Read on the enemy's next unread future position. */
function placeRead(c, e, family, pos) {
  if (!e) return null;
  const p = pos != null ? pos : (readsOn(c, e).length + 1);
  const fam = family || FAMILIES[U.rint(c, FAMILIES.length)];
  const blind = previewDepth(c, e) < p;
  const r = { enemyId: eid(e), pos: p, family: fam, blind, resolved: false, families: [fam] };
  reads(c).push(r);
  if (c.placeRead) c.placeRead(e, p, fam, { blind });
  U.fire(c, 'readPlaced', { read: r, enemy: e });
  return r;
}
/** Resolve a Read. Correct: Open 1 Eye. Wrong: Close 1 Eye. */
function resolveRead(c, r, actualFamily, enemy) {
  if (!r || r.resolved) return;
  r.resolved = true;
  const ok = r.forceSuccess || r.families.includes(actualFamily);
  if (r.forceFail) { readFail(c, r, enemy); return; }
  if (ok) {
    U.bump(c, 'readSuccess');
    if (!r.silent) openEye(c, 1);
    if (r.blind && U.stacks(c, c.self, 'wink/house-odds') > 0) openEye(c, U.stacks(c, c.self, 'wink/house-odds'));
    if (r.bonusEyes) openEye(c, r.bonusEyes);
    U.fire(c, 'readSuccess', { read: r, enemy });
  } else readFail(c, r, enemy);
}
function readFail(c, r, enemy) {
  U.bump(c, 'readFail');
  if (r.blind && U.stacks(c, c.self, 'wink/house-odds') > 0) web(c, enemy, 3);
  if (!r.silent) closeEye(c, 1 + (r.penaltyEyes || 0));
  U.fire(c, 'readFail', { read: r, enemy });
}

// ── Open Eyes ───────────────────────────────────────────────────────────────
const EYES = 'open-eyes';
const eyes = (c) => U.res(c, EYES);
const fullGaze = (c) => eyes(c) >= 8;
function openEye(c, n) { const d = U.addRes(c, EYES, n, 0, 8); if (d) U.fire(c, 'eyesOpened', { n: d }); return d; }
function closeEye(c, n) {
  const take = Math.min(n, eyes(c));
  if (take <= 0) return 0;
  U.addRes(c, EYES, -take, 0, 8);
  if (U.once(c, 'eyesClosed')) U.fire(c, 'eyesClosed', { n: take });
  return take;
}

// ── Web ─────────────────────────────────────────────────────────────────────
const WEB = 'web';
const webOn = (c, e) => U.stacks(c, e, WEB);
const web = (c, e, n) => U.apply(c, e, WEB, n);
/** Spend Web from an enemy. Honours All Eyes Open and Master of the Web. */
function spendWeb(c, e, n) {
  let need = n;
  if (U.stacks(c, c.self, 'web-discount') > 0 && U.once(c, 'webDiscount')) need = Math.max(1, need - U.stacks(c, c.self, 'web-discount'));
  if (webOn(c, e) < need) return false;
  if (U.stacks(c, c.self, 'free-web') > 0 && U.once(c, 'freeWeb')) return true;
  U.unapply(c, e, WEB, need);
  return true;
}

// ── Intent reordering ───────────────────────────────────────────────────────
const anchored = (c, e, pos) => (c.isAnchored ? !!c.isAnchored(e, pos) : false);
function swapIntents(c, e, a, b) {
  if (!e || anchored(c, e, a) || anchored(c, e, b)) return false;
  c.swapIntents?.(e, a, b);
  U.bump(c, 'reordered');
  U.fire(c, 'reorder', { enemy: e });
  return true;
}
function postpone(c, e) {
  if (!e || anchored(c, e, 0)) return false;
  c.postponeIntent?.(e);
  U.bump(c, 'reordered');
  U.fire(c, 'reorder', { enemy: e });
  return true;
}
function deleteIntent(c, e) {
  if (!e || anchored(c, e, 0)) return false;
  c.deleteIntent?.(e);
  U.bump(c, 'reordered');
  U.fire(c, 'reorder', { enemy: e });
  return true;
}

// ── Set Tricks ──────────────────────────────────────────────────────────────
const setSlots = (c) => U.mm(c).setCap;
const activeSets = (c) => U.mm(c).sets;
const setRoom = (c) => activeSets(c).length < setSlots(c);
/**
 * Place the resolving Trick as a Set. `trigger(ctx, ev)` returns true when it fires.
 */
function placeSet(c, trigger, fire, opts = {}) {
  if (!setRoom(c)) return false;
  activeSets(c).push({ card: c.card, enemyId: opts.enemy ? eid(opts.enemy) : null, global: !!opts.global, trigger, fire, vanish: !!opts.vanish });
  U.moveCard(c, c.card, 'limbo', { set: true });
  U.fire(c, 'setPlaced', {});
  return true;
}
/** Run every active Set against an engine event. */
function checkSets(c, ev) {
  const list = activeSets(c);
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    let hit = false;
    try { hit = s.trigger(c, ev); } catch (_) { hit = false; }
    if (!hit) continue;
    list.splice(i, 1);
    try { s.fire(c, ev); } catch (_) {}
    U.bump(c, 'setTriggered');
    U.fire(c, 'setTriggered', { set: s });
    if (s.vanish) c.exhaust?.(s.card); else U.moveCard(c, s.card, 'discard');
  }
}
function power(c, id, n, install) {
  U.applySelf(c, id, n);
  const s = U.mm(c);
  if (install && !s['pw:' + id]) { s['pw:' + id] = true; install(c); }
}

// ── per-combat bookkeeping ──────────────────────────────────────────────────
U.onTracker(SLUG, (e, s) => {
  U.defineCounters(e, [
    { id: 'open-eyes', name: 'Open Eyes', icon: 'open-eyes', desc: 'Wink has eight eyes and begins combat with 3 Open. Full Gaze at 8. Eyes persist between turns.', min: 0, max: 8, start: 3 },
  ]);
  const fake = () => U.trackerCtx(e);
  // an Intent becoming current resolves the Read on that position and fires Sets
  e.on('intent', (ev) => {
    const c = fake();
    const en = ev && ev.enemy;
    const fam = ev && (ev.family || currentFamily(c, en));
    if (en) {
      const rs = s.reads.filter(r => r.enemyId === eid(en) && !r.resolved && r.pos === 1);
      for (const r of rs) resolveRead(c, r, fam, en);
      for (const r of s.reads) if (r.enemyId === eid(en) && !r.resolved) r.pos = Math.max(1, r.pos - 1);
      s.previewed[eid(en)] = Math.max(0, (s.previewed[eid(en)] || 0) - 1);
    }
    checkSets(c, { type: 'intent', enemy: en, family: fam });
  });
  e.on('damage', (ev) => checkSets(fake(), { type: 'damage', ...ev }));
  e.on('death', (ev) => {
    // a Set whose enemy dies returns to the discard pile without triggering
    const c = fake();
    const dead = ev && ev.enemy ? eid(ev.enemy) : null;
    for (let i = s.sets.length - 1; i >= 0; i--) if (s.sets[i].enemyId && s.sets[i].enemyId === dead) { U.moveCard(c, s.sets[i].card, 'discard'); s.sets.splice(i, 1); }
  });
  e.on('turn:start', () => { s.played = 0; });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('readSuccess', 'wink/telltale-twitch', (c, p) => { if (U.once(c, 'telltale')) web(c, p.enemy, 2 * U.stacks(c, c.self, 'wink/telltale-twitch')); });
U.onHook('readSuccess', 'wink/pattern-library', (c) => { if (U.once(c, 'patternLibrary')) U.draw(c, U.stacks(c, c.self, 'wink/pattern-library')); });
U.onHook('preview', 'wink/house-pattern', (c, p) => { if (U.once(c, 'housePattern')) openEye(c, U.stacks(c, c.self, 'wink/house-pattern')); });
U.onHook('reorder', 'wink/loom-logic', (c, p) => {
  const n = 2 * U.stacks(c, c.self, 'wink/loom-logic');
  const o = U.enemies(c).filter(x => x !== p.enemy);
  if (o.length) for (const x of o) web(c, x, n); else web(c, p.enemy, 1);
});
U.onHook('eyesClosed', 'wink/reflexive-blink', (c) => { const n = U.stacks(c, c.self, 'wink/reflexive-blink'); U.atTurnEnd(c, (x) => openEye(x, n)); });
U.onHook('setTriggered', 'wink/extra-corner', (c, p) => { if (U.once(c, 'extraCorner')) { const en = U.enemies(c).find(x => eid(x) === p.set.enemyId); if (en) web(c, en, 1); } });
U.onHook('setTriggered', 'wink/patient-hunter', (c, p) => {
  if (!U.once(c, 'patientHunter')) return;
  const k = p.set.card;
  U.nextTurn(c, (x) => { U.toHand(x, k); U.costSet(x, k, 0, 'turn'); });
});
U.onHook('readSuccess', 'wink/every-angle-covered', (c, p) => {
  const key = 'eac:' + p.read.enemyId;
  if (!U.once(c, key)) return;
  const en = U.enemies(c).find(x => eid(x) === p.read.enemyId);
  if (en) placeRead(c, en, p.read.family, p.read.pos + 1);
});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'wink/little-nibble', name: 'Little Nibble', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'Eight eyes, one very small mouth.',
    nums: { d: 6 }, effect: eff(c => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'wink/silk-screen', name: 'Silk Screen', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['web'],
    text: 'Gain {b} Guard. If an enemy currently intends to Attack, apply {n} [Web] to it.',
    flavor: 'A curtain of thread across the doorway, just in case.',
    nums: { b: 5, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); const e = U.enemies(c).find(x => intendsAttack(c, x)); if (e) web(c, e, N(c).n); }),
    upgrade: { nums: { b: 8, n: 1 } },
  },
  {
    id: 'wink/peek-around-the-corner', name: 'Peek Around the Corner', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['preview', 'eye'],
    text: '[Preview] {n}. If a new Intent is revealed, Open {m0} [Eye].',
    flavor: 'One eye is already round the corner. The rest follow.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { if (preview(c, c.target, N(c).n)) openEye(c, N(c).m0); }),
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'wink/call-it', name: 'Call It', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['read', 'intent-family'],
    text: 'Place a [Read] on the target’s next [Intent Family].',
    flavor: 'Said out loud, in advance, in front of everybody.',
    nums: {},
    effect: eff(async c => { const [f] = await U.chooseOne(c, FAMILIES.map(fam => ({ label: fam, fn: (x) => placeRead(x, x.target, fam) }))); return f; }),
    upgrade: { cost: 0 },
  },
  {
    id: 'wink/loose-thread', name: 'Loose Thread', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['web', 'preview'],
    text: 'Apply {n} [Web]. Apply {m0} more if the target has a [Preview]ed Intent.',
    flavor: 'It goes somewhere. Everything in this house goes somewhere.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => web(c, c.target, N(c).n + (previewDepth(c, c.target) > 0 ? N(c).m0 : 0))),
    upgrade: { nums: { n: 3, m0: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'wink/nibble-then-stare', name: 'Nibble, Then Stare', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['web'],
    text: 'Deal {d} damage. If the target currently intends to Attack, apply {n} [Web].',
    flavor: 'The staring is the part it remembers.',
    nums: { d: 6, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (intendsAttack(c, c.target)) web(c, c.target, N(c).n); }),
    upgrade: { nums: { d: 9, n: 1 } },
  },
  {
    id: 'wink/sticky-situation', name: 'Sticky Situation', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['preview', 'web'],
    text: 'Deal {d} damage. If the target has a [Preview]ed future Intent, apply {n} [Web]. Otherwise Preview {m0}.',
    flavor: 'Knowing and sticking are the same verb here.',
    nums: { d: 6, n: 3, m0: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (previewDepth(c, c.target) > 0) web(c, c.target, N(c).n); else preview(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 9, n: 4, m0: 1 } },
  },
  {
    id: 'wink/skitter-skitter-bite', name: 'Skitter, Skitter, Bite', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, keywords: ['read'],
    text: 'Deal {d} damage. If a [Read] succeeded this turn, gain {b} Guard. Once each turn.',
    flavor: 'Two false starts and then, abruptly, teeth.',
    nums: { d: 5, b: 5 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.got(c, 'readSuccess') > 0) U.guard(c, N(c).b); }),
    playable: (c) => !U.mm(c).once['skitter'],
    upgrade: { nums: { d: 7, b: 7 } },
  },
  {
    id: 'wink/future-tense', name: 'Future Tense', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['preview'],
    text: 'If the target has a [Preview]ed future Intent, deal {d} damage. Otherwise deal {m0} damage and Preview {n}.',
    flavor: 'It is going to have done something. She has already seen it.',
    nums: { d: 11, m0: 6, n: 1 },
    effect: eff(c => { if (previewDepth(c, c.target) > 0) U.hit(c, N(c).d); else { U.hit(c, N(c).m0); preview(c, c.target, N(c).n); } }),
    upgrade: { nums: { d: 14, m0: 8, n: 1 } },
  },
  {
    id: 'wink/look-over-there', name: 'Look Over There', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['preview'],
    text: 'Deal {d} damage to one enemy, then [Preview] {n} on another enemy. If it is alone, Preview the same one.',
    flavor: 'She can look in two directions. She always could.',
    nums: { d: 7, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); const o = U.others(c); preview(c, o.length ? o[0] : c.target, N(c).n); }),
    upgrade: { nums: { d: 10, n: 1 } },
  },
  {
    id: 'wink/threadbare-pounce', name: 'Threadbare Pounce', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['web'],
    text: 'Deal {d} damage. You may remove {n} [Web] from the target to reduce this Trick’s cost to {m0} for this play.',
    flavor: 'She spends the web to save the effort.',
    nums: { d: 16, n: 3, m0: 1 },
    effect: eff(c => { spendWeb(c, c.target, N(c).n); U.hit(c, N(c).d); }),
    dynamicCost: (c) => (U.stacks(c, c.target, WEB) >= 3 ? 1 : 2),
    upgrade: { nums: { d: 21, n: 3, m0: 1 } },
  },
  {
    id: 'wink/seen-it-before', name: 'Seen It Before', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['intent-family', 'web'],
    text: 'Deal {d} damage. If the target’s current [Intent Family] matches the one it used last time, apply {n} [Web].',
    flavor: 'The house repeats itself. So does everything in it.',
    nums: { d: 8, n: 3 },
    effect: eff(c => { U.hit(c, N(c).d); const t = c.target; const prev = t && t.lastFamily; if (prev && prev === currentFamily(c, t)) web(c, t, N(c).n); }),
    upgrade: { nums: { d: 11, n: 4 } },
  },
  {
    id: 'wink/read-the-room', name: 'Read the Room', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: NONE, keywords: ['preview'],
    text: '[Preview] {n} on every living enemy.',
    flavor: 'Eight eyes, eight jobs.',
    nums: { n: 1 }, effect: eff(c => previewAll(c, N(c).n)), upgrade: { nums: { n: 2 } },
  },
  {
    id: 'wink/make-a-guess', name: 'Make a Guess', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['read', 'blind-read'],
    text: 'Place a [Read]. If it is a [Blind Read], gain {b} Guard immediately.',
    flavor: 'She does not know. She is going to be right anyway.',
    nums: { b: 6 },
    effect: eff(async c => { const r = placeRead(c, c.target, FAMILIES[U.rint(c, 4)]); if (r && r.blind) U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'wink/safe-distance', name: 'Safe Distance', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF,
    text: 'Gain {b} Guard. Gain {m0} more if at least one enemy currently intends to Attack.',
    flavor: 'The correct distance is "the other side of the room".',
    nums: { b: 7, m0: 5 },
    effect: eff(c => U.guard(c, N(c).b + (anyAttacker(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 9, m0: 7 } },
  },
  {
    id: 'wink/wide-eyes', name: 'Wide Eyes', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['eye', 'preview'],
    text: 'Open {n} [Eye]. If the target has no [Preview]ed future Intent, Preview {m0}.',
    flavor: 'All of them. At once. It is a lot.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { openEye(c, N(c).n); if (previewDepth(c, c.target) === 0) preview(c, c.target, N(c).m0); }),
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'wink/blink', name: 'Blink', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['eye'],
    text: 'Close {n} [Eye] to gain {b} Guard.',
    flavor: 'Seven eyes is still more than most things have.',
    nums: { n: 1, b: 9 },
    effect: eff(c => { if (closeEye(c, N(c).n)) U.guard(c, N(c).b); }),
    playable: (c) => eyes(c) >= 1,
    upgrade: { nums: { n: 1, b: 13 } },
  },
  {
    id: 'wink/tighten-the-silk', name: 'Tighten the Silk', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['web', 'preview'],
    text: 'Apply {n} [Web], then [Preview] {m0} on the target.',
    flavor: 'Every strand pulled a little further in, until she can feel what it means to do next.',
    nums: { n: 3, m0: 1 },
    effect: eff(c => { web(c, c.target, N(c).n); preview(c, c.target, N(c).m0); }),
    upgrade: { nums: { n: 4, m0: 1 } },
  },
  {
    id: 'wink/web-patch', name: 'Web Patch', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['web'],
    text: 'Gain {b} Guard. Apply {n} [Web] to every enemy.',
    flavor: 'She patches the whole corner at once and everybody gets some.',
    nums: { b: 8, n: 1 },
    effect: eff(c => { U.guard(c, N(c).b); for (const e of U.enemies(c)) web(c, e, N(c).n); }),
    upgrade: { nums: { b: 11, n: 2 } },
  },
  {
    id: 'wink/back-up-a-little', name: 'Back Up a Little', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['preview', 'web'],
    text: '[Preview] {m0}. If the target currently intends to Attack, apply {n} [Web]. Otherwise gain {b} Guard.',
    flavor: 'Four steps up the wall, entirely without hurrying.',
    nums: { m0: 1, n: 3, b: 8 },
    effect: eff(c => { preview(c, c.target, N(c).m0); if (intendsAttack(c, c.target)) web(c, c.target, N(c).n); else U.guard(c, N(c).b); }),
    upgrade: { nums: { m0: 1, n: 4, b: 11 } },
  },
  {
    id: 'wink/tripline', name: 'Tripline', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['set', 'web'],
    text: '[Set] on an enemy. When its Intent becomes Attack, gain {b} Guard and apply {n} [Web] to it, then discard this Trick.',
    flavor: 'One thread, ankle height, entirely invisible.',
    nums: { b: 14, n: 2 },
    effect: eff(c => { const t = c.target, b = N(c).b, n = N(c).n; placeSet(c, (x, ev) => ev.type === 'intent' && ev.enemy === t && ev.family === FAMILY.ATTACK, (x) => { U.guard(x, b); web(x, t, n); }, { enemy: t }); }),
    upgrade: { nums: { b: 18, n: 3 } },
  },
  {
    id: 'wink/watch-this-one', name: 'Watch This One', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['set', 'read'],
    text: '[Set] on an enemy with an unresolved [Read]. When that Read resolves, draw {n} Trick, and {m0} more if it succeeded. Then discard this Trick.',
    flavor: 'That one. Definitely that one.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { const t = c.target, n = N(c).n, m = N(c).m0; placeSet(c, (x, ev) => ev.type === 'intent' && ev.enemy === t, (x, ev) => { U.draw(x, n); if (U.got(x, 'readSuccess') > 0) U.draw(x, m); }, { enemy: t }); }),
    playable: (c) => readsOn(c, c.target).length > 0,
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'wink/ceiling-survey', name: 'Ceiling Survey', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['preview', 'web'],
    text: '[Preview] {m0}. If the target has at least {n} [Web], Preview {m0} additional future Intent.',
    flavor: 'From up there the whole plan is a floor plan.',
    nums: { m0: 1, n: 3 },
    effect: eff(c => { preview(c, c.target, N(c).m0); if (webOn(c, c.target) >= N(c).n) preview(c, c.target, N(c).m0); }),
    upgrade: { nums: { m0: 1, n: 2 } },
  },
  {
    id: 'wink/telltale-twitch', name: 'Telltale Twitch', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['read', 'web'],
    text: 'The first successful [Read] each turn applies {n} [Web] to that enemy.',
    flavor: 'They always twitch first. Always.',
    nums: { n: 2 },
    effect: eff(c => power(c, 'wink/telltale-twitch', 1)),
    upgrade: { nums: { n: 4 } },
  },
  {
    id: 'wink/house-pattern', name: 'House Pattern', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['preview', 'intent-family', 'eye'],
    text: 'The first time each turn you [Preview] an Intent whose [Intent Family] differs from that enemy’s current one, Open {n} [Eye].',
    flavor: 'The house has a rhythm. Deviations are interesting.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'wink/house-pattern', 1)),
    upgrade: { nums: { n: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks (11) ──────────────────────────────────────────────────────────
  {
    id: 'wink/cross-examination', name: 'Cross Examination', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['read', 'preview', 'web'],
    text: 'Deal {d} damage. If the target has an unresolved [Read], [Preview] {m0} additional future Intent and apply {n} [Web].',
    flavor: 'And where exactly were you planning to be next turn?',
    nums: { d: 8, n: 1, m0: 1 },
    effect: eff(c => { U.hit(c, N(c).d); if (readsOn(c, c.target).length) { preview(c, c.target, N(c).m0); web(c, c.target, N(c).n); } }),
    upgrade: { nums: { d: 11, n: 2, m0: 1 } },
  },
  {
    id: 'wink/pulling-strings', name: 'Pulling Strings', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['web', 'reorder', 'preview'],
    text: 'You may remove {n} [Web] to swap the target’s current Intent with its first [Preview]ed movable one. Deal {d} damage, or {m0} if you performed the swap.',
    flavor: 'Not that one. That one.',
    nums: { d: 13, m0: 20, n: 3 },
    effect: eff(c => { const ok = spendWeb(c, c.target, N(c).n) && swapIntents(c, c.target, 0, 1); U.hit(c, ok ? N(c).m0 : N(c).d); }),
    upgrade: { nums: { d: 17, m0: 25, n: 3 } },
  },
  {
    id: 'wink/corner-to-corner', name: 'Corner to Corner', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['preview', 'web'],
    text: 'Deal {d} damage to all enemies. [Preview] {n} on each enemy that already has [Web].',
    flavor: 'One line of silk, all the way across the room.',
    nums: { d: 6, n: 1 },
    effect: eff(c => { U.hitAll(c, N(c).d); for (const e of U.enemies(c)) if (webOn(c, e) > 0) preview(c, e, N(c).n); }),
    upgrade: { nums: { d: 9, n: 1 } },
  },
  {
    id: 'wink/eight-eyes-one-target', name: 'Eight Eyes, One Target', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['full-gaze', 'eye'],
    text: 'Deal {d} damage. At [Full Gaze], Close {n} [Eye]s after the hit to deal {m0} again.',
    flavor: 'Every eye pointed at the same square inch.',
    nums: { d: 18, n: 2, m0: 12 },
    effect: eff(c => { U.hit(c, N(c).d); if (fullGaze(c) && closeEye(c, N(c).n)) U.hit(c, N(c).m0); }),
    upgrade: { nums: { d: 23, n: 2, m0: 15 } },
  },
  {
    id: 'wink/blindside-probability', name: 'Blindside Probability', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['blind-read'],
    text: 'Deal {d} damage. If the target has an unresolved [Blind Read], deal {m0} instead.',
    flavor: 'Not knowing is worth something, if you commit to it.',
    nums: { d: 8, m0: 18 },
    effect: eff(c => U.hit(c, readsOn(c, c.target).some(r => r.blind) ? N(c).m0 : N(c).d)),
    upgrade: { nums: { d: 11, m0: 23 } },
  },
  {
    id: 'wink/silk-saw', name: 'Silk Saw', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['web'],
    text: 'Deal {d} damage. You may remove up to {n} [Web] from the target. Deal one more hit for every {m0} Web removed, up to 4 hits in total.',
    flavor: 'Thread, drawn back and forth, until something gives.',
    nums: { d: 5, n: 6, m0: 2, hits: 3 },
    effect: eff(c => { const have = Math.min(N(c).n, webOn(c, c.target)); const use = have - (have % N(c).m0); if (use > 0) U.unapply(c, c.target, WEB, use); U.hitN(c, N(c).d, Math.min(4, 1 + Math.floor(use / N(c).m0))); }),
    upgrade: { nums: { d: 7, n: 6, m0: 2, hits: 3 } },
  },
  {
    id: 'wink/forecast-fang', name: 'Forecast Fang', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['preview'],
    text: 'Deal {d} damage, plus {m0} for each [Preview]ed future Intent on the target, up to {n} extra hits.',
    flavor: 'She bites the version of it she has already seen.',
    nums: { d: 8, m0: 5, n: 2 },
    effect: eff(c => { U.hit(c, N(c).d); U.hitN(c, N(c).m0, Math.min(N(c).n, previewDepth(c, c.target))); }),
    upgrade: { nums: { d: 11, m0: 6, n: 2 } },
  },
  {
    id: 'wink/wrong-answer', name: 'Wrong Answer', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['read', 'eye'],
    text: 'Deal {d} damage. If any [Read] failed this turn, deal {m0} instead and Open {n} [Eye] afterwards.',
    flavor: 'Being wrong is only expensive if you have nothing prepared for it.',
    nums: { d: 5, m0: 18, n: 1 },
    effect: eff(c => { const f = U.got(c, 'readFail') > 0; U.hit(c, f ? N(c).m0 : N(c).d); if (f) openEye(c, N(c).n); }),
    upgrade: { nums: { d: 8, m0: 23, n: 1 } },
  },
  {
    id: 'wink/gotcha', name: 'Gotcha!', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['read'],
    text: 'Playable only if a [Read] succeeded this turn. Deal {d} damage. Once each turn.',
    flavor: 'Said quietly. Said with enormous satisfaction.',
    nums: { d: 8 },
    effect: eff(c => U.hit(c, N(c).d)),
    playable: (c) => U.got(c, 'readSuccess') > 0,
    upgrade: { nums: { d: 11 } },
  },
  {
    id: 'wink/rehearsed-pounce', name: 'Rehearsed Pounce', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['set', 'read'],
    text: '[Set] on an enemy with an unresolved [Read]. When that Read resolves, deal {d} damage if it succeeded. If it failed, return this Trick to your hand at the start of your next turn instead.',
    flavor: 'She has practised this exact jump forty times.',
    nums: { d: 20 },
    effect: eff(c => {
      const t = c.target, d = N(c).d, card = c.card;
      placeSet(c, (x, ev) => ev.type === 'intent' && ev.enemy === t, (x) => {
        if (U.got(x, 'readSuccess') > 0) U.hitAt(x, t, d);
        else U.nextTurn(x, (y) => U.toHand(y, card));
      }, { enemy: t });
    }),
    playable: (c) => readsOn(c, c.target).length > 0,
    upgrade: { nums: { d: 26 } },
  },
  {
    id: 'wink/across-the-web', name: 'Across the Web', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['web'],
    text: 'Deal {d} damage to one enemy and {m0} to every other enemy with [Web]. Apply {n} Web to each enemy hit.',
    flavor: 'Everything connected to the web feels it.',
    nums: { d: 12, m0: 6, n: 1 },
    effect: eff(c => { U.hit(c, N(c).d); web(c, c.target, N(c).n); for (const e of U.others(c)) if (webOn(c, e) > 0) { U.hitAt(c, e, N(c).m0); web(c, e, N(c).n); } }),
    upgrade: { nums: { d: 16, m0: 8, n: 1 } },
  },

  // ── Skills (17) ───────────────────────────────────────────────────────────
  {
    id: 'wink/double-check', name: 'Double Check', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['preview', 'intent-family', 'eye'],
    text: '[Preview] {n}. If both newly revealed Intents share an [Intent Family], Open {m0} [Eye].',
    flavor: 'Twice, because the first time she was excited.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { const got = preview(c, c.target, N(c).n); if (got >= 2) { const f = futureFamilies(c, c.target).slice(-2); if (f.length === 2 && f[0] === f[1]) openEye(c, N(c).m0); } }),
    upgrade: { nums: { n: 2, m0: 2 } },
  },
  {
    id: 'wink/long-shot', name: 'Long Shot', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['blind-read', 'eye'],
    text: 'Playable only if the target’s next Intent is hidden. Place a [Blind Read]. Success Opens {n} additional [Eye]. Failure Closes {m0} additional Eye.',
    flavor: 'No information, maximum confidence.',
    nums: { n: 1, m0: 1 },
    effect: eff(c => { const r = placeRead(c, c.target, FAMILIES[U.rint(c, 4)]); if (r) { r.bonusEyes = N(c).n; r.penaltyEyes = N(c).m0; } }),
    playable: (c) => previewDepth(c, c.target) === 0,
    upgrade: { nums: { n: 2, m0: 1 } },
  },
  {
    id: 'wink/safe-bet', name: 'Safe Bet', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['read', 'intent-family', 'eye'],
    text: 'Place a [Read] naming {n} [Intent Family]s instead of one. It neither Opens nor Closes an [Eye], but still counts as a success or failure.',
    flavor: 'Hedged, and she is not embarrassed about it.',
    nums: { n: 2 },
    effect: eff(c => { const r = placeRead(c, c.target, FAMILIES[U.rint(c, 4)]); if (r) { r.silent = true; const extra = FAMILIES[U.rint(c, 4)]; if (!r.families.includes(extra)) r.families.push(extra); } }),
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'wink/thread-map', name: 'Thread Map', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['preview', 'web', 'intent-family'],
    text: '[Preview] {m1}. Apply {n} [Web] for each distinct [Intent Family] among the target’s current and Previewed Intents, up to {m0} Web.',
    flavor: 'A map of what it is about to be.',
    nums: { n: 1, m0: 4, m1: 1 },
    effect: eff(c => { preview(c, c.target, N(c).m1); const set = new Set([currentFamily(c, c.target), ...futureFamilies(c, c.target)].filter(Boolean)); web(c, c.target, Math.min(N(c).m0, set.size * N(c).n)); }),
    upgrade: { nums: { n: 2, m0: 4, m1: 1 } },
  },
  {
    id: 'wink/red-string-theory', name: 'Red String Theory', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['web', 'preview'],
    text: 'Apply {n} [Web] to every enemy with at least one [Preview]ed Intent. If only one enemy remains, apply {m0} to it instead.',
    flavor: 'Pins, string, and a genuinely correct conclusion.',
    nums: { n: 2, m0: 3 },
    effect: eff(c => { const es = U.enemies(c); if (es.length === 1) { web(c, es[0], N(c).m0); return; } for (const e of es) if (previewDepth(c, e) > 0) web(c, e, N(c).n); }),
    upgrade: { nums: { n: 3, m0: 5 } },
  },
  {
    id: 'wink/tug-the-thread', name: 'Tug the Thread', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['web', 'reorder', 'preview'],
    text: 'Remove {n} [Web] to swap the target’s current Intent with its first [Preview]ed movable one. If an Attack moved out of the current position, gain {b} Guard.',
    flavor: 'One tug and the whole schedule slides.',
    nums: { n: 3, b: 12 },
    effect: eff(c => { const wasAttack = intendsAttack(c, c.target); if (spendWeb(c, c.target, N(c).n) && swapIntents(c, c.target, 0, 1) && wasAttack) U.guard(c, N(c).b); }),
    upgrade: { cost: 1, nums: { n: 3, b: 12 } },
  },
  {
    id: 'wink/stall-the-bad-part', name: 'Stall the Bad Part', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['web', 'reorder', 'preview', 'read'],
    text: 'Remove {n} [Web] to swap the target’s first and second [Preview]ed movable Intents. [Read]s stay attached to their queue positions.',
    flavor: 'Later. Do that later.',
    nums: { n: 2 },
    effect: eff(c => { if (spendWeb(c, c.target, N(c).n)) swapIntents(c, c.target, 1, 2); }),
    upgrade: { nums: { n: 1 } },
  },
  {
    id: 'wink/cut-the-web', name: 'Cut the Web', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['web'],
    text: 'Remove up to {n} [Web] from one enemy. Gain {b} Guard for every {m0} removed.',
    flavor: 'Reclaimed, respooled, reused.',
    nums: { n: 6, b: 4, m0: 2 },
    effect: eff(c => { const take = Math.min(N(c).n, webOn(c, c.target)); if (take > 0) U.unapply(c, c.target, WEB, take); U.guard(c, Math.floor(take / N(c).m0) * N(c).b); }),
    upgrade: { nums: { n: 6, b: 6, m0: 2 } },
  },
  {
    id: 'wink/catch-and-release', name: 'Catch and Release', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['web', 'preview'],
    text: 'Move up to {n} [Web] from one enemy to another. If the receiving enemy has no [Preview]ed Intent, Preview {m0}.',
    flavor: 'Web is portable. Everything about Wink is portable.',
    nums: { n: 3, m0: 1 },
    effect: eff(c => { const o = U.others(c); const to = o.length ? o[0] : null; if (!to) return; const take = Math.min(N(c).n, webOn(c, c.target)); if (take) { U.unapply(c, c.target, WEB, take); web(c, to, take); } if (previewDepth(c, to) === 0) preview(c, to, N(c).m0); }),
    upgrade: { nums: { n: 5, m0: 1 } },
  },
  {
    id: 'wink/set-the-table', name: 'Set the Table', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['set'],
    text: 'The next [Set] Trick you play this turn costs {n}.',
    flavor: 'Everything laid out before anybody arrives.',
    nums: { n: 0 },
    effect: eff(c => U.bump(c, 'freeSet')),
    upgrade: { cost: 0, nums: { n: 0 } },
  },
  {
    id: 'wink/doorframe-tripline', name: 'Doorframe Tripline', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['set', 'web', 'eye'],
    text: '[Set] on an enemy. When its Intent becomes Defense, apply {n} [Web] and Open {m0} [Eye], then discard this Trick.',
    flavor: 'It will step back eventually. They always step back.',
    nums: { n: 4, m0: 1 },
    effect: eff(c => { const t = c.target, n = N(c).n, m = N(c).m0; placeSet(c, (x, ev) => ev.type === 'intent' && ev.enemy === t && ev.family === FAMILY.DEFENSE, (x) => { web(x, t, n); openEye(x, m); }, { enemy: t }); }),
    upgrade: { nums: { n: 6, m0: 2 } },
  },
  {
    id: 'wink/lampshade-lookout', name: 'Lampshade Lookout', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['set', 'preview'],
    text: '[Set] globally. The next time an enemy executes a Scheme or Special Intent, [Preview] {m0} on it and draw {n} additional Tricks at the start of your next turn. Then discard this Trick.',
    flavor: 'The best seat in the house is inside the lampshade.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => { const n = N(c).n, m = N(c).m0; placeSet(c, (x, ev) => ev.type === 'intent' && (ev.family === FAMILY.SCHEME || ev.family === FAMILY.SPECIAL), (x, ev) => { preview(x, ev.enemy, m); U.nextTurn(x, (y) => U.draw(y, n)); }, { global: true }); }),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'wink/false-floor', name: 'False Floor', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['set', 'reorder', 'preview'],
    text: '[Set] on an enemy. The next time you [Reorder] one of its Intents, deal {d} damage and [Preview] {n}, then discard this Trick.',
    flavor: 'The floorboard was never there.',
    nums: { d: 14, n: 1 },
    effect: eff(c => { const t = c.target, d = N(c).d, n = N(c).n; placeSet(c, (x) => U.got(x, 'reordered') > 0, (x) => { U.hitAt(x, t, d); preview(x, t, n); }, { enemy: t }); }),
    upgrade: { nums: { d: 19, n: 1 } },
  },
  {
    id: 'wink/thread-count', name: 'Thread Count', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: NONE, keywords: ['intent-family'],
    text: 'Draw one Trick for each distinct [Intent Family] among enemies’ current Intents, up to {n}.',
    flavor: 'Counting is most of what she does.',
    nums: { n: 3 },
    effect: eff(c => { const s = new Set(U.enemies(c).map(e => currentFamily(c, e)).filter(Boolean)); U.draw(c, Math.min(N(c).n, s.size)); }),
    upgrade: { cost: 0, nums: { n: 3 } },
  },
  {
    id: 'wink/blink-twice', name: 'Blink Twice', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: NONE, keywords: ['eye', 'set'],
    text: 'Close {n} [Eye]s. [Set] one Set Trick from your hand without paying its cost. It still needs an empty slot.',
    flavor: 'Two blinks is the signal. Nobody agreed to the signal.',
    nums: { n: 2 },
    effect: eff(async c => { if (!closeEye(c, N(c).n)) return; const [k] = await U.pickCards(c, { pile: 'hand', count: 1, prompt: 'Set a Trick for free', filter: (x) => ((x.def?.keywords) || []).includes('set') }); if (k) U.bump(c, 'freeSet'); }),
    playable: (c) => eyes(c) >= 2,
    upgrade: { nums: { n: 1 } },
  },
  {
    id: 'wink/eight-cornered-view', name: 'Eight Cornered View', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: NONE, keywords: ['preview', 'eye'],
    text: '[Preview] {m1} on all enemies. For every {m0} new Intents revealed this way, Open {n} [Eye], to a maximum of 2.',
    flavor: 'One eye per corner and none of them agree.',
    nums: { n: 1, m0: 2, m1: 1 },
    effect: eff(c => { const got = previewAll(c, N(c).m1); openEye(c, Math.min(2, Math.floor(got / N(c).m0) * N(c).n)); }),
    upgrade: { cost: 1, nums: { n: 1, m0: 2, m1: 1 } },
  },
  {
    id: 'wink/controlled-panic', name: 'Controlled Panic', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['preview', 'web'],
    text: 'If the target’s current and first [Preview]ed Intents are both Attacks, gain {b} Guard and apply {n} [Web]. Otherwise Preview {m1} and draw {m0} Trick.',
    flavor: 'Eight legs, all of them running, one of them steering.',
    nums: { b: 16, n: 3, m0: 1, m1: 1 },
    effect: eff(c => { const t = c.target; const both = intendsAttack(c, t) && futureFamilies(c, t)[0] === FAMILY.ATTACK; if (both) { U.guard(c, N(c).b); web(c, t, N(c).n); } else { preview(c, t, N(c).m1); U.draw(c, N(c).m0); } }),
    upgrade: { nums: { b: 21, n: 4, m0: 1, m1: 1 } },
  },

  // ── Powers (7) ────────────────────────────────────────────────────────────
  {
    id: 'wink/pattern-library', name: 'Pattern Library', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['read'],
    text: 'The first time a [Read] succeeds each turn, draw {n} Trick.',
    flavor: 'Every behaviour in the house, catalogued in silk.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'wink/pattern-library', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'wink/house-odds', name: 'House Odds', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['blind-read', 'eye', 'web'],
    text: 'Successful [Blind Read]s Open {n} additional [Eye]. When a Blind Read fails, apply {m0} [Web] to that enemy before the normal Eye loss.',
    flavor: 'She profits either way. That is what a house does.',
    nums: { n: 1, m0: 3 },
    effect: eff(c => power(c, 'wink/house-odds', 1)),
    upgrade: { nums: { n: 1, m0: 5 } },
  },
  {
    id: 'wink/loom-logic', name: 'Loom Logic', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['web', 'reorder'],
    text: 'Whenever you spend [Web] to [Reorder] an Intent, apply {n} Web to every other enemy. If only one remains, reapply {m0} to it instead.',
    flavor: 'Pull one thread and the whole loom moves.',
    nums: { n: 2, m0: 1 },
    effect: eff(c => power(c, 'wink/loom-logic', 1)),
    upgrade: { nums: { n: 3, m0: 1 } },
  },
  {
    id: 'wink/reflexive-blink', name: 'Reflexive Blink', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['eye'],
    text: 'The first time each turn you Close one or more [Eye]s, Open {n} Eye at the end of that turn.',
    flavor: 'She cannot help it. Eight eyelids, one nervous system.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'wink/reflexive-blink', 1)),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'wink/three-steps-ahead', name: 'Three Steps Ahead', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['preview'],
    text: 'At the start of your turn, [Preview] {n} additional future Intent on an enemy, up to the normal depth of three.',
    flavor: 'Free information, arriving on schedule.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'wink/three-steps-ahead', 1, (x) => {
      x.e?.on?.('turn:start', () => { const e = U.enemies(x)[0]; if (e) preview(x, e, U.stacks(x, x.self, 'wink/three-steps-ahead')); });
    })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'wink/extra-corner', name: 'Extra Corner', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['set', 'web'],
    text: 'Increase your [Set] slot limit to {n} for this combat. Whenever your first Set of a turn triggers, apply {m0} [Web] to its attached enemy.',
    flavor: 'There was always a fourth corner. Nobody looks up.',
    nums: { n: 4, m0: 1 },
    effect: eff(c => { U.mm(c).setCap = Math.max(U.mm(c).setCap, N(c).n); power(c, 'wink/extra-corner', 1); }),
    upgrade: { nums: { n: 5, m0: 1 } },
  },
  {
    id: 'wink/observe-and-interfere', name: 'Observe and Interfere', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['preview', 'web'],
    text: 'Whenever a [Preview]ed Intent becomes current, gain {b} Guard if it is an Attack. If it is not, apply {n} [Web] to that enemy.',
    flavor: 'Watching is not a passive activity for a spider.',
    nums: { b: 6, n: 2 },
    effect: eff(c => power(c, 'wink/observe-and-interfere', 1, (x) => {
      x.e?.on?.('intent', (ev) => { if (!ev || !ev.enemy) return; if (ev.family === FAMILY.ATTACK) U.guard(x, 6); else web(x, ev.enemy, 2); });
    })),
    upgrade: { nums: { b: 9, n: 3 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks (8) ───────────────────────────────────────────────────────────
  {
    id: 'wink/future-perfect', name: 'Future Perfect', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['preview', 'intent-family', 'web', 'eye'],
    text: 'Deal {d} damage. For each distinct [Intent Family] among the target’s [Preview]ed Intents — Attack adds a {m0} hit, Defense applies {n} [Web], Scheme Opens {m1} [Eye], Special draws {m2} Trick. Each once.',
    flavor: 'By the time she strikes, it has already happened.',
    nums: { d: 20, m0: 8, n: 2, m1: 1, m2: 1 },
    effect: eff(c => {
      U.hit(c, N(c).d);
      const f = new Set(futureFamilies(c, c.target));
      if (f.has(FAMILY.ATTACK)) U.hit(c, N(c).m0);
      if (f.has(FAMILY.DEFENSE)) web(c, c.target, N(c).n);
      if (f.has(FAMILY.SCHEME)) openEye(c, N(c).m1);
      if (f.has(FAMILY.SPECIAL)) U.draw(c, N(c).m2);
    }),
    upgrade: { nums: { d: 25, m0: 10, n: 2, m1: 1, m2: 1 } },
  },
  {
    id: 'wink/all-eight-at-once', name: 'All Eight at Once', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['eye'],
    text: 'Close any number of [Eye]s. Deal {d} damage for each Eye Closed. If exactly 8 were Closed, the final hit deals {m0} instead.',
    flavor: 'She shuts every one of them and simply commits.',
    nums: { d: 6, m0: 20, hits: 4 },
    effect: eff(c => { const n = eyes(c); if (!closeEye(c, n)) return; U.hitN(c, N(c).d, Math.max(0, n - 1)); if (n > 0) U.hit(c, n === 8 ? N(c).m0 : N(c).d); }),
    upgrade: { nums: { d: 8, m0: 26, hits: 4 } },
  },
  {
    id: 'wink/silk-snap', name: 'Silk Snap', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['web'],
    text: 'Remove up to {n} [Web] from the target. Deal {d} damage for each Web removed. If exactly 8 were removed, reapply {m0} Web afterwards.',
    flavor: 'All of that patience, released in one direction.',
    nums: { d: 5, n: 8, m0: 4, hits: 5 },
    effect: eff(c => { const take = Math.min(N(c).n, webOn(c, c.target)); if (take) U.unapply(c, c.target, WEB, take); U.hitN(c, N(c).d, take); if (take === 8) web(c, c.target, N(c).m0); }),
    upgrade: { nums: { d: 6, n: 8, m0: 4, hits: 5 } },
  },
  {
    id: 'wink/closed-loop', name: 'Closed Loop', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['read', 'reorder'],
    text: 'Deal {d} damage. If a [Read] succeeded and you [Reorder]ed an Intent this turn, return this Trick to your hand. Once each turn.',
    flavor: 'Predicted it, moved it, hit it, and got the card back.',
    nums: { d: 9 },
    effect: eff(c => { U.hit(c, N(c).d); if (U.got(c, 'readSuccess') > 0 && U.got(c, 'reordered') > 0 && U.once(c, 'closedLoop')) U.returnSelf(c); }),
    upgrade: { nums: { d: 13 } },
  },
  {
    id: 'wink/deadline', name: 'Deadline', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['set'],
    text: '[Set] on an enemy. When it is about to execute an Attack Intent, deal {d} damage immediately before the attack, then discard this Trick. If that defeats it, the attack never happens.',
    flavor: 'The appointment is kept. Just not by them.',
    nums: { d: 40 },
    effect: eff(c => { const t = c.target, d = N(c).d; placeSet(c, (x, ev) => ev.type === 'intent' && ev.enemy === t && ev.family === FAMILY.ATTACK, (x) => U.hitAt(x, t, d), { enemy: t }); }),
    upgrade: { nums: { d: 50 } },
  },
  {
    id: 'wink/wrong-on-purpose', name: 'Wrong on Purpose', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 0, target: ENEMY, keywords: ['read', 'preview'],
    text: 'Deal {d} damage. Choose one unresolved [Read] on the target and force it to fail immediately, triggering its normal failure effects. Then [Preview] the position it predicted. Once each turn.',
    flavor: 'Being wrong on purpose is a completely different resource.',
    nums: { d: 5 },
    effect: eff(c => { U.hit(c, N(c).d); if (!U.once(c, 'wrongOnPurpose')) return; const r = readsOn(c, c.target)[0]; if (r) { r.forceFail = true; resolveRead(c, r, null, c.target); preview(c, c.target, 1); } }),
    upgrade: { nums: { d: 8 } },
  },
  {
    id: 'wink/spiders-paradox', name: 'Spider’s Paradox', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['read', 'preview', 'web'],
    text: 'Deal {d} damage to all enemies. For each enemy with an unresolved [Read], choose to [Preview] that Read’s position, or leave it hidden and apply {n} [Web] instead.',
    flavor: 'Certainty and leverage, and only one of them per enemy.',
    nums: { d: 15, n: 4 },
    effect: eff(async c => {
      U.hitAll(c, N(c).d);
      for (const e of U.enemies(c)) {
        const r = readsOn(c, e)[0];
        if (!r) continue;
        await U.chooseOne(c, [
          { label: 'Preview it', fn: (x) => preview(x, e, 1) },
          { label: 'Web it', fn: (x) => web(x, e, N(x).n) },
        ]);
      }
    }),
    upgrade: { nums: { d: 19, n: 5 } },
  },
  {
    id: 'wink/the-part-where-you-panic', name: 'The Part Where You Panic', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['eye', 'set'],
    text: 'Deal {d} damage. You may Close {n} [Eye]s to immediately trigger one [Set] attached to the target, even if its trigger has not occurred. Resolve it fully, then discard it.',
    flavor: 'She has been waiting for this exact second all fight.',
    nums: { d: 24, n: 2 },
    effect: eff(c => {
      U.hit(c, N(c).d);
      const t = c.target;
      const list = activeSets(c);
      const i = list.findIndex(s => s.enemyId === eid(t));
      if (i < 0 || !closeEye(c, N(c).n)) return;
      const s = list.splice(i, 1)[0];
      try { s.fire(c, { type: 'forced', enemy: t }); } catch (_) {}
      U.moveCard(c, s.card, 'discard');
    }),
    upgrade: { nums: { d: 30, n: 2 } },
  },

  // ── Skills (11) ───────────────────────────────────────────────────────────
  {
    id: 'wink/clairvoyant-lattice', name: 'Clairvoyant Lattice', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['preview', 'web'],
    text: '[Preview] future Intents until every living enemy has {n} future positions revealed. Apply {m0} [Web] for every newly revealed Intent.',
    flavor: 'The whole night, laid out at once, in thread.',
    nums: { n: 3, m0: 1 },
    effect: eff(c => { for (const e of U.enemies(c)) { const got = preview(c, e, N(c).n - previewDepth(c, e)); web(c, e, got * N(c).m0); } }),
    upgrade: { cost: 1, nums: { n: 3, m0: 1 } },
  },
  {
    id: 'wink/rewrite-the-script', name: 'Rewrite the Script', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['reorder', 'read', 'preview'],
    text: 'Swap any two movable Intents among one enemy’s current and [Preview]ed queue. [Read]s stay attached to their positions.',
    flavor: 'She is not changing what happens. She is changing when.',
    nums: {},
    effect: eff(async c => { await U.chooseOne(c, [
      { label: 'Current ↔ next', fn: (x) => swapIntents(x, x.target, 0, 1) },
      { label: 'Next ↔ the one after', fn: (x) => swapIntents(x, x.target, 1, 2) },
      { label: 'Current ↔ the one after', fn: (x) => swapIntents(x, x.target, 0, 2) },
    ]); }),
    upgrade: { cost: 1 },
  },
  {
    id: 'wink/postpone-the-inevitable', name: 'Postpone the Inevitable', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['web', 'reorder', 'preview'],
    text: 'Remove {n} [Web]. Move the target’s current movable Intent behind all of its [Preview]ed future Intents. Its next queued Intent becomes current immediately.',
    flavor: 'Not cancelled. Rescheduled.',
    nums: { n: 5 },
    effect: eff(c => { if (spendWeb(c, c.target, N(c).n)) postpone(c, c.target); }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'wink/i-meant-that-one', name: 'I Meant That One', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['read', 'eye'],
    text: 'Choose an unresolved [Read]. If it would fail, treat it as successful instead, but Close {n} [Eye]s when it resolves. It does not count as a failed Read.',
    flavor: 'She absolutely did not mean that one.',
    nums: { n: 2 },
    effect: eff(c => { const r = readsOn(c, c.target)[0]; if (r) { r.forceSuccess = true; r.penaltyEyes = 0; const n = N(c).n; const old = r.bonusEyes || 0; r.bonusEyes = old; U.atTurnEnd(c, () => {}); r.closeOnResolve = n; } }),
    upgrade: { nums: { n: 1 } },
  },
  {
    id: 'wink/eyes-shut', name: 'Eyes Shut', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['eye', 'read', 'blind-read'],
    text: 'Close all Open [Eye]s. Until the end of this turn, [Read]s you place count as [Blind Read]s even on revealed positions. Each successful one draws {n} Trick at the start of your next turn.',
    flavor: 'She stops looking on purpose. It is the strongest thing she does.',
    nums: { n: 1 },
    effect: eff(c => { closeEye(c, eyes(c)); U.bump(c, 'forceBlind'); const n = N(c).n; U.tf(c).blindDraw = n; }),
    upgrade: { cost: 0, nums: { n: 1 } },
  },
  {
    id: 'wink/house-spider', name: 'House Spider', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: NONE, keywords: ['set', 'vanish'],
    text: 'Choose up to {n} [Set] Tricks in your discard pile and place them into empty Set slots for free. After those Sets trigger, they [Vanish].',
    flavor: 'She has lived here longer than the house has.',
    nums: { n: 2 },
    effect: eff(async c => {
      const ks = await U.pickCards(c, { pile: 'discard', count: N(c).n, prompt: 'Re-Set from discard', filter: (x) => ((x.def?.keywords) || []).includes('set') });
      for (const k of ks) { if (!setRoom(c)) break; activeSets(c).push({ card: k, enemyId: null, global: true, trigger: () => false, fire: () => {}, vanish: true }); U.moveCard(c, k, 'limbo', { set: true }); }
    }),
    upgrade: { cost: 1, nums: { n: 2 } },
  },
  {
    id: 'wink/snip-here', name: 'Snip Here', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['web', 'reorder', 'anchored'],
    text: 'Remove {n} [Web] from an enemy to delete its current movable Intent from the queue. Its next Intent becomes current immediately. Cannot affect [Anchored] Intents.',
    flavor: 'One snip. The plan simply stops existing.',
    nums: { n: 8 },
    effect: eff(c => { if (spendWeb(c, c.target, N(c).n)) deleteIntent(c, c.target); }),
    upgrade: { nums: { n: 6 } },
  },
  {
    id: 'wink/triple-prediction', name: 'Triple Prediction', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['read', 'blind-read', 'intent-family'],
    text: 'Place separate [Read]s on the target’s next {n} future positions, choosing an [Intent Family] for each. A Read on a hidden position is a [Blind Read].',
    flavor: 'Three in a row. She is showing off and she has earned it.',
    nums: { n: 3 },
    effect: eff(async c => { for (let i = 1; i <= N(c).n; i++) { const fam = FAMILIES[U.rint(c, 4)]; placeRead(c, c.target, fam, i); } }),
    upgrade: { cost: 1, nums: { n: 3 } },
  },
  {
    id: 'wink/forked-future', name: 'Forked Future', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['preview', 'reorder'],
    text: 'Choose an enemy with at least {n} [Preview]ed future Intents. After its current Intent finishes, you choose which of the two becomes current next. The other stays queued.',
    flavor: 'Both futures exist. She simply picks.',
    nums: { n: 2 },
    effect: eff(c => { const t = c.target; c.forkFuture?.(t); U.tf(c).forked = t; U.bump(c, 'reordered'); U.fire(c, 'reorder', { enemy: t }); }),
    playable: (c) => previewDepth(c, c.target) >= 2,
    upgrade: { cost: 0, nums: { n: 2 } },
  },
  {
    id: 'wink/back-pocket-web', name: 'Back Pocket Web', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: NONE, keywords: ['set'],
    text: 'Return one active [Set] Trick you own to your hand, freeing its slot. That Trick costs {n} this turn.',
    flavor: 'She takes the trap back. She will need it somewhere better.',
    nums: { n: 0 },
    effect: eff(c => { const list = activeSets(c); if (!list.length) return; const s = list.pop(); U.toHand(c, s.card); U.costSet(c, s.card, N(c).n, 'turn'); }),
    upgrade: { nums: { n: 0, m0: 1 }, text: 'Return one active [Set] Trick you own to your hand, freeing its slot. That Trick costs {n} this turn. Draw {m0} Trick.' },
  },
  {
    id: 'wink/no-such-thing-as-random', name: 'No Such Thing as Random', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['preview', 'anchored'],
    text: 'For the rest of combat, whenever the target’s AI would choose randomly among legal Intents, you choose instead. This cannot alter scripted or [Anchored] actions. [Preview] {n} immediately.',
    flavor: 'There is a pattern. There is always a pattern.',
    nums: { n: 1 },
    effect: eff(c => { c.controlEnemyChoice?.(c.target, true); if (c.target) c.target.playerChoosesIntent = true; preview(c, c.target, N(c).n); }),
    upgrade: { cost: 2, nums: { n: 1 } },
  },

  // ── Powers (6) ────────────────────────────────────────────────────────────
  {
    id: 'wink/all-eyes-open', name: 'All Eyes Open', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['full-gaze', 'preview', 'web', 'reorder'],
    text: 'While at [Full Gaze], [Preview] every enemy to a depth of {n} at the start of each turn. Your first Intent [Reorder] each turn needs {m0} fewer [Web], minimum 1.',
    flavor: 'Nothing in this house happens unobserved any more.',
    nums: { n: 2, m0: 2 },
    effect: eff(c => { U.applySelf(c, 'web-discount', N(c).m0); power(c, 'wink/all-eyes-open', 1, (x) => { x.e?.on?.('turn:start', () => { if (fullGaze(x)) for (const e of U.enemies(x)) preview(x, e, 2 - previewDepth(x, e)); }); }); }),
    upgrade: { cost: 2, nums: { n: 2, m0: 2 } },
  },
  {
    id: 'wink/master-of-the-web', name: 'Master of the Web', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['web', 'reorder'],
    text: 'The first time each turn you spend [Web] to [Reorder] or delete an Intent, the target must have the Web but it is not removed.',
    flavor: 'She does not spend her web. She lends it.',
    nums: {},
    effect: eff(c => { U.applySelf(c, 'free-web', 1); power(c, 'wink/master-of-the-web', 1); }),
    upgrade: { cost: 2 },
  },
  {
    id: 'wink/the-house-has-tells', name: 'The House Has Tells', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['preview', 'eye'],
    text: 'Whenever enemy AI changes one of its future Intents because conditions changed, reveal the replacement and Open {n} [Eye]. Once per enemy each turn.',
    flavor: 'When it changes its mind, the wallpaper tells her.',
    nums: { n: 1 },
    effect: eff(c => power(c, 'wink/the-house-has-tells', 1, (x) => {
      x.e?.on?.('intent', (ev) => { if (ev && ev.changed && U.once(x, 'tells:' + eid(ev.enemy))) { preview(x, ev.enemy, 1); openEye(x, 1); } });
    })),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'wink/patient-hunter', name: 'Patient Hunter', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['set'],
    text: 'The first [Set] Trick that triggers after each of your turns returns to your hand at the start of your next turn instead of the discard pile. It costs {n} that turn.',
    flavor: 'She waits. That is the entire technique.',
    nums: { n: 0 },
    effect: eff(c => power(c, 'wink/patient-hunter', 1)),
    upgrade: { cost: 1, nums: { n: 0 } },
  },
  {
    id: 'wink/probability-collapse', name: 'Probability Collapse', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['read', 'intent-family', 'anchored'],
    text: 'At the end of your turn, if every living enemy has an unresolved [Read], choose one. If its predicted [Intent Family] is legal for that enemy’s next action, force its next Intent to be from that family. Cannot affect [Anchored] actions. Once each turn.',
    flavor: 'She stops predicting the future and starts filing it.',
    nums: {},
    effect: eff(c => power(c, 'wink/probability-collapse', 1, (x) => {
      x.e?.on?.('turn:end', () => {
        const es = U.enemies(x);
        if (!es.length || !es.every(e => readsOn(x, e).length) || !U.once(x, 'probabilityCollapse')) return;
        const e = es[0], r = readsOn(x, e)[0];
        x.forceIntentFamily?.(e, r.family);
      });
    })),
    upgrade: { cost: 2 },
  },
  {
    id: 'wink/every-angle-covered', name: 'Every Angle Covered', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['read', 'blind-read', 'preview'],
    text: 'Whenever a [Read] succeeds, once per enemy each turn, copy its predicted family onto that enemy’s following position if that position has no Read. The copy is a [Blind Read] if the position is hidden.',
    flavor: 'The web finishes itself.',
    nums: {},
    effect: eff(c => power(c, 'wink/every-angle-covered', 1)),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
export default {
  slug: SLUG,
  name: 'Wink',
  title: 'the Eyeball Spider',
  region: 'attic-observatory',
  identity:
    'Wink is for players who want to know what is coming, decide whether knowing is worth the cost, and ' +
    'then interfere with the future just enough to look psychic. She is not a Guard character and she ' +
    'does not simply get bonuses for hitting something with an Attack intent — the puzzle is the enemy ' +
    'action queue. At low mastery she looks ahead and prepares. At high mastery she decides which ' +
    'information to leave hidden, places predictions before acquiring certainty, engineers those ' +
    'predictions into being correct by rearranging the queue underneath them, and converts delayed Set ' +
    'Tricks into a second layer of action economy. Her scaling is control complexity, not a damage stat.',
  strengths: [
    'Exceptional future information — she can see several turns ahead',
    'Reorders enemy actions rather than merely weakening them',
    'Set Tricks buy future turns with present Nerve',
    'Predictable enemies become a resource',
    'Scales through Web, Open Eyes, Sets, Powers and a growing network of Reads',
  ],
  weaknesses: [
    'Setup costs real tempo — previewing and preparing are turns not spent killing',
    'Web does nothing without spenders',
    'Information has diminishing returns against something about to die',
    'Anchored boss Intents cannot be moved at all',
    'Reads fail, and conditional enemy behaviour invalidates them',
    'Set slots clog, temporarily removing Tricks from circulation',
    'Immediate emergency defence is only adequate — she is much safer after preparation than when surprised',
  ],
  startingHp: 66,
  startingEnergy: 3,
  mechanics: {
    preview: { name: 'Preview', kind: 'system', desc: 'Reveal additional future Intent positions for an enemy, to a depth of three. Previewed Intents stay visible until they become current. Preview is information only — it does not make an Intent immutable.', min: 0, max: 3, hooks: ['preview'] },
    intentFamilies: { name: 'Intent Families', kind: 'system', desc: 'Every Intent has exactly one primary family: Attack, Defense, Scheme or Special. This lets Wink predict without naming exact moves.', min: 0, max: 4, hooks: [] },
    reads: { name: 'Reads', kind: 'system', desc: 'Predict a family for a future position. Correct: Open 1 Eye. Wrong: Close 1 Eye. A Read attaches to the queue position, not the action — so reordering can make a wrong prediction right. A Read placed on a hidden position is Blind, and stays Blind even if Previewed later.', min: 0, max: 3, hooks: ['readPlaced', 'readSuccess', 'readFail'] },
    openEyes: { name: 'Open Eyes', kind: 'resource', desc: 'Eight eyes, 3 Open at the start of combat, persisting between turns. Opening and Closing costs no Nerve, but a Trick that Closes Eyes as a cost needs enough Open. Full Gaze at 8 has no automatic benefit — specific Tricks reward it.', min: 0, max: 8, hooks: ['eyesOpened', 'eyesClosed'] },
    web: { name: 'Web', kind: 'status', desc: 'A persistent resource attached to an individual enemy. Web does nothing by itself; Wink spends it to rearrange, postpone, delete, attack, defend and feed Sets. Stacking Web without spenders is wasted.', min: 0, max: 99, hooks: [] },
    reorder: { name: 'Intent reordering', kind: 'system', desc: 'Swap or postpone enemy Intents, usually needing the affected position Previewed first. Reordering changes when an action happens; it does not erase it. Anchored Intents can be Previewed and Read but never moved.', min: 0, max: 99, hooks: ['reorder'] },
    sets: { name: 'Set Tricks', kind: 'system', desc: 'Placed face up outside the deck in one of 3 slots. A Set pays its cost when played, waits for its trigger, then resolves for free and goes to the discard pile. If its enemy dies first it returns without triggering.', min: 0, max: 5, hooks: ['setPlaced', 'setTriggered'] },
  },
  startingDeck: [
    'wink/little-nibble', 'wink/little-nibble', 'wink/little-nibble', 'wink/little-nibble',
    'wink/silk-screen', 'wink/silk-screen', 'wink/silk-screen',
    'wink/peek-around-the-corner', 'wink/call-it', 'wink/loose-thread',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  archetypes: [
    { name: 'The Seer', desc: 'Reveal sequences and turn accurate Reads into reliable value. Very consistent and excellent against patterned bosses, but a large part of the deck is spent learning things instead of killing.', coreCards: ['wink/read-the-room', 'wink/double-check', 'wink/pattern-library', 'wink/three-steps-ahead', 'wink/clairvoyant-lattice', 'wink/triple-prediction', 'wink/every-angle-covered'] },
    { name: 'The Blind Gambler', desc: 'Predict before revealing, then profit whether the prediction lands or not. The mastery trick: Read blind, Preview afterwards, discover you are wrong, build Web, and rearrange the queue until you are right.', coreCards: ['wink/make-a-guess', 'wink/long-shot', 'wink/blindside-probability', 'wink/wrong-answer', 'wink/house-odds', 'wink/wrong-on-purpose', 'wink/eyes-shut'] },
    { name: 'The Web Editor', desc: 'Treat enemy actions as an editable schedule. Not that attack now — put the buff first, move the big one behind the harmless setup. The dangerous action still exists afterwards, and Anchored ones never move.', coreCards: ['wink/tighten-the-silk', 'wink/thread-map', 'wink/tug-the-thread', 'wink/stall-the-bad-part', 'wink/loom-logic', 'wink/rewrite-the-script', 'wink/postpone-the-inevitable', 'wink/snip-here', 'wink/master-of-the-web'] },
    { name: 'The Trap Architect', desc: 'Spend on one turn so future turns get free actions. Excellent Nerve efficiency across long encounters, badly punished by short ones and by Sets that sit in a slot waiting for a trigger that never comes.', coreCards: ['wink/tripline', 'wink/watch-this-one', 'wink/rehearsed-pounce', 'wink/set-the-table', 'wink/doorframe-tripline', 'wink/lampshade-lookout', 'wink/false-floor', 'wink/extra-corner', 'wink/deadline', 'wink/back-pocket-web', 'wink/patient-hunter'] },
    { name: 'Full Gaze', desc: 'Accumulate all eight Eyes and stay there long enough to use the thresholds. Every Eye spent breaks it, and a player who refuses to spend can die sitting on a theoretically valuable resource.', coreCards: ['wink/wide-eyes', 'wink/house-pattern', 'wink/eight-eyes-one-target', 'wink/double-check', 'wink/reflexive-blink', 'wink/eight-cornered-view', 'wink/all-eyes-open', 'wink/all-eight-at-once'] },
  ],
};
