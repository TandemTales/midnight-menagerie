"""Every enemy with animation delivered moves on the board in its own clips.  OWNER: frontend.

    python tests/enemy-clips/check.py

Needs the dev server on :8777 (python tools/devserver.py 8777).

WHY THIS EXISTS
---------------
Josh's enemy sheets (`animations/sprites/enemies/animations/SS_<name>_<clip>.png`,
from 2026-09-13) build through `python tools/prep_sprites.py --enemy-clips` into
`game/assets/sprites/enemy-clips/<id>/`, and `EnemyView` plays them where they
exist. Each way this goes wrong looks like something that is not wrong:

  the name      `SS_rug_idle.png` is the Red Carpet Runner. A sheet built under
                the wrong key is an enemy that never moves, which is what an
                enemy with no clips looks like.
  the build     a sheet delivered and never built, or redelivered and built from
                the OLD file, is the same still creature or the old animation.
  the defeat    every defeat sheet delivered falls AND GETS BACK UP. Built whole
                and held on its last frame, a dead creature stands up again.
  the beats     attack at the wind-up, hurt only on a hit that got through, cast
                for a buff or a summon where there is one, defeat before the
                dissolve. A beat that plays nothing leaves the idle running,
                which reads as a creature that did not notice.

Three layers:

  STATIC     built files against the manifest; every clip's geometry; every
             delivered sheet against the clip built from it, by name AND by
             the bytes it was built from (`sha1`).
  CONSTRUCT  every animated enemy, in a page of its own batch: its view animates
             (the idle's frame advances), frozen on frame 0 under reduced motion.
  BOARD      real fights, and every beat on a creature standing in one, including
             the Butler's cast in the boss mirror; the moving painting stands on
             its floor and fills its stage.

Prints `RESULT: n passed, m failed, k console errors`. Exit 0 only when m == 0
and k == 0.
"""
import asyncio
import json
import os
import sys

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
CLIPDIR = os.path.join(SPRITES, P.ENEMY_CLIPS_DIR)
SRC = os.path.join(ROOT, P.SRC_ENEMY_SHEETS)
REQUIRED = ("idle", "attack", "hurt", "defeat")


