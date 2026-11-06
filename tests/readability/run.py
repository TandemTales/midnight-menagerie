"""Reading-size and animation integration checks against the live local game."""
import asyncio, importlib.util, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('deck',OUT.parent/'steam-deck/run.py')
deck=importlib.util.module_from_spec(spec);spec.loader.exec_module(deck)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
  ctx=await browser.new_context(viewport={'width':1280,'height':800},reduced_motion='reduce')
  errors=[];missing=[];results={}
  page=None
  # A FRESH page per screen: on this machine's D3D11 driver a page navigated a second
  # time can hang in goto for good (2026-10-14, again 11-06). One context keeps the save.
  async def fresh():
   nonlocal page
   if page: await page.close()
   page=await ctx.new_page()
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('response',lambda r:missing.append(r.url) if r.status==404 else None)
   return page
  for scene, _ in deck.SCENES:
   await fresh()
   await page.goto(deck.BASE+'#scene='+scene+'&seed=42&companion=bones')
   await deck.settle(page,scene)
   await page.evaluate('document.fonts.ready')
   if scene=='map':
    await page.wait_for_selector('.map-screen.is-drawn')
    await page.locator('.map-node.is-legal').first.focus()
    results['mapText']=await page.evaluate('''() => {const size=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);const r=document.querySelector('.map-tip').getBoundingClientRect();return {tool:size('.map-tools button'),body:size('.tip-blurb'),label:size('.tip-type'),tipInside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}}''')
   results[scene]=await page.evaluate(deck.MEASURE)
   await page.screenshot(path=str(OUT/(scene+'.png')))
   print(scene,json.dumps({k:results[scene][k] for k in ['minFont','spill','spillCount']}),flush=True)
  # Exercise real settings application against a running clock and CSS.
  results['motion']=await page.evaluate('''async()=>{
   const {applySettings}=await import('/game/src/ui/settings.js');
   const s=MM.Save.settings; s.speed=1;s.fastMode=false;s.reduceMotion=false;applySettings(MM.ctx);
   const probe=document.createElement('div');probe.style.transitionDuration='var(--t-base)';document.body.append(probe);
   const duration=()=>parseFloat(getComputedStyle(probe).transitionDuration);
   const normal=duration();const t=MM.clock.t, start=performance.now();await new Promise(r=>setTimeout(r,600));
   const rate=(MM.clock.t-t)/((performance.now()-start)/1000);
   s.speed=2;applySettings(MM.ctx);const fast=duration();
   s.speed=1;s.reduceMotion=true;applySettings(MM.ctx);const reduced=duration();probe.remove();
   return {normal,fast,reduced,rate};}''')
  await page.evaluate('''async()=>{const {openSettings}=await import('/game/src/ui/settings.js');openSettings(MM.ctx)}''')
  await page.wait_for_selector('.mm-settings-modal')
  await page.wait_for_timeout(700)
  await page.screenshot(path=str(OUT/'settings.png'))
  results['settingsOverflow']=await page.evaluate("""() => [...document.querySelectorAll('.mm-set button,.mm-set input')].filter(e=>{const r=e.getBoundingClientRect(),b=document.querySelector('.mm-modal__dialog').getBoundingClientRect();return r.width&&r.right>b.right+2}).map(e=>e.textContent)""")
  assert not results['settingsOverflow'],results['settingsOverflow']
  await page.evaluate("""async()=>{const {setSetting}=await import('/game/src/ui/settings.js');setSetting(MM.ctx,'largeText',true)}""")
  await page.wait_for_timeout(300)
  await page.screenshot(path=str(OUT/'settings-large.png'))
  # A large-text map must keep its toolbar above the wrapped footer at both sizes.
  for width,height in [(1280,800),(1600,900)]:
   await fresh()
   await page.set_viewport_size({'width':width,'height':height})
   await page.goto(deck.BASE+'#scene=map&seed=42&companion=bones')
   await page.wait_for_selector('.map-screen.is-drawn',timeout=60000)
   await page.locator('.map-node.is-legal').first.focus()
   await page.wait_for_timeout(300)
   layout=await page.evaluate("""()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),t=r('.map-tools'),b=r('.map-bar'),tip=r('.map-tip');return {separate:t.bottom<=b.top,inside:tip.right<=innerWidth&&tip.bottom<=innerHeight,large:document.documentElement.dataset.largeText}}""")
   assert layout['separate'] and layout['inside'] and layout['large']=='1',layout
   await page.screenshot(path=str(OUT/('map-large-'+str(width)+'.png')))
  results['errors']=errors;results['missing']=missing
  (OUT/'result.json').write_text(json.dumps(results,indent=2))
  print('MOTION',results['motion'],flush=True);print('ERRORS',errors,missing,flush=True)
  assert not errors
  for scene, _ in deck.SCENES:
   assert results[scene]['spillCount']==0, (scene, results[scene]['spill'])
  m=results['motion']; assert abs(m['normal']-.33)<.002 and abs(m['fast']-.165)<.002 and m['reduced']<=.0011
  assert .50<m['rate']<.80,m
  t=results['mapText'];assert t['tool']>=18 and t['body']>=18 and t['label']>=16 and t['tipInside'],t
  await browser.close()
asyncio.run(main())
