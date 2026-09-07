"""Replay ONE seeded expedition and print, per fight, what `run.py`'s summary
columns cannot separate.

    python tests/run/probe.py 124                 # seed index -> seed 957908
    python tests/run/probe.py 124 --min-turns 20  # only the long fights
    python tests/run/probe.py 124 --turns         # add the per-round table

WHY THIS EXISTS.  `run.py` reports a fight as `wall 10.3  land 3.3` and that
ratio reads as a board re-raising Guard three times faster than the deck gets
through it.  Four sessions have named a cause off a ratio of that shape and
been wrong every time, because **`wall` is Guard GRANTED, not Guard that
stopped anything.**  Guard the deck never tests is wiped at the body's own turn
start and adds to `wall` exactly as much as Guard that ate a hit.

So this prints Guard per BODY in three columns instead of one:

    raised    Guard the body was granted across the fight
    consumed  Guard a hit actually SPENT — `blocked` on damage aimed at it
    landed    damage that reached that body's Courage

A wall the deck is throwing itself at has `consumed` close to `raised` on the
body being hit.  Guard on a body nobody swings at has `consumed` near zero and
is decoration that the summary is pricing as a wall.  Opposite fixes; `wall`
alone cannot tell them apart.

Reads the same `simulate()` the gate runs, so the deck, the route and the RNG
stream are the gate's rather than a reconstruction.

Owned by the meta-run agent; does not touch tools/.
"""
import asyncio, sys, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/tests/run/index.html?probe=%d"


