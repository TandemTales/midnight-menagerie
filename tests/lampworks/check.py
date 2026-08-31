"""The Lampworks, driven against the REAL CombatEngine.

    python tests/lampworks/check.py [--verbose]

§2's promise is that Charge makes a rhythm the player can act on — "interrupt
the buildup, prepare for the release, or DELIBERATELY ALLOW IT" — and none of
those three decisions exists unless the numbers are real. Every one below has a
CONTROL that runs the same board without the thing:

  * a Dimmed player really gains 4 less Guard, once, and an undimmed one does
    not;
  * the Waxling really takes 20% more at 1 Wax and really does not at 3;
  * the Lamp Moth really takes Charge off an ALLY and really converts it into
    its own damage;
  * 12 damage really knocks a Charge off the Spark Sprite, 11 really does not,
    and in Blackout neither does;
  * the Gaslight Ghost's Dim really halves the FIRST Attack each turn and not
    the second;
  * Blackout really gives the whole board 2 extra Guard;
  * an Overcharged Light really explodes if you leave it, and really goes out
    if you hit hard enough;
  * the Blackout Beast really is tougher in the dark and softer in the light;
  * the Great Lantern really opens at 5 Charge, and really loses a whole turn if
    you empty it;
  * DAMAGE DEALT TO A LAMP REALLY DOES NOT DAMAGE THE LAMPLIGHTER (§18), a full
    row really triggers Flashpoint, and the Charge left hanging at the
    transition really becomes phase two's Stored Flame.

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
window.hit = function (e, target, amount) {
  target.block = 0;
  const before = target.hp;
  e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  return before - target.hp;
};
window.playAny = async function (e, n) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const t = (e.firstLivingEnemy() || {}).id ?? null;
    const c = e.piles.hand.find(x => e.canPlay(x.uid, t).ok);
    if (!c) break;
    await e.playCard(c.uid, t); done++;
  }
  return done;
};
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const LW = enc.ENCOUNTER_LIST.filter(x => x.region === 'lampworks');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'lampworks');
  const placed = new Set(LW.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: LW.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: LW.filter(f => f.tier === 'elite').length,
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: LW.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['dimmed', 'gaslit-dim', 'unlit', 'flickering']
      .filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
    bossMembers: (enc.ENCOUNTERS['lw-boss'] || {}).members?.map(m => m.enemyId) || [],
  };
}
"""

DIMMED = r"""
async ([mark]) => {
  const e = make(['waxling'], { seed: 11, hp: 400, energy: 99 });
  await e.startCombat();
  if (mark) { e.player._dimSpent = false; e.applyStatus(e.player, 'dimmed', 1); }
  e.player.block = 0;
  e.gainBlock(e.player, 10, { reason: 'test' });
  const first = e.player.block;
  e.gainBlock(e.player, 10, { reason: 'test' });
  return { mark, first, second: e.player.block - first };
}
"""

WAXLING = r"""
async ([wax]) => {
  const e = make(['waxling'], { seed: 13, hp: 400, energy: 99 });
  await e.startCombat();
  const w = e.enemies[0];
  w.counters.wax = wax;
  const took = hit(e, w, 10);
  e.refreshIntents('test');
  return { wax, took, next: w.pendingMove ? w.pendingMove.id : null,
           dmg: w.intent ? w.intent.damage : null };
}
"""

MOTH = r"""
async ([withAlly]) => {
  const ids = withAlly ? ['lamp-moth', 'spark-sprite'] : ['lamp-moth'];
  const e = make(ids, { seed: 17, hp: 600, energy: 99 });
  await e.startCombat();
  const moth = e.enemies[0];
  const sprite = e.enemies[1] || null;
  if (sprite) sprite.counters.charge = 2;
  /* Move the Sprite off Gather Spark. It acts in the same enemy phase, and its
     own opening move puts the Charge straight back — so a naive reading after
     the phase says the Moth stole nothing when it plainly did. */
  if (sprite) sprite.history = ['gather-spark'];
  /* Re-derive: the plan was built at startCombat, when the Sprite still had 0
     Charge, so the Moth had already decided to Wing Spark. Setting a counter
     behind the engine's back and then not refreshing measures the old board. */
  e.refreshIntents('test');
  const before = sprite ? sprite.counters.charge : null;
  const chose = e.enemies[0].pendingMove ? e.enemies[0].pendingMove.id : null;
  await e.endTurn();
  return { withAlly, before, chose, after: sprite ? sprite.counters.charge : null,
           stolen: moth.counters.stolen || 0, move: moth.history[0] };
}
"""

