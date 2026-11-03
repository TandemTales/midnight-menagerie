"""Round 57 JASPER: the small cast and cut objects, and the two plainer rooms.

    python tools/prep_r57_jasper_objects.py [objects gameover gameover1280 shop shop1280]

Same engine and same light as tools/prep_r57_jasper.py. No model, no bitmap input.
"""
import sys
from pathlib import Path
import numpy as np
from scipy import ndimage as ndi
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from prep_r57_jasper import Room, OUT, CANDLE, EMBER, noise, aniso, fbm, smooth, mix


def save_rgba(C, a, name, quality=90):
    rgba = np.dstack([np.clip(C, 0, 1), np.clip(a, 0, 1)])
    im = Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA')
    path = OUT / f'{name}.webp'
    im.save(path, quality=quality, method=6)
    print(name, im.size, path.stat().st_size)


def coin(name, seed, S=192):
    """A small cast bronze coin: milled rim, dark channel, dished face, dents, tarnish, one candle."""
    s = Room(S, S, seed)
    c = (S - 1) / 2
    x, y = s.xx - c, s.yy - c
    r = np.hypot(x, y) / (S / 2)
    th = np.arctan2(y, x)
    rr = np.random.default_rng(seed)
    mill = .6 * np.sign(np.sin(th * 58 + .4 * noise(S, S, 6, seed))) * smooth(.86, .9, r)
    R = np.zeros((S, S))
    R += 15 * smooth(.985, .90, r)                                       # the disc's edge
    R += 3 * mill
    R -= 11 * smooth(.71, .78, r) * smooth(.87, .80, r)                  # the dark channel
    R += 5 * smooth(.56, .70, r) * smooth(.78, .71, r)                   # the inner bead
    R += -3.5 * smooth(.72, .0, r)                                       # dished face
    for _ in range(5):                                                   # dents
        a, b = rr.uniform(-.62, .62, 2)
        R -= rr.uniform(1.5, 3.8) * np.exp(-((x / (S / 2) - a) ** 2 + (y / (S / 2) - b) ** 2) / rr.uniform(.004, .02))
    for _ in range(3):                                                   # knocks in the rim
        an = rr.uniform(0, 2 * np.pi)
        R -= 5 * np.exp(-((r - .9) ** 2 / .002 + ((th - an + np.pi) % (2 * np.pi) - np.pi) ** 2 / .03))
    R += .7 * fbm(S, S, 2.4, seed + 1) + .8 * fbm(S, S, 9, seed + 2)
    s.R = R
    bronze = np.array([.74, .53, .29])
    f = fbm(S, S, 11, seed + 3)
    A = bronze[None, None] * (1 + .13 * f[..., None])
    # rubbed bright on the high places; black-green tarnish in the low ones
    low = smooth(1.2, -2.0, ndi.gaussian_filter(R, 2) - ndi.gaussian_filter(R, 10))
    # tarnish keeps off the middle of the face, where a numeral is struck over it
    tarn = (smooth(-.35, 1.1, fbm(S, S, 16, seed + 4)) * .62 + low * .5) * (.28 + .72 * smooth(.3, .66, r))
    A = mix(A, np.array([.17, .19, .12])[None, None], np.clip(tarn, 0, .82))
    ch = smooth(.72, .75, r) * smooth(.84, .81, r)
    A = mix(A, np.array([.05, .03, .06])[None, None], ch * .9)
    A = A * (1 + .42 * smooth(.62, .0, r))[..., None]
    s.A = A
    s.normals(.5)
    s.ambient((.66, .54, .46), .72)
    s.lamp(-S * .55, -S * .6, S * .75, CANDLE * np.array([1, 1.05, 1.1]), 2.6, S * 1.6)
    C = s.A * s.L
    spec = np.clip((s.nx * -.55 + s.ny * -.62 + s.nz * .56), 0, 1) ** 30
    C += (spec * .75 * smooth(.7, .99, r + .2 * (f > 0)))[..., None] * np.array([1, .86, .62])
    C = 1 - np.exp(-C * 1.45)
    C *= (1 - .55 * smooth(.92, .985, r))[..., None]
    a = smooth(1.0, .975, r)
    save_rgba(C, a, name, 92)


