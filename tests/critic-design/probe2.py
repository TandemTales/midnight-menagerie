"""Run one headless page and dump its window.__PROBE2__.

    python tests/critic-design/probe2.py [page] [globalName] [timeoutSec]
"""
import sys, json
from playwright.sync_api import sync_playwright

page_name = sys.argv[1] if len(sys.argv) > 1 else "probe2.html"
glob = sys.argv[2] if len(sys.argv) > 2 else "__PROBE2__"
timeout = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0
URL = f"http://localhost:8777/tests/critic-design/{page_name}"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__DONE__ === true", timeout=int(timeout * 1000))
    except Exception as e:
        print("DID NOT FINISH:", str(e)[:200])
        print(pg.evaluate("document.body.innerText")[:3000])
    res = pg.evaluate(f"window.{glob}")
    b.close()

print(json.dumps(res, indent=1)[:12000])
if errs:
    print("\n== CONSOLE ERRORS:", len(errs))
    for e in errs[:20]:
        print("  !", str(e)[:300])
