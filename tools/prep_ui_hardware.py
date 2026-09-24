"""Paint the house's HARDWARE: the controls, and the small objects the boards sell.

Round 19's survey found the same fault on six screens: the controls were web
form elements painted gold (a disc beside a bar for a switch, rounded selects
with chevron circles, icon-font glyphs in empty rings, line icons in rings), and
every screen had invented its own. The fix is ONE vocabulary, in four pieces,
each made here by `tools/prep_ui_materials.py`'s plumbing (height fields lit
from the boards' top left, the brass ramp measured off the samples, an ink
outline) so the hardware is the same metal as the rails and the medallions:

  BRASS       hw-knob.webp       a cast brass knob: a milled rim round a domed
                                 boss with a violet enamel cabochon (a slider's
                                 knob; the lit end of a switch)
              hw-groove.webp     a slider's groove: a brass bezel plate with a
                                 channel sunk into it (3-slice, 40 px ends)
              hw-finial.webp     a cast brass arrowhead with a collar, the
                                 "this opens" mark on a dial plate's end
  ENAMEL      the Kid board's round button (button.webp, prep_ui_kit.py) and
                                 hw-glaze.webp, the wet highlight the sample's
                                 buttons carry, laid over it so it reads fired
              hw-cog.webp        a cast brass cog with a violet cabochon: a
                                 slider's knob (round 19 graft, after KERMES)
              hw-lever.webp      a switch's lever: a brass shank and ball on a
                                 hub, thrown about the canvas's centre (96)
  ENGRAVED    hw-switch.webp     a two-position switch plate: a gilt rim round
  PLATE                          two sunk wells, a brass pivot between them
                                 with the lever's gate cut above it; the lit
                                 well is the setting (words laid over it)
              hw-dial.webp       a filter's dial plate: brass, screwed at each
                                 end, its name engraved over a sunk window
              plate.webp / plate-lit.webp (prep_ui_kit / prep_ui_surfaces) for
                                 everything else lettered
  PAINTED     objects/<key>.webp a small painted object for every Keepsake
  OBJECT                         icon (data/relics.js `icon`), every Snack
                                 (state/run.js SNACKS id), the Safe Room's four
                                 things and a candle stub, unlit and lit. Each
                                 is modelled as a few parts, each part a height
                                 field lit from the top left in its own
                                 material, casting a soft shadow on the parts
                                 under it, outlined in the samples' dark ink.
              hw-well.webp       the plate a painted object sits in: a velvet
                                 hollow sunk in a studded brass bezel
  RAIL        hw-rail.webp       the run strip as ONE carved object (round 20):
  (round 20)                     brass mouldings, a brushed plate-enamel face,
                                 one channel sunk the length of it, carved end
                                 blocks with a rosette boss and a finial
              hw-rail-vine.webp  (graft) an engraved gilt vine for the length
                                 of channel no readout stands in
              hw-rail-stud.webp  (graft) a milled brass stud parting two
                                 readouts in the channel
              hw-rail-well.webp  (graft) a plate sunk in the rail, where words
                                 are engraved ("No Keepsakes")
              hw-tray.webp       the drawer a folded group lets down under
                                 the rail

    python tools/prep_ui_hardware.py                # everything
    python tools/prep_ui_hardware.py --only objects # one group while tuning
    python tools/prep_ui_hardware.py --only rail    # the run rail's pieces
    python tools/prep_ui_hardware.py --sheet        # + a contact sheet in shots/
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_ui_materials import (ROOT, OUT, LIGHT, hexc, ramp, smooth, noise, normals,  # noqa: E402
                               lambert, specular, mask_from_draw, inside_distance, down,
                               brass, save)

OBJ_OUT = os.path.join(ROOT, "game", "assets", "ui", "objects")
INK = np.array([16, 10, 8], np.float32)
INK_W = 1.9          # the outline, in 96-unit px: about a pixel at the size an object is shown


# ── a small painted object ────────────────────────────────────────────────────
class Pic:
    """A 96-unit square painted in parts, back to front.

    Every coordinate is in the 96-unit box; the picture is drawn at `ss`x and
    boxed down, so an outline is a soft line a pixel wide, as the samples' are.
    """
    N = 96

    def __init__(self, seed=1, ss=4, n=96, h=None):
        self.N = n
        self.ss = ss
        self.W = n * ss
        self.H = (h or n) * ss
        self.col = np.zeros((self.H, self.W, 3), np.float32)
        self.a = np.zeros((self.H, self.W), np.float32)
        self.rng = np.random.default_rng(seed)

    # shapes: callables that draw white on an ImageDraw at scale s
    def raster(self, shapes):
        im = Image.new("L", (self.W, self.H), 0)
        dr = ImageDraw.Draw(im)
        for sh in (shapes if isinstance(shapes, list) else [shapes]):
            sh(dr, self.ss)
        return np.asarray(im, np.float32) / 255.0

    def part(self, shapes, mat, prof="round", bevel=5.0, gloss=0.35, power=22.0, shadow=0.55,
             bump=None, tex=None, ink=1.0, cut=None, light=None, erode=0.0, lift=0.0):
        """One part. `mat` is 'brass', 'silver', or (dark, base, light) hex.
        prof: round (a bevelled slab), sphere (a dome over its whole width),
        pillow (soft cushion), flat (a card). `bump(xx, yy)` adds relief in
        96-unit height; `tex(xx, yy, col)` repaints the albedo; `cut` shapes
        are punched out of the part."""
        ss = self.ss
        m = self.raster(shapes)
        if cut is not None:
            m = m * (1 - self.raster(cut))
        if erode:
            dd = inside_distance(m > 0.5) / ss
            m = smooth(erode - .5, erode + .5, dd)
        inside = m > 0.5
        if not inside.any():
            return
        d = inside_distance(inside) / ss                     # 96-unit distance to the edge
        if prof == "sphere":
            R = max(d.max(), 1e-3)
            t = np.clip(d / R, 0, 1)
            h = R * np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))
        elif prof == "pillow":
            h = bevel * (1 - np.exp(-d / max(bevel, 1e-3)))
        elif prof == "flat":
            h = np.clip(d, 0, 0.9)
        elif prof == "recess":
            # a hollow: the floor sunk `bevel` under the lip, its walls falling
            # away, so the wall under the light's side is in shadow
            h = -bevel * smooth(0.0, max(bevel * 1.6, 1e-3), d)
        else:
            t = np.clip(d / max(bevel, 1e-3), 0, 1)
            h = bevel * np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))
        yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32) / ss
        if bump is not None:
            h = h + bump(xx, yy) * inside
        h = ndimage.gaussian_filter(h * ss, ss * 0.5)
        n = normals(h, 1.0)
        lt = LIGHT if light is None else light
        lam = lambert(n, lt)
        if mat == "brass":
            c = brass(n, wear=noise(h.shape, self.rng, ss * 2.0), lift=lift)
        elif mat == "silver":
            t = np.clip((lam - 0.1) / 0.86, 0, 1) ** 1.3
            c = ramp(t, [(0, "#15161d"), (0.3, "#3d4150"), (0.6, "#7f8494"), (0.85, "#c5c9d4"), (1, "#f1f3f8")])
            c = c + specular(n, lt, 30.0)[..., None] * np.array([255, 255, 255], np.float32) * 0.5
        else:
            dk, bs, li = mat
            t = np.clip((lam - 0.08) / 0.9, 0, 1)
            c = ramp(t, [(0, dk), (0.55, bs), (1, li)])
        if tex is not None:
            c = tex(xx, yy, c)
        if mat not in ("brass", "silver"):
            c = c + (specular(n, lt, power) * gloss)[..., None] * np.array([255, 246, 228], np.float32)
        # the paint's own unevenness
        mott = noise(h.shape, self.rng, ss * 3.0) * 0.07 + noise(h.shape, self.rng, ss * 0.8) * 0.04
        c = c * (1 + mott[..., None])
        # ink round the silhouette
        if ink:
            e = smooth(0.0, INK_W, d) ** 0.8
            c = c * (e[..., None] * ink + (1 - ink)) + INK * ((1 - e) * ink)[..., None]
        # the part's shadow on what is under it
        if shadow:
            sh = ndimage.shift(ndimage.gaussian_filter(m, ss * 1.6), (ss * 2.2, ss * 1.4), order=1)
            self.col *= (1 - shadow * sh * (1 - m))[..., None]
        self.col = c * m[..., None] + self.col * (1 - m[..., None])
        self.a = m + self.a * (1 - m)

    def ink(self, pts, w=1.4, color=None, alpha=1.0, closed=False, over=True):
        """A stroke of ink (or of a colour) laid on the picture: a crease, a
        stitch, a printed line. Clipped to what is already painted if `over`."""
        s = self.ss
        im = Image.new("L", (self.W, self.H), 0)
        dr = ImageDraw.Draw(im)
        P = [(x * s, y * s) for x, y in pts]
        if closed:
            P = P + [P[0]]
        dr.line(P, fill=255, width=max(1, int(round(w * s))), joint="curve")
        r = w * s / 2
        for x, y in (P[0], P[-1]):
            dr.ellipse([x - r, y - r, x + r, y + r], fill=255)
        m = np.asarray(im, np.float32) / 255.0 * alpha
        if over:
            m = m * self.a
        col = INK if color is None else hexc(color)
        self.col = self.col * (1 - m[..., None]) + col * m[..., None]
        if not over:
            self.a = m + self.a * (1 - m)

    def paint(self, shapes, color, alpha=1.0, blur=0.0, over=True, add=False):
        m = self.raster(shapes) * alpha
        if blur:
            m = ndimage.gaussian_filter(m, blur * self.ss)
        if over:
            m = m * self.a
        col = hexc(color)
        if add:
            self.col = self.col + col * m[..., None]
        else:
            self.col = self.col * (1 - m[..., None]) + col * m[..., None]

    def glow(self, cx, cy, r, color, amt=1.0):
        """Light thrown by a flame: added on the picture and a halo round it."""
        s = self.ss
        yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32) / s
        g = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)) * amt
        self.col = self.col + hexc(color) * g[..., None] * 0.9
        self.a = np.maximum(self.a, np.clip(g * 0.85, 0, 1))
        return g

    def result(self):
        s = self.ss
        col = down(self.col * self.a[..., None], s)
        a = down(self.a, s)
        col = col / np.maximum(a, 1e-4)[..., None]
        return np.dstack([np.clip(col, 0, 255), np.clip(a * 255, 0, 255)])


# shape helpers, in the 96-unit box
def E(cx, cy, rx, ry=None):
    ry = rx if ry is None else ry
    return lambda dr, s: dr.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=255)


def P(pts):
    return lambda dr, s: dr.polygon([(x * s, y * s) for x, y in pts], fill=255)


def R(x0, y0, x1, y1, r=0):
    return lambda dr, s: dr.rounded_rectangle([x0 * s, y0 * s, x1 * s, y1 * s], radius=r * s, fill=255)


def L(pts, w):
    def f(dr, s):
        Q = [(x * s, y * s) for x, y in pts]
        dr.line(Q, fill=255, width=max(1, int(round(w * s))), joint="curve")
        for x, y in (Q[0], Q[-1]):
            dr.ellipse([x - w * s / 2, y - w * s / 2, x + w * s / 2, y + w * s / 2], fill=255)
    return f


def rot(pts, ang, c=(48, 48)):
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    return [(c[0] + (x - c[0]) * ca - (y - c[1]) * sa, c[1] + (x - c[0]) * sa + (y - c[1]) * ca) for x, y in pts]


def RR(x0, y0, x1, y1, ang, c=None):
    """A rotated rectangle as a polygon."""
    c = c or ((x0 + x1) / 2, (y0 + y1) / 2)
    return P(rot([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], ang, c))


def arc_pts(cx, cy, rx, ry, a0, a1, n=24):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


# ── the hardware ──────────────────────────────────────────────────────────────
def _save_pic(p, name):
    arr = p.result()
    save(arr, name, 92)
    return arr


def hw_knob():
    """A cast brass knob, seen from above: a milled rim, a domed boss inside
    it, a violet enamel cabochon set in the boss."""
    p = Pic(seed=21)

    def knurl(xx, yy):
        a = np.arctan2(yy - 48, xx - 48)
        r = np.hypot(xx - 48, yy - 48)
        return 0.9 * np.cos(a * 28) * smooth(33, 38, r)
    p.part(E(48, 48, 44), "brass", bevel=11, bump=knurl, shadow=0)
    p.ink(arc_pts(48, 48, 32.5, 32.5, 0, 360, 60), w=1.3, alpha=.8)
    p.part(E(48, 48, 31), "brass", prof="sphere")
    p.part(E(48, 48, 15), ("#140a22", "#4b2f78", "#b393ea"), prof="sphere", gloss=.9, power=46)
    p.paint(E(43, 42, 4.5, 3), "#ffffff", .7, blur=.6)
    return _save_pic(p, "hw-knob.webp")


def hw_groove():
    """A slider's groove: a brass plate, its ends clipped like the panels'
    corners, a channel sunk the length of it. 3-slice, 40 px ends."""
    W, H = 240, 40
    p = Pic(seed=22, n=W, h=H)
    c = 7
    body = P([(c, 2), (W - c, 2), (W - 2, c + 2), (W - 2, H - c - 2), (W - c, H - 2), (c, H - 2), (2, H - c - 2), (2, c + 2)])
    p.part(body, "brass", bevel=3.2, shadow=0)
    p.part(body, PLATE, prof="round", bevel=2, gloss=.1, erode=4.0, shadow=.5)
    p.part(R(13, 12, W - 13, H - 12, 3), "brass", bevel=1.6, shadow=.3)
    p.part(R(15, 14, W - 15, H - 14, 2), ("#020103", "#0b0710", "#2a1d30"), prof="recess", bevel=4, gloss=.1, shadow=0)
    for x in (9, W - 9):
        p.part(E(x, H / 2, 3.2), "brass", prof="sphere", shadow=.4)
    return _save_pic(p, "hw-groove.webp")


def hw_switch():
    """A two-position switch plate: a gilt-rimmed plate with notched ends and
    two sunk wells, and between them a brass boss with a GATE cut above it --
    the arc the lever (hw-lever.webp) is thrown along. The words, the lit well
    and the lever are laid over it by the kit (.kit-hw-switch).

    ROUND 19 GRAFT: two judges preferred KERMES's switch, "an engraved brass
    plate with a physical lever on a brass pivot", and one warned its lever
    stood up above the plate. So the pivot sits low in a mullion wide enough
    to hold a lever whose ball stays INSIDE the plate at either throw: the
    pivot at (120, 50), the gate an arc of radius 36 about it, 25 degrees
    either side (the kit throws it 25)."""
    W, H = 240, 64
    p = Pic(seed=23, n=W, h=H)
    n = 12
    body = [(n, 3), (W - n, 3), (W - 3, n), (W - 3, H - n), (W - n, H - 3), (n, H - 3), (3, H - n), (3, n)]
    p.part(P(body), "brass", bevel=3.4, shadow=0)
    p.part(P(body), PLATE, prof="round", bevel=2.5, gloss=.1, erode=4.4, shadow=.5)
    for x0, x1 in ((15, 97), (143, 225)):
        p.part(R(x0 - 2.5, 10.5, x1 + 2.5, H - 10.5, 4), "brass", bevel=2, shadow=.4)
        p.part(R(x0, 13, x1, H - 13, 2.5), ("#020103", "#0d0812", "#2e2238"), prof="recess", bevel=5, gloss=.15, shadow=0)
    # the gate: a slot on an arc about the pivot, lipped in brass
    cx, cy, rr = 120, 50, 30
    outer = arc_pts(cx, cy, rr + 3.6, rr + 3.6, -90 - 29, -90 + 29, 24)
    inner = arc_pts(cx, cy, rr - 3.6, rr - 3.6, -90 + 29, -90 - 29, 24)
    p.part(P(outer + inner), "brass", bevel=1.6, shadow=.35)
    outer = arc_pts(cx, cy, rr + 1.9, rr + 1.9, -90 - 27, -90 + 27, 24)
    inner = arc_pts(cx, cy, rr - 1.9, rr - 1.9, -90 + 27, -90 - 27, 24)
    p.part(P(outer + inner), ("#020103", "#0a0610", "#241a2c"), prof="recess", bevel=3, gloss=.1, shadow=0)
    # the pivot's boss
    p.part(E(cx, cy, 7), "brass", bevel=3, shadow=.45)
    p.ink(arc_pts(cx, cy, 4.2, 4.2, 0, 360, 40), w=.8, alpha=.6)
    for x, y in ((9, 9), (W - 9, 9), (9, H - 9), (W - 9, H - 9)):
        p.part(E(x, y, 2.4), "brass", prof="sphere", shadow=.35)
    return _save_pic(p, "hw-switch.webp")


def hw_lever():
    """The switch's lever, standing up from its pivot: a tapered brass shank
    and a turned ball on its end, on a hub. 96 units, the pivot the canvas's
    centre (48, 48), so the kit throws it by rotating the picture; drawn at
    1.5x the plate's height it puts the pivot on the plate's (120, 50) and the
    ball's centre 36 units above it -- 18 under the plate's rim at 25 degrees,
    the ball inside the mullion and the rim both."""
    p = Pic(seed=30, n=96)
    p.part(P([(44.8, 49), (51.2, 49), (49.6, 17), (46.4, 17)]), "brass", bevel=2, shadow=.6)
    p.part(E(48, 12, 6.2), "brass", prof="sphere", shadow=.55)
    p.paint(E(46, 10, 2, 1.4), "#fff6dc", .75, blur=.4)
    p.part(E(48, 48, 5.2), "brass", prof="sphere", shadow=.5)
    p.ink(arc_pts(48, 48, 2.0, 2.0, 0, 360, 20), w=.7, alpha=.7)
    return _save_pic(p, "hw-lever.webp")


def hw_cog():
    """A slider's knob as a cast brass COG: twelve square-cut teeth round a
    milled rim, a violet cabochon in the boss (KERMES's "cog-shaped jewelled
    knob", round 19, in the house's own brass)."""
    p = Pic(seed=31)
    teeth = []
    N = 12
    for i in range(N):
        a0 = 2 * math.pi * i / N
        for da, r in ((-.2, 37), (-.12, 44.5), (.12, 44.5), (.2, 37)):
            teeth.append((48 + r * math.cos(a0 + da), 48 + r * math.sin(a0 + da)))
    p.part(P(teeth), "brass", bevel=5, shadow=0)
    p.part(E(48, 48, 37.5), "brass", bevel=6, shadow=.2)
    p.ink(arc_pts(48, 48, 29.5, 29.5, 0, 360, 60), w=1.2, alpha=.75)
    p.part(E(48, 48, 28), "brass", prof="sphere", shadow=.3)
    p.part(E(48, 48, 15), ("#140a22", "#4b2f78", "#b393ea"), prof="sphere", gloss=.9, power=46)
    p.paint(E(43, 42, 4.5, 3), "#ffffff", .7, blur=.6)
    return _save_pic(p, "hw-cog.webp")


def hw_finial():
    """A cast brass arrowhead on a collar, pointing down: the mark on a dial
    plate's end that says the plate opens a list."""
    p = Pic(seed=24, n=48)
    p.part(R(14, 6, 34, 14, 2), "brass", bevel=3, shadow=0)
    p.part(P([(8, 16), (40, 16), (24, 42)]), "brass", bevel=6, shadow=.5)
    p.ink([(24, 19), (24, 36)], w=1.0, alpha=.55)
    return _save_pic(p, "hw-finial.webp")


def hw_well():
    """The plate a painted object sits in: a round hollow lined in violet
    velvet, sunk in a studded brass bezel (128)."""
    p = Pic(seed=25, n=128)
    p.part(E(64, 64, 61), "brass", bevel=8, shadow=0)
    p.ink(arc_pts(64, 64, 51, 51, 0, 360, 80), w=1.2, alpha=.7)
    for i in range(8):
        a = math.radians(i * 45 + 22.5)
        p.part(E(64 + 56 * math.cos(a), 64 + 56 * math.sin(a), 3.3), "brass", prof="sphere", shadow=.35)

    def nap(xx, yy):
        return noise((p.H, p.W), p.rng, p.ss * 1.2, 0.35)
    p.part(E(64, 64, 49), ("#07040b", "#1f1230", "#4a2f6a"), prof="recess", bevel=9, gloss=.05, bump=nap, shadow=0)
    return _save_pic(p, "hw-well.webp")


def hw_glaze():
    """The wet highlight the samples' enamel buttons carry, as a white layer
    for button.webp (112): a bright crescent inside the rim at the top left,
    a spark, and a faint answering light on the lower right."""
    S = 112 * 4
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / 4
    r = np.hypot(xx - 56, yy - 56)
    ang = np.degrees(np.arctan2(yy - 56, xx - 56))
    band = smooth(27, 32, r) * (1 - smooth(34.5, 37.5, r))
    def lobe(c, w):
        dd = np.abs(((ang - c) + 180) % 360 - 180)
        return np.exp(-(dd / w) ** 2)
    a = band * (lobe(-135, 38) * 0.75 + lobe(45, 30) * 0.22)
    spark = np.exp(-(((xx - 38) / 5.5) ** 2 + ((yy - 36) / 3.4) ** 2)) * 0.85
    a = np.clip(a + spark, 0, 1)
    a = down(a, 4)
    col = np.dstack([np.full(a.shape, 255.0), np.full(a.shape, 248.0), np.full(a.shape, 236.0)])
    save(np.dstack([col, a * 255]), "hw-glaze.webp", 92)


def hw_dial():
    """A dial plate: a plate of BRASS, its corners clipped, with what it
    chooses BY engraved into the metal across its upper band, a lacquer
    window sunk in its lower part where the choice is lettered, and a slotted
    screw at each end holding it to the rail. 9-slice (30 32 12 32).

    ROUND 19 GRAFT: all three judges picked KERMES's filter plates -- "screwed
    brass plates with engraved labels and inset selects, the most
    object-like filter bar in the round" -- over this plate as BICE painted
    it (near-black enamel in a gilt rim). The face is the metal now, and the
    screws are what make it a thing fixed to something."""
    W, H = 200, 72
    p = Pic(seed=26, n=W, h=H)
    c = 8
    body = P([(c, 2), (W - c, 2), (W - 2, c + 2), (W - 2, H - c - 2), (W - c, H - 2), (c, H - 2), (2, H - c - 2), (2, c + 2)])
    p.part(body, "brass", bevel=3.6, shadow=0)
    # an engraved border line inside the bevel, the way the samples' plates carry one
    p.ink([(12, 7), (W - 12, 7), (W - 7, 12), (W - 7, H - 12), (W - 12, H - 7), (12, H - 7), (7, H - 12), (7, 12)],
          w=.8, alpha=.45, closed=True)
    # the window, its lip a brass bead, sunk in the plate's lower part
    p.part(R(27, 29, W - 27, H - 10, 4), "brass", bevel=2, shadow=.45)
    p.part(R(29.5, 31.5, W - 29.5, H - 12.5, 2.5), ("#020103", "#0d0812", "#2e2238"), prof="recess", bevel=5, gloss=.12, shadow=0)
    # a slotted screw at each end, level with the window
    for x in (15, W - 15):
        p.part(E(x, 45.5, 5.2), "brass", prof="sphere", shadow=.5)
        a = math.radians(-35 if x < W / 2 else 25)
        dx, dy = 4.2 * math.cos(a), 4.2 * math.sin(a)
        p.ink([(x - dx, 45.5 - dy), (x + dx, 45.5 + dy)], w=1.1, alpha=.85)
    return _save_pic(p, "hw-dial.webp")


def hw_tag():
    """A brass tag, the kind tied to a key: a plate with its left end cut to
    a point, an eyelet with a twist of cord through it. Engraved figures are
    laid on it by the kit. 3-slice (44 | 20)."""
    W, H = 200, 56
    p = Pic(seed=27, n=W, h=H)
    body = [(22, 4), (W - 6, 4), (W - 3, 8), (W - 3, H - 8), (W - 6, H - 4), (22, H - 4), (5, H / 2)]
    p.part(P(body), "brass", bevel=4.5, shadow=0, cut=E(22, H / 2, 5.5), lift=-.12)
    p.part(E(22, H / 2, 7.5), "brass", bevel=2, shadow=.3, cut=E(22, H / 2, 4.6))
    p.ink([(33, 9), (W - 10, 9)], w=.7, alpha=.35)
    p.ink([(33, H - 9), (W - 10, H - 9)], w=.7, alpha=.35)
    return _save_pic(p, "hw-tag.webp")


def hw_slip():
    """A slip of old card to write on: torn along its ends, foxed, a ruled
    ink baseline. 3-slice (36 ends)."""
    W, H = 300, 60
    ss = 4
    rng = np.random.default_rng(28)
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    # deckled top and bottom, torn ends
    top = 4 + noise((1, SW), rng, ss * 3)[0] * 1.6 + noise((1, SW), rng, ss * .6)[0] * .7
    bot = H - 4 + noise((1, SW), rng, ss * 3)[0] * 1.6 + noise((1, SW), rng, ss * .6)[0] * .7
    lft = 5 + noise((SH, 1), rng, ss * 2)[:, 0] * 2.6 + noise((SH, 1), rng, ss * .5)[:, 0] * 1.2
    rgt = W - 5 + noise((SH, 1), rng, ss * 2)[:, 0] * 2.6 + noise((SH, 1), rng, ss * .5)[:, 0] * 1.2
    m = (yy > top[None, :]) & (yy < bot[None, :]) & (xx > lft[:, None]) & (xx < rgt[:, None])
    m = ndimage.gaussian_filter(m.astype(np.float32), ss * .35)
    d = inside_distance(m > .5) / ss
    base = ramp(np.clip(yy / H, 0, 1), [(0, "#e8d7b0"), (.6, "#d9c393"), (1, "#c3a774")])
    fib = noise((SH, SW), rng, ss * .5) * .05 + noise((SH, SW), rng, ss * 8) * .09
    col = base * (1 + fib[..., None])
    # foxing and an aged edge
    fox = np.zeros((SH, SW), np.float32)
    for _ in range(9):
        cx, cy, r = rng.uniform(10, W - 10), rng.uniform(8, H - 8), rng.uniform(.8, 2.4)
        fox += np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)))
    col = col * (1 - np.clip(fox, 0, 1)[..., None] * np.array([.18, .28, .42], np.float32))
    edge = 1 - smooth(0, 6, d)
    col = col * (1 - edge[..., None] * np.array([.22, .32, .48], np.float32))
    col = col * (1 - (1 - smooth(0, .9, d))[..., None] * .55)
    # the ruled baseline, in the clerk's brown
    rule = np.exp(-((yy - (H - 15)) / .45) ** 2) * (xx > 16) * (xx < W - 16)
    col = col * (1 - rule[..., None] * .45) + np.array([96, 58, 24], np.float32) * rule[..., None] * .45
    col = down(col, ss)
    a = down(m, ss)
    save(np.dstack([col, a * 255]), "hw-slip.webp", 90)



