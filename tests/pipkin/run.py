"""Pipkin's Patch: on the board, where the player can finally see it.

    python tests/pipkin/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

This suite exists because the two suites that already cover him cannot see any
of it. `tests/cards/run.py` proves only that a thing resolves without throwing
(CONTRACTS trap 12), and `tests/enemies/audit.py` — the one that checks intent
=== delivered, exactly, on 2018 turns — is SOLO, so every AoE path, every seat
preference and every splash declaration below was invisible to it.

Everything here asserts an EFFECT: Dust Them Off really lands on all three
Kids for the same number, Enough of This really declares its splash to the
seats with no arrow, Remove the Intruder really picks the healthiest Kid and
really picks the same one twice, and the two converted Reprimands really cost
the player Courage and Guard instead of paying the Butler in Guard.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/pipkin/index.html"


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
