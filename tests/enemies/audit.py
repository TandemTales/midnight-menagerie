#!/usr/bin/env python3
"""Real-engine intent-truth audit. See tests/enemies/engine-audit.html for the
measurement rationale (why damage events, not HP/Guard deltas).

    python tests/enemies/audit.py [N-seeds-per-encounter]
"""
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

N = int(sys.argv[1]) if len(sys.argv) > 1 else 12
URL = f"http://localhost:8777/tests/enemies/engine-audit.html?n={N}"

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__DONE__ === true", timeout=900000)
    except Exception as ex:
        print("AUDIT DID NOT FINISH:", str(ex)[:200])
        print(pg.evaluate("document.body.innerText")[:6000])
        for l in errs[-30:]:
            print(" ", l[:300])
        b.close()
        sys.exit(2)
    res = pg.evaluate("window.__RESULT__")
    b.close()

print(res["text"])
sys.exit(1 if res["errors"] else 0)
