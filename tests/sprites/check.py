"""The built Companion sprites still match what `tools/prep_sprites.py` claims.

    python tests/sprites/check.py

Reads `game/assets/sprites/` and re-measures it. Every check here is something
that fails SILENTLY at runtime: a sprite with a grey rim, a sprite that hops
when a clip changes, a clip index that outlived its atlas. None of them throw,
none of them log, and all of them just look slightly wrong at 60fps.

HOW TO PROVE EACH ONE CAN FAIL (CONTRACTS 54). Every check below is paired with
an edit to prep_sprites.py that turns it red, so none of them is decorative:

  lift        flip `dehalo(a) if haloed else a` to always-`a` in `build_clip`
              and rebuild: bones/idle records lift +62.1 with dehalo False and
              the pairing goes red. Raising prep_sprites.HALO_LIFT above 62
              without raising it here does the same from the other side.
  halo        set `B = None` in `classify` (never decontaminate) and rebuild.
              Measured on idle frames 10 and 40: the edge lands 3 and 2 units
              from the background colour against a bar of 80 -- which is the
              defect stated exactly, the soft edge IS the grey it was cut from.
              Shipped, the same frames measure 106 and 113.
  wash        set ALPHA_FLOOR = 0 and rebuild. Measured on the same frames:
              3.85 and 3.84 against a bar of 0.50, where shipped they are 0.056
              and 0.075. `idle` is 43.6% covered in alpha-8 wash in the source.
  anchors     return `[c.fw / 2, c.fh]` from render_clip instead of the
              measured anchor: ANCHOR fails, which is the check standing in for
              "the Companion jumps when it attacks".
  geometry    change ATLAS_COLS without rebuilding: GEOMETRY fails.
  fade        drop `spectral` from FADE_FLOOR and rebuild: DISSOLVE fails,
              because the clip that the brief says must "dissolve into a
              ghostlike translucent form" would no longer lose any opacity.

WHAT THIS DELIBERATELY DOES NOT CHECK, and why. An earlier version of this file
asserted that edge SATURATION stayed high, on the reasoning that contamination
desaturates an edge. It failed all twelve clips on correct output. Marmalade is
drawn with a bright near-white rim light, so his outermost pixels are genuinely
close to white and genuinely low-saturation -- measured (219, 246, 246) against
a body of (118, 196, 228). At source resolution that rim is wide and mostly
opaque; downscaled 2.6x it lands in the partial-alpha band, and the metric was
reading the art as a defect. Contamination is a DARK grey; a white rim is not.
The check below therefore measures distance from the specific background the
tool recorded, which is decidable, instead of saturation, which is not.

A SKIPPED CHECK IS WORSE THAN NO CHECK, so every count is printed -- including
the clips whose background was itself near-white, where no edge measurement can
separate the rim from the halo and this gate says so rather than passing them
quietly.
"""

import glob
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPRITES = os.path.join(ROOT, "game/assets/sprites")

# THE WASH. A clean sprite's low-alpha pixels are a one-or-two pixel
# antialiased ring around the body, so they are a small fraction of the body
# area. A washed one is a field. Measured: every repaired clip lands at
# 0.07-0.12, and a contaminated source frame at 3.85 -- a thirty-fold gap, so
# the bar can sit anywhere between and 0.5 is nowhere near either edge.
MAX_WASH_RATIO = 0.5          # count(0 < a < 24) / count(a >= 128)

# THE ANCHOR IS THE FEET. Checking clips agree with EACH OTHER is the wrong
# test -- `attack` is a lunge and legitimately sits in a bigger box, which is a
# 31px difference in anchors that is not a defect. What must hold is that each
# clip's own anchor really is where its subject stands. Measured: every clip is
# within 2.6px of its own content bottom.
MAX_ANCHOR_ERR = 6.0          # px

# THE HALO. Only decidable when the background the art was cut from is not
# itself near-white: `attack` was flattened on white and Marmalade has a white
# rim, and nothing measured at the edge can separate those two. Those clips are
# counted and named as unmeasurable rather than passed.
MIN_BG_DISTANCE = 80.0        # euclidean, 0-255 RGB
BG_TOO_PALE = 180.0           # mean channel above which the test is undecidable

# Must match tools/prep_sprites.HALO_LIFT. The rim-minus-core luma of the SOURCE
# sheet: bones/idle came in at +62 and every marmalade sheet at -19 to -42,
# because a normally shaded edge is darker than the body it belongs to.
#
# This is checked against the recorded number, not re-measured, and that is not
# laziness: the built atlas genuinely cannot answer the question. Rebuilt with
# the repair disabled, bones' atlas measures +20.7 against +20.8 with it -- the
# LANCZOS downscale and the premultiply round trip erase the difference. The
# source sheets are 187 MB and not in the repo, so the index is the only place
# the fact survives, and what this gate can still prove is that the pipeline
# acted on what it measured.
HALO_LIFT = 25.0


