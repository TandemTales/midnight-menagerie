"""Capture the 17-region showcase and score the look.

Same methodology as the round-2 atmosphere pass so the numbers are comparable:
  luma        Rec.709 on 8-bit sRGB
  chroma      max(rgb) - min(rgb), mean over pixels
  mid-tones   fraction of pixels with 64 <= L <= 160
  xcorr       Pearson between every region pair, on a brightness- and
              contrast-normalised 128x72 luma downsample

ROUND 3 adds the metric that was actually failing: PROP PEAK vs CREATURE PEAK.
Two reviewers called room quality bimodal because in several regions the props
were the brightest objects in frame, outshining the enemies. A rectangular
"prop band" cannot measure that (it is mostly wall), so each region is captured
three times and differenced:

    A  everything
    B  props hidden      ->  propMask     = |A-B| > DIFF
    C  creature hidden   ->  creatureMask = |A-C| > DIFF

`peak` is the 99.5th percentile of luma inside a mask (a plain max is one stray
pixel). The pass condition is  creaturePeak > propPeak  in every region.

    python tools/lookmetrics.py --tag after            # capture + score
    python tools/lookmetrics.py --tag after --score-only
    python tools/lookmetrics.py --tag after --w 1920 --h 1080
    python tools/lookmetrics.py --tag a --compare b    # before/after table
"""
import asyncio, os, argparse, json
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots")
BASE = "http://localhost:8777/game/index.html"
DIFF = 6          # 8-bit channel delta that counts as "this layer drew here"
LIGHT_DIFF = 45   # ...and how hard a flame or shaft must be writing over a layer
                  # for the pixel to belong to the LIGHT rather than to the layer
ERODE = 2         # pixels trimmed off every mask edge (see _erode)

ORDER = ['foyer', 'nursery', 'greenhouse', 'crypt', 'ballroom', 'lampworks',
         'bathhouse', 'pumpkin', 'heart', 'graveyard', 'study', 'attic',
         'kitchens', 'sleeping', 'hedge', 'passages', 'kennels']


async def capture(tag, tier, w, h, layers=True):
    from playwright.async_api import async_playwright
    audit = {}
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
            await pg.evaluate(f"MM.ctx.clock.scale = 1; MM.showcase.set('{name}', true)")
            await pg.wait_for_timeout(900)
            # FREEZE. The idle camera breathing, the flame flicker and the particle
            # drift all run continuously, so two screenshots 140 ms apart differ
            # EVERYWHERE — the first attempt at this measured a 500k-pixel
            # "creature" that was really the whole frame having moved. clock.scale
            # = 0 stops dt and t dead while the render loop keeps drawing.
            await pg.evaluate("MM.showcase.steady(); MM.ctx.clock.scale = 0")
            await pg.wait_for_timeout(240)
            audit[name] = await pg.evaluate("MM.showcase.audit()")
            await pg.screenshot(path=os.path.join(SHOTS, f"lm_{tag}_{name}.png"),
                                animations="allow", timeout=90000)
            if layers:
                await pg.evaluate("MM.showcase.showProps(false)")
                await pg.wait_for_timeout(160)
                await pg.screenshot(path=os.path.join(SHOTS, f"lm_{tag}_{name}__np.png"),
                                    animations="allow", timeout=90000)
                await pg.evaluate("MM.showcase.showProps(true); MM.showcase.showActor(false)")
                await pg.wait_for_timeout(160)
                await pg.screenshot(path=os.path.join(SHOTS, f"lm_{tag}_{name}__nc.png"),
                                    animations="allow", timeout=90000)
                await pg.evaluate("MM.showcase.showActor(true); MM.showcase.showLight(false)")
                await pg.wait_for_timeout(160)
                await pg.screenshot(path=os.path.join(SHOTS, f"lm_{tag}_{name}__nf.png"),
                                    animations="allow", timeout=90000)
                await pg.evaluate("MM.showcase.showLight(true)")
                await pg.wait_for_timeout(120)
        await pg.evaluate("MM.ctx.clock.scale = 1")
        await b.close()
    with open(os.path.join(SHOTS, f"lm_{tag}_audit.json"), "w", encoding="utf-8") as f:
        json.dump(audit, f, indent=1)
    return info, errs, audit


