"""The Withered Hedge Maze, driven against the REAL CombatEngine.

    python tests/hedge-maze/check.py [--verbose]

§8 says the region's two retaliators are deliberate opposites: "Briar Lump has
FINITE retaliation that gets stripped. Thorn Topiary continually REGROWS
retaliation unless actively pruned." Both halves of that are checked here, and
every claim has a CONTROL:

  * the Mildew Puff really banks a Disturbed per Attack and really spends the
    lot on one Puff;
  * the Briar Lump really retaliates and really runs out — and really is 20%
    softer once it does;
  * the Thorn Topiary really retaliates WITHOUT spending, really regrows every
    turn, and a single 12-damage Attack really prunes two;
  * Rotcap really regenerates under the threshold and really does not over it;
  * the Wilted Scarecrow really gets more dangerous as it dies and really drops
    a Straw Pile it heals from unless you break it;
  * the Compost Crawler really eats a wounded ally and really cannot finish it;
  * the Mold Minotaur's Charge really is interruptible while it lines up;
  * breaking a Briar Ring really removes retaliation AND really gives it Fury;
  * the Carrion Hedge's sections really grow back — and really stop below half;
  * the Gardener's Decay Cycle really advances on 22 damage, and Withered really
    is the vulnerable state.

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
() => { window.make = function make(ids, { seed = 7, hp = 500, energy = 9 } = {}) {
  const { C, en, cards, RNG } = window.__Y;
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: energy, deck: cards.startingDeckFor('mossbit') },
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
/** An Attack Trick landing, which is what every retaliation rule is worded about. */
window.swing = function (e, target, amount) {
  target.block = 0;
  const hpBefore = e.player.hp;
  const tBefore = target.hp;
  e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  return { dealt: tBefore - target.hp, tookBack: hpBefore - e.player.hp };
};
window.bodies = function (e, defId) { return e.enemies.filter(x => x.defId === defId && x.alive); };
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const HM = enc.ENCOUNTER_LIST.filter(x => x.region === 'hedge-maze');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'hedge-maze');
  const placed = new Set(HM.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: HM.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly && d.role !== 'object').length,
    scares: HM.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: HM.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['mildewed', 'bare'].filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
  };
}
"""

PUFF = r"""
async ([hits]) => {
  const e = make(['mildew-puff'], { seed: 11, hp: 600, energy: 99 });
  await e.startCombat();
  const p = e.enemies[0];
  for (let i = 0; i < hits; i++) swing(e, p, 2);
  const banked = p.counters.disturbed || 0;
  p.history = ['mildew-cloud', 'soft-roll'];       // next beat is Puff
  e.refreshIntents('test');
  return { hits, banked, move: p.pendingMove ? p.pendingMove.id : null,
           intent: p.intent ? p.intent.damage : null };
}
"""

BRIAR = r"""
async ([swings]) => {
  const e = make(['briar-lump'], { seed: 13, hp: 600, energy: 99 });
  await e.startCombat();
  const b = e.enemies[0];
  let back = 0;
  for (let i = 0; i < swings; i++) back += swing(e, b, 3).tookBack;
  const briars = b.counters.briars || 0;
  // 20% vulnerability once Bare
  b.block = 0;
  const took = swing(e, b, 10).dealt;
  return { swings, back, briars, took, bare: b.status ? b.status('bare') : 0 };
}
"""

THORN = r"""
async ([big]) => {
  const e = make(['thorn-topiary'], { seed: 17, hp: 600, energy: 99 });
  await e.startCombat();
  const t = e.enemies[0];
  t.counters.crown = 3;
  const first = swing(e, t, big ? 14 : 4);
  const afterCrown = t.counters.crown || 0;
  const second = swing(e, t, 4);
  await e.endTurn();
  return { big, tookBack: first.tookBack, afterCrown, secondBack: second.tookBack,
           grewTo: t.counters.crown || 0 };
}
"""

