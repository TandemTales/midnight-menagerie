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

A console error fails this suite. The two the page provokes on purpose — a
drifted board and a peer on the wrong seed, both of which session.js is
SUPPOSED to shout about — are declared in the page by `expectError()`, and a
declaration that never fires fails as well as one that is missing.
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

        # Console errors. Two checks in the page deliberately drift a board and
        # deliberately hand a peer the wrong seed, and session.js reporting that
        # loudly is the product working — so the page DECLARES those, via
        # expectError(), and everything else still fails the suite.
        #
        # A declaration that never fires fails too. Muting an error is only safe
        # if the mute also proves the error still happens; otherwise the day
        # divergence stops being reported, this gate goes quiet with it.
        errs = [c for c in console if "[error]" in c or "[pageerror]" in c]
        expected = r.get("expectedErrors") or []
        for exp in expected:
            exp["seen"] = sum(1 for c in errs if exp["substr"] in c)
        unexpected = [c for c in errs if not any(e["substr"] in c for e in expected)]
        missing = [e for e in expected if not e["seen"]]

        for exp in expected:
            print(f"  EXPECTED  {exp['seen']}x  {exp['substr']}  — {exp['why']}",
                  flush=True)
        if unexpected:
            print("\n--- UNEXPECTED CONSOLE ERRORS ---", flush=True)
            for line in unexpected:
                print(" ", line, flush=True)
        if missing:
            print("\n--- DECLARED BUT NEVER REPORTED ---", flush=True)
            for exp in missing:
                print(f"  {exp['substr']}  — {exp['why']}", flush=True)

        print(f"\nRESULT: {r['passed']} passed, {r['failed']} failed, "
              f"{len(unexpected)} unexpected console errors, "
              f"{len(missing)} declared-but-silent", flush=True)
        browser.close()
        return 1 if (r["failed"] or unexpected or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