def hw_plate():
    """The engraved plate a reading is lettered on: near-black enamel in a
    gilt rim, its corners clipped like the panels', and a cast brass boss
    capping each end. 9-slice (14 30 14 30)."""
    W, H = 200, 56
    p = Pic(seed=29, n=W, h=H)
    c = 11
    body = P([(c, 2), (W - c, 2), (W - 2, c), (W - 2, H - c), (W - c, H - 2), (c, H - 2), (2, H - c), (2, c)])
    p.part(body, "brass", bevel=3.4, shadow=0)
    p.part(body, PLATE, prof="round", bevel=2.5, gloss=.1, erode=4.4, shadow=.5)
    p.ink([(26, 9), (W - 26, 9)], w=.8, color="#b08a4a", alpha=.35)
    p.ink([(26, H - 9), (W - 26, H - 9)], w=.8, color="#b08a4a", alpha=.35)
    plain = p.result()
    for x in (14, W - 14):
        p.part(E(x, H / 2, 8), "brass", bevel=3, shadow=.45)
        p.part(E(x, H / 2, 3.6), ("#140a22", "#4b2f78", "#b393ea"), prof="sphere", gloss=.8, power=40, shadow=.3)
    # the same plate without its bosses, for a row of positions where the
    # lettering needs the plate's whole length (.kit-hw-choice)
    save(plain, "hw-plate-plain.webp", 92)
    return _save_pic(p, "hw-plate.webp")


