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


WINGS_W, WINGS_H = 300, 226
WINGS_C = (150.0, 113.0)      # the hole's centre
WINGS_RH, WINGS_RB = 64.0, 75.0


def _sscroll(dr, x0, y0, x1, y1, bow, w0, w1, ss, n=90):
    """A tapered S laid from (x0,y0) to (x1,y1), bowing `bow` px each way."""
    t = np.linspace(0, 1, n)
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / L, dx / L
    s = np.sin(t * 2 * np.pi) * bow
    xs = x0 + dx * t + nx * s
    ys = y0 + dy * t + ny * s
    _tapered(dr, list(zip(xs, ys)), w0, w1, ss)
    return mx, my


def nerve_wings():
    """300x226: NERVE'S CRADLE (round 6). Round 5's setting was a clean bezel on
    two thin C-scrolls, and beside a coin as heavy as this one the scrolls read
    as a bracket someone had added. Three judges across two rounds named ZEPHYR's
    dense black-iron filigree cradle the most sample-like ornament on any board,
    so this is that: a wrought cage of volutes, S-curls, leaves and berries
    packed round the bezel, an anthemion over its crown and a scrolled bracket
    under its foot — drawn in iron's own section (a round rod, an ink line at
    every silhouette) and BRIGHTENED TOWARD ANTIQUE GOLD, which is the brief's
    word, so it belongs to the boards' brass instead of standing out black.
    The hole is at WINGS_C, radius WINGS_RH; the crown stays low, because the
    Kid's conditions come down to meet it at 1280x800."""
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

    def bead(dr, x, y, rr):
        dr.ellipse([(x - rr) * ss, (y - rr) * ss, (x + rr) * ss, (y + rr) * ss], fill=255)

    def spring(deg):
        """A point on the bezel's rim, where a bar of the cage is welded on."""
        a = math.radians(deg)
        return cx + RB * 0.95 * math.cos(a), cy + RB * 0.95 * math.sin(a)

    def scrolls(dr):
        for sg in (-1, 1):
            # the two heavy arms: out from the bezel's shoulders, winding into
            # their eyes at the cradle's far corners
            for vs, turns, reach, drop in ((-1, 1.30, 112, -32), (1, 1.30, 108, 38)):
                x0, y0 = spring(34 * vs if sg > 0 else 180 - 34 * vs)
                pts = _volute(x0, y0, cx + sg * reach, cy + drop, sg * (-vs), turns=turns, r_end=4.6)
                _tapered(dr, pts, 15.5, 4.4, ss)
                bead(dr, *pts[-1], 4.9)
            # the cage climbs the bezel: a pair that rise over its crown and a
            # pair that fall under its foot, so the coin sits IN something
            for vs, reach, drop, tn in ((-1, 52, -94, 1.15), (1, 50, 92, 1.15)):
                x0, y0 = spring(66 * vs if sg > 0 else 180 - 66 * vs)
                pts = _volute(x0, y0, cx + sg * reach, cy + drop, sg * vs, turns=tn, r_end=3.4)
                _tapered(dr, pts, 9.0, 2.8, ss)
                bead(dr, *pts[-1], 3.6)
            # a finer volute nested inside each arm: the filigree between them
            for vs, reach, drop in ((-1, 78, -6), (1, 74, 12)):
                x0, y0 = spring(52 * vs if sg > 0 else 180 - 52 * vs)
                pts = _volute(x0, y0, cx + sg * reach, cy + drop, sg * vs, turns=1.05, r_end=3.0)
                _tapered(dr, pts, 6.6, 2.4, ss)
                bead(dr, *pts[-1], 3.0)
            # four claws clasping the bezel itself, at its quarters
            for deg in (30, -30, 150, -150):
                if (deg > 90 or deg < -90) == (sg < 0):
                    continue
                x0, y0 = spring(deg)
                a = math.radians(deg)
                pts = _volute(x0, y0, x0 + 13 * math.cos(a), y0 + 13 * math.sin(a), 1, turns=0.8, r_end=2.2)
                _tapered(dr, pts, 6.0, 2.2, ss)
            # the S that ties the two arms together out at the cradle's waist
            _sscroll(dr, cx + sg * (RB + 8), cy - 30, cx + sg * (RB + 56), cy + 36, 8.0, 6.4, 3.0, ss)
            # an acanthus leaf where the arms spring, and its berries
            leaf = [(cx + sg * (RB - 8), cy - 11), (cx + sg * (RB + 22), cy - 5),
                    (cx + sg * (RB + 38), cy + 1), (cx + sg * (RB + 22), cy + 7), (cx + sg * (RB - 8), cy + 13)]
            dr.polygon([(x * ss, y * ss) for x, y in leaf], fill=255)
            for bx, by, br in ((RB + 46, -18, 3.6), (RB + 58, 1, 3.2), (RB + 46, 20, 3.6)):
                bead(dr, cx + sg * bx, cy + by, br)
            # the outer rail: a thin iron hoop swung round the whole cage, hung
            # with three berries, which is what makes a cage read as wrought
            pts = [(cx + sg * (RB + 24 + 40 * math.sin(th)), cy + 84 * math.cos(th)) for th in np.linspace(-1.12, 1.12, 70)]
            _tapered(dr, pts, 3.6, 3.6, ss)
            for th in (-0.75, 0.0, 0.75):
                bead(dr, cx + sg * (RB + 24 + 40 * math.sin(th)), cy + 84 * math.cos(th), 3.4)
    sc = layer(scrolls)

    def crest(dr):
        # an anthemion over the crown: a centre leaf between two curls, low
        top = cy - RB - 3
        dr.polygon([((cx - 9) * ss, (top + 8) * ss), (cx * ss, (top - 13) * ss), ((cx + 9) * ss, (top + 8) * ss)], fill=255)
        for sg in (-1, 1):
            pts = _volute(cx + sg * 8, top + 6, cx + sg * 21, top + 3, -sg, turns=0.95, r_end=2.6)
            _tapered(dr, pts, 5.6, 2.4, ss)
        bead(dr, cx, top - 12, 4.2)
        # the bracket under the foot: a drop between two curls, on a plinth
        bot = cy + RB + 1
        dr.polygon([((cx - 15) * ss, (bot - 4) * ss), ((cx + 15) * ss, (bot - 4) * ss), (cx * ss, (bot + 19) * ss)], fill=255)
        bead(dr, cx, bot + 16, 5.2)
        for sg in (-1, 1):
            pts = _volute(cx + sg * 14, bot - 2, cx + sg * 30, bot + 6, sg, turns=1.0, r_end=2.8)
            _tapered(dr, pts, 6.0, 2.4, ss)
    cr = layer(crest)

    bezel = (r >= RH) & (r < RB)
    solid = (sc | cr | bezel) & (r >= RH)

    # iron is a ROUND rod: a half-round section, not a flat ribbon
    d_sc = ndimage.distance_transform_edt(sc | cr) / ss
    h_sc = np.sqrt(np.clip(d_sc / 5.2, 0, 1)) * 6.6
    h_sc = h_sc + np.exp(-((d_sc - 6.0) / 1.1) ** 2) * 1.0 * (d_sc > 4)
    tb = np.clip((r - RH) / (RB - RH), 0, 1)
    h_bz = np.sqrt(np.clip(1 - (2 * tb - 1) ** 2, 0, 1)) * 8.5 + 1.0
    ang = np.arctan2(yy - cy, xx - cx)
    beads = (0.5 + 0.5 * np.cos(ang * 36)) ** 4 * np.exp(-((r - (RH + 3.2)) / 1.4) ** 2) * 1.8
    h_bz = h_bz + beads
    hgt = np.where(bezel, np.maximum(h_bz, 0), np.where(sc | cr, h_sc, 0))
    hgt = np.where(r >= RH, hgt, 0)
    hgt = ndimage.gaussian_filter(hgt * ss, ss * 0.5)
    n = normals(hgt, 1.0)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 2.2), spec_amt=0.6, lift=-0.06) * 0.78 * 1.08
    metal = metal * np.array([1.0, 0.95, 0.86], np.float32)
    # the filigree is darker than the bezel it carries — iron under the gilding,
    # lit along its top edge, so the cage recedes and the coin comes forward
    iron = metal * 0.62 + np.array([16, 12, 10], np.float32) * 0.38
    lit = np.clip(n[..., 1] * -0.8 + 0.3, 0, 1)
    iron = iron + lit[..., None] * np.array([196, 158, 92], np.float32) * 0.34
    metal = np.where(bezel[..., None], metal, iron)
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

    # THE MOON-SUN SIGIL (round 6). The moon crest alone read as a smudge at
    # the size a pile prints; the sun behind it — a wheel of tapering gilt rays
    # with a fine ring round their tips — gives the back a centre that survives
    # the scale, which is what the judges asked the piles for.
    cxr, cyr = W / 2, H / 2 - 2
    ra = np.arctan2(yy - cyr, xx - cxr)
    rr = np.hypot(xx - cxr, yy - cyr)
    spokes = (0.5 + 0.5 * np.cos(ra * 16)) ** 2.6
    rays = spokes * np.clip((rr - 19) / 6.0, 0, 1) * np.clip((44 - rr) / 9.0, 0, 1)
    ring = np.exp(-((rr - 45.5) / 1.1) ** 2)
    sig = np.clip(rays * 1.15 + ring * 0.9, 0, 1) * (~metal_m)
    gold_s = ramp(np.clip(0.8 - (yy - cyr) / 120.0, 0, 1), [(0, "#4a3214"), (0.5, "#9c7638"), (1, "#e8cd90")])
    col = col * (1 - sig[..., None] * 0.9) + gold_s * (sig[..., None] * 0.9)

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


