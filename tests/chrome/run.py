"""Chrome harness checks — tooltip, HUD, deck view, settings, icons.

    python tests/chrome/run.py            # everything
    python tests/chrome/run.py --quick    # skip the per-anchor sweep

Asserts, from the RUNNING page and from ACTUAL PNG PIXELS:

  1. every keyword/status in all three registries resolves to a usable
     tooltip — a title, a non-empty body, and no "undefined"/"{n}"/"NaN" leak
  2. no tooltip overflows the viewport, and none covers its own anchor
  3. contrast >= 4.5:1 on tooltip body text and on HUD text, measured by
     sampling the rendered pixels of each element's box
  4. no two icons share a greyscale silhouette (alpha-only, thresholded)

Writes shots/chrome-*.png and prints `RESULT: n checks, m errors`.
"""
import argparse, asyncio, json, os, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)
URL = "http://localhost:8777/tests/chrome/index.html"

CHECKS = 0
ERRORS = []


def ok(label):
    global CHECKS
    CHECKS += 1
    print(f"  ok   {label}")


def bad(label):
    global CHECKS
    CHECKS += 1
    ERRORS.append(label)
    print(f"  FAIL {label}")


# ── contrast, measured from real pixels ─────────────────────────────────────
def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(px):
    return 0.2126 * _lin(px[0]) + 0.7152 * _lin(px[1]) + 0.0722 * _lin(px[2])


def contrast_of_box(img, box, min_share=0.004):
    """Background = the most common luminance. Foreground = the luminance
    furthest from it that still covers `min_share` of the box (so a stray
    anti-aliased pixel cannot flatter the result). Returns (ratio, n_px)."""
    x, y, w, h = [int(round(v)) for v in box]
    x = max(0, x); y = max(0, y)
    w = max(1, min(w, img.width - x)); h = max(1, min(h, img.height - y))
    crop = img.crop((x, y, x + w, y + h)).convert("RGB")
    px = list(crop.getdata())
    if not px:
        return (0.0, 0)
    buckets = Counter()
    for p in px:
        buckets[round(luminance(p), 3)] += 1
    total = len(px)
    bg = buckets.most_common(1)[0][0]
    need = max(3, int(total * min_share))
    fg, best = bg, -1.0
    for lum, n in buckets.items():
        if n < need:
            continue
        d = abs(lum - bg)
        if d > best:
            best, fg = d, lum
    hi, lo = max(bg, fg), min(bg, fg)
    return ((hi + 0.05) / (lo + 0.05), total)


