"""Bones: Loose Bones, Rattle, Bury, Fetch, and the Dig Up nobody heard.

    python tests/bones/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

He is one of the four starters and had no suite of his own. He is also named in
both of the traps that hide here most often: CONTRACTS 9, where the Buried
countdown ticked once per ACTOR turn instead of once per player turn and so ran
at 3x on a three-body board; and CONTRACTS 10, where Tail Going A Mile A Minute
shipped as a Rare Power registered on a hook nothing fires.

The second of those was still half-broken on 2026-08-31 — repaired onto `dugUp`,
which only the two multiplayer Pack Stash cards fire, while the ordinary
`digUp()` every solo player uses fires `digUp`. `tests/hook-names/check.py`
balanced because both spellings existed somewhere. Only playing a Dig Up and
looking at what happens next finds it, which is what this does.

Every scenario runs on the two-enemy dummy board, because a one-enemy board is
exactly where a per-actor tick looks correct.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/bones/index.html"


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
