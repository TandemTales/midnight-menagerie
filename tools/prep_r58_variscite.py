"""Round 58 VARISCITE: the draughtsman's table, drawn in code.

Every bitmap under game/assets/ui/r58-variscite/ comes out of this file: boxwood
ruler, walnut tray, carpenter's pencils, chalk in a brass holder, a rubber, brass
card-frames with paper in them, drawing pins, ballot slips, worn plaques, struck
brass tokens, a pencilled plan pinned to the Treehouse wall, and the tooled
leather behind the shop's rules. No baked words; rerun it and you get the same
files. `python tools/prep_r58_variscite.py [only-these-names]`
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter as G, distance_transform_edt as EDT

OUT = Path(__file__).resolve().parent.parent / 'game/assets/ui/r58-variscite'
ONLY = set(sys.argv[1:])


# ── the bench ────────────────────────────────────────────────────────────────
def rng(seed):
    return np.random.default_rng(seed)


def fbm(h, w, seed, base=48.0, octaves=5, ax=1.0, ay=1.0):
    """Smooth noise in -1..1. ax/ay stretch it, which is how wood gets its grain."""
    r = rng(seed)
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    s = base
    for _ in range(octaves):
        n = G(r.standard_normal((h, w)), (max(s * ay, .4), max(s * ax, .4)), mode='wrap')
        out += amp * n / (n.std() + 1e-9)
        tot += amp
        amp *= .55
        s /= 2
    out /= tot
    return np.clip(out / (np.abs(out).max() + 1e-9), -1, 1)


def mix(a, b, t):
    t = np.asarray(t)
    return a * (1 - t[..., None]) + b * t[..., None]


def C(hexs):
    hexs = hexs.lstrip('#')
    return np.array([int(hexs[i:i + 2], 16) for i in (0, 2, 4)], float)


def ramp(t, stops):
    """t in 0..1 through colour stops [(pos, '#hex'), ...]."""
    pos = np.array([p for p, _ in stops])
    cols = np.stack([C(c) for _, c in stops])
    t = np.clip(t, 0, 1)
    return np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], -1)


def light(height, lx=-.45, ly=-.75, lz=.55, k=1.0):
    """Lambert and a tight highlight off a height map, as (diffuse, spec)."""
    gy, gx = np.gradient(height * k)
    nz = 1.0 / np.sqrt(gx * gx + gy * gy + 1)
    nx, ny = -gx * nz, -gy * nz
    ln = np.sqrt(lx * lx + ly * ly + lz * lz)
    d = (nx * lx + ny * ly + nz * lz) / ln
    hx, hy, hz = lx / ln, ly / ln, lz / ln + 1
    hn = np.sqrt(hx * hx + hy * hy + hz * hz)
    s = np.clip((nx * hx + ny * hy + nz * hz) / hn, 0, 1) ** 26
    return np.clip(d, 0, 1), s


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def sd_round_rect(h, w, x0, y0, x1, y1, r):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    qx = np.abs(xx + .5 - cx) - (x1 - x0) / 2 + r
    qy = np.abs(yy + .5 - cy) - (y1 - y0) / 2 + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def brass(h, w, seed, height=None, wear=.5):
    """Antique brass: dark in its recesses, rubbed bright where hands go."""
    n = fbm(h, w, seed, base=26, octaves=5)
    fine = fbm(h, w, seed + 1, base=3, octaves=2)
    hh = (height if height is not None else np.zeros((h, w))) + n * .9 + fine * .35
    d, s = light(hh, k=1.6)
    rub = smooth(.05, .55, fbm(h, w, seed + 2, base=22, octaves=3)) * wear
    t = np.clip(.16 + d * .66 + rub * .22 + n * .1, 0, 1)
    rgb = ramp(t, [(0, '#2a1a0c'), (.3, '#6b4c24'), (.62, '#b08a4a'), (.86, '#e6c98a'), (1, '#fff0c8')])
    rgb += s[..., None] * np.array([120, 104, 70])
    # verdigris and dirt in the lows
    dirt = smooth(.1, .6, fbm(h, w, seed + 3, base=9, octaves=3))
    return mix(rgb, rgb * np.array([.62, .58, .5]), dirt * .55)


def paper(h, w, seed, tone=('#7f6238', '#b5966a', '#d2b789', '#e6d2a8'), foxing=.5):
    """Old drafting paper: fibres, soft cockle, foxing, darker toward its edges."""
    cockle = fbm(h, w, seed, base=70, octaves=3)
    fibre = fbm(h, w, seed + 1, base=1.6, octaves=2, ax=3, ay=.6)
    fine = fbm(h, w, seed + 2, base=1.1, octaves=1)
    d, _ = light(cockle * 7 + fibre * .7, k=1.0)
    t = .5 + (d - .62) * 1.2 + fine * .12 + fibre * .07
    rgb = ramp(t, [(0, tone[0]), (.4, tone[1]), (.72, tone[2]), (1, tone[3])])
    fox = smooth(.45, .85, fbm(h, w, seed + 3, base=9, octaves=4)) * foxing
    return mix(rgb, rgb * np.array([.72, .6, .44]), fox)


def walnut(h, w, seed, across=False):
    """Oiled walnut, grain running along x (or y)."""
    if across:
        h2, w2 = w, h
    else:
        h2, w2 = h, w
    long_ = fbm(h2, w2, seed, base=9, octaves=4, ax=30, ay=1)
    fine = fbm(h2, w2, seed + 1, base=1.3, octaves=2, ax=26, ay=.8)
    figure = fbm(h2, w2, seed + 2, base=40, octaves=3, ax=3, ay=1)
    rings = np.sin((long_ * 6 + figure * 2.2) * 3.14)
    t = .42 + rings * .2 + fine * .22 + figure * .12
    rgb = ramp(t, [(0, '#120805'), (.35, '#2c170c'), (.65, '#4f2d17'), (.9, '#7a4c26'), (1, '#9c6a3a')])
    if across:
        rgb = np.transpose(rgb, (1, 0, 2))
    return rgb


def save(name, rgb, alpha=None, q=88, size=None):
    if ONLY and name not in ONLY:
        return
    rgb8 = np.clip(rgb, 0, 255).astype('uint8')
    if alpha is None:
        im = Image.fromarray(rgb8, 'RGB')
    else:
        a8 = np.clip(alpha * 255, 0, 255).astype('uint8')
        im = Image.fromarray(np.dstack([rgb8, a8]), 'RGBA')
    if size:
        im = im.resize(size, Image.LANCZOS)
    p = OUT / f'{name}.webp'
    im.save(p, 'WEBP', quality=q, method=6)
    print(f'{name:18s} {im.size[0]:5d}x{im.size[1]:<4d} {p.stat().st_size / 1024:6.1f} KB')


def shadowed(rgb, alpha, dy=5, blur=4, strength=.75):
    """Lay a soft contact shadow under a cut-out object."""
    sh = G(np.roll(alpha, dy, axis=0), blur) * strength
    out_a = alpha + (1 - alpha) * sh
    out_rgb = (rgb * alpha[..., None] + np.array([8, 4, 6]) * ((1 - alpha) * sh)[..., None]) / np.maximum(out_a[..., None], 1e-4)
    return out_rgb, out_a


def scratches(rgb, seed, n=40, length=(10, 80), bright=(1.25, 1.5), angle=.25, width=1):
    h, w = rgb.shape[:2]
    r = rng(seed)
    m = Image.new('L', (w, h), 0)
    dr = ImageDraw.Draw(m)
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h)
        a = r.normal(0, angle)
        l = r.uniform(*length)
        dr.line([x, y, x + np.cos(a) * l, y + np.sin(a) * l], fill=int(r.uniform(70, 200)), width=width)
    s = np.asarray(m.filter(ImageFilter.GaussianBlur(.6)), float) / 255
    return rgb * (1 + s[..., None] * (np.mean(bright) - 1))


# ── the ruler ────────────────────────────────────────────────────────────────
def ruler():
    H, W = 72, 2600
    r = rng(5801)
    wood = fbm(H, W, 5802, base=4, octaves=4, ax=44, ay=1)
    fine = fbm(H, W, 5803, base=1.1, octaves=2, ax=30, ay=.7)
    blotch = fbm(H, W, 5804, base=60, octaves=4, ax=3)
    t = .58 + wood * .16 + fine * .14 + blotch * .13
    rgb = ramp(t, [(0, '#6e4c22'), (.35, '#a57f45'), (.65, '#c9a569'), (1, '#e3c88f')])
    # bevel: the graduated edge is planed thin and catches the lamp
    yy = np.arange(H)[:, None]
    bevel = np.exp(-((yy - 3) / 3.5) ** 2) * 46 - np.exp(-((yy - (H - 4)) / 5) ** 2) * 80
    rgb = rgb + bevel[..., None]
    # thumb-black along the middle of a much-handled rule
    grime = smooth(.0, .55, fbm(H, W, 5805, base=90, octaves=3, ax=6)) * .3
    rgb = mix(rgb, rgb * .66, grime)
    # graduations, inked along the top edge, not quite even in weight
    ink = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(ink)
    step = 13.0
    for i, x in enumerate(np.arange(66, W - 66, step)):
        ln = 20 if i % 20 == 0 else 15 if i % 10 == 0 else 10 if i % 5 == 0 else 6
        wob = r.uniform(-.25, .25)
        dr.line([x + wob, 1, x + wob, ln], fill=int(r.uniform(150, 235)), width=2 if i % 10 == 0 else 1)
    ink = np.asarray(ink.filter(ImageFilter.GaussianBlur(.5)), float) / 255
    rgb = mix(rgb, np.array([34, 18, 8]) * np.ones_like(rgb), ink * .92)
    # brass tips, riveted on
    yyy, xxx = np.mgrid[0:H, 0:W].astype(float)
    for side in (0, 1):
        x0, x1 = (0, 58) if side == 0 else (W - 58, W)
        tip = sd_round_rect(H, W, x0, 0, x1, H, 2)
        mask = smooth(1.2, -1.2, tip)
        hh = np.clip(-tip / 5, 0, 1) * 4
        rgb = mix(rgb, brass(H, W, 5810 + side, height=hh, wear=.8), mask)
        cx = (x0 + x1) / 2
        for cy in (20, 52):
            d = np.hypot(xxx - cx, yyy - cy)
            rgb = mix(rgb, np.array([62, 42, 20]) * np.ones_like(rgb), smooth(6.5, 4.5, d))
            rgb = mix(rgb, np.array([214, 178, 112]) * np.ones_like(rgb), smooth(4, 2, np.hypot(xxx - cx + 1, yyy - cy + 1)))
    rgb = scratches(rgb, 5806, n=70, length=(20, 160), bright=(.8, 1.2), angle=.04)
    save('ruler', rgb, q=86)


# ── the tray ─────────────────────────────────────────────────────────────────
def tray():
    H, W = 132, 2800
    wood = walnut(H, W, 5820)
    # the routed trough: a dark plum baize a hand's depth down
    trough = sd_round_rect(H, W, 26, 10, W - 26, H - 40, 12)
    inside = smooth(1.5, -1.5, trough)
    depth = np.clip(-trough / 18, 0, 1)
    felt_n = fbm(H, W, 5821, base=1.3, octaves=2)
    felt_big = fbm(H, W, 5822, base=38, octaves=3, ax=3)
    felt = ramp(.34 + felt_n * .16 + felt_big * .2 + depth * .16,
                [(0, '#0f0814'), (.4, '#241433'), (.7, '#38214f'), (1, '#4a2f66')])
    # lamp from upper left: the near wall of the trough throws its shadow in
    shade = 1 - .62 * np.exp(-np.clip(-trough, 0, 40) / 9)
    felt = felt * shade[..., None]
    wall = smooth(-3, 2, trough) * smooth(7, 2, trough)
    rgb = mix(wood, felt, inside)
    hh = np.clip(trough, -4, 8) * .9
    d, s = light(hh, k=1.2)
    rgb = rgb * (.6 + .85 * d[..., None]) * (1 - inside[..., None]) + rgb * inside[..., None]
    rgb += (s * (1 - inside))[..., None] * np.array([90, 70, 44])
    rgb = mix(rgb, rgb * 1.35, wall * .5)
    # the front rail: brass bar on posts along the lip
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    ry = H - 26
    bar = np.exp(-((yy - ry) / 5.5) ** 2)
    barh = bar * 7
    rail = brass(H, W, 5823, height=barh, wear=.7)
    rmask = smooth(8.5, 5.5, np.abs(yy - ry))
    rgb = mix(rgb, rgb * .35, smooth(13, 6, np.abs(yy - ry - 7)) * .7)
    rgb = mix(rgb, rail, rmask)
    # posts, unevenly spaced where a hand would actually have set them
    r = rng(5824)
    xs = [30, W - 30] + list(np.cumsum(r.uniform(300, 420, 8)) + 60)
    for x in xs:
        if x > W - 30:
            continue
        d_ = np.hypot(xx - x, (yy - ry) / 1.25)
        m = smooth(17, 14, d_)
        ph = np.clip(16 - d_, 0, 16) / 16 * 8
        rgb = mix(rgb, brass(H, W, int(5830 + x) % 9000, height=ph, wear=.9), m)
        slot = smooth(2.2, 1, np.abs((xx - x) * .86 + (yy - ry) * .5)) * smooth(10, 8, d_)
        rgb = mix(rgb, np.array([30, 18, 8]) * np.ones_like(rgb), slot)
    # the outer edge falls away
    edge = sd_round_rect(H, W, 1, 1, W - 1, H - 1, 12)
    a = smooth(1, -1, edge)
    rim = np.exp(-np.clip(-edge, 0, 20) / 4)
    rgb = rgb * (1 - rim[..., None] * .35)
    rgb = scratches(rgb, 5825, n=120, length=(14, 120), bright=(.85, 1.3), angle=.1)
    save('tray', rgb, a, q=84)


# ── pencils ──────────────────────────────────────────────────────────────────
PENCILS = {
    # dark, body, light, lacquer highlight, lead
    'yellow': ('#7a5310', '#d8a12a', '#f4cf63', '#fff0b2', '#caa02a'),
    'red': ('#4d120f', '#a02c22', '#cf5a44', '#f4a68a', '#b32a22'),
    'green': ('#16361e', '#2f7040', '#5da365', '#b3e0a8', '#2f7a44'),
}


def pencil(name, dark, body, lite, hi, lead, seed, end):
    S = 3
    H, W = 34 * S, 132 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    top, bot = 4 * S, 28 * S          # the barrel, 24 px on screen
    cy = (top + bot) / 2
    half = (bot - top) / 2
    v = (yy - cy) / half              # -1 top .. 1 bottom
    # the cone starts here and comes to a point at the right
    cone_x0 = W - 30 * S
    tip_x = W - 2 * S
    u = np.clip((xx - cone_x0) / (tip_x - cone_x0), 0, 1)
    halfw = half * (1 - u) + .4
    sil = smooth(1.2, -1.2, np.abs(yy - cy) - halfw)
    left_x = 3 * S
    sil = sil * smooth(left_x - 1, left_x + 1, xx)
    # barrel: three lacquered flats with soft arrises
    a = np.clip(v, -1, 1)
    facet = np.select([a < -.42, a < .42], [0.86 + (a + 1) * .1, .54 + (a + .42) * .08], .24 - (a - .42) * .2)
    arris = np.exp(-((a + .42) / .05) ** 2) * .22 + np.exp(-((a - .42) / .05) ** 2) * .08
    n = fbm(H, W, seed, base=30, octaves=4, ax=5)
    fine = fbm(H, W, seed + 1, base=1.4, octaves=2, ax=6)
    t = facet + arris + n * .08 + fine * .05
    rgb = ramp(t, [(0, dark), (.45, body), (.82, lite), (1, hi)])
    # handled paint: chips along the arrises, down to wood
    chips = smooth(.42, .62, fbm(H, W, seed + 2, base=5, octaves=3, ax=3)) * (np.exp(-((a + .42) / .12) ** 2) + np.exp(-((a - .42) / .12) ** 2) + np.exp(-((np.abs(a) - .95) / .12) ** 2))
    woodtone = ramp(.5 + fine * .3, [(0, '#6e4a26'), (1, '#c79a64')])
    rgb = mix(rgb, woodtone, np.clip(chips, 0, 1))
    rgb = scratches(rgb, seed + 3, n=70, length=(8, 90), bright=(.7, 1.35), angle=.05)
    # the sharpened cone: cedar, with the paint's scalloped edge where the knife stopped
    cedar_g = fbm(H, W, seed + 4, base=1.6, octaves=2, ax=7)
    conical = 1 - np.abs(np.clip(v / np.maximum(1 - u, .05), -1, 1) + .32) * .75
    cedar = ramp(.46 + cedar_g * .24 + conical * .4 - .24, [(0, '#5a3a1c'), (.5, '#b98a54'), (1, '#efcf9d')])
    # three scallops, one to a flat
    sc = cone_x0 + (np.abs(np.sin((a + 1) * 1.5 * 3.14159)) * -9 * S + 2 * S)
    knife = (fbm(H, W, seed + 5, base=4, octaves=2) * 3)
    cone_m = smooth(sc - 1 + knife, sc + 1 + knife, xx)
    rgb = mix(rgb, cedar, cone_m)
    # shadow the paint gets where it meets the cut
    rgb = mix(rgb, rgb * .7, smooth(sc - 7, sc, xx) * (1 - cone_m) * .6)
    # the lead, the pencil's own colour
    lead_x = W - 12 * S
    lead_m = smooth(lead_x - 2 + knife * .6, lead_x + 2 + knife * .6, xx)
    lead_rgb = ramp(.45 + conical * .5 - .2, [(0, dark), (.55, lead), (1, hi)])
    rgb = mix(rgb, lead_rgb, lead_m)
    # the far end
    cap_x = 3 * S
    if end == 'rubber':
        fer0, fer1 = 12 * S, 22 * S
        rubber_t = .5 + fine * .2 + facet * .3 - .15
        rub = ramp(rubber_t, [(0, '#54262a'), (.6, '#a0626a'), (1, '#d8a2a0')])
        wearcap = smooth(1.5, -1.5, np.hypot(np.clip(cap_x + 7 * S - xx, 0, None), a * half * .55) - 7 * S)
        rgb = mix(rgb, rub, smooth(fer0 + 1, fer0 - 1, xx))
        sil = sil * np.where(xx < cap_x + 7 * S, wearcap, 1)
        cr = np.sin((xx - fer0) / (fer1 - fer0) * 3.14159 * 5) * 1.6
        band = smooth(fer0 - 1, fer0 + 1, xx) * smooth(fer1 + 1, fer1 - 1, xx)
        roll = (1 - a * a) * 6 + cr
        rgb = mix(rgb, brass(H, W, seed + 6, height=roll, wear=.9), band)
        rgb = mix(rgb, rgb * .62, smooth(fer1 + 7, fer1 + 1, xx) * smooth(fer1 - 1, fer1 + 1, xx) * .5)
    elif end == 'chewed':
        # bitten: a kid has been thinking with this one
        bite = fbm(H, W, seed + 7, base=7, octaves=3) * 3.4 * S
        sil = sil * smooth(-1, 1, xx - (cap_x + 2 * S + bite * smooth(0, 1, np.abs(a))))
        tooth = np.sin(xx * .24 + a * 7) * smooth(16 * S, 6 * S, xx)
        rgb = rgb * (1 - np.clip(tooth, 0, 1)[..., None] * .35)
        dip = smooth(10 * S + 1, 10 * S - 1, xx)
        rgb = mix(rgb, mix(rgb, woodtone, smooth(.2, .75, fine + .3) * .6), dip)
    else:
        # dipped end and a gilt ring
        dip_c = ramp(t, [(0, '#120a06'), (.5, '#2c1a10'), (1, '#6c4a30')])
        rgb = mix(rgb, dip_c, smooth(11 * S + 1, 11 * S - 1, xx))
        ring_ = smooth(11 * S, 11 * S + 1, xx) * smooth(14 * S + 1, 14 * S, xx)
        rgb = mix(rgb, brass(H, W, seed + 6, height=(1 - a * a) * 4, wear=.8), ring_)
        sil = sil * smooth(cap_x - 1, cap_x + 2, xx - np.abs(a) ** 3 * 2 * S)
    rgb, al = shadowed(rgb, sil, dy=2 * S, blur=1.6 * S, strength=.8)
    save(f'pencil-{name}', rgb, al, q=90)


def pencils():
    pencil('yellow', *PENCILS['yellow'], seed=5840, end='rubber')
    pencil('red', *PENCILS['red'], seed=5850, end='dip')
    pencil('green', *PENCILS['green'], seed=5860, end='chewed')


def chalk():
    S = 3
    H, W = 34 * S, 116 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    top, bot = 4 * S, 28 * S
    cy = (top + bot) / 2
    half = (bot - top) / 2
    v = (yy - cy) / half
    rough = fbm(H, W, 5870, base=5, octaves=4) * 1.4 * S
    # a stick of chalk, its worn end rounded and off-true
    tip = W - 3 * S
    dx = np.clip(xx - (tip - 13 * S), 0, None)
    halfw = np.sqrt(np.clip(1 - (dx / (13 * S)) ** 2, 0, 1)) * (half - 1)
    sil = smooth(1.2, -1.2, np.abs(yy - cy - dx * .08) - halfw + rough * .5 * (dx > 0))
    sil = sil * smooth(2 * S, 3 * S, xx)
    round_ = np.sqrt(np.clip(1 - np.clip(v, -1, 1) ** 2, 0, 1))
    fine = fbm(H, W, 5871, base=1.3, octaves=3)
    pit = fbm(H, W, 5872, base=3.5, octaves=3)
    d, _ = light(round_ * 12 + pit * 2.2 + fine * .8, k=1.0)
    t = .25 + d * .8 + fine * .06
    rgb = ramp(t, [(0, '#6f675f'), (.4, '#b8ada0'), (.75, '#e6ddce'), (1, '#fff9ee')])
    # dust rubbed bluish where it has been on the sheet
    blue = smooth(.0, .7, (xx - W * .68) / (W * .3)) * .45
    rgb = mix(rgb, rgb * np.array([.8, .88, 1.0]), blue)
    # the brass porte-crayon that holds it
    fer1 = 23 * S
    band = smooth(fer1 + 1, fer1 - 1, xx - np.sin(v * 2) * 1.2)
    cr = np.exp(-((xx - 8 * S) / 3) ** 2) * 3 + np.exp(-((xx - 19 * S) / 3) ** 2) * 3
    rgb = mix(rgb, brass(H, W, 5873, height=round_ * 9 + cr, wear=.9), band)
    rgb = mix(rgb, rgb * .55, smooth(fer1 + 6, fer1, xx) * (1 - band) * .55)
    rgb, al = shadowed(rgb, sil, dy=2 * S, blur=1.6 * S, strength=.8)
    save('chalk', rgb, al, q=90)


def rubber():
    S = 3
    H, W = 34 * S, 96 * S
    box = sd_round_rect(H, W, 3 * S, 4 * S, W - 3 * S, 29 * S, 6 * S)
    n = fbm(H, W, 5880, base=5, octaves=4) * 1.4
    sil = smooth(1.2, -1.2, box + n)
    fine = fbm(H, W, 5881, base=1.2, octaves=2)
    hh = np.clip(-box, 0, 3 * S) * 1.4 + n * .7 + fine * .5
    d, s = light(hh, k=1.0)
    rgb = ramp(.1 + d * .9, [(0, '#3c1c22'), (.45, '#8e525c'), (.8, '#c28a8c'), (1, '#e6bcb2')])
    # rubbed grey at the working corners, graphite from every drawing it ever fixed
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    gr = smooth(30, 0, np.minimum(xx - 3 * S, W - 3 * S - xx)) * smooth(-.2, .5, fbm(H, W, 5882, base=8, octaves=3))
    rgb = mix(rgb, rgb * np.array([.58, .58, .62]), gr * .85)
    # a paper sleeve round its waist, which is where the word goes
    sx0, sx1 = 15 * S, W - 15 * S
    sl = smooth(sx0 - 1, sx0 + 1, xx + np.sin(yy * .3) * .7) * smooth(sx1 + 1, sx1 - 1, xx + np.sin(yy * .4) * .7)
    pp = paper(H, W, 5883, foxing=.35)
    fold = 1 - np.exp(-((yy - 4.5 * S) / (2 * S)) ** 2) * .3 - np.exp(-((yy - 29 * S) / (2 * S)) ** 2) * .4
    pp = pp * fold[..., None]
    rgb = mix(rgb, pp, sl)
    rgb = mix(rgb, rgb * .7, (smooth(sx0 - 6, sx0, xx) * smooth(sx0 + 1, sx0 - 1, xx) + smooth(sx1 + 6, sx1, xx) * smooth(sx1 - 1, sx1 + 1, xx)) * .55)
    rgb, al = shadowed(rgb, sil, dy=2 * S, blur=1.6 * S, strength=.8)
    save('rubber', rgb, al, q=90)


# ── brass card-frames ────────────────────────────────────────────────────────
def label(name, seed, pale=False, dull=False):
    S = 3
    H, W = 36 * S, 120 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    # the plate carries a screw at each end, past the card
    plate = sd_round_rect(H, W, 1 * S, 2 * S, W - 1 * S, 31 * S, 3 * S)
    wob = fbm(H, W, seed, base=9, octaves=2) * .8
    sil = smooth(1.2, -1.2, plate + wob)
    card = sd_round_rect(H, W, 11 * S, 6 * S, W - 11 * S, 27 * S, 1.2 * S)
    hh = np.clip(-plate, 0, 2.2 * S) * 1.1 - smooth(-2, 2, -card) * 5
    rgb = brass(H, W, seed + 1, height=hh, wear=.7)
    tone = ('#8e7144', '#c2a273', '#dcc293', '#efdcb4') if pale else ('#7f6238', '#b5966a', '#d2b789', '#e6d2a8')
    if dull:
        tone = ('#6c5534', '#94794f', '#ad936a', '#c2aa80')
    pp = paper(H, W, seed + 2, tone=tone, foxing=.45)
    inner = np.exp(-np.clip(-card, 0, 30) / (1.2 * S))
    pp = pp * (1 - inner[..., None] * .62)
    # the frame's lip casts down on to the paper from the top
    lip = np.exp(-np.clip(yy - 6 * S, 0, 40) / (1.4 * S)) * .4
    pp = pp * (1 - lip[..., None])
    m = smooth(1, -1, card)
    rgb = mix(rgb, pp, m)
    for cx, turn in ((5.6 * S, seed * .7), (W - 5.6 * S, seed * 1.3)):
        cy = 16.5 * S
        d = np.hypot(xx - cx, yy - cy)
        head = smooth(3.6 * S, 3.2 * S, d)
        rgb = mix(rgb, rgb * .5, smooth(4.6 * S, 3.4 * S, np.hypot(xx - cx - 1, yy - cy - 2)) * (1 - head))
        ph = np.clip(3.6 * S - d, 0, 3.6 * S)
        rgb = mix(rgb, brass(H, W, seed + 3, height=ph * 1.2, wear=.9), head)
        slot = smooth(1.1 * S, .6 * S, np.abs((xx - cx) * np.sin(turn) + (yy - cy) * np.cos(turn))) * smooth(3.0 * S, 2.6 * S, d)
        rgb = mix(rgb, np.array([24, 14, 6]) * np.ones_like(rgb), slot)
    rgb, al = shadowed(rgb, sil, dy=2 * S, blur=1.5 * S, strength=.85)
    save(name, rgb, al, q=88)


def labels():
    label('label-a', 5901)
    label('label-b', 5902)
    label('label-c', 5903)
    label('label-lit', 5904, pale=True)
    label('label-off', 5905, dull=True)


# ── the ballot slip, and the pins friends leave ──────────────────────────────
def torn_paper(H, W, seed, inset, tone=None, tear=2.4):
    """A sheet with a torn edge. Returns rgb, alpha, sd."""
    box = sd_round_rect(H, W, inset, inset, W - inset, H - inset, 2)
    t1 = fbm(H, W, seed, base=14, octaves=5) * tear * 2.2
    sd = box + t1
    al = smooth(1, -1, sd)
    rgb = paper(H, W, seed + 1, foxing=.5) if tone is None else paper(H, W, seed + 1, tone=tone, foxing=.5)
    # the torn lip shows the pale core, and curls
    lip = smooth(-5, -1, sd)
    rgb = mix(rgb, np.minimum(rgb * 1.28, 255), lip * .55)
    rgb = rgb * (1 - np.exp(-np.clip(-sd, 0, 40) / 14)[..., None] * .22)
    return rgb, al, sd


def stick_tack(rgb, al, cx, cy, r, seed):
    H, W = al.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    d = np.hypot(xx - cx, yy - cy)
    sh = smooth(r * 1.5, r * .4, np.hypot(xx - cx - r * .28, yy - cy - r * .4)) * .6
    rgb = mix(rgb, rgb * .35, sh * al)
    al2 = np.maximum(al, sh * .7)
    rgb = mix(rgb, np.array([8, 4, 4]) * np.ones_like(rgb), sh * (1 - al))
    head = smooth(r, r - 1.4, d)
    hh = np.sqrt(np.clip(r * r - d * d, 0, None)) * .95
    rgb = mix(rgb, brass(H, W, seed, height=hh, wear=.8), head)
    return rgb, np.maximum(al2, head)


def slip():
    S = 3
    H, W = 48 * S, 200 * S
    rgb, al, sd = torn_paper(H, W, 5910, inset=3 * S)
    # crease
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cr = np.exp(-((xx - W * .36 - np.sin(yy * .05) * 2) / 1.2) ** 2) * .2
    rgb = rgb * (1 - cr[..., None])
    rgb, al = stick_tack(rgb, al, 14 * S, 24 * S, 5.2 * S, 5911)
    rgb, al = stick_tack(rgb, al, W - 14 * S, 24 * S, 5.2 * S, 5912)
    sh_rgb, sh_a = shadowed(rgb, al, dy=2 * S, blur=2 * S, strength=.8)
    save('slip', sh_rgb, sh_a, q=86)


def vote_tag(name, seed, tone=None):
    S = 3
    H, W = 50 * S, 38 * S
    rgb, al, sd = torn_paper(H, W, seed, inset=2.5 * S, tone=tone, tear=1.8)
    rgb, al = stick_tack(rgb, al, W / 2, 8.5 * S, 5 * S, seed + 7)
    r2, a2 = shadowed(rgb, al, dy=2 * S, blur=2 * S, strength=.85)
    save(name, r2, a2, q=88)


def votes():
    vote_tag('vote-a', 5920)
    vote_tag('vote-b', 5921)
    vote_tag('vote-c', 5922)
    vote_tag('vote-d', 5923)


# ── plaques and tokens ───────────────────────────────────────────────────────
def sd_plaque(H, W, inset, notch):
    """A rounded bar whose corners are scooped, the samples' nameplate silhouette."""
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    sd = sd_round_rect(H, W, inset, inset, W - inset, H - inset, inset * .25)
    for cx in (inset, W - inset):
        for cy in (inset, H - inset):
            sd = np.maximum(sd, notch - np.hypot(xx - cx, yy - cy))
    return sd


