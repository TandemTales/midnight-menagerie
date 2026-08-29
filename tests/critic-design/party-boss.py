"""A boss at 1..4 Kids, against decks real expeditions carried.

    python tests/critic-design/party-boss.py --enc foyer-boss --n 16 --gen 8

The gap neither existing harness covers. `sweep.py` measures the SOLO boss
against captured pre-boss loadouts and cannot seat a second Kid; `tests/coop/
balance.py` seats four Kids but fights with 10-card STARTING decks, which
against a boss's Courage pool measures a floor rather than a change.

Read `left%` first: leftover Courage on a win. A rising line across party sizes
is the open finding from the party-of-four round — bigger parties finish far
healthier even at matched win rates, and AoE coverage is the lever meant to
close it, since enemy damage never scales with party size.

`errs` must be 0. A non-zero count means seats were throwing mid-fight and the
win rate is biased by however many; the number is reported rather than
suppressed so a broken measurement cannot read as a good one.
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--tier", default="boss")
ap.add_argument("--enc", default="")
ap.add_argument("--region", default="foyer")
ap.add_argument("--n", type=int, default=16)
ap.add_argument("--gen", type=int, default=8)
ap.add_argument("--sizes", default="1,2,3,4")
ap.add_argument("--slugs", default="marmalade,bones")
ap.add_argument("--pol", default="balanced")
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--haunt", type=int, default=0)
ap.add_argument("--scale", type=float, default=1)
ap.add_argument("--out", default="party-boss-result.json")
ap.add_argument("--timeout", type=float, default=3600)
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = (f"http://localhost:8777/tests/critic-design/party-boss.html?tier={a.tier}&enc={a.enc}"
       f"&region={a.region}&n={a.n}&gen={a.gen}&sizes={a.sizes}&slugs={a.slugs}"
       f"&pol={a.pol}&seed={a.seed}&haunt={a.haunt}&scale={a.scale}")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__PARTY__ !== undefined", timeout=int(a.timeout * 1000))
    except Exception as e:
        print("PARTY BENCH DID NOT FINISH:", str(e)[:160])
        print(pg.evaluate("document.body.innerText")[-2500:])
        b.close(); sys.exit(2)
    R = pg.evaluate("window.__PARTY__")
    b.close()

if R.get("error"):
    print("CRASHED:", R["error"][:400])
    sys.exit(2)

(ROOT / "tests" / "critic-design" / a.out).write_text(json.dumps(R, indent=1), encoding="utf-8")
print(f"== party {a.region}/{a.tier} {a.enc or '(rolled)'}  haunt {a.haunt}  xHP {a.scale}")
print("   loadouts " + " · ".join(f"{k} {v}" for k, v in R["loadouts"].items()))
print(f"{'party':<7}{'n':>4}{'win%':>7}{'turns':>7}{'med':>5}{'left%':>8}"
      f"{'fallen':>8}{'spread':>8}{'enemyHP':>9}{'cost':>7}{'errs':>6}{'to':>4}")
for r in R["table"]:
    print(f"{str(r['size']) + 'p':<7}{r['n']:>4}{r['win']:>7}{r['turnsMean']:>7}{r['turnsMed']:>5}"
          f"{r['left']:>8}{r['fallen']:>8}{r['spread']:>8}{r['enemyHp']:>9}{r['cost']:>7}"
          f"{r['errs']:>6}{r['timeouts']:>4}")

solo = next((r for r in R["table"] if r["size"] == 1), None)
if solo:
    print("\nvs solo (flat is the target):")
    for r in R["table"]:
        print(f"  {r['size']}p: win {r['win'] - solo['win']:+.0f} pts · "
              f"left {r['left'] - solo['left']:+.0f} pts · "
              f"turns {r['turnsMean'] - solo['turnsMean']:+.1f} · spread {r['spread']:.2f}")

bot_errs = sum(r["errs"] for r in R["table"])
if bot_errs:
    print(f"\n!! {bot_errs} bot errors — NOT a trustworthy measurement until these are zero.")
if R.get("errors"):
    print("errors:", len(R["errors"]))
    for e in R["errors"][:5]:
        print("  !", str(e)[:200])
sys.exit(1 if bot_errs else 0)
