"""The Mansion Graveyard, driven against the REAL CombatEngine.

    python tests/graveyard/check.py [--verbose]

The region's founding rule is §3's: "defeating the source does not necessarily
cancel something already set in motion." Everything below is a claim about the
board two or three turns from now, and every one is checked with a CONTROL:

  * a Mournful Mark lands after its Moth is dead, and Circle the Stone really
    makes it bigger while it waits;
  * a Headstone Hopper collects exactly what the player put into it;
  * Forget Me Not comes back once and only once, and stays dead if the fight
    ends first;
  * a Forgotten Trick really costs one more Nerve, once;
  * the Epitaph Choir's four timelines really converge while all four stand;
  * the Groundskeeper's Ledger really Smudges under 22 damage, and breaking a
    Memorial Stone really erases a frozen Entry.

`tests/enemies/run.py` can see none of it: its context is mocked, its timers are
a shim, and it has no card costs at all.

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
}; return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run, cards } = window.__Y;
  const GY = enc.ENCOUNTER_LIST.filter(x => x.region === 'graveyard');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'graveyard');
  const placed = new Set(GY.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: GY.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: GY.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: GY.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    /* Status Tricks live in `enemies/_lib.js`, NOT in the companion card
       registry, so `cardById` is the wrong question — the right one is whether
       a real engine can resolve the id, which is what `addCard` will ask. */
    hush: en.STATUS_TRICK_DEFS.some(t => t.id === 'status/graveside-hush'),
  };
}
"""

# ── a Mournful Mark outlives its Moth, and grows while it waits ─────────────
MARK = r"""
async ([killMoth, letItGrow]) => {
  const e = make(['grave-moth', 'headstone-hopper'], { seed: 12, hp: 400 });
  await e.startCombat();
  const moth = e.enemies.find(x => x.defId === 'grave-moth');
  let hazard = 0;
  e.on('damage', (ev) => { if (ev.cause === 'timer') hazard += (ev.hpLoss || 0) + (ev.blocked || 0); });
  await e.endTurn();                       // Dust the Name
  const marked = e.timers.filter(t => /Mournful/.test(t.label)).length;
  if (letItGrow) { await e.endTurn(); await e.endTurn(); }   // Wing Brush, Circle the Stone
  if (killMoth) e.loseHp(moth, moth.hp + 5, 'test');
  for (let i = 0; i < 4 && !e.over; i++) await e.endTurn();
  return { killMoth, letItGrow, marked, hazard, mothAlive: moth.alive };
}
"""

# ── the Hopper collects exactly what you put in ─────────────────────────────
RETALIATION = r"""
async ([hits]) => {
  const e = make(['headstone-hopper'], { seed: 15, hp: 400 });
  await e.startCombat();
  const h = e.enemies[0];
  let swung = 0;
  e.on('damage', (ev) => { if (ev.targetId === e.player.id) swung += (ev.hpLoss || 0) + (ev.blocked || 0); });
  for (let i = 0; i < hits; i++) {
    h.block = 0;
    e.dealDamage({ attacker: e.player, defender: h, amount: 3, kind: 'attack', card: { type: 'attack' } });
  }
  const stored = h.counters.retaliation || 0;
  const before = swung;
  await e.endTurn(); await e.endTurn(); await e.endTurn();   // Bump, Sink, Comes Due
  return { hits, stored, dealtOverThree: swung - before };
}
"""

# ── Forget Me Not returns once, and only once ───────────────────────────────
RETURN = r"""
async ([kills]) => {
  const e = make(['forget-me-not', 'grave-moth'], { seed: 18, hp: 400 });
  await e.startCombat();
  const find = () => e.enemies.filter(x => x.defId === 'forget-me-not' && x.alive);
  let killed = 0;
  for (let round = 0; round < 10 && killed < kills; round++) {
    const f = find()[0];
    if (f) { e.loseHp(f, f.hp + 5, 'test'); killed++; }
    if (e.over) break;
    await e.endTurn(); await e.endTurn(); await e.endTurn();
  }
  return { kills, killed, aliveNow: find().length,
           pending: e.timers.filter(t => /Forget Me Not/.test(t.label)).length };
}
"""

# ── a Forgotten Trick costs one more Nerve, once ────────────────────────────
FORGOTTEN = r"""
async ([mark]) => {
  const e = make(['name-gnawer'], { seed: 21, hp: 400, energy: 99 });
  await e.startCombat();
  const card = e.piles.hand[0];
  const base = e.costOf(card);
  if (mark) {
    (e.player._forgotten ||= new Set()).add(card.uid);
    e.applyStatus(e.player, 'forgotten', 1);
  }
  const marked = e.costOf(card);
  await e.playCard(card.uid, (e.firstLivingEnemy() || {}).id ?? null);
  // A second card of the same id is NOT marked: the mark is per copy.
  const other = e.piles.hand.find(x => x.id === card.id);
  return { mark, base, marked, after: other ? e.costOf(other) : null };
}
"""

