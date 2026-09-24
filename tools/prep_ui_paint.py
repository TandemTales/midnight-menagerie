"""Paint the kit's grounds and plates the way the samples are painted.

Round 1's judges said the same two things about every converted screen: the
room behind the boards is a RENDER (straight CG mouldings, voronoi cobbles, a
wallpaper tone laid flat) and the plates on it are CSS (stadium pills, flat
gradient panels). `tools/prep_ui_materials.py` renders brass, wood and stone
from height fields; this script takes what those renders and the samples
themselves give and PAINTS with it:

  * every line is drawn by a hand: rails, panel frames and slab joints wander a
    pixel or two, corners are chipped, nothing is ruled;
  * forms are laid in as flat planes of value and then fused the way paint
    fuses, with a generalized Kuwahara filter (the classic oil-paint
    abstraction) rather than smoothed like a render;
  * every form carries the samples' own dark ink line and their own texture —
    the felt of selectKid's empty info panels, lifted off the painting;
  * light is painted: a candle's pool has a brushed, broken edge and a
    moonbeam carries streaks, never a perfect gradient.

Round 2's POLISH builder BRAID wrote this; round 3's ONYX grafted its painted
room into the kit (tools/prep_ui_surfaces.py paints the fills that stand in it).

Outputs (game/assets/ui/kit/), as PIECES below ships them:

  room.webp           the placeholder room, painted, in the dark
  room-warm.webp      the same painting under candle light
  room-moon.webp      the same painting under moonlight
  pool.webp           a candle's light on a wall, brushed (mask)
  beam.webp / -r      a shaft of moonlight, streaked (mask)

    python tools/prep_ui_paint.py              # everything
    python tools/prep_ui_paint.py --only room  # one piece while tuning
    python tools/prep_ui_paint.py --only room --preview DIR   # PNG previews too
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (the shared ramps, brass and light)

ROOT = M.ROOT
UI = M.UI
OUT = M.OUT
PREVIEW = None

# How hard the ground's tooth shows through the paint (see `room`). 0.13 is by
# eye: 0.20 reaches the samples' own figure and reads as film grain.
TOOTH = 0.13

hexc, ramp, smooth, noise, normals, lambert, specular = (
    M.hexc, M.ramp, M.smooth, M.noise, M.normals, M.lambert, M.specular)


# ── plumbing ────────────────────────────────────────────────────────────────
def save(arr, name, quality=88, lossless=False):
    path = M.save(arr, name, quality, lossless)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        a = np.clip(arr, 0, 255).astype(np.uint8)
        Image.fromarray(a).save(os.path.join(PREVIEW, os.path.splitext(name)[0] + ".png"))
    return path


def sample(name):
    return np.asarray(Image.open(os.path.join(UI, name)).convert("RGB"), np.float32)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def wob1d(n, rng, scale, amp):
    """A slow, smooth 1-D wander: how far a hand-drawn line strays."""
    k = max(2, int(n / scale) + 3)
    pts = rng.normal(0, 1, k).astype(np.float32)
    x = np.linspace(0, k - 1.001, n)
    i = x.astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    v = pts[i] * (1 - f) + pts[i + 1] * f
    return v / (np.abs(v).max() + 1e-6) * amp


def resize_f(a, w, h):
    """Bicubic resize of a float field (any range)."""
    lo, hi = float(a.min()), float(a.max())
    u = ((a - lo) / max(hi - lo, 1e-6) * 65535).astype(np.uint16)
    im = Image.fromarray(u).resize((w, h), Image.BICUBIC)
    return np.asarray(im, np.float32) / 65535 * (hi - lo) + lo


def aniso_noise(h, w, rng, sx, sy, angle=0.0):
    """Noise smeared along a direction: the drag of a loaded brush."""
    pad = int(max(sx, sy) * 2)
    big = rng.normal(0, 1, (h + 2 * pad, w + 2 * pad)).astype(np.float32)
    if angle:
        big = ndimage.rotate(big, angle, reshape=False, order=1, mode="wrap")
    big = ndimage.gaussian_filter(big, (sy, sx), mode="wrap")
    if angle:
        big = ndimage.rotate(big, -angle, reshape=False, order=1, mode="wrap")
    n = big[pad:pad + h, pad:pad + w]
    return n / (np.abs(n).max() + 1e-6)


# ── the paint itself ────────────────────────────────────────────────────────
def kuwahara(img, radius=5, sectors=8, q=8.0):
    """Generalized Kuwahara (Papari, Petkov & Campisi 2007).

    Every pixel takes the mean of whichever of its surrounding wedges is the
    most uniform, so edges stay put and everything between them settles into
    flat strokes of paint. It is the filter painters' tools call "oil paint",
    and it is what turns a render's even gradients into laid-in value."""
    H, W, C = img.shape
    r = radius
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
    ang = np.arctan2(yy, xx)
    dist = np.hypot(xx, yy)
    g = np.exp(-(dist ** 2) / (2 * (r * 0.5) ** 2)) * (dist <= r + 0.5)
    num = np.zeros((H, W, C), np.float32)
    den = np.zeros((H, W), np.float32)
    sq = img * img
    for k in range(sectors):
        mid = -np.pi + 2 * np.pi * (k + 0.5) / sectors
        d = np.angle(np.exp(1j * (ang - mid)))
        w = np.exp(-(d ** 2) / (2 * (np.pi / sectors * 0.85) ** 2)) * g
        w[r, r] = g[r, r] / sectors
        w /= w.sum()
        m = np.stack([ndimage.convolve(img[..., c], w, mode="reflect") for c in range(C)], -1)
        s2 = np.stack([ndimage.convolve(sq[..., c], w, mode="reflect") for c in range(C)], -1)
        var = np.clip(s2 - m * m, 0, None).sum(-1)
        wk = 1.0 / (1.0 + var) ** (q / 2)
        num += m * wk[..., None]
        den += wk
    return num / den[..., None]


