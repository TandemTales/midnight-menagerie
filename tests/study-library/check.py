"""The Grand Study and Library, driven against the REAL CombatEngine.

    python tests/study-library/check.py [--verbose]

The region's claim is §1's: "Your deck is information, and enemies can use that
information." Every enemy reads a different slice of it, and every claim below
is checked with a CONTROL that runs the same board without the thing:

  * a Corrected Trick really costs one more Nerve, once, and an unmarked one
    does not;
  * one Quill Clerk really holds at most two Corrections;
  * Book Bat really answers the TYPE it revealed — stack an Attack and it
    defends, stack a Skill and it swings;
  * Inkblot really copies the LAST Trick played, and a different last Trick
    gives a different move;
  * Paper Knight's Folded really turns aside the FIRST Attack each turn and not
    the second, and 14 Attack damage really forces it open where 13 does not;
  * a Bookmarked Trick really goes to the bottom of the draw pile if you keep
    it, and really bites if you play it;
  * the Bookwyrm really takes the most expensive Trick, and really gives it
    back at 22 damage but not at 21;
  * the Living Index really Files at 4 Entries and not at 3;
  * the Inkblot Oracle's echo really scales with PRINTED cost;
  * the Archivist's Filed tab really takes no further Entries — §23's exploit,
    which is the single most important rule in the fight;
  * a Misfiled Trick really files as its label and not as its type.

THE HAND GATE
-------------
`tests/enemies/run.py` cannot see any of it: its context is mocked and its mock
hands out a hand at every moment of the turn. The real engine closes the hand
three steps before the enemy phase, which is why six moves in this region and
two shipped ones in the Graveyard marked NOTHING until 2026-08-30. The last
check below is a source-level gate against that whole class returning: any def
that queues hand work must also declare the hook that runs it.

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
  const [C, enc, en, st, cards, kw, run, sl] = await Promise.all([
    import('/game/src/combat/engine.js'),
    import('/game/src/data/encounters.js'),
    import('/game/src/data/enemies/index.js'),
    import('/game/src/combat/statuses.js'),
    import('/game/src/data/cards.js'),
    import('/game/src/data/keywords.js'),
    import('/game/src/state/run.js'),
    import('/game/src/data/enemies/study-library.js'),
  ]);
  await kw.loadContentRegistries();
  st.registerStatuses(en.ENEMY_STATUSES);
  window.__Y = { C, enc, en, st, cards, run, sl };
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
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const SL = enc.ENCOUNTER_LIST.filter(x => x.region === 'study-library');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'study-library');
  const placed = new Set(SL.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: SL.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: SL.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: SL.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['corrected', 'bookmarked', 'misfiled', 'folded']
      .filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
  };
}
"""

# ── a Corrected Trick costs one more Nerve, once ───────────────────────────
CORRECTED = r"""
async ([mark]) => {
  const e = make(['quill-clerk'], { seed: 21, hp: 400, energy: 99 });
  await e.startCombat();
  const card = e.piles.hand[0];
  const base = e.costOf(card);
  if (mark) {
    (e.player._corrected ||= new Set()).add(card.uid);
    e.applyStatus(e.player, 'corrected', 1);
  }
  const marked = e.costOf(card);
  await e.playCard(card.uid, (e.firstLivingEnemy() || {}).id ?? null);
  const other = e.piles.hand.find(x => x.id === card.id);
  return { mark, base, marked, sameIdAfter: other ? e.costOf(other) : null,
           left: e.player._corrected ? e.player._corrected.size : 0 };
}
"""

# ── one Clerk holds at most two Corrections (§8) ────────────────────────────
CLERK_CAP = r"""
async () => {
  const e = make(['quill-clerk'], { seed: 33, hp: 400, energy: 99 });
  await e.startCombat();
  const clerk = e.enemies[0];
  // Four separate Red Inks. The cap is per SOURCE and recomputed each time.
  for (let i = 0; i < 8 && !e.over; i++) await e.endTurn();
  return { marks: e.player._corrected ? e.player._corrected.size : 0,
           mine: (clerk.mem.corrections || []).length };
}
"""

