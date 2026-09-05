"""Turn the authored sprite sheets and stills in `animations/` into game assets.

    python tools/prep_sprites.py            # everything
    python tools/prep_sprites.py --report   # measure only, write nothing

Source (authored, never edited by this tool):
    animations/SS_<slug>_<clip>.png   a grid of animation frames
    animations/sprites/sprite_<name>.png   one still per Companion and Kid

Output:
    game/assets/sprites/<slug>/<clip>.webp  one atlas per clip
    game/assets/sprites/<slug>/index.json   clips, frame rects, anchor, fps, fade
    game/assets/sprites/stills/<name>.webp  repaired stills
    game/assets/sprites/index.json          the manifest the runtime discovers

─────────────────────────────────────────────────────────────────────────────
WHY THIS FILE IS LONGER THAN "SLICE A GRID AND SAVE THE CELLS"

Four things in the source art are wrong in ways that are invisible in a file
browser and glaring at 60fps on a dark background. Each one is measured here
rather than assumed, because three of the four were the opposite of what the
file's appearance suggested.

1.  THE GRID IS NOT SQUARE AND NOT ALWAYS FULL. Every sheet is nine columns.
    The row count varies, cells are usually NOT square (462x360 for affection,
    624x624 for idle), and `attack` is nine-by-eight with only two frames in
    its last row -- 65 frames, not 81. Assuming 9x9 square cells shreds four of
    the nine clips. Rows are recovered by autocorrelating the alpha row
    profile, then every cell is tested for content and the empty tail dropped.

2.  THE MATTE IS CONTAMINATED, AND NOT THE SAME WAY IN EVERY FILE. Measured by
    how colour moves as alpha falls:

      the sheets      saturation collapses 0.47 -> 0.09 toward a neutral grey.
                      They were flattened against a background and cut back
                      out, so every soft edge carries that grey. `attack` is
                      the same defect against WHITE.
      most stills     RGB scales with alpha and hue is preserved: premultiplied
                      (identical, arithmetically, to being flattened on black).
      a few stills    RGB is flat across alpha: already clean, and running a
                      repair on them would only damage them.

    All three are the same equation, S = a*F + (1-a)*B, with a different B, so
    all three invert with one formula once B is known. B is fitted per file by
    weighted least squares against the nearest opaque colour. `CLEAN` files get
    B = None and are passed through untouched -- this classification is the
    whole reason the repair is safe to run over every file.

3.  THE CREATURE IS A CONSTANT SIZE IN PIXELS, NOT A CONSTANT FRACTION OF ITS
    CELL. Content height is 323-380px in every clip while the cell it sits in
    ranges 360-624. Normalising per cell -- the obvious reading -- would make
    the creature change size every time the clip changed. One global scale,
    keyed to absolute source pixels, is the correct transform, and `attack`
    stays legitimately larger because that is a lunge.

4.  THE FRAMES JITTER. Frame-to-frame content centres wander +-4px (idle) to
    +-21px (caution). Some of that is animation and some is the generator not
    placing the subject identically twice; at speed the second kind reads as
    the sprite boiling. The centre track is low-passed and each frame shifted
    onto the smoothed track, which removes the shake and leaves deliberate,
    low-frequency movement alone.

A fifth step is prophylactic rather than corrective: transparent pixels get
their colour flooded from the nearest opaque neighbour (`_edge_extend`). Their
alpha is zero so they are invisible, but a bilinear tap or a mipmap blends
their RGB in anyway, which is where "I removed the halo and it came back when I
scaled it down" comes from.
"""

import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None

SRC_SHEETS = "animations"
SRC_STILLS = "animations/sprites"
OUT = "game/assets/sprites"

# The creature's height in output pixels. Source medians sit at ~330px, so this
# is a ~2.6x downscale: enough for a Companion drawn at 60-80 CSS px on a 2x
# display, which is the size of the slot in `ui/enemy.js`'s hero rig.
TARGET_CONTENT_H = 128

# THE BACKGROUND IS NOT TRANSPARENT. The production brief asks every clip for
# "a truly transparent alpha background" and the sheets do not have one: `idle`
# is only 7.4% at alpha 0 and carries 43.6% of its pixels at alpha 8-10, a flat
# wash across the entire sheet. `hurt` has it too, the rest faintly.
#
# A threshold alone cannot remove it without eating the soft edge -- Marmalade
# is a spectral cat and its fur genuinely lives at low alpha -- so the wash is
# taken out in two moves: a floor just above the wash level, then a connected
# component filter that keeps only what still touches the solid body. The wash
# is a field and the fur is attached, which is the difference that survives
# both when a threshold alone does not.
ALPHA_FLOOR = 12
SOLID_ALPHA = 96          # "definitely the creature", the seed for the filter

