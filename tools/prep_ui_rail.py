"""Render the star-capped shelf rail the Reward's rarity plates stand on.

Round 3's judges asked for PEARL's rail (ui/r3-polish-c, tools/prep_ui_fittings.py
there): "the rarity plates stand on a star-capped shelf rail with inset panels".
This is that rail's generator, ported unchanged onto this tree's material
plumbing (tools/prep_ui_materials.py) and written under a name of its own, so
the Shop's and Game Over's egg-and-dart ledge (ledge.webp) keeps its look:

  rail-panels.webp    a carved and gilded rail seen from just above, for a
                      3-slice with 64 px ends: a walnut top lit along its front
                      lip, a round gilt bead, an apron of recessed panels in
                      beaded gilt mouldings with a gilt boss where two meet, a
                      square dark block at each end capped with a gilt star
                      rosette, a cove into the dark and the shadow it throws.
                      640x96

    python tools/prep_ui_rail.py
"""
import os
import sys

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_ui_materials as M  # noqa: E402  (the materials' plumbing)

OUT = M.OUT
ramp, hexc, smooth, noise = M.ramp, M.hexc, M.smooth, M.noise
normals, lambert, brass, down, save = M.normals, M.lambert, M.brass, M.down, M.save
periodic_noise, moulding, walnut = M.periodic_noise, M.moulding, M.walnut


