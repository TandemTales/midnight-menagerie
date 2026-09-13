"""Render the kit's MATERIAL pieces: brass, enamel, wood, stone and light.

`tools/prep_ui_kit.py` cuts what the sample boards already painted (the rails,
the frames, the medallions, the candles). Some things every room needs are not
in those paintings in a form that can be cut: a price tag, a gilded HUD rail, a
shelf to stand Tricks on, a gothic window, a wall sconce, and a whole room for
the boards to stand in until Josh's backgrounds arrive. This script renders
them in the paintings' manner instead of drawing them with CSS:

  * every shape is a height field, lit from the top left the way the boards
    are lit, so a rim is a bevelled rod with a highlight and an ink outline,
    not a 1px border;
  * brass, enamel, wood and stone are colour ramps measured off the samples
    (tokens.css --kit-gold-lo/--kit-gold/--kit-gold-hi, --kit-enamel);
  * light is painted, not faked: the room is rendered three times, once in the
    dark and once each under candle light and moonlight, and the board reveals
    the lit renders through soft masks where its sconces and windows are. A
    light pool therefore shows the damask and the panelling it falls on.

Outputs (game/assets/ui/kit/):

  cartouche.webp      enamel cartouche with a bevelled brass rim (9-slice):
                      price tags, rarity tags, spoils, the preview flag
  cartouche-hud.webp  the same, cut shorter for the HUD's value plates
  rail.webp           the HUD's gilded rail: lacquer body, brass rod, studs
  shelf.webp          the Tricks shelf: a moulded walnut lip with a brass nosing
  velvet.webp         the shelf's back cloth, a tileable aubergine velvet
  room.webp           the placeholder room in the dark (wall, panelling, floor)
  room-warm.webp      the same room under candle light
  room-moon.webp      the same room under moonlight
  window.webp         a gothic lancet window onto the grounds (UI/mainMenu.png)
  sconce.webp         a brass wall sconce holding the boards' own candle
  beam.webp           a shaft of moonlight with dust in it (a luminance mask)

    python tools/prep_ui_materials.py              # everything
    python tools/prep_ui_materials.py --only room  # one piece while tuning
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "UI")
OUT = os.path.join(ROOT, "game", "assets", "ui", "kit")

# the light every board is painted under: high, from the top left, in front
LIGHT = np.array([-0.42, -0.62, 0.66], np.float32)
LIGHT /= np.linalg.norm(LIGHT)


# ── plumbing ────────────────────────────────────────────────────────────────
def save(arr, name, quality=90, lossless=False):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr)
    im.save(path, "WEBP", quality=quality, method=6, lossless=lossless, exact=False)
    print(f"  {name:22s} {im.width:5d}x{im.height:<5d} {os.path.getsize(path) / 1024:7.1f} KB")
    return path


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def ramp(v, stops):
    """Piecewise-linear colour ramp. stops = [(t, '#rrggbb'), ...] sorted by t."""
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,), np.float32)
    ts = [t for t, _ in stops]
    cs = [hexc(c) for _, c in stops]
    for i in range(len(stops) - 1):
        t0, t1 = ts[i], ts[i + 1]
        m = (v >= t0) & (v <= t1) if i == len(stops) - 2 else (v >= t0) & (v < t1)
        k = ((v - t0) / max(t1 - t0, 1e-6))[..., None]
        out = np.where(m[..., None], cs[i] * (1 - k) + cs[i + 1] * k, out)
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def noise(shape, rng, sigma, amp=1.0):
    n = ndimage.gaussian_filter(rng.normal(0, 1, shape).astype(np.float32), sigma)
    n /= (np.abs(n).max() + 1e-6)
    return n * amp


def periodic_noise(n, rng, beta=2.0, lo_cut=1.0, shape=None):
    """Seamless 1/f^beta noise on a torus, normalised to [-1, 1]."""
    h, w = shape if shape else (n, n)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    rad = np.hypot(fx, fy)
    amp = np.where(rad < lo_cut, 0, 1.0 / np.maximum(rad, 1e-6) ** (beta / 2))
    ph = rng.uniform(0, 2 * np.pi, (h, w))
    img = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    img -= img.mean()
    return (img / (np.abs(img).max() + 1e-6)).astype(np.float32)


def normals(height, strength=1.0):
    gy, gx = np.gradient(height.astype(np.float32))
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(height, np.float32)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def lambert(n, light=LIGHT):
    return np.clip((n * light).sum(axis=2), 0, 1)


def specular(n, light=LIGHT, power=28.0):
    h = light + np.array([0, 0, 1], np.float32)
    h /= np.linalg.norm(h)
    return np.clip((n * h).sum(axis=2), 0, 1) ** power


def mask_from_draw(w, h, draw_fn, ss=4):
    """Rasterise a silhouette at `ss`x and return (mask_ss, mask) float arrays."""
    im = Image.new("L", (w * ss, h * ss), 0)
    draw_fn(ImageDraw.Draw(im), ss)
    big = np.asarray(im, np.float32) / 255.0
    small = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255.0
    return big, small


def inside_distance(mask_bool):
    """Distance (px) from each inside pixel to the silhouette edge; 0 outside."""
    return ndimage.distance_transform_edt(mask_bool)


def down(arr, ss):
    """Box-average a supersampled array (H*ss, W*ss[, C]) down by ss."""
    h, w = arr.shape[0] // ss, arr.shape[1] // ss
    a = arr[:h * ss, :w * ss]
    if a.ndim == 2:
        return a.reshape(h, ss, w, ss).mean(axis=(1, 3))
    return a.reshape(h, ss, w, ss, a.shape[2]).mean(axis=(1, 3))


BRASS = [(0.0, "#1e1206"), (0.22, "#4a3113"), (0.42, "#7d5a2a"), (0.62, "#b08a4a"),
         (0.8, "#d8b775"), (0.93, "#efd79c"), (1.0, "#fbeec6")]


def brass(n, rng=None, wear=None, spec_amt=0.85, lift=0.0):
    """Antique brass under the board light, with a painted specular glint.
    A face turned square to the viewer lands mid-ramp (the samples' #9a7640
    body); only slopes that face the light climb to the highlight."""
    v = lambert(n)
    t = np.clip((v - 0.12) / 0.86 + lift, 0, 1) ** 1.35
    col = ramp(t, BRASS)
    s = specular(n, power=26.0)
    col = col + s[..., None] * np.array([255, 236, 190], np.float32) * spec_amt * 0.5
    if wear is not None:
        col = col * (1 + wear[..., None] * 0.14)
    return col


# ── the enamel cartouche ──────────────────────────────────────────────────────
def cartouche_piece(W, H, name, notch=0.30, bulge=0.22, rim=0.085, ss=4, enamel_top="#3c2a5c",
                    enamel_mid="#291b41", enamel_bot="#1a1129", seed=7):
    """A horizontal cartouche: straight rails, concave notched corners, bowed
    ends with a bead where each notch meets a rail, a bevelled brass rim and a
    glossy violet enamel field. Drawn for a border-image 9-slice: the ends are
    the slices, the middle is a plain run of rail and enamel."""
    rng = np.random.default_rng(seed)
    m = 3.0                                    # room for the outline to anti-alias
    yT, yB = m, H - m
    rn = (yB - yT) * notch                     # notch radius
    b = (yB - yT) * bulge                      # how far an end bows out
    xL, xR = m + b, W - m - b                  # the ends of the rails' box
    bead = max(1.6, (yB - yT) * 0.055)

    def draw(dr, s):
        S = lambda v: v * s
        dr.rectangle([S(xL), S(yT), S(xR), S(yB)], fill=255)
        for cx, cy in ((xL, yT), (xR, yT), (xL, yB), (xR, yB)):      # the notches
            dr.ellipse([S(cx - rn), S(cy - rn), S(cx + rn), S(cy + rn)], fill=0)
        cy = (yT + yB) / 2
        hh = (yB - yT) / 2 - rn
        for cx in (xL, xR):                                           # the bowed ends
            dr.ellipse([S(cx - b), S(cy - hh), S(cx + b), S(cy + hh)], fill=255)
        dr.rectangle([S(xL), S(cy - hh), S(xR), S(cy + hh)], fill=255)
        for px, py in ((xL + rn, yT), (xR - rn, yT), (xL + rn, yB), (xR - rn, yB),
                       (xL, yT + rn), (xR, yT + rn), (xL, yB - rn), (xR, yB - rn)):
            dr.ellipse([S(px - bead), S(py - bead), S(px + bead), S(py + bead)], fill=255)

    big, small = mask_from_draw(W, H, draw, ss)
    inside = big > 0.5
    d = inside_distance(inside) / ss            # distance to the edge, in output px
    rimw = max(3.2, (yB - yT) * rim * 2.0)
    # height: a round rod for the rim (a semicircle in section, so its highlight
    # is a line along the lit side), a shallow dish for the enamel
    t = np.clip(d / rimw, 0, 1)
    rod = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))
    rod = np.where(d < rimw, rod, 0)
    gap = (d >= rimw) & (d < rimw + 1.0)
    dish = np.where(d >= rimw + 1.0, -0.4 + 0.15 * smooth(rimw, rimw + 10, d), 0)
    height = rod * rimw * 0.9 * ss + dish * ss
    height = ndimage.gaussian_filter(height, ss * 0.45)
    n = normals(height, 1.0)
    wear = noise(height.shape, rng, ss * 2.5)
    metal = brass(n, wear=wear)
    # enamel: a violet field, dark against the rim, glazed across its top
    yy = np.arange(H * ss, dtype=np.float32)[:, None] / (H * ss)
    en = ramp(np.clip(1 - yy * 1.0, 0, 1) * np.ones((1, W * ss), np.float32),
              [(0.0, enamel_bot), (0.5, enamel_mid), (1.0, enamel_top)])
    mott = noise(height.shape, rng, ss * 6) * 0.10 + noise(height.shape, rng, ss * 0.9) * 0.05
    en = en * (1 + mott[..., None])
    shade_in = 0.45 + 0.55 * smooth(rimw, rimw + (yB - yT) * 0.35, d)
    en = en * shade_in[..., None]
    gl = np.exp(-((yy - (yT + (yB - yT) * 0.27) / H) / 0.09) ** 2) * smooth(rimw + 1, rimw + 6, d)
    en = en + gl[..., None] * np.array([150, 120, 190], np.float32) * 0.22
    col = np.where((d < rimw)[..., None], metal, en)
    # the ink: an outline round the silhouette and a dark line inside the rim
    ink = np.array([14, 9, 5], np.float32)
    edge = smooth(0.0, 1.1, d)
    col = col * edge[..., None] + ink * (1 - edge[..., None])
    col = np.where(gap[..., None], ink * 0.9 + col * 0.1, col)
    col = down(col, ss)
    alpha = small
    out = np.dstack([col, alpha * 255])
    save(out, name, 92)
    return out


def cartouches():
    cartouche_piece(240, 64, "cartouche.webp", rim=0.06)
    cartouche_piece(160, 44, "cartouche-hud.webp", notch=0.24, bulge=0.12, rim=0.075,
                    enamel_top="#2e2144", enamel_mid="#1f1630", enamel_bot="#140d1e", seed=11)
    # the Companion tiles' nameplate: near-black enamel, for a card's name
    cartouche_piece(240, 64, "cartouche-dark.webp", notch=0.28, bulge=0.2, rim=0.055,
                    enamel_top="#1c1a1e", enamel_mid="#121013", enamel_bot="#09080a", seed=13)


# ── wood ─────────────────────────────────────────────────────────────────────
def wood_albedo(h, w, rng, base="#3b2619", light="#5a3c27", dark="#1f140d", scale=1.0, vertical=False):
    """Dark walnut, painted: long fine grain bent by slow figure, soft streaks
    of lighter and darker wood, and the odd knot of darker figure. Low contrast
    on purpose: it should read as wood at a glance and never as stripes."""
    if vertical:
        return np.ascontiguousarray(wood_albedo(w, h, rng, base, light, dark, scale).transpose(1, 0, 2))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # anisotropic noise: stretched along the grain (x), fine across it (y)
    def aniso(sx, sy, amp):
        n = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (sy, sx))
        return n / (np.abs(n).max() + 1e-6) * amp
    figure = aniso(160 * scale, 9 * scale, 1.0)
    fine = aniso(40 * scale, 0.8 * scale, 1.0)
    rings = 0.5 + 0.5 * np.sin((yy + figure * 30 * scale) / (2.4 * scale))
    t = 0.5 + figure * 0.26 + fine * 0.22 + (rings - 0.5) * 0.08
    return ramp(np.clip(t, 0, 1), [(0.0, dark), (0.5, base), (1.0, light)])


def moulding(y, profile):
    """Height of a horizontal moulding at rows `y`: profile = [(y0, y1, kind)]
    with kind 'bead' (round), 'cove' (hollow), 'fillet' (flat step)."""
    h = np.zeros_like(y, np.float32)
    for y0, y1, kind, amp in profile:
        m = (y >= y0) & (y < y1)
        t = (y[m] - y0) / max(y1 - y0, 1)
        if kind == "bead":
            h[m] = amp * np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))
        elif kind == "cove":
            h[m] = amp * (1 - np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1)))
        elif kind == "ogee":
            h[m] = amp * (0.5 + 0.5 * np.cos(np.pi * t))
        else:
            h[m] = amp
    return h


# ── the room ─────────────────────────────────────────────────────────────────
ROOM_W, ROOM_H = 1920, 1080
Y_PIC = (78, 100)          # picture rail
Y_DADO = (628, 664)        # chair rail
Y_WAIN = (664, 902)        # panelling
Y_SKIRT = (902, 944)       # skirting board
Y_FLOOR = 944              # the floor starts


def damask_motif():
    """The kit's damask (itself the samples' own scrollwork) as a 0..1 motif."""
    im = Image.open(os.path.join(OUT, "damask.webp")).convert("RGBA")
    return np.asarray(im, np.float32)[..., 3] / 255.0


def tile(a, h, w, ox=0, oy=0):
    th, tw = a.shape
    ys = (np.arange(h) + oy) % th
    xs = (np.arange(w) + ox) % tw
    return a[np.ix_(ys, xs)]


def flagstones(h, w, rng):
    """Worn flagstones seen from eye level: courses of stones of uneven length
    that get shallower towards the wall, joints staggered course to course, each
    stone its own tone. Returns albedo and height."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # course boundaries: depth rows that compress towards the back (row 0)
    rows = []
    y = 0.0
    k = 0
    while y < h:
        depth = 17 + 46 * (y / h) ** 1.1 + rng.uniform(-2, 3)
        rows.append((y, y + depth))
        y += depth
        k += 1
    alb = np.zeros((h, w, 3), np.float32)
    hgt = np.zeros((h, w), np.float32)
    edge = np.full((h, w), 99.0, np.float32)
    wob = noise((h, w), rng, 5) * 2.2
    stone_id = np.zeros((h, w), np.int32)
    sid = 0
    tones = []
    for ri, (y0, y1) in enumerate(rows):
        t = (y0 + y1) / 2 / h
        persp = 0.6 + 0.9 * t                              # stones widen towards the viewer
        x = -rng.uniform(0, 160) * persp
        while x < w:
            length = rng.uniform(150, 300) * persp
            x0, x1 = x, x + length
            sel = (yy >= y0 + wob * .4) & (yy < y1 + wob * .4) & (xx >= x0 + wob) & (xx < x1 + wob)
            stone_id[sel] = sid
            dx = np.minimum(xx - x0 - wob, x1 + wob - xx)
            dy = np.minimum(yy - y0 - wob * .4, y1 + wob * .4 - yy) / max(0.35, t)
            edge = np.where(sel, np.minimum(dx, dy * 0.8), edge)
            tones.append((rng.normal(0, 1), rng.uniform(0, 1)))
            sid += 1
            x = x1
    tone = np.array([a for a, _ in tones], np.float32)[stone_id]
    warmth = np.array([b for _, b in tones], np.float32)[stone_id]
    alb[:] = ramp(np.clip(0.5 + tone * 0.14, 0, 1), [(0, "#211a25"), (0.5, "#352c3b"), (1, "#4b4152")])
    alb = alb * (1 - warmth[..., None] * 0.12) + warmth[..., None] * 0.12 * hexc("#43352f")
    wear = noise((h, w), rng, 7) * 0.12 + noise((h, w), rng, 1.2) * 0.07
    alb = alb * (1 + wear[..., None])
    e = np.clip(edge, 0, 20)
    hgt = np.clip(e / 4.0, 0, 1) ** 0.7 * 5.0 + noise((h, w), rng, 4) * 0.9
    mortar = np.clip(1.4 - e, 0, 1)
    alb = alb * (1 - mortar[..., None] * 0.7)
    return alb, hgt


