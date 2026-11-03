"""Supplemental Wisp screenshots from an isolated constructed final reward.
Not a campaign replay. Never accesses the recorded playthrough profile.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(__file__).resolve().parents[2]/'docs/ingame-narrative-2026-10-27/reviews/runtime-tests'
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge')
    page=browser.new_page(viewport={'width':1280,'height':800}); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:8777/game/index.html#scene=title',wait_until='load')
    page.wait_for_function('window.MM&&!MM.ctx.scenes.busy',timeout=60000)
    page.evaluate('''async()=>{
      const {Run}=await import('./src/state/run.js');
      const {COMPANIONS,NodeType}=await import('./src/data/schema.js');
      MM.Save.reset();MM.Save.settings.reduceMotion=true;
      MM.Save.data.companionsRescued=COMPANIONS.filter(c=>c.slug!=='wisp').map(c=>c.slug);
      const r=new Run({seed:322,kid:'samir'});r.region='heart';r.regionIndex=r.wings-1;r._buildMap();
      r.attach(MM.ctx);const boss=r.map.nodes.find(n=>n.type===NodeType.BOSS);r.currentNodeId=boss.id;
      r._prepareReward(boss,NodeType.BOSS,{navigate:false});await r.claimReward();
    }''')
    page.wait_for_function('MM.ctx.scenes.currentName==="narrative"&&!MM.ctx.scenes.busy',timeout=60000)
    assert page.locator('.story-page h1').inner_text()=='Wisp'
    # Let the real reward achievement finish, rather than hiding UI for capture.
    page.wait_for_function('document.querySelectorAll(".mm-ach__card").length===0',timeout=30000)
    page.screenshot(path=str(OUT/'wisp-final-reward-full.png'))
    page.get_by_role('button',name='Short version',exact=True).click()
    page.screenshot(path=str(OUT/'wisp-final-reward-short.png'))
    assert not errors,errors
    browser.close()
    print('PASS Wisp full/short final-reward captures saved; isolated fixture, zero page errors')
