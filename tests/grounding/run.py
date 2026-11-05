"""Real-room grounding regression: actors, room camera, props and UI together.

Round 59: a floor piece stays where the room's designer put it until a fighter
is actually standing there, and is struck while it would be crossed (Backdrop#
stageAside, p.aside). So what this test reads is what is DRAWN: every floor piece
that is not struck, and every standing lamp, against every fighter's soles AND
against the box of what is drawn of the fighter and its plate. It never asks
where a piece was authored."""
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
 const W=innerWidth,H=innerHeight;
 const boxes=[];
 for(const el of document.querySelectorAll('.cb-hero')){const r=el.getBoundingClientRect(),s=el.querySelector('.pr-shadow')?.getBoundingClientRect();if(s&&r.width>2)boxes.push({who:'kid',l:r.left/W,r:r.right/W,t:r.top/H,b:s.bottom/H,sole:(s.top+s.height*(.5-5/24))/H});}
 for(const el of document.querySelectorAll('.cb-enemy:not(.is-removed):not(.is-dead)')){const r=el.getBoundingClientRect(),st=el.querySelector('.cb-enemy__stage')?.getBoundingClientRect();if(r.width>2)boxes.push({who:'enemy',l:r.left/W,r:r.right/W,t:r.top/H,b:r.bottom/H,sole:(st&&st.height>4?st.bottom-st.height*.026:r.bottom)/H});}
 let struck=0;
 for(const p of a.backdrop.placed){
  if(p.hang||p.arch||p.hand) continue;
  if(p.aside){struck++;continue;}
  const points=[project(p.x-p.w/2,p.y,p.z),project(p.x+p.w/2,p.y,p.z),project(p.x-p.w/2,p.y+p.h,p.z),project(p.x+p.w/2,p.y+p.h,p.z)];
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  for(const it of actors) if(it.screen.x>left && it.screen.x<right && it.screen.y>top && it.screen.y<bottom) failures.push('Prop covers feet: '+p.shape+(p.fixture?' (lamp)':''));
  if(p.fixture||p.y>1) continue;
  const inset=(right-left)*.10;
  for(const B of boxes){
   if(right-inset<B.l+.006||left+inset>B.r-.006) continue;
   if(bottom<B.t||top>B.b) continue;
   if(bottom<=B.sole-.012) continue;
   failures.push('Prop through '+B.who+': '+p.shape);
  }
 }
 const companion=document.querySelector('.pr-palshadow').getBoundingClientRect();
 if(!actors.some(it=>Math.abs(it.screen.x*innerWidth-companion.x-companion.width/2)<2)) failures.push('Companion shadow detached from paws');
 const hero=document.querySelector('.pr-shadow').getBoundingClientRect();
 const boots=hero.top+hero.height*(.5-5/24);
 const heroContact=actors.find(it=>Math.abs(it.screen.x*innerWidth-(hero.x+hero.width/2))<2);
 if(!heroContact||Math.abs(heroContact.screen.y*innerHeight-boots)>2)failures.push('Hero shadow detached from boots');
 const standing=a.backdrop.placed.filter(p=>!p.hang&&!p.arch&&!p.fixture&&!p.hand&&p.y<=1);
 return {room:a.mood,view:a.target.vantageKind,viewport:[innerWidth,innerHeight],floor:MM.ctx.scenes.current._stageFl,arena:MM.ctx.scenes.current.arena,actors:actors.length,pieces:standing.length,struck,failures};
}'''
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page(viewport={'width':1280,'height':800});errors=[];results=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:8777/game/index.html#scene=combat&seed=42&companion=bones')
 page.wait_for_function('window.MM && MM.ctx.scenes.current.engine && MM.ctx.scenes.current._opening===false',timeout=60000)
 page.evaluate("async()=>{const {setSetting}=await import('/game/src/ui/settings.js');setSetting(MM.ctx,'reduceMotion',true)}")
 cases=[('bathhouse','Pool Gallery','standard',0),('pumpkin-grounds','Reflecting Pool','standard',0),('study-library','Library','boss',0),('passages','Narrow Corridor','standard',4),
        ('nursery','Nursery','standard',3),('mansion-graveyard','Yard','standard',4),('foyer','Parlor','boss',0),('crypt','Catacomb','standard',4)]
 if '--boss-only' in sys.argv: cases=[c for c in cases if c[2]=='boss']
 for region,room,tier,count in cases:
  page.evaluate('async p=>{await MM.goto("combat",p)}',dict(seed=42,region=region,room=room,tier=tier,enemies=count,companion='bones'))
  page.wait_for_timeout(150)
  page.wait_for_function('MM.ctx.scenes.current._opening===false && !MM.ctx.stage.roomPending() && MM.ctx.scenes.current.$coldRoom.hidden',timeout=90000)
  for width,height in [(1280,800),(1920,1080),(1024,768)]:
   page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(1900)
   row=page.evaluate(CHECK);results.append(row);print(json.dumps(row),flush=True)
   page.screenshot(path=str(OUT/f'checked-{region}-{width}.png'))
 (OUT/'checks.json').write_text(json.dumps({'results':results,'errors':errors},indent=2))
 b.close()
 assert not errors, errors
 assert all(not r['failures'] for r in results),[r for r in results if r['failures']]
 print('PASS: all actors on visible dry floor, no furniture through anyone, shadows anchored, no browser errors')
