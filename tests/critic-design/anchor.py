"""The party harness's anchor: partyBench(size 1) must reproduce bench() exactly.

    python tests/critic-design/anchor.py [--n 6]

A measuring instrument nothing checks is a story. With ONE Kid, `partyBench()`
and `bench()` are meant to be the same fight, so they must agree fight for
fight — same win, same turn count, same damage taken. Every party row the new
harness prints rests on this row agreeing.

It has already earned its place three times. Building it caught:

  1. `tests/coop/balance.html` running TWO enemy phases every round — it called
     `endTurn(seat)` for each seat and then closed the table again, after the
     round had already resolved and the next one opened. Counting
     `phase:'enemy'` per round read [2,2,2,2] against [1,1,1,1] once guarded.
  2. `lib/bot.js` scoring CLONES while reading the REAL board, whenever a seat
     was passed — `seatOf` held an actor from the caller's engine, so the beam
     search never saw its own plan. It only did this in co-op, which is where
     the co-op numbers came from.
  3. the node id seeding the fight (`run.fork('combat:' + node.id)`), which made
     two correct harnesses look like they disagreed.

Exit code 1 if any fight disagrees.
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=6)
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--timeout", type=float, default=1800)
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = f"http://localhost:8777/tests/critic-design/anchor.html?n={a.n}&seed={a.seed}"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__ANCHOR__ !== undefined", timeout=int(a.timeout * 1000))
    except Exception as e:
        print("ANCHOR DID NOT FINISH:", str(e)[:160])
        print(pg.evaluate("document.body.innerText")[-2000:])
        b.close(); sys.exit(2)
    R = pg.evaluate("window.__ANCHOR__")
    print(pg.evaluate("document.body.innerText"))
    b.close()

if R.get("error"):
    print("CRASHED:", R["error"][:400])
    sys.exit(2)

(ROOT / "tests" / "critic-design" / "anchor-result.json").write_text(
    json.dumps(R, indent=1), encoding="utf-8")

ok = R["n"] > 0 and R["agree"] == R["n"]
print(f"\n{R['agree']}/{R['n']} agree — {'PASSED' if ok else 'FAILED'}")
if errs:
    print("console errors:", len(errs))
    for e in errs[:4]:
        print("  !", str(e)[:200])
sys.exit(0 if ok else 1)
