"""The tier metals for round 12's CHROME pass: the achievement toast's plaque.

An achievement has a tier -- bronze, silver or gold -- and the tier is the one
thing a player should read at a glance. The kit only ever cast its fittings in
one metal, the samples' antique brass. So the toast's plaque and its medal are
the kit's OWN paintings, re-cast: every gilt pixel of the piece is found on the
brass ramp the kit was painted with (tools/prep_ui_materials.py's BRASS), by
its brightness, and given the colour at the same place on a silver or a bronze
ramp. The enamel, the shadows, the ink and the alpha are left exactly as they
were, so the plaque keeps its bevels, its notched ends and its lit field, and
only the metal changes.

The two ramps stay in the samples' palette: silver is the cold of the boards'
moonlight (--kit-moon's blue in its shadows), bronze a darker, redder brass,
never a new hue family.

  chrome-plate-silver.webp   plate-lit.webp (the Companion tiles' nameplate,
  chrome-plate-bronze.webp   207x72, slices 12 53 12 46) with its rim re-cast
  chrome-medal-silver.webp   rosette.webp (the kit's gold star medal, 96 px)
  chrome-medal-bronze.webp   re-cast whole

Gold needs no copy: it IS plate-lit.webp and rosette.webp.

    python tools/prep_chrome.py
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, "game", "assets", "ui", "kit")

# the kit's brass ramp (tools/prep_ui_materials.py), shadow to highlight
BRASS = [(0.0, "#1e1206"), (0.22, "#4a3113"), (0.42, "#7d5a2a"), (0.62, "#b08a4a"),
         (0.8, "#d8b775"), (0.93, "#efd79c"), (1.0, "#fbeec6")]
# the same steps of light, in the other two metals
METALS = {
    # cold: moonlight in the shadows, a pale pewter body, near-white where lit
    "silver": [(0.0, "#101117"), (0.22, "#2f313c"), (0.42, "#5d6070"), (0.62, "#9b9eb0"),
               (0.8, "#c9ccda"), (0.93, "#e6e8f2"), (1.0, "#fbfbff")],
    # a darker, redder brass: the same family as the gold, one step toward copper
    "bronze": [(0.0, "#190b04"), (0.22, "#3f1f0c"), (0.42, "#6c3a1b"), (0.62, "#a0633a"),
               (0.8, "#c98d5d"), (0.93, "#e4b285"), (1.0, "#f6d8b8")],
}


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def ramp(t, stops):
    ts = np.array([s for s, _ in stops], np.float32)
    cs = np.stack([hexc(c) for _, c in stops])
    t = np.clip(t, 0, 1)
    return np.stack([np.interp(t, ts, cs[:, i]) for i in range(3)], -1)


def place_on_brass(rgb):
    """Where each pixel sits on the brass ramp, from its brightness (0-1)."""
    ts = np.array([s for s, _ in BRASS], np.float32)
    ls = np.array([lum(hexc(c)) for _, c in BRASS], np.float32)   # rises with t
    return np.interp(lum(rgb), ls, ts)


def goldness(rgb):
    """How much of a pixel is the gilt: warm hue, some saturation, some light.
    Violet enamel, black ink and the grey of a shadow all score zero."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.max(rgb, -1)
    mn = np.min(rgb, -1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # hue in degrees
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    warm = np.clip(1 - np.abs(h - 40) / 32, 0, 1)                   # 8..72 degrees
    warm = np.where((h > 200), 0, warm)                             # violet stays violet
    s_ok = np.clip((sat - 0.12) / 0.2, 0, 1)
    v_ok = np.clip((mx - 18) / 30, 0, 1)
    return warm * s_ok * v_ok


def recast(src, metal):
    im = Image.open(os.path.join(KIT, src)).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:]
    t = place_on_brass(rgb)
    cast = ramp(t, METALS[metal])
    k = goldness(rgb)[..., None]
    out = rgb * (1 - k) + cast * k
    return np.concatenate([np.clip(out, 0, 255), alpha], -1).astype(np.uint8)


def save(arr, name):
    path = os.path.join(KIT, name)
    im = Image.fromarray(arr, "RGBA")
    # lossless: these are small, 9-sliced, and a lossy edge would ring on the rim
    im.save(path, "WEBP", lossless=True, method=6, exact=False)
    print(f"  {name:28s} {im.width:4d}x{im.height:<4d} {os.path.getsize(path) / 1024:6.1f} KB")


def main():
    for metal in ("silver", "bronze"):
        save(recast("plate-lit.webp", metal), f"chrome-plate-{metal}.webp")
        save(recast("rosette.webp", metal), f"chrome-medal-{metal}.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
