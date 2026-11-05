"""Paint round 58's small objects (RHYOLITE): the party's plaques, the draughtsman's tray,
the dropped-friend plate, the shop's rules panels.

Everything is code-drawn from a height field, so it scales with the sheet it was drawn for
and nothing here is a crop of a frame someone else owns:

  1. a silhouette, as a signed distance;
  2. a relief along that distance (a bead, a channel, an inner bead, a recessed face), nudged
     by low noise so no two lengths of a rim are the same;
  3. light from the upper left, the way the samples are lit, with a broken falloff so a rim
     catches the candle in places and goes dark in others;
  4. a colour ramp per material (antique brass, plum enamel, walnut, boxwood).

    python tools/prep_r58_rhyolite.py [name ...]

Outputs are committed under game/assets/ui/r58-rhyolite (no runtime build step).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ni

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets', 'ui', 'r58-rhyolite')
os.makedirs(OUT, exist_ok=True)

BRASS = [(0.0, '#1a1008'), (.22, '#3a2612'), (.42, '#6b4c24'), (.62, '#b08a4a'), (.82, '#e6c98a'), (1.0, '#fff2cf')]
PLUM = [(0.0, '#0d0812'), (.45, '#1b1024'), (.8, '#2b1a38'), (1.0, '#3b2549')]
WALNUT = [(0.0, '#120905'), (.35, '#2a160b'), (.7, '#4d2d16'), (1.0, '#74492a')]
BOXWOOD = [(0.0, '#6e5230'), (.4, '#a48457'), (.75, '#c9ad7a'), (1.0, '#e2cb99')]
RUBBER = [(0.0, '#5a2f33'), (.5, '#a0605e'), (.85, '#cf9186'), (1.0, '#e7b8a6')]
IRON = [(0.0, '#07070a'), (.5, '#1c1a20'), (.85, '#3b3740'), (1.0, '#6a6470')]


def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255


def ramp(t, stops):
    t = np.clip(t, 0, 1)
    xs = [s[0] for s in stops]
    cs = np.stack([hexc(s[1]) for s in stops])
    return np.stack([np.interp(t, xs, cs[:, i]) for i in range(3)], -1)


def noise(shape, sigma, seed):
    """Gaussian noise normalised to about [-1, 1]. sigma may be (y, x) for grain."""
    r = np.random.default_rng(seed)
    n = ni.gaussian_filter(r.standard_normal(shape).astype(np.float32), sigma, mode='wrap')
    n -= n.mean()
    return n / (n.std() * 2.2 + 1e-6)


def fbm(shape, sigmas, seed):
    out = np.zeros(shape, np.float32)
    amp = 1.0
    tot = 0.0
    for i, s in enumerate(sigmas):
        out += amp * noise(shape, s, seed + i * 17)
        tot += amp
        amp *= .55
    return out / tot


def sdist(mask):
    """Signed distance in pixels: negative inside."""
    return ni.distance_transform_edt(~mask).astype(np.float32) - ni.distance_transform_edt(mask).astype(np.float32)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def bump(t, a, b):
    """A half-round bead between distances a and b."""
    u = np.clip((t - a) / max(1e-3, b - a), 0, 1)
    return np.clip(np.sin(u * np.pi), 0, 1) ** .7


def shade(h, k=1.0, light=(-.52, -.68, .52)):
    gy, gx = np.gradient(h)
    n = np.stack([-gx * k, -gy * k, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array(light, dtype=np.float32)
    L /= np.linalg.norm(L)
    d = np.clip((n * L).sum(-1), -1, 1)
    # the half vector for a tight highlight
    V = np.array([0, 0, 1.0])
    H = (L + V) / np.linalg.norm(L + V)
    s = np.clip((n * H).sum(-1), 0, 1) ** 26
    return d, s


def metal(h, shape, seed, stops=BRASS, k=1.0, base=.30, gain=.62, spec=.5):
    d, s = shade(h, k)
    broken = fbm(shape, [34, 12], seed + 3)         # the candle reaches some lengths, not others
    grime = smooth(.12, .7, fbm(shape, [20, 6], seed + 5))
    t = base + d * gain + broken * .13 - grime * .16
    col = ramp(t, stops)
    col = col + (s * spec * (0.55 + .45 * smooth(-.3, .5, broken)))[..., None] * hexc('#fff0c4')
    return np.clip(col, 0, 1)


def save(name, rgba, q=90):
    a = np.clip(rgba, 0, 1)
    im = Image.fromarray((a * 255 + .5).astype(np.uint8), 'RGBA' if a.shape[-1] == 4 else 'RGB')
    path = os.path.join(OUT, name + '.webp')
    im.save(path, 'WEBP', quality=q, method=6, exact=True, alpha_quality=95)
    print(name, im.size, os.path.getsize(path) // 1024, 'KB')


def compose(col, alpha):
    return np.concatenate([col, alpha[..., None]], -1)


def cusped(w, h, cusp, ss=1, inset=0, ear=0):
    """A nameplate's outline: square-cut body with bitten corners and, optionally, a small ear
    at each end's middle, as on the samples' tile nameplates."""
    S = 4
    im = Image.new('L', (w * S, h * S), 0)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = (inset + ear) * S, inset * S, (w - inset - ear) * S, (h - inset) * S
    d.rectangle([x0, y0, x1, y1], fill=255)
    c = cusp * S
    for cx, cy in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        d.ellipse([cx - c, cy - c, cx + c, cy + c], fill=0)
    if ear:
        e = ear * S
        ch = (y1 - y0) * .22
        cy = (y0 + y1) / 2
        d.polygon([(x0 + 2, cy - ch), (x0 - e, cy), (x0 + 2, cy + ch)], fill=255)
        d.polygon([(x1 - 2, cy - ch), (x1 + e, cy), (x1 - 2, cy + ch)], fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def plaque(w, h, cusp, rim, seed, face=PLUM, ear=0, inset=3, faceglow=.0, wear=1.2):
    """A worn plaque: raised brass lip, channel, thin inner bead, recessed enamel face."""
    shape = (h, w)
    m = cusped(w, h, cusp, inset=inset, ear=ear)
    # nibble the silhouette so it is not a machined edge
    dist = sdist(m > .5) + fbm(shape, [9, 3], seed) * wear
    t = -dist
    h1 = bump(t, -.5, rim * .62)
    h2 = bump(t, rim * .72, rim)
    recess = smooth(rim, rim * 1.12, t)
    hh = (h1 * 1.0 + h2 * .55 - recess * .55) * rim * .55
    hh += fbm(shape, [5, 1.6], seed + 1) * .32 * rim * .1 * (1 - recess)
    col = metal(ni.gaussian_filter(hh, .7), shape, seed)
    # the face
    mott = fbm(shape, [26, 9, 3], seed + 9)
    scr = noise(shape, (.7, 22), seed + 11)
    ft = .46 + mott * .24 + scr * .05
    lit = np.linspace(.09, -.07, h)[:, None] + np.linspace(.06, -.05, w)[None, :]
    fcol = ramp(ft + lit + faceglow, face)
    # shade thrown by the lip on the upper-left, a little light caught on the lower-right
    aoL = ni.gaussian_filter(1 - recess, rim * .5)
    fcol *= (1 - np.clip(aoL * 1.2, 0, 1) * .75)[..., None]
    out = col * (1 - recess[..., None]) + fcol * recess[..., None]
    alpha = smooth(.8, -.8, dist)
    return compose(out, alpha)


# ── item 2: the friends' plates ────────────────────────────────────────────────────────

def mate_plaque():
    save('mate-plaque', plaque(720, 204, cusp=26, rim=16, seed=58, ear=5), q=92)


def medal_ring():
    """The socket a friend's Companion sits in: beaded brass, a dark lip, a clear middle, a
    small spur above and below as on the Kid board's moon medallion."""
    n = 216
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    r = np.hypot(x - c, y - c)
    th = np.arctan2(y - c, x - c)
    R = n * .44
    beads = np.cos(th * 34) * .5 + .5
    outer = R + beads * 2.4
    # spurs
    sp = np.maximum(np.exp(-((th + np.pi / 2) / .13) ** 2), np.exp(-((th - np.pi / 2) / .13) ** 2))
    outer = outer + sp * n * .05
    shape = (n, n)
    t = outer - r
    hole = n * .335
    wob = fbm(shape, [8, 3], 71) * 1.2
    h = bump(t + wob, 0, n * .045) * (0.75 + .25 * beads) * 5.5
    h += bump(r, hole + n * .012, hole + n * .058) * 3.6
    h += bump(r, hole + n * .058, R - n * .02) * 1.5
    h += fbm(shape, [4, 1.4], 73) * .4
    col = metal(ni.gaussian_filter(h, .8), shape, 75, k=1.1, base=.36)
    # a lip of shadow where the portrait goes under
    lip = smooth(hole + n * .03, hole, r)
    col *= (1 - lip * .7)[..., None]
    a = smooth(-.8, .8, t) * smooth(hole - .8, hole + .8, r)
    save('medal-ring', compose(col, a))


