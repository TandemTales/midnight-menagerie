"""Paint the kids' timber: the Treehouse room, Headquarters' plank wall, the shelf.

Round 4's judges held the Treehouse to its render: its beams and its shelf were
"flat evenly lit brown strips", and behind the framed panels hung the mansion's
wallpaper where a treehouse has boards. Round 5's brief asks for painted timber
— beams and the shelf plank with grain and candle falloff, plank walls, a window
and bark behind the framed panels — and for Headquarters to stand against the
same timber, so the two kids' places match.

Painted by the kit's hand (tools/prep_ui_materials.py renders, tools/prep_ui_paint.py
paints): height fields lit from the boards' top left, the samples' dark ink round
every form, a Kuwahara brush pass, nothing ruled. Each room is painted three
times — in the dark, under candle light, under moonlight — and a board reveals
the lit versions only where its lights are (.kit-ground__warm / __moon).
The candles' falloff is also painted INTO every version, round the places the
boards hang their lights, so a pool of light shows grain warming out of the dark
rather than an evenly lit strip.

Outputs (game/assets/ui/kit/):

  treeroom.webp        the Treehouse in the dark: a grained roof beam, two squared
                       posts and a nailer rail, clapboard plank walls, a window
                       onto the night in the upper left bay, the tree's own trunk
                       coming up through the floor on the right, floorboards
                                                           (.kit-ground--treeroom)
  treeroom-warm.webp   the same under candle light
  treeroom-moon.webp   the same under moonlight
  clapboard.webp       Headquarters' wall: the same timber and planks, tinted
                       further toward aubergine, no window or trunk
                                                           (.kit-ground--clapboard)
  clapboard-warm.webp  the same under candle light
  clapboard-moon.webp  the same under moonlight
  shelfboard.webp      a long shelf plank seen from just above, grain drawn in
                       at a size that reads on screen, two boards butted, with
                       its shadow; tiles left to right          (.kit-sill--grain)

    python tools/prep_kids_timber.py                       # everything
    python tools/prep_kids_timber.py --only treeroom       # one piece
    python tools/prep_kids_timber.py --only treeroom --preview DIR   # PNGs too

Run after tools/prep_ui_paint.py (it borrows the painter's felt tooth, brush and
Kuwahara pass).
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  the kit's renderer
import prep_ui_paint as P      # noqa: E402  the kit's painter

OUT = M.OUT
hexc, ramp, smooth = M.hexc, M.ramp, M.smooth
normals, lambert, specular = M.normals, M.lambert, M.specular
PREVIEW = None
TAU = np.float32(2 * np.pi)


def save(arr, name, quality=88):
    path = M.save(arr, name, quality)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        a = np.clip(arr, 0, 255).astype(np.uint8)
        Image.fromarray(a).save(os.path.join(PREVIEW, os.path.splitext(name)[0] + ".png"))
    return path


# ── noise, cheaply ───────────────────────────────────────────────────────────
def lr_aniso(H, W, rng, sx, sy):
    """aniso_noise's smear (sigma sx along x, sy along y), filtered at the
    coarsest resolution the smaller sigma allows and resized up."""
    d = int(max(1, min(sx, sy) // 2))
    h, w = max(4, H // d), max(4, W // d)
    n = rng.normal(0, 1, (h, w)).astype(np.float32)
    n = ndimage.gaussian_filter(n, (max(sy / d, 0.4), max(sx / d, 0.4)), mode="wrap")
    if (h, w) != (H, W):
        n = P.resize_f(n, W, H)
    return n / (np.abs(n).max() + 1e-6)


def lr_noise(H, W, rng, sigma):
    return lr_aniso(H, W, rng, sigma, sigma)


# ── wood ─────────────────────────────────────────────────────────────────────
def grain(H, W, rng, period=11.0, wander=24.0, arches=0, knots=()):
    """Flat-sawn timber along x, in a member's own H x W box.

    Returns (tone, ink): tone is the slow figure of the wood (about 0..1), ink the
    grain drawn in — long wandering dark lines, broken where a dry brush skipped,
    nested into arches where the saw cut across the rings, swirling round knots.
    """
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    figure = lr_aniso(H, W, rng, 240, 12)
    fine = lr_aniso(H, W, rng, 60, 2.0)
    phase = yy + figure * wander + fine * 2.6
    for _ in range(arches):
        ax = rng.uniform(0, W)
        aw = rng.uniform(140, 320)
        amp = rng.uniform(-1, 1) * rng.uniform(18, 46)
        phase = phase + amp * np.exp(-((xx - ax) / aw) ** 2)
    knot_core = np.zeros((H, W), np.float32)
    for kx, ky, kr in knots:
        d = np.hypot((xx - kx) / (kr * 1.7), (yy - ky) / kr)
        phase = phase + 16 * np.exp(-(d ** 2) / 1.6) * np.sign(yy - ky + 0.01)
        knot_core = np.maximum(knot_core, np.clip(1.25 - d, 0, 1))
    lines = 0.5 + 0.5 * np.cos(TAU * phase / period)
    skip = np.clip(lr_aniso(H, W, rng, 90, 3) * 1.3 + 0.55, 0, 1)
    ink = np.clip((lines - 0.80) * 5.0, 0, 1) * (0.35 + 0.65 * skip)
    # a second, finer set between the strong lines, much lighter
    lines2 = 0.5 + 0.5 * np.cos(TAU * (phase + period * 0.5) / (period * 0.5))
    ink = np.maximum(ink, np.clip((lines2 - 0.9) * 6.0, 0, 1) * 0.28 * skip)
    ink = np.maximum(ink, knot_core ** 0.8 * 0.85)
    tone = 0.5 + figure * 0.16 + fine * 0.08 + lr_noise(H, W, rng, 30) * 0.06 - knot_core * 0.2
    return tone, ndimage.gaussian_filter(ink, 0.55)


def grain_v(H, W, rng, **kw):
    """grain() for a member running up and down."""
    if "knots" in kw:
        kw["knots"] = [(ky, kx, kr) for kx, ky, kr in kw["knots"]]
    t, i = grain(W, H, rng, **kw)
    return np.ascontiguousarray(t.T), np.ascontiguousarray(i.T)


WOOD_WALL = ("#170c14", "#382229", "#583a3b")    # dark, base, light: boards
WOOD_FRAME = ("#140a0d", "#3b2320", "#603f32")   # posts, beam, rail: older, redder
WOOD_FLOOR = ("#10090c", "#2d1c1d", "#48302b")
BARK = ("#0c070b", "#342830", "#5c4c4c")


def wood_col(tone, pal, gain=1.0):
    d, b, l = pal
    return ramp(np.clip(tone, 0, 1), [(0.0, d), (0.5, b), (1.0, l)]) * gain


# ═════════════════════════════════════════════════════════════════════════════
# THE ROOM
# A treehouse a child's hands built round a tree: square posts and a roof beam
# someone dragged up a ladder, clapboards nailed across them, a window cut in
# the boards, and the trunk itself coming up through the floor.
# ═════════════════════════════════════════════════════════════════════════════
W0, H0 = 1920, 1080
BEAM = (0, 70)             # the roof beam; lobby.css hangs cobwebs and charms off its foot
RAIL = (640, 684)          # the nailer rail
FLOOR = 944                # floorboards
POSTS = (372, 1548)        # squared posts; lobby.css reads these two as --lo-post-l / -r
POST_W = 74


class Layers:
    """The painting's working state: albedo, relief, gloss, lit edges, drawn ink."""

    def __init__(self, H, W):
        self.alb = np.zeros((H, W, 3), np.float32)
        self.hgt = np.zeros((H, W), np.float32)
        self.gloss = np.zeros((H, W), np.float32)
        self.lip = np.zeros((H, W), np.float32)
        self.ink = np.zeros((H, W), np.float32)      # grain and outline, drawn after the paint pass
        self.glass = np.zeros((H, W), np.float32)    # where the window's night shows (emissive)
        self.view = np.zeros((H, W, 3), np.float32)  # what is seen through it

    def put(self, sel, alb=None, hgt=None, gloss=None, ink=None):
        s3 = sel[..., None]
        if alb is not None:
            self.alb = np.where(s3, alb, self.alb)
        if hgt is not None:
            self.hgt = np.where(sel, hgt, self.hgt)
        if gloss is not None:
            self.gloss = np.where(sel, gloss, self.gloss)
        if ink is not None:
            self.ink = np.where(sel, ink, self.ink)