# ── the star-capped rail ────────────────────────────────────────────────────────
def rail_panels():
    """A carved and gilded ledge seen from just above, 640x96 drawn 3x, for a
    3-slice: the middle tiles every 128 px of frieze, and each 64 px end is a
    square dark block with a gilt rosette boss where the carving stops. Top to
    bottom: the walnut top (lost at the back, lit along its front lip), a round
    gilt bead catching the candles, an apron of recessed panels in beaded gilt
    mouldings between two small beads, a cove into the dark underside, and the
    shadow the ledge throws."""
    rng = np.random.default_rng(3101)
    W, H, ss = 640, 96, 3
    END = 64
    SW, SH = W * ss, H * ss
    yy = (np.arange(SH, dtype=np.float32)[:, None] + .5) / ss * np.ones((1, SW), np.float32)
    xx = (np.arange(SW, dtype=np.float32)[None, :] + .5) / ss * np.ones((SH, 1), np.float32)
    TOP0, TOP1 = 3.0, 21.0         # the top face, back edge to front lip
    BEAD1 = 29.0                   # the gilt bead, the lit top edge
    AP0, AP1 = 30.5, 55.0          # the carved apron
    UND1 = 60.0                    # the cove under it
    col = np.zeros((SH, SW, 3), np.float32)
    alpha = np.zeros((SH, SW), np.float32)
    hgt = np.zeros((SH, SW), np.float32)
    gilt = np.zeros((SH, SW), bool)
    ends = (xx < END) | (xx >= W - END)

    wood_top = walnut(SH, SW, rng, base="#3a2519", light="#5e3f2a", dark="#1a100a", period=int(128 * 2 * ss))
    wood_front = walnut(SH, SW, rng, base="#3a2517", light="#5c3d26", dark="#160d07", period=int(128 * 2 * ss))
    top = (yy >= TOP0) & (yy < TOP1)
    t = np.clip((yy - TOP0) / (TOP1 - TOP0), 0, 1)
    col = np.where(top[..., None], wood_top * (0.28 + 0.78 * t ** 1.6)[..., None], col)
    lip = np.exp(-((yy - (TOP1 - 2.2)) / 1.7) ** 2) * top
    col = col + lip[..., None] * np.array([130, 92, 50], np.float32)

    bead = (yy >= TOP1) & (yy < BEAD1)
    tb = np.clip((yy - TOP1) / (BEAD1 - TOP1), 0, 1)
    hgt = np.where(bead, np.sqrt(np.clip(1 - (2 * tb - 1) ** 2, 0, 1)) * 6.0, hgt)
    gilt |= bead

    apron = (yy >= BEAD1) & (yy < UND1)
    # two small beads framing the gadroons
    for b0, b1 in ((AP0, AP0 + 3.2), (AP1 - 3.2, AP1)):
        m = (yy >= b0) & (yy < b1)
        tt = np.clip((yy - b0) / (b1 - b0), 0, 1)
        hgt = np.where(m, np.sqrt(np.clip(1 - (2 * tt - 1) ** 2, 0, 1)) * 2.2, hgt)
        gilt |= m & ~ends
    # the frieze: long recessed panels, each in a beaded gilt moulding, and a
    # small gilt boss where two panels meet (one panel every 128 px, so the
    # middle slice tiles and no stretch of it reads as a hatch)
    g0, g1 = AP0 + 5.0, AP1 - 5.0
    PAN = 128.0
    px_ = (xx - END) % PAN
    band = (yy >= g0) & (yy < g1) & ~ends
    pan_x0, pan_x1 = 11.0, PAN - 11.0
    dxp = np.minimum(px_ - pan_x0, pan_x1 - px_)
    dyp = np.minimum(yy - g0, g1 - yy)
    dpan = np.minimum(dxp, dyp)
    inpan = band & (dxp >= 0)
    RIM = 2.8
    rim = inpan & (dpan < RIM)
    rp = np.clip(dpan / RIM, 0, 1)
    hgt = np.where(rim, 1.2 + np.sqrt(np.clip(1 - (2 * rp - 1) ** 2, 0, 1)) * 2.0, hgt)
    field = inpan & (dpan >= RIM)
    hgt = np.where(field, -0.6 - 0.8 * smooth(RIM, 7.0, dpan), hgt)
    gilt |= rim
    lobe = np.zeros_like(hgt)
    bcx = np.where(px_ < PAN / 2, px_, px_ - PAN)
    rb = np.hypot(bcx, yy - (g0 + g1) / 2)
    # (drawn into the end slices too: a boss straddles every slice boundary,
    # so the halves meet whole however the middle is repeated)
    boss = (yy >= g0) & (yy < g1) & (rb < 5.2)
    hgt = np.where(boss, 1.0 + np.sqrt(np.clip(1 - (rb / 5.2) ** 2, 0, 1)) * 3.0, hgt)
    gilt |= boss
    # the end blocks: a dark panel with a gilt rosette boss
    for cx in (END / 2, W - END / 2):
        cy = (AP0 + AP1) / 2
        r = np.hypot(xx - cx, yy - cy)
        a = np.arctan2(yy - cy, xx - cx)
        R = 10.5
        petals = R * (0.78 + 0.22 * np.cos(a * 8))
        boss = r < petals
        dome = np.sqrt(np.clip(1 - (r / np.maximum(petals, 1e-3)) ** 2, 0, 1)) * 3.0
        eye = np.sqrt(np.clip(1 - (r / 3.6) ** 2, 0, 1)) * 2.2
        hgt = np.where(boss, dome + eye, hgt)
        gilt |= boss
        frame = (np.abs(np.maximum(np.abs(xx - cx) - 22, np.abs(yy - cy) - 10.5)) < 1.0) & apron
        hgt = np.where(frame, 1.4, hgt)
        gilt |= frame
    under = (yy >= AP1) & (yy < UND1)
    tu = np.clip((yy - AP1) / (UND1 - AP1), 0, 1)
    hgt = np.where(under & ~gilt, -tu * 2.0, hgt)

    n = normals(ndimage.gaussian_filter(hgt * ss, ss * 0.45), 1.1)
    lam = lambert(n)
    # the apron is lit from above by the candles on the ledge: warm under the
    # bead, falling away towards the cove
    ta = np.clip((yy - AP0) / (AP1 - AP0), 0, 1)
    fall = (1.08 - 0.42 * ta ** 1.3)[..., None]
    col = np.where(apron[..., None], wood_front * (0.36 + 0.9 * lam[..., None]) * fall, col)
    col = np.where(under[..., None], col * (1 - 0.7 * tu)[..., None], col)
    metal = brass(n, wear=noise((SH, SW), rng, ss * 1.4), lift=-0.04)
    # the bead is the lit top edge: warmer where it turns up to the candles
    up = np.clip(-np.gradient(ndimage.gaussian_filter(hgt, ss * 0.5), axis=0) * 0.9, 0, 1)
    metal = metal + (up * bead)[..., None] * np.array([54, 40, 18], np.float32)
    # the panels' fields sink into shadow under their mouldings
    # the panels' fields sink under their mouldings: the top of each field in
    # the moulding's shadow, its foot catching light off the bead below
    dtop = yy - (g0 + RIM)
    dbot = (g1 - RIM) - yy
    shade = 0.62 + 0.3 * smooth(0.0, 5.0, dtop) + 0.12 * np.exp(-(dbot / 1.6) ** 2)
    col = np.where(field[..., None], col * (shade * (0.8 + 0.2 * smooth(RIM, 9.0, dpan)))[..., None], col)
    col = np.where(gilt[..., None], metal, col)
    alpha = np.where(top | bead | apron, 1.0, alpha)
    for ey, wdt in ((TOP1 + .15, .6), (BEAD1 + .4, .8), (UND1 - .3, .7)):
        m = (np.abs(yy - ey) < wdt) & (alpha > 0)
        col = np.where(m[..., None], col * 0.2, col)
    back = yy < TOP0
    alpha = np.where(back, smooth(TOP0 - 3, TOP0, yy) * 0.5, alpha)
    col = np.where(back[..., None], np.array([6, 3, 7], np.float32), col)
    sh = yy >= UND1
    ts = np.clip((yy - UND1) / (H - UND1), 0, 1)
    alpha = np.where(sh, (1 - ts) ** 1.6 * 0.88, alpha)
    col = np.where(sh[..., None], np.array([4, 2, 5], np.float32), col)
    col = col + noise((SH, SW), rng, 0.7)[..., None] * 3
    save(np.dstack([down(col, ss), down(alpha, ss) * 255]), "rail-panels.webp", 90)


if __name__ == "__main__":
    print("rail ->", os.path.relpath(OUT, M.ROOT))
    rail_panels()
