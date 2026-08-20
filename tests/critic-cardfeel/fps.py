import asyncio,os,json
URL="http://localhost:8777/tests/cards-feel/index.html"
async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br=await p.chromium.launch(args=["--use-gl=angle","--enable-unsafe-swiftshader","--force-color-profile=srgb"])
        pg=await (await br.new_context(viewport={"width":1600,"height":900})).new_page()
        errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)))
        await pg.goto(URL,wait_until="load",timeout=45000); await pg.wait_for_timeout(2500)
        async def fps(trigger=None, ms=1000):
            t = f"document.querySelector('{trigger}').click();" if trigger else ""
            return await pg.evaluate("(async()=>{let n=0;const t0=performance.now();"+t+
              f"await new Promise(r=>{{const f=()=>{{n++;performance.now()-t0<{ms}?requestAnimationFrame(f):r()}};"
              "requestAnimationFrame(f)});return n})()")
        res={}
        for label,setup,trig in [("idle_7","#size-7",None),("idle_12","#size-12",None),
                                 ("draw5_from_12","#size-12","#btn-draw-5"),
                                 ("draw5_from_12b","#size-12","#btn-draw-5"),
                                 ("draw5_from_7","#size-7","#btn-draw-5"),
                                 ("discard_12","#size-12","#btn-discard-all"),
                                 ("exhaust_12","#size-12","#btn-exhaust")]:
            await pg.click(setup); await pg.wait_for_timeout(1100)
            res[label]=await fps(trig)
            await pg.wait_for_timeout(1200)
        # hover sweep fps
        await pg.click("#size-10"); await pg.wait_for_timeout(900)
        task=asyncio.ensure_future(fps(None,1500))
        for i in range(30):
            await pg.mouse.move(200+i*40, 700); await pg.wait_for_timeout(40)
        res["hover_sweep_1.5s"]=await task
        res["errors"]=errs
        print(json.dumps(res,indent=1))
        await br.close()
asyncio.run(main())