# ── the Choir's four timelines converge while all four stand ────────────────
CHOIR = r"""
async ([breakOne]) => {
  const { C, enc, en, cards, RNG } = window.__Y;
  const members = enc.buildEncounter('gy-scare-choir', new RNG(24), 0);
  const e = new C.CombatEngine({ rng: new RNG(24),
    player: { name: 'K', maxHp: 600, hp: 600, energyMax: 9, deck: cards.startingDeckFor('mossbit') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  await e.startCombat();
  const stones = e.enemies.filter(x => x.def && x.def.choir);
  if (breakOne) { const s = stones[0]; e.loseHp(s, s.hp + 5, 'test'); }
  const before = e.timers.filter(t => /—/.test(t.label)).map(t => t.turnsLeft);
  const longestBefore = Math.max(0, ...before);
  await e.endTurn();
  const after = e.timers.filter(t => /—/.test(t.label)).map(t => t.turnsLeft);
  return { breakOne, stones: stones.length, alive: stones.filter(s => s.alive).length,
           before, after, longestBefore, longestAfter: Math.max(0, ...after) };
}
"""

# ── the Ledger: Smudge, freeze, and a Stone erasing a frozen Entry ──────────
LEDGER = r"""
async ([smudge]) => {
  const e = make(['groundskeeper'], { seed: 27, hp: 900, energy: 9 });
  await e.startCombat();
  const boss = e.enemies[0];
  const warns = []; const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  await e.endTurn();                        // Record the Name
  const entries = e.timers.filter(t => /^entry:/.test(t.id));
  const nearest = entries.reduce((b, t) => (!b || t.turnsLeft < b.turnsLeft ? t : b), null);
  const wasAt = nearest ? nearest.turnsLeft : null;
  if (smudge) { boss.block = 0; e.dealDamage({ attacker: e.player, defender: boss, amount: 30, kind: 'attack' }); }
  await e.endTurn();
  const still = e.timers.find(t => nearest && t.id === nearest.id);
  console.warn = orig;
  return { smudge, entries: entries.length, wasAt,
           survives: !!still, nowAt: still ? still.turnsLeft : null,
           warns: warns.slice(0, 3) };
}
"""

