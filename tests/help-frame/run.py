"""Keep the frame help in one place through scene changes, dialogs and a real boss turn.

Run with the dev server on 8777, or MM_HELP_URL=http://localhost:8831.
Optional MM_HELP_BASELINE_URL enables a serial historical card-scale comparison.
The normal gate requires only one current server. Screenshots are diagnostic;
the blind paired captures judge appearance.
"""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BASE = os.environ.get('MM_HELP_URL', 'http://localhost:8777').rstrip('/')
OUT = Path(os.environ.get('MM_HELP_OUT', str(ROOT / 'shots/help-frame')))
OUT.mkdir(parents=True, exist_ok=True)
SCENES = ['title', 'clubhouse', 'select', 'lobby', 'map', 'atlas', 'rest',
          'combat', 'reward', 'event', 'shop', 'gameover', 'tutorial', 'map']
AVAILABLE = {'clubhouse', 'map', 'atlas', 'rest', 'combat'}
GEOMETRY = r"""selector => {
  const rect = e => {const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}};
  const visible = e => {
    if(!e.getClientRects().length||getComputedStyle(e).visibility==='hidden')return false;
    for(let p=e;p;p=p.parentElement)if(Number(getComputedStyle(p).opacity)<.01)return false;
    return true;
  };
  const hit = (a,b) => b.right>b.left && b.bottom>b.top && a.left < b.right-1 && a.right > b.left+1 && a.top < b.bottom-1 && a.bottom > b.top+1;
  // Panned map nodes retain off-canvas DOM bounds; only their clipped paint is an obstacle.
  const painted = e => {
    const r=rect(e);
    for(let p=e.parentElement;p;p=p.parentElement){
      const s=getComputedStyle(p),b=rect(p);
      if(/hidden|clip|scroll|auto/.test(s.overflowX)){r.left=Math.max(r.left,b.left);r.right=Math.min(r.right,b.right);}
      if(/hidden|clip|scroll|auto/.test(s.overflowY)){r.top=Math.max(r.top,b.top);r.bottom=Math.min(r.bottom,b.bottom);}
    }
    return r;
  };
  // Atlas buttons expose only their authored polygon, not the overlapping bounding box.
  const overlaps = (r,o) => {
    if(!hit(r,painted(o)))return false;
    const footprint=o.matches('.at-hot')&&o.querySelector('.at-hot__hit');
    if(!footprint)return true;
    const clip=getComputedStyle(footprint).clipPath,box=rect(footprint);
    if(!clip.startsWith('polygon('))return true;
    let poly=clip.slice(8,-1).split(',').map(pair=>pair.trim().split(/\s+/).map((n,i)=>
      (i?box.top:box.left)+parseFloat(n)*(n.endsWith('%')?(i?box.bottom-box.top:box.right-box.left)/100:1)));
    for(const [axis,edge,sign] of [[0,r.left,1],[0,r.right,-1],[1,r.top,1],[1,r.bottom,-1]]){
      const output=[];for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],ain=sign*(a[axis]-edge)>=0,bin=sign*(b[axis]-edge)>=0;
        if(ain)output.push(a);
        if(ain!==bin){const k=(edge-a[axis])/(b[axis]-a[axis]);output.push([a[0]+k*(b[0]-a[0]),a[1]+k*(b[1]-a[1])]);}
      }poly=output;if(!poly.length)break;
    }
    const area=Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
    const words=o.querySelector('.at-name');
    return area>1 || (words&&visible(words)&&hit(r,painted(words)));
  };
  const obstacles = [...document.querySelectorAll('.kit-dress__corner,.cb-handhost .mm-card,.cb-br__candle,.cb-pile,.mm-hud,.cb-enemy__above,.cb-enemy__plate,.cb-player__plate,.cb-player__counters,.cb-statuses,.cb-mate__statuses,.cb-enemy__intent,.cb-enemy__guard,.story-tools > button,.story-voice,.kit-prop--candle,.map-props__candle,.at-dossier,.map-legend,.cl-go,.rm-go,.rs-line:not(:empty),button')].filter(visible);
  return [...document.querySelectorAll(selector)].map(e=>{
    const r=rect(e), style=getComputedStyle(e), range=document.createRange();
    const text=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
    if(text)range.selectNodeContents(text);const ink=text?range.getBoundingClientRect():r;
    const at=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
    return {tool:e.dataset.tool||e.className,rect:r,font:parseFloat(style.fontSize),text:e.textContent,
      visible:visible(e),pressable:at===e||e.contains(at),
      fits:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      inkFits:ink.left>=r.left-1&&ink.right<=r.right+1&&ink.top>=r.top-1&&ink.bottom<=r.bottom+1,
      collisions:obstacles.filter(o=>o!==e&&!e.contains(o)&&!o.contains(e)&&overlaps(r,o)).map(o=>o.className)};
  });
}"""

