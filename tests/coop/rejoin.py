"""A player drops in the middle of a fight, and the expedition survives it.

    python tests/coop/rejoin.py

Needs the dev server on :8777. Two real tabs on the BroadcastChannel wire, real
screens, a real fight. Everything `net/session.js` promised about reconnection had
tests of its own and no caller in the game: nothing told a player that a friend had
gone, the table simply stopped answering, and Continue on a co-op save quietly
turned it into one person playing everybody's Kid. So this drives what a player
would actually go through:

    1. a friend's page dies mid-fight; the other screen SAYS so
    2. they come back, while the table waited, onto the same board with the same hand
    3. the fight then carries on and the two machines still agree
    4. they die again; this time the table plays on, and the turn really advances
    5. they come back to a table that went on without them, and are dealt back in
    6. a stranger with the same password is told, not left waiting
    7. everybody leaves, and both come back: the lower seat opens the house by itself
    8. everybody leaves again, and one player opens the house back up from their save

Tabs in ONE browser context share localStorage, so a tab's own save is overwritten
by the other's. Where a save matters the test hands the scene the snapshot that
player would have on disk, which is what title.js reads and passes.

Exit 0 only when every check passes and no page logs an unexpected error.
"""
import asyncio
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOM = "rope-hollow"
BASE = "http://localhost:8777/game/index.html"
URL = f"{BASE}#scene=lobby&room={ROOM}"

fails, passes = [], []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""), flush=True)


STATE = """() => {
  const c = window.MM.ctx, r = c.run, s = r && r.session, e = r && r.combat;
  return {
    scene: c.scenes.currentName, seat: r ? r.localSeat : null,
    node: r ? r.currentNodeId : null, net: !!(s && s.remote),
    inSync: s ? s.inSync : null, lost: s ? [...s.lost] : [], gone: s ? [...s.gone] : [],
    kidsGone: r ? r.kids.map(k => !!k.gone) : [],
    pending: s ? s.log.length - s._applied : 0,
    turn: e ? e.turn : 0, phase: e ? e.phase : null, over: e ? !!e.over : false,
    digest: e ? r._combatDigest(e) : null,
    hand: e ? e.players[r.localSeat].piles.hand.map(x => x.id).join('|') : '',
    shown: (c.scenes.current && c.scenes.current.hand && c.scenes.current.hand.cards)
      ? c.scenes.current.hand.cards().length : -1,
    ended: e ? e.players.map(p => !!p.ended) : [],
    plate: document.querySelector('.net-plate')?.textContent || '',
    absent: e ? e.players.map(p => !!p.absent) : [],
  };
}"""

VOTE = """() => {
  const r = window.MM.ctx.run;
  const id = r.legalNextIds().sort()[0];
  r.session.input({ t: 'room', act: 'map.vote', id });
  return id;
}"""

# Walk the nearest fight: rooms that are not fights are left through the run itself.
PLAY_ONE = """async () => {
  const r = window.MM.ctx.run, e = r.combat;
  const pl = e.players[r.localSeat];
  const foe = e.enemies.find(x => x.alive);
  for (let i = 0; i < pl.piles.hand.length; i++) {
    const c = pl.piles.hand[i];
    for (const t of [foe && foe.id, null]) {
      if (e.canPlay(c.uid, t).ok) {
        r.session.input({ t: 'play', seat: pl.seat, pile: 'hand', index: i, target: t });
        return c.id;
      }
    }
  }
  return null;
}"""

END = """() => { window.MM.ctx.run.session.input({ t: 'end' }); return true; }"""


async def until(page, test, timeout=60000, every=250):
    """Poll a condition on a page's STATE, by real time rather than fixed sleeps."""
    loop = asyncio.get_event_loop()
    end = loop.time() + timeout / 1000
    st = None
    while loop.time() < end:
        st = await page.evaluate(STATE)
        if test(st):
            return st
        await page.wait_for_timeout(every)
    return st


