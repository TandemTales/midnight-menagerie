"""Render the Scuffle screen's painted pieces: the settings its readings sit in.

`tools/prep_ui_materials.py` renders the kit's brass and enamel for the boards
(cartouches, the Courage tube, the Keepsake socket). The Scuffle screen needs
four more settings of the same metal, and they are rendered here by the same
height-field method with the same brass ramp and the same top-left light, so a
medallion over a creature and a price tag in the Shop are one material:

  intent-attack.webp   an intent's medallion: a riveted brass ring drawn to a
  intent-defense.webp  point below (it is coming at you), a heater shield, a
  intent-scheme.webp   gothic quatrefoil and a plain riveted ring. Each is the
  intent-special.webp  brass and a GLAZE only: the enamel's colour is the SVG
                       path under it (ui/intent.js, `.cb-intent__frame`), so
                       it stays a token and the colour-blind palettes still
                       reach it. The glaze is what makes that flat colour read
                       as fired enamel: dark where the rim shades it, mottled,
                       and a gloss off its top left.
  guard-shield.webp    the Guard badge on a Courage tube: the defence setting,
                       smaller and heavier, with its own steel enamel glaze.

Every piece shares its silhouette with a path in ui/intent.js (FRAMES), drawn
on the same 100-unit box, so the SVG enamel sits exactly inside the brass.

    python tools/prep_combat_kit.py            # everything
    python tools/prep_combat_kit.py --sheet    # also a contact sheet, for tuning
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_ui_materials import (OUT, brass, down, noise, normals, save,  # noqa: E402
                               smooth)


# ── the silhouettes, on a 100-unit box (keep in step with FRAMES in ui/intent.js)
def _bez(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))
    return out


ATTACK_C = (50, 41, 36)          # the ring of the attack drop: centre x, y and radius


def attack_pts():
    """A ring drawn down to an ogee point, like a drop pendant: the medallion
    hangs toward the player. The sides turn in before the tip so it reads as
    a jeweller's drop, not as a map pin."""
    cx, cy, r = ATTACK_C
    a = math.radians(48)                                     # where the sides leave the ring
    L = (cx - r * math.sin(a), cy + r * math.cos(a))
    R = (cx + r * math.sin(a), cy + r * math.cos(a))
    apex = (50, 97)
    # the ring, from the right shoulder up over the top and round to the left
    # shoulder (screen angles, y down: 42 deg is below-right, -222 is below-left)
    pts = [(cx + r * math.cos(math.radians(d)), cy + r * math.sin(math.radians(d)))
           for d in np.linspace(90 - 48, -(270 - 48), 96)]
    tanL = (math.cos(a), math.sin(a))                        # the ring's tangent, heading down at L
    pts += _bez(L, (L[0] + tanL[0] * 9, L[1] + tanL[1] * 9), (apex[0] - 5, apex[1] - 13), apex)[1:]
    pts += _bez(apex, (apex[0] + 5, apex[1] - 13), (R[0] - tanL[0] * 9, R[1] + tanL[1] * 9), R)[1:]
    return pts


def attack_shape(dr, k):
    dr.polygon([(x * k, y * k) for x, y in attack_pts()], fill=255)


def defense_pts():
    pts = []
    pts += _bez((50, 5), (63, 11), (77, 13), (90, 13))
    pts += _bez((90, 13), (90, 52), (78, 80), (50, 96))[1:]
    pts += _bez((50, 96), (22, 80), (10, 52), (10, 13))[1:]
    pts += _bez((10, 13), (23, 13), (37, 11), (50, 5))[1:]
    return pts


def defense_shape(dr, k):
    dr.polygon([(x * k, y * k) for x, y in defense_pts()], fill=255)


def scheme_shape(dr, k):
    """A gothic quatrefoil: four lobes round a square, the window tracery of the
    house the fight is in."""
    r = 25
    for cx, cy in ((50, 25), (75, 50), (50, 75), (25, 50)):
        dr.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=255)
    dr.rectangle([27 * k, 27 * k, 73 * k, 73 * k], fill=255)


