"""Prepare the Companion Select board from UI/selectCompanion.png.

The select screen IS that painting — not a grid rebuilt out of sliced portraits.
Two images come out of here, both committed (CONTRACTS non-negotiable #1: no
runtime build step):

  game/assets/ui/menagerie-board.png   the sheet, verbatim. The lit portraits.
  game/assets/ui/menagerie-empty.png   the same sheet with all sixteen frames
                                       emptied to a dark recess: same wordmark,
                                       same candles, same cobwebs, same gold
                                       frames, nothing inside them.

The screen draws the EMPTY board as its base and lays a sprite of the REAL board
over the cells whose Companion is available. So "hidden" costs no DOM at all,
nothing about an un-freed Companion reaches the page, and the frames line up
perfectly because both images are the same painting at the same size.

Cell geometry is measured, not assumed: the gold rails are found by scanning for
warm bright pixels, and the frames in this sheet are NOT on a regular pitch
(row 0 is 258px tall, row 2 is 235px). The measured table is printed as JS at
the end for `game/src/ui/portrait.js:BOARD_CELLS`.

    python tools/prep_board.py [--check]

--check re-measures and prints the table without writing images.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import argparse
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "UI", "selectCompanion.png")
OUT = os.path.join(ROOT, "game", "assets", "ui")

NAMES = [
    ["marmalade", "wisp", "crumbula", "boggle"],
    ["bones", "pipkin", "taffy", "truffle"],
    ["hush", "mopsy", "drizzle", "pudding"],
    ["wink", "crinkle", "mossbit", "brambleboo"],
]


# ── measuring the frames ────────────────────────────────────────────────────
def warm_mask(a):
    """Where the gold rails are: bright, and red well ahead of blue."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ((r > 70) & (r > b * 1.25) & (g > b * 1.05)).astype(float)


def runs_above(profile, thr):
    out, s = [], None
    for i, v in enumerate(profile):
        if v > thr:
            if s is None:
                s = i
        elif s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(profile) - 1))
    return out


def measure(a):
    """-> ([ (x0,x1) x4 ], [ (y0,y1) x4 ]) outer edges of the gold frames."""
    w = warm_mask(a)
    h, wd = w.shape

    # Vertical rails first, using the whole grid band (everything below the
    # cartouche). Sixteen frames share four x positions, so the rails stack into
    # eight tall, unmistakable columns.
    colp = w[190:1200, :].mean(axis=0)
    vr = [r for r in runs_above(colp, 0.5) if r[0] > 5 or r[1] > 5]
    if len(vr) != 8:
        raise SystemExit(f"expected 8 vertical rails, found {len(vr)}: {vr}")
    cols = [(vr[2 * i][0], vr[2 * i + 1][1]) for i in range(4)]

    # Horizontal rails, same idea, but a rail only counts where ALL FOUR columns
    # are warm at the same y: the cartouche's underside and the two candle flames
    # live in single columns and would otherwise read as the top of row 0.
    #
    # The gold NAMEPLATES also span all four columns, so the rails are looked for
    # in windows around each expected edge rather than across the whole sheet.
    # The windows are generous (14-20px); the rail positions inside them are
    # measured, and a window that does not contain exactly one rail is an error.
    prof = np.min([w[:, x0:x1 + 1].mean(axis=1) for x0, x1 in cols], axis=0)

    def rail(lo, hi, what):
        rr = runs_above(prof[lo:hi], 0.5)
        if len(rr) != 1:
            raise SystemExit(f"{what}: expected 1 rail in y {lo}-{hi}, found "
                             f"{[(lo + a, lo + b) for a, b in rr]}")
        return lo + rr[0][0], lo + rr[0][1]

    tops = [rail(*b, f"row {i} top") for i, b in
            enumerate([(182, 200), (446, 460), (699, 712), (942, 956)])]
    bots = [rail(*b, f"row {i} bottom") for i, b in
            enumerate([(434, 446), (688, 699), (930, 942), (1190, 1212)])]
    rows = [(tops[i][0], bots[i][1]) for i in range(4)]
    return cols, rows


