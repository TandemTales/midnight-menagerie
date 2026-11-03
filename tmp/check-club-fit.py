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
    for w,h in [(1280,720),(1920,1080)]:
     await page.set_viewport_size({'width':w,'height':h})
     for panel in ['board','pets','menagerie','backpack']:
      await page.locator(f'.cl-tab[data-panel="{panel}"]').click()
      await page.wait_for_timeout(220)
      await page.screenshot(path=str(ROOT/'tmp'/f'club-fit-{panel}-{w}.png'))
      result=await page.evaluate("""()=>{const active=document.querySelector('.scene--clubhouse').dataset.panel,p=document.querySelector('.cl-panel--'+active),b=p.getBoundingClientRect(),go=document.querySelector('.cl-go').getBoundingClientRect();return {panel:active,scroll:p.scrollHeight>p.clientHeight+2,goVisible:go.bottom<=innerHeight,images:[...p.querySelectorAll('.petpic')].map(i=>{const r=i.getBoundingClientRect();return {inside:r.top>=b.top&&r.bottom<=b.bottom&&r.left>=b.left&&r.right<=b.right,fit:getComputedStyle(i).objectFit,w:r.width,h:r.height}})};}""")
      print(w, result['panel'], 'overflow:',result['scroll'],'images:',len(result['images']),flush=True)
      if panel != 'board': assert not result['scroll'],result
      assert result['goVisible'] and all(i['inside'] and i['fit']=='contain' for i in result['images']),result
    print('CHECK COMPLETE')
   finally: await browser.close()
 finally: server.shutdown();server.server_close()
asyncio.run(main())

