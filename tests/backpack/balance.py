"""Backpack survival A/B — does working Gear actually move the needle?

    python tests/backpack/balance.py [--n 60] [--bot competent] [--seed 90000]

Runs `tests/critic-design/lib/expedition.js` — the same bot the balance
simulator drives — twice over the SAME seeds: once with an empty Backpack (what
a real expedition actually carried while the select/run seam was broken) and
once with the Kid's authored loadout. Everything else is held identical, so the
difference is the Gear and nothing else.

Owned by the meta-run agent; does not touch tools/ or tests/critic-design/.
"""
import argparse
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=60)
ap.add_argument("--bot", default="competent")
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--companion", default="marmalade")
ap.add_argument("--timeout", type=float, default=1800)
ap.add_argument("--out", default="tests/backpack/balance-result.json")
a = ap.parse_args()

URL = (f"http://localhost:8777/tests/backpack/balance.html"
       f"?n={a.n}&bot={a.bot}&seed={a.seed}&companion={a.companion}")

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__DONE__ === true", timeout=int(a.timeout * 1000))
    except Exception:
        print("!! did not finish in %.0fs" % a.timeout)
    print(pg.inner_text("#out"))
    data = pg.evaluate("window.__AB__ || null")
    b.close()

if errs:
    print("--- console errors ---")
    for e in errs[:20]:
        print(e)

if data:
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)
    print("wrote " + a.out)
sys.exit(0 if data else 1)