def token():
    """A struck brass token: the condition stamped into it, not printed on a pill."""
    w, h = 210, 66
    shape = (h, w)
    S = 4
    im = Image.new('L', (w * S, h * S), 0)
    d = ImageDraw.Draw(im)
    k = 14 * S
    W, H = w * S - 8, h * S - 8
    d.polygon([(4 + k, 4), (W - k, 4), (W, 4 + k), (W, H - k), (W - k, H), (4 + k, H), (4, H - k), (4, 4 + k)], fill=255)
    m = np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255 > .5
    dist = sdist(m) + fbm(shape, [6, 2], 81) * 1.0
    t = -dist
    hh = bump(t, -.3, 6.5) * 3.0 - smooth(6.5, 9, t) * .9
    hh += fbm(shape, [7, 2.4], 83) * .55 * smooth(6, 9, t)   # hammered field
    col = metal(ni.gaussian_filter(hh, .6), shape, 85, base=.44, gain=.5, spec=.35)
    # the struck field stays pale enough to read dark letters on
    field = smooth(7, 10, t)[..., None]
    pale = ramp(.68 + fbm(shape, [14, 5], 87) * .10, BRASS)
    col = col * (1 - field * .72) + pale * field * .72
    save('token', compose(col, smooth(.8, -.8, dist)))


