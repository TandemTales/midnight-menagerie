"""Prepare the shared UI kit from Josh's sample boards.

The Title and the two select screens ARE Josh's paintings. Every other screen is
built out of the same paintings, cut into pieces: the empty info panels, the
Kid portrait frames, the cartouche nameplates, the round enamel buttons, the
medallions, the candles, the cobwebs and the purple scrollwork in
`UI/selectKid.png` and `UI/selectCompanion.png` are exactly the kit every room
needs. This script cuts them out once and writes them to `game/assets/ui/kit/`.
The output is committed (CONTRACTS non-negotiable #1: no runtime build step).

What comes out, and how `game/src/ui/kit.css` uses it:

  from UI/title.png
  cart-cap-l / -r, cart-band, cart-crest
                        the wordmark's cartouche, rebuilt to hold any title:
                        scrolled ends + a level band + the finial (.kit-titleblock)
  cart-bat(-r), cart-star   the wordmark's bat and star, riding inside the ends
  from UI/selectCompanion.png
  corner-l / corner-r   candle + cobweb + scrollwork: the top corners of a board
  plate                 a tile's dark nameplate, lettering removed (9-slice:
                        .kit-plate, .kit-btn, HUD chips, prices)
  damask                a half-drop damask made of the sheet's own scrollwork
  from UI/selectKid.png
  vine-l / vine-r       the purple scroll vines down both sides of a board
  panel                 the big info panel, emptied (9-slice: .kit-panel)
  frame                 the Kid portrait frame, emptied (9-slice: .kit-frame,
                        the frames the Tricks hang in)
  ribbon                the gold ribbon, lettering removed (3-slice: .kit-ribbon)
  medal-paw / -star / -star2 / -shield / -moon
                        the medallions the panels wear on their top rail
  button                the round purple enamel button, glyph painted out
  button-ornate         the same, seated in its gold filigree
  candle, skull         set dressing (.kit-prop)
  grain                 the panels' own grain as a neutral overlay tile
  from UI/mainMenu.png
  hall-*                four details of the mansion, hung as portraits
  generated in the painting's manner
  floor                 cobbles that flatten into the dark (.kit-dress__floor)
  marble                marbled lavender for display type (.kit-cartouche__title)

Everything with an alpha edge is keyed on LUMINANCE against the painting's own
near-black ground and then *unmixed* from that ground, so a piece composited
back onto a dark board reproduces the painting instead of going muddy.

    python tools/prep_ui_kit.py            # write everything
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "UI")
OUT = os.path.join(ROOT, "game", "assets", "ui", "kit")

SK = "selectKid.png"
SC = "selectCompanion.png"
TT = "title.png"

_cache = {}


def src(name):
    if name not in _cache:
        _cache[name] = np.asarray(Image.open(os.path.join(UI, name)).convert("RGB")).astype(np.float32)
    return _cache[name]


def crop(name, box):
    x0, y0, x1, y1 = box
    return src(name)[y0:y1, x0:x1].copy()


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def ramp(v, lo, hi):
    return np.clip((v - lo) / max(1e-6, hi - lo), 0.0, 1.0)


def unmix(rgb, alpha, bg):
    """Colour that composites over `bg` at `alpha` back to `rgb`."""
    a = np.clip(alpha, 1e-3, 1.0)[..., None]
    out = (rgb - (1.0 - a) * np.asarray(bg, np.float32)) / a
    return np.clip(out, 0, 255)


def rgba(rgb, alpha):
    return np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255.0, 0, 255)]).astype(np.uint8)


def feather(alpha, left=0, right=0, top=0, bottom=0):
    h, w = alpha.shape
    m = np.ones_like(alpha)
    if left:
        m[:, :left] *= np.linspace(0, 1, left)[None, :] ** 1.4
    if right:
        m[:, w - right:] *= np.linspace(1, 0, right)[None, :] ** 1.4
    if top:
        m[:top, :] *= np.linspace(0, 1, top)[:, None] ** 1.4
    if bottom:
        m[h - bottom:, :] *= np.linspace(1, 0, bottom)[:, None] ** 1.4
    return alpha * m


def blur(a, r):
    return ndimage.gaussian_filter(a, r) if r else a


def save(arr, name, quality=90, lossless=False):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    im = Image.fromarray(arr)
    if name.endswith(".webp"):
        im.save(path, "WEBP", quality=quality, method=6, lossless=lossless, exact=False)
    else:
        im.save(path, optimize=True)
    print(f"  {name:24s} {im.width:4d}x{im.height:<4d} {os.path.getsize(path) / 1024:7.1f} KB")
    return path


# ── keyed pieces ────────────────────────────────────────────────────────────
def keyed(name, box, lo, hi, bg, gamma=1.0, soft=0.6, **fe):
    rgb = crop(name, box)
    l = blur(lum(rgb), soft)
    a = ramp(l, lo, hi) ** gamma
    a = feather(a, **fe)
    return rgba(unmix(rgb, a, bg), a)


def corners():
    # selectCompanion's top band: cobweb, a lit candle on a brass stick, purple
    # scrollwork. The band ends where the cartouche rim and the tile rails start.
    # Keyed from lum 17, not 9: the painting's own ground sits at lum 8-16 and,
    # kept at partial alpha, it laid a faint dark rectangle over the board's wall.
    for name, box, fe in [("corner-l.webp", (0, 0, 292, 178), dict(right=80, bottom=34)),
                          ("corner-r.webp", (962, 0, 1254, 178), dict(left=80, bottom=34))]:
        rgb = crop(SC, box)
        l = blur(lum(rgb), 0.6)
        # Two keys. Far from anything lit, only real ornament survives (lum 17+).
        # Close to a lit edge the painting's darks are the object's own shadow
        # side (the candlestick's stem, the scroll's undercut) and are kept.
        far = ramp(l, 17, 58)
        near = ramp(l, 7, 30)
        lit = l > 34
        d = ndimage.distance_transform_edt(~lit)
        w = np.clip(1.0 - (d - 3.0) / 5.0, 0, 1)
        a = far * (1 - w) + near * w
        a = feather(a, **fe)
        save(rgba(unmix(rgb, a, (7, 5, 7)), a), name, 88)


def vines():
    # The scroll vines inside selectKid's outer rule, below the cobwebs and above
    # the round buttons. The outer rule itself is drawn by CSS.
    # Measured: the board's outer rule is at x 9-13 / 1435-1438 and the Kid
    # frames' gold rails at 73-76 / 1369-1373; the vines live between.
    for name, box, fe in (("vine-l.webp", (17, 150, 68, 930), dict(top=40, bottom=60, right=4)),
                          ("vine-r.webp", (1377, 150, 1428, 930), dict(top=40, bottom=60, left=4))):
        rgb = crop(SK, box)
        a = feather(ramp(blur(lum(rgb), 0.6), 10, 42), **fe)
        # the vines are violet: any gold here is a neighbouring frame's scroll
        foreign = ndimage.binary_dilation(warm(rgb) | ((rgb[..., 0] > 40) & (rgb[..., 0] > rgb[..., 2] * 1.15)), iterations=2)
        a = np.where(foreign, 0, a)
        save(rgba(unmix(rgb, np.maximum(a, 1e-3), (9, 6, 11)), a), name, 88)


def warm(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 62) & (r > b * 1.22) & (g > b * 1.02)


def violet(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (lum(rgb) > 26) & (b > g * 1.12) & (r > g * 1.02)


def panel():
    """selectKid's big bottom info panel, emptied.

    Rails (measured): left x 683-687, right 1103-1106, top y 747-750, bottom
    938-941. The paw medallion sits on the top rail; it is replaced by the
    clean length of rail beside it, so a `border-image` slice never smears it.
    """
    M = 14                                         # dark margin kept outside the rails
    ox0, oy0, ox1, oy1 = 683 - M, 747 - M, 1106 + M + 1, 941 + M + 1
    rgb = crop(SK, (ox0, oy0, ox1, oy1))
    h, w = rgb.shape[:2]

    # the medallion: x 838..952 on the top rail rows -> clean rail from x 724..838
    my0, my1 = 733 - oy0, 792 - oy0
    rgb[my0:my1, 838 - ox0:952 - ox0] = crop(SK, (724, 733, 838, 792))

    yy, xx = np.mgrid[0:h, 0:w]
    L, R, T, B = 683 - ox0, 1106 - ox0, 747 - oy0, 941 - oy0      # outer rail edges
    inner = (xx > L + 4) & (xx < R - 4) & (yy > T + 4) & (yy < B - 4)
    outside = (xx < L - 1) | (xx > R + 1) | (yy < T - 1) | (yy > B + 1)

    # ornaments only live in the corners; everything else inside is panel ground
    corner = (np.minimum(xx - L, R - xx) < 34) & (np.minimum(yy - T, B - yy) < 34)
    orn = (warm(rgb) | violet(rgb)) & corner
    orn = ndimage.binary_dilation(orn, iterations=2)

    a = np.ones((h, w), np.float32)
    # interior: fade out a few px in from the rail so its dark inner lip survives
    d_in = np.minimum.reduce([xx - (L + 4), (R - 4) - xx, yy - (T + 4), (B - 4) - yy]).astype(np.float32)
    a = np.where(inner, np.clip(1.0 - d_in / 4.0, 0, 1), a)
    # outside: keyed on luminance against the painting's near-black ground
    k = ramp(blur(lum(rgb), 0.5), 9, 40)
    a = np.where(outside, k, a)
    a = np.where(orn, np.maximum(a, ramp(blur(lum(rgb), 0.5), 6, 26)), a)
    # Specks of the neighbouring painting that the luminance key let through
    # OUTSIDE the rail (a curl of the Kid board's vine sat 10 px off the top-left
    # corner and rode every panel as a stray bracket): keep only what is joined
    # to the rail itself.
    lab, n = ndimage.label(a > 0.06)
    if n > 1:
        main = lab[T, (L + R) // 2]
        stray = (lab > 0) & (lab != main) & outside
        a = np.where(stray, 0, a)
    a = blur(a, 0.35)
    out = rgba(unmix(rgb, a, (6, 4, 7)), a)
    save(out, "panel.webp", 92)
    print(f"      panel slice: 44  image {w}x{h}  rail-from-edge {M}")


def medal(name, box, out, bg=(6, 4, 7), lo=24, hi=52, rail_rows=None, clear_cols=None, hole=30):
    """A medallion off a panel rail or the mirror. Keyed hard (the panel ground
    beside it is lum ~18, the room ground ~5) with its enclosed enamel filled
    back in, so the black inside the rim stays black instead of going clear."""
    rgb = crop(name, box)
    l = blur(lum(rgb), 0.5)
    core = ndimage.binary_closing(l > hole, iterations=2)
    core = ndimage.binary_fill_holes(core)
    core = ndimage.binary_dilation(core, iterations=1)
    a = np.maximum(ramp(l, lo, hi), blur(core.astype(np.float32), 0.6))
    if rail_rows is not None and clear_cols is not None:
        # take the stubs of panel rail back out: they are drawn by the panel
        y0, y1 = rail_rows
        for c0, c1 in clear_cols:
            a[y0:y1, c0:c1] = 0
    a = blur(a, 0.4)
    save(rgba(unmix(rgb, a, bg), a), out, 92)


def medals():
    medal(SK, (842, 735, 948, 790), "medal-paw.webp", rail_rows=(10, 20), clear_cols=[(0, 6), (100, 106)])
    medal(SK, (861, 360, 932, 413), "medal-star.webp")
    medal(SK, (757, 548, 807, 604), "medal-shield.webp")
    medal(SK, (975, 548, 1030, 604), "medal-star2.webp")
    medal(SK, (428, 238, 584, 336), "medal-moon.webp")


def frame():
    """The ornate Kid portrait frame (selectKid, left column, second frame).

    Rails measured at x 74-76 / 297-300, y 365-366 / 542-545. The portrait is
    removed: inside the rails only the corner scrollwork survives, so the frame
    can hold a card, a ware or a dim empty recess at any size.
    """
    M = 12
    ox0, oy0, ox1, oy1 = 74 - M, 365 - M, 300 + M + 1, 545 + M + 1
    rgb = crop(SK, (ox0, oy0, ox1, oy1))
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    L, R, T, B = 74 - ox0, 300 - ox0, 365 - oy0, 545 - oy0
    inner = (xx > L + 4) & (xx < R - 4) & (yy > T + 3) & (yy < B - 4)
    outside = (xx < L - 1) | (xx > R + 1) | (yy < T - 1) | (yy > B + 1)
    corner = (np.minimum(xx - L, R - xx) < 44) & (np.minimum(yy - T, B - yy) < 44)
    # the scrollwork: warm metal, plus its own dark outline one px around it
    orn = warm(rgb) & corner
    orn = ndimage.binary_opening(orn, iterations=1) | (warm(rgb) & corner & (lum(rgb) > 90))
    orn = ndimage.binary_dilation(orn, iterations=2)
    a = np.ones((h, w), np.float32)
    d_in = np.minimum.reduce([xx - (L + 4), (R - 4) - xx, yy - (T + 3), (B - 4) - yy]).astype(np.float32)
    a = np.where(inner, np.clip(1.0 - d_in / 3.0, 0, 1), a)
    a = np.where(outside, ramp(blur(lum(rgb), 0.5), 10, 42), a)
    a = np.where(orn, 1.0, a)
    # the vine behind the frame's top-left corner is not part of the frame
    vine = violet(rgb) & ~ndimage.binary_dilation(warm(rgb), iterations=3)
    a = np.where(vine & outside, 0, a)
    # the neighbouring frames' rails sit 6-8 px above and below this one
    a[: T - 5] = 0
    a[B + 7:] = 0
    a = blur(a, 0.4)
    save(rgba(unmix(rgb, a, (7, 5, 8)), a), "frame.webp", 92)
    print(f"      frame slice: {M + 40}  image {w}x{h}  rail-from-edge {M}")


def plate():
    """The dark cartouche nameplate from a Companion tile, lettering removed.

    Marmalade's plate: rim x 55..262, y 382..445. Lettering occupies x 97..216;
    columns 76..95 are clean plate, so the middle of the plate is rebuilt from
    them. Outside the rim is tile art, not ground, so the plate is cut out by
    its own rim (closed and hole-filled) rather than keyed.
    """
    box = (50, 378, 270, 450)
    rgb = crop(SC, box)
    h, w = rgb.shape[:2]
    # The plate's outline, measured off the painting: straight rails at y 388
    # and 444, a round bulge at each end reaching x 55 and x 262.
    Z = 4
    m = Image.new("L", (w * Z, h * Z), 0)
    dr = ImageDraw.Draw(m)
    P = lambda x, y: ((x - box[0]) * Z, (y - box[1]) * Z)
    dr.rectangle([*P(74, 387), *P(243, 445)], fill=255)
    dr.ellipse([*P(54.5, 387.5), *P(104, 444.5)], fill=255)
    dr.ellipse([*P(213, 387.5), *P(262.5, 444.5)], fill=255)
    body = np.asarray(m.resize((w, h), Image.LANCZOS), np.float32) / 255.0
    a = body

    # rebuild: [left end 0..46] [middle from clean columns] [right end 166..220]
    left_rgb, left_a = rgb[:, 0:46], a[:, 0:46]
    right_rgb, right_a = rgb[:, 167:220], a[:, 167:220]
    clean_rgb, clean_a = rgb[:, 27:45], a[:, 27:45]              # x 77..95
    reps = 6
    mid_rgb = np.concatenate([clean_rgb] * reps, axis=1)
    mid_a = np.concatenate([clean_a] * reps, axis=1)
    # A rail is a horizontal line: averaging along x keeps it exactly and
    # removes the 18 px repeat of whatever speck the clean columns carried.
    mean_rgb = mid_rgb.mean(axis=1, keepdims=True)
    mid_rgb = np.repeat(mean_rgb, mid_rgb.shape[1], axis=1)
    mid_a = np.repeat(mid_a.mean(axis=1, keepdims=True), mid_a.shape[1], axis=1)
    rng = np.random.default_rng(11)
    mid_rgb = mid_rgb + rng.normal(0, 1.2, mid_rgb.shape).astype(np.float32)
    out_rgb = np.concatenate([left_rgb, mid_rgb, right_rgb], axis=1)
    out_a = np.concatenate([left_a, mid_a, right_a], axis=1)
    save(rgba(unmix(out_rgb, out_a, (10, 9, 10)), out_a), "plate.webp", 92)
    print(f"      plate: {out_rgb.shape[1]}x{h} ends 46 / 53")


def ribbon():
    """The gold ribbon banner with its two painted stars, lettering removed.

    selectKid 'CHOOSE YOUR KID': x 545..915, y 186..246. The letters are dark
    on tan and cover the whole body; clean body columns exist only at 597-607,
    717-723 and 855-867. The middle is rebuilt as a shuffled run of those.
    """
    box = (545, 186, 915, 247)
    rgb = crop(SK, box)
    h, w = rgb.shape[:2]
    l = blur(lum(rgb), 0.5)
    tan = ((l > 34) | warm(rgb))
    tan[:192 - box[1]] = False          # the wordmark's serifs hang into the top rows
    body = ndimage.binary_closing(tan, iterations=2)
    body = ndimage.binary_fill_holes(body)
    body = ndimage.binary_opening(body, iterations=1)
    lab, n = ndimage.label(body)
    if n > 1:                                            # the ribbon, not the flecks round it
        sizes = ndimage.sum(body, lab, range(1, n + 1))
        body = lab == (1 + int(np.argmax(sizes)))
    body = ndimage.binary_dilation(body, iterations=1)   # keep the painted dark edge
    a = blur(body.astype(np.float32), 0.6)

    x = lambda v: v - box[0]
    left = (slice(None), slice(0, x(597)))
    right = (slice(None), slice(x(868), w))
    pools = [(x(597), x(608)), (x(717), x(724)), (x(855), x(868))]

    def top_edge(c):
        col = l[:, c]
        idx = np.nonzero((col > 45) & (np.arange(h) >= 192 - box[1]))[0]
        return int(idx[0]) if len(idx) else 0
    target = round((top_edge(x(597)) + top_edge(x(867))) / 2)
    rng = np.random.default_rng(7)
    cols_rgb, cols_a = [], []
    total = 0
    while total < 240:
        p0, p1 = pools[rng.integers(0, len(pools))]
        n = int(rng.integers(3, p1 - p0 + 1))
        s = int(rng.integers(p0, p1 - n + 1))
        # the ribbon arcs (its top is 4 px higher mid-span): drop each run so its
        # top edge sits on the line the two painted ends agree on
        shift = target - top_edge(s + n // 2)
        cols_rgb.append(np.roll(rgb[:, s:s + n], shift, axis=0))
        cols_a.append(np.roll(a[:, s:s + n], shift, axis=0))
        total += n
    mid_rgb = np.concatenate(cols_rgb, axis=1)
    mid_a = np.concatenate(cols_a, axis=1)
    # One silhouette for the whole middle (the median column), and the paint
    # smoothed along the ribbon so the runs do not read as vertical bands.
    prof = np.median(mid_a, axis=1, keepdims=True)
    mid_a = np.repeat(prof, mid_a.shape[1], axis=1)
    sm = np.stack([ndimage.uniform_filter1d(mid_rgb[..., c], 17, axis=1, mode="wrap") for c in range(3)], -1)
    mid_rgb = sm * 0.8 + mid_rgb * 0.2
    out_rgb = np.concatenate([rgb[left], mid_rgb, rgb[right]], axis=1)
    out_a = np.concatenate([a[left], mid_a, a[right]], axis=1)
    out_a = np.minimum(out_a, 1.0)
    rows = np.nonzero(out_a.max(axis=1) > 0.02)[0]            # trim to the ribbon itself
    r0, r1 = int(rows[0]), int(rows[-1]) + 1
    out_rgb, out_a = out_rgb[r0:r1], out_a[r0:r1]
    save(rgba(unmix(out_rgb, out_a, (4, 3, 5)), out_a), "ribbon.webp", 92)
    print(f"      ribbon: {out_rgb.shape[1]}x{r1 - r0} ends {x(597)} / {w - x(868)}")


def button():
    """The round purple enamel button with its brass rim, glyph painted out.

    Two buttons in selectKid: back (arrow) centred ~(104, 986) and confirm
    (check) centred ~(1342.5, 985.5), rim radius ~51, enamel radius ~40. Every
    enamel pixel is rebuilt from whichever of the four candidates (each button,
    each mirrored left-right) is not glyph there.
    """
    R = 56
    S = 2 * R
    def patch(cx, cy):
        # resample so a fractional centre lands on the patch centre
        im = Image.fromarray(src(SK).astype(np.uint8))
        return np.asarray(im.transform((S, S), Image.AFFINE, (1, 0, cx - R + .5, 0, 1, cy - R + .5),
                                       resample=Image.BICUBIC), np.float32)
    ok = patch(1342.5, 985.5)
    bk = patch(104.0, 986.0)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.hypot(xx - R + .5, yy - R + .5)

    def glyph(p):
        g = warm(p) & (lum(p) > 60)
        g = ndimage.binary_dilation(g, iterations=5)
        g |= ndimage.binary_dilation((lum(p) < 17) & (d < 34), iterations=2)   # its ink outline
        return g & (d < 39)
    cands = [(ok, glyph(ok)), (ok[:, ::-1], glyph(ok)[:, ::-1]), (bk, glyph(bk)), (bk[:, ::-1], glyph(bk)[:, ::-1])]
    stack = np.stack([c for c, _ in cands], 0)
    bad = np.stack([g for _, g in cands], 0)
    w = (~bad).astype(np.float32)
    enamel = (stack * w[..., None]).sum(0) / np.maximum(w.sum(0), 1e-3)[..., None]
    # where every candidate was glyph, fall back to the row mean of clean enamel
    none = w.sum(0) < .5
    if none.any():
        for y in np.unique(np.nonzero(none)[0]):
            row = (d[y] < 38) & ~none[y]
            if row.any():
                enamel[y, none[y]] = enamel[y, row].mean(0)
    enamel = np.where((d < 38)[..., None], ndimage.gaussian_filter(enamel, (1.3, 1.3, 0)), enamel)
    rng = np.random.default_rng(3)
    enamel += rng.normal(0, 1.6, enamel.shape).astype(np.float32) * (d < 38)[..., None]
    out = np.where((d < 39.5)[..., None], enamel, ok)
    a = np.clip((R - 3.5 - d) / 1.6, 0, 1)
    save(rgba(out, a), "button.webp", 92)


def button_ornate():
    """The round button in its gold filigree, as it sits in selectKid's corners.

    The back button's left half is clean (the Kid frame and the vine overlap
    its right half), so the left half is mirrored into a symmetric setting and
    the emptied enamel button from `button()` is laid into its middle.
    """
    cx, cy = 104, 986
    HW, HH = 90, 86
    rgb = crop(SK, (cx - HW, cy - HH, cx + HW, cy + HH))
    h, w = rgb.shape[:2]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # bronze in shadow is dark but still clearly warm; the vine behind is violet
    gold = (r > 30) & (r > b * 1.12) & (g > b * .92) & (lum(rgb) > 20)
    gold = ndimage.binary_closing(gold, iterations=1)
    gold = ndimage.binary_opening(gold, iterations=1)
    near = ndimage.binary_dilation(gold, iterations=1)          # keep the ink outline
    a = blur(near.astype(np.float32), 0.6) * np.maximum(ramp(lum(rgb), 4, 24), gold)
    # symmetric: mirror the clean left half onto the right
    half = w // 2
    rgb[:, half:] = rgb[:, :half][:, ::-1][:, :w - half]
    a[:, half:] = a[:, :half][:, ::-1][:, :w - half]
    out = rgba(unmix(rgb, a, (6, 4, 8)), a)
    # the emptied button in the middle
    btn = Image.open(os.path.join(OUT, "button.webp")).convert("RGBA")
    base = Image.fromarray(out, "RGBA")
    bx, by = HW - btn.width // 2, HH - btn.height // 2 + 1
    base.alpha_composite(btn, (bx, by))
    save(np.asarray(base), "button-ornate.webp", 92)
    print(f"      button-ornate: {w}x{h}, button {btn.width}px at ({bx},{by})")


def shape_cut(name, box, shapes, out, soft=1.2, keep_lum=None):
    """Cut a prop out of the painting with hand-placed shapes (sample px)."""
    x0, y0, x1, y1 = box
    rgb = crop(name, box)
    h, w = rgb.shape[:2]
    Z = 4
    m = Image.new("L", (w * Z, h * Z), 0)
    dr = ImageDraw.Draw(m)
    for kind, pts in shapes:
        P = [((px - x0) * Z, (py - y0) * Z) for px, py in pts]
        if kind == "poly":
            dr.polygon(P, fill=255)
        elif kind == "ellipse":
            (cx, cy), (rx, ry) = P[0], (pts[1][0] * Z, pts[1][1] * Z)
            dr.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    m = np.asarray(m.resize((w, h), Image.LANCZOS), np.float32) / 255.0
    a = blur(m, soft)
    if keep_lum:
        cx, cy, r, lo, hi = keep_lum                   # a glow halo keyed on luminance
        yy, xx = np.mgrid[0:h, 0:w]
        near = np.clip(1 - np.hypot(xx - (cx - x0), yy - (cy - y0)) / r, 0, 1)
        a = np.maximum(a, ramp(lum(rgb), lo, hi) * near)
    save(rgba(unmix(rgb, a, (8, 6, 9)), a), out, 92)


def props():
    shape_cut(SK, (588, 818, 694, 982), [
        ("ellipse", [(637, 858), (8.5, 21)]),
        ("poly", [(613, 880), (626, 874), (650, 874), (662, 880), (663, 962), (614, 962)]),
        ("ellipse", [(638, 966), (46, 12.5)]),
    ], "candle.webp", soft=0.8, keep_lum=(637, 858, 40, 20, 70))
    shape_cut(SK, (298, 815, 428, 968), [
        ("ellipse", [(352, 855), (33.5, 35)]),
        ("poly", [(307, 887), (408, 882), (421, 900), (422, 966), (302, 966), (305, 900)]),
    ], "skull.webp", soft=0.8)


def periodic_noise(n, rng, beta=2.0, lo_cut=1.0):
    """Seamless 1/f^beta noise on an n x n torus, normalised to [-1, 1]."""
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    rad = np.hypot(fx, fy) * n
    amp = np.where(rad < lo_cut, 0, 1.0 / np.maximum(rad, 1e-6) ** (beta / 2))
    ph = rng.uniform(0, 2 * np.pi, (n, n))
    spec = amp * np.exp(1j * ph)
    img = np.real(np.fft.ifft2(spec))
    img -= img.mean()
    return img / (np.abs(img).max() + 1e-6)


def grain():
    """The panels' own grain as a seamless NEUTRAL tile (128 = no change).

    Used with `background-blend-mode: overlay`, so any panel colour keeps the
    painting's texture without the texture deciding the colour.
    """
    patch = crop(SK, (706, 770, 1090, 926))                  # panel 5's empty interior
    g = lum(patch)
    g = g - ndimage.gaussian_filter(g, 6)                     # high-pass: keep the grain only
    n = 256
    tile = np.zeros((n, n), np.float32)
    # quilt: random patches with soft cross-faded edges, wrapped on a torus
    rng = np.random.default_rng(5)
    acc = np.zeros((n, n), np.float32)
    wsum = np.zeros((n, n), np.float32)
    P = 96
    yy, xx = np.mgrid[0:P, 0:P]
    win = (np.sin(np.pi * (xx + .5) / P) * np.sin(np.pi * (yy + .5) / P)) ** 2
    for oy in range(0, n, P // 2):
        for ox in range(0, n, P // 2):
            sy = int(rng.integers(0, g.shape[0] - P))
            sx = int(rng.integers(0, g.shape[1] - P))
            p = g[sy:sy + P, sx:sx + P]
            ys = (np.arange(P) + oy) % n
            xs = (np.arange(P) + ox) % n
            acc[np.ix_(ys, xs)] += p * win
            wsum[np.ix_(ys, xs)] += win
    tile = acc / np.maximum(wsum, 1e-3)
    tile += periodic_noise(n, rng, beta=1.2, lo_cut=6) * 1.2
    tile = 128 + tile * 7.0
    img = np.clip(tile, 0, 255).astype(np.uint8)
    save(np.dstack([img] * 3), "grain.webp", 90)


def damask():
    """A faint half-drop damask made of the painting's own scrollwork.

    One curl of selectCompanion's purple scrollwork, keyed, mirrored into a
    symmetric motif and laid on a half-drop lattice. It is drawn at a few
    percent over the board ground: it should be felt, not read.
    """
    rgb = crop(SC, (188, 6, 296, 170))                       # a run of curls beside the candle
    l = blur(lum(rgb), 0.6)
    a = ramp(l, 22, 80)
    motif_a = np.concatenate([a, a[:, ::-1]], axis=1)       # mirror into a symmetric motif
    motif_l = np.concatenate([l, l[:, ::-1]], axis=1)
    mh, mw = motif_a.shape
    yy, xx = np.mgrid[0:mh, 0:mw]
    oval = np.clip(1.25 - np.hypot((xx - mw / 2) / (mw / 2), (yy - mh / 2) / (mh / 2)), 0, 1) ** 1.2
    motif_a = motif_a * np.clip(oval * 1.6, 0, 1)
    th, tw = int(mh * 1.62), int(mw * 1.08)
    A = np.zeros((th, tw), np.float32)
    V = np.zeros((th, tw), np.float32)
    for cy, cx in [(th * 0.25, tw * 0.5), (th * 0.75, 0), (th * 0.75, tw)]:
        for dy in (-th, 0, th):
            y0 = int(cy + dy - mh / 2)
            x0 = int(cx - mw / 2)
            ys = np.arange(mh) + y0
            xs = np.arange(mw) + x0
            yv = (ys >= 0) & (ys < th)
            xv = (xs >= 0) & (xs < tw)
            if not yv.any() or not xv.any():
                continue
            sub_a = motif_a[np.ix_(yv, xv)]
            sub_l = motif_l[np.ix_(yv, xv)]
            A[np.ix_(ys[yv], xs[xv])] = np.maximum(A[np.ix_(ys[yv], xs[xv])], sub_a)
            V[np.ix_(ys[yv], xs[xv])] = np.maximum(V[np.ix_(ys[yv], xs[xv])], sub_l)
    A = blur(A, 0.6)
    col = np.dstack([np.full_like(V, 190), np.full_like(V, 150), np.full_like(V, 220)])
    save(rgba(col, A), "damask.webp", 86)


def floor():
    """A cobbled floor in the painting's manner, tileable left to right.

    selectKid stands its mirror, its candle and its skull on dark cobbles; no
    clean run of them is wide enough to cut out, so they are laid again here:
    irregular stones (a relaxed Voronoi on a cylinder, so the strip wraps), laid
    on a ground plane that flattens towards the back, with dark mortar, a
    thread of warm light along each stone's upper edge and a shadowed lower lip.
    """
    from scipy.spatial import cKDTree
    W, H = 1024, 200
    V = 330.0                      # ground depth units covered by the strip
    GAMMA = 1.7                    # how hard the back rows flatten
    rng = np.random.default_rng(1719)

    # seeds in ground space, relaxed twice so the stones are even but not a grid
    n = int(W * V / (40 * 31))
    seeds = np.column_stack([rng.uniform(0, W, n), rng.uniform(0, V, n)])
    gx, gy = np.meshgrid(np.arange(0, W, 3.0), np.arange(0, V, 3.0))
    grid = np.column_stack([gx.ravel(), gy.ravel()])
    for _ in range(2):
        wrapped = np.vstack([seeds, seeds + [W, 0], seeds - [W, 0]])
        _, idx = cKDTree(wrapped).query(grid)
        idx = idx % n
        sx = np.zeros(n); sy = np.zeros(n); cnt = np.zeros(n)
        # circular mean in x so a stone straddling the seam stays whole
        ang = grid[:, 0] / W * 2 * np.pi
        cs = np.zeros(n); sn = np.zeros(n)
        np.add.at(cs, idx, np.cos(ang)); np.add.at(sn, idx, np.sin(ang))
        np.add.at(sy, idx, grid[:, 1]); np.add.at(cnt, idx, 1)
        ok = cnt > 0
        seeds[ok, 0] = (np.arctan2(sn[ok], cs[ok]) / (2 * np.pi) * W) % W
        seeds[ok, 1] = sy[ok] / cnt[ok]

    # screen pixel -> ground point: v = V * (y/H)^(1/GAMMA), with a little wobble
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (yy + 0.5) / H
    v = V * t ** (1.0 / GAMMA)
    wob = periodic_noise(256, rng, beta=2.6, lo_cut=2)
    wob = np.asarray(Image.fromarray(((wob + 1) * 127.5).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 127.5 - 1
    u = (xx + wob * 3.0) % W
    v = v + wob * 2.0
    pts = np.column_stack([u.ravel(), v.ravel()])
    wrapped = np.vstack([seeds, seeds + [W, 0], seeds - [W, 0]])
    d, idx = cKDTree(wrapped).query(pts, k=2)
    i1 = idx[:, 0] % n
    d1 = d[:, 0].reshape(H, W); d2 = d[:, 1].reshape(H, W)
    i1 = i1.reshape(H, W)
    near = wrapped[idx[:, 0]].reshape(H, W, 2)
    edge = (d2 - d1) * 0.5                               # ground units to the joint
    dy = (v - near[..., 1])                              # + below the stone's centre
    dxg = (u - near[..., 0])
    dist = np.maximum(d1, 1e-3)

    # ground units -> screen px, vertically, at this row
    px_per_v = (H / V) * GAMMA * np.maximum(t, 1e-3) ** (GAMMA - 1)

    stone_val = rng.normal(0, 1, n)
    stone_warm = rng.uniform(0, 1, n)
    cold = np.array([36, 30, 40], np.float32)
    warmc = np.array([50, 39, 38], np.float32)
    w_ = stone_warm[i1][..., None] * .75
    col = cold * (1 - w_) + warmc * w_
    col = col * (1 + stone_val[i1][..., None] * .09)
    # each stone domed: lighter towards its middle and its upper side
    r_est = 17.0
    dome = np.clip(1 - dist / (r_est * 1.25), 0, 1)
    col = col * (0.78 + 0.34 * dome[..., None]) * (1 - np.clip(dy / r_est, -1, 1)[..., None] * .10)

    # grain
    fine = rng.normal(0, 1, (H, W)).astype(np.float32)
    blot = periodic_noise(256, rng, beta=1.9, lo_cut=3)
    blot = np.asarray(Image.fromarray(((blot + 1) * 127.5).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 127.5 - 1
    col = col * (1 + blot[..., None] * .10) + fine[..., None] * 2.0

    # the joint, measured on screen so it thins towards the back
    e_px = edge * np.sqrt(np.clip((dy / dist) ** 2 * px_per_v ** 2 + (dxg / dist) ** 2, 0.05, 4))
    up = np.clip(-dy / dist, 0, 1)                      # upper side of a stone
    dn = np.clip(dy / dist, 0, 1)
    lit = np.clip(1 - (e_px - 1.2) / 2.4, 0, 1) * up
    lip = np.clip(1 - (e_px - 1.0) / 3.2, 0, 1) * dn
    col = col + lit[..., None] * np.array([40, 29, 18], np.float32) * (0.35 + 0.65 * t)[..., None]
    col = col * (1 - lip[..., None] * .5)
    mortar = np.clip(1.5 - e_px, 0, 1)
    col = col * (1 - mortar[..., None]) + np.array([8, 6, 10], np.float32) * mortar[..., None]

    # the back sinks into the dark
    col = col * (0.30 + 0.70 * t ** 0.85)[..., None]
    save(np.clip(col, 0, 255).astype(np.uint8), "floor.webp", 90)


def marble():
    """Marbled lavender for display type, after the MENAGERIE letters."""
    n = 256
    rng = np.random.default_rng(21)
    t = periodic_noise(n, rng, beta=3.2, lo_cut=1)           # broad, slow turbulence
    t2 = periodic_noise(n, rng, beta=2.2, lo_cut=2)          # cloudy body
    t3 = periodic_noise(n, rng, beta=1.0, lo_cut=20)         # fine grain
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    # veins: two periodic diagonal sine fields bent by the turbulence
    v1 = np.sin((xx / n * 1 + yy / n * 2) * 2 * np.pi + t * 7.0)
    v2 = np.sin((xx / n * 3 - yy / n * 1) * 2 * np.pi + t * 5.0 + t2 * 2.0)
    vein = np.clip(1 - np.abs(v1) * 9, 0, 1) ** 1.6 * .85 + np.clip(1 - np.abs(v2) * 14, 0, 1) ** 2 * .45
    base = np.clip(0.5 + 0.55 * t2, 0, 1)
    c_lo = np.array([118, 86, 168], np.float32)
    c_mid = np.array([166, 136, 214], np.float32)
    c_hi = np.array([226, 208, 246], np.float32)
    col = c_lo * (1 - base[..., None]) + c_mid * base[..., None]
    k = np.clip(vein, 0, 1)[..., None] * .75
    col = col * (1 - k) + c_hi * k
    col += t3[..., None] * 6
    speck = (rng.random((n, n)) > 0.9994).astype(np.float32)
    speck = np.clip(ndimage.gaussian_filter(speck, 0.6) * 5, 0, 1)
    col = col + speck[..., None] * (np.array([245, 228, 200], np.float32) - col)
    save(np.clip(col, 0, 255).astype(np.uint8), "marble.webp", 88)


def hall_paintings():
    """Four small paintings for the walls of a room: details of the mansion
    itself, cut from UI/mainMenu.png, to hang in the kit's gilt frames."""
    MM = "mainMenu.png"
    for name, box, size in [
        ("hall-gable.webp",  (640, 150, 1030, 618), (250, 300)),
        ("hall-tree.webp",   (0, 40, 340, 380),     (220, 220)),
        ("hall-towers.webp", (1062, 140, 1422, 572), (250, 300)),
        ("hall-roses.webp",  (1330, 641, 1630, 941), (220, 220)),
    ]:
        im = Image.open(os.path.join(UI, MM)).convert("RGB").crop(box).resize(size, Image.LANCZOS)
        save(np.asarray(im), name, 86)


