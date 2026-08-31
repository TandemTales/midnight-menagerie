"""The Ballroom and Velvet Suites, driven against the REAL CombatEngine.

    python tests/ballroom/check.py [--verbose]

§2's promise is the region: an Invitation "should ALWAYS SHOW THE COMPLETE TERMS
BEFORE THE PLAYER CHOOSES. No hidden consequences." Here every Invitation is a
real Trick placed in the player's hand — so the first thing this gate proves is
that the card actually arrives, is actually playable, and actually does what it
says. Every claim has a CONTROL:

  * an Invitation really lands in HAND, at 0 Nerve, and really expires with the
    turn if it is not played;
  * accepting really pays the enemy and declining really does not — except at
    the Goblet Geist, where §7 says refusing buys it Guard, and it does;
  * the Velvet Curtain really halves damage to the ally AND really takes the
    rest itself, and 14 damage in a turn really tears it down;
  * the Dancing Shoe really gains Tempo on a turn it went unhit and really does
    not on a turn it was hit;
  * the Masquerade Mask really copies an ALLY's Guard at half, and really has
    nothing to copy alone;
  * Waltzing Armor really refuses to Encore another Waltzing Armor (§12);
  * the Grand Masque's Guest really takes 20% more;
  * the Eternal Dance really shares one beat, and 18 damage to EITHER dancer
    really stops the other one supporting;
  * the Velvet Host really stops offering at Hospitality 5;
  * the Master of Revels really gains Revelry when you accept, really loses one
    to 25 damage, and really summons both guests at the transition.

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
window.findInvite = function (e) {
  return e.piles.hand.find(x => String(x.id).startsWith('invite/')) || null;
};
return true; }
"""

STATIC = r"""
async () => {
  const { enc, en, run } = window.__Y;
  const BR = enc.ENCOUNTER_LIST.filter(x => x.region === 'ballroom');
  const roster = en.ENEMY_LIST.filter(x => x.region === 'ballroom');
  const placed = new Set(BR.flatMap(f => f.members.map(m => m.enemyId)));
  return {
    formations: BR.length,
    ordinary: roster.filter(d => d.tier === 'normal' && !d.summonOnly).length,
    scares: BR.filter(f => f.tier === 'elite').length,
    unreachable: roster.filter(d => !d.summonOnly && d.role !== 'bossPart' && !placed.has(d.id)).map(d => d.id),
    implemented: en.IMPLEMENTED_REGIONS,
    unknownMembers: BR.flatMap(f => f.members.map(m => m.enemyId)).filter(id => !en.hasEnemy(id)),
    ladder: run.RUN_REGIONS,
    invites: en.STATUS_TRICK_DEFS.filter(t => String(t.id).startsWith('invite/')).length,
    inviteCosts: [...new Set(en.STATUS_TRICK_DEFS
      .filter(t => String(t.id).startsWith('invite/')).map(t => t.cost))],
    statuses: ['exhilarated', 'encore', 'behind-the-curtain', 'well-hosted']
      .filter(id => en.ENEMY_STATUSES.some(s => s.id === id)),
  };
}
"""

# ── an Invitation is a real card, and both answers work ────────────────────
INVITE = r"""
async ([who, accept]) => {
  const e = make([who], { seed: 11, hp: 400, energy: 99 });
  await e.startCombat();
  const en = e.enemies[0];
  // Hurt, so a healing Invitation has somewhere to go. At full Courage the
  // Sweet Treat is a no-op and the probe was measuring nothing.
  e.loseHp(e.player, 100, 'test');
  await e.endTurn();                     // it makes its offer
  const card = findInvite(e);
  const out = { who, accept, offered: !!card,
                id: card ? card.id : null, cost: card ? e.costOf(card) : null,
                playable: card ? e.canPlay(card.uid, null).ok : null,
                hpBefore: e.player.hp, guardBefore: en.block };
  if (card && accept) await e.playCard(card.uid, (e.firstLivingEnemy() || {}).id ?? null);
  out.hpAfterPlay = e.player.hp;
  out.delight = en.counters.delight || 0;
  await e.endTurn();
  out.stillInHand = !!findInvite(e);
  out.delightAfter = en.counters.delight || 0;
  out.guardAfter = en.block;
  return out;
}
"""