def static_checks(manifest, check):
    section = manifest.get("enemyClips") or {}
    check(len(section) > 0, "the manifest carries enemy clips", "%d enemies" % len(section))

    for eid, names in sorted(section.items()):
        idx_path = os.path.join(CLIPDIR, eid, "index.json")
        if not os.path.exists(idx_path):
            check(False, "built: %s has its index" % eid, "%s is missing" % idx_path)
            continue
        idx = json.load(open(idx_path))
        clips = idx.get("clips") or {}
        check(sorted(clips) == sorted(names), "built: %s's index lists what the manifest says" % eid,
              "index %s, manifest %s" % (sorted(clips), sorted(names)), quiet=True)
        missing = [n for n in REQUIRED if n not in clips]
        check(not missing, "built: %s has idle, attack, hurt and defeat" % eid, "missing " + ", ".join(missing))
        check((idx.get("unit") or 0) > 0, "built: %s publishes its unit" % eid, str(idx.get("unit")), quiet=True)
        for name, c in sorted(clips.items()):
            what = "%s/%s" % (eid, name)
            p = os.path.join(CLIPDIR, eid, c.get("file", ""))
            if not os.path.exists(p):
                check(False, "built: %s is on disk" % what, c.get("file"))
                continue
            w, h = Image.open(p).size
            check((w, h) == (c["cols"] * c["fw"], c["rows"] * c["fh"]), "built: %s's atlas is its grid" % what,
                  "%dx%d on disk, grid %dx%d" % (w, h, c["cols"] * c["fw"], c["rows"] * c["fh"]), quiet=True)
            check(1 < c["frames"] <= c["cols"] * c["rows"], "built: %s has its frames" % what,
                  "%d frames in %dx%d" % (c["frames"], c["cols"], c["rows"]), quiet=True)
            ax, ay = c.get("anchor") or (-1, -1)
            check(0 <= ax <= c["fw"] and 0 <= ay <= c["fh"], "built: %s's feet are inside its frame" % what,
                  "anchor %s in %dx%d" % (c.get("anchor"), c["fw"], c["fh"]), quiet=True)
            check("fade" not in c, "built: %s never fades (a lunge's blur is not a dissolve)" % what, quiet=True)
            check(max(c["fw"], c["fh"]) <= P.ENEMY_CLIP_MAX_SIDE + 2, "built: %s's frame is inside the cap" % what,
                  "%dx%d over %d" % (c["fw"], c["fh"], P.ENEMY_CLIP_MAX_SIDE), quiet=True)
        # Every clip draws the creature at one size: each clip's unit over its own
        # scale is the same source figure (prep_sprites, THE CAP IS PER CLIP).
        figures = sorted(c["unit"] / c["scale"] for c in clips.values() if c.get("unit") and c.get("scale"))
        check(len(figures) == len(clips) and figures[-1] - figures[0] < 1.0,
              "built: %s's clips agree on the figure's size" % eid,
              "unit/scale per clip %s" % ["%.1f" % f for f in figures], quiet=True)
        if "idle" in clips:
            check(clips["idle"]["loop"], "built: %s's idle loops" % eid, quiet=True)
        if "defeat" in clips:
            d = clips["defeat"]
            check(d["hold"] and not d["loop"], "built: %s's defeat holds its last frame" % eid, quiet=True)
            check(d["frames"] < d.get("sourceFrames", 0),
                  "built: %s's defeat is cut before the creature gets back up" % eid,
                  "%s of %s frames" % (d["frames"], d.get("sourceFrames")))
        on_disk = set(os.listdir(os.path.join(CLIPDIR, eid)))
        strays = sorted(on_disk - {c["file"] for c in clips.values()} - {"index.json"})
        check(not strays, "built: %s's folder holds only its clips" % eid, ", ".join(strays))

    folders = sorted(os.listdir(CLIPDIR)) if os.path.isdir(CLIPDIR) else []
    check(not [f for f in folders if f not in section], "no built enemy the manifest does not name",
          ", ".join(f for f in folders if f not in section))

    if not os.path.isdir(SRC):
        print("  (no %s on this machine: source checks skipped)" % P.SRC_ENEMY_SHEETS, flush=True)
        return
    by_id, clash = P.enemy_sheets()
    check(not clash, "no two sheet names resolve to one enemy",
          "; ".join("%s <- %s" % (k, ", ".join(v)) for k, v in sorted(clash.items())))
    unbuilt = sorted("%s/%s" % (eid, n) for eid, cl in by_id.items() for n in cl
                     if n not in (section.get(eid) or []))
    check(not unbuilt, "every delivered sheet is built",
          "run `python tools/prep_sprites.py --enemy-clips`: " + ", ".join(unbuilt))
    stale, orphans = [], []
    for eid in sorted(section):
        idx_path = os.path.join(CLIPDIR, eid, "index.json")
        if not os.path.exists(idx_path):
            continue
        for name, c in sorted(json.load(open(idx_path))["clips"].items()):
            src = (by_id.get(eid) or {}).get(name)
            if not src or os.path.basename(src) != c.get("source"):
                orphans.append("%s/%s (%s)" % (eid, name, c.get("source")))
            elif P.file_sha1(src) != c.get("sha1"):
                stale.append("%s/%s" % (eid, name))
    check(not orphans, "every built clip has its delivered sheet", "built from files not delivered: " + ", ".join(orphans))
    check(not stale, "every built clip was built from the sheet delivered today",
          "rebuild with `python tools/prep_sprites.py --enemy-clips --only <id>`: " + ", ".join(stale))


REGISTRY = """
async (ids) => {
  const { ENEMIES } = await import('/game/src/data/enemies/index.js');
  return ids.filter(id => !ENEMIES[id]);
}
"""

# Build views for a batch of animated enemies, off the board, and tick them by hand.
CONSTRUCT = """
async (ids) => {
  const [{ EnemyView }, { ENEMIES }] = await Promise.all([
    import('/game/src/ui/enemy.js'), import('/game/src/data/enemies/index.js')]);
  const s = window.MM.ctx.scenes.current;
  const snap = s.engine.state.enemies[0];
  const out = {};
  for (const id of ids) {
    const r = {};
    for (const reduceMotion of [false, true]) {
      const v = new EnemyView({ ...snap, id: 'probe-' + id }, { def: ENEMIES[id], clock: s.ctx.clock, reduceMotion });
      const loaded = await v.art;
      const i0 = v.sprite?.frame()?.index;
      for (let k = 0; k < 30; k++) v.update(1 / 30, k / 30);
      const one = {
        loaded, clipUp: !!v._clipUp, art: v.el.dataset.art || null,
        href: v.$stillImg.getAttribute('href') || '', clip: v.sprite?.name,
        i0, i1: v.sprite?.frame()?.index,
        rigHidden: v.$rigArt.every(g => g.style.display === 'none'),
      };
      v.destroy();
      r[reduceMotion ? 'still' : 'moving'] = one;
    }
    out[id] = r;
  }
  return out;
}
"""