# Frames are packed nine to a row, matching how the sheets are authored, which
# keeps every atlas well inside a 2048px texture limit.
ATLAS_COLS = 9

# THE OTHER WAY A GENERATOR HANDS BACK A BAD EDGE. `classify` below catches art
# FLATTENED against a background: the edge colour is dragged toward that
# background as alpha falls, and the model S = a*F + (1-a)*B inverts it.
#
# `SS_bones_idle` is the other shape. Its alpha was cut by LUMINANCE, not
# composited, so there is no B to solve for and the sheet reads CLEAN -- while
# carrying a bright ring around every silhouette that is near-constant
# [248,228,200] from alpha 0.2 all the way to 0.995, plus one more pixel of it
# at FULL alpha. Measured on the rim (opaque, within 1px of the boundary)
# against the core (opaque, deeper than 3px): bones lifts +65 luma, and all
# twelve marmalade sheets sit at -12 to -18, because a normally shaded edge is
# DARKER than the body it belongs to. 25 sits in the middle of that gap.
#
# The repair is subtractive on purpose. Recolouring the ring from the nearest
# opaque pixel fails twice over: that pixel is itself the bright rim, and where
# it is not, it is linework, so the halo comes back dark and thin detail bleeds
# outward. The ring is EXTRA PIXELS -- taking them off and rebuilding the soft
# edge behind them leaves every interior pixel untouched.
HALO_LIFT = 25.0          # rim-minus-core luma that means "there is a ring"
HALO_BITE = 1.6           # px of silhouette the ring occupies
HALO_SOFT = 1.3           # px of new soft edge rebuilt behind it

# WebP at q92 is 2.6x smaller than optimised PNG here (3.06MB -> 1.16MB for one
# atlas) and `tools/devserver.py` already serves the type. `alpha_quality=100`
# is not optional: libwebp will happily lossy-compress the alpha channel, and
# the whole point of everything above this line is the alpha channel.
ATLAS_FORMAT = "webp"
WEBP_QUALITY = 92
WEBP_METHOD = 4           # 6 is marginally smaller and ~20x slower to encode


def save_image(img, path_noext):
    """Write one atlas or still, and return the filename the runtime should ask
    for. The extension is data in index.json rather than a constant in the JS."""
    if ATLAS_FORMAT == "webp":
        p = path_noext + ".webp"
        img.save(p, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, alpha_quality=100)
    else:
        p = path_noext + ".png"
        img.save(p, optimize=True)
    return os.path.basename(p)

# ── the dissolve fade ───────────────────────────────────────────────────────
# Marmalade's Spectral Phase defocuses in the middle -- he shuts his eyes around
# frame 18, goes soft through 28-46, and sharpens again by 62 -- but he never
# loses opacity, so the "dissolve into a ghostlike translucent form" the brief
# asks for reads as the sprite simply going blurry.
#
# The fade is therefore applied over the top, and its TIMING is measured rather
# than typed: per-frame focus (the variance of the Laplacian inside the body)
# traces a clean U across exactly those frames, so the envelope is derived from
# it and lands on the blur by construction. That also means it generalises --
# every other Companion's dissolve clip (Hush's Shadow Phase, Boggle's Hide and
# Emerge, Taffy's Split) gets the same treatment from the same measurement with
# nothing to re-tune.
#
# Only the DEPTH is authored, because how ghostly a clip should go is a look and
# not a measurement. Measured dip (min/max focus) separates the two kinds of
# clip cleanly: spectral 0.27 and zoomies 0.39 against 0.51+ for all ten others,
# so nothing else in the set trips this.
DIP_THRESHOLD = 0.45
FADE_FLOOR = {
    "spectral": 0.10,   # nearly gone: this one is a disappearance
    "zoomies": 0.42,    # a speed blur, not a vanishing act
}
FADE_FLOOR_DEFAULT = 0.35

# How hard the jitter filter pulls. 1.0 would weld every frame to the smoothed
# track and kill real motion with it; 0 would disable the step. 0.75 removes
# the shake in the idle loop while leaving the lunge in `attack` intact.
STABILISE = 0.75
SMOOTH_WIN = 5          # frames in the moving average of the centre track

