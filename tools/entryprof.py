"""Measure blocked main-thread time on scene ENTRY, not average fps.

An averaged fps hides an entry stall completely: the map screen sat at a steady
61 fps while spending ~4.7 s blocked getting there, and every averaged
measurement passed it.  This samples every rAF from page load and reports the
gaps, which is the only shape of measurement that can see a stall.

    python tools/entryprof.py --scene map --seed 42 --region foyer
    python tools/entryprof.py --scene combat --budget 900 --runs 3

Reports, per run: every frame gap over --gap ms, total blocked time (the sum of
the excess over one 16.7 ms frame for each such gap), and the worst gap.
Exit code 1 if the median run's blocked total exceeds --budget ms, so this can
be a gate.  Also prints the GL renderer: a software rasteriser invalidates the
numbers and has fooled a measurement here before.
"""
import asyncio, sys, os, json, argparse, statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_DEFAULT = "http://localhost:8777/game/index.html"
FRAME = 1000.0 / 60.0

# Installed before ANY page script runs, so the very first frames are sampled.
# A plain rAF chain is used rather than PerformanceObserver longtask because a
# longtask entry does not tell you whether a frame was actually missed, and the
# thing being measured is "the screen did not move".
SAMPLER = """
window.__frames = [];
window.__marks = [];
(function tick(t) { window.__frames.push(t); requestAnimationFrame(tick); })(performance.now());
"""


SETTLE = """(boot) => new Promise(res => {
  // Settled = the boot scene is FULLY in (SceneManager.busy back to false and
  // body.dataset.scene written, which `go()` does last) AND a second of frames
  // with no gap over 30 ms.  The frame test alone is not enough: a transition
  // veil animates at a clean 60 fps, so "smooth" was true while boot was still
  // running -- and `go()` silently drops a second call while it is busy
  // (`[scenes] busy, queued drop`), so the measurement quietly became "the
  // title screen" with no error anywhere.
  const start = performance.now();
  (function check() {
    const ready = document.body.dataset.scene === boot
               && window.MM.ctx.scenes.busy === false;
    const f = window.__frames, n = f.length;
    if (ready && n > 60) {
      let ok = true;
      for (let i = n - 60; i < n; i++) if (f[i] - f[i - 1] > 30) { ok = false; break; }
      if (ok) return res(performance.now());
    }
    if (performance.now() - start > 25000) return res(-1);
    requestAnimationFrame(check);
  })();
})"""

# Records every class change on a selector as a mark, so a stall can be pinned
# to the state that caused it instead of guessed at from its timestamp.
WATCH = """(sel) => {
  const seen = new WeakMap();
  const obs = new MutationObserver(rs => {
    for (const r of rs) {
      const el = r.target, now = el.className;
      const was = seen.get(el) || '';
      if (now === was) continue;
      seen.set(el, now);
      const a = new Set(was.split(" ").filter(Boolean));
      const b = new Set(now.split(" ").filter(Boolean));
      const add = [...b].filter(c => !a.has(c)).map(c => '+' + c);
      const rem = [...a].filter(c => !b.has(c)).map(c => '-' + c);
      if (add.length || rem.length)
        window.__marks.push(['class', performance.now(), [...add, ...rem].join(' ')]);
    }
  });
  // subtree:true so it catches the element even when it is built after arming.
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  window.__watchSel = sel;
}"""

ARM = """(scene) => {
  const bus = window.MM.bus;
  window.__marks = [];
  bus.on('scene:leaving', e => window.__marks.push(['leaving', performance.now(), e.to]));
  bus.on('scene:entered', e => window.__marks.push(['entered', performance.now(), e.name]));
  window.__gotoAt = null;
}"""