BEATS = """
async (id) => {
  const s = window.MM.ctx.scenes.current;
  const v = [...s.views.values()].find(x => x.def && x.def.id === id);
  if (!v) return { missing: true };
  await v.art;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // wait on the GAME clock's progress, not the wall clock: a loaded headless page
  // renders slowly and the clock caps its step
  const until = async (fn, ms = 8000) => {
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < ms) await sleep(30);
    return fn();
  };
  const out = { clipUp: !!v._clipUp, has: Object.keys(v.sprite?.clips || {}) };
  const st = v.$stage.getBoundingClientRect();
  const pr = v.paintRect();
  out.stage = [st.width, st.height, st.bottom];
  out.paint = [pr.width, pr.height, pr.feet];
  const idleAt = v.sprite.frame().index;
  await until(() => v.sprite.frame().index !== idleAt, 3000);
  out.idleMoves = v.sprite.frame().index !== idleAt;

  // a blocked hit is a clank: nothing plays over the idle
  await until(() => v.sprite.name === 'idle');
  v.clank(6); await sleep(50);
  out.clank = v.sprite.name;

  v.windup('attack'); await sleep(20);
  out.attack = v.sprite.name;
  await v.strike(); await v.settle();
  out.backToIdle = await until(() => v.sprite.name === 'idle');

  v.flinch(12); await sleep(20);
  out.hurt = v.sprite.name;
  await until(() => v.sprite.name === 'idle');

  v.windup('buff'); await sleep(20);
  out.buff = v.sprite.name;
  await v.settle();
  await until(() => v.sprite.name === 'idle');

  const died = v.die();
  await until(() => v.sprite.name === 'defeat', 3000);
  out.defeat = v.sprite.name;
  out.held = await until(() => v.sprite.done, 8000);
  const heldAt = v.sprite.frame().index;
  await died;
  out.stillHeld = v.sprite.name === 'defeat' && v.sprite.frame().index === heldAt;
  out.lightsout = v.el.classList.contains('is-lightsout');
  out.opacity = Number(v.$stage.style.opacity || 1);
  return out;
}
"""


