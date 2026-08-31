"""Every boss must actually hit harder at higher Haunt, on the intent and on the hit.

    python tests/boss-haunt/check.py [--verbose]

WHY THIS EXISTS
---------------
`hauntBase(level, 'boss')` is the whole of boss Haunt scaling. Bosses came off
the Courage ramp in 2026-08-20 round 4 — measured, it bought difficulty in the
one currency that also buys LENGTH — and the difficulty they lost was bought
back through `dmgBonus`, which is Courage-neutral:

    Boss pressure: +1 damage per hit every third Haunt level, applied by each
    boss's own damage path so it shows up in the intent as well as the hit.

"Applied by each boss's own damage path" is a CONTRACT, and `_lib.js` states it
in as many words: "Bosses must apply this in BOTH their `damageFn` and their
`effect`, or the intent stops telling the truth." Nothing enforced it. Counted
2026-08-31, FIVE of the seventeen never call `bossDmg` at all — the
Confectioner, the Drowned Matron, the Harvest King, the Kennelmaster and the
Whisper Warden. Every one of them still returns the envelope, so every one of
them prints a Haunt note promising "every boss attack hits for N more per hit"
and then does not.

It went unseen because the two instruments that could have caught it both look
elsewhere. `tests/haunt/run.py` checks the SHAPE of the envelope objects and
never plays a fight. `tests/enemies/audit.py` plays 19,000 fights and compares
the intent to the hit — at HAUNT 0, where `dmgBonus` is 0 by construction and
the whole term is invisible.

So this suite drives the real `CombatEngine` at two Haunt levels and compares:

  * Haunt 2 and Haunt 3 differ by exactly one thing in the envelope, `dmgBonus`
    0 -> 1, which is checked first so the comparison below means anything;
  * every boss ATTACK intent must read exactly 1 more per hit at Haunt 3;
  * and the damage that LANDS must move with it, so a boss cannot satisfy the
    first half by decorating an intent it does not keep.

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
  const [C, enc, en, st, cards, kw, lib] = await Promise.all([
    import('/game/src/combat/engine.js'),
    import('/game/src/data/encounters.js'),
    import('/game/src/data/enemies/index.js'),
    import('/game/src/combat/statuses.js'),
    import('/game/src/data/cards.js'),
    import('/game/src/data/keywords.js'),
    import('/game/src/data/enemies/_lib.js'),
  ]);
  await kw.loadContentRegistries();
  st.registerStatuses(en.ENEMY_STATUSES);
  window.__H = { C, enc, en, st, cards, lib };
  window.__H.RNG = (await import('/game/src/core/rng.js')).RNG;
  return true;
}
"""

# The envelope, so the comparison below is known to isolate one term.
ENVELOPES = r"""
async ([lo, hi]) => {
  const { enc, en } = window.__H;
  const bosses = enc.ENCOUNTER_LIST.filter(x => x.tier === 'boss');
  const rows = [];
  for (const f of bosses) {
    for (const m of f.members) {
      const def = en.getEnemy(m.enemyId);
      if (!def || typeof def.hauntScaling !== 'function') continue;
      const a = def.hauntScaling(lo), b = def.hauntScaling(hi);
      const diff = [];
      const cmp = (k, x, y) => {
        if (JSON.stringify(x) !== JSON.stringify(y)) diff.push(k);
      };
      cmp('hpMul', a.hpMul, b.hpMul);
      cmp('counters', a.counters, b.counters);
      cmp('moves', a.moves, b.moves);
      cmp('advanced', a.advanced, b.advanced);
      const fa = { ...a.flags }, fb = { ...b.flags };
      const bonusA = fa.dmgBonus || 0, bonusB = fb.dmgBonus || 0;
      delete fa.dmgBonus; delete fb.dmgBonus;
      cmp('flags', fa, fb);
      rows.push({ enc: f.id, def: m.enemyId, tier: def.tier || 'normal',
                  bonusA, bonusB, diff });
    }
  }
  return rows;
}
"""

