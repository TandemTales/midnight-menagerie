import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('shots/ui-r51-spinel');rows=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome');ctx=browser.new_context(viewport={'width':1280,'height':800});ctx.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html?garnet-keeps#scene=gameover&seed=7&companion=bones&kid=maya&pics=1')
 page.wait_for_function('window.MM && MM.ctx.stage.warmStage==="done" && document.querySelector(".go-wrap")',timeout=150000);page.evaluate('document.fonts.ready')
 expected=page.evaluate('''async()=>{const {Run}=await import('/game/src/state/run.js');const {RELICS}=await import('/game/src/data/relics.js');const run=new Run({companion:'bones',kid:'maya',seed:7});run.keepsakes=[...RELICS].slice(0,24);MM.ctx.run=run;await MM.ctx.scenes.go('gameover',{result:'defeat'});return run.keepsakes.length;}''')
 page.wait_for_function('(n)=>document.querySelectorAll(".go-keep").length===n',arg=expected,timeout=30000)
 assert expected>=20,'Long live fixture must contain at least20 actual Keepsakes'
 for w,h in [(1280,800),(1600,900)]:
  page.set_viewport_size({'width':w,'height':h});page.locator('[role=tab][data-fold=keep]').click();page.wait_for_timeout(400)
  cue=page.locator('.r49-scrollcue[data-board-scroll=Keepsakes]');scroller=page.locator('.go-block--keep');maximum=scroller.evaluate('e=>e.scrollHeight-e.clientHeight');row={'size':[w,h],'max':maximum,'keys':[]}
  assert maximum>8,'Fixture must exercise actual Keepsakes continuation'
  assert cue.is_visible(),'Keepsakes continuation missing'
  assert not page.locator('.r49-scrollcue[data-board-scroll=Tricks]').is_visible(),'Inactive Tricks continuation remains'
  for key in ['Enter','Space']:
   scroller.evaluate('e=>e.scrollTop=0');page.wait_for_timeout(100);cue.focus();before=scroller.evaluate('e=>e.scrollTop');page.keyboard.press(key);page.wait_for_timeout(150);after=scroller.evaluate('e=>e.scrollTop');assert after>before;row['keys'].append({'key':key,'before':before,'after':after})
  row['items']=[]
  for e in page.locator('.go-keep').all():
   e.scroll_into_view_if_needed();page.wait_for_timeout(40);r=e.evaluate('e=>{const r=e.getBoundingClientRect();return {text:e.textContent,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}');assert r['hit'];row['items'].append(r)
  scroller.evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(100);assert cue.get_attribute('data-end')=='true';cue.click();page.wait_for_timeout(150);assert scroller.evaluate('e=>e.scrollTop')==0
  assert len(row['items'])==expected
  row['endToTop']=True;page.screenshot(path=str(out/f'keepsakes-{w}.png'));rows.append(row);print(w,'live Keepsakes cue',len(row['items']),'items',flush=True)
 browser.close()
(out/'keepsakes.json').write_text(json.dumps({'rows':rows,'errors':errors},indent=2),encoding='utf-8');assert not errors
