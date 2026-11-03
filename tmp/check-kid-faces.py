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
     shots=await page.locator('.kid-tile__pf .kidpf').evaluate_all('''imgs=>imgs.map(i=>{const r=i.getBoundingClientRect(),p=i.parentElement.getBoundingClientRect();return {fit:getComputedStyle(i).objectFit,loaded:i.naturalWidth>0,inside:r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.left>=p.left-1&&r.right<=p.right+1}})''')
     assert len(shots)==8 and all(s['fit']=='contain' and s['loaded'] and s['inside'] for s in shots),shots
     await page.screenshot(path=str(ROOT/'tmp'/f'kid-faces-{w}.png'))
     await page.locator('.poster__about').hover()
     await page.wait_for_timeout(300)
     await page.screenshot(path=str(ROOT/'tmp'/f'select-pet-info-{w}.png'))
    print('PASS: all eight headshots fit; pet posters and details still fit at 1280x720 and 1920x1080.')
   finally: await browser.close()
 finally: server.shutdown();server.server_close()
asyncio.run(main())
