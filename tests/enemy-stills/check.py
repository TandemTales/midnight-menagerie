"""Every painted enemy stands on the board as its painting.  OWNER: frontend.

    python tests/enemy-stills/check.py [--only foyer-boss,kc-12]

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
For its whole life every enemy was a procedural rig, and when the first painted
stills landed (2026-09-12: the Foyer, the Nursery, the Sleeping Quarters, then
the Kitchens as they were delivered) there were four ways to ship them wrong and
none of them would have turned anything red:

  the name     the files are camelCase (`bedframeBeast.png`) and EnemyView asks
               for the kebab-case EnemyDef id; `wardrobe.png` is `the-wardrobe`
               and the twins arrived as `prim.png` and `proper.png`. A still
               built under the wrong key is a silhouette that looks exactly like
               a still nobody built.
  the build    a source dropped into `animations/sprites/enemies/` and never
               built, or redelivered and built from the OLD file, is the same
               silhouette or the wrong painting.
  the swap     a view that stands its rig up and then swaps in the painting is a
               visible flash of a different creature -- the rule PlayerView's
               Kid already learned ("DON'T SHOW THE DRAWN KID JUST TO TAKE HER
               AWAY AGAIN").
  the stage    the painting has to stand on the ground line at its tier's size,
               with the pose, the hit flash and the death all still reaching it.

So this checks all four, in three layers:

  STATIC       built files against the manifest, and -- where the sources are on
               this machine, which they are wherever art is delivered -- every
               source against the still built from it, by name AND by content.
  CONSTRUCT    a painted EnemyView hides its rig and takes its shape in its
               CONSTRUCTOR, before it can paint a frame; an unpainted one makes no
               request at all.
  BOARD        real fights, chosen so every painted enemy that appears in any
               encounter stands on some board, with the drawn parts beside them
               (the Hydra's Heads, the Wardrobe's Doors, the Governess's Doll) as
               the control. Then one board is made to act: the lunge carries the
               painting, a hit flashes it, a death dims and dissolves it.

Prints `RESULT: n passed, m failed, k console errors`. Exit 0 only when m == 0
and k == 0.
"""
import argparse
import asyncio
import json
import os
import sys

import numpy as np
from PIL import Image

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import prep_sprites as P  # noqa: E402  (the build's own name resolution, not a copy of it)

BASE = "http://localhost:8777/game/index.html"
SPRITES = os.path.join(ROOT, "game", "assets", "sprites")
OUTDIR = os.path.join(SPRITES, "enemies")
SRC = os.path.join(ROOT, P.SRC_ENEMY_STILLS)
SCENE = "(window.MM && window.MM.ctx.scenes.current)"
# The painting's silhouette must match its source this closely to count as built from it.
SAME_ART_IOU = 0.98