def interior(a, x0, y0, x1, y1):
    """The picture area inside one frame: scan inward past the gold rails."""
    w = warm_mask(a)

    def inward(vals):
        # vals: warmness scanning inward from the outer edge. The frame is one
        # or two gold rails; the bottom lip is a DOUBLE rail with a 7px shadow
        # between the two, so a short gap does not mean the picture has started.
        seen, gap, last = False, 0, 0
        for i, v in enumerate(vals):
            if v > 0.45:
                seen, gap, last = True, 0, i + 1
            elif seen:
                gap += 1
                if gap >= 9:
                    return last
        return last or 4

    # Clamped, because a picture can put warm paint right against its own frame:
    # Boggle's cell has a red curtain across the top and an unclamped scan walks
    # 16px into it, leaving a stripe of the hidden portrait showing.
    def clamp(v, hi):
        return max(1, min(int(v), hi))

    left = x0 + clamp(inward(w[y0 + 20:y1 - 20, x0:x0 + 16].mean(axis=0)), 6)
    right = x1 - clamp(inward(w[y0 + 20:y1 - 20, x1 - 15:x1 + 1].mean(axis=0)[::-1]), 6)
    top = y0 + clamp(inward(w[y0:y0 + 16, x0 + 20:x1 - 20].mean(axis=1)), 6)
    bot = y1 - clamp(inward(w[y1 - 15:y1 + 1, x0 + 20:x1 - 20].mean(axis=1)[::-1]), 13)
    return left, top, right, bot


# ── painting an empty frame ─────────────────────────────────────────────────
def cobweb(draw, w, h, rng, corner):
    """A few sagging threads in one corner. The sheet has real cobwebs in its
    own top corners; carrying a much fainter one into each empty frame is what
    stops the recess reading as a black rectangle someone pasted on."""
    R = rng.uniform(0.38, 0.56) * min(w, h) * 1.9
    spokes, rings = 6, rng.integers(3, 5)
    fx, fy = (corner & 1), (corner >> 1)          # which corner the anchor is in
    ox, oy = (w - 1) * fx, (h - 1) * fy
    sx, sy = (-1 if fx else 1), (-1 if fy else 1)

    def pt(ang, r):
        return (ox + sx * np.cos(ang) * r, oy + sy * np.sin(ang) * r)

    a = [i / (spokes - 1) * (np.pi / 2) for i in range(spokes)]
    for ang in a:
        draw.line([pt(ang, 0), pt(ang, R)], fill=(120, 108, 96, 30), width=1)
    for k in range(1, int(rings) + 1):
        r = R * (k / (rings + 0.4))
        for i in range(spokes - 1):
            p0, p1 = pt(a[i], r), pt(a[i + 1], r)
            pm = pt((a[i] + a[i + 1]) / 2, r * 0.84)
            draw.line([p0, pm, p1], fill=(126, 114, 100, 26), width=1, joint="curve")


