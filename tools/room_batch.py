#!/usr/bin/env python3
"""Photograph SEVERAL rooms in ONE warmed page.

    python tools/room_batch.py --port 8777 --rooms foyer:parlor,foyer:gallery
    python tools/room_batch.py --port 8777 --regions all --sheet shots/sweep.png
    python tools/room_batch.py --port 8777 --regions foyer,crypt --flags "actor=0&props=0"

Each room is written to shots/<prefix><region>-<seed>.png (or
shots/<prefix><region>.png without a seed). `tools/variant_sheet.py` uses this
for its sheets.

WHY THIS EXISTS
---------------
Every capture used to be a fresh browser: ~10 s to load and ~35 s to warm the
stage's shaders on this machine's Intel UHD, to photograph one room. A three-room
sheet paid that three times and a seventeen-region sweep seventeen, and launches
are exactly what this machine runs out of -- it degrades across a few hundred of
them in a session (see void-capture notes in docs/ui-pass/README.md). Nothing
about a room needs a fresh page: `backdrop-room.js` switches the room with
`setMood(region, { seed, instant: true })` and pins the clock at t = 120 before
the shot, and a pinned capture is byte-reproducible. So warm ONE page and walk
it through the rooms.

EQUIVALENCE, measured before this was used for anything: a room photographed
second in a batch, after a different region, against the same room photographed
in a fresh browser -- see the commit that added this file for the numbers.

EVERY ROOM IS CHECKED, the same tests shot.py applies: a frame flatter than
std 8 is dead, a frame with >8% of pixels above L200 caught a white flash, a
stage that never finished warming is void -- and one this mode adds, because a
batch has a failure a single capture cannot: the page must actually be showing
the room it was asked for (`atmosphere.mood` and `roomSeed`), or the shot is of
the PREVIOUS room.
"""
import argparse
import asyncio
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
SCRIPT = os.path.join(ROOT, 'tools', 'shot-scripts', 'backdrop-room.js')

# the seventeen wings, in house order (REGIONS in fx/atmosphere.js, less title)
REGIONS = ['foyer', 'nursery', 'sleeping', 'kitchens', 'greenhouse', 'graveyard',
           'study', 'attic', 'lampworks', 'ballroom', 'crypt', 'hedge', 'passages',
           'bathhouse', 'kennels', 'pumpkin', 'heart']

# the same flags shot.py launches with, so a batch renders what a shot renders
CHROME_ARGS = [
    "--use-gl=angle", "--use-angle=default",
    "--enable-unsafe-swiftshader", "--force-color-profile=srgb",
    "--font-render-hinting=none", "--disable-lcd-text",
    "--autoplay-policy=no-user-gesture-required",
]

WARM_JS = ("() => { const s = window.MM && window.MM.ctx && window.MM.ctx.stage;"
           " return !!s && s.warmStage === 'done'; }")
# twenty steady frames in a row, as in shot.py: the first frames after warm-up
# can still hold the main thread while a program links on first use
FLOW_JS = ("() => { const w = window; const now = performance.now();"
           "  if (!w.__shotFlow) { w.__shotFlow = { n: 0, last: now };"
           "    const f = (t) => { const F = w.__shotFlow;"
           "      F.n = (t - F.last) < 250 ? F.n + 1 : 0; F.last = t;"
           "      if (F.n < 20) requestAnimationFrame(f); };"
           "    requestAnimationFrame(f); }"
           "  return w.__shotFlow.n >= 20; }")
WHERE_JS = ("() => { const a = window.MM.ctx.atmosphere;"
            " return { mood: a.mood, roomSeed: a.roomSeed }; }")


def _hash(region, seed, tier, flags):
    parts = [f'region={region}', f'tier={tier}']
    if flags:
        parts.append(flags.lstrip('&'))
    if seed:
        parts.append(f'seed={seed}')
    return '&'.join(parts)


def _pixels(png):
    """(std, percent above L200) of a capture, as shot.py measures them."""
    from PIL import Image
    h = Image.open(png).convert('L').histogram()
    n = sum(h) or 1
    mu = sum(i * c for i, c in enumerate(h)) / n
    var = sum((i - mu) ** 2 * c for i, c in enumerate(h)) / n
    return var ** 0.5, sum(h[201:]) / n * 100.0


