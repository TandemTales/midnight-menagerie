"""Vectorise the 17 blueprint SECTION drawings so the map can draw each wing
from its own image.  ONE-OFF: run it, commit the JSON it writes.  The game has
no build step (CONTRACTS non-negotiable #1) and never runs this.

    python tools/blueprint_trace.py            # all 17 + a contact sheet
    python tools/blueprint_trace.py 1 5 13     # just those sections
    python tools/blueprint_trace.py --preview  # also write shots/blueprint-trace/

Reads   game/assets/blueprint/sectionNN.png
Writes  game/assets/blueprint/sectionNN.plan.json


WHY THIS EXISTS
---------------
The map screen used to crop the master estate drawing instead of using the
section, because the sections are small (165x470 up to 713x237) and the plan
window is 1882x776 — a 3.5x to 7.8x blow-up, which a smooth filter turns into
grey mush.  The answer is not a different source; it is to stop resampling a
bitmap.  These drawings have exactly two marks in them — WALL RUNS and PIER
DOTS — so they can be reduced to those marks and re-inked at whatever size the
sheet is.  Scale then stops mattering: at 8x the wing is a large-scale survey
with hairline walls instead of a 1px line smeared over eight pixels.

THE PIPELINE
------------
1. ink field      the same blue-vs-warm-paper extraction the map used to do at
                  runtime, so the ink we keep is the ink it kept.
2. hysteresis     seed at 0.34, grow into anything above 0.14 that touches a
                  seed.  A flat threshold either drops the faint connective
                  lines between piers (walls come apart into beads) or picks up
                  paper grain.  This keeps faint ink only where it continues
                  real ink.
3. piers          measured on the RAW mask: anything whose half-width is
                  >= 1.05px is a pier, not a wall.  Recorded as a centre and a
                  radius so the map can ink them at a chosen size rather than
                  whatever the pixels happened to be.
4. closing        r = 2.5 supersampled px, and ONLY for the walls.  The source
                  is a printed drawing photographed small: its walls are BEADED,
                  and a 1px gap the eye integrates at 1x is an 8px hole at 8x.
                  Closing knits the beads back into the runs they were drawn as
                  — and, if you let it, swallows the drawing's dot rhythm too
                  (443 piers down to 113 on the Foyer), which is why step 3
                  measures the mask before this one touches it.
5. thinning       Zhang-Suen to the centreline, split at junctions, then chained
                  back together by direction so a wall that crosses three others
                  stays ONE polyline instead of four stubs.
6. simplify       Douglas-Peucker at 0.32px, then near-axis runs (within 9 deg
                  and 1.4px) snap flat.  Architecture is orthogonal; the wobble
                  is the pixel grid, not the draughtsman.
7. bridge         join stroke ends that face each other across < 2.2px.  Closing
                  gets most breaks; this gets the rest without fattening ink.
8. fine marks     rasterise everything above and diff it against the source.
                  Walls and piers account for ~90% of the ink; the remaining
                  10% is the drawing's small change — door swings, dashes, hatch
                  ticks — a couple of hundred marks a sheet, kept as dots the
                  map inks lighter.  Without them the plan looks swept clean.

Also recorded per section: total line length and the ink's bounding box, so the
map can solve its pen for a target ink-to-paper ratio instead of using one
authored weight across seventeen drawings that differ by 4x in line density.

Output is 17-160 KB per section (JSON, integers quantised to 1/4 px); the map
fetches exactly one of them.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "game", "assets", "blueprint")

SS = 2              # supersample, for subpixel centrelines
HI, LO = 0.34, 0.14  # hysteresis thresholds on the ink field
CLOSE_R = 2.5       # supersampled px
PIER_MIN = 1.05     # native px half-width at which a blob becomes a pier
PIER_MAX = 2.60     # and the radius we refuse to exceed
RDP_EPS = 0.32
SNAP_DEG, SNAP_PX = 9.0, 1.4
BRIDGE_MAX = 2.2
Q = 4               # coordinate quantisation: 1/4 px

# ── 1. the ink field ─────────────────────────────────────────────────────────


def ink_field(path):
    """Blue linework against warm paper, 0..1.  Mirrors the map's extraction."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b - r) / 255.0
    dark = 1.0 - (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
    v = np.clip(blue * 2.6 + np.maximum(0, dark - 0.42) * 1.1, 0, 1)
    return v * v * (3 - 2 * v)          # smoothstep: tighten the edge


def hysteresis(v, hi, lo):
    strong, weak = v > hi, v > lo
    lbl, n = ndimage.label(weak)
    if not n:
        return strong
    good = np.zeros(n + 1, bool)
    good[np.unique(lbl[strong])] = True
    good[0] = False
    return good[lbl]


def disc(r):
    n = int(math.ceil(r))
    y, x = np.ogrid[-n:n + 1, -n:n + 1]
    return x * x + y * y <= r * r + 1e-9


# ── 5. thinning ──────────────────────────────────────────────────────────────


def thin(img):
    """Zhang-Suen, whole-array per pass."""
    I = img.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            P = np.pad(I, 1)
            p2 = P[:-2, 1:-1]; p3 = P[:-2, 2:]; p4 = P[1:-1, 2:]; p5 = P[2:, 2:]
            p6 = P[2:, 1:-1]; p7 = P[2:, :-2]; p8 = P[1:-1, :-2]; p9 = P[:-2, :-2]
            nb = [p2, p3, p4, p5, p6, p7, p8, p9]
            B = sum(nb)
            seq = nb + [p2]
            A = sum(((seq[k] == 0) & (seq[k + 1] == 1)).astype(np.uint8) for k in range(8))
            if step == 0:
                c1 = (p2 * p4 * p6) == 0
                c2 = (p4 * p6 * p8) == 0
            else:
                c1 = (p2 * p4 * p8) == 0
                c2 = (p2 * p6 * p8) == 0
            kill = (I == 1) & (B >= 2) & (B <= 6) & (A == 1) & c1 & c2
            if kill.any():
                I[kill] = 0
                changed = True
        if not changed:
            return I


NB8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def segments(sk):
    """Skeleton -> runs of pixels between junctions and endpoints."""
    pts = set((int(y), int(x)) for y, x in zip(*np.nonzero(sk)))
    adj = {p: [q for q in ((p[0] + dy, p[1] + dx) for dy, dx in NB8) if q in pts] for p in pts}
    used, out = set(), []

    def key(a, b):
        return (a, b) if a < b else (b, a)

    for s in [p for p in adj if len(adj[p]) != 2]:
        for n0 in adj[s]:
            k = key(s, n0)
            if k in used:
                continue
            used.add(k)
            path, prev, cur = [s, n0], s, n0
            while len(adj[cur]) == 2:
                nxt = next((q for q in adj[cur] if q != prev), None)
                if nxt is None or key(cur, nxt) in used:
                    break
                used.add(key(cur, nxt))
                path.append(nxt)
                prev, cur = cur, nxt
            out.append(path)
    for p in adj:                                        # closed loops
        if len(adj[p]) != 2 or any(key(p, q) in used for q in adj[p]):
            continue
        path, prev, cur = [p], None, p
        while True:
            nx = [q for q in adj[cur] if q != prev and key(cur, q) not in used]
            if not nx:
                break
            nxt = nx[0]
            used.add(key(cur, nxt))
            path.append(nxt)
            prev, cur = cur, nxt
            if nxt == p:
                break
        if len(path) > 2:
            out.append(path)
    return out


def chain(segs, cos_min=0.72):
    """A wall crossed by three others comes back as four stubs.  Sew it up."""
    ends = {}
    for i, s in enumerate(segs):
        ends.setdefault(s[0], []).append((i, 0))
        ends.setdefault(s[-1], []).append((i, 1))
    used = [False] * len(segs)
    out = []

    def leave_dir(s, e):
        pts = s if e == 0 else s[::-1]
        n = min(len(pts) - 1, 5)
        ay, ax = pts[n]
        by, bx = pts[0]
        L = math.hypot(ax - bx, ay - by) or 1
        return ((ax - bx) / L, (ay - by) / L)

    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        cur = list(segs[i])
        for tail in (True, False):
            while True:
                pts = cur if tail else cur[::-1]
                tip = pts[-1]
                n = min(len(pts) - 1, 5)
                ay, ax = pts[-1 - n]
                by, bx = pts[-1]
                L = math.hypot(bx - ax, by - ay) or 1
                dx, dy = (bx - ax) / L, (by - ay) / L
                best, bs = None, cos_min
                for (j, e) in ends.get(tip, []):
                    if used[j]:
                        continue
                    o = leave_dir(segs[j], e)
                    c = dx * o[0] + dy * o[1]
                    if c > bs:
                        bs, best = c, (j, e)
                if not best:
                    break
                j, e = best
                used[j] = True
                add = segs[j] if e == 0 else segs[j][::-1]
                cur = cur + add[1:] if tail else add[::-1][:-1] + cur
        out.append(cur)
    return out


# ── 6. simplify ──────────────────────────────────────────────────────────────


def rdp(pts, eps):
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        ax, ay = pts[i0]
        bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(i0 + 1, i1):
            px, py = pts[i]
            d = (abs(dy * px - dx * py + bx * ay - by * ax) / L if L > 1e-9
                 else math.hypot(px - ax, py - ay))
            if d > best:
                best, bi = d, i
        if best > eps and bi > 0:
            keep[bi] = True
            stack += [(i0, bi), (bi, i1)]
    return [p for p, k in zip(pts, keep) if k]


def snap_axis(pts, tol_deg=SNAP_DEG, tol_px=SNAP_PX):
    out = [list(p) for p in pts]
    ct = math.cos(math.radians(90 - tol_deg))
    for i in range(len(out) - 1):
        ax, ay = out[i]
        bx, by = out[i + 1]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        if L < 1e-6:
            continue
        if abs(dy) / L < ct and abs(dy) < tol_px:
            m = (ay + by) / 2
            out[i][1] = out[i + 1][1] = m
        elif abs(dx) / L < ct and abs(dx) < tol_px:
            m = (ax + bx) / 2
            out[i][0] = out[i + 1][0] = m
    return [tuple(p) for p in out]


# ── 7. bridge ────────────────────────────────────────────────────────────────


def _dir(a, b):
    d = math.dist(a, b) or 1
    return ((b[0] - a[0]) / d, (b[1] - a[1]) / d)


def bridge(strokes, maxgap=BRIDGE_MAX):
    tips = []
    for i, s in enumerate(strokes):
        p = s["pts"]
        tips.append((i, 0, p[0], _dir(p[1], p[0])))
        tips.append((i, 1, p[-1], _dir(p[-2], p[-1])))
    taken, joined = set(), 0
    for a in range(len(tips)):
        ia, ea, pa, da = tips[a]
        if (ia, ea) in taken:
            continue
        best, bd = None, maxgap
        for b in range(len(tips)):
            ib, eb, pb, db = tips[b]
            if b == a or ib == ia or (ib, eb) in taken:
                continue
            d = math.dist(pa, pb)
            if d >= bd or d < 1e-6:
                continue
            ux, uy = (pb[0] - pa[0]) / d, (pb[1] - pa[1]) / d
            if da[0] * ux + da[1] * uy < 0.55:
                continue
            if db[0] * -ux + db[1] * -uy < 0.55:
                continue
            bd, best = d, b
        if best is None:
            continue
        ib, eb, pb, db = tips[best]
        taken.add((ia, ea))
        taken.add((ib, eb))
        strokes.append({"w": (strokes[ia]["w"] + strokes[ib]["w"]) / 2, "pts": [pa, pb]})
        joined += 1
    return joined


# ── the whole thing ──────────────────────────────────────────────────────────


def trace(path):
    v = ink_field(path)
    H, W = v.shape
    vs = (np.asarray(Image.fromarray((v * 255).astype(np.uint8))
                     .resize((W * SS, H * SS), Image.BICUBIC)).astype(np.float32) / 255.0)
    raw = hysteresis(vs, HI, LO)
    lbl, n = ndimage.label(raw)
    if n:
        sizes = ndimage.sum(raw, lbl, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= 2 * SS * SS                  # drop paper specks
        raw = keep[lbl]

    # Piers come off the RAW mask, walls off the CLOSED one.
    #
    # Closing is what knits the beaded walls into runs, and it is also what
    # swallows the drawing's dot rhythm: on the Foyer it took 443 piers down to
    # 113, and those dots are most of what the plan looks like from across the
    # room.  Measuring the two marks on the two masks keeps both — continuous
    # walls AND the full stipple of piers along them.
    d0 = ndimage.distance_transform_edt(raw)
    flbl, fn = ndimage.label(d0 >= PIER_MIN * SS)
    piers = []
    for i, sl in enumerate(ndimage.find_objects(flbl), 1):
        sub = flbl[sl] == i
        r = min(PIER_MAX, float((d0[sl] * sub).max()) / SS)
        ys, xs = np.nonzero(sub)
        piers.append(((xs.mean() + sl[1].start) / SS, (ys.mean() + sl[0].start) / SS, r))

    m = ndimage.binary_closing(raw, disc(CLOSE_R))
    lbl, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lbl, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= 3 * SS * SS
        m = keep[lbl]
    dist = ndimage.distance_transform_edt(m)

    strokes = []
    for p in chain(segments(thin(m))):
        if len(p) < 2:
            continue
        w = 2 * float(np.median([dist[y, x] for y, x in p])) / SS
        pl = [(x / SS, y / SS) for y, x in p]
        L = sum(math.dist(pl[i], pl[i + 1]) for i in range(len(pl) - 1))
        if L < 1.0:
            continue
        strokes.append({"w": w, "pts": snap_axis(rdp(pl, RDP_EPS))})
    bridged = bridge(strokes)

    # ── what the walls and piers did not account for ─────────────────────────
    # Rasterise the reconstruction and diff it against the source mask.  Walls
    # and piers carry about 90% of the ink; the last 10% is the drawing's small
    # change — door swings, dashes, hatch ticks, furniture — several hundred
    # marks per sheet, too short to be a wall and too thin to be a pier, and the
    # plan looks noticeably swept-clean without them.  They come back as fine
    # marks the map inks lighter.
    fine = residual_marks(raw, strokes, piers, W, H)

    ys, xs = np.nonzero(raw | m)
    box = ([float(xs.min()) / SS, float(ys.min()) / SS,
            float(xs.max()) / SS, float(ys.max()) / SS] if len(xs) else [0, 0, W, H])
    return {"w": W, "h": H, "strokes": strokes, "piers": piers, "fine": fine,
            "bridged": bridged, "box": box, "mask": m, "field": v}


def residual_marks(raw, strokes, piers, W, H):
    from PIL import ImageDraw
    im = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(im)
    for s in strokes:
        d.line([(x * SS, y * SS) for x, y in s["pts"]], fill=255,
               width=max(1, int(round(s["w"] * SS))), joint="curve")
    for (x, y, r) in piers:
        rr = r * SS
        d.ellipse([x * SS - rr, y * SS - rr, x * SS + rr, y * SS + rr], fill=255)
    rec = ndimage.binary_dilation(np.asarray(im) > 0, disc(1.0))
    resid = raw & ~rec
    lbl, n = ndimage.label(resid)
    if not n:
        return []
    out = []
    for i, sl in enumerate(ndimage.find_objects(lbl), 1):
        sub = lbl[sl] == i
        a = int(sub.sum())
        if a < 2 * SS * SS:
            continue
        ys, xs = np.nonzero(sub)
        out.append(((xs.mean() + sl[1].start) / SS, (ys.mean() + sl[0].start) / SS,
                    max(0.45, math.sqrt(a / math.pi) / SS)))
    return out


def encode(t):
    # `len` and `area` let the map pick its pen per wing instead of per taste.
    # The seventeen drawings differ enormously in how much ink is in them — the
    # greenhouse is 25x the line length of the Foyer over 4x the paper — so one
    # authored stroke weight makes the sparse wings faint and the dense ones a
    # solid blue mass.  Given total line length, the map can solve for the pen
    # that lands every wing on the same ink-to-paper ratio.
    ln = sum(math.dist(s["pts"][i], s["pts"][i + 1])
             for s in t["strokes"] for i in range(len(s["pts"]) - 1))
    bw = max(1.0, t["box"][2] - t["box"][0])
    bh = max(1.0, t["box"][3] - t["box"][1])
    return {
        "v": 1, "w": t["w"], "h": t["h"], "q": Q,
        "len": round(ln), "area": round(bw * bh),
        "wm": round(float(np.median([s["w"] for s in t["strokes"]])) * Q) if t["strokes"] else 2 * Q,
        "pr": round(float(np.median([p[2] for p in t["piers"]])) * Q) if t["piers"] else Q,
        "box": [round(c * Q) for c in t["box"]],
        "s": [[max(1, round(s["w"] * Q))] + [round(c * Q) for p in s["pts"] for c in p]
              for s in t["strokes"]],
        "p": [[round(x * Q), round(y * Q), max(1, round(r * Q))] for x, y, r in t["piers"]],
        "f": [[round(x * Q), round(y * Q), max(1, round(r * Q))] for x, y, r in t["fine"]],
    }


def preview(t, out, scale=4.0):
    """A flat PNG of the trace, for eyeballing the tracer itself."""
    from PIL import ImageDraw
    S = 2
    W = int(t["w"] * scale)
    H = int(t["h"] * scale)
    im = Image.new("RGB", (W * S, H * S), (232, 220, 192))
    d = ImageDraw.Draw(im)
    col = (45, 74, 122)
    for s in t["strokes"]:
        lw = max(1.4, s["w"] * scale * 0.42) * S
        d.line([(x * scale * S, y * scale * S) for x, y in s["pts"]],
               fill=col, width=int(round(lw)), joint="curve")
    for (x, y, r) in t["piers"]:
        rr = max(1.8, r * scale * 0.55) * S
        cx, cy = x * scale * S, y * scale * S
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    im.resize((W, H), Image.LANCZOS).save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sections", nargs="*", type=int)
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()
    want = a.sections or list(range(1, 18))
    shots = os.path.join(ROOT, "shots", "blueprint-trace")
    if a.preview:
        os.makedirs(shots, exist_ok=True)
    total = 0
    for i in want:
        src = os.path.join(SRC_DIR, "section%02d.png" % i)
        if not os.path.exists(src):
            print("missing", src)
            continue
        t = trace(src)
        enc = encode(t)
        dst = os.path.join(SRC_DIR, "section%02d.plan.json" % i)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(enc, f, separators=(",", ":"))
        n = os.path.getsize(dst)
        total += n
        print("section%02d  %4dx%-4d  strokes %4d (+%3d bridged)  piers %4d  fine %4d  %6.1f KB"
              % (i, t["w"], t["h"], len(t["strokes"]) - t["bridged"], t["bridged"],
                 len(t["piers"]), len(t["fine"]), n / 1024))
        if a.preview:
            preview(t, os.path.join(shots, "section%02d.png" % i))
    print("total %.1f KB across %d sections" % (total / 1024, len(want)))


if __name__ == "__main__":
    sys.exit(main())
