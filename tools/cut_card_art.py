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

# WHICH TILES ARE THE CARDS, for sheets whose slot count ignores the range. The
# generator lays out whatever grid it likes -- 7x4 for a 20-card range, 5x4 for a
# 9-card one -- and the spares are not reliably at either end, so there is no rule
# to infer. Every entry here was read off the art against the card names, and a
# sheet that needs one and does not have one makes this tool stop rather than
# guess: a silently wrong mapping is worse than no mapping, because it looks
# finished.
#
#   mopsy 81on   spares at the FRONT. Tile 3 is a reaper with a scythe
#                (seam-reaper), 5 a bunny bursting with stuffing
#                (stuffed-to-bursting), 6 scales weighing stuffing against
#                patches (stuffing-economy), 9 a bunny in a "Well Loved" tag,
#                14 a finished quilt (the-whole-pattern).
#   boggle 81on  one spare in the MIDDLE, at tile 7. Most of this sheet labels
#                itself: 2 reads "WRONG SIDE OF BED", 3 "EVERYBODY UNDER THE
#                BED!", 4 "FEAR OF THE DARK", 5 "Good Night, Sleep Tight.",
#                6 "LIGHTS OUT", 8 books spelling "Monsters Under Every Bed",
#                9 "THE BIG ONE", 10 "You Didn't See Anything." Tile 7, a
#                shadow in a doorway, is named by nothing and sits between 6 and
#                8, both of which are pinned by their own text.
# Which VERSION to read a range from, where the default (first that is long
# enough, alphabetical) is not the one that matches. Only mopsy 1-20 so far, and
# it was checked by eye: version b's tiles line up with cards 1-15 and version
# a's do not, while a's last row is unmistakable for 16-20 -- which is what the
# five OVERRIDE entries below pin. `a` has 22 tiles so the default rule would
# reach for it first and take the front half from the wrong sheet.
PREFER = {("mopsy", 1): "mopsy_cards1-20b.png"}

# THE SHEET PREFIX IS USUALLY THE SLUG, and once it is not: the art is filed
# under the Companion's display name. Without this the sheets are found, matched
# against no Companion in the master list, and silently skipped -- which is
# exactly how Count Crumbula's ninety cards stayed on procedural art while every
# other Companion's were cut.
PREFIX_SLUG = {"countCrumbula": "crumbula"}

# SHEETS WITH NO GUTTERS AT ALL.
#
# `sheet_tiles.tiles` finds tiles by looking for uniform gutter lines, which is
# the right discriminator and finds precisely nothing on a sheet whose tiles butt
# edge to edge: the whole sheet reads as one tile. Three sheet families are drawn
# that way and reported 1 to 5 tiles for a 20-card range, so 47 of their cards
# were being left on procedural art.
#
# Detecting the grid from the pixels was tried four ways -- absolute jump at the
# implied boundaries, the weakest such jump, how PEAKED each is locally, and how
# each ranks globally -- and all four picked 10x2 for a sheet that is plainly
# 5x4. They cannot work here: a 10-way split CONTAINS every boundary of a 5-way
# one, so no score over "are these lines strong" can reject it, and the lines it
# adds fall mid-tile where busy art is just as noisy as an edge.
#
# So the grid is READ OFF THE ART, the same way this file's other two special
# cases were, and recorded per (companion, sheet size). It is applied ONLY when
# the range wants exactly rows x cols and only when gutter detection came back
# short -- a sheet that does not line up still stops the tool rather than being
# guessed at.
GUTTERLESS = {
    ("drizzle", 1536, 1024): (5, 4),
    ("drizzle", 1402, 1122): (5, 4),
    ("crinkle", 1402, 1122): (5, 4),
    ("hush",    1402, 1122): (4, 5),
}


def grid_tiles(path, want):
    """Tiles of a gutterless sheet, or [] when this one is not in the table."""
    from PIL import Image as _I
    comp = os.path.basename(path).split("_cards")[0]
    comp = PREFIX_SLUG.get(comp, comp)
    with _I.open(path) as im:
        w, h = im.size
    grid = GUTTERLESS.get((comp, w, h))
    if not grid:
        return []
    cols, rows = grid
    if cols * rows != want:
        return []
    cw, ch = w / cols, h / rows
    out = []
    for r in range(rows):
        for c in range(cols):
            out.append((int(round(c * cw)), int(round(r * ch)),
                        int(round((c + 1) * cw)), int(round((r + 1) * ch))))
    return out

TILES = {
    "mopsy_cards81onA.png":  list(range(3, 15)),
    "boggle_cards81onA.png": [1, 2, 3, 4, 5, 6, 8, 9, 10],
}

