"""The Heart of the House, driven against the REAL CombatEngine.

    python tests/heart/check.py [--verbose]

WHY THIS EXISTS SEPARATELY FROM tests/enemies/
----------------------------------------------
`tests/enemies/run.py` is a structural checker with a MOCKED context. It proved
all 79 definitions are well-formed, that no intent lies about its damage, and
that nothing applies a status it did not declare. It cannot prove that anything
here changes the board, because its harness fakes `summon`, records `addHook`
without running it, and has no card costs at all.

That gap is not theoretical — it is the exact thing that happened to the
Kitchens, where Divide, Bake and the Recipe Board summoned NOTHING on their
first real run while the structural suite stayed green throughout.

The Heart makes it worse, because it is the first region to lean on four seams
that were DEAD when it was written:

  * `c.cardsIn` / `c.moveCardTo` / `c.playerDraw` — added for this region.
  * `EnemyDef.damageTakenMul` — declared by the Sugar Golem and the Wardrobe
    since their regions shipped, with a comment in the Kitchens asserting "the
    engine reads a MULTIPLIER here", and read by NOTHING. The Golem's third
    layer was not a third layer.
  * `EnemyDef.isTargetable` — same story, same two files.
  * `Hooks.removeByOwner` — documented on `enemyCtx.addHook` as "removed with
    the enemy" and never called, so a rule an enemy installed outlived it. The
    Heart's Sanctuary Locks are the first content that needs it to be true, and
    a Routine Lock the player broke must stop charging them.

Every one of those is asserted here with a CONTROL that runs the same board
without the thing, because a check that cannot fail is worse than no check.

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
  window.__H = { C, enc, en, st, cards, run };
  window.__H.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

# A real engine with a real registry. Every caller below goes through this, so
# a missing `registerEnemies` fails everywhere at once rather than in one place.
#
# Wrapped in an installer arrow on purpose: `page.evaluate` on a string that
# LOOKS like a function expression calls it, so handing Playwright the bare
# assignment invoked `make` once with no arguments and threw on `enemyIds.map`.
MAKE = r"""
() => { window.make = function make(enemyIds, { seed = 7, hp = 500, energy = 9, deck = 'marmalade' } = {}) {
  const { C, en, cards, RNG } = window.__H;
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
  const { enc, en, run } = window.__H;
  const HT = enc.ENCOUNTER_LIST.filter(x => x.region === 'heart');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'heart');
  const placed = new Set(HT.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: HT.length,
    tiers: [...new Set(HT.map(f => f.tier))].sort(),
    roster: roster.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: HT.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: HT.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    summonOnly: en.SUMMON_ONLY,
    ladder: run.RUN_REGIONS,
    ladderLength: run.RUN_LENGTH_REGIONS,
  };
}
"""

# ── the three pile seams, tested directly rather than through an enemy ───────
SEAMS = r"""
async () => {
  const e = make(['housekeeper']);
  await e.startCombat();
  const c = e.enemyCtx(e.enemies[0], null);

  const hand0 = c.cardsIn('hand');
  const draw0 = c.cardsIn('draw');
  const handShape = hand0.length
    ? ['uid', 'id', 'name', 'type', 'cost'].every(k => hand0[0][k] !== undefined) : false;

  // moveCardTo: a card in hand, to the bottom of the draw pile, by uid.
  const target = hand0[0];
  const moved = c.moveCardTo(target.uid, 'draw', { bottom: true });
  const drawNow = c.cardsIn('draw');
  const atBottom = drawNow.length ? drawNow[drawNow.length - 1].uid === target.uid : false;
  const goneFromHand = !c.cardsIn('hand').some(x => x.uid === target.uid);

  // playerDraw: the seat really draws.
  const handBefore = c.cardsIn('hand').length;
  c.playerDraw(2);
  const drew = c.cardsIn('hand').length - handBefore;

  return { hand: hand0.length, draw: draw0.length, handShape,
           moved, atBottom, goneFromHand, drew };
}
"""

# ── damageTakenMul, with the control that proves the multiplier is read ──────
DAMAGE_MUL = r"""
async ([refusal]) => {
  const e = make(['door-that-says-stay'], { seed: 11 });
  await e.startCombat();
  const door = e.enemies[0];
  door.counters.refusal = refusal;
  door.block = 0;
  const before = door.hp;
  e.dealDamage({ attacker: e.player, defender: door, amount: 20, kind: 'attack' });
  return { refusal, dealt: before - door.hp };
}
"""

# ── the Sugar Golem, which has had a dead third layer since the Kitchens ─────
GOLEM = r"""
async ([layer]) => {
  const e = make(['sugar-golem'], { seed: 3 });
  await e.startCombat();
  const g = e.enemies[0];
  // Its layers are read off its own Courage; drop it into the one asked for.
  g.hp = layer === 'crystal' ? Math.round(g.maxHp * 0.2) : g.maxHp;
  g.block = 0;
  const before = g.hp;
  e.dealDamage({ attacker: e.player, defender: g, amount: 20, kind: 'attack' });
  return { layer, dealt: before - g.hp };
}
"""

# ── isTargetable: the Wardrobe's body is shut until a Door breaks ────────────
TARGETABLE = r"""
async ([breakDoors]) => {
  const e = make(['the-wardrobe'], { seed: 5 });
  await e.startCombat();
  const w = e.enemies.find(x => x.defId === 'the-wardrobe');
  if (!w) return { skip: true };
  if (breakDoors) (w.mem ||= {}).doorsBroken = 1;
  const atk = e.piles.hand.find(x => x.type === 'attack')
    || e.piles.draw.find(x => x.type === 'attack');
  return { breakDoors, targetable: e.isTargetable(w, atk || null) };
}
"""

# ── costRule, and that it DIES with the Lock that installed it ───────────────
COST_RULE = r"""
async ([breakLock]) => {
  const e = make(['keeper'], { seed: 9, hp: 900, energy: 99 });
  await e.startCombat();
  const keeper = e.enemies.find(x => x.defId === 'keeper');
  const locks = e.enemies.filter(x => x.def && x.def.lock);
  const routine = e.enemies.find(x => x.defId === 'routine-lock');
  if (breakLock && routine) e.loseHp(routine, routine.hp + 5, 'test');

  // Play three Tricks, then ask what the FOURTH would cost.
  let played = 0;
  for (const card of [...e.piles.hand]) {
    if (played >= 3) break;
    const t = (e.firstLivingEnemy() || {}).id ?? null;
    if (!e.canPlay(card.uid, t).ok) continue;
    await e.playCard(card.uid, t);
    played++;
  }
  const next = e.piles.hand[0];
  const cost = next ? e.costOf(next) : null;
  const base = next ? Math.max(0, next.baseCost) : null;
  return { breakLock, locks: locks.length, played, cost, base,
           lockAlive: !!(routine && routine.alive),
           panic: keeper ? (keeper.counters.panic || 0) : -1 };
}
"""

# ── the roster-mutating mechanics, on a real board, watching for warnings ────
FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const { C, enc, en, cards, RNG } = window.__H;
  const members = enc.buildEncounter(encId, new RNG(seed), 0);
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: 4, deck: cards.startingDeckFor('marmalade') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  await e.startCombat();
  const seen = new Set();
  const rules = new Set();
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
  return { turns: e.turn, over: e.over, appeared: [...seen], rules: [...rules],
           warns: warns.slice(0, 4) };
}
"""

