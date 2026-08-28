/**
 * Companion card helper layer.  OWNER: companion-cards.
 *
 * Every card effect in `data/companions/**` is written against this module rather
 * than poking the engine directly.  Two reasons:
 *
 *  1. The documented `Ctx` surface in `data/schema.js` is small.  Anything a
 *     companion mechanic needs beyond it is funnelled through exactly one wrapper
 *     here, called defensively (`c.foo?.(…)`), with a sane fallback.  When the
 *     combat engine grows the real helper, this file is the only thing that has to
 *     learn about it.
 *  2. Signature mechanics (Loose Bones, Height, Globs, Open Eyes, the Patch, the
 *     Belly, Sets, Buried) need per-combat state and reactive hooks.  All of that
 *     lives in a scratch namespace we own (`engine.__mm`) plus a module-level hook
 *     table, so companion Powers work without the engine knowing they exist.
 *
 * NOTHING in here calls Math.random().  Every draw goes through `c.e.rng`.
 */

// ── engine scratch namespace ────────────────────────────────────────────────
/** Per-combat state owned by companion-cards. Created lazily on the engine. */
/**
 * The companion scratch space, per SEAT.
 *
 * It used to live on the engine, which is right up until two Kids are playing.
 * Wink's Set Tricks, Bones' Buried pile, Pipkin's Patch and Marmalade's
 * Untouched bookkeeping are all per-player state; sharing one object across a
 * party would have two Kids planting in the same Patch and one Kid's perfect
 * turn marking the other Untouched.
 *
 * Resolution order: the seat holding the card (`c.self`), then the acting seat,
 * then the engine itself for a call with no ctx at all. Solo is unaffected —
 * there is one seat and it owns the only scratch there has ever been.
 */
export function mm(c) {
  const e = c?.e || c;
  if (!e) return FALLBACK_SCRATCH;
  const seat = (c && c.self && c.self.side === 'player') ? c.self
             : (e.current && e.current.side === 'player') ? e.current
             : null;
  const host = seat || e;
  if (!host.__mm) {
    host.__mm = {
      onceTurn: -1, once: {},          // "first time each turn" guards
      played: 0,                       // cards played this turn (fallback counter)
      patch: [],                       // pipkin: array of 'seed'|'sprout'|'pumpkin'
      patchCap: 6,
      sets: [],                        // wink: [{ card, trigger, enemyId, fn }]
      setCap: 3,
      bellyCap: 2,                     // taffy
      buried: [],                      // bones: [{ card, counters }]
      reads: [],                       // wink: [{ enemyId, pos, family, blind }]
      previewed: {},                   // wink: enemyId -> depth revealed
      turnFlags: {},                   // per-turn scratch (rattles, fetches, …)
      lastTurnEndHp: null,             // marmalade: Untouched bookkeeping
      untouched: true,
      installed: false,
      maxPlump: 3,
    };
  }
  return host.__mm;
}
const FALLBACK_SCRATCH = { onceTurn: -1, once: {}, played: 0, patch: [], patchCap: 6, sets: [], setCap: 3, bellyCap: 2, buried: [], reads: [], previewed: {}, turnFlags: {}, lastTurnEndHp: null, untouched: true, installed: false, maxPlump: 3 };

/**
 * Current turn number.
 * `engine.state` is a full serialising snapshot getter — never touch it here.
 */
export function turn(c) {
  const t = (typeof c?.turn === 'number') ? c.turn : c?.e?.turn;
  return typeof t === 'number' ? t : 0;
}

/** Per-turn scratch bag, auto-cleared when the turn number changes. */
export function tf(c) {
  const s = mm(c), t = turn(c);
  if (s.onceTurn !== t) { s.onceTurn = t; s.once = {}; s.turnFlags = {}; s.played = 0; }
  return s.turnFlags;
}

/** True the first time this key is asked for on this turn. */
export function once(c, key) {
  tf(c);
  const s = mm(c);
  if (s.once[key]) return false;
  s.once[key] = true;
  return true;
}

/** Bump a per-turn counter and return the new value. */
export function bump(c, key, n = 1) { const f = tf(c); f[key] = (f[key] || 0) + n; return f[key]; }
/** Read a per-turn counter. */
export function got(c, key) { return tf(c)[key] || 0; }

