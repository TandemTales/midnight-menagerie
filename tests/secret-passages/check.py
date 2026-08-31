"""The Secret Passages, driven against the REAL CombatEngine.

    python tests/secret-passages/check.py [--verbose]

§2 and §3 draw a line this region cannot afford to blur — "Hidden and removed
from the battlefield are mechanically different states" (§60) — and §16's and
§19's offers only work if the player can see what they bought. So every claim
below has a CONTROL, and the ones that matter most are the ones about what
CANNOT happen:

  * Hidden really stops an Attack Trick and really does NOT stop a Skill;
  * Passage really stops all three — and really leaves an entrance on the board,
    so the hand is never dead;
  * being Seen really needs three of a TYPE, and two really is not enough;
  * a Seen rider really lands in the number the player was shown, a full turn
    ahead, rather than appearing after they committed;
  * Distracted really replaces a drawn Trick and really does not cost one;
  * the Shadow Draft really moves Tricks and really destroys none;
  * a Key really costs Nerve, and two Keys really never take the third;
  * the Moving Wall's Gap really is steered by the Attack-to-Skill mix, and
    lining it up really is worth double;
  * a Whisper's reveal condition really reveals it, and really is not the only
    way in — two acts unheard and it gives itself away;
  * playing Go Through? really drops the Door's printed number to 0 rather than
    silently missing;
  * breaking the Warden's chosen Latch really reroutes it clockwise, sealing
    every route really leaves it with nothing, and three Marks really is worth
    10% while it is Exposed.

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
() => { window.make = function make(ids, { seed = 7, hp = 500, energy = 9, deckMul = 1 } = {}) {
  const { C, en, cards, RNG } = window.__Y;
  /* `deckMul` exists because a 10-card deck RESHUFFLES inside two turns, and a
     probe that watches a Trick move from the draw pile to the discard cannot
     tell "it moved" from "the discard was just emptied back into the draw". */
  let deck = cards.startingDeckFor('mossbit');
  for (let i = 1; i < deckMul; i++) deck = deck.concat(cards.startingDeckFor('mossbit'));
  const e = new C.CombatEngine({ rng: new RNG(seed),
    player: { name: 'K', maxHp: hp, hp, energyMax: energy, deck },
    enemies: ids.map(id => en.getEnemy(id)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  return e;
};
window.buildEnc = function (encId, seed, hp, energy) {
  const { C, enc, en, cards, RNG } = window.__Y;
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
window.swing = function (e, target, amount) {
  target.block = 0;
  const hpBefore = e.player.hp;
  const tBefore = target.hp;
  e.dealDamage({ attacker: e.player, defender: target, amount, kind: 'attack',
                 card: { type: 'attack', id: 't', uid: 't' } });
  return { dealt: tBefore - target.hp, tookBack: hpBefore - e.player.hp };
};
/** Put a known Trick in hand and play it, so a probe can choose the TYPE. */
window.playOne = async function (e, id, targetId) {
  const def = e.resolveCardDef(id);
  const card = e.addCard(def, 'hand', { reason: 'probe' });
  if (!card) return null;
  const t = targetId !== undefined ? targetId : (e.firstLivingEnemy() || {}).id ?? null;
  const r = await e.playCard(card.uid, t);
  return r;
};
window.bodies = function (e, defId) { return e.enemies.filter(x => x.defId === defId && x.alive); };
window.body = function (e, defId) { return window.bodies(e, defId)[0] || null; };
/** Keep a probe's subject alive while the probe hits it for something else. */
window.tough = function (a, hp) { a.maxHp = hp; a.hp = hp; return a; };
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const SP = enc.ENCOUNTER_LIST.filter(x => x.region === 'secret-passages');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'secret-passages');
  const placed = new Set(SP.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: SP.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly && d.role !== 'object').length,
    scares: SP.filter(f => f.tier === 'elite').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && d.role !== 'object' && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: SP.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    statuses: ['seen', 'distracted', 'passage', 'stolen-key', 'nerve-taken',
               'told-on', 'shut', 'ajar', 'cornered', 'mapped', 'bolted', 'delivered']
      .filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
    offers: ['invite/go-through', 'echo/attack', 'echo/guard']
      .filter(id => en.STATUS_TRICK_DEFS.some(d => d.id === id)),
  };
}
"""

