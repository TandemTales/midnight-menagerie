"""Mr. Moth's portrait, for the mirror at the head of his shelf (round 5, POLISH).

    python tools/prep_moth_portrait.py > moth.svg     # then paste into scenes/shop.js

The drawing is tools/moth/portrait.tpl.svg: wings with eye-spots, a long coat,
a ruff of fur at his throat, a fuzzy head with two great dark eyes, feathered
antennae, and the lantern in his hand. What a hand would take an afternoon to
ink is laid here, seeded so it never moves: the barbs along both antennae, and
the short strokes of fur in the ruff and on the head. The template's colours
are classes, dressed in scenes/shop.css from the kit's tokens, and a brush
filter in the drawing wobbles its edges and lays the paper's tooth into it.
"""
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(HERE, "moth", "portrait.tpl.svg")


def antenna(x0, y0, cx1, cy1, cx2, cy2, x1, y1, n=26):
    """A bipectinate antenna: a curved stem, feathered with barbs either side,
    longest at its middle and tapering to both ends."""
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(((1 - t) ** 3 * x0 + 3 * (1 - t) ** 2 * t * cx1 + 3 * (1 - t) * t * t * cx2 + t ** 3 * x1,
                    (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * cy1 + 3 * (1 - t) * t * t * cy2 + t ** 3 * y1))
    stem = "M" + " L".join("%.1f %.1f" % p for p in pts)
    barbs = []
    for i in range(3, n):
        (xa, ya), (xb, yb) = pts[i - 1], pts[i]
        dx, dy = xb - xa, yb - ya
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        ln = 7.0 * math.sin(min(1, i / n * 1.25) * math.pi) + 1.2
        for s in (1, -1):
            barbs.append("M%.1f %.1f L%.1f %.1f" % (xb, yb, xb + nx * s * ln + dx / L * ln * .55,
                                                    yb + ny * s * ln + dy / L * ln * .55))
    return stem, " ".join(barbs)


def fur(rng, cx, cy, rx, ry, n, ln, a0, a1, jitter=.35):
    """Short strokes of fur round an ellipse's arc, each leaning its own way."""
    out = []
    for k in range(n):
        a = a0 + (a1 - a0) * (k + rng.random() * .8) / n
        r = rng.uniform(.72, 1.0)
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        l = ln * rng.uniform(.6, 1.1)
        aa = a + rng.uniform(-jitter, jitter)
        out.append("M%.1f %.1f l%.1f %.1f" % (x, y, math.cos(aa) * l, math.sin(aa) * l))
    return " ".join(out)


def build():
    rng = random.Random(4)
    stem_l, barbs_l = antenna(53, 76, 46, 58, 34, 40, 24, 30)
    stem_r, barbs_r = antenna(67, 76, 74, 58, 86, 40, 96, 30)
    ruff = fur(rng, 60, 116, 24, 9, 70, 7, math.pi * .05, math.pi * .95, .5) + " " + \
        fur(rng, 60, 112, 22, 8, 40, 6, math.pi * 1.02, math.pi * 1.98, .5)
    head = fur(rng, 60, 88, 18, 17, 90, 5, 0, math.pi * 2, .45)
    tpl = open(TPL, encoding="utf-8").read()
    return (tpl.replace("{ruff}", ruff).replace("{headfur}", head)
               .replace("{stems}", stem_l + " " + stem_r).replace("{barbs}", barbs_l + " " + barbs_r))


if __name__ == "__main__":
    print(build(), end="")
