"""Every authored room renders in a space that matches the wing it is in.

    python tests/room-mood/check.py

WHY THIS EXISTS.  `moodForRoom()` used to match the room NAME and ignore the
wing, and the result was invisible from any single screenshot: only three of the
Forgotten Foyer's twenty rooms still rendered in the Foyer.  Its Parlor played in
the study, its Music Room in the ballroom, its Formal Dining Room in the
kitchens, and six more in the passages, because "gallery", "landing" and "hall"
caught them.  Eight of the seventeen bosses fought in one identical crypt.

Nothing failed.  Every room had A backdrop, so the only thing that could catch it
was counting, which is what this does:

  1. a room plays in its own wing unless it is on the short exceptions list
  2. the exceptions list stays short — a regex that starts eating ordinary rooms
     is the round-2 failure coming back
  3. no boss is routed out of its own wing

Owned by the atmosphere agent.
"""
import asyncio, sys, json, re

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/tests/room-mood/index.html"
MAX_RELOCATIONS = 12          # 7 today; headroom for a few, not for a table

# slug -> atmosphere key, mirroring REGION_KEY in scenes/combat.js
HOME = {
    "foyer": "foyer", "nursery": "nursery", "sleeping-quarters": "sleeping",
    "kitchens-cellars": "kitchens", "greenhouse": "greenhouse", "graveyard": "graveyard",
    "study-library": "study", "attic-observatory": "attic", "lampworks": "lampworks",
    "ballroom": "ballroom", "crypt": "crypt", "hedge-maze": "hedge",
    "secret-passages": "passages", "bathhouse": "bathhouse", "kennels": "kennels",
    "pumpkin-grounds": "pumpkin", "heart": "heart",
}


async def collect():
    from playwright.async_api import async_playwright
    errs = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context()).new_page()
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto(URL)
        await page.wait_for_function("window.__ROOMMOOD !== undefined", timeout=60000)
        rows = await page.evaluate("window.__ROOMMOOD")
        await browser.close()
    if errs:
        print("page errors:", errs[:3])
    return rows


def main():
    rows = asyncio.run(collect())
    if not rows:
        print("FAIL  no rows — is tools/devserver.py running?")
        print("RESULT: 0 rooms, 1 failures")
        return 1

    fails, relocated = [], []
    per_wing = {}
    for r in rows:
        home = HOME.get(r["region"])
        if home is None:
            fails.append(f'unknown region slug {r["region"]!r}')
            continue
        at_home = r["mood"] == home
        per_wing.setdefault(r["region"], [0, 0])
        per_wing[r["region"]][1] += 1
        if at_home:
            per_wing[r["region"]][0] += 1
        else:
            relocated.append(r)
            if r["tag"] == "bo":
                fails.append(f'BOSS routed out of its wing: {r["region"]} '
                             f'{r["name"]!r} -> {r["mood"]}')

    print(f'{len(rows)} rooms · {len(rows) - len(relocated)} play in their own wing '
          f'· {len(relocated)} relocated')
    for reg, (home, tot) in per_wing.items():
        flag = "" if home >= tot * 0.75 else "   <-- wing is losing its own rooms"
        print(f'  {reg:20s} {home:2d}/{tot}{flag}')
        if home < tot * 0.75:
            fails.append(f'{reg}: only {home} of {tot} rooms render in their own wing')

    print("\nrelocated:")
    for r in relocated:
        print(f'  {r["region"]:20s} {r["name"]:32s} -> {r["mood"]}')

    if len(relocated) > MAX_RELOCATIONS:
        fails.append(f'{len(relocated)} rooms relocated; cap is {MAX_RELOCATIONS}. '
                     f'A rule is eating ordinary rooms again.')

    # A RESULT line like every other gate. This printed only PASS / FAIL, and
    # every sweep in the repo greps for `RESULT:`, so all of them skipped it.
    if fails:
        print("\nFAIL")
        for f in fails:
            print("  -", f)
        print("\nRESULT: %d rooms, %d failures" % (len(rows), len(fails)))
        return 1
    print("\nPASS")
    print("\nRESULT: %d rooms, 0 failures" % len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
