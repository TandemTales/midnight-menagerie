"""Real-browser regression: unfolded survey, annotation tools and geometry.
Requires the local server on 8777 and installed Chrome. No user profile is used.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
OUT=Path(__file__).parent
URL='http://localhost:8777/game/index.html#scene=map&seed=42&region=foyer'
checks=[]
def check(label, condition):
    assert condition, label
    checks.append(label)
    print('PASS '+label,flush=True)
def ready(page):
    page.wait_for_selector('.map-screen.is-drawn',timeout=60000)
    page.wait_for_function('!!MM.ctx.scenes.current.markings')
def state(page):
    return page.evaluate('''() => {const s=MM.ctx.scenes.current; return {size:[s.SW,s.SH], x:s.view.x,y:s.view.y,z:s.view.z,
      strokes:s.markings.strokes,visited:s.model.visited.size,mode:s.markings.mode};}''')
def tool(page,name): page.locator(f'[data-tool="{name}"]').click()
def action(page,name): page.locator(f'[data-action="{name}"]').click()
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1600,'height':900},reduced_motion='reduce')
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(URL); ready(page)
    page.evaluate('document.fonts.ready')
    s=state(page)
    check('unfolded sheet opens at readable scale, partly outside viewport',s['size'][0]>4000 and s['size'][1]>1400 and s['size'][0]/s['size'][1]>2.2 and s['z']==.85)
    check('foyer has real hallways',page.evaluate('MM.ctx.scenes.current._fp.halls.length')>=1)
    vp=page.locator('.map-viewport').bounding_box()
    page.mouse.move(vp['x']+180,vp['y']+vp['height']/2)
    page.mouse.down();page.mouse.move(vp['x']+100,vp['y']+vp['height']/2-60,steps=12);page.mouse.up()
    dragged=state(page)
    check('Hand drags the sheet without choosing a room',dragged['x']<s['x'] and dragged['y']<s['y'] and dragged['visited']==0)
    action(page,'here');s=state(page)
    page.mouse.move(vp['x']+vp['width']/2,vp['y']+vp['height']/2)
    page.mouse.wheel(0,160)
    after=state(page)
    check('wheel scrolls vertically without zooming', after['y']<s['y'] and after['z']==s['z'])
    page.keyboard.down('Shift'); page.mouse.wheel(0,160); page.keyboard.up('Shift')
    after2=state(page)
    check('Shift wheel scrolls sideways',after2['x']<after['x'])
    page.keyboard.down('Control'); page.mouse.wheel(0,-200); page.keyboard.up('Control')
    check('Ctrl wheel zooms',state(page)['z']>after2['z'])
    action(page,'here')
    # Draw directly over a legal room: must never select that room.
    page.locator('.map-node.is-legal').nth(2).focus()
    b=page.locator('.map-node.is-legal').nth(2).bounding_box()
    x=b['x']+b['width']/2; y=b['y']+b['height']/2
    tool(page,'red')
    page.mouse.move(x-25,y-18); page.mouse.down(); page.mouse.move(x+55,y+28,steps=20); page.mouse.up()
    s=state(page)
    check('marker draws over room buttons without entering a room',len(s['strokes'])==1 and s['visited']==0)
    drawn=s['strokes']
    action(page,'in')
    check('zoom leaves mark coordinates attached to the sheet',state(page)['strokes']==drawn)
    page.reload();ready(page)
    check('marks survive reopening the map',state(page)['strokes']==drawn)
    # Erase in actual screen coordinates after reopening/zoom restoration.
    point=drawn[0]['points'][len(drawn[0]['points'])//2]
    page.evaluate('''p=>{const s=MM.ctx.scenes.current;s._lookAt({x:p[0]/s.SW,y:p[1]/s.SH},0)}''',point)
    pt=page.evaluate('''p=>{const s=MM.ctx.scenes.current,r=s._vpRect();return [r.left+s.view.x+p[0]*s.view.z,r.top+s.view.y+p[1]*s.view.z]}''',point)
    tool(page,'erase');page.mouse.click(*pt)
    check('eraser removes a player stroke',len(state(page)['strokes'])==0)
    action(page,'undo')
    check('undo restores an erased stroke',state(page)['strokes']==drawn)
    action(page,'clear');check('clear removes personal marks',len(state(page)['strokes'])==0)
    action(page,'undo');check('clear can be undone',state(page)['strokes']==drawn)
    # Native keyboard activation on toolbar must not reach the room-enter handler.
    page.locator('[data-action="clear"]').focus();page.keyboard.press('Enter')
    check('toolbar Enter does not enter a room',state(page)['visited']==0 and len(state(page)['strokes'])==0)
    tool(page,'pan')
    page.locator('.map-node.is-legal').nth(1).focus()
    page.keyboard.press('m')
    check('keyboard can mark the selected room',len(state(page)['strokes'])==2)
    page.keyboard.press('Delete')
    check('keyboard can erase marks at the selected room',len(state(page)['strokes'])==0)
    page.keyboard.press('Control+z')
    check('keyboard undo restores the room mark',len(state(page)['strokes'])==2)
    # Verify every room, hallway, opening, waypoint and graph on many wings.
    geometry=page.evaluate('''async()=>{
      const {generateRegionMap,reachableFrom}=await import('/game/src/state/mapgen.js');
      const regions=['foyer','nursery','sleeping-quarters','kitchens-cellars','greenhouse','graveyard','study-library','attic-observatory','lampworks','ballroom','crypt','hedge-maze','secret-passages','bathhouse','kennels','pumpkin-grounds','heart'];
      const {mansionDoorStates}=await import('/game/src/state/mansion-layout.js');
      let maps=0,halls=0,states=0,negativeControls=0,ordinary=0,adjacent=0,totalLength=0,maxLength=0,secrets=0;const errors=[],footprints=new Set();
      for(const region of regions)for(const seed of [1,7,42,1337]){
        const m=generateRegionMap(region,seed,{style:'plan'}),p=m.plan;
        const again=generateRegionMap(region,seed,{style:'plan'});
        if(JSON.stringify(m)!==JSON.stringify(again))errors.push('nondeterministic');
        const reachable=reachableFrom(m,null);
        for(const n of m.nodes){const r=p.rooms.find(r=>r.id===n.id),x=n.x*p.sheet.w,y=n.y*p.sheet.h;
          if(!reachable.has(n.id)&&!m.startIds.includes(n.id))errors.push('unreachable '+n.id);
          if(x<r.x0||x>r.x1||y<r.y0||y>r.y1)errors.push('mark outside room');
          if(n.id!==m.bossId&&!n.next.length)errors.push('dead end');
        }
        const spaces=[...p.rooms,...p.halls,...(p.annexes||[])];
        for(let i=0;i<spaces.length;i++)for(let j=i+1;j<spaces.length;j++){
          const a=spaces[i],b=spaces[j];
          if(Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>.1&&Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>.1)errors.push('overlap');
        }
        for(const d of p.doors){
          const sides=spaces.filter(r=>d.vert===false
            ? (Math.abs(r.y0-d.y)<.1||Math.abs(r.y1-d.y)<.1)&&d.x-d.w/2>=r.x0-.1&&d.x+d.w/2<=r.x1+.1
            : (Math.abs(r.x0-d.x)<.1||Math.abs(r.x1-d.x)<.1)&&d.y-d.w/2>=r.y0-.1&&d.y+d.w/2<=r.y1+.1);
          if(sides.length<(d.kind==='front'||d.exterior?1:2))errors.push('door outside shared wall');
        }
        const inside=(q,r)=>q[0]>=r.x0-.01&&q[0]<=r.x1+.01&&q[1]>=r.y0-.01&&q[1]<=r.y1+.01;
        const inHalls=q=>p.halls.some(r=>inside(q,r));
        for(const e of m.edges) {
          if(e.kind==='secret')continue;
          const fromDoor=p.doors.find(d=>d.id===e.exitDoor),toDoor=p.doors.find(d=>d.id===e.entryDoor);
          const first=e.via[0],last=e.via.at(-1);
          if(!fromDoor||!toDoor||Math.hypot(first[0]-fromDoor.x,first[1]-fromDoor.y)>.1||Math.hypot(last[0]-toDoor.x,last[1]-toDoor.y)>.1)errors.push('route misses door');
          for(let i=0;i+1<e.via.length;i++){
            const a=e.via[i],b=e.via[i+1],steps=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/12));
            for(let j=0;j<=steps;j++)if(!inHalls([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]))errors.push('route leaves halls');
          }
        }
        for(const via of Object.values(p.entryVia))for(let i=0;i+1<via.length;i++) {
          const a=via[i],b=via[i+1];for(let j=0;j<=100;j++)if(!inHalls([a[0]+(b[0]-a[0])*j/100,a[1]+(b[1]-a[1])*j/100]))errors.push('entry cuts through walls');
        }
        if(p.doors.filter(d=>d.kind==='front').length!==1)errors.push('not a single main entrance');
        if(!p.halls.some(h=>h.vertical)||!p.halls.some(h=>!h.vertical))errors.push('missing cross/side passage network');
        if(!p.blockers.length||p.secrets.length>2)errors.push('missing blockages or excessive secret routes');
        if(seed===42)footprints.add(JSON.stringify(p.footprint));
        // A clear route must not cross any full-width obstruction.
        for(const e of m.edges.filter(e=>e.kind==='hall'))for(let i=0;i+1<e.via.length;i++){
          const a=e.via[i],b=e.via[i+1];
          for(const d of p.blockers){
            const k=d.vert===false?1:0,j=1-k,at=k?d.y:d.x,along=k?d.x:d.y;
            if((a[k]-at)*(b[k]-at)>0||a[k]===b[k])continue;
            const t=(at-a[k])/(b[k]-a[k]),v=a[j]+t*(b[j]-a[j]);
            if(t>=0&&t<=1&&Math.abs(v-along)<48)errors.push('route crosses blockage');
          }
        }
        for(const e of m.edges.filter(e=>e.kind==='secret')){
          const a=p.rooms.find(r=>r.id===e.from),b=p.rooms.find(r=>r.id===e.to);
          if(!inside(e.via[0],a)||!inside(e.via[1],b))errors.push('secret endpoint outside its room');
          if(!p.secrets.some(s=>s.id===e.passageId&&s.from===e.from&&s.to===e.to))errors.push('unpaired secret');
        }
        for(const current of [null,...m.nodes.map(n=>n.id)]){
          const offered=current?m.nodes.find(n=>n.id===current).next:m.startIds;
          const doors=mansionDoorStates(m,current);
          const todo=current?doors.filter(d=>d.open&&d.to===current&&d.role==='exit').map(d=>d.hallNode):[p.entryHallNode];
          const seen=new Set(todo);
          for(let i=0;i<todo.length;i++)for(const e of p.hallLinks){
            if(e.blocked)continue;
            const n=e.a===todo[i]?e.b:e.b===todo[i]?e.a:null;
            if(n&&!seen.has(n)){seen.add(n);todo.push(n);}
          }
          const accessible=new Set(doors.filter(d=>d.open&&d.role==='entry'&&d.to!==current&&seen.has(d.hallNode)).map(d=>d.to));
          for(const e of m.edges)if(e.from===current&&e.kind==='secret')accessible.add(e.to);
          if(accessible.size!==offered.length||offered.some(id=>!accessible.has(id)))errors.push('physical access differs from legal choices');
          const expected=new Set(current?m.edges.filter(e=>e.from===current&&e.kind==='hall').flatMap(e=>[e.exitDoor,e.entryDoor]):doors.filter(d=>d.routeFrom===null&&offered.includes(d.to)).map(d=>d.id));
          const invalid=ds=>ds.some(d=>d.open!==expected.has(d.id));
          if(invalid(doors))errors.push('wrong latch state');
          const closed=doors.find(d=>!d.open);
          if(closed){const broken=doors.map(d=>d===closed?{...d,open:true}:d);if(!invalid(broken))errors.push('negative control failed');else negativeControls++;}
          states++;
        }
        for(const c of p.courts)for(const r of spaces)if(Math.min(c.x1,r.x1)-Math.max(c.x0,r.x0)>.1&&Math.min(c.y1,r.y1)-Math.max(c.y0,r.y0)>.1)errors.push('room intrudes into open court');
        const areas=p.rooms.filter(r=>r.type!=='boss').map(r=>(r.x1-r.x0)*(r.y1-r.y0));
        /* Measured 2026-11-03: 1.88 at the least varied of 68 maps (sleeping-quarters, seed 1,
           49 rooms) and over 2 on the rest. The bar is for a wing of identical rooms. */
        if(Math.max(...areas)/Math.min(...areas)<1.8)errors.push('undifferentiated room sizes');
        for(const e of m.edges){
          const a=m.nodes.find(n=>n.id===e.from),b=m.nodes.find(n=>n.id===e.to);
          if(e.kind==='secret'){secrets++;continue;}
          const length=Math.hypot((b.x-a.x)*p.sheet.w,(b.y-a.y)*p.sheet.h);
          ordinary++;totalLength+=length;maxLength=Math.max(maxLength,length);if(b.row===a.row+1)adjacent++;
          if(b.row-a.row>2)errors.push('ordinary route skips distant stages');
        }
        maps++;halls+=p.halls.length;
      }
      if(footprints.size!==17)errors.push('repeated section footprint');
      return {maps,halls,states,negativeControls,footprints:footprints.size,meanLength:totalLength/ordinary,maxLength,adjacentShare:adjacent/ordinary,secrets,errors};
    }''')
    print('GEOMETRY',geometry,flush=True)
    check('68 deterministic maps: connected rooms, real door gaps, no overlapping spaces',not geometry['errors'])
    check('hallways occur across the generated estate',geometry['halls']>=68)
    check('every room state exposes only legal destinations, with negative controls',geometry['states']>3000 and geometry['negativeControls']==geometry['states'])
    check('branches stay local: average under 450px, 90% neighboring stages, rare shortcuts',geometry['meanLength']<450 and geometry['maxLength']<1100 and geometry['adjacentShare']>.9 and geometry['secrets']<=136)
    action(page,'here')
    page.screenshot(path=str(OUT/'foyer.png'),timeout=60000)
    action(page,'overview')
    page.screenshot(path=str(OUT/'overview.png'),timeout=60000)
    check('overview fits the whole sheet',page.evaluate('''()=>{const s=MM.ctx.scenes.current,r=s._vpRect();return s.SW*s.view.z<=r.width&&s.SH*s.view.z<=r.height}'''))
    page.set_viewport_size({'width':1280,'height':800})
    check('toolbar fits at 1280 without clipping',page.evaluate('''()=>[...document.querySelectorAll('.map-tools button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})'''))
    action(page,'here')
    page.screenshot(path=str(OUT/'foyer-1280.png'),timeout=60000)
    # Hand mode still allows real room selection after all tool use.
    tool(page,'pan');page.keyboard.press('Tab')
    page.evaluate('''()=>{const s=MM.ctx.scenes.current;s._focusId=s._legalIds[1];s._focusMove()}''')
    focused=page.locator('.map-node.is-kbd');focused.click()
    check('hand mode still selects rooms after drawing and erasing',state(page)['visited']==1)
    latch=page.evaluate("""()=>{const s=MM.ctx.scenes.current,open=[...s.el.ink.querySelectorAll('[data-door][data-open="true"]')].map(e=>e.dataset.threshold);const expected=s.model.map.edges.filter(e=>e.from===s.model.currentId&&e.kind==='hall').flatMap(e=>[e.exitDoor,e.entryDoor]);return open.length===expected.length&&expected.every(id=>open.includes(id));}""")
    check('rendered doorway latches update after a real room click',latch)
    before=state(page)['visited']
    page.evaluate("document.querySelector('.map-node[aria-disabled=true]:not(.is-current)').click()")
    check('closed rooms reject real clicks',state(page)['visited']==before)
    page.goto(URL+'&mapstyle=classic')
    page.reload()  # A hash-only navigation does not reboot the game.
    page.wait_for_selector('.map-screen.is-drawn',timeout=60000)
    check('classic map still opens without the new tools',page.evaluate('MM.ctx.scenes.current._fp===null') and page.locator('.map-tools').count()==0)
    check('no browser exceptions',not errors)
    (OUT/'result.json').write_text(json.dumps({'checks':checks,'geometry':geometry,'errors':errors},indent=2))
    browser.close()
