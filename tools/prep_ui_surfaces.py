"""Paint the kit's SURFACES: what every fill on a board is made of.

Round 2's judges said one thing about every board, winner or not: the fills
are CSS. A row, a plaque, a shelf, a list or a panel's interior was a dark
gradient with a faint noise tile over it, and next to Josh's samples that
reads as a web page. In the samples nothing is a fill. The Kid board's empty
panels are a crinkled suede; its round buttons are a mottled, scratched violet
enamel with a wet highlight; the Companion board's ground is scrollwork carved
in relief; the floor and the books are painted stone and wood. This script
paints those materials so a board can be built OF them:

  enamel.webp        aubergine enamel: fine clouded pigment, dark mottling in
                     the hollows, scratches, pits, a few gilt flecks (tile)
  suede.webp         the Kid board's empty info panels: their crinkled nap,
                     lifted off the painting and given its depth back (tile)
  flock.webp         the samples' damask (damask.webp, off selectCompanion)
                     flocked into velvet: raised pile lit on its upper edges,
                     dark under its lower ones (on the damask's own tile)
  walnut.webp        dark figured walnut, long wandering rings, open pores (tile)
  ledge.webp         a carved, parcel-gilt ledge seen from a little above: a lit
                     walnut top, a gilt bead, an egg-and-dart front, a gilt
                     fillet, the cove in shadow and the shadow it casts (repeat-x)
  curtain.webp       a velvet drape hanging in deep folds (repeat-x)
  plate-lit.webp     the kit's nameplate (plate.webp) with its flat black centre
                     repainted in a darkened enamel, sunk under the rim, a wet
                     highlight along its top (the same 9-slice)
  cartouche-lit.webp the dark cartouche (cartouche-dark.webp) repainted in the
                     enamel the same way: a price, a value, a card's name

Every surface is painted the way tools/prep_ui_paint.py (round 2, BRAID) paints
a room: forms are laid in as values and fused with a generalized Kuwahara
filter, so they settle into laid-in strokes instead of a render's even
gradients. Tiles are built on a torus (periodic noise, wrapped filters, scratches
folded back onto the tile) so they never show a seam.

Light is NOT baked into the tiles. A board lights its own surfaces where its
candles and windows are (ui/kit.css .kit-mat), so the same enamel is warm under
the Safe Room's lamp and cold under a Curiosity's moon.

Run after tools/prep_ui_kit.py and tools/prep_ui_materials.py (it reads their
damask.webp, plate.webp and cartouche-dark.webp).

    python tools/prep_ui_surfaces.py                 # everything
    python tools/prep_ui_surfaces.py --only enamel   # one piece while tuning
    python tools/prep_ui_surfaces.py --preview DIR   # PNG copies as well
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (ramps, brass, lighting, save)

OUT = M.OUT
UI = M.UI
PREVIEW = None

ramp, normals, lambert, specular = M.ramp, M.normals, M.lambert, M.specular


# ── plumbing ────────────────────────────────────────────────────────────────
def save(arr, name, quality=88, lossless=False):
    path = M.save(arr, name, quality, lossless)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        a = np.clip(np.nan_to_num(arr), 0, 255).astype(np.uint8)
        Image.fromarray(a).save(os.path.join(PREVIEW, os.path.splitext(name)[0] + ".png"))
    return path


def pnoise(h, w, rng, beta=2.0, lo_cut=1.0):
    """Seamless 1/f^beta noise on an h x w torus, in [-1, 1]."""
    return M.periodic_noise(max(h, w), rng, beta=beta, lo_cut=lo_cut, shape=(h, w))


def warp(field, dx, dy):
    """Sample a toroidal field at displaced coordinates, wrapping."""
    h, w = field.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return ndimage.map_coordinates(field, [yy + dy, xx + dx], order=1, mode="grid-wrap")


def smooth01(x, e0, e1):
    t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def kuwahara(img, radius=4, sectors=8, q=8.0, mode="wrap"):
    """Generalized Kuwahara (Papari, Petkov & Campisi 2007): every pixel takes
    the mean of the most uniform of the wedges round it, so edges hold and the
    rest settles into flat laid-in strokes. `mode="wrap"` keeps a tile seamless."""
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
        wgt = np.exp(-(d ** 2) / (2 * (np.pi / sectors * 0.85) ** 2)) * g
        wgt[r, r] = g[r, r] / sectors
        wgt /= wgt.sum()
        m = np.stack([ndimage.convolve(img[..., c], wgt, mode=mode) for c in range(C)], -1)
        s2 = np.stack([ndimage.convolve(sq[..., c], wgt, mode=mode) for c in range(C)], -1)
        var = np.clip(s2 - m * m, 0, None).sum(-1)
        wk = 1.0 / (1.0 + var) ** (q / 2)
        num += m * wk[..., None]
        den += wk
    return num / den[..., None]


def wrap_draw(n_h, n_w, ss, draw_fn):
    """Draw on a torus: paint onto a canvas three tiles wide and high at `ss`x,
    then fold the eight neighbours back onto the middle tile. Returns [0,1]."""
    H, W = n_h * ss, n_w * ss
    im = Image.new("L", (W * 3, H * 3), 0)
    draw_fn(ImageDraw.Draw(im), ss, W, H)
    a = np.asarray(im, np.float32) / 255.0
    out = np.zeros((H, W), np.float32)
    for oy in range(3):
        for ox in range(3):
            out = np.maximum(out, a[oy * H:(oy + 1) * H, ox * W:(ox + 1) * W])
    return np.asarray(Image.fromarray((out * 255).astype(np.uint8)).resize((n_w, n_h), Image.LANCZOS),
                      np.float32) / 255.0


def scratches(h, w, rng, count, length=(10, 46), curve=0.35, ss=3, width=1.0):
    """Fine curved scratches on a torus, as a soft [0,1] mask."""
    def draw(dr, s, W, H):
        for _ in range(count):
            x0 = rng.uniform(0, W) + W
            y0 = rng.uniform(0, H) + H
            L = rng.uniform(*length) * s
            a = rng.uniform(0, 2 * np.pi)
            bend = rng.normal(0, curve)
            pts = [(x0 + np.cos(a + bend * t) * L * t, y0 + np.sin(a + bend * t) * L * t)
                   for t in np.linspace(0, 1, 9)]
            dr.line(pts, fill=int(rng.uniform(120, 255)), width=max(1, int(round(width * s))))
    return wrap_draw(h, w, ss, draw)


def specks(h, w, rng, density, rmin=0.5, rmax=1.6, ss=3):
    """Round flecks and pits on a torus."""
    count = int(h * w * density)

    def draw(dr, s, W, H):
        for _ in range(count):
            x = rng.uniform(0, W) + W
            y = rng.uniform(0, H) + H
            r = rng.uniform(rmin, rmax) * s
            dr.ellipse([x - r, y - r, x + r, y + r], fill=int(rng.uniform(140, 255)))
    return wrap_draw(h, w, ss, draw)


# ── enamel ──────────────────────────────────────────────────────────────────
ENAMEL = [(0.0, "#130b1c"), (0.26, "#1e132b"), (0.5, "#2a1b3c"), (0.72, "#35244a"),
          (0.9, "#412f58"), (1.0, "#4d3866")]


def enamel_field(h, w, rng):
    """The pigment of the Kid board's round buttons as a value field in [0,1]:
    fine clouds a hand's width across, and the darker mottling that pools in
    the hollows of a glaze. The large light and dark belong to the board."""
    clouds = pnoise(h, w, rng, beta=2.7, lo_cut=3)
    fine = pnoise(h, w, rng, beta=2.0, lo_cut=8)
    dx = pnoise(h, w, rng, beta=3.0, lo_cut=2) * 14
    dy = pnoise(h, w, rng, beta=3.0, lo_cut=2) * 14
    c = warp(clouds * 0.6 + fine * 0.4, dx, dy)
    mott = warp(pnoise(h, w, rng, beta=2.3, lo_cut=10), dy, dx)
    mott = np.clip((mott - 0.2) * 2.6, 0, 1)
    v = 0.5 + 0.22 * c - 0.16 * mott
    return np.clip(v, 0, 1)


def enamel(n=512, seed=11):
    rng = np.random.default_rng(seed)
    v = enamel_field(n, n, rng)
    col = ramp(v, ENAMEL)
    drift = pnoise(n, n, rng, beta=2.8, lo_cut=2)
    col += drift[..., None] * np.array([6.0, -1.5, -4.0], np.float32)
    # the glaze's orange peel: a very low relief under the board's light
    peel = ndimage.gaussian_filter(rng.normal(0, 1, (n, n)).astype(np.float32), 1.8, mode="wrap")
    peel /= np.abs(peel).max() + 1e-6
    col *= (0.9 + 0.2 * lambert(normals(peel * 2.6, 1.0)))[..., None]
    # scratches: pale ones catch the light, dark ones hold grime in the cut
    s_lit = scratches(n, n, rng, 110, length=(8, 40), width=0.9)
    s_dark = scratches(n, n, rng, 80, length=(6, 30), width=1.2)
    col = col * (1 - 0.3 * s_dark[..., None]) + s_lit[..., None] * np.array([104, 86, 132], np.float32) * 0.45
    pits = specks(n, n, rng, 0.0005, 0.6, 1.3)
    col *= (1 - 0.4 * pits[..., None])
    flecks = specks(n, n, rng, 0.00012, 0.5, 1.0)
    col += flecks[..., None] * np.array([160, 128, 84], np.float32) * 0.6
    col = kuwahara(col, radius=3, q=6.0)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (n, n)).astype(np.float32), 0.7, mode="wrap")
    col += grain[..., None] * 3.0
    save(col, "enamel.webp", 86)
    return col


# ── suede: the Kid board's empty panels ─────────────────────────────────────
def suede(n=512, seed=5):
    """The empty info panels of UI/selectKid.png are a dark crinkled suede. The
    painting's own detail is kept (high-passed off five interiors, quilted on a
    torus), and the crease it was painted with is rebuilt as a lit relief, so
    it survives being drawn at the size a board draws it."""
    rng = np.random.default_rng(seed)
    sk = np.asarray(Image.open(os.path.join(UI, "selectKid.png")).convert("RGB"), np.float32)
    boxes = [(706, 412, 1080, 512), (712, 780, 1086, 928), (702, 600, 866, 702),
             (922, 600, 1086, 702), (704, 266, 1078, 336)]
    patches = []
    for x0, y0, x1, y1 in boxes:
        p = lum(sk[y0:y1, x0:x1])
        hp = p - ndimage.gaussian_filter(p, 6)
        hp = hp / (hp.std() + 1e-6)
        k = 1.6
        patches.append(np.asarray(Image.fromarray(hp).resize(
            (int(hp.shape[1] * k), int(hp.shape[0] * k)), Image.BICUBIC), np.float32))
    detail = np.zeros((n, n), np.float32)
    weight = np.zeros((n, n), np.float32)
    for _ in range(52):
        p = patches[rng.integers(len(patches))]
        ph, pw = p.shape
        sh, sw = min(ph, 150), min(pw, 150)
        py, px = rng.integers(0, ph - sh + 1), rng.integers(0, pw - sw + 1)
        sub = p[py:py + sh, px:px + sw]
        if rng.random() < 0.5:
            sub = sub[:, ::-1]
        wy = np.hanning(sh)[:, None] * np.hanning(sw)[None, :]
        oy, ox = rng.integers(0, n), rng.integers(0, n)
        ys = (np.arange(sh) + oy) % n
        xs = (np.arange(sw) + ox) % n
        detail[np.ix_(ys, xs)] += sub * wy
        weight[np.ix_(ys, xs)] += wy
    detail = detail / np.maximum(weight, 1e-3)
    detail = detail / (np.abs(detail).max() + 1e-6)
    ridge = 1 - np.abs(pnoise(n, n, rng, beta=1.9, lo_cut=7))
    ridge = warp(ridge, pnoise(n, n, rng, beta=3.0) * 16, pnoise(n, n, rng, beta=3.0) * 16)
    ridge2 = 1 - np.abs(pnoise(n, n, rng, beta=1.7, lo_cut=16))
    hgt = ndimage.gaussian_filter(ridge * 0.7 + ridge2 * 0.3, 1.1, mode="wrap") * 12.0
    crease = lambert(normals(hgt, 1.0))
    flat = float(lambert(np.array([[[0, 0, 1.0]]], np.float32))[0, 0])
    base = ramp(0.5 + 0.22 * pnoise(n, n, rng, beta=2.8, lo_cut=2),
                [(0, "#0d0912"), (0.5, "#191223"), (1, "#261b33")])
    col = base * (0.62 + 0.62 * (crease / flat) ** 1.3)[..., None]
    col *= (1 + 0.18 * detail)[..., None]
    col = kuwahara(col, radius=2, q=6.0)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (n, n)).astype(np.float32), 0.6, mode="wrap")
    col += grain[..., None] * 2.2
    save(col, "suede.webp", 86)
    return col


# ── flock: the damask raised in velvet pile ─────────────────────────────────
def flock(seed=23, k=2):
    """The samples' damask flocked into velvet: the motif is raised pile, lit on
    its upper edges and dark under its lower ones, the ground a crushed plum
    velvet. On the damask's own tile, drawn k times larger so the relief has
    pixels to be lit with."""
    rng = np.random.default_rng(seed)
    src = Image.open(os.path.join(OUT, "damask.webp")).convert("RGBA")
    W, H = src.width * k, src.height * k
    a = np.asarray(src.resize((W, H), Image.LANCZOS), np.float32)[..., 3] / 255.0
    motif = np.clip(ndimage.gaussian_filter(a, 0.8 * k, mode="wrap") * 1.35, 0, 1)
    height = ndimage.gaussian_filter(motif, 1.6 * k, mode="wrap") * 6.0 * k
    lit = lambert(normals(height, 1.0))
    flat = float(lambert(np.array([[[0, 0, 1.0]]], np.float32))[0, 0])
    relief = np.clip(lit - flat * 0.92, -0.5, 0.5)
    crush = pnoise(H, W, rng, beta=2.6, lo_cut=2)
    crush = warp(crush, pnoise(H, W, rng, beta=3.0) * 16, pnoise(H, W, rng, beta=3.0) * 16)
    pile = ndimage.gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), (1.6, 0.6), mode="wrap")
    pile /= np.abs(pile).max() + 1e-6
    v = 0.34 + 0.12 * crush + 0.05 * pile + motif * 0.2 + relief * 0.9
    col = ramp(np.clip(v, 0, 1), [(0, "#07040a"), (0.25, "#130b19"), (0.42, "#1e1227"),
                                  (0.6, "#2d1b3b"), (0.78, "#45295a"), (1.0, "#6a4686")])
    col = kuwahara(col, radius=2, q=6.0)
    save(col, "flock.webp", 86)
    return col


# ── walnut ──────────────────────────────────────────────────────────────────
WALNUT = [(0.0, "#0b0604"), (0.25, "#1b100a"), (0.45, "#2b1a0f"), (0.65, "#3d2616"),
          (0.85, "#54351f"), (1.0, "#704829")]


def walnut_field(h, w, rng, rings=7, figure=0.9):
    """Figured walnut as a value field in [0,1]: growth rings that wander the
    length of the board (whole cycles across its height, so it tiles), open
    pores drawn out along the grain, and the slow figure of the log."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    wander = pnoise(h, w, rng, beta=3.6, lo_cut=1) * figure
    phase = (yy / h + wander * 0.35 + 0.08 * np.sin(2 * np.pi * xx / w + wander * 3)) * rings
    ring = 0.5 + 0.5 * np.sin(2 * np.pi * phase)
    ring = ring ** 3.0                                     # thin dark latewood lines
    late = 0.5 + 0.5 * np.sin(2 * np.pi * phase * 2 + 1.3)
    pores = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (0.6, 5.0), mode="wrap")
    pores = np.clip(-pores / (np.abs(pores).max() + 1e-6) * 4.0 - 0.6, 0, 1)
    fig = pnoise(h, w, rng, beta=2.6, lo_cut=2)
    v = 0.5 + 0.16 * fig - 0.22 * ring + 0.06 * late - 0.18 * pores
    return np.clip(v, 0, 1)


