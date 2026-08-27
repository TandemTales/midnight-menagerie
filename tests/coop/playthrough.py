"""A two-Kid expedition, walked the way two people at one machine would walk it.

    python tests/coop/playthrough.py [steps]

Starts a real co-op run from the select screen, then plays: takes map nodes,
fights with BOTH Kids' hands, clicks through every pass-it-over veil, answers
every room, and keeps going until the run ends or the step budget runs out.

Not a unit suite and not a balance measurement — it is the thing that catches
what neither of those can. Every earlier bug in the pass-and-play work was found
this way: the round that swapped who went first, the rooms that closed on
everybody, the Curiosity that the first Kid answered for both.

Reports every scene and every handoff, and fails on any console error.

Waits on CONDITIONS, never on fixed sleeps. The enemy phase for two Kids runs
about seven seconds on this machine and a six-second wait passed or failed by
what the enemies rolled — the measurement trap in CONTRACTS, in miniature.

SLOW ON PURPOSE — it plays real fights at real speed. The default 12 steps is a
Scuffle and its handoffs in a few minutes; `24` walks the reward and back out to
the blueprint and takes about ten. It prints each step as it happens rather than
at the end, because a walk that reports nothing for six minutes is
indistinguishable from a wedged one, which is exactly how the first version of
it looked while I was waiting on it.

Not part of the quick battery for that reason. Run it after anything that
touches the co-op loop.
"""
import asyncio, json, os, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
STEPS = int(sys.argv[1]) if len(sys.argv) > 1 else 12

STATE = """() => {
  const MM = window.MM, r = MM.ctx.run;
  return {
    scene: MM.ctx.scenes.currentName,
    seat: r ? r.localSeat : null,
    node: r ? r.currentNodeId : null,
    veil: !!document.querySelector('.mm-handoff'),
    kids: r ? r.kids.map(k => ({
      kid: k.kid, courage: k.courage, max: k.maxCourage,
      deck: k.deck.length, keeps: k.keepsakes.length, lost: k.lostThings })) : [],
    over: r ? !!r.result : false,
  };
}"""

# Play out both hands, then end MY seat. The veil is handled outside.
FIGHT = """async () => {
  const sc = window.MM.ctx.scenes.current;
  const e = sc && sc.engine;
  if (!e || e.over) return 'over';
  const foe = e.livingEnemies()[0];
  if (!foe) return 'over';
  const me = sc.me;
  for (const c of [...me.piles.hand]) {
    const t = e.livingEnemies()[0];
    if (!t) break;
    if (e.canPlay(c.uid, t.id).ok) await e.playCard(c.uid, t.id);
  }
  return 'played';
}"""

LEAVE = """() => {
  const words = ['back to the blueprint', 'pack up', 'leave', 'go on', 'move on',
                 'continue', 'onward', 'begin', 'to the clubhouse'];
  for (const el of document.querySelectorAll('button, .btn, .rm-go, [role=button]')) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (words.some(w => t.startsWith(w))) { el.click(); return t; }
  }
  return null;
}"""

TAKE = """() => {
  const el = document.querySelector('.rw-fan [role=option]')
          || document.querySelector('.ev-opt:not([disabled])');
  if (el) { el.click(); return el.className; }
  return null;
}"""


SETTLED = """() => {
  const MM = window.MM;
  if (!MM || !MM.ctx.scenes.current) return false;
  if (document.querySelector('.mm-handoff')) return true;      // waiting on a player
  const sc = MM.ctx.scenes.current;
  if (MM.ctx.scenes.busy) return false;                        // mid transition
  if (sc.engine && sc._resolving) return false;                // mid animation
  return true;
}"""


async def main():
    errors, log, handoffs = [], [], 0
    seen = set()
    from playwright.async_api import async_playwright

    async def settle(page, timeout=40000):
        """Wait until the game is idle — or a player is being waited on.

        Says so when it gives up. A settle that times out silently turns into
        "the walk is slow", and a walk that is slow for the wrong reason is a
        walk that is wedged.
        """
        await page.wait_for_timeout(400)
        try:
            await page.wait_for_function(SETTLED, timeout=timeout)
        except Exception:
            try:
                why = await page.evaluate("""() => {
                  const MM = window.MM, sc = MM && MM.ctx.scenes.current;
                  return { scene: MM && MM.ctx.scenes.currentName,
                           busy: !!(MM && MM.ctx.scenes.busy),
                           resolving: !!(sc && sc._resolving),
                           veil: !!document.querySelector('.mm-handoff'),
                           phase: sc && sc.engine ? sc.engine.phase : null,
                           over: sc && sc.engine ? sc.engine.over : null };
                }""")
            except Exception:
                why = "unreadable"
            print("      !! settle gave up:", json.dumps(why), flush=True)
        await page.wait_for_timeout(400)

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

        for step in range(STEPS):
            st = await page.evaluate(STATE)

            # the veil is always answered first, whatever is behind it
            if st["veil"]:
                handoffs += 1
                print("      … pass it over", flush=True)
                await page.click(".hoff__go")
                await settle(page)
                continue

            scene = st["scene"]
            if scene not in seen:
                seen.add(scene)
                await page.screenshot(path=os.path.join(SHOTS, f"pt-{scene}.png"))
            log.append({"step": step, "scene": scene, "seat": st["seat"], "node": st["node"]})
            print("  %2d  %-9s seat %s  %s" % (
                step, scene, st["seat"], st["node"] or ""), flush=True)

            if st["over"] or scene in ("gameover", "clubhouse", "title"):
                break

            if scene == "map":
                took = await page.evaluate("""() => {
                  const host = document.querySelector('.map-nodes');
                  if (!host) return null;
                  const legal = [...host.children].filter(el => /is-legal/.test(el.className));
                  if (!legal.length) return null;
                  legal[0].click();
                  const m = legal[0].className.match(/map-node--([a-z]+)/i);
                  return m ? m[1] : 'node';
                }""")
                log[-1]["took"] = took
                if not took:
                    log[-1]["stuck"] = True
                    break
                await settle(page)

            elif scene == "combat":
                await page.evaluate(FIGHT)
                await page.wait_for_timeout(500)
                try:
                    await page.click("#end-turn", timeout=5000)
                except Exception:
                    pass
                await settle(page)

            else:
                await page.evaluate(TAKE)
                await page.wait_for_timeout(700)
                await page.evaluate(LEAVE)
                await settle(page)

        final = await page.evaluate(STATE)
        await page.screenshot(path=os.path.join(SHOTS, "pt-final.png"))
        await b.close()

    kinds = sorted({r.get("took") for r in log if r.get("took")})
    print(json.dumps({"final": final, "handoffs": handoffs,
                      "scenes": sorted(seen), "rooms": kinds,
                      "steps": len(log)}, indent=1))
    print("console errors:", len(errors))
    for e in errors[:10]:
        print("   ", e[:220])
    ok = not errors and handoffs > 0
    print("RESULT: %d handoffs, %d console errors" % (handoffs, len(errors)))
    if not ok:
        sys.exit(1)

asyncio.run(main())