# ── item 3: the draughtsman's table ───────────────────────────────────────────────────

def tray():
    """The pencil tray's body: walnut, a long routed groove, a brass rail along its front edge.
    Sliced by CSS (fixed ends, stretched middle)."""
    w, h = 1500, 168
    shape = (h, w)
    S = 3
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).rounded_rectangle([3, 2, w - 4, h - 3], 7, fill=255)
    m = np.asarray(im) > 128
    dist = sdist(m) + fbm(shape, [11, 3], 91) * .8
    t = -dist
    # wood
    g = fbm(shape, [(1.1, 60), (2.4, 150), (.6, 22)], 93)
    rings = np.sin((np.arange(h)[:, None] / h * 34) + fbm(shape, (9, 90), 95) * 7) * .5 + .5
    wt = .50 + g * .34 + (rings - .5) * .10
    wood = ramp(wt, WALNUT)
    # the groove: the middle of the tray is cut away, darker, with a lit far wall
    gy0, gy1 = 44, h - 34
    yy = np.arange(h, dtype=np.float32)[:, None]
    cut = smooth(gy0 - 2, gy0 + 4, yy) * smooth(gy1 + 2, gy1 - 4, yy)
    ends = smooth(15, 34, t)
    cut = cut * ends
    wood = wood * (1 - cut[..., None] * .5)
    wall = np.exp(-((yy - gy0) / 7) ** 2) * ends       # shadow thrown down from the back edge
    wood = wood * (1 - np.clip(wall, 0, 1)[..., None] * .7)
    near = np.exp(-((yy - (gy1 - 2)) / 3.5) ** 2) * ends     # the lit lip nearest the viewer
    wood = wood + near[..., None] * hexc('#6b4324') * .7
    # the brass rail along the front
    ry0, ry1 = h - 24, h - 7
    rh = bump(yy, ry0, ry1) * 7.0 * np.ones(shape)
    rh += fbm(shape, [(3, 40), (1, 6)], 97) * .5
    brass = metal(ni.gaussian_filter(rh, .8), shape, 99, base=.38, gain=.7, spec=.7)
    rmask = (smooth(ry0, ry0 + 1.5, yy) * smooth(ry1, ry1 - 1.5, yy)) * np.ones(shape)
    # brass ends, with two screws each
    endm = (smooth(52, 49, np.minimum(np.arange(w), w - 1 - np.arange(w)))[None, :]) * np.ones(shape)
    endh = fbm(shape, [6, 2], 101) * 1.0 + smooth(0, 6, t) * 3
    endc = metal(ni.gaussian_filter(endh, .8), shape, 103, base=.34, gain=.6)
    out = wood * (1 - rmask[..., None]) + brass * rmask[..., None]
    out = out * (1 - endm[..., None]) + endc * endm[..., None]
    # shading along the very edge
    edge = smooth(5, 0, t)
    out *= (1 - edge * .45)[..., None]
    # contact shadow on the sheet, in the alpha's skirt: left to CSS
    save('tray', compose(out, smooth(.8, -.8, dist)), q=86)