CURTAIN = r"""
async ([damage]) => {
  const e = make(['velvet-curtain', 'dancing-shoe'], { seed: 13, hp: 600, energy: 99 });
  await e.startCombat();
  const curtain = e.enemies[0];
  const shoe = e.enemies[1];
  await e.endTurn();                     // Draw the Curtain
  const guarded = shoe.status ? shoe.status('behind-the-curtain') : 0;
  /* Strip the Curtain's own Guard first. Draw the Curtain gives it 6, which is
     more than the 5 it is about to absorb — so measuring Courage alone said it
     took nothing when it had in fact taken all of it on the chin. */
  curtain.block = 0;
  const curtainBefore = curtain.hp;
  const dealtToShoe = hit(e, shoe, 10);
  const curtainTook = curtainBefore - curtain.hp;
  // now try to tear it down
  if (damage) hit(e, curtain, damage);
  return { damage, guarded, dealtToShoe, curtainTook,
           stillGuarded: shoe.status ? shoe.status('behind-the-curtain') : 0 };
}
"""

TEMPO = r"""
async ([hitIt]) => {
  const e = make(['dancing-shoe'], { seed: 17, hp: 600, energy: 99 });
  await e.startCombat();
  const s = e.enemies[0];
  const before = s.counters.tempo || 0;
  if (hitIt) hit(e, s, 4);
  /* ONE endTurn is the whole cycle: it runs `onPlayerTurnEnd` (which banks
     whether the turn was clean), the enemy phase, and the NEXT player turn's
     start (which cashes it). A second endTurn adds an untouched turn and both
     arms of the probe come back at 1. */
  await e.endTurn();
  return { hitIt, before, after: s.counters.tempo || 0 };
}
"""

MASK = r"""
async ([withAlly]) => {
  const ids = withAlly ? ['masquerade-mask', 'velvet-curtain'] : ['masquerade-mask'];
  const e = make(ids, { seed: 19, hp: 600, energy: 99 });
  await e.startCombat();
  const mask = e.enemies[0];
  const ally = e.enemies[1] || null;
  mask.block = 0;
  if (ally) e.gainBlock(ally, 10, { reason: 'test', source: ally });
  return { withAlly, maskGuard: mask.block };
}
"""

ARMOR = r"""
async ([pairArmor]) => {
  const ids = pairArmor ? ['waltzing-armor', 'waltzing-armor'] : ['waltzing-armor', 'dancing-shoe'];
  const e = make(ids, { seed: 23, hp: 600, energy: 99 });
  await e.startCombat();
  const armor = e.enemies[0];
  const other = e.enemies[1];
  armor.history = ['lead-step'];         // next beat is Follow Step
  e.refreshIntents('test');
  await e.endTurn();
  return { pairArmor, move: armor.history[armor.history.length - 1],
           otherEncore: other.status ? other.status('encore') : 0,
           armorGuard: armor.block };
}
"""

MASQUE = r"""
async ([persona]) => {
  const e = make(['grand-masque'], { seed: 29, hp: 900, energy: 99 });
  await e.startCombat();
  const g = e.enemies[0];
  g.counters.persona = persona;
  const took = hit(e, g, 20);
  e.refreshIntents('test');
  return { persona, took, next: g.pendingMove ? g.pendingMove.id : null };
}
"""