def room_layers():
    """Albedo, height and a gloss mask for the whole placeholder room."""
    rng = np.random.default_rng(1881)
    W, H = ROOM_W, ROOM_H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    alb = np.zeros((H, W, 3), np.float32)
    hgt = np.zeros((H, W), np.float32)
    gloss = np.zeros((H, W), np.float32)

    # the wall: flocked damask on an aubergine ground, hung in strips
    motif = damask_motif()
    mt = Image.fromarray((motif * 255).astype(np.uint8))
    mt = mt.resize((int(mt.width * 1.55), int(mt.height * 1.55)), Image.LANCZOS)
    motif = np.asarray(mt, np.float32) / 255.0
    m = tile(motif, H, W, ox=61, oy=23)
    m = ndimage.gaussian_filter(m, 1.1)
    ground = hexc("#2b1c33")
    flock = hexc("#3a2645")
    wall = ground * (1 - m[..., None] * 0.8) + flock * (m[..., None] * 0.8)
    stain = noise((H, W), rng, 120) * 0.18 + noise((H, W), rng, 30) * 0.08
    weave = noise((H, W), rng, 0.7) * 0.05
    wall = wall * (1 + stain[..., None] + weave[..., None])
    seam = np.zeros(W, np.float32)
    for sx in range(213, W, 427):                        # the strips' seams
        seam += np.exp(-((np.arange(W) - sx) / 1.4) ** 2)
    wall = wall * (1 - seam[None, :, None] * 0.18)
    alb[:] = wall
    hgt[:] = m * 1.6

    # the picture rail and the chair rail: walnut mouldings with a brass inlay
    wood_h = wood_albedo(H, W, rng, scale=1.0)
    for (y0, y1), prof in (
        (Y_PIC, [(0, 6, "bead", 5), (6, 9, "fillet", 3), (9, 22, "ogee", 7)]),
        (Y_DADO, [(0, 7, "bead", 7), (7, 10, "fillet", 5), (10, 26, "bead", 10), (26, 36, "cove", 6)]),
    ):
        sel = (yy >= y0) & (yy < y1)
        alb[sel] = wood_h[sel] * 1.05
        hgt[sel] = 14 + moulding(yy[sel] - y0, prof)
        gloss[sel] = 0.55
    inlay = (yy >= Y_DADO[0] + 8) & (yy < Y_DADO[0] + 10)
    alb[inlay] = hexc("#9b7a44")
    gloss[inlay] = 1.0

    # the panelling: stiles, rails and raised fielded panels
    y0, y1 = Y_WAIN
    sel = (yy >= y0) & (yy < y1)
    alb[sel] = wood_albedo(H, W, rng, base="#35231a", light="#4f3526", dark="#1b120c", scale=1.3)[sel]
    hgt[sel] = 10
    gloss[sel] = 0.35
    PW, ST = 318, 46                                     # panel width, stile width
    x_start = (W - (6 * PW + 7 * ST)) / 2 + ST
    py0, py1 = y0 + 30, y1 - 26
    vert = wood_albedo(H, W, rng, base="#38251b", light="#52382a", dark="#1d130d", scale=1.3, vertical=True)
    for i in range(-1, 8):
        px0 = x_start + i * (PW + ST)
        px1 = px0 + PW
        if px1 < 0 or px0 > W:
            continue
        inner = (xx >= px0) & (xx < px1) & (yy >= py0) & (yy < py1)
        dx = np.minimum(xx - px0, px1 - 1 - xx)
        dy = np.minimum(yy - py0, py1 - 1 - yy)
        dd = np.minimum(dx, dy)
        bevel = np.clip(dd / 20.0, 0, 1)
        field = 6 + bevel * 10
        groove = np.exp(-((dd - 2.0) / 1.3) ** 2) * -5
        hgt = np.where(inner, field + groove, hgt)
        alb = np.where(inner[..., None], vert * (0.92 + 0.1 * bevel[..., None]), alb)
    # the skirting board
    y0, y1 = Y_SKIRT
    sel = (yy >= y0) & (yy < y1)
    alb[sel] = wood_h[sel] * 0.72
    hgt[sel] = 12 + moulding(yy[sel] - y0, [(0, 8, "bead", 6), (8, 12, "cove", 3), (12, 42, "fillet", 2)])
    gloss[sel] = 0.4

    # the floor: the Kid board's own cobbles (floor.webp, laid by prep_ui_kit.py)
    # used as the albedo, their painted relief recovered as a height field
    fh = H - Y_FLOOR
    fl = Image.open(os.path.join(OUT, "floor.webp")).convert("RGB")
    k = fh / fl.height * 1.25
    fl = fl.resize((int(fl.width * k), int(fl.height * k)), Image.LANCZOS)
    f = np.asarray(fl, np.float32)
    f = f[f.shape[0] - fh:]                               # the near rows, cropped to the zone
    reps = int(np.ceil(W / f.shape[1]))
    f = np.concatenate([f] * reps, axis=1)[:, :W]
    lum_f = f.mean(axis=2)
    alb[Y_FLOOR:] = f * 1.9                               # the painting is already dark: lift it to albedo
    hgt[Y_FLOOR:] = ndimage.gaussian_filter(lum_f, 1.2) * 0.25
    gloss[Y_FLOOR:] = 0.2
    return alb, hgt, gloss


