"""The house's small painted objects, one function each (tools/prep_ui_hardware.py).

Each draws on a `Pic` (a 96-unit box) back to front: `p.part(shape, material,
profile)` lays a lit, inked, shadow-casting part; `p.ink` a stroke; `p.paint` a
patch of colour; `p.glow` light from a flame. An object should fill the box
from about 10 to 86 and read by its SILHOUETTE at 30 px, where it is shown.

Keys: a Keepsake's `icon` (data/relics.js), `snack-<id>` for a Snack
(state/run.js SNACKS), and the Safe Room's things. ui/objects.js lists them.
"""
import math

from prep_ui_hardware import (E, P, R, L, RR, rot, arc_pts, PAPER, BONE, CHALK, WOOD, LEATHER,
                              VELVET, WINE, BLACK, GLASS, AMBER, CANDY_R, CANDY_V, MINT, GREEN,
                              WAX, FLAME)

CREAM = ("#4f4536", "#d8c9a6", "#fff5dc")
IRON = ("#0d0c10", "#34313b", "#77727f")
LINEN = ("#4b4450", "#c9c2cf", "#fbf8ff")
ROSE = ("#3b1020", "#a33a58", "#f09ab2")
TEAL = ("#0b2226", "#2f6f72", "#8fd2cf")
BLUE = ("#0d1630", "#2e4f8f", "#8fb2ec")
YELLOW = ("#3d2a05", "#c99a22", "#ffe28a")
SLATE = ("#16151b", "#48454f", "#8d8995")
BROWN = ("#1f1209", "#5b3a20", "#9a7048")
SAGE = ("#1a2418", "#586a4e", "#a9bd98")
CLOTH_V = ("#170c22", "#5a3a86", "#b294e0")
MILK = ("#51565e", "#dfe3ea", "#ffffff")
FUR = ("#08070b", "#221e29", "#4c4558")


def spark(p, x, y, r=3.0, a=.9):
    p.paint(E(x, y, r, r * .62), "#ffffff", a * .55, blur=.8)
    p.paint(E(x, y, r * .38), "#ffffff", a)


# ── Snacks ────────────────────────────────────────────────────────────────────
def gummy_bat(p):
    wing = [(8, 40), (22, 30), (30, 40), (36, 34), (42, 44), (48, 40), (54, 44), (60, 34), (66, 40), (74, 30), (88, 40),
            (80, 50), (72, 52), (66, 60), (58, 56), (48, 66), (38, 56), (30, 60), (24, 52), (16, 50)]
    p.part(P(wing), ("#1d0a2c", "#7a3fb8", "#d9b0ff"), prof="pillow", bevel=6, gloss=.7, power=30)
    p.part(E(48, 46, 10, 11), ("#22082e", "#9148c9", "#e6c4ff"), prof="sphere", gloss=.8, power=34)
    p.part(P([(40, 38), (42, 28), (46, 36)]), ("#22082e", "#9148c9", "#e6c4ff"), bevel=2, gloss=.5)
    p.part(P([(56, 38), (54, 28), (50, 36)]), ("#22082e", "#9148c9", "#e6c4ff"), bevel=2, gloss=.5)
    p.paint(E(44, 44, 1.6), "#1a0724", .9)
    p.paint(E(52, 44, 1.6), "#1a0724", .9)
    for x, y in ((20, 40), (70, 40), (34, 50), (62, 50), (46, 58)):
        p.paint(E(x, y, 1.1), "#f4e2ff", .7)
    spark(p, 42, 39, 2.4)


def liquorice(p):
    # a coil of black liquorice rope, twisted
    pts = arc_pts(48, 50, 30, 24, 150, 510, 60)
    p.part(L(pts, 13), ("#050407", "#221c26", "#6d6178"), prof="round", bevel=6, gloss=.6, power=26)
    for i in range(0, 60, 3):
        a0 = pts[i]
        p.ink([(a0[0] - 3, a0[1] - 4), (a0[0] + 3, a0[1] + 4)], w=1.3, color="#6e5e7c", alpha=.55)
    p.part(E(48, 50, 13, 10), ("#050407", "#221c26", "#6d6178"), prof="pillow", bevel=4, gloss=.5)
    p.ink(arc_pts(48, 50, 7, 5, 0, 330, 20), w=1.4, alpha=.8)


def cold_milk(p):
    # a small glass bottle of milk, a foil cap
    body = [(34, 30), (62, 30), (62, 36), (70, 48), (70, 84), (26, 84), (26, 48), (34, 36)]
    p.part(P(body), MILK, bevel=9, gloss=.55, power=30)
    p.part(R(33, 16, 63, 31, 4), "silver", bevel=4)
    p.ink([(36, 22), (60, 22)], w=1.2, alpha=.35)
    p.paint(R(30, 56, 66, 70, 2), "#4b6fa8", .8)
    p.ink([(34, 63), (62, 63)], w=1.2, color="#e8eef8", alpha=.8)
    p.paint(R(31, 42, 36, 80, 2), "#ffffff", .45, blur=1)


def popping_candy(p):
    # a paper packet torn open, crackling candy jumping out of it
    p.part(P([(24, 38), (70, 32), (76, 84), (28, 88)]), ("#3a0c1c", "#c23a5a", "#ff9bb3"), prof="round", bevel=4, gloss=.25)
    p.part(P([(24, 38), (32, 32), (38, 38), (46, 30), (54, 37), (62, 29), (70, 32), (70, 38), (24, 44)]),
           ("#51425c", "#d8c8e6", "#ffffff"), prof="round", bevel=2, gloss=.2)
    p.paint(P([(30, 56), (70, 51), (72, 65), (32, 70)]), "#ffe28a", .9)
    for i, (x, y) in enumerate(((36, 60), (46, 58), (56, 57), (64, 56))):
        p.paint(E(x, y + 3, 2.4), ("#c23a5a", "#6b3fae", "#2f6f72", "#c23a5a")[i], .9)
    for x, y, r, c in ((30, 22, 3.2, "#ff9bb3"), (44, 14, 2.6, "#ffe28a"), (58, 18, 3.0, "#a9ead3"),
                       (70, 12, 2.2, "#c7a5f2"), (20, 30, 2.0, "#ffe28a"), (80, 24, 2.6, "#ff9bb3")):
        p.part(E(x, y, r), ("#40202a", c, "#ffffff"), prof="sphere", gloss=.6, shadow=0)
    for x0, y0, x1, y1 in ((38, 24, 34, 18), (52, 22, 54, 14), (66, 24, 72, 18)):
        p.ink([(x0, y0), (x1, y1)], w=1.3, color="#fff3c8", alpha=.9, over=False)


def jawbreaker(p):
    p.part(E(48, 50, 32), CANDY_R, prof="sphere", gloss=.6, power=44)
    for r, c in ((25, "#f3d6ff"), (19, "#7b4bc1"), (13, "#ffe2a8"), (7, "#3f8f78")):
        p.paint(E(55, 45, r, r * .92), c, .62)
        p.ink(arc_pts(55, 45, r, r * .92, 0, 360, 40), w=1.0, alpha=.28)
    p.paint(E(36, 34, 8, 4.5), "#ffffff", .5, blur=1.4)
    spark(p, 34, 31, 2.6)


def sherbet(p):
    p.part(P([(24, 36), (74, 32), (50, 90)]), PAPER, prof="round", bevel=4, gloss=.05)
    for i in range(5):
        p.ink([(28 + i * 11, 35), (47 + i * 1.6, 86)], w=1.6, color="#9b2a3c", alpha=.55)
    p.part([E(38, 33, 13, 9), E(58, 30, 14, 10), E(48, 24, 11, 9)], ("#6a4d8a", "#d8bff2", "#fff6ff"),
           prof="pillow", bevel=5, gloss=.15)
    for x, y in ((44, 20), (58, 22), (37, 27), (63, 30), (50, 16), (30, 32)):
        p.paint(E(x, y, 1.5), "#fff9ff", .95)
    for x, y in ((34, 10), (62, 9), (72, 18), (24, 20), (48, 6)):
        p.paint(E(x, y, 1.6), "#efe0ff", .8, over=False)


def toffee(p):
    p.part(P([(8, 38), (26, 46), (26, 58), (8, 66), (14, 52)]), WAX, bevel=3, gloss=.25)
    p.part(P([(88, 38), (70, 46), (70, 58), (88, 66), (82, 52)]), WAX, bevel=3, gloss=.25)
    p.part(R(22, 34, 74, 70, 6), AMBER, bevel=8, gloss=.65, power=34)
    p.ink([(40, 36), (40, 68)], w=1.4, alpha=.4)
    p.ink([(56, 36), (56, 68)], w=1.4, alpha=.4)
    p.ink([(24, 52), (72, 52)], w=1.4, alpha=.4)
    p.part(P([(20, 40), (28, 43), (28, 61), (20, 64)]), WAX, bevel=2, gloss=.2)
    p.part(P([(76, 40), (68, 43), (68, 61), (76, 64)]), WAX, bevel=2, gloss=.2)
    spark(p, 32, 40, 2.4)