def plaque(name, seed, H=150, W=420, notch=26, inset=6):
    sd = sd_plaque(H, W, inset, notch)
    wob = fbm(H, W, seed, base=30, octaves=3) * 1.3
    sd2 = sd + wob
    sil = smooth(1.2, -1.2, sd2)
    # the outer lip, a recessed bead, then the board
    rim = 11.0
    bead_c = 15.0
    prof = np.clip(-sd2, 0, 50)
    hh = (np.exp(-((prof - rim * .45) / (rim * .42)) ** 2) * 9
          - smooth(rim, rim + 2.5, prof) * 3
          + np.exp(-((prof - bead_c) / 1.6) ** 2) * 2.5)
    metal = brass(H, W, seed + 1, height=hh, wear=.65)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    # the board: scuffed walnut stained to plum, like the select boards' panels
    wood = walnut(H, W, seed + 2)
    wood = wood * np.array([.62, .46, .72]) * .72 + np.array([9, 5, 13])
    grain = fbm(H, W, seed + 3, base=1.2, octaves=2)
    d_b, s_b = light(fbm(H, W, seed + 4, base=20, octaves=4) * 3 + grain * .8, k=1.0)
    wood = wood * (.72 + d_b[..., None] * .55)
    # lamp pooling: a warm rub across the upper left of the board
    pool = np.exp(-(((xx - W * .32) / (W * .46)) ** 2 + ((yy - H * .25) / (H * .7)) ** 2))
    wood = wood + pool[..., None] * np.array([18, 10, 8])
    wood = wood * (1 - np.exp(-np.clip(prof - rim, 0, 40) / 6)[..., None] * .6)
    wood = scratches(wood, seed + 5, n=60, length=(10, 90), bright=(.85, 1.5), angle=.5)
    board_m = smooth(rim - 1, rim + 1, prof)
    bead_m = np.exp(-((prof - bead_c) / 1.5) ** 2) * .85
    rgb = mix(metal, wood, board_m)
    rgb = mix(rgb, metal * .92, bead_m * board_m)
    # rivets at the four scoops
    for cx, cy in ((inset + notch * 1.4, inset + 10), (W - inset - notch * 1.4, inset + 10),
                   (inset + notch * 1.4, H - inset - 10), (W - inset - notch * 1.4, H - inset - 10)):
        d = np.hypot(xx - cx, yy - cy)
        m = smooth(4.8, 3.6, d)
        rgb = mix(rgb, brass(H, W, seed + 6, height=np.clip(5 - d, 0, 5) * 1.4, wear=.9), m)
    r2, a2 = shadowed(rgb, sil, dy=4, blur=3, strength=.8)
    save(name, r2, a2, q=88)


