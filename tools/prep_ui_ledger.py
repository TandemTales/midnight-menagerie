"""Render the fittings of round 5's DIALOGS pass: the house's ledger and its trick case.

Settings is a ledger the house keeps and the pile viewer is the case its Tricks
are laid out in. What they are made of that the kit did not already have is
drawn here, with `tools/prep_ui_materials.py`'s plumbing (height fields lit from
the boards' top left, the brass ramp measured off the samples, an ink outline),
in the samples' aubergine and antique gold:

  case-slot.webp      one Trick's place in the case: a recess pressed into the
                      case's velvet with a gilt bead round its lip, the bevel
                      falling away into the dark on the lit side and catching
                      the candle on the far one, the floor in the rim's shadow.
                      A 9-slice (slices 40, repeat stretch) drawn at twice the
                      size it is shown, so its rim stays crisp

    python tools/prep_ui_ledger.py                 # everything
    python tools/prep_ui_ledger.py --only slot     # one piece while tuning
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (the materials' plumbing)

OUT = M.OUT
ramp, smooth, normals, lambert, specular, brass, down, save = (
    M.ramp, M.smooth, M.normals, M.lambert, M.specular, M.brass, M.down, M.save)
periodic_noise = M.periodic_noise
INK = np.array([12, 8, 5], np.float32)

VELVET = [(0.0, "#07040a"), (0.3, "#130b1a"), (0.55, "#241532"), (0.8, "#3b2450"), (1.0, "#5a3a72")]


def rounded_box_distance(h, w, margin, radius):
    """Signed distance to a rounded rectangle inset by `margin` (px, >0 inside)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    cx, cy = w / 2, h / 2
    hx, hy = w / 2 - margin - radius, h / 2 - margin - radius
    qx = np.abs(xx - cx) - hx
    qy = np.abs(yy - cy) - hy
    outside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    inside = np.minimum(np.maximum(qx, qy), 0)
    return -(outside + inside - radius)


def slot():
    """A Trick's slot in the case, supersampled 3x then brought down."""
    ss = 3
    W, H = 176, 224                                  # the painting at 1x; slices 40
    w, h = W * ss, H * ss
    rng = np.random.default_rng(5150)
    d = rounded_box_distance(h, w, margin=5 * ss, radius=20 * ss)   # >0 inside the well's outline
    rim_w, bevel_w = 9 * ss, 19 * ss

    # the height field: a gilt bead standing on the lip, then the velvet falling
    # into the recess over the bevel, then the floor
    t_rim = np.clip(d / rim_w, 0, 1)
    bead = np.where((d > 0) & (d < rim_w), np.clip(np.sin(t_rim * np.pi), 0, 1) ** 0.8, 0.0)
    t_bev = np.clip((d - rim_w) / bevel_w, 0, 1)
    fall = -smooth(0.0, 1.0, t_bev) * 1.0
    height = bead * 1.1 * ss + np.where(d >= rim_w, fall * 7.5 * ss, 0.0)

    nap = periodic_noise(256, rng, beta=1.1, lo_cut=6)
    nap = np.kron(nap, np.ones((3, 3), np.float32))
    nap = np.tile(nap, (h // nap.shape[0] + 1, w // nap.shape[1] + 1))[:h, :w]
    n = normals(height + nap * 0.35 * ss * (d > rim_w), strength=1.0)

    # the velvet under the board's light: lit slopes (the far walls) rise, the
    # near walls sink; the floor is in the rim's cast shadow along its top left
    lit = lambert(n)
    inside = d > rim_w
    shadow_src = ndimage.shift((d > rim_w * 0.5).astype(np.float32), (-4.5 * ss, -4.5 * ss), order=1, mode="constant")
    cast = ndimage.gaussian_filter(1.0 - shadow_src, 4.0 * ss) * (d > rim_w + bevel_w * 0.3)
    v = np.clip(0.26 + (lit - 0.66) * 2.3 - cast * 0.3 + nap * 0.07, 0, 1)
    # the floor itself: a soft candle pool low in the middle, darker at the walls
    depth = smooth(0.0, 1.0, t_bev)
    v = v * (0.75 + 0.25 * (1 - depth)) + depth * 0.06
    velvet = ramp(v, VELVET)

    # antique, not new: the gilt rubbed back to the dark metal in places and
    # its highlight broken up, the way the boards' rails are
    wear = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), 5 * ss)
    wear /= np.abs(wear).max() + 1e-6
    grit = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), 0.8 * ss)
    grit /= np.abs(grit).max() + 1e-6
    gilt = brass(n, wear=wear * 1.4 + grit * 0.5, spec_amt=0.7, lift=-0.04)
    gilt = gilt * (0.86 + 0.14 * smooth(-0.3, 0.6, wear))[..., None]
    col = np.where((d < rim_w)[..., None], gilt, velvet)

    # the ink outline round the lip, as every painted edge on the boards has
    mask = d > 0
    edge = mask & ~ndimage.binary_erosion(mask, iterations=int(1.2 * ss))
    col = np.where(edge[..., None], INK, col)
    inner = (d > rim_w - 0.6 * ss) & (d < rim_w + 0.6 * ss)
    col = np.where(inner[..., None], col * 0.55, col)

    alpha = np.clip(d / (1.0 * ss) + 0.5, 0, 1)
    # the case's own shadow round the lip, soft, below and right
    shade = ndimage.gaussian_filter(ndimage.shift(mask.astype(np.float32), (2.5 * ss, 2 * ss), order=1), 3.0 * ss)
    a_out = np.maximum(alpha, shade * 0.5)
    col = np.where((alpha < 0.5)[..., None], np.zeros(3, np.float32), col)
    rgba = np.dstack([down(col, ss), down(a_out, ss) * 255])
    save(rgba, "case-slot.webp", 92)