def hardware():
    hw_knob(); hw_groove(); hw_switch(); hw_lever(); hw_cog(); hw_finial(); hw_well(); hw_glaze(); hw_dial(); hw_tag(); hw_slip(); hw_plate()


# ── the run rail ──────────────────────────────────────────────────────────────
RAIL_H, RAIL_DROP = 64, 26       # the rail, and the finials hanging under its end blocks


def _rail_end(p, side, W, H):
    """One carved end block (round 20 graft, after MALACHITE's): a brass
    pilaster the rail's height whose inner edge steps out in an ogee over the
    face, a panel of the plates' enamel sunk in it, a milled rosette boss --
    eight turned petals round a violet cabochon -- a stud top and foot where
    it is fixed, and under the foot a TURNED FINIAL hanging clear of the rail:
    a collar, a bead and a cone. Drawn for the left end; the right is its
    mirror."""
    def X(x):
        return x if side == 0 else W - x

    def PX(pts):
        return P([(X(x), y) for x, y in pts])
    cx = 22.0
    # the finial first, so the block's foot overlaps its collar
    p.part(R(min(X(12), X(32)), H - 2, max(X(12), X(32)), H + 3.5, 1.5), "brass", bevel=1.8, shadow=.5)
    p.part(E(X(cx), H + 9.5, 6.4), "brass", prof="sphere", shadow=.5)
    p.part(PX([(cx - 5.2, H + 13.5), (cx + 5.2, H + 13.5), (cx, H + RAIL_DROP - .6)]), "brass", bevel=3, shadow=.4)
    p.part(E(X(cx), H + 13.6, 5.4, 1.3), "brass", prof="sphere", shadow=.3)
    blk = [(0, 1.5), (40, 1.5), (40, 5), (45.5, 10), (45.5, H - 10), (40, H - 5), (40, H - 1), (0, H - 1)]
    p.part(PX(blk), "brass", bevel=4.2, shadow=.6)
    p.part(R(min(X(6.5), X(37.5)), 7, max(X(6.5), X(37.5)), H - 7, 2), PLATE, prof="recess", bevel=2.6, gloss=.1, shadow=0)

    def knurl(xx, yy):
        a = np.arctan2(yy - H / 2, xx - X(cx))
        r = np.hypot(xx - X(cx), yy - H / 2)
        return 0.6 * np.cos(a * 18) * smooth(10.5, 13, r)
    p.part(E(X(cx), H / 2, 13.4), "brass", bevel=4.4, bump=knurl, shadow=.5)
    for i in range(8):
        a = math.radians(i * 45 + 22.5)
        p.part(E(X(cx) + 6.9 * math.cos(a), H / 2 + 6.9 * math.sin(a), 3.3), "brass", prof="sphere", shadow=.25)
    p.part(E(X(cx), H / 2, 5.2), ("#140a22", "#4b2f78", "#b393ea"), prof="sphere", gloss=.9, power=46, shadow=.35)
    p.paint(E(X(cx) - 1.5, H / 2 - 1.6, 1.7, 1.2), "#ffffff", .7, blur=.3)
    for y in (4.6, H - 4.4):
        p.part(E(X(cx), y, 1.9), "brass", prof="sphere", shadow=.3)