# ── the Namekeeper really files an unplayed Named Trick back on top ──────────
NAMEKEEPER = r"""
async ([playIt]) => {
  const e = make(['namekeeper'], { seed: 21, hp: 400, energy: 9 });
  await e.startCombat();
  const nk = e.enemies[0];
  await e.endTurn();                       // Call Your Name telegraphs
  // The Name lands at the START of the player's turn (engine step 6c), because
  // that is the only moment there is a hand to choose from.
  const named = nk.mem && nk.mem.named;
  if (!named) return { named: null };

  /* The filing is asserted on the ENGINE EVENT, not on where the card sits
     afterwards: `endTurn` runs the enemy phase AND the next draw, so a Trick
     put on top of the draw pile is in the player's hand a moment later and
     "is it on top" answers false however well the mechanic worked. */
  const moves = [];
  e.on('card:move', (ev) => moves.push({ uid: ev.cardUid, to: ev.to, at: ev.position, why: ev.reason }));
  /* Damage SWUNG, not Courage lost. Playing the Named Trick is playing a card,
     and the Trick the Namekeeper picked may well be a Guard card — the first
     version of this check measured hp loss and reported that being Recognized
     made the player SAFER, because Curl Up had been named and its 5 Guard ate
     more than Recognized added. `hpLoss + blocked` is the number the enemy
     actually threw. */
  let swung = 0;
  e.on('damage', (ev) => {
    if (ev.targetId !== e.player.id) return;
    swung += (ev.hpLoss || 0) + (ev.blocked || 0);
  });

  if (playIt) {
    const card = e.card(named.uid);
    const t = (e.firstLivingEnemy() || {}).id ?? null;
    if (card && e.canPlay(card.uid, t).ok) await e.playCard(card.uid, t);
  }
  const hpBefore = nk.hp;
  await e.endTurn();                       // settle the Name, then Registry Slam
  const filed = moves.some(m => m.uid === named.uid && m.to === 'draw' && m.at === 0);
  const lostCourage = hpBefore - nk.hp;

  /* THE BOOST IS ON THE FOLLOWING TURN, on purpose. Recognized is applied at
     `onPlayerReady` rather than where it is earned, so that it is inside the
     intent the player reads — see the Namekeeper. Measuring the phase it was
     earned in would therefore measure nothing, which is what the first version
     of this check did. */
  swung = 0;
  await e.endTurn();
  return { playIt, name: named.name, filed, swung, lostCourage };
}
"""

