"""Critic-owned runner for the three content test pages.

Drives tests/{cards,enemies,combat}/index.html with Playwright, captures the
printed RESULT lines, window.__RESULT, and every console error / pageerror.

    python tests/critic-design/run.py
"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGES = [
    ("cards",   "http://localhost:8777/tests/cards/index.html",
     "window.__DONE === true", "window.__RESULT || null"),
    ("enemies", "http://localhost:8777/tests/enemies/index.html",
     "window.__DONE__ === true", "window.__RESULT__ || null"),
    ("combat",  "http://localhost:8777/tests/combat/index.html",
     "window.__TEST_RESULT__ !== undefined", "window.__TEST_RESULT__ || null"),
]

out = {}
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    for name, url, done_expr, result_expr in PAGES:
        page = browser.new_page()
        console, errors = [], []
        page.on("console", lambda m: (console.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        rec = {"url": url}
        try:
            page.goto(url, wait_until="load", timeout=60000)
            page.wait_for_function(done_expr, timeout=180000)
            rec["done"] = True
        except Exception as e:
            rec["done"] = False
            rec["wait_error"] = str(e)[:400]
        try:
            rec["result"] = page.evaluate(result_expr)
        except Exception as e:
            rec["result"] = "eval error " + str(e)[:200]
        try:
            rec["body_text"] = page.evaluate("document.body.innerText")[:8000]
        except Exception:
            rec["body_text"] = ""
        rec["errors"] = errors[:40]
        rec["console_tail"] = console[-40:]
        out[name] = rec
        page.close()
    browser.close()

dest = ROOT / "tests" / "critic-design" / "result.json"
dest.write_text(json.dumps(out, indent=1), encoding="utf-8")

fail = False
for name, rec in out.items():
    r = rec.get("result")
    print(f"===== {name} =====")
    print("  DONE:", rec.get("done"), rec.get("wait_error", ""))
    if isinstance(r, dict):
        print("  RESULT:", json.dumps({k: v for k, v in r.items()
                                       if not isinstance(v, (list, dict))})[:1200])
        for key in ("errorList", "failures", "failList", "warnList"):
            if r.get(key):
                print(f"  {key} ({len(r[key])}):")
                for e in r[key][:25]:
                    print("    -", str(e)[:300])
    else:
        print("  RESULT:", str(r)[:600])
    if rec["errors"]:
        fail = True
        print("  CONSOLE ERRORS:")
        for e in rec["errors"][:20]:
            print("    !", str(e)[:300])
    if not rec.get("done"):
        fail = True

print("\nwrote", dest)
sys.exit(1 if fail else 0)