def clapboards(L, rng, y0, y1, pal=WOOD_WALL, studs=(), tint=1.0):
    """Horizontal lapped boards between y0 and y1 across the whole width: each
    board's foot stands proud of the one below and throws a shadow on it; butt
    joints where two lengths meet; a nail through each board at every stud."""
    H, W = L.hgt.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    y = float(y0)
    while y < y1 - 8:
        bh = rng.uniform(50, 64)
        top, bot = y, min(y + bh, y1)
        wob_t = P.wob1d(W, rng, 260, 1.4)[None, :]
        wob_b = P.wob1d(W, rng, 260, 1.6)[None, :]
        sel = (yy >= top + wob_t) & (yy < bot + wob_b)
        t = np.clip((yy - top - wob_t) / max(bot - top, 1), 0, 1)
        # lengths of board along the row
        x = -rng.uniform(0, 500)
        while x < W:
            ln = rng.uniform(420, 980)
            seg = sel & (xx >= x) & (xx < x + ln)
            if seg.any():
                knots = []
                if rng.random() < 0.55:
                    knots.append((rng.uniform(40, ln - 40), rng.uniform(12, bh - 12), rng.uniform(4, 7)))
                gx0 = int(max(0, np.floor(x))); gx1 = int(min(W, np.ceil(x + ln)))
                gy0 = int(max(0, np.floor(top - 3))); gy1 = int(min(H, np.ceil(bot + 3)))
                bw, bhh = gx1 - gx0, gy1 - gy0
                if bw > 2 and bhh > 2:
                    kn = [(kx - (gx0 - x), ky + (top - gy0), kr) for kx, ky, kr in knots]
                    tone, ink = grain(bhh, bw, rng, period=rng.uniform(9.5, 12.5),
                                      wander=rng.uniform(14, 26), arches=int(rng.integers(0, 3)), knots=kn)
                    tone = tone + rng.uniform(-0.12, 0.08)
                    col = wood_col(tone, pal, tint)
                    sub = seg[gy0:gy1, gx0:gx1]
                    L.alb[gy0:gy1, gx0:gx1] = np.where(sub[..., None], col, L.alb[gy0:gy1, gx0:gx1])
                    L.ink[gy0:gy1, gx0:gx1] = np.where(sub, ink * 0.85, L.ink[gy0:gy1, gx0:gx1])
                # the butt joint at this length's end
                jx = x + ln
                joint = sel & (np.abs(xx - jx) < 1.4)
                L.ink = np.where(joint, 0.9, L.ink)
            x += ln
        # the lapped face: proud at its foot, tucked under the board above at its head
        L.hgt = np.where(sel, 6 + t * 7, L.hgt)
        L.gloss = np.where(sel, 0.12, L.gloss)
        # the shadow the foot of the board above throws across this one's head
        head = sel & (t < 0.3)
        L.alb = np.where(head[..., None], L.alb * (0.45 + 0.55 * smooth(0, 0.3, t))[..., None], L.alb)
        # the foot's own lit lip, broken
        foot = np.exp(-((yy - bot - wob_b + 2.2) / 1.3) ** 2) * sel
        L.lip = np.maximum(L.lip, foot * 0.5 * np.clip(lr_aniso(H, W, rng, 70, 2) + 0.5, 0, 1))
        # nails at the studs, near the board's foot
        for sx in studs:
            nx = sx + rng.uniform(-5, 5)
            ny = bot - rng.uniform(9, 13)
            nail(L, xx, yy, nx, ny, rng)
        y = bot
    return L


def nail(L, xx, yy, nx, ny, rng, r=4.2):
    """An iron nail head, and the rust it has wept down the board. Worked in a
    small window round the head (xx, yy are only used for their shape)."""
    H, W = L.hgt.shape
    x0, x1 = int(max(0, nx - r - 4)), int(min(W, nx + r + 5))
    y0, y1 = int(max(0, ny - r - 4)), int(min(H, ny + r + 30))
    if x1 <= x0 or y1 <= y0:
        return
    wy, wx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.hypot(wx - nx, wy - ny)
    head = d < r
    lit = np.clip(1.0 - np.hypot(wx - nx + 1.4, wy - ny + 1.4) / r, 0, 1)
    alb = L.alb[y0:y1, x0:x1]
    run = np.exp(-((wx - nx) / 2.2) ** 2) * np.clip((wy - ny) / 16, 0, 1) * np.clip(1 - (wy - ny) / 26, 0, 1)
    alb = alb * (1 - 0.3 * run)[..., None] + np.array([70, 34, 16], np.float32) * (0.3 * run)[..., None]
    alb = np.where(head[..., None], ramp(lit, [(0, "#120c0b"), (0.55, "#3f3632"), (1, "#8f8173")]), alb)
    L.alb[y0:y1, x0:x1] = alb
    L.hgt[y0:y1, x0:x1] = np.where(head, L.hgt[y0:y1, x0:x1] + np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1)) * 2.5, L.hgt[y0:y1, x0:x1])
    L.gloss[y0:y1, x0:x1] = np.where(head, 0.7, L.gloss[y0:y1, x0:x1])
    ink = np.where(head, L.ink[y0:y1, x0:x1] * 0.2, L.ink[y0:y1, x0:x1])
    ring = (d >= r) & (d < r + 1.6)
    L.ink[y0:y1, x0:x1] = np.where(ring, np.maximum(ink, 0.55), ink)


def wainscot(L, rng, y0, y1, pal=WOOD_WALL):
    """Vertical boards under the rail, a dark gap between each."""
    H, W = L.hgt.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    x = -rng.uniform(10, 90)
    while x < W:
        bw = rng.uniform(112, 176)
        wob = P.wob1d(H, rng, 220, 1.4)[:, None]
        sel = (yy >= y0) & (yy < y1) & (xx >= x + wob) & (xx < x + bw + wob)
        gx0 = int(max(0, np.floor(x - 2))); gx1 = int(min(W, np.ceil(x + bw + 3)))
        if gx1 - gx0 > 2:
            knots = [(rng.uniform(10, bw - 10), rng.uniform(20, y1 - y0 - 20), rng.uniform(4, 7))] if rng.random() < 0.5 else []
            kn = [(kx + (x - gx0), ky, kr) for kx, ky, kr in knots]
            tone, ink = grain_v(y1 - y0, gx1 - gx0, rng, period=rng.uniform(10, 13), wander=rng.uniform(16, 28),
                                arches=int(rng.integers(0, 2)), knots=kn)
            tone = tone + rng.uniform(-0.14, 0.06)
            col = wood_col(tone, pal) * 0.92
            sub = sel[y0:y1, gx0:gx1]
            L.alb[y0:y1, gx0:gx1] = np.where(sub[..., None], col, L.alb[y0:y1, gx0:gx1])
            L.ink[y0:y1, gx0:gx1] = np.where(sub, ink * 0.8, L.ink[y0:y1, gx0:gx1])
        d = np.minimum(xx - x - wob, x + bw + wob - xx)
        L.hgt = np.where(sel, 4 + 4 * np.clip(d / 5, 0, 1) ** 0.6, L.hgt)
        gap = (yy >= y0) & (yy < y1) & (xx >= x + bw + wob) & (xx < x + bw + wob + rng.uniform(3, 5))
        L.alb = np.where(gap[..., None], np.array([7, 4, 6], np.float32), L.alb)
        L.hgt = np.where(gap, -3, L.hgt)
        x += bw + 4
    return L