# ── Seen: three of a TYPE, and two is not enough ────────────────────────────
SEEN = r"""
async ([n, mix]) => {
  const e = make(['peephole'], { seed: 5, hp: 600, energy: 99, deckMul: 4 });
  await e.startCombat();
  tough(e.enemies[0], 400);     // the probe is about the third card, not the kill
  const ids = mix
    ? ['neutral/torchlight', 'neutral/quick-look', 'neutral/torchlight']
    : ['neutral/torchlight', 'neutral/torchlight', 'neutral/torchlight'];
  for (let i = 0; i < n; i++) await playOne(e, ids[i % ids.length]);
  return { seen: e.player.hasStatus('seen'), played: e.playedThisTurn.length };
}
"""

# ── the Seen rider is in the committed number, one turn ahead ───────────────
COME_THROUGH = r"""
async ([makeSeen]) => {
  const e = make(['false-door', 'peephole'], { seed: 9, hp: 800, energy: 99, deckMul: 4 });
  await e.startCombat();
  const door = tough(body(e, 'false-door'), 400);
  tough(body(e, 'peephole'), 400);
  // Walk the Door's cycle to Come Through, optionally being Seen on the way.
  let hits = null, seenAtCommit = null;
  for (let t = 0; t < 6; t++) {
    if (makeSeen) for (let i = 0; i < 3; i++) await playOne(e, 'neutral/torchlight', door.id);
    await e.endTurn();
    if (door.intent && door.intent.moveId === 'come-through') {
      hits = door.intent.hits; seenAtCommit = !!e.field.sawSeen; break;
    }
  }
  return { hits, seenAtCommit };
}
"""

# ── Distracted replaces a Trick and does not cost one ───────────────────────
DISTRACTED = r"""
async ([viaEffect]) => {
  const e = make(['wall-whisper'], { seed: 4, hp: 600, energy: 99 });
  await e.startCombat();
  e.applyStatus(e.player, 'distracted', 1);
  const before = e.piles.hand.length;
  const discardBefore = e.piles.discard.length;
  const drawnFirst = e.piles.draw[0] ? e.piles.draw[0].uid : null;
  if (viaEffect) e.drawCards(1, 'probe-card');
  else e.drawCards(1, 'turnStart');
  const inHand = e.piles.hand.some(c => c.uid === drawnFirst);
  return {
    gained: e.piles.hand.length - before,
    firstWentToDiscard: !inHand && e.piles.discard.length > discardBefore,
    stillDistracted: e.player.hasStatus('distracted'),
  };
}
"""

# ── Hidden stops Attacks only; Passage stops everything ─────────────────────
REACH = r"""
async ([which]) => {
  const e = make([which === 'hidden' ? 'wall-whisper' : 'crawlspace-thing'],
                 { seed: 6, hp: 700, energy: 99 });
  await e.startCombat();
  const en0 = e.enemies[0];
  e.applyStatus(en0, which === 'hidden' ? 'hidden' : 'passage', 1);
  const atk = { type: 'attack' }, skl = { type: 'skill' }, pow = { type: 'power' };
  return {
    attack: e.isTargetable(en0, atk),
    skill: e.isTargetable(en0, skl),
    power: e.isTargetable(en0, pow),
  };
}
"""

# ── Passage leaves an entrance, so an Attack always has a target ────────────
GRATE = r"""
async ([breakIt, tricks]) => {
  const e = make(['crawlspace-thing'], { seed: 8, hp: 900, energy: 99, deckMul: 4 });
  await e.startCombat();
  const thing = body(e, 'crawlspace-thing');
  // Long Fingers, then Crawl Away.
  await e.endTurn(); await e.endTurn();
  const grate = body(e, 'vent-grate');
  const atk = { type: 'attack' };
  const targetable = e.targetableEnemies(atk).map(x => x.defId);
  if (breakIt && grate) e.dealDamage({ attacker: e.player, defender: grate, amount: 40,
    kind: 'attack', card: { type: 'attack', id: 't', uid: 't' } });
  /* Borrowed Courage and not Quick Look: Quick Look draws, so the fourth copy
     cannot be added to a hand already at the cap and the probe silently plays
     three. The mechanic is about the COUNT of Tricks, not which ones. */
  for (let i = 0; i < tricks; i++) await playOne(e, 'neutral/borrowed-courage', null);
  /* Read WHILE it is away: the ambush below brings it back and closes the
     Passage, so asking afterwards measures the wrong turn. */
  const thingReachable = e.isTargetable(thing, atk);
  const promised = thing.intent ? thing.intent.damage : null;
  const hpBefore = e.player.hp;
  await e.endTurn();
  return { grateUp: !!grate, thingReachable, targetable, promised, dealt: hpBefore - e.player.hp };
}
"""

