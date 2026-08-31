"""The Kennels and Animal Ward, driven against the REAL CombatEngine.

    python tests/kennels/check.py [--verbose]

§2 is the strictest set of promises any region chapter makes — a Ward Animal
"cannot die during combat", is "never directly attacked", and reaching Fright 3
means "there is NO PERMANENT INJURY" — and §3 adds that freeing one "is NOT
MANDATORY". Promises about what CANNOT happen are the ones worth a gate, so most
of this file is about those, and every claim has a CONTROL:

  * a Ward Animal really cannot be aimed at AND really takes nothing from a
    sweep that does not aim, which is the half a single flag would have missed;
  * Fright 3 really makes it hide rather than die, and really costs it nothing;
  * a fight with only an unkillable animal left really ends;
  * breaking every Restraint really frees it, and leaving one really does not;
  * the Cage really repairs its own latch, the Collar really only taxes the
    fourth Trick, the Tether really is a threshold one big swing can skip;
  * Stable really survives a lethal blow at 1 Courage, and 14 damage really
    breaks it;
  * the Blanket really takes the first 8 for whoever it covers;
  * a Loose Buckle really is counted at the START of the next turn, so the
    Collector's bigger swing is never a surprise;
  * every Rolling Ward pen really carries its own passive, and losing the animal
    to Fright really removes it too;
  * the Perfect Pen's Safety really climbs when it is left alone;
  * and Trust really keeps paying in phase two, where the animals are gone.

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
  if (a.mem && a.mem.hpAtStart != null) a.mem.hpAtStart = hp;
  return a;
};
window.promiseOf = async function (e, actor, moveId) {
  const en = window.__Y.en;
  const move = en.getEnemy(actor.defId).moves[moveId];
  const ctx = e.enemyCtx(actor, move);
  return move.damageFn ? move.damageFn(ctx) : (move.damage ?? null);
};
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const KN = enc.ENCOUNTER_LIST.filter(x => x.region === 'kennels');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'kennels');
  const placed = new Set(KN.flatMap(f => f.members.map(m => m.enemyId)));
  const withAnimal = KN.filter(f => f.tier !== 'boss'
    && f.members.some(m => /^ward-(pup|cat|bird)$/.test(m.enemyId)));
  return {
    formations: KN.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly && d.role !== 'object'
      && d.role !== 'ward').length,
    scares: KN.filter(f => f.tier === 'elite').length,
    withAnimal: withAnimal.length,
    twoAnimals: KN.filter(f => f.members.filter(m => /^ward-(pup|cat|bird)$/.test(m.enemyId)).length > 1).length,
    firstCageHasAnimal: !!(enc.ENCOUNTERS['kn-1']
      && enc.ENCOUNTERS['kn-1'].members.some(m => /^ward-/.test(m.enemyId))),
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && d.role !== 'object'
      && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: KN.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['ward-animal', 'encouraged', 'tight-collar', 'enclosed', 'tethered', 'stable',
               'tucked', 'energy-treat', 'pulled-back', 'short-collar-rule', 'heavy-collar-rule',
               'bell-collar-rule', 'spare-collar-rule', 'gentle-restraint', 'leashed',
               'trusted', 'held-fast', 'outvoted']
      .filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
  };
}
"""

# ── a Ward Animal cannot be aimed at, and cannot be swept ───────────────────
UNTOUCHABLE = r"""
async () => {
  const e = make(['walking-cage', 'ward-pup'], { seed: 5, hp: 700, energy: 99 });
  await e.startCombat();
  const animal = body(e, 'ward-pup');
  const cage = body(e, 'walking-cage');
  const atk = { type: 'attack' }, skl = { type: 'skill' }, pow = { type: 'power' };
  const aimable = {
    attack: e.isTargetable(animal, atk), skill: e.isTargetable(animal, skl),
    power: e.isTargetable(animal, pow), cage: e.isTargetable(cage, atk),
  };
  /* The half a single flag misses: a sweep never consults targeting. */
  const before = animal.hp;
  for (const en0 of e.livingEnemies()) {
    e.dealDamage({ attacker: e.player, defender: en0, amount: 99, kind: 'attack',
                   card: { type: 'attack', id: 'aoe', uid: 'aoe' } });
  }
  return { aimable, sweptFor: before - animal.hp, aliveAfterSweep: animal.alive };
}
"""

