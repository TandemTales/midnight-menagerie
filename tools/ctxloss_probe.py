"""Watch a fight for a lost WebGL context, and log what separates the causes.

Written 2026-10-02 for the "context lost 17-50 s after warm-up" bug (HANDOFF,
2026-09-23). That day the loss hit ~5 of 6 fights on this machine; on
2026-10-02 it hit 0 of 34 fights (30 of this probe, 4 of tools/coldstart.py
-- the 09-23 instrument), on the current build AND on aaafca5 (the build that
lost it on 09-23), in four wings, at medium and auto tier, deep-linked and
through the title, held up to 7 minutes, alone and beside up to two other
fights and 12 CPU burners (Available MBytes down to 10, a 51 s rAF gap). So the
loss belongs to a state of the machine, not to the build, and this is the
instrument to run the next time it shows up.

    python tools/ctxloss_probe.py --port 9071 --enc foyer-14 --runs 3 --hold 150 --out DIR
        [--flow deep|title] [--tier medium|auto] [--load N] [--burn N]

Run it with DEBUG=pw:browser and stderr to a file: Chromium's own log lines
(--enable-logging=stderr) -- a GPU watchdog kill, a D3D11 device-removed
reason -- arrive there.

Per run (fresh Chromium, fresh profile, the GPU slot held):
 - in the page, every second: warmStage, lost, renderer.info (textures,
   geometries, programs), stats, JS heap, rAF frames in that second and the
   longest rAF gap, Backdrop._pre progress;
 - every compileAsync / compile on the stage's renderer, with its defines and
   start/end -- a rAF gap that lines up with a link is the GPU thread blocked;
 - webglcontextlost / restored / creationerror, timestamped;
 - over CDP: the GPU process pid every 2 s (a new pid = the GPU process died:
   a watchdog kill or a crash, not a D3D device loss) and GPU.* histograms;
 - typeperf: the GPU process's shared/dedicated GPU memory, its 3D-engine use,
   and system Available MBytes / commit.
--tier pins it with setTier(..,{persist:false}) + tierForced + _scaleAdjust=1
(which also skips _calibrate); 'auto' leaves the game's own choice.
--load N runs N more fights in their own browsers beside it, WITHOUT a slot
(the "machine busy with other captures" condition); --burn N spins N CPU
cores. Both are stopped when the run ends.
`--summary DIR...` prints one line per saved run.
"""
import argparse, asyncio, csv, glob, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ARGS = ["--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
        "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
        "--autoplay-policy=no-user-gesture-required",
        "--enable-logging=stderr", "--v=0"]

INIT = r"""
(() => {
  const P = window.__probe = { samples: [], events: [], links: [], t0: performance.now() };
  const ev = (k, x) => P.events.push(Object.assign({ k, t: Math.round(performance.now()) }, x || {}));
  addEventListener('webglcontextlost', (e) => ev('lost', { msg: e.statusMessage || '' }), true);
  addEventListener('webglcontextrestored', (e) => ev('restored'), true);
  addEventListener('webglcontextcreationerror', (e) => ev('creationerror', { msg: e.statusMessage || '' }), true);
  let frames = 0, last = performance.now(), maxGap = 0;
  const raf = () => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; frames++; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  let patched = false, pinned = false, warmSeen = null;
  setInterval(() => {
    const s = window.MM && window.MM.ctx && window.MM.ctx.stage;
    if (s && !pinned && window.__PIN_TIER) {
      try { s.setTier(window.__PIN_TIER, { persist: false }); s.tierForced = true; s._scaleAdjust = 1; s.resize(); pinned = true; ev('pinned', { tier: s.tier }); } catch (e) { ev('pinerr', { e: String(e) }); }
    }
    if (s && !patched) {
      patched = true;
      const R = s.renderer;
      const descr = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material;
        return { n: o.name || o.type, d: m && m.defines ? JSON.stringify(m.defines).slice(0, 120) : '' }; };
      const ca = R.compileAsync.bind(R);
      R.compileAsync = function (o, c, sc) {
        const rec = Object.assign({ f: 'async', t0: Math.round(performance.now()), p0: R.info.programs.length }, descr(o));
        P.links.push(rec);
        const pr = ca(o, c, sc);
        Promise.resolve(pr).then(() => { rec.t1 = Math.round(performance.now()); rec.p1 = R.info.programs.length; },
                                 () => { rec.t1 = Math.round(performance.now()); rec.err = 1; });
        return pr;
      };
      const cs = R.compile.bind(R);
      R.compile = function (o, c, sc) {
        const p0 = R.info.programs.length; const t0 = performance.now();
        const r = cs(o, c, sc);
        const p1 = R.info.programs.length;
        if (p1 !== p0) P.links.push(Object.assign({ f: 'sync', t0: Math.round(t0), dt: Math.round(performance.now() - t0), p0, p1, ws: s.warmStage }, descr(o)));
        return r;
      };
    }
    let row = { t: Math.round(performance.now()), frames, maxGap: Math.round(maxGap) };
    frames = 0; maxGap = 0;
    if (s) {
      const R = s.renderer, i = R.info;
      Object.assign(row, { ws: s.warmStage, lost: !!s._lost, lc: s.lostCount || 0, linking: !!s._linking,
        tex: i.memory.textures, geo: i.memory.geometries, prog: i.programs ? i.programs.length : null,
        calls: i.render.calls, tris: i.render.triangles, dpr: s.stats.dpr, rs: s.stats.renderScale, tier: s.stats.tier,
        w: R.domElement.width, h: R.domElement.height });
      if (s.warmStage !== warmSeen) { warmSeen = s.warmStage; ev('warm', { ws: warmSeen }); }
      const bd = window.MM.ctx.atmosphere && window.MM.ctx.atmosphere.backdrop;
      if (bd) row.pre = bd._pre ? bd._pre.length : null;
      try { row.glLost = R.getContext().isContextLost(); } catch (e) {}
    }
    if (performance.memory) row.heap = Math.round(performance.memory.usedJSHeapSize / 1e6);
    row.scene = window.MM && window.MM.state ? window.MM.state().scene : null;
    row.imgs = document.images.length;
    P.samples.push(row);
  }, 1000);
})();
"""