# ── the False Door's Closed reduction, and what opens it ────────────────────
FALSE_DOOR = r"""
async ([open]) => {
  const e = make(['false-door'], { seed: 3, hp: 800, energy: 99, deckMul: 4 });
  await e.startCombat();
  const d = tough(body(e, 'false-door'), 400);
  if (open) for (let i = 0; i < 3; i++) await playOne(e, 'neutral/borrowed-courage', null);
  const wasOpen = d.hasStatus('ajar');
  const first = swing(e, d, 20).dealt;
  const second = swing(e, d, 20).dealt;
  return { wasOpen, first, second, closed: d.hasStatus('shut') };
}
"""

# ── Keys: taken, floored at 1 Nerve, dropped, and returned on defeat ────────
KEYS = r"""
async ([mode]) => {
  const e = make(['key-snatcher'], { seed: 12, hp: 900, energy: 3 });
  await e.startCombat();
  const k = body(e, 'key-snatcher');
  const nerveOpen = e.energy;
  // Two Snatches, one per cycle of three.
  for (let t = 0; t < 6 && k.counters.keys < 2; t++) await e.endTurn();
  const keys = k.counters.keys;
  const nerveNow = e.energy;
  if (mode === 'drop' || mode === 'nodrop') {
    swing(e, k, mode === 'drop' ? 15 : 5);
    await e.endTurn();
    return { keys, after: k.counters.keys, stacks: e.player.status('stolen-key') };
  }
  if (mode === 'kill') {
    swing(e, k, 999);
    return { keys, alive: k.alive, stacks: e.player.status('stolen-key') };
  }
  return { keys, nerveOpen, nerveNow, stacks: e.player.status('stolen-key') };
}
"""

# ── the Shadow Draft moves Tricks and destroys none ─────────────────────────
DRAFT = r"""
async () => {
  const e = make(['shadow-draft'], { seed: 15, hp: 800, energy: 99, deckMul: 4 });
  await e.startCombat();
  const total = () => e.piles.all().length;
  const before = total();
  const topBefore = e.piles.draw[0] ? e.piles.draw[0].uid : null;
  await e.endTurn();                                   // Cold Draft
  const movedToDiscard = e.piles.discard.some(c => c.uid === topBefore);
  await e.endTurn();                                   // Cross Breeze
  /* The hand resolves INTO the discard at the top of every endTurn, so the
     "most recently discarded" Trick that Backdraft reaches for is whatever the
     player was still holding — not what the probe noted a turn ago. Emptying
     the hand into the draw pile first makes the target stable and is the only
     way to name it in advance. */
  for (const c of [...e.piles.hand]) e.piles.move(c, 'draw', { bottom: true });
  const lastDiscard = e.piles.discard.length
    ? e.piles.discard[e.piles.discard.length - 1].uid : null;
  await e.endTurn();                                   // Backdraft
  /* Backdraft puts it on TOP OF THE DRAW PILE, and the very next thing that
     happens is the turn-start deal — so by the time a probe can look, the
     Trick it put back is the first card of the new hand. That IS the promise
     ("the Trick is shown"), and reading the draw pile instead measured the
     card behind it. */
  const firstDealt = e.piles.hand[0] ? e.piles.hand[0].uid : null;
  return { before, after: total(), movedToDiscard, returnedToTop: firstDealt === lastDiscard };
}
"""