def plaques():
    plaque('plaque-a', 5931)
    plaque('plaque-b', 5932)
    plaque('plaque-c', 5933)
    plaque('plaque-wide', 5934, H=180, W=720, notch=30, inset=6)


def token():
    S = 3
    H, W = 28 * S, 88 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    # struck, not cut: chamfered ends a little off true
    k = (yy - H / 2) / (H / 2 - 2)
    sd = np.maximum(np.abs(yy - H / 2 - fbm(H, W, 5941, base=20, octaves=2) * 1.2) - (H / 2 - 3.5),
                    np.abs(xx - W / 2) + np.abs(k) * 6 * S - (W / 2 - 2))
    sil = smooth(1.2, -1.2, sd + fbm(H, W, 5942, base=7, octaves=3) * 1.1)
    prof = np.clip(-sd, 0, 40)
    # the die's raised border, and the pit where it struck
    hh = np.exp(-((prof - 5) / 2.6) ** 2) * 5 - smooth(7, 10, prof) * 2 + fbm(H, W, 5943, base=4, octaves=3) * 1.0
    rgb = brass(H, W, 5944, height=hh, wear=.5)
    face = smooth(7, 10, prof)
    rgb = mix(rgb, rgb * np.array([1.0, .95, .84]), face * .3)
    r2, a2 = shadowed(rgb, sil, dy=2 * S, blur=1.2 * S, strength=.85)
    save('token', r2, a2, q=90)


