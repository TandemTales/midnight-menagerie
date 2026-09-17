"""Measure a background against the samples in UI/, on the axes that separate
a render from a painting.

Seven UI rounds all stalled at the same complaint, worded the same way by every
judge: "the room behind the board is a render, not a painting". Two of its causes
were found in 2026-09-16 by measuring rather than by taste -- the black floor
(`57da26a`) and the tooth (`cc59d6e`) -- and both were found with ad-hoc scripts
that were not kept. This is the kept version, and it adds the axes the ground
pass did not cover, because the ground is not what is left:

  floor      the darkest decile's min channel. A painting goes to near-black;
             a render's ambient term sits it five levels up, which ALSO caps
             saturation, because sat = (max-min)/max.
  satShadow  saturation inside that darkest decile.
  tooth      high-frequency energy over the surface's own level, measured on
             FLAT TILES ONLY (tiles with no form edge in them), per octave.
             Josh's paintings carry the same tooth at every octave from 0.8 px
             to 12 px; a render is smooth at the fine end.
  edgeWidth  how many pixels a form's edge takes to turn over. A shader that
             thresholds an SDF gives ~1.2; a brush gives 2.5-4. This is the
             number that reads as "aliased" or "CG-crisp".
  ink        the samples outline every form with a line DARKER THAN BOTH SIDES.
             Fraction of strong edges that carry such a trough, and how deep.
  peak       99.5th percentile luma over the median. A blown-out glow -- a
             candle drawn as a white blob -- shows up here and nowhere else.
  midSat     saturation of the mid-tones (40 <= L <= 140), and their hue, in
             degrees. Our rooms drift to a desaturated blue-grey; the samples'
             mid-tones are plum and umber.
  spread     tile-to-tile value variation over the frame's own level: is
             anything happening across the picture, or is it one gradient.

Samples and captures are compared at the SAME on-screen pixel density -- every
image is scaled to a common height first (default 900, the game's capture
height) -- because tooth and edge width are both measured in pixels and neither
survives a resize.

    python tools/bgmetrics.py --samples                       # the four samples
    python tools/bgmetrics.py shots/b0-combat.png             # one capture
    python tools/bgmetrics.py shots/lm_*_foyer.png --json out.json
    python tools/bgmetrics.py A.png --vs B.png                # side by side
    python tools/bgmetrics.py A.png --box 0,0,1600,430        # one region

`--box` takes x0,y0,x1,y1 in the ORIGINAL image's pixels, applied before the
scale to the common height; use it to measure the part of a screen that is
actually room, with the plates and cards left out.
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "UI")
COMMON_H = 900          # every image is measured at this height
TILE = 32               # flat-tile side, in pixels at COMMON_H
OCTAVES = (0.8, 1.6, 3.2, 6.4, 12.0)

# The samples, and the part of each that is ROOM rather than plate. A box of
# None means the whole image; these were read off the paintings by eye.
SAMPLES = {
    # The whole paintings, and then the patches that are ROOM: a wall with its
    # ornament, and a lit stone floor. The two patches are the references for a
    # background; the whole frames are the references for the level of finish.
    "mainMenu.png":        None,
    "selectCompanion.png": None,
    "selectKid.png":       None,
    "title.png":           None,
}
PATCHES = {
    "kid-floor":  ("selectKid.png", (300, 860, 700, 1060)),    # cobbles, candle, skull
    "kid-wall":   ("selectKid.png", (0, 0, 420, 300)),         # wall, filigree, web, sconce
    "menu-court": ("mainMenu.png", (240, 560, 1160, 940)),     # the lit paving and steps
    "menu-wall":  ("mainMenu.png", (1000, 150, 1560, 560)),    # the house's stonework
    "comp-cell":  ("selectCompanion.png", (35, 145, 215, 300)),  # one painted room cell
}


def load(path, box=None, h=COMMON_H):
    """The crop, at the scale the WHOLE image would be shown at.

    The scale comes from the full image's height, never the crop's: tooth and
    edge width are both measured in pixels, and resizing a 200 px patch to 900
    upscales its fine octave into nothing (measured: kid-floor's 0.8 px octave
    read 0.018 that way and 0.20 at the right scale)."""
    im = Image.open(path).convert("RGB")
    W0, H0 = im.size
    if box:
        im = im.crop(box)
    w, hh = im.size
    if h and H0 != h:
        k = h / H0
        im = im.resize((max(1, int(round(w * k))), max(1, int(round(hh * k)))),
                       Image.LANCZOS)
    return np.asarray(im, np.float32)


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def sat(rgb):
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    return np.where(mx > 1e-3, (mx - mn) / np.maximum(mx, 1e-3), 0.0)


def hue_deg(rgb):
    """Mean hue as a circular mean, weighted by saturation*level."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    c = mx - mn
    h = np.zeros_like(mx)
    with np.errstate(invalid="ignore", divide="ignore"):
        h = np.where(mx == r, ((g - b) / np.maximum(c, 1e-3)) % 6,
            np.where(mx == g, (b - r) / np.maximum(c, 1e-3) + 2,
                             (r - g) / np.maximum(c, 1e-3) + 4)) * 60.0
    return h % 360.0, c