async def main(a):
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1280, "height": 900})).new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        url = URL % a.index
        if a.naive:
            url += "&naive=" + a.naive
        await page.goto(url, wait_until="load", timeout=60000)
        try:
            await page.wait_for_function("window.__RUN_RESULT__ !== undefined",
                                         timeout=int(a.wait * 1000))
        except Exception:
            print("!! probe did not finish within %.0fs" % a.wait)
        res = await page.evaluate("window.__PROBE_RESULT__ || null")
        await browser.close()

    if errors:
        print("--- console errors ---")
        for e in errors[:20]:
            print(e)
    if not res:
        print("RESULT: probe reported nothing")
        return 1

    print("seed %s  index %s  %s/%s  haunt %s%s%s"
          % (res["seed"], res["index"], res.get("companion"), res.get("kid"),
             res.get("haunt"), "  shepherded" if res.get("shepherd") else "",
             "  elitist" if res.get("elitist") else ""))

    fights = [f for f in res.get("fights") or [] if f["turns"] >= a.min_turns]
    print("%d fights at or past %d turns (of %d in the expedition)\n"
          % (len(fights), a.min_turns, len(res.get("fights") or [])))

    for f in fights:
        t = max(1, f["turns"])
        swing = f["dealt"] + f["blocked"]
        print("=" * 78)
        print("%s / %s  %s  wing %s  tier %s"
              % (f["region"], f["type"], f.get("encId") or "?", f.get("wing"),
                 f.get("encTier")))
        print("  %d turns, %s.  pool %d, %d left (%d%%).  cost %d Courage (%d -> %d)"
              % (f["turns"], "won" if f["won"] else "LOST", f["pool"], f["left"],
                 round(100.0 * f["left"] / max(1, f["pool"])), f["cost"],
                 f["hpBefore"], f["hpAfter"]))
        print("  wall %.1f   land %.1f   swing %.1f   abs %d%%   cpt %.1f   deck %d   pierce %d"
              % (f["guard"] / t, f["dealt"] / t, swing / t,
                 round(100.0 * f["blocked"] / max(1, swing)), f["played"] / t,
                 f.get("deckSize") or 0, f.get("pierce") or 0))

        pr = f.get("probe") or {}
        bodies = sorted(pr.get("bodies") or [], key=lambda b: -(b.get("raised") or 0))
        if bodies:
            raised = sum(b.get("raised") or 0 for b in bodies)
            consumed = sum(b.get("consumed") or 0 for b in bodies)
            print("\n  GUARD BY BODY — raised is what `wall` counts; consumed is what")
            print("  actually stopped a hit. The gap is Guard that expired untested.")
            print("    %-26s %-7s %-9s %-9s %-8s %-7s %s"
                  % ("body", "maxHp", "raised", "consumed", "wasted", "landed", "hits"))
            for b in bodies:
                r, c = b.get("raised") or 0, b.get("consumed") or 0
                print("    %-26s %-7s %-9d %-9d %-8d %-7d %d"
                      % (b.get("name") or b["id"], b.get("maxHp") or "-",
                         r, c, r - c, b.get("landed") or 0, b.get("hits") or 0))
            print("    %-26s %-7s %-9d %-9d %-8d %-7d"
                  % ("TOTAL", "", raised, consumed, raised - consumed,
                     sum(b.get("landed") or 0 for b in bodies)))
            if raised:
                print("    %d%% of the Guard this board raised was never tested by a hit."
                      % round(100.0 * (raised - consumed) / raised))

        plays = sorted(pr.get("plays") or [], key=lambda x: -x["n"])
        if plays:
            print("\n  WHAT THE DECK PLAYED  (%d plays over %d turns)"
                  % (sum(x["n"] for x in plays), f["turns"]))
            for x in plays:
                print("    %-34s x%-4d cost %s" % (x["id"], x["n"], x.get("cost")))
            deck = pr.get("deck") or []
            if deck:
                never = sorted(set(deck) - {x["id"] for x in plays})
                print("    deck held %d cards; %d ids never played: %s"
                      % (len(deck), len(never), ", ".join(never[:12]) or "-"))

        src = sorted((f.get("bySource") or {}).items(), key=lambda kv: -kv[1])
        if src:
            print("\n  WHAT HURT THE PLAYER")
            for k, v in src[:8]:
                print("    %-34s %d" % (k, v))

        if a.turns:
            rows = pr.get("perTurn") or []
            print("\n  PER ROUND — `onBoard` is Guard STANDING when the bot was asked")
            print("  to act, which is the number the deck was actually up against.")
            print("    %-5s %-7s %-6s %-6s %-7s %-8s %-7s %-8s %-7s %s"
                  % ("turn", "bodies", "hp", "nerve", "hand", "legal",
                     "onBoard", "played", "landed", "absorbed"))
            for r in rows:
                print("    %-5d %-7d %-6d %-6d %-7d %-8d %-7d %-8d %-7d %d"
                      % (r["turn"], r.get("bodies", 0), r.get("hp", 0),
                         r.get("nerve", 0), r.get("hand", 0), r.get("legal", 0),
                         r.get("onBoard", 0), r.get("played", 0),
                         r.get("landed", 0), r.get("absorbed", 0)))

        if a.why:
            rows = [r for r in (pr.get("perTurn") or [])
                    if r.get("played") == 0 and r.get("legal", 0) > 0 and r.get("pass")]
            if rows:
                print("\n  WHY THOSE TURNS PASSED — the bot's own search, on turns it")
                print("  held legal cards and played none. `planTurn` seeds `best` with")
                print("  the empty sequence, so a candidate must STRICTLY beat the pass.")
                for r in rows[: a.why]:
                    print("    turn %-3d  legal %-3d  Guard standing %-3d"
                          % (r["turn"], r.get("legal", 0), r.get("onBoard", 0)))
                    print("      %-46s %s" % ("(pass)  [incumbent]",
                                              "%.1f" % r["pass"]["score"]))
                    if r.get("floor"):
                        fs = r["floor"]["score"]
                        print("      %-46s %-8s %s"
                              % ("(naive floor: block the telegraph, swing rest)",
                                 "%.1f" % fs,
                                 "WOULD FIRE" if fs > r["pass"]["score"]
                                 else "loses by %.1f" % (r["pass"]["score"] - fs)))
                    for c in r.get("cand") or []:
                        names = " + ".join(c.get("names") or [])
                        print("      %-46s %-8s %s"
                              % (names[:46], "%.1f" % c["score"],
                                 "BEATS PASS" if c["score"] > r["pass"]["score"]
                                 else "loses by %.1f" % (r["pass"]["score"] - c["score"])))
        print("")

    print("RESULT: %d fights probed" % len(fights))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("index", type=int, help="seed index; seed = 1000 + index*7717")
    ap.add_argument("--min-turns", type=int, default=20)
    ap.add_argument("--turns", action="store_true", help="print the per-round table")
    ap.add_argument("--why", type=int, default=0, metavar="N",
                    help="for the first N turns that passed while holding legal "
                         "cards, print the bot's own candidate scores vs the pass")
    ap.add_argument("--naive", metavar="ENC_ID",
                    help="play ONLY this encounter with the naive heuristic, "
                         "leaving the rest of the expedition to the competent bot")
    ap.add_argument("--wait", type=float, default=240.0)
    sys.exit(asyncio.run(main(ap.parse_args())))