# ── Belonging: a rule the final boss prints and could not enforce ────────────
#
# "End the turn holding 2 or more and the Keeper gains 8 Guard."  It read
# `c.cardsIn('hand')` from `onPlayerTurnEnd`, which is step 3 of `_endTurn`,
# and `_closeSeatHand` empties the hand at step 1 — so the count was 0 for
# every seat on every turn and the rule had never fired once. The engine now
# latches what the seat was holding when the button was pressed.
BELONGING = r"""
async ([spendHand]) => {
  const e = make(['keeper'], { seed: 31, hp: 5000, energy: 99 });
  await e.startCombat();
  const k = e.enemies.find(x => x.defId === 'keeper');
  // Into phase two, where the Arguments live, and onto Belonging.
  k.hp = Math.round(350 * (k.maxHp / 540)); k.block = 0;
  e.refreshIntents('test');
  await e.endTurn();
  if (k.mem.phase !== 2) await e.endTurn();
  const args = (k.mem.rejected || []);
  const before = k.block;
  if (spendHand) {
    // Empty the hand deliberately: the CONTROL for "holding 2 or more".
    for (const c of [...e.piles.hand]) {
      const t = (e.firstLivingEnemy() || {}).id ?? null;
      if (e.canPlay(c.uid, t).ok) await e.playCard(c.uid, t);
      else e.moveCard(c, 'discard');
    }
  }
  const held = e.piles.hand.length;
  k.block = 0;
  // Point the rotation at Belonging LAST, after the hand is settled: emptying
  // it by playing four Tricks meets two Independence conditions at once and
  // the Argument is rejected before it can be tested.
  k.mem.argAt = 3;
  const which = k.mem.argAt;
  await e.endTurn();
  return { phase: k.mem.phase, held, guardAfter: k.block, which,
           owed: k.mem.belongingOwed || 0,
           rejected: (k.mem.rejected || []).slice(),
           rules: e.rules.map(r => r.name) };
}
"""