def static_checks(manifest, check):
    enemies = manifest.get("enemies") or {}
    check(len(enemies) > 0, "the manifest carries enemy stills", "%d" % len(enemies))

    for eid, meta in sorted(enemies.items()):
        p = os.path.join(OUTDIR, meta.get("file", ""))
        if not os.path.exists(p):
            check(False, "built: %s" % eid, "%s is not on disk" % meta.get("file"))
            continue
        im = Image.open(p)
        check((im.width, im.height) == (meta.get("w"), meta.get("h")),
              "built: %s is the size the manifest says" % eid,
              "%s on disk, manifest %s" % (im.size, (meta.get("w"), meta.get("h"))), quiet=True)

    named = {m.get("file") for m in enemies.values()}
    strays = sorted(f for f in (os.listdir(OUTDIR) if os.path.isdir(OUTDIR) else []) if f not in named)
    check(not strays, "no built still the manifest does not name", ", ".join(strays))

    if not os.path.isdir(SRC):
        print("  (no %s on this machine: source checks skipped)" % P.SRC_ENEMY_STILLS, flush=True)
        return
    files = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
    by_id = {}
    for fn in files:
        by_id.setdefault(P.enemy_id_of_still(fn), []).append(fn)
    clash = {k: v for k, v in by_id.items() if len(v) > 1}
    check(not clash, "no two source files resolve to one enemy",
          "; ".join("%s <- %s" % (k, ", ".join(v)) for k, v in sorted(clash.items())))

    unbuilt = sorted(fn for eid, fns in by_id.items() for fn in fns if eid not in enemies)
    check(not unbuilt, "every delivered source is built",
          "run `python tools/prep_sprites.py --enemies`: " + ", ".join(unbuilt))
    orphans = sorted(eid for eid, m in enemies.items() if m.get("source") not in files)
    check(not orphans, "every built still has a delivered source",
          "built from files no longer delivered: " + ", ".join(orphans))

    # BY CONTENT, NOT BY NAME. A redelivered file keeps its name, so the only way
    # to know the still was built from THIS art is to compare the silhouettes.
    stale = []
    for eid, (fn,) in sorted((k, v) for k, v in by_id.items() if len(v) == 1 and k in enemies):
        meta = enemies[eid]
        if meta.get("source") != fn:
            stale.append("%s (built from %s)" % (eid, meta.get("source")))
            continue
        arr = np.array(Image.open(os.path.join(SRC, fn)).convert("RGBA"))
        a = P.clean_alpha(arr[:, :, 3].astype(np.float64) / 255.0)
        box = P.bbox(a)
        built = np.array(Image.open(os.path.join(OUTDIR, meta["file"])).convert("RGBA"))[:, :, 3] / 255.0
        if box is None:
            stale.append("%s (source is empty)" % eid)
            continue
        x0, y0, x1, y1 = box
        src = a[y0:y1, x0:x1]
        if src.shape != built.shape:
            # built through the ceiling: compare at the built size
            src = np.array(Image.fromarray((src * 255).astype(np.uint8)).resize(
                (built.shape[1], built.shape[0]), Image.LANCZOS)) / 255.0
        s, b = src > 0.5, built > 0.5
        iou = (s & b).sum() / max(1, (s | b).sum())
        if iou < SAME_ART_IOU:
            stale.append("%s (IoU %.3f)" % (eid, iou))
    check(not stale, "every built still was built from the art delivered today",
          "rebuild with `python tools/prep_sprites.py --enemies`: " + ", ".join(stale))


# A new combat scene whose creatures have all arrived and stopped moving: the
# spawn drop and any entrance finished, no lean, and every painting decoded.
STANDING = """
(first) => {
  const s = window.MM && window.MM.ctx.scenes.current;
  if (!s || window.MM.ctx.scenes.busy || s === window.__prevScene || !s.views || !s.views.size) return false;
  const vs = [...s.views.values()];
  if (!vs.some(v => v.def && v.def.id === first)) return false;
  return vs.every(v => v.a.spawn === 0 && v.a.entrance === 0
    && !v.el.classList.contains('is-entering')
    && Math.abs(v.a.lean) < 0.05 && v.a.rise < 0.05 && (!v.sprite || v._stillUp));
}
"""

VIEW_STATE = """
async (id) => {
  const s = window.MM.ctx.scenes.current;
  const v = [...s.views.values()].find(x => x.def && x.def.id === id);
  if (!v) return null;
  await v.art;
  const st = v.$stage.getBoundingClientRect();
  const im = v.$stillImg.getBoundingClientRect();
  return {
    up: !!v._stillUp, art: v.el.dataset.art || null,
    href: v.$stillImg.getAttribute('href') || '',
    shown: v.$still.style.display !== 'none',
    rigHidden: v.$rigArt.every(g => g.style.display === 'none'),
    rigShown: v.$rigArt.some(g => g.style.display !== 'none'),
    stage: [st.left, st.top, st.width, st.height, st.bottom],
    img: [im.left, im.top, im.width, im.height, im.bottom],
  };
}
"""


