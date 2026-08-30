"""Two tabs, one room code, one expedition — the wire, end to end. OWNER: frontend.

    python tests/coop/lobby.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

`net/lobby.js` was written and tested on 2026-08-28 and **nothing in
`game/src/` imported it** until 2026-08-30. It had seats, host election, seed
derivation and a late-joiner case, all green in `tests/net/`, and no player
could reach any of it because there was no screen. That is CONTRACTS 54 with a
twist: tested code is not the same as reachable code, and a suite that only ever
constructs a `Lobby` in a harness cannot tell the difference.

So this drives the SCREEN, in a real browser, twice at once. Two pages in ONE
context (a BroadcastChannel does not cross contexts), the same room code in the
hash for both, then: read both rosters, ready both up, find the host, press the
button, and assert both tabs land on the map holding the SAME SEED with
DIFFERENT SEATS and a session that reports `remote`.

That last triple is the whole point. Same seed means they are in the same house;
different seats mean the sorted-peer-id rule assigned them without an election;
`remote` means `shouldHandOff()` will not veil a screen that belongs to a person
in another window.

Exit code 0 only when every assertion passes and neither page logs an error.
"""
import asyncio
import sys

ROOM = "knotted-ladder"
URL = f"http://localhost:8777/game/index.html#scene=lobby&room={ROOM}"

# Non-empty seats, as the player reads them. "(you)" is stripped: it is the one
# thing that SHOULD differ between the tabs, and comparing it would assert that
# two people see the same screen rather than the same room.
SEATS = """() => [...document.querySelectorAll('.lo__seat')]
    .filter(e => !e.classList.contains('is-empty'))
    .map(e => (e.querySelector('.lo__who')?.textContent || '')
      .replace('(you)', '').replace(/\\s+/g, ' ').trim())
    .join(' | ')"""

RUNSNAP = """() => {
  const r = window.MM.ctx.run;
  return r ? { seed: r.seed, kids: r.kids.length, seat: r.localSeat,
               remote: !!(r.session && r.session.remote) } : null;
}"""

fails = []
passes = []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""),
          flush=True)


async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--autoplay-policy=no-user-gesture-required",
        ])
        # ONE context on purpose: a BroadcastChannel is per origin per context,
        # so two contexts would be two rooms that happen to share a name and
        # this whole suite would pass by never connecting.
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})

        A = await ctx.new_page()
        A.on("pageerror", lambda e: errors.append("A " + str(e)))
        A.on("console", lambda m: errors.append("A " + m.text) if m.type == "error" else None)
        await A.goto(URL, wait_until="load", timeout=45000)
        await A.wait_for_timeout(3500)

        B = await ctx.new_page()
        B.on("pageerror", lambda e: errors.append("B " + str(e)))
        B.on("console", lambda m: errors.append("B " + m.text) if m.type == "error" else None)
        await B.goto(URL, wait_until="load", timeout=45000)
        await B.wait_for_timeout(3500)

        a_seats = await A.evaluate(SEATS)
        b_seats = await B.evaluate(SEATS)
        check(a_seats.count("&") == 2, "tab A sees both players", a_seats)
        check(b_seats.count("&") == 2, "tab B sees both players", b_seats)
        check(a_seats == b_seats,
              "and both tabs agree on the roster and its ORDER — seats are the "
              "sorted peer list, not arrival order",
              f"{a_seats!r} vs {b_seats!r}")

        for pg in (A, B):
            await pg.click(".lo__ready")
            await pg.wait_for_timeout(700)

        host_a = await A.evaluate("() => !!document.querySelector('.lo__go')")
        host_b = await B.evaluate("() => !!document.querySelector('.lo__go')")
        check(host_a != host_b,
              "exactly one tab is the host and has the button",
              f"A={host_a} B={host_b}")

        host, other = (A, B) if host_a else (B, A)
        blocked = await host.evaluate("() => document.querySelector('.lo__go')?.disabled")
        check(not blocked, "the door unlocks once everyone is ready")

        await host.click(".lo__go")
        await host.wait_for_timeout(4000)
        await other.wait_for_timeout(1500)

        snaps = {}
        for name, pg in (("host", host), ("guest", other)):
            scene = await pg.evaluate("() => window.MM.state().scene")
            snap = await pg.evaluate(RUNSNAP)
            snaps[name] = snap
            check(scene == "map", f"the {name} walked in", scene)
            check(bool(snap), f"the {name} has a run")
            if snap:
                check(snap["kids"] == 2, f"the {name}'s party is two Kids", str(snap["kids"]))
                check(snap["remote"],
                      f"the {name}'s run has a REMOTE session — no pass-and-play veil",
                      str(snap))

        if snaps.get("host") and snaps.get("guest"):
            check(snaps["host"]["seed"] == snaps["guest"]["seed"],
                  "both tabs are playing the SAME SEED, derived from the room code",
                  f'{snaps["host"]["seed"]} / {snaps["guest"]["seed"]}')
            check({snaps["host"]["seat"], snaps["guest"]["seat"]} == {0, 1},
                  "and hold DIFFERENT seats, assigned with no election",
                  f'{snaps["host"]["seat"]} / {snaps["guest"]["seat"]}')

        await browser.close()

    if errors:
        print("\n--- CONSOLE ---", flush=True)
        for e in errors[:10]:
            print(" ", e, flush=True)

    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed, "
          f"{len(errors)} console errors", flush=True)
    return 1 if (fails or errors) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