def _sdf(s, W, H, m, corner):
    """Distance inside a plaque with hollowed corners: a drawer face, not a pill."""
    dx = np.minimum(s.xx - m, W - 1 - m - s.xx)
    dy = np.minimum(s.yy - m, H - 1 - m - s.yy)
    d = np.minimum(dx, dy)
    for cx in (m, W - 1 - m):
        for cy in (m, H - 1 - m):
            d = np.minimum(d, np.hypot(s.xx - cx, s.yy - cy) - corner)
    return d


def row_plate(name, seed, W=760, H=116):
    """A Final Tricks row: shallow crushed velvet lit from the left, falling away right, under a firm gold rim."""
    s = Room(W, H, seed)
    d = _sdf(s, W, H, 5, 24)
    nap1 = aniso(H, W, 3, 24, seed + 1)
    nap2 = aniso(H, W, 14, 3, seed + 2)
    patch = fbm(H, W, 34, seed + 3)
    cr = smooth(-.3, .7, fbm(H, W, 22, seed + 4))
    nap = mix(nap1[..., None], nap2[..., None], cr)[..., 0]
    v = 1 + .17 * nap + .24 * patch
    u = s.xx / W
    jitter = .05 * noise(H, W, 30, seed + 5)
    fall = .20 + .95 * smooth(.92, .03, u + jitter) ** 1.25
    fall = fall * (1 - .22 * (s.yy / H)) * (.92 + .1 * s.yy / H)
    plum = np.array([.25, .115, .315])
    wine = np.array([.27, .095, .19])
    face = mix(plum[None, None], wine[None, None], smooth(-.6, 1.0, patch)) * (v * fall)[..., None]
    rub = smooth(.8, 1.9, fbm(H, W, 12, seed + 6)) * smooth(.5, .05, u)
    face = mix(face, face * 1.6 + np.array([.05, .03, .05]), rub * .45)
    well = smooth(7, 20, d - 6)
    face = face * (.32 + .68 * well)[..., None]
    rim_w = 8.5
    t = np.clip(d / rim_w, 0, 1)
    h = np.sin(t * np.pi) ** .7
    gy, gx = np.gradient(ndi.gaussian_filter(h, 1.0) * 7)
    ndl = np.clip(-gx * .45 - gy * .62 + .55, 0, 1.6)
    wear = fbm(H, W, 9, seed + 7)
    fade = .50 + .62 * smooth(.95, .0, u + .04 * noise(H, W, 40, seed + 8))
    body = mix(np.array([.42, .28, .13])[None, None], np.array([.82, .62, .33])[None, None], smooth(.1, 1.15, ndl))
    gold = body * (fade * (1 + .22 * wear))[..., None]
    tar = smooth(.5, 1.5, fbm(H, W, 18, seed + 9))
    gold = mix(gold, gold * np.array([.42, .42, .34]), tar * .85)
    catch = np.exp(-((s.xx - 22) ** 2 / 900 + (s.yy - 14) ** 2 / 120)) + .7 * np.exp(-((s.xx - 150) ** 2 / 2600 + (s.yy - 8) ** 2 / 26))
    gold = gold + (catch * ndl * .55)[..., None] * np.array([1, .84, .58])
    C = np.where((d < rim_w)[..., None], gold, face)
    C *= (1 - .78 * smooth(1.6, 0, np.abs(d - rim_w)))[..., None]
    C *= (1 - .55 * smooth(1.4, 0, np.abs(d)))[..., None]
    C = ndi.median_filter(np.clip(C, 0, 1), size=(3, 3, 1))
    save_rgba(C, smooth(-.5, 1, d), name, 92)