def hw_rail():
    """THE RUN RAIL (round 20): the strip across the top of every run screen
    as ONE carved object made of the same hardware as the boards' controls.

    Three judges of round 19, like round 6's, read the strip as "a toolbar of
    pills": a row of separate plates on a band. This is the rail itself: a
    half-round brass moulding along its top over a brass fillet (the double
    gilt rule), a face of the nameplates' near-black enamel BRUSHED along its
    length, its upper edge caught by the light where it turns under the
    moulding, and a single CHANNEL sunk the length of it behind a brass bead
    -- the readouts are set into that channel, never laid on the face as
    plates. A fillet and a smaller bead make its foot. Each end is a carved
    end block (`_rail_end`, after MALACHITE's) with a finial hanging under it.

    ROUND 20 GRAFT: the judges read round 20's rail as "a flat dark capsule
    with no bevel or cast shadow". The brushing, the lit upper bevel, the
    double rules and MALACHITE's carved ends are its relief; the cast shadow
    is the kit's (`.mm-hud::after`), and the dead length of channel is filled
    with an engraved gilt vine (hw-rail-vine.webp).

    1024x90: the rail is the top 64, the finials hang in the 26 under it. A
    9-slice for `.mm-hud`'s border-image: 26 top, 52 bottom (26 of it laid
    out BELOW the box with border-image-outset), 72 each end; the middle runs
    uniform along x so it stretches clean."""
    W, H, DROP = 1024, RAIL_H, RAIL_DROP
    p = Pic(seed=40, n=W, h=H + DROP)
    e = 72                                        # the end blocks' slice
    rng = np.random.default_rng(4040)
    rows = ndimage.gaussian_filter1d(rng.normal(0, 1, (H + DROP) * p.ss), .8)
    rows /= np.abs(rows).max()

    def brushed(xx, yy, c):
        # fine streaks along the length, the way a lacquered face is rubbed
        # down; they vary only across the rail, so the 9-slice stretches clean
        k = np.clip((yy * p.ss).astype(int), 0, rows.size - 1)
        return c * (1 + .16 * rows[k])[..., None]
    # the face, the whole length, in the plates' enamel over a brass carcass
    p.part(R(0, 0, W, H), "brass", bevel=2.2, shadow=0, ink=0)
    p.part(R(0, 5.5, W, H - 5), PLATE, prof="round", bevel=1.6, gloss=.08, shadow=.6, ink=.5, tex=brushed)
    # the face's upper bevel, lit where it turns under the moulding
    p.paint(R(0, 7.2, W, 8.1), "#a58cc0", .55, blur=.35)
    p.paint(R(0, H - 7.4, W, H - 6.9), "#000000", .6, blur=.3)
    # the channel's brass bead, and the channel sunk inside it
    x0, x1, y0, y1 = 50, W - 50, 13.5, H - 12.5
    rr = (y1 - y0) / 2
    p.part(R(x0 - 2.2, y0 - 2.2, x1 + 2.2, y1 + 2.2, rr + 2.2), "brass", bevel=1.8, shadow=.45)
    p.part(R(x0, y0, x1, y1, rr), ("#010002", "#0a0610", "#281b33"), prof="recess", bevel=5, gloss=.1, shadow=0)
    # the light the candles put along the channel's lower lip
    p.paint(R(x0 + rr, y1 - 1.4, x1 - rr, y1 - .5), "#5a4468", .45, blur=.4)
    # the top: a half-round brass bead, and under it a brass fillet -- the
    # double gilt rule that runs the rail's length
    p.part(R(0, 0, W, 5.2, 0), "brass", prof="sphere", shadow=.7, ink=.6)
    p.part(R(0, 5.9, W, 7.1, 0), "brass", prof="sphere", shadow=.4, ink=.4)
    # the foot: a fillet, then a smaller bead
    p.part(R(0, H - 6.4, W, H - 5.4, 0), "brass", prof="sphere", shadow=.35, ink=.4)
    p.part(R(0, H - 4.8, W, H - 1.0, 0), "brass", prof="sphere", shadow=.5, ink=.6)
    p.paint(R(0, H - 1.0, W, H), "#0a0508", 1.0)
    for side in (0, 1):
        _rail_end(p, side, W, H)
    return _save_pic(p, "hw-rail.webp")