// ── companion-internal reactive hooks ───────────────────────────────────────
/**
 * Powers register here.  `statusId` is the buff the Power applies to the player;
 * the handler only runs while that buff is on the board.  Keeps every Power's
 * behaviour inside data/companions/** with zero engine involvement.
 */
const HOOKS = new Map();
export function onHook(evt, statusId, fn) {
  if (!HOOKS.has(evt)) HOOKS.set(evt, []);
  HOOKS.get(evt).push({ statusId, fn });
}
export function fire(c, evt, payload) {
  const list = HOOKS.get(evt);
  if (!list) return;
  for (const h of list) { if (stacks(c, c.self, h.statusId) > 0) { try { h.fn(c, payload || {}); } catch (_) { /* a Power must never brick a card */ } } }
}
/** Hook names companion Powers listen on (for the audit page). */
export const HOOK_NAMES = () => [...HOOKS.keys()].sort();

// ── numbers on the runtime card ─────────────────────────────────────────────
/** The resolved nums of the card being played (upgrade already folded in). */
export function N(c) { return c?.card?.nums || c?.nums || {}; }
/** Is the card being played upgraded? */
export function up(c) { return !!(c?.card?.upgraded); }

// ── randomness (always through the engine rng) ──────────────────────────────
export function rint(c, max) { return c?.e?.rng?.int ? c.e.rng.int(max) : 0; }
export function rpick(c, arr) { if (!arr || !arr.length) return undefined; return arr[rint(c, arr.length)]; }
export function rshuffle(c, arr) { return c?.e?.rng?.shuffle ? c.e.rng.shuffle(arr) : (arr || []).slice(); }

// ── damage / guard / courage ────────────────────────────────────────────────
export function hit(c, amt, opts) { const t = c.target || c.randomEnemy(); if (t) c.damage(t, amt, opts); return t; }
export function hitN(c, amt, n, opts) { for (let i = 0; i < n; i++) hit(c, amt, opts); }
export function hitAt(c, t, amt, opts) { if (t) c.damage(t, amt, opts); }
export function hitAll(c, amt, opts) { c.damageAll(amt, opts); }
export function hitAllN(c, amt, n, opts) { for (let i = 0; i < n; i++) hitAll(c, amt, opts); }
export function hitRandom(c, amt, opts) { const t = c.randomEnemy(); if (t) c.damage(t, amt, opts); return t; }
export function hitRandomN(c, amt, n, opts) { for (let i = 0; i < n; i++) hitRandom(c, amt, opts); }
export function guard(c, amt) { if (amt > 0) c.block(c.self, amt); }
export function guardOn(c, actor, amt) { if (amt > 0) c.block(actor, amt); }
export function mend(c, amt) { if (amt > 0) c.heal(c.self, amt); }
export function bleed(c, amt) { if (amt > 0) c.loseHp(c.self, amt); }
export function enemies(c) { return c.livingEnemies() || []; }
export function others(c) { const t = c.target; return enemies(c).filter(e => e !== t); }

// ── statuses ────────────────────────────────────────────────────────────────
export function stacks(c, actor, id) { return (c.count(id, actor) ?? 0) | 0; }
export function apply(c, actor, id, n) { if (actor && n) c.applyStatus(actor, id, n); }
export function applySelf(c, id, n) { apply(c, c.self, id, n); }
export function applyAll(c, id, n) { for (const e of enemies(c)) apply(c, e, id, n); }
/** Remove stacks.  Engine convention: negative stacks subtract. */
export function unapply(c, actor, id, n) { if (actor && n > 0) c.applyStatus(actor, id, -n); }
export function debuffCount(c, actor) {
  const n = c.debuffCount?.(actor);
  if (typeof n === 'number') return n;
  let t = 0;
  for (const id of COMMON_DEBUFFS) t += stacks(c, actor, id) > 0 ? 1 : 0;
  return t;
}
const COMMON_DEBUFFS = ['weak', 'vulnerable', 'frail', 'poison', 'haunt', 'web', 'brittle', 'slow', 'confused'];

// ── companion resources (Lives, Loose Bones, Height, Plump, Globs, Eyes) ────
/** True when the engine is tracking this id as a first-class counter track. */
/**
 * Is this counter defined for the seat asking?
 *
 * Goes through the engine rather than poking `engine.counters` directly,
 * because in a party the map is keyed by seat — two Marmalades have two
 * independent Lives tracks — and a raw `.has(id)` would miss both.
 */
