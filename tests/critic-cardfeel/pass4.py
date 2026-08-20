import asyncio, os, json
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,"shots","cf4"); os.makedirs(OUT,exist_ok=True)
URL="http://localhost:8777/tests/cards-feel/index.html"
M,ERR=[{}],[]
async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br=await p.chromium.launch(args=["--use-gl=angle","--enable-unsafe-swiftshader",
            "--force-color-profile=srgb","--font-render-hinting=none","--disable-lcd-text"])
        pg=await (await br.new_context(viewport={"width":1600,"height":900})).new_page()
        pg.on("console",lambda m: ERR.append(m.text) if m.type=="error" else None)
        pg.on("pageerror",lambda e: ERR.append("PAGEERROR "+str(e)))
        await pg.goto(URL,wait_until="load",timeout=45000); await pg.wait_for_timeout(2500)
        m=M[0]
        EB="[...document.querySelectorAll('#bar button')].filter(b=>b.textContent.startsWith('energy'))"
        async def size(n): await pg.click(f"#size-{n}"); await pg.wait_for_timeout(700)
        async def box(i):
            return await pg.evaluate(f"(()=>{{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[{i}];"
                "const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        # crisp text crops at full energy
        await size(5); await pg.wait_for_timeout(600)
        r=await pg.evaluate("(()=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[2];"
            "const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}})()")
        await pg.screenshot(path=os.path.join(OUT,"rest_text.png"),
            clip={"x":r["x"],"y":r["y"]+r["h"]*.42,"width":r["w"],"height":r["h"]*.58})
        b=await box(2); await pg.mouse.move(b["x"],b["y"]); await pg.wait_for_timeout(600)
        r=await pg.evaluate("(()=>{const e=document.querySelectorAll('.mm-hand__cards .mm-card')[2];"
            "const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}})()")
        await pg.screenshot(path=os.path.join(OUT,"hover_text.png"),
            clip={"x":r["x"],"y":r["y"]+r["h"]*.42,"width":r["w"],"height":r["h"]*.58})
        await pg.mouse.move(5,5); await pg.wait_for_timeout(400)
        # unaffordable targeted drag -> arrow colour
        for _ in range(4): await pg.evaluate(EB+"[1].click()"); await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(500)
        m["energy"]=await pg.evaluate("document.getElementById('orb').textContent")
        idx=await pg.evaluate("(()=>{const c=MMTEST.hand.cards();for(let i=0;i<c.length;i++)"
                              "if(c[i].def.target==='enemy'&&(c[i].def.cost||1)>0)return i;return 0})()")
        b=await box(idx)
        f=await pg.evaluate("(()=>{const r=document.querySelector('.foe[data-id=\"grumble\"] .foe__body')"
                            ".getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        await pg.mouse.move(b["x"],b["y"]); await pg.wait_for_timeout(200); await pg.mouse.down()
        await pg.mouse.move(f["x"],f["y"],steps=12); await pg.wait_for_timeout(450)
        m["unaffordable_arrow"]=await pg.evaluate(
            "({cls:document.querySelector('.mm-hand__arrow').getAttribute('class'),"
            "fill:getComputedStyle(document.querySelector('.mm-arrow__body')).fill,"
            "ret:getComputedStyle(document.querySelector('.mm-arrow__reticle')).opacity,"
            "card:document.querySelector('.mm-card.is-unplayable.is-dragging')?'unplayable':'?'})")
        await pg.screenshot(path=os.path.join(OUT,"unaffordable_snap.png"))
        await pg.mouse.up(); await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT,"unaffordable_refused.png"))
        # contrast: rules text vs card bg, playable and unplayable
        m["contrast"]=await pg.evaluate("""(()=>{
          const lum=c=>{const [r,g,b]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;
            return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b};
          const out={};
          for (const e of document.querySelectorAll('.mm-hand__cards .mm-card')) {
            const t=e.querySelector('.mm-card__rules'); if(!t) continue;
            const fg=getComputedStyle(t).color;
            out[e.dataset.cardId]= {un:e.classList.contains('is-unplayable'), fg,
              fs:getComputedStyle(t).fontSize};
          } return out})()""")
        # fps under load
        for _ in range(4): await pg.evaluate(EB+"[0].click()"); await pg.wait_for_timeout(100)
        await size(12); await pg.wait_for_timeout(600)
        m["fps_12"]=await pg.evaluate("(async()=>{let n=0;const t0=performance.now();"
            "document.querySelector('#btn-discard-all').click();"
            "await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};"
            "requestAnimationFrame(f)});return n})()")
        await pg.wait_for_timeout(900)
        await size(12); await pg.wait_for_timeout(700)
        m["fps_12_draw"]=await pg.evaluate("(async()=>{let n=0;const t0=performance.now();"
            "document.querySelector('#btn-draw-5').click();"
            "await new Promise(r=>{const f=()=>{n++;performance.now()-t0<1000?requestAnimationFrame(f):r()};"
            "requestAnimationFrame(f)});return n})()")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=os.path.join(OUT,"hand17.png"))
        m["geom17"]=await pg.evaluate("[...document.querySelectorAll('.mm-hand__cards .mm-card')]"
            ".map(e=>{const r=e.getBoundingClientRect();return{x:+r.x.toFixed(0),b:+r.bottom.toFixed(0)}})")
        m["errors"]=ERR[:20]
        json.dump(m,open(os.path.join(OUT,"m4.json"),"w"),indent=1)
        await br.close()
    print("errors",len(ERR),ERR[:5])
asyncio.run(main())
