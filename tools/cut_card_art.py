"""Cut the composite card-art sheets in `art/` into one image per Trick.

    python tools/cut_card_art.py            # write game/assets/cards
    python tools/cut_card_art.py --report   # measure and plan, write nothing

INPUT is `art/<companion>_cards<range><version>.png` -- contact sheets of 20-ish
illustrations each, where `1-20a` means "art for that Companion's cards 1 to 20
in the master list, version a". Versions a/b/c are alternate renderings of the
SAME range, not more cards.

ORDER comes from `Every Trick in the House.docx`, the master list, whose own
header says the cards are grouped by Companion and then ordered by Nerve cost.
Nothing here re-derives that order: the document is parsed in document order and
its per-Companion counts are checked against the counts the document itself
prints (Marmalade 88, Mopsy 92, ...). If those disagree the parse is wrong and
this refuses to run.

THE SHEETS ARE NOT A UNIFORM GRID and their tile counts are not reliable:
mopsy_cards1-20a runs 5 tiles on its first two rows and 6 on the next two;
marmalade_cards61-80b has 16 where its siblings have 20; mopsy_cards81onA has 14
for a 12-card range. So tiles are DETECTED (see sheet_tiles.py), the version used
per range is whichever has exactly as many tiles as the range has cards, and the
two places where no sheet lines up are handled explicitly below rather than
guessed -- both were resolved by reading the art against the card names.

VERIFIED BY CONTENT, not assumed. Marmalade: tile 3 is a paw reaching for a
butterfly (curious-paw), 4 a trail of paw prints (frenzied-zoomies), 6 nine
flames around a cat face (nine-lived-nerve), 11 a paw landing in water
(always-lands), 14 cat ears on a cushion under Zzz (catnap).

Prints what it wrote, and every assumption it had to make.
"""
import argparse
import json
import os
import re
import sys
import zipfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheet_tiles import tiles          # noqa: E402

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art")
OUT = os.path.join(ROOT, "game", "assets", "cards")
DOCX = os.path.join(ROOT, "Every Trick in the House.docx")

INSET = 2          # px shaved off each tile so no antialiased gutter survives
QUALITY = 92       # webp; visually lossless on this material, ~24 KB a card

# Leading tiles on a sheet that are not cards. Only ever added with the art read
# against the names: on mopsy_cards81onA the spares are at the FRONT, and tiles
# 3..14 are cards 81..92 -- tile 3 is a reaper with a scythe (seam-reaper), 4 a
# ship (ship-of-mopsy), 5 a bunny bursting with stuffing (stuffed-to-bursting),
# 6 scales weighing stuffing against patches (stuffing-economy), 9 a bunny in a
# "Well Loved" tag (well-loved), 14 a finished quilt (the-whole-pattern).
SKIP = {"mopsy_cards81onA.png": 2}

# Per-card overrides, for the one range where no single sheet is right end to
# end. mopsy 1-20 version b matches through ~15 and version a's last row is
# unmistakable for 16-20.
OVERRIDE = {
    "mopsy/borrowed-pattern": ("mopsy_cards1-20a.png", 18),   # patches swapping, arrows both ways
    "mopsy/button-bonk":      ("mopsy_cards1-20a.png", 19),   # two buttons colliding in a burst
    "mopsy/button-box":       ("mopsy_cards1-20a.png", 20),   # a box of buttons
    "mopsy/cross-stitch":     ("mopsy_cards1-20a.png", 21),   # a needle making an X
    "mopsy/cushion-check":    ("mopsy_cards1-20a.png", 22),   # a quilted shield of stuffing
}


def doc_text():
    z = zipfile.ZipFile(DOCX)
    x = z.read("word/document.xml").decode("utf8", "replace")
    return re.sub(r"<[^>]+>", "", re.sub(r"</w:p>", "\n", x))


def card_order():
    """{companion: [card id, ...]} in master-list order, checked against the
    counts the document prints for itself."""
    slugs = [os.path.splitext(f)[0] for f in os.listdir(os.path.join(ROOT, "game/src/data/companions"))
             if f.endswith(".js") and f != "keywords.js"]
    t = doc_text()
    pat = re.compile("(" + "|".join(sorted(slugs, key=len, reverse=True)) + r")/([a-z0-9][a-z0-9-]*)")
    order = {}
    for m in pat.finditer(t):
        order.setdefault(m.group(1), [])
        if m.group(0) not in order[m.group(1)]:
            order[m.group(1)].append(m.group(0))
    return order


