"""Render the fight's REGALIA: what the master of a wing wears, and the made
things a Scuffle's readings sit in.

Round 4's COMBAT brief asked for five things the kit had no painted piece for.
Each is rendered here by the kit's own method (tools/prep_ui_materials.py: a
height field lit from the boards' top left, the antique brass ramp measured off
the samples, an ink line round every silhouette), or cut from the samples
themselves where the samples already painted it:

  boss-plate.webp   THE BOSS'S NAMEPLATE. A winged ribbon cartouche: a dark
                    aubergine plaque in a double brass rim whose ends are drawn
                    out to an ogee point, a tapering spear running on from each
                    point to where a star is set (cart-star.webp, in CSS), and a
                    pair of cast C-scrolls rising and falling off each end like
                    wings. A 3-slice: CAP px at each end, a plain run of rail
                    between (border-image 0 CAP 0 CAP).
  boss-crest.webp   the wordmark's own crest, cut whole from UI/title.png: the
                    fleur-de-lis finial, its C-scroll arms with their purple
                    leaves, the pendant under it, and the plaque's rails running
                    off either side (feathered), to clasp the boss plate's top
                    rim with the fleur rising toward his feet.
  roundel.webp      a CONDITION's round medallion: a bevelled brass bezel with a
                    fine bead inside it and four studs, round a domed enamel
                    whose colour is CSS's (a token per kind), glazed: shadow at
                    the rim, a window's crescent high on the dome. The field is
                    translucent so the token shows through the glaze.
  nerve-coin.webp   NERVE's struck coin: a milled edge, a raised rim, a ring of
                    engraved eight-point stars (the wordmark's), and a sunburst
                    field sunk under it so a dark numeral stands on bright gold.
  card-backs.webp   a PILE: three painted card backs fanned, aubergine velvet
                    under a gilt double rule, a crescent-moon crest medallion on
                    the top one, a vellum edge where each card's thickness shows.
  boss-beam.webp    the LIGHT the boss stands in: a shaft of moonlight from a
                    high window, streaked and hung with motes, and the pool it
                    makes on the floor where his feet are.
  boss-alcove.webp  the FRAME OF HIS STAGE: UI/selectKid.png's own centre mirror,
                    cut out of the board, the moon in its top medallion painted
                    out (his intent is set there), its foot faded where his
                    plate stands. A vertical 3-slice.
  card-flock.webp   the kit's damask at a fifth of its strength, for the flock
                    worked into a Trick's rules panel in the hand.
  iron-bracket.webp a WROUGHT-IRON wall bracket: a shelf plate on a scrolled
                    iron arm, riveted to a backplate on the frame's rail, for
                    DISCARD and its candle to stand on.

    python tools/prep_combat_regalia.py                 # everything
    python tools/prep_combat_regalia.py --only plate,crest
    python tools/prep_combat_regalia.py --sheet shots/regalia.png
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_ui_materials import (OUT, UI, brass, down, hexc, noise, normals,  # noqa: E402
                               ramp, save, smooth, specular)

INK = np.array([12, 7, 4], np.float32)
ANTIQUE = 0.9


def rgba(col, alpha):
    return np.dstack([np.clip(col, 0, 255), np.clip(alpha, 0, 1) * 255])


def antique(n, rng, shape, ss, spec=0.6, lift=0.0, wear_sigma=2.2):
    m = brass(n, wear=noise(shape, rng, ss * wear_sigma), spec_amt=spec, lift=lift) * ANTIQUE
    return m * np.array([1.0, 0.955, 0.88], np.float32)


def rod(d, w):
    """A round rod's section across width w: 0 at both edges, 1 on its crown."""
    t = np.clip(d / w, 0, 1)
    return np.where(d < w, np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)), 0.0)


def bez(p0, p1, p2, p3, n=48):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def stroke(dr, pts, w0, w1, s, cap=True):
    """A tapering stroke along pts, stamped as discs (width w0 -> w1)."""
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        w = w0 + (w1 - w0) * (i / max(1, n - 1))
        r = w / 2
        dr.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=255)
    if cap:
        x, y = pts[-1]
        r = w1 * 0.9
        dr.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=255)


def layer(W, H, fn):
    m = Image.new("L", (W, H), 0)
    fn(ImageDraw.Draw(m))
    return np.asarray(m, np.float32) / 255.0


# ── the boss's plate ─────────────────────────────────────────────────────────
PH = 156                   # the painting's height; CSS draws it at the plate's
CAP = 188                  # each end's slice: the ear, the point, the spear
PMID = 96                  # a plain run of rail between the ends