async def one(p, url, hold, quiet, goto=None, boot="title", watch=None):
    browser = await p.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
        "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required",
    ])
    ctx = await browser.new_context(viewport={"width": 1920, "height": 1080},
                                    reduced_motion="no-preference")
    page = await ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    await page.add_init_script(SAMPLER)
    await page.goto(url, wait_until="commit", timeout=45000)

    t0 = 0.0
    marks = []
    if goto:
        # Isolate ONE scene entry: boot the app somewhere else, wait for the
        # frame stream to go quiet, then walk in.  Measuring from page load
        # instead buries the scene's own cost inside boot, and boot on this
        # project is ~6 s -- which is how a 4 s stall stayed unattributed.
        await page.wait_for_function("() => window.MM && window.MM.bus", timeout=45000)
        settled = await page.evaluate(SETTLE, boot)
        if settled < 0:
            print("  !! boot never settled; numbers below are not attributable")
        await page.evaluate(ARM, goto[0])
        if watch:
            await page.evaluate(WATCH, watch)
        t0 = await page.evaluate("() => { window.__gotoAt = performance.now(); return window.__gotoAt; }")
        # fire-and-forget: `void` so Playwright cannot await go()'s promise and
        # collapse the very frames being measured (see CONTRACTS trap 3).
        await page.evaluate("([s, pr]) => { void window.MM.goto(s, pr); }", [goto[0], goto[1]])
    await page.wait_for_timeout(int(hold * 1000))
    if goto:
        got = await page.evaluate("(s) => window.__marks.some(m => m[0] === 'entered' && m[2] === s)", goto[0])
        if not got:
            print(f"  !! never entered '{goto[0]}' -- goto was dropped or is still running")
    frames = await page.evaluate("window.__frames")
    if goto:
        marks = await page.evaluate("window.__marks")
        frames = [f for f in frames if f >= t0]
    renderer = await page.evaluate("""() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const x = gl.getExtension('WEBGL_debug_renderer_info');
        return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown';
      } catch (e) { return 'unavailable'; }
    }""")
    await browser.close()
    return frames, renderer, errors, marks, t0


def analyse(frames, gap_ms):
    gaps = []
    for i in range(1, len(frames)):
        d = frames[i] - frames[i - 1]
        if d >= gap_ms:
            gaps.append((frames[i - 1], d))
    blocked = sum(d - FRAME for _, d in gaps)
    return gaps, blocked


async def main(a):
    from playwright.async_api import async_playwright
    frag = [f"{k}={v}" for k in ("scene", "seed", "companion", "kid", "region", "encounter")
            if (v := getattr(a, k, None))]
    goto = None
    if a.goto:
        params = {k: v for k in ("seed", "companion", "kid", "region", "encounter")
                  if (v := getattr(a, k, None))}
        if "seed" in params:
            params["seed"] = int(params["seed"])
        goto = (a.goto, params)
        url = a.base + "#scene=" + a.boot
        print(f"url: {url}   then goto({a.goto}, {params})")
    else:
        url = a.base + ("#" + "&".join(frag) if frag else "")
        print(f"url: {url}")

    totals, worsts = [], []
    async with async_playwright() as p:
        for r in range(a.runs):
            frames, renderer, errors, marks, t0 = await one(
                p, url, a.hold, a.quiet, goto, a.boot, a.watch)
            gaps, blocked = analyse(frames, a.gap)
            totals.append(blocked)
            worsts.append(max((d for _, d in gaps), default=0.0))
            if r == 0:
                print(f"renderer: {renderer}")
                if "SwiftShader" in renderer or "Software" in renderer:
                    print("  !! SOFTWARE RASTERISER — these numbers mean nothing")
                if errors:
                    print(f"  !! {len(errors)} console error(s): {errors[0][:100]}")
            print(f"run {r + 1}: {len(frames)} frames over {a.hold:.1f}s, "
                  f"{len(gaps)} gaps >= {a.gap:.0f}ms, blocked {blocked:.0f}ms, "
                  f"worst {worsts[-1]:.0f}ms")
            if not a.quiet:
                rows = [(at, f"{d:6.0f}ms blocked") for at, d in gaps]
                for kind, at, who in marks:
                    if kind == "class" and a.watch and a.watch not in who:
                        continue
                    rows.append((at, f"       <{kind} {who}>"))
                for at, txt in sorted(rows):
                    print(f"    t+{at - t0:7.0f}ms   {txt}")

    med = statistics.median(totals)
    print(f"\nRESULT: median blocked {med:.0f}ms over {a.runs} run(s) "
          f"(budget {a.budget:.0f}ms), worst single gap {max(worsts):.0f}ms")
    if med > a.budget:
        print("FAIL: entry stall over budget")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    for k in ("scene", "seed", "companion", "kid", "region", "encounter"):
        ap.add_argument("--" + k, default=None)
    ap.add_argument("--hold", type=float, default=12.0, help="seconds to sample")
    ap.add_argument("--gap", type=float, default=100.0, help="report gaps >= this many ms")
    ap.add_argument("--budget", type=float, default=1200.0, help="median blocked ms allowed")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--goto", default=None,
                    help="boot elsewhere, settle, then MM.goto(this) -- isolates ONE scene entry")
    ap.add_argument("--watch", default=None,
                    help="record class changes matching this substring as marks")
    ap.add_argument("--boot", default="title", help="scene to boot into for --goto mode")
    ap.add_argument("--base", default=BASE_DEFAULT, help="page URL to load (for A/B against a second server)")
    ap.add_argument("--quiet", action="store_true", help="totals only, no per-gap lines")
    sys.exit(asyncio.run(main(ap.parse_args())))
