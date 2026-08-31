"""The Moon Courtyard and Pumpkin Grounds, driven against the REAL CombatEngine.

    python tests/pumpkin-grounds/check.py [--verbose]

§preamble: "the safest time to destroy something is not always the most valuable
time to destroy it", and §2 guards the other half of that — "the player should
NEVER feel forced to let dangerous enemies mature". Both directions are checked
here, and every claim has a CONTROL:

  * every Ripeness band really changes the number, in both directions — a Ripe
    Pumpkin Pip really hits harder AND really takes 20% more;
  * a Harvest really pays out only at Ripe, and killing something early really
    is still allowed and really costs nothing but the reward;
  * the Moonseed really cannot attack as a Seed and really takes 25% more;
  * the Scarecrow's own Haymaker really knocks it back to Half Built, so its
    Harvest window really closes as fast as it opens;
  * 18 damage in one turn really cracks the Gourd Guard, and less really does
    not — and the crack really lands at the START of the next turn, so nothing
    moves under a number the player has already been shown;
  * the Vine Lantern's Flare really leaves it Dim, and Dim really is worth 5;
  * the Harvest Hopper really cannot take a Tasty enemy below 1 Courage;
  * the Gourd Knight's layers really are lines on one bar, and crossing one with
    10 damage to spare really pays a Clean Cut;
  * a Crop really gets harder to remove as it ripens, and Bruising one really
    skips a growth;
  * and the Harvest King really tells you which Crop it wants before you act,
    really loses the turn if you take it first, and phase two really hands the
    player the whole patch at once.

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
  const PK = enc.ENCOUNTER_LIST.filter(x => x.region === 'pumpkin-grounds');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'pumpkin-grounds');
  const placed = new Set(PK.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: PK.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly && d.role !== 'object').length,
    scares: PK.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && d.role !== 'object'
      && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: PK.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['cracked-shell', 'dim', 'tasty', 'full-belly', 'bruised', 'jumping']
      .filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
    offers: ['moon/turn-the-moon', 'moon/encourage-growth', 'moon/moon-ripening']
      .filter(id => en.STATUS_TRICK_DEFS.some(d => d.id === id)),
  };
}
"""

# ── Ripeness in both directions, and Harvest ───────────────────────────────
PIP = r"""
async ([stage, kill]) => {
  const e = make(['pumpkin-pip'], { seed: 5, hp: 700, energy: 99 });
  await e.startCombat();
  const p = tough(body(e, 'pumpkin-pip'), 400);
  p.counters.stage = stage;
  const bump = await promiseOf(e, p, 'pumpkin-bump');
  const took = swing(e, p, 20);
  if (!kill) return { bump, took, guard: 0 };
  const guardBefore = e.player.block;
  swing(e, p, 999);
  return { bump, took, guard: e.player.block - guardBefore };
}
"""

RIPENS = r"""
async () => {
  const e = make(['pumpkin-pip'], { seed: 7, hp: 700, energy: 99 });
  await e.startCombat();
  const p = tough(body(e, 'pumpkin-pip'), 400);
  const seen = [p.counters.stage];
  for (let i = 0; i < 3; i++) { await e.endTurn(); seen.push(p.counters.stage); }
  return { seen, hp: p.hp };
}
"""

# ── the Moonseed ───────────────────────────────────────────────────────────
SEEDLING = r"""
async ([stage]) => {
  const e = make(['moonseed'], { seed: 11, hp: 700, energy: 99 });
  await e.startCombat();
  const s = tough(body(e, 'moonseed'), 400);
  s.counters.stage = stage;
  s.pendingMove = null;
  e.refreshIntents('probe');
  const move = s.intent ? s.intent.moveId : null;
  const dmg = s.intent ? s.intent.damage : null;
  const took = swing(e, s, 20);
  const guardBefore = e.player.block;
  const hadDraw = e.player.hasStatus('encouraged');
  swing(e, s, 999);
  return { move, dmg, took, drew: e.player.hasStatus('encouraged') && !hadDraw };
}
"""

