"""Painted dressing for the six boards and the run HUD (round 5, POLISH).

    python tools/prep_ui_dressing.py            # writes game/assets/ui/kit/*.webp

Round 4's judges held every POLISH board back on the same few things: a web
pill, a thin outline, a flat bar where the samples always paint an object.
These are the objects, made the two ways this kit already makes its pieces:
cut out of Josh's own paintings where a sample holds the thing, and lit from a
height field where it does not, so the metal has a body and a light on it
rather than a gradient.

  moth-mirror.webp       UI/selectKid.png's mirror frame, whole: the moon
                         medallion on its crest, the paw medallion at its foot,
                         the scrollwork between, the glass cut away. Mr. Moth
                         stands in it at the head of his shelf.
  socket-filigree.webp   that mirror's paw medallion with the paw painted out:
                         the gilt ring, its fleur finial and drop, the curls
                         nearest it, and a hollow of dark violet enamel sunk
                         under the rim. An empty setting, not an outline.
  boss-rosette.webp      a cast brass boss, a milled rim round an eight-petal
                         rosette, lit from the boards' top left: the cap for a
                         rail's end.
  stain-madder.webp      watercolour washes for the map's wings: a blotchy
  stain-indigo.webp      body of pigment, pooled dark at the edge where it
                         dried, a tide line inside that, back-runs, and the
                         grain of the paper holding the colour.

Deterministic: every random draw is seeded.
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KID = os.path.join(ROOT, "UI", "selectKid.png")
OUT = os.path.join(ROOT, "game", "assets", "ui", "kit")


def save(arr, name, **kw):
    img = Image.fromarray(arr, "RGBA")
    bbox = img.getbbox()
    if kw.pop("trim", True) and bbox:
        img = img.crop(bbox)
    path = os.path.join(OUT, name)
    img.save(path, "WEBP", quality=kw.get("quality", 90), alpha_quality=100, method=6)
    print("  %-22s %4dx%-4d %6.1f KB" % (name, img.width, img.height, os.path.getsize(path) / 1024))
    return img


def lum_of(a):
    return a[..., 0] * .299 + a[..., 1] * .587 + a[..., 2] * .114


# ── cut from the Kid board ────────────────────────────────────────────────────
def moth_mirror(A):
    """The mirror frame, matted off the wall behind it. The wall is near black and
    so is the ink round every gilt stroke, so the matte takes the metal, closes
    the ink back into it, fills the small pockets the scrollwork encloses, and
    keeps the two medallions whole; the glass stays cut away. The skull and the
    candle either side of its foot stand clear of the frame and are left out."""
    X0, Y0, X1, Y1 = 326, 230, 676, 948
    a = A[Y0:Y1, X0:X1].copy()
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    m = lum_of(a) > 42
    excl = ((xx < 62) & (yy > 560)) | ((xx > 290) & (yy > 570)) | ((yy < 22) & (xx > 222))
    m &= ~excl
    m = ndi.binary_closing(m, structure=np.ones((7, 7)))
    holes = ndi.binary_fill_holes(m) & ~m
    lab, n = ndi.label(holes)
    for i, s in enumerate(ndi.sum(holes, lab, range(1, n + 1)), start=1):
        if s < 900:
            m[lab == i] = True
    for cx, cy, r in ((174, 50, 34), (174, 635, 36)):          # moon, paw
        m |= (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    m &= ~excl
    lab, n = ndi.label(m)
    if n > 1:                                                   # the frame is one body
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = lab == (1 + int(np.argmax(sizes)))
    alpha = ndi.gaussian_filter(ndi.binary_dilation(m, iterations=1).astype(np.float32), .8)
    alpha = np.clip(alpha * 1.25, 0, 1)
    return np.dstack([a, alpha * 255]).astype(np.uint8)


def socket_filigree(A):
    """The paw medallion, emptied. Its enamel is repainted as a hollow: the Kid
    board's violet, mottled, darkest under the rim's top-left lip where the light
    cannot reach and lifting toward the lower right."""
    cx, cy, R = 500, 873, 37.5
    X0, X1, Y0, Y1 = cx - 64, cx + 64, cy - 78, cy + 70
    src = A[Y0:Y1, X0:X1]
    a = src.copy()
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    lx, ly = cx - X0, cy - Y0
    r = np.hypot(xx - lx, yy - ly)
    rng = np.random.default_rng(7)
    mott = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), 3.0)
    mott /= np.abs(mott).max() + 1e-6
    fine = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), 0.8)
    fine /= np.abs(fine).max() + 1e-6
    hi, lo = np.array([48, 31, 66], np.float32), np.array([11, 7, 17], np.float32)
    t = np.clip(r / R, 0, 1)
    toward = ((xx - lx) * .55 + (yy - ly) * .85) / R
    lift = np.clip(.45 + .35 * toward * t, 0, 1)
    col = lo + (hi - lo) * (lift * (1 - .55 * t ** 2))[..., None]
    col *= (1 + .22 * mott + .06 * fine)[..., None]
    col *= (1 - .65 * np.clip((r - (R - 7)) / 7, 0, 1) ** 1.6)[..., None]
    w = np.clip((R + .5 - r) / 2.0, 0, 1)[..., None]
    a = a * (1 - w) + col * w
    m = (lum_of(src) > 42) | (r < R + 1)
    m = ndi.binary_closing(m, structure=np.ones((5, 5)))
    lab, _ = ndi.label(m)
    m = lab == lab[ly, lx]
    m &= ~((yy < 40) & (np.abs(xx - lx) > 20))                 # the mirror's rail above it
    alpha = ndi.gaussian_filter(ndi.binary_dilation(m, iterations=1).astype(np.float32), .7)
    alpha = np.clip(alpha * 1.3, 0, 1) * np.clip((60 - np.abs(xx - lx)) / 10, 0, 1)
    return np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)


# ── lit from a height field ───────────────────────────────────────────────────
BRASS = np.array([
    [22, 13, 6], [58, 38, 16], [107, 76, 36], [150, 116, 62], [176, 138, 74],
    [214, 180, 118], [238, 212, 150], [255, 244, 206]], np.float32)


def ramp(v, stops=BRASS):
    v = np.clip(v, 0, 1) * (len(stops) - 1)
    i = np.floor(v).astype(int)
    f = (v - i)[..., None]
    return stops[i] * (1 - f) + stops[np.clip(i + 1, 0, len(stops) - 1)] * f


def shade(h, mask, strength, light=(-.55, -.75, .3), grain=.05, seed=3, ao=.6):
    """Brass from a height field: a grazing light from the top left so the flats
    sit in bronze shadow and every raised edge catches it, a painter's value
    steps softened back, the crevices darkened, a dark ink line round the piece."""
    H, W = h.shape
    gy, gx = np.gradient(h * strength)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array(light, np.float32)
    L /= np.linalg.norm(L)
    nl = (n * L).sum(-1)
    diff = np.clip(nl, 0, 1)
    spec = np.clip((2 * nl[..., None] * n - L)[..., 2], 0, 1) ** 18
    occ = np.clip((ndi.gaussian_filter(h, 2.5) - h) * 7, 0, 1)
    rng = np.random.default_rng(seed)
    g = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), .9)
    g /= np.abs(g).max() + 1e-6
    v = .04 + .92 * diff ** 1.35 - ao * occ + grain * g
    vq = np.round(np.clip(v, 0, 1) * 9) / 9
    v = ndi.gaussian_filter(.55 * vq + .45 * v, .5)
    col = ramp(v) + spec[..., None] * np.array([255, 240, 200]) * .75
    edge = mask & ~ndi.binary_erosion(mask, iterations=2)
    col[edge] *= .3
    a = np.clip(ndi.gaussian_filter(mask.astype(np.float32), .6) * 1.2, 0, 1)
    return np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)


def boss_rosette(size=128, petals=8):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    c = (size - 1) / 2
    x, y = (xx - c) / (size * .46), (yy - c) / (size * .46)
    r, th = np.hypot(x, y), np.arctan2(y, x)
    mask = r <= 1.0
    h = np.sqrt(np.clip(1 - r ** 2, 0, 1)) * .35
    h += ((r > .82) & (r <= 1.0)) * (.10 + .05 * np.cos(th * 44))       # milled rim
    h -= np.exp(-((r - .78) / .035) ** 2) * .12                         # the channel inside it
    pet_r = .58 * (.55 + .45 * np.abs(np.cos(th * petals / 2)) ** 1.5)
    h += np.clip((pet_r - r) / .06, 0, 1) * .16 * (.6 + .4 * (1 - r / .6))
    h -= np.exp(-(np.sin(th * petals / 2) * r / .018) ** 2) * (r < pet_r) * (r > .16) * .05
    h += np.sqrt(np.clip(1 - (r / .17) ** 2, 0, 1)) * .14               # the dome
    return shade(h, mask, strength=size * .16)


def socket_keep(size=112):
    """A Keepsake's square setting: a cast brass bezel with clipped corners, its
    top bevelled, a fine bead run round its inner lip, a domed stud on each
    corner, and inside it a recess of dark violet enamel sunk under the bead —
    the Keepsake's sigil is lettered into that enamel by the HUD."""
    s = size
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    c = (s - 1) / 2
    x, y = np.abs(xx - c) / (s / 2), np.abs(yy - c) / (s / 2)
    # an octagon's distance: a square with its corners clipped
    d = np.maximum(np.maximum(x, y), (x + y) / 1.42)
    mask = d <= .97
    rim_in = .70
    h = np.zeros((s, s), np.float32)
    top = np.clip((.97 - d) / .08, 0, 1)                         # outer bevel up to the plateau
    h += top * .30
    h += np.exp(-((d - (rim_in + .03)) / .022) ** 2) * .10        # the bead on the inner lip
    recess = d < rim_in
    h[recess] = .02 + (rim_in - d[recess]) * .08
    # corner studs
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = c + sx * s * .302, c + sy * s * .302
            rr = np.hypot(xx - px, yy - py) / (s * .075)
            h += np.sqrt(np.clip(1 - rr ** 2, 0, 1)) * .16
    metal = shade(h, mask, strength=s * .16)
    # the enamel in the recess
    rng = np.random.default_rng(19)
    mott = ndi.gaussian_filter(rng.normal(0, 1, (s, s)), 2.2)
    mott /= np.abs(mott).max() + 1e-6
    t = np.clip(d / rim_in, 0, 1)
    toward = ((xx - c) * .55 + (yy - c) * .85) / (s / 2)
    lift = np.clip(.42 + .38 * toward * t, 0, 1)
    hi, lo = np.array([52, 34, 70], np.float32), np.array([10, 6, 15], np.float32)
    en = lo + (hi - lo) * (lift * (1 - .5 * t ** 2))[..., None]
    en *= (1 + .2 * mott)[..., None]
    en *= (1 - .7 * np.clip((d - (rim_in - .12)) / .12, 0, 1) ** 1.5)[..., None]
    k = np.clip((rim_in - d) / .02, 0, 1)[..., None]
    rgb = metal[..., :3].astype(np.float32) * (1 - k) + en * k
    return np.dstack([np.clip(rgb, 0, 255), metal[..., 3]]).astype(np.uint8)


