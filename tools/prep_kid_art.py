"""Bring the authored Kid art and the new Companion portraits into the game.

The art directory now carries, for each of the eight Kids, a full portrait (1086x1448) and a
small thumbnail, plus thirteen Companion portraits that did not exist when the game was
scaffolded. Everything here is a copy-and-size step; nothing is generated.

Naming in `art/` is inconsistent (`portrait_` vs `profile_`, camelCase slugs) and one file is
missing, so the mapping is explicit rather than globbed — a silent miss here would put the
wrong child's face on a MISSING poster.

One-off. Run when the source art changes; output is committed, because the game has no runtime
build step (CONTRACTS non-negotiable #1).

    python tools/prep_kid_art.py
"""
import os
import sys
from PIL import Image

OUT_KID = "game/assets/kids"
OUT_PAL = "game/assets/portraits"
os.makedirs(OUT_KID, exist_ok=True)
os.makedirs(OUT_PAL, exist_ok=True)

# slug -> (portrait source, thumbnail source or None)
KIDS = {
    "maya":   ("art/portrait_mayaChen.png",     "art/thumbnail_mayaChen.png"),
    "mateo":  ("art/portrait_mateoAlvarez.png", "art/thumbnail_mateoAlvarez.png"),
    "amina":  ("art/profile_aminaOkafor.png",   "art/thumbnail_aminaOkafor.png"),
    "eli":    ("art/portrait_EliRosen.png",     "art/thumbnail_EliRosen.png"),
    "priya":  ("art/profile_priyaShah.png",     "art/thumbnail_priyaShah.png"),
    "jordan": ("art/profile_jordanBrooks.png",  "art/thumbnail_jordanBrooks.png"),
    "lena":   ("art/profile_lenaYazzie.png",    None),   # no thumbnail supplied
    "samir":  ("art/profile_samirHaddad.png",   "art/thumbnail_samirHaddad.png"),
}

# Companion portraits that arrived after the game was scaffolded. `moss` is Mossbit.
PALS = {
    "boggle": "art/portrait_boggle.png",       "bones": "art/portrait_bones.png",
    "brambleboo": "art/portrait_brambleboo.png", "crinkle": "art/portrait_crinkle.png",
    "drizzle": "art/portrait_drizzle.png",     "hush": "art/portrait_hush.png",
    "mopsy": "art/portrait_mopsy.png",         "mossbit": "art/portrait_moss.png",
    "pipkin": "art/portrait_pipkin.png",       "pudding": "art/portrait_pudding.png",
    "taffy": "art/portrait_taffy.png",         "truffle": "art/portrait_truffle.png",
    "wink": "art/portrait_wink.png",
}

PORTRAIT_W = 720     # plenty for a full-height dossier panel
THUMB_W = 192
PAL_W, PAL_H = 828, 516   # the aspect the sheet-sliced portraits already use        # 150px source upscaled a little; served at 96 CSS px on 2x


def save(im, path, quality=90):
    if path.endswith(".jpg"):
        im.convert("RGB").save(path, quality=quality, optimize=True, progressive=True)
    else:
        im.save(path, optimize=True)
    return os.path.getsize(path) // 1024


def main():
    missing = []
    for slug, (portrait, thumb) in KIDS.items():
        if not os.path.exists(portrait):
            missing.append(portrait); continue
        im = Image.open(portrait).convert("RGB")
        im.thumbnail((PORTRAIT_W, PORTRAIT_W * 4), Image.LANCZOS)
        kb = save(im, f"{OUT_KID}/{slug}.jpg")
        line = "%-8s portrait %4dx%-4d %3dKB" % (slug, im.width, im.height, kb)

        if thumb and os.path.exists(thumb):
            t = Image.open(thumb).convert("RGB")
            # Sources are 150x150 or ~233x185 — square-crop to a common shape so the roster
            # does not have two different tile aspects in one row.
            side = min(t.width, t.height)
            t = t.crop(((t.width - side) // 2, (t.height - side) // 2,
                        (t.width + side) // 2, (t.height + side) // 2))
            t = t.resize((THUMB_W, THUMB_W), Image.LANCZOS)
            line += "   thumb %3dKB" % save(t, f"{OUT_KID}/{slug}-thumb.jpg", 88)
        else:
            # No thumbnail supplied: derive one from the portrait's head, so every Kid has a
            # tile rather than one falling back to a silhouette.
            src = Image.open(portrait).convert("RGB")
            # Head-and-shoulders, to match the framing of the supplied thumbnails. A wider
            # crop reads as a different kind of image next to them in the same row.
            side = int(src.width * 0.52)
            top = int(src.height * 0.03)
            t = src.crop(((src.width - side) // 2, top,
                          (src.width + side) // 2, top + side)).resize((THUMB_W, THUMB_W), Image.LANCZOS)
            line += "   thumb %3dKB (derived — no source)" % save(t, f"{OUT_KID}/{slug}-thumb.jpg", 88)
        print(line)

    # PNG, overwriting the versions sliced out of the 4x4 sheet: the game reads
    # `assets/portraits/<slug>.png` (ui/enemy.js, ui/cardart.js, the Rescue screen), and these
    # dedicated portraits are the same subject at far better quality. Writing .jpg alongside
    # would just leave 13 files nothing loads.
    for slug, src in PALS.items():
        if not os.path.exists(src):
            missing.append(src); continue
        im = Image.open(src).convert("RGB")
        # Match the 828x516 of the three slugs still sliced out of the 4x4 sheet
        # (marmalade, wisp, crumbula have no dedicated portrait yet). One aspect across all
        # sixteen means no consumer has to special-case a square one. Crop high: these are
        # portraits and the subject's head is above centre.
        ar = PAL_W / PAL_H
        w, h = im.size
        if w / h > ar:
            nw = int(h * ar)
            im = im.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
        else:
            nh = int(w / ar)
            top = int((h - nh) * 0.28)
            im = im.crop((0, top, w, top + nh))
        im = im.resize((PAL_W, PAL_H), Image.LANCZOS)
        print("%-8s companion %dx%d %3dKB" % (slug, im.width, im.height,
                                              save(im, f"{OUT_PAL}/{slug}.png")))
    print()
    print("-> now run: python game/src/ui/make_thumbs.py")

    if missing:
        print("\nMISSING SOURCES:", file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