def ring():
    """The seat a Companion's medallion sits in."""
    S = 3
    H = W = 64 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx = cy = H / 2
    ang = np.arctan2(yy - cy, xx - cx)
    r_ = np.hypot(xx - cx, yy - cy)
    outer = 30.5 * S + np.sin(ang * 3 + 1) * .25 + fbm(H, W, 5951, base=30, octaves=2) * .6
    inner = 24.0 * S
    sil = smooth(outer + 1, outer - 1, r_) * smooth(inner - 1, inner + 1, r_)
    t = (r_ - inner) / (outer - inner)
    # two beads with a cove between
    hh = (np.exp(-((t - .2) / .16) ** 2) * 7 + np.exp(-((t - .74) / .2) ** 2) * 11) + np.sin(ang * 44) * np.exp(-((t - .2) / .12) ** 2) * .9
    rgb = brass(H, W, 5952, height=hh, wear=.7)
    # the lamp is upper left; a rim keeps that side bright and loses the other
    lit = .5 + .5 * np.cos(ang - (-2.3))
    rgb = rgb * (.62 + lit[..., None] * .55)
    r2, a2 = shadowed(rgb, sil, dy=2 * S, blur=1.5 * S, strength=.8)
    save('ring', r2, a2, q=90)


# ── chain for hanging the plate ──────────────────────────────────────────────
def chain():
    S = 3
    H, W = 40 * S, 12 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx = W / 2
    rgb = np.zeros((H, W, 3))
    al = np.zeros((H, W))
    # one long oval link seen flat, and one seen edge-on, repeating every 40 px
    link = np.abs(np.hypot(xx - cx, np.maximum(np.abs(yy - H * .3) - 9 * S, 0)) - 3.7 * S)
    face = smooth(1.5 * S, .8 * S, link)
    hh = np.clip(1.5 * S - link, 0, None) * 3
    m0 = brass(H, W, 5961, height=hh, wear=.8)
    rgb = mix(rgb, m0, face)
    al = np.maximum(al, face)
    edge = sd_round_rect(H, W, cx - 1.6 * S, H * .68, cx + 1.6 * S, H * 1.08, 1.6 * S)
    edge2 = sd_round_rect(H, W, cx - 1.6 * S, -H * .08, cx + 1.6 * S, H * .08, 1.6 * S)
    for e in (edge, edge2):
        ef = smooth(1, -1, e)
        ehh = np.clip(-e, 0, 8) * 2.2
        rgb = mix(rgb, brass(H, W, 5962, height=ehh, wear=.9), ef)
        al = np.maximum(al, ef)
    save('chain', rgb, al, q=90)


