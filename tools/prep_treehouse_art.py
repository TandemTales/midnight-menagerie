"""Render the kids' places: the treehouse the Lobby and the Clubhouse stand in.

Every other board stands in the mansion (`tools/prep_ui_materials.py` renders
its damask room). The Treehouse and Neighbourhood Headquarters are the one
place the Kids are not inside the house, so they get a room of their own,
rendered by the same hand: height fields lit from the top left, the samples'
dark ink round every form, one painterly pass over the lot, and the room
rendered three times — in the dark, under lamplight and under moonlight — so a
board reveals the lit versions only where its lights are (`.kit-ground__warm`,
`.kit-ground__moon`, the same pool and beam masks every board uses).

Outputs (game/assets/ui/kit/):

  planks.webp        the treehouse wall in the dark: rough vertical boards, a
                     roof beam, a nailer rail, floorboards      (.kit-ground--planks)
  planks-warm.webp   the same under lamplight
  planks-moon.webp   the same under moonlight
  cork.webp          an investigation board's cork, tileable 512
  paper.webp         photo and index-card paper fibre, tileable 256 (grey, overlay)
  tape.webp          a strip of masking tape with torn ends
  pin.webp           a red push pin, from just above
  pin-blue.webp      the same in blue
  hatch.webp         a treehouse window onto the grounds of UI/mainMenu.png:
                     a rough plank frame, a cross bar, old glass, the moon

    python tools/prep_treehouse_art.py               # everything
    python tools/prep_treehouse_art.py --only planks # one piece while tuning

Run after tools/prep_ui_materials.py; it borrows that script's renderer.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  the kit's own renderer

ROOT, OUT = M.ROOT, M.OUT
ramp, noise, smooth, hexc = M.ramp, M.noise, M.smooth, M.hexc
normals, lambert, specular, down, save = M.normals, M.lambert, M.specular, M.down, M.save

# ── the treehouse wall ─────────────────────────────────────────────────────────
TW, TH = 1920, 1080
Y_BEAM = (38, 96)          # the roof beam the boards are nailed to
Y_RAIL = (618, 664)        # a nailer rail across the boards
Y_FLOOR = 934              # floorboards start


def plank_albedo(h, w, rng, base, light, dark, scale=1.0):
    """Rough-sawn softwood, vertical: long grain, saw marks across it, weathering."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    def aniso(sx, sy, amp):
        n = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (sy, sx))
        return n / (np.abs(n).max() + 1e-6) * amp

    figure = aniso(7 * scale, 150 * scale, 1.0)          # slow streaks down the board
    fine = aniso(0.7 * scale, 36 * scale, 1.0)           # the grain lines
    rings = 0.5 + 0.5 * np.sin((xx + figure * 26 * scale) / (2.1 * scale))
    saw = 0.5 + 0.5 * np.sin(yy / (5.5 * scale) + aniso(20, 4, 1.0) * 2.0)   # faint saw marks
    # dark grain lines that wander down the board, the way a brush draws them
    streak = np.clip((aniso(0.9 * scale, 60 * scale, 1.0) - 0.35) * 3.2, 0, 1)
    t = 0.5 + figure * 0.3 + fine * 0.24 + (rings - 0.5) * 0.1 + (saw - 0.5) * 0.03 - streak * 0.22
    return ramp(np.clip(t, 0, 1), [(0.0, dark), (0.5, base), (1.0, light)])


