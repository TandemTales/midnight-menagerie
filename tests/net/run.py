"""The lockstep session, over a wire that actually moves messages.

    python tests/net/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

Runs two complete Sessions in one page over a loopback transport and
asserts what lockstep actually requires: the same seed deals both clients
the same board, an input crosses and both boards move together, the total
order is (turn, seat, seq) and NOT arrival order, a board that drifts is
caught by the digest and reported once, and a client that misses two inputs
catches up from the log alone.

It also exercises the BroadcastChannel transport, which is a genuine
asynchronous wire between two independent contexts, to prove it obeys the
two rules lockstep cannot recover from: ordered per sender, and never
delivered back to the sender.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/net/index.html"


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
