/**
 * Mossbit, the Tombstone Turtle.  OWNER: companion-cards.
 * Spec: docs/design/companions/14-mossbit.md
 *
 * Epitaph · Patience · Weathering · Buried Harm
 *
 * A tiny turtle whose shell has become a grave marker. His fantasy is not
 * "turtle equals defence" — it is that he **has time**. He writes events into
 * the future, is paid for letting them arrive on schedule, improves Tricks by
 * refusing to play them, and postpones enemy damage rather than preventing it.
 *
 * ── The four rules that decide whether he works ─────────────────────────────
 *
 * 1. NATURAL RESOLUTION IS THE WHOLE CHARACTER. An Epitaph that runs its
 *    countdown out pays Patience; one you Advance to zero pays nothing. That is
 *    the fundamental conflict — tempo now, or the currency that buys the big
 *    turns later — and it is unaskable unless the timer tells its handler WHY it
 *    fired. The engine's `_fireTimers` already knew (`reason`) and did not pass
 *    it on; it does now.
 *
 * 2. EPITAPHS ARE THE ENGINE'S TIMERS. Countdown, Advance, Delay, Erase, a
 *    per-seat owner and a snapshot the HUD already renders are all there in
 *    `schedule` / `adjustTimer` / `cancelTimer`. Reimplementing them on a
 *    private array would have meant a second clock the screen could not see.
 *
 * 3. BURY IS NOT PREVENTION. Damage taken into Burial becomes Buried Harm, and
 *    at the END of his next turn he loses that much Courage — not as an Attack,
 *    so Guard cannot stop it and it cannot be Buried again. The window is
 *    exact: harm accrues during the enemy turn, he gets one whole turn to do
 *    something about it, and then the bill lands.
 *
 * 4. WEATHERING RESETS IF THE TRICK LEAVES HIS HAND. It is a reward for
 *    refusing to play something, so discarding it has to cost the progress —
 *    otherwise it is an ordinary upgrade counter rather than a plan.
 *
 * ── A note on three keyword names ───────────────────────────────────────────
 * The chapter calls its mechanics Weather and Bury. Both ids are already taken
 * in the shared registry — `weather` is Drizzle's global combat state and `bury`
 * is Pudding's cemetery. Keyword ids are global while Companions are not, so the
 * tooltip would have shown Drizzle's rules on Mossbit's card. His are registered
 * as `weathering` and `buried-harm`, and his rules text says "Weathering" and
 * "Buried Harm" so the printed word matches the tooltip it opens. Stated per
 * CONTRACTS rule 8. Advance / Delay / Erase are deliberately NOT keywords of
 * their own — they are defined inside `[Epitaph]`, which is one good tooltip
 * instead of three thin ones, and avoids a third collision with Drizzle.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'mossbit';
const N = U.N;

const PATIENCE = 'patience';
const INSCRIBED = 'epitaphs';

const BASE_SLOTS = 5;
const MAX_SLOTS = 7;              // Already Written
const BASE_PATIENCE = 3;
const BIG_PATIENCE = 5;           // Longer Memory

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ════════════════════════════════════════════════════════════════════════════
//  Epitaphs
// ════════════════════════════════════════════════════════════════════════════

/** Mossbit's own inscriptions, oldest first — creation order is load-bearing. */
function epitaphs(c) {
  const e = c.e;
  const me = c.self && c.self.id;
  return e.timers.filter(t => t.data && t.data.mossbit && t.data.seat === me);
}
const slotCap = (c) => Math.min(MAX_SLOTS, BASE_SLOTS + (U.mm(c).extraSlots || 0));
const slotsFree = (c) => slotCap(c) - epitaphs(c).length;
const offensive = (c) => epitaphs(c).filter(t => t.data.targetId);

function syncSlotCounter(c) {
  const track = U.res(c, INSCRIBED);
  const now = epitaphs(c).length;
  if (track !== now) U.addRes(c, INSCRIBED, now - track, 0, MAX_SLOTS);
}

/**
 * Write an Epitaph.
 *
 * @param {number} o.turns   printed Countdown, before Set in Stone
 * @param {Object} o.target  the enemy an offensive Epitaph remembers
 * @param {Function} o.run   (ctx, timer) => void, run when it resolves
 * @returns {Object|null} the timer
 */
function inscribe(c, o = {}) {
  if (slotsFree(c) <= 0) return null;
  const s = U.mm(c);
  const turns = Math.max(1, (o.turns ?? 2) + (s.setInStone && !o.exact ? 1 : 0));
  const seat = c.self.id;

  const t = c.schedule({
    turns,
    when: 'playerTurnStart',
    label: o.label || 'Epitaph',
    data: {
      mossbit: true, seat,
      targetId: o.target ? o.target.id : null,
      fixed: !!o.fixed,               // Make It a Tomorrow Problem
      twice: false,                   // Read the Fine Print
      marked: !!o.marked,             // Stone Calendar
      copy: !!o.copy,                 // House Never Forgets
      bonus: s.monumentBonus || 0,    // Monument to Small Things, locked in now
    },
    run: (h) => fireEpitaph(h, o.run),
  });
  syncSlotCounter(c);

  if (s.quietMonument && U.once(c, 'quietMonument')) U.guard(c, s.quietMonument);
  U.fire(c, 'inscribe', { timer: t });
  return t;
}

/**
 * One Epitaph arriving.
 *
 * `h.reason` is 'tick' when the countdown ran out on its own and something else
 * when a Trick forced it. Only the first pays Patience — that is the character.
 */
function fireEpitaph(h, run) {
  const e = h.e;
  const seat = e.actor(h.timer.data.seat) || e.players[0];
  const c = U.trackerCtx(e, seat);
  if (!c) return;
  const s = U.mm(c);
  const natural = h.reason === 'tick';

  // An offensive Epitaph remembers ONE enemy and normally fizzles without it.
  const t = h.timer;
  if (t.data.targetId) {
    const live = e.actor(t.data.targetId);
    if (!live || !live.alive) {
      if (!s.keepTheAppointment) { syncSlotCounter(c); return; }
      const other = U.rpick(c, U.enemies(c));
      if (!other) { syncSlotCounter(c); return; }
      t.data.targetId = other.id;
      if (U.once(c, 'keepTheAppointment')) U.draw(c, 1);
    }
  }

  const times = t.data.twice ? 2 : 1;
  for (let i = 0; i < times; i++) {
    try { run(c, t); } catch (err) { console.error('[mossbit] epitaph threw', err); }
  }

  if (natural) {
    s.naturalThisTurn = (s.naturalThisTurn || 0) + 1;
    s.naturalThisCombat = (s.naturalThisCombat || 0) + 1;
    gainPatience(c, 1 + (t.data.marked ? 1 : 0));
    if (s.mossGrowsAnyway && U.once(c, 'mossGrows')) U.guard(c, s.mossGrowsAnyway);
    if (s.smallMonumentArmed) { s.smallMonumentArmed = false; U.guard(c, 5); }
    if (s.familyPlot && U.once(c, 'familyPlot')) {
      for (const mate of c.teammates()) c.giveBlock(mate, s.familyPlot);
    }
    // Lichen Clock pushes the NEXT one along, and that one earns nothing.
    if (s.lichenClock && U.once(c, 'lichenClock')) {
      const next = epitaphs(c).find(x => x !== t);
      if (next) advance(c, next, 1);
    }
    // House Never Forgets writes a weaker copy of what just happened.
    if (s.houseNeverForgets && !t.data.copy && U.once(c, 'houseNeverForgets') && slotsFree(c) > 0) {
      inscribe(c, {
        turns: 3, exact: true, copy: true, label: t.label,
        target: t.data.targetId ? e.actor(t.data.targetId) : null,
        run,
      });
    }
  }
  syncSlotCounter(c);
  U.fire(c, 'epitaph', { natural, timer: t });
}

/** Advance: forced resolution, and it forfeits the Patience. */
function advance(c, t, n = 1) {
  if (!t || t.data.fixed) return false;
  U.mm(c).advancedThisTurn = true;
  c.adjustTimer(t.id, -n);
  syncSlotCounter(c);
  return true;
}

function delay(c, t, n = 1) {
  if (!t || t.data.fixed) return false;
  c.adjustTimer(t.id, n);
  const s = U.mm(c);
  if (s.noRush && U.once(c, 'noRush')) U.draw(c, 1);
  return true;
}

function erase(c, t) {
  if (!t || t.data.fixed) return false;
  c.e.cancelTimer(t.id);
  syncSlotCounter(c);
  const s = U.mm(c);
  if (s.graveMoss) { U.guard(c, s.graveMoss); reduceHarm(c, 3); }
  return true;
}

const oldest = (c, list) => (list || epitaphs(c))[0] || null;
const advancedThisTurn = (c) => !!U.mm(c).advancedThisTurn;

/** Ask which Epitaph, when there is a real choice to make. */
async function pickEpitaph(c, o = {}) {
  const pool = (o.pool || epitaphs(c)).filter(t => o.includeFixed || !t.data.fixed);
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];
  const picked = await c.choose({
    options: pool.map(t => `${t.label} — ${t.turnsLeft} to go`),
    prompt: o.prompt || 'Which inscription?', optional: !!o.optional,
  });
  return pool[picked[0]] || null;
}

// ════════════════════════════════════════════════════════════════════════════
//  Patience
// ════════════════════════════════════════════════════════════════════════════

const patience = (c) => U.res(c, PATIENCE);
const patienceMax = (c) => (U.mm(c).longerMemory ? BIG_PATIENCE : BASE_PATIENCE);
const atMaxPatience = (c) => patience(c) >= patienceMax(c);