def treehouse_layers():
    rng = np.random.default_rng(1997)
    W, H = TW, TH
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    alb = np.zeros((H, W, 3), np.float32)
    hgt = np.zeros((H, W), np.float32)
    gloss = np.zeros((H, W), np.float32)

    tones = [("#3d2a1f", "#56402f", "#1d130d"), ("#35261d", "#4c392c", "#19110c"),
             ("#402e20", "#5b4431", "#21160e"), ("#3a2a23", "#523e32", "#1b120e")]
    # twice the wall's height, so a board is a WINDOW onto the grain and never a
    # rolled copy of it (a roll wraps, and the wrap is a hard seam across the board)
    woods = [plank_albedo(H * 2, W, np.random.default_rng(300 + i), *tones[i], scale=1.0) for i in range(4)]

    # the boards: uneven widths, each its own tone, a dark gap between them
    x = -rng.uniform(20, 90)
    gap_d = np.full((H, W), 99.0, np.float32)
    board_u = np.zeros((H, W), np.float32)
    board_id = np.zeros((H, W), np.int32)
    joint = np.zeros((H, W), np.float32)
    k = 0
    while x < W:
        bw = rng.uniform(128, 204)
        x0, x1 = x, x + bw
        wob = rng.uniform(-3, 3)
        sel = (xx >= x0) & (xx < x1)
        o = int(rng.uniform(0, H))
        wood = woods[k % 4][o:o + H]
        tone = 1 + rng.uniform(-0.17, 0.14)
        # some boards are two lengths butted together: another cut of grain, a
        # shade different, a dark joint where they meet
        if rng.random() < 0.24:
            jy = rng.uniform(Y_BEAM[1] + 90, Y_RAIL[0] - 60) if rng.random() < 0.6 else rng.uniform(Y_RAIL[1] + 60, Y_FLOOR - 70)
            o2 = int(rng.uniform(0, H))
            wood2 = woods[(k + 2) % 4][o2:o2 + H] * (1 + rng.uniform(-0.12, 0.1))
            wood = np.where((yy > jy)[..., None], wood2, wood)
            joint = np.where(sel, np.maximum(joint, np.exp(-((yy - jy + (xx - x0) * rng.uniform(-.02, .02)) / 1.9) ** 2)), joint)
        alb = np.where(sel[..., None], wood * tone, alb)
        # each board catches the light a little differently along its length
        grad = 1 + rng.uniform(-0.1, 0.1) * (yy / H - 0.5) * 2
        alb = np.where(sel[..., None], alb * grad[..., None], alb)
        u = np.clip((xx - x0) / bw, 0, 1)
        board_u = np.where(sel, u, board_u)
        board_id = np.where(sel, k, board_id)
        d = np.minimum(xx - x0, x1 - xx) + np.where(sel, wob * (yy / H), 0)
        gap_d = np.where(sel, d, gap_d)
        k += 1
        x = x1 + rng.uniform(3, 6)                      # the gap
    alb = alb * (1 - joint[..., None] * 0.62)
    in_board = gap_d < 90
    # cupped boards: edges a little lower, a soft bevel into the gap
    cup = 7 + 1.6 * np.sin(np.pi * board_u)
    bev = np.clip(gap_d / 5.0, 0, 1) ** 0.6
    hgt = np.where(in_board, cup * bev, -4)
    alb = np.where(in_board[..., None], alb, np.array([7, 5, 6], np.float32))
    # weathering: water stains running down, a paler sun-bleached patch
    stain = noise((H, W), rng, (60, 8)) * 0.16 + noise((H, W), rng, 140) * 0.12
    alb = alb * (1 + stain[..., None])
    # nail holes and old nails left from whatever the boards were before
    for _ in range(46):
        hx, hy = rng.uniform(0, W), rng.uniform(120, Y_FLOOR - 20)
        hd = np.hypot(xx - hx, yy - hy)
        hole = np.clip(1 - hd / rng.uniform(1.6, 2.6), 0, 1)
        alb = alb * (1 - hole[..., None] * 0.7)
    # knots on some boards
    for _ in range(19):
        kx, ky = rng.uniform(0, W), rng.uniform(140, Y_FLOOR - 40)
        rx, ry = rng.uniform(7, 13), rng.uniform(14, 26)
        d = np.sqrt(((xx - kx) / rx) ** 2 + ((yy - ky) / ry) ** 2)
        ring = (0.5 + 0.5 * np.cos(d * 7.5)) * np.exp(-d * 0.9)
        core = np.exp(-(d / 0.55) ** 2)
        m = np.exp(-(d / 2.4) ** 2)
        alb = alb * (1 - (ring * 0.28 + core * 0.55)[..., None] * m[..., None])
        hgt = hgt + core * 1.4

    # the roof beam and the nailer rail: heavier timbers in front of the boards
    horiz =M.wood_albedo(H, W, np.random.default_rng(78), base="#35241a", light="#503727", dark="#180f0a", scale=1.2)
    for (y0, y1), prof in (
        (Y_BEAM, [(0, 6, "bead", 4), (6, 52, "fillet", 5), (52, 58, "cove", 3)]),
        (Y_RAIL, [(0, 5, "bead", 4), (5, 40, "fillet", 5), (40, 46, "cove", 3)]),
    ):
        sel = (yy >= y0) & (yy < y1)
        alb[sel] = horiz[sel] * 1.02
        hgt[sel] = 16 + M.moulding(yy[sel] - y0, prof)
        gloss[sel] = 0.25
        # its shadow on the boards under it
        below = (yy >= y1) & (yy < y1 + 26)
        alb = np.where(below[..., None], alb * (0.55 + 0.45 * smooth(y1, y1 + 26, yy))[..., None], alb)
    # the nails: two per board where it crosses each timber
    nails = np.zeros((H, W), np.float32)
    for bid in range(k):
        cols = np.where((board_id[Y_RAIL[0] + 20] == bid))[0]
        if cols.size < 10:
            continue
        cx0, cx1 = cols.min(), cols.max()
        for (y0, y1) in (Y_BEAM, Y_RAIL):
            cy = (y0 + y1) / 2 + rng.uniform(-6, 6)
            for f in (0.26, 0.74):
                if rng.random() < 0.3:                 # a nail that was never put in
                    continue
                nx = cx0 + (cx1 - cx0) * f + rng.uniform(-10, 10)
                nd = np.hypot(xx - nx, yy - cy)
                nails = np.maximum(nails, np.clip(1 - nd / 5.2, 0, 1))
    head = nails > 0
    hgt = np.where(head, hgt + np.sqrt(nails) * 4.5, hgt)
    alb = np.where(head[..., None], ramp(nails, [(0, "#2a1d16"), (0.6, "#5b4a3e"), (1, "#8f7b62")]), alb)
    gloss = np.where(head, 0.9, gloss)

    # the floor: boards running away from the viewer, seen at eye level
    fl = yy >= Y_FLOOR
    rows = []
    y = float(Y_FLOOR)
    while y < H:
        depth = 12 + 34 * ((y - Y_FLOOR) / (H - Y_FLOOR)) ** 1.1 + rng.uniform(-1, 2)
        rows.append((y, y + depth))
        y += depth
    fwood = M.wood_albedo(H, W, np.random.default_rng(91), base="#33231a", light="#4b3425", dark="#170f0a", scale=0.9)
    edge = np.full((H, W), 99.0, np.float32)
    for (y0, y1) in rows:
        t = ((y0 + y1) / 2 - Y_FLOOR) / (H - Y_FLOOR)
        xj = -rng.uniform(0, 300)
        while xj < W:
            ln = rng.uniform(420, 900) * (0.7 + 0.6 * t)
            sel = fl & (yy >= y0) & (yy < y1) & (xx >= xj) & (xx < xj + ln)
            dd = np.minimum(np.minimum(yy - y0, y1 - yy) * 1.6, np.minimum(xx - xj, xj + ln - xx))
            edge = np.where(sel, dd, edge)
            alb = np.where(sel[..., None], np.roll(fwood, int(rng.uniform(0, W)), axis=1) * (1 + rng.uniform(-0.12, 0.1)), alb)
            xj += ln
    e = np.clip(edge, 0, 12)
    hgt = np.where(fl, np.clip(e / 3.0, 0, 1) ** 0.7 * 4.0, hgt)
    alb = np.where(fl[..., None], alb * (0.35 + 0.65 * np.clip(e / 1.6, 0, 1))[..., None], alb)
    gloss = np.where(fl, 0.2, gloss)
    return alb, hgt, gloss