# What one boss's attacks read, and what they land, at a given Haunt level.
ATTACKS = r"""
async ([encId, haunt, turns]) => {
  const { C, enc, en, cards, RNG } = window.__H;
  const members = enc.buildEncounter(encId, new RNG(9), haunt);
  const e = new C.CombatEngine({ rng: new RNG(9),
    player: { name: 'K', maxHp: 100000, hp: 100000, energyMax: 0, deck: [] },
    enemies: members.map((m, i) => ({ def: en.getEnemy(m.enemyId), hp: m.hp, id: `e${i}` })) });
  e.registerCards(cards.allCards());
  e.registerCards(en.STATUS_TRICK_DEFS);
  e.registerEnemies(en.ENEMY_LIST);
  /* `buildEncounter` RETURNS the Haunt counters and behavioural flags; it does
     not apply them, and `getEnemy(id)` hands back the bare def. `state/run.js`
     copies them onto the built actors after construction and this has to do the
     same, or every probe measures Haunt 0 whatever level it asked for. */
  e.enemies.forEach((a, i) => {
    const m = members[i];
    if (!m) return;
    if (m.counters) a.counters = { ...(a.counters || {}), ...m.counters };
    if (m.flags) a.flags = { ...(a.flags || {}), ...m.flags };
  });
  /* A player who never acts, so nothing the boss does is a reaction to play and
     the two Haunt levels walk the SAME script. Courage is enormous so the fight
     runs its whole cycle; `_losePatience` is far past `turns`. */
  await e.startCombat();
  const seen = {};        // moveId -> { perHit, hits, landed }
  let n = 0;
  while (!e.over && n++ < turns) {
    const promises = [];
    for (const a of e.enemies) {
      if (!a.alive || !a.intent) continue;
      const d = a.intent.damage;
      if (typeof d !== 'number' || d <= 0) continue;
      promises.push({ actor: a.id, def: a.defId, move: a.intent.moveId,
                      perHit: d, hits: a.intent.hits || 1 });
    }
    const before = e.player.hp;
    e.player.block = 0;
    await e.endTurn();
    const took = before - e.player.hp;
    const want = promises.reduce((s, p) => s + p.perHit * p.hits, 0);
    for (const p of promises) {
      const key = `${p.def}/${p.move}`;
      const row = seen[key] || (seen[key] = { perHit: p.perHit, hits: p.hits, n: 0,
                                              promised: 0, landed: 0 });
      row.n++;
      row.promised += p.perHit * p.hits;
    }
    // Attribute the whole turn only when ONE attack was promised; otherwise the
    // per-move split is guesswork and the totals are compared instead.
    if (promises.length === 1) {
      const key = `${promises[0].def}/${promises[0].move}`;
      seen[key].landed += took;
    }
    seen.__total = seen.__total || { promised: 0, landed: 0 };
    seen.__total.promised += want;
    seen.__total.landed += took;
  }
  return { encId, haunt, turns: e.turn, moves: seen };
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
        await page.wait_for_timeout(1000)
        await page.evaluate(BOOT)

        # ══ pick a level pair that isolates the damage bonus ═══════════════
        #
        # `dmgBonus` is floor(level/3), so it steps at 2->3, 5->6 and 8->9. A
        # boss may legitimately change something ELSE at one of those steps —
        # the Confectioner's Recipe stops caring about repeated Ingredients at
        # Haunt 3 — and a comparison across that step measures two things at
        # once. So each boss gets the first step at which its own envelope moves
        # NOTHING but the bonus, and a boss with no clean step is a finding.
        PAIRS = [(2, 3), (5, 6), (8, 9)]
        env_by_pair = {}
        for pair in PAIRS:
            env_by_pair[pair] = await page.evaluate(ENVELOPES, list(pair))
        bosses = sorted({r["enc"] for r in env_by_pair[PAIRS[0]]})
        check(len(bosses) == 17, "all seventeen bosses load", f"{len(bosses)} boss formations")

        bodies = [r for r in env_by_pair[PAIRS[0]] if r["tier"] == "boss"]
        check(all(r["bonusB"] - r["bonusA"] == 1 for r in bodies),
              "every boss BODY gains exactly 1 per hit at each third Haunt level",
              ", ".join(f"{r['def']} {r['bonusA']}->{r['bonusB']}"
                        for r in bodies if r["bonusB"] - r["bonusA"] != 1)
              or f"{len(bodies)} bodies")

        clean, dirty = {}, []
        for enc_id in bosses:
            got = None
            for pair in PAIRS:
                rows = [r for r in env_by_pair[pair] if r["enc"] == enc_id]
                if not any(r["diff"] for r in rows):
                    got = pair
                    break
            if got:
                clean[enc_id] = got
            else:
                dirty.append(enc_id)
        check(not dirty,
              "and every boss has a Haunt step at which NOTHING else in its "
              "envelope moves, so the comparison below isolates the bonus",
              ", ".join(dirty) or "; ".join(f"{k} at {v[0]}->{v[1]}"
                                            for k, v in list(clean.items())[:3]) + " …")

        # Which actors the envelope actually hands a bonus to — a summoned Dust
        # Bunny in the Butler's fight is tier 'normal' and correctly gets none.
        boosted = {}
        for enc_id, pair in clean.items():
            boosted[enc_id] = {r["def"] for r in env_by_pair[pair]
                               if r["enc"] == enc_id and r["bonusB"] - r["bonusA"] == 1}

        # ══ every boss attack really reads and lands 1 more ════════════════
        bad_intent, bad_land, checked = [], [], 0
        for enc_id in bosses:
            pair = clean.get(enc_id) or (2, 3)
            lo = await page.evaluate(ATTACKS, [enc_id, pair[0], 14])
            hi = await page.evaluate(ATTACKS, [enc_id, pair[1], 14])
            want = boosted.get(enc_id, set())
            shared = [k for k in lo["moves"]
                      if k != "__total" and k in hi["moves"]
                      and k.split("/")[0] in want]
            moved = 0
            for k in shared:
                a0, a1 = lo["moves"][k], hi["moves"][k]
                if a0["hits"] != a1["hits"]:
                    continue                      # the shape changed; not comparable
                checked += 1
                if a1["perHit"] == a0["perHit"] + 1:
                    moved += 1
                elif a1["perHit"] != a0["perHit"]:
                    bad_intent.append(f"{enc_id} {k}: {a0['perHit']} -> {a1['perHit']} "
                                      f"(expected +1)")
                else:
                    bad_intent.append(f"{enc_id} {k}: {a0['perHit']} at both Haunt 2 "
                                      f"and Haunt 3 — the bonus is never applied")
            # The damage that landed has to move with the promise.
            t0, t1 = lo["moves"].get("__total"), hi["moves"].get("__total")
            if t0 and t1 and t0["promised"] and t1["promised"]:
                if t1["landed"] <= t0["landed"] and t1["promised"] > t0["promised"]:
                    bad_land.append(f"{enc_id}: promised {t0['promised']} -> "
                                    f"{t1['promised']} but landed "
                                    f"{t0['landed']} -> {t1['landed']}")
            if a.verbose:
                print(f"   {enc_id}: {moved}/{len(shared)} attack moves gained 1")

        check(not bad_intent,
              "every boss attack reads exactly 1 more per hit at Haunt 3",
              "; ".join(bad_intent) or f"{checked} moves compared")
        check(not bad_land,
              "and the Courage that lands moves with the promise",
              "; ".join(bad_land[:4]) or f"{len(bosses)} fights")

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