def walnut(w=512, h=256, seed=31):
    rng = np.random.default_rng(seed)
    v = walnut_field(h, w, rng)
    col = ramp(v, WALNUT)
    col = kuwahara(col, radius=2, q=6.0)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (0.4, 2.0), mode="wrap")
    col += grain[..., None] * 2.5
    save(col, "walnut.webp", 86)
    return col


# ── the carved, parcel-gilt ledge ───────────────────────────────────────────
def ledge(W=1080, H=152, seed=41, ss=2):
    """A shelf seen from a little above, the way the Kid board shows its floor:
      0-28    the top face in walnut, dark at the back, candlelit toward its lip
      28-40   a gilt bead along the lip, with its glint
      40-44   a dark quirk
      44-100  the front: an egg-and-dart moulding carved in the walnut, every
              egg's shell picked out in gilt, lit on its upper left
      100-108 a gilt fillet
      108-116 the cove under it, in shadow
      116-152 the shadow the ledge casts on the wall below (alpha)
    Repeats along x: the moulding's 40px period divides W."""
    rng = np.random.default_rng(seed)
    Ws, Hs = W * ss, H * ss
    yy, xx = np.mgrid[0:Hs, 0:Ws].astype(np.float32)
    y = yy / ss
    x = xx / ss
    col = np.zeros((Hs, Ws, 3), np.float32)
    alpha = np.zeros((Hs, Ws), np.float32)
    wv = walnut_field(Hs, Ws, rng, rings=5, figure=0.7)

    # the top face: foreshortened grain (the rings squeezed by the angle), in
    # the wall's shadow at the back and waxed and candlelit toward the lip
    top = y < 28
    depth = np.clip(y / 28.0, 0, 1)
    wv_top = walnut_field(Hs, Ws, rng, rings=11, figure=0.5)
    top_col = ramp(np.clip(wv_top * (0.7 + 0.7 * depth) + 0.06, 0, 1), WALNUT)
    top_col += (smooth01(depth, 0.2, 1.0) * 84.0 * (0.7 + 0.3 * wv_top))[..., None] * np.array([1.0, 0.68, 0.38], np.float32)
    # a long soft sheen where the wax catches the light, broken by the grain
    sheen = np.exp(-((y - 20.0) ** 2) / 18.0) * (0.55 + 0.45 * wv_top)
    top_col += (sheen * 40.0)[..., None] * np.array([1.0, 0.8, 0.55], np.float32)
    col = np.where(top[..., None], top_col, col)
    alpha = np.where(top, np.clip(y / 2.0, 0, 1), alpha)

    def rod(y0, y1, spec_amt=0.85, lift=-0.02):
        band = (y >= y0) & (y < y1)
        t = np.clip((y - y0) / (y1 - y0), 0, 1)
        prof = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))
        wear = M.noise((Hs, Ws), rng, 3.0 * ss, 0.5)
        hgt = prof * (y1 - y0) * ss * 0.5 + wear * 0.6
        return band, M.brass(normals(hgt, 1.0), wear=wear, spec_amt=spec_amt, lift=lift)

    band, c = rod(28, 40, lift=0.04)
    col = np.where(band[..., None], c, col)
    alpha = np.where(band, 1.0, alpha)

    quirk = (y >= 40) & (y < 44)
    col = np.where(quirk[..., None], np.array([9, 5, 4], np.float32), col)
    alpha = np.where(quirk, 1.0, alpha)

    # egg and dart, 40px a pair: upright eggs in open gilt shells, darts between
    front = (y >= 44) & (y < 100)
    per = 40.0
    cx = (x % per) - per / 2
    cy = y - 71.0
    ex, ey = 11.5, 18.0
    egg_r = np.hypot(cx / ex, cy / ey)
    egg = np.sqrt(np.clip(1 - egg_r ** 2, 0, 1))
    shell_r = np.hypot(cx / (ex + 4.4), (cy + 2.5) / (ey + 5.5))
    shell = np.clip(1 - np.abs(shell_r - 1.0) / 0.1, 0, 1) * (egg_r > 1.0) * (cy < 16)
    dx_ = np.abs(np.abs(cx) - per / 2)
    dart = np.clip(1 - dx_ / (0.7 + np.clip((16 - cy) / 36, 0, 1) * 3.0), 0, 1) * (cy > -22) * (cy < 20)
    hgt = (egg * 15.0 + shell * 5.5 + dart * 7.0) * ss + wv * 1.5
    n = normals(hgt, 1.0)
    shade = lambert(n)
    flat = float(lambert(np.array([[[0, 0, 1.0]]], np.float32))[0, 0])
    base = ramp(np.clip(0.4 + 0.3 * wv, 0, 1), WALNUT)
    fcol = base * (0.34 + 1.0 * (shade / flat))[..., None]
    fcol += (specular(n, power=14.0) * 64.0)[..., None] * np.array([1.0, 0.76, 0.48], np.float32)
    recess = (egg_r > 1.0) & (shell < 0.05) & (dart < 0.05)
    fcol = np.where(recess[..., None], fcol * 0.42, fcol)
    gilt = np.clip(np.maximum(shell * 1.6, dart * (cy < -12) * 1.2), 0, 1)[..., None]
    gcol = M.brass(n, spec_amt=0.9, lift=0.0)
    fcol = fcol * (1 - gilt) + gcol * gilt
    col = np.where(front[..., None], fcol, col)
    alpha = np.where(front, 1.0, alpha)

    band, c = rod(100, 108, spec_amt=0.7)
    col = np.where(band[..., None], c, col)
    alpha = np.where(band, 1.0, alpha)

    cove = (y >= 108) & (y < 116)
    t = np.clip((y - 108) / 8.0, 0, 1)
    col = np.where(cove[..., None], ramp(np.clip(0.22 + 0.15 * wv, 0, 1), WALNUT) * (0.5 - 0.32 * t)[..., None], col)
    alpha = np.where(cove, 1.0, alpha)

    shadow = y >= 116
    t = np.clip((y - 116) / 36.0, 0, 1)
    col = np.where(shadow[..., None], np.zeros(3, np.float32), col)
    alpha = np.where(shadow, 0.8 * (1 - t) ** 1.7, alpha)

    for yl in (28, 40, 44, 100, 108):
        d = np.abs(y - yl)
        col = col * (1 - (np.clip(1 - d / 1.1, 0, 1) * 0.8)[..., None])

    col = M.down(col, ss)
    alpha = M.down(alpha, ss)
    col = kuwahara(col, radius=2, q=6.0, mode="wrap")
    save(np.dstack([col, alpha * 255]), "ledge.webp", 90)


