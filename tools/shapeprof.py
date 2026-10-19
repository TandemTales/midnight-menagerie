"""What each prop group costs, measured INSIDE one page.

    python tools/on_port.py PORT tools/shapeprof.py --hash "encounter=pk-1&region=pumpkin-grounds"

gpuprof.py's piece_ms says what the whole prop layer costs; this says which
of the props it is. One page, post chain off (RenderPass + OutputPass only,
as gpuprof's piece bisection), and for each prop SHAPE in the room -- and
for the N biggest quads on screen one at a time (`--each N`) -- its instances are
collapsed to zero size, the frame timed, and the instances put back. Since
the A and the B are the same page a frame apart, the machine's own load
(a game, an editor holding the GPU) falls out of the difference much better
than it does between two pages; each timing is the 25th percentile of its
frames, not the median, so a contended frame does not count against it.

Also reported per group: how many instances and their summed quad area on
screen (in drawn pixels) -- a prop quad costs its whole area whatever is
drawn in it, so a big near piece is an expensive one even if it is mostly
air.
"""
import asyncio, json, argparse, os, sys

BASE = "http://localhost:8777/game/index.html"

PROBE = r"""
(async () => {
  const MM = window.MM; if (!MM) return {err:'no MM'};
  const ctx = MM.ctx, stage = ctx.stage, atmo = ctx.atmosphere;
  const bd = atmo.backdrop;
  const gl = stage.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return {err:'no timer ext'};
  MM.clock.stop();
  await new Promise(r=>setTimeout(r,150));
  const raf = () => new Promise(r=>requestAnimationFrame(r));
  async function gpuMs(fn, frames){
    frames = frames || FRAMES;
    try { fn(); } catch(e){ return null; }
    const res = [], pend = [];
    const poll = () => { for (let j=pend.length-1;j>=0;j--){ const p=pend[j];
        if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)){
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res.push(gl.getQueryParameter(p, gl.QUERY_RESULT)/1e6);
          gl.deleteQuery(p); pend.splice(j,1); } } };
    for (let i=0;i<frames;i++){
      await raf();
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      try { fn(); } catch(e){}
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pend.push(q); poll();
    }
    for (let k=0;k<12 && pend.length;k++){ await raf(); poll(); }
    pend.forEach(p=>gl.deleteQuery(p));
    if (!res.length) return null;
    res.sort((a,b)=>a-b);
    return +res[Math.floor(res.length*0.25)].toFixed(3);
  }
  const full = () => stage.composer.render(0.016);
  const b = stage.bloom, g = stage.grade;
  const bOn = b.enabled, gOn = g.enabled;
  const t0 = performance.now();
  while (performance.now() - t0 < SETTLE*1000) { await raf(); try { full(); } catch(e){} }
  const out = {drawW: stage.renderer.domElement.width, drawH: stage.renderer.domElement.height,
               mood: atmo.mood, tier: stage.tier || null};
  out.T_full = await gpuMs(full);
  b.enabled = false; g.enabled = false;
  const placed = bd.placed || [];
  const sc = bd._propScale, arr = sc.array;
  const saved = Float32Array.from(arr);
  /* each instance's quad on screen, in drawn pixels (its four corners
     projected; the quad stands upright at its offset) */
  const cam = stage.camera, W = out.drawW, H = out.drawH;
  const off = bd._propOffset.array;
  const V = new cam.position.constructor();
  function area(i){
    const x = off[i*3], y = off[i*3+1], z = off[i*3+2];
    const w = arr[i*2], h = arr[i*2+1];
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9, behind=false;
    for (const [dx,dy] of [[-0.5,0],[0.5,0],[-0.5,1],[0.5,1]]){
      V.set(x + dx*w, y + dy*h, z);
      V.applyMatrix4(bd.group.matrixWorld).project(cam);
      if (V.z > 1) behind = true;
      x0=Math.min(x0,V.x); x1=Math.max(x1,V.x); y0=Math.min(y0,V.y); y1=Math.max(y1,V.y);
    }
    if (behind) return 0;
    const cx0=Math.max(-1,x0), cx1=Math.min(1,x1), cy0=Math.max(-1,y0), cy1=Math.min(1,y1);
    if (cx1<=cx0 || cy1<=cy0) return 0;
    return (cx1-cx0)*0.5*W*(cy1-cy0)*0.5*H;
  }
  const groups = {};
  placed.forEach((p, i) => {
    const k = String(p.shape);
    (groups[k] = groups[k] || []).push(i);
  });
  const hide = (idx) => { for (const i of idx){ arr[i*2]=0; arr[i*2+1]=0; } sc.needsUpdate = true; };
  const show = () => { arr.set(saved); sc.needsUpdate = true; };
  out.base_noPost = await gpuMs(full);
  out.props_ms = null;
  { const was = bd.props.visible; bd.props.visible = false;
    const t = await gpuMs(full); bd.props.visible = was;
    out.props_ms = t==null?null:+(out.base_noPost - t).toFixed(3); }
  for (const [nm, obj] of Object.entries({wall: bd.wall, floor: bd.floor, shadows: bd.shadows, ceiling: bd.ceiling})){
    if (!obj) continue;
    const was = obj.visible; obj.visible = false;
    const t = await gpuMs(full); obj.visible = was;
    out[nm + '_ms'] = t==null?null:+(out.base_noPost - t).toFixed(3);
  }
  out.groups = [];
  for (const [k, idx] of Object.entries(groups)){
    const a = idx.reduce((s,i)=>s+area(i),0);
    hide(idx);
    const t = await gpuMs(full);
    show();
    const ref = await gpuMs(full);
    out.groups.push({shape:+k, n: idx.length, area_px: Math.round(a),
                     ms: t==null||ref==null?null:+(ref - t).toFixed(3)});
  }
  out.groups.sort((a,b)=>(b.ms??0)-(a.ms??0));
  if (EACH){
    /* the EACH biggest quads on screen, one at a time */
    const order = placed.map((p, i) => [i, area(i)]).sort((a, b) => b[1] - a[1]).slice(0, EACH).map(e => e[0]);
    const res = [];
    for (const i of order){
      const a = area(i);
      hide([i]); const t = await gpuMs(full); show(); const ref = await gpuMs(full);
      res.push({i, shape: placed[i].shape, x:+(placed[i].x??0).toFixed(2), z:+(placed[i].z??0).toFixed(2),
                area_px: Math.round(a), ms: t==null||ref==null?null:+(ref-t).toFixed(3)});
    }
    out.near = res;
  }
  b.enabled = bOn; g.enabled = gOn;
  MM.clock.start();
  return out;
})()
"""


async def run(a):
    from playwright.async_api import async_playwright
    frag = [f"scene={a.scene}"]
    if a.hash:
        frag.append(a.hash.lstrip("#&"))
    url = BASE + "#" + "&".join(frag)
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
        try:
            await page.wait_for_function("window.__MM_WARMUP_MS !== undefined", timeout=600000)
        except Exception:
            pass
        src = (PROBE.replace("SETTLE", repr(float(a.settle)))
                    .replace("FRAMES", str(int(a.frames)))
                    .replace("EACH", str(int(a.each))))
        res = await page.evaluate(src)
        res["errors"] = errs[:5]
        res["hash"] = a.hash
        await browser.close()
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="combat")
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=float, default=40.0)
    ap.add_argument("--settle", type=float, default=6.0)
    ap.add_argument("--frames", type=int, default=40)
    ap.add_argument("--each", type=int, default=0, help="also time the N biggest quads one at a time")
    ap.add_argument("--hash", default="")
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from gpu_slot import gpu_slot
    with gpu_slot("shapeprof.py"):
        asyncio.run(run(ap.parse_args()))
