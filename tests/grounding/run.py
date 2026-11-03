"""Real-room grounding regression: actors, room camera, props and UI together."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright
import json
OUT=Path(__file__).parent
CHECK=r'''async () => {
 const {Vector3}=await import('three'), a=MM.ctx.atmosphere, c=MM.ctx.stage.camera;
 const R=a.target.room, P=a.target.pool, v=new Vector3(), failures=[];
 const project=(x,y,z)=>{v.set(x,y,z).project(c);return {x:(v.x+1)/2,y:(1-v.y)/2}};
 const actors=a._actList.map(it=>({...it,screen:project(it.x,0,it.z)}));
 for(const it of actors){
  if(Math.abs(it.x)>R.w/2+(R.floorOver||0) || it.z < -R.d || it.z>15) failures.push('Actor outside floor');
  if(P && Math.abs(it.x)<P.hw && it.z<P.z0 && it.z>P.z1) failures.push('Actor over water');
 }
 for(const p of a.backdrop.placed){
  if(p.hang||p.arch||p.hand||p.grave||p.slab||p.fixture) continue;
  const points=[project(p.x-p.w/2,p.y,p.z),project(p.x+p.w/2,p.y,p.z),project(p.x-p.w/2,p.y+p.h,p.z),project(p.x+p.w/2,p.y+p.h,p.z)];
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  for(const it of actors) if(it.screen.x>left && it.screen.x<right && it.screen.y>top && it.screen.y<bottom) failures.push('Prop covers feet: '+p.shape);
 }
 const companion=document.querySelector('.pr-palshadow').getBoundingClientRect();
 if(!actors.some(it=>Math.abs(it.screen.x*innerWidth-companion.x-companion.width/2)<2)) failures.push('Companion shadow detached from paws');
 const hero=document.querySelector('.pr-shadow').getBoundingClientRect();
 const boots=hero.top+hero.height*(.5-5/24);
 const heroContact=actors.find(it=>Math.abs(it.screen.x*innerWidth-(hero.x+hero.width/2))<2);
 if(!heroContact||Math.abs(heroContact.screen.y*innerHeight-boots)>2)failures.push('Hero shadow detached from boots');
 return {room:a.mood,view:a.target.vantageKind,viewport:[innerWidth,innerHeight],floor:MM.ctx.scenes.current._stageFl,arena:MM.ctx.scenes.current.arena,actors:actors.length,shifted:a.backdrop.placed.filter(p=>p.stageShift>0).length,failures};
}'''
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1280,'height':800});errors=[];results=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:8777/game/index.html#scene=combat&seed=42&companion=bones')
 page.wait_for_function('window.MM && MM.ctx.scenes.current.engine && MM.ctx.scenes.current._opening===false',timeout=60000)
 page.evaluate("async()=>{const {setSetting}=await import('/game/src/ui/settings.js');setSetting(MM.ctx,'reduceMotion',true)}")
 cases=[('bathhouse','Pool Gallery','standard',0),('pumpkin-grounds','Reflecting Pool','standard',0),('study-library','Library','boss',0),('passages','Narrow Corridor','standard',4)]
 if '--boss-only' in sys.argv: cases=[c for c in cases if c[2]=='boss']
 for region,room,tier,count in cases:
  page.evaluate('async p=>{await MM.goto("combat",p)}',dict(seed=42,region=region,room=room,tier=tier,enemies=count,companion='bones'))
  page.wait_for_timeout(150)
  page.wait_for_function('MM.ctx.scenes.current._opening===false && !MM.ctx.stage.roomPending() && MM.ctx.scenes.current.$coldRoom.hidden',timeout=90000)
  for width,height in [(1280,800),(1920,1080),(1024,768)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(1300)
   row=page.evaluate(CHECK);results.append(row);print(json.dumps(row),flush=True)
   page.screenshot(path=str(OUT/f'checked-{region}-{width}.png'))
 (OUT/'checks.json').write_text(json.dumps({'results':results,'errors':errors},indent=2))
 b.close()
 assert not errors, errors
 assert all(not r['failures'] for r in results),results
 print('PASS: all actors on visible dry floor, no furniture through feet, shadows anchored, no browser errors')

