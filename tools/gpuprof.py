"""Per-pass GPU cost profiler for the Midnight Menagerie WebGL stage.

Uses EXT_disjoint_timer_query_webgl2 for real GPU time per render path.
gl.finish() is NOT honoured under ANGLE/D3D11 in Chrome (commands are queued in
the GPU process), so timing with performance.now() around finish() reports
~0.2 ms for a 45 ms frame. Timer queries are the only truthful measurement here.

    python tools/gpuprof.py --scene combat --w 1600 --h 900
    python tools/gpuprof.py --scene combat --hash "encounter=gh-14&region=greenhouse"

A deep-linked combat plays in `region` (default the Foyer), NOT in the region
its encounter comes from, so a Greenhouse fight needs both. With --hash the
output also says which room played (`mood`).
"""
import asyncio, json, argparse

BASE = "http://localhost:8777/game/index.html"

PROBE = r"""
(async () => {
  const MM = window.MM; if (!MM) return {err:'no MM'};
  const ctx = MM.ctx, stage = ctx.stage, atmo = ctx.atmosphere;
  const bd = atmo.backdrop, pf = atmo.particles;
  const gl = stage.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return {err:'no timer ext'};

  MM.clock.stop();
  const probeT0 = +performance.now().toFixed(0);
  await new Promise(r=>setTimeout(r,150));

  const raf = () => new Promise(r=>requestAnimationFrame(r));

  /* WHY a timing came back null (round 39's graft): the merge's A/B got
     T_full None on 3 of 3 Bathhouse pages and nothing said whether the
     render threw, every frame was disjoint, or no query ever finished.
     `why` names it, per null timing, in call order. */
  const why = [];
  async function gpuMs(fn, frames, label){
    frames = frames || 34;
    const st = {label: label || null, threw: null, frames, avail: 0, disjoint: 0, left: 0,
                ctxLost: false, t0: +performance.now().toFixed(0)};
    try { fn(); } catch(e){ st.threw = String(e && e.message || e).slice(0, 200);
                            st.ctxLost = gl.isContextLost(); why.push(st); return null; }
    const res = [], pend = [];
    const poll = () => {
      for (let j=pend.length-1;j>=0;j--){
        const p = pend[j];
        if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)){
          st.avail++;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
            res.push(gl.getQueryParameter(p, gl.QUERY_RESULT)/1e6);
          else st.disjoint++;
          gl.deleteQuery(p); pend.splice(j,1);
        }
      }
    };
    for (let i=0;i<frames;i++){
      await raf();
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try { fn(); } catch(e){ if (!st.threw) st.threw = 'in loop: ' + String(e && e.message || e).slice(0, 200); }
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pend.push(q);
      poll();
    }
    for (let k=0;k<12 && pend.length;k++){ await raf(); poll(); }
    st.left = pend.length;
    pend.forEach(p=>gl.deleteQuery(p));
    if (!res.length) { st.ctxLost = gl.isContextLost();
                       st.ms = +(performance.now() - st.t0).toFixed(0); why.push(st); return null; }
    res.sort((a,b)=>a-b);
    return +res[Math.floor(res.length/2)].toFixed(3);   // median
  }

  const full      = () => stage.composer.render(0.016);
  const sceneOnly = () => stage.renderer.render(stage.scene, stage.camera);

  const out = {};
  out.size = {w:innerWidth, h:innerHeight, dpr:stage.renderer.getPixelRatio(),
              drawW:stage.renderer.domElement.width, drawH:stage.renderer.domElement.height};
  out.gl = (()=>{const d=gl.getExtension('WEBGL_debug_renderer_info');
             return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):'?';})();
  out.quality = stage.quality;
  out.tier = stage.tier || null;

  const b = stage.bloom, g = stage.grade;
  const bOn = b.enabled, gOn = g.enabled;

  /* --settle S: draw S seconds of frames before the first timer. Without it
     T_full is taken in the first ~2 s after the stage's warm-up and the
     probe's own first draw (which links whatever the fight's link gate was
     still holding back), and those frames run up to 10 ms slow on this
     machine's Intel/ANGLE while the driver settles the new programs: round
     28's graft found the Graveyard's "+9.9 ms" was mostly that window, with
     T_noBloom and T_noGrade, measured seconds later, back at the settled
     cost. 0 (the default) measures exactly as before. */
  if (SETTLE > 0) {
    const t0 = performance.now();
    while (performance.now() - t0 < SETTLE*1000) { await raf(); try { full(); } catch(e){} }
  }
  out.settle = SETTLE;
  const tFullAt = [+performance.now().toFixed(0)];
  out.T_full = await gpuMs(full, 34, 'T_full');
  tFullAt.push(+performance.now().toFixed(0));
  sceneOnly();
  out.draws = {calls: stage.renderer.info.render.calls,
               tris: stage.renderer.info.render.triangles};
  out.T_sceneOnly_toScreen = await gpuMs(sceneOnly);

  b.enabled=false; g.enabled=true;  out.T_noBloom = await gpuMs(full, 34, 'T_noBloom');
  b.enabled=true;  g.enabled=false; out.T_noGrade = await gpuMs(full, 34, 'T_noGrade');
  b.enabled=false; g.enabled=false; out.T_renderOutputOnly = await gpuMs(full);
  b.enabled=bOn;   g.enabled=gOn;

  // scene content bisection, post chain off (RenderPass+OutputPass only)
  b.enabled=false; g.enabled=false;
  const baseScene = await gpuMs(full);
  out.T_sceneBase_noPost = baseScene;
  const toggles = {
    props: bd.props, shadows: bd.shadows, shafts: bd.shafts, flames: bd.flames,
    wall: bd.wall, floor: bd.floor, ceiling: bd.ceiling, particles: pf.points,
  };
  out.piece_ms = {};
  for (const [k,obj] of Object.entries(toggles)){
    if (!obj) continue;
    const was = obj.visible; obj.visible = false;
    const t = await gpuMs(full, 24);
    out.piece_ms[k] = t==null?null:+(baseScene - t).toFixed(3);
    obj.visible = was;
  }
  if (bd.sides){
    const w = bd.sides.map(m=>m.visible); bd.sides.forEach(m=>m.visible=false);
    const t = await gpuMs(full, 24);
    out.piece_ms.sides = t==null?null:+(baseScene - t).toFixed(3);
    bd.sides.forEach((m,i)=>m.visible=w[i]);
  }
  if (bd.frames){
    const w = bd.frames.map(m=>m.visible); bd.frames.forEach(m=>m.visible=false);
    const t = await gpuMs(full, 24);
    out.piece_ms.frames = t==null?null:+(baseScene - t).toFixed(3);
    bd.frames.forEach((m,i)=>m.visible=w[i]);
  }
  { const w = bd.group.visible; bd.group.visible=false;
    const t = await gpuMs(full, 24);
    out.piece_ms.ALL_BACKDROP = t==null?null:+(baseScene - t).toFixed(3);
    bd.group.visible = w; }
  b.enabled=bOn; g.enabled=gOn;

  if (why.length) out.why = why;
  /* A GOOD LINK CAN BE AN EMPTY PROGRAM here (round 39: FXC aborted the
     velvet suite's wall while ANGLE reported LINK_STATUS true). Every
     program the page holds, with any info log it carries, read AFTER the
     frames above were drawn (ANGLE compiles some D3D executables at draw). */
  out.proglog = [];
  for (const pr of (stage.renderer.info.programs || [])) {
    const p = pr.program; if (!p) continue;
    let log = gl.getProgramInfoLog(p) || '';
    for (const s of (gl.getAttachedShaders(p) || [])) log += gl.getShaderInfoLog(s) || '';
    log = log.trim();
    if (log) out.proglog.push({name: pr.name, key: String(pr.cacheKey || '').slice(0, 160),
                               link: gl.getProgramParameter(p, gl.LINK_STATUS), log: log.slice(0, 400)});
  }
  out.programs = (stage.renderer.info.programs || []).length;
  /* ...and what the background link queue (Backdrop.precompileRooms) was
     linking, and when, against when the timers ran: a long link holds the
     GPU process, and a timer query issued behind it never comes back. */
  out.probeWin = [probeT0, +performance.now().toFixed(0)];
  out.tFullAt = tFullAt;
  out.preLog = (bd._preLog || []).map((r) => [r.mat + ' ' + Object.values(r.defines || {}).join(','), r.t0, r.t1 ?? null]);

  MM.clock.start();
  return out;
})()
"""