def special_shape(dr, k):
    dr.ellipse([5 * k, 5 * k, 95 * k, 95 * k], fill=255)


# ── one setting ─────────────────────────────────────────────────────────────
ANTIQUE = 0.78
def setting(name, shape, S=192, ss=3, rim_u=9.5, rivets=(), seed=1, glaze_dark=0.52,
            enamel=None, sheen=1.0):
    """Brass rim + glaze over a transparent enamel field (or a baked `enamel`).

    rim_u   rim width in 100-unit box units
    rivets  [(x, y)] in box units, domes set into the rim
    enamel  None: the field is left for CSS/SVG to colour (glaze only);
            ((top), (bottom)) hex pair: bake the enamel in"""
    rng = np.random.default_rng(seed)
    W = S * ss
    k = W / 100.0
    im = Image.new("L", (W, W), 0)
    shape(ImageDraw.Draw(im), k)
    big = np.asarray(im, np.float32) / 255.0
    small = np.asarray(im.resize((S, S), Image.LANCZOS), np.float32) / 255.0
    inside = big > 0.5
    d = ndimage.distance_transform_edt(inside) / k            # distance to the edge, in box units

    rimw = rim_u
    t = np.clip(d / rimw, 0, 1)
    # the rim is a round rod, a little flattened on top, falling to a step
    rod = np.where(d < rimw, np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * (0.8 + 0.2 * (1 - t)), 0)
    # an inner bead: a fine bright wire just inside the rim, as on the Kid board's rings
    b0, b1 = rimw + 1.0, rimw + 2.6
    tb = np.clip((d - b0) / (b1 - b0), 0, 1)
    bead = np.where((d >= b0) & (d < b1), np.sqrt(np.clip(1 - (2 * tb - 1) ** 2, 0, 1)) * 0.45, 0)
    hgt = rod * rimw * 0.95 + bead * 2.2
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / k
    solid = (d < rimw) | ((d >= b0) & (d < b1))
    for rx, ry in rivets:
        rd = np.hypot(xx - rx, yy - ry)
        dome = np.sqrt(np.clip(1 - (rd / 2.9) ** 2, 0, 1))
        hgt = np.where(rd < 2.9, np.maximum(hgt, rimw * 0.95 * 0.85 + dome * 2.6), hgt)
        solid = solid | (rd < 2.9)
    hgt = ndimage.gaussian_filter(hgt * k, ss * 0.55)
    n = normals(hgt, 1.0)
    # ANTIQUE brass: the rings the Kid board paints (button.webp, medal-*.webp)
    # sit at a median luminance near 60 with their glints under 110. The
    # materials ramp is lit for a board's gilt and lands near 105 with white
    # glints, which beside the paintings reads as new gilding.
    metal = brass(n, wear=noise((W, W), rng, ss * 2.2), spec_amt=0.38, lift=-0.14) * ANTIQUE
    metal = metal * np.array([1.0, 0.94, 0.86], np.float32)          # toward bronze

    # ink: the outline round the silhouette, and the cuts either side of the bead
    ink = np.array([12, 7, 4], np.float32)
    col = metal.copy()
    alpha = np.ones((W, W), np.float32)
    edge = smooth(0.0, 0.55, d)
    col = col * edge[..., None] + ink * (1 - edge[..., None])
    for cut in (rimw, b1):
        m = np.abs(d - cut) < 0.42
        col = np.where(m[..., None], ink, col)

    # the enamel field
    field = (d >= b1 + 0.42) & ~solid
    inner = np.clip(d - b1, 0, None)
    depth = float(np.percentile(inner[field], 97)) if field.any() else 20.0
    # shade: under the rim, and heavier toward the foot, mottled
    shade = glaze_dark * (1 - smooth(0, depth * 0.55, inner)) + 0.16 + 0.14 * (yy / 100.0)
    shade = shade + noise((W, W), rng, ss * 5) * 0.05 + noise((W, W), rng, ss * 1.2) * 0.03
    shade = np.clip(shade, 0, 0.92)
    # gloss: a soft bloom toward the light, and the rim's reflection along the lit edge
    cy_g, cx_g = np.array(np.nonzero(field)).mean(axis=1) / k if field.any() else (50, 50)
    bloom = np.exp(-(((xx - (cx_g - depth * 0.28)) / (depth * 0.55)) ** 2
                     + ((yy - (cy_g - depth * 0.42)) / (depth * 0.32)) ** 2))
    gy, gx = np.gradient(ndimage.gaussian_filter(inner, ss))
    facing = np.clip(-(gx * -0.55 + gy * -0.83) / (np.hypot(gx, gy) + 1e-6), 0, 1)   # edge turned to the light
    streak = np.exp(-((inner - 2.2) / 1.3) ** 2) * facing
    gloss = np.clip(0.20 * bloom * sheen + 0.42 * streak * sheen, 0, 0.6)

    if enamel is None:
        # glaze only: black shade and white gloss, composited into one straight-alpha layer
        a_s, a_h = shade, gloss
        A = a_h + a_s * (1 - a_h)
        C = (255.0 * a_h) / np.maximum(A, 1e-6)
        gl_col = np.dstack([C, C * 0.97, C * 0.93])
        col = np.where(field[..., None], gl_col, col)
        alpha = np.where(field, A, alpha)
        # the thin gap between bead and field is shadow, not metal
        gap = (d >= b1) & (d < b1 + 0.42) & ~solid
        col = np.where(gap[..., None], ink, col)
    else:
        top, bot = [np.array([int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)], np.float32) for h in enamel]
        ty = np.clip((yy - 10) / 80.0, 0, 1)[..., None]
        base = top * (1 - ty) + bot * ty
        base = base * (1 - shade[..., None] * 0.9) + 255.0 * gloss[..., None]
        col = np.where(field[..., None], base, col)

    col = down(col, ss)
    alpha = down(alpha, ss) * small
    out = np.dstack([np.clip(col, 0, 255), np.clip(alpha, 0, 1) * 255])
    save(out, name, 92)
    return out