def boss_plate():
    rng = np.random.default_rng(90210)
    ss = 4
    PW = CAP * 2 + PMID
    W, H = PW * ss, PH * ss
    s = ss
    cy = PH / 2
    yT, yB = cy - 52, cy + 52          # the plaque's rails
    xs = CAP - 4                       # where the straight rails end, left side
    tipx = xs - 60                     # the point at mid-height

    def end_half():
        """The left end's upper half, from the top rail's end to the point:
        the rail sweeps out and up into a pointed ear (the wing), turns back
        in to a waist, and runs out again to the point."""
        ear = (xs - 44, yT - 13)
        waist = (xs - 27, cy - 11)
        pts = bez((xs, yT), (xs - 16, yT), (xs - 30, yT - 5), ear)
        pts += bez(ear, (xs - 37, yT + 5), (xs - 22, cy - 22), waist)[1:]
        pts += bez(waist, (xs - 34, cy - 3), (tipx + 14, cy - 1), (tipx, cy))[1:]
        return pts

    def body_poly():
        top = end_half()
        bottom = [(x, 2 * cy - y) for x, y in reversed(top)]
        left = top + bottom[1:]                  # rail top -> point -> rail bottom
        right = [(PW - x, y) for x, y in reversed(left)]
        return left + right

    body = layer(W, H, lambda d: d.polygon([(x * s, y * s) for x, y in body_poly()], fill=255))

    def wings(dr):
        for side in (1, -1):
            X = (lambda x: x) if side == 1 else (lambda x: PW - x)
            spear = [(tipx + 8 - k * (tipx - 14) / 60, cy) for k in range(61)]
            stroke(dr, [(X(x), y) for x, y in spear], 8.5, 1.8, s, cap=False)
            b = tipx - (tipx - 14) * 0.34
            dr.polygon([(X(b - 10) * s, cy * s), (X(b) * s, (cy - 8) * s), (X(b + 10) * s, cy * s), (X(b) * s, (cy + 8) * s)], fill=255)

    wing = layer(W, H, wings)
    wing = np.where(body > 0.5, 0, wing)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / ss
    d_body = ndimage.distance_transform_edt(body > 0.5) / ss
    d_wing = ndimage.distance_transform_edt(wing > 0.5) / ss

    R_OUT, GAP, R_IN = 10.0, 2.8, 4.4
    h_rim = rod(d_body, R_OUT) * 7.6
    in_rim = (d_body >= R_OUT + GAP) & (d_body < R_OUT + GAP + R_IN)
    h_rim = np.where(in_rim, rod(d_body - R_OUT - GAP, R_IN) * 3.6, h_rim)
    field = d_body >= R_OUT + GAP + R_IN
    h_field = np.where(field, -1.2 - 1.0 * smooth(0, 14, d_body - (R_OUT + GAP + R_IN)), 0)
    h_wing = np.sqrt(np.clip(d_wing / 4.2, 0, 1)) * 6.0 * (wing > 0.5)
    hgt = np.where(body > 0.5, h_rim + h_field, h_wing)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = antique(n, rng, (H, W), ss, spec=0.62, lift=0.03)

    # the plaque's field: aubergine enamel-black, glazed across its top, mottled,
    # falling dark against the inner rim
    v = np.clip((yy - yT) / (yB - yT), 0, 1)
    en = ramp(v, [(0.0, "#2a1f36"), (0.35, "#1a1223"), (1.0, "#0b080f")])
    mott = noise((H, W), rng, ss * 7) * 0.10 + noise((H, W), rng, ss * 1.1) * 0.05
    en = en * (1 + mott[..., None])
    en = en * (0.5 + 0.5 * smooth(0, 11, d_body - (R_OUT + GAP + R_IN)))[..., None]
    gl = np.exp(-((v - 0.24) / 0.1) ** 2) * smooth(0, 5, d_body - (R_OUT + GAP + R_IN))
    en = en + gl[..., None] * np.array([120, 96, 150], np.float32) * 0.2
    col = np.where((body > 0.5)[..., None], np.where(field[..., None], en, metal), metal)
    # ink: the silhouettes, the groove between the rims, the rim's inner lip
    gap = (d_body >= R_OUT) & (d_body < R_OUT + GAP)
    col = np.where(gap[..., None], INK * 0.95 + col * 0.05, col)
    lip = field & (d_body < R_OUT + GAP + R_IN + 0.8)
    col = np.where(lip[..., None], INK, col)
    e_body = smooth(0.0, 1.0, d_body)
    e_wing = smooth(0.0, 0.9, d_wing)
    col = np.where((body > 0.5)[..., None], col * e_body[..., None] + INK * (1 - e_body[..., None]),
                   col * e_wing[..., None] + INK * (1 - e_wing[..., None]))
    alpha = np.maximum(body, wing)
    save(rgba(down(col, ss), down(alpha, ss)), "boss-plate.webp", 93)