def recess(w, h, rng):
    """A dark recess that belongs to this painting: a backing board sunk behind
    the frame, lit by nothing, with the sheet's own grain and dust over it."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / max(h - 1, 1)
    u = xx / max(w - 1, 1)

    # Base: near-black with the sheet's plum in it, warming towards the bottom
    # where the candlelight in the room would reach the back of the rebate.
    base = np.empty((h, w, 3), np.float32)
    base[..., 0] = 9.0 + 13.0 * v ** 1.6
    base[..., 1] = 7.5 + 9.5 * v ** 1.6
    base[..., 2] = 14.0 + 8.0 * v ** 1.6

    # The backing board: a hair proud of the rebate around it, its top edge
    # catching a thread of light. This is what makes it read as an empty frame
    # rather than a hole cut in the page.
    inset = max(3, int(round(min(w, h) * 0.038)))
    board = np.zeros((h, w), np.float32)
    board[inset:h - inset, inset:w - inset] = 1.0
    board = np.asarray(Image.fromarray((board * 255).astype(np.uint8))
                       .filter(ImageFilter.GaussianBlur(1.8)), np.float32) / 255.0
    base += board[..., None] * np.array([3.0, 2.4, 3.0], np.float32)
    edge = np.clip(board - np.asarray(
        Image.fromarray((board * 255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(2.6)), np.float32) / 255.0, 0, 1)
    base += edge[..., None] * np.array([30.0, 23.0, 15.0], np.float32)

    # Grain: fine dust plus low-frequency blotching, so it is never a flat fill.
    fine = rng.normal(0.0, 2.4, (h, w, 1)).astype(np.float32)
    coarse = rng.normal(0.0, 1.0, (max(2, h // 22), max(2, w // 22))).astype(np.float32)
    coarse = np.asarray(Image.fromarray(((coarse * 40) + 128).clip(0, 255).astype(np.uint8))
                        .resize((w, h), Image.BICUBIC), np.float32)
    base += fine + ((coarse - 128.0) / 40.0 * 3.4)[..., None]

    # A weak wash from the upper corner the room's candles are on, so the recess
    # has a light direction instead of being evenly dark.
    side = 1.0 if rng.random() < 0.5 else -1.0
    wash = np.clip(1.0 - np.hypot((u - (0.5 + 0.42 * side)) * 1.15, (v + 0.16) * 1.35), 0, 1) ** 2.2
    base += wash[..., None] * np.array([9.0, 7.0, 6.0], np.float32)

    # Inner shadow: the frame sits proud of the recess and shadows it, hardest
    # along the top lip.
    d = np.minimum.reduce([xx, yy, (w - 1) - xx, (h - 1) - yy]).astype(np.float32)
    fall = np.clip(d / (min(w, h) * 0.22), 0, 1) ** 0.8
    top_extra = np.clip(yy / (h * 0.17), 0, 1) ** 0.9
    base *= (0.20 + 0.80 * fall)[..., None]
    base *= (0.58 + 0.42 * top_extra)[..., None]

    out = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    veil = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cobweb(ImageDraw.Draw(veil), w, h, rng, int(rng.integers(0, 4)))
    out.alpha_composite(veil.filter(ImageFilter.GaussianBlur(0.6)))
    return out.convert("RGB")


def rebate_mask(w, h, radius=9, pad=1.3):
    """Where the recess is allowed to paint.

    Square corners would eat the frame's 45-degree chamfer — the little bright
    corner cut that every one of these frames has — and an emptied frame would
    then have visibly blunter corners than a filled one. Rounding the mask to
    the chamfer keeps them identical. The blur softens the last pixel at the
    rails so half a pixel of measurement error never shows as a bright sliver.
    """
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1],
                                        radius=min(radius, w // 3, h // 3), fill=255)
    return m.filter(ImageFilter.GaussianBlur(pad))


def main(check=False):
    im = Image.open(SHEET).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    cols, rows = measure(a)

    cells = {}
    for r in range(4):
        for c in range(4):
            x0, x1 = cols[c]
            y0, y1 = rows[r]
            cells[NAMES[r][c]] = (x0, y0, x1, y1, interior(a, x0, y0, x1, y1))

    print(f"sheet {im.width}x{im.height}")
    for r in range(4):
        line = []
        for c in range(4):
            x0, y0, x1, y1, ins = cells[NAMES[r][c]]
            line.append(f"{NAMES[r][c]:11s} {x0:4d},{y0:4d} {x1 - x0 + 1:3d}x{y1 - y0 + 1:3d}"
                        f" in{tuple(int(v) for v in (ins[0] - x0, ins[1] - y0, x1 - ins[2], y1 - ins[3]))}")
        print("  " + " | ".join(line))

    if check:
        emit_js(im, cells)
        return

    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, "menagerie-board.png"), optimize=True)

    empty = im.copy()
    for i, (slug, (x0, y0, x1, y1, ins)) in enumerate(cells.items()):
        ix0, iy0, ix1, iy1 = ins
        w, h = ix1 - ix0 + 1, iy1 - iy0 + 1
        rng = np.random.default_rng(0xB0A2D + i * 977)
        empty.paste(recess(w, h, rng), (ix0, iy0), rebate_mask(w, h))
    empty.save(os.path.join(OUT, "menagerie-empty.png"), optimize=True)

    for f in ("menagerie-board.png", "menagerie-empty.png"):
        p = os.path.join(OUT, f)
        print(f"wrote {os.path.relpath(p, ROOT)}  {os.path.getsize(p) / 1024:.0f} KB")
    emit_js(im, cells)


BLEED = 4   # px of black gutter carried on every side, see emit_js


def emit_js(im, cells):
    """The table to paste into game/src/ui/portrait.js — fractions, not pixels,
    so the board can be drawn at any size.

    Each rect is the measured gold frame grown by BLEED px. The grown rect is
    still narrower than the 9-11px gutters, so no two cells overlap, and the
    margin is black in BOTH images — which means a hovered frame can lift and
    scale without ever showing a cut edge.
    """
    W, H = im.width, im.height
    print("\n/* generated by tools/prep_board.py */")
    print("export const BOARD_CELLS = {")
    for slug, (x0, y0, x1, y1, _ins) in cells.items():
        x, y = x0 - BLEED, y0 - BLEED
        w, h = (x1 - x0 + 1) + BLEED * 2, (y1 - y0 + 1) + BLEED * 2
        print(f"  {slug}: [{x / W:.5f}, {y / H:.5f}, {w / W:.5f}, {h / H:.5f}],")
    print("};")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    main(**vars(ap.parse_args()))
