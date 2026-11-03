"""A whole fight over a wire as slow as a real one, with both players acting at once.

    python tests/coop/latency.py [low_ms] [high_ms]

Needs the dev server on :8777. Two real tabs, real screens. Tabs on a BroadcastChannel
are a wire with no delay at all, so nothing else in this suite can ever see two inputs
cross, and crossing inputs are what splits a lockstep game. This wraps the transport's
send in a delay (60-180 ms by default, in the range of a Steam relay), keeping order per
sender as Reliable does, then has both players let go of a Trick in the same moment,
every time, until the fight ends. It fails if the machines ever disagree.

Exit 0 only when every check passes and no page logs an error.
"""
import asyncio
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

LOW = int(sys.argv[1]) if len(sys.argv) > 1 else 60
HIGH = int(sys.argv[2]) if len(sys.argv) > 2 else 180
ROOM = "owlish-lookout"
URL = f"http://localhost:8777/game/index.html#scene=title"
fails, passes = [], []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""), flush=True)


# A delay per message that never reorders one sender's messages: Reliable's rule. One queue
# and one timer, because two timers aimed at the same instant can fire in either order.
SLOW_WIRE = """async ([low, high]) => {
  const { ChannelTransport } = await import('/game/src/net/transport.js');
  const send = ChannelTransport.prototype.send;
  ChannelTransport.prototype.send = function (msg) {
    const q = this._slowQ || (this._slowQ = []);
    q.push({ at: performance.now() + low + Math.random() * (high - low), msg });
    const drain = () => {
      while (q.length && q[0].at <= performance.now()) {
        const m = q.shift();
        if (!this.closed) send.call(this, m.msg);
      }
      this._slowT = q.length ? setTimeout(drain, Math.max(1, q[0].at - performance.now())) : null;
    };
    if (!this._slowT) this._slowT = setTimeout(drain, Math.max(1, q[0].at - performance.now()));
    return true;
  };
}"""

STATE = """() => {
  const c = window.MM.ctx, r = c.run, s = r && r.session, e = r && r.combat;
  return {
    scene: c.scenes.currentName, net: !!(s && s.remote), seat: r ? r.localSeat : null,
    inSync: s ? s.inSync : null, drift: s && s.divergedAt ? JSON.stringify(s.divergedAt).slice(0, 400) : '',
    pending: s ? s.log.length - s._applied : 0, log: s ? s.log.length : 0,
    turn: e ? e.turn : 0, phase: e ? e.phase : null, over: e ? !!e.over : !r?.pendingCombat,
    digest: e ? r._combatDigest(e) : null,
    ended: e ? e.players.map(p => !!p.ended) : [],
  };
}"""

# Let go of a Trick if one can be played. Waits for it to land, because the screen does:
# scenes/combat.js locks the hand until its own input has been applied, so a player can
# never send a second input from a hand that has not changed yet.
ACT = """async () => {
  const r = window.MM.ctx.run, e = r.combat;
  if (!e || e.over || e.phase !== 'player') return 'wait';
  const pl = e.players[r.localSeat];
  if (pl.ended || pl.fallen) return 'wait';
  const foe = e.enemies.find(x => x.alive);
  for (let i = 0; i < pl.piles.hand.length; i++) {
    const c = pl.piles.hand[i];
    for (const t of [foe && foe.id, null]) {
      if (e.canPlay(c.uid, t).ok) {
        await r.session.whenApplied(r.session.input({ t: 'play', seat: pl.seat, pile: 'hand', index: i, target: t }));
        return 'play';
      }
    }
  }
  await r.session.whenApplied(r.session.input({ t: 'end' }));
  return 'end';
}"""

VOTE = """() => {
  const r = window.MM.ctx.run;
  const id = r.legalNextIds().sort()[0];
  r.session.input({ t: 'room', act: 'map.vote', id });
  return id;
}"""


