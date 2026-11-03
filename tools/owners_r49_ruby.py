import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('shots/r49-ruby-checks');records=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome');c=b.new_context(viewport={'width':1280,'height':800});c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''));page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:9492/game/index.html#scene=gameover&seed=7&companion=bones&kid=maya&pics=1');page.wait_for_function('window.MM && MM.ctx.stage.warmStage === "done"',timeout=150000);page.wait_for_timeout(2500)
 hits=[]
 for item in page.locator('.go-trick').all():
  item.scroll_into_view_if_needed();hits.append(item.evaluate('e=>{const r=e.getBoundingClientRect(),t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:e.innerText,hit:e===t||e.contains(t)}}'))
 page.locator('.go-wrap').evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(100);page.screenshot(path=str(out/'gameover-bottom.png'))
 records.append({'scene':'gameover','stats':page.locator('.go-stat').count(),'tricks':hits,'cues':page.locator('.r49-scrollcue').all_text_contents()});print('gameover',records[-1],flush=True)
 page.evaluate('MM.goto("combat",{seed:42,region:"passages",room:"Narrow Corridor",tier:"standard",enemies:4,companion:"bones"})');page.wait_for_function('MM.ctx.scenes.current.engine && !MM.ctx.scenes.current._opening && !MM.ctx.stage.roomPending() && MM.ctx.scenes.current.$coldRoom.hidden',timeout=150000)
 for idx in range(4):
  if idx:page.wait_for_function('!MM.ctx.scenes.current.fx.nums.some(n=>n.live)',timeout=20000)
  page.mouse.move(1270,10)
  script=Path('D:/UILOOP/r49-20261029/combat-capture.js').read_text().replace('E.livingEnemies()[0]',f'E.livingEnemies()[{idx}]')
  page.evaluate(script)
  data=page.evaluate('''()=>{const s=MM.ctx.scenes.current,actors=s._wordBounds(s.me.id).actors,plates=[...s.views.values()].map(v=>v.$plate.getBoundingClientRect()),labels=s.fx.nums.filter(n=>n.live&&+n.el.style.opacity>.3);return {enemies:s.views.size,actors,labels:labels.map(n=>{const r=n.el.getBoundingClientRect();return {text:n.el.textContent,actor:n.actorId,box:r.toJSON(),outside:r.x<0||r.y<60||r.right>innerWidth||r.bottom>innerHeight,actorCollisions:actors.filter(a=>r.left<a.right&&r.right>a.left&&r.top<a.bottom&&r.bottom>a.top).map(a=>a.id),plates:plates.filter(p=>r.left<p.right&&r.right>p.left&&r.top<p.bottom&&r.bottom>p.top).length,otherLabels:labels.filter(o=>o.actorId!==n.actorId).filter(o=>{const p=o.el.getBoundingClientRect();return r.left<p.right&&r.right>p.left&&r.top<p.bottom&&r.bottom>p.top}).map(o=>o.el.textContent)}})}}''')
  data['owner']=idx;records.append(data);print('owner',idx,json.dumps(data),flush=True)
  page.screenshot(path=str(out/f'owner-{idx}-1280.png'));page.evaluate('MM.ctx.clock.resume()')
 b.close()
(out/'all-owners-proof.json').write_text(json.dumps({'records':records,'errors':errors},indent=2),encoding='utf-8');print('DONE',errors,flush=True)
