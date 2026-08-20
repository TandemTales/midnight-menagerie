"""Capture the 17-region showcase and score the look.

Same methodology as the round-2 atmosphere pass so the numbers are comparable:
  luma        Rec.709 on 8-bit sRGB
  chroma      max(rgb) - min(rgb), mean over pixels
  mid-tones   fraction of pixels with 64 <= L <= 160
  xcorr       Pearson between every region pair, on a brightness- and
              contrast-normalised 128x72 luma downsample

    python tools/lookmetrics.py --tag after            # auto tier
    python tools/lookmetrics.py --tag high --tier high # force a tier
"""
import asyncio, os, argparse, json
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots")
BASE = "http://localhost:8777/game/index.html"

ORDER = ['foyer', 'nursery', 'greenhouse', 'crypt', 'ballroom', 'lampworks',
         'bathhouse', 'pumpkin', 'heart', 'graveyard', 'study', 'attic',
         'kitchens', 'sleeping', 'hedge', 'passages', 'kennels']


async def capture(tag, tier, w, h):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required"])
        pg = await (await b.new_context(viewport={"width": w, "height": h},
                                        device_scale_factor=1.0)).new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE + "#scene=title", wait_until="load", timeout=45000)
        await pg.wait_for_timeout(7000)
        if tier:
            await pg.evaluate(f"MM.ctx.stage.setTier('{tier}', {{persist:false}})")
            await pg.wait_for_timeout(700)
        await pg.evaluate("import('/game/src/fx/showcase.js').then(m=>m.mountShowcase(window.MM.ctx))")
        await pg.wait_for_timeout(1800)
        info = await pg.evaluate("(()=>{const s=MM.ctx.stage;return {tier:s.tier,stats:s.stats,"
                                 "buf:[s.renderer.domElement.width,s.renderer.domElement.height]}})()")
        for name in ORDER:
            await pg.evaluate(f"MM.showcase.set('{name}', true)")
            await pg.wait_for_timeout(900)
            await pg.screenshot(path=os.path.join(SHOTS, f"lm_{tag}_{name}.png"),
                                animations="allow")
        await b.close()
    return info, errs


def luma(a):
    return a[..., 0]*0.2126 + a[..., 1]*0.7152 + a[..., 2]*0.0722


def score(tag):
    per, small = {}, []
    for name in ORDER:
        p = os.path.join(SHOTS, f"lm_{tag}_{name}.png")
        a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)
        L = luma(a)
        ch = a.max(axis=2) - a.min(axis=2)
        per[name] = dict(
            mean=float(L.mean()), median=float(np.median(L)),
            p95=float(np.percentile(L, 95)), chroma=float(ch.mean()),
            shadow=float((L < 32).mean()*100),
            mid=float(((L >= 64) & (L <= 160)).mean()*100),
            high=float((L > 192).mean()*100),
        )
        d = np.asarray(Image.open(p).convert("L").resize((128, 72), Image.BOX), dtype=np.float64)
        d = (d - d.mean()) / (d.std() + 1e-9)
        small.append(d.ravel())
    n = len(small)
    xs = [float(np.dot(small[i], small[j]) / small[i].size)
          for i in range(n) for j in range(i+1, n)]
    agg = {k: float(np.mean([per[r][k] for r in ORDER])) for k in per[ORDER[0]]}
    agg["xcorr_mean"] = float(np.mean(xs))
    agg["xcorr_max"] = float(np.max(xs))
    return agg, per


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="after")
    ap.add_argument("--tier", default=None)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--score-only", action="store_true")
    a = ap.parse_args()
    if not a.score_only:
        info, errs = asyncio.run(capture(a.tag, a.tier, a.w, a.h))
        print("stage:", json.dumps(info), "errors:", errs[:3])
    agg, per = score(a.tag)
    print(f"\n=== {a.tag} ===")
    for k in ["mean", "median", "p95", "chroma", "shadow", "mid", "high", "xcorr_mean", "xcorr_max"]:
        print(f"  {k:11s} {agg[k]:8.2f}")
    print("\n  worst mid-tone regions:",
          sorted(ORDER, key=lambda r: per[r]["mid"])[:4])