def board_checks(eid, meta, st, check):
    if st is None:
        check(False, "board: %s is on the board it was mounted for" % eid)
        return
    check(st["up"] and st["shown"], "board: %s stands as its painting" % eid,
          "stillUp=%s shown=%s" % (st["up"], st["shown"]), quiet=True)
    check(st["href"].endswith("/enemies/" + meta["file"]), "board: %s draws its own file" % eid,
          st["href"], quiet=True)
    check(st["rigHidden"], "board: %s has no drawn rig showing through" % eid, quiet=True)
    sl, stp, sw, sh, sb = st["stage"]
    il, itp, iw, ih, ib = st["img"]
    check(iw > 0 and ih > 0, "board: %s has a size on screen" % eid, "%dx%d" % (iw, ih), quiet=True)
    # FILLS ITS STAGE on the axis that binds: the fit leaves an 8%+6 top margin,
    # 5%+4 at each side and a 6-unit floor pad, so ~84% is the floor of a correct fit.
    fill = max(iw / max(1.0, sw), ih / max(1.0, sh))
    check(fill >= 0.80, "board: %s fills its stage" % eid,
          "%.0f%% of a %dx%d stage" % (100 * fill, sw, sh), quiet=True)
    # ON THE GROUND LINE: the bottom of the painting sits on the bottom of the
    # stage, less the viewBox's floor pad (6 of ~226 units) and the idle breath.
    gap = sb - ib
    check(-2 <= gap <= 0.07 * sh + 3, "board: %s stands on the floor" % eid,
          "%.1fpx above the stage floor (stage %dpx tall)" % (gap, sh), quiet=True)


def control_checks(eid, st, check):
    if st is None:
        return
    check(not st["up"] and not st["shown"] and st["rigShown"] and not st["art"],
          "control: unpainted %s keeps its drawn rig" % eid,
          "stillUp=%s shown=%s rigShown=%s art=%s" % (st["up"], st["shown"], st["rigShown"], st["art"]),
          quiet=True)