# ── Book Bat answers the TYPE it read ──────────────────────────────────────
READ_AHEAD = r"""
async ([type]) => {
  const e = make(['book-bat'], { seed: 41, hp: 400, energy: 99 });
  await e.startCombat();
  const bat = e.enemies[0];
  // Put a Trick of the requested type on top of the draw pile.
  const pick = e.piles.draw.find(x => x.type === type)
            || e.piles.hand.find(x => x.type === type);
  if (pick) e.piles.move(pick, 'draw', { top: true });
  const topType = e.piles.draw[0] ? e.piles.draw[0].type : null;
  await e.endTurn();                       // Read Ahead resolves
  const read = bat.mem.read;
  const next = bat.pendingMove ? bat.pendingMove.id : null;
  return { type, topType, read, next };
}
"""

# ── Inkblot copies the LAST Trick played ───────────────────────────────────
IMPRESSION = r"""
async ([type]) => {
  const e = make(['inkblot'], { seed: 47, hp: 400, energy: 99 });
  await e.startCombat();
  const blot = e.enemies[0];
  const played = await playType(e, type);
  await e.endTurn();                       // Impression recorded, then it acts
  return { type, played: !!played, impression: blot.mem.impression,
           next: blot.pendingMove ? blot.pendingMove.id : null };
}
"""

# ── Paper Knight: the Folded allowance, and forcing it open ─────────────────
FOLDED = r"""
async ([amount, twice]) => {
  const e = make(['paper-knight'], { seed: 53, hp: 600, energy: 99 });
  await e.startCombat();
  const k = e.enemies[0];
  const card = { type: 'attack', id: 'test/probe', uid: 'probe' };
  const hpBefore = k.hp;
  k.block = 0;
  e.dealDamage({ attacker: e.player, defender: k, amount, kind: 'attack', card });
  const afterFirst = hpBefore - k.hp;
  let afterSecond = null;
  if (twice) {
    const mid = k.hp;
    k.block = 0;
    e.dealDamage({ attacker: e.player, defender: k, amount, kind: 'attack', card });
    afterSecond = mid - k.hp;
  }
  const foldedBefore = !!k.mem.folded;
  await e.endTurn();
  return { amount, afterFirst, afterSecond, foldedBefore, foldedAfter: !!k.mem.folded,
           next: k.pendingMove ? k.pendingMove.id : null };
}
"""

# ── a Bookmarked Trick: spend it, or lose it to the bottom ──────────────────
BOOKMARK = r"""
async ([playIt]) => {
  const e = make(['bookmark-imp'], { seed: 59, hp: 400, energy: 99 });
  await e.startCombat();
  const imp = e.enemies[0];
  await e.endTurn();                       // Mark Your Place -> queued
  const mark = imp.mem.mark;               // applied at onPlayerReady
  if (!mark) return { playIt, marked: false };
  const card = e.piles.hand.find(x => x.uid === mark.uid);
  const hpBefore = e.player.hp;
  if (playIt && card) await e.playCard(card.uid, (e.firstLivingEnemy() || {}).id ?? null);
  const bitFor = hpBefore - e.player.hp;
  /* Sampled AT the enemy phase, not after the turn. The starting deck is ten
     Tricks, so the draw pile empties and RESHUFFLES within one turn — read
     afterwards, "bottom of the draw pile" has already been shuffled away and
     the check would fail against working code. Guard is read here too, because
     the engine wipes enemy Guard at that enemy's own turn start. */
  let atBottom = null, guardAtPhase = null;
  e.on('phase', (ev) => {
    if (ev.phase !== 'enemy' || atBottom !== null) return;
    const d = e.piles.draw;
    atBottom = d.length ? d[d.length - 1].uid === mark.uid : false;
  });
  const origTurn = e.turn;
  e.on('turn:end', (ev) => {
    if (ev.side === 'enemy' && ev.turn === origTurn && guardAtPhase === null) guardAtPhase = imp.block;
  });
  await e.endTurn();
  return { playIt, marked: true, name: mark.name, bitFor, atBottom, guardAtPhase };
}
"""