export function hasCounter(c, id) {
  const e = c?.e;
  if (!e || typeof e.hasCounter !== 'function') return false;
  return e.hasCounter(id, c?.self?.id);
}
/** Read a resource.  Prefers the engine counter track, falls back to a status. */
export function res(c, id) { return hasCounter(c, id) ? (c.counter(id) | 0) : stacks(c, c.self, id); }
/**
 * Add to a resource with a floor/ceiling.  Returns the amount actually changed.
 *
 * CAREFUL: `min`/`max` apply ONLY to the status-backed fallback. When the
 * resource has an engine counter track (`defineCounters`), the whole delta goes
 * to `addCounter` and the counter's OWN declared max is the only ceiling — the
 * arguments here are silently ignored. If a Companion's effective cap can move
 * during a fight (Boggle's Lurk, 5 normally and 7 under Underbed Kingdom),
 * declare the counter at the HIGHER value and clamp at the call site.
 */
export function addRes(c, id, n, min = 0, max = 99) {
  if (n === 0) return 0;
  if (hasCounter(c, id)) return c.addCounter(id, n) | 0;
  const cur = res(c, id);
  const delta = Math.max(min, Math.min(max, cur + n)) - cur;
  if (delta) c.applyStatus(c.self, id, delta);
  return delta;
}
/** Set a resource to an exact value.  Returns the change. */
export function setRes(c, id, n, min = 0, max = 99) { return addRes(c, id, Math.max(min, Math.min(max, n)) - res(c, id), min, max); }
/** Spend a resource, only if the full amount is available.  Returns true on success. */
export function spendRes(c, id, n) {
  if (n <= 0) return true;
  if (hasCounter(c, id)) return !!c.spendCounter(id, n);
  if (res(c, id) < n) return false;
  addRes(c, id, -n);
  return true;
}
/**
 * Declare a companion's resource tracks on the engine.  Called from each
 * companion's tracker so Lives, Loose Bones, Height, Plump, Globs and Open Eyes
 * appear in the HUD and answer `ctx.canSpend` for cost checks.
 */
export function defineCounters(engine, defs) {
  if (!engine || !engine.defineCounter) return;
  for (const d of defs) if (!engine.hasCounter(d.id)) engine.defineCounter(d);
}

// ── card zones and card objects ─────────────────────────────────────────────
/** Runtime cards in a pile.  Piles: 'draw' | 'hand' | 'discard' | 'exhaust' | 'limbo' | 'stash'. */
const PILE_PROP = { draw: 'drawPile', hand: 'hand', discard: 'discardPile', exhaust: 'exhaustPile', limbo: 'limbo', stash: 'stash' };
export function cardsIn(c, pile) {
  const v = c?.[PILE_PROP[pile] || pile] ?? c?.e?.piles?.[pile] ?? c.cardsIn(pile) ?? c?.e?.[pile];
  return Array.isArray(v) ? v : [];
}
/** Other cards in hand (never the card currently resolving). */
export function handOthers(c) { return cardsIn(c, 'hand').filter(k => k && k !== c.card); }
/** Move a runtime card to a pile.  opts: { top:true } for the top of the draw pile. */
export function moveCard(c, card, pile, opts) { if (card) c.moveCard(card, pile, opts || {}); }
/** Put a card on top of the draw pile. */
export function toDrawTop(c, card) { moveCard(c, card, 'draw', { top: true }); }
export function toDrawBottom(c, card) { moveCard(c, card, 'draw', { bottom: true }); }
export function toHand(c, card) { moveCard(c, card, 'hand', {}); }
/** Return the card currently resolving to hand after it finishes. */
export function returnSelf(c) { if (!c.card) return; if (c.returnToHand) c.returnToHand(c.card); else c.moveCard(c.card, 'hand', { returned: true }); }
/** Shuffle the draw pile. */
export function reshuffle(c) { c.shuffleDraw(); }

