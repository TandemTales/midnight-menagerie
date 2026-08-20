"""Per-pass GPU cost profiler for the Midnight Menagerie WebGL stage.

Uses EXT_disjoint_timer_query_webgl2 for real GPU time per render path.
gl.finish() is NOT honoured under ANGLE/D3D11 in Chrome (commands are queued in
the GPU process), so timing with performance.now() around finish() reports
~0.2 ms for a 45 ms frame. Timer queries are the only truthful measurement here.

    python tools/gpuprof.py --scene combat --w 1600 --h 900
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
  await new Promise(r=>setTimeout(r,150));

  const raf = () => new Promise(r=>requestAnimationFrame(r));

  async function gpuMs(fn, frames){
    frames = frames || 34;
    try { fn(); } catch(e){ return null; }
    const res = [], pend = [];
    for (let i=0;i<frames;i++){
      await raf();
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try { fn(); } catch(e){}
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pend.push(q);
      for (let j=pend.length-1;j>=0;j--){
        const p = pend[j];
        if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)){
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
            res.push(gl.getQueryParameter(p, gl.QUERY_RESULT)/1e6);
          gl.deleteQuery(p); pend.splice(j,1);
        }
      }
    }
    for (let k=0;k<12 && pend.length;k++){
      await raf();
      for (let j=pend.length-1;j>=0;j--){
        const p = pend[j];
        if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)){
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
            res.push(gl.getQueryParameter(p, gl.QUERY_RESULT)/1e6);
          gl.deleteQuery(p); pend.splice(j,1);
        }
      }
    }
    pend.forEach(p=>gl.deleteQuery(p));
    if (!res.length) return null;
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

  out.T_full = await gpuMs(full);
  sceneOnly();
  out.draws = {calls: stage.renderer.info.render.calls,
               tris: stage.renderer.info.render.triangles};
  out.T_sceneOnly_toScreen = await gpuMs(sceneOnly);

  b.enabled=false; g.enabled=true;  out.T_noBloom = await gpuMs(full);
  b.enabled=true;  g.enabled=false; out.T_noGrade = await gpuMs(full);
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

  MM.clock.start();
  return out;
})()
"""


async def run(a):
    from playwright.async_api import async_playwright
    url = BASE + (f"#scene={a.scene}" if a.scene else "")
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
        res = await page.evaluate(PROBE)
        res["rafFps_before_probe"] = fps0
        res["errors"] = errs[:5]
        res["scene"] = a.scene
        await browser.close()
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="combat")
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=float, default=5.0)
    asyncio.run(run(ap.parse_args()))
