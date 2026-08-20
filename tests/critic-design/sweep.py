"""What-if sweep on an encounter's Courage pool.

    python tests/critic-design/sweep.py --tier boss --n 24 --scales 1,0.8,0.7,0.65
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--tier", default="boss")
ap.add_argument("--enc", default="")
ap.add_argument("--n", type=int, default=24)
ap.add_argument("--gen", type=int, default=8)
ap.add_argument("--bots", default="competent")
ap.add_argument("--pol", default="balanced")
ap.add_argument("--scales", default="1,0.85,0.75,0.7,0.65,0.6")
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--heal", type=int, default=0)
ap.add_argument("--timeout", type=float, default=1200)
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = (f"http://localhost:8777/tests/critic-design/sweep.html?tier={a.tier}&enc={a.enc}"
       f"&n={a.n}&gen={a.gen}&bots={a.bots}&pol={a.pol}&scales={a.scales}&seed={a.seed}&heal={a.heal}")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__DONE__ === true", timeout=int(a.timeout * 1000))
    except Exception as e:
        print("SWEEP DID NOT FINISH:", str(e)[:160])
        print(pg.evaluate("document.body.innerText")[-2500:])
        b.close(); sys.exit(2)
    R = pg.evaluate("window.__SWEEP__")
    b.close()

(ROOT / "tests" / "critic-design" / "sweep-result.json").write_text(json.dumps(R, indent=1), encoding="utf-8")
print(f"== sweep {a.tier} {a.enc or '(rolled)'}  loadouts {R['loadouts']}")
print(f"{'bot':<11}{'xHP':>6}{'win%':>8}{'turns':>8}{'med':>5}{'cost':>7}{'@door':>7}{'hpWin':>7}{'to':>4}")
for r in R["table"]:
    print(f"{r['bot']:<11}{r['hpScale']:>6}{r['win']:>8}{r['turnsMean']:>8}{r['turnsMed']:>5}"
          f"{r['costMean']:>7}{r['courageAtDoor']:>7}{r['hpAfterWinMean']:>7}{r['timeouts']:>4}")
if R.get("errors"):
    print("errors:", len(R["errors"]))
    for e in R["errors"][:5]:
        print("  !", str(e)[:200])