# ── the wordmark's crest ─────────────────────────────────────────────────────
def boss_crest():
    """UI/title.png's crown ornament, whole: keyed off the black it is painted
    on, the plaque's interior under its rails taken out, the rails faded off
    both sides so it clasps whatever rim it is laid on."""
    src = np.asarray(Image.open(os.path.join(UI, "title.png")).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = 896, 8, 1284, 142
    rgb = src[y0:y1, x0:x1].copy()
    h, w = rgb.shape[:2]
    lum = rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722
    l = ndimage.gaussian_filter(lum, 0.5)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    gold = (r > 44) & (r > b * 1.12) & (g > b * .9)
    purple = (b > 40) & (b > g * 1.25) & (r > g * 1.05)
    core = ndimage.binary_closing(gold | purple, iterations=1)
    a = np.maximum(np.clip((l - 9) / 32, 0, 1), ndimage.binary_dilation(core, iterations=1) * np.clip((l - 4) / 16, 0, 1))
    # under the lower rail only the pendant's head hangs, a clasp over whatever
    # rim the crest is laid on: the plaque's dark interior, the thin inner rail
    # under the whole crest and the pendant's long drop (it would reach the
    # lettering on a nameplate) all go
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    pend = np.abs(xx - w / 2) < 19
    a = np.where((yy > 104) & ~pend, a * np.clip((110 - yy) / 6, 0, 1), a)
    a = np.where(pend & (yy > 104), a * np.clip((112 - yy) / 8, 0, 1), a)
    # the rails fade off both ends
    edge = np.minimum(xx, w - 1 - xx)
    a = a * np.clip(edge / 64.0, 0, 1) ** 1.3
    a = ndimage.gaussian_filter(a, 0.45)
    au = np.clip(a, 1e-3, 1)[..., None]
    col = np.clip((rgb - (1 - au) * np.array([1, 1, 4], np.float32)) / au, 0, 255)
    save(rgba(col, a), "boss-crest.webp", 93)


# ── a condition's medallion ─────────────────────────────────────────────────
def roundel():
    rng = np.random.default_rng(3303)
    S, ss = 112, 4
    W = S * ss
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / ss
    c = S / 2
    r = np.hypot(xx - c, yy - c)
    ang = np.arctan2(yy - c, xx - c)
    R0 = S / 2 - 3.0          # the bezel's outer edge
    RB = R0 - 10.5            # its inner edge, where the bead runs
    RE = RB - 3.4             # the enamel's edge
    solid = r < R0
    d_out = R0 - r
    hgt = np.where(r >= RB, rod(d_out, R0 - RB) * 6.8, 0)
    # the fine bead inside the bezel
    bead_r = (RB + RE) / 2
    beads = (0.5 + 0.5 * np.cos(ang * 40)) ** 2
    hgt = np.where((r < RB) & (r >= RE), 1.6 + beads * 1.5 * np.exp(-((r - bead_r) / 1.3) ** 2), hgt)
    # four studs set on the bezel's crown
    rc = (R0 + RB) / 2
    for k in range(4):
        a0 = k * math.pi / 2 + math.pi / 4
        bx, by = c + rc * math.cos(a0), c + rc * math.sin(a0)
        bd = np.hypot(xx - bx, yy - by)
        hgt = np.maximum(hgt, np.where(bd < 3.1, 6.2 + np.sqrt(np.clip(1 - (bd / 3.1) ** 2, 0, 1)) * 2.4, 0))
    dome = r < RE
    hgt = np.where(dome, -1.0, hgt)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = antique(n, rng, (W, W), ss, spec=0.62, lift=0.04)
    col = metal * smooth(0, 0.9, d_out)[..., None] + INK * (1 - smooth(0, 0.9, d_out))[..., None]
    col = np.where((np.abs(r - RE) < 0.9)[..., None], INK, col)

    # the glaze over the enamel: straight alpha, dark under the bezel's lip, a
    # window's crescent high on the left of the dome and a hot point in it, the
    # candle's warm return low on the right
    rd = r / RE
    shade = smooth(0.55, 1.0, rd) ** 1.6 * 0.72
    cres = np.exp(-(((xx - (c - RE * .26)) / (RE * .42)) ** 2 + ((yy - (c - RE * .42)) / (RE * .2)) ** 2)) * 0.34
    cres *= smooth(0.25, 0.6, rd) * (1 - smooth(0.86, 0.98, rd))
    hot = np.exp(-(((xx - (c - RE * .36)) / 2.6) ** 2 + ((yy - (c - RE * .46)) / 1.9) ** 2)) * 0.75
    ret = np.exp(-(((xx - (c + RE * .34)) / (RE * .34)) ** 2 + ((yy - (c + RE * .5)) / (RE * .16)) ** 2)) * 0.2
    a_w = np.clip(cres + hot, 0, 0.9)
    a_r = ret * (1 - a_w)
    a_k = shade * (1 - a_w) * (1 - a_r)
    A = a_w + a_r + a_k
    C = (np.array([255, 250, 240], np.float32) * a_w[..., None]
         + np.array([255, 176, 92], np.float32) * a_r[..., None]
         + np.array([6, 3, 10], np.float32) * a_k[..., None]) / np.maximum(A, 1e-6)[..., None]
    col = np.where(dome[..., None], C, col)
    alpha = np.where(dome, A, solid.astype(np.float32) * smooth(-0.3, 0.9, d_out))
    save(rgba(down(col, ss), down(alpha, ss)), "roundel.webp", 94)


# ── Nerve's coin ────────────────────────────────────────────────────────────
def star_mask(xx, yy, cx, cy, R, r, n=8, rot=-math.pi / 2):
    """An n-point star: inside test on the polygon, as a float mask."""
    pts = []
    for k in range(n * 2):
        rad = R if k % 2 == 0 else r
        a = rot + k * math.pi / n
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def nerve_coin():
    rng = np.random.default_rng(5150)
    S, ss = 220, 4
    W = S * ss
    s = ss
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / ss
    c = S / 2
    r = np.hypot(xx - c, yy - c)
    ang = np.arctan2(yy - c, xx - c)
    R0 = S / 2 - 3
    RIM = 15.0                       # the raised rim
    RING0, RING1 = R0 - RIM - 1, R0 - RIM - 23   # the star ring, outer and inner
    solid = r < R0
    d_out = R0 - r
    hgt = np.where(r >= R0 - RIM, rod(d_out, RIM) * 9.0, 0)
    # the milled edge across the rim's outer half
    hgt = hgt + (0.5 + 0.5 * np.cos(ang * 110)) * smooth(RIM * .55, 0, d_out) * (d_out >= 0) * 1.6
    ring = (r < R0 - RIM) & (r >= RING1)
    hgt = np.where(ring, 2.2, hgt)
    # a bead either side of the star ring
    for rb in (RING0 + 0.5, RING1 - 0.5):
        hgt = hgt + np.exp(-((r - rb) / 1.2) ** 2) * 2.0 * (r < R0 - RIM)
    # sixteen eight-point stars round the ring, struck up out of it
    stars = Image.new("L", (W, W), 0)
    dr = ImageDraw.Draw(stars)
    rm = (RING0 + RING1) / 2
    for k in range(16):
        a0 = k * 2 * math.pi / 16
        sx, sy = c + rm * math.cos(a0), c + rm * math.sin(a0)
        big = k % 2 == 0
        pts = star_mask(None, None, sx, sy, 7.4 if big else 4.6, 2.2 if big else 1.5, n=8 if big else 4, rot=a0)
        dr.polygon([(x * s, y * s) for x, y in pts], fill=255)
    st = np.asarray(stars, np.float32) / 255.0
    d_st = ndimage.distance_transform_edt(st > 0.5) / ss
    hgt = hgt + np.sqrt(np.clip(d_st / 1.8, 0, 1)) * 2.4 * (st > 0.5)
    # the field, sunk, with a sunburst of fine rays under the figure
    field = r < RING1 - 2
    rays = (0.5 + 0.5 * np.cos(ang * 64)) ** 4 * 0.5
    hgt = np.where(field, -0.8 + rays * smooth(RING1 * .2, RING1 * .5, r) + 0.6 * np.exp(-((r - (RING1 - 5)) / 1.5) ** 2), hgt)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = antique(n, rng, (W, W), ss, spec=0.5, lift=0.12, wear_sigma=3.0)
    # the field is brighter, burnished gold, so a dark struck figure reads on it
    fieldcol = metal * 1.08 + np.array([12, 9, 0], np.float32)
    col = np.where(field[..., None], fieldcol, metal)
    col = col * smooth(0, 1.0, d_out)[..., None] + INK * (1 - smooth(0, 1.0, d_out))[..., None]
    for rb in (R0 - RIM, RING1 - 2):
        col = np.where((np.abs(r - rb) < 0.6)[..., None], INK * 0.75 + col * 0.25, col)
    alpha = solid.astype(np.float32) * smooth(-0.3, 1.0, d_out)
    save(rgba(down(col, ss), down(alpha, ss)), "nerve-coin.webp", 94)


# ── a pile's card backs ─────────────────────────────────────────────────────
def card_backs():
    """Three painted card backs fanned, the top one square to you."""
    rng = np.random.default_rng(4404)
    S, ss = 128, 4
    W = S * ss
    canvas = np.zeros((W, W, 4), np.float32)
    cw, ch = 60.0, 86.0
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / ss
    damask = np.asarray(Image.open(os.path.join(OUT, "damask.webp")).convert("L").resize((96 * ss, 110 * ss), Image.LANCZOS), np.float32) / 255.0

    def card(cx, cy, rot, top):
        rad = math.radians(rot)
        co, si = math.cos(rad), math.sin(rad)
        lx = (xx - cx) * co + (yy - cy) * si
        ly = -(xx - cx) * si + (yy - cy) * co
        rr = 5.5
        qx = np.clip(np.abs(lx) - (cw / 2 - rr), 0, None)
        qy = np.clip(np.abs(ly) - (ch / 2 - rr), 0, None)
        dist = np.hypot(qx, qy) - rr + np.minimum(np.maximum(np.abs(lx) - cw / 2, np.abs(ly) - ch / 2), 0)
        din = -dist
        v = np.clip((ly + ch / 2) / ch, 0, 1)
        back = ramp(v, [(0, "#3a2650"), (0.45, "#241836"), (1, "#140c1e")])
        # the damask woven into the velvet, faint
        ix = ((lx + cw) * ss).astype(np.int32) % damask.shape[1]
        iy = ((ly + ch) * ss).astype(np.int32) % damask.shape[0]
        dm = damask[iy, ix]
        back = back * (0.86 + 0.34 * dm[..., None])
        back = back * (1 + noise((W, W), rng, ss * 2.5)[..., None] * 0.05)
        # candle light across the upper left of the face
        back = back + (np.exp(-(((lx + 12) / 30) ** 2 + ((ly + 22) / 34) ** 2)) * 26)[..., None] * np.array([1.0, .75, .5], np.float32)
        vell = ramp(v, [(0, "#eadfc4"), (1, "#a99470")])
        col = np.where((din < 2.4)[..., None], vell, back)
        g = ramp(np.clip(0.55 + 0.45 * (-lx * 0.45 - ly * 0.55) / 44, 0, 1), [(0, "#5f431d"), (0.55, "#b8924f"), (1, "#f3dc9e")])
        for off, wdt in ((5.6, 1.6), (8.4, 0.8)):
            m = np.abs(din - off) < wdt / 2
            col = np.where(m[..., None], g, col)
        # a small fleuron in each corner inside the rule
        for sx in (-1, 1):
            for sy in (-1, 1):
                fx, fy = sx * (cw / 2 - 12.5), sy * (ch / 2 - 12.5)
                fm = (np.abs(lx - fx) + np.abs(ly - fy)) < 3.2
                col = np.where(fm[..., None], g, col)
        if top:
            # the moon crest: a gilt ring, a crescent in it, rays and stars
            ring_r = 15.0
            rr_ = np.hypot(lx, ly + 2)
            ringm = np.abs(rr_ - ring_r) < 1.6
            disc = rr_ < ring_r - 1.6
            col = np.where(disc[..., None], col * 0.55 + np.array([30, 16, 44], np.float32) * 0.45, col)
            rays = (np.abs(((np.arctan2(ly + 2, lx) + math.pi) * 8 / math.pi) % 2 - 1) < 0.16) & (rr_ > ring_r + 2.5) & (rr_ < ring_r + 7)
            col = np.where(rays[..., None], g * 0.9, col)
            col = np.where(ringm[..., None], g, col)
            m1 = np.hypot(lx + 1, ly + 2) < 10.2
            m2 = np.hypot(lx - 3.4, ly + 4.2) < 8.6
            moon = m1 & ~m2
            gm = ramp(np.clip(0.5 + (-lx - ly) / 24, 0, 1), [(0, "#7a5626"), (0.5, "#d2ad66"), (1, "#fbe9b4")])
            col = np.where(moon[..., None], gm, col)
            for sx_, sy_, sr in ((6.5, 3.5, 1.4), (4.0, -9.0, 1.0)):
                sm = (np.abs(lx - sx_) + np.abs(ly - sy_)) < sr * 1.6
                col = np.where(sm[..., None], np.array([246, 224, 160], np.float32), col)
        col = np.where((din < 0.8)[..., None], INK, col)
        a = smooth(-0.4, 0.5, din)
        return col, a

    for cx, cy, rot, top in ((54, 66, -13, False), (62, 63, -5, False), (70, 61, 5, True)):
        col, a = card(cx, cy, rot, top)
        sh = ndimage.gaussian_filter(a, ss * 1.8)
        sh = np.roll(np.roll(sh, int(2.5 * ss), axis=0), int(1.5 * ss), axis=1) * 0.6
        canvas[..., :3] = canvas[..., :3] * (1 - sh[..., None] * (canvas[..., 3:4] > 0))
        canvas[..., 3] = np.maximum(canvas[..., 3], sh * 0.75)
        canvas[..., :3] = canvas[..., :3] * (1 - a[..., None]) + col * a[..., None]
        canvas[..., 3] = a + canvas[..., 3] * (1 - a)
    out = down(canvas, ss)
    save(rgba(out[..., :3], out[..., 3]), "card-backs.webp", 94)


# ── the wrought-iron wall bracket ───────────────────────────────────────────
BRW, BRH = 240, 88          # the shelf's top edge is at row SHELF_Y
SHELF_Y = 12


def iron_bracket():
    """Black iron, forged: a flat shelf bar with a rolled lip at its free end, a
    backplate riveted to the wall at the right with a pointed head and foot,
    and under the shelf a diagonal strut with a C-scroll curled in the angle
    against the wall and a smaller scroll under the shelf's middle, the way a
    lamp bracket is hung off a house wall. Shallow, so it fits between a pile
    and the button under it."""
    rng = np.random.default_rng(7117)
    ss = 4
    W, H = BRW * ss, BRH * ss
    s = ss

    def draw(dr):
        # the shelf
        dr.rounded_rectangle([10 * s, SHELF_Y * s, 228 * s, (SHELF_Y + 8) * s], radius=2.5 * s, fill=255)
        dr.ellipse([3 * s, (SHELF_Y - 2) * s, 15 * s, (SHELF_Y + 10) * s], fill=255)
        # the backplate
        dr.rounded_rectangle([222 * s, 6 * s, 234 * s, 74 * s], radius=3 * s, fill=255)
        dr.polygon([(222 * s, 74 * s), (234 * s, 74 * s), (228 * s, 86 * s)], fill=255)
        dr.polygon([(222 * s, 6 * s), (234 * s, 6 * s), (228 * s, 0 * s)], fill=255)
        # the strut, from low on the wall to the shelf's middle
        strut = [(222 - k * 1.0, 66 - k * 0.43) for k in range(0, 108)]
        stroke(dr, strut, 5.8, 4.6, s, cap=False)
        # the C-scroll curled in the angle against the wall
        pts = []
        C = (194, 42)
        for k in range(120):
            t = k / 119
            th = math.radians(-100 + 330 * t)
            rr = 19 * (1 - t) + 4.5 * t
            pts.append((C[0] + rr * math.cos(th), C[1] + rr * math.sin(th) * 0.95))
        stroke(dr, pts, 5.2, 3.2, s)
        # an S under the shelf toward the free end: two small opposed curls
        for C, a0, sgn in (((132, 31), -160, 1), ((96, 26), 20, -1)):
            pts = []
            for k in range(80):
                t = k / 79
                th = math.radians(a0 + sgn * 280 * t)
                rr = 10 * (1 - t) + 3.2 * t
                pts.append((C[0] + rr * math.cos(th), C[1] + rr * math.sin(th)))
            stroke(dr, pts, 4.0, 2.6, s)
        # the brace under the shelf joining it all
        stroke(dr, [(84 + k, SHELF_Y + 9) for k in range(140)], 3.2, 3.2, s, cap=False)

    im = Image.new("L", (W, H), 0)
    draw(ImageDraw.Draw(im))
    mask = np.asarray(im, np.float32) / 255.0 > 0.5
    d = ndimage.distance_transform_edt(mask) / ss
    hgt = np.sqrt(np.clip(d / 3.0, 0, 1)) * 4.2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / ss
    for ry in (16, 40, 64):
        rd = np.hypot(xx - 228, yy - ry)
        hgt = np.maximum(hgt, np.where(rd < 3.0, 4.2 + np.sqrt(np.clip(1 - (rd / 3.0) ** 2, 0, 1)) * 2.0, 0))
    hgt = hgt + noise((H, W), rng, ss * 1.4) * 0.45 * mask
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.55)
    n = normals(hgt, 1.0)
    lam = np.clip((n * np.array([-0.42, -0.62, 0.66], np.float32)).sum(axis=2), 0, 1)
    spec = specular(n, power=18.0)
    iron = ramp(np.clip((lam - 0.1) / 0.9, 0, 1) ** 1.2, [(0, "#070607"), (0.45, "#1c191d"), (0.8, "#3e383f"), (1, "#756b77")])
    iron = iron + spec[..., None] * np.array([170, 150, 130], np.float32) * 0.45
    # the warm return off the candle it holds, along the top of the shelf
    warm = np.exp(-((yy - SHELF_Y - 1) / 2.6) ** 2) * np.exp(-((xx - 170) / 70) ** 2) * 0.6
    iron = iron + warm[..., None] * np.array([130, 76, 26], np.float32)
    col = iron * smooth(0, 0.8, d)[..., None]
    alpha = smooth(-0.2, 0.6, d) * mask
    save(rgba(down(col, ss), down(alpha.astype(np.float32), ss)), "iron-bracket.webp", 94)


