"""Turn Josh's background paintings into game assets.

    python tools/prep_backgrounds.py

Source (authored, never edited by this tool):
    animations/backgrounds/<name>.png     one painting per screen, named as in
                                          docs/art/background-prompts.md
                                          (shop.png, reward.png, event.png, ...)

Output:
    game/assets/backgrounds/<name>.webp   at most 1920 px wide, quality 86
    game/assets/backgrounds/index.json    {"available": ["shop", ...]}

The manifest is what the game reads. A room screen asks it whether its own
painting exists and only then requests the image, so a screen with no painting
yet never makes a request that 404s (which would log a console error on every
visit). Until a painting arrives the screen keeps its placeholder board: the
kit's damask ground, candle light and floor (game/src/ui/kit.css).

Run it whenever a painting is added or replaced; the output is committed,
because the game has no runtime build step.
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "animations", "backgrounds")
OUT = os.path.join(ROOT, "game", "assets", "backgrounds")
MAX_W = 1920


def main():
    os.makedirs(OUT, exist_ok=True)
    names = []
    if os.path.isdir(SRC):
        for f in sorted(os.listdir(SRC)):
            stem, ext = os.path.splitext(f)
            if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
                continue
            im = Image.open(os.path.join(SRC, f)).convert("RGB")
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            dst = os.path.join(OUT, stem.lower() + ".webp")
            im.save(dst, "WEBP", quality=86, method=6)
            names.append(stem.lower())
            print(f"  {stem.lower():24s} {im.width}x{im.height}  {os.path.getsize(dst) / 1024:.0f} KB")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"available": names}, fh, indent=1)
        fh.write("\n")
    print(f"backgrounds: {len(names)} available")


if __name__ == "__main__":
    main()