def light_planks(alb, hgt, gloss, light, colour, amb, gain, spec_col=None, floor_light=None):
    H, W = hgt.shape
    n = normals(ndimage.gaussian_filter(hgt, 0.8), 0.6)
    lam = lambert(n, light)
    c = np.asarray(colour, np.float32)
    col = alb * c * (amb + gain * lam)[..., None]
    if floor_light is not None:
        f = slice(Y_FLOOR, H)
        lamf = lambert(n[f], floor_light)
        col[f] = alb[f] * c * (amb + gain * 1.1 * lamf)[..., None]
    if spec_col is not None:
        s = specular(n, light, power=16.0) * gloss
        col = col + s[..., None] * np.asarray(spec_col, np.float32)
    return col


def planks():
    alb, hgt, gloss = treehouse_layers()
    H, W = hgt.shape
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    ink = M.ink_lines(hgt, amount=0.6, thresh=1.4)[..., None]

    dark = light_planks(alb, hgt, gloss, np.array([0, -0.4, 0.92], np.float32),
                        (0.62, 0.54, 0.78), 0.36, 0.42)
    vfall = (0.52 + 0.48 * smooth(0, 520, yy)) * (1 - 0.5 * smooth(Y_FLOOR, H, yy))
    hfall = 1 - 0.24 * (np.abs(xx - W / 2) / (W / 2)) ** 2
    dark = dark * (vfall * hfall)[..., None] * ink
    Lw = np.array([0, -0.78, 0.62], np.float32)
    Lw /= np.linalg.norm(Lw)
    warm = light_planks(alb, hgt, gloss, Lw, (1.0, 0.76, 0.5), 0.74, 1.75,
                        spec_col=(150, 100, 48), floor_light=np.array([0, -0.2, 0.98], np.float32))
    warm = warm * ink
    Lm = np.array([0.35, -0.55, 0.76], np.float32)
    Lm /= np.linalg.norm(Lm)
    moon = light_planks(alb, hgt, gloss, Lm, (0.55, 0.68, 1.0), 0.55, 1.45,
                        spec_col=(60, 80, 120), floor_light=np.array([0, -0.25, 0.97], np.float32))
    moon = moon * ink
    # the shadows go to aubergine, as every sample's do, before the paint pass
    def aubergine(img, k):
        lum = img.mean(axis=2, keepdims=True)
        shadow = np.clip(1 - lum / 70.0, 0, 1)
        return img * (1 - shadow * k) + shadow * k * np.array([30, 18, 38], np.float32) * (lum / 40.0 + 0.2)
    dark, warm, moon = aubergine(dark, .55), aubergine(warm, .25), aubergine(moon, .35)
    out = []
    for img in (dark, warm, moon):
        out.append(M.painterly(img, np.random.default_rng(81), strength=1.35))
    save(out[0], "planks.webp", 86)
    save(out[1], "planks-warm.webp", 84)
    save(out[2], "planks-moon.webp", 84)