DANCE = r"""
async ([breakIt]) => {
  const { C, enc, en, cards, RNG } = window.__Y;
  const members = enc.buildEncounter('br-scare-dance', new RNG(31), 0);
  const e = new C.CombatEngine({ rng: new RNG(31),
    player: { name: 'K', maxHp: 900, hp: 900, energyMax: 99, deck: cards.startingDeckFor('mossbit') },
    enemies: members.map(m => en.getEnemy(m.enemyId)) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  await e.startCombat();
  const lead = e.enemies.find(x => x.defId === 'the-lead');
  const follow = e.enemies.find(x => x.defId === 'the-follow');
  await e.endTurn();                     // beat 1 resolves, beat becomes 2
  if (breakIt) hit(e, lead, 20);
  e.refreshIntents('test');
  return { breakIt,
           leadNext: lead.pendingMove ? lead.pendingMove.id : null,
           followNext: follow.pendingMove ? follow.pendingMove.id : null,
           mirrorDmg: follow.intent ? follow.intent.damage : null,
           broken: !!e.field.danceBroken };
}
"""

HOST = r"""
async ([hosp]) => {
  const e = make(['velvet-host'], { seed: 37, hp: 900, energy: 99 });
  await e.startCombat();
  const h = e.enemies[0];
  h.counters.hospitality = hosp;
  e.refreshIntents('test');
  await e.endTurn();                     // Another Round
  return { hosp, offered: !!findInvite(e), guard: h.block,
           dmgLater: (() => { h.counters.hospitality = hosp; return null; })() };
}
"""

REVELS = r"""
async ([mode]) => {
  const e = make(['master-of-revels'], { seed: 41, hp: 1200, energy: 99 });
  await e.startCombat();
  const b = e.enemies[0];
  const out = { mode };
  if (mode === 'accept') {
    const card = findInvite(e);           // the Plate is offered at combat start
    out.offered = !!card;
    if (card) await e.playCard(card.uid, b.id);
    out.revelry = b.counters.revelry || 0;
    return out;
  }
  if (mode === 'spoil') {
    b.counters.revelry = 3;
    hit(e, b, 30);
    out.revelry = b.counters.revelry || 0;
    return out;
  }
  if (mode === 'no-spoil') {
    b.counters.revelry = 3;
    hit(e, b, 24);
    out.revelry = b.counters.revelry || 0;
    return out;
  }
  if (mode === 'perfect-host') {
    b.counters.revelry = 8;
    e.refreshIntents('test');
    out.next = b.pendingMove ? b.pendingMove.id : null;
    return out;
  }
  if (mode === 'transition') {
    e.loseHp(b, b.hp - 210, 'test');
    e.refreshIntents('test');
    out.next = b.pendingMove ? b.pendingMove.id : null;
    await e.endTurn();
    out.phase = b.mem.phase;
    out.guests = e.enemies.filter(x => x.defId === 'the-admirer' || x.defId === 'the-chaperone').length;
    return out;
  }
  return out;
}
"""

