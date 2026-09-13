"""Render the kit pieces round 2's POLISH pass added, in the materials' manner.

`tools/prep_ui_kit.py` cuts what the sample boards painted; `tools/prep_ui_materials.py`
renders brass, enamel, wood and light as lit height fields. This script uses the
second one's plumbing (ramps, normals, the board light, the brass ramp) for the
pieces the judges asked for next, so none of them is drawn with a CSS gradient:

  felt.webp           a panel's painted ground: near-black suede, mottled the
                      way selectKid's empty info panels are (tileable 256)
  felt-damask.webp    the same ground with the samples' damask flocked into it
                      (tileable on the damask's own half-drop tile)
  vellum.webp         a Curiosity's page: dark vellum, fibres and a slow tide of
                      warmer skin (tileable 256)
  coin.webp           one of the house's Buttons: a domed brass sewing button,
                      four holes (the price glyph; the word BUTTONS is gone)
  socket-round.webp   an empty filigree socket: a brass ring on four scrolled
                      lobes round a black hollow (the HUD's empty slots)
  plate-hud.webp      a small cartouche nameplate: gilt rim, notched corners,
                      near-black enamel (9-slice: the HUD's chips)
  rail-engraved.webp  the HUD's rail with an engraved gilt border along its
                      face and the brass rod along its foot (tiles every 256)
  fleuron-tl/tr/bl/br.webp
                      a brass corner scroll, in the four orientations (a
                      panel's inner double rule wears one at each corner)
  plate-rect.webp     a rectangular plate's gilt double rule with a fleuron in
                      each corner, its middle clear (9-slice: Curiosity doors)
  cloth.webp          a velvet runner with a gold braid and a bullion fringe,
                      laid over a table edge (tiles every 256): the reward stage
  plinth.webp         a gilt plinth, low and wide: moulded brass cap, dark
                      marble die, stepped brass foot (3-slice left/right)
  initial.webp        the box a drop cap is set in: a bevelled gilt frame, a
                      scrolled fleuron in each corner, a dark enamel field
  curl.webp           the corner of a survey sheet curling up off the desk

    python tools/prep_ui_polish.py               # everything
    python tools/prep_ui_polish.py --only coin   # one piece while tuning
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (the materials' plumbing)

OUT = M.OUT
ramp, hexc, smooth, noise = M.ramp, M.hexc, M.smooth, M.noise
normals, lambert, specular, brass, down, save = M.normals, M.lambert, M.specular, M.brass, M.down, M.save
periodic_noise = M.periodic_noise
INK = np.array([12, 8, 5], np.float32)


# ── drawing helpers ───────────────────────────────────────────────────────────
def spiral(cx, cy, r0, r1, a0, a1, n=64):
    """Points along a spiral from radius r0 at angle a0 to r1 at a1 (radians)."""
    t = np.linspace(0, 1, n)
    r = r0 + (r1 - r0) * t
    a = a0 + (a1 - a0) * t
    return list(zip(cx + r * np.cos(a), cy + r * np.sin(a)))


def bez(p0, p1, p2, p3, n=48):
    t = np.linspace(0, 1, n)[:, None]
    p = ((1 - t) ** 3) * np.array(p0) + 3 * ((1 - t) ** 2) * t * np.array(p1) \
        + 3 * (1 - t) * (t ** 2) * np.array(p2) + (t ** 3) * np.array(p3)
    return [tuple(q) for q in p]


def stroke_mask(W, H, strokes, ss=4):
    """Rasterise tapered strokes. strokes = [(points, w0, w1)] in output px,
    width tapering from w0 at the first point to w1 at the last."""
    im = Image.new("L", (W * ss, H * ss), 0)
    dr = ImageDraw.Draw(im)
    for pts, w0, w1 in strokes:
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            w = (w0 + (w1 - w0) * i / max(1, n - 1)) * ss / 2
            dr.ellipse([x * ss - w, y * ss - w, x * ss + w, y * ss + w], fill=255)
        for i in range(n - 1):
            w = (w0 + (w1 - w0) * i / max(1, n - 1)) * ss
            dr.line([pts[i][0] * ss, pts[i][1] * ss, pts[i + 1][0] * ss, pts[i + 1][1] * ss], fill=255, width=max(1, int(w)))
    return np.asarray(im, np.float32) / 255.0


def lit_brass_from_mask(big, ss, rng, dome=0.9, spec=0.85, lift=0.0):
    """A brass rod wherever `big` (a supersampled mask) is set: its section is
    round, lit from the board's top left, with an ink outline. Returns
    (colour_ss, alpha_ss)."""
    inside = big > 0.5
    d = ndimage.distance_transform_edt(inside) / ss
    rad = max(0.6, float(np.percentile(d[inside], 96)) if inside.any() else 1.0)
    t = np.clip(d / rad, 0, 1)
    hgt = np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1)) * rad * dome
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.35)
    n = normals(hgt, 1.0)
    col = brass(n, wear=noise(big.shape, rng, ss * 1.6), spec_amt=spec, lift=lift)
    edge = smooth(0.0, 0.9, d)
    col = col * edge[..., None] + INK * (1 - edge[..., None])
    alpha = np.clip(ndimage.gaussian_filter(inside.astype(np.float32), ss * 0.35) * 1.15, 0, 1)
    # the ink outline widens the silhouette by a hair, as the paintings do
    grown = ndimage.binary_dilation(inside, iterations=max(1, int(ss * 0.6)))
    alpha = np.maximum(alpha, grown.astype(np.float32) * 0.92)
    col = np.where((grown & ~inside)[..., None], INK, col)
    return col, alpha


def volute(cx, cy, r0, r1, a0, turns, n=60):
    """A volute: a spiral whose radius shrinks geometrically as it turns in."""
    t = np.linspace(0, 1, n)
    r = r0 * (r1 / r0) ** t
    a = a0 + turns * 2 * math.pi * t
    return list(zip(cx + r * np.cos(a), cy + r * np.sin(a)))


def corner_scroll(S, rng, ss=4, weight=1.0):
    """A brass corner flourish for the top-left corner of an S x S box: an arm
    along each edge, S-curved and ending in a volute, a small heart of C-scrolls
    on the diagonal, and a lozenge bud pointing into the corner."""
    k = S / 48.0
    w = 2.6 * k * weight
    st = []
    arm = bez((5 * k, 5 * k), (15 * k, 1.5 * k), (27 * k, 2 * k), (35 * k, 6.5 * k), 40)
    vol = volute(35.5 * k, 11.5 * k, 5.2 * k, 1.2 * k, -math.pi / 2, 0.95, 50)
    heart = bez((9 * k, 9 * k), (17 * k, 8 * k), (22 * k, 13 * k), (19.5 * k, 18 * k), 30)
    hvol = volute(16.5 * k, 16.5 * k, 3.2 * k, 0.9 * k, 0.2, 0.9, 30)
    for pts, w0, w1 in ((arm, w * 1.15, w * 0.9), (vol, w * 0.9, w * 0.45),
                        (heart, w * 0.85, w * 0.6), (hvol, w * 0.6, w * 0.35)):
        st.append((pts, w0, w1))
        st.append(([(y, x) for x, y in pts], w0, w1))      # the mirror across the diagonal
    big = stroke_mask(S, S, st, ss)
    leaf = Image.new("L", (S * ss, S * ss), 0)
    ImageDraw.Draw(leaf).polygon([(0.5 * k * ss, 0.5 * k * ss), (10 * k * ss, 5 * k * ss),
                                  (8.5 * k * ss, 8.5 * k * ss), (5 * k * ss, 10 * k * ss)], fill=255)
    return np.maximum(big, np.asarray(leaf, np.float32) / 255.0)


def rgba_from(col_ss, alpha_ss, ss):
    return np.dstack([down(col_ss, ss), down(alpha_ss, ss) * 255])


# ── grounds ───────────────────────────────────────────────────────────────────
def felt_ground(shape, rng, base=("#0b090d", "#121015", "#1f1a24")):
    """selectKid's empty panels are not a gradient: a near-black cloth with a
    fine crinkled nap (measured: mean rgb 17,15,19, deviation about 2-3), and
    under it slow blotches where the nap lies differently."""
    h, w = shape
    slow = periodic_noise(max(h, w), rng, beta=3.0, lo_cut=1, shape=(h, w))
    mid = periodic_noise(max(h, w), rng, beta=1.6, lo_cut=6, shape=(h, w))
    crinkle = 1 - np.abs(periodic_noise(max(h, w), rng, beta=1.2, lo_cut=10, shape=(h, w)))
    crinkle = (crinkle - crinkle.mean()) / (crinkle.std() + 1e-6)
    tooth = periodic_noise(max(h, w), rng, beta=0.4, lo_cut=40, shape=(h, w))
    t = np.clip(0.5 + slow * 0.2 + mid * 0.12 + crinkle * 0.09 + tooth * 0.08, 0, 1)
    return ramp(t, [(0.0, base[0]), (0.5, base[1]), (1.0, base[2])])


def felt():
    rng = np.random.default_rng(2101)
    col = felt_ground((256, 256), rng)
    save(col, "felt.webp", 88)


def felt_damask():
    """The damask flocked into the felt: the motif a few shades up from the
    ground, its edges soft, as a worn wall-cloth reads under candle light."""
    rng = np.random.default_rng(2102)
    motif = np.asarray(Image.open(os.path.join(OUT, "damask.webp")).convert("RGBA"), np.float32)[..., 3] / 255.0
    h, w = motif.shape
    col = felt_ground((h, w), rng, base=("#0d0a10", "#161119", "#211a27"))
    m = ndimage.gaussian_filter(motif, 0.8)
    flock = hexc("#3a2748")
    col = col * (1 - m[..., None] * 0.34) + flock * (m[..., None] * 0.34)
    # the flock's own pile: a highlight on its upper edges
    gy = np.gradient(ndimage.gaussian_filter(m, 1.2))[0]
    col = col + np.clip(-gy, 0, 1)[..., None] * np.array([40, 30, 52], np.float32)
    save(col, "felt-damask.webp", 88)


def vellum():
    """A page of dark vellum: warm skin drifting in slow tides, the grain of
    the hide in long faint fibres, and a few soft darker marks. Dark enough to
    carry light type; tileable 256."""
    rng = np.random.default_rng(2103)
    S = 256
    tide = periodic_noise(S, rng, beta=3.2, lo_cut=1)
    mott = periodic_noise(S, rng, beta=1.7, lo_cut=5)
    t = np.clip(0.5 + tide * 0.26 + mott * 0.14, 0, 1)
    col = ramp(t, [(0.0, "#130e14"), (0.45, "#1b1419"), (0.8, "#251c21"), (1.0, "#2d2226")])
    # fibres: stretched noise along the hide's grain, periodic by construction
    fy = np.fft.fftfreq(S)[:, None] * S
    fx = np.fft.fftfreq(S)[None, :] * S
    ang = 0.32
    u = fx * math.cos(ang) + fy * math.sin(ang)
    v = -fx * math.sin(ang) + fy * math.cos(ang)
    spec = np.exp(-(u / 16.0) ** 2) * np.exp(-(v / 30.0) ** 2) * (np.hypot(fx, fy) > 4)
    ph = rng.uniform(0, 2 * math.pi, (S, S))
    fib = np.real(np.fft.ifft2(spec * np.exp(1j * ph)))
    fib = (fib - fib.mean()) / (fib.std() + 1e-6)
    fib = np.clip(fib, 0, None) ** 1.5
    col = col + fib[..., None] * np.array([1.6, 1.3, 1.1], np.float32)
    # the grain of the skin itself: fine, isotropic, barely there
    tooth = periodic_noise(S, rng, beta=0.5, lo_cut=30)
    col = col * (1 + tooth[..., None] * 0.05)
    marks = periodic_noise(S, rng, beta=2.4, lo_cut=3)
    col = col * (1 - np.clip((marks - 0.55) * 0.9, 0, 0.18))[..., None]
    save(col, "vellum.webp", 88)


# ── metal pieces ──────────────────────────────────────────────────────────────
def coin():
    """A brass sewing button: a rolled rim, a dished face, four thread holes."""
    rng = np.random.default_rng(2201)
    S, ss = 64, 4
    SS = S * ss
    yy, xx = (np.mgrid[0:SS, 0:SS].astype(np.float32) + 0.5) / ss
    cx = cy = S / 2
    r = np.hypot(xx - cx, yy - cy)
    R = S * 0.46
    inside = r < R
    t = r / R
    rim = np.clip((t - 0.72) / 0.28, 0, 1)
    hgt = np.where(t < 0.72, 3.2 - 1.4 * (1 - t / 0.72) ** 2, 3.2 + np.sqrt(np.clip(1 - (2 * rim - 1) ** 2, 0, 1)) * 3.4)
    hgt = np.where(inside, hgt, 0)
    holes = np.zeros_like(inside)
    for hx, hy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        d = np.hypot(xx - (cx + hx * S * 0.105), yy - (cy + hy * S * 0.105))
        holes |= d < S * 0.058
        hgt = np.where(d < S * 0.085, hgt - np.clip(1 - d / (S * 0.085), 0, 1) * 1.2, hgt)
    hgt = np.where(holes, -2.0, hgt)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 0.9)
    col = brass(n, wear=noise((SS, SS), rng, ss * 1.2), lift=0.04)
    col = np.where(holes[..., None], np.array([16, 10, 6], np.float32), col)
    edge = smooth(0, 0.9, R - r)
    col = col * edge[..., None] + INK * (1 - edge[..., None])
    alpha = np.clip((R + 0.8 - r) / 1.0, 0, 1)
    save(rgba_from(col, alpha, ss), "coin.webp", 92)


def socket_round():
    """An empty slot on the HUD rail, as the boards would set one: a brass ring
    on four scrolled lobes, a black hollow inside, lit from the top left."""
    rng = np.random.default_rng(2202)
    S, ss = 64, 4
    SS = S * ss
    yy, xx = (np.mgrid[0:SS, 0:SS].astype(np.float32) + 0.5) / ss
    c = S / 2
    r = np.hypot(xx - c, yy - c)
    ring_o, ring_i = S * 0.36, S * 0.265
    ring = (r < ring_o) & (r > ring_i)
    # four lobes on the diagonals: small C-scrolls
    strokes = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        ox, oy = c + math.cos(a) * S * 0.36, c + math.sin(a) * S * 0.36
        strokes.append((spiral(ox, oy, S * 0.075, S * 0.018, a - 1.2, a + 3.0, 40), S * 0.05, S * 0.028))
    for k in range(4):                           # studs on the axes
        a = k * math.pi / 2
        strokes.append(([(c + math.cos(a) * S * 0.405, c + math.sin(a) * S * 0.405)], S * 0.07, S * 0.07))
    lobes = stroke_mask(S, S, strokes, ss) > 0.5
    metal_mask = (ring | lobes).astype(np.float32)
    col, alpha = lit_brass_from_mask(metal_mask, ss, rng, dome=1.0)
    # the hollow: black enamel, deepest at its top where the ring shades it
    hol = r <= ring_i
    ty = (yy - (c - ring_i)) / (2 * ring_i)
    hollow = ramp(np.clip(ty, 0, 1), [(0, "#050306"), (1, "#1b1320")])
    hollow = hollow * (0.55 + 0.45 * smooth(0, ring_i * 0.6, ring_i - r))[..., None]
    col = np.where(hol[..., None], hollow, col)
    alpha = np.where(hol, 1.0, alpha)
    # the inner lip of the ring in ink
    lip = np.abs(r - ring_i) < 0.7
    col = np.where(lip[..., None], INK, col)
    save(rgba_from(col, alpha, ss), "socket-round.webp", 92)


def plate_hud():
    """The HUD's value plate, in the Companion tiles' manner: a near-black field
    in a bevelled gilt rim with notched corners and beads, drawn at twice the size
    it is shown so the rim stays a rod and never a line."""
    M.cartouche_piece(200, 56, "plate-hud.webp", notch=0.26, bulge=0.14, rim=0.1,
                      enamel_top="#1e1a21", enamel_mid="#141117", enamel_bot="#0a080c", seed=2203)


def rail_engraved():
    """The HUD rail: black lacquer over dark wood with an engraved gilt border
    along its face (a line, a row of pricked dots, a line), and the brass rod
    with its bead-and-reel along its foot. Tiles every 256 px."""
    rng = np.random.default_rng(2204)
    W, H, ss = 512, 92, 2
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    body = M.wood_albedo(SH, SW, rng, base="#1b1217", light="#281b22", dark="#0e090c", scale=2.4)
    body = body * (1.0 - 0.3 * smooth(0, H * 0.8, yy))[..., None]
    lac = np.exp(-((yy - 6) / 5) ** 2) * 16
    col = body + lac[..., None] * np.array([0.8, 0.7, 1.0], np.float32)
    # the engraving: two fine gilt lines, and between them a running scroll of
    # pricked dots, cut into the lacquer (a dark groove, a lit lower lip)
    hgt = np.zeros((SH, SW), np.float32)
    for gy in (9.0, 63.0):
        hgt -= np.exp(-((yy - gy) / 0.6) ** 2) * 1.6
    wave = 36.0 + np.sin(xx / 32.0 * math.pi) * 17.0
    dots = ((xx % 8.0) < 2.2) & (np.abs(yy - wave) < 1.2)
    hgt = np.where(dots, hgt - 1.2, hgt)
    gilt = (np.abs(yy - 9.0) < 0.8) | (np.abs(yy - 63.0) < 0.8) | dots
    engraved = brass(normals(ndimage.gaussian_filter(-hgt * ss * 3, ss * 0.4), 0.8), lift=-0.1) * 0.62
    col = np.where(gilt[..., None], col * 0.35 + engraved * 0.65, col)
    # the rod (as prep_ui_materials.rail)
    r0, r1 = 72.0, 86.0
    t = np.clip((yy - r0) / (r1 - r0), 0, 1)
    rod = (yy >= r0) & (yy <= r1)
    reel = 0.5 + 0.5 * np.cos((xx % 32) / 32 * 2 * np.pi)
    prof = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * (0.75 + 0.25 * reel)
    lip = (yy >= r0 - 6) & (yy < r0 - 3)
    h2 = np.where(rod, prof * 7, 0) + np.where(lip, 2.5, 0)
    for sx in (128.0, 384.0):
        d = np.hypot(xx - sx, yy - (r0 + r1) / 2)
        h2 = np.where(d < 9, np.maximum(h2, 9 * np.sqrt(np.clip(1 - (d / 9) ** 2, 0, 1)) + 2), h2)
    h2 = ndimage.gaussian_filter(h2, ss * 0.5)
    metal = brass(normals(h2 * ss, 0.9), wear=noise((SH, SW), rng, ss * 2))
    solid = rod | lip | (np.minimum(np.hypot(xx - 128, yy - 79), np.hypot(xx - 384, yy - 79)) < 9.5)
    col = np.where(solid[..., None], metal, col)
    for edge_y in (r0 - 6.6, r0 - 2.6, r0 - 0.4, r1 + 0.6):
        m = np.abs(yy - edge_y) < 0.7
        col = np.where(m[..., None], INK, col)
    col = np.where((yy > r1 + 1.2)[..., None], np.array([6, 4, 7], np.float32) * (1 - smooth(r1, H, yy))[..., None], col)
    alpha = np.where(yy > r1 + 1.2, 1 - smooth(r1 + 1, H, yy), 1.0)
    save(np.dstack([down(col, ss), down(alpha, ss) * 255]), "rail-engraved.webp", 88)


def fleurons():
    rng = np.random.default_rng(2205)
    S, ss = 48, 4
    big = corner_scroll(S, rng, ss)
    col, alpha = lit_brass_from_mask(big, ss, rng, dome=1.0, lift=0.02)
    out = rgba_from(col, alpha, ss)
    save(out, "fleuron-tl.webp", 92)
    # the light stays top-left in every orientation: re-light the mirrored masks
    for name, flip in (("fleuron-tr.webp", (False, True)), ("fleuron-bl.webp", (True, False)), ("fleuron-br.webp", (True, True))):
        b = big
        if flip[0]:
            b = b[::-1]
        if flip[1]:
            b = b[:, ::-1]
        c2, a2 = lit_brass_from_mask(np.ascontiguousarray(b), ss, rng, dome=1.0, lift=0.02)
        save(rgba_from(c2, a2, ss), name, 92)


def plate_rect():
    """A rectangular plate's frame, for a 9-slice with the middle left clear: an
    outer gilt rod, a fine inner line a few px inside it, and a fleuron sitting in
    each corner where the two meet. 240x80, slices 24."""
    rng = np.random.default_rng(2206)
    W, H, ss = 240, 80, 4
    SW, SH = W * ss, H * ss
    yy, xx = (np.mgrid[0:SH, 0:SW].astype(np.float32) + 0.5) / ss
    o, i = 3.5, 8.5
    outer = (np.minimum.reduce([xx - o, W - o - xx, yy - o, H - o - yy]))
    inner = (np.minimum.reduce([xx - i, W - i - xx, yy - i, H - i - yy]))
    rod = (np.abs(outer) < 1.9)
    line = (np.abs(inner) < 0.85) & (xx > i + 10) & (xx < W - i - 10) | (np.abs(inner) < 0.85) & (yy > i + 10) & (yy < H - i - 10)
    mask = (rod | line).astype(np.float32)
    # a corner fleuron (small) in each corner, over the meeting of the rules
    S = 30
    fl = corner_scroll(S, rng, ss, weight=1.15)
    for cxs, cys, fx, fy in ((2, 2, False, False), (W - S - 2, 2, False, True), (2, H - S - 2, True, False), (W - S - 2, H - S - 2, True, True)):
        f = fl
        if fx:
            f = f[::-1]
        if fy:
            f = f[:, ::-1]
        y0, x0 = int(cys * ss), int(cxs * ss)
        mask[y0:y0 + f.shape[0], x0:x0 + f.shape[1]] = np.maximum(mask[y0:y0 + f.shape[0], x0:x0 + f.shape[1]], f)
    col, alpha = lit_brass_from_mask(mask, ss, rng, dome=1.0)
    save(rgba_from(col, alpha, ss), "plate-rect.webp", 92)


def cloth():
    """The reward's table: a runner of aubergine velvet over a dark table edge,
    seen from just above — the cloth's top receding into shadow, its front edge
    trimmed with a gold braid, and a bullion fringe hanging off it. 512x150,
    tiling every 256."""
    rng = np.random.default_rng(2207)
    W, H, ss = 512, 150, 2
    SW, SH = W * ss, H * ss
    yy, xx = (np.mgrid[0:SH, 0:SW].astype(np.float32) + 0.5) / ss
    TOP1 = 96.0                      # the cloth's front edge (its top face above)
    BRAID0, BRAID1 = 88.0, 100.0
    FRINGE1 = 132.0
    col = np.zeros((SH, SW, 3), np.float32)
    alpha = np.zeros((SH, SW), np.float32)
    # the velvet top face: folds running away from the viewer, lit at the front
    folds = np.sin(xx / 256.0 * 2 * math.pi * 3 + np.sin(xx / 256.0 * 2 * math.pi) * 1.2) * 0.5 + 0.5
    nap = noise((SH, SW), rng, 2.0) * 0.08 + noise((SH, SW), rng, 0.6) * 0.05
    tface = np.clip(yy / TOP1, 0, 1)
    t = np.clip(0.22 + 0.5 * tface ** 1.6 + 0.12 * folds * tface + nap, 0, 1)
    vel = ramp(t, [(0, "#08050b"), (0.4, "#1d1027"), (0.75, "#3a2250"), (1, "#5a3b74")])
    top = yy < BRAID0
    col = np.where(top[..., None], vel, col)
    alpha = np.where(top, np.clip(yy / 18.0, 0, 1), alpha)
    # the braid: a twisted gilt cord
    tb = np.clip((yy - BRAID0) / (BRAID1 - BRAID0), 0, 1)
    twist = np.cos(((xx + (yy - BRAID0) * 1.3) % 10.0) / 10.0 * 2 * math.pi) * 0.5 + 0.5
    hb = np.sqrt(np.clip(1 - (2 * tb - 1) ** 2, 0, 1)) * (3.5 + twist * 1.8)
    braid = (yy >= BRAID0) & (yy < BRAID1)
    metal = brass(normals(ndimage.gaussian_filter(np.where(braid, hb, 0) * ss, ss * 0.4), 1.0),
                  wear=noise((SH, SW), rng, ss))
    col = np.where(braid[..., None], metal, col)
    alpha = np.where(braid, 1.0, alpha)
    # the bullion fringe: twisted gilt strands in little bunches, their lengths
    # varying, each strand a round cord with a twist, lit on the left
    fr = (yy >= BRAID1) & (yy < FRINGE1)
    period = 5.0
    strand = (xx % period) / period
    sprof = np.sqrt(np.clip(1 - ((strand - 0.5) / 0.3) ** 2, 0, 1))
    idx = np.floor(xx / period)
    jitter = np.sin(idx * 12.9898) * 43758.5453
    jitter = jitter - np.floor(jitter)
    length = FRINGE1 - 3 - jitter * 10
    hang = fr & (yy < length) & (sprof > 0.02)
    tw = 0.5 + 0.5 * np.cos(((yy + xx * 0.6) % 4.0) / 4.0 * 2 * math.pi)
    hf = sprof * (2.2 + 0.9 * tw)
    fm = brass(normals(ndimage.gaussian_filter(np.where(hang, hf, 0) * ss, ss * 0.3), 0.9), lift=-0.2, spec_amt=0.35)
    shade = 0.78 * (1 - 0.6 * smooth(BRAID1, FRINGE1, yy))
    col = np.where(hang[..., None], fm * shade[..., None], col)
    alpha = np.where(hang, np.clip(sprof * 2.2, 0, 1) * (1 - np.clip((yy - (length - 2.5)) / 2.5, 0, 1)), alpha)
    # ink between the cloth and the braid, and the braid's lower edge
    for ey in (BRAID0 + 0.3, BRAID1 - 0.2):
        m = np.abs(yy - ey) < 0.6
        col = np.where(m[..., None], INK, col)
    # the shadow the fringe throws
    sh = (yy >= FRINGE1 - 10) & ~hang
    ts = np.clip((yy - (FRINGE1 - 10)) / (H - FRINGE1 + 10), 0, 1)
    alpha = np.where(sh, np.maximum(alpha, (1 - ts) ** 1.8 * 0.7), alpha)
    col = np.where(sh[..., None] & (alpha > 0)[..., None] & ~hang[..., None], np.array([4, 2, 6], np.float32), col)
    save(np.dstack([down(col, ss), down(alpha, ss) * 255]), "cloth.webp", 90)


def plinth():
    """A gilt plinth for the card an expedition leaned on, drawn low and wide so
    it reads under a small card: a moulded brass cap, a dark marble die with a
    brass inlay, a stepped brass foot. 320x56, 3-slice at 36 px each side."""
    rng = np.random.default_rng(2208)
    W, H, ss = 320, 56, 3
    SW, SH = W * ss, H * ss
    yy, xx = (np.mgrid[0:SH, 0:SW].astype(np.float32) + 0.5) / ss
    col = np.zeros((SH, SW, 3), np.float32)

    def band(y0, y1, inset):
        return (yy >= y0) & (yy < y1) & (xx >= inset) & (xx < W - inset)
    cap = band(3, 15, 6)
    die = band(15, 36, 20)
    foot1 = band(36, 43, 12)
    foot2 = band(43, 51, 4)
    hgt = np.zeros((SH, SW), np.float32)
    hgt = np.where(cap, M.moulding(yy - 3, [(0, 3, "fillet", 2), (3, 9, "bead", 4.5), (9, 12, "cove", 2.5)]), hgt)
    hgt = np.where(foot1, M.moulding(yy - 36, [(0, 7, "bead", 3.5)]), hgt)
    hgt = np.where(foot2, M.moulding(yy - 43, [(0, 2, "fillet", 1.5), (2, 8, "ogee", 3.5)]), hgt)
    for b, inset in ((cap, 6), (foot1, 12), (foot2, 4)):
        dx = np.minimum(xx - inset, W - inset - xx)
        hgt = np.where(b, hgt * np.clip(dx / 4.0, 0.25, 1), hgt)
    n = normals(ndimage.gaussian_filter(hgt * ss, ss * 0.4), 1.0)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 1.5), lift=0.05)
    col = np.where((cap | foot1 | foot2)[..., None], metal, col)
    vein = np.abs(np.sin((xx * 0.06 + yy * 0.11) + noise((SH, SW), rng, 8) * 5)) ** 12
    mt = np.clip(0.35 + noise((SH, SW), rng, 10) * 0.25 + vein * 0.3, 0, 1)
    marble = ramp(mt, [(0, "#0b080d"), (0.5, "#1c1520"), (1, "#3c2e42")])
    dx = np.minimum(xx - 20, W - 20 - xx)
    marble = marble * (0.55 + 0.45 * smooth(0, 22, dx))[..., None]
    col = np.where(die[..., None], marble, col)
    inl = die & (np.abs(yy - 25.5) < 1.1) & (dx > 8)
    col = np.where(inl[..., None], brass(normals(np.zeros((SH, SW), np.float32), 1.0)) * 0.9, col)
    solid = cap | die | foot1 | foot2
    alpha = np.where(solid, 1.0, 0.0)
    for ey, x_in in ((3.2, 6), (15.0, 6), (36.0, 12), (43.0, 4), (50.6, 4)):
        m = (np.abs(yy - ey) < 0.55) & (xx >= x_in) & (xx < W - x_in)
        col = np.where(m[..., None], INK, col)
    sh = (yy >= 51)
    alpha = np.where(sh, (1 - smooth(51, H, yy)) * 0.6 * smooth(0, 30, np.minimum(xx, W - xx)), alpha)
    col = np.where(sh[..., None], np.array([3, 2, 4], np.float32), col)
    save(np.dstack([down(col, ss), down(alpha, ss) * 255]), "plinth.webp", 92)


def initial():
    """The box a drop cap sits in: a bevelled gilt frame with a scroll in each
    corner round a dark violet enamel field, faintly damasked."""
    rng = np.random.default_rng(2209)
    S, ss = 96, 4
    SS = S * ss
    yy, xx = (np.mgrid[0:SS, 0:SS].astype(np.float32) + 0.5) / ss
    edge = np.minimum.reduce([xx - 5, S - 5 - xx, yy - 5, S - 5 - yy])
    frame = (edge >= 0) & (edge < 6.5)
    inner_line = np.abs(edge - 10.0) < 0.9
    mask = (frame | inner_line).astype(np.float32)
    fl = corner_scroll(30, rng, ss, weight=1.1)
    for x0, y0, fx, fy in ((9, 9, False, False), (S - 39, 9, False, True), (9, S - 39, True, False), (S - 39, S - 39, True, True)):
        f = fl
        if fx:
            f = f[::-1]
        if fy:
            f = f[:, ::-1]
        mask[y0 * ss:y0 * ss + f.shape[0], x0 * ss:x0 * ss + f.shape[1]] = np.maximum(
            mask[y0 * ss:y0 * ss + f.shape[0], x0 * ss:x0 * ss + f.shape[1]], f)
    col, alpha = lit_brass_from_mask(mask, ss, rng, dome=1.0)
    field = (edge >= 6.5) & ~(mask > 0.5)
    ty = np.clip((yy - 11) / (S - 22), 0, 1)
    en = ramp(1 - ty, [(0, "#0c0810"), (0.6, "#1c1226"), (1, "#2c1d3b")])
    en = en * (0.6 + 0.4 * smooth(6.5, 20, edge))[..., None]
    col = np.where(field[..., None], en, col)
    alpha = np.where(edge >= 0, np.maximum(alpha, 1.0), alpha)
    alpha = alpha * np.clip(edge + 1.0, 0, 1)
    save(rgba_from(col, alpha, ss), "initial.webp", 92)


def curl():
    """A survey sheet's bottom-right corner folded back on itself: past the fold
    the desk shows (dark), the flap of paper lies over the sheet with its
    underside up — shaded where it rolls at the fold, lit along its crown — and
    it throws a soft shadow onto the sheet beside it. 128x128."""
    rng = np.random.default_rng(2210)
    S, ss = 128, 3
    SS = S * ss
    yy, xx = (np.mgrid[0:SS, 0:SS].astype(np.float32) + 0.5) / ss
    F = 74.0                                            # the fold's legs along each edge
    s_ = xx + yy                                        # constant along lines parallel to the fold
    fold = 2 * S - F
    past = s_ > fold                                    # the corner that has lifted away
    # the flap: the mirror of that corner across the fold line
    flap = (s_ <= fold) & (s_ > fold - F) & (xx > S - F - 0.5) & (yy > S - F - 0.5)
    # distance from the fold line (0 at the fold, F at the flap's tip)
    dfold = (fold - s_) / math.sqrt(2)
    tip = F / math.sqrt(2)
    paper = ramp(np.clip(0.5 + noise((SS, SS), rng, 7) * 0.25 + noise((SS, SS), rng, 1.2) * 0.08, 0, 1),
                 [(0, "#a99474"), (0.5, "#bca786"), (1, "#cbb795")])
    tt = np.clip(dfold / tip, 0, 1)
    light = 0.72 + 0.22 * np.exp(-((tt - 0.35) / 0.25) ** 2) - 0.12 * tt - 0.2 * np.exp(-(tt / 0.08) ** 2)
    fcol = paper * light[..., None]
    col = np.zeros((SS, SS, 3), np.float32)
    alpha = np.zeros((SS, SS), np.float32)
    # the shadow the flap throws on the sheet, up and to the left of its edges
    fm = ndimage.gaussian_filter(flap.astype(np.float32), ss * 5.0)
    fm = np.roll(np.roll(fm, -int(ss * 4), 0), -int(ss * 4), 1)
    alpha = np.maximum(alpha, np.clip(fm * 0.9, 0, 0.7))
    col[:] = np.array([20, 12, 6], np.float32)
    # the desk where the corner was
    alpha = np.where(past, 1.0, alpha)
    col = np.where(past[..., None], np.array([10, 7, 10], np.float32), col)
    # the flap
    col = np.where(flap[..., None], fcol, col)
    alpha = np.where(flap, 1.0, alpha)
    edge = ndimage.binary_dilation(flap, iterations=2) & ~flap & ~past
    col = np.where(edge[..., None], np.array([70, 52, 34], np.float32), col)
    alpha = np.where(edge, 0.85, alpha)
    save(rgba_from(col, ndimage.gaussian_filter(alpha, 0.5), ss), "curl.webp", 90)


PIECES = {
    "felt": felt, "felt-damask": felt_damask, "vellum": vellum,
    "coin": coin, "socket-round": socket_round, "plate-hud": plate_hud,
    "rail-engraved": rail_engraved, "fleurons": fleurons, "plate-rect": plate_rect,
    "cloth": cloth, "plinth": plinth, "initial": initial, "curl": curl,
}


def main():
    ap = argparse.ArgumentParser(description="Render round 2's polish pieces.")
    ap.add_argument("--only", default="", help="comma-separated: " + ", ".join(PIECES))
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("polish ->", os.path.relpath(OUT, M.ROOT))
    for nm in names:
        PIECES[nm]()


if __name__ == "__main__":
    main()
