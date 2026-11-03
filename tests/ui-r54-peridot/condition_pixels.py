"""Native baseline/current plaque pixels, AFTER the separate clean timing job."""
import json,sys,subprocess,hashlib
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright
out=Path('docs/ui-pass/PERIDOT-r54-proofs/condition-pixels');out.mkdir(parents=True,exist_ok=True)
base='7fc1b303cd84aeaac93c3b16a3620a40becae372'
css={'inherited':subprocess.check_output(['git','show',base+':game/src/scenes/combat.css']).decode(),'current':Path('game/src/scenes/combat.css').read_text(encoding='utf-8')}
fixture=Path('tests/ui-r54-peridot/combat-capture.js').read_text(encoding='utf-8')
rows=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--use-gl=angle','--use-angle=default','--force-color-profile=srgb']);c=b.new_context();c.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''))
 c.route('**/game/src/scenes/combat.css?pixels=*',lambda r:r.fulfill(status=200,content_type='text/css',body=css[parse_qs(urlparse(r.request.url).query)['pixels'][0]]))
 page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://localhost:{sys.argv[1]}/game/index.html#scene=title&seed=7&companion=bones&kid=maya');page.wait_for_function('window.MM&&MM.ctx.stage.warmStage==="done"',timeout=150000)
 for variant in ['inherited','current']:
  for width,height in [(1280,800),(1600,900)]:
   page.set_viewport_size({'width':width,'height':height});page.evaluate('()=>{MM.ctx.clock.resume();return MM.goto("combat",{seed:7,companion:"bones",kid:"maya",encounter:"foyer-boss"})}')
   page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.$coldRoom.hidden&&s.hero._kidSrc}',timeout=150000)
   page.evaluate('''async variant=>{const original=[...document.querySelectorAll('link[rel="stylesheet"]')].find(e=>e.id!=='pixels-css'&&new URL(e.href).pathname==='/game/src/scenes/combat.css');document.getElementById('pixels-css')?.remove();const link=document.createElement('link');link.rel='stylesheet';link.id='pixels-css';original.before(link);original.disabled=true;await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject;link.href=new URL(original.href).origin+'/game/src/scenes/combat.css?pixels='+variant;});}''',variant)
   page.wait_for_timeout(1200);page.evaluate(fixture)
   labels=page.evaluate('''()=>MM.ctx.scenes.current.fx.nums.filter(n=>n.live).map(n=>{const s=getComputedStyle(n.el),r=n.el.getBoundingClientRect();return {text:n.el.textContent,owner:n.actorId,time:n.t,duration:n.dur,phase:n.t/n.dur,opacity:s.opacity,color:s.color,font:s.fontSize,padding:s.padding,backing:s.borderImageSource,filter:s.filter,stroke:s.webkitTextStrokeWidth,box:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}}})''')
   image=out/f'{variant}-{width}.png';page.screenshot(path=str(image));rows.append({'variant':variant,'width':width,'labels':labels,'path':str(image.resolve()),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),'visual_source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'combatCSS':hashlib.sha256(css[variant].encode()).hexdigest()});assert len(labels)==6
   (out/'proof.json').write_text(json.dumps({'baseline':base,'rows':rows,'errors':errors,'note':'Separate pixel work only; excluded from timing distributions. All six labels are frozen at supplied canonical fixture phase; styles include actual upper-right Strength opacity and backing.'},indent=2))
 b.close()
assert not errors
