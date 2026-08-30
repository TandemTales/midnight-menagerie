"""Steam Deck verification, measured rather than assumed.

    python tests/steam-deck/run.py [--verbose] [--shots]

Valve's Deck Verified bar has four categories. Two of them are about the build
(Proton, no launcher, no compatibility warning) and cannot be checked before
there IS a build. Two are about the GAME, and those are checkable today:

  INPUT    fully playable with the controller; glyphs match the pad in hand;
           the on-screen keyboard is invoked for text entry.
  DISPLAY  the default resolution is 1280x800; text is legible at it; nothing
           is clipped or scrolled off; the default settings are appropriate.

`tests/gamepad/run.py` covers input. THIS suite covers display, by walking every
scene at exactly 1280x800 - the Deck's native panel - and MEASURING: horizontal
overflow, elements outside the viewport, the smallest text actually rendered,
and whether the screen can be driven with a controller at all.

The numbers are printed for every scene whether it passes or not, because "no
overflow" is only interesting next to how close the worst scene came.

Prints `RESULT: n passed, m failed`. Exit 0 only when m == 0.
"""
import argparse
import asyncio
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://localhost:8777/game/index.html"
DECK_W, DECK_H = 1280, 800

# The panel is 7 inches. Valve asks for legibility rather than a number, so the
# floor here is the one the rest of the industry converged on for handhelds, and
# anything under WARN is printed even when it passes.
MIN_FONT_PX = 9.0
WARN_FONT_PX = 11.0
# A control smaller than this is hard to hit with a trackpad.
MIN_TARGET_PX = 20.0

SCENES = [
    ("title", ""),
    ("clubhouse", ""),
    ("select", ""),
    ("lobby", ""),
    ("map", "&seed=7&companion=bones"),
    ("combat", "&seed=7&companion=bones"),
    ("reward", "&seed=7&companion=bones"),
    ("event", "&seed=7&companion=bones"),
    ("shop", "&seed=7&companion=bones"),
    ("rest", "&seed=7&companion=bones"),
    ("gameover", "&result=defeat&seed=1234&companion=bones"),
]

MEASURE = r"""
() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const root = document.getElementById('dom-layer') || document.body;

  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Smallest font actually rendering VISIBLE, NON-WHITESPACE text. Measuring
  // every element's computed size would report the font-size of empty wrappers
  // and of nodes whose text is a single space, neither of which a player reads.
  let minFont = Infinity, minFontEl = null;
  const small = [];
  for (const el of root.querySelectorAll('*')) {
    if (!el.childNodes.length) continue;
    let hasText = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim().length > 1) { hasText = true; break; }
    }
    if (!hasText || !vis(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (!px) continue;
    if (px < minFont) { minFont = px; minFontEl = (el.className || el.tagName) + ' :: ' + el.textContent.trim().slice(0, 34); }
    if (px < 12) small.push({ px: +px.toFixed(1), what: (el.className || el.tagName).toString().slice(0, 40) });
  }

  /* Anything a player NEEDS that hangs outside the panel.
   *
   * The first version of this counted every element and reported 88 on the
   * Game Over screen, which was true and useless: mist layers, lamp glows and
   * floor gradients are SUPPOSED to bleed off the edges, and a measure that
   * cannot tell a glow from a sentence is a measure nobody will read twice.
   *
   * "Needs" is therefore defined as: it is interactive, or it directly holds
   * text. Decoration has neither. This is the same judgement `vis()` makes
   * about opacity, applied to purpose instead of visibility. */
  const INTERACTIVE = 'button,input,select,textarea,a[href],[role="button"],[tabindex]:not([tabindex="-1"])';
  const carriesText = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim().length > 1) return true;
    }
    return false;
  };
  /* OUTSIDE THE VIEWPORT IS NOT THE SAME AS UNREACHABLE, and conflating them
   * made this measure lie in both directions. `ui/base.css` lets four scenes
   * scroll on a short panel; content below the fold in one of those is one
   * thumbstick push away, which is fine. Content below the fold in a scene with
   * `overflow:hidden` is gone forever, which is a blocker. The question is
   * reachability, so ask it: is there a scrollable ancestor whose scroll range
   * contains this element? */
  const scrollerFor = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
      p = p.parentElement;
    }
    return null;
  };
  const spill = [], spillDecor = [], reachableByScroll = [];
  for (const el of root.querySelectorAll('*')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > vw * 1.5 || r.height > vh * 1.5) continue;   // full-bleed backdrops
    const overX = Math.max(0, -r.left, r.right - vw);
    const overY = Math.max(0, -r.top, r.bottom - vh);
    if (overX <= 4 && overY <= 4) continue;
    const entry = { what: (el.className || el.tagName).toString().slice(0, 44),
                    over: Math.round(Math.max(overX, overY)),
                    axis: overX > 4 ? 'x' : 'y',
                    text: (el.textContent || '').trim().slice(0, 40) };
    const wanted = el.matches(INTERACTIVE) || carriesText(el);
    if (!wanted) { spillDecor.push(entry); continue; }
    // Horizontal overflow is never acceptable — nothing here scrolls sideways.
    if (overX <= 4) {
      const sc = scrollerFor(el);
      if (sc) {
        const cr = sc.getBoundingClientRect();
        const top = r.top - cr.top + sc.scrollTop;
        const bottom = r.bottom - cr.top + sc.scrollTop;
        if (top >= -4 && bottom <= sc.scrollHeight + 4) { reachableByScroll.push(entry); continue; }
      }
    }
    spill.push(entry);
  }
  spill.sort((a, b) => b.over - a.over);

  // Controls too small to hit with a trackpad.
  const tiny = [];
  for (const el of root.querySelectorAll('button,[role="button"],input,select,a[href]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const min = Math.min(r.width, r.height);
    if (min < 20) tiny.push({ what: (el.className || el.tagName).toString().slice(0, 40), px: Math.round(min) });
  }

  return {
    vw, vh,
    docScrollW: document.documentElement.scrollWidth,
    docScrollH: document.documentElement.scrollHeight,
    minFont: minFont === Infinity ? null : +minFont.toFixed(1),
    minFontEl,
    smallCount: small.length,
    smallest: small.sort((a, b) => a.px - b.px).slice(0, 5),
    spill: spill.slice(0, 6),
    spillCount: spill.length,
    decorSpill: spillDecor.length,
    scrollable: reachableByScroll.length,
    tiny: tiny.slice(0, 5),
    tinyCount: tiny.length,
    navigable: window.MM.ctx.navigator ? window.MM.ctx.navigator.candidates().length : -1,
  };
}
"""


