"""Two Kids taking turns at one screen, driven the way two people would.

    python tests/coop/hotseat.py

Clicks END TURN as seat 0, expects the pass-it-over veil, clicks through it,
checks the screen really is seat 1's now — their Companion named under the
painting, their hand in the fan, their Backpack in the top bar — ends again,
and expects the enemy phase to have run and the round to come back to seat 0.

This exists for the same reason `select.py` does. Everything else about co-op
is asserted against objects, and pass-and-play is the one part where the OBJECT
being right proves nothing: `run.localSeat` moving is a one-line change, and the
screen following it is a dozen places that were each set once at entry. The
first version of this caught a real one — after the enemy phase the Kid who
happened to end last kept the screen, so the two of them swapped who went first
every single round.

Exit code 1 on any failure or console error.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

ROOT = r"C:\Users\Josh\OneDrive\Desktop\Tandem Tales\Midnight Menagerie"
SHOTS = os.path.join(ROOT, "shots")

WHO = """() => {
  const sc = window.MM.ctx.scenes.current;
  const r = window.MM.ctx.run;
  const e = sc.engine;
  return {
    localSeat: r.localSeat,
    kid: r.kidName,
    comp: r.companion,
    nameUnderArt: (document.querySelector('.cb-player__name') || {}).textContent,
    handUids: sc.hand ? sc.hand.cards().map(c => c.uid).sort() : [],
    seatHandUids: sc.mePiles ? sc.mePiles.hand.map(c => c.uid).sort() : [],
    ended: e ? e.players.map(p => ({ seat: p.seat, ended: p.ended })) : [],
    turn: e ? e.turn : null,
    phase: e ? e.phase : null,
    veil: !!document.querySelector('.mm-handoff'),
    veilName: (document.querySelector('.hoff__name') || {}).textContent || null,
  };
}"""

fails = []
def check(cond, label, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(label)


async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        page = await (await b.new_context(viewport={"width": 1600, "height": 900})).new_page()
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto("http://localhost:8777/game/index.html#scene=select", wait_until="load", timeout=45000)
        await page.wait_for_timeout(2500)
        await page.click(".sel-pair"); await page.wait_for_timeout(200)

        async def pick(comp, kid):
            await page.click('.companion-tile[data-slug="%s"]' % comp); await page.wait_for_timeout(600)
            await page.click('[data-act="tokid"]'); await page.wait_for_timeout(900)
            await page.click('.kid-tile[data-slug="%s"]' % kid); await page.wait_for_timeout(900)

        await pick("marmalade", "maya")
        await page.click(".btn--go"); await page.wait_for_timeout(1200)
        await pick("bones", "eli")
        await page.click(".btn--go"); await page.wait_for_timeout(6500)
        await page.evaluate("() => { document.querySelector('.map-nodes').children[0].click(); }")
        await page.wait_for_timeout(9000)

        a = await page.evaluate(WHO)
        check(a["localSeat"] == 0, "the fight opens on seat 0", str(a["localSeat"]))
        check(a["comp"] == "marmalade", "showing Maya's Companion", a["comp"])
        check(a["nameUnderArt"] == "Marmalade", "and Marmalade is named under the painting", a["nameUnderArt"])
        check(a["handUids"] == a["seatHandUids"], "the fan is seat 0's hand")
        seat0_hand = a["handUids"]

        # END TURN, as a player clicks it
        await page.click("#end-turn")
        await page.wait_for_timeout(2500)
        v = await page.evaluate(WHO)
        check(v["veil"], "the board is covered", "veil up")
        check(bool(v["veilName"]) and "Eli" in (v["veilName"] or ""), "and it names the next Kid", v["veilName"])
        check(v["localSeat"] == 0, "the seat has NOT moved until they say they are ready", str(v["localSeat"]))
        await page.screenshot(path=os.path.join(SHOTS, "hotseat-pass.png"))

        await page.click(".hoff__go")
        await page.wait_for_timeout(2500)
        c = await page.evaluate(WHO)
        check(not c["veil"], "the veil lifts")
        check(c["localSeat"] == 1, "the screen is seat 1's now", str(c["localSeat"]))
        check(c["comp"] == "bones", "showing Eli's Companion", c["comp"])
        check(c["nameUnderArt"] == "Bones", "and Bones is named under the painting", c["nameUnderArt"])
        check(c["handUids"] == c["seatHandUids"], "the fan is seat 1's hand")
        check(sorted(c["handUids"]) != sorted(seat0_hand), "which is a different hand from seat 0's")
        check(c["turn"] == 1, "still turn 1 — the enemies have not moved", str(c["turn"]))
        await page.screenshot(path=os.path.join(SHOTS, "hotseat-seat1.png"))

        # seat 1 ends too: the table is ready, the enemy phase runs, turn 2 opens
        await page.click("#end-turn")
        await page.wait_for_timeout(6000)
        d = await page.evaluate(WHO)
        check(d["turn"] == 2 or d["phase"] == "over", "the enemy phase ran and turn 2 opened",
              f"turn {d['turn']} phase {d['phase']}")
        check(d["veil"] or d["localSeat"] == 0 or d["phase"] == "over",
              "and it comes back round to a Kid", f"seat {d['localSeat']} veil {d['veil']}")
        await page.screenshot(path=os.path.join(SHOTS, "hotseat-turn2.png"))

        await b.close()

    print("console errors:", len(errors))
    for e in errors[:8]:
        print("   ", e[:220])
    print("RESULT: %d failures, %d console errors" % (len(fails), len(errors)))
    if fails or errors:
        sys.exit(1)

asyncio.run(main())
