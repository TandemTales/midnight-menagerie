"""Marmalade: Lives, Ghoststep, Haunt, Zoomies and the Untouched streak.

    python tests/marmalade/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

She is one of the four starters and had no suite of her own — fifteen
Companions have one; she and Bones were covered only by `tests/cards/run.py`,
which proves a card resolves without throwing, and `tests/combat/run.py`, which
knows nothing about her archetypes.

CONTRACTS trap 9 is hers: `turn:start` fires for every enemy too, so Untouched
was decided by whichever enemy swung last and the archetype did nothing in any
fight with more than one enemy. `tests/turn-events/check.py` gates the source of
that and cannot see the behaviour, so every scenario here runs on the two-enemy
dummy board — the board the bug needs.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/marmalade/index.html"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        console = []
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="load")
        try:
            page.wait_for_function("window.__DONE === true", timeout=45000)
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

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        if bad:
            print("\n--- CONSOLE ---", flush=True)
            for line in bad:
                print(" ", line, flush=True)

        print(f"\nRESULT: {r['passed']} passed, {r['failed']} failed", flush=True)
        browser.close()
        return 1 if (r["failed"] or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
