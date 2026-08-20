"""Critic runner for the card-feel showcase harness.

Drives http://localhost:8777/tests/cards-feel/index.html with Playwright,
captures motion strips (frames N ms apart) into shots/critic/, and records
rAF-accurate transform traces so hover/refan/play durations can be MEASURED
rather than guessed.

    python tests/critic-cardfeel/run.py [scenario ...]      (default: all)

Outputs:
    shots/critic/<name>_f0..fN.png    motion strips
    shots/critic/<name>.json          trace + fps + console errors
"""
import asyncio, sys, os, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "shots", "critic")
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:8777/tests/cards-feel/index.html"

W, H = 1600, 900

# ── page-side instrumentation ───────────────────────────────────────────────
INSTRUMENT = r"""
window.__T = { rec: [], on: false, t0: 0 };
window.__trace = (ms) => {
  const T = window.__T; T.rec = []; T.on = true; T.t0 = performance.now();
  const f = () => {
    if (!T.on) return;
    const now = performance.now() - T.t0;
    const H = window.MMTEST.hand;
    T.rec.push({
      t: +now.toFixed(1),
      cards: H.slots.map(s => ({
        u: s.card.uid,
        x: +s.view.transform.x.toFixed(2),
        y: +s.view.transform.y.toFixed(2),
        r: +s.view.transform.rot.toFixed(2),
        s: +s.view.transform.scale.toFixed(4),
        z: s.view.transform.z | 0,
      })),
      fly: H.flying.size,
      flyc: [...H.flying].map(s => ({ u: s.card.uid,
        x: +s.view.transform.x.toFixed(1), y: +s.view.transform.y.toFixed(1),
        r: +s.view.transform.rot.toFixed(1), s: +s.view.transform.scale.toFixed(3),
        o: +(getComputedStyle(s.view.el).opacity), })),
      arrow: H.el.querySelector('.mm-hand__arrow').classList.contains('is-on'),
      snapped: H.el.querySelector('.mm-hand__arrow').classList.contains('is-snapped'),
      apath: (H.el.querySelector('.mm-arrow__glow').getAttribute('d')||'').slice(0,160),
    });
    if (now < ms) requestAnimationFrame(f); else T.on = false;
  };
  requestAnimationFrame(f);
  return true;
};
window.__dump = () => JSON.parse(JSON.stringify(window.__T.rec));
window.__geo = () => {
  const H = window.MMTEST.hand;
  return H.slots.map(s => {
    const b = s.view.el.getBoundingClientRect();
    return { u: s.card.uid, name: s.card.def.name,
             x: +s.view.transform.x.toFixed(1), y: +s.view.transform.y.toFixed(1),
             rot: +s.view.transform.rot.toFixed(2), sc: +s.view.transform.scale.toFixed(3),
             rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
             playable: s.playable };
  });
};
window.__fps = async () => { let n=0; const t0=performance.now();
  await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};requestAnimationFrame(f)});
  return n; };
"""


class Runner:
    def __init__(self, page, name):
        self.page, self.name, self.i = page, name, 0
        self.meta = {}

    async def shot(self, tag=None):
        n = f"{self.name}_f{self.i}" if tag is None else f"{self.name}_{tag}"
        try:
            t = await self.page.evaluate("performance.now()-(window.__T?window.__T.t0:0)")
        except Exception:
            t = None
        await self.page.screenshot(path=os.path.join(OUT, n + ".png"), animations="allow")
        self.meta.setdefault("stamps", []).append([n, round(t, 1) if t else t])
        self.i += 1
        return n

    async def strip(self, count, interval=0.09, during=None):
        """Capture `count` frames `interval` apart. `during` is an awaitable
        coroutine factory kicked off before frame 0."""
        if during:
            asyncio.ensure_future(during())
        for _ in range(count):
            await self.shot()
            await self.page.wait_for_timeout(int(interval * 1000))


async def boot(pw, errors, logs, w=W, h=H, reduce_motion="no-preference"):
    browser = await pw.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
        "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
        "--autoplay-policy=no-user-gesture-required",
    ])
    ctx = await browser.new_context(viewport={"width": w, "height": h},
                                    device_scale_factor=1.0, reduced_motion=reduce_motion)
    page = await ctx.new_page()
    page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                  errors.append(m.text) if m.type == "error" else None))
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    await page.goto(URL, wait_until="load", timeout=45000)
    await page.wait_for_timeout(2000)
    await page.evaluate(INSTRUMENT)
    return browser, page