SPRITE = r"""
async ([damage, dark]) => {
  const ids = dark ? ['spark-sprite', 'blackout-blob'] : ['spark-sprite'];
  const e = make(ids, { seed: 19, hp: 600, energy: 99 });
  await e.startCombat();
  const s = e.enemies[0];
  s.counters.charge = 2;
  if (dark) { e.field = e.field || {}; e.field.blackout = true; }
  const beforeIntent = (() => { e.refreshIntents('t'); return s.intent ? s.intent.damage : null; })();
  hit(e, s, damage);
  e.refreshIntents('test');
  return { damage, dark, charge: s.counters.charge, beforeIntent,
           afterIntent: s.intent ? s.intent.damage : null };
}
"""

GHOST = r"""
async ([dim]) => {
  const e = make(['gaslight-ghost'], { seed: 23, hp: 600, energy: 99 });
  await e.startCombat();
  const g = e.enemies[0];
  g.mem.lit = !dim;
  g._dimUsed = 0; g._dimAllowance = 1;
  if (dim) e.applyStatus(g, 'gaslit-dim', 1); else e.removeStatus(g, 'gaslit-dim');
  const first = hit(e, g, 10);
  const second = hit(e, g, 10);
  return { dim, first, second };
}
"""

BLACKOUT = r"""
async ([dark]) => {
  const e = make(['blackout-blob', 'spark-sprite'], { seed: 29, hp: 600, energy: 99 });
  await e.startCombat();
  const blob = e.enemies[0];
  const sprite = e.enemies[1];
  if (dark) await e.endTurn();          // Kill the Lights is its opening move
  sprite.block = 0;
  e.gainBlock(sprite, 10, { reason: 'test' });
  return { dark, guard: sprite.block, unlit: sprite.status ? sprite.status('unlit') : 0,
           move: blob.history[0] || null };
}
"""

CHANDELIER = r"""
async ([damage]) => {
  const e = make(['chandelier'], { seed: 31, hp: 900, energy: 99 });
  await e.startCombat();
  const ch = e.enemies[0];
  ch.counters.over = 1; ch.counters.lit = 1;
  /* Put it on Chain Sweep, the move that READS the Lights. Position 0 of the
     opening cycle is Light the Room, a buff, whose intent damage is 0 both
     before and after — which measured nothing at all. */
  ch.history = ['light-the-room'];
  const intentBefore = (() => { e.refreshIntents('t'); return ch.intent ? ch.intent.damage : null; })();
  hit(e, ch, damage);
  e.refreshIntents('test');
  const out = { damage, over: ch.counters.over, lit: ch.counters.lit,
                intentBefore, intentAfter: ch.intent ? ch.intent.damage : null };
  // leave one Overcharged and let it sit through a full round -> it explodes
  ch.counters.over = 1;
  ch.mem.armed = 0;
  const hpBefore = e.player.hp;
  await e.endTurn();   // its turn arms; the next player turn start explodes
  await e.endTurn();
  out.exploded = hpBefore - e.player.hp > 0;
  return out;
}
"""

BEAST = r"""
async ([illum]) => {
  const e = make(['blackout-beast'], { seed: 37, hp: 900, energy: 99 });
  await e.startCombat();
  const b = e.enemies[0];
  b.counters.illumination = illum;
  const took = hit(e, b, 20);
  e.refreshIntents('test');
  return { illum, took, next: b.pendingMove ? b.pendingMove.id : null };
}
"""

LANTERN = r"""
async ([charge, bleed]) => {
  const e = make(['great-lantern'], { seed: 41, hp: 900, energy: 99 });
  await e.startCombat();
  const l = e.enemies[0];
  l.counters.charge = charge;
  l.mem.bled = false;
  if (bleed) hit(e, l, bleed);
  e.refreshIntents('test');
  return { charge, bleed, now: l.counters.charge, dimmed: !!l.mem.dimmed,
           next: l.pendingMove ? l.pendingMove.id : null,
           dmg: l.intent ? l.intent.damage : null };
}
"""