def snack(p):
    # a sweet in a twist of violet foil
    p.part(P([(10, 34), (30, 44), (30, 56), (10, 66), (16, 50)]), CANDY_V, bevel=3, gloss=.6)
    p.part(P([(86, 34), (66, 44), (66, 56), (86, 66), (80, 50)]), CANDY_V, bevel=3, gloss=.6)
    p.part(E(48, 50, 22, 18), CANDY_V, prof="sphere", gloss=.8, power=40)
    p.ink([(34, 38), (62, 62)], w=1.3, color="#e6d0ff", alpha=.5)
    spark(p, 40, 40, 2.6)


# ── the Safe Room ────────────────────────────────────────────────────────────
def pillow(p):
    soft = ("#3e3348", "#b9aac8", "#f4eefa")
    p.part(R(10, 30, 86, 70, 16), soft, prof="pillow", bevel=16, gloss=.04, power=10)
    for x, y in ((12, 38), (84, 38), (86, 60), (10, 60)):
        p.part(E(x, y, 5, 4), soft, prof="sphere", gloss=.03, shadow=.25)
    p.ink([(24, 50), (72, 50)], w=1.4, color="#7a6c8c", alpha=.45)
    p.ink([(47, 34), (49, 66)], w=1.4, color="#7a6c8c", alpha=.35)
    p.paint(E(36, 40, 16, 6), "#ffffff", .25, blur=3)
    p.part(E(48, 50, 3.4), CLOTH_V, prof="sphere", gloss=.3, shadow=.3)


def whetstone(p):
    p.part(P([(6, 62), (60, 38), (92, 50), (38, 78)]), WOOD, bevel=5, gloss=.2)
    p.part(P([(14, 56), (60, 35), (86, 46), (40, 68)]), SLATE, bevel=6, gloss=.35)
    p.ink([(26, 54), (60, 38)], w=1.4, color="#a6a1ad", alpha=.4)
    # a blade laid across it
    p.part(P([(26, 26), (80, 16), (86, 20), (30, 34)]), "silver", bevel=2.5, shadow=.5)
    p.part(R(6, 26, 30, 38, 3), WOOD, bevel=3.5, gloss=.3)
    spark(p, 64, 20, 2.8)


def forge_candle(p):
    candle(p, lit=True, holder=True)


def teacup(p):
    p.part(E(48, 72, 36, 10), CREAM, prof="round", bevel=4, gloss=.4)
    p.ink(arc_pts(48, 72, 30, 7.5, 0, 180, 30), w=1.2, color="#8a6a3a", alpha=.6)
    p.part(L(arc_pts(72, 46, 10, 11, -80, 90, 20), 5), CREAM, bevel=2.5, gloss=.3)
    p.part(P([(20, 34), (76, 34), (70, 60), (60, 70), (36, 70), (26, 60)]), CREAM, bevel=8, gloss=.45, power=30)
    p.part(E(48, 35, 28, 7), ("#2b1409", "#6e3a1a", "#b0703c"), prof="flat", gloss=.6)
    p.ink([(28, 48), (68, 48)], w=1.8, color="#6b3fae", alpha=.8)
    for x in (34, 42, 50, 58):
        p.paint(E(x, 54, 1.6), "#9b2a3c", .8)
    for x, y0 in ((40, 26), (52, 22)):
        p.ink([(x, y0), (x - 3, y0 - 6), (x + 1, y0 - 12), (x - 2, y0 - 18)], w=1.4, color="#e8e0f0", alpha=.45, over=False)


def mend(p):
    # a roll of bandage, its end unwound and a safety pin through it
    p.part(P([(40, 60), (88, 52), (90, 66), (44, 76)]), LINEN, prof="flat", gloss=.05)
    for x in (54, 66, 78):
        p.ink([(x, 56), (x + 2, 72)], w=1.0, color="#9a92a4", alpha=.5)
    p.part(E(34, 52, 26, 24), LINEN, prof="round", bevel=8, gloss=.1)
    p.part(E(34, 52, 10, 9), ("#2a2230", "#8a8294", "#d8d2e0"), prof="recess", bevel=3, shadow=0)
    p.ink(arc_pts(34, 52, 18, 16, 0, 360, 40), w=1.2, color="#9a92a4", alpha=.5)
    p.part(L([(58, 62), (80, 58)], 2.4), "silver", bevel=1.2, shadow=.3)
    p.part(L(arc_pts(80, 62, 4, 4, -90, 90, 10), 2.4), "silver", bevel=1.2, shadow=.3)
    p.paint(E(24, 30, 10, 6), "#9b2a3c", .0)


def clone(p):
    # two Trick cards, the second traced from the first
    p.part(RR(18, 14, 62, 76, -10), ("#170c22", "#5a3a86", "#b294e0"), bevel=3, gloss=.3)
    p.part(RR(22, 18, 58, 72, -10), "brass", prof="flat", shadow=0, erode=1.5)
    p.part(RR(25, 21, 55, 69, -10), ("#170c22", "#4a2d6a", "#8c67bd"), prof="flat", shadow=0)
    p.part(RR(36, 22, 80, 84, 8), CREAM, prof="flat", gloss=.05)
    for i, y in enumerate((36, 46, 56, 66)):
        p.ink(rot([(44, y), (72, y)], 8, (58, 53)), w=1.4, color="#6a5a40", alpha=.55 if i else .8)
    p.ink(rot([(40, 26), (76, 26), (76, 80), (40, 80)], 8, (58, 53)) + rot([(40, 26)], 8, (58, 53)), w=1.0,
          color="#6b3fae", alpha=.6)
    p.part(L([(66, 88), (86, 64)], 4), WOOD, bevel=2)
    p.part(P([(86, 64), (92, 56), (89, 66)]), IRON, bevel=1.2)


def candle(p, lit=True, holder=True, stub=False):
    top = 44 if stub else 34
    if holder:
        p.part(E(48, 82, 30, 8), "brass", bevel=4)
        p.part(E(48, 78, 18, 5), "brass", bevel=2, shadow=.4)
    p.part(P([(36, top), (60, top), (60, 80), (36, 80)]), WAX, bevel=5, gloss=.25)
    p.part(E(48, top, 12, 3.6), ("#8a7c62", "#efe4c8", "#fffaec"), prof="flat", gloss=.2, shadow=0)
    p.part(P([(56, top), (62, top + 2), (61, top + 16), (58, top + 14)]), WAX, bevel=2, gloss=.3, shadow=.3)
    p.part(E(40, top + 12, 3, 5), WAX, prof="sphere", gloss=.3, shadow=.3)
    p.ink([(48, top - 1), (48, top - 6)], w=1.5, alpha=1, over=False)
    if lit:
        p.glow(48, top - 14, 16, FLAME, .45)
        p.part(P([(48, top - 28), (53, top - 15), (51, top - 8), (45, top - 8), (43, top - 15)]),
               ("#ff7a1a", "#ffc766", "#fff7dc"), prof="sphere", gloss=0, shadow=0, ink=.25)
        p.paint(E(48, top - 11, 2.2, 3.4), "#fffbe8", .95)
        p.paint(E(48, top + 4, 10, 6), "#ffcf87", .35, blur=2)
    else:
        p.paint(E(48, top - 6, 1.6, 1.2), "#40281a", .9, over=False)


def candle_unlit(p):
    candle(p, lit=False, holder=True, stub=True)


def candle_lit(p):
    candle(p, lit=True, holder=True, stub=True)


# ── Keepsakes ─────────────────────────────────────────────────────────────────
def torch(p):
    # a pocket flashlight on the slant, its beam on
    p.glow(82, 22, 16, "#ffe9a8", .4)
    p.part(RR(14, 40, 66, 58, -32), ("#2a0f16", "#7a1f33", "#d0697c"), bevel=7, gloss=.6)
    p.part(RR(60, 34, 80, 64, -32), "silver", bevel=6)
    cx, cy = rot([(81, 49)], -32)[0]
    p.part(E(cx, cy, 7, 12), ("#8a7a4a", "#fff3c0", "#ffffff"), prof="sphere", gloss=.6, shadow=0)
    p.part(RR(34, 42, 42, 56, -32), "silver", bevel=2.5, shadow=.3)
    p.ink(rot([(20, 43), (56, 43)], -32), w=1.4, color="#ffffff", alpha=.35)


def battery(p):
    for dx, dy, ang in ((-12, 4, -10), (12, -2, 12)):
        c = (48 + dx, 50 + dy)
        p.part(RR(c[0] - 11, c[1] - 26, c[0] + 11, c[1] + 26, ang), ("#15131a", "#3a3542", "#8b8396"), bevel=7, gloss=.55)
        p.part(RR(c[0] - 11, c[1] - 6, c[0] + 11, c[1] + 26, ang), ("#3d2a05", "#c99a22", "#ffe28a"), bevel=7, gloss=.55, shadow=0)
        p.part(RR(c[0] - 4, c[1] - 31, c[0] + 4, c[1] - 25, ang), "silver", bevel=2)
    p.ink(rot([(58, 58), (66, 58)], 12, (60, 48)), w=1.6, color="#2a1c10", alpha=.8)


