#!/usr/bin/env python3
"""Time every room program's link ALONE, on this machine's GPU.

    python tools/linkprof.py [--port 8777] [--only wall,prop] [--budget 12] [--out shots/linkprof.json]

WHY THIS EXISTS
---------------
On 2026-10-13 a Windows update roughly doubled the D3D shader compiler's time
on this machine (Intel UHD, ANGLE D3D11), and the backdrop's programs -- which
then compiled every room they could draw and chose one per pixel -- took 80-197
s to warm up: Josh clicked New Expedition and got a dark screen. Nothing
measured a program's link on its own, so nobody saw them grow: the room shader
gained 26% in two weeks and the warm-up's two big links went from ~17 s to
38 s and 49 s alone (150-190 s side by side in the warm-up).

This boots the game once, asks three.js for the GLSL of every program in
ROOM_VARIANTS (fx/backdrop.js) without waiting for any link, then links each
one in a FRESH browser -- no program cache, nothing else on the GPU thread --
and times linkProgram to COMPLETION_STATUS. A program over --budget seconds
fails. The in-game link of the same program runs 1.5-3x longer than this,
beside a frame being drawn and the other links.

Takes ~5 minutes for the 89 programs. Uses the GPU slot (tools/gpu_slot.py).
"""
import argparse
import asyncio
import json
import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpu_slot import gpu_slot  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HOOK = r"""
(() => {
  const S = new Map();
  const P = WebGL2RenderingContext.prototype;
  const oSrc = P.shaderSource;
  P.shaderSource = function (s, src) { S.set(s, src); return oSrc.call(this, s, src); };
  const oAtt = P.attachShader;
  P.attachShader = function (p, s) { (p.__src = p.__src || []).push(S.get(s) || ''); return oAtt.call(this, p, s); };
})();
"""

SOURCES = r"""
async (only) => {
  const st = MM.ctx.stage, R = st.renderer, b = MM.ctx.atmosphere.backdrop;
  const { ROOM_VARIANTS } = await import('/game/src/fx/backdrop.js');
  const MAT = { wall: [b.wall.geometry, b.wallMat], portal: [b.portals[0].geometry, b.portals[0].material],
    prop: [b.propGeo, b.propMat], floor: [b.floor.geometry, b.floorMat], ceil: [b.ceiling.geometry, b.ceilMat] };
  const Mesh = b.wall.constructor;
  const out = [];
  for (const job of ROOM_VARIANTS) {
    if (only && !only.includes(job.mat)) continue;
    const [geo, mat] = MAT[job.mat];
    const m = mat.clone();
    m.defines = Object.assign({}, mat.defines, job.defines);
    const mesh = new Mesh(geo, m);
    mesh.frustumCulled = false;
    R.setRenderTarget(st.composer.renderTarget1);
    try { R.compile(mesh, st.camera, st.scene); } catch (e) { /* recorded as empty */ }
    R.setRenderTarget(null);
    const pr = R.properties.get(m).currentProgram;
    const src = (pr && pr.program && pr.program.__src) || ['', ''];
    out.push({ mat: job.mat, defines: job.defines, wings: job.wings, vs: src[0], fs: src[1] });
  }
  return out;
}
"""

LINK = r"""
async ([vs, fs]) => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const khr = gl.getExtension('KHR_parallel_shader_compile');
  /* a fresh browser has no program cache; the nonce makes sure of it */
  const nonce = '\n#define MM_LINKPROF_' + Math.floor(Math.random() * 1e9) + '\n';
  const fix = (s) => s.replace(/^(#version[^\n]*\n)/, '$1' + nonce);
  const t0 = performance.now();
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, fix(src)); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  while (khr && !gl.getProgramParameter(p, 0x91B1)) await new Promise((r) => setTimeout(r, 20));
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
  return { ms: performance.now() - t0, ok, log: ok ? '' : (gl.getProgramInfoLog(p) || '').slice(0, 300) };
}
"""

ARGS = ["--use-gl=angle", "--use-angle=default"]


async def run(a):
    from playwright.async_api import async_playwright
    only = a.only.split(",") if a.only else None
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await b.new_page(viewport={"width": 1280, "height": 800})
        await pg.add_init_script(HOOK)
        await pg.goto(f"http://localhost:{a.port}/game/index.html#scene=title", wait_until="load")
        await pg.wait_for_function("window.MM && MM.ctx.atmosphere && MM.ctx.atmosphere.ready && MM.ctx.stage.composer",
                                   timeout=120000)
        jobs = await pg.evaluate(SOURCES, only)
        await b.close()
        rows = []
        for j in jobs:
            name = j["mat"] + " " + " ".join(f"{k[3:]}={v}" for k, v in j["defines"].items())
            if not j["fs"]:
                rows.append(dict(name=name, wings=j["wings"], s=None, ok=False, log="no source"))
                print(f"  ----   {name}  (no source)")
                continue
            b = await p.chromium.launch(args=ARGS)
            pg = await b.new_page()
            await pg.goto("about:blank")
            try:
                r = await asyncio.wait_for(pg.evaluate(LINK, [j["vs"], j["fs"]]), 600)
            except Exception as e:
                r = {"ms": None, "ok": False, "log": f"{type(e).__name__}"}
            await b.close()
            s = None if r["ms"] is None else r["ms"] / 1000
            rows.append(dict(name=name, wings=j["wings"], s=s, ok=r["ok"], log=r["log"]))
            flag = "FAIL" if (not r["ok"] or s is None or s > a.budget) else "  ok"
            print(f"  {flag} {'' if s is None else f'{s:6.1f}s'}  {name}  [{', '.join(j['wings'])}]", flush=True)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--only", help="comma-separated materials: wall,prop,floor,ceil,portal")
    ap.add_argument("--budget", type=float, default=12.0,
                    help="seconds one program may take to link alone (default 12)")
    ap.add_argument("--out", default=os.path.join(ROOT, "shots", "linkprof.json"))
    a = ap.parse_args()
    t0 = time.time()
    with gpu_slot("linkprof.py"):
        rows = asyncio.run(run(a))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(rows, open(a.out, "w"), indent=1)
    timed = [r for r in rows if r["s"] is not None]
    bad = [r for r in rows if not r["ok"] or r["s"] is None or r["s"] > a.budget]
    if timed:
        worst = max(timed, key=lambda r: r["s"])
        print(f"{len(rows)} programs in {time.time() - t0:.0f}s; sum {sum(r['s'] for r in timed):.0f}s, "
              f"worst {worst['s']:.1f}s ({worst['name']})")
    print(f"RESULT: {len(rows)} programs, {len(bad)} over {a.budget:g}s or failed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
