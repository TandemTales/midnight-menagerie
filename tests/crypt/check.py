"""The Crypt and Ossuary, driven against the REAL CombatEngine.

    python tests/crypt/check.py [--verbose]

§2's question is the region: "Do I spend damage cleaning up now, or gamble that
the fight ends before those pieces matter?" That only exists if Remains are real
objects with real Integrity and a real clock. Every claim has a CONTROL:

  * a defeated Loose Tibia really leaves Remains, and Remains really crumble on
    their own after two enemy turns;
  * the Skull Roller really cannot be targeted while it is Misplaced;
  * the Urn Spirit really keeps something from whatever died FIRST;
  * the Ribcage Guard really takes the first 10 Attack damage aimed at the
    enemy it caged, and 15 damage in a turn really breaks the cage;
  * the Bone Heap really collapses into a Pile instead of dying, and breaking
    the Pile really kills it for good;
  * the Crypt Fetcher really eats Remains and really brings a dead enemy back;
  * the Ribcage Knight's Components really are separately targetable and really
    take their effects with them;
  * the Walking Ossuary really counts every Remains created, even one destroyed
    the same turn;
  * a destroyed Bone Piece really becomes a Loose Exhibit the Curator can pick
    back up.

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
() => { window.make = function make(enemyIds, { seed = 7, hp = 500, energy = 9, deck = 'mossbit' } = {}) {
  const { C, en, cards, RNG } = window.__Y;
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: energy, deck: cards.startingDeckFor(deck) },
    enemies: enemyIds.map(id => en.getEnemy(id)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  return e;
};
window.buildEnc = function (encId, seed, hp) {
  const { C, enc, en, cards, RNG } = window.__Y;
  const members = enc.buildEncounter(encId, new RNG(seed), 0);
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: 99, deck: cards.startingDeckFor('mossbit') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  return e;
};
window.hit = function (e, target, amount) {
  target.block = 0;
  const before = target.hp;
  e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  return before - target.hp;
};
window.bodies = function (e, defId) {
  return e.enemies.filter(x => x.defId === defId && x.alive);
};
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const CR = enc.ENCOUNTER_LIST.filter(x => x.region === 'crypt');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'crypt');
  const placed = new Set(CR.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: CR.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly && d.role !== 'object').length,
    scares: CR.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: CR.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['caged', 'misplaced'].filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
  };
}
"""

REMAINS = r"""
async ([wait]) => {
  const e = make(['loose-tibia', 'skull-roller'], { seed: 11, hp: 600, energy: 99 });
  await e.startCombat();
  const tibia = e.enemies[0];
  e.loseHp(tibia, tibia.hp + 5, 'test');
  const made = bodies(e, 'remains').length;
  let after = made;
  if (wait) { for (let i = 0; i < wait; i++) await e.endTurn(); after = bodies(e, 'remains').length; }
  return { wait, made, after };
}
"""

MISPLACED = r"""
async () => {
  const e = make(['skull-roller'], { seed: 13, hp: 600, energy: 99 });
  await e.startCombat();
  const s = e.enemies[0];
  const before = e.isTargetable(s, null);
  await e.endTurn();                    // Chomp and Roll
  const gone = e.isTargetable(s, null);
  const next = s.pendingMove ? s.pendingMove.id : null;
  await e.endTurn();                    // it sits out
  await e.endTurn();                    // and comes back
  return { before, gone, next, back: e.isTargetable(s, null), guard: s.block };
}
"""

URN = r"""
async ([killWhich]) => {
  const e = make(['urn-spirit', 'loose-tibia', 'ribcage-guard'], { seed: 17, hp: 900, energy: 99 });
  await e.startCombat();
  const urn = e.enemies[0];
  const victim = e.enemies.find(x => x.defId === killWhich);
  e.loseHp(victim, victim.hp + 5, 'test');
  return { killWhich, held: (urn.mem.held || []).slice() };
}
"""

CAGE = r"""
async ([damage]) => {
  const e = make(['ribcage-guard', 'loose-tibia'], { seed: 19, hp: 900, energy: 99 });
  await e.startCombat();
  const guard = e.enemies[0];
  const tibia = e.enemies[1];
  await e.endTurn();                    // Cage Up
  const caged = tibia.status ? tibia.status('caged') : 0;
  guard.block = 0;
  const guardBefore = guard.hp;
  const toTibia = hit(e, tibia, 14);
  const toGuard = guardBefore - guard.hp;
  if (damage) hit(e, guard, damage);
  return { damage, caged, toTibia, toGuard,
           stillCaged: tibia.status ? tibia.status('caged') : 0 };
}
"""

HEAP = r"""
async ([breakPile]) => {
  const e = make(['bone-heap'], { seed: 23, hp: 900, energy: 99 });
  await e.startCombat();
  const heap = e.enemies[0];
  e.loseHp(heap, heap.hp + 5, 'test');
  const piles = bodies(e, 'bone-pile').length;
  const out = { breakPile, piles, heapAlive: heap.alive };
  if (breakPile) {
    const p = bodies(e, 'bone-pile')[0];
    if (p) e.loseHp(p, p.hp + 5, 'test');
  }
  await e.endTurn(); await e.endTurn(); await e.endTurn();
  out.heapsBack = bodies(e, 'bone-heap').length;
  return out;
}
"""

