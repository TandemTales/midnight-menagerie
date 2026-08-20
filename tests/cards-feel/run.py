"""Motion-strip harness for the card-feel showcase.

    python tests/cards-feel/run.py                 # every scene
    python tests/cards-feel/run.py hover play      # just these
    python tests/cards-feel/run.py --list

Writes shots/cf-<scene>_f0..fN.png — sequences of frames captured while the
interaction is running, so the MOTION can be judged, not just the pose.
Also prints numeric probes (hover completion time, fps under 12-card drag)
because "under 120ms" is a number, not a vibe.
"""
import asyncio, sys, os, json, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)
URL = "http://localhost:8777/tests/cards-feel/index.html"

W, H = 1500, 860
HAND_CLIP = {"x": 0, "y": 300, "width": W, "height": 560}
FULL_CLIP = None


class Cap:
    def __init__(self, page, name):
        self.page, self.name, self.i = page, name, 0

    async def frame(self, clip=HAND_CLIP, tag=None):
        p = os.path.join(SHOTS, f"cf-{self.name}_f{self.i}.png" if tag is None
                         else f"cf-{self.name}-{tag}.png")
        await self.page.screenshot(path=p, clip=clip, animations="allow")
        self.i += 1
        return p

    async def strip(self, n, gap_ms=90, clip=HAND_CLIP):
        for _ in range(n):
            await self.frame(clip)
            if gap_ms:
                await self.page.wait_for_timeout(gap_ms)


async def card_pos(page, i):
    return await page.evaluate(
        "(i)=>{const s=window.MMTEST.hand.slots[i];return s?{x:s.cur.x,y:s.cur.y}:null}", i)


async def foe_pos(page, fid):
    return await page.evaluate(
        """(id)=>{const e=document.querySelector(`.foe[data-id="${id}"] .foe__body`);
                  const b=e.getBoundingClientRect();
                  return {x:b.left+b.width/2, y:b.top+b.height/2}}""", fid)


async def slow(page, s=1.0):
    """Slow the game clock so a motion strip samples the arc, not the aftermath.
    Screenshots cost ~120ms each, so at 1x a 400ms arc is 3 frames."""
    await page.evaluate("(s)=>window.MMTEST.clock.scale=s", s)


async def size(page, n):
    await page.evaluate("(n)=>window.MMTEST.setSize(n)", n)
    await page.wait_for_timeout(650)


# ── scenes ──────────────────────────────────────────────────────────────────
async def scene_idle(page):
    c = Cap(page, "idle")
    for n in (1, 3, 5, 7, 10, 12):
        await size(page, n)
        await c.frame(HAND_CLIP, tag=f"n{n}")
    await size(page, 7)


async def scene_gallery(page):
    """Every type and rarity side by side, static, for anatomy inspection."""
    await size(page, 12)
    await page.wait_for_timeout(700)
    c = Cap(page, "gallery")
    await c.frame(FULL_CLIP, tag="all")
    # a close crop on the middle three cards
    await c.frame({"x": 430, "y": 380, "width": 640, "height": 470}, tag="closeup")


async def scene_hover(page):
    """The single most-felt interaction. Frames every 40ms so <120ms is provable."""
    await size(page, 7)
    p = await card_pos(page, 4)
    away = {"x": W / 2, "y": 200}
    await page.mouse.move(away["x"], away["y"])
    await page.wait_for_timeout(400)

    # numeric probe first: sample the card's y every frame while hovering
    probe = await page.evaluate(
        """async ([x,y]) => {
            const h = window.MMTEST.hand, s = h.slots[4];
            const y0 = s.cur.y;
            const out = [];
            const t0 = performance.now();
            const el = document.querySelector('.mm-hand__hit');
            el.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));
            await new Promise(r=>{
              const f=()=>{ out.push([+(performance.now()-t0).toFixed(1), +s.cur.y.toFixed(1), +s.cur.scale.toFixed(3)]);
                            performance.now()-t0<260?requestAnimationFrame(f):r(); };
              requestAnimationFrame(f);
            });
            const yEnd = s.to.y;
            const pct = out.map(o=>[o[0], +(((y0-o[1])/(y0-yEnd))*100).toFixed(1)]);
            const done = pct.find(o=>o[1]>=95);
            return { y0, yEnd, t95: done?done[0]:null, curve: pct.filter((_,i)=>i%2===0).slice(0,10) };
        }""", [p["x"], p["y"] - 120])
    print("  hover probe:", json.dumps(probe))

    # visual strip: out -> in
    await page.mouse.move(away["x"], away["y"])
    await page.wait_for_timeout(400)
    c = Cap(page, "hover-in")
    await c.frame(HAND_CLIP)
    await page.mouse.move(p["x"], p["y"] - 120)
    await c.strip(6, gap_ms=40)

    c2 = Cap(page, "hover-out")
    await c2.frame(HAND_CLIP)
    await page.mouse.move(away["x"], away["y"])
    await c2.strip(5, gap_ms=40)

    # hover a neighbour to show the nudge
    p2 = await card_pos(page, 1)
    await page.mouse.move(p2["x"], p2["y"] - 120)
    await page.wait_for_timeout(300)
    c3 = Cap(page, "hover-edge")
    await c3.frame(HAND_CLIP)
    await page.mouse.move(away["x"], away["y"])
    await page.wait_for_timeout(300)