# ── the axes ────────────────────────────────────────────────────────────────
def m_floor(rgb):
    """The darkest decile: how near black does the picture actually go."""
    L = luma(rgb)
    cut = np.percentile(L, 10)
    m = L <= cut
    dark = rgb[m]
    return {
        "minCh": float(np.mean(dark.min(-1))),
        "p1minCh": float(np.percentile(rgb.min(-1), 1)),
        "satShadow": float(np.mean(sat(dark))),
        "L10": float(cut),
    }


def flat_tiles(L, tile=TILE, keep=0.5):
    """Tiles with no form edge in them, as a boolean tile grid plus the tiles.

    A tile is flat when its own gradient energy is in the lower `keep` of all
    tiles. Measuring tooth on tiles that contain an edge measures the edge.
    """
    H, W = L.shape
    ny, nx = H // tile, W // tile
    if ny < 2 or nx < 2:
        return None, None
    g = np.hypot(*np.gradient(ndimage.gaussian_filter(L, 1.2)))
    ge = g[:ny * tile, :nx * tile].reshape(ny, tile, nx, tile).mean((1, 3))
    lv = L[:ny * tile, :nx * tile].reshape(ny, tile, nx, tile).mean((1, 3))
    # only tiles with something to measure: a tile at 0.4/255 has no tooth to
    # find, and its ratio explodes
    # A tile at 4/255 has no tooth to find and its std/level ratio explodes on
    # quantisation alone; a tile at 230 is a blown highlight. Measure the
    # surfaces a viewer can actually see texture in.
    live = (lv >= 10.0) & (lv <= 200.0)
    if live.sum() < 4:
        live = lv >= max(4.0, float(np.percentile(lv, 70)))
    thr = np.percentile(ge[live], keep * 100) if live.any() else 0.0
    flat = live & (ge <= thr)
    return flat, (ny, nx, lv)


def m_tooth(rgb, tile=TILE):
    """High-frequency energy over level, on flat tiles, per octave.

    Per octave sigma s: hp = L - blur(L, s); tooth = std(hp) / mean(L), both
    inside the tile. The ratio is what matters -- a dark wall carrying 1.4/255
    of tooth at level 10 is as toothy as a lit one carrying 14 at level 100.
    """
    L = luma(rgb)
    flat, meta = flat_tiles(L, tile)
    if flat is None or not flat.any():
        return {"flatTiles": 0}
    ny, nx, lv = meta
    out = {"flatTiles": int(flat.sum())}
    per = []
    for s in OCTAVES:
        hp = L - ndimage.gaussian_filter(L, s)
        t = hp[:ny * tile, :nx * tile].reshape(ny, tile, nx, tile)
        sd = t.std((1, 3))
        r = sd[flat] / np.maximum(lv[flat], 1.0)
        per.append(float(np.median(r)))
    out["octaves"] = dict(zip([str(o) for o in OCTAVES], per))
    out["tooth"] = float(np.mean(per))
    out["fine"] = per[0]
    out["flatToothFlatness"] = float(min(per) / max(max(per), 1e-6))
    return out