def slip(name, seed, W=1240, H=150):
    """An option slip: old card torn by hand, its edges scorched, the fibres standing out of the tear."""
    s = Room(W, H, seed)
    m = 13
    dx = np.minimum(s.xx - m, W - 1 - m - s.xx)
    dy = np.minimum(s.yy - m, H - 1 - m - s.yy)
    wob = 3.4 * fbm(H, W, 30, seed + 1) + 1.9 * fbm(H, W, 6, seed + 2) + .9 * noise(H, W, 1.3, seed + 3)
    d = np.minimum(dx, dy) + wob - 1
    paper = np.array([.92, .82, .63])
    cloud = fbm(H, W, 40, seed + 5)
    fine = fbm(H, W, 2.2, seed + 6)
    fib = aniso(H, W, .7, 9, seed + 7)
    C = paper[None, None] * (1 + .05 * cloud + .035 * fine + .03 * fib)[..., None]
    fox = smooth(1.5, 2.2, fbm(H, W, 7, seed + 8))
    C = mix(C, C * np.array([.74, .58, .42]), fox * .55)
    # scorch eaten in from the edge, unevenly, deepest at the ends
    ends = smooth(0, 150, np.minimum(s.xx, W - s.xx))
    reach = (5 + 9 * smooth(-1, 1.5, fbm(H, W, 30, seed + 9))) * (1.5 - .5 * ends)
    sc = smooth(reach * 1.9, 0, d)
    C = mix(C, np.array([.50, .27, .10])[None, None], sc * .78)
    ch = smooth(reach * .62, 0, d)
    C = mix(C, np.array([.10, .05, .03])[None, None], ch ** 1.3)
    # the tear's pale core: raised fibres catching the light
    tear = smooth(2.6, .6, np.abs(d - 1.4)) * smooth(-1.5, 1, fbm(H, W, 3, seed + 10))
    fibres = np.clip(aniso(H, W, 3.2, .55, seed + 11), 0, 2)
    C = mix(C, np.array([.84, .70, .50])[None, None], tear * (.38 + .25 * fibres))
    a = smooth(-.6, .8, d)
    out = np.clip(aniso(H, W, 3.6, .6, seed + 12) - .9, 0, 1) * smooth(-5, -.5, d) * (d < 0)
    a = np.maximum(a, out * .85)
    C = np.where((d < 0)[..., None], np.array([.36, .22, .10])[None, None], C)
    base = np.abs(s.yy - H * .80) < 1.0
    C = np.where((base & (fbm(H, W, 16, seed + 13) > -.4) & (d > 16))[..., None], C * np.array([.74, .66, .6]), C)
    C = ndi.median_filter(np.clip(C, 0, 1), size=(3, 3, 1))
    save_rgba(C, a, name, 90)


def page_edge(name, seed, S=720, E=64):
    """Nine-slice wear for the register's leaf: nibbled, browned edges over the walnut behind it."""
    s = Room(S, S, seed)
    d = np.minimum(np.minimum(s.xx, S - 1 - s.xx), np.minimum(s.yy, S - 1 - s.yy))
    wob = 8.5 * fbm(S, S, 34, seed + 1) + 3.5 * fbm(S, S, 7, seed + 2) + 1.2 * noise(S, S, 1.4, seed + 3)
    e = d - 11 + wob
    wood = np.array([.09, .05, .03])[None, None] * (1 + .25 * fbm(S, S, 5, seed + 4))[..., None]
    burnt = np.array([.34, .19, .07])[None, None] * (1 + .2 * fbm(S, S, 4, seed + 5))[..., None]
    C = np.where((e < 0)[..., None], wood, burnt)
    lip = smooth(3.2, .7, np.abs(e - 2.0)) * smooth(-1.2, 1.0, fbm(S, S, 3.2, seed + 6))
    C = mix(C, np.array([.78, .62, .38])[None, None], lip * .62)
    burn = smooth(30, 3, e) * .72 * (1 + .25 * fbm(S, S, 18, seed + 7))
    a = np.where(e < 0, 1, np.clip(burn, 0, 1))
    a = np.maximum(a, lip * .75)
    a = a * (d < E)
    save_rgba(C, a, name, 90)


def alcove_mask(name, seed, W=540, H=570):
    """The alcove's hard rectangle falls into the wall: arched at the head, broken at the sides."""
    s = Room(W, H, seed)
    wob = 9 * fbm(H, W, 22, seed + 1) + 3 * fbm(H, W, 5, seed + 2)
    dx = np.minimum(s.xx, W - 1 - s.xx)
    dy = np.minimum(s.yy, H - 1 - s.yy)
    d = np.minimum(dx, dy)
    arch = s.yy - (np.abs(s.xx - W / 2) / (W / 2)) ** 3.2 * 78
    d = np.minimum(d, arch)
    save_rgba(np.ones((H, W, 3)), smooth(4, 40, d + wob), name, 80)


def wall_room(W, H, g, name, seed):
    """A plainer room for the boards whose walls only show round the edges."""
    s = Room(W, H, seed)
    s.wall(int(H * .083), g['rail'])
    s.wainscot(g['rail'], g['floor'], g['panel'])
    if g.get('flags'):
        s.flags(g['floor'], g['depth'], W / 2, g['cell'])
    else:
        s.boards(g['floor'], g['depth'], W / 2, g['plank'])
    s.normals()
    s.ambient((.50, .40, .68), g.get('amb', .24))
    for sx in (g['corner_x'], W - g['corner_x']):
        s.lamp(sx, g['corner_y'], 90, CANDLE, 1.05, W * .15)
    for x, y, z, p, r in g.get('lamps', []):
        s.lamp(x, y, z, EMBER, p, W * r)
    d = np.sqrt(((s.xx - W / 2) / (W * .62)) ** 2 + ((s.yy - H * .5) / (H * .72)) ** 2)
    s.L *= (1 - .42 * smooth(.72, 1.15, d))[..., None]
    s.finish(name)


