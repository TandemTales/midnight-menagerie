"""Cut and paint the pieces round 5's POLISH pass (SABLE, "the focal points") needs.

Round 4's judges said the same thing about four boards in four ways: there was
nothing on them the eye went to first. Mr. Moth was a small round medallion at
the end of his own shelf; Game Over's middle was a pile-up; the fort had no
name; the Curiosity's page had no heading of its own. A focal point is a thing
made at the size and finish of the hero of a painting, so this script makes
those things, the way tools/prep_ui_kit.py makes the rest of the kit: out of
Josh's own paintings where a painting has the piece, and in their manner where
it does not.

  from UI/selectKid.png
  mirror-tall.webp     the Kid board's tall mirror frame, its moon medallion on
                       top and its paw below, emptied and keyed off the board
                       (BASALT's cut, ui/r4-polish-b). Mr. Moth stands in it at
                       the head of his shelf (.kit-mirror).
  painted
  moth-portrait.webp   Mr. Moth himself, painted for the mirror's glass: a tall,
                       soft, dusty moth in a shopkeeper's coat, his wings folded
                       down his back, holding the lamp that keeps the market
                       findable low in front of him, so that he is lit from
                       below and warm against the dark shop behind him. Big
                       glossy eyes with the lamp in them, the way every
                       creature on UI/selectCompanion.png is painted.
  rosette.webp         a cast brass boss capping a rail's end, an eight-point
                       star struck up out of its dome (.kit-rosette)
  initial-illum.webp   the ground of an illuminated initial: a bevelled gilt
                       frame with a knot at each corner round violet enamel
                       with a raised vine scroll (the Curiosity's register)

Everything keyed is unmixed from the painting's own near-black ground, as
prep_ui_kit.py does, so a piece laid back onto a dark board reproduces the
painting instead of going muddy.

    python tools/prep_ui_focal.py                 # everything
    python tools/prep_ui_focal.py --only moth     # one piece: mirror, moth, rosette, initial
    python tools/prep_ui_focal.py --preview DIR   # also write PNG previews
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (the materials' plumbing)

OUT = M.OUT
UI = M.UI
ramp, smooth, noise, hexc = M.ramp, M.smooth, M.noise, M.hexc
normals, lambert, specular, down = M.normals, M.lambert, M.specular, M.down
PREVIEW = None


def save(arr, name, quality=90, lossless=False):
    path = M.save(arr, name, quality, lossless)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        a = np.clip(np.nan_to_num(arr), 0, 255).astype(np.uint8)
        Image.fromarray(a).save(os.path.join(PREVIEW, os.path.splitext(name)[0] + ".png"))
    return path


def sample(name):
    return np.asarray(Image.open(os.path.join(UI, name)).convert("RGB")).astype(np.float32)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def unmix(rgb, alpha, bg):
    a = np.clip(alpha, 1e-3, 1.0)[..., None]
    return np.clip((rgb - (1.0 - a) * np.asarray(bg, np.float32)) / a, 0, 255)


# ── the Kid board's mirror ───────────────────────────────────────────────────
def mirror_cut():
    """selectKid's mirror frame, x 326..682, y 228..952 of the 1448x1086 board.

    The frame is keyed on luminance against the board's near-black ground; the
    black glass inside it keys out with the ground, so whatever the frame holds
    shows through. Three things touch its box and are cut away by hand: the
    skull on its books at the lower left, the candle at the lower right, the end
    of the CHOOSE YOUR KID ribbon over its finial, and the rules of the panels
    either side of it. (BASALT's cut, round 4.)"""
    X0, Y0, X1, Y1 = 326, 226, 684, 952
    rgb = sample("selectKid.png")[Y0:Y1, X0:X1].copy()
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx, sy = xx + X0, yy + Y0

    L = lum(rgb)
    violet = np.clip((rgb[..., 2] - rgb[..., 1] - 6.0) / 14.0, 0, 1) * np.clip((L - 14.0) / 10.0, 0, 1)
    alpha = np.maximum(np.clip((L - 17.0) / (44.0 - 17.0), 0, 1) ** 0.85, violet)

    cut = np.zeros((h, w), bool)
    cut |= sx < 329
    cut |= sx > 679
    cut |= sy < 235
    cut |= (sx < 366) & (sy < 292)
    cut |= (sx > 533) & (sy < 252)
    cut |= (np.hypot((sx - 350) / 40, (sy - 858) / 40) < 1.0)
    cut |= (sx < 424) & (sy > 882)
    cut |= (sx > 609) & (sy > 828)
    cut |= sy > 946
    alpha = np.where(cut, 0.0, alpha)
    alpha = np.minimum(alpha, ndimage.gaussian_filter((~cut).astype(np.float32), 1.2) * 1.15)

    dark, _ = ndimage.label(L < 14.0)
    gid = dark[550 - Y0, 500 - X0]
    glass = ndimage.binary_dilation(dark == gid, iterations=1)
    alpha = np.where(glass, 0.0, alpha)

    solid = alpha > 0.08
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, index=np.arange(1, n + 1))
        keep = np.isin(lab, 1 + np.where(sizes >= 180)[0])
        keep = ndimage.binary_dilation(keep, iterations=2)
        alpha = np.where(keep, alpha, 0.0)

    col = unmix(rgb, alpha, (6, 4, 7))
    col = np.clip(col * np.array([1.06, 1.03, 0.98], np.float32) + 4, 0, 255)
    out = np.dstack([col, np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    ys, xs = np.where(out[..., 3] > 6)
    oy, ox = max(0, ys.min() - 2), max(0, xs.min() - 2)
    out = out[oy:ys.max() + 3, ox:xs.max() + 3]
    return out, glass[oy:ys.max() + 3, ox:xs.max() + 3]


def mirror():
    out, glass = mirror_cut()
    gy, gx = np.where(glass)
    save(out, "mirror-tall.webp", 92)
    print("  mirror %dx%d; the glass in the file: x %d..%d, y %d..%d"
          % (out.shape[1], out.shape[0], gx.min(), gx.max(), gy.min(), gy.max()))


# ── Mr. Moth, painted for the mirror ─────────────────────────────────────────
# A tiny lit-layer painter. Every part of him is a soft silhouette (a signed
# distance, roughened where it is fur) with a height field over it; each layer
# is lit by his lamp as a point light in front of him, by a violet ambient from
# the shop, and by a cold rim of moonlight from behind and above, then laid
# over what is behind it. The whole picture then gets the kit's painterly pass
# (prep_ui_materials.painterly) so no gradient reads as a render.

class Canvas:
    def __init__(self, W, H, ss, rng):
        self.W, self.H, self.ss, self.rng = W, H, ss, rng
        yy, xx = np.mgrid[0:H * ss, 0:W * ss].astype(np.float32)
        self.x = (xx + 0.5) / ss            # in 1x units of the glass
        self.y = (yy + 0.5) / ss
        self.col = np.zeros((H * ss, W * ss, 3), np.float32)
        self.shape = (H * ss, W * ss)

    def noise(self, sigma, amp=1.0):
        """Smooth noise with `sigma` in 1x px."""
        return noise(self.shape, self.rng, sigma * self.ss, amp)

    def over(self, rgb, a):
        a = np.clip(a, 0, 1)[..., None]
        self.col = self.col * (1 - a) + rgb * a


def cover(sdf, soft):
    """Coverage of a signed distance (negative inside), soft over `soft` px."""
    return np.clip(0.5 - sdf / max(soft, 1e-3), 0, 1)


def ellipse_sdf(x, y, cx, cy, rx, ry, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    dx, dy = x - cx, y - cy
    u, v = dx * c + dy * s, -dx * s + dy * c
    k = np.hypot(u / rx, v / ry)
    return (k - 1.0) * min(rx, ry)


def dome(sdf, r):
    """A height field rising from a silhouette's edge to its middle."""
    t = np.clip(-sdf / max(r, 1e-3), 0, 1)
    return np.sqrt(1 - (1 - t) ** 2) * r


def light_layer(cv, height, albedo, z0, lamp, wrap=0.45, rim=0.0, amb=0.30,
                spec=0.0, spec_pow=30.0, strength=1.0, lamp_gain=1.0):
    """Light one layer. `lamp` = (x, y, z, radius, rgb)."""
    n = normals(height * cv.ss, strength)
    lx, ly, lz, lr, lc = lamp
    px, py, pz = cv.x, cv.y, height + z0
    Lx, Ly, Lz = lx - px, ly - py, lz - pz
    d = np.sqrt(Lx * Lx + Ly * Ly + Lz * Lz) + 1e-3
    ndl = (n[..., 0] * Lx + n[..., 1] * Ly + n[..., 2] * Lz) / d
    diff = np.clip((ndl + wrap) / (1 + wrap), 0, 1)
    att = 1.0 / (1.0 + (d / lr) ** 2)
    warm = diff * att * lamp_gain
    # the shop's violet dark, stronger on faces turned up to the room
    up = np.clip(0.5 - n[..., 1] * 0.5, 0, 1)
    ambient = amb * (0.55 + 0.45 * up)
    col = albedo * 255.0 * (np.asarray(lc, np.float32) / 255.0 * warm[..., None] * 1.35
                            + np.array([0.46, 0.40, 0.62], np.float32) * ambient[..., None])
    if rim:
        # moonlight from behind and above: it only reaches what turns away
        edge = np.clip(1 - n[..., 2], 0, 1) ** 1.6 * np.clip(-n[..., 1] * 0.8 + 0.35, 0, 1)
        col = col + edge[..., None] * np.array([150, 170, 215], np.float32) * rim
    if spec:
        hx, hy, hz = Lx / d, Ly / d, Lz / d + 1.0
        hn = np.sqrt(hx * hx + hy * hy + hz * hz) + 1e-6
        s = np.clip((n[..., 0] * hx + n[..., 1] * hy + n[..., 2] * hz) / hn, 0, 1) ** spec_pow
        col = col + s[..., None] * np.asarray(lc, np.float32) * spec * att[..., None] * 2.2
    return col


def strands(cv, cx, cy, across=0.6, along=6.0, amp=1.0, r0=60.0, warp=0.0):
    """Noise combed out from (cx, cy): fur lying away from a root. `warp`
    bends the combing so it never reads as a sunburst."""
    ss = cv.ss
    ang = np.arctan2(cv.y - cy, cv.x - cx)
    if warp:
        ang = ang + cv.noise(7, warp) + cv.noise(2.5, warp * 0.5)
    rad = np.hypot(cv.x - cx, cv.y - cy)
    nu = int(round(2 * math.pi * r0 * ss))
    nv = int(rad.max() * ss) + 4
    tex = cv.rng.normal(0, 1, (nv, nu)).astype(np.float32)
    tex = ndimage.gaussian_filter(tex, (along * ss, across * ss), mode=("nearest", "wrap"))
    tex /= (np.abs(tex).max() + 1e-6)
    u = (ang + math.pi) / (2 * math.pi) * nu
    v = rad * ss
    out = ndimage.map_coordinates(tex, [v.ravel(), u.ravel()], order=1, mode="grid-wrap")
    return out.reshape(cv.shape) * amp


def tufts(cv, sdf, cx, cy, amp, lobes=0.0, arc=3.0, hair=1.0):
    """Roughen a silhouette into fur: tufts round its edge (an angular noise),
    and single hairs breaking out of it (combed strands)."""
    ang = np.arctan2(cv.y - cy, cv.x - cx)
    n = 720
    ring = cv.rng.normal(0, 1, n).astype(np.float32)
    ring = ndimage.gaussian_filter1d(ring, arc, mode="wrap")
    ring /= (np.abs(ring).max() + 1e-6)
    idx = ((ang + math.pi) / (2 * math.pi) * n).astype(np.int32) % n
    t = ring[idx] * amp
    if lobes:
        t = t + np.cos(ang * lobes) * amp * 0.5
    return sdf - t - strands(cv, cx, cy, 0.45, 2.5, hair)


def antenna(cv, pts, width0, width1, barb, tilt):
    """A plumed antenna: a tapering stem along the polyline `pts` with fine
    barbs combed out either side of it, leaning to the tip. Returns
    (coverage, height)."""
    x, y = cv.x, cv.y
    cov = np.zeros(cv.shape, np.float32)
    hgt = np.zeros(cv.shape, np.float32)
    segs = len(pts) - 1
    total = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(segs))
    run = 0.0
    for i in range(segs):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        L = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / L, (by - ay) / L
        tr = ((x - ax) * ux + (y - ay) * uy) / L
        t = np.clip(tr, 0, 1)
        qx, qy = ax + t * (bx - ax), ay + t * (by - ay)
        dist = np.hypot(x - qx, y - qy)
        along = (run + t * L) / total
        w = width0 + (width1 - width0) * along
        stem = cover(dist - w, 0.7)
        side = (x - ax) * (-uy) + (y - ay) * ux
        inseg = ((tr >= -0.02) & (tr <= 1.02)).astype(np.float32)
        blen = barb * np.sin(np.clip(along, 0.02, 1) * math.pi) ** 0.8 + 1.0
        phase = (run + t * L) - np.abs(side) * tilt
        comb = 0.5 + 0.5 * np.cos(phase * 2 * math.pi / 2.4)
        vane = cover(np.abs(side) - blen, 1.2) * np.clip((comb - 0.45) / 0.35, 0, 1) * inseg
        vane = vane * (0.55 + 0.45 * (1 - np.abs(side) / (blen + 1e-3)))
        c = np.maximum(stem, vane)
        cov = np.maximum(cov, c)
        hgt = np.maximum(hgt, stem * 1.8 + vane * 0.9)
        run += L
    return cov, hgt


def moth():
    """Mr. Moth, painted into the mirror's glass (see the header)."""
    _, glass = mirror_cut()
    gy, gx = np.where(glass)
    GX0, GY0, GX1, GY1 = gx.min(), gy.min(), gx.max() + 1, gy.max() + 1
    W, H = GX1 - GX0, GY1 - GY0                      # the glass, 1x (277x518)
    OUT_K, SS = 2, 4                                 # write it at 2x, paint at 4x
    rng = np.random.default_rng(1905)
    cv = Canvas(W, H, SS, rng)
    cx = W / 2.0
    ZOOM, ZY = 1.12, 236.0
    cv.x = cx + (cv.x - cx) / ZOOM
    cv.y = ZY + (cv.y - ZY) / ZOOM
    x, y = cv.x, cv.y

    def one(h):
        return np.ones(cv.shape + (3,), np.float32) * hexc(h) / 255.0

    # the lamp he holds, low in front of him: the picture's one warm light
    LX, LY = cx, 421.0
    LAMP = (LX, LY, 58.0, 290.0, (255, 180, 104))

    # ── the shop behind him: velvet in the dark, the lamp's light on it ──────
    base = ramp(np.clip(y / H, 0, 1), [(0, "#140b1b"), (0.45, "#1c1025"), (1, "#130a17")])
    folds = np.sin(x * 2 * math.pi / 21.0 + cv.noise(16, 2.4)) * 0.5 + 0.5
    folds = folds ** 2.0
    base = base * (0.66 + 0.5 * folds[..., None])
    glow = np.exp(-(((x - LX) / 170) ** 2 + ((y - LY) / 240) ** 2))
    base = base + glow[..., None] * np.array([96, 48, 16], np.float32) * (0.5 + 0.5 * folds[..., None])
    moon = np.exp(-(((x - cx) / 110) ** 2 + ((y - 30) / 120) ** 2))
    base = base + moon[..., None] * np.array([12, 14, 30], np.float32)
    cv.col = base
    # his shelves of lost things either side of him, lost in the dark: a
    # plank, a row of jars and bottles with the lamp caught on their shoulders
    srng = np.random.default_rng(1911)
    for sy in (104.0, 196.0):
        plank = cover(np.abs(y - sy) - 2.2, 0.8) * (np.abs(x - cx) > 58)
        cv.col = cv.col * (1 - plank[..., None] * 0.6) + np.array([58, 38, 30], np.float32) * plank[..., None] * 0.6
        lipl = cover(np.abs(y - (sy - 2.0)) - 0.6, 0.6) * (np.abs(x - cx) > 58)
        cv.col = cv.col + lipl[..., None] * np.array([46, 30, 16], np.float32)
        xs_ = 6.0
        while xs_ < W - 6:
            if abs(xs_ - cx) > 66:
                jw, jh = srng.uniform(6, 12), srng.uniform(12, 26)
                jar = np.maximum(np.abs(x - xs_) - jw / 2, np.abs(y - (sy - 2.4 - jh / 2)) - jh / 2)
                ja = cover(jar, 0.8)
                jc = np.array(srng.choice([[44, 34, 54], [38, 44, 52], [54, 40, 30], [30, 36, 44]]), np.float32)
                cv.col = cv.col * (1 - ja[..., None] * 0.85) + jc * ja[..., None] * 0.85
                glint = np.exp(-(((x - (xs_ - jw * 0.22)) / 1.1) ** 2 + ((y - (sy - 4 - jh * 0.72)) / 3.2) ** 2)) * ja
                warmth = math.exp(-((xs_ - LX) / 140) ** 2) * 0.5 + 0.3
                cv.col = cv.col + glint[..., None] * np.array([230, 170, 110], np.float32) * warmth
                xs_ += jw + srng.uniform(3, 8)
            else:
                xs_ += 6
    cv.col = ndimage.gaussian_filter(cv.col, (0.9 * SS, 0.9 * SS, 0))   # out of focus behind him

    # ── wings, folded down his back, flaring out beneath his shoulders ───────
    for side in (-1, 1):
        wx, wy = cx + side * 70, 330.0
        s0 = ellipse_sdf(x, y, wx, wy, 70, 150, rot=side * -0.28)
        ang = np.arctan2(y - wy, x - wx)
        s0 = s0 + np.cos(ang * 11 + side * 0.4) * 2.6              # the scalloped hem
        s = tufts(cv, s0, wx, wy, 1.4, arc=2.0, hair=0.8)
        a = cover(s, 1.2)
        h = dome(s0, 22)
        r = np.hypot((x - wx) / 70, (y - wy) / 150)
        alb = ramp(np.clip(r, 0, 1), [(0, "#a2869a"), (0.5, "#846b86"), (0.78, "#5a4460"),
                                      (0.9, "#3a2a40"), (0.95, "#c9b39c"), (1, "#4a3646")])
        # veins running out from where the wing meets his back
        root_x, root_y = cx + side * 22, 224.0
        va = np.arctan2(y - root_y, (x - root_x) * side)
        veins = np.abs(np.sin(va * 16)) ** 18
        alb = alb * (1 - 0.22 * veins[..., None] * np.clip(r * 1.3, 0, 1)[..., None])
        # the eye-spot, low on the wing where it shows beside the coat
        ex, ey = wx + side * 20, 376.0
        er = np.hypot(x - ex, (y - ey) * 0.9)
        spot = cover(er - 21, 1.0)
        eye = ramp(np.clip(er / 21, 0, 1), [(0, "#20121a"), (0.3, "#2c1a24"), (0.38, "#f0dfc2"),
                                           (0.58, "#c29a70"), (0.74, "#7a4a3a"), (0.88, "#3a2430"), (1, "#5a4054")])
        alb = alb * (1 - spot[..., None]) + eye * spot[..., None]
        alb = alb * (1 + cv.noise(0.5, 0.10)[..., None] + strands(cv, root_x, root_y, 0.5, 8, 0.08)[..., None])
        col = light_layer(cv, h + strands(cv, root_x, root_y, 0.5, 8, 0.6), alb / 255.0, -34, LAMP,
                          wrap=0.7, rim=0.4, amb=0.62)
        cv.over(col, a)

    # ── the coat ──────────────────────────────────────────────────────────────
    top, bot = 242.0, float(H + 12)
    t = np.clip((y - top) / (bot - top), 0, 1)
    half = 48 + 40 * t ** 0.9
    coat_sdf = np.maximum(np.abs(x - cx) - half, top - y)
    coat_sdf = np.minimum(coat_sdf, ellipse_sdf(x, y, cx, top + 20, 62, 30))
    a = cover(coat_sdf, 1.1)
    h = dome(coat_sdf, 36) * 0.9
    h = h + np.sin((x - cx) * 0.19 + cv.noise(12, 1.6)) * 1.8 * t
    alb = one("#3e2a58") * (0.92 + cv.noise(0.8, 0.07)[..., None] + cv.noise(5, 0.05)[..., None])
    lap = np.abs(x - cx) - (y - 254) * 0.34
    lapel = cover(np.maximum(-lap, np.abs(x - cx) - 42), 1.0) * (y > 252) * (y < 374)
    alb = alb + lapel[..., None] * (one("#5a3f78") - alb) * 0.9
    h = h + lapel * 2.6
    vest = cover(np.maximum(lap, -(y - 254)), 1.0) * (y < 444)
    alb = np.where(vest[..., None] > 0.5, one("#2a1a3a") * (0.92 + cv.noise(0.7, 0.08)[..., None]), alb)
    col = light_layer(cv, h, alb, 0, LAMP, wrap=0.4, rim=0.6, amb=0.36, spec=0.06, spec_pow=10, lamp_gain=1.7)
    cv.over(col, a)
    # gilt piping along the lapels' edges: the shop's brass, on him
    pipe = cover(np.abs(lap) - 0.9, 0.7) * (y > 256) * (y < 372) * a
    cv.col = cv.col * (1 - pipe[..., None] * .8) + light_layer(cv, pipe * 1.5, one("#c9a060"), 6, LAMP,
                                                              wrap=.5, amb=.35, spec=.5) * pipe[..., None] * .8
    for by in (304.0, 334.0, 364.0):
        bs = np.hypot(x - cx, y - by) - 4.6
        ba = cover(bs, 0.8)
        cv.over(light_layer(cv, dome(bs, 4.6) * 1.2, one("#b88f4e"), 8, LAMP, wrap=0.2, rim=0.5,
                            amb=0.25, spec=1.0, spec_pow=40), ba)

    # ── his arms, down his sides and folded in front to the lamp's ring ──────
    for side in (-1, 1):
        chain = [(cx + side * 50, 264.0), (cx + side * 58, 310.0), (cx + side * 50, 352.0), (cx + side * 22, 378.0)]
        arm = np.full(cv.shape, 1e9, np.float32)
        for (ax, ay), (bx, by) in zip(chain[:-1], chain[1:]):
            L = math.hypot(bx - ax, by - ay)
            ux, uy = (bx - ax) / L, (by - ay) / L
            tt = np.clip(((x - ax) * ux + (y - ay) * uy) / L, 0, 1)
            arm = np.minimum(arm, np.hypot(x - (ax + tt * (bx - ax)), y - (ay + tt * (by - ay))) - 13.5)
        # the sleeve belling out toward the hand
        bell = ellipse_sdf(x, y, cx + side * 30, 372, 17, 14, rot=side * 0.9)
        arm = np.minimum(arm, bell)
        aa = cover(arm, 1.0)
        ah = dome(arm, 13.5) + np.sin((y - 274) * 0.16 + (x - cx) * side * 0.1 + cv.noise(6, 1.2)) * 0.35
        cv.over(light_layer(cv, ah, one("#4c3568") * (0.92 + cv.noise(0.8, 0.07)[..., None]), 18, LAMP,
                            wrap=0.4, rim=0.65, amb=0.36, lamp_gain=1.45), aa)
        # a band of the same gilt piping round the cuff
        (ax, ay), (bx, by) = chain[-2], chain[-1]
        L = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / L, (by - ay) / L
        tr = ((x - ax) * ux + (y - ay) * uy) / L
        cuff = cover(np.abs(tr - 0.78) * L - 1.3, 0.7) * aa
        cv.col = cv.col * (1 - cuff[..., None] * .75) + np.array([206, 164, 96], np.float32) * cuff[..., None] * .75

    # ── the ruff: the moth's own fluff, over his collar ──────────────────────
    RX, RY = cx, 236.0
    r0 = ellipse_sdf(x, y, RX, RY, 78, 40)
    rs = tufts(cv, r0, RX, RY - 10, 4.2, lobes=9, arc=3.2, hair=1.6)
    a = cover(rs, 1.4)
    fl = strands(cv, RX, RY - 16, 0.9, 3.5, 1.0, warp=0.35)
    h = dome(r0, 20) + fl * 1.1 + cv.noise(1.4, 1.2)
    alb = one("#ecdfcf") * (0.9 + fl[..., None] * 0.07 + cv.noise(3, 0.06)[..., None])
    col = light_layer(cv, h, alb, 14, LAMP, wrap=0.8, rim=0.8, amb=0.44, strength=0.7, lamp_gain=1.2)
    cv.over(col, a)
    # an inner layer of the ruff, fluffed up under his chin
    r1 = ellipse_sdf(x, y, RX, RY - 8, 54, 26)
    rs1 = tufts(cv, r1, RX, RY - 14, 3.2, lobes=7, arc=2.8, hair=1.2)
    a1 = cover(rs1, 1.3)
    fl1 = strands(cv, RX, RY - 18, 0.9, 3.0, 1.0, warp=0.35)
    h1 = dome(r1, 16) + fl1 * 1.0 + cv.noise(1.2, 1.0)
    alb1 = one("#f3e9dc") * (0.92 + fl1[..., None] * 0.06)
    cv.over(light_layer(cv, h1, alb1, 20, LAMP, wrap=0.8, rim=0.7, amb=0.46, strength=0.7, lamp_gain=1.25), a1)

    # ── the head ──────────────────────────────────────────────────────────────
    HX, HY, HR = cx, 162.0, 58.0
    h0 = ellipse_sdf(x, y, HX, HY, HR, HR * 0.95)
    hs = tufts(cv, h0, HX, HY, 2.6, arc=2.2, hair=1.8)
    a = cover(hs, 1.2)
    fh = strands(cv, HX, HY + 8, 0.8, 3.2, 1.0, warp=0.3)
    h = dome(h0, HR * 0.9) + fh * 0.9 + cv.noise(1.1, 0.9)
    alb = one("#ebdcd2") * (0.9 + fh[..., None] * 0.06 + cv.noise(4, 0.05)[..., None])
    # a darker crest of fur over the brow, as a moth's is
    crest = np.clip((HY - 22 - y) / 30, 0, 1) * cover(h0, 6)
    alb = alb * (1 - crest[..., None] * 0.28) + crest[..., None] * one("#8a6f86") * 0.28
    col = light_layer(cv, h, alb, 26, LAMP, wrap=0.75, rim=0.95, amb=0.44, strength=0.9, lamp_gain=1.2)
    cv.over(col, a)
    # little cheek tufts either side of his face
    for side in (-1, 1):
        tx, ty = HX + side * 50, HY + 22
        t0 = ellipse_sdf(x, y, tx, ty, 16, 12, rot=side * 0.6)
        ts = tufts(cv, t0, tx - side * 6, ty, 2.2, arc=1.4, hair=1.4)
        ta = cover(ts, 1.1)
        tth = dome(t0, 9) + strands(cv, tx - side * 10, ty, 0.5, 4, 1.2)
        cv.over(light_layer(cv, tth, one("#efe4d8"), 30, LAMP, wrap=.8, rim=.8, amb=.45, lamp_gain=1.2), ta)

    # the antennae: two plumes rising from his brow and curling outward
    for side in (-1, 1):
        pts = [(cx + side * 15, 114), (cx + side * 22, 90), (cx + side * 34, 68),
               (cx + side * 50, 52), (cx + side * 64, 44), (cx + side * 74, 47)]
        ca, chh = antenna(cv, pts, 2.0, 0.8, 10.5, 1.1)
        alb = one("#c7a26c") * (0.86 + cv.noise(0.5, 0.12)[..., None])
        col = light_layer(cv, chh, alb, 20, LAMP, wrap=0.6, rim=1.2, amb=0.62, lamp_gain=1.3)
        cv.over(col, ca)

    # the eyes: great glossy dark lenses with the lamp in them
    for side in (-1, 1):
        ex, ey = HX + side * 26, HY + 6
        es = ellipse_sdf(x, y, ex, ey, 20.5, 23.5, rot=side * 0.12)
        ea = cover(es, 0.9)
        depth = np.clip((y - ey) / 23.5 * 0.5 + 0.5, 0, 1)
        ecol = ramp(depth, [(0, "#0b060f"), (0.55, "#1a0d24"), (0.85, "#3e1f4a"), (1, "#6a3448")])
        # an iris of deep violet where the light gets in
        iris = np.clip(1 - np.abs(np.hypot(x - ex, (y - ey) * 0.9) - 13) / 5, 0, 1) * np.clip((y - ey) / 10, 0, 1)
        ecol = ecol + iris[..., None] * np.array([40, 16, 60], np.float32)
        refl = np.exp(-(((x - ex + side * 2) / 8.5) ** 2 + ((y - ey - 12) / 4.0) ** 2))
        ecol = ecol + refl[..., None] * np.array([255, 164, 84], np.float32) * 0.8
        hi1 = cover(np.hypot(x - (ex - 6.5), y - (ey - 9.5)) - 6.2, 0.8)
        hi2 = cover(np.hypot(x - (ex + 5.5), y - (ey - 1.5)) - 2.6, 0.7)
        ecol = ecol * (1 - hi1[..., None]) + np.array([253, 248, 244], np.float32) * hi1[..., None]
        ecol = ecol * (1 - hi2[..., None] * .9) + np.array([244, 236, 240], np.float32) * hi2[..., None] * .9
        ring = cover(np.abs(es + 0.6) - 1.2, 0.8)
        ecol = ecol * (1 - ring[..., None] * 0.85) + np.array([30, 16, 32], np.float32) * ring[..., None] * 0.85
        cv.over(ecol, ea)
        bl = np.exp(-(((x - (ex + side * 10)) / 11) ** 2 + ((y - (ey + 28)) / 5.0) ** 2))
        cv.col = cv.col + bl[..., None] * np.array([80, 26, 34], np.float32) * a[..., None]
    mth = np.abs(np.hypot(x - HX, (y - (HY + 22)) * 1.5) - 6.5) - 0.8
    mm = cover(mth, 0.7) * (y > HY + 24)
    cv.col = cv.col * (1 - mm[..., None] * 0.75) + np.array([70, 34, 46], np.float32) * mm[..., None] * 0.75

    # ── the lamp: its ring in his two mitts, a brass cap and foot, the flame ──
    BRASS_LIGHT = (LX, LY, 70.0, 80.0, (255, 196, 126))
    ring = np.abs(np.hypot(x - LX, (y - 388) * 1.15) - 8.0) - 1.5
    ra = cover(ring, 0.7) * (y < 397)
    cv.over(light_layer(cv, dome(ring, 1.5) * 2, one("#c9a262"), 36, BRASS_LIGHT, wrap=.3, rim=.3, amb=.3, spec=.7), ra)
    for side in (-1, 1):
        mt = ellipse_sdf(x, y, LX + side * 11, 388, 11.5, 9.5)
        ms = tufts(cv, mt, LX + side * 11, 388, 1.4, arc=1.2, hair=1.0)
        ma = cover(ms, 1.0)
        cv.over(light_layer(cv, dome(mt, 8) + strands(cv, LX + side * 11, 384, .5, 3, 1.0), one("#eee2d4"), 40,
                            LAMP, wrap=.8, rim=.5, amb=.45, lamp_gain=1.25), ma)
    cap = np.maximum(np.abs(x - LX) - (4 + (y - 398) * 0.95), np.abs(y - 404) - 6)
    capa = cover(cap, 0.7) * (y > 397)
    cv.over(light_layer(cv, dome(cap, 3) * 1.4, one("#c29a58"), 36, BRASS_LIGHT, wrap=.2, rim=.5, amb=.3, spec=.9), capa)
    chim = np.maximum(np.abs(x - LX) - 12.0, np.abs(y - 424) - 14)
    cha = cover(chim, 0.7)
    fr = np.hypot((x - LX) / 4.4, (y - 423) / 8.8)
    glass_col = ramp(np.clip(fr / 2.7, 0, 1), [(0, "#fffbe6"), (0.22, "#ffd896"), (0.55, "#ee9a48"), (1, "#8a4a1e")])
    cv.over(glass_col, cha)
    bars = cover(np.abs(np.abs(x - LX) - 11.6) - 0.9, 0.6) * (np.abs(y - 424) < 14)
    cv.col = cv.col * (1 - bars[..., None] * 0.75) + np.array([150, 104, 50], np.float32) * bars[..., None] * 0.75
    foot = np.maximum(np.abs(x - LX) - (13.5 - (y - 438) * 0.2), np.abs(y - 442) - 4)
    fa = cover(foot, 0.7)
    cv.over(light_layer(cv, dome(foot, 3) * 1.4, one("#c29a58"), 36, (LX, LY - 8, 40, 80, (255, 196, 126)),
                        wrap=.1, rim=.5, amb=.25, spec=.6), fa)
    bloom = np.exp(-(((x - LX) / 30) ** 2 + ((y - 423) / 36) ** 2))
    cv.col = cv.col + bloom[..., None] * np.array([150, 86, 30], np.float32)
    halo = np.exp(-(((x - LX) / 90) ** 2 + ((y - 423) / 100) ** 2))
    cv.col = cv.col + halo[..., None] * np.array([40, 20, 6], np.float32)

    # ── paint it: the kit's glaze and brush, the room's dark round the edge ──
    col = down(cv.col, SS // OUT_K)
    col = col * 1.3 + 5           # brighter than the wares round him: he is the hero of his board
    col = M.painterly(col, np.random.default_rng(1906), 0.55)
    Hh, Ww = col.shape[:2]
    yy, xx = np.mgrid[0:Hh, 0:Ww].astype(np.float32)
    vig = np.hypot((xx - Ww / 2) / (Ww * 0.6), (yy - Hh * 0.5) / (Hh * 0.62))
    col = col * np.clip(1.1 - 0.55 * vig ** 2.4, 0.32, 1.1)[..., None]
    drng = np.random.default_rng(1907)
    for _ in range(30):
        px_, py_ = drng.uniform(0, Ww), drng.uniform(Hh * 0.5, Hh * 0.98)
        rr = drng.uniform(0.7, 1.9) * OUT_K
        d = np.hypot(xx - px_, yy - py_)
        near = math.exp(-(((px_ - Ww / 2) / (Ww * .38)) ** 2 + ((py_ - LY * OUT_K) / (Hh * .22)) ** 2))
        col = col + (np.clip(1 - d / rr, 0, 1) ** 2)[..., None] * np.array([255, 206, 150], np.float32) * 0.55 * near

    g = np.asarray(Image.fromarray((glass[GY0:GY1, GX0:GX1] * 255).astype(np.uint8)).resize((Ww, Hh), Image.BILINEAR), np.float32) / 255
    g = ndimage.binary_dilation(g > 0.5, iterations=5 * OUT_K).astype(np.float32)
    g = ndimage.gaussian_filter(g, 1.0)
    out = np.dstack([np.clip(col, 0, 255), g * 255])
    save(out, "moth-portrait.webp", 90)
    print("  portrait %dx%d at %dx: sits at x %d, y %d of the mirror (1x), %dx%d"
          % (Ww, Hh, OUT_K, GX0, GY0, W, H))


# ── a brass rosette for a rail's end ─────────────────────────────────────────
def rosette():
    """A round brass boss, 96 px: a beaded rim round a dome with an eight-point
    star struck up out of it, lit from the boards' top left, an ink line round
    every step, on a transparent ground. Caps the end of a shelf's rail."""
    S, ss = 96, 4
    rng = np.random.default_rng(2207)
    yy, xx = np.mgrid[0:S * ss, 0:S * ss].astype(np.float32)
    x, y = (xx + .5) / ss - S / 2, (yy + .5) / ss - S / 2
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    R = 44.0
    body = r < R
    hgt = np.zeros_like(r)
    # the outer lip, a little lower, then the bead row, then the dome
    lip = (r >= 38) & (r < R)
    hgt = np.where(lip, 3.0 + np.sqrt(np.clip(1 - ((r - 41) / 3.2) ** 2, 0, 1)) * 2.2, hgt)
    beads = (r >= 31) & (r < 38)
    ba = (a % (2 * math.pi / 24)) - math.pi / 24
    bd = np.hypot(r - 34.5, ba * 34.5)
    hgt = np.where(beads, 2.4 + np.sqrt(np.clip(1 - (bd / 3.1) ** 2, 0, 1)) * 3.4, hgt)
    dome_r = 31.0
    inner = r < dome_r
    hgt = np.where(inner, 3.0 + np.sqrt(np.clip(1 - (r / dome_r) ** 2, 0, 1)) * 7.0, hgt)
    # the star: eight points, raised off the dome
    k = (np.abs(np.cos(a * 4)) ** 10) * 0.62 + 0.38
    star = r < 26 * k
    hgt = np.where(star & inner, hgt + 2.4 * np.clip(1 - r / (26 * k + 1e-3), 0, 1) ** 0.5 + 0.8, hgt)
    # the eye at its heart
    hgt = np.where(r < 4.2, hgt + np.sqrt(np.clip(1 - (r / 4.2) ** 2, 0, 1)) * 2.0, hgt)
    n = normals(ndimage.gaussian_filter(hgt * ss, ss * .35), 0.9)
    wear = noise(r.shape, rng, ss * 1.2)
    col = M.brass(n, wear=wear, lift=0.02)
    # ink in every step of the casting
    gy, gx = np.gradient(ndimage.gaussian_filter(hgt, ss * .5))
    edge = np.clip((np.hypot(gx, gy) * ss - 1.1) / 2.5, 0, 1)
    col = col * (1 - 0.5 * edge[..., None])
    # the recess between the beads and the dome holds dirt
    groove = np.exp(-((r - 30.8) / 1.2) ** 2) + np.exp(-((r - 38.2) / 1.0) ** 2)
    col = col * (1 - 0.55 * np.clip(groove, 0, 1)[..., None])
    alpha = np.clip(R + 0.5 - r, 0, 1)
    out = np.dstack([down(col, ss), down(alpha, ss) * 255])
    save(out, "rosette.webp", 92)


# ── the ground of an illuminated initial ─────────────────────────────────────
def initial():
    """192 px square, a 9-slice with 44 px corners: a bevelled gilt frame with a
    knot at each corner, a fine gilt fillet inside it, and a field of violet
    enamel with a gold vine scroll raised on it (two stems crossing, a spiral
    and a leaf at each end) and pounced gold dots. The letter is set over it
    in type (event.css), gilded; the vine is kept a step darker than the
    letter will be, so the letter reads first."""
    from PIL import ImageDraw
    S, ss = 192, 4
    rng = np.random.default_rng(3301)
    N = S * ss
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    x, y = (xx + .5) / ss, (yy + .5) / ss
    edge = np.minimum(np.minimum(x, y), np.minimum(S - x, S - y))

    hgt = np.zeros((N, N), np.float32)
    gilt = np.zeros((N, N), bool)
    # the frame: a round rod from 2 to 16, a step, a flat to 20, the fillet at 26
    rod = (edge >= 2) & (edge < 16)
    t = np.clip((edge - 2) / 14, 0, 1)
    hgt = np.where(rod, 3 + np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * 5, hgt)
    gilt |= rod
    flat = (edge >= 16) & (edge < 20)
    hgt = np.where(flat, 2.2, hgt)
    gilt |= flat
    fil = (edge >= 25) & (edge < 27.5)
    hgt = np.where(fil, 1.6, hgt)
    gilt |= fil
    # a knot at each corner: a raised boss over the rod
    for cx, cy in ((10, 10), (S - 10, 10), (10, S - 10), (S - 10, S - 10)):
        r = np.hypot(x - cx, y - cy)
        k = r < 9.5
        hgt = np.where(k, np.maximum(hgt, 4 + np.sqrt(np.clip(1 - (r / 9.5) ** 2, 0, 1)) * 5.5), hgt)
        gilt |= k
        eye = r < 3
        hgt = np.where(eye, hgt - 1.2, hgt)

    # the field
    field = edge >= 27.5
    fy = np.clip((y - 28) / (S - 56), 0, 1)
    fcol = ramp(fy, [(0, "#4a3070"), (0.5, "#34204f"), (1, "#23153a")])
    vig = np.clip(1 - ((edge - 27.5) / 20), 0, 1)
    fcol = fcol * (1 - 0.35 * vig[..., None])
    fcol = fcol * (1 + noise((N, N), rng, 1.2 * ss, 0.08)[..., None] + noise((N, N), rng, 8 * ss, 0.06)[..., None])

    # the vine: two stems crossing the field, each ending in a spiral and a leaf
    im = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(im)

    def stroke(pts, w):
        d.line([(px * ss, py * ss) for px, py in pts], fill=255, width=int(w * ss), joint="curve")

    def spiral(cx, cy, r0, a0, turns, sgn):
        pts = []
        for i in range(60):
            u = i / 59
            r = r0 * (1 - 0.82 * u)
            a = a0 + sgn * u * turns * 2 * math.pi
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts

    stems = []
    for flip in (1, -1):
        pts = []
        for i in range(80):
            u = i / 79
            px = 34 + u * (S - 68)
            py = S / 2 + flip * math.sin(u * math.pi * 2) * 40
            pts.append((px, py))
        stems.append(pts)
    for pts in stems:
        stroke(pts, 3.2)
    for (cx, cy, a0, sgn) in ((52, S / 2 - 40, math.pi * .2, 1), (S - 52, S / 2 + 40, math.pi * 1.2, 1),
                              (52, S / 2 + 40, -math.pi * .2, -1), (S - 52, S / 2 - 40, math.pi * .8, -1)):
        stroke(spiral(cx, cy, 15, a0, 1.35, sgn), 2.6)
    vine = np.asarray(im, np.float32) / 255.0
    # tube profile across each stroke
    dist = ndimage.distance_transform_edt(vine < 0.5)
    vine_h = np.clip(1 - (dist / (1.6 * ss)) ** 2, 0, 1)
    vine_m = (vine > 0.2) & field
    # leaves: small teardrops off the stems
    leaves = np.zeros((N, N), np.float32)
    for pts in stems:
        for j in (14, 30, 49, 65):
            (ax, ay), (bx, by) = pts[j], pts[j + 1]
            ux, uy = bx - ax, by - ay
            L = math.hypot(ux, uy) or 1
            nx, ny = -uy / L, ux / L
            for side in (1, -1):
                lx, ly = ax + nx * side * 9, ay + ny * side * 9
                ang = math.atan2(ny * side, nx * side)
                c, s_ = math.cos(ang), math.sin(ang)
                u = (x - lx) * c + (y - ly) * s_
                v = -(x - lx) * s_ + (y - ly) * c
                leaf = np.clip(1 - (u / 7.5) ** 2 - (v / 3.4) ** 2 * (1 + 0.6 * np.clip(u / 7.5, 0, 1)), 0, 1)
                leaves = np.maximum(leaves, leaf)
    leaves = leaves * field
    hgt = np.where(vine_m, np.maximum(hgt, 1.2 + vine_h * 2.4), hgt)
    hgt = np.where(leaves > 0, np.maximum(hgt, 0.6 + np.sqrt(leaves) * 2.2), hgt)
    vine_gilt = (vine_m | (leaves > 0.02))
    # pounced dots in the field's open ground
    dots = np.zeros((N, N), np.float32)
    drng = np.random.default_rng(3302)
    for _ in range(34):
        px_, py_ = drng.uniform(36, S - 36), drng.uniform(36, S - 36)
        r = np.hypot(x - px_, y - py_)
        dots = np.maximum(dots, np.clip(1 - r / 1.6, 0, 1))
    dots = dots * field * (~vine_gilt)
    hgt = np.where(dots > 0, np.maximum(hgt, dots * 1.4), hgt)

    n = normals(ndimage.gaussian_filter(hgt * ss, ss * .4), 0.8)
    metal = M.brass(n, wear=noise((N, N), rng, ss * 1.4), lift=0.02)
    col = np.where(field[..., None], fcol, metal)
    # the vine gilt a step darker than the frame, so the letter over it reads first
    vmetal = metal * 0.78
    col = np.where((vine_gilt | (dots > 0.05))[..., None],
                   col * (1 - np.clip(np.maximum(vine_h * vine_m, np.maximum(leaves, dots)), 0, 1)[..., None])
                   + vmetal * np.clip(np.maximum(vine_h * vine_m, np.maximum(leaves, dots)), 0, 1)[..., None], col)
    col = np.where(gilt[..., None], metal, col)
    # ink in the steps
    gy, gx = np.gradient(ndimage.gaussian_filter(hgt, ss * .5))
    inkl = np.clip((np.hypot(gx, gy) * ss - 1.0) / 2.6, 0, 1)
    col = col * (1 - 0.45 * inkl[..., None])
    # the frame's outer lip into shadow
    col = col * np.where(edge < 2, 0.4, 1)[..., None]
    alpha = np.clip(edge * ss / 2, 0, 1)
    out = np.dstack([down(col, ss), down(alpha, ss) * 255])
    save(out, "initial-illum.webp", 92)


PIECES = {
    "mirror": mirror,
    "moth": moth,
    "rosette": rosette,
    "initial": initial,
}


def main():
    global PREVIEW
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=sorted(PIECES))
    ap.add_argument("--preview")
    a = ap.parse_args()
    PREVIEW = a.preview
    for name, fn in PIECES.items():
        if a.only and name != a.only:
            continue
        print(name)
        fn()


if __name__ == "__main__":
    main()