# The eight universal clips of `MM animation prompts.docx` plus `caution`,
# which the sheets carry and the brief does not name. `loop` and `hold` come
# straight out of the brief rather than from taste:
#
#   idle       "The first and final frames must connect seamlessly."  Measured:
#              the 80->0 step is 2.22 against a 3.58 mean, so it does.
#   ready      "beginning in a relaxed neutral pose and ending in the
#              Companion's standard combat idle pose" -- a one-shot INTO idle,
#              not a loop, which is what this table said before reading it.
#   defeat     "The final frame should be a stable defeated pose and should not
#              return to idle."  Hence `hold`.
#   the rest   "Return precisely to the normal idle position", so they end and
#              hand back to idle.
#
# Rates are chosen so each clip lasts about as long as the beat it serves: ~81
# frames is a lot, and a hit reaction the brief calls "fast" cannot spend three
# seconds on it. They live in index.json so retiming is a data edit.
CLIPS = {
    "idle":      {"loop": True,  "fps": 20},
    "caution":   {"loop": True,  "fps": 20},
    "ready":     {"loop": False, "fps": 40},
    "attack":    {"loop": False, "fps": 60},
    "trick":     {"loop": False, "fps": 48},
    "hurt":      {"loop": False, "fps": 60},
    "celebrate": {"loop": False, "fps": 30},
    "affection": {"loop": False, "fps": 30},
    "defeat":    {"loop": False, "fps": 24, "hold": True},

    # Marmalade's three mechanic clips (brief, PART 2). Every one of them ends
    # back at the battlefield anchor, so they behave like the transients above.
    "spectral":  {"loop": False, "fps": 60},   # "extremely quick"
    "zoomies":   {"loop": False, "fps": 60},   # "very fast playful sprint"
    "spark":     {"loop": False, "fps": 36},
}


# ── the matte ───────────────────────────────────────────────────────────────

def clean_alpha(a):
    """Delete the background wash, keep the soft edge. `a` is 0..1, returns 0..1.

    Runs BEFORE classification, not after, and that ordering is the whole point:
    the wash is 43.6% of the `idle` sheet and it is background-coloured, so
    leaving it in the sample made the classifier read `idle` as premultiplied
    and four genuinely contaminated sheets as clean. It was measuring the wash.
    """
    a = np.where(a * 255.0 < ALPHA_FLOOR, 0.0, a)
    if not (a > 0).any():
        return a
    # THE SEED HAS TO ADAPT, because one clip is deliberately not solid.
    # Marmalade's Spectral Phase "dissolves into a ghostlike translucent form",
    # so its middle frames peak well below the fixed 96 this used to demand. A
    # fixed seed finds nothing solid there, and every wisp the artist drew gets
    # classed as detached wash and deleted -- the filter would eat exactly the
    # frames the clip exists for. Seeding off the frame's own peak keeps the
    # behaviour identical on an opaque frame (peak 255 -> 0.6*255 > 96) and
    # sane on a translucent one.
    peak = float(a.max()) * 255.0
    solid = (a * 255.0) >= min(SOLID_ALPHA, 0.6 * peak)
    if not solid.any():
        return a
    lab, n = ndi.label(a > 0)
    if n == 0:
        return a
    keep = np.zeros(n + 1, bool)
    keep[np.unique(lab[solid])] = True
    keep[0] = False
    return np.where(keep[lab], a, 0.0)


def _nearest_opaque(rgb, a):
    """For every pixel, the colour of the nearest confidently-opaque pixel."""
    op = a >= 0.98
    if op.sum() < 50:
        return None, None
    dist, idx = ndi.distance_transform_edt(~op, return_distances=True, return_indices=True)
    return rgb[idx[0], idx[1]], dist


def halo_lift(rgb, a):
    """How much brighter the opaque RIM is than the opaque CORE, in luma.

    Positive and large means a bright ring was painted around the silhouette.
    Negative is the normal case: an edge in shadow. Returns 0.0 when there is
    not enough of either band to ask the question.
    """
    op = a >= 0.995
    if op.sum() < 500:
        return 0.0
    d = ndi.distance_transform_edt(op)
    rim = op & (d > 0) & (d <= 1.01)
    core = op & (d > 3.0)
    if rim.sum() < 200 or core.sum() < 200:
        return 0.0
    lum = rgb.mean(axis=2)
    return float(lum[rim].mean() - lum[core].mean())


