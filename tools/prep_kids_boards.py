"""Paint the timber the Kids' places are built of, and what they pin to it.

Round 4's judges said what still reads as a render in the Treehouse and at
Headquarters: "beams and the shelf plank get grain and candle falloff, not flat
evenly lit brown strips, with plank walls, a window and bark behind the framed
panels", and a Headquarters wall that should be "a warm plank wall tinted
toward aubergine ... sharing the lobby's timber so the two kids' places match".

This paints that timber by the kit's hand (tools/prep_ui_materials.py renders,
tools/prep_ui_paint.py paints): height fields lit from the boards' top left,
the samples' dark ink round every form, a Kuwahara brush pass, and nothing
ruled. Every piece that light falls on is painted twice, in the dark and under
candle light, so a board shows the lit wood only where its candles are and the
wood falls off into the dark between them.

Outputs (game/assets/ui/kit/):

  plank.webp / plank-warm.webp
        a thick treehouse plank to stand things on, seen from just above: a
        worn top face (rows 0-26), a rounded front arris (26-34), the front
        face with its grain, knots and nails (34-84), its shadow (84-120).
        Tiles along x.                                            (.kit-plank)
  newsclip.webp
        a cutting from the local paper, torn out: a band for the headline the
        page letters, the house in half-tone, set columns   (.kit-newsclip)
  hideout.webp / hideout-warm.webp / hideout-moon.webp
        the treehouse both Kids' places stand in: rough plank walls with their
        grain, knots and nail holes; a roof beam, two posts and a nailer rail
        of heavier, checked timber; plank wainscot and floorboards; the shadows
        gone to aubergine                              (.kit-ground--hideout)
  trunk.webp / trunk-warm.webp
        the tree the treehouse is built round: a length of trunk in its bark,
        deep furrows and ridges, lichen, tiling up and down      (.kit-trunk)
  casement.webp
        a treehouse window onto the night: a rough plank frame and a cross
        bar round old glass, and through it the sky over the grounds, stars,
        the moon, and the tree's own boughs in their bark   (.kit-casement)

    python tools/prep_kids_boards.py                 # everything
    python tools/prep_kids_boards.py --only plank    # one piece
    python tools/prep_kids_boards.py --only plank --preview DIR   # PNGs too

Run after tools/prep_ui_materials.py, tools/prep_ui_paint.py and
tools/prep_treehouse_art.py: it borrows their renderer, their painter and the
treehouse's plank grain.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M     # noqa: E402  the kit's renderer
import prep_ui_paint as P         # noqa: E402  the kit's painter
import prep_treehouse_art as T    # noqa: E402  the treehouse's plank grain

ROOT, OUT = M.ROOT, M.OUT
hexc, ramp, smooth, noise = M.hexc, M.ramp, M.smooth, M.noise
normals, lambert, specular, down = M.normals, M.lambert, M.specular, M.down
PREVIEW = None


def save(arr, name, quality=88, lossless=False):
    path = M.save(arr, name, quality, lossless)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        a = np.clip(arr, 0, 255).astype(np.uint8)
        Image.fromarray(a).save(os.path.join(PREVIEW, os.path.splitext(name)[0] + ".png"))
    return path


# ── noise that tiles ─────────────────────────────────────────────────────────
def wrap_noise(h, w, rng, sx, sy):
    """Gaussian noise smeared sx along x and sy along y, periodic in both, so a
    texture built from it repeats without a seam."""
    n = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)).astype(np.float32), (sy, sx), mode="wrap")
    return n / (np.abs(n).max() + 1e-6)


def aubergine(img, k, depth=70.0):
    """Every sample's shadows go to aubergine, never to grey or brown-black."""
    lum = img.mean(axis=2, keepdims=True)
    shadow = np.clip(1 - lum / depth, 0, 1)
    return img * (1 - shadow * k) + shadow * k * np.array([30, 18, 38], np.float32) * (lum / 40.0 + 0.2)


# ═════════════════════════════════════════════════════════════════════════════
# THE PLANK
# A thick board a Kid nailed along the wall to stand things on, seen from just
# above eye level. Its top face is worn pale where things have been set down and
# picked up; its front arris is rounded by hands and catches whatever light is
# near; its front face shows the grain running the board's length, a knot or
# two, a check split along it, and the nails that hold it up.
# ═════════════════════════════════════════════════════════════════════════════
PL_W, PL_H = 1024, 120
PL_TOP, PL_ARRIS, PL_FACE, PL_FOOT = 26, 34, 84, 87