def knot(p):
    # a friendship bracelet: braided threads in a loop, two tails
    for r, c, w in ((28, "#b52a44", 6), (24, "#3f8f78", 5), (20, "#c99a22", 4)):
        pass
    pts = arc_pts(48, 44, 28, 24, 0, 360, 72)
    p.part(L(pts, 11), ("#3d0913", "#b52a44", "#ff8fa0"), bevel=4, gloss=.25)
    for i in range(0, 72, 3):
        x, y = pts[i]
        col = ("#3f8f78", "#e8c46a", "#6b3fae")[i // 3 % 3]
        p.paint(E(x, y, 2.4, 2.4), col, .9)
    p.part(L([(40, 66), (34, 84)], 4), ("#3d0913", "#b52a44", "#ff8fa0"), bevel=2)
    p.part(L([(56, 66), (62, 84)], 4), ("#0f2a24", "#3f8f78", "#a9ead3"), bevel=2)
    p.part(E(48, 66, 6, 5), ("#3d2a05", "#c99a22", "#ffe28a"), prof="sphere", gloss=.4)


def mat(p):
    coir = ("#2a1a08", "#8a6230", "#d0a664")
    p.part(P([(8, 40), (76, 28), (90, 62), (18, 80)]), coir, bevel=4, gloss=.05,
           bump=lambda xx, yy: 0.4 * ((xx.astype(int) + yy.astype(int)) % 3 == 0))
    p.part(P([(16, 42), (74, 32), (84, 60), (24, 74)]), ("#2a0a12", "#7a1f33", "#c8566a"), prof="flat", gloss=.05, shadow=0)
    p.part(P([(21, 45), (71, 36), (79, 58), (28, 69)]), coir, prof="flat", gloss=.05, shadow=0)
    p.ink([(32, 56), (64, 49)], w=3.0, color="#4b1016", alpha=.9)
    p.ink([(36, 63), (58, 58)], w=2.2, color="#4b1016", alpha=.75)
    for x, y in ((8, 40), (18, 80), (76, 28), (90, 62), (12, 60), (84, 44)):
        p.ink([(x, y), (x - 3, y + 4)], w=1.4, color="#6e4a1c", alpha=.9, over=False)


def slipper(p):
    p.part(P([(10, 62), (24, 48), (46, 44), (80, 50), (88, 60), (82, 70), (18, 72)]), ("#1a0c22", "#4a2d6a", "#9c7fcf"), bevel=6, gloss=.2)
    p.part(P([(46, 44), (80, 50), (88, 60), (70, 62), (48, 56)]), ("#2a0a12", "#7a1f33", "#c8566a"), bevel=6, gloss=.25)
    p.part(P([(12, 70), (86, 66), (84, 74), (14, 76)]), CREAM, bevel=2, gloss=.1)
    p.part(E(70, 48, 7, 6), LINEN, prof="pillow", bevel=4)


def bell(p):
    p.part(E(48, 76, 36, 9), "brass", bevel=4)
    p.part(P([(24, 72), (28, 52), (36, 38), (48, 34), (60, 38), (68, 52), (72, 72)]), "brass", bevel=10)
    p.part(R(45, 22, 51, 36, 2), "brass", bevel=2, shadow=.4)
    p.part(E(48, 21, 5), "brass", prof="sphere", shadow=.4)
    spark(p, 38, 46, 3)


def ball(p):
    p.part(E(48, 50, 32), ("#3c4210", "#b6c233", "#f0f6a4"), prof="sphere", gloss=.12,
           bump=lambda xx, yy: 0.5 * ((xx.astype(int) * 7 + yy.astype(int) * 3) % 5 == 0))
    p.ink(arc_pts(20, 50, 22, 30, -60, 60, 24), w=2.4, color="#f7f6e4", alpha=.95)
    p.ink(arc_pts(76, 50, 22, 30, 120, 240, 24), w=2.4, color="#f7f6e4", alpha=.95)
    for x, y in ((60, 30), (66, 36), (58, 40), (70, 44)):
        p.paint(E(x, y, 2.2, 1.4), "#2f3208", .7)


def jar(p):
    p.part(P([(26, 30), (70, 30), (74, 40), (74, 82), (22, 82), (22, 40)]), GLASS, bevel=8, gloss=.8, power=40)
    p.part(R(26, 18, 70, 30, 3), "brass", bevel=3)
    p.ink([(28, 24), (68, 24)], w=1.2, alpha=.4)
    for x, y in ((38, 50), (56, 44), (48, 64), (62, 70), (34, 72), (52, 56)):
        p.glow(x, y, 4.2, "#e9ff7a", .55)
        p.paint(E(x, y, 1.8), "#fbffd0", 1)
    p.paint(R(26, 36, 32, 78, 3), "#ffffff", .35, blur=1)


def net(p):
    p.part(L([(12, 88), (50, 46)], 8), WOOD, bevel=4, gloss=.3)
    p.part(P(arc_pts(60, 34, 24, 22, 0, 360, 36)), ("#302a36", "#8c8497", "#e2dcea"), prof="flat", gloss=0, shadow=.3)
    for i in range(-3, 4):
        p.ink([(44 + i * 7, 12), (52 + i * 7, 56)], w=1.2, color="#3b3444", alpha=.7)
        p.ink([(36, 34 + i * 7), (84, 29 + i * 7)], w=1.2, color="#3b3444", alpha=.7)
    p.part(L(arc_pts(60, 34, 24, 22, 0, 360, 48), 5), "brass", bevel=2.5, shadow=.4)


def hand(p):
    pts = [(30, 86), (32, 58), (22, 44), (18, 30), (24, 26), (32, 38), (34, 18), (40, 14), (44, 18), (46, 34),
           (50, 12), (57, 12), (58, 34), (64, 20), (70, 22), (68, 44), (74, 38), (80, 42), (70, 60), (64, 86)]
    p.part(P(pts), ("#1d4a12", "#5fb832", "#c5f59a"), prof="pillow", bevel=8, gloss=.9, power=36)
    p.part(L([(46, 86), (52, 94)], 4), ("#1d4a12", "#5fb832", "#c5f59a"), bevel=2, gloss=.6)
    spark(p, 40, 34, 2.6)
    spark(p, 56, 26, 2.0)


def button(p):
    p.part(E(48, 50, 34), "brass", bevel=9)
    p.ink(arc_pts(48, 50, 25, 25, 0, 360, 60), w=1.4, alpha=.6)
    for hx, hy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        p.part(E(48 + hx * 8, 50 + hy * 8, 4.2), ("#050302", "#1e1408", "#3d2a14"), prof="recess", bevel=2, shadow=0)
    p.ink([(40, 42), (56, 58)], w=1.8, color="#7a1f33", alpha=.9)
    p.ink([(56, 42), (40, 58)], w=1.8, color="#7a1f33", alpha=.9)


def chalk(p):
    p.part(P(rot([(16, 40), (68, 40), (80, 48), (68, 58), (16, 58)], -30)), CHALK, bevel=6, gloss=.08)
    p.paint(E(*rot([(17, 49)], -30)[0], 6, 8), "#fbf7ee", .8)
    p.ink(rot([(28, 43), (56, 43)], -30), w=1.2, color="#b8b1a2", alpha=.5)
    for x, y in ((62, 80), (70, 76), (78, 82), (54, 78), (84, 74)):
        p.paint(E(x, y, 1.8), "#efe9dc", .8, over=False)
    p.paint(E(70, 80, 16, 3), "#e8e2d4", .3, blur=2.0, over=False)


def thermos(p):
    p.part(R(28, 26, 68, 88, 8), ("#0f2a24", "#2f6f5e", "#8fd2b8"), bevel=9, gloss=.5)
    p.part(R(26, 12, 70, 28, 4), "silver", bevel=4)
    p.part(R(28, 46, 68, 52, 1), "silver", bevel=2, shadow=.3)
    p.part(R(28, 76, 68, 82, 1), "silver", bevel=2, shadow=.3)
    p.part(L([(68, 36), (80, 40), (80, 66), (68, 70)], 4), IRON, bevel=2)
    for x, y0 in ((42, 8), (52, 4)):
        p.ink([(x, y0), (x - 3, y0 - 4), (x + 1, y0 - 8)], w=1.4, color="#e8e0f0", alpha=.5, over=False)


def mouse(p):
    p.part(P([(14, 70), (22, 50), (40, 38), (62, 38), (80, 52), (86, 70)]), SLATE, prof="pillow", bevel=12, gloss=.25)
    p.part(E(30, 42, 8), ROSE, prof="sphere", gloss=.2)
    p.part(E(30, 42, 10), SLATE, prof="round", bevel=3, shadow=.2, cut=E(30, 42, 6))
    p.part(E(16, 66, 3), ("#1a0a10", "#6a2034", "#d06080"), prof="sphere", gloss=.4)
    p.paint(E(24, 58, 2.2), "#08070a", 1)
    spark(p, 23.4, 57.2, 1.0)
    p.part(L([(84, 66), (92, 56), (86, 46)], 2.4), ROSE, bevel=1.2)
    # the wind-up key in its back
    p.part(R(52, 26, 56, 40, 1), "brass", bevel=1.5)
    p.part(E(46, 22, 7, 5), "brass", bevel=2.5, cut=E(46, 22, 3, 2))
    p.part(E(62, 22, 7, 5), "brass", bevel=2.5, cut=E(62, 22, 3, 2))


def monocle(p):
    p.part(E(44, 44, 28), "brass", bevel=5, cut=E(44, 44, 22))
    p.part(E(44, 44, 22), GLASS, prof="sphere", gloss=.9, power=40, shadow=0)
    p.ink([(30, 30), (44, 46), (38, 58)], w=1.2, color="#e6eef6", alpha=.7)
    p.ink([(44, 46), (58, 40)], w=1.2, color="#e6eef6", alpha=.6)
    p.part(L([(66, 60), (72, 72), (70, 84), (80, 90)], 2.4), "brass", bevel=1.2)
    spark(p, 34, 34, 3)


def nightlight(p):
    p.glow(48, 44, 22, "#b9d2ff", .35)
    p.part(P(arc_pts(48, 46, 30, 30, 0, 360, 48)), ("#27365a", "#8fb2ec", "#eef4ff"), prof="sphere", gloss=.6,
           cut=E(62, 36, 24))
    p.part(R(34, 76, 62, 88, 3), "silver", bevel=3)
    p.part(R(40, 70, 56, 78, 2), "silver", bevel=2)
    for x, y in ((66, 18), (80, 30), (74, 58)):
        p.paint(E(x, y, 1.6), "#eef4ff", .9, over=False)


def quill(p):
    # a slipper bristling with porcupine quills
    for i in range(7):
        x = 22 + i * 9
        p.part(L([(x, 58), (x - 6 + i, 22 + (i % 3) * 5)], 2.6), ("#1f1209", "#b6a07e", "#fff3d8"), bevel=1.2, shadow=.3)
        p.paint(E(x - 6 + i, 22 + (i % 3) * 5, 1.5), "#2a1a0c", .9)
    p.part(P([(10, 66), (24, 54), (46, 50), (80, 56), (88, 66), (82, 76), (18, 78)]), BROWN, bevel=6, gloss=.2)
    p.part(P([(12, 76), (86, 72), (84, 80), (14, 82)]), CREAM, bevel=2, gloss=.1)


def ticket(p):
    pts = rot([(12, 30), (84, 30), (84, 42), (79, 48), (84, 54), (84, 66), (12, 66), (12, 54), (17, 48), (12, 42)], -12)
    p.part(P(pts), PAPER, prof="flat", gloss=.05)
    for i in range(8):
        p.paint(E(*rot([(34, 33 + i * 4.3)], -12)[0], 1.2), "#2a1c10", .9)
    p.paint(P(rot([(40, 35), (78, 35), (78, 41), (40, 41)], -12)), "#8a2433", .9)
    p.ink(rot([(42, 48), (74, 48)], -12), w=3.0, color="#3b2615", alpha=.85)
    p.ink(rot([(42, 57), (64, 57)], -12), w=2.0, color="#3b2615", alpha=.6)
    p.paint(E(*rot([(23, 48)], -12)[0], 6.5), "#8a2433", .85)
    p.paint(E(*rot([(23, 48)], -12)[0], 3.2), "#f4e6c2", .9)


def key(p):
    p.part(E(28, 34, 18), "brass", bevel=5, cut=E(28, 34, 8))
    p.part(RR(38, 42, 86, 50, 35, (38, 46)), "brass", bevel=4)
    kx, ky = rot([(80, 46)], 35, (38, 46))[0]
    p.part(RR(kx - 4, ky - 2, kx + 6, ky + 10, 35), "brass", bevel=2.5, shadow=.3)
    kx, ky = rot([(70, 46)], 35, (38, 46))[0]
    p.part(RR(kx - 3, ky - 2, kx + 4, ky + 8, 35), "brass", bevel=2.5, shadow=.3)
    p.ink(arc_pts(28, 34, 13, 13, 180, 300, 16), w=1.2, color="#fff0c8", alpha=.5)


def knot2(p):
    # a knotted handkerchief: a square of cloth gathered into a knot
    p.part(P([(18, 84), (26, 52), (48, 44), (70, 52), (80, 84), (48, 90)]), LINEN, prof="pillow", bevel=10, gloss=.1)
    p.part(P([(28, 50), (18, 24), (38, 34), (48, 44)]), LINEN, prof="pillow", bevel=5, gloss=.1)
    p.part(P([(68, 50), (80, 22), (60, 34), (48, 44)]), LINEN, prof="pillow", bevel=5, gloss=.1)
    p.part(E(48, 46, 11, 9), LINEN, prof="pillow", bevel=6, gloss=.1)
    for y in (60, 70, 80):
        p.ink([(26, y), (72, y)], w=1.4, color="#3f5aa0", alpha=.6)
    for x in (36, 48, 60):
        p.ink([(x, 54), (x + (x - 48) * .3, 86)], w=1.4, color="#3f5aa0", alpha=.6)
    p.ink([(40, 44), (48, 52), (56, 44)], w=1.2, color="#8a8494", alpha=.6)


def tin(p):
    p.part(R(10, 34, 86, 72, 14), "silver", bevel=6)
    p.part(R(16, 38, 80, 68, 10), ("#1a1e3a", "#3b4b8a", "#8ea2e0"), bevel=4, gloss=.4, shadow=.3)
    for i, y in enumerate((46, 54, 62)):
        p.part(P([(26, y), (62, y - 3), (72, y), (62, y + 3)]), "silver", bevel=2, shadow=.3)
        p.paint(E(66, y, 1.2), "#0b0b10", .9)
    p.part(L([(80, 40), (92, 30)], 3), "silver", bevel=1.5)
    p.part(E(92, 28, 4.5, 4.5), "silver", bevel=1.5, cut=E(92, 28, 2))


def charm(p):
    # a cat's-head charm on a ring, a 9 struck on it
    p.part(L(arc_pts(48, 16, 8, 8, 0, 360, 24), 3), "silver", bevel=1.5)
    head = [(20, 40), (22, 22), (36, 32), (60, 32), (74, 22), (76, 40), (78, 58), (66, 78), (48, 84), (30, 78), (18, 58)]
    p.part(P(head), "brass", bevel=8)
    p.paint(E(38, 52, 4, 5), "#0f2a24", .95)
    p.paint(E(58, 52, 4, 5), "#0f2a24", .95)
    p.paint(E(38, 52, 1.4, 4), "#050302", 1)
    p.paint(E(58, 52, 1.4, 4), "#050302", 1)
    p.ink([(44, 64), (48, 67), (52, 64)], w=1.6, alpha=.8)
    p.ink(arc_pts(48, 72, 4, 4, 180, 540, 20), w=1.4, alpha=.6)


def bag(p):
    p.part(P([(16, 44), (80, 44), (86, 86), (10, 86)]), LEATHER, bevel=8, gloss=.3)
    p.part(L(arc_pts(48, 44, 22, 22, 180, 360, 24), 5), LEATHER, bevel=2.5)
    p.part(P([(14, 44), (82, 44), (78, 58), (18, 58)]), ("#1f0e08", "#4e2818", "#8a5234"), bevel=4, gloss=.3)
    p.part(R(42, 52, 54, 64, 2), "brass", bevel=3)
    p.ink([(18, 70), (78, 70)], w=1.2, color="#c9a06a", alpha=.35)


def watch(p):
    p.part(L(arc_pts(48, 12, 7, 7, 0, 360, 24), 3), "brass", bevel=1.5)
    p.part(R(44, 16, 52, 24, 2), "brass", bevel=2)
    p.part(E(48, 54, 32), "brass", bevel=6)
    p.part(E(48, 54, 25), CREAM, prof="round", bevel=3, gloss=.3, shadow=.4)
    for i in range(12):
        a = math.radians(i * 30)
        p.paint(E(48 + 20 * math.cos(a), 54 + 20 * math.sin(a), 1.4), "#2a1c10", .9)
    p.ink([(48, 54), (48, 38)], w=2.0, alpha=.95)
    p.ink([(48, 54), (58, 60)], w=1.6, alpha=.95)
    p.ink([(34, 42), (46, 58), (62, 50)], w=1.0, color="#6a6070", alpha=.6)
    spark(p, 34, 36, 2.6)


def quilt(p):
    p.part(P([(10, 30), (82, 22), (88, 74), (14, 82)]), VELVET, prof="pillow", bevel=10, gloss=.12)
    cols = ("#7a1f33", "#3f5aa0", "#c99a22", "#3f8f78", "#6b3fae", "#a33a58")
    for i in range(3):
        for j in range(3):
            if (i + j) % 2:
                x0, y0 = 22 + i * 18, 32 + j * 15
                p.paint(P([(x0, y0), (x0 + 17, y0 - 2), (x0 + 18, y0 + 13), (x0 + 1, y0 + 15)]), cols[(i * 3 + j) % 6], .75)
    for t in (0.33, 0.66):
        p.ink([(10 + 72 * t, 30 - 8 * t), (14 + 74 * t, 82 - 8 * t)], w=1.2, color="#e8dcc8", alpha=.5)
        p.ink([(10 + 4 * t, 30 + 52 * t), (82 + 6 * t, 22 + 52 * t)], w=1.2, color="#e8dcc8", alpha=.5)
    for x, y in ((66, 12), (76, 16), (70, 8)):
        p.part(E(x, y, 3.2), LINEN, prof="sphere", gloss=.2, shadow=0)


def cage(p):
    p.part(E(48, 84, 30, 6), "brass", bevel=3)
    for i in range(9):
        x = 22 + i * 6.5
        top = 20 + abs(x - 48) * .55
        p.part(L([(x, 84), (x, top + 10), (48 + (x - 48) * .3, top)], 1.8), "brass", bevel=1, shadow=.25)
    p.part(L(arc_pts(48, 44, 27, 30, 180, 360, 30), 2.6), "brass", bevel=1.4)
    p.part(L([(21, 64), (75, 64)], 2.4), "brass", bevel=1.2)
    p.part(L(arc_pts(48, 10, 5, 5, 0, 360, 20), 2.4), "brass", bevel=1.2)
    p.part(L([(30, 70), (66, 70)], 2.4), WOOD, bevel=1.2)


def shadow(p):
    # a black cat, sitting, seen from behind, tail curled
    body = [(30, 86), (26, 64), (32, 46), (38, 36), (34, 18), (42, 26), (54, 26), (62, 18), (60, 36), (66, 46),
            (72, 64), (68, 86)]
    p.part(P(body), FUR, prof="pillow", bevel=12, gloss=.3)
    p.part(L([(66, 84), (80, 80), (86, 68), (82, 56)], 6), FUR, bevel=3, gloss=.3)
    p.paint(E(42, 36, 3.4, 2.6), "#d8f06a", 1)
    p.paint(E(56, 36, 3.4, 2.6), "#d8f06a", 1)
    p.paint(E(42, 36, 1, 2.4), "#050405", 1)
    p.paint(E(56, 36, 1, 2.4), "#050405", 1)
    p.ink([(40, 60), (44, 74)], w=1.2, color="#5a5466", alpha=.4)


def collar(p):
    p.part(L(arc_pts(48, 44, 32, 24, 0, 360, 72), 10), ("#2a0a12", "#8a2433", "#d86a7c"), bevel=4, gloss=.35)
    for a in range(0, 360, 30):
        x = 48 + 32 * math.cos(math.radians(a))
        y = 44 + 24 * math.sin(math.radians(a))
        p.part(E(x, y, 2.4), "silver", prof="sphere", shadow=.25)
    p.part(L(arc_pts(48, 70, 5, 5, 0, 360, 20), 2.2), "brass", bevel=1)
    p.part(E(48, 84, 9), "brass", bevel=3)
    p.ink([(44, 84), (52, 84)], w=1.2, alpha=.6)


def bookmark(p):
    p.part(P([(34, 8), (62, 8), (62, 78), (48, 90), (34, 78)]), "brass", bevel=5,
           cut=P([(42, 22), (54, 22), (54, 30), (42, 30)]))
    p.ink([(38, 40), (58, 40)], w=1.2, alpha=.5)
    p.ink(arc_pts(48, 56, 8, 8, 0, 360, 24), w=1.2, alpha=.5)
    p.part(L([(48, 10), (40, 2)], 3), ("#170c22", "#5a3a86", "#b294e0"), bevel=1.2, shadow=0)


def stamp(p):
    p.part(E(48, 20, 13, 11), WOOD, prof="sphere", gloss=.5)
    p.part(R(43, 28, 53, 54, 3), WOOD, bevel=4, gloss=.4)
    p.part(R(26, 52, 70, 64, 3), "brass", bevel=3)
    p.part(R(24, 64, 72, 76, 2), ("#1a0508", "#5a1420", "#a0404e"), bevel=3, gloss=.2)
    p.part(P([(14, 86), (84, 84), (84, 92), (14, 94)]), PAPER, prof="flat", shadow=.3)
    p.ink(arc_pts(48, 89, 9, 3, 0, 360, 20), w=1.4, color="#7a1f33", alpha=.8)


def lens(p):
    p.part(E(48, 48, 34), "brass", bevel=6, cut=E(48, 48, 26))
    p.part(E(48, 48, 26), ("#101826", "#3a5a7a", "#b8d4ee"), prof="sphere", gloss=.9, power=40, shadow=0)
    p.ink([(30, 34), (46, 50), (40, 66)], w=1.4, color="#eef6ff", alpha=.75)
    p.ink([(46, 50), (66, 42)], w=1.2, color="#eef6ff", alpha=.65)
    p.ink([(46, 50), (58, 66)], w=1.0, color="#eef6ff", alpha=.5)
    spark(p, 36, 36, 3.2)


def orrery(p):
    p.part(E(48, 84, 20, 6), "brass", bevel=3)
    p.part(R(46, 56, 50, 82, 1), "brass", bevel=1.5)
    p.part(L(arc_pts(48, 44, 34, 12, 0, 360, 60), 2.2), "brass", bevel=1)
    p.part(E(48, 44, 11), ("#5a2604", "#f09a2a", "#ffe6a0"), prof="sphere", gloss=.5)
    p.part(E(16, 42, 5), BLUE, prof="sphere", gloss=.5)
    p.part(E(74, 52, 6), ROSE, prof="sphere", gloss=.5)
    p.part(L(arc_pts(48, 44, 34, 12, 20, 160, 30), 2.2), "brass", bevel=1, shadow=.25)
    p.part(E(62, 30, 3.6), SAGE, prof="sphere", gloss=.5)


def smokedglass(p):
    p.part(E(48, 48, 34, 30), ("#050407", "#221c28", "#6a6070"), prof="sphere", gloss=.9, power=40)
    p.part(L(arc_pts(48, 48, 34, 30, 0, 360, 60), 3.2), "brass", bevel=1.6)
    p.paint(E(40, 38, 16, 10), "#8a8094", .3, blur=3)
    p.ink([(34, 70), (70, 30)], w=1.2, color="#8a8094", alpha=.4)
    spark(p, 34, 34, 3.2)
    p.glow(66, 60, 8, "#ffb35c", .25)


def trimmer(p):
    # brass wick-trimmer scissors, a box on one blade
    p.part(E(28, 70, 11), "brass", bevel=3, cut=E(28, 70, 6))
    p.part(E(46, 80, 11), "brass", bevel=3, cut=E(46, 80, 6))
    p.part(L([(34, 64), (78, 18)], 4.5), "brass", bevel=2)
    p.part(L([(48, 70), (76, 30), (84, 14)], 4.5), "brass", bevel=2)
    p.part(R(66, 22, 84, 36, 2), "brass", bevel=3)
    p.part(E(52, 50, 3), "brass", prof="sphere", shadow=.3)


def dancecard(p):
    p.part(R(22, 12, 74, 84, 4), "silver", bevel=4)
    p.part(R(28, 18, 68, 78, 2), CREAM, prof="flat", shadow=.3)
    for i, y in enumerate(range(28, 76, 8)):
        p.ink([(32, y), (64, y)], w=1.2, color="#8a7a60", alpha=.55)
        if i % 2 == 0:
            p.ink([(34, y - 2), (46, y - 3), (52, y - 1)], w=1.4, color="#3d2352", alpha=.8)
    p.part(L([(74, 20), (88, 10)], 2.2), ROSE, bevel=1, shadow=0)
    p.part(P([(84, 10), (92, 6), (90, 16)]), ROSE, bevel=1.5)


def goblet(p):
    p.part(E(48, 86, 22, 6), "silver", bevel=3)
    p.part(P([(44, 56), (52, 56), (54, 84), (42, 84)]), "silver", bevel=3)
    p.part(E(48, 56, 6, 4), "silver", prof="sphere")
    p.part(P([(20, 14), (76, 14), (72, 36), (60, 52), (36, 52), (24, 36)]), "silver", bevel=9)
    p.part(E(48, 15, 27, 5), ("#050307", "#1b1320", "#4a3c55"), prof="flat", shadow=0)
    p.part(E(48, 34, 5, 6), ("#1a0508", "#8a2433", "#ff8fa0"), prof="sphere", gloss=.7)
    spark(p, 32, 26, 2.6)


def rib(p):
    # one big curved rib bone, knuckled at both ends
    pts = arc_pts(64, 74, 46, 56, 188, 262, 30)
    p.part(L(pts, 15), BONE, bevel=6, gloss=.2)
    x0, y0 = pts[0]
    x1, y1 = pts[-1]
    p.part(E(x0 - 2, y0 - 6, 10, 9), BONE, prof="sphere", gloss=.2)
    p.part(E(x0 + 6, y0 + 4, 9, 8), BONE, prof="sphere", gloss=.2)
    p.part(E(x1 + 4, y1 - 2, 9, 8), BONE, prof="sphere", gloss=.2, shadow=.3)
    p.ink(arc_pts(64, 74, 42, 52, 196, 254, 24), w=1.4, color="#8a7c64", alpha=.55)


def crooked(p):
    pts = [(20, 78), (34, 60), (40, 46), (56, 40), (70, 22)]
    p.part(L(pts, 10), BONE, bevel=4, gloss=.2)
    for x, y in ((20, 78), (70, 22)):
        p.part(E(x - 5, y - 2, 7), BONE, prof="sphere", gloss=.2)
        p.part(E(x + 3, y + 5, 7), BONE, prof="sphere", gloss=.2)
    p.ink([(36, 58), (42, 50)], w=1.0, color="#8a7c64", alpha=.5)


def brush(p):
    p.part(R(14, 42, 82, 60, 8), WOOD, bevel=6, gloss=.4)
    for i in range(12):
        x = 20 + i * 5.2
        p.part(L([(x, 60), (x + (i % 3 - 1), 80)], 2.4), ("#1f1209", "#3a2a1a", "#7a6044"), bevel=1, shadow=.2)
    p.part(R(14, 42, 82, 60, 8), WOOD, bevel=6, gloss=.4, shadow=.4)
    p.part(E(48, 51, 7, 5), "brass", bevel=2)


def fork(p):
    p.part(L([(14, 90), (42, 48)], 9), WOOD, bevel=4, gloss=.3)
    p.part(RR(36, 38, 52, 50, -32), IRON, bevel=3)
    for i, dx in enumerate((-10, -3.5, 3.5, 10)):
        bend = 10 if i == 1 else 0
        p.part(L([(46 + dx, 40), (54 + dx * 1.2, 24), (60 + dx * 1.3 + bend, 8)], 4.4), IRON, bevel=2, shadow=.25)
    p.part(L([(32, 44), (62, 38)], 6), IRON, bevel=3)


def duck(p):
    p.part(E(46, 64, 32, 20), YELLOW, prof="pillow", bevel=14, gloss=.5)
    p.part(P([(72, 56), (86, 48), (82, 62)]), YELLOW, bevel=5, gloss=.4)
    p.part(E(38, 34, 16), YELLOW, prof="sphere", gloss=.5)
    p.part(P([(20, 36), (8, 38), (20, 44)]), ("#5a1f04", "#e8702a", "#ffc08a"), bevel=3, gloss=.4)
    p.paint(E(34, 30, 2.4), "#150c05", 1)
    spark(p, 33.3, 29.3, .9)
    p.ink([(40, 62), (58, 58), (66, 66)], w=1.4, color="#8a6210", alpha=.5)


def tag(p):
    p.part(L(arc_pts(48, 16, 9, 9, 0, 360, 24), 2.4), "silver", bevel=1.2)
    p.part(P([(26, 30), (70, 30), (78, 44), (78, 72), (66, 86), (30, 86), (18, 72), (18, 44)]), "silver", bevel=5,
           cut=E(48, 36, 4))
    for y, w in ((52, 22), (62, 30), (72, 18)):
        p.ink([(48 - w / 2, y), (48 + w / 2, y)], w=2.0, color="#23242c", alpha=.7)


def frog(p):
    p.part(E(48, 58, 34, 22), ("#10250c", "#3f7a2b", "#9ed070"), prof="pillow", bevel=14, gloss=.45)
    p.part(E(32, 38, 10), ("#10250c", "#3f7a2b", "#9ed070"), prof="sphere", gloss=.5)
    p.part(E(64, 38, 10), ("#10250c", "#3f7a2b", "#9ed070"), prof="sphere", gloss=.5)
    for x in (32, 64):
        p.paint(E(x, 38, 5), "#f4e48a", 1)
        p.paint(E(x, 38, 2.4, 4), "#0a0a06", 1)
    p.ink(arc_pts(48, 58, 16, 8, 20, 160, 20), w=1.6, alpha=.8)
    p.part(L(arc_pts(48, 12, 7, 7, 0, 360, 24), 2.4), "brass", bevel=1.2)
    p.part(L([(48, 19), (48, 30)], 2.2), "brass", bevel=1)


def sickle(p):
    p.part(P(arc_pts(52, 42, 32, 30, 170, 392, 40) + arc_pts(56, 46, 22, 20, 392, 170, 40)), "silver", bevel=3)
    p.part(L([(22, 50), (28, 90)], 9), WOOD, bevel=4, gloss=.3)
    p.part(R(19, 48, 31, 56, 2), "brass", bevel=2.5)


def leash(p):
    pts = arc_pts(46, 46, 34, 30, 200, 520, 70)
    p.part(L(pts, 10), ("#2a0a12", "#8a2433", "#d86a7c"), bevel=4, gloss=.3)
    for i in range(0, 70, 5):
        x, y = pts[i]
        p.paint(E(x, y, 1.3), "#e0a0aa", .7)
    p.part(L(arc_pts(46, 46, 34, 30, 200, 250, 16), 10), ("#2a0a12", "#8a2433", "#d86a7c"), bevel=4, gloss=.3, shadow=.35)
    x, y = pts[-1]
    p.part(R(x - 6, y - 5, x + 8, y + 5, 2), "silver", bevel=2.5)
    p.part(L(arc_pts(x + 8, y + 12, 8, 8, 0, 360, 24), 3.6), "silver", bevel=1.8)


def slippers(p):
    # a pair of bathhouse slippers, one behind the other: a sole, a strap
    for dx, dy, c in ((-8, -12, ("#1e2a33", "#5f7f93", "#c4dcea")), (8, 10, ("#16222b", "#4f6f83", "#b4ccda"))):
        p.part(P([(10 + dx, 56 + dy), (18 + dx, 46 + dy), (70 + dx, 44 + dy), (86 + dx, 50 + dy), (86 + dx, 58 + dy),
                  (70 + dx, 64 + dy), (18 + dx, 64 + dy)]), CREAM, bevel=4, gloss=.1)
        p.part(P([(40 + dx, 40 + dy), (66 + dx, 38 + dy), (72 + dx, 52 + dy), (38 + dx, 56 + dy)]), c, prof="pillow",
               bevel=6, gloss=.2, shadow=.4)
        p.ink([(44 + dx, 44 + dy), (68 + dx, 42 + dy)], w=1.2, color="#e6f0f6", alpha=.4)


def ribbon(p):
    p.part(P([(46, 46), (18, 26), (12, 44), (20, 62)]), ("#050407", "#1c1820", "#5a5068"), prof="pillow", bevel=6, gloss=.7)
    p.part(P([(50, 46), (78, 26), (84, 44), (76, 62)]), ("#050407", "#1c1820", "#5a5068"), prof="pillow", bevel=6, gloss=.7)
    p.part(P([(44, 50), (30, 88), (38, 84), (42, 90), (50, 54)]), ("#050407", "#1c1820", "#5a5068"), bevel=4, gloss=.7)
    p.part(P([(52, 50), (66, 88), (58, 84), (54, 90), (46, 54)]), ("#050407", "#1c1820", "#5a5068"), bevel=4, gloss=.7)
    p.part(E(48, 47, 8, 8), ("#050407", "#1c1820", "#5a5068"), prof="pillow", bevel=4, gloss=.8)


def glove(p):
    pts = [(30, 88), (28, 60), (18, 46), (16, 36), (22, 34), (32, 46), (32, 20), (38, 16), (43, 20), (44, 40),
           (47, 14), (53, 12), (57, 16), (56, 40), (60, 18), (66, 18), (68, 24), (66, 46), (72, 34), (78, 36),
           (76, 50), (66, 70), (66, 88)]
    p.part(P(pts), LINEN, prof="pillow", bevel=8, gloss=.15)
    p.part(R(28, 80, 68, 90, 3), LINEN, bevel=3, gloss=.1, shadow=.3)
    for x in (38, 48, 58):
        p.ink([(x, 58), (x, 68)], w=1.2, color="#8a8494", alpha=.5)


def handbell(p):
    p.part(R(44, 8, 52, 34, 3), WOOD, bevel=3, gloss=.4)
    p.part(E(48, 8, 6), WOOD, prof="sphere", gloss=.4)
    p.part(P([(22, 78), (28, 52), (36, 38), (48, 34), (60, 38), (68, 52), (74, 78)]), "brass", bevel=10)
    p.part(E(48, 78, 26, 6), "brass", bevel=3, shadow=.3)
    p.part(E(48, 86, 5), IRON, prof="sphere")
    spark(p, 38, 50, 3)


def splinter(p):
    p.part(P([(10, 86), (64, 16), (82, 8), (76, 26), (28, 90)]), WOOD, bevel=5, gloss=.2)
    p.part(P([(38, 58), (60, 28), (54, 46)]), ("#3a2412", "#9a6e40", "#d8a878"), bevel=2.5, shadow=.3)
    for t in (0.2, 0.45, 0.7):
        p.ink([(12 + 54 * t + 5, 86 - 70 * t), (12 + 54 * (t + .15) + 6, 86 - 70 * (t + .15))], w=1.4, color="#1a0e06", alpha=.6)


def wick(p):
    lantern(p, hot=True)


def ledger(p):
    p.part(P([(16, 22), (74, 16), (82, 78), (22, 86)]), WINE, bevel=5, gloss=.3)
    p.part(P([(22, 26), (72, 21), (78, 76), (26, 82)]), CREAM, prof="flat", shadow=.4)
    p.part(P([(16, 22), (26, 21), (32, 85), (22, 86)]), WINE, bevel=4, gloss=.3)
    for i in range(6):
        y = 32 + i * 8
        p.ink([(36, y), (70, y - 3)], w=1.3, color="#6a5a40", alpha=.6)
    p.part(P([(60, 16), (68, 15), (68, 34), (64, 30), (60, 34)]), ("#170c22", "#6b3fae", "#c7a5f2"), bevel=1.5, shadow=.3)
    p.part(R(24, 44, 30, 56, 1), "brass", bevel=1.5)


def buttons(p):
    def btn(cx, cy, r, mat, holes=4):
        p.part(E(cx, cy, r, r * .86), mat, bevel=r * .35, gloss=.35)
        p.ink(arc_pts(cx, cy, r * .7, r * .7 * .86, 0, 360, 30), w=1.0, alpha=.45)
        hs = [(-1, -1), (1, -1), (-1, 1), (1, 1)] if holes == 4 else [(-1, 0), (1, 0)]
        for hx, hy in hs:
            p.paint(E(cx + hx * r * .22, cy + hy * r * .2, r * .12), "#140c06", .95)
    btn(30, 62, 19, BONE)
    btn(66, 66, 17, BLACK, holes=2)
    btn(62, 32, 18, "brass")
    btn(28, 28, 14, CANDY_V, holes=2)


def lantern(p, hot=False):
    p.part(L(arc_pts(48, 14, 10, 8, 180, 360, 20), 3), IRON, bevel=1.5)
    p.part(P([(30, 22), (66, 22), (72, 30), (24, 30)]), IRON, bevel=3)
    p.glow(48, 54, 20, FLAME, .5 if hot else .38)
    p.part(R(28, 30, 68, 76, 3), ("#3a1a04", "#e89a3a", "#fff0c0"), prof="round", bevel=6, gloss=.5, power=30, shadow=0)
    p.part(P([(46, 58), (48, 42), (51, 50), (52, 58)]), ("#ff7a1a", "#ffd480", "#ffffff"), prof="sphere", ink=.2, shadow=0)
    for x in (28, 48, 68):
        p.part(R(x - 2.5, 30, x + 2.5, 76, 1), IRON, bevel=1.4, shadow=.3)
    p.part(R(24, 74, 72, 84, 2), IRON, bevel=3)


def bowl(p):
    p.part(E(48, 50, 38, 12), ("#12121a", "#4a4a5e", "#aaaabb"), prof="round", bevel=4, gloss=.5)
    p.part(P([(10, 50), (86, 50), (78, 72), (62, 82), (34, 82), (18, 72)]), ("#12121a", "#4a4a5e", "#aaaabb"), bevel=10, gloss=.5)
    p.part(E(48, 50, 33, 9), ("#060608", "#1c1c24", "#4a4a5a"), prof="recess", bevel=3, shadow=0)
    p.paint(R(30, 60, 66, 70, 2), "#ffffff", .75)
    p.ink([(34, 65), (44, 64), (52, 66), (62, 64)], w=1.6, color="#9b2a3c", alpha=.9)


def photo(p):
    p.part(RR(18, 16, 80, 84, -8), CREAM, prof="flat", gloss=.05)
    p.paint(P(rot([(24, 22), (74, 22), (74, 68), (24, 68)], -8)), "#2e2a34", 1)
    c = rot([(48, 48)], -8)[0]
    p.paint(E(c[0], c[1] + 4, 13, 12), "#0c0a10", 1)
    p.paint(P([(c[0] - 12, c[1] - 2), (c[0] - 10, c[1] - 16), (c[0] - 3, c[1] - 7)]), "#0c0a10", 1)
    p.paint(P([(c[0] + 12, c[1] - 4), (c[0] + 11, c[1] - 18), (c[0] + 3, c[1] - 8)]), "#0c0a10", 1)
    p.paint(E(c[0] - 5, c[1] + 1, 2.4, 1.8), "#d8f06a", 1)
    p.paint(E(c[0] + 5, c[1] + 0, 2.4, 1.8), "#d8f06a", 1)
    p.paint(P(rot([(24, 22), (74, 22), (74, 68), (24, 68)], -8)), "#b08a4a", .18)
    p.part(R(40, 10, 58, 18, 1), ("#6a6040", "#e8dca0", "#fffae0"), prof="flat", gloss=.1, shadow=.2)


def scratch(p):
    p.part(R(10, 14, 86, 84, 3), ("#1e1a22", "#4e4656", "#8d8497"), bevel=3, gloss=.05,
           bump=lambda xx, yy: 0)
    for x0, x1 in ((24, 30), (36, 40), (48, 50), (60, 64)):
        p.ink([(x0, 24), (x1, 74)], w=2.4, color="#0c0a10", alpha=.95)
        p.ink([(x0 + 1.6, 24), (x1 + 1.6, 74)], w=1.0, color="#c9bfd6", alpha=.55)
    p.ink([(18, 52), (74, 44)], w=2.4, color="#0c0a10", alpha=.95)
    p.ink([(18, 53.6), (74, 45.6)], w=1.0, color="#c9bfd6", alpha=.55)


def keepsake(p):
    # a locket: the default Keepsake, gilt, with a violet stone
    p.part(L(arc_pts(48, 12, 7, 7, 0, 360, 24), 2.6), "brass", bevel=1.2)
    p.part(E(48, 54, 30, 34), "brass", bevel=8)
    p.ink(arc_pts(48, 54, 22, 26, 0, 360, 40), w=1.2, alpha=.5)
    p.part(E(48, 54, 10, 12), ("#140a22", "#5a3a96", "#c3a6f2"), prof="sphere", gloss=.9, power=46)
    spark(p, 36, 36, 3)


# -- Gear (data/backpack.js `icon`, keyed gear-<icon>) --------------------------
def g_whistle(p):
    p.part(L(arc_pts(20, 30, 8, 8, 0, 360, 24), 3), "silver", bevel=1.5)
    p.part(P([(26, 38), (70, 30), (78, 44), (78, 64), (60, 74), (40, 72), (30, 58)]), "silver", bevel=7)
    p.part(E(60, 56, 14, 14), "silver", prof="sphere", shadow=.3)
    p.part(R(30, 38, 44, 48, 2), ("#020103", "#16121a", "#3a3440"), prof="recess", bevel=2, shadow=0)
    spark(p, 54, 48, 2.6)


def g_treats(p):
    p.part(P([(20, 30), (76, 26), (80, 86), (16, 88)]), ("#3a1a04", "#b86a2a", "#f0b068"), bevel=4, gloss=.15)
    p.part(P([(20, 30), (76, 26), (74, 38), (22, 42)]), ("#3a1a04", "#8a4a18", "#d08a48"), bevel=2, gloss=.1)
    p.paint(E(48, 62, 16, 12), "#f4e6c2", .9)
    for dx in (-8, 0, 8):
        p.part(E(48 + dx, 59, 3.4), BROWN, prof="sphere", shadow=.2)
    p.part(E(48, 67, 6, 4.4), BROWN, prof="sphere", shadow=.2)
    for x, y in ((80, 16), (88, 26)):
        p.part(P([(x - 7, y - 2), (x + 7, y - 2), (x + 9, y + 3), (x - 9, y + 3)]), ("#3a1a04", "#9a5a24", "#e0a060"), bevel=2, shadow=.3)


def g_camera(p):
    p.part(R(12, 32, 84, 80, 6), ("#0b0a0f", "#27232e", "#5a5466"), bevel=5, gloss=.4)
    p.part(R(26, 24, 50, 34, 2), "silver", bevel=2)
    p.part(R(12, 44, 84, 66, 1), LEATHER, prof="flat", shadow=.2)
    p.part(E(48, 56, 18), "silver", bevel=4)
    p.part(E(48, 56, 12), GLASS, prof="sphere", gloss=.9, power=40, shadow=0)
    p.part(E(72, 38, 4), ("#5a1f04", "#e8702a", "#ffc08a"), prof="sphere", gloss=.6)
    spark(p, 43, 51, 2.4)


def g_toy(p):
    # a stuffed mouse toy, a stitched seam and a string tail
    p.part(E(46, 56, 30, 22), ("#3a3040", "#9a8aa8", "#e0d4ec"), prof="pillow", bevel=14, gloss=.08)
    p.part(E(28, 36, 9), ROSE, prof="sphere", gloss=.1)
    p.part(E(44, 34, 9), ROSE, prof="sphere", gloss=.1)
    p.paint(E(24, 52, 2.6), "#0b0a0f", 1)
    p.ink([(40, 70), (48, 60), (56, 72), (64, 62)], w=1.4, color="#5a4a68", alpha=.8)
    p.part(L([(74, 62), (86, 70), (84, 84), (90, 90)], 2.4), ROSE, bevel=1.2)


def g_tag(p):
    p.part(L(arc_pts(48, 16, 9, 9, 0, 360, 24), 2.6), "brass", bevel=1.2)
    p.part(E(48, 54, 28), "brass", bevel=6, cut=E(48, 32, 3.5))
    p.ink(arc_pts(48, 54, 20, 20, 0, 360, 40), w=1.2, alpha=.5)
    p.ink([(38, 52), (58, 52)], w=2.2, color="#2a1c10", alpha=.7)
    p.ink([(40, 60), (54, 60)], w=2.0, color="#2a1c10", alpha=.6)


def g_rope(p):
    for r, w in ((32, 8), (22, 8), (12, 7)):
        pts = arc_pts(48, 52, r, r * .78, 0, 360, 60)
        p.part(L(pts, w), ("#3a2a12", "#a88a50", "#e8d09a"), bevel=3, gloss=.15)
        for i in range(0, 60, 3):
            x, y = pts[i]
            p.ink([(x - 2, y - 2.6), (x + 2, y + 2.6)], w=1.0, color="#5a4420", alpha=.6)
    p.part(L([(78, 58), (88, 80)], 7), ("#3a2a12", "#a88a50", "#e8d09a"), bevel=3, gloss=.15)


def g_chalkbox(p):
    p.part(R(14, 40, 78, 84, 3), ("#1a2433", "#3f5a7a", "#8fb0d0"), bevel=4, gloss=.2)
    p.part(P([(14, 40), (78, 40), (86, 30), (22, 30)]), ("#1a2433", "#2f4a6a", "#7fa0c0"), bevel=3, gloss=.2)
    for i, c in enumerate(("#fffbf0", "#ff9bb3", "#a9ead3", "#ffe28a")):
        x = 26 + i * 12
        p.part(RR(x - 4, 14, x + 4, 44, 10), ("#6a655c", c, "#ffffff"), bevel=3, gloss=.08, shadow=.4)
    p.part(R(14, 50, 78, 84, 3), ("#1a2433", "#3f5a7a", "#8fb0d0"), bevel=4, gloss=.2, shadow=.4)
    p.paint(R(28, 58, 64, 72, 2), "#f4e6c2", .9)
    p.ink([(32, 65), (58, 65)], w=1.6, color="#3b2615", alpha=.7)


def g_glow(p):
    for ang, c in ((-20, ("#1a4a12", "#6aff5a", "#eaffd8")), (15, ("#4a124a", "#ff5ae8", "#ffd8fa"))):
        p.glow(48, 50, 16, c[1], .22)
        p.part(RR(42, 14, 54, 86, ang, (48, 50)), c, bevel=5, gloss=.6, shadow=.3)
        x0, y0 = rot([(48, 16)], ang, (48, 50))[0]
        p.part(E(x0, y0, 6.5, 5), "silver", prof="sphere", shadow=.3)


def g_compass(p):
    p.part(E(48, 52, 34), "brass", bevel=6)
    p.part(E(48, 52, 26), CREAM, prof="round", bevel=3, gloss=.3, shadow=.4)
    p.part(P([(48, 30), (53, 52), (48, 74), (43, 52)]), ("#3a0c1c", "#c23a5a", "#ff9bb3"), bevel=2, shadow=.3)
    p.paint(P([(48, 52), (53, 52), (48, 74), (43, 52)]), "#3b4150", 1)
    p.part(E(48, 52, 3), "brass", prof="sphere", shadow=.3)
    p.part(L(arc_pts(48, 14, 6, 6, 0, 360, 20), 2.6), "brass", bevel=1.3)


def g_notebook(p):
    p.part(R(20, 12, 78, 86, 4), ("#1a0c22", "#4a2d6a", "#9c7fcf"), bevel=5, gloss=.3)
    p.part(R(24, 16, 74, 82, 2), CREAM, prof="flat", shadow=.3)
    p.part(R(20, 12, 72, 82, 4), ("#1a0c22", "#4a2d6a", "#9c7fcf"), bevel=5, gloss=.3, shadow=.4)
    for y in range(18, 84, 8):
        p.part(L(arc_pts(20, y, 4, 3, 90, 270, 8), 2), "silver", bevel=1, shadow=.2)
    p.paint(R(34, 26, 62, 40, 2), "#f4e6c2", .9)
    p.ink([(38, 33), (58, 33)], w=1.6, color="#3b2615", alpha=.7)
    p.part(L([(56, 86), (80, 20)], 3), YELLOW, bevel=1.4)


def g_blanket(p):
    p.part(R(10, 34, 86, 80, 12), ("#2a0a12", "#7a1f33", "#c8566a"), prof="pillow", bevel=12, gloss=.08)
    for y in (46, 58, 70):
        p.ink([(12, y), (84, y)], w=2.2, color="#e8c46a", alpha=.55)
    p.part(R(10, 22, 86, 44, 10), ("#2a0a12", "#8a2a3e", "#d86a7c"), prof="pillow", bevel=9, gloss=.08, shadow=.4)
    p.ink([(12, 33), (84, 33)], w=2.2, color="#e8c46a", alpha=.55)


def g_mirror(p):
    p.part(L([(62, 64), (84, 88)], 9), "brass", bevel=4)
    p.part(E(42, 42, 30), "brass", bevel=6, cut=E(42, 42, 22))
    p.part(E(42, 42, 22), ("#2a3446", "#8aa0c0", "#eef4ff"), prof="sphere", gloss=.9, power=40, shadow=0)
    p.ink([(30, 30), (48, 48)], w=2.2, color="#ffffff", alpha=.6)
    spark(p, 34, 32, 2.6)


def g_tool(p):
    p.part(R(20, 40, 80, 60, 9), ("#2a0a12", "#9a2a3a", "#e06a7a"), bevel=6, gloss=.5)
    p.part(L([(24, 44), (12, 18)], 5), "silver", bevel=2, shadow=.4)
    p.part(L([(76, 44), (86, 22), (90, 18)], 4), "silver", bevel=2, shadow=.4)
    p.part(E(30, 50, 3), "silver", prof="sphere", shadow=.2)
    p.part(E(70, 50, 3), "silver", prof="sphere", shadow=.2)
    p.paint(P([(46, 46), (54, 46), (54, 54), (46, 54)]), "#ffffff", .8)


def g_radio(p):
    p.part(R(26, 28, 70, 88, 6), ("#0b0a0f", "#2a2a36", "#6a6a80"), bevel=5, gloss=.4)
    p.part(L([(62, 30), (72, 6)], 3), "silver", bevel=1.5)
    p.part(E(72, 6, 3), ("#3a0c1c", "#c23a5a", "#ff9bb3"), prof="sphere")
    for y in range(40, 60, 5):
        p.ink([(32, y), (64, y)], w=1.6, color="#050407", alpha=.9)
    p.part(R(34, 64, 62, 80, 2), ("#12241a", "#3a8a5a", "#9fe0b8"), prof="flat", gloss=.4, shadow=.3)


def g_thermos(p):
    thermos(p)


def g_battery(p):
    battery(p)


def g_tin(p):
    p.part(R(14, 30, 82, 80, 6), ("#3a3a44", "#c8c8d4", "#ffffff"), bevel=6)
    p.part(R(14, 30, 82, 42, 4), ("#3a3a44", "#b8b8c4", "#ffffff"), bevel=3, shadow=.3)
    p.paint(P([(42, 48), (54, 48), (54, 56), (62, 56), (62, 68), (54, 68), (54, 76), (42, 76), (42, 68), (34, 68), (34, 56), (42, 56)]),
            "#c23a3a", .95)


def g_flashlight(p):
    torch(p)


OBJECTS = {
    # Keepsakes
    "torch": torch, "battery": battery, "knot": knot, "mat": mat, "slipper": slipper, "bell": bell,
    "ball": ball, "jar": jar, "net": net, "hand": hand, "button": button, "chalk": chalk,
    "thermos": thermos, "mouse": mouse, "monocle": monocle, "nightlight": nightlight, "quill": quill,
    "ticket": ticket, "key": key, "knot2": knot2, "tin": tin, "charm": charm, "bag": bag,
    "watch": watch, "quilt": quilt, "cage": cage, "shadow": shadow, "collar": collar,
    "bookmark": bookmark, "stamp": stamp, "lens": lens, "orrery": orrery, "smokedglass": smokedglass,
    "trimmer": trimmer, "dancecard": dancecard, "goblet": goblet, "rib": rib, "crooked": crooked,
    "brush": brush, "fork": fork, "duck": duck, "tag": tag, "frog": frog, "sickle": sickle,
    "leash": leash, "slippers": slippers, "ribbon": ribbon, "glove": glove, "handbell": handbell,
    "splinter": splinter, "wick": wick, "ledger": ledger, "buttons": buttons, "lantern": lantern,
    "bowl": bowl, "photo": photo, "scratch": scratch, "keepsake": keepsake,
    # Snacks
    "snack-gummy-bat": gummy_bat, "snack-liquorice": liquorice, "snack-cold-milk": cold_milk,
    "snack-popping-candy": popping_candy, "snack-jawbreaker": jawbreaker, "snack-sherbet": sherbet,
    "snack-toffee": toffee, "snack": snack,
    # the Safe Room, and the ladder's candles
    "pillow": pillow, "whetstone": whetstone, "mend": mend, "clone": clone, "forge-candle": forge_candle, "teacup": teacup,
    "candle-unlit": candle_unlit, "candle-lit": candle_lit,
    # Gear
    "gear-whistle": g_whistle, "gear-treats": g_treats, "gear-camera": g_camera, "gear-toy": g_toy,
    "gear-tag": g_tag, "gear-flashlight": g_flashlight, "gear-radio": g_radio, "gear-mirror": g_mirror,
    "gear-tool": g_tool, "gear-rope": g_rope, "gear-chalkbox": g_chalkbox, "gear-glow": g_glow,
    "gear-compass": g_compass, "gear-notebook": g_notebook, "gear-blanket": g_blanket,
    "gear-thermos2": g_thermos, "gear-battery2": g_battery, "gear-tin2": g_tin,
}