# ── the curtain ─────────────────────────────────────────────────────────────
def curtain(W=1024, H=640, seed=53):
    """A velvet drape in deep folds, as the Shop's cabinet hangs behind the
    counter. The folds are a sum of sines with whole cycles across the width
    (so it repeats along x), gathered tighter at the top where it hangs.
    Velvet is lit twice: the pile that faces the light, and a sheen where the
    cloth turns away from you, which is what makes velvet read as velvet."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = xx / W
    t = yy / H
    hgt = np.zeros((H, W), np.float32)
    for cyc, amp in ((5, 60.0), (8, 34.0), (13, 16.0), (21, 6.0)):
        ph = rng.uniform(0, 2 * np.pi)
        sway = rng.uniform(-0.5, 0.5)
        hgt += amp * np.sin(2 * np.pi * cyc * u + ph + sway * t * 2.0 + 0.4 * np.sin(t * 2.6 + ph))
    hgt *= (1.0 + 0.4 * (1 - t) ** 2)
    n = normals(hgt, 0.22)
    light = np.array([-0.2, -0.45, 0.87], np.float32)
    light /= np.linalg.norm(light)
    diff = np.clip((n * light).sum(axis=2), 0, 1)
    sheen = (1 - np.abs(n[..., 2])) ** 1.8
    pile = ndimage.gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), (6.0, 0.8), mode="wrap")
    pile /= np.abs(pile).max() + 1e-6
    v = 0.04 + 0.7 * diff ** 2.2 + 0.04 * pile
    col = ramp(np.clip(v, 0, 1), [(0, "#040208"), (0.18, "#0f0819"), (0.4, "#211231"),
                                  (0.62, "#351c4b"), (0.82, "#4d2c68"), (1.0, "#684584")])
    col += (sheen * 34.0)[..., None] * np.array([0.74, 0.62, 1.0], np.float32)
    col *= (0.82 + 0.18 * (1 - t) - 0.3 * smooth01(t, 0.68, 1.0))[..., None]
    col = kuwahara(col, radius=3, q=6.0, mode="wrap")
    save(col, "curtain.webp", 84)
    return col


# ── plates repainted ────────────────────────────────────────────────────────
def refill(src_name, out_name, fill, thresh=48.0, sink=6.0, wet=46.0, keep=0.18):
    """Repaint a 9-slice piece's flat centre in a material. The centre is the
    dark region joined to the middle of the piece (the rim is lighter brass);
    it is sunk under the rim (darker toward it) and given a wet highlight just
    under its top edge, the way the Kid board's enamel holds the candle. A
    little of the old paint's own shading is kept."""
    im = np.asarray(Image.open(os.path.join(OUT, src_name)).convert("RGBA"), np.float32)
    H, W = im.shape[:2]
    rgb, a = im[..., :3], im[..., 3]
    L = lum(rgb)
    dark = (a > 200) & (L < thresh)
    lab, _ = ndimage.label(dark)
    centre = lab == lab[H // 2, W // 2]
    if not centre.any() or lab[H // 2, W // 2] == 0:
        raise SystemExit(f"{src_name}: no dark centre to refill")
    dist = ndimage.distance_transform_edt(centre)
    f = fill[:H, :W] if fill.shape[0] >= H and fill.shape[1] >= W else np.asarray(
        Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).resize((W, H)), np.float32)
    shade = 0.42 + 0.58 * np.clip(dist / sink, 0, 1)
    new = f * shade[..., None]
    rows = np.arange(H, dtype=np.float32)[:, None]
    # the first centre row in every column, and a soft glint just below it
    top = np.where(centre.any(axis=0), centre.argmax(axis=0), H).astype(np.float32)[None, :]
    glint = np.exp(-((rows - top - 3.2) ** 2) / 4.0) * centre
    span = np.clip((np.arange(W) - W * 0.12) / (W * 0.76), 0, 1)
    glint *= (0.35 + 0.65 * np.sin(span * np.pi))[None, :]
    new += (glint * wet)[..., None] * np.array([0.92, 0.84, 1.0], np.float32)
    old = rgb * (L[..., None] > 0)
    new = new * (1 - keep) + (new * (0.6 + 0.8 * old / np.maximum(old.mean() + 1, 1))) * keep
    out = np.where(centre[..., None], new, rgb)
    save(np.dstack([out, a]), out_name, 92)


def fill_tile(name):
    return np.asarray(Image.open(os.path.join(OUT, name)).convert("RGB"), np.float32)


# ── the pedestal ────────────────────────────────────────────────────────────
def pedestal(E=56, mid=288, H=120, seed=83, ss=3):
    """A carved, parcel-gilt pedestal for one thing to stand on, in the ledge's
    own walnut and gilt, seen from a little above. Cut for a 3-slice: two ends
    E px wide and a middle `mid` px wide that repeats (the egg-and-dart's 32px
    period divides it), so `border-image-repeat: round` keeps the carving whole.
      4-22    the top slab, lit toward its front edge
      22-30   a gilt bead, overhanging
      30-34   a dark quirk
      34-70   the frieze: egg-and-dart carved in the walnut, the shells gilt
      70-76   a gilt fillet
      76-100  the die: dark walnut, a gilt fielded panel line inset in it
      100-108 a gilt ogee foot, overhanging
      108-114 the base
      114-120 its shadow on the floor (alpha)
    Every band returns at its ends: lit on the left, in shadow on the right."""
    rng = np.random.default_rng(seed)
    W = E * 2 + mid
    Ws, Hs = W * ss, H * ss
    yy, xx = (np.mgrid[0:Hs, 0:Ws].astype(np.float32) + 0.5) / ss
    col = np.zeros((Hs, Ws, 3), np.float32)
    alpha = np.zeros((Hs, Ws), np.float32)
    wv = walnut_field(Hs, Ws, rng, rings=4, figure=0.6)
    flat = float(lambert(np.array([[[0, 0, 1.0]]], np.float32))[0, 0])

    def band(y0, y1, inset):
        return (yy >= y0) & (yy < y1) & (xx >= inset) & (xx < W - inset)

    def ends(inset, width=7.0):
        """-1 at the left return, +1 at the right, 0 along the run."""
        dl = np.clip(1 - (xx - inset) / width, 0, 1)
        dr = np.clip(1 - (W - inset - xx) / width, 0, 1)
        return dr - dl

    def rod(y0, y1, inset, spec=0.85, lift=0.0):
        b = band(y0, y1, inset)
        t = np.clip((yy - y0) / (y1 - y0), 0, 1)
        prof = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))
        wear = M_noise((Hs, Ws), rng, 2.5 * ss, 0.5)
        hgt = prof * (y1 - y0) * ss * 0.5 + wear * 0.6
        c = M.brass(normals(hgt, 1.0), wear=wear, spec_amt=spec, lift=lift)
        e = ends(inset)
        c = c * (1 - 0.45 * np.clip(e, 0, 1))[..., None] * (1 + 0.25 * np.clip(-e, 0, 1))[..., None]
        return b, c

    # top slab
    b = band(4, 22, 12)
    depth = np.clip((yy - 4) / 18.0, 0, 1)
    top = ramp(np.clip(wv * (0.7 + 0.7 * depth) + 0.05, 0, 1), WALNUT)
    top += (smooth01(depth, 0.25, 1.0) * 80.0)[..., None] * np.array([1.0, 0.68, 0.38], np.float32)
    e = ends(12)
    top *= (1 - 0.5 * np.clip(e, 0, 1))[..., None]
    col = np.where(b[..., None], top, col); alpha = np.where(b, 1.0, alpha)

    b, c = rod(22, 30, 6, lift=0.04)
    col = np.where(b[..., None], c, col); alpha = np.where(b, 1.0, alpha)

    b = band(30, 34, 10)
    col = np.where(b[..., None], np.array([9, 5, 4], np.float32), col); alpha = np.where(b, 1.0, alpha)

    # frieze: egg and dart, 32px a pair, measured from the middle's left edge
    b = band(34, 70, 14)
    per = 32.0
    cx = ((xx - E) % per) - per / 2
    cy = yy - 52.0
    ex, ey = 9.0, 13.0
    egg_r = np.hypot(cx / ex, cy / ey)
    egg = np.sqrt(np.clip(1 - egg_r ** 2, 0, 1))
    shell_r = np.hypot(cx / (ex + 3.8), (cy + 2.0) / (ey + 4.0))
    shell = np.clip(1 - np.abs(shell_r - 1.0) / 0.1, 0, 1) * (egg_r > 1.0) * (cy < 13)
    dxd = np.abs(np.abs(cx) - per / 2)
    dart = np.clip(1 - dxd / (0.7 + np.clip((13 - cy) / 28, 0, 1) * 2.4), 0, 1) * (cy > -16) * (cy < 16)
    hgt = (egg * 12.0 + shell * 4.5 + dart * 6.0) * ss + wv * 1.2
    n = normals(hgt, 1.0)
    base = ramp(np.clip(0.4 + 0.3 * wv, 0, 1), WALNUT)
    fr = base * (0.34 + 1.0 * (lambert(n) / flat))[..., None]
    fr += (specular(n, power=14.0) * 60.0)[..., None] * np.array([1.0, 0.76, 0.48], np.float32)
    recess = (egg_r > 1.0) & (shell < 0.05) & (dart < 0.05)
    fr = np.where(recess[..., None], fr * 0.42, fr)
    gilt = np.clip(np.maximum(shell * 1.6, dart * (cy < -9) * 1.2), 0, 1)[..., None]
    fr = fr * (1 - gilt) + M.brass(n, spec_amt=0.9) * gilt
    # the frieze ends in a plain block at each return
    blockm = (xx < E - 2) | (xx > W - E + 2)
    blk = ramp(np.clip(0.36 + 0.3 * wv, 0, 1), WALNUT) * 0.9
    fr = np.where(blockm[..., None], blk, fr)
    e = ends(14)
    fr *= (1 - 0.5 * np.clip(e, 0, 1))[..., None] * (1 + 0.3 * np.clip(-e, 0, 1))[..., None]
    col = np.where(b[..., None], fr, col); alpha = np.where(b, 1.0, alpha)

    b, c = rod(70, 76, 12, spec=0.7)
    col = np.where(b[..., None], c, col); alpha = np.where(b, 1.0, alpha)

    # die: dark walnut with a gilt fielded-panel line
    b = band(76, 100, 18)
    die = ramp(np.clip(0.26 + 0.3 * wv, 0, 1), WALNUT)
    t = np.clip((yy - 76) / 24.0, 0, 1)
    die *= (0.8 + 0.3 * (1 - t))[..., None]
    inset_x = np.minimum(xx - 30, W - 30 - xx)
    line = ((np.abs(yy - 81) < .7) | (np.abs(yy - 95) < .7)) & (inset_x >= 0)
    line |= (np.abs(inset_x) < .7) & (yy > 81) & (yy < 95)
    die = np.where(line[..., None], M.brass(normals(np.zeros((Hs, Ws), np.float32), 1.0)) * 0.85, die)
    e = ends(18)
    die *= (1 - 0.5 * np.clip(e, 0, 1))[..., None] * (1 + 0.25 * np.clip(-e, 0, 1))[..., None]
    col = np.where(b[..., None], die, col); alpha = np.where(b, 1.0, alpha)

    b, c = rod(100, 108, 8, spec=0.8)
    col = np.where(b[..., None], c, col); alpha = np.where(b, 1.0, alpha)

    b = band(108, 114, 4)
    col = np.where(b[..., None], ramp(np.clip(0.2 + 0.2 * wv, 0, 1), WALNUT) * 0.7, col); alpha = np.where(b, 1.0, alpha)

    sh = yy >= 114
    fade = (1 - np.clip((yy - 114) / 6.0, 0, 1)) * np.clip(np.minimum(xx, W - xx) / 20.0, 0, 1)
    col = np.where(sh[..., None], np.zeros(3, np.float32), col)
    alpha = np.where(sh, 0.7 * fade, alpha)

    # an ink line round every band, as the samples outline their forms
    solid = alpha > 0.99
    edge = solid & ~ndimage.binary_erosion(solid, iterations=max(1, ss // 2))
    for yl in (22, 30, 34, 70, 76, 100, 108):
        edge |= (np.abs(yy - yl) < 0.5) & solid
    col = np.where(edge[..., None], col * 0.2, col)

    col = M.down(col, ss)
    alpha = M.down(alpha, ss)
    save(np.dstack([col, alpha * 255]), "pedestal.webp", 92)


def M_noise(shape, rng, sigma, amp):
    return M.noise(shape, rng, sigma, amp)


PIECES = {
    "pedestal": pedestal,
    "enamel": enamel,
    "suede": suede,
    "flock": flock,
    "walnut": walnut,
    "ledge": ledge,
    "curtain": curtain,
    "plate-lit": lambda: refill("plate.webp", "plate-lit.webp", fill_tile("enamel.webp") * 0.62, thresh=44.0, wet=34.0),
    "cartouche-lit": lambda: refill("cartouche-dark.webp", "cartouche-lit.webp", fill_tile("enamel.webp") * 0.92, thresh=52.0),
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
