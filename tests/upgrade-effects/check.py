"""An upgrade that changes a number nobody reads. OWNER: companion-cards.

    python tests/upgrade-effects/check.py [--verbose]

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
`tests/cards/check` errors when an upgrade changes nothing in the DEF. The
defect that actually ships is one layer down: the def changes `nums` and no code
reads them. A Power hook hardcodes its value; an Afterglow, an Epitaph or any
other delayed effect resolves with no card attached, so `N(c)` is empty; or the
upgrade only rewrote the text. The 2026-09-11 card cost pass found roughly forty
of those across the sixteen decks BY READING THE CODE, one deck at a time, and
no gate in the tree could see a single one of them.

WHAT IT DOES
------------
Plays every playable Trick twice from the same seed onto the same seeded board,
once base and once upgraded, each play followed by two whole turns so Powers,
hooks, timers and next-turn effects land. Then it compares the two boards -
enemy Courage, Guard and statuses, the Kid's Courage, Guard, Nerve, statuses and
counters, every pile size, timers, objects - and the cost. Identical boards and
an identical cost means the upgrade did nothing anybody could see.

REPORT-ONLY, DELIBERATELY
-------------------------
The list is long today, so a red here would be a gate nobody believes (trap 54).
The exit code is about the GATE's health instead: a card it cannot instantiate,
or a WAIVED entry that has started to differ. When the list reaches zero, make
the list itself fail and this docstring is the note to say so.

A dummy board cannot reach every condition, so a live upgrade can land in the
list: a threshold this fight never crosses, a pile it never fills. Those belong
in `WAIVED` in the page WITH the reason, and a waiver that starts showing a
difference fails - a control that cannot fail is not a control.
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/upgrade-effects/index.html"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true", help="print every id, not just the per-deck counts")
    a = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        console = []
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="load")
        try:
            # ~1470 Tricks, two engines each, two turns per engine.
            page.wait_for_function("window.__DONE === true", timeout=900000)
        except Exception:
            print("PAGE DID NOT FINISH", flush=True)
            for line in console[:20]:
                print(" ", line, flush=True)
            browser.close()
            return 2

        r = page.evaluate("window.__RESULT")
        dead, broken, stale = r["dead"], r["broken"], r["staleWaivers"]

        print("  upgrades that moved nothing, by Companion:", flush=True)
        for line in r["byCompanion"]:
            print("   ", line, flush=True)
        if a.verbose:
            print("\n  --- every one of them ---", flush=True)
            for line in dead:
                print("   ", line, flush=True)

        for line in stale:
            print("  STALE WAIVER ", line, flush=True)
        for line in broken:
            print("  BROKEN ", line, flush=True)

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        for line in bad[:10]:
            print("  CONSOLE ", line, flush=True)

        print(f"\nRESULT: {r['checked']} upgrades played, {len(dead)} moved nothing, "
              f"{len(r.get('unplayed', []))} unplayable on this board, "
              f"{len(r.get('needsParty', []))} need a friend, "
              f"{len(r.get('choices', []))} hinge on a choice, "
              f"{len(stale)} stale waivers, {len(broken)} broken, {len(bad)} console errors",
              flush=True)
        browser.close()
        return 1 if (stale or broken or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