# ── Fright, and what it does and does not cost ──────────────────────────────
FRIGHT = r"""
async ([to]) => {
  const e = make(['collar-keeper', 'ward-pup'], { seed: 9, hp: 900, energy: 99 });
  await e.startCombat();
  const animal = body(e, 'ward-pup');
  tough(body(e, 'collar-keeper'), 400);
  animal.counters.fright = to;
  const kn = await import('/game/src/data/enemies/kennels.js');
  kn.frighten(e.enemyCtx(body(e, 'collar-keeper'), null), animal, 1);
  const still = body(e, 'ward-pup');
  return { fright: animal.counters.fright, onBoard: !!still, hp: animal.hp, alive: animal.alive };
}
"""

# ── freeing, and not-quite-freeing ─────────────────────────────────────────
FREE = r"""
async ([breakAll]) => {
  const e = make(['walking-cage', 'collar-keeper', 'ward-pup'], { seed: 11, hp: 900, energy: 99 });
  await e.startCombat();
  tough(body(e, 'walking-cage'), 400);
  tough(body(e, 'collar-keeper'), 400);
  const animal = body(e, 'ward-pup');
  const restraints = e.enemies.filter(x => /^(cage-latch|ward-collar|ward-leash)$/.test(String(x.defId)) && x.alive);
  const kill = breakAll ? restraints : restraints.slice(0, 1);
  for (const r of kill) {
    e.dealDamage({ attacker: e.player, defender: r, amount: 99, kind: 'attack',
                   card: { type: 'attack', id: 't', uid: 't' } });
  }
  return {
    restraints: restraints.length,
    stillThere: !!body(e, 'ward-pup'),
    encouraged: e.player.hasStatus('encouraged'),
    guard: e.player.block,
  };
}
"""

# ── the fight ends even though the animal cannot be killed ─────────────────
ENDS = r"""
async () => {
  const e = make(['walking-cage', 'ward-pup'], { seed: 13, hp: 900, energy: 99 });
  await e.startCombat();
  for (const x of e.enemies.slice()) {
    if (x.defId === 'ward-pup') continue;
    e.dealDamage({ attacker: e.player, defender: x, amount: 999, kind: 'attack',
                   card: { type: 'attack', id: 't', uid: 't' } });
  }
  return { over: e.over, victory: e.victory, left: e.livingEnemies().map(x => x.defId) };
}
"""

# ── the Walking Cage ───────────────────────────────────────────────────────
CAGE = r"""
async ([mode]) => {
  const ids = mode === 'noAnimal' ? ['walking-cage', 'collar-keeper']
    : ['walking-cage', 'ward-pup'];
  const e = make(ids, { seed: 17, hp: 900, energy: 99 });
  await e.startCombat();
  const cage = tough(body(e, 'walking-cage'), 400);
  const latch = body(e, 'cage-latch');
  if (mode === 'noAnimal') {
    const friend = body(e, 'collar-keeper');
    friend._enclosedSpent = false;
    const took = swing(e, friend, 20);
    return { enclosed: friend.hasStatus('enclosed'), took };
  }
  if (mode === 'repair') {
    swing(e, latch, 4);
    const hurt = latch.hp;
    await e.endTurn(); await e.endTurn(); await e.endTurn();
    return { hurt, healed: latch.hp };
  }
  const withLatch = await promiseOf(e, cage, 'rattle');
  const blockWith = window.__Y.en.getEnemy('walking-cage').moves.rattle.blockFn(e.enemyCtx(cage, null));
  e.dealDamage({ attacker: e.player, defender: latch, amount: 99, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  const blockWithout = window.__Y.en.getEnemy('walking-cage').moves.rattle.blockFn(e.enemyCtx(cage, null));
  return { blockWith, blockWithout, latchGone: !body(e, 'cage-latch') };
}
"""