def dehalo(a):
    """Take the painted ring off one cell's alpha and rebuild the soft edge.

    Two defects, one cause -- a luminance key run over art drawn on white:

      pinholes  the key also punched through the art's own bright highlights,
                leaving speckle enclosed by the body. 80 of bones' 81 frames
                carry some; they are tiny (largest blob 7px) and sit at alpha
                0.2-0.5, which is exactly what a partially-keyed highlight
                looks like and nothing like a real gap. Anything the body
                completely encloses is body.

      the ring  everything within HALO_BITE of the old boundary goes, and a
                new HALO_SOFT edge is ramped in behind it. Note the distance is
                measured from EVERY non-solid pixel, interior gaps included, so
                a skeleton's see-through spaces keep their own clean edges.
    """
    solid = a > 0.5
    if not solid.any():
        return a
    a = np.where(ndi.binary_fill_holes(solid) & ~solid, 1.0, a)
    d = ndi.distance_transform_edt(a > 0.5)
    return np.clip((d - HALO_BITE) / HALO_SOFT, 0.0, 1.0)


def classify(rgb, a):
    """Return (kind, B). `kind` in CLEAN | PREMULT | CONTAM; B is the colour the
    art was flattened against, or None to leave the file alone.

    The discriminator is what happens to SATURATION as alpha falls. Flattening
    against a neutral background drags edge colour toward that neutral and
    saturation collapses with it. Premultiplying scales all three channels by
    the same alpha, so hue and saturation survive untouched -- which is why
    saturation separates contamination from the other two, and the magnitude of
    the scaling then separates premultiplied from clean.
    """
    F, dist = _nearest_opaque(rgb, a)
    if F is None:
        return "CLEAN", None

    # MEASURE AT THE EDGE, NOT OVER THE SHEET. Contamination is a property of
    # the boundary, and sampling the whole image instead let two things ruin the
    # reading: the background wash where any of it survives the floor still
    # connected to the body, and 80 other frames' worth of it. Restricting every
    # band to pixels within a few px of solid art is both what the question
    # actually asks and what makes the answer stable -- it moved five sheets
    # from CLEAN to CONTAM and matches the per-frame profile exactly.
    near = dist <= 8.0
    lo = near & (a >= 0.05) & (a <= 0.30)
    hi = near & (a >= 0.98)
    if lo.sum() < 40 or hi.sum() < 200:
        return "CLEAN", None

    c_lo, c_hi = rgb[lo].mean(axis=0), rgb[hi].mean(axis=0)

    def sat(c):
        return (c.max() - c.min()) / max(1.0, c.max())

    satdrop = (sat(c_lo) + 1e-6) / (sat(c_hi) + 1e-6)
    scale = (c_lo.mean() + 1e-6) / (c_hi.mean() + 1e-6)
    expect_premult = a[lo].mean()

    if satdrop < 0.55:
        kind = "CONTAM"
    elif scale < expect_premult * 2.2:
        kind = "PREMULT"
    else:
        return "CLEAN", None

    if kind == "PREMULT":
        return kind, np.zeros(3)

    # Weighted least squares for B in  S = a*F + (1-a)*B.  Weighting by (1-a)
    # is not a preference, it is the algebra: the equation carries information
    # about B in proportion to (1-a), so the low-alpha pixels that actually saw
    # the background dominate, and near-opaque pixels contribute ~nothing.
    m = (a > 0.02) & (a < 0.6) & (dist <= 6.0)
    if m.sum() < 40:
        return "CLEAN", None
    al = a[m][:, None]
    w = (1.0 - al)
    num = (w * (rgb[m] - al * F[m])).sum(axis=0)
    den = (w * w).sum(axis=0)
    B = num / np.maximum(1e-6, den)
    return kind, np.clip(B, 0, 255)


def repair(rgb, a, B):
    """Undo the flatten. `rgb` is 0..255, `a` is already cleaned 0..1."""
    rgb = rgb.copy()
    if B is not None:
        # F = (S - (1-a)B) / a, the inverse of the flatten. Only evaluated where
        # there is enough alpha to divide by; below that the division amplifies
        # whatever noise the generator left, so those pixels take the nearest
        # opaque colour instead and keep their own alpha.
        safe = a > 0.25
        F = np.empty_like(rgb)
        aa = np.maximum(a, 1e-6)[:, :, None]
        F[safe] = ((rgb - (1.0 - aa) * B[None, None, :]) / aa)[safe]
        near, _ = _nearest_opaque(rgb, a)
        if near is None:
            near = rgb
        F[~safe] = near[~safe]
        rgb = np.clip(F, 0, 255)

    return rgb


