"""Find where each of the seventeen section drawings sits on the estate plan.

    python tools/blueprint_locate.py            # write the JSON
    python tools/blueprint_locate.py --report   # measure only
    python tools/blueprint_locate.py --preview  # also write an overlay PNG
    python tools/blueprint_locate.py --wings    # add each wing's footprint (round 38)

Reads   game/assets/blueprint/mansion.png  (1448x1086, the whole estate)
        game/assets/blueprint/sectionNN.png (the seventeen wings)
Writes  game/assets/blueprint/sections.json

ONE-OFF, like blueprint_trace.py: run it, commit the JSON, the game never runs
it. This is what a mansion-level map needs -- the rectangle each wing occupies
on the estate drawing, so the whole house can be shown at once with the wings
as hover targets, and picking one can zoom into the section it came from.

HOW THE MATCH IS MADE, and why it is not a crop comparison. The sections were
cut from this very drawing but they are not byte-identical to it: they have been
level-shifted (section01 runs 40..210 where the estate runs 29..224) and, more
importantly, everything outside the wing has been ERASED to blank parchment. So
an exact search finds nothing -- tried, zero hits on all seventeen -- and a
straight difference is dominated by the erased area rather than the drawing.

Normalised cross-correlation is invariant to the level shift, and the erased
area only costs it a constant, so the peak still lands on the right place. It
does depress the score: the sections with the most erased around them score
worst (pumpkin-grounds 0.67, lampworks 0.70) and the ones that fill their box
score best (foyer 0.96, nursery 0.96). A low score here is not a bad match.

VERIFIED, because a 0.67 needs it. Three checks, all pointing the same way:

  scale     every section peaks at scale 1.00 by a factor of 3 to 5 over any
            other scale tried (0.6 to 2.0). A wrong location does not do that.
  edges     re-running the whole thing on gradient magnitude instead of luma --
            a different signal, since these are line drawings -- returns the
            SAME seventeen positions.
  eyes      cropping the estate at the found rectangle and putting it beside the
            section shows the same structures in the same places: the cathedral
            spires and tree masses of lampworks, the oval room of
            pumpkin-grounds. What differs is only what was erased.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import signal

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "game", "assets", "blueprint")
MANSION = os.path.join(BP, "mansion.png")
OUT = os.path.join(BP, "sections.json")


def regions():
    """{slug: (section no, companion, boss, name)} straight out of mapgen.js, so
    this file never keeps its own copy of a table the game already owns."""
    src = open(os.path.join(ROOT, "game/src/state/mapgen.js"), encoding="utf-8").read()
    out = {}
    for slug, name, boss, comp, sec in re.findall(
            r"M\('([a-z-]+)','([^']*)','([^']*)','([a-z]*)',(\d+),", src):
        out[slug] = (int(sec), comp or None, boss, name)
    return out


def peak(I, I2, T):
    """Normalised cross-correlation peak of T in I. Returns (r, x, y)."""
    th, tw = T.shape
    Tz = T - T.mean()
    tss = np.sqrt((Tz * Tz).sum())
    if tss == 0:
        return 0.0, 0, 0
    num = signal.fftconvolve(I, Tz[::-1, ::-1], mode="valid")
    ones = np.ones((th, tw))
    s1 = signal.fftconvolve(I, ones, mode="valid")
    s2 = signal.fftconvolve(I2, ones, mode="valid")
    var = s2 - s1 * s1 / (th * tw)
    var[var < 1e-6] = 1e-6
    r = num / (np.sqrt(var) * tss)
    y, x = np.unravel_index(np.argmax(r), r.shape)
    return float(r[y, x]), int(x), int(y)


def main(report=False, preview=False):
    I = np.array(Image.open(MANSION).convert("L")).astype(np.float64)
    I2 = I * I
    MH, MW = I.shape
    reg = regions()
    by_section = {n: (slug, comp, boss, name) for slug, (n, comp, boss, name) in reg.items()}

    out = {"mansion": {"file": "mansion.png", "w": MW, "h": MH}, "sections": {}}
    print("%-19s %3s %-11s %-22s %s" % ("region", "sec", "companion", "rect", "match"))
    for n in sorted(by_section):
        f = os.path.join(BP, "section%02d.png" % n)
        if not os.path.exists(f):
            print("  section%02d.png missing" % n)
            continue
        slug, comp, boss, name = by_section[n]
        T = np.array(Image.open(f).convert("L")).astype(np.float64)
        r, x, y = peak(I, I2, T)
        h, w = T.shape
        out["sections"][slug] = {
            "section": n, "companion": comp, "boss": boss, "name": name,
            "x": x, "y": y, "w": w, "h": h,
            # normalised, because the map will draw the estate at whatever size
            # the window is and hit-testing in source pixels would be a lie
            "nx": round(x / MW, 5), "ny": round(y / MH, 5),
            "nw": round(w / MW, 5), "nh": round(h / MH, 5),
            "match": round(r, 3),
        }
        print("%-19s %3d %-11s x%-4d y%-4d %3dx%-3d  %.2f"
              % (slug, n, comp or "-", x, y, w, h, r))

    if preview:
        from PIL import ImageDraw
        ov = Image.open(MANSION).convert("RGB")
        d = ImageDraw.Draw(ov, "RGBA")
        for slug, e in out["sections"].items():
            d.rectangle([e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]],
                        fill=(60, 200, 255, 45), outline=(60, 200, 255, 255), width=3)
            d.text((e["x"] + 6, e["y"] + 5), slug, fill=(255, 255, 255))
        p = os.path.join(ROOT, "shots", "blueprint-locate.png")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        ov.save(p)
        print("\npreview -> shots/blueprint-locate.png")

    if report:
        return 0
    json.dump(out, open(OUT, "w"), indent=1)
    print("\nwrote game/assets/blueprint/sections.json (%d wings)" % len(out["sections"]))
    return 0


# ── round 38: the wings as seventeen PARTS ────────────────────────────────────
#
#   python tools/blueprint_locate.py --wings [--preview]
#
# Adds to every section in sections.json the wing's own FOOTPRINT on the estate
# -- "outline", a list of rings in estate pixels (x0,y0,x1,y1,...) -- "pole",
# the point inside it furthest from its edge [x, y, distance], where its label
# is lettered, and "span", how far the footprint runs either side of the pole
# along its own row [left, right], to fit that label.
#
# Why the rectangles are not enough. They overlap (the Foyer's sits inside the
# Hedge Maze's, the Lampworks' inside the Ballroom's), so a screen that draws a
# wing by its rectangle draws its neighbours' walls too, and seventeen of them
# at once is a tangle. But every section drawing has had everything outside its
# wing ERASED (see the header), so its own ink IS the wing. Closed into a solid
# mass, that is the wing's footprint; where two footprints still claim a pixel
# (a shared wall) it goes to the wing whose own ink is nearer; each is then
# eased back off its neighbours by a hair so the two read as two walls.

def _ink_of(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = (r * 299 + g * 587 + b * 114) // 1000
    return ((b - r) > 4) | (lum < 120)


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def _rings(mask):
    """Outer boundary of every component, as pixel-corner loops (crack
    following). Holes are filled before this is asked."""
    H, W = mask.shape
    m = np.zeros((H + 2, W + 2), bool)
    m[1:-1, 1:-1] = mask
    c = m[1:-1, 1:-1]
    nxt = {}
    # directed boundary edges, inside on the right, in pixel-corner coords
    ys, xs = np.nonzero(c & ~m[:-2, 1:-1])           # top edge, left to right
    for y, x in zip(ys.tolist(), xs.tolist()): nxt[(x, y)] = (x + 1, y)
    ys, xs = np.nonzero(c & ~m[1:-1, 2:])            # right edge, downwards
    for y, x in zip(ys.tolist(), xs.tolist()): nxt[(x + 1, y)] = (x + 1, y + 1)
    ys, xs = np.nonzero(c & ~m[2:, 1:-1])            # bottom edge, right to left
    for y, x in zip(ys.tolist(), xs.tolist()): nxt[(x + 1, y + 1)] = (x, y + 1)
    ys, xs = np.nonzero(c & ~m[1:-1, :-2])           # left edge, upwards
    for y, x in zip(ys.tolist(), xs.tolist()): nxt[(x, y + 1)] = (x, y)
    rings = []
    while nxt:
        start, cur = next(iter(nxt.items()))
        del nxt[start]
        ring = [start]
        while cur != start and cur in nxt:
            ring.append(cur)
            cur = nxt.pop(cur)
        if len(ring) > 12:
            rings.append(ring)
    return rings


def _rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a = np.array(pts, float)
    keep = np.zeros(len(a), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(a) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p, q = a[i], a[j]
        d = q - p
        n = float(np.hypot(*d)) or 1.0
        seg = a[i + 1:j]
        dist = np.abs(d[0] * (seg[:, 1] - p[1]) - d[1] * (seg[:, 0] - p[0])) / n
        k = int(np.argmax(dist))
        if dist[k] > eps:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return [tuple(int(round(t)) for t in v) for v in a[keep]]


def _half_run(m):
    """For every pixel of a mask, how far its own row runs either side of it
    -- the half-width of the widest line centred there."""
    H, W = m.shape
    L = np.zeros((H, W), np.int32)
    R = np.zeros((H, W), np.int32)
    for x in range(W):
        L[:, x] = np.where(m[:, x], (L[:, x - 1] + 1) if x else 1, 0)
    for x in range(W - 1, -1, -1):
        R[:, x] = np.where(m[:, x], (R[:, x + 1] + 1) if x < W - 1 else 1, 0)
    return np.minimum(L, R)


def wings(preview=False):
    from scipy import ndimage
    j = json.load(open(OUT, encoding="utf-8"))
    MW, MH = j["mansion"]["w"], j["mansion"]["h"]
    slugs = list(j["sections"])
    foot, dist = [], []
    for slug in slugs:
        e = j["sections"][slug]
        ink = _ink_of(os.path.join(BP, "section%02d.png" % e["section"]))
        # specks of the erased paper's grain are not the wing
        lab, n = ndimage.label(ink)
        if n:
            size = ndimage.sum(ink, lab, range(1, n + 1))
            ink = np.isin(lab, 1 + np.nonzero(size >= 40)[0])
        full = np.zeros((MH, MW), bool)
        h, w = min(e["h"], MH - e["y"]), min(e["w"], MW - e["x"])
        full[e["y"]:e["y"] + h, e["x"]:e["x"] + w] = ink[:h, :w]
        # rooms closed off by their walls (a door is a gap of a few px), every
        # enclosed room filled, then eased back onto the outer wall
        f = ndimage.binary_dilation(full, _disk(7))
        f = ndimage.binary_fill_holes(f)
        f = ndimage.binary_erosion(f, _disk(6))
        foot.append(f)
        dist.append(ndimage.distance_transform_edt(~full))
    foot = np.array(foot)
    dist = np.array(dist)
    dist[~foot] = np.inf
    owner = np.argmin(dist, axis=0)
    claimed = np.isfinite(dist.min(axis=0))
    yy, xx = np.mgrid[0:MH, 0:MW]
    for i, slug in enumerate(slugs):
        e = j["sections"][slug]
        m = claimed & (owner == i)
        m = ndimage.binary_opening(m, _disk(3))
        m = ndimage.binary_erosion(m, _disk(1))         # a hair off the neighbours
        lab, n = ndimage.label(m)
        if not n:
            continue
        size = ndimage.sum(m, lab, range(1, n + 1))
        big = 1 + np.nonzero(size >= max(900, size.max() * 0.06))[0]
        m = ndimage.binary_fill_holes(np.isin(lab, big))
        rings = [_rdp(r, 1.6) for r in _rings(m)]
        rings = [r for r in rings if len(r) >= 4]
        edt = ndimage.distance_transform_edt(m)
        # the label's place: where the widest line of lettering fits CENTRED
        # with room above and below it for the numeral and a second line --
        # not merely the deepest point, which in a wing shaped like a cross
        # is the crossing, a few rooms wide
        hr = _half_run(m)
        vr = _half_run(m.T).T
        cy, cx = ndimage.center_of_mass(m)
        ok = vr >= 38
        if not ok.any():
            ok = vr >= vr.max() * 0.7
        score = np.where(ok, hr, -1e9) - 0.06 * np.hypot(yy - cy, xx - cx)
        py, px = np.unravel_index(np.argmax(score), score.shape)
        h_ = int(hr[py, px])
        e["outline"] = [[c for pt in r for c in pt] for r in rings]
        e["pole"] = [int(px), int(py), round(float(edt[py, px]), 1)]
        e["span"] = [int(px - h_), int(px + h_)]
        print("%-19s rings %d  pts %4d  pole %4d,%4d r%5.1f span %d" % (
            slug, len(rings), sum(len(r) for r in rings), px, py, edt[py, px], 2 * h_))
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(j, fh, indent=1)
    if preview:
        from PIL import ImageDraw
        ov = Image.open(MANSION).convert("RGB")
        d = ImageDraw.Draw(ov, "RGBA")
        cols = [(220, 60, 60), (60, 160, 60), (60, 60, 220), (200, 140, 20), (160, 60, 160), (20, 160, 160)]
        for k, slug in enumerate(slugs):
            e = j["sections"][slug]
            c = cols[k % len(cols)]
            for r in e.get("outline", []):
                d.polygon(list(zip(r[0::2], r[1::2])), fill=c + (70,), outline=c + (255,))
            px, py, _ = e["pole"]
            d.ellipse([px - 6, py - 6, px + 6, py + 6], fill=c + (255,))
            d.text((px + 8, py - 6), slug, fill=(0, 0, 0))
        p = os.path.join(ROOT, "shots", "blueprint-wings.png")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        ov.save(p)
        print("preview -> shots/blueprint-wings.png")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--wings", action="store_true",
                    help="add each wing's footprint outline and label pole to sections.json")
    a = ap.parse_args()
    if a.wings:
        sys.exit(wings(preview=a.preview))
    sys.exit(main(report=a.report, preview=a.preview))