# ── the Treehouse: a plan pinned up, a note pinned up ────────────────────────
def note():
    S = 2
    H, W = 90 * S, 480 * S
    rgb, al, sd = torn_paper(H, W, 5971, inset=3 * S, tear=2.0)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    # ruled feint, faint blue
    for i, y in enumerate((24, 48, 72)):
        f = np.exp(-((yy - y * S - np.sin(xx * .007 + i) * 1.2) / 1) ** 2) * .22
        rgb = mix(rgb, rgb * np.array([.7, .78, .95]), f)
    rgb, al = stick_tack(rgb, al, 13 * S, 12 * S, 5 * S, 5972)
    rgb, al = stick_tack(rgb, al, W - 13 * S, 12 * S, 5 * S, 5973)
    r2, a2 = shadowed(rgb, al, dy=3 * S, blur=3 * S, strength=.8)
    save('note', r2, a2, q=86)


def plan():
    """Tracing paper pinned to the wall: the Kids' own pencil plan of the house."""
    S = 3
    H, W = 112 * S, 170 * S
    r = rng(5981)
    rgb, al, sd = torn_paper(H, W, 5982, inset=4 * S, tear=1.6,
                             tone=('#2c5067', '#3f6b84', '#5c8ba0', '#83aebc'))
    im = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(im)

    def wob(pts, jit=1.6, w=3, fill=235):
        # a line a hand drew: overshoots its corners, drawn twice in places
        for _ in range(2 if r.random() < .5 else 1):
            q = []
            for i in range(len(pts) - 1):
                a, b = np.array(pts[i], float), np.array(pts[i + 1], float)
                n = max(2, int(np.linalg.norm(b - a) / 22))
                for k in range(n + 1):
                    q.append(tuple(a + (b - a) * k / n + r.normal(0, jit, 2)))
            dr.line(q, fill=int(fill * r.uniform(.7, 1)), width=w, joint='curve')

    s = S
    # the house's outline: towers either end, door in the middle
    x0, x1, y0, y1 = 24 * s, W - 24 * s, 24 * s, H - 22 * s
    mid = W / 2
    wob([(x0, y1), (x0, y0 + 26 * s), (x0 + 16 * s, y0 + 8 * s), (x0 + 32 * s, y0 + 26 * s), (x0 + 32 * s, y0 + 34 * s),
         (mid - 18 * s, y0 + 34 * s), (mid, y0 + 8 * s), (mid + 18 * s, y0 + 34 * s), (x1 - 32 * s, y0 + 34 * s),
         (x1 - 32 * s, y0 + 26 * s), (x1 - 16 * s, y0 + 8 * s), (x1, y0 + 26 * s), (x1, y1), (x0 - 4 * s, y1 + 1 * s)], w=4)
    # rooms
    wob([(x0 + 32 * s, y0 + 34 * s), (x0 + 32 * s, y1)], w=3)
    wob([(x1 - 32 * s, y0 + 34 * s), (x1 - 32 * s, y1)], w=3)
    wob([(x0 + 32 * s, y0 + 62 * s), (mid - 12 * s, y0 + 62 * s)], w=2)
    wob([(mid + 12 * s, y0 + 62 * s), (x1 - 32 * s, y0 + 62 * s)], w=2)
    wob([(mid - 8 * s, y1), (mid - 8 * s, y1 - 15 * s), (mid + 8 * s, y1 - 15 * s), (mid + 8 * s, y1)], w=3)
    ink = np.asarray(im.filter(ImageFilter.GaussianBlur(.8)), float) / 255
    tooth = smooth(-.5, .4, fbm(H, W, 5983, base=1.4, octaves=2))
    rgb = mix(rgb, np.array([250, 244, 222]) * np.ones_like(rgb), np.clip(ink * 1.5, 0, 1) * (.35 + tooth * .65) * al)
    # crayon: an X over the room nobody goes in, and a yellow route to the door
    im2 = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(im2)
    cx, cy = x0 + 16 * s, y0 + 48 * s
    wob([(cx - 7 * s, cy - 7 * s), (cx + 7 * s, cy + 7 * s)], w=5, jit=1.2, fill=255)
    wob([(cx - 7 * s, cy + 7 * s), (cx + 7 * s, cy - 7 * s)], w=5, jit=1.2, fill=255)
    red = np.asarray(im2.filter(ImageFilter.GaussianBlur(.9)), float) / 255
    rgb = mix(rgb, np.array([232, 86, 64]) * np.ones_like(rgb), np.clip(red * 1.5, 0, 1) * (.4 + tooth * .6) * al)
    im3 = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(im3)
    wob([(mid, y1 + 12 * s), (mid + 1 * s, y1 - 22 * s), (mid + 34 * s, y0 + 50 * s), (x1 - 16 * s, y0 + 50 * s)], w=5, jit=1.4, fill=255)
    yel = np.asarray(im3.filter(ImageFilter.GaussianBlur(.9)), float) / 255
    rgb = mix(rgb, np.array([248, 208, 92]) * np.ones_like(rgb), np.clip(yel * 1.5, 0, 1) * (.4 + tooth * .6) * al)
    # fold lines: it has lived in somebody's back pocket
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    fold = np.exp(-((xx - W * .5) / 1.6) ** 2) * .22 + np.exp(-((yy - H * .5) / 1.6) ** 2) * .16
    rgb = rgb * (1 - fold[..., None])
    rgb = mix(rgb, np.minimum(rgb * 1.2, 255), np.exp(-((xx - W * .5 - 3) / 1.6) ** 2) * .3)
    rgb, al = stick_tack(rgb, al, 12 * S, 11 * S, 4.6 * S, 5984)
    rgb, al = stick_tack(rgb, al, W - 13 * S, 12 * S, 4.6 * S, 5985)
    rgb, al = stick_tack(rgb, al, W - 11 * S, H - 13 * S, 4.6 * S, 5986)
    r2, a2 = shadowed(rgb, al, dy=3 * S, blur=3 * S, strength=.85)
    save('plan', r2, a2, q=86)


