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
    await page.goto(f'http://127.0.0.1:{server.server_port}/game/index.html#scene=map&seed=42')
    await page.wait_for_selector('.map-notes .note',timeout=30000)
    await page.evaluate('''async()=>{const {HAZARDS}=await import('/game/src/state/mapgen.js');const scene=MM.ctx.scenes.current;scene.model.map.hazards=HAZARDS.filter(h=>['long-shadows','moonlit'].includes(h.id));scene._buildMarginalia();}''')
    for w,h in [(1280,720),(1600,900)]:
     await page.set_viewport_size({'width':w,'height':h})
     for hazard in ['long-shadows','moonlit']:
      button=page.locator(f'.note[data-hz="{hazard}"]')
      for mode in ['hover','focus']:
       if mode=='hover': await button.hover()
       else:
        await page.mouse.move(2,2)
        await button.focus()
       await page.wait_for_timeout(180)
       result=await button.evaluate('''b=>{const p=b.querySelector('.note-pop'),t=document.querySelector('.map-tools'),r=p.getBoundingClientRect(),q=t.getBoundingClientRect();p.style.pointerEvents='auto';const x=(Math.max(r.left,q.left)+Math.min(r.right,q.right))/2,y=(Math.max(r.top,q.top)+Math.min(r.bottom,q.bottom))/2;const overlap=Math.min(r.right,q.right)>Math.max(r.left,q.left)&&Math.min(r.bottom,q.bottom)>Math.max(r.top,q.top);const top=document.elementFromPoint(x,y);const above=!overlap||p.contains(top);p.style.pointerEvents='';return {visible:getComputedStyle(p).opacity,above,overlap,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};}''')
       assert result['visible']=='1' and result['above'] and result['inside'],(w,h,hazard,mode,result)
     await page.screenshot(path=str(ROOT/'tmp'/f'map-tooltip-{w}.png'))
    print('PASS: Long Shadows and Moonlit Rooms stay visible above the toolbar on hover and keyboard focus, at 1280x720 and 1600x900.')
   finally: await browser.close()
 finally: server.shutdown();server.server_close()
asyncio.run(main())
