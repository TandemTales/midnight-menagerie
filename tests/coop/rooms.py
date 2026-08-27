"""Every per-Kid room, passed from one Kid to the other the way two people would.

    python tests/coop/rooms.py

The reward screen, Mr. Moth's and the Safe Room are each per Kid — their own
offer, their own shelf, their own night — and each one has to hand the screen
over rather than one Kid walking out with the room.

Asserted through the DOM and the clicks, not the objects: the offers being per
Kid is already covered by `tests/coop/suite.js`, and the thing that breaks is
always the screen. The first version of this found that a room's `_leave` was
wired straight to the button in three places, so whoever pressed it closed the
room on everybody.

Exit code 1 on any failure or console error.
"""
import asyncio, json, os, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")

WHO = """() => {
  const r = window.MM.ctx.run;
  return {
    scene: window.MM.ctx.scenes.currentName,
    seat: r.localSeat,
    kid: r.kidName,
    comp: r.companion,
    veil: !!document.querySelector('.mm-handoff'),
    veilName: (document.querySelector('.hoff__name') || {}).textContent || null,
    offer: r.local.pendingReward ? {
      cards: (r.local.pendingReward.cards || []).map(c => c.id),
      keepsake: r.local.pendingReward.keepsake } : null,
    keeps: r.kids.map(k => k.keepsakes.length),
    decks: r.kids.map(k => k.deck.length),
    shelfFirst: (document.querySelector('.shop-card .cardview, .shop-card') || {}).dataset || null,
    title: (document.querySelector('.rm-title, h1') || {}).textContent || null,
  };
}"""

