"""Story presentation and real save/route checks in an isolated browser profile."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent
checks = []
def passed(text):
    checks.append(text)
    print('PASS', text, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1280,'height':800})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and '/favicon.ico' not in m.location.get('url','') else None)
    page.goto('http://localhost:8777/game/index.html#scene=title')
    page.wait_for_function('window.MM && !MM.ctx.scenes.busy', timeout=60000)
    page.evaluate('''async()=>{
      const {Run}=await import('./src/state/run.js');
      MM.Save.reset(); await MM.Save.flush(); MM.Save.settings.reduceMotion=true;
      MM.Save.data.narrative.seen['SEARCH-RECAP']=true;
      MM.ctx.run=new Run({seed:42,kid:'maya'});
      window.beforeStory=JSON.stringify(MM.Save.data.narrative);
      await MM.ctx.scenes.go('map',{}, {instant:true});
    }''')
    page.wait_for_selector('.story-frame img')
    page.wait_for_function("[...document.querySelectorAll('.story-frame img')].every(i=>i.complete&&i.naturalWidth>0)")
    assert page.locator('.story-page h1').inner_text() == 'The Forgotten Foyer'
    assert page.locator('.story-plate').inner_text().startswith('Marmalade')
    assert page.evaluate('JSON.stringify(MM.Save.data.narrative)===window.beforeStory')
    original = page.locator('.story-body').inner_text()
    passed('real Foyer route shows loaded Marmalade portrait; rendering does not mutate narrative saves')
    for width,height,large in [(1280,800,False),(1280,800,True),(1920,1080,True)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('(large)=>{document.documentElement.dataset.largeText=large?"1":"0"}', large)
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(OUT/f'foyer-{width}-{height}-large-{large}.png'))
        assert page.evaluate('''()=>[...document.querySelectorAll('.story-page button')].every(b=>{
          const r=b.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
        })''')
    passed('all controls fit at 1280x800 and 1920x1080, including large text')
    page.get_by_role('button',name='Short version',exact=True).focus()
    page.keyboard.press('Enter')
    assert page.locator('.story-body').inner_text() == 'The House offers a very elaborate welcome.'
    page.get_by_role('button',name='Read full scene',exact=True).click()
    assert page.locator('.story-body').inner_text() == original
    assert page.evaluate('JSON.stringify(MM.Save.data.narrative)===window.beforeStory')
    passed('keyboard short/full controls preserve authored text and save state')
    page.evaluate("MM.Save.blocked={reason:'test'}")
    page.get_by_role('button',name='Continue',exact=True).click()
    page.wait_for_function("document.querySelector('.story-status').textContent.includes('could not be saved')")
    assert not page.evaluate("!!MM.Save.data.narrative.seen['NR-foyer-arrival']")
    page.evaluate('MM.Save.blocked=null')
    page.get_by_role('button',name='Continue',exact=True).focus()
    page.keyboard.press('Enter')
    page.wait_for_function('MM.ctx.scenes.currentName==="map"&&!MM.ctx.scenes.busy', timeout=60000)
    assert page.evaluate("MM.Save.data.narrative.seen['NR-foyer-arrival']===true")
    page.reload()
    page.wait_for_function('window.MM && !MM.ctx.scenes.busy',timeout=60000)
    assert page.evaluate("MM.Save.data.narrative.seen['NR-foyer-arrival']===true")
    passed('failed save keeps Foyer open; retry reaches map and progress survives reload')
    page.set_viewport_size({'width':600,'height':800})
    page.evaluate('''async()=>{
      const {companionUnit}=await import('./src/state/narrative.js');
      await MM.ctx.scenes.go('narrative',{units:[companionUnit('bones')],kids:[],next:{name:'title',params:{}}},{instant:true});
    }''')
    page.wait_for_function("document.querySelector('.story-frame img').complete&&document.querySelector('.story-frame img').naturalWidth>0")
    assert page.locator('.story-plate').inner_text().startswith('Bones')
    for name in ['Short version','Continue']:
        button=page.get_by_role('button',name=name,exact=True)
        button.scroll_into_view_if_needed()
        assert button.evaluate('(b)=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}')
    assert page.evaluate("document.querySelector('.scene--narrative').scrollWidth<=innerWidth")
    page.screenshot(path=str(OUT/'narrow-bones.png'))
    page.get_by_role('button',name='Short version',exact=True).click()
    assert page.locator('.story-plate').inner_text().startswith('Bones')
    passed('narrow window scrolls without horizontal clipping; Companion introduction shows its own portrait')
    assert not errors, errors
    passed('zero game console or uncaught browser errors')
    (OUT/'result.json').write_text(json.dumps({'passed':checks,'errors':errors},indent=2)+'\n')
    browser.close()
