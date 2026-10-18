"""The pieces round 36's SHOP needed and the kit did not have: Mr. Moth's
market as a STALL, not a store (docs/ui-pass/BRIEF-r36.md, fix 2).

Survey 5, both judges: the velvet behind the Tricks was "a soft vertical
purple gradient, the one place on the board that is still a CSS fill", and
the Keepsakes and Snacks panels -- which already SAY "under the glass" and
"in the jar" -- were "a plain list ... a styled web table". No sample paints a
curtain, a bell glass or a jar, so they are painted here, by the kit's own
plumbing: its aubergine velvet, its brass ramp (tools/prep_ui_materials.py),
the boards' light from the upper left.

  curtain-folds.webp   1024x640, tiles along its width: a velvet curtain hung
                       in deep, irregular folds -- each crest catching the
                       light along both shoulders the way velvet pile does,
                       the valleys falling into near-black, the cloth gathered
                       a little tighter at the top where it hangs from the
                       pole, a hem at its foot. The board lays the lamp's
                       warm light over it (shop.css); this is the cloth only.
  bell-glass.webp      160x184: a glass cloche, the kind a curiosity is kept
                       under -- a dome with a knob, the glass all but clear,
                       its edges and two streaks of window light the only
                       things painted; laid OVER the object it covers.
  jar-glass.webp       150x184: a sweet jar with a brass screw lid, the same
                       glass; laid over the sweet in it.
  glass-foot.webp      160x40: the turned walnut stand a bell or a jar stands
                       on, its brass bead catching the light; laid UNDER.

    python tools/prep_ui_stall.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, "game", "assets", "ui", "kit")

BRASS = np.array([[0x2a, 0x1a, 0x0b], [0x6b, 0x4c, 0x24], [0xb0, 0x8a, 0x4a], [0xe6, 0xc9, 0x8a], [0xfb, 0xee, 0xc8]], float)


def ramp(stops, t):
    t = np.clip(t, 0, 1) * (len(stops) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(stops) - 2)
    f = (t - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def save(arr, name, alpha=True):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr, "RGBA" if alpha else "RGB")
    path = os.path.join(KIT, name)
    im.save(path, "WEBP", quality=88, method=6, lossless=False if not alpha else False, alpha_quality=95)
    print(name, im.size, os.path.getsize(path), "bytes")


# ── the curtain ────────────────────────────────────────────────────────────
def curtain(W=1024, H=640, seed=36):
    rng = np.random.default_rng(seed)
    # irregular folds that fill the width exactly, so it tiles
    widths = rng.uniform(70, 150, 40)
    n = int(np.searchsorted(np.cumsum(widths), W)) + 1
    widths = widths[:n] * W / widths[:n].sum()
    edges = np.concatenate([[0], np.cumsum(widths)])
    y = np.arange(H)[:, None] / H
    x = np.arange(W)[None, :].astype(float)
    # the folds sway a little down their length, and gather near the top
    sway = 2.5 * np.sin(y * 4.1 + 0.7)
    xs = (x + sway) % W
    idx = np.clip(np.searchsorted(edges, xs, side="right") - 1, 0, n - 1)
    left = edges[idx]
    wid = widths[idx]
    p = (xs - left) / wid                      # 0..1 across one fold
    gather = 1 - 0.28 * np.exp(-y * 9)          # tighter at the top
    p = 0.5 + (p - 0.5) / gather
    p = np.clip(p, 0, 1)
    # each fold's own depth, so the folds are not all one
    depth = rng.uniform(0.6, 1.0, n)[idx]
    f = np.cos((p - 0.5) * np.pi)               # 1 at the crest, 0 in the valley
    # velvet: the crest itself goes a little dark (the pile faces you), its
    # two shoulders catch the light, the light from the upper left brighter
    shoulder_l = np.exp(-((p - 0.32) / 0.14) ** 2)
    shoulder_r = np.exp(-((p - 0.68) / 0.14) ** 2)
    body = 0.14 + 0.56 * f ** 1.2 * depth
    sheen = 0.26 * shoulder_l + 0.12 * shoulder_r
    valley = np.exp(-(np.minimum(p, 1 - p) / 0.1) ** 2) * depth
    v = body + sheen * (0.5 + 0.5 * f) - 0.5 * valley
    # long falls of light and dark down the cloth
    v *= 0.9 + 0.1 * np.sin(y * 3.3 + idx * 1.7)
    # the pile: fine streaks along the fall, and a slow mottle
    streak = rng.normal(0, 1, (1, W))
    streak = np.convolve(streak[0], np.ones(3) / 3, mode="same")[None, :]
    mott = rng.normal(0, 1, (H // 16 + 2, W // 16 + 2))
    mott = np.array(Image.fromarray(((mott - mott.min()) / np.ptp(mott) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), float) / 255 - .5
    grain = rng.normal(0, 1, (H, W))
    v = v * (1 + 0.05 * streak + 0.12 * mott) + 0.025 * grain
    # the hem: a turned edge at the foot, and the cloth's top in shadow
    hem = np.exp(-((y - 0.965) / 0.012) ** 2)
    v = v * (1 - 0.5 * np.exp(-((y - 0.985) / 0.02) ** 2)) + 0.22 * hem * (0.4 + 0.6 * f)
    v *= 0.62 + 0.38 * np.clip(y * 4, 0, 1)
    v = np.clip(v, 0, 1.4)
    # the house's aubergine velvet, from its near-black to a lit violet
    stops = np.array([[0x06, 0x03, 0x09], [0x18, 0x0a, 0x22], [0x30, 0x15, 0x42], [0x4c, 0x26, 0x66], [0x7c, 0x55, 0x9a]], float)
    rgb = ramp(stops, v / 1.25)
    a = np.full((H, W, 1), 255.0)
    save(np.concatenate([rgb, a], axis=2)[..., :3], "curtain-folds.webp", alpha=False)


# ── glass ──────────────────────────────────────────────────────────────────
def glass(W, H, half_width, top, bottom, lid=None, name=""):
    """Paint a surface of revolution in glass. half_width(yy) -> half width in
    px (0 outside). lid: (y0, y1, half) a brass screw lid painted opaque."""
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx = (W - 1) / 2
    out = np.zeros((H, W, 4))
    R = np.vectorize(half_width)(np.arange(H).astype(float))[:, None] * np.ones((1, W))
    inside = (np.abs(xx - cx) <= R) & (R > 0.5)
    u = np.where(inside, (xx - cx) / np.maximum(R, 1), 0)
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    fres = (1 - nz) ** 2.2
    # the glass: all but clear, its edges thick, cool and catching the room
    tint = np.array([214, 222, 255], float)
    alpha = 0.05 + 0.62 * fres
    rgb = np.ones((H, W, 3)) * tint
    # two streaks of window light down the left, one fainter on the right
    hl = np.exp(-((u + 0.56) / 0.07) ** 2) * 0.78 + np.exp(-((u + 0.38) / 0.03) ** 2) * 0.35
    hr = np.exp(-((u - 0.62) / 0.05) ** 2) * 0.32
    vfall = np.clip((yy - top) / max(bottom - top, 1), 0, 1)
    streak = (hl + hr) * (0.35 + 0.65 * np.sin(np.clip(vfall, 0, 1) * np.pi) ** .6)
    alpha = alpha + streak
    rgb = rgb * (1 - np.clip(streak, 0, 1)[..., None]) + np.array([255, 252, 240.0]) * np.clip(streak, 0, 1)[..., None]
    # the candle's warm glint low on the right shoulder
    warm = np.exp(-((u - 0.45) / 0.12) ** 2 - ((vfall - 0.78) / 0.08) ** 2) * 0.45
    rgb = rgb * (1 - warm[..., None]) + np.array([255, 196, 120.0]) * warm[..., None]
    alpha = alpha + warm
    # the outline: a thin dark line where the glass turns away
    edge = np.clip((np.abs(u) - 0.94) / 0.06, 0, 1)
    rgb = rgb * (1 - 0.55 * edge[..., None])
    alpha = alpha + 0.4 * edge
    alpha = np.where(inside, np.clip(alpha, 0, 0.92), 0)
    out[..., :3] = rgb
    out[..., 3] = alpha * 255
    if lid:
        y0, y1, hw = lid
        m = (yy >= y0) & (yy <= y1) & (np.abs(xx - cx) <= hw)
        lu = (xx - cx) / hw
        shade = 0.55 + 0.45 * np.sqrt(np.clip(1 - lu * lu, 0, 1)) - 0.25 * lu
        knurl = 0.12 * (np.sin(xx * 1.6) > 0) * ((yy > y0 + 3) & (yy < y1 - 3))
        band = np.exp(-((yy - (y0 + 1.5)) / 1.5) ** 2) * 0.35
        t = np.clip(shade - knurl + band, 0, 1.2) / 1.2
        lrgb = ramp(BRASS, 0.12 + t * 0.7)
        out[..., :3] = np.where(m[..., None], lrgb, out[..., :3])
        out[..., 3] = np.where(m, 255, out[..., 3])
    # soften the silhouette by supersampling: paint at 2x and halve
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    return im


def bell():
    S = 2
    W, H = 160 * S, 184 * S
    cx = (W - 1) / 2
    rd = 62 * S            # dome radius
    yc = 26 * S + rd       # dome centre
    yb = 176 * S           # foot
    knob_r = 9 * S

    def hw(y):
        if y < 6 * S:
            return 0
        if y < 6 * S + 2 * knob_r:      # the knob, a small ball
            d = y - (6 * S + knob_r)
            return np.sqrt(max(knob_r * knob_r - d * d, 0))
        if y < 26 * S:                  # the knob's neck
            return 4 * S
        if y < yc:
            d = yc - y
            return np.sqrt(max(rd * rd - d * d, 0))
        if y <= yb:
            return rd + (y - yc) * 0.035
        return 0
    im = glass(W, H, hw, 26 * S, yb, name="bell")
    # the rim at its foot: a band of thicker glass
    a = np.array(im, float)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    rim = (yy > yb - 6 * S) & (yy <= yb) & (a[..., 3] > 0)
    a[..., 3] = np.where(rim, np.clip(a[..., 3] + 70, 0, 235), a[..., 3])
    a[..., :3] = np.where(rim[..., None], a[..., :3] * 0.85 + np.array([230, 236, 255.0]) * 0.15, a[..., :3])
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").resize((W // S, H // S), Image.LANCZOS)
    path = os.path.join(KIT, "bell-glass.webp")
    im.save(path, "WEBP", quality=90, method=6, alpha_quality=100)
    print("bell-glass.webp", im.size, os.path.getsize(path))


def jar():
    S = 2
    W, H = 150 * S, 184 * S
    body = 60 * S
    neck = 44 * S
    y_lid0, y_lid1 = 8 * S, 30 * S
    y_neck1 = 40 * S
    y_sh1 = 62 * S
    yb = 176 * S

    def hw(y):
        if y < y_lid1:
            return 0
        if y < y_neck1:
            return neck
        if y < y_sh1:                    # the shoulder rounding out
            t = (y - y_neck1) / (y_sh1 - y_neck1)
            return neck + (body - neck) * np.sin(t * np.pi / 2)
        if y <= yb - 10 * S:
            return body
        if y <= yb:                      # the base rounding in
            t = (y - (yb - 10 * S)) / (10 * S)
            return body - 6 * S * t * t
        return 0
    im = glass(W, H, hw, y_neck1, yb, lid=(y_lid0, y_lid1 + 2 * S, neck + 4 * S), name="jar")
    im = im.resize((W // S, H // S), Image.LANCZOS)
    path = os.path.join(KIT, "jar-glass.webp")
    im.save(path, "WEBP", quality=90, method=6, alpha_quality=100)
    print("jar-glass.webp", im.size, os.path.getsize(path))


def foot():
    S = 2
    W, H = 160 * S, 40 * S
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    cx, cy = (W - 1) / 2, 14 * S
    rx, ry = 74 * S, 10 * S
    out = np.zeros((H, W, 4))
    # the top face: an ellipse of turned walnut, lit from the upper left
    e = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    top = e <= 1
    walnut = np.array([[0x1a, 0x0e, 0x08], [0x3a, 0x22, 0x14], [0x5e, 0x3a, 0x22], [0x86, 0x58, 0x34]], float)
    rng = np.random.default_rng(7)
    grain = np.sin((xx - cx) * 0.18 + np.sin(yy * 0.3) * 2) * 0.06 + rng.normal(0, .03, (H, W))
    t_top = 0.55 + 0.3 * (1 - e) - 0.25 * ((xx - cx) / rx) + grain
    # the side: the turned edge below the face, darker, its brass bead
    side = (np.abs(xx - cx) <= rx * np.sqrt(np.clip(1 - ((yy - cy - 9 * S) / ry) ** 2, 0, 1))) & (yy > cy) & (yy < cy + 9 * S + ry * 0.0 + 10 * S)
    side &= ~top
    su = (xx - cx) / rx
    t_side = 0.35 + 0.3 * np.sqrt(np.clip(1 - su * su, 0, 1)) - 0.2 * su + grain
    rgb = np.where(top[..., None], ramp(walnut, t_top), ramp(walnut, t_side))
    bead = side & (yy > cy + 2 * S) & (yy < cy + 5 * S)
    rgb = np.where(bead[..., None], ramp(BRASS, 0.45 + 0.4 * np.sqrt(np.clip(1 - su * su, 0, 1)) - 0.2 * su), rgb)
    # its rim line where the face meets the edge catches the light
    rim = top & (e > 0.86)
    rgb = np.where(rim[..., None], rgb * 0.7 + ramp(BRASS, 0.6 - 0.3 * su) * 0.3, rgb)
    a = (top | side).astype(float) * 255
    out[..., :3] = rgb
    out[..., 3] = a
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").resize((W // S, H // S), Image.LANCZOS)
    path = os.path.join(KIT, "glass-foot.webp")
    im.save(path, "WEBP", quality=90, method=6, alpha_quality=100)
    print("glass-foot.webp", im.size, os.path.getsize(path))


if __name__ == "__main__":
    curtain()
    bell()
    jar()
    foot()
