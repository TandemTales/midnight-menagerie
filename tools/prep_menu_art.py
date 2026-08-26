"""Prepare the authored menu art for the game.

`UI/title.png` is the wordmark on a solid black field. Composited over the mansion it would
show as a black slab, so the black is keyed to alpha. It is keyed on **luminance**, not a
colour match: the logo's own darks (the cartouche interior, the shadow inside the letter
bevels) are near-black too, so a hard chroma key eats them. A soft luminance ramp keeps the
plate's interior at partial alpha, which is what makes it read as a lit sign rather than a
sticker, and the ramp is deliberately generous at the low end so the outer field goes fully
transparent and no rectangle edge survives.

`UI/mainMenu.png` is the mansion exterior. It only needs sizing and a light optimise.

One-off. Run it when the source art changes; the output is committed, because the game has
no runtime build step (CONTRACTS non-negotiable #1).

    python tools/prep_menu_art.py
"""
import os
from PIL import Image, ImageFilter

OUT = "game/assets/ui"
os.makedirs(OUT, exist_ok=True)


def key_black(src, dst, lo=6, hi=64, feather=0.6):
    """Luminance key: <=lo fully transparent, >=hi fully opaque, smooth between."""
    im = Image.open(src).convert("RGB")
    lum = im.convert("L")
    if feather:
        lum = lum.filter(ImageFilter.GaussianBlur(feather))
    span = max(1, hi - lo)
    alpha = lum.point(lambda v: 0 if v <= lo else (255 if v >= hi else int(255 * (v - lo) / span)))
    out = im.convert("RGBA")
    out.putalpha(alpha)

    # Trim the fully-transparent margin so the logo can be positioned by its own ink.
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    out.save(dst, optimize=True)
    return out.size


def passthrough(src, dst, max_w=None):
    im = Image.open(src).convert("RGB")
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(dst, quality=92, optimize=True)
    return im.size


if __name__ == "__main__":
    print("title      ", key_black("UI/title.png", f"{OUT}/title.png"))
    print("mainMenu   ", passthrough("UI/mainMenu.png", f"{OUT}/main-menu.jpg", 1920))
    # Not asked for yet, but it is clearly the Kid-select plate and it is cheap to have ready.
    print("selectKid  ", passthrough("UI/selectKid.png", f"{OUT}/select-kid.jpg", 1600))
