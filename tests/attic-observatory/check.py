"""The Moonlit Attic and Observatory, driven against the REAL CombatEngine.

    python tests/attic-observatory/check.py [--verbose]

The region's rule is §2's: "the region should never rely on hidden coin flips
disguised as prediction." Every forecast below is checked with a CONTROL that
runs the same board without the thing:

  * a Webbed Trick really costs one more Nerve, once, and an unmarked one does
    not;
  * the Rafter Peeker really flinches — damage it and its intent becomes
    Scramble Away, leave it alone and it Drops Down;
  * the Star Chart really marks an ALLY, and killing the Chart really takes the
    omen with it;
  * the Telescope Eye really pays out for the behaviour it announced, and pays
    the small number when the player does something else;
  * the Moon Moth is really 20% more fragile at Full Moon and not at New Moon;
  * the Orrery Imp really REORDERS an ally's forecast, and really cannot touch
    the action that ally is about to take;
  * the Great Orrery's cycle really moves at 20 damage in a turn, and not at 19;
  * the Rafter Seer's Favoured future really turns one way for an Attack and the
    other for a Skill;
  * the Moon Lens really swaps its next Focus on the THIRD Trick and not the
    fourth;
  * the Watcher's Tug really swaps two FUTURE actions and really never moves the
    one it is about to do.

`tests/enemies/run.py` can see none of it: its context is mocked, and until this
region its actors had no plan at all — so an enemy that rearranged a neighbour's
forecast rearranged an empty array and passed.

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
window.playType = async function (e, type) {
  const t = (e.firstLivingEnemy() || {}).id ?? null;
  const c = e.piles.hand.find(x => x.type === type && e.canPlay(x.uid, t).ok);
  if (!c) return null;
  await e.playCard(c.uid, t);
  return c;
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
  const AO = enc.ENCOUNTER_LIST.filter(x => x.region === 'attic-observatory');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'attic-observatory');
  const placed = new Set(AO.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: AO.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: AO.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: AO.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['webbed', 'auspicious'].filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
  };
}
"""

# ── a Webbed Trick costs one more Nerve, once ──────────────────────────────
WEBBED = r"""
async ([mark]) => {
  const e = make(['cobweb-bundle'], { seed: 21, hp: 400, energy: 99 });
  await e.startCombat();
  const card = e.piles.hand[0];
  const base = e.costOf(card);
  if (mark) {
    (e.player._webbed ||= new Set()).add(card.uid);
    e.applyStatus(e.player, 'webbed', 1);
  }
  const marked = e.costOf(card);
  await e.playCard(card.uid, (e.firstLivingEnemy() || {}).id ?? null);
  return { mark, base, marked, left: e.player._webbed ? e.player._webbed.size : 0 };
}
"""

# ── the Rafter Peeker flinches ─────────────────────────────────────────────
FLINCH = r"""
async ([hit]) => {
  const e = make(['rafter-peeker'], { seed: 31, hp: 400, energy: 99 });
  await e.startCombat();
  const p = e.enemies[0];
  if (hit) {
    p.block = 0;
    e.dealDamage({ attacker: e.player, defender: p, amount: 3, kind: 'attack',
                   card: { type: 'attack', id: 't', uid: 't' } });
  }
  e.refreshIntents('test');
  const before = e.player.hp;
  const guardBefore = p.block;
  const intent = p.intent ? { dmg: p.intent.damage, block: p.intent.block } : null;
  await e.endTurn();
  return { hit, intent, dealt: before - e.player.hp, guardGained: p.block - guardBefore };
}
"""

# ── the Star Chart marks an ally, and dies with its omen ───────────────────
AUSPICIOUS = r"""
async ([killChart]) => {
  const e = make(['star-chart', 'moon-moth'], { seed: 37, hp: 600, energy: 99 });
  await e.startCombat();
  const chart = e.enemies.find(x => x.defId === 'star-chart');
  const moth = e.enemies.find(x => x.defId === 'moon-moth');
  await e.endTurn();                      // Read the Stars
  const marked = moth.status ? moth.status('auspicious') : 0;
  if (killChart) e.loseHp(chart, chart.hp + 5, 'test');
  const after = moth.status ? moth.status('auspicious') : 0;
  return { killChart, marked, after, chartAlive: chart.alive };
}
"""