def tsquare():
    """A boxwood T-square hung by its head from a nail."""
    S = 2
    H, W = 190 * S, 74 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx = W / 2
    head = sd_round_rect(H, W, 4 * S, 6 * S, W - 4 * S, 22 * S, 2 * S)
    blade = sd_round_rect(H, W, cx - 9 * S, 16 * S, cx + 9 * S, H - 6 * S, 1.5 * S)
    sd = np.minimum(head, blade)
    sil = smooth(1, -1, sd)
    wood_h = walnut(H, W, 5991)
    box = ramp(.55 + fbm(H, W, 5992, base=2, octaves=3, ax=1, ay=24) * .3 + fbm(H, W, 5993, base=40, octaves=3) * .16,
               [(0, '#6e4c22'), (.4, '#a57f45'), (.7, '#c9a569'), (1, '#e3c88f')])
    rgb = mix(box, wood_h, smooth(1, -1, head))
    prof = np.clip(-sd, 0, 12)
    d, s = light(prof * .9, k=1.0)
    rgb = rgb * (.55 + .8 * d[..., None])
    # graduations down the blade's edge
    ink = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(ink)
    for i, y in enumerate(np.arange(28 * S, H - 12 * S, 6.0 * S / 2)):
        ln = 9 if i % 10 == 0 else 6 if i % 5 == 0 else 3
        dr.line([cx + 9 * S - 1, y, cx + 9 * S - 1 - ln * S, y], fill=210, width=1)
    ink = np.asarray(ink.filter(ImageFilter.GaussianBlur(.4)), float) / 255
    rgb = mix(rgb, np.array([34, 18, 8]) * np.ones_like(rgb), ink * sil)
    # hole and nail
    d_ = np.hypot(xx - cx, yy - 14 * S)
    rgb = mix(rgb, np.array([16, 8, 4]) * np.ones_like(rgb), smooth(5 * S, 4 * S, d_))
    nail = smooth(3.4 * S, 2.6 * S, d_)
    rgb = mix(rgb, brass(H, W, 5994, height=np.clip(3.4 * S - d_, 0, None) * 2, wear=.3) * np.array([.72, .74, .8]), nail)
    r2, a2 = shadowed(rgb, sil, dy=3 * S, blur=3 * S, strength=.85)
    save('tsquare', r2, a2, q=86)