async def main():
    from playwright.async_api import async_playwright
    errors = []
    expected = ("[net] DESYNC", "the turn barrier has held")

    def watch(page, tag):
        page.on("pageerror", lambda e: errors.append(f"{tag} {e}"))
        page.on("console", lambda m: errors.append(f"{tag} {m.text}")
                if m.type == "error" and not any(x in m.text for x in expected) else None)

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            # Software GL, as the other co-op walks use. Three real WebGL pages at once
            # crash this machine's GPU process, and nothing here judges a picture.
            "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required",
        ])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})

        async def tab(tag, url=URL):
            page = await ctx.new_page()
            watch(page, tag)
            await page.goto(url, wait_until="load", timeout=60000)
            await page.wait_for_timeout(3000)
            return page

        A = await tab("A")
        B = await tab("B")
        ids = {}
        for name, page in (("A", A), ("B", B)):
            ids[name] = await page.evaluate("() => window.MM.ctx.scenes.current._transport.id")
        for page in (A, B):
            await page.evaluate("() => window.MM.ctx.scenes.current._lobby.setReady(true)")
        await A.wait_for_timeout(800)
        host = A if await A.evaluate("() => window.MM.ctx.scenes.current._lobby.isHost") else B
        guest, guest_name = (B, "B") if host is A else (A, "A")
        await host.evaluate("() => window.MM.ctx.scenes.current._lobby.go()")
        st_h = await until(host, lambda s: s["net"] and s["scene"] == "map")
        st_g = await until(guest, lambda s: s["net"] and s["scene"] == "map")
        check(st_h["net"] and st_g["net"], "both tabs walked into the same expedition")
        guest_seat = st_g["seat"]

        # Vote through doors until there is a fight on. Everybody must vote at every
        # door over a wire, the only door included (a slower friend is not hauled
        # out of a room they are still in).
        one = await host.evaluate(VOTE)
        await host.wait_for_timeout(500)
        solo = await host.evaluate("() => window.MM.ctx.run.currentNodeId")
        check(solo != one, "one vote does not walk the party through a door", f"{solo} vs {one}")
        await guest.evaluate(VOTE)
        fight = lambda s: s["phase"] == "player" and s["turn"] >= 1
        st_h = await until(host, fight, 120000)
        st_g = await until(guest, fight, 120000)
        check(fight(st_h) and fight(st_g), "both machines reached the fight", f"{st_h['scene']}/{st_g['scene']}")
        check(st_h["digest"] == st_g["digest"], "on the same board", f"{st_h['digest']} vs {st_g['digest']}")

        # A real exchange first, so the record a rejoin replays has something in it.
        await host.evaluate(PLAY_ONE)
        await guest.evaluate(PLAY_ONE)
        await host.evaluate(END)        # one seat has ended, the other has not
        await host.wait_for_timeout(700)
        await until(guest, lambda s: s["pending"] == 0 and s["ended"][st_h["seat"]])
        await guest.evaluate(PLAY_ONE)

        # ── 1 ── the guest's page dies, with one seat already ended ─────────────
        before = await until(host, lambda s: s["pending"] == 0)
        await guest.close()
        st = await until(host, lambda s: guest_seat in s["lost"], 20000)
        check(guest_seat in st["lost"], "the table notices that a player has gone", str(st["lost"]))
        check("lost the connection" in st["plate"], "and SAYS so on the screen", st["plate"])
        await host.screenshot(path="shots/rejoin-plate.png")

        # ── 2 ── they come back while the table waited ─────────────────────────
        back_save = {"net": {"room": ROOM, "id": ids[guest_name], "seat": guest_seat, "lobby": None},
                     "startedAt": 0}
        G2 = await tab("G2", BASE)
        await G2.evaluate("(p) => window.MM.ctx.scenes.go('lobby', p)", {"room": ROOM, "rejoin": back_save})
        st_g2 = await until(G2, lambda s: s["net"] and s["scene"] == "combat" and s["turn"] >= 1, 90000)
        check(st_g2["net"], "the player climbs back in", st_g2["scene"])
        check(st_g2["seat"] == guest_seat, "to the seat they had", str(st_g2["seat"]))
        now = await until(host, lambda s: s["pending"] == 0)
        check(st_g2["digest"] == now["digest"], "and the SAME board, mid-turn, one seat already ended",
              f"{st_g2['digest']} vs {now['digest']}")
        st_g2 = await until(G2, lambda s: s["shown"] > 0 or s["pending"] > 0, 30000)
        check(st_g2["shown"] == len(st_g2["hand"].split("|")) if st_g2["hand"] else st_g2["shown"] == 0,
              "their hand is on the screen", f"{st_g2['shown']} shown of {st_g2['hand']}")
        st = await until(host, lambda s: guest_seat not in s["lost"], 15000)
        check(guest_seat not in st["lost"], "and the plate clears on the table's side", st["plate"])

        # ── 3 ── the fight carries on ──────────────────────────────────────────
        turn = now["turn"]
        played = await G2.evaluate(PLAY_ONE)
        await G2.evaluate(END)
        st_h = await until(host, lambda s: s["turn"] > turn and s["phase"] == "player" and s["pending"] == 0, 90000)
        st_g = await until(G2, lambda s: s["turn"] > turn and s["phase"] == "player" and s["pending"] == 0, 90000)
        check(st_h["turn"] > turn, "their End closes the turn the table was waiting on", f"played {played}")
        check(st_h["digest"] == st_g["digest"], "and both machines computed the same enemy phase",
              f"{st_h['digest']} vs {st_g['digest']}")
        check(st_h["inSync"] and st_g["inSync"], "the out-of-sync check is quiet")

        # ── 4 ── they die again and the table plays on ─────────────────────────
        turn = st_h["turn"]
        await G2.close()
        st = await until(host, lambda s: guest_seat in s["lost"], 20000)
        await host.evaluate("""() => [...document.querySelectorAll('.net-plate button')]
            .find(b => /Play on/.test(b.textContent)).click()""")
        await host.evaluate(END)
        st = await until(host, lambda s: s["turn"] > turn and s["phase"] == "player", 90000)
        check(st["turn"] > turn, "playing on: the turn no longer waits for them", f"turn {st['turn']}")
        check(st["kidsGone"][guest_seat], "and the run knows that seat is gone")
        check(st["absent"][guest_seat], "and so does the fight")

        # ── 5 ── back again, to a table that went on ───────────────────────────
        G3 = await tab("G3", BASE)
        await G3.evaluate("(p) => window.MM.ctx.scenes.go('lobby', p)", {"room": ROOM, "rejoin": back_save})
        st_g3 = await until(G3, lambda s: s["net"] and s["scene"] == "combat" and s["turn"] >= 1, 90000)
        check(st_g3["net"], "they can still climb back in")
        now = await until(host, lambda s: not s["kidsGone"][guest_seat] and s["pending"] == 0, 20000)
        check(not now["kidsGone"][guest_seat], "and the table deals them back in", str(now["kidsGone"]))
        st_g3 = await until(G3, lambda s: s["pending"] == 0)
        check(st_g3["digest"] == now["digest"], "onto the same board", f"{st_g3['digest']} vs {now['digest']}")

        # ── 6 ── a stranger with the password ──────────────────────────────────
        C = await tab("C")
        await C.wait_for_timeout(1500)
        words = await C.evaluate("() => document.querySelector('.lo__room')?.textContent || ''")
        check("already gone into the house" in words, "a stranger is told the party has gone in", words[:90])
        await C.close()

        # ── 7 ── everybody leaves; both come back, and nobody has to press anything ──
        SAVE = "() => { const r = window.MM.ctx.run; r._combatSave(); return r.snapshot(); }"
        snap = await host.evaluate(SAVE)
        check(bool(snap.get("net", {}).get("roster")), "a co-op save remembers its table")
        guest_snap = await G3.evaluate(SAVE)
        check(snap["net"]["roster"]["at"] and snap["net"]["roster"]["at"] == guest_snap["net"]["roster"]["at"],
              "and both saves name it by the same moment", str(snap["net"]["roster"]["at"]))
        # Two machines, two clocks: `startedAt` is whatever each one read when the run began.
        guest_snap["startedAt"] = (snap.get("startedAt") or 0) + 4321
        await host.close()
        await G3.close()
        H2 = await tab("H2", BASE)
        G4 = await tab("G4", BASE)
        await asyncio.gather(*[
            page.evaluate("(p) => window.MM.ctx.scenes.go('lobby', p)", {"room": ROOM, "rejoin": save})
            for page, save in ((G4, guest_snap), (H2, snap))
        ])
        in_fight = lambda s: s["net"] and s["scene"] == "combat" and s["turn"] >= 1
        st_h = await until(H2, in_fight, 90000)
        st_g = await until(G4, in_fight, 90000)
        check(in_fight(st_h), "the lower seat opens the house without being asked", st_h["scene"])
        check(in_fight(st_g), "and the other climbs in behind them", st_g["scene"])
        st_h = await until(H2, lambda s: s["pending"] == 0)
        st_g = await until(G4, lambda s: s["pending"] == 0)
        check(st_h["digest"] == st_g["digest"], "onto the same board", f"{st_h['digest']} vs {st_g['digest']}")

        # ── 8 ── everybody leaves; one player opens the house back up ──────────
        await H2.close()
        await G4.close()
        H3 = await tab("H3", BASE)
        await H3.evaluate("(p) => window.MM.ctx.scenes.go('lobby', p)", {"room": ROOM, "rejoin": snap})
        await H3.wait_for_timeout(2500)
        await H3.evaluate("() => document.querySelector('.lo__open').click()")
        st = await until(H3, in_fight, 90000)
        check(st["net"], "with nobody home, a player can open the house back up from their save", st["scene"])
        check(st["turn"] == now["turn"], "on the turn they left", f"{st['turn']} vs {now['turn']}")

        await browser.close()

    for e in errors[:12]:
        print("  ERROR ", e[:300])
    check(not errors, "no page logged an error", f"{len(errors)} logged")
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