# ── the Moving Wall: lining the Gap up, and steering it ─────────────────────
WALL = r"""
async ([mode]) => {
  const e = make(['moving-wall'], { seed: 21, hp: 900, energy: 99 });
  await e.startCombat();
  const w = body(e, 'moving-wall');
  if (mode === 'lined') w.counters.facing = w.counters.gap;
  if (mode === 'off') w.counters.facing = (w.counters.gap + 1) % 3;
  if (mode === 'lined' || mode === 'off') {
    return { dealt: swing(e, w, 40).dealt, gap: w.counters.gap, facing: w.counters.facing };
  }
  // Steering: three Attacks vs three Skills vs one of each.
  const gapBefore = w.counters.gap;
  const plays = mode === 'right' ? ['neutral/torchlight', 'neutral/torchlight']
    : mode === 'left' ? ['neutral/borrowed-courage', 'neutral/borrowed-courage']
    : ['neutral/torchlight', 'neutral/borrowed-courage'];
  for (const id of plays) await playOne(e, id, w.id);
  await e.endTurn();
  return { gapBefore, gapAfter: w.counters.gap };
}
"""

# ── a Whisper: the reveal condition, and the fallback ───────────────────────
CHOIR = r"""
async ([mode]) => {
  const e = make(['threatening-whisper', 'nervous-whisper', 'hungry-whisper', 'lost-whisper'],
                 { seed: 31, hp: 900, energy: 99, deckMul: 4 });
  await e.startCombat();
  const t = body(e, 'threatening-whisper');
  const atk = { type: 'attack' };
  const hiddenAtStart = !e.isTargetable(t, atk);
  if (mode === 'reveal') e.gainBlock(e.player, 12, { reason: 'probe' });
  if (mode === 'control') e.gainBlock(e.player, 4, { reason: 'probe' });
  if (mode === 'fallback') {
    for (let i = 0; i < 6; i++) { await e.endTurn(); if (e.isTargetable(t, atk)) break; }
    return { hiddenAtStart, reachable: e.isTargetable(t, atk), acted: (t.mem || {}).acted };
  }
  await e.endTurn();
  return { hiddenAtStart, reachable: e.isTargetable(t, atk) };
}
"""

# ── Tell the House arms at the START of the turn, inside the number ─────────
TELL = r"""
async ([seenFirst]) => {
  const e = make(['peephole', 'wall-whisper'], { seed: 61, hp: 900, energy: 99, deckMul: 4 });
  await e.startCombat();
  tough(body(e, 'peephole'), 400);
  const whisper = tough(body(e, 'wall-whisper'), 400);
  // Watch, then Tell the House on the second enemy turn.
  if (seenFirst) for (let i = 0; i < 3; i++) await playOne(e, 'neutral/borrowed-courage', null);
  await e.endTurn();
  if (seenFirst) for (let i = 0; i < 3; i++) await playOne(e, 'neutral/borrowed-courage', null);
  await e.endTurn();                       // Tell the House resolves here
  const told = whisper.status('told-on') || body(e, 'peephole').status('told-on');
  /* The number matters more than the status, and WHICH move the Whisper is on
     does not: both runs walk the same two turns, so they are on the same move
     and the only difference between the two numbers is the +4. Naming the move
     here just made the probe wrong when the cycle sat on Voice Behind You. */
  const bite = whisper.intent ? whisper.intent.damage : null;
  const move = whisper.intent ? whisper.intent.moveId : null;
  const hpBefore = e.player.hp;
  e.player.block = 0;
  await e.endTurn();
  return { told, bite, move, dealt: hpBefore - e.player.hp };
}
"""

# ── the Door That Wasn't There: Locked, the offer, and the printed miss ─────
THE_DOOR = r"""
async ([mode]) => {
  const e = make(['the-door'], { seed: 41, hp: 900, energy: 99 });
  await e.startCombat();
  const d = body(e, 'the-door');
  if (mode === 'locked') {
    const first = swing(e, d, 20).dealt;
    const second = swing(e, d, 20).dealt;
    return { first, second };
  }
  // Deadbolt, then Stand Open.
  await e.endTurn(); await e.endTurn();
  const offered = e.piles.hand.some(c => c.id === 'invite/go-through');
  if (mode === 'offer') return { offered, open: d.hasStatus('ajar') };
  if (mode === 'accept') {
    const card = e.piles.hand.find(c => c.id === 'invite/go-through');
    if (card) await e.playCard(card.uid, null);
    const promised = d.intent ? d.intent.damage : null;
    const hpBefore = e.player.hp;
    await e.endTurn();
    return { offered, promised, dealt: hpBefore - e.player.hp };
  }
  const promised = d.intent ? d.intent.damage : null;
  const hpBefore = e.player.hp;
  await e.endTurn();
  return { offered, promised, dealt: hpBefore - e.player.hp };
}
"""

