import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('shots/ui-r51-spinel/event-boundary');out.mkdir(parents=True,exist_ok=True);rows=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome');c=b.new_context(viewport={'width':1280,'height':800});c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=event&seed=7&companion=bones&kid=maya&pics=1');page.wait_for_function('window.MM && MM.ctx.stage.warmStage==="done" && document.querySelector(".ev-reading-r51")',timeout=150000);page.evaluate('document.fonts.ready')
 for w,h in [(1280,800),(1600,900)]:
  page.set_viewport_size({'width':w,'height':h});page.locator('.ev-reading-r51').evaluate('e=>e.scrollTop=0');page.wait_for_timeout(900)
  result=page.evaluate("""()=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return {initial:box(document.querySelector('.ev-initial')),reading:box(document.querySelector('.ev-reading-r51')),rail:box(document.querySelector('.ev-page > .r50-scrollrail')),foot:box(document.querySelector('.rm-foot')),options:document.querySelectorAll('.ev-opt').length}}""")
  result['size']=[w,h];rows.append(result);page.screenshot(path=str(out/f'initial-{w}.png'))
  a,r,rail=result['initial'],result['reading'],result['rail'];assert a['left']>=r['left']+5 and a['right']<=r['right'] and a['top']>=r['top'] and a['bottom']<=r['bottom'],result
  assert rail['left']<=r['left'] and rail['right']>=r['right'] and abs(rail['top']-r['bottom'])<=2 and rail['bottom']<=result['foot']['top'] and result['options']==3,result
  cue=page.locator('.ev-page .r49-scrollcue');reading=page.locator('.ev-reading-r51');result['keys']=[]
  for key in ['Enter','Space']:
   reading.evaluate('e=>e.scrollTop=0');page.wait_for_timeout(70);cue.focus();page.keyboard.press(key);page.wait_for_timeout(120);after=reading.evaluate('e=>e.scrollTop');assert after>0;result['keys'].append({'key':key,'after':after})
  result['targets']=[]
  for target in page.locator('.ev-opt').all():
   target.scroll_into_view_if_needed();page.wait_for_timeout(50);hit=target.evaluate('e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}');assert hit;target.focus();assert target.evaluate('e=>e===document.activeElement');result['targets'].append(hit)
  reading.evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(80);assert cue.get_attribute('data-end')=='true';cue.click();page.wait_for_timeout(100);assert reading.evaluate('e=>e.scrollTop')==0
  print(w,result,flush=True)
 b.close()
(out/'proof.json').write_text(json.dumps({'rows':rows,'errors':errors},indent=2));assert not errors,errors