async def card_center(page, idx):
    g = await page.evaluate("window.__geo()")
    c = g[idx]
    r = c["rect"]
    return r[0] + r[2] / 2, r[1] + r[3] * 0.55, g


# ── scenarios ───────────────────────────────────────────────────────────────
async def sc_baseline(page, errors):
    r = Runner(page, "baseline")
    await page.click("#size-7")
    await page.wait_for_timeout(900)
    await r.shot("still")
    r.meta["geo7"] = await page.evaluate("window.__geo()")
    r.meta["fps_idle"] = await page.evaluate("window.__fps()")
    r.meta["viewport"] = [W, H]
    r.meta["cardbox"] = await page.evaluate(
        "(()=>{const e=document.querySelector('.mm-card');const b=e.getBoundingClientRect();"
        "const cs=getComputedStyle(e);return {rect:[b.width,b.height],css:[cs.width,cs.height],"
        "bottom:b.bottom, vh:innerHeight};})()")
    return r


async def sc_hover(page, errors):
    r = Runner(page, "hover")
    await page.click("#size-7")
    await page.wait_for_timeout(800)
    cx, cy, g = await card_center(page, 3)
    # park off-card first
    await page.mouse.move(cx, H - 20)
    await page.mouse.move(800, 300)
    await page.wait_for_timeout(400)
    await page.evaluate("window.__trace(1400)")
    await page.mouse.move(cx, cy, steps=2)
    for _ in range(8):
        await r.shot()
        await page.wait_for_timeout(60)
    await page.wait_for_timeout(500)
    r.meta["trace_in"] = await page.evaluate("window.__dump()")

    # hover OUT
    await page.wait_for_timeout(300)
    await page.evaluate("window.__trace(1200)")
    await page.mouse.move(800, 260, steps=2)
    r2 = Runner(page, "hoverout")
    for _ in range(8):
        await r2.shot()
        await page.wait_for_timeout(60)
    r.meta["trace_out"] = await page.evaluate("window.__dump()")

    # oscillation test: sit exactly on the seam between two cards
    g = await page.evaluate("window.__geo()")
    seam_x = (g[3]["rect"][0] + g[3]["rect"][2] + g[4]["rect"][0]) / 2
    seam_y = g[3]["rect"][1] + g[3]["rect"][3] * 0.5
    await page.mouse.move(600, 300)
    await page.wait_for_timeout(300)
    await page.evaluate("window.__trace(1500)")
    await page.mouse.move(seam_x, seam_y, steps=3)
    for k in range(30):
        await page.mouse.move(seam_x + (0.6 if k % 2 else -0.6), seam_y)
        await page.wait_for_timeout(35)
    r.meta["trace_seam"] = await page.evaluate("window.__dump()")
    r.meta["seam_pt"] = [seam_x, seam_y]
    await Runner(page, "seam").shot("still")
    return r


async def sc_arc(page, errors):
    r = Runner(page, "arc")
    out = {}
    for n in (1, 3, 5, 8, 12):
        await page.mouse.move(800, 200)
        await page.click(f"#size-{n}")
        await page.wait_for_timeout(900)
        await r.shot(f"n{n}")
        out[n] = await page.evaluate("window.__geo()")
    r.meta["geo"] = out
    # re-fan easing: 5 -> 12, strip it
    await page.click("#size-5")
    await page.wait_for_timeout(800)
    await page.evaluate("window.__trace(1200)")
    rr = Runner(page, "refan")
    asyncio.ensure_future(page.click("#size-12"))
    for _ in range(9):
        await rr.shot()
        await page.wait_for_timeout(70)
    r.meta["trace_refan"] = await page.evaluate("window.__dump()")
    return r


