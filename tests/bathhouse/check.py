"""The Bathhouse and Rain Wing, driven against the REAL CombatEngine.

    python tests/bathhouse/check.py [--verbose]

§2 says Weather "should not simply mean: enemies gain bonuses. The player should
sometimes benefit too", and §3 says Wet "begins as a mixed condition rather than
a pure debuff". Both of those are claims about BOTH SIDES, so most of what is
checked here is checked twice — once for the enemy's half and once for the
player's — and every claim has a CONTROL:

  * Wet really gives the player 2 extra Guard, really only on the first gain of
    the turn, and really survives the enemy phase — without which nothing could
    honestly promise a number for it;
  * a Weather change really lands at the START of the next player turn and
    really not before, which is what keeps Downpour's +2 out of a number the
    player has already been shown;
  * Downpour really adds 2 to enemy attacks AND 2 to the player's Guard;
  * Steam really costs the player's first Attack 25% AND really draws them a
    Trick, and Drain really takes everyone's Guard including the enemy's;
  * the Puddle Spirit really grows in Rain and really shrinks in Clear, and
    Small really takes 20% more while Large really hits for 3 more;
  * the Steam Ghost really is halved in Steam and really is softer in Rain;
  * folding the Umbrella really strips Shelter, and less damage really does not;
  * every meter this region reduces on player damage really pays out at the
    START of the next turn, because paying at the end of the turn moved numbers
    the player had already committed against;
  * the Boiler's bands really run in both directions, and 0 really puts it out;
  * the Reflection really copies the category the player led with;
  * and the Matron really has no correct Water Level — 0 is her damage window
    AND her best Bath Key, 3 is her Guard AND her weakest Undertow.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import argparse
import asyncio
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HARNESS = "http://localhost:8777/tests/combat/index.html"

BOOT = r"""
async () => {
  const [C, enc, en, st, cards, kw, run] = await Promise.all([
    import('/game/src/combat/engine.js'),
    import('/game/src/data/encounters.js'),
    import('/game/src/data/enemies/index.js'),
    import('/game/src/combat/statuses.js'),
    import('/game/src/data/cards.js'),
    import('/game/src/data/keywords.js'),
    import('/game/src/state/run.js'),
  ]);
  await kw.loadContentRegistries();
  st.registerStatuses(en.ENEMY_STATUSES);
  window.__Y = { C, enc, en, st, cards, run };
  window.__Y.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

MAKE = r"""
() => { window.make = function make(ids, { seed = 7, hp = 500, energy = 9, deckMul = 1 } = {}) {
  const { C, en, cards, RNG } = window.__Y;
  let deck = cards.startingDeckFor('mossbit');
  for (let i = 1; i < deckMul; i++) deck = deck.concat(cards.startingDeckFor('mossbit'));
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: energy, deck },
    enemies: ids.map(id => en.getEnemy(id)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  return e;
};
window.buildEnc = function (encId, seed, hp, energy) {
  const { C, enc, en, cards, RNG } = window.__Y;
  const members = enc.buildEncounter(encId, new RNG(seed), 0);
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: energy || 99,
              deck: cards.startingDeckFor('mossbit') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  return e;
};
window.swing = function (e, target, amount) {
  target.block = 0;
  const tBefore = target.hp;
  e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  return tBefore - target.hp;
};
window.playOne = async function (e, id, targetId) {
  const def = e.resolveCardDef(id);
  const card = e.addCard(def, 'hand', { reason: 'probe' });
  if (!card) return null;
  const t = targetId !== undefined ? targetId : (e.firstLivingEnemy() || {}).id ?? null;
  return e.playCard(card.uid, t);
};
window.bodies = function (e, defId) { return e.enemies.filter(x => x.defId === defId && x.alive); };
window.body = function (e, defId) { return window.bodies(e, defId)[0] || null; };
window.tough = function (a, hp) {
  a.maxHp = hp; a.hp = hp;
  /* Every Bathhouse meter measures Courage LOST since the turn opened, and the
     baseline is recorded in `onSpawn`. Raising the Courage afterwards without
     moving the baseline made every ledger read a loss of minus three hundred. */
  if (a.mem && a.mem.hpAtStart != null) a.mem.hpAtStart = hp;
  return a;
};
/** Read a move's promised number at its source, without forcing a plan. */
window.promiseOf = async function (e, actor, moveId) {
  const en = window.__Y.en;
  const def = en.getEnemy(actor.defId);
  const move = def.moves[moveId];
  const ctx = e.enemyCtx(actor, move);
  return move.damageFn ? move.damageFn(ctx) : (move.damage ?? null);
};
/** Set the Weather for real, the way the region does: schedule, then open. */
window.setWx = async function (e, w) {
  const bh = await import('/game/src/data/enemies/bathhouse.js');
  e.field.weather = w;
  e.field.pendingWeather = null;
  for (const id of ['weather-rain', 'weather-steam', 'weather-downpour',
                    'weather-drain', 'weather-flood']) e.removeStatus(e.player, id);
  const map = { rain: 'weather-rain', steam: 'weather-steam', downpour: 'weather-downpour',
                drain: 'weather-drain', flood: 'weather-flood' };
  if (map[w]) e.applyStatus(e.player, map[w], 1, { fresh: true });
  return bh;
};
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const BH = enc.ENCOUNTER_LIST.filter(x => x.region === 'bathhouse');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'bathhouse');
  const placed = new Set(BH.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: BH.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly && d.role !== 'object').length,
    scares: BH.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && d.role !== 'object' && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: BH.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['wet', 'weather-rain', 'weather-steam', 'weather-downpour', 'weather-drain',
               'weather-flood', 'slippery', 'diffuse', 'condensed', 'sheltered', 'cracked',
               'cold', 'high-water'].filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
    offers: ['storm/push-the-water', 'storm/hold-the-water']
      .filter(id => en.STATUS_TRICK_DEFS.some(d => d.id === id)),
  };
}
"""

# ── a Weather change is always one turn ahead ───────────────────────────────
AHEAD = r"""
async () => {
  /* Driven through the region's own two functions rather than through a whole
     fight: a fight cannot observe the window, because the schedule is set
     during the enemy phase and promoted at the next `beginPlayerTurn` with no
     player turn in between. What matters is that `prepareWeather` changes
     NOTHING and `openWeather` is the only thing that does. */
  const bh = await import('/game/src/data/enemies/bathhouse.js');
  const e = make(['pipe-knocker', 'soap-sprite'], { seed: 5, hp: 700, energy: 99, deckMul: 4 });
  await e.startCombat();
  const k = tough(body(e, 'pipe-knocker'), 400);
  const sprite = tough(body(e, 'soap-sprite'), 400);
  const ctx = e.enemyCtx(k, null);
  const before = e.field.weather;
  const promisedBefore = await promiseOf(e, sprite, 'slip-tackle');
  bh.prepareWeather(ctx, 'downpour');
  return {
    before,
    afterPrepare: e.field.weather,
    scheduled: e.field.pendingWeather,
    promisedStill: await promiseOf(e, sprite, 'slip-tackle'),
    promisedBefore,
    afterOpen: (bh.openWeather(e.enemyCtx(k, null)), e.field.weather),
    promisedThen: await promiseOf(e, sprite, 'slip-tackle'),
    onPlayer: e.player.hasStatus('weather-downpour'),
  };
}
"""

# ── Wet: both halves, and it has to last the round ──────────────────────────
WET = r"""
async ([second]) => {
  const e = make(['soap-sprite'], { seed: 8, hp: 700, energy: 99 });
  await e.startCombat();
  e.applyStatus(e.player, 'wet', 1, { fresh: true });
  e.player._wetSpent = false;
  e.player.block = 0;
  e.gainBlock(e.player, 5, { reason: 'probe' });
  const first = e.player.block;
  e.player.block = 0;
  e.gainBlock(e.player, 5, { reason: 'probe' });
  const again = e.player.block;
  await e.endTurn();
  return { first, again, survivedRound: e.player.hasStatus('wet') };
}
"""

# ── Downpour and Steam and Drain, on both sides ─────────────────────────────
WEATHER_BOTH = r"""
async ([w]) => {
  const e = make(['soap-sprite'], { seed: 11, hp: 700, energy: 99, deckMul: 4 });
  await e.startCombat();
  const s = tough(body(e, 'soap-sprite'), 400);
  await setWx(e, w);
  // enemy side: what does its 7-damage Slip Tackle promise now?
  s.pendingMove = null;
  s.history = ['soap-splash', 'bubble-up'];
  e.refreshIntents('probe');
  const enemyPromise = s.intent ? s.intent.damage : null;
  // player side: Guard, first Attack, and an extra draw
  e.player.block = 0;
  e.player._wetSpent = true;                       // isolate the Weather's own bonus
  e.gainBlock(e.player, 10, { reason: 'probe' });
  const guard = e.player.block;
  const dealt = swing(e, s, 20);
  const handBefore = e.piles.hand.length;
  e.drawCards(1, 'probe-card');
  const drew = e.piles.hand.length - handBefore;
  e.player.block = 12;
  s.block = 9;
  await e.endTurn();
  return { enemyPromise, guard, dealt, drew,
           playerGuardAfter: e.player.block, enemyGuardAfter: s.block };
}
"""

# ── Soap Sprite: Slippery only while Wet ────────────────────────────────────
SOAP = r"""
async ([wet]) => {
  const e = make(['soap-sprite'], { seed: 13, hp: 700, energy: 99 });
  await e.startCombat();
  const s = tough(body(e, 'soap-sprite'), 400);
  if (wet) e.applyStatus(s, 'wet', 1, { fresh: true });
  else e.removeStatus(s, 'wet');
  await e.endTurn();                    // its own turn re-evaluates Slippery
  s._slipSpent = false;
  const first = swing(e, s, 12);
  const second = swing(e, s, 12);
  return { slippery: s.hasStatus('slippery'), first, second };
}
"""

# ── Puddle Spirit: the Weather changes what it is ───────────────────────────
PUDDLE = r"""
async ([w]) => {
  const e = make(['puddle-spirit'], { seed: 17, hp: 700, energy: 99 });
  await e.startCombat();
  const p = tough(body(e, 'puddle-spirit'), 400);
  await setWx(e, w);
  const sizeBefore = p.counters.size;
  await e.endTurn();
  const sizeAfter = p.counters.size;
  // the size bands, measured directly
  p.counters.size = 0;
  const smallTook = swing(e, p, 20);
  p.counters.size = 1;
  const midTook = swing(e, p, 20);
  /* Read Splash at each Size directly. Reading whatever the intent happened to
     be picked up Spread Out at Small, which is a DEFEND move with no damage
     at all, and compared 0 against 8. */
  p.counters.size = 2;
  const bigPromise = await promiseOf(e, p, 'splash');
  p.counters.size = 0;
  const smallPromise = await promiseOf(e, p, 'splash');
  return { sizeBefore, sizeAfter, smallTook, midTook, bigPromise, smallPromise };
}
"""

# ── the ledgers pay at the START of the next turn ───────────────────────────
LEDGER = r"""
async ([who, amount]) => {
  const map = { pipe: ['pipe-knocker', 'pressure'], tub: ['overflow', 'flood'] };
  const [defId, key] = map[who];
  const e = make([defId], { seed: 19, hp: 900, energy: 99 });
  await e.startCombat();
  const a = tough(body(e, defId), 400);
  /* ONE setup turn, so the turn being measured is an ATTACK with a real number
     on it. Two put the Pipe Knocker on Build Pressure, whose promise is 0 and
     whose +1 exactly cancelled the settle the probe was looking for. */
  await e.endTurn();
  const before = a.counters[key];
  const promised = a.intent ? a.intent.damage : null;
  swing(e, a, amount);
  const midTurn = a.counters[key];
  const hpBefore = e.player.hp;
  await e.endTurn();
  const dealt = hpBefore - e.player.hp;
  const afterEnemy = a.counters[key];
  return { before, midTurn, afterEnemy, promised, dealt };
}
"""

# ── Steam Ghost ─────────────────────────────────────────────────────────────
GHOST = r"""
async ([w]) => {
  const e = make(['steam-ghost'], { seed: 23, hp: 700, energy: 99 });
  await e.startCombat();
  const g = tough(body(e, 'steam-ghost'), 400);
  /* It opens with Fog the Glass, which schedules Steam whatever the probe
     wanted — so give it a history and let it do something else. */
  g.history = ['fog-the-glass'];
  g.pendingMove = null;
  await setWx(e, w);
  await e.endTurn();                    // its own turn re-evaluates the state
  await setWx(e, w);                    // and whatever it scheduled, we want THIS
  const bh = await import('/game/src/data/enemies/bathhouse.js');
  bh.openWeather(e.enemyCtx(g, null));
  /* Steam taxes the PLAYER's first Attack 25% as well, which is the point of it
     — measured separately in WEATHER_BOTH. Here we want the Ghost's own half,
     so the player's Steam is set aside for the measurement. */
  e.removeStatus(e.player, 'weather-steam');
  g._diffuseSpent = false;
  const first = swing(e, g, 20);
  const second = swing(e, g, 20);
  return { diffuse: g.hasStatus('diffuse'), condensed: g.hasStatus('condensed'), first, second };
}
"""

# ── Umbrella Imp ────────────────────────────────────────────────────────────
IMP = r"""
async ([damage]) => {
  const e = make(['umbrella-imp', 'puddle-spirit'], { seed: 29, hp: 900, energy: 99 });
  await e.startCombat();
  const imp = tough(body(e, 'umbrella-imp'), 400);
  const friend = tough(body(e, 'puddle-spirit'), 400);
  await setWx(e, 'rain');
  await e.endTurn();                    // Open Umbrella
  const sheltered = friend.hasStatus('sheltered');
  const guardBefore = friend.block;
  friend.statuses.set('wet', 1);
  e.removeStatus(friend, 'wet');
  swing(e, imp, damage);
  await e.endTurn();
  return { sheltered, stillSheltered: friend.hasStatus('sheltered'),
           dryUnder: !friend.hasStatus('wet'), guardBefore };
}
"""

# ── Overflow's Flood 2 helps both sides ─────────────────────────────────────
FLOOD = r"""
async () => {
  const e = make(['overflow'], { seed: 31, hp: 900, energy: 99 });
  await e.startCombat();
  const o = tough(body(e, 'overflow'), 400);
  await e.endTurn();
  o.counters.flood = 2;
  const bh = await import('/game/src/data/enemies/bathhouse.js');
  const ctx = e.enemyCtx(o, null);
  e.applyStatus(e.player, 'high-water', 1);
  e.applyStatus(o, 'high-water', 1);
  const flood = o.counters.flood;
  e.player.block = 0; e.player._wetSpent = true;
  e.gainBlock(e.player, 5, { reason: 'probe' });
  const playerGuard = e.player.block;
  o.block = 0;
  e.gainBlock(o, 5, { reason: 'probe', source: o });
  const enemyGuard = o.block;
  o.counters.flood = 2;
  await e.endTurn();                    // reaches 3 and schedules Downpour
  return { flood, playerGuard, enemyGuard,
           scheduled: e.field.pendingWeather || e.field.weather };
}
"""

# ── the Boiler's bands ──────────────────────────────────────────────────────
BOILER = r"""
async ([psi]) => {
  const e = make(['boiler-bellower'], { seed: 37, hp: 900, energy: 99 });
  await e.startCombat();
  const b = tough(body(e, 'boiler-bellower'), 500);
  b.counters.psi = psi;
  b.history = ['stoke'];
  b.pendingMove = null;
  e.refreshIntents('probe');
  const move = b.intent ? b.intent.moveId : null;
  const promise = b.intent ? b.intent.damage : null;
  const hpBefore = e.player.hp;
  await e.endTurn();
  return { move, promise, dealt: hpBefore - e.player.hp, psiAfter: b.counters.psi,
           cold: b.hasStatus('cold') };
}
"""

BOILER_COOL = r"""
async ([dealt]) => {
  const e = make(['boiler-bellower'], { seed: 41, hp: 900, energy: 99 });
  await e.startCombat();
  const b = tough(body(e, 'boiler-bellower'), 500);
  b.counters.psi = 4;
  swing(e, b, dealt);
  const sameTurn = b.counters.psi;
  await e.endTurn();
  return { sameTurn, nextTurn: b.counters.psi, cold: b.hasStatus('cold') };
}
"""

# ── the Reflection copies what led ──────────────────────────────────────────
MIRROR = r"""
async ([mode]) => {
  const e = make(['flooded-reflection'], { seed: 43, hp: 900, energy: 99, deckMul: 4 });
  await e.startCombat();
  const m = tough(body(e, 'flooded-reflection'), 500);
  if (mode === 'damage') swing(e, m, 40);
  if (mode === 'guard') { e.player._wetSpent = true; e.gainBlock(e.player, 30, { reason: 'probe' }); }
  if (mode === 'draw') e.drawCards(4, 'probe-card');
  if (mode === 'crack') { await setWx(e, 'rain'); swing(e, m, 40); }
  await e.endTurn();
  return { move: m.intent ? m.intent.moveId : null, cracked: m.hasStatus('cracked') };
}
"""

# ── the Storm Bath's cycle and its offer ────────────────────────────────────
STORM = r"""
async ([mode]) => {
  const e = make(['storm-bath'], { seed: 47, hp: 900, energy: 99, deckMul: 6 });
  await e.startCombat();
  const s = tough(body(e, 'storm-bath'), 500);
  if (mode === 'cycle') {
    const seen = [e.field.weather];
    for (let i = 0; i < 10; i++) { await e.endTurn(); seen.push(e.field.pendingWeather || e.field.weather); }
    return { seen };
  }
  for (let i = 0; i < 4; i++) await playOne(e, 'neutral/borrowed-courage', null);
  const offered = e.piles.hand.filter(c => String(c.id).startsWith('storm/')).map(c => c.id);
  if (mode === 'offer') return { offered };
  const want = mode === 'push' ? 'storm/push-the-water' : 'storm/hold-the-water';
  const card = e.piles.hand.find(c => c.id === want);
  if (card) await e.playCard(card.uid, null);
  const scheduled = e.field.pendingWeather;
  const held = (s.mem || {}).held;
  return { offered, scheduled, held };
}
"""

# ── the Matron ──────────────────────────────────────────────────────────────
MATRON = r"""
async ([mode, arg]) => {
  const e = make(['drowned-matron'], { seed: 53, hp: 1200, energy: 99, deckMul: 4 });
  await e.startCombat();
  const m = tough(body(e, 'drowned-matron'), 425);
  const drain = body(e, 'bath-drain');
  const atk = { type: 'attack' };

  if (mode === 'opens') {
    return { drain: !!drain, weather: e.field.weather,
             rainOnPlayer: e.player.hasStatus('weather-rain'), calm: m.counters.calm };
  }
  if (mode === 'drainage') {
    e.dealDamage({ attacker: e.player, defender: drain, amount: 99, kind: 'attack',
                   card: { type: 'attack', id: 't', uid: 't' } });
    const straightAfter = { weather: e.field.weather, wet: e.player.hasStatus('wet') };
    await e.endTurn();                 // it reseats at the start of THIS turn
    const repaired = !!body(e, 'bath-drain');
    const guarded = repaired ? e.isTargetable(body(e, 'bath-drain'), atk) : null;
    await e.endTurn();                 // and is attackable again the turn after
    const later = body(e, 'bath-drain') ? e.isTargetable(body(e, 'bath-drain'), atk) : null;
    return { straightAfter, repaired, guarded, later };
  }
  if (mode === 'calm') {
    // a quiet turn is a turn she counts
    for (let t = 0; t < arg; t++) await e.endTurn();
    return { calm: m.counters.calm, move: m.intent ? m.intent.moveId : null };
  }
  if (mode === 'calmBreak') {
    await e.endTurn(); await e.endTurn();
    const before = m.counters.calm;
    swing(e, m, 25);
    await e.endTurn();
    return { before, after: m.counters.calm };
  }
  if (mode === 'phase2') {
    m.hp = 200;
    await e.endTurn();               // the transition move
    await e.endTurn();
    return { phase: (m.mem || {}).phase, water: m.counters.water,
             valves: e.enemies.filter(x => /valve/.test(String(x.defId)) && x.alive).length,
             drainGone: !body(e, 'bath-drain') };
  }
  if (mode === 'water') {
    m.hp = 200;
    await e.endTurn(); await e.endTurn();
    m.counters.water = arg;
    m.hp = 200;
    const took = swing(e, m, 100);
    /* Read both numbers at their own `damageFn`. Forcing a move through the
       history could not reach them: the phase-two cycle is offset by
       `phaseStart`, so the probe was measuring Tidal Sweep and calling it Bath
       Key. */
    const key = await promiseOf(e, m, 'bath-key');
    const tidal = await promiseOf(e, m, 'tidal-sweep');
    const undertow = await promiseOf(e, m, 'undertow');
    return { took, key, tidal, undertow };
  }
  if (mode === 'bounds') {
    m.hp = 200;
    await e.endTurn(); await e.endTurn();
    m.counters.water = 3;
    const hpBefore = m.hp;
    const valves = e.enemies.filter(x => /valve/.test(String(x.defId)) && x.alive);
    for (const v of valves) if (v.defId === 'intake-valve') {
      e.dealDamage({ attacker: e.player, defender: v, amount: 99, kind: 'attack',
                     card: { type: 'attack', id: 't', uid: 't' } });
    }
    return { water: m.counters.water, lost: hpBefore - m.hp };
  }
  return {};
}
"""

FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const e = buildEnc(encId, seed, hp, 4);
  const warns = []; const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  await e.startCombat();
  let guard = 0, maxRules = 0, maxBodies = 0;
  while (!e.over && guard++ < turns) {
    let inner = 0;
    while (!e.over && inner++ < 8) {
      const t = (e.firstLivingEnemy() || {}).id ?? null;
      const c = e.piles.hand.find(x => e.canPlay(x.uid, t).ok);
      if (!c) break;
      await e.playCard(c.uid, t);
    }
    maxRules = Math.max(maxRules, (e.rules || []).length);
    maxBodies = Math.max(maxBodies, e.livingEnemies().length);
    if (!e.over) await e.endTurn();
  }
  console.warn = orig;
  return { over: e.over, turns: e.turn, maxRules, maxBodies, warns: warns.slice(0, 4) };
}
"""


async def main(a):
    from playwright.async_api import async_playwright
    passed, failed, notes = 0, 0, []
    errors = []

    def check(cond, label, detail=""):
        nonlocal passed, failed
        if cond:
            passed += 1
            notes.append(("PASS", label, detail))
        else:
            failed += 1
            notes.append(("FAIL", label, detail))

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context()).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await page.goto(HARNESS, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1200)
        await page.evaluate(BOOT)
        await page.evaluate(MAKE)

        # ══ statics ═════════════════════════════════════════════════════════
        s = await page.evaluate(STATIC)
        check(s["formations"] >= 18, "the region ships its full formation list",
              f"{s['formations']} formations")
        check(s["ordinary"] == 6, "six ordinary enemies (§1)", f"{s['ordinary']}")
        check(s["scares"] == 3, "three Big Scares (§1)", f"{s['scares']}")
        check(not s["unknownMembers"], "every formation names an enemy that exists",
              ", ".join(s["unknownMembers"]) or "all resolve")
        check(not s["leaked"], "the Drain and both Valves are never placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("bathhouse" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("bathhouse") < s["ladder"].index("heart"),
              "the ladder walks the Bathhouse before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 13, "every region status is registered",
              ", ".join(s["statuses"]))
        check(len(s["offers"]) == 2, "both Storm Bath offers are real registered Tricks",
              ", ".join(s["offers"]))

        # ══ a Weather change is one turn ahead ══════════════════════════════
        ah = await page.evaluate(AHEAD)
        check(ah["afterPrepare"] == ah["before"] and ah["scheduled"] == "downpour",
              "a Weather change is SCHEDULED and changes nothing on its own (§22)",
              json.dumps(ah))
        check(ah["promisedStill"] == ah["promisedBefore"],
              "so a number the player has already been shown really does not move under "
              "them — the whole reason the region schedules rather than switches",
              json.dumps(ah))
        check(ah["afterOpen"] == "downpour" and ah["onPlayer"] is True
              and ah["promisedThen"] == ah["promisedBefore"] + 2,
              "and opening it at the start of the turn really lands both halves at once",
              json.dumps(ah))

        # ══ Wet ═════════════════════════════════════════════════════════════
        wet = await page.evaluate(WET, [False])
        check(wet["first"] == 7, "Wet really gives the player 2 extra Guard (§3)",
              json.dumps(wet))
        check(wet["again"] == 5, "CONTROL: only on the FIRST gain of the turn",
              json.dumps(wet))
        check(wet["survivedRound"] is True,
              "and Wet really survives the enemy phase — without which nothing could "
              "honestly promise a number for it", json.dumps(wet))

        # ══ Weather, both sides ═════════════════════════════════════════════
        clear = await page.evaluate(WEATHER_BOTH, ["clear"])
        down = await page.evaluate(WEATHER_BOTH, ["downpour"])
        steam = await page.evaluate(WEATHER_BOTH, ["steam"])
        drain = await page.evaluate(WEATHER_BOTH, ["drain"])
        check(down["enemyPromise"] == clear["enemyPromise"] + 2,
              "Downpour really adds 2 to an enemy attack (§2)",
              f"{clear['enemyPromise']} -> {down['enemyPromise']}")
        check(down["guard"] == clear["guard"] + 2,
              "and really adds 2 to the player's Guard — both sides, as §2 asks",
              f"{clear['guard']} -> {down['guard']}")
        check(steam["dealt"] == 15 and clear["dealt"] == 20,
              "Steam really costs the player's first Attack 25%",
              f"clear {clear['dealt']} vs steam {steam['dealt']}")
        check(steam["drew"] == 2 and clear["drew"] == 1,
              "and really gives them a Trick back — it hides them AND helps your hand",
              f"clear {clear['drew']} vs steam {steam['drew']}")
        check(drain["playerGuardAfter"] == 0 and drain["enemyGuardAfter"] == 0,
              "Drain really takes EVERYONE's Guard, the enemy's included (§16)",
              json.dumps(drain))

        # ══ Soap Sprite ═════════════════════════════════════════════════════
        soapy = await page.evaluate(SOAP, [True])
        dry = await page.evaluate(SOAP, [False])
        check(soapy["slippery"] is True and soapy["first"] == 9 and soapy["second"] == 12,
              "Slippery really blunts the first Attack each turn by 3, and only the first (§4)",
              json.dumps(soapy))
        check(dry["slippery"] is False and dry["first"] == 12,
              "CONTROL: dry it out and the defence really goes", json.dumps(dry))

        # ══ Puddle Spirit ═══════════════════════════════════════════════════
        rain = await page.evaluate(PUDDLE, ["rain"])
        clearp = await page.evaluate(PUDDLE, ["clear"])
        check(rain["sizeAfter"] > rain["sizeBefore"],
              "Rain really grows the Puddle Spirit every enemy turn (§5)", json.dumps(rain))
        check(clearp["sizeAfter"] <= clearp["sizeBefore"],
              "CONTROL: Clear Weather really shrinks it instead", json.dumps(clearp))
        check(rain["smallTook"] == 24 and rain["midTook"] == 20,
              "Small really takes 20% more damage", json.dumps(rain))
        check(rain["bigPromise"] == rain["smallPromise"] + 5,
              "and Large really hits for 5 more than Small — 3 up, 2 down",
              f"{rain['smallPromise']} vs {rain['bigPromise']}")

        # ══ the ledgers pay at the START of the next turn ════════════════════
        pipe = await page.evaluate(LEDGER, ["pipe", 20])
        pipe_no = await page.evaluate(LEDGER, ["pipe", 4])
        tub = await page.evaluate(LEDGER, ["tub", 25])
        check(pipe["midTurn"] == pipe["before"] and pipe["dealt"] == pipe["promised"],
              "the meter really does NOT move mid-turn, so the promised number holds (§6)",
              json.dumps(pipe))
        check(pipe["afterEnemy"] < pipe["before"],
              "and 13+ Courage in a turn really costs it a Pressure at the next turn start",
              json.dumps(pipe))
        check(pipe_no["afterEnemy"] >= pipe_no["before"],
              "CONTROL: 4 Courage really does not", json.dumps(pipe_no))
        check(tub["dealt"] == tub["promised"],
              "and Overflow's Flood really behaves the same way (§9)", json.dumps(tub))

        # ══ Steam Ghost ═════════════════════════════════════════════════════
        fog = await page.evaluate(GHOST, ["steam"])
        wetg = await page.evaluate(GHOST, ["rain"])
        clearg = await page.evaluate(GHOST, ["clear"])
        check(fog["diffuse"] is True and fog["first"] == 10 and fog["second"] == 20,
              "Steam really halves the first Attack on the Ghost each turn (§7)",
              json.dumps(fog))
        check(wetg["condensed"] is True and wetg["first"] == 24,
              "and Rain really makes it take 20% MORE — the Weather is the attack",
              json.dumps(wetg))
        check(clearg["diffuse"] is False and clearg["condensed"] is False and clearg["first"] == 20,
              "CONTROL: clear air is neither", json.dumps(clearg))

        # ══ Umbrella Imp ════════════════════════════════════════════════════
        held = await page.evaluate(IMP, [4])
        folded = await page.evaluate(IMP, [20])
        check(held["sheltered"] is True and held["dryUnder"] is True,
              "Shelter really keeps an ally out of the Weather (§8)", json.dumps(held))
        check(folded["stillSheltered"] is False,
              "and 12+ Courage on the IMP really folds it — the support enemy is the "
              "answer to the enemy it is supporting", json.dumps(folded))
        check(held["stillSheltered"] is True, "CONTROL: 4 does not", json.dumps(held))

        # ══ Overflow's Flood 2 ══════════════════════════════════════════════
        fl = await page.evaluate(FLOOD)
        check(fl["flood"] == 2 and fl["playerGuard"] == 8 and fl["enemyGuard"] == 8,
              "Flood 2 really gives BOTH sides 3 more Guard (§9)", json.dumps(fl))
        check(fl["scheduled"] == "downpour",
              "and Flood 3 really schedules a Downpour rather than dropping one on you",
              json.dumps(fl))

        # ══ the Boiler ══════════════════════════════════════════════════════
        low = await page.evaluate(BOILER, [1])
        mid = await page.evaluate(BOILER, [3])
        hot = await page.evaluate(BOILER, [5])
        crit = await page.evaluate(BOILER, [6])
        check(mid["dealt"] == mid["promise"] and low["promise"] == mid["promise"] - 3,
              "Low Pressure really costs it 3 damage (§14)",
              f"psi1 {low['promise']} vs psi3 {mid['promise']}")
        check(hot["move"] == "vent" and crit["move"] == "boiler-burst",
              "5 really vents and 6 really bursts", f"{hot['move']} / {crit['move']}")
        check(crit["dealt"] == crit["promise"] and crit["promise"] >= 24,
              "and the Burst really delivers exactly what it promised", json.dumps(crit))
        cool16 = await page.evaluate(BOILER_COOL, [16])
        cool30 = await page.evaluate(BOILER_COOL, [30])
        cool4 = await page.evaluate(BOILER_COOL, [4])
        # It stokes itself +2 on the same turn, so the CONTROL is the baseline and
        # what is being measured is the difference from it.
        check(cool16["sameTurn"] == 4 and cool16["nextTurn"] == cool4["nextTurn"] - 1,
              "16 damage really takes a Pressure off — at the START of the next turn, "
              "so this turn's promise held", f"{cool4['nextTurn']} -> {cool16['nextTurn']}")
        check(cool30["nextTurn"] == cool4["nextTurn"] - 2, "and 30 really takes two",
              f"{cool4['nextTurn']} -> {cool30['nextTurn']}")
        check(cool4["sameTurn"] == 4,
              "CONTROL: 4 really takes none, and nothing moves mid-turn either way",
              json.dumps(cool4))

        # ══ the Flooded Reflection ══════════════════════════════════════════
        dmg = await page.evaluate(MIRROR, ["damage"])
        grd = await page.evaluate(MIRROR, ["guard"])
        drw = await page.evaluate(MIRROR, ["draw"])
        nil = await page.evaluate(MIRROR, ["none"])
        crk = await page.evaluate(MIRROR, ["crack"])
        check(dmg["move"] == "violent-reflection", "a damage turn really gets Violent (§15)",
              json.dumps(dmg))
        check(grd["move"] == "defensive-reflection", "a Guard turn really gets Defensive",
              json.dumps(grd))
        check(drw["move"] == "curious-reflection", "a draw turn really gets Curious",
              json.dumps(drw))
        check(nil["move"] == "still-water", "CONTROL: a turn with no lead really gets Still Water",
              json.dumps(nil))
        check(crk["cracked"] is True,
              "and 22 damage while it is RAINING really cracks the glass", json.dumps(crk))

        # ══ the Storm Bath ══════════════════════════════════════════════════
        cyc = await page.evaluate(STORM, ["cycle"])
        offer = await page.evaluate(STORM, ["offer"])
        push = await page.evaluate(STORM, ["push"])
        hold = await page.evaluate(STORM, ["hold"])
        check(set(cyc["seen"]) >= {"clear", "rain", "downpour", "drain"},
              "the Storm Cycle really walks all four stages (§16)", json.dumps(cyc["seen"][:8]))
        check(len(offer["offered"]) == 2,
              "the fourth Trick really offers both answers", json.dumps(offer))
        check(push["scheduled"] is not None,
              "Push the Water really advances the cycle", json.dumps(push))
        check(hold["held"] == 1,
              "CONTROL: Hold the Water really holds it instead", json.dumps(hold))

        # ══ the Drowned Matron ══════════════════════════════════════════════
        opens = await page.evaluate(MATRON, ["opens", 0])
        drg = await page.evaluate(MATRON, ["drainage", 0])
        calm = await page.evaluate(MATRON, ["calm", 4])
        cbk = await page.evaluate(MATRON, ["calmBreak", 0])
        ph2 = await page.evaluate(MATRON, ["phase2", 0])
        w0 = await page.evaluate(MATRON, ["water", 0])
        w2 = await page.evaluate(MATRON, ["water", 2])
        w3 = await page.evaluate(MATRON, ["water", 3])
        bounds = await page.evaluate(MATRON, ["bounds", 0])
        check(opens["drain"] is True and opens["weather"] == "rain"
              and opens["rainOnPlayer"] is True,
              "she opens in Rain with a Drain on the floor (§18/§23)", json.dumps(opens))
        check(drg["straightAfter"]["weather"] == "clear"
              and drg["straightAfter"]["wet"] is False,
              "breaking the Drain really cancels the Weather and dries everyone (§23)",
              json.dumps(drg))
        check(drg["repaired"] is True and drg["guarded"] is False and drg["later"] is True,
              "and it really repairs, really cannot be attacked the turn it does, and "
              "really can the turn after (§23)", json.dumps(drg))
        check(calm["calm"] >= 3,
              "quiet turns really raise Calm (§25)", json.dumps(calm))
        check(cbk["after"] < cbk["before"] or cbk["after"] == 0,
              "and 18+ damage to HER really takes one back", json.dumps(cbk))
        check(ph2["phase"] == 2 and ph2["valves"] == 2 and ph2["drainGone"] is True,
              "the transition really swaps the Drain for two Valves (§27/§29)",
              json.dumps(ph2))
        check(w0["took"] > w2["took"],
              "Water 0 really is the damage window — 15% more (§28)",
              f"{w2['took']} vs drained {w0['took']}")
        check(w0["key"] == 18 and w2["key"] == 15,
              "and Bath Key really punishes it: 18 drained, 15 otherwise (§30)",
              f"{w2['key']} vs {w0['key']}")
        check(w2["tidal"] == 13 and w3["tidal"] == 8,
              "Tidal Sweep really peaks at Waist Deep and really is weakest Submerged",
              f"waist {w2['tidal']} vs submerged {w3['tidal']}")
        check(w3["undertow"] == 5 and w0["undertow"] == 6,
              "and Undertow really is weaker Submerged too — so the level she wants "
              "for Guard is the level her multi-hits stop working at (§31)",
              f"drained {w0['undertow']} vs submerged {w3['undertow']}")
        check(bounds["water"] == 3 and bounds["lost"] > 0,
              "and pushing the water past its own ceiling really costs HER (§32)",
              json.dumps(bounds))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, bodies, label in [
            ("bh-14", 2, 40, 800, 3, "Scuffle 14 resolves a whole fight"),
            ("bh-scare-boiler", 3, 40, 800, 1, "the Boiler Bellower resolves a whole fight"),
            ("bh-scare-mirror", 4, 40, 800, 1, "the Flooded Reflection resolves a whole fight"),
            ("bh-scare-storm", 5, 40, 900, 1, "the Storm Bath resolves a whole fight"),
            ("bh-boss", 6, 70, 1000, 3, "the Drowned Matron resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")
            check(r["maxRules"] <= 6,
                  f"{label} without burying the portrait in House Rules",
                  f"at most {r['maxRules']} rule cards at once")
            check(r["maxBodies"] <= bodies,
                  f"{label} without more bodies than the layout can hold",
                  f"at most {r['maxBodies']} at once")

        check(not errors, "zero console errors", "; ".join(errors[:3]))
        await browser.close()

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