def _edge_extend(rgb, a, iters=6):
    """Flood opaque colour into transparent pixels.

    Invisible on its own -- alpha is still zero -- but every bilinear sample and
    every mipmap level averages the RGB of transparent pixels into visible ones.
    Left as black, that is a dark rim that appears only once the sprite is
    scaled, which is exactly when it is hardest to attribute.
    """
    known = a > 0.0
    if not known.any() or known.all():
        return rgb
    # One distance transform rather than N dilation passes: it fills every
    # transparent pixel with its nearest known colour in a single call, which is
    # both a better answer than an iterated neighbour average and the difference
    # between a seven-minute build and a one-minute one.
    idx = ndi.distance_transform_edt(~known, return_distances=False, return_indices=True)
    return rgb[idx[0], idx[1]]


# ── the grid ────────────────────────────────────────────────────────────────

def detect_rows(a_full):
    """Rows in the sheet, from the period of the cleaned alpha row profile.

    Counting bands of non-empty rows does not work: subjects in adjacent rows
    nearly touch, so `attack` reports a single band across its whole height.
    Autocorrelation asks the different question -- what vertical distance does
    this image repeat at -- which the gaps cannot defeat.
    """
    H = a_full.shape[0]
    p = (a_full > 0).astype(np.float64).sum(axis=1)
    s = p - p.mean()
    ac = np.correlate(s, s, "full")[len(s) - 1:]
    if ac[0] <= 0:
        return 9
    ac = ac / ac[0]
    lo, hi = max(2, H // 14), max(3, H // 2)
    k = lo + int(np.argmax(ac[lo:hi]))
    return max(1, int(round(H / k)))


def cells(rgb, a_raw, cols, rows):
    """Yield (rgb, cleaned alpha) for every cell that has art in it.

    Cleaning happens per cell, not once over the sheet, so the adaptive seed in
    `clean_alpha` sees each frame's own peak alpha instead of the most opaque
    frame on the sheet.
    """
    H, W = a_raw.shape
    cw, ch = W // cols, H // rows
    for r in range(rows):
        for c in range(cols):
            y0, y1, x0, x1 = r * ch, (r + 1) * ch, c * cw, (c + 1) * cw
            a = clean_alpha(a_raw[y0:y1, x0:x1])
            if (a > 0).mean() <= 0.004:
                continue          # empty tail of the last row
            yield rgb[y0:y1, x0:x1], a


def bbox(a):
    ys, xs = np.where(a > 0)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


# ── clips ───────────────────────────────────────────────────────────────────

def build_clip(path, cols=ATLAS_COLS):
    """Slice, repair and measure one sheet. Returns frames plus their geometry,
    still in SOURCE pixels -- scaling waits until every clip has been measured,
    because the scale has to be shared across all of them."""
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    rgb_full = arr[:, :, :3].astype(np.float64)
    raw_a = arr[:, :, 3].astype(np.float64) / 255.0
    a_full = clean_alpha(raw_a)
    washed = float((raw_a > 0).sum() - (a_full > 0).sum()) / raw_a.size

    rows = detect_rows(a_full)
    kind, B = classify(rgb_full, a_full)
    lift = halo_lift(rgb_full, a_full)
    haloed = lift > HALO_LIFT

    frames = [(repair(r, a, B), dehalo(a) if haloed else a)
              for r, a in cells(rgb_full, raw_a, cols, rows)]

    boxes = [bbox(a) for _, a in frames]
    keep = [(f, b) for f, b in zip(frames, boxes) if b is not None]
    frames = [f for f, _ in keep]
    boxes = [b for _, b in keep]

    centres = np.array([[(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0] for b in boxes])
    heights = np.array([b[3] - b[1] for b in boxes])
    return {
        "path": path, "rows": rows, "kind": kind,
        "lift": lift, "haloed": haloed,
        "B": None if B is None else [round(float(x), 1) for x in B],
        "frames": frames, "boxes": boxes, "centres": centres,
        "median_h": float(np.median(heights)),
        "cell": (im.width // cols, im.height // rows),
        "washed": washed,
    }


def frame_focus(frame_rgba):
    """Focus of one FINAL atlas frame: variance of the Laplacian over the body.

    Measured on the output frame, not the source cell. Cells differ in size from
    360px to 624px across the clips of one Companion, and Laplacian variance
    scales with resolution, so measuring at source made the twelve clips
    incomparable and put `caution` under the dissolve threshold on nothing but
    its cell size. Body-only because the empty background would swamp the
    variance with zeros.
    """
    a = frame_rgba[:, :, 3].astype(np.float64) / 255.0
    m = a > 0.5
    if m.sum() < 50:
        return 0.0
    lum = (frame_rgba[:, :, :3].astype(np.float64) * a[:, :, None]).mean(axis=2)
    return float(ndi.laplace(lum)[m].var())


def fade_envelope(focus, floor):
    """Per-frame opacity from the focus track, or None if the clip never blurs.

    `t` is thresholded well inside the range rather than stretched across it, so
    only the genuinely defocused frames fade: a straight rescale would start
    dimming the sprite the moment it left peak sharpness, which is most of the
    clip and reads as a flicker rather than a dissolve.
    """
    mn, mx = float(focus.min()), float(focus.max())
    if mx <= 0 or (mn / mx) >= DIP_THRESHOLD:
        return None
    # A DISSOLVE DIPS IN THE MIDDLE. A clip whose softest frame is its first or
    # last has not defocused, it has ended on a soft pose, and fading that would
    # dim the handover to idle. Requiring the trough inside the clip is what
    # separates the two, and it is why `caution` -- softest at frame 0 -- is not
    # a dissolve.
    lowest = int(np.argmin(focus))
    if not (0.15 * len(focus) <= lowest <= 0.85 * len(focus)):
        return None
    norm = (focus - mn) / (mx - mn)
    lo, hi = 0.15, 0.55
    t = np.clip((norm - lo) / (hi - lo), 0.0, 1.0)
    t = t * t * (3.0 - 2.0 * t)                      # smoothstep
    return [round(float(v), 3) for v in (floor + (1.0 - floor) * t)]


def stabilise(centres):
    """Per-frame correction that puts each frame on a low-passed centre track.

    A moving average keeps deliberate motion (which is low frequency -- a lunge
    is a arc over many frames) and discards the frame-to-frame shake the
    generator introduced (which is high frequency by definition).
    """
    n = len(centres)
    if n < 3 or STABILISE <= 0:
        return np.zeros_like(centres)
    w = min(SMOOTH_WIN, n if n % 2 else n - 1)
    pad = w // 2
    padded = np.pad(centres, ((pad, pad), (0, 0)), mode="edge")
    kern = np.ones(w) / w
    smooth = np.stack([np.convolve(padded[:, i], kern, mode="valid") for i in range(2)], axis=1)
    return (smooth - centres) * STABILISE


def render_clip(clip, scale, out_noext, name=""):
    """Crop every frame to the clip's shared box, scale, pack, save.

    A SHARED box rather than a per-frame trim is what keeps the animation
    steady: trimming each frame to its own content and drawing them all at the
    same origin re-introduces exactly the wander this tool just removed.
    """
    frames, boxes = clip["frames"], clip["boxes"]
    shift = stabilise(clip["centres"])

    # The union of every frame's box, after its stabilising shift, is the
    # smallest window that never clips the subject.
    xs0 = [b[0] + shift[i][0] for i, b in enumerate(boxes)]
    ys0 = [b[1] + shift[i][1] for i, b in enumerate(boxes)]
    xs1 = [b[2] + shift[i][0] for i, b in enumerate(boxes)]
    ys1 = [b[3] + shift[i][1] for i, b in enumerate(boxes)]
    pad = 2
    ux0, uy0 = int(np.floor(min(xs0))) - pad, int(np.floor(min(ys0))) - pad
    ux1, uy1 = int(np.ceil(max(xs1))) + pad, int(np.ceil(max(ys1))) + pad
    uw, uh = ux1 - ux0, uy1 - uy0

    fw, fh = max(1, int(round(uw * scale))), max(1, int(round(uh * scale)))
    n = len(frames)
    acols = min(ATLAS_COLS, n)
    arows = (n + acols - 1) // acols
    atlas = Image.new("RGBA", (acols * fw, arows * fh), (0, 0, 0, 0))
    focus = []

    for i, (rgb, a) in enumerate(frames):
        rgb = _edge_extend(rgb, a)
        h, w = a.shape
        canvas_rgb = np.zeros((uh, uw, 3), np.float64)
        canvas_a = np.zeros((uh, uw), np.float64)
        # Integer placement plus a subpixel remainder; the remainder is applied
        # by shifting the alpha and colour together so the correction does not
        # smear one against the other.
        dx, dy = shift[i]
        ox, oy = int(round(-ux0 + dx)), int(round(-uy0 + dy))
        sx0, sy0 = max(0, -ox), max(0, -oy)
        dx0, dy0 = max(0, ox), max(0, oy)
        cw = min(w - sx0, uw - dx0)
        chh = min(h - sy0, uh - dy0)
        if cw <= 0 or chh <= 0:
            focus.append(0.0)
            continue
        canvas_rgb[dy0:dy0 + chh, dx0:dx0 + cw] = rgb[sy0:sy0 + chh, sx0:sx0 + cw]
        canvas_a[dy0:dy0 + chh, dx0:dx0 + cw] = a[sy0:sy0 + chh, sx0:sx0 + cw]

        # Resample colour PREMULTIPLIED, then undo it. Resampling straight
        # colour lets fully transparent pixels vote on visible ones with their
        # own weight, which is the same dark rim `_edge_extend` guards against
        # arriving by a different road.
        pm = canvas_rgb * canvas_a[:, :, None]
        merged = np.dstack([pm, canvas_a * 255.0]).astype(np.float32)
        small = np.array(Image.fromarray(merged.astype(np.uint8), "RGBA")
                         .resize((fw, fh), Image.LANCZOS)).astype(np.float64)
        sa = np.clip(small[:, :, 3], 0, 255)
        srgb = np.where(sa[:, :, None] > 0.5,
                        small[:, :, :3] / np.maximum(sa, 1e-6)[:, :, None] * 255.0, 0.0)
        out = np.dstack([np.clip(srgb, 0, 255), sa]).astype(np.uint8)
        focus.append(frame_focus(out))
        atlas.paste(Image.fromarray(out, "RGBA"), ((i % acols) * fw, (i // acols) * fh))

    fname = save_image(atlas, out_noext)

    # The anchor is where the subject's feet sit inside the frame: median centre
    # in x, median bottom in y. Clips are aligned to each other by this point,
    # so switching from idle to attack does not make the creature hop.
    med_cx = float(np.median([(b[0] + b[2]) / 2.0 + shift[i][0] for i, b in enumerate(boxes)]))
    med_by = float(np.median([b[3] + shift[i][1] for i, b in enumerate(boxes)]))

    focus = np.array(focus)
    fade = fade_envelope(focus, FADE_FLOOR.get(name, FADE_FLOOR_DEFAULT))

    meta = {
        "file": fname, "frames": n, "cols": acols, "rows": arows, "fw": fw, "fh": fh,
        "anchor": [round((med_cx - ux0) * scale, 2), round((med_by - uy0) * scale, 2)],
        "source": os.path.basename(clip["path"]),
        "matte": clip["kind"], "bg": clip["B"], "grid": [ATLAS_COLS, clip["rows"]],
        # THE SOURCE MEASUREMENT, CARRIED FORWARD. The built atlas cannot answer
        # whether the ring was there: LANCZOS at 0.63 plus the premultiply round
        # trip leaves a dehaloed and a haloed bones within 0.1 luma of each other
        # (+20.8 vs +20.7, measured). The sheets are far too large to commit, so
        # the only place this fact can live is here, next to the atlas it made.
        "lift": round(clip["lift"], 1), "dehalo": bool(clip["haloed"]),
        "dip": round(float(focus.min() / max(1e-6, focus.max())), 3),
    }
    if fade:
        meta["fade"] = fade
    return meta


# ── stills ──────────────────────────────────────────────────────────────────

def build_still(path, out_noext, target_h=256):
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    rgb0 = arr[:, :, :3].astype(np.float64)
    a = clean_alpha(arr[:, :, 3].astype(np.float64) / 255.0)
    kind, B = classify(rgb0, a)
    rgb = repair(rgb0, a, B)
    if halo_lift(rgb0, a) > HALO_LIFT:
        a = dehalo(a)
    box = bbox(a)
    if box is None:
        return None
    rgb = _edge_extend(rgb, a)
    x0, y0, x1, y1 = box
    rgb, a = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
    h, w = a.shape
    s = min(1.0, target_h / float(h))
    fw, fh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    pm = np.dstack([rgb * a[:, :, None], a * 255.0]).astype(np.uint8)
    small = np.array(Image.fromarray(pm, "RGBA").resize((fw, fh), Image.LANCZOS)).astype(np.float64)
    sa = np.clip(small[:, :, 3], 0, 255)
    srgb = np.where(sa[:, :, None] > 0.5,
                    small[:, :, :3] / np.maximum(sa, 1e-6)[:, :, None] * 255.0, 0.0)
    fname = save_image(
        Image.fromarray(np.dstack([np.clip(srgb, 0, 255), sa]).astype(np.uint8), "RGBA"), out_noext)
    return {"file": fname, "w": fw, "h": fh, "matte": kind, "bg": None if B is None else [round(float(v), 1) for v in B]}


# ── driver ──────────────────────────────────────────────────────────────────

def slug_of_still(fn):
    """`sprite_countCrumbula.png` -> `countCrumbula`."""
    return re.sub(r"^sprite_", "", os.path.splitext(os.path.basename(fn))[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="measure only, write nothing")
    args = ap.parse_args()

    sheets = sorted(f for f in os.listdir(SRC_SHEETS) if f.startswith("SS_") and f.endswith(".png"))
    by_slug = {}
    for fn in sheets:
        m = re.match(r"SS_([A-Za-z0-9]+)_([A-Za-z0-9]+)\.png$", fn)
        if not m:
            print("  skip (unparsed name):", fn)
            continue
        by_slug.setdefault(m.group(1), {})[m.group(2)] = os.path.join(SRC_SHEETS, fn)

    manifest = {"animated": {}, "stills": {}, "targetContentH": TARGET_CONTENT_H}

    for slug, clips in sorted(by_slug.items()):
        built = {name: build_clip(p) for name, p in sorted(clips.items())}

        # ONE scale for every clip of this Companion. See note 3 at the top: the
        # subject is a constant size in pixels, so the reference is the median
        # content height across all clips, not anything per-cell.
        ref = float(np.median([c["median_h"] for c in built.values()]))
        scale = TARGET_CONTENT_H / ref

        print("\n%s: %d clips, median content %.0fpx -> scale %.3f" % (slug, len(built), ref, scale))
        outdir = os.path.join(OUT, slug)
        if not args.report:
            os.makedirs(outdir, exist_ok=True)

        entry = {"clips": {}, "scale": round(scale, 4)}
        for name, clip in built.items():
            cfg = CLIPS.get(name, {"loop": False, "fps": 24})
            print("   %-10s %dx%-2d cell %-9s %-7s wash %5.1f%%  bg=%-20s lift %+5.1f%s frames %d" % (
                name, ATLAS_COLS, clip["rows"], "%dx%d" % clip["cell"], clip["kind"],
                100 * clip["washed"], str(clip["B"]), clip["lift"],
                " DEHALO" if clip["haloed"] else "       ", len(clip["frames"])))
            if args.report:
                continue
            meta = render_clip(clip, scale, os.path.join(outdir, name), name)
            meta.update(loop=cfg["loop"], fps=cfg["fps"], hold=bool(cfg.get("hold")))
            entry["clips"][name] = meta
            if "fade" in meta:
                f = meta["fade"]
                lowest = min(range(len(f)), key=lambda i: f[i])
                print("              ^ dissolve: dip %.2f, fade floor %.2f at frame %d"
                      % (meta["dip"], f[lowest], lowest))

        if not args.report:
            json.dump(entry, open(os.path.join(outdir, "index.json"), "w"), indent=1)
            manifest["animated"][slug] = sorted(entry["clips"].keys())

    stills = sorted(f for f in os.listdir(SRC_STILLS) if f.endswith(".png"))
    if not args.report:
        os.makedirs(os.path.join(OUT, "stills"), exist_ok=True)
    print("\nstills:")
    counts = {}
    for fn in stills:
        name = slug_of_still(fn)
        src = os.path.join(SRC_STILLS, fn)
        if args.report:
            arr = np.array(Image.open(src).convert("RGBA"))
            kind, B = classify(arr[:, :, :3].astype(np.float64),
                               clean_alpha(arr[:, :, 3].astype(np.float64) / 255.0))
            counts[kind] = counts.get(kind, 0) + 1
            print("   %-18s %-7s bg=%s" % (name, kind, "-" if B is None else np.round(B, 1)))
            continue
        meta = build_still(src, os.path.join(OUT, "stills", name))
        if meta:
            counts[meta["matte"]] = counts.get(meta["matte"], 0) + 1
            manifest["stills"][name] = meta
            print("   %-18s %-7s %dx%d" % (name, meta["matte"], meta["w"], meta["h"]))

    print("\nmatte classes:", ", ".join("%s=%d" % kv for kv in sorted(counts.items())))
    if not args.report:
        json.dump(manifest, open(os.path.join(OUT, "index.json"), "w"), indent=1)
        print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