def ruler():
    """A boxwood scale along the tray's back edge, tile-able, ticked in ink. The hint line is
    printed on it live."""
    w, h = 480, 60
    shape = (h, w)
    g = fbm(shape, [(.8, 40), (2, 110), (.5, 14)], 111)
    col = ramp(.60 + g * .26, BOXWOOD)
    yy = np.arange(h, dtype=np.float32)[:, None]
    # chamfer: lit top, dark foot
    col *= (1 + smooth(5, 0, yy) * .22 - smooth(h - 9, h, yy) * .55)[..., None]
    im = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    ink = (38, 24, 12)
    for i in range(0, 48):
        x = i * 10
        l = 22 if i % 10 == 0 else (15 if i % 5 == 0 else 9)
        d.line([(x + 2, 0), (x + 2, l)], fill=ink, width=2 if i % 5 == 0 else 1)
    a = np.asarray(im, dtype=np.float32) / 255
    # ink wears off in patches
    w2 = np.clip(.55 + fbm(shape, [10, 3], 113) * .7, 0, 1)[..., None]
    a = a * w2 + np.clip(col, 0, 1) * (1 - w2)
    save('ruler', a, q=88)


def pencil(name, stops, seed, lead):
    """A real pencil lying in the tray, point to the right: hex barrel (three facets seen),
    brass ferrule and rubber at the butt, cut cedar and coloured lead at the point."""
    w, h = 360, 96
    shape = (h, w)
    cy = h / 2
    half = 44
    tip0 = w - 66      # where the paint stops
    # silhouette
    x = np.arange(w, dtype=np.float32)[None, :] * np.ones(shape)
    y = np.arange(h, dtype=np.float32)[:, None] * np.ones(shape)
    r = np.full(shape, float(half), np.float32)
    cone = np.clip((x - tip0) / (w - 8 - tip0), 0, 1)
    r = half * (1 - cone) + .8 * cone
    m = np.abs(y - cy) <= r
    m &= x >= 6
    m &= x <= w - 8
    v = (y - cy) / np.maximum(r, 1)
    # facets: a hexagon seen side-on has a bright upper face, a broad middle, a dark lower one
    fac = np.select([v < -.5, v < .5], [.86, .62], .30)
    fac = ni.gaussian_filter(fac, (1.0, .1))
    grain = fbm(shape, [(.7, 30), (1.6, 90)], seed)
    paint = ramp(fac + grain * .07, stops)
    # paint chips near the butt and along the facet edges
    chips = smooth(.42, .6, fbm(shape, [5, 2], seed + 3)) * (np.abs(np.abs(v) - .5) < .13)
    paint = paint * (1 - chips[..., None] * .4)
    # a thin foil line along each ridge
    ridge = np.exp(-((np.abs(v) - .5) / .035) ** 2)
    paint = paint + ridge[..., None] * .10
    out = paint
    # cedar cone with a scalloped paint line
    scal = tip0 + 7 * np.cos(v * np.pi * 1.45) - 6
    cedar = ramp(.58 + fbm(shape, [(.8, 10)], seed + 5) * .24 + (-v) * .22, [(0, '#5a3a1e'), (.5, '#b38654'), (1, '#e0bd8a')])
    cm = smooth(-1.2, 1.2, x - scal)
    out = out * (1 - cm[..., None]) + cedar * cm[..., None]
    # lead
    lc = hexc(lead)
    lead_m = smooth(-1, 1, x - (w - 30))
    shade_l = (.82 - v * .24)[..., None]
    out = out * (1 - lead_m[..., None]) + (lc * shade_l) * lead_m[..., None]
    # ferrule and rubber at the butt
    fer_x0, fer_x1 = 26, 58
    fer = smooth(fer_x0 - 1, fer_x0 + 1, x) * smooth(fer_x1 + 1, fer_x1 - 1, x)
    rib = np.sin((x - fer_x0) * 1.15) * 1.2
    fh = np.cos(np.clip(v, -1, 1) * 1.45) * 6 + rib
    fc = metal(ni.gaussian_filter(fh, .6), shape, seed + 7, base=.44, gain=.6)
    out = out * (1 - fer[..., None]) + fc * fer[..., None]
    rub = smooth(fer_x0 + 1, fer_x0 - 1, x)
    rc = ramp(.70 - v * .34 + fbm(shape, [3], seed + 9) * .05, RUBBER)
    out = out * (1 - rub[..., None]) + rc * rub[..., None]
    a = smooth(-.9, .9, r - np.abs(y - cy)) * smooth(5, 7, x) * smooth(w - 7, w - 9, x)
    save(name, compose(out, a), q=90)