def plaque(name, seed, W=240, H=64):
    """A condition's plate: warm gilt rim, and a face of old lavender lacquer browned by the candle."""
    s = Room(W, H, seed)
    d = _sdf(s, W, H, 2, 11)
    t = np.clip(d / 10, 0, 1)
    h = np.sin(t * np.pi) ** .7
    gy, gx = np.gradient(ndi.gaussian_filter(h, .8) * 6)
    ndl = np.clip(-gx * .5 - gy * .62 + .6, 0, 1.7)
    wear = fbm(H, W, 6, seed + 1)
    gold = mix(np.array([.40, .25, .10])[None, None], np.array([.92, .72, .40])[None, None], smooth(.1, 1.1, ndl)) * (1 + .22 * wear)[..., None]
    tar = smooth(.4, 1.5, fbm(H, W, 11, seed + 2))
    gold = mix(gold, gold * np.array([.5, .46, .36]), tar * .8)
    cl = fbm(H, W, 18, seed + 3)
    brush = aniso(H, W, 1.2, 14, seed + 4)
    face = mix(np.array([.145, .08, .13])[None, None], np.array([.25, .13, .10])[None, None], smooth(-.8, 1, cl - .9 * (s.xx / W - .35)))
    face = face * (1 + .14 * brush)[..., None] * (.70 + .34 * (1 - s.yy / H))[..., None]
    well = smooth(0, 7, d - 9)
    face = face * (.45 + .55 * well)[..., None]
    C = np.where((d < 10)[..., None], gold, face)
    C *= (1 - .8 * smooth(1.2, 0, np.abs(d - 10)))[..., None]
    C *= (1 - .5 * smooth(1, 0, np.abs(d)))[..., None]
    save_rgba(np.clip(C, 0, 1), smooth(-.5, .8, d), name, 94)
    # the same plate cut in three, for layers that can sit under clipped text
    al = smooth(-.5, .8, d)
    C = np.clip(C, 0, 1)
    cap = 28
    save_rgba(C[:, :cap], al[:, :cap], name + '-l', 94)
    save_rgba(C[:, W - cap:], al[:, W - cap:], name + '-r', 94)
    save_rgba(C[:, 90:150], al[:, 90:150], name + '-m', 94)


JOBS = {
    'plaque': lambda: plaque('plaque', 5752),
    'objects': lambda: ([coin(f'coin-{k}', 5720 + i) for i, k in enumerate('abc')],
                        [row_plate(f'row-{k}', 5730 + i) for i, k in enumerate('abc')],
                        [slip(f'slip-{k}', 5740 + i) for i, k in enumerate('ab')],
                        page_edge('page-edge', 5750), alcove_mask('alcove-mask', 5751)),
    'gameover': lambda: wall_room(1600, 900, dict(rail=560, floor=786, depth=200, flags=True, cell=66, panel=236, corner_x=168, corner_y=118, lamps=[(780, 470, 170, 1.4, .24)], amb=.30), 'gameover-room', 5760),
    'gameover1280': lambda: wall_room(1280, 800, dict(rail=498, floor=700, depth=180, flags=True, cell=56, panel=190, corner_x=135, corner_y=104, lamps=[(624, 420, 150, 1.4, .24)], amb=.30), 'gameover-room-1280', 5761),
    'shop': lambda: wall_room(1600, 900, dict(rail=560, floor=800, depth=210, plank=46, panel=236, corner_x=168, corner_y=118, lamps=[(800, 860, 60, .9, .22), (800, 120, 120, .5, .2)], amb=.26), 'shop-room', 5762),
    'shop1280': lambda: wall_room(1280, 800, dict(rail=498, floor=700, depth=180, plank=38, panel=190, corner_x=135, corner_y=104, lamps=[(640, 760, 60, .9, .22), (640, 110, 120, .5, .2)], amb=.26), 'shop-room-1280', 5763),
}

if __name__ == '__main__':
    for k in (sys.argv[1:] or JOBS):
        JOBS[k]()
