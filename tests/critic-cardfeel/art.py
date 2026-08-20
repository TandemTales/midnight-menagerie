import asyncio,os,json,base64
OUT=os.path.dirname(os.path.abspath(__file__))
URL="http://localhost:8777/tests/cards-feel/index.html"
async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br=await p.chromium.launch(args=["--use-gl=angle","--enable-unsafe-swiftshader","--force-color-profile=srgb"])
        pg=await (await br.new_context(viewport={"width":1600,"height":900})).new_page()
        await pg.goto(URL,wait_until="load",timeout=45000); await pg.wait_for_timeout(3000)
        await pg.click("#size-12"); await pg.wait_for_timeout(1200)
        # grab each card's art layer as a data url + downscale-compare
        res = await pg.evaluate("""(async()=>{
          const out=[];
          for (const e of document.querySelectorAll('.mm-hand__cards .mm-card')) {
            const a=e.querySelector('.mm-card__art');
            const bg=a?getComputedStyle(a).backgroundImage:null;
            out.push({id:e.dataset.cardId, len:bg?bg.length:0, hash: bg?
              (()=>{let h=5381;for(let i=0;i<bg.length;i++)h=((h<<5)+h+bg.charCodeAt(i))|0;return h})():null});
          } return out})()""")
        for r in res: print(r)
        # perceptual: sample 8x8 grid of pixels from each art canvas via an offscreen draw
        sim = await pg.evaluate("""(async()=>{
          const els=[...document.querySelectorAll('.mm-hand__cards .mm-card')];
          const grids=[];
          for (const e of els){
            const a=e.querySelector('.mm-card__art');
            const m=getComputedStyle(a).backgroundImage.match(/url\("(.+)"\)/);
            if(!m){grids.push(null);continue}
            const img=new Image(); img.src=m[1]; await img.decode();
            const c=document.createElement('canvas'); c.width=16;c.height=16;
            const x=c.getContext('2d'); x.drawImage(img,0,0,16,16);
            grids.push([...x.getImageData(0,0,16,16).data]);
          }
          const ids=els.map(e=>e.dataset.cardId);
          const out=[];
          for(let i=0;i<grids.length;i++)for(let j=i+1;j<grids.length;j++){
            if(!grids[i]||!grids[j])continue;
            let s=0;for(let k=0;k<grids[i].length;k++)s+=Math.abs(grids[i][k]-grids[j][k]);
            out.push([ids[i],ids[j],+(s/grids[i].length).toFixed(2)]);
          }
          out.sort((a,b)=>a[2]-b[2]);
          return out.slice(0,14);
        })()""")
        print("\nMOST SIMILAR ART PAIRS (mean abs px diff on 16x16, 0=identical):")
        for a,b,d in sim: print(f"  {d:7.2f}  {a}  vs  {b}")
        await br.close()
asyncio.run(main())