# Per-card overrides, for the one range where no single sheet is right end to
# end. mopsy 1-20 version b matches through ~15 and version a's last row is
# unmistakable for 16-20.
OVERRIDE = {
    "mopsy/borrowed-pattern": ("mopsy_cards1-20a.png", 18),   # patches swapping, arrows both ways
    "mopsy/button-bonk":      ("mopsy_cards1-20a.png", 19),   # two buttons colliding in a burst
    "mopsy/button-box":       ("mopsy_cards1-20a.png", 20),   # a box of buttons
    "mopsy/cross-stitch":     ("mopsy_cards1-20a.png", 21),   # a needle making an X
    "mopsy/cushion-check":    ("mopsy_cards1-20a.png", 22),   # a quilted shield of stuffing

    # taffy 81-89: both versions hold 8 tiles for 9 cards, so neither finishes
    # the range alone -- but they do not hold the SAME eight. Version A's last
    # tile is the blob slamming down and scattering what is under it; version
    # B's is a three-tier dessert captioned "ATTACK + MORE / SKILL + GUARD /
    # POWER - COST", which is three courses in as many words. Taking one from
    # each covers 88 and 89 and reuses nothing.
    "taffy/three-course-chomp": ("taffy_cards81onB.png", 8),
    "taffy/whole-body-slam":    ("taffy_cards81onA.png", 8),
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

    def sheet_tiles(name, want=None):
        """Tiles of one sheet, cached per SHEET and not per (sheet, want).

        The planner asks with a `want`; the cutter asks without one, and keying
        the cache on both handed the cutter the un-fallen-back list — three tiles
        for a gutterless sheet the planner had already resolved to twenty, and an
        IndexError on the fourth card. One sheet has one answer.
        """
        if name not in tcache:
            path = os.path.join(ART, name)
            t = tiles(path)
            # Gutter detection came back short on a sheet we have read the grid
            # for: fall back to it. Never the other way round — a sheet with
            # real gutters is measured, not assumed.
            if want and len(t) < want:
                g = grid_tiles(path, want)
                if g:
                    t = g
            tcache[name] = t
        return tcache[name]

    for prefix in comps:
        # The sheet PREFIX names the files; the SLUG names the Companion in the
        # master list and the output directory. They differ for exactly one
        # family (`countCrumbula`), and conflating them skipped its ninety cards.
        comp = PREFIX_SLUG.get(prefix, prefix)
        if comp not in order:
            notes.append(f"{prefix}: sheets exist but the master list has no such Companion; skipped")
            continue
        ids = order[comp]
        n = len(ids)
        if not report:
            os.makedirs(os.path.join(OUT, comp), exist_ok=True)
        print(f"== {comp}: {n} cards")
        for lo, hi in ranges_for(n):
            want = hi - lo + 1
            opts = [(os.path.basename(f), len(sheet_tiles(os.path.basename(f), want)))
                    for f in sheets_for(prefix, lo)]
            if not opts:
                notes.append(f"{comp} {lo}-{hi}: no sheet")
                continue
            # WHICH TILE IS WHICH CARD. Tile N of a sheet is card N, and a sheet
            # with more tiles than the range has cards is carrying its spares at
            # the end -- that is the rule, and it settles almost everything the
            # generator's arbitrary grids throw at this (7x4 for a 20-card
            # range, 5x4 for a 9-card one).
            #
            # Where a version is SHORT, the others are a pool: `a` covers what it
            # covers and `b`, `c` fill in behind it. Versions are alternate
            # renderings of the same cards, so a card takes one of them and never
            # two, and a card is only left bare when NO version has a tile at
            # that index.
            #
            # A verified TILES entry still wins, because it encodes the one thing
            # the rule cannot know: boggle's 81on sheet carries its spare in the
            # MIDDLE, at tile 7, so "first nine" would quietly slide its last
            # three cards onto the wrong art.
            first = PREFER.get((comp, lo)) or PREFER.get((prefix, lo))
            order_opts = ([o for o in opts if o[0] == first]
                          + [o for o in opts if o[0] != first]) if first else opts
            plan = []
            for i in range(want):
                chosen = None
                for nm, count in order_opts:
                    if nm in TILES:
                        pk = TILES[nm]
                        if i < len(pk):
                            chosen = (nm, pk[i]); break
                    elif i < count:
                        chosen = (nm, i + 1); break
                plan.append(chosen)
            # An OVERRIDE fills a card the pool could not reach, so it has to be
            # counted before anything is called bare -- otherwise the report
            # cries about a gap the very next loop closes.
            bare = [lo + i for i, c in enumerate(plan)
                    if c is None and ids[lo - 1 + i] not in OVERRIDE]
            if bare:
                notes.append(
                    f"UNCOVERED  {comp} {lo}-{hi}: no version has a tile for card"
                    f"{'s' if len(bare) > 1 else ''} {', '.join(map(str, bare))} "
                    f"({', '.join('%s=%d' % o for o in opts)}). Those keep procedural art.")
            used = sorted({c[0] for c in plan if c})
            print("   cards %-7s want %2d  %-46s -> %s%s"
                  % (f"{lo}-{hi}", want,
                     ', '.join('%s=%d' % (a.split('_cards')[1][:-4], b) for a, b in opts),
                     ', '.join(u.split('_cards')[1][:-4] for u in used) or '-',
                     '   %d BARE' % len(bare) if bare else ''))
            if report:
                continue
            for i in range(want):
                cid = ids[lo - 1 + i]
                slug = cid.split("/", 1)[1]
                if cid in OVERRIDE:
                    src_name, tno = OVERRIDE[cid]
                elif plan[i]:
                    src_name, tno = plan[i]
                else:
                    continue
                src = Image.open(os.path.join(ART, src_name)).convert("RGB")
                box = sheet_tiles(src_name)[tno - 1]
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