/** Arbitrary per-card boolean/string markers (Slobbered, Dug Up, Gummy, Chewed…). */
export function flag(card, k) {
  if (!card) return undefined;
  if (card.meta && k in card.meta) return card.meta[k];
  return card.mmFlags ? card.mmFlags[k] : undefined;
}
export function setFlag(card, k, v) {
  if (!card) return;
  if (card.meta) { card.meta[k] = v; return; }
  if (!card.mmFlags) card.mmFlags = {};
  card.mmFlags[k] = v;
}
export function clearFlag(card, k) {
  if (!card) return;
  if (card.meta) delete card.meta[k];
  if (card.mmFlags) delete card.mmFlags[k];
}
/** Numeric per-card counters (Stretch, Buried counters, Buried Bite's extra hits…). */
export function counter(card, k) {
  if (!card) return 0;
  if (card.meta && ('#' + k) in card.meta) return card.meta['#' + k] | 0;
  return (card.mmCounters && card.mmCounters[k]) || 0;
}
export function setCounter(card, k, n) {
  if (!card) return;
  const v = Math.max(0, n | 0);
  if (card.meta) { card.meta['#' + k] = v; return; }
  if (!card.mmCounters) card.mmCounters = {};
  card.mmCounters[k] = v;
}
export function addCounter(card, k, n) { setCounter(card, k, counter(card, k) + n); }

/** Printed (base) cost of a runtime card — never the temporarily modified one. */
export function printedCost(card) { return card?.def?.cost ?? card?.baseCost ?? card?.cost ?? 0; }
/** Current cost, after temporary modifications. */
export function nowCost(card) { return card?.cost ?? printedCost(card); }
/** Change a card's current cost. dur: 'turn' | 'combat' | 'untilPlayed'. */
export function costMod(c, card, delta, dur = 'turn') { if (card && delta) c.modifyCost(card, delta, dur); }
export function costSet(c, card, n, dur = 'turn') { if (card) c.setCost(card, n, dur); }
/** Give a card Retain. dur: 'turn' | 'combat'. */
export function retain(c, card, dur = 'turn') {
  if (!card) return;
  if (c.retainCard) c.retainCard(card); else c.retain?.(card, dur);
  if (dur === 'combat') setFlag(card, 'retainCombat', true);
}
/** Give a card Vanish (Exhaust) the next time it is played. */
export function makeVanish(c, card) { if (card) { setFlag(card, 'vanish', true); c.setVanish(card, true); } }

/** Add a fresh card built from a CardDef into a pile. */
export function spawn(c, def, pile = 'hand', opts) { if (def) c.addCard(def, pile, opts || {}); }

// ── player choice (falls back to a deterministic auto-pick) ─────────────────
/**
 * Ask the player to choose cards.  Returns an array of runtime cards.
 * Without an engine picker this resolves deterministically so headless tests and
 * the validation page still exercise every effect.
 */
export async function pickCards(c, opts = {}) {
  const { pile = 'discard', filter, count = 1, optional = false, prompt = '' } = opts;
  const pool = cardsIn(c, pile).filter(k => k && k !== c.card && (!filter || filter(k)));
  if (!pool.length) return [];
  if (c.chooseCard) {
    const chosen = await c.chooseCard({ pile, filter, count, optional, prompt, pool });
    return Array.isArray(chosen) ? chosen.filter(Boolean) : (chosen ? [chosen] : []);
  }
  return pool.slice(0, Math.min(count, pool.length));
}
/**
 * Ask the player to choose one of several named options.
 * `options` is an array of { label, fn }.  Returns the chosen index.
 */
export async function chooseOne(c, options, n = 1) {
  const live = options.filter(o => !o.when || o.when(c));
  if (!live.length) return [];
  let picked;
  if (c.choose) picked = await c.choose({ options: live.map(o => o.label), count: n });
  if (!Array.isArray(picked)) picked = typeof picked === 'number' ? [picked] : null;
  if (!picked) picked = live.slice(0, n).map((_, i) => i);
  const out = [];
  for (const i of picked.slice(0, n)) { const o = live[i] || live[0]; if (o) { await o.fn(c); out.push(o.label); } }
  return out;
}