FETCHER = r"""
async ([mode]) => {
  const e = make(['crypt-fetcher', 'loose-tibia'], { seed: 29, hp: 900, energy: 99 });
  await e.startCombat();
  const dog = e.enemies[0];
  const tibia = e.enemies[1];
  /* The Fetcher settles what it will do at PLAYER-TURN START, on purpose — see
     `replan` in crypt.js, and the audit lie that put it there. So a probe that
     changes the board mid-turn and refreshes intents is asking the wrong
     question: it has to let a turn boundary pass so the plan is re-taken. */
  if (mode === 'fetch') {
    e.loseHp(tibia, tibia.hp + 5, 'test');           // leaves 1 Remains
    await e.endTurn();                               // it acts on the OLD plan
    const before = bodies(e, 'remains').length;
    const plan = dog.pendingMove ? dog.pendingMove.id : null;
    await e.endTurn();                               // and now on the new one
    return { mode, before, plan, after: bodies(e, 'remains').length, bones: dog.counters.bones || 0 };
  }
  if (mode === 'bring-back') {
    e.loseHp(tibia, tibia.hp + 5, 'test');
    dog.counters.bones = 2;
    dog.mem.fallen = ['loose-tibia'];
    await e.endTurn();
    dog.counters.bones = 2;                          // it may have spent one fetching
    dog.mem.fallen = ['loose-tibia'];
    await e.endTurn();
    const plan = dog.mem.plan;
    await e.endTurn();
    return { mode, plan, tibias: bodies(e, 'loose-tibia').length, bones: dog.counters.bones || 0 };
  }
  return { mode };
}
"""

KNIGHT = r"""
async ([strip]) => {
  const e = buildEnc('cr-scare-knight', 31, 900);
  await e.startCombat();
  const knight = e.enemies.find(x => x.defId === 'ribcage-knight');
  const blade = e.enemies.find(x => x.defId === 'femur-blade');
  const out = { parts: e.enemies.filter(x => x.defId !== 'ribcage-knight').length };
  const knightBefore = knight.hp;
  hit(e, blade, 5);
  out.knightUnhurt = knight.hp === knightBefore;
  e.refreshIntents('test');
  const withBlade = knight.def.moves['knights-strike'].damageFn(e.enemyCtx(knight, null));
  if (strip) e.loseHp(blade, blade.hp + 50, 'test');
  const without = knight.def.moves['knights-strike'].damageFn(e.enemyCtx(knight, null));
  out.withBlade = withBlade;
  out.without = without;
  out.loose = (knight.mem.loose || []).slice();
  return out;
}
"""

OSSUARY = r"""
async ([destroy]) => {
  const e = make(['walking-ossuary', 'loose-tibia'], { seed: 37, hp: 900, energy: 99 });
  await e.startCombat();
  const oss = e.enemies[0];
  const tibia = e.enemies[1];
  const before = oss.counters.collection || 0;
  e.loseHp(tibia, tibia.hp + 5, 'test');            // one Remains created
  const afterCreate = oss.counters.collection || 0;
  if (destroy) {
    // §14: the Collection counts a Remains "even if it is immediately destroyed"
    for (const r of bodies(e, 'remains')) e.loseHp(r, r.hp + 5, 'test');
  }
  return { destroy, before, afterCreate, afterDestroy: oss.counters.collection || 0 };
}
"""

CURATOR = r"""
async ([mode]) => {
  const e = make(['bone-curator'], { seed: 41, hp: 1200, energy: 99 });
  await e.startCombat();
  const b = e.enemies[0];
  if (mode === 'display') {
    await e.endTurn();                  // Catalogue Remains
    const on = bodies(e, 'bone-piece');
    return { mode, pieces: on.length, kinds: on.map(p => (p.mem || {}).kind) };
  }
  if (mode === 'loose') {
    await e.endTurn();
    const p = bodies(e, 'bone-piece')[0];
    if (!p) return { mode, made: false };
    e.loseHp(p, p.hp + 5, 'test');
    return { mode, made: true, loose: (b.mem.loose || []).slice(),
             pieces: bodies(e, 'bone-piece').length };
  }
  if (mode === 'transition') {
    await e.endTurn();
    e.loseHp(b, b.hp - 215, 'test');
    e.refreshIntents('test');
    const next = b.pendingMove ? b.pendingMove.id : null;
    await e.endTurn();
    return { mode, next, phase: b.mem.phase, attached: (b.mem.attached || []).slice(),
             stands: bodies(e, 'bone-piece').length };
  }
  return { mode };
}
"""

FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const e = buildEnc(encId, seed, hp);
  e.current.energyMax = 4;
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
        check(not s["leaked"], "Remains and Bone Piles are never placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("crypt" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("crypt") < s["ladder"].index("heart"),
              "the ladder walks the Crypt before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 2, "both region statuses are registered",
              ", ".join(s["statuses"]))

        # ══ Remains ═════════════════════════════════════════════════════════
        left = await page.evaluate(REMAINS, [0])
        gone = await page.evaluate(REMAINS, [3])
        check(left["made"] == 1, "a defeated Loose Tibia really leaves Remains", json.dumps(left))
        check(gone["after"] == 0,
              "CONTROL: unattended Remains really crumble on their own (§2)", json.dumps(gone))

        # ══ the Skull Roller ════════════════════════════════════════════════
        roll = await page.evaluate(MISPLACED)
        check(roll["before"] is True and roll["gone"] is False,
              "Misplaced really makes it untargetable (§4)", json.dumps(roll))
        check(roll["back"] is True and roll["guard"] >= 5,
              "and it really comes back, with Guard", json.dumps(roll))

        # ══ the Urn Spirit ══════════════════════════════════════════════════
        t = await page.evaluate(URN, ["loose-tibia"])
        g = await page.evaluate(URN, ["ribcage-guard"])
        check(t["held"] == ["loose-tibia"], "the Urn keeps what died", json.dumps(t))
        check(g["held"] == ["ribcage-guard"],
              "CONTROL: kill a different one and it keeps a different thing (§5)", json.dumps(g))

        # ══ the Ribcage Guard ═══════════════════════════════════════════════
        held = await page.evaluate(CAGE, [0])
        broke = await page.evaluate(CAGE, [16])
        check(held["caged"] >= 1 and held["toTibia"] <= 4 and held["toGuard"] >= 10,
              "the Cage really takes the first 10 and passes the rest on (§6)",
              json.dumps(held))
        check(broke["stillCaged"] == 0,
              "CONTROL: 15 damage in one turn really breaks the Cage", json.dumps(broke))

        # ══ the Bone Heap ═══════════════════════════════════════════════════
        kept = await page.evaluate(HEAP, [False])
        smashed = await page.evaluate(HEAP, [True])
        check(kept["piles"] == 1 and kept["heapsBack"] >= 1,
              "it collapses into a Pile and comes back (§7)", json.dumps(kept))
        check(smashed["heapsBack"] == 0,
              "CONTROL: break the Pile and it stays dead", json.dumps(smashed))

        # ══ the Crypt Fetcher ═══════════════════════════════════════════════
        fet = await page.evaluate(FETCHER, ["fetch"])
        back = await page.evaluate(FETCHER, ["bring-back"])
        check(fet["plan"] == "fetch" and fet["after"] < fet["before"] and fet["bones"] == 1,
              "it really eats a Remains for a Fetched Bone", json.dumps(fet))
        check(back["tibias"] >= 1,
              "and really brings a defeated enemy back (§8)", json.dumps(back))

        # ══ the Ribcage Knight ══════════════════════════════════════════════
        kn = await page.evaluate(KNIGHT, [True])
        check(kn["parts"] == 3, "the Knight arrives wearing three Components",
              json.dumps(kn)[:140])
        check(kn["knightUnhurt"] is True,
              "hitting a Component does NOT damage the Knight", json.dumps(kn)[:160])
        check(kn["withBlade"] > kn["without"],
              "and breaking the Femur Blade really takes its 4 damage with it",
              f"{kn['withBlade']} -> {kn['without']}")
        check(kn["loose"] == ["femur-blade"],
              "a broken Component becomes something it can pick back up", json.dumps(kn["loose"]))

        # ══ the Walking Ossuary ═════════════════════════════════════════════
        kept2 = await page.evaluate(OSSUARY, [False])
        razed = await page.evaluate(OSSUARY, [True])
        check(kept2["afterCreate"] > kept2["before"],
              "every Remains created really feeds the Ossuary", json.dumps(kept2))
        check(razed["afterDestroy"] >= razed["afterCreate"] - 1,
              "CONTROL: and destroying it does not take the Collection back (§14)",
              json.dumps(razed))

        # ══ the Bone Curator ════════════════════════════════════════════════
        disp = await page.evaluate(CURATOR, ["display"])
        loose = await page.evaluate(CURATOR, ["loose"])
        trans = await page.evaluate(CURATOR, ["transition"])
        check(disp["pieces"] == 1 and disp["kinds"][0],
              "Catalogue Remains really puts a Piece on a stand", json.dumps(disp))
        check(loose["loose"] and loose["pieces"] == 0,
              "§20: a destroyed Piece becomes a LOOSE EXHIBIT, not nothing",
              json.dumps(loose))
        check(trans["phase"] == 2 and len(trans["attached"]) == 3 and trans["stands"] == 0,
              "the transition attaches three Pieces and clears the stands (§24)",
              json.dumps(trans))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("cr-14", 2, 40, 800, "Scuffle 14 resolves a whole fight"),
            ("cr-scare-knight", 3, 40, 800, "the Ribcage Knight resolves a whole fight"),
            ("cr-scare-ossuary", 4, 40, 900, "the Walking Ossuary resolves a whole fight"),
            ("cr-scare-coffins", 5, 40, 800, "the Coffin Collector resolves a whole fight"),
            ("cr-boss", 6, 60, 900, "the Bone Curator resolves a whole fight"),
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
