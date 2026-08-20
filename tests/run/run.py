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