def hw_rail_vine():
    """ROUND 20 GRAFT (after MALACHITE's rail face): a running vine ENGRAVED
    in the channel's floor and gilded, for the length of channel no readout
    stands in -- on the map and in a fight a third of the rail between "No
    Keepsakes" and the Turn was empty. A stem waving every 64 px with a curl
    thrown off each crest and a leaf before it, cut dark, gilt in the groove
    and caught on its lower lip. Transparent round the cut, so the channel's
    own floor shows; periodic in 128, so it tiles along x. 128x40, the
    channel's inner height in the rail's 64 (y 13.5..51.5, less the lips)."""
    W, H, ss = 128, 40, 4
    SW, SH = W * ss, H * ss
    im = Image.new("L", (SW, SH), 0)
    vd = ImageDraw.Draw(im)
    Pp, mid, amp = 64.0, 20.5, 6.4
    pts = [(x / ss, mid + amp * math.sin(2 * math.pi * (x / ss) / Pp)) for x in range(-ss * 16, SW + ss * 16, 2)]
    vd.line([(x * ss, y * ss) for x, y in pts], fill=255, width=int(round(1.15 * ss)))
    for k in range(-1, int(W / Pp) + 2):
        for side in (0, 1):
            sg = 1 if side == 0 else -1
            cx = k * Pp + Pp * (0.25 + 0.5 * side)
            cy = mid - sg * amp
            ox, oy = cx + 6.5, cy + sg * 4.8
            curl = []
            for i in range(60):
                t = i / 59
                a = -math.pi / 2 - 0.3 + t * 3.2 * math.pi
                r = 5.1 * (1 - 0.8 * t)
                curl.append((ox + r * math.cos(a), oy + sg * r * math.sin(a)))
            vd.line([(x * ss, y * ss) for x, y in curl], fill=255, width=int(round(.95 * ss)), joint="curve")
            lx = cx - 8.5
            sy = mid + amp * math.sin(2 * math.pi * lx / Pp)
            vd.polygon([((lx - 2.6) * ss, sy * ss), ((lx + 1.3) * ss, (sy + sg * .5) * ss),
                        ((lx + 2.8) * ss, (sy - sg * 4.5) * ss), ((lx - 1.0) * ss, (sy - sg * 2.8) * ss)], fill=255)
    vm = ndimage.gaussian_filter(np.asarray(im, np.float32) / 255.0, ss * .25, mode="wrap")
    lip = np.clip(ndimage.shift(vm, (ss * 0.9, 0), order=1, mode="wrap") - vm, 0, 1)
    wall = np.clip(ndimage.shift(vm, (-ss * 0.8, 0), order=1, mode="wrap") - vm, 0, 1)
    col = (hexc("#8a6630")[None, None, :] * vm[..., None]
           + hexc("#d9b870")[None, None, :] * lip[..., None]
           + hexc("#030102")[None, None, :] * wall[..., None])
    a = np.clip(vm * .92 + lip * .8 + wall * .7, 0, 1)
    col = col / np.maximum(vm + lip + wall, 1e-4)[..., None]
    out = np.dstack([down(col * a[..., None], ss) / np.maximum(down(a, ss), 1e-4)[..., None], down(a, ss) * 255])
    save(out, "hw-rail-vine.webp", 92)
    return out


