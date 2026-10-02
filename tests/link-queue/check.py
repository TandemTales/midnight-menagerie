#!/usr/bin/env python3
"""Every program variant a wing's rooms draw is one the link queue links FOR
that wing, and every wing the queue names really draws it.
OWNER: atmosphere.

    python tests/link-queue/check.py          (needs tools/devserver.py on :8777)

WHY THIS EXISTS
---------------
Backdrop.precompileRooms links the room programs behind the game -- only while
no fight has its room on screen, and the wings the party can meet next first
(Atmosphere._linkOrder). It knows which wing a variant serves only from
ROOM_VARIANTS in fx/backdrop.js, a hand-written table. A variant missing from
it, or listed under the wrong wing, is never wrong on screen: the first room
that needs it links it on demand with the stand-in room up, for 1-90 s on
Intel UHD. So nothing would ever fail -- which is how the Greenhouse's glass
ceiling (MM_FLOORX 1 on the ceiling) went unlinked by the old fixed list
since round 14.

This boots the game, puts every room a wing can show on the stage --
the 340 authored rooms, the names twelve generated maps per wing give them
(through moodForRoom, as a fight does), and each wing seeded by its own key
and unseeded -- and reads the defines of every VISIBLE backdrop material.
Nothing is drawn; only the scene graph is read. Then:

  1. every non-base variant a wing draws has a ROOM_VARIANTS entry that names
     that wing;
  2. every wing an entry names draws that variant (a stale claim jumps the
     queue for nothing);
  3. every entry sets every define its material's variants differ by (a key
     left out is taken from whatever room is live when the job runs);
  4. no entry twice.

An entry with `wings: []` is allowed (linked last) and listed.
"""
import asyncio
import json
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = "http://localhost:8777/game/index.html"

JS = r"""
(async () => {
  const mg = await import('/game/src/state/mapgen.js');
  const cb = await import('/game/src/scenes/combat.js');
  const { ROOM_VARIANTS } = await import('/game/src/fx/backdrop.js');
  const A = MM.ctx.atmosphere, bd = A.backdrop, S = MM.ctx.stage;
  const roles = new Map([[bd.wallMat, 'wall'], [bd.sides[0].material, 'wall'], [bd.sides[1].material, 'wall'],
    [bd.propMat, 'prop'], [bd.floorMat, 'floor'], [bd.ceilMat, 'ceil']]);
  for (const p of bd.portals) roles.set(p.material, 'portal');
  const keysOf = { wall: bd.wallMat, prop: bd.propMat, floor: bd.floorMat, ceil: bd.ceilMat, portal: bd.portals[0].material };
  const KEYS = Object.fromEntries(Object.entries(keysOf).map(([r, m]) => [r, Object.keys(m.defines || {}).sort()]));
  const drawn = {};
  const take = (label) => {
    const mood = A.mood;
    S.scene.traverseVisible((o) => {
      const m = o.material; if (!m || Array.isArray(m)) return;
      const r = roles.get(m); if (!r) return;
      const d = m.defines || {};
      const k = r + ':' + KEYS[r].map((x) => x + '=' + (d[x] ?? 0)).join(',');
      const w = drawn[mood] || (drawn[mood] = {});
      (w[k] || (w[k] = [])).push(label);
    });
  };
  for (const [region, rooms] of Object.entries(mg.ROOMS)) {
    const names = new Set(rooms.map((r) => r.name));
    for (let sd = 1; sd <= 12; sd++) {
      let m = null; try { m = mg.generateRegionMap(region, sd * 7919, {}); } catch (e) { continue; }
      for (const n of m.nodes) if (n.roomName) names.add(n.roomName);
    }
    for (const nm of names) {
      A.setMood(cb.moodForRoom(nm, region), { seed: nm, instant: true });
      take(region + '/' + nm);
    }
    const home = cb.moodForRoom('', region);
    A.setMood(home, { seed: home, instant: true }); take(region + '/#' + home);
    A.setMood(home, { instant: true }); take(region + '/(unseeded)');
  }
  const base = {};
  for (const r of Object.keys(KEYS)) base[r] = r + ':' + KEYS[r].map((x) => x + '=' + (r === 'portal' ? 1 : 0)).join(',');
  const entries = ROOM_VARIANTS.map((e) => ({
    mat: e.mat, wings: e.wings.slice(), defines: e.defines,
    missing: (KEYS[e.mat] || ['?']).filter((x) => !(x in e.defines)),
    key: e.mat + ':' + (KEYS[e.mat] || []).map((x) => x + '=' + (e.defines[x] ?? 0)).join(','),
  }));
  return { drawn, base, entries, KEYS };
})()
"""


async def collect():
    from playwright.async_api import async_playwright
    errs = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=default"])
        page = await (await browser.new_context(viewport={"width": 1600, "height": 900})).new_page()
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        await page.goto(URL)
        await page.wait_for_function("window.MM && MM.ctx.atmosphere && MM.ctx.atmosphere.ready", timeout=90000)
        out = await page.evaluate(JS)
        await browser.close()
    return out, errs


def main():
    out, errs = asyncio.run(collect())
    fails = []
    for e in errs[:3]:
        fails.append(e)
    drawn, entries = out["drawn"], out["entries"]
    base = set(out["base"].values())
    by_key = {}
    for e in entries:
        if e["key"] in by_key:
            fails.append(f"ROOM_VARIANTS lists {e['key']} twice")
        by_key[e["key"]] = e
        if e["missing"]:
            fails.append(f"ROOM_VARIANTS {e['key']} does not set {e['missing']}")
    # 1. every variant a wing draws is linked for that wing
    for wing, ks in sorted(drawn.items()):
        for k, rooms in sorted(ks.items()):
            if k in base:
                continue
            e = by_key.get(k)
            if not e:
                fails.append(f"{wing} draws {k} (e.g. {rooms[0]}) and ROOM_VARIANTS has no entry for it")
            elif wing not in e["wings"]:
                fails.append(f"{wing} draws {k} (e.g. {rooms[0]}) and its ROOM_VARIANTS entry does not name {wing}")
    # 2. every wing an entry names draws it
    unclaimed = []
    for e in entries:
        if not e["wings"]:
            unclaimed.append(e["key"])
        for w in e["wings"]:
            if e["key"] not in drawn.get(w, {}):
                fails.append(f"ROOM_VARIANTS names {w} for {e['key']}, and no {w} room draws it")
    print(f"{len(drawn)} wings, {len(entries)} variants in the queue")
    for k in unclaimed:
        print(f"  note: {k} names no wing (linked last); no room draws it")
    for f in fails:
        print("FAIL ", f)
    print(f"RESULT: {len(entries)} variants, {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
