import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('R49_OUT','shots/r49-repair/queue'));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--use-gl=angle','--use-angle=default','--force-color-profile=srgb'])
 page=b.new_page(viewport={'width':1280,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('R49_URL','http://localhost:9492')+'/game/index.html#scene=title&seed=42&companion=bones&kid=maya')
 page.wait_for_function('window.MM && MM.ctx.stage.warmStage==="done"',timeout=150000)
 page.evaluate('MM.goto("combat",{seed:42,region:"passages",room:"Narrow Corridor",tier:"standard",enemies:4,companion:"bones",kid:"maya"})')
 page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.$coldRoom.hidden&&s.hero._kidSrc}',timeout=150000)
 page.wait_for_timeout(800)
 page.set_viewport_size({'width':320,'height':800});page.wait_for_timeout(400)
 page.evaluate("()=>{const s=MM.ctx.scenes.current;s.fx.clear();const f=s.fx,update=f._updateNumbers;window.r49Idle={expired:[],delivered:[]};f._updateNumbers=function(dt){for(const n of this.nums)if(n.live&&n.t+dt>=n.dur)r49Idle.expired.push({text:n.el.textContent,duration:n.dur,elapsed:n.t+dt});const r=update.call(this,dt);for(const n of this.nums)if(n.live&&!r49Idle.delivered.includes(n.el.textContent))r49Idle.delivered.push(n.el.textContent);return r};s.engine.applyStatus(s.engine.livingEnemies()[3],'vulnerable',2)}")
 page.wait_for_timeout(1800)
 before=page.evaluate('({queued:MM.ctx.scenes.current.fx.wordQueue?.length||0,live:MM.ctx.scenes.current.fx.nums.filter(n=>n.live).length,...r49Idle})')
 start=time.time();page.set_viewport_size({'width':1280,'height':800})
 page.wait_for_function('MM.ctx.scenes.current.fx.nums.some(n=>n.live&&+n.el.style.opacity>.3)',timeout=8000)
 delay=time.time()-start;page.screenshot(path=str(out/'idle-resize.png'))
 page.wait_for_function('r49Idle.expired.length===1',timeout=8000)
 after=page.evaluate('({queued:MM.ctx.scenes.current.fx.wordQueue?.length||0,...r49Idle})')
 result={'before':before,'after':after,'afterResizeDelaySeconds':delay,'errors':errors};(out/'idle-resize.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True);b.close()
assert before['queued']==1 and before['live']==0 and not before['delivered'],before
assert after['queued']==0 and after['delivered']==['+2 Vulnerable'] and len(after['expired'])==1 and not errors,after