def felt_tile(n=512, seed=5):
    """selectKid's empty info panels, lifted off the painting as a seamless tile.

    The panels are not a flat colour: they are a dark violet suede, mottled and
    scratched, lit a little from above. The texture is quilted on a torus from
    the five empty interiors with soft cross-faded patches; each patch has its
    own lighting flattened away first so the tile never shows a seam of light."""
    sk = sample("selectKid.png")
    boxes = [(706, 412, 1080, 512), (712, 780, 1086, 928), (702, 600, 866, 702),
             (922, 600, 1086, 702), (704, 266, 1078, 336)]
    srcs = []
    for x0, y0, x1, y1 in boxes:
        p = sk[y0:y1, x0:x1].copy()
        low = np.stack([ndimage.gaussian_filter(p[..., c], 18) for c in range(3)], -1)
        srcs.append(p - low)                       # the texture, lighting removed
    base = np.mean([sk[y0:y1, x0:x1].reshape(-1, 3).mean(0) for x0, y0, x1, y1 in boxes], axis=0)
    rng = np.random.default_rng(seed)
    acc = np.zeros((n, n, 3), np.float32)
    wsum = np.zeros((n, n), np.float32)
    P = 88
    yy, xx = np.mgrid[0:P, 0:P]
    win = (np.sin(np.pi * (xx + .5) / P) * np.sin(np.pi * (yy + .5) / P)) ** 2
    for oy in range(0, n, P // 3):
        for ox in range(0, n, P // 3):
            s = srcs[int(rng.integers(0, len(srcs)))]
            if s.shape[0] <= P or s.shape[1] <= P:
                s = srcs[1]
            sy = int(rng.integers(0, s.shape[0] - P))
            sx = int(rng.integers(0, s.shape[1] - P))
            p = s[sy:sy + P, sx:sx + P]
            if rng.random() < 0.5:
                p = p[:, ::-1]
            ys = (np.arange(P) + oy + int(rng.integers(0, 12))) % n
            xs = (np.arange(P) + ox + int(rng.integers(0, 12))) % n
            acc[np.ix_(ys, xs)] += p * win[..., None]
            wsum[np.ix_(ys, xs)] += win
    tex = acc / np.maximum(wsum, 1e-3)[..., None]
    # overlapping patches average the tooth away: give it back its own contrast
    src_std = np.mean([s_.std() for s_ in srcs])
    tex = tex / (tex.std() + 1e-6) * src_std
    # a slow mottle, the way the painting's panels are never one value
    mott = M.periodic_noise(n, rng, beta=2.2, lo_cut=2)
    col = base[None, None, :] * (1 + mott[..., None] * 0.10) + tex
    return col


def grit(h, w, seed=11, scale=1.0):
    """The felt's texture alone, as a neutral multiplier around 1.0."""
    t = felt_tile(512, seed)
    l = lum(t)
    l = l - ndimage.gaussian_filter(l, 24, mode="wrap")
    l = 1 + l / (l.std() + 1e-6) * 0.16
    reps_y, reps_x = int(np.ceil(h / (512 * scale))), int(np.ceil(w / (512 * scale)))
    if scale != 1.0:
        l = resize_f(l, int(512 * scale), int(512 * scale))
    tiled = np.tile(l, (reps_y + 1, reps_x + 1))[:h, :w]
    return tiled


# ── the painted room ─────────────────────────────────────────────────────────
ROOM_W, ROOM_H = M.ROOM_W, M.ROOM_H
Y_PIC, Y_DADO, Y_WAIN, Y_SKIRT, Y_FLOOR = M.Y_PIC, M.Y_DADO, M.Y_WAIN, M.Y_SKIRT, M.Y_FLOOR


def painted_wall(H, W, rng):
    """Flocked damask hung in strips, gone soft with a century of candle soot.
    Returns albedo and a relief height for the motif."""
    yy = np.arange(H, dtype=np.float32)[:, None]
    motif = M.damask_motif()
    mt = Image.fromarray((motif * 255).astype(np.uint8))
    mt = mt.resize((int(mt.width * 1.5), int(mt.height * 1.5)), Image.LANCZOS)
    motif = np.asarray(mt, np.float32) / 255.0
    m = M.tile(motif, H, W, ox=61, oy=23)
    # the paint does not print the pattern: a dry brush drags it on, so it
    # thins and breaks where the brush lifted
    drag = aniso_noise(H, W, rng, 60, 7, angle=-8)
    lift = smooth(-0.55, 0.35, drag + noise((H, W), rng, 40) * 0.6)
    m = ndimage.gaussian_filter(m, 1.3) * (0.35 + 0.65 * lift)
    ground = hexc("#2a1a31")
    flock = hexc("#3d2748")
    wall = ground * (1 - m[..., None] * 0.75) + flock * (m[..., None] * 0.75)
    # glazes: big soft patches of warmer and colder paint
    glaze = noise((H, W), rng, 150) * 0.22 + noise((H, W), rng, 45) * 0.08
    hue = noise((H, W), rng, 220)
    wall = wall * (1 + glaze[..., None])
    wall = wall + hue[..., None] * np.array([5.0, -2.0, 3.0], np.float32)
    # soot: darker towards the ceiling and in a band over the chair rail
    soot = 1 - 0.28 * (1 - smooth(0, 300, yy)) - 0.10 * np.exp(-((yy - 600) / 26) ** 2)
    wall = wall * soot[..., None]
    # the strips' seams, hand-hung: each wanders a little off plumb
    seams = np.zeros((H, W), np.float32)
    xs = np.arange(W, dtype=np.float32)[None, :]
    for sx in range(211, W, 424):
        off = wob1d(H, rng, 240, 2.2)[:, None]
        seams += np.exp(-((xs - sx - off) / 1.3) ** 2)
    wall = wall * (1 - seams[..., None] * 0.30)
    return wall, m * 1.5


def rail_height(yy, xx, y0, y1, prof, wob):
    """A moulding whose top and bottom edges are drawn, not ruled."""
    ys = yy - wob
    sel = (ys >= y0) & (ys < y1)
    h = np.zeros_like(yy)
    h[sel] = 14 + M.moulding(ys[sel] - y0, prof)
    return sel, h


def painted_wood(h, w, rng, base, light, dark, vertical=False):
    """Walnut as a painter lays it in: a few long streaks of lighter and darker
    wood dragged along the grain, never a render's fine rings."""
    if vertical:
        return np.ascontiguousarray(painted_wood(w, h, rng, base, light, dark).transpose(1, 0, 2))
    streak = aniso_noise(h, w, rng, 140, 5.0)
    broad = aniso_noise(h, w, rng, 300, 40)
    patch = noise((h, w), rng, 60)
    t = 0.5 + streak * 0.12 + broad * 0.22 + patch * 0.14
    return ramp(np.clip(t, 0, 1), [(0.0, dark), (0.5, base), (1.0, light)])


def wobbly_box_distance(xx, yy, x0, x1, y0, y1, rng, amp=2.0, chip=6.0):
    """Distance inside a hand-drawn rectangle: every edge wanders on its own, and
    the corners are knocked round like old joinery."""
    H, W = xx.shape
    top = y0 + wob1d(W, rng, 180, amp)[None, :]
    bot = y1 + wob1d(W, rng, 180, amp)[None, :]
    lef = x0 + wob1d(H, rng, 120, amp)[:, None]
    rig = x1 + wob1d(H, rng, 120, amp)[:, None]
    dx = np.minimum(xx - lef, rig - xx)
    dy = np.minimum(yy - top, bot - yy)
    inside = (dx > 0) & (dy > 0)
    # rounded corners: distance to the corner arc where both are small
    cd = chip - np.hypot(np.clip(chip - dx, 0, None), np.clip(chip - dy, 0, None))
    d = np.minimum(np.minimum(dx, dy), cd)
    return np.where(inside & (d > 0), d, 0), inside & (d > 0)


def painted_flagstones(h, w, rng):
    """The Kid board's floor: big irregular slabs worn flat on top, thin dark
    joints, a bevel along every edge that catches whatever light there is, the
    odd crack, and all of it crowding together towards the wall because it is
    seen from eye level. Laid on a cylinder so the strip wraps left to right.
    Returns albedo, height, ink and the painted lip of light."""
    from scipy.spatial import cKDTree
    V = 300.0                                   # ground depth units in the strip
    GAMMA = 1.65
    n = int(w * V / (78 * 50))
    seeds = np.column_stack([rng.uniform(0, w, n), rng.uniform(0, V, n)])
    gx, gy = np.meshgrid(np.arange(0, w, 4.0), np.arange(0, V, 4.0))
    grid = np.column_stack([gx.ravel(), gy.ravel()])
    for _ in range(3):
        wrapped = np.vstack([seeds, seeds + [w, 0], seeds - [w, 0]])
        _, idx = cKDTree(wrapped).query(grid)
        idx = idx % n
        cs = np.zeros(n); sn = np.zeros(n); sy = np.zeros(n); cnt = np.zeros(n)
        ang = grid[:, 0] / w * 2 * np.pi
        np.add.at(cs, idx, np.cos(ang)); np.add.at(sn, idx, np.sin(ang))
        np.add.at(sy, idx, grid[:, 1]); np.add.at(cnt, idx, 1)
        ok = cnt > 0
        seeds[ok, 0] = (np.arctan2(sn[ok], cs[ok]) / (2 * np.pi) * w) % w
        seeds[ok, 1] = sy[ok] / cnt[ok]
    # stretch the stones sideways a little: slabs, not cobbles
    seeds_s = seeds * [1.0, 1.45]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (yy + 0.5) / h
    v = V * t ** (1.0 / GAMMA)
    wob = M.periodic_noise(256, rng, beta=2.4, lo_cut=2)
    wob = resize_f(wob, w, h)
    u = (xx + wob * 4.0) % w
    vv = (v + wob * 3.0) * 1.45
    pts = np.column_stack([u.ravel(), vv.ravel()])
    wrapped = np.vstack([seeds_s, seeds_s + [w, 0], seeds_s - [w, 0]])
    d, idx = cKDTree(wrapped).query(pts, k=2)
    i1 = (idx[:, 0] % n).reshape(h, w)
    d1 = d[:, 0].reshape(h, w); d2 = d[:, 1].reshape(h, w)
    near = wrapped[idx[:, 0]].reshape(h, w, 2)
    edge = (d2 - d1) * 0.5
    dy = vv - near[..., 1]
    dxg = u - near[..., 0]
    dist = np.maximum(d1, 1e-3)
    px_per_v = (h / V) * GAMMA * np.maximum(t, 1e-3) ** (GAMMA - 1) / 1.45
    e_px = edge * np.sqrt(np.clip((dy / dist) ** 2 * px_per_v ** 2 + (dxg / dist) ** 2, 0.05, 4))
    # chip the edges: the bevel is not a ruled chamfer
    e_px = e_px + noise((h, w), rng, 2.2) * 0.9 * (0.4 + t)
    bevel = 2.2 + 4.5 * t
    hgt = np.clip(e_px / bevel, 0, 1) ** 0.55 * (3.0 + 4.0 * t)
    tilt = rng.normal(0, 1, n)
    hgt = hgt + (tilt[i1] * dxg * 0.004) * (e_px > 1)
    # each slab its own stone: cold violet slate with the odd warm one
    val = rng.normal(0, 1, n)
    warm = rng.uniform(0, 1, n) ** 2
    cold = hexc("#2c2531"); warmc = hexc("#3a2e2b")
    col = cold * (1 - warm[i1][..., None]) + warmc * warm[i1][..., None]
    col = col * (1 + val[i1][..., None] * 0.13)
    blot = resize_f(M.periodic_noise(256, rng, beta=1.8, lo_cut=3), w, h)
    col = col * (1 + blot[..., None] * 0.12)
    joint = np.clip(1.6 - e_px, 0, 1)
    col = col * (1 - joint[..., None] * 0.75)
    up = np.clip(-dy / dist, 0, 1)
    lip = np.clip(1 - (e_px - 1.4) / (1.8 + 2.4 * t), 0, 1) * up * (e_px > 1.0)
    # cracks: a few thin wandering lines
    ink = np.zeros((h, w), np.float32)
    for _ in range(34):
        cx, cy = rng.uniform(0, w), rng.uniform(h * 0.3, h)
        a0 = rng.uniform(0, np.pi)
        L = int(rng.uniform(16, 70))
        turn = np.cumsum(rng.normal(0, 0.22, L))
        px = cx + np.cumsum(np.cos(a0 + turn))
        py = cy + np.cumsum(np.sin(a0 + turn)) * (0.35 + 0.5 * cy / h)
        ok = (px >= 0) & (px < w) & (py >= 0) & (py < h)
        ink[py[ok].astype(int), px[ok].astype(int)] = 1.0
    ink = ndimage.gaussian_filter(ink, 0.55) * 1.6
    ink = np.clip(ink * (e_px > 3), 0, 0.7) + joint * 0.45
    # the back of the floor sinks into the dark
    col = col * (0.42 + 0.58 * t ** 0.8)[..., None]
    return col, hgt, np.clip(ink, 0, 1), lip


def room_paint_layers():
    rng = np.random.default_rng(1881)
    W, H = ROOM_W, ROOM_H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    alb, motif_h = painted_wall(H, W, rng)
    hgt = motif_h.copy()
    gloss = np.zeros((H, W), np.float32)
    lip = np.zeros((H, W), np.float32)        # painted highlight strokes

    wood = painted_wood(H, W, rng, "#3a2619", "#5b3d28", "#1c120c")
    wobs = {}
    # the picture rail, the chair rail and the skirting, each drawn by hand
    for (y0, y1), prof, tone in (
        (Y_PIC, [(0, 6, "bead", 5), (6, 9, "fillet", 3), (9, 22, "ogee", 7)], 0.9),
        (Y_DADO, [(0, 7, "bead", 7), (7, 10, "fillet", 5), (10, 26, "bead", 10), (26, 36, "cove", 6)], 1.05),
        (Y_SKIRT, [(0, 8, "bead", 6), (8, 12, "cove", 3), (12, 42, "fillet", 2)], 0.72),
    ):
        wob = wobs[y0] = wob1d(W, rng, 260, 1.6)[None, :]
        sel, h = rail_height(yy, xx, y0, y1, prof, wob)
        alb[sel] = wood[sel] * tone
        hgt[sel] = h[sel]
        gloss[sel] = 0.45
        # a single loaded stroke of light along each rail's top bead, broken
        # where the brush skipped
        top = np.exp(-((yy - wob - y0 - 3.0) / 1.6) ** 2)
        skip = smooth(-0.3, 0.4, aniso_noise(H, W, rng, 90, 2) + 0.15)
        lip = np.maximum(lip, top * skip * sel)
    yd = yy - wobs[Y_DADO[0]]
    inlay = (yd >= Y_DADO[0] + 8) & (yd < Y_DADO[0] + 10)
    alb[inlay] = alb[inlay] * 0.4 + hexc("#8d6c3c") * 0.6
    gloss[inlay] = 0.9

    # the panelling: stiles and rails, and raised fields that are drawn
    y0, y1 = Y_WAIN
    sel = (yy >= y0) & (yy < y1)
    wain = painted_wood(H, W, rng, "#33211a", "#4c3325", "#190f0b")
    alb[sel] = wain[sel]
    hgt[sel] = 10
    gloss[sel] = 0.3
    PW, ST = 318, 46
    x_start = (W - (6 * PW + 7 * ST)) / 2 + ST
    py0, py1 = y0 + 30, y1 - 26
    vert = painted_wood(H, W, rng, "#36231b", "#503628", "#1b110c", vertical=True)
    for i in range(-1, 8):
        px0 = x_start + i * (PW + ST)
        px1 = px0 + PW
        if px1 < -10 or px0 > W + 10:
            continue
        dd, inner = wobbly_box_distance(xx, yy, px0, px1, py0, py1, rng, amp=1.8, chip=7)
        bevel = np.clip(dd / 18.0, 0, 1)
        field = 6 + bevel ** 0.8 * 10
        groove = np.exp(-((dd - 2.2) / 1.4) ** 2) * -5
        hgt = np.where(inner, field + groove, hgt)
        alb = np.where(inner[..., None], vert * (0.9 + 0.12 * bevel[..., None]), alb)
        # the field's top and left bevels take a stroke of light
        bev_lit = np.exp(-((dd - 9) / 5) ** 2) * inner
        gy, gx = np.gradient(dd)
        facing = np.clip(-(gy * 0.8 + gx * 0.5), 0, 1)
        lip = np.maximum(lip, bev_lit * facing * 0.7)

    # ── WHAT IS ON THE UPPER WALL ───────────────────────────────────────────
    # 528 px of plain paper, top to chair rail, is the biggest single area in
    # this room and the one the judges have called tiled wallpaper for seven
    # rounds. It is also the strip that actually SHOWS: a board covers the middle
    # of the screen, so what a player sees of this room is the band under the HUD
    # and a hand's width down each side, and both of those are upper wall.
    #
    # So it gets the two things a Victorian hall puts there. A STENCILLED FRIEZE
    # under the picture rail -- a palmette on a 128 px repeat between two beaded
    # rules, which is the ornament BRIEF-r8's fix 2 asks for and it need not be
    # wallpaper. And PICTURES, hung: five of them, two deliberately at the far
    # edges where the board does not reach, each a moulded frame round a canvas
    # sunk into it. Both are drawn into the HEIGHT field, so ink_lines outlines
    # them and the scumbled ao gathers under every moulding, exactly as it does
    # for the panelling below.
    fr0, fr1 = Y_PIC[1] + 6, Y_PIC[1] + 92
    fwob = wob1d(W, rng, 300, 1.8)[None, :]
    yf = yy - fwob
    band = (yf >= fr0) & (yf < fr1)
    # the two rules that close the frieze, and the bead-and-reel on the lower one
    rule_t = np.exp(-((yf - fr0 - 4.0) / 2.2) ** 2)
    rule_b = np.exp(-((yf - fr1 + 5.0) / 2.6) ** 2)
    reel = 0.5 + 0.5 * np.cos(xx * (2 * np.pi / 17.0))
    # THE PALMETTE: a fan of five leaves off a stem, mirrored every half repeat,
    # with a small scroll between each pair. Drawn as a function of position so
    # the repeat cannot tear at a cell edge -- the same rule the wall shader's
    # damask lattice is written to.
    u = np.abs(((xx + 64.0) % 128.0) - 64.0) / 64.0          # 0 at the motif axis
    v = np.clip((yf - fr0 - 20.0) / 52.0, 0.0, 1.0)          # 0 at its foot
    fan = np.exp(-((u - v * 0.86) / 0.17) ** 2)              # leaves splaying out
    fan += np.exp(-((u - v * 0.42) / 0.15) ** 2) * 0.85
    fan += np.exp(-(u / 0.13) ** 2) * (1.0 - 0.35 * v)       # the centre leaf
    scroll = np.exp(-((u - 0.92) / 0.10) ** 2) * np.exp(-((v - 0.24) / 0.20) ** 2)
    motifh = np.clip(fan * smooth(0.02, 0.18, v) + scroll * 1.2, 0, 1.6)
    frieze = (rule_t * 9.0 + rule_b * (6.5 + 3.5 * reel) + motifh * 7.5) * band
    hgt = hgt + frieze
    # its own colour: a paler distemper than the paper, the way a stencil sits
    # ON a wall rather than in it
    stencil = np.clip(frieze / 9.0, 0, 1)[..., None]
    alb = alb * (1 - stencil * 0.55) + hexc("#6b5480") * (stencil * 0.55)
    gloss = np.where(band, np.maximum(gloss, 0.22), gloss)

    # the hung pictures. ROUND 19: there were five, the two outer ones at the
    # screen's edges, and the boards with windows (the Reward, the Curiosity)
    # stand their lancets in exactly those two bays -- "a window cannot overlap
    # a picture frame", both survey judges. Those two are gone; the three that
    # remain are not "holes in the wall" any more but PICTURES: the grounds of
    # UI/mainMenu.png, cut by tools/prep_ui_kit.py (hall-*.webp), laid in each
    # canvas dimmed under an old varnish so they sit back in the room's shadow.
    hall = {536: "hall-towers.webp", 960: "hall-gable.webp", 1384: "hall-tree.webp"}
    for cxp, wp, hp, drop in ((536, 96, 116, 14), (960, 128, 150, -6), (1384, 96, 116, 10)):
        py0 = 268 + drop
        # TWO boxes, not one distance field. wobbly_box_distance caps its inset
        # distance at `chip`, so a frame drawn as a function of it is 0.82 of
        # itself everywhere and every picture came out a solid gold slab with no
        # canvas in it. The frame is the BAND between an outer box and an inner
        # one; the canvas is what is left inside.
        dd, inner = wobbly_box_distance(xx, yy, cxp - wp, cxp + wp,
                                        py0, py0 + 2 * hp, rng, amp=1.6, chip=5)
        dc, core = wobbly_box_distance(xx, yy, cxp - wp + 23, cxp + wp - 23,
                                       py0 + 23, py0 + 2 * hp - 23, rng, amp=1.2, chip=4)
        band_f = inner & ~core
        gilt = hexc("#7d6034")
        oil = hexc("#171020")
        # the moulding: a raised outer lip, a hollow, and a bead against the art
        prof = 11.0 + 5.0 * np.cos(np.clip(dd, 0, 5) / 5.0 * 3.1416)
        hgt = np.where(band_f, hgt + prof, hgt)
        hgt = np.where(core, hgt - 8.0 + smooth(0.0, 4.0, dc) * -3.0, hgt)
        alb = np.where(band_f[..., None], gilt * (0.72 + 0.46 * (dd / 5.0)[..., None]), alb)
        # the canvas: the picture, cover-fitted into the frame's opening, under
        # a brown varnish that has darkened with the room
        x0, x1 = cxp - wp + 21, cxp + wp - 21
        y0, y1 = py0 + 21, py0 + 2 * hp - 21
        art = Image.open(os.path.join(OUT, hall[cxp])).convert("RGB")
        k = max((x1 - x0) / art.width, (y1 - y0) / art.height)
        art = art.resize((int(np.ceil(art.width * k)), int(np.ceil(art.height * k))), Image.LANCZOS)
        ox, oy = (art.width - (x1 - x0)) // 2, (art.height - (y1 - y0)) // 2
        art = np.asarray(art, np.float32)[oy:oy + (y1 - y0), ox:ox + (x1 - x0)]
        canvas = np.zeros_like(alb)
        canvas[y0:y1, x0:x1] = art
        varnish = hexc("#3a2614")
        pic = canvas * 1.05 + varnish * 0.14
        # a craquelure of fine dark lines and the grain of the canvas
        pic = pic * (0.9 + 0.2 * noise(dd.shape, rng, 1.2)[..., None])
        alb = np.where(core[..., None], pic, alb)
        gloss = np.where(band_f, 0.55, gloss)
        gloss = np.where(core, 0.30, gloss)
        # the wall's own shadow under the frame, which is what hangs it
        below = np.exp(-((yy - (py0 + 2 * hp) - 9.0) / 11.0) ** 2)               * smooth(wp + 16.0, wp - 4.0, np.abs(xx - cxp))
        alb = alb * (1 - 0.34 * below[..., None])

    # the floor
    fh = H - Y_FLOOR
    f_alb, f_hgt, f_ink, f_lip = painted_flagstones(fh, W, rng)
    alb[Y_FLOOR:] = f_alb
    hgt[Y_FLOOR:] = f_hgt
    gloss[Y_FLOOR:] = 0.18
    lip[Y_FLOOR:] = np.maximum(lip[Y_FLOOR:], f_lip * 0.8)
    floor_ink = np.zeros((H, W), np.float32)
    floor_ink[Y_FLOOR:] = f_ink
    # the skirting's shadow on the floor
    alb[Y_FLOOR:] *= (1 - 0.55 * np.exp(-(np.arange(fh, dtype=np.float32) / 14)))[:, None, None]
    return alb, hgt, gloss, lip, floor_ink


def ink_lines(hgt, amount=0.6, thresh=1.2):
    """The samples outline every form in a soft dark line: where the relief
    steps (a moulding's edge, a groove, a slab joint) lay one down, thicker
    where the step is deeper, as a pen pressed harder."""
    gy, gx = np.gradient(ndimage.gaussian_filter(hgt, 0.9))
    g = np.hypot(gx, gy)
    line = np.clip((g - thresh) / (thresh * 2.2), 0, 1)
    line = ndimage.grey_dilation(line, size=(2, 2))
    return ndimage.gaussian_filter(line, 0.7) * amount


def lit(alb, hgt, gloss, light, colour, amb, gain, spec=None, floor_light=None):
    n = normals(ndimage.gaussian_filter(hgt, 1.6), 0.5)
    lam = lambert(n, light)
    c = np.asarray(colour, np.float32)
    col = alb * c * (amb + gain * lam)[..., None]
    if floor_light is not None:
        f = slice(Y_FLOOR, None)
        lamf = lambert(n[f], floor_light)
        col[f] = alb[f] * c * (amb + gain * 1.1 * lamf)[..., None]
    if spec is not None:
        s = specular(n, light, power=14.0) * gloss
        col = col + s[..., None] * np.asarray(spec, np.float32)
    return col


def room():
    alb, hgt, gloss, lip, floor_ink = room_paint_layers()
    H, W = hgt.shape
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    ink = np.clip(ink_lines(hgt) + floor_ink, 0, 0.9)
    rng = np.random.default_rng(404)
    tex = grit(H, W, seed=9, scale=1.0)                        # the felt's own tooth
    brush = aniso_noise(H, W, rng, 22, 2.2, angle=-24)          # one direction of stroke
    brush2 = aniso_noise(H, W, rng, 16, 2.0, angle=62)
    # the grime a painter scumbles into every recess: under each rail, round
    # every fielded panel, along the skirting, between the slabs
    ao = np.clip((ndimage.gaussian_filter(hgt, 7) - hgt) / 3.2, 0, 1)
    ao = ndimage.gaussian_filter(ao, 1.5)
    # dabs of paint: the value of every surface breaks into small patches the
    # size of a brush, a little lighter or darker, never an even render
    dabs = ndimage.gaussian_filter(rng.normal(0, 1, (H // 6, W // 6)).astype(np.float32), 0.9)
    dabs = resize_f(dabs / (np.abs(dabs).max() + 1e-6), W, H)
    # THE TOOTH OF THE THING IT IS PAINTED ON, and the room did not have one.
    # Measured on flat surfaces only -- tiles with no edge crossing them, every
    # image resampled to one width first, so a panel edge or a letter cannot
    # inflate the number -- as high-frequency energy over the surface's own
    # level:
    #
    #   Josh's four samples   0.185  0.325  0.318  0.498
    #   this room             0.015  0.019  0.019
    #
    # An order of magnitude, and it is the whole of "a render, not a painting".
    # Broken into octaves his incident is roughly FLAT from 0.8px to 12px, where
    # ours was weak everywhere and weakest at the fine end (0.009 against 0.10 to
    # 0.27 at 0.8px). What was already here -- the felt's grit, two brush
    # directions, the dabs -- is all low-frequency and all under 7%: it moves the
    # value in patches the size of a brush and leaves the surface between them
    # glassy.
    #
    # So the surface gets the tooth of its ground, 1/f across every octave
    # (beta 1.1 is the flat-per-octave exponent his spectrum shows), multiplied
    # in so it rides the light instead of adding a grey film, with the largest
    # wavelengths cut so it is a tooth and not a stain.
    #
    # AMPLITUDE IS SET BY EYE, NOT BY THE NUMBER, and they disagree. Reaching his
    # 0.185 needs 0.20, and at 0.20 the wall reads as film grain and the damask
    # under it disappears; 0.13 reads as plaster and paper. So this lands at
    # about 0.12, six times what the room had and a third short of his lowest
    # sample, and going further would score better and look worse.
    tooth = M.periodic_noise(0, np.random.default_rng(5150), beta=1.1, lo_cut=4.0,
                             shape=(H, W))
    tooth = tooth / (np.abs(tooth).std() + 1e-9)
    # AND IT IS NOT THE SAME EVERYWHERE. A tooth of one strength over the whole
    # wall is grain; a painted wall is worn unevenly -- damp in one corner, rubbed
    # smooth where things pass, heavy where the plaster went on thick. A slow
    # field over the top gives the tooth somewhere to be busy and somewhere to be
    # calm, which is the difference between a texture and a surface.
    wear = M.periodic_noise(0, np.random.default_rng(6270), beta=2.2, lo_cut=1.0,
                            shape=(H, W))
    # 0.25, NOT 0.55. At 0.55 the metric went on improving (the ground's grain
    # reached 0.127 against 0.088) and the wall turned blotchy -- patches of dirt
    # and damp rather than a surface that is a little more worn in some places
    # than others. Third time in this pass that the number pointed past the
    # answer; the crop beside the old one is what settled it, as before.
    wear = 1.0 + 0.25 * (wear / (np.abs(wear).std() + 1e-9)).clip(-1.6, 1.6)
    # the wood's grain, drawn along the boards with a dry brush
    grain = aniso_noise(H, W, rng, 34, 0.9)
    woodzone = ((yy >= Y_PIC[0]) & (yy < Y_PIC[1])) | ((yy >= Y_DADO[0]) & (yy < Y_FLOOR))
    woodzone = np.broadcast_to(woodzone, (H, W)).astype(np.float32)

    def finish(col, hi_colour, hi_amt, tooth_k=1.0):
        col = col + lip[..., None] * np.asarray(hi_colour, np.float32) * hi_amt
        col = col * (1 - 0.5 * ao[..., None])
        col = col * (1 + (grain * 0.11 * woodzone)[..., None])
        col = kuwahara(col, radius=4, sectors=8, q=10.0)
        col = col * (1 - ink[..., None])
        col = col * (0.72 + 0.28 * tex[..., None]) ** 1.0
        col = col * (1 + (brush * 0.07 + brush2 * 0.045 + dabs * 0.06)[..., None])
        col = col * (1 + (tooth * wear)[..., None] * TOOTH * tooth_k)
        return np.clip(col, 0, 255)

    # in the dark: the room lost in a cold violet shadow, its top in soot.
    #
    # IT HAS TO GO TO BLACK, and it did not. Measured over the darkest tenth of
    # each image, Josh's four samples sit at a minimum channel of 0.1 to 2.9 and
    # our ten screens at 3.9 to 5.1 -- every screen lifted about five levels off
    # the floor. This pass is half of that (tokens.css --kit-void is the other
    # half), and the lift is what makes the wall read as an evenly lit texture
    # rather than a room with light in it: a candle cannot pool on a wall that is
    # already glowing. `amb` is the term that does it -- it hands every surface a
    # share of its albedo whatever the light is doing -- so it comes down, the
    # falloffs deepen to carry the difference, and `gain` goes up to keep what
    # the light DOES reach as bright as it was.
    dark = lit(alb, hgt, gloss, np.array([0, -0.4, 0.92], np.float32),
               (0.58, 0.52, 0.78), 0.20, 0.42)
    vfall = (0.30 + 0.70 * smooth(0, 560, yy)) * (1 - 0.58 * smooth(Y_FLOOR, H, yy))
    hfall = 1 - 0.45 * (np.abs(xx - W / 2) / (W / 2)) ** 2
    # AND IT IS NOT THE SAME ROOM LEFT AND RIGHT. Measured, this asset's tile
    # spread ran 0.20 against mainMenu.png's 0.54: a symmetric parabola across x
    # and a smooth falloff up y is structure a statistic cannot see, because
    # every tile in the middle is the same tile. A painted room has light coming
    # from somewhere -- one warm side, one cold, a broad shadow across the far
    # corner -- so this adds three slow fields that are not symmetric and not
    # separable, at a scale no board can cover.
    u = xx / W
    side = 1.0 + 0.30 * np.cos((u - 0.13) * 2.9) - 0.16 * smooth(0.55, 1.0, u)
    pool = 1.0 + 0.26 * np.exp(-(((u - 0.17) / 0.20) ** 2 + ((yy / H - 0.74) / 0.30) ** 2))
    cast = 1.0 - 0.30 * np.exp(-(((u - 0.80) / 0.26) ** 2 + ((yy / H - 0.30) / 0.34) ** 2))
    dark = dark * (vfall * hfall * side * pool * cast)[..., None]
    # TWICE THE TOOTH IN THE DARK, and it is 8 bits that need it, not taste. This
    # pass sits at a level of 7/255, where a 13% tooth is under one level and
    # rounds away: measured, the dark room kept 0.060 of the 0.124 the lit passes
    # kept. Asking for twice buys back about a level, and it is the pass that
    # covers most of the wall, because the candles only reach so far.
    dark = finish(dark, (40, 30, 52), 0.25, tooth_k=1.9)
    # candle light, grazing down the wall from sconces above eye level
    Lw = np.array([0, -0.8, 0.6], np.float32)
    Lw /= np.linalg.norm(Lw)
    warm = lit(alb, hgt, gloss, Lw, (1.0, 0.76, 0.52), 0.66, 1.6, spec=(120, 80, 40),
               floor_light=np.array([0, -0.2, 0.98], np.float32))
    warm = finish(warm, (230, 160, 86), 0.55)
    Lm = np.array([0.0, -0.62, 0.78], np.float32)
    Lm /= np.linalg.norm(Lm)
    moon = lit(alb, hgt, gloss, Lm, (0.52, 0.66, 1.0), 0.52, 1.4, spec=(46, 66, 104),
               floor_light=np.array([0, -0.25, 0.97], np.float32))
    moon = finish(moon, (120, 150, 210), 0.45)
    save(dark, "room.webp", 88)
    save(warm, "room-warm.webp", 86)
    save(moon, "room-moon.webp", 86)


def felt():
    t = felt_tile(512, 5)
    save(np.clip(t, 0, 255), "felt.webp", 90)


def pools():
    """Light as a painter lays it: a candle's pool on a wall with its edge
    dragged and broken by the brush, and a moonbeam full of streaks."""
    rng = np.random.default_rng(31)
    S = 256
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cx, cy = S / 2, S * 0.44
    rx = (xx - cx) / (S * 0.5)
    ry = np.where(yy < cy, (yy - cy) / (S * 0.44), (yy - cy) / (S * 0.56))
    r = np.sqrt(rx ** 2 + ry ** 2)
    drag = aniso_noise(S, S, rng, 14, 2.5, angle=-20)
    wob = noise((S, S), rng, 11) * 0.12 + drag * 0.07
    a = np.clip(1 - (r + wob), 0, 1)
    a = a ** 1.5 * 0.82 + np.exp(-(r / 0.15) ** 2) * 0.18
    # strokes inside the pool: the light is laid on, not sprayed
    a = a * (0.86 + 0.14 * aniso_noise(S, S, rng, 10, 1.6, angle=-20))
    edge = np.minimum.reduce([xx, S - 1 - xx, yy, S - 1 - yy]) / (S * 0.12)
    a = np.clip(a, 0, 1) * smooth(0, 1, edge)
    save(np.dstack([np.full((S, S, 3), 255, np.float32), a * 255]), "pool.webp", 90)

    BW, BH = 256, 512
    yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
    t = yy / BH
    half = 0.16 + 0.32 * t
    u = (xx / BW - 0.5 - t * 0.07) / half
    a = np.clip(1 - np.abs(u) ** 1.4, 0, 1)
    a = a * smooth(0.0, 0.10, t) * (1 - 0.4 * smooth(0.55, 1.0, t))
    streak = aniso_noise(BH, BW, rng, 2.4, 60, angle=-4)
    a = a * (0.72 + 0.28 * streak)
    # the beam's edges are brushed too
    a = a * smooth(-0.1, 0.25, 1 - np.abs(u) + noise((BH, BW), rng, 8) * 0.18)
    dust = (rng.random((BH, BW)) > 0.9982).astype(np.float32)
    dust = np.clip(ndimage.gaussian_filter(dust, 0.9) * 9, 0, 1) * (a > 0.15)
    a = np.clip(a * 0.85 + dust * 0.5, 0, 1)
    beam = np.dstack([np.full((BH, BW, 3), 255, np.float32), a * 255])
    save(beam, "beam.webp", 90)
    save(np.ascontiguousarray(beam[:, ::-1]), "beam-r.webp", 90)


# ── cast brass on enamel: the plates ────────────────────────────────────────
def cast(mask_big, ss, bevel=2.2, rng=None, lift=0.0, spec=0.8):
    """Brass cast in the shape of a mask: flat on top, its edges rounded over
    by `bevel` px, lit from the boards' top left. Returns colour (ss scale)
    and the distance inside the casting."""
    rng = rng or np.random.default_rng(3)
    inside = mask_big > 0.5
    d = ndimage.distance_transform_edt(inside) / ss
    hgt = smooth(0, bevel, d) ** 0.7 * bevel * 1.2
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.35)
    n = normals(hgt, 1.0)
    wear = noise(mask_big.shape, rng, ss * 1.6)
    col = M.brass(n, wear=wear, spec_amt=spec, lift=lift)
    # grime in the hollows of the casting: the paintings' gold is never clean
    grime = smooth(0.2, 1.2, noise(mask_big.shape, rng, ss * 3.0) + 0.5) * (1 - smooth(0, bevel * 1.5, d))
    col = col * (1 - grime[..., None] * 0.18)
    return col, d


def fleuron(dr, cx, cy, s, sx=1, sy=1, fill=255, enamel=None):
    """The Kid board's panel corner, redrawn at any size `s`: a four-pointed
    star set on the diagonal, its inward point drawn long, with a violet enamel
    lozenge let into its heart (drawn on `enamel` when given). (sx, sy) point
    it into the plate."""
    ux, uy = sx / np.sqrt(2), sy / np.sqrt(2)          # the inward diagonal
    vx, vy = -uy, ux                                    # across it
    arms = ((ux, uy, 1.0), (-ux, -uy, 0.5), (vx, vy, 0.62), (-vx, -vy, 0.62))
    waist = s * 0.25
    pts = []
    for i, (ax, ay, L) in enumerate(arms_order := (arms[0], arms[2], arms[1], arms[3])):
        pts.append((cx + ax * s * L, cy + ay * s * L))
        nx, ny = arms_order[(i + 1) % 4][:2]
        bx, by = ax + nx, ay + ny
        bl = np.hypot(bx, by) + 1e-6
        pts.append((cx + bx / bl * waist, cy + by / bl * waist))
    dr.polygon(pts, fill=fill)
    if enamel is not None:
        e = s * 0.2
        enamel.polygon([(cx + ux * e * 1.6, cy + uy * e * 1.6), (cx + vx * e, cy + vy * e),
                        (cx - ux * e * 0.9, cy - uy * e * 0.9), (cx - vx * e, cy - vy * e)], fill=255)


def hook(dr, x, y, r, dirx, diry, sidex, sidey, width, fill=255):
    """A rule's end turned back on itself in a small curl, the way the Kid
    board's rails finish short of their corner ornament. The rule arrives at
    (x, y) travelling (dirx, diry); the curl turns towards (sidex, sidey)."""
    cxh, cyh = x + sidex * r, y + sidey * r
    a_end = np.degrees(np.arctan2(-sidey, -sidex))
    # sweep ~290 degrees from the rule end round the far side
    sweep = 290
    cw = (dirx * sidey - diry * sidex) > 0
    start, stop = (a_end, a_end + sweep) if cw else (a_end - sweep, a_end)
    dr.arc([cxh - r, cyh - r, cxh + r, cyh + r], start, stop, fill=fill, width=width)
    b = width * 0.9
    ang = np.radians(stop if cw else start)
    ex, ey = cxh + np.cos(ang) * r, cyh + np.sin(ang) * r
    dr.ellipse([ex - b, ey - b, ex + b, ey + b], fill=fill)


def felt_fill(h, w, rng, top="#2a1a36", mid="#1d1228", bot="#130b1b", tex_amt=1.0, scale=1.0):
    """An enamelled aubergine field with the felt's tooth in it, lit from the
    top, sunk into shadow against its rim."""
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None] * np.ones((1, w), np.float32)
    col = ramp(1 - yy, [(0.0, bot), (0.55, mid), (1.0, top)])
    t = felt_tile(512, int(rng.integers(0, 999)))
    tl = lum(t)
    tl = (tl - tl.mean()) / (tl.std() + 1e-6)
    if scale != 1.0:
        tl = resize_f(tl, int(512 * scale), int(512 * scale))
    reps = (int(np.ceil(h / tl.shape[0])) + 1, int(np.ceil(w / tl.shape[1])) + 1)
    tl = np.tile(tl, reps)[:h, :w]
    col = col * (1 + tl[..., None] * 0.07 * tex_amt)
    return col


def plate(W, H, name, ss=4, notch=6, rim=4.0, gap=3.0, line=1.6, inset=None, corners=True,
          fleur=15, fill=("#2b1a37", "#1e1229", "#140b1c"), seed=21, quality=92):
    """A rectangular plate: a cast brass rim with notched corners, a fine inner
    rule, a fleuron at each inner corner, round an enamelled aubergine field.
    Drawn for a 9-slice: the corners are the slices."""
    rng = np.random.default_rng(seed)
    SW, SH = W * ss, H * ss
    S = lambda v: v * ss
    m = 2.0
    inset = inset if inset is not None else rim + gap
    sil = Image.new("L", (SW, SH), 0)
    dr = ImageDraw.Draw(sil)
    dr.rectangle([S(m), S(m), S(W - m), S(H - m)], fill=255)
    for cx, cy in ((m, m), (W - m, m), (m, H - m), (W - m, H - m)):
        dr.ellipse([S(cx - notch), S(cy - notch), S(cx + notch), S(cy + notch)], fill=0)
    silb = np.asarray(sil, np.float32) / 255
    d_in = ndimage.distance_transform_edt(silb > 0.5) / ss
    brass_m = ((d_in > 0) & (d_in <= rim)).astype(np.float32)
    rule = Image.new("L", (SW, SH), 0)
    dr2 = ImageDraw.Draw(rule)
    enam = Image.new("L", (SW, SH), 0)
    de = ImageDraw.Draw(enam)
    x0, y0, x1, y1 = m + inset, m + inset, W - m - inset, H - m - inset
    lw = max(1, int(round(S(line))))
    cut = fleur * 1.05 if corners else 0
    dr2.line([(S(x0 + cut), S(y0)), (S(x1 - cut), S(y0))], fill=255, width=lw)
    dr2.line([(S(x0 + cut), S(y1)), (S(x1 - cut), S(y1))], fill=255, width=lw)
    dr2.line([(S(x0), S(y0 + cut)), (S(x0), S(y1 - cut))], fill=255, width=lw)
    dr2.line([(S(x1), S(y0 + cut)), (S(x1), S(y1 - cut))], fill=255, width=lw)
    if corners:
        hr = fleur * 0.26
        hw = max(1, int(round(S(line * 1.2))))
        for cx, cy, sx, sy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
            fleuron(dr2, S(cx + sx * fleur * 0.08), S(cy + sy * fleur * 0.08), S(fleur * 0.8), sx, sy, enamel=de)
            # each rule finishes short of the star in a curl turned in towards it
            hook(dr2, S(cx + sx * cut), S(cy), S(hr), -sx, 0, 0, sy, hw)
            hook(dr2, S(cx), S(cy + sy * cut), S(hr), 0, -sy, sx, 0, hw)
    ruleb = np.asarray(rule, np.float32) / 255
    enb = np.asarray(enam, np.float32) / 255
    metal_mask = np.maximum(brass_m, ruleb)
    col_b, _ = cast(metal_mask, ss, bevel=1.6, rng=rng)
    field = felt_fill(SH, SW, rng, *fill)
    shade = 0.55 + 0.45 * smooth(rim, rim + 10, d_in)
    field = field * shade[..., None]
    glaze = np.exp(-((np.linspace(0, 1, SH)[:, None] - 0.18) / 0.12) ** 2) * smooth(rim, rim + 6, d_in)
    field = field + glaze[..., None] * np.array([28, 20, 36], np.float32) * 0.35
    col = np.where((metal_mask > 0.5)[..., None], col_b, field)
    col = np.where((enb > 0.5)[..., None], np.array([92, 58, 140], np.float32) * (0.8 + 0.4 * (1 - np.linspace(0, 1, SH))[:, None, None]), col)
    near = ndimage.binary_dilation(metal_mask > 0.5, iterations=int(ss * 0.9)) & ~(metal_mask > 0.5)
    col = np.where(near[..., None], col * 0.25, col)
    edge = smooth(0, 1.0, d_in)
    col = col * (0.15 + 0.85 * edge[..., None])
    col = M.down(col, ss)
    alpha = M.down(silb, ss)
    save(np.dstack([col, alpha * 255]), name, quality)


def cartouche(W, H, name, ss=4, rim=3.0, fill=("#281a33", "#1b1125", "#110a18"), seed=31,
              curl=True, inner=True, quality=92):
    """A nameplate the shape of the wordmark's cartouche, in miniature: level
    rails, and at each end the plate draws in on two concave scallops to a
    beaded point, a curl of brass where each scallop leaves the rail."""
    rng = np.random.default_rng(seed)
    SW, SH = W * ss, H * ss
    S = lambda v: v * ss
    m = 1.5
    cy = H / 2
    e = H * 0.42
    xL, xR = m + e, W - m - e
    sil = Image.new("L", (SW, SH), 0)
    dr = ImageDraw.Draw(sil)
    dr.rectangle([S(xL), S(m), S(xR), S(H - m)], fill=255)
    for xe, sgn in ((xL, -1), (xR, 1)):
        pts = []
        for k in range(41):
            t = k / 40
            y = m + t * (H - 2 * m)
            u = abs(y - cy) / (H / 2 - m)
            bulge = (1 - u) ** 1.2 * e * 0.92 + np.sin(np.pi * u) * e * -0.18
            pts.append((S(xe + sgn * bulge), S(y)))
        dr.polygon([(S(xe), S(m))] + pts + [(S(xe), S(H - m))], fill=255)
    silb = np.asarray(sil, np.float32) / 255
    d_in = ndimage.distance_transform_edt(silb > 0.5) / ss
    metal = ((d_in > 0) & (d_in <= rim)).astype(np.float32)
    orn = Image.new("L", (SW, SH), 0)
    do = ImageDraw.Draw(orn)
    if curl:
        for xe, sgn in ((xL, -1), (xR, 1)):
            bx = xe + sgn * e * 0.80
            b = H * 0.075
            do.ellipse([S(bx - b), S(cy - b), S(bx + b), S(cy + b)], fill=255)
    if inner:
        lw = max(1, int(S(1.0)))
        ins = rim + 2.4
        do.line([(S(xL + 2), S(m + ins)), (S(xR - 2), S(m + ins))], fill=255, width=lw)
        do.line([(S(xL + 2), S(H - m - ins)), (S(xR - 2), S(H - m - ins))], fill=255, width=lw)
    ornb = np.asarray(orn, np.float32) / 255 * (silb > 0.5)
    metal = np.maximum(metal, ornb)
    col_b, _ = cast(metal, ss, bevel=1.3, rng=rng)
    field = felt_fill(SH, SW, rng, *fill, tex_amt=0.8)
    field = field * (0.5 + 0.5 * smooth(rim, rim + 7, d_in))[..., None]
    col = np.where((metal > 0.5)[..., None], col_b, field)
    near = ndimage.binary_dilation(metal > 0.5, iterations=int(ss * 0.8)) & ~(metal > 0.5)
    col = np.where(near[..., None], col * 0.3, col)
    col = col * (0.15 + 0.85 * smooth(0, 1.0, d_in)[..., None])
    col = M.down(col, ss)
    alpha = M.down(silb, ss)
    save(np.dstack([col, alpha * 255]), name, quality)


def coin():
    """A Button, as Mr. Moth counts them: a brass coat button with a raised
    rim, a dished face and four thread holes."""
    rng = np.random.default_rng(41)
    W, ss = 64, 4
    SW = W * ss
    yy, xx = np.mgrid[0:SW, 0:SW].astype(np.float32) / ss
    c = W / 2
    r = np.hypot(xx - c, yy - c)
    R = W / 2 - 3
    rimw = 6.0
    t = np.clip((R - r) / rimw, 0, 1)
    hgt = np.where(r < R, np.where(r > R - rimw, np.sin(np.pi * t) * 6 + 2,
                                   2 - 1.8 * (1 - r / (R - rimw)) ** 2), 0)
    holes = np.zeros_like(r, bool)
    for hx, hy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        hd = np.hypot(xx - (c + hx * 6.5), yy - (c + hy * 6.5))
        holes |= hd < 3.3
        hgt = np.where(hd < 4.6, np.minimum(hgt, 0.2 + hd * 0.3), hgt)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    col = M.brass(n, wear=noise((SW, SW), rng, ss * 2.0), lift=0.05)
    col = np.where(holes[..., None], np.array([12, 8, 5], np.float32), col)
    edge = 1 - smooth(R - 1.2, R, r)
    col = col * (0.2 + 0.8 * edge[..., None])
    alpha = 1 - smooth(R - 0.4, R + 0.8, r)
    col = M.down(col, ss)
    alpha = M.down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "coin.webp", 92)


def rule_frame():
    """An inner double rule for a panel's field, with the Kid board's corner: two
    brass hairlines that stop short of each corner in a curl, and a star with a
    violet enamel heart set on the diagonal where they would have met.
    Transparent inside and out, for a 9-slice (40 px corners)."""
    rng = np.random.default_rng(51)
    W, H, ss = 240, 160, 4
    SW, SH = W * ss, H * ss
    S = lambda v: v * ss
    im = Image.new("L", (SW, SH), 0)
    dr = ImageDraw.Draw(im)
    en = Image.new("L", (SW, SH), 0)
    de = ImageDraw.Draw(en)
    o = 6.0
    g = 3.6
    K = 25.0
    for off, wdt in ((o, 1.7), (o + g, 1.0)):
        lw = max(1, int(round(S(wdt))))
        k = K + (off - o) * 0.6
        dr.line([(S(k), S(off)), (S(W - k), S(off))], fill=255, width=lw)
        dr.line([(S(k), S(H - off)), (S(W - k), S(H - off))], fill=255, width=lw)
        dr.line([(S(off), S(k)), (S(off), S(H - k))], fill=255, width=lw)
        dr.line([(S(W - off), S(k)), (S(W - off), S(H - k))], fill=255, width=lw)
    hw = max(1, int(round(S(1.6))))
    for cx, cy, sx, sy in ((o, o, 1, 1), (W - o, o, -1, 1), (o, H - o, 1, -1), (W - o, H - o, -1, -1)):
        hook(dr, S(cx + sx * K), S(cy), S(4.6), -sx, 0, 0, sy, hw)
        hook(dr, S(cx), S(cy + sy * K), S(4.6), 0, -sy, sx, 0, hw)
        fleuron(dr, S(cx + sx * 4.0), S(cy + sy * 4.0), S(17.0), sx, sy, enamel=de)
    mb = np.asarray(im, np.float32) / 255
    eb = np.asarray(en, np.float32) / 255
    col, _ = cast(mb, ss, bevel=1.1, rng=rng, lift=0.04)
    col = np.where((eb > 0.5)[..., None], np.array([98, 62, 150], np.float32), col)
    near = ndimage.binary_dilation(mb > 0.5, iterations=int(ss * 0.9))
    alpha = np.where(mb > 0.5, 1.0, np.where(near, 0.75, 0.0))
    col = np.where((mb > 0.5)[..., None], col, np.array([8, 5, 4], np.float32))
    alpha = ndimage.gaussian_filter(alpha, ss * 0.3)
    col = M.down(col, ss)
    alpha = M.down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "rule.webp", 92)


def initial_box():
    """The drop cap's box: a square of deep violet enamel with the damask sunk
    in it, in a cast brass frame with a bead at each corner and a rule inside,
    the way an illuminated capital is set in a manuscript."""
    rng = np.random.default_rng(61)
    W, ss = 120, 4
    SW = W * ss
    S = lambda v: v * ss
    sil = Image.new("L", (SW, SW), 0)
    ImageDraw.Draw(sil).rectangle([S(6), S(6), S(W - 6), S(W - 6)], fill=255)
    silb = np.asarray(sil, np.float32) / 255
    d_in = ndimage.distance_transform_edt(silb > 0.5) / ss
    met = Image.new("L", (SW, SW), 0)
    dm = ImageDraw.Draw(met)
    dm.rectangle([S(6), S(6), S(W - 6), S(W - 6)], outline=255, width=int(S(4.2)))
    dm.rectangle([S(14), S(14), S(W - 14), S(W - 14)], outline=255, width=max(1, int(S(1.2))))
    for cx, cy in ((8, 8), (W - 8, 8), (8, W - 8), (W - 8, W - 8)):
        b = 7.0
        dm.ellipse([S(cx - b), S(cy - b), S(cx + b), S(cy + b)], fill=255)
    for cx, cy, sx, sy in ((14, 14, 1, 1), (W - 14, 14, -1, 1), (14, W - 14, 1, -1), (W - 14, W - 14, -1, -1)):
        fleuron(dm, S(cx + sx * 4), S(cy + sy * 4), S(8), sx, sy)
    mb = np.asarray(met, np.float32) / 255
    col_b, _ = cast(mb, ss, bevel=1.6, rng=rng)
    field = felt_fill(SW, SW, rng, "#342048", "#231534", "#150c21")
    motif = M.damask_motif()
    tw = SW // 2
    th = int(tw * motif.shape[0] / motif.shape[1])
    mt = np.asarray(Image.fromarray((motif * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS), np.float32) / 255
    mt = M.tile(mt, SW, SW, ox=SW // 4, oy=0)
    field = field * (1 + mt[..., None] * 0.22)
    field = field * (0.45 + 0.55 * smooth(4, 26, d_in))[..., None]
    col = np.where((mb > 0.5)[..., None], col_b, field)
    near = ndimage.binary_dilation(mb > 0.5, iterations=int(ss * 0.9)) & ~(mb > 0.5)
    col = np.where(near[..., None], col * 0.3, col)
    col = M.down(col, ss)
    alpha = M.down(np.maximum(silb, mb), ss)
    save(np.dstack([col, alpha * 255]), "initial.webp", 92)


def vellum():
    """Dark vellum, the colour of a page read by a candle that is nearly out:
    warm aubergine-brown skin with its fibres and a slow mottle of age.
    Seamless 512."""
    rng = np.random.default_rng(71)
    n = 512
    mott = M.periodic_noise(n, rng, beta=2.4, lo_cut=2)
    blot = M.periodic_noise(n, rng, beta=1.6, lo_cut=6)
    fib = M.periodic_noise(n, rng, beta=0.6, lo_cut=40)
    fibs = ndimage.gaussian_filter(fib, (0.6, 5.0), mode="wrap")
    fibs /= np.abs(fibs).max() + 1e-6
    t = np.clip(0.5 + mott * 0.22 + blot * 0.08 + fibs * 0.10, 0, 1)
    col = ramp(t, [(0.0, "#140d15"), (0.5, "#221722"), (1.0, "#33242d")])
    spots = (rng.random((n, n)) > 0.9992).astype(np.float32)
    spots = ndimage.gaussian_filter(spots, 1.4, mode="wrap") * 40
    col = col * (1 - np.clip(spots, 0, 0.35)[..., None])
    save(col, "vellum.webp", 90)


def cloth():
    """The velvet cloth thrown over the table the Tricks are laid out on, seen
    from just above the table: its top in perspective, going dark towards the
    back; the rounded front edge of the table under it catching the light; a
    short drop in soft folds; and a hem embroidered with a running chain of
    gold lozenges between two gold threads, its lower edge following the
    folds. Painted (Kuwahara) like the room, the Kid board's felt in it.
    1024 x 142, tiling in x: the top is its first 95 px, the edge 95-107, the
    drop to 127, the hem 127-137."""
    rng = np.random.default_rng(81)
    W, H = 1024, 142
    EDGE0, EDGE1, HEM0, HEM1 = 95.0, 107.0, 127.0, 137.0
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    fold = np.zeros(W, np.float32)
    for k, amp in ((5, 1.0), (9, .6), (16, .32), (23, .18)):
        fold += np.sin(np.arange(W) / W * 2 * np.pi * k + rng.uniform(0, 6)) * amp
    fold = fold / np.abs(fold).max()
    dfold = np.gradient(fold) * W / (2 * np.pi * 10)
    drop_t = np.clip((yy - EDGE1) / (HEM0 - EDGE1), 0, 1)
    lit = 0.55 + 0.30 * fold[None, :] * (0.6 + 0.4 * drop_t) - 0.30 * np.clip(dfold[None, :], -1, 1) * (0.5 + 0.5 * drop_t)
    nap = resize_f(np.tile(M.periodic_noise(256, rng, beta=1.1, lo_cut=6), (1, 4)), W, H)
    streak = aniso_noise(H, W, rng, 1.2, 14)
    # the top: creases in perspective, running back from the folds of the drop
    crease = fold[None, :] * (yy / EDGE0) ** 2
    top = yy < EDGE0
    tt = yy / EDGE0
    v = np.where(top, 0.16 + 0.36 * tt ** 1.25 + 0.06 * nap + 0.07 * crease, 0.0)
    edge = (yy >= EDGE0) & (yy < EDGE1)
    te = (yy - EDGE0) / (EDGE1 - EDGE0)
    v = np.where(edge, 0.64 + 0.28 * np.sin(te * np.pi) + 0.05 * fold[None, :], v)
    drop = yy >= EDGE1
    v = np.where(drop, lit - 0.10 * drop_t + 0.05 * nap + 0.05 * streak, v)
    col = ramp(np.clip(v, 0, 1), [(0.0, "#0a050d"), (0.3, "#1d0f27"), (0.6, "#3b2150"), (0.85, "#5b3877"), (1.0, "#7a53a0")])
    hemz = (yy >= HEM0) & (yy < HEM1)
    th = np.zeros((H, W), np.float32)
    for ly in (HEM0 + 1.4, HEM1 - 1.4):
        th = np.maximum(th, np.clip(1 - np.abs(yy - ly) / 1.0, 0, 1) * hemz)
    cx = (xx % 16.0) - 8.0
    cy = yy - (HEM0 + HEM1) / 2
    lozenge = np.clip(1 - (np.abs(cx) / 4.6 + np.abs(cy) / 2.8), 0, 1)
    th = np.maximum(th, (lozenge > 0.08) * np.clip(lozenge * 3, 0, 1) * hemz)
    gold = ramp(np.clip(0.45 + 0.5 * th - 0.2 * (cy / 6), 0, 1), [(0, "#4a3113"), (0.5, "#9c7a42"), (1, "#e6c98a")])
    col = np.where(hemz[..., None], col * 0.6, col)
    col = col * (1 - th[..., None]) + gold * th[..., None]
    lower = HEM1 + 2 + 2.2 * fold[None, :]
    alpha = np.clip(lower - yy + 0.5, 0, 1).astype(np.float32)
    col = kuwahara(col, radius=3, sectors=8, q=10.0)
    col = col * (0.84 + 0.16 * grit(H, W, seed=13))[..., None]
    for ey, amt in ((EDGE0, 0.45), (HEM0 - 0.5, 0.35)):
        col = col * (1 - amt * np.exp(-((yy - ey) / 1.2) ** 2))[..., None]
    save(np.dstack([np.clip(col, 0, 255), alpha * 255]), "cloth.webp", 88)


def drape():
    """The velvet hung at the back of Mr. Moth's cabinet, painted: deep folds of
    uneven width gathered from a rod, the pile catching the lantern above as
    bright rims along each fold's edge (velvet is brightest where it turns away
    from you), the folds' faces matte and dark, the whole cloth falling into
    shadow at its foot and its sides. 1536 x 400, stretched to the cabinet."""
    rng = np.random.default_rng(97)
    W, H = 1536, 400
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = yy / H
    # the folds: a phase that wanders with height, so they are gathered at the
    # top and sway as they fall
    sway = resize_f(ndimage.gaussian_filter(rng.normal(0, 1, (8, 24)).astype(np.float32), 1.2), W, H) * 18
    phase = np.zeros((H, W), np.float32)
    for k, amp in ((7, 1.0), (12, .5), (21, .2)):
        phase += np.sin((xx + sway * (0.3 + t)) / W * 2 * np.pi * k + rng.uniform(0, 6)) * amp
    phase = phase / np.abs(phase).max()
    gy, gx = np.gradient(ndimage.gaussian_filter(phase, 3))
    slope = np.clip(np.abs(gx) * 55, 0, 1)
    face = 0.5 + 0.5 * phase                          # 1 on a fold's crest
    sheen = ndimage.gaussian_filter(slope ** 1.6, 2.5)  # the pile turning away: soft bright rims
    nap = aniso_noise(H, W, rng, 1.0, 26)             # the pile, running down the cloth
    v = 0.2 + 0.38 * face ** 1.3 + 0.22 * sheen + 0.05 * nap
    # the lantern above the cabinet: warm at the top centre, the cloth falling
    # into shadow towards its foot and its sides
    cx = (xx - W / 2) / (W / 2)
    light = np.exp(-(cx / 0.62) ** 2) * (1 - 0.55 * t) + 0.25
    v = v * light
    v = v * (0.72 + 0.28 * (1 - smooth(0.6, 1.0, t)))
    col = ramp(np.clip(v, 0, 1), [(0.0, "#07040a"), (0.25, "#170b1f"), (0.5, "#2e173b"), (0.75, "#4d2c62"), (1.0, "#7a4f95")])
    warm = np.exp(-(cx / 0.5) ** 2 - ((t - 0.05) / 0.4) ** 2)
    col = col + warm[..., None] * np.array([36, 18, 6], np.float32) * sheen[..., None]
    col = kuwahara(col, radius=3, sectors=8, q=10.0)
    col = col * (0.86 + 0.14 * grit(H, W, seed=21))[..., None]
    save(np.clip(col, 0, 255), "drape.webp", 88)


def socket_ring():
    """An empty setting on the HUD rail: a round recess in black enamel inside
    a cast brass ring with four small scrolls round it, waiting for a Snack."""
    rng = np.random.default_rng(91)
    W, ss = 64, 4
    SW = W * ss
    S = lambda v: v * ss
    c = W / 2
    im = Image.new("L", (SW, SW), 0)
    dr = ImageDraw.Draw(im)
    R = 19.0
    dr.ellipse([S(c - R), S(c - R), S(c + R), S(c + R)], outline=255, width=int(S(3.4)))
    dr.ellipse([S(c - R + 5.2), S(c - R + 5.2), S(c + R - 5.2), S(c + R - 5.2)], outline=255,
               width=max(1, int(S(1.0))))
    for k in range(4):
        a = np.pi / 4 + k * np.pi / 2
        px, py = c + np.cos(a) * (R + 5.5), c + np.sin(a) * (R + 5.5)
        r = 4.2
        start = np.degrees(a) + 90
        dr.arc([S(px - r), S(py - r), S(px + r), S(py + r)], start, start + 250, fill=255,
               width=max(1, int(S(1.4))))
        b = 1.6
        dr.ellipse([S(px - b), S(py - b), S(px + b), S(py + b)], fill=255)
    for k in range(4):
        a = k * np.pi / 2
        px, py = c + np.cos(a) * (R + 2.6), c + np.sin(a) * (R + 2.6)
        b = 2.2
        dr.ellipse([S(px - b), S(py - b), S(px + b), S(py + b)], fill=255)
    mb = np.asarray(im, np.float32) / 255
    col_b, _ = cast(mb, ss, bevel=1.2, rng=rng)
    yy, xx = np.mgrid[0:SW, 0:SW].astype(np.float32) / ss
    r = np.hypot(xx - c, yy - c)
    rec = r < R - 1
    en = ramp(np.clip((yy - (c - R)) / (2 * R), 0, 1), [(0, "#0a060d"), (1, "#20152b")])
    en = en * (0.5 + 0.5 * (1 - smooth(R - 9, R - 1, r)))[..., None]
    col = np.where((mb > 0.5)[..., None], col_b, en)
    near = ndimage.binary_dilation(mb > 0.5, iterations=int(ss * 0.8)) & ~(mb > 0.5)
    col = np.where(near[..., None], col * 0.3, col)
    alpha = np.maximum(mb, rec.astype(np.float32))
    alpha = np.maximum(alpha, near.astype(np.float32) * 0.8)
    col = M.down(col, ss)
    alpha = M.down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "socket-ring.webp", 92)


def plates():
    # the Curiosity's doors, and any row that is a choice
    plate(360, 96, "plaque.webp", notch=7, rim=3.6, gap=3.2, line=1.3, fleur=17, seed=21,
          fill=("#231530", "#190f23", "#100916"))
    # a darker plate for values and readouts
    plate(240, 72, "plaque-dark.webp", notch=5, rim=3.0, gap=2.6, line=1.1, fleur=13,
          fill=("#1d1422", "#151018", "#0d0a10"), seed=23)
    # the HUD's nameplates and the Shop's price plates
    cartouche(200, 48, "nameplate.webp", rim=2.6, seed=31)
    cartouche(240, 64, "nameplate-lg.webp", rim=3.2, seed=33)


# What this build ships from here: the painted room and its lights. (Round 2's
# BRAID branch also painted plates, a coin, a drop-cap box, vellum, a cloth, a
# socket and a drape with the functions above; the kit's own versions of those
# stayed, and running them would overwrite files other boards are built on.
# Add a name back to this table only together with the files it writes.)
PIECES = {
    "room": room,
    "pools": pools,
}


def main():
    global PREVIEW
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append")
    ap.add_argument("--preview")
    a = ap.parse_args()
    PREVIEW = a.preview
    for name, fn in PIECES.items():
        if a.only and name not in a.only:
            continue
        print(name)
        fn()


if __name__ == "__main__":
    main()
