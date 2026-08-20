"""Headless balance simulation: N seeded Foyer Scuffles + the Butler with the
marmalade starting deck and a greedy AI, driven through the REAL CombatEngine.

    python tests/critic-design/sim.py [N]
"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 200
URL = f"http://localhost:8777/tests/critic-design/sim.html?n={N}"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader"])
    pg = b.new_page()
    errs, console = [], []
    pg.on("console", lambda m: (console.append(f"[{m.type}] {m.text}"),
                                errs.append(m.text) if m.type == "error" else None))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="load", timeout=60000)
    try:
        pg.wait_for_function("window.__DONE__ === true", timeout=600000)
    except Exception as e:
        print("SIM DID NOT FINISH:", str(e)[:200])
        print(pg.evaluate("document.body.innerText")[:4000])
        for l in console[-40:]: print(" ", l[:300])
        b.close(); sys.exit(2)
    res = pg.evaluate("window.__RESULT__")
    b.close()

(ROOT / "tests" / "critic-design" / "sim-result.json").write_text(
    json.dumps(res, indent=1), encoding="utf-8")

for bt in res["batches"]:
    print(f"\n== {bt['label']}  ({bt['encId']}, n={bt['n']})")
    print(f"   win {bt['winRate']}%   losses {bt['losses']}   timeouts {bt['timeouts']}")
    print(f"   turns      {bt['turns']}")
    print(f"   dmg taken  {bt['dmgTaken']}")
    print(f"   hp left    {bt['hpLeft']}")
    print(f"   turn hist  {bt['turnHist']}")
print(f"\n== INTENT vs ACTUAL: {res['auditRows']} enemy turns audited, "
      f"{len(res['auditMismatch'])} mismatched")
for m in res["auditMismatch"][:15]:
    print("   ", json.dumps(m))
print("\n== display hints the engine ignores:", len(res.get("hintGaps", [])))
for h in res.get("hintGaps", [])[:25]: print("   ", h)
print("\n== EnemyDef hooks declared across roster:", json.dumps(res.get("declaredHooks")))
print("   dust-bunny declares:", res.get("hooksDeclaredOnDustBunny"))
print("   engine ACTUALLY called:", res.get("hooksActuallyCalled"))
print("\n== coatrack probe:", json.dumps(res.get("coatrackProbe")))
print("\n== dust bunny probe:", json.dumps(res.get("dustBunnyProbe"), indent=1)[:1800])
print("\n== butler probe:", json.dumps(res.get("butlerProbe"), indent=1)[:2200])
if res.get("notes"):
    print("\n== NOTES/THROWS:", len(res["notes"]))
    for n_ in res["notes"][:15]: print("   ", n_[:300])
if errs:
    print("\n== CONSOLE ERRORS:", len(errs))
    for e in errs[:20]: print("   !", str(e)[:300])
