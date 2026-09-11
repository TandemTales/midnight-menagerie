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
              from the background colour, against a body some 220 away -- a
              ratio near 0.01 where the bar is 0.5, which is the defect stated
              exactly: the soft edge IS the grey it was cut from. Shipped, the
              same frames measure 106 and 113.
  untail      set `tailed = False` in `build_clip` and rebuild boggle: the
              UNTAIL pairing goes red on all seven of his flattened, ringed
              clips (lift +54..+80, over UNTAIL_LIFT), and
              affection's edge falls back to the ring's tail -- 26 from the
              background against a body 107 away, ratio 0.24, and HALO red.
  deblack     raise prep_sprites.BLACK_SHARE above 0.58 and rebuild drizzle:
              attack records black 0.53 with deblack False, the pairing goes
              red, and its edge is back to the keyed-in black (91 against a
              body 348 away, ratio 0.26).
  dewhite     set prep_sprites.SCRAP_BG_LUMA = 255 and rebuild truffle: five of
              his ten sheets, cut from near-white, dewhite again -- which took
              his eye reflections and quill light -- and DEWHITE goes red.
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
  ping        set prep_sprites.PING_IOU = 0.80 and rebuild mopsy: affection
              ends at IoU 0.78, is marked ping, and this file's 0.60 says it
              must not be, so PING goes red. Lowering the bar proves nothing:
              since the grid fix no built clip ends below 0.78, so there is no
              clip for a lower bar to catch.

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
#
# MEASURED AGAINST THE BODY, NOT AN ABSOLUTE. This used to fail any edge within
# 80 of the background, which reads a Companion whose body is ITSELF near that
# background as haloed: Boggle's attack edge was his own navy (t 0.04) and
# failed at 51, because his body sits only 75 from the grey he was cut from.
# The question is how far the edge got from the background as a share of how
# far the body BEHIND IT (the nearest pixel 3px inside) is. A clean edge is its
# body -- ratio ~1, above 1 under a drawn rim light -- and a contaminated edge
# is the background, -> 0. Measured on the atlases before the fix: Drizzle's
# keyed-in black 0.18-0.23 and Boggle's defeat 0.09, against 0.80-0.92 on nine
# of Pipkin's ten clips, 0.86-0.91 on Boggle's idle and ready, and 1.24-1.28 on
# Drizzle's clean five. Where the body itself sits within MIN_BODY_BG of the
# background, no edge measurement can say which is which, and the clip is
# named as undecidable rather than passed.
MIN_EDGE_RATIO = 0.5          # edge-to-background over body-to-background
MIN_BODY_BG = 40.0            # body this close to the background: undecidable
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

# Must match tools/prep_sprites.PING_IOU. A clip whose first and last frames
# overlap less than this ends somewhere other than where it began, and the
# pipeline marks it to play there and back rather than pop to idle.
PING_IOU = 0.60