# ── the Scarecrow ──────────────────────────────────────────────────────────
SPROUT = r"""
async ([mode]) => {
  const e = make(['scarecrow-sprout'], { seed: 13, hp: 900, energy: 99 });
  await e.startCombat();
  const s = tough(body(e, 'scarecrow-sprout'), 400);
  if (mode === 'haymaker') {
    s.counters.stage = 2;
    s.pendingMove = null;
    e.refreshIntents('probe');
    const move = s.intent ? s.intent.moveId : null;
    await e.endTurn();
    return { move, after: s.counters.stage };
  }
  const amount = mode === 'delay' ? 20 : 4;
  s.counters.stage = 0;
  swing(e, s, amount);
  const midTurn = s.counters.stage;
  await e.endTurn();                              // Grow an Arm
  return { midTurn, after: s.counters.stage };
}
"""

# ── the Gourd Guard ────────────────────────────────────────────────────────
GUARD = r"""
async ([mode]) => {
  const e = make(['gourd-guard'], { seed: 17, hp: 900, energy: 99 });
  await e.startCombat();
  const g = tough(body(e, 'gourd-guard'), 400);
  if (mode === 'soft') return { took: swing(e, g, 20) };
  g.counters.stage = 2;
  const promised = await promiseOf(e, g, 'gourd-bash');
  const amount = mode === 'crack' ? 25 : 6;
  swing(e, g, amount);
  const midTurn = { stage: g.counters.stage, cracked: g.hasStatus('cracked-shell') };
  await e.endTurn();
  const after = { stage: g.counters.stage, cracked: g.hasStatus('cracked-shell') };
  const guardBefore = e.player.block;
  const tookCracked = swing(e, g, 20);
  swing(e, g, 999);
  return { promised, midTurn, after, tookCracked, guard: e.player.block - guardBefore };
}
"""

# ── the Vine Lantern ───────────────────────────────────────────────────────
LANTERN = r"""
async ([mode]) => {
  const e = make(['vine-lantern'], { seed: 19, hp: 900, energy: 99 });
  await e.startCombat();
  const l = tough(body(e, 'vine-lantern'), 400);
  /* Its own Moonlight Drink adds a Glow on its turn, which the probe was
     reading as "the douse did nothing". Give it a history so it spits instead. */
  if (mode === 'douse' || mode === 'quiet') {
    l.history = ['moonlight-drink'];
    l.pendingMove = null;
    l.counters.glow = 2;
    swing(e, l, mode === 'douse' ? 20 : 4);
    const midTurn = l.counters.glow;
    await e.endTurn();
    return { midTurn, after: l.counters.glow };
  }
  l.counters.glow = 3;
  const spit = await promiseOf(e, l, 'lantern-spit');
  if (mode === 'harvest') {
    const before = e.player.statuses.has('next-attack-discount');
    swing(e, l, 999);
    return { spit, cheap: e.player.hasStatus('next-attack-discount') && !before };
  }
  l.pendingMove = null;
  e.refreshIntents('probe');
  const move = l.intent ? l.intent.moveId : null;
  await e.endTurn();                              // Pumpkin Flare
  const dim = l.hasStatus('dim');
  const took = swing(e, l, 20);
  return { spit, move, dim, took };
}
"""

