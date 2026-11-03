import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader'])
  page=await browser.new_page(viewport={'width':1600,'height':900},reduced_motion='reduce')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8777/game/index.html#scene=rest&seed=42')
  await page.wait_for_selector('.rs-choices',timeout=60000)
  await page.evaluate('''async()=>{
    const {cardById}=await import('/game/src/data/cards.js');
    const scene=MM.ctx.scenes.current;
    window.pickResult='pending';
    scene.pickCard({title:'Which Trick will you sharpen?',sub:'Hover over a Trick to compare before and after above.',cards:scene.run.upgradeableCards().map(c=>({...c,def:cardById(c.id)})),preview:'upgrade',confirmLabel:'Sharpen it'}).then(v=>window.pickResult=v);
  }''')
  await page.wait_for_selector('.rm-slot')
  for w,h in [(1600,900),(1280,720)]:
   await page.set_viewport_size({'width':w,'height':h})
   await page.locator('.rm-slot').nth(1).hover()
   await page.wait_for_timeout(300)
   assert await page.locator('.rm-picker__version').count()==2
   data=await page.evaluate('''()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,b:b.bottom}};return {pair:r('.rm-picker__compare'),large:r('.rm-picker__large'),slot:r('.rm-slot'),panel:r('.rm-picker__panel'),ok:r('[data-ok]'),text:document.querySelector('.rm-picker__compare').textContent}}''')
   assert data['pair']['b']<=data['slot']['y']+10,data
   assert data['large']['w']>data['slot']['w'],data
   assert data['panel']['y']>=0 and data['ok']['b']<=h,data
   assert 'Before' in data['text'] and 'After' in data['text'],data
   await page.screenshot(path=str(OUT/f'compare-{w}.png'))
   await page.mouse.move(5,5)
   assert await page.locator('.rm-picker__version').count()==0,'comparison hides on leave'
   await page.locator('.rm-slot').nth(0).focus()
   await page.locator('.rm-slot').nth(2).focus()
   assert await page.locator('.rm-picker__version').count()==2,'keyboard preview'
  uid=await page.locator('.rm-slot').nth(1).get_attribute('data-uid')
  await page.locator('.rm-slot').nth(1).click()
  await page.locator('[data-ok]').click()
  assert await page.evaluate('window.pickResult')==uid
  assert await page.locator('.rm-picker__version').count()==0
  await page.goto('about:blank')
  await page.goto('http://localhost:8777/game/index.html#scene=reward&seed=42')
  await page.wait_for_selector('.rw-spoils')
  await page.evaluate("""async()=>{
    const scene=MM.ctx.scenes.current;
    scene.run.stats.combatWins=2;
    scene.run._prepareReward(scene.run.currentNode,'scuffle',{navigate:false});
    MM.ctx.run=scene.run;
    await MM.ctx.scenes.go('reward',{seed:42},{instant:true});
  }""")
  await page.wait_for_selector('.rw-snack')
  assert 'Added to your satchel' in await page.locator('.rw-snack').inner_text()
  await page.screenshot(path=str(OUT/'snack-reward.png'))
  await page.evaluate("""async()=>{
    const {SNACKS}=await import('/game/src/state/run.js');
    const scene=MM.ctx.scenes.current;
    scene.run.snacks=SNACKS.slice(0,scene.run.snackCap);
    MM.ctx.run=scene.run;
    await MM.ctx.scenes.go('reward',{seed:42},{instant:true});
  }""")
  assert 'Satchel full' in await page.locator('.rw-snack').inner_text()
  assert not errors,errors
  print('PASS: before/after hover, pointer leave, keyboard focus, selection, cleanup, enlarged size and viewport fit at 1600x900 and 1280x720')
  await browser.close()
asyncio.run(main())