function gainPatience(c, n) {
  if (n <= 0) return 0;
  const s = U.mm(c);
  const room = patienceMax(c) - patience(c);
  if (room <= 0) {
    // Geological Patience turns the overflow into a small payday.
    if (s.geologicalPatience) { U.hitAll(c, s.geologicalPatience); U.guard(c, s.geologicalPatience); }
    return 0;
  }
  const give = Math.min(n, room);
  U.addRes(c, PATIENCE, give, 0, BIG_PATIENCE);
  return give;
}

function spendPatience(c, n) {
  if (n <= 0) return 0;
  if (patience(c) < n) return 0;
  U.addRes(c, PATIENCE, -n, 0, BIG_PATIENCE);
  return n;
}

// ════════════════════════════════════════════════════════════════════════════
//  Buried Harm
// ════════════════════════════════════════════════════════════════════════════

const harm = (c) => U.mm(c).buriedHarm || 0;

/** Open a Burial window for the coming enemy turn. */
function openBurial(c, n) {
  const s = U.mm(c);
  s.burialCap = (s.burialCap || 0) + n;
}
/** Bury everything, not a capped amount (In Case of Emergency…). */
function openBurialAll(c) { U.mm(c).burialAll = true; }

function addHarm(c, n) {
  if (n <= 0) return 0;
  const s = U.mm(c);
  s.buriedHarm = harm(c) + n;
  /* The bill is not due at the end of whatever turn it happened to be Buried
     on — the spec gives him a WHOLE turn to do something about it. Harm taken
     during the enemy phase (the ordinary case: the turn counter is still on his
     last turn) becomes payable at the end of his next one; harm somehow taken
     during his own turn gets the same full turn rather than landing seconds
     later. Without this stamp, Burying something mid-turn pays for itself
     immediately and the mechanic is just damage with extra steps. */
  s.harmDue = Math.max(s.harmDue || 0, U.turn(c) + 1);
  return n;
}

/** @returns {number} how much was actually taken off. */
function reduceHarm(c, n) {
  if (n <= 0) return 0;
  const s = U.mm(c);
  const gone = Math.min(n, harm(c));
  s.buriedHarm = harm(c) - gone;
  if (gone > 0 && harm(c) === 0 && s.monumentToSmallThings) {
    s.monumentBonus = (s.monumentBonus || 0) + 2;
  }
  return gone;
}

// ════════════════════════════════════════════════════════════════════════════
//  Weathering
// ════════════════════════════════════════════════════════════════════════════

const weatherLeft = (c, k) => (k && k.meta ? (k.meta.weatherLeft ?? null) : null);
const isWeathered = (c, k) => !!(k && k.meta && k.meta.weathered);

/** Declare a Trick's printed Weather. Called the first time it is seen in hand. */
function seedWeather(k, printed) {
  if (!k || !k.meta) return;
  if (k.meta.weathered) return;
  if (k.meta.weatherLeft == null) k.meta.weatherLeft = printed;
}

function tickWeather(c, k) {
  if (!k || isWeathered(c, k)) return false;
  const left = weatherLeft(c, k);
  if (left == null) return false;
  k.meta.weatherLeft = Math.max(0, left - 1);
  if (k.meta.weatherLeft === 0) return makeWeathered(c, k);
  return false;
}

function makeWeathered(c, k) {
  if (!k || isWeathered(c, k)) return false;
  k.meta.weathered = true;
  k.meta.weatherLeft = 0;
  const s = U.mm(c);
  if (s.smallMonument) s.smallMonumentArmed = true;
  U.fire(c, 'weathered', { card: k });
  return true;
}

/** The printed Weather of every Trick that has one, by card id. */
const WEATHER_PRINTED = new Map();
const weathers = (id, n) => { WEATHER_PRINTED.set(id, n); return id; };
const printedWeather = (k) => WEATHER_PRINTED.get(k && (k.def ? k.def.id : k.id));

const power = (c, id, install) => {
  const s = U.mm(c);
  U.applySelf(c, id, 1);
  if (!s['pw:' + id]) { s['pw:' + id] = true; install(c, s); }
};

// ── tracks, declared at the capacity he actually has ────────────────────────
const patienceTrack = (max, start = 0) => ({
  id: PATIENCE, name: 'Patience', icon: 'patience', min: 0, max, start,
  desc: 'Earned when an Epitaph runs its own countdown out. Advancing one to zero pays nothing.',
  states: [{ at: 0, label: 'Restless' }, { from: max, to: max, label: 'Patient' }],
});
const slotTrack = (max, start = 0) => ({
  id: INSCRIBED, name: 'Epitaphs', icon: 'epitaph', min: 0, max, start,
  desc: 'Inscriptions waiting to happen. Five slots; a full shell cannot take another.',
  states: [{ at: 0, label: 'Blank' }, { from: max, to: max, label: 'Full' }],
});