def frame_layout(page):
    # Focus restoration and screenshots must not scroll the fixed game shell.
    return page.evaluate("""()=>{const root=MM.ctx.scenes.current.root;
      const nodes=[document.documentElement,document.body,document.getElementById('app'),document.getElementById('dom-layer'),root];
      const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height];};
      return {window:[scrollX,scrollY],scroll:nodes.map(e=>[e.scrollLeft,e.scrollTop]),
        rects:[root,document.querySelector('.map-screen'),document.querySelector('.mm-hud')].map(rect)};
    }""")


def settled_map_geometry(page):
    # mm-rise starts after scene entry; a sleep can sample its 14px offset.
    # Wait for finite entry animations and three equal measured layouts instead.
    page.evaluate("window.__helpMapStability={key:null,same:0,samples:[]}")
    page.wait_for_function("""()=>{
      const root=MM.ctx.scenes.current.root,proof=window.__helpMapStability;
      const moving=root.getAnimations({subtree:true}).filter(a=>a.playState!=='finished'&&a.playState!=='idle'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
      const rects=[root,...root.querySelectorAll('.map-screen,.map-bar,.map-notes,.map-atlas,.mm-hud,.story-tools')].map(e=>{
        const r=e.getBoundingClientRect();return {name:e.className,rect:[r.left,r.top,r.width,r.height],scroll:[e.scrollLeft,e.scrollTop]};});
      const key=JSON.stringify(rects),same=key===proof.key;
      if(!same||proof.samples.length===0)proof.samples.push({rects,animations:moving.map(a=>a.animationName||'transition')});
      proof.samples=proof.samples.slice(-32);proof.same=same?proof.same+1:0;proof.key=key;
      const drawn=root.querySelector('.map-screen')?.classList.contains('is-drawn');
      return drawn&&moving.length===0&&proof.same>=3;
    }""",timeout=60000)


def settled(page, scene):
    page.wait_for_function('name=>MM.ctx.scenes.currentName===name&&!MM.ctx.scenes.busy', arg=scene, timeout=150000)
    if scene == 'combat':
        page.wait_for_function('()=>{const s=MM.ctx.scenes.current;return s.engine&&s._opening===false&&!MM.ctx.stage.roomPending()&&s.hero._kidSrc}',timeout=150000)
        page.evaluate('async()=>{await MM.ctx.scenes.current._settle();window.__helpShellStability={key:null,same:0,samples:[]}}')
        # Entry dread can still translate the HUD by a fraction of a pixel after
        # the opening cards have arrived. Compare focus only after measured rest.
        page.wait_for_function('''()=>{
          const root=MM.ctx.scenes.current.root,proof=window.__helpShellStability;
          const nodes=[root,document.querySelector('.mm-hud')];
          const rects=nodes.map(e=>{const r=e?.getBoundingClientRect();return r?[r.left,r.top,r.width,r.height]:null});
          const key=JSON.stringify({rects,scroll:[scrollX,scrollY,root.scrollLeft,root.scrollTop]});
          if(key!==proof.key)proof.samples.push(JSON.parse(key));
          proof.same=key===proof.key?proof.same+1:0;proof.key=key;
          const finite=root.getAnimations({subtree:true}).some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
          return proof.same>=3&&!finite;
        }''',polling=100,timeout=60000)
    if scene in AVAILABLE:
        page.wait_for_selector('.story-tools > button')
    page.evaluate('async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}')
    page.wait_for_timeout(150)
    if scene=='map':settled_map_geometry(page)

def hidden(page):
    assert page.locator('.story-tools').evaluate("e=>getComputedStyle(e).visibility==='hidden'")
    assert page.locator('.story-tools > button:visible').count() == 0
    assert page.locator('.story-tool__label:visible').count() == 0