def plank_layers(rng):
    W, H = PL_W, PL_H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # the grain: long figure bent by slow waves, fine lines, dark streaks
    figure = wrap_noise(H, W, rng, 90, 3.0)
    fine = wrap_noise(H, W, rng, 26, 0.55)
    bend = wrap_noise(H, W, rng, 140, 30) * 9
    rings = 0.5 + 0.5 * np.sin((yy + bend + figure * 5) / 1.9)
    streak = np.clip((wrap_noise(H, W, rng, 60, 0.7) - 0.3) * 3.0, 0, 1)
    t = 0.5 + figure * 0.26 + fine * 0.2 + (rings - 0.5) * 0.16 - streak * 0.26
    wood = ramp(np.clip(t, 0, 1), [(0.0, "#1f140c"), (0.45, "#4a3120"), (0.8, "#6a4a31"), (1.0, "#84613f")])

    top = yy < PL_TOP
    arris = (yy >= PL_TOP) & (yy < PL_ARRIS)
    face = (yy >= PL_ARRIS) & (yy < PL_FACE)
    body = yy < PL_FOOT

    # the top face is foreshortened: its grain packed tight, paler where worn
    wear = np.clip(wrap_noise(H, W, rng, 70, 8) * 0.5 + 0.35, 0, 1)
    alb = np.where(top[..., None], wood * (1.08 + 0.18 * wear[..., None]), wood)
    alb = np.where(face[..., None], wood * 0.84, alb)
    # height: the top face level, the arris a quarter round, the face upright
    hgt = np.zeros((H, W), np.float32)
    hgt = np.where(top, 10 + (yy / PL_TOP) * 1.5, hgt)
    ta = np.clip((yy - PL_TOP) / (PL_ARRIS - PL_TOP), 0, 1)
    hgt = np.where(arris, 11.5 - (1 - np.sqrt(np.clip(1 - ta ** 2, 0, 1))) * 7, hgt)
    tf = np.clip((yy - PL_ARRIS) / (PL_FACE - PL_ARRIS), 0, 1)
    hgt = np.where(face, 4.5 - tf * 2.5, hgt)
    hgt = np.where(body & ~(top | arris | face), 1.5, hgt)

    # knots, each with its rings pulled round it, tiled across the seam
    for kx, ky, rx, ry in ((180, 58, 11, 7), (646, 64, 9, 6), (905, 14, 14, 5), (412, 11, 10, 4)):
        for ox in (-W, 0, W):
            d = np.sqrt(((xx - kx - ox) / rx) ** 2 + ((yy - ky) / ry) ** 2)
            ring = (0.5 + 0.5 * np.cos(d * 6.5)) * np.exp(-d * 0.8)
            core = np.exp(-(d / 0.6) ** 2)
            m = np.exp(-(d / 2.6) ** 2) * body
            alb = alb * (1 - (ring * 0.3 + core * 0.62)[..., None] * m[..., None])
            hgt = hgt - core * 0.8 * body
    # a check split along the front face, wandering, open in the middle
    for cx0, cx1, cy in ((250, 520, 60), (760, 980, 49)):
        cxs = np.arange(W, dtype=np.float32)[None, :]
        wob = P.wob1d(W, rng, 40, 1.6)[None, :]
        open_ = np.clip(1 - np.abs((cxs - (cx0 + cx1) / 2) / ((cx1 - cx0) / 2)), 0, 1) ** 0.7
        crack = np.exp(-((yy - cy - wob) / (0.5 + 0.9 * open_)) ** 2) * ((cxs > cx0) & (cxs < cx1)) * face
        alb = alb * (1 - crack[..., None] * 0.75)
        hgt = hgt - crack * 1.6
    # the nails that hold it to the wall: two, a hand apart, and a bent one
    nails = np.zeros((H, W), np.float32)
    for nx, ny in ((96, 59), (560, 61), (842, 58)):
        nd = np.hypot(xx - nx, (yy - ny) * 1.1)
        nails = np.maximum(nails, np.clip(1 - nd / 4.6, 0, 1))
    head = nails > 0
    hgt = np.where(head, hgt + np.sqrt(nails) * 3.2, hgt)
    alb = np.where(head[..., None], ramp(nails, [(0, "#1c1410"), (0.55, "#4a3f38"), (1, "#948168")]), alb)
    # grime in the corner where the top meets the wall, soot along the foot
    alb = np.where(top[..., None], alb * (0.72 + 0.28 * smooth(0, 9, yy))[..., None], alb)
    return alb, hgt, body, head


def plank():
    rng = np.random.default_rng(4217)
    alb, hgt, body, head = plank_layers(rng)
    H, W = hgt.shape
    yy = np.arange(H, dtype=np.float32)[:, None]
    hg = ndimage.gaussian_filter(hgt, 0.7, mode="wrap")
    n = normals(hg, 0.9)
    ink = M.ink_lines(hgt, amount=0.55, thresh=1.3)
    # the light the boards are painted under, and a candle's, grazing from above
    L_dark = np.array([-0.3, -0.55, 0.78], np.float32); L_dark /= np.linalg.norm(L_dark)
    L_warm = np.array([-0.15, -0.8, 0.58], np.float32); L_warm /= np.linalg.norm(L_warm)

    def render(L, colour, amb, gain, spec, lip_col, lip_amt):
        lam = lambert(n, L)
        col = alb * np.asarray(colour, np.float32) * (amb + gain * lam)[..., None]
        s = specular(n, L, power=12.0) * (0.25 + 0.75 * head)
        col = col + s[..., None] * np.asarray(spec, np.float32)
        # a loaded stroke of light along the arris, broken where the brush skipped
        lip = np.exp(-((yy - PL_TOP - 3.0) / 1.7) ** 2) * smooth(-0.4, 0.4, wrap_noise(H, W, rng, 30, 0.8) + 0.2)
        col = col + lip[..., None] * np.asarray(lip_col, np.float32) * lip_amt
        col = col * ink[..., None]
        col = P.kuwahara(col, radius=2, sectors=8, q=10.0)
        return col

    dark = render(L_dark, (0.62, 0.55, 0.78), 0.34, 0.5, (40, 30, 50), (80, 62, 90), 0.35)
    dark = aubergine(dark, 0.5)
    warm = render(L_warm, (1.0, 0.78, 0.54), 0.72, 1.35, (150, 100, 50), (255, 196, 120), 0.8)
    warm = aubergine(warm, 0.18)
    # the shadow the plank throws on the wall under it: soft, deepest at its foot
    ys = np.clip((yy - PL_FOOT) / (H - PL_FOOT), 0, 1)
    shadow_a = np.where(yy >= PL_FOOT, (1 - ys) ** 1.8 * 0.72, 0.0)
    alpha = np.where(np.broadcast_to(yy < PL_FOOT, hgt.shape), 1.0, np.broadcast_to(shadow_a, hgt.shape))
    for img, name, q in ((dark, "plank.webp", 90), (warm, "plank-warm.webp", 90)):
        img = np.where(np.broadcast_to((yy >= PL_FOOT)[..., None], img.shape), np.array([10, 6, 12], np.float32), img)
        save(np.dstack([np.clip(img, 0, 255), alpha * 255]), name, q)


# ═════════════════════════════════════════════════════════════════════════════
# THE CUTTING
# The local paper's piece about the pets, torn out and kept: newsprint gone the
# colour of weak tea, a band left clear for the headline (the page letters it,
# so it stays legible and in the game's own type), the house in half-tone, and
# two columns of set type under it as grey lines of words.
# ═════════════════════════════════════════════════════════════════════════════
NC_W, NC_H = 420, 520
NC_HEAD = (18, 150)       # the headline band, rows (the page letters it)
NC_DECK = (156, 190)      # the deck under it


