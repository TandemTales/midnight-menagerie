"""Four Kids must not GRIND a fight one Kid finishes.

    python tests/critic-design/party-turns.py [--n 6] [--enc foyer-scare-coatcheck]

The sibling of `anchor.py`, and the gate that did not exist. `anchor.py` holds
the party harness honest at ONE seat, where `partyBench()` and `bench()` must
agree fight for fight. Nothing held it honest at FOUR, where there is nothing to
compare against — so it was free to be wrong, and it was, for two sessions.

`lib/bot.js` projected the rest of a fight as "enemy Courage remaining / MY
damage rate", with the Courage party-scaled and the rate belonging to one seat.
At four Kids that pinned `turnsLeft` to its 28-turn cap on every seat in every
fight, and `turnsLeft` multiplies the Guard term — so four Kids valued Guard
four times as highly as one Kid while the damage aimed at each of them had
fallen fourfold. They turtled, and the elite tier read as a 44-turn grind.

Measured on the Grand Coatcheck, n=12, same seed, before and after:

    party   turns          partyGuard
     1p     6.9 -> 6.9      49 ->   49     (unchanged, as it must be)
     2p     8.3 -> 8.4     145 ->  149
     3p    23.3 -> 8.8     578 ->  217
     4p    49.7 -> 8.6    1993 ->  475

Two independent assertions, because one number moving is a story and two moving
together is a mechanism: four Kids finish within 2.0x solo's turns, and raise
under 20x solo's Guard doing it. Before the fix: 7.2x and 40.5x.

The bounds are deliberately generous. This is a gate against a bug class, not a
balance target — it should fire only when the harness has stopped describing a
game anybody would play.

Exit code 1 if either bound is broken.
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=6)
ap.add_argument("--gen", type=int, default=6)
ap.add_argument("--enc", default="foyer-scare-coatcheck")
ap.add_argument("--region", default="foyer")
ap.add_argument("--tier", default="elite")
ap.add_argument("--slugs", default="marmalade,bones")
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--turn-ratio", type=float, default=2.0)
ap.add_argument("--guard-ratio", type=float, default=20)
ap.add_argument("--timeout", type=float, default=1800)
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = (f"http://localhost:8777/tests/critic-design/party-turns.html"
       f"?n={a.n}&gen={a.gen}&enc={a.enc}&region={a.region}&tier={a.tier}"
       f"&slugs={a.slugs}&seed={a.seed}"
       f"&turnRatio={a.turn_ratio}&guardRatio={a.guard_ratio}")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__TURNS__ !== undefined", timeout=int(a.timeout * 1000))
    except Exception as e:
        print("PARTY-TURNS DID NOT FINISH:", str(e)[:160])
        print(pg.evaluate("document.body.innerText")[-2000:])
        b.close(); sys.exit(2)
    R = pg.evaluate("window.__TURNS__")
    print(pg.evaluate("document.body.innerText"))
    b.close()

if R.get("error"):
    print("CRASHED:", R["error"][:400])
    sys.exit(2)

(ROOT / "tests" / "critic-design" / "party-turns-result.json").write_text(
    json.dumps(R, indent=1), encoding="utf-8")

ok = R["failed"] == 0
print(f"\n{R['passed']} passed, {R['failed']} failed — {'PASSED' if ok else 'FAILED'}")
if errs:
    print("console errors:", len(errs))
    for e in errs[:4]:
        print("  !", str(e)[:200])
sys.exit(0 if ok else 1)