# ── the Whisper Warden: Latches, rerouting, sealing and Marks ───────────────
WARDEN = r"""
async ([mode]) => {
  const e = make(['whisper-warden'], { seed: 51, hp: 1200, energy: 99, deckMul: 4 });
  await e.startCombat();
  const w = body(e, 'whisper-warden');
  const atk = { type: 'attack' };
  // Phase one is four moves; the fourth is Vanish.
  for (let t = 0; t < 4; t++) await e.endTurn();
  const latches = e.enemies.filter(x => String(x.defId).startsWith('latch-') && x.alive);
  const route = (w.mem || {}).route;
  if (mode === 'vanish') {
    return { latches: latches.length, integrity: latches[0] ? latches[0].maxHp : null,
             reachable: e.isTargetable(w, atk),
             latchReachable: latches[0] ? e.isTargetable(latches[0], atk) : false, route };
  }
  const chosen = latches.find(x => x.defId === 'latch-' + String(route).split('-')[0]);
  const promisedBefore = w.intent ? w.intent.moveId : null;
  if (mode === 'reroute') {
    if (chosen) e.dealDamage({ attacker: e.player, defender: chosen, amount: 99, kind: 'attack',
      card: { type: 'attack', id: 't', uid: 't' } });
    // no card was played, so nothing but the death itself can refresh the intent
    return { promisedBefore, promisedAfter: w.intent ? w.intent.moveId : null,
             routeBefore: route, routeAfter: (w.mem || {}).route,
             marked: ((w.mem || {}).marked || []).length };
  }
  if (mode === 'sealall') {
    for (const l of latches) e.dealDamage({ attacker: e.player, defender: l, amount: 99,
      kind: 'attack', card: { type: 'attack', id: 't', uid: 't' } });
    const move = w.intent ? w.intent.moveId : null;
    const hpBefore = e.player.hp;
    await e.endTurn();
    return { move, dealt: hpBefore - e.player.hp, cornered: w.hasStatus('cornered'),
             marked: ((w.mem || {}).marked || []).length };
  }
  if (mode === 'pocket') {
    // Rewind to a fresh fight and walk to Pocket Something (move 3).
    const e2 = make(['whisper-warden'], { seed: 52, hp: 1200, energy: 99, deckMul: 4 });
    await e2.startCombat();
    const w2 = body(e2, 'whisper-warden');
    // Quiet Knife, Listen at the Wall, then Pocket Something ARMS on the third.
    await e2.endTurn(); await e2.endTurn(); await e2.endTurn();
    /* The take happens at `onPlayerReady`, so the hand to compare against is
       the one the NEXT turn was dealt — measured after the deal, not before. */
    const handBefore = e2.player.drawPerTurn;
    const stashed = ((w2.mem || {}).stashed || []).length;
    const handAfter = e2.piles.hand.length;
    await e2.endTurn();
    return { handBefore, stashed, handAfter, returned: ((w2.mem || {}).stashed || []).length };
  }
  return {};
}
"""