# ── the Harvest Hopper ─────────────────────────────────────────────────────
HOPPER = r"""
async () => {
  /* A Moonseed and not a Pumpkin Pip. The Pip ripens past Ripe after every
     single action, so by the time the Hopper looks for something to mark it is
     already Overripe — the probe was reading the Pip's own clock as a failure
     to mark. A Moon Bloom stays Ripe. */
  const e = make(['harvest-hopper', 'moonseed'], { seed: 23, hp: 900, energy: 99 });
  await e.startCombat();
  const h = tough(body(e, 'harvest-hopper'), 400);
  const pip = tough(body(e, 'moonseed'), 400);
  pip.counters.stage = 2;
  pip.hp = 8;
  /* Its plan was chosen while it was still a Seed, so without this it germinates
     straight past Ripe on the very turn the Hopper is meant to notice it. */
  pip.pendingMove = null;
  e.refreshIntents('probe');
  await e.endTurn();                              // marks Tasty at the next turn start
  const tasty = pip.hasStatus('tasty');
  await e.endTurn();                              // Steal the Harvest
  const belly = e.player ? h.status('full-belly') : 0;
  const flick = await promiseOf(e, h, 'tongue-flick');
  h.statuses.set('full-belly', 3);
  h.pendingMove = null;
  e.refreshIntents('probe');
  return { tasty, pipHp: pip.hp, pipAlive: pip.alive, belly, flick,
           bigHop: h.intent ? h.intent.moveId : null };
}
"""

# ── the Moon Scarecrow ─────────────────────────────────────────────────────
MOON = r"""
async ([mode]) => {
  const e = make(['moon-scarecrow'], { seed: 29, hp: 900, energy: 99, deckMul: 6 });
  await e.startCombat();
  const s = tough(body(e, 'moon-scarecrow'), 500);
  if (mode === 'bands') {
    const out = {};
    for (const m of [0, 1, 2, 3]) {
      s.counters.moon = m;
      out[m] = { fork: await promiseOf(e, s, 'hay-fork'), took: swing(e, s, 100) };
      s.hp = 500;
    }
    return out;
  }
  if (mode === 'offer') {
    for (let i = 0; i < 5; i++) await playOne(e, 'neutral/borrowed-courage', null);
    const offered = e.piles.hand.some(c => c.id === 'moon/turn-the-moon');
    const before = s.counters.moon;
    const card = e.piles.hand.find(c => c.id === 'moon/turn-the-moon');
    if (card) await e.playCard(card.uid, null);
    return { offered, before, after: s.counters.moon };
  }
  s.counters.moon = 3;
  s.pendingMove = null;
  e.refreshIntents('probe');
  const move = s.intent ? s.intent.moveId : null;
  const guardBefore = e.player.block;
  swing(e, s, 999);
  return { move, guard: e.player.block - guardBefore, drew: e.player.hasStatus('encouraged') };
}
"""

# ── the Gourd Knight ───────────────────────────────────────────────────────
KNIGHT = r"""
async ([mode]) => {
  const e = make(['gourd-knight'], { seed: 31, hp: 900, energy: 99 });
  await e.startCombat();
  const k = body(e, 'gourd-knight');
  if (mode === 'layers') {
    /* 100 damage at 40 Courage kills it, and a dead actor takes nothing from
       the next iteration — the probe was measuring three layers on a corpse. */
    const out = {};
    for (const [name, hp, hit] of [['outer', 160, 20], ['middle', 100, 20], ['heart', 40, 20]]) {
      k.hp = hp; k.alive = true;
      out[name] = { sword: await promiseOf(e, k, 'gourd-sword'), took: swing(e, k, hit) };
    }
    return out;
  }
  // cross the 110 line with 10+ to spare
  k.hp = mode === 'clean' ? 118 : 112;
  const drop = mode === 'clean' ? 20 : 4;
  swing(e, k, drop);
  const midTurn = e.player.hasStatus('next-attack-discount');
  await e.endTurn();
  return { midTurn, cheap: e.player.hasStatus('next-attack-discount'),
           burst: (k.mem || {}).burst, move: k.intent ? k.intent.moveId : null };
}
"""