PILE_W, PILE_H = 160, 208


def decks():
    """THE PILES ARE DECKS, NOT BADGES (round 6). Round 5 laid a card a third of
    the size into a gilded tray, and every judge read the two corners as small
    badges: the tray's rim took most of the box and the back inside it printed
    56 px tall on a 1280 board. The tray is gone. Each pile is a FULL-SIZE back
    (deck-back.webp, gold rim and moon-sun sigil) with the stack's own gilt
    edges stepping out from under it, which is WALNUT's piece and what the
    brief asks for: a deck lying on the table, read at a glance."""
    back = deck_back()
    back_im = Image.fromarray(np.clip(back, 0, 255).astype(np.uint8))
    W, H = PILE_W, PILE_H
    cw = int(W * 0.80)
    chh = int(cw * BACK_H / BACK_W)
    card = back_im.resize((cw, chh), Image.LANCZOS)
    cx, cy = W * 0.46, H * 0.46

    def blank():
        return np.zeros((H, W, 4), np.float32)

    # the cut edges of the backs under the top one: gilt, in its shadow
    edge = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle([0, 0, cw - 1, chh - 1], radius=int(cw * 0.07), fill=(255, 255, 255, 255))
    ea = np.asarray(edge, np.float32)
    gy = np.linspace(0, 1, chh)[:, None] * np.ones((1, cw))
    gold = ramp(np.clip(0.75 - gy * 0.35, 0, 1), [(0, "#4a3214"), (0.5, "#a37d42"), (1, "#e4c586")])
    ea = np.dstack([gold, ea[..., 3]])
    din = ndimage.distance_transform_edt(ea[..., 3] > 128)
    ea[..., :3] *= np.clip(din / 1.6, 0.25, 1)[..., None]
    edge_im = Image.fromarray(np.clip(ea, 0, 255).astype(np.uint8))

    # DRAW: squared up, six backs deep, each a step down and to the right of
    # the one over it, so the deck's thickness shows along two sides
    base = blank()
    n = 6
    for i in range(n):
        k = n - 1 - i
        im = card if k == 0 else edge_im
        _paste_card(base, im, cx + k * 2.4, cy + k * 2.7, 0.0, shadow=0.3 if k else 0.85)
    save(np.dstack([base[..., :3], base[..., 3] * 255]), "deck-draw.webp", 92)

    # DISCARD: thrown down, each at its own angle
    base = blank()
    for ang, dx, dy in ((-9.5, -4, 5), (7.5, 4, 2), (-2.5, 0, 0)):
        _paste_card(base, card, cx + dx, cy + dy, ang)
    save(np.dstack([base[..., :3], base[..., 3] * 255]), "deck-discard.webp", 92)

    # TORN: the top back ripped across, its upper half lifted and turned
    base = blank()
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

    # VANISHED: two backs faded almost to nothing, a lavender ghost-light
    base = blank()
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

    # THE SAND IS THE POINT (round 6). At END TURN's size the glass printed
    # 34 px across and three judges read it as "a flat gold glyph in a dark
    # disc": the heap was a sliver, the thread was sub-pixel and the lower bulb
    # was as dark as the upper. It is drawn as a running glass now — a deep
    # heap with a dimple where the stream lands, a cone still falling out of
    # the upper bulb, a thread wide enough to survive the scale with a lit
    # halo down it — and the lower bulb is LIT, a lantern of warm light behind
    # the sand, which is what makes it read as brass and glass and not a glyph.
    # the heap: a cone of its own angle of repose, dimpled where the stream
    # lands, filling under half the bulb so there is glass left to light
    heap_top = g1 - 33 + 13 * (np.abs(xx - cx) / 24.0) ** 1.7 + 4.4 * np.exp(-((xx - cx) / 4.2) ** 2)
    lower_sand = glass & (yy > waist + 6) & (yy >= heap_top)
    # the upper bulb is DRAINING: sand banked high at the glass and funnelling
    # down to the throat in the middle, not a mountain standing in it
    cone_top = waist - 31 + 26 * np.exp(-((xx - cx) / 6.4) ** 2)
    upper_sand = glass & (yy < waist) & (yy >= cone_top)
    thread = (np.abs(xx - cx) < 2.4 - 0.9 * smooth(waist, waist + 26, yy)) & (yy >= waist - 6) & (yy < heap_top + 4)
    sand_m = lower_sand | upper_sand | thread
    grain = noise((SH, SW), rng, ss * 0.5) * 0.12 + noise((SH, SW), rng, ss * 2) * 0.08
    # amber all the way up: a pale cream bank in the upper bulb read as a
    # highlight on the glass and not as sand
    sand_t = np.clip(0.54 - (yy - waist) / 170.0 + grain, 0, 1)
    sand = ramp(sand_t, [(0, "#7a4412"), (0.5, "#cb8e3d"), (1, "#f2c274")])

    ex = (xx - cx) / np.maximum(hw, 1e-3)
    streak = np.exp(-((ex + 0.52) / 0.13) ** 2) * (np.abs(yy - waist) > 6)
    rim = np.exp(-((np.abs(ex) - 0.93) / 0.05) ** 2)
    # the lamp in the lower bulb: warm light behind the heap, dying upward
    lamp = np.exp(-(((xx - cx) / 30.0) ** 2 + ((yy - (g1 - 22)) / 30.0) ** 2))
    glass_col = np.array([17, 11, 27], np.float32) * np.ones((SH, SW, 1), np.float32)
    glass_col = (glass_col + streak[..., None] * np.array([236, 228, 216], np.float32) * 0.42
                 + rim[..., None] * np.array([200, 180, 220], np.float32) * 0.45
                 + lamp[..., None] * np.array([226, 142, 58], np.float32) * 0.82)
    glass_a = np.clip(0.30 + streak * 0.40 + rim * 0.45 + lamp * 0.46, 0, 1)
    col = np.zeros((SH, SW, 3), np.float32)
    alpha = np.zeros((SH, SW), np.float32)
    col = np.where(glass[..., None], glass_col, col)
    alpha = np.where(glass, glass_a, alpha)
    sand_lit = sand * (0.74 + 0.40 * np.clip(-ex * 0.5 + 0.5, 0, 1) + 0.62 * lamp)[..., None] + streak[..., None] * 34
    col = np.where(sand_m[..., None], sand_lit, col)
    alpha = np.where(sand_m, 1.0, alpha)
    # the thread's own light, so it survives being one pixel wide on the board
    halo = np.exp(-((xx - cx) / 3.4) ** 2) * smooth(waist - 4, waist + 8, yy) * (1 - smooth(g1 - 40, g1 - 26, yy))
    col = col + (halo * glass)[..., None] * np.array([255, 216, 150], np.float32) * 0.55
    alpha = np.where(glass, np.clip(alpha + halo * 0.5, 0, 1), alpha)
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
    # frame, so every width here is a sixth narrower than it will read).
    # ROUND 6: DEEP, not hazy. Round 5's glass sat at a mean value of 34 with a
    # near-vertical sheen down it, and three judges read it as "a pale haze with
    # the room showing through". Everything here is rail-anchored or horizontal,
    # because the middle of the 3-slice is squashed a little at every size; the
    # moonlight that leans across it is painted separately, in boss-glaze.webp,
    # which is one stretched piece and so cannot kink at a slice's seam. ──
    inner = ~ndimage.binary_dilation(body, iterations=2)
    inner &= ~(dmed <= orr + 2)                     # never up into the medallion
    lab, _ = ndimage.label(inner)
    seed = lab[int(h * 0.55), w // 2]
    glass = (lab == seed) if seed else np.zeros_like(inner)
    d_in = ndimage.gaussian_filter(ndimage.distance_transform_edt(glass).astype(np.float32), 1.1)
    Y, X = yy, xx
    cxg = w / 2
    t = np.clip(Y / h, 0, 1)
    # the silvering, gone: a cold slate high in the plate falling to the
    # aubergine black of the house at its foot. A figure lit from the front
    # stands OFF this; a figure in a fog does not.
    base = ramp(t, [(0.0, "#181b28"), (0.26, "#13141f"), (0.58, "#0d0b15"), (0.82, "#09070f"), (1.0, "#060409")])
    # DEPTH: the dark of a room going back, not a fill. A wide, very low
    # contrast bloom about the height of his shoulders, and the floor of that
    # room darker than its air.
    deep = np.exp(-(((X - cxg) / (w * 0.46)) ** 2 + ((Y - h * 0.40) / (h * 0.30)) ** 2))
    base = base + deep[..., None] * np.array([26, 30, 44], np.float32) * 0.5
    base = base * (1 - 0.30 * smooth(h * 0.62, h * 1.0, Y))[..., None]
    # the arch throws its own shadow on the top of the glass
    base = base * (1 - 0.34 * (1 - smooth(h * 0.02, h * 0.16, Y)))[..., None]
    # old silvering: a soft mottle, taller than wide so the 3-slice's squash
    # rounds it, and patchier than round 5's so the plate is never one value
    mott = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (13.0, 4.6))
    mott /= np.abs(mott).max() + 1e-6
    coarse = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (34.0, 15.0))
    coarse /= np.abs(coarse).max() + 1e-6
    base = base * (1 + mott[..., None] * 0.17 + coarse[..., None] * 0.22)
    col_g = base
    # a breath of the two sconces' candlelight caught at his shoulders' height
    for sxw in (15.0, w - 15.0):
        warm = np.exp(-(((X - sxw) / 34.0) ** 2 + ((Y - 250) / 110.0) ** 2))
        col_g = col_g + warm[..., None] * np.array([150, 92, 44], np.float32) * 0.17
    # TARNISH, and enough of it to see. Two coats: a mottled creep in from
    # every rail, and continents of lost silver out in the field where the
    # backing has blistered. Brown-black over the slate, never grey.
    tn = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (6.0, 2.6))
    tn /= np.abs(tn).max() + 1e-6
    creep = 1 - _smoothstep_arr(2.5, 40 + tn * 26, d_in)
    tarn = np.array([40, 27, 17], np.float32)
    col_g = col_g * (1 - 0.72 * creep[..., None]) + creep[..., None] * tarn * 0.52
    blis = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (18.0, 8.0))
    blis /= np.abs(blis).max() + 1e-6
    blis = np.clip((blis - 0.30) / 0.45, 0, 1) * (1 - smooth(34, 120, d_in) * 0.55)
    col_g = col_g * (1 - 0.46 * blis[..., None]) + blis[..., None] * tarn * 0.34
    # foxing: small dark blooms of lost silver near the rails
    fox = ndimage.gaussian_filter((rng.random((h, w)) > 0.9955).astype(np.float32), (2.6, 1.2))
    fox = np.clip(fox / (fox.max() + 1e-6) * 1.7, 0, 1) * (1 - smooth(10, 62, d_in))
    col_g = col_g * (1 - 0.55 * fox[..., None])
    # the bevel: the glass's cut edge catching light just inside the rails,
    # brighter along the upper left, which faces the boards' light
    lit = np.clip(0.55 - (X - cxg) / w * 0.9 - (Y / h) * 0.35, 0.1, 1)
    bevel = np.exp(-((d_in - 2.9) / 1.15) ** 2) * lit
    col_g = col_g + bevel[..., None] * np.array([230, 222, 236], np.float32) * 0.40
    # OPAQUE. At 0.9 the room behind it came through and lifted the whole
    # plate; a mirror is a thing, not a wash.
    alpha_g = smooth(0.2, 1.6, d_in) * glass

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

    # ── THE MOONLIGHT IN THE GLASS (boss-glaze.webp) ───────────────────────
    # The one thing on the plate that leans. It cannot live in boss-mirror.webp:
    # that is a 3-slice, and a lean crossing a seam kinks at it. This is the
    # same box drawn as ONE stretched piece over the glass, so the streaks stay
    # straight at every stage height. Three leans off one line — a broad haze,
    # the body of the shaft, a hard bright edge on its cold side — plus a
    # narrow second shaft, dust caught in both, and the pool of light they
    # throw on the glass's floor. Its own alpha keeps it INSIDE the glass
    # (the same distance field the tarnish creeps by) and clear of the crown's
    # medallion, so nothing of it ever reaches a rail.
    lean = 0.42                                   # about 23 degrees off vertical
    ax = w * 0.30 + (Y - h * 0.16) * lean
    bx = ax + 62
    # a long onset under the arch and a long tail toward the foot: a hard edge
    # anywhere in this reads as a band across the glass instead of as light
    env = smooth(h * 0.05, h * 0.34, Y) * (1 - 0.66 * smooth(h * 0.54, h * 0.99, Y))
    shaft = (np.exp(-((X - ax) / 30.0) ** 2) * 0.34
             + np.exp(-((X - ax) / 10.5) ** 2) * 0.46
             + np.exp(-((X - (ax + 11)) / 3.0) ** 2) * 0.52)
    shaft = shaft + (np.exp(-((X - bx) / 15.0) ** 2) * 0.20
                     + np.exp(-((X - bx) / 4.2) ** 2) * 0.26)
    shaft = shaft * env
    # dust turning in the light: specks that only exist where the shaft is
    spk = (rng.random((h, w)) > 0.99955).astype(np.float32)
    spk = ndimage.gaussian_filter(spk, 1.0)
    spk = np.clip(spk / (spk.max() + 1e-6), 0, 1) * np.clip(shaft * 2.4, 0, 1)
    # where the two shafts land: a low wash across the glass's floor
    floorx = w * 0.30 + (h * 0.74 - h * 0.16) * lean
    pool = np.exp(-((X - floorx) / 96.0) ** 2) * np.exp(-((Y - h * 0.74) / (h * 0.10)) ** 2) * 0.30
    g = np.clip(shaft + pool + spk * 0.9, 0, 1.15)
    # cold moonlight, a shade warmer in its core so it is light and not paint
    gl_col = (np.array([150, 166, 206], np.float32)[None, None, :] * np.ones((h, w, 1), np.float32)
              + np.clip(g - 0.55, 0, 1)[..., None] * np.array([90, 76, 44], np.float32))
    keep = smooth(7, 30, d_in) * glass                      # never out to a rail
    keep = keep * smooth(orr * MIR_RING_K + 1, orr * MIR_RING_K + 16, dmed)
    gl_a = np.clip(g, 0, 1) * 0.47 * keep
    gz = Image.fromarray(np.clip(_rgba(gl_col, gl_a), 0, 255).astype(np.uint8), "RGBA").resize((W2, h), Image.LANCZOS)
    gcan = np.zeros((H2, W2, 4), np.uint8)
    gcan[MIR_PAD:] = np.asarray(gz)
    save(gcan.astype(np.float32), "boss-glaze.webp", 90)
    print(f"      boss-glaze:  {W2}x{H2}, lean {lean:.2f}, peak alpha {gl_a.max():.2f}")


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
