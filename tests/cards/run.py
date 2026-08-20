"""Run the card-data validation page and report.

    python tests/cards/run.py            # validate, print errors
    python tests/cards/run.py --audit    # also write docs/CARD-AUDIT.md

Needs the dev server on :8777 (python tools/devserver.py 8777).
"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = "http://localhost:8777/tests/cards/index.html"


def main():
    write_audit = "--audit" in sys.argv
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
            print("PAGE DID NOT FINISH")
            for line in console:
                print(" ", line)
            browser.close()
            return 2

        result = page.evaluate("window.__RESULT")
        print(f"RESULT: {result['cards']} cards, {result['errors']} errors, {result['warnings']} warnings")

        if result["errors"]:
            print("\n--- ERRORS ---")
            for e in result["errorList"]:
                print(" ", e)
        if result["warnings"]:
            print(f"\n--- WARNINGS ({result['warnings']}) ---")
            for w in result["warnList"][:80]:
                print(" ", w)
            if result["warnings"] > 80:
                print(f"  … and {result['warnings'] - 80} more")

        print("\n--- POOL COUNTS ---")
        print(f"{'companion':12} {'deck':>4} {'basic':>5} {'common':>6} {'uncom':>5} {'rare':>4} {'spec':>4} {'total':>5}   {'atk':>3} {'skl':>3} {'pwr':>3}")
        for k in result["counts"]:
            print(f"{k['slug']:12} {k['deck']:>4} {k['basic']:>5} {k['common']:>6} {k['uncommon']:>5} {k['rare']:>4} {k['special']:>4} {k['total']:>5}   {k['attack']:>3} {k['skill']:>3} {k['power']:>3}")
        print(f"neutral cards: {result['neutral']} | companion keywords: {result['keywords']} | companion statuses: {result['statuses']}")

        bad = [c for c in console if "[error]" in c or "[pageerror]" in c]
        if bad:
            print("\n--- CONSOLE ---")
            for line in bad:
                print(" ", line)

        if write_audit:
            md = page.evaluate("window.__AUDIT_MD")
            dest = ROOT / "docs" / "CARD-AUDIT.md"
            dest.write_text(md, encoding="utf-8")
            print(f"\nwrote {dest} ({len(md)} chars)")

        browser.close()
        return 1 if (result["errors"] or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
