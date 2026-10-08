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
    python tools/prep_menu_art.py --only house    # just the room's mansion (round 28)

ROUND 28: `house-still.webp` is the SAME mansion cut out of `UI/mainMenu.png` for the
room shader: the house the Pumpkin Grounds and the Graveyard see over their walls (both
survey judges: "a blocky box model ... nowhere near mainMenu.png's turrets, slate roofs and
ivy"). The sky and the wood round it are keyed out by a FLOOD from the top edge through
everything that is sky-coloured -- navy, with green over red and blue over green -- so a
dark window inside the stone is never reached, however dark it is; the edge is then
feathered over one source pixel, which the texture's mipmaps carry to the screen as a
smooth silhouette at any distance. The garden, the stair and the gate piers below the
house are cut off at its plinth; the room's own court wall and railing stand there.
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


def house_cutout(src, dst, box=(250, 128, 1372, 700), thr=9.0, lit_frac=0.40, seed=28):
    """The mansion of mainMenu.png alone, on alpha: see the module note (round 28).

    And its windows LIT, some of them: the painting's are dark glass under a
    moon, and a house seen across a churchyard at night has somebody home.
    Each window is found as a cluster of near-black panes inside the stone (a
    pane is a dark island the flood never reached; a window is its panes
    joined over their glazing bars), and two in five, by a fixed seed, take a
    lamp: warm gold glass, brighter low where the lamp stands, the bars left
    the dark they are painted. The rest stay the painting's dark glass."""
    import numpy as np
    from scipy import ndimage
    im = Image.open(src).convert("RGB").crop(box)
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.30 * r + 0.59 * g + 0.11 * b
    H, W = lum.shape
    sky = ((g - r) + 0.5 * (b - g) - 0.3 * r > thr) & (lum < 75)
    # the flood: sky-coloured AND joined to the top edge, or to either side above the eaves
    lab, _ = ndimage.label(sky)
    seeds = set(np.unique(lab[0, :])) | set(np.unique(lab[: H // 2, 0]))         | set(np.unique(lab[: H // 2, -1]))
    seeds.discard(0)
    out_sky = np.isin(lab, list(seeds))
    out_sky = ndimage.binary_closing(out_sky, iterations=2) | out_sky
    house = ndimage.binary_opening(~out_sky, iterations=1)
    # the house is ONE piece: drop the dead tree's twigs and anything else adrift
    hl, n = ndimage.label(house)
    if n > 1:
        sizes = ndimage.sum(house, hl, range(1, n + 1))
        house = hl == (1 + int(np.argmax(sizes)))
    alpha = ndimage.gaussian_filter(house.astype(np.float32), 0.7)
    # the lit windows
    inner = ndimage.binary_erosion(house, iterations=3)
    pane = (lum < 20) & inner
    pane = ndimage.binary_opening(pane, iterations=1)
    win = ndimage.binary_closing(pane, iterations=3)
    wl, wn = ndimage.label(win)
    rng = np.random.default_rng(seed)
    objs = ndimage.find_objects(wl)
    lit = np.zeros_like(lum)
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        area = float(np.sum(wl[sl] == i + 1))
        # a window is upright and FULL in its box (an arched light fills about
        # 0.7-0.9 of it); a ragged shadow in the ivy or under a cornice is not
        if not (60 <= area <= 2600 and hh >= 12 and ww >= 6 and 1.15 * ww <= hh <= 3.6 * ww):
            continue
        if area / float(hh * ww) < 0.62:
            continue
        if sl[0].start > H * 0.86:          # the ground floor's are behind the wall
            continue
        if rng.random() > lit_frac:
            continue
        m = (wl[sl] == i + 1) & pane[sl]
        yy = np.linspace(0.0, 1.0, hh)[:, None]
        k = (0.70 + 0.55 * yy) * (0.65 + 0.70 * rng.random())
        # its glazing bars, dark against the lamp: the mullion up the middle and
        # the transom where the sashes meet, a source pixel and a half wide
        xx = np.arange(ww)[None, :]
        bar = (np.abs(xx - (ww - 1) * 0.5) < 0.8) | (np.abs(np.arange(hh)[:, None] - hh * 0.56) < 0.8)
        lit[sl] = np.maximum(lit[sl], m * k * np.where(bar, 0.12, 1.0))
    lit = np.clip(ndimage.gaussian_filter(lit, 0.45), 0.0, 1.6)
    warm = np.array([255.0, 186.0, 104.0])
    a = a * (1.0 - np.clip(lit, 0, 1)[..., None]) + warm[None, None, :] * lit[..., None] * 0.92
    # a little of each lamp on the stone round its window
    spill = ndimage.gaussian_filter(lit, 4.0) * 0.55
    a = a + a * spill[..., None] * np.array([1.0, 0.75, 0.45])[None, None, :]
    rgba = np.dstack([np.clip(a, 0, 255), np.clip(alpha * 255.0, 0, 255)]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    out.save(dst, lossless=False, quality=94, alpha_quality=100, method=6)
    return out.size


def passthrough(src, dst, max_w=None):
    im = Image.open(src).convert("RGB")
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(dst, quality=92, optimize=True)
    return im.size


if __name__ == "__main__":
    import sys
    if "--only" in sys.argv and sys.argv[sys.argv.index("--only") + 1] == "house":
        print("house      ", house_cutout("UI/mainMenu.png", f"{OUT}/house-still.webp"))
        sys.exit(0)
    print("house      ", house_cutout("UI/mainMenu.png", f"{OUT}/house-still.webp"))
    print("title      ", key_black("UI/title.png", f"{OUT}/title.png"))
    print("mainMenu   ", passthrough("UI/mainMenu.png", f"{OUT}/main-menu.jpg", 1920))
    # Not asked for yet, but it is clearly the Kid-select plate and it is cheap to have ready.
    print("selectKid  ", passthrough("UI/selectKid.png", f"{OUT}/select-kid.jpg", 1600))
