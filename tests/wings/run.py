"""Wing conditions: which of the eight do anything, and do they do it right?

    python tests/wings/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

`state/mapgen.js` HAZARDS declares eight wing conditions and every blueprint
places two to four. The map draws the marked area, names the wing along the
footer, lists it in the legend and shows its rule in the hover card.

**Six of the eight were implemented nowhere.** A search for each id returned
`state/mapgen.js` and nothing else. The player was told "Guard is halved at the
start of each of your turns while you are inside the marked area" and nothing
halved anything. `moonlit` is implemented as of 2026-08-29, which makes three.

The suite asserts the three that work AND keeps the manifest of which is which
honest: implementing one of the five without updating `WIRED` fails, and so
does losing one of the three. It also covers four sound cues that sat in the
bank with no caller — the only thing that would have played them was a bus
handler listening for a name nothing emits.

Exit code 0 only when every assertion passes and the page logs no error.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/wings/index.html"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        console = []
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="load")
        try:
            page.wait_for_function("window.__DONE === true", timeout=60000)
        except Exception:
            print("PAGE DID NOT FINISH", flush=True)
            for line in console:
                print(" ", line, flush=True)
            browser.close()
            return 2

        r = page.evaluate("window.__RESULT")
        for line in r["passes"]:
            print("  PASS ", line, flush=True)
        for line in r["fails"]:
            print("  FAIL ", line, flush=True)

        # The page also prints the wings that still do nothing, in yellow. They
        # are NOT failures — they are a standing report, and the manifest check
        # is what stops that report going stale.
        gaps = page.evaluate(
            "() => [...document.querySelectorAll('.gap')].map(e => e.textContent)")
        if gaps:
            print("\n--- STILL DOING NOTHING ---", flush=True)
            for g in gaps:
                print(g, flush=True)

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        if bad:
            print("\n--- CONSOLE ---", flush=True)
            for line in bad[:20]:
                print(" ", line, flush=True)

        print(f"\nRESULT: {r['passed']} passed, {r['failed']} failed, "
              f"{len(bad)} console errors", flush=True)
        browser.close()
        return 1 if (r["failed"] or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
