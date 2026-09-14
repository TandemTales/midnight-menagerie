"""Render the objects round 4's DIALOGS pass hangs on a dialog, in the materials' manner.

A dialog is a thing that stands in the mansion, not a web panel over it: a board
in a gilt frame with a velvet liner, brass guards over its corners and a candle
on its corner (the Kid board's own, candle.webp); the story's page has a silk
bookmark hanging from it and its portrait an arched nameplate. These are drawn with
`tools/prep_ui_materials.py`'s plumbing (height fields lit from the boards' top
left, the brass ramp measured off the samples, an ink outline), in the samples'
aubergine, lavender and antique gold:

  bracket-tl/tr/bl/br.webp
                      a cast brass corner guard over a frame's corner: arms
                      tapering along the edges to trefoil ends, the bitten edge
                      cusped like a gothic foil, a boss with a violet enamel
                      cabochon on the corner, an engraved C-scroll and a rivet
                      an arm, re-lit per corner (160)
  velvet-ring.webp    a frame's liner: aubergine velvet tufted into diamonds
                      with a small brass button in each, as a 9-slice ring
                      (slices 48, repeat round) so every edge is lit in place
  bookmark.webp       a silk bookmark ribbon: violet satin with gilt edge
                      threads, swaying a little as it falls and its sheen moving
                      with the sway, cut in a swallowtail; it hangs from the top
                      of the image (60x480)
  plate-arch.webp     a portrait's nameplate as a 9-slice (40 84 22 84): a gilt
                      rim round aubergine enamel, the Companion tiles' ogee
                      ends with a curl on each notch, a low arch over the name

    python tools/prep_ui_house.py                 # everything
    python tools/prep_ui_house.py --only bracket  # one piece while tuning
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (the materials' plumbing)
import prep_ui_polish as P     # noqa: E402  (strokes, volutes)

OUT = M.OUT
ramp, hexc, smooth, noise = M.ramp, M.hexc, M.smooth, M.noise
normals, lambert, specular, brass, down, save = M.normals, M.lambert, M.specular, M.brass, M.down, M.save
periodic_noise = M.periodic_noise
INK = np.array([12, 8, 5], np.float32)


def disc(xx, yy, cx, cy, r):
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r


def dome(xx, yy, cx, cy, r, h):
    d = np.clip(1 - ((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r), 0, 1)
    return np.sqrt(d) * h


def finish(col, mask, ss, grow=0.7):
    """Outline a lit shape in ink the way the paintings do, and return RGBA at 1x."""
    alpha = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), ss * 0.35) * 1.15, 0, 1)
    grown = ndimage.binary_dilation(mask, iterations=max(1, int(ss * grow)))
    alpha = np.maximum(alpha, grown.astype(np.float32) * 0.92)
    col = np.where((grown & ~mask)[..., None], INK, col)
    return np.dstack([down(col, ss), down(alpha, ss) * 255])


# ── the corner bracket ────────────────────────────────────────────────────────
def bracket_fields(S, ss):
    """The top-left bracket, supersampled: a corner guard of cast brass. Its
    body is the corner's square with a great quarter circle bitten out of the
    far side, so two arms taper along the edges; the bitten edge is cusped like
    a gothic foil; each arm ends in a trefoil; a boss holds a violet cabochon
    over the corner; the engraver's line follows the outline and a C-scroll is
    cut into the middle of the plate."""
    N = S * ss
    yy, xx = (np.mgrid[0:N, 0:N].astype(np.float32) + 0.5) / ss
    k = S / 160.0
    e = 6 * k                                   # the plate starts this far in (its ink and shadow)
    a, r = 112 * k, 90 * k                      # the square and the bite
    body = (xx >= e) & (yy >= e) & (xx <= a + e) & (yy <= a + e)
    bite = (xx - (a + e)) ** 2 + (yy - (a + e)) ** 2 <= r * r
    # cusps: small discs along the bite's arc, so the edge is a row of points
    cusp = np.zeros_like(body)
    for t in np.linspace(0.08, 0.92, 4):
        ang = math.pi + t * (math.pi / 2)
        cx, cy = (a + e) + (r + 7.5 * k) * math.cos(ang), (a + e) + (r + 7.5 * k) * math.sin(ang)
        cusp |= disc(xx, yy, cx, cy, 10.5 * k)
    plate = body & ~(bite & ~cusp)
    plate &= ~(bite & cusp & ((xx - (a + e)) ** 2 + (yy - (a + e)) ** 2 <= (r - 9 * k) ** 2))
    # the arms' trefoil finials, beyond the square along each edge
    fin = np.zeros_like(body)
    for (u, v) in ((xx, yy), (yy, xx)):
        tip_u = a + e + 2 * k
        mid_v = e + 11 * k
        fin |= disc(u, v, tip_u + 8 * k, mid_v, 9.5 * k)
        fin |= disc(u, v, tip_u - 2 * k, mid_v - 9 * k, 6.2 * k) & (v >= e)
        fin |= disc(u, v, tip_u - 2 * k, mid_v + 9.5 * k, 6.2 * k)
        fin |= (u >= a - 14 * k) & (u <= tip_u + 4 * k) & (v >= e) & (v <= e + 21 * k)
    plate |= fin
    boss = disc(xx, yy, e + 21 * k, e + 21 * k, 19.5 * k)
    stone = disc(xx, yy, e + 21 * k, e + 21 * k, 11 * k)
    rivets = np.zeros_like(body)
    h_riv = np.zeros(body.shape, np.float32)
    for cx, cy in ((a - 6 * k, e + 11 * k), (e + 11 * k, a - 6 * k)):
        rivets |= disc(xx, yy, cx, cy, 4.2 * k)
        h_riv = np.maximum(h_riv, dome(xx, yy, cx, cy, 4.2 * k, 3.4))
    mask = plate | boss
    d = ndimage.distance_transform_edt(plate) / ss
    bev = np.clip(d / (4.2 * k), 0, 1)
    h_plate = np.where(plate, np.sqrt(1 - (1 - bev) ** 2) * 4.6, 0)
    # the plate is cast, not rolled: a slow swell toward the corner
    h_plate += np.where(plate, np.clip(1 - np.hypot(xx - e, yy - e) / (a * 1.1), 0, 1) * 3.0, 0)
    # engraving: a line following the outline, and a C-scroll in the plate
    groove = plate & (np.abs(d - 7.4 * k) < 0.8 * k) & ~ndimage.binary_dilation(boss, iterations=int(4 * k * ss))
    sc = P.stroke_mask(S, S, [
        (P.volute(e + 50 * k, e + 50 * k, 13 * k, 3.4 * k, math.pi * 1.25, 1.1, 60), 1.6 * k, 0.9 * k),
        (P.bez((e + 34 * k, e + 60 * k), (e + 38 * k, e + 74 * k), (e + 46 * k, e + 80 * k), (e + 58 * k, e + 78 * k), 30), 1.3 * k, 0.7 * k),
        (P.bez((e + 60 * k, e + 34 * k), (e + 74 * k, e + 38 * k), (e + 80 * k, e + 46 * k), (e + 78 * k, e + 58 * k), 30), 1.3 * k, 0.7 * k),
    ], ss) > 0.5
    groove |= sc & plate & (d > 5 * k)
    h_plate -= ndimage.gaussian_filter(groove.astype(np.float32), ss * 0.4) * 1.7
    bd = ndimage.distance_transform_edt(boss) / ss
    h_boss = np.where(boss, 6.5 + np.sqrt(np.clip(bd / (5.5 * k), 0, 1)) * 3.5, 0)
    h_stone = dome(xx, yy, e + 21 * k, e + 21 * k, 11 * k, 6.5) + 9.0 * stone
    hgt = np.maximum.reduce([h_plate, h_boss, h_riv + 5.2 * rivets])
    hgt = np.where(stone, h_stone, hgt)
    return hgt, mask, stone, groove, rivets


def bracket_piece(flip_y, flip_x, S=160, ss=3):
    rng = np.random.default_rng(4401)
    hgt, mask, stone, groove, rivets = bracket_fields(S, ss)
    fl = lambda a: np.ascontiguousarray((a[::-1] if flip_y else a)[:, ::-1] if flip_x else (a[::-1] if flip_y else a))
    hgt, mask, stone, groove, rivets = map(fl, (hgt, mask, stone, groove, rivets))
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 0.9)
    wear = noise(mask.shape, rng, ss * 2.4)
    # antique, not new: the faces sit dark, only the edges that face the light climb
    col = brass(n, wear=wear, spec_amt=0.55, lift=-0.16)
    # a painter's value patches over the cast, and the tarnish in the cuts
    patch = noise(mask.shape, rng, ss * 9)
    col = col * (1 + patch[..., None] * 0.12)
    cut = ndimage.gaussian_filter(groove.astype(np.float32), ss * 0.6)
    col = col * (1 - cut[..., None] * 0.62)
    # the cabochon: the round buttons' violet enamel, glazed
    lit = lambert(n)
    en = ramp(np.clip(lit * 1.08, 0, 1), [(0.0, "#12091c"), (0.45, "#2b1944"), (0.75, "#4b2f72"), (1.0, "#7c5cab")])
    en = en + specular(n, power=36.0)[..., None] * np.array([255, 240, 255], np.float32) * 0.7
    col = np.where(stone[..., None], en, col)
    ring = ndimage.binary_dilation(stone, iterations=int(ss * 1.1)) & ~stone
    col = np.where(ring[..., None], col * 0.4, col)
    return finish(col, mask, ss)


def brackets():
    for name, (fy, fx) in {"bracket-tl.webp": (False, False), "bracket-tr.webp": (False, True),
                           "bracket-bl.webp": (True, False), "bracket-br.webp": (True, True)}.items():
        save(bracket_piece(fy, fx), name, 92)


# ── the velvet liner ──────────────────────────────────────────────────────────
def velvet_ring(P=48, ss=4):
    """A 3P x 3P ring for border-image: aubergine velvet tufted on one lattice,
    so every edge slice tiles with itself and the diamonds meet at the joins.
    Velvet lights at its grazing slopes, not its crowns, so a puff's shoulders
    carry the sheen and its top stays deep."""
    rng = np.random.default_rng(4402)
    S = 3 * P
    N = S * ss
    yy, xx = (np.mgrid[0:N, 0:N].astype(np.float32) + 0.5) / ss
    # diamonds on a lattice of period P, a button at every cell centre
    du = np.abs(((xx - yy) / P + 0.5) % 1.0 - 0.5) * P
    dv = np.abs(((xx + yy) / P) % 1.0 - 0.5) * P
    dcr = np.minimum(du, dv) / math.sqrt(2)
    puff = np.clip(dcr / (P * 0.26), 0, 1)
    hgt = np.sqrt(1 - (1 - puff) ** 2) * 9.0
    # the band's two seams: where the liner tucks under the rail and the fillet
    o = np.minimum.reduce([xx, yy, S - xx, S - yy])
    band = np.clip(np.minimum(o, P - o) / (P * 0.22), 0, 1)
    hgt *= np.sqrt(band)
    bx = ((xx / P) % 1.0 - 0.5) * P
    by = ((yy / P) % 1.0 - 0.5) * P
    bd = np.hypot(bx, by)
    hgt -= np.exp(-(bd / (P * 0.16)) ** 2) * 5.0
    nap = periodic_noise(N, rng, beta=0.6, lo_cut=30) * 0.35
    hgt = ndimage.gaussian_filter(hgt * ss + nap, ss * 0.8, mode="wrap")
    n = normals(hgt, 0.7)
    lit = lambert(n)
    graze = np.clip(1 - n[..., 2], 0, 1) ** 0.7
    # the pile catches the light on the shoulders that turn toward it, and the
    # shoulders turned away sink to the dye's own dark
    facing = np.clip((n[..., 0] * M.LIGHT[0] + n[..., 1] * M.LIGHT[1]) * 2.2, -1, 1)
    t = np.clip(0.2 + graze * (0.62 + 0.55 * facing) + (lit - 0.72) * 0.35, 0, 1)
    col = ramp(t, [(0.0, "#07040a"), (0.28, "#140b1d"), (0.52, "#24142f"), (0.76, "#3a2350"), (1.0, "#5b3b7c")])
    mott = noise((N, N), rng, ss * 5)
    col = col * (1 + mott[..., None] * 0.08)
    # a small brass button sunk in each dimple, half in the velvet's shadow
    button = bd <= P * 0.058
    bh = np.sqrt(np.clip(1 - (bd / (P * 0.058)) ** 2, 0, 1)) * 3.0
    bn = normals(ndimage.gaussian_filter(bh * ss, ss * 0.5), 1.0)
    bcol = brass(bn, spec_amt=0.45, lift=-0.25) * 0.62
    col = np.where(button[..., None], bcol, col)
    col = np.where(((bd > P * 0.058) & (bd <= P * 0.085))[..., None], col * 0.45, col)
    # the seams fall into shadow
    col = col * (0.55 + 0.45 * smooth(0, P * 0.14, np.minimum(o, P - o)))[..., None]
    inside = (o <= P).astype(np.float32)
    rgba = np.dstack([down(col, ss), down(inside, ss) * 255])
    save(rgba, "velvet-ring.webp", 90)


# ── the bookmark ──────────────────────────────────────────────────────────────
def bookmark(W=60, H=480, ss=4):
    """A silk ribbon hanging from the top of the image: violet satin with a
    gilt thread inside each edge, swaying a little as it falls, the satin's
    sheen wandering across it with the sway, and a swallowtail cut at its end."""
    rng = np.random.default_rng(4403)
    NW, NH = W * ss, H * ss
    yy, xx = (np.mgrid[0:NH, 0:NW].astype(np.float32) + 0.5) / ss
    w0 = 16.0                                    # half-width
    t = yy / H
    sway = np.sin(t * math.pi * 1.35 + 0.3)
    cx = W / 2 + 3.0 * sway
    half = w0 * (1 - 0.05 * np.abs(np.cos(t * math.pi * 1.35 + 0.3)))
    lat = (xx - cx) / half                      # -1..1 across the ribbon
    body = np.abs(lat) <= 1.0
    # the swallowtail
    tail_top = H - 30
    notch = (yy > tail_top) & (np.abs(xx - cx) < (yy - tail_top) * 0.62)
    body &= ~notch & (yy <= H - 1.5)
    # satin: a soft sheen that moves across the ribbon as it sways, a faint second one
    s_pos = -0.25 + 0.45 * np.cos(t * math.pi * 1.35 + 0.3)
    sheen = np.exp(-((lat - s_pos) / 0.38) ** 2) * (0.75 + 0.25 * np.sin(t * math.pi * 3.1))
    sheen2 = np.exp(-((lat - s_pos - 0.9) / 0.3) ** 2) * 0.35
    fold = 0.5 + 0.5 * np.cos(lat * math.pi * 0.5)
    tone = 0.26 + 0.26 * fold + 0.42 * sheen + 0.2 * sheen2
    tone += noise((NH, NW), rng, ss * 1.2) * 0.02
    col = ramp(np.clip(tone, 0, 1), [(0.0, "#10071a"), (0.25, "#24123c"), (0.5, "#42265f"), (0.72, "#654390"),
                                     (0.9, "#9479bd"), (1.0, "#c9b6e6")])
    # the grain of the weave running down it
    weave = np.sin(xx * math.pi * 1.1) * 0.03
    col = col * (1 + weave[..., None])
    # gilt threads inside each edge
    edge = body & (np.abs(lat) > 0.72) & (np.abs(lat) < 0.86)
    gt = np.clip(0.35 + 0.5 * sheen + 0.3 * sheen2, 0, 1)
    gold = ramp(gt, [(0.0, "#3a2810"), (0.5, "#80612f"), (1.0, "#d8b775")])
    col = np.where(edge[..., None], gold, col)
    # the top is lost under the frame: shadow falling down it
    col = col * (0.45 + 0.55 * smooth(0, 60, yy))[..., None]
    # a dark lip along each cut edge
    d = ndimage.distance_transform_edt(body) / ss
    col = col * (0.55 + 0.45 * smooth(0, 1.6, d))[..., None]
    alpha = body.astype(np.float32)
    save(np.dstack([down(col, ss), down(alpha, ss) * 255]), "bookmark.webp", 92)


# ── the arched nameplate ──────────────────────────────────────────────────────
def plate_arch(W=400, H=132, ss=4):
    """A portrait's nameplate, as a 9-slice (slices 40 84 22 84): a gilt rim
    round aubergine enamel. Its ends are the Companion tiles' ogee brackets —
    a notch at each corner and the end bowing out between them — and its top
    swells into a low arch between them, springing without a kink. The arch
    lives in the top slice and the ends in theirs, so stretching the plate
    widens the arch and never bends an end."""
    rng = np.random.default_rng(4404)
    NW, NH = W * ss, H * ss
    yy, xx = (np.mgrid[0:NH, 0:NW].astype(np.float32) + 0.5) / ss
    cx = W / 2
    yt, yb = 30.0, H - 12.0                     # the straight top at the ends, the foot
    crown = 12.0                                # the arch's crown
    xe0, xe1 = 46.0, W - 46.0                   # where the ends begin
    xa0, xa1 = 84.0, W - 84.0                   # where the arch springs
    ymid = (yt + yb) / 2
    # the arch: a cosine swell between xa0 and xa1
    u = np.clip((xx - xa0) / (xa1 - xa0), 0, 1)
    top = yt - (yt - crown) * np.clip(np.sin(u * math.pi), 0, 1) ** 1.6
    shape = (xx >= xe0) & (xx <= xe1) & (yy >= top) & (yy <= yb)
    # the ends: a bow out to the side between two concave corner notches
    for side, xe in ((-1, xe0), (1, xe1)):
        bow = ((xx - xe) * side >= 0) & (((xx - xe) / 34.0) ** 2 + ((yy - ymid) / ((yb - yt) * 0.36)) ** 2 <= 1.0)
        shape |= bow
        for cy in (yt, yb):
            shape &= ~disc(xx, yy, xe + side * 2.0, cy, 13.0)
    solid = shape
    d = ndimage.distance_transform_edt(shape) / ss
    rim = 9.0
    field = shape & (d > rim)
    bev = np.clip(d / rim, 0, 1)
    h_rim = np.where(shape, np.where(d < rim, np.sin(bev * math.pi) ** 0.8 * 5.0 + 1.5, 0.6), 0)
    line = shape & (np.abs(d - (rim + 4.5)) < 0.7)
    hgt = h_rim
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 0.8)
    metal = brass(n, wear=noise((NH, NW), rng, ss * 3), spec_amt=0.6, lift=-0.1)
    metal = metal * (1 + noise((NH, NW), rng, ss * 8)[..., None] * 0.1)
    # the field: aubergine enamel, lit from above, sinking toward its foot; the
    # gradient runs by the slice rows so the stretched middle stays continuous
    tex = np.asarray(Image.open(os.path.join(OUT, "enamel.webp")).convert("RGB"), np.float32)
    tile = np.tile(tex, (NH // tex.shape[0] + 1, NW // tex.shape[1] + 1, 1))[:NH, :NW]
    lum = tile.mean(axis=2) / 255.0
    ft = np.clip(0.6 - (yy - crown) / (yb - crown) * 0.4 + (lum - lum.mean()) * 0.6, 0, 1)
    en = ramp(ft, [(0.0, "#0b0611"), (0.35, "#181024"), (0.65, "#271a38"), (1.0, "#3d2b56")])
    col = np.where(field[..., None], en, metal)
    col = np.where(line[..., None], metal * 0.78, col)
    sh = smooth(rim, rim + 8, d)
    col = np.where(field[..., None], col * (0.62 + 0.38 * sh)[..., None], col)
    rgba = finish(col, solid, ss)
    save(rgba, "plate-arch.webp", 92)


PIECES = {
    "bracket": brackets,
    "velvet": velvet_ring,
    "bookmark": bookmark,
    "plate": plate_arch,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=sorted(PIECES))
    a = ap.parse_args()
    for name, fn in PIECES.items():
        if a.only and a.only != name:
            continue
        fn()


if __name__ == "__main__":
    main()
