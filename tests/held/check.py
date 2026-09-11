"""Every wing holds ONE known Companion, and the fork says who.

    python tests/held/check.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS.  Two defects shared one cause — nothing decided who a wing
held until the moment somebody was freed:

  * A wing freed TWO Companions whenever its Rescue room was visited.  The room
    freed one, then the boss asked `rescueTargetFor` for a fresh substitute and
    freed a second, random one nobody had been told about: on seed 42, Mossbit
    in the Foyer's Rescue room and then Drizzle at the Butler.
  * The atlas named a wing's OWN Companion, and only for a surveyed wing — so
    at a way-on fork most doors said nothing, and the Foyer would have named
    Marmalade, who starts at home and is never the one freed there.

`Run#held` is now decided when a wing is offered, stamped on every fork option,
and honoured by the Rescue room, the boss, the save and the atlas.

Two halves: tests/held/index.html drives the run layer headlessly, and this
file then drives the REAL atlas at a fork and reads its dossier, because a
promise the run keeps and the screen does not show is not a promise.

HOW TO PROVE IT SEES (CONTRACTS 54): in state/run.js#completeRegion put back
`this.rescueTargetFor(`boss:${this.region}`, meta.companion)` and "the wing
freed exactly ONE Companion" goes red on every seed; return `w.meta.boss` only
when `seen` in atlas.js#_show and the dossier checks go red.

Prints `RESULT: n passed, m failed`.  Exit 0 only when m == 0.
"""
import asyncio
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PAGE = "http://localhost:8777/tests/held/index.html"
GAME = "http://localhost:8777/game/index.html"

OPEN_FORK = """
async () => {
  const { Run } = await import('/game/src/state/run.js');
  const { Save } = await import('/game/src/core/save.js');
  const { COMPANIONS } = await import('/game/src/data/schema.js');
  Save.data.companionsRescued = [];
  const run = new Run({ companion: 'boggle', kid: 'maya', seed: 42 });
  run.attach(window.MM.ctx);
  run.completeRegion();               // opens the way-on fork and asks for the atlas
  const name = (s) => (COMPANIONS.find((c) => c.slug === s) || {}).name || null;
  return run.pendingWing.options.map((o) => ({ to: o.to, held: o.held, name: name(o.held) }));
}
"""

AT_FORK = """
() => {
  const sc = window.MM && window.MM.ctx && window.MM.ctx.scenes.current;
  return !!(sc && sc.choosing && sc._dossier && sc.offer && sc.offer.length);
}
"""

READ_DOSSIER = """
(slug) => {
  const sc = window.MM.ctx.scenes.current;
  sc._show(slug);
  const d = sc._dossier;
  return {
    boss: d.querySelector('.at-dos__boss').textContent.trim(),
    shown: !d.querySelector('.at-dos__held').hidden,
    name: d.querySelector('.at-dos__cname').textContent.trim(),
  };
}
"""


async def run_all():
    from playwright.async_api import async_playwright
    passes, fails = [], []

    def check(ok, what, detail=""):
        (passes if ok else fails).append(what + (" - " + detail if detail else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ── the run layer ─────────────────────────────────────────────────────
        page = await (await browser.new_context()).new_page()
        await page.goto(PAGE, wait_until="load", timeout=60000)
        await page.wait_for_function("window.__HELD !== undefined", timeout=90000)
        res = await page.evaluate("window.__HELD")
        passes.extend(res["passes"])
        fails.extend(res["fails"])

        # ── the atlas at a real fork ──────────────────────────────────────────
        page = await (await browser.new_context(viewport={"width": 1600, "height": 900})).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(GAME, wait_until="load", timeout=60000)
        # IDLE, not merely present. `SceneManager#go` silently DROPS a request
        # that arrives while a transition is running ("busy, queued drop"), and
        # the boot's own transition to the title is still running when `scenes`
        # first exists -- so the fork's `_goto('atlas')` was being thrown away.
        await page.wait_for_function(
            "window.MM && window.MM.ctx && window.MM.ctx.scenes"
            " && window.MM.ctx.scenes.currentName && !window.MM.ctx.scenes.busy", timeout=60000)
        options = await page.evaluate(OPEN_FORK)
        try:
            await page.wait_for_function(AT_FORK, timeout=30000)
            at_fork = True
        except Exception:
            at_fork = False
        check(at_fork, "the fork opens the atlas in choosing mode")
        if at_fork:
            for o in options:
                if o["to"] == "heart":
                    continue
                d = await page.evaluate(READ_DOSSIER, o["to"])
                check(d["boss"] and d["boss"] != "Not yet known",
                      "%s: the dossier names who keeps it" % o["to"], d["boss"])
                if o["held"]:
                    check(d["shown"] and d["name"] == o["name"],
                          "%s: the dossier names %s, the one the run will free" % (o["to"], o["name"]),
                          "shows %r" % d["name"] if d["shown"] else "held block hidden")
                else:
                    check(d["shown"] and d["name"] == "Nobody",
                          "%s: a door that holds nobody says so" % o["to"],
                          "shows %r" % d["name"] if d["shown"] else "held block hidden")
        check(not errors, "the atlas raised no page errors", "; ".join(errors[:2]))
        await browser.close()
    return passes, fails


def main():
    passes, fails = asyncio.run(run_all())
    for line in passes:
        print("  PASS  " + line)
    for line in fails:
        print("  FAIL  " + line)
    print("\nRESULT: %d passed, %d failed" % (len(passes), len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
