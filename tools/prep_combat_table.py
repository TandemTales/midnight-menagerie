"""Render the THINGS ON THE FIGHT'S TABLE: the decks, the sand glass, the coin
Nerve is struck on, and the painted mirror the master of a wing stands in.

Round 5, COMBAT (docs/ui-pass/BRIEF-r5.md, the COMBAT fix list). Round 4's
judges named these pieces from the two boards that lost to FLINT's, and asked
for them on FLINT's board. They are ported here from those branches, by the
kit's own method (tools/prep_ui_materials.py: a height field lit from the
boards' top left, the antique brass ramp, an ink line round every silhouette),
under names of their own, because FLINT's board already ships a nerve-coin.webp,
a boss-crest.webp and an iron-bracket.webp that are different paintings:

  from GARNET (ui/r4-combat-c, tools/prep_combat_objects.py)
    deck-back.webp      the back every Trick in the house shares: aubergine
                        lacquer papered with the boards' damask, a gilt border
                        and inner rule, the Kid board's moon crest at its heart
    deck-draw.webp      DRAW: a squared-up deck of those backs, gilt-edged, in a
                        gilded card-shaped tray
    deck-discard.webp   DISCARD: the same tray, the backs thrown in
    deck-torn.webp      TORN: the top back ripped across
    deck-vanished.webp  VANISHED: the backs faded to a ghost in their tray
    shelf-iron.webp     the walnut shelf DISCARD and its candle stand on, on a
                        wrought-iron wall bracket (a 3-slice: the iron under
                        its right 100 px)
    hourglass-glass.webp END TURN's sand glass: turned brass ends and pillars,
                        two clear dark bulbs, sand heaped below and running
    nerve-milled.webp   Nerve's coin: a heavy struck piece, its milled edge
                        showing under the face, an enamel channel the turn's
                        Nerve is lit in, an engine-turned field burnished plain
                        where the figure is struck
    boss-crescent.webp  the boss plate's crest: a gold crescent in aubergine
                        enamel in a beaded brass ring, the wordmark's
                        fleur-de-lis rising from it

  from EBONY (ui/r4-combat-a, tools/prep_combat_kit.py)
    nerve-wings.webp    the setting Nerve's coin lies in: a clean beaded bezel
                        carried on heavy C-scroll wings, a knop at its crown and
                        a drop at its foot

  new
    boss-mirror.webp    UI/selectKid.png's centre mirror, as FLINT cut it for
                        boss-alcove.webp, made a MIRROR: the glass is painted
                        (old silvering gone dark, a cold sheen down it, tarnish
                        creeping in from the rails, a bevel catching the light)
                        instead of left clear over the room, and the crown's
                        medallion is redrawn ROUND and a size larger, its enamel
                        filling it, so the intent set in it stands clear of its
                        rails. A vertical 3-slice (MIR_TOP / MIR_BOT).

Run after tools/prep_ui_kit.py (it reads damask.webp, medal-moon.webp,
cart-crest.webp and button.webp).

    python tools/prep_combat_table.py                  # everything
    python tools/prep_combat_table.py --only mirror     # one piece while tuning
    python tools/prep_combat_table.py --sheet out.png  # and a contact sheet
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_ui_materials import (OUT, UI, brass, down, hexc, lambert, moulding,  # noqa: E402
                               noise, normals, ramp, save, smooth, specular, wood_albedo)

INK = np.array([14, 8, 4], np.float32)
ANTIQUE = 0.8


def _rod(d, w):
    """A half-round rod `w` wide in section, as a 0..1 height over distance `d` into it."""
    t = np.clip(d / w, 0, 1)
    return np.where((d >= 0) & (d < w), np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)), 0)


def _antique(n, rng, shape, ss, spec=0.5, lift=-0.06, k=ANTIQUE):
    metal = brass(n, wear=noise(shape, rng, ss * 2.4), spec_amt=spec, lift=lift) * k
    return metal * np.array([1.0, 0.94, 0.85], np.float32)


def _rgba(col, alpha):
    return np.dstack([np.clip(col, 0, 255), np.clip(alpha, 0, 1) * 255])


def _rrect_mask(W, H, x0, y0, x1, y1, rad, ss):
    im = Image.new("L", (W * ss, H * ss), 0)
    ImageDraw.Draw(im).rounded_rectangle([x0 * ss, y0 * ss, x1 * ss, y1 * ss], radius=rad * ss, fill=255)
    return np.asarray(im, np.float32) / 255.0


# ── Nerve: the milled coin (GARNET's) ─────────────────────────────────────────
COIN_S = 256
COIN_C = (128.0, 122.0)       # the FACE's centre (css: the figure sits here)
COIN_R = 111.0                # the face's radius
COIN_EDGE = 10.0              # how far the milled edge shows under the face
COIN_CHANNEL = (13.0, 27.0)   # the enamel channel, in px in from the face's edge


def nerve_milled():
    rng = np.random.default_rng(4401)
    S, ss = COIN_S, 3
    W = S * ss
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / ss
    cx, cy = COIN_C
    R = COIN_R
    r = np.hypot(xx - cx, yy - cy)
    th = np.arctan2(yy - cy, xx - cx)
    face = r <= R
    r2 = np.hypot(xx - cx, yy - (cy + COIN_EDGE))
    edge_m = (r2 <= R) & ~face
    d = np.clip(R - r, 0, None)

    c0, c1 = COIN_CHANNEL
    hgt = np.zeros((W, W), np.float32)
    rim = _rod(d, c0) * 6.5 * (0.8 + 0.2 * (1 - np.clip(d / c0, 0, 1)))
    hgt = np.where(d < c0, rim, hgt)
    chan = (d >= c0) & (d < c1)
    hgt = np.where(chan, -1.4 + 0.6 * _rod(d - c0, c1 - c0), hgt)
    wire = (d >= c1) & (d < c1 + 3.4)
    hgt = np.where(wire, 1.8 + _rod(d - c1, 3.4) * 2.4, hgt)
    field = d >= c1 + 3.4
    rf = R - c1 - 3.4
    dome = 1.2 + 2.6 * np.sqrt(np.clip(1 - (r / rf) ** 2, 0, 1))
    # engine turning: a rosette of fine rays that ripple, cut shallow, fading
    # toward the centre where the figure is struck so it never fights the figure
    ros = 0.5 + 0.5 * np.sin(th * 72 + np.sin(r * 0.19) * 1.6)
    fade = smooth(rf * 0.46, rf * 0.84, r)
    hgt = np.where(field, dome - ros * 0.55 * fade, hgt)
    # a ring of beads just inside the wire
    br = R - c1 - 9.0
    nb = 46
    k = np.round(th / (2 * np.pi / nb)) * (2 * np.pi / nb)
    bd = np.hypot(xx - (cx + br * np.cos(k)), yy - (cy + br * np.sin(k)))
    bead = np.sqrt(np.clip(1 - (bd / 2.9) ** 2, 0, 1)) * 2.6
    hgt = np.where((bd < 2.9) & field, np.maximum(hgt, dome + bead), hgt)
    hgt = np.where(face, hgt, 0)
    hs = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hs, 1.0)
    metal = _antique(n, rng, (W, W), ss, spec=0.62, lift=0.02, k=0.92)
    # the field is burnished a shade brighter: it is the struck face
    metal = np.where(field[..., None], metal * 1.06 + 5, metal)

    # the channel's enamel: deep aubergine, glossy along its lit rim
    en_t = np.clip((yy - (cy - R)) / (2 * R), 0, 1)
    en = ramp(1 - en_t, [(0.0, "#10081a"), (0.55, "#2a1640"), (1.0, "#3f2560")])
    en = en * (1 + noise((W, W), rng, ss * 3)[..., None] * 0.08)
    lit = np.clip(-(np.cos(th) * -0.55 + np.sin(th) * -0.83), 0, 1)
    ch_t = (d - c0) / (c1 - c0)
    en = en + (np.exp(-((ch_t - 0.72) / 0.14) ** 2) * lit)[..., None] * np.array([150, 120, 200], np.float32) * 0.55
    en = en * (0.55 + 0.45 * smooth(0.0, 0.35, ch_t))[..., None]
    col = np.where(chan[..., None], en, metal)

    # the milled edge: the coin's thickness, reeded, in the shadow of the face
    rib = 0.5 + 0.5 * np.cos(th * 150)
    edge_col = ramp(0.26 + 0.2 * rib + 0.1 * np.clip(-np.cos(th) * 0.5, 0, 1), [(0, "#1c1106"), (0.4, "#5a3e18"), (1, "#a37c40")])
    lip = np.exp(-((R - r2) / 2.2) ** 2)
    edge_col = edge_col + lip[..., None] * np.array([120, 90, 50], np.float32) * 0.5
    col = np.where(edge_m[..., None], edge_col, col)

    # ink: round the silhouette, where face meets edge, and at each step
    sil = face | edge_m
    din = ndimage.distance_transform_edt(sil) / ss
    col = col * smooth(0.0, 0.9, din)[..., None] + INK * (1 - smooth(0.0, 0.9, din)[..., None])
    for cut in (c0, c1, c1 + 3.4):
        m = face & (np.abs(d - cut) < 0.5)
        col = np.where(m[..., None], col * 0.35 + INK * 0.65, col)
    seam = edge_m & (r - R < 1.1)
    col = np.where(seam[..., None], INK, col)
    alpha = smooth(0.0, 0.6, din)
    save(_rgba(down(col, ss), down(alpha, ss)), "nerve-milled.webp", 93)


# ── Nerve's setting: the clean ring on its scroll wings (EBONY's) ─────────────
def _tapered(dr, pts, w0, w1, s):
    """Rasterise a stroke whose width runs from w0 to w1 along `pts`."""
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        w = w0 + (w1 - w0) * i / max(n - 1, 1)
        dr.ellipse([(x - w / 2) * s, (y - w / 2) * s, (x + w / 2) * s, (y + w / 2) * s], fill=255)


def _volute(sx, sy, ex, ey, hand, turns=1.55, r_end=5.0, n=220):
    """A C-scroll as a logarithmic spiral about its eye (ex, ey), starting at
    (sx, sy) and winding in. hand=+1 winds clockwise on screen, -1 the other way."""
    th0 = math.atan2(sy - ey, sx - ex)
    r0 = math.hypot(sx - ex, sy - ey)
    total = turns * 2 * math.pi
    k = math.log(r0 / r_end) / total
    pts = []
    for i in range(n):
        a = total * i / (n - 1)
        rad = r0 * math.exp(-k * a)
        th = th0 + hand * a
        pts.append((ex + rad * math.cos(th), ey + rad * math.sin(th)))
    return pts


WINGS_W, WINGS_H = 256, 196
WINGS_C = (128.0, 98.0)       # the hole's centre
WINGS_RH, WINGS_RB = 64.0, 75.0


def nerve_wings():
    """256x196: a cast gilt bezel round a hole the coin fills (centre WINGS_C,
    radius WINGS_RH), carried on four heavy C-scrolls winding into volutes
    either side, a small knop at its crown and a drop at its foot. EBONY's
    setting, its crest cut down to a knop so the corner keeps under the Kid's
    conditions at 1280x800."""
    rng = np.random.default_rng(4131)
    W, H, ss = WINGS_W, WINGS_H, 4
    SW, SH = W * ss, H * ss
    cx, cy = WINGS_C
    RH, RB = WINGS_RH, WINGS_RB
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    r = np.hypot(xx - cx, yy - cy)

    def layer(fn):
        im = Image.new("L", (SW, SH), 0)
        fn(ImageDraw.Draw(im))
        return np.asarray(im, np.float32) / 255.0 > 0.5

    def scrolls(dr):
        for sg in (-1, 1):
            for vs in (-1, 1):                         # vs -1 the upper scroll, +1 the lower
                a = math.radians(30 * vs) if sg > 0 else math.pi - math.radians(30 * vs)
                x0, y0 = cx + RB * 0.93 * math.cos(a), cy + RB * 0.93 * math.sin(a)
                ex, ey = cx + sg * 92, cy + vs * 24
                hand = sg * (-vs)
                pts = _volute(x0, y0, ex, ey, hand, turns=1.25, r_end=4.5)
                _tapered(dr, pts, 15.0, 4.6, ss)
                qx, qy = pts[-1]
                dr.ellipse([(qx - 4.8) * ss, (qy - 4.8) * ss, (qx + 4.8) * ss, (qy + 4.8) * ss], fill=255)
            # an acanthus leaf between the two, pointing out
            leaf = [(cx + sg * (RB - 6), cy - 8), (cx + sg * (RB + 16), cy - 3),
                    (cx + sg * (RB + 26), cy + 1), (cx + sg * (RB + 16), cy + 5), (cx + sg * (RB - 6), cy + 10)]
            dr.polygon([(x * ss, y * ss) for x, y in leaf], fill=255)
    sc = layer(scrolls)

    def crest(dr):
        # a knop at the crown: one bead and two small ones
        for dx, rr, dy in ((0, 9, -2), (-11, 6, 5), (11, 6, 5)):
            dr.ellipse([(cx + dx - rr) * ss, (cy - RB - 6 + dy - rr) * ss, (cx + dx + rr) * ss, (cy - RB - 6 + dy + rr) * ss], fill=255)
        # the drop at the foot
        dr.polygon([((cx - 14) * ss, (cy + RB - 4) * ss), ((cx + 14) * ss, (cy + RB - 4) * ss), (cx * ss, (cy + RB + 16) * ss)], fill=255)
        dr.ellipse([(cx - 5) * ss, (cy + RB + 12) * ss, (cx + 5) * ss, (cy + RB + 22) * ss], fill=255)
    cr = layer(crest)

    bezel = (r >= RH) & (r < RB)
    solid = (sc | cr | bezel) & (r >= RH)

    d_sc = ndimage.distance_transform_edt(sc | cr) / ss
    h_sc = np.sqrt(np.clip(d_sc / 7.0, 0, 1)) * 7.5
    h_sc = h_sc + np.exp(-((d_sc - 7.5) / 1.2) ** 2) * 0.9 * (d_sc > 5)
    tb = np.clip((r - RH) / (RB - RH), 0, 1)
    h_bz = np.sqrt(np.clip(1 - (2 * tb - 1) ** 2, 0, 1)) * 8.5 + 1.0
    ang = np.arctan2(yy - cy, xx - cx)
    beads = (0.5 + 0.5 * np.cos(ang * 36)) ** 4 * np.exp(-((r - (RH + 3.2)) / 1.4) ** 2) * 1.8
    h_bz = h_bz + beads
    hgt = np.where(bezel, np.maximum(h_bz, 0), np.where(sc | cr, h_sc, 0))
    hgt = np.where(r >= RH, hgt, 0)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 2.2), spec_amt=0.55, lift=-0.06) * 0.78 * 1.08
    metal = metal * np.array([1.0, 0.95, 0.86], np.float32)
    d_all = ndimage.distance_transform_edt(solid) / ss
    col = metal * smooth(0, 0.9, d_all)[..., None] + INK * (1 - smooth(0, 0.9, d_all))[..., None]
    col = np.where(((sc | cr) & bezel & (np.abs(r - RB) < 0.9))[..., None], INK, col)
    col = np.where((np.abs(r - RH) < 1.2)[..., None], INK, col)
    alpha = smooth(-0.3, 0.6, d_all) * solid
    save(_rgba(down(col, ss), down(alpha, ss)), "nerve-wings.webp", 94)


# ── the back of a Trick, and the decks (GARNET's) ─────────────────────────────
BACK_W, BACK_H = 120, 168


def deck_back():
    """120x168 RGBA: the back every Trick in the house shares."""
    rng = np.random.default_rng(4403)
    W, H, ss = BACK_W, BACK_H, 3
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    card = _rrect_mask(W, H, 0.5, 0.5, W - 0.5, H - 0.5, 8, ss) > 0.5
    d = ndimage.distance_transform_edt(card) / ss

    motif = np.asarray(Image.open(os.path.join(OUT, "damask.webp")).convert("RGBA"), np.float32)[..., 3] / 255.0
    mt = Image.fromarray((motif * 255).astype(np.uint8))
    mt = mt.resize((int(mt.width * 0.52 * ss), int(mt.height * 0.52 * ss)), Image.LANCZOS)
    m = np.asarray(mt, np.float32) / 255.0
    ys = (np.arange(SH) + int(12 * ss)) % m.shape[0]
    xs = (np.arange(SW) + int(SW / 2 - m.shape[1] / 2)) % m.shape[1]
    m = m[np.ix_(ys, xs)]
    ground = ramp(np.clip(0.55 - (yy / H) * 0.25, 0, 1), [(0.0, "#140a1d"), (0.5, "#22122f"), (1.0, "#301a43")])
    flock = hexc("#442b5c")
    lac = ground * (1 - m[..., None] * 0.55) + flock * (m[..., None] * 0.55)
    lac = lac * (1 + noise((SH, SW), rng, ss * 5)[..., None] * 0.1 + noise((SH, SW), rng, ss * 0.8)[..., None] * 0.05)
    vign = np.clip(np.hypot((xx - W / 2) / (W * 0.62), (yy - H / 2) / (H * 0.62)), 0, 1)
    lac = lac * (1 - 0.5 * vign[..., None] ** 2)

    hgt = np.zeros((SH, SW), np.float32)
    bw = 6.0
    hgt = np.where(d < bw, _rod(d, bw) * 4.0, hgt)
    rw0, rw1 = 10.0, 12.2
    rule = (d >= rw0) & (d < rw1)
    hgt = np.where(rule, _rod(d - rw0, rw1 - rw0) * 1.6, hgt)
    orn = np.zeros((SH, SW), np.float32)
    for (ox, oy, sx, sy) in ((17, 17, 1, 1), (W - 17, 17, -1, 1), (17, H - 17, 1, -1), (W - 17, H - 17, -1, -1)):
        lz = (np.abs(xx - ox) + np.abs(yy - oy)) / 4.2
        orn = np.maximum(orn, np.clip(1 - lz, 0, 1) * 2.2)
        for ang in (0.0, math.pi / 2):
            ex = ox + sx * (6.5 if ang == 0 else 0.0)
            ey = oy + sy * (6.5 if ang else 0.0)
            leaf = ((xx - ex) / (4.2 if ang == 0 else 1.5)) ** 2 + ((yy - ey) / (1.5 if ang == 0 else 4.2)) ** 2
            orn = np.maximum(orn, np.sqrt(np.clip(1 - leaf, 0, 1)) * 1.4)
    hgt = np.maximum(hgt, orn)
    metal_m = (d < bw) | rule | (orn > 0.02)
    hs = ndimage.gaussian_filter(hgt * ss, ss * 0.45)
    n = normals(hs, 1.0)
    metal = _antique(n, rng, (SH, SW), ss, spec=0.5, lift=0.0, k=0.9)
    col = np.where(metal_m[..., None], metal, lac)

    moon = Image.open(os.path.join(OUT, "medal-moon.webp")).convert("RGBA")
    mw = int(W * 0.78 * ss)
    mh = int(moon.height * mw / moon.width)
    moon = moon.resize((mw, mh), Image.LANCZOS)
    ma = np.asarray(moon, np.float32)
    mx, my = int(SW / 2 - mw / 2), int(SH / 2 - mh / 2 - 2 * ss)
    bloom = np.exp(-(((xx - W / 2) / (W * 0.34)) ** 2 + ((yy - (H / 2 - 2)) / (H * 0.22)) ** 2))
    col = col + (bloom * (~metal_m))[..., None] * np.array([70, 44, 40], np.float32) * 0.55
    sub = col[my:my + mh, mx:mx + mw]
    a = ma[..., 3:4] / 255.0
    col[my:my + mh, mx:mx + mw] = sub * (1 - a) + ma[..., :3] * 1.02 * a

    sheen = np.exp(-(((xx * 0.8 + yy * 0.6) - H * 0.34) / (H * 0.1)) ** 2) * 0.18
    col = col + sheen[..., None] * np.array([255, 230, 200], np.float32) * (1 - 0.5 * metal_m[..., None])
    edge = smooth(0.0, 0.9, d)
    col = col * edge[..., None] + INK * (1 - edge[..., None])
    m0 = np.abs(d - bw) < 0.5
    col = np.where(m0[..., None], col * 0.4 + INK * 0.6, col)
    alpha = smooth(0.0, 0.5, d)
    out = _rgba(down(col, ss), down(alpha, ss))
    save(out, "deck-back.webp", 92)
    return out


TRAY_W, TRAY_H = 150, 196


def tray_layers():
    """-> (rgba float array TRAY_H x TRAY_W x 4, bed box (x0, y0, x1, y1))."""
    rng = np.random.default_rng(4404)
    W, H, ss = TRAY_W, TRAY_H, 3
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    outer = _rrect_mask(W, H, 3, 3, W - 3, H - 3, 16, ss) > 0.5
    d = ndimage.distance_transform_edt(outer) / ss
    rimw = 10.0
    b0, b1 = 11.2, 14.0
    hgt = np.where(d < rimw, _rod(d, rimw) * 7.0, 0)
    per = np.arctan2(yy - H / 2, xx - W / 2)
    gad = 0.5 + 0.5 * np.cos(per * 44)
    hgt = np.where(d < rimw, hgt * (0.84 + 0.16 * gad), hgt)
    wire = (d >= b0) & (d < b1)
    hgt = np.where(wire, _rod(d - b0, b1 - b0) * 2.6, hgt)
    for bx, by in ((12, 12), (W - 12, 12), (12, H - 12), (W - 12, H - 12)):
        rd = np.hypot(xx - bx, yy - by)
        hgt = np.where(rd < 6.2, np.maximum(hgt, 6.0 + np.sqrt(np.clip(1 - (rd / 6.2) ** 2, 0, 1)) * 4.0), hgt)
    solid = (d < rimw) | wire
    for bx, by in ((12, 12), (W - 12, 12), (12, H - 12), (W - 12, H - 12)):
        solid |= np.hypot(xx - bx, yy - by) < 6.2
    hs = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hs, 1.0)
    metal = _antique(n, rng, (SH, SW), ss, spec=0.55, lift=0.0, k=0.9)
    bed = ramp(np.clip(0.4 + noise((SH, SW), rng, ss * 1.2) * 0.25, 0, 1), [(0, "#0a060e"), (0.5, "#170e20"), (1, "#24172f")])
    sh = 1 - 0.75 * (1 - smooth(b1, b1 + 16, d)) * np.clip(0.55 + (H / 2 - yy) / H, 0.3, 1.0)
    bed = bed * sh[..., None]
    col = np.where(solid[..., None], metal, bed)
    edge = smooth(0.0, 0.8, d)
    col = col * edge[..., None] + INK * (1 - edge[..., None])
    for cut in (rimw, b1):
        mm = np.abs(d - cut) < 0.5
        col = np.where(mm[..., None], INK, col)
    alpha = smooth(0.0, 0.5, d)
    arr = np.dstack([down(col, ss), down(alpha, ss)])
    return arr, (b1 + 2, b1 + 2, W - b1 - 2, H - b1 - 2)


def _paste_card(base, card_im, cx, cy, ang, shadow=0.75, alpha_k=1.0):
    """Composite a PIL RGBA card onto float RGBA `base` (0..255 colour, 0..1 alpha) with a soft shadow."""
    im = card_im.rotate(ang, resample=Image.BICUBIC, expand=True)
    if alpha_k < 1.0:
        a = im.getchannel("A").point(lambda v: int(v * alpha_k))
        im.putalpha(a)
    w, h = im.size
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    H, W = base.shape[:2]
    sa = np.zeros((H, W), np.float32)
    ca = np.asarray(im.getchannel("A"), np.float32) / 255.0
    sx0, sy0 = x0 + 2, y0 + 3
    ys0, xs0 = max(0, sy0), max(0, sx0)
    ys1, xs1 = min(H, sy0 + h), min(W, sx0 + w)
    sa[ys0:ys1, xs0:xs1] = ca[ys0 - sy0:ys1 - sy0, xs0 - sx0:xs1 - sx0]
    sa = ndimage.gaussian_filter(sa, 2.2) * shadow
    base[..., :3] *= (1 - sa[..., None] * 0.85)
    base[..., 3] = np.maximum(base[..., 3], sa * 0.6)
    arr = np.asarray(im, np.float32)
    ys0, xs0 = max(0, y0), max(0, x0)
    ys1, xs1 = min(H, y0 + h), min(W, x0 + w)
    sub = arr[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
    a = sub[..., 3:4] / 255.0
    base[ys0:ys1, xs0:xs1, :3] = base[ys0:ys1, xs0:xs1, :3] * (1 - a) + sub[..., :3] * a
    base[ys0:ys1, xs0:xs1, 3] = base[ys0:ys1, xs0:xs1, 3] + a[..., 0] * (1 - base[ys0:ys1, xs0:xs1, 3])


def decks():
    back = deck_back()
    back_im = Image.fromarray(np.clip(back, 0, 255).astype(np.uint8))
    tray, (bx0, by0, bx1, by1) = tray_layers()
    bw, bh = bx1 - bx0, by1 - by0
    cw = int(bw * 0.9)
    chh = int(cw * BACK_H / BACK_W)
    if chh > bh * 0.96:
        chh = int(bh * 0.96)
        cw = int(chh * BACK_W / BACK_H)
    card = back_im.resize((cw, chh), Image.LANCZOS)
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2

    # DRAW: a squared-up deck, five backs deep, each a step up and to the left
    # of the one under it, so the stack's own gilt edges show along its foot
    base = tray.astype(np.float32).copy()
    deck = card.resize((int(cw * 0.94), int(chh * 0.94)), Image.LANCZOS)
    dw, dh = deck.size
    edge = Image.new("RGBA", (dw, dh), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle([0, 0, dw - 1, dh - 1], radius=int(dw * 0.07), fill=(255, 255, 255, 255))
    ea = np.asarray(edge, np.float32)
    gy = np.linspace(0, 1, dh)[:, None] * np.ones((1, dw))
    gold = ramp(np.clip(0.75 - gy * 0.35, 0, 1), [(0, "#4a3214"), (0.5, "#a37d42"), (1, "#e4c586")])
    ea = np.dstack([gold, ea[..., 3]])
    din = ndimage.distance_transform_edt(ea[..., 3] > 128)
    ea[..., :3] *= np.clip(din / 1.6, 0.25, 1)[..., None]
    edge_im = Image.fromarray(np.clip(ea, 0, 255).astype(np.uint8))
    n = 5
    for i in range(n):
        k = n - 1 - i
        im = deck if k == 0 else edge_im
        _paste_card(base, im, cx + k * 1.9 - 3.6, cy + k * 2.5 - 4.6, 0.0, shadow=0.35 if k else 0.9)
    save(np.dstack([base[..., :3], base[..., 3] * 255]), "deck-draw.webp", 92)

    # DISCARD: thrown in, each at its own angle
    base = tray.astype(np.float32).copy()
    for ang, dx, dy in ((-9.0, -3, 3), (7.0, 3, 1), (-2.5, 0, -1)):
        _paste_card(base, card, cx + dx, cy + dy, ang)
    save(np.dstack([base[..., :3], base[..., 3] * 255]), "deck-discard.webp", 92)

    # TORN: the top back ripped across, its upper half lifted and turned
    base = tray.astype(np.float32).copy()
    _paste_card(base, card, cx + 2, cy + 3, -4.0)
    tw, th_ = card.size
    rip = Image.new("L", (tw, th_), 0)
    pts = [(0, 0), (tw, 0), (tw, int(th_ * 0.52))]
    rng = np.random.default_rng(7)
    for i in range(12, -1, -1):
        pts.append((int(tw * i / 12), int(th_ * (0.47 + rng.uniform(-0.05, 0.05)))))
    ImageDraw.Draw(rip).polygon(pts, fill=255)
    top = card.copy()
    top.putalpha(Image.fromarray(np.minimum(np.asarray(card.getchannel("A")), np.asarray(rip))))
    bot = card.copy()
    bot.putalpha(Image.fromarray(np.minimum(np.asarray(card.getchannel("A")), 255 - np.asarray(rip))))
    _paste_card(base, bot, cx, cy + 2, 1.5)
    _paste_card(base, top, cx - 5, cy - 9, -11.0)
    save(np.dstack([base[..., :3], base[..., 3] * 255]), "deck-torn.webp", 92)

    # VANISHED: two backs faded almost to nothing, a lavender ghost-light on the bed
    base = tray.astype(np.float32).copy()
    ghost = card.copy()
    gl = np.asarray(ghost, np.float32)
    lum = gl[..., :3].mean(axis=2, keepdims=True)
    tint = lum * np.array([0.9, 0.85, 1.25]) + np.array([30, 20, 50])
    ghost = Image.fromarray(np.dstack([np.clip(tint, 0, 255), gl[..., 3:4]]).astype(np.uint8))
    _paste_card(base, ghost, cx + 2, cy + 2, 0.0, shadow=0.3, alpha_k=0.35)
    _paste_card(base, ghost, cx, cy, 0.0, shadow=0.2, alpha_k=0.5)
    save(np.dstack([base[..., :3], base[..., 3] * 255]), "deck-vanished.webp", 92)


# ── the walnut shelf on its iron bracket (GARNET's) ───────────────────────────
SHELF_W, SHELF_H = 260, 116


def _bezier(p0, p1, p2, p3, n=60):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.array(p, np.float32) for p in (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def _spiral(cx, cy, r0, r1, a0, turns, n=90, sign=1):
    t = np.linspace(0, 1, n)
    a = a0 + sign * t * turns * 2 * np.pi
    rr = r0 + (r1 - r0) * t
    return np.stack([cx + rr * np.cos(a), cy + rr * np.sin(a)], axis=1)


def shelf_iron():
    """260x116 RGBA. The shelf runs the full width (its top 10..17, its moulded
    front 17..30); the iron hangs under its right 100 px from a strap on the
    RIGHT edge, the wall it is fixed to, and never under the left 160, which a
    3-slice stretches as the shelf lengthens."""
    rng = np.random.default_rng(4405)
    W, H, ss = SHELF_W, SHELF_H, 3
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss

    hgt = np.zeros((SH, SW), np.float32)
    iron = np.zeros((SH, SW), bool)
    wall_x = W - 9.0
    shelf_y1 = 30.0
    foot = H - 14.0

    def _section(px, py, r):
        x0, x1 = int(max(0, (px - r - 1) * ss)), int(min(SW, (px + r + 1) * ss))
        y0, y1 = int(max(0, (py - r - 1) * ss)), int(min(SH, (py + r + 1) * ss))
        if x1 <= x0 or y1 <= y0:
            return
        X = np.arange(x0, x1, dtype=np.float32) / ss
        Y = np.arange(y0, y1, dtype=np.float32) / ss
        dd = np.hypot(X[None, :] - px, Y[:, None] - py)
        h = np.sqrt(np.clip(r * r - dd * dd, 0, None))
        np.maximum(hgt[y0:y1, x0:x1], h, out=hgt[y0:y1, x0:x1])
        iron[y0:y1, x0:x1] |= dd < r

    def tube(pts, r0, r1=None, ball=0.0):
        pts = np.asarray(pts, np.float32)
        r1 = r0 if r1 is None else r1
        seg = np.hypot(*np.diff(pts, axis=0).T)
        L = float(seg.sum())
        m = max(2, int(L * ss * 1.2))
        cum = np.concatenate([[0], np.cumsum(seg)])
        tt = np.linspace(0, L, m)
        xs = np.interp(tt, cum, pts[:, 0])
        ys = np.interp(tt, cum, pts[:, 1])
        rs = r0 + (r1 - r0) * (tt / max(L, 1e-6))
        for px, py, r in zip(xs, ys, rs):
            _section(px, py, r)
        if ball:
            _section(xs[-1], ys[-1], ball)

    tube([[wall_x, shelf_y1 - 3], [wall_x, H - 12]], 3.6)
    tube([[wall_x, H - 12], [wall_x, H - 4.5]], 3.0, 0.4)
    reach = W - 98.0
    tube([[reach - 2, shelf_y1 + 3.2], [wall_x, shelf_y1 + 3.2]], 2.5)
    br = _bezier((wall_x - 2, foot), (wall_x - 34, foot - 2), (reach + 22, shelf_y1 + 44), (reach, shelf_y1 + 5), n=80)
    tube(br, 3.2, 2.3)
    tube(_spiral(reach, shelf_y1 + 11, 6.0, 1.8, -math.pi * 0.5, 0.85, n=40, sign=-1), 2.1, 1.3, ball=2.4)
    tube(_spiral(W - 44, shelf_y1 + 27, 15.0, 3.8, -math.pi * 0.58, 0.92, n=90, sign=-1), 2.2, 1.35, ball=2.5)
    tube(_spiral(wall_x - 14, shelf_y1 + 15, 8.0, 2.4, math.pi * 0.62, 0.9, n=60, sign=1), 1.8, 1.15, ball=2.0)
    for bx, by in ((wall_x - 1.5, foot), (reach, shelf_y1 + 4.5)):
        tube([[bx, by - 3.6], [bx, by + 3.6]], 3.9)
    hgt = np.where(iron, hgt - np.abs(noise((SH, SW), rng, ss * 1.1)) * 0.45, hgt)
    for ry in (shelf_y1 + 17, foot - 22):
        rd = np.hypot(xx - wall_x, yy - ry)
        hgt = np.where(rd < 2.6, np.maximum(hgt, 3.4 + np.sqrt(np.clip(1 - (rd / 2.6) ** 2, 0, 1)) * 1.8), hgt)
    hs = ndimage.gaussian_filter(hgt * ss, ss * 0.45)
    n = normals(hs, 1.0)
    v = lambert(n)
    sp = specular(n, power=9.0)
    base = ramp(np.clip(v * 0.95, 0, 1), [(0.0, "#050405"), (0.45, "#131013"), (0.8, "#2c2528"), (1.0, "#4d4340")])
    base = base * (1 + noise((SH, SW), rng, ss * 1.6)[..., None] * 0.18)
    warm = np.exp(-(((xx - (W - 40)) / 70.0) ** 2 + ((yy - shelf_y1) / 52.0) ** 2))
    up = np.clip(-n[..., 1], 0, 1) ** 1.3
    col = (base
           + sp[..., None] * np.array([120, 104, 96], np.float32) * 0.35
           + (up * warm)[..., None] * np.array([196, 120, 52], np.float32) * 0.62)
    din = ndimage.distance_transform_edt(iron) / ss
    col = col * smooth(0.0, 0.7, din)[..., None] + INK * 0.4 * (1 - smooth(0.0, 0.7, din)[..., None])
    alpha = smooth(0.0, 0.5, din)

    sx0, sx1 = 6.0, float(W - 4)
    top0 = 10.0
    fr0, fr1 = 17.0, shelf_y1
    shelf = (xx >= sx0) & (xx <= sx1) & (yy >= top0) & (yy < fr1)
    wood = wood_albedo(SH, SW, rng, base="#3a2518", light="#5c3d28", dark="#1c120b", scale=0.5)
    prof = moulding((yy - fr0) * np.ones_like(xx), [(0, 3.2, "bead", 2.6), (3.2, 5.0, "fillet", 1.8), (5.0, 13, "ogee", 2.8)])
    sh_h = np.where(yy < fr0, 3.0, prof)
    sn = normals(ndimage.gaussian_filter(sh_h * ss, ss * 0.5), 1.0)
    lv = lambert(sn)
    wood_col = wood * (0.5 + 0.75 * lv[..., None])
    topm = yy < fr0
    wood_col = np.where(topm[..., None], wood * (0.95 + 0.6 * warm[..., None]) + np.array([30, 18, 8], np.float32) * warm[..., None], wood_col)
    nos = (yy >= fr0) & (yy < fr0 + 3.2)
    brass_col = _antique(sn, rng, (SH, SW), ss, spec=0.5, lift=0.05, k=0.88)
    wood_col = np.where(nos[..., None], brass_col, wood_col)
    endg = (xx < sx0 + 2.2) | (xx > sx1 - 2.2)
    wood_col = np.where(endg[..., None], wood_col * 0.55, wood_col)
    col = np.where(shelf[..., None], wood_col, col)
    alpha = np.where(shelf, 1.0, alpha)
    under = (yy >= fr1) & (yy < fr1 + 6)
    col = np.where((under & iron)[..., None], col * (0.35 + 0.65 * smooth(fr1, fr1 + 6, yy))[..., None], col)
    shd = ndimage.distance_transform_edt(shelf) / ss
    ink_m = shelf & (shd < 0.8)
    col = np.where(ink_m[..., None], col * 0.3 + INK * 0.7, col)
    save(_rgba(down(col, ss), down(alpha, ss)), "shelf-iron.webp", 92)


# ── END TURN's sand glass (GARNET's) ──────────────────────────────────────────
def hourglass_glass():
    """96x132: a small brass-framed sand glass. Turned end plates and two turned
    pillars; two glass bulbs pinched at the waist, the glass dark and clear with
    the board light in a streak down each bulb; warm sand heaped in the lower
    bulb, a little left in the upper one and a thread of it falling between."""
    rng = np.random.default_rng(4411)
    W, H, ss = 96, 132, 4
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    cx = W / 2
    p0, p1 = (6.0, 19.0), (113.0, 126.0)
    g0, g1 = p0[1], p1[0]
    waist = (g0 + g1) / 2

    def half_w(y):
        t = np.abs(y - waist) / (waist - g0)
        bulb = 3.0 + 25.0 * np.sin(np.pi * np.clip(t, 0, 1) * 0.92) ** 0.75
        return np.where(t > 0.9, np.minimum(bulb, 12.0 + 40 * (1 - t)), bulb)
    hw = half_w(yy)
    glass = (yy >= g0) & (yy <= g1) & (np.abs(xx - cx) <= hw)

    hgt = np.zeros((SH, SW), np.float32)
    brass_m = np.zeros((SH, SW), bool)
    for (y0, y1) in (p0, p1):
        m = (yy >= y0) & (yy <= y1) & (np.abs(xx - cx) <= 40)
        t = (yy - y0) / (y1 - y0)
        prof = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * 3.2 + np.exp(-((t - 0.5) / 0.12) ** 2) * 0.8
        ends = np.clip((40 - np.abs(xx - cx)) / 3.0, 0, 1)
        hgt = np.where(m, np.maximum(hgt, prof * ends), hgt)
        brass_m |= m & (ends > 0.02)
        ky = y0 - 3.2 if y0 < waist else y1 + 3.2
        kd = np.hypot((xx - cx) / 6.0, (yy - ky) / 3.4)
        hgt = np.where(kd < 1, np.maximum(hgt, np.sqrt(np.clip(1 - kd ** 2, 0, 1)) * 2.8), hgt)
        brass_m |= kd < 1
    for px in (cx - 33, cx + 33):
        m = (yy >= p0[1] - 1) & (yy <= p1[0] + 1)
        tt = (yy - p0[1]) / (p1[0] - p0[1])
        r = 2.6 + 1.2 * np.exp(-((tt - 0.5) / 0.05) ** 2) + 1.0 * np.exp(-((tt - 0.12) / 0.04) ** 2) + 1.0 * np.exp(-((tt - 0.88) / 0.04) ** 2)
        d = np.abs(xx - px)
        mm = m & (d < r)
        hgt = np.where(mm, np.maximum(hgt, np.sqrt(np.clip(r * r - d * d, 0, None)) * 0.9), hgt)
        brass_m |= mm
    hs = ndimage.gaussian_filter(hgt * ss, ss * 0.45)
    n = normals(hs, 1.0)
    metal = _antique(n, rng, (SH, SW), ss, spec=0.7, lift=0.08, k=0.95)

    heap_top = g1 - 26 + 6 * (np.abs(xx - cx) / 26.0) ** 1.4
    lower_sand = glass & (yy > waist + 8) & (yy >= heap_top)
    upper_sand = glass & (yy < waist) & (yy >= waist - 16 + 7 * np.clip(1 - np.abs(xx - cx) / 16.0, 0, 1))
    thread = (np.abs(xx - cx) < 0.7) & (yy >= waist) & (yy < waist + 22)
    sand_m = lower_sand | upper_sand | thread
    grain = noise((SH, SW), rng, ss * 0.5) * 0.12 + noise((SH, SW), rng, ss * 2) * 0.08
    sand_t = np.clip(0.62 - (yy - waist) / 80.0 + grain, 0, 1)
    sand = ramp(sand_t, [(0, "#6a3f14"), (0.5, "#c28a45"), (1, "#f0c983")])

    ex = (xx - cx) / np.maximum(hw, 1e-3)
    streak = np.exp(-((ex + 0.52) / 0.13) ** 2) * (np.abs(yy - waist) > 6)
    rim = np.exp(-((np.abs(ex) - 0.93) / 0.05) ** 2)
    glass_col = np.array([34, 24, 48], np.float32) * np.ones((SH, SW, 1), np.float32)
    glass_col = glass_col + streak[..., None] * np.array([255, 246, 232], np.float32) * 0.85 + rim[..., None] * np.array([200, 180, 220], np.float32) * 0.45
    glass_a = np.clip(0.22 + streak * 0.7 + rim * 0.45, 0, 1)
    col = np.zeros((SH, SW, 3), np.float32)
    alpha = np.zeros((SH, SW), np.float32)
    col = np.where(glass[..., None], glass_col, col)
    alpha = np.where(glass, glass_a, alpha)
    col = np.where(sand_m[..., None], sand * (0.75 + 0.5 * np.clip(-ex * 0.5 + 0.5, 0, 1))[..., None] + streak[..., None] * 60, col)
    alpha = np.where(sand_m, 1.0, alpha)
    col = np.where(brass_m[..., None], metal, col)
    alpha = np.where(brass_m, 1.0, alpha)
    sil = brass_m | glass
    din = ndimage.distance_transform_edt(sil) / ss
    edge = smooth(0.0, 0.8, din)
    col = col * edge[..., None] + INK * (1 - edge[..., None])
    alpha = np.where(sil & (din < 0.8), 1.0, alpha) * smooth(0.0, 0.45, din)
    save(_rgba(down(col, ss), down(alpha, ss)), "hourglass-glass.webp", 94)


# ── the boss plate's crest: a crescent medallion (GARNET's) ──────────────────
def _over(dst_rgb, dst_a, src_rgb, src_a, shadow=0.0, off=(2, 3), blur=2.0):
    if shadow:
        sa = ndimage.shift(src_a, (off[1], off[0]), order=1)
        sa = ndimage.gaussian_filter(sa, blur) * shadow
        dst_rgb = dst_rgb * (1 - (sa * dst_a)[..., None] * 0.8)
    a = src_a[..., None]
    rgb = src_rgb * a + dst_rgb * (1 - a)
    al = src_a + dst_a * (1 - src_a)
    return rgb, al


def boss_crescent():
    """150x150: a round crest (a brass ring, a bead wire, aubergine enamel, a
    gold crescent in relief) whose centre is 100 px down, with the wordmark's
    fleur-de-lis (cart-crest.webp) rising from its top behind the ring."""
    rng = np.random.default_rng(4408)
    W, H, ss = 150, 150, 3
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    cx, cy, R = W / 2, 100.0, 46.0
    r = np.hypot(xx - cx, yy - cy)
    th = np.arctan2(yy - cy, xx - cx)
    inside = r <= R
    d = np.clip(R - r, 0, None)
    rimw = 10.0
    hgt = np.where(d < rimw, _rod(d, rimw) * 6.0, 0)
    beads = (d >= rimw) & (d < rimw + 4.2)
    nb = 30
    k = np.round(th / (2 * np.pi / nb)) * (2 * np.pi / nb)
    br = R - rimw - 2.1
    bd = np.hypot(xx - (cx + br * np.cos(k)), yy - (cy + br * np.sin(k)))
    hgt = np.where(beads & (bd < 1.9), np.sqrt(np.clip(1 - (bd / 1.9) ** 2, 0, 1)) * 2.0 + 0.5, hgt)
    field = inside & (d >= rimw + 4.2)
    m1 = np.hypot(xx - (cx - 3.5), yy - (cy + 1)) < 21
    m2 = np.hypot(xx - (cx + 7.5), yy - (cy - 5)) < 18.5
    cres = m1 & ~m2
    dc = ndimage.distance_transform_edt(cres) / ss
    hgt = np.where(cres, 1.0 + np.clip(dc / 2.5, 0, 1) * 2.4, hgt)
    hs = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hs, 1.0)
    metal = _antique(n, rng, (SH, SW), ss, spec=0.65, lift=0.04, k=0.94)
    en = ramp(np.clip(1 - (yy - (cy - R)) / (2 * R), 0, 1), [(0, "#120a1c"), (0.6, "#2c1844"), (1, "#452a66")])
    gl = np.exp(-(((xx - (cx - 12)) / 16) ** 2 + ((yy - (cy - 17)) / 9) ** 2)) * 0.5
    en = en + gl[..., None] * np.array([170, 140, 220], np.float32)
    col = np.where((field & ~cres)[..., None], en, metal)
    col = np.where((beads & ~(bd < 1.9))[..., None], en * 0.6, col)
    din = ndimage.distance_transform_edt(inside) / ss
    col = col * smooth(0.0, 0.8, din)[..., None] + INK * (1 - smooth(0.0, 0.8, din)[..., None])
    mm = np.abs(d - rimw) < 0.5
    col = np.where(mm[..., None], INK, col)
    ce = ndimage.distance_transform_edt(cres) / ss
    col = np.where((cres & (ce < 0.7))[..., None], col * 0.4 + INK * 0.6, col)
    alpha = smooth(0.0, 0.55, din)
    rgb = down(col, ss)
    al = down(alpha, ss)
    fl = Image.open(os.path.join(OUT, "cart-crest.webp")).convert("RGBA")
    fw = 96
    fh = int(fl.height * fw / fl.width)
    fl = fl.resize((fw, fh), Image.LANCZOS)
    arr = np.asarray(fl, np.float32)
    fa = np.zeros((H, W), np.float32)
    fc = np.zeros((H, W, 3), np.float32)
    x0 = int(cx - fw / 2)
    y0 = max(0, int(cy - R - fh + 26))
    fa[y0:y0 + fh, x0:x0 + fw] = arr[..., 3] / 255.0
    fc[y0:y0 + fh, x0:x0 + fw] = arr[..., :3] * 1.08
    rgb2, al2 = _over(fc, fa, rgb, al, shadow=0.7, off=(0, 2), blur=1.6)
    save(_rgba(rgb2, al2), "boss-crescent.webp", 93)


# ── the painted mirror (new) ──────────────────────────────────────────────────
MIR_BOX = (318, 228, 682, 850)     # selectKid.png: the mirror, down to its lower scrolls (FLINT's cut)
# the crown medallion in the crop, measured off the painting: its centre, the
# enamel's radius and the rail's outer radius. (boss-alcove.webp laid its
# enamel at (183, 62) r 34, six pixels high and four short of the rail, and the
# room showed through the two crescents it left.)
MIR_RING = (181.5, 68.0, 38.5, 48.0)
MIR_STRETCH = 1.2                  # the frame a fifth wider than the Kid's, as boss-alcove.webp
MIR_RING_K = 1.2                   # the medallion, set back ROUND and this much larger
MIR_PAD = 14                       # rows over the crop's top, for the larger medallion's finial
MIR_TOP, MIR_BOT = 205 + MIR_PAD, 150   # the 3-slice: the crown's rows, the foot's rows


def _frame_cut():
    """FLINT's key of the mirror off the Kid board (tools/prep_combat_regalia.py
    boss_alcove), unstretched: -> (rgb, alpha, body mask) over the crop."""
    src = np.asarray(Image.open(os.path.join(UI, "selectKid.png")).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = MIR_BOX
    rgb = src[y0:y1, x0:x1].copy()
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(axis=2)
    gold = (r > 22) & (r > b * 1.08) & (g > b * .86) & (lum > 13)
    gold = ndimage.binary_opening(gold, iterations=1)
    body = ndimage.binary_closing(gold, iterations=2)
    body = body | ndimage.binary_closing(gold, structure=np.ones((9, 3), bool))
    keep = ndimage.binary_dilation(body, iterations=1)
    a = np.clip((lum - 10) / 22, 0, 1) * keep
    a = np.maximum(a, ndimage.gaussian_filter(body.astype(np.float32), 0.6) * 0.95)
    mx = MIR_RING[0]
    # the board's own rails at the crop's edges, its panel's corner, the skull
    # and the candle standing beside the mirror's foot
    a = np.where((xx < 13) | (yy < 4) | ((yy < 18) & (np.abs(xx - mx) > 13)) | ((xx < 62) & (yy < 62)), 0, a)
    a = a * (1 - smooth(-6, 6, np.minimum(78 - xx, yy - 584))) * (1 - smooth(-6, 6, np.minimum(xx - 282, yy - 596)))
    return rgb, a, body


def _unmix(rgb, a):
    au = np.clip(a, 1e-3, 1)[..., None]
    col = np.clip((rgb - (1 - au) * np.array([8, 6, 11], np.float32)) / au, 0, 255)
    return np.where((a < 0.35)[..., None], np.minimum(col, rgb * 1.6), col)


def _smoothstep_arr(e0, e1, x):
    t = np.clip((x - e0) / np.maximum(e1 - e0, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def boss_mirror():
    rng = np.random.default_rng(5501)
    rgb, a, body = _frame_cut()
    h, w = a.shape
    col = _unmix(rgb, a) * 1.08
    mx, my, er, orr = MIR_RING
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dmed = np.hypot(xx - mx, yy - my)

    # ── the crown medallion, lifted out whole: its rail, the finial on its
    # crown and the drop at its foot, its enamel filled to under the rail ──
    ring_m = dmed <= orr + 1.5
    ring_m |= (np.abs(xx - mx) <= 12) & (yy >= 7) & (yy <= my - orr + 3)
    ring_m |= (np.abs(xx - mx) <= 9) & (yy >= my + orr - 3) & (yy <= my + orr + 15)
    btn = np.asarray(Image.open(os.path.join(OUT, "button.webp")).convert("RGBA")).astype(np.float32)
    ER = er + 1.2
    kk = 38.0 / ER                                  # button.webp's enamel is r 38 of its 112
    bh, bw = btn.shape[:2]
    sx = np.clip(((xx - mx) * kk + bw / 2), 0, bw - 1)
    sy = np.clip(((yy - my) * kk + bh / 2), 0, bh - 1)
    enamel = np.dstack([ndimage.map_coordinates(btn[..., c], [sy, sx], order=1) for c in range(3)])
    disc = dmed < ER + 0.5
    edge_d = smooth(ER - 1.6, ER + 0.5, dmed)
    ring_col = np.where(disc[..., None], enamel * (1 - edge_d[..., None]) + col * edge_d[..., None], col)
    ring_a = np.where(ring_m, a, 0.0)
    # the finial and the drop are keyed to their gilt alone: the panel between
    # them and the scrolls is the room's to show, not a dark tab behind them
    lugs = ring_m & (dmed > orr + 1.5)
    lum = rgb.mean(axis=2)
    gilt = np.clip((lum - 16) / 26, 0, 1) * np.clip((rgb[..., 0] - rgb[..., 2]) / 10, 0, 1)
    ring_a = np.where(lugs, np.minimum(a, ndimage.gaussian_filter(gilt, 0.6)), ring_a)
    ring_a = np.where(disc, np.maximum(ring_a, 1 - edge_d), ring_a)

    # ── the frame, the medallion taken off it (it goes back on larger) ──
    gone = ndimage.binary_dilation(ring_m, iterations=1)
    frame_a = a * (1 - gone.astype(np.float32))
    frame_a = np.minimum(frame_a, a * np.clip(ndimage.gaussian_filter((~gone).astype(np.float32), 0.8), 0, 1))

    # ── the glass, painted in the crop's own space (it is stretched with the
    # frame, so every width here is a sixth narrower than it will read) ──
    inner = ~ndimage.binary_dilation(body, iterations=2)
    inner &= ~(dmed <= orr + 2)                     # never up into the medallion
    lab, _ = ndimage.label(inner)
    seed = lab[int(h * 0.55), w // 2]
    glass = (lab == seed) if seed else np.zeros_like(inner)
    d_in = ndimage.gaussian_filter(ndimage.distance_transform_edt(glass).astype(np.float32), 1.1)
    Y, X = yy, xx
    cxg = w / 2
    t = np.clip(Y / h, 0, 1)
    base = ramp(t, [(0.0, "#2a2638"), (0.3, "#211d2e"), (0.7, "#191522"), (1.0, "#110e18")])
    # old silvering: a soft mottle, taller than wide so the 3-slice's squash rounds it
    mott = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (9.0, 3.8))
    mott /= np.abs(mott).max() + 1e-6
    base = base * (1 + mott[..., None] * 0.1)
    # the sheen: a broad cold band down from the upper left, a fine streak beside it
    xc = cxg - 58 + (Y - 120) * 0.133
    band = np.exp(-((X - xc) / 28.0) ** 2) * smooth(120, 260, Y) * (1 - 0.55 * smooth(380, 560, Y))
    streak = np.exp(-((X - (xc + 43)) / 4.6) ** 2) * smooth(150, 300, Y) * (1 - 0.7 * smooth(360, 540, Y))
    cold = np.array([168, 178, 214], np.float32)
    col_g = base + (band * 0.2 + streak * 0.13)[..., None] * cold
    # a breath of the two sconces' candlelight caught at his shoulders' height
    for sxw in (15.0, w - 15.0):
        warm = np.exp(-(((X - sxw) / 38.0) ** 2 + ((Y - 250) / 120.0) ** 2))
        col_g = col_g + warm[..., None] * np.array([150, 92, 44], np.float32) * 0.22
    # tarnish creeping in from the rails: darker, browner, mottled
    tn = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (5.0, 2.2))
    tn /= np.abs(tn).max() + 1e-6
    creep = 1 - _smoothstep_arr(3.5, 26 + tn * 10, d_in)
    col_g = col_g * (1 - 0.5 * creep[..., None]) + creep[..., None] * np.array([34, 22, 14], np.float32) * 0.4
    # foxing: small dark blooms of lost silver near the rails
    fox = ndimage.gaussian_filter((rng.random((h, w)) > 0.9965).astype(np.float32), (2.4, 1.1))
    fox = np.clip(fox / (fox.max() + 1e-6) * 1.6, 0, 1) * (1 - smooth(10, 52, d_in))
    col_g = col_g * (1 - 0.45 * fox[..., None])
    # the bevel: the glass's cut edge catching light just inside the rails,
    # brighter along the upper left, which faces the boards' light
    lit = np.clip(0.55 - (X - cxg) / w * 0.9 - (Y / h) * 0.35, 0.1, 1)
    bevel = np.exp(-((d_in - 2.9) / 1.15) ** 2) * lit
    col_g = col_g + bevel[..., None] * np.array([230, 222, 236], np.float32) * 0.34
    alpha_g = np.clip(0.9 + 0.1 * creep, 0, 1) * smooth(0.2, 1.6, d_in) * glass

    # the frame over the glass
    out_a = frame_a + alpha_g * (1 - frame_a)
    out_col = (col * frame_a[..., None] + col_g * (alpha_g * (1 - frame_a))[..., None]) / np.maximum(out_a, 1e-4)[..., None]

    # ── stretched a fifth wider, and the top padded for the finial ──
    W2 = int(round(w * MIR_STRETCH))
    H2 = h + MIR_PAD
    im = Image.fromarray(np.clip(_rgba(out_col, out_a), 0, 255).astype(np.uint8), "RGBA").resize((W2, h), Image.LANCZOS)
    canvas = np.zeros((H2, W2, 4), np.float32)
    canvas[MIR_PAD:] = np.asarray(im).astype(np.float32)
    out_col, out_a = canvas[..., :3], canvas[..., 3] / 255.0

    # ── the medallion back on: round, a size larger, on its own centre ──
    k = MIR_RING_K
    cx2, cy2 = mx * MIR_STRETCH, my + MIR_PAD
    pad = orr + 22
    y_a, y_b = int(max(0, my - pad)), int(min(h, my + pad))
    x_a, x_b = int(max(0, mx - pad)), int(min(w, mx + pad))
    sub = Image.fromarray(np.clip(_rgba(ring_col, ring_a)[y_a:y_b, x_a:x_b], 0, 255).astype(np.uint8), "RGBA")
    sub = sub.resize((int(round(sub.width * k)), int(round(sub.height * k))), Image.LANCZOS)
    sa = np.asarray(sub).astype(np.float32)
    px0 = int(round(cx2 - (mx - x_a) * k))
    py0 = int(round(cy2 - (my - y_a) * k))
    ys0, xs0 = max(0, py0), max(0, px0)
    ys1, xs1 = min(H2, py0 + sa.shape[0]), min(W2, px0 + sa.shape[1])
    s = sa[ys0 - py0:ys1 - py0, xs0 - px0:xs1 - px0]
    s_a = s[..., 3] / 255.0
    # its shadow on the frame and the glass under it
    sh = np.zeros((H2, W2), np.float32)
    sh[ys0:ys1, xs0:xs1] = s_a
    sh = ndimage.gaussian_filter(ndimage.shift(sh, (3, 2), order=1), 2.4) * 0.55
    out_col = out_col * (1 - (sh * out_a)[..., None] * 0.7)
    reg_c = out_col[ys0:ys1, xs0:xs1].copy()
    reg_a = out_a[ys0:ys1, xs0:xs1].copy()
    new_a = s_a + reg_a * (1 - s_a)
    out_col[ys0:ys1, xs0:xs1] = (s[..., :3] * s_a[..., None] + reg_c * (reg_a * (1 - s_a))[..., None]) / np.maximum(new_a, 1e-4)[..., None]
    out_a[ys0:ys1, xs0:xs1] = new_a

    # the foot fades where his plate stands (FLINT's)
    Yf = np.arange(H2, dtype=np.float32)[:, None]
    out_a = out_a * np.clip((H2 - 8 - Yf) / 64, 0, 1) ** 1.2
    save(_rgba(out_col, out_a), "boss-mirror.webp", 90)
    print(f"      boss-mirror: {W2}x{H2}, medallion centre ({cx2:.1f}, {cy2:.1f}), enamel r {ER * k:.1f}, "
          f"rail r {orr * k:.1f}, slices {MIR_TOP}/{MIR_BOT}")


PIECES = {
    "coin": nerve_milled,
    "wings": nerve_wings,
    "decks": decks,
    "shelf": shelf_iron,
    "hourglass": hourglass_glass,
    "crescent": boss_crescent,
    "mirror": boss_mirror,
}
SHEET = ["nerve-wings.webp", "nerve-milled.webp", "deck-draw.webp", "deck-discard.webp", "deck-torn.webp",
         "deck-vanished.webp", "shelf-iron.webp", "hourglass-glass.webp", "boss-crescent.webp", "boss-mirror.webp"]


def contact_sheet(path):
    rows = []
    for bg in ((20, 13, 26), (110, 96, 84)):
        row = Image.new("RGB", (2200, 330), bg)
        x = 10
        for nm in SHEET:
            p = os.path.join(OUT, nm)
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert("RGBA")
            kf = min(1.5, 310 / im.height, 420 / im.width)
            im = im.resize((int(im.width * kf), int(im.height * kf)), Image.LANCZOS)
            row.paste(im, (x, 10), im)
            x += im.width + 14
        rows.append(row)
    sheet = Image.new("RGB", (2200, 660))
    sheet.paste(rows[0], (0, 0))
    sheet.paste(rows[1], (0, 330))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sheet.save(path)
    print("sheet ->", path)


def main():
    ap = argparse.ArgumentParser(description="Render the things on the fight's table.")
    ap.add_argument("--only", default="", help="comma-separated: " + ", ".join(PIECES))
    ap.add_argument("--sheet", default="", help="write a contact sheet PNG to this path")
    a = ap.parse_args()
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("combat table ->", os.path.relpath(OUT, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    for nm in names:
        PIECES[nm]()
    if a.sheet:
        contact_sheet(a.sheet)


if __name__ == "__main__":
    main()