def post(L, rng, cx, y0, y1, w=POST_W, pal=WOOD_FRAME):
    """A squared post: two faces meeting at a chamfered arris, the grain up it,
    a check split along the grain, its shadow on the boards to its right."""
    H, W = L.hgt.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    wob = P.wob1d(H, rng, 280, 1.8)[:, None]
    x0 = cx - w / 2 + wob
    x1 = cx + w / 2 + wob
    sel = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
    u = np.clip((xx - x0) / w, 0, 1)
    gx0, gx1 = int(max(0, cx - w / 2 - 4)), int(min(W, cx + w / 2 + 5))
    if gx1 <= gx0:
        return L
    knots = [(rng.uniform(16, w - 16), rng.uniform(200, y1 - y0 - 200), rng.uniform(5, 8)) for _ in range(2)]
    kn = [(kx + (cx - w / 2 - gx0), ky, kr) for kx, ky, kr in knots]
    tone, ink = grain_v(y1 - y0, gx1 - gx0, rng, period=12.5, wander=30, arches=2, knots=kn)
    col = wood_col(tone + 0.02, pal)
    sub = sel[y0:y1, gx0:gx1]
    L.alb[y0:y1, gx0:gx1] = np.where(sub[..., None], col, L.alb[y0:y1, gx0:gx1])
    L.ink[y0:y1, gx0:gx1] = np.where(sub, ink, L.ink[y0:y1, gx0:gx1])
    # two faces: the left one turned to the room's light; chamfers at both arrises
    face = np.where(u < 0.46, 16 + u * 10, 20.6 - (u - 0.46) * 15)
    bev = np.clip(np.minimum(xx - x0, x1 - xx) / 5.5, 0, 1) ** 0.6
    L.hgt = np.where(sel, face * bev + 12, L.hgt)
    L.gloss = np.where(sel, 0.22, L.gloss)
    L.alb = np.where(sel[..., None], L.alb * (0.92 + 0.16 * (u < 0.46))[..., None], L.alb)
    # a check: a long split along the grain
    for _ in range(2):
        ck_x = cx - w / 2 + rng.uniform(12, w - 12)
        ck_y0 = rng.uniform(y0 + 80, y1 - 400)
        ck_len = rng.uniform(140, 320)
        cw = P.wob1d(H, rng, 60, 2.2)[:, None]
        along = (yy >= ck_y0) & (yy < ck_y0 + ck_len)
        taper = np.clip(np.minimum(yy - ck_y0, ck_y0 + ck_len - yy) / 40, 0, 1)
        split = np.exp(-((xx - ck_x - wob - cw) / (0.7 + 0.9 * taper)) ** 2) * along * sel
        L.ink = np.maximum(L.ink, split * 0.95)
        L.hgt = L.hgt - split * 3
    # its lit arris
    lipline = np.exp(-((xx - x0 - 4.5) / 1.6) ** 2) * sel
    L.lip = np.maximum(L.lip, lipline * 0.55 * np.clip(lr_aniso(H, W, rng, 3, 60) + 0.6, 0, 1))
    # the post's shadow on the boards beside it (light from the top left)
    sh = (xx >= x1) & (xx < x1 + 34) & (yy >= y0) & (yy < y1)
    L.alb = np.where(sh[..., None], L.alb * (0.52 + 0.48 * smooth(0, 34, xx - x1))[..., None], L.alb)
    return L


def beam_h(L, rng, y0, y1, pal=WOOD_FRAME, bolts=(), chamfer=True, tone_gain=1.0):
    """A horizontal timber across the whole width: the grain along it, a chamfer
    on its lower arris, iron bolts where it crosses a post, its shadow below."""
    H, W = L.hgt.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    wob = P.wob1d(W, rng, 320, 1.6)[None, :]
    ys = yy - wob
    sel = (ys >= y0) & (ys < y1)
    gy0, gy1 = int(max(0, y0 - 3)), int(min(H, y1 + 3))
    knots = [(rng.uniform(80, W - 80), rng.uniform(10, (y1 - y0) - 10) + (y0 - gy0), rng.uniform(5, 9)) for _ in range(4)]
    tone, ink = grain(gy1 - gy0, W, rng, period=13.0, wander=22, arches=5, knots=knots)
    col = wood_col(tone, pal, tone_gain)
    sub = sel[gy0:gy1]
    L.alb[gy0:gy1] = np.where(sub[..., None], col, L.alb[gy0:gy1])
    L.ink[gy0:gy1] = np.where(sub, ink, L.ink[gy0:gy1])
    depth = y1 - y0
    t = np.clip(ys - y0, 0, depth)
    prof = 24 + np.where(t > depth - 9, -(t - (depth - 9)) * 1.6, 0) if chamfer else 24 + 0 * t
    prof = prof + np.where(t < 5, -(5 - t) * 1.2, 0)
    L.hgt = np.where(sel, prof, L.hgt)
    L.gloss = np.where(sel, 0.26, L.gloss)
    # checks along the beam
    for _ in range(3):
        cy = rng.uniform(y0 + 8, y1 - 10)
        cx0 = rng.uniform(0, W - 400)
        ln = rng.uniform(160, 420)
        cw = P.wob1d(W, rng, 60, 1.8)[None, :]
        along = (xx >= cx0) & (xx < cx0 + ln)
        taper = np.clip(np.minimum(xx - cx0, cx0 + ln - xx) / 50, 0, 1)
        split = np.exp(-((ys - cy - cw) / (0.7 + 0.8 * taper)) ** 2) * along * sel
        L.ink = np.maximum(L.ink, split * 0.9)
    top = np.exp(-((ys - y0 - 2.2) / 1.5) ** 2) * sel
    L.lip = np.maximum(L.lip, top * 0.5 * np.clip(lr_aniso(H, W, rng, 80, 2) + 0.5, 0, 1))
    below = (ys >= y1) & (ys < y1 + 36)
    L.alb = np.where(below[..., None], L.alb * (0.42 + 0.58 * smooth(y1, y1 + 36, ys))[..., None], L.alb)
    for bx in bolts:
        by = (y0 + y1) / 2 + rng.uniform(-3, 3)
        bolt(L, xx, yy, bx + rng.uniform(-4, 4), by)
    return L


def bolt(L, xx, yy, bx, by, r=7.5):
    """A square iron washer and a round bolt head, the Kids' hardware."""
    wsh = (np.abs(xx - bx) < r * 1.35) & (np.abs(yy - by) < r * 1.35)
    L.alb = np.where(wsh[..., None], np.array([34, 28, 26], np.float32), L.alb)
    L.hgt = np.where(wsh, L.hgt + 2.0, L.hgt)
    L.gloss = np.where(wsh, 0.5, L.gloss)
    edge = wsh & ((np.abs(xx - bx) > r * 1.35 - 1.4) | (np.abs(yy - by) > r * 1.35 - 1.4))
    L.ink = np.where(edge, 0.7, np.where(wsh, 0.0, L.ink))
    nail(L, xx, yy, bx, by, rng=None, r=r * 0.72)


def floorboards(L, rng, y0, pal=WOOD_FLOOR):
    H, W = L.hgt.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    fl = yy >= y0
    y = float(y0)
    edge = np.full((H, W), 99.0, np.float32)
    while y < H:
        depth = 14 + 36 * ((y - y0) / (H - y0)) ** 1.1 + rng.uniform(-1, 2)
        ry0, ry1 = y, min(H, y + depth)
        xj = -rng.uniform(0, 320)
        while xj < W:
            ln = rng.uniform(420, 900) * (0.7 + 0.6 * (y - y0) / (H - y0))
            sel = fl & (yy >= ry0) & (yy < ry1) & (xx >= xj) & (xx < xj + ln)
            gy0, gy1 = int(ry0), int(np.ceil(ry1))
            gx0, gx1 = int(max(0, xj)), int(min(W, np.ceil(xj + ln)))
            if gx1 - gx0 > 2 and gy1 - gy0 > 2:
                tone, ink = grain(gy1 - gy0, gx1 - gx0, rng, period=8 + depth * 0.1, wander=10, arches=1)
                col = wood_col(tone + rng.uniform(-0.12, 0.08), pal)
                sub = sel[gy0:gy1, gx0:gx1]
                L.alb[gy0:gy1, gx0:gx1] = np.where(sub[..., None], col, L.alb[gy0:gy1, gx0:gx1])
                L.ink[gy0:gy1, gx0:gx1] = np.where(sub, ink * 0.6, L.ink[gy0:gy1, gx0:gx1])
            dd = np.minimum(np.minimum(yy - ry0, ry1 - yy) * 1.6, np.minimum(xx - xj, xj + ln - xx))
            edge = np.where(sel, dd, edge)
            xj += ln
        y = ry1
    e = np.clip(edge, 0, 12)
    L.hgt = np.where(fl, np.clip(e / 3.0, 0, 1) ** 0.7 * 4.0, L.hgt)
    L.alb = np.where(fl[..., None], L.alb * (0.35 + 0.65 * np.clip(e / 1.6, 0, 1))[..., None], L.alb)
    L.alb[y0:] *= (1 - 0.62 * np.exp(-(np.arange(H - y0, dtype=np.float32) / 18)))[:, None, None]
    return L


