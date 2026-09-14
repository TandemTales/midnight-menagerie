"""The pieces the Kids' places hang on their walls: a carved frame and a lamp.

Round 2's judges asked the Clubhouse's investigation board for "a real gilt or
carved frame with corner mounts" and for HAZE's hanging lamp over it. Both are
built here from the kit's own painted pieces, with the kit's renderer
(`tools/prep_ui_materials.py`), so they are lit and inked by the same hand as
everything else on the boards.

Outputs (game/assets/ui/kit/):

  frame-carved.webp  a picture frame's moulding as a border-image 9-slice:
                     the Shop ledge's own walnut, gilt beads and egg-and-dart
                     (ledge.webp, painted by prep_ui_polish.py), mitred at the
                     corners, with a cast brass mount riveted over each mitre.
                     116px rail, a 160px middle that tiles (4 eggs), so
                     `border-image: ... 116 / <w> round`   (.kit-carved)
  lamp.webp          the Clubhouse's hanging enamel lamp: a purple enamel
                     shade on a cord, a brass fitting, the bulb burning under
                     its rim. HAZE's (ui/r2-expand2-b, tools/prep_ui_stage.py),
                     re-rendered here unchanged but for the kit's brass.
                                                                    (.kit-lamp)

    python tools/prep_kids_places.py            # everything
    python tools/prep_kids_places.py --only frame
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  the kit's own renderer

OUT = M.OUT
ramp, noise, smooth, normals, lambert, down, brass, save = (
    M.ramp, M.noise, M.smooth, M.normals, M.lambert, M.down, M.brass, M.save)


# ── the carved frame ─────────────────────────────────────────────────────────
PERIOD = 40          # ledge.webp's egg-and-dart repeats every 40px and wraps at 1080
MID = PERIOD * 4     # the 9-slice's middle: four eggs, so `round` keeps them whole


def moulding_strip():
    """The frame's profile, outer edge first, cut from the ledge's painting.

    ledge.webp is a shelf seen from the front: a lit walnut top (rows 0-28), a
    gilt bead (29-34), a dark groove, the egg-and-dart band (44-100), a second
    gilt bead (101-104), a cove (105-115) and its shadow. A picture frame is
    the same carving turned to face you: an outer gilt bead and ink edge, the
    walnut flat, the carved band between its two beads, a cove falling in
    towards the picture and a thin gilt sight edge where it meets it.
    """
    led = np.asarray(Image.open(os.path.join(OUT, "ledge.webp")).convert("RGB"), np.float32)
    bead = led[29:34]
    ink = np.zeros((3, led.shape[1], 3), np.float32) + np.array([14, 9, 5], np.float32)
    parts = [
        ink,                         # the frame's outer arris, in the samples' ink
        bead,                        # outer gilt bead
        led[14:28] * 0.92,           # the walnut flat
        led[28:106],                 # bead, groove, egg-and-dart, bead, groove
        led[106:114] * 0.9,          # the cove falling in to the picture
        bead * 0.86,                 # the gilt sight edge
        ink[:2],
    ]
    return np.concatenate(parts, axis=0)          # (T, 1080, 3)


def corner_mount(T, ss=3):
    """A cast brass corner mount for the top-left mitre, RGBA T x T.

    A quarter plate with a scalloped inner edge and a spear tip pointing in
    along the mitre, a raised bevelled rim, a domed boss where the mitre meets
    the outer corner and two rivets, lit from the top left and inked round.
    """
    rng = np.random.default_rng(1207)
    S = T * ss
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / ss
    R = T * 0.64                                   # reach of the plate along each rail
    arm = T * 0.30                                  # how far in from the outer edge it covers
    # the plate: two arms along the rails, joined over the corner, their ends
    # rounded, the inner corner cut in a scallop, a spear along the diagonal
    top_arm = (yy <= arm) & (xx <= R)
    left_arm = (xx <= arm) & (yy <= R)
    ends = (np.hypot(xx - R, yy - arm / 2) <= arm / 2) | (np.hypot(xx - arm / 2, yy - R) <= arm / 2)
    square = (xx <= arm * 1.55) & (yy <= arm * 1.55)
    scallop = np.hypot(xx - arm * 1.55, yy - arm * 1.55) <= arm * 0.55
    d = (xx + yy) / np.sqrt(2)                      # distance along the mitre
    off = np.abs(xx - yy) / np.sqrt(2)              # distance across it
    spear = (d <= T * 0.86) & (off <= np.clip((T * 0.86 - d) * 0.42, 0, arm * 0.36))
    plate = (top_arm | left_arm | ends | square) & ~scallop | spear
    plate &= (xx >= 1.2) & (yy >= 1.2)
    dist = ndimage.distance_transform_edt(plate) / ss
    rim = 3.2
    h = np.where(plate, np.where(dist < rim, np.sqrt(np.clip(1 - (1 - dist / rim) ** 2, 0, 1)) * 4.0 + 1.5,
                                 5.5 - 1.2 * smooth(rim, rim + 8, dist)), 0)
    # an engraved line following the rim
    groove = plate & (np.abs(dist - (rim + 3.0)) < 0.7)
    h = h - groove * 1.4
    # the boss over the mitre's outer corner, and two rivets on the arms
    bx = by = arm * 0.78
    bd = np.hypot(xx - bx, yy - by)
    br = arm * 0.62
    h = np.maximum(h, np.where(bd <= br, 5 + np.sqrt(np.clip(1 - (bd / br) ** 2, 0, 1)) * 7, 0))
    for rx, ry in ((R * 0.93, arm * 0.5), (arm * 0.5, R * 0.93)):
        rd = np.hypot(xx - rx, yy - ry)
        h = np.maximum(h, np.where(rd <= 3.4, 6 + np.sqrt(np.clip(1 - (rd / 3.4) ** 2, 0, 1)) * 3, 0))
    h = ndimage.gaussian_filter(h, ss * 0.45)
    n = normals(h * ss, 0.9)
    wear = noise((S, S), rng, ss * 2.5)
    col = brass(n, wear=wear, spec_amt=0.7, lift=-0.04)
    mask = plate | (bd <= br)
    # ink round the silhouette and round the boss, as the samples outline metal
    e = ndimage.distance_transform_edt(mask) / ss
    col = col * (0.35 + 0.65 * smooth(0.0, 1.6, e))[..., None]
    ring = (np.abs(bd - br) < 0.9)
    col = np.where(ring[..., None], col * 0.5, col)
    # its shadow on the moulding, down and to the right
    sh = ndimage.shift(mask.astype(np.float32), (2.2 * ss, 2.6 * ss), order=1)
    sh = ndimage.gaussian_filter(sh, 2.2 * ss) * 0.62
    a = np.maximum(mask.astype(np.float32), sh)
    col = np.where(mask[..., None], col, 0)
    return down(col, ss), down(mask.astype(np.float32), ss), down(a, ss)


def frame_carved():
    strip = moulding_strip()
    T = strip.shape[0]
    W = H = 2 * T + MID
    out = np.zeros((H, W, 3), np.float32)
    ys, xs = np.mgrid[0:H, 0:W]
    # each pixel's depth from its nearest outer edge decides which rail it is
    top, bottom, left, right = ys, H - 1 - ys, xs, W - 1 - xs
    depth = np.minimum.reduce([top, bottom, left, right])
    side = np.argmin(np.stack([top, bottom, left, right]), axis=0)   # 0 t, 1 b, 2 l, 3 r
    along = np.where(side < 2, xs, ys)
    row = np.clip(depth, 0, T - 1)
    col_i = along % strip.shape[1]
    px = strip[row, col_i]
    # the room's candle is over the top left: the rails facing it catch it
    light = np.array([1.06, 0.66, 0.9, 0.74], np.float32)[side]
    px = px * light[..., None]
    inside = depth < T
    out = np.where(inside[..., None], px, 0)
    # the mitres: a fine dark joint along each diagonal
    for cx, cy, sx, sy in ((0, 0, 1, 1), (W - 1, 0, -1, 1), (0, H - 1, 1, -1), (W - 1, H - 1, -1, -1)):
        u = (xs - cx) * sx
        v = (ys - cy) * sy
        joint = (np.abs(u - v) <= 0.8) & (u < T) & (v < T)
        out = np.where(joint[..., None], out * 0.35, out)
    alpha = inside.astype(np.float32)
    rgba = np.dstack([out, alpha * 255])
    # the brass mounts over the four mitres
    mc, mm, ma = corner_mount(T)
    tl = np.dstack([mc, ma * 255])
    im = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    shadow_rgb = np.zeros_like(mc)
    for flip_x, flip_y, lx, ly in ((False, False, 0, 0), (True, False, W - T, 0),
                                   (False, True, 0, H - T), (True, True, W - T, H - T)):
        c, m, a = mc, mm, ma
        if flip_x:
            c, m, a = c[:, ::-1], m[:, ::-1], a[:, ::-1]
        if flip_y:
            c, m, a = c[::-1], m[::-1], a[::-1]
        # the mount's shading stays lit from the top left whichever corner it is on
        k = 1.0 - 0.12 * flip_x - 0.2 * flip_y
        piece = np.dstack([np.where(m[..., None] > 0.02, c * k / np.maximum(m[..., None], 1e-3), shadow_rgb), a * 255])
        im.alpha_composite(Image.fromarray(np.clip(piece, 0, 255).astype(np.uint8), "RGBA"), (lx, ly))
    save(np.asarray(im), "frame-carved.webp", 90)
    return T


# ── the nameplate ────────────────────────────────────────────────────────────
def nameplate():
    """A wing's nameplate, for two lines of engraved caps.

    The kit's enamel cartouche (prep_ui_materials.cartouche_piece) is a glossy
    lozenge sized for one word. This is its bigger, quieter cousin, drawn after
    the wordmark's cartouche on UI/title.png: a matte plum field that takes
    the room's light rather than a gloss, a brass rod rim with a fine gilt line
    set inside it across a dark channel, notched corners with a bead at each
    notch and gently bowed ends. 300x130; slice 44 / 60 for a border-image."""
    W, H, ss = 300, 130, 4
    rng = np.random.default_rng(1310)
    m = 3.0
    yT, yB = m, H - m
    rn = (yB - yT) * 0.17
    b = (yB - yT) * 0.12
    xL, xR = m + b, W - m - b
    bead = (yB - yT) * 0.05

    def draw(dr, s):
        S = lambda v: v * s
        dr.rectangle([S(xL), S(yT), S(xR), S(yB)], fill=255)
        for cx, cy in ((xL, yT), (xR, yT), (xL, yB), (xR, yB)):
            dr.ellipse([S(cx - rn), S(cy - rn), S(cx + rn), S(cy + rn)], fill=0)
        cy = (yT + yB) / 2
        hh = (yB - yT) / 2 - rn
        for cx in (xL, xR):
            dr.ellipse([S(cx - b), S(cy - hh), S(cx + b), S(cy + hh)], fill=255)
        dr.rectangle([S(xL), S(cy - hh), S(xR), S(cy + hh)], fill=255)
        for px, py in ((xL + rn, yT), (xR - rn, yT), (xL + rn, yB), (xR - rn, yB),
                       (xL, yT + rn), (xR, yT + rn), (xL, yB - rn), (xR, yB - rn)):
            dr.ellipse([S(px - bead), S(py - bead), S(px + bead), S(py + bead)], fill=255)

    big, small = M.mask_from_draw(W, H, draw, ss)
    inside = big > 0.5
    d = M.inside_distance(inside) / ss
    rimw = 6.4
    t = np.clip(d / rimw, 0, 1)
    rod = np.where(d < rimw, np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)), 0)
    line_c = rimw + 5.2                              # the fine inner gilt line
    line = np.clip(1 - np.abs(d - line_c) / 1.25, 0, 1)
    channel = (d >= rimw) & (d < line_c - 1.2)
    height = (rod * rimw * 0.9 + line * 1.6) * ss
    height = ndimage.gaussian_filter(height, ss * 0.45)
    n = normals(height, 1.0)
    wear = noise(height.shape, rng, ss * 2.5)
    metal = brass(n, wear=wear, lift=-0.02)
    # the field: plum enamel gone matte with age, mottled, lit from above
    yy = np.arange(H * ss, dtype=np.float32)[:, None] / (H * ss)
    xx = np.arange(W * ss, dtype=np.float32)[None, :] / (W * ss)
    lightf = np.exp(-(((xx - 0.5) / 0.62) ** 2 + ((yy - 0.1) / 0.75) ** 2))
    en = ramp(np.clip(lightf, 0, 1), [(0.0, "#0e0913"), (0.45, "#1f1529"), (1.0, "#3a2a4a")])
    mott = noise(height.shape, rng, ss * 7) * 0.12 + noise(height.shape, rng, ss * 1.1) * 0.06
    en = en * (1 + mott[..., None])
    en = en * (0.55 + 0.45 * smooth(line_c, line_c + 16, d))[..., None]
    col = np.where((d < rimw)[..., None], metal, en)
    col = np.where((line > 0.05)[..., None], metal * line[..., None] + col * (1 - line[..., None]), col)
    ink = np.array([14, 9, 5], np.float32)
    col = np.where(channel[..., None], col * 0.35 + ink * 0.4, col)
    edge = smooth(0.0, 1.1, d)
    col = col * edge[..., None] + ink * (1 - edge[..., None])
    col = down(col, ss)
    save(np.dstack([col, small * 255]), "nameplate.webp", 92)


# ── the lamp (HAZE's) ────────────────────────────────────────────────────────
def lamp():
    """An enamel shade on a cloth cord, its bulb burning under the brass rim."""
    rng = np.random.default_rng(8)
    W, H, ss = 300, 460, 3
    Ws, Hs = W * ss, H * ss
    yy, xx = np.mgrid[0:Hs, 0:Ws].astype(np.float32) / ss
    cx = W / 2
    col = np.zeros((Hs, Ws, 3), np.float32)
    a = np.zeros((Hs, Ws), np.float32)
    cord = (np.abs(xx - cx) < 3.2) & (yy < 250)
    col = np.where(cord[..., None], np.array([22, 18, 18], np.float32) + (np.abs(xx - cx - 1) < 1)[..., None] * 30, col)
    a = np.maximum(a, cord.astype(np.float32))
    fit = (np.abs(xx - cx) < 18) & (yy >= 238) & (yy < 282)
    fu = np.clip((xx - (cx - 18)) / 36, 0, 1)
    fshade = np.sqrt(np.clip(1 - (2 * fu - 1) ** 2, 0, 1))
    brass_c = ramp(np.clip(0.2 + fshade * 0.75 - (fu - 0.35) ** 2, 0, 1), [(0, "#2a1d10"), (0.5, "#8a6a3a"), (1, "#f0d9a0")])
    col = np.where(fit[..., None], brass_c, col)
    a = np.maximum(a, fit.astype(np.float32))
    top, bot = 278.0, 392.0
    ty = np.clip((yy - top) / (bot - top), 0, 1)
    half = 26 + (116 - 26) * (ty ** 1.35)
    shade = (yy >= top) & (yy <= bot) & (np.abs(xx - cx) <= half)
    u = np.clip((xx - cx) / np.maximum(half, 1), -1, 1)
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    lam = np.clip(-0.5 * u + 0.2 + 0.75 * nz * 0.6, 0, 1)
    wear = noise((Hs, Ws), rng, 2.5 * ss) * 0.08 + noise((Hs, Ws), rng, 0.8 * ss) * 0.05
    enamel = ramp(np.clip(lam * 0.9 + ty * 0.1 + wear, 0, 1), [(0, "#0f0914"), (0.45, "#2a1b38"), (0.8, "#47325d"), (1, "#8a70a6")])
    chips = (noise((Hs, Ws), rng, 1.2 * ss) > 0.62) & (ty > 0.55)
    enamel = np.where(chips[..., None], np.array([34, 30, 30], np.float32), enamel)
    streak = np.exp(-(((u + 0.45) / 0.1) ** 2)) * (1 - ty * 0.6) * 0.32
    enamel = enamel + streak[..., None] * np.array([200, 180, 230], np.float32)
    col = np.where(shade[..., None], enamel, col)
    a = np.maximum(a, shade.astype(np.float32))
    rim_y = bot
    rim = (np.abs(yy - rim_y) < 6) & (np.abs(xx - cx) <= 120)
    ru = np.clip((xx - (cx - 120)) / 240, 0, 1)
    rim_c = ramp(np.clip(0.25 + 0.7 * np.sin(ru * np.pi) - np.abs(yy - rim_y + 2) / 12, 0, 1), [(0, "#2a1d10"), (0.55, "#9a7842"), (1, "#f4dea8")])
    bulb_d = np.hypot((xx - cx) / 34, (yy - (rim_y + 6)) / 22)
    bulb = (bulb_d < 1) & (yy > rim_y)
    bulb_c = ramp(np.clip(1 - bulb_d, 0, 1), [(0, "#ffb35c"), (0.5, "#ffe0a0"), (1, "#fffbef")])
    mouth = (np.hypot((xx - cx) / 116, (yy - rim_y) / 14) < 1) & (yy > rim_y - 14)
    inside = ramp(np.clip(1 - np.hypot((xx - cx) / 116, (yy - rim_y) / 14), 0, 1), [(0, "#c98a45"), (1, "#fff1cf")])
    col = np.where(mouth[..., None], inside, col)
    a = np.maximum(a, mouth.astype(np.float32))
    col = np.where(bulb[..., None], bulb_c, col)
    a = np.maximum(a, bulb.astype(np.float32))
    col = np.where(rim[..., None], rim_c, col)
    a = np.maximum(a, rim.astype(np.float32))
    edge = ndimage.gaussian_filter(a, 1.2 * ss)
    inkm = np.clip((a - edge) * 3.0, 0, 1) * (1 - bulb)
    col = col * (1 - inkm[..., None] * 0.8)
    col = down(col, ss)
    a = down(a, ss)
    save(np.dstack([col, a * 255]), "lamp.webp", 92)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["frame", "lamp", "nameplate"])
    a = ap.parse_args()
    if a.only in (None, "frame"):
        frame_carved()
    if a.only in (None, "lamp"):
        lamp()
    if a.only in (None, "nameplate"):
        nameplate()


if __name__ == "__main__":
    main()
