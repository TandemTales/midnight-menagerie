"""Independent reading-board focus, pointer and continuation probes."""
import json,sys,runpy
from pathlib import Path
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]);out=Path('shots/ui-r51-spinel');out.mkdir(parents=True,exist_ok=True)
INSTALL=runpy.run_path('tests/gamepad/run.py')['INSTALL']
rows=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome')
 ctx=browser.new_context(viewport={'width':1280,'height':800})
 ctx.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''))
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for scene,selector in [('shop','.sh-buy'),('rest','.rs-door'),('event','.ev-opt'),('gameover','.go-btn')]:
  page.goto(f'http://localhost:{port}/game/index.html?r50={scene}#scene={scene}&seed=7&companion=bones&kid=maya&pics=1')
  page.wait_for_function('window.MM && MM.ctx.stage.warmStage === "done"',timeout=150000)
  page.evaluate('document.fonts.ready');page.wait_for_timeout(1200)
  for w,h in [(1280,800),(1600,900)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(600)
   page.screenshot(path=str(out/f'{scene}-initial-{w}.png'))
   assert page.locator(selector).count()>0,scene+' failed to mount targets'
   row={'scene':scene,'size':[w,h],'targets':[],'cues':[]}
   row['title']=page.locator('.kit-cartouche__title').evaluate('e=>{const s=getComputedStyle(e);return {font:s.fontSize,filter:s.filter,color:s.color,fill:s.webkitTextFillColor}}')
   row['paint']=page.locator('.kit-cartouche__title').evaluate("""e=>{const s=getComputedStyle(e),r=document.createRange();r.selectNodeContents(e);const q=r.getBoundingClientRect();const probe=document.createElement('span');probe.style.cssText='position:absolute;visibility:hidden;--reading-size:clamp(26px,2.45vw,40px);font-size:max(var(--reading-floor),var(--reading-size),calc(var(--reading-size) * var(--reading-ratio) + var(--reading-lift)))';if(e.closest('.kit-titleblock--compact'))probe.style.setProperty('--reading-size','clamp(24px,2.2vw,36px)');if(e.closest('.scene--shop'))probe.style.setProperty('--reading-size',innerHeight<=860?'23px':'clamp(25px,2.1vw,34px)');if(innerHeight<=860&&e.closest('.scene--rest'))probe.style.setProperty('--reading-size','24px');if(innerHeight<=860&&e.closest('.scene--gameover'))probe.style.setProperty('--reading-size','25px');const baselineReading=probe.style.getPropertyValue('--reading-size');e.parentElement.append(probe);const expected=parseFloat(getComputedStyle(probe).fontSize);probe.remove();return {text:e.textContent,font:parseFloat(s.fontSize),expected,baselineReading,background:s.backgroundImage,clip:s.backgroundClip,fill:s.webkitTextFillColor,stroke:s.webkitTextStrokeWidth,visible:s.visibility==='visible'&&Number(s.opacity)>0&&q.width>0&&q.height>0&&q.left>=0&&q.right<=innerWidth&&q.top>=0&&q.bottom<=innerHeight,ink:{left:q.left,right:q.right,top:q.top,bottom:q.bottom}}}""")
   expected_title={'shop':'The Midnight Market','rest':'You Build the Fort','gameover':'The candle goes out.','event':page.evaluate('MM.ctx.scenes.current.def?.name')}[scene]
   assert row['paint']['text'].strip()==expected_title,(scene,row['paint']['text'],expected_title)
   assert row['paint']['text'].strip() and row['paint']['font']>=row['paint']['expected']-.01 and row['paint']['visible'],row['paint']
   assert all(layer.strip()=='text' for layer in row['paint']['clip'].split(',')) and 'lavender-paint-v1.webp' in row['paint']['background'] and row['paint']['fill']=='rgba(0, 0, 0, 0)',row['paint']
   for el in page.locator(selector).all():
    el.scroll_into_view_if_needed();page.wait_for_timeout(60)
    result=el.evaluate('''e=>{const r=e.getBoundingClientRect();return {text:e.textContent,disabled:e.disabled,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),font:getComputedStyle(e).fontSize}}''')
    if not result['disabled']:
     el.focus();result['focus']=el.evaluate('e=>e===document.activeElement')
    row['targets'].append(result)
   enabled=page.locator(selector+':not(:disabled)')
   if enabled.count()>1:
    enabled.first.focus();before=page.evaluate('document.activeElement.outerHTML');page.keyboard.press('ArrowRight' if scene=='gameover' else 'ArrowDown');row['keyboardMoved']=before!=page.evaluate('document.activeElement.outerHTML')
    page.evaluate(INSTALL,'GARNET verification pad');page.wait_for_timeout(200)
    enabled.first.focus();before=page.evaluate('document.activeElement.outerHTML')
    pad_index=15 if scene=='gameover' else 13
    page.evaluate('(i)=>{__pad.buttons[i].pressed=true;__pad.buttons[i].value=1}',pad_index);page.wait_for_timeout(100)
    page.evaluate('(i)=>{__pad.buttons[i].pressed=false;__pad.buttons[i].value=0}',pad_index);page.wait_for_timeout(150)
    row['gamepadMoved']=before!=page.evaluate('document.activeElement.outerHTML')
    page.evaluate('()=>{navigator.getGamepads=__padOrig}')
   for cue in page.locator('.r49-scrollcue').all():
    if not cue.is_visible():continue
    cue.scroll_into_view_if_needed();cue.focus()
    label=cue.get_attribute('data-board-scroll')
    old=page.url
    scroll_selector={'wares':'.rm-body','choices':'.rs-choices','story':'.ev-reading-r51','record':'.go-wrap','Tricks':'.go-block--deck','Keepsakes':'.go-block--keep'}[label]
    scroller=page.locator(scroll_selector);motions=[]
    for key in ['Enter','Space']:
     cue.focus();scroller.evaluate('e=>e.scrollTop=0');page.wait_for_timeout(70);before_scroll=scroller.evaluate('e=>e.scrollTop');page.keyboard.press(key);page.wait_for_timeout(150);after_scroll=scroller.evaluate('e=>e.scrollTop');assert after_scroll>before_scroll,(scene,label,key,before_scroll,after_scroll);motions.append({'key':key,'before':before_scroll,'after':after_scroll})
     assert page.url==old,scene+' cue triggered scene shortcut'
    scroller.evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(80);assert cue.get_attribute('data-end')=='true';cue.focus();page.keyboard.press('Enter');page.wait_for_timeout(80);assert scroller.evaluate('e=>e.scrollTop')==0
    row['cues'].append({'label':label,'motions':motions,'endToTop':True,'hit':cue.evaluate('e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'),'keyboardScenePreserved':page.url==old})
   page.screenshot(path=str(out/f'{scene}-interactions-{w}.png'))
   rows.append(row);print(scene,w,len(row['targets']),'targets',flush=True)
 browser.close()
(out/'interactions.json').write_text(json.dumps({'rows':rows,'errors':errors},indent=2),encoding='utf-8')
assert not errors,errors
assert all(t['hit'] for r in rows for t in r['targets']), 'Some targets are covered'
assert all(t.get('focus',True) for r in rows for t in r['targets'])
assert all(c['hit'] and c['keyboardScenePreserved'] for r in rows for c in r['cues'])
assert all(r.get('gamepadMoved',True) for r in rows), 'Gamepad navigation failed'

assert all(r.get('keyboardMoved',True) for r in rows), 'Keyboard navigation failed'