def sat(c):
    return (c.max() - c.min()) / max(1.0, c.max())


def frames_of(atlas, meta):
    a = np.array(atlas)
    for i in range(meta["frames"]):
        c, r = i % meta["cols"], i // meta["cols"]
        yield i, a[r * meta["fh"]:(r + 1) * meta["fh"], c * meta["fw"]:(c + 1) * meta["fw"]]


def check_clip(slug, name, meta, fails, counts):
    path = os.path.join(SPRITES, slug, meta["file"])
    if not os.path.exists(path):
        fails.append(("MISSING", "%s/%s" % (slug, name), meta["file"]))
        return
    atlas = Image.open(path).convert("RGBA")

    # ── GEOMETRY ────────────────────────────────────────────────────────────
    want = (meta["cols"] * meta["fw"], meta["rows"] * meta["fh"])
    if atlas.size != want:
        fails.append(("GEOMETRY", "%s/%s" % (slug, name),
                      "atlas is %s, index says %s" % (atlas.size, want)))
        return
    if meta["frames"] > meta["cols"] * meta["rows"]:
        fails.append(("GEOMETRY", "%s/%s" % (slug, name),
                      "%d frames will not fit %dx%d"
                      % (meta["frames"], meta["cols"], meta["rows"])))
        return
    counts["clips"] += 1

    # ── THE HALO PAIRING: measured and repaired must agree ──────────────────
    lift = meta.get("lift")
    if lift is None:
        fails.append(("STALE", "%s/%s" % (slug, name),
                      "no `lift` recorded -- built by a prep_sprites older than the halo pass"))
    elif bool(meta.get("dehalo")) != (lift > HALO_LIFT):
        fails.append(("HALO", "%s/%s" % (slug, name),
                      "source lift %+.1f but dehalo=%s" % (lift, bool(meta.get("dehalo")))))
    else:
        counts["lift"]["%s/%s" % (slug, name)] = lift

    bg = meta.get("bg")
    pale = bg is not None and (sum(bg) / 3.0) > BG_TOO_PALE
    # Sample rather than sweep for the expensive measurements: 81 frames of
    # identical provenance measure the same thing 81 times. Alpha is cheap, so
    # WASH and ANCHOR look at every frame.
    step = max(1, meta["frames"] // 8)
    wash, bots, edges, empty = [], [], [], 0

    for i, fr in frames_of(atlas, meta):
        a = fr[:, :, 3].astype(np.float64)
        body_px = (a >= 128).sum()
        if (a > 0).sum() < 40 or body_px < 100:
            empty += 1
            continue
        wash.append(float(((a > 0) & (a < 24)).sum()) / body_px)
        ys = np.where(a > 32)[0]
        bots.append(float(ys.max() + 1))
        if i % step or bg is None or pale:
            continue
        # ── HALO ────────────────────────────────────────────────────────────
        an = a / 255.0
        op = an >= 0.98
        if op.sum() < 200:
            continue
        near = ndi.distance_transform_edt(~op) <= 8.0
        lo = near & (an >= 0.05) & (an <= 0.30)
        if lo.sum() < 40:
            continue
        edges.append(fr[:, :, :3].astype(np.float64)[lo].mean(axis=0))
        counts["sampled"] += 1

    if empty:
        fails.append(("EMPTY FRAME", "%s/%s" % (slug, name),
                      "%d of %d frames have no art" % (empty, meta["frames"])))
    if wash:
        worst = max(wash)
        counts["wash"]["%s/%s" % (slug, name)] = worst
        if worst > MAX_WASH_RATIO:
            fails.append(("WASH", "%s/%s" % (slug, name),
                          "low-alpha area is %.2fx the body (bar %.2f) -- the background "
                          "wash survived" % (worst, MAX_WASH_RATIO)))
    if bots:
        err = abs(float(np.median(bots)) - meta["anchor"][1])
        counts["anchor"]["%s/%s" % (slug, name)] = err
        if err > MAX_ANCHOR_ERR:
            fails.append(("ANCHOR", "%s/%s" % (slug, name),
                          "anchor y %.1f is %.1fpx off the subject's feet (%.1f) -- clips "
                          "will not line up" % (meta["anchor"][1], err, np.median(bots))))
    if pale:
        counts["undecidable"].append("%s/%s (bg %s is near-white)"
                                     % (slug, name, [round(v) for v in bg]))
    elif edges:
        d = float(np.linalg.norm(np.mean(edges, axis=0) - np.array(bg, float)))
        counts["halo"]["%s/%s" % (slug, name)] = d
        if d < MIN_BG_DISTANCE:
            fails.append(("HALO", "%s/%s" % (slug, name),
                          "edge sits %.0f from the background it was cut from (bar %.0f) -- "
                          "decontamination did not take" % (d, MIN_BG_DISTANCE)))
    elif bg is not None:
        counts["nosample"] += 1

    # ── DISSOLVE ────────────────────────────────────────────────────────────
    if "fade" in meta:
        f = meta["fade"]
        if len(f) != meta["frames"]:
            fails.append(("DISSOLVE", "%s/%s" % (slug, name),
                          "fade has %d entries for %d frames" % (len(f), meta["frames"])))
        elif min(f) >= 0.95:
            fails.append(("DISSOLVE", "%s/%s" % (slug, name),
                          "fade envelope never dips (min %.2f)" % min(f)))
        else:
            counts["dissolves"] += 1


def main():
    if not os.path.isdir(SPRITES):
        print("no built sprites at", SPRITES)
        print("RESULT: 0 clips, 1 failures (run tools/prep_sprites.py)")
        return 1

    manifest = json.load(open(os.path.join(SPRITES, "index.json")))
    fails = []
    counts = {"clips": 0, "sampled": 0, "dissolves": 0, "nosample": 0, "stills": 0,
              "wash": {}, "anchor": {}, "halo": {}, "lift": {}, "undecidable": []}

    print("built Companion sprites, re-measured")
    for slug, names in sorted(manifest.get("animated", {}).items()):
        idx = json.load(open(os.path.join(SPRITES, slug, "index.json")))
        clips = idx.get("clips", {})
        missing = [n for n in names if n not in clips]
        for n in missing:
            fails.append(("MANIFEST", "%s/%s" % (slug, n), "listed in manifest, absent from index"))
        for name, meta in sorted(clips.items()):
            check_clip(slug, name, meta, fails, counts)
        print("  %-12s %2d clips" % (slug, len(clips)))

    for name, meta in sorted(manifest.get("stills", {}).items()):
        p = os.path.join(SPRITES, "stills", meta["file"])
        if not os.path.exists(p):
            fails.append(("MISSING", "stills/" + name, meta["file"]))
            continue
        im = Image.open(p).convert("RGBA")
        if (im.width, im.height) != (meta["w"], meta["h"]):
            fails.append(("GEOMETRY", "stills/" + name,
                          "%s on disk, index says %s" % (im.size, (meta["w"], meta["h"]))))
            continue
        counts["stills"] += 1

    print("\n  %d clips checked, %d frames sampled for halo, %d stills"
          % (counts["clips"], counts["sampled"], counts["stills"]))
    print("  %d dissolve envelopes verified" % counts["dissolves"])
    if counts["nosample"]:
        print("  %d clips gave NO halo sample (too little soft edge to measure)"
              % counts["nosample"])
    if counts["wash"]:
        w = max(counts["wash"].items(), key=lambda kv: kv[1])
        print("  wash ratio:   worst %-22s %.3f (bar %.2f)" % (w[0], w[1], MAX_WASH_RATIO))
    if counts["anchor"]:
        a = max(counts["anchor"].items(), key=lambda kv: kv[1])
        print("  anchor error: worst %-22s %.1fpx (bar %.1f)" % (a[0], a[1], MAX_ANCHOR_ERR))
    if counts["halo"]:
        h = min(counts["halo"].items(), key=lambda kv: kv[1])
        print("  halo margin:  worst %-22s %.0f (bar %.0f)" % (h[0], h[1], MIN_BG_DISTANCE))
    if counts["lift"]:
        w = max(counts["lift"].items(), key=lambda kv: kv[1])
        deh = [k for k, v in counts["lift"].items() if v > HALO_LIFT]
        print("  source lift:  worst %-22s %+.1f (bar %+.1f) -- %d dehaloed"
              % (w[0], w[1], HALO_LIFT, len(deh)))
    if counts["undecidable"]:
        print("  %d clips NOT halo-checked -- the background they were cut from is itself"
              % len(counts["undecidable"]))
        print("     near-white, so no edge measurement can separate it from the rim light:")
        for u in counts["undecidable"]:
            print("       " + u)

    if fails:
        print("\n--- failures ---")
        for kind, where, why in fails:
            print("  %-17s %-22s %s" % (kind, where, why))
        print("""
  These are the defects `tools/prep_sprites.py` exists to remove. Rebuild with
  `python tools/prep_sprites.py` and, if a check is still red, read the header
  of that file: each failure above names the step that was supposed to prevent
  it.""")

    print("\nRESULT: %d clips, %d stills, %d failures"
          % (counts["clips"], counts["stills"], len(fails)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