def cartouche():
    """The wordmark's cartouche from UI/title.png, rebuilt to hold any title.

    The painted plaque is a baroque lens: its rails bulge and dip, so it cannot
    simply be stretched. It is cut into parts that can:

      cart-cap-l / cart-cap-r   the scrolled end: painting x 0..430, rows
                                100..700. The curled rail, the gold C-scroll,
                                the purple acanthus. Its interior (star, bats,
                                the M) is flood-filled from a seed inside the
                                rail and repainted as plate. x 430 is where both
                                rails run level, so the band continues them
                                without a kink; ornament outside the rails fades
                                out over the last 40 px. Right = left, mirrored.
      cart-band                 a level length of the same rails: the cap's
                                last 40 source columns, each aligned on the
                                seam column by correlation, then averaged. The
                                plate between them tiles every 256 px and
                                continues the cap's plate across the seam.
      cart-crest                the fleur-de-lis finial from the top of the arch.
      cart-bat / cart-star      the wordmark's own bat and eight-point star, to
                                ride inside the ends.

    Every part but the last two shares one vertical frame (painting rows
    100..700), so CSS lays them side by side at one height and the rails meet.
    """
    XC, Y0, Y1 = 430, 100, 700
    H = Y1 - Y0
    src_all = src(TT)
    rgb = crop(TT, (0, Y0, XC, Y1))
    l = blur(lum(rgb), 0.5)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    gold = (r > 52) & (r > b * 1.18) & (g > b * .95)

    # rail rows at the seam column (frame rows)
    col = gold[:, XC - 1]
    rows = np.nonzero(col)[0]
    T_top = int(rows[(rows > 85) & (rows < 125)].min())           # outer edge, top rail
    T_in = int(rows[(rows > 85) & (rows < 135)].max())            # inner edge, top rail
    B_top = int(rows[(rows > 480) & (rows < 560)].min())          # inner edge, bottom rail
    print(f"      cartouche seam rails: top {T_top}-{T_in}, bottom from {B_top}")

    # ── the interior: flood from inside the rail ──────────────────────────
    barrier = ndimage.binary_dilation(gold, iterations=2)
    lab, n = ndimage.label(~barrier)
    seed = lab[400 - Y0, 300]
    assert seed, "seed landed on the rail"
    flood = lab == seed
    wall = np.zeros_like(flood)
    wall[T_in + 3:B_top - 2, XC - 1] = True
    interior = ndimage.binary_fill_holes(flood | wall)
    for y in range(T_in + 3, B_top - 2):
        xs = np.nonzero(flood[y])[0]
        if len(xs):
            interior[y, max(int(xs[0]), 250):] = True

    # the plate: dark aubergine, mottled, darker against the rail; periodic in x
    rng = np.random.default_rng(4242)
    P = 256
    mott = periodic_noise(P, rng, beta=2.2, lo_cut=2)
    fine = periodic_noise(P, rng, beta=0.6, lo_cut=24)
    yy, xx = np.mgrid[0:H, 0:XC + P]
    mottle = mott[yy % P, xx % P]
    grain_ = fine[(yy * 2) % P, xx % P]
    base = np.array([17, 11, 21], np.float32)
    plate_full = base[None, None] * (1 + .32 * mottle[..., None]) + grain_[..., None] * 3.2
    vy = np.clip(1 - np.abs((yy - H * .52) / (H * .34)), 0, 1) ** 1.5
    plate_full += (vy * 7)[..., None] * np.array([0.9, 0.45, 1.25], np.float32)

    def shade_from_rails(dist):
        return 0.35 + 0.65 * np.clip(dist / 14.0, 0, 1) ** 0.8

    d = ndimage.distance_transform_edt(interior)
    plate = plate_full[:, :XC] * shade_from_rails(d)[..., None]

    a = np.maximum(ramp(l, 8, 40), ndimage.binary_dilation(gold, iterations=1).astype(np.float32))
    a = np.where(ndimage.binary_dilation(interior, iterations=3), 1.0, a)
    # ornament outside the rails fades out towards the seam
    keep_rows = np.zeros(H, bool)
    keep_rows[T_top - 9:T_in + 3] = True
    keep_rows[B_top - 3:B_top + 22] = True
    fade = np.clip((XC - 1 - np.arange(XC)) / 40.0, 0, 1)
    outside = ~ndimage.binary_dilation(interior, iterations=3)
    a = np.where(outside & ~keep_rows[:, None], a * fade[None, :], a)
    cap = unmix(rgb, np.maximum(a, 1e-3), (1, 1, 5))
    soft = blur(interior.astype(np.float32), 0.7)
    cap = cap * (1 - soft[..., None]) + plate * soft[..., None]
    a = np.maximum(a, soft)
    cap_rgba = rgba(cap, a)
    save(cap_rgba, "cart-cap-l.webp", 92)
    save(np.ascontiguousarray(cap_rgba[:, ::-1]), "cart-cap-r.webp", 92)

    # ── the band ─────────────────────────────────────────────────────────
    capf = cap_rgba.astype(np.float32)

    def aligned_strip(r0, r1):
        """Rows r0..r1 of the last 40 cap columns, each shifted onto the seam
        column by the lag that best correlates their luminance, averaged."""
        ref = lum(rgb[r0 - 12:r1 + 12, XC - 1])
        acc, wsum = 0, 0
        for x in range(XC - 40, XC):
            best, lag = -1e9, 0
            for s in range(-6, 7):
                prof = lum(rgb[r0 - 12 + s:r1 + 12 + s, x])
                c = float(np.dot(prof - prof.mean(), ref - ref.mean()))
                if c > best:
                    best, lag = c, s
            acc = acc + capf[r0 + lag:r1 + lag, x]
            wsum += 1
        return acc / wsum

    top_r0, top_r1 = T_top - 9, T_in + 3
    bot_r0, bot_r1 = B_top - 3, B_top + 22
    strip_t = aligned_strip(top_r0, top_r1)
    strip_b = aligned_strip(bot_r0, bot_r1)

    band = np.zeros((H, P, 4), np.float32)
    rows_ = np.arange(H, dtype=np.float32)
    dmin = np.minimum(rows_ - (T_in + 1), (B_top - 1) - rows_)
    pl = plate_full[:, XC:XC + P] * shade_from_rails(dmin)[:, None, None]
    inside = (rows_ > T_in) & (rows_ < B_top)
    band[inside, :, :3] = pl[inside]
    band[inside, :, 3] = 255
    wob = periodic_noise(P, rng, beta=1.4, lo_cut=3)[0] * 0.07 + 1.0
    for strip, row0 in ((strip_t, top_r0), (strip_b, bot_r0)):
        for k in range(strip.shape[0]):
            y = row0 + k
            if not (0 <= y < H):
                continue
            px = strip[k]
            aa = px[3] / 255.0
            if inside[y] and aa > 0.98 and lum(px[None, :3])[0] < 26:
                continue                      # plate under the rail: keep the band's own
            over = px[:3][None, :] * wob[:, None]
            under = band[y, :, :3]
            ua = band[y, :, 3] / 255.0
            out_a = aa + ua * (1 - aa)
            band[y, :, :3] = np.where(out_a[:, None] > 0,
                                      (over * aa + under * ua[:, None] * (1 - aa)) / np.maximum(out_a[:, None], 1e-3), 0)
            band[y, :, 3] = out_a * 255
    save(np.clip(band, 0, 255).astype(np.uint8), "cart-band.webp", 92)

    # ── the finial, the bat and the star ──────────────────────────────────
    cx0, cy0, cx1, cy1 = 1016, 6, 1156, 126
    crgb = crop(TT, (cx0, cy0, cx1, cy1))
    cl = blur(lum(crgb), 0.5)
    cr, cg, cb = crgb[..., 0], crgb[..., 1], crgb[..., 2]
    cgold = (cr > 45) & (cr > cb * 1.15) & (cg > cb * .9)
    ca = np.maximum(ramp(cl, 10, 44), ndimage.binary_dilation(cgold, iterations=1) * ramp(cl, 5, 20))
    ca = feather(ca, left=34, right=34, bottom=6)
    save(rgba(unmix(crgb, ca, (1, 1, 5)), ca), "cart-crest.webp", 92)

    for name, box in (("cart-bat.webp", (262, 478, 356, 558)), ("cart-star.webp", (256, 292, 328, 374))):
        prgb = crop(TT, box)
        pl_ = blur(lum(prgb), 0.5)
        core = ndimage.binary_fill_holes(ndimage.binary_closing(pl_ > 24, iterations=2))
        lab2, n2 = ndimage.label(core)
        if n2:
            sizes = ndimage.sum(core, lab2, range(1, n2 + 1))
            core = lab2 == (1 + int(np.argmax(sizes)))
        pa = np.maximum(blur(ndimage.binary_dilation(core, iterations=1).astype(np.float32), 0.6) * ramp(pl_, 6, 22),
                        blur(core.astype(np.float32), 0.5))
        out = rgba(unmix(prgb, np.maximum(pa, 1e-3), (8, 5, 12)), pa)
        save(out, name, 92)
        if name == "cart-bat.webp":
            save(np.ascontiguousarray(out[:, ::-1]), "cart-bat-r.webp", 92)


def main():
    print("kit ->", os.path.relpath(OUT, ROOT))
    hall_paintings()
    floor()
    grain()
    damask()
    marble()
    corners()
    vines()
    panel()
    medals()
    frame()
    plate()
    ribbon()
    cartouche()
    button()
    button_ornate()
    props()


if __name__ == "__main__":
    argparse.ArgumentParser(description="Prepare the shared UI kit from the sample boards.").parse_args()
    main()
