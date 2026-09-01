"""Simulate 50 seeded expeditions through state/run.js in a real browser.

    python tests/run/run.py [--wait 180] [--verbose]

Drives the run layer with no scenes at all: map -> combat -> reward -> next node
-> ... -> boss.  Asserts no crashes, that a seed reproduces a run identically,
that autosave/resume round-trips, and that deck size / Lost Things stay sane.
Prints `RESULT: n runs, m errors` plus the run-length and end-state
distributions.  Exit code 0 only when m == 0.

Owned by the meta-run agent; does not touch tools/.
"""
import asyncio, sys, argparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/tests/run/index.html"


def bar(n, scale=1):
    return "#" * max(1, int(round(n / scale)))


async def main(a):
    from playwright.async_api import async_playwright
    logs, errors = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1280, "height": 900})).new_page()
        page.on("console", lambda m: (logs.append(m.text),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(URL, wait_until="load", timeout=60000)
        try:
            await page.wait_for_function("window.__RUN_RESULT__ !== undefined",
                                         timeout=int(a.wait * 1000))
        except Exception:
            print("!! simulation did not finish within %.0fs" % a.wait)

        res = await page.evaluate("window.__RUN_RESULT__ || null")
        text = await page.evaluate("document.body.innerText")
        await browser.close()

    if a.verbose:
        print(text)

    if errors:
        print("--- console errors ---")
        for e in errors[:40]:
            print(e)

    if not res:
        print("RESULT: 0 runs, 1 errors (page never reported)")
        return 1

    lengths = res.get("lengths") or []
    if lengths:
        print("\nrun length (rooms entered)")
        hist = {}
        for n in lengths:
            b = (n // 2) * 2
            hist[b] = hist.get(b, 0) + 1
        for k in sorted(hist):
            print("  %2d-%-2d  %2d  %s" % (k, k + 1, hist[k], bar(hist[k])))
        print("  mean %.1f  min %d  max %d"
              % (sum(lengths) / len(lengths), min(lengths), max(lengths)))

    reach = res.get("reach") or []
    vic = res.get("victories") or {}
    if reach:
        print("")
        print("wings reached (of 50; every 5th run is shepherded)")
        print("  %-34s %-9s %s" % ("wing", "unaided", "shepherded"))
        for r in reach:
            print("  %-34s %-9d %d"
                  % ("%d %s" % (r["region"], r["id"]), r["unaided"], r["shepherded"]))
        if vic:
            print("  victories: %d/%d unaided, %d/%d shepherded"
                  % (vic.get("unaided", 0), vic.get("unaidedOf", 0),
                     vic.get("shepherded", 0), vic.get("shepherdedOf", 0)))

    routed = res.get("routed") or []
    if routed:
        never = [r["id"] for r in routed if not r["runs"]]
        print("")
        print("which wings the routes opened  (of 50 expeditions)")
        for r in routed:
            print("  %-22s %3d %s" % (r["id"], r["runs"], bar(r["runs"], 2)))
        print("  " + ("UNREACHABLE: " + ", ".join(never) if never
                      else "every wing was routed through at least once"))

    led = res.get("ledger") or []
    if led:
        print("")
        print("what a fight costs, by region  (unaided runs only)")
        print("  %-22s %-7s %-10s %-9s %-7s %-6s %-6s %-9s %-7s %s"
              % ("region", "fights", "mean cost", "% of pool", "turns",
                 "deck", "keeps", "scuffle", "scare", "boss"))
        for r in led:
            print("  %-22s %-7d %-10.1f %-9s %-7.1f %-6.1f %-6.1f %-9.1f %-7.1f %.1f"
                  % (r["region"], r["fights"], r["cost"], "%.1f%%" % r["pct"],
                     r["turns"], r["deck"], r["keeps"],
                     r["scuffle"], r["scare"], r["boss"]))
        print("  '%% of pool' is one fight's Courage cost as a share of MAX Courage -")
        print("  the only cross-region comparison that survives the pool growing.")

    dep = res.get("depth") or []
    if dep:
        print("")
        print("the first wing, by depth  (unaided runs only)")
        print("  %-5s %-7s %-22s %-10s %-9s %-7s %-6s %-6s %-11s %s"
              % ("row", "fights", "what", "mean cost", "% of pool", "turns",
                 "deck", "keeps", "courage in", "lost"))
        for r in dep:
            print("  %-5d %-7d %-22s %-10.1f %-9s %-7.1f %-6.1f %-6.1f %-11s %d"
                  % (r["row"], r["fights"], r["what"][:22], r["cost"],
                     "%.1f%%" % r["pct"], r["turns"], r["deck"], r["keeps"],
                     "%d%%" % r["inPct"], r["lost"]))
        print("  FLAT '%% of pool' down the column means the CONTENT is overpriced;")
        print("  falling means the OPENING DECK is. 'deck' beside it is the control.")

    arr = res.get("arrival") or []
    if arr:
        print("")
        print("what the player brings to each boss door  (unaided runs only)")
        print("  %-22s %-8s %-11s %-11s %-11s %-8s %-8s %-6s %-14s %s"
              % ("region", "bosses", "courage in", "arrives at", "boss costs",
                 "of pool", "margin", "lost", "won hp/deck", "lost hp/deck"))
        for r in arr:
            pair = lambda h, d: "-" if h is None else "%d%% / %.1f" % (h, d)
            print("  %-22s %-8d %-11.1f %-11s %-11.1f %-8s %-8s %-6d %-14s %s"
                  % (r["region"], r["bosses"], r["hpIn"], "%d%%" % r["inPct"],
                     r["cost"], "%d%%" % r["costPct"], "%dpp" % r["margin"],
                     r["lost"], pair(r["wonHp"], r["wonDeck"]),
                     pair(r["lostHp"], r["lostDeck"])))
        print("  'margin' is arrival minus price in points of the pool.")
        print("  Below zero the average run cannot pay for its own boss.")
        print("  Same Courage but a smaller DECK on the losing side means the")
        print("  wing starved the run of cards, and the boss is not the fix.")

    pw = res.get("purse") or []
    if pw:
        print("")
        print("what each kind of room hands over  (unaided runs only)")
        print("  %-12s %-8s %-11s %-11s %-11s %s"
              % ("room", "visits", "keepsakes", "per visit", "per run", "cards/run"))
        for r in pw:
            print("  %-12s %-8d %-11d %-11.2f %-11.2f %.2f"
                  % (r["type"], r["visits"], r["keeps"], r["per"],
                     r["perRun"], r["cardsPerRun"]))

    draws = res.get("draws") or []
    if draws:
        print("")
        print("BOSS DRAWS - neither side could finish inside the turn budget.")
        print("  These are FAILURES now: `_losePatience` makes an unbounded stall")
        print("  impossible, so a draw means that mechanism did not run.")
        for d in draws:
            print("  !! " + d)

    vis = res.get("visited") or {}
    if vis:
        print("\nrooms entered, by kind")
        for k, v in sorted(vis.items(), key=lambda kv: -kv[1]):
            print("  %-12s %3d  %s" % (k, v, bar(v, 2)))

    detail = res.get("endsDetail") or []
    if detail:
        print("\nhow far each run got")
        print("  %-18s %-13s %-17s %-6s %s"
              % ("outcome", "last room", "depth", "deck", "runs"))
        for d in detail:
            print("  %-18s %-13s %-17s %-6s %d"
                  % (d["end"], d["type"],
                     "row %.1f of %d" % (d["row"], d["rows"]),
                     d["deck"], d["n"]))
        print("  a losing run gets %.0f%% of the way through its region"
              % (100 * res.get("depthFrac", 0)))

    ends = res.get("ends") or {}
    if ends:
        print("\nend state")
        for k, v in sorted(ends.items(), key=lambda kv: -kv[1]):
            print("  %-28s %2d  %s" % (k, v, bar(v)))

    def stat(name, key):
        vals = res.get(key) or []
        if not vals:
            return
        print("  %-10s min %-4d mean %-6.1f max %d"
              % (name, min(vals), sum(vals) / len(vals), max(vals)))

    print("\nfinal state")
    stat("deck", "decks")
    stat("purse", "purses")
    stat("keepsakes", "keeps")

    print("\nchecks")
    print("  determinism   %s/5 replays identical" % res.get("determinism", 0))
    print("  resume        %s/3 round-trips identical" % res.get("resume", 0))
    print("  localStorage  %s/3 wrote and read back" % res.get("storage", 0))
    print("  mid-fight     %s/%s interrupted Scuffles resumed (%s exact replays)"
          % (res.get("combatResume", 0), res.get("combatResumeTried", 0),
             res.get("replayed", 0)))
    print("  autosaves     %s" % res.get("saveCount", 0))

    if res.get("errorList"):
        print("\n--- failures ---")
        for e in res["errorList"]:
            print("  " + e)

    print("\nRESULT: %d runs, %d errors  (%d ms)" % (res["runs"], res["errors"], res.get("ms", 0)))
    return 0 if res["errors"] == 0 and not errors else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait", type=float, default=240.0)
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