RING4 = ((50, 5 + 4.75), (95 - 4.75, 50), (50, 95 - 4.75), (5 + 4.75, 50))


def intents():
    # the attack ring's rivets sit on its circle, clear of the point, and a bead finishes the tip
    cx, cy, r = ATTACK_C
    r -= 4.75
    ring = [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in (-math.pi / 2, 0, math.pi)]
    setting("intent-attack.webp", attack_shape, rivets=ring + [(50, 91.5)], seed=21)
    setting("intent-defense.webp", defense_shape, rivets=((50, 10.5),), seed=22)
    setting("intent-scheme.webp", scheme_shape,
            rivets=((50, 4.75), (95.25, 50), (50, 95.25), (4.75, 50)), seed=23)
    setting("intent-special.webp", special_shape, rivets=RING4, seed=24)


def guard():
    """Guard on a Courage tube: the defence setting cut small and heavy, its
    enamel baked in the steel of --guard-500 so it reads at 30 px."""
    setting("guard-shield.webp", defense_shape, S=112, ss=4, rim_u=11.5, rivets=(), seed=31,
            enamel=("#4d7aa6", "#1c3450"), glaze_dark=0.5, sheen=1.1)


# ── round 3: the full board ─────────────────────────────────────────────────
def _rod(d, w):
    """A half-round rod `w` wide in section, as a height, over distance `d` into it."""
    t = np.clip(d / w, 0, 1)
    return np.where((d >= 0) & (d < w), np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)), 0)


