"""The route is voted — the roulette, and the three things it must not disturb.

    python tests/vote/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

STS2-REFERENCE 8.5 is the source: one shared path, every player votes at every
fork, a weighted roulette picks the winner, ties break randomly, and the host
has no special authority. Before this the blueprint went to whichever seat
`resetSeat()` handed it to, and that seat chose the entire route — which the
reference calls the largest co-op gap we have.

**A minority vote can win**, proportionally to how many wanted it. That is the
mechanic, not a rough edge, and it is the part `tests/net` cannot see: two seats
voting differently is a coin flip whichever way the weights work. It is measured
here at THREE seats over 150 seeds, and a suite that only checked "somebody
wins" would pass on plain majority rule.

The other half — that two machines resolve the same ballot to the same room —
is `tests/net/index.html` §9, which has two Runs and a wire between them.

Exit code 0 only when every assertion passes and the page logs no error.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/vote/index.html"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        console = []
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="load")
        try:
            page.wait_for_function("window.__DONE === true", timeout=120000)
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
            for line in bad[:20]:
                print(" ", line, flush=True)

        print(f"\nRESULT: {r['passed']} passed, {r['failed']} failed, "
              f"{len(bad)} console errors", flush=True)
        browser.close()
        return 1 if (r["failed"] or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