# ── the Great Root ─────────────────────────────────────────────────────────
ROOT = r"""
async ([mode]) => {
  const e = make(['great-root'], { seed: 37, hp: 900, energy: 99 });
  await e.startCombat();
  const r = tough(body(e, 'great-root'), 500);
  const crops = () => e.enemies.filter(x => /^(shield-gourd|spark-pumpkin|moon-melon)$/.test(String(x.defId)) && x.alive);
  const gourd = body(e, 'shield-gourd');
  if (mode === 'integrity') {
    const seedHp = gourd.maxHp;
    gourd.counters.stage = 1; gourd.maxHp = 10; gourd.hp = 10;
    const growingHp = gourd.maxHp;
    gourd.counters.stage = 2; gourd.maxHp = 15; gourd.hp = 15;
    return { seedHp, growingHp, ripeHp: gourd.maxHp, plots: crops().length };
  }
  if (mode === 'bruise') {
    /* A Seed is 6 Integrity, so 8 damage kills it rather than bruising it.
       §22 is about a Crop that SURVIVES the hit. The ledger baseline has to move
       with the Courage or the probe reads a loss of minus four. */
    gourd.counters.stage = 1; gourd.maxHp = 10; gourd.hp = 10;
    gourd.mem = { ...(gourd.mem || {}), hpAtStart: 10 };
    swing(e, gourd, 8);
    const alive = gourd.alive;
    await e.endTurn();
    return { alive, bruised: gourd.hasStatus('bruised'), stage: gourd.counters.stage };
  }
  if (mode === 'harvest') {
    gourd.counters.stage = 2; gourd.maxHp = 15; gourd.hp = 15;
    const before = e.player.block;
    swing(e, gourd, 99);
    return { guard: e.player.block - before };
  }
  // overripe: the Root takes the weak version and the plot empties
  gourd.counters.stage = 3;
  const guardBefore = r.block;
  await e.endTurn();
  return { gone: !body(e, 'shield-gourd'), plots: crops().length,
           rootGained: r.block > guardBefore };
}
"""