# ── the Telescope Eye pays out for what it announced ───────────────────────
OBSERVE = r"""
async ([attacks]) => {
  const e = make(['telescope-eye'], { seed: 41, hp: 600, energy: 99 });
  await e.startCombat();
  const eye = e.enemies[0];
  const watching = eye.mem.watch;
  for (let i = 0; i < attacks; i++) if (!await playType(e, 'attack')) break;
  await e.endTurn();                      // observation banked
  const before = e.player.hp;
  const intent = eye.intent ? eye.intent.damage : null;
  await e.endTurn();                      // and paid out
  return { attacks, watching, intent, dealt: before - e.player.hp, hit: eye.mem.hit };
}
"""

# ── the Moon Moth is fragile at Full Moon and not at New Moon ──────────────
PHASE = r"""
async ([phase]) => {
  const e = make(['moon-moth'], { seed: 43, hp: 600, energy: 99 });
  await e.startCombat();
  const moth = e.enemies[0];
  moth.counters.phase = phase;
  moth.block = 0;
  const hpBefore = moth.hp;
  e.dealDamage({ attacker: e.player, defender: moth, amount: 10, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  e.refreshIntents('test');
  return { phase, took: hpBefore - moth.hp, next: moth.pendingMove ? moth.pendingMove.id : null };
}
"""

# ── the Orrery Imp really reorders an ally's forecast ──────────────────────
ROTATE = r"""
async ([withAlly]) => {
  const ids = withAlly ? ['orrery-imp', 'moon-moth'] : ['orrery-imp'];
  const e = make(ids, { seed: 47, hp: 600, energy: 99 });
  await e.startCombat();
  const imp = e.enemies[0];
  const ally = e.enemies[1] || null;
  const before = ally ? (ally.plan || []).slice(0, 4) : [];
  const move = imp.pendingMove ? imp.pendingMove.id : null;
  await e.endTurn();
  const after = ally ? (ally.plan || []).slice(0, 4) : [];
  return { withAlly, move, before, after,
           slot0Same: ally ? before[0] === after[0] : null,
           changed: JSON.stringify(before) !== JSON.stringify(after) };
}
"""

# ── the Great Orrery's cycle moves at 20 damage, not 19 ────────────────────
NUDGE = r"""
async ([damage]) => {
  const e = make(['great-orrery'], { seed: 53, hp: 900, energy: 99 });
  await e.startCombat();
  const o = e.enemies[0];
  const before = o.counters.sky || 0;
  o.block = 0;
  e.dealDamage({ attacker: e.player, defender: o, amount: damage, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  await e.endTurn();
  // One enemy turn always advances the cycle by 1; a Nudge is one MORE step.
  return { damage, before, after: o.counters.sky || 0, steps: (o.counters.sky || 0) - before };
}
"""

# ── the Rafter Seer's Favoured future turns with the first Trick ───────────
FUTURES = r"""
async ([type]) => {
  /* Seed-hunting, not seed-guessing: the starting deck is mostly Skills and at
     seed 59 the opening hand held no Attack at all, so the Attack arm of this
     probe was measuring "nothing was played" and reporting it as "the omen did
     not turn". Find a seed whose opening hand can actually play both types. */
  let e = null, s = null, seed = 59;
  for (; seed < 120; seed++) {
    e = make(['rafter-seer'], { seed, hp: 900, energy: 99 });
    await e.startCombat();
    const t = (e.firstLivingEnemy() || {}).id ?? null;
    const hasA = e.piles.hand.some(x => x.type === 'attack' && e.canPlay(x.uid, t).ok);
    const hasS = e.piles.hand.some(x => x.type === 'skill' && e.canPlay(x.uid, t).ok);
    if (hasA && hasS) break;
  }
  s = e.enemies[0];
  s.mem.favoured = 'claw';
  const before = s.mem.favoured;
  const played = type ? await playType(e, type) : null;
  if (type && !played) return { type, seed, played: false, before, after: null };
  e.refreshIntents('test');
  const shown = s.intent ? { dmg: s.intent.damage, block: s.intent.block } : null;
  await e.endTurn();
  return { type, seed, played: !!played, before, after: s.mem.favoured, shown };
}
"""