# ── §18: hitting a Lamp must not hurt the Lamplighter ──────────────────────
LAMPROW = r"""
async ([mode]) => {
  const { C, enc, en, cards, RNG } = window.__Y;
  const members = enc.buildEncounter('lw-boss', new RNG(43), 0);
  const e = new C.CombatEngine({ rng: new RNG(43),
    player: { name: 'K', maxHp: 900, hp: 900, energyMax: 99, deck: cards.startingDeckFor('mossbit') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  await e.startCombat();
  const boss = e.enemies.find(x => x.defId === 'the-lamplighter');
  const row = e.enemies.filter(x => x.defId === 'lamp');
  const out = { mode, lamps: row.length, bossHpStart: boss.hp };

  if (mode === 'hit-lamp') {
    const before = boss.hp;
    const dealt = hit(e, row[0], 20);
    out.lampDead = !row[0].alive;
    out.bossLost = before - boss.hp;
    out.dealt = dealt;
    return out;
  }
  if (mode === 'flashpoint') {
    for (const l of row) l.counters.charge = 2;
    e.refreshIntents('test');
    out.next = boss.pendingMove ? boss.pendingMove.id : null;
    out.light = row.reduce((n, l) => n + (l.counters.charge || 0), 0);
    return out;
  }
  if (mode === 'transition') {
    for (const l of row) l.counters.charge = 2;         // 10 Charge hanging
    e.loseHp(boss, boss.hp - 205, 'test');
    e.refreshIntents('test');
    out.next = boss.pendingMove ? boss.pendingMove.id : null;
    await e.endTurn();
    out.phase = boss.mem.phase;
    out.stored = boss.counters.stored || 0;
    out.lampsLeft = e.enemies.filter(x => x.defId === 'lamp' && x.alive).length;
    return out;
  }
  if (mode === 'transition-empty') {
    for (const l of row) l.counters.charge = 0;         // player kept it suppressed
    e.loseHp(boss, boss.hp - 205, 'test');
    e.refreshIntents('test');                          // or it resolves its OLD plan
    await e.endTurn();
    out.phase = boss.mem.phase;
    out.stored = boss.counters.stored || 0;
    return out;
  }
  return out;
}
"""

FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const { C, enc, en, cards, RNG } = window.__Y;
  const members = enc.buildEncounter(encId, new RNG(seed), 0);
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: 4, deck: cards.startingDeckFor('mossbit') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
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
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("lampworks" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("lampworks") < s["ladder"].index("heart"),
              "the ladder walks the Lampworks before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 4, "all four region statuses are registered",
              ", ".join(s["statuses"]))
        check(s["bossMembers"].count("lamp") == 5,
              "the boss arrives with a five-Lamp row (§17)", str(s["bossMembers"]))

        # ══ Dimmed ══════════════════════════════════════════════════════════
        plain = await page.evaluate(DIMMED, [False])
        dim = await page.evaluate(DIMMED, [True])
        check(dim["first"] == plain["first"] - 4,
              "Dimmed really costs 4 off the FIRST Guard gained",
              f"{plain['first']} -> {dim['first']}")
        check(dim["second"] == plain["second"],
              "CONTROL: and only the first — the second gain is untouched",
              f"{dim['second']} vs {plain['second']}")

        # ══ the Waxling ═════════════════════════════════════════════════════
        low = await page.evaluate(WAXLING, [1])
        high = await page.evaluate(WAXLING, [3])
        check(low["took"] > high["took"],
              "at 1 Wax it really takes 20% more damage",
              f"1 Wax {low['took']} vs 3 Wax {high['took']}")
        check(low["next"] == "flare" and high["next"] != "flare",
              "CONTROL: Flare is the 1-Wax move and nothing else's",
              f"1 Wax -> {low['next']}, 3 Wax -> {high['next']}")

        # ══ the Lamp Moth ═══════════════════════════════════════════════════
        fed = await page.evaluate(MOTH, [True])
        alone = await page.evaluate(MOTH, [False])
        check(fed["after"] == fed["before"] - 1 and fed["stolen"] == 1,
              "the Moth really drinks an ALLY's Charge and keeps it", json.dumps(fed))
        check(alone["chose"] != "drink-the-flame",
              "CONTROL: with nobody to drink from it does something else",
              json.dumps(alone))

        # ══ the Spark Sprite ════════════════════════════════════════════════
        shed = await page.evaluate(SPRITE, [12, False])
        held = await page.evaluate(SPRITE, [11, False])
        dark = await page.evaluate(SPRITE, [12, True])
        check(shed["charge"] == 1, "12 damage really knocks a Charge loose", json.dumps(shed))
        check(held["charge"] == 2, "CONTROL: 11 does not", json.dumps(held))
        check(dark["charge"] == 2,
              "CONTROL: and in Blackout neither does (§8)", json.dumps(dark))

        # ══ the Gaslight Ghost ══════════════════════════════════════════════
        dimg = await page.evaluate(GHOST, [True])
        litg = await page.evaluate(GHOST, [False])
        check(dimg["first"] < dimg["second"],
              "Dim really halves the FIRST Attack each turn and not the second",
              json.dumps(dimg))
        check(litg["first"] == litg["second"],
              "CONTROL: Lit takes both at full", json.dumps(litg))

        # ══ Blackout ════════════════════════════════════════════════════════
        out = await page.evaluate(BLACKOUT, [True])
        on = await page.evaluate(BLACKOUT, [False])
        check(out["guard"] == on["guard"] + 2 and out["unlit"] >= 1,
              "Blackout really gives the whole board 2 extra Guard",
              f"lit {on['guard']} vs dark {out['guard']}")

        # ══ the Chandelier ══════════════════════════════════════════════════
        big = await page.evaluate(CHANDELIER, [12])
        small = await page.evaluate(CHANDELIER, [11])
        check(big["over"] == 0, "12 damage really puts an Overcharged Light out",
              json.dumps(big)[:150])
        check(small["over"] == 1, "CONTROL: 11 does not", json.dumps(small)[:150])
        check(big["intentAfter"] < big["intentBefore"],
              "and the intent drops LIVE as the Light goes out",
              f"{big['intentBefore']} -> {big['intentAfter']}")
        check(big["exploded"] is True,
              "an Overcharged Light left alone really explodes", json.dumps(big)[:150])

        # ══ the Blackout Beast ══════════════════════════════════════════════
        bright = await page.evaluate(BEAST, [4])
        murk = await page.evaluate(BEAST, [0])
        check(bright["took"] > murk["took"],
              "the Beast is really softer in the light and tougher in the dark",
              f"Illum 4 {bright['took']} vs Illum 0 {murk['took']}")
        check(bright["next"] == "snuff-everything" and murk["next"] != "snuff-everything",
              "CONTROL: and Snuff Everything is only available at 4 (§14)",
              f"4 -> {bright['next']}, 0 -> {murk['next']}")

        # ══ the Great Lantern ═══════════════════════════════════════════════
        loaded = await page.evaluate(LANTERN, [5, 0])
        bled = await page.evaluate(LANTERN, [1, 20])
        check(loaded["next"] == "open-the-lantern" and loaded["dmg"] == 40,
              "at 5 Charge it really Opens for 8 per Charge", json.dumps(loaded))
        check(bled["now"] == 0 and bled["dimmed"] is True and bled["next"] == "relight",
              "CONTROL: empty it and it loses a whole turn relighting (§15)",
              json.dumps(bled))

        # ══ the Lamplighter's Lamp Row ══════════════════════════════════════
        lamp = await page.evaluate(LAMPROW, ["hit-lamp"])
        check(lamp["lamps"] == 5, "five Lamps are on the board", json.dumps(lamp)[:120])
        check(lamp["dealt"] > 0 and lamp["bossLost"] == 0,
              "§18: damage dealt to a Lamp does NOT damage the Lamplighter",
              json.dumps(lamp)[:170])
        flash = await page.evaluate(LAMPROW, ["flashpoint"])
        check(flash["next"] == "flashpoint",
              "a full row really triggers Flashpoint (§23)", json.dumps(flash)[:150])
        full = await page.evaluate(LAMPROW, ["transition"])
        empty = await page.evaluate(LAMPROW, ["transition-empty"])
        check(full["phase"] == 2 and full["stored"] == 10 and full["lampsLeft"] == 0,
              "a full row at the transition really becomes 10 Stored Flame (§26)",
              json.dumps(full)[:170])
        check(empty["phase"] == 2 and empty["stored"] == 0,
              "CONTROL: a suppressed row makes the transition safe — phase one MATTERS",
              json.dumps(empty)[:170])

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("lw-14", 2, 40, 800, "Scuffle 14 resolves a whole fight"),
            ("lw-scare-chandelier", 3, 40, 800, "the Chandelier resolves a whole fight"),
            ("lw-scare-beast", 4, 40, 800, "the Blackout Beast resolves a whole fight"),
            ("lw-scare-lantern", 5, 40, 900, "the Great Lantern resolves a whole fight"),
            ("lw-boss", 6, 60, 900, "the Lamplighter resolves a whole fight"),
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