# ── the trunk ────────────────────────────────────────────────────────────────
TRUNK_X = 1762
TRUNK_HW = 90


def trunk(L, rng, cx=TRUNK_X, hw0=TRUNK_HW, y_floor=FLOOR):
    """The tree the treehouse is built round, coming up through the floor: a
    round trunk in thick plated bark whose fissures crowd together towards its
    edges as it turns away from you, a knot hole where a branch came off, and a
    flare of roots into the boards."""
    H, W = L.hgt.shape
    bx0, bx1 = int(max(0, cx - 260)), int(min(W, cx + 260))
    BW = bx1 - bx0
    yy, xx = np.mgrid[0:H, bx0:bx1].astype(np.float32)
    lean = P.wob1d(H, rng, 420, 10)[:, None]
    hw = hw0 + P.wob1d(H, rng, 160, 7)[:, None] + 76 * smooth(y_floor - 140, H + 40, yy) ** 1.7
    c = cx + lean
    # the silhouette wanders where the bark stands proud of it
    rough = lr_aniso(H, BW, rng, 1.6, 8) * 2.6 + lr_aniso(H, BW, rng, 5, 50) * 4.5
    u = (xx - c) / (hw + rough)
    sel = np.abs(u) < 1.0
    uc = np.clip(u, -0.999, 0.999)
    cyl = np.sqrt(np.clip(1 - uc ** 2, 0, 1))
    # bark as the samples' tree wears it: long sinewy ridges following a slow
    # twist of the trunk, parting round burls, crowding together as the trunk
    # turns away (arc length round it, not screen x)
    arc = np.arcsin(uc) * hw0
    twist = yy * 0.16 + P.wob1d(H, rng, 300, 40)[:, None]
    wander = lr_aniso(H, BW, rng, 6, 90) * 16 + lr_aniso(H, BW, rng, 2.5, 26) * 3.5
    phase = arc + twist + wander
    burls = [(cx - 40, 300.0, 1.0), (cx + 30, 520.0, 0.8), (cx - 22, 860.0, 0.9)]
    burl_lip = np.zeros_like(u)
    for bxc, byc, bs in burls:
        bd = np.hypot((xx - bxc - lean) / (22 * bs), (yy - byc) / (30 * bs))
        phase = phase + 20 * bs * np.exp(-bd ** 2 * 0.8) * np.sign(xx - bxc - lean + 0.01)
        burl_lip = np.maximum(burl_lip, np.exp(-((bd - 0.75) / 0.25) ** 2) * bs)
    period = 27.0
    s = np.abs(np.sin(np.pi * phase / period))
    ridge = s ** 0.8
    fissure = np.clip(1 - s / 0.2, 0, 1) * (0.5 + 0.5 * np.clip(lr_aniso(H, BW, rng, 3, 30) + 0.6, 0, 1))
    # bark, not sawn grain: every ridge is broken across here and there by a
    # short crack, where the bark has split as the tree grew
    across = yy + lr_aniso(H, BW, rng, 8, 3) * 9 + np.floor(phase / period) * 23.0
    cracks = np.clip(1 - np.abs(np.sin(np.pi * across / 38.0)) / 0.07, 0, 1)
    cracks = cracks * np.clip(lr_noise(H, BW, rng, 5) * 2.2 - 0.3, 0, 1) * np.clip(s - 0.35, 0, 1) * 1.6
    fissure = np.maximum(fissure, np.clip(cracks, 0, 0.9))
    tex = lr_aniso(H, BW, rng, 1.2, 5) * 0.5 + lr_noise(H, BW, rng, 1.6) * 0.5
    bark = ridge + tex * 0.12 + burl_lip * 0.6
    hgt = 30 * cyl + 9 * bark * (0.3 + 0.7 * cyl) + 14
    # each ridge modelled round: lit on the flank that faces the room's top-left
    # light, in its own shade on the other (the room's light alone comes from
    # straight above, and would leave upright ridges flat)
    bh = ndimage.gaussian_filter(bark, 1.2)
    relief = np.clip(-ndimage.sobel(bh, axis=1) * 0.9 - ndimage.sobel(bh, axis=0) * 0.35, -1, 1)
    # a knot hole where a branch once came off, its bark rolled into the lip
    kx, ky = cx + 12, 706.0
    kd = np.hypot((xx - kx - lean) / 16.0, (yy - ky) / 24.0)
    hole = kd < 1.0
    lipr = np.exp(-((kd - 1.15) / 0.22) ** 2)
    hgt = hgt + lipr * 8 - hole * 16
    # colour: the ridges' crests grey and catching light, the fissures near
    # black, a wash of lichen on the crests; the whole round, lit from the left
    t = 0.26 + bark * 0.46 + lr_noise(H, BW, rng, 60) * 0.07 + lipr * 0.2
    col = wood_col(t, BARK)
    lichen = np.clip(lr_noise(H, BW, rng, 9) * 2.6 - 1.5, 0, 1) * np.clip(ridge - 0.5, 0, 1) * 2
    col = col * (1 - lichen[..., None] * 0.4) + np.array([92, 90, 82], np.float32) * (lichen[..., None] * 0.4)
    round_shade = (0.3 + 0.7 * cyl ** 0.8) * (1 - 0.22 * uc)
    col = col * round_shade[..., None]
    col = col * (1 + 0.42 * relief * (0.4 + 0.6 * cyl))[..., None]
    col = col * (1 - 0.6 * fissure)[..., None]
    col = np.where(hole[..., None], np.array([5, 3, 4], np.float32), col)
    # the samples' pale specks on a lit crest
    speck = (rng.random(u.shape) > 0.9975) & (ridge > 0.85) & (uc < 0.2)
    speck = ndimage.gaussian_filter(speck.astype(np.float32), 0.9) * 7
    col = col + np.clip(speck, 0, 1)[..., None] * np.array([120, 110, 100], np.float32)
    ink = fissure * 0.5 * (0.35 + 0.65 * cyl)
    ink = np.maximum(ink, np.clip(1 - (1 - np.abs(u)) / 0.035, 0, 1) * 0.85)   # its silhouette
    ink = np.maximum(ink, np.clip(1 - np.abs(kd - 1.0) / 0.12, 0, 1) * 0.85)
    ridge = np.clip(bark, 0, 1)
    sub = (slice(None), slice(bx0, bx1))
    L.alb[sub] = np.where(sel[..., None], col, L.alb[sub])
    L.hgt[sub] = np.where(sel, hgt, L.hgt[sub])
    L.gloss[sub] = np.where(sel, 0.06, L.gloss[sub])
    L.ink[sub] = np.where(sel, ink, L.ink[sub])
    L.lip[sub] = np.where(sel, np.clip(ridge - 0.6, 0, 1) * cyl * 0.5 * (uc < -0.1), L.lip[sub])
    # the dark the trunk keeps round itself on the boards, and its shadow to the right
    xl, xr = c - hw, c + hw
    near = (~sel) & (((xx < c) & (xx > xl - 30)) | ((xx > c) & (xx < xr + 54)))
    fall = np.where(xx < c, smooth(0, 30, xl - xx), smooth(0, 54, xx - xr))
    L.alb[sub] = np.where(near[..., None], L.alb[sub] * (0.42 + 0.58 * fall)[..., None], L.alb[sub])
    return L


# ── the window ───────────────────────────────────────────────────────────────
WIN = (418, 96, 642, 296)       # the casing's outer edge: x0, y0, x1, y1
WIN_IN = 24                     # casing width