# ── the shop: tooled leather behind a Trick's rules ──────────────────────────
def pores(H, W, seed, cell=9.0):
    """Hide: a cellular crackle from the distance to scattered points."""
    r = rng(seed)
    pts = r.random((H, W)) < 1 / (cell * cell)
    d = EDT(~pts)
    return G(d, .7)


def leather(name, seed, stops, wear_col):
    H, W = 420, 380
    cells = pores(H, W, seed, cell=4.6)
    big = fbm(H, W, seed + 1, base=44, octaves=4)
    mid = fbm(H, W, seed + 2, base=7, octaves=3)
    # the sample boards' damask, blind-pressed into the hide: the art the repo already holds
    dm = Image.open(OUT.parent / 'kit' / 'card-vellum.webp').convert('L').resize((W, H), Image.LANCZOS)
    dm = np.asarray(dm, float)
    dm = (dm - G(dm, 26)) / (dm.std() + 1e-9)
    hh = cells * .34 + big * 4.2 + mid * .6 + dm * 2.5
    d, s = light(hh, k=1.0)
    t = .1 + d * .62 + big * .16 + dm * .1
    rgb = ramp(t, stops)
    rgb += s[..., None] * np.array([50, 44, 46]) * .35
    # a blind-tooled double rule was pressed in by hand
    sd = sd_round_rect(H, W, 0, 0, W, H, 2)
    prof = -sd
    r1 = np.exp(-((prof - 16 + fbm(H, W, seed + 3, base=40, octaves=2) * 1.2) / 1.2) ** 2)
    r2 = np.exp(-((prof - 22) / .9) ** 2)
    rgb = mix(rgb, rgb * .55, r1 * .7 + r2 * .45)
    rgb = mix(rgb, np.minimum(rgb * 1.5, 255), np.roll(r1, 2, axis=0) * .22)
    # rubbed: corners and the near edge down through the dye
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    corner = np.minimum.reduce([np.hypot(xx - a, yy - b) for a in (0, W) for b in (0, H)])
    rub = smooth(120, 18, corner + fbm(H, W, seed + 4, base=18, octaves=4) * 46)
    edge = smooth(26, 2, prof + fbm(H, W, seed + 5, base=11, octaves=4) * 16)
    wear = np.clip(rub * .8 + edge * .55, 0, 1) * smooth(-.25, .35, mid + big * .5)
    wc = C(wear_col) * (.6 + d[..., None] * .7)
    rgb = mix(rgb, wc, wear * .6)
    # a sweep of lamplight over the upper left, gone by the foot
    pool = np.exp(-(((xx - W * .34) / (W * .6)) ** 2 + ((yy - H * .2) / (H * .62)) ** 2))
    rgb = rgb * (.9 + pool[..., None] * .62)
    rgb = scratches(rgb, seed + 6, n=46, length=(14, 110), bright=(.9, 1.55), angle=.9)
    # vignette into the frame
    rgb = rgb * (1 - np.exp(-prof / 16)[..., None] * .42)
    save(name, rgb, q=84)


def leathers():
    leather('leather-skill', 6001, [(0, '#04060c'), (.4, '#0a1324'), (.7, '#14243f'), (1, '#2c456b')], '#6d7a8c')
    leather('leather-attack', 6002, [(0, '#0a0304'), (.4, '#1e080a'), (.7, '#351012'), (1, '#5d2220')], '#8a6a52')
    leather('leather-power', 6003, [(0, '#07040c'), (.4, '#170c26'), (.7, '#2a1842'), (1, '#4c3370')], '#83708f')


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (ruler, tray, pencils, chalk, rubber, labels, slip, votes, plaques, token, ring, chain, note, plan, tsquare, leathers):
        fn()
    total = sum(p.stat().st_size for p in OUT.glob('*.webp'))
    print(f'total {total / 1024 / 1024:.2f} MB')