def hw_rail_stud():
    """A carved stud struck into the channel between two readouts (round 20
    graft: a judge read the turned mullions as a web page's hairline
    separators). A milled brass boss with a bead round it, domed, the way
    the end blocks are fixed; 24 square."""
    p = Pic(seed=43, n=24, h=24, ss=8)

    def knurl(xx, yy):
        a = np.arctan2(yy - 12, xx - 12)
        r = np.hypot(xx - 12, yy - 12)
        return 0.35 * np.cos(a * 14) * smooth(7.5, 9.5, r)
    p.part(E(12, 12, 10.2), "brass", bevel=2.6, bump=knurl, shadow=0, ink=.8)
    p.ink(arc_pts(12, 12, 6.6, 6.6, 0, 360, 40), w=.7, alpha=.7)
    p.part(E(12, 12, 5.6), "brass", prof="sphere", shadow=.45, ink=.6)
    p.paint(E(10.4, 10.2, 1.6, 1.1), "#fff4d6", .75, blur=.35)
    return _save_pic(p, "hw-rail-stud.webp")


def hw_rail_well():
    """A plate SUNK into the rail where words are engraved rather than a
    readout set (round 20 graft, MALACHITE's window): a brass lip, its
    corners clipped like the panels', round a recess of the nameplates'
    near-black enamel whose upper wall is in the lip's shadow, a gilt
    hairline engraved round its floor. 9-slice, 14 all round."""
    W, H = 120, 48
    p = Pic(seed=2022, n=W, h=H)
    c = 7
    lip = P([(c, 1), (W - c, 1), (W - 1, c), (W - 1, H - c), (W - c, H - 1), (c, H - 1), (1, H - c), (1, c)])
    p.part(lip, "brass", bevel=2.2, shadow=0)
    c2 = 5.2
    i0, i1 = 3.6, W - 3.6
    j0, j1 = 3.6, H - 3.6
    rec = P([(i0 + c2, j0), (i1 - c2, j0), (i1, j0 + c2), (i1, j1 - c2), (i1 - c2, j1), (i0 + c2, j1), (i0, j1 - c2), (i0, j0 + c2)])
    p.part(rec, ("#020103", "#0e0913", "#2c2034"), prof="recess", bevel=4.4, gloss=.12, shadow=0)
    p.ink([(9, 7.5), (W - 9, 7.5), (W - 7.5, 9), (W - 7.5, H - 9), (W - 9, H - 7.5), (9, H - 7.5), (7.5, H - 9), (7.5, 9)],
          w=.55, color="#8a6a36", alpha=.42, closed=True)
    return _save_pic(p, "hw-rail-well.webp")


