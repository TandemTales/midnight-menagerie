"""The tier metals for round 12's CHROME pass: the achievement toast's plaque.

An achievement has a tier -- bronze, silver or gold -- and the tier is the one
thing a player should read at a glance. The kit only ever cast its fittings in
one metal, the samples' antique brass. So the toast's plaque and its medal are
the kit's OWN paintings, re-cast: every gilt pixel of the piece is found on the
brass ramp the kit was painted with (tools/prep_ui_materials.py's BRASS), by
its brightness, and given the colour at the same place on a silver or a bronze
ramp. The enamel, the shadows, the ink and the alpha are left exactly as they
were, so the plaque keeps its bevels, its notched ends and its lit field, and
only the metal changes.

The two ramps stay in the samples' palette: silver is the cold of the boards'
moonlight (--kit-moon's blue in its shadows), bronze a darker, redder brass,
never a new hue family.

  chrome-plate-silver.webp   plate-lit.webp (the Companion tiles' nameplate,
  chrome-plate-bronze.webp   207x72, slices 12 53 12 46) with its rim re-cast
  chrome-medal-silver.webp   rosette.webp (the kit's gold star medal, 96 px)
  chrome-medal-bronze.webp   re-cast whole
  chrome-panel-silver.webp   panel.webp (the Kid board's painted gold rail,
  chrome-panel-bronze.webp   452x223, slices 44) with its metal re-cast

Gold needs no copy: it IS plate-lit.webp and rosette.webp.

    python tools/prep_chrome.py
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, "game", "assets", "ui", "kit")

# the kit's brass ramp (tools/prep_ui_materials.py), shadow to highlight
BRASS = [(0.0, "#1e1206"), (0.22, "#4a3113"), (0.42, "#7d5a2a"), (0.62, "#b08a4a"),
         (0.8, "#d8b775"), (0.93, "#efd79c"), (1.0, "#fbeec6")]
# the same steps of light, in the other two metals
METALS = {
    # cold: moonlight in the shadows, a pale pewter body, near-white where lit
    "silver": [(0.0, "#101117"), (0.22, "#2f313c"), (0.42, "#5d6070"), (0.62, "#9b9eb0"),
               (0.8, "#c9ccda"), (0.93, "#e6e8f2"), (1.0, "#fbfbff")],
    # a darker, redder brass: the same family as the gold, one step toward copper
    "bronze": [(0.0, "#190b04"), (0.22, "#3f1f0c"), (0.42, "#6c3a1b"), (0.62, "#a0633a"),
               (0.8, "#c98d5d"), (0.93, "#e4b285"), (1.0, "#f6d8b8")],
}


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def ramp(t, stops):
    ts = np.array([s for s, _ in stops], np.float32)
    cs = np.stack([hexc(c) for _, c in stops])
    t = np.clip(t, 0, 1)
    return np.stack([np.interp(t, ts, cs[:, i]) for i in range(3)], -1)


def place_on_brass(rgb):
    """Where each pixel sits on the brass ramp, from its brightness (0-1)."""
    ts = np.array([s for s, _ in BRASS], np.float32)
    ls = np.array([lum(hexc(c)) for _, c in BRASS], np.float32)   # rises with t
    return np.interp(lum(rgb), ls, ts)


def goldness(rgb):
    """How much of a pixel is the gilt: warm hue, some saturation, some light.
    Violet enamel, black ink and the grey of a shadow all score zero."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.max(rgb, -1)
    mn = np.min(rgb, -1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # hue in degrees
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    warm = np.clip(1 - np.abs(h - 40) / 32, 0, 1)                   # 8..72 degrees
    warm = np.where((h > 200), 0, warm)                             # violet stays violet
    s_ok = np.clip((sat - 0.12) / 0.2, 0, 1)
    v_ok = np.clip((mx - 18) / 30, 0, 1)
    return warm * s_ok * v_ok


def recast(src, metal):
    im = Image.open(os.path.join(KIT, src)).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:]
    t = place_on_brass(rgb)
    cast = ramp(t, METALS[metal])
    k = goldness(rgb)[..., None]
    out = rgb * (1 - k) + cast * k
    return np.concatenate([np.clip(out, 0, 255), alpha], -1).astype(np.uint8)


def save(arr, name):
    path = os.path.join(KIT, name)
    im = Image.fromarray(arr, "RGBA")
    # lossless: these are small, 9-sliced, and a lossy edge would ring on the rim
    im.save(path, "WEBP", lossless=True, method=6, exact=False)
    print(f"  {name:28s} {im.width:4d}x{im.height:<4d} {os.path.getsize(path) / 1024:6.1f} KB")