# Must match tools/prep_sprites.SCRAP_BG_LUMA, BLACK_SHARE and UNTAIL_LIFT. As with the lift,
# the index carries the number each step was decided on, and this checks the
# pipeline did what its own measurement said.
SCRAP_BG_LUMA = 200.0
BLACK_SHARE = 0.20
UNTAIL_LIFT = 35.0


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

    # ── THE OTHER MATTE STEPS: measured and acted on must agree ─────────────
    if meta.get("dewhite") and bg is not None and (sum(bg) / 3.0) > SCRAP_BG_LUMA:
        fails.append(("DEWHITE", "%s/%s" % (slug, name),
                      "cut from near-white %s yet dewhited -- that strands no grey, only art"
                      % [round(v) for v in bg]))
    want_tail = (meta.get("matte") == "CONTAM" and bool(meta.get("dehalo"))
                 and (meta.get("lift") or 0.0) > UNTAIL_LIFT)
    if bool(meta.get("untail")) != want_tail:
        fails.append(("UNTAIL", "%s/%s" % (slug, name),
                      "matte %s, dehalo=%s, lift %+.1f but untail=%s"
                      % (meta.get("matte"), bool(meta.get("dehalo")), meta.get("lift") or 0.0,
                         bool(meta.get("untail")))))
    if meta.get("matte") == "PREMULT":
        black = meta.get("black")
        if black is None:
            fails.append(("STALE", "%s/%s" % (slug, name),
                          "no `black` recorded -- built by a prep_sprites older than the black pass"))
        elif bool(meta.get("deblack")) != (black > BLACK_SHARE):
            fails.append(("DEBLACK", "%s/%s" % (slug, name),
                          "band black share %.2f but deblack=%s" % (black, bool(meta.get("deblack")))))
    elif meta.get("deblack"):
        fails.append(("DEBLACK", "%s/%s" % (slug, name),
                      "deblack on a %s sheet" % meta.get("matte")))
    # Sample rather than sweep for the expensive measurements: 81 frames of
    # identical provenance measure the same thing 81 times. Alpha is cheap, so
    # WASH and ANCHOR look at every frame.
    step = max(1, meta["frames"] // 8)
    wash, bots, edges, bodies, empty = [], [], [], [], 0

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
        deep = ndi.distance_transform_edt(op) > 3.0
        if deep.sum() < 40:
            continue
        iy, ix = ndi.distance_transform_edt(~deep, return_distances=False, return_indices=True)
        rgb = fr[:, :, :3].astype(np.float64)
        edges.append(rgb[lo].mean(axis=0))
        bodies.append(rgb[iy, ix][lo].mean(axis=0))
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
        bgv = np.array(bg, float)
        d_edge = float(np.linalg.norm(np.mean(edges, axis=0) - bgv))
        d_body = float(np.linalg.norm(np.mean(bodies, axis=0) - bgv))
        if d_body < MIN_BODY_BG:
            counts["undecidable"].append("%s/%s (its body sits %.0f from bg %s)"
                                         % (slug, name, d_body, [round(v) for v in bg]))
        else:
            ratio = d_edge / d_body
            counts["halo"]["%s/%s" % (slug, name)] = ratio
            if ratio < MIN_EDGE_RATIO:
                fails.append(("HALO", "%s/%s" % (slug, name),
                              "edge sits %.0f from the background, %.0f%% of the %.0f its body does "
                              "(bar %.0f%%) -- decontamination did not take"
                              % (d_edge, 100 * ratio, d_body, 100 * MIN_EDGE_RATIO)))
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

    # ── PING: measured and acted on must agree ──────────────────────────────
    iou = meta.get("endIoU")
    if iou is None:
        counts["pingless"] += 1
    elif not meta.get("loop") and not meta.get("hold"):
        want = iou < PING_IOU
        if bool(meta.get("ping")) != want:
            fails.append(("PING", "%s/%s" % (slug, name),
                          "first/last IoU %.2f but ping=%s" % (iou, bool(meta.get("ping")))))
        elif want:
            counts["pings"].append("%s/%s %.2f" % (slug, name, iou))


def main():
    if not os.path.isdir(SPRITES):
        print("no built sprites at", SPRITES)
        print("RESULT: 0 clips, 1 failures (run tools/prep_sprites.py)")
        return 1

    manifest = json.load(open(os.path.join(SPRITES, "index.json")))
    fails = []
    counts = {"clips": 0, "sampled": 0, "dissolves": 0, "nosample": 0, "stills": 0,
              "wash": {}, "anchor": {}, "halo": {}, "lift": {}, "undecidable": [],
              "pings": [], "pingless": 0}

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
    print("  %d clips play there and back%s" % (
        len(counts["pings"]), (": " + ", ".join(counts["pings"])) if counts["pings"] else ""))
    if counts["pingless"]:
        print("  %d clips were built before the end-pose measurement and carry no endIoU"
              % counts["pingless"])
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
        print("  halo ratio:   worst %-22s %.2f (bar %.2f)" % (h[0], h[1], MIN_EDGE_RATIO))
    if counts["lift"]:
        w = max(counts["lift"].items(), key=lambda kv: kv[1])
        deh = [k for k, v in counts["lift"].items() if v > HALO_LIFT]
        print("  source lift:  worst %-22s %+.1f (bar %+.1f) -- %d dehaloed"
              % (w[0], w[1], HALO_LIFT, len(deh)))
    if counts["undecidable"]:
        print("  %d clips NOT halo-checked -- the background they were cut from is near-white"
              % len(counts["undecidable"]))
        print("     or near the body itself, so no edge measurement can separate the two:")
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