// ── turn boundaries ─────────────────────────────────────────────────────────
/**
 * Listen to the PLAYER's turn boundary.
 *
 * `engine.on('turn:start')` is NOT the player's turn starting — the engine
 * emits `turn:start` and `turn:end` for every enemy as well, with
 * `side: 'enemy'`. Every Companion tracker in this build listened to the raw
 * event, so with two enemies on the board each of them fired three times a
 * round instead of once. Measured consequences, all of them shipped:
 *
 *   - Marmalade's Untouched was decided by whichever enemy swung LAST, because
 *     the baseline Courage was overwritten mid-enemy-phase. Take 9 damage from
 *     the first enemy, have the second one merely block, and you were still
 *     "Untouched" — the archetype simply did not work in any fight with more
 *     than one enemy.
 *   - Bones' Buried countdown ticked once per enemy, so cards resurfaced in
 *     roughly a third of the turns they were meant to.
 *   - Pipkin's Patch ran a growth step per enemy, and zeroed Height repeatedly.
 *   - Taffy's Stretch counters climbed on every enemy turn end.
 *
 * `state/run.js` already had this right (`if (ev.side !== 'player') return`),
 * which is what made the pattern visible. Use this, not `e.on`.
 *
 * @param {object} e     the engine
 * @param {'start'|'end'} when
 * @param {(ev:object)=>void} fn
 * @param {object|null} [seat]  in a party, only fire for THIS seat. Turn START
 *   is one table-wide event so the seat is not used there; turn END is emitted
 *   per seat, because seats end their turns independently.
 */
export function onPlayerTurn(e, when, fn, seat = null) {
  if (!e || !e.on) return () => {};
  const type = when === 'start' ? 'turn:start' : 'turn:end';
  return e.on(type, (ev) => {
    if (!ev || ev.side !== 'player') return;
    if (when === 'end' && seat && ev.actorId && ev.actorId !== seat.id) return;
    fn(ev);
  });
}

// ── delayed effects ─────────────────────────────────────────────────────────
/** Run `fn` at the start of the player's next turn. */
export function nextTurn(c, fn) {
  if (c.schedule) return c.schedule({ turns: 1, when: 'playerTurnStart', label: 'next turn', run: () => { try { fn(c); } catch (_) {} } });
  const e = c.e; if (!e?.on) return;
  // side-filtered: without it this fired on the FIRST ENEMY's turn start, so
  // "at the start of your next turn" actually happened during the enemy phase.
  let done = false;
  const h = (ev) => {
    if (done || !ev || ev.side !== 'player') return;
    done = true; try { fn(c); } catch (_) {} e.off('turn:start', h);
  };
  e.on('turn:start', h);
}
/** Run `fn` at the end of the current player turn. */
export function atTurnEnd(c, fn) {
  if (c.schedule) return c.schedule({ turns: 1, when: 'playerTurnEnd', label: 'end of turn', run: () => { try { fn(c); } catch (_) {} } });
  const e = c.e; if (!e?.on) return;
  let done = false;
  const h = (ev) => {
    if (done || !ev || ev.side !== 'player') return;
    done = true; try { fn(c); } catch (_) {} e.off('turn:end', h);
  };
  e.on('turn:end', h);
}

// ── generic keyword shorthands used across companions ───────────────────────
export function draw(c, n) { if (n > 0) c.draw(n); }
export function energy(c, n) { if (n > 0) c.gainEnergy(n); else if (n < 0) c.loseEnergy(-n); }
export function discardRandom(c, n) { if (n > 0) c.discard(n, { random: true }); }
/** Empower the next attack this turn by `n` (a temporary damage bonus). */
export function empower(c, n) { applySelf(c, 'empowered', n); }