def revealed_labels(page, width, scene):
    """A compact direct button still supplies full-size words on every input path."""
    proof=[]
    page.mouse.move(0,0);page.evaluate('document.activeElement?.blur()')
    for button in page.locator('.story-tools > button').all():
        kind=button.get_attribute('data-tool')
        label=button.locator('.story-tool__label')
        assert button.get_attribute('aria-label')==label.text_content()
        assert not label.is_visible(),('label should rest inside medallion',scene,kind)
        before=frame_layout(page)
        for mode in ['hover','keyboard focus','controller focus']:
            if mode=='hover':button.hover()
            elif mode=='keyboard focus':
                page.mouse.move(0,0);button.focus()
            else:
                page.evaluate("kind=>MM.ctx.navigator._focus(document.querySelector('[data-tool=\"'+kind+'\"]'))",kind)
            assert label.is_visible(),(scene,kind,mode,'missing full label')
            row=page.evaluate(GEOMETRY,f'[data-tool="{kind}"] .story-tool__label')[0]
            assert row['fits'] and row['inkFits'] and row['pressable'] and row['font'] >= (20 if width==1280 else 22),(scene,kind,mode,row)
            assert not row['collisions'],(scene,kind,mode,row)
            assert frame_layout(page)==before,('label focus moved shell',scene,mode,before,frame_layout(page))
            proof.append({'tool':kind,'mode':mode,**row})
        if scene in ['map','rest','atlas','combat']:
            page.screenshot(path=str(OUT/f'{scene}-{width}-{kind}-label.png'))
        page.mouse.move(0,0);button.evaluate('e=>e.blur()')
        assert not label.is_visible(),(scene,kind,'label remained after blur')
    # Exercise actual menu controller cycling and one-press activation, not just CSS.
    if scene=='map':
        page.locator('[data-tool="discoveries"]').focus()
        page.keyboard.press('Tab')
        assert page.locator('[data-tool="help"]').evaluate('e=>document.activeElement===e')
        assert page.locator('[data-tool="help"] .story-tool__label').is_visible()
        page.evaluate('MM.ctx.navigator.handle({action:"prev"})')
        assert page.locator('[data-tool="discoveries"]').evaluate('e=>document.activeElement===e')
        assert page.locator('[data-tool="discoveries"] .story-tool__label').is_visible()
        page.evaluate('MM.ctx.navigator.handle({action:"confirm"})')
        page.wait_for_selector('dialog[open]');hidden(page)
        page.evaluate('MM.ctx.navigator.handle({action:"cancel"})')
        page.wait_for_function("!document.querySelector('dialog[open]')")
        page.evaluate('document.activeElement?.blur()')
    return proof


def modal_roundtrip(page, tool):
    before=frame_layout(page)
    button=page.locator(f'.story-tools > [data-tool="{tool}"]')
    button.click()
    if tool == 'help':
        page.wait_for_selector('.mm-modal')
    else:
        page.wait_for_selector('dialog[open]')
    hidden(page)
    page.keyboard.press('Escape')
    page.wait_for_function("!document.querySelector('.mm-modal,dialog[open]')")
    assert button.is_visible()
    assert button.evaluate('e=>document.activeElement===e'), f'{tool} did not regain keyboard focus'
    assert frame_layout(page)==before,('focus moved game shell',tool,before,frame_layout(page))



def shelf_stability(page, width, phase):
    # Compare the same settled shelf with the contextual action mounted and removed.
    # Card positions breathe, so compare the layout bounds the fan actually receives.
    result=page.evaluate("""async()=>{
      const s=MM.ctx.scenes.current,voice=document.querySelector('.story-voice');
      await s._settle();
      const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const snap=()=>({bounds:[s.hand._bL,s.hand._bR,s.hand._bLoKey],
        shelf:[...document.querySelectorAll('.cb-br__piles,.cb-br .cb-pile,.cb-br .cb-endturn')].filter(e=>!e.hidden).map(e=>{
          const r=e.getBoundingClientRect();return {name:e.id||e.className,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})});
      s._syncHandBounds();await tick();const mounted=snap(),display=voice.style.display;
      voice.style.display='none';s._syncHandBounds();await tick();const absent=snap();
      voice.style.display=display;s._syncHandBounds();await tick();const restored=snap();
      return {mounted,absent,restored};
    }""")
    for other in ['absent','restored']:
        assert result['mounted']['bounds']==result[other]['bounds'],('voice changed hand bounds',width,phase,result)
        for a,b in zip(result['mounted']['shelf'],result[other]['shelf']):
            assert a['name']==b['name'] and all(abs(a[k]-b[k])<1 for k in ['left','right','top','bottom']),('voice moved shelf',width,phase,result)
    return result