def night_view(w, h, rng, ss=4):
    """What the window shows: a night sky over the grounds, the moon high in the
    upper right pane with a halo, stars, far treetops, and a branch of the
    Kids' own tree across the glass. RGB, w x h."""
    W, H = w * ss, h * ss
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / ss
    t = yy / h
    sky = ramp(t, [(0.0, "#050816"), (0.55, "#0e1731"), (1.0, "#1f2c4e")])
    mx, my, mr = w * 0.74, h * 0.25, h * 0.115
    md = np.hypot(xx - mx, yy - my)
    halo = np.exp(-(md / (mr * 3.2)) ** 2) * 0.55 + np.exp(-(md / (mr * 1.5)) ** 2) * 0.35
    sky = sky + halo[..., None] * np.array([80, 96, 140], np.float32)
    moon = np.clip((mr - md) * ss / 1.5, 0, 1)
    maria = M.noise((H, W), rng, ss * 2.4) * 0.12
    moon_col = np.array([236, 238, 246], np.float32) * (0.9 + maria[..., None] - 0.12 * np.clip((xx - mx) / mr, 0, 1)[..., None])
    sky = sky * (1 - moon[..., None]) + moon_col * moon[..., None]
    # stars, a few, small
    for _ in range(22):
        sx_, sy_ = rng.uniform(0, w), rng.uniform(0, h * 0.72)
        if np.hypot(sx_ - mx, sy_ - my) < mr * 2.2:
            continue
        br = rng.uniform(0.45, 1.0)
        sd = np.hypot(xx - sx_, yy - sy_)
        sky = sky + (np.exp(-(sd / 0.7) ** 2) * br * 230)[..., None] * np.array([0.9, 0.95, 1.0], np.float32)
    # far treetops along the foot of the view
    ridge = h * 0.84 + P.wob1d(W, rng, 18 * ss, h * 0.05)[None, :] + P.wob1d(W, rng, 4 * ss, h * 0.018)[None, :]
    trees = yy > ridge
    sky = np.where(trees[..., None], np.array([7, 9, 18], np.float32), sky)
    # the branch: drawn at ss, tapering, with twigs and leaf clusters
    im = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(im)
    def limb(x0, y0, ang, length, width, depth):
        pts = [(x0, y0)]
        x, y = x0, y0
        n = 10
        for i in range(n):
            ang += rng.uniform(-0.18, 0.18)
            x += np.cos(ang) * length / n
            y += np.sin(ang) * length / n
            pts.append((x, y))
        for i in range(n):
            wd = width * (1 - i / n) + 1.2 * ss
            dr.line([pts[i], pts[i + 1]], fill=255, width=int(max(1, wd)))
        if depth > 0:
            for k in (3, 6, 8):
                bx, by = pts[k]
                limb(bx, by, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.0), length * 0.42, width * 0.45, depth - 1)
        else:
            # a cluster of leaves at the tip
            ex, ey = pts[-1]
            for _ in range(7):
                lx, ly = ex + rng.normal(0, 5 * ss), ey + rng.normal(0, 4 * ss)
                r1, r2 = rng.uniform(3, 5.5) * ss, rng.uniform(1.6, 2.8) * ss
                dr.ellipse([lx - r1, ly - r2, lx + r1, ly + r2], fill=255)
    limb(-4 * ss, H * 0.78, -0.42, W * 0.95, 9 * ss, 2)
    branch = np.asarray(im, np.float32) / 255.0
    sky = sky * (1 - branch[..., None]) + np.array([4, 4, 9], np.float32) * branch[..., None]
    return M.down(sky, ss)


def window(L, rng):
    """A square window cut in the clapboards: a rough plank casing nailed round
    old glass, a cross bar, a sill board under it; the night through it."""
    H, W = L.hgt.shape
    x0, y0, x1, y1 = WIN
    c = WIN_IN
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    outer = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
    gx0, gy0, gx1, gy1 = x0 + c, y0 + c, x1 - c, y1 - c
    glass = (xx >= gx0) & (xx < gx1) & (yy >= gy0) & (yy < gy1)
    casing = outer & ~glass
    # casing boards: top and foot run across, the sides run up, each with its grain
    tone_h, ink_h = grain(y1 - y0, x1 - x0, rng, period=10.5, wander=10, arches=1)
    tone_v, ink_v = grain_v(y1 - y0, x1 - x0, rng, period=10.5, wander=12, arches=1)
    lx = xx[y0:y1, x0:x1] - x0
    ly = yy[y0:y1, x0:x1] - y0
    is_side = ((lx < c) | (lx >= (x1 - x0) - c)) & (ly >= c * 0.2) & (ly < (y1 - y0) - c * 0.2)
    tone = np.where(is_side, tone_v, tone_h)
    ink = np.where(is_side, ink_v, ink_h)
    col = wood_col(tone - 0.04, WOOD_FRAME)
    sub = casing[y0:y1, x0:x1]
    L.alb[y0:y1, x0:x1] = np.where(sub[..., None], col, L.alb[y0:y1, x0:x1])
    L.ink[y0:y1, x0:x1] = np.where(sub, ink, L.ink[y0:y1, x0:x1])
    dcase = np.minimum.reduce([np.abs(xx - x0), np.abs(x1 - xx), np.abs(yy - y0), np.abs(y1 - yy),
                               np.abs(xx - gx0), np.abs(gx1 - xx), np.abs(yy - gy0), np.abs(gy1 - yy)])
    L.hgt = np.where(casing, 22 + 6 * np.clip(dcase / 5, 0, 1) ** 0.6, L.hgt)
    L.gloss = np.where(casing, 0.2, L.gloss)
    # the joints where the side boards meet the head and foot boards
    for jy in (y0 + c, y1 - c):
        j = casing & (np.abs(yy - jy) < 1.2) & ((xx < gx0) | (xx >= gx1))
        L.ink = np.where(j, 0.85, L.ink)
    # a nail at each corner of the casing
    for nx, ny in ((x0 + c / 2, y0 + c / 2), (x1 - c / 2, y0 + c / 2), (x0 + c / 2, y1 - c / 2), (x1 - c / 2, y1 - c / 2)):
        nail(L, xx, yy, nx + rng.uniform(-2, 2), ny + rng.uniform(-2, 2), rng, r=3.6)
    # the sill board under it, proud of the casing
    sy0, sy1 = y1 - 4, y1 + 14
    sill = (xx >= x0 - 14) & (xx < x1 + 14) & (yy >= sy0) & (yy < sy1)
    tone_s, ink_s = grain(sy1 - sy0, (x1 + 14) - (x0 - 14), rng, period=9, wander=6)
    sub = sill[sy0:sy1, x0 - 14:x1 + 14]
    L.alb[sy0:sy1, x0 - 14:x1 + 14] = np.where(sub[..., None], wood_col(tone_s + 0.06, WOOD_FRAME), L.alb[sy0:sy1, x0 - 14:x1 + 14])
    L.ink[sy0:sy1, x0 - 14:x1 + 14] = np.where(sub, ink_s, L.ink[sy0:sy1, x0 - 14:x1 + 14])
    L.hgt = np.where(sill, 30 - (yy - sy0) * 0.8, L.hgt)
    below = (xx >= x0 - 14) & (xx < x1 + 14) & (yy >= sy1) & (yy < sy1 + 26)
    L.alb = np.where(below[..., None], L.alb * (0.35 + 0.65 * smooth(sy1, sy1 + 26, yy))[..., None], L.alb)
    # the glass and the cross bar
    mx = (gx0 + gx1) / 2
    my = (gy0 + gy1) / 2
    bar = glass & ((np.abs(xx - mx) < 3.6) | (np.abs(yy - my) < 3.6))
    pane = glass & ~bar
    tb, ib = grain(gy1 - gy0, gx1 - gx0, rng, period=8, wander=4)
    sub = bar[gy0:gy1, gx0:gx1]
    L.alb[gy0:gy1, gx0:gx1] = np.where(sub[..., None], wood_col(tb - 0.1, WOOD_FRAME), L.alb[gy0:gy1, gx0:gx1])
    L.hgt = np.where(bar, 17, L.hgt)
    L.hgt = np.where(pane, 4, L.hgt)
    L.ink = np.where(bar & ((np.abs(np.abs(xx - mx) - 3.6) < 0.9) | (np.abs(np.abs(yy - my) - 3.6) < 0.9)), 0.8, L.ink)
    L.ink = np.where(pane, 0, L.ink)
    view = night_view(gx1 - gx0, gy1 - gy0, rng)
    # old glass: a little uneven, grimed into its corners, the casing's shade on it
    pw, ph = gx1 - gx0, gy1 - gy0
    gy_, gx_ = np.mgrid[0:ph, 0:pw].astype(np.float32)
    dx = np.minimum(np.abs(gx_ - 0), np.abs(gx_ - pw)) ; dx = np.minimum(dx, np.abs(gx_ - pw / 2))
    dy = np.minimum(np.abs(gy_ - 0), np.abs(gy_ - ph)) ; dy = np.minimum(dy, np.abs(gy_ - ph / 2))
    grime = 1 - 0.55 * np.exp(-np.minimum(dx, dy) / 7.0)
    wav = 1 + lr_noise(ph, pw, rng, 5) * 0.06
    shade_in = 1 - 0.5 * np.exp(-(gy_ / 9.0)) - 0.35 * np.exp(-(gx_ / 9.0))
    view = view * (grime * wav * shade_in)[..., None]
    L.view[gy0:gy1, gx0:gx1] = view
    L.glass = np.where(pane, 1.0, L.glass)
    return L