def ribbon_crimson():
    """The kit's gold ribbon banner dyed the house's sealing wax (round 5's
    CLOVE, `ui/r5-dialogs-c`). The painting's own value is what is re-mapped, so
    every fold, every cast shadow and the swallowtail notches survive; only the
    silk changes colour. The gilt stars at its ends and the lit lip of each fold
    keep their brass, or the banner reads as a flat red shape."""
    src = np.asarray(Image.open(os.path.join(OUT, "ribbon.webp")).convert("RGBA")).astype(np.float32)
    rgb, a = src[..., :3], src[..., 3]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32) / 255.0
    lo, hi = np.percentile(lum[a > 128], [2, 99.5])
    t = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    red = ramp(t, [(0.0, "#1a0305"), (0.3, "#4a0c10"), (0.55, "#7c1a19"), (0.78, "#a8392c"), (1.0, "#e0886a")])
    sat = (rgb.max(axis=2) - rgb.min(axis=2)) / np.maximum(rgb.max(axis=2), 1)
    keep = smooth(0.78, 0.95, t) * smooth(0.3, 0.5, sat)
    col = red * (1 - keep[..., None]) + rgb * keep[..., None]
    save(np.dstack([col, a]), "ribbon-crimson.webp", 92)


WAX = [(0.0, "#0e0102"), (0.3, "#34060a"), (0.55, "#5a0e10"),
       (0.75, "#801b1a"), (0.9, "#a8342c"), (1.0, "#d8705a")]


def seal():
    """A blob of oxblood sealing wax pressed with the house's skull (round 5's
    ALDER, `ui/r5-dialogs-a`): an uneven rim where the wax spread, the sunken
    ring the stamp's edge left, the skull standing proud on the pressed face,
    glossy where the board's light off the top left catches it. The one page
    whose action cannot be undone is SEALED, not filled in red."""
    W = H = 128
    ss = 4
    rng = np.random.default_rng(23)
    n = W * ss
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / ss
    cx = cy = W / 2
    ang = np.arctan2(yy - cy, xx - cx)
    rad = np.hypot(xx - cx, yy - cy)
    # the spread of the wax: a wobbling edge, a few low lobes
    wob = (np.sin(ang * 3 + 0.7) * 2.1 + np.sin(ang * 5 + 2.1) * 1.4 + np.sin(ang * 8 + 4.0) * 0.8)
    edge = 52 + wob
    inside = rad < edge
    d_edge = np.clip(edge - rad, 0, None)
    # height: a rounded bead at the spread edge, a flat pressed face inside
    body = np.sqrt(np.clip(d_edge / 9.0, 0, 1)) * 7.0
    ring_r = 36.0
    ring = np.exp(-((rad - ring_r) / 1.6) ** 2) * 2.6
    face = np.where(rad < ring_r - 1.5, 1.2, 0.0)
    hgt = body - ring - face
    # the skull, raised on the stamped face
    im = Image.new("L", (n, n), 0)
    dr = ImageDraw.Draw(im)
    S = lambda v: v * ss                                             # noqa: E731
    dr.ellipse([S(cx - 17), S(cy - 22), S(cx + 17), S(cy + 10)], fill=255)
    dr.rounded_rectangle([S(cx - 10), S(cy + 2), S(cx + 10), S(cy + 19)], radius=S(4), fill=255)
    for ex in (-8, 8):
        dr.ellipse([S(cx + ex - 5.2), S(cy - 9), S(cx + ex + 5.2), S(cy + 1.5)], fill=0)
    dr.polygon([S(cx), S(cy + 2), S(cx - 2.8), S(cy + 8), S(cx + 2.8), S(cy + 8)], fill=0)
    for tx in (-5.5, 0, 5.5):
        dr.rectangle([S(cx + tx - .7), S(cy + 11.5), S(cx + tx + .7), S(cy + 18)], fill=0)
    skull = ndimage.gaussian_filter(np.asarray(im, np.float32) / 255.0, ss * 0.6)
    hgt = hgt + skull * 5.6
    hgt = np.where(inside, hgt, 0) * ss
    hgt = ndimage.gaussian_filter(hgt, ss * 0.5)
    nrm = normals(hgt, 0.9)
    lit = lambert(nrm)
    t = np.clip(-0.02 + lit * 0.74, 0, 1) ** 1.1
    col = ramp(t, WAX)
    col = col * (1 + M.noise(hgt.shape, rng, ss * 3) * 0.06)[..., None]
    spec = specular(nrm, power=38.0)
    col = col + spec[..., None] * np.array([255, 205, 180], np.float32) * 0.42
    cut = np.clip(-ndimage.laplace(ndimage.gaussian_filter(hgt, ss * 0.7)) * 1.3, 0, 1)
    col = col * (1 - cut[..., None] * 0.75)
    alpha = np.clip(d_edge * ss / (ss * 1.2), 0, 1)
    edge_ink = smooth(0.0, 1.4, d_edge)
    col = col * edge_ink[..., None] + np.array([20, 3, 4], np.float32) * (1 - edge_ink[..., None])
    col = down(col, ss)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), np.float32)
    save(np.dstack([col, alpha]), "wax-seal.webp", 92)


PIECES = {
    "slot": slot,
    "ribbon": ribbon_crimson,
    "seal": seal,
}


def main():
    ap = argparse.ArgumentParser(description="Render the ledger's and the trick case's fittings.")
    ap.add_argument("--only", default="", help="comma-separated piece names: " + ", ".join(PIECES))
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("ledger ->", os.path.relpath(OUT, M.ROOT))
    for nm in names:
        PIECES[nm]()


if __name__ == "__main__":
    main()
