"""Map regression suite. OWNER: map agent.

    python tests/map/run.py [--verbose]

Drives the REAL map scene in a real browser, because every regression this
guards against was invisible to a unit test:

  1. A legal node, clicked with a mouse, must actually be chosen.  The map once
     called setPointerCapture on pointerdown, which retargets the click to the
     viewport so the delegated handler never sees a node; and the taped header
     card sat over the first row of rooms with pointer events on, so the entry
     rooms could not be clicked at all.  Three consecutive clicks changed one
     pixel.  This test clicks and asserts the model moved.
  2. The walked route must ink from the FIRST step, not the second.
  3. Everything the player cannot enter must be dimmed (StS2-REFERENCE 5).
  4. The sheet must not fit so small that the marks vanish.
  5. A wheel notch must be a nudge, not a jump.
  6. The route graph must branch, and must never draw a crossing edge.

Exit code 0 only when every assertion passes.  Needs the dev server on 8777.
"""
import asyncio, sys, argparse, json

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://localhost:8777/game/index.html"

PROBE = r"""(() => {
  const q = s => [...document.querySelectorAll(s)];
  const nodes = q('.map-node'), edges = q('.mi-edge');
  const c = (a, k) => a.filter(n => n.classList.contains(k)).length;
  const sh = document.querySelector('.map-sheet');
  const zoom = sh ? +new DOMMatrixReadOnly(getComputedStyle(sh).transform).a.toFixed(4) : null;
  const holder = document.querySelector('.map-nodes');
  const k = holder ? parseFloat(getComputedStyle(holder).getPropertyValue('--mn-k')) || 1 : 1;
  return {
    total: nodes.length, dim: c(nodes,'is-dim'), legal: c(nodes,'is-legal'),
    visited: c(nodes,'is-visited'), current: c(nodes,'is-current'), kbd: c(nodes,'is-kbd'),
    edgeTotal: edges.length, edgeWalked: c(edges,'is-walked'),
    edgeOpen: c(edges,'is-open'), edgeDead: c(edges,'is-dead'),
    zoom, iconScale: zoom ? +(zoom * k).toFixed(4) : null,
  };
})()"""

MODEL = r"""(() => {
  const s = window.MM && window.MM.ctx && window.MM.ctx.scenes;
  const sc = s && (s.current || s.active || s.scene);
  const m = sc && sc.model;
  return m ? { visited: m.visited.size, currentId: m.currentId, path: m.path.slice() } : null;
})()"""

GRAPH = r"""(async () => {
  const mg = await import('/game/src/state/mapgen.js');
  const { NodeType } = await import('/game/src/data/schema.js');
  const regions = ['foyer','nursery','greenhouse','graveyard','lampworks','hedge-maze'];
  const seeds = [1,7,42,1337];
  let out = 0, n = 0, single = 0, cross = 0, isolated = 0, unreachable = 0;
  const sigs = new Set();
  for (const r of regions) for (const s of seeds) {
    const m = mg.generateRegionMap(r, s, { hauntLevel: 0, companion: null, rescued: [] });
    const byId = new Map(m.nodes.map(x => [x.id, x]));
    const lastWalk = m.rows - 2;
    for (const x of m.nodes) {
      if (x.type === NodeType.BOSS || x.row >= lastWalk) continue;
      out += x.next.length; n++;
      if (x.next.length === 1) single++;
      if (x.next.length === 0) isolated++;
    }
    // every room must be reachable from the door and must reach the boss
    const fwd = mg.reachableFrom(m, null);
    for (const x of m.nodes) {
      if (m.startIds.includes(x.id) || x.id === m.bossId) continue;
      if (!fwd.has(x.id)) unreachable++;
    }
    // true geometric crossings on the laid-out sheet
    const segs = [];
    for (const x of m.nodes) for (const id of x.next) {
      const b = byId.get(id); if (b) segs.push([x.x, x.y, b.x, b.y, x.id, b.id]);
    }
    const o = (ax,ay,bx,by,cx,cy) => {
      const v = (by-ay)*(cx-bx) - (bx-ax)*(cy-by);
      return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : -1);
    };
    for (let i=0;i<segs.length;i++) for (let j=i+1;j<segs.length;j++) {
      const A=segs[i], B=segs[j];
      if (A[4]===B[4]||A[4]===B[5]||A[5]===B[4]||A[5]===B[5]) continue;
      if (o(A[0],A[1],A[2],A[3],B[0],B[1]) !== o(A[0],A[1],A[2],A[3],B[2],B[3]) &&
          o(B[0],B[1],B[2],B[3],A[0],A[1]) !== o(B[0],B[1],B[2],B[3],A[2],A[3])) cross++;
    }
    const comp = {};
    for (const x of m.nodes) comp[x.type] = (comp[x.type]||0)+1;
    sigs.add(JSON.stringify(Object.keys(comp).sort().map(t=>t+':'+comp[t])));
  }
  return { meanBranch: +(out/n).toFixed(3), singleExitPct: +(single/n*100).toFixed(1),
           crossings: cross, isolated, unreachable,
           distinctCompositions: sigs.size, maps: regions.length*seeds.length };
})()"""