# ── light ────────────────────────────────────────────────────────────────────
def glow_map(H, W, sources):
    """Where the boards hang their lights, as a sum of soft falloffs (0 .. ~1.3)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g = np.zeros((H, W), np.float32)
    for x, y, r, s in sources:
        d = np.hypot((xx - x) / r, (yy - y) / (r * 0.86))
        g += s * (np.exp(-d ** 2 * 1.6) * 0.72 + np.exp(-d ** 2 * 7.0) * 0.28)
    return np.clip(g, 0, 1.35)


def moon_spill(H, W, win=WIN):
    """The window's moonlight on the boards: a skewed pane of cold light falling
    down and to the right of it, soft at its edges."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    x0, y0, x1, y1 = win
    k = (yy - y1) / 1.0
    sx0 = x0 + np.clip(k, 0, None) * 0.55
    sx1 = x1 + np.clip(k, 0, None) * 0.9
    inside = smooth(-30, 20, xx - sx0) * smooth(-30, 20, sx1 - xx) * smooth(0, 40, yy - y1) * (1 - smooth(120, 470, yy - y1))
    return inside.astype(np.float32)


def render_room(L, rng, lights, name, spill=None, dark_tint=(0.6, 0.5, 0.9), dark_amb=(0.36, 0.38),
                warm_gain=1.62, quality=(86, 84, 84)):
    H, W = L.hgt.shape
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    outline = np.clip(P.ink_lines(L.hgt, amount=0.62, thresh=1.3), 0, 0.9)
    tex = P.grit(H, W, seed=9, scale=1.0)
    brush = P.aniso_noise(H, W, rng, 22, 2.2, angle=-24)
    brush2 = P.aniso_noise(H, W, rng, 16, 2.0, angle=62)
    ao = np.clip((ndimage.gaussian_filter(L.hgt, 7) - L.hgt) / 3.2, 0, 1)
    ao = ndimage.gaussian_filter(ao, 1.5)
    dabs = ndimage.gaussian_filter(rng.normal(0, 1, (H // 6, W // 6)).astype(np.float32), 0.9)
    dabs = P.resize_f(dabs / (np.abs(dabs).max() + 1e-6), W, H)
    glow = glow_map(H, W, lights)
    grain_ink = np.clip(L.ink, 0, 1)

    def finish(col, hi_colour, hi_amt, grain_amt):
        col = col + L.lip[..., None] * np.asarray(hi_colour, np.float32) * hi_amt
        col = col * (1 - 0.5 * ao[..., None])
        col = P.kuwahara(col, radius=3, sectors=8, q=10.0)
        col = col * (1 - grain_ink[..., None] * grain_amt)
        col = col * (1 - outline[..., None])
        col = col * (0.76 + 0.24 * tex[..., None])
        col = col * (1 + (brush * 0.07 + brush2 * 0.045 + dabs * 0.06)[..., None])
        return col

    def with_view(col, gain, warm_reflect=0.0):
        g = L.glass[..., None]
        v = L.view * gain
        if warm_reflect:
            streak = np.exp(-(((xx - yy * 0.6) - 380) / 60.0) ** 2) * warm_reflect
            v = v + streak[..., None] * np.array([90, 56, 26], np.float32)
        return col * (1 - g) + v * g

    # in the dark: the boards lost in the room's plum shadow, lifted and warmed
    # a little round every light a board hangs, so the grain comes up out of it
    Ld = np.array([0, -0.4, 0.92], np.float32)
    dark = P.lit(L.alb, L.hgt, L.gloss, Ld, dark_tint, dark_amb[0], dark_amb[1])
    vfall = (0.5 + 0.5 * smooth(0, 520, yy)) * (1 - 0.5 * smooth(FLOOR, H, yy))
    hfall = 1 - 0.22 * (np.abs(xx - W / 2) / (W / 2)) ** 2
    dark = dark * (vfall * hfall * (0.62 + 0.62 * glow))[..., None]
    dark = dark + (glow ** 1.5)[..., None] * L.alb * np.array([0.16, 0.08, 0.03], np.float32)
    if spill is not None:
        dark = dark + (spill * 0.3)[..., None] * L.alb * np.array([0.10, 0.16, 0.30], np.float32)
    dark = finish(dark, (46, 34, 58), 0.3, 0.5)
    dark = with_view(dark, 0.72)
    # candle light, falling off from each light into the dark round it
    Lw = np.array([0, -0.8, 0.6], np.float32)
    Lw /= np.linalg.norm(Lw)
    warm = P.lit(L.alb, L.hgt, L.gloss, Lw, (1.0, 0.76, 0.52), 0.62, warm_gain, spec=(130, 86, 42))
    warm = warm * (0.16 + 0.95 * glow)[..., None]
    warm = finish(warm, (236, 164, 90), 0.62, 0.55)
    warm = with_view(warm, 0.8, warm_reflect=0.35)
    Lm = np.array([0.0, -0.62, 0.78], np.float32)
    Lm /= np.linalg.norm(Lm)
    moon = P.lit(L.alb, L.hgt, L.gloss, Lm, (0.52, 0.66, 1.0), 0.5, 1.4, spec=(46, 66, 104))
    if spill is not None:
        moon = moon * (0.8 + 0.7 * spill)[..., None]
    moon = finish(moon, (120, 150, 210), 0.45, 0.5)
    moon = with_view(moon, 1.0)
    save(dark, f"{name}.webp", quality[0])
    save(warm, f"{name}-warm.webp", quality[1])
    save(moon, f"{name}-moon.webp", quality[2])


# The lights the Treehouse board hangs (scenes/lobby.css), in this painting's
# pixels at 16:9: the corner candles, the lantern and candle between the window
# and the panel, the lantern beyond the panel, and the panel's own light.
TREEROOM_LIGHTS = [
    (202, 67, 560, 1.0), (1718, 67, 560, 1.0),
    (1003, 425, 470, 0.95), (1771, 425, 470, 0.95),
    (1003, 832, 380, 0.7),
    (1387, 338, 620, 0.18),
]


def treeroom():
    rng = np.random.default_rng(5501)
    L = Layers(H0, W0)
    clapboards(L, rng, BEAM[1] - 6, RAIL[0], studs=(120, 760, 1150, 1330))
    wainscot(L, rng, RAIL[1], FLOOR)
    window(L, rng)
    for px in POSTS:
        post(L, rng, px, BEAM[1] - 4, FLOOR)
    beam_h(L, rng, RAIL[0], RAIL[1], bolts=POSTS)
    floorboards(L, rng, FLOOR)
    trunk(L, rng)
    beam_h(L, rng, BEAM[0], BEAM[1], bolts=POSTS + (TRUNK_X,))
    render_room(L, rng, TREEROOM_LIGHTS, "treeroom", spill=moon_spill(H0, W0))


# Headquarters' wall: the same boards, posts, beam and rail, painted by the
# same functions from the same palettes, so the two kids' places are one
# timber. Its posts stand where Headquarters' wall is seen past the board: one
# under each side's purple scroll, one in the gap between the board and the
# log, and its light is Headquarters' own — the corner candles, the enamel
# lamp over the board, the bulbs along the top, the still life on its shelf.
CLAP_BEAM = (0, 64)
CLAP_RAIL = (600, 642)
CLAP_FLOOR = 1012
CLAP_POSTS = (40, 1388, 1884)
CLAPBOARD_LIGHTS = [
    (127, 41, 470, 0.95), (1793, 41, 470, 0.95),
    (542, 198, 640, 0.9),
    (620, 20, 700, 0.35), (1320, 20, 700, 0.35),
    (1540, 850, 430, 0.85),
    (1520, 500, 560, 0.3),
]


def clapboard():
    rng = np.random.default_rng(7703)
    L = Layers(H0, W0)
    clapboards(L, rng, CLAP_BEAM[1] - 6, CLAP_RAIL[0], studs=(300, 720, 1020, 1640))
    wainscot(L, rng, CLAP_RAIL[1], CLAP_FLOOR)
    for px in CLAP_POSTS:
        post(L, rng, px, CLAP_BEAM[1] - 4, CLAP_FLOOR)
    beam_h(L, rng, CLAP_RAIL[0], CLAP_RAIL[1], bolts=CLAP_POSTS)
    floorboards(L, rng, CLAP_FLOOR)
    beam_h(L, rng, CLAP_BEAM[0], CLAP_BEAM[1], bolts=CLAP_POSTS)
    # tinted a shade further toward aubergine than the Treehouse: this wall is
    # mostly seen in the dark round the board, behind the purple scrollwork
    render_room(L, rng, CLAPBOARD_LIGHTS, "clapboard", dark_tint=(0.58, 0.46, 0.94))


# ═════════════════════════════════════════════════════════════════════════════
# THE SHELF PLANK
# The board the Treehouse's window and panel stand on, seen from just above,
# laid out row for row as sill.webp is (so .kit-sill stands things on it the
# same way): its worn top face to row 30, the rounded edge to 40, the front face
# to 84, then its shadow. Twice sill.webp's length and its grain drawn twice as
# bold, because the shelf is shown at under half this size: at that size a
# painter's grain is a few long dark strokes, a knot, and two boards' ends.
# ═════════════════════════════════════════════════════════════════════════════
SB_W, SB_H = 2048, 112
SB_TOP, SB_EDGE, SB_FRONT = 30, 40, 84


def shelfboard():
    rng = np.random.default_rng(6119)
    W, H = SB_W, SB_H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    wob_e = P.wob1d(W, rng, 110, 1.4)[None, :]
    wob_f = P.wob1d(W, rng, 130, 1.6)[None, :]
    top = yy < SB_TOP + wob_e
    edge = (yy >= SB_TOP + wob_e) & (yy < SB_EDGE + wob_e)
    front = (yy >= SB_EDGE + wob_e) & (yy < SB_FRONT + wob_f)
    board = top | edge | front
    joint_x = W * 0.5 + 61
    col = np.zeros((H, W, 3), np.float32)
    ink = np.zeros((H, W), np.float32)
    # two lengths of board, each with its own grain; the top face and the front
    # face of one board share it, the way a sawn plank does
    for x0, x1 in ((0, joint_x), (joint_x, W)):
        bw = int(np.ceil(x1 - x0))
        knots = [(rng.uniform(80, bw - 80), rng.uniform(46, 78), rng.uniform(7, 10)),
                 (rng.uniform(80, bw - 80), rng.uniform(6, 24), rng.uniform(6, 8))]
        tone, gink = grain(H, bw, rng, period=19.0, wander=30, arches=3, knots=knots)
        c = wood_col(tone + rng.uniform(-0.05, 0.05), ("#1c1012", "#4d3226", "#7c573c"))
        xs = slice(int(x0), int(x0) + bw)
        col[:, xs] = c[:, :W - int(x0)] if int(x0) + bw > W else c
        ink[:, xs] = gink[:, :W - int(x0)] if int(x0) + bw > W else gink
    hgt = np.zeros((H, W), np.float32)
    hgt = np.where(top, 20 + yy / SB_TOP * 3, hgt)
    t_e = (yy - SB_TOP) / (SB_EDGE - SB_TOP)
    hgt = np.where(edge, 23 - (1 - np.cos(np.clip(t_e, 0, 1) * np.pi / 2)) * 10, hgt)
    hgt = np.where(front, 12 - (yy - SB_EDGE) * 0.02, hgt)
    dents = np.clip(M.noise((H, W), rng, 3) - 0.35, 0, 1) * 2.4 * top
    hgt = hgt - dents
    n = normals(ndimage.gaussian_filter(hgt, 0.8), 0.9)
    Lv = np.array([-0.2, -0.75, 0.62], np.float32)
    Lv /= np.linalg.norm(Lv)
    lam = lambert(n, Lv)
    col = col * (0.46 + 0.9 * lam[..., None])
    # candle light along the crown of the edge, broken where the brush skipped
    crown = np.exp(-((yy - SB_TOP - wob_e - 3.0) / 2.4) ** 2)
    skip = np.clip(P.aniso_noise(H, W, rng, 60, 2) * 1.4 + 0.6, 0, 1)
    col = col + (crown * skip * 110)[..., None] * np.array([1.0, .76, .48], np.float32)
    col = np.where(top[..., None], col * 1.16, col)
    # the front face in its own shade, darker toward its foot
    tf = np.clip((yy - SB_EDGE - wob_e) / (SB_FRONT - SB_EDGE), 0, 1)
    col = np.where(front[..., None], col * (0.86 - 0.32 * tf)[..., None], col)
    # the grain, drawn over the paint
    col = col * (1 - 0.62 * ink * board)[..., None]
    # scratches across the top face
    for _ in range(20):
        sx0, sy0 = rng.uniform(0, W), rng.uniform(4, SB_TOP - 4)
        ln = rng.uniform(14, 52)
        ang = rng.uniform(-0.25, 0.25)
        tt = (xx - sx0) * np.cos(ang) + (yy - sy0) * np.sin(ang)
        dd = -(xx - sx0) * np.sin(ang) + (yy - sy0) * np.cos(ang)
        s = np.exp(-(dd / 0.7) ** 2) * (tt > 0) * (tt < ln) * top
        col = col * (1 - 0.3 * s)[..., None] + (s * 26)[..., None]
    # the joint between the two lengths, and a nail either side of it and at
    # each board's quarter
    jd = np.abs(xx - joint_x - P.wob1d(H, rng, 30, 0.8)[:, None])
    col = col * (1 - 0.8 * np.exp(-(jd / 1.3) ** 2) * board)[..., None]
    for nx in (W * 0.22, joint_x - 30, joint_x + 30, W * 0.8):
        ny = (SB_EDGE + SB_FRONT) / 2 + rng.uniform(-3, 3)
        d = np.hypot(xx - nx, yy - ny)
        head = d < 6.2
        lit_n = np.clip(1.0 - np.hypot(xx - nx + 1.8, yy - ny + 1.8) / 6.2, 0, 1)
        col = np.where(head[..., None], ramp(lit_n, [(0, "#140d0b"), (0.5, "#4e4239"), (1, "#b3a38e")]), col)
        ring = (d >= 6.2) & (d < 7.8)
        col = np.where(ring[..., None], col * 0.5, col)
        run = np.exp(-((xx - nx) / 2.8) ** 2) * np.clip((yy - ny) / 22, 0, 1) * np.clip(1 - (yy - ny) / 30, 0, 1)
        col = col * (1 - 0.35 * run)[..., None] + np.array([96, 42, 16], np.float32) * (0.35 * run)[..., None]
    # the shadow under the shelf on the wall
    sh = ~board
    foot = SB_FRONT + wob_f
    shade = np.clip(1 - (yy - foot) / (H - SB_FRONT), 0, 1) ** 1.5
    col = np.where(sh[..., None], np.zeros(3, np.float32), col)
    alpha = np.where(sh, shade * 0.72 * 255, 255)
    inkl = np.exp(-((yy - SB_EDGE - wob_e + 0.5) / 1.1) ** 2) * 0.45 + np.exp(-((yy - foot + 1.2) / 1.3) ** 2) * 0.85
    col = col * (1 - inkl[..., None]) + np.array([18, 10, 6], np.float32) * inkl[..., None]
    col = P.kuwahara(col, radius=1, sectors=8, q=8.0) * 0.4 + col * 0.6
    tex = P.grit(H, W, seed=4, scale=0.5)
    col = col * (0.84 + 0.16 * tex[..., None])
    save(np.dstack([np.clip(col, 0, 255), alpha]), "shelfboard.webp", 90)


# ═════════════════════════════════════════════════════════════════════════════
# PINNED TO THE BOARD
# Headquarters' investigation board, round 5: NUTMEG's newspaper cutting
# (ui/r4-kids-b, its tools/prep_kids_places.py `clippings`, ported unchanged so
# the same seed paints the same sheet), and MARL's purple enamel studs for the
# carved frame's corners (ui/r4-kids-a's mount.webp, whose rosette and violet
# stone are what the judges named; the frame already has its own brass mounts).
# ═════════════════════════════════════════════════════════════════════════════
def torn_strip(W, H, rng, tone, fibre="#f4ead6", bite=5.0):
    """A strip of paper with a deckled, torn edge and the fibre white along
    the tear. RGBA. (NUTMEG's.)"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    top = 6 + P.wob1d(W, rng, 40, 2.4)[None, :] + np.abs(P.wob1d(W, rng, 6, 1.4))[None, :]
    bot = H - 6 - P.wob1d(W, rng, 40, 2.4)[None, :] - np.abs(P.wob1d(W, rng, 6, 1.4))[None, :]
    lef = 10 + P.wob1d(H, rng, 8, bite)[:, None] + np.abs(P.wob1d(H, rng, 3, bite * 0.6))[:, None]
    rig = W - 10 - P.wob1d(H, rng, 8, bite)[:, None] - np.abs(P.wob1d(H, rng, 3, bite * 0.6))[:, None]
    inside = (yy > top) & (yy < bot) & (xx > lef) & (xx < rig)
    d = ndimage.distance_transform_edt(inside)
    fib = P.aniso_noise(H, W, rng, 3, 0.8) * 0.06 + M.noise((H, W), rng, 1.0) * 0.05
    mott = M.noise((H, W), rng, 22) * 0.07
    col = hexc(tone) * (1 + fib + mott)[..., None]
    col = col * (1 - 0.16 * np.exp(-d / 9))[..., None]
    endzone = np.minimum(xx - lef, rig - xx)
    core = (endzone < 2.4) & inside
    col = np.where(core[..., None], hexc(fibre) * (0.9 + 0.1 * fib[..., None]), col)
    alpha = ndimage.gaussian_filter(inside.astype(np.float32), 0.5)
    return np.dstack([np.clip(col, 0, 255), alpha * 255])


def newscutting():
    """A newspaper cutting, torn out: newsprint, a band along its top left for
    the page to letter a headline in, the house itself (UI/mainMenu.png) as a
    half-tone photograph, and columns of set type as grey lines. 420x520."""
    rng = np.random.default_rng(31)
    torn_strip(620, 84, rng, "#e8dcc0")        # (NUTMEG's two note strips came off
    torn_strip(440, 84, rng, "#e4d6b6")        #  this seed first; kept so it paints the same sheet)
    W, H = 420, 520
    strip = torn_strip(W, H, rng, "#d9cfb6", fibre="#efe8d6", bite=7.0)
    col, alpha = strip[..., :3], strip[..., 3]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ink = hexc("#3a342c")
    for ry in (96, 102):
        col = np.where((np.abs(yy - ry) < 0.8)[..., None] & (xx > 30)[..., None] & (xx < W - 30)[..., None], ink, col)
    px0, py0, px1, py1 = 34, 118, 214, 262
    ph = (xx >= px0) & (xx < px1) & (yy >= py0) & (yy < py1)
    house = Image.open(os.path.join(M.UI, "mainMenu.png")).convert("L")
    house = house.crop((300, 150, 1380, 780)).resize((px1 - px0, py1 - py0), Image.LANCZOS)
    hv = np.asarray(house, np.float32) / 255.0
    lo_, hi_ = np.percentile(hv, 4), np.percentile(hv, 97)
    hv = np.clip((hv - lo_) / (hi_ - lo_ + 1e-6), 0, 1) ** 0.55
    photo = np.full((H, W), 0.5, np.float32)
    photo[py0:py1, px0:px1] = hv
    screen = np.sin(xx * 1.6 + yy * 0.6) * np.sin(yy * 1.6 - xx * 0.6) * 0.5 + 0.5
    dots = screen > photo
    halftone = np.where(dots, 0.22, 0.9)
    col = np.where(ph[..., None], hexc("#d9cfb6") * halftone[..., None] + ink * (1 - halftone[..., None]) * 0.45, col)
    col = np.where(((xx >= px0) & (xx < px1) & (np.abs(yy - py1 - 10) < 2.4))[..., None], col * 0.6, col)
    cols = [(34, 214, 290), (230, 386, 118)]
    for x0, x1, ystart in cols:
        y = ystart
        while y < H - 34:
            if x0 == 34 and y < 292:
                y = 292
            words_x = x0
            while words_x < x1:
                wl = rng.uniform(10, 34)
                if words_x + wl > x1:
                    break
                bar = (xx >= words_x) & (xx < words_x + wl) & (np.abs(yy - y) < 1.6)
                col = np.where(bar[..., None], col * 0.55 + ink * 0.45, col)
                words_x += wl + rng.uniform(3, 5)
            y += 9.5
    col = col * (1 - 0.05 * M.noise((H, W), rng, 0.8))[..., None]
    save(np.dstack([np.clip(col, 0, 255), alpha]), "newscutting.webp", 90)


def stud():
    """A purple enamel stud for a frame's corner: a domed violet cabochon in a
    raised brass bezel, set in a rosette of eight cast brass petals, lit from
    the boards' top left and inked round. 96x96 RGBA."""
    S0, ss = 96, 4
    S = S0 * ss
    rng = np.random.default_rng(812)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / ss
    c = S0 / 2
    dx, dy = xx - c, yy - c
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    # the rosette: eight round petals on a ring, and the ring between them
    petals = np.zeros((S, S), np.float32)
    for k in range(8):
        a = k * np.pi / 4 + np.pi / 8
        px, py = c + np.cos(a) * 29, c + np.sin(a) * 29
        pd = np.hypot(xx - px, yy - py)
        petals = np.maximum(petals, np.sqrt(np.clip(1 - (pd / 12.5) ** 2, 0, 1)))
    ring = np.sqrt(np.clip(1 - ((r - 22) / 9.0) ** 2, 0, 1)) * (r < 31)
    metal_h = np.maximum(petals * 6.0, ring * 7.5)
    metal = metal_h > 0.05
    # petal veins: a groove down each petal's middle
    vein = (np.abs(np.sin((ang - np.pi / 8) * 4)) < 0.1) & (r > 20) & (r < 40)
    metal_h = metal_h - vein * 1.2
    # the bezel round the stone
    bezel = np.sqrt(np.clip(1 - ((r - 17.5) / 2.6) ** 2, 0, 1))
    metal_h = np.maximum(metal_h, bezel * 10)
    stone = r < 15.2
    dome = np.sqrt(np.clip(1 - (r / 15.2) ** 2, 0, 1))
    h = np.where(stone, 8 + dome * 7, metal_h)
    h = ndimage.gaussian_filter(h, ss * 0.5)
    n = normals(h * ss, 0.9)
    wear = M.noise((S, S), rng, ss * 2.0)
    col = M.brass(n, wear=wear, spec_amt=0.8, lift=-0.04)
    # the enamel: deep violet at its rim, lifting to lavender where the light
    # sits on the dome, a hard white glint high on the left
    Ld = np.array([-0.42, -0.62, 0.66], np.float32)
    Ld /= np.linalg.norm(Ld)
    lam = np.clip((n * Ld).sum(axis=2), 0, 1)
    t = np.clip(0.18 + dome * 0.42 + (lam - 0.6) * 0.9, 0, 1)
    enamel = ramp(t, [(0.0, "#1b0d30"), (0.35, "#3d2468"), (0.7, "#6f45a8"), (1.0, "#b99be0")])
    glint = np.exp(-(((xx - c + 5.5) / 2.8) ** 2 + ((yy - c + 6.0) / 2.0) ** 2))
    enamel = enamel + glint[..., None] * np.array([235, 225, 255], np.float32)
    enamel = enamel + (M.specular(n, Ld, 40.0) * 90)[..., None]
    col = np.where(stone[..., None], enamel, col)
    mask = stone | metal | (bezel > 0.05)
    # ink round the silhouette, round the stone and between petal and ring
    dist = ndimage.distance_transform_edt(mask) / ss
    col = col * (0.3 + 0.7 * smooth(0.0, 1.5, dist))[..., None]
    col = np.where((np.abs(r - 15.2) < 0.7)[..., None], col * 0.35, col)
    col = M.down(col, ss)
    a = M.down(mask.astype(np.float32), ss)
    save(np.dstack([np.clip(col, 0, 255), a * 255]), "stud-rosette.webp", 92)


PIECES = {
    "treeroom": treeroom,
    "clapboard": clapboard,
    "shelfboard": shelfboard,
    "newscutting": newscutting,
    "stud": stud,
}


def main():
    global PREVIEW
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append")
    ap.add_argument("--preview")
    a = ap.parse_args()
    PREVIEW = a.preview
    P.PREVIEW = None
    for name, fn in PIECES.items():
        if a.only and name not in a.only:
            continue
        print(name)
        fn()


if __name__ == "__main__":
    main()
