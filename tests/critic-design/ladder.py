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
           f"?gen={a.gen}&n={a.n}&tier={a.tier}&seed={a.seed}&haunt={a.haunt}")
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
    print("  %d loadouts, %s tier, %d fights per region, full Courage each time"
          % (res.get("loadouts", 0), res["config"]["TIER"], res["config"]["N"]))
    print("  %-4s %-22s %-8s %-8s %-11s %-10s %-8s %s"
          % ("#", "region", "fights", "win%", "mean cost", "% of pool", "turns", "enemy Courage"))
    for r in res.get("table") or []:
        print("  %-4d %-22s %-8d %-8s %-11.1f %-10s %-8.1f %.0f"
              % (r["index"], r["region"], r["fights"], "%.1f%%" % r["win"],
                 r["cost"], "%.1f%%" % r["pct"], r["turns"], r["pool"]))
    if res.get("slope") is not None:
        t = res["table"]
        print("  wing 1 %.1f%% of pool -> wing %d %.1f%% = x%.2f"
              % (t[0]["pct"], t[-1]["index"], t[-1]["pct"], res["slope"]))
    print("  A RISING '%% of pool' is a ladder. A flat one is not.")

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
    ap.add_argument("--out", default="ladder-result.json")
    ap.add_argument("--timeout", type=float, default=2400)
    sys.exit(asyncio.run(main(ap.parse_args())))