// ── cross-companion state reads ─────────────────────────────────────────────
/** Cards played so far this turn, including the one currently resolving. */
export function playedThisTurn(c) {
  if (typeof c?.cardsPlayedThisTurn === 'function') return c.cardsPlayedThisTurn() | 0;
  // THIS Kid's count, not the table's — `e.stats` is the team mirror and would
  // give Zoomies away for a teammate's turn. `seatStats` falls back to the
  // acting seat, which in solo is the only seat there is.
  const n = (typeof c?.e?.seatStats === 'function')
    ? c.e.seatStats(c.self && c.self.side === 'player' ? c.self : null).cardsPlayedThisTurn
    : (c?.e?.stats?.cardsPlayedThisTurn ?? c?.e?.cardsPlayedThisTurn);
  return typeof n === 'number' ? n : mm(c).played;
}
/** Marmalade: this is the third or later Trick played this turn. */
export function zoomies(c) { return playedThisTurn(c) >= 3; }
/** Marmalade: no Courage was lost during the previous enemy turn. */
export function isUntouched(c) {
  if (typeof c?.untouched === 'function') return !!c.untouched();
  if (stacks(c, c.self, 'untouched') > 0) return true;
  // This seat's own Courage loss. A teammate getting hit does not end YOUR
  // Untouched — Marmalade's whole archetype is a claim about one Kid's turn.
  const d = (typeof c?.e?.seatStats === 'function')
    ? c.e.seatStats(c.self && c.self.side === 'player' ? c.self : null).damageTakenLastEnemyTurn
    : c?.e?.stats?.damageTakenLastEnemyTurn;
  if (typeof d === 'number') return d === 0;
  return mm(c).untouched;
}
/** Tricks that have Vanished (exhausted) so far this combat. */
export function vanishedCount(c) {
  if (typeof c?.exhaustedThisCombat === 'function') return c.exhaustedThisCombat() | 0;
  return cardsIn(c, 'exhaust').length;
}
/** Remove one negative condition from an actor (Midnight Grooming, Dust Off). */
export function removeOneDebuff(c, actor) {
  const a = actor || c.self;
  if (c.removeDebuff) return c.removeDebuff(a, 1);
  const m = a && a.statuses;
  const ids = m && typeof m.keys === 'function' ? [...m.keys()] : Object.keys(m || {});
  for (const id of ids) {
    if (!COMMON_DEBUFFS.includes(id)) continue;
    if (c.removeStatus) c.removeStatus(a, id); else c.applyStatus(a, id, -stacks(c, a, id));
    return id;
  }
  return null;
}
/** Strip Guard off an actor (Knock It Over). */
export function stripGuard(c, actor, n) {
  if (!actor) return 0;
  if (c.removeBlock) return c.removeBlock(actor, n);
  const before = actor.block || 0;
  actor.block = Math.max(0, before - n);
  return before - actor.block;
}

// ── per-combat trackers ─────────────────────────────────────────────────────
const TRACKERS = new Map();
/** A companion module registers its own turn bookkeeping here. */
export function onTracker(slug, fn) { TRACKERS.set(slug, fn); }
/**
 * Install a companion's per-combat bookkeeping on an engine.  Safe to call more
 * than once.  combat-engine should call this at combat start; every card effect
 * also calls it defensively so nothing breaks if it does not.
 */
/**
 * Install one Companion's per-combat trackers for one seat.
 *
 * `installed` lives on the seat's own scratch, so a party of two Marmalades
 * installs twice — once per Kid, each closing over its own `s` and its own
 * seat — rather than once for the table. The tracker function receives the seat
 * as a third argument precisely so it never has to ask the engine who the
 * player is.
 */
export function installTrackers(engine, slug, seat = null) {
  if (!engine) return;
  const who = seat || (engine.current && engine.current.side === 'player' ? engine.current : null);
  const s = mm(who ? { e: engine, self: who } : { e: engine });
  if (s.installed) return;
  s.installed = true;
  const fn = TRACKERS.get(slug);
  if (fn && engine.on) fn(engine, s, who || engine.players?.[0] || null);
}
/** Called at the top of every card effect. */
export function ensure(c, slug) { installTrackers(c?.e, slug, c?.self); return c; }

/**
 * A ctx for code that runs outside a card: turn trackers, timers and Power
 * listeners.  It is the engine's own card ctx with no card attached, so every
 * helper in this module behaves identically inside and outside a card effect.
 */
export function trackerCtx(engine, seat = null) {
  if (!engine || !engine.ctxFor) return null;
  // Built AS the seat these trackers belong to, so every helper reached from
  // inside a tracker (piles, counters, statuses) answers for the right Kid.
  const build = () => { const c = engine.ctxFor(null, null, 0); c.card = null; return c; };
  return (seat && engine._asSeat) ? engine._asSeat(seat, build) : build();
}

// ── clamps used by the balance validator ────────────────────────────────────
export const CAP = {
  lives: 9, looseBones: 6, height: 3, plump: 3, plumpMax: 5, globs: 6, eyes: 8, stretch: 3, patch: 6,
};