# ── the Moon Lens swaps its next Focus on the THIRD Trick ──────────────────
FOCUS = r"""
async ([tricks]) => {
  const e = make(['moon-lens'], { seed: 61, hp: 900, energy: 99 });
  await e.startCombat();
  const lens = e.enemies[0];
  lens.mem.next = 'self';
  const before = lens.mem.next;
  const played = await playAny(e, tricks);
  return { tricks, played, before, after: lens.mem.next, swapped: lens.mem.swapped };
}
"""

# ── the Watcher's Tug moves the FUTURE and never the present ───────────────
TUG = r"""
async ([tricks]) => {
  const e = make(['the-watcher'], { seed: 67, hp: 1200, energy: 99 });
  await e.startCombat();
  const w = e.enemies[0];
  const before = (w.plan || []).slice(0, 4);
  const played = await playAny(e, tricks);
  const after = (w.plan || []).slice(0, 4);
  return { tricks, played, before, after,
           slot0Same: before[0] === after[0],
           futureChanged: JSON.stringify(before.slice(1)) !== JSON.stringify(after.slice(1)),
           revealed: w.previewDepth };
}
"""

# ── Grounded really denies Guard, and the intent says so first ─────────────
GROUNDED = r"""
async ([pin]) => {
  const e = make(['the-watcher'], { seed: 67, hp: 2000, energy: 99 });
  await e.startCombat();
  const w = e.enemies[0];
  let maxBlock = 0, sawGuardMove = false, maxIntentBlock = 0;
  for (let t = 0; t < 10 && !e.over; t++) {
    /* Pin the state under test on BOTH sides of the enemy phase: Grounded is
       normally set by the Watcher's own Great Descent and cleared at its next
       turn end, and this holds it open so the same board can be run with and
       without it. */
    (w.mem ||= {}).grounded = pin;
    /* The RAIL, read from the actor the way the screen reads it. `buildIntent`
       prefers `blockFn` over the static `block` (combat/intents.js), so a gate
       that only checked the granted Guard would pass while the intent still
       promised 13.
       REFRESH FIRST, and this is the real sequence rather than a convenience:
       Grounded is set during the Watcher's OWN turn, and the intent the player
       reads is the one rebuilt at the next player-turn start. Reading without
       the refresh reads the rail from BEFORE the flag was set - which is what
       the first draft of this check did, and it reported a stale 6. */
    e.refreshIntents('turnStart');
    maxIntentBlock = Math.max(maxIntentBlock, (w.intent && w.intent.block) || 0);
    await e.endTurn();
    (w.mem ||= {}).grounded = pin;
    const did = (w.history || [])[(w.history || []).length - 1];
    if (did === 'skitter-above' || did === 'readjust') {
      sawGuardMove = true;
      maxBlock = Math.max(maxBlock, w.block || 0);
    }
  }
  return { pin, maxBlock, sawGuardMove, maxIntentBlock,
           history: (w.history || []).slice(0, 10) };
}
"""

