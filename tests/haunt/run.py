"""The Haunt ladder: two of them, and one that moves. OWNER: meta-run.

    python tests/haunt/run.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

docs/STS2-REFERENCE.md §8.1 asks a question this project had never answered:
Multiplayer Ascension is tracked SEPARATELY from single-player, gated by the
weakest player in the lobby, and on a won run the whole lobby earns the next
level. Nothing here keyed Haunt progression to party size.

Two things were wrong, not one. There was no party ladder — and the ladder did
not advance on a win either, for anybody. `hauntLevel` was written by its own
default and read by two pickers, and nothing in the codebase ever incremented
it, so every save sat on Haunt 0 permanently and the whole ascension analogue
was inert. That is the same silent-no-op class as CONTRACTS 54: a feature fully
present in the UI, fully described, and connected to nothing.

The separation is the half with teeth. A Haunt cleared by four Kids is not
evidence one Kid can clear it — the party curve multiplies enemy Courage and
never enemy damage, and four decks draw four times the answers. A single ladder
would let a group unlock Haunt 5 and then offer a soloist a fight nothing in
their history says they can survive.

"Credited to everyone" falls out rather than being built: each client advances
its OWN save on a shared win. "Gated by the weakest" needs the lobby to compare
saves across peers, so it is transport work — `Save.hauntLevelFor` is the seam
it will call, taking the MIN.

Exit code 0 only when every assertion passes and the page logs no error.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/haunt/index.html"


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
