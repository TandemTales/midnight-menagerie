"""Pass 2: phase-sampled motion (one screenshot per run, at a known offset),
proper keyboard-targeting path, non-upgraded number recolour, reduced motion."""
import asyncio, os, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "shots", "cf2")
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:8777/tests/cards-feel/index.html"
W, H = 1600, 900
M, ERRORS, LOGS = {}, [], []
CROP = {"x": 0, "y": 300, "width": 1600, "height": 600}


async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br = await p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=default", "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text"])
        ctx = await br.new_context(viewport={"width": W, "height": H}, device_scale_factor=1.0)
        page = await ctx.new_page()
        page.on("console", lambda m: (LOGS.append(f"[{m.type}] {m.text}"),
                                      ERRORS.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: ERRORS.append("PAGEERROR " + str(e)))
        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2500)

        async def snap(n, clip=CROP):
            await page.screenshot(path=os.path.join(OUT, n + ".png"), clip=clip, animations="allow")

        async def size(n):
            await page.click(f"#size-{n}"); await page.wait_for_timeout(700)

        # ── phase-sampled: trigger, sleep exactly N ms in-page, then shoot ──
        async def phases(name, trigger, offsets, setup=7):
            for ms in offsets:
                await size(setup)
                await page.wait_for_timeout(500)
                await page.evaluate(
                    f"(async()=>{{ {trigger}; await new Promise(r=>setTimeout(r,{ms})); }})()")
                await snap(f"{name}_{ms:04d}ms")
                await page.wait_for_timeout(1200)

        offs = [0, 60, 120, 200, 300, 420, 560]
        await phases("exhaust", "document.querySelector('#btn-exhaust').click()", offs + [700])
        await phases("discard", "document.querySelector('#btn-discard-all').click()", offs)
        await phases("draw", "document.querySelector('#btn-draw-5').click()", offs, setup=3)
        await phases("play", "document.querySelector('#btn-play-random').click()", offs)

        # ── keyboard targeting on a card that actually needs a target ───────
        await size(6); await page.wait_for_timeout(700)
        await page.mouse.move(5, 5)
        M["kbd_hand"] = await page.evaluate(
            "MMTEST.hand.cards().map((c,i)=>({i,n:c.def.name,t:c.def.target}))")
        await page.keyboard.press("1")     # card 1 = Scratch, target enemy
        await page.wait_for_timeout(300)
        await snap("kbd_1", None)
        M["k1"] = await page.evaluate("({sel:MMTEST.hand.selIdx,aim:MMTEST.hand.aim?"
                                      "(MMTEST.hand.aim.snap?MMTEST.hand.aim.snap.id:'noSnap'):null})")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(400)
        await snap("kbd_1_enter", None)
        M["k1_enter"] = await page.evaluate(
            "({sel:MMTEST.hand.selIdx,n:MMTEST.hand.count,aim:MMTEST.hand.aim?"
            "(MMTEST.hand.aim.snap?MMTEST.hand.aim.snap.id:'noSnap'):null,"
            "arrowCls:document.querySelector('.mm-hand__arrow').getAttribute('class')})")
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(350)
        await snap("kbd_tab1", None)
        M["k1_tab"] = await page.evaluate(
            "({aim:MMTEST.hand.aim?(MMTEST.hand.aim.snap?MMTEST.hand.aim.snap.id:'noSnap'):null,"
            "focus:document.activeElement.tagName+'.'+(document.activeElement.className||''),"
            "arrowCls:document.querySelector('.mm-hand__arrow').getAttribute('class')})")
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(350)
        await snap("kbd_tab2", None)
        M["k1_tab2"] = await page.evaluate(
            "({aim:MMTEST.hand.aim?(MMTEST.hand.aim.snap?MMTEST.hand.aim.snap.id:'noSnap'):null})")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(700)
        M["k1_played"] = await page.evaluate("({n:MMTEST.hand.count})")
        await snap("kbd_played", None)

        # ── number recolour on a NON-upgraded card ──────────────────────────
        await size(7); await page.wait_for_timeout(700)
        idx = await page.evaluate("(()=>{const c=MMTEST.hand.cards();for(let i=0;i<c.length;i++)"
                                  "if(c[i].def.target==='enemy')return i;return 0})()")
        b = await page.evaluate(f"(()=>{{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[{idx}];"
                                "const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        for foe, tag in (("grumble", "boost"), ("chandy", "reduce"), ("ratlin", "neutral")):
            f = await page.evaluate(f"(()=>{{const r=document.querySelector('.foe[data-id=\"{foe}\"] .foe__body')"
                                    ".getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            await page.mouse.move(b["x"], b["y"]); await page.wait_for_timeout(200)
            await page.mouse.down(); await page.wait_for_timeout(100)
            await page.mouse.move(f["x"], f["y"], steps=12); await page.wait_for_timeout(500)
            M["num_" + tag] = await page.evaluate(
                "[...document.querySelectorAll('.mm-card__num')].map(n=>({t:n.textContent,"
                "c:n.className,col:getComputedStyle(n).color,fw:getComputedStyle(n).fontWeight,"
                "deco:getComputedStyle(n).textDecorationLine}))")
            await snap("num_" + tag, None)
            await page.keyboard.press("Escape"); await page.mouse.up()
            await page.wait_for_timeout(800)

        # ── non-targeted card: threshold line ───────────────────────────────
        idx = await page.evaluate("(()=>{const c=MMTEST.hand.cards();for(let i=0;i<c.length;i++)"
                                  "if(c[i].def.target==='self'||c[i].def.target==='none')return i;return 1})()")
        b = await page.evaluate(f"(()=>{{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[{idx}];"
                                "const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        await page.mouse.move(b["x"], b["y"]); await page.wait_for_timeout(200)
        await page.mouse.down(); await page.wait_for_timeout(100)
        await page.mouse.move(b["x"] + 30, 600, steps=8); await page.wait_for_timeout(300)
        await snap("thresh_below", None)
        await page.mouse.move(b["x"] + 30, 380, steps=8); await page.wait_for_timeout(300)
        await snap("thresh_armed", None)
        await page.mouse.up(); await page.wait_for_timeout(900)

        # ── hover text at scale, zoom ───────────────────────────────────────
        await size(5); await page.wait_for_timeout(700)
        bb = await page.evaluate("(()=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[2];"
                                 "const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        await page.screenshot(path=os.path.join(OUT, "text_rest.png"),
                              clip={"x": bb["x"] - 130, "y": bb["y"] - 20, "width": 260, "height": 190})
        await page.mouse.move(bb["x"], bb["y"]); await page.wait_for_timeout(600)
        r = await page.evaluate("(()=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[2];"
                                "const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}})()")
        await page.screenshot(path=os.path.join(OUT, "text_hover.png"),
                              clip={"x": r["x"], "y": r["y"] + r["h"] * 0.45,
                                    "width": r["w"], "height": r["h"] * 0.55})
        M["hover_font"] = await page.evaluate(
            "(()=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[2];"
            "const t=e.querySelector('.mm-card__rules');const s=getComputedStyle(t);"
            "return{fs:s.fontSize,tf:getComputedStyle(e).transform,"
            "rules_px_effective:parseFloat(s.fontSize)}})()")
        await page.mouse.move(5, 5); await page.wait_for_timeout(400)

        M["errors"] = ERRORS[:40]
        json.dump(M, open(os.path.join(OUT, "metrics2.json"), "w"), indent=1)
        await br.close()
    print("errors:", len(ERRORS))
    for e in ERRORS[:8]: print("  ", e[:250])


asyncio.run(main())