# ── the Collar Keeper ──────────────────────────────────────────────────────
COLLAR = r"""
async ([mode]) => {
  const e = make(['collar-keeper', 'ward-pup'], { seed: 19, hp: 900, energy: 99, deckMul: 4 });
  await e.startCombat();
  const k = tough(body(e, 'collar-keeper'), 400);
  e.applyStatus(e.player, 'tight-collar', 1, { fresh: true });
  if (mode === 'cost') {
    const costs = [];
    for (let i = 0; i < 5; i++) {
      const def = e.resolveCardDef('neutral/borrowed-courage');
      const card = e.addCard(def, 'hand', { reason: 'probe' });
      costs.push(e.costOf(card));
      await e.playCard(card.uid, null);
    }
    return { costs, gone: !e.player.hasStatus('tight-collar') };
  }
  const restraints = e.enemies.filter(x => x.defId === 'ward-collar' && x.alive).length;
  e.dealDamage({ attacker: e.player, defender: k, amount: 999, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  return { restraints, after: e.enemies.filter(x => x.defId === 'ward-collar' && x.alive).length,
           collarGone: !e.player.hasStatus('tight-collar') };
}
"""

# ── the Leash Hand's threshold ─────────────────────────────────────────────
TETHER = r"""
async ([mode]) => {
  const e = make(['leash-hand', 'collar-keeper'], { seed: 23, hp: 900, energy: 99 });
  await e.startCombat();
  const hand = tough(body(e, 'leash-hand'), 400);
  const friend = body(e, 'collar-keeper');
  await e.endTurn();                                  // Clip On
  const tethered = friend.hasStatus('tethered');
  if (mode === 'skip') swing(e, friend, 999);         // straight past the threshold
  else swing(e, friend, Math.ceil(friend.maxHp * 0.6));
  await e.endTurn(); await e.endTurn();               // Leash Snap, then Pull Back
  return { tethered, alive: friend.alive,
           guarded: friend.alive ? friend.block : 0,
           weakened: friend.alive ? friend.hasStatus('pulled-back') : false };
}
"""

# ── the Feeding Cart ───────────────────────────────────────────────────────
CART = r"""
async ([mode]) => {
  const e = make(['feeding-cart', 'ward-pup'], { seed: 29, hp: 900, energy: 99 });
  await e.startCombat();
  const cart = tough(body(e, 'feeding-cart'), 400);
  const animal = body(e, 'ward-pup');
  animal.counters.fright = 2;
  if (mode === 'spill') {
    /* TWO turns: its cycle is Cart Bump then Restock, so after one the cart is
       still empty and the probe was measuring a meal that did not exist yet. */
    await e.endTurn(); await e.endTurn();
    const had = !!(cart.mem || {}).hasMeal;
    swing(e, cart, 20);
    const midTurn = !!(cart.mem || {}).hasMeal;
    const guardBefore = e.player.block;
    await e.endTurn();
    return { had, midTurn, after: !!(cart.mem || {}).hasMeal,
             guard: e.player.block - guardBefore };
  }
  // nobody needs feeding, so it feeds the animal
  for (let i = 0; i < 4; i++) await e.endTurn();
  return { fright: animal.counters.fright };
}
"""

# ── Stable really survives a lethal blow ───────────────────────────────────
STABLE = r"""
async ([breakIt]) => {
  const e = make(['ward-orderly', 'collar-keeper'], { seed: 31, hp: 900, energy: 99 });
  await e.startCombat();
  const orderly = tough(body(e, 'ward-orderly'), 400);
  const friend = body(e, 'collar-keeper');
  friend.hp = Math.floor(friend.maxHp * 0.3);
  await e.endTurn();                                  // Stabilize
  const stable = friend.hasStatus('stable');
  if (breakIt) { swing(e, orderly, 20); await e.endTurn(); }
  const survived = friend.alive;
  swing(e, friend, 999);
  return { stable, survived, aliveAfter: friend.alive, hp: friend.hp };
}
"""

# ── the Comfort Blanket takes the first 8 ──────────────────────────────────
BLANKET = r"""
async ([mode]) => {
  const e = make(['comfort-blanket', 'collar-keeper'], { seed: 37, hp: 900, energy: 99 });
  await e.startCombat();
  const blanket = tough(body(e, 'comfort-blanket'), 400);
  const friend = tough(body(e, 'collar-keeper'), 400);
  await e.endTurn();                                  // Tuck In
  const tucked = friend.hasStatus('tucked');
  if (mode === 'unwrap') { swing(e, blanket, 20); await e.endTurn(); }
  friend._tuckedSpent = 0;
  /* Zero the Blanket's own Guard first. Tuck In gives it 5, so measuring its
     Courage would have read a redirect of 8 as a loss of 3. */
  blanket.block = 0;
  const bBefore = blanket.hp;
  const took = swing(e, friend, 20);
  return { tucked, stillTucked: friend.hasStatus('tucked'),
           took, blanketTook: bBefore - blanket.hp };
}
"""

