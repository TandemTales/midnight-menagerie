"""Real Run + Save + SceneManager + DOM narrative seams in an isolated browser profile."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/ingame-narrative-2026-10-27/reviews/runtime-tests'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--use-gl=angle','--use-angle=default','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8777/game/index.html#scene=title',wait_until='load')
    page.wait_for_function('window.MM && !MM.ctx.scenes.busy',timeout=60000)
    result=page.evaluate('''async()=>{
      const {Run}=await import('./src/state/run.js');
      const N=await import('./src/state/narrative.js');
      const {NARRATIVE_REGIONS:R}=await import('./src/data/narrative-regions.js');
      const {REGION_ORDER,NodeType}=await import('./src/data/schema.js');
      const {Save,migrate,SAVE_VERSION}=await import('./src/core/save.js');
      const {storage}=await import('./src/core/storage.js');
      const pass=[];const check=(v,n)=>{if(!v)throw Error(n);pass.push(n);};
      Save.reset();await Save.flush();Save.settings.reduceMotion=true;
      check(SAVE_VERSION===3&&migrate({version:2,petsRescued:['maya']}).data.narrative,'version2 migration adds named narrative state');
      check(!migrate({version:4}).ok,'future saves remain protected');
      check(REGION_ORDER.every(r=>R[r]),'all17 actual regions have runtime packages');
      const ids=[];for(const r of Object.values(R))for(const [k,v]of Object.entries(r)){if(v&&v.id)ids.push(v.id);if(Array.isArray(v))v.forEach(u=>ids.push(u.id));}
      check(new Set(ids).size===ids.length,'runtime narrative unit IDs unique');
      const a=new Run({seed:42,kid:'maya'}),b=new Run({seed:42,kid:'maya'});
      MM.ctx.run=a;const initial=N.narrativeRoute(MM.ctx,'map',{});
      check(initial.units.some(u=>u.id==='SEARCH-RECAP'),'skipped opening has reliable search recap');
      check(N.linesFor([{speaker:'samir',text:'absent'},'fact',{speaker:'maya',text:'present'}],['maya']).length===2,'absent kids never speak');
      check(a.rng.next()===b.rng.next(),'story route consumes no gameplay randomness');
      for(const u of initial.units)await N.commitStory((s,d)=>{s.seen[u.id]=true;if(u.runDone)N.runMark(a,u.runDone)(s);});
      check(!N.narrativeRoute(MM.ctx,'map',{}),'arrival and recap do not repeat in same run');
      const resumed=Run.resume(a.snapshot());check(!N.narrativeRoute({run:resumed},'map',{}),'arrival cooldown survives real run snapshot/resume');
      a.currentNodeId=a.map.nodes.find(n=>n.type===NodeType.BOSS).id;
      let route=N.narrativeRoute(MM.ctx,'combat',{});check(route.units.some(u=>u.id===R.foyer.before.id),'actual boss node routes encounter scene');
      await N.commitStory((s)=>{s.bosses.foyer=true;});route=N.narrativeRoute(MM.ctx,'combat',{});
      check(route.units.some(u=>u.id===R.foyer.repeatBefore.id),'prior boss resolution uses repeat scene');
      await N.commitStory((s,d)=>N.markPet(s,d,'maya','found'));
      check(N.reunionUnits('maya').some(u=>u.id==='PET-maya-return'),'found reunion has distinct return scene');
      a.end(false,null,{navigate:false});
      check(N.petState('maya')==='found','real failed run preserves found reunion');
      await N.commitStory((s,d)=>N.markPet(s,d,'maya','home'));
      await N.commitStory((s,d)=>N.markPet(s,d,'maya','found'));
      check(N.petState('maya')==='home'&&Save.data.petsRescued.includes('maya'),'home is monotone and feeds existing clubhouse');
      Save.blocked={reason:'test'};check(!await N.commitStory(s=>s.seen.blocked=true),'refused save does not report success');
      check(!N.storyState().seen.blocked,'refused narrative write rolls back');Save.blocked=null;
      await Save.flush();const oldWrite=storage._rawWrite;
      storage._rawWrite=async()=>{throw Error('EXPECTED NARRATIVE TEST DISK FAILURE');};
      check(!await N.commitStory(s=>s.seen.diskFailure=true),'actual backend failure is detected despite flush swallowing error');
      check(!N.storyState().seen.diskFailure,'backend failure rolls back only narrative transaction');
      storage._rawWrite=oldWrite;await Save.flush();
      Save.data.narrative.sanctuary=true;const memory=new Run({seed:90});
      check(memory.storyMemory&&Run.resume(memory.snapshot()).storyMemory,'memory baseline survives run resume');
      Save.data.narrative.sanctuary=false;const current=new Run({seed:91});
      Save.data.narrative.sanctuary=true;
      check(!current.storyMemory&&!Run.resume(current.snapshot()).storyMemory,'opening sanctuary does not retroactively reclassify current run');
      Save.data.narrative.pendingEnding={kids:['samir'],runId:N.runKey(current)};MM.ctx.run=current;
      const recovery=N.narrativeRoute(MM.ctx,'gameover',{});
      check(recovery.units.some(u=>u.id==='PET-samir-home')&&recovery.run===current,'pending finale resumes before memory shortcut with run binding');
      check(recovery.units.at(-1).runDone==='ending','pending finale records run completion');
      current.companionsFreed=['wisp','wisp'];
      const oldPending=N.narrativeRoute({run:current},'gameover',{});
      check(oldPending.units[0].id==='COMP-wisp-0'&&oldPending.units.filter(u=>u.id==='COMP-wisp-0').length===1,'legacy pending finale uses matching run and deduplicates Companion introduction');
      check(!N.narrativeRoute({run:null},'title',{}).units.some(u=>u.id==='COMP-wisp-0'),'legacy pending finale without matching run invents no Companion');
      check(!N.narrativeRoute({run:memory},'title',{}).units.some(u=>u.id==='COMP-wisp-0'),'unrelated run cannot supply pending finale Companions');
      Save.data.narrative.pendingEnding.companions=[];
      check(!N.narrativeRoute({run:current},'gameover',{}).units.some(u=>u.id==='COMP-wisp-0'),'explicit empty ending roster does not fall back to live run');
      Save.data.narrative.pendingEnding.companions=['wisp'];
      current.session={remote:true};
      check(N.narrativeRoute({run:current},'gameover',{}).units[0].id==='COMP-wisp-0','ended network expedition may introduce its final Companion without pausing combat');
      delete current.session;
      Save.reset();await Save.flush();MM.ctx.run=new Run({seed:131,kid:'maya'});
      window.NarrativeTest={N,Run};return pass;
    }''')
    for line in result: print('PASS',line,flush=True)
    page.evaluate("MM.ctx.scenes.go('map',{}, {instant:true})")
    page.wait_for_function('MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy')
    assert 'The search' in page.locator('.story-page').inner_text()
    page.get_by_role('button',name='Short version',exact=True).click()
    assert 'different animal' in page.locator('.story-body').inner_text()
    page.get_by_role('button',name='Next',exact=True).click()
    page.wait_for_function('document.querySelector(".story-page h1").textContent!=="The search"')
    page.screenshot(path=str(OUT/'foyer-narrative.png'))
    page.get_by_role('button',name='Continue',exact=True).click()
    page.wait_for_function('MM.ctx.scenes.currentName==="map"&&!MM.ctx.scenes.busy',timeout=60000)
    page.get_by_role('button',name='Discoveries',exact=True).click()
    page.wait_for_selector('dialog[open]')
    assert page.evaluate('MM.ctx.navigator.root.tagName')=='DIALOG'
    page.locator('dialog section button').first.click()
    page.wait_for_selector('dialog section details')
    assert page.evaluate('Object.values(MM.Save.data.narrative.clues)[0].detail.length')==0
    page.get_by_role('button',name='Close discoveries',exact=True).click()
    page.get_by_role('button',name='Discoveries',exact=True).click()
    page.locator('dialog details[data-clue] > summary').click()
    page.get_by_text('Examine it more closely here',exact=True).click()
    page.wait_for_function('Object.values(MM.Save.data.narrative.clues)[0].detail.length>0')
    scene=page.evaluate('MM.ctx.scenes.currentName')
    page.keyboard.press('Escape')
    assert page.evaluate('MM.ctx.scenes.currentName')==scene
    # Escape shuts it at once; the shut element is removed by its close event, a
    # queued task, so that half is waited for (it lost the race 1 run in 5).
    assert page.locator('dialog[open]').count()==0
    page.wait_for_function("document.querySelectorAll('dialog').length===0",timeout=5000)
    print('PASS scene short route, journal controller root, deferred closer examination, Escape isolation',flush=True)
    page.evaluate("MM.ctx.run=null; MM.ctx.scenes.go('clubhouse',{panel:'pets'},{instant:true})")
    page.wait_for_function('MM.ctx.scenes.currentName==="clubhouse"&&!MM.ctx.scenes.busy',timeout=60000)
    assert 'less of them' not in page.locator('body').inner_text()
    assert 'Transformation stage' not in page.content()
    page.screenshot(path=str(OUT/'clubhouse-pets.png'))
    # Real run-end bus, persistent mid-ending recovery, then all peaceful routes.
    page.evaluate('''async()=>{
      const {Run}=window.NarrativeTest;MM.Save.reset();await MM.Save.flush();
      MM.Save.settings.reduceMotion=true;
      const {COMPANIONS,NodeType}=await import('./src/data/schema.js');
      // Constructed final-reward fixture: Wisp is the only remaining rescue.
      // This executes the real rescue, reward claim and run-end event, not a played run.
      MM.Save.data.companionsRescued=COMPANIONS.filter(c=>c.slug!=='wisp').map(c=>c.slug);
      const r=new Run({seed:322,kid:'samir'});r.attach(MM.ctx);
      // What a won boss fight records before its reward (Run's combat-end path);
      // a boss reward and a rescue are both refused without it.
      const wonBoss=region=>{r.region=region;r._buildMap();const boss=r.map.nodes.find(n=>n.type===NodeType.BOSS);
        r.currentNodeId=boss.id;r._markCleared(boss.id);r.defeatedBoss={region,nodeId:boss.id};return boss;};
      // A wing frees only its own Companion and the Heart holds nobody, so Wisp is
      // freed at the Lampworks boss; her introduction is still unread at the ending.
      wonBoss('lampworks');
      if(!r.rescueCompanion('wisp'))throw Error('Wisp was not freed at her own boss');
      r.regionIndex=r.wings-1;
      const boss=wonBoss('heart');
      r._prepareReward(boss,NodeType.BOSS,{navigate:false});
      await r.claimReward();
    }''')
    page.wait_for_function('MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy')
    assert page.locator('.story-page h1').inner_text()=='Wisp'
    assert page.evaluate('MM.Save.data.narrative.pendingEnding.companions.includes("wisp")')
    assert page.evaluate('MM.ctx.run.result==="victory" && MM.ctx.run.companionsFreed.includes("wisp") && !MM.Save.hasRun()')
    page.evaluate('MM.Save.flush()')
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.wait_for_function('window.MM && MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy',timeout=60000)
    assert page.locator('.story-page h1').inner_text()=='Wisp'
    page.get_by_role('button',name='Short version',exact=True).click()
    assert 'Wisp' in page.locator('.story-body').inner_text()
    page.get_by_role('button',name='Next',exact=True).click()
    page.wait_for_function('MM.Save.data.narrative.seen["COMP-wisp-0"] && document.querySelector(".story-page h1").textContent!=="Wisp"')
    page.evaluate('MM.Save.flush()')
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.wait_for_function('window.MM && MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy',timeout=60000)
    assert page.locator('.story-page h1').inner_text()!='Wisp'
    assert page.evaluate('!MM.ctx.scenes.current.params.units.some(u=>u.id==="COMP-wisp-0")')
    print('PASS actual final reward introduces Wisp before ending; unacknowledged intro survives reload; short-version acknowledgement persists without replay',flush=True)
    def next_story():
        page.wait_for_function('!MM.ctx.scenes.busy')
        old=page.locator('.story-progress').inner_text()
        choices=page.locator('.story-choices button')
        if choices.count(): choices.first.click()
        short=page.get_by_role('button',name='Short version',exact=True)
        if short.count(): short.click()
        page.locator('.story-controls button').last.click()
        page.wait_for_function('old=>MM.ctx.scenes.currentName!=="narrative" || document.querySelector(".story-progress").textContent!==old',arg=old)
    while page.locator('.story-page h1').inner_text()!='Both ways': next_story()
    next_story()
    assert page.evaluate('MM.Save.data.narrative.sanctuary')
    assert not page.evaluate('MM.Save.data.petsRescued.includes("samir")')
    page.reload(wait_until='domcontentloaded',timeout=60000)
    page.wait_for_function('window.MM && MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy',timeout=60000)
    assert page.locator('.story-page h1').inner_text()=='The red coat'
    for _ in range(12):
        if page.evaluate('MM.ctx.scenes.currentName')!='narrative': break
        next_story()
    page.wait_for_function('!MM.ctx.scenes.busy')
    assert page.evaluate('MM.Save.data.petsRescued.includes("samir") && !MM.Save.data.narrative.pendingEnding')
    page.evaluate("MM.ctx.run=null;MM.ctx.scenes.go('clubhouse',{}, {instant:true})")
    page.wait_for_function('MM.ctx.scenes.currentName==="clubhouse"&&!MM.ctx.scenes.busy',timeout=60000)
    page.evaluate('''()=>{
      for(let i=0;i<19;i++)MM.Save.data.narrative.clues['TEST-archive-'+i]={title:'Fixture observation '+i,lines:['A recorded fixture.'],detail:[],cast:[]};
      for(let i=0;i<7;i++)MM.Save.data.narrative.choices['TEST-choice-'+i]={label:'Fixture choice '+i,recap:'A recorded fixture choice.'};
    }''')
    page.get_by_role('button',name='Discoveries',exact=True).click()
    page.wait_for_selector('dialog[open] .story-visits')
    assert page.evaluate('''()=>{
      const dialog=document.querySelector('dialog[open]'),visits=dialog.querySelector('.story-visits');
      const records=[...dialog.querySelectorAll(':scope > details')];
      const first=visits.querySelector('button:not(:disabled)').getBoundingClientRect(),bounds=dialog.getBoundingClientRect();
      return records.length>=26 && records.every(record=>Boolean(visits.compareDocumentPosition(record)&Node.DOCUMENT_POSITION_FOLLOWING))
        && first.top>=Math.max(0,bounds.top) && first.bottom<=Math.min(innerHeight,bounds.bottom);
    }''')
    page.get_by_role('button',name='Close discoveries',exact=True).click()
    print('PASS sanctuary visits precede nineteen clue records and seven choices; first available visit is visible on opening',flush=True)
    for first,slug in [('Maya','maya'),('Mateo','mateo'),('Amina','amina'),('Eli','eli'),('Priya','priya'),('Jordan','jordan'),('Lena','lena')]:
        page.get_by_role('button',name='Discoveries',exact=True).click()
        page.get_by_role('button',name='Visit with '+first,exact=True).click()
        page.wait_for_function('MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy')
        for _ in range(4):
            if page.evaluate('MM.ctx.scenes.currentName')!='narrative': break
            next_story()
        page.wait_for_function('MM.ctx.scenes.currentName==="clubhouse"&&!MM.ctx.scenes.busy')
        assert page.evaluate('slug=>MM.Save.data.petsRescued.includes(slug)',slug)
    assert page.evaluate('MM.Save.data.petsRescued.length')==8
    assert page.evaluate('MM.Save.data.narrative.seen["END-ALL-HOME"]')
    print('PASS real run-end ending; reload after gate; all eight home; peaceful visits and final milestone',flush=True)
    (OUT/'result.json').write_text(json.dumps({'checks':result,'ui':['short scene','journal closer persistence','dialog controller root','Escape isolation','clubhouse status','real final boss reward claim introduces Wisp before ending','unacknowledged Wisp introduction survives browser reload without active Run','Short-version Wisp acknowledgement persists through reload without replay','real run-end dispatch','reload after gate','sanctuary visits precede nineteen clue records and seven choices; first eligible visit visible','all eight peaceful home routes','all-home milestone'],'pageErrors':errors},indent=2),encoding='utf-8')
    assert not errors,errors
    browser.close()
    print('PASS runtime narrative suite; no page errors',flush=True)