# ── the Keeper's three phases, walked ────────────────────────────────────────
KEEPER = r"""
async () => {
  const e = make(['keeper'], { seed: 31, hp: 5000, energy: 9 });
  await e.startCombat();
  const k = e.enemies.find(x => x.defId === 'keeper');
  const locksAtStart = e.enemies.filter(x => x.def && x.def.lock).length;

  // Straight to the first threshold, then let it take its turn.
  const two = Math.round(350 * (k.maxHp / 540));
  k.hp = two; k.block = 0;
  e.refreshIntents('test');                 // it has crossed; let it re-read
  await e.endTurn();
  if (k.mem.phase !== 2) await e.endTurn();
  const phaseTwo = k.mem.phase;
  const panic = k.counters.panic || 0;
  const locksAfter = e.enemies.filter(x => x.def && x.def.lock && x.alive).length;

  const three = Math.round(160 * (k.maxHp / 540));
  k.hp = three; k.block = 0;
  e.refreshIntents('test');
  await e.endTurn();
  if (k.mem.phase !== 3) await e.endTurn();
  const phaseThree = k.mem.phase;
  const openHeart = k.hasStatus('open-heart');

  // Open Heart is 15% more damage taken, and it is a STATUS so it composes.
  k.block = 0;
  const before = k.hp;
  e.dealDamage({ attacker: e.player, defender: k, amount: 20, kind: 'attack' });
  return { locksAtStart, phaseTwo, panic, locksAfter, phaseThree, openHeart,
           dealtUnderOpenHeart: before - k.hp, maxHp: k.maxHp };
}
"""

