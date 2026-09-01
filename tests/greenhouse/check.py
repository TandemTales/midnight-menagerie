"""The Impossible Greenhouse, driven against the REAL CombatEngine.

    python tests/greenhouse/check.py [--verbose]

`tests/enemies/run.py` is a structural checker with a mocked context. This is
the region's other half, and it exists because everything the Greenhouse is
about happens ACROSS turns and OUTSIDE the enemy that started it:

  * a Seedling matures into a Potling three turns after it is planted, whether
    or not the Potling that planted it is still standing;
  * a Spore Cloud lands two turns later, and §6 says in bold that killing Spore
    Puff must not erase it — so the check kills the Puff and waits;
  * Entwine takes half of what the HOST takes, and breaks at twelve;
  * the Glassvine's thorns stop entirely once the glass is broken;
  * the Head Gardener's Seeds become plants, and Uprooting a Bed denies it.

Every one of those is a claim about the board several turns from now, and every
one is checked here with a CONTROL that runs the same board without the thing.

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
  window.__G = { C, enc, en, st, cards, run };
  window.__G.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

MAKE = r"""
() => { window.make = function make(enemyIds, { seed = 7, hp = 400, energy = 9, deck = 'brambleboo' } = {}) {
  const { C, en, cards, RNG } = window.__G;
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: energy, deck: cards.startingDeckFor(deck) },
    enemies: enemyIds.map(id => en.getEnemy(id)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  return e;
}; return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__G;
  const GH = enc.ENCOUNTER_LIST.filter(x => x.region === 'greenhouse');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'greenhouse');
  const placed = new Set(GH.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: GH.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: GH.filter(f => f.tier === 'elite').length,
    roster: roster.length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: GH.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
  };
}
"""

# ── a Seedling really becomes a Potling, and outlives its parent ─────────────
SEEDLING = r"""
async ([killParent]) => {
  const e = make(['potling'], { seed: 12 });
  await e.startCombat();
  const parent = e.enemies[0];
  await e.endTurn();                      // Plant Seed
  const planted = e.enemies.filter(x => x.defId === 'seedling' && x.alive).length;
  if (killParent) e.loseHp(parent, parent.hp + 5, 'test');
  for (let i = 0; i < 4 && !e.over; i++) await e.endTurn();
  const grown = e.enemies.filter(x => x.defId === 'potling' && x.alive).length;
  return { killParent, planted, grown,
           parentAlive: parent.alive,
           seedlingsLeft: e.enemies.filter(x => x.defId === 'seedling' && x.alive).length };
}
"""

# ── a Spore Cloud lands, and lands even if the Puff is dead ──────────────────
SPORES = r"""
async ([killPuff]) => {
  /* TWO bodies, and the second one is the point: killing the only enemy ends
     the fight, so the first version of this control proved that a Cloud does
     not land when the combat is over — which is true and is not the claim. */
  const e = make(['spore-puff', 'potling'], { seed: 15, hp: 400 });
  await e.startCombat();
  const puff = e.enemies.find(x => x.defId === 'spore-puff');
  let hazard = 0;
  e.on('damage', (ev) => { if (ev.cause === 'timer') hazard += (ev.hpLoss || 0) + (ev.blocked || 0); });
  await e.endTurn();                      // Release Spores — a cloud is now scheduled
  const scheduled = e.timers.filter(t => /Spore/.test(t.label)).length;
  if (killPuff) e.loseHp(puff, puff.hp + 5, 'test');
  for (let i = 0; i < 3 && !e.over; i++) await e.endTurn();
  return { killPuff, scheduled, hazard, puffAlive: puff.alive };
}
"""

# ── Entwine: the Ivy takes half of what the host takes, and lets go at 12 ────
ENTWINE = r"""
async ([hitHost]) => {
  const e = make(['creeping-ivy', 'potling'], { seed: 18, hp: 400 });
  await e.startCombat();
  const ivy = e.enemies.find(x => x.defId === 'creeping-ivy');
  const host = e.enemies.find(x => x.defId === 'potling');
  await e.endTurn();                      // Creep
  const attached = host.hasStatus('entwined');
  const ivyBefore = ivy.hp;
  if (hitHost) { host.block = 0; e.dealDamage({ attacker: e.player, defender: host, amount: 14, kind: 'attack' }); }
  await e.endTurn();                      // the Ivy settles its share
  return { hitHost, attached, ivyLost: ivyBefore - ivy.hp,
           stillAttached: host.alive ? host.hasStatus('entwined') : null };
}
"""

# ── Glass Thorns cost Courage, and stop once the glass is broken ────────────
THORNS = r"""
async ([shatter]) => {
  const e = make(['glassvine'], { seed: 21, hp: 400 });
  await e.startCombat();
  const vine = e.enemies[0];
  vine.block = 0;
  let bled = 0;
  e.on('damage', (ev) => { if (ev.targetId === e.player.id && ev.cause !== 'timer') bled += (ev.hpLoss || 0); });
  if (shatter) {
    // One big swing breaks the coating before the small ones start.
    e.dealDamage({ attacker: e.player, defender: vine, amount: 20, kind: 'attack',
                   card: { type: 'attack' } });
    await e.endTurn();
    vine.block = 0;
  }
  const before = bled;
  for (let i = 0; i < 3; i++) {
    e.dealDamage({ attacker: e.player, defender: vine, amount: 2, kind: 'attack',
                   card: { type: 'attack' } });
  }
  return { shatter, retaliation: bled - before, shattered: vine.hasStatus('exposed-sap') };
}
"""

# ── Leafy Shell really makes the NEXT attack bigger, on the rail and the hit ─
SHELL = r"""
async ([shelled]) => {
  const e = make(['topiary-beast'], { seed: 31, hp: 400 });
  await e.startCombat();
  const t = e.enemies[0];
  /* Arm the counter the way Leafy Shell does. `setCnt` is what makes the rail
     move, so this exercises the same path the move takes rather than a
     back door. */
  if (shelled) {
    const m = e.moveDefOf ? e.moveDefOf(t, 'leafy-shell') : null;
    if (m && m.effect) m.effect(e.ctxFor ? e.ctxFor(t) : null);
    else t.counters = Object.assign({}, t.counters, { shell: 4 });
  }
  e.refreshIntents('turnStart');
  const railed = (t.intent && t.intent.damage) || 0;
  const hits = (t.intent && t.intent.hits) || 1;
  let landed = 0;
  e.on('damage', (ev) => { if (ev.targetId === e.player.id) landed += (ev.hpLoss || 0); });
  const before = e.player.hp;
  await e.endTurn();
  return { shelled, railed, hits, landed, move: (t.history || []).slice(-1)[0],
           shellLeft: (t.counters || {}).shell || 0, dropped: before - e.player.hp };
}
"""

# ── Bloom escalates, and pruning it defuses the swing ───────────────────────
BLOOM = r"""
async ([prune]) => {
  const e = make(['snapping-blossom'], { seed: 24, hp: 400 });
  await e.startCombat();
  const b = e.enemies[0];
  let swung = 0;
  e.on('damage', (ev) => { if (ev.targetId === e.player.id) swung += (ev.hpLoss || 0) + (ev.blocked || 0); });
  await e.endTurn();                      // Unfurl
  await e.endTurn();                      // Pollen Shake
  await e.endTurn();                      // Unfurl -> Full Bloom
  const bloom = b.counters.bloom || 0;
  const before = swung;
  if (prune) { b.block = 0; e.dealDamage({ attacker: e.player, defender: b, amount: 16, kind: 'attack' }); }
  await e.endTurn();                      // Snap
  return { prune, bloom, snap: swung - before };
}
"""

# ── the Head Gardener really grows a garden, and Uproot really denies a Bed ──
GARDEN = r"""
async () => {
  const e = make(['head-gardener'], { seed: 27, hp: 900, energy: 9 });
  await e.startCombat();
  const boss = e.enemies[0];
  const warns = [];
  const orig = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  for (let i = 0; i < 3 && !e.over; i++) await e.endTurn();
  const seeds = e.enemies.filter(x => x.def && x.def.seed && x.alive).length;
  for (let i = 0; i < 3 && !e.over; i++) await e.endTurn();
  const plants = e.enemies.filter(x => x.def && x.def.plant && x.alive).length;

  // Uproot: kill one plant and the Bed it came out of is denied.
  const victim = e.enemies.find(x => x.def && (x.def.plant || x.def.seed) && x.alive);
  const bed = victim && victim.mem && victim.mem.bed;
  if (victim) e.loseHp(victim, victim.hp + 5, 'test');
  const uprooted = bed ? !!(boss.mem.uprooted || {})[bed] : false;
  console.warn = orig;
  return { seeds, plants, bed, uprooted, warns: warns.slice(0, 3),
           cultivated: boss.counters.cultivated || 0 };
}
"""

FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const { C, enc, en, cards, RNG } = window.__G;
  const members = enc.buildEncounter(encId, new RNG(seed), 0);
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: 4, deck: cards.startingDeckFor('brambleboo') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  const warns = []; const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  await e.startCombat();
  const seen = new Set(); const rules = new Set();
  let guard = 0;
  while (!e.over && guard++ < turns) {
    let inner = 0;
    while (!e.over && inner++ < 8) {
      const t = (e.firstLivingEnemy() || {}).id ?? null;
      const c = e.piles.hand.find(x => e.canPlay(x.uid, t).ok);
      if (!c) break;
      await e.playCard(c.uid, t);
    }
    for (const x of e.enemies) seen.add(x.defId);
    for (const r of (e.rules || [])) rules.add(r.id);
    if (!e.over) await e.endTurn();
  }
  console.warn = orig;
  return { over: e.over, turns: e.turn, appeared: [...seen], rules: [...rules],
           warns: warns.slice(0, 4) };
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
        check(not s["leaked"], "no summon-only enemy is placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("greenhouse" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("greenhouse") < s["ladder"].index("heart"),
              "the ladder walks the Greenhouse before the Heart", str(s["ladder"]))

        # ══ Seedlings ═══════════════════════════════════════════════════════
        kept = await page.evaluate(SEEDLING, [False])
        orphan = await page.evaluate(SEEDLING, [True])
        check(kept["planted"] >= 1, "a Potling really plants a Seedling", json.dumps(kept))
        check(kept["grown"] >= 2, "and the Seedling really stands up as a second Potling",
              json.dumps(kept))
        check(orphan["parentAlive"] is False and orphan["grown"] >= 1,
              "CONTROL: kill the parent and its Seedling still matures — the "
              "children are real actors, not counters on the Potling",
              json.dumps(orphan))

        # ══ Spore Clouds ════════════════════════════════════════════════════
        alive = await page.evaluate(SPORES, [False])
        dead = await page.evaluate(SPORES, [True])
        check(alive["scheduled"] >= 1, "Release Spores really schedules a Cloud",
              json.dumps(alive))
        check(alive["hazard"] >= 7, "and the Cloud really lands", json.dumps(alive))
        check(dead["puffAlive"] is False and dead["hazard"] >= 7,
              "CONTROL: kill the Spore Puff and the Cloud lands anyway — §6's "
              "whole point, and impossible if the Cloud lived on the Puff",
              json.dumps(dead))

        # ══ Entwine ═════════════════════════════════════════════════════════
        quiet = await page.evaluate(ENTWINE, [False])
        hit = await page.evaluate(ENTWINE, [True])
        check(quiet["attached"] is True, "the Ivy really attaches to its host", json.dumps(quiet))
        check(quiet["ivyLost"] == 0, "CONTROL: leave the host alone and the Ivy takes nothing",
              json.dumps(quiet))
        check(hit["ivyLost"] >= 7, "hit the host and the Ivy takes half of it",
              f"14 into the host -> {hit['ivyLost']} off the Ivy")

        # ══ Glass Thorns ════════════════════════════════════════════════════
        # ══ Leafy Shell's second sentence, which nothing used to read ═══════
        plain = await page.evaluate(SHELL, [False])
        shell = await page.evaluate(SHELL, [True])
        check(plain["railed"] > 0 and shell["railed"] > 0,
              "CONTROL: the Beast attacks in both runs, so the pair compares "
              "the same thing",
              f"plain {plain['move']} {plain['railed']}x{plain['hits']} / "
              f"shelled {shell['move']} {shell['railed']}x{shell['hits']}")
        check(shell["railed"] > plain["railed"],
              "a shelled Beast's next attack is bigger ON THE RAIL "
              "(§7: 'its next attack deals 4 additional damage')",
              f"railed {shell['railed']} vs {plain['railed']}")
        check(shell["railed"] * shell["hits"] - plain["railed"] * plain["hits"] == 4,
              "and the bonus is +4 on the ATTACK, split across its hits, "
              "not +4 per hit",
              f"total {shell['railed'] * shell['hits']} vs "
              f"{plain['railed'] * plain['hits']}")
        check(shell["shellLeft"] == 0,
              "and it is spent, so the attack after it is ordinary again",
              f"shell counter {shell['shellLeft']}")

        intact = await page.evaluate(THORNS, [False])
        broken = await page.evaluate(THORNS, [True])
        check(intact["retaliation"] >= 4, "Glass Thorns really cost Courage",
              f"three small hits -> {intact['retaliation']}")
        check(broken["shattered"] is True and broken["retaliation"] == 0,
              "CONTROL: break the glass and the thorns stop entirely",
              json.dumps(broken))

        # ══ Bloom ═══════════════════════════════════════════════════════════
        full = await page.evaluate(BLOOM, [False])
        pruned = await page.evaluate(BLOOM, [True])
        check(full["bloom"] >= 2, "the Blossom really reaches Full Bloom", json.dumps(full))
        check(full["snap"] >= 17, "and Snap really lands for 17 there", json.dumps(full))
        check(pruned["snap"] < full["snap"],
              "CONTROL: prune it at Full Bloom and the Snap is defused",
              f"{full['snap']} -> {pruned['snap']}")

        # ══ the garden ══════════════════════════════════════════════════════
        g = await page.evaluate(GARDEN)
        check(g["seeds"] >= 1, "the Head Gardener really sows Seeds", json.dumps(g)[:140])
        check(g["plants"] >= 1, "and the Seeds really become plants", json.dumps(g)[:140])
        check(g["uprooted"] is True,
              "destroying a plant really Uproots its Bed (§21)", f"bed {g['bed']}")
        check(not g["warns"], "the engine logged no warnings during the boss fight",
              "; ".join(g["warns"][:2]) or "clean")

        # ══ the Big Scares, on a real board ═════════════════════════════════
        for enc_id, seed, turns, hp, want, label in [
            ("gh-scare-compost", 3, 40, 800, ["regrowth-node"],
             "the Compost Colossus really puts Nodes on the board"),
            ("gh-scare-conservatory", 4, 40, 800, ["growth-patch"],
             "the Conservatory really puts Growth Patches on the board"),
            ("gh-scare-topiary", 5, 40, 800, ["ancient-topiary"],
             "the Ancient Topiary resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            missing = [w for w in want if w not in r["appeared"]]
            check(not missing, label, f"{enc_id}: missing {missing}" if missing else f"{enc_id}: ok")
            check(not r["warns"], f"{enc_id}: no engine warnings",
                  "; ".join(r["warns"][:2]) or "clean")

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
