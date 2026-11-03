"""The demo: three wings, all painted, and an honest ending.

    python tests/demo/run.py

Needs the dev server on :8777. `#demo=1` does what `"demo": true` in a package's
release.json does (`isDemoBuild` in state/run.js reads both).

A stranger's first hour should never reach a wing with no enemy art, and a demo must
end rather than offering a door that leads nowhere. This walks the offers on many seeds
instead of trusting the one the first seed happens to draw, and also confirms that
without the flag the full game is unchanged.

Exit 0 only when every check passes and no page logs an error.
"""
import asyncio
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

fails, passes = [], []


def check(cond, label, detail=""):
    (passes if cond else fails).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f" — {detail}" if detail else ""), flush=True)


WALK = """async () => {
  const R = await import('/game/src/state/run.js');
  const { COMPANIONS } = await import('/game/src/data/schema.js');
  const out = { demo: R.isDemoBuild(), entry: R.canChooseEntry(), pool: [...R.DEMO_WINGS.pool],
                wings: new Set(), heart: 0, offers: [], routes: [], lens: new Set(), starts: new Set() };
  for (let seed = 1; seed <= 200; seed++) {
    const run = new R.Run({ companion: 'marmalade', kid: 'maya', seed });
    run.ephemeral = true;
    out.lens.add(run.wings);
    out.starts.add(run.region);
    const walked = [run.region];
    for (let step = 0; step < run.wings - 1; step++) {
      const opts = R.wingOffer(seed, walked[walked.length - 1], walked, step, run.wings,
        run.demo ? R.DEMO_WINGS.pool : null);
      out.offers.push(opts.length);
      for (const o of opts) { out.wings.add(o.to); if (o.to === 'heart') out.heart++; }
      walked.push(opts[seed % opts.length].to);
    }
    out.routes.push(walked.join('>'));
  }
  return { ...out, wings: [...out.wings], lens: [...out.lens], starts: [...out.starts],
           minOffer: Math.min(...out.offers), routes: out.routes.slice(0, 3) };
}"""

# The real run layer, walked to the end of its last wing.
ENDING = """async () => {
  const { Run } = await import('/game/src/state/run.js');
  const run = new Run({ companion: 'marmalade', kid: 'maya', seed: 7 });
  run.ephemeral = true;
  const ctx = window.MM.ctx;
  const offered = [];
  for (let i = 0; i < run.wings; i++) {
    const boss = run.map.nodes.find(n => run.effectiveType(n) === 'boss');
    run.currentNodeId = boss.id;
    run.visitedIds.push(boss.id);
    run.defeatedBoss = { region: run.region, nodeId: boss.id };
    if (run.isLastRegion) { run.completeRegion(); break; }
    const fork = run.wingOptions ? run.wingOptions() : [];
    offered.push(fork.map(o => o.to));
    run.region = (fork[0] && fork[0].to) || run.region;
    run.regionIndex += 1;
    run.route.push(run.region);
    run._buildMap();
  }
  void ctx;
  return { result: run.result, wings: run.wings, route: run.route, offered };
}"""