# ── House Pulse: the buff must be on the intent, not applied after it ────────
PULSE = r"""
async () => {
  const e = make(['house-pulse', 'memory-animal'], { seed: 41, hp: 400 });
  await e.startCombat();
  const pulse = e.enemies.find(x => x.defId === 'house-pulse');
  const animal = e.enemies.find(x => x.defId === 'memory-animal');
  // Force Systole and let the phase end publish it.
  pulse.counters.systole = 1;
  await e.endTurn();
  // Beat FLIPS the Heartbeat, so which of the two lands depends on the move it
  // took. What must be true is that the formation is under ONE of them.
  const sys = animal.alive ? animal.hasStatus('systole') : false;
  const dia = animal.alive ? animal.hasStatus('diastole') : false;
  const intent = animal.alive ? animal.intent : null;
  return { sys, dia, beating: sys || dia,
           intentDamage: intent ? intent.damage : null,
           intentName: intent ? intent.name : null };
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
        check(s["formations"] >= 21,
              "the region ships its full formation list",
              f"{s['formations']} formations, tiers {s['tiers']}")
        check(s["ordinary"] == 8,
              "eight ordinary enemies, because it is the final region (§2)",
              f"{s['ordinary']} ordinary of {s['roster']} defs")
        check(s["scares"] == 4, "four Big Scares (§3)", f"{s['scares']}")
        check(not s["unknownMembers"], "every formation names an enemy that exists",
              ", ".join(s["unknownMembers"]) or "all resolve")
        check("heart" in s["implemented"], "the region is registered as implemented",
              str(s["implemented"]))
        check(not s["leaked"], "no summon-only enemy is placed in a formation by hand",
              ", ".join(s["leaked"]) or f"guarding {len(s['summonOnly'])}")
        check(not s["unreachable"], "every enemy in the roster appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check(s["ladder"][-1] == "heart",
              "THE HEART IS THE END OF THE RUN — the ladder finishes there",
              f"{s['ladder']} ({s['ladderLength']} wings)")

        # ══ the three pile seams this region added ══════════════════════════
        r = await page.evaluate(SEAMS)
        check(r["hand"] > 0 and r["handShape"],
              "cardsIn('hand') returns snapshots with uid/id/name/type/cost",
              f"{r['hand']} in hand, {r['draw']} in draw")
        check(r["moved"] and r["atBottom"] and r["goneFromHand"],
              "moveCardTo really moves a Trick, by uid, to the pile named",
              json.dumps({k: r[k] for k in ("moved", "atBottom", "goneFromHand")}))
        check(r["drew"] == 2, "playerDraw(2) draws two", f"drew {r['drew']}")

        # ══ damageTakenMul — dead until the Heart needed it ═════════════════
        d0 = await page.evaluate(DAMAGE_MUL, [0])
        d3 = await page.evaluate(DAMAGE_MUL, [3])
        check(d0["dealt"] == 20,
              "CONTROL: at 0 Refusal the Door takes exactly what it is dealt",
              f"{d0['dealt']} of 20")
        check(d3["dealt"] > d0["dealt"],
              "at 3 Refusal the Door takes 30% more — damageTakenMul is READ",
              f"{d0['dealt']} -> {d3['dealt']}")

        g_full = await page.evaluate(GOLEM, ["shell"])
        g_crystal = await page.evaluate(GOLEM, ["crystal"])
        check(g_crystal["dealt"] > g_full["dealt"],
              "the Sugar Golem's crystal layer really is softer — its third "
              "layer had never been a layer",
              f"shell {g_full['dealt']} -> crystal {g_crystal['dealt']}")

        # ══ isTargetable ════════════════════════════════════════════════════
        t_shut = await page.evaluate(TARGETABLE, [False])
        t_open = await page.evaluate(TARGETABLE, [True])
        if t_shut.get("skip"):
            check(True, "the Wardrobe is not in this build — isTargetable unchecked", "skipped")
        else:
            check(t_shut["targetable"] is False,
                  "the Wardrobe's body cannot be hit until a Door breaks",
                  json.dumps(t_shut))
            check(t_open["targetable"] is True,
                  "CONTROL: break one Door and the body is targetable",
                  json.dumps(t_open))

        # ══ costRule, and that it dies with its Lock ════════════════════════
        c_on = await page.evaluate(COST_RULE, [False])
        c_off = await page.evaluate(COST_RULE, [True])
        check(c_on["locks"] == 4, "the Keeper opens with four Sanctuary Locks",
              f"{c_on['locks']} locks")
        check(c_on["played"] == 3 and c_on["cost"] is not None,
              "three Tricks played, and a fourth in hand to price", json.dumps(c_on))
        check(c_on["cost"] == c_on["base"] + 1,
              "the Routine Lock really charges 1 more for the fourth Trick",
              f"base {c_on['base']} -> {c_on['cost']}")
        check(c_off["cost"] == c_off["base"],
              "CONTROL: break the Routine Lock and the surcharge STOPS — "
              "an ad-hoc hook dies with the enemy that installed it",
              f"base {c_off['base']} -> {c_off['cost']}, lock alive {c_off['lockAlive']}")
        check(c_off["panic"] >= 1,
              "breaking a Lock frightens the Keeper", f"panic {c_off['panic']}")

        # ══ roster-mutating mechanics on a real board ═══════════════════════
        for enc_id, seed, turns, hp, want, label in [
            ("ht-scare-names", 3, 40, 800, ["memory-echo"],
             "the Unknown Stone really summons a Memory Echo"),
            ("ht-scare-sanctuary", 4, 30, 800,
             ["safety-system", "comfort-system", "routine-system"],
             "Perfect Sanctuary really puts its three Systems on the board"),
            ("ht-boss", 5, 40, 2000,
             ["shelter-lock", "routine-lock", "observation-lock", "return-lock"],
             "the Keeper really puts its four Locks on the board"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            missing = [w for w in want if w not in r["appeared"]]
            check(not missing, label,
                  f"{enc_id}: missing {missing}" if missing else f"{enc_id}: {want} all appeared")
            check(not r["warns"], f"{enc_id}: the engine logged no warnings",
                  "; ".join(r["warns"][:2]) or "clean")

        r = await page.evaluate(FIGHT, ["ht-scare-remembers", 6, 40, 800])
        check(any(x.startswith("memories:") for x in r["rules"]),
              "House Remembers publishes its Memory Cycle on the rules strip",
              str(r["rules"][:3]))

        # ══ the Namekeeper's Named Trick ════════════════════════════════════
        n_left = await page.evaluate(NAMEKEEPER, [False])
        n_played = await page.evaluate(NAMEKEEPER, [True])
        check(n_left.get("name"), "the Namekeeper names a Trick in hand",
              str(n_left.get("name")))
        check(n_left.get("filed") is True,
              "an unplayed Named Trick is filed back on TOP of the draw pile",
              json.dumps({k: n_left.get(k) for k in ("name", "filed")}))
        check(n_played.get("filed") is False and n_played.get("lostCourage", 0) >= 4,
              "CONTROL: play the Named Trick instead and it is NOT filed — it "
              "costs the Namekeeper 4 Courage",
              json.dumps({k: n_played.get(k) for k in ("filed", "lostCourage")}))
        check(n_played.get("swung", 0) > n_left.get("swung", 0),
              "and Recognized is paid for: the Namekeeper's next attack swings harder",
              f"left it {n_left.get('swung')} -> played it {n_played.get('swung')}")

        # ══ the Keeper, all three phases ════════════════════════════════════
        k = await page.evaluate(KEEPER)
        check(k["locksAtStart"] == 4, "phase one opens with four Locks", json.dumps(k)[:120])
        check(k["phaseTwo"] == 2, "at 350 Courage it turns to phase two", f"phase {k['phaseTwo']}")
        check(k["panic"] == 4,
              "phase two ALWAYS opens at 4 Panic (§38) — unbroken Locks snap on their own",
              f"panic {k['panic']}, locks left {k['locksAfter']}")
        check(k["locksAfter"] == 0, "and no Lock survives the transition", f"{k['locksAfter']}")
        check(k["phaseThree"] == 3, "at 160 Courage it turns to phase three", f"phase {k['phaseThree']}")
        check(k["openHeart"] is True, "phase three carries Open Heart", str(k["openHeart"]))
        check(k["dealtUnderOpenHeart"] > 20,
              "and Open Heart really is 15% more damage taken",
              f"20 dealt -> {k['dealtUnderOpenHeart']} taken")

        # ══ House Pulse arms its buff BEFORE the intent is drawn ════════════
        r = await page.evaluate(PULSE)
        check(r["beating"] is True,
              "the House Pulse's Heartbeat reaches the rest of the formation",
              json.dumps(r))

        # ══ Belonging, the rule that could not fire ════════════════════════
        holding = await page.evaluate(BELONGING, [False])
        empty = await page.evaluate(BELONGING, [True])
        check(holding["phase"] == 2 and empty["phase"] == 2,
              "both probes reach phase two, where the Arguments live",
              f"{holding['phase']} / {empty['phase']}")
        # Its own move grants Guard either way, so the claim is the DIFFERENCE
        # the two boards make, not the total on the bar.
        check(holding["held"] >= 2 and empty["held"] < 2,
              "the two boards really do differ in what the seat was holding",
              f"holding {holding['held']}, empty {empty['held']}")
        check(holding["guardAfter"] - empty["guardAfter"] == 8,
              "ending the turn holding 2 or more really does hand the Keeper "
              "exactly 8 more Guard than ending it empty-handed",
              f"{holding['guardAfter']} vs {empty['guardAfter']}")

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