# ── the Collar Collector: rules end at once, buckles are counted next turn ──
COLLECTOR = r"""
async ([mode]) => {
  const e = make(['collar-collector'], { seed: 41, hp: 900, energy: 99, deckMul: 4 });
  await e.startCombat();
  const boss = tough(body(e, 'collar-collector'), 500);
  const rules = ['short-collar-rule', 'heavy-collar-rule', 'bell-collar-rule']
    .filter(id => e.player.hasStatus(id));
  if (mode === 'rules') return { rules, collars: e.enemies.filter(x => /collar$/.test(String(x.defId)) && x.alive).length };
  const short = body(e, 'short-collar');
  const promisedBefore = await promiseOf(e, boss, 'tag-strike');
  e.dealDamage({ attacker: e.player, defender: short, amount: 99, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  const ruleGone = !e.player.hasStatus('short-collar-rule');
  const midTurn = await promiseOf(e, boss, 'tag-strike');
  await e.endTurn();
  const nextTurn = await promiseOf(e, boss, 'tag-strike');
  return { promisedBefore, ruleGone, midTurn, nextTurn, buckles: boss.counters.buckles };
}
"""

# ── the Rolling Ward ───────────────────────────────────────────────────────
ROLLING = r"""
async ([mode]) => {
  const e = make(['rolling-ward'], { seed: 43, hp: 900, energy: 99 });
  await e.startCombat();
  const w = tough(body(e, 'rolling-ward'), 500);
  const pens = e.enemies.filter(x => /^ward-pen-/.test(String(x.defId)) && x.alive);
  if (mode === 'passives') {
    const withPen2 = await promiseOf(e, w, 'wheel-charge');
    e.dealDamage({ attacker: e.player, defender: body(e, 'ward-pen-2'), amount: 99,
                   kind: 'attack', card: { type: 'attack', id: 't', uid: 't' } });
    const withoutPen2 = await promiseOf(e, w, 'wheel-charge');
    return { pens: pens.length, withPen2, withoutPen2, encouraged: e.player.hasStatus('encouraged') };
  }
  if (mode === 'fright') {
    for (const p of pens) p.counters.fright = 2;
    await e.endTurn(); await e.endTurn(); await e.endTurn(); await e.endTurn();
    return { left: e.enemies.filter(x => /^ward-pen-/.test(String(x.defId)) && x.alive).length,
             encouraged: e.player.hasStatus('encouraged') };
  }
  return {};
}
"""

# ── the Perfect Pen ────────────────────────────────────────────────────────
PERFECT = r"""
async ([mode]) => {
  const e = make(['perfect-pen'], { seed: 47, hp: 900, energy: 99 });
  await e.startCombat();
  const pen = tough(body(e, 'perfect-pen'), 500);
  const before = pen.counters.safety;
  if (mode === 'idle') {
    await e.endTurn(); await e.endTurn();
    return { before, after: pen.counters.safety };
  }
  const heater = body(e, 'pen-heater');
  e.dealDamage({ attacker: e.player, defender: heater, amount: 99, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  await e.endTurn();
  const afterBreak = pen.counters.safety;
  await e.endTurn();
  const repaired = !!body(e, 'pen-heater');
  return { before, afterBreak, repaired, integrity: body(e, 'pen-heater')?.hp ?? null };
}
"""