def pencils():
    pencil('pencil-yellow', [(0, '#5d3f08'), (.35, '#a57b16'), (.7, '#e0b53a'), (1, '#f7da7a')], 121, '#d9a825')
    pencil('pencil-red', [(0, '#3a0d0c'), (.35, '#7c1f1b'), (.7, '#b83a2e'), (1, '#e0695a')], 131, '#c8392f')
    pencil('pencil-green', [(0, '#10291a'), (.35, '#245239'), (.7, '#3d8058'), (1, '#74b98c')], 141, '#3b8a58')
    pencil('pencil-white', [(0, '#6b665c'), (.35, '#a8a395'), (.7, '#dbd6c6'), (1, '#f6f2e4')], 151, '#efeadb')


def boxwood_tab():
    """A short scale of boxwood with brass tips: the bar's plain verbs, and the map's two
    book buttons, so they are the same family of thing."""
    w, h = 300, 90
    shape = (h, w)
    S = 4
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).rounded_rectangle([3, 3, w - 4, h - 4], 5, fill=255)
    m = np.asarray(im) > 128
    dist = sdist(m) + fbm(shape, [7, 2.5], 161) * .6
    t = -dist
    g = fbm(shape, [(.8, 26), (2, 70), (.5, 10)], 163)
    col = ramp(.60 + g * .24, BOXWOOD)
    d, s = shade(ni.gaussian_filter(smooth(0, 7, t) * 5.0, .8), 1.0)
    col = col * (.66 + np.clip(d, 0, 1)[..., None] * .46)
    grime = np.clip(smooth(26, 2, t) * .34 * (.6 + .5 * fbm(shape, [16, 5], 165)), 0, 1)
    col *= (1 - grime[..., None])
    x = np.arange(w, dtype=np.float32)[None, :] * np.ones(shape)
    tip = np.minimum(x, w - 1 - x)
    tm = smooth(18, 16, tip)
    hb = fbm(shape, [5, 2], 167) * .7 + smooth(0, 5, t) * 4 + np.cos(np.clip((tip - 8) / 9, -1, 1) * 1.5) * 1.5
    bc = metal(ni.gaussian_filter(hb, .7), shape, 169, base=.40, gain=.65, spec=.6)
    col = col * (1 - tm[..., None]) + bc * tm[..., None]
    save('tab', compose(col, smooth(.8, -.8, dist)), q=90)