# ── the light the master of the wing stands in ─────────────────────────────
BEAM_W, BEAM_H = 440, 960
BEAM_FLOOR = 0.86            # where his feet are, as a fraction of the height


def boss_beam():
    """A shaft of moonlight from a high window straight down onto the boss:
    narrow where it enters at the top, widening to the floor, soft at its
    edges, streaked where the dust in the air catches it, motes hanging in it,
    and a pool where it lands. Straight alpha over a cold white that warms a
    little toward the floor, so it lays light on whatever is behind it."""
    rng = np.random.default_rng(1313)
    ss = 2
    W, H = BEAM_W * ss, BEAM_H * ss
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    y = yy / H
    x = xx / W
    t = np.clip(y / BEAM_FLOOR, 0, 1.2)
    hw = 0.085 + (0.44 - 0.085) * t ** 1.1           # the cone's half-width
    u = (x - 0.5) / hw                               # -1 .. 1 across the shaft
    d = np.abs(u)
    edge = 1 - smooth(0.5, 1.02, d)
    core = 1 - 0.45 * d ** 2
    # streaks radiate from the apex: noise along u only, varied slowly down
    n1 = ndimage.gaussian_filter1d(rng.normal(0, 1, 512).astype(np.float32), 5)
    n1 = (n1 - n1.min()) / (n1.max() - n1.min())
    idx = np.clip(((u + 1.2) / 2.4) * 511, 0, 511).astype(np.int32)
    streak = n1[idx]
    n2 = ndimage.gaussian_filter1d(rng.normal(0, 1, 512).astype(np.float32), 12)
    n2 = (n2 - n2.min()) / (n2.max() - n2.min())
    streak2 = n2[np.clip(((u * 1.7 + 1.9) / 3.8) * 511, 0, 511).astype(np.int32)]
    # entering from the top, thickest where the air is lit, gone below the floor
    vfall = smooth(0.0, 0.16, y) * (0.72 + 0.28 * smooth(0.2, BEAM_FLOOR, y)) * (1 - smooth(BEAM_FLOOR + 0.015, BEAM_FLOOR + 0.07, y))
    I = edge * core * (0.42 + 0.38 * streak + 0.2 * streak2) * vfall * 0.26
    # the pool where it lands: an ellipse on the boards, brightest at its heart
    px = (x - 0.5) / 0.40
    py = (y - (BEAM_FLOOR + 0.004)) / 0.028
    pool = np.exp(-(px ** 2 + py ** 2) * 1.6) * 0.42 + np.exp(-((x - 0.5) / 0.2) ** 2 - ((y - BEAM_FLOOR) / 0.012) ** 2) * 0.18
    # motes: small soft specks hanging in the shaft
    motes = np.zeros((H, W), np.float32)
    for _ in range(140):
        my = rng.uniform(0.08, BEAM_FLOOR - 0.02)
        th = 0.085 + (0.44 - 0.085) * (my / BEAM_FLOOR) ** 1.1
        mx = 0.5 + rng.uniform(-0.85, 0.85) * th
        r = rng.uniform(0.6, 1.6) * ss
        cx, cy = mx * W, my * H
        x0, x1 = int(cx - 6 * ss), int(cx + 6 * ss)
        y0, y1 = int(cy - 6 * ss), int(cy + 6 * ss)
        sub = np.exp(-(((xx[y0:y1, x0:x1] - cx) / r) ** 2 + ((yy[y0:y1, x0:x1] - cy) / r) ** 2))
        motes[y0:y1, x0:x1] = np.maximum(motes[y0:y1, x0:x1], sub * rng.uniform(0.25, 0.7))
    A = np.clip(I + pool + motes * edge * 0.8, 0, 0.85)
    cold = np.array([214, 228, 255], np.float32)
    warm = np.array([255, 236, 206], np.float32)
    k = smooth(0.4, BEAM_FLOOR + 0.03, y)[..., None]
    col = cold * (1 - k * 0.55) + warm * (k * 0.55)
    col = np.broadcast_to(col, (H, W, 3))
    save(rgba(down(col, ss), down(A, ss)), "boss-beam.webp", 88)