def hand_fit_proof(page):
    """Real combat layout, identical authored cards and viewport on each served revision.
    Card lists use Hand.setCards, the same display fixture as tests/cards-feel.
    No gameplay balance or font settings are changed.
    """
    hosts=[]
    baseline=os.environ.get('MM_HELP_BASELINE_URL')
    if baseline:hosts.append(('baseline',baseline.rstrip('/')))
    hosts.append(('candidate',BASE))
    measured={}
    for label,host in hosts:
        page.goto(host+'/game/index.html#scene=combat&encounter=foyer-boss&seed=7&companion=bones&kid=maya')
        page.wait_for_function('window.MM&&MM.ctx.stage.warmStage==="done"&&!MM.ctx.scenes.busy',timeout=150000)
        settled(page,'combat')
        measured[label]=[]
        for width,height in [(1280,800),(1600,900)]:
            page.set_viewport_size({'width':width,'height':height})
            # Re-enter for the unmodified opening hand at each viewport.
            page.evaluate("()=>MM.goto('combat',{seed:7,companion:'bones',kid:'maya',encounter:'foyer-boss',narrativeBypass:true})")
            settled(page,'combat')
            for count in [5,9,12]:
                if count!=5:
                    page.evaluate("""async n=>{const s=MM.ctx.scenes.current;
                      const {default:bones}=await import('./src/data/companions/bones.js');
                      s.hand.setCards(bones.cards.slice(0,n).map((def,i)=>({def,uid:'frame-proof-'+i})));
                      s._syncHandBounds();}""",count)
                page.mouse.move(0,0);page.wait_for_timeout(1000)
                row=page.evaluate("""()=>{const s=MM.ctx.scenes.current;
                  return {fit:s.hand.fit,cw:s.hand.cw,ch:s.hand.chh,bounds:[s.hand._bL,s.hand._bR,s.hand._bLoKey],
                    cards:s.hand.slots.map(slot=>{const el=slot.view.el,m=new DOMMatrixReadOnly(getComputedStyle(el).transform),scale=Math.hypot(m.a,m.b);
                      return {uid:slot.card.uid,id:slot.card.def.id,scale,fonts:['.mm-card__name','.mm-card__rules'].map(sel=>{
                        const e=el.querySelector(sel);return e?parseFloat(getComputedStyle(e).fontSize)*scale:null;})};})};}""")
                row.update(width=width,count=count)
                assert len(row['cards'])==count,row
                if label=='candidate':
                    for item in page.evaluate(GEOMETRY,'.story-tools'):
                        assert item['fits'] and not item['collisions'],('crowded hand footer',width,count,item)
                measured[label].append(row)
                page.screenshot(path=str(OUT/f'hand-{label}-{width}-{count}.png'))
                print('MEASURE hand',label,width,count,'fit',row['fit'],flush=True)
                (OUT/'hand-fit.json').write_text(json.dumps(measured,indent=2),encoding='utf-8')
    if baseline:
        for old,new in zip(measured['baseline'],measured['candidate']):
            assert old['width']==new['width'] and old['count']==new['count']
            assert new['fit']>=old['fit']-.001,('hand fit shrank',old,new)
            for a,b in zip(old['cards'],new['cards']):
                assert a['id']==b['id'],(a,b)
                assert b['scale']>=a['scale']-.001,('card scale shrank',old['width'],old['count'],a,b)
                for before,after in zip(a['fonts'],b['fonts']):
                    if before is not None:assert after>=before-.05,('reading type shrank',old['width'],old['count'],a,b)
    return measured


