"""Price every region's ordinary content against ONE constant wing-one player.

    python tests/critic-design/ladder.py [--gen 8] [--n 16] [--tier standard]

`tests/run/run.py`'s cost ledger prices a wing against the player who actually
reaches it, which cannot separate "this wing is gentle" from "the player who
gets here is strong" — and by the fifth wing that player holds 23 to 32 of the
game's 58 Keepsakes, so the second reading is always available.

This holds the player still. One `loadoutAtBoss` captured at the end of the
Foyer — about 14 cards and 4 Keepsakes — walks into every region's Scuffle pool
at full Courage. What is left is the authored ladder's own shape.

Exit code 1 if any bench errored.
"""
import asyncio, sys, argparse, json, pathlib

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[2]


async def main(a):
    from playwright.async_api import async_playwright
    url = (f"http://localhost:8777/tests/critic-design/ladder.html"
           f"?gen={a.gen}&n={a.n}&tier={a.tier}&seed={a.seed}&haunt={a.haunt}"
           f"&hpscale={a.hpscale}&benchhaunt={a.benchhaunt if a.benchhaunt is not None else a.haunt}")
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        pg = await b.new_page()
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        await pg.goto(url, wait_until="load", timeout=60000)
        try:
            await pg.wait_for_function("window.__LADDER__ !== undefined",
                                       timeout=int(a.timeout * 1000))
        except Exception:
            print("!! ladder did not finish within %.0fs" % a.timeout)
        res = await pg.evaluate("window.__LADDER__ || null")
        await b.close()

    for e in errs[:20]:
        print("ERR " + e)
    if not res:
        print("RESULT: 0 regions, 1 errors (page never reported)")
        return 1

    print("\nthe ladder, priced against ONE wing-one player")
    if res["config"].get("HPSCALE", 1) != 1:
        print("  !! hpScale %s - a WHAT-IF, not a shipping number"
              % res["config"]["HPSCALE"])
    print("  %d loadouts, %s tier, %d fights per region, full Courage each time"
          % (res.get("loadouts", 0), res["config"]["TIER"], res["config"]["N"]))
    if res["config"].get("BHAUNT", 0) != res["config"].get("HAUNT", 0):
        print("  loadouts generated at Haunt %s, content measured at Haunt %s"
              % (res["config"]["HAUNT"], res["config"]["BHAUNT"]))
    print("  %-4s %-22s %-7s %-7s %-10s %-9s %-7s %-8s %-9s %-8s %s"
          % ("#", "region", "fights", "win%", "mean cost", "% of pool", "turns",
             "pool", "wall/turn", "swing", "absorbed"))
    for r in res.get("table") or []:
        print("  %-4d %-22s %-7d %-7s %-10.1f %-9s %-7.1f %-8.0f %-9.1f %-8.1f %s"
              % (r["index"], r["region"], r["fights"], "%.0f%%" % r["win"],
                 r["cost"], "%.0f%%" % r["pct"], r["turns"], r["pool"],
                 r.get("wall", 0), r.get("swing", 0),
                 "%.0f%%" % r.get("absorbed", 0)))
    if res.get("slope") is not None:
        t = res["table"]
        print("  wing 1 %.1f%% of pool -> wing %d %.1f%% = x%.2f"
              % (t[0]["pct"], t[-1]["index"], t[-1]["pct"], res["slope"]))
    print("  A RISING '%% of pool' is a ladder. A flat one is not.")
    print("")
    print("  wall/turn = Guard the board raises each turn. swing = damage the deck")
    print("  puts out each turn, landed plus absorbed. absorbed = the share Guard")
    print("  ate. engine.js ~2918: Guard is wiped and re-granted every turn, so a")
    print("  deck that cannot out-damage the WALL never moves the Courage bar at")
    print("  all. A wall near the swing is a stall waiting for a weaker deck, and")
    print("  no pool cut, route ceiling or re-authoring can reach it.")

    out = ROOT / "tests" / "critic-design" / a.out
    out.write_text(json.dumps(res, indent=1), encoding="utf-8")
    print("\n  wrote %s" % out.name)

    bad = len(res.get("errors") or []) + len(errs)
    print("\nRESULT: %d regions, %d errors" % (len(res.get("table") or []), bad))
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--gen", type=int, default=8)
    ap.add_argument("--n", type=int, default=16)
    ap.add_argument("--tier", default="standard")
    ap.add_argument("--seed", type=int, default=90000)
    ap.add_argument("--haunt", type=int, default=0)
    # A what-if lever, and the proof this gate can SEE (CONTRACTS 54): at 2
    # every row must move. A gate that indicts fifteen of seventeen regions
    # has to show it responds to content strength before its verdict counts.
    # Shipping numbers are always 1.
    ap.add_argument("--hpscale", type=float, default=1.0)
    # Haunt of the CONTENT being measured. --haunt alone also raises the
    # Haunt of the expeditions that generate the constant player, which
    # un-constants it; pass --benchhaunt to move only the content.
    ap.add_argument("--benchhaunt", type=int, default=None)
    ap.add_argument("--out", default="ladder-result.json")
    ap.add_argument("--timeout", type=float, default=2400)
    sys.exit(asyncio.run(main(ap.parse_args())))