def eraser():
    w, h = 300, 90
    shape = (h, w)
    im = Image.new('L', (w * 3, h * 3), 0)
    ImageDraw.Draw(im).polygon([(10, 10), (w * 3 - 52, 10), (w * 3 - 10, 60), (w * 3 - 10, h * 3 - 10), (10, h * 3 - 10)], fill=255)
    m = np.asarray(im.resize((w, h), Image.LANCZOS)) > 128
    dist = sdist(m) + fbm(shape, [9, 3], 171) * 1.4
    t = -dist
    hh = smooth(0, 8, t) * 5.0 + fbm(shape, [5, 2], 173) * .3
    d, s = shade(ni.gaussian_filter(hh, 1.0), 1.0)
    col = ramp(.60 + d * .32 + fbm(shape, [18, 6], 175) * .08, RUBBER)
    # rubbed grey-black at the working end
    x = np.arange(w, dtype=np.float32)[None, :] * np.ones(shape)
    dirty = smooth(w * .68, w * .98, x + fbm(shape, [10], 177) * 26)
    col = col * (1 - dirty[..., None] * .55)
    save('eraser', compose(col, smooth(.8, -.8, dist)), q=90)


def knob():
    """A zoom key: a round enamel button in a brass rim, as the samples' round buttons."""
    n = 132
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    r = np.hypot(x - c, y - c)
    th = np.arctan2(y - c, x - c)
    shape = (n, n)
    R = n * .47 + np.cos(th * 28) * .9
    t = R - r
    enamel_r = n * .32
    h = bump(t, 0, n * .10) * 7 + bump(t, n * .10, n * .16) * 3
    h += fbm(shape, [4, 1.5], 181) * .3
    col = metal(ni.gaussian_filter(h, .8), shape, 183, base=.38, gain=.65)
    dome = np.sqrt(np.clip(1 - (r / enamel_r) ** 2, 0, 1)) * 14
    d, s = shade(dome, 1.0)
    en = ramp(.34 + d * .42 + fbm(shape, [10, 4], 185) * .08,
              [(0, '#140a24'), (.5, '#3d2563'), (.85, '#6f45a8'), (1, '#b99be0')])
    en = en + (s * .55)[..., None]
    m = smooth(enamel_r + 1, enamel_r - 1, r)[..., None]
    col = col * (1 - m) + en * m
    save('knob', compose(col, smooth(-.8, .8, t)), q=90)


def stud():
    n = 54
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    r = np.hypot(x - c, y - c)
    h = np.sqrt(np.clip(1 - (r / (n * .44)) ** 2, 0, 1)) * 9
    th = np.arctan2(y - c, x - c)
    slot = np.exp(-(((x - c) * .8 + (y - c) * .6) / 1.8) ** 2) * (r < n * .36)
    h -= slot * 3
    col = metal(ni.gaussian_filter(h, 1.2), (n, n), 191, base=.30, gain=.34, spec=.25)
    save('screw', compose(col, smooth(n * .46 + .8, n * .46 - .8, r)), q=90)


# ── item 5: the dropped-friend plate ──────────────────────────────────────────────────

def net_plaque():
    save('net-plaque', plaque(1000, 300, cusp=24, rim=22, seed=201, ear=8, inset=2, wear=1.6), q=88)


def net_hook():
    """The chain a sign hangs by, from the HUD's rail: three links and an eye."""
    w, h = 54, 132
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    shape = (h, w)
    H = np.zeros(shape, np.float32)
    A = np.zeros(shape, np.float32)
    cx = (w - 1) / 2
    for i, cy in enumerate((16, 48, 80, 112)):
        if i % 2 == 0:   # a link seen from the front: a ring
            rx, ry = 12, 17
            ex = np.hypot((x - cx) / rx, (y - cy) / ry)
            ring = np.abs(ex - 1) * min(rx, ry)
            w_ = 4.6
            hh = np.sqrt(np.clip(1 - (ring / w_) ** 2, 0, 1)) * 5
            a = smooth(w_ + .7, w_ - .7, ring)
        else:            # a link seen edge on: a bar
            dy = np.abs(y - cy)
            hh = np.sqrt(np.clip(1 - ((x - cx) / 5.0) ** 2, 0, 1)) * 5 * (dy < 18)
            a = smooth(5.7, 4.3, np.abs(x - cx)) * smooth(18.5, 17, dy)
        H = np.where(a > A, hh, H)
        A = np.maximum(A, a)
    col = metal(ni.gaussian_filter(H, .6), shape, 211, base=.34, gain=.7)
    save('hook', compose(col, A), q=90)


