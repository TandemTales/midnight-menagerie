"""Paintings borrowed for the enemies in the demo's wings that have none of their own.

    python tools/prep_borrowed_stills.py [ids...]

A part or summon with no painting draws as a procedural blob, and in a fight it stands next to
a painted body. Until its own painting arrives, each one here wears a relative's: the Hydra's
heads are cut out of the Hydra, a Crust Beast is the Dough Blob baked brown, a Caramel Creeper
is the Jam Jar cooked down. No model, no new art: only stills the game already has.

A real painting always wins. Each file written is recorded with its hash in
docs/art/borrowed-stills.json; a file under that name with any other hash is a delivery, and it
is left alone and dropped from the record. The ids in the record stay on
docs/art/enemy-stills-checklist.md as still wanted.

Writes the source to animations/sprites/enemies/ and builds only that one still, because
`prep_sprites.py --enemies` rebuilds the whole set.
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
os.chdir(ROOT)
import prep_sprites as P  # noqa: E402

BUILT = "game/assets/sprites/enemies"
SRC = "animations/sprites/enemies"
INDEX = "game/assets/sprites/index.json"
RECORD = "docs/art/borrowed-stills.json"

# Polygons on the Hydra's 512px source, traced by eye from a 900px view (so x * 512/900).
HEAD_BEAR = [(203, 532), (212, 492), (250, 474), (298, 500), (330, 472), (368, 478), (376, 512), (398, 560),
             (402, 612), (362, 628), (322, 644), (292, 642), (266, 612), (238, 592), (214, 562)]
HEAD_PURPLE = [(612, 548), (624, 518), (660, 478), (678, 424), (700, 396), (726, 424), (772, 418), (814, 450),
               (816, 500), (812, 572), (788, 568), (778, 514), (742, 532), (716, 548), (702, 606), (650, 580)]
HEAD_GREEN = [(678, 684), (698, 620), (748, 572), (828, 592), (868, 650), (862, 702), (802, 732), (742, 738), (690, 742)]

# id: (relative's still, hue degrees, saturation x, value x, extra)
TABLE = {
    "hydra-head-snoring": {"cut": HEAD_GREEN},
    "hydra-head-biting": {"cut": HEAD_PURPLE},
    "hydra-head-crying": {"cut": HEAD_BEAR},
    "favorite-doll": {"from": "button-baby", "hue": -24, "sat": 1.05, "val": 1.04},
    "doughling": {"from": "dough-blob"},
    "crust-beast": {"from": "dough-blob", "hue": -8, "sat": 1.9, "val": .62},
    "cake-thing": {"from": "rising-batter", "hue": -6, "sat": 1.35, "val": .92},
    "brittle-candy-beast": {"from": "candy-clump", "hue": 150, "sat": .95, "val": 1.05},
    "caramel-creeper": {"from": "jam-jar", "hue": 26, "sat": .82, "val": .82},
    "cutlery-devil": {"from": "pantry-poltergeist", "hue": 0, "sat": .3, "val": 1.0},
    "dish": {"from": "sugar-golem", "hue": 6, "sat": .72, "val": 1.06},
    "seedling": {"from": "potling"},
    "thorn-seed": {"from": "spore-puff", "hue": 118, "sat": .9, "val": .78},
    "vine-seed": {"from": "spore-puff", "hue": 86, "sat": .9, "val": .9},
    "bloom-seed": {"from": "spore-puff", "hue": 24},
    "thorn-bush": {"from": "creeping-ivy", "hue": -34, "sat": .9, "val": .82},
    "binding-vine": {"from": "glassvine", "hue": -132, "sat": .85, "val": .92},
    "moon-bloom": {"from": "glassvine", "hue": 28},
    "growth-patch": {"from": "creeping-ivy", "squash": .55},
    "regrowth-node": {"from": "compost-colossus", "val": .82},
}


def camel(enemy_id):
    parts = enemy_id.split("-")
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:]) + ".png"


def grade(im, hue=0, sat=1.0, val=1.0):
    """Shift the paint in HSV. Linear in S and V, so the shading survives."""
    a = np.asarray(im.convert("RGBA"), float) / 255
    rgb, al = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-9
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    i = m & (mx == r)
    h[i] = ((g - b)[i] / d[i]) % 6
    i = m & (mx == g) & (mx != r)
    h[i] = (b - r)[i] / d[i] + 2
    i = m & (mx == b) & (mx != r) & (mx != g)
    h[i] = (r - g)[i] / d[i] + 4
    s = np.where(mx > 1e-9, d / np.maximum(mx, 1e-9), 0)
    h = (h + hue / 60) % 6
    s = np.clip(s * sat, 0, 1)
    v = np.clip(mx * val, 0, 1)
    c = v * s
    x = c * (1 - np.abs(h % 2 - 1))
    z = np.zeros_like(c)
    sector = np.floor(h).astype(int) % 6
    rr = np.choose(sector, [c, x, z, z, x, c])
    gg = np.choose(sector, [x, c, c, x, z, z])
    bb = np.choose(sector, [z, z, x, c, c, x])
    o = v - c
    out = np.dstack([rr + o, gg + o, bb + o, al])
    return Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")


def cut(poly):
    """A head out of the Hydra: a feathered cut, and a seam of shadow where it left the quilt."""
    src = Image.open(os.path.join(SRC, "blanketHydra.png")).convert("RGBA")
    k = src.width / 900
    pts = [(x * k, y * k) for x, y in poly]
    x0, y0 = int(min(p[0] for p in pts)) - 3, int(min(p[1] for p in pts)) - 3
    x1, y1 = int(max(p[0] for p in pts)) + 3, int(max(p[1] for p in pts)) + 3
    S = 3  # worked at 3x: the source's heads are ~120px and they stand at about twice that
    crop = src.crop((x0, y0, x1, y1)).resize(((x1 - x0) * S, (y1 - y0) * S), Image.LANCZOS)
    crop = crop.filter(ImageFilter.UnsharpMask(radius=3, percent=70, threshold=2))
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).polygon([((x - x0) * S, (y - y0) * S) for x, y in pts], fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(2.2)), float) / 255
    a = np.asarray(crop, float)
    inside = ndi.distance_transform_edt(m > .5)
    # the painted silhouette keeps its own edge; only the cut line is shaded
    own = a[..., 3] / 255
    cutline = (m < .98) | (inside < 14)
    seam = np.where(cutline & (ndi.uniform_filter(own, 15) > .92), .62 + .38 * np.clip(inside / 14, 0, 1), 1.0)
    a[..., :3] *= seam[..., None]
    a[..., 3] = a[..., 3] * m
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def make(eid, spec):
    if "cut" in spec:
        return cut(spec["cut"])
    im = Image.open(os.path.join(BUILT, spec["from"] + ".webp")).convert("RGBA")
    if "squash" in spec:
        im = im.resize((im.width, int(im.height * spec["squash"])), Image.LANCZOS)
    return grade(im, spec.get("hue", 0), spec.get("sat", 1.0), spec.get("val", 1.0))


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    only = set(sys.argv[1:])
    record = json.load(open(RECORD)) if os.path.exists(RECORD) else {}
    index = json.load(open(INDEX, encoding="utf-8"))
    enemies = index["enemies"]
    # Two stills whose delivered sources are gone: restored from the build, so the source
    # directory stays complete and a set rebuild cannot delete them.
    for eid, meta in enemies.items():
        p = os.path.join(SRC, meta["source"])
        if not os.path.exists(p):
            Image.open(os.path.join(BUILT, meta["file"])).convert("RGBA").save(p)
            print("restored source from the build:", meta["source"])
    for eid, spec in TABLE.items():
        if only and eid not in only:
            continue
        fn = camel(eid)
        p = os.path.join(SRC, fn)
        if os.path.exists(p) and sha(p) != record.get(eid):
            print("%-22s a real painting has arrived: left alone" % eid)
            record.pop(eid, None)
            continue
        make(eid, spec).save(p)
        record[eid] = sha(p)
        meta = P.build_enemy_still(p, os.path.join(BUILT, eid))
        enemies[eid] = meta
        print("%-22s %4dx%-4d %s" % (eid, meta["w"], meta["h"], spec.get("from", "cut from blanket-hydra")))
    index["enemies"] = dict(sorted(enemies.items()))
    json.dump(index, open(INDEX, "w"), indent=1)  # as prep_sprites writes it
    with open(RECORD, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dict(sorted(record.items())), f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