def crowded_map(page, width, height):
    # Four is the generator's maximum supported count, using a genuine authored wing.
    page.set_viewport_size({'width':width,'height':height})
    page.evaluate("""async()=>{const {Run}=await import('./src/state/run.js');
      const run=new Run({seed:7,kid:'maya',companion:'bones',startRegion:'kitchens-cellars',entryUnlocked:true,hauntLevel:5});
      run.ephemeral=true;run.ctx=MM.ctx;MM.ctx.run=run;
      await MM.goto('map',{seed:7,narrativeBypass:true});}""")
    settled(page,'map');page.mouse.move(0,0)
    assert page.locator('.map-notes > .note').count()==4,'maximum map condition fixture changed'
    rows=page.evaluate(GEOMETRY,'.story-tools,.map-legend,.map-notes > .note,.map-atlas')
    for row in rows:
        assert row['fits'] and row['visible'] and row['pressable'] and not row['collisions'],('crowded map',width,row)
    layout=frame_layout(page)
    page.mouse.move(0,0);page.evaluate('document.activeElement?.blur()')
    page.screenshot(path=str(OUT/f'map-four-conditions-{width}.png'))
    after=frame_layout(page)
    (OUT/f'map-four-conditions-{width}-geometry.json').write_text(json.dumps({'controls':rows,'before':layout,'after':after,'settling':page.evaluate('window.__helpMapStability.samples')},indent=2),encoding='utf-8')
    assert after==layout,('crowded map capture moved shell',width,layout,after)
    print('PASS four-condition map',width,flush=True)
    return {'scene':'four-condition map','width':width,'controls':rows,'layout':layout}