# ── the award: a struck medal hung from a silk ribbon ────────────────────────
#
# Round 13. All three judges read the toast's medal as "a flat vector star on a
# gradient disc", and asked for engraved relief, a lit rim and a ribbon to hang
# it from -- a real award, whose METAL is the tier.
#
# So it is not drawn as shapes filled with gradients. A HEIGHT FIELD is built
# first -- the pin bar, the silk, the suspension ring, the medal's bevel, its
# raised rim, its bead ring and the wordmark's own eight-point star standing
# proud of the field -- and the picture is that height field LIT: the surface
# normal at every pixel taken from the height's own slope, one candle from the
# upper left, lambert for the body, a tight specular for the gilt's glint, and
# contact shadow where a raised edge overhangs what is beside it. The metal is
# then the ramp the brightness is read through, so bronze, silver and gold are
# the same struck object cast three times and never three colours of paint.

AW_W, AW_H = 260, 400          # the piece, in CSS pixels
SS = 4                         # supersampling
MED_C = (130.0, 300.0)         # the medal's centre
MED_R = 96.0                   # its radius
BAR_Y = (10.0, 38.0)           # the pin bar the ribbon hangs from
BAR_X = (58.0, 202.0)
SILK_X = (82.0, 178.0)         # the silk between bar and ring
RING_C, RING_R = (130.0, 212.0), 21.0

# the silk: the samples' violet, in the light and in the fold. It never goes
# paler than the wordmark's lavender -- a white sheen would leave the palette.
SILK = [(0.0, "#140a24"), (0.28, "#2c1a4a"), (0.52, "#4e2f7e"),
        (0.76, "#7b52b6"), (1.0, "#b99be0")]


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _star8(x, y, r_long, r_short):
    """The wordmark's own eight-point star: two astroids, one turned 45 deg.
    Returns a signed field, positive inside, in roughly pixel units."""
    def astroid(ax, ay, r):
        q = (np.abs(ax) / r) ** 0.5 + (np.abs(ay) / r) ** 0.5
        return (1.0 - q) * r * 0.5
    s = 0.70710678
    return np.maximum(astroid(x, y, r_long),
                      astroid((x + y) * s, (x - y) * s, r_short))


