"""All seventeen actual boss reward routes and their selected narrative outcomes."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[2]/'docs/ingame-narrative-2026-10-27/reviews/runtime-tests'
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':800});errors=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8777/game/index.html#scene=title',wait_until='load')
    page.wait_for_function('window.MM&&!MM.ctx.scenes.busy',timeout=60000)
    regions=page.evaluate("async()=> (await import('./src/data/schema.js')).REGION_ORDER")
    # Retain the all-region route check, then cover the other two actions in
    # each newly revised scene. Every case resets its own isolated profile's
    # Save and constructs a fresh Run; no campaign save is read or rewritten.
    cases=[(region,i%3) for i,region in enumerate(regions)]
    for region in ['attic-observatory','greenhouse','kennels']:
        baseline=regions.index(region)%3
        cases.extend((region,pick) for pick in range(3) if pick!=baseline)
    for i,(region,pick) in enumerate(cases):
        info=page.evaluate('''async ({region,i})=>{
          const {Run}=await import('./src/state/run.js');const {AFTERCARE}=await import('./src/data/narrative-aftercare.js');
          const {narrativeRoute}=await import('./src/state/narrative.js');const {NodeType}=await import('./src/data/schema.js');
          MM.Save.reset();await MM.Save.flush();MM.Save.settings.reduceMotion=true;
          const r=new Run({seed:764+i,kid:'maya',startRegion:region,entryUnlocked:true});
          if(region==='heart'){r.region=region;r._buildMap();}
          MM.ctx.run=r;const boss=r.map.nodes.find(n=>n.type===NodeType.BOSS);r.currentNodeId=boss.id;
          r._prepareReward(boss,NodeType.BOSS,{navigate:false});
          const route=narrativeRoute(MM.ctx,'reward',{});
          // Focus the test on this scene; actual reward routing was used above.
          // A real Title continuation avoids drafting rewards in each isolated fixture.
          route.next={name:'title',params:{}};
          await MM.ctx.scenes.go('narrative',route,{instant:true});
          const c=AFTERCARE[region];return{id:c.id,choices:c.choices};
        }''',{'region':region,'i':i})
        page.wait_for_function('!MM.ctx.scenes.busy')
        assert page.locator('.story-choices button').count()==3
        assert page.evaluate('Object.keys(MM.Save.data.narrative.choices).length')==0
        page.get_by_role('button',name='Short version',exact=True).click()
        assert page.locator('.story-choices button').count()==3
        assert page.get_by_role('button',name='Continue',exact=True).count()==0
        chosen=info['choices'][pick]
        page.locator(f'[data-choice="{chosen["id"]}"]').click()
        assert page.locator('.story-body').inner_text()==chosen['recap']
        assert page.evaluate('Object.keys(MM.Save.data.narrative.choices).length')==0
        page.get_by_role('button',name='Read full scene',exact=True).click()
        expected=page.evaluate('''async lines=>{
          const {linesFor}=await import('./src/state/narrative.js');
          const {KIDS}=await import('./src/data/schema.js');
          return linesFor(lines,['maya']).map(line=>{
            if(typeof line==='string')return line;
            const kid=KIDS.find(k=>k.slug===line.speaker);
            return (line.speaker==='narrator'?'':(kid?kid.name.split(' ')[0]:line.speaker)+': ')+line.text;
          });
        }''',chosen['lines'])
        assert page.locator('.story-body p').all_text_contents()==expected
        assert page.locator('.story-choices button').count()==0
        page.get_by_role('button',name='Short version',exact=True).click()
        assert page.locator('.story-body').inner_text()==chosen['recap']
        assert not page.evaluate('region=>MM.Save.data.narrative.bosses[region]',region)
        if region=='nursery':page.screenshot(path=str(OUT/'nursery-chosen-outcome.png'))
        page.get_by_role('button',name='Continue',exact=True).click()
        page.wait_for_function('MM.ctx.scenes.currentName==="title"&&!MM.ctx.scenes.busy')
        assert page.evaluate('arg=>MM.Save.data.narrative.choices[arg[0]].id===arg[1]',[info['id'],chosen['id']])
        assert page.evaluate('arg=>MM.Save.data.narrative.choices[arg[0]].recap===arg[1]',[info['id'],chosen['recap']])
        assert page.evaluate('Object.keys(MM.Save.data.narrative.choices).length')==1
        assert page.evaluate('region=>MM.Save.data.narrative.bosses[region]',region)
        assert page.evaluate('MM.ctx.run.pendingReward.kind')=='boss'
        checks.append(region+' / '+chosen['id']+': three actions survive short mode; full/short show only selected outcome; exact selected recap committed; reward unchanged')
        print('PASS',checks[-1],flush=True)
    assert not errors,errors
    (OUT/'aftermaths-result.json').write_text(json.dumps({'checks':checks,'pageErrors':errors},indent=2),encoding='utf-8')
    browser.close();print('PASS all17 aftermath routes and all3 revised Attic/Greenhouse/Kennels choices; zero page errors',flush=True)