WALNUT = np.array([
    [8, 4, 3], [24, 13, 8], [44, 26, 15], [70, 43, 25], [98, 64, 38],
    [132, 92, 58], [170, 126, 84], [214, 176, 124]], np.float32)


def plate_carved(W=240, H=128, band=30, seed=5):
    """A carved plate to letter a choice or a saying on: a walnut moulding
    mitred at the corners — a rounded ovolo rising off the wall, a cove, a
    fillet — a gilt bead run round its inner lip, and a small cast rosette
    boss pinning each corner. The field inside is left open for the board's
    own material (velvet, enamel) to show through. A 9-slice: `band + 4` in."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = np.minimum(xx, W - 1 - xx)
    dy = np.minimum(yy, H - 1 - yy)
    d = np.minimum(dx, dy)                                  # mitred: the seam runs to the corner
    t = d / band
    inside = d < band
    # the moulding's section, outside in
    h = np.zeros((H, W), np.float32)
    ovolo = np.clip(t / .45, 0, 1)
    h += np.sin(ovolo * np.pi / 2) * .55 * (t < .45)
    h += (t >= .45) * (.55 - .38 * np.clip((t - .45) / .25, 0, 1) ** 1.5)      # into the cove
    h += (t >= .70) * .06                                                       # a fillet
    bead_c = .86
    bead = np.sqrt(np.clip(1 - ((t - bead_c) / .1) ** 2, 0, 1)) * .22
    h += bead
    h *= inside
    horiz = dy < dx
    # the grain runs along each length of the moulding
    streak_h = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), (0.6, 14))
    streak_v = ndi.gaussian_filter(rng.normal(0, 1, (H, W)), (14, 0.6))
    grain = np.where(horiz, streak_h, streak_v)
    grain /= np.abs(grain).max() + 1e-6
    wood = shade_ramp(h, inside, strength=W * .045, stops=WALNUT, grain=grain * .10)
    brass = shade(h, inside, strength=W * .045)
    is_bead = (np.abs(t - bead_c) < .1) & inside
    k = ndi.gaussian_filter(is_bead.astype(np.float32), .6)[..., None]
    rgb = wood[..., :3].astype(np.float32) * (1 - k) + brass[..., :3].astype(np.float32) * k
    a = wood[..., 3].astype(np.float32)
    # the seam where two lengths are mitred
    seam = (np.abs(dx - dy) < .9) & inside & (d > 2)
    rgb[seam] *= .55
    # corner bosses
    br = int(band * .36)
    bos = boss_rosette(size=br * 2 + 2, petals=6)
    for cx, cy in ((band * .42, band * .42), (W - 1 - band * .42, band * .42),
                   (band * .42, H - 1 - band * .42), (W - 1 - band * .42, H - 1 - band * .42)):
        x0, y0 = int(round(cx - br - 1)), int(round(cy - br - 1))
        sub = bos.astype(np.float32)
        al = sub[..., 3:4] / 255
        rgb[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]] = rgb[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]] * (1 - al) + sub[..., :3] * al
        a[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]] = np.maximum(a[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]], sub[..., 3])
    # the moulding's inner lip throws a shadow onto the field
    return np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8)


def stroke_mask(shape, pts, w0, w1, soft=.8):
    """A tapering brush stroke along a polyline, as coverage 0-1."""
    H, W = shape
    m = Image.new("L", (W * 4, H * 4), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(m)
    n = len(pts)
    for i in range(n - 1):
        t = i / max(1, n - 2)
        w = (w0 + (w1 - w0) * t) * 4
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        d.line([(x0 * 4, y0 * 4), (x1 * 4, y1 * 4)], fill=255, width=max(1, int(round(w))))
        d.ellipse([x1 * 4 - w / 2, y1 * 4 - w / 2, x1 * 4 + w / 2, y1 * 4 + w / 2], fill=255)
    m = m.resize((W, H), Image.LANCZOS)
    return ndi.gaussian_filter(np.asarray(m).astype(np.float32) / 255, soft)


def spiral(cx, cy, r0, turns, a0, direction=1, n=60):
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + direction * t * turns * 2 * np.pi
        r = r0 * (1 - .82 * t)
        pts.append((cx + np.cos(a) * r, cy + np.sin(a) * r))
    return pts


def initial_vine(S=200, band=24):
    """An illuminated initial's ground: a carved gilt frame — an ovolo rising off
    the page with a bead inside it — a rosette boss on each corner, and inside
    it a field of deep violet enamel with a gilt vine climbing round its edges:
    tendrils curling into spirals, a leaf at each turn, a few gilt dots pricked
    between them. The middle is left quiet for the letter the page sets on it."""
    rng = np.random.default_rng(29)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.minimum(np.minimum(xx, S - 1 - xx), np.minimum(yy, S - 1 - yy))
    t = d / band
    frame = d < band
    h = np.zeros((S, S), np.float32)
    h += np.sqrt(np.clip(1 - ((t - .09) / .09) ** 2, 0, 1)) * .22               # the outer bead
    ov = np.clip((t - .2) / .38, 0, 1)
    h += (t >= .2) * (t < .58) * np.sin(ov * np.pi) * .42                        # the ovolo, rounded
    h += (t >= .58) * (t < .8) * (-.08 * np.sin(np.clip((t - .58) / .22, 0, 1) * np.pi))   # a cove
    h += np.sqrt(np.clip(1 - ((t - .89) / .09) ** 2, 0, 1)) * .2                # the inner bead
    h = ndi.gaussian_filter(h, .7) * frame
    metal = shade(h, frame, strength=S * .12, light=(-.55, -.75, .42)).astype(np.float32)
    # the field
    inner = ~frame
    mott = ndi.gaussian_filter(rng.normal(0, 1, (S, S)), 5)
    mott /= np.abs(mott).max() + 1e-6
    rr = np.hypot(xx - S * .42, yy - S * .38) / S
    hi, lo = np.array([74, 34, 92], np.float32), np.array([22, 9, 32], np.float32)
    k = np.clip(1 - rr * 1.5, 0, 1)[..., None]
    field = lo + (hi - lo) * k
    field *= (1 + .16 * mott)[..., None]
    # the vine: tendrils along the frame's inner edge, spirals in the corners
    vine = np.zeros((S, S), np.float32)
    b = band + 8
    paths = [
        [(b, S - b - 10), (b + 8, S * .7), (b + 4, S * .5), (b + 12, S * .32), (b + 26, b + 8)],
        [(S - b, b + 10), (S - b - 8, S * .3), (S - b - 4, S * .5), (S - b - 12, S * .68), (S - b - 26, S - b - 8)],
        [(b + 10, b), (S * .32, b + 8), (S * .5, b + 3), (S * .68, b + 10), (S - b - 8, b + 22)],
        [(S - b - 10, S - b), (S * .68, S - b - 8), (S * .5, S - b - 3), (S * .32, S - b - 10), (b + 8, S - b - 22)],
    ]
    for p in paths:
        # a smooth curve through the points
        from scipy.interpolate import splprep, splev
        arr = np.array(p).T
        tck, _ = splprep(arr, s=0, k=3)
        u = np.linspace(0, 1, 80)
        cx, cy = splev(u, tck)
        vine = np.maximum(vine, stroke_mask((S, S), list(zip(cx, cy)), 4.6, 2.0))
    for (cx, cy, a0, dr) in [(b + 16, b + 16, 0, 1), (S - b - 16, b + 16, np.pi / 2, -1),
                             (S - b - 16, S - b - 16, np.pi, 1), (b + 16, S - b - 16, -np.pi / 2, -1)]:
        vine = np.maximum(vine, stroke_mask((S, S), spiral(cx, cy, 12, 1.25, a0, dr), 3.8, 1.4))
    # leaves: small almond shapes off the tendrils
    for (lx, ly, ang) in [(b + 10, S * .42, -.6), (S - b - 10, S * .58, 2.5), (S * .42, b + 10, .9), (S * .58, S - b - 10, -2.2),
                          (b + 14, S * .62, .5), (S - b - 14, S * .38, -2.6), (S * .62, b + 14, 2.0), (S * .38, S - b - 14, -1.1)]:
        ca, sa = np.cos(ang), np.sin(ang)
        u = (xx - lx) * ca + (yy - ly) * sa
        v = -(xx - lx) * sa + (yy - ly) * ca
        leaf = np.clip(1 - (u / 11) ** 2 - (v / (4.6 * np.clip(1 - np.abs(u) / 11, 0, 1) + .01)) ** 2, 0, 1)
        vine = np.maximum(vine, (leaf > 0).astype(np.float32) * np.clip(leaf * 3, 0, 1))
    for _ in range(14):
        px, py = rng.uniform(b + 6, S - b - 6), rng.uniform(b + 6, S - b - 6)
        if abs(px - S / 2) < S * .22 and abs(py - S / 2) < S * .22:
            continue
        vine = np.maximum(vine, np.clip(1.6 - np.hypot(xx - px, yy - py) / 1.3, 0, 1))
    vine *= inner
    vh = ndi.gaussian_filter(vine, 1.2) * .5
    gilt = shade(vh, vine > .05, strength=S * .14, grain=.02, light=(-.55, -.75, .5)).astype(np.float32)
    va = np.clip(vine * 1.1, 0, 1)[..., None] * .92
    rgb = field * (1 - va) + gilt[..., :3] * va
    # the field sinks under the frame's inner lip
    lip = np.clip(1 - (d - band) / 7, 0, 1) * inner
    rgb *= (1 - .55 * lip)[..., None]
    fa = frame.astype(np.float32)[..., None]
    rgb = rgb * (1 - fa) + metal[..., :3] * fa
    # rosette bosses on the corners
    bs = int(band * 1.1)
    boss = boss_rosette(size=bs, petals=6).astype(np.float32)
    for cx, cy in ((band / 2, band / 2), (S - 1 - band / 2, band / 2), (band / 2, S - 1 - band / 2), (S - 1 - band / 2, S - 1 - band / 2)):
        x0, y0 = int(round(cx - bs / 2)), int(round(cy - bs / 2))
        sub = boss[max(0, -y0):, max(0, -x0):]
        x0, y0 = max(0, x0), max(0, y0)
        hh, ww = min(sub.shape[0], S - y0), min(sub.shape[1], S - x0)
        sub = sub[:hh, :ww]
        al = sub[..., 3:4] / 255
        rgb[y0:y0 + hh, x0:x0 + ww] = rgb[y0:y0 + hh, x0:x0 + ww] * (1 - al) + sub[..., :3] * al
    edge = np.ones((S, S), bool)
    alpha = np.full((S, S), 255, np.float32)
    return np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)


def shade_ramp(h, mask, strength, stops, grain=0.0, light=(-.55, -.75, .34)):
    """shade(), with a different material's colour ramp and a grain laid in."""
    H, W = h.shape
    gy, gx = np.gradient(h * strength)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array(light, np.float32)
    L /= np.linalg.norm(L)
    nl = (n * L).sum(-1)
    diff = np.clip(nl, 0, 1)
    spec = np.clip((2 * nl[..., None] * n - L)[..., 2], 0, 1) ** 12
    occ = np.clip((ndi.gaussian_filter(h, 2.0) - h) * 6, 0, 1)
    v = .06 + .86 * diff ** 1.3 - .5 * occ + grain
    vq = np.round(np.clip(v, 0, 1) * 9) / 9
    v = ndi.gaussian_filter(.5 * vq + .5 * v, .5)
    col = ramp(v, stops) + spec[..., None] * np.array([255, 226, 180]) * .25
    edge = mask & ~ndi.binary_erosion(mask, iterations=1)
    col[edge] *= .35
    a = np.clip(ndi.gaussian_filter(mask.astype(np.float32), .5) * 1.2, 0, 1)
    return np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)