ROTCAP = r"""
async ([damage]) => {
  const e = make(['rotcap'], { seed: 19, hp: 600, energy: 99 });
  await e.startCombat();
  const r = e.enemies[0];
  e.loseHp(r, 20, 'test');                    // room to heal into
  /* And forget it. `loseHp` counts toward `damageTakenThisTurn`, so the setup
     wound alone was 20 — past the suppression threshold — and the probe was
     measuring a Rotcap that had correctly decided not to heal. */
  r.damageTakenThisTurn = 0;
  const before = r.hp;
  if (damage) swing(e, r, damage);
  const afterHit = r.hp;
  await e.endTurn();
  return { damage, before, afterHit, after: r.hp, healed: r.hp - afterHit };
}
"""

SCARECROW = r"""
async ([breakStraw]) => {
  const e = make(['wilted-scarecrow'], { seed: 23, hp: 900, energy: 99 });
  await e.startCombat();
  const s = e.enemies[0];
  const fresh = s.def.moves['rake-swing'].damageFn(e.enemyCtx(s, null));
  e.loseHp(s, s.hp - 12, 'test');             // straight into Barely Together
  swing(e, s, 1);                             // the threshold check runs onDamaged
  const straw = bodies(e, 'straw-pile').length;
  const low = s.def.moves['rake-swing'].damageFn(e.enemyCtx(s, null));
  if (breakStraw) { const p = bodies(e, 'straw-pile')[0]; if (p) e.loseHp(p, p.hp + 5, 'test'); }
  const hpBefore = s.hp;
  await e.endTurn(); await e.endTurn();
  return { breakStraw, fresh, low, straw, hpBefore, hpAfter: s.hp };
}
"""

CRAWLER = r"""
async () => {
  const e = make(['compost-crawler', 'rotcap'], { seed: 29, hp: 900, energy: 99 });
  await e.startCombat();
  const dog = e.enemies[0];
  const meal = e.enemies[1];
  e.loseHp(meal, meal.hp - 3, 'test');         // wounded, and nearly gone
  await e.endTurn();                           // plan settles at the NEXT turn start
  await e.endTurn();
  return { mealHp: meal.hp, mealAlive: meal.alive, compost: dog.counters.compost || 0 };
}
"""

MINOTAUR = r"""
async ([damage]) => {
  const e = make(['mold-minotaur'], { seed: 31, hp: 900, energy: 99 });
  await e.startCombat();
  const bull = e.enemies[0];
  bull.counters.hunt = 1;                      // Lining Up
  e.refreshIntents('test');
  const lining = bull.pendingMove ? bull.pendingMove.id : null;
  if (damage) swing(e, bull, damage);
  const lost = !!bull.mem.lost;
  e.refreshIntents('test');
  return { damage, lining, lost, next: bull.pendingMove ? bull.pendingMove.id : null };
}
"""

IDOL = r"""
async ([breakOne]) => {
  const e = buildEnc('hm-scare-idol', 37, 900);
  await e.startCombat();
  const idol = e.enemies.find(x => x.defId === 'briar-idol');
  const ring = e.enemies.find(x => String(x.defId).startsWith('briar-ring'));
  const before = swing(e, idol, 3).tookBack;
  if (breakOne) e.loseHp(ring, ring.hp + 50, 'test');
  const after = swing(e, idol, 3).tookBack;
  return { breakOne, rings: e.enemies.filter(x => String(x.defId).startsWith('briar-ring') && x.alive).length,
           before, after, fury: idol.counters.fury || 0 };
}
"""

HEDGE = r"""
async ([low]) => {
  const e = buildEnc('hm-scare-carrion', 41, 900);
  await e.startCombat();
  const body = e.enemies.find(x => x.defId === 'carrion-hedge');
  const crown = e.enemies.find(x => x.defId === 'hedge-crown');
  e.loseHp(crown, crown.hp + 50, 'test');
  const countdown = { ...(body.mem.regrowing || {}) };
  /* Hold it under half. The Hedge heals — 5 a turn from its own Roots and 6
     from Feed the Roots — so a single setup wound let it climb back over the
     threshold within four turns and start regrowing again, which is the rule
     working rather than failing. */
  for (let i = 0; i < 4; i++) {
    if (low) e.loseHp(body, Math.max(0, body.hp - Math.floor(body.maxHp * 0.3)), 'test');
    await e.endTurn();
  }
  return { low, countdown, back: e.enemies.filter(x => x.defId === 'hedge-crown' && x.alive).length };
}
"""

