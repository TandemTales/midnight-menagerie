import asyncio, http.server, threading
from functools import partial
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path.cwd()
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
async def main():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader'])
   try:
    page=await browser.new_page(viewport={'width':1280,'height':720},reduced_motion='reduce')
    await page.goto(f'http://127.0.0.1:{server.server_port}/game/index.html#scene=select&seed=42&kid=maya&companion=marmalade')
    await page.wait_for_selector('.scene--select[data-mode="kid"] .petpic',timeout=30000)
    for w,h in [(1280,720),(1920,1080)]:
     await page.set_viewport_size({'width':w,'height':h})
     for kid in ['maya','mateo','amina','eli','priya','jordan','lena','samir']:
      await page.evaluate('(kid)=>MM.ctx.scenes.current._pickKid(kid,true)',kid)
      await page.locator('.poster__photo .petpic').evaluate('(i)=>i.decode()')
      await page.wait_for_timeout(80)
      result=await page.evaluate("""()=>{const p=document.querySelector('.kid__poster'),i=p.querySelector('img'),r=i.getBoundingClientRect(),q=p.getBoundingClientRect(),d=document.querySelector('.kid__detail').getBoundingClientRect(),info=document.querySelector('.kid__info');return {fit:getComputedStyle(i).objectFit,inside:r.top>=q.top&&r.bottom<=q.bottom+1&&r.left>=q.left&&r.right<=q.right+1&&q.bottom<=d.bottom,scroll:info.scrollHeight>info.clientHeight+2,infoInside:[...info.children].filter(c=>getComputedStyle(c).display!='none').every(c=>c.getBoundingClientRect().bottom<=d.bottom),image:[r.width,r.height],natural:[i.naturalWidth,i.naturalHeight]};}""")
      if not result['inside'] or result['scroll']:
       await page.screenshot(path=str(ROOT/'tmp'/'select-overflow.png'))
       print(await page.evaluate("() => ['.sel__stage','.sel__kidstep','.kid__detail','.kid__poster','.poster__photo','.poster__photo img','.kid__info','.kid__strip'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return [s,r.y,r.height,e.clientHeight,e.scrollHeight,c.height,c.minHeight,c.gridTemplateRows]})"),flush=True)
      assert result['fit']=='contain' and result['inside'] and not result['scroll'] and result['infoInside'],(w,kid,result)
     await page.screenshot(path=str(ROOT/'tmp'/f'select-prints-{w}.png'))
     await page.locator('.poster__about').hover()
     await page.wait_for_timeout(300)
     await page.screenshot(path=str(ROOT/'tmp'/f'select-pet-info-{w}.png'))
    await page.goto('about:blank')
    await page.goto(f'http://127.0.0.1:{server.server_port}/game/index.html#scene=gameover&seed=42&kid=samir')
    await page.wait_for_selector('.go-pet__snap .petpic',timeout=30000)
    for w,h in [(1280,720),(1920,1080)]:
     await page.set_viewport_size({'width':w,'height':h})
     await page.wait_for_timeout(200)
     await page.locator('.go-pet__snap .petpic').evaluate('(i)=>i.decode()')
     result=await page.locator('.go-pet__snap .petpic').evaluate("""i=>{const r=i.getBoundingClientRect();return {inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,fit:getComputedStyle(i).objectFit}}""")
     await page.screenshot(path=str(ROOT/'tmp'/f'gameover-print-{w}.png'))
     print(await page.evaluate("()=>['.go-wrap','.go-stanzas','.go-stanza--pet','.go-pet__snap','.go-pet__snap img'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return [s,r.x,r.y,r.width,r.height,e.scrollHeight,e.clientHeight]})"),flush=True)
     assert result['inside'] and result['fit']=='contain',result
     await page.screenshot(path=str(ROOT/'tmp'/f'gameover-print-{w}.png'))
    print('PASS: all eight pets in Choose a Kid; full images and no detail scrolling at 1280x720 and 1920x1080; expedition-end print also fits.')
   finally: await browser.close()
 finally: server.shutdown();server.server_close()
asyncio.run(main())

