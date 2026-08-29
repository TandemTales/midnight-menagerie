"""The Governess: AoE coverage, an ungameable seat pick, a declared thread.

    python tests/governess/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

This suite exists because the two that already cover her cannot see any of it.
`tests/cards/run.py` proves only that a thing resolves without throwing
(CONTRACTS trap 12), and `tests/enemies/audit.py` — the one that checks intent
=== delivered, exactly, on 2018 turns — is SOLO. So her having no party
targeting at all was invisible to both, and an enemy that declares no
`partyPick` rolls ONE seat at the start of the fight and holds it: at four Kids
she fought one Kid for eighteen turns while three stood untouched and hit her
freely. Measured at n=16: 100% player wins, nobody ever falling, 90% of the
party's Courage left, against a solo 62.5% and 56%.

Everything here asserts an EFFECT: Mind Your Seams really lands on all three
Kids AND Pinches all three, Sharp Correction really picks the Kid closest to
breaking and really does not move when they brace, Tighten the Stitch really
declares its splash to the seats with no arrow, Snip Snip really cuts two
different children — and every one of her five attacks deals a Kid alone
exactly what it always did.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/governess/index.html"


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
