"""Where does a party's Courage actually go against a boss?

    python tests/critic-design/party-ledger.py --enc nursery-boss --region nursery --n 12

The party form of `butler-ledger.html`. `party-boss.py` reports `left%` and
`cost`; both are downstream of one number nothing else measures — how much of
what the boss AIMED at the party its Guard ate before it landed.

That matters because "four Kids finish holding 89% of their Courage" has two
explanations wanting opposite fixes: the boss is not swinging enough (content),
or it swings plenty and is blocked (a Guard-budget problem no printed number
fixes, because four Kids generate four Kids' worth of Guard while one or two are
being aimed at).

Not a gate. It prints numbers for a designer to read.
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--tier", default="boss")
ap.add_argument("--enc", default="")
ap.add_argument("--region", default="foyer")
ap.add_argument("--lregion", default="", help="where the DECKS come from, if not --region")
ap.add_argument("--n", type=int, default=12)
ap.add_argument("--gen", type=int, default=8)
ap.add_argument("--sizes", default="1,2,3,4")
ap.add_argument("--slugs", default="marmalade,bones")
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--out", default="party-ledger-result.json")
ap.add_argument("--timeout", type=float, default=3600)
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = (f"http://localhost:8777/tests/critic-design/party-ledger.html?tier={a.tier}"
       f"&enc={a.enc}&region={a.region}&lregion={a.lregion or a.region}"
       f"&n={a.n}&gen={a.gen}&sizes={a.sizes}&slugs={a.slugs}&seed={a.seed}")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__LEDGER__ !== undefined", timeout=int(a.timeout * 1000))
    except Exception as e:
        print("LEDGER DID NOT FINISH:", str(e)[:160])
        print(pg.evaluate("document.body.innerText")[-2500:])
        b.close(); sys.exit(2)
    text = pg.evaluate("document.body.innerText")
    R = pg.evaluate("window.__LEDGER__")
    b.close()

print(text)
(ROOT / "tests" / "critic-design" / a.out).write_text(json.dumps(R, indent=1), encoding="utf-8")
if R.get("error"):
    print("CRASHED:", R["error"][:400]); sys.exit(2)
bad = sum(r.get("errs", 0) for r in R.get("table", []))
if bad:
    print(f"\n!! {bad} bot errors — NOT a trustworthy measurement until these are zero.")
if R.get("errors"):
    print("errors:", len(R["errors"]))
    for e in R["errors"][:5]:
        print("  !", str(e)[:200])
sys.exit(1 if bad else 0)