fails = []
def check(cond, label, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(label)


async def main():
    errors = []
    from playwright.async_api import async_playwright
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

        # ── the reward screen ────────────────────────────────────────────────
        print("\nA Big Scare's spoils")
        await page.evaluate("""() => {
          const r = window.MM.ctx.run;
          r.currentNodeId = 'x-bigscare';
          r._prepareReward({ id: 'x-bigscare' }, 'bigScare', { navigate: true });
        }""")
        await page.wait_for_timeout(5000)
        a = await page.evaluate(WHO)
        check(a["scene"] == "reward", "the reward screen is up", a["scene"])
        check(a["seat"] == 0, "seat 0 first", str(a["seat"]))
        check(bool(a["offer"] and a["offer"]["keepsake"]), "with a Keepsake for them",
              str(a["offer"] and a["offer"]["keepsake"]))
        k0 = a["offer"]["keepsake"]
        keeps0 = a["keeps"][:]

        await page.click('.rw-fan [role="option"]')
        await page.wait_for_timeout(900)
        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('back to the blueprint') || t.startsWith('leave')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(2200)
        v = await page.evaluate(WHO)
        check(v["veil"], "the screen is covered before the next Kid sees it")
        check("Eli" in (v["veilName"] or ""), "and it names them", v["veilName"])

        await page.click(".hoff__go")
        await page.wait_for_timeout(4000)
        c = await page.evaluate(WHO)
        check(c["scene"] == "reward", "the reward screen opens again", c["scene"])
        check(c["seat"] == 1, "as seat 1", str(c["seat"]))
        check(bool(c["offer"]), "with THEIR offer waiting")
        check(c["offer"]["keepsake"] != k0, "a different Keepsake from seat 0's",
              f"{c['offer']['keepsake']} vs {k0}")
        check(all(x.startswith("bones/") for x in c["offer"]["cards"]),
              "and Bones Tricks", ", ".join(c["offer"]["cards"]))
        check(c["keeps"][0] == keeps0[0] + 1, "seat 0 already banked theirs",
              f"{keeps0[0]} -> {c['keeps'][0]}")
        await page.screenshot(path=os.path.join(SHOTS, "rooms-reward-seat1.png"))

        await page.click('.rw-fan [role="option"]')
        await page.wait_for_timeout(900)
        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('back to the blueprint') || t.startsWith('leave')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(5000)
        d = await page.evaluate(WHO)
        check(d["scene"] == "map", "the last Kid out closes the room", d["scene"])
        check(d["keeps"][1] == keeps0[1] + 1, "and seat 1 banked theirs too",
              f"{keeps0[1]} -> {d['keeps'][1]}")

        # ── the Safe Room ───────────────────────────────────────────────────
        print("\nThe Safe Room")
        await page.evaluate("""() => {
          const r = window.MM.ctx.run;
          const n = (r.map.nodes.find(x => (x.kind || x.type) === 'safe')
                  || r.map.nodes.find(x => (x.kind || x.type) === 'rest'));
          r.currentNodeId = n.id;
          for (const k of r.kids) k.roomDone = null;
          r.setLocalSeat(0);                 // as walking into the room would
          r._goto('rest', { node: n.id, region: r.region });
        }""")
        await page.wait_for_timeout(5000)
        e = await page.evaluate(WHO)
        check(e["scene"] == "rest", "the Safe Room is up", e["scene"])
        check(e["seat"] == 0, "seat 0 first", str(e["seat"]))

        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('pack up')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(2200)
        f = await page.evaluate(WHO)
        check(f["veil"], "a Kid leaving hands it over rather than closing it")
        await page.click(".hoff__go")
        await page.wait_for_timeout(4000)
        g = await page.evaluate(WHO)
        check(g["scene"] == "rest", "the Safe Room opens again", g["scene"])
        check(g["seat"] == 1, "as seat 1", str(g["seat"]))
        check(g["comp"] == "bones", "with their Companion", g["comp"])
        await page.screenshot(path=os.path.join(SHOTS, "rooms-rest-seat1.png"))

        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('pack up')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(5000)
        h = await page.evaluate(WHO)
        check(h["scene"] == "map", "and the second one out closes it", h["scene"])

        # ── Mr. Moth's ──────────────────────────────────────────────────────
        print("")
        print("Mr. Moth's")
        await page.evaluate("""() => {
          const r = window.MM.ctx.run;
          const n = r.map.nodes.find(x => (x.kind || x.type) === 'shop');
          r.currentNodeId = n.id;
          for (const k of r.kids) k.roomDone = null;
          r.pendingShop = null;
          r._prepareShop({ id: n.id });
          r.setLocalSeat(0);
          r._goto('shop', { node: n.id, region: r.region });
        }""")
        await page.wait_for_timeout(5500)
        s0 = await page.evaluate(WHO)
        shelf0 = await page.evaluate(
            "() => [...document.querySelectorAll('[data-card-id]')].map(e => e.dataset.cardId)")
        check(s0["scene"] == "shop", "the shop is up", s0["scene"])
        check(s0["seat"] == 0, "seat 0 first", str(s0["seat"]))
        check(any(x.startswith("marmalade/") for x in shelf0),
              "showing Marmalade Tricks", ", ".join(shelf0[:3]))

        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('back to the blueprint')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(2200)
        sv = await page.evaluate(WHO)
        check(sv["veil"], "leaving hands the shop over rather than shutting it")
        await page.click(".hoff__go")
        await page.wait_for_timeout(5000)
        s1 = await page.evaluate(WHO)
        shelf1 = await page.evaluate(
            "() => [...document.querySelectorAll('[data-card-id]')].map(e => e.dataset.cardId)")
        check(s1["scene"] == "shop", "the shop opens again", s1["scene"])
        check(s1["seat"] == 1, "as seat 1", str(s1["seat"]))
        check(any(x.startswith("bones/") for x in shelf1),
              "showing THEIR Companion's Tricks", ", ".join(shelf1[:3]))
        check(sorted(shelf0) != sorted(shelf1), "a different shelf entirely")
        await page.screenshot(path=os.path.join(SHOTS, "rooms-shop-seat1.png"))

        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('back to the blueprint')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(5000)
        s2 = await page.evaluate(WHO)
        check(s2["scene"] == "map", "and the second one out closes it", s2["scene"])

        # ── a Curiosity ─────────────────────────────────────────────────────
        # Slay the Spire 2 shares the map and the node in co-op, and
        # "individual choices within events may differ" — so the room is the
        # same room and each Kid answers it themselves.
        print("")
        print("A Curiosity")
        await page.evaluate("""() => {
          const r = window.MM.ctx.run;
          const n = r.map.nodes.find(x => (x.kind || x.type) === 'curiosity')
                 || r.map.nodes.find(x => (x.kind || x.type) === 'unknown');
          r.currentNodeId = n.id;
          for (const k of r.kids) k.roomDone = null;
          r.pendingEvent = null;
          r._prepareEvent(n, 'curiosity');
          r.setLocalSeat(0);
          r._goto('event', { node: n.id, region: r.region });
        }""")
        await page.wait_for_timeout(5000)
        c0 = await page.evaluate(WHO)
        opts0 = await page.evaluate(
            "() => [...document.querySelectorAll('.ev-opt')].map(e => e.dataset.opt)")
        check(c0["scene"] == "event", "the Curiosity is up", c0["scene"])
        check(c0["seat"] == 0, "seat 0 first", str(c0["seat"]))
        check(len(opts0) > 0, "with options to answer", str(len(opts0)))

        await page.click(".ev-opt:not([disabled])")
        await page.wait_for_timeout(1500)
        answered = await page.evaluate(
            "() => !!document.querySelector('.ev-page.is-answered, .is-answered')")
        check(answered, "seat 0 answers it")

        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('back to the blueprint') || t.startsWith('leave')
                || t.startsWith('go on') || t.startsWith('move on')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(2200)
        cv = await page.evaluate(WHO)
        check(cv["veil"], "and it passes to the other Kid rather than closing")
        await page.click(".hoff__go")
        await page.wait_for_timeout(4500)
        c1 = await page.evaluate(WHO)
        opts1 = await page.evaluate(
            "() => [...document.querySelectorAll('.ev-opt:not([disabled])')].map(e => e.dataset.opt)")
        answered1 = await page.evaluate(
            "() => !!document.querySelector('.ev-page.is-answered, .is-answered')")
        check(c1["scene"] == "event", "the Curiosity opens again", c1["scene"])
        check(c1["seat"] == 1, "as seat 1", str(c1["seat"]))
        check(not answered1, "and it is UNanswered for them — the choice is theirs")
        check(len(opts1) > 0, "with the options live again", str(len(opts1)))
        await page.screenshot(path=os.path.join(SHOTS, "rooms-event-seat1.png"))

        # ── a Rescue is NOT per Kid ─────────────────────────────────────────
        # One pet comes home. Handing the screen on would show the second Kid a
        # Companion already rescued and nothing to do about it.
        print("")
        print("A Rescue")
        await page.evaluate("""() => {
          const r = window.MM.ctx.run;
          const n = r.map.nodes.find(x => (x.kind || x.type) === 'rescue');
          r.currentNodeId = n.id;
          for (const k of r.kids) k.roomDone = null;
          r.pendingEvent = null;
          r._prepareEvent(n, 'rescue');
          r.setLocalSeat(0);
          r._goto('event', { node: n.id, region: r.region });
        }""")
        await page.wait_for_timeout(5000)
        rs = await page.evaluate(WHO)
        check(rs["scene"] == "event", "the Rescue is up", rs["scene"])
        await page.evaluate("""() => {
          for (const el of document.querySelectorAll('button, .btn, .rm-go')) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.startsWith('back to the blueprint') || t.startsWith('leave')
                || t.startsWith('go on') || t.startsWith('move on')) { el.click(); return; }
          }
        }""")
        await page.wait_for_timeout(4500)
        rv = await page.evaluate(WHO)
        check(not rv["veil"], "leaving does NOT hand it over", f"veil {rv['veil']}")
        check(rv["scene"] == "map", "it just closes", rv["scene"])

        await b.close()

    print("\nconsole errors:", len(errors))
    for e in errors[:8]:
        print("   ", e[:220])
    print("RESULT: %d failures, %d console errors" % (len(fails), len(errors)))
    if fails or errors:
        sys.exit(1)

asyncio.run(main())
