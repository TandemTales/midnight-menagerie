"""Whole-region balance simulation, driven through the REAL Run and CombatEngine.

    python tests/critic-design/sim.py [--n 25] [--bots naive,competent]
                                      [--policies balanced,...] [--haunt 0]
                                      [--bench 40] [--seed 90000] [--clutter 0]
                                      [--out sim-result.json] [--timeout 3600]

Everything the previous version measured was measured against the unmodified
10-card starting deck. This one plays a run: it walks the map, drafts card
rewards, collects Keepsakes and Snacks, rests, upgrades, shops, and carries
Courage from room to room, all the way to the boss.
"""
import sys, json, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=12)
ap.add_argument("--bots", default="naive,competent")
ap.add_argument("--policies", default="balanced")
ap.add_argument("--haunt", type=int, default=0)
ap.add_argument("--bench", type=int, default=0)
ap.add_argument("--seed", type=int, default=90000)
ap.add_argument("--clutter", default="1")
ap.add_argument("--regionheal", default="0",
                help="WHAT-IF: restore this fraction of max Courage on clearing a region")
ap.add_argument("--out", default="sim-result.json")
ap.add_argument("--timeout", type=float, default=3600)
ap.add_argument("--quiet", action="store_true")
a = ap.parse_args()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = (f"http://localhost:8777/tests/critic-design/sim.html"
       f"?n={a.n}&bots={a.bots}&policies={a.policies}&haunt={a.haunt}"
       f"&bench={a.bench}&seed={a.seed}&clutter={a.clutter}&regionheal={a.regionheal}")

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
        print("SIM DID NOT FINISH:", str(e)[:200])
        print(pg.evaluate("document.body.innerText")[-4000:])
        for l in errs[-20:]:
            print("  !", str(l)[:250])
        b.close()
        sys.exit(2)
    res = pg.evaluate("window.__RESULT__")
    b.close()

(ROOT / "tests" / "critic-design" / a.out).write_text(json.dumps(res, indent=1), encoding="utf-8")


def line(k, s):
    if not s or not s.get("n"):
        return f"  {k:<26} —"
    return (f"  {k:<26} n={s['n']:<5} mean {s['mean']:<7} "
            f"p25 {s['p25']:<5} med {s['med']:<5} p75 {s['p75']:<5} max {s['max']}")


def tier_lines(byTier, indent="  "):
    for tier in ("scuffle", "elite", "boss"):
        t = byTier.get(tier) or {}
        if not t.get("n"):
            print(f"{indent}{tier:<8} —")
            continue
        print(f"{indent}{tier:<8} n={t['n']:<4} win {t['winRate']}%  "
              f"turns mean {t['turns']['mean']} (med {t['turns']['med']})  "
              f"Courage cost mean {t['courageCost']['mean']} (med {t['courageCost']['med']})  "
              f"haunt {t['hauntDamage']['mean']}  pierce {t['pierceHits']}  snacks {t['snacksUsed']}")


def ledger_line(lg, indent="  "):
    print(f"{indent}Courage ledger: scuffles -{lg.get('scuffle')}  elites -{lg.get('elite')}  "
          f"boss -{lg.get('boss')}  events -{lg.get('event')}  hazards -{lg.get('hazard')}  "
          f"| rests +{lg.get('rested')} ({lg.get('rests')}x)  in-combat +{lg.get('combatHeal')}  "
          f"events +{lg.get('healed')}")


for key, S in res["cells"].items():
    print(f"\n═══ {key}  ({S['expeditions']} expeditions, haunt {res['config']['HAUNT']}, "
          f"{S.get('regionsTarget', 1)} region ladder)")
    print(f"  WHOLE-RUN SURVIVAL      {S['survival']}%   "
          f"(deaths {S['deaths']}, stalls {S['stalls']}, "
          f"regions cleared mean {S.get('regionsCleared', {}).get('mean')})")
    print(f"  deaths by region/room   {S['deathsBy']}")

    for G in S.get("regions", []):
        print(f"\n  ── region {G['index']}: {G['region']} "
              f"— entered {G['entered']}/{S['expeditions']} ({G['enteredPct']}%), "
              f"cleared {G['clearedPct']}% of those")
        print(f"     reached its boss {G['reachedBoss']}%  |  "
              f"boss win given reached {G['bossWinGivenReached']}% (n={G['bossN']})")
        tier_lines(G["byTier"], indent="     ")
        e = G["earlyScuffles"]
        if e.get("n"):
            print(f"     first 3 Scuffles: turns {e['turns']['mean']}  "
                  f"Courage cost {e['courageCost']['mean']}  free fights {e['freeFights']}%")
        ledger_line(G.get("ledger", {}), indent="     ")
        print(f"     rooms: {G.get('visited')}")
        print(f"     ENTERED region with: Courage {G['entryCourage']['mean']}"
              f"/{G['entryMaxCourage']['mean']} ({G['entryCouragePct']['mean']}%)  "
              f"deck {G['entryDeck']['mean']} (+{G['entryUpgrades']['mean']})  "
              f"keepsakes {G['entryKeepsakes']['mean']}")
        print("    " + line("Courage at boss door", G.get("courageAtBoss")))
        print("    " + line("  ... as % of max", G.get("courageAtBossPct")))
        print("    " + line("deck at boss door", G.get("deckAtBoss")))
        print("    " + line("upgrades at boss door", G.get("upgradesAtBoss")))
        print("    " + line("keepsakes at boss door", G.get("keepsakesAtBoss")))

    print("\n  ── whole run")
    tier_lines(S["byTier"])
    ledger_line(S.get("ledger", {}))
    print(f"  rooms/run: {S.get('visited')}")
    print(line("deck size at end", S["deckEnd"]))
    print(line("upgrades at end", S["upgradesEnd"]))
    print(line("keepsakes at end", S["keepsakesEnd"]))
    print(f"  haunt Courage total {S['hauntTotal']}   piercing hits {S['pierceTotal']}"
          f"   {S['msPerRun']}ms/expedition")

if res.get("bench"):
    print("\n═══ BENCH (captured pre-fight loadouts, replayed)")
    for k, v in res["bench"].items():
        if not v.get("n"):
            print(f"  {k:<32} {v.get('note')}")
            continue
        print(f"  {k:<32} win {v['winRate']}%  n={v['n']}  turns {v['turns']['mean']} "
              f"(med {v['turns']['med']})  Courage cost {v['courageCost']['mean']}  "
              f"deck {v['deckSize']['mean']} (+{v['upgrades']['mean']})  "
              f"keepsakes {v['keepsakes']['mean']}  timeouts {v['timeouts']}")
        print(f"     by encounter: {v['byEncounter']}")

if res.get("errors"):
    print(f"\n═══ ERRORS {len(res['errors'])}")
    for e in res["errors"][:12]:
        print("  !", str(e)[:400])
if errs:
    print(f"\n═══ CONSOLE ERRORS {len(errs)}")
    seen = set()
    for e in errs:
        s = str(e)[:200]
        if s in seen:
            continue
        seen.add(s)
        print("  !", s)
        if len(seen) > 15:
            break
