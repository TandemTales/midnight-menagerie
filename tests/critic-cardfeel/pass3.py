"""Pass 3: keyboard path with focus properly cleared off the control bar."""
import asyncio, os, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "shots", "cf3"); os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:8777/tests/cards-feel/index.html"
M, ERRORS = {}, []

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--use-gl=angle","--enable-unsafe-swiftshader",
             "--force-color-profile=srgb","--font-render-hinting=none","--disable-lcd-text"])
        page = await (await br.new_context(viewport={"width":1600,"height":900})).new_page()
        page.on("console", lambda m: ERRORS.append(m.text) if m.type=="error" else None)
        page.on("pageerror", lambda e: ERRORS.append("PAGEERROR "+str(e)))
        await page.goto(URL, wait_until="load", timeout=45000)
        await page.wait_for_timeout(2500)
        async def snap(n): await page.screenshot(path=os.path.join(OUT,n+".png"), animations="allow")
        async def st(): return await page.evaluate(
            "({sel:MMTEST.hand.selIdx,n:MMTEST.hand.count,"
            "aim:MMTEST.hand.aim?(MMTEST.hand.aim.snap?MMTEST.hand.aim.snap.id:'noSnap'):null,"
            "arrow:document.querySelector('.mm-hand__arrow').getAttribute('class'),"
            "focus:document.activeElement.tagName+'.'+(document.activeElement.className||''),"
            "outline:(()=>{const e=document.querySelector('.mm-card.is-selected');"
            "return e?{cls:e.className,ol:getComputedStyle(e).outline,bs:getComputedStyle(e).boxShadow.slice(0,90)}:null})()})")
        await page.click("#size-6"); await page.wait_for_timeout(700)
        await page.evaluate("document.activeElement.blur()")   # get focus OFF the bar
        await page.mouse.move(5,5); await page.wait_for_timeout(200)
        M["hand"] = await page.evaluate("MMTEST.hand.cards().map((c,i)=>({i,n:c.def.name,t:c.def.target}))")
        M["s0"] = await st()
        for label, key in (("press1","1"),("enter1","Enter"),("tabA","Tab"),("tabB","Tab"),
                           ("enter2","Enter"),("after","Escape")):
            await page.keyboard.press(key); await page.wait_for_timeout(450)
            M[label] = await st(); await snap(label)
            await page.evaluate("if(document.activeElement!==document.body)document.activeElement.blur()")
        # arrows + esc
        await page.keyboard.press("ArrowRight"); await page.wait_for_timeout(350); M["arrR"]=await st(); await snap("arrR")
        await page.keyboard.press("ArrowUp");    await page.wait_for_timeout(400); M["arrU"]=await st(); await snap("arrU")
        await page.keyboard.press("Tab");        await page.wait_for_timeout(350); M["arrU_tab"]=await st(); await snap("arrU_tab")
        await page.keyboard.press("Escape");     await page.wait_for_timeout(400); M["esc"]=await st(); await snap("esc")
        # reduced motion
        await page.click("#btn-reduce-motion"); await page.wait_for_timeout(2600)
        await page.click("#size-7"); await page.wait_for_timeout(600)
        M["rm_settings"] = await page.evaluate("({rm:MMTEST.hand.reduceMotion,cls:MMTEST.hand.el.className})")
        await snap("reduce_motion")
        await page.evaluate("document.activeElement.blur()")
        b = await page.evaluate("(()=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[3];"
                                "const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        t = asyncio.ensure_future(page.evaluate("(sel=>new Promise(res=>{const el=document.querySelector(sel);"
            "const o=[];const t0=performance.now();const f=()=>{const r=el.getBoundingClientRect();"
            "o.push([+(performance.now()-t0).toFixed(0),+r.y.toFixed(1)]);"
            "performance.now()-t0<500?requestAnimationFrame(f):res(o)};requestAnimationFrame(f)}))"
            , ".mm-hand__cards .mm-card:nth-child(4)"))
        await page.wait_for_timeout(60); await page.mouse.move(b["x"], b["y"], steps=1)
        M["rm_hover"] = await t
        await page.click("#btn-reduce-motion"); await page.wait_for_timeout(2600)
        M["errors"]=ERRORS[:20]
        json.dump(M, open(os.path.join(OUT,"m3.json"),"w"), indent=1)
        await br.close()
    print("errors", len(ERRORS), ERRORS[:5])
asyncio.run(main())