async def settle(page, scene):
    await page.wait_for_function(
        "() => !!window.MM && !!window.MM.ctx.scenes.current", timeout=25000)
    if scene == "combat":
        S = "(window.MM && window.MM.ctx.scenes.current)"
        await page.wait_for_function(
            f"!!({S}) && {S}.engine && document.querySelectorAll('.mm-hand__cards .mm-card').length>0",
            timeout=25000)
        await page.wait_for_function(f"{S} && {S}._opening === false", timeout=20000)
        await page.wait_for_function(f"{S} && !{S}._draining && {S}._q.length===0", timeout=20000)
        await page.wait_for_function(f"{S} && {S}.hand && !{S}.hand.warming", timeout=20000)
    # WAIT FOR THE ENTRANCE TO FINISH, and wait for it properly.
    #
    # A flat 1800 ms sampled Game Over mid-animation and reported its buttons
    # 6 px below the panel, which read as "a player who dies cannot get back to
    # the Clubhouse" and was false: scenes/gameover.js keeps `is-entering` for
    # 3200 ms, and at rest the buttons sit at 729-790 inside an 800 px panel.
    # Every scene here animates in, so any measurement taken before the class
    # clears is a measurement of a transform and not of a layout.
    try:
        await page.wait_for_function(
            "() => { const s = document.querySelector('.scene');"
            "        return !!s && !s.classList.contains('is-entering'); }", timeout=12000)
    except Exception:                                       # noqa: BLE001
        pass                                                # not every scene uses the class
    await page.wait_for_timeout(700)
    # And wait for the screen to be NAVIGABLE, not merely present. The title's
    # menu items animate from opacity 0 on their own schedule, after the scene's
    # `is-entering` class has already gone; measuring in that gap reported "the
    # title screen has nothing a controller can focus", which is a statement
    # about 400 ms rather than about the game. A screen that is still empty
    # after six seconds IS the finding, and the assertion below still catches it.
    try:
        await page.wait_for_function(
            "() => window.MM.ctx.navigator.candidates().length > 0", timeout=6000)
        await page.wait_for_timeout(250)
    except Exception:                                       # noqa: BLE001
        pass