async def main(a):
    from playwright.async_api import async_playwright

    passes, fails, errors = [], [], []
    quiet_pass = [0]

    def check(ok, what, detail="", quiet=False):
        if ok and quiet:
            quiet_pass[0] += 1
            passes.append(what)
            return
        (passes if ok else fails).append(what + (" - " + detail if detail else ""))

    manifest = json.load(open(os.path.join(SPRITES, "index.json")))
    enemies = manifest.get("enemies") or {}
    print("static: built stills, manifest and sources", flush=True)
    static_checks(manifest, check)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1600, "height": 900})

        def watch(page):
            page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("requestfailed", lambda r: errors.append("Failed to load " + r.url))
            page.on("response", lambda r: errors.append("Failed to load %s (%d)" % (r.url, r.status))
                    if r.status >= 400 else None)

        async def board(page, bd, fresh):
            """Put board `bd` up and wait until every creature on it is STANDING.

            Loading a page costs ~10s and switching scenes inside one ~3s, so a
            page loads once and walks its boards. And the wait is for the board,
            not the whole opening: spawn and entrance finished, no lean, and the
            painting up wherever there is one."""
            if fresh:
                await page.goto(f"{BASE}#scene=combat&seed=7&encounter={bd['id']}&companion=bones&kid=maya",
                                wait_until="load", timeout=60000)
            else:
                # `core/scenes.js#go` DROPS a call made while it is busy ("busy,
                # queued drop"), and a board can be standing before its reveal has
                # finished. So wait it out, then enter the way a deep link does.
                await page.wait_for_function("() => !window.MM.ctx.scenes.busy", timeout=30000)
                await page.evaluate("""(p) => { window.__prevScene = window.MM.ctx.scenes.current;
                                                 return window.MM.ctx.scenes.go('combat', p, { instant: true }); }""",
                                    {"seed": 7, "encounter": bd["id"], "companion": "bones", "kid": "maya"})
            try:
                await page.wait_for_function(STANDING, arg=bd["members"][0], timeout=45000)
                return True
            except Exception:
                return False

        # ── the registry, and the boards that cover it ─────────────────────────
        page = await ctx.new_page()
        watch(page)
        first = {"id": "foyer-14", "members": ["door-greeter"]}
        check(await board(page, first, fresh=True), "the first board comes up", "foyer-14 never settled")
        plan = await page.evaluate("""async (painted) => {
          const [{ ENEMIES }, { ENCOUNTER_LIST, ENCOUNTERS }] = await Promise.all([
            import('/game/src/data/enemies/index.js'), import('/game/src/data/encounters.js')]);
          const list = ENCOUNTER_LIST || Object.values(ENCOUNTERS);
          const unknown = painted.filter(id => !ENEMIES[id]);
          const ids = (e) => (e.members || []).map(m => m.enemyId || m.id || m);
          const left = new Set(painted.filter(id => ENEMIES[id]));
          const pick = [];
          while (left.size) {
            let best = null, gain = 0;
            for (const e of list) {
              const g = new Set(ids(e).filter(i => left.has(i))).size;
              if (g > gain) { best = e; gain = g; }
            }
            if (!best) break;
            pick.push({ id: best.id, members: ids(best) });
            for (const i of ids(best)) left.delete(i);
          }
          return { unknown, pick, noBoard: [...left] };
        }""", sorted(enemies))
        check(not plan["unknown"], "every built still belongs to a real EnemyDef",
              ", ".join(plan["unknown"]))

        # ── construction: decided before a frame can be painted ─────────────────
        painted_id = sorted(enemies)[0]
        construct = await page.evaluate("""async ([paintedId]) => {
          const [{ EnemyView }, { enemyStill, manifestReady }, { ENEMIES }] = await Promise.all([
            import('/game/src/ui/enemy.js'), import('/game/src/ui/sprite.js'),
            import('/game/src/data/enemies/index.js')]);
          const s = window.MM.ctx.scenes.current;
          const snap = s.engine.state.enemies[0];
          const bare = Object.keys(ENEMIES).find(id => !enemyStill(id));
          const out = { ready: manifestReady(), bareId: bare };
          const v = new EnemyView({ ...snap, id: 'probe-painted' }, { def: ENEMIES[paintedId], clock: s.ctx.clock });
          out.painted = {
            rigHidden: v.$rigArt.every(g => g.style.display === 'none'),
            art: v.el.dataset.art || null,
            aspect: v.$stage.style.getPropertyValue('--e-aspect'),
            player: !!v.sprite,
          };
          out.paintedLoaded = await v.art;
          out.paintedHref = v.$stillImg.getAttribute('href') || '';
          v.destroy();
          const w = new EnemyView({ ...snap, id: 'probe-bare' }, { def: ENEMIES[bare], clock: s.ctx.clock });
          out.bare = {
            rigShown: w.$rigArt.every(g => g.style.display !== 'none'),
            art: w.el.dataset.art || null, player: !!w.sprite,
          };
          w.destroy();
          return out;
        }""", [painted_id])
        c = construct["painted"]
        check(construct["ready"], "construct: the manifest is in hand once the scene is up")
        check(c["rigHidden"] and c["art"] == "still" and bool(c["aspect"]) and c["player"],
              "construct: a painted enemy hides its rig and takes its shape IN ITS CONSTRUCTOR",
              "%s: %s" % (painted_id, c))
        check(construct["paintedLoaded"] is True and construct["paintedHref"].endswith(
              "/enemies/" + enemies[painted_id]["file"]),
              "construct: and its painting decodes into the view", construct["paintedHref"])
        b = construct["bare"]
        check(b["rigShown"] and not b["art"] and not b["player"],
              "CONTROL construct: an unpainted enemy keeps its rig and requests nothing",
              "%s: %s" % (construct["bareId"], b))

        # ── the boards ─────────────────────────────────────────────────────────
        boards = plan["pick"]
        if a.only:
            want = set(a.only.split(","))
            boards = [bd for bd in boards if bd["id"] in want]

        # Three pages walking their share of the boards (`tools/devserver.py` is
        # threaded). One fresh page per board took six and a half minutes.
        async def lane(i, todo):
            pg = page
            if i:
                pg = await ctx.new_page()
                watch(pg)
            out = []
            for j, bd in enumerate(todo):
                up = await board(pg, bd, fresh=(i > 0 and j == 0))
                states = [(eid, (await pg.evaluate(VIEW_STATE, eid)) if up else None)
                          for eid in dict.fromkeys(bd["members"])]
                out.append((bd, up, states))
            if i:
                await pg.close()
            return out

        lanes = await asyncio.gather(*(lane(i, boards[i::3]) for i in range(3)))
        controls = 0
        for bd, up, states in [r for ln in lanes for r in ln]:
            check(up, "board: %s comes up and every creature settles" % bd["id"], quiet=True)
            for eid, st in states:
                if eid in enemies:
                    board_checks(eid, enemies[eid], st, check)
                else:
                    controls += 1
                    control_checks(eid, st, check)
            print("  %-24s %s" % (bd["id"], ", ".join(
                ("%s*" % m if m in enemies else m) for m, _ in states)), flush=True)
        if plan["noBoard"]:
            print("  in no encounter (summon-only), checked by construction only: "
                  + ", ".join(plan["noBoard"]), flush=True)

        # ── acting: the painting goes where the creature goes ────────────────────
        if not a.only:
            check(await board(page, first, fresh=False), "the acting board comes up", "foyer-14 never settled")
            act = await page.evaluate("""async () => {
              const s = window.MM.ctx.scenes.current;
              const v = [...s.views.values()].find(x => x._stillUp);
              const rect = () => v.$stillImg.getBoundingClientRect();
              const before = rect();
              await v.windup('attack');
              await v.strike();
              const lunged = rect();
              const lunge = [lunged.left - before.left, lunged.top - before.top];
              await v.settle();
              v.flinch(12);
              await new Promise(r => requestAnimationFrame(() => r()));
              const flash = getComputedStyle(v.$stillImg).animationName;
              const died = v.die();
              // `die()` runs on the game clock, not the wall clock: wait for the
              // beat itself rather than guessing how long a headless frame is.
              await new Promise((resolve) => {
                const t0 = performance.now();
                const tick = () => (v.el.classList.contains('is-lightsout') || performance.now() - t0 > 4000
                  ? resolve() : requestAnimationFrame(tick));
                tick();
              });
              await new Promise(r => setTimeout(r, 60));
              const dim = getComputedStyle(v.$stillImg).filter;
              await died;
              await new Promise(r => setTimeout(r, 120));
              return { id: v.def.id, lunge, flash, dim, opacity: Number(v.$stage.style.opacity || 1) };
            }""")
            dist = (act["lunge"][0] ** 2 + act["lunge"][1] ** 2) ** 0.5
            check(dist >= 10, "act: the lunge carries the painting with the creature",
                  "%s moved %.0fpx on contact" % (act["id"], dist))
            check("cb-hitflash" in (act["flash"] or ""), "act: a hit flashes the painting",
                  "animation-name %s" % act["flash"])
            check("brightness" in (act["dim"] or ""), "act: the lights go out on the painting before it comes apart",
                  "filter %s" % act["dim"])
            check(act["opacity"] <= 0.05, "act: and the death dissolves it", "stage opacity %.2f" % act["opacity"])

        await page.close()
        await browser.close()

    print("\n  %d painted enemies, %d boards, %d drawn controls, %d quiet checks passed"
          % (len(enemies), len(boards), controls, quiet_pass[0]), flush=True)
    for line in passes:
        if not line.startswith(("board: ", "control: ", "built: ")):
            print("  PASS  " + line, flush=True)
    for line in fails:
        print("  FAIL  " + line, flush=True)
    # Every console error counts: a painted board is exactly where a 404 for a
    # still or a throw in the swap would surface, and nothing else prints here.
    bad = errors
    for line in bad[:8]:
        print("  CONSOLE  " + line, flush=True)
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed, {len(bad)} console errors", flush=True)
    return 1 if (fails or bad) else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated encounter ids to mount")
    sys.exit(asyncio.run(main(ap.parse_args())))