async def sc_drag(page, errors):
    r = Runner(page, "drag")
    await page.click("#size-7")
    await page.wait_for_timeout(900)
    g = await page.evaluate("window.__geo()")
    # find an enemy-targeted card
    idx = await page.evaluate(
        "window.MMTEST.hand.slots.findIndex(s=>s.card.def.target==='enemy')")
    r.meta["dragIdx"] = idx
    r.meta["dragCard"] = g[idx]["name"] if idx >= 0 else None
    c = g[idx]["rect"]
    sx, sy = c[0] + c[2] / 2, c[1] + c[3] * 0.6
    foe = await page.evaluate(
        "(()=>{const b=document.querySelector('.foe[data-id=\"grumble\"] .foe__body').getBoundingClientRect();"
        "return [b.left+b.width/2, b.top+b.height/2];})()")
    await page.evaluate("window.__trace(3000)")
    await page.mouse.move(sx, sy)
    await page.wait_for_timeout(120)
    await page.mouse.down()
    await r.shot()
    # drag upward in steps, screenshotting
    pts = [(sx, sy - 120), (sx + 60, sy - 300), (sx + 120, 430), (foe[0] - 140, 320),
           (foe[0] - 30, foe[1] + 40), (foe[0], foe[1])]
    for (px, py) in pts:
        await page.mouse.move(px, py, steps=5)
        await page.wait_for_timeout(90)
        await r.shot()
    await page.wait_for_timeout(120)
    await r.shot()
    r.meta["snapped_geo"] = await page.evaluate(
        "(()=>{const a=document.querySelector('.mm-hand__arrow');"
        "return {cls:a.className.baseVal||a.getAttribute('class'),"
        "glow:a.querySelector('.mm-arrow__glow').getAttribute('d'),"
        "ret:a.querySelector('.mm-arrow__reticle').getAttribute('transform'),"
        "nums:[...document.querySelectorAll('.mm-card__num')].map(n=>[n.textContent,n.className])};})()")
    await r.shot("snapped")
    # move off target to test un-snap
    await page.mouse.move(foe[0], 700, steps=6)
    await page.wait_for_timeout(150)
    await r.shot("unsnapped")
    await page.mouse.move(foe[0], foe[1], steps=6)
    await page.wait_for_timeout(150)
    await page.mouse.up()
    r.meta["trace"] = await page.evaluate("window.__dump()")
    await page.wait_for_timeout(200)
    return r


async def sc_play(page, errors):
    r = Runner(page, "play")
    await page.mouse.move(800, 200)
    await page.click("#size-7")
    await page.wait_for_timeout(900)
    await page.evaluate("window.__trace(2200)")
    await page.evaluate(
        "(()=>{const c=window.MMTEST.hand.cards().find(c=>c.def.target==='enemy');"
        "window.MMTEST.hand.playCard(c.uid,'grumble');})()")
    for _ in range(12):
        await r.shot()
        await page.wait_for_timeout(70)
    r.meta["trace"] = await page.evaluate("window.__dump()")
    return r


async def sc_draw(page, errors):
    r = Runner(page, "draw")
    await page.mouse.move(800, 200)
    await page.click("#size-3")
    await page.wait_for_timeout(800)
    await page.evaluate("window.__trace(1600)")
    asyncio.ensure_future(page.click("#btn-draw-5"))
    for _ in range(10):
        await r.shot()
        await page.wait_for_timeout(70)
    r.meta["trace"] = await page.evaluate("window.__dump()")
    return r


async def sc_discard(page, errors):
    r = Runner(page, "discard")
    await page.mouse.move(800, 200)
    await page.click("#size-7")
    await page.wait_for_timeout(800)
    await page.evaluate("window.__trace(1600)")
    asyncio.ensure_future(page.click("#btn-discard-all"))
    for _ in range(10):
        await r.shot()
        await page.wait_for_timeout(70)
    r.meta["trace"] = await page.evaluate("window.__dump()")
    return r


async def sc_exhaust(page, errors):
    r = Runner(page, "exhaust")
    await page.mouse.move(800, 200)
    await page.click("#size-7")
    await page.wait_for_timeout(800)
    await page.evaluate("window.__trace(1600)")
    asyncio.ensure_future(page.click("#btn-exhaust"))
    for _ in range(10):
        await r.shot()
        await page.wait_for_timeout(70)
    r.meta["trace"] = await page.evaluate("window.__dump()")
    return r


async def sc_unplayable(page, errors):
    r = Runner(page, "unplayable")
    await page.mouse.move(800, 200)
    await page.click("#size-7")
    await page.wait_for_timeout(800)
    await r.shot("energy3")
    await page.click("#btn-energy")   # energy + (first match) -- resolve below
    await page.wait_for_timeout(400)
    # set energy 0 directly to be sure
    await page.evaluate("window.MMTEST.setEnergy(0)")
    await page.wait_for_timeout(800)
    await r.shot("energy0")
    r.meta["geo0"] = await page.evaluate("window.__geo()")
    r.meta["classes"] = await page.evaluate(
        "[...document.querySelectorAll('.mm-card')].map(e=>({id:e.dataset.cardId,c:e.className,"
        "op:getComputedStyle(e).opacity,fil:getComputedStyle(e).filter}))")
    # greyscale check: is it colour-only?
    await page.evaluate("window.MMTEST.setEnergy(3)")
    await page.wait_for_timeout(600)
    await page.evaluate("document.documentElement.style.filter='grayscale(1)'")
    await page.evaluate("window.MMTEST.setEnergy(1)")
    await page.wait_for_timeout(800)
    await r.shot("grayscale_e1")
    await page.evaluate("document.documentElement.style.filter=''")
    await page.evaluate("window.MMTEST.setEnergy(3)")
    return r