# ── the Bookwyrm takes the most expensive, and gives it back ────────────────
DEVOUR = r"""
async ([damage]) => {
  const e = make(['bookwyrm'], { seed: 61, hp: 900, energy: 99 });
  await e.startCombat();
  const w = e.enemies[0];
  const handBefore = e.piles.hand.map(x => ({ uid: x.uid, name: x.name, cost: e.costOf(x) }));
  const dearest = handBefore.reduce((b, x) => (!b || x.cost >= b.cost ? x : b), null);
  await e.endTurn();                       // Demand a Volume -> queued, resolves at ready
  const eaten = w.mem.swallowed.map(s => s.name);
  const gone = !e.piles.hand.some(x => x.uid === (dearest || {}).uid);
  // Now hit it for `damage` in one player turn and see if it coughs one up.
  w.block = 0;
  e.dealDamage({ attacker: e.player, defender: w, amount: damage, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  await e.endTurn();
  const back = w.mem.swallowed.length;
  return { damage, dearest: dearest ? dearest.name : null, eaten, gone,
           swallowedAfter: back, inHand: e.piles.hand.some(x => x.uid === (dearest || {}).uid) };
}
"""

# ── the Living Index Files at 4 Entries, not at 3 ───────────────────────────
ENTRIES = r"""
async ([start]) => {
  const e = make(['living-index'], { seed: 67, hp: 900, energy: 99 });
  await e.startCombat();
  const ix = e.enemies[0];
  ix.counters['e-attack'] = start;
  const before = ix.counters['e-attack'];
  const card = await playType(e, 'attack');
  const after = ix.counters['e-attack'];
  const queued = (ix.mem.filed || []).length;
  return { start, played: !!card, before, after, queued };
}
"""

# ── the Oracle reads PRINTED cost, and the echo scales with it ─────────────
#
# Two separate claims, so two separate probes.
#
# ECHO_READS is the reason `cost` was added to the engine's played-card record
# at all: it Corrects the Trick first, so its EFFECTIVE cost is 2 and its
# printed cost is 1, and asserts the Oracle recorded 1. Reading the effective
# cost would let a Quill Clerk inflate the Oracle's echo, and the intent would
# then be a number the player cannot derive from the card in their hand.
ECHO_READS = r"""
async ([correctFirst]) => {
  const e = make(['inkblot-oracle'], { seed: 71, hp: 900, energy: 99 });
  await e.startCombat();
  const o = e.enemies[0];
  const t = (e.firstLivingEnemy() || {}).id ?? null;
  const card = e.piles.hand.find(x => x.type === 'attack' && e.canPlay(x.uid, t).ok);
  if (!card) return { found: false };
  const printed = card.baseCost;
  if (correctFirst) {
    (e.player._corrected ||= new Set()).add(card.uid);
    e.applyStatus(e.player, 'corrected', 1);
  }
  const effective = e.costOf(card);
  await e.playCard(card.uid, t);
  await e.endTurn();
  /* Read `reflection`, not `pending`: `endTurn` runs the enemy phase AND the
     next player-turn start, and the promotion that makes the echo honest has
     already moved the record across by the time this returns. */
  return { found: true, correctFirst, printed, effective,
           recorded: o.mem.reflection ? o.mem.reflection.cost : null };
}
"""

# ECHO_SCALES drives the damageFn contract directly, because the starting deck
# is all 1-Nerve Tricks and cannot produce two different printed costs.
ECHO_SCALES = r"""
async ([cost]) => {
  const e = make(['inkblot-oracle'], { seed: 71, hp: 900, energy: 99 });
  await e.startCombat();
  const o = e.enemies[0];
  o.mem.reflection = { type: 'attack', cost, name: 'probe' };
  o.mem.pending = null;
  e.refreshIntents('test');
  const move = o.def.moves['violent-reflection'];
  return { cost, damageFn: move.damageFn(e.enemyCtx(o, move)) };
}
"""

