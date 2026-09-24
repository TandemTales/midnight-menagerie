"""Measure the COLD START: what a player sees before the WebGL stage has warmed.

Every other instrument in this project (shot.py, gpuprof.py, variant_sheet.py)
waits the warm-up out before it looks, so none of them ever saw the first
minute of the game -- which is where Josh saw "no background in the first two
fight rooms". This one looks at exactly that minute.

    python tools/coldstart.py boot  --target base=8982 --target mine=8981 --runs 3
    python tools/coldstart.py fight --target base=8982 --target mine=8981 --runs 3 --out DIR

Each run is a fresh Chromium with a fresh profile (no GPU program cache), and
the targets are INTERLEAVED run by run (base, mine, base, mine...) so a GPU
another agent is hammering slows both sides of the comparison alike. Each run
holds the machine's GPU slot (tools/gpu_slot.py) for itself only.

boot   load the title and record, from navigation start: when stage.warmStage
       became 'post' (the room is first drawn) and 'done', and
       window.__MM_WARMUP_MS. Where the stage keeps a per-mesh `warmLog`
       (core/renderer.js), it is written out too, so phase A's time can be
       read per mesh and per target.

fight  boot, then go into the FIRST FIGHT of a new run as fast as the UI allows
       (title: New Expedition -> the opening: pick the first Kid, commit, turn
       every page -> the coached Foyer fight), and screenshot it --at seconds
       after it opens (default 5,15,30). For each shot: the warm stage, whether
       the combat scene's CSS stand-in room was up, and the luminance mean/std
       of the band between the enemies where the room shows (shot.py's `band`).
       A flat plum plane reads std ~2-4 there; a room reads far more.

--target NAME=PORT[:MODE]   MODE sets window.__MM_WARM_MODE before boot (a
                            renderer experiment switch, when the build has one).
"""
import argparse
import asyncio
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ARGS = ["--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
        "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
        "--autoplay-policy=no-user-gesture-required"]

# Polls the stage from inside the page, so a transition is timed to ~20 ms
# from navigation start whatever Python is doing.
POLL = r"""
(() => {
  const T = window.__cs = {};
  let last = performance.now();
  T.maxGap = 0; T.maxGapAt = 0;
  const iv = setInterval(() => {
    const now = performance.now();
    if (now - last > T.maxGap) { T.maxGap = now - last; T.maxGapAt = last; }
    last = now;
    const s = window.MM && window.MM.ctx && window.MM.ctx.stage;
    if (!s) return;
    const w = s.warmStage;
    if (w && !(w in T)) T[w] = performance.now();
    if (w === 'done') clearInterval(iv);
  }, 20);
})();
"""

STAGE = """() => { const s = window.MM && window.MM.ctx && window.MM.ctx.stage;
  return s ? { stage: s.warmStage || null, pending: !!(s.roomPending && s.roomPending()) } : null; }"""

SCENE = "() => (window.MM && window.MM.state) ? window.MM.state().scene : null"

COLD = """() => { const c = document.querySelector('.cb-coldroom');
  if (!c) return 'none';
  return (+getComputedStyle(c).opacity).toFixed(2); }"""


def crop_stats(path, box):
    from PIL import Image, ImageStat
    im = Image.open(path).convert("L")
    W, H = im.size
    st = ImageStat.Stat(im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H))))
    return round(st.mean[0], 1), round(st.stddev[0], 1)


def band(path):
    return crop_stats(path, (.16, .10, .84, .52))


# THE DISCRIMINATOR. shot.py's band barely moves here (27.0/32.4 over a flat
# plane against 27.7/32.4 over a room: the board's own creature, plate and
# brackets are most of its variance). This is bare wall on every Scuffle --
# above the Kid, left of the enemy's brackets, under the HUD -- and it reads
# std ~3.3 over the plum plane, ~6.9 over the stand-in room.
WALL = (.20, .08, .44, .34)


