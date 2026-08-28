/**
 * Drizzle, the Raincloud Ghost.  OWNER: companion-cards.
 * Spec: docs/design/companions/11-drizzle.md
 *
 * Weather · Stormbreak · Soaked · Conduct · Forecast
 *
 * Drizzle does not manipulate her hand or her resources. She manipulates the
 * conditions the whole fight is taking place in, and her good turns start
 * several turns earlier.
 *
 * ── The four rules that decide whether she works ────────────────────────────
 *
 * 1. WEATHER BELONGS TO THE TABLE, NOT TO A SEAT. Her chapter opens "Weather is
 *    a global combat state", and it acts on the SHARED enemies — Downpour soaks
 *    all of them, Clear dries all of them. Every other Companion resource in
 *    this build is per seat, and `engine._ckey` prefixes counters with their
 *    owner in a party, so the obvious implementation gives two Drizzles two
 *    Weathers both soaking and drying the same board out of different states.
 *    The Weather track is declared `shared: true`, which is the one counter flag
 *    that skips that prefix. Everything derived from it that fires ONCE for the
 *    table — the automatic Stormbreak, the natural drying — is stamped with the
 *    turn it ran on in `field.drizzle`, because in a party two trackers are
 *    listening and both will hear the same phase event.
 *
 * 2. AN ENEMY DRIES ON THE TURN THAT BEGAN IN CLEAR, not on the turn that ended
 *    in it. This is the whole reason a Stormbreak does not dry the board: it
 *    lands at the END of an enemy turn that began in Thunderstorm. Recording
 *    the weather at enemy-turn START is what makes the two rules agree.
 *
 * 3. A FORECAST IS NOT A CARD BEING PLAYED. It leaves circulation when set,
 *    resolves without paying Nerve, and nothing that rewards playing Tricks may
 *    see it. Trap 16 applies in full: the engine parks a resolving Trick in
 *    LIMBO and pushes it to the discard the moment the effect returns, so the
 *    physical card is moved on `card:resolved`, exactly as Wisp's Linger and
 *    Wink's Sets do.
 *
 * 4. A FORECAST TRIGGERS ON ENTERING A STATE, NEVER ON BEING IN IT. The spec is
 *    explicit — set a Downpour Forecast during Downpour and it waits for the
 *    next Downpour. Checking "is the weather X" instead would resolve every
 *    Forecast the instant it was set.
 */
import { CardType, Rarity, Target } from '../schema.js';
import * as U from './_util.js';

const { ATTACK, SKILL, POWER } = CardType;
const { BASIC, COMMON, UNCOMMON, RARE } = Rarity;
const { ENEMY, ALL_ENEMIES, SELF, NONE } = Target;
const SLUG = 'drizzle';
const N = U.N;

const WEATHER = 'weather';
const FORECAST = 'forecast';
const SOAKED = 'soaked';

const CLEAR = 0, SPRINKLE = 1, DOWNPOUR = 2, THUNDER = 3;
const WEATHER_NAME = ['Clear', 'Sprinkle', 'Downpour', 'Thunderstorm'];
const SB = 'stormbreak';               // the fifth Forecast trigger

const BASE_SLOTS = 3;
const MAX_SLOTS = 5;                   // Cloud Calendar 4, Forecast Says Me 5.
                                       // Trap 20: declare the counter at the
                                       // ceiling and clamp at the call site.

const ATTACK_INTENTS = new Set(['attack', 'attackBig', 'attackDefend', 'attackBuff', 'attackDebuff']);

const eff = (fn) => (c) => { U.ensure(c, SLUG); return fn(c); };

// ════════════════════════════════════════════════════════════════════════════
//  WEATHER — the shared half
// ════════════════════════════════════════════════════════════════════════════

/**
 * Per-combat scratch that belongs to the TABLE.
 *
 * `engine.field` is the engine's shared per-combat bag and it is deep-copied
 * (not shared by reference) into a preview clone, so previewing a Trick that
 * would break the storm cannot mark the real fight's Stormbreak as spent. It is
 * JSON-serialised, so only plain data goes in here — the Forecast slots hold
 * live card objects and live on the seat instead.
 */
function wf(c) {
  const e = c.e || c;
  const f = (e.field || (e.field = {}));
  return (f.drizzle || (f.drizzle = {
    changedTurn: -1,        // last turn Weather changed at all
    advancedTurn: -1,       // last turn it moved UP
    sbTurn: -1,             // last turn a Stormbreak happened
    turnStart: CLEAR,       // Weather when the current player turn opened
    enemyBeganClear: false, // rule 2
    entered: [],            // every state entered this combat (Weather Has Memory)
    lockUntilTurn: -1,      // Hold the Downpour / Three Days of Rain
    lockEnemyTurns: 0,
    noAdvanceTurn: -1,      // Under the Eaves
    sbDest: CLEAR,          // Never Quite Clears -> Sprinkle
    vane: false,            // Strange Weather Vane, one shot -> Downpour
    teacup: false,          // Storm in a Teacup, one automatic break prevented
    dampForever: false,     // Soaked no longer dries naturally
    autoTurn: -1,           // the enemy phase the automatic rules last ran on
  }));
}

const weather = (c) => U.res(c, WEATHER);
const weatherName = (c) => WEATHER_NAME[weather(c)] || 'Clear';

const isSoaked = (c, en) => !!en && U.stacks(c, en, SOAKED) > 0;
const soakedEnemies = (c) => U.enemies(c).filter(x => isSoaked(c, x));

/** Weather is held in place by Hold the Downpour or Three Days of Rain. */
function weatherLocked(c) {
  const f = wf(c);
  return f.lockEnemyTurns > 0 || U.turn(c) <= f.lockUntilTurn;
}

/**
 * The ONLY way Weather ever moves. Everything else — advance, ease, set,
 * Stormbreak — funnels through here, so the "entering a state" bookkeeping that
 * Forecasts and half the Powers hang off cannot be bypassed by a card that
 * writes the counter directly.
 *
 * @param {Object} o.force   ignore a Weather lock (a Stormbreak still breaks)
 * @param {Object} o.quiet   do not count as a Stormbreak on a Thunder->Clear move
 * @returns {boolean} whether the state actually changed
 */
function setWeather(c, to, o = {}) {
  const f = wf(c);
  const from = weather(c);
  const want = Math.max(CLEAR, Math.min(THUNDER, to | 0));
  if (want === from) return false;
  if (!o.force && weatherLocked(c)) return false;
  if (!o.force && want > from && U.turn(c) === f.noAdvanceTurn) return false;   // Under the Eaves

  // Thunderstorm -> Clear by ANY route is a Stormbreak unless the effect says
  // otherwise. Resolved here rather than at the call sites so a card that sets
  // the state directly cannot quietly skip it.
  const breaking = from === THUNDER && want === CLEAR && !o.quiet && !o.isBreak;
  if (breaking) return stormbreak(c, { forced: true });

  U.setRes(c, WEATHER, want, CLEAR, THUNDER);
  onWeatherEntered(c, from, want, o);
  return true;
}

/** Everything that happens because the board is now standing in a new state. */
function onWeatherEntered(c, from, to, o = {}) {
  const f = wf(c);
  f.changedTurn = U.turn(c);
  if (to > from) f.advancedTurn = U.turn(c);
  f.entered.push(to);   // a HISTORY, not a set: Weather Has Memory counts repeats

  const s = U.mm(c);
  if (s.barometer && U.once(c, 'barometer')) s.drawNextTurn = (s.drawNextTurn || 0) + 1;

  // Entering Thunderstorm soaks the board, whether it was advanced into,
  // set into, or arrived at by a Forecast.
  if (to === THUNDER) {
    for (const en of U.enemies(c)) soak(c, en, { silent: true });
    if (s.stormChaser && U.once(c, 'stormChaser')) { U.draw(c, s.stormChaser); c.discard(1, { choose: true }); }
  }

  U.fire(c, 'weather', { from, to, stormbreak: !!o.isBreak });
  triggerForecasts(c, to);
  if (o.isBreak) triggerForecasts(c, SB);
}

const advance = (c, n = 1) => {
  const s = U.mm(c);
  // Low Pressure System: the first advancing effect each turn moves two.
  let step = n;
  if (s.lowPressure && n > 0 && U.once(c, 'lowPressure')) step = n + 1;
  return setWeather(c, weather(c) + step);
};
const ease = (c, n = 1) => setWeather(c, weather(c) - n);

/**
 * Break the storm.
 *
 * `forced` means a Trick did it during Drizzle's turn; the automatic one at the
 * end of an enemy turn is the only kind Storm in a Teacup prevents.
 */
