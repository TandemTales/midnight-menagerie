"""Two statuses may not render the same word at the player. OWNER: combat-engine.

    python tests/status-names/check.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

A gate against a bug class, in the same family as tests/dup-keys/check.py and
tests/hook-names/check.py — and like those, it exists because the instance got
all the way into a shipped build.

WHY THIS EXISTS
---------------
The Lights Are Out hands every enemy a hiding status. It was authored as
"2 Unseen", and `unseen` is Hush's: it does not stack, and every rule for
breaking it lives in his card code, so an enemy given the real one would stay
hidden for the rest of the fight. `data/wings.js` did the right thing and
declared its own status under the id `lurking` — then set `name: 'Unseen'` on
it, because "Unseen" is what the wing's rule text promises the player.

The id namespace stayed clean. The screen did not. Hush's Power reads "Starting
a turn Unseen gains Nerve", so a party with Hush in a lights-out wing showed
"Unseen" on Hush and "Unseen x2" on every enemy — same word, same `hidden`
glyph, one stacking and one not, and two unrelated rules for breaking it. No
single file was wrong. The collision existed only where the two met, on screen,
which is the one place no unit test was pointed.

**The id namespace is not what the player reads.**

WHY IT RUNS IN A BROWSER
------------------------
A source scanner would have to know every shape a status is declared in, and
there are at least three — object literals, `powerStatus(...)` and
`counterStatus(...)`, the last defaulting to a `kind` an early version of this
scan filtered out. So it reads the REGISTRY after `loadContentRegistries()`
instead: whatever the game actually registered is what the player can actually
see, and no new helper can hide from it.

The page asserts it can SEE before it asserts a zero — registry population plus
one known id from each of the four layers (core, companion, enemy, wing). That
is CONTRACTS 54: `tests/bus-names/check.py` reported "0 dead subscriptions"
while blind to the file that held thirty of them. A gate that loads nothing
finds no collisions and passes.

Deliberate shared names live in `WAIVED` in the page, with the reason, and are
checked in BOTH directions — a waiver whose ids no longer collide fails as
stale, because a control that cannot fail is not a control (CONTRACTS 52).

Exit code 0 only when every assertion passes and the page logs no error.
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/status-names/index.html"


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

        gaps = page.evaluate(
            "() => [...document.querySelectorAll('.gap')].map(e => e.textContent)")
        if gaps:
            print("\n--- COLLISIONS ---", flush=True)
            for g in gaps:
                print(g, flush=True)

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        if bad:
            print("\n--- CONSOLE ---", flush=True)
            for line in bad[:20]:
                print(" ", line, flush=True)

        print(f"\nRESULT: {r['passed']} passed, {r['failed']} failed, "
              f"{len(bad)} console errors, {r.get('total', 0)} statuses checked",
              flush=True)
        browser.close()
        return 1 if (r["failed"] or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
