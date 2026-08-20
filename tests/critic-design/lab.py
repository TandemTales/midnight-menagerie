"""One encounter in detail, against loadouts real expeditions were carrying.

    python tests/critic-design/lab.py [--tier boss] [--enc foyer-boss] [--n 30]
                                      [--bots naive,competent] [--gen 8] [--trace]
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--tier", default="boss")
ap.add_argument("--enc", default="")
ap.add_argument("--n", type=int, default=30)
ap.add_argument("--gen", type=int, default=8)
ap.add_argument("--bots", default="naive,competent")
ap.add_argument("--pol", default="balanced")
ap.add_argument("--haunt", type=int, default=0)
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--trace", action="store_true")
ap.add_argument("--timeout", type=float, default=900)
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = (f"http://localhost:8777/tests/critic-design/lab.html?tier={a.tier}&enc={a.enc}"
       f"&n={a.n}&gen={a.gen}&bots={a.bots}&pol={a.pol}&haunt={a.haunt}&seed={a.seed}")

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
        print("LAB DID NOT FINISH:", str(e)[:160])
        print(pg.evaluate("document.body.innerText")[-2500:])
        b.close(); sys.exit(2)
    R = pg.evaluate("window.__LAB__")
    b.close()

(ROOT / "tests" / "critic-design" / "lab-result.json").write_text(json.dumps(R, indent=1), encoding="utf-8")

print(f"== {R['config']['TIER']} {R['config']['ENC'] or '(rolled)'}   loadouts: {len(R['loadouts'])}")
for l in R["loadoutSummary"][:6]:
    print(f"   deck {l['deck']} (+{l['up']})  keepsakes {l['keeps']}  snacks {l['snacks']}  "
          f"Courage {l['courage']}/{l['max']}")
for bot, v in R["rows"].items():
    print(f"\n-- {bot}: WIN {v['winRate']}%  n={v['n']}  timeouts {v['timeouts']}")
    print(f"   turns          {v['turns']}")
    print(f"   Courage at door{v['courageBefore']}")
    print(f"   damage taken   {v['dmgTaken']}   per turn {v['takenPerTurn']}")
    print(f"   damage dealt   {v['dmgDealt']}   per turn {v['dealtPerTurn']}")
    print(f"   enemy Guard    {v['enemyGuard']}   absorbed {v['blockedByEnemy']}")
    print(f"   enemy HP left when we lost  {v['enemyHpLeftOnLoss']}")
    print(f"   our HP left when we won     {v['hpAfterOnWin']}")
    print(f"   haunt {v['haunt']}  pierce {v['pierce']}  snacks {v['snacks']}")
    print(f"   by encounter   {v['byEncounter']}")
    print(f"   rules broken/fight {v.get('rulesBrokenPerFight')}")
    print(f"   enemy statuses/fight {v.get('enemyStatusPerFight')}   summons/fight {v.get('summonsPerFight')}")
if a.trace and R.get("trace"):
    print("\n-- turn trace (first fight)")
    for t in R["trace"]:
        es = " | ".join(f"{e['n']} {e['hp']}hp{'+' + str(e['blk']) if e['blk'] else ''} {e['i']}({e['d']})"
                        for e in t["enemies"])
        print(f"  T{t['turn']:>2} dealt {t['dealt']:>3}  took {t.get('took', 0):>3}  "
              f"me {t['php']}hp+{t['blk']}  [{es}]")
        print(f"       played: {', '.join(t['played'])}")
if R.get("errors"):
    print("\nERRORS:", len(R["errors"]))
    for e in R["errors"][:6]:
        print("  !", str(e)[:300])
if errs:
    print("\nCONSOLE:", len(errs))
    seen = set()
    for e in errs:
        s = str(e)[:180]
        if s not in seen:
            seen.add(s); print("  !", s)
        if len(seen) > 10:
            break
