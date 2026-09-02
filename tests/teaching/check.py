"""The tooltip registry IS the tutorial, so gate it. OWNER: combat-engine.

    python tests/teaching/check.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
This game has no tutorial and does not want one. `docs/design/regions/01-foyer.md`
33 says the player is taught "primarily through combat rather than pop up
tutorials"; `docs/design/kids/03-amina-mochi.md` asks for the story "without
requiring a tutorial lecture"; `docs/design/01-mansion-structure.md` calls the
Foyer the tutorial region. The design is consistent and it is a real position.

The consequence is that ALL of the teaching happens where the player meets the
thing - a tooltip under every status chip, every keyword, every bracketed term
on a card. That makes the tooltip registry the tutorial, and until now nothing
checked it was complete.

WHY IT IS A REAL RISK AND NOT A HYPOTHETICAL
--------------------------------------------
It has already rotted once, silently, and `data/keywords.js` records it in its
own source: `loadContentRegistries` imported `enemies/_lib.js`, which holds only
the CORE enemy statuses, instead of `enemies/index.js`. So every status a region
added after the Foyer had no tooltip - the Kitchens' five, the Heart's fifteen -
and the count sat at "the same 268 statuses through two whole regions of new
ones". Nothing failed. A number stopped moving.

That is the shape this gate is pointed at, which is why it asserts the COUNTS as
well as the gaps: a partial load reads far lower and is caught by the floor even
if every entry it did load is perfect.

The subtler half is the blank description. The loader registers enemy and wing
statuses with `desc: String(s.desc || '')`, so a status authored without one
still lands in the registry - as an EMPTY entry. `hasKeyword` then returns true,
the tooltip opens on hover, and it is blank. That reads as a broken game rather
than a missing line, and no other suite can see it.

Exit code 1 if any check fails or the page logs an error.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/teaching/index.html"


def main():
    console = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = browser.new_page()
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="load", timeout=60000)
        try:
            page.wait_for_function("window.__TEACH__ !== undefined", timeout=120000)
        except Exception:
            print("!! the page never reported", flush=True)

        r = page.evaluate("window.__TEACH__ || null")
        if not r:
            print("RESULT: 0 passed, 1 failed (page never reported)", flush=True)
            for line in console[:20]:
                print(" ", line, flush=True)
            browser.close()
            return 1

        print(page.evaluate("document.getElementById('out').innerText"), flush=True)
        print("", flush=True)
        print("  %d keywords, %d statuses, %d cards scanned"
              % (r["keywords"], r["statuses"], r["cards"]), flush=True)
        print("  blank descriptions %d, stub descriptions %d, statuses with no "
              "tooltip %d, unresolved card terms %d"
              % (r["blank"], r["stub"], r["noKeyword"], r["missingTerms"]), flush=True)

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        if bad:
            print("\n--- CONSOLE ---", flush=True)
            for line in bad[:20]:
                print(" ", line, flush=True)

        print("\nRESULT: %d passed, %d failed" % (r["passed"], r["failed"]), flush=True)
        browser.close()
        return 1 if (r["failed"] or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