async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--enable-unsafe-swiftshader"])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})

        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await page.goto("http://localhost:8777/game/index.html#demo=1", wait_until="load", timeout=60000)
        await page.wait_for_function("window.MM && window.MM.ctx && window.MM.ctx.scenes.currentName && !window.MM.ctx.scenes.busy", timeout=60000)

        d = await page.evaluate(WALK)
        check(d["demo"], "the flag is read")
        check(d["lens"] == [3], "every demo expedition is three wings", str(d["lens"]))
        check(d["starts"] == ["foyer"], "and starts at the front door", str(d["starts"]))
        check(not d["entry"], "with no choosing another way in, whatever the save has cleared")
        check(set(d["wings"]) <= set(d["pool"]), "200 seeds only ever offer the demo's wings", str(sorted(d["wings"])))
        check(len(d["wings"]) == 4, "and every one of them gets offered", str(sorted(d["wings"])))
        check(d["heart"] == 0, "and never the Heart")
        check(d["minOffer"] >= 2, "and a fork is always a real choice", str(d["minOffer"]))

        end = await page.evaluate(ENDING)
        check(end["result"] == "victory", "beating the third boss ends the expedition in a win", str(end))

        words = await page.evaluate("() => document.querySelector('.ti-build')?.textContent || ''")
        check("demo" in words.lower(), "the title screen says it is the demo", words)

        await page.evaluate("""() => {
          location.hash = 'scene=gameover&result=victory&demo=1&region=greenhouse';
          location.reload();
        }""")
        await page.wait_for_timeout(1500)
        await page.wait_for_function("window.MM && window.MM.ctx && window.MM.ctx.scenes.currentName === 'gameover' && !window.MM.ctx.scenes.busy", timeout=60000)
        await page.wait_for_timeout(1000)
        head = await page.evaluate("() => document.querySelector('.go-head')?.textContent || ''")
        check("end of the demo" in head, "and the ending says what happened", " ".join(head.split())[:120])
        await page.screenshot(path="shots/demo-ending.png")

        # Every creature in the demo's wings has a painting on the board, its own or a
        # relative's. The Wardrobe's two doors are drawn as doors, and read as doors.
        unpainted = await page.evaluate("""async () => {
          const { ENEMIES } = await import('/game/src/data/enemies/index.js');
          const R = await import('/game/src/state/run.js');
          const built = (await (await fetch('/game/assets/sprites/index.json')).json()).enemies;
          const wings = new Set(['foyer', ...R.DEMO_WINGS.pool]);
          return Object.values(ENEMIES).filter(d => wings.has(d.region) && !built[d.id]).map(d => d.id).sort();
        }""")
        check(unpainted == ["wardrobe-door-left", "wardrobe-door-right"],
              "no blob stands in the demo's wings", ", ".join(unpainted))

        # The crowded board: the readout may not lie over a creature's plate at either size.
        for w, h in ((1600, 900), (1280, 800)):
            crowd = await ctx.new_page()
            crowd.on("pageerror", lambda e: errors.append(str(e)))
            await crowd.set_viewport_size({"width": w, "height": h})
            await crowd.goto("http://localhost:8777/game/index.html#scene=combat&seed=7&companion=bones&kid=maya"
                             "&region=sleeping-quarters&encounter=sq-scare-hydra", wait_until="load", timeout=60000)
            await crowd.wait_for_selector(".cb-incoming:not([hidden])", timeout=120000)
            await crowd.wait_for_timeout(2500)
            hit = await crowd.evaluate("""() => {
              const r = document.querySelector('.cb-incoming').getBoundingClientRect();
              return [...document.querySelectorAll('.cb-enemy__plate')].filter(e => {
                const o = e.getBoundingClientRect();
                return Math.min(r.right, o.right) > Math.max(r.left, o.left)
                    && Math.min(r.bottom, o.bottom) > Math.max(r.top, o.top);
              }).map(e => e.textContent.trim().slice(0, 30));
            }""")
            check(not hit, f"the incoming readout clears the Hydra's plates at {w}x{h}", "; ".join(hit))
            await crowd.close()

        full = await ctx.new_page()
        full.on("pageerror", lambda e: errors.append(str(e)))
        await full.goto("http://localhost:8777/game/index.html", wait_until="load", timeout=60000)
        await full.wait_for_function("window.MM && window.MM.ctx && window.MM.ctx.scenes.currentName && !window.MM.ctx.scenes.busy", timeout=60000)
        f = await full.evaluate(WALK)
        check(not f["demo"], "without the flag it is the full game")
        check(f["lens"] == [6], "six wings", str(f["lens"]))
        check(len(f["wings"]) > 5, "the whole house on offer", str(len(f["wings"])))
        check(f["heart"] > 0, "and the Heart at the end")
        await browser.close()

    for e in errors[:10]:
        print("  ERROR ", e[:300])
    check(not errors, "no page logged an error", f"{len(errors)} logged")
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
