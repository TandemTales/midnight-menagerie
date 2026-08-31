"""The Forgotten Foyer, driven against the REAL CombatEngine.

    python tests/foyer/check.py [--verbose]

WHY THIS EXISTS, AND WHY IT ARRIVED LAST
-----------------------------------------
Fourteen of the seventeen regions have had one of these since the Kitchens. The
first three predate the pattern: they were built before anyone had learned that
`tests/enemies/run.py` — a structural checker with a mocked context — stays
green through a summon that summons nothing, a rule that announces nothing and a
hook the engine never calls. Every one of those has since been found in a LATER
region by a suite exactly like this one, and the Foyer is the region a new
player meets first.

The region thesis is "read the room before playing your hand", and every enemy
here is sold on the same promise: THE NUMBER ON THE INTENT MOVES WHEN YOU ACT.
That is a claim about a board one turn from now, so every check below has a
CONTROL that runs the same board WITHOUT the player's action:

  * the Dust Bunny's Tumble really reads 3 lower the instant you poke it, and
    really drops out of ATTACK_BIG when it does;
  * the Crawler's Umbrella Jab really reads 12 behind a standing Brace and
    really 7 with it stripped — and really HITS for the number it showed;
  * Lost Luggage really puts a Clutter in the discard pile, not in a comment;
  * the Calling Bell really summons when it is alone and really does NOT when
    it has company;
  * Roused really lands after the enemy phase, so no ally is ever buffed
    between the moment its number is shown and the moment it swings;
  * Unroll's Momentum really is banked only when its Guard survives the turn;
  * NO RUNNING really is a live rule with a real Reprimand on the fourth Trick
    and really none on the third;
  * the Coatcheck's Garments really rotate, Evening Coat really adds 4, the
    Mourning Coat really adds Clutter ONCE a turn, and 18 damage really Snags
    while 17 really does not;
  * the Guest's Familiarity really escalates live and really costs Guard at two
    and Courage at three;
  * and the House Bell's Resonance really climbs only on its two Ring moves,
    really falls when one of ITS OWN summons dies and really not when some
    other body does — the hook that carries that was dead until 2026-08-30 and
    nothing in this region would have noticed.

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
  window.__F = { C, enc, en, st, cards };
  window.__F.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

MAKE = r"""
() => {
  const { C, enc, en, cards, RNG } = window.__F;
  window.make = function (ids, { seed = 7, hp = 500, energy = 9 } = {}) {
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
      player: { name: 'K', maxHp: hp, hp, energyMax: energy || 99,
                deck: cards.startingDeckFor('mossbit') },
      enemies: members.map(m => en.getEnemy(m.enemyId)) });
    e.registerCards(cards.allCards());
    e.registerCards(en.STATUS_TRICK_DEFS);
    e.registerEnemies(en.ENEMY_LIST);
    return e;
  };
  /* One swing from the player, through Guard, tagged as a real Attack so that
     `damageTakenThisTurn` — which is what every "did the player act" read in
     this region is built on — is actually written. */
  window.swing = function (e, target, amount) {
    const before = target.hp;
    e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                   card: { type: 'attack', id: 't', uid: 't' } });
    return before - target.hp;
  };
  window.intentOf = function (a) {
    return a && a.intent
      ? { move: a.intent.moveId, damage: a.intent.damage ?? null,
          hits: a.intent.hits ?? 1, type: a.intent.type ?? null }
      : null;
  };
  /* Total Courage an enemy phase PROMISED, summed off the intents standing at
     the moment the player ends their turn. */
  window.promised = function (e) {
    let n = 0;
    for (const a of e.enemies) {
      if (!a.alive || !a.intent) continue;
      const d = a.intent.damage;
      if (typeof d === 'number' && d > 0) n += d * (a.intent.hits || 1);
    }
    return n;
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
  window.clutter = function (e) {
    return e.piles.all().filter(c => String(c.id).includes('clutter')).length;
  };
  window.body = function (e, defId) {
    return e.enemies.filter(x => x.defId === defId && x.alive)[0] || null;
  };
  /* Courage an enemy DEALT at a seat, read off the damage events rather than
     off the Courage bar. A Reprimand that lands on Guard the breaking Trick
     itself put up is still a Reprimand, and `hp` cannot see it. */
  window.tap = function (e) {
    const log = [];
    e.on('damage', ev => { if (ev.targetId === 'player') log.push(ev); });
    /* `aimed` and not `dealt`. A Reprimand that a Trick in the player's own
       hand postponed (Mossbit's Not Yet buries the next 8 Attack damage) is
       emitted with `amount: 0, prevented: true` and its size only in `base` —
       so measuring the Courage bar reads a live rule as a dead one. What this
       region promises is the SIZE of the consequence, which is `base`. */
    return {
      from: (id) => log.filter(x => x.sourceId === id)
                       .reduce((n, x) => n + (x.base || 0), 0),
      dealtFrom: (id) => log.filter(x => x.sourceId === id)
                            .reduce((n, x) => n + (x.amount || 0), 0),
      /* Courage the ENEMIES aimed at the seat, and nothing else. The player's
         own deck pays Courage during the enemy phase too — Mossbit's Not Yet
         buries 8 Attack damage and settles it a turn later with no intent
         anywhere near it — and a ledger that cannot tell those apart reads the
         player's own postponement as an enemy lying. */
      byEnemies: () => log.filter(x => e.enemies.some(en => en.id === x.sourceId))
                          .reduce((n, x) => n + (x.amount || 0), 0),
    };
  };
  return true;
}
"""

STATIC = r"""
async () => {
  const { enc, en } = window.__F;
  const F = enc.ENCOUNTER_LIST.filter(x => x.region === 'foyer');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'foyer');
  const placed = new Set(F.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: F.length,
    tiers: [...new Set(F.map(f => f.tier))].sort(),
    roster: roster.length,
    scares: F.filter(f => f.tier === 'elite').length,
    bosses: F.filter(f => f.tier === 'boss').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS.includes('foyer'),
    unknownMembers: F.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    // Every def must carry a Haunt envelope; the ladder reads it at spawn.
    noHaunt: roster.filter(d => typeof d.hauntScaling !== 'function').map(d => d.id),
  };
}
"""

# ── 1. Dust Bunny: the region's first promise, and its control ────────────────
DUST = r"""
async ([poke]) => {
  const e = make(['dust-bunny']);
  await e.startCombat();
  await e.endTurn();                       // it Gathers, and banks Dust twice
  const b = e.enemies[0];
  const before = intentOf(b);
  const dust = b.counters.dust;
  /* Through the 5 Guard Gather leaves standing, and one point past it. `wasHit`
     is `damageTakenThisTurn > 0` and that counts COURAGE lost, not damage
     aimed — a poke fully absorbed by Guard has correctly not disturbed it. */
  if (poke) { swing(e, b, (b.block || 0) + 1); e.refreshIntents('probe'); }
  const after = intentOf(b);
  const hpBefore = e.player.hp;
  await e.endTurn();                       // let the Tumble it promised land
  return { dust, before, after, landed: hpBefore - e.player.hp };
}
"""

# ── 2. Coatrack Crawler: 12 behind a Brace, 7 with it stripped ────────────────
CRAWLER = r"""
async ([strip]) => {
  const e = make(['coatrack-crawler']);
  await e.startCombat();
  await e.endTurn();                       // Brace: 10 Guard
  const a = e.enemies[0];
  const guard = a.block;
  if (strip) { swing(e, a, guard); e.refreshIntents('probe'); }
  const shown = intentOf(a);
  const hpBefore = e.player.hp;
  e.player.block = 0;
  await e.endTurn();                       // Umbrella Jab
  return { guard, shown, landed: hpBefore - e.player.hp };
}
"""

# ── 3. Lost Luggage: a real card in a real pile ───────────────────────────────
LUGGAGE = r"""
async () => {
  const e = make(['lost-luggage']);
  await e.startCombat();
  const before = clutter(e);
  await e.endTurn();                       // Pack Wrong
  return { before, after: clutter(e),
           inDiscard: e.piles.discard.filter(c => String(c.id).includes('clutter')).length };
}
"""

# ── 4. Calling Bell: it shouts for help only when it is alone ─────────────────
BELL = r"""
async ([withAlly]) => {
  const e = make(withAlly ? ['calling-bell', 'dust-bunny'] : ['calling-bell']);
  await e.startCombat();
  const bell = body(e, 'calling-bell');
  const shown = intentOf(bell);
  await e.endTurn();
  const bunnies = e.enemies.filter(x => x.defId === 'dust-bunny');
  const summoned = bunnies.filter(x => x.summonedBy != null);
  return { shown, summoned: summoned.length,
           summonHp: summoned.length ? summoned[0].maxHp : null,
           roused: e.enemies.filter(x => x !== bell && x.hasStatus && x.hasStatus('roused')).length };
}
"""

# ── 5. Roused never lands inside a number already shown ───────────────────────
#
# The Bell arms Roused in `effect` and applies it in `onEnemyPhaseEnd`. If it
# applied mid-phase, an ally standing later in slot order would swing for more
# than its own intent promised — which is the single most expensive bug class in
# this codebase. Four turns, each compared against what the board committed to.
LEDGER = r"""
async () => {
  const e = make(['calling-bell', 'dust-bunny'], { hp: 900 });
  await e.startCombat();
  const rows = [];
  for (let t = 0; t < 5 && !e.over; t++) {
    const want = promised(e);
    const hp = e.player.hp;
    e.player.block = 0;
    await e.endTurn();
    rows.push({ turn: t + 1, want, got: hp - e.player.hp });
  }
  return { rows, lies: rows.filter(r => r.got > r.want).length,
           roused: body(e, 'dust-bunny') ? body(e, 'dust-bunny').status('roused') : null };
}
"""

# ── 6. Red Carpet Runner: Momentum is banked only if the Guard survives ───────
RUNNER = r"""
async ([strip]) => {
  const e = make(['red-carpet-runner'], { hp: 900 });
  await e.startCombat();
  await e.endTurn();                       // Unroll: 12 Guard, unrolled = true
  const a = e.enemies[0];
  if (strip) swing(e, a, a.block);
  const guardLeft = a.block;
  await e.endTurn();                       // Gather Speed (+1 Momentum either way)
  e.refreshIntents('probe');
  const shown = intentOf(a);
  // Read the meter BEFORE Run the Hall spends it — the move sets it back to 0.
  const momentum = a.counters.momentum;
  const hpBefore = e.player.hp;
  e.player.block = 0;
  await e.endTurn();                       // Run the Hall
  return { guardLeft, momentum, shown, landed: hpBefore - e.player.hp };
}
"""

# ── 7. Door Greeter: NO RUNNING is a live rule with a real Reprimand ──────────
GREETER = r"""
async ([tricks]) => {
  const e = make(['door-greeter'], { hp: 900, energy: 99 });
  const seen = tap(e);
  await e.startCombat();
  await e.endTurn();                       // Mind Your Manners
  const rules = e.rules.map(r => r.id);
  const greeter = e.enemies[0].id;
  const armed = seen.from(greeter);        // whatever its own turn already cost
  let played = 0;
  for (let i = 0; i < tricks; i++) {
    const c = e.piles.hand.find(x => e.canPlay(x.uid, (e.firstLivingEnemy() || {}).id).ok);
    if (!c) break;
    await e.playCard(c.uid, (e.firstLivingEnemy() || {}).id ?? null);
    played++;
  }
  // Off the damage LOG, not the Courage bar: the fourth Trick is often the one
  // that raised the Guard the Reprimand then lands on.
  return { rules, played, reprimand: seen.from(greeter) - armed,
           fired: e.rules.filter(r => r.id === 'no-running')
                         .map(r => (r._firedTurn ? Object.values(r._firedTurn).length : 0))[0] || 0 };
}
"""

# ── 8. The Grand Coatcheck: Garments, and the Snag threshold ─────────────────
COAT = r"""
async ([garment, damage, skipFirst]) => {
  const e = make(['grand-coatcheck'], { hp: 900 });
  await e.startCombat();
  const a = e.enemies[0];
  a.counters.garment = garment;            // 0 rain · 1 evening · 2 mourning
  /* Check Your Things is move one and it CHANGES the Garment, which clears a
     Snag by design ("a fresh Garment is never Snagged"). Reading the flag after
     that move would only ever read false, so line the cycle up on Umbrella
     Sweep — a move that changes nothing about the coat it is wearing. */
  if (skipFirst) a.history.push('check-your-things');
  e.refreshIntents('probe');
  const clutterBefore = clutter(e);
  if (damage) { swing(e, a, damage); swing(e, a, 1); }   // twice, deliberately
  e.refreshIntents('probe');
  const shownAfter = intentOf(a);
  const guardBefore = a.block;
  e.player.block = 0;
  const hp = e.player.hp;
  await e.endTurn();                       // its own turn: Raincoat Guard, then a move
  return { garment, clutterGained: clutter(e) - clutterBefore,
           shownAfter, guardBefore, guardAfterOwnTurn: a.block,
           landed: hp - e.player.hp,
           snagged: a.mem ? !!a.mem.snagged : null };
}
"""

# The Evening Coat's +4 read straight off the intent, with the Raincoat control.
COAT_BONUS = r"""
async ([garment]) => {
  const e = make(['grand-coatcheck'], { hp: 900 });
  await e.startCombat();
  const a = e.enemies[0];
  await e.endTurn();                       // Check Your Things -> garment rotates
  a.counters.garment = garment;
  a.history.length = 1;                    // next move is Umbrella Sweep either way
  e.refreshIntents('probe');
  return { garment, shown: intentOf(a) };
}
"""

# ── 9. The Unwelcome Guest: Familiarity escalates while you commit ────────────
GUEST = r"""
async ([familiarTricks]) => {
  const e = make(['unwelcome-guest'], { hp: 900, energy: 99 });
  const seen = tap(e);
  await e.startCombat();
  const a = e.enemies[0];
  // Teach it a Familiar type: play whatever the hand offers, then close the turn.
  await greedyTurn(e, 3);
  const learnt = [];
  await e.endTurn();
  learnt.push(a.mem ? a.mem.familiar : null);
  // Line the cycle up on Too Familiar and commit `familiarTricks` of that type.
  a.history.length = 1;
  e.refreshIntents('probe');
  const base = intentOf(a);
  const guard0 = a.block;
  const armed = seen.from(a.id);
  let n = 0;
  for (let i = 0; i < familiarTricks; i++) {
    const c = e.piles.hand.find(x => x.type === a.mem.familiar
                                  && e.canPlay(x.uid, (e.firstLivingEnemy() || {}).id).ok);
    if (!c) break;
    await e.playCard(c.uid, (e.firstLivingEnemy() || {}).id ?? null);
    n++;
  }
  e.refreshIntents('probe');
  // Off the damage log: the third Familiar Trick is usually a Guard Trick and
  // the reaction lands on the Guard it just raised.
  return { familiar: learnt[0], base, played: n, after: intentOf(a),
           guardGained: a.block - guard0, reaction: seen.from(a.id) - armed };
}
"""

# ── 10. The House Bell: Resonance is a lever the player can actually pull ─────
RESONANCE = r"""
async ([mode]) => {
  const e = make(mode === 'stranger' ? ['house-bell', 'dust-bunny'] : ['house-bell'],
                 { hp: 1200 });
  await e.startCombat();
  const bell = body(e, 'house-bell');
  const trace = [];
  for (let t = 0; t < 4 && !e.over; t++) {
    e.player.block = 0;
    await e.endTurn();
    trace.push({ move: bell.history[bell.history.length - 1],
                 resonance: bell.counters.resonance });
  }
  const owned = e.enemies.filter(x => x.alive && x.summonedBy === (bell.uid ?? bell.id));
  const stranger = e.enemies.filter(x => x.alive && x !== bell && x.summonedBy == null);
  const before = bell.counters.resonance;
  const victim = mode === 'stranger' ? stranger[0] : owned[0];
  if (victim) e.loseHp(victim, victim.hp + 5, 'test');
  return { trace, before, after: bell.counters.resonance,
           killed: victim ? victim.defId : null,
           owned: owned.length, stranger: stranger.length };
}
"""

# At full Resonance the Toll pre-empts the cycle, and it is visible a turn early.
TOLL = r"""
async () => {
  const e = make(['house-bell'], { hp: 1200 });
  await e.startCombat();
  const bell = e.enemies[0];
  bell.counters.resonance = 4;
  e.refreshIntents('probe');
  const shown = intentOf(bell);
  e.player.block = 0;
  const hp = e.player.hp;
  await e.endTurn();
  return { shown, landed: hp - e.player.hp, after: bell.counters.resonance };
}
"""

# ── 11. Every formation in the region resolves against the real engine ────────
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

        # ══ 1. the Dust Bunny's promise, and the control ════════════════════
        left = await page.evaluate(DUST, [False])
        poked = await page.evaluate(DUST, [True])
        check(left["before"]["move"] == "tumble" and poked["before"]["move"] == "tumble",
              "an ignored Dust Bunny telegraphs Tumble on its second turn",
              json.dumps(left["before"]))
        check(left["before"]["damage"] - poked["after"]["damage"] == 3,
              "poking it for 1 drops the Tumble it is showing by exactly 3",
              f"untouched {left['before']['damage']} -> poked {poked['after']['damage']} "
              f"(Dust {left['dust']})")
        check(poked["before"]["damage"] == poked["after"]["damage"] + 3,
              "CONTROL: the same board, before the poke, still reads the higher number",
              f"{poked['before']['damage']} then {poked['after']['damage']}")
        check(left["before"]["type"] != poked["after"]["type"],
              "and it drops out of the big-attack family when it does",
              f"{left['before']['type']} -> {poked['after']['type']}")
        check(left["landed"] == left["before"]["damage"]
              and poked["landed"] == poked["after"]["damage"],
              "the Tumble that lands is the number that was on screen",
              f"untouched promised {left['before']['damage']} landed {left['landed']}; "
              f"poked promised {poked['after']['damage']} landed {poked['landed']}")

        # ══ 2. the Crawler's disruptable Jab ════════════════════════════════
        held = await page.evaluate(CRAWLER, [False])
        broke = await page.evaluate(CRAWLER, [True])
        check(held["guard"] == 10, "Brace really puts 10 Guard on the board",
              f"{held['guard']} Guard")
        check(held["shown"]["damage"] == 12 and broke["shown"]["damage"] == 7,
              "Umbrella Jab reads 12 behind a standing Brace and 7 with it stripped",
              f"held {held['shown']['damage']}, stripped {broke['shown']['damage']}")
        check(held["landed"] == 12 and broke["landed"] == 7,
              "and both numbers are the ones that actually land",
              f"held {held['landed']}, stripped {broke['landed']}")

        # ══ 3. Clutter reaches a real pile ═════════════════════════════════
        lug = await page.evaluate(LUGGAGE)
        check(lug["before"] == 0 and lug["after"] >= 1 and lug["inDiscard"] >= 1,
              "Pack Wrong puts a real Clutter into the discard pile",
              json.dumps(lug))

        # ══ 4. the Calling Bell only shouts when it is alone ════════════════
        alone = await page.evaluate(BELL, [False])
        escort = await page.evaluate(BELL, [True])
        check(alone["shown"]["move"] == "call-for-service" and alone["summoned"] == 1,
              "alone, the Calling Bell calls, and something arrives",
              f"{alone['shown']} -> {alone['summoned']} summoned at {alone['summonHp']} Courage")
        check(alone["summonHp"] == 15,
              "the summon arrives at the reduced Courage its move promises",
              f"{alone['summonHp']} of 20")
        check(escort["shown"]["move"] == "ring" and escort["summoned"] == 0,
              "CONTROL: with an escort it Rings instead, and summons nothing",
              json.dumps(escort))
        check(escort["roused"] == 1,
              "and the Ring really does reach its ally",
              f"{escort['roused']} ally Roused")

        # ══ 5. no ally is buffed inside a number already shown ══════════════
        led = await page.evaluate(LEDGER)
        check(led["lies"] == 0,
              "five enemy phases with a support enemy on the board took no more "
              "Courage than the intents promised",
              "; ".join(f"t{r['turn']} promised {r['want']} took {r['got']}"
                        for r in led["rows"]))
        check((led["roused"] or 0) >= 1,
              "the Roused it armed really did land on its ally",
              f"{led['roused']} stacks")

        # ══ 6. Momentum has to be earned through a surviving Guard ══════════
        kept = await page.evaluate(RUNNER, [False])
        denied = await page.evaluate(RUNNER, [True])
        check(kept["momentum"] == 2 and denied["momentum"] == 1,
              "breaking Unroll's Guard denies the Momentum it would have banked",
              f"kept {kept['momentum']}, denied {denied['momentum']}")
        check(kept["shown"]["damage"] == 22 and denied["shown"]["damage"] == 15,
              "so Run the Hall reads 22 undisturbed and 15 disrupted",
              f"{kept['shown']['damage']} vs {denied['shown']['damage']}")
        check(kept["landed"] == 22 and denied["landed"] == 15,
              "and each lands the number it showed",
              f"{kept['landed']} / {denied['landed']}")

        # ══ 7. NO RUNNING is a rule, not a sentence ════════════════════════
        three = await page.evaluate(GREETER, [3])
        four = await page.evaluate(GREETER, [4])
        check("no-running" in three["rules"],
              "Mind Your Manners puts a live rule on the board",
              str(three["rules"]))
        check(three["played"] == 3 and three["reprimand"] == 0 and three["fired"] == 0,
              "CONTROL: three Tricks break nothing",
              f"{three['played']} played, {three['reprimand']} taken")
        check(four["played"] == 4 and four["reprimand"] == 6,
              "the fourth Trick is Reprimanded for exactly 6",
              f"{four['played']} played, {four['reprimand']} taken")
        check(four["fired"] == 1,
              "and it Reprimands the seat once a turn, not once per Trick after it",
              f"fired {four['fired']} time(s) across {four['played']} Tricks")

        # ══ 8. the Coatcheck's Garments ════════════════════════════════════
        rain = await page.evaluate(COAT_BONUS, [0])
        evening = await page.evaluate(COAT_BONUS, [1])
        check(rain["shown"]["damage"] == 13 and evening["shown"]["damage"] == 17,
              "the Evening Coat really adds 4 to what it is showing",
              f"raincoat {rain['shown']['damage']}, evening {evening['shown']['damage']}")
        mourn = await page.evaluate(COAT, [2, 5, False])
        check(mourn["clutterGained"] == 1,
              "the Mourning Coat hands out Clutter on the first hit of a turn — and once",
              f"{mourn['clutterGained']} after two separate hits")
        rainguard = await page.evaluate(COAT, [0, 0, True])
        check(rainguard["guardAfterOwnTurn"] >= 10,
              "the Raincoat really raises Guard at the start of its own turn",
              f"{rainguard['guardBefore']} -> {rainguard['guardAfterOwnTurn']}")
        snag = await page.evaluate(COAT, [1, 18, True])
        nosnag = await page.evaluate(COAT, [1, 16, True])
        check(snag["snagged"] is True, "18 damage in one turn Snags the Garment",
              json.dumps(snag["snagged"]))
        check(nosnag["snagged"] is False,
              "CONTROL: 17 does not — the threshold is a real decision",
              f"17 across two hits left snagged={nosnag['snagged']}")
        check(snag["landed"] == 13 and nosnag["landed"] == 17,
              "and a Snagged Evening Coat really stops paying its +4",
              f"snagged {snag['landed']}, intact {nosnag['landed']}")

        # ══ 9. Familiarity ═════════════════════════════════════════════════
        one = await page.evaluate(GUEST, [1])
        two = await page.evaluate(GUEST, [2])
        three_g = await page.evaluate(GUEST, [3])
        check(one["familiar"] in ("attack", "skill", "power"),
              "the Guest learns a Familiar type from the turn that just ended",
              str(one["familiar"]))
        check(two["after"]["damage"] > one["after"]["damage"] > two["base"]["damage"] - 1,
              "Too Familiar's number climbs live as Familiar Tricks are committed",
              f"base {two['base']['damage']}, 1 played {one['after']['damage']}, "
              f"2 played {two['after']['damage']}")
        check(two["guardGained"] >= 6,
              "the second Familiar Trick hands it 6 Guard",
              f"{two['guardGained']} Guard after {two['played']}")
        check(three_g["reaction"] >= 7,
              "and the third is answered with Courage damage",
              f"{three_g['reaction']} taken after {three_g['played']} Tricks")

        # ══ 10. Resonance, and the hook that was dead ══════════════════════
        own = await page.evaluate(RESONANCE, ["own"])
        strange = await page.evaluate(RESONANCE, ["stranger"])
        rings = [t for t in own["trace"] if t["move"] in ("ring-for-service", "second-ring")]
        vibes = [t for t in own["trace"] if t["move"] == "deep-vibration"]
        check(len(rings) >= 2 and own["trace"][-1]["resonance"] == len(rings),
              "Resonance climbs on the two Ring moves and on nothing else",
              "; ".join(f"{t['move']}={t['resonance']}" for t in own["trace"]))
        check(len(vibes) >= 1,
              "CONTROL: Deep Vibration ran and added none",
              f"{len(vibes)} Deep Vibrations, resonance still {own['trace'][-1]['resonance']}")
        check(own["killed"] is not None and own["after"] == own["before"] - 1,
              "killing one of the Bell's OWN summons drops Resonance by 1",
              f"killed {own['killed']}: {own['before']} -> {own['after']}")
        check(strange["killed"] is not None and strange["after"] == strange["before"],
              "CONTROL: killing a body it did not summon changes nothing",
              f"killed {strange['killed']}: {strange['before']} -> {strange['after']}")
        toll = await page.evaluate(TOLL)
        check(toll["shown"]["move"] == "midnight-toll" and toll["shown"]["damage"] == 20,
              "at full Resonance MIDNIGHT TOLL pre-empts the cycle and is shown first",
              json.dumps(toll["shown"]))
        check(toll["landed"] == 20 and toll["after"] == 0,
              "and it lands the 20 it promised, then resets the meter",
              f"landed {toll['landed']}, resonance {toll['after']}")

        # ══ 11. every formation in the region actually resolves ════════════
        s2 = await page.evaluate(
            "() => window.__F.enc.ENCOUNTER_LIST.filter(x => x.region === 'foyer').map(x => x.id)")
        total_lies, worst = 0, []
        for enc_id in s2:
            hp = 900 if enc_id.endswith(("scare-coatcheck", "scare-guest", "scare-bell", "boss")) else 400
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
              "; ".join(worst[:3]) or f"{len(s2)} formations audited")

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