GARDENER = r"""
async ([mode]) => {
  const e = make(['gardener-of-rot'], { seed: 43, hp: 1200, energy: 99 });
  await e.startCombat();
  const g = e.enemies[0];
  if (mode === 'accelerate' || mode === 'slow') {
    g.counters.decay = 0;                      // Withered
    g.mem.acts = 0;
    swing(e, g, mode === 'accelerate' ? 30 : 10);
    const before = g.counters.decay || 0;
    await e.endTurn();
    return { mode, before, after: g.counters.decay || 0 };
  }
  if (mode === 'withered') {
    g.counters.decay = 0;
    const took = swing(e, g, 20).dealt;
    g.counters.decay = 2;                      // Regrown
    const took2 = swing(e, g, 20).dealt;
    return { mode, withered: took, regrown: took2 };
  }
  if (mode === 'transition') {
    e.loseHp(g, g.hp - 225, 'test');
    e.refreshIntents('test');
    const next = g.pendingMove ? g.pendingMove.id : null;
    await e.endTurn();
    return { mode, next, phase: g.mem.phase,
             growths: e.enemies.filter(x => ['the-bramble', 'the-fungus', 'the-husk']
               .includes(x.defId) && x.alive).length };
  }
  return { mode };
}
"""

FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const e = buildEnc(encId, seed, hp, 4);
  const warns = []; const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  await e.startCombat();
  let guard = 0, maxRules = 0;
  while (!e.over && guard++ < turns) {
    let inner = 0;
    while (!e.over && inner++ < 8) {
      const t = (e.firstLivingEnemy() || {}).id ?? null;
      const c = e.piles.hand.find(x => e.canPlay(x.uid, t).ok);
      if (!c) break;
      await e.playCard(c.uid, t);
    }
    maxRules = Math.max(maxRules, (e.rules || []).length);
    if (!e.over) await e.endTurn();
  }
  console.warn = orig;
  return { over: e.over, turns: e.turn, maxRules, warns: warns.slice(0, 4) };
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

        s = await page.evaluate(STATIC)
        check(s["formations"] >= 18, "the region ships its full formation list",
              f"{s['formations']} formations")
        check(s["ordinary"] == 6, "six ordinary enemies (§1)", f"{s['ordinary']}")
        check(s["scares"] == 3, "three Big Scares (§1)", f"{s['scares']}")
        check(not s["unknownMembers"], "every formation names an enemy that exists",
              ", ".join(s["unknownMembers"]) or "all resolve")
        check(not s["leaked"], "Straw and Rot Piles are never placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("hedge-maze" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("hedge-maze") < s["ladder"].index("heart"),
              "the ladder walks the Maze before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 2, "both region statuses are registered",
              ", ".join(s["statuses"]))

        # ══ the Mildew Puff ═════════════════════════════════════════════════
        few = await page.evaluate(PUFF, [1])
        many = await page.evaluate(PUFF, [3])
        check(many["banked"] > few["banked"] and many["intent"] > few["intent"],
              "every Attack really banks a Disturbed, and Puff spends the lot",
              f"1 hit -> {few['intent']}, 3 hits -> {many['intent']}")

        # ══ the Briar Lump ══════════════════════════════════════════════════
        some = await page.evaluate(BRIAR, [2])
        stripped = await page.evaluate(BRIAR, [4])
        check(some["back"] == 4 and some["briars"] == 2,
              "it really retaliates 2 and really spends a Briar doing it", json.dumps(some))
        check(stripped["briars"] == 0 and stripped["bare"] >= 1
              and stripped["took"] > some["took"],
              "CONTROL: strip all four and it goes Bare — 20% softer (§4)",
              f"{some['took']} vs bare {stripped['took']}")

        # ══ the Thorn Topiary ═══════════════════════════════════════════════
        chip = await page.evaluate(THORN, [False])
        prune = await page.evaluate(THORN, [True])
        check(chip["tookBack"] == 3 and chip["afterCrown"] == 3,
              "it retaliates for its whole Crown and does NOT spend it (§8)",
              json.dumps(chip))
        check(prune["afterCrown"] == 1,
              "CONTROL: one Attack of 12+ really prunes two", json.dumps(prune))
        check(chip["grewTo"] > chip["afterCrown"],
              "and it grows another every turn", json.dumps(chip))

        # ══ Rotcap ══════════════════════════════════════════════════════════
        light = await page.evaluate(ROTCAP, [4])
        heavy = await page.evaluate(ROTCAP, [12])
        check(light["healed"] >= 6, "under the threshold it really regrows", json.dumps(light))
        check(heavy["healed"] == 0,
              "CONTROL: 8 or more in a turn really suppresses it (§5)", json.dumps(heavy))

        # ══ the Wilted Scarecrow ════════════════════════════════════════════
        kept = await page.evaluate(SCARECROW, [False])
        burnt = await page.evaluate(SCARECROW, [True])
        check(kept["low"] > kept["fresh"],
              "it really hits harder the closer it is to falling over",
              f"Stitched {kept['fresh']} -> Barely Together {kept['low']}")
        check(kept["straw"] == 1, "and really drops a Straw Pile on the way",
              json.dumps(kept))
        check(burnt["hpAfter"] < kept["hpAfter"],
              "CONTROL: break the Straw Pile and it does not get the 5 back (§6)",
              f"kept {kept['hpAfter']} vs broken {burnt['hpAfter']}")

        # ══ the Compost Crawler ═════════════════════════════════════════════
        fed = await page.evaluate(CRAWLER)
        check(fed["compost"] >= 1, "it really eats a wounded ally", json.dumps(fed))
        check(fed["mealAlive"] is True and fed["mealHp"] >= 1,
              "and really cannot finish one — minimum 1 Courage (§7)", json.dumps(fed))

        # ══ the Mold Minotaur ═══════════════════════════════════════════════
        hurt = await page.evaluate(MINOTAUR, [18])
        soft = await page.evaluate(MINOTAUR, [10])
        check(hurt["lost"] is True and hurt["next"] == "wrong-turn",
              "16 damage while it Lines Up really loses it the trail (§13)", json.dumps(hurt))
        check(soft["lost"] is False,
              "CONTROL: 10 does not", json.dumps(soft))

        # ══ the Briar Idol ══════════════════════════════════════════════════
        whole = await page.evaluate(IDOL, [False])
        broken = await page.evaluate(IDOL, [True])
        check(whole["before"] == 3 and whole["after"] == 3,
              "three Rings really means three retaliation per Attack", json.dumps(whole))
        check(broken["after"] == 2 and broken["fury"] == 1,
              "CONTROL: breaking one removes a point AND buys it Fury (§14)",
              json.dumps(broken))

        # ══ the Carrion Hedge ═══════════════════════════════════════════════
        high = await page.evaluate(HEDGE, [False])
        lowhp = await page.evaluate(HEDGE, [True])
        check(high["back"] >= 1, "a destroyed section really grows back", json.dumps(high))
        check(lowhp["back"] == 0,
              "CONTROL: below half Courage it really stops (§15)", json.dumps(lowhp))

        # ══ the Gardener of Rot ═════════════════════════════════════════════
        fast = await page.evaluate(GARDENER, ["accelerate"])
        slow = await page.evaluate(GARDENER, ["slow"])
        vuln = await page.evaluate(GARDENER, ["withered"])
        trans = await page.evaluate(GARDENER, ["transition"])
        check(fast["after"] > slow["after"],
              "22 damage in one turn really advances the Decay Cycle (§18)",
              f"22+ -> {fast['after']}, under -> {slow['after']}")
        check(vuln["withered"] > vuln["regrown"],
              "Withered really takes 15% more than Regrown (§17)",
              f"{vuln['withered']} vs {vuln['regrown']}")
        check(trans["phase"] == 2 and trans["growths"] == 2,
              "the transition really raises exactly two Growths (§24)", json.dumps(trans))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("hm-14", 2, 40, 800, "Scuffle 14 resolves a whole fight"),
            ("hm-scare-minotaur", 3, 40, 800, "the Mold Minotaur resolves a whole fight"),
            ("hm-scare-idol", 4, 40, 900, "the Briar Idol resolves a whole fight"),
            ("hm-scare-carrion", 5, 40, 900, "the Carrion Hedge resolves a whole fight"),
            ("hm-boss", 6, 60, 900, "the Gardener of Rot resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")
            check(r["maxRules"] <= 5,
                  f"{label} without burying the portrait in House Rules",
                  f"at most {r['maxRules']} rule cards at once")

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