def hw_tray():
    """The tray a folded group opens: a drawer let down under the rail, its
    front the plates' enamel in a brass rim with clipped lower corners.
    9-slice (14 30 22 30)."""
    W, H = 200, 96
    p = Pic(seed=42, n=W, h=H)
    c = 12
    body = P([(2, 0), (W - 2, 0), (W - 2, H - c), (W - c, H - 2), (c, H - 2), (2, H - c)])
    p.part(body, "brass", bevel=3.4, shadow=0)
    p.part(body, PLATE, prof="round", bevel=2.5, gloss=.1, erode=4.4, shadow=.5)
    p.ink([(12, 9), (W - 12, 9)], w=.8, color="#b08a4a", alpha=.4)
    p.ink([(18, H - 10), (W - 18, H - 10)], w=.8, color="#b08a4a", alpha=.4)
    for x in (10, W - 10):
        p.part(E(x, H - 14, 2.6), "brass", prof="sphere", shadow=.35)
    return _save_pic(p, "hw-tray.webp")


def rail_pieces():
    hw_rail(); hw_rail_vine(); hw_rail_stud(); hw_rail_well(); hw_tray()


# materials (dark, body, light), all in the samples' low key
PLATE = ("#07050a", "#1a1222", "#3d2d4c")      # the nameplates' near-black enamel
PAPER = ("#5d5140", "#c9b48c", "#f4e6c2")
BONE = ("#5b5244", "#cfc2a6", "#fbf3df")
CHALK = ("#6a655c", "#d9d3c4", "#fffbf0")
WOOD = ("#2a190e", "#6e4a2c", "#a87c50")
LEATHER = ("#261410", "#5e3322", "#98603f")
VELVET = ("#1c0f26", "#4a2d6a", "#8c67bd")
WINE = ("#2a0a12", "#7a1f33", "#c8566a")
BLACK = ("#0b0a0f", "#27232e", "#5a5466")
GLASS = ("#16202c", "#4b6377", "#b9d2e2")
AMBER = ("#3a1a04", "#9a5a14", "#f0b457")
CANDY_R = ("#3d0913", "#b52a44", "#ff8fa0")
CANDY_V = ("#1d0d33", "#6b3fae", "#c7a5f2")
MINT = ("#0f2a24", "#3f8f78", "#a9ead3")
GREEN = ("#12200d", "#4a6b2b", "#9ec06a")
WAX = ("#5c5040", "#d9ccb0", "#fff7e4")
FLAME = "#ffb35c"