async def _run(rooms, port, tier, flags, w, h, wait, warm_timeout, prefix, log):
    from playwright.async_api import async_playwright
    script = open(SCRIPT, encoding='utf-8').read()
    out = []
    first = rooms[0]
    url = (f'http://localhost:{port}/game/index.html#scene=title&'
           + _hash(first[0], first[1], tier, flags))
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=CHROME_ARGS)
        try:
            page = await (await browser.new_context(
                viewport={'width': w, 'height': h}, device_scale_factor=1,
                reduced_motion='no-preference')).new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            t0 = time.time()
            await page.goto(url, wait_until='load', timeout=60000)
            try:
                await page.wait_for_function(WARM_JS, timeout=int(warm_timeout * 1000), polling=250)
            except Exception:
                log(f'  VOID  warm-up did not finish in {warm_timeout:.0f}s')
                return [dict(region=r, seed=s, png=None, void=True, why='warm-up timed out')
                        for r, s in rooms]
            try:
                await page.wait_for_function(FLOW_JS, timeout=60000, polling=100)
            except Exception:
                log('  warn  the frame loop never delivered 20 steady frames')
            await page.wait_for_timeout(int(wait * 1000))
            log(f'  page warm in {time.time() - t0:.0f}s')
            for region, seed in rooms:
                name = f'{prefix}{region}-{seed}' if seed else f'{prefix}{region}'
                png = os.path.join(SHOTS, name + '.png')
                if os.path.exists(png):
                    os.remove(png)
                n_err = len(errors)
                try:
                    await page.evaluate(script, {'hash': _hash(region, seed, tier, flags)})
                    await page.wait_for_timeout(600)
                    await page.screenshot(path=png, animations='allow')
                    where = await page.evaluate(WHERE_JS)
                except Exception as e:
                    out.append(dict(region=region, seed=seed, png=None, void=True,
                                    why=f'{type(e).__name__}: {str(e)[:160]}'))
                    log(f'  VOID  {region}/{seed}: {type(e).__name__}')
                    continue
                std, hi = _pixels(png)
                why = []
                if std < 8.0:
                    why.append(f'dead frame (std {std:.1f})')
                if hi > 8.0:
                    why.append(f'blown frame ({hi:.1f}% above L200)')
                # the one failure only a batch can have: a shot of the PREVIOUS room
                want_seed = f'{seed}#' if seed else None
                if where.get('roomSeed') != want_seed:
                    why.append(f"page shows room {where.get('roomSeed')!r}, not {want_seed!r}")
                if region in REGIONS and where.get('mood') != region:
                    why.append(f"page shows region {where.get('mood')!r}, not {region!r}")
                if len(errors) > n_err:
                    why.append('console error: ' + errors[n_err][:120])
                void = bool(why)
                out.append(dict(region=region, seed=seed, png=None if void else png,
                                void=void, why='; '.join(why), std=round(std, 2),
                                mood=where.get('mood')))
                log(f"  {'VOID ' if void else 'ok   '} {region}/{seed or '-':<12} std {std:5.1f}"
                    + (f'  -- {out[-1]["why"]}' if void else ''))
        finally:
            await browser.close()
    return out


def capture_rooms(rooms, port=8777, tier='high', flags='actor=0', w=1600, h=900,
                  wait=7.0, warm_timeout=150, prefix='vs-', tries=3, log=print):
    """Photograph rooms [(region, seed-or-None), ...] in as few pages as it takes.

    A room that comes back void is retried in a fresh page, up to `tries` pages
    in all, after a rest. Returns {(region, seed): png path or None}."""
    os.makedirs(SHOTS, exist_ok=True)
    todo = list(rooms)
    got = {}
    for attempt in range(1, tries + 1):
        if not todo:
            break
        if attempt > 1:
            log(f'  retrying {len(todo)} room(s) in a fresh page after a rest')
            time.sleep(20)
        res = asyncio.run(_run(todo, port, tier, flags, w, h, wait, warm_timeout, prefix, log))
        todo = []
        for r in res:
            key = (r['region'], r['seed'])
            if r['void']:
                todo.append(key)
            else:
                got[key] = r['png']
    for key in todo:
        got[key] = None
    return got


def contact_sheet(tiles, out, cols=1, width=1600, label=None):
    """Tile [(label, png), ...] into one image, `cols` across."""
    from PIL import Image, ImageDraw
    ims = [Image.open(p).convert('RGB') for _, p in tiles]
    tw = width // cols
    th = round(tw * ims[0].size[1] / ims[0].size[0])
    gap = 10
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols + gap * (cols - 1), th * rows + gap * (rows - 1)), (10, 9, 13))
    d = ImageDraw.Draw(sheet)
    for i, (im, (lab, _)) in enumerate(zip(ims, tiles)):
        x, y = (i % cols) * (tw + gap), (i // cols) * (th + gap)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x + 14, y + 12), lab, fill=(232, 227, 242))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--rooms', help='region:seed,region:seed,... (seed optional)')
    ap.add_argument('--regions', help="'all' or region,region,... -- one room each")
    ap.add_argument('--seed', help='with --regions: photograph this room of each region')
    ap.add_argument('--port', type=int, default=8777)
    ap.add_argument('--tier', default='high')
    ap.add_argument('--flags', default='actor=0',
                    help="extra hash flags for backdrop-room.js, e.g. 'actor=0&props=0'")
    ap.add_argument('--w', type=int, default=1600)
    ap.add_argument('--h', type=int, default=900)
    ap.add_argument('--wait', type=float, default=7)
    ap.add_argument('--prefix', default='rb-')
    ap.add_argument('--sheet', help='also tile every room into this image')
    ap.add_argument('--cols', type=int, default=3)
    a = ap.parse_args()

    rooms = []
    if a.rooms:
        for tok in a.rooms.split(','):
            region, _, seed = tok.strip().partition(':')
            rooms.append((region, seed or None))
    if a.regions:
        regs = REGIONS if a.regions == 'all' else [r.strip() for r in a.regions.split(',')]
        rooms += [(r, a.seed) for r in regs]
    if not rooms:
        sys.exit('nothing to photograph: give --rooms or --regions')

    t0 = time.time()
    got = capture_rooms(rooms, a.port, a.tier, a.flags, a.w, a.h, a.wait, prefix=a.prefix)
    ok = [(f"{r}/{s}" if s else r, got[(r, s)]) for r, s in rooms if got[(r, s)]]
    bad = [f"{r}/{s}" if s else r for r, s in rooms if not got[(r, s)]]
    print(f'{len(ok)} of {len(rooms)} rooms in {time.time() - t0:.0f}s')
    if bad:
        print('NEVER DREW: ' + ', '.join(bad), file=sys.stderr)
    if a.sheet and ok:
        print('sheet:', contact_sheet(ok, a.sheet, cols=a.cols, width=1600 * min(a.cols, 2)))
    sys.exit(2 if bad else 0)


if __name__ == '__main__':
    main()