async def scene_drag(page):
    """Targeted card: park + curved arrow + snap onto an enemy."""
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    p = await card_pos(page, 0)          # Scratch — targets an enemy
    f = await foe_pos(page, "grumble")
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.wait_for_timeout(180)
    await page.mouse.down()
    c = Cap(page, "drag")
    steps = 14
    for i in range(1, steps + 1):
        t = i / steps
        await page.mouse.move(p["x"] + (f["x"] - p["x"]) * t, (p["y"] - 120) + (f["y"] - p["y"] + 120) * t)
        await page.wait_for_timeout(45)
        if i % 2 == 0:
            await c.frame(FULL_CLIP)
    # linger on the target so the reticle is unmistakable
    await page.wait_for_timeout(220)
    await c.frame(FULL_CLIP, tag="snapped")
    # slide off the enemy -> invalid state
    await page.mouse.move(f["x"] - 420, f["y"] + 60)
    await page.wait_for_timeout(220)
    await c.frame(FULL_CLIP, tag="unsnapped")
    await page.mouse.move(f["x"], f["y"])
    await page.wait_for_timeout(200)
    await page.mouse.up()
    c2 = Cap(page, "drag-release")
    await c2.strip(9, gap_ms=90, clip=FULL_CLIP)


async def scene_threshold(page):
    """Non-targeted card: the commit threshold line."""
    await size(page, 7)
    p = await card_pos(page, 1)          # Curl Up — self target
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.wait_for_timeout(150)
    await page.mouse.down()
    c = Cap(page, "threshold")
    await page.mouse.move(p["x"] + 20, p["y"] - 200)
    await page.wait_for_timeout(120); await c.frame(FULL_CLIP)
    await page.mouse.move(p["x"] + 40, p["y"] - 330)
    await page.wait_for_timeout(120); await c.frame(FULL_CLIP)
    await page.mouse.move(p["x"] + 60, p["y"] - 480)
    await page.wait_for_timeout(160); await c.frame(FULL_CLIP)
    await page.mouse.up()
    await c.strip(6, gap_ms=90, clip=FULL_CLIP)


async def scene_play(page):
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(5)")
    await page.wait_for_timeout(300)
    c = Cap(page, "play")
    await c.frame(FULL_CLIP)
    await slow(page, 0.32)
    await page.evaluate("""()=>{const k=window.MMTEST.hand.cards()[3];
                              window.MMTEST.hand.playCard(k.uid, 'grumble');}""")
    await c.strip(12, gap_ms=0, clip=FULL_CLIP)
    await slow(page, 1.0)


async def scene_draw(page):
    await size(page, 3)
    await page.wait_for_timeout(500)
    c = Cap(page, "draw")
    await c.frame(HAND_CLIP)
    await slow(page, 0.32)
    await page.click("#btn-draw-5")
    await c.strip(10, gap_ms=0)
    await slow(page, 1.0)


async def scene_discard(page):
    await size(page, 8)
    await page.wait_for_timeout(500)
    c = Cap(page, "discard")
    await c.frame(FULL_CLIP)
    await slow(page, 0.32)
    await page.click("#btn-discard-all")
    await c.strip(10, gap_ms=0, clip=FULL_CLIP)
    await slow(page, 1.0)


async def scene_exhaust(page):
    await size(page, 6)
    await page.wait_for_timeout(500)
    c = Cap(page, "exhaust")
    await c.frame(HAND_CLIP)
    await slow(page, 0.32)
    await page.click("#btn-exhaust")
    await c.strip(10, gap_ms=0)
    await slow(page, 1.0)


async def scene_unplayable(page):
    await size(page, 7)
    await page.evaluate("()=>window.MMTEST.setEnergy(1)")
    await page.wait_for_timeout(700)
    c = Cap(page, "unplayable")
    await c.frame(HAND_CLIP, tag="e1")
    await page.evaluate("()=>window.MMTEST.setEnergy(0)")
    await page.wait_for_timeout(600)
    await c.frame(HAND_CLIP, tag="e0")
    await page.evaluate("()=>window.MMTEST.setEnergy(3)")
    await page.wait_for_timeout(600)


