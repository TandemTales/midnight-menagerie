"""Optional deductions and evidence-aware encounters through the actual journal UI."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[2]/'docs/ingame-narrative-2026-10-27/reviews/runtime-tests'
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':800}); errors=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8777/game/index.html#scene=title',wait_until='load')
    page.wait_for_function('window.MM&&!MM.ctx.scenes.busy',timeout=60000)
    for region in ['foyer','lampworks','attic-observatory']:
        info=page.evaluate('''async region=>{
          const {Run}=await import('./src/state/run.js');const {NARRATIVE_REGIONS}=await import('./src/data/narrative-regions.js');
          MM.Save.reset();await MM.Save.flush();MM.Save.settings.reduceMotion=true;
          const r=new Run({seed:64,startRegion:region,entryUnlocked:true,kid:'maya'});MM.ctx.run=r;
          r.visitedIds=r.map.nodes.slice(0,7).map(n=>n.id);
          await MM.ctx.scenes.go('map',{narrativeBypass:true},{instant:true});
          const c=NARRATIVE_REGIONS[region].clues.find(c=>c.investigation);
          return {clueTitle:c.title,...c.investigation};
        }''',region)
        page.wait_for_function('!MM.ctx.scenes.busy')
        page.get_by_role('button',name='Discoveries',exact=True).click()
        page.get_by_role('button',name=info['clueTitle'],exact=True).click()
        case=page.locator(f'[data-investigation="{info["id"]}"]')
        case.wait_for()
        assert case.locator('[aria-pressed="true"]').count()==0
        assert case.get_by_role('button',name='Put the observations together').is_disabled()
        page.get_by_role('button',name='Close discoveries',exact=True).click()
        page.get_by_role('button',name='Discoveries',exact=True).click()
        # The recorded base observation remains expandable without losing actions.
        page.locator('dialog details[data-clue] > summary').click()
        for test in reversed(info['tests']):
            case.get_by_role('button',name=test['label'],exact=True).click()
            page.wait_for_function('arg=>!!(MM.Save.data.narrative.investigations[arg[0]]?.tests[arg[1]])',arg=[info['id'],test['id']])
            case.get_by_role('heading',name=test['label'],exact=True).wait_for()
            assert page.evaluate('document.activeElement.dataset.focus')==test['id']
        case.get_by_role('button',name='Put the observations together').click()
        page.wait_for_function('id=>MM.Save.data.narrative.investigations[id].compared',arg=info['id'])
        assert page.evaluate('id=>MM.Save.data.narrative.investigations[id].hypothesis',info['id']) is None
        for hypothesis in [info['hypotheses'][0],info['hypotheses'][1]]:
            case.get_by_role('button',name=hypothesis['label'],exact=True).click()
            page.wait_for_function('arg=>MM.Save.data.narrative.investigations[arg[0]].hypothesis===arg[1]',arg=[info['id'],hypothesis['id']])
        assert case.locator('[aria-pressed="true"]').count()==1
        if region=='lampworks': page.screenshot(path=str(OUT/'lampworks-investigation.png'))
        page.keyboard.press('Escape')
        proof=page.evaluate('''async region=>{
          const {narrativeRoute}=await import('./src/state/narrative.js');const {NodeType}=await import('./src/data/schema.js');
          const r=MM.ctx.run;r.currentNodeId=r.map.nodes.find(n=>n.type===NodeType.BOSS).id;
          return narrativeRoute(MM.ctx,'combat',{}).units.map(u=>u.id);
        }''',region)
        assert f'NR-{region}-before-investigated' in proof
        checks.append(region+': no required guess; either test order; close/reopen; focus retention; change idea; earned guardian response')
        print('PASS',checks[-1],flush=True)
    # Read the archived evidence at the Clubhouse without being offered new physical checks.
    page.evaluate("MM.ctx.run=null;MM.ctx.scenes.go('clubhouse',{}, {instant:true})")
    page.wait_for_function('MM.ctx.scenes.currentName==="clubhouse"&&!MM.ctx.scenes.busy')
    page.get_by_role('button',name='Discoveries',exact=True).click()
    page.locator('dialog details[data-clue] > summary').click()
    assert page.locator('.story-case').get_by_text('Your recorded idea:',exact=False).count()==1
    assert page.locator('.story-case button').count()==0
    page.keyboard.press('Escape')
    checks.append('archive reports only recorded idea/tests; no physical checks away from location')
    (OUT/'investigations-result.json').write_text(json.dumps({'checks':checks,'pageErrors':errors},indent=2),encoding='utf-8')
    assert not errors,errors
    browser.close();print('PASS investigation suite; zero page errors',flush=True)