class Suite:
    def __init__(self):
        self.rows = []

    def check(self, name, cond, detail=""):
        self.rows.append((bool(cond), name, detail))

    @property
    def failed(self):
        return sum(1 for ok, _, _ in self.rows if not ok)

    def report(self, verbose):
        for ok, name, detail in self.rows:
            if not ok or verbose:
                print(("PASS  " if ok else "FAIL  ") + name + (("  — " + detail) if detail else ""))
        print("\nRESULT: %d passed, %d failed" % (len(self.rows) - self.failed, self.failed))


async def main(a):
    from playwright.async_api import async_playwright
    S = Suite()
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--enable-unsafe-swiftshader",
            "--font-render-hinting=none", "--disable-lcd-text",
            "--autoplay-policy=no-user-gesture-required"])
        page = await (await browser.new_context(
            viewport={"width": 1600, "height": 900},
            reduced_motion="no-preference")).new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(BASE + "#scene=map&seed=42&region=foyer", wait_until="load", timeout=45000)
        await page.wait_for_selector(".map-node", timeout=20000)
        # WAIT FOR THE SWEEP TO FINISH, not for a number of milliseconds.
        #
        # The survey draws itself on in one 820 ms wipe, and `_whenVisible()`
        # holds that back until the veil is up and three frames have come in
        # under 40 ms — up to 2.5 s on a cold boot. A flat 1400 ms therefore
        # clicked mid-draw two runs in three on this machine, and the mouse half
        # of this suite went red while the keyboard half stayed green, which
        # reads exactly like the pointer-capture regression it exists to catch.
        # `.is-drawn` is the real signal.
        await page.wait_for_selector(".map-screen.is-drawn", timeout=20000)
        await page.wait_for_timeout(300)

        start = await page.evaluate(PROBE)

        # ── 3. dimming ──────────────────────────────────────────────────────
        S.check("every unavailable room is dimmed at region start",
                start["dim"] == start["total"] - start["legal"],
                f"dim={start['dim']} legal={start['legal']} total={start['total']}")
        S.check("at least four fifths of the sheet is dimmed at region start",
                start["dim"] >= start["total"] * 0.8, f"dim={start['dim']}/{start['total']}")
        S.check("open edges match the legal rooms exactly",
                start["edgeOpen"] == start["legal"],
                f"open={start['edgeOpen']} legal={start['legal']}")
        S.check("every other edge is drawn back",
                start["edgeDead"] == start["edgeTotal"] - start["edgeOpen"],
                f"dead={start['edgeDead']} of {start['edgeTotal']}")
        S.check("the first row offers a real choice", start["legal"] >= 3,
                f"legal={start['legal']}")

        # ── 4. fit + icon scale ─────────────────────────────────────────────
        S.check("the sheet fits at 0.70x or better", start["zoom"] >= 0.70,
                f"zoom={start['zoom']}")
        S.check("node marks render at 0.85x or better", start["iconScale"] >= 0.85,
                f"iconScale={start['iconScale']}")

        # ── 1 + 2. THE mouse path ───────────────────────────────────────────
        el = await page.query_selector(".map-node.is-legal")
        S.check("a legal room exists to click", el is not None)
        if el:
            nid = await el.get_attribute("data-id")
            box = await el.bounding_box()
            await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await page.wait_for_timeout(90)
            await page.mouse.down()
            await page.wait_for_timeout(40)
            await page.mouse.up()
            await page.wait_for_timeout(750)
            m1 = await page.evaluate(MODEL)
            d1 = await page.evaluate(PROBE)
            S.check("clicking a legal room chooses it",
                    m1 and m1["visited"] == 1 and m1["currentId"] is not None,
                    f"clicked {nid} -> {json.dumps(m1)}")
            S.check("the room stamps as visited in the DOM", d1["visited"] == 1 and d1["current"] == 1,
                    f"visited={d1['visited']} current={d1['current']}")
            S.check("the walked route inks on the very first step", d1["edgeWalked"] >= 1,
                    f"edgeWalked={d1['edgeWalked']}")
            S.check("the route is seeded with the doorway marker",
                    m1 and len(m1["path"]) == 2 and m1["path"][0] == "__in",
                    f"path={m1['path'] if m1 else None}")

            # ── keyboard still chooses ──────────────────────────────────────
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(650)
            m2 = await page.evaluate(MODEL)
            S.check("Enter walks the keyboard-focused room",
                    m2 and m2["visited"] == 2, f"{json.dumps(m2)}")
            d2 = await page.evaluate(PROBE)
            S.check("the walked route keeps inking", d2["edgeWalked"] >= 2,
                    f"edgeWalked={d2['edgeWalked']}")
            S.check("the keyboard focus is marked on exactly one room", d2["kbd"] == 1,
                    f"kbd={d2['kbd']}")

        # ── 7. the same route, with a REAL Run behind the screen ────────────
        # Everything above runs the map STANDALONE, on its own mock model, and
        # that is most of what this screen is. It is also why nothing here saw
        # the map quietly become the one screen not on the wire: the route was
        # written straight onto the Run and reached the run layer down a bus
        # name. It goes through `ACT.MAP_VOTE` now, and the seam it crosses is
        # only exercised when a Run is actually there.
        #
        # `__in` is the drawing's doorway sentinel — no such node exists. It
        # used to be assigned onto `run.pathIds` with the rest of the screen's
        # path and went into every save; the screen prepends it for itself now.
        # Both halves are checked, because putting the route on the wire and
        # keeping the way-in arrow inked are separate promises (trap 46).
        await page.goto(BASE + "#scene=map&seed=42&region=foyer", wait_until="load", timeout=45000)
        await page.wait_for_selector(".map-screen.is-drawn", timeout=20000)
        await page.evaluate("""async () => {
          const { bus } = await import('/game/src/core/bus.js');
          bus.emit('run:start', { companion: 'marmalade', kid: 'maya', seed: 42 });
          const r = window.MM.ctx.run;
          await r._goto('map', { region: r.region, seed: r.seed });
        }""")
        await page.wait_for_selector(".map-screen.is-drawn", timeout=20000)
        await page.wait_for_timeout(400)
        live = await page.evaluate("() => !!(window.MM.ctx.run && window.MM.ctx.scenes.current.model.run)")
        S.check("a real Run is behind the blueprint", live)

        picked = await page.evaluate("""() => {
          const el = document.querySelector('.map-node.is-legal');
          if (!el) return null;
          el.click();
          return el.dataset.id;
        }""")
        # A fixture that can come back EMPTY has to say so. Without this, a
        # selector that matched nothing left `picked` as None, no click was
        # made, and all three assertions below compared None against None and
        # passed — the same shape that already bit tests/net once this session.
        S.check("a legal room was there to click", isinstance(picked, str) and picked,
                repr(picked))
        await page.wait_for_timeout(2200)
        after = await page.evaluate("""() => {
          const r = window.MM.ctx.run;
          return { current: r.currentNodeId, path: r.pathIds.slice(),
                   visited: r.visitedIds.slice() };
        }""")
        S.check("clicking a room walks the RUN into it, not just the drawing",
                after["current"] == picked, f"clicked {picked} -> {after['current']}")
        S.check("and the screen's doorway sentinel stays out of the run's route",
                "__in" not in after["path"], f"pathIds={after['path']}")
        S.check("entered, not cleared — the room is still owed",
                picked not in after["visited"], f"visitedIds={after['visited']}")

        # back to the blueprint: the way-in arrow has to survive the rebuild,
        # which is where dropping the sentinel from `pathIds` would show.
        await page.evaluate("""async () => {
          const r = window.MM.ctx.run;
          await r._goto('map', { region: r.region, seed: r.seed });
        }""")
        await page.wait_for_selector(".map-screen.is-drawn", timeout=20000)
        await page.wait_for_timeout(400)
        back = await page.evaluate(MODEL)
        d3 = await page.evaluate(PROBE)
        S.check("coming back to the blueprint still draws the way-in arrow",
                d3["edgeWalked"] >= 1, f"edgeWalked={d3['edgeWalked']} path={back['path']}")
        S.check("and the drawing puts the doorway back on the front of the route",
                back["path"][0] == "__in" and picked in back["path"],
                f"path={back['path']}")

        # ── 5. wheel zoom ───────────────────────────────────────────────────
        await page.goto(BASE + "#scene=map&seed=42&region=foyer", wait_until="load", timeout=45000)
        await page.wait_for_selector(".map-node", timeout=20000)
        await page.wait_for_selector(".map-screen.is-drawn", timeout=20000)
        await page.wait_for_timeout(300)
        vp = await (await page.query_selector(".map-viewport")).bounding_box()
        z0 = (await page.evaluate(PROBE))["zoom"]
        await page.mouse.move(vp["x"] + vp["width"] / 2, vp["y"] + vp["height"] / 2)
        await page.mouse.wheel(0, -400)
        await page.wait_for_timeout(220)
        z1 = (await page.evaluate(PROBE))["zoom"]
        factor = z1 / z0 if z0 else 0
        S.check("a wheel notch nudges the zoom rather than jumping it",
                1.10 <= factor <= 1.32, f"factor={factor:.3f} per deltaY=400 notch")

        # ── 6. the route graph, over 24 generated maps ──────────────────────
        g = await page.evaluate(GRAPH)
        S.check("no edge ever crosses another, on any seed", g["crossings"] == 0,
                f"crossings={g['crossings']} over {g['maps']} maps")
        S.check("no room is stranded without an exit", g["isolated"] == 0)
        S.check("every room is reachable from the door", g["unreachable"] == 0)
        S.check("rooms average well over one exit", g["meanBranch"] >= 1.75,
                f"mean={g['meanBranch']} exits per non-terminal room")
        S.check("single-exit rooms are capped near a fifth", g["singleExitPct"] <= 20.5,
                f"singleExit={g['singleExitPct']}%")
        S.check("no two generated maps share a node composition",
                g["distinctCompositions"] == g["maps"],
                f"{g['distinctCompositions']} distinct of {g['maps']}")

        S.check("the map scene throws nothing", not errors, "; ".join(errors[:3]))
        await browser.close()

    S.report(a.verbose)
    return 0 if S.failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