async def main():
    from playwright.async_api import async_playwright
    errors = []
    tolerated = ("[net] the turn barrier",)

    def watch(page, tag):
        page.on("pageerror", lambda e: errors.append(f"{tag} {e}"))
        page.on("console", lambda m: errors.append(f"{tag} {m.text}")
                if m.type == "error" and not any(x in m.text for x in tolerated) else None)

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        pages = []
        for tag in "AB":
            page = await ctx.new_page()
            watch(page, tag)
            await page.goto(URL, wait_until="load", timeout=60000)
            await page.wait_for_timeout(2500)
            await page.evaluate(SLOW_WIRE, [LOW, HIGH])
            await page.evaluate("(room) => window.MM.ctx.scenes.go('lobby', { room }, { instant: true })", ROOM)
            pages.append(page)
        await pages[0].wait_for_timeout(2500)
        A, B = pages

        async def until(test, timeout=120000):
            loop = asyncio.get_event_loop()
            end = loop.time() + timeout / 1000
            states = None
            while loop.time() < end:
                states = [await pg.evaluate(STATE) for pg in pages]
                if test(states):
                    return states
                await A.wait_for_timeout(120)
            return states

        for page in pages:
            await page.evaluate("() => window.MM.ctx.scenes.current._lobby.setReady(true)")
        await A.wait_for_timeout(1500)
        host = A if await A.evaluate("() => window.MM.ctx.scenes.current._lobby.isHost") else B
        await host.evaluate("() => window.MM.ctx.scenes.current._lobby.go()")
        st = await until(lambda s: all(x["net"] and x["scene"] == "map" for x in s))
        check(all(x["net"] for x in st), "two players in one expedition, over the slow wire")

        await asyncio.gather(A.evaluate(VOTE), B.evaluate(VOTE))
        st = await until(lambda s: all(x["phase"] == "player" and x["turn"] >= 1 for x in s), 180000)
        check(all(x["turn"] >= 1 for x in st), "both reached the fight", f"{st[0]['scene']}/{st[1]['scene']}")

        crossed = plays = turns_compared = 0
        last_turn = 0
        ok = True
        loop = asyncio.get_event_loop()
        end = loop.time() + 420
        while loop.time() < end:
            st = await until(lambda s: all(x["pending"] == 0 or x["over"] for x in s), 60000)
            if any(x["over"] for x in st):
                break
            if st[0]["turn"] == st[1]["turn"] and st[0]["phase"] == st[1]["phase"] == "player":
                if st[0]["digest"] != st[1]["digest"] and st[0]["ended"] == st[1]["ended"]:
                    ok = False
                    print("  DRIFT", st[0]["digest"], "\n     vs", st[1]["digest"], flush=True)
                    break
                if st[0]["turn"] != last_turn:
                    turns_compared += 1
                    last_turn = st[0]["turn"]
            # Both let go together, on purpose: anything inside the delay crosses.
            acts = await asyncio.gather(A.evaluate(ACT), B.evaluate(ACT))
            plays += acts.count("play")
            if acts[0] == acts[1] == "play":
                crossed += 1
            if acts[0] == acts[1] == "wait":
                await A.wait_for_timeout(250)

        st = await until(lambda s: all(x["pending"] == 0 or x["over"] for x in s), 60000)
        check(ok, "the boards agreed at every comparison", f"{turns_compared} turns, {plays} Tricks")
        check(crossed >= 3, "and the two players really did act at the same moment", f"{crossed} crossings")
        check(all(x["inSync"] for x in st), "the game's own out-of-sync check stayed quiet", st[0]["drift"] or st[1]["drift"])
        # A fight either ended the same way on both machines, or both are still in it.
        check(st[0]["over"] == st[1]["over"], "and both machines agree how far the fight got", f"{st[0]['over']}/{st[1]['over']}")
        await browser.close()

    for e in errors[:10]:
        print("  ERROR ", e[:300])
    check(not errors, "no page logged an error", f"{len(errors)} logged")
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