def luma(a):
    return a[..., 0]*0.2126 + a[..., 1]*0.7152 + a[..., 2]*0.0722


def _img(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)


def _erode(m, k=ERODE):
    """Keep only pixels whose whole k-neighbourhood belongs to the mask.

    Props are alpha-blended, the frame is rendered at 0.8 render scale and
    upscaled, and both leave a border of pixels that are PART prop and part the
    wall behind it. Those borders are where the bright wall shows through, and
    without this the "peak of the prop layer" in a room with a bright wall is
    the wall. Applied identically to both masks, so it cannot favour either.
    """
    out = m
    for _ in range(k):
        e = out.copy()
        e[1:, :] &= out[:-1, :]; e[:-1, :] &= out[1:, :]
        e[:, 1:] &= out[:, :-1]; e[:, :-1] &= out[:, 1:]
        out = e
    return out


def _topn(L, mask, n=400):
    """Mean of the brightest n pixels in a mask — a peak that does not depend on
    how many pixels the mask happens to contain."""
    v = L[mask]
    if v.size < 200:
        return None
    return float(np.sort(v)[-min(n, v.size // 2):].mean())


def _peak(L, mask):
    """99.5th percentile of luma inside a mask; None if the mask is too small."""
    if mask.sum() < 200:
        return None
    return float(np.percentile(L[mask], 99.5))


def score(tag):
    per, small = {}, []
    for name in ORDER:
        p = os.path.join(SHOTS, f"lm_{tag}_{name}.png")
        a = _img(p)
        L = luma(a)
        ch = a.max(axis=2) - a.min(axis=2)
        d = dict(
            mean=float(L.mean()), median=float(np.median(L)),
            p95=float(np.percentile(L, 95)), chroma=float(ch.mean()),
            shadow=float((L < 32).mean()*100),
            mid=float(((L >= 64) & (L <= 160)).mean()*100),
            high=float((L > 192).mean()*100),
        )
        # ---- prop band vs creature band, by layer differencing ----------------
        pn = os.path.join(SHOTS, f"lm_{tag}_{name}__np.png")
        cn = os.path.join(SHOTS, f"lm_{tag}_{name}__nc.png")
        fn = os.path.join(SHOTS, f"lm_{tag}_{name}__nf.png")
        if os.path.exists(pn) and os.path.exists(cn):
            propMask = (np.abs(a - _img(pn)).max(axis=2) > DIFF)
            creaMask = (np.abs(a - _img(cn)).max(axis=2) > DIFF)
            propMask &= ~creaMask               # the actor wins any overlap
            if os.path.exists(fn):
                # A candle flame is neither a prop nor a creature. Props are
                # alpha-blended with depthWrite off and the flame billboards draw
                # additively after them, so a candle in front of a lamp post
                # writes a near-white pixel that the difference attributes to the
                # PROP. The flame is the light source and round 2 made it the one
                # thing in frame that is meant to clip; it belongs to neither
                # side of this comparison.
                lit = (np.abs(a - _img(fn)).max(axis=2) > LIGHT_DIFF)
                propMask &= ~lit
                creaMask &= ~lit
            propMask = _erode(propMask)
            creaMask = _erode(creaMask)
            d["propPeak"] = _peak(L, propMask)
            d["creaPeak"] = _peak(L, creaMask)
            # Size-invariant peak: the mean of the brightest 400 pixels. A
            # percentile favours whichever mask has more pixels, and the prop
            # mask runs 3-40x the creature mask.
            d["propTop"] = _topn(L, propMask)
            d["creaTop"] = _topn(L, creaMask)
            d["propPx"] = int(propMask.sum())
            d["creaPx"] = int(creaMask.sum())
            d["propMean"] = float(L[propMask].mean()) if propMask.sum() > 200 else None
            d["creaMean"] = float(L[creaMask].mean()) if creaMask.sum() > 200 else None
        per[name] = d
        s = np.asarray(Image.open(p).convert("L").resize((128, 72), Image.BOX), dtype=np.float64)
        s = (s - s.mean()) / (s.std() + 1e-9)
        small.append(s.ravel())
    n = len(small)
    xs = [float(np.dot(small[i], small[j]) / small[i].size)
          for i in range(n) for j in range(i+1, n)]
    keys = ["mean", "median", "p95", "chroma", "shadow", "mid", "high"]
    agg = {k: float(np.mean([per[r][k] for r in ORDER])) for k in keys}
    agg["xcorr_mean"] = float(np.mean(xs))
    agg["xcorr_max"] = float(np.max(xs))
    return agg, per


def _headroom(d):
    if d.get("propPeak") is None or d.get("creaPeak") is None:
        return None
    return d["creaPeak"] - d["propPeak"]


def report(tag, agg, per, audit=None):
    print(f"\n=== {tag} ===")
    for k in ["mean", "median", "p95", "chroma", "shadow", "mid", "high",
              "xcorr_mean", "xcorr_max"]:
        print(f"  {k:11s} {agg[k]:8.2f}")
    print("\n  region      prop p99.5  crea p99.5     head |  prop top  crea top"
          "     head  verdict")
    fails = []
    for r in ORDER:
        d = per[r]
        hp, hc = d.get("propPeak"), d.get("creaPeak")
        tp, tc = d.get("propTop"), d.get("creaTop")
        if hp is None or hc is None:
            print(f"  {r:11s} (no layer shots)")
            continue
        hr = hc - hp
        ok = hr > 0 and (tp is None or tc - tp > 0)
        if not ok:
            fails.append(r)
        tail = "" if tp is None else f" | {tp:9.1f} {tc:9.1f} {tc - tp:8.1f}"
        print(f"  {r:11s} {hp:10.1f} {hc:11.1f} {hr:8.1f}{tail}"
              f"  {'ok' if ok else 'PROP WINS'}")
    print(f"\n  prop-outshines-creature regions: {len(fails)}/17 {fails}")
    if audit:
        tot = sum(len(a["bad"]) for a in audit.values())
        print(f"  placement defects: {tot} across 17 regions")
        for r in ORDER:
            a = audit.get(r)
            if a and a["bad"]:
                kinds = {}
                for b in a["bad"]:
                    for f in b["flags"]:
                        kinds[f] = kinds.get(f, 0) + 1
                print(f"    {r:11s} {len(a['bad']):3d}/{a['props']:<3d} {kinds}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="after")
    ap.add_argument("--tier", default=None)
    ap.add_argument("--w", type=int, default=1600)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--score-only", action="store_true")
    ap.add_argument("--no-layers", action="store_true")
    ap.add_argument("--compare", default=None, help="second tag to diff against")
    a = ap.parse_args()
    if not a.score_only:
        info, errs, _ = asyncio.run(capture(a.tag, a.tier, a.w, a.h, not a.no_layers))
        print("stage:", json.dumps(info), "errors:", errs[:3])
    ap_ = os.path.join(SHOTS, f"lm_{a.tag}_audit.json")
    aud = json.load(open(ap_, encoding="utf-8")) if os.path.exists(ap_) else None
    agg, per = score(a.tag)
    report(a.tag, agg, per, aud)
    print("\n  worst mid-tone regions:",
          sorted(ORDER, key=lambda r: per[r]["mid"])[:4])
    if a.compare:
        agg2, per2 = score(a.compare)
        print(f"\n=== {a.compare} -> {a.tag} ===")
        for k in ["mean", "median", "p95", "chroma", "shadow", "mid", "high",
                  "xcorr_mean", "xcorr_max"]:
            print(f"  {k:11s} {agg2[k]:8.2f} -> {agg[k]:8.2f}")
        print(f"\n  {'region':11s} {'prop':>16s} {'creature':>16s} {'headroom':>16s}")
        for r in ORDER:
            d0, d1 = per2[r], per[r]
            f = lambda v: "-" if v is None else f"{v:.1f}"
            print(f"  {r:11s} {f(d0.get('propPeak')):>7s}->{f(d1.get('propPeak')):>8s}"
                  f" {f(d0.get('creaPeak')):>7s}->{f(d1.get('creaPeak')):>8s}"
                  f" {f(_headroom(d0)):>7s}->{f(_headroom(d1)):>8s}")