def lantern_seal():
    """The plate's medallion: an iron-and-brass disc with a guttering candle: someone has
    gone out of the room and the house has noticed."""
    n = 240
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    r = np.hypot(x - c, y - c)
    th = np.arctan2(y - c, x - c)
    shape = (n, n)
    R = n * .47 + np.cos(th * 30) * 1.4
    t = R - r
    h = bump(t, 0, n * .07) * 6 + bump(t, n * .08, n * .13) * 3.4
    h += fbm(shape, [5, 1.6], 221) * .35
    col = metal(ni.gaussian_filter(h, .8), shape, 223, base=.36, gain=.66)
    er = n * .32
    # a dark enamel well
    mott = fbm(shape, [18, 6], 225)
    well = ramp(.34 + mott * .22, [(0, '#0b0612'), (.5, '#20122f'), (1, '#3b2549')])
    glow = np.exp(-(((x - c) / (n * .17)) ** 2 + ((y - c + n * .085) / (n * .19)) ** 2))
    well = well + glow[..., None] * hexc('#ff9f45') * .55
    # the candle stub, the flame leaning hard to one side (a draught)
    cand = (np.abs(x - c) < n * .058) & (y > c - n * .02) & (y < c + n * .20)
    drip = (np.abs(x - c - n * .05) < n * .018) & (y > c - n * .02) & (y < c + n * .07)
    cm = (cand | drip).astype(np.float32)
    cm = ni.gaussian_filter(cm, 1.0)
    ccol = ramp(.62 - (x - c) / (n * .16) * .35 + fbm(shape, [4], 227) * .05, [(0, '#55483a'), (.5, '#b8a78a'), (1, '#efe6cc')])
    well = well * (1 - cm[..., None]) + ccol * cm[..., None]
    base = ni.gaussian_filter(((np.abs(x - c) < n * .15) & (np.abs(y - c - n * .205) < n * .025)).astype(np.float32), 1.0)
    bcol = metal(np.ones(shape) * 0 + fbm(shape, [3], 229) * 1.0, shape, 231, base=.5, gain=.5)
    well = well * (1 - base[..., None]) + bcol * base[..., None]
    fx = x - c + (c - n * .02 - y) * .42      # lean
    fy = y - (c - n * .105)
    flame = np.exp(-((fx / (n * .036)) ** 2 + (fy / (n * .082)) ** 2))
    well = well + (flame ** 1.2)[..., None] * hexc('#ffd28a') * 1.4
    core = np.exp(-((fx / (n * .018)) ** 2 + ((fy - n * .03) / (n * .04)) ** 2))
    well = well + core[..., None] * hexc('#fff4d0') * .7
    m = smooth(er + 1, er - 1, r)[..., None]
    ao = smooth(er - n * .05, er, r)[..., None]
    col = col * (1 - m) + (well * (1 - ao * .7)) * m
    save('net-seal', compose(col, smooth(-.8, .8, t)), q=90)


# ── item 7: the shop's rules panels ───────────────────────────────────────────────────

