#!/usr/bin/env python3
"""Photograph one region as SEVERAL ROOMS and tile them into one sheet.

    python tools/variant_sheet.py foyer --port 8777 --out shots/sheet-foyer.png
    python tools/variant_sheet.py foyer --seeds parlor,gallery,landing --rows 3

WHY THIS EXISTS
---------------
Josh, 2026-09-18: "i want variation between backgrounds within sections of the
mansion as well, multiple different foyer, ballroom, greenhouse, etc. rooms so
that different encounters within the same section wont feel stale."

Every other capture in this pass is ONE screen judged against the samples. That
cannot answer this question at all: a single Foyer tells you nothing about
whether the next Foyer feels like a different room. The unit of judgment here is
a SET, so the unit of capture is a set, tiled into one frame with its seeds
printed on it.

The machinery being measured already exists. `combat.js` passes the room's name
as `setMood(region, { seed: roomName })`, and `_vary()` in fx/atmosphere.js
re-rolls the layout family, prop count (+-25%), room proportions (+-9%), lamp
positions and mirroring, and shaft count and angle. Measured on three Foyers,
51-55% of pixels differ. What it does NOT touch is `pal.cam`, `subject`,
`floorPattern` or the prop shape set -- so every Foyer shows the same staircase
on the same wall from the same camera, which is what reads as stale however much
the furniture moves.

EVERY TILE IS CHECKED BEFORE IT IS USED. A capture whose backdrop never drew is
a blank frame that looks exactly like a catastrophic regression, and this pass
has been fooled by one already: shot.py exits 2 for a void capture and records
`perf.glStd`, the standard deviation of the #gl canvas alone. A tile that comes
back void is retaken rather than tiled, because a sheet with a dead panel in it
is worse than no sheet.
"""
import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
# Room names a player actually meets in that wing, so a sheet is the rooms the
# game will really show rather than three arbitrary hashes.
DEFAULT_SEEDS = ['parlor', 'gallery', 'landing', 'stairhall']


def capture(region, seed, port, tier, wait, tries=3):
    """One room. Returns its PNG path, or None if it never drew."""
    name = f'vs-{region}-{seed}'
    png = os.path.join(SHOTS, name + '.png')
    state = os.path.join(SHOTS, name + '.state.json')
    for attempt in range(1, tries + 1):
        # never read a stale state file: a shot.py that dies before rewriting it
        # will otherwise be graded on the PREVIOUS run's numbers, which is how a
        # perfectly healthy Greenhouse looked broken three times running.
        for p in (png, state):
            if os.path.exists(p):
                os.remove(p)
        rc = subprocess.run(
            [sys.executable, os.path.join(ROOT, 'tools', 'shot.py'), name,
             '--port', str(port), '--scene', 'title', '--wait', str(wait),
             '--hash', f'region={region}&tier={tier}&actor=0&seed={seed}',
             '--script', '@tools/shot-scripts/backdrop-room.js'],
            cwd=ROOT, capture_output=True, text=True).returncode
        void, gl = True, None
        try:
            with open(state, encoding='utf-8') as f:
                d = json.load(f)
            void = bool(d.get('void'))
            gl = d.get('perf', {}).get('glStd')
        except Exception:
            pass
        if rc != 2 and not void and os.path.exists(png):
            print(f'  ok    {region}/{seed:<12} glStd {gl}')
            return png
        print(f'  retry {region}/{seed:<12} (rc={rc} void={void} glStd={gl})')
        time.sleep(20)
    print(f'  FAILED {region}/{seed}: never drew', file=sys.stderr)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('region')
    ap.add_argument('--seeds', default=','.join(DEFAULT_SEEDS[:3]),
                    help='comma-separated room names; each becomes one tile')
    ap.add_argument('--port', type=int, default=8777)
    ap.add_argument('--tier', default='high')
    ap.add_argument('--wait', type=float, default=7)
    ap.add_argument('--out')
    ap.add_argument('--width', type=int, default=1600, help='sheet width in px')
    ap.add_argument('--min-panels', dest='min_panels', type=int, default=0,
                    help='refuse to write a sheet with fewer panels than this '
                         '(default: all the seeds you asked for)')
    args = ap.parse_args()

    from PIL import Image, ImageDraw

    seeds = [s.strip() for s in args.seeds.split(',') if s.strip()]
    if not args.min_panels:
        args.min_panels = len(seeds)
    tiles = []
    for s in seeds:
        p = capture(args.region, s, args.port, args.tier, args.wait)
        if p:
            tiles.append((s, p))
    if len(tiles) < args.min_panels:
        msg = [
            f'ONLY {len(tiles)} OF {len(seeds)} ROOMS DREW, so no sheet was written.',
            '  A sheet with fewer panels than asked for is not a weaker sheet, it is',
            '  a DIFFERENT ARTEFACT: at one panel it is an ordinary screenshot, and',
            '  the question this round asks -- do these read as different rooms --',
            '  cannot be put to a judge at all. Round 11 nearly shipped four',
            '  single-panel baselines, each of which looked entirely normal alone.',
            "  This machine's GPU degrades across a long session and recovers when",
            '  left alone. Rest it and run this again.',
        ]
        sys.exit(chr(10).join(msg))

    ims = [Image.open(p).convert('RGB') for _, p in tiles]
    tw = args.width
    th = round(tw * ims[0].size[1] / ims[0].size[0])
    gap = 10
    sheet = Image.new('RGB', (tw, th * len(ims) + gap * (len(ims) - 1)), (10, 9, 13))
    d = ImageDraw.Draw(sheet)
    for i, (im, (seed, _)) in enumerate(zip(ims, tiles)):
        y = i * (th + gap)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (0, y))
        d.text((14, y + 12), f'{args.region} / {seed}', fill=(232, 227, 242))

    out = args.out or os.path.join(SHOTS, f'sheet-{args.region}.png')
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    sheet.save(out)
    print(f'sheet: {os.path.relpath(out, ROOT)}  ({len(ims)} rooms)')

    # How different are they, actually? Cheap, and it stops "I varied it" being
    # a matter of opinion -- though it does NOT answer whether they feel like
    # different rooms, which is the judges' job.
    import numpy as np
    arrs = [np.asarray(im.convert('RGB'), np.int16) for im in ims]
    if len(arrs) > 1:
        print('  pairwise pixels differing by more than 6:')
        for i in range(len(arrs)):
            for j in range(i + 1, len(arrs)):
                if arrs[i].shape != arrs[j].shape:
                    continue
                diff = np.abs(arrs[i] - arrs[j]).max(2)
                print(f'    {tiles[i][0]:<12} vs {tiles[j][0]:<12} {(diff > 6).mean() * 100:5.1f}%')


if __name__ == '__main__':
    main()