async def scene_upgrade(page):
    """Upgrade + the live preview recolour (the §2 requirement)."""
    await size(page, 6)
    await page.wait_for_timeout(500)
    c = Cap(page, "upgrade")
    await c.frame(HAND_CLIP, tag="before")
    await page.click("#btn-upgrade-all")
    await page.wait_for_timeout(500)
    await c.frame(HAND_CLIP, tag="after")
    # preview recolour: hold a card over the vulnerable foe, then the resistant one
    p = await card_pos(page, 0)
    for fid, tag in (("grumble", "boosted"), ("chandy", "reduced")):
        f = await foe_pos(page, fid)
        await page.mouse.move(p["x"], p["y"] - 120)
        await page.mouse.down()
        await page.mouse.move(f["x"], f["y"], steps=8)
        await page.wait_for_timeout(320)
        await c.frame({"x": 330, "y": 240, "width": 840, "height": 560}, tag=tag)
        await page.mouse.move(p["x"], p["y"] - 120, steps=6)
        await page.mouse.up()
        await page.wait_for_timeout(350)


async def scene_keyboard(page):
    await size(page, 7)
    await page.wait_for_timeout(500)
    c = Cap(page, "keyboard")
    await page.keyboard.press("3")
    await page.wait_for_timeout(200); await c.frame(HAND_CLIP, tag="select3")
    await page.keyboard.press("ArrowRight")
    await page.wait_for_timeout(200); await c.frame(HAND_CLIP, tag="right")
    await page.keyboard.press("1")
    await page.wait_for_timeout(200)
    await page.keyboard.press("Enter")          # Scratch needs a target -> aim mode
    await page.wait_for_timeout(300); await c.frame(FULL_CLIP, tag="aim")
    await page.keyboard.press("Tab")
    await page.wait_for_timeout(300); await c.frame(FULL_CLIP, tag="tab")
    await page.keyboard.press("Enter")
    await c.strip(7, gap_ms=90, clip=FULL_CLIP)


async def scene_perf(page):
    """60fps with 12 cards while dragging is a hard requirement."""
    await size(page, 12)
    await page.evaluate("()=>window.MMTEST.setEnergy(9)")
    await page.wait_for_timeout(600)
    p = await card_pos(page, 0)
    f = await foe_pos(page, "grumble")
    await page.mouse.move(p["x"], p["y"] - 120)
    await page.mouse.down()
    task = asyncio.ensure_future(page.evaluate("()=>window.MMTEST.fps()"))
    for i in range(40):
        t = (i % 20) / 20
        await page.mouse.move(p["x"] + (f["x"] - p["x"]) * t, (p["y"] - 120) + (f["y"] - p["y"] + 120) * t)
        await page.wait_for_timeout(22)
    fps = await task
    await page.mouse.up()
    print(f"  fps during 12-card drag: {fps}")
    c = Cap(page, "perf")
    await size(page, 12)
    await c.frame(HAND_CLIP, tag="n12")


async def scene_reduce(page):
    await page.evaluate("""()=>{
        localStorage.setItem('mm.save.v1', JSON.stringify({settings:{reduceMotion:true}}));
    }""")
    await page.reload(wait_until="load")
    await page.wait_for_timeout(1200)
    c = Cap(page, "reduce")
    await c.frame(HAND_CLIP, tag="idle")
    await page.evaluate("()=>localStorage.removeItem('mm.save.v1')")


SCENES = {
    "idle": scene_idle, "gallery": scene_gallery, "hover": scene_hover,
    "drag": scene_drag, "threshold": scene_threshold, "play": scene_play,
    "draw": scene_draw, "discard": scene_discard, "exhaust": scene_exhaust,
    "unplayable": scene_unplayable, "upgrade": scene_upgrade,
    "keyboard": scene_keyboard, "perf": scene_perf, "reduce": scene_reduce,
}


async def main(names):
    from playwright.async_api import async_playwright
    errors, logs = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text",
        ])
        ctx = await browser.new_context(viewport={"width": W, "height": H},
                                        device_scale_factor=1, reduced_motion="no-preference")
        page = await ctx.new_page()
        page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2200)          # fonts + portraits + art

        for n in names:
            print(f"[{n}]")
            try:
                await SCENES[n](page)
            except Exception as e:
                errors.append(f"SCENE {n}: {e}")
                print("  FAILED:", e)

        await browser.close()

    if errors:
        print("\nJS/RUN ERRORS:")
        for e in errors[:25]:
            print("  " + str(e)[:400])
        open(os.path.join(SHOTS, "cf.console.txt"), "w", encoding="utf-8").write("\n".join(logs))
    return 1 if errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="*")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        print(" ".join(SCENES)); sys.exit(0)
    sys.exit(asyncio.run(main(a.scenes or list(SCENES))))