def _award_height():
    """The piece as a height field (0 = the paper, 1 = the highest gilt), plus
    its alpha and a mask of the parts that are silk rather than metal."""
    w, h = AW_W * SS, AW_H * SS
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x, y = xx / SS + 0.5 / SS, yy / SS + 0.5 / SS
    px = 1.0 / SS

    z = np.zeros((h, w), np.float32)
    a = np.zeros((h, w), np.float32)
    silk = np.zeros((h, w), np.float32)

    # ── the pin bar: a rounded brass bar with a bead at each end
    bx0, bx1 = BAR_X
    by0, by1 = BAR_Y
    bar_r = (by1 - by0) / 2
    bcy = (by0 + by1) / 2
    dx = np.maximum(np.maximum(bx0 + bar_r - x, x - (bx1 - bar_r)), 0)
    dbar = np.hypot(dx, y - bcy)
    m_bar = _smooth(bar_r, bar_r - 1.6 * px, dbar)
    # domed across its width, so the candle runs along its top lip
    z = np.maximum(z, m_bar * (0.52 + 0.30 * np.sqrt(np.clip(1 - (dbar / bar_r) ** 2, 0, 1))))
    a = np.maximum(a, m_bar)
    # the two beads
    for ex in (bx0 + 2.0, bx1 - 2.0):
        d = np.hypot(x - ex, y - bcy)
        m = _smooth(bar_r * 1.28, bar_r * 1.28 - 1.6 * px, d)
        z = np.maximum(z, m * (0.50 + 0.40 * np.sqrt(np.clip(1 - (d / (bar_r * 1.28)) ** 2, 0, 1))))
        a = np.maximum(a, m)

    # ── the silk, hanging from the bar to the ring: three pleats
    sx0, sx1 = SILK_X
    top, bot = by0 + 6.0, RING_C[1] + 2.0
    # gathered into the ring: the band is full at the bar and drawn in to half
    # its width at the ring, so its silhouette is a hanging ribbon and not a bar
    v = _smooth(top, bot, y)
    half = (sx1 - sx0) / 2 * (1.0 - 0.46 * v * v)
    cxs = (sx0 + sx1) / 2
    m_silk = (_smooth(half + 0.8 * px, half - 0.8 * px, np.abs(x - cxs))
              * _smooth(top - 0.8 * px, top + 0.8 * px, y)
              * _smooth(bot + 0.8 * px, bot - 0.8 * px, y))
    u = np.clip((x - cxs) / (2 * half) + 0.5, 0, 1)
    # the cloth's own section: one deep central fold with a shallower one each
    # side, so it has a lit face and a shadowed one and is never a flat band
    pleat = (0.62 * (0.5 + 0.5 * np.cos((u - 0.42) * 2 * np.pi))
             + 0.38 * (0.5 + 0.5 * np.cos((u - 0.42) * 3.0 * 2 * np.pi)))
    # its two edges turn away from us
    edge = _smooth(0.0, 0.13, u) * _smooth(1.0, 0.87, u)
    zs = (0.06 + 0.26 * pleat) * (0.22 + 0.78 * edge)
    z = np.where(m_silk > 0, np.maximum(z, zs * m_silk), z)
    a = np.maximum(a, m_silk)
    silk = np.maximum(silk, m_silk * (1 - m_bar))

    # ── the suspension ring
    d = np.hypot(x - RING_C[0], y - RING_C[1])
    band = _smooth(RING_R, RING_R - 1.4 * px, d) * _smooth(RING_R * 0.52, RING_R * 0.52 + 1.4 * px, d)
    tor = np.clip(1 - ((d - RING_R * 0.76) / (RING_R * 0.24)) ** 2, 0, 1)
    z = np.maximum(z, band * (0.46 + 0.42 * np.sqrt(tor)))
    a = np.maximum(a, band)
    silk = silk * (1 - band)

    # ── the medal
    cx, cy = MED_C
    d = np.hypot(x - cx, y - cy)
    m_med = _smooth(MED_R, MED_R - 1.5 * px, d)
    a = np.maximum(a, m_med)
    silk = silk * (1 - m_med)

    # the edge is bevelled over the outer 7px, then a raised rim, then the field
    bevel = _smooth(MED_R, MED_R - 7.0, d)
    zm = 0.30 * bevel
    rim = np.clip(1 - ((d - (MED_R - 15.0)) / 9.0) ** 2, 0, 1)
    zm += 0.34 * np.sqrt(rim)
    # the field, very slightly domed
    fld = _smooth(MED_R - 22.0, MED_R - 27.0, d)
    zm += fld * 0.07 * np.clip(1 - (d / MED_R) ** 2, 0, 1)
    # a ring of beads struck just inside the rim
    th = np.arctan2(y - cy, x - cx)
    beads = np.clip(1 - ((d - (MED_R - 30.0)) / 4.2) ** 2, 0, 1)
    zm += 0.085 * beads * (0.5 + 0.5 * np.cos(th * 40.0))
    # the wordmark's star, standing proud of the field with a bevelled flank
    s = _star8(x - cx, y - cy, MED_R * 0.66, MED_R * 0.34)
    zm += 0.30 * _smooth(0.0, 2.6, s)
    # and its boss at the centre
    boss = np.clip(1 - (d / (MED_R * 0.15)) ** 2, 0, 1)
    zm += 0.10 * np.sqrt(boss)
    z = np.where(m_med > 0, np.maximum(z, zm * m_med), z)

    return z, a, silk, (h, w)


def _blur(a, r):
    """A separable box blur, run three times: a gaussian, without scipy."""
    k = max(1, int(r))
    out = a
    pad = k
    for _ in range(3):
        c = np.cumsum(np.pad(out, ((0, 0), (pad, pad)), mode="edge"), 1)
        out = (c[:, 2 * k:] - c[:, :-2 * k]) / (2 * k)
        c = np.cumsum(np.pad(out, ((pad, pad), (0, 0)), mode="edge"), 0)
        out = (c[2 * k:, :] - c[:-2 * k, :]) / (2 * k)
    return out