async def main():
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
    section = manifest.get("enemyClips") or {}
    print("static: built clips, manifest and sheets", flush=True)
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

        async def fight(page, encounter):
            await page.goto(f"{BASE}#scene=combat&seed=7&encounter={encounter}&companion=bones&kid=maya",
                            wait_until="load", timeout=60000)
            try:
                await page.wait_for_function(
                    """() => { const s = window.MM && window.MM.ctx.scenes.current;
                               return s && s.views && s.views.size && !window.MM.ctx.scenes.busy
                                 && [...s.views.values()].every(v => (!v.sprite || v._stillUp)
                                   && v.a.entrance === 0 && v.a.spawn === 0
                                   && !v.el.classList.contains('is-entering')); }""",
                    timeout=60000)
                return True
            except Exception:
                return False

        # ── construction, every animated enemy, a batch per page ─────────────────
        ids = sorted(section)
        page = await ctx.new_page()
        watch(page)
        check(await fight(page, "foyer-14"), "the first board comes up", "foyer-14 never settled")
        unknown = await page.evaluate(REGISTRY, ids)
        check(not unknown, "every enemy with clips is a real EnemyDef", ", ".join(unknown))
        await page.close()

        for k in range(0, len(ids), 5):
            batch = [i for i in ids[k:k + 5] if i not in unknown]
            pg = await ctx.new_page()
            watch(pg)
            if not await fight(pg, "foyer-14"):
                check(False, "construct: a board for batch %s" % ", ".join(batch))
                await pg.close()
                continue
            res = await pg.evaluate(CONSTRUCT, batch)
            for eid in batch:
                m, s = res[eid]["moving"], res[eid]["still"]
                check(m["loaded"] is True and m["clipUp"] and m["art"] == "still" and m["rigHidden"],
                      "construct: %s stands in its clips" % eid, json.dumps(m))
                check(("/enemy-clips/%s/idle" % eid) in m["href"], "construct: %s draws its own idle" % eid,
                      m["href"], quiet=True)
                check(m["clip"] == "idle" and m["i1"] != m["i0"], "construct: %s's idle moves" % eid,
                      "clip %s, frame %s -> %s" % (m["clip"], m["i0"], m["i1"]), quiet=True)
                check(s["clipUp"] and s["i1"] == s["i0"] == 0,
                      "construct: %s holds its first frame under reduced motion" % eid,
                      "frame %s -> %s" % (s["i0"], s["i1"]), quiet=True)
            await pg.close()
            print("  constructed " + ", ".join(batch), flush=True)

        # ── the beats, on creatures standing in real fights ───────────────────────
        plan = [("foyer-14", "door-greeter", False), ("foyer-14", "dust-bunny", False), ("foyer-boss", "butler", True)]
        for encounter, eid, casts in plan:
            if eid not in section:
                check(False, "beats: %s has clips to act with" % eid)
                continue
            pg = await ctx.new_page()
            watch(pg)
            up = await fight(pg, encounter)
            check(up, "beats: %s comes up" % encounter)
            if not up:
                await pg.close()
                continue
            b = await pg.evaluate(BEATS, eid)
            await pg.close()
            if b.get("missing"):
                check(False, "beats: %s stands on %s" % (eid, encounter))
                continue
            sw, sh, sb = b["stage"]
            pw, ph, feet = b["paint"]
            check(b["clipUp"], "beats: %s is animated on the board" % eid)
            check(max(pw / max(1, sw), ph / max(1, sh)) >= 0.80, "beats: %s's moving painting fills its stage" % eid,
                  "%dx%d in %dx%d" % (pw, ph, sw, sh))
            check(-2 <= sb - feet <= 0.07 * sh + 3, "beats: %s stands on its floor" % eid,
                  "feet %.1fpx above the stage floor" % (sb - feet))
            check(b["idleMoves"], "beats: %s idles" % eid)
            check(b["clank"] == "idle", "CONTROL beats: a blocked hit plays nothing on %s" % eid, b["clank"])
            check(b["attack"] == "attack", "beats: %s's wind-up plays its attack" % eid, str(b["attack"]))
            check(b["backToIdle"], "beats: %s's attack hands back to idle" % eid)
            check(b["hurt"] == "hurt", "beats: a hit that gets through plays %s's hurt" % eid, str(b["hurt"]))
            if casts:
                check(b["buff"] == "cast", "beats: a buff plays %s's cast" % eid, str(b["buff"]))
            else:
                check(b["buff"] == "idle", "CONTROL beats: %s has no cast, so a buff plays nothing" % eid, str(b["buff"]))
            check(b["defeat"] == "defeat" and b["held"], "beats: %s's death plays its defeat to the end" % eid,
                  "clip %s, done %s" % (b["defeat"], b["held"]))
            check(b["stillHeld"], "beats: and %s stays down, on the same frame, through the dissolve" % eid)
            check(b["lightsout"] and b["opacity"] <= 0.05, "beats: then %s's lights go out and it dissolves" % eid,
                  "lightsout %s, opacity %.2f" % (b["lightsout"], b["opacity"]))
            print("  acted %s on %s" % (eid, encounter), flush=True)

        await browser.close()

    print("\n  %d animated enemies, %d quiet checks passed" % (len(section), quiet_pass[0]), flush=True)
    for line in passes:
        if not line.startswith(("built: ", "construct: ")):
            print("  PASS  " + line, flush=True)
    for line in fails:
        print("  FAIL  " + line, flush=True)
    for line in errors[:8]:
        print("  CONSOLE  " + line, flush=True)
    print(f"\nRESULT: {len(passes)} passed, {len(fails)} failed, {len(errors)} console errors", flush=True)
    return 1 if (fails or errors) else 0


if __name__ == "__main__":
    os.chdir(ROOT)                   # the build's source paths are relative to the repo
    sys.exit(asyncio.run(main()))