# ── the alcove: the Kid board's mirror frame, for the master of the wing ────
ALC_BOX = (318, 228, 682, 850)     # selectKid.png: the mirror, down to its lower scrolls
ALC_MOON = (183, 62, 41)           # the top medallion in the crop: centre x, y and radius
ALC_STRETCH = 1.2                  # a little wider than the Kid's, for a boss in a greatcoat
ALC_TOP, ALC_BOT = 205, 150        # the 3-slice: the crown's rows, the foot's rows (after stretch)


def boss_alcove():
    """UI/selectKid.png's centre mirror, cut out of the board: its gilt double
    rails, the crown of scrollwork and the lower scrolls, keyed off the dark
    panel it hangs on, the glass made clear so the room shows through. The moon
    in the top medallion is painted out to plain enamel (the boss's intent is
    set into that medallion), and the foot fades out under the lower scrolls,
    where the paw medallion, the skull and the candle were (the boss's plate
    stands there). Widened a fifth; a vertical 3-slice (ALC_TOP / ALC_BOT)."""
    src = np.asarray(Image.open(os.path.join(UI, "selectKid.png")).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = ALC_BOX
    rgb = src[y0:y1, x0:x1].copy()
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(axis=2)
    # the gilt, lit side and shadow side alike: the right-hand rails sit in the
    # board's shadow and are only just warmer than the panel behind them
    gold = (r > 22) & (r > b * 1.08) & (g > b * .86) & (lum > 13)
    gold = ndimage.binary_opening(gold, iterations=1)
    body = ndimage.binary_closing(gold, iterations=2)
    # the straight rails run in shadow on the right: bridge them along their length
    body = body | ndimage.binary_closing(gold, structure=np.ones((9, 3), bool))
    keep = ndimage.binary_dilation(body, iterations=1)
    a = np.clip((lum - 10) / 22, 0, 1) * keep
    a = np.maximum(a, ndimage.gaussian_filter(body.astype(np.float32), 0.6) * 0.95)
    # the medallion: the moon and its star painted out with the Kid board's own
    # empty enamel (button.webp's glass, the round buttons' purple), laid in
    # under the medallion's ring
    mx, my, mr = ALC_MOON
    dmed = np.hypot(xx - mx, yy - my)
    btn = np.asarray(Image.open(os.path.join(OUT, "button.webp")).convert("RGBA")).astype(np.float32)
    ER = 34.0                                   # the enamel's radius here
    k = 38.0 / ER                               # button.webp's enamel is r 38 of its 112
    bh, bw = btn.shape[:2]
    sx = np.clip(((xx - mx) * k + bw / 2), 0, bw - 1)
    sy = np.clip(((yy - my) * k + bh / 2), 0, bh - 1)
    glass = ndimage.map_coordinates(btn[..., 0], [sy, sx], order=1), ndimage.map_coordinates(btn[..., 1], [sy, sx], order=1),         ndimage.map_coordinates(btn[..., 2], [sy, sx], order=1)
    glass = np.dstack(glass)
    disc = dmed < ER + 0.5
    edge_d = smooth(ER - 2.5, ER + 0.5, dmed)
    rgb = np.where(disc[..., None], glass * (1 - edge_d[..., None]) + rgb * edge_d[..., None], rgb)
    a = np.where(disc, np.maximum(a, 1 - edge_d), a)
    # the glass inside the mirror: an old mirror's shadow along the inside of its
    # rails, so the frame sits back into the wall instead of lying on the room
    inner = ~ndimage.binary_dilation(body, iterations=2)
    lab_in, _ = ndimage.label(inner)
    seed = lab_in[int(h * 0.55), int(w / 2)]
    glassreg = (lab_in == seed) if seed else np.zeros_like(inner)
    d_in = ndimage.distance_transform_edt(glassreg)
    shade = glassreg * (0.42 * (1 - smooth(0, 34, d_in)) ** 1.5 + 0.06)
    rgb = np.where(glassreg[..., None], np.array([10, 6, 14], np.float32), rgb)
    a = np.where(glassreg, shade, a)
    # the board's own rails at the crop's edges, its panel's corner, the skull
    # and the candle standing beside the mirror's foot
    a = np.where((xx < 13) | (yy < 6) | ((yy < 18) & (np.abs(xx - mx) > 13)) | ((xx < 62) & (yy < 62)), 0, a)
    a = a * (1 - smooth(-6, 6, np.minimum(78 - xx, yy - 584))) * (1 - smooth(-6, 6, np.minimum(xx - 282, yy - 596)))
    # unmix against the panel with the KEYED alpha, then fade the foot: fading
    # first would divide the panel's dark by a tiny alpha and light it up
    au = np.clip(a, 1e-3, 1)[..., None]
    col = np.clip((rgb - (1 - au) * np.array([8, 6, 11], np.float32)) / au, 0, 255)
    col = np.where((a < 0.35)[..., None], np.minimum(col, rgb * 1.6), col)
    a = a * np.clip((h - 8 - yy) / 64, 0, 1) ** 1.2
    im = Image.fromarray(np.clip(rgba(col, a), 0, 255).astype(np.uint8), "RGBA")
    im = im.resize((int(round(w * ALC_STRETCH)), h), Image.LANCZOS)
    save(np.asarray(im).astype(np.float32), "boss-alcove.webp", 90)
    print(f"      boss-alcove: {im.width}x{im.height}, medallion centre ({mx * ALC_STRETCH:.1f}, {my}), slices {ALC_TOP}/{ALC_BOT}")


# ── the rules panel's flock ─────────────────────────────────────────────────
def card_flock():
    """The kit's damask (damask.webp, lavender through an alpha pattern) at a
    fifth of its strength: a flock worked into a Trick's rules panel, there
    when you look for it and never behind a word."""
    im = np.asarray(Image.open(os.path.join(OUT, "damask.webp")).convert("RGBA")).astype(np.float32)
    a = im[..., 3] / 255.0 * 0.2
    col = np.zeros_like(im[..., :3]) + np.array([214, 184, 240], np.float32)
    save(rgba(col, a), "card-flock.webp", 90)


PIECES = {
    "plate": boss_plate, "crest": boss_crest, "roundel": roundel, "coin": nerve_coin,
    "backs": card_backs, "bracket": iron_bracket, "flock": card_flock, "beam": boss_beam, "alcove": boss_alcove,
}
SHEET = ["boss-plate.webp", "boss-crest.webp", "roundel.webp", "nerve-coin.webp", "card-backs.webp", "iron-bracket.webp"]


def contact_sheet(path):
    rows = []
    for bg in ((20, 13, 26), (120, 110, 100)):
        row = Image.new("RGB", (1700, 300), bg)
        x = 10
        for nm in SHEET:
            im = Image.open(os.path.join(OUT, nm)).convert("RGBA")
            k = min(2.0, 280 / im.height, 560 / im.width)
            im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
            row.paste(im, (x, 10), im)
            x += im.width + 12
        rows.append(row)
    sheet = Image.new("RGB", (1700, 600))
    sheet.paste(rows[0], (0, 0))
    sheet.paste(rows[1], (0, 300))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sheet.save(path)
    print("sheet ->", path)


def main():
    ap = argparse.ArgumentParser(description="Render the fight's regalia.")
    ap.add_argument("--only", default="", help="comma-separated: " + ", ".join(PIECES))
    ap.add_argument("--sheet", default="", help="write a contact sheet PNG to this path")
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("combat regalia ->", os.path.relpath(OUT, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    for nm in names:
        PIECES[nm]()
    if a.sheet:
        contact_sheet(a.sheet)


if __name__ == "__main__":
    main()
