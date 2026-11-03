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
    await page.goto(f'http://127.0.0.1:{server.server_port}/game/index.html#scene=clubhouse&seed=42')
    await page.wait_for_selector('.polaroid .petpic',timeout=30000)
    await page.evaluate("Promise.all([...document.querySelectorAll('.polaroid .petpic')].map(i=>i.decode()))")
    for w,h in [(1280,720),(1600,900)]:
     await page.set_viewport_size({'width':w,'height':h})
     await page.wait_for_timeout(200)
     result=await page.evaluate("""()=>[...document.querySelectorAll('.polaroid')].map(c=>{const i=c.querySelector('.petpic'),p=c.querySelector('.polaroid__photo'),s=getComputedStyle(i),r=i.getBoundingClientRect();return {complete:i.complete&&i.naturalWidth===1122,ratio:i.offsetWidth/i.offsetHeight,fit:s.objectFit,filter:s.filter,frame:c.classList.contains('kit-paper'),caption:!!c.querySelector('.polaroid__cap,.polaroid__who'),padding:getComputedStyle(c).padding,overlay:getComputedStyle(p,'::after').content};})""")
     assert len(result)==8,result
     for r in result:
      assert r['complete'] and abs(r['ratio']-1122/1402)<.002 and r['fit']=='contain' and r['filter']=='none' and not r['frame'] and not r['caption'] and r['padding']=='0px' and r['overlay']=='none',r
     await page.screenshot(path=str(ROOT/'tmp'/f'pet-prints-{w}.png'))
    print('PASS: all eight complete Polaroid images, no added frames/captions/filters, correct aspect ratio at both viewport sizes.')
   finally: await browser.close()
 finally: server.shutdown();server.server_close()
asyncio.run(main())

