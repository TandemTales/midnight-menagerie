"""The proof behind every upgrade waiver, all four groups. OWNER: companion-cards.

    python tests/upgrade-effects/run.py [g1 g2 g3 g4]

Needs the dev server on :8777 (python tools/devserver.py 8777).

`check.py` plays each Trick on one dummy board, and an upgrade whose condition
that board never reaches (no Bite Mark to Feed on, nothing Buried, a Power
whose trigger never happens) comes out identical and is waived in
`index.html`, in WAIVED_G1 .. WAIVED_G4. A waiver claims the upgrade is LIVE;
`proofs-g<N>.html` builds the board each one needs, plays it base and upgraded,
and fails on an identical reading.

This is the ONE runner for every group (it was `proofs_g4.py`, group 4 only;
groups 1-3 carried their numbers in the waiver text and their proofs were
scratch pages nobody committed). It fails if any waived id has no proof, if a
proof has no waiver, or if a proof reads the same base and upgraded. Named
run.py so `tools/gates.py` finds it with the rest of the battery.
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8777/tests/upgrade-effects/proofs-%s.html"
GROUPS = ("g1", "g2", "g3", "g4")


def waived_ids(group):
    src = (Path(__file__).parent / "index.html").read_text(encoding="utf-8")
    m = re.search(r"const WAIVED_%s = \[(.*?)\n\];" % group.upper(), src, re.S)
    if not m:
        raise SystemExit("no WAIVED_%s array in index.html" % group.upper())
    return re.findall(r"^\s*\['([^']+)'", m.group(1), re.M)


def run_page(page, group):
    errors = []
    handler = lambda e: errors.append(str(e))
    page.on("pageerror", handler)
    page.goto(BASE % group, wait_until="load")
    page.wait_for_function("window.__DONE === true", timeout=600000)
    r = page.evaluate("window.__RESULT")
    page.remove_listener("pageerror", handler)
    return r, errors


def main():
    groups = [g for g in sys.argv[1:] if g in GROUPS] or list(GROUPS)
    total_pass, total_bad = 0, 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for g in groups:
            print("== %s" % g.upper(), flush=True)
            r, errors = run_page(page, g)
            for line in r["pass"]:
                print("  PASS ", line, flush=True)
            for line in r["fail"]:
                print("  FAIL ", line, flush=True)
            waived, proved = set(waived_ids(g)), set(r["ids"])
            dupes = sorted({i for i in r["ids"] if r["ids"].count(i) > 1})
            for i in sorted(waived - proved):
                print("  FAIL  waived with no proof:", i, flush=True)
            for i in sorted(proved - waived):
                print("  FAIL  a proof with no waiver (drop it, or the gate now sees it):", i, flush=True)
            for i in dupes:
                print("  FAIL  proved twice:", i, flush=True)
            for e in errors:
                print("  FAIL  page error:", e, flush=True)
            bad = len(r["fail"]) + len(waived ^ proved) + len(dupes) + len(errors)
            print("  %s: %d proved, %d failed" % (g.upper(), len(r["pass"]), bad), flush=True)
            total_pass += len(r["pass"])
            total_bad += bad
        browser.close()

    print(f"\nRESULT: {total_pass} proved, {total_bad} failed ({', '.join(groups)})")
    return 1 if total_bad else 0


if __name__ == "__main__":
    sys.exit(main())