async def main(a):
    from playwright.async_api import async_playwright
    passed, failed, notes = 0, 0, []
    rows = []
    errors = []

    def check(cond, label, detail=""):
        nonlocal passed, failed
        if cond:
            passed += 1
            notes.append(("PASS", label, detail))
        else:
            failed += 1
            notes.append(("FAIL", label, detail))

    shot_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
    if a.shots and not os.path.isdir(shot_dir):
        os.makedirs(shot_dir, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--autoplay-policy=no-user-gesture-required",
        ])
        ctxb = await browser.new_context(viewport={"width": DECK_W, "height": DECK_H},
                                         reduced_motion="reduce")
        page = await ctxb.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        for scene, extra in SCENES:
            url = f"{BASE}?deck-{scene}#scene={scene}{extra}"
            try:
                await page.goto(url, wait_until="load", timeout=60000)
                await settle(page, scene)
                m = await page.evaluate(MEASURE)
            except Exception as e:                              # noqa: BLE001
                notes.append(("FAIL", f"{scene}: the screen did not come up",
                              f"{type(e).__name__}"))
                failed += 1
                continue
            m["scene"] = scene
            rows.append(m)
            if a.shots:
                await page.screenshot(path=os.path.join(shot_dir, f"{scene}.png"))

        await browser.close()

    # ── the assertions, over every scene at once ────────────────────────────
    print(f"{'scene':<11} {'minFont':>8} {'<12px':>6} {'spill':>6} {'decor':>6} {'scroll':>7} {'tiny':>5} {'nav':>4}  worst unreachable")
    for m in rows:
        worst = (m["spill"][0]["what"] + f" +{m['spill'][0]['over']}px") if m["spill"] else "-"
        print(f"{m['scene']:<11} {str(m['minFont']):>8} {m['smallCount']:>6} "
              f"{m['spillCount']:>6} {m['decorSpill']:>6} {m['scrollable']:>7} {m['tinyCount']:>5} {m['navigable']:>4}  {worst[:40]}")
    print()

    check(len(rows) == len(SCENES),
          f"every one of the {len(SCENES)} screens comes up at {DECK_W}x{DECK_H}",
          f"{len(rows)} reached")

    no_hscroll = [m for m in rows if m["docScrollW"] > m["vw"] + 1]
    check(not no_hscroll,
          "no screen scrolls horizontally on the Deck panel",
          ", ".join(f"{m['scene']} ({m['docScrollW']}px)" for m in no_hscroll) or "all fit in 1280")

    illegible = [m for m in rows if m["minFont"] is not None and m["minFont"] < MIN_FONT_PX]
    check(not illegible,
          f"no rendered text is smaller than {MIN_FONT_PX}px",
          ", ".join(f"{m['scene']} {m['minFont']}px ({m['minFontEl']})" for m in illegible)
          or f"smallest anywhere: {min((m['minFont'] for m in rows if m['minFont']), default=0)}px")

    spilling = [m for m in rows if m["spillCount"] > 0]
    check(not spilling,
          "nothing a player needs is unreachable on the panel",
          "; ".join(f"{m['scene']}: {m['spillCount']} — {m['spill'][0]['what']} +{m['spill'][0]['over']}px "
                    f"({m['spill'][0]['text']!r})" for m in spilling) or "every scene fits")

    unreachable = [m for m in rows if m["navigable"] == 0 and m["scene"] != "combat"]
    check(not unreachable,
          "every menu screen has something a controller can focus",
          ", ".join(m["scene"] for m in unreachable) or "all navigable")

    tinyish = [m for m in rows if m["tinyCount"] > 0]
    if tinyish:
        notes.append(("WARN", f"controls under {MIN_TARGET_PX:.0f}px on a trackpad",
                      "; ".join(f"{m['scene']}: {m['tinyCount']} ({m['tiny'][0]['what']} {m['tiny'][0]['px']}px)"
                                for m in tinyish)))
    warnish = [m for m in rows if m["minFont"] is not None and m["minFont"] < WARN_FONT_PX]
    if warnish:
        notes.append(("WARN", f"text under {WARN_FONT_PX:.0f}px, legible but tight at 7 inches",
                      ", ".join(f"{m['scene']} {m['minFont']}px" for m in warnish)))

    check(not errors, "zero console errors across every screen", "; ".join(errors[:4]))

    for kind, label, detail in notes:
        if kind != "PASS" or a.verbose:
            print(f"{kind}  {label}" + (f"  - {detail}" if detail else ""))
    print("\nRESULT: %d passed, %d failed" % (passed, failed))
    print("""
NOT CHECKABLE UNTIL THERE IS A BUILD: SteamOS/Proton compatibility, the absence
of a launcher or compatibility warning, suspend/resume against a real sleeping
Deck, and Valve's own review. Those are the other half of Deck Verified.""")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--shots", action="store_true", help="write a PNG per scene")
    sys.exit(asyncio.run(main(ap.parse_args())))