# ── the Kennelmaster ───────────────────────────────────────────────────────
MASTER = r"""
async ([mode, arg]) => {
  const e = make(['kennelmaster'], { seed: 53, hp: 1200, energy: 99, deckMul: 4 });
  await e.startCombat();
  const m = tough(body(e, 'kennelmaster'), 440);
  const sys = () => e.enemies.filter(x => /^(kennel-gate|collar-dock|lead-post)$/.test(String(x.defId)) && x.alive);

  if (mode === 'opens') {
    return { systems: sys().length, trust: (m.mem || {}).trust,
             damage: await promiseOf(e, m, 'lead-snap') };
  }
  if (mode === 'trust') {
    const withDock = await promiseOf(e, m, 'lead-snap');
    for (const s of sys()) {
      e.dealDamage({ attacker: e.player, defender: s, amount: 99, kind: 'attack',
                     card: { type: 'attack', id: 't', uid: 't' } });
    }
    const withoutDock = await promiseOf(e, m, 'lead-snap');
    await e.endTurn();
    return { trust: (m.mem || {}).trust, withDock, withoutDock,
             trusted: e.player.hasStatus('trusted'), outvoted: m.hasStatus('outvoted') };
  }
  if (mode === 'leash') {
    // three enemy turns puts Stay Close on the board
    for (let i = 0; i < 3; i++) await e.endTurn();
    const stacks = e.player.status('leashed');
    const promised = m.intent ? m.intent.hits : null;
    /* Satisfy a Break Free condition and check the committed sweep survives it. */
    for (let i = 0; i < 4; i++) await playOne(e, 'neutral/borrowed-courage', null);
    const midTurn = e.player.status('leashed');
    const hpBefore = e.player.hp;
    await e.endTurn();
    return { stacks, promised, midTurn, after: e.player.status('leashed'),
             dealt: hpBefore - e.player.hp };
  }
  if (mode === 'phase2') {
    m.hp = 200;
    await e.endTurn();
    await e.endTurn();
    return { phase: (m.mem || {}).phase, systems: sys().length,
             restraint: m.counters.restraint, leashed: e.player.status('leashed') };
  }
  if (mode === 'breakfree') {
    m.hp = 200;
    await e.endTurn(); await e.endTurn();
    m.counters.restraint = 3;
    // one condition only
    for (let i = 0; i < 4; i++) await playOne(e, 'neutral/borrowed-courage', null);
    await e.endTurn();
    const afterOne = m.counters.restraint;
    m.counters.restraint = 3;
    // two conditions: four Tricks AND 16 damage
    for (let i = 0; i < 4; i++) await playOne(e, 'neutral/borrowed-courage', null);
    swing(e, m, 30);
    await e.endTurn();
    return { afterOne, afterTwo: m.counters.restraint };
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
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("kennels" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("kennels") < s["ladder"].index("heart"),
              "the ladder walks the Kennels before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 18, "every region status is registered",
              f"{len(s['statuses'])}: " + ", ".join(s["statuses"]))
        check(s["firstCageHasAnimal"] is True,
              "the first Walking Cage encounter really carries a Ward Animal (§13)")
        check(s["twoAnimals"] == 0,
              "and no ordinary Scuffle carries two (§13)", f"{s['twoAnimals']} do")
        check(4 <= s["withAnimal"] <= 7,
              "about a third of the Scuffles carry one (§13)",
              f"{s['withAnimal']} of {s['formations']}")

        # ══ a Ward Animal cannot be hurt ════════════════════════════════════
        un = await page.evaluate(UNTOUCHABLE)
        check(un["aimable"]["attack"] is False and un["aimable"]["skill"] is False
              and un["aimable"]["power"] is False,
              "a Ward Animal really cannot be aimed at by anything (§2)", json.dumps(un["aimable"]))
        check(un["aimable"]["cage"] is True, "CONTROL: the cage beside it can be",
              json.dumps(un["aimable"]))
        check(un["sweptFor"] == 0 and un["aliveAfterSweep"] is True,
              "and a sweep that does not aim really does nothing to it either — the half "
              "a single targeting flag would have missed", json.dumps(un))

        # ══ Fright ══════════════════════════════════════════════════════════
        f2 = await page.evaluate(FRIGHT, [1])
        f3 = await page.evaluate(FRIGHT, [2])
        check(f2["fright"] == 2 and f2["onBoard"] is True,
              "Fright rises and it stays (§2)", json.dumps(f2))
        check(f3["onBoard"] is False and f3["hp"] >= 1,
              "at Fright 3 it really hides — off the board, and NOT hurt (§2)", json.dumps(f3))

        # ══ freeing ═════════════════════════════════════════════════════════
        one = await page.evaluate(FREE, [False])
        allr = await page.evaluate(FREE, [True])
        check(one["restraints"] == 2, "two enemies really fit two Restraints (§3)",
              json.dumps(one))
        check(one["stillThere"] is True and one["encouraged"] is False,
              "CONTROL: breaking one of two really does not free it", json.dumps(one))
        check(allr["stillThere"] is False and allr["encouraged"] is True and allr["guard"] >= 5,
              "breaking every Restraint really frees it, for 5 Guard and a Trick (§3)",
              json.dumps(allr))

        ends = await page.evaluate(ENDS)
        check(ends["over"] is True and ends["victory"] is True,
              "a fight whose only survivor is an unkillable animal really ends",
              json.dumps(ends))

        # ══ the Walking Cage ════════════════════════════════════════════════
        cage = await page.evaluate(CAGE, ["latch"])
        rep = await page.evaluate(CAGE, ["repair"])
        noan = await page.evaluate(CAGE, ["noAnimal"])
        check(cage["blockWith"] == 14 and cage["blockWithout"] == 10,
              "Rattle really is worth 4 more while the latch holds (§4)", json.dumps(cage))
        check(rep["healed"] > rep["hurt"],
              "and Lock It really repairs the latch, so chipping it does not work",
              f"{rep['hurt']} -> {rep['healed']}")
        check(noan["enclosed"] is True and noan["took"] == 17,
              "CONTROL: with no animal it encloses an ALLY instead — 3 off the first Attack (§4)",
              json.dumps(noan))

        # ══ the Collar Keeper ═══════════════════════════════════════════════
        cost = await page.evaluate(COLLAR, ["cost"])
        died = await page.evaluate(COLLAR, ["death"])
        check(cost["costs"][3] == cost["costs"][0] + 1,
              "Tight Collar really taxes the FOURTH Trick (§5)", json.dumps(cost["costs"]))
        check(cost["costs"][4] == cost["costs"][0] and cost["gone"] is True,
              "and really only the fourth — then the collar comes off", json.dumps(cost))
        check(died["restraints"] == 1 and died["after"] == 0 and died["collarGone"] is True,
              "killing it really undoes every buckle in the room (§5)", json.dumps(died))

        # ══ the Leash Hand ══════════════════════════════════════════════════
        pull = await page.evaluate(TETHER, ["pull"])
        skip = await page.evaluate(TETHER, ["skip"])
        check(pull["tethered"] is True and pull["guarded"] >= 9,
              "the Tether really pays out when its target drops below half (§6)",
              json.dumps(pull))
        check(pull["weakened"] is True, "and really weakens that target's next attack",
              json.dumps(pull))
        check(skip["alive"] is False,
              "CONTROL: one swing straight past the threshold and the lead never gets used",
              json.dumps(skip))

        # ══ the Feeding Cart ════════════════════════════════════════════════
        spill = await page.evaluate(CART, ["spill"])
        feed = await page.evaluate(CART, ["feed"])
        check(spill["had"] is True and spill["midTurn"] is True,
              "the meal really does not vanish mid-turn (§7)", json.dumps(spill))
        check(spill["after"] is False and spill["guard"] >= 4,
              "and 12 damage really spills it at the start of the next turn, for 4 Guard",
              json.dumps(spill))
        check(feed["fright"] < 2,
              "with nobody to feed it really feeds the ANIMAL, which is worth a Fright (§7)",
              json.dumps(feed))

        # ══ Stable ══════════════════════════════════════════════════════════
        st = await page.evaluate(STABLE, [False])
        br = await page.evaluate(STABLE, [True])
        check(st["stable"] is True and st["aliveAfter"] is True and st["hp"] == 1,
              "Stable really holds an ally at 1 Courage through a lethal blow (§8)",
              json.dumps(st))
        check(br["aliveAfter"] is False,
              "CONTROL: 14 damage to the ORDERLY really breaks it first", json.dumps(br))

        # ══ the Comfort Blanket ═════════════════════════════════════════════
        tuck = await page.evaluate(BLANKET, ["keep"])
        unw = await page.evaluate(BLANKET, ["unwrap"])
        check(tuck["tucked"] is True and tuck["took"] == 12 and tuck["blanketTook"] == 8,
              "the Blanket really takes the first 8 for whoever it covers (§9)",
              json.dumps(tuck))
        check(unw["stillTucked"] is False and unw["took"] == 20,
              "CONTROL: 12 damage to the BLANKET really pulls it off", json.dumps(unw))

        # ══ the Collar Collector ════════════════════════════════════════════
        rules = await page.evaluate(COLLECTOR, ["rules"])
        buck = await page.evaluate(COLLECTOR, ["buckle"])
        check(len(rules["rules"]) == 3 and rules["collars"] == 3,
              "all three Collars really impose their rule on the player (§14)",
              json.dumps(rules))
        check(buck["ruleGone"] is True,
              "breaking one really ends its rule immediately", json.dumps(buck))
        check(buck["midTurn"] == buck["promisedBefore"] and buck["nextTurn"] > buck["promisedBefore"],
              "and the Loose Buckle is really counted at the START of the next turn, so the "
              "bigger swing is never a surprise",
              f"{buck['promisedBefore']} / mid {buck['midTurn']} / next {buck['nextTurn']}")

        # ══ the Rolling Ward ════════════════════════════════════════════════
        pas = await page.evaluate(ROLLING, ["passives"])
        frt = await page.evaluate(ROLLING, ["fright"])
        check(pas["pens"] == 3 and pas["withPen2"] == pas["withoutPen2"] + 3,
              "each Pen really carries its own passive, and freeing really removes it (§15)",
              json.dumps(pas))
        check(pas["encouraged"] is True,
              "and the FIRST rescue really pays Encouraged", json.dumps(pas))
        check(frt["left"] == 0 and frt["encouraged"] is False,
              "CONTROL: an animal lost to Fright really opens its own pen and really "
              "gives no credit (§15)", json.dumps(frt))

        # ══ the Perfect Pen ═════════════════════════════════════════════════
        idle = await page.evaluate(PERFECT, ["idle"])
        broke = await page.evaluate(PERFECT, ["break"])
        check(idle["after"] > idle["before"],
              "Safety really climbs every turn you leave the controls alone (§16)",
              json.dumps(idle))
        check(broke["afterBreak"] <= broke["before"],
              "and breaking a control really holds it down", json.dumps(broke))
        check(broke["repaired"] is True and broke["integrity"] == 6,
              "the control really comes back after two turns at half Integrity",
              json.dumps(broke))

        # ══ the Kennelmaster ════════════════════════════════════════════════
        opens = await page.evaluate(MASTER, ["opens", 0])
        trust = await page.evaluate(MASTER, ["trust", 0])
        leash = await page.evaluate(MASTER, ["leash", 0])
        ph2 = await page.evaluate(MASTER, ["phase2", 0])
        bf = await page.evaluate(MASTER, ["breakfree", 0])
        check(opens["systems"] == 3 and opens["trust"] == 0,
              "three Containment Systems, one Ward Animal each (§18)", json.dumps(opens))
        check(trust["withDock"] == trust["withoutDock"] + 3,
              "the Collar Dock really is worth 3 damage, and really stops when it breaks (§20)",
              f"{trust['withoutDock']} -> {trust['withDock']}")
        check(trust["trust"] == 3 and trust["trusted"] is True and trust["outvoted"] is True,
              "and freeing all three really gives 3 Trust and really Outvotes it (§22)",
              json.dumps(trust))
        check(leash["stacks"] >= 1 and leash["midTurn"] == leash["stacks"],
              "Leashed really does not come off mid-turn, so a committed Kennel Sweep holds (§23)",
              json.dumps(leash))
        check(leash["after"] < leash["stacks"] or leash["stacks"] == 0,
              "and a Break Free condition really takes one off at the next turn start",
              json.dumps(leash))
        check(ph2["phase"] == 2 and ph2["systems"] == 0 and ph2["leashed"] == 0,
              "the transition really opens every pen and clears Leashed (§27)", json.dumps(ph2))
        check(bf["afterOne"] == 3, "CONTROL: ONE Break Free condition really is not enough (§30)",
              json.dumps(bf))
        check(bf["afterTwo"] == 2, "and two really does remove a Restraint", json.dumps(bf))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, bodies, label in [
            ("kn-14", 2, 40, 800, 6, "Scuffle 14 resolves a whole fight"),
            ("kn-scare-collector", 3, 40, 900, 5, "the Collar Collector resolves a whole fight"),
            ("kn-scare-rolling", 4, 40, 900, 4, "the Rolling Ward resolves a whole fight"),
            ("kn-scare-perfect", 5, 40, 900, 5, "the Perfect Pen resolves a whole fight"),
            ("kn-boss", 6, 70, 1000, 4, "the Kennelmaster resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")
            check(r["maxRules"] <= 3,
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