def rules_panel(name, stops, seed, wearc):
    """The well a card's rules sit in: tooled hide let in under the card's rail. The house's own
    damask (kit/card-vellum) is its height, so the pressed pattern catches the upper-left light;
    pebble and long creases on top; the pile rubbed through at the corners and the foot, where a
    thumb picks a card up, to a paler hide; a double gilt line tooled round it and broken by the
    same wear. Dark at the rim, so it sits under the card frame rather than on it."""
    w, h = 560, 560
    shape = (h, w)
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).rectangle([2, 2, w - 3, h - 3], fill=255)
    m = np.asarray(im) > 128
    dist = sdist(m) + fbm(shape, [12, 4], seed) * 1.8
    t = -dist
    # the damask, tiled and scaled up so its figures read at card size
    dam = Image.open(os.path.join(ROOT, 'game', 'assets', 'ui', 'kit', 'card-vellum.webp')).convert('L')
    dam = dam.resize((int(dam.width * .9), int(dam.height * .9)), Image.LANCZOS)
    da = np.asarray(dam, dtype=np.float32) / 255
    da = np.tile(da, (h // da.shape[0] + 1, w // da.shape[1] + 1))[:h, :w]
    da = (ni.gaussian_filter(da, 1.2) - ni.gaussian_filter(da, 22)) * 16
    # pebble and creases
    peb = noise(shape, 3.4, seed + 1) - noise(shape, 8.0, seed + 2) * .7
    crease = smooth(.035, .0, np.abs(fbm(shape, [46, 16], seed + 3)))
    crease2 = smooth(.03, .0, np.abs(fbm(shape, [80, 30], seed + 13)))
    hh = da * 2.6 + peb * 1.5 - crease * 1.5 - crease2 * .9
    # tooled double line
    tl = np.exp(-((t - 24) / 2.0) ** 2) + np.exp(-((t - 34) / 1.2) ** 2) * .7
    hh -= tl * 2.6
    d_, s_ = shade(ni.gaussian_filter(hh, .8), 1.0)
    mott = fbm(shape, [90, 34, 11], seed + 5)
    x = np.arange(w, dtype=np.float32)[None, :] * np.ones(shape)
    y = np.arange(h, dtype=np.float32)[:, None] * np.ones(shape)
    # one light: the upper left third of the well is where the room reaches it
    lit = np.exp(-(((x / w - .36) / .62) ** 2 + ((y / h - .30) / .58) ** 2))
    tone = .03 + lit * .27 + d_ * .30 + mott * .15
    col = ramp(tone, stops)
    # worn corners and foot
    cd = np.minimum.reduce([np.hypot(x, y), np.hypot(w - x, y), np.hypot(x, h - y), np.hypot(w - x, h - y)])
    foot = smooth(h * .86, h, y) * .55
    n2 = fbm(shape, [20, 7, 2.4], seed + 7)
    wear = np.clip(smooth(170, 30, cd + n2 * 90) + foot * smooth(-.1, .5, n2), 0, 1)
    pale = ramp(.42 + peb * .12 + d_ * .3 + n2 * .16, [(0, '#120c08'), (.4, '#3a2a1e'), (.75, wearc), (1, '#a08a6c')])
    col = col * (1 - wear[..., None] * .82) + pale * wear[..., None] * .82
    # gilt in the tooling, broken
    gilt = np.clip(tl, 0, 1) * smooth(-.25, .3, fbm(shape, [26, 9], seed + 9)) * (1 - wear * .6)
    col = col * (1 - gilt[..., None] * .8) + ramp(.44 + d_ * .4, BRASS) * gilt[..., None] * .8
    # the shade thrown by the frame, heavier on top and left
    ao = smooth(30, 0, t) * .55 + smooth(46, 0, np.minimum(y, x)) * .35
    col = col * (1 - np.clip(ao, 0, .92)[..., None])
    save(name, compose(col, smooth(.8, -.8, dist)), q=88)


def shop_panels():
    rules_panel('rules-skill', [(0, '#03060c'), (.3, '#081322'), (.6, '#112a40'), (1, '#2a4a63')], 301, '#54697a')
    rules_panel('rules-attack', [(0, '#080203'), (.3, '#1c0709'), (.6, '#3a1216'), (1, '#642a2a')], 311, '#7a5148')
    rules_panel('rules-power', [(0, '#05030a'), (.3, '#130a20'), (.6, '#28163f'), (1, '#4c3268')], 321, '#655670')


JOBS = {
    'mate': lambda: (mate_plaque(), medal_ring(), token()),
    'tray': lambda: (tray(), ruler(), pencils(), boxwood_tab(), eraser(), knob(), stud()),
    'net': lambda: (net_plaque(), net_hook(), lantern_seal()),
    'shop': shop_panels,
}

if __name__ == '__main__':
    names = sys.argv[1:] or list(JOBS)
    for n in names:
        JOBS[n]()