// ════════════════════════════════════════════════════════════════════════════
//  per-combat bookkeeping
// ════════════════════════════════════════════════════════════════════════════
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [patienceTrack(BASE_PATIENCE), slotTrack(BASE_SLOTS)]);
  const fake = () => U.trackerCtx(e, seat);

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    st.advancedThisTurn = false;
    st.naturalThisTurn = 0;
    st.hereEventuallyUsed = false;
    st.noGuardThisTurn = !!st.noGuardNextTurn;
    st.noGuardNextTurn = false;

    /* Weathering Tricks sealed by Weatherproofing or Do Not Disturb were made
       unplayable for that turn. Releasing them here rather than on a timer keeps
       "cannot be played THIS turn" exactly one turn long — and it walks every
       pile, because a Trick that finished Weathering is no longer auto-retained
       and will have been discarded at the end of the turn that sealed it. A
       hand-only sweep left it permanently unplayable in the discard pile. */
    for (const k of [...U.cardsIn(c, 'hand'), ...U.cardsIn(c, 'discard'), ...U.cardsIn(c, 'draw')]) {
      if (k.meta && k.meta.sealedTurn != null && k.meta.sealedTurn < U.turn(c)) {
        k.meta.sealedTurn = null;
        k.unplayable = false;
      }
    }

    if (st.takeTheHitLater && harm(c) > 0) { U.draw(c, st.takeTheHitLater); st.takeTheHitLater = 0; }

    /* A Very Long Nap: a second SCHEDULED tick, so both count as maturing and
       both pay Patience. Passing 'tick' as the reason is what makes that true —
       it is the same word `_tickTimers` uses. */
    if (st.doubleTickNextTurn) {
      st.doubleTickNextTurn = false;
      for (const t of epitaphs(c).slice()) c.adjustTimer(t.id, -1, 'tick');
    }

    /* Everybody Gets Home Eventually: each friend may buy some of the debt down.
       Asked of THEM through the broker, never decided here. */
    if (st.debtRelief) {
      const relief = st.debtRelief;
      st.debtRelief = null;
      for (const id of relief.from) {
        const mate = c.party().find(p => p.id === id);
        if (!mate || mate.energy < 1) continue;
        (async () => {
          const yes = await c.askAllyOption(mate, {
            options: ['Spend 1 Nerve to help Mossbit', 'Keep the Nerve'],
            prompt: 'Mossbit is carrying your damage.',
          });
          if (yes && String(yes).startsWith('Spend')) {
            c.giveEnergy(mate, -1);
            reduceHarm(c, relief.amount);
          }
        })();
      }
    }

    /* Cemetery Shift writes the bill into the future rather than paying it. */
    if (st.cemeteryShift && harm(c) > 0 && slotsFree(c) > 0) {
      const amount = Math.max(4, Math.round(harm(c) * 0.8));
      const t = U.rpick(c, U.enemies(c));
      if (t) inscribe(c, { turns: 2, target: t, label: 'Cemetery Shift', run: (x, tm) => hitEpitaph(x, tm, amount) });
    }
    syncSlotCounter(c);
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const st = U.mm(c);

    /* Weathering: an unweathered Weather Trick left in hand is RETAINED and
       loses one. Retaining is the cost — it is why Weather eats hand space. */
    for (const k of U.cardsIn(c, 'hand')) {
      const printed = printedWeather(k);
      if (printed == null) continue;
      seedWeather(k, printed);
      if (isWeathered(c, k)) continue;
      U.retain(c, k, 'turn');
      tickWeather(c, k);
    }

    if (st.mansionMoves && U.playedThisTurn(c) <= 3) {
      const k = U.cardsIn(c, 'hand').find(x => printedWeather(x) != null && !isWeathered(c, x));
      if (k) tickWeather(c, k);
      const old = oldest(c);
      if (old) delay(c, old, 1);
    }

    /* The bill. Not Attack damage: Guard cannot stop it and it cannot be
       Buried again. He has had a whole turn to do something about it. */
    const owed = harm(c);
    if (owed > 0 && U.turn(c) >= (st.harmDue || 0)) {
      if (st.deathCanWait && !st.deathUsed && owed >= c.self.hp) {
        st.deathUsed = true;
        st.buriedHarm = 0;
        for (const t of epitaphs(c).slice()) c.adjustTimer(t.id, -t.turnsLeft, 'death-can-wait');
        U.setRes(c, PATIENCE, patienceMax(c), 0, BIG_PATIENCE);
      } else {
        st.buriedHarm = 0;
        U.bleed(c, owed);
      }
    }
  }, seat);

  /* Burial. `onIncomingHit` is a VOID hook with a mutable payload — read
     `h.amount`, then call `h.setAmount(n)`. Writing it as a value reducer makes
     `h` undefined and it throws on its first line. */
  e.hooks.add('onIncomingHit', (h) => {
    if (!h || h.kind !== 'attack') return;
    const c = fake();
    const st = U.mm(c);
    const amount = h.amount | 0;
    if (amount <= 0) return;

    /* Carry Some of That / Everybody Gets Home: a friend's damage becomes HIS
       Buried Harm, which is the point — it moves their survival problem onto his
       timeline rather than making them tougher. */
    if (h.defender !== seat) {
      const lent = (st.carryFor || []).find(x => x.seatId === h.defender.id && x.left > 0);
      if (!lent) return;
      const taken = Math.min(lent.left, amount);
      lent.left -= taken;
      addHarm(c, taken);
      h.setAmount(amount - taken);
      return;
    }

    if (st.burialAll) {
      addHarm(c, amount);
      h.setAmount(0);
      return;
    }
    const cap = st.burialCap || 0;
    if (cap <= 0) return;
    const taken = Math.min(cap, amount);
    /* Emergency Burial covers ONE hit however big; every other Bury is a
       capacity that several hits chip away at. */
    st.burialCap = st.burialOneHit ? 0 : cap - taken;
    st.burialOneHit = false;
    addHarm(c, taken);
    h.setAmount(amount - taken);
  }, { owner: seat });

  /* A Burial window is for ONE enemy turn. Anything unused expires with it. */
  e.on('phase', (ev) => {
    if (!ev || ev.phase !== 'enemyPhaseEnd') return;
    const c = fake();
    const st = U.mm(c);
    st.burialCap = 0;
    st.burialAll = false;
    st.burialOneHit = false;
    st.carryFor = [];
  });

  /* Weathered Beyond Recognition prices the two halves of Weather apart. */
  e.hooks.add('modifyCardCost', (cost, h) => {
    const c = fake();
    const st = U.mm(c);
    if (!st.weatheredBeyond) return cost;
    const k = h && h.card;
    if (!k || printedWeather(k) == null) return cost;
    return isWeathered(c, k) ? Math.max(0, cost - 1) : cost + 1;
  }, { owner: seat });

  /* During your following turn you cannot gain Guard (In Case of Emergency…). */
  e.hooks.add('modifyBlockGain', (amt, h) => {
    const c = fake();
    return U.mm(c).noGuardThisTurn ? 0 : amt;
  }, { owner: seat });

  /* Here Eventually climbs back out of the discard pile when an inscription
     lands. It reads the RUNTIME card, so it is looked up rather than trusted
     from a snapshot. */
  U.onHook('epitaph', 'mossbit/here-eventually', () => {});
  e.on('timer:fire', () => {
    const c = fake();
    const st = U.mm(c);
    if (!st.hereEventually || st.hereEventuallyUsed) return;
    const k = U.cardsIn(c, 'discard').find(x => (x.def ? x.def.id : x.id) === 'mossbit/here-eventually');
    if (!k) return;
    st.hereEventuallyUsed = true;
    U.toHand(c, k);
    U.costSet(c, k, 0, 'turn');
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('inscribe', 'mossbit/quiet-monument', () => {});
U.onHook('epitaph', 'mossbit/moss-grows-anyway', () => {});
U.onHook('weathered', 'mossbit/small-monument', () => {});

// ── shared epitaph effects ──────────────────────────────────────────────────
function hitEpitaph(c, t, amount) {
  const target = t.data.targetId ? c.e.actor(t.data.targetId) : null;
  const amt = amount + (t.data.bonus || 0);
  if (target && target.alive) U.hitAt(c, target, amt);
  else U.hitRandom(c, amt);
}
const guardEpitaph = (c, t, amount) => U.guard(c, amount + (t.data.bonus || 0));

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'mossbit/small-headbutt', name: 'Small Headbutt', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, text: 'Deal {d} damage.',
    flavor: 'It takes a while to arrive and it is not sorry.',
    nums: { d: 6 }, effect: eff((c) => U.hit(c, N(c).d)), upgrade: { nums: { d: 9 } },
  },
  {
    id: 'mossbit/pull-in', name: 'Pull In', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, text: 'Gain {b} Guard.',
    flavor: 'Everything important is now inside the stone.',
    nums: { b: 6 }, effect: eff((c) => U.guard(c, N(c).b)), upgrade: { nums: { b: 9 } },
  },
  {
    id: 'mossbit/written-in-stone', name: 'Written in Stone', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Create [Epitaph] {n} on an enemy: deal {d} damage.',
    flavor: 'It is going to happen. It says so.',
    nums: { n: 2, d: 10 },
    effect: eff((c) => { const t = c.target; inscribe(c, { turns: N(c).n, target: t, label: 'Written in Stone', run: (x, tm) => hitEpitaph(x, tm, N(c).d) }); }),
    upgrade: { nums: { n: 2, d: 15 } },
  },
  {
    id: 'mossbit/not-yet', name: 'Not Yet', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['buried-harm'],
    text: 'Postpone the next {n} Attack damage as [Buried Harm].',
    flavor: 'Later. Definitely later.',
    nums: { n: 8 },
    effect: eff((c) => openBurial(c, N(c).n)),
    upgrade: { nums: { n: 13 } },
  },
  {
    id: weathers('mossbit/sun-on-the-shell', 1), name: 'Sun on the Shell', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['weathering'],
    text: '[Weathering] {w}. Gain {b} Guard. Weathered: gain {m0} Guard and draw {c1}.',
    flavor: 'Twenty warm minutes on an old stone.',
    nums: { w: 1, b: 5, m0: 9, c1: 1 },
    effect: eff((c) => {
      if (isWeathered(c, c.card)) { U.guard(c, N(c).m0); U.draw(c, N(c).c1); }
      else U.guard(c, N(c).b);
    }),
    upgrade: { nums: { w: 1, b: 8, m0: 13, c1: 1 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'mossbit/pebble-bonk', name: 'Pebble Bonk', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. With an [Epitaph] waiting, gain {b} Guard.',
    flavor: 'Small. Round. Weirdly personal.',
    nums: { d: 7, b: 5 },
    effect: eff((c) => { U.hit(c, N(c).d); if (epitaphs(c).length) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 10, b: 7 } },
  },
  {
    id: 'mossbit/date-stamp', name: 'Date Stamp', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. Create [Epitaph] {n} on it: deal {m0} damage.',
    flavor: 'Now it has a date on it.',
    nums: { d: 6, n: 2, m0: 6 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      inscribe(c, { turns: N(c).n, target: t, label: 'Date Stamp', run: (x, tm) => hitEpitaph(x, tm, N(c).m0) });
    }),
    upgrade: { nums: { d: 9, n: 2, m0: 9 } },
  },
  {
    id: 'mossbit/eventually-wham', name: 'Eventually, Wham', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage, or {m0} more if an [Epitaph] resolved on its own this turn.',
    flavor: 'It has been coming since Tuesday.',
    nums: { d: 12, m0: 5 },
    effect: eff((c) => U.hit(c, N(c).d + (U.mm(c).naturalThisTurn ? N(c).m0 : 0))),
    upgrade: { nums: { d: 16, m0: 7 } },
  },
  {
    id: 'mossbit/small-but-permanent', name: 'Small but Permanent', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage, or {m0} more if one of your [Epitaph]s on it is due next turn.',
    flavor: 'Nothing about this is going away.',
    nums: { d: 6, m0: 4 },
    effect: eff((c) => {
      const t = c.target;
      const due = t && offensive(c).some(x => x.data.targetId === t.id && x.turnsLeft <= 1);
      U.hit(c, N(c).d + (due ? N(c).m0 : 0));
    }),
    upgrade: { nums: { d: 9, m0: 6 } },
  },
  {
    id: 'mossbit/headstone-nudge', name: 'Headstone Nudge', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage, or only {w} if you have hurried an [Epitaph] along this turn.',
    flavor: 'A nudge. That is all it ever is.',
    nums: { d: 10, w: 6 },
    effect: eff((c) => U.hit(c, advancedThisTurn(c) ? N(c).w : N(c).d)),
    upgrade: { nums: { d: 14, w: 8 } },
  },
  {
    id: 'mossbit/burdened-bash', name: 'Burdened Bash', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['buried-harm'],
    text: 'Deal {d} damage plus your [Buried Harm]. Then take {n} off it.',
    flavor: 'He is carrying it. He may as well swing it.',
    nums: { d: 5, m0: 6, n: 4 },
    balance: { scalesWith: 'Buried Harm' },
    effect: eff((c) => { U.hit(c, N(c).d + harm(c)); reduceHarm(c, N(c).n); }),
    upgrade: { nums: { d: 8, m0: 6, n: 6 } },
  },
  {
    id: 'mossbit/shell-rattle', name: 'Shell Rattle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['patience'],
    text: 'Deal {d} damage to all enemies. You may spend {n} [Patience] to do it again.',
    flavor: 'Something loose in there. Has been for years.',
    nums: { d: 5, n: 1, hits: 2 },
    effect: eff((c) => { U.hitAll(c, N(c).d); if (spendPatience(c, N(c).n)) U.hitAll(c, N(c).d); }),
    upgrade: { nums: { d: 7, n: 1, hits: 2 } },
  },
  {
    id: 'mossbit/final-tap', name: 'Final Tap', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['epitaph', 'vanish'],
    text: 'Deal {d} damage, or {m0} more if an [Epitaph] resolved this turn. [Vanish].',
    flavor: 'One more, for the record.',
    nums: { d: 4, m0: 4 },
    effect: eff((c) => U.hit(c, N(c).d + (U.mm(c).naturalThisTurn ? N(c).m0 : 0))),
    upgrade: { nums: { d: 6, m0: 6 } },
  },
  {
    id: 'mossbit/carve-and-carry', name: 'Carve and Carry', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'Gain {b} Guard. Create [Epitaph] {n}: gain {m0} Guard.',
    flavor: 'Chip, chip, walk about, chip.',
    nums: { b: 5, n: 2, m0: 10 },
    effect: eff((c) => { U.guard(c, N(c).b); inscribe(c, { turns: N(c).n, label: 'Carve and Carry', run: (x, tm) => guardEpitaph(x, tm, N(c).m0) }); }),
    upgrade: { nums: { b: 8, n: 2, m0: 15 } },
  },
  {
    id: 'mossbit/put-it-off', name: 'Put It Off', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['buried-harm'],
    /* DEVIATION (CONTRACTS rule 8): the doc prints this with the identical line
       to the Basic Not Yet, which the cards suite correctly reads as one card at
       two rarities. The draw is what earns it the slot and it points where the
       Common pool's own stated job points — Put It Off is meant to TEACH that
       postponement is not prevention, and a Trick to spend the bought turn on is
       exactly that lesson made playable. */
    text: 'Postpone the next {n} Attack damage as [Buried Harm], then draw {c1}.',
    flavor: 'Tomorrow is famously large.',
    nums: { n: 14, c1: 1 },
    effect: eff((c) => { openBurial(c, N(c).n); U.draw(c, N(c).c1); }),
    upgrade: { nums: { n: 20, c1: 1 } },
  },
  {
    id: 'mossbit/chip-the-clock', name: 'Chip the Clock', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'Hurry an [Epitaph] along by 1. If that did not resolve it, gain {b} Guard.',
    flavor: 'It goes faster if you chip at it.',
    nums: { b: 9 },
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Hurry which inscription?' });
      if (!t) return;
      const before = t.turnsLeft;
      advance(c, t, 1);
      if (before > 1) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { b: 13 } },
  },
  {
    id: 'mossbit/one-more-minute', name: 'One More Minute', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['epitaph'],
    text: 'Put an [Epitaph] back by 1. Gain {b} Guard.',
    flavor: 'Just one. Then another one.',
    nums: { b: 5 },
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Put which inscription back?' });
      if (t) delay(c, t, 1);
      U.guard(c, N(c).b);
    }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'mossbit/scratch-it-out', name: 'Scratch It Out', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['epitaph'],
    text: 'Erase an [Epitaph]. Draw {c1}, and {m0} more if it had 3 or longer to go.',
    flavor: 'It was not going to be true anyway.',
    nums: { c1: 1, m0: 1 },
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Erase which inscription?' });
      if (!t) return;
      const far = t.turnsLeft >= 3;
      erase(c, t);
      U.draw(c, N(c).c1 + (far ? N(c).m0 : 0));
    }),
    upgrade: { nums: { c1: 2, m0: 1 } },
  },
  {
    id: weathers('mossbit/old-reliable', 1), name: 'Old Reliable', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weathering'],
    text: '[Weathering] {w}. Gain {b} Guard. Weathered: gain {m0} instead.',
    flavor: 'It has never once let him down.',
    nums: { w: 1, b: 5, m0: 13 },
    effect: eff((c) => U.guard(c, isWeathered(c, c.card) ? N(c).m0 : N(c).b)),
    upgrade: { nums: { w: 1, b: 8, m0: 18 } },
  },
  {
    id: weathers('mossbit/warm-flagstone', 2), name: 'Warm Flagstone', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weathering', 'patience'],
    text: '[Weathering] {w}. Gain {b} Guard. Weathered: gain {m0} Guard and {n} [Patience].',
    flavor: 'The one by the door. Obviously.',
    nums: { w: 2, b: 5, m0: 10, n: 1 },
    effect: eff((c) => {
      if (isWeathered(c, c.card)) { U.guard(c, N(c).m0); gainPatience(c, N(c).n); }
      else U.guard(c, N(c).b);
    }),
    upgrade: { nums: { w: 2, b: 8, m0: 14, n: 1 } },
  },
  {
    id: weathers('mossbit/let-it-settle', 1), name: 'Let It Settle', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weathering', 'epitaph'],
    text: '[Weathering] {w}. Draw {c1}. Weathered: draw {m0} and you may put an [Epitaph] back by 1.',
    flavor: 'Everything finds its level eventually.',
    nums: { w: 1, c1: 1, m0: 2 },
    effect: eff(async (c) => {
      if (!isWeathered(c, c.card)) { U.draw(c, N(c).c1); return; }
      U.draw(c, N(c).m0);
      const t = await pickEpitaph(c, { optional: true, prompt: 'Put which inscription back?' });
      if (t) delay(c, t, 1);
    }),
    upgrade: { nums: { w: 1, c1: 2, m0: 3 } },
  },
  {
    id: 'mossbit/steady-little-heart', name: 'Steady Little Heart', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['buried-harm'],
    text: 'Take {n} off your [Buried Harm]. If that clears it, gain {b} Guard.',
    flavor: 'Thump. Thump. Thump. Unhurried.',
    nums: { n: 10, b: 5 },
    effect: eff((c) => { const gone = reduceHarm(c, N(c).n); if (gone > 0 && harm(c) === 0) U.guard(c, N(c).b); }),
    upgrade: { nums: { n: 15, b: 8 } },
  },
  {
    id: 'mossbit/room-on-the-shell', name: 'Room on the Shell', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'With 2 or fewer [Epitaph]s, gain {b} Guard. Otherwise you may erase one for {m0}.',
    flavor: 'There is only so much shell.',
    nums: { b: 10, m0: 16 },
    effect: eff(async (c) => {
      if (epitaphs(c).length <= 2) { U.guard(c, N(c).b); return; }
      const t = await pickEpitaph(c, { optional: true, prompt: 'Erase which inscription?' });
      if (t) { erase(c, t); U.guard(c, N(c).m0); }
    }),
    upgrade: { nums: { b: 14, m0: 22 } },
  },
  {
    id: 'mossbit/quiet-monument', name: 'Quiet Monument', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'The first [Epitaph] you create each turn also gives {b} Guard right away.',
    flavor: 'Nobody reads it. It does not mind.',
    nums: { b: 5 },
    effect: eff((c) => power(c, 'mossbit/quiet-monument', (x, s) => { s.quietMonument = N(x).b; })),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'mossbit/moss-grows-anyway', name: 'Moss Grows Anyway', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'The first [Epitaph] that resolves on its own each turn also gives {b} Guard.',
    flavor: 'It does not need permission and it never has.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'mossbit/moss-grows-anyway', (x, s) => { s.mossGrowsAnyway = N(x).b; })),
    upgrade: { nums: { b: 10 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'mossbit/pallbearer-pace', name: 'Pallbearer Pace', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['patience', 'epitaph'],
    text: 'Deal {d} damage. You may spend {n} [Patience] to create [Epitaph] 1 on it: deal {m0}.',
    flavor: 'Slow, even, and absolutely not going to trip.',
    nums: { d: 10, n: 1, m0: 10 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (spendPatience(c, N(c).n)) {
        inscribe(c, { turns: 1, exact: true, target: t, label: 'Pallbearer Pace', run: (x, tm) => hitEpitaph(x, tm, N(c).m0) });
      }
    }),
    upgrade: { nums: { d: 14, n: 1, m0: 14 } },
  },
  {
    id: 'mossbit/three-knocks', name: 'Three Knocks on Stone', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage, and once more for each [Epitaph] that resolved this turn, up to three.',
    flavor: 'Knock. Knock. Knock. Somebody always answers.',
    nums: { d: 5, hits: 4 },
    balance: { scalesWith: 'Epitaphs resolved this turn' },
    effect: eff((c) => U.hitN(c, N(c).d, 1 + Math.min(3, U.mm(c).naturalThisTurn || 0))),
    upgrade: { nums: { d: 7, hits: 4 } },
  },
  {
    id: 'mossbit/funeral-procession', name: 'Funeral Procession', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['epitaph'],
    text: 'Deal {d} damage to all enemies. Anything one of your [Epitaph]s is aimed at takes {m0} more.',
    flavor: 'Everyone walks at the same speed. His speed.',
    nums: { d: 8, m0: 8 },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      const marked = new Set(offensive(c).map(t => t.data.targetId));
      for (const en of U.enemies(c)) if (marked.has(en.id)) U.hitAt(c, en, N(c).m0);
    }),
    upgrade: { nums: { d: 11, m0: 11 } },
  },
  {
    id: 'mossbit/debt-collector', name: 'Debt Collector', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['buried-harm'],
    text: 'Take up to half your [Buried Harm] off, and deal that much damage.',
    flavor: 'Paying it forward. At something.',
    nums: { d: 6 },
    balance: { scalesWith: 'Buried Harm' },
    effect: eff((c) => {
      const half = Math.floor(harm(c) / 2);
      const gone = reduceHarm(c, half);
      U.hit(c, Math.max(N(c).d, gone));
    }),
    upgrade: { nums: { d: 9 } },
  },
  {
    id: weathers('mossbit/stone-age-swipe', 2), name: 'Stone Age Swipe', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['weathering', 'epitaph'],
    text: '[Weathering] {w}. Deal {d} damage. Weathered: deal {m0} and create [Epitaph] 1 on it for {m1}.',
    flavor: 'The oldest move there is.',
    nums: { w: 2, d: 6, m0: 12, m1: 6 },
    effect: eff((c) => {
      const t = c.target;
      if (!isWeathered(c, c.card)) { U.hit(c, N(c).d); return; }
      U.hit(c, N(c).m0);
      inscribe(c, { turns: 1, exact: true, target: t, label: 'Stone Age Swipe', run: (x, tm) => hitEpitaph(x, tm, N(c).m1) });
    }),
    upgrade: { nums: { w: 2, d: 9, m0: 17, m1: 9 } },
  },
  {
    id: 'mossbit/the-long-way-around', name: 'The Long Way Around', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. If you have hurried nothing this turn, create [Epitaph] {n} on it: deal {m0}.',
    flavor: 'Round by the greenhouse. It is nicer.',
    nums: { d: 12, n: 2, m0: 12 },
    effect: eff((c) => {
      const t = c.target;
      const patient = !advancedThisTurn(c);
      U.hit(c, N(c).d);
      if (patient) inscribe(c, { turns: N(c).n, target: t, label: 'The Long Way Around', run: (x, tm) => hitEpitaph(x, tm, N(c).m0) });
    }),
    upgrade: { nums: { d: 16, n: 2, m0: 16 } },
  },
  {
    id: 'mossbit/carapace-rebound', name: 'Carapace Rebound', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['buried-harm'],
    text: 'Deal {d} damage. With [Buried Harm] on you, gain {b} Guard.',
    flavor: 'It has to go somewhere and it went outward.',
    nums: { d: 10, b: 9 },
    effect: eff((c) => { U.hit(c, N(c).d); if (harm(c) > 0) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 14, b: 13 } },
  },
  {
    id: 'mossbit/due-notice', name: 'Due Notice', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. Costs 1 less while an [Epitaph] is due next turn.',
    flavor: 'You were told. It was carved and everything.',
    nums: { d: 16 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (epitaphs(c).some(t => t.turnsLeft <= 1) ? 1 : 2),
    upgrade: { nums: { d: 21 } },
  },
  {
    id: 'mossbit/tombstone-dominoes', name: 'Tombstone Dominoes', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. Hurry your oldest aimed [Epitaph]; if it resolves, hurry the next one too.',
    flavor: 'One goes. Then they all go.',
    nums: { d: 12 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const list = offensive(c);
      const first = list[0];
      if (!first) return;
      const before = first.turnsLeft;
      advance(c, first, 1);
      if (before <= 1) { const next = offensive(c)[0]; if (next) advance(c, next, 1); }
    }),
    upgrade: { nums: { d: 16 } },
  },
  {
    id: 'mossbit/slow-clap', name: 'Slow Clap', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, keywords: ['patience'],
    text: 'Deal {d} damage. At full [Patience] you may spend {n} to take this back, once a turn.',
    flavor: 'Clap. … Clap. … Clap.',
    nums: { d: 6, n: 1 },
    effect: eff((c) => {
      const full = atMaxPatience(c);
      U.hit(c, N(c).d);
      if (full && U.once(c, 'slowClap') && spendPatience(c, N(c).n)) U.returnSelf(c);
    }),
    upgrade: { nums: { d: 8, n: 1 } },
  },
  {
    id: 'mossbit/this-is-my-spot', name: 'This Is My Spot', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. With no [Epitaph]s at all, create [Epitaph] {n} on it: deal {m0}.',
    flavor: 'He was here first. He is always here first.',
    nums: { d: 10, n: 2, m0: 10 },
    effect: eff((c) => {
      const t = c.target;
      const empty = epitaphs(c).length === 0;
      U.hit(c, N(c).d);
      if (empty) inscribe(c, { turns: N(c).n, target: t, label: 'This Is My Spot', run: (x, tm) => hitEpitaph(x, tm, N(c).m0) });
    }),
    upgrade: { nums: { d: 14, n: 2, m0: 14 } },
  },
  {
    id: 'mossbit/namesake-crush', name: 'Namesake Crush', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 3, target: ENEMY, keywords: ['patience'],
    text: 'Deal {d} damage. Spend any [Patience]; each one adds {m0}.',
    flavor: 'The name on the shell is not his. He is using it anyway.',
    nums: { d: 20, m0: 12 },
    balance: { scalesWith: 'Patience spent' },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      let n = 0;
      while (spendPatience(c, 1)) n++;
      for (let i = 0; i < n; i++) U.hitAt(c, t, 6);
    }),
    upgrade: { nums: { d: 27, m0: 16 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'mossbit/deep-inscription', name: 'Deep Inscription', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['epitaph'],
    text: 'Create [Epitaph] {n}: draw {c1} and gain {e} Nerve that turn.',
    flavor: 'Properly deep. It will still be legible in a century.',
    nums: { n: 3, c1: 3, e: 1 },
    effect: eff((c) => inscribe(c, {
      turns: N(c).n, label: 'Deep Inscription',
      run: (x) => { U.draw(x, N(c).c1); U.energy(x, N(c).e); },
    })),
    upgrade: { nums: { n: 3, c1: 4, e: 2 } },
  },
  {
    id: 'mossbit/recut-the-date', name: 'Recut the Date', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'Set an [Epitaph] to 2. Later than it was: draw {c1}. Sooner: gain {b} Guard.',
    flavor: 'The mason got it wrong. Twice.',
    nums: { c1: 1, b: 9 },
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Recut which inscription?' });
      if (!t) return;
      const before = t.turnsLeft;
      if (before < 2) { delay(c, t, 2 - before); U.draw(c, N(c).c1); }
      else if (before > 2) { advance(c, t, before - 2); U.guard(c, N(c).b); }
    }),
    upgrade: { nums: { c1: 2, b: 13 } },
  },
  {
    id: 'mossbit/make-space', name: 'Make Space', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'Erase up to {n} [Epitaph]s. Draw {c1} and gain {b} Guard for each.',
    flavor: 'Some of them were never going to come true.',
    nums: { n: 2, c1: 1, b: 5 },
    effect: eff(async (c) => {
      for (let i = 0; i < N(c).n; i++) {
        const t = await pickEpitaph(c, { optional: true, prompt: 'Erase which inscription?' });
        if (!t) break;
        erase(c, t);
        U.draw(c, N(c).c1);
        U.guard(c, N(c).b);
      }
    }),
    upgrade: { nums: { n: 3, c1: 1, b: 7 } },
  },
  {
    id: 'mossbit/swap-the-dates', name: 'Swap the Dates', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['epitaph'],
    text: 'Exchange the countdowns of two [Epitaph]s.',
    flavor: 'Nobody will ever know.',
    nums: {},
    effect: eff(async (c) => {
      const a = await pickEpitaph(c, { prompt: 'Swap which inscription…' });
      if (!a) return;
      const b = await pickEpitaph(c, { pool: epitaphs(c).filter(t => t !== a), prompt: '…with which?' });
      if (!b) return;
      const av = a.turnsLeft, bv = b.turnsLeft;
      c.adjustTimer(a.id, bv - av, 'swap');
      c.adjustTimer(b.id, av - bv, 'swap');
      syncSlotCounter(c);
    }),
    upgrade: { text: 'Exchange the countdowns of two [Epitaph]s, then draw a Trick.' },
  },
  {
    id: 'mossbit/take-the-hit-later', name: 'Take the Hit Later', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['buried-harm'],
    text: 'Postpone the next {n} Attack damage as [Buried Harm]. Start next turn carrying some: draw {c1}.',
    flavor: 'A decision he can make again in the morning.',
    nums: { n: 24, c1: 2 },
    effect: eff((c) => { openBurial(c, N(c).n); U.mm(c).takeTheHitLater = N(c).c1; }),
    upgrade: { nums: { n: 32, c1: 2 } },
  },
  {
    id: 'mossbit/weight-to-words', name: 'Weight to Words', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['buried-harm', 'epitaph'],
    text: 'Take {n} off your [Buried Harm]. Create [Epitaph] 2 on an enemy dealing that much.',
    flavor: 'Weight is weight. It may as well be theirs.',
    nums: { n: 12 },
    balance: { scalesWith: 'Buried Harm removed' },
    effect: eff((c) => {
      const t = c.target;
      const gone = reduceHarm(c, N(c).n);
      if (!gone) return;
      inscribe(c, { turns: 2, target: t, label: 'Weight to Words', run: (x, tm) => hitEpitaph(x, tm, gone) });
    }),
    upgrade: { nums: { n: 18 } },
  },
  {
    id: 'mossbit/carry-it-properly', name: 'Carry It Properly', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['buried-harm'],
    text: 'With [Buried Harm]: draw {c1}, discard one, then take {n} off it.',
    flavor: 'Knees, not back. He has been told.',
    nums: { c1: 2, n: 10 },
    effect: eff((c) => {
      if (harm(c) <= 0) return;
      U.draw(c, N(c).c1);
      c.discard(1, { choose: true });
      reduceHarm(c, N(c).n);
    }),
    upgrade: { nums: { c1: 3, n: 14 } },
  },
  {
    id: 'mossbit/weatherproofing', name: 'Weatherproofing', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weathering'],
    text: 'Take 1 off the [Weathering] of up to {n} Tricks in hand. Anything finishing cannot be played this turn.',
    flavor: 'A tarpaulin, essentially.',
    nums: { n: 2 },
    effect: eff((c) => {
      let done = 0;
      for (const k of U.handOthers(c)) {
        if (done >= N(c).n) break;
        const printed = printedWeather(k);
        if (printed == null || isWeathered(c, k)) continue;
        seedWeather(k, printed);
        /* "Tricks that become Weathered this way cannot be played this turn" —
           the restriction is the whole reason Weatherproofing is not simply a
           free upgrade, so it is enforced, not printed. */
        if (tickWeather(c, k)) { k.meta.sealedTurn = U.turn(c); k.unplayable = true; }
        done++;
      }
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: weathers('mossbit/windowsill-nap', 2), name: 'Windowsill Nap', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weathering'],
    text: '[Weathering] {w}. Draw {c1}. Weathered: draw {m0}, then discard one.',
    flavor: 'The good windowsill. South facing.',
    nums: { w: 2, c1: 1, m0: 3 },
    effect: eff((c) => {
      if (!isWeathered(c, c.card)) { U.draw(c, N(c).c1); return; }
      U.draw(c, N(c).m0);
      c.discard(1, { choose: true });
    }),
    upgrade: { nums: { w: 2, c1: 2, m0: 4 } },
  },
  {
    id: weathers('mossbit/fossil-snack', 1), name: 'Fossil Snack', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weathering', 'buried-harm', 'patience'],
    text: '[Weathering] {w}. Gain {b} Guard. Weathered: also take {n} off [Buried Harm] and gain {p} [Patience].',
    flavor: 'Older than the house. Crunchier than expected.',
    nums: { w: 1, b: 9, n: 10, p: 1 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      if (!isWeathered(c, c.card)) return;
      reduceHarm(c, N(c).n);
      gainPatience(c, N(c).p);
    }),
    upgrade: { nums: { w: 1, b: 13, n: 15, p: 1 } },
  },
  {
    id: 'mossbit/patient-hands', name: 'Patient Hands', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patience', 'epitaph'],
    text: 'Draw {c1}, then discard one — unless you are at full [Patience] and have hurried nothing.',
    flavor: 'No sudden movements. There never are.',
    nums: { c1: 2 },
    effect: eff((c) => {
      const clean = atMaxPatience(c) && !advancedThisTurn(c);
      U.draw(c, N(c).c1);
      if (!clean) c.discard(1, { choose: true });
    }),
    upgrade: { nums: { c1: 3 } },
  },
  {
    id: 'mossbit/quiet-grave', name: 'Quiet Grave', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'Create [Epitaph] {n}: gain {b} Guard. Resolving on its own, it also keeps a Trick in hand.',
    flavor: 'Nothing has ever happened here. That is the point.',
    nums: { n: 2, b: 16 },
    effect: eff((c) => inscribe(c, {
      turns: N(c).n, label: 'Quiet Grave',
      run: (x, tm) => {
        guardEpitaph(x, tm, N(c).b);
        const k = U.cardsIn(x, 'hand')[0];
        if (k) U.retain(x, k, 'turn');
      },
    })),
    upgrade: { nums: { n: 2, b: 22 } },
  },
  {
    id: 'mossbit/two-names-one-stone', name: 'Two Names, One Stone', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Needs two slots. Create [Epitaph] {n} on an enemy for {d}, and another for {b} Guard.',
    flavor: 'They went at the same time. It seemed tidier.',
    nums: { n: 2, d: 12, b: 12 },
    playable: (c) => slotsFree(c) >= 2,
    effect: eff((c) => {
      const t = c.target;
      inscribe(c, { turns: N(c).n, target: t, label: 'Two Names', run: (x, tm) => hitEpitaph(x, tm, N(c).d) });
      inscribe(c, { turns: N(c).n, label: 'One Stone', run: (x, tm) => guardEpitaph(x, tm, N(c).b) });
    }),
    upgrade: { nums: { n: 2, d: 17, b: 17 } },
  },
  {
    id: 'mossbit/stone-calendar', name: 'Stone Calendar', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph', 'patience'],
    text: 'Hurry an [Epitaph] or put it back. Put back, it pays {p} extra [Patience] if it then matures untouched.',
    flavor: 'Months carved in a ring. Some of them crossed out.',
    nums: { p: 1 },
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Which inscription?' });
      if (!t) return;
      const pick = await c.choose({ options: ['Hurry it along', 'Put it back'], prompt: 'Which way?' });
      if (pick[0] === 1) { delay(c, t, 1); t.data.marked = true; }
      else advance(c, t, 1);
    }),
    upgrade: { nums: { p: 2 } },
  },
  {
    id: 'mossbit/emergency-burial', name: 'Emergency Burial', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['buried-harm'],
    text: 'Postpone the whole of the next enemy hit as [Buried Harm].',
    flavor: 'Down. Now. All the way down.',
    nums: {},
    effect: eff((c) => { U.mm(c).burialOneHit = true; openBurial(c, 999); }),
    upgrade: { text: 'Postpone the whole of the next two enemy hits as [Buried Harm].' },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'mossbit/longer-memory', name: 'Longer Memory', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['patience'],
    text: 'Your maximum [Patience] becomes {n} for this fight.',
    flavor: 'He remembers the house before the house.',
    nums: { n: BIG_PATIENCE },
    effect: eff((c) => power(c, 'mossbit/longer-memory', (x, s) => {
      s.longerMemory = true;
      x.defineCounter(patienceTrack(BIG_PATIENCE, patience(x)));
    })),
    upgrade: { cost: 0 },
  },
  {
    id: 'mossbit/set-in-stone', name: 'Set in Stone', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['epitaph'],
    text: 'New [Epitaph]s take 1 longer, and their damage and Guard are {m0} stronger.',
    flavor: 'Properly carved things take properly long.',
    nums: { m0: 5 },
    effect: eff((c) => power(c, 'mossbit/set-in-stone', (x, s) => {
      s.setInStone = true;
      s.monumentBonus = (s.monumentBonus || 0) + N(x).m0;
    })),
    upgrade: { nums: { m0: 8 } },
  },
  {
    id: 'mossbit/grave-moss', name: 'Grave Moss', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph', 'buried-harm'],
    text: 'Erasing an unresolved [Epitaph] gains {b} Guard and takes a little off [Buried Harm].',
    flavor: 'It grows over the ones nobody visits.',
    nums: { b: 9 },
    effect: eff((c) => power(c, 'mossbit/grave-moss', (x, s) => { s.graveMoss = N(x).b; })),
    upgrade: { nums: { b: 13 } },
  },
  {
    id: 'mossbit/cemetery-shift', name: 'Cemetery Shift', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['buried-harm', 'epitaph'],
    text: 'Start your turn carrying [Buried Harm] with a slot free: write it into an [Epitaph] 2 instead.',
    flavor: 'The ground moves it around at night.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/cemetery-shift', (x, s) => { s.cemeteryShift = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/small-monument', name: 'Small Monument', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weathering', 'epitaph'],
    text: 'When a Trick becomes Weathered, your next [Epitaph] to mature also gives Guard.',
    flavor: 'A very small one. For a very small turtle.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/small-monument', (x, s) => { s.smallMonument = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'mossbit/no-rush', name: 'No Rush', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'The first time you put an [Epitaph] back each turn, draw {c1}.',
    flavor: 'There has never been a rush.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'mossbit/no-rush', (x, s) => { s.noRush = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'mossbit/lichen-clock', name: 'Lichen Clock', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['epitaph', 'patience'],
    text: 'After the first [Epitaph] matures each turn, hurry another by 1. That one pays no [Patience].',
    flavor: 'It keeps time. Badly. Over centuries.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/lichen-clock', (x, s) => { s.lichenClock = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/keep-the-appointment', name: 'Keep the Appointment', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'An aimed [Epitaph] whose target is gone finds another instead of fizzling. The first each turn draws {c1}.',
    flavor: 'It was in the diary.',
    nums: { c1: 1 },
    effect: eff((c) => power(c, 'mossbit/keep-the-appointment', (x, s) => { s.keepTheAppointment = true; })),
    upgrade: { cost: 0 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'mossbit/the-last-thing-you-hear', name: 'The Last Thing You Hear', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['epitaph', 'patience'],
    text: 'Create [Epitaph] {n} on an enemy: deal {d}. Spend up to {p} [Patience] to bring it forward.',
    flavor: 'Stone. Moving slowly. Very close now.',
    nums: { n: 3, d: 44, p: 2 },
    balance: { scalesWith: 'a three-turn wait' },
    effect: eff((c) => {
      const t = c.target;
      let early = 0;
      while (early < N(c).p && spendPatience(c, 1)) early++;
      inscribe(c, {
        turns: Math.max(1, N(c).n - early), exact: true, target: t,
        label: 'The Last Thing You Hear', run: (x, tm) => hitEpitaph(x, tm, N(c).d),
      });
    }),
    upgrade: { nums: { n: 3, d: 58, p: 2 } },
  },
  {
    id: 'mossbit/here-eventually', name: 'Here Eventually', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. While in your discard pile, the first [Epitaph] each turn returns it for free.',
    flavor: 'It gets here. It always gets here.',
    nums: { d: 12 },
    effect: eff((c) => { U.hit(c, N(c).d); U.mm(c).hereEventually = true; }),
    upgrade: { nums: { d: 17 } },
  },
  {
    id: 'mossbit/mausoleum-meteor', name: 'Mausoleum Meteor', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['epitaph'],
    text: 'Deal {d} damage to all enemies. Create [Epitaph] {n}: do it again.',
    flavor: 'Something the size of a shed, arriving on schedule.',
    nums: { d: 20, n: 2 },
    effect: eff((c) => {
      U.hitAll(c, N(c).d);
      inscribe(c, { turns: N(c).n, label: 'Mausoleum Meteor', run: (x, tm) => U.hitAll(x, N(c).d + (tm.data.bonus || 0)) });
    }),
    upgrade: { nums: { d: 27, n: 2 } },
  },
  {
    id: 'mossbit/borrowed-weight', name: 'Borrowed Weight', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['buried-harm'],
    text: 'Deal damage equal to your [Buried Harm] without spending any, or {d} if you carry none.',
    flavor: 'He is not giving it back. He is showing you.',
    nums: { d: 8, m0: 18 },
    balance: { scalesWith: 'Buried Harm held' },
    effect: eff((c) => U.hit(c, Math.max(N(c).d, harm(c)))),
    upgrade: { nums: { d: 12, m0: 24 } },
  },
  {
    id: weathers('mossbit/geologic-headbutt', 3), name: 'Geologic Headbutt', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['weathering', 'vanish'],
    text: '[Weathering] {w}. Deal {d} damage. Weathered: costs 0, deals {m0}, then [Vanish]es.',
    flavor: 'Three turns of not doing anything, arriving all at once.',
    nums: { w: 3, d: 18, m0: 22 },
    effect: eff((c) => {
      if (!isWeathered(c, c.card)) { U.hit(c, N(c).d); return; }
      U.hit(c, N(c).m0);
      U.makeVanish(c, c.card);
    }),
    dynamicCost: (c) => (isWeathered(c, c.card) ? 0 : 2),
    upgrade: { nums: { w: 3, d: 24, m0: 30 } },
  },
  {
    id: 'mossbit/five-little-headstones', name: 'Five Little Headstones', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['epitaph'],
    text: 'Deal {d} for each [Epitaph] you have. For each empty slot, write [Epitaph] 2 for {m0} at random.',
    flavor: 'A row of them. Small. Neat. Ominous.',
    nums: { d: 6, m0: 6, hits: 5 },
    balance: { scalesWith: 'occupied Epitaph slots' },
    effect: eff((c) => {
      U.hitRandomN(c, N(c).d, epitaphs(c).length);
      const free = slotsFree(c);
      for (let i = 0; i < free; i++) {
        const t = U.rpick(c, U.enemies(c));
        if (!t) break;
        inscribe(c, { turns: 2, exact: true, target: t, label: 'Little Headstone', run: (x, tm) => hitEpitaph(x, tm, N(c).m0) });
      }
    }),
    upgrade: { nums: { d: 8, m0: 8, hits: 5 } },
  },
  {
    id: 'mossbit/the-bell-tolls', name: 'The Bell Tolls Eventually', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage once for every [Epitaph] that has matured this whole fight.',
    flavor: 'It has been tolling. You were not listening.',
    nums: { d: 6, hits: 5 },
    balance: { scalesWith: 'Epitaphs matured this combat' },
    effect: eff((c) => U.hitN(c, N(c).d, Math.max(1, U.mm(c).naturalThisCombat || 0))),
    upgrade: { nums: { d: 8, hits: 5 } },
  },
  {
    id: 'mossbit/last-word-again', name: 'Last Word, Again', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['epitaph'],
    text: 'Deal {d} damage. If it dies, every [Epitaph] aimed at it resolves at once elsewhere, for no [Patience].',
    flavor: 'He had more to say. He is going to say it.',
    nums: { d: 18 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (!t || t.alive) return;
      for (const ep of offensive(c).filter(x => x.data.targetId === t.id)) {
        const other = U.rpick(c, U.enemies(c));
        if (other) ep.data.targetId = other.id;
        c.adjustTimer(ep.id, -ep.turnsLeft, 'last-word');
      }
      syncSlotCounter(c);
    }),
    upgrade: { nums: { d: 24 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'mossbit/a-very-long-nap', name: 'A Very Long Nap', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['epitaph', 'vanish'],
    text: 'Gain {b} Guard. Next turn every [Epitaph] ticks twice, and both ticks count as maturing. [Vanish].',
    flavor: 'Back in a bit. Possibly a long bit.',
    nums: { b: 18 },
    effect: eff((c) => { U.guard(c, N(c).b); U.mm(c).doubleTickNextTurn = true; }),
    upgrade: { nums: { b: 25 } },
  },
  {
    id: 'mossbit/rewrite-the-headstone', name: 'Rewrite the Headstone', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['epitaph'],
    text: 'Copy an active [Epitaph] into a free slot, keeping its countdown. You may aim the copy elsewhere.',
    flavor: 'The same words. A different name.',
    nums: {},
    playable: (c) => slotsFree(c) >= 1 && epitaphs(c).length >= 1,
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Copy which inscription?' });
      if (!t) return;
      const target = t.data.targetId ? U.rpick(c, U.enemies(c)) : null;
      inscribe(c, { turns: t.turnsLeft, exact: true, target, label: t.label, run: t.run ? (x, tm) => t.run({ e: c.e, engine: c.e, timer: tm, batch: [tm], batchSize: 1, data: tm.data, reason: 'copy' }) : (() => {}) });
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/centuries-in-a-pocket', name: 'Centuries in a Pocket', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['epitaph'],
    text: 'Set every [Epitaph] to 1. None of them resolves until the next scheduled tick.',
    flavor: 'All of it, folded very small.',
    nums: {},
    effect: eff((c) => {
      for (const t of epitaphs(c)) {
        if (t.data.fixed || t.turnsLeft <= 1) continue;
        c.adjustTimer(t.id, 1 - t.turnsLeft, 'centuries');
      }
      syncSlotCounter(c);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/do-not-disturb', name: 'Do Not Disturb', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['weathering', 'vanish'],
    text: 'Every Weathering Trick in your hand finishes now. None of them can be played this turn. [Vanish].',
    flavor: 'A small sign, hung on a small shell.',
    nums: {},
    effect: eff((c) => {
      for (const k of U.handOthers(c)) {
        if (printedWeather(k) == null || isWeathered(c, k)) continue;
        if (makeWeathered(c, k)) { k.meta.sealedTurn = U.turn(c); k.unplayable = true; }
      }
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'mossbit/turn-to-stone', name: 'Turn to Stone', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['buried-harm', 'vanish'],
    text: 'Clear all your [Buried Harm]. Draw {n} fewer Tricks next turn. [Vanish].',
    flavor: 'Simply stop. Become masonry. Wait.',
    nums: { n: 2 },
    effect: eff((c) => {
      reduceHarm(c, harm(c));
      c.modifyDraw(-N(c).n);
    }),
    upgrade: { nums: { n: 1 } },
  },
  {
    id: 'mossbit/become-a-rock', name: 'In Case of Emergency, Become a Rock', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['buried-harm'],
    text: 'Postpone ALL of the next enemy turn as [Buried Harm]. You cannot gain Guard the turn after.',
    flavor: 'Break glass. Become geology.',
    nums: {},
    effect: eff((c) => { openBurialAll(c); U.mm(c).noGuardNextTurn = true; }),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/graveyard-rehearsal', name: 'Graveyard Rehearsal', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: SELF, exhaust: true, keywords: ['epitaph', 'vanish'],
    text: 'Every [Epitaph] happens once now without being used up. No [Patience]. [Vanish].',
    flavor: 'A dry run. Everyone knows their part.',
    nums: {},
    effect: eff((c) => {
      for (const t of epitaphs(c).slice()) {
        if (!t.run) continue;
        try {
          t.run({ e: c.e, engine: c.e, timer: t, batch: [t], batchSize: 1, data: t.data, reason: 'rehearsal' });
        } catch (err) { console.error('[mossbit] rehearsal threw', err); }
      }
    }),
    upgrade: { cost: 2 },
  },
  {
    id: 'mossbit/read-the-fine-print', name: 'Read the Fine Print', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['epitaph'],
    text: 'An [Epitaph] of your choice happens twice when it arrives. It still pays only one [Patience].',
    flavor: 'It was always going to happen twice.',
    nums: {},
    effect: eff(async (c) => {
      const t = await pickEpitaph(c, { prompt: 'Which inscription, twice?' });
      if (t) t.data.twice = true;
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'mossbit/tomorrow-problem', name: 'Make It a Tomorrow Problem', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['buried-harm', 'epitaph'],
    text: 'Clear your [Buried Harm]. Create an [Epitaph] 2 that costs you that Courage. Nothing can move it.',
    flavor: 'Tomorrow is a different turtle, surely.',
    nums: {},
    effect: eff((c) => {
      const owed = harm(c);
      if (owed <= 0) return;
      reduceHarm(c, owed);
      inscribe(c, { turns: 2, exact: true, fixed: true, label: 'Tomorrow Problem', run: (x) => U.bleed(x, owed) });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'mossbit/the-date-is-flexible', name: 'The Date Is Flexible', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['epitaph', 'vanish'],
    text: 'For up to {n} [Epitaph]s, hurry each along or put each back, one at a time. [Vanish].',
    flavor: 'Nothing here is as fixed as it looks.',
    nums: { n: 3 },
    effect: eff(async (c) => {
      const done = new Set();
      for (let i = 0; i < N(c).n; i++) {
        const pool = epitaphs(c).filter(t => !done.has(t.id));
        if (!pool.length) break;
        const t = await pickEpitaph(c, { pool, optional: true, prompt: 'Which inscription?' });
        if (!t) break;
        done.add(t.id);
        const pick = await c.choose({ options: ['Hurry it along', 'Put it back'], prompt: t.label });
        if (pick[0] === 1) delay(c, t, 1); else advance(c, t, 1);
      }
    }),
    upgrade: { nums: { n: 4 } },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'mossbit/geological-patience', name: 'Geological Patience', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['patience'],
    text: '[Patience] you cannot hold becomes {m0} damage to all enemies and {m0} Guard instead.',
    flavor: 'Mountains do this. It takes them longer.',
    nums: { m0: 6 },
    effect: eff((c) => power(c, 'mossbit/geological-patience', (x, s) => { s.geologicalPatience = N(x).m0; })),
    upgrade: { nums: { m0: 10 } },
  },
  {
    id: 'mossbit/house-never-forgets', name: 'House Never Forgets', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['epitaph'],
    text: 'Once each turn, an [Epitaph] that matures writes itself again at 3. Copies do not copy.',
    flavor: 'The house wrote it down. The house remembers.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/house-never-forgets', (x, s) => { s.houseNeverForgets = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'mossbit/weathered-beyond', name: 'Weathered Beyond Recognition', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['weathering'],
    text: 'Weathered Tricks cost 1 less. Unfinished [Weathering] Tricks cost 1 more.',
    flavor: 'You cannot read a word of it any more. It works better.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/weathered-beyond', (x, s) => { s.weatheredBeyond = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/monument-to-small-things', name: 'Monument to Small Things', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['buried-harm', 'epitaph'],
    text: 'Clearing [Buried Harm] before it costs you Courage makes future [Epitaph]s {m0} stronger. It stacks.',
    flavor: 'For the ones nobody built anything for.',
    nums: { m0: 2 },
    effect: eff((c) => power(c, 'mossbit/monument-to-small-things', (x, s) => { s.monumentToSmallThings = true; })),
    upgrade: { nums: { m0: 3 } },
  },
  {
    id: 'mossbit/mansion-moves', name: 'The Mansion Moves Around Me', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['weathering', 'epitaph'],
    text: 'End a turn having played 3 or fewer Tricks: one Weathering Trick advances and your oldest [Epitaph] waits.',
    flavor: 'He has not moved in an hour. Everything else has.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/mansion-moves', (x, s) => { s.mansionMoves = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/already-written', name: 'Already Written', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['epitaph'],
    text: 'Two more [Epitaph] slots. If one is free now, create [Epitaph] 3: draw {c1} and gain {e} Nerve.',
    flavor: 'It was on the shell when he woke up.',
    nums: { c1: 2, e: 1 },
    effect: eff((c) => power(c, 'mossbit/already-written', (x, s) => {
      s.extraSlots = 2;
      x.defineCounter(slotTrack(MAX_SLOTS, epitaphs(x).length));
      inscribe(x, {
        turns: 3, exact: true, label: 'Already Written',
        run: (y) => { U.draw(y, N(x).c1); U.energy(y, N(x).e); },
      });
    })),
    upgrade: { cost: 1 },
  },
  {
    id: 'mossbit/death-can-wait', name: 'Death Can Wait', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['buried-harm', 'epitaph', 'patience'],
    text: 'Once a fight, [Buried Harm] that would finish you is cleared. Every [Epitaph] fires and [Patience] fills.',
    flavor: 'Not today. Today is booked.',
    nums: {},
    effect: eff((c) => power(c, 'mossbit/death-can-wait', (x, s) => { s.deathCanWait = true; })),
    upgrade: { cost: 2 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'mossbit/write-your-name-here', name: 'Write Your Name Here', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['epitaph'],
    text: 'Create [Epitaph] {n} in one of your slots: a friend gains {b} Guard and draws {c1}.',
    flavor: 'Room for two names. There always was.',
    nums: { n: 2, b: 14, c1: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      inscribe(c, {
        turns: N(c).n, label: 'Write Your Name Here',
        run: (x, tm) => { x.giveBlock(ally, N(c).b + (tm.data.bonus || 0)); x.giveDraw(ally, N(c).c1); },
      });
    }),
    upgrade: { nums: { n: 2, b: 20, c1: 2 } },
  },
  {
    id: 'mossbit/carry-some-of-that', name: 'Carry Some of That', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['buried-harm'],
    text: "Postpone {n} of a friend's Attack damage next enemy turn. It becomes YOUR [Buried Harm].",
    flavor: 'He can take it. He has a shell and a schedule.',
    nums: { n: 14 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      const s = U.mm(c);
      (s.carryFor || (s.carryFor = [])).push({ seatId: ally.id, left: N(c).n });
    }),
    upgrade: { nums: { n: 20 } },
  },
  {
    id: 'mossbit/save-it-for-tomorrow', name: 'Save It for Tomorrow', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['epitaph'],
    text: "Set aside a Trick from a friend's hand. An [Epitaph] 1 returns it, costing {m0} less.",
    flavor: 'Put it down. It will be here.',
    nums: { m0: 1 },
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      if (!ally) return;
      const pick = await c.askAlly(ally, { pool: c.allyCards(ally, 'hand'), prefer: 'costliest' });
      const k = Array.isArray(pick) ? pick[0] : pick;
      if (!k) return;
      k.unplayable = true;
      c.allyMoveCard(ally, k, 'stash', { saved: true });
      inscribe(c, {
        turns: 1, exact: true, label: 'Save It for Tomorrow',
        run: (x) => {
          k.unplayable = false;
          x.allyMoveCard(ally, k, 'hand', {});
          U.costMod(x, k, -N(c).m0, 'turn');
        },
      });
    }),
    upgrade: { nums: { m0: 2 } },
  },
  {
    id: 'mossbit/family-plot', name: 'Family Plot', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, coop: true, keywords: ['epitaph'],
    text: 'The first [Epitaph] to mature each turn gives every friend {b} Guard.',
    flavor: 'One stone. Several names. A long story.',
    nums: { b: 6 },
    effect: eff((c) => power(c, 'mossbit/family-plot', (x, s) => { s.familyPlot = N(x).b; })),
    upgrade: { nums: { b: 10 } },
  },
  {
    id: 'mossbit/everybody-gets-home', name: 'Everybody Gets Home Eventually', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 3, target: SELF, coop: true, keywords: ['buried-harm'],
    text: "Postpone {n} of each friend's Attack damage as YOUR [Buried Harm]. Next turn they may each pay 1 Nerve to take {m0} off it.",
    flavor: 'Everyone. It may take a while.',
    nums: { n: 20, m0: 16 },
    effect: eff((c) => {
      const s = U.mm(c);
      s.carryFor = s.carryFor || [];
      for (const mate of c.teammates().slice(0, 2)) {
        s.carryFor.push({ seatId: mate.id, left: N(c).n });
      }
      s.debtRelief = { amount: N(c).m0, from: c.teammates().map(m => m.id) };
    }),
    upgrade: { nums: { n: 28, m0: 22 } },
  },
];

export default {
  slug: SLUG,
  name: 'Mossbit',
  title: 'the Tombstone Turtle',
  region: 'kennels',
  identity:
    'Mossbit does not survive because he is armoured. He survives because he has time. He writes ' +
    'events into the future as Epitaphs and is paid in Patience for letting them arrive on ' +
    'schedule rather than dragging them forward; he improves Tricks by refusing to play them; and ' +
    'he can postpone enemy damage instead of preventing it, which buys a turn and sends the bill ' +
    'to the end of the next one. Every one of his clocks can be adjusted and none of them can be ' +
    'ignored. The danger is simply that tomorrow arrives.',
  strengths: [
    'Long fights, where a schedule laid down on turn two pays for the whole second half',
    'Predictable bosses — a dangerous turn you can see coming is a turn he can plan around',
    'Surviving enormous single bursts by Burying them, which no amount of Guard would answer',
    'Turning otherwise idle turns into real setup',
    'Scaling without any conventional stat growth at all',
  ],
  weaknesses: [
    'Fast fights end before a single Epitaph matures',
    'Weathering Tricks clog the hand precisely while he most needs options',
    'Five slots full of inscriptions he no longer wants is a dead engine',
    'Advancing everything for tempo generates almost no Patience',
    'Refusing to Advance anything is how he dies waiting',
    'Buried Harm he cannot clear in one turn is simply damage with extra steps',
    'Enemies that die early make aimed Epitaphs fizzle',
  ],
  startingHp: 80,
  startingEnergy: 3,
  mechanics: {
    epitaph: { name: 'Epitaph', kind: 'resource', desc: 'A delayed effect with a countdown, in one of five slots. Ticks once at the start of your turn, oldest first. Advance brings it forward (and forfeits Patience), Delay pushes it back, Erase removes it unresolved. An aimed Epitaph remembers its enemy and fizzles without it.', min: 0, max: 7, hooks: ['inscribe', 'epitaph'] },
    patience: { name: 'Patience', kind: 'resource', desc: 'Holds 3, or 5 under Longer Memory. One is paid whenever an Epitaph reaches zero from its own scheduled tick — never from being Advanced. That difference is the whole character.', min: 0, max: 5, hooks: [] },
    weathering: { name: 'Weathering', kind: 'system', desc: 'A Trick left unplayed in hand at end of turn is Retained and loses 1 Weathering. At 0 it is Weathered for the rest of the fight and uses its better half. Leaving your hand before then resets it.', min: 0, max: 3, hooks: ['weathered'] },
    buriedHarm: { name: 'Buried Harm', kind: 'system', desc: 'Attack damage postponed rather than prevented. At the end of your NEXT turn you lose that much Courage — not as an Attack, so Guard cannot stop it and it cannot be Buried again. It buys a turn, nothing more.', min: 0, max: 99, hooks: [] },
  },
  startingDeck: [
    'mossbit/small-headbutt', 'mossbit/small-headbutt', 'mossbit/small-headbutt', 'mossbit/small-headbutt',
    'mossbit/pull-in', 'mossbit/pull-in', 'mossbit/pull-in',
    'mossbit/written-in-stone', 'mossbit/not-yet', 'mossbit/sun-on-the-shell',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'The Inscription Engine', desc: 'Stagger several Epitaphs so every future turn already has something in it. Turn two has defence, turn three has damage, turn four has cards — and then it comes round again.', coreCards: ['mossbit/date-stamp', 'mossbit/carve-and-carry', 'mossbit/deep-inscription', 'mossbit/swap-the-dates', 'mossbit/two-names-one-stone', 'mossbit/lichen-clock', 'mossbit/already-written'] },
    { name: 'Buried Weight', desc: 'Take the hit on purpose and spend the turn you bought turning the debt into something else. The bill is always coming; the question is what it buys first.', coreCards: ['mossbit/put-it-off', 'mossbit/take-the-hit-later', 'mossbit/burdened-bash', 'mossbit/weight-to-words', 'mossbit/borrowed-weight', 'mossbit/cemetery-shift', 'mossbit/tomorrow-problem'] },
    { name: 'Weathered Relics', desc: 'Hold the good Tricks until they are dramatically better, and survive the hand congestion that costs you.', coreCards: ['mossbit/old-reliable', 'mossbit/warm-flagstone', 'mossbit/stone-age-swipe', 'mossbit/geologic-headbutt', 'mossbit/weatherproofing', 'mossbit/do-not-disturb', 'mossbit/weathered-beyond'] },
    { name: 'Patient Monument', desc: 'Never Advance anything. Let every inscription mature on its own and spend the Patience on the turns that end fights.', coreCards: ['mossbit/moss-grows-anyway', 'mossbit/longer-memory', 'mossbit/namesake-crush', 'mossbit/patient-hands', 'mossbit/stone-calendar', 'mossbit/geological-patience', 'mossbit/the-last-thing-you-hear'] },
    { name: 'Gravekeeper', desc: 'Treat the five slots as a board you manipulate — create, erase, copy, reschedule. The most fiddly version of him and the one with the highest ceiling.', coreCards: ['mossbit/scratch-it-out', 'mossbit/make-space', 'mossbit/recut-the-date', 'mossbit/rewrite-the-headstone', 'mossbit/centuries-in-a-pocket', 'mossbit/the-date-is-flexible', 'mossbit/house-never-forgets'] },
  ],
};
