"""Measure blocked main-thread time on scene ENTRY, not average fps.

An averaged fps hides an entry stall completely: the map screen sat at a steady
61 fps while spending ~4.7 s blocked getting there, and every averaged
measurement passed it.  This samples every rAF from page load and reports the
gaps, which is the only shape of measurement that can see a stall.

    python tools/entryprof.py --scene map --seed 42 --region foyer
    python tools/entryprof.py --scene combat --budget 900 --runs 3

Reports, per run: every frame gap over --gap ms, total blocked time (the sum of
the excess over one 16.7 ms frame for each such gap), and the worst gap.
Exit code 1 if the median run's blocked AFTER ENTRY exceeds --budget ms, so this
can be a gate.  Also prints the GL renderer: a software rasteriser invalidates
the numbers and has fooled a measurement here before.

MEASURED 2026-08-30, over 13 runs, and the headline is that THE STALL
REPRODUCES.  `--goto combat` reads 1150 / 1200 / 1233 / 1250 / 1283 / 1350 /
1917 / 1933 / 1933 / 2033 / 2050 / 2166 / 2217 ms against a 1200 ms budget --
median about 1350, and eleven of thirteen over.  HANDOFF carried "entry-stall
timings swing 2x run to run, do not chase them on this machine" for three
sessions on the strength of THREE samples, one of which happened to pass.  The
variance is real; the conclusion drawn from it was not.  Take more samples
before writing a number off as noise -- the same lesson the fps item taught the
same day, where 11 of 11 read 61.

WHERE the time goes is the more useful half, and it is not all "entry".  A
typical run: ~250 ms just before the scene enters, ~550 ms immediately after,
then evenly spaced TRIPLETS of ~100-130 ms at about t+1.5 s and again at
t+3.3 s, and sometimes a single large gap near t+6 s.  So combat keeps hitching
for seconds after it is nominally in, which "entry stall" undersells.  The
triplet shape -- three gaps roughly 117 ms apart, twice, about 1.8 s between
clusters -- is the strongest lead anyone has had on this and nobody has chased
it.

`--goto` already excludes page boot: `one()` filters frames to `>= __gotoAt`.
The ~620 ms boot gap you see under `--scene` (t+330 ms, and 619 / 623 / 629 ms
across scenes, the most repeatable number this tool produces) is therefore NOT
in a `--goto` number, and the two modes must never be compared with each other.
That mistake was made on 2026-08-30 -- a `--scene title` baseline subtracted
from a `--goto combat` run, "proving" ~700 ms of the stall was page boot.  It
was not.  It is written here because the instrument invites it.

The after-entry split below is a real distinction and a small one: only about
66 ms of a `--goto` run precedes the `scene:entered` mark, because the goto
filter has already done most of that work.  Gate on it anyway -- it is the
honest quantity -- but do not expect it to differ much from the gross.
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


def analyse(frames, gap_ms, entered_at=None):
    gaps = []
    for i in range(1, len(frames)):
        d = frames[i] - frames[i - 1]
        if d >= gap_ms:
            gaps.append((frames[i - 1], d))
    blocked = sum(d - FRAME for _, d in gaps)
    # Everything from the moment the scene said it was in. A gap that STRADDLES
    # entry counts: it is the transition itself and it is exactly what this
    # tool exists to see.
    after = (sum(d - FRAME for at, d in gaps if at + d >= entered_at)
             if entered_at is not None else blocked)
    return gaps, blocked, after


def entry_mark(marks, scene):
    """When the scene actually came in, or None if it never did."""
    for kind, at, who in marks or []:
        if kind == "entered" and (scene is None or who == scene):
            return at
    return None


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

    totals, worsts, grosses = [], [], []
    async with async_playwright() as p:
        for r in range(a.runs):
            frames, renderer, errors, marks, t0 = await one(
                p, url, a.hold, a.quiet, goto, a.boot, a.watch)
            entered = entry_mark(marks, goto[0] if goto else None)
            gaps, blocked, after = analyse(frames, a.gap, entered)
            totals.append(after)
            grosses.append(blocked)
            worsts.append(max((d for _, d in gaps), default=0.0))
            if r == 0:
                print(f"renderer: {renderer}")
                if "SwiftShader" in renderer or "Software" in renderer:
                    print("  !! SOFTWARE RASTERISER — these numbers mean nothing")
                if errors:
                    print(f"  !! {len(errors)} console error(s): {errors[0][:100]}")
            since = ("" if entered is None
                     else f", {after:.0f}ms of it AFTER entry")
            print(f"run {r + 1}: {len(frames)} frames over {a.hold:.1f}s, "
                  f"{len(gaps)} gaps >= {a.gap:.0f}ms, blocked {blocked:.0f}ms"
                  f"{since}, worst {worsts[-1]:.0f}ms")
            if not a.quiet:
                rows = [(at, f"{d:6.0f}ms blocked") for at, d in gaps]
                for kind, at, who in marks:
                    if kind == "class" and a.watch and a.watch not in who:
                        continue
                    rows.append((at, f"       <{kind} {who}>"))
                for at, txt in sorted(rows):
                    print(f"    t+{at - t0:7.0f}ms   {txt}")

    med = statistics.median(totals)
    gross = statistics.median(grosses)
    scope = "after entry" if goto else "total (no --goto, so nothing to enter)"
    print(f"\nRESULT: median blocked {med:.0f}ms {scope} over {a.runs} run(s) "
          f"(budget {a.budget:.0f}ms), worst single gap {max(worsts):.0f}ms")
    if goto:
        print(f"        median {gross:.0f}ms gross (all of it after --goto; "
              f"page boot is already excluded by the frame filter)")
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