def typeperf_start(gpu_pid, path):
    ctrs = [rf"\GPU Process Memory(pid_{gpu_pid}_*)\Shared Usage",
            rf"\GPU Process Memory(pid_{gpu_pid}_*)\Dedicated Usage",
            rf"\GPU Process Memory(pid_{gpu_pid}_*)\Total Committed",
            rf"\GPU Engine(pid_{gpu_pid}_*engtype_3D)\Utilization Percentage",
            r"\Memory\Available MBytes", r"\Memory\% Committed Bytes In Use",
            # a laptop that has captured all day may be throttling: the zone's
            # temperature and how fast the CPU is running against its rating
            r"\Thermal Zone Information(*)\Temperature",
            r"\Processor Information(_Total)\% Processor Performance"]
    return subprocess.Popen(["typeperf", *ctrs, "-si", "1", "-o", path, "-f", "CSV", "-y"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


LOAD_ARGS = ARGS[:-2]


async def load_one(a, i):
    from playwright.async_api import async_playwright
    url = f"http://localhost:{a.port}/game/index.html#scene=combat&encounter={a.enc}&seed={11 + i}&companion=boggle&kid=eli"
    async with async_playwright() as p:
        b = await p.chromium.launch(args=LOAD_ARGS)
        ctx = await b.new_context(viewport={"width": 1600, "height": 900}, device_scale_factor=1.0)
        await ctx.add_init_script("addEventListener('webglcontextlost', () => { window.__lost = (window.__lost||0) + 1; }, true);")
        page = await ctx.new_page()
        await page.goto(url, wait_until="load", timeout=60000)
        print(f"load {i} up {time.strftime('%H:%M:%S')}", flush=True)
        t_end = time.time() + a.hold
        while time.time() < t_end and not (a.stop and os.path.exists(a.stop)):
            await asyncio.sleep(2)
        try:
            n = await page.evaluate("window.__lost || 0")
            ws = await page.evaluate("window.MM && window.MM.ctx.stage.warmStage")
        except Exception as e:
            n, ws = "?", str(e)[:60]
        print(f"load {i} end {time.strftime('%H:%M:%S')} lost={n} warm={ws}", flush=True)
        await b.close()



async def one(a, run_i, tag):
    from playwright.async_api import async_playwright
    frag = f"scene=combat&encounter={a.enc}&seed=7&companion=bones&kid=maya"
    url = f"http://localhost:{a.port}/game/index.html" + ("" if a.flow == "title" else f"#{frag}")
    rec = {"run": run_i, "tag": tag, "enc": a.enc, "port": a.port, "mode": a.mode, "headful": a.headful,
           "wall0": time.time()}
    cons = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=ARGS, headless=not a.headful)
        bcdp = await browser.new_browser_cdp_session()
        ctx = await browser.new_context(viewport={"width": a.w, "height": a.h},
                                        device_scale_factor=1.0, reduced_motion="no-preference")
        pin = "" if a.tier == "auto" else f"window.__PIN_TIER = {json.dumps(a.tier)};"
        mode = f"window.__MM_PROBE_MODE = {json.dumps(a.mode)};" if a.mode else ""
        await ctx.add_init_script(pin + mode)
        await ctx.add_init_script(INIT)
        page = await ctx.new_page()
        t_launch = time.time()
        page.on("console", lambda m: cons.append([round(time.time() - t_launch, 2), m.type, m.text[:300]]))
        page.on("pageerror", lambda e: cons.append([round(time.time() - t_launch, 2), "pageerror", str(e)[:300]]))
        page.on("crash", lambda: cons.append([round(time.time() - t_launch, 2), "CRASH", ""]))

        async def gpu_pids():
            try:
                info = await bcdp.send("SystemInfo.getProcessInfo")
                return [pi["id"] for pi in info["processInfo"] if pi["type"] == "GPU"]
            except Exception as e:
                return ["err:" + str(e)[:60]]
        g0 = await gpu_pids()
        rec["gpuPid0"] = g0
        tp = None
        if g0 and isinstance(g0[0], int):
            tp = typeperf_start(g0[0], os.path.join(a.out, f"{tag}-perf.csv"))
        try:
            h0 = await bcdp.send("Browser.getHistograms", {"query": "GPU", "delta": False})
        except Exception:
            h0 = None
        await page.goto(url, wait_until="load", timeout=60000)
        if a.flow == "title":
            try:
                await page.wait_for_selector("[data-action=new]", timeout=60000)
                await page.click("[data-action=new]")
                await page.wait_for_selector(".tut-hot", state="visible", timeout=30000)
                await page.wait_for_timeout(300)
                hot = page.locator(".tut-hot").first
                await hot.click()
                await page.wait_for_timeout(250)
                await hot.click()
                t_e = time.time() + 60
                while time.time() < t_e:
                    if await page.evaluate("() => window.MM.state().scene") == "combat":
                        break
                    await page.keyboard.press("Enter")
                    await page.wait_for_timeout(350)
                rec["combatWall"] = round(time.time() - t_launch, 1)
            except Exception as e:
                rec["flowErr"] = str(e)[:200]
        gp = []
        t_end = None
        deadline = time.time() + a.timeout
        while True:
            await asyncio.sleep(2)
            pids = await gpu_pids()
            gp.append([round(time.time() - t_launch, 1), pids])
            try:
                ws = await page.evaluate("(() => { const s = window.MM && window.MM.ctx.stage; return s ? s.warmStage : null; })()")
            except Exception as e:
                ws = "evalerr"
            if ws == "done" and t_end is None:
                t_end = time.time() + a.hold
                rec["doneWall"] = round(time.time() - t_launch, 1)
            if t_end and time.time() > t_end:
                break
            if not t_end and time.time() > deadline:
                rec["timeout"] = True
                break
        try:
            P = await page.evaluate("window.__probe")
        except Exception as e:
            P = {"err": str(e)}
        try:
            h1 = await bcdp.send("Browser.getHistograms", {"query": "GPU", "delta": False})
        except Exception:
            h1 = None
        rec["gpuPids"] = gp
        rec["probe"] = P
        rec["console"] = cons
        rec["hist0"] = h0
        rec["hist1"] = h1
        if tp:
            tp.terminate()
        await browser.close()
    return rec


def _num(x):
    try:
        return float(x)
    except Exception:
        return None


def table(dirs):
    for d in dirs:
        for fn in sorted(glob.glob(os.path.join(d, "*.json"))):
            r = json.load(open(fn))
            P = r.get("probe") or {}
            ev = P.get("events", [])
            warm = {e["ws"]: e["t"] for e in ev if e["k"] == "warm"}
            done = warm.get("done")
            loss = [round((e["t"] - done) / 1000, 1) if done else e["t"] for e in ev if e["k"] == "lost"]
            rest = [round((e["t"] - done) / 1000, 1) if done else e["t"] for e in ev if e["k"] == "restored"]
            S = [s for s in P.get("samples", []) if done and s["t"] >= done]
            gap = max([s.get("maxGap", 0) for s in S] or [0])
            zero = sum(1 for s in S if s.get("frames") == 0)
            pre = max([s.get("pre") or 0 for s in S] or [0])
            prog = max([s.get("prog") or 0 for s in S] or [0])
            heap = max([s.get("heap") or 0 for s in S] or [0])
            pids = sorted(set(str(x) for _, ps in r.get("gpuPids", []) for x in ps))
            perf = fn[:-5] + "-perf.csv"
            sh = av = tmax = None
            if os.path.exists(perf):
                rows = list(csv.reader(open(perf)))[1:]
                rows = [x for x in rows if len(x) >= 7]
                shv = [_num(x[1]) for x in rows if _num(x[1]) is not None]
                avv = [_num(x[5]) for x in rows if _num(x[5]) is not None]
                sh = round(max(shv) / 1e6) if shv else None
                av = min(avv) if avv else None
                tz = [_num(x[7]) for x in rows if len(x) > 7 and _num(x[7]) is not None]
                tmax = round(max(tz) - 273.15, 1) if tz else None
            cons = [c for c in r.get("console", []) if "lost" in c[2].lower() or "Context" in c[2]]
            print(f"{os.path.basename(fn)[:44]:44} done {done and round(done/1000,1)}s lost@{loss} rest@{rest} "
                  f"gpuPids {len(pids)} gap {gap}ms zeroFrameSecs {zero} pre {pre} prog {prog} heap {heap}MB "
                  f"gpuShared {sh}MB minAvail {av}MB maxTemp {tmax}C")
            for c in cons[:4]:
                print("     ", c)


def summarize(rec):
    P = rec.get("probe") or {}
    ev = P.get("events", [])
    warm = {e["ws"]: e["t"] for e in ev if e["k"] == "warm"}
    done = warm.get("done")
    losses = [e["t"] for e in ev if e["k"] == "lost"]
    rest = [e["t"] for e in ev if e["k"] == "restored"]
    pids = set()
    for _, ps in rec.get("gpuPids", []):
        for x in ps: pids.add(x)
    s = (f"{rec['tag']}: done@{done} ms  losses(after done, s) "
         f"{[round((l - done) / 1000, 1) if done else l for l in losses]}  restored {len(rest)}  gpu pids {sorted(map(str, pids))}")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--enc", default="foyer-14")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--hold", type=float, default=120)
    ap.add_argument("--timeout", type=float, default=300)
    ap.add_argument("--tier", default="medium")
    ap.add_argument("--mode", default=None)
    ap.add_argument("--headful", action="store_true")
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--label", default="")
    ap.add_argument("--flow", default="deep", choices=["deep", "title"])
    ap.add_argument("--load", type=int, default=0)
    ap.add_argument("--load-enc", default="bh-1")
    ap.add_argument("--burn", type=int, default=0)
    ap.add_argument("--load-worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--stop", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--summary", nargs="+", default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    if a.summary:
        return table(a.summary)
    if a.load_worker:
        async def _all():
            await asyncio.gather(*[load_one(a, i) for i in range(a.load)])
        return asyncio.run(_all())
    if not a.out:
        ap.error("--out is required")
    os.makedirs(a.out, exist_ok=True)
    from gpu_slot import gpu_slot
    for r in range(a.runs):
        tag = f"{a.label or a.enc}-{a.flow}-{'hf' if a.headful else 'hl'}-{a.mode or 'base'}-L{a.load}B{a.burn}-r{r}-{int(time.time())}"
        with gpu_slot(f"ctxloss probe {tag}"):
            lp = None
            if a.load:
                lp = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--load-worker", "--port", str(a.port),
                                       "--load", str(a.load), "--hold", str(a.hold + 400), "--enc", a.load_enc,
                                       "--stop", os.path.join(a.out, tag + ".stop"), "--out", a.out],
                                      stdout=open(os.path.join(a.out, tag + "-load.txt"), "w"), stderr=subprocess.STDOUT)
            burners = [subprocess.Popen([sys.executable, "-c",
                        "import time; t=time.time()+%d\nwhile time.time()<t: pass" % (a.hold + 400)])
                       for _ in range(a.burn)]
            rec = asyncio.run(one(a, r, tag))
            rec["load"] = a.load
            rec["burn"] = a.burn
            for b in burners:
                b.kill(); b.wait()
            if lp:
                open(os.path.join(a.out, tag + ".stop"), "w").close()
                try:
                    lp.wait(timeout=60)
                except Exception:
                    lp.kill(); lp.wait()
        with open(os.path.join(a.out, tag + ".json"), "w", encoding="utf-8") as f:
            json.dump(rec, f)
        print(summarize(rec), flush=True)


if __name__ == "__main__":
    main()