# ── watercolour ───────────────────────────────────────────────────────────────
def fbm(shape, rng, octaves=5, base=4.0, persistence=.55):
    H, W = shape
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        f = base * (2 ** o)
        g = rng.normal(0, 1, (max(2, int(H / W * f) + 2), int(f) + 2)).astype(np.float32)
        out += np.asarray(Image.fromarray(g).resize((W, H), Image.BICUBIC)) * amp
        tot += amp
        amp *= persistence
    out /= tot
    return (out - out.mean()) / (out.std() + 1e-6)


def stain(W, H, pigment, seed, second=None):
    """A wash laid into a wing's footprint by a loaded brush, the way a surveyor
    tints a zone: not a rectangle but three or four overlapping pools of the
    same pigment run together, their joint edge wandering, the pigment drying
    darkest where it pooled against that edge, a tide line a little inside it,
    back-runs where wetter water pushed the colour out, a second pigment that
    did not quite mix, and the paper's tooth holding grains of both. RGBA: the
    pigment's colour, its density as alpha, so it lays over the parchment the
    way a glaze does. Dense enough to register at a glance."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    m = min(W, H)
    # the pools: soft superellipses along the footprint, overlapping
    field = np.full((H, W), -1e9, np.float32)
    n = 4
    for i in range(n):
        cx = W * (.24 + .52 * i / (n - 1)) + rng.uniform(-.03, .03) * W
        cy = H * .5 + rng.uniform(-.06, .06) * H
        rx = W * rng.uniform(.15, .19)
        ry = H * rng.uniform(.3, .36)
        e = 1 - (np.abs((xx - cx) / rx) ** 2.6 + np.abs((yy - cy) / ry) ** 2.6) ** (1 / 2.6)
        field = np.maximum(field, e * min(rx, ry))
    d = -field + fbm((H, W), rng, 4, 3.2) * m * .05 + fbm((H, W), rng, 3, 11.0) * m * .014
    inside = np.clip(-d / 1.5, 0, 1)
    inside *= np.clip(np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / 10, 0, 1)
    din = np.clip(-d, 0, None)
    body = .44 + .10 * fbm((H, W), rng, 5, 2.4)
    pool = np.exp(-din / (m * .035)) * .30 + np.exp(-din / 2.0) * .30
    tide = np.exp(-((din - m * (.10 + .02 * fbm((H, W), rng, 3, 4))) / 1.7) ** 2) * .12
    gran = np.clip(fbm((H, W), rng, 2, 80.0), -1.2, 2.4) * .05
    bloom = np.zeros((H, W), np.float32)
    for _ in range(5):
        bx, by = rng.uniform(.15, .85) * W, rng.uniform(.22, .78) * H
        br = rng.uniform(.16, .3) * m
        rr = np.hypot(xx - bx, yy - by) + fbm((H, W), rng, 3, 12) * br * .12
        bloom -= np.clip(1 - rr / br, 0, 1) ** .8 * .09
        bloom += np.exp(-((rr - br) / 2.2) ** 2) * .12
    D = ndi.gaussian_filter(np.clip(body + pool + tide + gran + bloom, .05, .95) * inside, .6)
    C = np.broadcast_to(np.array(pigment, np.float32), (H, W, 3)).copy()
    if second is not None:
        mix = np.clip(.5 + .6 * fbm((H, W), rng, 3, 2.0), 0, 1)[..., None] * .5
        C = C * (1 - mix) + np.array(second, np.float32) * mix
    # where the pigment is dense it is darker, as a glaze is
    C *= (1 - .35 * np.clip(D - .5, 0, 1))[..., None]
    return np.dstack([np.clip(C, 0, 255), np.clip(D, 0, 1) * 255]).astype(np.uint8)


def main():
    os.makedirs(OUT, exist_ok=True)
    A = np.asarray(Image.open(KID).convert("RGB")).astype(np.float32)
    print("prep_ui_dressing ->", os.path.relpath(OUT, ROOT))
    save(moth_mirror(A), "moth-mirror.webp")
    save(socket_filigree(A), "socket-filigree.webp")
    save(boss_rosette(), "boss-rosette.webp")
    save(socket_keep(), "socket-keep.webp")
    save(plate_carved(), "plate-carved.webp", trim=False)
    save(initial_vine(), "initial-vine.webp", trim=False)
    save(stain(880, 400, (138, 34, 26), 11, second=(160, 84, 34)), "stain-madder.webp", trim=False, quality=86)
    save(stain(880, 400, (28, 76, 112), 23, second=(44, 100, 98)), "stain-indigo.webp", trim=False, quality=86)


if __name__ == "__main__":
    main()
