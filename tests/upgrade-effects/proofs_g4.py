"""The proof behind every waiver in WAIVED_G4. OWNER: companion-cards.

    python tests/upgrade-effects/proofs_g4.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

`check.py` plays each Trick on one dummy board, and an upgrade whose condition
that board never reaches (no Bite Mark to Feed on, nothing Buried, a Power
whose trigger never happens) comes out identical and is waived in
`index.html`. A waiver claims the upgrade is LIVE; `proofs-g4.html` builds the
board each one needs, plays it base and upgraded, and fails on an identical
reading. It also fails if a WAIVED_G4 id has no proof, or a proof no waiver.
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://localhost:8777/tests/upgrade-effects/proofs-g4.html"


def waived_ids():
    src = (Path(__file__).parent / "index.html").read_text(encoding="utf-8")
    m = re.search(r"const WAIVED_G4 = \[(.*?)\n\];", src, re.S)
    return re.findall(r"^\s*\['([^']+)'", m.group(1), re.M) if m else []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="load")
        page.wait_for_function("window.__DONE === true", timeout=300000)
        r = page.evaluate("window.__RESULT")
        browser.close()

    for line in r["pass"]:
        print("  PASS ", line)
    for line in r["fail"]:
        print("  FAIL ", line)
    waived, proved = set(waived_ids()), set(r["ids"])
    for i in sorted(waived - proved):
        print("  FAIL  waived with no proof:", i)
    for i in sorted(proved - waived):
        print("  FAIL  a proof with no waiver (drop it, or the gate now sees it):", i)
    for e in errors:
        print("  FAIL  page error:", e)
    bad = len(r["fail"]) + len(waived ^ proved) + len(errors)
    print(f"\nRESULT: {len(r['pass'])} proved, {bad} failed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