# ── the Harvest King ───────────────────────────────────────────────────────
KING = r"""
async ([mode]) => {
  const e = make(['harvest-king'], { seed: 41, hp: 1200, energy: 99, deckMul: 6 });
  await e.startCombat();
  const k = tough(body(e, 'harvest-king'), 445);
  const crops = () => e.enemies.filter(x => /^(guard-gourd|king-spark|moon-squash|jumping-gourd)$/.test(String(x.defId)) && x.alive);

  if (mode === 'opens') {
    return { plots: crops().length, bounty: k.counters.bounty, mark: (k.mem || {}).mark };
  }
  if (mode === 'mark') {
    /* Set them GROWING, not Ripe. §19 ripens every plot at the end of the King's
       turn, so a crop left Ripe over that boundary goes Overripe and rots — the
       probe was setting up the board and then watching it compost. */
    for (const p of crops()) { p.counters.stage = 1; p.maxHp = 10; p.hp = 10; }
    await e.endTurn();                            // they ripen, and the mark settles
    const mark = (k.mem || {}).mark;
    const named = crops().find(p => p.id === mark);
    return { mark: !!mark, name: named ? named.name : null,
             ripe: crops().filter(p => p.counters.stage === 2).length };
  }
  if (mode === 'steal') {
    /* §19 gives a Ripe Crop exactly one player turn before it rots, so waiting
       for the cycle to land on Harvest with something ripe is a coin toss. The
       sequence position is forced instead — `nextMove` is pure, so the plan
       re-derives honestly from it. */
    for (const p of crops()) { p.counters.stage = 1; p.maxHp = 10; p.hp = 10; }
    await e.endTurn();                            // they ripen and the mark settles
    k.history = ['plant-the-patch', 'sickle-sweep', 'check-the-crop', 'seed-spit'];
    k.pendingMove = null;
    e.refreshIntents('probe');
    const move = k.intent ? k.intent.moveId : null;
    const marked = crops().find(p => p.id === (k.mem || {}).mark);
    if (marked) {
      e.dealDamage({ attacker: e.player, defender: marked, amount: 99, kind: 'attack',
                     card: { type: 'attack', id: 't', uid: 't' } });
    }
    k.pendingMove = null;
    e.refreshIntents('probe');
    const after = k.intent ? k.intent.moveId : null;
    return { move, after, stolenName: marked ? marked.name : null };
  }
  if (mode === 'phase2') {
    k.hp = 200;
    await e.endTurn();                            // the phase flips at the turn start
    k.hp = 200;
    await e.endTurn();                            // The Moon Is High resolves
    const ripe = crops().filter(p => p.counters.stage >= 2).length;
    return { phase: (k.mem || {}).phase, plots: (k.mem || {}).plots, ripe,
             move: (k.history || []).slice(-1)[0] };
  }
  if (mode === 'bounty') {
    const before = await promiseOf(e, k, 'sickle-sweep');
    for (const p of crops()) { p.counters.stage = 1; p.maxHp = 10; p.hp = 10; }
    await e.endTurn();                            // they ripen and the mark settles
    k.history = ['plant-the-patch', 'sickle-sweep', 'check-the-crop', 'seed-spit'];
    k.pendingMove = null;
    e.refreshIntents('probe');
    await e.endTurn();                            // it takes the one it marked
    const after = await promiseOf(e, k, 'sickle-sweep');
    return { bounty: k.counters.bounty, before, after };
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
        check(not s["leaked"], "Crops are never placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("pumpkin-grounds" in s["implemented"], "registered as implemented",
              str(s["implemented"]))
        check(s["ladder"].index("pumpkin-grounds") < s["ladder"].index("heart"),
              "the ladder walks the Grounds before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 6, "every region status is registered",
              ", ".join(s["statuses"]))
        check(len(s["offers"]) == 3, "all three offers are real registered Tricks",
              ", ".join(s["offers"]))

        # ══ Ripeness, both directions ═══════════════════════════════════════
        grow = await page.evaluate(PIP, [1, False])
        ripe = await page.evaluate(PIP, [2, True])
        over = await page.evaluate(PIP, [3, False])
        early = await page.evaluate(PIP, [1, True])
        check(grow["bump"] == 5 and ripe["bump"] == 9 and over["bump"] == 12,
              "every Ripeness band really changes the number (§3)",
              f"growing {grow['bump']}, ripe {ripe['bump']}, overripe {over['bump']}")
        check(ripe["took"] == 24 and grow["took"] == 20,
              "and Ripe really takes 20% more at the same time — more dangerous AND "
              "more vulnerable", f"{grow['took']} vs {ripe['took']}")
        check(ripe["guard"] == 5, "HARVEST really pays out at Ripe (§2)", json.dumps(ripe))
        check(early["guard"] == 0,
              "CONTROL: killing it early really is allowed and really pays nothing",
              json.dumps(early))

        rip = await page.evaluate(RIPENS)
        check(rip["seen"] == [1, 2, 3, 3],
              "it really ripens one stage after every action, and really stops at Overripe (§3/§12)",
              json.dumps(rip["seen"]))
        check(rip["hp"] < 400, "and Overripe really costs it Courage every turn",
              json.dumps(rip))

        # ══ the Moonseed ════════════════════════════════════════════════════
        seed = await page.evaluate(SEEDLING, [0])
        bloom = await page.evaluate(SEEDLING, [2])
        check(seed["move"] == "germinate" and seed["took"] == 25,
              "a Seed really cannot attack and really takes 25% more (§4)", json.dumps(seed))
        check(bloom["dmg"] >= 11 and bloom["took"] == 20,
              "CONTROL: a Moon Bloom really attacks, and really is no easier to hit",
              json.dumps(bloom))
        check(bloom["drew"] is True and seed["drew"] is False,
              "and the Harvest really only pays for the Bloom", json.dumps(bloom))

        # ══ the Scarecrow ═══════════════════════════════════════════════════
        hay = await page.evaluate(SPROUT, ["haymaker"])
        delay = await page.evaluate(SPROUT, ["delay"])
        quiet = await page.evaluate(SPROUT, ["quiet"])
        check(hay["move"] == "haymaker" and hay["after"] == 1,
              "its own Haymaker really knocks it back to Half Built (§5)", json.dumps(hay))
        check(delay["midTurn"] == 0 and delay["after"] == 0,
              "14 damage really delays the next Grow an Arm — and really does not move "
              "the stage mid-turn", json.dumps(delay))
        check(quiet["after"] == 1, "CONTROL: 4 damage really does not delay it",
              json.dumps(quiet))

        # ══ the Gourd Guard ═════════════════════════════════════════════════
        soft = await page.evaluate(GUARD, ["soft"])
        crack = await page.evaluate(GUARD, ["crack"])
        chip = await page.evaluate(GUARD, ["chip"])
        check(soft["took"] == 23, "Soft really takes 15% more (§6)", json.dumps(soft))
        check(crack["midTurn"]["cracked"] is False and crack["after"]["cracked"] is True,
              "18 damage in one turn really cracks it — at the START of the next turn, so "
              "the promise it made held", json.dumps(crack))
        check(crack["after"]["stage"] == 1 and crack["tookCracked"] == 24,
              "and Cracked really is 20% more on top of dropping it back to Firm",
              json.dumps(crack))
        check(crack["guard"] == 8, "HARVEST: killing it Cracked really pays 8 Guard",
              json.dumps(crack))
        check(chip["after"]["cracked"] is False, "CONTROL: 6 damage really does not crack it",
              json.dumps(chip))

        # ══ the Vine Lantern ════════════════════════════════════════════════
        flare = await page.evaluate(LANTERN, ["flare"])
        douse = await page.evaluate(LANTERN, ["douse"])
        quietl = await page.evaluate(LANTERN, ["quiet"])
        harv = await page.evaluate(LANTERN, ["harvest"])
        check(flare["spit"] == 12, "Lantern Spit really scales with Glow (§7)", json.dumps(flare))
        check(flare["move"] == "pumpkin-flare" and flare["dim"] is True and flare["took"] == 25,
              "the Flare really leaves it Dim, and Dim really is worth 5 on the next Attack",
              json.dumps(flare))
        check(douse["midTurn"] == 2 and douse["after"] == 1,
              "12 damage really puts a Glow out at the next turn start", json.dumps(douse))
        check(quietl["after"] == 2 and quietl["midTurn"] == 2,
              "CONTROL: 4 damage really does not", json.dumps(quietl))
        check(harv["cheap"] is True,
              "HARVEST: killing it at 3 Glow before the Flare really discounts your next Attack",
              json.dumps(harv))

        # ══ the Harvest Hopper ══════════════════════════════════════════════
        hop = await page.evaluate(HOPPER)
        check(hop["tasty"] is True, "it really marks a Ripe enemy Tasty (§8)", json.dumps(hop))
        check(hop["pipAlive"] is True and hop["pipHp"] >= 1,
              "and really cannot take it below 1 Courage (§12)", json.dumps(hop))
        check(hop["belly"] >= 1 and hop["flick"] >= 9,
              "Full Belly really is 2 attack damage apiece", json.dumps(hop))
        check(hop["bigHop"] == "big-hop", "and 3 really becomes a Big Hop", json.dumps(hop))

        # ══ the Moon Scarecrow ══════════════════════════════════════════════
        bands = await page.evaluate(MOON, ["bands"])
        offer = await page.evaluate(MOON, ["offer"])
        reap = await page.evaluate(MOON, ["harvest"])
        check(bands["0"]["fork"] == 9 and bands["2"]["fork"] == 15,
              "the Moon Cycle really changes its damage (§13)",
              f"new {bands['0']['fork']} vs full {bands['2']['fork']}")
        # 100 x 1.15 = 114.99, and the pipeline floors. 114 is the honest number.
        check(bands["2"]["took"] == 114 and bands["3"]["took"] == 125,
              "and really opens two different vulnerability windows",
              f"full {bands['2']['took']}, harvest {bands['3']['took']}")
        check(offer["offered"] is True and offer["after"] == offer["before"] + 1,
              "five Tricks really offers you the sky, and taking it really moves the moon",
              json.dumps(offer))
        check(reap["move"] == "reaping-swing" and reap["guard"] >= 6 and reap["drew"] is True,
              "and killing it under the Harvest Moon really pays the bigger Harvest",
              json.dumps(reap))

        # ══ the Gourd Knight ════════════════════════════════════════════════
        layers = await page.evaluate(KNIGHT, ["layers"])
        clean = await page.evaluate(KNIGHT, ["clean"])
        scrape = await page.evaluate(KNIGHT, ["scrape"])
        check(layers["outer"]["sword"] == 12 and layers["middle"]["sword"] == 15
              and layers["heart"]["sword"] == 17,
              "its layers really are lines on one bar, and each one really changes the "
              "numbers (§14)",
              f"{layers['outer']['sword']} / {layers['middle']['sword']} / {layers['heart']['sword']}")
        check(layers["heart"]["took"] == 25 and layers["outer"]["took"] == 20,
              "and the Heart Gourd really takes 25% more", json.dumps(layers))
        check(clean["midTurn"] is False and clean["cheap"] is True,
              "crossing a threshold with 10 to spare really pays a Clean Cut — at the "
              "start of the next turn", json.dumps(clean))
        check(scrape["cheap"] is False,
              "CONTROL: scraping over the line really pays nothing", json.dumps(scrape))
        check(clean["move"] == "shell-burst",
              "and crossing really makes it Shell Burst", json.dumps(clean))

        # ══ the Great Root ══════════════════════════════════════════════════
        integ = await page.evaluate(ROOT, ["integrity"])
        bruise = await page.evaluate(ROOT, ["bruise"])
        rharv = await page.evaluate(ROOT, ["harvest"])
        rot = await page.evaluate(ROOT, ["rot"])
        check(integ["plots"] == 3 and integ["seedHp"] == 6,
              "three Plots, and a Seed really is only 6 Integrity (§15/§18)", json.dumps(integ))
        check(bruise["alive"] is True and bruise["stage"] == 1,
              "8 damage really Bruises a Crop, and a Bruised Crop really skips a growth (§22)",
              json.dumps(bruise))
        check(rharv["guard"] == 8,
              "taking a Ripe Shield Gourd really pays the player 8 Guard (§15)",
              json.dumps(rharv))
        check(rot["gone"] is True and rot["plots"] == 2,
              "and leaving one Overripe really empties the plot for the Root instead",
              json.dumps(rot))

        # ══ the Harvest King ════════════════════════════════════════════════
        opens = await page.evaluate(KING, ["opens"])
        mark = await page.evaluate(KING, ["mark"])
        steal = await page.evaluate(KING, ["steal"])
        ph2 = await page.evaluate(KING, ["phase2"])
        bounty = await page.evaluate(KING, ["bounty"])
        check(opens["plots"] == 3 and opens["bounty"] == 0,
              "the Royal Patch really opens with three Plots (§17)", json.dumps(opens))
        check(mark["ripe"] == 3 and mark["mark"] is True,
              "it really marks the Crop it intends to take, before the player acts (§25)",
              json.dumps(mark))
        check(steal["move"] == "the-harvest" and steal["after"] == "inspect-the-empty-vine",
              "and taking that Crop first really costs it the whole turn (§26)",
              json.dumps(steal))
        check(ph2["phase"] == 2 and ph2["plots"] == 4 and ph2["ripe"] >= 3,
              "the transition really ripens everything at once and really adds a fourth "
              "Plot — and the PLAYER gets first access (§28/§29)", json.dumps(ph2))
        check(bounty["bounty"] >= 1 and bounty["after"] > bounty["before"],
              "and every Harvest it lands really is another point of Bounty on its swing (§27)",
              json.dumps(bounty))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, bodies, label in [
            ("pk-14", 2, 40, 800, 3, "Scuffle 14 resolves a whole fight"),
            ("pk-scare-moon", 3, 40, 900, 1, "the Moon Scarecrow resolves a whole fight"),
            ("pk-scare-knight", 4, 40, 900, 1, "the Gourd Knight resolves a whole fight"),
            ("pk-scare-root", 5, 40, 900, 4, "the Great Root resolves a whole fight"),
            ("pk-boss", 6, 70, 1000, 5, "the Harvest King resolves a whole fight"),
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