def main():
    results=[];errors=[];failure=None;started=time.monotonic()
    with sync_playwright() as p:
        browser=p.chromium.launch(args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':1280,'height':800})
        page.set_default_timeout(60000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            hand_fit_proof(page)
            page.evaluate("()=>MM.goto('title',{narrativeBypass:true})");settled(page,'title')
            for width,height in [(1280,800),(1600,900)]:
                page.set_viewport_size({'width':width,'height':height})
                anchors={}
                for visit,scene in enumerate(SCENES):
                    page.evaluate('p=>MM.goto(p.scene,p.params)',{'scene':scene,'params':{'seed':7,'companion':'bones','kid':'maya','encounter':'foyer-boss','narrativeBypass':True}})
                    settled(page,scene)
                    layout_before=frame_layout(page)
                    rows=page.evaluate(GEOMETRY,'.story-tools > button')
                    expected=0 if scene not in AVAILABLE else 1 if scene=='combat' else 2
                    assert len(rows)==expected,(scene,rows)
                    for row in rows:
                        assert row['fits'] and row['inkFits'] and row['visible'] and row['pressable'],(scene,row)
                        assert not row['collisions'],(scene,row)
                        assert row['font'] >= (20 if width==1280 else 22),(scene,row)
                        previous=anchors.setdefault(row['tool'],row['rect'])
                        assert all(abs(previous[k]-row['rect'][k])<1 for k in previous),(scene,'moved',previous,row)
                    frame=page.evaluate(GEOMETRY,'.story-tools')
                    assert len(frame)==(1 if rows else 0),(scene,frame)
                    for fitting in frame:
                        assert fitting['fits'] and fitting['visible'] and not fitting['collisions'],(scene,'whole frame',fitting)
                        previous=anchors.setdefault('frame-'+str(expected),fitting['rect'])
                        assert all(abs(previous[k]-fitting['rect'][k])<1 for k in previous),(scene,'frame moved',previous,fitting)
                    labels=revealed_labels(page,width,scene) if rows else []
                    if rows:
                        modal_roundtrip(page,'help')
                        if scene!='combat':modal_roundtrip(page,'discoveries')
                    if scene=='combat':
                        page.locator('#draw-pile').click();page.wait_for_selector('.mm-modal');hidden(page)
                        page.keyboard.press('Escape');page.wait_for_function("!document.querySelector('.mm-modal')")
                        assert page.locator('.story-tools').is_visible()
                        assert page.locator('#draw-pile').evaluate('e=>document.activeElement===e')
                    if scene=='map':
                        page.locator('.mm-hud__settings').click();page.wait_for_selector('.mm-modal');hidden(page)
                        page.keyboard.press('Escape');page.wait_for_function("!document.querySelector('.mm-modal')")
                        assert page.locator('.story-tools').is_visible()
                    assert frame_layout(page)==layout_before,('dialog moved shell',scene,width,layout_before,frame_layout(page))
                    results.append({'scene':scene,'width':width,'controls':rows,'labels':labels,'frame':frame,'layout':layout_before})
                    if scene in ['combat','rest','atlas','map','clubhouse']:
                        page.mouse.move(0,0);page.evaluate('document.activeElement?.blur()')
                        shot='map-revisit' if scene=='map' and visit==len(SCENES)-1 else scene
                        page.screenshot(path=str(OUT/f'{shot}-{width}.png'))
                        results[-1]['afterCaptureLayout']=frame_layout(page)
                        assert results[-1]['afterCaptureLayout']==layout_before,('capture moved shell',scene,width)
                    if scene=='clubhouse':
                        for panel in ['menagerie','pets','backpack']:
                            page.locator(f'.cl-tab[data-panel="{panel}"]').click()
                            page.wait_for_function('()=>MM.ctx.scenes.current.root.getAnimations({subtree:true}).every(a=>a.playState!=="running"||!Number.isFinite(a.effect?.getComputedTiming().endTime))')
                            panel_labels=revealed_labels(page,width,'clubhouse '+panel)
                            controls=page.evaluate(GEOMETRY,'.story-tools > button')
                            assert all(r['fits'] and r['pressable'] and not r['collisions'] for r in controls),(panel,controls)
                            results.append({'scene':'clubhouse '+panel,'width':width,'controls':controls,'labels':panel_labels})
                        page.locator('.cl-tab[data-panel="board"]').click()
                    print('PASS',scene,width,flush=True)
            for width,height in [(1280,800),(1600,900)]:
                results.append(crowded_map(page,width,height))
            # The contextual action must fit and remain usable at both required sizes.
            for width,height in [(1280,800),(1600,900)]:
                page.set_viewport_size({'width':width,'height':height})
                page.evaluate("""async()=>{const {Run}=await import('./src/state/run.js');
                  const run=new Run({seed:7,kid:'maya',companion:'bones'});run.ephemeral=true;run.ctx=MM.ctx;MM.ctx.run=run;
                  await MM.goto('combat',{seed:7,kid:'maya',companion:'bones',encounter:'foyer-boss',narrativeBypass:true});}""")
                settled(page,'combat')
                voice=page.get_by_role('button',name='Guardian voice',exact=True)
                assert voice.is_visible() and voice.is_disabled()
                initial_shelf=shelf_stability(page,width,'initial disabled')
                page.locator('#end-turn').click()
                page.wait_for_function("()=>{const b=document.querySelector('.story-voice');return b&&!b.disabled}",timeout=60000)
                page.evaluate('async()=>{await MM.ctx.scenes.current._settle();await document.fonts.ready}')
                enabled_shelf=shelf_stability(page,width,'enabled')
                geometry=page.evaluate(GEOMETRY,'.story-voice')
                assert len(geometry)==1,geometry
                row=geometry[0]
                assert row['fits'] and row['inkFits'] and row['visible'] and row['pressable'],('guardian',width,row)
                assert row['font'] >= (20 if width==1280 else 22),('guardian',width,row)
                assert not row['collisions'],('guardian',width,row)
                frame=page.evaluate(GEOMETRY,'.story-tools')[0]
                assert frame['fits'] and not frame['collisions'],('guardian frame',width,frame)
                results.append({'scene':'guardian voice','width':width,'controls':geometry,'frame':frame,'initialShelf':initial_shelf,'enabledShelf':enabled_shelf})
                page.mouse.move(0,0);page.screenshot(path=str(OUT/f'guardian-{width}.png'))
                voice.click();page.wait_for_selector('.mm-modal');hidden(page)
                assert not voice.is_visible()
                page.keyboard.press('Escape');page.wait_for_function("!document.querySelector('.mm-modal')")
                assert voice.is_visible() and voice.evaluate('e=>document.activeElement===e')
                page.evaluate("()=>MM.goto('clubhouse',{narrativeBypass:true})");settled(page,'clubhouse')
                assert page.locator('.story-voice').count()==0
            assert not errors,errors
            print('RESULT: PASS',len(results),'scene/size checks, modal focus and guardian lifecycle;',round(time.monotonic()-started,2),'seconds',flush=True)
        except Exception as error:
            failure=str(error)
            page.screenshot(path=str(OUT/'failure.png'))
            raise
        finally:
            (OUT/'proof.json').write_text(json.dumps({'results':results,'errors':errors,'failure':failure,'seconds':round(time.monotonic()-started,2)},indent=2),encoding='utf-8')
            browser.close()

if __name__=='__main__':main()