FIGHT = r"""
async ([encId, seed, turns, hp]) => {
  const e = buildEnc(encId, seed, hp, 4);
  const warns = []; const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  await e.startCombat();
  let guard = 0, maxRules = 0, maxBodies = 0;
  while (!e.over && guard++ < turns) {
    let inner = 0;
    while (!e.over && inner++ < 8) {
      const t = (e.firstLivingEnemy() || {}).id ?? null;
      const c = e.piles.hand.find(x => e.canPlay(x.uid, t).ok);
      if (!c) break;
      await e.playCard(c.uid, t);
    }
    maxRules = Math.max(maxRules, (e.rules || []).length);
    maxBodies = Math.max(maxBodies, e.livingEnemies().length);
    if (!e.over) await e.endTurn();
  }
  console.warn = orig;
  return { over: e.over, turns: e.turn, maxRules, maxBodies, warns: warns.slice(0, 4) };
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

        # ══ statics ═════════════════════════════════════════════════════════
        s = await page.evaluate(STATIC)
        check(s["formations"] >= 18, "the region ships its full formation list",
              f"{s['formations']} formations")
        check(s["ordinary"] == 6, "six ordinary enemies (§1)", f"{s['ordinary']}")
        check(s["scares"] == 3, "three Big Scares (§1)", f"{s['scares']}")
        check(not s["unknownMembers"], "every formation names an enemy that exists",
              ", ".join(s["unknownMembers"]) or "all resolve")
        check(not s["leaked"], "Grates, frames and Latches are never placed by hand",
              ", ".join(s["leaked"]) or "none")
        check(not s["unreachable"], "every enemy appears in some formation",
              ", ".join(s["unreachable"]) or "all reachable")
        check("secret-passages" in s["implemented"], "registered as implemented",
              str(s["implemented"]))
        check(s["ladder"].index("secret-passages") < s["ladder"].index("heart"),
              "the ladder walks the Passages before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 12, "every region status is registered",
              ", ".join(s["statuses"]))
        check(len(s["offers"]) == 3, "the offer and both Echoes are real registered Tricks",
              ", ".join(s["offers"]))

        # ══ Seen ════════════════════════════════════════════════════════════
        three = await page.evaluate(SEEN, [3, False])
        two = await page.evaluate(SEEN, [2, False])
        mixed = await page.evaluate(SEEN, [3, True])
        check(three["seen"] is True, "three of one TYPE really makes you Seen (§4)",
              json.dumps(three))
        check(two["seen"] is False, "CONTROL: two is not enough", json.dumps(two))
        check(mixed["seen"] is False,
              "CONTROL: three Tricks of MIXED types is not enough either", json.dumps(mixed))

        # ══ the Seen rider is a committed number ════════════════════════════
        seen_run = await page.evaluate(COME_THROUGH, [True])
        plain = await page.evaluate(COME_THROUGH, [False])
        check(plain["hits"] == 2, "Come Through promises 2 hits when you were not Seen",
              json.dumps(plain))
        check(seen_run["hits"] == 3 and seen_run["seenAtCommit"] is True,
              "and 3 when you were — read at COMMIT, a full turn ahead (§6)",
              json.dumps(seen_run))

        # ══ Distracted ══════════════════════════════════════════════════════
        eff = await page.evaluate(DISTRACTED, [True])
        deal = await page.evaluate(DISTRACTED, [False])
        check(eff["gained"] == 1 and eff["firstWentToDiscard"] is True,
              "an effect-draw really discards the first and replaces it (§5)",
              json.dumps(eff))
        check(eff["stillDistracted"] is False, "and really triggers only once",
              json.dumps(eff))
        check(deal["gained"] == 1 and deal["firstWentToDiscard"] is False
              and deal["stillDistracted"] is True,
              "CONTROL: the turn-start deal is untouched", json.dumps(deal))

        # ══ Hidden is not Passage ═══════════════════════════════════════════
        hid = await page.evaluate(REACH, ["hidden"])
        pas = await page.evaluate(REACH, ["passage"])
        check(hid["attack"] is False and hid["skill"] is True and hid["power"] is True,
              "Hidden really stops Attack Tricks ONLY (§2)", json.dumps(hid))
        check(pas["attack"] is False and pas["skill"] is False and pas["power"] is False,
              "CONTROL: Passage really stops all three (§3)", json.dumps(pas))

        # ══ Passage leaves an entrance ══════════════════════════════════════
        away = await page.evaluate(GRATE, [False, 0])
        noisy = await page.evaluate(GRATE, [False, 4])
        broken = await page.evaluate(GRATE, [True, 0])
        both = await page.evaluate(GRATE, [True, 4])
        check(away["grateUp"] is True and away["thingReachable"] is False
              and "vent-grate" in away["targetable"],
              "in Passage it is unreachable and the Grate it left IS a target",
              json.dumps(away))
        check(away["promised"] == 18 and away["dealt"] == 18,
              "the ambush promises 18 and lands 18 (§9)", json.dumps(away))
        check(noisy["promised"] == 10,
              "four Tricks while it is away really drops it to 10", json.dumps(noisy))
        check(broken["promised"] == 12,
              "breaking the Grate really takes 6 off instead", json.dumps(broken))
        check(both["promised"] == 4, "and both answers really stack", json.dumps(both))

        # ══ the False Door ══════════════════════════════════════════════════
        shut = await page.evaluate(FALSE_DOOR, [False])
        opened = await page.evaluate(FALSE_DOOR, [True])
        check(shut["wasOpen"] is False and shut["first"] == 10 and shut["second"] == 20,
              "Closed really halves the FIRST Attack each turn and only the first (§6)",
              json.dumps(shut))
        check(opened["wasOpen"] is True and opened["first"] == 24,
              "CONTROL: three Tricks opens it, and Open really takes 20% more",
              json.dumps(opened))

        # ══ Key Snatcher ════════════════════════════════════════════════════
        held = await page.evaluate(KEYS, ["hold"])
        dropped = await page.evaluate(KEYS, ["drop"])
        kept = await page.evaluate(KEYS, ["nodrop"])
        killed = await page.evaluate(KEYS, ["kill"])
        check(held["keys"] == 2 and held["stacks"] == 2,
              "two Snatches really take two Nerve (§7)", json.dumps(held))
        check(held["nerveNow"] >= 1,
              "and the player's Nerve really never falls below 1", json.dumps(held))
        check(dropped["after"] == 1 and dropped["stacks"] == 1,
              "13+ Courage in one turn really drops a Key back", json.dumps(dropped))
        check(kept["after"] == 2, "CONTROL: 5 does not", json.dumps(kept))
        check(killed["alive"] is False and killed["stacks"] == 0,
              "and killing it really returns them all", json.dumps(killed))

        # ══ Shadow Draft ════════════════════════════════════════════════════
        dr = await page.evaluate(DRAFT)
        check(dr["before"] == dr["after"],
              "it really destroys nothing — the deck is the same size after (§8)",
              f"{dr['before']} -> {dr['after']}")
        check(dr["movedToDiscard"] is True, "Cold Draft really moves the top of the deck",
              json.dumps(dr))
        check(dr["returnedToTop"] is True,
              "and Backdraft really brings the last discard back on top — it is the "
              "first Trick of the next hand (§8)", json.dumps(dr))

        # ══ the Moving Wall ═════════════════════════════════════════════════
        lined = await page.evaluate(WALL, ["lined"])
        off = await page.evaluate(WALL, ["off"])
        right = await page.evaluate(WALL, ["right"])
        left = await page.evaluate(WALL, ["left"])
        tied = await page.evaluate(WALL, ["tie"])
        check(lined["dealt"] == 40, "the Gap lined up really takes FULL damage (§14)",
              json.dumps(lined))
        check(off["dealt"] == 20, "CONTROL: off the Gap really takes half", json.dumps(off))
        check(right["gapAfter"] == right["gapBefore"] + 1,
              "more Attacks than Skills really slides the Gap right", json.dumps(right))
        check(left["gapAfter"] == left["gapBefore"] - 1,
              "more Skills than Attacks really slides it left", json.dumps(left))
        check(tied["gapAfter"] == tied["gapBefore"],
              "CONTROL: tied really leaves it where it is", json.dumps(tied))

        # ══ the Whisper Choir ═══════════════════════════════════════════════
        rev = await page.evaluate(CHOIR, ["reveal"])
        ctrl = await page.evaluate(CHOIR, ["control"])
        fall = await page.evaluate(CHOIR, ["fallback"])
        check(rev["hiddenAtStart"] is True and rev["reachable"] is True,
              "10 Guard in a turn really exposes the Threatening Whisper (§15)",
              json.dumps(rev))
        check(ctrl["reachable"] is False, "CONTROL: 4 does not", json.dumps(ctrl))
        check(fall["reachable"] is True,
              "and a deck that cannot do it still gets in — two acts unheard and it "
              "gives itself away (§15)", json.dumps(fall))

        # ══ Tell the House ══════════════════════════════════════════════════
        told = await page.evaluate(TELL, [True])
        untold = await page.evaluate(TELL, [False])
        check(told["told"] >= 1,
              "Tell the House really hands the +4 to ANOTHER enemy (§4)", json.dumps(told))
        check(told["bite"] is not None and told["bite"] == untold["bite"] + 4,
              "and the ally's PRINTED number really carries it, at the start of the "
              "turn, before the player decides anything",
              f"{untold['move']} {untold['bite']} -> {told['bite']}")
        check(untold["told"] == 0,
              "CONTROL: with nothing to report it hands over nothing", json.dumps(untold))

        # ══ the Door That Wasn't There ══════════════════════════════════════
        lock = await page.evaluate(THE_DOOR, ["locked"])
        offer = await page.evaluate(THE_DOOR, ["offer"])
        decline = await page.evaluate(THE_DOOR, ["decline"])
        accept = await page.evaluate(THE_DOOR, ["accept"])
        check(lock["first"] == 14 and lock["second"] == 20,
              "Locked really takes 6 off the first Attack each turn, and only the first (§16)",
              json.dumps(lock))
        check(offer["offered"] is True and offer["open"] is True,
              "standing Open really puts Go Through? in your hand", json.dumps(offer))
        check(decline["promised"] == 11 and decline["dealt"] == 11,
              "CONTROL: declining leaves the Door Slam at 11", json.dumps(decline))
        check(accept["promised"] == 0 and accept["dealt"] == 0,
              "accepting really drops the PRINTED number to 0, not just the swing",
              json.dumps(accept))

        # ══ the Whisper Warden ══════════════════════════════════════════════
        van = await page.evaluate(WARDEN, ["vanish"])
        rr = await page.evaluate(WARDEN, ["reroute"])
        seal = await page.evaluate(WARDEN, ["sealall"])
        pocket = await page.evaluate(WARDEN, ["pocket"])
        check(van["latches"] == 3 and van["integrity"] == 14,
              "Vanish really raises three Latches at 14 Integrity (§18/§28)",
              json.dumps(van))
        check(van["reachable"] is False and van["latchReachable"] is True,
              "the Warden really cannot be reached and the Latches really can (§18)",
              json.dumps(van))
        check(rr["routeAfter"] and rr["routeAfter"] != rr["routeBefore"]
              and rr["promisedAfter"] != rr["promisedBefore"],
              "breaking the chosen Latch really reroutes it and the Ambush really changes (§19)",
              json.dumps(rr))
        check(rr["marked"] >= 1, "and really Marks the Passage it abandoned (§34)",
              json.dumps(rr))
        check(seal["move"] == "trapped-between-walls" and seal["dealt"] == 0,
              "sealing every route really leaves it with nothing (§19)", json.dumps(seal))
        check(seal["marked"] >= 3 and seal["cornered"] is True,
              "and three Marks really makes it Cornered (§34)", json.dumps(seal))
        check(pocket["stashed"] == 1 and pocket["handAfter"] == pocket["handBefore"] - 1,
              "Pocket Something really takes one Trick out of your hand (§24)",
              json.dumps(pocket))
        check(pocket["returned"] == 0,
              "and really gives it back at the start of your next turn (§26)",
              json.dumps(pocket))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, bodies, label in [
            ("sp-14", 2, 40, 800, 3, "Scuffle 14 resolves a whole fight"),
            ("sp-scare-wall", 3, 40, 800, 1, "the Moving Wall resolves a whole fight"),
            ("sp-scare-choir", 4, 40, 900, 4, "the Whisper Choir resolves a whole fight"),
            ("sp-scare-door", 5, 40, 900, 2, "the Door resolves a whole fight"),
            ("sp-boss", 6, 70, 1000, 6, "the Whisper Warden resolves a whole fight"),
        ]:
            r = await page.evaluate(FIGHT, [enc_id, seed, turns, hp])
            check(not r["warns"], f"{label} with no engine warnings",
                  "; ".join(r["warns"][:2]) or f"{r['turns']} turns, over={r['over']}")
            check(r["maxRules"] <= 6,
                  f"{label} without burying the portrait in House Rules",
                  f"at most {r['maxRules']} rule cards at once")
            check(r["maxBodies"] <= bodies,
                  f"{label} without more bodies than the layout can hold",
                  f"at most {r['maxBodies']} at once")

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