# ── the objects ─────────────────────────────────────────────────────────────
# they are drawn in tools/hw_objects.py, one function each, with the helpers above


def objects(only=None):
    from hw_objects import OBJECTS
    os.makedirs(OBJ_OUT, exist_ok=True)
    out = {}
    for i, (k, fn) in enumerate(OBJECTS.items()):
        if only and k not in only:
            continue
        p = Pic(seed=100 + i)
        fn(p)
        arr = p.result()
        out[k] = arr
        path = os.path.join(OBJ_OUT, f"{k}.webp")
        Image.fromarray(arr.astype(np.uint8), "RGBA").save(path, "WEBP", quality=90, method=6)
    print(f"  objects: {len(out)} -> {os.path.relpath(OBJ_OUT, ROOT)}")
    return out


def sheet(objs, path):
    """Every object at 96, and in its velvet well at the sizes the boards show
    it (44 and 32), on the boards' ground."""
    keys = list(objs)
    cols = 8
    cell = 160
    rows = (len(keys) + cols - 1) // cols
    im = Image.new("RGB", (cols * cell, rows * cell), (22, 14, 28))
    dr = ImageDraw.Draw(im)
    well = Image.open(os.path.join(OUT, "hw-well.webp")).convert("RGBA")
    for i, k in enumerate(keys):
        x, y = (i % cols) * cell, (i // cols) * cell
        o = Image.fromarray(objs[k].astype(np.uint8), "RGBA")
        im.paste(o, (x + 4, y + 4), o)
        for j, sz in enumerate((44, 32)):
            w = well.resize((sz, sz), Image.LANCZOS)
            ob = o.resize((int(sz * .96), int(sz * .96)), Image.LANCZOS)
            px, py = x + 108, y + 8 + j * 56
            im.paste(w, (px, py), w)
            im.paste(ob, (px + (sz - ob.width) // 2, py + (sz - ob.height) // 2), ob)
        dr.text((x + 4, y + 142), k, fill=(220, 200, 160))
    im.save(path)
    print("  sheet ->", path)


GROUPS = {"objects": objects, "hardware": hardware, "rail": rail_pieces}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--obj", default="", help="comma-separated object keys")
    ap.add_argument("--sheet", action="store_true")
    a = ap.parse_args()
    names = [s for s in a.only.split(",") if s] or ["hardware", "rail", "objects"]
    for nm in names:
        if nm == "objects":
            objs = objects([s for s in a.obj.split(",") if s] or None)
            if a.sheet:
                sheet(objs, os.path.join(ROOT, "shots", "objects-sheet.png"))
        else:
            GROUPS[nm]()


if __name__ == "__main__":
    main()