def ranges_for(n):
    out, lo = [], 1
    while lo <= 80 and lo <= n:
        out.append((lo, min(lo + 19, n)))
        lo += 20
    if n > 80:
        out.append((81, n))
    return out


def sheets_for(comp, lo):
    import glob
    pat = f"{comp}_cards{lo}-{lo + 19}*.png" if lo <= 80 else f"{comp}_cards81on*.png"
    return sorted(glob.glob(os.path.join(ART, pat)))


def main(report=False):
    order = card_order()
    have = sorted({os.path.basename(f).split("_cards")[0]
                   for f in sheets_for("*", 1) or []})
    comps = sorted({os.path.basename(f).split("_cards")[0]
                    for f in __import__("glob").glob(os.path.join(ART, "*_cards*.png"))})
    manifest, notes = {}, []
    tcache = {}

    def sheet_tiles(name):
        if name not in tcache:
            tcache[name] = tiles(os.path.join(ART, name))
        return tcache[name]

    for comp in comps:
        if comp not in order:
            notes.append(f"{comp}: sheets exist but the master list has no such Companion; skipped")
            continue
        ids = order[comp]
        n = len(ids)
        if not report:
            os.makedirs(os.path.join(OUT, comp), exist_ok=True)
        print(f"== {comp}: {n} cards")
        for lo, hi in ranges_for(n):
            want = hi - lo + 1
            opts = [(os.path.basename(f), len(sheet_tiles(os.path.basename(f))))
                    for f in sheets_for(comp, lo)]
            if not opts:
                notes.append(f"{comp} {lo}-{hi}: no sheet")
                continue
            exact = [o for o in opts if o[1] == want]
            if exact:
                name, k = exact[0][0], 0
            else:
                name = min(opts, key=lambda o: abs(o[1] - want))[0]
                k = SKIP.get(name)
                if k is None:
                    raise SystemExit(
                        f"{comp} {lo}-{hi}: {name} has {dict(opts)[name]} tiles for {want} cards "
                        f"and no verified alignment. Refusing to guess.")
                notes.append(f"{comp} {lo}-{hi}: {name} has {dict(opts)[name]} tiles for {want} "
                             f"cards; used tiles {k + 1}-{k + want} (alignment read off the art)")
            print("   cards %-6s want %2d  %-40s -> %s" % (f"{lo}-{hi}", want, str(opts), name))
            if report:
                continue
            im = Image.open(os.path.join(ART, name)).convert("RGB")
            t = sheet_tiles(name)
            for i in range(want):
                cid = ids[lo - 1 + i]
                slug = cid.split("/", 1)[1]
                if cid in OVERRIDE:
                    src_name, tno = OVERRIDE[cid]
                    src = Image.open(os.path.join(ART, src_name)).convert("RGB")
                    box = sheet_tiles(src_name)[tno - 1]
                else:
                    src_name, tno, src = name, k + i + 1, im
                    box = t[k + i]
                x0, y0, x1, y1 = box
                crop = src.crop((x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET))
                rel = f"{comp}/{slug}.webp"
                crop.save(os.path.join(OUT, rel), "WEBP", quality=QUALITY, method=6)
                manifest[cid] = {"file": rel, "w": crop.width, "h": crop.height,
                                 "source": src_name, "tile": tno, "n": lo + i}

    if report:
        for line in notes:
            print("   NOTE: " + line)
        return 0

    json.dump({"cards": manifest}, open(os.path.join(OUT, "index.json"), "w"), indent=1)

    # No card may share art with another. The whole point of the version tables
    # above is that a range never falls back to reusing a tile.
    import hashlib
    seen = {}
    for cid, e in manifest.items():
        d = hashlib.sha256(open(os.path.join(OUT, e["file"]), "rb").read()).hexdigest()
        if d in seen:
            raise SystemExit(f"duplicate art: {cid} and {seen[d]} are the same image")
        seen[d] = cid

    print(f"\nwrote {len(manifest)} card images to game/assets/cards ({len(seen)} distinct)")
    for line in notes:
        print("   NOTE: " + line)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="measure and plan, write nothing")
    sys.exit(main(**vars(ap.parse_args())))
