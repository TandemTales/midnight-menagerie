"""Value structure: the ONE axis this round's light-and-value work is judged on.

`bgmetrics.py` measures surface (tooth, ink, edge width). It does not measure
where the LIGHT is. The samples are dark pictures with a few small bright
accents, and every room in this game is lit fairly evenly by comparison:

    UI/mainMenu.png     49.7% of pixels below L32,  3.6% above L192
    room-foyer (r7)      ~26% below L32,            0.1% above L192

The columns:

  <32 <64        share of pixels in the deep shadows. A painting puts half its
                 canvas there; a render's ambient term will not let it.
  >192 >224      share in the bright accents. Small, and it must not be ZERO:
                 a picture with no highlight has no focus.
  p50 p95        median and 95th percentile luma, 0-255.
  keyArea        share of pixels within 1.5 stops of the brightest decile --
                 how BIG the lit area is. The samples keep it small.
  focus          Gini-like concentration of the top decile's light: 1.0 means
                 all the brightness is in one place, 0 means it is smeared
                 evenly over the frame. This is "does the eye have somewhere
                 to go".
  hSplit vSplit  luma centroid, as a fraction of the frame from the left and
                 from the BOTTOM. The samples are bottom-weighted (the floor
                 and the step are lit, the ceiling is black): mainMenu 0.39.
  band0..band4   mean luma of five horizontal bands, top to bottom. The shape
                 of the picture's value, in five numbers.

    python tools/valuemetrics.py --samples
    python tools/valuemetrics.py shots/x.png [more.png ...]
    python tools/valuemetrics.py shots/x.png --box x0,y0,x1,y1
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "UI")
COMMON_H = 900

SAMPLES = ["mainMenu.png", "selectKid.png", "selectCompanion.png", "title.png"]


def load(path, box=None):
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    if im.height != COMMON_H:
        im = im.resize((max(1, round(im.width * COMMON_H / im.height)), COMMON_H),
                       Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def measure(path, box=None):
    rgb = load(path, box)
    L = luma(rgb)
    H, W = L.shape
    n = L.size
    out = {"name": os.path.basename(path)}
    out["lt32"] = float((L < 32).sum() / n * 100.0)
    out["lt64"] = float((L < 64).sum() / n * 100.0)
    out["gt192"] = float((L > 192).sum() / n * 100.0)
    out["gt224"] = float((L > 224).sum() / n * 100.0)
    out["p50"] = float(np.percentile(L, 50))
    out["p95"] = float(np.percentile(L, 95))
    # how big the lit area is: within 1.5 stops (a factor of 2.83) of p99
    top = np.percentile(L, 99)
    out["keyArea"] = float((L > top / 2.83).sum() / n * 100.0)
    # concentration of the top decile's energy over 32 px tiles
    t = 32
    ny, nx = H // t, W // t
    tv = L[:ny * t, :nx * t].reshape(ny, t, nx, t).mean((1, 3)).ravel()
    s = np.sort(tv)[::-1]
    csum = np.cumsum(s)
    tot = max(csum[-1], 1e-6)
    k = max(1, int(round(len(s) * 0.10)))
    out["focus"] = float(csum[k - 1] / tot)
    # luma centroid
    ys, xs = np.mgrid[0:H, 0:W]
    tot2 = max(L.sum(), 1e-6)
    out["hSplit"] = float((L * xs).sum() / tot2 / max(W - 1, 1))
    out["vSplit"] = float(1.0 - (L * ys).sum() / tot2 / max(H - 1, 1))
    for b in range(5):
        y0, y1 = H * b // 5, H * (b + 1) // 5
        out["band%d" % b] = float(L[y0:y1].mean())
    return out


HEAD = ("name", 30), ("lt32", 7), ("lt64", 7), ("gt192", 7), ("gt224", 7), \
       ("p50", 6), ("p95", 6), ("keyArea", 8), ("focus", 6), \
       ("hSplit", 7), ("vSplit", 7), \
       ("band0", 6), ("band1", 6), ("band2", 6), ("band3", 6), ("band4", 6)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="*")
    ap.add_argument("--samples", action="store_true")
    ap.add_argument("--box", default=None)
    a = ap.parse_args(argv)
    box = None
    if a.box:
        box = tuple(int(v) for v in a.box.split(","))
    paths = list(a.images)
    if a.samples or not paths:
        paths = [os.path.join(UI, s) for s in SAMPLES] + paths
    rows = [measure(p, box) for p in paths]
    line = "".join(k.rjust(w) for k, w in HEAD)
    print(line)
    print("-" * len(line))
    for r in rows:
        cells = []
        for k, w in HEAD:
            v = r[k]
            cells.append((v if isinstance(v, str) else "%.3f" % v if w < 7 and k in
                          ("focus",) else "%.2f" % v if not isinstance(v, str) else v)
                         .rjust(w))
        print("".join(cells))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