async def run(a):
    from playwright.async_api import async_playwright
    # --hash is appended to the fragment exactly as shot.py appends it, so a
    # profile can name the fight: `--hash "encounter=gh-14&region=greenhouse"`.
    # Without it the URL is byte-for-byte what it always was.
    frag = [f"scene={a.scene}"] if a.scene else []
    if a.hash:
        frag.append(a.hash.lstrip("#&"))
    url = BASE + ("#" + "&".join(frag) if frag else "")
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default",
            "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
            "--autoplay-policy=no-user-gesture-required",
        ])
        page = await (await browser.new_context(
            viewport={"width": a.w, "height": a.h}, device_scale_factor=1.0,
        )).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(url, wait_until="load", timeout=45000)
        await page.wait_for_timeout(int(a.wait * 1000))
        fps0 = await page.evaluate("""(async()=>{let n=0;const t0=performance.now();
          await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1500?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
          return Math.round(n/((performance.now()-t0)/1000))})()""")
        if a.settle > 0:
            # the stage's own warm-up first: the probe's first draw otherwise
            # links in-line whatever the warm-up has not, inside the timers
            try:
                await page.wait_for_function("window.__MM_WARMUP_MS !== undefined", timeout=600000)
            except Exception:
                pass
        res = await page.evaluate(PROBE.replace("SETTLE", repr(float(a.settle))))
        res["rafFps_before_probe"] = fps0
        res["errors"] = errs[:5]
        res["scene"] = a.scene
        if a.hash:
            # which room actually played, so a typo in the hash cannot pass
            # itself off as the Greenhouse
            res["hash"] = a.hash
            try:
                res["mood"] = await page.evaluate(
                    "window.MM && window.MM.ctx.atmosphere ? window.MM.ctx.atmosphere.mood : null")
            except Exception:
                res["mood"] = None
        await browser.close()
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="combat")
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=float, default=5.0)
    ap.add_argument("--settle", type=float, default=0.0,
                    help="seconds of frames drawn after the warm-up and before the first "
                         "timer (0: as before). See SETTLE in PROBE.")
    ap.add_argument("--hash", default="",
                    help="more of the URL fragment, appended after scene= the way "
                         "shot.py --hash is, e.g. 'encounter=gh-14&region=greenhouse'")
    # A profile is only worth reading from a QUIET GPU, and with builders
    # capturing beside it no run ever was. The slot makes it quiet by
    # construction (tools/gpu_slot.py).
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from gpu_slot import gpu_slot
    with gpu_slot("gpuprof.py"):
        asyncio.run(run(ap.parse_args()))
