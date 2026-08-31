"""The Sleeping Quarters, driven against the REAL CombatEngine.

    python tests/sleeping-quarters/check.py [--verbose]

The region thesis is "not every threat should be attacked immediately, and not
every visible target is the real threat", and it is built almost entirely out of
the four engine seams a mocked context cannot reach: `isTargetable`,
`damageTakenMul`, multi-body parts, and summoning.

That is not a hypothetical worry in this region — it is its history. THREE of
its mechanics shipped dead and were found by other work:

  * The Wardrobe looked for its own body by ACTOR id, so `doorsBroken` was never
    incremented — which meant its body was permanently untargetable AND never
    took the 20% it is supposed to take with both Doors broken. It sat at
    140/140 with both Doors dead in a fight that could not end.
  * `isTargetable` and `damageTakenMul` were read by NOTHING until 2026-08-30,
    so even a correct `doorsBroken` would have changed no number.
  * `actor.summonedBy` was read by five content sites and written by none, found
    2026-08-31 — which here is the Wardrobe's summon cap and the despawn its
    `onDeath` performs.

So every claim below is checked against a real board, with a CONTROL wherever
the claim is about a board one turn from now:

  * Scurry really halves the player's Attack and really leaves when it hides;
  * Hidden really stops the Guest being targeted, and really is not
    invulnerability — the fight still ends;
  * a Layer really comes off at 10 damage and really not at 9, the Guard really
    tracks the Layers, and Uncovered really adds 2;
  * Darkness really adds 2 to every OTHER enemy and really never to the Snuffer,
    really survives one full enemy phase, and really dies with its caster;
  * 15 damage in one turn really removes a Scare, so UNDER THE BED really reads
    6 lower — and really lands what it showed;
  * the Night Terror really shows BOTH branches until the first Trick, and the
    player's own card really picks which one;
  * killing a Hydra Head really costs the body 10 and really regrows — until the
    body is under half, where it really does not;
  * and the Wardrobe body really cannot be hit with both Doors standing, really
    can with one broken, and really takes 20% more with both.

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
  window.__S = { C, enc, en, st, cards };
  window.__S.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

MAKE = r"""
() => {
  const { C, enc, en, cards, RNG } = window.__S;
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
          block: a.intent.block ?? 0 }
      : null;
  };
  /* What the SCENE draws beside the intent. `alternatives(c)` lives on the move
     def and `scenes/combat.js` calls it directly — it is never copied onto the
     intent object, so reading `intent.alternatives` finds nothing whether the
     mechanic works or not. This is the production path. */
  window.altsOf = function (e, a) {
    const mv = a && (a.pendingMove || (a.def && a.def.moves && a.intent
                                       && a.def.moves[a.intent.moveId]));
    if (!mv || typeof mv.alternatives !== 'function') return [];
    try { return (mv.alternatives(e.enemyCtx(a, mv)) || []).map(x => x.key); }
    catch (err) { return ['THREW:' + err.message]; }
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
  /* The bot has to look for a LEGAL target, not the first living body. The
     Wardrobe is untargetable until a Door breaks, so a bot that only ever aims
     at `firstLivingEnemy()` plays nothing at all and the fight never ends —
     which reads as a hung encounter rather than as a working mechanic. */
  window.greedyTurn = async function (e, cap = 8) {
    let n = 0;
    while (!e.over && n++ < cap) {
      let card = null, target = null;
      outer:
      for (const c of e.piles.hand) {
        for (const t of [...e.enemies.filter(x => x.alive), null]) {
          const id = t ? t.id : null;
          if (e.canPlay(c.uid, id).ok) { card = c; target = id; break outer; }
        }
      }
      if (!card) break;
      await e.playCard(card.uid, target);
    }
    return n - 1;
  };
  window.body = function (e, defId) {
    return e.enemies.filter(x => x.defId === defId && x.alive)[0] || null;
  };
  window.setHp = function (a, hp) { a.hp = Math.max(1, hp); };
  /* Whether the engine will let the player aim at this actor at all — the
     `isTargetable` seam, which had no reader until 2026-08-30. */
  window.canAim = function (e, a) {
    const c = e.piles.hand.find(x => x.type === 'attack');
    if (!c) return null;
    return e.canPlay(c.uid, a.id).ok;
  };
  return true;
}
"""

STATIC = r"""
async () => {
  const { enc, en } = window.__S;
  const F = enc.ENCOUNTER_LIST.filter(x => x.region === 'sleeping-quarters');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'sleeping-quarters');
  const placed = new Set(F.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: F.length,
    tiers: [...new Set(F.map(f => f.tier))].sort(),
    roster: roster.length,
    scares: F.filter(f => f.tier === 'elite').length,
    bosses: F.filter(f => f.tier === 'boss').length,
    leaked: en.SUMMON_ONLY.filter(id => placed.has(id)),
    unreachable: roster.filter(d => !d.summonOnly && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS.includes('sleeping-quarters'),
    unknownMembers: F.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    noHaunt: roster.filter(d => typeof d.hauntScaling !== 'function').map(d => d.id),
    // The parts must declare what they are part of, or the layout cannot group them.
    parts: roster.filter(d => d.partOf).map(d => `${d.id}->${d.partOf}`),
  };
}
"""

# ── 1. Scurry: halves the player's Attack, and it can be taken away ──────────
SCURRY = r"""
async ([turns]) => {
  const e = make(['slipper-skitter'], { hp: 900 });
  await e.startCombat();
  const a = e.enemies[0];
  for (let t = 0; t < turns; t++) { e.player.block = 0; await e.endTurn(); }
  const scurry = a.status('scurry');
  a.block = 0;
  const dealt = swing(e, a, 20);
  return { move: a.lastMove, scurry, dealt };
}
"""

# ── 2. Hidden is not invulnerability ────────────────────────────────────────
HIDDEN = r"""
async ([hide]) => {
  const e = make(['wardrobe-guest', 'pillow-puff'], { hp: 900 });
  await e.startCombat();
  const g = body(e, 'wardrobe-guest');
  if (hide) { g.history.length = 1; e.refreshIntents('probe'); await e.endTurn(); }
  const hidden = g.hasStatus('hidden');
  const aimable = canAim(e, g);
  const other = body(e, 'pillow-puff');
  return { hidden, aimable, otherAimable: canAim(e, other),
           moved: g.lastMove };
}
"""

# ── 3. the Creeper's Layers ─────────────────────────────────────────────────
LAYERS = r"""
async ([damage]) => {
  const e = make(['blanket-creeper'], { hp: 900 });
  await e.startCombat();
  const a = e.enemies[0];
  const layers0 = a.counters.layers;
  a.block = 0;
  if (damage) swing(e, a, damage, { ignoreBlock: true });
  e.player.block = 0;
  await e.endTurn();                          // its own turn re-Guards from Layers
  return { layers0, layers1: a.counters.layers, guard: a.block };
}
"""

UNCOVERED = r"""
async ([layers]) => {
  const e = make(['blanket-creeper'], { hp: 900 });
  await e.startCombat();
  const a = e.enemies[0];
  a.counters.layers = layers;
  a.history.length = layers >= 2 ? 1 : 0;     // both patterns reach Blanket Lash here
  e.refreshIntents('probe');
  return { layers, shown: intentOf(a) };
}
"""

# ── 4. Darkness ─────────────────────────────────────────────────────────────
DARK = r"""
async () => {
  const e = make(['nightlight-snuffer', 'pillow-puff'], { hp: 900 });
  await e.startCombat();
  const snuff = body(e, 'nightlight-snuffer');
  const puff = body(e, 'pillow-puff');
  /* Pin the SAME move on both sides of the Snuff. The Puff's cycle opens on
     Feather Cloud, which deals nothing, so an unpinned before/after compares
     two different moves and reads a 0 -> 7 that has nothing to do with
     Darkness. Pushing one move into its history puts Puff (5) next, both
     times. */
  puff.history.push('feather-cloud');
  e.refreshIntents('probe');
  const before = intentOf(puff);
  const shown = intentOf(snuff);
  e.player.block = 0;
  await e.endTurn();                          // Snuff
  const afterCast = { puff: puff.status('darkness'), snuff: snuff.status('darkness') };
  puff.history.length = 1;
  e.refreshIntents('probe');
  const during = intentOf(puff);
  e.player.block = 0;
  await e.endTurn();                          // one full phase later it expires
  const afterExpiry = puff.status('darkness');
  return { shown, before, afterCast, during, afterExpiry };
}
"""

DARK_DEATH = r"""
async () => {
  const e = make(['nightlight-snuffer', 'pillow-puff'], { hp: 900 });
  await e.startCombat();
  const snuff = body(e, 'nightlight-snuffer');
  const puff = body(e, 'pillow-puff');
  e.player.block = 0;
  await e.endTurn();
  const before = puff.status('darkness');
  e.loseHp(snuff, snuff.hp + 5, 'test');
  return { before, after: puff.status('darkness') };
}
"""

# ── 5. Thing Beneath: the interrupt is worth exactly one Scare ───────────────
BENEATH = r"""
async ([interrupt]) => {
  const e = make(['thing-beneath'], { hp: 900 });
  await e.startCombat();
  const a = e.enemies[0];
  for (let t = 0; t < 3; t++) { e.player.block = 0; await e.endTurn(); }
  const scareBefore = a.counters.scare;
  const shownBefore = intentOf(a);
  if (interrupt) { a.block = 0; swing(e, a, interrupt, { ignoreBlock: true }); }
  e.refreshIntents('probe');
  const shown = intentOf(a);
  const hp = e.player.hp;
  e.player.block = 0;
  await e.endTurn();                          // UNDER THE BED
  return { scareBefore, shownBefore, shown, scareAfterTurn: a.counters.scare,
           landed: hp - e.player.hp };
}
"""

# ── 6. the Night Terror shows both branches until you commit ────────────────
TERROR = r"""
async ([lead]) => {
  const e = make(['night-terror'], { hp: 900, energy: 99 });
  await e.startCombat();
  const a = e.enemies[0];
  const undecided = intentOf(a);
  const undecidedAlts = altsOf(e, a);
  let played = null;
  if (lead) {
    const c = e.piles.hand.find(x => x.type === lead
                                  && e.canPlay(x.uid, (e.firstLivingEnemy() || {}).id).ok);
    if (c) { await e.playCard(c.uid, (e.firstLivingEnemy() || {}).id ?? null); played = c.type; }
  }
  e.refreshIntents('probe');
  const decided = intentOf(a);
  const decidedAlts = altsOf(e, a);
  const guard0 = a.block;
  const hp = e.player.hp;
  e.player.block = 0;
  await e.endTurn();
  return { undecided, undecidedAlts, played, decided, decidedAlts,
           landed: hp - e.player.hp,
           guardGained: a.block - guard0, frightened: e.player.status('frightened') };
}
"""

# ── 7. the Hydra: heads, and the half-Courage line ──────────────────────────
HYDRA = r"""
async ([bodyHp]) => {
  const e = make(['blanket-hydra', 'hydra-head-snoring', 'hydra-head-biting',
                  'hydra-head-crying'], { hp: 1500 });
  await e.startCombat();
  const b = body(e, 'blanket-hydra');
  if (bodyHp) setHp(b, bodyHp);
  const bodyBefore = b.hp;
  const head = body(e, 'hydra-head-biting');
  e.loseHp(head, head.hp + 5, 'test');
  const bodyPaid = bodyBefore - b.hp;
  const queued = (b.mem.regrow || []).length;
  let back = 0;
  for (let t = 0; t < 4 && !e.over; t++) {
    e.player.block = 0;
    await e.endTurn();
    if (body(e, 'hydra-head-biting')) { back = t + 1; break; }
  }
  return { bodyPaid, queued, back, heads: b.counters.heads,
           frac: bodyBefore / b.maxHp };
}
"""

# ── 8. the Wardrobe: the Doors are the fight ────────────────────────────────
WARDROBE = r"""
async ([breakDoors]) => {
  const e = make(['the-wardrobe', 'wardrobe-door-left', 'wardrobe-door-right'],
                 { hp: 1500 });
  await e.startCombat();
  const w = body(e, 'the-wardrobe');
  const doors = ['wardrobe-door-left', 'wardrobe-door-right'];
  for (let i = 0; i < breakDoors; i++) {
    const d = body(e, doors[i]);
    if (d) e.loseHp(d, d.hp + 5, 'test');
  }
  const broken = w.mem.doorsBroken || 0;
  const aimable = canAim(e, w);
  w.block = 0;
  const dealt = aimable ? swing(e, w, 10, { ignoreBlock: true }) : 0;
  return { breakDoors, broken, aimable, dealt,
           standing: doors.filter(d => body(e, d)).length };
}
"""

WARDROBE_DESPAWN = r"""
async () => {
  const e = make(['the-wardrobe', 'wardrobe-door-left', 'wardrobe-door-right'],
                 { hp: 1500 });
  await e.startCombat();
  const w = body(e, 'the-wardrobe');
  e.player.block = 0;
  await e.endTurn();                          // Creak Open: a Door opens, a body arrives
  const own = e.enemies.filter(x => x.alive && x.summonedBy === w.id);
  const opened = ['wardrobe-door-left', 'wardrobe-door-right']
    .map(d => body(e, d)).filter(d => d && d.mem && d.mem.open).length;
  e.loseHp(w, w.hp + 5, 'test');
  const left = e.enemies.filter(x => x.alive && x.summonedBy === w.id).length;
  return { summoned: own.length, opened, leftAfterDeath: left };
}
"""

# ── 9. every formation resolves, and no phase takes more than it promised ────
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
        check(len(s["parts"]) == 5,
              "every Head and Door declares the body it belongs to",
              ", ".join(s["parts"]))

        # ══ 1. Scurry ══════════════════════════════════════════════════════
        stomped = await page.evaluate(SCURRY, [1])
        kicked = await page.evaluate(SCURRY, [2])
        hidsel = await page.evaluate(SCURRY, [3])
        check(stomped["scurry"] == 1 and kicked["scurry"] == 1,
              "every Skitter attack leaves Scurry up — one stack, never two "
              "(`stacks: false, max: 1`)",
              f"after {stomped['move']} {stomped['scurry']}, "
              f"after {kicked['move']} {kicked['scurry']}")
        check(stomped["dealt"] < 20,
              "and Scurry really cuts the player's Attack down",
              f"20 aimed, {stomped['dealt']} landed at 1 Scurry")
        check(hidsel["move"] == "hide-under-the-bed" and hidsel["scurry"] == 0,
              "CONTROL: Hide Under the Bed clears its own Scurry — 20 lands whole",
              f"{hidsel['move']}, scurry {hidsel['scurry']}, dealt {hidsel['dealt']}")
        check(hidsel["dealt"] > stomped["dealt"],
              "so the same swing lands harder the turn after it hides",
              f"{hidsel['dealt']} vs {stomped['dealt']}")

        # ══ 2. Hidden ══════════════════════════════════════════════════════
        out = await page.evaluate(HIDDEN, [False])
        inside = await page.evaluate(HIDDEN, [True])
        check(out["hidden"] is False and out["aimable"] is True,
              "the Guest can be attacked while it is out")
        check(inside["hidden"] is True and inside["aimable"] is False,
              "Back Inside really takes it off the target list",
              f"moved {inside['moved']}, hidden {inside['hidden']}")
        check(inside["otherAimable"] is True,
              "CONTROL: and hiding is not invulnerability for the ROOM — the other "
              "body is still a legal target",
              str(inside["otherAimable"]))

        # ══ 3. Layers ══════════════════════════════════════════════════════
        none = await page.evaluate(LAYERS, [0])
        under = await page.evaluate(LAYERS, [9])
        over = await page.evaluate(LAYERS, [10])
        check(none["layers0"] == 3 and none["layers1"] == 3,
              "an untouched Creeper keeps all three Layers", json.dumps(none))
        check(under["layers1"] == 3,
              "CONTROL: 9 damage in a turn takes none of them off",
              f"{under['layers0']} -> {under['layers1']}")
        check(over["layers1"] == 2, "10 takes exactly one",
              f"{over['layers0']} -> {over['layers1']}")
        check(none["guard"] - over["guard"] == 4,
              "and its Guard is 4 per Layer, so stripping one is visibly worth 4 "
              "(the Wrap Up it also plays adds a flat 6 to both)",
              f"3 layers {none['guard']}, 2 layers {over['guard']}")
        armoured = await page.evaluate(UNCOVERED, [2])
        bare = await page.evaluate(UNCOVERED, [0])
        check(armoured["shown"]["damage"] == 8 and bare["shown"]["damage"] == 10,
              "Uncovered really adds 2 to what it is showing",
              f"{armoured['shown']['damage']} -> {bare['shown']['damage']}")

        # ══ 4. Darkness ════════════════════════════════════════════════════
        d = await page.evaluate(DARK)
        check(d["afterCast"]["puff"] == 2 and d["afterCast"]["snuff"] == 0,
              "Snuff gives every OTHER enemy 2 Darkness and never itself",
              json.dumps(d["afterCast"]))
        check(d["during"]["damage"] == d["before"]["damage"] + 2,
              "so the ally's promise really rises by 2",
              f"{d['before']['damage']} -> {d['during']['damage']}")
        check(d["afterExpiry"] == 0,
              "and it expires one full enemy phase later, never mid-phase",
              f"{d['afterExpiry']} stacks after the next phase")
        dd = await page.evaluate(DARK_DEATH)
        check(dd["before"] == 2 and dd["after"] == 0,
              "killing the Snuffer puts the light back on immediately",
              json.dumps(dd))

        # ══ 5. Thing Beneath ═══════════════════════════════════════════════
        left = await page.evaluate(BENEATH, [0])
        hit = await page.evaluate(BENEATH, [15])
        soft = await page.evaluate(BENEATH, [14])
        check(left["shownBefore"]["move"] == "under-the-bed" and left["scareBefore"] == 3,
              "three turns of scratching reaches full Scare and telegraphs UNDER THE BED",
              f"scare {left['scareBefore']}, showing {left['shownBefore']['move']}")
        check(left["shown"]["damage"] == 26 and hit["shown"]["damage"] == 20,
              "15 damage in one turn drops the number it is showing by exactly 6",
              f"{left['shown']['damage']} -> {hit['shown']['damage']}")
        check(soft["shown"]["damage"] == 26,
              "CONTROL: 14 is not enough and the number does not move",
              f"{soft['shown']['damage']}")
        check(left["landed"] == 26 and hit["landed"] == 20,
              "and each lands the number it showed",
              f"{left['landed']} / {hit['landed']}")

        # ══ 6. the Night Terror's branch ═══════════════════════════════════
        blank = await page.evaluate(TERROR, [None])
        att = await page.evaluate(TERROR, ["attack"])
        skill = await page.evaluate(TERROR, ["skill"])
        check(blank["undecidedAlts"] == ["recoil", "lunge"],
              "before a card is played it shows BOTH futures side by side",
              str(blank["undecidedAlts"]))
        check(att["decidedAlts"] == ["recoil"],
              "leading with an Attack collapses it to Recoil",
              str(att["decidedAlts"]))
        check(att["landed"] == 0 and att["guardGained"] >= 14 and att["frightened"] >= 1,
              "which is 14 Guard and a Frightened rather than a hit",
              f"landed {att['landed']}, guard +{att['guardGained']}, "
              f"frightened {att['frightened']}")
        check(skill["decidedAlts"] == ["lunge"] and skill["landed"] == 14,
              "CONTROL: leading with a Skill collapses it to a 14-damage Lunge instead",
              f"{skill['decidedAlts']}, landed {skill['landed']}")
        check(blank["landed"] == 14,
              "and playing nothing at all is a Lunge too — the default is never a surprise",
              f"landed {blank['landed']}")

        # ══ 7. the Hydra ═══════════════════════════════════════════════════
        healthy = await page.evaluate(HYDRA, [0])
        dying = await page.evaluate(HYDRA, [40])
        check(healthy["bodyPaid"] == 10,
              "killing a Head costs the body exactly 10",
              f"-{healthy['bodyPaid']}")
        check(healthy["queued"] == 1 and healthy["back"] > 0,
              "and above half Courage the Head really comes back",
              f"queued {healthy['queued']}, back on enemy turn {healthy['back']}")
        check(dying["queued"] == 0 and dying["back"] == 0,
              "CONTROL: below half Courage a dead Head stays dead",
              f"body at {round(dying['frac'] * 100)}% of its pool, "
              f"queued {dying['queued']}")

        # ══ 8. the Wardrobe ════════════════════════════════════════════════
        shut = await page.evaluate(WARDROBE, [0])
        one = await page.evaluate(WARDROBE, [1])
        both = await page.evaluate(WARDROBE, [2])
        check(shut["aimable"] is False and shut["broken"] == 0,
              "with both Doors standing the body cannot be aimed at",
              json.dumps(shut))
        check(one["broken"] == 1 and one["aimable"] is True,
              "breaking one Door opens it up",
              json.dumps(one))
        check(both["broken"] == 2 and both["dealt"] == 12,
              "and with both broken it takes 20% more — 10 aimed lands as 12",
              f"{both['dealt']} from a 10 with {both['broken']} Doors broken")
        check(one["dealt"] == 10,
              "CONTROL: with one Door still standing the same 10 lands as 10",
              f"{one['dealt']}")
        w = await page.evaluate(WARDROBE_DESPAWN)
        check(w["summoned"] >= 1 and w["opened"] >= 1,
              "Creak Open really opens a Door and really produces a body",
              json.dumps(w))
        check(w["leftAfterDeath"] == 0,
              "and everything it called up leaves with it",
              f"{w['leftAfterDeath']} still standing")

        # ══ 9. every formation in the region ═══════════════════════════════
        ids = await page.evaluate(
            "() => window.__S.enc.ENCOUNTER_LIST"
            ".filter(x => x.region === 'sleeping-quarters').map(x => x.id)")
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