async def sc_numbers(page, errors):
    r = Runner(page, "numbers")
    await page.mouse.move(800, 200)
    await page.click("#size-7")
    await page.wait_for_timeout(800)
    await r.shot("base")
    await page.click("#btn-upgrade-all")
    await page.wait_for_timeout(700)
    await r.shot("upgraded")
    r.meta["upgraded_nums"] = await page.evaluate(
        "[...document.querySelectorAll('.mm-card')].map(e=>({n:e.querySelector('.mm-card__name').textContent,"
        "nums:[...e.querySelectorAll('.mm-card__num')].map(x=>[x.textContent,x.className,getComputedStyle(x).color])}))")
    # boosted / reduced via keyboard aim at grumble (x1.5) then chandy (x0.6)
    await page.keyboard.press("Escape")
    await page.evaluate(
        "(()=>{const h=window.MMTEST.hand;const i=h.slots.findIndex(s=>s.card.def.target==='enemy');"
        "h._selectIdx(i);h._confirm();})()")
    await page.wait_for_timeout(500)
    await r.shot("preview_grumble")
    r.meta["boosted"] = await page.evaluate(
        "[...document.querySelectorAll('.mm-card')].map(e=>[...e.querySelectorAll('.mm-card__num')]"
        ".map(x=>[x.textContent,x.className,getComputedStyle(x).color])).filter(a=>a.some(b=>b[1]!=='mm-card__num'))")
    await page.keyboard.press("Tab")
    await page.wait_for_timeout(200)
    await page.keyboard.press("Tab")
    await page.wait_for_timeout(500)
    await r.shot("preview_chandy")
    r.meta["reduced"] = await page.evaluate(
        "[...document.querySelectorAll('.mm-card')].map(e=>[...e.querySelectorAll('.mm-card__num')]"
        ".map(x=>[x.textContent,x.className,getComputedStyle(x).color])).filter(a=>a.some(b=>b[1]!=='mm-card__num'))")
    await page.keyboard.press("Escape")
    return r


async def sc_keyboard(page, errors):
    r = Runner(page, "keyboard")
    await page.mouse.move(800, 120)
    await page.click("#size-7")
    await page.wait_for_timeout(800)
    await page.evaluate("document.activeElement.blur()")
    await page.wait_for_timeout(200)
    await r.shot("k0_start")
    r.meta["focus_before"] = await page.evaluate("document.activeElement.tagName+'.'+document.activeElement.className")
    await page.keyboard.press("3")
    await page.wait_for_timeout(400)
    await r.shot("k1_num3")
    r.meta["focus_after_3"] = await page.evaluate("document.activeElement.tagName+'.'+document.activeElement.className")
    r.meta["outline"] = await page.evaluate(
        "(()=>{const s=document.querySelector('.mm-card.is-selected');if(!s)return null;const c=getComputedStyle(s);"
        "return {outline:c.outline,ol:c.outlineWidth,sel:s.className,tabindex:s.getAttribute('tabindex')};})()")
    await page.keyboard.press("ArrowRight")
    await page.wait_for_timeout(350)
    await r.shot("k2_right")
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(450)
    await r.shot("k3_enter")
    r.meta["aim"] = await page.evaluate("!!window.MMTEST.hand.aim && (window.MMTEST.hand.aim.snap||{}).id")
    await page.keyboard.press("Tab")
    await page.wait_for_timeout(350)
    await r.shot("k4_tab")
    r.meta["aim2"] = await page.evaluate("!!window.MMTEST.hand.aim && (window.MMTEST.hand.aim.snap||{}).id")
    r.meta["tab_stole_focus"] = await page.evaluate("document.activeElement.tagName+'.'+(document.activeElement.className||'')")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(350)
    await r.shot("k5_esc")
    r.meta["aim_after_esc"] = await page.evaluate("!!window.MMTEST.hand.aim")
    # play by keyboard
    await page.keyboard.press("3")
    await page.wait_for_timeout(250)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(300)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(600)
    await r.shot("k6_played")
    r.meta["count_after"] = await page.evaluate("window.MMTEST.hand.count")
    # Tab with no aim: does it reach the hand at all?
    await page.evaluate("document.activeElement.blur()")
    for _ in range(3):
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(120)
    r.meta["tab3_focus"] = await page.evaluate("document.activeElement.tagName+'.'+(document.activeElement.className||'')+'#'+(document.activeElement.id||'')")
    await r.shot("k7_tabfocus")
    return r