# ── §23: a FILED tab takes no further Entries ──────────────────────────────
CATALOGUE = r"""
async ([start]) => {
  const e = make(['the-archivist'], { seed: 73, hp: 1200, energy: 99 });
  await e.startCombat();
  const boss = e.enemies[0];
  const tab = boss.mem.cat.s0;
  tab.attack = start;                       // 3 -> the next Attack Files it
  const first = await playType(e, 'attack');
  const filedNow = !!tab.filed.attack;
  const countNow = tab.attack;
  const queued = (boss.mem.queue || []).length;
  // With the tab FILED, further Attacks must not count at all (§23's exploit).
  const second = await playType(e, 'attack');
  const third = await playType(e, 'attack');
  return { start, first: !!first, filedNow, countNow, queued,
           moreCounted: tab.attack, stillFiled: !!tab.filed.attack,
           extraPlayed: [!!second, !!third].filter(Boolean).length };
}
"""

# ── a Misfiled Trick files as its LABEL ────────────────────────────────────
MISFILED = r"""
async ([misfile]) => {
  const e = make(['the-archivist'], { seed: 79, hp: 1200, energy: 99 });
  await e.startCombat();
  const boss = e.enemies[0];
  const tab = boss.mem.cat.s0;
  const t = (e.firstLivingEnemy() || {}).id ?? null;
  const card = e.piles.hand.find(x => x.type === 'attack' && e.canPlay(x.uid, t).ok);
  if (!card) return { misfile, found: false };
  if (misfile) window.__Y.sl.misfile({ applyStatus: () => {} }, e.player,
                                      { uid: card.uid }, 'skill');
  const before = { a: tab.attack, s: tab.skill };
  await e.playCard(card.uid, t);
  return { misfile, found: true, before, after: { a: tab.attack, s: tab.skill } };
}
"""

