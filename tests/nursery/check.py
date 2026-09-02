"""The Forgotten Nursery, driven against the REAL CombatEngine.

    python tests/nursery/check.py [--verbose]

The region thesis is "damage changes things", and every enemy here is a claim
about the FORMATION rather than about itself: enemies mend each other, cover one
another, attach improvements, lose pieces and become different threats as they
deteriorate. A structural checker with a mocked context cannot see any of that
— it fakes `summon`, `heal`, `applyStatus` and the board-event bus, which is
between two and four of the things every enemy in this file is made of.

That gap is not theoretical here either. TWO of this region's mechanics were
already found dead by other suites: `boardEvent` had no callers at all (the
Rocking Horse's Excitement from ally support, and the Twins' Joined), and the
Twins looked for each other by ACTOR id, which `buildEncounter` never assigns.
A third was found by the Foyer's gate on 2026-08-31 — `actor.summonedBy` was
read by five content sites and written by none, which is the Toy Chest's summon
cap and its Tidy Up.

So every claim below is checked against a real board, and every claim about a
board one turn from now has a CONTROL that runs the same board without it:

  * Sew On really names the Button it is about to use, and really picks a
    different one for an ally that is hurt than for one that is about to swing;
  * jamming the Handle really unwinds a Wound Up, so POP! really reads 12
    instead of 17 — and really lands the number it showed;
  * the Soldier really heals 9 and really pays 7 for it, and really does not
    Patch when nobody needs one;
  * the Horse's Excitement really rises from an ALLY being helped and really
    not from its own Clatter, and Gallop really reads 4 more per stack;
  * Cover really absorbs the first 8 on the ally and really bills the Blob for
    exactly that, really re-arms once a round, and really ends when the Blob
    dies;
  * the Doll really gains Guard only while Pristine, really adds 3 Cracked and
    6 Shattered, and really costs itself 3 a swing once Shattered;
  * the Chest really spills, really stops at its cap, really shuts for a turn
    at 16 damage, and Tidy Up really eats one of its own;
  * the Giant really loses the Patch that was worth most, and really hits for
    less the moment the Bear Patch is gone;
  * and Joined really halves Guard across, really does not ricochet back, and
    Alone really adds 3 the instant a Twin dies.

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
  window.__N = { C, enc, en, st, cards };
  window.__N.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

MAKE = r"""
() => {
  const { C, enc, en, cards, RNG } = window.__N;
  window.make = function (ids, { seed = 7, hp = 900, energy = 9 } = {}) {
    const e = new C.CombatEngine({ rng: new RNG(seed),
      player: { name: 'K', maxHp: hp, hp, energyMax: energy,
                deck: cards.startingDeckFor('mossbit') },
      enemies: ids.map(id => en.getEnemy(id)) });
    e.registerCards(cards.allCards());
    e.registerCards(en.STATUS_TRICK_DEFS);
    e.registerEnemies(en.ENEMY_LIST);
    return e;
  };
  window.buildEnc = function (encId, seed, hp, energy) {
    const members = enc.buildEncounter(encId, new RNG(seed), 0);
    const e = new C.CombatEngine({ rng: new RNG(seed),
      player: { name: 'K', maxHp: hp, hp, energyMax: energy || 9,
                deck: cards.startingDeckFor('mossbit') },
      enemies: members.map(m => en.getEnemy(m.enemyId)) });
    e.registerCards(cards.allCards());
    e.registerCards(en.STATUS_TRICK_DEFS);
    e.registerEnemies(en.ENEMY_LIST);
    return e;
  };
  window.swing = function (e, target, amount, opts) {
    const before = target.hp;
    e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                   card: { type: 'attack', id: 't', uid: 't' }, ...(opts || {}) });
    return before - target.hp;
  };
  window.intentOf = function (a) {
    return a && a.intent
      ? { move: a.intent.moveId, damage: a.intent.damage ?? null,
          hits: a.intent.hits ?? 1, type: a.intent.type ?? null,
          statuses: (a.intent.statuses || []).map(s => s.id || s) }
      : null;
  };
  window.promised = function (e) {
    let n = 0;
    for (const a of e.enemies) {
      if (!a.alive || !a.intent) continue;
      const d = a.intent.damage;
      if (typeof d === 'number' && d > 0) n += d * (a.intent.hits || 1);
    }
    return n;
  };
  window.tap = function (e) {
    const log = [];
    e.on('damage', ev => { if (ev.targetId === 'player') log.push(ev); });
    return {
      byEnemies: () => log.filter(x => e.enemies.some(en => en.id === x.sourceId))
                          .reduce((n, x) => n + (x.amount || 0), 0),
    };
  };
  window.greedyTurn = async function (e, cap = 8) {
    let n = 0;
    while (!e.over && n++ < cap) {
      const c = e.piles.hand.find(x => e.canPlay(x.uid, (e.firstLivingEnemy() || {}).id).ok);
      if (!c) break;
      await e.playCard(c.uid, (e.firstLivingEnemy() || {}).id ?? null);
    }
    return n - 1;
  };
  window.body = function (e, defId) {
    return e.enemies.filter(x => x.defId === defId && x.alive)[0] || null;
  };
  /* Drop an actor to an exact Courage without going through the damage
     pipeline, so a crack-ladder probe measures the ladder and not the hit. */
  window.setHp = function (a, hp) { a.hp = Math.max(1, hp); };
  return true;
}
"""

STATIC = r"""
async () => {
  const { enc, en } = window.__N;
  const F = enc.ENCOUNTER_LIST.filter(x => x.region === 'nursery');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'nursery');
  const placed = new Set(F.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: F.length,
    tiers: [...new Set(F.map(f => f.tier))].sort(),
    roster: roster.length,
    scares: F.filter(f => f.tier === 'elite').length,
    bosses: F.filter(f => f.tier === 'boss').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS.includes('nursery'),
    unknownMembers: F.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    noHaunt: roster.filter(d => typeof d.hauntScaling !== 'function').map(d => d.id),
    buttons: en.ENEMY_STATUSES.filter(s => String(s.id).startsWith('button-')).map(s => s.id),
  };
}
"""

# ── 1. Button Baby names the Button before it sews it ────────────────────────
BUTTON = r"""
async ([mode]) => {
  /* Which Button it reaches for is decided by what the ALLY is doing, so the
     escort has to differ, not the Baby. The Blob opens on Tuck In, a defence;
     the Horse opens on Rock, an attack. */
  const escort = mode === 'swinging' ? 'rocking-horse' : 'blanket-blob';
  const e = make(['button-baby', escort]);
  await e.startCombat();
  const baby = body(e, 'button-baby');
  const ally = body(e, escort);
  if (mode === 'hurt') setHp(ally, Math.round(ally.maxHp * 0.3));
  e.refreshIntents('probe');
  const shown = intentOf(baby);
  await e.endTurn();
  const got = ['button-brass', 'button-pillow', 'button-spring'].filter(b => ally.hasStatus(b));
  return { mode, escort, shown, got, allyIntent: intentOf(ally) };
}
"""

# ── 2. Jack in the Box: the Jam is a real counter, not a cancel ───────────────
JACK = r"""
async ([jam]) => {
  const e = make(['jack-in-the-box']);
  await e.startCombat();
  const a = e.enemies[0];
  await e.endTurn();                       // Turn the Handle (1 Wound Up, 6 Guard)
  if (jam) swing(e, a, a.block);           // strip exactly the Guard, no Courage
  const jammedGuard = a.block;
  await e.endTurn();                       // Turn the Handle again
  const wound = a.counters['wound-up'];
  e.refreshIntents('probe');
  const shown = intentOf(a);
  const hp = e.player.hp;
  e.player.block = 0;
  await e.endTurn();                       // POP!
  return { jammedGuard, wound, shown, landed: hp - e.player.hp };
}
"""

# ── 3. Patchwork Soldier: healing that costs it, and only when needed ─────────
SOLDIER = r"""
async ([hurtAlly]) => {
  const e = make(['patchwork-soldier', 'rocking-horse']);
  await e.startCombat();
  const sol = body(e, 'patchwork-soldier');
  const horse = body(e, 'rocking-horse');
  if (hurtAlly) setHp(horse, horse.maxHp - 30);
  e.refreshIntents('probe');
  const shown = intentOf(sol);
  const solBefore = sol.hp, allyBefore = horse.hp;
  await e.endTurn();
  return { shown, allyGained: horse.hp - allyBefore, solPaid: solBefore - sol.hp,
           moved: sol.lastMove };
}
"""

# -- 5. The Giant's Patches are READABLE, not just counted --------------------
PATCHES = r"""
async ([tear]) => {
  const e = make(['patchwork-giant']);
  await e.startCombat();
  const g = body(e, 'patchwork-giant');
  const card = () => (e.rules || []).find(r => String(r.id).startsWith('patch:')) || null;
  const opening = card();
  /* Drop it past the 90 / 60 / 30 thresholds so Patches really tear. They
     scale with maxHp, so drive it by fraction rather than a literal, then land
     one real hit so `onDamaged` runs. */
  if (tear) {
    setHp(g, Math.round(g.maxHp * 0.45));
    e.dealDamage({ attacker: e.player, defender: g, amount: 1, kind: 'attack',
                   card: { type: 'attack' } });
  }
  const after = card();
  return {
    tear,
    openingName: opening && opening.name,
    openingText: opening && opening.text,
    afterName: after && after.name,
    afterText: after && after.text,
    cards: (e.rules || []).filter(r => String(r.id).startsWith('patch:')).length,
    left: (g.mem || {}).patches || [],
  };
}
"""

# ── 4. Rocking Horse: Excitement comes off the BOARD, not off itself ──────────
HORSE = r"""
async ([mode]) => {
  const ids = mode === 'alone' ? ['rocking-horse'] : ['rocking-horse', 'button-baby'];
  const e = make(ids);
  await e.startCombat();
  const horse = body(e, 'rocking-horse');
  const trace = [];
  for (let t = 0; t < 3 && !e.over; t++) {
    e.player.block = 0;
    await e.endTurn();
    trace.push({ move: horse.lastMove, excitement: horse.counters.excitement });
  }
  // Read Gallop's number at two known Excitements. Below 2 it is not Gallop at
  // all, so the per-stack term has to be read between two Gallop turns.
  horse.history.length = 0;
  horse.counters.excitement = 2;
  e.refreshIntents('probe');
  const at2 = intentOf(horse);
  horse.counters.excitement = 3;
  e.refreshIntents('probe');
  const at3 = intentOf(horse);
  horse.counters.excitement = 0;
  e.refreshIntents('probe');
  return { mode, trace, at2, at3, at0: intentOf(horse) };
}
"""

# ── 5. Blanket Blob: Cover is an allowance somebody pays for ──────────────────
COVER = r"""
async ([amount, twice]) => {
  const e = make(['blanket-blob', 'rocking-horse']);
  await e.startCombat();
  const blob = body(e, 'blanket-blob');
  const horse = body(e, 'rocking-horse');
  await e.endTurn();                       // Tuck In
  const covered = horse.hasStatus('covered');
  horse.block = 0; blob.block = 0;
  const hBefore = horse.hp, bBefore = blob.hp;
  swing(e, horse, amount);
  const afterFirst = { ally: hBefore - horse.hp, blob: bBefore - blob.hp };
  if (twice) swing(e, horse, amount);
  const afterSecond = { ally: hBefore - horse.hp };
  // The Blob settles what Cover absorbed at the end of the player turn.
  await e.endTurn();
  return { covered, afterFirst, afterSecond,
           blobPaid: bBefore - blob.hp, allyLost: hBefore - horse.hp };
}
"""

COVER_DEATH = r"""
async () => {
  const e = make(['blanket-blob', 'rocking-horse']);
  await e.startCombat();
  const blob = body(e, 'blanket-blob');
  const horse = body(e, 'rocking-horse');
  await e.endTurn();
  const before = horse.hasStatus('covered');
  e.loseHp(blob, blob.hp + 5, 'test');
  return { before, after: horse.hasStatus('covered') };
}
"""

# ── 6. Porcelain Doll: the crack ladder, band by band ─────────────────────────
DOLL = r"""
async ([frac]) => {
  const e = make(['porcelain-doll']);
  await e.startCombat();
  const d = e.enemies[0];
  setHp(d, Math.max(1, Math.round(d.maxHp * frac)));
  d.history.length = 0;                    // next move is Tea Cup Tap
  e.refreshIntents('probe');
  const shown = intentOf(d);
  const hpBefore = d.hp;
  e.player.block = 0;
  const pBefore = e.player.hp;
  await e.endTurn();
  return { frac, shown, landed: pBefore - e.player.hp,
           selfCost: hpBefore - d.hp, guard: d.block };
}
"""

# ── 7. The Toy Chest: it spills, it caps, it shuts, it eats its own ───────────
CHEST = r"""
async ([turns, slamDamage]) => {
  const e = make(['toy-chest'], { hp: 1500 });
  await e.startCombat();
  const chest = e.enemies[0];
  const trace = [];
  for (let t = 0; t < turns && !e.over; t++) {
    if (slamDamage) { chest.block = 0; swing(e, chest, slamDamage); }
    e.player.block = 0;
    await e.endTurn();
    trace.push({ move: chest.lastMove, contents: chest.counters.contents,
                 own: e.enemies.filter(x => x.alive && x.summonedBy === chest.id).length,
                 board: e.enemies.filter(x => x.alive).length });
  }
  return { trace, maxOwn: Math.max(...trace.map(t => t.own)) };
}
"""

# ── 8. The Patchwork Giant: it loses the Patch that was worth most ────────────
# A Patch tears from `onDamaged`, so it has to be REAL damage — dropping the
# Courage bar by hand crosses the threshold and tears nothing. Which Patch goes
# is scored against the move it is ABOUT to make, so the same wound at two
# different points in its cycle takes two different Patches off, and that is the
# whole of "the next Patch removed is always the one currently worth most".
GIANT = r"""
async ([coming]) => {
  const e = make(['patchwork-giant'], { hp: 1500 });
  await e.startCombat();
  const g = e.enemies[0];
  // 'fist' → Stuffed Fist, one hit: the Pillow's flat 6 Guard is worth more.
  // 'flail' → Wild Flail, three hits: the Bear's +3 a hit is worth more.
  g.history.length = coming === 'flail' ? 2 : 0;
  e.refreshIntents('probe');
  const before = intentOf(g);
  const patches0 = (g.mem.patches || []).slice();
  g.block = 0;
  /* Under the FIRST threshold, derived rather than guessed. The Giant scales
     its 90/60/30 tears by `maxHp / 126` (its authored Courage), so a literal
     "knock it to 100" only crossed a threshold while `hp` was the un-authored
     150 — at the design's 126 the first tear is at exactly 90 and 100 is above
     it, so nothing tore and four checks went red. */
  const t1 = Math.round(90 * (g.maxHp / 126));
  swing(e, g, g.hp - (t1 - 5), { ignoreBlock: true });
  const patches1 = (g.mem.patches || []).slice();
  const stuffing1 = g.counters['loose-stuffing'];
  const counter1 = g.counters.patches;
  e.refreshIntents('probe');
  const after = intentOf(g);
  // All the way down: every Patch gone, and Stuffed Fist stops being a Spring split.
  g.block = 0;
  // ...and below the LAST one, same derivation.
  const t3 = Math.round(30 * (g.maxHp / 126));
  swing(e, g, g.hp - Math.max(1, t3 - 10), { ignoreBlock: true });
  g.history.length = 0;
  e.refreshIntents('probe');
  return { coming, patches0, patches1, stuffing1, torn: g.mem.torn, before, after,
           counter: counter1,
           stripped: (g.mem.patches || []).slice(),
           strippedFist: intentOf(g),
           strippedStuffing: g.counters['loose-stuffing'] };
}
"""

# ── 9. The Porcelain Twins: Joined, and Alone ────────────────────────────────
TWINS = r"""
async ([mode]) => {
  const e = make(['porcelain-twin-prim', 'porcelain-twin-proper'], { hp: 1500 });
  await e.startCombat();
  const prim = body(e, 'porcelain-twin-prim');
  const proper = body(e, 'porcelain-twin-proper');
  if (mode === 'join') {
    prim.block = 0; proper.block = 0;
    // A Guard grant from OUTSIDE either Twin — the engine's own board event.
    e.gainBlock(prim, 8, { source: null });
    return { primBlock: prim.block, properBlock: proper.block };
  }
  // Alone: the survivor's promise must jump the instant the other one dies.
  prim.history.length = 1;
  e.refreshIntents('probe');
  const together = intentOf(prim);
  e.loseHp(proper, proper.hp + 5, 'test');
  e.refreshIntents('probe');
  return { together, alone: intentOf(prim) };
}
"""

# ── 10. every formation resolves, and no phase takes more than it promised ────
FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const e = buildEnc(encId, seed, hp, 9);
  const seen2 = tap(e);
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  await e.startCombat();
  const seen = new Set();
  let guard = 0, lies = 0, worst = null;
  while (!e.over && guard++ < turns) {
    await greedyTurn(e);
    for (const x of e.enemies) if (x.alive) seen.add(x.defId);
    if (e.over) break;
    const want = promised(e);
    const before = seen2.byEnemies();
    await e.endTurn();
    const got = seen2.byEnemies() - before;
    if (got > want) {
      lies++;
      if (!worst || got - want > worst.over) {
        worst = { turn: e.turn, want, got, over: got - want,
                  board: e.enemies.filter(x => x.alive).map(x => x.defId) };
      }
    }
  }
  console.warn = orig;
  return { encId, turns: e.turn, over: e.over, won: e.enemies.every(x => !x.alive),
           appeared: [...seen], warns: warns.slice(0, 3), lies, worst };
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

        # ══ the shape of the region ═════════════════════════════════════════
        s = await page.evaluate(STATIC)
        check(s["formations"] >= 18, "the region ships its full formation list",
              f"{s['formations']} formations, tiers {s['tiers']}")
        check(s["scares"] == 3 and s["bosses"] == 1,
              "three Big Scares and one boss", f"{s['scares']} elite, {s['bosses']} boss")
        check(not s["unknownMembers"], "every formation names an enemy that exists",
              ", ".join(s["unknownMembers"]) or "all resolve")
        check(s["implemented"], "the region is registered as implemented")
        check(not s["leaked"], "no summon-only enemy is placed in a formation by hand",
              ", ".join(s["leaked"]) or "none leaked")
        check(not s["unreachable"], "every enemy in the roster appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check(not s["noHaunt"], "every def carries a Haunt envelope",
              ", ".join(s["noHaunt"]) or f"{s['roster']} defs")
        check(len(s["buttons"]) == 3, "all three Buttons are registered statuses",
              str(s["buttons"]))

        # ══ 1. Sew On names the Button, and the Button depends on the ally ══
        plain = await page.evaluate(BUTTON, ["plain"])
        hurt = await page.evaluate(BUTTON, ["hurt"])
        swing_ = await page.evaluate(BUTTON, ["swinging"])
        check(plain["shown"]["statuses"] == plain["got"] and len(plain["got"]) == 1,
              "Sew On tells you which Button before it sews it",
              f"promised {plain['shown']['statuses']}, landed {plain['got']}")
        check(plain["got"] == ["button-brass"], "an untouched ally gets Brass",
              str(plain["got"]))
        check(hurt["got"] == ["button-pillow"], "a hurt ally gets Pillow instead",
              str(hurt["got"]))
        check(swing_["got"] == ["button-spring"],
              "an ally about to swing gets Spring — the read that changes the target",
              f"{swing_['got']} while it telegraphed {swing_['allyIntent']['move']}")

        # ══ 2. the Jam is a counter, not a cancel ══════════════════════════
        wound = await page.evaluate(JACK, [False])
        jammed = await page.evaluate(JACK, [True])
        check(wound["wound"] == 2 and jammed["wound"] == 1,
              "stripping the Handle's Guard unwinds one Wound Up",
              f"undisturbed {wound['wound']}, jammed {jammed['wound']}")
        check(wound["shown"]["damage"] == 17 and jammed["shown"]["damage"] == 12,
              "so POP! reads 17 wound and 12 jammed",
              f"{wound['shown']['damage']} vs {jammed['shown']['damage']}")
        check(wound["landed"] == 17 and jammed["landed"] == 12,
              "and each lands the number it showed",
              f"{wound['landed']} / {jammed['landed']}")

        # ══ 3. repair that costs the repairer ══════════════════════════════
        needed = await page.evaluate(SOLDIER, [True])
        fine = await page.evaluate(SOLDIER, [False])
        check(needed["moved"] == "patch-up" and needed["allyGained"] == 9,
              "the Soldier repairs a hurt ally for 9",
              f"{needed['moved']}, ally +{needed['allyGained']}")
        check(needed["solPaid"] == 7,
              "and pays exactly 7 of its own Courage to do it",
              f"-{needed['solPaid']}")
        check(fine["moved"] != "patch-up",
              "CONTROL: with nobody hurt it does something else entirely",
              str(fine["moved"]))

        # ══ 4. Excitement is the formation, not the Horse ══════════════════
        alone = await page.evaluate(HORSE, ["alone"])
        withbaby = await page.evaluate(HORSE, ["escorted"])
        check(withbaby["trace"][-1]["excitement"] >= alone["trace"][-1]["excitement"],
              "a Horse with a helpful friend is more excited than one without",
              f"escorted {[t['excitement'] for t in withbaby['trace']]}, "
              f"alone {[t['excitement'] for t in alone['trace']]}")
        check(alone["at3"]["damage"] - alone["at2"]["damage"] == 4,
              "Gallop reads 4 more for each Excitement it is holding",
              f"2 -> {alone['at2']['damage']}, 3 -> {alone['at3']['damage']}")
        check(alone["at2"]["move"] == "gallop" and alone["at0"]["move"] != "gallop",
              "and 2 Excitement is what makes it Gallop at all",
              f"{alone['at0']['move']} -> {alone['at2']['move']}")

        # ══ 5. Cover ═══════════════════════════════════════════════════════
        small = await page.evaluate(COVER, [6, False])
        exact = await page.evaluate(COVER, [8, False])
        over = await page.evaluate(COVER, [12, False])
        check(small["covered"] is True, "Tuck In really puts Covered on an ally")
        check(small["afterFirst"]["ally"] == 0 and small["blobPaid"] == 6,
              "the first 6 damage misses the ally entirely and the Blob is billed 6",
              json.dumps(small))
        check(exact["afterFirst"]["ally"] == 0 and exact["blobPaid"] == 8,
              "at exactly 8 the ally is still untouched",
              json.dumps(exact))
        check(over["allyLost"] == 4 and over["blobPaid"] == 8,
              "CONTROL: at 12 the allowance runs out and 4 reaches the ally",
              json.dumps(over))
        died = await page.evaluate(COVER_DEATH)
        check(died["before"] is True and died["after"] is False,
              "killing the Blob ends the Cover immediately",
              json.dumps(died))

        # ══ 6. the crack ladder ════════════════════════════════════════════
        pristine = await page.evaluate(DOLL, [1.0])
        cracked = await page.evaluate(DOLL, [0.5])
        shattered = await page.evaluate(DOLL, [0.2])
        check(pristine["shown"]["damage"] == 7 and cracked["shown"]["damage"] == 10
              and shattered["shown"]["damage"] == 13,
              "Tea Cup Tap reads 7 / 10 / 13 across the three crack states",
              f"{pristine['shown']['damage']} / {cracked['shown']['damage']} / "
              f"{shattered['shown']['damage']}")
        check(pristine["landed"] == 7 and shattered["landed"] == 13,
              "and lands what it showed at both ends of the ladder",
              f"{pristine['landed']} / {shattered['landed']}")
        check(pristine["guard"] >= 4 and cracked["guard"] == 0,
              "Perfect Posture's 4 Guard belongs to the Pristine state only",
              f"pristine {pristine['guard']}, cracked {cracked['guard']}")
        check(shattered["selfCost"] == 3 and pristine["selfCost"] == 0,
              "Shattered costs it 3 of its own Courage every time it swings",
              f"shattered -{shattered['selfCost']}, pristine -{pristine['selfCost']}")

        # ══ 7. the Chest ═══════════════════════════════════════════════════
        spill = await page.evaluate(CHEST, [8, 0])
        slam = await page.evaluate(CHEST, [6, 16])
        check(spill["maxOwn"] >= 1, "Spill Toys really puts something on the board",
              "; ".join(f"{t['move']}:{t['own']}" for t in spill["trace"]))
        check(spill["maxOwn"] <= 2,
              "and the cap of 2 really binds — the Chest counts its OWN summons",
              f"peak {spill['maxOwn']} standing at once")
        check(any(t["move"] == "rattle-angrily" for t in slam["trace"]),
              "16 damage in one turn really slams the lid on the next Spill",
              "; ".join(t["move"] for t in slam["trace"]))
        check(not any(t["move"] == "rattle-angrily" for t in spill["trace"][:4]),
              "CONTROL: undamaged, it spills on schedule instead",
              "; ".join(t["move"] for t in spill["trace"][:4]))
        tidy = [t for t in spill["trace"] if t["move"] == "tidy-up"]
        check(bool(tidy), "Tidy Up runs and reclaims a Content",
              str(tidy[:1]))

        # ══ 8. the Giant tears the Patch that was worth most ═══════════════
        fist = await page.evaluate(GIANT, ["fist"])
        flail = await page.evaluate(GIANT, ["flail"])
        check(len(fist["patches0"]) == 3 and len(fist["patches1"]) == 2
              and fist["counter"] == 2,
              "crossing a threshold really tears one Patch off",
              f"{fist['patches0']} -> {fist['patches1']}, counter {fist['counter']}")
        check("pillow" not in fist["patches1"],
              "facing a single Stuffed Fist it gives up the Pillow — 6 Guard a turn "
              "beats 3 damage on one hit",
              f"coming {fist['before']['move']}, left with {fist['patches1']}")
        check("bear" not in flail["patches1"],
              "CONTROL: facing a three-hit Wild Flail it gives up the Bear instead",
              f"coming {flail['before']['move']}, left with {flail['patches1']}")
        check(flail["after"]["damage"] == flail["before"]["damage"] - 1,
              "and the Flail it was showing drops by 1 — the Bear's 3 gone, "
              "2 Loose Stuffing back",
              f"{flail['before']['damage']} -> {flail['after']['damage']} "
              f"with {flail['stuffing1']} Stuffing")
        check(not fist["stripped"] and fist["strippedStuffing"] == 6,
              "driven to the last threshold every Patch is gone and the Stuffing is 6",
              f"{fist['stripped']}, stuffing {fist['strippedStuffing']}")
        check(fist["strippedFist"]["hits"] == 1,
              "and Stuffed Fist stops splitting once the Spring Patch is gone",
              f"{fist['strippedFist']['hits']} hit(s) for "
              f"{fist['strippedFist']['damage']}")

        # ══ 9. Joined and Alone ════════════════════════════════════════════
        join = await page.evaluate(TWINS, ["join"])
        check(join["primBlock"] == 8 and join["properBlock"] == 4,
              "Guard given to one Twin half-flows to the other",
              json.dumps(join))
        check(join["primBlock"] == 8,
              "CONTROL: and does not ricochet back — Prim keeps 8, not 10",
              f"prim {join['primBlock']}")
        lone = await page.evaluate(TWINS, ["alone"])
        check(lone["alone"]["damage"] - lone["together"]["damage"] == 3,
              "and the survivor's promise jumps by 3 the instant the other dies",
              f"{lone['together']['damage']} -> {lone['alone']['damage']}")

        # ══ 10. every formation in the region ══════════════════════════════
        ids = await page.evaluate(
            "() => window.__N.enc.ENCOUNTER_LIST.filter(x => x.region === 'nursery').map(x => x.id)")
        total_lies, worst = 0, []
        for enc_id in ids:
            hp = 1500 if ("scare" in enc_id or enc_id.endswith("boss")) else 600
            r = await page.evaluate(FIGHT, [enc_id, 11, 60, hp])
            total_lies += r["lies"]
            if r["worst"]:
                worst.append(f"{enc_id} {json.dumps(r['worst'])}")
            check(r["over"] and not r["warns"],
                  f"{enc_id}: resolves cleanly against the real engine",
                  f"{r['turns']} turns, won={r['won']}, warns="
                  + ("; ".join(r["warns"]) or "none"))
        check(total_lies == 0,
              "no enemy phase in the whole region took more than its intents promised",
              "; ".join(worst[:3]) or f"{len(ids)} formations audited")

        # == the Giant's Patches reach the screen, not just a counter =======
        whole = await page.evaluate(PATCHES, [False])
        torn = await page.evaluate(PATCHES, [True])
        check(whole["openingName"] == "Patches 3 / 3",
              "the Giant opens by naming how many Patches it has",
              str(whole["openingName"]))
        for patch in ("Bear", "Pillow", "Spring"):
            check(patch in (whole["openingText"] or ""),
                  "and the card names the " + patch + " Patch and what it does "
                  "(13 gives each one its own ability)",
                  (whole["openingText"] or "")[:120])
        check(len(torn["left"]) < 3 and torn["afterName"] != whole["openingName"],
              "CONTROL: driven past a threshold a Patch really tears and the "
              "card really changes",
              str(whole["openingName"]) + " -> " + str(torn["afterName"])
              + ", left " + str(torn["left"]))
        check("tears away" in (torn["afterText"] or ""),
              "and it NAMES the Patch that just came off - which is what "
              "'the player feels like they are literally dismantling it' needs",
              (torn["afterText"] or "")[:120])
        check(torn["cards"] == 1,
              "and it REPLACES its own card rather than adding one per tear "
              "(three House Rule cards fit; the fourth buries the portrait)",
              str(torn["cards"]) + " patch cards")

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