async def one(target, a, run_i):
    from playwright.async_api import async_playwright
    name, port, mode = target
    url = f"http://localhost:{port}/game/index.html"
    rec = {"target": name, "port": port, "mode": mode, "run": run_i}
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=ARGS)
        ctx = await browser.new_context(viewport={"width": a.w, "height": a.h},
                                        device_scale_factor=1.0, reduced_motion="no-preference")
        if mode:
            await ctx.add_init_script(f"window.__MM_WARM_MODE = {json.dumps(mode)};")
        await ctx.add_init_script(POLL)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(url, wait_until="load", timeout=60000)

        if a.cmd == "fight":
            try:
                await page.wait_for_selector("[data-action=new]", timeout=60000)
                await page.click("[data-action=new]")
                await page.wait_for_selector(".tut-hot", state="visible", timeout=30000)
                await page.wait_for_timeout(300)
                hot = page.locator(".tut-hot").first
                await hot.click()
                await page.wait_for_timeout(250)
                await hot.click()
                t_end = time.time() + 60
                while time.time() < t_end:
                    if await page.evaluate(SCENE) == "combat":
                        break
                    await page.keyboard.press("Enter")
                    await page.wait_for_timeout(350)
                await page.wait_for_function(
                    "() => window.MM.state().scene === 'combat' && !(window.MM.ctx.scenes && window.MM.ctx.scenes.busy)",
                    timeout=30000, polling=50)
                t_open = await page.evaluate("performance.now()")
                rec["fightOpenMs"] = round(t_open)
                rec["stageAtOpen"] = await page.evaluate(STAGE)
                rec["shots"] = []
                for at in a.at:
                    now = await page.evaluate("performance.now()")
                    wait = t_open + at * 1000 - now
                    if wait > 0:
                        await page.wait_for_timeout(int(wait))
                    st = await page.evaluate(STAGE)
                    cold = await page.evaluate(COLD)
                    path = os.path.join(a.out, f"{name}-r{run_i}-{int(at)}s.png")
                    await page.screenshot(path=path, animations="allow")
                    mu, sd = band(path)
                    wm, ws = crop_stats(path, WALL)
                    rec["shots"].append({"at": at, "stage": st, "cold": cold,
                                         "bandMean": mu, "bandStd": sd,
                                         "wallMean": wm, "wallStd": ws,
                                         "png": os.path.basename(path)})
            except Exception as e:
                rec["error"] = str(e)[:300]

        try:
            await page.wait_for_function(
                "() => window.MM && window.MM.ctx.stage && window.MM.ctx.stage.warmStage === 'done'"
                " && window.__MM_WARMUP_MS != null", timeout=int(a.timeout * 1000), polling=100)
        except Exception:
            rec["timeout"] = True
        cs = await page.evaluate("window.__cs || {}")
        rec["postMs"] = round(cs["post"]) if "post" in cs else None
        rec["doneMs"] = round(cs["done"]) if "done" in cs else None
        rec["warmupMs"] = await page.evaluate("window.__MM_WARMUP_MS ?? null")
        # the longest the main thread went without running a 20 ms timer, up
        # to 'done': a frozen title screen (a program linked synchronously)
        rec["maxStallMs"] = round(cs.get("maxGap", 0))
        rec["maxStallAtMs"] = round(cs.get("maxGapAt", 0))
        wt = await page.evaluate(
            "(() => { const s = window.MM && window.MM.ctx.stage; return s && s.warmT ? s.warmT : null; })()")
        if wt:
            rec["inPage"] = {k: round(v) for k, v in wt.items()}
        rec["warmStartMs"] = await page.evaluate(
            "(() => { const s = window.MM && window.MM.ctx.stage; return s && s.warmT ? Math.round(s.warmT.materials) : null; })()")
        log = await page.evaluate(
            "(() => { const s = window.MM && window.MM.ctx.stage; return s && s.warmLog ? s.warmLog : null; })()")
        if log is not None:
            rec["warmLog"] = log
        rec["gl"] = await page.evaluate(
            "(() => { try { const g = window.MM.ctx.stage.renderer.getContext();"
            " return !!g.getExtension('KHR_parallel_shader_compile'); } catch (e) { return null; } })()")
        rec["errors"] = errs[:5]
        await browser.close()
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["boot", "fight"])
    ap.add_argument("--target", action="append", required=True,
                    help="NAME=PORT[:MODE], repeatable; runs interleave in this order")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--at", default="5,15,30")
    ap.add_argument("--timeout", type=float, default=240)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(HERE), "shots", "coldstart"))
    a = ap.parse_args()
    a.at = [float(x) for x in a.at.split(",") if x.strip()]
    os.makedirs(a.out, exist_ok=True)
    targets = []
    for t in a.target:
        name, _, rest = t.partition("=")
        port, _, mode = rest.partition(":")
        targets.append((name, int(port), mode or None))

    from gpu_slot import gpu_slot
    jl = os.path.join(a.out, f"{a.cmd}.jsonl")
    for r in range(a.runs):
        for t in targets:
            with gpu_slot(f"coldstart.py {a.cmd} {t[0]} r{r}"):
                rec = asyncio.run(one(t, a, r))
            with open(jl, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
            line = (f"{rec['target']:>8} r{r}  post {rec.get('postMs')} ms  done {rec.get('doneMs')} ms"
                    f"  warmup {rec.get('warmupMs')} ms  stall {rec.get('maxStallMs')} ms @{rec.get('maxStallAtMs')}")
            if a.cmd == "fight":
                line += f"  open {rec.get('fightOpenMs')} ms"
                for s in rec.get("shots", []):
                    line += (f" | +{s['at']:g}s {s['stage'] and s['stage']['stage']}"
                             f" cold={s['cold']} wall {s['wallMean']}/{s['wallStd']}")
                if rec.get("error"):
                    line += "  ERROR " + rec["error"]
            print(line, flush=True)


if __name__ == "__main__":
    main()
