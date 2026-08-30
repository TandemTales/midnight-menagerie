"""Two Kids taking turns at one screen, driven the way two people would.

    python tests/coop/hotseat.py

Clicks END TURN as seat 0, expects the pass-it-over veil, clicks through it,
checks the screen really is seat 1's now — their Companion named under the
painting, their hand in the fan, their Backpack in the top bar — ends again,
and expects the enemy phase to have run and the round to come back to seat 0.

This exists for the same reason `selectscreen.py` does. Everything else about co-op
is asserted against objects, and pass-and-play is the one part where the OBJECT
being right proves nothing: `run.localSeat` moving is a one-line change, and the
screen following it is a dozen places that were each set once at entry. The
first version of this caught a real one — after the enemy phase the Kid who
happened to end last kept the screen, so the two of them swapped who went first
every single round.

Exit code 1 on any failure or console error.
"""
import asyncio, json, os, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument("--party", type=int, default=2, help="how many Kids at the one screen")
ARGS = ap.parse_args()
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
    /* What the draw-pile PANEL would actually show, off the real method the
       panel calls, against what the button above it counts (this seat) and what
       seat 0 is holding. These were the same expression for every Kid until
       2026-08-29: the button showed mine and the panel opened the host's. */
    panelDrawUids: (e && sc._pileCards) ? sc._pileCards('draw').map(c => c.uid).sort() : null,
    seatDrawUids: sc.mePiles ? sc.mePiles.draw.map(c => c.uid).sort() : null,
    seat0DrawUids: e ? e.state.piles.draw.map(c => c.uid).sort() : null,
  };
}"""

fails = []
def check(cond, label, detail=""):
    # flush: stdout is block-buffered to a file while a traceback goes straight
    # out on stderr, so without this the log claims the run died several checks
    # earlier than it did — which sent me hunting the wrong screen.
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""),
          flush=True)
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
        # The party-size control replaced the two-state checkbox on 2026-08-28.
        WANT = max(2, min(4, ARGS.party))
        await page.click(f'.sel-pair__size[data-n="{WANT}"]'); await page.wait_for_timeout(200)

        async def pick(comp, kid):
            await page.click('.companion-tile[data-slug="%s"]' % comp); await page.wait_for_timeout(600)
            await page.click('[data-act="tokid"]'); await page.wait_for_timeout(900)
            await page.click('.kid-tile[data-slug="%s"]' % kid); await page.wait_for_timeout(900)

        # Companions are DISCOVERED: only rescued ones are selectable, so naming
        # four would time out on the third in a fresh save.
        avail = await page.eval_on_selector_all(
            ".companion-tile:not(.is-locked):not([disabled])",
            "els => els.map(e => e.dataset.slug).filter(Boolean)")
        KIDS_IN = ["maya", "eli", "priya", "samir"][:WANT]
        for i, kid in enumerate(KIDS_IN):
            await pick(avail[i % len(avail)], kid)
            last = (i == len(KIDS_IN) - 1)
            await page.click(".btn--go")
            await page.wait_for_timeout(6500 if last else 1200)
        # ── into the first fight, which now takes a vote per Kid ────────────
        # The route is voted (STS2-REFERENCE 8.5): one click used to walk the
        # whole party in, and now it puts one Kid's pin on a room and hands the
        # sheet over. This suite is about END TURN and the veil in COMBAT, so
        # it votes everybody onto the SAME room — no roulette, one known fight
        # — rather than testing the ballot here. That is tests/vote's job.
        room = await page.evaluate(
            "() => (document.querySelector('.map-node.is-legal') || {}).dataset?.id")
        assert room, "no legal room on the blueprint to vote for"
        for _ in range(WANT):
            await page.evaluate(
                """(id) => document.querySelector(`.map-node[data-id="${id}"]`).click()""",
                room)
            await page.wait_for_timeout(1700)
            go = await page.query_selector(".hoff__go")
            if go:
                await go.click()
                await page.wait_for_timeout(1800)
        await page.wait_for_timeout(9000)

        a = await page.evaluate(WHO)
        check(a["localSeat"] == 0, "the fight opens on seat 0", str(a["localSeat"]))
        check(a["comp"] == "marmalade", "showing Maya's Companion", a["comp"])
        check(a["nameUnderArt"] == "Marmalade", "and Marmalade is named under the painting", a["nameUnderArt"])
        check(a["handUids"] == a["seatHandUids"], "the fan is seat 0's hand",
              f"fan {len(a['handUids'])} {a['handUids'][:9]} vs seat {len(a['seatHandUids'])} {a['seatHandUids'][:9]}")
        seat0_hand = a["handUids"]

        # Every seat ends its own turn, in order, with a veil between each.
        # This used to be written for exactly two Kids: one END TURN, one veil,
        # one more END TURN and the enemy phase. At four that reads as a
        # failure when the round is simply not over yet, so the loop counts.
        hands = [seat0_hand]
        for seat in range(WANT):
            last = (seat == WANT - 1)
            await page.click("#end-turn")
            # WAIT FOR THE CONDITION, never a fixed sleep. The enemy phase
            # animates every Kid being attacked and takes longer with more of
            # them; a fixed 6s passed and failed on alternate runs. That is the
            # measurement trap in CONTRACTS, in miniature.
            try:
                await page.wait_for_function("""(prev) => {
                  const sc = window.MM.ctx.scenes.current;
                  const e = sc && sc.engine;
                  if (!e || e.over) return true;
                  return !!document.querySelector('.mm-handoff')
                      || window.MM.ctx.run.localSeat !== prev;
                }""", arg=seat, timeout=30000)
            except Exception:
                pass

            v = await page.evaluate(WHO)
            if v["phase"] == "over":
                break
            check(v["veil"], f"seat {seat} ending covers the board", "veil up")
            check(v["localSeat"] == seat,
                  "the seat has NOT moved until they say they are ready", str(v["localSeat"]))
            if seat == 0:
                await page.screenshot(path=os.path.join(SHOTS, "hotseat-pass.png"))

            await page.click(".hoff__go")
            await page.wait_for_timeout(2600)
            c = await page.evaluate(WHO)
            check(not c["veil"], f"the veil lifts after seat {seat}")
            if not last:
                check(c["localSeat"] == seat + 1,
                      f"the screen is seat {seat + 1}'s now", str(c["localSeat"]))
                check(c["handUids"] == c["seatHandUids"], f"the fan is seat {seat + 1}'s hand")
                check(all(sorted(c["handUids"]) != sorted(h) for h in hands),
                      f"seat {seat + 1}'s hand is nobody else's")
                hands.append(c["handUids"])
                # The pile PANEL, off the real method it opens with. The button
                # above it has always counted this seat; the panel used to open
                # seat 0's cards for everybody else.
                check(c["panelDrawUids"] == c["seatDrawUids"],
                      f"the draw panel shows seat {seat + 1}'s own cards",
                      f"{len(c['panelDrawUids'] or [])} shown vs "
                      f"{len(c['seatDrawUids'] or [])} in the pile")
                check(c["panelDrawUids"] != c["seat0DrawUids"],
                      f"and NOT the host's — seat {seat + 1} is not seat 0")
                check(c["turn"] == 1, "still turn 1 — the enemies have not moved", str(c["turn"]))
            else:
                check(c["turn"] == 2 or c["phase"] == "over",
                      "every seat has ended, so the enemy phase ran and turn 2 opened",
                      f"turn {c['turn']} phase {c['phase']}")
                check(c["localSeat"] == 0 or c["phase"] == "over",
                      "and the new round starts back at seat 0",
                      f"seat {c['localSeat']}")
                await page.screenshot(path=os.path.join(SHOTS, "hotseat-turn2.png"))

        await b.close()

    print("console errors:", len(errors))
    for e in errors[:8]:
        print("   ", e[:220])
    print("RESULT: %d failures, %d console errors" % (len(fails), len(errors)))
    if fails or errors:
        sys.exit(1)

asyncio.run(main())