# ── cork ─────────────────────────────────────────────────────────────────────
def cork():
    """Pressed cork granules: honey and umber crumbs of different sizes with dark
    pits between them, lit from the top left. Seamless 512."""
    rng = np.random.default_rng(4242)
    S = 512
    # crumbs: a cellular field — every pixel belongs to its nearest seed, and
    # each crumb is its own tone and its own little dome, on a torus so it tiles
    n_seeds = 5200
    pts = rng.uniform(0, S, (n_seeds, 2)).astype(np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    grid = np.stack([yy.ravel(), xx.ravel()], 1)
    from scipy.spatial import cKDTree
    tiled = np.concatenate([pts + np.array([dy, dx], np.float32) * S
                            for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    tree = cKDTree(tiled)
    dist, idx = tree.query(grid, k=2)
    d1 = dist[:, 0].reshape(S, S)
    d2 = dist[:, 1].reshape(S, S)
    cid = (idx[:, 0] % n_seeds).reshape(S, S)
    edge = d2 - d1                                             # 0 on a crumb boundary
    tone = rng.normal(0, 1, n_seeds).astype(np.float32)[cid]
    dome = np.clip(edge / 3.2, 0, 1) ** 0.5
    slow = M.periodic_noise(S, rng, beta=3.0, lo_cut=1)        # board-scale mottling
    fine = M.periodic_noise(S, rng, beta=0.4, lo_cut=90)
    hgt = dome * 2.4 + fine * 0.35
    n = normals(np.tile(hgt, (3, 3))[S:2 * S, S:2 * S], 1.3)
    lam = lambert(n)
    t = np.clip(0.55 + tone * 0.13 + slow * 0.1 + fine * 0.05, 0, 1)
    col = ramp(t, [(0.0, "#5a3a1e"), (0.35, "#8d6337"), (0.62, "#b1814b"), (1.0, "#d2a266")])
    col = col * (0.62 + 0.5 * lam[..., None])
    pit = 1 - np.clip(edge / 1.1, 0, 1)
    col = col * (1 - pit[..., None] * 0.55)
    holes = (rng.random((S, S)) > 0.9975).astype(np.float32)
    holes = np.clip(ndimage.gaussian_filter(holes, 1.1, mode="wrap") * 7, 0, 1)
    col = col * (1 - holes[..., None] * 0.6)
    save(col, "cork.webp", 86)


def paper():
    """Paper fibre for photographs and index cards: a soft cloud and short
    fibres in every direction. Grey around 128, meant for overlay/multiply."""
    rng = np.random.default_rng(5151)
    S, ss = 256, 2
    cloud = M.periodic_noise(S, rng, beta=2.4, lo_cut=2)
    # fibres: short soft strokes in every direction, drawn on a torus (each
    # stroke is drawn again one tile over wherever it crosses an edge)
    im = Image.new("L", (S * ss, S * ss), 128)
    dr = ImageDraw.Draw(im)
    for _ in range(2600):
        x0, y0 = rng.uniform(0, S * ss, 2)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(4, 16) * ss
        x1, y1 = x0 + np.cos(ang) * ln, y0 + np.sin(ang) * ln
        shade = int(128 + rng.choice([-1, 1]) * rng.uniform(10, 34))
        for ox in (-S * ss, 0, S * ss):
            for oy in (-S * ss, 0, S * ss):
                dr.line([(x0 + ox, y0 + oy), (x1 + ox, y1 + oy)], fill=shade, width=1)
    fib = np.asarray(im.resize((S, S), Image.LANCZOS), np.float32) - 128
    fib = ndimage.gaussian_filter(fib, 0.5, mode="wrap")
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (S, S)).astype(np.float32), 0.6, mode="wrap")
    grain /= np.abs(grain).max() + 1e-6
    v = 128 + cloud * 16 + fib * 0.9 + grain * 6
    save(np.dstack([v, v, v]), "paper.webp", 88)


def tape():
    """Masking tape: a translucent cream strip, crinkled, its two ends torn."""
    rng = np.random.default_rng(6262)
    W, H, ss = 200, 56, 3
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    y0, y1 = 9.0, H - 9.0
    tear_l = 10 + np.cumsum(rng.normal(0, 1.6, SH)) / ss
    tear_l = ndimage.gaussian_filter1d(tear_l - tear_l.mean(), 2) * 0.35 + 12
    tear_r = ndimage.gaussian_filter1d(np.cumsum(rng.normal(0, 1.6, SH)) / ss, 2)
    tear_r = W - 12 - (tear_r - tear_r.mean()) * 0.35
    zig_l = np.abs(((yy / 3.2) % 2) - 1) * 3.2
    zig_r = np.abs((((yy + 1.3) / 2.8) % 2) - 1) * 2.8
    inside = (yy >= y0) & (yy <= y1) & (xx >= tear_l[:, None] * np.ones((1, SW)) + zig_l) & (xx <= tear_r[:, None] * np.ones((1, SW)) - zig_r)
    crinkle = ndimage.gaussian_filter(rng.normal(0, 1, (SH, SW)).astype(np.float32), (ss * 6, ss * 1.2))
    crinkle /= np.abs(crinkle).max() + 1e-6
    hgt = crinkle * 3.0
    n = normals(hgt * ss, 0.7)
    lam = lambert(n)
    col = ramp(np.clip(0.55 + crinkle * 0.2, 0, 1), [(0, "#b8a47a"), (1, "#efe0b8")])
    col = col * (0.72 + 0.4 * lam[..., None])
    edge = np.clip(ndimage.distance_transform_edt(inside) / (ss * 1.5), 0, 1)
    a = inside.astype(np.float32) * (0.62 + 0.1 * crinkle) * (0.75 + 0.25 * edge)
    col = down(col, ss)
    a = down(a, ss)
    save(np.dstack([col, a * 255]), "tape.webp", 90)


def pin(name, head_hi, head, head_lo):
    """A push pin seen from just above: a domed plastic head on a short collar,
    lit from the top left, a hard glint, its shadow left to the page."""
    rng = np.random.default_rng(7373)
    S, ss = 64, 4
    SS = S * ss
    yy, xx = np.mgrid[0:SS, 0:SS].astype(np.float32) / ss
    cx, cy, r = 30.0, 29.0, 19.0
    d = np.hypot(xx - cx, yy - cy)
    dome = np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1))
    collar = np.hypot(xx - cx, yy - cy) <= r * 0.52
    hgt = dome * r * 0.9 + np.where(collar, 2.0, 0)
    n = normals(hgt * ss, 0.55)
    lam = lambert(n)
    col = ramp(np.clip(lam * 1.05, 0, 1), [(0, head_lo), (0.55, head), (1, head_hi)])
    s = specular(n, power=40.0)
    col = col + s[..., None] * np.array([255, 245, 235], np.float32) * 0.9
    ring = np.abs(d - r * 0.52) < 0.9
    col = np.where(ring[..., None], col * 0.72, col)
    inside = d <= r
    col = col * smooth(0, 1.2, (r - d))[..., None]
    a = inside.astype(np.float32)
    col = down(col, ss)
    a = down(a, ss)
    save(np.dstack([col, a * 255]), name, 92)