HAND_PAIRING = r"""
async () => {
  const { en } = window.__Y;
  const offenders = [], users = [], direct = [];
  for (const def of en.ENEMY_LIST) {
    let queues = false;
    for (const key of Object.keys(def.moves || {})) {
      const m = def.moves[key];
      for (const fn of [m.effect, m.onUse]) {
        if (typeof fn === 'function' && /whenHandArrives/.test(fn.toString())) queues = true;
      }
    }
    for (const hook of ['onPlayerTurnEnd', 'onSpawn', 'onTurnStart', 'onTurnEnd', 'onCardPlayed']) {
      const fn = def[hook];
      if (typeof fn === 'function' && /whenHandArrives/.test(fn.toString())) queues = true;
    }
    if (queues) {
      users.push(def.id);
      const ready = def.onPlayerReady;
      if (typeof ready !== 'function' || !/runHandOps/.test(ready.toString())) offenders.push(def.id);
    }
    for (const key of Object.keys(def.moves || {})) {
      const fn = def.moves[key].effect;
      if (typeof fn !== 'function') continue;
      const s = fn.toString();
      if (/cardsIn\(\s*['"]hand['"]\s*\)/.test(s) && !/whenHandArrives/.test(s)) {
        direct.push(`${def.id}.${key}`);
      }
    }
  }
  return { users, offenders, direct };
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
        check(not s["leaked"], "the Moon Echo is never placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("attic-observatory" in s["implemented"], "registered as implemented",
              str(s["implemented"]))
        check(s["ladder"].index("attic-observatory") < s["ladder"].index("heart"),
              "the ladder walks the Attic before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 2, "both region statuses are registered",
              ", ".join(s["statuses"]))

        # ══ Webbed ══════════════════════════════════════════════════════════
        plain = await page.evaluate(WEBBED, [False])
        silk = await page.evaluate(WEBBED, [True])
        check(silk["marked"] == silk["base"] + 1,
              "a Webbed Trick really costs 1 more Nerve", f"{silk['base']} -> {silk['marked']}")
        check(plain["marked"] == plain["base"],
              "CONTROL: an unmarked Trick costs what it prints", json.dumps(plain))
        check(silk["left"] == 0, "and the silk comes off when it is played", json.dumps(silk))

        # ══ the Rafter Peeker ═══════════════════════════════════════════════
        calm = await page.evaluate(FLINCH, [False])
        hit = await page.evaluate(FLINCH, [True])
        check(calm["dealt"] >= 9, "left alone, the Peeker Drops Down for 9", json.dumps(calm))
        check(hit["guardGained"] >= 9 and hit["dealt"] <= 5,
              "CONTROL: damage it and the intent becomes Scramble Away — Guard and a small hit",
              json.dumps(hit))

        # ══ the Star Chart ══════════════════════════════════════════════════
        lit = await page.evaluate(AUSPICIOUS, [False])
        dead = await page.evaluate(AUSPICIOUS, [True])
        check(lit["marked"] >= 1, "Read the Stars really marks an ALLY", json.dumps(lit))
        check(dead["chartAlive"] is False and dead["after"] == 0,
              "CONTROL: kill the Chart and the omen goes with it (§4)", json.dumps(dead))

        # ══ the Telescope Eye ═══════════════════════════════════════════════
        many = await page.evaluate(OBSERVE, [3])
        few = await page.evaluate(OBSERVE, [0])
        check(many["dealt"] > few["dealt"],
              "the Eye pays the big number for the behaviour it announced",
              f"3 Attacks -> {many['dealt']}, none -> {few['dealt']}")
        check(few["dealt"] >= 1,
              "CONTROL: do something else and it still acts, for less", json.dumps(few))

        # ══ the Moon Moth ═══════════════════════════════════════════════════
        full = await page.evaluate(PHASE, [2])
        new = await page.evaluate(PHASE, [0])
        check(full["took"] > new["took"],
              "Full Moon really takes 20% more damage than New Moon",
              f"Full {full['took']} vs New {new['took']}")
        check(full["next"] == "moonflash",
              "and Moonflash is the Full Moon move", json.dumps(full))
        check(new["next"] != "moonflash",
              "CONTROL: it is not available at New Moon", json.dumps(new))

        # ══ the Orrery Imp ══════════════════════════════════════════════════
        pair = await page.evaluate(ROTATE, [True])
        alone = await page.evaluate(ROTATE, [False])
        check(pair["changed"] is True,
              "the Imp really REORDERS an ally's forecast", json.dumps(pair)[:190])
        check(pair["slot0Same"] is True,
              "and never touches what that ally is about to do (§8)", json.dumps(pair)[:190])
        check(alone["move"] in ("brass-kick", "wind-the-mechanism"),
              "CONTROL: with nobody to reschedule it just kicks", json.dumps(alone)[:140])

        # ══ the Great Orrery ════════════════════════════════════════════════
        big = await page.evaluate(NUDGE, [20])
        small = await page.evaluate(NUDGE, [19])
        check(small["steps"] == 1,
              "CONTROL: 19 damage and the cycle only takes its ordinary step",
              json.dumps(small))
        check(big["steps"] != small["steps"],
              "20 damage in one turn really moves the heavens (§13)",
              f"19 -> {small['steps']} step, 20 -> {big['steps']}")

        # ══ the Rafter Seer ═════════════════════════════════════════════════
        atk = await page.evaluate(FUTURES, ["attack"])
        skl = await page.evaluate(FUTURES, ["skill"])
        none = await page.evaluate(FUTURES, [None])
        check(atk["after"] != none["after"] and skl["after"] != none["after"],
              "the first Trick really turns the Favoured future",
              f"none -> {none['after']}, attack -> {atk['after']}, skill -> {skl['after']}")
        check(atk["after"] != skl["after"],
              "CONTROL: an Attack and a Skill turn it OPPOSITE ways (§14)",
              f"attack -> {atk['after']}, skill -> {skl['after']}")

        # ══ the Moon Lens ═══════════════════════════════════════════════════
        three = await page.evaluate(FOCUS, [3])
        two = await page.evaluate(FOCUS, [2])
        four = await page.evaluate(FOCUS, [4])
        check(three["played"] == 3 and three["after"] != three["before"],
              "the THIRD Trick swaps the Lens's next Focus", json.dumps(three))
        check(two["after"] == two["before"],
              "CONTROL: two Tricks do not", json.dumps(two))
        check(four["after"] != four["before"],
              "CONTROL: a fourth Trick does not swap it back — once per turn",
              json.dumps(four))

        # ══ the Watcher ═════════════════════════════════════════════════════
        tug3 = await page.evaluate(TUG, [3])
        tug1 = await page.evaluate(TUG, [1])
        check(tug3["revealed"] >= 3, "the Future Line is revealed three deep (§17)",
              f"previewDepth {tug3['revealed']}")
        check(tug3["futureChanged"] is True,
              "the third Trick really earns a Tug and it swaps two FUTURE actions",
              json.dumps(tug3)[:200])
        check(tug3["slot0Same"] is True,
              "and the action it is about to take never moves (§20)", json.dumps(tug3)[:200])
        check(tug1["futureChanged"] is False,
              "CONTROL: one Trick earns nothing", json.dumps(tug1)[:200])

        # ══ Grounded denies Guard, which it printed and did not do ══════════
        gnd = await page.evaluate(GROUNDED, [True])
        ung = await page.evaluate(GROUNDED, [False])
        check(ung["sawGuardMove"] is True and gnd["sawGuardMove"] is True,
              "both runs reach a Guard move, so the pair compares the same thing",
              f"grounded {gnd['history']} / control {ung['history']}")
        check(ung["maxBlock"] > 0,
              "CONTROL: not Grounded, Skitter Above and Readjust really raise Guard",
              f"maxBlock {ung['maxBlock']}")
        check(gnd["maxBlock"] == 0,
              "Grounded really denies Guard - the rule the fight PRINTS "
              "(\"cannot gain Guard until it climbs back\") and did not enforce",
              f"maxBlock {gnd['maxBlock']} (control {ung['maxBlock']})")
        check(ung["maxIntentBlock"] > 0,
              "CONTROL: not Grounded, the rail really does promise Guard",
              f"maxIntentBlock {ung['maxIntentBlock']}")
        check(gnd["maxIntentBlock"] == 0,
              "and while Grounded the INTENT promises none either, so the rail "
              "never advertises Guard the move will not grant",
              f"maxIntentBlock {gnd['maxIntentBlock']} "
              f"(control {ung['maxIntentBlock']})")

        # ══ the hand gate ═══════════════════════════════════════════════════
        pairing = await page.evaluate(HAND_PAIRING)
        check(not pairing["offenders"],
              "every def that queues hand work declares onPlayerReady/runHandOps",
              ", ".join(pairing["offenders"]) or f"{len(pairing['users'])} defs queue, all paired")
        check(not pairing["direct"],
              "no move effect reads the hand directly",
              ", ".join(pairing["direct"]) or "none")

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("ao-14", 2, 40, 800, "Scuffle 14 resolves a whole fight"),
            ("ao-scare-orrery", 3, 40, 800, "the Great Orrery resolves a whole fight"),
            ("ao-scare-seer", 4, 40, 800, "the Rafter Seer resolves a whole fight"),
            ("ao-scare-lens", 5, 40, 800, "the Moon Lens resolves a whole fight"),
            ("ao-boss", 6, 60, 900, "the Watcher resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")
            check(r["maxRules"] <= 4,
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
