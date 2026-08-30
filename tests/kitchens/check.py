"""The Kitchens and Cellars: the three mechanics that change the roster mid-fight.

    python tests/kitchens/check.py [--verbose]

WHY THIS EXISTS SEPARATELY FROM tests/enemies/
----------------------------------------------
`tests/enemies/run.py` is a structural checker with a mocked context. It proved
every move in this region is well-formed, that no intent lies about its damage,
and that nothing applies a status it did not declare. What it cannot prove is
that Divide, Bake and the Recipe Board actually change the board, because its
harness fakes `summon`.

That gap is not theoretical. All three mechanics summoned NOTHING the first time
they were driven against the real engine, and the structural suite was green
throughout: `resolveEnemyDef` reads a registry the engine has to be GIVEN, and a
missing registration warns to the console and returns null. Six formations ran to
completion, won, and never once produced a Doughling.

So this suite drives the real `CombatEngine` and asserts on the board.

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
  const [C, enc, en, st, cards, kw] = await Promise.all([
    import('/game/src/combat/engine.js'),
    import('/game/src/data/encounters.js'),
    import('/game/src/data/enemies/index.js'),
    import('/game/src/combat/statuses.js'),
    import('/game/src/data/cards.js'),
    import('/game/src/data/keywords.js'),
  ]);
  await kw.loadContentRegistries();
  st.registerStatuses(en.ENEMY_STATUSES);
  window.__K = { C, enc, en, st, cards };
  window.__K.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

# One fight, driven greedily, reporting what ever appeared on the board.
FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const { C, enc, en, cards, RNG } = window.__K;
  const members = enc.buildEncounter(encId, new RNG(seed), 0);
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: 3, deck: cards.startingDeckFor('taffy') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());          // run.js:1233 / combat.js:570
  e.registerCards(en.STATUS_TRICK_DEFS);      // run.js:1238 / combat.js:571
  e.registerEnemies(en.ENEMY_LIST);
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  await e.startCombat();
  const seen = new Set();
  let guard = 0;
  while (!e.over && guard++ < turns) {
    let inner = 0;
    while (!e.over && inner++ < 8) {
      const c = e.piles.hand.find(x => e.canPlay(x.uid, (e.firstLivingEnemy() || {}).id).ok);
      if (!c) break;
      await e.playCard(c.uid, (e.firstLivingEnemy() || {}).id ?? null);
    }
    for (const x of e.enemies) seen.add(x.defId);
    if (!e.over) await e.endTurn();
  }
  console.warn = orig;
  return { turns: e.turn, over: e.over, appeared: [...seen], warns: warns.slice(0, 4),
           sticky: e.piles.all().filter(c => String(c.id).startsWith('status/sticky')).length };
}
"""

# Divide, and the burst exemption, driven exactly rather than hoped for.
DIVIDE = r"""
async ([mode]) => {
  const { C, en, RNG } = window.__K;
  const e = new C.CombatEngine({ rng: new RNG(4),
    player: { name: 'K', maxHp: 400, hp: 400, energyMax: 9, deck: [] },
    enemies: [en.getEnemy('dough-blob')] });
  e.registerEnemies(en.ENEMY_LIST);
  await e.startCombat();
  const blob = e.enemies[0];
  const before = blob.hp;
  if (mode === 'chip') {
    // Two taps: over the threshold, then under it. This must split.
    e.loseHp(blob, before - 20, 'test');
    e.loseHp(blob, 6, 'test');
  } else {
    // One resolving effect from above 16 straight to 0. This must NOT split.
    e.loseHp(blob, before, 'test');
  }
  return { mode, startHp: before,
           doughlings: e.enemies.filter(x => x.defId === 'doughling' && x.alive).length,
           blobAlive: e.enemies.some(x => x.defId === 'dough-blob' && x.alive) };
}
"""

STATIC = r"""
async () => {
  const { enc, en, cards } = window.__K;
  const KC = enc.ENCOUNTER_LIST.filter(x => x.region === 'kitchens-cellars');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'kitchens-cellars');
  const placed = new Set(KC.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: KC.length,
    tiers: [...new Set(KC.map(f => f.tier))].sort(),
    roster: roster.length,
    summonOnly: en.SUMMON_ONLY,
    // A summon-only enemy written into a formation by hand would reach a player
    // without the mechanic that is supposed to create it.
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    // Anything in the roster no formation can ever field is content nobody sees.
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    // Sticky is a neutral STATUS_CARD, not an enemy-library trick, so look for
    // it where the game actually registers it.
    statusTricks: [...en.STATUS_TRICK_DEFS, ...cards.allCards().filter(c => c.companion === 'status')]
      .map(t => t.id),
    unknownMembers: KC.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
  };
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

        # ══ the shape of the region ═════════════════════════════════════════
        s = await page.evaluate(STATIC)
        check(s["formations"] >= 18,
              "the region ships its full formation list",
              f"{s['formations']} formations, tiers {s['tiers']}")
        check(not s["unknownMembers"],
              "every formation names an enemy that exists",
              ", ".join(s["unknownMembers"]) or "all resolve")
        check("kitchens-cellars" in s["implemented"],
              "the region is registered as implemented", str(s["implemented"]))
        check(not s["leaked"],
              "no summon-only enemy is placed in a formation by hand",
              ", ".join(s["leaked"]) or f"guarding {len(s['summonOnly'])}: {s['summonOnly']}")
        check(not s["unreachable"],
              "every ordinary enemy in the roster appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("status/sticky" in s["statusTricks"],
              "Sticky is a registered card, not a name in a comment",
              str([t for t in s["statusTricks"] if "sticky" in t]))

        # ══ Divide, and the burst exemption that makes it a decision ════════
        chip = await page.evaluate(DIVIDE, ["chip"])
        check(chip["doughlings"] == 2 and chip["blobAlive"] is False,
              "chipped below 16, the Dough Blob divides into two",
              json.dumps(chip))
        burst = await page.evaluate(DIVIDE, ["burst"])
        check(burst["doughlings"] == 0,
              "CONTROL: killed outright from above 16, it does NOT divide — "
              "burst is genuinely better here",
              json.dumps(burst))

        # ══ the three roster-mutating mechanics, on a real board ════════════
        for enc_id, seed, turns, hp, want, label in [
            ("kc-3", 3, 30, 400, ["doughling"], "a Dough Blob fight produces Doughlings"),
            ("kc-scare-oven", 4, 40, 500, ["crust-beast", "caramel-creeper"],
             "the Oven Maw hands back transformed enemies"),
            ("kc-boss", 5, 70, 500, ["dish"], "the Confectioner plates a Dish"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            got = [w for w in want if w in r["appeared"]]
            check(bool(got), label,
                  f"{enc_id}: appeared {r['appeared']}")
            check(not r["warns"], f"{enc_id}: the engine logged no warnings",
                  "; ".join(r["warns"][:2]) or "clean")

        # ══ Sticky actually reaches the deck ════════════════════════════════
        r = await page.evaluate(FIGHT, ["kc-11", 7, 30, 400])
        check(r["sticky"] >= 1,
              "a Jam Jar fight puts Sticky in the player's deck",
              f"{r['sticky']} copies after {r['turns']} turns")

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