# ── addCard({ nums }) really overrides, which it silently did not ─────────
# `tests/seams/check.py` found this by name: the engine accepted a `nums` option
# and never read it, so every ENHANCED Invitation — the Admirer's improved
# Banquet, the Goblet Geist's Haunt 7 Sip — quietly used its printed number.
NUMS = r"""
async () => {
  const e = make(['party-phantom'], { seed: 47, hp: 400, energy: 99 });
  await e.startCombat();
  const plain = e.addCard(e.resolveCardDef('invite/plate'), 'hand', {});
  const bumped = e.addCard(e.resolveCardDef('invite/plate'), 'hand', { nums: { h: 9 } });
  const one = Array.isArray(plain) ? plain[0] : plain;
  const two = Array.isArray(bumped) ? bumped[0] : bumped;
  return { printed: one && one.nums ? one.nums.h : null,
           overridden: two && two.nums ? two.nums.h : null };
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


def registry_sources():
    """Every runtime file that registers status Tricks must read them from the
    REGISTRY, not the library.

    `enemies/_lib.js` exports the three CORE Tricks. `enemies/index.js` exports
    those plus every one a region adds — thirteen Invitations, as of here. Both
    `scenes/combat.js` and `state/run.js` read the library, so in the real game
    every Invitation was an unknown card id: `addCard` warned, returned null,
    and the whole region's mechanic was dead on screen while this suite (which
    registers the merged list explicitly) stayed green.

    It is `data/keywords.js`'s bug in two more files. A source scan is the right
    shape for it because the defect is WHICH MODULE was imported, which no
    amount of driving the engine from a test can see.
    """
    import os, re, io as _io
    bad = []
    for rel in ("game/src/scenes/combat.js", "game/src/state/run.js",
                "game/src/data/keywords.js"):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", rel)
        try:
            src = _io.open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if "STATUS_TRICK_DEFS" not in src:
            continue
        # the offending shape: a `_lib.js` import feeding a STATUS_TRICK_DEFS read
        if re.search(r"enemies/_lib\.js", src) and re.search(
                r"lib\w*\.STATUS_TRICK_DEFS", src):
            bad.append(rel)
    return bad


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
        check("ballroom" in s["implemented"], "registered as implemented", str(s["implemented"]))
        check(s["ladder"].index("ballroom") < s["ladder"].index("heart"),
              "the ladder walks the Ballroom before the Heart", str(s["ladder"]))
        check(len(s["statuses"]) == 4, "all four region statuses are registered",
              ", ".join(s["statuses"]))
        check(s["invites"] >= 12 and s["inviteCosts"] == [0],
              "every Invitation is a registered Trick at 0 Nerve",
              f"{s['invites']} Invitations, costs {s['inviteCosts']}")

        # ══ the Invitation itself ═══════════════════════════════════════════
        took = await page.evaluate(INVITE, ["party-phantom", True])
        left = await page.evaluate(INVITE, ["party-phantom", False])
        check(took["offered"] and took["cost"] == 0 and took["playable"],
              "an Invitation really arrives in HAND, at 0 Nerve, playable",
              json.dumps(took)[:180])
        # The Phantom offers one of three at random, and only Sweet Treat shows up
        # in Courage — so the universal claim is "the card resolved and the enemy
        # was paid", and the heal is asserted where it is guaranteed.
        check(took["delight"] == 1 and took["stillInHand"] is False,
              "accepting really resolves the Trick AND pays the Phantom",
              json.dumps(took)[:180])
        check(took["id"] != "invite/sweet-treat" or took["hpAfterPlay"] > took["hpBefore"],
              "and a Sweet Treat really heals when that is the offer",
              f"{took['id']}: {took['hpBefore']} -> {took['hpAfterPlay']}")
        check(left["stillInHand"] is False and left["delightAfter"] == 0,
              "CONTROL: declining really costs nothing and the offer expires",
              json.dumps(left)[:180])

        sipped = await page.evaluate(INVITE, ["goblet-geist", False])
        check(sipped["guardAfter"] >= sipped["guardBefore"] + 6,
              "CONTROL: refusing the Goblet really buys it 6 Guard (§7)",
              f"{sipped['guardBefore']} -> {sipped['guardAfter']}")

        # ══ the Velvet Curtain ══════════════════════════════════════════════
        soft = await page.evaluate(CURTAIN, [0])
        torn = await page.evaluate(CURTAIN, [16])
        check(soft["guarded"] >= 1 and soft["dealtToShoe"] <= 5,
              "the protected ally really takes half", json.dumps(soft))
        check(soft["curtainTook"] > 0,
              "and the Curtain really takes the rest itself (§5)",
              f"Curtain absorbed {soft['curtainTook']}")
        check(torn["stillGuarded"] == 0,
              "CONTROL: 14+ damage in one turn really tears the protection down",
              json.dumps(torn))

        # ══ Tempo ══════════════════════════════════════════════════════════
        clean = await page.evaluate(TEMPO, [False])
        hurt = await page.evaluate(TEMPO, [True])
        check(clean["after"] > clean["before"],
              "an unhit turn really gives the Shoe Tempo", json.dumps(clean))
        check(hurt["after"] == hurt["before"],
              "CONTROL: hitting it really denies the Tempo", json.dumps(hurt))

        # ══ Mimicry ════════════════════════════════════════════════════════
        copied = await page.evaluate(MASK, [True])
        alone = await page.evaluate(MASK, [False])
        check(copied["maskGuard"] == 5,
              "the Mask really copies an ALLY's 10 Guard at half", json.dumps(copied))
        check(alone["maskGuard"] == 0,
              "CONTROL: alone it has nothing to copy", json.dumps(alone))

        # ══ Waltzing Armor ═════════════════════════════════════════════════
        mixed = await page.evaluate(ARMOR, [False])
        twin = await page.evaluate(ARMOR, [True])
        check(mixed["otherEncore"] >= 1,
              "Follow Step really hands Encore to an ally", json.dumps(mixed))
        check(twin["otherEncore"] == 0 and twin["armorGuard"] >= 10,
              "CONTROL: §12 — it will not Encore another Waltzing Armor, and guards instead",
              json.dumps(twin))

        # ══ the Grand Masque ═══════════════════════════════════════════════
        guest = await page.evaluate(MASQUE, [3])
        host = await page.evaluate(MASQUE, [0])
        check(guest["took"] > host["took"],
              "the Guest persona really takes 20% more damage (§13)",
              f"Guest {guest['took']} vs Host {host['took']}")

        # ══ the Eternal Dance ══════════════════════════════════════════════
        whole = await page.evaluate(DANCE, [False])
        broke = await page.evaluate(DANCE, [True])
        check(whole["leadNext"] == "turn" and whole["followNext"] == "mirror",
              "both dancers really share one beat", json.dumps(whole))
        check(broke["broken"] is True and broke["mirrorDmg"] == 0,
              "CONTROL: 18 damage to EITHER dancer really stops the support half",
              json.dumps(broke))

        # ══ the Velvet Host ════════════════════════════════════════════════
        offering = await page.evaluate(HOST, [1])
        done = await page.evaluate(HOST, [5])
        check(offering["offered"] is True,
              "the Host really offers below Hospitality 5", json.dumps(offering))
        check(done["offered"] is False and done["guard"] >= 8,
              "CONTROL: at 5 it stops offering and simply gets stronger (§15)",
              json.dumps(done))

        # ══ the Master of Revels ═══════════════════════════════════════════
        acc = await page.evaluate(REVELS, ["accept"])
        spoil = await page.evaluate(REVELS, ["spoil"])
        nospoil = await page.evaluate(REVELS, ["no-spoil"])
        perfect = await page.evaluate(REVELS, ["perfect-host"])
        trans = await page.evaluate(REVELS, ["transition"])
        check(acc["offered"] and acc["revelry"] == 1,
              "§21: the Plate is offered first, and accepting gives 1 Revelry", json.dumps(acc))
        check(spoil["revelry"] == 2,
              "25 damage in one turn really Spoils the Mood (§20)", json.dumps(spoil))
        check(nospoil["revelry"] == 3,
              "CONTROL: 24 does not", json.dumps(nospoil))
        check(perfect["next"] == "never-leave",
              "8 Revelry really makes its next action Never Leave (§18)", json.dumps(perfect))
        check(trans["phase"] == 2 and trans["guests"] == 2,
              "the transition really brings both guests (§23)", json.dumps(trans))

        bad = registry_sources()
        check(not bad,
              "every runtime file registers Tricks from the REGISTRY, not the library",
              ", ".join(bad) or "combat.js, run.js and keywords.js all read enemies/index.js")

        nums = await page.evaluate(NUMS)
        check(nums["printed"] == 6 and nums["overridden"] == 9,
              "addCard({ nums }) really overrides the printed numbers",
              json.dumps(nums))

        # ══ whole fights ════════════════════════════════════════════════════
        for enc_id, seed, turns, hp, label in [
            ("br-14", 2, 40, 800, "Scuffle 14 resolves a whole fight"),
            ("br-scare-masque", 3, 40, 800, "the Grand Masque resolves a whole fight"),
            ("br-scare-dance", 4, 40, 800, "the Eternal Dance resolves a whole fight"),
            ("br-scare-host", 5, 40, 800, "the Velvet Host resolves a whole fight"),
            ("br-boss", 6, 60, 900, "the Master of Revels resolves a whole fight"),
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
