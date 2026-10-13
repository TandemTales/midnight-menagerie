"""A Trick whose effect does nothing anybody can see. OWNER: companion-cards.

    python tests/base-effects/check.py [--verbose]

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
`tests/upgrade-effects/check.py` plays base against upgraded and fails on an
upgrade that moved nothing. It cannot see a card that is dead in BOTH forms: an
effect that sets a flag no code reads, waits on a status nobody applies, or
hardcodes a branch that never fires plays identically base and upgraded and
does nothing at all. The 2026-09-11 card cost pass listed about 150 dead
effects by READING the code (docs/notes/2026-09-11-card-cost-pass.md); no gate
in the tree could find the next one.

WHAT IT DOES
------------
Plays every playable Trick onto the same seeded board the upgrade gate uses
(tests/upgrade-effects/harness.js), and plays a BLANK TWIN of it onto an
identical board: same type, cost, target, keywords and playability, a different
id, an effect that does nothing. The twin is the control because the play
itself is visible (Nerve spent, a card in the discard, "the Nth Trick this
turn", every "when you play an Attack" hook): a control that skipped the play
would call every card alive. The RNG is restored after the play on both sides.
Two turns then pass on both boards, and the board at the play, a tally of what
the fight emitted, and the board after the turns are compared. Identical means
the card did nothing anybody could see. The page's header says exactly what the
board reading covers.

A Trick that pays a friend gets a second try with a second Kid at the table,
and one that asks a choice gets a second try with the last options picked.
Nothing else is bucketed away: an identical Trick - including one this board
cannot play at all - is dead unless the page's WAIVED_LIST names it WITH the
reason. A waiver that starts showing a difference FAILS, and every waiver is
proved live on a board that reaches its condition by `run.py` (proofs-g1..g4.html).

IT FAILS ON THE LIST (since 2026-10-13)
---------------------------------------
It started report-only at 174 identical Tricks. Burned down the same day:
fixed where the card was genuinely dead, waived-and-proved where only this
board could not show it. At zero, the list itself fails, as tests/upgrade-
effects has since 2026-10-04: a Trick that does nothing is a card reward the
player wasted.
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/base-effects/index.html"


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

        print("  Tricks that moved nothing, by Companion:", flush=True)
        for line in r["byCompanion"]:
            print("   ", line, flush=True)
        if a.verbose:
            print("\n  --- every one of them ---", flush=True)
            for line in dead:
                print("   ", line, flush=True)
            for key, label in (("rescuedParty", "showed only with a friend at the table"),
                               ("rescuedChoice", "showed only with the last options picked"),
                               ("buffOnly", "show only a status on the Kid (not a failure)")):
                print(f"\n  --- {label} ({len(r.get(key, []))}) ---", flush=True)
                for line in r.get(key, []):
                    print("   ", line, flush=True)

        for line in stale:
            print("  STALE WAIVER ", line, flush=True)
        for line in broken:
            print("  BROKEN ", line, flush=True)

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        for line in bad[:10]:
            print("  CONSOLE ", line, flush=True)

        print(f"\nRESULT: {r['checked']} Tricks played, {len(dead)} moved nothing "
              f"({r.get('unplayable', 0)} of them unplayable on this board), "
              f"{r.get('waived', 0)} waived, "
              f"{len(r.get('rescuedParty', []))} shown by a friend, "
              f"{len(r.get('rescuedChoice', []))} shown by the other choice, "
              f"{len(stale)} stale waivers, {len(broken)} broken, {len(bad)} console errors",
              flush=True)
        browser.close()
        # 2026-10-13: the list reached ZERO (174 -> 0), so it fails now. A live
        # Trick this board cannot show belongs in waivers-g<N>.js WITH its proof.
        return 1 if (dead or stale or broken or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