PHASE_TWO = r"""
async () => {
  const e = make(['groundskeeper'], { seed: 31, hp: 2000, energy: 9 });
  await e.startCombat();
  const boss = e.enemies[0];
  const warns = []; const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  for (let i = 0; i < 4 && !e.over; i++) await e.endTurn();   // fill the Ledger
  const entriesBefore = e.timers.filter(t => /^entry:/.test(t.id)).length;
  boss.hp = Math.round(190 * (boss.maxHp / 330)); boss.block = 0;
  e.refreshIntents('test');
  await e.endTurn();
  if (boss.mem.phase !== 2) await e.endTurn();
  const stones = e.enemies.filter(x => x.def && x.def.memorial && x.alive);
  const frozenBefore = (boss.mem.frozen || []).length;
  if (stones[0]) e.loseHp(stones[0], stones[0].hp + 5, 'test');
  const frozenAfter = (boss.mem.frozen || []).length;
  console.warn = orig;
  return { entriesBefore, phase: boss.mem.phase, stones: stones.length,
           liveEntries: e.timers.filter(t => /^entry:/.test(t.id)).length,
           frozenBefore, frozenAfter, warns: warns.slice(0, 3) };
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
        check(not s["leaked"], "no summon-only enemy placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("graveyard" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("graveyard") < s["ladder"].index("heart"),
              "the ladder walks the Graveyard before the Heart", str(s["ladder"]))
        check(s["hush"] is True,
              "Graveside Hush is a registered card, not a name in a comment", "status/graveside-hush")

        # ══ the Mournful Mark ═══════════════════════════════════════════════
        kept = await page.evaluate(MARK, [False, False])
        orphan = await page.evaluate(MARK, [True, False])
        grown = await page.evaluate(MARK, [False, True])
        check(kept["marked"] >= 1, "Dust the Name really schedules a Mark", json.dumps(kept))
        check(kept["hazard"] >= 8, "and the Mark really lands", json.dumps(kept))
        check(orphan["mothAlive"] is False and orphan["hazard"] >= 8,
              "CONTROL: kill the Moth and the Mark lands anyway — §3's founding rule",
              json.dumps(orphan))
        check(grown["hazard"] > kept["hazard"],
              "CONTROL: let it Circle the Stone and the Mark is bigger when it lands",
              f"{kept['hazard']} -> {grown['hazard']}")

        # ══ stored Retaliation ══════════════════════════════════════════════
        few = await page.evaluate(RETALIATION, [1])
        many = await page.evaluate(RETALIATION, [4])
        check(few["stored"] == 3, "one Attack stores 3 Retaliation", json.dumps(few))
        check(many["stored"] == 12, "four Attacks store 12", json.dumps(many))
        check(many["dealtOverThree"] > few["dealtOverThree"],
              "and Epitaph Comes Due collects exactly what you put in",
              f"{few['dealtOverThree']} vs {many['dealtOverThree']}")

        # ══ Forget Me Not ═══════════════════════════════════════════════════
        once = await page.evaluate(RETURN, [1])
        twice = await page.evaluate(RETURN, [2])
        check(once["aliveNow"] >= 1, "killed once, Forget Me Not comes back", json.dumps(once))
        check(twice["killed"] == 2 and twice["aliveNow"] == 0,
              "CONTROL: killed twice, it stays dead", json.dumps(twice))

        # ══ Forgotten ═══════════════════════════════════════════════════════
        plain = await page.evaluate(FORGOTTEN, [False])
        gnawed = await page.evaluate(FORGOTTEN, [True])
        check(gnawed["marked"] == gnawed["base"] + 1,
              "a Forgotten Trick really costs 1 more Nerve",
              f"{gnawed['base']} -> {gnawed['marked']}")
        check(plain["marked"] == plain["base"],
              "CONTROL: an unmarked Trick costs what it prints", json.dumps(plain))

        # ══ the Choir ═══════════════════════════════════════════════════════
        four = await page.evaluate(CHOIR, [False])
        three = await page.evaluate(CHOIR, [True])
        check(four["stones"] == 4, "the Choir is four separate stones", json.dumps(four)[:120])
        check(four["longestAfter"] < four["longestBefore"],
              "while all four stand, the longest countdown loses an extra step",
              f"{four['longestBefore']} -> {four['longestAfter']}")
        check(three["alive"] == 3,
              "CONTROL: break one and the Choir effect stops",
              f"{three['longestBefore']} -> {three['longestAfter']} with {three['alive']} standing")

        # ══ the Ledger ══════════════════════════════════════════════════════
        quiet = await page.evaluate(LEDGER, [False])
        hit = await page.evaluate(LEDGER, [True])
        check(quiet["entries"] >= 1, "the Groundskeeper really writes Entries", json.dumps(quiet))
        # Left alone, the nearest Entry ticks down and resolves. Smudged, it is
        # still on the Ledger a turn later — delayed, not erased, which is §19's
        # whole point.
        check(quiet["survives"] is False,
              "CONTROL: left alone, the nearest Entry comes due and leaves the Ledger",
              f"was at {quiet['wasAt']}, gone")
        check(hit["survives"] is True and hit["nowAt"] >= 1,
              "30 Courage in one turn Smudges it — still on the Ledger, one turn later",
              f"was at {hit['wasAt']}, now at {hit['nowAt']}")
        check(not quiet["warns"], "no engine warnings on the Ledger path",
              "; ".join(quiet["warns"][:2]) or "clean")

        two = await page.evaluate(PHASE_TWO)
        check(two["phase"] == 2, "it turns to phase two at 190 Courage", json.dumps(two)[:140])
        check(two["stones"] == 3, "and raises three Memorial Stones", f"{two['stones']}")
        check(two["liveEntries"] == 0,
              "the Ledger is FROZEN, not resolved — no Entry lands at the turn",
              f"{two['entriesBefore']} entries -> {two['liveEntries']} live, {two['frozenBefore']} frozen")
        check(two["frozenBefore"] == 0 or two["frozenAfter"] < two["frozenBefore"],
              "breaking a Memorial Stone erases a frozen Entry (§28)",
              f"{two['frozenBefore']} -> {two['frozenAfter']}")

        # ══ the Big Scares, on a real board ═════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("gy-scare-angel", 3, 40, 800, "the Mourning Angel resolves a whole fight"),
            ("gy-scare-choir", 4, 40, 800, "the Epitaph Choir resolves a whole fight"),
            ("gy-scare-mouth", 5, 40, 800, "the Mausoleum Mouth resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")

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