async def main(a):
    from playwright.async_api import async_playwright
    from PIL import Image

    console, errors = [], []

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
        ])
        page = await (await browser.new_context(
            viewport={"width": 1600, "height": 900}, device_scale_factor=1,
            reduced_motion="no-preference",
        )).new_page()
        page.on("console", lambda m: (console.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_function("window.CHROME && CHROME.keywords.length > 0", timeout=25000)
        await page.wait_for_timeout(900)

        async def snap(name, full=False, clip=None):
            path = os.path.join(SHOTS, f"{name}.png")
            await page.screenshot(path=path, full_page=full, clip=clip, animations="allow")
            return path

        print("\n── 1. registry coverage ──────────────────────────────────")
        audit = await page.evaluate("CHROME.auditKeywords()")
        print(f"  {audit['total']} ids resolved through the tooltip")
        if audit["bad"]:
            for i, (kid, why) in enumerate(audit["bad"][:12]):
                bad(f"keyword '{kid}': {why}")
            if len(audit["bad"]) > 12:
                bad(f"...and {len(audit['bad']) - 12} more unresolved keywords")
        else:
            ok(f"all {audit['total']} keywords/statuses resolve with a title and a body")

        counts = await page.evaluate(
            "({kw: CHROME.keywords.length, st: CHROME.statuses.length, ic: CHROME.ICON_IDS.length})")
        print(f"  registries: {counts['kw']} keywords, {counts['st']} statuses, {counts['ic']} icons")
        if counts["kw"] >= 90:
            ok(f"all three keyword registries merged ({counts['kw']} entries)")
        else:
            bad(f"only {counts['kw']} keywords merged — expected 90+ from three registries")

        print("\n── 2. tooltip placement ──────────────────────────────────")
        anchors = await page.evaluate("CHROME.anchors()")
        if a.quick:
            anchors = anchors[::7]
        print(f"  probing {len(anchors)} anchors")
        over = []
        covers = []
        empties = []
        for sel in anchors:
            await page.evaluate("CHROME.scrollTo(0)")
            try:
                await page.eval_on_selector(sel, "el => el.scrollIntoView({block:'center'})")
            except Exception:
                continue
            r = await page.evaluate("s => CHROME.probe(s)", sel)
            if r.get("error"):
                continue
            o = r["overflow"]
            if any(o.values()):
                over.append((sel, o, r["panel"]))
            if r["coversAnchor"]:
                covers.append((sel, r["side"]))
            if not (r.get("text") or "").strip():
                empties.append(sel)
        await page.evaluate("CHROME.hideTip()")

        if over:
            for sel, o, panel in over[:8]:
                sides = ",".join(k for k, v in o.items() if v)
                bad(f"tooltip overflows viewport ({sides}) on {sel} panel={panel}")
        else:
            ok(f"no tooltip overflows the viewport ({len(anchors)} anchors)")

        if covers:
            for sel, side in covers[:8]:
                bad(f"tooltip covers its own anchor on {sel} (placed {side})")
        else:
            ok("no tooltip covers the element it describes")

        if empties:
            bad(f"{len(empties)} tooltips rendered with no text, first: {empties[0]}")
        else:
            ok("every probed tooltip rendered visible text")

        print("\n── 3. contrast, from rendered pixels ─────────────────────")
        # HUD text
        await page.evaluate("CHROME.scrollTo(0)")
        await page.wait_for_timeout(200)
        hud_box = await page.eval_on_selector(".mm-hud", "el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")
        hud_png = await snap("chrome-hud", clip={"x": hud_box["x"], "y": hud_box["y"],
                                                 "width": hud_box["w"], "height": hud_box["h"]})
        img = Image.open(hud_png)
        targets = await page.evaluate("""() => {
          const sels = ['.mm-hud__where .mm-hud__t', '.mm-hud__gold .mm-hud__t',
                        '.mm-hud__barlabel', '.mm-hud__haunt .mm-hud__t',
                        '.mm-hud__seed .mm-hud__t', '.mm-hud__deck .mm-hud__t'];
          const base = document.querySelector('.mm-hud').getBoundingClientRect();
          return sels.map(s => { const e = document.querySelector(s); if (!e) return null;
            const r = e.getBoundingClientRect();
            return {sel: s, x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height}; }).filter(Boolean);
        }""")
        worst = None
        for t in targets:
            ratio, n = contrast_of_box(img, (t["x"], t["y"], t["w"], t["h"]))
            if n < 40:
                continue
            if worst is None or ratio < worst[1]:
                worst = (t["sel"], ratio)
            if ratio < 4.5:
                bad(f"HUD contrast {ratio:.2f}:1 on {t['sel']} (need 4.5)")
        if worst and worst[1] >= 4.5:
            ok(f"HUD text contrast >= 4.5:1 (worst {worst[0]} at {worst[1]:.2f}:1)")
        elif worst is None:
            bad("HUD contrast: no measurable text found")

        # Tooltip text
        # scroll FIRST: the tooltip closes on scroll by design, so showing it in
        # the same tick as scrollIntoView would immediately dismiss it.
        await page.eval_on_selector('[data-kw="ghoststep"]', "el => el.scrollIntoView({block:'center'})")
        await page.wait_for_timeout(250)
        await page.evaluate("""() => { const el = document.querySelector('[data-kw="ghoststep"]');
            CHROME.tooltip.show(el, CHROME.tooltip.keyword('ghoststep')); }""")
        await page.wait_for_timeout(400)
        tb = await page.eval_on_selector(".mm-tip", "el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")
        if not tb or tb["w"] < 2 or tb["h"] < 2:
            bad("tooltip panel had no size when shown for the contrast measurement")
            tb = {"x": 0, "y": 0, "w": 200, "h": 100}
        tip_png = await snap("chrome-tip", clip={"x": tb["x"], "y": tb["y"], "width": tb["w"], "height": tb["h"]})
        timg = Image.open(tip_png)
        tparts = await page.evaluate("""() => {
          const base = document.querySelector('.mm-tip').getBoundingClientRect();
          const out = [];
          for (const s of ['.mm-tip__title', '.mm-tip__body', '.mm-tip__sub', '.mm-tip__kw']) {
            const e = document.querySelector('.mm-tip ' + s); if (!e) continue;
            const r = e.getBoundingClientRect();
            out.push({sel: s, x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height});
          }
          return out;
        }""")
        tworst = None
        for t in tparts:
            ratio, n = contrast_of_box(timg, (t["x"], t["y"], t["w"], t["h"]))
            if n < 40:
                continue
            if tworst is None or ratio < tworst[1]:
                tworst = (t["sel"], ratio)
            if ratio < 4.5:
                bad(f"tooltip contrast {ratio:.2f}:1 on {t['sel']} (need 4.5)")
        if tworst and tworst[1] >= 4.5:
            ok(f"tooltip text contrast >= 4.5:1 (worst {tworst[0]} at {tworst[1]:.2f}:1)")
        elif tworst is None:
            bad("tooltip contrast: no measurable text found")

        print("\n── 4. icon silhouettes ───────────────────────────────────")
        # Rasterise each icon's path alone, alpha only, threshold, hash.
        sil = await page.evaluate("""async () => {
          const { ICON_IDS, iconPath } = CHROME;
          const N = 48, c = document.createElement('canvas');
          c.width = N; c.height = N;
          const g = c.getContext('2d', { willReadFrequently: true });
          const out = {};
          for (const id of ICON_IDS) {
            g.clearRect(0, 0, N, N);
            g.save(); g.scale(N / 24, N / 24);
            g.fillStyle = '#fff';
            g.fill(new Path2D(iconPath(id)), 'evenodd');
            g.restore();
            const d = g.getImageData(0, 0, N, N).data;
            let bits = '', ink = 0;
            for (let i = 3; i < d.length; i += 4) {
              const on = d[i] > 96 ? 1 : 0; bits += on; ink += on;
            }
            out[id] = { hash: bits, ink };
          }
          return out;
        }""")
        by_hash = {}
        thin = []
        for iid, v in sil.items():
            by_hash.setdefault(v["hash"], []).append(iid)
            if v["ink"] < 48:          # 48/2304 px = under ~2% coverage at 48px
                thin.append((iid, v["ink"]))
        dupes = [v for v in by_hash.values() if len(v) > 1]
        if dupes:
            for grp in dupes[:10]:
                bad("icons share a greyscale silhouette: " + " == ".join(grp))
        else:
            ok(f"all {len(sil)} icons have a unique greyscale silhouette")
        if thin:
            for iid, ink in thin[:6]:
                bad(f"icon '{iid}' is nearly empty at 48px ({ink} px of ink) — invisible at 16px")
        else:
            ok("every icon carries enough ink to read at 16px")

        # near-duplicate pass: Hamming distance on the 48x48 bitmaps
        ids = list(sil.keys())
        near = []
        for i in range(len(ids)):
            hi = sil[ids[i]]["hash"]
            for j in range(i + 1, len(ids)):
                hj = sil[ids[j]]["hash"]
                d = sum(1 for x, y in zip(hi, hj) if x != y)
                if d < 40:            # <1.7% of 2304 px differ
                    near.append((ids[i], ids[j], d))
        if near:
            for x, y, d in near[:8]:
                bad(f"icons '{x}' and '{y}' differ by only {d}/2304 px — same silhouette at 16px")
        else:
            ok("no two icons are within 40px of each other's silhouette")

        print("\n── 5. keyboard + modal behaviour ─────────────────────────")
        await page.evaluate("CHROME.hideTip()")
        await page.evaluate("CHROME.scrollTo(0)")
        await page.eval_on_selector('[data-kw="ghoststep"]', "el => el.focus()")
        await page.wait_for_timeout(300)
        shown = await page.evaluate("!document.querySelector('.mm-tip').hidden")
        (ok if shown else bad)("focusing an anchor opens its tooltip")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(150)
        hidden = await page.evaluate("document.querySelector('.mm-tip').hidden")
        (ok if hidden else bad)("Escape dismisses the tooltip")

        await page.click("#b-settings")
        await page.wait_for_timeout(600)
        inside = await page.evaluate("!!document.activeElement.closest('.mm-modal__dialog')")
        (ok if inside else bad)("settings modal moves focus inside itself")
        bg_inert = await page.evaluate("!!document.querySelector('#dom-layer > [inert]') || !!document.getElementById('gl')?.hasAttribute('inert')")
        (ok if bg_inert else bad)("modal makes the background inert")
        await snap("chrome-settings")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        closed = await page.evaluate("!document.querySelector('.mm-modal')")
        (ok if closed else bad)("Escape closes the modal")
        returned = await page.evaluate("document.activeElement?.id === 'b-settings'")
        (ok if returned else bad)("focus returns to the control that opened the modal")

        print("\n── 6. deck view ──────────────────────────────────────────")
        await page.click("#b-draw")
        await page.wait_for_timeout(900)
        await snap("chrome-drawpile")
        sorted_ok = await page.evaluate("""() => {
          const names = [...document.querySelectorAll('.mm-modal .mm-deck__cell')].map(c => c.getAttribute('aria-label'));
          const s = names.slice().sort((a,b)=>a.localeCompare(b));
          return names.length > 1 && JSON.stringify(names) === JSON.stringify(s);
        }""")
        (ok if sorted_ok else bad)("draw pile is shown sorted, not in true order")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)

        await page.click("#b-deck")
        await page.wait_for_timeout(900)
        nav = await page.evaluate("""async () => {
          const grid = document.querySelector('.mm-modal .mm-deck__grid');
          grid.focus();
          const before = document.activeElement;
          grid.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true}));
          await new Promise(r=>requestAnimationFrame(r));
          return document.activeElement !== before && !!document.activeElement.closest('.mm-deck__cell');
        }""")
        (ok if nav else bad)("deck view grid takes arrow-key navigation")
        await snap("chrome-deckview")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)

        print("\n── 7. accessibility switches ─────────────────────────────")
        await page.click("#b-large")
        await page.wait_for_timeout(500)
        large = await page.evaluate("""() => {
          const fs = parseFloat(getComputedStyle(document.querySelector('.mm-hud__t')).fontSize);
          const clipped = [...document.querySelectorAll('.mm-hud__chip, .mm-set__label')]
            .some(e => e.scrollWidth > e.clientWidth + 2);
          return { fs, clipped, attr: document.documentElement.dataset.largeText };
        }""")
        (ok if large["attr"] == "1" else bad)("large text sets data-large-text on <html>")
        (ok if not large["clipped"] else bad)("large text reflows without clipping HUD chips")
        await snap("chrome-largetext", full=False)
        await page.click("#b-large")
        await page.wait_for_timeout(300)

        for _ in range(2):     # off -> protanopia -> deuteranopia
            await page.click("#b-cb")
            await page.wait_for_timeout(250)
        cbattr = await page.evaluate("document.documentElement.dataset.colorblind")
        (ok if cbattr in ("protanopia", "deuteranopia", "tritanopia")
            else bad)(f"colourblind palette applies to <html> (got {cbattr!r})")
        pair = await page.evaluate("""() => {
          const cs = getComputedStyle(document.documentElement);
          const g = (n) => cs.getPropertyValue(n).trim();
          return { atk: g('--type-attack'), skl: g('--type-skill'),
                   good: g('--good-300'), bad: g('--threat-300'),
                   r: [g('--rarity-basic'), g('--rarity-common'), g('--rarity-uncommon'), g('--rarity-rare')] };
        }""")
        distinct = (pair["atk"] != pair["skl"] and pair["good"] != pair["bad"]
                    and len(set(pair["r"])) == 4)
        (ok if distinct else bad)(f"colourblind palette keeps all critical pairs distinct: {pair}")
        await snap("chrome-colorblind")
        await page.click("#b-cb")
        await page.click("#b-cb")   # back to off
        await page.wait_for_timeout(300)

        print("\n── 8. overview + fps ─────────────────────────────────────")
        await page.evaluate("CHROME.scrollTo(0)")
        await page.wait_for_timeout(200)
        await snap("chrome-overview", full=True)
        await page.evaluate("CHROME.scrollTo(document.body.scrollHeight)")
        await page.wait_for_timeout(300)
        await snap("chrome-icons-grey")

        # a nested-keyword tooltip, for the record
        await page.eval_on_selector('[data-kw="guard"]', "el => el.scrollIntoView({block:'center'})")
        await page.wait_for_timeout(250)
        await page.evaluate("""() => { const el = document.querySelector('[data-kw="guard"]');
            CHROME.tooltip.show(el, CHROME.tooltip.keyword('guard')); }""")
        await page.wait_for_timeout(400)
        await page.evaluate("""() => { const c = document.querySelector('.mm-tip .mm-tip__kw');
            if (c) CHROME.tooltip._showSub(c); }""")
        await page.wait_for_timeout(400)
        nested = await page.evaluate("!document.querySelector('.mm-tip--sub').hidden")
        (ok if nested else bad)("a keyword inside a tooltip opens a second-level tooltip")
        await snap("chrome-nested")

        perf = await page.evaluate("""(async()=>{let n=0;const t0=performance.now();
          await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
          return n})()""")
        print(f"  fps: {perf}")
        (ok if perf >= 58 else bad)(f"60fps with the whole harness live (measured {perf})")

        real_errors = [e for e in errors if "favicon" not in e.lower()]
        if real_errors:
            for e in real_errors[:10]:
                bad("console error: " + e[:220])
        else:
            ok("zero console errors")

        open(os.path.join(SHOTS, "chrome.state.json"), "w", encoding="utf-8").write(
            json.dumps({"audit": audit, "counts": counts, "fps": perf,
                        "errors": errors[:30], "console": console[-40:]}, indent=1))
        await browser.close()

    print(f"\nRESULT: {CHECKS} checks, {len(ERRORS)} errors")
    for e in ERRORS:
        print("  - " + e)
    return 1 if ERRORS else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