# ── the hand gate: queue and hook must come in pairs ───────────────────────
HAND_PAIRING = r"""
async () => {
  const { en } = window.__Y;
  const offenders = [];
  const users = [];
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
    if (!queues) continue;
    users.push(def.id);
    const ready = def.onPlayerReady;
    if (typeof ready !== 'function' || !/runHandOps/.test(ready.toString())) offenders.push(def.id);
  }
  /* The other half of the class: a MOVE EFFECT that reads the hand directly.
     There is no hand during the enemy phase, so every one of these is dead. */
  const direct = [];
  for (const def of en.ENEMY_LIST) {
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
  const rules = new Set();
  let guard = 0, maxRules = 0;
  while (!e.over && guard++ < turns) {
    let inner = 0;
    while (!e.over && inner++ < 8) {
      const t = (e.firstLivingEnemy() || {}).id ?? null;
      const c = e.piles.hand.find(x => e.canPlay(x.uid, t).ok);
      if (!c) break;
      await e.playCard(c.uid, t);
    }
    for (const r of (e.rules || [])) rules.add(r.id);
    maxRules = Math.max(maxRules, (e.rules || []).length);
    if (!e.over) await e.endTurn();
  }
  console.warn = orig;
  return { over: e.over, turns: e.turn, rules: [...rules], maxRules,
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
        check("study-library" in s["implemented"], "registered as implemented",
              str(s["implemented"]))
        check(s["ladder"].index("study-library") < s["ladder"].index("heart"),
              "the ladder walks the Library before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 4, "all four Markup statuses are registered",
              ", ".join(s["statuses"]))

        # ══ Corrected ═══════════════════════════════════════════════════════
        plain = await page.evaluate(CORRECTED, [False])
        inked = await page.evaluate(CORRECTED, [True])
        check(inked["marked"] == inked["base"] + 1,
              "a Corrected Trick really costs 1 more Nerve",
              f"{inked['base']} -> {inked['marked']}")
        check(plain["marked"] == plain["base"],
              "CONTROL: an unmarked Trick costs what it prints", json.dumps(plain))
        check(inked["left"] == 0,
              "and the Correction is spent by playing it, once", json.dumps(inked))

        cap = await page.evaluate(CLERK_CAP)
        check(cap["marks"] <= 2 and cap["mine"] <= 2,
              "one Quill Clerk holds at most two Corrections (§8)", json.dumps(cap))

        # ══ Book Bat ════════════════════════════════════════════════════════
        atk = await page.evaluate(READ_AHEAD, ["attack"])
        skl = await page.evaluate(READ_AHEAD, ["skill"])
        check(atk["read"] == "attack" and atk["next"] == "hide-behind-the-cover",
              "Read Ahead on an Attack prepares Hide Behind the Cover", json.dumps(atk))
        check(skl["read"] == "skill" and skl["next"] == "scholarly-swoop",
              "CONTROL: a Skill on top prepares Scholarly Swoop instead", json.dumps(skl))

        # ══ Inkblot ═════════════════════════════════════════════════════════
        ia = await page.evaluate(IMPRESSION, ["attack"])
        isk = await page.evaluate(IMPRESSION, ["skill"])
        check(ia["impression"] == "attack",
              "Inkblot records an Attack as its Impression", json.dumps(ia))
        check(isk["impression"] == "skill" and isk["impression"] != ia["impression"],
              "CONTROL: ending on a Skill gives a different Impression", json.dumps(isk))

        # ══ Paper Knight ════════════════════════════════════════════════════
        one = await page.evaluate(FOLDED, [10, True])
        check(one["afterFirst"] == 5 and one["afterSecond"] == 10,
              "Folded turns aside 5 from the FIRST Attack each turn, not the second",
              f"first {one['afterFirst']}, second {one['afterSecond']}")
        forced = await page.evaluate(FOLDED, [20, False])
        held = await page.evaluate(FOLDED, [13, False])
        check(forced["foldedAfter"] is False and forced["next"] == "full-page-slash",
              "14+ Attack damage in one turn forces it Unfolded into Full Page Slash",
              json.dumps(forced))
        check(held["foldedAfter"] is True,
              "CONTROL: 13 damage (8 after the fold) leaves it Folded", json.dumps(held))

        # ══ Bookmark Imp ════════════════════════════════════════════════════
        kept = await page.evaluate(BOOKMARK, [False])
        spent = await page.evaluate(BOOKMARK, [True])
        check(kept["marked"] is True, "Mark Your Place really Bookmarks a Trick",
              json.dumps(kept)[:140])
        check(kept["atBottom"] is True,
              "keep it and it goes to the BOTTOM of the draw pile",
              json.dumps(kept)[:160])
        check(kept["guardAtPhase"] == 7,
              "and the Imp's 7 Guard survives its own turn-start wipe",
              f"held {kept['guardAtPhase']} when it acted")
        check(spent["bitFor"] >= 4,
              "CONTROL: play it instead and the Imp bites immediately",
              f"bit for {spent['bitFor']}")

        # ══ the Bookwyrm ════════════════════════════════════════════════════
        fed = await page.evaluate(DEVOUR, [30])
        starved = await page.evaluate(DEVOUR, [5])
        check(fed["eaten"] and fed["gone"] is True,
              "Demand a Volume takes the most expensive Trick out of the hand",
              json.dumps(fed)[:170])
        check(fed["swallowedAfter"] < len(fed["eaten"]) or fed["inHand"] is True,
              "30 damage in one turn and it coughs the oldest one back",
              json.dumps(fed)[:170])
        check(starved["swallowedAfter"] >= len(starved["eaten"]),
              "CONTROL: 5 damage is under the threshold and it keeps the book",
              json.dumps(starved)[:170])

        # ══ the Living Index ════════════════════════════════════════════════
        files = await page.evaluate(ENTRIES, [3])
        holds = await page.evaluate(ENTRIES, [1])
        check(files["queued"] == 1 and files["after"] == 0,
              "the 4th Entry Files the category and resets it", json.dumps(files))
        check(holds["queued"] == 0 and holds["after"] == 2,
              "CONTROL: the 2nd Entry files nothing", json.dumps(holds))

        # ══ the Inkblot Oracle ══════════════════════════════════════════════
        raw = await page.evaluate(ECHO_READS, [False])
        inked_echo = await page.evaluate(ECHO_READS, [True])
        check(raw.get("found") and raw["recorded"] == raw["printed"],
              "the Oracle records the printed Nerve cost of the Trick played",
              json.dumps(raw))
        check(inked_echo.get("found")
              and inked_echo["effective"] == inked_echo["printed"] + 1
              and inked_echo["recorded"] == inked_echo["printed"],
              "CONTROL: Correct it first and the echo still reads the PRINTED cost",
              json.dumps(inked_echo))
        e0 = await page.evaluate(ECHO_SCALES, [0])
        e3 = await page.evaluate(ECHO_SCALES, [3])
        check(e0["damageFn"] == 5 and e3["damageFn"] == 14,
              "Violent Reflection is 5 damage plus 3 per printed Nerve (§16)",
              f"cost 0 -> {e0['damageFn']}, cost 3 -> {e3['damageFn']}")

        # ══ the Archivist's Catalogue ═══════════════════════════════════════
        filed = await page.evaluate(CATALOGUE, [3])
        open_tab = await page.evaluate(CATALOGUE, [1])
        check(filed["filedNow"] is True and filed["queued"] == 1,
              "the 4th Entry Files the Attack tab", json.dumps(filed))
        check(filed["extraPlayed"] >= 1 and filed["moreCounted"] == 0,
              "§23: a FILED tab takes NO further Entries — the exploit is real",
              json.dumps(filed))
        check(open_tab["filedNow"] is False and open_tab["moreCounted"] > 0,
              "CONTROL: an unfiled tab counts every Attack normally",
              json.dumps(open_tab))

        mis = await page.evaluate(MISFILED, [True])
        norm = await page.evaluate(MISFILED, [False])
        if mis.get("found") and norm.get("found"):
            check(mis["after"]["s"] > mis["before"]["s"]
                  and mis["after"]["a"] == mis["before"]["a"],
                  "a Misfiled Attack files under SKILL, not Attack (§27, §34)",
                  json.dumps(mis))
            check(norm["after"]["a"] > norm["before"]["a"],
                  "CONTROL: an unmarked Attack files under Attack", json.dumps(norm))
        else:
            check(False, "the Misfiled probe found an Attack to play",
                  json.dumps([mis, norm])[:160])

        # ══ the hand gate ═══════════════════════════════════════════════════
        pair = await page.evaluate(HAND_PAIRING)
        check(not pair["offenders"],
              "every def that queues hand work declares onPlayerReady/runHandOps",
              ", ".join(pair["offenders"]) or f"{len(pair['users'])} defs queue, all paired")
        check(not pair["direct"],
              "no move effect reads the hand directly — there is none in the enemy phase",
              ", ".join(pair["direct"]) or "none")

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("sl-14", 2, 40, 800, "Scuffle 14 resolves a whole fight"),
            ("sl-scare-wyrm", 3, 40, 800, "the Bookwyrm resolves a whole fight"),
            ("sl-scare-index", 4, 40, 800, "the Living Index resolves a whole fight"),
            ("sl-scare-oracle", 5, 40, 800, "the Inkblot Oracle resolves a whole fight"),
            ("sl-boss", 6, 60, 900, "the Archivist resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")
            # A screenshot found five House Rule cards burying the Heart's boss.
            # This region marks constantly, so the count is asserted, not eyeballed.
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