def gauge():
    """A Courage gauge's housing: a brass tube with an open channel, closed at
    each end by a collared cap and a domed knob — the brass the enamel is SET
    IN, painted to lie over the fill (`.kit-tube::after`), so the lips overlap
    the enamel's edge the way a bezel holds a glass.

    240x56, a 9-slice: 40 px ends carry the caps; the middle is a plain run of
    lip over channel over lip. The channel is transparent.
      caps     x 0..34: a dome knob, a collar with two turned grooves and a bead
      lips     y 10..17 and 39..46, x 24..216: round rods either side of the
               channel (y 17..39), which is where the fill shows"""
    rng = np.random.default_rng(1203)
    W, H, ss = 240, 56, 4
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    xm = np.minimum(xx, W - xx)                      # distance from the nearer end: both caps at once
    hgt = np.zeros((SH, SW), np.float32)
    solid = np.zeros((SH, SW), bool)

    # lips: two rods along the channel
    lipT = (yy >= 10) & (yy < 17) & (xx >= 24) & (xx <= W - 24)
    lipB = (yy >= 39) & (yy < 46) & (xx >= 24) & (xx <= W - 24)
    hgt = np.where(lipT, _rod(yy - 10, 7) * 4.8, hgt)
    hgt = np.where(lipB, _rod(yy - 39, 7) * 4.8, hgt)
    solid |= lipT | lipB

    # the collar: a cylinder round the tube's end, taller than the tube
    cy, ry = 28.0, 23.0
    col_m = (xm >= 9) & (xm <= 33) & (np.abs(yy - cy) <= ry)
    # rounded corners on the collar's silhouette
    corner = 5.0
    dxc = np.clip(np.maximum(9 + corner - xm, xm - (33 - corner)), 0, None)
    dyc = np.clip(np.abs(yy - cy) - (ry - corner), 0, None)
    col_m &= np.hypot(dxc, dyc) <= corner
    cyl = np.sqrt(np.clip(1 - ((yy - cy) / (ry + .5)) ** 2, 0, 1))
    collar = cyl * 7.5
    # two turned grooves and a bead at the inboard lip
    for gx in (15.5, 23.5):
        collar = collar - np.exp(-((xm - gx) / 0.7) ** 2) * 1.6
    collar = collar + np.exp(-((xm - 31.0) / 1.1) ** 2) * 1.2
    # the collar's ends are chamfered so light catches them
    collar = collar * (0.78 + 0.22 * smooth(9, 11.5, xm)) * (0.86 + 0.14 * (1 - smooth(31, 33, xm)))
    hgt = np.where(col_m, np.maximum(hgt, collar), hgt)
    solid |= col_m

    # the knob: a dome on the collar's outer face
    kx, ky, krx, kry = 6.0, 28.0, 5.5, 10.5
    kn = ((xm - kx) / krx) ** 2 + ((yy - ky) / kry) ** 2
    knob_m = kn <= 1
    dome = np.sqrt(np.clip(1 - kn, 0, 1)) * 5.5
    hgt = np.where(knob_m, np.maximum(hgt, dome), hgt)
    solid |= knob_m

    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 2.2), spec_amt=0.4, lift=-0.1) * ANTIQUE
    metal = metal * np.array([1.0, 0.94, 0.86], np.float32)

    # ink round every solid, and in the grooves
    dist_in = ndimage.distance_transform_edt(solid) / ss
    ink = np.array([12, 7, 4], np.float32)
    edge = smooth(0.0, 0.7, dist_in)
    col = metal * edge[..., None] + ink * (1 - edge[..., None])
    alpha = smooth(0.0, 0.35, dist_in)
    # the channel side of each lip darkens into the recess: a lip shades what it holds
    shade = np.clip(((yy - 15) / 2.0) * (yy < 17) + ((41 - yy) / 2.0) * (yy >= 39), 0, 1)
    col = np.where((lipT | lipB)[..., None], col * (1 - 0.35 * shade[..., None]), col)

    col = down(col, ss)
    alpha = down(alpha, ss)
    save(np.dstack([np.clip(col, 0, 255), np.clip(alpha, 0, 1) * 255]), "gauge.webp", 94)


