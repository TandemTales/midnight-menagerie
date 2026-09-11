import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.on("console", lambda m: print("[c]", m.text))
    pg.on("pageerror", lambda e: print("[err]", e))
    pg.goto("http://localhost:8777/tests/card-face/probe.html", wait_until="load")
    pg.wait_for_function("window.__DONE === true", timeout=20000)
    for r in pg.evaluate("window.__PROBE"):
        print(r["id"], "base=", r["base"], "up=", r["up"])
        print("   ", r["marks"])
    b.close()