def _edge_profile(L, n=3):
    """Strong edges, and a profile sampled along each one's own normal.

    Returns (mask, prof) where prof[k] is L sampled k-n .. k+n pixels along the
    gradient direction at every edge pixel.
    """
    Ls = ndimage.gaussian_filter(L, 0.8)
    gy, gx = np.gradient(Ls)
    g = np.hypot(gx, gy)
    thr = np.percentile(g, 97.0)
    mask = g >= max(thr, 0.35)
    if mask.sum() < 200:
        return None, None, None
    ys, xs = np.nonzero(mask)
    ux = gx[ys, xs] / np.maximum(g[ys, xs], 1e-6)
    uy = gy[ys, xs] / np.maximum(g[ys, xs], 1e-6)
    H, W = L.shape
    prof = []
    for k in range(-n, n + 1):
        yy = np.clip(np.round(ys + uy * k).astype(int), 0, H - 1)
        xx = np.clip(np.round(xs + ux * k).astype(int), 0, W - 1)
        prof.append(L[yy, xx])
    return mask, np.stack(prof), g[ys, xs]


def m_edge(rgb):
    """edgeWidth: how many pixels an edge takes to turn over.

    Sum of |dL| along the normal over the largest single step. A hard,
    one-pixel, SDF-thresholded edge gives ~1.1-1.4; a brushed edge spreads the
    same total over 3-4 pixels and gives 2.5-4.
    """
    L = luma(rgb)
    mask, prof, gmag = _edge_profile(L)
    if prof is None:
        return {"edgePx": 0}
    d = np.abs(np.diff(prof, axis=0))
    tot = d.sum(0)
    mx = d.max(0)
    ok = mx > 0.6
    if ok.sum() < 100:
        return {"edgePx": int(mask.sum())}
    return {"edgePx": int(mask.sum()),
            "edgeWidth": float(np.median(tot[ok] / mx[ok]))}


def m_ink(rgb):
    """Does a form's edge carry a line darker than BOTH sides?

    prof is L along the normal; the two ends are the two sides. An ink line is a
    value inside the profile below both ends. Report the share of strong edges
    that have one, and how deep it goes relative to the step.
    """
    L = luma(rgb)
    mask, prof, gmag = _edge_profile(L, n=3)
    if prof is None:
        return {"inkShare": 0.0}
    lo_end = np.minimum(prof[0], prof[-1])
    inner = prof[1:-1].min(0)
    step = np.abs(prof[-1] - prof[0])
    ok = step > 1.0
    if ok.sum() < 100:
        return {"inkShare": 0.0}
    depth = (lo_end[ok] - inner[ok]) / np.maximum(step[ok], 1e-6)
    return {"inkShare": float(np.mean(depth > 0.06)),
            "inkDepth": float(np.median(np.maximum(depth, 0.0)))}


def m_peak(rgb):
    L = luma(rgb)
    med = max(float(np.median(L)), 0.5)
    return {"p995": float(np.percentile(L, 99.5)),
            "peakOverMed": float(np.percentile(L, 99.5) / med),
            "blownPct": float(np.mean(L > 235) * 100.0)}


def m_mid(rgb):
    L = luma(rgb)
    m = (L >= 40) & (L <= 140)
    if m.sum() < 500:
        m = (L >= 18) & (L <= 160)
    if m.sum() < 100:
        return {"midPct": 0.0}
    px = rgb[m]
    h, c = hue_deg(px)
    w = c
    if w.sum() < 1e-3:
        hm = 0.0
    else:
        a = np.average(np.cos(np.deg2rad(h)), weights=w)
        b = np.average(np.sin(np.deg2rad(h)), weights=w)
        hm = float(np.rad2deg(np.arctan2(b, a)) % 360.0)
    return {"midPct": float(m.mean() * 100.0),
            "midSat": float(np.mean(sat(px))),
            "midHue": hm}


def m_spread(rgb, tile=TILE):
    L = luma(rgb)
    H, W = L.shape
    ny, nx = H // tile, W // tile
    lv = L[:ny * tile, :nx * tile].reshape(ny, tile, nx, tile).mean((1, 3))
    return {"tileSpread": float(lv.std() / max(lv.mean(), 1e-3)),
            "colSpread": float(lv.mean(0).std() / max(lv.mean(), 1e-3))}


def m_void(rgb):
    """How much of the frame is PURE BLACK, and how bright the sky band is.

    A pure-black pixel carries no tooth, no drawn line and no ink, so a room
    that hands a third of its frame to rgb(0,0,0) has capped every other axis
    on this table. It also DIVIDES the others away: graveyard reads tooth 0.140
    whole-frame and 0.331 with the sky excluded.

    mainMenu.png is a night sky and holds NO pure black in its top third;
    ours ran 19.7% (graveyard) to 71.5% (the Hedge Maze) on 2026-09-17.
    """
    H = rgb.shape[0]
    blk = rgb.max(-1) <= 0.0
    top = blk[:max(1, int(H * 0.30))]
    band = rgb[:max(1, int(H * 0.14))]
    return {"voidPct": float(blk.mean() * 100.0),
            "voidTop": float(top.mean() * 100.0),
            "skyLevel": float(band.mean())}