def coin_face():
    """Nerve's coin, and the cost struck on every Trick in the hand: a gold
    piece with a raised rim, a ring of beads inside it and a gently domed
    field for the figure. Brighter than the antique settings round it (it is
    the thing you spend), and plain in the field so a numeral reads on it.

    128x128, transparent outside the rim."""
    rng = np.random.default_rng(1207)
    S, ss = 128, 4
    W = S * ss
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / ss
    c = S / 2 - 0.5
    r = np.hypot(xx - c, yy - c)
    R = S / 2 - 3.0
    inside = r <= R
    d = np.clip(R - r, 0, None)                      # distance in from the edge
    rim_w = 9.0
    rim = _rod(d, rim_w) * 5.5 * (0.85 + 0.15 * (1 - np.clip(d / rim_w, 0, 1)))
    # a step down from the rim to the field, and a dome across the field
    field = (d >= rim_w)
    dome = np.where(field, 1.6 + 2.4 * np.sqrt(np.clip(1 - (r / (R - rim_w)) ** 2, 0, 1)), 0)
    hgt = np.where(d < rim_w, rim, dome)
    # the beads: a ring of small domes just inside the rim
    br = R - rim_w - 3.6
    nb = 40
    ang = np.arctan2(yy - c, xx - c)
    k = np.round(ang / (2 * np.pi / nb)) * (2 * np.pi / nb)
    bx, by = c + br * np.cos(k), c + br * np.sin(k)
    bd = np.hypot(xx - bx, yy - by)
    bead = np.sqrt(np.clip(1 - (bd / 2.1) ** 2, 0, 1)) * 2.0
    hgt = np.where((bd < 2.1) & field, np.maximum(hgt, dome + bead), hgt)
    hgt = np.where(inside, hgt, 0)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = brass(n, wear=noise((W, W), rng, ss * 3), spec_amt=0.55, lift=0.06) * 0.94
    metal = metal * np.array([1.0, 0.95, 0.84], np.float32)
    # the field is burnished: a touch lighter and smoother than the rim's cast gold
    metal = np.where(field[..., None], metal * 1.04 + 6, metal)
    ink = np.array([22, 13, 5], np.float32)
    edge = smooth(0.0, 0.8, d)
    col = metal * edge[..., None] + ink * (1 - edge[..., None])
    step = np.abs(d - rim_w) < 0.45
    col = np.where(step[..., None], col * 0.55 + ink * 0.45, col)
    alpha = np.clip((R + 0.5 - r) / 1.0, 0, 1)
    col = down(col, ss)
    alpha = down(alpha, ss)
    save(np.dstack([np.clip(col, 0, 255), alpha * 255]), "coin-face.webp", 92)


PIECES = {"intents": intents, "guard": guard, "gauge": gauge, "coin": coin_face}


def contact_sheet():
    names = ["intent-attack.webp", "intent-defense.webp", "intent-scheme.webp", "intent-special.webp", "guard-shield.webp"]
    fills = [(106, 34, 24), (42, 68, 96), (74, 45, 98), (87, 57, 26), None]
    grounds = [(24, 18, 28), (120, 110, 100)]
    tiles = []
    for g in grounds:
        row = Image.new("RGB", (5 * 210, 220), g)
        for i, (nm, f) in enumerate(zip(names, fills)):
            im = Image.open(os.path.join(OUT, nm)).convert("RGBA")
            sz = 192 if im.width >= 192 else 112
            tile = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
            if f is not None:
                m = Image.new("L", (sz * 3, sz * 3), 0)
                shp = [attack_shape, defense_shape, scheme_shape, special_shape][i]
                shp(ImageDraw.Draw(m), sz * 3 / 100)
                m = m.resize((sz, sz), Image.LANCZOS)
                tile.paste(Image.new("RGBA", (sz, sz), f + (255,)), (0, 0), m)
            tile.alpha_composite(im.resize((sz, sz)))
            row.paste(tile, (i * 210 + 8, 14), tile)
        tiles.append(row)
    sheet = Image.new("RGB", (5 * 210, 440))
    sheet.paste(tiles[0], (0, 0))
    sheet.paste(tiles[1], (0, 220))
    return sheet


def main():
    ap = argparse.ArgumentParser(description="Render the Scuffle screen's painted pieces.")
    ap.add_argument("--only", default="", help="comma-separated: " + ", ".join(PIECES))
    ap.add_argument("--sheet", default="", help="write a contact sheet PNG to this path")
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("combat kit ->", os.path.relpath(OUT, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    for nm in names:
        PIECES[nm]()
    if a.sheet:
        contact_sheet().save(a.sheet)
        print("sheet ->", a.sheet)


if __name__ == "__main__":
    main()
