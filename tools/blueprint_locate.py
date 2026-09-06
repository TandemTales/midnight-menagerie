"""Find where each of the seventeen section drawings sits on the estate plan.

    python tools/blueprint_locate.py            # write the JSON
    python tools/blueprint_locate.py --report   # measure only
    python tools/blueprint_locate.py --preview  # also write an overlay PNG

Reads   game/assets/blueprint/mansion.png  (1448x1086, the whole estate)
        game/assets/blueprint/sectionNN.png (the seventeen wings)
Writes  game/assets/blueprint/sections.json

ONE-OFF, like blueprint_trace.py: run it, commit the JSON, the game never runs
it. This is what a mansion-level map needs -- the rectangle each wing occupies
on the estate drawing, so the whole house can be shown at once with the wings
as hover targets, and picking one can zoom into the section it came from.

HOW THE MATCH IS MADE, and why it is not a crop comparison. The sections were
cut from this very drawing but they are not byte-identical to it: they have been
level-shifted (section01 runs 40..210 where the estate runs 29..224) and, more
importantly, everything outside the wing has been ERASED to blank parchment. So
an exact search finds nothing -- tried, zero hits on all seventeen -- and a
straight difference is dominated by the erased area rather than the drawing.

Normalised cross-correlation is invariant to the level shift, and the erased
area only costs it a constant, so the peak still lands on the right place. It
does depress the score: the sections with the most erased around them score
worst (pumpkin-grounds 0.67, lampworks 0.70) and the ones that fill their box
score best (foyer 0.96, nursery 0.96). A low score here is not a bad match.

VERIFIED, because a 0.67 needs it. Three checks, all pointing the same way:

  scale     every section peaks at scale 1.00 by a factor of 3 to 5 over any
            other scale tried (0.6 to 2.0). A wrong location does not do that.
  edges     re-running the whole thing on gradient magnitude instead of luma --
            a different signal, since these are line drawings -- returns the
            SAME seventeen positions.
  eyes      cropping the estate at the found rectangle and putting it beside the
            section shows the same structures in the same places: the cathedral
            spires and tree masses of lampworks, the oval room of
            pumpkin-grounds. What differs is only what was erased.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import signal

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "game", "assets", "blueprint")
MANSION = os.path.join(BP, "mansion.png")
OUT = os.path.join(BP, "sections.json")


def regions():
    """{slug: (section no, companion, boss, name)} straight out of mapgen.js, so
    this file never keeps its own copy of a table the game already owns."""
    src = open(os.path.join(ROOT, "game/src/state/mapgen.js"), encoding="utf-8").read()
    out = {}
    for slug, name, boss, comp, sec in re.findall(
            r"M\('([a-z-]+)','([^']*)','([^']*)','([a-z]*)',(\d+),", src):
        out[slug] = (int(sec), comp or None, boss, name)
    return out


def peak(I, I2, T):
    """Normalised cross-correlation peak of T in I. Returns (r, x, y)."""
    th, tw = T.shape
    Tz = T - T.mean()
    tss = np.sqrt((Tz * Tz).sum())
    if tss == 0:
        return 0.0, 0, 0
    num = signal.fftconvolve(I, Tz[::-1, ::-1], mode="valid")
    ones = np.ones((th, tw))
    s1 = signal.fftconvolve(I, ones, mode="valid")
    s2 = signal.fftconvolve(I2, ones, mode="valid")
    var = s2 - s1 * s1 / (th * tw)
    var[var < 1e-6] = 1e-6
    r = num / (np.sqrt(var) * tss)
    y, x = np.unravel_index(np.argmax(r), r.shape)
    return float(r[y, x]), int(x), int(y)


def main(report=False, preview=False):
    I = np.array(Image.open(MANSION).convert("L")).astype(np.float64)
    I2 = I * I
    MH, MW = I.shape
    reg = regions()
    by_section = {n: (slug, comp, boss, name) for slug, (n, comp, boss, name) in reg.items()}

    out = {"mansion": {"file": "mansion.png", "w": MW, "h": MH}, "sections": {}}
    print("%-19s %3s %-11s %-22s %s" % ("region", "sec", "companion", "rect", "match"))
    for n in sorted(by_section):
        f = os.path.join(BP, "section%02d.png" % n)
        if not os.path.exists(f):
            print("  section%02d.png missing" % n)
            continue
        slug, comp, boss, name = by_section[n]
        T = np.array(Image.open(f).convert("L")).astype(np.float64)
        r, x, y = peak(I, I2, T)
        h, w = T.shape
        out["sections"][slug] = {
            "section": n, "companion": comp, "boss": boss, "name": name,
            "x": x, "y": y, "w": w, "h": h,
            # normalised, because the map will draw the estate at whatever size
            # the window is and hit-testing in source pixels would be a lie
            "nx": round(x / MW, 5), "ny": round(y / MH, 5),
            "nw": round(w / MW, 5), "nh": round(h / MH, 5),
            "match": round(r, 3),
        }
        print("%-19s %3d %-11s x%-4d y%-4d %3dx%-3d  %.2f"
              % (slug, n, comp or "-", x, y, w, h, r))

    if preview:
        from PIL import ImageDraw
        ov = Image.open(MANSION).convert("RGB")
        d = ImageDraw.Draw(ov, "RGBA")
        for slug, e in out["sections"].items():
            d.rectangle([e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]],
                        fill=(60, 200, 255, 45), outline=(60, 200, 255, 255), width=3)
            d.text((e["x"] + 6, e["y"] + 5), slug, fill=(255, 255, 255))
        p = os.path.join(ROOT, "shots", "blueprint-locate.png")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        ov.save(p)
        print("\npreview -> shots/blueprint-locate.png")

    if report:
        return 0
    json.dump(out, open(OUT, "w"), indent=1)
    print("\nwrote game/assets/blueprint/sections.json (%d wings)" % len(out["sections"]))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--preview", action="store_true")
    sys.exit(main(**vars(ap.parse_args())))