function stormbreak(c, o = {}) {
  if (weather(c) !== THUNDER) return false;
  const f = wf(c);
  if (!o.forced && f.teacup) { f.teacup = false; return false; }

  let dest = f.sbDest;
  if (f.vane) { dest = DOWNPOUR; f.vane = false; }     // one shot, beats the Power

  const from = weather(c);
  U.setRes(c, WEATHER, dest, CLEAR, THUNDER);
  f.sbTurn = U.turn(c);
  onWeatherEntered(c, from, dest, { isBreak: true });

  const s = U.mm(c);
  if (s.silverLining) U.guardNextTurn(c, s.silverLining);
  if (s.quietAfter) s.quietAfterArmed = true;
  U.fire(c, 'stormbreak', { to: dest });
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
//  SOAKED
// ════════════════════════════════════════════════════════════════════════════

/** @returns {boolean} whether this enemy was NEWLY soaked. */
function soak(c, en, o = {}) {
  if (!en || en.dead) return false;
  const already = isSoaked(c, en);
  if (!already) U.apply(c, en, SOAKED, 1);
  if (o.silent) return !already;

  const s = U.mm(c);
  if (U.once(c, 'soakTrigger')) {
    if (s.steadyPatter) U.guard(c, s.steadyPatter);
    // Leak in Every Room: the first Soak each turn splashes onto somebody else.
    if (s.leakEveryRoom) {
      const other = U.enemies(c).find(x => x !== en && !isSoaked(c, x));
      if (other) U.apply(c, other, SOAKED, 1);
    }
  }
  U.fire(c, 'soak', { enemy: en, fresh: !already });
  return !already;
}

function dry(c, en) {
  if (isSoaked(c, en)) U.unapply(c, en, SOAKED, 1);
}

// ════════════════════════════════════════════════════════════════════════════
//  CONDUCT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Repeat a marked effect through the Soaked network.
 *
 * Conduct activates only when the PRIMARY target is Soaked, and then repeats
 * against every OTHER Soaked enemy. During Thunderstorm the first Conduct of
 * each of Drizzle's turns also repeats once on the primary, which is what keeps
 * Conduct worth drafting against a boss.
 *
 * @param {Function} fn  the marked effect, called once per enemy reached
 * @returns {{ok:boolean, reached:number, usedBonus:boolean}}
 */
function conduct(c, primary, fn) {
  const out = { ok: false, reached: 0, usedBonus: false };
  if (!primary || !isSoaked(c, primary)) return out;
  out.ok = true;
  const s = U.mm(c);

  for (const x of U.enemies(c)) {
    if (x === primary || !isSoaked(c, x)) continue;
    fn(x);
    out.reached++;
  }

  // Puddle Map: one extra repeat against a nominated enemy.
  if (s.puddleMap) {
    const t = U.enemies(c).find(x => x.id === s.puddleMap && isSoaked(c, x));
    s.puddleMap = null;
    if (t) fn(t);
  }

  if (weather(c) === THUNDER && !s.conductBonusUsed) {
    s.conductBonusUsed = true;
    out.usedBonus = true;
    fn(primary);
  }

  // Electric House: a wide Conduct arcs once more, somewhere.
  if (s.electricHouse && out.reached >= 2) {
    const t = U.rpick(c, soakedEnemies(c));
    if (t) fn(t);
  }

  U.fire(c, 'conduct', { reached: out.reached, usedBonus: out.usedBonus });
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//  FORECAST
// ════════════════════════════════════════════════════════════════════════════

/**
 * The delayed half of every Forecast Trick, keyed by card id.
 *
 * It lives out here rather than inside each card's `effect` because Perfect
 * Forecast and Set the Whole Week put Tricks into slots straight out of the
 * DRAW PILE, without ever playing them — so the delayed half has to be
 * reachable from the def, not only from a resolution.
 */
const FORECASTS = new Map();
const forecastCard = (id, trigger, run) => { FORECASTS.set(id, { trigger, run }); return id; };
const forecastDef = (k) => FORECASTS.get(k && (k.def ? k.def.id : k.id)) || null;
const isForecastCard = (k) => !!forecastDef(k);

/** Drizzle's own row of waiting Tricks. Per seat: they are her cards. */
const slots = (c) => { const s = U.mm(c); return (s.forecasts || (s.forecasts = [])); };
const slotCap = (c) => Math.min(MAX_SLOTS, BASE_SLOTS + (U.mm(c).extraSlots || 0));
const slotsFree = (c) => slotCap(c) - slots(c).length;

/**
 * The Forecast track, declared at whatever her capacity CURRENTLY is.
 *
 * Not at MAX_SLOTS. Trap 20 says to declare a counter at its highest reachable
 * value and clamp at the call site — but that is about not losing gains, and it
 * has a cost the tests cannot see: the HUD prints the DECLARED max, so a player
 * with three slots read "FORECAST 0/5". Boggle's Lurk shipped exactly this
 * ("LURK 0/7" against a real cap of 5) and only the screen caught it. So the
 * track is declared at 3 and the two Powers that widen it REDEFINE it, carrying
 * the waiting Forecasts across as `start` so nothing is lost.
 */
const forecastTrack = (cap, start = 0) => ({
  id: FORECAST, name: 'Forecast', icon: 'forecast', min: 0, max: cap, start,
  desc: 'Tricks waiting outside your deck for their Weather. Three slots normally.',
  states: [{ at: 0, label: 'Empty' }, { from: cap, to: cap, label: 'Full' }],
});

/** Widen the row. Idempotent, and never narrows it. */
function growSlots(c, cap) {
  const s = U.mm(c);
  const want = Math.min(MAX_SLOTS, cap);
  if (want <= slotCap(c)) return;
  s.extraSlots = want - BASE_SLOTS;
  c.defineCounter(forecastTrack(want, slots(c).length));
}

function syncSlotCounter(c) {
  const track = U.res(c, FORECAST);
  const now = slots(c).length;
  if (track !== now) U.addRes(c, FORECAST, now - track, 0, MAX_SLOTS);
}

/**
 * Put a Trick into the Forecast row.
 *
 * The card cannot be moved here. While a Trick resolves the engine parks it in
 * LIMBO and, the instant the effect returns, pushes anything still there to the
 * discard pile — so a move from inside the effect is a no-op the engine undoes
 * (trap 16, which shipped in Wink's Sets and Wisp's Linger). The ROW entry is
 * made now, because a Forecast has to be visible and countable immediately, and
 * the physical card is pulled out on `card:resolved`.
 *
 * @param {Object} o.card     the card to park (defaults to the one resolving)
 * @param {Object} o.trigger  overrides the declared trigger (Rain Delay)
 * @param {Object} o.free     placed without being played (Perfect Forecast)
 */
function setForecast(c, o = {}) {
  const card = o.card || c.card;
  if (!card) return false;
  if (slotsFree(c) <= 0) return false;
  const def = forecastDef(card);
  if (!def) return false;

  const trigger = (o.trigger !== undefined && o.trigger !== null) ? o.trigger : def.trigger;
  const entry = {
    card, run: def.run, trigger,
    setTurn: U.turn(c),
    armed: !o.free,          // Perfect Forecast cannot trigger on its own turn
    noRefcast: false,
  };
  slots(c).push(entry);

  const s = U.mm(c);
  if (o.free) {
    // Never went through playCard, so nothing has parked it — take it directly.
    U.moveCard(c, card, 'limbo', { forecast: true });
  } else {
    s.awaitingForecast = card;
  }
  syncSlotCounter(c);

  if (s.weatherStation) U.guard(c, s.weatherStation);
  U.fire(c, 'forecastSet', { trigger });
  return true;
}

/** Everything waiting on this trigger resolves, oldest first. */
function triggerForecasts(c, key) {
  const row = slots(c);
  if (!row.length) return 0;
  const due = row.filter(x => x.trigger === key && x.armed);
  if (!due.length) return 0;

  const s = U.mm(c);
  let n = 0;
  for (const entry of due) {
    const at = row.indexOf(entry);
    if (at < 0) continue;
    row.splice(at, 1);
    resolveForecast(c, entry, key);
    n++;

    // Weather Has Memory: the first Forecast each turn resolves twice if this
    // board has stood in its trigger state before.
    if (s.weatherMemory && U.once(c, 'weatherMemory')
        && key !== SB && wf(c).entered.filter(x => x === key).length > 1) {
      resolveForecast(c, entry, key, { echo: true });
    }
  }
  syncSlotCounter(c);
  return n;
}

function resolveForecast(c, entry, key, o = {}) {
  const s = U.mm(c);
  // A Forecast resolution is NOT a Trick being played: it never goes through
  // playCard, so nothing counting cards played this turn can see it.
  try { entry.run(c, entry); } finally {
    if (!o.echo) {
      U.moveCard(c, entry.card, 'discard', { forecast: true });
      if (s.weatherStation) s.drawNextTurn = (s.drawNextTurn || 0) + 1;
      if (s.forecastSaysMe && U.once(c, 'forecastSaysMe')) U.draw(c, 1);
    }
  }
  U.fire(c, 'forecastResolved', { trigger: key });
}

/** Pull a waiting Trick back into the hand. */
function recallForecast(c, entry, discount = 1) {
  const row = slots(c);
  const at = row.indexOf(entry);
  if (at < 0) return false;
  row.splice(at, 1);
  U.moveCard(c, entry.card, 'hand', { forecast: true });
  U.costMod(c, entry.card, -discount, 'turn');
  entry.card.meta.noForecastTurn = U.turn(c);
  syncSlotCounter(c);
  return true;
}

const canForecastNow = (c, card) =>
  !(card && card.meta && card.meta.noForecastTurn === U.turn(c));

// ── small shared helpers ────────────────────────────────────────────────────
/**
 * Remove one removable positive status from an enemy.
 * `U.removeOneDebuff` walks the DEBUFF list, which is the opposite of what Wash
 * It All Away is for — it would strip Drizzle's own Weak off the target.
 */
function stripBuff(c, en) {
  if (!en || !en.statuses) return null;
  for (const id of [...en.statuses.keys()]) {
    const def = c.e.statusDef(id);
    if (!def || def.kind !== 'buff' || def.permanent) continue;
    c.applyStatus(en, id, -U.stacks(c, en, id));
    return id;
  }
  return null;
}

/** Install a Power once, and record its number on the seat's scratch. */
const power = (c, id, install) => {
  const s = U.mm(c);
  U.applySelf(c, id, 1);
  if (!s['pw:' + id]) { s['pw:' + id] = true; install(c, s); }
};

const weatherAtLeast = (c, n) => weather(c) >= n;
const changedThisTurn = (c) => wf(c).changedTurn === U.turn(c);
const advancedThisTurn = (c) => wf(c).advancedTurn === U.turn(c);
const brokeThisTurn = (c) => wf(c).sbTurn === U.turn(c);

// ════════════════════════════════════════════════════════════════════════════
//  per-combat bookkeeping
// ════════════════════════════════════════════════════════════════════════════
U.onTracker(SLUG, (e, s, seat) => {
  U.defineCounters(e, [
    {
      id: WEATHER, name: 'Weather', icon: 'weather', min: CLEAR, max: THUNDER, start: CLEAR,
      /* THE TABLE'S, not the seat's. See the header note. */
      shared: true,
      desc: 'The state the whole room is in. Advance moves toward Thunderstorm, Ease back toward Clear.',
      states: [
        { at: CLEAR, label: 'Clear' }, { at: SPRINKLE, label: 'Sprinkle' },
        { at: DOWNPOUR, label: 'Downpour' }, { at: THUNDER, label: 'Thunderstorm' },
      ],
    },
    forecastTrack(BASE_SLOTS),
  ]);
  const fake = () => U.trackerCtx(e, seat);

  /* Finish the move into the Forecast row. The engine places the played card
     AFTER the effect returns, so this is the first moment it can be taken out
     of circulation without the engine undoing it. Trap 16. */
  e.on('card:resolved', (ev) => {
    const c = fake();
    const st = U.mm(c);
    const want = st.awaitingForecast;
    if (!want || ev.cardUid !== want.uid) return;
    st.awaitingForecast = null;
    U.moveCard(c, want, 'limbo', { forecast: true });
  });

  U.onPlayerTurn(e, 'start', () => {
    const c = fake();
    const st = U.mm(c);
    const f = wf(c);
    f.turnStart = weather(c);
    st.conductBonusUsed = false;
    st.puddleMap = null;
    st.quietAfterArmed = false;
    st.iAmTheWeatherUsed = false;

    /* Only DRAW is banked here. `turn:start` fires before `_openSeatTurn` wipes
       Guard and before `_dealSeatTurn` SETS Nerve, so neither of those survives
       being granted at this point — Guard goes through `U.guardNextTurn`
       (a scheduled timer, which ticks after the wipe) and Nerve through
       `U.energyNextTurn` (which rides the refill itself). */
    if (st.drawNextTurn) { U.draw(c, st.drawNextTurn); st.drawNextTurn = 0; }

    /* Saturation Point asks whether an enemy has been wet since the turn
       OPENED, so the list is taken before Downpour re-soaks anything. */
    st.soakedAtTurnStart = soakedEnemies(c).map(x => x.id);

    // Downpour is her stable state precisely because it re-soaks for free.
    if (weather(c) === DOWNPOUR) {
      for (const en of U.enemies(c)) soak(c, en, { silent: true });
      if (st.downpourDarling) U.guard(c, st.downpourDarling);
    }
    // Every Forecast placed on an earlier turn is live now.
    for (const entry of slots(c)) entry.armed = true;
    syncSlotCounter(c);
  }, seat);

  U.onPlayerTurn(e, 'end', () => {
    const c = fake();
    const f = wf(c);
    if (f.lockUntilTurn >= 0 && U.turn(c) >= f.lockUntilTurn) f.lockUntilTurn = -1;
  }, seat);

  /* The two automatic Weather rules. Both belong to the TABLE, so both are
     stamped with the turn they ran on: in a party there are two trackers
     listening to this one phase event and the second must not break the storm
     a second time. */
  e.on('phase', (ev) => {
    if (!ev) return;
    const c = fake();
    if (!c) return;
    const f = wf(c);

    if (ev.phase === 'enemy') {
      // Rule 2: what matters is the state the enemy turn BEGAN in.
      f.enemyBeganClear = weather(c) === CLEAR;
      return;
    }
    if (ev.phase !== 'enemyPhaseEnd') return;
    if (f.autoTurn === ev.turn) return;          // the other Drizzle already did it
    f.autoTurn = ev.turn;

    if (f.lockEnemyTurns > 0) f.lockEnemyTurns--;

    // A storm that stood through a whole enemy turn collapses.
    if (weather(c) === THUNDER) stormbreak(c, {});

    // ...and only now does anything dry, and only if the turn OPENED in Clear.
    if (f.enemyBeganClear && !f.dampForever) {
      for (const en of U.enemies(c)) dry(c, en);
    }
  });

  /* Damp House: the first Soaked attacker each enemy turn is worth Guard.
     The `damage` event carries `sourceId` / `targetId`, NOT `attacker` /
     `defender` — trap 11, and the seams gate caught this exact line. */
  e.on('damage', (ev) => {
    if (!ev || ev.kind !== 'attack') return;
    const c = fake();
    const st = U.mm(c);
    if (!st.dampHouse) return;
    if (ev.targetId !== seat.id) return;
    const from = e.actor(ev.sourceId);
    if (!from || from.side === 'player') return;
    if (!isSoaked(c, from)) return;
    if (st.dampHouseTurn === U.turn(c)) return;
    st.dampHouseTurn = U.turn(c);
    U.guard(c, st.dampHouse);
  });

  /* I Am the Weather / Quiet After both key off a Trick actually being played.
     `ev.actorId` against `seat.id` — NOT `ev.seat`, which is a number while the
     tracker's seat is an actor. That comparison is what made every Mopsy Patch
     inert (trap 18). */
  e.on('card:play', (ev) => {
    if (!ev || ev.actorId !== seat.id) return;
    const c = fake();
    const st = U.mm(c);

    /* Quiet After refunds what the Trick actually cost, so "the first Trick
       after a Stormbreak costs 0" is true of a 3-Nerve Trick too. `ev.card` is
       a SNAPSHOT (trap 19) and the cost is on it. */
    if (st.quietAfter && st.quietAfterArmed && U.once(c, 'quietAfter')) {
      st.quietAfterArmed = false;
      const paid = (ev.card && typeof ev.card.cost === 'number') ? ev.card.cost : 0;
      if (paid > 0) U.energy(c, paid);
    }

    /* I Am the Weather: one free nudge a turn, offered rather than forced — the
       whole Power is being allowed to choose. Local play takes the choice;
       another seat's copy resolves from its own prefer rule. */
    if (st.iAmTheWeather && !st.iAmTheWeatherUsed) {
      st.iAmTheWeatherUsed = true;
      (async () => {
        const pick = await c.choose({
          options: ['Advance the Weather', 'Ease the Weather', 'Leave it'],
          prompt: 'I Am the Weather', optional: true,
        });
        if (!pick.length) return;
        if (pick[0] === 0) advance(c, 1);
        else if (pick[0] === 1) ease(c, 1);
      })();
    }
  });

  /* Pass the Puddle and Thunder Buddies both lend a friend one Conduct. Written
     against the `damage` event rather than a status hook because what they lend
     is "when your Attack lands on something wet", which is exactly what this
     event reports. Once per ally per round. */
  e.on('damage', (ev) => {
    if (!ev || ev.kind !== 'attack') return;
    const from = e.actor(ev.sourceId);
    if (!from || from.side !== 'player' || from === seat) return;
    const c = fake();
    const st = U.mm(c);
    const target = e.actor(ev.targetId);
    if (!target || target.side === 'player' || !isSoaked(c, target)) return;

    let amount = 0;
    const lent = (st.lentConduct || []).find(x => x.seatId === from.id && x.enemyId === target.id);
    if (lent) { amount = lent.amount; st.lentConduct.splice(st.lentConduct.indexOf(lent), 1); }
    else if (st.thunderBuddies) {
      const used = (st.buddyUsed || (st.buddyUsed = {}));
      if (used[from.id] === U.turn(c)) return;
      used[from.id] = U.turn(c);
      amount = st.thunderBuddies;
    }
    if (!amount) return;
    for (const x of U.enemies(c)) {
      if (x === target || !isSoaked(c, x)) continue;
      c.damage(x, amount, { cause: 'conduct' });
    }
  });
});

// ── Power hooks ─────────────────────────────────────────────────────────────
U.onHook('soak', 'drizzle/steady-patter', () => {});
U.onHook('conduct', 'drizzle/electric-house', () => {});
U.onHook('stormbreak', 'drizzle/silver-lining', () => {});
U.onHook('weather', 'drizzle/barometer', () => {});
U.onHook('forecastSet', 'drizzle/weather-station', () => {});
U.onHook('forecastResolved', 'drizzle/forecast-says-me', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  BASIC
// ════════════════════════════════════════════════════════════════════════════
const basics = [
  {
    id: 'drizzle/pitter-patter', name: 'Pitter Patter', companion: SLUG, type: ATTACK, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['soaked'],
    text: 'Deal {d} damage. Deal {m0} more if the target is [Soaked].',
    flavor: 'It is not really rain. It is more of an opinion about rain.',
    nums: { d: 6, m0: 3 },
    effect: eff((c) => U.hit(c, N(c).d + (isSoaked(c, c.target) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 4 } },
  },
  {
    id: 'drizzle/cloud-cover', name: 'Cloud Cover', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['weather'],
    text: 'Gain {b} Guard. Gain {m0} more while [Weather] is not Clear.',
    flavor: 'Something grey moves in overhead and stays there.',
    nums: { b: 5, m0: 3 },
    effect: eff((c) => U.guard(c, N(c).b + (weatherAtLeast(c, SPRINKLE) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 8, m0: 4 } },
  },
  {
    id: 'drizzle/damp-spot', name: 'Damp Spot', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: ENEMY, keywords: ['soaked'],
    text: '[Soak] one enemy. If it was already [Soaked], gain {b} Guard.',
    flavor: 'The ceiling has been thinking about this for a while.',
    nums: { b: 5 },
    effect: eff((c) => { if (!soak(c, c.target)) U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'drizzle/just-a-sprinkle', name: 'Just a Sprinkle', companion: SLUG, type: SKILL, rarity: BASIC,
    cost: 1, target: SELF, keywords: ['weather', 'advance'],
    text: '[Advance] [Weather] one step. If it changes, gain {b} Guard.',
    flavor: 'A beginning. Barely.',
    nums: { b: 4 },
    effect: eff((c) => { if (advance(c, 1)) U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 7 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  COMMON — 20
// ════════════════════════════════════════════════════════════════════════════
const commons = [
  {
    id: 'drizzle/ceiling-drip', name: 'Ceiling Drip', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['soaked'],
    text: 'Deal {d} damage. If the target is [Soaked], gain {b} Guard.',
    flavor: 'Plink. Plink. Plink.',
    nums: { d: 7, b: 5 },
    effect: eff((c) => { const t = c.target; U.hit(c, N(c).d); if (isSoaked(c, t)) U.guard(c, N(c).b); }),
    upgrade: { nums: { d: 10, b: 7 } },
  },
  {
    id: 'drizzle/splashdown', name: 'Splashdown', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['conduct', 'soaked'],
    text: 'Deal {d} damage. [Conduct]: Deal {m0} damage.',
    flavor: 'Everything wet is connected to everything else wet.',
    nums: { d: 9, m0: 5 },
    effect: eff((c) => { const t = c.target; U.hit(c, N(c).d); conduct(c, t, (x) => U.hitAt(c, x, N(c).m0)); }),
    upgrade: { nums: { d: 12, m0: 7 } },
  },
  {
    id: 'drizzle/cold-little-drop', name: 'Cold Little Drop', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['soaked', 'weather'],
    text: 'If [Weather] is Clear, [Soak] the target. Deal {d} damage.',
    flavor: 'The first one always goes down the back of the neck.',
    nums: { d: 8 },
    effect: eff((c) => { if (weather(c) === CLEAR) soak(c, c.target); U.hit(c, N(c).d); }),
    upgrade: { nums: { d: 11 } },
  },
  {
    id: 'drizzle/window-rattle', name: 'Window Rattle', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['weather'],
    text: 'Deal {d} damage to all enemies. Deal {m0} more during Downpour or Thunderstorm.',
    flavor: 'The whole house says something about the weather at once.',
    nums: { d: 5, m0: 3 },
    effect: eff((c) => U.hitAll(c, N(c).d + (weatherAtLeast(c, DOWNPOUR) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 7, m0: 4 } },
  },
  {
    id: 'drizzle/static-pop', name: 'Static Pop', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['conduct', 'weather'],
    text: 'Deal {d} damage. During Thunderstorm this gains [Conduct]: Deal {m0} damage.',
    flavor: 'A small unkind spark, looking for somewhere to go.',
    nums: { d: 9, m0: 5 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (weather(c) === THUNDER) conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
    }),
    upgrade: { nums: { d: 12, m0: 7 } },
  },
  {
    id: 'drizzle/gutter-rush', name: 'Gutter Rush', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 2, target: ENEMY, keywords: ['weather', 'advance'],
    text: 'Deal {d} damage. Costs 1 less Nerve if [Weather] advanced this turn.',
    flavor: 'All of it, arriving at once, at the corner.',
    nums: { d: 14 },
    effect: eff((c) => U.hit(c, N(c).d)),
    /* `dynamicCost` is the engine's one conditional-cost seam (costOf step 1).
       A `costMod` key on a def is read by nothing at all. */
    dynamicCost: (c) => (advancedThisTurn(c) ? 1 : 2),
    upgrade: { nums: { d: 18 } },
  },
  {
    id: 'drizzle/raindrop-ricochet', name: 'Raindrop Ricochet', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['soaked'],
    text: 'Deal {d} damage twice, divided among [Soaked] enemies. If none are [Soaked], both hits strike your target.',
    flavor: 'Off the bannister, off the lamp, off the Squeaker.',
    nums: { d: 5, hits: 2 },
    effect: eff((c) => {
      const wet = soakedEnemies(c);
      if (!wet.length) { U.hitN(c, N(c).d, 2); return; }
      for (let i = 0; i < 2; i++) U.hitAt(c, wet[i % wet.length], N(c).d);
    }),
    upgrade: { nums: { d: 7, hits: 2 } },
  },
  {
    id: 'drizzle/wet-sock-whap', name: 'Wet Sock Whap', companion: SLUG, type: ATTACK, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['soaked'],
    text: 'Deal {d} damage. If the target is [Soaked] and intends to Attack, apply {n} Weak.',
    flavor: 'It should not hurt this much. It does.',
    nums: { d: 9, n: 1 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (t && isSoaked(c, t) && t.pendingMove && ATTACK_INTENTS.has(t.pendingMove.intent)) {
        U.apply(c, t, 'weak', N(c).n);
      }
    }),
    upgrade: { nums: { d: 12, n: 2 } },
  },
  {
    id: 'drizzle/misty-fingers', name: 'Misty Fingers', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ENEMY, keywords: ['soaked'],
    text: '[Soak] an enemy. If it was already [Soaked], draw a Trick, then discard a Trick.',
    flavor: 'She leaves prints on things she has not touched.',
    nums: {},
    effect: eff((c) => { if (!soak(c, c.target)) { U.draw(c, 1); c.discard(1, { choose: true }); } }),
    upgrade: { text: '[Soak] an enemy. If it was already [Soaked], draw two Tricks, then discard a Trick.' },
  },
  {
    id: 'drizzle/drip-drip-drip', name: 'Drip Drip Drip', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weather', 'advance'],
    /* DEVIATION (CONTRACTS rule 8): the doc gives this the identical line to the
       Basic Just a Sprinkle, which makes the Common a strictly redundant copy —
       the cards suite correctly calls that one card printed twice. The draw is
       the smallest thing that earns it a slot in the 80 and points where its own
       name already points: this is the one that keeps going. */
    text: '[Advance] [Weather] one step. If it changes, gain {b} Guard and draw a Trick.',
    flavor: 'It does not stop. That is the entire personality of it.',
    nums: { b: 5 },
    effect: eff((c) => { if (advance(c, 1)) { U.guard(c, N(c).b); U.draw(c, 1); } }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'drizzle/let-it-ease', name: 'Let It Ease', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['weather', 'ease'],
    text: '[Ease] [Weather] one step and gain {b} Guard. Cannot be played while Clear.',
    flavor: 'Letting up is also a decision.',
    nums: { b: 5 },
    playable: (c) => weather(c) > CLEAR,
    effect: eff((c) => { ease(c, 1); U.guard(c, N(c).b); }),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'drizzle/house-is-leaking', name: 'The House Is Leaking', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['soaked', 'weather'],
    text: '[Soak] all enemies. During Downpour or Thunderstorm, gain {b} Guard for each enemy.',
    flavor: 'Everywhere. All of it. All at once.',
    nums: { b: 2 },
    effect: eff((c) => {
      const all = U.enemies(c);
      for (const en of all) soak(c, en);
      if (weatherAtLeast(c, DOWNPOUR)) U.guard(c, N(c).b * all.length);
    }),
    upgrade: { nums: { b: 4 } },
  },
  {
    id: forecastCard('drizzle/rain-check', DOWNPOUR, (c) => U.draw(c, 2)),
    name: 'Rain Check', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['forecast', 'weather'],
    text: '[Forecast] Downpour: Draw two Tricks.',
    flavor: 'For later. When it is really coming down.',
    nums: {},
    effect: eff((c) => { setForecast(c); }),
    upgrade: { text: '[Forecast] Downpour: Draw two Tricks and gain 5 Guard.' },
  },
  {
    id: 'drizzle/under-the-eaves', name: 'Under the Eaves', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weather'],
    text: 'Gain {b} Guard. You cannot [Advance] [Weather] for the rest of this turn.',
    flavor: 'Dry, and going nowhere.',
    nums: { b: 12 },
    effect: eff((c) => { U.guard(c, N(c).b); wf(c).noAdvanceTurn = U.turn(c); }),
    upgrade: { nums: { b: 17 } },
  },
  {
    id: 'drizzle/cloudbank', name: 'Cloudbank', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weather'],
    text: 'Gain {b} Guard. Gain {m0} more if [Weather] changed this turn.',
    flavor: 'Piled up along the ceiling like laundry.',
    nums: { b: 8, m0: 4 },
    effect: eff((c) => U.guard(c, N(c).b + (changedThisTurn(c) ? N(c).m0 : 0))),
    upgrade: { nums: { b: 11, m0: 6 } },
  },
  {
    id: forecastCard('drizzle/save-a-drop', THUNDER, (c) => { U.energy(c, 1); U.draw(c, 1); }),
    name: 'Save a Drop', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 0, target: SELF, keywords: ['forecast', 'weather'],
    text: '[Forecast] Thunderstorm: Gain 1 Nerve and draw a Trick.',
    flavor: 'Kept in a jar on the sill, for the big one.',
    nums: {},
    effect: eff((c) => { setForecast(c); }),
    upgrade: { text: '[Forecast] Thunderstorm: Gain 2 Nerve and draw a Trick.' },
  },
  {
    id: 'drizzle/turn-the-tap', name: 'Turn the Tap', companion: SLUG, type: SKILL, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weather', 'advance', 'ease', 'soaked'],
    text: 'Choose: [Advance] or [Ease] [Weather] one step. If it changes, [Soak] one enemy.',
    flavor: 'Hot, cold, and a third setting nobody asked for.',
    nums: {},
    effect: eff(async (c) => {
      const pick = await c.choose({ options: ['Advance', 'Ease'], prompt: 'Which way?' });
      const up = pick[0] !== 1;
      if (up ? advance(c, 1) : ease(c, 1)) {
        const t = c.target || U.enemies(c)[0];
        if (t) soak(c, t);
      }
    }),
    upgrade: { text: 'Choose: [Advance] or [Ease] [Weather] one step. If it changes, [Soak] all enemies.' },
  },
  {
    id: 'drizzle/steady-patter', name: 'Steady Patter', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['soaked'],
    text: 'The first time each turn you [Soak] an enemy, gain {b} Guard.',
    flavor: 'Reliable. Almost restful.',
    nums: { b: 5 },
    effect: eff((c) => power(c, 'drizzle/steady-patter', (x, s) => { s.steadyPatter = N(x).b; })),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'drizzle/damp-house', name: 'Damp House', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['soaked'],
    text: 'The first time each enemy turn a [Soaked] enemy attacks you, gain {b} Guard.',
    flavor: 'The walls have gone soft and so has its footing.',
    nums: { b: 5 },
    effect: eff((c) => power(c, 'drizzle/damp-house', (x, s) => { s.dampHouse = N(x).b; })),
    upgrade: { nums: { b: 8 } },
  },
  {
    id: 'drizzle/barometer', name: 'Barometer', companion: SLUG, type: POWER, rarity: COMMON,
    cost: 1, target: SELF, keywords: ['weather'],
    text: 'The first time [Weather] changes during each of your turns, draw {n} additional Trick next turn.',
    flavor: 'The little needle has been twitching all evening.',
    nums: { n: 1 },
    effect: eff((c) => power(c, 'drizzle/barometer', (x, s) => { s.barometer = N(x).n; })),
    upgrade: { nums: { n: 2 } },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  UNCOMMON — 35
// ════════════════════════════════════════════════════════════════════════════
const uncommons = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'drizzle/hallway-thunder', name: 'Hallway Thunder', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['conduct', 'soaked'],
    text: 'Deal {d} damage to a [Soaked] enemy, or only {w} to a dry one. [Conduct]: Deal {m0} damage.',
    flavor: 'It goes down the corridor and comes back.',
    nums: { d: 16, w: 9, m0: 9 },
    effect: eff((c) => {
      const t = c.target;
      const wet = isSoaked(c, t);
      U.hit(c, wet ? N(c).d : N(c).w);
      conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
    }),
    upgrade: { nums: { d: 21, w: 12, m0: 12 } },
  },
  {
    id: 'drizzle/roofbeat', name: 'Roofbeat', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['weather'],
    text: 'Deal {d} damage once while Clear, twice at Sprinkle, three times at Downpour, four times at Thunderstorm.',
    flavor: 'The tempo of the whole house, keeping time.',
    nums: { d: 5, hits: 4 },
    balance: { scalesWith: 'Weather' },
    effect: eff((c) => U.hitN(c, N(c).d, weather(c) + 1)),
    upgrade: { nums: { d: 7, hits: 4 } },
  },
  {
    id: 'drizzle/puddle-stomp', name: 'Puddle Stomp', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['soaked', 'ease', 'weather'],
    text: 'Deal {d} damage. If the target is [Soaked], [Ease] [Weather] one step and deal it again.',
    flavor: 'Both feet. Deliberately.',
    nums: { d: 9, hits: 2 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (isSoaked(c, t)) { ease(c, 1); U.hitAt(c, t, N(c).d); }
    }),
    upgrade: { nums: { d: 12, hits: 2 } },
  },
  {
    id: 'drizzle/flash-flood', name: 'Flash Flood', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['soaked', 'ease', 'weather'],
    text: 'Deal {d} damage to every [Soaked] enemy, then [Ease] [Weather]. If none are [Soaked], [Soak] them all instead.',
    flavor: 'The hallway becomes a river for eleven seconds.',
    nums: { d: 12 },
    effect: eff((c) => {
      const wet = soakedEnemies(c);
      if (!wet.length) { for (const en of U.enemies(c)) soak(c, en); return; }
      for (const en of wet) U.hitAt(c, en, N(c).d);
      ease(c, 1);
    }),
    upgrade: { nums: { d: 16 } },
  },
  {
    id: 'drizzle/tiny-lightning', name: 'Tiny Lightning', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['conduct', 'weather'],
    text: 'Deal {d} damage. During Downpour or Thunderstorm, [Conduct]: Deal {m0} damage.',
    flavor: 'About the size of a hairpin, and it knows it.',
    nums: { d: 9, m0: 9 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (weatherAtLeast(c, DOWNPOUR)) conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
    }),
    upgrade: { nums: { d: 12, m0: 12 } },
  },
  {
    id: 'drizzle/after-the-flash', name: 'After the Flash', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 0, target: ENEMY, exhaust: true, keywords: ['weather', 'stormbreak', 'vanish'],
    text: 'Playable only if [Weather] changed this turn. Deal {d} damage, or {m0} more if a [Stormbreak] happened. [Vanish].',
    flavor: 'The half second where you can see the whole room.',
    nums: { d: 5, m0: 7 },
    playable: (c) => changedThisTurn(c),
    effect: eff((c) => U.hit(c, N(c).d + (brokeThisTurn(c) ? N(c).m0 : 0))),
    upgrade: { nums: { d: 8, m0: 10 } },
  },
  {
    id: 'drizzle/saturation-point', name: 'Saturation Point', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['soaked'],
    text: 'Deal {d} damage to a [Soaked] enemy. Deal {m0} more if it was already [Soaked] when your turn began.',
    flavor: 'It cannot hold any more and it has stopped trying.',
    nums: { d: 14, m0: 6 },
    effect: eff((c) => {
      const t = c.target;
      if (!isSoaked(c, t)) { U.hit(c, N(c).d); return; }
      const long = U.mm(c).soakedAtTurnStart && U.mm(c).soakedAtTurnStart.includes(t.id);
      U.hit(c, N(c).d + (long ? N(c).m0 : 0));
    }),
    upgrade: { nums: { d: 18, m0: 9 } },
  },
  {
    id: 'drizzle/storm-door-slam', name: 'Storm Door Slam', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['stormbreak', 'weather'],
    text: 'Deal {d} damage. At Thunderstorm, force a [Stormbreak] and deal {m0} more.',
    flavor: 'The wind takes it out of her hands.',
    nums: { d: 16, m0: 16 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (weather(c) === THUNDER) { stormbreak(c, { forced: true }); U.hitAt(c, t, N(c).m0); }
    }),
    upgrade: { nums: { d: 21, m0: 21 } },
  },
  {
    id: 'drizzle/chain-reaction', name: 'Chain Reaction', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['conduct', 'soaked'],
    text: 'Deal {d} damage. [Conduct]: Deal {m0} damage. Gain {b} Guard for every enemy the [Conduct] reached.',
    flavor: 'One, then the next, then the next.',
    nums: { d: 5, m0: 5, b: 3 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      const r = conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
      if (r.reached) U.guard(c, N(c).b * r.reached);
    }),
    upgrade: { nums: { d: 7, m0: 7, b: 4 } },
  },
  {
    id: 'drizzle/roof-drumming', name: 'Roof Drumming', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['forecast'],
    text: 'Deal {d} damage once for each occupied [Forecast] slot, at least once.',
    flavor: 'Everything she has been waiting for, arriving as noise.',
    nums: { d: 5, hits: 3 },
    balance: { scalesWith: 'occupied Forecast slots' },
    effect: eff((c) => U.hitN(c, N(c).d, Math.max(1, slots(c).length))),
    upgrade: { nums: { d: 7, hits: 3 } },
  },
  {
    id: 'drizzle/indoor-lightning', name: 'Indoor Lightning', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 2, target: ENEMY, keywords: ['forecast', 'weather'],
    text: 'Deal {d} damage. You may resolve the oldest [Forecast] waiting for Thunderstorm. [Weather] does not change.',
    flavor: 'It did not come from outside.',
    nums: { d: 14 },
    effect: eff((c) => {
      U.hit(c, N(c).d);
      const row = slots(c);
      const entry = row.find(x => x.trigger === THUNDER && x.armed);
      if (!entry) return;
      row.splice(row.indexOf(entry), 1);
      resolveForecast(c, entry, THUNDER);
      syncSlotCounter(c);
    }),
    upgrade: { nums: { d: 19 } },
  },
  {
    id: 'drizzle/soft-hail', name: 'Soft Hail', companion: SLUG, type: ATTACK, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['soaked'],
    text: 'Deal {d} damage three times at random. Each hit deals {m0} more against a [Soaked] enemy.',
    flavor: 'Not quite ice. Not quite rain. Extremely annoying.',
    nums: { d: 4, m0: 2, hits: 3 },
    effect: eff((c) => {
      for (let i = 0; i < 3; i++) {
        const t = c.randomEnemy();
        if (t) U.hitAt(c, t, N(c).d + (isSoaked(c, t) ? N(c).m0 : 0));
      }
    }),
    upgrade: { nums: { d: 6, m0: 3, hits: 3 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: forecastCard('drizzle/tomorrows-umbrella', THUNDER, (c) => { U.guard(c, 12); U.draw(c, 1); }),
    name: "Tomorrow's Umbrella", companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['forecast', 'weather'],
    text: '[Forecast] Thunderstorm: Gain {b} Guard and draw a Trick.',
    flavor: 'By the door. Ready. Smug.',
    nums: { b: 12 },
    effect: eff((c) => { setForecast(c); }),
    upgrade: { nums: { b: 17 } },
  },
  {
    id: forecastCard('drizzle/watch-the-glass', CLEAR, (c) => { U.draw(c, 2); U.guard(c, 5); }),
    name: 'Watch the Glass', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['forecast', 'weather'],
    text: '[Forecast] Clear: Draw two Tricks and gain {b} Guard.',
    flavor: 'The needle will come back round. It always does.',
    nums: { b: 5 },
    effect: eff((c) => { setForecast(c); }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'drizzle/pressure-drop', name: 'Pressure Drop', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weather', 'ease'],
    text: '[Ease] [Weather] by up to two steps. Gain {b} Guard for each step it actually moved.',
    flavor: 'Everything in the room gets slightly lighter.',
    nums: { b: 6 },
    effect: eff((c) => {
      let moved = 0;
      for (let i = 0; i < 2; i++) if (ease(c, 1)) moved++;
      U.guard(c, N(c).b * moved);
    }),
    upgrade: { nums: { b: 9 } },
  },
  {
    id: 'drizzle/build-a-cloud', name: 'Build a Cloud', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['weather', 'advance'],
    text: '[Advance] [Weather] two steps. If this enters Thunderstorm, draw {n} Tricks.',
    flavor: 'Patted into shape like something out of a bakery.',
    nums: { n: 1 },
    effect: eff((c) => {
      advance(c, 1); advance(c, 1);
      if (weather(c) === THUNDER) U.draw(c, N(c).n);
    }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'drizzle/hold-the-downpour', name: 'Hold the Downpour', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weather'],
    text: 'Playable only during Downpour. Gain {b} Guard. [Weather] cannot change until your next turn.',
    flavor: 'Not one drop harder. Not one drop softer.',
    nums: { b: 13 },
    playable: (c) => weather(c) === DOWNPOUR,
    effect: eff((c) => { U.guard(c, N(c).b); wf(c).lockUntilTurn = U.turn(c) + 1; }),
    upgrade: { nums: { b: 18 } },
  },
  {
    id: 'drizzle/slippery-floor', name: 'Slippery Floor', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['conduct', 'soaked'],
    text: '[Soak] an enemy and apply {n} Weak. [Conduct]: Apply {n} Weak to every other [Soaked] enemy.',
    flavor: 'One polished floorboard and a lot of water.',
    nums: { n: 2 },
    effect: eff((c) => {
      const t = c.target;
      soak(c, t);
      U.apply(c, t, 'weak', N(c).n);
      conduct(c, t, (x) => U.apply(c, x, 'weak', N(c).n));
    }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'drizzle/every-bucket', name: 'Every Bucket in the House', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 2, target: ALL_ENEMIES, keywords: ['soaked'],
    text: '[Soak] all enemies. Gain {b} Guard for each that was already [Soaked].',
    flavor: 'Pots, pans, the good vase, the bad vase.',
    nums: { b: 4 },
    effect: eff((c) => {
      let already = 0;
      for (const en of U.enemies(c)) if (!soak(c, en)) already++;
      U.guard(c, N(c).b * already);
    }),
    upgrade: { nums: { b: 6 } },
  },
  {
    id: 'drizzle/cloud-shelf', name: 'Cloud Shelf', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['forecast'],
    text: 'Return one [Forecast]ed Trick to your hand. It costs 1 less this turn and cannot be [Forecast]ed again this turn.',
    flavor: 'Taken back down off the shelf, slightly damp.',
    nums: {},
    effect: eff(async (c) => {
      const row = slots(c);
      if (!row.length) return;
      const picked = await c.chooseCard({ pool: row.map(x => x.card), count: 1, prompt: 'Take back which Forecast?' });
      const card = picked[0];
      const entry = row.find(x => x.card === card);
      if (entry) recallForecast(c, entry, 1);
    }),
    upgrade: { text: 'Return one [Forecast]ed Trick to your hand. It costs 2 less this turn and cannot be [Forecast]ed again this turn.' },
  },
  {
    id: 'drizzle/reforecast', name: 'Reforecast', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, exhaust: true, keywords: ['forecast', 'weather', 'vanish'],
    text: 'Change one [Forecast]’s Weather trigger to any other state. A [Stormbreak] trigger cannot be changed. [Vanish].',
    flavor: 'She was wrong. She is allowed to be wrong.',
    nums: {},
    effect: eff(async (c) => {
      const row = slots(c).filter(x => x.trigger !== SB);
      if (!row.length) return;
      const picked = await c.chooseCard({ pool: row.map(x => x.card), count: 1, prompt: 'Re-aim which Forecast?' });
      const entry = row.find(x => x.card === picked[0]);
      if (!entry) return;
      const pick = await c.choose({ options: WEATHER_NAME.slice(), prompt: 'Waiting for which Weather?' });
      if (pick.length) entry.trigger = pick[0];
    }),
    upgrade: { cost: 0, text: 'Change one [Forecast]’s Weather trigger to any other state, then draw a Trick. [Vanish].' },
  },
  {
    id: 'drizzle/puddle-map', name: 'Puddle Map', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, keywords: ['conduct', 'soaked'],
    text: 'Choose a [Soaked] enemy. The next [Conduct] this turn repeats its marked effect against it once more.',
    flavor: 'She has been keeping track of where all of it went.',
    nums: {},
    effect: eff((c) => { const t = c.target; if (isSoaked(c, t)) U.mm(c).puddleMap = t.id; }),
    upgrade: { text: 'Choose a [Soaked] enemy and draw a Trick. The next [Conduct] this turn repeats its marked effect against it once more.' },
  },
  {
    id: 'drizzle/weatherproof', name: 'Weatherproof', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weather', 'advance', 'ease'],
    text: 'Gain {b} Guard. At Clear, [Advance] one step. At Thunderstorm, [Ease] one step.',
    flavor: 'Whatever it is doing, she has a coat for it.',
    nums: { b: 12 },
    effect: eff((c) => {
      U.guard(c, N(c).b);
      if (weather(c) === CLEAR) advance(c, 1);
      else if (weather(c) === THUNDER) ease(c, 1);
    }),
    upgrade: { nums: { b: 17 } },
  },
  {
    id: forecastCard('drizzle/rain-delay', SPRINKLE, (c) => { U.energy(c, 1); U.draw(c, 2); }),
    name: 'Rain Delay', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['forecast', 'weather'],
    text: 'Choose any Weather. [Forecast] that state: Gain 1 Nerve and draw two Tricks.',
    flavor: 'Everything is postponed until further notice.',
    nums: {},
    effect: eff(async (c) => {
      const pick = await c.choose({ options: WEATHER_NAME.slice(), prompt: 'Waiting for which Weather?' });
      setForecast(c, { trigger: pick.length ? pick[0] : SPRINKLE });
    }),
    upgrade: { text: 'Choose any Weather. [Forecast] that state: Gain 2 Nerve and draw two Tricks.' },
  },
  {
    id: 'drizzle/open-the-window', name: 'Open the Window', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 0, target: SELF, keywords: ['weather', 'stormbreak', 'ease'],
    text: 'At Thunderstorm, force a [Stormbreak] and draw a Trick. Otherwise [Ease] [Weather] one step.',
    flavor: 'It has to go somewhere.',
    nums: {},
    effect: eff((c) => {
      if (weather(c) === THUNDER) { stormbreak(c, { forced: true }); U.draw(c, 1); }
      else ease(c, 1);
    }),
    upgrade: { text: 'At Thunderstorm, force a [Stormbreak] and draw two Tricks. Otherwise [Ease] [Weather] one step and draw a Trick.' },
  },
  {
    id: 'drizzle/cloud-to-cloud', name: 'Cloud to Cloud', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ALL_ENEMIES, keywords: ['soaked'],
    text: '[Soak] up to two enemies. If both were already [Soaked], draw a Trick.',
    flavor: 'It talks to itself across the ceiling.',
    nums: {},
    effect: eff((c) => {
      const pool = U.enemies(c).slice(0, 2);
      let already = 0;
      for (const en of pool) if (!soak(c, en)) already++;
      if (pool.length === 2 && already === 2) U.draw(c, 1);
    }),
    upgrade: { text: '[Soak] up to three enemies. If they were all already [Soaked], draw two Tricks.' },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'drizzle/leak-in-every-room', name: 'Leak in Every Room', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['soaked'],
    text: 'The first time each turn you [Soak] an enemy, also [Soak] a different one if you can.',
    flavor: 'The house has decided to be like this now.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/leak-in-every-room', (x, s) => { s.leakEveryRoom = true; })),
    upgrade: { cost: 0 },
  },
  {
    id: 'drizzle/low-pressure-system', name: 'Low Pressure System', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['weather', 'advance'],
    text: 'The first effect each turn that [Advance]s [Weather] advances it two steps instead. It still stops at Thunderstorm.',
    flavor: 'Everything is falling and none of it minds.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/low-pressure-system', (x, s) => { s.lowPressure = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/downpour-darling', name: 'Downpour Darling', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weather', 'soaked'],
    text: 'At the start of your turn during Downpour, gain {b} Guard, and your first Attack on a [Soaked] enemy costs 1 less.',
    flavor: 'This is her weather. She is having a lovely time.',
    nums: { b: 8 },
    effect: eff((c) => power(c, 'drizzle/downpour-darling', (x, s) => { s.downpourDarling = N(x).b; })),
    upgrade: { nums: { b: 12 } },
  },
  {
    id: 'drizzle/storm-chaser', name: 'Storm Chaser', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['weather'],
    text: 'The first time each turn you enter Thunderstorm, draw {n} Tricks, then discard a Trick.',
    flavor: 'Toward it. Always toward it.',
    nums: { n: 2 },
    effect: eff((c) => power(c, 'drizzle/storm-chaser', (x, s) => { s.stormChaser = N(x).n; })),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'drizzle/silver-lining', name: 'Silver Lining', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['stormbreak'],
    text: 'Whenever a [Stormbreak] happens, gain {b} Guard at the start of your next turn.',
    flavor: 'There is always one. It is thin and it is cold.',
    nums: { b: 12 },
    effect: eff((c) => power(c, 'drizzle/silver-lining', (x, s) => { s.silverLining = N(x).b; })),
    upgrade: { nums: { b: 17 } },
  },
  {
    id: 'drizzle/damp-forever', name: 'Damp Forever', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['soaked', 'weather'],
    text: '[Soaked] enemies no longer dry on their own while Clear. Effects that remove [Soaked] still work.',
    flavor: 'It never really finishes drying in this house.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/damp-forever', (x) => { wf(x).dampForever = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/cloud-calendar', name: 'Cloud Calendar', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 1, target: SELF, keywords: ['forecast'],
    text: 'You have a fourth [Forecast] slot.',
    flavor: 'Monday: grey. Tuesday: grey. Wednesday: worse.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/cloud-calendar', (x) => growSlots(x, BASE_SLOTS + 1))),
    upgrade: { cost: 0 },
  },
  {
    id: 'drizzle/weather-station', name: 'Weather Station', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['forecast'],
    text: 'Setting a [Forecast] gains {b} Guard. A [Forecast] resolving draws {n} additional Trick next turn.',
    flavor: 'Instruments. Charts. A small unhappy barometer.',
    nums: { b: 4, n: 1 },
    effect: eff((c) => power(c, 'drizzle/weather-station', (x, s) => { s.weatherStation = N(x).b; })),
    upgrade: { nums: { b: 7, n: 1 } },
  },
  {
    id: 'drizzle/quiet-after', name: 'Quiet After', companion: SLUG, type: POWER, rarity: UNCOMMON,
    cost: 2, target: SELF, keywords: ['stormbreak'],
    text: 'The first Trick you play after each [Stormbreak] refunds its Nerve. At most once a turn.',
    flavor: 'Nothing at all, for a moment, everywhere.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/quiet-after', (x, s) => { s.quietAfter = true; })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  RARE — 25
// ════════════════════════════════════════════════════════════════════════════
const rares = [
  // ── Attacks ───────────────────────────────────────────────────────────────
  {
    id: 'drizzle/housewide-thunderclap', name: 'Housewide Thunderclap', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ENEMY, keywords: ['conduct', 'soaked', 'weather'],
    /* DEVIATION (CONTRACTS rule 8): the doc prints this with the identical line
       to Splashdown, a Common — the cards suite correctly reads that as one card
       printed at two rarities. The doc also calls this "deliberately one of
       Drizzle's strongest Thunderstorm payoff Tricks", and it was not: the
       Thunderstorm bonus Conduct is universal, so at 3 Nerve it was Splashdown
       with bigger numbers. Soaking the room first is what makes it a payoff —
       in a storm the Conduct is guaranteed to reach the whole board instead of
       whatever happened to still be wet. */
    text: 'Deal {d} damage. During Thunderstorm, [Soak] every enemy first. [Conduct]: Deal {m0} damage.',
    flavor: 'Every window in the mansion at the same instant.',
    nums: { d: 22, m0: 22 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      if (weather(c) === THUNDER) for (const en of U.enemies(c)) soak(c, en, { silent: true });
      conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
    }),
    upgrade: { nums: { d: 29, m0: 29 } },
  },
  {
    id: 'drizzle/bolt-from-the-blue', name: 'Bolt from the Blue', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['weather'],
    text: 'Deal {d} damage. Costs 0 Nerve if [Weather] went from Clear to Thunderstorm this turn.',
    flavor: 'Out of nothing. Out of a perfectly nice evening.',
    nums: { d: 30 },
    effect: eff((c) => U.hit(c, N(c).d)),
    dynamicCost: (c) => (wf(c).turnStart === CLEAR && weather(c) === THUNDER && advancedThisTurn(c) ? 0 : 2),
    upgrade: { nums: { d: 38 } },
  },
  {
    id: forecastCard('drizzle/what-goes-up', SB, (c) => {
      const pool = U.enemies(c);
      if (!pool.length) return;
      const weakest = pool.reduce((a, b) => (b.hp < a.hp ? b : a), pool[0]);
      U.hitAt(c, weakest, 18);
    }),
    name: 'What Goes Up', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['forecast', 'stormbreak'],
    text: 'Deal {d} damage, then you may [Forecast] this. [Forecast] [Stormbreak]: Deal {m0} to the enemy with the least Courage.',
    flavor: 'It has to come down. That is the only rule up there.',
    nums: { d: 9, m0: 18 },
    effect: eff((c) => { U.hit(c, N(c).d); if (canForecastNow(c, c.card)) setForecast(c); }),
    upgrade: { nums: { d: 13, m0: 24 } },
  },
  {
    id: 'drizzle/stairwell-waterfall', name: 'Stairwell Waterfall', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['conduct', 'weather', 'soaked'],
    text: 'Deal {d} damage. [Conduct]: Deal {m0} damage. Afterwards set [Weather] to Sprinkle.',
    flavor: 'Down all four flights, taking the runner with it.',
    nums: { d: 15, m0: 9 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
      setWeather(c, SPRINKLE, { quiet: true });
    }),
    upgrade: { nums: { d: 20, m0: 12 } },
  },
  {
    id: 'drizzle/lightning-rod', name: 'Lightning Rod', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['forecast', 'weather'],
    text: 'Deal {d} damage, then {m0} more for each [Forecast] waiting on Thunderstorm.',
    flavor: 'Somebody put it there on purpose, a hundred years ago.',
    nums: { d: 9, m0: 15 },
    balance: { scalesWith: 'Forecasts waiting on Thunderstorm' },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      const waiting = slots(c).filter(x => x.trigger === THUNDER).length;
      for (let i = 0; i < waiting; i++) U.hitAt(c, t, 5);
    }),
    upgrade: { nums: { d: 13, m0: 21 } },
  },
  {
    id: 'drizzle/cloudburst', name: 'Cloudburst', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['soaked', 'weather', 'stormbreak'],
    text: 'Deal {d} damage to all [Soaked] enemies. At Downpour, [Advance]. At Thunderstorm, force a [Stormbreak].',
    flavor: 'The bit where it stops being weather and starts being an event.',
    nums: { d: 15 },
    effect: eff((c) => {
      for (const en of soakedEnemies(c)) U.hitAt(c, en, N(c).d);
      if (weather(c) === DOWNPOUR) advance(c, 1);
      else if (weather(c) === THUNDER) stormbreak(c, { forced: true });
    }),
    upgrade: { nums: { d: 20 } },
  },
  {
    id: 'drizzle/the-roof-finally-leaks', name: 'The Roof Finally Leaks', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 3, target: ALL_ENEMIES, keywords: ['soaked', 'weather'],
    text: '[Soak] every enemy, then deal {d} damage to all of them. Set [Weather] to Downpour.',
    flavor: 'It has been going to do this since 1911.',
    nums: { d: 20 },
    effect: eff((c) => {
      for (const en of U.enemies(c)) soak(c, en);
      for (const en of soakedEnemies(c)) U.hitAt(c, en, N(c).d);
      setWeather(c, DOWNPOUR, { quiet: true });
    }),
    upgrade: { nums: { d: 27 } },
  },
  {
    id: 'drizzle/just-one-more-rumble', name: 'Just One More Rumble', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 1, target: ENEMY, keywords: ['conduct', 'weather'],
    text: 'Deal {d} damage. [Conduct]: Deal {m0} damage. If this used Thunderstorm’s bonus [Conduct], give it back.',
    flavor: 'One more. Just the one. She promises.',
    nums: { d: 9, m0: 9 },
    effect: eff((c) => {
      const t = c.target;
      U.hit(c, N(c).d);
      const r = conduct(c, t, (x) => U.hitAt(c, x, N(c).m0));
      if (r.usedBonus) U.mm(c).conductBonusUsed = false;
    }),
    upgrade: { nums: { d: 13, m0: 13 } },
  },
  {
    id: 'drizzle/rainbow-crash', name: 'Rainbow Crash', companion: SLUG, type: ATTACK, rarity: RARE,
    cost: 2, target: ENEMY, keywords: ['stormbreak'],
    text: 'Deal {d} damage. If a [Stormbreak] happened this turn, deal {m0} more and gain {b} Guard.',
    flavor: 'All seven colours, arriving far too fast.',
    nums: { d: 12, m0: 14, b: 14 },
    effect: eff((c) => {
      const broke = brokeThisTurn(c);
      U.hit(c, N(c).d + (broke ? N(c).m0 : 0));
      if (broke) U.guard(c, N(c).b);
    }),
    upgrade: { nums: { d: 16, m0: 19, b: 18 } },
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'drizzle/perfect-forecast', name: 'Perfect Forecast', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, exhaust: true, keywords: ['forecast', 'vanish'],
    text: 'Set a [Forecast] Trick from your draw pile into an empty slot for free. It cannot trigger this turn. [Vanish].',
    flavor: 'She simply knew.',
    nums: {},
    effect: eff(async (c) => {
      if (slotsFree(c) <= 0) return;
      const picked = await c.chooseCard({ pile: 'draw', count: 1, filter: (k) => isForecastCard(k), prompt: 'Set which Forecast?' });
      if (picked[0]) setForecast(c, { card: picked[0], free: true });
    }),
    upgrade: { cost: 0 },
  },
  {
    id: 'drizzle/skip-the-forecast', name: 'Skip the Forecast', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['weather'],
    text: 'Set [Weather] directly to any state. Entering it triggers everything it normally would.',
    flavor: 'Straight to the part she wanted.',
    nums: {},
    effect: eff(async (c) => {
      const pick = await c.choose({ options: WEATHER_NAME.slice(), prompt: 'Set the Weather to?' });
      if (pick.length) setWeather(c, pick[0]);
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/three-days-of-rain', name: 'Three Days of Rain', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, keywords: ['weather'],
    text: 'Set [Weather] to Downpour. It cannot change for the next two enemy turns.',
    flavor: 'Settled in. Nothing to be done about it.',
    nums: { n: 2 },
    effect: eff((c) => { setWeather(c, DOWNPOUR, { quiet: true }); wf(c).lockEnemyTurns = N(c).n; }),
    upgrade: { nums: { n: 3 } },
  },
  {
    id: 'drizzle/umbrella-graveyard', name: 'Umbrella Graveyard', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['soaked', 'forecast'],
    text: 'Gain {b} Guard for each [Soaked] enemy and each occupied [Forecast] slot, then {m0} more.',
    flavor: 'Six of them in the stand and not one of them opens.',
    nums: { b: 4, m0: 8 },
    effect: eff((c) => U.guard(c, N(c).b * (soakedEnemies(c).length + slots(c).length) + N(c).m0)),
    upgrade: { nums: { b: 6, m0: 11 } },
  },
  {
    id: 'drizzle/rain-on-command', name: 'Rain on Command', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['weather', 'advance', 'vanish'],
    text: '[Advance] [Weather] one step and draw {n} Tricks. [Vanish].',
    flavor: 'She points at the ceiling and the ceiling obliges.',
    nums: { n: 1 },
    effect: eff((c) => { advance(c, 1); U.draw(c, N(c).n); }),
    upgrade: { nums: { n: 2 } },
  },
  {
    id: 'drizzle/strange-weather-vane', name: 'Strange Weather Vane', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['stormbreak', 'weather'],
    text: 'The next [Stormbreak] returns [Weather] to Downpour instead of Clear. It is still a [Stormbreak].',
    flavor: 'It points where it likes. It has for years.',
    nums: {},
    effect: eff((c) => { wf(c).vane = true; }),
    upgrade: { text: 'The next two [Stormbreak]s return [Weather] to Downpour instead of Clear. They are still [Stormbreak]s.' },
  },
  {
    id: 'drizzle/cloud-storage', name: 'Cloud Storage', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 1, target: SELF, keywords: ['forecast'],
    text: 'Return every [Forecast]ed Trick to your hand. Each costs 1 less this turn and cannot be [Forecast]ed again this turn.',
    flavor: 'All of it back at once, all of it damp.',
    nums: {},
    effect: eff((c) => { for (const entry of slots(c).slice()) recallForecast(c, entry, 1); }),
    upgrade: { text: 'Return every [Forecast]ed Trick to your hand. Each costs 2 less this turn and cannot be [Forecast]ed again this turn.' },
  },
  {
    id: 'drizzle/set-the-whole-week', name: 'Set the Whole Week', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, exhaust: true, keywords: ['forecast', 'vanish'],
    text: 'Set up to three [Forecast] Tricks with different triggers from your draw pile, for free. [Vanish].',
    flavor: 'Monday through Wednesday, all arranged.',
    nums: {},
    effect: eff(async (c) => {
      const used = new Set();
      for (let i = 0; i < 3; i++) {
        if (slotsFree(c) <= 0) break;
        const picked = await c.chooseCard({
          pile: 'draw', count: 1, optional: true, prompt: 'Set which Forecast?',
          filter: (k) => { const d = forecastDef(k); return !!d && !used.has(d.trigger); },
        });
        if (!picked[0]) break;
        const d = forecastDef(picked[0]);
        used.add(d.trigger);
        setForecast(c, { card: picked[0], free: true });
      }
    }),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/wash-it-all-away', name: 'Wash It All Away', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: ALL_ENEMIES, keywords: ['soaked', 'weather', 'stormbreak'],
    text: '[Soak] all enemies and strip one buff from each, then set [Weather] to Clear.',
    flavor: 'Whatever they had put on, it is off now.',
    nums: {},
    effect: eff((c) => {
      for (const en of U.enemies(c)) { soak(c, en); stripBuff(c, en); }
      setWeather(c, CLEAR);
    }),
    upgrade: { text: '[Soak] all enemies and strip two buffs from each, then set [Weather] to Clear.' },
  },
  {
    id: 'drizzle/little-patch-of-blue', name: 'Little Patch of Blue', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 0, target: SELF, exhaust: true, keywords: ['weather', 'stormbreak', 'vanish'],
    text: 'Set [Weather] to Clear. Gain {b} Guard for each step crossed. From Thunderstorm this is a [Stormbreak]. [Vanish].',
    flavor: 'Directly overhead, about the size of a plate.',
    nums: { b: 4 },
    effect: eff((c) => {
      const steps = weather(c);
      setWeather(c, CLEAR);
      U.guard(c, N(c).b * steps);
    }),
    upgrade: { nums: { b: 7 } },
  },

  // ── Powers ────────────────────────────────────────────────────────────────
  {
    id: 'drizzle/never-quite-clears', name: 'Never Quite Clears', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['stormbreak', 'weather'],
    text: '[Stormbreak] now returns [Weather] to Sprinkle. Clear [Forecast]s will not fire from an ordinary break.',
    flavor: 'Something is always coming down, somewhere in this house.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/never-quite-clears', (x) => { wf(x).sbDest = SPRINKLE; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/storm-in-a-teacup', name: 'Storm in a Teacup', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['stormbreak', 'weather'],
    text: 'The first automatic [Stormbreak] each combat is prevented. A forced one still works.',
    flavor: 'Contained. Barely. In china.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/storm-in-a-teacup', (x) => { wf(x).teacup = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'drizzle/forecast-says-me', name: 'Forecast Says Me', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['forecast'],
    text: 'Two more [Forecast] slots. The first [Forecast] to resolve each turn also draws a Trick.',
    flavor: 'She is not predicting it. She is announcing it.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/forecast-says-me', (x, s) => {
      s.forecastSaysMe = true;
      growSlots(x, BASE_SLOTS + 2);
    })),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/i-am-the-weather', name: 'I Am the Weather', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, keywords: ['weather', 'advance', 'ease'],
    text: 'Once each turn, after playing a Trick, [Advance] or [Ease] [Weather] one step for free.',
    flavor: 'She stopped being in it and started being it.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/i-am-the-weather', (x, s) => { s.iAmTheWeather = true; })),
    upgrade: { cost: 2 },
  },
  {
    id: 'drizzle/electric-house', name: 'Electric House', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['conduct', 'soaked'],
    text: 'A [Conduct] that reaches two or more other enemies repeats its marked effect once more, at random.',
    flavor: 'The wiring in here was never up to any of this.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/electric-house', (x, s) => { s.electricHouse = true; })),
    upgrade: { cost: 1 },
  },
  {
    id: 'drizzle/weather-has-memory', name: 'Weather Has Memory', companion: SLUG, type: POWER, rarity: RARE,
    cost: 2, target: SELF, keywords: ['forecast', 'weather'],
    text: 'The first [Forecast] to resolve each turn resolves twice if this room has been in that Weather before.',
    flavor: 'It remembers being a storm. It would like to be one again.',
    nums: {},
    effect: eff((c) => power(c, 'drizzle/weather-has-memory', (x, s) => { s.weatherMemory = true; })),
    upgrade: { cost: 1 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER ONLY — outside the 80, never drafted solo
// ════════════════════════════════════════════════════════════════════════════
const coopCards = [
  {
    id: 'drizzle/share-the-umbrella', name: 'Share the Umbrella', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['weather'],
    text: 'You and one friend each gain {b} Guard. If [Weather] changed since their last turn, they draw a Trick.',
    flavor: 'There is not really room. They manage anyway.',
    nums: { b: 9 },
    effect: eff(async (c) => {
      U.guard(c, N(c).b);
      const ally = await c.chooseAlly();
      if (!ally) return;
      c.giveBlock(ally, N(c).b);
      if (changedThisTurn(c)) c.giveDraw(ally, 1);
    }),
    upgrade: { nums: { b: 13 } },
  },
  {
    id: 'drizzle/pass-the-puddle', name: 'Pass the Puddle', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: ENEMY, coop: true, keywords: ['soaked', 'conduct'],
    text: '[Soak] an enemy. The next Attack a friend plays on it gains [Conduct]: Deal {m0} damage.',
    flavor: 'She points. They understand immediately.',
    nums: { m0: 5 },
    effect: eff(async (c) => {
      const t = c.target;
      soak(c, t);
      const ally = await c.chooseAlly();
      if (!ally) return;
      const s = U.mm(c);
      (s.lentConduct || (s.lentConduct = [])).push({ seatId: ally.id, enemyId: t.id, amount: N(c).m0 });
      c.giveStatus(ally, 'lent-conduct', 1);
    }),
    upgrade: { nums: { m0: 8 } },
  },
  {
    id: forecastCard('drizzle/rainy-day-plan', SPRINKLE, (c, entry) => {
      const ally = entry && entry.allyId ? c.party().find(p => p.id === entry.allyId) : null;
      if (!ally) return;
      /* Banked rather than given: their refill would set it straight back to
         maximum, so "at the start of their next turn" only works this way. */
      c.bankEnergy(1, ally);
      c.giveDraw(ally, 1);
    }),
    name: 'Rainy Day Plan', companion: SLUG, type: SKILL, rarity: UNCOMMON,
    cost: 1, target: SELF, coop: true, keywords: ['forecast', 'weather'],
    text: 'Choose a friend and any Weather. [Forecast] that state: they gain 1 Nerve and draw a Trick next turn.',
    flavor: 'For when it gets bad. It will get bad.',
    nums: {},
    effect: eff(async (c) => {
      const ally = await c.chooseAlly();
      const pick = await c.choose({ options: WEATHER_NAME.slice(), prompt: 'Waiting for which Weather?' });
      if (!setForecast(c, { trigger: pick.length ? pick[0] : SPRINKLE })) return;
      const row = slots(c);
      const entry = row[row.length - 1];
      if (entry && ally) entry.allyId = ally.id;
    }),
    upgrade: { text: 'Choose a friend and any Weather. [Forecast] that state: they gain 2 Nerve and draw two Tricks next turn.' },
  },
  {
    id: 'drizzle/everybody-inside', name: 'Everybody Inside!', companion: SLUG, type: SKILL, rarity: RARE,
    cost: 2, target: SELF, coop: true, keywords: ['stormbreak'],
    text: 'Force a [Stormbreak] if you can. Every friend gains {b} Guard and keeps a Trick through their discard.',
    flavor: 'All of them, through one door, immediately.',
    nums: { b: 14 },
    effect: eff((c) => {
      stormbreak(c, { forced: true });
      U.guard(c, N(c).b);
      for (const mate of c.teammates()) {
        c.giveBlock(mate, N(c).b);
        /* "may choose one Trick to keep" is asked of THEM, through the broker —
           never decided inside this effect. CONTRACTS: never hand-roll what a
           teammate would pick. */
        (async () => {
          const keep = await c.askAlly(mate, { pool: c.allyCards(mate, 'hand'), prefer: 'costliest' });
          const k = Array.isArray(keep) ? keep[0] : keep;
          if (k) U.retain(c, k, 'turn');
        })();
      }
    }),
    upgrade: { nums: { b: 19 } },
  },
  {
    id: 'drizzle/thunder-buddies', name: 'Thunder Buddies', companion: SLUG, type: POWER, rarity: RARE,
    cost: 3, target: SELF, coop: true, keywords: ['conduct', 'soaked'],
    text: 'Each round, every friend’s first Attack on a [Soaked] enemy gains [Conduct]: Deal {m0} damage.',
    flavor: 'Nobody counts alone in this house.',
    nums: { m0: 5 },
    effect: eff((c) => power(c, 'drizzle/thunder-buddies', (x, s) => {
      s.thunderBuddies = N(x).m0;
      s.buddyUsed = {};
      for (const mate of x.teammates()) x.giveStatus(mate, 'lent-conduct', 1);
    })),
    upgrade: { nums: { m0: 8 } },
  },
];

export default {
  slug: SLUG,
  name: 'Drizzle',
  title: 'the Raincloud Ghost',
  region: 'bathhouse',
  identity:
    'Drizzle does not manipulate her hand or her resources — she manipulates the conditions the ' +
    'whole fight is happening in. Weather belongs to the room, not to her, and it moves one step ' +
    'at a time between Clear, Sprinkle, Downpour and Thunderstorm. Downpour is stable and pays ' +
    'every turn; Thunderstorm is enormous and collapses on its own. Her best turns are set up ' +
    'several turns earlier by Forecasts waiting outside the deck for weather that has not arrived ' +
    'yet, and the central question is never "how do I make the storm bigger" but "what do I want ' +
    'the room to be doing next, and what am I willing to lose when it breaks".',
  strengths: [
    'The best multi-enemy control in the roster once the board is Soaked and Conduct is online',
    'Forecasts are extremely efficient because their payment and their benefit are turns apart',
    'She sets the pace of the fight — escalate, hold, or deliberately let it off',
    'Scales beautifully into long fights: every Weather change is cards, Guard and damage',
    'Rewards hybrid decks rather than one maximised keyword',
  ],
  weaknesses: [
    'Clear is deliberately her weakest state and every fight starts there',
    'A Forecast can sit dead for turns if the deck cannot reach its trigger',
    'Thunderstorm collapses on its own, and entering it carelessly destroys a good Downpour',
    'Conduct wants a crowd, so a boss alone in a room switches half the deck off',
    'Her archetypes actively fight each other — taking every Weather card makes the deck worse',
    'Three Forecast slots, and the good Forecasts all want one',
  ],
  startingHp: 72,
  startingEnergy: 3,
  mechanics: {
    weather: { name: 'Weather', kind: 'system', desc: 'One global state for the whole combat: Clear, Sprinkle, Downpour, Thunderstorm. Advance moves up, Ease moves down. Downpour re-Soaks every enemy at the start of her turn; Thunderstorm Soaks on entry and breaks on its own.', min: 0, max: 3, hooks: ['weather'] },
    stormbreak: { name: 'Stormbreak', kind: 'system', desc: 'Thunderstorm collapsing to Clear at the end of an enemy turn, or forced by a Trick. Counts as Weather changing and as entering Clear. Does not dry anything, because that enemy turn did not begin in Clear.', min: 0, max: 1, hooks: ['stormbreak'] },
    soaked: { name: 'Soaked', kind: 'status', desc: 'A binary enemy condition that does nothing by itself. It is what makes an enemy part of the weather. Dries at the end of an enemy turn that BEGAN in Clear.', min: 0, max: 1, hooks: ['soak'] },
    conduct: { name: 'Conduct', kind: 'system', desc: 'A marked effect that fires only when the primary target is Soaked, then repeats against every other Soaked enemy. In Thunderstorm the first Conduct of your turn also repeats on the primary.', min: 0, max: 6, hooks: ['conduct'] },
    forecast: { name: 'Forecast', kind: 'resource', desc: 'Three slots holding Tricks outside your deck, each waiting for one Weather state or for Stormbreak. Resolving one costs no Nerve and does not count as playing a Trick.', min: 0, max: 5, hooks: ['forecastSet', 'forecastResolved'] },
  },
  startingDeck: [
    'drizzle/pitter-patter', 'drizzle/pitter-patter', 'drizzle/pitter-patter', 'drizzle/pitter-patter',
    'drizzle/cloud-cover', 'drizzle/cloud-cover', 'drizzle/cloud-cover', 'drizzle/cloud-cover',
    'drizzle/damp-spot', 'drizzle/just-a-sprinkle',
  ],
  cards: [...basics, ...commons, ...uncommons, ...rares],
  /** Multiplayer-only Tricks. Outside the 80; drafted only in a party. */
  coopCards,
  archetypes: [
    { name: 'Stormchaser', desc: 'Race to Thunderstorm, cash in its enhanced Conduct, then take a second payout from the Stormbreak on the way down. The most explosive version of her and the least stable.', coreCards: ['drizzle/build-a-cloud', 'drizzle/low-pressure-system', 'drizzle/storm-chaser', 'drizzle/bolt-from-the-blue', 'drizzle/housewide-thunderclap', 'drizzle/storm-door-slam', 'drizzle/storm-in-a-teacup'] },
    { name: 'Rainkeeper', desc: 'Reach Downpour and refuse to leave. Every enemy is Soaked every turn for free, and the deck turns that into Guard rather than into a storm.', coreCards: ['drizzle/hold-the-downpour', 'drizzle/downpour-darling', 'drizzle/three-days-of-rain', 'drizzle/under-the-eaves', 'drizzle/damp-house', 'drizzle/the-roof-finally-leaks', 'drizzle/damp-forever'] },
    { name: 'Conduct Network', desc: 'Soak everything and make one card hit the whole room. Wants a crowd, and needs a real answer for the fights that do not have one.', coreCards: ['drizzle/splashdown', 'drizzle/chain-reaction', 'drizzle/tiny-lightning', 'drizzle/slippery-floor', 'drizzle/puddle-map', 'drizzle/electric-house', 'drizzle/just-one-more-rumble'] },
    { name: 'Forecast Engine', desc: 'Pay now, collect three turns from now, and bend the Weather so everything lands together. The highest ceiling she has and the one that punishes a clumsy draw.', coreCards: ['drizzle/rain-check', 'drizzle/save-a-drop', 'drizzle/rain-delay', 'drizzle/perfect-forecast', 'drizzle/set-the-whole-week', 'drizzle/forecast-says-me', 'drizzle/weather-has-memory'] },
    { name: 'Silver Lining', desc: 'Break the storm on purpose, over and over, and live in the strange quiet moment afterwards.', coreCards: ['drizzle/open-the-window', 'drizzle/after-the-flash', 'drizzle/rainbow-crash', 'drizzle/silver-lining', 'drizzle/quiet-after', 'drizzle/little-patch-of-blue', 'drizzle/never-quite-clears'] },
  ],
};