def torn_sheet(W, H, rng, tone, fibre="#f1e9d6", bite=6.0):
    """A sheet torn out by hand: long edges that wander, ends ripped across."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    top = 8 + P.wob1d(W, rng, 40, 3.0)[None, :] + np.abs(P.wob1d(W, rng, 6, 1.6))[None, :]
    bot = H - 8 - P.wob1d(W, rng, 40, 3.0)[None, :] - np.abs(P.wob1d(W, rng, 6, 1.6))[None, :]
    lef = 10 + P.wob1d(H, rng, 9, bite)[:, None] + np.abs(P.wob1d(H, rng, 3, bite * 0.6))[:, None]
    rig = W - 10 - P.wob1d(H, rng, 9, bite)[:, None] - np.abs(P.wob1d(H, rng, 3, bite * 0.6))[:, None]
    inside = (yy > top) & (yy < bot) & (xx > lef) & (xx < rig)
    d = ndimage.distance_transform_edt(inside)
    fib = P.aniso_noise(H, W, rng, 3, 0.8) * 0.05 + noise((H, W), rng, 1.0) * 0.05
    mott = noise((H, W), rng, 26) * 0.08
    col = hexc(tone) * (1 + fib + mott)[..., None]
    # yellowed and grimed towards every edge, a foxing freckle or two
    col = col * (1 - 0.2 * np.exp(-d / 12))[..., None]
    for _ in range(9):
        fx, fy = rng.uniform(20, W - 20), rng.uniform(20, H - 20)
        fd = np.hypot(xx - fx, yy - fy) / rng.uniform(2, 6)
        col = col * (1 - 0.18 * np.exp(-fd ** 2))[..., None]
    edge = np.minimum(np.minimum(xx - lef, rig - xx), np.minimum(yy - top, bot - yy))
    core = (edge < 2.2) & inside
    col = np.where(core[..., None], hexc(fibre) * (0.92 + 0.08 * fib[..., None]), col)
    alpha = ndimage.gaussian_filter(inside.astype(np.float32), 0.5)
    return col, alpha, xx, yy


def newsclip():
    rng = np.random.default_rng(1931)
    W, H = NC_W, NC_H
    col, alpha, xx, yy = torn_sheet(W, H, rng, "#d8cdb2")
    ink = hexc("#2f2a24")
    # a thick and a thin rule under the headline band, and under the deck
    for ry, th in ((NC_HEAD[1] + 1, 1.3), (NC_HEAD[1] + 5, 0.6), (NC_DECK[1] + 3, 0.6)):
        m = (np.abs(yy - ry) < th) & (xx > 30) & (xx < W - 30)
        col = np.where(m[..., None], col * 0.2 + ink * 0.8, col)
    # the photograph: the house off UI/mainMenu.png, printed in half-tone
    px0, py0, px1, py1 = 30, 204, 390, 364
    ph = (xx >= px0) & (xx < px1) & (yy >= py0) & (yy < py1)
    house = Image.open(os.path.join(M.UI, "mainMenu.png")).convert("L")
    house = house.crop((236, 110, 1436, 810)).resize((px1 - px0, py1 - py0), Image.LANCZOS)
    hv = np.asarray(house, np.float32) / 255.0
    lo_, hi_ = np.percentile(hv, 3), np.percentile(hv, 98)
    hv = np.clip((hv - lo_) / (hi_ - lo_ + 1e-6), 0, 1) ** 0.5
    photo = np.full((H, W), 0.5, np.float32)
    photo[py0:py1, px0:px1] = hv
    screen = np.sin(xx * 1.25 + yy * 0.5) * np.sin(yy * 1.25 - xx * 0.5) * 0.5 + 0.5
    dots = (screen > photo).astype(np.float32)
    dots = ndimage.gaussian_filter(dots, 0.45)
    paper = col.copy()
    col = np.where(ph[..., None], paper * (1 - dots[..., None] * 0.78), col)
    # the photo's thin keyline and its caption line
    kl = ph & ((xx < px0 + 1.2) | (xx > px1 - 2.2) | (yy < py0 + 1.2) | (yy > py1 - 2.2))
    col = np.where(kl[..., None], col * 0.35, col)
    # set type: lines of grey words in two columns under the photograph
    for x0, x1 in ((30, 204), (216, 390)):
        y = py1 + 22
        while y < H - 30:
            wx = x0 + (rng.uniform(8, 16) if y == py1 + 22 else 0)
            while wx < x1:
                wl = rng.uniform(9, 30)
                if wx + wl > x1:
                    break
                bar = (xx >= wx) & (xx < wx + wl) & (np.abs(yy - y) < 1.9)
                col = np.where(bar[..., None], col * 0.5 + ink * 0.5 * 0.55, col)
                wx += wl + rng.uniform(3.5, 5.5)
            y += 10.5
    col = col * (1 - 0.04 * noise((H, W), rng, 0.8))[..., None]
    save(np.dstack([np.clip(col, 0, 255), alpha * 255]), "newsclip.webp", 90)


# ═════════════════════════════════════════════════════════════════════════════
# THE HIDEOUT
# The treehouse, inside: rough boards nailed up side by side for its walls,
# each board its own cut of grain with a dark gap beside it; a heavy roof beam
# across the top and two square posts holding it up, and a nailer rail across
# the boards at a Kid's shoulder height, all of sawn timber with its checks,
# knots and nails; floorboards running away underfoot. The timber is the
# heaviest thing in the room and is painted so: a grain you can see at arm's
# length, every arris catching whatever light is near and its far face falling
# into shadow. Rendered in the dark, by candle and by moon, as every ground is.
# ═════════════════════════════════════════════════════════════════════════════
HW, HH = 1920, 1080
H_BEAM = (0, 70)            # the roof beam; the Lobby hangs its charms from its foot
H_RAIL = (636, 682)         # the nailer rail
H_FLOOR = 944               # floorboards start
H_POSTS = (372, 1548)       # the two posts' centres (the Lobby's cobwebs sit in their corners)
H_POST_W = 94


def timber_albedo(h, w, rng, base, light, dark, vertical=False):
    """Heavy sawn timber, painted: long dark grain lines you can see from
    across a room, bent round slow figure, a lighter and a darker streak, and
    the grey of old weathered wood in its pores. Grain runs along x unless
    `vertical`."""
    if vertical:
        return np.ascontiguousarray(timber_albedo(w, h, rng, base, light, dark).transpose(1, 0, 2))
    yy = np.arange(h, dtype=np.float32)[:, None]
    figure = P.aniso_noise(h, w, rng, 180, 7)
    bend = P.aniso_noise(h, w, rng, 260, 40) * 16
    # the grain lines: a sine packed across the timber, bent by the figure, and
    # thresholded into thin dark lines of uneven weight
    phase = (yy + bend + figure * 12) / 4.4
    lines = np.clip((np.sin(phase) - 0.5) * 3.0, 0, 1) * (0.5 + 0.5 * P.aniso_noise(h, w, rng, 40, 2))
    fine = P.aniso_noise(h, w, rng, 40, 0.8)
    streak = P.aniso_noise(h, w, rng, 220, 5)
    t = 0.54 + figure * 0.22 + fine * 0.16 + streak * 0.18 - lines * 0.5
    col = ramp(np.clip(t, 0, 1), [(0.0, dark), (0.5, base), (1.0, light)])
    # weathering: the pores gone grey where the grain opens
    grey = np.clip(fine * 0.5 + 0.2, 0, 1)[..., None] * 0.12
    lum = col.mean(axis=2, keepdims=True)
    return col * (1 - grey) + lum * grey


def checks(h, w, rng, n, length, along_x=True):
    """Seasoning checks: thin dark splits running with the grain, open in the
    middle and closing to nothing at their ends. Returns a 0..1 crack map."""
    out = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for _ in range(n):
        if along_x:
            c0 = rng.uniform(0, w); r = rng.uniform(length * 0.5, length)
            c1 = rng.uniform(h * 0.25, h * 0.75)
            u = (xx - c0) / r
            wob = P.wob1d(w, rng, 60, 1.4)[None, :]
            open_ = np.clip(1 - np.abs(u), 0, 1) ** 0.6
            out = np.maximum(out, np.exp(-((yy - c1 - wob) / (0.35 + 1.1 * open_)) ** 2) * (np.abs(u) < 1))
        else:
            c0 = rng.uniform(0, h); r = rng.uniform(length * 0.5, length)
            c1 = rng.uniform(w * 0.25, w * 0.75)
            u = (yy - c0) / r
            wob = P.wob1d(h, rng, 60, 1.4)[:, None]
            open_ = np.clip(1 - np.abs(u), 0, 1) ** 0.6
            out = np.maximum(out, np.exp(-((xx - c1 - wob) / (0.35 + 1.1 * open_)) ** 2) * (np.abs(u) < 1))
    return out


def hideout_layers():
    rng = np.random.default_rng(5205)
    W, H = HW, HH
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    alb = np.zeros((H, W, 3), np.float32)
    hgt = np.zeros((H, W), np.float32)
    gloss = np.zeros((H, W), np.float32)
    lip = np.zeros((H, W), np.float32)           # painted strokes of light on arrises

    # ── the boards ──
    tones = [("#40291c", "#5e412c", "#1e130c"), ("#3a261b", "#553b2a", "#1a110b"),
             ("#452d1f", "#634631", "#21150d"), ("#3c291f", "#573e2e", "#1b120d")]
    pad = 240
    woods = [T.plank_albedo(H + pad, W, np.random.default_rng(700 + i), *tones[i], scale=1.15) for i in range(4)]
    x = -rng.uniform(30, 100)
    gap_d = np.full((H, W), 99.0, np.float32)
    board_u = np.zeros((H, W), np.float32)
    joint = np.zeros((H, W), np.float32)
    k = 0
    while x < W:
        bw = rng.uniform(132, 212)
        x0, x1 = x, x + bw
        sel = (xx >= x0) & (xx < x1)
        o = int(rng.uniform(0, pad))
        wood = woods[k % 4][o:o + H]
        tone = 1 + rng.uniform(-0.16, 0.14)
        if rng.random() < 0.3:
            jy = rng.uniform(H_BEAM[1] + 110, H_RAIL[0] - 70) if rng.random() < 0.55 else rng.uniform(H_RAIL[1] + 60, H_FLOOR - 60)
            o2 = int(rng.uniform(0, pad))
            wood2 = woods[(k + 2) % 4][o2:o2 + H] * (1 + rng.uniform(-0.12, 0.1))
            wood = np.where((yy > jy)[..., None], wood2, wood)
            joint = np.where(sel, np.maximum(joint, np.exp(-((yy - jy + (xx - x0) * rng.uniform(-.02, .02)) / 2.0) ** 2)), joint)
        alb = np.where(sel[..., None], wood * tone, alb)
        grad = 1 + rng.uniform(-0.12, 0.12) * (yy / H - 0.5) * 2
        alb = np.where(sel[..., None], alb * grad[..., None], alb)
        board_u = np.where(sel, np.clip((xx - x0) / bw, 0, 1), board_u)
        wob = rng.uniform(-3, 3)
        d = np.minimum(xx - x0, x1 - xx) + np.where(sel, wob * (yy / H), 0)
        gap_d = np.where(sel, d, gap_d)
        k += 1
        x = x1 + rng.uniform(4, 8)
    alb = alb * (1 - joint[..., None] * 0.6)
    in_board = gap_d < 90
    cup = 7 + 1.8 * np.sin(np.pi * board_u)
    bev = np.clip(gap_d / 5.0, 0, 1) ** 0.6
    hgt = np.where(in_board, cup * bev, -5)
    # the gaps between boards: the dark of the tree outside, never black
    alb = np.where(in_board[..., None], alb, np.array([9, 6, 10], np.float32))
    # each board's lit edge: the light from the top left catches its left arris
    edge_l = in_board & (gap_d < 3.5) & (board_u < 0.5) & (yy < H_FLOOR)
    lip = np.maximum(lip, edge_l * 0.35 * smooth(-0.3, 0.5, P.aniso_noise(H, W, rng, 2, 70)))
    stain = noise((H, W), rng, (60, 8)) * 0.14 + noise((H, W), rng, 140) * 0.1
    alb = alb * (1 + stain[..., None])
    for _ in range(40):
        hx, hy = rng.uniform(0, W), rng.uniform(110, H_FLOOR - 20)
        hd = np.hypot(xx - hx, yy - hy)
        alb = alb * (1 - np.clip(1 - hd / rng.uniform(1.8, 2.8), 0, 1)[..., None] * 0.7)
    for _ in range(16):
        kx, ky = rng.uniform(0, W), rng.uniform(130, H_FLOOR - 40)
        rx, ry = rng.uniform(8, 14), rng.uniform(16, 28)
        d = np.sqrt(((xx - kx) / rx) ** 2 + ((yy - ky) / ry) ** 2)
        ring = (0.5 + 0.5 * np.cos(d * 7.0)) * np.exp(-d * 0.9)
        core = np.exp(-(d / 0.55) ** 2)
        m = np.exp(-(d / 2.4) ** 2) * in_board
        alb = alb * (1 - (ring * 0.3 + core * 0.58)[..., None] * m[..., None])
        hgt = hgt + core * 1.2

    # ── the posts: square timbers in front of the boards ──
    for px in H_POSTS:
        wob = P.wob1d(H, rng, 300, 1.6)[:, None]
        x0, x1 = px - H_POST_W / 2 + wob, px + H_POST_W / 2 + wob
        sel = (xx >= x0) & (xx < x1) & (yy >= H_BEAM[1] - 6) & (yy < H_FLOOR + 6)
        u = np.clip((xx - x0) / H_POST_W, 0, 1)
        post = timber_albedo(H, W, np.random.default_rng(int(px)), "#4a3222", "#6e4d34", "#1f140c", vertical=True)
        crack = checks(H, W, np.random.default_rng(int(px) + 1), 3, 260, along_x=False)
        crack = crack * ((xx > x0 + 14) & (xx < x1 - 14))
        post = post * (1 - crack[..., None] * 0.8)
        # two chamfers and the flat face between them
        cham = 9.0
        dl, dr = xx - x0, x1 - xx
        face = 22 - np.clip(cham - dl, 0, cham) * 1.5 - np.clip(cham - dr, 0, cham) * 1.5
        alb = np.where(sel[..., None], post, alb)
        hgt = np.where(sel, face + 8 - crack * 2.5, hgt)
        gloss = np.where(sel, 0.22, gloss)
        # the left chamfer takes the light in a broken stroke; the right one is dark
        lit_ch = sel & (dl < cham)
        lip = np.where(sel, 0, lip)
        lip = np.maximum(lip, lit_ch * np.exp(-((dl - 4.5) / 2.6) ** 2) * 0.75
                         * smooth(-0.4, 0.5, P.aniso_noise(H, W, rng, 2, 90) + 0.15))
        alb = np.where((sel & (dr < cham))[..., None], alb * 0.5, alb)
        # the post stands off the boards: its shadow falls wide to its right (the
        # light is top left) and a narrow one gathers against its left side
        sh = (xx >= x1) & (xx < x1 + 56) & (yy >= H_BEAM[1]) & (yy < H_FLOOR)
        alb = np.where(sh[..., None], alb * (0.34 + 0.66 * smooth(0, 56, xx - x1))[..., None], alb)
        sh_l = (xx < x0) & (xx > x0 - 16) & (yy >= H_BEAM[1]) & (yy < H_FLOOR)
        alb = np.where(sh_l[..., None], alb * (0.62 + 0.38 * smooth(0, 16, x0 - xx))[..., None], alb)
        hgt = np.where(sh | sh_l, hgt - 2, hgt)

    # ── the roof beam and the nailer rail, over posts and boards ──
    for (by0, by1), seed, tone in ((H_BEAM, 81, 0.92), (H_RAIL, 82, 1.0)):
        wob = P.wob1d(W, rng, 320, 1.6)[None, :]
        ys = yy - wob
        sel = (ys >= by0) & (ys < by1)
        beam = timber_albedo(H, W, np.random.default_rng(seed), "#472f20", "#6a4a32", "#1d130c")
        crack = checks(H, W, np.random.default_rng(seed + 10), 5, 340, along_x=True)
        crack = crack * ((ys > by0 + 12) & (ys < by1 - 10))
        beam = beam * (1 - crack[..., None] * 0.8)
        cham = 8.0
        dt, db = ys - by0, by1 - ys
        face = 24 - np.clip(cham - dt, 0, cham) * 1.4 - np.clip(cham - db, 0, cham) * 1.8
        alb = np.where(sel[..., None], beam * tone, alb)
        hgt = np.where(sel, face + 12 - crack * 2.5, hgt)
        gloss = np.where(sel, 0.25, gloss)
        lip = np.where(sel, 0, lip)
        lip = np.maximum(lip, (sel & (dt < cham)) * np.exp(-((dt - 4) / 2.4) ** 2) * 0.8
                         * smooth(-0.35, 0.45, P.aniso_noise(H, W, rng, 100, 2) + 0.12))
        alb = np.where((sel & (db < cham))[..., None], alb * 0.48, alb)
        below = (ys >= by1) & (ys < by1 + 44)
        alb = np.where(below[..., None], alb * (0.3 + 0.7 * smooth(by1, by1 + 44, ys))[..., None], alb)
    # iron nails: where the rail crosses each post, and along the beam
    nails = np.zeros((H, W), np.float32)
    spots = []
    for px in H_POSTS:
        spots += [(px - 18, H_RAIL[0] + 15), (px + 16, H_RAIL[1] - 14), (px - 14, 30), (px + 18, 46)]
    for nx in np.arange(120, W, 250):
        spots.append((nx + rng.uniform(-30, 30), rng.uniform(26, 44)))
        spots.append((nx + 125 + rng.uniform(-30, 30), H_RAIL[0] + rng.uniform(16, 30)))
    for nx, ny in spots:
        nd = np.hypot(xx - nx, yy - ny)
        nails = np.maximum(nails, np.clip(1 - nd / 5.4, 0, 1))
    head = nails > 0
    hgt = np.where(head, hgt + np.sqrt(nails) * 4.5, hgt)
    alb = np.where(head[..., None], ramp(nails, [(0, "#22170f"), (0.6, "#5a4a3d"), (1, "#95806a")]), alb)
    gloss = np.where(head, 0.9, gloss)

    # ── the floor: boards running away from the viewer ──
    fl = yy >= H_FLOOR
    fwood = timber_albedo(H, W, np.random.default_rng(93), "#3a281c", "#553b29", "#170f09")
    edge = np.full((H, W), 99.0, np.float32)
    y = float(H_FLOOR)
    while y < H:
        depth = 12 + 36 * ((y - H_FLOOR) / (H - H_FLOOR)) ** 1.1 + rng.uniform(-1, 2)
        ry0, ry1 = y, y + depth
        t = ((ry0 + ry1) / 2 - H_FLOOR) / (H - H_FLOOR)
        xj = -rng.uniform(0, 300)
        while xj < W:
            ln = rng.uniform(420, 900) * (0.7 + 0.6 * t)
            sel = fl & (yy >= ry0) & (yy < ry1) & (xx >= xj) & (xx < xj + ln)
            dd = np.minimum(np.minimum(yy - ry0, ry1 - yy) * 1.6, np.minimum(xx - xj, xj + ln - xx))
            edge = np.where(sel, dd, edge)
            alb = np.where(sel[..., None], np.roll(fwood, int(rng.uniform(0, W)), axis=1) * (1 + rng.uniform(-0.12, 0.1)), alb)
            xj += ln
        y = ry1
    e = np.clip(edge, 0, 12)
    hgt = np.where(fl, np.clip(e / 3.0, 0, 1) ** 0.7 * 4.0, hgt)
    alb = np.where(fl[..., None], alb * (0.35 + 0.65 * np.clip(e / 1.6, 0, 1))[..., None], alb)
    alb[H_FLOOR:] *= (1 - 0.62 * np.exp(-(np.arange(H - H_FLOOR, dtype=np.float32) / 18)))[:, None, None]
    gloss = np.where(fl, 0.2, gloss)
    return alb, hgt, gloss, lip


def hideout():
    alb, hgt, gloss, lip = hideout_layers()
    H, W = hgt.shape
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    ink = np.clip(P.ink_lines(hgt, amount=0.6, thresh=1.3), 0, 0.9)
    rng = np.random.default_rng(606)
    tex = P.grit(H, W, seed=9, scale=1.0)
    brush = P.aniso_noise(H, W, rng, 22, 2.2, angle=-24)
    brush2 = P.aniso_noise(H, W, rng, 16, 2.0, angle=62)
    ao = np.clip((ndimage.gaussian_filter(hgt, 7) - hgt) / 3.2, 0, 1)
    ao = ndimage.gaussian_filter(ao, 1.5)
    dabs = ndimage.gaussian_filter(rng.normal(0, 1, (H // 6, W // 6)).astype(np.float32), 0.9)
    dabs = P.resize_f(dabs / (np.abs(dabs).max() + 1e-6), W, H)

    def finish(col, hi_colour, hi_amt, aub):
        col = col + lip[..., None] * np.asarray(hi_colour, np.float32) * hi_amt
        col = col * (1 - 0.5 * ao[..., None])
        col = aubergine(col, aub)
        col = P.kuwahara(col, radius=3, sectors=8, q=10.0)
        col = col * (1 - ink[..., None])
        col = col * (0.76 + 0.24 * tex[..., None])
        col = col * (1 + (brush * 0.06 + brush2 * 0.04 + dabs * 0.06)[..., None])
        return np.clip(col, 0, 255)

    # the dark: the treehouse at night with only the boards' own warmth in it,
    # its top lost under the roof and its foot in shadow, its sides falling off
    dark = P.lit(alb, hgt, gloss, np.array([-0.25, -0.45, 0.86], np.float32), (0.7, 0.58, 0.78), 0.44, 0.46)
    vfall = (0.5 + 0.5 * smooth(0, 480, yy)) * (1 - 0.46 * smooth(H_FLOOR, H, yy))
    hfall = 1 - 0.26 * (np.abs(xx - W / 2) / (W / 2)) ** 2
    dark = finish(dark * (vfall * hfall)[..., None], (60, 44, 60), 0.35, 0.5)
    # candle light grazing down from lanterns hung above eye level
    Lw = np.array([-0.2, -0.78, 0.6], np.float32)
    Lw /= np.linalg.norm(Lw)
    warm = P.lit(alb, hgt, gloss, Lw, (1.0, 0.76, 0.52), 0.7, 1.62, spec=(140, 92, 44))
    warm = finish(warm, (255, 190, 110), 0.85, 0.2)
    Lm = np.array([0.35, -0.55, 0.76], np.float32)
    Lm /= np.linalg.norm(Lm)
    moon = P.lit(alb, hgt, gloss, Lm, (0.54, 0.66, 1.0), 0.54, 1.42, spec=(56, 76, 116))
    moon = finish(moon, (130, 160, 220), 0.5, 0.3)
    save(dark, "hideout.webp", 86)
    save(warm, "hideout-warm.webp", 84)
    save(moon, "hideout-moon.webp", 84)


# ═════════════════════════════════════════════════════════════════════════════
# THE TRUNK
# The tree the treehouse is built round comes up through its floor: a length of
# trunk in thick bark, the plates split by deep furrows that wander and join,
# a crack across a plate here and there, pale lichen in the furrows' lee. Seen
# straight on it is a cylinder, lit from the boards' top left, its right side
# turning away into the dark; its edges are the bark's own ragged silhouette.
# It tiles up and down, so a board stands it at any height.
# ═════════════════════════════════════════════════════════════════════════════
TR_W, TR_H = 240, 720


def trunk():
    rng = np.random.default_rng(3141)
    W, H = TR_W, TR_H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # the silhouette: a column whose edges wander, periodic top to bottom
    edge_l = 22 + wrap_noise(H, 1, rng, 1, 18)[:, 0] * 9 + wrap_noise(H, 1, rng, 1, 3)[:, 0] * 2.5
    edge_r = W - 22 - wrap_noise(H, 1, rng, 1, 18)[:, 0] * 9 - wrap_noise(H, 1, rng, 1, 3)[:, 0] * 2.5
    inside = (xx > edge_l[:, None]) & (xx < edge_r[:, None])
    cw = (edge_r - edge_l)[:, None]
    u = np.clip((xx - edge_l[:, None]) / cw, 0, 1)            # 0 at the left edge, 1 at the right
    # BARK PLATES: the bark splits into long interlocking plates, so the pattern
    # is a stretched cell map — each point's nearest plate, and how far it is
    # from the furrow to the next one — laid out on a cylinder that wraps top
    # to bottom, which is what lets it tile.
    from scipy.spatial import cKDTree
    STRETCH = 3.4                                  # plates are this many times taller than wide
    n_pl = 150
    seeds = np.column_stack([rng.uniform(0, W, n_pl), rng.uniform(0, H, n_pl) / STRETCH])
    Hs = H / STRETCH
    wrapped = np.vstack([seeds, seeds + [0, Hs], seeds - [0, Hs]])
    wob = wrap_noise(H, W, rng, 6, 10) * 5 + wrap_noise(H, W, rng, 2, 3) * 1.5
    pts = np.column_stack([(xx + wob).ravel(), ((yy + wob * 2) / STRETCH).ravel()])
    d, idx = cKDTree(wrapped).query(pts, k=2)
    edge = ((d[:, 1] - d[:, 0]) * 0.5).reshape(H, W)
    cell = (idx[:, 0] % n_pl).reshape(H, W)
    # furrows: deep and wide where two plates part; the plates' tops flat, their
    # shoulders rounding over into the furrow
    furrow_w = 3.2 + 2.2 * (wrap_noise(H, W, rng, 20, 30) * 0.5 + 0.5)
    t_edge = np.clip(edge / furrow_w, 0, 1)
    plate = t_edge ** 0.55
    # each plate its own height and tone, a fine vertical fibre over it, and the
    # odd crack across a plate where it has broken
    ph = rng.uniform(-1, 1, n_pl)[cell]
    fibre = wrap_noise(H, W, rng, 0.7, 9)
    across = np.clip(1 - np.abs(wrap_noise(H, W, rng, 14, 1.4)) / 0.035, 0, 1) * (plate > 0.8) * (wrap_noise(H, W, rng, 10, 18) > 0.3)
    hgt = plate * (9 + ph * 2.5) + fibre * 0.8 * plate - across * 4
    # the cylinder: the trunk's round section under the bark
    hgt = hgt + np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1)) * 30
    hgt = np.where(inside, hgt, 0)
    # colour: the samples' tree is a grey-brown bark gone silver on its plates'
    # faces and black in its furrows, with pale lichen in the lee of a plate
    tone = rng.uniform(-1, 1, n_pl)[cell] * 0.07 + wrap_noise(H, W, rng, 20, 50) * 0.06
    alb = ramp(np.clip(0.08 + plate * 0.72 + tone + fibre * 0.05 - across * 0.4, 0, 1),
               [(0.0, "#0e0a09"), (0.25, "#241c18"), (0.55, "#433a33"), (0.8, "#5f554c"), (1.0, "#7a7065")])
    lich = np.clip(wrap_noise(H, W, rng, 2.5, 2.5) - 0.42, 0, 1) * 2.2 * np.clip(plate * 1.4 - 0.2, 0, 1)
    lich = lich * (wrap_noise(H, W, rng, 26, 36) > 0.25)
    alb = alb * (1 - 0.7 * lich[..., None]) + np.array([92, 104, 84], np.float32) * 0.7 * lich[..., None]
    hg = ndimage.gaussian_filter(hgt, 0.8, mode="wrap")
    n = normals(hg, 1.0)
    ink = M.ink_lines(hgt * inside, amount=0.55, thresh=1.0)
    # the side turning away from the light, and the edge of the silhouette inked
    turn = (0.16 + 0.84 * (1 - u ** 1.35)) * (0.72 + 0.28 * np.sin(np.clip(u * 1.25 + 0.1, 0, 1) * np.pi))
    d_in = ndimage.distance_transform_edt(inside)
    rim_ink = np.clip(1 - d_in / 2.4, 0, 1) * 0.7

    def render(L, colour, amb, gain, spec_amt, aub):
        lam = lambert(n, L)
        col = alb * np.asarray(colour, np.float32) * (amb + gain * lam)[..., None]
        s = specular(n, L, power=14.0) * plate * spec_amt
        col = col + s[..., None] * np.array([110, 96, 80], np.float32)
        col = col * (turn * ink * (1 - rim_ink))[..., None]
        col = aubergine(col, aub)
        col = P.kuwahara(col, radius=2, sectors=8, q=10.0)
        return np.clip(col, 0, 255)

    L1 = np.array([-0.45, -0.5, 0.74], np.float32); L1 /= np.linalg.norm(L1)
    dark = render(L1, (0.6, 0.54, 0.74), 0.34, 0.5, 0.05, 0.5)
    warm = render(L1, (1.0, 0.8, 0.6), 0.5, 1.12, 0.14, 0.24)
    alpha = ndimage.gaussian_filter(inside.astype(np.float32), 0.6, mode="wrap")
    save(np.dstack([dark, alpha * 255]), "trunk.webp", 88)
    save(np.dstack([warm, alpha * 255]), "trunk-warm.webp", 88)


# ═════════════════════════════════════════════════════════════════════════════
# THE CASEMENTS
# Two small windows high in the treehouse wall, each a square of old glass in a
# rough plank frame with a cross bar and a sill, and through them the night of
# UI/mainMenu.png itself: in one, the gnarled tree's boughs in their bark
# against the stars; in the other, the sky over the grounds with the moon in it.
# The view is the sample painting, so the night outside is painted by its hand.
# ═════════════════════════════════════════════════════════════════════════════
CS_W, CS_H = 360, 400


def casement_piece(name, crop, moon=None, seed=1):
    rng = np.random.default_rng(seed)
    W, H, ss = CS_W, CS_H, 2
    SW, SH = W * ss, H * ss
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32) / ss
    fx0, fx1, fy0, fy1 = 14, W - 14, 12, H - 48      # the frame's outside
    band = 30                                        # the frame's planks
    gx0, gx1, gy0, gy1 = fx0 + band, fx1 - band, fy0 + band, fy1 - band
    frame = (xx >= fx0) & (xx <= fx1) & (yy >= fy0) & (yy <= fy1)
    glass = (xx >= gx0) & (xx <= gx1) & (yy >= gy0) & (yy <= gy1)
    sill = (xx >= 2) & (xx <= W - 2) & (yy >= fy1 - 4) & (yy <= fy1 + 24)

    # the view, off the sample painting, cooled and pushed into the night
    im = Image.open(os.path.join(M.UI, "mainMenu.png")).convert("RGB").crop(crop)
    vw, vh = int((gx1 - gx0) * ss), int((gy1 - gy0) * ss)
    k = max(vw / im.width, vh / im.height)
    im = im.resize((int(im.width * k) + 1, int(im.height * k) + 1), Image.LANCZOS)
    ox, oy = (im.width - vw) // 2, (im.height - vh) // 2
    im = im.crop((ox, oy, ox + vw, oy + vh))
    v = np.asarray(im, np.float32) * np.array([0.78, 0.86, 1.08], np.float32) * 0.86
    vyy, vxx = np.mgrid[0:vh, 0:vw].astype(np.float32)
    if moon is not None:
        mx, my, mr = vw * moon[0], vh * moon[1], moon[2] * ss
        md = np.hypot(vxx - mx, vyy - my)
        disc = 1 - smooth(mr - 1.4, mr + 1.4, md)
        # a moon with its seas in it, a shade warmer than the sky's blue
        seas = noise((vh, vw), rng, 4 * ss) * 0.12 + noise((vh, vw), rng, 1.5 * ss) * 0.05
        mcol = np.array([236, 234, 222], np.float32) * (1 - seas[..., None]) * (0.9 + 0.1 * np.clip((mx - vxx) / mr, -1, 1))[..., None]
        v = v * (1 - disc[..., None]) + disc[..., None] * mcol
        halo = np.exp(-(np.maximum(md - mr, 0) / (mr * 2.2)) ** 1.2) * (1 - disc)
        v = v + halo[..., None] * np.array([70, 92, 132], np.float32) * 0.75
    # old glass: dim at its edges, a streaked sheen, a little dust
    rv = np.hypot((vxx / vw - 0.5) * 1.25, (vyy / vh - 0.5) * 1.2)
    v = v * (1 - 0.38 * smooth(0.28, 0.8, rv))[..., None]
    col = np.zeros((SH, SW, 3), np.float32)
    col[int(gy0 * ss):int(gy0 * ss) + vh, int(gx0 * ss):int(gx0 * ss) + vw] = v
    sheen = smooth(0.0, 1.0, 1 - np.abs((xx - yy * 0.55 - 70) / 34.0)) * 0.09 * glass
    sheen2 = smooth(0.0, 1.0, 1 - np.abs((xx - yy * 0.55 - 140) / 10.0)) * 0.06 * glass
    col = col + (sheen + sheen2)[..., None] * np.array([150, 172, 214], np.float32)
    dust = noise((SH, SW), rng, 6 * ss) * 0.5 + 0.5
    col = col * (1 - 0.1 * dust * glass)[..., None]

    # the frame: four rough planks, butt-jointed, a cross bar, a sill under it
    midx, midy = (gx0 + gx1) / 2, (gy0 + gy1) / 2
    cross = glass & ((np.abs(xx - midx) <= 5.5) | (np.abs(yy - midy) <= 5.5))
    wood_v = timber_albedo(SH, SW, np.random.default_rng(seed + 20), "#4a3222", "#6c4c33", "#1f140c", vertical=True)
    wood_h = timber_albedo(SH, SW, np.random.default_rng(seed + 21), "#46301f", "#684830", "#1d130b")
    ring = frame & ~glass
    top_bot = ring & ((yy < gy0) | (yy > gy1))
    wood = np.where(top_bot[..., None], wood_h, wood_v)
    wood = np.where(cross[..., None], wood_v * 0.92, wood)
    d_ring = ndimage.distance_transform_edt(ring) / ss
    d_cross = ndimage.distance_transform_edt(cross) / ss
    hgt = np.where(ring, np.clip(d_ring / 5, 0, 1) ** 0.6 * 9, 0) + np.where(cross, np.clip(d_cross / 3, 0, 1) * 5, 0)
    hgt = hgt + np.where(sill, 10 + np.where(yy < fy1 + 6, 3, 0), 0)
    hgt = ndimage.gaussian_filter(hgt, ss * 0.6)
    n = normals(hgt * ss, 0.8)
    lam = lambert(n)
    lit = wood * (0.3 + 0.95 * lam[..., None])
    col = np.where((ring | cross)[..., None], lit, col)
    col = np.where(sill[..., None], wood_h * (0.34 + 0.85 * lam[..., None]), col)
    # the moon's rim on the inside of the frame, cold, on the lit edges
    if moon is not None:
        rim = ring & (d_ring < 3.5) & ((np.abs(xx - gx1) < 4) | (np.abs(yy - gy0) < 4))
        col = np.where(rim[..., None], col + np.array([40, 56, 86], np.float32) * 0.6, col)
    for jx in (fx0 + band, fx1 - band):
        m = ring & (np.abs(xx - jx) < 1.0) & ((yy < gy0) | (yy > gy1))
        col = np.where(m[..., None], col * 0.3, col)
    for nx, ny in ((fx0 + 15, fy0 + 15), (fx1 - 15, fy0 + 15), (fx0 + 15, fy1 - 15), (fx1 - 15, fy1 - 15), (W * 0.3, fy1 + 12), (W * 0.7, fy1 + 12)):
        nd = np.hypot(xx - nx, yy - ny)
        m = nd < 3.4
        col = np.where(m[..., None], ramp(np.clip(1 - nd / 3.4, 0, 1), [(0, "#231812"), (1, "#8a765d")]), col)
    # the frame's shadow in the glass, ink round every edge
    dsh = np.minimum(yy - gy0, xx - gx0)
    col = np.where((glass & ~cross)[..., None], col * (0.42 + 0.58 * smooth(0, 18, dsh))[..., None], col)
    mask = frame | sill
    e = ndimage.distance_transform_edt(mask) / ss
    col = col * smooth(0.0, 1.4, e)[..., None]
    for m_ in (glass, cross):
        b = ndimage.binary_dilation(m_, iterations=ss) & ~ndimage.binary_erosion(m_, iterations=ss)
        col = np.where(b[..., None], col * 0.3, col)
    col = aubergine(col, 0.35)
    alpha = mask.astype(np.float32)
    col, alpha = down(col, ss), down(alpha, ss)
    col = P.kuwahara(col, radius=1, sectors=8, q=8.0)
    save(np.dstack([np.clip(col, 0, 255), alpha * 255]), name, 90)


def casements():
    # the gnarled tree's boughs against the stars (the painting's top left)
    casement_piece("casement-bough.webp", (40, 30, 340, 330), moon=None, seed=41)
    # the sky over the grounds, stars and cloud, and the moon in it
    casement_piece("casement-moon.webp", (1372, 0, 1672, 300), moon=(0.62, 0.34, 26), seed=42)


PIECES = {
    "plank": plank,
    "newsclip": newsclip,
    "hideout": hideout,
    "trunk": trunk,
    "casements": casements,
}


def main():
    global PREVIEW
    ap = argparse.ArgumentParser(description="Paint the Kids' places' timber.")
    ap.add_argument("--only", default="", help="comma-separated: " + ", ".join(PIECES))
    ap.add_argument("--preview", default=None, help="also write PNG previews here")
    a = ap.parse_args()
    PREVIEW = a.preview
    names = [s.strip() for s in a.only.split(",") if s.strip()] or list(PIECES)
    print("kids' boards ->", os.path.relpath(OUT, ROOT))
    for nm in names:
        PIECES[nm]()


if __name__ == "__main__":
    main()
