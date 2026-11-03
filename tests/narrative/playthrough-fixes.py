"""Focused regressions from the six-wing audit. Run AFTER the live campaign.

Uses a new browser and isolated profiles. These are explicitly constructed
fixtures, not another gameplay expedition. Never loads the actual-run profile.
    python tests/narrative/playthrough-fixes.py
"""
from pathlib import Path
import json
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/ingame-narrative-2026-10-27/reviews/runtime-tests'
URL = 'http://localhost:8777/game/index.html#scene=title'


def ready(page, scene=None):
    page.wait_for_function(
        '(name) => window.MM && !MM.ctx.scenes.busy && (!name || MM.ctx.scenes.currentName === name)',
        arg=scene, timeout=60000)


def main():
    OUT.mkdir(exist_ok=True)
    results = {'kind': 'isolated regression fixtures; not a playthrough', 'checks': [], 'errors': []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', args=[
            '--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.on('pageerror', lambda e: results['errors'].append(str(e)))
        try:
            page.goto(URL, wait_until='load')
            ready(page, 'title')
            # Real Run.rescueCompanion -> snapshot -> Save -> fresh Title render.
            count = page.evaluate('''async () => {
              const {Run}=await import('./src/state/run.js');
              MM.Save.reset(); MM.Save.settings.reduceMotion=true;
              MM.Save.data.companionsRescued=['bones']; MM.Save.save();
              const r=new Run({seed:21972029,kid:'maya',companion:'marmalade'});
              r.rescueCompanion('taffy');
              const snapshot=r.snapshot(); MM.Save.saveRun(snapshot); await MM.Save.flush();
              return {lifetime:MM.Save.data.companionsRescued, active:snapshot.rescued};
            }''')
            assert count['lifetime'] == ['bones'] and set(count['active']) == {'bones', 'taffy'}, count
            page.reload(wait_until='load')
            ready(page, 'title')
            assert page.locator('.ti-count b').inner_text() == '2'
            assert '1 from the start' in page.locator('.ti-count').inner_text().lower()
            page.screenshot(path=str(OUT / 'title-active-rescues.png'))
            results['checks'].append('Title after reload unions active snapshot rescues with lifetime, deduplicates, and excludes starter')
            available=page.evaluate('''async()=>{
              const {COMPANIONS}=await import('./src/data/schema.js');
              const {availableCompanions}=await import('./src/ui/portrait.js');
              MM.Save.clearRun();MM.Save.data.companionsRescued=COMPANIONS.filter(c=>c.slug!=='marmalade').map(c=>c.slug);
              MM.Save.save();await MM.Save.flush();return availableCompanions().size;
            }''')
            page.reload(wait_until='load');ready(page,'title')
            count_text=page.locator('.ti-count').inner_text().lower()
            assert '15 companions freed' in ' '.join(count_text.split()) and '/ 16' not in count_text and '/16' not in count_text, count_text
            assert '1 from the start' in count_text and available==16
            results['checks'].append('Fifteen rescued plus starter make all sixteen available without an unreachable freed denominator')

            # Real rendered scene headings for every authored Companion, rather
            # than merely asserting a data table contains the expected string.
            companions = page.evaluate("async()=> (await import('./src/data/schema.js')).COMPANIONS.map(c=>({slug:c.slug,name:c.name}))")
            for companion in companions:
                page.evaluate('''async slug => {
                  const {companionUnit}=await import('./src/state/narrative.js');
                  MM.ctx.run=null;
                  await MM.ctx.scenes.go('narrative',{units:[companionUnit(slug)],kids:['maya'],next:{name:'title',params:{}}},{instant:true});
                }''', companion['slug'])
                ready(page, 'narrative')
                assert page.locator('.story-page h1').inner_text() == companion['name'], companion
            results['checks'].append('All sixteen Companion names appear as actual scene headings')

            # Actual solo route and renderer must omit absent Priya while leaving
            # the boss's challenge self-contained.
            page.evaluate('''async()=>{
              const {Run}=await import('./src/state/run.js');
              const {NodeType}=await import('./src/data/schema.js');
              const {narrativeRoute}=await import('./src/state/narrative.js');
              MM.Save.reset(); MM.Save.settings.reduceMotion=true;
              const r=new Run({seed:21972029,kid:'maya',companion:'marmalade',startRegion:'kitchens-cellars',entryUnlocked:true});
              r.currentNodeId=r.map.nodes.find(n=>n.type===NodeType.BOSS).id;
              r.attach(MM.ctx);
              const route=narrativeRoute(MM.ctx,'combat',{});
              route.next={name:'title',params:{}};
              await MM.ctx.scenes.go('narrative',route,{instant:true});
            }''')
            ready(page, 'narrative')
            solo = page.locator('.story-body').inner_text()
            assert 'Priya' not in solo and 'Does anything here get to be finished?' not in solo, solo
            assert 'Stay there. You haven’t had your icing.' in solo, solo
            assert 'Nothing is finished while I can add something.' in solo, solo
            results['checks'].append('Actual solo Kitchens boss scene omits absent Priya and retains a self-contained challenge')

            # Recreate the actual seed/current-room boundary. No fight is
            # bypassed in the recorded campaign: this is a separate fixture.
            page.evaluate('''async()=>{
              const {Run}=await import('./src/state/run.js');
              MM.Save.reset(); MM.Save.settings.reduceMotion=true;
              localStorage.setItem('mm.mapStyle','plan');
              const r=new Run({seed:21972029,kid:'maya',companion:'marmalade',startRegion:'kitchens-cellars',entryUnlocked:true});
              r.ephemeral=true;r.route=['foyer','attic-observatory','kitchens-cellars'];r.regionIndex=2;
              r.rescued=['bones','taffy','wink'];r.freedRoster=r.rescued.slice();r.companionsFreed=['taffy','wink'];r._buildMap();
              r.currentNodeId='kitchens-cellars-11-0';
              if(!r.nodeById(r.currentNodeId))throw Error('Recorded current node missing from seed fixture');
              r.visitedIds=r.map.nodes.filter(n=>n.row<=11).map(n=>n.id);r.pathIds=[r.currentNodeId];r._roomDone=true;
              for(const n of r.map.nodes)n.visited=r.visitedIds.includes(n.id);
              r.attach(MM.ctx);
              await MM.ctx.scenes.go('map',{narrativeBypass:true},{instant:true});
            }''')
            ready(page, 'map')
            stolen = None
            for width, height in [(1280, 800), (1920, 1080)]:
                page.set_viewport_size({'width': width, 'height': height})
                page.wait_for_timeout(1200)  # map fit and node entrance settle
                stolen = page.evaluate('''()=>{
                  const scene=MM.ctx.scenes.current;
                  const targets=[...document.querySelectorAll('.map-node.is-legal')].filter(el=>scene.model.byId.get(el.dataset.id).row===12);
                  const own=(x,y,id)=>document.elementFromPoint(x,y)?.closest('.map-node')?.dataset.id===id;
                  const candidates=[];
                  for(const el of targets){
                    const r=el.getBoundingClientRect();
                    for(let a=1;a<10;a++)for(let b=1;b<10;b++){
                      const x=r.left+r.width*a/10,y=r.top+r.height*b/10;
                      if(x>0&&y>0&&x<innerWidth&&y<innerHeight&&own(x,y,el.dataset.id))candidates.push({x,y,id:el.dataset.id,label:el.getAttribute('aria-label')});
                    }
                  }
                  const old=document.createElement('style');old.textContent='.mn-pool { pointer-events:auto !important; }';document.head.append(old);
                  const result=candidates.find(p=>!own(p.x,p.y,p.id));
                  if(result)result.stolenBy=document.elementFromPoint(result.x,result.y)?.closest('.map-node')?.dataset.id;
                  old.remove();
                  if(result&&!own(result.x,result.y,result.id))throw Error('Fixed CSS still blocks the legal target');
                  return result||null;
                }''')
                if stolen:
                    break
            assert stolen, 'Negative control did not reproduce the reported row-13 decoration overlap; inspect the fixture rather than declaring a pass'
            assert stolen['stolenBy'] != stolen['id'], stolen
            page.screenshot(path=str(OUT / 'kitchens-row13-fixed-click.png'))
            # Physical mouse hit testing, no locator.force or direct _choose.
            page.mouse.click(stolen['x'], stolen['y'])
            page.wait_for_function('(id)=>MM.ctx.run.currentNodeId===id', arg=stolen['id'], timeout=15000)
            results['checks'].append({'map': 'Original CSS steals a legal row-13 hit; fixed CSS permits an actual mouse click and real Run arrival', 'point': stolen})
            ready(page)

            # Independent engine and DOM host; no modification to MM's run.
            dom = page.evaluate("async()=>await (await import('/tests/dough-split/dom.js')).runDoughSplitDOM()")
            assert dom['passed'] and len(dom['rendered']) == 2, dom
            results['checks'].append({'dough_split_real_dom': dom})

            # Real deep-linked encounter in another empty profile: no injected
            # actors, mocked Hand or direct engine play. Drive selection, target
            # cycling and the attack through physical keyboard events.
            ward_context = browser.new_context(viewport={'width':1280,'height':800})
            ward = ward_context.new_page()
            ward.on('pageerror', lambda e: results['errors'].append(str(e)))
            ward.goto(URL.replace('#scene=title', '#scene=combat&region=kennels&encounter=kn-1&seed=42&companion=marmalade'), wait_until='load')
            ready(ward,'combat')
            ward.wait_for_function('''() => {
              const s=MM.ctx.scenes.current;
              return s.engine.started && !s.hand.locked && !s._resolving &&
                s.hand.slots.some(x=>x.card.def.id==='marmalade/scratch' && x.playable);
            }''',timeout=60000)
            ward_fixture = ward.evaluate('''() => {
              const s=MM.ctx.scenes.current,e=s.engine,dog=e.enemies.find(x=>x.defId==='ward-pup');
              const index=s.hand.slots.findIndex(x=>x.card.def.id==='marmalade/scratch'&&x.playable);
              const card=s.hand.slots[index].card;
              return {index,uid:card.uid,dog:dog.id,hp:dog.hp,
                label:s.views.get(dog.id).el.getAttribute('aria-label'),
                latch:e.enemies.find(x=>x.defId==='cage-latch').id,
                legal:e.targetableEnemies(e.card(card.uid)).map(x=>x.id)};
            }''')
            assert 'Ward animal. Protected; cannot be attacked or hurt' in ward_fixture['label'], ward_fixture
            assert 'Enemy.' not in ward_fixture['label'] and 'Courage' not in ward_fixture['label']
            ward_view=ward.locator('.cb-enemy[data-role="ward"]')
            assert ward_view.locator('.cb-enemy__protected').is_visible()
            assert ward_view.locator('.cb-enemy__protected').inner_text()=='Protected animal'
            assert '2/2' not in ward_view.inner_text() and 'ASLEEP' not in ward_view.inner_text().upper()
            for selector in ['.cb-enemy__bar','.cb-enemy__hp','.cb-enemy__guard','.cb-enemy__intent']:
                assert not ward_view.locator(selector).is_visible(), selector
            assert ward_view.locator('.cb-enemy__name').text_content()=='A Small Grey Dog'
            # At zero, Fright is in the animal's rule rather than a counter chip.
            ward.wait_for_function('document.querySelector(".cb-rules").innerText.toUpperCase().includes("FRIGHT")',timeout=15000)
            assert ward_view.locator('.cb-enemy__statuses').is_visible()
            regular=ward.locator('.cb-enemy[data-silhouette="walking-cage"]')
            assert regular.locator('.cb-enemy__bar').is_visible()
            assert regular.locator('.cb-enemy__intent').is_visible()
            assert regular.locator('.cb-enemy__protected').count()==0
            ward.evaluate('document.activeElement.blur()')
            ward.keyboard.press('ArrowDown')
            ward.keyboard.press(str(ward_fixture['index']+1))
            ward.keyboard.press('ArrowUp')
            ward.wait_for_function('!!MM.ctx.scenes.current.hand.aim')
            cycle=[]
            for _ in range(len(ward_fixture['legal'])+1):
                cycle.append(ward.evaluate('MM.ctx.scenes.current.hand.aim.snap.id'))
                ward.keyboard.press('Tab')
            assert set(cycle)==set(ward_fixture['legal']) and ward_fixture['dog'] not in cycle, cycle
            for _ in range(len(ward_fixture['legal'])):
                if ward.evaluate('MM.ctx.scenes.current.hand.aim.snap.id') == ward_fixture['latch']:
                    break
                ward.keyboard.press('Tab')
            assert ward.evaluate('MM.ctx.scenes.current.hand.aim.snap.id') == ward_fixture['latch']
            ward.keyboard.press('ArrowUp')
            ward.wait_for_function('(uid)=>!MM.ctx.scenes.current.engine.current.piles.hand.some(c=>c.uid===uid)',arg=ward_fixture['uid'])
            ward.wait_for_function('!MM.ctx.scenes.current._resolving && !MM.ctx.scenes.current.hand.locked',timeout=30000)
            assert ward.evaluate('(id)=>MM.ctx.scenes.current.engine.actor(id).hp',ward_fixture['dog']) == ward_fixture['hp']
            ward.screenshot(path=str(OUT/'ward-protected-keyboard.png'))
            results['checks'].append({'ward_real_renderer_keyboard':ward_fixture,'cycle':cycle})
            # A second real Scratch opens the ten-Courage latch. Its animal
            # leaves; its old rescue instructions must leave the dock too.
            second=ward.evaluate('''()=>{
              const h=MM.ctx.scenes.current.hand;
              return h.slots.findIndex(x=>x.card.def.id==='marmalade/scratch'&&x.playable);
            }''')
            assert second>=0
            ward.keyboard.press('ArrowDown');ward.keyboard.press(str(second+1));ward.keyboard.press('ArrowUp')
            ward.wait_for_function('!!MM.ctx.scenes.current.hand.aim')
            for _ in range(len(ward_fixture['legal'])):
                if ward.evaluate('MM.ctx.scenes.current.hand.aim.snap.id')==ward_fixture['latch']:
                    break
                ward.keyboard.press('Tab')
            assert ward.evaluate('MM.ctx.scenes.current.hand.aim.snap.id')==ward_fixture['latch']
            ward.keyboard.press('ArrowUp')
            ward.wait_for_function('(id)=>!MM.ctx.scenes.current.views.has(id)&&!MM.ctx.scenes.current._resolving',arg=ward_fixture['dog'],timeout=30000)
            assert ward.locator('.cb-enemy[data-role="ward"]').count()==0
            remaining_rules=ward.locator('.cb-rules').inner_text()
            assert 'A SMALL GREY DOG' not in remaining_rules.upper()
            assert 'THE DOOR IS OPEN' in remaining_rules.upper()
            ward.screenshot(path=str(OUT/'ward-freed-no-stale-rule.png'))
            results['checks'].append('Real keyboard latch release removes Ward view and stale rescue instructions; Cage open-door rule remains')
            ward_context.close()

            # Fresh module cache ensures a real plan fetch remains pending. Hold
            # that fetch, leave via SceneManager, then release it and await the
            # actual _paintSurvey method, not a synthetic cancellation function.
            race_context = browser.new_context(viewport={'width':1280,'height':800})
            race = race_context.new_page()
            race.on('pageerror', lambda e: results['errors'].append(str(e)))
            race.goto(URL, wait_until='load');ready(race,'title')
            held = []
            race.route('**/*.plan.json', lambda route: held.append(route))
            race.evaluate('''async()=>{
              MM.Save.settings.reduceMotion=true;MM.Save.data.blueprint.revealed=['foyer','greenhouse'];
              await MM.ctx.scenes.go('atlas',{wing:'greenhouse',narrativeBypass:true},{instant:true});
              window.__atlasRace=MM.ctx.scenes.current;
              window.__atlasRace._surveyKey=null;
              window.__atlasPending=window.__atlasRace._paintSurvey();
              window.__atlasToken=window.__atlasRace._surveyToken;
            }''')
            ready(race,'atlas')
            deadline = time.monotonic() + 10
            while not held and time.monotonic() < deadline:
                race.wait_for_timeout(50)
            assert held, 'Atlas race fixture did not hold a real plan request'
            race.evaluate("MM.ctx.scenes.go('narrative',{units:[{id:'TEST-ATLAS-EXIT',title:'Exit fixture',lines:['Independent regression fixture.'],recap:'Fixture.'}],kids:[],next:{name:'title',params:{}}},{instant:true})")
            ready(race,'narrative')
            assert race.evaluate('__atlasRace._surveyToken !== __atlasToken')
            for route in held:
                route.continue_()
            race.unroute('**/*.plan.json')
            race.evaluate('window.__atlasPending')
            race.wait_for_timeout(250)
            results['checks'].append('Atlas actual pending survey completes safely after scene exit and delayed plan fetch')
            race_context.close()
            assert not results['errors'], results['errors']
            results['passed'] = True
        except Exception as exc:
            results['passed'] = False
            results['failure'] = repr(exc)
            try:
                page.screenshot(path=str(OUT / 'playthrough-fixes-failure.png'))
            except Exception:
                pass
            raise
        finally:
            (OUT / 'playthrough-fixes.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf-8')
            browser.close()
    print(json.dumps(results,indent=2,ensure_ascii=False))


if __name__ == '__main__':
    main()
