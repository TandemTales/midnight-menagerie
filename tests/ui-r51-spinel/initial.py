import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('shots/ui-r51-spinel/initial');out.mkdir(parents=True,exist_ok=True)
rows=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome');c=b.new_context(viewport={'width':1280,'height':800});c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=gameover&seed=7&companion=bones&kid=maya&pics=1')
 page.wait_for_function('window.MM && MM.ctx.stage.warmStage==="done"',timeout=150000)
 for scene in ['gameover','event','rest','shop']:
  page.evaluate('async name=>await MM.ctx.scenes.go(name,{seed:7,companion:"bones",kid:"maya",pics:1})',scene)
  page.wait_for_function('(name)=>MM.ctx.scenes.current.root.classList.contains("scene--"+name)',arg=scene,timeout=30000)
  for w,h in [(1280,800),(1600,900)]:
   page.set_viewport_size({'width':w,'height':h});page.evaluate('document.fonts.ready');page.wait_for_timeout(2000)
   page.screenshot(path=str(out/f'{scene}-{w}.png'))
   boxes=page.evaluate("()=>Object.fromEntries(['.go-wrap','.go-stage','.go-altar','.go-mvp__slot .mm-card','.go-reach','.go-stats','.ev-page','.ev-painted-stand-r49','.rm-body','.r50-scrollrail'].map(sel=>{const e=document.querySelector(sel);if(!e)return [sel,null];const r=e.getBoundingClientRect();return [sel,{left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:e.scrollHeight,client:e.clientHeight}]}))")
   rows.append({'scene':scene,'size':[w,h],'boxes':boxes});print(scene,w,boxes,flush=True)
 b.close()
(out/'geometry.json').write_text(json.dumps({'rows':rows,'errors':errors},indent=2));assert not errors,errors