def pins():
    pin("pin.webp", "#ff9b86", "#c8321f", "#5a0f09")
    pin("pin-blue.webp", "#a7e2f2", "#3a8fb3", "#0f3346")


# ── the treehouse window ──────────────────────────────────────────────────────
def hatch():
    """A window in the treehouse wall: four panes of old glass in a rough plank
    frame with a cross bar, looking out over the grounds of UI/mainMenu.png at
    night, the house itself in the middle distance and the moon over it."""
    rng = np.random.default_rng(8484)
    W, H, ss = 420, 470, 2
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    fx0, fx1, fy0, fy1 = 16, W - 16, 14, H - 44         # outer frame
    band = 34                                          # plank frame width
    gx0, gx1, gy0, gy1 = fx0 + band, fx1 - band, fy0 + band, fy1 - band
    frame = (xx >= fx0) & (xx <= fx1) & (yy >= fy0) & (yy <= fy1)
    glass = (xx >= gx0) & (xx <= gx1) & (yy >= gy0) & (yy <= gy1)
    sill = (xx >= 2) & (xx <= W - 2) & (yy >= fy1 - 6) & (yy <= fy1 + 26)

    # the view: the house, centred, from the painting
    im = Image.open(os.path.join(M.UI, "mainMenu.png")).convert("RGB")
    im = im.crop((300, 90, 1400, 820))
    vw, vh = int((gx1 - gx0) * ss), int((gy1 - gy0) * ss)
    k = max(vw / im.width, vh / im.height)
    im = im.resize((int(im.width * k) + 1, int(im.height * k) + 1), Image.LANCZOS)
    ox = (im.width - vw) // 2
    oy = (im.height - vh) // 2
    im = im.crop((ox, oy, ox + vw, oy + vh))
    v = np.asarray(im, np.float32) * np.array([0.70, 0.80, 1.06], np.float32) * 0.74
    vyy, vxx = np.mgrid[0:vh, 0:vw].astype(np.float32)
    # a night haze over the grounds, thickest at the horizon
    haze = np.exp(-((vyy / vh - 0.64) / 0.2) ** 2)[..., None] * np.array([26, 36, 62], np.float32) * 0.6
    v = v + haze
    mx, my, mr = vw * 0.78, vh * 0.16, 15 * ss
    md = np.hypot(vxx - mx, vyy - my)
    disc = 1 - smooth(mr - 1.2, mr + 1.2, md)
    v = v * (1 - disc[..., None]) + disc[..., None] * np.array([230, 236, 248], np.float32)
    halo = np.exp(-(np.maximum(md - mr, 0) / (mr * 1.9)) ** 1.3) * (1 - disc)
    v = v + halo[..., None] * np.array([80, 100, 140], np.float32) * 0.7
    # the glass is dim at its edges, where the frame's shadow and the grime are
    rv = np.hypot((vxx / vw - 0.5) * 1.3, (vyy / vh - 0.5) * 1.2)
    v = v * (1 - 0.45 * smooth(0.25, 0.78, rv))[..., None]
    col = np.zeros((SH, SW, 3), np.float32)
    col[int(gy0 * ss):int(gy0 * ss) + vh, int(gx0 * ss):int(gx0 * ss) + vw] = v
    # old glass: a sheen across it
    sheen = smooth(0.0, 1.0, 1 - np.abs((xx - yy * 0.5 - 120) / 40.0)) * 0.07 * glass
    col = col + sheen[..., None] * np.array([150, 170, 210], np.float32)

    # the frame: four rough planks, butt-jointed, a cross bar in the glass
    midx, midy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
    cross = glass & ((np.abs(xx - midx) <= 6) | (np.abs(yy - midy) <= 6))
    wood_v = plank_albedo(SH, SW, np.random.default_rng(12), "#3d2a1f", "#5a4030", "#1d130d", scale=ss)
    wood_h = np.ascontiguousarray(plank_albedo(SW, SH, np.random.default_rng(13), "#3a281d", "#56402e", "#1b120c", scale=ss).transpose(1, 0, 2))
    ring = frame & ~glass
    top_bot = ring & ((yy < gy0) | (yy > gy1))
    wood = np.where(top_bot[..., None], wood_h, wood_v)
    wood = np.where(cross[..., None], wood_v * 0.9, wood)
    d_ring = ndimage.distance_transform_edt(ring) / ss
    d_cross = ndimage.distance_transform_edt(cross) / ss
    hgt = np.where(ring, np.clip(d_ring / 4, 0, 1) ** 0.6 * 8, 0) + np.where(cross, np.clip(d_cross / 3, 0, 1) * 5, 0)
    hgt = hgt + np.where(sill, 9 + np.where(yy < fy1 + 4, 2, 0), 0)
    hgt = ndimage.gaussian_filter(hgt, ss * 0.6)
    n = normals(hgt * ss, 0.8)
    lam = lambert(n)
    lit = wood * (0.3 + 0.95 * lam[..., None])
    col = np.where((ring | cross)[..., None], lit, col)
    col = np.where(sill[..., None], wood_h * (0.35 + 0.8 * lam[..., None]), col)
    # the joints and nails
    for jx in (fx0 + band, fx1 - band):
        m = ring & (np.abs(xx - jx) < 1.0) & ((yy < gy0) | (yy > gy1))
        col = np.where(m[..., None], col * 0.3, col)
    for nx, ny in ((fx0 + 17, fy0 + 17), (fx1 - 17, fy0 + 17), (fx0 + 17, fy1 - 17), (fx1 - 17, fy1 - 17)):
        nd = np.hypot(xx - nx, yy - ny)
        m = nd < 3.4
        col = np.where(m[..., None], ramp(np.clip(1 - nd / 3.4, 0, 1), [(0, "#231812"), (1, "#8a765d")]), col)
    # ink round every edge, a shadow the frame casts into the glass
    inner_sh = glass & ~cross
    dsh = np.minimum(yy - gy0, xx - gx0)
    col = np.where(inner_sh[..., None], col * (0.45 + 0.55 * smooth(0, 16, dsh))[..., None], col)
    mask = frame | sill
    e = ndimage.distance_transform_edt(mask) / ss
    col = col * smooth(0.0, 1.3, e)[..., None]
    for m_ in (glass, cross):
        b = ndimage.binary_dilation(m_, iterations=ss) & ~ndimage.binary_erosion(m_, iterations=ss)
        col = np.where(b[..., None], col * 0.3, col)
    alpha = mask.astype(np.float32)
    col = down(col, ss)
    alpha = down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "hatch.webp", 90)


PIECES = {
    "planks": planks,
    "cork": cork,
    "paper": paper,
    "tape": tape,
    "pins": pins,
    "hatch": hatch,
}


def main():
    ap = argparse.ArgumentParser(description="Render the treehouse pieces.")
    ap.add_argument("--only", default="", help="comma-separated piece names: " + ", ".join(PIECES))
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("treehouse ->", os.path.relpath(OUT, ROOT))
    for nm in names:
        PIECES[nm]()


if __name__ == "__main__":
    main()
