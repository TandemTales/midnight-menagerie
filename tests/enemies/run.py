#!/usr/bin/env python3
"""Run the enemy validation harness headlessly and print its report.

    python tests/enemies/run.py [--url http://localhost:8777/tests/enemies/index.html]

Exits non-zero if the harness reports any errors, so it can gate CI.
"""
import argparse
import sys

DEFAULT_URL = "http://localhost:8777/tests/enemies/index.html"

# The report uses ✓/✗/box-drawing. Windows consoles default to cp1252.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--timeout", type=int, default=60000)
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed:  pip install playwright && playwright install chromium")
        return 2

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        console: list[str] = []
        page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console.append(f"[pageerror] {e}"))

        page.goto(args.url, wait_until="domcontentloaded")
        try:
            page.wait_for_function("window.__DONE__ === true", timeout=args.timeout)
        except Exception:
            print("harness did not finish — the module probably threw before completing.\n")
            for line in console:
                print(line)
            print("\n--- page text ---")
            print(page.inner_text("body")[:8000])
            browser.close()
            return 1

        result = page.evaluate("window.__RESULT__")
        browser.close()

    if console:
        print("--- console ---")
        for line in console:
            print(line)
        print()

    print(result["text"])
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