async def sc_stress(page, errors):
    """fps under motion + interrupt a re-fan mid-flight."""
    r = Runner(page, "stress")
    await page.click("#size-12")
    await page.wait_for_timeout(900)
    fps_task = page.evaluate("window.__fps()")
    await page.click("#btn-draw-5")
    fps = await fps_task
    r.meta["fps_motion"] = fps
    await page.wait_for_timeout(1200)
    # interrupt: start refan then immediately change again
    await page.click("#size-3")
    await page.wait_for_timeout(80)
    await page.evaluate("window.__trace(1000)")
    await page.click("#size-11")
    await page.wait_for_timeout(60)
    await page.click("#size-4")
    for _ in range(8):
        await r.shot()
        await page.wait_for_timeout(70)
    r.meta["trace_interrupt"] = await page.evaluate("window.__dump()")
    r.meta["fps_idle2"] = await page.evaluate("window.__fps()")
    return r


async def _slowmo(page, name, btn, frames=11, setup="#size-7", scale=0.25):
    """Same motion, clock.scale slowed so screenshot latency (~350ms real) equals
    ~90ms of GAME time. Shape is identical; only the rate changes. Real durations
    come from the rAF traces captured at scale 1."""
    r = Runner(page, name)
    await page.mouse.move(800, 200)
    await page.click(setup)
    await page.wait_for_timeout(900)
    await page.evaluate(f"window.MMTEST.clock.scale={scale}")
    await page.evaluate("window.__trace(9000)")
    if btn.startswith("js:"):
        asyncio.ensure_future(page.evaluate(btn[3:]))
    else:
        asyncio.ensure_future(page.click(btn))
    for _ in range(frames):
        await r.shot()
    r.meta["trace"] = await page.evaluate("window.__dump()")
    r.meta["scale"] = scale
    await page.evaluate("window.MMTEST.clock.scale=1")
    return r


async def sc_slow_draw(page, e):
    return await _slowmo(page, "slowdraw", "#btn-draw-5", 11, "#size-3")
async def sc_slow_discard(page, e):
    return await _slowmo(page, "slowdiscard", "#btn-discard-all", 11)
async def sc_slow_exhaust(page, e):
    return await _slowmo(page, "slowexhaust", "#btn-exhaust", 12)
async def sc_slow_play(page, e):
    return await _slowmo(page, "slowplay",
        "js:(()=>{const c=window.MMTEST.hand.cards().find(c=>c.def.target==='enemy');"
        "window.MMTEST.hand.playCard(c.uid,'grumble');})()", 13)
async def sc_slow_refan(page, e):
    return await _slowmo(page, "slowrefan", "#size-12", 10, "#size-4", 0.3)


SCENARIOS = {
    "slowdraw": sc_slow_draw, "slowdiscard": sc_slow_discard,
    "slowexhaust": sc_slow_exhaust, "slowplay": sc_slow_play,
    "slowrefan": sc_slow_refan,
    "baseline": sc_baseline, "hover": sc_hover, "arc": sc_arc, "drag": sc_drag,
    "play": sc_play, "draw": sc_draw, "discard": sc_discard, "exhaust": sc_exhaust,
    "unplayable": sc_unplayable, "numbers": sc_numbers, "keyboard": sc_keyboard,
    "stress": sc_stress,
}


async def main(names):
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        for nm in names:
            errors, logs = [], []
            browser, page = await boot(pw, errors, logs)
            try:
                r = await SCENARIOS[nm](page, errors)
                meta = r.meta
            except Exception as e:
                meta = {"EXC": repr(e)}
                errors.append("RUNNER " + repr(e))
            meta["errors"] = errors[:40]
            meta["logs"] = logs[-40:]
            with open(os.path.join(OUT, nm + ".json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=1)
            print(nm, "done. errors:", len(errors))
            await browser.close()


if __name__ == "__main__":
    args = sys.argv[1:] or list(SCENARIOS)
    asyncio.run(main(args))
