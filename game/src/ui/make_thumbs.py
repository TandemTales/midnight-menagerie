"""Generate downscaled companion portrait variants.

The sliced portraits in game/assets/portraits/ are 828x516. The select grid shows
them in ~205x128 slots; pushing 828px art into that slot costs bandwidth and makes
the browser resample 16 large bitmaps every layout. This writes properly downscaled
LANCZOS variants into game/assets/portraits/thumbs/.

    python game/src/ui/make_thumbs.py

Outputs per slug:
    thumbs/<slug>@1x.png   240 x 150   (grid tile, DPR 1)
    thumbs/<slug>@2x.png   480 x 299   (grid tile, DPR 2)
    thumbs/<slug>-card.png 560 x 349   (hero panel / roster / gameover)

OWNER: frontend agent.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  python -m pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(ROOT, "game", "assets", "portraits")
OUT = os.path.join(SRC, "thumbs")

SIZES = [("@1x", 240), ("@2x", 480), ("-card", 560)]


def main():
    os.makedirs(OUT, exist_ok=True)
    made = 0
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".png"):
            continue
        slug = name[:-4]
        src = os.path.join(SRC, name)
        with Image.open(src) as im:
            im = im.convert("RGB")
            w0, h0 = im.size
            for suffix, w in SIZES:
                h = round(w * h0 / w0)
                dst = os.path.join(OUT, f"{slug}{suffix}.png")
                im.resize((w, h), Image.LANCZOS).save(dst, optimize=True)
                made += 1
        print(f"  {slug}: {w0}x{h0} -> " + ", ".join(f"{w}px" for _, w in SIZES))
    print(f"wrote {made} files into {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
