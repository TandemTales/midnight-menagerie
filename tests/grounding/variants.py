from pathlib import Path
from playwright.sync_api import sync_playwright
import json
OUT=Path(__file__).parent
ROOMS=[('bathhouse','Pool Gallery'),('study','Reading Room'),('attic','Gallery'),('greenhouse','Palm House')]
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1280,'height':800})
 page.goto('http://localhost:8777/game/index.html#scene=combat&seed=42&companion=bones')
 page.wait_for_function('window.MM && MM.ctx.scenes.current.engine && MM.ctx.scenes.current._opening===false',timeout=60000)
 page.evaluate('''async()=>{const {setSetting}=await import('/game/src/ui/settings.js');setSetting(MM.ctx,'reduceMotion',true)}''')
 data=[]
 for region,room in ROOMS:
  page.evaluate('''([region,room])=>{MM.ctx.atmosphere.setMood(region,{seed:room,instant:true});}''',[region,room])
  page.wait_for_timeout(150)
  page.wait_for_function('!MM.ctx.stage.roomPending() && MM.ctx.scenes.current.$coldRoom.hidden',timeout=60000)
  page.wait_for_timeout(700)
  row=page.evaluate('''async()=>{const {Vector3}=await import('three'),ctx=MM.ctx,a=ctx.atmosphere,c=ctx.stage.camera,R=a.target.room;const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};const poses=[...document.querySelectorAll('.pr-shadow,.cb-enemy__pool')].map(e=>{const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2,v=new Vector3(x/innerWidth*2-1,1-y/innerHeight*2,.5).unproject(c).sub(c.position);const t=-c.position.y/v.y;return {screen:[x,y],water:!!a.target.pool&&Math.abs(c.position.x+t*v.x)<a.target.pool.hw&&c.position.z+t*v.z<a.target.pool.z0&&c.position.z+t*v.z>a.target.pool.z1,world:[c.position.x+t*v.x,c.position.z+t*v.z],inside:Math.abs(c.position.x+t*v.x)<=R.w/2 && c.position.z+t*v.z>=-R.d}});return {mood:a.mood,kind:a.target.kind,vantage:a.target.vantageKind,cam:a.target.cam,room:R,floor:ctx.scenes.current._stageFl,poses}}''')
  data.append(row);print(region,json.dumps(row),flush=True)
  page.screenshot(path=str(OUT/('variant-'+region+'.png')))
 (OUT/'variants.json').write_text(json.dumps(data,indent=2))
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 for width,height in [(1920,1080),(1024,768)]:
  page.set_viewport_size({'width':width,'height':height})
  page.wait_for_timeout(1200)
  page.screenshot(path=str(OUT/f'resize-{width}.png'))
 assert not errors,errors
 b.close()