def paint_award(metal):
    z, alpha, silk, (h, w) = _award_height()
    px_scale = 1.0 / SS

    gy, gx = np.gradient(z * 52.0, px_scale)
    n = np.stack([-gx, -gy, np.ones_like(z)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array([-0.50, -0.66, 0.56], np.float32)
    L /= np.linalg.norm(L)
    H = L + np.array([0.0, 0.0, 1.0], np.float32)
    H /= np.linalg.norm(H)
    diff = np.clip(n @ L, 0, 1)
    spec = np.clip(n @ H, 0, 1) ** 44.0

    # the light the candle does not reach: what is low beside what is high
    ao = np.clip(1.0 - np.clip(_blur(z, 5 * SS) - z, 0, 1) * 2.6, 0.22, 1.0)

    # ── the metal
    t = 0.10 + 0.86 * diff * ao
    # a struck face is not polished: a faint turned grain across the flat
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    grain = np.cos((xx * 0.9 + yy * 0.42) / SS) * 0.012 + np.cos(yy * 2.1 / SS) * 0.008
    t = np.clip(t + grain, 0, 1)
    body = ramp(t, METALS[metal] if metal in METALS else BRASS)
    body = body + spec[..., None] * np.array([255, 246, 226], np.float32) * 0.85

    # ── the silk
    ts = np.clip(0.02 + 0.80 * diff * ao, 0, 1)
    cloth = ramp(ts, SILK)
    # silk takes a long, soft sheen rather than a glint
    cloth = cloth + (np.clip(n @ H, 0, 1) ** 11.0)[..., None] * np.array([168, 140, 210], np.float32) * 0.30

    rgb = body * (1 - silk[..., None]) + cloth * silk[..., None]

    # the candle that lights it: warm where it falls, the samples' moon in the
    # shadow, so the piece is LIT rather than tinted
    warm = np.clip(diff * 1.25 - 0.18, 0, 1)[..., None]
    rgb = rgb * (0.90 + 0.10 * warm) + warm * np.array([36, 16, -6], np.float32)
    rgb = rgb + (1 - warm) * np.array([-6, -2, 10], np.float32)

    out = np.concatenate([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)[..., None] * 255], -1)
    im = Image.fromarray(out.astype(np.uint8), "RGBA")
    return np.asarray(im.resize((AW_W, AW_H), Image.LANCZOS)).astype(np.uint8)


# -- the cameo: the Kid board's gilt socket, with its glass knocked out -------
#
# socket-filigree.webp is the round filigree socket from UI/selectKid.png, and
# its oval is painted OPAQUE -- it was cut to hold a glyph laid over it, not a
# face behind it. The coach seats Marmalade in it, so the glass has to come
# out: the enamel inside the ring is made transparent and the cut is feathered
# a pixel or two, which leaves the ring's own inner lip and its shadow exactly
# as they were painted.


def cut_cameo():
    im = Image.open(os.path.join(KIT, "socket-filigree.webp")).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    h, w = alpha.shape
    # the glass: the enamel inside the ring -- violet, dark, and none of it gilt
    mx = rgb.max(-1)
    glass = ((goldness(rgb) < 0.12) & (rgb[..., 2] > rgb[..., 1] + 8)
             & (mx < 130) & (alpha > 160))
    # only the part of it reachable from the middle of the oval, so a violet
    # bead out on the filigree is not punched out with it
    keep = np.zeros(glass.shape, np.float32)
    stack = [(int(h * 0.56), int(w * 0.5))]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or keep[y, x] or not glass[y, x]:
            continue
        keep[y, x] = 1.0
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    # pull the cut in from the ring by a pixel, then feather it
    k = np.minimum.reduce([keep, np.roll(keep, 1, 0), np.roll(keep, -1, 0),
                           np.roll(keep, 1, 1), np.roll(keep, -1, 1)])
    k = _blur(k, 2)
    out = np.dstack([rgb, np.clip(alpha * (1.0 - np.clip(k, 0, 1)), 0, 255)])
    return out.astype(np.uint8)


# -- the valance: the swag that crowns the cover -----------------------------
#
# Round 13, a graft a judge named from a candidate that lost: "a theatre
# valance and tassels crowning the cover". The veil is the thing that comes
# down between two players, so it is hung like one -- a gathered velvet swag
# with a gilt bullion fringe and a tassel at every gather.
#
# One unit, tiled: the gathers sit ON the left and right edges, so a tassel is
# half at each end and joins across the seam. Lit the same way the medal is --
# a height field for the folds, one candle high on the left -- and coloured
# through the samples' own violet, which is where the Kid board's enamel and
# the wordmark's lettering both live.

VA_W, VA_H = 520, 250          # one gather to the next, and the deepest drop
VA_SS = 3
# the velvet: the fold, the body, the light on a ridge
VELVET = [(0.0, "#0d0617"), (0.3, "#1f1036"), (0.58, "#3a2461"),
          (0.8, "#5d3c92"), (1.0, "#9a7cc6")]


def _paint_valance():
    w, h = VA_W * VA_SS, VA_H * VA_SS
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x, y = xx / VA_SS, yy / VA_SS
    px = 1.0 / VA_SS
    u = x / VA_W

    head = 26.0                                  # the gathered heading at the top
    hem = 76.0 + 126.0 * np.sin(np.pi * u) ** 1.25  # where the cloth stops
    cloth = (_smooth(hem + 1.2 * px, hem - 1.2 * px, y)
             * _smooth(-1.0, 0.6, y))

    # the folds: they radiate from the two gathers, so they lean outward and
    # open up as the cloth falls
    drop = np.clip((y - head) / np.maximum(hem - head, 1e-3), 0, 1)
    lean = (u - 0.5) * (1.0 - drop) * 0.40
    ph = (u + lean) * 9.0
    fold = 0.5 + 0.5 * np.cos(ph * 2 * np.pi)
    z = (0.18 + 0.42 * fold) * (0.35 + 0.65 * drop)
    # the heading is rolled and pulled tight into each gather
    roll = _smooth(head, 0.0, y)
    gather = np.clip(1.0 - np.minimum(u, 1.0 - u) / 0.14, 0, 1)
    z = z * (1 - roll) + roll * (0.30 + 0.34 * (0.5 + 0.5 * np.cos((u * 13.0) * 2 * np.pi)))
    z = z * (1.0 - 0.45 * gather * (1 - drop))
    z = z * cloth

    gy, gx = np.gradient(z * 30.0, px)
    n = np.stack([-gx, -gy, np.ones_like(z)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array([-0.46, -0.62, 0.64], np.float32)
    L /= np.linalg.norm(L)
    diff = np.clip(n @ L, 0, 1)
    # velvet is darkest where it faces you and lights along a ridge
    t = np.clip(0.04 + 0.92 * diff * (0.42 + 0.58 * drop), 0, 1)
    rgb = ramp(t, VELVET)
    alpha = np.clip(cloth, 0, 1)

    # -- the gilt bullion along the hem
    band = np.clip(1.0 - np.abs(y - (hem - 7.0)) / 9.0, 0, 1) * cloth
    strand = 0.5 + 0.5 * np.cos(x * 2 * np.pi / 8.0)
    gt = np.clip(0.26 + 0.62 * strand * band + 0.2 * diff, 0, 1)
    gold = ramp(gt, BRASS)
    k = (band > 0.02)[..., None] * np.clip(band, 0, 1)[..., None]
    rgb = rgb * (1 - k) + gold * k

    # -- the tassel at each gather: a gilt pear on a cord, then its skirt
    for gxp in (0.0, float(VA_W)):
        d = np.hypot(x - gxp, (y - (head + 26.0)) * 1.25)
        pear = _smooth(15.0, 13.0, d)
        dome = np.sqrt(np.clip(1 - (d / 15.0) ** 2, 0, 1))
        pt = np.clip(0.2 + 0.78 * dome * (1.0 - 0.5 * np.clip((x - gxp + 6) / 26, 0, 1)), 0, 1)
        rgb = rgb * (1 - pear[..., None]) + ramp(pt, BRASS) * pear[..., None]
        alpha = np.maximum(alpha, pear)
        # the skirt
        top, bot = head + 34.0, head + 96.0
        halfw = 10.0 + 5.0 * np.clip((y - top) / (bot - top), 0, 1)
        sk = (_smooth(halfw + 1.2 * px, halfw - 1.2 * px, np.abs(x - gxp))
              * _smooth(top - 1.0, top + 1.0, y) * _smooth(bot + 1.0, bot - 1.0, y))
        cord = 0.5 + 0.5 * np.cos((x - gxp) * 2 * np.pi / 4.6)
        st = np.clip(0.14 + 0.66 * cord * (1.0 - 0.34 * np.clip((y - top) / (bot - top), 0, 1)), 0, 1)
        rgb = rgb * (1 - sk[..., None]) + ramp(st, BRASS) * sk[..., None]
        alpha = np.maximum(alpha, sk)

    out = np.concatenate([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)[..., None] * 255], -1)
    im = Image.fromarray(out.astype(np.uint8), "RGBA")
    return np.asarray(im.resize((VA_W, VA_H), Image.LANCZOS)).astype(np.uint8)


def main():
    save(cut_cameo(), "chrome-cameo.webp")
    save(_paint_valance(), "chrome-valance.webp")
    for metal in ("silver", "bronze"):
        save(recast("plate-lit.webp", metal), f"chrome-plate-{metal}.webp")
        save(recast("rosette.webp", metal), f"chrome-medal-{metal}.webp")
        save(recast("panel.webp", metal), f"chrome-panel-{metal}.webp")
    for metal in ("gold", "silver", "bronze"):
        save(paint_award(metal), f"chrome-award-{metal}.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