AXES = [("floor", m_floor), ("tooth", m_tooth), ("edge", m_edge),
        ("ink", m_ink), ("peak", m_peak), ("mid", m_mid), ("spread", m_spread),
        ("void", m_void)]


def measure(path, box=None, h=COMMON_H):
    rgb = load(path, box, h)
    out = {"path": path, "shape": [int(rgb.shape[1]), int(rgb.shape[0])]}
    for name, fn in AXES:
        out.update(fn(rgb))
    return out


ROW = [("minCh", "minCh", "{:6.2f}"), ("satShadow", "satShd", "{:6.3f}"),
       ("tooth", "tooth", "{:6.3f}"), ("fine", "fine.8", "{:6.3f}"),
       ("edgeWidth", "edgeW", "{:6.2f}"), ("inkShare", "ink%", "{:6.3f}"),
       ("inkDepth", "inkDp", "{:6.3f}"), ("peakOverMed", "pk/med", "{:6.1f}"),
       ("blownPct", "blown%", "{:6.2f}"), ("midSat", "midSat", "{:6.3f}"),
       ("midHue", "midHue", "{:6.0f}"), ("tileSpread", "spread", "{:6.3f}"),
       ("voidPct", "void%", "{:6.2f}"), ("voidTop", "voidT%", "{:6.2f}"),
       ("skyLevel", "skyLvl", "{:6.1f}")]


def table(rows, label_w=30):
    head = "  ".join(k.rjust(6) for _, k, _ in ROW)
    print("name".ljust(label_w) + "  " + head)
    print("-" * (label_w + 2 + len(head)))
    for r in rows:
        cells = []
        for key, _, fmt in ROW:
            v = r.get(key)
            cells.append((fmt.format(v) if v is not None else "     -"))
        print(str(r.get("label", os.path.basename(r["path"])))[:label_w].ljust(label_w)
              + "  " + "  ".join(cells))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="*")
    ap.add_argument("--samples", action="store_true", help="measure UI/*.png")
    ap.add_argument("--patches", action="store_true", help="measure the room patches of UI/*.png")
    ap.add_argument("--box", help="x0,y0,x1,y1 in the source image's pixels")
    ap.add_argument("--h", type=int, default=COMMON_H)
    ap.add_argument("--vs", help="a second image, printed under the first")
    ap.add_argument("--json", help="write every row to this file")
    ap.add_argument("--octaves", action="store_true", help="print the tooth octaves")
    a = ap.parse_args()

    box = tuple(int(v) for v in a.box.split(",")) if a.box else None
    rows = []
    if a.samples:
        for name, sbox in SAMPLES.items():
            p = os.path.join(UI, name)
            if os.path.exists(p):
                r = measure(p, sbox, a.h)
                r["label"] = "UI/" + name
                rows.append(r)
    if a.patches:
        for label, (name, pbox) in PATCHES.items():
            p = os.path.join(UI, name)
            if os.path.exists(p):
                r = measure(p, pbox, a.h)
                r["label"] = "patch/" + label
                rows.append(r)
    paths = []
    for pat in a.images:
        hits = sorted(glob.glob(pat))
        paths.extend(hits if hits else [pat])
    if a.vs:
        paths.append(a.vs)
    for p in paths:
        if not os.path.exists(p):
            print("missing:", p, file=sys.stderr)
            continue
        rows.append(measure(p, box, a.h))
    if not rows:
        ap.error("nothing to measure")
    table(rows)
    if a.octaves:
        print()
        ks = [str(o) for o in OCTAVES]
        print("octaves".ljust(30) + "  " + "  ".join(k.rjust(6) for k in ks))
        for r in rows:
            o = r.get("octaves") or {}
            print(str(r.get("label", os.path.basename(r["path"])))[:30].ljust(30)
                  + "  " + "  ".join("{:6.3f}".format(o.get(k, 0)) for k in ks))
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=1)
        print("\nwrote", a.json)


if __name__ == "__main__":
    main()