def light_room(alb, hgt, gloss, light, colour, amb, gain, spec_col=None, floor_light=None):
    H, W = hgt.shape
    n = normals(ndimage.gaussian_filter(hgt, 0.8), 0.55)
    lam = lambert(n, light)
    c = np.asarray(colour, np.float32)
    col = alb * c * (amb + gain * lam)[..., None]
    # the floor faces the ceiling, not the camera: it takes the light flatter
    if floor_light is not None:
        f = slice(Y_FLOOR, H)
        lamf = lambert(n[f], floor_light)
        col[f] = alb[f] * c * (amb + gain * 1.15 * lamf)[..., None]
    if spec_col is not None:
        s = specular(n, light, power=18.0) * gloss
        col = col + s[..., None] * np.asarray(spec_col, np.float32)
    return col


def ink_lines(hgt, amount=0.55, thresh=1.6):
    """The samples outline their forms in a dark line. Where the height field
    steps sharply (a moulding's edge, a panel's groove) lay a soft dark line."""
    gy, gx = np.gradient(ndimage.gaussian_filter(hgt, 0.7))
    g = np.hypot(gx, gy)
    return 1 - amount * np.clip((g - thresh) / (thresh * 2.5), 0, 1)


def painterly(col, rng, strength=1.0):
    """Break the render's CG evenness: large soft value patches like a glaze,
    a slight hue drift between violet and umber, and the paint's own grain."""
    H, W = col.shape[:2]
    patch = noise((H, W), rng, 70) * 0.14 * strength
    drift = noise((H, W), rng, 110) * strength
    col = col * (1 + patch[..., None])
    col = col + drift[..., None] * np.array([2.5, -1.0, 3.5], np.float32) * (col.mean(axis=2, keepdims=True) / 40)
    # a directional brush texture: noise smeared along a gentle diagonal
    brush = rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32)
    brush = ndimage.gaussian_filter(brush, (0.8, 5.0))
    brush = np.asarray(Image.fromarray(((brush / (np.abs(brush).max() + 1e-6) + 1) * 127.5).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 127.5 - 1
    col = col * (1 + brush[..., None] * 0.06 * strength)
    return col


def room():
    alb, hgt, gloss = room_layers()
    H, W = hgt.shape
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    ink = ink_lines(hgt)[..., None]

    # in the dark: a cold violet ambient; the top of the wall is lost in shadow
    # and the floor falls away from the panelling
    dark = light_room(alb, hgt, gloss, np.array([0, -0.4, 0.92], np.float32),
                      (0.60, 0.54, 0.80), 0.34, 0.40)
    vfall = (0.5 + 0.5 * smooth(0, 560, yy)) * (1 - 0.45 * smooth(Y_FLOOR, H, yy))
    hfall = 1 - 0.22 * (np.abs(xx - W / 2) / (W / 2)) ** 2
    dark = dark * (vfall * hfall)[..., None] * ink
    # candle light, grazing down the wall from sconces above eye level
    Lw = np.array([0, -0.8, 0.6], np.float32)
    Lw /= np.linalg.norm(Lw)
    warm = light_room(alb, hgt, gloss, Lw, (1.0, 0.78, 0.55), 0.7, 1.7,
                      spec_col=(130, 90, 44), floor_light=np.array([0, -0.2, 0.98], np.float32))
    warm = warm * ink
    # moonlight: cold, a little harder, from the high windows
    Lm = np.array([0.0, -0.62, 0.78], np.float32)
    Lm /= np.linalg.norm(Lm)
    moon = light_room(alb, hgt, gloss, Lm, (0.55, 0.68, 1.0), 0.55, 1.45,
                      spec_col=(50, 70, 110), floor_light=np.array([0, -0.25, 0.97], np.float32))
    moon = moon * ink
    # one painterly pass shared by all three, so a light pool never shifts the paint
    rng = np.random.default_rng(77)
    state = rng.bit_generator.state
    out = []
    for img in (dark, warm, moon):
        r = np.random.default_rng(77)
        out.append(painterly(img, r))
    save(out[0], "room.webp", 86)
    save(out[1], "room-warm.webp", 84)
    save(out[2], "room-moon.webp", 84)


# ── light masks ─────────────────────────────────────────────────────────────
def pools():
    """The shapes light makes, as alpha masks the board reveals its lit renders
    through. `pool` is a candle's light on a wall: brightest just above the
    flame, stretched up the wall and down to the floor, its edge broken by the
    paint rather than a perfect circle. `beam` is moonlight falling from a
    window: a long soft trapezoid with dust caught in it."""
    rng = np.random.default_rng(31)
    S = 256
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cx, cy = S / 2, S * 0.44
    rx = (xx - cx) / (S * 0.5)
    ry = np.where(yy < cy, (yy - cy) / (S * 0.44), (yy - cy) / (S * 0.56))
    r = np.sqrt(rx ** 2 + ry ** 2)
    wob = noise((S, S), rng, 9) * 0.10 + noise((S, S), rng, 3) * 0.03
    a = np.clip(1 - (r + wob), 0, 1)
    a = a ** 1.6 * 0.85 + np.exp(-(r / 0.16) ** 2) * 0.15
    # never let the paint's wobble reach the edge of the mask: it would cut a line
    edge = np.minimum.reduce([xx, S - 1 - xx, yy, S - 1 - yy]) / (S * 0.12)
    a = np.clip(a, 0, 1) * smooth(0, 1, edge)
    save(np.dstack([np.full((S, S, 3), 255, np.float32), a * 255]), "pool.webp", 90)

    # the beam: narrow at the window (top), wide on the floor (bottom)
    BW, BH = 256, 512
    yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
    t = yy / BH
    half = 0.18 + 0.30 * t
    u = (xx / BW - 0.5 - t * 0.06) / half
    a = np.clip(1 - np.abs(u), 0, 1) ** 1.2
    a = a * smooth(0.0, 0.12, t) * (1 - 0.35 * smooth(0.6, 1.0, t))
    streak = ndimage.gaussian_filter(rng.normal(0, 1, (BH, BW)).astype(np.float32), (40, 3))
    streak /= np.abs(streak).max() + 1e-6
    a = a * (0.8 + 0.2 * streak)
    dust = (rng.random((BH, BW)) > 0.9985).astype(np.float32)
    dust = np.clip(ndimage.gaussian_filter(dust, 0.9) * 9, 0, 1) * (a > 0.15)
    a = np.clip(a * 0.85 + dust * 0.6, 0, 1)
    beam = np.dstack([np.full((BH, BW, 3), 255, np.float32), a * 255])
    save(beam, "beam.webp", 90)
    save(np.ascontiguousarray(beam[:, ::-1]), "beam-r.webp", 90)


# ── the gothic window ─────────────────────────────────────────────────────────
def lancet(xx, yy, x0, x1, ys, yb, sharp=1.18):
    """A pointed arch between x0..x1 springing at ys, standing down to yb."""
    w = x1 - x0
    r = w * sharp
    rect = (xx >= x0) & (xx <= x1) & (yy >= ys) & (yy <= yb)
    arch = ((yy < ys) & (xx >= x0) & (xx <= x1)
            & ((xx - (x0 + r)) ** 2 + (yy - ys) ** 2 <= r * r)
            & ((xx - (x1 - r)) ** 2 + (yy - ys) ** 2 <= r * r))
    return rect | arch


def stone_albedo(shape, rng, base="#3a3243", dark="#1c1722", light="#53495d"):
    t = 0.5 + noise(shape, rng, 6) * 0.25 + noise(shape, rng, 1.2) * 0.12 + noise(shape, rng, 30) * 0.2
    return ramp(np.clip(t, 0, 1), [(0, dark), (0.5, base), (1, light)])


def night_view(w, h, rng, flip=False, moon=None):
    """What the window looks out on: the grounds of UI/mainMenu.png at night,
    cooled and dimmed through old glass, with a moon."""
    im = Image.open(os.path.join(UI, "mainMenu.png")).convert("RGB")
    box = (1180, 20, 1672, 700) if not flip else (0, 20, 492, 700)
    im = im.crop(box)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.resize((w, h), Image.LANCZOS)
    v = np.asarray(im, np.float32)
    # cooler, darker, a little hazed at the horizon
    v = v * np.array([0.72, 0.84, 1.08], np.float32) * 0.9
    yy = np.arange(h, dtype=np.float32)[:, None, None] / h
    haze = np.exp(-((yy - 0.62) / 0.22) ** 2) * np.array([30, 42, 70], np.float32) * 0.5
    v = v + haze
    if moon is not None:
        mx, my, mr = moon
        yyy, xxx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.hypot(xxx - mx, yyy - my)
        disc = 1 - smooth(mr - 1.2, mr + 1.2, d)
        crater = noise((h, w), rng, 2.5) * 0.08
        v = v * (1 - disc[..., None]) + disc[..., None] * np.array([232, 238, 250], np.float32) * (0.92 + crater[..., None])
        halo = np.exp(-(np.maximum(d - mr, 0) / (mr * 1.8)) ** 1.3) * (1 - disc)
        v = v + halo[..., None] * np.array([90, 110, 150], np.float32) * 0.75
    return v


def window_piece(flip=False):
    rng = np.random.default_rng(404 if not flip else 405)
    W, H, ss = 300, 680, 2
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    x0, x1 = 26, 274                      # outer surround
    ys, yb = 262, 600
    band = 24                             # moulded surround
    rev = 12                              # the reveal
    outer = lancet(xx, yy, x0, x1, ys, yb)
    inner = lancet(xx, yy, x0 + band, x1 - band, ys + band * 0.35, yb)
    glass = lancet(xx, yy, x0 + band + rev, x1 - band - rev, ys + (band + rev) * 0.35, yb)
    sill = (xx >= 10) & (xx <= W - 10) & (yy >= yb) & (yy <= yb + 34)
    sill_top = sill & (yy < yb + 12)

    # the view through the glass
    gx0, gx1 = x0 + band + rev, x1 - band - rev
    gy0 = int(ys - (gx1 - gx0) * 1.1)
    vw, vh = int((gx1 - gx0) * ss), int((yb - gy0) * ss)
    moon = ((gx1 - gx0) * ss * (0.30 if flip else 0.70), (262 - gy0) * ss * 0.72, 17 * ss)
    view = night_view(vw, vh, rng, flip=flip, moon=moon)
    col = np.zeros((SH, SW, 3), np.float32)
    vy0 = int(gy0 * ss)
    col[vy0:vy0 + vh, int(gx0 * ss):int(gx0 * ss) + vw] = view[:SH - vy0, :SW - int(gx0 * ss)]
    # old glass: each quarry of the lattice a little different, darker at its lead
    u = (xx - W / 2) / 13.0
    v = yy / 22.0
    a1 = np.abs(((u + v) % 2) - 1)
    a2 = np.abs(((u - v) % 2) - 1)
    lead = np.maximum(smooth(0.86, 0.97, a1), smooth(0.86, 0.97, a2))
    qid = (np.floor(u + v) * 31 + np.floor(u - v) * 17).astype(np.int64)
    qtone = (np.sin(qid * 12.9898) * 43758.5453) % 1.0
    col = col * (0.82 + 0.22 * qtone[..., None]) * np.array([0.95, 1.0, 1.06], np.float32)
    sheen = smooth(0.0, 1.0, 1 - np.abs((xx - yy * 0.35 - 40) / 26.0)) * 0.10
    col = col + sheen[..., None] * np.array([140, 160, 200], np.float32)
    col = col * (1 - lead[..., None] * 0.86)

    # the tracery: a mullion, two sub-arches and an oculus with a quatrefoil
    mid = W / 2
    mull = (np.abs(xx - mid) <= 5.5) & (yy >= ys + 30) & glass
    sub_l = lancet(xx, yy, gx0, mid, ys + 40, yb, sharp=1.25)
    sub_r = lancet(xx, yy, mid, gx1, ys + 40, yb, sharp=1.25)
    sub_l_in = lancet(xx, yy, gx0 + 6, mid - 6, ys + 46, yb, sharp=1.25)
    sub_r_in = lancet(xx, yy, mid + 6, gx1 - 6, ys + 46, yb, sharp=1.25)
    arches = ((sub_l & ~sub_l_in) | (sub_r & ~sub_r_in)) & glass & (yy <= ys + 60)
    ocx, ocy, ocr = mid, ys - 58, 34
    dd = np.hypot(xx - ocx, yy - ocy)
    ring = (np.abs(dd - ocr) <= 4.2) & glass
    ang = np.arctan2(yy - ocy, xx - ocx)
    foil = ocr * (0.52 + 0.14 * np.cos(4 * ang))
    quat = (np.abs(dd - foil) <= 2.8) & (dd < ocr)
    tracery = mull | arches | ring | quat | (glass & ~(sub_l_in | sub_r_in) & (yy > ys - 8) & (dd > ocr + 4))
    tracery &= glass

    # heights for the stone: the surround a rounded roll, the tracery bars bevelled
    d_out = ndimage.distance_transform_edt(outer) / ss
    d_in = ndimage.distance_transform_edt(~inner & outer) / ss
    roll = np.where(outer & ~inner, np.sin(np.pi * np.clip(d_out / band, 0, 1)) * 9, 0)
    tdist = ndimage.distance_transform_edt(tracery) / ss
    tbar = np.where(tracery, np.clip(tdist / 3.0, 0, 1) * 5, 0)
    hgt = roll + tbar + np.where(sill, 7 + np.where(sill_top, 3, 0), 0)
    hgt = ndimage.gaussian_filter(hgt, ss * 0.6)
    n = normals(hgt * ss, 0.9)
    lam = lambert(n)
    stone = stone_albedo((SH, SW), rng)
    stone_lit = stone * (0.32 + 1.0 * lam[..., None])
    col = np.where((outer & ~inner)[..., None], stone_lit, col)
    # the reveal: deep, lit on the side that faces the light
    reveal = inner & ~glass
    side = np.where(xx < mid, 0.42, 0.78)
    top = np.where(yy < ys + 20, 0.5, 1.0)
    col = np.where(reveal[..., None], stone * (side * top)[..., None] * 0.75, col)
    col = np.where(tracery[..., None], stone_lit * 0.92, col)
    sill_col = stone * np.where(sill_top, 1.05, 0.55)[..., None]
    col = np.where(sill[..., None], sill_col * (0.6 + 0.5 * lam[..., None]), col)
    # ink round every stone edge
    edge_mask = outer | sill
    e = ndimage.distance_transform_edt(edge_mask) / ss
    col = col * smooth(0.0, 1.3, e)[..., None]
    for m_ in (inner, glass, tracery):
        b = ndimage.binary_dilation(m_, iterations=int(ss)) & ~ndimage.binary_erosion(m_, iterations=int(ss))
        col = np.where(b[..., None], col * 0.35, col)

    # a cobweb across the top corner of the reveal
    web = Image.new("L", (SW, SH), 0)
    dr = ImageDraw.Draw(web)
    wx, wy = (gx0 + 6) * ss, (ys - 10) * ss
    if flip:
        wx = (gx1 - 6) * ss
    sgn = -1 if flip else 1
    spokes = [(-10, 0.0), (10, 0.35), (30, 0.7), (55, 1.0)]
    L = 58 * ss
    ends = []
    for deg, _ in spokes:
        a = np.deg2rad(deg)
        ex, ey = wx + sgn * np.cos(a) * L, wy + np.sin(a) * L
        dr.line([(wx, wy), (ex, ey)], fill=150, width=max(1, ss // 2))
        ends.append((ex, ey))
    for k in range(1, 6):
        f = k / 6
        pts = [(wx + (ex - wx) * f, wy + (ey - wy) * f) for ex, ey in ends]
        for p, q in zip(pts, pts[1:]):
            mx_, my_ = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 2.5 * ss * f
            dr.line([p, (mx_, my_), q], fill=110, width=max(1, ss // 2))
    web = np.asarray(web, np.float32) / 255.0 * glass
    col = col + web[..., None] * np.array([150, 150, 165], np.float32) * 0.6

    alpha = (outer | sill).astype(np.float32)
    col = down(col, ss)
    alpha = down(alpha, ss)
    return np.dstack([col, alpha * 255])


def windows():
    save(window_piece(False), "window.webp", 90)
    save(window_piece(True), "window-r.webp", 90)


# ── the wall sconce ───────────────────────────────────────────────────────────
def sconce():
    """A brass backplate with a scrolled arm, holding the Kid board's own candle
    (candle.webp, cut by prep_ui_kit.py) on its drip pan."""
    rng = np.random.default_rng(606)
    W, H, ss = 150, 330, 3
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    cx = W / 2
    # the backplate: a shield like the Kid board's medallions, notched at its
    # shoulders, its sides curving in to a point, with a finial drop below
    py0, py1 = 150, 304
    t = np.clip((yy - py0) / (py1 - py0), 0, 1)
    half = 40 * np.sqrt(np.clip(1 - np.clip((t - 0.28) / 0.72, 0, 1) ** 1.7, 0, 1))
    plate = (yy >= py0) & (yy <= py1) & (np.abs(xx - cx) <= np.maximum(half, 1.5))
    for sx in (-40, 40):                                  # the shoulder notches
        plate &= np.hypot(xx - (cx + sx), yy - py0) > 11
    plate |= (yy >= py0 + 9) & (yy <= py0 + 20) & (np.abs(xx - cx) <= 44)
    plate |= np.hypot(xx - cx, yy - (py1 + 9)) <= 7
    d = ndimage.distance_transform_edt(plate) / ss
    rim = 5.0
    h_plate = np.where(plate, np.where(d < rim, np.sqrt(np.clip(1 - (2 * np.clip(d / rim, 0, 1) - 1) ** 2, 0, 1)) * 5 + 2,
                                       2 - 1.2 * smooth(rim, rim + 10, d)), 0)
    # an enamel boss in the shield, where the arm is fixed
    bx, by, br = cx, 236, 15
    bd = np.hypot(xx - bx, yy - by)
    boss = bd <= br
    h_boss = np.where(boss, 3 + np.sqrt(np.clip(1 - (bd / br) ** 2, 0, 1)) * 5, 0)
    # the arm: two scrolls curling out of the boss and up to the drip pan
    arm = np.zeros((SH, SW), bool)
    for side in (-1, 1):
        for k in np.linspace(0, 1, 200):
            ang = np.pi * (0.5 + 1.25 * k)
            rad = 26 * (1 - 0.55 * k)
            ax = cx + side * (22 - np.cos(ang) * rad * 0.8)
            ay = 196 - np.sin(ang) * rad * 0.9 + 12 * k
            arm |= (xx - ax) ** 2 + (yy - ay) ** 2 <= (3.6 - k * 1.2) ** 2
    for k in np.linspace(0, 1, 120):
        ay = by - br - k * (by - br - 176)
        arm |= (xx - cx) ** 2 + (yy - ay) ** 2 <= 4.2 ** 2
    ad = ndimage.distance_transform_edt(arm) / ss
    h_arm = np.where(arm, 8 + np.sqrt(np.clip(ad / 4.0, 0, 1)) * 4, 0)
    # the stem up to the drip pan under the candle
    stem = (np.abs(xx - cx) <= 5.5) & (yy >= 168) & (yy <= 184)
    h_stem = np.where(stem, 11 + np.sqrt(np.clip(1 - ((xx - cx) / 4.5) ** 2, 0, 1)) * 3, 0)
    hgt = np.maximum.reduce([h_plate, h_boss, h_arm, h_stem])
    hgt = ndimage.gaussian_filter(hgt, ss * 0.5)
    n = normals(hgt * ss, 0.8)
    wear = noise((SH, SW), rng, ss * 3)
    metal = brass(n, wear=wear)
    col = metal.copy()
    inner_field = plate & (d >= rim + 1.5) & ~boss & ~arm & ~stem
    # the field inside the rim: black enamel like the Kid board's medallions,
    # with a thin engraved gold line following the rim
    field = ramp(np.clip(1 - (yy - py0) / (py1 - py0), 0, 1), [(0, "#0e0a12"), (1, "#261b30")])
    line = inner_field & (np.abs(d - (rim + 5.5)) < 0.8)
    col = np.where(inner_field[..., None], field, col)
    col = np.where(line[..., None], metal * 0.9, col)
    en = ramp(np.clip(0.5 + (by - yy) / (2 * br), 0, 1), [(0, "#1d1330"), (1, "#4a3570")])
    en = en * (0.7 + 0.5 * lambert(n)[..., None])
    col = np.where((boss & (bd < br - 3))[..., None], en, col)
    mask = plate | boss | arm | stem
    e = ndimage.distance_transform_edt(mask) / ss
    col = col * smooth(0.0, 1.4, e)[..., None]
    for m_ in (boss, arm, stem):
        b = ndimage.binary_dilation(m_, iterations=int(ss)) & ~ndimage.binary_erosion(m_, iterations=int(ss))
        col = np.where(b[..., None] & mask[..., None], col * 0.45, col)
    alpha = mask.astype(np.float32)
    col = down(col, ss)
    alpha = down(alpha, ss)
    base = np.dstack([col, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(base, "RGBA")
    # the candle and its dish, from the Kid board
    candle = Image.open(os.path.join(OUT, "candle.webp")).convert("RGBA")
    k = 0.98
    candle = candle.resize((int(candle.width * k), int(candle.height * k)), Image.LANCZOS)
    im.alpha_composite(candle, (int(cx - candle.width / 2), 190 - candle.height + 4))
    save(np.asarray(im), "sconce.webp", 92)


# ── the HUD: its rail, its tube and its sockets ──────────────────────────────
def rail():
    """The HUD's bar: black lacquer over dark wood, a gilded rod along its foot
    with a bead-and-reel moulding, and a brass stud where each length of rod
    meets the next. Tiles left to right every 256 px."""
    rng = np.random.default_rng(909)
    W, H, ss = 512, 92, 2
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    body = wood_albedo(SH, SW, rng, base="#1d1318", light="#2b1d24", dark="#0f0a0d", scale=2.4)
    # periodic in x: blend the last 40 px into the first
    k = np.clip((xx - (W - 40)) / 40, 0, 1)[..., None]
    body = body * (1 - k) + np.roll(body, -int((W - 40) * ss), axis=1)[:, :] * k * 0 + body * k
    body = body * (1.0 - 0.35 * smooth(0, H * 0.8, yy))[..., None]
    lac = np.exp(-((yy - 6) / 5) ** 2) * 18                              # lacquer sheen off the top edge
    col = body + lac[..., None] * np.array([0.8, 0.7, 1.0], np.float32)
    # the rod: rows 70..84, a bead-and-reel on it
    r0, r1 = 72.0, 86.0
    t = np.clip((yy - r0) / (r1 - r0), 0, 1)
    rod = (yy >= r0) & (yy <= r1)
    reel = 0.5 + 0.5 * np.cos((xx % 32) / 32 * 2 * np.pi)
    prof = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * (0.75 + 0.25 * reel)
    lip = (yy >= r0 - 6) & (yy < r0 - 3)                                # a fillet above it
    hgt = np.where(rod, prof * 7, 0) + np.where(lip, 2.5, 0)
    # studs every 256 px
    for sx in (128.0, 384.0):
        d = np.hypot(xx - sx, yy - (r0 + r1) / 2)
        hgt = np.where(d < 9, np.maximum(hgt, 9 * np.sqrt(np.clip(1 - (d / 9) ** 2, 0, 1)) + 2), hgt)
    hgt = ndimage.gaussian_filter(hgt, ss * 0.5)
    n = normals(hgt * ss, 0.9)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 2))
    solid = rod | lip | (np.minimum(np.hypot(xx - 128, yy - 79), np.hypot(xx - 384, yy - 79)) < 9.5)
    col = np.where(solid[..., None], metal, col)
    ink = np.array([10, 6, 4], np.float32)
    for edge_y in (r0 - 6.6, r0 - 2.6, r0 - 0.4, r1 + 0.6):
        m = np.abs(yy - edge_y) < 0.7
        col = np.where(m[..., None], ink, col)
    col = np.where((yy > r1 + 1.2)[..., None], np.array([6, 4, 7], np.float32) * (1 - smooth(r1, H, yy))[..., None], col)
    alpha = np.where(yy > r1 + 1.2, 1 - smooth(r1 + 1, H, yy), 1.0)
    col = down(col, ss)
    alpha = down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "rail.webp", 88)


def tube():
    """The Courage bar's setting: a brass capsule rim, bevelled, round a deep
    recess the crimson enamel sits in (9-slice: 20 px ends)."""
    rng = np.random.default_rng(911)
    W, H, ss = 120, 40, 4
    SW, SH = W * ss, H * ss

    def draw(dr, s):
        dr.rounded_rectangle([2 * s, 2 * s, (W - 2) * s, (H - 2) * s], radius=(H - 4) * s / 2, fill=255)

    big, small = mask_from_draw(W, H, draw, ss)
    inside = big > 0.5
    d = inside_distance(inside) / ss
    rimw = 5.0
    t = np.clip(d / rimw, 0, 1)
    hgt = np.where(d < rimw, np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * rimw * 0.9, -1.5)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 2))
    yy = np.arange(SH, dtype=np.float32)[:, None] / SH
    recess = ramp(np.clip(yy * np.ones((1, SW)), 0, 1), [(0, "#050304"), (1, "#1a1012")])
    recess = recess * (0.6 + 0.4 * smooth(rimw, rimw + 6, d))[..., None]
    col = np.where((d < rimw)[..., None], metal, recess)
    col = col * smooth(0, 1.1, d)[..., None]
    col = np.where((np.abs(d - rimw) < 0.7)[..., None], np.array([8, 5, 4], np.float32), col)
    col = down(col, ss)
    save(np.dstack([col, small * 255]), "tube.webp", 92)


def socket():
    """A Keepsake's square setting: a bevelled brass frame round black enamel,
    its corners clipped like the Kid board's panel corners (9-slice: 14 px)."""
    rng = np.random.default_rng(913)
    W, ss = 56, 4
    SW = W * ss
    c = 7

    def draw(dr, s):
        dr.polygon([(c * s, 1 * s), ((W - c) * s, 1 * s), ((W - 1) * s, c * s), ((W - 1) * s, (W - c) * s),
                    ((W - c) * s, (W - 1) * s), (c * s, (W - 1) * s), (1 * s, (W - c) * s), (1 * s, c * s)], fill=255)

    big, small = mask_from_draw(W, W, draw, ss)
    inside = big > 0.5
    d = inside_distance(inside) / ss
    rimw = 6.0
    t = np.clip(d / rimw, 0, 1)
    hgt = np.where(d < rimw, (np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * 0.7 + (1 - t) * 0.4) * rimw, -2.0)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = brass(n, wear=noise((SW, SW), rng, ss * 2))
    yy = np.arange(SW, dtype=np.float32)[:, None] / SW
    en = ramp(np.clip(1 - yy * np.ones((1, SW)), 0, 1), [(0, "#0c0810"), (1, "#271b33")])
    en = en * (0.55 + 0.45 * smooth(rimw, rimw + 8, d))[..., None]
    col = np.where((d < rimw)[..., None], metal, en)
    col = col * smooth(0, 1.1, d)[..., None]
    col = np.where((np.abs(d - rimw) < 0.8)[..., None], np.array([8, 5, 4], np.float32), col)
    col = down(col, ss)
    save(np.dstack([col, small * 255]), "socket.webp", 92)


# ── the Tricks shelf ─────────────────────────────────────────────────────────
def shelf():
    """A walnut shelf seen from just above: its top face catching the light,
    a brass nosing along its edge, a moulded front with a bead, and the shadow
    it casts on the cloth below. Tiles left to right every 512 px (2x)."""
    rng = np.random.default_rng(1212)
    W, H, ss = 512, 100, 2
    SW, SH = W * ss, H * ss
    yy = np.arange(SH, dtype=np.float32)[:, None] / ss * np.ones((1, SW), np.float32)
    wood = wood_albedo(SH, SW, rng, base="#4a3021", light="#6b4a33", dark="#24170f", scale=2.2)
    # make it tile: cross-fade the ends
    k = np.clip((np.arange(SW) - (SW - 80)) / 80, 0, 1)[None, :, None]
    wood = wood * (1 - k) + wood[:, :SW][:, ::-1] * 0 + np.roll(wood, SW // 2, axis=1) * 0 + wood * k
    TOP0, TOP1 = 8.0, 30.0            # the top face
    NOSE0, NOSE1 = 30.0, 37.0         # brass nosing
    FR0, FR1 = 37.0, 72.0             # the moulded front
    hgt = np.zeros((SH, SW), np.float32)
    col = np.zeros((SH, SW, 3), np.float32)
    alpha = np.zeros((SH, SW), np.float32)
    top = (yy >= TOP0) & (yy < TOP1)
    t_top = np.clip((yy - TOP0) / (TOP1 - TOP0), 0, 1)
    col = np.where(top[..., None], wood * (0.8 + 0.45 * t_top[..., None]), col)
    nose = (yy >= NOSE0) & (yy < NOSE1)
    front = (yy >= FR0) & (yy < FR1)
    prof = moulding(yy - FR0, [(0, 9, "bead", 5), (9, 12, "fillet", 2), (12, 30, "ogee", 6), (30, 35, "fillet", 1)])
    hgt = np.where(front, prof, hgt)
    tn = np.clip((yy - NOSE0) / (NOSE1 - NOSE0), 0, 1)
    hgt = np.where(nose, np.sqrt(np.clip(1 - (2 * tn - 1) ** 2, 0, 1)) * 4 + 6, hgt)
    n = normals(ndimage.gaussian_filter(hgt * ss, ss * 0.5), 0.9)
    lam = lambert(n)
    col = np.where(front[..., None], wood * 0.62 * (0.45 + 0.9 * lam[..., None]), col)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 2))
    col = np.where(nose[..., None], metal, col)
    alpha = np.where(top | nose | front, 1.0, alpha)
    # ink lines at the breaks
    for ey in (TOP0 + 0.3, NOSE0, NOSE1, FR1 - 0.4):
        m = np.abs(yy - ey) < 0.8
        col = np.where(m[..., None], np.array([12, 7, 5], np.float32), col)
    # the shadow it throws on the cloth
    sh = (yy >= FR1)
    ts = np.clip((yy - FR1) / (H - FR1), 0, 1)
    alpha = np.where(sh, (1 - ts) ** 1.8 * 0.85, alpha)
    col = np.where(sh[..., None], np.array([4, 2, 5], np.float32), col)
    # a faint lip of light on the top face's back edge
    alpha = np.where(yy < TOP0, smooth(TOP0 - 6, TOP0, yy) * 0.6, alpha)
    col = np.where((yy < TOP0)[..., None], np.array([6, 4, 6], np.float32), col)
    col = down(col, ss)
    alpha = down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "shelf.webp", 88)


def velvet():
    """The cabinet's back cloth: aubergine velvet with soft vertical folds and
    the nap catching the light unevenly. Tileable 256x256."""
    rng = np.random.default_rng(1313)
    S = 256
    folds = periodic_noise(S, rng, beta=2.8, lo_cut=1, shape=(S, S))
    folds = np.asarray(Image.fromarray(((folds + 1) * 127.5).astype(np.uint8)).resize((S, S), Image.BICUBIC), np.float32) / 127.5 - 1
    xx = np.arange(S, dtype=np.float32)[None, :]
    pleat = 0.5 + 0.5 * np.sin(xx / S * 2 * np.pi * 4 + folds * 1.5)
    nap = periodic_noise(S, rng, beta=0.9, lo_cut=8)
    t = np.clip(0.42 + 0.22 * pleat + 0.1 * folds + 0.08 * nap, 0, 1)
    col = ramp(t, [(0, "#0d0712"), (0.5, "#1f1229"), (1, "#3a2447")])
    save(col, "velvet.webp", 86)


PIECES = {
    "cartouche": cartouches,
    "room": room,
    "pools": pools,
    "window": windows,
    "sconce": sconce,
    "rail": rail,
    "tube": tube,
    "socket": socket,
    "shelf": shelf,
    "velvet": velvet,
}


def main():
    ap = argparse.ArgumentParser(description="Render the kit's material pieces.")
    ap.add_argument("--only", default="", help="comma-separated piece names: " + ", ".join(PIECES))
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("materials ->", os.path.relpath(OUT, ROOT))
    for nm in names:
        PIECES[nm]()


if __name__ == "__main__":
    main()
